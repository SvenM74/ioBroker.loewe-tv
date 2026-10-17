'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const {
    LoeweClient, parseResponse, parseMediaItem, parseZapResult, parseCurrentPlayback,
} = require('../lib/loewe-client');

// Synthetic responses shaped from the Remote API and APK evidence. These are
// transport/parser regressions, not recordings or successful hardware tests.
const UUID = 'chl0:00-00080001ffff040f28a0';
const LIST_LOCATOR = 'channel://100:ch-radio:sl-list';
const DETAIL_LOCATOR = 'channel://101:ch-radio:sl-detail';

function envelope(inner, header = '') {
    return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        + 'xmlns:m="urn:loewe.de:RemoteTV:Tablet" '
        + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        + 'xmlns:xsd="http://www.w3.org/2001/XMLSchema">'
        + (header ? `<s:Header>${header}</s:Header>` : '')
        + `<s:Body>${inner}</s:Body></s:Envelope>`;
}

function reply(action, inner = '') {
    return envelope(`<m:${action}Response>${inner}</m:${action}Response>`);
}

function detail(inner = `<m:uuid>${UUID}</m:uuid><m:Locator>${DETAIL_LOCATOR}</m:Locator>`, attributes = '') {
    return `<m:ResultItem><m:MediaItem${attributes}>${inner}</m:MediaItem></m:ResultItem>`;
}

function harness(t, replies = []) {
    const calls = [];
    const queue = [reply('RequestAccess', '<m:ClientId>radio-fixture</m:ClientId>'), ...replies];
    const client = new LoeweClient({ host: 'tv.example', timeout: 1000 }, {
        request(options, onResponse) {
            const request = new EventEmitter();
            request.destroyed = false;
            request.destroy = () => { request.destroyed = true; };
            const call = { options, request };
            call.reply = xml => {
                if (request.destroyed) return;
                const response = new EventEmitter();
                response.statusCode = 200;
                response.headers = {};
                response.destroy = () => { response.destroyed = true; };
                call.response = response;
                onResponse(response);
                response.emit('data', Buffer.from(xml));
                response.emit('end');
            };
            request.end = body => {
                call.body = Buffer.from(body);
                call.action = options.headers.SOAPAction.match(/#([^"]+)"$/u)[1];
                calls.push(call);
                const xml = queue.shift();
                if (xml !== null && xml !== undefined) queueMicrotask(() => call.reply(xml));
            };
            return request;
        },
    });
    t.after(() => client.close());
    return { client, calls };
}

test('GetMediaItem sends the exact escaped UUID attribute and retains the raw response', async t => {
    const uuid = 'fixture:"&<>\'';
    const escapedUuid = 'fixture:&quot;&amp;&lt;&gt;&apos;';
    const xml = reply('GetMediaItem', detail(`<m:uuid xsi:type="xsd:string">${escapedUuid}</m:uuid>`
        + `<m:Locator xsi:type="xsd:string">${DETAIL_LOCATOR}</m:Locator>`, ' itemClass="audio" itemInfoClass="7"'));
    const { client, calls } = harness(t, [xml]);
    const response = await client.getMediaItem(uuid);
    assert.equal(response.xml, xml);
    assert.deepEqual(parseMediaItem(response, uuid), { locator: DETAIL_LOCATOR, mediaItemUuid: uuid, itemClass: 'audio' });
    assert.deepEqual(calls.map(call => call.action), ['RequestAccess', 'GetMediaItem']);
    const call = calls[1];
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.path, '/loewe_tablet_0001');
    assert.equal(call.options.headers.SOAPAction, '"urn:loewe.de:RemoteTV:Tablet#GetMediaItem"');
    assert.equal(call.options.headers['Content-Length'], call.body.length);
    assert.ok(call.body.toString().includes('<ns1:GetMediaItem><fcid></fcid><ClientId>radio-fixture</ClientId>'
        + `<MediaItemReference mediaItemUuid="${escapedUuid}"/></ns1:GetMediaItem>`));
    assert.equal(call.body.at(-1), 0);
});

