'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { discoverTvs } = require('../lib/tv-discovery');

const INTERFACES = {
    lo: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
    eth0: [{ family: 'IPv4', address: '192.168.1.10', netmask: '255.255.255.0', internal: false }],
    wlan0: [{ family: 4, address: '10.0.0.10', netmask: '255.255.255.0', internal: false }],
};

function escape(value) {
    return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function description({
    name = 'Wohnzimmer', manufacturer = 'LOEWE', model = 'Loewe bild 7.55',
    type = 'urn:schemas-upnp-org:device:MediaRenderer:1', modelDescription = 'Loewe TV',
} = {}) {
    return '<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device>'
        + `<deviceType>${escape(type)}</deviceType><friendlyName>${escape(name)}</friendlyName>`
        + `<manufacturer>${escape(manufacturer)}</manufacturer><modelName>${escape(model)}</modelName>`
        + `<modelDescription>${escape(modelDescription)}</modelDescription></device></root>`;
}

function response(host, { location = `http://${host}:1543/happy`, extra = '', status = 'HTTP/1.1 200 OK' } = {}) {
    return Buffer.from(`${status}\r\nST: upnp:rootdevice\r\nLOCATION: ${location}\r\n`
        + `USN: uuid:same-udn-allowed-on-two-interfaces::upnp:rootdevice\r\n${extra}\r\n`);
}

function fakeNetwork({ interfaces = INTERFACES, onSearch, descriptions = {}, ports = {}, bindError, sendError } = {}) {
    const sockets = [];
    const requests = [];
    const probes = [];
    function createSocket(options) {
        assert.deepEqual(options, { type: 'udp4', reuseAddr: false });
        const socket = new EventEmitter();
        socket.sends = [];
        socket.closed = false;
        socket.bind = options => {
            socket.bound = options;
            queueMicrotask(() => {
                if (bindError) socket.emit('error', Object.assign(new Error('Cannot bind'), { code: bindError }));
                else socket.emit('listening');
            });
        };
        socket.setMulticastInterface = address => { socket.multicastInterface = address; };
        socket.setMulticastTTL = ttl => { socket.ttl = ttl; };
        socket.send = (buffer, port, host, callback) => {
            assert.equal(socket.closed, false);
            socket.sends.push({ message: buffer.toString('utf8'), port, host });
            queueMicrotask(() => {
                callback(sendError ? Object.assign(new Error('Cannot send'), { code: sendError }) : null);
                if (!socket.closed) onSearch?.(socket);
            });
        };
        socket.close = () => { socket.closed = true; };
        sockets.push(socket);
        return socket;
    }
    function request(options, callback) {
        const url = `http://${options.hostname}:${options.port}${options.path}`;
        const config = descriptions[url] || descriptions[options.hostname] || {};
        const req = new EventEmitter();
        Object.assign(req, { options, destroyed: false });
        req.destroy = () => { req.destroyed = true; };
        req.end = () => queueMicrotask(() => {
            if (req.destroyed || config.hang) return;
            if (config.error) { req.emit('error', new Error(config.error)); return; }
            const res = new EventEmitter();
            Object.assign(res, { statusCode: config.status || 200, headers: config.headers || {}, destroyed: false });
            res.destroy = () => { res.destroyed = true; };
            req.response = res;
            callback(res);
            if (res.destroyed) return;
            if (config.xml !== undefined) res.emit('data', Buffer.from(config.xml));
            if (config.bytes) res.emit('data', Buffer.alloc(config.bytes, 32));
            if (config.partial) return;
            if (config.aborted) { res.emit('aborted'); return; }
            if (!res.destroyed) res.emit('end');
        });
        requests.push(req);
        return req;
    }
    function connect(options) {
        const socket = new EventEmitter();
        Object.assign(socket, { options, destroyed: false });
        socket.destroy = () => { socket.destroyed = true; };
        queueMicrotask(() => {
            if (socket.destroyed || ports[options.host] === 'hang') return;
            if (ports[options.host] === false) socket.emit('error', new Error('Connection refused'));
            else socket.emit('connect');
        });
        probes.push(socket);
        return socket;
    }
    return {
        deps: { networkInterfaces: () => interfaces, createSocket, request, connect, timeoutMs: 60 },
        sockets, requests, probes,
    };
}

test('discovers every responding TV across IPv4 interfaces and deduplicates each address', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.35', '10.0.0.42', '192.168.1.36']) {
                socket.emit('message', response(host), { address: host });
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: {
            '192.168.1.35': { xml: description() },
            '192.168.1.36': { xml: description({ name: 'Küche', model: 'Loewe bild 5.32' }) },
            '10.0.0.42': { xml: description({ name: 'Schlafzimmer' }) },
        },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices.map(device => device.host), ['10.0.0.42', '192.168.1.35', '192.168.1.36']);
    assert.equal(result.devices[2].name, 'Küche');
    assert.equal(result.devices[2].model, 'Loewe bild 5.32');
    assert.equal(result.devices.every(device => device.apiReachable && device.port === 905), true);
    assert.equal(network.requests.length, 3);
    assert.equal(network.probes.length, 3);
    assert.equal(network.sockets.length, 2);
    assert.equal(network.sockets.every(socket => socket.closed), true);
    assert.equal(network.probes.every(socket => socket.destroyed), true);
    assert.deepEqual(result.warnings, []);
});

