'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LoeweEpgSource, parseDvbServiceUuid, parseIteratorPage, BASIC_FIELDS, EXTENDED_FIELDS } = require('../lib/epg-loewe');
const { parseResponse, buildEnvelope } = require('../lib/loewe-client');
const { normalizeEvents, selectNowNext } = require('../lib/epg-data');

const NOW = Date.parse('2026-10-17T22:30:00Z');
const DAY = 86400000;
const SERVICE = { itemClass: 'video', mediaItemUuid: 'chl0:00-00080001ffff03fb283d', name: 'Das Erste HD' };
const DVB = { sid: 10301, tsid: 1019, onid: 1 };

// Literal data from Loewe Remote API 1.0.47, §9.22.1, printed page 69.
// The namespace is declared by the enclosing SOAP envelope. These five fields
// and absolute iterator counters are evidence from the manufacturer, not a
// response generated from the implementation under test.
// https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf
const DOCUMENTED_REPLY = '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" '
    + 'xmlns:m="urn:loewe.de:RemoteTV:Tablet"><SOAP-ENV:Body>'
    + '<m:CreateIteratorResponse xmlns:ltv="urn:loewe.de:RemoteTV:Tablet">'
    + '<m:fcid>?</m:fcid><m:ClientId>LRemoteClient-0-1509965273</m:ClientId>'
    + '<m:Result>0</m:Result><m:Id>1509971157234</m:Id>'
    + '<m:Rows totalResults="864" returnedResults="1" startIndex="41">'
    + '<m:Row><m:V>10301</m:V><m:V>1019</m:V><m:V>1</m:V>'
    + '<m:V>Rote Rosen (2539)</m:V><m:V>1509973800</m:V></m:Row>'
    + '</m:Rows></m:CreateIteratorResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>';

function escapeXml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function event(start = NOW - 600000, end = NOW + 600000, title = 'Laufende Sendung', eventId = String(start)) {
    return { eventId, title, subtitle: 'Folge 17', description: 'Beschreibung mit ä, & und <Zeichen>.', start, end };
}

function row(value, fields = EXTENDED_FIELDS, dvb = DVB) {
    const values = {
        2000: String(dvb.sid), 2001: String(dvb.tsid), 2002: String(dvb.onid),
        2003: value.eventId, 2004: value.title, 2005: value.subtitle, 2006: value.description,
        2007: String(value.start / 1000), 2008: value.end === null ? '' : String(value.end / 1000),
    };
    return { V: fields.map(field => values[field]) };
}

function response(events = [], { fields = EXTENDED_FIELDS, start = 0, total = events.length, result = '0', dvb = DVB } = {}) {
    return {
        xml: '',
        data: { Envelope: { Body: { CreateIteratorResponse: {
            Result: result,
            Id: 'fixture-iterator',
            Rows: {
                '@_startIndex': String(start), '@_totalResults': String(total),
                '@_returnedResults': String(events.length),
                ...(events.length ? { Row: events.map(value => row(value, fields, dvb)) } : {}),
            },
        } } } },
    };
}

function resultNode(value) { return value.data.Envelope.Body.CreateIteratorResponse; }

function makeSource(handler) {
    const calls = [];
    const source = new LoeweEpgSource({ request: async (...args) => {
        calls.push(args);
        return await handler(...args, calls.length);
    } });
    return { source, calls };
}

