'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { setTimeout: delay, setImmediate: nextTurn } = require('node:timers/promises');
const { LoeweClient, parseResponse, parseResponseAsync } = require('../lib/loewe-client');

function reply(action, inner = '') {
    return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        + 'xmlns:m="urn:loewe.de:RemoteTV:Tablet"><s:Body>'
        + `<m:${action}Response>${inner}</m:${action}Response></s:Body></s:Envelope>`;
}

// Only the wire transport is mocked. All tests run the production SAX parser.
function transportFor(xml) {
    const calls = [];
    return {
        calls,
        request(options, onResponse) {
            const request = new EventEmitter();
            const call = { options, request };
            request.destroy = () => { request.destroyed = true; };
            request.end = () => {
                calls.push(call);
                queueMicrotask(() => {
                    if (request.destroyed) return;
                    const response = new EventEmitter();
                    response.statusCode = 200;
                    response.headers = {};
                    response.destroy = () => { response.destroyed = true; };
                    call.response = response;
                    onResponse(response);
                    const body = options.headers.SOAPAction.includes('#RequestAccess"')
                        ? reply('RequestAccess', '<m:ClientId>parser-test</m:ClientId>') : xml;
                    response.emit('data', Buffer.from(body));
                    response.emit('end');
                });
            };
            return request;
        },
    };
}

test('malformed NUL padding is rejected without quadratic suffix matching', () => {
    // The old /\0+$/ expression needs roughly 7 seconds for this 100 KB input.
    // Linear validation takes a few milliseconds; the generous bound also
    // leaves room for slow CI hosts while catching the original regression.
    const xml = reply('GetMute') + '\0'.repeat(100000) + '\n';
    const started = performance.now();
    assert.throws(() => parseResponse(xml), { code: 'INVALID_RESPONSE' });
    assert.ok(performance.now() - started < 1000, 'Invalid NUL padding blocked for at least one second.');
    assert.equal(parseResponse(reply('GetMute') + '\0'.repeat(100000)).xml, reply('GetMute'));
});

test('the input size limit includes trailing NUL bytes for strings as well as buffers', () => {
    const xml = reply('GetMute') + '\0'.repeat(8 * 1024 * 1024);
    assert.throws(() => parseResponse(xml), { code: 'INVALID_RESPONSE' });
    assert.throws(() => parseResponse(Buffer.from(xml)), { code: 'INVALID_RESPONSE' });
});

test('large asynchronous parsing yields and preserves the synchronous parser result', async () => {
    const xml = reply('GetChannelList',
        '<m:Item index="0007">Ä💡 &amp; &#x1F4A1;</m:Item>'.repeat(12000));
    let yielded = false;
    const marker = setImmediate(() => { yielded = true; });
    try {
        const result = await parseResponseAsync(Buffer.from(xml));
        assert.equal(yielded, true, 'Large parsing did not let another event-loop callback run.');
        assert.deepEqual(result, parseResponse(xml));
    } finally {
        clearImmediate(marker);
    }
});

test('asynchronous parsing retains strict XML checks across chunk boundaries', async () => {
    const inner = '<Name>' + 'x'.repeat(32700) + '💡Ä &amp; &#128161;</Name>';
    assert.deepEqual(await parseResponseAsync(reply('GetDeviceData', inner)), parseResponse(reply('GetDeviceData', inner)));
    for (const value of [
        '<Value>&#0;</Value>', '<Value>&#xD800;&#xDC00;</Value>',
        '<Value first="1" first="2"/>', '<missing:Name>x</missing:Name>',
        '<!DOCTYPE x [<!ENTITY e "x">]><Value>&e;</Value>',
    ]) {
        await assert.rejects(parseResponseAsync(reply('GetFeature', value)), { code: 'INVALID_RESPONSE' });
    }
});

test('HTTP total deadline remains effective while a large valid reply is being parsed', async () => {
    const transport = transportFor(reply('GetFeature', '<Item>x</Item>'.repeat(180000)));
    const client = new LoeweClient({ host: 'tv.example', timeout: 20 }, transport);
    try {
        await client.request('RequestAccess');
        await assert.rejects(client.request('GetFeature', '<Name>large</Name>'), {
            code: 'NETWORK', transportCode: 'ETIMEDOUT',
        });
        assert.equal(transport.calls.length, 2);
        assert.equal(transport.calls[1].request.destroyed, true);
        assert.equal(transport.calls[1].response.destroyed, true);
        assert.equal(client.isSessionReady, false);
    } finally {
        client.close();
    }
});

