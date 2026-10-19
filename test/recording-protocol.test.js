'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
    LoeweClient, buildEnvelope, buildTimerParameters, parseResponse,
    parseTimerTimestamp, parseTimerList, parseProgramTimerResult, ProtocolError,
} = require('../lib/loewe-client');
const { templates } = require('../docs/protocol-templates.json');

const LOCATOR = 'channel://2:ch-fixture-tv:slc-fixture-list';
const START = Date.parse('2026-10-25T00:30:00Z');
const END = Date.parse('2026-10-25T02:00:00Z');
const REQUEST = { locator: LOCATOR, start: START, end: END };

// Response fixtures are synthetic. Field names come from the original App's
// parser, but the user's TV has not supplied a recorded timer response yet.
function response(action, contents = '') {
    return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:m="urn:loewe.de:RemoteTV:Tablet">`
        + `<s:Body><m:${action}Response>${contents}</m:${action}Response></s:Body></s:Envelope>`;
}

function entry(overrides = {}) {
    const values = {
        EntryUuid: 'timer-fixture-1', EntryTitle: 'A &amp; B', Start: '2026-10-25T02:30:00+02:00',
        End: '2026-10-25T03:00:00+01:00', Attributes: 'unknown-flags', SourceName: 'TV HD',
        SourceUuid: 'ch-fixture-tv', SourceAncestorUuid: 'slc-fixture-list', ...overrides,
    };
    return '<m:ResultTimerList>' + Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `<m:${key}>${value}</m:${key}>`).join('') + '</m:ResultTimerList>';
}

function list(contents, attributes = 'totalResults="1"') {
    return parseTimerList(parseResponse(response('GetTimerList',
        `<m:ResultTimerListFragment ${attributes}>${contents}</m:ResultTimerListFragment>`)));
}

function transport(replies, hooks = {}) {
    const calls = [];
    return {
        calls,
        request(options, onResponse) {
            hooks.onCreate?.(options);
            const request = new EventEmitter();
            request.destroy = () => { request.destroyed = true; };
            request.end = body => {
                const call = { options, body: body.toString('utf8'), request };
                calls.push(call);
                hooks.afterWrite?.(call);
                const reply = replies.shift();
                if (reply === null) return;
                queueMicrotask(() => {
                    if (reply instanceof Error) return request.emit('error', reply);
                    const incoming = new EventEmitter();
                    incoming.statusCode = 200;
                    incoming.headers = {};
                    incoming.destroy = () => { incoming.destroyed = true; };
                    onResponse(incoming);
                    incoming.emit('data', Buffer.from(reply || response('Unexpected')));
                    incoming.emit('end');
                });
            };
            return request;
        },
    };
}

test('timer requests exactly match the extracted original App XML templates', () => {
    for (const [action, parameters, replacements] of [
        ['ProgramTimer', buildTimerParameters(REQUEST), ['', 'fixture-client', 'PVR', 'default', LOCATOR,
            String(START / 1000), '5400', '0']],
        ['GetTimerList', '', ['', 'fixture-client']],
    ]) {
        const template = templates.find(item => item.action === action);
        assert.ok(template, 'The golden template must be present in the original extraction.');
        let index = 0;
        const expected = template.exact_xml_template.replace(/%s/gu, () => replacements[index++]);
        assert.equal(index, replacements.length);
        assert.equal(buildEnvelope(action, parameters, 'fixture-client'), expected);
    }
});

test('one-time timers preserve the exact locator and UTC duration through the autumn clock change', () => {
    assert.equal(buildTimerParameters(REQUEST), '<Device>PVR</Device><RecordingType>default</RecordingType>'
        + `<Locator>${LOCATOR}</Locator><Timer starttime="1792888200" duration="5400" repeatDays="0"/>`);
    const escaped = buildTimerParameters({ ...REQUEST, locator: 'channel://001:ch-A&B:slc-a\'"<>' });
    assert.match(escaped, /<Locator>channel:\/\/001:ch-A&amp;B:slc-a&apos;&quot;&lt;&gt;<\/Locator>/u);
});

test('invalid or unsupported recording arguments are rejected before any TV request', async t => {
    const mock = transport([]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 50 }, mock);
    t.after(() => client.close());
    for (const value of [
        null, [], {}, { ...REQUEST, device: 'NAS' }, { ...REQUEST, repeatDays: 1 },
        { ...REQUEST, start: START + 1 }, { ...REQUEST, end: END - 1 },
        { ...REQUEST, start: String(START) }, { ...REQUEST, start: -1000 },
        { ...REQUEST, end: START }, { ...REQUEST, end: START - 1000 },
        { ...REQUEST, end: NaN }, { ...REQUEST, end: Infinity },
        { ...REQUEST, end: 2147483648000 }, { ...REQUEST, locator: 'https://other.test/' },
        { ...REQUEST, locator: 'channel://2:missing-ancestor' },
        { ...REQUEST, locator: 'channel://2:ch-fixture:slc-fixture\n' },
        { ...REQUEST, locator: 'channel://9007199254740993:ch-fixture:slc-fixture' },
        { ...REQUEST, locator: 'channel://2:ch-\ud800:slc-fixture' },
    ]) {
        await assert.rejects(client.programTimer(value), { code: 'VALIDATION', recordingNotSent: true });
    }
    assert.equal(mock.calls.length, 0);
});

test('timer date parser reads explicit ISO zones, leap days and millisecond fractions without host timezone assumptions', () => {
    assert.equal(parseTimerTimestamp('2026-10-25T02:30:00+02:00'), START);
    assert.equal(parseTimerTimestamp('2026-10-25T02:30:00+01:00'), START + 3600000);
    assert.equal(parseTimerTimestamp('2026-10-25T03:00:00+01:00'), END);
    assert.equal(parseTimerTimestamp('2026-10-24T19:30:00-05:00'), START);
    assert.equal(parseTimerTimestamp('2026-10-25T00:30:00.1Z'), START + 100);
    assert.equal(parseTimerTimestamp('2026-10-25T00:30:00.001+00:00'), START + 1);
    assert.equal(parseTimerTimestamp('2028-02-29T00:00:00Z'), Date.parse('2028-02-29T00:00:00Z'));
});

test('ambiguous units, omitted zones, invalid calendars and precision loss are not guessed', () => {
    for (const value of [
        null, undefined, START, String(START), String(START / 1000), '', '25.10.2026 02:30',
        '2026-10-25T02:30:00', '2026-10-25 00:30:00Z', '2026-10-25T02:30:00-00:00',
        '2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-00-10T00:00:00Z',
        '2026-13-01T00:00:00Z', '2026-10-25T24:00:00Z', '2026-10-25T00:60:00Z',
        '2026-10-25T00:30:60Z', '2026-10-25T00:30:00+14:01', '2026-10-25T00:30:00+01:60',
        '2026-10-25T00:30:00.0001Z', '2026-10-25T00:30:00Zsuffix',
    ]) assert.equal(parseTimerTimestamp(value), null, String(value));
});

test('full timer snapshots retain opaque attributes and direct source identity', () => {
    const result = list(entry(), 'totalResults="1" returnedResults="1" startIndex="0"');
    assert.deepEqual(result, {
        recognized: true, complete: true, comparable: true, totalResults: 1, returnedResults: 1, startIndex: 0,
        timers: [{
            id: 'timer-fixture-1', title: 'A & B', start: START, end: END,
            startRaw: '2026-10-25T02:30:00+02:00', endRaw: '2026-10-25T03:00:00+01:00',
            attributes: 'unknown-flags', sourceName: 'TV HD', sourceUuid: 'ch-fixture-tv',
            sourceAncestorUuid: 'slc-fixture-list', matchable: true,
        }], result: null,
    });
});

test('additional text metadata leaves the known timer identity and comparison intact', () => {
    const expected = list(entry());
    for (const extras of [
        { SyntheticExtra: 'firmware-specific metadata' },
        { SyntheticExtra: '', AnotherExtra: '0' },
        { SyntheticExtra: '<![CDATA[<Start>untrusted text</Start>]]>' },
    ]) assert.deepEqual(list(entry(extras)), expected);
    const attributed = entry().replace('</m:ResultTimerList>',
        '<m:SyntheticExtra unit="opaque">metadata</m:SyntheticExtra></m:ResultTimerList>');
    assert.deepEqual(list(attributed), expected);
    const incomplete = list(entry({ Start: undefined, SyntheticExtra: '2026-10-25T00:30:00Z' }));
    assert.equal(incomplete.timers[0].start, null, 'Extra metadata cannot replace a missing known field.');
    assert.equal(incomplete.comparable, false);
});

test('an explicitly empty timer list is complete; empty/missing count metadata is not invented', () => {
    assert.equal(list('', 'totalResults="0"').comparable, true);
    assert.deepEqual(list('', 'totalResults="0"').timers, []);
    assert.equal(list('', '').complete, false);
    assert.equal(list('', '').comparable, false);
    assert.equal(list('', 'totalResults="1"').complete, false);
    assert.throws(() => list('', 'totalResults=""'), { code: 'INVALID_RESPONSE' });
    assert.throws(() => parseTimerList(parseResponse(response('GetTimerList'))), { code: 'INVALID_RESPONSE' });
});

test('timer snapshots with missing, ambiguous or reversed times are kept but cannot prove absence', () => {
    for (const values of [
        { Start: '1792888200', End: '1792893600' }, { Start: '2026-10-25T02:30:00' },
        { Start: undefined }, { End: undefined }, { End: '2026-10-25T00:00:00Z' },
        { SourceUuid: '' }, { EntryUuid: '' },
    ]) {
        const result = list(entry(values));
        assert.equal(result.timers.length, 1, 'Never hide uninterpretable timer entries.');
        assert.equal(result.complete, true, 'Completeness counts entries; comparable checks interpretation.');
        assert.equal(result.comparable, false);
        assert.equal(result.timers[0].matchable, false);
    }
});

test('partial snapshots and unknown total count are never advertised as complete', () => {
    for (const attributes of ['totalResults="3"', 'totalResults="3" startIndex="2"', '']) {
        const result = list(entry(), attributes);
        assert.equal(result.complete, false);
        assert.equal(result.comparable, false);
        assert.equal(result.timers[0].matchable, true);
    }
});

test('duplicate identifiers, incompatible counts and unrelated nested fields reject the timer snapshot', () => {
    for (const [contents, attributes] of [
        [entry() + entry(), 'totalResults="2"'],
        [entry(), 'totalResults="0"'], [entry(), 'totalResults="1" returnedResults="2"'],
        [entry(), 'totalResults="1" startIndex="1"'], [entry(), 'totalResults="-1"'],
        [entry(), 'totalResults="9007199254740993"'],
        [`<Unknown>${entry()}</Unknown>`, 'totalResults="0"'],
        [entry({ SourceUuid: '<Other>ch-fixture-tv</Other>' }), 'totalResults="1"'],
        [entry({ Extra: '<Start>hidden timer data</Start>' }), 'totalResults="1"'],
        [entry({ Extra: 'first</m:Extra><m:Extra>second' }), 'totalResults="1"'],
        [entry().replace('</m:ResultTimerList>', 'unexpected text</m:ResultTimerList>'), 'totalResults="1"'],
        [entry({ EntryUuid: '</m:EntryUuid><m:EntryUuid>duplicate' }), 'totalResults="1"'],
    ]) assert.throws(() => list(contents, attributes), {
        code: 'INVALID_RESPONSE', action: 'GetTimerList', timerListInvalid: true,
    });
});

test('unsupported timer metadata reports its field name without exposing its contents', () => {
    assert.throws(() => list(entry({ SyntheticExtra: '<Details>private fixture value</Details>' })), error => {
        assert.equal(error.timerListInvalid, true);
        assert.match(error.message, /SyntheticExtra/u);
        assert.doesNotMatch(error.message, /private fixture value/u);
        return true;
    });
});

test('timer parsers do not borrow a result from another SOAP operation', () => {
    const mixed = parseResponse('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'
        + '<ProgramTimerResponse/><GetTimerListResponse><ResultTimerListFragment totalResults="0"/></GetTimerListResponse>'
        + '</s:Body></s:Envelope>');
    assert.throws(() => parseProgramTimerResult(mixed), { code: 'INVALID_RESPONSE' });
    for (const invalid of [mixed, parseResponse(response('GetChannelList')), parseResponse(response('GetTimerList', 'invalid body'))]) {
        assert.throws(() => parseTimerList(invalid), error => {
            assert.equal(error.code, 'INVALID_RESPONSE');
            assert.equal(error.timerListInvalid, undefined, 'Only a validated GetTimerList response may retain connectivity.');
            return true;
        });
    }
    assert.throws(() => parseProgramTimerResult(parseResponse(response('ZapToMedia', '<Result>0</Result>'))), { code: 'INVALID_RESPONSE' });
});

test('ProgramTimer acknowledgements preserve unknown result codes without claiming confirmation', () => {
    for (const [contents, result] of [
        ['', null], ['<Result>0</Result>', '0'], ['<Result>17</Result>', '17'],
        ['<Result>BUSY</Result>', 'BUSY'], ['<Result/>', ''],
    ]) assert.deepEqual(parseProgramTimerResult(parseResponse(response('ProgramTimer', contents))), {
        acknowledged: true, confirmed: false, result,
    });
    assert.throws(() => parseProgramTimerResult(parseResponse(response('ProgramTimer',
        '<Result>0</Result><Result>1</Result>'))), { code: 'INVALID_RESPONSE' });
});

test('client wrappers pass the deadline, perform exactly one write and read the normalized timer list', async t => {
    const mock = transport([
        response('RequestAccess', '<ClientId>fixture-client</ClientId>'),
        response('ProgramTimer'), response('GetTimerList', '<ResultTimerListFragment totalResults="1">' + entry() + '</ResultTimerListFragment>'),
    ]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 1000 }, mock);
    t.after(() => client.close());
    const options = { deadline: Date.now() + 1000 };
    assert.equal((await client.programTimer(REQUEST, options)).confirmed, false);
    assert.equal((await client.getTimerList(options)).timers[0].id, 'timer-fixture-1');
    assert.equal(mock.calls.length, 3);
    assert.equal(mock.calls[1].body, buildEnvelope('ProgramTimer', buildTimerParameters(REQUEST), 'fixture-client') + '\0');
    assert.equal(mock.calls[2].body, buildEnvelope('GetTimerList', '', 'fixture-client') + '\0');
    assert.equal(mock.calls[1].options.headers.SOAPAction, '"urn:loewe.de:RemoteTV:Tablet#ProgramTimer"');
    await assert.rejects(client.programTimer(REQUEST, { deadline: Date.now() - 1 }), { code: 'NETWORK' });
    assert.equal(mock.calls.length, 3, 'Expired commands must not touch the TV.');
});

test('timeout after sending a recording never retries and preserves the affected SOAP action', async t => {
    const mock = transport([response('RequestAccess', '<ClientId>fixture-client</ClientId>'), null]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 10 }, mock);
    t.after(() => client.close());
    await assert.rejects(client.programTimer(REQUEST), error => {
        assert.equal(error.code, 'NETWORK');
        assert.equal(error.action, 'ProgramTimer');
        assert.equal(error.transportCode, 'ETIMEDOUT');
        assert.notEqual(error.recordingNotSent, true);
        return true;
    });
    assert.equal(mock.calls.length, 2);
    assert.equal(mock.calls[1].request.destroyed, true);
});

test('SOAP faults and transport failures never become recording acknowledgements', async t => {
    const soapFault = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'
        + '<s:Fault><faultcode>s:Server</faultcode><faultstring>No recorder</faultstring></s:Fault></s:Body></s:Envelope>';
    const mock = transport([response('RequestAccess', '<ClientId>fixture-client</ClientId>'), soapFault,
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' })]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 1000 }, mock);
    t.after(() => client.close());
    await assert.rejects(client.programTimer(REQUEST), { code: 'SOAP', action: 'ProgramTimer' });
    await assert.rejects(client.programTimer(REQUEST), { code: 'NETWORK', action: 'ProgramTimer', transportCode: 'ECONNRESET' });
    assert.equal(mock.calls.length, 3);
});

test('invalid, cancelled or stale send guards cannot submit a recording or request access', async t => {
    const mock = transport([]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 50 }, mock);
    t.after(() => client.close());
    const controller = new AbortController();
    controller.abort();
    for (const options of [null, [], { deadline: NaN }, { canSend: true }, { signal: {} }]) {
        await assert.rejects(client.programTimer(REQUEST, options), { code: 'VALIDATION', recordingNotSent: true });
    }
    await assert.rejects(client.programTimer(REQUEST, { signal: controller.signal }), { code: 'CANCELLED', recordingNotSent: true });
    for (const canSend of [() => false, () => undefined, () => { throw new Error('stale'); }, async () => false]) {
        await assert.rejects(client.programTimer(REQUEST, { canSend }), { code: 'STALE_COMMAND', recordingNotSent: true });
    }
    await assert.rejects(client.zap(LOCATOR, { canSend: () => false }), { code: 'STALE_COMMAND' });
    assert.equal(mock.calls.length, 0);
});

test('recording and live tuning recheck programme validity after the access handshake', async t => {
    for (const operation of ['record', 'zap']) {
        let permitted = true;
        const mock = transport([response('RequestAccess', '<ClientId>fixture-client</ClientId>')], {
            afterWrite: () => { permitted = false; },
        });
        const client = new LoeweClient({ host: 'tv.test', timeout: 500 }, mock);
        t.after(() => client.close());
        const options = { canSend: () => permitted };
        await assert.rejects(operation === 'record' ? client.programTimer(REQUEST, options) : client.zap(LOCATOR, options), error => {
            assert.equal(error.code, 'STALE_COMMAND');
            assert.equal(error.action, operation === 'record' ? 'ProgramTimer' : 'ZapToMedia');
            if (operation === 'record') assert.equal(error.recordingNotSent, true);
            return true;
        });
        assert.equal(mock.calls.length, 1, 'Only RequestAccess was sent.');
        assert.match(mock.calls[0].body, /<ns1:RequestAccess(?:\s|>)/u);
    }
});

test('cancellation while authenticating leaves ProgramTimer definitely unsent', async t => {
    const controller = new AbortController();
    const mock = transport([response('RequestAccess', '<ClientId>fixture-client</ClientId>')], {
        afterWrite: () => controller.abort(),
    });
    const client = new LoeweClient({ host: 'tv.test', timeout: 500 }, mock);
    t.after(() => client.close());
    await assert.rejects(client.programTimer(REQUEST, { signal: controller.signal }), { code: 'CANCELLED', recordingNotSent: true });
    assert.equal(mock.calls.length, 1);
});

test('deadline is rechecked immediately before HTTP submission even with an existing session', async t => {
    const deadline = Date.now() + 500;
    let now = deadline - 100;
    t.mock.method(Date, 'now', () => now);
    for (const operation of ['record', 'zap']) {
        now = deadline - 100;
        const mock = transport([], { onCreate: () => { now = deadline; } });
        const client = new LoeweClient({ host: 'tv.test', timeout: 500 }, mock);
        client._clientId = 'fixture-client';
        t.after(() => client.close());
        await assert.rejects(operation === 'record'
            ? client.programTimer(REQUEST, { deadline }) : client.zap(LOCATOR, { deadline }), error => {
            assert.equal(error.code, 'NETWORK');
            if (operation === 'record') assert.equal(error.recordingNotSent, true);
            return true;
        });
        assert.equal(mock.calls.length, 0, 'The SOAP body must not be submitted after the deadline.');
    }
});

test('a guard which cancels the command cannot accidentally authorize its body', async t => {
    const controller = new AbortController();
    let checks = 0;
    const mock = transport([]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 500 }, mock);
    client._clientId = 'fixture-client';
    t.after(() => client.close());
    await assert.rejects(client.programTimer(REQUEST, {
        signal: controller.signal,
        canSend() {
            if (++checks === 2) controller.abort();
            return true;
        },
    }), { code: 'CANCELLED', recordingNotSent: true });
    assert.equal(mock.calls.length, 0);
});

test('expired live-programme errors retain the runtime explanation at the final send gate', async t => {
    const mock = transport([]);
    const client = new LoeweClient({ host: 'tv.test', timeout: 500 }, mock);
    client._clientId = 'fixture-client';
    t.after(() => client.close());
    let checks = 0;
    const reason = new ProtocolError('Diese Sendung läuft nicht mehr.', 'EPG_ACTION_EXPIRED');
    await assert.rejects(client.zap(LOCATOR, { canSend() {
        if (++checks === 2) throw reason;
        return true;
    } }), error => error === reason && error.action === 'ZapToMedia');
    assert.equal(mock.calls.length, 0);
});

test('cancellation after submitting ProgramTimer remains an ambiguous write and is never retried', async t => {
    const controller = new AbortController();
    const mock = transport([null], { afterWrite: () => controller.abort() });
    const client = new LoeweClient({ host: 'tv.test', timeout: 500 }, mock);
    client._clientId = 'fixture-client';
    t.after(() => client.close());
    await assert.rejects(client.programTimer(REQUEST, { signal: controller.signal, canSend: () => true }), error => {
        assert.equal(error.code, 'CANCELLED');
        assert.notEqual(error.recordingNotSent, true);
        return true;
    });
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].request.destroyed, true);
});
