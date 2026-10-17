'use strict';

const {
    LoeweClient, KEYS, createWolPacket, ProtocolError,
    parseChannelLists, parseChannelPage, selectChannelList, parseZapResult,
} = require('./loewe-client');
const { createDefinitions } = require('./states');
const { runPowerOn } = require('./power-on');
const { ChannelObjects } = require('./channel-objects');
const { ChannelRefresh } = require('./channel-refresh');

const MAX_QUEUE = 20;
const MAX_QUEUE_AGE_MS = 30000;
const DATABASE_TIMEOUT_MS = 2000;
const CLEANUP_TIMEOUT_MS = 15000;
const MAX_STATE_BYTES = 512 * 1024;
// This only recognizes the shape. Registered definitions and the channel
// catalogue authorize the actual target before it enters the TV transport.
const CHANNEL_SELECT_ID = /^channels\.tv\.[A-Za-z0-9_]+\.select$/u;
// These exact, own-instance paths are the features explicitly removed by the
// user. Prefix boundaries keep similarly named folders outside the migration.
const REMOVED_OBJECTS = Object.freeze([
    { id: 'channels.radio', recursive: true },
    { id: 'api', recursive: true },
    { id: 'remote.radio_mode_on', recursive: false },
    { id: 'channels.mediaType', recursive: false },
]);

function removedObject(id) {
    return REMOVED_OBJECTS.some(object => id === object.id
        || (object.recursive && id.startsWith(`${object.id}.`)));
}