test('searches on each LAN address with native rootdevice target, repeats, and ephemeral ports', async () => {
    const network = fakeNetwork();
    assert.deepEqual(await discoverTvs(network.deps), { devices: [], warnings: [] });
    for (const socket of network.sockets) {
        assert.equal(socket.bound.port, 0);
        assert.equal(socket.bound.address, socket.multicastInterface);
        assert.equal(socket.sends.length, 2);
        assert.equal(socket.ttl, 2);
        for (const sent of socket.sends) {
            assert.equal(sent.host, '239.255.255.250');
            assert.equal(sent.port, 1900);
            assert.match(sent.message, /^M-SEARCH \* HTTP\/1\.1\r\n/);
            assert.match(sent.message, /\r\nST: upnp:rootdevice\r\n/);
            assert.match(sent.message, /\r\nMX: 3\r\n/);
            assert.match(sent.message, /\r\nMAN: "ssdp:discover"\r\n/);
            assert.equal(sent.message.endsWith('\r\n\r\n'), true);
            assert.equal(sent.message.includes('\0'), false);
        }
    }
});

test('ignores other manufacturers and Loewe speakers, even if they are media renderers', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.30', '192.168.1.31', '192.168.1.32']) {
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: {
            '192.168.1.30': { xml: description({ manufacturer: 'Samsung', model: 'TV', name: 'Loewe' }) },
            '192.168.1.31': { xml: description({ manufacturer: 'LoeweFake', model: 'TV' }) },
            '192.168.1.32': { xml: description({ name: 'TV', model: 'klang mr5', modelDescription: 'TV soundbar' }) },
        },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices, []);
    assert.equal(network.requests.length, 3);
    assert.equal(network.probes.length, 0);
});

test('reports a Loewe TV with a closed port without claiming API compatibility', async () => {
    const host = '192.168.1.26';
    const network = fakeNetwork({
        onSearch: socket => socket.emit('message', response(host), { address: host }),
        descriptions: { [host]: { xml: description({ model: 'Loewe Connect 26 SL' }) } },
        ports: { [host]: false },
    });
    const result = await discoverTvs({ ...network.deps, port: 906 });
    assert.equal(result.devices.length, 1);
    assert.equal(result.devices[0].apiReachable, false);
    assert.equal(result.devices[0].port, 906);
    assert.deepEqual(network.probes[0].options, { host, port: 906, family: 4 });
    assert.equal(Object.hasOwn(result.devices[0], 'compatible'), false);
});

