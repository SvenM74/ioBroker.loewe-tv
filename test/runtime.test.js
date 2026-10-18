'use strict';

// These tests exercise ioBroker command semantics with a simulated TV. They
// deliberately do not require js-controller, a network, or an actual Loewe TV.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AdapterRuntime } = require('../lib/adapter-runtime');
const { parseChannelPage } = require('../lib/loewe-client');
const { runPowerOn } = require('../lib/power-on');

// Explicit upgrade fixtures: these public states were retired in the TV-only build.
const RETIRED_STATIC_STATES = [
    'info.lastResponse', 'status.volumeRaw',
    'channels.start', 'channels.listStart', 'channels.count',
    'channels.getLists', 'channels.getChannels',
    'channels.lists', 'channels.items', 'channels.entries', 'channels.availableLists',
    'channels.totalNumber', 'channels.returnedNumber', 'channels.nextStart', 'channels.nextListStart',
    'channels.lastUpdate', 'channels.lastError',
];

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

function response(action, fields = {}) {
    return {
        xml: `<Envelope><Body><${action}Response/></Body></Envelope>`,
        data: { Envelope: { Body: { [`${action}Response`]: fields } } },
    };
}

function listResponse(lists, { start = 0, total = lists.length, result = 'OK' } = {}) {
    return response('GetListOfChannelLists', {
        Result: result,
        ResultItemChannelLists: {
            ...(start === null ? {} : { '@_startIndex': String(start) }),
            ...(total === null ? {} : { '@_totalResults': String(total) }),
            '@_returnedResults': String(lists.length),
            ResultItemChannelList: lists.map(list => ({
                View: list.view, Name: list.name ?? list.view,
                ...(list.total === null ? {} : { TotalResults: String(list.total ?? 1) }),
            })),
        },
    });
}

function codedError(code, message) {
    return Object.assign(new Error(message), { code });
}

class FakeClient extends EventEmitter {
    constructor() {
        super();
        this.calls = [];
        this.hooks = {};
        this.volume = 21;
        this.muted = false;
        this.closed = false;
        this.closeCount = 0;
        this.activeRequests = 0;
        this.maxActiveRequests = 0;
        this.isSessionReady = true;
    }

    async invoke(method, args, fallback) {
        if (this.closed) {
            throw codedError('CLOSED', 'Simulated client is closed');
        }
        this.calls.push({ method, args });
        this.activeRequests += 1;
        this.maxActiveRequests = Math.max(this.maxActiveRequests, this.activeRequests);
        try {
            return this.hooks[method] ? await this.hooks[method](...args) : fallback;
        } finally {
            this.activeRequests -= 1;
        }
    }

    getDeviceData() {
        return this.invoke('getDeviceData', [], response('GetDeviceData', {
            DeviceName: 'Simulated Loewe TV',
            'MAC-Address-LAN': '02:00:00:00:00:01',
        }));
    }

    getSettings() {
        return this.invoke('getSettings', [], response('GetSettings', { WolEnable: '1' }));
    }

    getCurrentPlayback() {
        return this.invoke('getCurrentPlayback', [], response('GetCurrentPlayback', {
            Locator: 'dvb://fixture/service-1',
            Title: 'Simulated programme',
        }));
    }

    getVolume() {
        return this.invoke('getVolume', [], this.volume);
    }

    getMute() {
        return this.invoke('getMute', [], this.muted);
    }

    setVolume(value) {
        return this.invoke('setVolume', [value], response('SetVolume'));
    }

    setMute(value) {
        return this.invoke('setMute', [value], response('SetMute'));
    }

    key(name) {
        return this.invoke('key', [name], response('InjectRCKey'));
    }

    text(value) {
        return this.invoke('text', [value], response('InjectKeyboardKey'));
    }

    backspace() {
        return this.invoke('backspace', [], response('InjectKeyboardKey'));
    }

    zap(locator) {
        return this.invoke('zap', [locator], response('ZapToMedia'));
    }

    getChannelLists(start = 0, count = 100, options) {
        return this.invoke('getChannelLists', options === undefined ? [start, count] : [start, count, options], response('GetListOfChannelLists', {
            Result: 'OK',
            ResultItemChannelLists: {
                '@_startIndex': String(start), '@_totalResults': '1', '@_returnedResults': start === 0 ? '1' : '0',
                ...(start === 0 ? { ResultItemChannelList: { View: 'fastscan-fixture', Name: 'TV', TotalResults: '1' } } : {}),
            },
        }));
    }

    getChannels(view, start = 0, count = 100, mediaType = 'video') {
        return this.invoke('getChannels', [view, start, count, mediaType], response('GetChannelList', {
            ChannelListView: view,
            ResultItemFragment: {
                '@_startIndex': String(start), '@_totalResults': '1', '@_returnedResults': start === 0 ? '1' : '0',
                ...(start === 0 ? { ResultItemReference: {
                    '@_mediaItemUuid': 'fixture-service-1', '@_shortInfo': 'Fixture TV',
                    '@_locator': 'channel://001:ch-fixture-service-1:sl-fixture', '@_caption': '001', '@_itemClass': 'video',
                } } : {}),
            },
        }));
    }

    request(action, parametersXml = '') {
        return this.invoke('request', [action, parametersXml], response(action));
    }

    wake(macs, broadcast) {
        return this.invoke('wake', [macs, broadcast], { macs, broadcast, port: 9 });
    }

    close() {
        this.closed = true;
        this.isSessionReady = false;
        this.closeCount += 1;
    }
}

class FakeAdapter {
    constructor(config = {}) {
        this.namespace = 'loewe-tv.0';
        this.config = {
            host: 'fixture.invalid',
            port: 905,
            timeout: 5000,
            appendNul: true,
            pollInterval: 30,
            channelRefreshInterval: 0,
            epgEnabled: false,
            channelListView: 'fastscan-fixture',
            pollPlayback: true,
            maxVolume: 99,
            macLan: '',
            macWlan: '',
            broadcastAddress: '255.255.255.255',
            ...config,
        };
        this.objects = new Map();
        this.states = new Map();
        this.writes = [];
        this.deletions = [];
        this.subscriptions = [];
        this.timers = new Map();
        this.nextTimer = 1;
        this.logs = [];
        this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [
            level, text => this.logs.push({ level, text }),
        ]));
    }

    localId(id) {
        const prefix = `${this.namespace}.`;
        return id.startsWith(prefix) ? id.slice(prefix.length) : id;
    }

    async extendObjectAsync(id, object) {
        const key = this.localId(id);
        const previous = this.objects.get(key) || {};
        this.objects.set(key, {
            ...previous,
            ...structuredClone(object),
            common: { ...previous.common, ...structuredClone(object.common || {}) },
            native: { ...previous.native, ...structuredClone(object.native || {}) },
        });
    }

    async getStateAsync(id) {
        return this.states.get(this.localId(id)) || null;
    }

    async getObjectAsync(id) {
        return structuredClone(this.objects.get(this.localId(id)) || null);
    }

    async getObjectListAsync(options) {
        assert.deepEqual(options, { startkey: `${this.namespace}.`, endkey: `${this.namespace}.\u9999`, include_docs: true });
        return { rows: [...this.objects].map(([key, object]) => {
            const id = /^(?:loewe-tv|other)\.\d+\./u.test(key) ? key : `${this.namespace}.${key}`;
            return { id, doc: structuredClone({ _id: id, ...object }) };
        }).filter(row => row.id >= options.startkey && row.id <= options.endkey) };
    }

    async delObjectAsync(id, options) {
        const key = this.localId(id);
        this.deletions.push({ id: key, ...options });
        const matches = candidate => candidate === key || (options.recursive && candidate.startsWith(`${key}.`));
        const protectedIds = new Set([...this.objects].filter(([, object]) => object.common?.dontDelete).map(([objectId]) => objectId));
        for (const objectId of this.objects.keys()) if (matches(objectId) && !protectedIds.has(objectId)) this.objects.delete(objectId);
        for (const stateId of this.states.keys()) if (matches(stateId) && !protectedIds.has(stateId)) this.states.delete(stateId);
    }

    async setStateAsync(id, state) {
        const key = this.localId(id);
        const value = structuredClone(state);
        this.states.set(key, value);
        this.writes.push({ id: key, ...value });
    }

    subscribeStates(pattern) {
        this.subscriptions.push(pattern);
    }

    setTimeout(fn, ms) {
        const handle = this.nextTimer++;
        this.timers.set(handle, { fn, ms });
        return handle;
    }

    clearTimeout(handle) {
        this.timers.delete(handle);
    }

    fireNextTimer() {
        const first = this.timers.entries().next().value;
        assert.ok(first, 'Expected one scheduled polling timer');
        const [handle, timer] = first;
        this.timers.delete(handle);
        return timer.fn();
    }
}

async function waitUntil(predicate, message) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail(message);
}

