'use strict';

// Run the runtime, serial queue, SOAP client and parser against a simulated
// transport. These tests never open sockets or address a real television.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { AdapterRuntime, normalizeConfig } = require('../lib/adapter-runtime');
const { LoeweClient, KEYS } = require('../lib/loewe-client');
const { runPowerOn } = require('../lib/power-on');
const { REMOTE_KEYS: UI_REMOTE_KEYS } = require('../admin/epg-remote');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function waitUntil(predicate, message = 'Expected asynchronous operation did not start') {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await nextTurn();
    }
    assert.ok(predicate(), message);
}

function soap(action, inner = '') {
    return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        + 'xmlns:m="urn:loewe.de:RemoteTV:Tablet"><s:Body>'
        + `<m:${action}Response>${inner}</m:${action}Response></s:Body></s:Envelope>`;
}

function wire({ autoAccess = true, autoKey = true, onKey } = {}) {
    const calls = [];
    return {
        calls,
        request(options, onResponse) {
            const request = new EventEmitter();
            const action = options.headers.SOAPAction.split('#')[1].replace(/"$/u, '');
            const call = { action, options, request };
            call.reply = (xml = soap(action, action === 'RequestAccess' ? '<m:ClientId>remote-fixture</m:ClientId>' : ''), status = 200) => {
                queueMicrotask(() => {
                    if (request.destroyed) return;
                    const response = new EventEmitter();
                    response.statusCode = status;
                    response.headers = {};
                    response.destroy = () => { response.destroyed = true; };
                    onResponse(response);
                    response.emit('data', Buffer.from(xml));
                    response.emit('end');
                });
            };
            request.destroy = () => { request.destroyed = true; };
            request.end = body => {
                call.body = Buffer.from(body).toString('utf8');
                calls.push(call);
                if (action === 'RequestAccess' && autoAccess) call.reply();
                if (action === 'InjectRCKey') {
                    if (onKey) onKey(call);
                    else if (autoKey) call.reply();
                }
            };
            return request;
        },
    };
}

function harness({ namespace = 'loewe-tv.0', transport = wire(), config = {}, powerOnSequence = runPowerOn } = {}) {
    const states = new Map();
    const writes = [];
    const logs = [];
    const adapter = {
        namespace,
        config: { host: 'remote-fixture.invalid', pollInterval: 0, channelRefreshInterval: 0,
            channelListView: '', epgEnabled: false, epgRefreshInterval: 0, ...config },
        log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, message => logs.push({ level, message })])),
        async setStateAsync(id, state) {
            writes.push({ id, ...state });
            states.set(id, structuredClone(state));
        },
        async getStateAsync(id) { return states.get(id) || null; },
    };
    const client = new LoeweClient({ host: adapter.config.host, timeout: 30000 }, transport);
    const runtime = new AdapterRuntime(adapter, { powerOnSequence,
        clientFactory: () => { throw new Error('Remote commands must reuse the running client'); } });
    // Runtime admission is isolated from migration/startup. EPG, recording and
    // channel workers are deliberately not started and no catalogue is loaded.
    runtime.config = normalizeConfig(adapter.config);
    runtime.client = client;
    runtime._started = true;
    return { runtime, adapter, client, states, writes, logs, transport,
        send: key => runtime.handleMessage('sendRemoteCommand', { key }),
        status: () => runtime.handleMessage('getRemoteStatus', {}) };
}

test('remote commands accept only an exact allowed key payload before touching the TV', async t => {
    const h = harness();
    t.after(() => h.runtime.stop());
    for (const payload of [
        null, false, 'ok', [], {}, { key: 38 }, { key: '' }, { key: 'OK' }, { key: ' ok' },
        { key: 'power_all_code' }, { key: 'epg_alt' }, { key: 'radio_mode_on' },
        { key: 'star' }, { key: 'input' }, { key: 'InjectRCKey' }, { key: 'constructor' },
        { key: 'ok', host: 'other.invalid' }, { key: 'ok', instance: 'loewe-tv.1' },
        { key: 'ok', deadline: Date.now() + 60000 }, { key: 'ok', confirmed: true },
        { key: 'ok', [Symbol('hidden')]: true }, Object.create({ key: 'ok' }),
    ]) {
        await assert.rejects(h.runtime.handleMessage('sendRemoteCommand', payload), { code: 'REMOTE_VALIDATION', delivery: 'notSent' });
    }
    assert.deepEqual(h.transport.calls, []);
    assert.equal(h.runtime._pendingCount, 0);
});

