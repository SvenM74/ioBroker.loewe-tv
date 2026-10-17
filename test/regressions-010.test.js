'use strict';

// Regressions found while investigating reports of a blocked adapter and a TV
// which cannot be woken. These exercise failure paths omitted in version 0.1.0.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { AdapterRuntime } = require('../lib/adapter-runtime');

// This self-contained fixture is also run in a child process so the test can
// observe an unhandled rejection without poisoning node:test's own process.
function makeHarness(AdapterRuntimeClass, config = {}) {
    const states = new Map();
    const calls = [];
    const logs = [];
    const response = (action, fields = {}) => ({
        xml: `<Envelope><Body><${action}Response/></Body></Envelope>`,
        data: { Envelope: { Body: { [`${action}Response`]: fields } } },
    });
    const adapter = {
        namespace: 'loewe-tv.0',
        config: {
            host: 'fixture.invalid', pollInterval: 30, pollPlayback: false,
            macLan: '02:00:00:00:00:01', ...config,
        },
        states, logs,
        log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, value => logs.push({ level, value })])),
        async extendObjectAsync() {},
        async getStateAsync(id) { return states.get(id) || null; },
        async setStateAsync(id, state) {
            if (adapter.failWrites) throw new Error('Simulated states database write failure');
            states.set(id, { ...state });
        },
        subscribeStates() {},
        async subscribeStatesAsync() {},
        setTimeout(fn, ms) { adapter.timer = { fn, ms }; return adapter.timer; },
        clearTimeout(handle) { if (adapter.timer === handle) adapter.timer = null; },
    };
    const client = {
        calls,
        async getVolume() { calls.push('getVolume'); return 12; },
        async getMute() { calls.push('getMute'); return false; },
        async getDeviceData() {
            calls.push('getDeviceData');
            return response('GetDeviceData', { 'MAC-Address-LAN': '02:00:00:00:00:01' });
        },
        async getSettings() { calls.push('getSettings'); return response('GetSettings'); },
        async getCurrentPlayback() { calls.push('getCurrentPlayback'); return response('GetCurrentPlayback'); },
        async wake() { calls.push('wake'); return { port: 9 }; },
        async key(name) { calls.push(`key:${name}`); return response('InjectRCKey'); },
        close() { client.closed = true; },
    };
    const runtime = new AdapterRuntimeClass(adapter, { clientFactory: () => client });
    return { adapter, client, runtime };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function drainEvents(predicate) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) return true;
        await new Promise(resolve => setImmediate(resolve));
    }
    return predicate();
}

test('powerOn sends Wake-on-LAN while a sleeping TV status request is still waiting', async () => {
    const h = makeHarness(AdapterRuntime);
    await h.runtime.start();
    const waiting = deferred();
    const entered = deferred();
    h.client.getVolume = () => { entered.resolve(); return waiting.promise; };
    const poll = h.runtime.poll();
    await entered.promise;
    const wake = h.runtime.handleStateChange('loewe-tv.0.control.powerOn', { val: true, ack: false });
    try {
        assert.equal(await drainEvents(() => h.client.calls.includes('wake')), true,
            'Wake-on-LAN must not wait behind a SOAP request to a sleeping TV');
    } finally {
        waiting.reject(Object.assign(new Error('Simulated sleeping TV timeout'), { code: 'NETWORK' }));
        await Promise.allSettled([poll, wake]);
        await h.runtime.stop();
    }
});

test('stop finishes before the controller unload deadline even if state writes never settle', async () => {
    const h = makeHarness(AdapterRuntime);
    await h.runtime.start();
    h.adapter.setStateAsync = () => new Promise(() => {});
    let timer;
    try {
        const result = await Promise.race([
            h.runtime.stop().then(() => 'stopped'),
            new Promise(resolve => { timer = setTimeout(() => resolve('blocked'), 400); }),
        ]);
        assert.equal(result, 'stopped',
            'The unload callback must not wait indefinitely for the states database');
        assert.equal(h.client.closed, true);
    } finally {
        clearTimeout(timer);
    }
});

test('a failed scheduled poll never escapes as an unhandled rejection', () => {
    const script = `
        const { AdapterRuntime } = require(${JSON.stringify(require.resolve('../lib/adapter-runtime'))});
        const makeHarness = ${makeHarness.toString()};
        const unhandled = [];
        process.on('unhandledRejection', error => unhandled.push(error.message));
        (async () => {
            const h = makeHarness(AdapterRuntime);
            await h.runtime.start();
            h.adapter.failWrites = true;
            h.adapter.timer.fn();
            setTimeout(() => {
                process.stdout.write(JSON.stringify({ unhandled }));
            }, 80);
        })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
    `;
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 5000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    assert.deepEqual(JSON.parse(child.stdout).unhandled, [],
        'Poll/error-reporting DB errors must have a terminal rejection handler');
});