async function harness(t, config = {}, prepare = () => {}, runtimeOptions = {}) {
    const adapter = new FakeAdapter(config);
    const client = new FakeClient();
    prepare(adapter, client);
    let clientOptions;
    const runtime = new AdapterRuntime(adapter, {
        powerOnSequence: options => runPowerOn({ ...options, firstKeyDelayMs: 0 }),
        clientFactory(options) {
            clientOptions = options;
            return client;
        },
        ...runtimeOptions,
    });
    t.after(async () => runtime.stop());
    await runtime.start();
    return { adapter, client, runtime, clientOptions };
}

function write({ adapter, runtime }, id, val) {
    const state = { val, ack: false };
    // ioBroker has already stored the user's value when stateChange is emitted.
    adapter.states.set(id, state);
    return runtime.handleStateChange(`${adapter.namespace}.${id}`, state);
}

function calls(client, method) {
    return client.calls.filter(call => call.method === method);
}

test('TV discovery works with an empty host and loading choices never searches automatically', async t => {
    const requests = [];
    const h = await harness(t, { host: '', pollInterval: 0, channelListView: '' }, () => {}, {
        async tvDiscovery(options) {
            requests.push(options);
            return { devices: [
                { host: '192.0.2.10', name: 'Wohnzimmer', model: 'bild 7.55', apiReachable: true },
                { host: '192.0.2.20', name: 'Schlafzimmer', model: 'bild 5.32', apiReachable: true },
            ], warnings: [] };
        },
    });
    const before = structuredClone(h.adapter.config);
    const writes = h.adapter.writes.length;
    assert.equal(h.runtime.client, null);
    const initial = await h.runtime.handleMessage('getDiscoveredTvs', { port: '905' });
    assert.equal(initial.length, 1);
    assert.match(initial[0].label, /Zuerst/u);
    assert.equal(requests.length, 0);
    const response = await h.runtime.handleMessage('discoverTvs', { port: '905' });
    assert.equal(response.result, 'discoveryComplete');
    assert.deepEqual(response.args, [2]);
    assert.deepEqual(Object.keys(response.native).sort(), ['_discoveredTv', '_tvDiscoveryReload']);
    assert.equal(response.native._discoveredTv, '');
    assert.equal(typeof response.native._tvDiscoveryReload, 'number');
    const choices = await h.runtime.handleMessage('getDiscoveredTvs', { port: 905 });
    assert.deepEqual(choices.map(choice => choice.value), ['', '192.0.2.10', '192.0.2.20']);
    assert.match(choices[1].label, /Wohnzimmer.*bild 7\.55/u);
    assert.match(choices[2].label, /Schlafzimmer.*bild 5\.32/u);
    await h.runtime.handleMessage('getDiscoveredTvs', { port: 905 });
    assert.equal(requests.length, 1, 'Reopening the selector only reads cached results');
    assert.equal(requests[0].port, 905);
    assert.deepEqual(h.adapter.config, before, 'Search never saves an IP or changes native configuration');
    assert.equal(h.adapter.writes.length, writes, 'Discovery creates no persistent data points or status writes');
    assert.equal(h.client.calls.length, 0, 'No authentication, SOAP request or TV command during search');
});

test('TV search uses the unsaved control port and keeps caches scoped to that port and instance', async t => {
    const ports = [];
    const h = await harness(t, { pollInterval: 0 }, () => {}, {
        async tvDiscovery({ port }) {
            ports.push(port);
            return { devices: [{ host: '192.0.2.9', name: 'Loewe', model: 'Connect 26 SL', apiReachable: false }], warnings: [] };
        },
    });
    const response = await h.runtime.handleMessage('discoverTvs', { port: '1905' });
    assert.equal(response.result, 'discoveryPartial');
    assert.equal(h.runtime.config.port, 905);
    assert.equal(h.adapter.config.port, 905);
    assert.deepEqual(ports, [1905]);
    const choices = await h.runtime.handleMessage('getDiscoveredTvs', { port: 1905 });
    assert.equal(choices[1].value, '192.0.2.9', 'A discovered Loewe with unreachable control port is not silently omitted');
    assert.match(choices[1].label, /Steuerport 1905 nicht erreichbar/u);
    assert.equal((await h.runtime.handleMessage('getDiscoveredTvs', { port: 905 })).length, 1);
    const other = await harness(t, { pollInterval: 0 }, () => {}, {
        tvDiscovery() { assert.fail('A different instance must not scan just to load its choices'); },
    });
    assert.equal((await other.runtime.handleMessage('getDiscoveredTvs', { port: 1905 })).length, 1);
});