test('runtime startup, absent configuration and shutdown report distinct unsent failures', async t => {
    const h = harness();
    t.after(async () => { h.runtime.client = h.client; await h.runtime.stop(); h.client.close(); });
    h.runtime.client = null;
    await assert.rejects(h.send('ok'), { code: 'REMOTE_UNAVAILABLE', delivery: 'notSent' });
    h.runtime.config = null;
    await assert.rejects(h.send('ok'), { code: 'REMOTE_UNAVAILABLE', delivery: 'notSent' });
    assert.equal((await h.status()).connected, false, 'Cached status remains readable during startup');
    h.runtime.config = normalizeConfig({ ...h.adapter.config, host: '' });
    await assert.rejects(h.send('ok'), { code: 'VALIDATION', delivery: 'notSent' });
    await h.runtime.stop();
    await assert.rejects(h.send('ok'), { code: 'CLOSED', delivery: 'notSent' });
    assert.equal(h.transport.calls.length, 0);
});

test('every normal UI key uses the existing authenticated client once without EPG or follow-up TV reads', async t => {
    const h = harness();
    t.after(() => h.runtime.stop());
    // Independent protocol oracles for representative/ambiguous keys remain
    // explicit. Iterating the actual UI contract additionally catches drift
    // between rendered buttons and the backend's separate safety allowlist.
    const oracles = new Map([
        ['ok', 'l2700', 38], ['volume_up', 'l2700', 21], ['mute', 'l2700', 13],
        ['back_step', 'l2700', 65], ['dr_archive', 'l2700', 92],
        ['record', 'l2700-hdr', 55], ['digit_7', 'l2700', 7],
    ].map(([key, alphabet, value]) => [key, { alphabet, value }]));
    const normalKeys = UI_REMOTE_KEYS.filter(key => !['power_on', 'power_off'].includes(key));
    assert.equal(UI_REMOTE_KEYS.length, 41);
    for (const key of oracles.keys()) assert.ok(normalKeys.includes(key));
    for (const key of normalKeys) {
        const response = await h.send(key);
        assert.equal(response.ok, true);
        assert.equal(response.key, key);
        assert.equal(response.status, 'sent');
        assert.equal(response.instance, 'loewe-tv.0');
        const command = h.transport.calls.at(-1);
        const { alphabet, value } = oracles.get(key) || KEYS[key];
        assert.equal(command.action, 'InjectRCKey');
        assert.ok(command.body.includes(`<RCKeyEvent alphabet="${alphabet}" mode="press" value="${value}"/>`));
        assert.ok(command.body.includes(`<RCKeyEvent alphabet="${alphabet}" mode="release" value="${value}"/>`));
    }
    await h.runtime._tail;
    assert.equal(h.transport.calls.filter(call => call.action === 'RequestAccess').length, 1);
    assert.equal(h.transport.calls.filter(call => call.action === 'InjectRCKey').length, normalKeys.length);
    assert.equal(h.transport.calls.length, normalKeys.length + 1, 'Volume/mute keys must not require secondary status reads');
    assert.equal(h.runtime.epg.started, false);
    assert.equal(h.runtime.config.channelListView, '');
    assert.equal(h.runtime.config.epgEnabled, false);
    assert.equal(h.runtime.client, h.client);
});

test('a valid TV reply is acknowledged without waiting for later database diagnostics', async t => {
    const h = harness({ transport: wire({ autoKey: false }) });
    const diagnostic = deferred();
    t.after(async () => { diagnostic.resolve(); await h.runtime.stop(); });
    const originalWrite = h.adapter.setStateAsync.bind(h.adapter);
    h.adapter.setStateAsync = (id, state) => id === 'info.lastSeen' ? diagnostic.promise : originalWrite(id, state);
    let settled = false;
    const sending = h.send('volume_down').then(response => { settled = true; return response; });
    await waitUntil(() => h.transport.calls.length === 2);
    assert.equal(settled, false, 'Queue admission is not a successful TV response');
    h.transport.calls[1].reply();
    assert.equal((await sending).status, 'sent');
    assert.equal(h.runtime._pendingCount, 1, 'The queue still owns its diagnostic cleanup');
    assert.equal(h.transport.calls.length, 2);
    diagnostic.resolve();
    await h.runtime._tail;
});

