'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const { loadXmltv, parseXmltvTime, xmltvSourceKey, XMLTV_LIMITS } = require('../lib/epg-xmltv');
const { normalizeEvents, selectNowNext } = require('../lib/epg-data');

const NOW = Date.parse('2026-10-19T12:30:00Z');
const HOUR = 3600000;
const TV = { id: 'channels.tv.ZDF_HD', name: 'ZDF HD', itemClass: 'video' };
const SECOND = { id: 'channels.tv.Das_Erste_HD', name: 'Das Erste HD', itemClass: 'video' };
const URL = 'https://guide.example/guide.xml?token=private-query-value';
const DEFINITION = '<channel id="zdf"><display-name>ZDF HD</display-name></channel>';
const stamp = value => new Date(value).toISOString().replace(/[-:T]/gu, '').slice(0, 14) + ' +0000';
const programme = (title, start = NOW - HOUR / 2, end = NOW + HOUR / 2, channel = 'zdf', extra = '') =>
    `<programme channel="${channel}" start="${stamp(start)}"${end === null ? '' : ` stop="${stamp(end)}"`}${extra}><title>${title}</title></programme>`;
const guide = (programmes = programme('Jetzt'), channels = DEFINITION) => `<tv>${channels}${programmes}</tv>`;

function response(bytes, { status = 200, headers = {}, chunk = 17 } = {}) {
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    return { status, headers, body: Readable.from((function* () {
        for (let start = 0; start < data.length; start += chunk) yield data.subarray(start, start + chunk);
    })()) };
}

function read(bytes = guide(), options = {}) {
    const { responseOptions, ...rest } = options;
    return loadXmltv(URL, { services: [TV], now: NOW, fetchImpl: async () => response(bytes, responseOptions), ...rest });
}
const events = result => result.eventsByChannel.get(TV.id);

test('streaming UTF-8 XMLTV retains selected metadata, multilingual text and a stable source identity', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE tv SYSTEM "xmltv.dtd"><tv>'
        + '<channel id="zdf"><display-name>ZDF HD</display-name><display-name lang="en">Second HD</display-name>'
        + '<icon src="https://icons.example/zdf.svg"/></channel>'
        + '<programme channel="zdf" start="20261019140000 +0200" stop="20261019150000 +0200">'
        + '<title lang="en">News</title><title lang="de">Grüße &amp; Neues</title><sub-title>Folge 1</sub-title>'
        + '<desc><![CDATA[Öffentliches Fernsehen – 🎬]]></desc></programme></tv>';
    const result = await read(xml, { responseOptions: { chunk: 1 } });
    assert.equal(result.source, 'xmltv');
    assert.equal(result.fetchedAt, NOW);
    assert.match(result.sourceKey, /^[a-f0-9]{64}$/u);
    assert.equal(result.sourceKey, xmltvSourceKey(URL));
    assert.deepEqual(result.channels, [{ id: 'zdf', names: ['ZDF HD', 'Second HD'], iconUrl: 'https://icons.example/zdf.svg' }]);
    assert.equal(result.mappings[0].iconUrl, 'https://icons.example/zdf.svg');
    assert.deepEqual(events(result).map(({ eventId, ...event }) => event), [{ title: 'Grüße & Neues', subtitle: 'Folge 1',
        description: 'Öffentliches Fernsehen – 🎬', start: NOW - HOUR / 2, end: NOW + HOUR / 2 }]);
    assert.equal(result.stats.wireBytes, Buffer.byteLength(xml));
    assert.equal(result.stats.decodedBytes, Buffer.byteLength(xml));
    assert.equal(JSON.stringify(result).includes('private-query-value'), false);
});

test('gzip is supported by header and by magic bytes, including split headers and bounded decoded chunks', async () => {
    const xml = guide(programme('München – 🎬'));
    const compressed = gzipSync(Buffer.from(xml));
    for (const headers of [{}, { 'content-encoding': 'gzip' }, { 'content-encoding': 'x-gzip' }]) {
        const result = await read(compressed, { responseOptions: { headers, chunk: 1 }, limits: { chunkBytes: 3 } });
        assert.equal(events(result)[0].title, 'München – 🎬');
        assert.equal(result.stats.wireBytes, compressed.length);
        assert.equal(result.stats.decodedBytes, Buffer.byteLength(xml));
    }
});

