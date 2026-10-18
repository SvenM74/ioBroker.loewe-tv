'use strict';

// The durable journal, timers and TV are simulated. These tests never connect
// to a television or create a real recording.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { RecordingManager, matchesTimer, MAX_JOBS, MAX_JOURNAL_BYTES, RETRY_MS, HISTORY_MS } = require('../lib/recording-manager');

const NOW = Date.UTC(2026, 9, 18, 12);
const HOUR = 60 * 60 * 1000;
function fault(code, message = 'Simulierter Fehler', flags = {}) { return Object.assign(new Error(message), { code, ...flags }); }
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function selected(number = 1, extra = {}) {
    return {
        deviceKey: 'fixture-tv-a',
        channel: { id: `channels.tv.Sender_${number}`, name: `Sender ${number}`, number,
            mediaItemUuid: `fixture-service-${number}`, locator: `channel://${number}:ch-fixture-${number}:sl-fixture`,
            listView: 'fixture-list', identity: `fixture-identity-${number}` },
        programme: { eventId: `fixture-event-${number}`, title: `Sendung ${number}`, start: NOW + HOUR, end: NOW + 2 * HOUR },
        ...extra,
    };
}
function timerFor(job, extra = {}) {
    return { id: `fixture-timer-${job.channel.number}`, matchable: true, sourceUuid: job.channel.mediaItemUuid,
        sourceAncestorUuid: 'sl-fixture', start: job.programme.start, end: job.programme.end, ...extra };
}
function timerList(timers = [], extra = {}) { return { recognized: true, complete: true, comparable: true, timers, ...extra }; }
async function settle() { await nextTurn(); await nextTurn(); }

class Clock {
    constructor(now = NOW) { this.time = now; this.timers = new Map(); this.next = 1; }
    set(fn, delay) {
        const id = this.next++;
        this.timers.set(id, { fn, delay, at: this.time + delay });
        return id;
    }
    clear(id) { this.timers.delete(id); }
    async advance(ms) {
        const target = this.time + ms;
        for (let count = 0; count < 1000; count++) {
            const next = [...this.timers.entries()].filter(([, value]) => value.at <= target)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!next) { this.time = Math.max(this.time, target); await settle(); return; }
            this.time = Math.max(this.time, next[1].at);
            this.timers.delete(next[0]);
            next[1].fn();
            await settle();
        }
        throw new Error('Timer busy loop in recording manager');
    }
}

async function harness(t, options = {}) {
    const clock = options.clock || new Clock();
    let stored = options.stored ?? null;
    let device = options.deviceKey || 'fixture-tv-a';
    let connected = options.connected ?? false;
    let running = true;
    let timers = options.timers || [];
    const writes = [];
    const calls = { probe: [], send: [], list: [], errors: [] };
    const manager = new RecordingManager({
        now: () => clock.time,
        load: async () => options.load ? options.load() : stored,
        save: async json => {
            writes.push(json);
            if (options.save) await options.save(json);
            stored = json;
        },
        scheduleTimer: (fn, delay) => clock.set(fn, delay), clearTimer: id => clock.clear(id),
        deviceKey: () => device, isConnected: () => connected, isRunning: () => running,
        probe: async context => { calls.probe.push(context); return options.probe ? options.probe(context) : connected; },
        listTimers: async context => { calls.list.push(context); return options.listTimers ? options.listTimers(context) : timerList(timers); },
        send: async (job, context) => {
            calls.send.push({ job, context });
            const durable = JSON.parse(stored).jobs.find(value => value.id === job.id);
            assert.equal(durable.status, 'sending', 'Write-ahead intent must be persisted before ProgramTimer');
            assert.equal(durable.attempts, 1);
            assert.equal(context.canSend(), true);
            if (options.send) return options.send(job, context);
            timers = [...timers, timerFor(job)];
            return { acknowledged: true, confirmed: false, result: '0' };
        },
        onError: error => calls.errors.push(error),
    });
    t.after(() => manager.stop());
    if (options.start !== false) await manager.start();
    return { manager, clock, calls, writes,
        get stored() { return stored; },
        setConnected(value) { connected = value; }, setDevice(value) { device = value; },
        setRunning(value) { running = value; }, setTimers(value) { timers = value; },
        job(id) { return manager.snapshot().jobs.find(value => value.id === id); },
    };
}