test('remote commands share the existing queue and remain bound to their own runtime instance', async t => {
    const h0 = harness();
    const h1 = harness({ namespace: 'loewe-tv.1' });
    const gate = deferred();
    t.after(async () => { gate.resolve(); await Promise.all([h0.runtime.stop(), h1.runtime.stop()]); });
    const block = h0.runtime._enqueue('existing.state.command', () => gate.promise);
    const pending = h0.send('up');
    await waitUntil(() => h0.runtime._pendingCount === 2);
    assert.equal(h0.transport.calls.length, 0);
    assert.equal((await h1.send('down')).instance, 'loewe-tv.1');
    gate.resolve();
    await block;
    assert.equal((await pending).instance, 'loewe-tv.0');
    assert.equal(h0.transport.calls.filter(call => call.action === 'InjectRCKey').length, 1);
    assert.equal(h1.transport.calls.filter(call => call.action === 'InjectRCKey').length, 1);
});

test('queue failure before the key keeps its original error and never becomes success', async t => {
    const h = harness();
    t.after(() => h.runtime.stop());
    const write = h.adapter.setStateAsync.bind(h.adapter);
    h.adapter.setStateAsync = (id, state) => id === 'info.lastCommand'
        ? Promise.reject(Object.assign(new Error('database unavailable'), { code: 'DATABASE' })) : write(id, state);
    await assert.rejects(h.send('ok'), { code: 'DATABASE', delivery: 'notSent' });
    assert.equal(h.transport.calls.length, 0);
    assert.equal(await h.runtime._enqueue('legacy.failure', () => { throw new Error('legacy failure'); }), false,
        'Existing state callers retain the false-on-error queue contract');
});

test('full queues reject remote admission without a TV command', async t => {
    const h = harness();
    const gate = deferred();
    t.after(async () => { gate.resolve(); await h.runtime.stop(); });
    const queued = Array.from({ length: 20 }, (_, index) => h.runtime._enqueue(`existing.${index}`, () => gate.promise));
    await assert.rejects(h.send('ok'), { code: 'REMOTE_BUSY', delivery: 'notSent' });
    assert.equal(h.transport.calls.length, 0);
    gate.resolve();
    await Promise.all(queued);
    assert.equal(h.runtime._pendingCount, 0);
});

test('the eight-second deadline includes queue wait and expired keys cannot send later', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1800000000000 });
    const h = harness();
    h.runtime._connected = true;
    const gate = deferred();
    t.after(async () => { gate.resolve(); await h.runtime.stop(); });
    let entered = false;
    const block = h.runtime._enqueue('existing.block', () => { entered = true; return gate.promise; });
    await waitUntil(() => entered);
    const failure = assert.rejects(h.send('ok'), { code: 'REMOTE_TIMEOUT', delivery: 'notSent' });
    t.mock.timers.tick(8000);
    await failure;
    gate.resolve();
    await block;
    await h.runtime._tail;
    assert.equal(h.transport.calls.length, 0);
    assert.equal(h.runtime._remoteAbort.size, 0);
    assert.equal(h.runtime._connected, true, 'Queue expiry does not prove the television is offline');
});

test('the same deadline covers RequestAccess and forbids a key after late authentication', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1800000000000 });
    const h = harness({ transport: wire({ autoAccess: false }) });
    t.after(() => h.runtime.stop());
    const failure = assert.rejects(h.send('ok'), { code: 'REMOTE_TIMEOUT', delivery: 'unknown' });
    await waitUntil(() => h.transport.calls.length === 1);
    assert.equal(h.transport.calls[0].action, 'RequestAccess');
    t.mock.timers.tick(8000);
    await failure;
    h.transport.calls[0].reply();
    await h.runtime._tail;
    assert.equal(h.transport.calls.filter(call => call.action === 'InjectRCKey').length, 0);
});

test('a lost key reply times out once, aborts transport and is never retried', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1800000000000 });
    const h = harness({ transport: wire({ autoKey: false }) });
    t.after(() => h.runtime.stop());
    h.runtime._connected = true;
    const failure = assert.rejects(h.send('record'), { code: 'REMOTE_TIMEOUT', delivery: 'unknown' });
    await waitUntil(() => h.transport.calls.length === 2);
    t.mock.timers.tick(8000);
    await failure;
    const key = h.transport.calls[1];
    assert.equal(key.request.destroyed, true);
    key.reply();
    await h.runtime._tail;
    assert.equal(h.transport.calls.length, 2);
    assert.equal(h.runtime._remoteAbort.size, 0);
    assert.equal(h.runtime._connected, false);
    assert.match(h.states.get('info.lastError').val, /^NETWORK:.*Zeitlimit/u);
});

