'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { runPowerOn } = require('../lib/power-on');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function fault(code, extra = {}) {
    return Object.assign(new Error(`Synthetic ${code}`), { code, ...extra });
}

function virtualClock(start = 100000) {
    let time = start;
    const waits = [];
    return {
        now: () => time,
        advance: ms => { time += ms; },
        waits,
        wait: async (ms, signal) => {
            assert.equal(signal.aborted, false);
            waits.push(ms);
            time += ms;
        },
    };
}

test('WOL starts before slow progress reporting, followed by a bounded power-key call', async () => {
    const clock = virtualClock();
    const reporting = deferred();
    const phases = [];
    const calls = [];
    const keyReply = { transmitted: true };
    const wolReply = { port: 9 };
    const operation = runPowerOn({
        now: clock.now, wait: clock.wait,
        sendWake: () => { calls.push('wake'); return wolReply; },
        sendPowerKey: deadline => {
            calls.push('key');
            assert.equal(clock.now(), 101000);
            assert.equal(deadline, 104000);
            return keyReply;
        },
        onProgress: phase => {
            phases.push(phase);
            if (phase === 'waking') return reporting.promise;
        },
    });
    assert.deepEqual(calls, ['wake']);
    reporting.resolve();
    const result = await operation;
    assert.deepEqual(calls, ['wake', 'key']);
    assert.deepEqual(phases, ['waking', 'waiting', 'powerKeySent']);
    assert.equal(result.response, keyReply);
    assert.equal(result.wakeResponse, wolReply);
    assert.equal(result.attempts, 1);
    assert.equal(result.wakeBursts, 1);
    assert.deepEqual(clock.waits, [1000]);
});

test('transient network, stale-session and gateway failures retry without another early WOL burst', async () => {
    const clock = virtualClock();
    const errors = [
        fault('NETWORK'), fault('SOAP_FAULT', { sessionInvalid: true }),
        fault('HTTP', { httpStatus: 502 }), fault('HTTP', { httpStatus: 503 }),
        fault('HTTP', { httpStatus: 504 }),
    ];
    let wakes = 0;
    let calls = 0;
    const result = await runPowerOn({
        now: clock.now, wait: clock.wait,
        sendWake: () => { wakes++; },
        sendPowerKey: deadline => {
            calls++;
            assert.ok(deadline <= clock.now() + 3000);
            if (errors.length) throw errors.shift();
            return 'sent';
        },
    });
    assert.equal(result.response, 'sent');
    assert.equal(calls, 6);
    assert.equal(wakes, 1);
    assert.deepEqual(clock.waits, [1000, 2000, 2000, 2000, 2000, 2000]);
});

test('authentication, validation and unsupported-command failures are preserved without retry', async () => {
    for (const error of [
        fault('HTTP', { httpStatus: 401 }), fault('HTTP', { httpStatus: 403 }),
        fault('HTTP', { httpStatus: 500 }), fault('SOAP_FAULT'), fault('VALIDATION'),
    ]) {
        const clock = virtualClock();
        let calls = 0;
        const phases = [];
        await assert.rejects(runPowerOn({
            now: clock.now, wait: clock.wait,
            sendWake: () => {},
            sendPowerKey: () => { calls++; throw error; },
            onProgress: phase => { phases.push(phase); },
        }), actual => actual === error);
        assert.equal(calls, 1);
        assert.equal(phases.at(-1), 'failed');
    }
});

test('a TV that remains unavailable receives exactly one later WOL burst after the standby window', async () => {
    const clock = virtualClock();
    const wakeTimes = [];
    let calls = 0;
    const result = await runPowerOn({
        now: clock.now, wait: clock.wait,
        sendWake: () => { wakeTimes.push(clock.now()); return wakeTimes.length; },
        sendPowerKey: () => {
            calls++;
            if (calls < 21) throw fault('NETWORK');
            return 'sent';
        },
    });
    assert.deepEqual(wakeTimes, [100000, 135000]);
    assert.equal(result.wakeResponse, 1);
    assert.equal(result.lastWakeResponse, 2);
    assert.equal(result.wakeBursts, 2);
    assert.equal(result.attempts, 21);
});

test('overall deadline limits retries and shortens the last request and wait budgets', async () => {
    const clock = virtualClock();
    const deadlines = [];
    const phases = [];
    await assert.rejects(runPowerOn({
        now: clock.now, wait: clock.wait, timeoutMs: 4500,
        sendWake: () => {},
        sendPowerKey: deadline => { deadlines.push(deadline); throw fault('NETWORK'); },
        onProgress: phase => { phases.push(phase); },
    }), { code: 'TIMEOUT' });
    assert.deepEqual(deadlines, [104000, 104500]);
    assert.deepEqual(clock.waits, [1000, 2000, 1500]);
    assert.equal(clock.now(), 104500);
    assert.equal(phases.at(-1), 'failed');
});

test('a response completed beyond its request deadline is not accepted as a timely key delivery', async () => {
    const clock = virtualClock();
    let calls = 0;
    const result = await runPowerOn({
        now: clock.now, wait: clock.wait,
        sendWake: () => {},
        sendPowerKey: () => {
            calls++;
            if (calls === 1) clock.advance(3100);
            return calls;
        },
    });
    assert.equal(result.response, 2);
    assert.equal(result.attempts, 2);
    assert.deepEqual(clock.waits, [1000, 2000]);
});

test('cancellation before starting never invokes a device hook', async () => {
    const controller = new AbortController();
    controller.abort();
    const phases = [];
    await assert.rejects(runPowerOn({
        signal: controller.signal,
        sendWake: () => assert.fail('WOL after cancellation'),
        sendPowerKey: () => assert.fail('Key after cancellation'),
        onProgress: phase => { phases.push(phase); },
    }), { code: 'CANCELLED', name: 'AbortError' });
    assert.deepEqual(phases, ['cancelled']);
});