test('offers a generically described Loewe with a custom name when its control port is reachable', async () => {
    const host = '192.168.1.35';
    const network = fakeNetwork({
        onSearch: socket => socket.emit('message', response(host), { address: host }),
        descriptions: { [host]: { xml: description({ name: 'Wohnzimmer', model: 'MediaRenderer', modelDescription: '' }) } },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices, [{ host, name: 'Wohnzimmer', model: 'MediaRenderer', port: 905, apiReachable: true }]);
    assert.equal(network.probes.length, 1);
    assert.deepEqual(result.warnings, []);
});

test('generic Loewe metadata with a closed port is reported as an unconfirmed device', async () => {
    const host = '192.168.1.35';
    const network = fakeNetwork({
        onSearch: socket => socket.emit('message', response(host), { address: host }),
        descriptions: { [host]: { xml: description({ model: 'MediaRenderer', modelDescription: '' }) } },
        ports: { [host]: false },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices, []);
    assert.equal(network.probes.length, 1);
    assert.ok(result.warnings.some(warning => warning.includes('no TV model information')));
});

test('a later description can identify an initially generic Loewe TV with an unreachable port', async () => {
    const host = '192.168.1.35';
    const network = fakeNetwork({
        onSearch: socket => {
            for (const port of [1543, 1545]) {
                socket.emit('message', response(host, { location: `http://${host}:${port}/happy` }), { address: host });
            }
        },
        descriptions: {
            [`http://${host}:1543/happy`]: { xml: description({ model: 'MediaRenderer', modelDescription: '' }) },
            [`http://${host}:1545/happy`]: { xml: description() },
        },
        ports: { [host]: false },
    });
    const result = await discoverTvs(network.deps);
    assert.equal(result.devices.length, 1);
    assert.equal(result.devices[0].model, 'Loewe bild 7.55');
    assert.equal(result.devices[0].apiReachable, false);
    assert.equal(network.probes.length, 1);
    assert.deepEqual(result.warnings, []);
});

test('different descriptions on one TV yield one choice and only one control-port check', async () => {
    const host = '192.168.1.35';
    const network = fakeNetwork({
        onSearch: socket => {
            for (const port of [1543, 1545]) {
                socket.emit('message', response(host, { location: `http://${host}:${port}/happy` }), { address: host });
            }
        },
        descriptions: {
            [`http://${host}:1543/happy`]: { xml: description({ type: 'urn:schemas-upnp-org:device:MediaServer:1' }) },
            [`http://${host}:1545/happy`]: { xml: description() },
        },
    });
    const result = await discoverTvs(network.deps);
    assert.equal(result.devices.length, 1);
    assert.equal(network.requests.length, 2);
    assert.equal(network.probes.length, 1);
});

test('reads XML namespace prefixes, entities and embedded TV descriptions', async () => {
    const host = '192.168.1.35';
    const xml = '<d:root xmlns:d="urn:schemas-upnp-org:device-1-0"><d:device>'
        + '<d:manufacturer>Other</d:manufacturer><d:deviceList><d:device>'
        + '<d:manufacturer>Loewe Opta GmbH</d:manufacturer>'
        + '<d:friendlyName>Wohnzimmer &amp; Küche</d:friendlyName><d:modelName>SL420</d:modelName>'
        + '</d:device></d:deviceList></d:device></d:root>';
    const network = fakeNetwork({
        onSearch: socket => socket.emit('message', response(host), { address: host }),
        descriptions: { [host]: { xml } },
    });
    const { devices } = await discoverTvs(network.deps);
    assert.equal(devices[0].name, 'Wohnzimmer & Küche');
    assert.equal(devices[0].model, 'SL420');
});

test('never fetches offhost, DNS, credential, loopback, internet, broadcast or non-HTTP locations', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const location of [
                'http://192.168.1.99/happy', 'http://tv.example/happy', 'http://127.0.0.1/happy',
                'http://user:pass@192.168.1.35/happy', 'https://192.168.1.35/happy',
                'file:///tmp/file', 'http://192.168.1.35/happy#fragment',
            ]) socket.emit('message', response('192.168.1.35', { location }), { address: '192.168.1.35' });
            for (const host of ['127.0.0.1', '8.8.8.8', '192.168.1.255', '192.168.1.0', '192.168.1.10', '172.18.0.20']) {
                socket.emit('message', response(host), { address: host });
            }
        },
    });
    assert.deepEqual((await discoverTvs(network.deps)).devices, []);
    assert.equal(network.requests.length, 0);
    assert.equal(network.probes.length, 0);
});