test('timestamps use explicit offsets through DST and default to UTC instead of local time', () => {
    assert.equal(parseXmltvTime('20261025023000 +0200'), Date.parse('2026-10-25T00:30:00Z'));
    assert.equal(parseXmltvTime('20261025023000 +0100'), Date.parse('2026-10-25T01:30:00Z'));
    assert.equal(parseXmltvTime('202610191200 -0330'), Date.parse('2026-10-19T15:30:00Z'));
    for (const suffix of ['', ' UTC', ' GMT', ' Z']) {
        assert.equal(parseXmltvTime('20261019120000' + suffix), Date.parse('2026-10-19T12:00:00Z'));
    }
    // This is the timezone example defined by XMLTV's own DTD.
    assert.equal(parseXmltvTime('200007281733 BST'), Date.parse('2000-07-28T16:33:00Z'));
    assert.equal(parseXmltvTime('202402291200'), Date.parse('2024-02-29T12:00:00Z'));
});

test('imprecise, impossible or ambiguous dates are rejected instead of estimating clock times', () => {
    for (const value of [undefined, '', '2026', '20261019', '2026101912', '2026101912000',
        '202602291200', '202613011200', '202604311200', '202610192400', '202610191260',
        '20261019120060', '202610191200 +2400', '202610191200 +0160', '202610191200 CET',
        '202610191200 America/New_York', '202610191200 +02:00']) {
        assert.throws(() => parseXmltvTime(value), { code: 'XMLTV_TIME' }, String(value));
    }
});

test('missing stops remain unknown after a later programme, and IDs survive order changes', async () => {
    const first = programme('Unbekanntes Ende', NOW - HOUR / 2, null);
    const second = programme('Später', NOW + HOUR / 2, NOW + HOUR);
    const a = events(await read(guide(first + second)));
    const b = events(await read(guide(second + first)));
    assert.deepEqual(a, b);
    assert.equal(a[0].end, null);
    assert.match(a[0].eventId, /^xmltv:[a-f0-9]{64}$/u);
    assert.notEqual(a[0].eventId, a[1].eventId);
    assert.equal(selectNowNext(normalizeEvents(a, NOW), NOW).now, null);
});

test('only selected mapped services and intersecting intervals retain programmes', async () => {
    const xml = guide(programme('Abgelaufen', NOW - 3 * HOUR, NOW - HOUR)
        + programme('Über den Fensterrand', NOW - 2 * HOUR, NOW + HOUR)
        + programme('Am Ende', NOW + HOUR, NOW + 2 * HOUR)
        + '<programme channel="other" start="not a time"><title>Ungewählt</title></programme>',
    DEFINITION + '<channel id="other"><display-name>Other</display-name></channel>');
    const result = await read(xml, { windowStart: NOW - HOUR, windowEnd: NOW + HOUR,
        manualMappings: { 'channels.tv.Unselected': 'other' } });
    assert.deepEqual([...result.eventsByChannel.keys()], [TV.id]);
    assert.deepEqual(events(result).map(value => value.title), ['Über den Fensterrand']);
    assert.equal(result.stats.programmes, 4);
    assert.equal(result.stats.retainedEvents, 1);
});

test('cutting the date window preserves the last unknown-start group when it contradicts a long overlapping interval', async () => {
    const long = programme('Langer bekannter Eintrag', NOW - 4 * HOUR, NOW + HOUR);
    const latest = programme('Mögliche Ablösung A', NOW - 2 * HOUR, null)
        + programme('Mögliche Ablösung B', NOW - 2 * HOUR, null);
    const older = programme('Älter', NOW - 3 * HOUR, null);
    for (const data of [long + older + latest, latest + long + older]) {
        const result = await read(guide(data), { windowStart: NOW - HOUR, windowEnd: NOW + HOUR });
        assert.equal(events(result).length, 3);
        assert.equal(events(result).some(value => value.title === 'Älter'), false);
        assert.equal(selectNowNext(normalizeEvents(events(result), NOW), NOW).ambiguous, true);
        assert.equal(selectNowNext(normalizeEvents(events(result), NOW), NOW).now, null);
    }
    const irrelevant = await read(guide(older + programme('Jetzt')), { windowStart: NOW - HOUR, windowEnd: NOW + HOUR });
    assert.deepEqual(events(irrelevant).map(value => value.title), ['Jetzt']);
    assert.equal(irrelevant.stats.retainedEvents, 1);
});

test('optional channel definitions support explicit manual IDs without guessing undeclared names', async () => {
    const result = await read(guide(programme('Manuell'), ''), { manualMappings: { [TV.id]: 'zdf' } });
    assert.deepEqual(result.channels, [{ id: 'zdf', names: [] }]);
    assert.equal(result.mappings[0].status, 'manual');
    assert.equal(events(result)[0].title, 'Manuell');
    assert.equal((await read(guide(programme('Kein Namensbeleg'), ''))).eventsByChannel.has(TV.id), false);
});

