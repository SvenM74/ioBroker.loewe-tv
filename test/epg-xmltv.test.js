'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { loadXmltv, resolveXmltvChannel, parseXmltvTime, XMLTV_LIMITS } = require('../lib/epg-xmltv');
const { normalizeEvents, selectNowNext } = require('../lib/epg-data');

const NOW = Date.UTC(2026, 9, 18, 12);
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const URL = 'https://guide.example.invalid/guide.xml?token=do-not-log';

function timestamp(ms) { return new Date(ms).toISOString().replace(/[-:TZ]/gu, '').slice(0, 14) + ' +0000'; }
function programme(title, start = NOW - 60000, end = NOW + 60000, channel = 'DasErste.de@SD', extra = '') {
    return `<programme channel="${channel}" start="${timestamp(start)}"${end === null ? '' : ` stop="${timestamp(end)}"`}>
        <title lang="de">${title}</title>${extra}</programme>`;
}
function definition(id = 'DasErste.de@SD', name = 'Das Erste') {
    return `<channel id="${id}"><display-name>${name}</display-name></channel>`;
}
function document(content = programme('Aktuell')) { return `<?xml version="1.0" encoding="UTF-8"?><tv>${definition()}${content}</tv>`; }
function response(value, headers = {}, status = 200, chunkSize = 1700) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return { status, headers, body: Readable.from((function* () {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) yield bytes.subarray(offset, offset + chunkSize);
    })()) };
}
function load(value, options = {}, headers = {}, chunkSize) {
    return loadXmltv(URL, { now: NOW, ...options, fetchImpl: async () => response(value, headers, 200, chunkSize) });
}
async function timeline(programmes) {
    const feed = await load(document(programmes.join('')));
    const events = feed.channels.get('DasErste.de@SD').events;
    const cached = normalizeEvents(events, NOW);
    return { events, at: time => selectNowNext(cached, time) };
}
function consecutiveFuture(count) {
    return Array.from({ length: count }, (_, index) => programme(`Future ${index + 1}`,
        NOW + (index + 1) * MINUTE, NOW + (index + 2) * MINUTE));
}

