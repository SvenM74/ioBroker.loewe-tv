'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ProtocolError } = require('./loewe-client');

const MAX_JOBS = 100;
const MAX_JOURNAL_BYTES = 480 * 1024;
const RETRY_MS = 30000;
const HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
const RECONCILE_AFTER_END_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BATCH = 4;
const STATES = new Set(['queued', 'blockedDevice', 'sending', 'uncertain', 'scheduled', 'rejected', 'missed', 'cancelled']);
const UNSENT = new Set(['queued', 'blockedDevice']);
const NETWORK_ERRORS = new Set(['NETWORK', 'HTTP', 'TIMEOUT', 'CLOSED', 'QUEUE_BUSY', 'QUEUE_EXPIRED', 'RECORDING_TIMEOUT']);
const RETRYABLE_NOT_SENT = new Set([...NETWORK_ERRORS, 'CANCELLED', 'STALE_COMMAND']);

function failure(message, code = 'RECORDING_ERROR') { return new ProtocolError(message, code); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function message(error) {
    return String(error?.message || 'Aufnahmeauftrag konnte nicht verarbeitet werden.')
        .replace(/https?:\/\/[^\s<>"']+/giu, '[URL]').replace(/[\u0000-\u001f\u007f]/gu, ' ').slice(0, 1000);
}
function text(value, name, max, { optional = false } = {}) {
    if (optional && (value === undefined || value === null || value === '')) return '';
    if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw failure(`Ungültiger Aufnahmeauftrag: ${name}.`, 'RECORDING_INVALID');
    }
    return value;
}
function timestamp(value, name, optional = false) {
    if (optional && value === null) return null;
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) {
        throw failure(`Ungültiger Aufnahmeauftrag: ${name}.`, 'RECORDING_INVALID');
    }
    return value;
}
function selection(input, now, restoring = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !input.channel || !input.programme) {
        throw failure('Sender und Sendung fehlen im Aufnahmeauftrag.', 'RECORDING_INVALID');
    }
    const channel = input.channel;
    const programme = input.programme;
    const result = {
        deviceKey: text(input.deviceKey, 'TV-Kennung', 1024),
        channel: {
            id: text(channel.id, 'Sender-ID', 512),
            name: text(channel.name, 'Sendername', 512),
            number: channel.number,
            mediaItemUuid: text(channel.mediaItemUuid, 'Senderkennung', 2048),
            locator: text(channel.locator, 'Senderadresse', 2048),
            listView: text(channel.listView, 'Senderliste', 2048),
            identity: text(channel.identity, 'Senderidentität', 4096),
        },
        programme: {
            eventId: text(programme.eventId, 'Sendungskennung', 1024, { optional: true }),
            title: text(programme.title, 'Sendungstitel', 2048),
            start: timestamp(programme.start, 'Sendungsbeginn'),
            end: timestamp(programme.end, 'Sendungsende'),
        },
    };
    if (!/^channels\.tv\.[A-Za-z0-9_]+$/u.test(result.channel.id)
        || !Number.isSafeInteger(channel.number) || channel.number < 0
        || !/^channel:\/\/[^:]+:[^:]+:[^:]+$/u.test(result.channel.locator)
        || result.programme.start % 1000 || result.programme.end % 1000
        || result.programme.end <= result.programme.start
        || result.programme.end - result.programme.start > 24 * 60 * 60 * 1000) {
        throw failure('Sender oder Sendungszeit ist für eine Aufnahme nicht eindeutig.', 'RECORDING_INVALID');
    }
    if (!restoring && (result.programme.start <= now || result.programme.start > now + MAX_FUTURE_MS)) {
        throw failure('Nur noch nicht begonnene Sendungen innerhalb der nächsten 14 Tage können vorgemerkt werden.', 'RECORDING_TIME');
    }
    return result;
}
function keyOf(input) {
    return createHash('sha256').update(JSON.stringify([
        input.deviceKey, input.channel.mediaItemUuid, input.programme.eventId, input.programme.start,
    ])).digest('hex');
}
function matchesTimer(job, timer) {
    if (!timer || timer.matchable !== true || !timer.id || timer.start !== job.programme.start || timer.end !== job.programme.end) return false;
    const locator = /^channel:\/\/[^:]+:([^:]+):([^:]+)$/u.exec(job.channel.locator);
    if (!locator) return false;
    const ancestor = timer.sourceAncestorUuid || '';
    if (timer.sourceUuid === job.channel.mediaItemUuid) return !ancestor || ancestor === locator[2];
    return timer.sourceUuid === locator[1] && ancestor === locator[2];
}