function fault(message, extra = {}) {
    return Object.assign(new Error(message), { code: 'SOAP', soapFault: { faultstring: message }, ...extra });
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

test('the manufacturer response is accepted with its absolute seek offset and exact five-column field mapping', () => {
    const parsed = parseResponse(DOCUMENTED_REPLY);
    const page = parseIteratorPage(parsed, BASIC_FIELDS, DVB);
    assert.deepEqual(page, {
        startIndex: 41, totalResults: 864, returnedResults: 1,
        events: [{ eventId: '', title: 'Rote Rosen (2539)', subtitle: '', description: '',
            start: 1509973800000, end: null, endEstimated: false }],
    });
    assert.throws(() => parseIteratorPage(parsed, BASIC_FIELDS, DVB, 42), { code: 'EPG_TV_INVALID' });
});

test('the initial request uses the documented time seek and keeps only the DVB triplet in table selections', async () => {
    const { source, calls } = makeSource(() => response([event()]));
    await source.read(SERVICE, { now: NOW });
    const request = parseResponse(buildEnvelope('CreateIterator', calls[0][1], 'fixture-client'))
        .data.Envelope.Body.CreateIterator;
    assert.deepEqual(request.Selections.Selection, [
        { Field: '2002', Condition: '1', Value: '1' },
        { Field: '2000', Condition: '1', Value: '10301' },
        { Field: '2001', Condition: '1', Value: '1019' },
    ]);
    assert.deepEqual(request.SeekToContentParameters, {
        Selections: { Selection: { Field: '2007', Condition: '5', Value: String((NOW - DAY) / 1000 - 1) } },
        Which: '0', Offset: '0', WindowSize: '0',
    });
    assert.deepEqual(request.QueryParameters.Range, { '@_startIndex': '0', '@_maxItems': '64' });
    assert.equal(request.NotifyUpdate, 'NO');
});

test('a seek at index 41 continues at the absolute returned offset without seeking again', async () => {
    const values = Array.from({ length: 66 }, (_, index) => event(NOW - 3600000 + index * 120000,
        NOW - 3480000 + index * 120000, `Sendung ${index}`));
    const { source, calls } = makeSource((action, xml, options, count) => count === 1
        ? response(values.slice(0, 64), { start: 41, total: 107 })
        : response(values.slice(64), { start: 105, total: 107 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events.length, 66);
    assert.equal(result.diagnostic.firstIndex, 41);
    assert.equal(result.diagnostic.totalResults, 107);
    assert.equal(result.diagnostic.rows, 66);
    assert.equal(result.diagnostic.tableComplete, true);
    assert.match(calls[0][1], /<SeekToContentParameters>/u);
    assert.match(calls[1][1], /<Range startIndex="105" maxItems="64"\/>/u);
    assert.doesNotMatch(calls[1][1], /SeekToContentParameters|<Condition>5<\/Condition>/u);
    assert.equal(calls[0][2].deadline, calls[1][2].deadline);
});

test('a short page at a nonzero seek offset advances by its real returned count', async () => {
    const values = [event(), event(NOW + 600000, NOW + 1200000, 'Danach')];
    const { source, calls } = makeSource((action, xml, options, count) => response([values[count - 1]],
        { start: 41 + count - 1, total: 43 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events.length, 2);
    assert.match(calls[1][1], /startIndex="42"/u);
    assert.equal(result.diagnostic.tableComplete, true);
});

test('the documented base schema retains absolute seek offsets after an optional-field rejection', async () => {
    const documentedNow = 1509973200000;
    const { source, calls } = makeSource((action, xml, options, count) => {
        if (count === 1) throw fault('Unsupported field 2008');
        if (count === 2) return parseResponse(DOCUMENTED_REPLY);
        return response([
            event(documentedNow + 3600000, documentedNow + 7200000, 'Danach'),
            event(documentedNow + DAY + 60000, documentedNow + DAY + 120000, 'Grenze'),
            event(documentedNow + DAY + 120000, documentedNow + DAY + 180000, 'Grenze danach'),
        ], { fields: BASIC_FIELDS, start: 42, total: 864 });
    });
    const result = await source.read(SERVICE, { now: documentedNow });
    assert.equal(result.events[0].title, 'Rote Rosen (2539)');
    assert.equal(result.events[0].start, 1509973800000);
    assert.equal(result.diagnostic.schema, 'basic');
    assert.equal(result.diagnostic.fallbackUsed, true);
    assert.equal(result.diagnostic.firstIndex, 41);
    assert.equal(result.diagnostic.pages, 2);
    assert.equal(result.diagnostic.requests, 3);
    assert.match(calls[1][1], /<SeekToContentParameters>/u);
    assert.match(calls[2][1], /startIndex="42"/u);
    assert.doesNotMatch(calls[2][1], /SeekToContentParameters/u);
});

test('a following page with a relative instead of absolute index is rejected with bounded diagnostics', async () => {
    const { source, calls } = makeSource((action, xml, options, count) => count === 1
        ? response([event()], { start: 41, total: 43 })
        : response([event(NOW + 600000, NOW + 1200000, 'Danach')], { start: 1, total: 43 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), error => {
        assert.equal(error.code, 'EPG_TV_INVALID');
        assert.equal(error.epgDiagnostic.request.startIndex, 42);
        assert.equal(error.epgDiagnostic.request.seek, false);
        assert.equal(error.epgDiagnostic.response.startIndex, 1);
        assert.equal(error.epgDiagnostic.response.result, 0);
        assert.deepEqual(error.epgDiagnostic.response.columnCounts, [9]);
        assert.ok(JSON.stringify(error.epgDiagnostic).length < 2048);
        return true;
    });
    assert.equal(calls.length, 2);
});

test('TV diagnostics carry counters and types, never raw SOAP fields or scalar contents', async () => {
    const secrets = 'PRIVATE-client-or-programme-https://example.invalid/secret';
    const replies = [response([event()]), response([], { result: secrets })];
    replies[0].data.Envelope.Body[secrets] = secrets;
    for (const reply of replies) {
        resultNode(reply).ClientId = secrets;
        resultNode(reply).Id = secrets;
        const { source } = makeSource(() => reply);
        await assert.rejects(source.read(SERVICE, { now: NOW }), error => {
            assert.ok(error.epgDiagnostic);
            const json = JSON.stringify(error.epgDiagnostic);
            assert.doesNotMatch(json, /PRIVATE|https:|Laufende Sendung/u);
            assert.ok(json.length < 2048);
            assert.deepEqual(JSON.parse(json), error.epgDiagnostic);
            return true;
        });
    }
    const { source } = makeSource(() => response([event(NOW - 60000, NOW + 60000, secrets)]));
    const result = await source.read(SERVICE, { now: NOW });
    assert.doesNotMatch(JSON.stringify(result.diagnostic), /PRIVATE|https:/u);
    assert.equal(result.events[0].title, secrets);
    assert.equal(result.diagnostic.response.result, 0);
    assert.equal(result.diagnostic.request.seek, true);
});

test('iterator IDs remain optional when NotifyUpdate NO already frees resources', async () => {
    const reply = response([event()]);
    delete resultNode(reply).Id;
    const { source } = makeSource(() => reply);
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events[0].title, 'Laufende Sendung');
    assert.equal(result.diagnostic.response.iteratorIdPresent, false);
});

test('DVB identity decodes actual user channel UUIDs without using station names or locator UUIDs', () => {
    assert.deepEqual(parseDvbServiceUuid(SERVICE.mediaItemUuid), { frontend: 8, onid: 1, tsid: 1019, sid: 10301 });
    assert.deepEqual(parseDvbServiceUuid('chl0:00-00080001ffff03f32b66'), { frontend: 8, onid: 1, tsid: 1011, sid: 11110 });
    assert.deepEqual(parseDvbServiceUuid('CHL0:00-00040001FFFF04412EE3'), { frontend: 4, onid: 1, tsid: 1089, sid: 12003 });
});

test('unknown, analog and partial service IDs fail before any TV request', async () => {
    const { source, calls } = makeSource(() => response());
    for (const mediaItemUuid of ['', 'ch2da94407-d8b9-492b-a669-7869191b8af0', 'chl0:00-00000000ffff00000000',
        'chl0:00-00080001fffe03fb283d', ' chl0:00-00080001ffff03fb283d', null, 123,
        'chl0:00-00080001ffff0000283d', 'chl0:00-00080001ffff03fb0000']) {
        await assert.rejects(source.read({ ...SERVICE, mediaItemUuid }, { now: NOW }), { code: 'EPG_TV_UNSUPPORTED' });
    }
    await assert.rejects(source.read({ ...SERVICE, itemClass: 'audio' }, { now: NOW }), { code: 'EPG_TV_UNSUPPORTED' });
    assert.equal(calls.length, 0);
});

test('the real SOAP parser and iterator source produce canonical events with UTC millisecond times', async () => {
    const current = event();
    const next = event(current.end, current.end + 1800000, 'Danach: Köln & Bonn', 'next-event');
    const rows = [current, next].map(value => '<m:Row>'
        + row(value).V.map(value => `<m:V>${escapeXml(value)}</m:V>`).join('') + '</m:Row>').join('');
    const parsed = parseResponse('<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" '
        + 'xmlns:m="urn:loewe.de:RemoteTV:Tablet"><env:Body><m:CreateIteratorResponse>'
        + '<m:Result>0</m:Result><m:Id>111</m:Id><m:Rows totalResults="2" returnedResults="2" startIndex="0">'
        + rows + '</m:Rows></m:CreateIteratorResponse></env:Body></env:Envelope>');
    const { source, calls } = makeSource(() => parsed);
    const deadline = Date.now() + 20000;
    const result = await source.read(SERVICE, { now: NOW, deadline });
    assert.deepEqual(result.events, [current, next].map(value => ({ ...value, endEstimated: false })));
    assert.equal(result.source, 'tv');
    assert.equal(result.diagnostic.schema, 'extended');
    assert.equal(result.diagnostic.complete, true);
    assert.equal(result.diagnostic.tableComplete, true);
    assert.equal(result.diagnostic.rows, 2);
    assert.equal(calls[0][0], 'CreateIterator');
    assert.deepEqual(calls[0][2], { deadline });
    const xml = calls[0][1];
    assert.match(xml, /<TableName>de\.loewe\.sl2\.epg<\/TableName><Type>0<\/Type>/u);
    assert.match(xml, /<Field>2002<\/Field><Condition>1<\/Condition><Value>1<\/Value>/u);
    assert.match(xml, /<Field>2000<\/Field><Condition>1<\/Condition><Value>10301<\/Value>/u);
    assert.match(xml, /<Field>2001<\/Field><Condition>1<\/Condition><Value>1019<\/Value>/u);
    assert.ok(xml.includes(`<Field>2007</Field><Condition>5</Condition><Value>${(NOW - DAY) / 1000 - 1}</Value>`));
    assert.match(xml, /<Orders><Order><Field>2007<\/Field><Direction>1<\/Direction><\/Order><\/Orders>/u);
    assert.match(xml, /<NotifyUpdate>NO<\/NotifyUpdate>/u);
    assert.match(xml, /<Range startIndex="0" maxItems="64"\/>/u);
    assert.doesNotMatch(xml, /Player|ZapTo|Inject|CloseIterator|ClientId|fcid/u);
});

test('an empty but well-formed EPG page is a successful empty result', async () => {
    const { source, calls } = makeSource(() => response());
    const result = await source.read(SERVICE, { now: NOW });
    assert.deepEqual(result.events, []);
    assert.equal(result.diagnostic.totalResults, 0);
    assert.equal(result.diagnostic.stopReason, 'end');
    assert.equal(calls.length, 1);
});

test('missing or zero end times remain unknown and are never inferred from the next programme', async () => {
    const first = event(NOW - 60000, null);
    const second = event(NOW + 60000, 0, 'Nächste Sendung');
    const { source } = makeSource(() => response([first, second]));
    const result = await source.read(SERVICE, { now: NOW });
    assert.deepEqual(result.events.map(value => [value.end, value.endEstimated]), [[null, false], [null, false]]);
});

test('an explicit optional-field SOAP rejection falls back once and remembers the basic schema until reset', async () => {
    const { source, calls } = makeSource((action, xml) => {
        if (xml.includes('<Field>2008</Field>')) throw fault('Unsupported field 2008');
        return response([event()], { fields: BASIC_FIELDS });
    });
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.diagnostic.schema, 'basic');
    assert.equal(result.diagnostic.fallbackUsed, true);
    assert.equal(result.diagnostic.requests, 2);
    assert.equal(result.diagnostic.pages, 1);
    assert.equal(result.events[0].end, null);
    assert.equal(result.events[0].eventId, '');
    assert.equal(result.events[0].description, '');
    assert.equal(result.events[0].title, 'Laufende Sendung');
    await source.read(SERVICE, { now: NOW });
    assert.equal(calls.length, 3);
    assert.doesNotMatch(calls[2][1], /<Field>2008<\/Field>/u);
    source.reset();
    await source.read(SERVICE, { now: NOW });
    assert.equal(calls.length, 5);
    assert.match(calls[3][1], /<Field>2008<\/Field>/u);
});

test('a consistent unsupported column shape permits a basic retry, while mixed row widths do not', async () => {
    const { source, calls } = makeSource(() => response([event()], { fields: BASIC_FIELDS }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.diagnostic.schema, 'basic');
    assert.equal(calls.length, 2);
    const malformed = response([event(), event(NOW + 60000, NOW + 120000)]);
    resultNode(malformed).Rows.Row[1].V.pop();
    const mixed = makeSource(() => malformed);
    await assert.rejects(mixed.source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
    assert.equal(mixed.calls.length, 1);
});

test('a failed basic schema is not retried or replaced with a different station', async () => {
    const { source, calls } = makeSource((action, xml) => {
        if (xml.includes('<Field>2008</Field>')) throw fault('Invalid field 2008');
        return response([event()], { fields: [2000, 2001] });
    });
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_SCHEMA' });
    assert.equal(calls.length, 2);
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_SCHEMA' });
    assert.equal(calls.length, 3);
});

test('network, authorization and ambiguous SOAP failures never cause a schema fallback', async () => {
    const failures = [
        Object.assign(new Error('Network timed out'), { code: 'NETWORK', transportCode: 'ETIMEDOUT' }),
        Object.assign(new Error('Unknown field'), { code: 'HTTP', httpStatus: 503 }),
        fault('Invalid field', { httpStatus: 401 }),
        fault('Invalid field', { httpStatus: 403 }),
        fault('Invalid field', { sessionInvalid: true }),
        fault('Permission denied for iterator field'),
        fault('Session invalid; unknown field'),
        fault('Could not create iterator'),
    ];
    for (const failure of failures) {
        const { source, calls } = makeSource(() => { throw failure; });
        await assert.rejects(source.read(SERVICE, { now: NOW }), error => error === failure);
        assert.equal(calls.length, 1);
    }
});

test('a nonzero iterator result is surfaced without guessing its undocumented error-code meaning', async () => {
    const { source, calls } = makeSource(() => response([], { result: '-1' }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
    assert.equal(calls.length, 1);
});

test('DVB triplet mismatches cannot populate another channel or trigger a fallback', async () => {
    for (const changed of [{ sid: 11110 }, { tsid: 1011 }, { onid: 133 }]) {
        const { source, calls } = makeSource(() => response([event()], { dvb: { ...DVB, ...changed } }));
        await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
        assert.equal(calls.length, 1);
    }
});

test('malformed times and backwards end times are rejected without inventing durations', async () => {
    for (const [index, value] of [[7, '1792270000junk'], [7, '1792270000.5'], [7, '-1'],
        [7, '8640000000001'], [8, 'garbage'], [8, String((NOW - 3600000) / 1000)]]) {
        const malformed = response([event()]);
        resultNode(malformed).Rows.Row[0].V[index] = value;
        const { source, calls } = makeSource(() => malformed);
        await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
        assert.equal(calls.length, 1);
    }
});

test('duplicate SOAP actions, nested scalar content and corrupt page counters are rejected', async () => {
    const changes = [
        value => { value.data.Envelope.Body.GetCurrentEventResponse = {}; },
        value => { value.data.Envelope.Body.CreateIteratorResponse = [resultNode(value), resultNode(value)]; },
        value => { resultNode(value).Rows.Row[0].V[4] = { MaliciousNestedField: 'other title' }; },
        value => { resultNode(value).Rows['@_returnedResults'] = '2'; },
        value => { resultNode(value).Rows['@_startIndex'] = '64'; },
        value => { resultNode(value).Rows['@_totalResults'] = '0'; },
        value => { delete resultNode(value).Rows['@_startIndex']; },
        value => { resultNode(value).Rows['@_totalResults'] = '9007199254740992'; },
    ];
    for (const change of changes) {
        const malformed = response([event()]);
        change(malformed);
        const { source, calls } = makeSource(() => malformed);
        await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
        assert.equal(calls.length, 1);
    }
});

test('one-row XML attributes on text fields are accepted without losing Unicode', async () => {
    const value = response([event()]);
    const node = resultNode(value);
    node.Rows.Row = node.Rows.Row[0];
    node.Rows.Row.V[4] = { '@_lang': 'de', '#text': ' Köln & Zürich ' };
    const { source } = makeSource(() => value);
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events[0].title, 'Köln & Zürich');
});

test('paging follows the actual returned count and checks total consistency', async () => {
    const values = Array.from({ length: 66 }, (_, index) => event(NOW - 3600000 + index * 120000,
        NOW - 3480000 + index * 120000, `Sendung ${index}`));
    const { source, calls } = makeSource((action, xml, options, count) => count === 1
        ? response(values.slice(0, 64), { total: 66 })
        : response(values.slice(64), { total: 66, start: 64 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events.length, 66);
    assert.equal(result.diagnostic.pages, 2);
    assert.equal(result.diagnostic.complete, true);
    assert.match(calls[1][1], /startIndex="64"/u);
});

test('a short EPG page does not imply completion before the reported total', async () => {
    const values = [event(), event(NOW + 600000, NOW + 1200000, 'Danach')];
    const { source, calls } = makeSource((action, xml, options, count) => response([values[count - 1]],
        { total: 2, start: count - 1 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events.length, 2);
    assert.match(calls[1][1], /startIndex="1"/u);
});

test('changing totals, a premature empty page, repeated rows and backwards ordering invalidate a scan', async () => {
    const first = event();
    const cases = [
        () => response([event(NOW + 600000, NOW + 1200000, 'Danach')], { start: 1, total: 3 }),
        () => response([], { start: 1, total: 2 }),
        () => response([first], { start: 1, total: 2 }),
        () => response([event(NOW - 1200000, NOW - 600000, 'Davor')], { start: 1, total: 2 }),
    ];
    for (const second of cases) {
        const { source, calls } = makeSource((action, xml, options, count) => count === 1
            ? response([first], { total: 2 }) : second());
        await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
        assert.equal(calls.length, 2);
    }
});

test('a schema change after an accepted page never restarts an inconsistent scan in basic mode', async () => {
    const { source, calls } = makeSource((action, xml, options, count) => count === 1
        ? response([event()], { total: 2 })
        : response([event(NOW + 600000, NOW + 1200000)], { fields: BASIC_FIELDS, start: 1, total: 2 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_SCHEMA' });
    assert.equal(calls.length, 2);
});

test('the 24-hour horizon stops further paging and preserves one real boundary event', async () => {
    const values = [event(), event(NOW + 600000, NOW + 1200000, 'Danach'),
        event(NOW + DAY + 1000, NOW + DAY + 60000, 'Grenze'),
        event(NOW + DAY + 60000, NOW + DAY + 120000, 'Weiter')];
    const { source, calls } = makeSource(() => response(values, { total: 999 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.deepEqual(result.events.map(value => value.title), ['Laufende Sendung', 'Danach', 'Grenze']);
    assert.equal(result.diagnostic.complete, true);
    assert.equal(result.diagnostic.tableComplete, false);
    assert.equal(result.diagnostic.stopReason, 'horizon');
    assert.equal(result.diagnostic.windowEnd, NOW + DAY);
    assert.equal(result.diagnostic.rows, 4);
    assert.equal(calls.length, 1);
});

test('same-start alternatives already returned beyond the horizon remain visible to now/next selection', async () => {
    const boundary = NOW + DAY + 1000;
    const values = [event(NOW - 60000, boundary, 'Jetzt'),
        event(boundary, boundary + 60000, 'Alternative A'),
        event(boundary, boundary + 60000, 'Alternative B'),
        event(boundary + 60000, boundary + 120000, 'Spätere Grenze')];
    for (const total of [values.length, 999]) {
        const { source, calls } = makeSource(() => response(values, { total }));
        const result = await source.read(SERVICE, { now: NOW });
        assert.deepEqual(result.events.filter(value => value.start === boundary).map(value => value.title),
            ['Alternative A', 'Alternative B']);
        const selected = selectNowNext(normalizeEvents(result.events, NOW), NOW);
        assert.equal(selected.now.title, 'Jetzt');
        assert.equal(selected.next, null);
        assert.equal(selected.ambiguous, true);
        assert.equal(result.diagnostic.tableComplete, total === values.length);
        assert.equal(calls.length, 1);
    }
});

test('the horizon cannot expose an earliest future group that may continue on an unread page', async () => {
    const boundary = NOW + DAY + 1000;
    const { source, calls } = makeSource(() => response([
        event(NOW - 60000, boundary, 'Jetzt'), event(boundary, boundary + 60000, 'Vielleicht allein'),
    ], { total: 3 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_LIMIT' });
    assert.equal(calls.length, 1);
});

test('known future ends crossing the horizon cutoff cannot hide omitted programmes from a later cache tick', async () => {
    const boundary = NOW + DAY + 1000;
    const { source, calls } = makeSource(() => response([
        event(NOW - 60000, NOW + 60000, 'Jetzt'),
        event(NOW + 60000, boundary + DAY, 'Langes zukünftiges Programm'),
        event(boundary, boundary + 60000, 'Letzte gelesene Startgruppe'),
    ], { total: 5 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_LIMIT' });
    assert.equal(calls.length, 1);
});

test('an ignored time filter is detected instead of consuming an arbitrary amount of programme history', async () => {
    const { source, calls } = makeSource(() => response([event(NOW - DAY - 1000, NOW - DAY + 1000)]));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_INVALID' });
    assert.equal(calls.length, 1);
});

test('the bounded 256-row scan reports incompleteness when current and future data are already covered', async () => {
    const values = Array.from({ length: 256 }, (_, index) => event(NOW - 3600000 + index * 300000,
        NOW - 3300000 + index * 300000, `Sendung ${index}`));
    const { source, calls } = makeSource((action, xml, options, count) => response(values.slice((count - 1) * 64, count * 64),
        { total: 512, start: (count - 1) * 64 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(calls.length, 4);
    assert.equal(result.events.length, 255);
    assert.equal(result.diagnostic.rows, 256);
    assert.equal(result.diagnostic.discardedBoundaryRows, 1);
    assert.equal(result.diagnostic.complete, false);
    assert.equal(result.diagnostic.limited, true);
    assert.equal(result.diagnostic.stopReason, 'limit');
});

test('the 256th row cannot become a unique next event while its start group may continue as row 257', async () => {
    const history = Array.from({ length: 254 }, (_, index) => event(NOW - 43200000 + index * 60000,
        NOW - 43140000 + index * 60000, `Historie ${index}`));
    const values = [...history, event(NOW - 60000, NOW + 60000, 'Jetzt'),
        event(NOW + 60000, NOW + 120000, 'Erste nächste Alternative')];
    const { source, calls } = makeSource((action, xml, options, count) => response(values.slice((count - 1) * 64, count * 64),
        { total: 257, start: (count - 1) * 64 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_LIMIT' });
    assert.equal(calls.length, 4);
});

test('a complete 256-row table keeps the entire final next group and its ambiguity', async () => {
    const history = Array.from({ length: 253 }, (_, index) => event(NOW - 43200000 + index * 60000,
        NOW - 43140000 + index * 60000, `Historie ${index}`));
    const values = [...history, event(NOW - 60000, NOW + 60000, 'Jetzt'),
        event(NOW + 60000, NOW + 120000, 'Alternative A'),
        event(NOW + 60000, NOW + 120000, 'Alternative B')];
    const { source, calls } = makeSource((action, xml, options, count) => response(values.slice((count - 1) * 64, count * 64),
        { total: 256, start: (count - 1) * 64 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.events.length, 256);
    assert.equal(result.diagnostic.tableComplete, true);
    assert.equal(result.diagnostic.discardedBoundaryRows, 0);
    const selected = selectNowNext(normalizeEvents(result.events, NOW), NOW);
    assert.equal(selected.now.title, 'Jetzt');
    assert.equal(selected.next, null);
    assert.equal(selected.ambiguous, true);
    assert.equal(calls.length, 4);
});

test('a known future end crossing the four-page cutoff is rejected before it can become falsely unique now later', async () => {
    const history = Array.from({ length: 252 }, (_, index) => event(NOW - 43200000 + index * 60000,
        NOW - 43140000 + index * 60000, `Historie ${index}`));
    const values = [...history, event(NOW - 60000, NOW + 60000, 'Jetzt'),
        event(NOW + 60000, NOW + DAY, 'Langes nächstes Programm'),
        event(NOW + 120000, NOW + 150000, 'Gegenbeleg'),
        event(NOW + 180000, NOW + 210000, 'Letzte gelesene Gruppe')];
    const { source, calls } = makeSource((action, xml, options, count) => response(values.slice((count - 1) * 64, count * 64),
        { total: 300, start: (count - 1) * 64 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_LIMIT' });
    assert.equal(calls.length, 4);
});

test('truncation before the next event is reached fails clearly rather than claiming a complete now/next result', async () => {
    const values = Array.from({ length: 256 }, (_, index) => event(NOW - 43200000 + index * 60000,
        NOW - 43140000 + index * 60000, `Alte Sendung ${index}`));
    const { source, calls } = makeSource((action, xml, options, count) => response(values.slice((count - 1) * 64, count * 64),
        { total: 512, start: (count - 1) * 64 }));
    await assert.rejects(source.read(SERVICE, { now: NOW }), { code: 'EPG_TV_LIMIT' });
    assert.equal(calls.length, 4);
});

test('at most four pages are requested even when the TV returns only one row per page', async () => {
    const { source, calls } = makeSource((action, xml, options, count) => response([
        event(NOW + (count - 2) * 60000, NOW + (count - 1) * 60000, `Sendung ${count}`),
    ], { total: 10, start: count - 1 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.diagnostic.rows, 4);
    assert.equal(result.diagnostic.pages, 4);
    assert.equal(result.diagnostic.limited, true);
    assert.equal(calls.length, 4);
});

test('expired deadlines and already-aborted operations cause no TV requests', async () => {
    const { source, calls } = makeSource(() => response());
    await assert.rejects(source.read(SERVICE, { now: NOW, deadline: Date.now() - 1 }), { code: 'EPG_TV_LIMIT' });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(source.read(SERVICE, { now: NOW, signal: controller.signal }), { code: 'CLOSED' });
    assert.equal(calls.length, 0);
});

test('aborting a pending operation settles promptly and ignores its late reply', async () => {
    const waiting = deferred();
    const { source, calls } = makeSource(() => waiting.promise);
    const controller = new AbortController();
    const pending = source.read(SERVICE, { now: NOW, signal: controller.signal });
    await Promise.resolve();
    const rejection = assert.rejects(pending, { code: 'CLOSED' });
    controller.abort();
    await rejection;
    waiting.resolve(response([event()], { total: 2 }));
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(source._pending.size, 0);
});

test('reset cancels in-flight reads and leaves the next session able to try extended fields again', async () => {
    const waiting = deferred();
    const { source, calls } = makeSource((action, xml, options, count) => count === 1 ? waiting.promise : response());
    const pending = source.read(SERVICE, { now: NOW });
    await Promise.resolve();
    const rejection = assert.rejects(pending, { code: 'CLOSED' });
    source.reset();
    await rejection;
    waiting.resolve(response([event()], { total: 2 }));
    const result = await source.read(SERVICE, { now: NOW });
    assert.equal(result.diagnostic.schema, 'extended');
    assert.equal(calls.length, 2);
    assert.equal(source._pending.size, 0);
});

test('an unresponsive callback cannot outlive the supplied total deadline or start a fallback', async () => {
    const { source, calls } = makeSource(() => new Promise(() => {}));
    await assert.rejects(source.read(SERVICE, { now: NOW, deadline: Date.now() + 30 }), { code: 'EPG_TV_LIMIT' });
    assert.equal(calls.length, 1);
    assert.equal(source._pending.size, 0);
});

test('a very long caller deadline is capped to a 30-second sender budget', async () => {
    const { source, calls } = makeSource(() => response());
    const before = Date.now();
    await source.read(SERVICE, { now: NOW, deadline: before + 86400000 });
    assert.ok(calls[0][2].deadline >= before + 30000);
    assert.ok(calls[0][2].deadline <= Date.now() + 30000);
});

test('invalid time options and arbitrary signal objects are rejected before the request boundary', async () => {
    const { source, calls } = makeSource(() => response());
    for (const options of [{ now: NaN }, { now: 1.5 }, { now: -1 }, { deadline: Infinity },
        { now: 8640000000000001 }, { signal: {} }, { signal: { aborted: false } }]) {
        await assert.rejects(source.read(SERVICE, options), { code: 'EPG_TV_INVALID' });
    }
    assert.equal(calls.length, 0);
});