test('rejects malformed SSDP, duplicate LOCATION and oversized UDP messages', async () => {
    const host = '192.168.1.35';
    const network = fakeNetwork({
        onSearch: socket => {
            for (const message of [
                response(host, { status: 'NOTIFY * HTTP/1.1' }), response(host, { status: 'HTTP/1.1 500 Error' }),
                response(host, { extra: `location: http://${host}:1543/other\r\n` }),
                response(host, { extra: `X-Header: ${'a'.repeat(9000)}\r\n` }),
                Buffer.from('HTTP/1.1 200 OK\r\nNot a header\r\n\r\n'),
            ]) socket.emit('message', message, { address: host });
        },
    });
    await discoverTvs(network.deps);
    assert.equal(network.requests.length, 0);
});

test('HTTP redirects and compressed bodies are never followed or unpacked', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.35', '192.168.1.36']) {
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: {
            '192.168.1.35': { status: 302, headers: { location: 'http://8.8.8.8/private' } },
            '192.168.1.36': { headers: { 'content-encoding': 'gzip' }, xml: description() },
        },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices, []);
    assert.equal(network.requests.length, 2);
    assert.equal(network.requests.every(req => req.destroyed && req.response.destroyed), true);
});

test('description reads have body and declared-length limits', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.35', '192.168.1.36']) {
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: {
            '192.168.1.35': { headers: { 'content-length': String(128 * 1024 + 1) } },
            '192.168.1.36': { bytes: 128 * 1024 + 1, partial: true },
        },
    });
    assert.deepEqual((await discoverTvs(network.deps)).devices, []);
    assert.equal(network.requests.every(req => req.destroyed && req.response.destroyed), true);
});

test('malformed, DTD and deeply nested descriptions do not stop another TV being discovered', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.30', '192.168.1.31', '192.168.1.32', '192.168.1.35']) {
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: {
            '192.168.1.30': { xml: '<root><device></root>' },
            '192.168.1.31': { xml: '<!DOCTYPE root [<!ENTITY hi "Loewe">]><root>&hi;</root>' },
            '192.168.1.32': { xml: '<root>'.repeat(40) + '</root>'.repeat(40) },
            '192.168.1.35': { xml: description() },
        },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices.map(device => device.host), ['192.168.1.35']);
});

test('one overall deadline bounds hanging description headers, body and TCP checks', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.30', '192.168.1.31', '192.168.1.35']) {
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: {
            '192.168.1.30': { hang: true },
            '192.168.1.31': { xml: '<root>', partial: true },
            '192.168.1.35': { xml: description() },
        },
        ports: { '192.168.1.35': 'hang' },
    });
    const start = performance.now();
    const result = await discoverTvs({ ...network.deps, timeoutMs: 80 });
    assert.ok(performance.now() - start < 1000, 'search must not wait for per-host timeouts after its global deadline');
    assert.equal(result.devices.length, 1);
    assert.equal(result.devices[0].apiReachable, false);
    assert.ok(result.warnings.some(warning => /time limit|timed out/.test(warning)));
    assert.equal(network.requests.every(req => req.destroyed), true);
    assert.equal(network.probes.every(socket => socket.destroyed), true);
    assert.equal(network.sockets.every(socket => socket.closed), true);
});

test('abort closes UDP sockets, active HTTP requests and port checks; late errors remain handled', async () => {
    const controller = new AbortController();
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.30', '192.168.1.35']) {
                socket.emit('message', response(host), { address: host });
            }
        },
        descriptions: { '192.168.1.30': { hang: true }, '192.168.1.35': { xml: description() } },
        ports: { '192.168.1.35': 'hang' },
    });
    const operation = discoverTvs({ ...network.deps, signal: controller.signal, timeoutMs: 500 });
    const assertion = assert.rejects(operation, { code: 'ABORTED' });
    await nextTurn();
    assert.equal(network.requests.length, 2);
    assert.equal(network.probes.length, 1);
    controller.abort();
    await assertion;
    assert.equal(network.sockets.every(socket => socket.closed), true);
    assert.equal(network.requests[0].destroyed, true);
    assert.equal(network.probes[0].destroyed, true);
    network.requests[0].emit('error', new Error('late HTTP error'));
    network.probes[0].emit('error', new Error('late TCP error'));
    network.sockets[0].emit('error', new Error('late UDP error'));
    await nextTurn();
    assert.equal(network.requests.length, 2);
});