test('detail resolution uses its returned locator without altering it or substituting the list locator', async t => {
    const detailXml = reply('GetMediaItem', detail(undefined, ' itemClass="audio"'));
    const zapXml = reply('ZapToMedia', '<m:Result>0</m:Result>');
    const playbackXml = reply('GetCurrentPlayback', '<m:Mode>radio</m:Mode>');
    const { client, calls } = harness(t, [detailXml, zapXml, playbackXml]);
    const options = { deadline: Date.now() + 5000 };
    const media = parseMediaItem(await client.getMediaItem(UUID, options), UUID);
    assert.notEqual(media.locator, LIST_LOCATOR);
    const sent = await client.zap(media.locator, options);
    assert.equal(sent.xml, zapXml);
    assert.equal(parseZapResult(sent), 0);
    const observed = await client.getCurrentPlayback(options);
    assert.equal(observed.xml, playbackXml);
    assert.deepEqual(parseCurrentPlayback(observed), { mode: 'radio', locator: '', mediaItemUuid: '' });
    assert.deepEqual(calls.map(call => call.action), ['RequestAccess', 'GetMediaItem', 'ZapToMedia', 'GetCurrentPlayback']);
    assert.ok(calls[2].body.toString().includes(`<Player>0</Player><Locator>${DETAIL_LOCATOR}</Locator>`));
    assert.ok(!calls[2].body.toString().includes(LIST_LOCATOR));
    assert.ok(calls[3].body.toString().includes('<Player>0</Player>'));
});

test('GetMediaItem rejects invalid UUIDs before even starting a handshake', async t => {
    const { client, calls } = harness(t);
    for (const uuid of [undefined, null, 1, {}, [], '', '  ', 'x'.repeat(1025), 'bad\nuuid', 'bad\u007fuuid', '\ud800']) {
        await assert.rejects(client.getMediaItem(uuid), { code: 'VALIDATION' });
    }
    assert.equal(calls.length, 0);
});

test('media details are scoped to the matching action and allow the older documented chl0 locator', async t => {
    const locator = 'chl0://00080001ffff040f28a0';
    const xml = envelope('<m:GetMediaItemResponse><m:MediaItem itemInfoClass="99">'
        + `<m:Locator>${locator}</m:Locator></m:MediaItem></m:GetMediaItemResponse>`,
    `<m:MediaItem><m:uuid>wrong-header-uuid</m:uuid><m:Locator>${LIST_LOCATOR}</m:Locator></m:MediaItem>`);
    const { client } = harness(t, [xml]);
    assert.deepEqual(parseMediaItem(await client.getMediaItem(UUID), UUID), {
        locator, mediaItemUuid: '', itemClass: '',
    }, 'An absent UUID remains absent, and itemInfoClass must not become a media class.');
});

test('actual itemClass fields are metadata even when they contradict the requested radio service', () => {
    for (const classXml of ['<ItemClass>video</ItemClass>', '<itemClass>class.videoItem</itemClass>']) {
        const response = parseResponse(reply('GetMediaItem', detail(`<uuid>${UUID}</uuid>`
            + `<Locator>${DETAIL_LOCATOR}</Locator>${classXml}`)));
        assert.match(parseMediaItem(response, UUID).itemClass, /video/);
    }
});

test('media detail parser rejects wrong, ambiguous or unusable responses from the transport', async t => {
    const samples = [
        ['wrong action', reply('GetCurrentPlayback', `<Locator>${DETAIL_LOCATOR}</Locator>`)],
        ['missing MediaItem', reply('GetMediaItem', `<Locator>${DETAIL_LOCATOR}</Locator>`)],
        ['empty MediaItem', reply('GetMediaItem', '<MediaItem/>')],
        ['repeated MediaItem', reply('GetMediaItem', `<ResultItem><MediaItem><Locator>${DETAIL_LOCATOR}</Locator>`
            + `</MediaItem><MediaItem><Locator>${LIST_LOCATOR}</Locator></MediaItem></ResultItem>`)],
        ['nested second MediaItem', reply('GetMediaItem', detail(`<Locator>${DETAIL_LOCATOR}</Locator>`
            + `<Other><MediaItem><Locator>${LIST_LOCATOR}</Locator></MediaItem></Other>`))],
        ['wrong uuid', reply('GetMediaItem', detail(`<uuid>other-service</uuid><Locator>${DETAIL_LOCATOR}</Locator>`))],
        ['empty uuid', reply('GetMediaItem', detail(`<uuid/><Locator>${DETAIL_LOCATOR}</Locator>`))],
        ['repeated uuid', reply('GetMediaItem', detail(`<uuid>${UUID}</uuid><uuid>${UUID}</uuid><Locator>${DETAIL_LOCATOR}</Locator>`))],
        ['nested uuid', reply('GetMediaItem', detail(`<uuid><value>${UUID}</value></uuid><Locator>${DETAIL_LOCATOR}</Locator>`))],
        ['missing Locator', reply('GetMediaItem', detail(`<uuid>${UUID}</uuid>`))],
        ['empty Locator', reply('GetMediaItem', detail('<Locator/>'))],
        ['attribute Locator only', reply('GetMediaItem', detail(`<uuid>${UUID}</uuid>`, ` locator="${DETAIL_LOCATOR}"`))],
        ['StreamingUrl only', reply('GetMediaItem', detail(`<StreamingUrl>${DETAIL_LOCATOR}</StreamingUrl>`))],
        ['nested Locator only', reply('GetMediaItem', detail(`<Metadata><Locator>${DETAIL_LOCATOR}</Locator></Metadata>`))],
        ['repeated Locator', reply('GetMediaItem', detail(`<Locator>${DETAIL_LOCATOR}</Locator><Locator>${LIST_LOCATOR}</Locator>`))],
        ['mixed-content Locator', reply('GetMediaItem', detail(`<Locator>${DETAIL_LOCATOR}<Extra/></Locator>`))],
        ['contradictory itemClass fields', reply('GetMediaItem', detail(`<Locator>${DETAIL_LOCATOR}</Locator><ItemClass>video</ItemClass>`, ' itemClass="audio"'))],
        ['multiple expected responses', envelope(`<GetMediaItemResponse>${detail()}</GetMediaItemResponse>`
            + `<GetMediaItemResponse>${detail()}</GetMediaItemResponse>`)],
        ['additional action response', envelope(`<GetMediaItemResponse>${detail()}</GetMediaItemResponse><GetDeviceDataResponse/>`)],
    ];
    const { client } = harness(t, samples.map(([, xml]) => xml));
    for (const [description] of samples) {
        const response = await client.getMediaItem(UUID);
        assert.throws(() => parseMediaItem(response, UUID), { code: 'INVALID_RESPONSE', action: 'GetMediaItem' }, description);
    }
});

