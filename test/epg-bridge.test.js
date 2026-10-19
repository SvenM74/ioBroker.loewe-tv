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
const SELECTION = Object.freeze({
    channelId: 'channels.tv.das_erste_hd', eventId: 'event-123', start: 120000, end: 180000,
    listView: 'my-list', catalogRevision: REVISION,
});

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
    const io = Object.assign(options.regularSocketIo ? function socketIo() {} : {}, {
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
    });
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
    const guide = CONFIG.items._programmeGuide.items._epgGuide;
    assert.equal(guide.type, 'iframeSendTo');
    assert.equal(guide.command, 'getEpgGuideUrl');
    assert.equal(guide.doNotSave, true);
    assert.equal(guide.sandbox, 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
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

test('web guide authenticates on the selected same-origin web socket and keeps proxy prefixes', async () => {
    const view = browser({ loadScript: true, href: 'https://broker.example/proxy/web/loewe-tv.3/epg.html' });
    const guide = await view.bridge.requestGuide({ from: 100000, to: 200000 });
    assert.equal(guide.instance, 'loewe-tv.3');
    assert.equal(view.scripts[0].src, 'https://broker.example/proxy/web/lib/js/socket.io.js');
    assert.equal(view.connectionOptions[0].url, 'https://broker.example/proxy/web/');
    assert.equal(view.connectionOptions[0].options.path, '/proxy/web/socket.io');
    assert.equal(view.connectionOptions[0].options.reconnection, false);
    assert.equal(view.connectionOptions[0].options.forceNew, true);
    assert.equal(Object.hasOwn(view.connectionOptions[0].options, 'token'), false);
    assert.equal(view.requests[0].instance, 'loewe-tv.3');
    view.dispose();
    assert.equal(view.timers.size, 0);
});

test('web instance paths cannot be overridden by query parameters or default to another TV', async () => {
    for (const suffix of [
        'loewe-tv.3/epg.html?instance=0', 'loewe-tv.3/epg.html?instance=3&instance=3',
        'loewe-tv.03/epg.html', 'loewe-tv.-1/epg.html', 'loewe-tv.x/epg.html',
        'loewe-tv.3/other.html', 'other.3/epg.html',
    ]) {
        const view = browser({ href: `https://broker.example/proxy/web/${suffix}` });
        await assert.rejects(view.bridge.requestGuide({}), { code: 'EPG_GUIDE_INSTANCE' });
        assert.equal(view.requests.length, 0);
        assert.equal(view.connectionOptions.length, 0);
        view.dispose();
    }
    const matching = browser({ href: 'https://broker.example/loewe-tv.3/epg.html?instance=3' });
    await matching.bridge.requestGuide({});
    assert.equal(matching.requests[0].instance, 'loewe-tv.3');
    matching.dispose();
});

test('regular Socket.IO uses the root namespace for local proxies and Cloud web access', async () => {
    // Cloud forwards /loewe-tv.N/ and /lib/js/ to its selected web instance;
    // its /adapter/ route belongs to Admin. These are mocked routing contracts,
    // not connections to the live portals.
    for (const [base, socketPath] of [
        ['https://broker.example/proxy/web/', '/proxy/web/socket.io'],
        ['https://iobroker.pro/', '/socket.io'],
        ['https://iobroker.net/', '/socket.io'],
    ]) {
        const view = browser({ regularSocketIo: true, loadScript: true,
            href: `${base}loewe-tv.3/epg.html` });
        await view.bridge.requestGuide({});
        assert.equal(view.scripts[0].src, `${base}lib/js/socket.io.js`);
        assert.equal(view.connectionOptions[0].url, new URL(base).origin);
        assert.equal(view.connectionOptions[0].options.path, socketPath);
        assert.equal(view.requests[0].instance, 'loewe-tv.3');
        assert.equal(view.connectionOptions[0].options.reconnection, false);
        assert.equal(Object.hasOwn(view.connectionOptions[0].options, 'token'), false);
        assert.equal(Object.hasOwn(view.connectionOptions[0].options, 'auth'), false);
        view.dispose();
        assert.equal(view.timers.size, 0);
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

test('XMLTV and mixed guide pages retain programme sources through bridge collection and UI normalization', async () => {
    const ui = require('../admin/epg');
    const now = Date.UTC(2026, 9, 18, 16);
    for (const source of ['xmltv', 'mixed']) {
        const view = browser({ respond: ({ payload }) => {
            const response = page(35, payload.offset, 32, { source, now, from: now, to: now + 2 * 3600000 });
            for (const row of response.channels) {
                row.source = 'xmltv';
                row.events = [{ eventId: `programme-${row.number}`, title: `Programme ${row.number}`,
                    start: now + 60000, end: now + 120000,
                    ...(row.number % 2 === 0 ? { source: 'xmltv' } : {}),
                    ...(source === 'mixed' && row.number % 2 ? { source: 'tv' } : {}) }];
            }
            return response;
        } });
        const result = await view.bridge.requestGuide({ from: now, to: now + 2 * 3600000 });
        assert.equal(result.source, source);
        assert.equal(result.channels.length, 35);
        assert.deepEqual(view.requests.map(entry => entry.payload.offset), [0, 32]);
        assert.equal(view.requests[1].payload.catalogRevision, REVISION);
        const normalized = ui.normalizeGuide(result);
        assert.equal(normalized.source, source);
        assert.equal(normalized.invalidEvents, 0);
        assert.deepEqual(normalized.channels.map(row => row.events[0].source),
            Array.from({ length: 35 }, (_, index) => source === 'mixed' && index % 2 === 0 ? 'tv' : 'xmltv'));
        assert.equal(normalized.channels.at(-1).events[0].eventId, 'programme-35');
        view.dispose();
        assert.equal(view.timers.size, 0);
    }
});

test('a source-only change restarts pagination and discards every channel from the previous source', async () => {
    for (const [previous, current] of [['tv', 'xmltv'], ['xmltv', 'mixed'], ['mixed', 'tv']]) {
        const view = browser({ respond: ({ payload }, n) => {
            const source = n === 1 ? previous : current;
            const response = page(40, payload.offset, 32, { source });
            for (const row of response.channels) row.name = `${source}: ${row.id}`;
            return response;
        } });
        const result = await view.bridge.requestGuide({ from: 100000, to: 200000 });
        assert.deepEqual(view.requests.map(entry => entry.payload.offset), [0, 32, 0, 32]);
        assert.equal(view.requests[2].payload.catalogRevision, undefined, 'Restart requests a new first-page snapshot');
        assert.ok(view.requests.every(entry => entry.payload.from === 100000 && entry.payload.to === 200000));
        assert.equal(result.catalogRevision, REVISION, 'A source change is detected even when the channel catalogue is identical');
        assert.equal(result.source, current);
        assert.equal(result.channels.length, 40);
        assert.equal(new Set(Array.from(result.channels, row => row.id)).size, 40);
        assert.ok(result.channels.every(row => row.name.startsWith(`${current}: `)), 'No earlier page leaks into the new guide');
        view.dispose();
        assert.equal(view.timers.size, 0);
    }
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
        null,
    ]) {
        const view = browser({ respond: () => response });
        await assert.rejects(view.bridge.requestGuide({}), /unvollständige|ungültige/);
        assert.equal(view.requests.length, 1);
        view.dispose();
    }
});

test('Admin and web sendTo permission denials are reported as permissions and never retried', async () => {
    for (const href of ['https://broker/adapter/loewe-tv/epg.html?instance=3', 'https://broker/loewe-tv.3/epg.html']) {
        for (const reply of ['permissionError', { error: 'permissionError' }]) {
            const view = browser({ href, respond: () => reply });
            await assert.rejects(view.bridge.recordProgramme({ ...SELECTION, confirmed: true }), error =>
                error.code === 'EPG_GUIDE_PERMISSION' && /Benutzerrechte/.test(error.message));
            assert.equal(view.requests.length, 1);
            await view.advance(15000);
            assert.equal(view.requests.length, 1);
            view.dispose();
            assert.equal(view.timers.size, 0);
        }
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

test('recording snapshot reads use only getRecordings and never start programme actions', async t => {
    const snapshot = { schemaVersion: 1, ready: true, updatedAt: 100000, lastError: '', jobs: [] };
    const view = browser({ respond: ({ command, payload }) => {
        assert.equal(command, 'getRecordings');
        assert.deepEqual(payload, {});
        return snapshot;
    } });
    t.after(view.dispose);
    assert.equal(view.requests.length, 0, 'Opening the bridge must not send a recording request');
    assert.equal(await view.bridge.requestRecordings(), snapshot);
    assert.equal(await view.bridge.requestRecordings(), snapshot);
    assert.deepEqual(view.requests.map(entry => entry.command), ['getRecordings', 'getRecordings']);
    assert.ok(view.requests.every(entry => entry.instance === 'loewe-tv.3'));
    assert.equal(view.timers.size, 0);
});

test('programme actions preserve the real instance and send a recording only after explicit confirmation', async t => {
    const confirmation = {
        action: 'confirmRecording', selection: { ...SELECTION },
        channel: { name: 'Das Erste HD', number: 1 },
        programme: { title: 'Die Sendung', start: SELECTION.start, end: SELECTION.end },
    };
    const job = { id: 'job-123', status: 'queued', canCancel: true };
    const view = browser({
        href: 'https://broker.example/proxy/admin/adapter/loewe-tv/epg.html?instance=12',
        respond: ({ command }) => ({
            selectEpgProgramme: confirmation,
            recordEpgProgramme: { action: 'recordingQueued', job },
            cancelRecording: { job: { ...job, status: 'cancelled', canCancel: false } },
        })[command],
    });
    t.after(view.dispose);
    const result = await view.bridge.selectProgramme(SELECTION);
    assert.equal(result, confirmation);
    await view.flush();
    assert.deepEqual(view.requests.map(entry => entry.command), ['selectEpgProgramme'],
        'A future programme response must not implicitly submit a recording');
    assert.deepEqual(view.requests[0].payload, SELECTION);
    const confirmed = Object.freeze({ ...result.selection, confirmed: true });
    assert.equal((await view.bridge.recordProgramme(confirmed)).action, 'recordingQueued');
    assert.deepEqual(view.requests[1].payload, confirmed);
    assert.equal((await view.bridge.cancelRecording(job.id)).job.status, 'cancelled');
    assert.deepEqual(view.requests[2].payload, { jobId: 'job-123' });
    assert.deepEqual(view.requests.map(entry => entry.command), [
        'selectEpgProgramme', 'recordEpgProgramme', 'cancelRecording',
    ]);
    assert.ok(view.requests.every(entry => entry.instance === 'loewe-tv.12'));
    assert.equal(view.connectionOptions[0].url, 'https://broker.example/proxy/admin/');
    assert.equal(view.connectionOptions[0].options.path, '/proxy/admin/socket.io');
    assert.equal(view.timers.size, 0);
});

test('bridge never synthesizes recording consent and preserves a runtime validation refusal', async t => {
    const view = browser({ respond: ({ command }) => {
        assert.equal(command, 'recordEpgProgramme');
        return { error: 'Die Aufnahme muss ausdrücklich bestätigt werden.', code: 'EPG_ACTION_VALIDATION' };
    } });
    t.after(view.dispose);
    for (const payload of [SELECTION, { ...SELECTION, confirmed: false }]) {
        await assert.rejects(view.bridge.recordProgramme(payload), {
            code: 'EPG_ACTION_VALIDATION', message: 'Die Aufnahme muss ausdrücklich bestätigt werden.',
        });
        assert.deepEqual(view.requests.at(-1).payload, payload);
    }
    await view.advance(60000);
    assert.equal(view.requests.length, 2, 'Only the two explicit calls may be sent');
    assert.equal(view.timers.size, 0);
});

test('programme mutation errors stay structured and never use the guide pagination retry', async t => {
    for (const [method, payload, code] of [
        ['selectProgramme', SELECTION, 'EPG_GUIDE_CHANGED'],
        ['recordProgramme', { ...SELECTION, confirmed: true }, 'EPG_PROGRAMME_CHANGED'],
        ['recordProgramme', { ...SELECTION, confirmed: true }, 'EPG_ACTION_EXPIRED'],
        ['cancelRecording', 'job-123', 'EPG_GUIDE_CHANGED'],
    ]) {
        const view = browser({ respond: () => ({ error: 'Ausgewählte Sendung ist nicht mehr verfügbar.', code }) });
        t.after(view.dispose);
        await assert.rejects(view.bridge[method](payload), {
            code, message: 'Ausgewählte Sendung ist nicht mehr verfügbar.',
        });
        await view.advance(60000);
        assert.equal(view.requests.length, 1, `${method}: a rejected mutation must not be replayed`);
        assert.notEqual(view.requests[0].command, 'getEpgGuide');
        assert.equal(view.timers.size, 0);
    }
});

test('timed-out programme actions ignore late replies and are not replayed after reconnection', async t => {
    for (const [method, payload, command] of [
        ['selectProgramme', SELECTION, 'selectEpgProgramme'],
        ['recordProgramme', { ...SELECTION, confirmed: true }, 'recordEpgProgramme'],
        ['cancelRecording', 'job-123', 'cancelRecording'],
    ]) {
        const snapshot = { schemaVersion: 1, ready: true, updatedAt: 112000, lastError: '', jobs: [] };
        const view = browser({ respond: entry => entry.command === 'getRecordings' ? snapshot : NO_RESPONSE });
        t.after(view.dispose);
        const running = view.bridge[method](payload);
        const rejected = assert.rejects(running, /antwortet nicht rechtzeitig/);
        await view.flush();
        assert.deepEqual(view.requests.map(entry => entry.command), [command]);
        await view.advance(11999);
        assert.equal(view.sockets[0].destroyed, false, 'Actions have their own bounded response deadline');
        await view.advance(1);
        await rejected;
        assert.equal(view.sockets[0].destroyed, true);
        assert.equal(view.timers.size, 0);
        view.requests[0].callback({ action: 'recordingQueued', job: { id: 'late-job' } });
        await view.advance(60000);
        assert.equal(view.requests.length, 1, 'Neither timeout nor a late success may repeat a mutation');
        assert.equal(await view.bridge.requestRecordings(), snapshot);
        assert.equal(view.sockets.length, 2, 'An explicit read can reconnect after a lost action reply');
        assert.deepEqual(view.requests.map(entry => entry.command), [command, 'getRecordings']);
        assert.equal(view.timers.size, 0);
    }
});

test('new guide actions cannot fall back to instance 0 or bypass the Admin session', async t => {
    for (const options of [
        { href: 'https://broker.example/adapter/loewe-tv/epg.html' },
        { href: 'https://broker.example/adapter/loewe-tv/epg.html?instance=3&instance=0' },
        { auth: false },
    ]) {
        const view = browser(options);
        t.after(view.dispose);
        for (const [method, payload] of [
            ['selectProgramme', SELECTION], ['recordProgramme', { ...SELECTION, confirmed: true }],
            ['requestRecordings', undefined], ['cancelRecording', 'job-123'],
        ]) await assert.rejects(view.bridge[method](payload));
        assert.equal(view.requests.length, 0);
        assert.equal(view.timers.size, 0);
    }
});

test('authentication failure sends no adapter commands and releases the connection', async () => {
    const view = browser({ auth: false });
    await assert.rejects(view.bridge.requestGuide({}), /ioBroker-Sitzung/);
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

test('remote keys retain each TV on Admin, web, proxy and both Cloud origins without guide data', async t => {
    for (const instance of [0, 1]) {
        for (const href of [
            `https://broker.example/admin/adapter/loewe-tv/epg.html?instance=${instance}`,
            `http://broker.example:8082/loewe-tv.${instance}/epg.html`,
            `https://broker.example/proxy/web/loewe-tv.${instance}/epg.html`,
            `https://iobroker.net/loewe-tv.${instance}/epg.html`,
            `https://iobroker.pro/loewe-tv.${instance}/epg.html`,
        ]) {
            const view = browser({ href, regularSocketIo: true, respond: request => ({
                ok: true, key: request.payload.key, status: 'sent', instance: request.instance,
            }) });
            t.after(view.dispose);
            assert.equal(view.bridge.getInstance(), `loewe-tv.${instance}`);
            assert.equal(view.connectionOptions.length, 0, 'Reading the target must not create a connection.');
            for (const key of ['digit_1', 'digit_0', 'ok', 'record', 'dr_archive', 'power_off']) {
                const result = await view.bridge.sendRemoteCommand(key);
                assert.equal(result.status, 'sent');
                assert.equal(result.key, key);
                const request = view.requests.at(-1);
                assert.equal(request.instance, `loewe-tv.${instance}`);
                assert.equal(request.command, 'sendRemoteCommand');
                assert.deepEqual(request.payload, { key });
            }
            assert.equal(view.connectionOptions[0].url, new URL(href).origin);
            assert.equal(view.connectionOptions[0].options.reconnection, false);
            assert.equal(view.timers.size, 0);
        }
    }
});

test('remote commands reject an ambiguous TV and anything except a bounded key name before sending', async t => {
    for (const href of [
        'https://broker/adapter/loewe-tv/epg.html',
        'https://broker/adapter/loewe-tv/epg.html?instance=1&instance=0',
        'https://broker/loewe-tv.1/epg.html?instance=0',
        'https://broker/loewe-tv.01/epg.html',
        'file:///loewe-tv.1/epg.html',
    ]) {
        const view = browser({ href });
        t.after(view.dispose);
        assert.throws(() => view.bridge.getInstance(), { code: 'EPG_GUIDE_INSTANCE' });
        await assert.rejects(view.bridge.sendRemoteCommand('ok'), { code: 'EPG_GUIDE_INSTANCE', delivery: 'notSent' });
        assert.equal(view.connectionOptions.length, 0);
        assert.equal(view.requests.length, 0);
    }
    const view = browser();
    t.after(view.dispose);
    for (const key of [null, undefined, 1, true, [], {}, { key: 'ok', instance: 'loewe-tv.0' },
        'OK', ' ok ', '', 'x'.repeat(33), 'ok\n', 'remote.ok']) {
        await assert.rejects(view.bridge.sendRemoteCommand(key), { code: 'VALIDATION', delivery: 'notSent' });
    }
    assert.equal(view.requests.length, 0);
    assert.equal(view.connectionOptions.length, 0);
});

test('remote success must identify the requested key, TV and type of acknowledgement', async t => {
    for (const response of [
        { ok: true, instance: 'loewe-tv.0', key: 'ok', status: 'sent' },
        { ok: true, instance: 'loewe-tv.3', key: 'record', status: 'sent' },
        { ok: true, instance: 'loewe-tv.3', key: 'ok', status: 'started' },
        { ok: false, instance: 'loewe-tv.3', key: 'ok', status: 'sent' },
        { accepted: true },
    ]) {
        const view = browser({ respond: () => response });
        t.after(view.dispose);
        await assert.rejects(view.bridge.sendRemoteCommand('ok'), { code: 'REMOTE_RESPONSE', delivery: 'unknown' });
        assert.equal(view.requests.length, 1);
    }
    for (const status of ['started', 'alreadyRunning']) {
        const view = browser({ respond: () => ({ ok: true, instance: 'loewe-tv.3', key: 'power_on', status }) });
        t.after(view.dispose);
        assert.equal((await view.bridge.sendRemoteCommand('power_on')).status, status);
        assert.equal(view.requests.length, 1, 'Starting wake-up must not inject a browser-side power key.');
    }
});

test('remote permission failures are known unsent, and an expired login never emits a TV command', async t => {
    const unauthenticated = browser({ auth: false });
    t.after(unauthenticated.dispose);
    await assert.rejects(unauthenticated.bridge.sendRemoteCommand('record'), { delivery: 'notSent' });
    assert.equal(unauthenticated.requests.length, 0);
    for (const response of ['permissionError', { error: 'permissionError' }]) {
        const view = browser({ respond: () => response });
        t.after(view.dispose);
        await assert.rejects(view.bridge.sendRemoteCommand('record'), {
            code: 'EPG_GUIDE_PERMISSION', delivery: 'notSent',
        });
        await view.advance(60000);
        assert.equal(view.requests.length, 1);
    }
});

test('remote failures preserve delivery evidence and are never automatically resubmitted', async t => {
    for (const [code, delivery] of [['VALIDATION', 'notSent'], ['BUSY', 'notSent'], ['NETWORK', 'unknown']]) {
        const view = browser({ respond: () => ({ ok: false, error: 'Die Taste wurde nicht bestätigt.', code, delivery }) });
        t.after(view.dispose);
        await assert.rejects(view.bridge.sendRemoteCommand('record'), { code, delivery });
        await view.advance(60000);
        assert.deepEqual(view.requests.map(request => request.command), ['sendRemoteCommand']);
        assert.equal(view.timers.size, 0);
    }
});

test('a lost remote reply stays uncertain and a later status read cannot replay the key', async t => {
    const snapshot = { ok: true, instance: 'loewe-tv.3', connected: false, commandPending: false, powerOn: null };
    const view = browser({ respond: request => request.command === 'getRemoteStatus' ? snapshot : NO_RESPONSE });
    t.after(view.dispose);
    const result = view.bridge.sendRemoteCommand('record');
    const rejected = assert.rejects(result, { delivery: 'unknown' });
    await view.flush();
    await view.advance(12000);
    await rejected;
    assert.equal(view.sockets[0].destroyed, true);
    view.requests[0].callback({ ok: true, key: 'record', status: 'sent', instance: 'loewe-tv.3' });
    await view.advance(60000);
    assert.equal(view.requests.length, 1);
    assert.equal(await view.bridge.requestRemoteStatus(), snapshot);
    assert.deepEqual(view.requests.map(request => request.command), ['sendRemoteCommand', 'getRemoteStatus']);
    assert.deepEqual(view.requests[1].payload, {});
    assert.equal(view.timers.size, 0);
});

test('a remote connection timeout is unsent while disconnect after emission is uncertain', async t => {
    const disconnected = browser({ connect: NO_RESPONSE });
    t.after(disconnected.dispose);
    const before = assert.rejects(disconnected.bridge.sendRemoteCommand('ok'), { delivery: 'notSent' });
    await disconnected.flush();
    await disconnected.advance(8000);
    await before;
    assert.equal(disconnected.requests.length, 0);

    const view = browser({ respond: () => NO_RESPONSE });
    t.after(view.dispose);
    const after = assert.rejects(view.bridge.sendRemoteCommand('ok'), { delivery: 'unknown' });
    await view.flush();
    view.sockets[0].trigger('disconnect');
    await after;
    await view.advance(60000);
    assert.equal(view.requests.length, 1);
    assert.equal(view.timers.size, 0);
});

test('cached remote status cannot switch the bridge to a different TV or substitute guide data', async t => {
    for (const response of [
        { ok: true, instance: 'loewe-tv.0', connected: true, commandPending: false, powerOn: null },
        { ok: true, instance: 'loewe-tv.3', connected: 'true', commandPending: false },
        page(),
    ]) {
        const view = browser({ respond: () => response });
        t.after(view.dispose);
        await assert.rejects(view.bridge.requestRemoteStatus(), { code: 'REMOTE_RESPONSE' });
        assert.equal(view.bridge.getInstance(), 'loewe-tv.3');
        assert.deepEqual(view.requests.map(request => request.command), ['getRemoteStatus']);
    }
});
