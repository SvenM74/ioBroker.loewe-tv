'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BRIDGE = fs.readFileSync(path.join(__dirname, '../admin/epg-bridge.js'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '../admin/jsonConfig.json'), 'utf8'));
const REVISION = 'a'.repeat(64);
const CHANGED_REVISION = 'b'.repeat(64);
const NO_RESPONSE = Symbol('no response');

function page(total = 2, offset = 0, limit = 32, extra = {}) {
    const channels = Array.from({ length: Math.min(limit, total - offset) }, (_, i) => ({
        id: `channels.tv.station_${offset + i}`, number: offset + i + 1,
        name: `Sender ${offset + i + 1}`, status: 'ready', events: [],
    }));
    return {
        schemaVersion: 1, source: 'tv', instance: 'loewe-tv.3', listView: 'my-list', listName: 'Meine Sender',
        catalogRevision: REVISION, from: 100000, to: 200000, channels, total,
        nextOffset: offset + channels.length < total ? offset + channels.length : null,
        ...extra,
    };
}

function browser(options = {}) {
    let now = 100000;
    let timerId = 0;
    const timers = new Map();
    const events = new Map();
    const scripts = [];
    const sockets = [];
    const requests = [];
    const connectionOptions = [];
    const issuedEvents = [];
    const setTimeout = (callback, delay = 0) => {
        const id = ++timerId;
        timers.set(id, { callback, at: now + delay });
        return id;
    };
    const clearTimeout = id => timers.delete(id);
    class Clock extends Date { static now() { return now; } }
    const io = {
        connect(url, opts) {
            connectionOptions.push({ url, options: opts });
            const handlers = new Map();
            const socket = {
                connected: false, destroyed: false, authenticated: false,
                on(name, callback) {
                    if (!handlers.has(name)) handlers.set(name, new Set());
                    handlers.get(name).add(callback);
                },
                off(name, callback) { handlers.get(name)?.delete(callback); },
                trigger(name, ...args) { for (const callback of [...(handlers.get(name) || [])]) callback(...args); },
                emit(name, ...args) {
                    if (name === 'authenticate') {
                        if (options.auth === NO_RESPONSE) return;
                        queueMicrotask(() => {
                            socket.authenticated = options.auth !== false;
                            args[0](socket.authenticated, true);
                        });
                    } else {
                        assert.equal(name, 'sendTo');
                        assert.equal(socket.authenticated, true, 'authenticate before sendTo');
                        const [instance, command, payload, callback] = args;
                        const request = { instance, command, payload: JSON.parse(JSON.stringify(payload)), callback };
                        requests.push(request);
                        const response = options.respond ? options.respond(request, requests.length)
                            : command === 'getEpgGuide' ? page() : { accepted: true, status: 'started', instance };
                        if (response !== NO_RESPONSE) queueMicrotask(() => callback(response));
                    }
                },
                destroy() {
                    socket.destroyed = true;
                    socket.connected = false;
                    socket.trigger('disconnect');
                },
            };
            sockets.push(socket);
            if (options.connect !== NO_RESPONSE) queueMicrotask(() => {
                if (!socket.destroyed) {
                    socket.connected = true;
                    socket.trigger('connect');
                }
            });
            return socket;
        },
    };
    const window = {
        location: new URL(options.href || 'https://broker.example/iobroker/admin/adapter/loewe-tv/epg.html?instance=3'),
        navigator: { language: options.language || 'de-DE' },
        setTimeout, clearTimeout,
        addEventListener(name, callback) {
            if (!events.has(name)) events.set(name, new Set());
            events.get(name).add(callback);
        },
        dispatchEvent(event) {
            issuedEvents.push(event.type);
            for (const callback of events.get(event.type) || []) callback(event);
        },
        document: {
            createElement(name) {
                assert.equal(name, 'script');
                return { remove() { this.removed = true; } };
            },
            head: { appendChild(script) {
                scripts.push(script);
                if (options.script !== NO_RESPONSE) queueMicrotask(() => {
                    if (script.removed) return;
                    if (options.script === false) script.onerror?.();
                    else { window.io = io; script.onload?.(); }
                });
            } },
        },
        URL, Date: Clock, CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    };
    if (!options.loadScript) window.io = io;
    window.window = window;
    vm.runInNewContext(BRIDGE, window, { filename: 'admin/epg-bridge.js' });
    const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
    return {
        bridge: window.LoeweEpgBridge, window, sockets, requests, connectionOptions, scripts, issuedEvents, timers, flush,
        async advance(ms) {
            const target = now + ms;
            for (;;) {
                const due = [...timers].filter(([, entry]) => entry.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                now = due[1].at;
                timers.delete(due[0]);
                due[1].callback();
                await flush();
            }
            now = target;
            await flush();
        },
        dispose() { window.dispatchEvent({ type: 'pagehide' }); },
    };
}

test('native iframe uses a read-only sendTo URL with Admin base prefix and no config fields', () => {
    const guide = CONFIG.items._epg.items._epgGuide;
    assert.equal(guide.type, 'iframeSendTo');
    assert.equal(guide.command, 'getEpgGuideUrl');
    assert.equal(guide.doNotSave, true);
    assert.equal(guide.sandbox, 'allow-scripts allow-same-origin');
    // ConfigGeneric.getPattern evaluates a template literal, then the native
    // iframe component JSON.parse()s it. No hand-written placeholder parser.
    const expression = '`' + guide.jsonData.replace(/`/g, '\\`') + '`';
    for (const [href, expected] of [
        ['https://example.test:8081/index.html#tab-instances/config/system.adapter.loewe-tv.3', '/'],
        ['https://example.test/iobroker/admin/index.html#tab-instances', '/iobroker/admin/'],
    ]) {
        const data = JSON.parse(vm.runInNewContext(expression, { URL, window: { location: { href } } }));
        assert.deepEqual(data, { basePath: expected });
    }
});

test('bridge initializes without a connection and authenticates same-origin instance 3 through Admin', async () => {
    const view = browser({ loadScript: true });
    assert.equal(view.requests.length, 0);
    assert.equal(view.scripts.length, 0);
    assert.deepEqual(view.issuedEvents, ['loewe-epg-bridge-ready']);
    const result = await view.bridge.requestGuide({ from: 100000, to: 200000 });
    assert.equal(result.channels.length, 2);
    assert.equal(view.scripts[0].src, 'https://broker.example/iobroker/admin/lib/js/socket.io.js');
    assert.equal(view.connectionOptions[0].url, 'https://broker.example/iobroker/admin/');
    assert.equal(view.connectionOptions[0].options.path, '/iobroker/admin/socket.io');
    assert.equal(view.requests[0].instance, 'loewe-tv.3');
    assert.deepEqual(view.requests[0].payload, { from: 100000, to: 200000, offset: 0, limit: 32 });
    assert.equal(Object.hasOwn(view.connectionOptions[0].options, 'token'), false);
    view.dispose();
    assert.equal(view.timers.size, 0);
});

test('missing, ambiguous and non-numeric instances never default to instance 0', async () => {
    for (const query of ['', '?instance=3&instance=4', '?instance=-1', '?instance=01', '?instance=3.0', '?instance=loewe-tv.3', '?invalidInstance=1']) {
        const view = browser({ href: `http://broker/adapter/loewe-tv/epg.html${query}` });
        await assert.rejects(view.bridge.requestGuide({}), { code: 'EPG_GUIDE_INSTANCE' });
        assert.equal(view.requests.length, 0);
        assert.equal(view.connectionOptions.length, 0);
        assert.equal(view.timers.size, 0);
        view.dispose();
    }
});

test('all 2000 channels can be collected from small pages without a 32-page truncation', async () => {
    const view = browser({ respond: ({ payload }) => page(2000, payload.offset, 11) });
    const result = await view.bridge.requestGuide({ from: 100000, to: 200000 });
    assert.equal(result.channels.length, 2000);
    assert.equal(result.total, 2000);
    assert.equal(result.nextOffset, null);
    assert.equal(result.listName, 'Meine Sender');
    assert.equal(new Set(result.channels.map(row => row.id)).size, 2000);
    assert.equal(view.requests.length, 182);
    assert.equal(view.requests[1].payload.catalogRevision, REVISION);
    view.dispose();
});

test('changed catalog error restarts pagination from page 0 and discards partial results', async () => {
    const view = browser({ respond: ({ payload }, n) => n === 2
        ? { error: 'Senderliste geändert', code: 'EPG_GUIDE_CHANGED' }
        : page(n >= 3 ? 4 : 40, payload.offset, 32, { catalogRevision: n >= 3 ? CHANGED_REVISION : REVISION }) });
    const result = await view.bridge.requestGuide({ from: 100000, to: 200000 });
    assert.deepEqual(view.requests.map(entry => entry.payload.offset), [0, 32, 0]);
    assert.equal(view.requests[2].payload.catalogRevision, undefined);
    assert.equal(result.catalogRevision, CHANGED_REVISION);
    assert.equal(result.channels.length, 4);
    view.dispose();
});

test('inconsistent catalog snapshots restart and repeated changes stop with a clear error', async () => {
    const view = browser({ respond: ({ payload }, n) => page(40, payload.offset, 32, {
        catalogRevision: n % 2 ? REVISION : CHANGED_REVISION,
    }) });
    await assert.rejects(view.bridge.requestGuide({}), { code: 'EPG_GUIDE_CHANGED' });
    assert.deepEqual(view.requests.map(entry => entry.payload.offset), [0, 32, 0, 32, 0, 32]);
    view.dispose();
});

test('wrong instance, incomplete totals, invalid revisions and non-progressing pages are rejected', async () => {
    for (const response of [
        page(2, 0, 32, { instance: 'loewe-tv.0' }),
        page(2, 0, 1, { nextOffset: null }),
        page(2, 0, 1, { nextOffset: 0 }),
        page(2, 0, 1, { nextOffset: 2 }),
        page(2, 0, 32, { catalogRevision: '' }),
        page(2, 0, 32, { catalogRevision: NaN }),
        page(2, 0, 32, { total: 2001 }),
        page(33, 0, 33),
        page(2, 0, 32, { channels: [{ id: 'same' }, { id: 'same' }] }),
        'permissionError',
        null,
    ]) {
        const view = browser({ respond: () => response });
        await assert.rejects(view.bridge.requestGuide({}), /unvollständige|ungültige/);
        assert.equal(view.requests.length, 1);
        view.dispose();
    }
});

test('refresh uses its dedicated command and never writes native configuration or states', async () => {
    const view = browser();
    const result = await view.bridge.refresh();
    assert.equal(result.accepted, true);
    assert.equal(result.status, 'started');
    assert.equal(view.requests[0].command, 'refreshEpgGuide');
    assert.deepEqual(view.requests[0].payload, {});
    view.dispose();
});

test('refresh binds to the complete guide catalog so an old frame cannot refresh a different saved TV/list', async () => {
    const view = browser();
    await view.bridge.requestGuide({});
    await view.bridge.refresh();
    assert.deepEqual(view.requests[1].payload, { listView: 'my-list', catalogRevision: REVISION });
    assert.equal(view.requests[1].command, 'refreshEpgGuide');
    assert.equal(view.requests[1].instance, 'loewe-tv.3');
    view.dispose();
});

test('authentication failure sends no adapter commands and releases the connection', async () => {
    const view = browser({ auth: false });
    await assert.rejects(view.bridge.requestGuide({}), /Admin-Sitzung/);
    assert.equal(view.requests.length, 0);
    assert.equal(view.sockets[0].destroyed, true);
    assert.equal(view.timers.size, 0);
    view.dispose();
});

test('connection and request timeouts reject promptly, clear timers and ignore late callbacks', async () => {
    for (const mode of ['connect', 'auth', 'respond']) {
        const view = browser({ [mode]: mode === 'respond' ? () => NO_RESPONSE : NO_RESPONSE });
        const loading = view.bridge.requestGuide({});
        const rejected = assert.rejects(loading, /antwortet nicht rechtzeitig/);
        await view.flush();
        await view.advance(8000);
        await rejected;
        assert.equal(view.timers.size, 0);
        assert.equal(view.sockets[0].destroyed, true);
        if (view.requests[0]) view.requests[0].callback(page());
        view.dispose();
    }
});

test('complete guide has a 30-second deadline even while individual pages respond', async () => {
    const view = browser({ respond: () => NO_RESPONSE });
    const loading = view.bridge.requestGuide({});
    const rejected = assert.rejects(loading, /antwortet nicht rechtzeitig/);
    await view.flush();
    for (let i = 0; i < 4; i++) {
        await view.advance(7000);
        view.requests[i].callback(page(100, i, 1));
        await view.flush();
    }
    assert.equal(view.requests.length, 5);
    await view.advance(2000);
    await rejected;
    assert.equal(view.timers.size, 0);
    view.dispose();
});

test('at most four in-flight requests are allowed and closing the frame cancels all of them', async () => {
    const view = browser({ respond: () => NO_RESPONSE });
    const requests = Array.from({ length: 4 }, () => view.bridge.refresh());
    const rejected = requests.map(request => assert.rejects(request, /nicht verfügbar/));
    await view.flush();
    await assert.rejects(view.bridge.refresh(), /Anfrage läuft/);
    assert.equal(view.requests.length, 4);
    view.dispose();
    await Promise.all(rejected);
    assert.equal(view.timers.size, 0);
    await assert.rejects(view.bridge.refresh(), /nicht verfügbar/);
});

test('closing during socket script loading removes the script and leaves no pending timers', async () => {
    const view = browser({ loadScript: true, script: NO_RESPONSE });
    const rejected = assert.rejects(view.bridge.requestGuide({}), /nicht verfügbar/);
    view.dispose();
    await rejected;
    assert.equal(view.scripts[0].removed, true);
    assert.equal(view.timers.size, 0);
});