test('radio resolution accepts only bounded broadcast locators, never guessed schemes or stream URLs', () => {
    for (const locator of [
        'radio://100', 'audio://100', 'dvb://100', 'http://tv.example/stream', 'file:///recording',
        'channel://', 'chl0://', 'channel://bad locator', 'channel://bad&#10;locator',
        'channel://bad&#9;locator', 'channel://bad&#127;locator', 'channel://' + 'x'.repeat(4096),
    ]) {
        const response = parseResponse(reply('GetMediaItem', detail(`<Locator>${locator}</Locator>`)));
        assert.throws(() => parseMediaItem(response, UUID), { code: 'INVALID_RESPONSE' }, locator.slice(0, 70));
    }
});

test('searching for a detail item is bounded even for otherwise valid SOAP XML', () => {
    for (const inner of [
        '<Wrapper>'.repeat(20) + detail() + '</Wrapper>'.repeat(20),
        '<Wrapper/>'.repeat(1100) + detail(),
    ]) {
        assert.throws(() => parseMediaItem(parseResponse(reply('GetMediaItem', inner)), UUID), { code: 'INVALID_RESPONSE' });
    }
});

test('ZapToMedia result parsing preserves rejection codes and empty-response compatibility', async t => {
    const samples = [
        ['<Result>0</Result>', 0], ['<m:Result xsi:type="xsd:int"> -1 </m:Result>', -1],
        ['<Result>17</Result>', 17], ['', null], ['<fcid/><ClientId>radio-fixture</ClientId>', null],
    ];
    const { client } = harness(t, samples.map(([inner]) => reply('ZapToMedia', inner)));
    for (const [inner, result] of samples) {
        const response = await client.zap(DETAIL_LOCATOR);
        assert.equal(response.xml, reply('ZapToMedia', inner), 'The client must retain rejected TV responses for diagnostics.');
        assert.equal(parseZapResult(response), result);
    }
    assert.equal(parseZapResult(parseResponse(envelope('<ZapToMediaResponse/>'))), null);
});

test('ZapToMedia rejects malformed or non-unique results and response elements', () => {
    const invalidBodies = [
        '<Result/>', '<Result>OK</Result>', '<Result>1.5</Result>', '<Result>NaN</Result>',
        '<Result>0x0</Result>', '<Result>1e3</Result>', '<Result>9007199254740992</Result>',
        '<Result>0</Result><Result>0</Result>', '<Result>0<Extra/></Result>', '<Result><value>0</value></Result>',
    ];
    for (const inner of invalidBodies) {
        assert.throws(() => parseZapResult(parseResponse(reply('ZapToMedia', inner))), { code: 'INVALID_RESPONSE' }, inner);
    }
    for (const xml of [
        reply('GetMediaItem', '<Result>0</Result>'),
        envelope('<ZapToMediaResponse/><ZapToMediaResponse/>'),
        envelope('<ZapToMediaResponse/><GetDeviceDataResponse/>'),
    ]) {
        assert.throws(() => parseZapResult(parseResponse(xml)), { code: 'INVALID_RESPONSE', action: 'ZapToMedia' });
    }
});