test('empty recording journal starts without TV traffic or periodic timers', async t => {
    const h = await harness(t);
    assert.deepEqual(h.manager.snapshot(), { schemaVersion: 1, ready: true, updatedAt: 0, lastError: '', jobs: [] });
    assert.equal(h.clock.timers.size, 0);
    assert.equal(h.calls.probe.length + h.calls.list.length + h.calls.send.length, 0);
    assert.equal(h.writes.length, 0);
});

test('a future selection is durable before acceptance and does not wait for the television', async t => {
    const h = await harness(t);
    const job = await h.manager.enqueue(selected());
    assert.equal(job.status, 'queued');
    assert.equal(job.canCancel, true);
    assert.equal(JSON.parse(h.stored).jobs[0].id, job.id);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.clock.timers.size, 1);
    job.channel.name = 'changed by caller';
    assert.equal(h.job(job.id).channel.name, 'Sender 1');
});

test('offline jobs survive a restart and transfer when the television becomes reachable', async t => {
    const old = await harness(t);
    const job = await old.manager.enqueue(selected());
    await old.clock.advance(0);
    assert.equal(old.job(job.id).status, 'queued');
    assert.equal(old.job(job.id).failureCode, 'RECORDING_OFFLINE');
    assert.equal(old.calls.send.length, 0);
    old.manager.stop();
    const h = await harness(t, { stored: old.stored, connected: true });
    assert.equal(h.job(job.id).status, 'queued');
    h.manager.connected();
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 1);
    assert.equal(h.job(job.id).status, 'scheduled');
    assert.equal(h.job(job.id).timerId, 'fixture-timer-1');
    assert.equal(h.job(job.id).canCancel, false);
    assert.equal(h.clock.timers.size, 0);
});

test('an existing exact TV timer is confirmed without another ProgramTimer call', async t => {
    const value = selected();
    const h = await harness(t, { connected: true, timers: [timerFor(value)] });
    const job = await h.manager.enqueue(value);
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.job(job.id).status, 'scheduled');
    assert.equal(h.job(job.id).attempts, 0);
});

test('timer matching requires exact programme times and stable sender identity', () => {
    const job = selected();
    assert.equal(matchesTimer(job, timerFor(job)), true);
    assert.equal(matchesTimer(job, timerFor(job, { sourceAncestorUuid: '' })), true);
    assert.equal(matchesTimer(job, timerFor(job, { sourceUuid: 'ch-fixture-1' })), true);
    for (const fields of [
        { sourceUuid: 'different', sourceName: job.channel.name }, { start: job.programme.start + 1000 },
        { end: job.programme.end - 1000 }, { sourceAncestorUuid: 'other-list' }, { matchable: false },
        { sourceUuid: 'ch-fixture-1', sourceAncestorUuid: '' }, { sourceUuid: 'ch-fixture-1', sourceAncestorUuid: 'fixture-list' },
        { id: '' },
    ]) assert.equal(matchesTimer(job, timerFor(job, fields)), false, JSON.stringify(fields));
});

test('an accepted ProgramTimer response alone stays uncertain and is never sent again', async t => {
    const h = await harness(t, { connected: true, send: async () => ({ acknowledged: true, confirmed: false, result: '0' }) });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'uncertain');
    assert.equal(h.job(job.id).acknowledgedAt, NOW);
    await h.clock.advance(RETRY_MS);
    assert.equal(h.calls.send.length, 1);
    await assert.rejects(h.manager.cancelQueued(job.id), { code: 'RECORDING_ALREADY_SENT' });
    h.setTimers([timerFor(selected())]);
    h.manager.connected();
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'scheduled');
    assert.equal(h.calls.send.length, 1);
});