test('close can interrupt response parsing without another TV operation', async () => {
    const transport = transportFor(reply('GetFeature', '<Item>x</Item>'.repeat(180000)));
    const client = new LoeweClient({ host: 'tv.example', timeout: 5000 }, transport);
    await client.request('RequestAccess');
    const operation = client.request('GetFeature', '<Name>large</Name>');
    const rejection = assert.rejects(operation, { code: 'CLOSED' });
    const closeTimer = setImmediate(() => client.close());
    try {
        await rejection;
        assert.equal(transport.calls.length, 2);
        assert.equal(transport.calls[1].request.destroyed, true);
        assert.equal(transport.calls[1].response.destroyed, true);
    } finally {
        clearImmediate(closeTimer);
        client.close();
    }
});

function udpTransport(networkInterfaces = () => ({})) {
    const sockets = [];
    return {
        sockets,
        networkInterfaces,
        createSocket() {
            const socket = new EventEmitter();
            socket.sent = [];
            socket.bind = (_port, _address, callback) => queueMicrotask(callback);
            socket.setBroadcast = enabled => { socket.broadcastEnabled = enabled; };
            socket.send = (packet, offset, length, port, address, callback) => {
                socket.sent.push({ packet: Buffer.from(packet), offset, length, port, address });
                queueMicrotask(callback);
            };
            socket.close = () => { socket.closed = true; };
            sockets.push(socket);
            return socket;
        },
    };
}

test('Wake-on-LAN repeats use the real matching subnet mask and deduplicate destinations', async () => {
    const transport = udpTransport(() => ({
        ethernet: [
            { family: 'IPv4', address: '10.20.6.10', netmask: '255.255.252.0', internal: false },
            { family: 4, address: '10.20.4.11', netmask: '255.255.252.0', internal: false },
        ],
        other: [
            { family: 'IPv4', address: '192.168.1.2', netmask: '255.255.255.0', internal: false },
            { family: 'IPv4', address: '10.20.6.10', netmask: '255.0.255.0', internal: false },
            { family: 'IPv4', address: '10.20.5.12', netmask: '255.255.255.0', internal: true },
            { family: 'IPv6', address: '::1', netmask: 'ffff:ffff:ffff:ffff::', internal: false },
        ],
    }));
    const client = new LoeweClient({ host: '10.20.5.12', timeout: 1000 }, transport);
    try {
        const result = await client.wake(['02:aa:00:00:00:01', '02-AA-00-00-00-01'], '255.255.255.255', {
            repeats: 3, intervalMs: 1, autoBroadcast: true,
        });
        assert.deepEqual(result.targets, ['255.255.255.255', '10.20.7.255']);
        assert.equal(result.broadcast, '255.255.255.255');
        assert.equal(result.repeats, 3);
        assert.equal(result.port, 9);
        const socket = transport.sockets[0];
        assert.equal(socket.closed, true);
        assert.equal(socket.sent.length, 6);
        assert.deepEqual(socket.sent.map(call => call.address), [
            '255.255.255.255', '10.20.7.255', '255.255.255.255', '10.20.7.255', '255.255.255.255', '10.20.7.255',
        ]);
        assert.ok(socket.sent.every(call => call.port === 9 && call.length === 102));
    } finally {
        client.close();
    }
});

test('Wake-on-LAN respects a custom broadcast and does not guess a hostname subnet', async () => {
    let enumerations = 0;
    const transport = udpTransport(() => { enumerations++; return {}; });
    const client = new LoeweClient({ host: '10.20.5.12' }, transport);
    const namedClient = new LoeweClient({ host: 'tv.example' }, transport);
    try {
        const explicit = await client.wake('02:00:00:00:00:01', '10.20.255.255', { autoBroadcast: true });
        assert.deepEqual(explicit.targets, ['10.20.255.255']);
        const named = await namedClient.wake('02:00:00:00:00:01', '255.255.255.255', { autoBroadcast: true });
        assert.deepEqual(named.targets, ['255.255.255.255']);
        assert.equal(enumerations, 0);
        assert.equal(transport.sockets.reduce((count, socket) => count + socket.sent.length, 0), 2);
    } finally {
        client.close();
        namedClient.close();
    }
});

test('unavailable network-interface enumeration leaves the global WOL destination usable', async () => {
    const transport = udpTransport(() => { throw new Error('Restricted container'); });
    const client = new LoeweClient({ host: '10.20.5.12' }, transport);
    try {
        const result = await client.wake('02:00:00:00:00:01', '255.255.255.255', { autoBroadcast: true });
        assert.deepEqual(result.targets, ['255.255.255.255']);
        assert.equal(transport.sockets[0].sent.length, 1);
    } finally {
        client.close();
    }
});

