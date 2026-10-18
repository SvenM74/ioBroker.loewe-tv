'use strict';

const {
    LoeweClient, KEYS, createWolPacket, ProtocolError,
    parseChannelLists, parseZapResult,
} = require('./loewe-client');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { BUILD_ID } = require('./build-info');
const { createDefinitions } = require('./states');
const { runPowerOn } = require('./power-on');
const { ChannelObjects } = require('./channel-objects');
const { ChannelRefresh } = require('./channel-refresh');
const { EpgManager } = require('./epg-manager');
const { discoverTvs } = require('./tv-discovery');

const MAX_QUEUE = 20;
const MAX_QUEUE_AGE_MS = 30000;
const DATABASE_TIMEOUT_MS = 2000;
const CLEANUP_TIMEOUT_MS = 15000;
const MAX_STATE_BYTES = 512 * 1024;
const CHANNEL_LIST_PAGE_SIZE = 500;
const CHANNEL_LIST_MAX_PAGES = 20;
const CHANNEL_LIST_MAX_ITEMS = 2000;
const CHANNEL_LIST_MAX_BYTES = 256 * 1024;
const CHANNEL_LIST_TIMEOUT_MS = 30000;
const TV_DISCOVERY_TIMEOUT_MS = 8000;
// This only recognizes the shape. Registered definitions and the channel
// catalogue authorize the actual target before it enters the TV transport.
const CHANNEL_SELECT_ID = /^channels\.tv\.[A-Za-z0-9_]+\.select$/u;
// These exact, own-instance paths are the features explicitly removed by the
// user. Prefix boundaries keep similarly named folders outside the migration.
const REMOVED_OBJECTS = Object.freeze([
    { id: 'channels.radio', recursive: true },
    { id: 'api', recursive: true },
    { id: 'media', recursive: true },
    { id: 'remote.radio_mode_on', recursive: false },
    { id: 'channels.mediaType', recursive: false },
    ...[
        'info.lastResponse', 'status.volumeRaw',
        'channels.start', 'channels.listStart', 'channels.count',
        'channels.getLists', 'channels.getChannels',
        'channels.lists', 'channels.items', 'channels.entries', 'channels.availableLists',
        'channels.totalNumber', 'channels.returnedNumber', 'channels.nextStart', 'channels.nextListStart',
        'channels.lastUpdate', 'channels.lastError',
    ].map(id => ({ id, recursive: false })),
]);

function removedObject(id) {
    return REMOVED_OBJECTS.some(object => id === object.id
        || (object.recursive && id.startsWith(`${object.id}.`)));
}

function validation(message) {
    return new ProtocolError(message, 'VALIDATION');
}

function discoveryPort(message, fallback = 905) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    const input = message.port === undefined ? fallback : message.port;
    if (typeof input !== 'number' && (typeof input !== 'string' || !/^\d+$/u.test(input))) return null;
    const port = Number(input);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function discoveryText(value) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, 240) : '';
}

function normalizeConfig(input) {
    const integer = (name, fallback, min, max) => {
        const value = Number(input[name] ?? fallback);
        if (!Number.isSafeInteger(value) || value < min || value > max) {
            throw validation(`Konfiguration ${name}: ganze Zahl zwischen ${min} und ${max} erforderlich.`);
        }
        return value;
    };
    const boolean = (name, fallback) => {
        const value = input[name] ?? fallback;
        if (typeof value !== 'boolean') {
            throw validation(`Konfiguration ${name}: true oder false erforderlich.`);
        }
        return value;
    };
    const string = (name, fallback = '') => {
        const value = input[name] ?? fallback;
        if (typeof value !== 'string') {
            throw validation(`Konfiguration ${name}: Text erforderlich.`);
        }
        return value.trim();
    };
    const config = {
        host: string('host'), port: integer('port', 905, 1, 65535),
        pollInterval: integer('pollInterval', 30, 0, 3600),
        channelRefreshInterval: integer('channelRefreshInterval', 300, 0, 86400),
        channelListView: string('channelListView'),
        epgEnabled: boolean('epgEnabled', true),
        epgRefreshInterval: integer('epgRefreshInterval', 900, 0, 86400),
        timeout: integer('timeout', 5000, 1000, 30000),
        maxVolume: integer('maxVolume', 99, 0, 99),
        appendNul: boolean('appendNul', true),
        pollPlayback: boolean('pollPlayback', true),
        macLan: string('macLan'), macWlan: string('macWlan'),
        broadcastAddress: string('broadcastAddress', '255.255.255.255'),
        powerOnTimeout: integer('powerOnTimeout', 60, 5, 120),
    };
    if (config.pollInterval > 0 && config.pollInterval < 5) {
        throw validation('pollInterval muss 0 (aus) oder mindestens 5 Sekunden sein.');
    }
    if (config.channelRefreshInterval > 0 && config.channelRefreshInterval < 60) {
        throw validation('channelRefreshInterval muss 0 (aus) oder mindestens 60 Sekunden sein.');
    }
    if (config.epgRefreshInterval > 0 && config.epgRefreshInterval < 300) {
        throw validation('epgRefreshInterval muss 0 (aus) oder mindestens 300 Sekunden sein.');
    }
    if (Buffer.byteLength(config.channelListView) > 2048 || /[\u0000-\u001f\u007f]/u.test(config.channelListView)) {
        throw validation('channelListView muss eine gültige Senderlistenkennung mit höchstens 2048 Bytes sein.');
    }
    for (const mac of [config.macLan, config.macWlan]) {
        if (mac) createWolPacket(mac);
    }
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(config.broadcastAddress)
        || config.broadcastAddress.split('.').some(part => Number(part) > 255)) {
        throw validation('broadcastAddress muss eine IPv4-Adresse sein.');
    }
    return config;
}

function json(response, limit = MAX_STATE_BYTES) {
    const result = JSON.stringify(response?.data ?? response ?? {});
    const bytes = Buffer.byteLength(result);
    if (bytes <= limit) return result;
    return JSON.stringify({
        omitted: true, bytes, limit,
        reason: 'TV-Antwort zu groß für einen ioBroker-Datenpunkt.',
    });
}

function textValue(value) {
    return typeof value === 'string' ? value : value?.['#text'];
}