test('cancellation during the first delay prevents the later power-key transmission', async () => {
    const controller = new AbortController();
    let wakes = 0;
    const phases = [];
    await assert.rejects(runPowerOn({
        signal: controller.signal,
        sendWake: () => { wakes++; },
        sendPowerKey: () => assert.fail('Key after cancellation'),
        onProgress: phase => {
            phases.push(phase);
            if (phase === 'waiting') setImmediate(() => controller.abort());
        },
    }), { code: 'CANCELLED' });
    assert.equal(wakes, 1);
    assert.equal(phases.at(-1), 'cancelled');
});

test('cancellation from inside the WOL hook does not leave an unobserved rejected promise', async () => {
    const controller = new AbortController();
    const phases = [];
    await assert.rejects(runPowerOn({
        signal: controller.signal,
        sendWake: () => { controller.abort(); return Promise.reject(fault('NETWORK')); },
        sendPowerKey: () => assert.fail('Key after cancellation'),
        onProgress: phase => { phases.push(phase); },
    }), { code: 'CANCELLED' });
    await nextTurn();
    assert.deepEqual(phases, ['cancelled']);
});

test('cancelling an in-flight key ignores its later rejection and never retries', async () => {
    const controller = new AbortController();
    const pendingKey = deferred();
    const invoked = deferred();
    let keys = 0;
    const operation = runPowerOn({
        signal: controller.signal, firstKeyDelayMs: 0,
        sendWake: () => {},
        sendPowerKey: () => { keys++; invoked.resolve(); return pendingKey.promise; },
    });
    const rejected = assert.rejects(operation, { code: 'CANCELLED' });
    await invoked.promise;
    controller.abort();
    await rejected;
    pendingKey.reject(fault('NETWORK'));
    await nextTurn();
    assert.equal(keys, 1);
});

test('a hung WOL hook is stopped by the real overall timer without waiting for diagnostics', async () => {
    const started = performance.now();
    const pending = deferred();
    await assert.rejects(runPowerOn({
        timeoutMs: 25,
        sendWake: () => pending.promise,
        sendPowerKey: () => assert.fail('Key before completed WOL'),
        onProgress: () => new Promise(() => {}),
    }), { code: 'TIMEOUT' });
    assert.ok(performance.now() - started < 1000);
    pending.reject(fault('NETWORK'));
    await nextTurn();
});

test('a hung individual key attempt has a short timeout and its late rejection stays handled', async () => {
    const pending = deferred();
    let keys = 0;
    const result = await runPowerOn({
        timeoutMs: 1000, maxRequestMs: 20, firstKeyDelayMs: 0, retryIntervalMs: 1,
        sendWake: () => {},
        sendPowerKey: () => { keys++; return keys === 1 ? pending.promise : 'sent'; },
    });
    assert.equal(result.attempts, 2);
    pending.reject(fault('NETWORK'));
    await nextTurn();
});

test('a hung success-progress hook cannot extend the overall deadline or trigger another key', async () => {
    let keys = 0;
    await assert.rejects(runPowerOn({
        timeoutMs: 25, firstKeyDelayMs: 0,
        sendWake: () => {},
        sendPowerKey: () => { keys++; return 'sent'; },
        onProgress: phase => phase === 'powerKeySent' ? new Promise(() => {}) : undefined,
    }), { code: 'TIMEOUT' });
    assert.equal(keys, 1);
});

test('progress and WOL errors are terminal even when their code describes a network failure', async () => {
    const error = fault('NETWORK');
    for (const failingHook of ['wake', 'progress']) {
        let keys = 0;
        await assert.rejects(runPowerOn({
            firstKeyDelayMs: 0,
            sendWake: () => { if (failingHook === 'wake') throw error; },
            sendPowerKey: () => { keys++; },
            onProgress: phase => { if (failingHook === 'progress' && phase === 'waiting') throw error; },
        }), actual => actual === error);
        assert.equal(keys, 0);
    }
});

test('a rejected final diagnostic does not replace the original device failure or become unhandled', async () => {
    const original = fault('VALIDATION');
    await assert.rejects(runPowerOn({
        firstKeyDelayMs: 0,
        sendWake: () => {},
        sendPowerKey: () => { throw original; },
        onProgress: phase => phase === 'failed' ? Promise.reject(new Error('Diagnostic unavailable')) : undefined,
    }), actual => actual === original);
    await nextTurn();
});

test('deadline is checked between callbacks, before invoking the next device hook', async () => {
    const clock = virtualClock();
    await assert.rejects(runPowerOn({
        now: clock.now, wait: clock.wait, timeoutMs: 2000, firstKeyDelayMs: 0,
        sendWake: () => {},
        sendPowerKey: () => assert.fail('Key after overall deadline'),
        onProgress: phase => { if (phase === 'waiting') clock.advance(2000); },
    }), { code: 'TIMEOUT' });
});

test('invalid timing and callback options fail before WOL is sent', async () => {
    for (const invalid of [
        { timeoutMs: 0 }, { retryIntervalMs: 0 }, { firstKeyDelayMs: -1 },
        { maxRequestMs: 0 }, { rebroadcastAfterMs: 0 }, { now: () => NaN },
        { wait: null }, { onProgress: null }, { signal: {} },
    ]) {
        await assert.rejects(runPowerOn({
            sendWake: () => assert.fail('WOL before valid configuration'), sendPowerKey: () => {}, ...invalid,
        }), TypeError);
    }
});