test('playback parses direct fields and does not infer a selected radio station from its mode', () => {
    const observed = parseCurrentPlayback(parseResponse(reply('GetCurrentPlayback', '<m:Mode>tv</m:Mode>'
        + `<m:Locator xsi:type="xsd:string">${LIST_LOCATOR}</m:Locator><m:MediaItemUuid>${UUID}</m:MediaItemUuid>`)));
    assert.deepEqual(observed, { mode: 'tv', locator: LIST_LOCATOR, mediaItemUuid: UUID });
    for (const mode of ['radio', 'drplus', 'browser']) {
        assert.deepEqual(parseCurrentPlayback(parseResponse(reply('GetCurrentPlayback', `<Mode>${mode}</Mode>`))), {
            mode, locator: '', mediaItemUuid: '',
        });
    }
    for (const inner of ['', '<Mode/>', '<Mode>UNKNOWN</Mode>', '<Mode>future-mode</Mode>']) {
        assert.deepEqual(parseCurrentPlayback(parseResponse(reply('GetCurrentPlayback', inner))), {
            mode: 'UNKNOWN', locator: '', mediaItemUuid: '',
        });
    }
    const nested = parseCurrentPlayback(parseResponse(reply('GetCurrentPlayback', '<Mode>radio</Mode>'
        + `<Other><Locator>${LIST_LOCATOR}</Locator><MediaItemUuid>${UUID}</MediaItemUuid></Other>`)));
    assert.deepEqual(nested, { mode: 'radio', locator: '', mediaItemUuid: '' });
});

test('playback rejects ambiguous fields and SOAP response elements', () => {
    for (const inner of [
        '<Mode>radio</Mode><Mode>tv</Mode>', '<Mode><value>radio</value></Mode>',
        '<Locator>one</Locator><Locator>two</Locator>', '<MediaItemUuid>a</MediaItemUuid><MediaItemUuid>b</MediaItemUuid>',
        '<Locator>bad&#10;locator</Locator>', '<MediaItemUuid>bad&#127;uuid</MediaItemUuid>',
    ]) {
        assert.throws(() => parseCurrentPlayback(parseResponse(reply('GetCurrentPlayback', inner))), { code: 'INVALID_RESPONSE' }, inner);
    }
    for (const xml of [reply('GetMediaItem'), envelope('<GetCurrentPlaybackResponse/><GetCurrentPlaybackResponse/>')]) {
        assert.throws(() => parseCurrentPlayback(parseResponse(xml)), { code: 'INVALID_RESPONSE' });
    }
});

const operations = [
    ['GetMediaItem', (client, options) => client.getMediaItem(UUID, options)],
    ['ZapToMedia', (client, options) => client.zap(DETAIL_LOCATOR, options)],
    ['GetCurrentPlayback', (client, options) => client.getCurrentPlayback(options)],
];

for (const [action, invoke] of operations) {
    test(`${action} forwards the shared deadline to the real request transport`, async t => {
        t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
        const { client, calls } = harness(t, [null]);
        await client.request('RequestAccess');
        const rejected = assert.rejects(invoke(client, { deadline: 1050 }), {
            code: 'NETWORK', transportCode: 'ETIMEDOUT', action,
        });
        await nextTurn();
        assert.equal(calls.length, 2);
        assert.equal(calls[1].action, action);
        t.mock.timers.tick(49);
        assert.equal(calls[1].request.destroyed, false);
        t.mock.timers.tick(1);
        await rejected;
        assert.equal(calls[1].request.destroyed, true);
        assert.equal(Date.now(), 1050);
        t.mock.timers.tick(1000);
        await nextTurn();
        assert.equal(calls.length, 2, 'The operation must not be retried after its deadline.');
    });
}

test('expired and malformed operation deadlines are rejected before any HTTP request', async t => {
    const { client, calls } = harness(t);
    for (const [, invoke] of operations) {
        await assert.rejects(invoke(client, { deadline: Date.now() - 1 }), { code: 'NETWORK', transportCode: 'ETIMEDOUT' });
        for (const options of [null, [], { deadline: NaN }, { deadline: Infinity }]) {
            await assert.rejects(invoke(client, options), { code: 'VALIDATION' });
        }
    }
    assert.equal(calls.length, 0);
});