test('concurrent TV searches share one run while remote commands continue independently', async t => {
    const pending = deferred();
    let scans = 0;
    const h = await harness(t, { pollInterval: 0 }, () => {}, {
        tvDiscovery() { scans++; return pending.promise; },
    });
    const first = h.runtime.handleMessage('discoverTvs', { port: 905 });
    const second = h.runtime.handleMessage('discoverTvs', { port: 905 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scans, 1);
    assert.match((await h.runtime.handleMessage('getDiscoveredTvs', { port: 905 }))[0].label, /werden gesucht/u);
    const differentPort = await h.runtime.handleMessage('discoverTvs', { port: 1905 });
    assert.equal(differentPort.error, 'discoveryFailed');
    await write(h, 'remote.home', true);
    assert.equal(calls(h.client, 'key').length, 1, 'A TV command must finish before discovery has returned');
    pending.resolve({ devices: [], warnings: [] });
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(a, b);
    assert.equal(a.result, 'discoveryEmpty');
    assert.equal(scans, 1);
});

test('invalid search payloads do not open network sockets', async t => {
    const h = await harness(t, { pollInterval: 0 }, () => {}, {
        tvDiscovery() { assert.fail('Invalid discovery input reached the network'); },
    });
    for (const message of [null, [], 'invalid', { port: 0 }, { port: 65536 }, { port: -1 }, { port: 905.5 }, { port: true }, { port: null }, { port: '' }, { port: '905/path' }]) {
        assert.equal((await h.runtime.handleMessage('discoverTvs', message)).error, 'discoveryInvalidPort');
        const choices = await h.runtime.handleMessage('getDiscoveredTvs', message);
        assert.equal(choices.length, 1);
        assert.equal(choices[0].value, '');
    }
});

test('TV discovery failures clear stale choices and a later explicit scan can succeed', async t => {
    let attempt = 0;
    const h = await harness(t, { pollInterval: 0 }, () => {}, {
        async tvDiscovery() {
            attempt++;
            if (attempt === 2) throw codedError('DISCOVERY_UNAVAILABLE', 'Kein Netzwerk verfügbar');
            return { devices: [{ host: '192.0.2.9', name: 'Loewe', apiReachable: true }], warnings: attempt === 3 ? ['One interface failed'] : [] };
        },
    });
    const first = await h.runtime.handleMessage('discoverTvs', {});
    const failure = await h.runtime.handleMessage('discoverTvs', {});
    assert.equal(failure.result, 'discoveryFailed');
    assert.deepEqual(failure.args, ['Kein Netzwerk verfügbar']);
    assert.ok(failure.native._tvDiscoveryReload > first.native._tvDiscoveryReload);
    const choices = await h.runtime.handleMessage('getDiscoveredTvs', {});
    assert.equal(choices.length, 1);
    assert.match(choices[0].label, /Suche fehlgeschlagen/u);
    const retry = await h.runtime.handleMessage('discoverTvs', {});
    assert.equal(retry.result, 'discoveryPartial');
    assert.ok(retry.native._tvDiscoveryReload > failure.native._tvDiscoveryReload);
    assert.equal((await h.runtime.handleMessage('getDiscoveredTvs', {})).length, 2);
});

test('stopping cancels TV discovery immediately and ignores late search results', async t => {
    const pending = deferred();
    let signal;
    const h = await harness(t, { pollInterval: 0 }, () => {}, {
        tvDiscovery(options) { signal = options.signal; return pending.promise; },
    });
    const running = h.runtime.handleMessage('discoverTvs', {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signal.aborted, false);
    await h.runtime.stop();
    assert.equal(signal.aborted, true);
    assert.deepEqual(await running, { error: 'discoveryUnavailable' });
    pending.resolve({ devices: [{ host: '192.0.2.10', name: 'Late TV' }], warnings: [] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.runtime._tvDiscoveryResult, null);
    assert.equal(h.runtime._tvDiscoveryPromise, null);
    assert.equal(h.runtime._tvDiscoveryAbort, null);
    assert.equal((await h.runtime.handleMessage('discoverTvs', {})).error, 'discoveryUnavailable');
});

test('a stalled discovery dependency is bounded independently of the SOAP timeout', async t => {
    const pending = deferred();
    let signal;
    const h = await harness(t, { pollInterval: 0 }, () => {}, {
        tvDiscovery(options) { signal = options.signal; return pending.promise; },
    });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const running = h.runtime.handleMessage('discoverTvs', {});
    await Promise.resolve();
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(8000);
    const response = await running;
    assert.equal(signal.aborted, true);
    assert.equal(response.result, 'discoveryFailed');
    assert.match(response.args[0], /Zeitlimit/u);
    pending.resolve({ devices: [{ host: '192.0.2.10', name: 'Late TV' }], warnings: [] });
    await Promise.resolve();
    assert.equal((await h.runtime.handleMessage('getDiscoveredTvs', {})).length, 1);
    assert.equal(h.runtime._tvDiscoveryPromise, null);
    t.mock.timers.reset();
});

test('startup creates usable button objects without replaying saved commands', async t => {
    const { adapter, client, clientOptions } = await harness(t, {}, store => {
        store.states.set('remote.home', { val: true, ack: false });
    });
    assert.equal(clientOptions.host, 'fixture.invalid');
    assert.equal(clientOptions.port, 905);
    assert.equal(clientOptions.appendNul, true);
    assert.ok(adapter.subscriptions.includes('*'));
    assert.equal(calls(client, 'key').length, 0);
    assert.equal(adapter.states.get('remote.home').val, false);
    assert.equal(adapter.states.get('remote.home').ack, true);

    const buttons = [...adapter.objects.values()].filter(object =>
        object.type === 'state' && object.common.role?.startsWith('button'));
    assert.ok(buttons.length >= 28, 'Expected the extracted remote keys to be represented');
    for (const object of buttons) {
        assert.equal(object.common.type, 'boolean');
        assert.equal(object.common.read, false);
        assert.equal(object.common.write, true);
    }
    assert.equal(adapter.objects.get('info.connection').common.write, false);
    assert.equal(adapter.states.get('info.connection').val, true);
});

test('upgrade removes only the requested own paths before creating a client or restoring channels', async t => {
    const adapter = new FakeAdapter({ pollInterval: 0, enableAdvanced: true });
    const obsolete = [
        'api', 'api.SetVolume', 'api.SetVolume.send', 'api.SetVolume.parametersXml', 'api.saved.child',
        'media.text', 'media.backspace', 'media.locator', 'media.saved.child',
        // A missing parent must not leave orphaned radio children behind.
        'channels.radio.Legacy_Radio', 'channels.radio.Legacy_Radio.select', 'channels.radio.saved.child',
        'remote.radio_mode_on', 'channels.mediaType',
        ...RETIRED_STATIC_STATES,
    ];
    const preserved = [
        'channels', 'channels.tv', 'channels.tv.Das_Erste_HD', 'channels.tv.Das_Erste_HD.select',
        'channels.tv.Das_Erste_HD.personal', 'channels.radio_backup', 'channels.radio_backup.keep',
        'apiary', 'apiary.keep', 'remote.tv_mode_on', 'remote.radio_mode_on.personal', 'channels.mediaType.personal',
        'media_backup', 'media_backup.keep', 'loewe-tv.1.media.text',
        'channels.items_backup', 'channels.items.personal', 'loewe-tv.1.channels.items',
        'loewe-tv.1.api.SetVolume.send', 'loewe-tv.1.channels.radio.Legacy_Radio.select', 'other.0.api',
    ];
    for (const id of [...obsolete, ...preserved]) {
        adapter.objects.set(id, { type: 'state', common: { name: id }, native: { retained: id } });
        adapter.states.set(id, { val: `saved ${id}`, ack: true });
    }
    const removed = () => {
        for (const id of obsolete) {
            assert.equal(adapter.objects.has(id), false, `Removed object ${id}`);
            assert.equal(adapter.states.has(id), false, `Removed state ${id}`);
        }
    };
    let clients = 0;
    let restores = 0;
    const runtime = new AdapterRuntime(adapter, { clientFactory() {
        removed();
        clients++;
        return new FakeClient();
    } });
    runtime.channelObjects.start = () => { removed(); restores++; };
    t.after(() => runtime.stop());
    await runtime.start();
    removed();
    assert.equal(clients, 1);
    assert.equal(restores, 1);
    for (const id of preserved) assert.equal(adapter.objects.get(id)?.native.retained, id, `Preserved object ${id}`);
    assert.deepEqual(adapter.deletions, [
        { id: 'channels.radio', recursive: true }, { id: 'api', recursive: true },
        { id: 'media', recursive: true },
        { id: 'remote.radio_mode_on', recursive: false }, { id: 'channels.mediaType', recursive: false },
        ...RETIRED_STATIC_STATES.map(id => ({ id, recursive: false })),
    ]);
    assert.ok([...runtime._objects.keys()].every(id => !/^(?:api|media|channels\.radio)(?:\.|$)/u.test(id)));
    assert.equal(Object.hasOwn(runtime.config, 'enableAdvanced'), false);
});

test('offline upgrade removes obsolete raw pages and radio selection diagnostics', async t => {
    const television = { name: 'Fixture TV', itemClass: 'video', mediaItemUuid: 'tv-fixture', locator: 'channel://001:tv' };
    const radio = { name: 'Legacy Radio', itemClass: 'audio', mediaItemUuid: 'radio-fixture', locator: 'channel://210:radio' };
    const raw = JSON.stringify({ response: { audio: radio } });
    const h = await harness(t, { host: '', pollInterval: 0, enableAdvanced: true }, adapter => {
        adapter.objects.set('api.Legacy.send', { type: 'state' });
        adapter.objects.set('media.text', { type: 'state' });
        adapter.objects.set('channels.radio.Legacy_Radio.select', { type: 'state' });
        adapter.states.set('channels.view', { val: 'fastscan-fixture', ack: true });
        adapter.states.set('channels.entries', { val: JSON.stringify([television, radio]), ack: true });
        adapter.states.set('channels.lastSelection', { val: JSON.stringify({
            requested: { id: 'channels.radio.Legacy_Radio', itemClass: 'audio' },
            result: 0, status: 'unconfirmed', modeSwitch: { attempted: true },
        }), ack: true });
        adapter.states.set('channels.items', { val: raw, ack: true });
    });
    assert.equal(h.runtime.client, null, 'Migration must also run before a TV host is configured.');
    assert.deepEqual(h.client.calls, []);
    assert.equal(h.adapter.states.has('channels.entries'), false);
    assert.deepEqual(JSON.parse(h.adapter.states.get('channels.lastSelection').val), {});
    assert.equal(h.adapter.states.has('channels.items'), false);
    assert.equal(h.adapter.objects.has('api.Legacy.send'), false);
    assert.equal(h.adapter.objects.has('media.text'), false);
    assert.equal(h.adapter.objects.has('channels.radio.Legacy_Radio.select'), false);
});

test('offline upgrade retains the current TV selection while discarding redundant page copies', async t => {
    const entries = JSON.stringify([{ itemClass: 'video', name: 'Das Erste HD', mediaItemUuid: 'tv-fixture' }]);
    const selection = JSON.stringify({ requested: { id: 'channels.tv.Das_Erste_HD', itemClass: 'video' },
        status: 'accepted', result: 0, stationConfirmed: false, verification: 'notChecked', locatorSource: 'GetChannelList' });
    const h = await harness(t, { host: '', pollInterval: 0 }, adapter => {
        adapter.states.set('channels.view', { val: 'fastscan-fixture', ack: true });
        adapter.states.set('channels.entries', { val: entries, ack: true });
        adapter.states.set('channels.lastSelection', { val: selection, ack: true });
    });
    assert.equal(h.adapter.states.has('channels.entries'), false);
    assert.equal(h.adapter.states.get('channels.lastSelection').val, selection);
    assert.ok(h.adapter.writes.every(write => !['channels.entries', 'channels.lastSelection'].includes(write.id)));
});

test('acknowledged feedback, deleted values, other instances and false buttons do not send', async t => {
    const h = await harness(t);
    const baseline = h.client.calls.length;
    await h.runtime.handleStateChange('loewe-tv.0.remote.home', { val: true, ack: true });
    await h.runtime.handleStateChange('loewe-tv.0.remote.home', null);
    await h.runtime.handleStateChange('loewe-tv.1.remote.home', { val: true, ack: false });
    await h.runtime.handleStateChange('unrelated.0.remote.home', { val: true, ack: false });
    await h.runtime.handleStateChange('loewe-tv.0.info.connection', { val: false, ack: false });
    await write(h, 'remote.home', false);
    assert.equal(h.client.calls.length, baseline);
});

test('a remote button resets only after the command completes and feedback is not replayed', async t => {
    const h = await harness(t);
    const gate = deferred();
    h.client.hooks.key = () => gate.promise;
    const writeOffset = h.adapter.writes.length;
    const operation = write(h, 'remote.home', true);
    await waitUntil(() => calls(h.client, 'key').length === 1, 'Home command was not dispatched');
    assert.equal(h.adapter.writes.slice(writeOffset)
        .some(state => state.id === 'remote.home' && state.ack), false);
    gate.resolve(response('InjectRCKey'));
    await operation;
    assert.equal(h.adapter.states.get('remote.home').val, false);
    assert.equal(h.adapter.states.get('remote.home').ack, true);
    await h.runtime.handleStateChange('loewe-tv.0.remote.home', { val: false, ack: true });
    assert.deepEqual(calls(h.client, 'key').map(call => call.args), [['home']]);
});

test('failed mutations are reported without retrying and buttons still reset', async t => {
    const h = await harness(t);
    h.client.hooks.key = () => {
        throw codedError('NETWORK', 'Simulated connection lost after sending');
    };
    await write(h, 'remote.ok', true);
    assert.deepEqual(calls(h.client, 'key').map(call => call.args), [['ok']]);
    assert.equal(h.adapter.states.get('remote.ok').val, false);
    assert.equal(h.adapter.states.get('remote.ok').ack, true);
    assert.match(h.adapter.states.get('info.lastError').val, /Simulated connection lost/);
    assert.equal(h.adapter.states.get('info.connection').val, false);
});

test('volume state reflects the returned level, never an optimistic requested level', async t => {
    const h = await harness(t);
    const gate = deferred();
    h.client.hooks.getVolume = () => gate.promise;
    const oldVolumeReads = calls(h.client, 'getVolume').length;
    const writeOffset = h.adapter.writes.length;
    const operation = write(h, 'control.volume', 10);
    await waitUntil(() => calls(h.client, 'getVolume').length > oldVolumeReads,
        'Volume was not read back after setting it');
    assert.deepEqual(calls(h.client, 'setVolume').at(-1).args, [10]);
    assert.equal(h.adapter.states.get('status.volume').val, 21);
    assert.equal(h.adapter.writes.slice(writeOffset)
        .some(state => state.id === 'control.volume' && state.ack), false);
    h.client.volume = 14;
    gate.resolve(14);
    await operation;
    assert.equal(h.adapter.states.get('control.volume').val, 14);
    assert.equal(h.adapter.states.get('control.volume').ack, true);
    assert.equal(h.adapter.states.get('status.volume').val, 14);
    assert.equal(h.adapter.states.has('status.volumeRaw'), false);
});

test('out-of-range and wrongly typed volume commands never reach the TV', async t => {
    const h = await harness(t, { maxVolume: 20 });
    for (const value of [-1, 21, 100, 3.5, '15', null, true]) {
        await write(h, 'control.volume', value);
    }
    assert.equal(calls(h.client, 'setVolume').length, 0);
    assert.ok(h.adapter.states.get('info.lastError').val.length > 0);
    assert.equal(h.adapter.states.get('status.volume').val, 21,
        'Readback is not capped by the optional command limit');
});

test('mute state uses confirmed TV feedback even when it differs from the command', async t => {
    const h = await harness(t);
    h.client.muted = false;
    await write(h, 'control.mute', true);
    assert.deepEqual(calls(h.client, 'setMute').at(-1).args, [true]);
    assert.equal(h.adapter.states.get('control.mute').val, false);
    assert.equal(h.adapter.states.get('control.mute').ack, true);
    assert.equal(h.adapter.states.get('status.mute').val, false);
});

test('configured list stays authoritative and complete refresh ignores retired paging parameters', async t => {
    const h = await harness(t, { channelListView: ' fixture-list ' });
    const baseline = h.client.calls.length;
    await write(h, 'channels.view', 'attempted-other-list');
    await write(h, 'channels.start', 100);
    await write(h, 'channels.count', 25);
    assert.equal(h.client.calls.length, baseline);
    assert.equal(h.adapter.states.get('channels.view').ack, true);
    assert.equal(h.adapter.states.get('channels.view').val, 'fixture-list');
    assert.equal(h.adapter.objects.get('channels.view').common.write, false);
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    assert.deepEqual(calls(h.client, 'getChannels').map(call => call.args), [
        ['fixture-list', 0, 500, 'video'],
    ]);
    assert.deepEqual(h.adapter.states.get('channels.refresh'), { val: false, ack: true });
    assert.equal(h.adapter.states.get('channels.refreshCount').val, 1);
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_TV.select'), true);
});

for (const savedView of [undefined, 'old-tv-list']) {
    test(`empty configured selection does not choose or restore an arbitrary ${savedView === undefined ? 'new' : 'upgraded'} list`, async t => {
        const h = await harness(t, { pollInterval: 0, channelListView: '' }, adapter => {
            if (savedView !== undefined) adapter.states.set('channels.view', { val: savedView, ack: true });
            adapter.states.set('channels.entries', { val: '[{"itemClass":"video","name":"Old TV"}]', ack: true });
            adapter.states.set('channels.items', { val: '{"old":"raw list"}', ack: true });
        });
        await write(h, 'channels.refresh', true);
        assert.deepEqual(h.client.calls, []);
        assert.equal(h.adapter.states.get('channels.view').val, '');
        for (const id of RETIRED_STATIC_STATES) assert.equal(h.adapter.states.has(id), false, id);
        assert.equal(h.adapter.states.get('channels.refreshStatus').val, 'notConfigured');
        assert.match(h.adapter.states.get('channels.refreshError').val, /CHANNEL_LIST_REQUIRED.*Adapter-Konfiguration/u);
        assert.equal(h.adapter.states.get('channels.refresh').val, false);
    });
}

test('complete refresh requests video and builds only TV objects from a mixed reply', async t => {
    const h = await harness(t, { pollInterval: 0 });
    h.client.hooks.getChannels = view => response('GetChannelList', {
        ChannelListView: view,
        ResultItemFragment: {
            '@_startIndex': '0', '@_totalResults': '2', '@_returnedResults': '2',
            ResultItemReference: [
                { '@_mediaItemUuid': 'fixture-service-1', '@_shortInfo': 'Fixture TV',
                    '@_locator': 'channel://001:ch-fixture-service-1:sl-fixture', '@_caption': '001', '@_itemClass': 'video' },
                { '@_mediaItemUuid': 'fixture-radio-1', '@_shortInfo': 'Legacy Radio',
                    '@_locator': 'channel://210:ch-fixture-radio-1:sl-fixture', '@_caption': '210', '@_itemClass': 'audio' },
            ],
        },
    });
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    assert.deepEqual(calls(h.client, 'getChannels').at(-1).args, ['fastscan-fixture', 0, 500, 'video']);
    assert.equal(h.adapter.states.get('channels.refreshCount').val, 1);
    assert.equal(h.adapter.states.has('channels.items'), false);
    assert.equal(h.adapter.states.has('channels.entries'), false);
    assert.ok(h.adapter.objects.has('channels.tv.Fixture_TV.select'));
    assert.ok([...h.adapter.objects.keys()].every(id => !id.startsWith('channels.radio.')));
});

test('TV selection sends exactly one direct zap and records acceptance without claiming playback confirmation', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    h.client.hooks.zap = () => response('ZapToMedia', { Result: '0' });
    const offset = h.client.calls.length;
    await write(h, 'channels.tv.Fixture_TV.select', true);
    assert.deepEqual(h.client.calls.slice(offset), [
        { method: 'zap', args: ['channel://001:ch-fixture-service-1:sl-fixture'] },
    ]);
    const report = JSON.parse(h.adapter.states.get('channels.lastSelection').val);
    assert.equal(report.requested.id, 'channels.tv.Fixture_TV');
    assert.equal(report.requested.itemClass, 'video');
    assert.equal(report.status, 'accepted');
    assert.equal(report.phase, 'complete');
    assert.equal(report.result, 0);
    assert.equal(report.locatorSource, 'GetChannelList');
    assert.equal(report.resolvedLocator, report.listLocator);
    assert.equal(report.stationConfirmed, false);
    assert.equal(report.verification, 'notChecked');
    assert.equal(Object.hasOwn(report, 'modeSwitch'), false);
    assert.deepEqual(h.adapter.states.get('channels.tv.Fixture_TV.select'), { val: false, ack: true });
});

test('a newer channel snapshot invalidates a queued TV selection before any zap', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    const page = parseChannelPage(await h.client.getChannels('fastscan-fixture', 0, 100, 'video'));
    const gate = deferred();
    t.after(() => gate.resolve());
    h.runtime._tail = gate.promise;
    const selection = write(h, 'channels.tv.Fixture_TV.select', true);
    h.runtime.channelObjects.acceptPage(page, 'video');
    await h.runtime.channelObjects.whenIdle();
    gate.resolve();
    await selection;
    assert.equal(calls(h.client, 'zap').length, 0);
    assert.match(h.adapter.states.get('info.lastError').val, /CHANNEL_UPDATING|CHANNEL_UNAVAILABLE/u);
    assert.equal(JSON.parse(h.adapter.states.get('channels.lastSelection').val).status, 'error');
    assert.deepEqual(h.adapter.states.get('channels.tv.Fixture_TV.select'), { val: false, ack: true });
});

test('named channel buttons use registered targets and track the real pending reset write', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    const button = 'channels.tv.Fixture_TV.select';
    const locator = 'channel://001:ch-fixture-service-1:sl-fixture';
    assert.ok(h.adapter.objects.has(button), 'A real channel reply must create the named button.');

    // A matching path or a user-edited metadata value cannot authorize a zap.
    await write(h, 'channels.tv.Selbst_angelegt.select', true);
    await write(h, 'channels.tv.Fixture_TV.locator', 'channel://999:ch-other:sl-fixture');
    await h.runtime.handleStateChange(`loewe-tv.0.${button}`, { val: true, ack: true });
    await write(h, button, false);
    assert.equal(calls(h.client, 'zap').length, 0);

    const reply = deferred();
    const reset = deferred();
    t.after(() => { reply.resolve(response('ZapToMedia')); reset.resolve(); });
    h.client.hooks.zap = () => reply.promise;
    const setState = h.adapter.setStateAsync.bind(h.adapter);
    h.adapter.setStateAsync = async (id, state) => {
        if (id === button && state.val === false) await reset.promise;
        return setState(id, state);
    };
    const selection = write(h, button, true);
    await waitUntil(() => calls(h.client, 'zap').length === 1, 'The named channel selection was not dispatched.');
    assert.deepEqual(calls(h.client, 'zap')[0].args, [locator]);
    assert.deepEqual(h.adapter.states.get(button), { val: true, ack: false });

    reply.resolve(response('ZapToMedia'));
    await waitUntil(() => h.runtime.channelObjects.resetWrites.get(button)?.size === 1,
        'The named button reset must remain tracked until setStateAsync really settles.');
    assert.deepEqual(h.adapter.states.get(button), { val: true, ack: false });
    reset.resolve();
    await selection;
    assert.deepEqual(h.adapter.states.get(button), { val: false, ack: true });
    assert.equal(h.runtime.channelObjects.resetWrites.has(button), false);
    assert.equal(calls(h.client, 'zap').length, 1);
});