test('transport, session, SOAP and malformed-response failures retain their codes without retry', async t => {
    for (const [expectedCode, onKey] of [
        ['NETWORK', call => queueMicrotask(() => call.request.emit('error', Object.assign(new Error('lost reply'), { code: 'ECONNRESET' })))],
        ['HTTP', call => call.reply('unauthorized', 401)],
        ['SOAP', call => call.reply('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>Server</faultcode><faultstring>Command rejected</faultstring></s:Fault></s:Body></s:Envelope>', 500)],
        ['INVALID_RESPONSE', call => call.reply('<broken')],
    ]) {
        await t.test(expectedCode, async () => {
            const h = harness({ transport: wire({ onKey }) });
            try {
                await assert.rejects(h.send('ok'), { code: expectedCode, delivery: 'unknown' });
                await h.runtime._tail;
                assert.equal(h.transport.calls.filter(call => call.action === 'InjectRCKey').length, 1);
                assert.equal(h.transport.calls.filter(call => call.action === 'RequestAccess').length, 1);
            } finally { await h.runtime.stop(); }
        });
    }
});

test('unload rejects queued and active keys and blocks later transport writes', async t => {
    for (const queued of [true, false]) {
        await t.test(queued ? 'queued' : 'in flight', async () => {
            const h = harness({ transport: wire({ autoKey: false }) });
            const gate = deferred();
            const block = queued ? h.runtime._enqueue('existing.block', () => gate.promise) : null;
            const rejection = assert.rejects(h.send('ok'), { code: 'CLOSED', delivery: queued ? 'notSent' : 'unknown' });
            if (!queued) await waitUntil(() => h.transport.calls.length === 2);
            await h.runtime.stop();
            await rejection;
            gate.resolve();
            await block;
            await h.runtime._tail;
            assert.equal(h.transport.calls.length, queued ? 0 : 2);
            assert.equal(h.runtime._remoteAbort.size, 0);
        });
    }
});

test('power on promptly reports workflow start/already-running, with no inferred TV power', async t => {
    const sequence = deferred();
    let starts = 0;
    let progress;
    const h = harness({ config: { macLan: '02:00:00:00:00:01' }, powerOnSequence: options => {
        starts++;
        progress = options.onProgress;
        void options.onProgress('waiting', { attempts: 0 });
        return sequence.promise;
    } });
    t.after(async () => { sequence.resolve(); await h.runtime.stop(); });
    const response = await h.send('power_on');
    assert.equal(response.status, 'started');
    assert.equal(response.key, 'power_on');
    assert.equal((await h.send('power_on')).status, 'alreadyRunning');
    assert.equal(starts, 1);
    assert.equal(h.transport.calls.length, 0);
    const status = await h.status();
    assert.equal(status.connected, false);
    assert.equal(status.commandPending, true);
    assert.equal(status.powerOn.active, true);
    assert.equal(status.powerOn.phase, 'waiting');
    assert.equal(status.powerOn.error, null);
    assert.ok(Number.isSafeInteger(status.powerOn.startedAt));
    await progress('failed', { error: { code: 'NETWORK', message: 'The TV did not become reachable' } });
    assert.deepEqual((await h.status()).powerOn.error, { code: 'NETWORK', message: 'The TV did not become reachable' });
    sequence.resolve();
    await h.runtime._wakePromise;
});

test('power on rejects missing or invalid MACs before claiming a workflow start', async t => {
    let starts = 0;
    const h = harness({ powerOnSequence: () => { starts++; return Promise.resolve(); } });
    t.after(() => h.runtime.stop());
    await assert.rejects(h.send('power_on'), { code: 'REMOTE_VALIDATION', delivery: 'notSent' });
    h.runtime._lastValues.set('device.mac', 'broken mac');
    await assert.rejects(h.send('power_on'), { code: 'VALIDATION', delivery: 'notSent' });
    assert.equal(starts, 0);
    assert.equal(h.transport.calls.length, 0);
});