test('XMLTV preserves exact feed IDs, decodes XML text, selects German fields and orders events', async () => {
    const feed = await load(document(programme('Danach', NOW + 60000, NOW + 120000)
        + programme('Aktuell &amp; heute', NOW - 60000, NOW + 60000, 'DasErste.de@SD',
            '<title lang="en">Wrong language</title><sub-title lang="de">Folge 1</sub-title>'
            + '<desc lang="en">English</desc><desc lang="de"><![CDATA[Beschreibung <als Text> 😀]]></desc>')));
    assert.ok(feed.channels instanceof Map);
    assert.ok(feed.fetchedAt > 0);
    const channel = feed.channels.get('DasErste.de@SD');
    assert.deepEqual(channel.names, ['Das Erste']);
    assert.deepEqual(channel.events.map(event => event.title), ['Aktuell & heute', 'Danach']);
    assert.equal(channel.events[0].subtitle, 'Folge 1');
    assert.equal(channel.events[0].description, 'Beschreibung <als Text> 😀');
    assert.equal(channel.events[0].start, NOW - 60000);
    assert.equal(channel.events[0].end, NOW + 60000);
    assert.equal(channel.events[0].endEstimated, false);
    assert.match(channel.events[0].eventId, /^xmltv:[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(channel).sort(), ['events', 'id', 'names']);
});

test('XMLTV handles a UTF-8 character split between network chunks', async () => {
    const feed = await load(document(programme('Ä Ö 😀')), {}, {}, 1);
    assert.equal(feed.channels.get('DasErste.de@SD').events[0].title, 'Ä Ö 😀');
});

test('XMLTV prefers German over previously seen English and otherwise a language-less text', async () => {
    const value = '<tv><programme channel="id" start="20261018115900">'
        + '<title lang="en">English</title><title>Ohne Sprache</title><title lang="de-DE">Deutsch</title>'
        + '<desc lang="en">English</desc><desc>Neutral</desc></programme></tv>';
    const event = (await load(value)).channels.get('id').events[0];
    assert.equal(event.title, 'Deutsch');
    assert.equal(event.description, 'Neutral');
});

test('XMLTV timestamps apply numeric offsets and UTC when no offset is present', () => {
    assert.equal(parseXmltvTime('20261018140000 +0200'), NOW);
    assert.equal(parseXmltvTime('20261018073000 -0430'), NOW);
    assert.equal(parseXmltvTime('20261018120000'), NOW);
    assert.equal(parseXmltvTime('202610181200 UTC'), NOW);
    assert.equal(parseXmltvTime('20261018120000 +0000'), NOW);
    assert.equal(parseXmltvTime('20240229010203'), Date.UTC(2024, 1, 29, 1, 2, 3));
});

test('XMLTV timestamps never normalize invalid days, clocks or offsets', () => {
    for (const value of ['20260229010000', '20260431000000', '20260001000000', '20261301000000',
        '20260100235900', '20261018240000', '20261018126000', '20261018120060',
        '20261018120000 +2460', '20261018120000 +0060', '20261018120000 Europe/Berlin',
        '20261018', 'not a time']) {
        assert.throws(() => parseXmltvTime(value), { code: 'XMLTV_TIME' });
    }
});

test('XMLTV detects the autumn clock-change offset without using the host timezone', () => {
    assert.equal(parseXmltvTime('20261025023000 +0100') - parseXmltvTime('20261025023000 +0200'), 3600000);
});

test('XMLTV missing stop uses only the next actual start for that same sender', async () => {
    const feed = await load('<tv>' + programme('Letzte', NOW + 180000, null, 'a')
        + programme('Andere Quelle', NOW, NOW + 1000, 'b')
        + programme('Aktuell', NOW - 60000, null, 'a')
        + programme('Danach', NOW + 60000, null, 'a') + '</tv>');
    const events = feed.channels.get('a').events;
    assert.deepEqual(events.map(event => [event.end, event.endEstimated]), [
        [NOW + 60000, true], [NOW + 180000, true], [null, false],
    ]);
});

test('XMLTV keeps only relevant past evidence and the nearest 64 future events even in reverse order', async () => {
    let xml = '<tv>';
    for (let offset = 100; offset >= -100; offset--) xml += programme(String(offset), NOW + offset * 60000, null, 'a');
    xml += '</tv>';
    const events = (await load(xml)).channels.get('a').events;
    assert.equal(events.length, 65);
    assert.equal(events[0].title, '0');
    assert.equal(events.at(-1).title, '64');
    assert.equal(events.at(-1).end, NOW + 65 * 60000);
    assert.equal(events.at(-1).endEstimated, true);
    const cached = normalizeEvents(events, NOW);
    assert.equal(selectNowNext(cached, NOW).now.title, '0');
    assert.equal(selectNowNext(cached, NOW).next.title, '1');
    assert.equal(selectNowNext(cached, NOW + 63 * MINUTE).now.title, '63');
    assert.equal(selectNowNext(cached, NOW + 63 * MINUTE).next.title, '64');
    assert.deepEqual(selectNowNext(cached, NOW + 65 * MINUTE), { now: null, next: null, ambiguous: false });
});

test('XMLTV excludes expired history and starts beyond the 48-hour future horizon', async () => {
    const before = NOW - XMLTV_LIMITS.lookback - 1;
    const after = NOW + XMLTV_LIMITS.future + 1000;
    const feed = await load('<tv>' + programme('Zu alt', before, before + 1)
        + programme('Aktuell') + programme('Zu weit', after, after + 60000) + '</tv>');
    assert.deepEqual(feed.channels.get('DasErste.de@SD').events.map(event => event.title), ['Aktuell']);
});

test('XMLTV does not lose a current overlap behind 64 more recent past starts', async () => {
    const programmes = [programme('Long-running', NOW - 120 * MINUTE, NOW + 120 * MINUTE),
        ...Array.from({ length: 63 }, (_, index) => {
            const start = NOW - (64 - index) * MINUTE;
            return programme(`Ended ${index}`, start, start + MINUTE / 2);
        }), programme('Recent current', NOW - MINUTE, NOW + MINUTE)];
    for (const ordered of [programmes, [...programmes].reverse()]) {
        const result = await timeline(ordered);
        assert.equal(result.events.length, 2);
        assert.deepEqual(result.at(NOW), { now: null, next: null, ambiguous: true });
        assert.equal(result.at(NOW + 2 * MINUTE).now.title, 'Long-running');
        assert.equal(result.at(NOW + 121 * MINUTE).now, null);
    }
});

test('XMLTV discards a complete future boundary start group rather than inventing a unique next programme', async () => {
    const programmes = [...consecutiveFuture(63),
        programme('Tied A', NOW + 64 * MINUTE, NOW + 65 * MINUTE),
        programme('Tied B', NOW + 64 * MINUTE, NOW + 65 * MINUTE)];
    for (const ordered of [programmes, [...programmes].reverse()]) {
        const result = await timeline(ordered);
        assert.equal(result.events.length, 63);
        assert.equal(result.at(NOW).next.title, 'Future 1');
        assert.equal(result.at(NOW + 63 * MINUTE).now.title, 'Future 63');
        assert.equal(result.at(NOW + 63 * MINUTE).next, null);
        assert.equal(result.at(NOW + 64.5 * MINUTE).now, null);
        assert.ok(result.events.every(event => !event.title.startsWith('Tied')));
    }
});

test('XMLTV rejects a retained known end that would outlive omitted future overlap evidence', async () => {
    const programmes = [programme('Long future', NOW + MINUTE, NOW + 100 * MINUTE),
        ...consecutiveFuture(64).slice(1),
        programme('Hidden current', NOW + 65 * MINUTE, NOW + 66 * MINUTE)];
    for (const ordered of [programmes, [...programmes].reverse()]) {
        await assert.rejects(async () => {
            const result = await timeline(ordered);
            result.at(NOW + 65.5 * MINUTE);
        }, { code: 'XMLTV_LIMIT' });
    }
});

test('XMLTV missing-stop groups never use a distant horizon witness after their actual successor was truncated', async () => {
    for (const prefixLength of [62, 63]) {
        const programmes = [...consecutiveFuture(prefixLength),
            programme('No stop A', NOW + 64 * MINUTE, null),
            programme('No stop B', NOW + 64 * MINUTE, null),
            programme('Actual following', NOW + 65 * MINUTE, NOW + 66 * MINUTE),
            programme('Beyond horizon', NOW + 49 * HOUR, NOW + 50 * HOUR)];
        for (const ordered of [programmes, [...programmes].reverse()]) {
            const result = await timeline(ordered);
            assert.equal(result.at(NOW).next.title, 'Future 1');
            const group = result.events.filter(event => event.title.startsWith('No stop'));
            if (prefixLength === 62) {
                assert.equal(group.length, 2);
                assert.ok(group.every(event => event.end === NOW + 65 * MINUTE && event.endEstimated));
                assert.deepEqual(result.at(NOW + 64.5 * MINUTE), { now: null, next: null, ambiguous: true });
            } else assert.equal(group.length, 0);
            assert.deepEqual(result.at(NOW + 65.5 * MINUTE), { now: null, next: null, ambiguous: false });
        }
    }
});

test('XMLTV retains explicitly current intervals even when their start is older than the lookback', async () => {
    const programmes = [programme('Old but current', NOW - 25 * HOUR, NOW + MINUTE),
        programme('Recent current', NOW - MINUTE, NOW + MINUTE)];
    for (const ordered of [programmes, [...programmes].reverse()]) {
        const result = await timeline(ordered);
        assert.equal(result.events.length, 2);
        assert.deepEqual(result.at(NOW), { now: null, next: null, ambiguous: true });
        assert.equal(result.at(NOW + MINUTE).now, null);
    }
});

test('XMLTV can trim before a long future group when an earlier complete prefix is safe', async () => {
    const programmes = [...consecutiveFuture(63),
        programme('Long final', NOW + 64 * MINUTE, NOW + 100 * MINUTE),
        programme('Omitted overlap', NOW + 65 * MINUTE, NOW + 66 * MINUTE)];
    const result = await timeline(programmes);
    assert.equal(result.events.length, 63);
    assert.equal(result.at(NOW + 63 * MINUTE).now.title, 'Future 63');
    assert.equal(result.at(NOW + 63 * MINUTE).next, null);
    assert.equal(result.at(NOW + 65.5 * MINUTE).now, null);
});

test('XMLTV rejects more than 64 mandatory running, unknown-current or earliest-future alternatives', async () => {
    const fixtures = [
        Array.from({ length: 65 }, (_, index) => programme(`Running ${index}`, NOW - (index + 1) * MINUTE, NOW + MINUTE)),
        Array.from({ length: 65 }, (_, index) => programme(`Unknown ${index}`, NOW - MINUTE, null)),
        Array.from({ length: 65 }, (_, index) => programme(`Next ${index}`, NOW + MINUTE, NOW + 2 * MINUTE)),
    ];
    for (const programmes of fixtures) {
        await assert.rejects(async () => {
            const result = await timeline(programmes);
            result.at(NOW);
            result.at(NOW + MINUTE);
        }, { code: 'XMLTV_LIMIT' });
    }
});

test('XMLTV can discard an oversized later group after an earlier future programme arrives out of order', async () => {
    const programmes = [...Array.from({ length: 65 }, (_, index) =>
        programme(`Later ${index}`, NOW + 2 * MINUTE, NOW + 3 * MINUTE)),
    programme('First', NOW + MINUTE, NOW + 2 * MINUTE)];
    const result = await timeline(programmes);
    assert.deepEqual(result.events.map(event => event.title), ['First']);
    assert.equal(result.at(NOW).next.title, 'First');
    assert.equal(result.at(NOW + MINUTE).now.title, 'First');
    assert.equal(result.at(NOW + 2 * MINUTE).now, null);
});

test('XMLTV uses expired past successors to retire missing stops without retaining their history', async () => {
    const programmes = [programme('Unknown old end', NOW - 4 * HOUR, null),
        programme('Ended successor', NOW - 3 * HOUR, NOW - 2 * HOUR),
        programme('Future', NOW + HOUR, NOW + 2 * HOUR)];
    for (const ordered of [programmes, [...programmes].reverse()]) {
        const result = await timeline(ordered);
        assert.deepEqual(result.events.map(event => event.title), ['Future']);
        assert.equal(result.at(NOW).now, null);
        assert.equal(result.at(NOW).next.title, 'Future');
        assert.equal(result.at(NOW + HOUR / 2).now, null);
        assert.equal(result.at(NOW + HOUR).now.title, 'Future');
    }
});

test('XMLTV does not promote ancient unknown ends but retains them when they contradict an older current interval', async () => {
    const old = programme('Ancient unknown', NOW - 25 * HOUR, null);
    const future = programme('Future', NOW + MINUTE, NOW + 2 * MINUTE);
    const alone = await timeline([old, future]);
    assert.deepEqual(alone.events.map(event => event.title), ['Future']);
    assert.equal(alone.at(NOW).now, null);
    const result = await timeline([programme('Older known current', NOW - 30 * HOUR, NOW + MINUTE), old, future]);
    const unknown = result.events.find(event => event.title === 'Ancient unknown');
    assert.equal(unknown.end, null);
    assert.equal(unknown.endEstimated, false);
    assert.equal(result.at(NOW).now, null);
    assert.equal(result.at(NOW).ambiguous, true);
    assert.equal(result.at(NOW + MINUTE).now.title, 'Future');
});

test('XMLTV identical duplicate programmes are retained once with a stable event ID', async () => {
    const value = programme('Gleiche Sendung');
    const a = (await load(document(value + value))).channels.get('DasErste.de@SD').events;
    const b = (await load(document(value))).channels.get('DasErste.de@SD').events;
    assert.equal(a.length, 1);
    assert.equal(a[0].eventId, b[0].eventId);
    await assert.rejects(load(document(value + programme('Gleiche Sendung', NOW - 60000, NOW + 120000))), { code: 'XMLTV_INVALID_XML' });
});

test('XMLTV standard external DTD is accepted without requesting its URL', async () => {
    const calls = [];
    const feed = await loadXmltv(URL, { now: NOW, fetchImpl: async url => {
        calls.push(String(url));
        return response('<!DOCTYPE tv SYSTEM "http://must-not-be-requested.invalid/xmltv.dtd"><tv>' + programme('Titel') + '</tv>');
    } });
    assert.equal(feed.channels.size, 1);
    assert.deepEqual(calls, [URL]);
});

test('XMLTV rejects HTML, internal entities, unknown entities and incomplete documents', async () => {
    for (const value of [
        '<!DOCTYPE html><html><body>Access denied</body></html>',
        '<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///etc/passwd">]><tv/>',
        '<!DOCTYPE tv [<!ENTITY x "expanded">]><tv/>',
        '<tv><programme channel="a" start="20261018120000"><title>&unknown;</title></programme></tv>',
        '<tv><programme',
        '<tv/><tv/>',
        '<tv><channel id="a"><display-name>X</display-name></channel>',
    ]) await assert.rejects(load(value), { code: 'XMLTV_INVALID_XML' });
});

test('XMLTV rejects invalid dates and inverted intervals in programme attributes', async () => {
    await assert.rejects(load('<tv><programme channel="a" start="20260229000000"><title>x</title></programme></tv>'), { code: 'XMLTV_TIME' });
    await assert.rejects(load(document(programme('Inverted', NOW, NOW - 1000))), { code: 'XMLTV_TIME' });
});

test('XMLTV accepts repeated equal channel definitions but rejects conflicting IDs', async () => {
    const feed = await load(`<tv>${definition()}${definition()}${programme('Titel')}</tv>`);
    assert.equal(feed.channels.size, 1);
    await assert.rejects(load(`<tv>${definition()}${definition('DasErste.de@SD', 'ZDF')}</tv>`), { code: 'XMLTV_INVALID_XML' });
});

test('XMLTV programmes may identify channels without a channel definition', async () => {
    const feed = await load(`<tv>${programme('Titel', NOW, null, 'channel-without-definition')}</tv>`);
    assert.deepEqual(feed.channels.get('channel-without-definition').names, []);
    const service = { id: 'channels.tv.ZDF_HD', name: 'ZDF HD' };
    assert.equal(resolveXmltvChannel(feed, service).channel, null);
    assert.equal(resolveXmltvChannel(feed, service, [{ channel: service.id, xmltvId: 'channel-without-definition' }]).channel.id,
        'channel-without-definition');
});

test('XMLTV rejects non-UTF-8 declarations and malformed UTF-8 byte sequences', async () => {
    await assert.rejects(load('<?xml version="1.0" encoding="ISO-8859-1"?><tv/>'), { code: 'XMLTV_INVALID_XML' });
    await assert.rejects(load(Buffer.concat([Buffer.from('<tv>'), Buffer.from([0xc3, 0x28]), Buffer.from('</tv>')])), { code: 'XMLTV_INVALID_XML' });
});

test('XMLTV reads gzip with and without Content-Encoding, including split magic bytes', async () => {
    const compressed = gzipSync(document());
    for (const headers of [{ 'content-encoding': 'gzip' }, {}]) {
        const feed = await load(compressed, {}, headers, 1);
        assert.equal(feed.channels.get('DasErste.de@SD').events[0].title, 'Aktuell');
    }
    await assert.rejects(load(document(), {}, { 'content-encoding': 'br' }), { code: 'XMLTV_ENCODING' });
    await assert.rejects(load(Buffer.from([0x1f, 0x8b, 0x08, 0x00]), {}, { 'content-encoding': 'gzip' }), { code: 'XMLTV_NETWORK' });
});

test('XMLTV stops before an oversized advertised body and during an oversized actual download', async () => {
    await assert.rejects(load('<tv/>', {}, { 'content-length': String(XMLTV_LIMITS.wireBytes + 1) }), { code: 'XMLTV_LIMIT' });
    await assert.rejects(load(Buffer.alloc(XMLTV_LIMITS.wireBytes + 1, 32)), { code: 'XMLTV_LIMIT' });
});

test('XMLTV applies a separate expansion limit to gzip data', async () => {
    const compressed = gzipSync(Buffer.concat([Buffer.from('<tv>'), Buffer.alloc(XMLTV_LIMITS.decodedBytes, 32), Buffer.from('</tv>')]));
    await assert.rejects(load(compressed), { code: 'XMLTV_LIMIT' });
});

test('XMLTV has a per-field limit rather than retaining arbitrarily long descriptions', async () => {
    await assert.rejects(load(document(programme('Titel', NOW, null, 'a', '<desc>' + 'x'.repeat(16385) + '</desc>'))), { code: 'XMLTV_LIMIT' });
});

test('XMLTV follows up to three redirects, closes old bodies and rejects a fourth', async () => {
    const bodies = [];
    let calls = 0;
    const feed = await loadXmltv(URL, { now: NOW, fetchImpl: async url => {
        const value = response(calls++ < 3 ? '' : document(), calls <= 3 ? { location: '/other.xml' } : {}, calls <= 3 ? 302 : 200);
        bodies.push(value.body);
        assert.equal(new globalThis.URL(url).protocol, 'https:');
        return value;
    } });
    assert.equal(calls, 4);
    assert.equal(feed.channels.size, 1);
    assert.ok(bodies.every(body => body.destroyed));
    calls = 0;
    await assert.rejects(loadXmltv(URL, { fetchImpl: async () => {
        calls++;
        return response('', { location: '/again.xml' }, 302);
    } }), { code: 'XMLTV_REDIRECT' });
    assert.equal(calls, 4);
});

test('XMLTV rejects unsupported URLs and does not reveal query tokens in HTTP or network errors', async () => {
    for (const url of ['file:///private.xml', 'ftp://somewhere/file', 'invalid', 'http://name:secret@example.invalid/']) {
        await assert.rejects(loadXmltv(url), { code: 'XMLTV_URL' });
    }
    await assert.rejects(loadXmltv(URL, { fetchImpl: async () => response('', {}, 403) }), error => {
        assert.equal(error.code, 'XMLTV_HTTP');
        assert.doesNotMatch(error.message, /token|do-not-log|example/iu);
        return true;
    });
    await assert.rejects(loadXmltv(URL, { fetchImpl: async () => { throw new Error(URL); } }), error => {
        assert.equal(error.code, 'XMLTV_NETWORK');
        assert.doesNotMatch(error.message, /token|do-not-log|example/iu);
        return true;
    });
    await assert.rejects(loadXmltv(URL, { fetchImpl: async () => response('', { location: 'file:///secret' }, 302) }), { code: 'XMLTV_URL' });
});

test('XMLTV aborts before the first request and while waiting for response headers', async () => {
    const before = new AbortController();
    before.abort(new Error('Private external reason'));
    let calls = 0;
    await assert.rejects(loadXmltv(URL, { signal: before.signal, fetchImpl: async () => { calls++; } }), { code: 'XMLTV_ABORTED' });
    assert.equal(calls, 0);
    const during = new AbortController();
    const loading = loadXmltv(URL, { signal: during.signal, fetchImpl: async () => { calls++; return new Promise(() => {}); } });
    await nextTurn();
    during.abort(new Error('Private external reason'));
    await assert.rejects(loading, error => error.code === 'XMLTV_ABORTED' && !error.message.includes('Private'));
    assert.equal(calls, 1);
});

test('XMLTV aborts during the initial byte read even if an injected transport ignores the signal', async () => {
    const controller = new AbortController();
    const loading = loadXmltv(URL, { signal: controller.signal,
        fetchImpl: async () => ({ status: 200, headers: {}, body: { [Symbol.asyncIterator]() { return this; }, next() { return new Promise(() => {}); } } }),
    });
    await nextTurn();
    controller.abort();
    await assert.rejects(loading, { code: 'XMLTV_ABORTED' });
});

test('XMLTV parsing yields so unload can abort a large response during parsing', async () => {
    const controller = new AbortController();
    const bytes = Buffer.from(document(programme('Titel').repeat(10000)));
    const loading = load(bytes, { signal: controller.signal }, {}, bytes.length);
    await nextTurn();
    controller.abort();
    await assert.rejects(loading, { code: 'XMLTV_ABORTED' });
});

test('XMLTV observes an already expired deadline without a request', async () => {
    let called = false;
    await assert.rejects(loadXmltv(URL, { deadline: Date.now() - 1, fetchImpl: async () => { called = true; } }), { code: 'XMLTV_TIMEOUT' });
    assert.equal(called, false);
});

test('XMLTV native HTTP transport accepts a LAN-style endpoint and closes a stalled socket on abort', async t => {
    let stalled;
    const server = http.createServer((request, reply) => {
        if (request.url === '/stall') { stalled = reply; reply.writeHead(200); reply.write('<tv>'); }
        else if (request.url === '/redirect') { reply.writeHead(302, { location: '/guide.xml.gz' }); reply.end(); }
        else { reply.writeHead(200, { 'content-type': 'application/gzip' }); reply.end(gzipSync(document())); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const feed = await loadXmltv(`${base}/redirect`, { now: NOW });
    assert.equal(feed.channels.get('DasErste.de@SD').events[0].title, 'Aktuell');
    const controller = new AbortController();
    const loading = loadXmltv(`${base}/stall`, { now: NOW, signal: controller.signal });
    for (let i = 0; i < 100 && !stalled; i++) await nextTurn();
    assert.ok(stalled);
    const closed = new Promise(resolve => stalled.once('close', resolve));
    controller.abort();
    await assert.rejects(loading, { code: 'XMLTV_ABORTED' });
    await closed;
    assert.ok(stalled.destroyed);
});

test('XMLTV native HTTP deadline covers stalled body reads', async t => {
    const server = http.createServer((_request, reply) => { reply.writeHead(200); reply.write('<'); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    await assert.rejects(loadXmltv(`http://127.0.0.1:${server.address().port}`, { deadline: Date.now() + 100 }), { code: 'XMLTV_TIMEOUT' });
});

test('XMLTV resolution prioritizes exact folder ID over an explicit station-name mapping', async () => {
    const feed = await load('<tv>' + definition('a', 'Das Erste') + definition('b', 'ZDF') + '</tv>');
    const service = { id: 'channels.tv.Das_Erste_HD', name: 'Das Erste HD' };
    const selected = resolveXmltvChannel(feed, service, [
        { channel: service.name, xmltvId: 'b' }, { channel: service.id, xmltvId: 'a' },
    ]);
    assert.equal(selected.channel.id, 'a');
});

test('XMLTV resolution does not guess after an unknown or conflicting explicit mapping', async () => {
    const feed = await load('<tv>' + definition('a', 'ZDF HD') + definition('b', 'ZDF') + '</tv>');
    const service = { id: 'channels.tv.ZDF_HD', name: 'ZDF HD' };
    const missing = resolveXmltvChannel(feed, service, [{ channel: service.id, xmltvId: 'unknown' }]);
    assert.equal(missing.channel, null);
    assert.match(missing.error, /nicht vorhanden/u);
    assert.equal(resolveXmltvChannel(feed, service, [
        { channel: service.id, xmltvId: 'a' }, { channel: service.id, xmltvId: 'b' },
    ]).channel, null);
});

test('XMLTV automatic mapping uses only NFC, whitespace and case, preserving HD and regional suffixes', async () => {
    const feed = await load('<tv>' + definition('a', 'WDR Köln HD') + definition('b', 'Das Erste') + '</tv>');
    assert.equal(resolveXmltvChannel(feed, { name: ' WDR   Ko\u0308ln hd ' }).channel.id, 'a');
    assert.equal(resolveXmltvChannel(feed, { name: 'Das Erste HD' }).channel, null);
    assert.equal(resolveXmltvChannel(feed, { name: 'WDR Bonn HD' }).channel, null);
    assert.equal(resolveXmltvChannel(feed, { name: 'ARD' }).channel, null);
});

test('XMLTV automatic mapping rejects two distinct IDs with the same normalized display-name', async () => {
    const feed = await load('<tv>' + definition('a', 'ZDF') + definition('b', 'zdf') + '</tv>');
    assert.equal(resolveXmltvChannel(feed, { name: 'ZDF' }).channel, null);
    assert.equal(resolveXmltvChannel(feed, { name: 'ZDF' }, [{ channel: 'ZDF', xmltvId: 'b' }]).channel.id, 'b');
});

test('XMLTV mapping validates its structure and empty XMLTV documents return no channels', async () => {
    const feed = await load('<tv/>');
    assert.equal(feed.channels.size, 0);
    for (const mappings of [null, {}, [{ channel: '', xmltvId: 'a' }], [{ channel: 'x', xmltvId: '' }]]) {
        assert.equal(resolveXmltvChannel(feed, { id: 'channels.tv.x', name: 'x' }, mappings).channel, null);
    }
});