test('a transport timeout followed by a restart never blindly resends the recording', async t => {
    const old = await harness(t, { connected: true, send: async () => { throw fault('TIMEOUT'); } });
    const job = await old.manager.enqueue(selected());
    await old.clock.advance(0);
    assert.equal(old.job(job.id).status, 'uncertain');
    old.manager.stop();
    const h = await harness(t, { stored: old.stored, connected: true });
    await h.clock.advance(0);
    await h.clock.advance(RETRY_MS);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.job(job.id).status, 'uncertain');
});

test('a durable in-flight intent becomes uncertain on restart before any TV work', async t => {
    const pending = deferred();
    const old = await harness(t, { connected: true, send: () => pending.promise });
    const job = await old.manager.enqueue(selected());
    await old.clock.advance(0);
    assert.equal(JSON.parse(old.stored).jobs[0].status, 'sending');
    old.manager.stop();
    const h = await harness(t, { stored: old.stored, connected: true });
    assert.equal(h.job(job.id).status, 'uncertain');
    assert.equal(JSON.parse(h.stored).jobs[0].status, 'uncertain');
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 0);
    pending.resolve({ acknowledged: true });
    await settle();
});

test('ambiguous and incomplete timer lists do not falsely confirm or duplicate existing timers', async t => {
    for (const list of [
        timerList([timerFor(selected()), timerFor(selected(), { id: 'second-timer' })]),
        timerList([timerFor(selected())], { complete: false }),
        timerList([timerFor(selected())], { comparable: false }),
    ]) {
        const h = await harness(t, { connected: true, listTimers: async () => list });
        const job = await h.manager.enqueue(selected());
        await h.clock.advance(0);
        assert.equal(h.job(job.id).status, 'uncertain');
        assert.equal(h.calls.send.length, 0);
        h.manager.stop();
    }
});

test('an unknown timer format permits one new submission but never a false confirmation', async t => {
    const h = await harness(t, { connected: true, listTimers: async () => timerList([], { complete: false, comparable: false }),
        send: async () => ({ acknowledged: true, confirmed: false, result: '0' }) });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    await h.clock.advance(RETRY_MS);
    assert.equal(h.calls.send.length, 1);
    assert.equal(h.job(job.id).status, 'uncertain');
});

test('a network failure while reading the timer list defers a fresh submission', async t => {
    const h = await harness(t, { connected: true, listTimers: async () => { throw fault('NETWORK'); } });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.job(job.id).status, 'queued');
    assert.equal(h.job(job.id).failureCode, 'RECORDING_OFFLINE');
});

test('an offline deadline shorter than the polling interval becomes missed at programme start', async t => {
    const h = await harness(t);
    const value = selected(); value.programme.start = NOW + 5000;
    const job = await h.manager.enqueue(value);
    await h.clock.advance(0);
    assert.equal([...h.clock.timers.values()][0].delay, 5000);
    await h.clock.advance(5000);
    assert.equal(h.job(job.id).status, 'missed');
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.clock.timers.size, 0);
    h.setConnected(true); h.manager.connected();
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 0);
});

test('already started, past, unbounded and imprecise programme times are rejected', async t => {
    const h = await harness(t);
    for (const patch of [
        { start: NOW }, { start: NOW - HOUR }, { start: NOW + 15 * 24 * HOUR, end: NOW + 15 * 24 * HOUR + HOUR },
        { end: null }, { end: NOW + HOUR }, { start: NOW + HOUR + 1 }, { end: NOW + 3 * 24 * HOUR },
    ]) {
        const value = selected(); Object.assign(value.programme, patch);
        await assert.rejects(h.manager.enqueue(value), error => ['RECORDING_INVALID', 'RECORDING_TIME'].includes(error.code));
    }
    assert.equal(h.writes.length, 0);
    assert.equal(h.calls.send.length, 0);
});

test('a known pre-send deadline abort is missed rather than retransmitted late', async t => {
    let h;
    h = await harness(t, { connected: true, send: async job => {
        h.clock.time = job.programme.start;
        throw fault('STALE_COMMAND', 'Sendungsbeginn erreicht', { recordingNotSent: true });
    } });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'missed');
    assert.equal(h.job(job.id).attempts, 0);
});

