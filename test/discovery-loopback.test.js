'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { discoverTvs } = require('../lib/tv-discovery');

const HOSTS = ['192.0.2.20', '192.0.2.21'];

function announcements(hosts) {
    const sockets = [];
    return {
        sockets,
        networkInterfaces: () => ({ test: [{ family: 'IPv4', address: '192.0.2.10', netmask: '255.255.255.0' }] }),
        createSocket() {
            const socket = new EventEmitter();
            socket.closed = false;
            socket.bind = () => queueMicrotask(() => socket.emit('listening'));
            socket.setMulticastInterface = () => {};
            socket.setMulticastTTL = () => {};
            socket.send = (_, __, ___, callback) => queueMicrotask(() => {
                callback(null);
                if (socket.closed) return;
                for (const host of hosts) {
                    socket.emit('message', Buffer.from('HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\n'
                        + `LOCATION: http://${host}:1543/description.xml\r\n\r\n`), { address: host });
                }
            });
            socket.close = () => { socket.closed = true; };
            sockets.push(socket);
            return socket;
        },
    };
}

async function listen(t, server) {
    const sockets = new Set();
    server.on('connection', socket => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });
    t.after(async () => {
        for (const socket of sockets) socket.destroy();
        if (server.listening) await new Promise(resolve => server.close(resolve));
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { port: server.address().port, sockets };
}

test('real HTTP chunking and TCP events discover multiple TVs and send no control payload', async t => {
    const seenHttp = [];
    let controlBytes = 0;
    let controlConnections = 0;
    const descriptions = http.createServer((req, res) => {
        seenHttp.push({ method: req.method, url: req.url });
        res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
        res.write('<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device>');
        setImmediate(() => {
            res.write('<manufacturer>LOEWE</manufacturer><modelName>bild 7.55</modelName>');
            res.end('<friendlyName>Küche &amp; Wohnzimmer</friendlyName></device></root>');
        });
    });
    const control = net.createServer(socket => {
        controlConnections++;
        socket.on('data', chunk => { controlBytes += chunk.length; });
    });
    const descriptionServer = await listen(t, descriptions);
    const controlServer = await listen(t, control);
    const network = announcements(HOSTS);
    const probes = [];
    const requests = [];
    const result = await discoverTvs({
        ...network,
        timeoutMs: 500,
        // Only the injected transport factory substitutes loopback endpoints.
        // Production URL validation still sees distinct local test addresses.
        request(options, callback) {
            assert.ok(HOSTS.includes(options.hostname));
            assert.equal(options.port, 1543);
            assert.equal(options.path, '/description.xml');
            assert.equal(options.agent, false);
            const req = http.request({ ...options, hostname: '127.0.0.1', port: descriptionServer.port }, callback);
            requests.push(req);
            return req;
        },
        connect(options) {
            assert.ok(HOSTS.includes(options.host));
            assert.equal(options.port, 905);
            const socket = net.createConnection({ ...options, host: '127.0.0.1', port: controlServer.port });
            probes.push(socket);
            return socket;
        },
    });
    assert.deepEqual(result.devices.map(device => device.host), HOSTS);
    assert.equal(result.devices.every(device => device.apiReachable), true);
    assert.equal(result.devices.every(device => device.name === 'Küche & Wohnzimmer'), true);
    assert.deepEqual(seenHttp, HOSTS.map(() => ({ method: 'GET', url: '/description.xml' })));
    assert.equal(controlConnections, 2);
    assert.equal(controlBytes, 0, 'A port check must never send SOAP, access requests or control commands');
    assert.equal(requests.every(req => req.destroyed), true);
    assert.equal(probes.every(socket => socket.destroyed), true);
    assert.equal(network.sockets.every(socket => socket.closed), true);
    assert.deepEqual(result.warnings, []);
});

test('abort destroys real unfinished HTTP responses and settles without waiting for remote close', async t => {
    let gotRequest;
    const received = new Promise(resolve => { gotRequest = resolve; });
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.write('<root><device>');
        gotRequest();
        // Intentionally leave the response open to test destroy/aborted/close.
    });
    const endpoint = await listen(t, server);
    const controller = new AbortController();
    const network = announcements([HOSTS[0]]);
    const requests = [];
    const result = discoverTvs({
        ...network,
        timeoutMs: 1000,
        signal: controller.signal,
        request(options, callback) {
            const req = http.request({ ...options, hostname: '127.0.0.1', port: endpoint.port }, callback);
            requests.push(req);
            return req;
        },
        connect() { assert.fail('An unfinished description cannot initiate a control-port check'); },
    });
    const rejected = assert.rejects(result, { code: 'ABORTED' });
    await received;
    controller.abort();
    await rejected;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].destroyed, true);
    assert.equal(network.sockets.every(socket => socket.closed), true);
    // Let Node deliver asynchronous destroy/error/close events while the test
    // is still active, so an unhandled late error is reported by the runner.
    await nextTurn();
    await nextTurn();
});