test('Admin list discovery preserves an explicit favorite selection without paging data points', async t => {
    const h = await harness(t, { pollInterval: 0, channelListView: ' favlist-personal ' });
    const options = await h.runtime.handleMessage('getChannelLists', { channelListView: 'favlist-personal' });
    assert.deepEqual(calls(h.client, 'getChannelLists').at(-1).args.slice(0, 2), [0, 500]);
    assert.ok(options.some(option => option.value === 'favlist-personal'));
    assert.equal(h.adapter.states.get('channels.view').val, 'favlist-personal');
    assert.equal(h.adapter.states.has('channels.availableLists'), false);
    await write(h, 'channels.refresh', true);
    assert.deepEqual(calls(h.client, 'getChannels').at(-1).args, ['favlist-personal', 0, 500, 'video']);
});

test('TV list synchronization remains visible in Admin without changing the configured list', async t => {
    const h = await harness(t, { pollInterval: 0 }, (_adapter, client) => {
        client.hooks.getChannelLists = () => response('GetListOfChannelLists', { Result: 'SYNC' });
    });
    const options = await h.runtime.handleMessage('getChannelLists', { channelListView: 'fastscan-fixture' });
    assert.equal(calls(h.client, 'getChannels').length, 0);
    assert.match(options[0].label, /TV_SYNC.*synchronisiert/u);
    assert.equal(h.adapter.states.has('channels.lists'), false);
    assert.equal(h.adapter.states.get('channels.view').val, 'fastscan-fixture');
});