test('a proven pre-send queue failure may retry and never claims an uncertain transfer', async t => {
    let attempts = 0;
    const h = await harness(t, { connected: true, send: async () => {
        if (!attempts++) throw fault('QUEUE_BUSY', 'Warteschlange voll', { recordingNotSent: true });
        return { acknowledged: true };
    } });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'queued');
    assert.equal(h.job(job.id).attempts, 0);
    await h.clock.advance(RETRY_MS);
    assert.equal(h.calls.send.length, 2);
    assert.equal(h.job(job.id).status, 'uncertain');
});

test('an expired SOAP session retries only when the recording was demonstrably not sent', async t => {
    let attempts = 0;
    const h = await harness(t, { connected: true, send: async () => {
        throw fault('SOAP', 'Client session expired', {
            sessionInvalid: true, recordingNotSent: attempts++ === 0,
        });
    } });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'queued');
    assert.equal(h.job(job.id).attempts, 0);
    assert.equal(JSON.parse(h.stored).jobs[0].status, 'queued');
    await h.clock.advance(RETRY_MS);
    assert.equal(h.calls.send.length, 2);
    assert.equal(h.job(job.id).status, 'uncertain');
    await h.clock.advance(RETRY_MS);
    assert.equal(h.calls.send.length, 2);
});

test('queued jobs can be cancelled durably; cancelling a submitted job is denied', async t => {
    const h = await harness(t);
    const job = await h.manager.enqueue(selected());
    const cancelled = await h.manager.cancelQueued(job.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.canCancel, false);
    assert.equal(JSON.parse(h.stored).jobs[0].status, 'cancelled');
    assert.equal(h.clock.timers.size, 0);
    h.setConnected(true); h.manager.connected();
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 0);
    const again = await h.manager.enqueue(selected());
    assert.equal(again.status, 'queued');
    assert.notEqual(again.id, job.id);
    assert.equal(h.manager.snapshot().jobs.length, 1);
});

test('TV changes block unsent jobs and return to the original TV reactivates them', async t => {
    const h = await harness(t, { connected: true });
    const job = await h.manager.enqueue(selected());
    h.setDevice('fixture-tv-b');
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'blockedDevice');
    assert.equal(h.job(job.id).canCancel, true);
    assert.equal(h.calls.send.length + h.calls.list.length, 0);
    const blockedWrites = h.writes.length;
    await h.clock.advance(RETRY_MS);
    assert.equal(h.job(job.id).status, 'blockedDevice');
    assert.equal(h.writes.length, blockedWrites);
    h.setDevice('fixture-tv-a'); h.manager.connected();
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'scheduled');
    assert.equal(h.calls.send.length, 1);
});

test('a job for another configured TV cannot be enqueued or confirmed by its timer list', async t => {
    const h = await harness(t, { deviceKey: 'fixture-tv-b', connected: true });
    await assert.rejects(h.manager.enqueue(selected()), { code: 'RECORDING_DEVICE' });
    assert.equal(h.writes.length, 0);
});

test('a TV change while a timer read is pending cannot apply the old TV response', async t => {
    const pending = deferred();
    const h = await harness(t, { connected: true, listTimers: () => pending.promise });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    h.setDevice('fixture-tv-b');
    pending.resolve(timerList([timerFor(selected())]));
    await settle();
    assert.equal(h.job(job.id).status, 'queued');
    assert.equal(h.calls.send.length, 0);
    h.manager.connected();
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'blockedDevice');
});

test('duplicate requests, including another sender list, retain one durable job', async t => {
    const h = await harness(t);
    const first = selected(); first.programme.eventId = '';
    const second = cloneSelection(first);
    second.channel.listView = 'other-list'; second.channel.identity = 'other-list-identity';
    const jobs = await Promise.all([h.manager.enqueue(first), h.manager.enqueue(second)]);
    assert.equal(jobs[0].id, jobs[1].id);
    assert.equal(h.manager.snapshot().jobs.length, 1);
    assert.equal(h.writes.length, 1);
});
function cloneSelection(value) { return JSON.parse(JSON.stringify(value)); }