test('invalid Wake-on-LAN repeat options do not create a socket', async () => {
    const transport = udpTransport();
    const client = new LoeweClient({ host: 'tv.example' }, transport);
    try {
        for (const options of [null, [], { repeats: 0 }, { repeats: 6 }, { repeats: 1.5 },
            { intervalMs: -1 }, { intervalMs: Infinity }, { autoBroadcast: 'true' },
            { signal: null }, { signal: {} }, { signal: { aborted: false } }]) {
            await assert.rejects(client.wake('02:00:00:00:00:01', '255.255.255.255', options), { code: 'VALIDATION' });
        }
        assert.equal(transport.sockets.length, 0);
    } finally {
        client.close();
    }
});

test('an already cancelled Wake-on-LAN signal rejects before a socket is created', async () => {
    const transport = udpTransport();
    const client = new LoeweClient({ host: 'tv.example' }, transport);
    const controller = new AbortController();
    controller.abort();
    try {
        await assert.rejects(client.wake('02:00:00:00:00:01', '255.255.255.255', {
            signal: controller.signal,
        }), { code: 'CANCELLED' });
        assert.equal(transport.sockets.length, 0);
        assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
    } finally {
        client.close();
    }
});

test('cancelling Wake-on-LAN between rounds closes the socket and prevents all later packets', async () => {
    const transport = udpTransport();
    const client = new LoeweClient({ host: 'tv.example', timeout: 1000 }, transport);
    const controller = new AbortController();
    const operation = client.wake('02:00:00:00:00:01', '255.255.255.255', {
        repeats: 3, intervalMs: 40, signal: controller.signal,
    });
    const rejection = assert.rejects(operation, { code: 'CANCELLED' });
    try {
        await nextTurn();
        const socket = transport.sockets[0];
        assert.equal(socket.sent.length, 1);
        controller.abort();
        await rejection;
        assert.equal(socket.closed, true);
        assert.equal(require('node:events').getEventListeners(controller.signal, 'abort').length, 0);
        // A transport error arriving after cancellation must remain handled and
        // must not replace the cancellation or restart another sender round.
        socket.emit('error', Object.assign(new Error('Late UDP error'), { code: 'ECONNRESET' }));
        await delay(70);
        assert.equal(socket.sent.length, 1);
    } finally {
        client.close();
    }
});

test('close cancels scheduled Wake-on-LAN repetitions', async () => {
    const transport = udpTransport();
    const client = new LoeweClient({ host: 'tv.example', timeout: 1000 }, transport);
    const operation = client.wake('02:00:00:00:00:01', '255.255.255.255', { repeats: 3, intervalMs: 40 });
    const rejection = assert.rejects(operation, { code: 'CLOSED' });
    await nextTurn();
    assert.equal(transport.sockets[0].sent.length, 1);
    client.close();
    await rejection;
    await delay(70);
    assert.equal(transport.sockets[0].sent.length, 1);
    assert.equal(transport.sockets[0].closed, true);
});

test('the total Wake-on-LAN deadline cancels later repetition timers', async () => {
    const transport = udpTransport();
    const client = new LoeweClient({ host: 'tv.example', timeout: 15 }, transport);
    try {
        await assert.rejects(client.wake('02:00:00:00:00:01', '255.255.255.255', {
            repeats: 3, intervalMs: 40,
        }), { code: 'NETWORK', transportCode: 'ETIMEDOUT' });
        await delay(70);
        assert.equal(transport.sockets[0].sent.length, 1);
        assert.equal(transport.sockets[0].closed, true);
    } finally {
        client.close();
    }
});