test('a signal cancelled before discovery creates no network resources', async () => {
    const controller = new AbortController();
    controller.abort();
    const network = fakeNetwork();
    await assert.rejects(discoverTvs({ ...network.deps, signal: controller.signal }), { code: 'ABORTED' });
    assert.equal(network.sockets.length, 0);
    assert.equal(network.requests.length, 0);
});

test('at most four description and port jobs run together even for many responders', async () => {
    const controller = new AbortController();
    const descriptions = {};
    for (let last = 20; last < 80; last++) descriptions[`192.168.1.${last}`] = { hang: true };
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of Object.keys(descriptions)) socket.emit('message', response(host), { address: host });
        },
        descriptions,
    });
    const operation = discoverTvs({ ...network.deps, signal: controller.signal, timeoutMs: 500 });
    const assertion = assert.rejects(operation, { code: 'ABORTED' });
    await nextTurn();
    assert.equal(network.requests.length, 4);
    controller.abort();
    await assertion;
    assert.equal(network.requests.length, 4, 'queued requests must not start after abort');
    assert.equal(network.requests.every(req => req.destroyed), true);
});

test('several slow descriptions from one host do not occupy the slots needed for other TVs', async () => {
    const maxActiveBySlowHost = new Map([['192.168.1.30', 0], ['192.168.1.31', 0]]);
    const network = fakeNetwork({
        onSearch: socket => {
            for (const host of ['192.168.1.30', '192.168.1.31', '192.168.1.35', '192.168.1.36']) {
                for (const port of [1543, 1545, 1547]) {
                    socket.emit('message', response(host, { location: `http://${host}:${port}/happy` }), { address: host });
                }
            }
        },
        descriptions: {
            '192.168.1.30': { hang: true },
            '192.168.1.31': { hang: true },
            '192.168.1.35': { xml: description({ name: 'Wohnzimmer' }) },
            '192.168.1.36': { xml: description({ name: 'Schlafzimmer' }) },
        },
    });
    const request = network.deps.request;
    network.deps.request = (options, callback) => {
        const req = request(options, callback);
        if (maxActiveBySlowHost.has(options.hostname)) {
            const active = network.requests.filter(candidate => candidate.options.hostname === options.hostname
                && !candidate.destroyed).length;
            maxActiveBySlowHost.set(options.hostname, Math.max(maxActiveBySlowHost.get(options.hostname), active));
        }
        return req;
    };
    const result = await discoverTvs({ ...network.deps, timeoutMs: 80 });
    assert.deepEqual(result.devices.map(device => device.host), ['192.168.1.35', '192.168.1.36']);
    assert.deepEqual(network.requests.slice(0, 4).map(req => req.options.hostname), [
        '192.168.1.30', '192.168.1.31', '192.168.1.35', '192.168.1.36',
    ]);
    // A description timeout can free its slot just before the global deadline
    // and allow another URL from that host. Only overlapping requests violate
    // host fairness; the fake request's destroyed flag tracks that lifetime.
    for (const [host, maximum] of maxActiveBySlowHost) {
        assert.equal(maximum, 1, `Only one description from ${host} may be active at a time`);
        assert.ok(network.requests.filter(req => req.options.hostname === host).every(req => req.destroyed));
    }
    assert.equal(network.probes.length, 2);
});

test('caps distinct descriptions per source address', async () => {
    const host = '192.168.1.35';
    const network = fakeNetwork({
        onSearch: socket => {
            for (let index = 0; index < 20; index++) {
                socket.emit('message', response(host, { location: `http://${host}:1543/description-${index}` }), { address: host });
            }
        },
    });
    await discoverTvs(network.deps);
    assert.equal(network.requests.length, 3);
});