test('a synchronous wake startup failure is not a successful started response', async t => {
    const h = harness({ config: { macLan: '02:00:00:00:00:01' }, powerOnSequence: () => {
        throw Object.assign(new Error('Cannot start wake transport'), { code: 'NETWORK' });
    } });
    t.after(() => h.runtime.stop());
    await assert.rejects(h.send('power_on'), { code: 'NETWORK', delivery: 'notSent' });
    await h.runtime._wakePromise;
    assert.equal((await h.status()).powerOn.phase, 'failed');
    assert.equal(h.transport.calls.length, 0);
});

test('explicit power off aborts an authenticating wake and sends only documented TV_OFF 25', async t => {
    const h = harness({ config: { macLan: '02:00:00:00:00:01' }, transport: wire({ autoAccess: false }),
        powerOnSequence: options => runPowerOn({ ...options, firstKeyDelayMs: 0 }) });
    let wakePackets = 0;
    h.client.wake = async () => { wakePackets++; return { sent: true }; };
    t.after(() => h.runtime.stop());
    assert.equal((await h.send('power_on')).status, 'started');
    const waking = h.runtime._wakePromise;
    await waitUntil(() => h.transport.calls.length === 1);
    assert.equal(h.transport.calls[0].action, 'RequestAccess');
    const off = h.send('power_off');
    assert.equal(h.runtime._wakeAbort.signal.aborted, true);
    await assert.rejects(h.send('power_on'), { code: 'REMOTE_BUSY', delivery: 'notSent' });
    h.transport.calls[0].reply();
    const response = await off;
    assert.equal(response.status, 'sent');
    assert.equal(response.key, 'power_off');
    await waking;
    const keys = h.transport.calls.filter(call => call.action === 'InjectRCKey');
    assert.equal(keys.length, 1, 'No delayed TV_ON may follow cancellation during authentication');
    assert.match(keys[0].body, /mode="press" value="25"/u);
    assert.doesNotMatch(keys[0].body, /value="(?:12|22)"/u);
    assert.equal(wakePackets, 1);
    assert.equal((await h.status()).powerOn.phase, 'cancelled');
});

test('remote status is a narrow cache projection and performs no database or TV requests', async t => {
    const h = harness({ namespace: 'loewe-tv.1' });
    t.after(() => h.runtime.stop());
    h.adapter.getStateAsync = () => { throw new Error('Status must not read the database'); };
    assert.deepEqual(await h.status(), { ok: true, instance: 'loewe-tv.1', connected: false, commandPending: false, powerOn: null });
    h.runtime._lastValues.set('info.powerOn', JSON.stringify({
        phase: 'failed', startedAt: 1234, updatedAt: 2345,
        error: { code: 'TIMEOUT', message: 'wake timed out', httpStatus: 503 },
        macs: ['not-for-ui'], broadcast: 'not-for-ui', rawResponse: 'not-for-ui',
    }));
    assert.deepEqual((await h.status()).powerOn, { active: false, phase: 'failed', startedAt: 1234, updatedAt: 2345,
        error: { code: 'TIMEOUT', message: 'wake timed out' } });
    h.runtime._lastValues.set('info.powerOn', JSON.stringify({ phase: 'bad-phase', startedAt: '1234', updatedAt: -1 }));
    assert.deepEqual((await h.status()).powerOn, { active: false, phase: 'unknown', startedAt: null, updatedAt: null, error: null });
    for (const payload of [null, [], { host: 'other.invalid' }, { instance: 'loewe-tv.0' }, { refresh: true }]) {
        await assert.rejects(h.runtime.handleMessage('getRemoteStatus', payload), { code: 'REMOTE_VALIDATION', delivery: 'notSent' });
    }
    assert.equal(h.transport.calls.length, 0);
    assert.equal(h.writes.length, 0);
});

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function messageHarness() {
    const replies = [];
    const timers = new Map();
    class FakeAdapter extends EventEmitter {
        constructor() {
            super();
            this.namespace = 'loewe-tv.1';
            this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, () => {}]));
        }
        sendTo(from, command, message, callback) { replies.push({ from, command, message, callback }); }
    }
    const module = { exports: {} };
    vm.runInNewContext(mainSource, {
        module, Buffer,
        require: name => {
            if (name === '@iobroker/adapter-core') return { Adapter: FakeAdapter };
            if (name === './lib/adapter-runtime') return { AdapterRuntime: class {} };
            throw new Error(`Unexpected import: ${name}`);
        },
        setTimeout(callback, ms) {
            const handle = { unref() {} };
            timers.set(handle, { callback, ms });
            return handle;
        },
        clearTimeout(handle) { timers.delete(handle); },
    }, { filename: 'main.js' });
    return { adapter: module.exports(), replies, timers };
}