function delayedTextTransport(delayMs, shouldRespond = () => true) {
    const calls = [];
    return {
        calls,
        request(options, onResponse) {
            const request = new EventEmitter();
            const action = options.headers.SOAPAction.match(/#([^"\s]+)"$/)[1];
            const call = { action, request };
            let responseTimer;
            request.destroy = () => {
                request.destroyed = true;
                clearTimeout(responseTimer);
            };
            request.end = body => {
                call.body = Buffer.from(body);
                calls.push(call);
                if (!shouldRespond(call, calls)) return;
                responseTimer = setTimeout(() => {
                    if (request.destroyed) return;
                    const response = new EventEmitter();
                    response.statusCode = 200;
                    response.headers = {};
                    response.destroy = () => { response.destroyed = true; };
                    call.responded = true;
                    onResponse(response);
                    const inner = action === 'RequestAccess' ? '<ClientId>deadline-test</ClientId>'
                        : action === 'GetMute' ? '<Value>0</Value>'
                        : action === 'GetVolume' ? '<Value>100000</Value>' : '';
                    response.emit('data', Buffer.from(reply(action, inner)));
                    response.emit('end');
                }, delayMs);
            };
            return request;
        },
    };
}

test('text has one total deadline across successful characters and the last pending HTTP request', async t => {
    // Reply to the handshake and two characters, then deliberately leave the
    // third character unanswered. A wall-clock deadline can otherwise fall
    // after a response arrived, where destroying that completed request is not
    // required. The mocked clock makes the outstanding request unambiguous.
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
    const transport = delayedTextTransport(20, (_call, calls) => calls.length <= 3);
    const client = new LoeweClient({ host: 'tv.example', timeout: 500 }, transport);
    try {
        const rejection = assert.rejects(client.text('ABCDEFGHIJKLMNOPQRST', { timeoutMs: 85 }), {
            code: 'NETWORK', transportCode: 'ETIMEDOUT',
        });
        for (let response = 0; response < 3; response++) {
            t.mock.timers.tick(20);
            await nextTurn();
        }
        assert.equal(Date.now(), 1060);
        assert.deepEqual(transport.calls.map(call => call.action), [
            'RequestAccess', 'InjectKeyboardKey', 'InjectKeyboardKey', 'InjectKeyboardKey',
        ]);
        const sent = transport.calls.filter(call => call.action === 'InjectKeyboardKey');
        assert.deepEqual(sent.map(call => !!call.responded), [true, true, false]);
        t.mock.timers.tick(24);
        assert.equal(transport.calls.at(-1).request.destroyed, undefined);
        t.mock.timers.tick(1);
        await rejection;
        assert.equal(Date.now(), 1085, 'The text command exceeded its overall time budget.');
        assert.equal(transport.calls.at(-1).request.destroyed, true);
        const count = transport.calls.length;
        t.mock.timers.tick(1000);
        await nextTurn();
        assert.equal(transport.calls.length, count, 'Another character was sent after the deadline.');
    } finally {
        client.close();
        t.mock.timers.reset();
    }
});

test('the text deadline includes a new access handshake', async t => {
    // Run both the caller's wait deadline and the HTTP abort deadline against
    // the same controlled clock, including all callbacks due at the boundary.
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
    const transport = delayedTextTransport(100);
    const client = new LoeweClient({ host: 'tv.example', timeout: 500 }, transport);
    try {
        const rejection = assert.rejects(client.text('A', { timeoutMs: 15 }), {
            code: 'NETWORK', transportCode: 'ETIMEDOUT',
        });
        assert.deepEqual(transport.calls.map(call => call.action), ['RequestAccess']);
        t.mock.timers.tick(14);
        assert.equal(transport.calls[0].request.destroyed, undefined);
        t.mock.timers.tick(1);
        await rejection;
        assert.equal(transport.calls[0].request.destroyed, true);
        assert.deepEqual(transport.calls.map(call => call.action), ['RequestAccess']);
    } finally {
        client.close();
        t.mock.timers.reset();
    }
});

test('a text wait can expire without cancelling an existing shared handshake or parallel WOL', async () => {
    const httpTransport = delayedTextTransport(25);
    const udp = udpTransport();
    const client = new LoeweClient({ host: 'tv.example', timeout: 500 }, { ...httpTransport, ...udp });
    try {
        const mute = client.getMute();
        const wake = client.wake('02:00:00:00:00:01', '255.255.255.255', { repeats: 3, intervalMs: 15 });
        await assert.rejects(client.text('A', { timeoutMs: 8 }), {
            code: 'NETWORK', transportCode: 'ETIMEDOUT',
        });
        assert.equal(httpTransport.calls[0].request.destroyed, undefined);
        const volume = client.getVolume();
        const [muteValue, volumeValue, wakeResult] = await Promise.all([mute, volume, wake]);
        assert.equal(muteValue, false);
        assert.equal(volumeValue, 10);
        assert.equal(wakeResult.repeats, 3);
        assert.equal(udp.sockets[0].sent.length, 3);
        assert.equal(httpTransport.calls.filter(call => call.action === 'RequestAccess').length, 1);
        assert.equal(httpTransport.calls.filter(call => call.action === 'InjectKeyboardKey').length, 0);
    } finally {
        client.close();
    }
});

test('text timeout configuration cannot remove the 15-second maximum', async () => {
    const transport = delayedTextTransport(0);
    const client = new LoeweClient({ host: 'tv.example' }, transport);
    try {
        for (const options of [null, [], { timeoutMs: 0 }, { timeoutMs: 15001 }, { timeoutMs: Infinity }, { timeoutMs: '50' }]) {
            await assert.rejects(client.text('A', options), { code: 'VALIDATION' });
        }
        await assert.rejects(client.text('A'.repeat(2049)), { code: 'VALIDATION' });
        await assert.rejects(client.text('💡'.repeat(2049)), { code: 'VALIDATION' });
        await assert.rejects(client.text('A'.repeat(1000000)), { code: 'VALIDATION' });
        assert.equal(transport.calls.length, 0);
    } finally {
        client.close();
    }
});