test('a malformed channel reply preserves the last complete catalogue without recreating raw data points', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    const catalog = h.adapter.states.get('channels.catalog').val;
    const lastUpdate = h.adapter.states.get('channels.refreshLastUpdate').val;
    h.client.hooks.getChannels = () => response('GetChannelList', { UnexpectedShape: 'fixture' });
    await write(h, 'channels.refresh', true);
    assert.match(h.adapter.states.get('channels.refreshError').val, /INVALID_RESPONSE/u);
    assert.equal(h.adapter.states.get('channels.catalog').val, catalog);
    assert.equal(h.adapter.states.get('channels.refreshLastUpdate').val, lastUpdate);
    assert.equal(h.adapter.states.has('channels.items'), false);
});

test('Admin selection enumerates all pages, keeps empty and unfamiliar lists, and distinguishes equal names', async t => {
    const h = await harness(t, { pollInterval: 0 });
    const first = { view: 'favlist-one', name: 'Favoriten', total: 12 };
    const pages = [
        [{ view: 'avlist-all', name: 'AV-Eingänge' }, first],
        [{ view: 'custom-empty', name: 'Leere Liste', total: 0 }, { view: 'favlist-two', name: 'Favoriten', total: 5 }],
        [first, { view: 'unknown-prefix-third', name: 'Weitere Liste', total: null }],
    ];
    h.client.hooks.getChannelLists = start => listResponse(pages[start / 2], { start, total: 6 });
    const options = await h.runtime.handleMessage('getChannelLists', { host: 'fixture.invalid', port: 905, channelListView: 'favlist-two' });
    assert.ok(Array.isArray(options));
    assert.deepEqual(options.map(option => option.value), ['', 'favlist-one', 'custom-empty', 'favlist-two', 'unknown-prefix-third']);
    assert.match(options.find(option => option.value === 'custom-empty').label, /0 Einträge/u);
    assert.match(options.find(option => option.value === 'favlist-one').label, /Favoriten.*favlist-one/u);
    assert.match(options.find(option => option.value === 'favlist-two').label, /Favoriten.*favlist-two/u);
    const requests = calls(h.client, 'getChannelLists');
    assert.deepEqual(requests.map(call => call.args.slice(0, 2)), [[0, 500], [2, 500], [4, 500]]);
    assert.ok(requests.every(call => call.args[2].deadline === requests[0].args[2].deadline));
    assert.equal(h.adapter.states.has('channels.availableLists'), false, 'Choices are returned directly to Admin.');
    assert.equal(h.adapter.states.get('channels.view').val, 'fastscan-fixture');
    assert.equal(h.runtime.config.channelListView, 'fastscan-fixture');
    assert.equal(calls(h.client, 'getChannels').length, 0, 'Opening the configuration must not materialize or switch a channel.');
    assert.equal(calls(h.client, 'zap').length, 0);
});

test('Admin discovery with unknown totals reads until an explicit empty end even after a short page', async t => {
    const h = await harness(t, { pollInterval: 0, channelListView: '' });
    h.client.hooks.getChannelLists = start => listResponse(start === 0
        ? [{ view: 'one' }, { view: 'two' }] : start === 2 ? [{ view: 'three' }] : [], { start: null, total: null });
    const options = await h.runtime.handleMessage('getChannelLists', {});
    assert.deepEqual(options.map(option => option.value), ['', 'one', 'two', 'three']);
    assert.deepEqual(calls(h.client, 'getChannelLists').map(call => call.args[0]), [0, 2, 3]);
    assert.equal(h.adapter.states.get('channels.view').val, '');
});

test('concurrent Admin list discovery coalesces while remote commands run between pages and each UI selection is retained', async t => {
    const h = await harness(t, { pollInterval: 0 });
    const gate = deferred();
    t.after(() => gate.resolve());
    h.client.hooks.getChannelLists = async start => {
        if (start === 0) await gate.promise;
        return listResponse([{ view: start === 0 ? 'one' : 'two' }], { start, total: 2 });
    };
    const first = h.runtime.handleMessage('getChannelLists', { channelListView: 'saved-in-ui-a' });
    const second = h.runtime.handleMessage('getChannelLists', { channelListView: 'saved-in-ui-b' });
    await waitUntil(() => calls(h.client, 'getChannelLists').length === 1, 'Discovery did not start.');
    const remote = write(h, 'remote.home', true);
    gate.resolve();
    const [firstOptions, secondOptions] = await Promise.all([first, second, remote]);
    assert.deepEqual(h.client.calls.map(call => call.method), ['getChannelLists', 'key', 'getChannelLists']);
    assert.equal(h.client.maxActiveRequests, 1);
    assert.deepEqual(firstOptions.map(option => option.value), ['', 'one', 'two', 'saved-in-ui-a']);
    assert.deepEqual(secondOptions.map(option => option.value), ['', 'one', 'two', 'saved-in-ui-b']);
    assert.match(firstOptions.at(-1).label, /nicht mehr gemeldet/u);
    assert.equal(h.adapter.states.get('channels.view').val, 'fastscan-fixture');
});

for (const failure of ['different-offset', 'changed-total', 'repeated-page', 'too-many-lists', 'too-many-pages', 'synchronizing', 'transport']) {
    test(`Admin discovery returns a usable error array and never publishes partial choices on ${failure}`, async t => {
        const h = await harness(t, { pollInterval: 0 });
        h.client.hooks.getChannelLists = start => {
            if (failure === 'synchronizing') return response('GetListOfChannelLists', { Result: 'SYNC' });
            if (failure === 'transport') throw codedError('NETWORK', 'TV is offline');
            const list = { view: failure === 'repeated-page' ? 'repeated' : `list-${start}` };
            return listResponse([list], {
                start: failure === 'different-offset' ? start + 1 : start,
                total: failure === 'too-many-pages' ? null : failure === 'too-many-lists' ? 2001
                    : failure === 'changed-total' ? start === 0 ? 3 : 4 : 3,
            });
        };
        const options = await h.runtime.handleMessage('getChannelLists', { channelListView: 'ui-selected' });
        assert.ok(Array.isArray(options));
        assert.deepEqual(options.map(option => option.value), ['', 'ui-selected']);
        assert.ok(options.every(option => /nicht verfügbar/u.test(option.label)));
        assert.equal(h.adapter.states.has('channels.availableLists'), false);
        assert.equal(h.adapter.states.get('channels.view').val, 'fastscan-fixture');
        assert.equal(calls(h.client, 'getChannels').length, 0);
        assert.ok(calls(h.client, 'getChannelLists').length <= 20);
    });
}