function validation(message) {
    return new ProtocolError(message, 'VALIDATION');
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
        reason: 'TV-Antwort zu groß für einen ioBroker-Datenpunkt. Bei Listen channels.count verringern.',
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
    constructor(adapter, { clientFactory = options => new LoeweClient(options), powerOnSequence = runPowerOn } = {}) {
        this.adapter = adapter;
        this.clientFactory = clientFactory;
        this.powerOnSequence = powerOnSequence;
        this.client = null;
        this.config = null;
        this.stopping = false;
        this._started = false;
        this._tail = Promise.resolve();
        this._pendingCount = 0;
        this._pollPromise = null;
        this._timer = null;
        this._objects = new Map();
        this._parameters = new Map();
        this._lastValues = new Map();
        this._connected = false;
        this._deviceRead = false;
        this._optionalWarnings = new Set();
        this._wakePromise = null;
        this._wakeActive = false;
        this._wakeAbort = null;
        this._powerIntent = 0;
        this._lastLoggedError = '';
        this.channelObjects = new ChannelObjects(this);
        this.channelRefresh = new ChannelRefresh(this);
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
        const allowed = () => condition() && (!this.stopping || (val === false && ['info.connection', 'info.commandPending'].includes(id)));
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

    async _cleanSavedChannelDiagnostics() {
        if (this.stopping) return;
        const entries = await this._readState('channels.entries');
        if (this.stopping) return;
        if (typeof entries?.val === 'string') {
            let saved;
            try { saved = JSON.parse(entries.val); } catch { /* Replace invalid normalized data below. */ }
            const video = Array.isArray(saved) ? saved.filter(item => item?.itemClass === 'video') : [];
            if (!Array.isArray(saved) || video.length !== saved.length) await this._write('channels.entries', json(video));
        }
        if (this.stopping) return;
        const selection = await this._readState('channels.lastSelection');
        if (this.stopping || typeof selection?.val !== 'string') return;
        let report;
        try { report = JSON.parse(selection.val); } catch { /* Invalid old diagnostics are also cleared. */ }
        if (!report || typeof report !== 'object'
            || report.requested?.itemClass === 'audio'
            || /(?:^|\.)channels\.radio(?:\.|$)/u.test(report.requested?.id || '')
            || Object.hasOwn(report, 'modeSwitch') || report.locatorSource === 'GetMediaItem') {
            await this._write('channels.lastSelection', '{}');
        }
    }

    async start() {
        if (this._started || this.stopping) return;
        this._started = true;
        this.config = normalizeConfig(this.adapter.config || {});
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
                    if (object.common.write) this._parameters.set(id, object.common.def);
                } else if (object.common.write) {
                    this._parameters.set(id, existing.val);
                    // Parameter values are retained; they do not execute commands.
                    if (!existing.ack) await this._write(id, existing.val);
                }
            }
        }
        await this._write('info.connection', false);
        await this._write('info.commandPending', false);
        await this._write('info.lastError', '');
        await this._cleanSavedChannelDiagnostics();
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
        if (!this.config.host) {
            await this._recordError(validation('Bitte die IP-Adresse oder den Hostnamen des Fernsehers konfigurieren.'));
            return;
        }
        this.client = this.clientFactory(this.config);
        this.channelObjects.start();
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
        if (!wasConnected) this.channelRefresh.connected();
    }

    async _call(method, ...args) {
        this._checkRunning();
        const result = await this.client[method](...args);
        this._checkRunning();
        await this._connectedNow();
        await this._writeChanged('info.lastResponse', result?.data ? json(result, 64 * 1024) : json({ method, value: result }));
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
        await this._writeChanged('status.volumeRaw', Math.round(volume * 10000));
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
                        await this._safeWrite('info.lastResponse', json({ wakeOnLan: details }));
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

    async _parameter(id, fallback) {
        if (this._parameters.has(id)) return this._parameters.get(id);
        const state = await this._readState(id);
        return state?.val ?? fallback;
    }

    async _channelLists(start, count, options) {
        const response = options === undefined ? await this._call('getChannelLists', start, count)
            : await this._call('getChannelLists', start, count, options);
        // Retain the device's raw response even when a new firmware variant
        // cannot be normalized, so a failed query can be diagnosed.
        await this._write('channels.lists', json(response));
        const page = parseChannelLists(response);
        await this._write('channels.availableLists', json(page.lists));
        await this._write('channels.nextListStart', page.nextStart ?? -1);
        if (page.result === 'SYNC') {
            throw new ProtocolError('Der TV synchronisiert seine Senderlisten. Bitte die Abfrage später erneut auslösen.', 'TV_SYNC');
        }
        const selected = selectChannelList(page.lists);
        const current = await this._parameter('channels.view', '');
        if (selected && typeof current === 'string' && !current.trim()) {
            await this._ackParameter('channels.view', selected.view);
        }
        return page;
    }

    async _channels(id, parameters) {
        try {
            const [requestedView, start, count, listStart] = parameters;
            if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(listStart) || listStart < 0
                || !Number.isSafeInteger(count) || count < 1 || count > 500) {
                throw validation('Senderabfrage: start/listStart >= 0 und count zwischen 1 und 500 erforderlich.');
            }
            if (typeof requestedView !== 'string') {
                throw validation('Senderabfrage: Listenkennung als Text erforderlich.');
            }
            if (id === 'channels.getLists') {
                await this._channelLists(listStart, count);
            } else {
                let view = requestedView.trim();
                if (!view) {
                    const lists = await this._channelLists(0, 100);
                    const selected = selectChannelList(lists.lists);
                    if (!selected) throw new ProtocolError(
                        'Der TV hat keine geeignete Senderliste geliefert. channels.lists und channels.availableLists prüfen und gegebenenfalls eine Listenkennung in channels.view eintragen.',
                        'NO_CHANNEL_LIST',
                    );
                    view = selected.view;
                }
                const response = await this._call('getChannels', view, start, count, 'video');
                await this._write('channels.items', json(response));
                const page = parseChannelPage(response);
                await this._write('channels.entries', json(page.items.filter(item => item.itemClass === 'video')));
                await this._write('channels.totalNumber', page.totalResults ?? -1);
                await this._write('channels.returnedNumber', page.returnedResults);
                await this._write('channels.nextStart', page.nextStart ?? -1);
                if (!page.view) page.view = view;
                // Object creation has its own bounded worker. It must never
                // hold up the TV command queue while hundreds of states are made.
                this.channelObjects.acceptPage(page, 'video');
            }
            await this._write('channels.lastUpdate', Date.now());
            await this._write('channels.lastError', '');
        } catch (error) {
            await this._safeWrite('channels.lastError', `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000));
            throw error;
        }
    }

    async _ackParameter(id, value) {
        if (id === 'channels.view') {
            if (typeof value !== 'string') throw validation('Dieser Datenpunkt erwartet Text.');
            if (Buffer.byteLength(value) > 1024 * 1024) throw validation('Parametertext ist auf 1 MiB begrenzt.');
            value = value.trim();
        } else if (id === 'channels.start' || id === 'channels.listStart') {
            if (!Number.isSafeInteger(value) || value < 0) throw validation(`${id} muss eine ganze Zahl ab 0 sein.`);
        } else if (id === 'channels.count') {
            if (!Number.isSafeInteger(value) || value < 1 || value > 500) {
                throw validation('channels.count muss eine ganze Zahl zwischen 1 und 500 sein.');
            }
        }
        this._parameters.set(id, value);
        await this._write(id, value);
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
        // the TV is slow. Polling only updates info.lastResponse, not this state.
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
        const object = this._objects.get(id);
        if (!object || object.type !== 'state' || !object.common.write) return;
        const value = state.val;
        if (['channels.view', 'channels.start', 'channels.count', 'channels.listStart'].includes(id)) {
            try {
                const previous = this._parameters.get(id);
                await this._ackParameter(id, value);
                if (id === 'channels.view' && this._parameters.get(id) !== previous) this.channelRefresh.viewChanged();
            } catch (error) {
                await this._recordError(error);
                if (this._parameters.has(id)) await this._write(id, this._parameters.get(id));
            }
            return;
        }
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
        if (['control.powerOff', 'remote.power_off', 'remote.power_all_code'].includes(id)) this._cancelWake();
        // Capture parameter values when the send event arrives, before joining
        // the network queue. A later edit must not change an already queued command.
        const channelQuery = id === 'channels.getLists' || id === 'channels.getChannels';
        const channelSelect = CHANNEL_SELECT_ID.test(id);
        let channelTarget;
        let channelError;
        if (channelSelect) {
            try { channelTarget = this.channelObjects.target(id); } catch (error) { channelError = error; }
        }
        const snapshot = channelQuery ? Promise.all([
                this._parameter('channels.view', ''), this._parameter('channels.start', 0), this._parameter('channels.count', 100),
                this._parameter('channels.listStart', 0),
            ]) : Promise.resolve(channelTarget);
        // Attach a handler now to avoid a DB error becoming an unhandled rejection
        // while another network command is still running.
        const captured = snapshot.then(data => ({ data }), error => ({ error }));
        let successful = false;
        try {
            successful = await this._enqueue(id, async () => {
                const capture = await captured;
                if (channelError) throw channelError;
                if (capture.error) throw capture.error;
                if (channelSelect) {
                    await this._selectChannel(capture.data);
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
                } else if (id === 'media.text') {
                    if (typeof value !== 'string' || !value.length) throw validation('media.text erwartet einen nicht leeren Text.');
                    await this._call('text', value);
                    await this._write(id, value);
                } else if (id === 'media.backspace') {
                    await this._call('backspace');
                } else if (id === 'media.locator') {
                    this._checkZapResult(parseZapResult(await this._call('zap', value)));
                    await this._write(id, value);
                } else if (channelQuery) {
                    await this._channels(id, capture.data);
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