test('the journal holds at most 100 jobs and does not discard active entries', async t => {
    const h = await harness(t);
    for (let index = 1; index <= MAX_JOBS; index++) await h.manager.enqueue(selected(index));
    await assert.rejects(h.manager.enqueue(selected(MAX_JOBS + 1)), { code: 'RECORDING_LIMIT' });
    assert.equal(h.manager.snapshot().jobs.length, MAX_JOBS);
    assert.ok(Buffer.byteLength(h.stored) < MAX_JOURNAL_BYTES);
});

test('expired historical jobs are pruned after seven days without removing future jobs', async t => {
    const old = await harness(t);
    const job = await old.manager.enqueue(selected());
    await old.manager.cancelQueued(job.id);
    old.manager.stop();
    const h = await harness(t, { clock: new Clock(NOW + 2 * HOUR + HISTORY_MS + 1000), stored: old.stored });
    assert.equal(h.manager.snapshot().jobs.length, 0);
    assert.equal(JSON.parse(h.stored).jobs.length, 0);
});

test('a failed initial save rejects acceptance and freezes processing', async t => {
    const h = await harness(t, { connected: true, save: async () => { throw fault('DATABASE'); } });
    await assert.rejects(h.manager.enqueue(selected()), { code: 'DATABASE' });
    assert.equal(h.manager.snapshot().ready, false);
    assert.equal(h.manager.snapshot().jobs.length, 0);
    await assert.rejects(h.manager.enqueue(selected(2)), { code: 'RECORDING_UNAVAILABLE' });
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.writes.length, 1);
});

test('a timed-out save cannot overtake a later journal or start background TV work', async t => {
    const pending = deferred();
    const h = await harness(t, { connected: true, save: () => pending.promise });
    const queued = h.manager.enqueue(selected());
    const rejected = assert.rejects(queued, { code: 'RECORDING_DATABASE' });
    await settle(); await h.clock.advance(2000); await rejected;
    assert.equal(h.manager.snapshot().ready, false);
    await assert.rejects(h.manager.enqueue(selected(2)), { code: 'RECORDING_UNAVAILABLE' });
    pending.resolve(); await settle();
    assert.equal(h.writes.length, 1);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.manager.snapshot().jobs.length, 0);
    assert.equal(h.clock.timers.size, 0);
});

test('a failed write-ahead intent prevents every ProgramTimer call', async t => {
    const h = await harness(t, { connected: true, save: async json => {
        if (JSON.parse(json).jobs.some(job => job.status === 'sending')) throw fault('DATABASE');
    } });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.manager.snapshot().ready, false);
    assert.equal(JSON.parse(h.stored).jobs.find(value => value.id === job.id).status, 'queued');
});

test('failed outcome persistence retains the sending intent for safe recovery', async t => {
    const old = await harness(t, { connected: true, save: async json => {
        if (JSON.parse(json).jobs.some(job => job.status === 'uncertain')) throw fault('DATABASE');
    } });
    const job = await old.manager.enqueue(selected());
    await old.clock.advance(0);
    assert.equal(old.calls.send.length, 1);
    assert.equal(JSON.parse(old.stored).jobs[0].status, 'sending');
    old.manager.stop();
    const h = await harness(t, { connected: true, stored: old.stored });
    await h.clock.advance(0);
    assert.equal(h.job(job.id).status, 'uncertain');
    assert.equal(h.calls.send.length, 0);
});

test('malformed and unsupported journals fail closed without replacement', async t => {
    for (const raw of ['{broken', '{}', JSON.stringify({ schemaVersion: 2, jobs: [] }), 'x'.repeat(MAX_JOURNAL_BYTES + 1)]) {
        const h = await harness(t, { start: false, stored: raw });
        await assert.rejects(h.manager.start(), { code: 'RECORDING_DATA' });
        assert.equal(h.manager.snapshot().ready, false);
        assert.equal(h.writes.length, 0);
        assert.equal(h.calls.send.length + h.calls.list.length + h.calls.probe.length, 0);
        h.manager.stop();
    }
});