/**
 * A durable write-ahead journal for user-confirmed, future TV recordings.
 *
 * load/save use one ioBroker JSON state. save must resolve only after the actual
 * database operation, never after a fire-and-forget write or a swallowed error.
 * probe, send and listTimers belong to the runtime's existing serial TV queue.
 * send must check context.canSend() again inside that queue immediately before
 * ProgramTimer. Only a proven pre-send abort may set error.recordingNotSent.
 * A response to ProgramTimer alone does not prove that a timer was installed.
 */
class RecordingManager {
    constructor({ load, save, probe, send, listTimers, now = Date.now, scheduleTimer = setTimeout,
        clearTimer = clearTimeout, isRunning = () => true, isConnected = () => false,
        deviceKey, onError = () => undefined } = {}) {
        if (![load, save, probe, send, listTimers, deviceKey].every(value => typeof value === 'function')) {
            throw new TypeError('RecordingManager benötigt load, save, probe, send, listTimers und deviceKey.');
        }
        Object.assign(this, { load, save, probe, send, listTimers, now, scheduleTimer, clearTimer,
            isRunning, isConnected, deviceKey, onError });
        this.started = false;
        this.stopped = false;
        this.ready = false;
        this.lastError = '';
        this.updatedAt = 0;
        this.jobs = [];
        this._startPromise = null;
        this._workPromise = null;
        this._mutationTail = Promise.resolve();
        this._pendingMutations = 0;
        this._wakeTimer = null;
        this._wakeAt = 0;
        this._wakeRequested = false;
        this._batchRemaining = false;
        this._waiting = new Set();
    }

    _active() { return this.started && !this.stopped && this.isRunning(); }
    _check({ ready = true } = {}) {
        if (!this._active()) throw failure('Aufnahmeverwaltung ist nicht aktiv.', 'CLOSED');
        if (ready && !this.ready) throw failure(this.lastError || 'Aufnahmeverwaltung ist noch nicht bereit.', 'RECORDING_UNAVAILABLE');
    }
    _job(job) { return { ...clone(job), canCancel: UNSENT.has(job.status) && job.attempts === 0 }; }
    snapshot() {
        return { schemaVersion: 1, ready: this.ready && this._active(), updatedAt: this.updatedAt,
            lastError: this.lastError, jobs: this.jobs.map(job => this._job(job)) };
    }
    _report(error) { try { this.onError(error); } catch { /* A logger must not alter the journal. */ } }
    _clearWake() {
        if (this._wakeTimer !== null) this.clearTimer(this._wakeTimer);
        this._wakeTimer = null;
        this._wakeAt = 0;
    }
    _freeze(error) {
        this.ready = false;
        this.lastError = message(error);
        this._clearWake();
        this._report(error);
    }

