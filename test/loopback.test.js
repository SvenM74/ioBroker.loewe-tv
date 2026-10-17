'use strict';

// Real HTTP and UDP sockets, bound only to the local test machine. No TV or
// network broadcast is contacted. Protocol unit tests also cover edge cases
// using fake transports; these cases check Node's actual socket lifecycle.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const dgram = require('node:dgram');
const { performance } = require('node:perf_hooks');
const { LoeweClient, createWolPacket } = require('../lib/loewe-client');

const namespace = 'urn:loewe.de:RemoteTV:Tablet';
const reply = (action, fields = '') => '<?xml version="1.0" encoding="UTF-8"?>'
    + '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
    + `xmlns:m="${namespace}"><s:Body><m:${action}Response>${fields}`
    + `</m:${action}Response></s:Body></s:Envelope>`;

async function fixture(t, respond) {
    const calls = [];
    const server = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            const body = Buffer.concat(chunks);
            const action = request.headers.soapaction?.match(/#([^"\s]+)"?$/)?.[1];
            calls.push({ action, body, headers: request.headers, path: request.url });
            respond(action, request, response, body);
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const client = new LoeweClient({ host: '127.0.0.1', port: server.address().port, timeout: 1000 });
    t.after(async () => {
        client.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    return { client, server, calls };
}

test('real HTTP carries the handshake, NUL-terminated commands and preserved TV identifiers', async t => {
    const h = await fixture(t, (action, _request, response) => {
        const payload = action === 'RequestAccess' ? '<m:ClientId>000123</m:ClientId>'
            : action === 'GetDeviceData' ? '<m:MAC-Address>02:00:00:00:00:77</m:MAC-Address>'
                : action === 'GetVolume' ? '<m:Value>170000</m:Value>' : '';
        response.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
        response.end(reply(action, payload) + '\0');
    });
    const device = await h.client.getDeviceData();
    assert.equal(device.data.Envelope.Body.GetDeviceDataResponse['MAC-Address'], '02:00:00:00:00:77');
    assert.equal(await h.client.getVolume(), 17);
    await h.client.key('digit_9');
    assert.deepEqual(h.calls.map(call => call.action), ['RequestAccess', 'GetDeviceData', 'GetVolume', 'InjectRCKey']);
    for (const call of h.calls) {
        assert.equal(call.path, '/loewe_tablet_0001');
        assert.equal(call.body.at(-1), 0);
        assert.equal(Number(call.headers['content-length']), call.body.length);
        if (call.action !== 'RequestAccess') assert.match(call.body.toString(), /<ClientId>000123<\/ClientId>/);
    }
    assert.match(h.calls.at(-1).body.toString(), /alphabet="l2700" mode="press" value="9"/);
    assert.match(h.calls.at(-1).body.toString(), /mode="release" value="9"/);
});

test('real incomplete HTTP response hits the total deadline and leaves the event loop responsive', async t => {
    const h = await fixture(t, (action, _request, response) => {
        if (action === 'RequestAccess') {
            response.end(reply(action, '<m:ClientId>000123</m:ClientId>'));
        } else {
            response.writeHead(200, { 'Content-Type': 'text/xml' });
            response.write('<s:Envelope');
            // Deliberately do not finish: emulate a sleeping or broken TV.
        }
    });
    h.client.timeout = 100;
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    try {
        await assert.rejects(h.client.getVolume(), error => error.code === 'NETWORK' && error.transportCode === 'ETIMEDOUT');
        assert.ok(ticks > 0, 'Other Node work must continue while the TV does not answer');
        assert.equal(h.client.isSessionReady, false);
        assert.equal(h.calls.filter(call => call.action === 'GetVolume').length, 1, 'No automatic resend');
    } finally {
        clearInterval(timer);
    }
});

test('real HTTP with an internal NUL run is rejected without the old regex stall', async t => {
    const h = await fixture(t, (action, _request, response) => {
        const payload = action === 'RequestAccess' ? '<m:ClientId>1</m:ClientId>' : '<m:Value>120000</m:Value>';
        response.end(reply(action, payload) + (action === 'GetVolume' ? '\0'.repeat(40000) + '\n' : ''));
    });
    const start = performance.now();
    await assert.rejects(h.client.getVolume(), error => error.code === 'INVALID_RESPONSE');
    assert.ok(performance.now() - start < 750, 'A 40 KB malformed reply must not occupy the CPU for seconds');
});

test('real UDP delivers repeated WOL packets to an isolated loopback receiver', async t => {
    const receiver = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => {
        receiver.once('error', reject);
        receiver.bind(0, '127.0.0.1', resolve);
    });
    const receiverPort = receiver.address().port;
    const packets = [];
    let finish;
    const received = new Promise(resolve => { finish = resolve; });
    receiver.on('message', packet => {
        packets.push(packet);
        if (packets.length === 3) finish();
    });
    const client = new LoeweClient({ host: '127.0.0.1', timeout: 1000 }, {
        createSocket(type) {
            const socket = dgram.createSocket(type);
            const send = socket.send.bind(socket);
            socket.send = (bytes, offset, length, port, address, callback) => {
                assert.equal(port, 9);
                assert.equal(address, '127.0.0.1');
                // Preserve the production UDP socket, bind/broadcast/send/close
                // path, but route port 9 to our ephemeral unprivileged receiver.
                return send(bytes, offset, length, receiverPort, '127.0.0.1', callback);
            };
            return socket;
        },
    });
    t.after(() => { client.close(); receiver.close(); });
    let timer;
    try {
        const result = await client.wake('02:00:00:00:00:77', '127.0.0.1', { repeats: 3, intervalMs: 10, autoBroadcast: true });
        await Promise.race([received, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Missing loopback UDP packets')), 1000);
        })]);
        assert.equal(result.repeats, 3);
        assert.deepEqual(result.targets, ['127.0.0.1']);
        assert.equal(packets.length, 3);
        for (const packet of packets) assert.deepEqual(packet, createWolPacket('02:00:00:00:00:77'));
    } finally {
        clearTimeout(timer);
    }
});