test('Admin discovery validates unsaved connection fields before any request and does not create a separate TV client', async t => {
    const h = await harness(t, { pollInterval: 0 });
    for (const message of [null, 'invalid', { host: 'unsaved.invalid' }, { port: '999' }, { host: true }]) {
        const options = await h.runtime.handleMessage('getChannelLists', message);
        assert.ok(Array.isArray(options));
        assert.match(options[0].label, /nicht verfügbar/u);
    }
    assert.deepEqual(h.client.calls, []);
    const unavailable = await harness(t, { host: '', pollInterval: 0 });
    const options = await unavailable.runtime.handleMessage('getChannelLists', { channelListView: 'old-choice' });
    assert.deepEqual(options.map(option => option.value), ['', 'old-choice']);
    assert.match(options[0].label, /TV-Adresse speichern/u);
    assert.equal(unavailable.runtime.client, null);
});

test('Admin reload is immediate, uses a strictly increasing UI revision, and never changes the configured list', async t => {
    const h = await harness(t, { pollInterval: 0 });
    const first = await h.runtime.handleMessage('refreshChannelLists', {});
    const second = await h.runtime.handleMessage('refreshChannelLists', {});
    assert.ok(Number.isSafeInteger(first.native._channelListsReload));
    assert.ok(second.native._channelListsReload > first.native._channelListsReload);
    assert.deepEqual(h.client.calls, []);
    assert.equal(h.runtime.config.channelListView, 'fastscan-fixture');
    assert.equal(await h.runtime.handleMessage('unsupported-command', {}), undefined);
});

test('Admin discovery has an overall 30-second callback deadline including time spent behind other commands', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await h.runtime.channelObjects.whenIdle();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const gate = deferred();
    t.after(() => gate.resolve());
    h.runtime._tail = gate.promise;
    const pending = h.runtime.handleMessage('getChannelLists', { channelListView: 'saved' });
    await waitUntil(() => h.runtime._pendingCount > 0, 'Discovery was not queued.');
    t.mock.timers.tick(30000);
    const options = await pending;
    assert.match(options[0].label, /CHANNEL_LIST_TIMEOUT/u);
    assert.deepEqual(options.map(option => option.value), ['', 'saved']);
    gate.resolve();
    await h.runtime._tail;
    assert.deepEqual(h.client.calls, [], 'An expired queued discovery must not send later.');
});

test('shutdown releases a pending Admin discovery callback and prevents its queued TV request', async t => {
    const h = await harness(t, { pollInterval: 0 });
    const gate = deferred();
    t.after(() => gate.resolve());
    h.runtime._tail = gate.promise;
    const pending = h.runtime.handleMessage('getChannelLists', { channelListView: 'saved' });
    await waitUntil(() => h.runtime._pendingCount > 0, 'Discovery was not queued.');
    await h.runtime.stop();
    const options = await pending;
    assert.match(options[0].label, /CLOSED/u);
    gate.resolve();
    await h.runtime._tail;
    assert.deepEqual(h.client.calls, []);
    assert.equal(h.client.closed, true);
});

test('different, missing and radio list replies cannot replace the configured complete TV catalogue', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.refresh', true);
    await h.runtime.channelObjects.whenIdle();
    const catalog = h.adapter.states.get('channels.catalog').val;
    const lastUpdate = h.adapter.states.get('channels.refreshLastUpdate').val;
    const good = await h.client.getChannels('fastscan-fixture');
    for (const mode of ['other', 'missing', 'audio']) {
        const wrong = structuredClone(good);
        const node = wrong.data.Envelope.Body.GetChannelListResponse;
        if (mode === 'missing') delete node.ChannelListView;
        else if (mode === 'other') node.ChannelListView = 'another-list';
        else node.ItemClass = 'audio';
        h.client.hooks.getChannels = () => wrong;
        await write(h, 'channels.refresh', true);
        await h.runtime.channelObjects.whenIdle();
        assert.match(h.adapter.states.get('channels.refreshError').val, /CHANNEL_REFRESH_INVALID/u);
        assert.equal(h.adapter.states.has('channels.entries'), false);
        assert.equal(h.adapter.states.get('channels.catalog').val, catalog);
        assert.equal(h.adapter.states.get('channels.refreshLastUpdate').val, lastUpdate);
    }
});

test('saved raw pages and stale selection counts are cleared when the configured list changes', async t => {
    const h = await harness(t, { pollInterval: 0, channelListView: 'configured-new-list' }, adapter => {
        adapter.states.set('channels.view', { val: 'previous-list', ack: true });
        adapter.states.set('channels.items', { val: '{"old":"raw page"}', ack: true });
        adapter.states.set('channels.entries', { val: '[{"itemClass":"video","name":"Previous TV"}]', ack: true });
        adapter.states.set('channels.lastSelection', { val: '{"requested":{"itemClass":"video","listView":"previous-list"}}', ack: true });
        adapter.states.set('channels.totalNumber', { val: 372, ack: true });
        adapter.states.set('channels.refreshCount', { val: 300, ack: true });
    });
    assert.equal(h.adapter.states.get('channels.view').val, 'configured-new-list');
    assert.equal(h.adapter.states.has('channels.entries'), false);
    assert.equal(h.adapter.states.has('channels.items'), false);
    assert.equal(h.adapter.states.get('channels.lastSelection').val, '{}');
    assert.equal(h.adapter.states.has('channels.totalNumber'), false);
    assert.equal(h.adapter.states.get('channels.refreshCount').val, 0);
    assert.deepEqual(h.client.calls, []);
});

test('power on sends WOL then discrete TV_ON while retaining transport-only diagnostics', async t => {
    const h = await harness(t, { pollInterval: 0, macLan: '02:00:00:00:00:01' });
    await write(h, 'control.powerOn', true);
    assert.deepEqual(h.client.calls.map(call => call.method), ['wake', 'key']);
    assert.deepEqual(calls(h.client, 'key').at(-1).args, ['power_on']);
    assert.equal(JSON.parse(h.adapter.states.get('info.powerOn').val).phase, 'powerKeySent');
    assert.equal(h.adapter.states.get('info.connection').val, true);
    assert.equal(h.adapter.states.get('control.powerOn').val, false);
    await write(h, 'control.powerOff', true);
    assert.deepEqual(calls(h.client, 'key').at(-1).args, ['power_all_code']);
});

test('power off cancels a waiting TV_ON attempt before it enters the SOAP transport', async t => {
    const h = await harness(t, { pollInterval: 0, macLan: '02:00:00:00:00:01' });
    const blocked = deferred();
    h.runtime._tail = blocked.promise;
    const waking = write(h, 'control.powerOn', true);
    await waitUntil(() => h.runtime._pendingCount > 0, 'TV_ON should wait behind the existing operation');
    assert.equal(calls(h.client, 'wake').length, 1, 'WOL must already have been sent');
    const off = write(h, 'control.powerOff', true);
    blocked.resolve();
    await Promise.all([waking, off]);
    assert.deepEqual(calls(h.client, 'key').map(call => call.args[0]), ['power_all_code']);
    assert.equal(h.runtime._pendingCount, 0);
});

test('a second off also cancels power on waiting for an older aborted sequence to finish', async t => {
    const h = await harness(t, { pollInterval: 0, macLan: '02:00:00:00:00:01' });
    const cleanup = deferred();
    let cleanupStarted = false;
    const originalSetState = h.adapter.setStateAsync.bind(h.adapter);
    h.adapter.setStateAsync = async (id, state) => {
        if (id === 'control.powerOn' && state.val === false && !cleanupStarted) {
            cleanupStarted = true;
            await cleanup.promise;
        }
        return originalSetState(id, state);
    };
    const blocked = deferred();
    h.runtime._tail = blocked.promise;
    const firstOn = write(h, 'control.powerOn', true);
    await waitUntil(() => h.runtime._pendingCount > 0, 'First TV_ON should be queued');
    const firstOff = write(h, 'control.powerOff', true);
    await waitUntil(() => cleanupStarted, 'Cancelled sequence should reach cleanup');
    const secondOn = write(h, 'control.powerOn', true);
    const secondOff = write(h, 'control.powerOff', true);
    cleanup.resolve();
    blocked.resolve();
    await Promise.all([firstOn, firstOff, secondOn, secondOff]);
    assert.equal(calls(h.client, 'wake').length, 1, 'No delayed second wake may start after the latest off');
    assert.ok(calls(h.client, 'key').every(call => call.args[0] === 'power_all_code'));
});