function findMac(data, name) {
    const pending = [data];
    while (pending.length) {
        const current = pending.pop();
        if (!current || typeof current !== 'object') continue;
        for (const [key, value] of Object.entries(current)) {
            if (key === name) {
                const candidate = textValue(value);
                try {
                    createWolPacket(candidate);
                    const clean = candidate.trim().replace(/[:-]/g, '').toUpperCase();
                    if (clean !== '000000000000' && clean !== 'FFFFFFFFFFFF') {
                        return clean.match(/.{2}/g).join(':');
                    }
                } catch { /* A missing or invalid TV MAC is not a connection error. */ }
            }
            if (value && typeof value === 'object') pending.push(value);
        }
    }
    return '';
}

class AdapterRuntime {
    constructor(adapter, { clientFactory = options => new LoeweClient(options), powerOnSequence = runPowerOn, epgOptions = {}, tvDiscovery = discoverTvs } = {}) {
        this.adapter = adapter;
        this.clientFactory = clientFactory;
        this.powerOnSequence = powerOnSequence;
        this.tvDiscovery = tvDiscovery;
        this.client = null;
        this.config = null;
        this.stopping = false;
        this._started = false;
        this._tail = Promise.resolve();
        this._pendingCount = 0;
        this._pollPromise = null;
        this._timer = null;
        this._objects = new Map();
        this._lastValues = new Map();
        this._connected = false;
        this._deviceRead = false;
        this._optionalWarnings = new Set();
        this._wakePromise = null;
        this._wakeActive = false;
        this._wakeAbort = null;
        this._powerIntent = 0;
        this._lastLoggedError = '';
        this._listDiscoveryPromise = null;
        this._listDiscoveryCancel = null;
        this._listRefreshRevision = Date.now();
        this._tvDiscoveryPromise = null;
        this._tvDiscoveryAbort = null;
        this._tvDiscoveryResult = null;
        this._tvDiscoveryRevision = Date.now();
        this.channelObjects = new ChannelObjects(this);
        this.channelRefresh = new ChannelRefresh(this);
        this.epg = new EpgManager(this, epgOptions);
    }

    async _database(operation, label, timeout = DATABASE_TIMEOUT_MS) {
        let timer;
        const deadline = new Promise((_, reject) => {
            // Native timer: ioBroker stops accepting adapter timers during unload.
            timer = setTimeout(() => reject(new ProtocolError(
                `ioBroker-Datenbank antwortet nicht rechtzeitig (${label}).`, 'DATABASE',
            )), timeout);
        });
        try {
            return await Promise.race([Promise.resolve().then(operation), deadline]);
        } finally {
            clearTimeout(timer);
        }
    }

    async _write(id, val, timeout = DATABASE_TIMEOUT_MS, condition = () => true) {
        const allowed = () => !removedObject(id) && condition()
            && (!this.stopping || (val === false && ['info.connection', 'info.commandPending'].includes(id)));
        if (!allowed()) return;
        const written = await this._database(async () => {
            // The deadline helper yields once before invoking the DB operation.
            // stop() may have run in that gap, so check again at the actual write.
            if (!allowed()) return false;
            let pending = this.adapter.setStateAsync(id, { val, ack: true });
            if (val === false && CHANNEL_SELECT_ID.test(id)) {
                pending = this.channelObjects.trackButtonReset(id, pending);
            }
            await pending;
            return true;
        }, id, timeout);
        if (written && allowed()) this._lastValues.set(id, val);
    }

    _resetButton(id) {
        // A completed queued selection may refer to a channel that a newer
        // list has removed. Recheck at the actual database call as well.
        const dynamic = CHANNEL_SELECT_ID.test(id);
        return this._write(id, false, DATABASE_TIMEOUT_MS, () => !dynamic || this._objects.has(id));
    }

    async _safeWrite(id, val, timeout = DATABASE_TIMEOUT_MS) {
        try {
            await this._write(id, val, timeout);
        } catch (error) {
            if (!this.stopping) this._logError(error);
        }
    }

    _readState(id) {
        return this._database(() => this.adapter.getStateAsync(id), id);
    }

    _logError(error) {
        const message = `${error.code ? `${error.code}: ` : ''}${error.message || String(error)}`.slice(0, 2000);
        if (message !== this._lastLoggedError) {
            this._lastLoggedError = message;
            this.adapter.log.warn(message);
        }
    }

    async _writeChanged(id, val) {
        if (!this._lastValues.has(id) || this._lastValues.get(id) !== val) {
            await this._write(id, val);
        }
    }

    _checkRunning() {
        if (this.stopping) throw new ProtocolError('Adapter wird beendet.', 'CLOSED');
        if (!this.client) throw validation('Bitte zuerst die TV-Adresse in der Adapterkonfiguration eintragen.');
    }