function request(command = 'sendRemoteCommand', message = { key: 'ok' }) {
    return { command, message, from: 'system.adapter.web.0', callback: { id: 77, ack: false, time: 1 } };
}

test('main forwards both remote commands once with the exact payload and original reply route', async () => {
    for (const [command, payload, response] of [
        ['sendRemoteCommand', { key: 'ok' }, { ok: true, key: 'ok', status: 'sent', instance: 'loewe-tv.1', message: 'TV replied' }],
        ['sendRemoteCommand', { key: 'power_on' }, { ok: true, key: 'power_on', status: 'started', instance: 'loewe-tv.1', message: 'Wake started' }],
        ['getRemoteStatus', {}, { ok: true, instance: 'loewe-tv.1', connected: false, commandPending: false, powerOn: null }],
    ]) {
        const h = messageHarness();
        let calls = 0;
        const input = request(command, Object.freeze(payload));
        h.adapter.runtime = { handleMessage: async (receivedCommand, receivedPayload) => {
            calls++;
            assert.equal(receivedCommand, command);
            assert.equal(receivedPayload, input.message);
            return response;
        } };
        await h.adapter.onMessage(input);
        assert.equal(calls, 1);
        assert.deepEqual(h.replies, [{ from: input.from, command, message: response, callback: input.callback }]);
        assert.equal(h.timers.size, 0);
    }
});

test('main preserves remote failure codes/delivery and rejects misleading response shapes', async () => {
    const startup = messageHarness();
    await startup.adapter.onMessage(request());
    assert.equal(startup.replies[0].message.ok, false);
    assert.equal(startup.replies[0].message.code, 'REMOTE_UNAVAILABLE');
    assert.equal(startup.replies[0].message.delivery, 'notSent');
    for (const delivery of ['notSent', 'unknown']) {
        const h = messageHarness();
        h.adapter.runtime = { handleMessage: async () => { throw Object.assign(new Error('remote failed'), { code: 'SOAP', delivery }); } };
        await h.adapter.onMessage(request());
        assert.deepEqual(JSON.parse(JSON.stringify(h.replies[0].message)), { ok: false, code: 'SOAP', error: 'remote failed', delivery });
    }
    for (const response of [
        undefined, false, [], {},
        { ok: true, key: 'ok', status: 'sent', instance: 'loewe-tv.0', message: 'wrong instance' },
        { ok: true, key: 'down', status: 'sent', instance: 'loewe-tv.1', message: 'wrong key' },
        { ok: true, key: 'ok', status: 'started', instance: 'loewe-tv.1', message: 'not a wake key' },
    ]) {
        const h = messageHarness();
        h.adapter.runtime = { handleMessage: async () => response };
        await h.adapter.onMessage(request());
        assert.equal(h.replies[0].message.ok, false);
        assert.equal(h.replies[0].message.code, 'REMOTE_INVALID_RESPONSE');
        assert.equal(h.replies[0].message.delivery, 'unknown');
    }
});

test('main watchdog and lost caller connection never cause a second reply or TV dispatch', async () => {
    const h = messageHarness();
    const late = deferred();
    let calls = 0;
    h.adapter.runtime = { handleMessage: () => { calls++; return late.promise; } };
    const pending = h.adapter.onMessage(request());
    const timer = [...h.timers.values()][0];
    assert.equal(timer.ms, 10000, 'The outer watchdog must allow the runtime eight-second deadline to finish first');
    timer.callback();
    assert.equal(h.replies[0].message.code, 'REMOTE_TIMEOUT');
    assert.equal(h.replies[0].message.delivery, 'unknown');
    late.resolve({ ok: true, key: 'ok', status: 'sent', instance: 'loewe-tv.1', message: 'late reply' });
    await pending;
    assert.equal(h.replies.length, 1);
    assert.equal(calls, 1);

    let deliveries = 0;
    h.adapter.sendTo = () => { deliveries++; throw new Error('Caller disconnected'); };
    await h.adapter.onMessage(request());
    assert.equal(deliveries, 1);
    assert.equal(calls, 2, 'Exactly one dispatch for each explicit user request');
});