    // Every external wait is bounded. Its late completion is deliberately ignored;
    // after a write timeout the manager freezes, so no newer journal can be
    // overwritten by that old, still-running database operation.
    _bounded(operation, timeout, code = 'RECORDING_TIMEOUT') {
        this._check({ ready: false });
        return new Promise((resolve, reject) => {
            const abort = new AbortController();
            let done = false;
            let timer = null;
            const finish = (error, value) => {
                if (done) return;
                done = true;
                if (timer !== null) this.clearTimer(timer);
                this._waiting.delete(cancel);
                if (error) { abort.abort(); reject(error); } else resolve(value);
            };
            const cancel = () => finish(failure('Aufnahmeverwaltung wird beendet.', 'CLOSED'));
            this._waiting.add(cancel);
            timer = this.scheduleTimer(() => finish(failure(
                code === 'RECORDING_DATABASE' ? 'Aufnahmeaufträge konnten nicht rechtzeitig gespeichert werden. Bis zum Neustart erfolgt kein weiterer Versand.'
                    : 'Fernseher antwortet nicht rechtzeitig.', code,
            )), timeout);
            Promise.resolve().then(() => {
                this._check({ ready: false });
                return operation({ signal: abort.signal, deadline: this.now() + timeout,
                    canRun: () => !abort.signal.aborted && this._active() });
            }).then(value => finish(null, value), error => finish(error));
        });
    }

    async _persist(jobs) {
        this._check({ ready: false });
        const updatedAt = Math.max(this.updatedAt, this.now());
        const json = JSON.stringify({ schemaVersion: 1, updatedAt, jobs });
        if (Buffer.byteLength(json) > MAX_JOURNAL_BYTES) throw failure('Der Speicher für Aufnahmeaufträge ist voll.', 'RECORDING_LIMIT');
        try {
            await this._bounded(() => this.save(json), 2000, 'RECORDING_DATABASE');
            this._check({ ready: false });
            this.jobs = jobs;
            this.updatedAt = updatedAt;
        } catch (error) {
            if (this._active()) this._freeze(error);
            throw error;
        }
    }