test('unmatched, ambiguous, missing and explicitly disabled services never silently receive feed events', async () => {
    const ambiguous = guide(programme('A'), DEFINITION + '<channel id="duplicate"><display-name>ZDF HD</display-name></channel>');
    for (const options of [{ bytes: ambiguous }, { manualMappings: { [TV.id]: '' } },
        { manualMappings: { [TV.id]: 'missing' } }, { services: [SECOND] }]) {
        const { bytes = guide(), ...rest } = options;
        const result = await read(bytes, rest);
        assert.equal(result.eventsByChannel.size, 0);
        assert.equal(result.stats.retainedEvents, 0);
    }
    const empty = await read(guide(''));
    assert.deepEqual(events(empty), []);
    assert.equal(empty.mappings[0].status, 'automatic');
});

test('duplicate programmes deduplicate exactly, while clumped alternatives retain distinct IDs', async () => {
    const one = programme('Identisch');
    assert.equal(events(await read(guide(one + one))).length, 1);
    const alternatives = await read(guide(programme('Gleicher Titel', NOW, NOW + HOUR, 'zdf', ' clumpidx="0/2"')
        + programme('Gleicher Titel', NOW, NOW + HOUR, 'zdf', ' clumpidx="1/2"')));
    assert.equal(events(alternatives).length, 2);
    assert.notEqual(events(alternatives)[0].eventId, events(alternatives)[1].eventId);
    assert.equal(selectNowNext(normalizeEvents(events(alternatives), NOW), NOW).ambiguous, true);
    await assert.rejects(read(guide(one + one.replace('</title>', '</title><desc>Widerspruch</desc>'))), { code: 'XMLTV_INVALID_XML' });
});

test('an XMLTV empty guide is valid and unsafe icon sources are never fetched or retained', async () => {
    assert.deepEqual((await read('<tv/>')).channels, []);
    let calls = 0;
    const result = await read(guide('', '<channel id="zdf"><display-name>ZDF HD</display-name>'
        + '<icon src="https://user:password@private.example/image"/><icon src="file:///secret"/>'
        + '<icon src="http://icons.example/zdf.png"/></channel>'), {
        fetchImpl: async () => { calls++; return response(guide('', '<channel id="zdf"><display-name>ZDF HD</display-name>'
            + '<icon src="https://user:password@private.example/image"/><icon src="file:///secret"/>'
            + '<icon src="http://icons.example/zdf.png"/></channel>')); },
    });
    assert.equal(calls, 1);
    assert.equal(result.channels[0].iconUrl, 'http://icons.example/zdf.png');
});

test('DTD/entity expansion, duplicate attributes and malformed document structure fail closed', async () => {
    const invalid = [
        '<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///secret">]><tv/>',
        '<!DOCTYPE tv [<!ENTITY x "expanded">]><tv/>',
        '<!DOCTYPE other><tv/>', '<!DOCTYPE tv><!DOCTYPE tv><tv/>', '<tv/><tv/>',
        '<tv><channel id="zdf" id="other"><display-name>ZDF HD</display-name></channel></tv>',
        '<tv xmlns="urn:unrecognized"/>', '<tv><unknown/></tv>', '<tv x="<"/>',
        guide('', DEFINITION + DEFINITION), '<tv><channel id="zdf"/></tv>',
        '<tv>' + programme('X') + DEFINITION + '</tv>', '<tv>', '<tv/>outside',
        guide(programme('&unrecognized;')), guide(programme('&#0;')), guide(programme('&#xD800;')),
        guide(programme('<b>Nested</b>')), '<?xml version="1.0" encoding="ISO-8859-1"?><tv/>',
        '<?xml version="1.1"?><tv/>', '<?xml version="1.0"?><tv><?xml version="1.0"?></tv>',
        '<!-- before declaration --><?xml version="1.0"?><tv/>', '<![CDATA[ ]]><tv/>',
        '<tv> ]]></tv>', '<tv>unexpected text</tv>',
    ];
    for (const xml of invalid) {
        await assert.rejects(read(xml), error => /^XMLTV_(?:INVALID_XML|ENCODING)$/u.test(error.code), xml);
    }
    // The lexical checks must distinguish real markup from escaped/literal
    // content and recognize delimiters even when every byte arrives separately.
    const legal = guide(programme('Escaped &lt; &amp; &gt;')).replace('<tv>', '<!-- < x="<" ]]> --><?custom a="<"?><tv x="&lt;">');
    assert.equal(events(await read(legal, { responseOptions: { chunk: 1 }, limits: { chunkBytes: 1 } }))[0].title, 'Escaped < & >');
});