test('WOL setting flags preserve unknown values until valid TV settings are read', async t => {
    const h = await harness(t, { pollInterval: 0 }, (_adapter, client) => {
        client.hooks.getSettings = () => response('GetSettings', { WolEnable: '1', WolInteractive: '0' });
    });
    assert.equal(h.adapter.states.has('device.wolEnabled'), false);
    await write(h, 'control.refresh', true);
    assert.equal(h.adapter.states.get('device.wolEnabled').val, true);
    assert.equal(h.adapter.states.get('device.wolInteractive').val, false);
    h.client.hooks.getSettings = () => response('GetSettings', { WolEnable: 'unknown' });
    await write(h, 'control.refresh', true);
    assert.equal(h.adapter.states.get('device.wolEnabled').val, null);
    assert.equal(h.adapter.states.get('device.wolInteractive').val, null);
});

test('obsolete data point events stay inert even with saved legacy flags and stale definitions', async t => {
    const h = await harness(t, { pollInterval: 0, enableAdvanced: true });
    assert.equal(Object.hasOwn(h.runtime.config, 'enableAdvanced'), false);
    const obsolete = [
        ['api.SetVolume.parametersXml', '<Value>120000</Value>'],
        ['api.SetVolume.send', true],
        ['api.RequestAccess.send', true],
        ['channels.radio.Fixture_Radio.select', true],
        ['remote.radio_mode_on', true],
        ['channels.mediaType', 'audio'],
        ['media.text', 'old text input'],
        ['media.backspace', true],
        ['media.locator', 'channel://999:old'],
        ...RETIRED_STATIC_STATES.map(id => [id, true]),
    ];
    assert.ok(obsolete.every(([id]) => !h.adapter.objects.has(id)));
    const writeOffset = h.adapter.writes.length;
    for (const [id, value] of obsolete) {
        // Even a stale registered definition may not re-enable a removed route.
        h.runtime._objects.set(id, { type: 'state', common: { write: true,
            role: typeof value === 'boolean' ? 'button' : 'text' } });
        await write(h, id, value);
    }
    assert.deepEqual(h.client.calls, []);
    assert.deepEqual(h.adapter.writes.slice(writeOffset), [], 'Ignored legacy events must not recreate acknowledgments.');
    assert.equal(h.adapter.states.get('info.lastCommand').val, '');
    assert.equal(h.runtime._pendingCount, 0);
});

test('a queued complete refresh stays on the configured list despite writes to retired paging states', async t => {
    const h = await harness(t, { pollInterval: 0, channelListView: 'first-list' });
    const gate = deferred();
    t.after(() => gate.resolve());
    h.runtime._tail = gate.promise;
    const query = write(h, 'channels.refresh', true);
    await write(h, 'channels.view', 'later-list');
    await write(h, 'channels.start', 100);
    await write(h, 'channels.count', 25);
    gate.resolve();
    await query;
    assert.deepEqual(calls(h.client, 'getChannels').map(call => call.args), [
        ['first-list', 0, 500, 'video'],
    ]);
    assert.equal(h.adapter.states.get('channels.view').val, 'first-list');
});

test('back-to-back remote commands remain serialized while a reply is pending', async t => {
    const h = await harness(t);
    const gate = deferred();
    h.client.hooks.key = name => name === 'home' ? gate.promise : response('InjectRCKey');
    const first = write(h, 'remote.home', true);
    const second = write(h, 'remote.ok', true);
    await waitUntil(() => calls(h.client, 'key').length === 1, 'First command was not dispatched');
    assert.deepEqual(calls(h.client, 'key')[0].args, ['home']);
    gate.resolve(response('InjectRCKey'));
    await Promise.all([first, second]);
    assert.deepEqual(calls(h.client, 'key').map(call => call.args), [['home'], ['ok']]);
    assert.equal(h.client.maxActiveRequests, 1);
});

test('concurrent status refreshes coalesce into one poll', async t => {
    const h = await harness(t);
    const baselineVolume = calls(h.client, 'getVolume').length;
    const baselineMute = calls(h.client, 'getMute').length;
    const gate = deferred();
    h.client.hooks.getVolume = () => gate.promise;
    const first = h.runtime.poll();
    const second = h.runtime.poll();
    const third = h.runtime.poll();
    await waitUntil(() => calls(h.client, 'getVolume').length > baselineVolume,
        'Status refresh did not start');
    assert.equal(calls(h.client, 'getVolume').length, baselineVolume + 1);
    gate.resolve(21);
    await Promise.all([first, second, third]);
    assert.equal(calls(h.client, 'getVolume').length, baselineVolume + 1);
    assert.equal(calls(h.client, 'getMute').length, baselineMute + 1);
    assert.equal(h.client.maxActiveRequests, 1);
});

test('polling schedules its next run after completion and stop clears the timer', async t => {
    const h = await harness(t);
    assert.equal(h.adapter.timers.size, 1);
    assert.equal([...h.adapter.timers.values()][0].ms, 30000);
    const baseline = calls(h.client, 'getVolume').length;
    const gate = deferred();
    h.client.hooks.getVolume = () => gate.promise;
    h.adapter.fireNextTimer();
    await waitUntil(() => calls(h.client, 'getVolume').length > baseline,
        'Scheduled poll did not run');
    assert.equal(h.adapter.timers.size, 0, 'A new poll must not be scheduled while this one is waiting');
    gate.resolve(21);
    await waitUntil(() => h.adapter.timers.size === 1, 'Next poll was not scheduled');
    await h.runtime.stop();
    assert.equal(h.adapter.timers.size, 0);
    assert.equal(h.client.closed, true);
});

test('shutdown prevents queued commands and polls from sending after an in-flight request', async t => {
    const h = await harness(t);
    const gate = deferred();
    h.client.hooks.key = () => gate.promise;
    const first = write(h, 'remote.home', true);
    await waitUntil(() => calls(h.client, 'key').length === 1, 'Initial command did not start');
    const queued = write(h, 'remote.ok', true);
    const poll = h.runtime.poll();
    const countBeforeStop = h.client.calls.length;
    const stopping = h.runtime.stop();
    gate.reject(codedError('CLOSED', 'Simulated shutdown abort'));
    await Promise.allSettled([first, queued, poll, stopping]);
    assert.equal(h.client.calls.length, countBeforeStop);
    assert.equal(h.client.closed, true);
    assert.equal(h.adapter.timers.size, 0);
    assert.equal(h.adapter.states.get('info.connection').val, false);
    await write(h, 'remote.home', true);
    await h.runtime.poll();
    assert.equal(h.client.calls.length, countBeforeStop);
});

test('shutdown during initial object creation prevents a late client from being created', async t => {
    const adapter = new FakeAdapter();
    const gate = deferred();
    const entered = deferred();
    const extend = adapter.extendObjectAsync.bind(adapter);
    adapter.extendObjectAsync = async (id, object) => {
        await extend(id, object);
        if (id === 'info') {
            entered.resolve();
            await gate.promise;
        }
    };
    let clientsCreated = 0;
    const runtime = new AdapterRuntime(adapter, {
        clientFactory() {
            clientsCreated += 1;
            return new FakeClient();
        },
    });
    t.after(() => runtime.stop());
    const starting = runtime.start();
    await entered.promise;
    await runtime.stop();
    const writesAtStop = adapter.writes.length;
    gate.resolve();
    await starting;
    assert.equal(clientsCreated, 0, 'A stopped startup must not create a new, unclosed client');
    assert.equal(adapter.writes.length, writesAtStop, 'Startup must stop creating state values after shutdown');
    assert.equal(adapter.timers.size, 0);
});

test('a reply whose database processing was pending at shutdown cannot update later TV states', async t => {
    const h = await harness(t);
    const gate = deferred();
    const entered = deferred();
    const setState = h.adapter.setStateAsync.bind(h.adapter);
    let pauseResponse = true;
    h.adapter.setStateAsync = async (id, state) => {
        if (h.adapter.localId(id) === 'info.lastSeen' && pauseResponse) {
            pauseResponse = false;
            entered.resolve();
            await gate.promise;
        }
        return setState(id, state);
    };
    h.client.volume = 35;
    const polling = h.runtime.poll();
    await entered.promise;
    await h.runtime.stop();
    const shutdownIndex = h.adapter.writes.length;
    gate.resolve();
    await polling;
    const lateTvStates = h.adapter.writes.slice(shutdownIndex)
        .filter(state => state.id.startsWith('status.') || state.id.startsWith('control.'));
    assert.deepEqual(lateTvStates, [], 'No fresh TV status may be published after shutdown');
    assert.equal(h.adapter.states.get('info.connection').val, false);
    assert.equal(h.adapter.timers.size, 0);
});