    async _removeObsoleteObjects() {
        for (const { id, recursive } of REMOVED_OBJECTS) {
            if (this.stopping) return;
            try {
                // delObjectAsync scopes these relative IDs to this instance and
                // treats an absent object as success, including a fresh install.
                await this._database(() => {
                    if (this.stopping) return;
                    return this.adapter.delObjectAsync(id, { recursive });
                }, `Veraltete Datenpunkte ${id} entfernen`, recursive ? CLEANUP_TIMEOUT_MS : DATABASE_TIMEOUT_MS);
            } catch (error) {
                if (this.stopping) return;
                throw new ProtocolError(`Bereinigung von ${this.adapter.namespace}.${id} fehlgeschlagen: `
                    + (error.message || String(error)), 'DATABASE');
            }
        }
        if (this.stopping) return;
        try {
            // Recursive controller deletion can skip protected objects without
            // rejecting. Check the returned own-instance inventory before any
            // client or channel restoration starts; never override protection.
            // The public DB API can itself omit records after internal errors,
            // so this checks its returned inventory, not an independent DB scan.
            const prefix = `${this.adapter.namespace}.`;
            const inventory = await this._database(() => {
                if (this.stopping) return;
                return this.adapter.getObjectListAsync({ startkey: prefix, endkey: `${prefix}\u9999`, include_docs: true });
            }, 'Entfernte Datenpunkte nachprüfen');
            if (this.stopping) return;
            if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory) || !Array.isArray(inventory.rows)) {
                throw new Error('Die Objektdatenbank hat keine gültige Objektliste geliefert.');
            }
            const remaining = [];
            for (const row of inventory.rows) {
                const object = row?.doc ?? row?.value;
                if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string'
                    || !row.id.startsWith(prefix) || row.id.length === prefix.length
                    || !object || typeof object !== 'object' || Array.isArray(object) || typeof object.type !== 'string'
                    || (object._id !== undefined && object._id !== row.id)) {
                    throw new Error('Die Objektdatenbank hat einen ungültigen Eintrag für diese Instanz geliefert.');
                }
                if (removedObject(row.id.slice(prefix.length))) remaining.push(row.id);
            }
            if (remaining.length) {
                throw new Error(`${remaining.length} veraltete Objekte sind noch vorhanden: ${remaining.slice(0, 5).join(', ')}. `
                    + 'Löschschutz und Objektdatenbank prüfen.');
            }
        } catch (error) {
            if (this.stopping) return;
            throw new ProtocolError(`Nachkontrolle der entfernten Datenpunkte fehlgeschlagen: ${error.message || String(error)}`, 'DATABASE');
        }
    }

    async _cleanSavedChannelDiagnostics(previousView) {
        if (this.stopping) return;
        if (!this.config.channelListView || typeof previousView !== 'string'
            || previousView.trim() !== this.config.channelListView) {
            // A previous list's count and selection must not appear to describe
            // the newly configured list before its first successful refresh.
            for (const [id, value] of Object.entries({
                'channels.lastSelection': '{}', 'channels.refreshCount': 0, 'channels.refreshLastUpdate': 0,
            })) await this._write(id, value);
            return;
        }
        const selection = await this._readState('channels.lastSelection');
        if (this.stopping || typeof selection?.val !== 'string') return;
        let report;
        try { report = JSON.parse(selection.val); } catch { /* Invalid old diagnostics are also cleared. */ }
        if (!report || typeof report !== 'object'
            || report.requested?.itemClass === 'audio'
            || (report.requested?.listView && report.requested.listView !== this.config.channelListView)
            || /(?:^|\.)channels\.radio(?:\.|$)/u.test(report.requested?.id || '')
            || Object.hasOwn(report, 'modeSwitch') || report.locatorSource === 'GetMediaItem') {
            await this._write('channels.lastSelection', '{}');
        }
    }

    async start() {
        if (this._started || this.stopping) return;
        this._started = true;
        this.config = normalizeConfig(this.adapter.config || {});
        this.adapter.log.info(`Adapterstand ${BUILD_ID}`);
        // Complete feature removal before restoring any cached channel objects,
        // subscribing to commands or creating a client, even without a TV host.
        await this._removeObsoleteObjects();
        if (this.stopping) return;
        const definitions = createDefinitions(this.config);
        for (const definition of definitions) {
            if (this.stopping) return;
            const { id, ...object } = definition;
            this._objects.set(id, object);
            await this._database(() => this.stopping ? undefined : this.adapter.extendObjectAsync(id, object), `Objekt ${id}`);
            if (this.stopping) return;
            if (object.type !== 'state') continue;
            if (object.common.role === 'button') {
                // Never replay a pending button from an earlier adapter process.
                await this._write(id, false);
            } else if (Object.hasOwn(object.common, 'def')) {
                const existing = await this._readState(id);
                if (existing === null || existing === undefined || existing.val === null) {
                    await this._write(id, object.common.def);
                } else if (object.common.write) {
                    // Parameter values are retained; they do not execute commands.
                    if (!existing.ack) await this._write(id, existing.val);
                }
            }
        }
        const previousChannelView = await this._readState('channels.view');
        await this._write('info.connection', false);
        await this._write('info.adapterBuild', BUILD_ID);
        await this._write('channels.view', this.config.channelListView);
        await this._write('info.commandPending', false);
        await this._write('info.lastError', '');
        await this._cleanSavedChannelDiagnostics(previousChannelView?.val);
        if (this.stopping) return;
        for (const id of ['device.macLan', 'device.macWlan', 'device.mac']) {
            const state = await this._readState(id);
            if (typeof state?.val === 'string') this._lastValues.set(id, state.val);
        }
        await this._updateWakeReady();
        if (this.stopping) return;
        await this._database(() => {
            if (this.stopping) return;
            return typeof this.adapter.subscribeStatesAsync === 'function'
                ? this.adapter.subscribeStatesAsync('*') : this.adapter.subscribeStates('*');
        }, 'Status-Abonnement');
        if (this.stopping) return;
        // Retire cached objects belonging to a previous selection even when
        // there is no configured host or the TV is currently unavailable.
        await this.epg.start();
        if (this.stopping) return;
        this.channelObjects.start();
        if (!this.config.host) {
            await this._recordError(validation('Bitte die IP-Adresse oder den Hostnamen des Fernsehers konfigurieren.'));
            return;
        }
        this.client = this.clientFactory(this.config);
        if (this.config.pollInterval > 0) {
            await this.poll();
            this._schedule();
        }
        this.channelRefresh.start();
    }

    _schedule() {
        if (this.stopping || !this.client || this._timer !== null || this.config.pollInterval === 0) return;
        const setTimer = this.adapter.setTimeout?.bind(this.adapter) || setTimeout;
        this._timer = setTimer(() => {
            this._timer = null;
            void this.poll()
                .catch(error => this._logError(error))
                .finally(() => this._schedule())
                .catch(error => this._logError(error));
        }, this.config.pollInterval * 1000);
    }

    async _connectedNow() {
        this._checkRunning();
        const wasConnected = this._connected;
        this._connected = true;
        await this._writeChanged('info.connection', true);
        await this._write('info.lastSeen', Date.now());
        if (!wasConnected) {
            this.channelRefresh.connected();
            this.epg.connected();
        }
    }

    async _call(method, ...args) {
        this._checkRunning();
        const result = await this.client[method](...args);
        this._checkRunning();
        await this._connectedNow();
        return result;
    }

    async _recordError(error, { affectConnection = true } = {}) {
        if (this.stopping) return;
        const message = `${error.code ? `${error.code}: ` : ''}${error.message || String(error)}`.slice(0, 2000);
        this._logError(error);
        const writes = [];
        if (this._lastValues.get('info.lastError') !== message) writes.push(this._safeWrite('info.lastError', message));
        if (affectConnection && (['NETWORK', 'HTTP', 'INVALID_RESPONSE', 'CLOSED'].includes(error.code) || error.sessionInvalid)) {
            this._connected = false;
            this._deviceRead = false;
            if (this._lastValues.get('info.connection') !== false) writes.push(this._safeWrite('info.connection', false));
        }
        await Promise.all(writes);
    }

    _enqueue(label, operation, { manual = false } = {}) {
        if (this.stopping) return Promise.resolve(false);
        if (this._pendingCount >= MAX_QUEUE) {
            return this._recordError(validation('Zu viele wartende Befehle. Bitte langsamer senden.')).then(() => false);
        }
        this._pendingCount++;
        const queuedAt = Date.now();
        const run = async () => {
            try {
                this._checkRunning();
                if (Date.now() - queuedAt > MAX_QUEUE_AGE_MS) {
                    throw validation('Befehl verworfen: länger als 30 Sekunden in der Warteschlange.');
                }
                await this._writeChanged('info.commandPending', true);
                if (manual) {
                    await this._write('info.lastCommand', label);
                    await this._write('info.lastCommandAt', Date.now());
                }
                await operation();
                if (!this.stopping) {
                    await this._writeChanged('info.lastError', '');
                    this._lastLoggedError = '';
                }
                return true;
            } catch (error) {
                await this._recordError(error);
                return false;
            } finally {
                this._pendingCount--;
                if (!this.stopping) await this._safeWrite('info.commandPending', this._pendingCount > 0 || this._wakeActive);
            }
        };
        const next = this._tail.then(run, run).catch(error => {
            this._logError(error);
            return false;
        });
        this._tail = next;
        return next;
    }

    async _readVolume() {
        const volume = await this._call('getVolume');
        if (!Number.isFinite(volume) || volume < 0) {
            throw new ProtocolError('Ungültiger Lautstärkewert vom Fernseher.', 'INVALID_RESPONSE');
        }
        await this._writeChanged('status.volume', volume);
        await this._write('control.volume', volume);
    }

    async _readMute() {
        const mute = await this._call('getMute');
        if (typeof mute !== 'boolean') throw new ProtocolError('Ungültige Stummschaltung vom Fernseher.', 'INVALID_RESPONSE');
        await this._writeChanged('status.mute', mute);
        await this._write('control.mute', mute);
    }

    async _optional(method, stateId) {
        this._checkRunning();
        try {
            const response = await this._call(method);
            await this._writeChanged(stateId, json(response));
            this._optionalWarnings.delete(method);
            return response;
        } catch (error) {
            this._checkRunning();
            // An unsupported optional SOAP action does not invalidate working controls.
            // A transport/session error does, and ends this poll immediately.
            if (error.code === 'NETWORK' || error.sessionInvalid || error.code === 'CLOSED' || error.code === 'DATABASE'
                || (error.code === 'HTTP' && [401, 403].includes(error.httpStatus))) throw error;
            if (!this._optionalWarnings.has(method)) {
                this.adapter.log.warn(`Optionale Abfrage ${method} nicht verfügbar: ${error.message}`);
                this._optionalWarnings.add(method);
            }
            return null;
        }
    }

    async _readStatus(forceDevice = false) {
        const readDevice = !this._deviceRead || forceDevice;
        // Discover MAC addresses before model-dependent volume/mute queries.
        // Older sets report only MAC-Address without LAN/WLAN suffixes.
        if (readDevice) {
            const response = await this._optional('getDeviceData', 'device.data');
            if (response) {
                for (const [field, id] of [
                    ['MAC-Address-LAN', 'device.macLan'], ['MAC-Address-WLAN', 'device.macWlan'], ['MAC-Address', 'device.mac'],
                ]) {
                    const mac = findMac(response.data, field);
                    if (mac) await this._write(id, mac);
                }
                await this._updateWakeReady();
            }
            this._deviceRead = true;
        }
        for (const [name, read] of [['getVolume', () => this._readVolume()], ['getMute', () => this._readMute()]]) {
            try {
                await read();
                this._optionalWarnings.delete(name);
            } catch (error) {
                this._checkRunning();
                if (error.code === 'NETWORK' || error.code === 'CLOSED' || error.code === 'DATABASE' || error.sessionInvalid
                    || (error.code === 'HTTP' && [401, 403].includes(error.httpStatus))) throw error;
                if (!this._optionalWarnings.has(name)) {
                    this.adapter.log.warn(`Statusabfrage ${name} nicht unterstützt: ${error.message}`);
                    this._optionalWarnings.add(name);
                }
            }
        }
        if (readDevice) {
            const response = await this._optional('getSettings', 'device.settings');
            if (response) {
                const settings = response.data?.Envelope?.Body?.GetSettingsResponse;
                for (const [field, id] of [
                    ['WolEnable', 'device.wolEnabled'], ['WolInteractive', 'device.wolInteractive'],
                ]) {
                    const value = textValue(settings?.[field]);
                    await this._writeChanged(id, value === '1' ? true : value === '0' ? false : null);
                }
            }
        }
        if (this.config.pollPlayback) await this._optional('getCurrentPlayback', 'status.playback');
    }

    _wakeMacs() {
        return [
            this.config.macLan || this._lastValues.get('device.macLan') || '',
            this.config.macWlan || this._lastValues.get('device.macWlan') || '',
            (!this.config.macLan && !this.config.macWlan) ? this._lastValues.get('device.mac') || '' : '',
        ].filter(Boolean);
    }

    async _updateWakeReady() {
        const ready = this._wakeMacs().some(mac => {
            try { createWolPacket(mac); return true; } catch { return false; }
        });
        await this._writeChanged('info.wakeReady', ready);
    }

    _cancelWake() {
        this._powerIntent++;
        this._wakeAbort?.abort();
    }

    _wakeKey(deadline, signal) {
        const check = () => {
            this._checkRunning();
            if (signal.aborted) throw new ProtocolError('Einschaltvorgang abgebrochen.', 'CANCELLED');
            if (Date.now() >= deadline) throw new ProtocolError(
                'Einschaltversuch hat sein Zeitlimit erreicht.', 'NETWORK', { transportCode: 'ETIMEDOUT' },
            );
        };
        check();
        if (this._pendingCount >= MAX_QUEUE) {
            return Promise.reject(new ProtocolError('TV-Befehlswarteschlange ist belegt.', 'NETWORK'));
        }
        this._pendingCount++;
        // Only an individual attempt joins the normal SOAP queue. Waiting for
        // boot/rebroadcast never owns it. A timed-out queued attempt rechecks
        // its deadline, so it cannot switch on later after an off command.
        const run = async () => {
            check();
            const response = await this.client.key('power_on', { deadline });
            check();
            return response;
        };
        const next = this._tail.then(run, run).finally(() => {
            this._pendingCount--;
            if (!this.stopping) void this._safeWrite('info.commandPending', this._pendingCount > 0 || this._wakeActive);
        });
        // The caller receives the error for the narrowly scoped TV_ON retry.
        // Other queued commands do not inherit its rejection.
        this._tail = next.catch(() => undefined);
        return next;
    }

    _wake(intent = this._powerIntent) {
        if (this.stopping || intent !== this._powerIntent) return Promise.resolve(false);
        if (this._wakePromise) {
            return this._wakeAbort?.signal.aborted
                ? this._wakePromise.then(() => this._wake(intent)) : this._wakePromise;
        }
        this._wakeActive = true;
        const controller = new AbortController();
        this._wakeAbort = controller;
        const startedAt = Date.now();
        const run = async () => {
            let notifications = Promise.resolve();
            try {
                this._checkRunning();
                const macs = this._wakeMacs();
                if (!macs.length) throw validation(
                    'Keine TV-MAC-Adresse bekannt. LAN-/WLAN-MAC konfigurieren oder bei eingeschaltetem TV control.refresh auslösen.',
                );
                // The sequence starts WOL before waiting for diagnostics or the
                // SOAP queue, then sends the documented discrete TV_ON code.
                const operation = this.powerOnSequence({
                    signal: controller.signal,
                    timeoutMs: this.config.powerOnTimeout * 1000,
                    sendWake: async () => {
                        this._checkRunning();
                        if (controller.signal.aborted) throw new ProtocolError('Einschaltvorgang abgebrochen.', 'CANCELLED');
                        const sentAt = Date.now();
                        const response = await this.client.wake(macs, this.config.broadcastAddress, {
                            repeats: 3, autoBroadcast: true, signal: controller.signal,
                        });
                        this._checkRunning();
                        const details = { sentAt, ...response };
                        await this._safeWrite('info.lastWakeOnLan', json(details));
                        return response;
                    },
                    sendPowerKey: deadline => this._wakeKey(deadline, controller.signal),
                    onProgress: (phase, details = {}) => {
                        if (this.stopping || this._wakeAbort !== controller) return;
                        return this._safeWrite('info.powerOn', json({ ...details, phase, startedAt, updatedAt: Date.now() }));
                    },
                });
                notifications = Promise.all([
                    this._safeWrite('info.commandPending', true),
                    this._safeWrite('info.lastCommand', 'control.powerOn'),
                    this._safeWrite('info.lastCommandAt', startedAt),
                ]);
                await operation;
                this._checkRunning();
                await this._connectedNow();
                await this._safeWrite('info.lastError', '');
                return true;
            } catch (error) {
                if (error.code !== 'CANCELLED') await this._recordError(error, { affectConnection: false });
                return false;
            } finally {
                await notifications;
                this._wakeActive = false;
                if (!this.stopping) {
                    await this._safeWrite('control.powerOn', false);
                    await this._safeWrite('info.commandPending', this._pendingCount > 0);
                }
            }
        };
        this._wakePromise = run().catch(error => {
            this._logError(error);
            return false;
        }).finally(() => {
            this._wakePromise = null;
            if (this._wakeAbort === controller) this._wakeAbort = null;
        });
        return this._wakePromise;
    }

    poll() {
        if (this.stopping || !this.client) return Promise.resolve(false);
        if (!this._pollPromise) {
            this._pollPromise = this._enqueue('poll', () => this._readStatus()).finally(() => {
                this._pollPromise = null;
            });
        }
        return this._pollPromise;
    }

    _checkDiscovery(context) {
        if (this.stopping) throw new ProtocolError('Adapter wird beendet.', 'CLOSED');
        if (context.expired || Date.now() >= context.deadline) {
            throw new ProtocolError('Die Abfrage aller Senderlisten hat ihr Zeitlimit von 30 Sekunden erreicht.', 'CHANNEL_LIST_TIMEOUT');
        }
        this._checkRunning();
    }

    async _discoverChannelLists(context) {
        const lists = new Map();
        const fingerprints = new Set();
        let offset = 0;
        let expectedTotal;
        let bytes = 0;
        for (let index = 0; index < CHANNEL_LIST_MAX_PAGES; index++) {
            this._checkDiscovery(context);
            let response;
            let failure;
            const successful = await this._enqueue('channels.configuration.getLists', async () => {
                try {
                    this._checkDiscovery(context);
                    response = await this._call('getChannelLists', offset, CHANNEL_LIST_PAGE_SIZE, { deadline: context.deadline });
                    this._checkDiscovery(context);
                } catch (error) {
                    failure = error;
                    throw error;
                }
            });
            this._checkDiscovery(context);
            if (!successful) throw failure || new ProtocolError('Die Senderlistenabfrage konnte nicht in der Befehlswarteschlange ausgeführt werden.', 'CHANNEL_LIST_QUEUE');
            const page = parseChannelLists(response);
            if (page.result === 'SYNC') {
                throw new ProtocolError('Der Fernseher synchronisiert seine Senderlisten. Bitte später erneut laden.', 'TV_SYNC');
            }
            if ((page.startIndex !== null && page.startIndex !== offset)
                || (page.totalResults !== null && page.startIndex === null)
                || (page.result === 'NONE' && page.lists.length)) {
                throw new ProtocolError('Die Senderlistenantwort enthält keinen passenden Seitenbereich.', 'CHANNEL_LIST_INVALID');
            }
            if (expectedTotal !== undefined && page.totalResults !== expectedTotal) {
                throw new ProtocolError('Die Anzahl der Senderlisten hat sich während der Abfrage geändert. Bitte erneut laden.', 'CHANNEL_LIST_CHANGED');
            }
            expectedTotal = page.totalResults;
            if (page.lists.length > CHANNEL_LIST_PAGE_SIZE || offset + page.lists.length > CHANNEL_LIST_MAX_ITEMS
                || (page.totalResults !== null && page.totalResults > CHANNEL_LIST_MAX_ITEMS)) {
                throw new ProtocolError(`Die Senderlistenabfrage ist auf ${CHANNEL_LIST_MAX_ITEMS} Einträge begrenzt. Es wird keine unvollständige Auswahl angezeigt.`, 'CHANNEL_LIST_LIMIT');
            }
            if (page.lists.length) {
                const fingerprint = JSON.stringify(page.lists);
                if (fingerprints.has(fingerprint)) {
                    throw new ProtocolError('Der Fernseher hat dieselbe Senderlistenseite wiederholt. Die vollständige Auswahl konnte nicht bestätigt werden.', 'CHANNEL_LIST_INVALID');
                }
                fingerprints.add(fingerprint);
            }
            for (const list of page.lists) {
                if (Buffer.byteLength(list.view) > 2048 || /[\u0000-\u001f\u007f]/u.test(list.view)) {
                    throw new ProtocolError('Der Fernseher hat eine ungültige Senderlistenkennung geliefert.', 'CHANNEL_LIST_INVALID');
                }
                bytes += Buffer.byteLength(JSON.stringify(list));
                if (bytes > CHANNEL_LIST_MAX_BYTES) {
                    throw new ProtocolError('Die Senderlisten überschreiten die Grenze von 256 KiB. Es wird keine unvollständige Auswahl angezeigt.', 'CHANNEL_LIST_LIMIT');
                }
                const previous = lists.get(list.view);
                if (previous && JSON.stringify(previous) !== JSON.stringify(list)) {
                    throw new ProtocolError('Eine Senderliste hat sich während der Abfrage geändert. Bitte erneut laden.', 'CHANNEL_LIST_CHANGED');
                }
                lists.set(list.view, list);
            }
            offset += page.lists.length;
            const complete = page.totalResults === null ? page.lists.length === 0 : offset === page.totalResults;
            if (complete) {
                this._checkDiscovery(context);
                const discovered = [...lists.values()];
                // AV input lists are not broadcast channel lists. Unknown list
                // prefixes, empty lists and favourites remain selectable.
                return discovered.filter(list => !list.view.startsWith('avlist'));
            }
            if (!page.lists.length || (page.totalResults !== null && page.nextStart !== offset)) {
                throw new ProtocolError('Die Senderlistenantwort endet vor der gemeldeten Gesamtzahl.', 'CHANNEL_LIST_INVALID');
            }
            // Even with no total metadata, require an explicit empty end page.
            // A TV may cap page size below our requested 500 entries. Let remote
            // commands enter the serialized queue between successive pages.
            await nextTurn();
        }
        throw new ProtocolError(`Die Senderlistenabfrage ist auf ${CHANNEL_LIST_MAX_PAGES} Seiten begrenzt. Es wird keine unvollständige Auswahl angezeigt.`, 'CHANNEL_LIST_LIMIT');
    }

    _allChannelLists() {
        if (this._listDiscoveryPromise) return this._listDiscoveryPromise;
        const context = { deadline: Date.now() + CHANNEL_LIST_TIMEOUT_MS, expired: false };
        let timer;
        let cancel;
        const deadline = new Promise((_, reject) => {
            cancel = () => {
                context.expired = true;
                reject(new ProtocolError('Adapter wird beendet.', 'CLOSED'));
            };
            timer = setTimeout(() => {
                context.expired = true;
                reject(new ProtocolError('Die Abfrage aller Senderlisten hat ihr Zeitlimit von 30 Sekunden erreicht.', 'CHANNEL_LIST_TIMEOUT'));
            }, CHANNEL_LIST_TIMEOUT_MS);
        });
        this._listDiscoveryCancel = cancel;
        this._listDiscoveryPromise = Promise.race([this._discoverChannelLists(context), deadline]).finally(() => {
            context.expired = true;
            clearTimeout(timer);
            this._listDiscoveryPromise = null;
            if (this._listDiscoveryCancel === cancel) this._listDiscoveryCancel = null;
        });
        return this._listDiscoveryPromise;
    }

    _discoveredTvOptions(message) {
        const port = discoveryPort(message, this.config?.port);
        if (this.stopping) return [{ value: '', label: 'Adapter wird beendet. Bitte nach dem Start erneut suchen.' }];
        if (port === null) return [{ value: '', label: 'Bitte einen gültigen TV-Steuerport von 1 bis 65535 eingeben.' }];
        const result = this._tvDiscoveryResult;
        if (!result || result.port !== port) return [{ value: '', label: 'Zuerst „Fernseher suchen“ anklicken' }];
        if (result.status === 'searching') return [{ value: '', label: 'Fernseher werden gesucht …' }];
        if (result.status === 'error') return [{ value: '', label: `Suche fehlgeschlagen: ${result.error}` }];
        return [{ value: '', label: result.devices.length ? 'Gefundenen Fernseher auswählen' : 'Keine Loewe-Fernseher gefunden. TV einschalten und erneut suchen.' },
            ...result.devices.map(device => {
                const name = discoveryText(device.name);
                const model = discoveryText(device.model);
                const description = name && model && !name.toLowerCase().includes(model.toLowerCase())
                    ? `${name} (${model})` : name || model || 'Loewe';
                return { value: device.host, label: `${device.host} · ${description}`
                    + (device.apiReachable ? '' : ` · Steuerport ${port} nicht erreichbar`) };
            })];
    }

    _searchTvs(message) {
        const port = discoveryPort(message, this.config?.port);
        if (port === null) return Promise.resolve({ error: 'discoveryInvalidPort' });
        if (this.stopping) return Promise.resolve({ error: 'discoveryUnavailable' });
        if (this._tvDiscoveryPromise) {
            if (this._tvDiscoveryResult?.port === port) return this._tvDiscoveryPromise;
            return Promise.resolve({ error: 'discoveryFailed', args: ['Eine Suche mit einem anderen Steuerport läuft bereits. Bitte deren Ende abwarten.'] });
        }
        // Discovery uses its own sockets. It works before a host is configured
        // and never joins the SOAP command queue or changes TV settings.
        const controller = new AbortController();
        this._tvDiscoveryAbort = controller;
        this._tvDiscoveryResult = { port, status: 'searching', devices: [] };
        let timer;
        let cancel;
        const deadline = new Promise((_, reject) => {
            cancel = () => reject(new ProtocolError('Adapter wird beendet.', 'CLOSED'));
            controller.signal.addEventListener('abort', cancel, { once: true });
            timer = setTimeout(() => {
                reject(new ProtocolError('Die Gerätesuche hat ihr Zeitlimit erreicht. Bitte erneut suchen.', 'DISCOVERY_TIMEOUT'));
                controller.abort();
            }, TV_DISCOVERY_TIMEOUT_MS);
        });
        const scan = Promise.resolve().then(() => {
            if (controller.signal.aborted) throw new ProtocolError('Adapter wird beendet.', 'CLOSED');
            return this.tvDiscovery({ port, signal: controller.signal });
        });
        const refreshed = () => {
            this._tvDiscoveryRevision = Math.max(Date.now(), this._tvDiscoveryRevision + 1);
            // Only temporary Admin fields change. In particular, a scan must
            // not overwrite a manually entered host or an unsaved channel list.
            return { _tvDiscoveryReload: this._tvDiscoveryRevision, _discoveredTv: '' };
        };
        this._tvDiscoveryPromise = Promise.race([scan, deadline]).then(result => {
            if (this.stopping) throw new ProtocolError('Adapter wird beendet.', 'CLOSED');
            if (!result || !Array.isArray(result.devices) || !Array.isArray(result.warnings)
                || result.devices.some(device => !device || typeof device.host !== 'string'
                    || !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(device.host)
                    || device.host.split('.').some(part => Number(part) > 255))) {
                throw new ProtocolError('Ungültige Antwort bei der Gerätesuche.', 'DISCOVERY_RESPONSE');
            }
            this._tvDiscoveryResult = { port, status: 'complete', devices: result.devices };
            for (const warning of result.warnings) this.adapter.log.debug(`Gerätesuche: ${discoveryText(warning)}`);
            const partial = result.warnings.length > 0 || result.devices.some(device => !device.apiReachable);
            return {
                native: refreshed(),
                result: partial ? 'discoveryPartial' : result.devices.length ? 'discoveryComplete' : 'discoveryEmpty',
                args: [result.devices.length],
            };
        }).catch(error => {
            if (this.stopping) return { error: 'discoveryUnavailable' };
            const detail = discoveryText(error.message || String(error));
            this._tvDiscoveryResult = { port, status: 'error', devices: [], error: detail };
            this.adapter.log.debug(`Gerätesuche fehlgeschlagen: ${error.code || 'ERROR'}: ${detail}`);
            // Admin ignores native updates on its error branch. Use a mapped
            // result here so a failed rescan also removes stale suggestions.
            return { native: refreshed(), result: 'discoveryFailed', args: [detail] };
        }).finally(() => {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', cancel);
            controller.abort();
            if (this._tvDiscoveryAbort === controller) this._tvDiscoveryAbort = null;
            this._tvDiscoveryPromise = null;
        });
        return this._tvDiscoveryPromise;
    }

    async handleMessage(command, message = {}) {
        if (command === 'getEpgGuide') return this.epg.guide(message);
        if (command === 'refreshEpgGuide') {
            if (!message || typeof message !== 'object' || Array.isArray(message)
                || Object.keys(message).some(key => !['listView', 'catalogRevision'].includes(key))) {
                throw new ProtocolError('Ungültige Anfrage zum Aktualisieren der EPG-Übersicht.', 'EPG_GUIDE_INVALID');
            }
            this._checkRunning();
            const guide = this.epg.guide(message);
            if (!this.epg.started || this.epg.stopped || !this.config?.epgEnabled
                || !this.config.channelListView || !guide.total) {
                throw new ProtocolError('EPG aktivieren und eine TV-Senderliste speichern. Die Senderliste muss bereits geladen sein.', 'EPG_GUIDE_UNAVAILABLE');
            }
            // A cycle can pause briefly between batches. Keep that same cycle
            // instead of restarting at the first channel on a second click.
            if (this.epg._fetchPromise || this.epg._cycle) {
                return { accepted: true, status: 'alreadyRunning', instance: this.adapter.namespace };
            }
            // TV reads can take a full batch deadline. Acknowledge the click
            // immediately; progress is available through the cached guide API.
            void Promise.resolve(this.epg.refresh({ manual: true })).catch(error => {
                if (!this.stopping) this._logError(error);
            });
            return { accepted: true, status: 'started', instance: this.adapter.namespace };
        }
        if (command === 'getDiscoveredTvs') return this._discoveredTvOptions(message);
        if (command === 'discoverTvs') return this._searchTvs(message);
        if (command === 'refreshChannelLists') {
            // A doNotSave Admin field causes selectSendTo to reload its choices.
            // It does not change native configuration or select a channel list.
            this._listRefreshRevision = Math.max(Date.now(), this._listRefreshRevision + 1);
            return { native: { _channelListsReload: this._listRefreshRevision } };
        }
        if (command !== 'getChannelLists') return undefined;
        const candidate = message?.channelListView;
        const selected = typeof candidate === 'string' && Buffer.byteLength(candidate) <= 2048
            && !/[\u0000-\u001f\u007f]/u.test(candidate) ? candidate.trim() : this.config?.channelListView || '';
        try {
            if (!message || typeof message !== 'object' || Array.isArray(message)) throw validation('Ungültige Anfrage der Adapterkonfiguration.');
            if (!this.config?.host) throw validation('Bitte zuerst die TV-Adresse speichern und den Adapter starten.');
            if ((Object.hasOwn(message, 'host') && (typeof message.host !== 'string' || message.host.trim() !== this.config.host))
                || (Object.hasOwn(message, 'port') && (String(message.port).trim() !== String(this.config.port)))) {
                throw validation('TV-Adresse oder Port wurden geändert. Bitte zuerst speichern und den Adapter neu starten.');
            }
            if (!this.client) throw validation('Der Adapter ist noch nicht bereit. Bitte nach dem Start erneut laden.');
            const lists = await this._allChannelLists();
            const names = new Map();
            for (const list of lists) names.set(list.name || list.view, (names.get(list.name || list.view) || 0) + 1);
            const options = [{ value: '', label: lists.length ? 'Bitte eine Senderliste auswählen' : 'Der TV meldet keine Senderlisten' }];
            for (const list of lists) {
                const name = list.name || list.view;
                options.push({ value: list.view, label: name
                    + (list.totalResults !== null ? ` (${list.totalResults} Einträge)` : '')
                    + (names.get(name) > 1 ? ` [${list.view}]` : '') });
            }
            if (selected && !lists.some(list => list.view === selected)) {
                options.push({ value: selected, label: `${selected} (bisherige Auswahl; vom TV nicht mehr gemeldet)` });
            }
            return options;
        } catch (error) {
            const detail = `${error.code || 'ERROR'}: ${error.message || String(error)}`.slice(0, 1200);
            // Admin 7 selectSendTo expects an array even on failure. Returning
            // {error} would break its rendering and could hide a saved value.
            return [{ value: '', label: `Senderlisten nicht verfügbar: ${detail}` },
                ...(selected ? [{ value: selected, label: `${selected} (bisherige Auswahl; Senderlisten nicht verfügbar: ${detail})` }] : [])];
        }
    }

    async _restoreConfirmed(id) {
        const statusId = id === 'control.volume' ? 'status.volume' : id === 'control.mute' ? 'status.mute' : null;
        if (statusId && this._lastValues.has(statusId)) await this._write(id, this._lastValues.get(statusId));
    }

    _checkZapResult(result) {
        if (result !== null && result !== 0) {
            throw new ProtocolError(`Der TV hat ZapToMedia mit Result=${result} abgelehnt.`, 'TV_REJECTED', { action: 'ZapToMedia' });
        }
        return result;
    }

    async _selectChannel(target) {
        if (target?.itemClass !== 'video' || !/^channels\.tv\.[A-Za-z0-9_]+$/u.test(target.id)) {
            throw new ProtocolError('Nur registrierte TV-Sender können ausgewählt werden.', 'CHANNEL_UNAVAILABLE');
        }
        const report = {
            startedAt: Date.now(), finishedAt: null, status: 'running', phase: 'validate',
            requested: { id: target.id, name: target.name, number: target.number,
                itemClass: target.itemClass, mediaItemUuid: target.mediaItemUuid, listView: target.listView },
            listLocator: target.locator, resolvedLocator: null, locatorSource: 'GetChannelList',
            result: null, stationConfirmed: false, verification: 'notChecked',
        };
        // Keep the previous attempt from masquerading as the current one while
        // the TV is slow. Status polling does not overwrite this attempt.
        await this._safeWrite('channels.lastSelection', json(report));
        try {
            this._checkRunning();
            this.channelObjects.checkTarget(target);
            report.resolvedLocator = target.locator;
            report.phase = 'zap';
            // An ioBroker diagnostic write can yield to a catalogue refresh.
            // Recheck the captured target immediately before the one TV command.
            this._checkRunning();
            this.channelObjects.checkTarget(target);
            const response = await this._call('zap', target.locator);
            report.zapResponse = JSON.parse(json(response, 16 * 1024));
            report.result = parseZapResult(response);
            this._checkZapResult(report.result);
            report.status = report.result === 0 ? 'accepted' : 'unconfirmed';
            report.phase = 'complete';
        } catch (error) {
            report.status = 'error';
            report.error = `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000);
            throw error;
        } finally {
            report.finishedAt = Date.now();
            await this._safeWrite('channels.lastSelection', json(report));
        }
    }

    async handleStateChange(fullId, state) {
        const prefix = `${this.adapter.namespace}.`;
        if (this.stopping || !state || state.ack || typeof fullId !== 'string' || !fullId.startsWith(prefix)) return;
        const id = fullId.slice(prefix.length);
        // Ignore obsolete commands even if a stale object/state event survives
        // an upgrade or another script writes the old paths again.
        if (removedObject(id)) return;
        if (id === 'channels.view') {
            // Old scripts may still write the former list parameter. Restore
            // the configured value without making a request or changing views.
            await this._write(id, this.config?.channelListView || '');
            return;
        }
        const object = this._objects.get(id);
        if (!object || object.type !== 'state' || !object.common.write) return;
        const value = state.val;
        const isButton = object.common.role === 'button';
        if (isButton && value === false) {
            await this._resetButton(id);
            return;
        }
        if (isButton && value !== true) {
            await this._recordError(validation('Tasten werden mit dem booleschen Wert true ausgelöst.'));
            await this._resetButton(id);
            return;
        }
        if (id === 'control.powerOn') {
            await this._wake(++this._powerIntent);
            return;
        }
        if (id === 'channels.refresh') {
            try { await this.channelRefresh.refresh({ manual: true }); }
            finally { if (!this.stopping) await this._write(id, false); }
            return;
        }
        if (id === 'channels.epgRefresh') {
            try { await this.epg.refresh({ manual: true }); }
            finally { if (!this.stopping) await this._write(id, false); }
            return;
        }
        if (['control.powerOff', 'remote.power_off', 'remote.power_all_code'].includes(id)) this._cancelWake();
        // Capture the selected channel before joining the network queue. A
        // later catalogue change must not redirect an already queued command.
        const channelSelect = CHANNEL_SELECT_ID.test(id);
        let channelTarget;
        let channelError;
        if (channelSelect) {
            try { channelTarget = this.channelObjects.target(id); } catch (error) { channelError = error; }
        }
        let successful = false;
        try {
            successful = await this._enqueue(id, async () => {
                if (channelError) throw channelError;
                if (channelSelect) {
                    await this._selectChannel(channelTarget);
                } else if (id === 'control.volume') {
                    if (!Number.isInteger(value) || value < 0 || value > this.config.maxVolume) {
                        throw validation(`Lautstärke muss eine ganze Zahl zwischen 0 und ${this.config.maxVolume} sein.`);
                    }
                    await this._call('setVolume', value);
                    await this._readVolume();
                } else if (id === 'control.mute') {
                    if (typeof value !== 'boolean') throw validation('Stummschaltung erwartet true oder false.');
                    await this._call('setMute', value);
                    await this._readMute();
                } else if (id === 'control.powerOff') {
                    await this._call('key', 'power_all_code');
                } else if (id === 'control.refresh') {
                    await this._readStatus(true);
                } else if (id.startsWith('remote.') && Object.hasOwn(KEYS, id.slice(7))) {
                    const key = id.slice(7);
                    await this._call('key', key);
                    if (['volume_up', 'volume_down'].includes(key)) await this._readVolume();
                    if (key === 'mute') await this._readMute();
                }
            }, { manual: true });
        } finally {
            if (!this.stopping) {
                if (isButton) await this._resetButton(id);
                else if (!successful) await this._restoreConfirmed(id);
            }
        }
    }

    async stop() {
        if (this.stopping) return;
        this.stopping = true;
        this._tvDiscoveryAbort?.abort();
        this._tvDiscoveryResult = null;
        this._listDiscoveryCancel?.();
        this.epg.stop();
        this.channelRefresh.stop();
        this.channelObjects.stop();
        this._cancelWake();
        if (this._timer !== null) {
            const clearTimer = this.adapter.clearTimeout?.bind(this.adapter) || clearTimeout;
            clearTimer(this._timer);
            this._timer = null;
        }
        this.client?.close();
        // close() aborts pending network operations. Do not wait on user queues
        // during the ioBroker unload deadline; queued operations check stopping.
        await Promise.all([
            this._safeWrite('info.connection', false, 200),
            this._safeWrite('info.commandPending', false, 200),
        ]);
    }
}

module.exports = { AdapterRuntime, normalizeConfig };
