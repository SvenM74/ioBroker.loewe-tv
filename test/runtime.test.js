'use strict';

// These tests exercise ioBroker command semantics with a simulated TV. They
// deliberately do not require js-controller, a network, or an actual Loewe TV.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AdapterRuntime } = require('../lib/adapter-runtime');
const { runPowerOn } = require('../lib/power-on');

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

    getChannelLists(start = 0, count = 100) {
        return this.invoke('getChannelLists', [start, count], response('GetListOfChannelLists', {
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
            pollPlayback: true,
            maxVolume: 99,
            macLan: '',
            macWlan: '',
            broadcastAddress: '255.255.255.255',
            enableAdvanced: false,
            ...config,
        };
        this.objects = new Map();
        this.states = new Map();
        this.writes = [];
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

async function harness(t, config = {}, prepare = () => {}) {
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
    assert.equal(h.adapter.states.get('status.volumeRaw').val, 140000);
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

test('channel parameters are staged and used only when the query button is pressed', async t => {
    const h = await harness(t);
    const baseline = h.client.calls.length;
    await write(h, 'channels.view', 'fixture-list');
    await write(h, 'channels.start', 100);
    await write(h, 'channels.count', 25);
    assert.equal(h.client.calls.length, baseline);
    assert.equal(h.adapter.states.get('channels.view').ack, true);
    await write(h, 'channels.getChannels', true);
    assert.deepEqual(calls(h.client, 'getChannels').map(call => call.args), [
        ['fixture-list', 100, 25, ''],
    ]);
    assert.equal(h.adapter.states.get('channels.getChannels').val, false);
    assert.equal(h.adapter.states.get('channels.getChannels').ack, true);
    assert.doesNotThrow(() => JSON.parse(h.adapter.states.get('channels.items').val));
});

for (const savedView of [undefined, '   ']) {
    test(`channel discovery resolves an empty ${savedView === undefined ? 'new' : 'upgraded'} selection`, async t => {
        const h = await harness(t, { pollInterval: 0 }, adapter => {
            if (savedView !== undefined) adapter.states.set('channels.view', { val: savedView, ack: true });
        });
        await write(h, 'channels.getChannels', true);
        assert.deepEqual(calls(h.client, 'getChannelLists').map(call => call.args), [[0, 100]]);
        assert.deepEqual(calls(h.client, 'getChannels').map(call => call.args), [['fastscan-fixture', 0, 100, '']]);
        assert.equal(h.adapter.states.get('channels.view').val, 'fastscan-fixture');
        const [entry] = JSON.parse(h.adapter.states.get('channels.entries').val);
        assert.equal(entry.name, 'Fixture TV');
        assert.equal(entry.caption, '001');
        assert.equal(entry.locator, 'channel://001:ch-fixture-service-1:sl-fixture');
        assert.equal(h.adapter.states.get('channels.totalNumber').val, 1);
        assert.equal(h.adapter.states.get('channels.nextStart').val, -1);
        assert.equal(h.adapter.states.get('channels.lastError').val, '');
    });
}

test('named channel buttons use registered targets and track the real pending reset write', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.getChannels', true);
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

test('list discovery uses its own offset and preserves an explicit favorite selection', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.view', ' favlist-personal ');
    await write(h, 'channels.start', 100);
    await write(h, 'channels.count', 25);
    await write(h, 'channels.getLists', true);
    assert.deepEqual(calls(h.client, 'getChannelLists').at(-1).args, [0, 25]);
    assert.equal(h.adapter.states.get('channels.view').val, 'favlist-personal');
    await write(h, 'channels.listStart', 2);
    await write(h, 'channels.getLists', true);
    assert.deepEqual(calls(h.client, 'getChannelLists').at(-1).args, [2, 25]);
    await write(h, 'channels.mediaType', 'audio');
    await write(h, 'channels.getChannels', true);
    assert.deepEqual(calls(h.client, 'getChannels').at(-1).args, ['favlist-personal', 100, 25, 'audio']);
});

test('TV list synchronization remains visible without sending a fabricated channel view', async t => {
    const h = await harness(t, { pollInterval: 0 }, (_adapter, client) => {
        client.hooks.getChannelLists = () => response('GetListOfChannelLists', { Result: 'SYNC' });
    });
    await write(h, 'channels.getChannels', true);
    assert.equal(calls(h.client, 'getChannels').length, 0);
    assert.match(h.adapter.states.get('channels.lastError').val, /TV_SYNC.*synchronisiert/);
    assert.equal(JSON.parse(h.adapter.states.get('channels.lists').val).Envelope.Body.GetListOfChannelListsResponse.Result, 'SYNC');
    assert.equal(h.adapter.states.get('channels.lastUpdate').val, 0);
});

test('a malformed channel reply retains raw evidence and the last successful channel page', async t => {
    const h = await harness(t, { pollInterval: 0 });
    await write(h, 'channels.getChannels', true);
    const entries = h.adapter.states.get('channels.entries').val;
    const lastUpdate = h.adapter.states.get('channels.lastUpdate').val;
    h.client.hooks.getChannels = () => response('GetChannelList', { UnexpectedShape: 'fixture' });
    await write(h, 'channels.getChannels', true);
    assert.match(h.adapter.states.get('channels.lastError').val, /INVALID_RESPONSE/);
    assert.equal(h.adapter.states.get('channels.entries').val, entries);
    assert.equal(h.adapter.states.get('channels.lastUpdate').val, lastUpdate);
    assert.equal(JSON.parse(h.adapter.states.get('channels.items').val).Envelope.Body.GetChannelListResponse.UnexpectedShape, 'fixture');
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

test('disabled advanced controls cannot be dispatched through manually written states', async t => {
    const h = await harness(t, { enableAdvanced: false });
    const baseline = h.client.calls.length;
    await write(h, 'api.SetVolume.parametersXml', '<Value>120000</Value>');
    await write(h, 'api.SetVolume.send', true);
    assert.equal(h.client.calls.length, baseline);
});

test('advanced XML parameters do not execute until the matching action button is pressed', async t => {
    const h = await harness(t, { enableAdvanced: true });
    const baseline = h.client.calls.length;
    const parameters = '<Value>120000</Value>';
    await write(h, 'api.SetVolume.parametersXml', parameters);
    assert.equal(h.client.calls.length, baseline);
    await write(h, 'api.SetVolume.send', true);
    assert.deepEqual(calls(h.client, 'request').map(call => call.args), [
        ['SetVolume', parameters],
    ]);
    assert.equal(h.adapter.states.get('api.SetVolume.send').val, false);
    assert.equal(h.adapter.states.get('api.SetVolume.send').ack, true);
    assert.doesNotThrow(() => JSON.parse(h.adapter.states.get('api.SetVolume.responseJson').val));
    await h.runtime.handleStateChange('loewe-tv.0.api.SetVolume.send', { val: true, ack: true });
    assert.equal(calls(h.client, 'request').length, 1);
});

test('a queued action keeps the parameters that existed at the send event', async t => {
    const h = await harness(t, { enableAdvanced: true });
    const gate = deferred();
    const getState = h.adapter.getStateAsync.bind(h.adapter);
    h.adapter.getStateAsync = async id => {
        if (h.adapter.localId(id) === 'api.GetTimerList.parametersXml') {
            await gate.promise;
        }
        return getState(id);
    };
    const operation = write(h, 'api.GetTimerList.send', true);
    await new Promise(resolve => setImmediate(resolve));
    // This later edit must not affect the preceding send event, including when
    // that event used the initial empty default and a database read is delayed.
    await write(h, 'api.GetTimerList.parametersXml', '<LaterEdit>new</LaterEdit>');
    gate.resolve();
    await operation;
    assert.deepEqual(calls(h.client, 'request').map(call => call.args), [
        ['GetTimerList', ''],
    ]);
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
        if (h.adapter.localId(id) === 'info.lastResponse' && pauseResponse) {
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