test('journal identity mismatches and duplicate jobs fail closed', async t => {
    const old = await harness(t);
    await old.manager.enqueue(selected());
    old.manager.stop();
    for (const change of [
        saved => { saved.jobs[0].deviceKey = 'different-tv'; },
        saved => { saved.jobs.push(saved.jobs[0]); },
        saved => { saved.jobs[0].attempts = 1; },
    ]) {
        const saved = JSON.parse(old.stored); change(saved);
        const h = await harness(t, { start: false, stored: JSON.stringify(saved) });
        await assert.rejects(h.manager.start(), { code: 'RECORDING_DATA' });
        assert.equal(h.writes.length, 0);
        h.manager.stop();
    }
});

test('connection notifications coalesce and never await a nested TV queue', async t => {
    const pending = deferred();
    const h = await harness(t, { probe: () => pending.promise });
    await h.manager.enqueue(selected());
    for (let index = 0; index < 50; index++) assert.equal(h.manager.connected(), undefined);
    assert.equal(h.clock.timers.size, 1);
    await h.clock.advance(0);
    for (let index = 0; index < 50; index++) h.manager.connected();
    assert.equal(h.calls.probe.length, 1);
    pending.resolve(false); await settle();
    assert.equal(h.clock.timers.size, 1);
    assert.equal([...h.clock.timers.values()][0].delay, RETRY_MS);
});

test('a non-resolving TV probe has a bounded timeout and one delayed retry', async t => {
    const h = await harness(t, { probe: () => new Promise(() => undefined) });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    await h.clock.advance(5000);
    assert.equal(h.calls.probe.length, 1);
    assert.equal(h.job(job.id).status, 'queued');
    assert.equal(h.calls.send.length, 0);
    assert.equal([...h.clock.timers.values()][0].delay, RETRY_MS);
});

test('stop closes timers and prevents late TV responses from writing or continuing', async t => {
    const pending = deferred();
    const h = await harness(t, { connected: true, send: () => pending.promise });
    const job = await h.manager.enqueue(selected());
    await h.clock.advance(0);
    const writes = h.writes.length;
    const reads = h.calls.list.length;
    assert.equal(h.job(job.id).status, 'sending');
    h.manager.stop();
    assert.equal(h.clock.timers.size, 0);
    assert.equal(h.calls.send[0].context.signal.aborted, true);
    assert.equal(h.calls.send[0].context.canSend(), false);
    pending.resolve({ acknowledged: true }); await settle();
    assert.equal(h.writes.length, writes);
    assert.equal(h.calls.list.length, reads);
    assert.equal(h.clock.timers.size, 0);
    await assert.rejects(h.manager.enqueue(selected(2)), { code: 'CLOSED' });
});

test('stopping during a database write prevents a later send and any subsequent writes', async t => {
    const pending = deferred();
    const h = await harness(t, { connected: true, save: () => pending.promise });
    const accepted = h.manager.enqueue(selected());
    const rejected = assert.rejects(accepted, { code: 'CLOSED' });
    await settle(); h.manager.stop(); await rejected;
    pending.resolve(); await settle();
    assert.equal(h.writes.length, 1);
    assert.equal(h.calls.send.length, 0);
    assert.equal(h.clock.timers.size, 0);
});

test('recording batches yield before handling more than four pending submissions', async t => {
    const h = await harness(t, { connected: true });
    for (let index = 1; index <= 7; index++) await h.manager.enqueue(selected(index));
    await h.clock.advance(0);
    assert.equal(h.calls.send.length, 4);
    assert.equal([...h.clock.timers.values()][0].delay, 1000);
    await h.clock.advance(1000);
    assert.equal(h.calls.send.length, 7);
    assert.ok(h.manager.snapshot().jobs.every(job => job.status === 'scheduled'));
    assert.equal(h.clock.timers.size, 0);
});