test('a flood of unique description locations remains bounded', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (let last = 20; last < 170; last++) {
                const host = `192.168.1.${last}`;
                for (const port of [1543, 1545]) {
                    socket.emit('message', response(host, { location: `http://${host}:${port}/happy` }), { address: host });
                }
            }
        },
    });
    const result = await discoverTvs({ ...network.deps, timeoutMs: 200 });
    assert.ok(network.requests.length <= 256);
    assert.ok(result.warnings.some(warning => warning.includes('256')));
    assert.equal(network.sockets.every(socket => socket.closed), true);
});

test('an oversized reply burst stops receiving and releases the sockets', async () => {
    const network = fakeNetwork({
        onSearch: socket => {
            for (let index = 0; index < 4200; index++) socket.emit('message', Buffer.from('invalid'), { address: '192.168.1.30' });
        },
    });
    const result = await discoverTvs(network.deps);
    assert.deepEqual(result.devices, []);
    assert.ok(result.warnings.some(warning => warning.includes('4096')));
    assert.equal(network.requests.length, 0);
    assert.equal(network.sockets.every(socket => socket.closed), true);
});

test('a UDP bind that never finishes reaches the deadline and closes if it later starts', async () => {
    const socket = new EventEmitter();
    let closed = 0;
    socket.bind = () => {};
    socket.close = () => { closed++; };
    await assert.rejects(discoverTvs({
        networkInterfaces: () => ({ eth0: INTERFACES.eth0 }), createSocket: () => socket, timeoutMs: 30,
    }), { code: 'DISCOVERY_UNAVAILABLE' });
    const afterStop = closed;
    socket.emit('listening');
    assert.equal(closed, afterStop + 1);
});

test('a broken interface does not prevent another LAN interface from finding TVs', async () => {
    const network = fakeNetwork({
        onSearch: socket => socket.emit('message', response('192.168.1.35'), { address: '192.168.1.35' }),
        descriptions: { '192.168.1.35': { xml: description() } },
    });
    const originalCreate = network.deps.createSocket;
    let count = 0;
    network.deps.createSocket = options => {
        if (++count === 2) throw Object.assign(new Error('Unavailable interface'), { code: 'EADDRNOTAVAIL' });
        return originalCreate(options);
    };
    const result = await discoverTvs(network.deps);
    assert.equal(result.devices.length, 1);
    assert.ok(result.warnings.length > 0);
});

test('all bind failures or all send failures return a useful error instead of empty success', async () => {
    for (const config of [{ bindError: 'EACCES' }, { sendError: 'ENETUNREACH' }]) {
        const network = fakeNetwork(config);
        await assert.rejects(discoverTvs(network.deps), { code: 'DISCOVERY_UNAVAILABLE' });
        assert.equal(network.sockets.every(socket => socket.closed), true);
        assert.equal(network.requests.length, 0);
    }
});

test('no LAN, invalid masks and IPv6-only interfaces fail without creating sockets', async () => {
    for (const interfaces of [
        {}, { lo: INTERFACES.lo }, { eth0: [{ family: 'IPv6', address: 'fe80::1', internal: false }] },
        { eth0: [{ family: 'IPv4', address: '192.168.1.10', netmask: '255.0.255.0' }] },
        { eth0: [{ family: 'IPv4', address: '192.168.1.10', netmask: '0.0.0.0' }] },
    ]) {
        const network = fakeNetwork({ interfaces });
        await assert.rejects(discoverTvs(network.deps), { code: 'NO_INTERFACES' });
        assert.equal(network.sockets.length, 0);
    }
});

test('invalid discovery settings never open a socket', async () => {
    for (const config of [{ port: 0 }, { port: 65536 }, { port: '905' }, { port: 905.1 }, { timeoutMs: Infinity }, { timeoutMs: 30000 }]) {
        const network = fakeNetwork();
        await assert.rejects(discoverTvs({ ...network.deps, ...config }), { code: 'VALIDATION' });
        assert.equal(network.sockets.length, 0);
    }
});