test('a legacy MAC address is discovered even when GetVolume is unsupported', async () => {
    const h = makeHarness(AdapterRuntime, { macLan: '', macWlan: '' });
    const legacyMac = '02:00:00:00:00:77';
    h.client.getDeviceData = async () => {
        h.client.calls.push('getDeviceData');
        return {
            xml: '<Envelope><Body><GetDeviceDataResponse/></Body></Envelope>',
            data: { Envelope: { Body: { GetDeviceDataResponse: { 'MAC-Address': legacyMac } } } },
        };
    };
    h.client.getVolume = async () => {
        h.client.calls.push('getVolume');
        throw Object.assign(new Error('Unsupported action on this model'), { code: 'SOAP' });
    };
    let wakeArgs;
    h.client.wake = async (...args) => { wakeArgs = args; return { port: 9, targets: ['255.255.255.255'], repeats: 3 }; };
    try {
        await h.runtime.start();
        assert.equal(h.adapter.states.get('device.mac').val, legacyMac);
        assert.equal(h.adapter.states.get('info.wakeReady').val, true);
        assert.ok(h.client.calls.indexOf('getDeviceData') < h.client.calls.indexOf('getVolume'));
        assert.equal(h.adapter.states.get('status.mute').val, false, 'Other supported status queries still run');
        await h.runtime.handleStateChange('loewe-tv.0.control.powerOn', { val: true, ack: false });
        assert.deepEqual(wakeArgs.slice(0, 2), [[legacyMac], '255.255.255.255']);
        assert.equal(wakeArgs[2].repeats, 3);
        assert.equal(wakeArgs[2].autoBroadcast, true);
        assert.ok(wakeArgs[2].signal instanceof AbortSignal);
        assert.equal(JSON.parse(h.adapter.states.get('info.lastWakeOnLan').val).repeats, 3);
    } finally {
        await h.runtime.stop();
    }
});

test('pollInterval zero starts without TV queries and still permits wake and explicit refresh', async () => {
    const h = makeHarness(AdapterRuntime, { pollInterval: 0 });
    try {
        await h.runtime.start();
        assert.deepEqual(h.client.calls, []);
        assert.equal(h.adapter.timer, undefined);
        assert.equal(h.adapter.states.get('info.wakeReady').val, true);
        await h.runtime.handleStateChange('loewe-tv.0.control.powerOn', { val: true, ack: false });
        assert.deepEqual(h.client.calls, ['wake', 'key:power_on']);
        assert.equal(h.adapter.states.get('info.connection').val, true, 'A SOAP reply confirms reachability, not a visible picture');
        assert.equal(JSON.parse(h.adapter.states.get('info.powerOn').val).phase, 'powerKeySent');
        await h.runtime.handleStateChange('loewe-tv.0.control.refresh', { val: true, ack: false });
        assert.ok(h.client.calls.includes('getDeviceData'));
        assert.ok(h.client.calls.includes('getVolume'));
        assert.equal(h.adapter.timer, undefined);
    } finally {
        await h.runtime.stop();
    }
});

test('wake without a known MAC gives a useful error without sending a datagram', async () => {
    const h = makeHarness(AdapterRuntime, { pollInterval: 0, macLan: '', macWlan: '' });
    try {
        await h.runtime.start();
        assert.equal(h.adapter.states.get('info.wakeReady').val, false);
        await h.runtime.handleStateChange('loewe-tv.0.control.powerOn', { val: true, ack: false });
        assert.deepEqual(h.client.calls, []);
        assert.match(h.adapter.states.get('info.lastError').val, /Keine TV-MAC-Adresse/);
        assert.equal(h.adapter.states.get('control.powerOn').val, false);
    } finally {
        await h.runtime.stop();
    }
});

test('stopping immediately after powerOn prevents delayed WOL diagnostic writes', async () => {
    const h = makeHarness(AdapterRuntime, { pollInterval: 0 });
    await h.runtime.start();
    const lateWrites = [];
    const originalWrite = h.adapter.setStateAsync;
    h.adapter.setStateAsync = async (id, state) => {
        const finalStatus = state.val === false && ['info.connection', 'info.commandPending'].includes(id);
        if (h.runtime.stopping && !finalStatus) lateWrites.push({ id, ...state });
        return originalWrite(id, state);
    };
    // Wake starts its transport immediately; its diagnostic writes are queued
    // in microtasks. Unload may begin before those microtasks reach the DB.
    const sending = h.runtime.handleStateChange('loewe-tv.0.control.powerOn', { val: true, ack: false });
    const stopping = h.runtime.stop();
    await Promise.allSettled([sending, stopping]);
    assert.deepEqual(h.client.calls, ['wake']);
    assert.deepEqual(lateWrites, [], 'Only final false connection/pending states may begin after stop');
    assert.equal(h.adapter.states.get('info.connection').val, false);
    assert.equal(h.adapter.states.get('info.commandPending').val, false);
    assert.equal(h.adapter.states.get('info.lastCommand').val, '', 'Skipped writes do not publish command metadata');
});

test('a rejected state subscription is awaited and never escapes as an unhandled rejection', () => {
    const script = `
        const { AdapterRuntime } = require(${JSON.stringify(require.resolve('../lib/adapter-runtime'))});
        const makeHarness = ${makeHarness.toString()};
        const unhandled = [];
        process.on('unhandledRejection', error => unhandled.push(error.message));
        (async () => {
            const results = [];
            for (const method of ['subscribeStatesAsync', 'subscribeStates']) {
                const h = makeHarness(AdapterRuntime, { pollInterval: 0 });
                const rejectSubscription = async () => { throw new Error('Simulated subscription failure'); };
                h.adapter.subscribeStates = rejectSubscription;
                if (method === 'subscribeStatesAsync') h.adapter.subscribeStatesAsync = rejectSubscription;
                else delete h.adapter.subscribeStatesAsync;
                let startError = null;
                try { await h.runtime.start(); }
                catch (error) { startError = error.message; }
                results.push({ method, startError, clientCreated: h.runtime.client !== null });
                await h.runtime.stop();
            }
            setTimeout(() => {
                process.stdout.write(JSON.stringify({ unhandled, results }));
            }, 80);
        })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
    `;
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 5000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const result = JSON.parse(child.stdout);
    assert.deepEqual(result.unhandled, []);
    assert.equal(result.results.length, 2);
    for (const outcome of result.results) {
        assert.equal(outcome.startError, 'Simulated subscription failure', outcome.method);
        assert.equal(outcome.clientCreated, false, 'No TV client may start without a working state subscription');
    }
});
