'use strict';

const { setImmediate: nextTurn } = require('node:timers/promises');
const { ProtocolError } = require('./loewe-client');
const { serviceIdentity } = require('./channel-catalog');
const { createEpgDefinitions } = require('./epg-states');
const { LoeweEpgSource } = require('./epg-loewe');
const { createCache, restoreCache, selectNowNext, MAX_CACHE_AGE } = require('./epg-data');
const { createEpgGuide, resolveEpgProgramme } = require('./epg-guide');

const BATCH_SIZE = 64;
const BATCH_TIME = 90000;
const CACHE_BUDGET = 16 * 1024 * 1024;
const INITIALIZATION_RETRY_MS = 30000;
const NETWORK_ERRORS = new Set(['NETWORK', 'HTTP', 'INVALID_RESPONSE']);

function failure(message, code = 'EPG_ERROR') { return new ProtocolError(message, code); }
function errorText(error) {
    // Transport errors must never disclose credentials or URL queries.
    return `${error?.code || 'EPG_ERROR'}: ${error?.message || 'Programmdaten konnten nicht gelesen werden.'}`
        .replace(/https?:\/\/[^\s<>"']+/giu, '[URL]').slice(0, 1500);
}

function diagnosticDetail(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
        // The TV source builds metadata only. Copy it so later source activity
        // cannot change a previously published attempt; do not retain responses.
        const serialized = JSON.stringify(value);
        return Buffer.byteLength(serialized) <= 8192 ? JSON.parse(serialized) : { omitted: true, reason: 'size' };
    } catch { return { omitted: true, reason: 'format' }; }
}

function diagnosticCode(error) {
    return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(error.code) ? error.code : 'EPG_ERROR';
}

/** Owns programme clocks and TV scheduling; channel ownership stays with ChannelObjects. */
class EpgManager {
    constructor(runtime, { now = Date.now, tvSource } = {}) {
        this.runtime = runtime;
        this.adapter = runtime.adapter;
        this.now = now;
        this.tvSource = tvSource || new LoeweEpgSource({ request: (...args) => this._soap(...args) });
        this.entries = new Map();
        this.retired = new Map();
        this.started = false;
        this.stopped = false;
        this._initialization = Promise.resolve();
        this._fetchPromise = null;
        this._fetchTimer = null;
        this._clockTimer = null;
        this._clockPromise = null;
        this._cycle = null;
        this._requestContext = null;
        this._abort = new AbortController();
        this._needsRefresh = false;
    }

    get config() { return this.runtime.config || {}; }

    /** Admin reads a RAM snapshot; opening or scrolling the guide never fetches the TV. */
    guide(query = {}) {
        return createEpgGuide(this._guideContext(), query);
    }

    selection(query) {
        return resolveEpgProgramme(this._guideContext(), query);
    }

    _guideContext() {
        const values = this.runtime._lastValues;
        let progress = this._cycle;
        if (!progress) {
            const saved = values?.get('channels.epgProgress');
            if (typeof saved === 'string' && Buffer.byteLength(saved) <= 1024) {
                try { progress = JSON.parse(saved); } catch { /* A missing progress record is harmless. */ }
            }
        }
        const listView = this.config.channelListView || '';
        const catalog = this.runtime.channelObjects?.catalog;
        return {
            now: this.now(), instance: this.adapter.namespace || '', listView,
            deviceKey: JSON.stringify([this.config.host || '', this.config.port ?? 905]),
            listName: catalog?.view === listView ? catalog.name || '' : '',
            running: this._running(), enabled: this.config.epgEnabled === true,
            connected: this.runtime._connected === true, refreshing: Boolean(this._fetchPromise || this._cycle),
            services: this.runtime.channelObjects?.services, entries: this.entries,
            validEntry: entry => this._valid(entry), progress,
            status: values?.get('channels.epgStatus'), lastUpdate: values?.get('channels.epgLastUpdate'),
            lastError: values?.get('channels.epgLastError'),
        };
    }

    _running() { return this.started && !this.stopped && !this.runtime.stopping; }
    _valid(entry) {
        if (!this._running() || !entry || entry.obsolete || this.entries.get(entry.service.id) !== entry
            || entry.service.listView !== this.config.channelListView) return false;
        const current = this.runtime.channelObjects.services?.get(entry.service.id);
        return Boolean(current && current.itemClass === 'video' && serviceIdentity(current) === entry.identity);
    }
    _registered(entry, suffix) {
        return this._valid(entry) && this.runtime._objects.get(`${entry.service.id}.${suffix}`)?.type === 'state';
    }
    _timer(name, callback, delay) {
        if (!this._running() || this[name] !== null) return;
        const set = this.adapter.setTimeout?.bind(this.adapter) || setTimeout;
        this[name] = set(() => { this[name] = null; callback(); }, delay);
    }
    _clear(name) {
        if (this[name] === null) return;
        (this.adapter.clearTimeout?.bind(this.adapter) || clearTimeout)(this[name]);
        this[name] = null;
    }
    async _global(id, value) {
        if (this._running()) await this.runtime._writeChanged(`channels.${id}`, value);
    }
    _background(promise) {
        void promise.catch(error => {
            if (this._running()) this.runtime._logError(failure(errorText(error), 'EPG_ERROR'));
        });
    }

    async start() {
        if (this.started || this.stopped) return;
        this.started = true;
        await this._global('epgStatus', !this.config.epgEnabled ? 'disabled'
            : !this.config.channelListView ? 'notConfigured' : 'waiting');
        await this._global('epgLastError', '');
        await this._global('epgLastUpdate', 0);
        await this._global('epgProgress', JSON.stringify({ completed: 0, total: 0 }));
    }

    async _drain(entry) {
        if (!entry) return;
        await entry.publishTail.catch(() => undefined);
        // A database timeout does not cancel the actual write. A replacement
        // channel must wait for these promises, even after the caller timed out.
        await Promise.allSettled([...entry.writes]);
    }

    async prepareCatalog(services) {
        if (!this._running()) return;
        const wanted = new Map(services.filter(service => service.itemClass === 'video'
            && service.listView === this.config.channelListView).map(service => [service.id, service]));
        const drains = [];
        for (const [id, entry] of this.entries) {
            const service = wanted.get(id);
            if (!service || serviceIdentity(service) !== entry.identity) {
                entry.obsolete = true;
                this.entries.delete(id);
                this.retired.set(id, entry);
                drains.push(this._drain(entry));
            } else entry.service = service;
        }
        for (const [id, service] of wanted) {
            if (!this.entries.has(id)) {
                this.entries.set(id, { service, identity: serviceIdentity(service), obsolete: false,
                    initialized: false, cache: null, error: null, attempted: false, tvDiagnostic: null,
                    values: new Map(), writes: new Set(), publishTail: Promise.resolve() });
                this._needsRefresh = true;
            }
        }
        await Promise.all(drains);
        for (const entry of this.entries.values()) {
            if (entry.cache) {
                try { entry.cache = this._cache(entry, entry.cache, entry.cache.fetchedAt); }
                catch (error) { entry.cache = null; entry.error = error; }
            }
        }
        // Changed identities sharing an ID are new entries and never reuse the
        // predecessor's programme cache, including late source responses.
        for (const id of wanted.keys()) this.retired.delete(id);
    }

    catalogReady() {
        if (!this._running()) return;
        this._initialization = this._initialization.catch(() => undefined).then(async () => {
            let count = 0;
            for (const entry of this.entries.values()) {
                if (!this._valid(entry) || !this.runtime._objects.has(`${entry.service.id}.epg.data`)) continue;
                if (!entry.initialized) {
                    const saved = await this.runtime._readState(`${entry.service.id}.epg.cache`);
                    if (!this._valid(entry)) continue;
                    const restored = restoreCache(saved?.val, entry.service, this.now());
                    if (restored) {
                        try { entry.cache = this._cache(entry, restored, restored.fetchedAt); }
                        catch (error) { entry.cache = null; entry.error = error; }
                    }
                    entry.initialized = true;
                    await this._publish(entry, true);
                } else await this._publish(entry, true);
                if (++count % 16 === 0) await nextTurn();
            }
            if (!this._running()) return;
            if ([...this.entries.values()].some(entry => entry.initialized && !entry.attempted
                && entry.service.available !== false)) this._needsRefresh = true;
            this._scheduleClock();
            if (this.config.epgEnabled && this.config.epgRefreshInterval > 0 && !this._fetchPromise) {
                if (this._needsRefresh) this._clear('_fetchTimer');
                this._scheduleFetch(this._needsRefresh ? 1000 : this.config.epgRefreshInterval * 1000);
            }
        });
        this._background(this._initialization.catch(error => {
            // An initial database failure must not leave automatic EPG asleep
            // until the next channel-list refresh. Manual-only stays manual.
            if (this._running() && this.config.epgEnabled && this.config.epgRefreshInterval > 0 && !this._fetchPromise) {
                this._clear('_fetchTimer');
                this._scheduleFetch(INITIALIZATION_RETRY_MS);
            }
            throw error;
        }));
    }

    async retire(id, { retain = false } = {}) {
        const entry = this.entries.get(id) || this.retired.get(id);
        if (entry) {
            entry.obsolete = true;
            this.entries.delete(id);
            await this._drain(entry);
        }
        this.retired.delete(id);
        if (!retain || !this._running()) return;
        // Protected folders may contain user children. Clear only existing,
        // adapter-owned EPG states; do not recreate deleted children.
        for (const definition of createEpgDefinitions(id).filter(item => item.type === 'state')) {
            if (!this._running() || this.entries.has(id)) return;
            const object = await this.runtime._database(() => this.adapter.getObjectAsync(definition.id), definition.id);
            if (!object || object.type !== 'state' || object.native?.managedBy !== 'loewe-tv-channel-catalog') continue;
            const val = definition.id.endsWith('.epg.status') ? 'inactive' : definition.common.def;
            if (!this._running() || this.entries.has(id)) return;
            // Await the actual operation: cleanup must not overtake a late write.
            await this.adapter.setStateAsync(definition.id, { val, ack: true });
            this.runtime._lastValues.set(definition.id, val);
        }
    }

    _cache(entry, result, fetchedAt = this.now()) {
        const limit = Math.max(8192, Math.min(128 * 1024, Math.floor(CACHE_BUDGET / Math.max(1, this.entries.size))));
        return { ...createCache(entry.service, result, this.now(), limit), fetchedAt };
    }

    async _state(entry, suffix, val) {
        if (!this._registered(entry, suffix) || entry.values.get(suffix) === val) return;
        const id = `${entry.service.id}.${suffix}`;
        const written = await this.runtime._database(async () => {
            if (!this._registered(entry, suffix)) return false;
            const pending = Promise.resolve(this.adapter.setStateAsync(id, { val, ack: true }));
            entry.writes.add(pending);
            void pending.finally(() => entry.writes.delete(pending)).catch(() => undefined);
            await pending;
            return true;
        }, id);
        if (written && this._valid(entry)) {
            entry.values.set(suffix, val);
            this.runtime._lastValues.set(id, val);
        }
    }

    _snapshot(entry) {
        const now = this.now();
        const expired = entry.cache && now - entry.cache.fetchedAt > MAX_CACHE_AGE;
        const cache = expired ? null : entry.cache;
        const enabled = this.config.epgEnabled && entry.service.available !== false;
        const selected = enabled && cache ? selectNowNext(cache.events, now) : { now: null, next: null, ambiguous: false };
        let status;
        if (!this.config.epgEnabled) status = 'disabled';
        else if (entry.service.available === false) status = 'inactive';
        else if (expired) status = 'stale';
        else if (selected.ambiguous) status = 'partial';
        else if (selected.now || selected.next) status = entry.error ? 'cached'
            : selected.now && selected.next ? 'ready' : 'partial';
        else if (entry.error) status = entry.error.code === 'EPG_TV_UNSUPPORTED' ? 'unsupported' : 'error';
        else status = cache ? 'empty' : 'waiting';
        const lastError = entry.error ? errorText(entry.error) : selected.ambiguous
            ? 'EPG_AMBIGUOUS: Überschneidende oder mehrdeutige Sendungen werden nicht als eindeutig angezeigt.' : '';
        return { schemaVersion: 2, channel: { id: entry.service.id, name: entry.service.name,
            mediaItemUuid: entry.service.mediaItemUuid, listView: entry.service.listView },
        status,
        lastUpdate: entry.cache?.fetchedAt || 0, lastError, now: selected.now, next: selected.next,
        tvDiagnostic: entry.tvDiagnostic || null };
    }

    _publish(entry, includeCache = false) {
        const operation = async () => {
            // Serialize against timed-out but still running database writes,
            // also when the channel identity itself has not changed.
            await Promise.allSettled([...entry.writes]);
            if (!this._valid(entry)) return;
            const snapshot = this._snapshot(entry);
            const values = { 'epg.status': snapshot.status, 'epg.lastUpdate': snapshot.lastUpdate,
                'epg.lastError': snapshot.lastError };
            for (const slot of ['now', 'next']) {
                const event = snapshot[slot];
                values[`epg.${slot}.available`] = Boolean(event);
                for (const key of ['title', 'subtitle', 'description', 'eventId']) values[`epg.${slot}.${key}`] = event?.[key] || '';
                values[`epg.${slot}.start`] = event?.start || 0;
                values[`epg.${slot}.end`] = event?.end || 0;
            }
            if (includeCache) values['epg.cache'] = entry.cache ? JSON.stringify(entry.cache) : '{}';
            const pairs = Object.entries(values);
            for (let i = 0; i < pairs.length; i += 4) {
                await Promise.all(pairs.slice(i, i + 4).map(([suffix, value]) => this._state(entry, suffix, value)));
            }
            // A single complete value is the subscription point for automations.
            await this._state(entry, 'epg.data', JSON.stringify(snapshot));
        };
        const pending = entry.publishTail.then(operation, operation);
        entry.publishTail = pending.catch(() => undefined);
        return pending;
    }

    _scheduleClock() {
        if (!this._running() || !this.config.epgEnabled || !this.entries.size || this._clockPromise) return;
        this._clear('_clockTimer');
        const now = this.now();
        let delay = 60000;
        for (const entry of this.entries.values()) {
            for (const event of entry.cache?.events || []) {
                for (const time of [event.start, event.end]) if (time > now) delay = Math.min(delay, time - now + 10);
            }
        }
        this._timer('_clockTimer', () => this._background(this.tick()), Math.max(25, delay));
    }

    tick() {
        if (this._clockPromise) return this._clockPromise;
        const run = async () => {
            let count = 0;
            for (const entry of this.entries.values()) {
                if (!this._running()) return;
                await this._publish(entry);
                if (++count % 16 === 0) await nextTurn();
            }
        };
        this._clockPromise = run().finally(() => { this._clockPromise = null; this._scheduleClock(); });
        return this._clockPromise;
    }

    _scheduleFetch(delay) {
        if (!this.config.epgEnabled || !this.entries.size) return;
        this._timer('_fetchTimer', () => this._background(this.refresh({ continuation: Boolean(this._cycle) })), delay);
    }

    connected() {
        if (!this._running() || !this.config.epgEnabled) return;
        // A first successful EPG request also reports a connection. Resetting
        // its own active iterator here would abort the request it just made.
        if (this._fetchPromise) {
            if (this._cycle?.tvBlocked && NETWORK_ERRORS.has(this._cycle.tvBlocked.code)) this._cycle.tvBlocked = null;
            return;
        }
        this.tvSource.reset?.();
        if (this.config.epgRefreshInterval > 0) {
            this._needsRefresh = true;
            this._clear('_fetchTimer');
            this._scheduleFetch(1000);
        }
    }

    async _soap(action, parameters, options) {
        const entry = this._requestContext;
        if (!this._valid(entry) || this._abort.signal.aborted) throw failure('Sender wurde geändert.', 'CLOSED');
        let result;
        let error;
        const accepted = await this.runtime._enqueue('channels.epg.read', async () => {
            if (!this._valid(entry) || this._abort.signal.aborted) {
                error = failure('Sender wurde geändert.', 'CLOSED');
                return;
            }
            try { result = await this.runtime._call('request', action, parameters, options); }
            catch (caught) {
                error = caught;
                // Protocol capability errors belong to this channel's EPG.
                // Real TV transport/session failures still affect connection.
                if (NETWORK_ERRORS.has(caught.code) || caught.sessionInvalid) throw caught;
            }
        });
        if (error) throw error;
        if (!accepted) throw failure('EPG-Abfrage konnte nicht in der TV-Warteschlange ausgeführt werden.', 'EPG_QUEUE');
        if (!this._valid(entry)) throw failure('Sender wurde während des EPG-Abrufs geändert.', 'CLOSED');
        return result;
    }

    async _tv(entry, cycle, deadline) {
        const at = this.now();
        if (cycle.tvBlocked) {
            entry.tvDiagnostic = { at, status: 'skipped', reason: 'previousFailure',
                code: diagnosticCode(cycle.tvBlocked), blockedByChannel: cycle.tvBlockedChannel };
            throw cycle.tvBlocked;
        }
        if (!this.runtime.client) {
            entry.tvDiagnostic = { at, status: 'skipped', reason: 'notConfigured', code: 'EPG_TV_UNAVAILABLE' };
            throw failure('Der Fernseher ist noch nicht konfiguriert.', 'EPG_TV_UNAVAILABLE');
        }
        this._requestContext = entry;
        try {
            const result = await this.tvSource.read(entry.service, { now: at, deadline, signal: this._abort.signal });
            if (this._valid(entry)) entry.tvDiagnostic = { at, status: 'received', details: diagnosticDetail(result.diagnostic) };
            return result;
        } catch (error) {
            if (this._valid(entry)) entry.tvDiagnostic = { at, status: 'error', code: diagnosticCode(error),
                details: diagnosticDetail(error.epgDiagnostic) };
            if (NETWORK_ERRORS.has(error.code) || error.sessionInvalid || ['EPG_TV_SCHEMA', 'SOAP'].includes(error.code)) {
                cycle.tvBlocked = error;
                cycle.tvBlockedChannel = entry.service.id;
            }
            throw error;
        } finally { this._requestContext = null; }
    }

    async _read(entry, cycle, deadline) {
        let result;
        let readError;
        try { result = this._cache(entry, await this._tv(entry, cycle, deadline)); }
        catch (error) { readError = error; }
        if (!this._valid(entry)) return;
        entry.attempted = true;
        if (result) {
            entry.cache = result;
            entry.error = null;
            cycle.successful++;
        } else {
            entry.error = readError || failure('Keine Programmdaten verfügbar.');
            cycle.failed++;
        }
        if (entry.error && !cycle.firstError) cycle.firstError = errorText(entry.error);
        await this._publish(entry, Boolean(result));
    }

    refresh({ manual = false, continuation = false } = {}) {
        if (this._fetchPromise) return this._fetchPromise;
        this._clear('_fetchTimer');
        let initializationFailed = false;
        const run = async () => {
            try { await this._initialization; }
            catch {
                // Retry initialization once in this refresh. Swallowing the old
                // rejection alone would leave entries initialized=false forever.
                initializationFailed = true;
                if (!this._running()) return;
                this.catalogReady();
                await this._initialization;
                initializationFailed = false;
            }
            if (!this._running()) return;
            if (!this.config.epgEnabled) { await this._global('epgStatus', 'disabled'); return; }
            if (!this.config.channelListView) { await this._global('epgStatus', 'notConfigured'); return; }
            if (!manual && !continuation && this.config.epgRefreshInterval === 0) return;
            if (!continuation || !this._cycle) {
                // Preserve the discovered field schema across periodic runs.
                // An explicit refresh can probe capabilities again.
                if (manual) this.tvSource.reset?.();
                const entries = [...this.entries.values()].filter(entry => this._valid(entry)
                    && entry.initialized && entry.service.available !== false);
                this._cycle = { entries, total: entries.length, completed: 0, successful: 0, failed: 0,
                    firstError: '', tvBlocked: null };
                this._needsRefresh = false;
            }
            const cycle = this._cycle;
            const deadline = Date.now() + BATCH_TIME;
            await this._global('epgStatus', 'updating');
            for (let count = 0; cycle.entries.length && count < BATCH_SIZE && Date.now() < deadline; count++) {
                if (!this._running()) return;
                const entry = cycle.entries.shift();
                if (this._valid(entry) && entry.service.available !== false) await this._read(entry, cycle, deadline);
                cycle.completed++;
                if (cycle.completed % 8 === 0) await this._progress(cycle);
                await nextTurn();
            }
            if (!this._running()) return;
            await this._progress(cycle);
            await this._global('epgLastError', cycle.firstError);
            if (cycle.entries.length) return;
            const status = !cycle.total ? 'empty' : !cycle.failed ? 'ready' : cycle.successful ? 'partial' : 'error';
            await this._global('epgStatus', status);
            if (cycle.successful) await this._global('epgLastUpdate', this.now());
            this._cycle = null;
            this._needsRefresh = [...this.entries.values()].some(entry => entry.initialized && !entry.attempted
                && entry.service.available !== false);
        };
        this._fetchPromise = run().catch(async error => {
            if (this._running()) {
                await this._global('epgStatus', 'error');
                await this._global('epgLastError', errorText(error));
            }
            this._cycle = null;
        }).finally(() => {
            this._fetchPromise = null;
            this._scheduleClock();
            if (this._cycle) this._scheduleFetch(1000);
            else if (this.config.epgRefreshInterval > 0) this._scheduleFetch(initializationFailed ? INITIALIZATION_RETRY_MS
                : this._needsRefresh ? 1000 : this.config.epgRefreshInterval * 1000);
        });
        return this._fetchPromise;
    }

    _progress(cycle) {
        return this._global('epgProgress', JSON.stringify({ completed: cycle.completed, total: cycle.total,
            successful: cycle.successful, failed: cycle.failed }));
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        this._abort.abort();
        this.tvSource.reset?.();
        this._clear('_fetchTimer');
        this._clear('_clockTimer');
        for (const entry of this.entries.values()) entry.obsolete = true;
        this._cycle = null;
    }
}

module.exports = { EpgManager, BATCH_SIZE, BATCH_TIME };