    _restore(raw) {
        if (raw === null || raw === undefined || raw === '') return { jobs: [], updatedAt: 0 };
        if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_JOURNAL_BYTES) throw failure('Gespeicherte Aufnahmeaufträge sind ungültig oder zu groß.', 'RECORDING_DATA');
        let saved;
        try { saved = JSON.parse(raw); } catch { throw failure('Gespeicherte Aufnahmeaufträge enthalten ungültiges JSON.', 'RECORDING_DATA'); }
        if (!saved || saved.schemaVersion !== 1 || !Array.isArray(saved.jobs) || saved.jobs.length > MAX_JOBS) {
            throw failure('Das Format der gespeicherten Aufnahmeaufträge wird nicht unterstützt.', 'RECORDING_DATA');
        }
        const ids = new Set();
        const keys = new Set();
        try {
            const jobs = saved.jobs.map(input => {
                const job = { ...selection(input, this.now(), true),
                    id: text(input.id, 'Auftragskennung', 80),
                    key: input.key, status: input.status,
                    createdAt: timestamp(input.createdAt, 'Erstellungszeit'),
                    updatedAt: timestamp(input.updatedAt, 'Änderungszeit'),
                    attempts: input.attempts,
                    sentAt: timestamp(input.sentAt, 'Versandzeit', true),
                    acknowledgedAt: timestamp(input.acknowledgedAt, 'Antwortzeit', true),
                    confirmedAt: timestamp(input.confirmedAt, 'Bestätigungszeit', true),
                    lastCheckedAt: timestamp(input.lastCheckedAt, 'Prüfzeit', true),
                    timerId: text(input.timerId, 'TV-Timerkennung', 2048, { optional: true }),
                    lastError: text(input.lastError, 'Fehlerbeschreibung', 2000, { optional: true }),
                    failureCode: text(input.failureCode, 'Fehlerkennung', 80, { optional: true }),
                };
                if (!/^[A-Za-z0-9_-]{1,80}$/u.test(job.id) || ids.has(job.id) || keys.has(job.key)
                    || job.key !== keyOf(job) || !STATES.has(job.status) || ![0, 1].includes(job.attempts)
                    || (UNSENT.has(job.status) && (job.attempts !== 0 || job.sentAt !== null))
                    || (job.status === 'sending' && (job.attempts !== 1 || job.sentAt === null))) {
                    throw failure('Widersprüchlicher Aufnahmeauftrag.', 'RECORDING_INVALID');
                }
                ids.add(job.id); keys.add(job.key);
                return job;
            });
            return { jobs, updatedAt: timestamp(saved.updatedAt, 'Speicherzeit') };
        } catch { throw failure('Gespeicherte Aufnahmeaufträge sind beschädigt und werden nicht überschrieben.', 'RECORDING_DATA'); }
    }

    start() {
        if (this._startPromise) return this._startPromise;
        if (this.stopped) return Promise.reject(failure('Aufnahmeverwaltung wurde beendet.', 'CLOSED'));
        this.started = true;
        this._startPromise = (async () => {
            try {
                const restored = this._restore(await this._bounded(() => this.load(), 2000, 'RECORDING_DATABASE'));
                this._check({ ready: false });
                this.jobs = restored.jobs;
                this.updatedAt = restored.updatedAt;
                const next = clone(this.jobs);
                for (const job of next) {
                    if (job.status === 'sending') {
                        this._change(job, 'uncertain', 'Der Adapter wurde während des Versands beendet. Die TV-Timerliste muss den Auftrag bestätigen.', 'RECORDING_UNCERTAIN');
                    }
                }
                this._localChanges(next);
                if (JSON.stringify(next) !== JSON.stringify(this.jobs)) await this._persist(next);
                this._check({ ready: false });
                this.ready = true;
                this._kick(0);
                return this.snapshot();
            } catch (error) {
                if (this._active() && !this.lastError) this._freeze(error);
                throw error;
            }
        })();
        return this._startPromise;
    }

    _change(job, status, reason = '', code = '') {
        job.status = status;
        job.updatedAt = Math.max(job.updatedAt, this.now());
        job.lastError = reason ? message({ message: reason }).slice(0, 600) : '';
        job.failureCode = code;
    }
    _localChanges(jobs) {
        const now = this.now();
        const device = this.deviceKey();
        for (const job of jobs) {
            if (!UNSENT.has(job.status)) continue;
            if (job.programme.start <= now) this._change(job, 'missed', 'Der Fernseher konnte vor Sendungsbeginn keinen Aufnahmeauftrag erhalten.', 'RECORDING_MISSED');
            else if (job.deviceKey !== device) {
                if (job.status !== 'blockedDevice') this._change(job, 'blockedDevice', 'Der Auftrag gehört zu einem anderen Fernseher. Er wartet auf die ursprüngliche TV-Konfiguration.', 'RECORDING_DEVICE');
            } else if (job.status === 'blockedDevice') this._change(job, 'queued');
        }
        // Keep all future or potentially active jobs. Expired history may only be
        // removed after a week; its programmes can no longer be submitted again.
        for (let index = jobs.length - 1; index >= 0; index--) {
            const job = jobs[index];
            if (!UNSENT.has(job.status) && job.status !== 'sending'
                && now - job.programme.end > HISTORY_MS && now - job.updatedAt > HISTORY_MS) jobs.splice(index, 1);
        }
    }
    _mutate(transform) {
        try { this._check(); } catch (error) { return Promise.reject(error); }
        if (this._pendingMutations >= 20) return Promise.reject(failure('Aufnahmeverwaltung ist beschäftigt.', 'RECORDING_BUSY'));
        this._pendingMutations++;
        const operation = this._mutationTail.catch(() => undefined).then(async () => {
            this._check();
            const jobs = clone(this.jobs);
            const result = transform(jobs);
            if (JSON.stringify(jobs) !== JSON.stringify(this.jobs)) await this._persist(jobs);
            this._check();
            return result;
        });
        this._mutationTail = operation;
        return operation.finally(() => { this._pendingMutations--; });
    }
    async enqueue(input) {
        this._check();
        const value = selection(input, this.now());
        if (value.deviceKey !== this.deviceKey()) throw failure('Die TV-Konfiguration wurde geändert. Bitte die Programmübersicht neu laden.', 'RECORDING_DEVICE');
        const key = keyOf(value);
        const id = await this._mutate(jobs => {
            this._localChanges(jobs);
            selection(value, this.now());
            if (value.deviceKey !== this.deviceKey()) throw failure('Die TV-Konfiguration wurde geändert.', 'RECORDING_DEVICE');
            const existing = jobs.find(job => job.key === key);
            if (existing && existing.status !== 'cancelled') return existing.id;
            if (existing) jobs.splice(jobs.indexOf(existing), 1);
            if (jobs.length >= MAX_JOBS) throw failure(`Es sind bereits ${MAX_JOBS} Aufnahmeaufträge gespeichert.`, 'RECORDING_LIMIT');
            const job = { ...value, id: randomUUID(), key, status: 'queued', createdAt: this.now(), updatedAt: this.now(),
                attempts: 0, sentAt: null, acknowledgedAt: null, confirmedAt: null, lastCheckedAt: null,
                timerId: '', lastError: '', failureCode: '' };
            jobs.push(job);
            // Reserve room for later diagnostics and a returned timer ID. A
            // full journal must never prevent recording the uncertain outcome
            // of an already transmitted ProgramTimer request.
            if (Buffer.byteLength(JSON.stringify(jobs)) + jobs.length * 3500 + 256 > MAX_JOURNAL_BYTES) {
                throw failure('Der Speicher für Aufnahmeaufträge ist voll.', 'RECORDING_LIMIT');
            }
            return job.id;
        });
        this._kick(0, true);
        return this._job(this.jobs.find(job => job.id === id));
    }
    async cancelQueued(id) {
        this._check();
        if (typeof id !== 'string') throw failure('Auftragskennung fehlt.', 'RECORDING_INVALID');
        await this._mutate(jobs => {
            const job = jobs.find(item => item.id === id);
            if (!job) throw failure('Aufnahmeauftrag wurde nicht gefunden.', 'RECORDING_NOT_FOUND');
            if (job.status === 'cancelled') return;
            if (!UNSENT.has(job.status) || job.attempts !== 0) throw failure('Dieser Auftrag wurde bereits an den Fernseher übergeben. Bitte den Timer am Fernseher verwalten.', 'RECORDING_ALREADY_SENT');
            this._change(job, 'cancelled');
        });
        this._scheduleNext();
        return this._job(this.jobs.find(job => job.id === id));
    }

    // Connection changes may originate inside the serial transport. Never await
    // another queue operation there; wake the independent worker asynchronously.
    connected() { if (this.ready && this._active()) this._kick(0); }
    _eligible(job) {
        return job.deviceKey === this.deviceKey() && (UNSENT.has(job.status)
            || ((job.status === 'uncertain' || job.status === 'sending') && this.now() <= job.programme.end + RECONCILE_AFTER_END_MS));
    }
    _pending() { return this.jobs.some(job => UNSENT.has(job.status) || this._eligible(job)); }
    _kick(delay, userAction = false) {
        if (!this.ready || !this._active() || !this._pending()) return;
        if (this._workPromise) { if (userAction) this._wakeRequested = true; return; }
        const at = this.now() + delay;
        if (this._wakeTimer !== null && this._wakeAt <= at) return;
        this._clearWake();
        this._wakeAt = at;
        this._wakeTimer = this.scheduleTimer(() => {
            this._wakeTimer = null;
            this._wakeAt = 0;
            if (!this.ready || !this._active()) return;
            this._workPromise = this._work().catch(error => {
                if (this._active() && this.ready) this._report(error);
            }).finally(() => {
                this._workPromise = null;
                if (this._wakeRequested) { this._wakeRequested = false; this._kick(0); }
                else this._scheduleNext();
            });
        }, delay);
    }
    _scheduleNext() {
        this._clearWake();
        if (!this.ready || !this._active() || !this._pending()) return;
        let delay = this._batchRemaining ? 1000 : RETRY_MS;
        this._batchRemaining = false;
        for (const job of this.jobs) {
            if (UNSENT.has(job.status)) delay = Math.min(delay, Math.max(0, job.programme.start - this.now()));
        }
        this._kick(delay);
    }

    async _update(id, apply) {
        return this._mutate(jobs => {
            const job = jobs.find(item => item.id === id);
            if (job) apply(job);
        });
    }
    async _readTimers(device) {
        try {
            const result = await this._bounded(context => this.listTimers({ ...context, deviceKey: device,
                canRun: () => context.canRun() && this.deviceKey() === device }), 5000);
            if (this.deviceKey() !== device) throw failure('Die TV-Konfiguration wurde geändert.', 'RECORDING_DEVICE');
            if (!result || !Array.isArray(result.timers) || result.timers.length > 2000) {
                return { list: null, error: failure('Die TV-Timerliste konnte nicht eindeutig ausgewertet werden.', 'RECORDING_TIMER_LIST') };
            }
            return { list: result, error: null };
        } catch (error) { return { list: null, error }; }
    }
    async _reconcile(list, ids) {
        await this._mutate(jobs => {
            for (const job of jobs) {
                if (!ids.has(job.id) || !this._eligible(job)) continue;
                const matches = list?.timers.filter(timer => matchesTimer(job, timer)) || [];
                const complete = list?.recognized === true && list.complete === true && list.comparable === true;
                if (complete && matches.length === 1) {
                    this._change(job, 'scheduled');
                    job.confirmedAt = this.now();
                    job.timerId = String(matches[0].id).slice(0, 512);
                    job.lastCheckedAt = this.now();
                } else if (matches.length || job.status === 'uncertain' || job.status === 'sending') {
                    this._change(job, 'uncertain', matches.length > 1 ? 'Mehrere TV-Timer passen zu diesem Auftrag. Bitte die Timerliste am Fernseher prüfen.'
                        : !complete ? 'Die TV-Timerliste ist nicht vollständig vergleichbar. Der Auftrag wird nicht erneut gesendet.'
                            : 'Ein passender Timer wurde noch nicht bestätigt. Der Auftrag wird nicht erneut gesendet.', 'RECORDING_UNCERTAIN');
                    job.lastCheckedAt = this.now();
                }
            }
        });
    }
    async _offline(error) {
        await this._mutate(jobs => {
            for (const job of jobs) {
                if (!this._eligible(job)) continue;
                if (UNSENT.has(job.status)) this._change(job, 'queued', `Wartet auf den Fernseher. ${message(error)}`, 'RECORDING_OFFLINE');
                else this._change(job, 'uncertain', `TV-Bestätigung steht aus. ${message(error)}`, 'RECORDING_UNCERTAIN');
                job.lastCheckedAt = this.now();
            }
            this._localChanges(jobs);
        });
    }

    async _work() {
        this._check();
        const device = this.deviceKey();
        await this._mutate(jobs => this._localChanges(jobs));
        if (!this.jobs.some(job => this._eligible(job))) return;
        if (!this.isConnected()) {
            try {
                const online = await this._bounded(context => this.probe({ ...context, deviceKey: device,
                    canRun: () => context.canRun() && this.deviceKey() === device }), 5000);
                this._check();
                if (this.deviceKey() !== device) return;
                if (online !== true) throw failure('Fernseher ist nicht erreichbar.', 'NETWORK');
            } catch (error) {
                this._check();
                await this._offline(error);
                return;
            }
        }
        let read = await this._readTimers(device);
        this._check();
        if (this.deviceKey() !== device) return;
        if (read.error && NETWORK_ERRORS.has(read.error.code)) { await this._offline(read.error); return; }
        await this._reconcile(read.list, new Set(this.jobs.filter(job => this._eligible(job)).map(job => job.id)));
        let submitted = 0;
        const ids = this.jobs.filter(job => job.status === 'queued' && job.deviceKey === this.deviceKey()).map(job => job.id);
        for (const id of ids.slice(0, MAX_BATCH)) {
            this._check();
            if (this.deviceKey() !== device) return;
            await this._mutate(jobs => this._localChanges(jobs));
            let job = this.jobs.find(item => item.id === id);
            if (!job || job.status !== 'queued' || job.deviceKey !== this.deviceKey()) continue;
            // Recheck a newer list after the previous submission before writing.
            await this._reconcile(read.list, new Set([id]));
            job = this.jobs.find(item => item.id === id);
            if (!job || job.status !== 'queued') continue;
            await this._update(id, current => {
                if (current.status !== 'queued') return;
                this._change(current, 'sending');
                current.attempts = 1;
                current.sentAt = this.now();
            });
            job = this.jobs.find(item => item.id === id);
            if (!job || job.status !== 'sending') continue;
            const canSend = () => this.ready && this._active() && job.deviceKey === this.deviceKey()
                && this.now() < job.programme.start && this.jobs.find(item => item.id === id)?.status === 'sending';
            if (!canSend()) { await this._notSent(id, failure('Sendungsbeginn oder TV-Konfiguration hat sich geändert.', 'RECORDING_TIME')); continue; }
            let receipt;
            let sendError = null;
            try {
                receipt = await this._bounded(context => this.send(this._job(job), {
                    ...context, deadline: Math.min(context.deadline, job.programme.start),
                    canSend: () => context.canRun() && canSend(),
                }), Math.min(10000, Math.max(1, job.programme.start - this.now())));
            } catch (error) { sendError = error; }
            this._check();
            submitted++;
            if (sendError?.recordingNotSent === true) { await this._notSent(id, sendError); continue; }
            await this._update(id, current => {
                if (sendError?.recordingRejected === true) this._change(current, 'rejected', message(sendError), 'RECORDING_REJECTED');
                else this._change(current, 'uncertain', sendError ? `Versand nicht eindeutig bestätigt. ${message(sendError)}`
                    : 'TV-Antwort erhalten. Eine eindeutige Bestätigung in der Timerliste steht noch aus.', 'RECORDING_UNCERTAIN');
                if (!sendError && receipt?.acknowledged === true) current.acknowledgedAt = this.now();
            });
            if (this.jobs.find(item => item.id === id)?.status !== 'uncertain') continue;
            read = await this._readTimers(device);
            this._check();
            if (this.deviceKey() !== device) return;
            await this._reconcile(read.list, new Set([id]));
            if (read.error && NETWORK_ERRORS.has(read.error.code)) { await this._offline(read.error); return; }
        }
        if (submitted === MAX_BATCH && this.jobs.some(job => job.status === 'queued' && job.deviceKey === this.deviceKey())) {
            // One bounded batch gives the existing transport time for remote and
            // EPG requests. Continue only after a real delay, never a busy loop.
            this._wakeRequested = false;
            this._clearWake();
            // finally() schedules the next pass; its regular delay is shortened.
            this._batchRemaining = true;
        }
    }
    async _notSent(id, error) {
        await this._update(id, job => {
            job.attempts = 0;
            job.sentAt = null;
            if (job.programme.start <= this.now()) this._change(job, 'missed', 'Der Aufnahmeauftrag konnte vor Sendungsbeginn nicht übertragen werden.', 'RECORDING_MISSED');
            else if (job.deviceKey !== this.deviceKey()) this._change(job, 'blockedDevice', 'Der Auftrag wartet auf die ursprüngliche TV-Konfiguration.', 'RECORDING_DEVICE');
            else if (error.sessionInvalid === true || RETRYABLE_NOT_SENT.has(error.code)) this._change(job, 'queued', message(error), 'RECORDING_OFFLINE');
            else this._change(job, 'rejected', message(error), 'RECORDING_REJECTED');
        });
    }
    stop() {
        if (this.stopped) return;
        this.stopped = true;
        this.ready = false;
        this._clearWake();
        for (const cancel of [...this._waiting]) cancel();
        this._wakeRequested = false;
    }
}

module.exports = { RecordingManager, matchesTimer, MAX_JOBS, MAX_JOURNAL_BYTES, RETRY_MS, HISTORY_MS };