test('selected invalid times and missing titles never manufacture programmes', async () => {
    for (const xml of [guide(programme('Reverse', NOW, NOW - HOUR)), guide(programme('Zero', NOW, NOW)),
        guide('<programme channel="zdf" start="20261019120000 +0000"/>'),
        guide('<programme channel="zdf" start="2026"><title>Too vague</title></programme>')]) {
        await assert.rejects(read(xml), error => ['XMLTV_TIME', 'XMLTV_INVALID_XML'].includes(error.code));
    }
});

test('invalid UTF-8 and truncated or contradictory transport lengths are rejected', async () => {
    await assert.rejects(read(Buffer.concat([Buffer.from('<tv>'), Buffer.from([0xc3, 0x28]), Buffer.from('</tv>')])), { code: 'XMLTV_INVALID_XML' });
    await assert.rejects(read(Buffer.concat([Buffer.from('<tv/>'), Buffer.from([0xc3])])), { code: 'XMLTV_INVALID_XML' });
    await assert.rejects(read('<tv/>', { responseOptions: { headers: { 'content-length': '6' } } }), { code: 'XMLTV_NETWORK' });
    const truncated = gzipSync(Buffer.from(guide())).subarray(0, -8);
    await assert.rejects(read(truncated), { code: 'XMLTV_NETWORK' });
    await assert.rejects(read('<tv/>', { responseOptions: { headers: { 'content-encoding': 'br' } } }), { code: 'XMLTV_ENCODING' });
});

test('wire, inflated, metadata, programme and retained-event budgets abort instead of silently truncating', async () => {
    const cases = [
        ['<tv/>', { wireBytes: 4 }], [gzipSync(Buffer.from(guide())), { decodedBytes: 100 }],
        [guide(), { metadataBytes: 100 }], [guide(programme('A') + programme('B')), { programmes: 1 }],
        [guide(programme('A') + programme('B')), { eventsPerChannel: 1 }],
        [guide(programme('A') + programme('B')), { retainedEvents: 1 }], [guide(), { retainedBytes: 50 }],
        [guide('', DEFINITION + '<channel id="second"><display-name>Second</display-name></channel>'), { channels: 1 }],
    ];
    for (const [xml, limits] of cases) await assert.rejects(read(xml, { limits }), { code: 'XMLTV_LIMIT' }, JSON.stringify(limits));
    await assert.rejects(read('<tv/>', { responseOptions: { headers: { 'content-length': String(XMLTV_LIMITS.wireBytes + 1) } } }), { code: 'XMLTV_LIMIT' });
    await assert.rejects(read(guide(programme('x'.repeat(1025)))), { code: 'XMLTV_LIMIT' });
    await assert.rejects(read('<tv><channel id="zdf"><display-name>ZDF HD</display-name><metadata>'
        + '<nested>'.repeat(40) + '</nested>'.repeat(40) + '</metadata></channel></tv>'), { code: 'XMLTV_LIMIT' });
});

test('relative redirects preserve configured source identity and dispose intermediate bodies', async () => {
    const seen = [];
    const intermediate = response('', { status: 302, headers: { location: '/new/guide.xml' } });
    const result = await read(undefined, { fetchImpl: async (url, options) => {
        seen.push(url.href);
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers['Accept-Encoding'], 'gzip');
        return seen.length === 1 ? intermediate : response(guide());
    } });
    assert.deepEqual(seen, [URL, 'https://guide.example/new/guide.xml']);
    assert.equal(intermediate.body.destroyed, true);
    assert.equal(result.sourceKey, xmltvSourceKey(URL));
    assert.equal(events(result)[0].title, 'Jetzt');
});