test('a cleanup database failure stops startup before subscriptions, transport or channel restoration', async t => {
    const adapter = new FakeAdapter({ pollInterval: 0 });
    const remove = adapter.delObjectAsync.bind(adapter);
    adapter.delObjectAsync = async (id, options) => {
        if (id === 'api') throw new Error('Simulated objects database permission failure');
        return remove(id, options);
    };
    let clients = 0;
    let restores = 0;
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => { clients++; return new FakeClient(); } });
    runtime.channelObjects.start = () => { restores++; };
    t.after(() => runtime.stop());
    await assert.rejects(runtime.start(), error => error.code === 'DATABASE'
        && /loewe-tv\.0\.api.*permission failure/u.test(error.message));
    assert.equal(clients, 0);
    assert.equal(restores, 0);
    assert.deepEqual(adapter.subscriptions, []);
    assert.equal(adapter.objects.size, 0);
    assert.deepEqual(adapter.deletions, [{ id: 'channels.radio', recursive: true }]);
});

for (const id of ['api.Locked.send', 'media.Locked', 'channels.radio.Locked.select', 'remote.radio_mode_on', 'channels.mediaType', 'channels.items', 'info.lastResponse']) {
    test(`cleanup detects a silently retained protected object at ${id} without overriding protection`, async t => {
        const adapter = new FakeAdapter({ pollInterval: 0 });
        adapter.objects.set(id, { type: 'state', common: { dontDelete: true }, native: {} });
        let clients = 0;
        let restores = 0;
        const runtime = new AdapterRuntime(adapter, { clientFactory: () => { clients++; return new FakeClient(); } });
        runtime.channelObjects.start = () => { restores++; };
        t.after(() => runtime.stop());
        await assert.rejects(runtime.start(), error => error.code === 'DATABASE'
            && error.message.includes(`${adapter.namespace}.${id}`) && /noch vorhanden/u.test(error.message));
        assert.equal(adapter.objects.get(id).common.dontDelete, true);
        assert.equal(adapter.objects.size, 1, 'No recovery object or force-delete workaround may be introduced.');
        assert.equal(adapter.deletions.length, 5 + RETIRED_STATIC_STATES.length, 'A failed verification does not retry or widen deletion.');
        assert.equal(clients, 0);
        assert.equal(restores, 0);
        assert.deepEqual(adapter.subscriptions, []);
    });
}

test('cleanup rejects a successful-looking deletion that leaves both obsolete trees unchanged', async t => {
    const adapter = new FakeAdapter({ pollInterval: 0 });
    adapter.objects.set('api.SetVolume.send', { type: 'state' });
    adapter.objects.set('channels.radio.Legacy.select', { type: 'state' });
    adapter.delObjectAsync = async (id, options) => { adapter.deletions.push({ id, ...options }); };
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => assert.fail('Incomplete cleanup cannot start a client.') });
    t.after(() => runtime.stop());
    await assert.rejects(runtime.start(), error => error.code === 'DATABASE'
        && /2 veraltete Objekte/u.test(error.message)
        && error.message.includes('loewe-tv.0.api.SetVolume.send')
        && error.message.includes('loewe-tv.0.channels.radio.Legacy.select'));
    assert.equal(adapter.objects.size, 2);
    assert.equal(adapter.deletions.length, 5 + RETIRED_STATIC_STATES.length);
    assert.deepEqual(adapter.subscriptions, []);
});

test('a propagated inventory error aborts startup instead of treating cleanup as verified', async t => {
    const adapter = new FakeAdapter({ pollInterval: 0 });
    adapter.getObjectListAsync = async () => { throw new Error('Simulated inventory read failure'); };
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => assert.fail('An inventory error cannot start a client.') });
    t.after(() => runtime.stop());
    await assert.rejects(runtime.start(), error => error.code === 'DATABASE' && /Nachkontrolle.*inventory read failure/u.test(error.message));
    assert.equal(adapter.objects.size, 0);
    assert.deepEqual(adapter.subscriptions, []);
});

test('invalid inventory envelopes, IDs and object records cannot establish successful cleanup', async t => {
    const invalid = [
        undefined, [], { rows: null },
        { rows: [{ id: 'api.Legacy', doc: { type: 'state' } }] },
        { rows: [{ id: 'loewe-tv.1.api.Legacy', doc: { type: 'state' } }] },
        { rows: [{ id: 'loewe-tv.0.info', doc: [] }] },
        { rows: [{ id: 'loewe-tv.0.info', doc: { type: 'channel', _id: 'loewe-tv.0.api' } }] },
    ];
    for (const inventory of invalid) {
        const adapter = new FakeAdapter({ pollInterval: 0 });
        adapter.getObjectListAsync = async () => inventory;
        const runtime = new AdapterRuntime(adapter, { clientFactory: () => assert.fail('Invalid inventory cannot start a client.') });
        t.after(() => runtime.stop());
        await assert.rejects(runtime.start(), error => error.code === 'DATABASE' && /Nachkontrolle/u.test(error.message));
        assert.equal(adapter.objects.size, 0);
        assert.deepEqual(adapter.subscriptions, []);
    }
});

test('inventory verification retains the individual two-second DB deadline', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const adapter = new FakeAdapter({ pollInterval: 0 });
    const entered = deferred();
    adapter.getObjectListAsync = async () => { entered.resolve(); return new Promise(() => {}); };
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => assert.fail('Timed-out inventory cannot start a client.') });
    t.after(() => runtime.stop());
    const rejected = assert.rejects(runtime.start(), error => error.code === 'DATABASE' && /Nachkontrolle.*nicht rechtzeitig/u.test(error.message));
    await entered.promise;
    t.mock.timers.tick(2000);
    await rejected;
    assert.equal(adapter.deletions.length, 5 + RETIRED_STATIC_STATES.length);
    assert.equal(adapter.objects.size, 0);
});

test('unload during inventory verification prevents startup after a late inventory reply', async t => {
    const adapter = new FakeAdapter({ pollInterval: 0 });
    const entered = deferred();
    const release = deferred();
    adapter.getObjectListAsync = async () => { entered.resolve(); return release.promise; };
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => assert.fail('Stopped verification cannot start a client.') });
    t.after(() => runtime.stop());
    const starting = runtime.start();
    await entered.promise;
    try {
        await runtime.stop();
    } finally {
        release.resolve({ rows: [] });
        await starting;
    }
    assert.equal(adapter.deletions.length, 5 + RETIRED_STATIC_STATES.length);
    assert.equal(adapter.objects.size, 0);
    assert.deepEqual(adapter.subscriptions, []);
});

test('recursive upgrade cleanup has a finite 15-second budget and never advances after its deadline', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const adapter = new FakeAdapter({ pollInterval: 0 });
    const entered = deferred();
    adapter.delObjectAsync = async (id, options) => {
        adapter.deletions.push({ id, ...options });
        entered.resolve();
        return new Promise(() => {});
    };
    let clients = 0;
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => { clients++; return new FakeClient(); } });
    t.after(() => runtime.stop());
    const starting = runtime.start();
    let completed = false;
    const rejected = assert.rejects(starting, error => error.code === 'DATABASE'
        && /channels\.radio.*nicht rechtzeitig/u.test(error.message)).then(() => { completed = true; });
    await entered.promise;
    t.mock.timers.tick(14999);
    await Promise.resolve();
    assert.equal(completed, false, 'A normal recursive cleanup may take longer than an individual DB write.');
    t.mock.timers.tick(1);
    await rejected;
    assert.equal(clients, 0);
    assert.equal(adapter.objects.size, 0);
    assert.deepEqual(adapter.deletions, [{ id: 'channels.radio', recursive: true }]);
});

test('unload does not wait for recursive cleanup and a late completion cannot start another deletion or client', async t => {
    const adapter = new FakeAdapter({ pollInterval: 0 });
    const entered = deferred();
    const release = deferred();
    adapter.delObjectAsync = async (id, options) => {
        adapter.deletions.push({ id, ...options });
        entered.resolve();
        await release.promise;
    };
    let clients = 0;
    let restores = 0;
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => { clients++; return new FakeClient(); } });
    runtime.channelObjects.start = () => { restores++; };
    t.after(() => runtime.stop());
    const starting = runtime.start();
    await entered.promise;
    let timer;
    try {
        const stopped = await Promise.race([
            runtime.stop().then(() => true),
            new Promise(resolve => { timer = setTimeout(() => resolve(false), 400); }),
        ]);
        assert.equal(stopped, true, 'Controller unload must not wait for the larger migration deadline.');
    } finally {
        clearTimeout(timer);
        release.resolve();
        await starting;
    }
    assert.equal(clients, 0);
    assert.equal(restores, 0);
    assert.equal(adapter.objects.size, 0);
    assert.deepEqual(adapter.deletions, [{ id: 'channels.radio', recursive: true }]);
    assert.deepEqual(adapter.subscriptions, []);
    assert.equal(adapter.timers.size, 0);
});

test('unload before the deferred cleanup DB call prevents all migration mutations', async () => {
    const adapter = new FakeAdapter({ pollInterval: 0 });
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => {
        assert.fail('A stopped startup cannot create a client.');
    } });
    const starting = runtime.start();
    await runtime.stop();
    await starting;
    assert.deepEqual(adapter.deletions, []);
    assert.equal(adapter.objects.size, 0);
    assert.deepEqual(adapter.subscriptions, []);
});