test('bad redirects and HTTP errors cannot disclose URL secrets or trigger retries', async () => {
    for (const location of ['http://downgrade.example/guide.xml', 'file:///secret', 'https://user:password@elsewhere.example/feed', '']) {
        let calls = 0;
        await assert.rejects(read(undefined, { fetchImpl: async () => { calls++; return response('', { status: 302, headers: { location } }); } }),
            error => ['XMLTV_REDIRECT', 'XMLTV_URL'].includes(error.code) && !/private-query-value|password|downgrade/u.test(error.message));
        assert.equal(calls, 1);
    }
    let calls = 0;
    await assert.rejects(read(undefined, { fetchImpl: async () => { calls++; return response('', { status: 302, headers: { location: '/loop' } }); },
        limits: { redirects: 1 } }), { code: 'XMLTV_REDIRECT' });
    assert.equal(calls, 2);
    await assert.rejects(read(undefined, { fetchImpl: async () => response('', { status: 503 }) }), { code: 'XMLTV_HTTP' });
    await assert.rejects(read(undefined, { fetchImpl: async () => { throw new Error(URL); } }),
        error => error.code === 'XMLTV_NETWORK' && !error.message.includes('private-query-value'));
});

test('configuration validation completes before download and source hashes do not expose addresses', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return response('<tv/>'); };
    for (const url of ['', 'file:///guide.xml', 'https://user:secret@guide.example/file', 'https://guide.example/white space',
        'https://guide.example/\nsecret', undefined]) {
        await assert.rejects(loadXmltv(url, { services: [TV], now: NOW, fetchImpl }), { code: 'XMLTV_URL' });
    }
    await assert.rejects(read(undefined, { fetchImpl, manualMappings: [{ channel: TV.id, xmltvId: 'a' }, { channel: TV.id, xmltvId: 'b' }] }), { code: 'XMLTV_MAPPING' });
    await assert.rejects(read(undefined, { fetchImpl, windowEnd: NOW + 3 * 24 * HOUR }), { code: 'XMLTV_TIME' });
    await assert.rejects(read(undefined, { fetchImpl, limits: { wireBytes: XMLTV_LIMITS.wireBytes + 1 } }), { code: 'XMLTV_LIMIT' });
    assert.equal(calls, 0);
    assert.equal(xmltvSourceKey('https://GUIDE.example:443/a#unused'), xmltvSourceKey('https://guide.example/a'));
    assert.notEqual(xmltvSourceKey(URL), xmltvSourceKey(URL + 'different'));
});

test('deadlines bound a transport which never answers and late response bodies are disposed', async () => {
    // A referenced watchdog lets the deliberately unref'ed production deadline
    // fire even though the injected transport owns no socket or other handle.
    const watchdog = setTimeout(() => {}, 1000);
    let release;
    try {
        const pending = read(undefined, { limits: { timeout: 15 }, fetchImpl: () => new Promise(resolve => { release = resolve; }) });
        await assert.rejects(pending, { code: 'XMLTV_TIMEOUT' });
        const late = response(guide());
        release(late);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(late.body.destroyed, true);
    } finally { clearTimeout(watchdog); }
});

test('an explicit deadline and cancellation apply before requests and during a noncooperative stream', async () => {
    let calls = 0;
    await assert.rejects(read(undefined, { deadline: Date.now() - 1, fetchImpl: async () => { calls++; return response(guide()); } }), { code: 'XMLTV_TIMEOUT' });
    const cancelled = new AbortController();
    cancelled.abort(new Error('secret caller detail'));
    await assert.rejects(read(undefined, { signal: cancelled.signal, fetchImpl: async () => { calls++; return response(guide()); } }), { code: 'XMLTV_ABORTED' });
    assert.equal(calls, 0);
    const controller = new AbortController();
    let destroyed = false;
    const body = { [Symbol.asyncIterator]() { return this; }, next: () => new Promise(() => {}),
        return: () => new Promise(() => {}), destroy() { destroyed = true; } };
    const pending = read(undefined, { signal: controller.signal, fetchImpl: async () => ({ status: 200, headers: {}, body }) });
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(pending, { code: 'XMLTV_ABORTED' });
    assert.equal(destroyed, true);
});

test('deadline still aborts after headers and the first streamed bytes without waiting for iterator cleanup', async () => {
    const watchdog = setTimeout(() => {}, 1000);
    let reads = 0;
    let destroyed = false;
    const body = { [Symbol.asyncIterator]() { return this; }, next() {
        return ++reads === 1 ? Promise.resolve({ value: Buffer.from('<tv>'), done: false }) : new Promise(() => {});
    }, return: () => new Promise(() => {}), destroy() { destroyed = true; } };
    try {
        await assert.rejects(read(undefined, { limits: { timeout: 20 }, fetchImpl: async () => ({ status: 200, headers: {}, body }) }), { code: 'XMLTV_TIMEOUT' });
        assert.ok(reads >= 2);
        assert.equal(destroyed, true);
    } finally { clearTimeout(watchdog); }
});
