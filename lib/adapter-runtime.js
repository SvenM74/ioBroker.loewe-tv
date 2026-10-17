'use strict';

const { setTimeout: waitForTimer } = require('node:timers/promises');
const {
    LoeweClient, KEYS, TABLET_ACTIONS, buildEnvelope, parseResponse, createWolPacket, ProtocolError,
    parseChannelLists, parseChannelPage, selectChannelList, parseMediaItem, parseZapResult, parseCurrentPlayback,
} = require('./loewe-client');
const { createDefinitions } = require('./states');
const { runPowerOn } = require('./power-on');
const { ChannelObjects } = require('./channel-objects');
const { ChannelRefresh } = require('./channel-refresh');

const ACTION_SET = new Set(TABLET_ACTIONS);
const MAX_QUEUE = 20;
const MAX_QUEUE_AGE_MS = 30000;
const DATABASE_TIMEOUT_MS = 2000;
const MAX_STATE_BYTES = 512 * 1024;
const SELECTION_TIMEOUT_MS = 15000;
const RADIO_MODE_TIMEOUT_MS = 6000;
const RADIO_VERIFY_TIMEOUT_MS = 3000;
const RADIO_POLL_INTERVAL_MS = 500;
// This only recognizes the shape. Registered definitions and the channel
// catalogue authorize the actual target before it enters the TV transport.
const CHANNEL_SELECT_ID = /^channels\.(tv|radio)\.[A-Za-z0-9_]+\.select$/u;
const REQUIRED_PARAMETERS = Object.freeze({
    GetFeature: ['Name'], GetListOfChannelLists: ['QueryParameters'],
    GetChannelList: ['ChannelListView', 'QueryParameters'], GetMediaItem: ['MediaItemReference'],
    GetMediaEvent: ['MediaEventReference'], GetDRPlusArchive: ['QueryParameters'],
    ImportServiceLists: ['Data'], ZapToMedia: ['Player', 'Locator'],
    RemoveFavoriteList: ['ViewName'], AddFavoriteList: ['Name', 'AdditionalAttributes'],
    RenameFavoriteList: ['ListViewName', 'NewName'], SetMute: ['Value'], SetVolume: ['Value'],
    PlayMultiroom: ['Locator', 'AncestorUuid', 'MultiroomClientIds'],
    InjectRCKey: ['InputEventSequence'], InjectKeyboardKey: ['InputEventSequence'],
    AddServicesFavoriteList: ['ViewName', 'LocatorSequence'],
    MoveServicesFavoriteList: ['ViewName', 'NumBegin', 'NumEnd', 'NumNewPosition'],
    RemoveServicesFavoriteList: ['ViewName', 'NumBegin', 'NumEnd'],
    SetSetting: ['Name', 'Value'], GetVolumes: ['QueryParameters', 'AdditionalParameters'],
    ProgramTimer: ['Device', 'RecordingType', 'Locator', 'Timer'],
    CreateIterator: ['TableName', 'Type', 'Selections', 'Fields', 'Orders', 'NotifyUpdate'],
    CloseIterator: ['Ids'], ActivateFeaturePackage: ['Package'],
});

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
        appendNul: boolean('appendNul', true), enableAdvanced: boolean('enableAdvanced', false),
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

/** Validate an expert request before RequestAccess or any mutating request. */
function validateParameters(action, fragment, maxVolume) {
    if (!ACTION_SET.has(action)) throw validation('Unbekannte SOAP-Aktion.');
    if (typeof fragment !== 'string' || Buffer.byteLength(fragment) > 1024 * 1024) {
        throw validation('parametersXml muss ein XML-Fragment mit höchstens 1 MiB sein.');
    }
    const envelope = buildEnvelope(action, fragment);
    const body = parseResponse(envelope).data.Envelope.Body[action];
    for (const required of REQUIRED_PARAMETERS[action] || []) {
        if (!body || !Object.hasOwn(body, required) || Array.isArray(body[required])) {
            throw validation(`${action}: Parameter ${required} fehlt oder kommt mehrfach vor. Siehe README.`);
        }
    }
    if (action === 'SetVolume') {
        const value = textValue(body.Value);
        if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value))
            || Number(value) > maxVolume * 10000) {
            throw validation(`SetVolume: Value muss zwischen 0 und ${maxVolume * 10000} liegen.`);
        }
    }
    if (action === 'SetMute' && !['0', '1'].includes(textValue(body.Value))) {
        throw validation('SetMute: Value muss 0 oder 1 sein.');
    }
}

class AdapterRuntime {
    constructor(adapter, { clientFactory = options => new LoeweClient(options), powerOnSequence = runPowerOn,
        selectionWait = (ms, signal) => waitForTimer(ms, undefined, { signal }) } = {}) {
        this.adapter = adapter;
        this.clientFactory = clientFactory;
        this.powerOnSequence = powerOnSequence;
        this.selectionWait = selectionWait;
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
        this._selectionIntent = 0;
        this._selectionAbort = null;
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

    async start() {
        if (this._started || this.stopping) return;
        this._started = true;
        this.config = normalizeConfig(this.adapter.config || {});
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
            const [requestedView, start, count, listStart, mediaType] = parameters;
            if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(listStart) || listStart < 0
                || !Number.isSafeInteger(count) || count < 1 || count > 500) {
                throw validation('Senderabfrage: start/listStart >= 0 und count zwischen 1 und 500 erforderlich.');
            }
            if (typeof requestedView !== 'string' || !['', 'video', 'audio'].includes(mediaType)) {
                throw validation('Senderabfrage: Listenkennung als Text und mediaType leer, video oder audio erforderlich.');
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
                const response = await this._call('getChannels', view, start, count, mediaType);
                await this._write('channels.items', json(response));
                const page = parseChannelPage(response);
                await this._write('channels.entries', json(page.items));
                await this._write('channels.totalNumber', page.totalResults ?? -1);
                await this._write('channels.returnedNumber', page.returnedResults);
                await this._write('channels.nextStart', page.nextStart ?? -1);
                if (!page.view) page.view = view;
                // Object creation has its own bounded worker. It must never
                // hold up the TV command queue while hundreds of states are made.
                this.channelObjects.acceptPage(page, mediaType);
            }
            await this._write('channels.lastUpdate', Date.now());
            await this._write('channels.lastError', '');
        } catch (error) {
            await this._safeWrite('channels.lastError', `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000));
            throw error;
        }
    }

    async _ackParameter(id, value) {
        if (id === 'channels.view' || id.endsWith('.parametersXml')) {
            if (typeof value !== 'string') throw validation('Dieser Datenpunkt erwartet Text.');
            if (Buffer.byteLength(value) > 1024 * 1024) throw validation('Parametertext ist auf 1 MiB begrenzt.');
            if (id === 'channels.view') value = value.trim();
        } else if (id === 'channels.start' || id === 'channels.listStart') {
            if (!Number.isSafeInteger(value) || value < 0) throw validation(`${id} muss eine ganze Zahl ab 0 sein.`);
        } else if (id === 'channels.mediaType') {
            if (!['', 'video', 'audio'].includes(value)) throw validation('channels.mediaType muss leer, video oder audio sein.');
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

    _cancelSelection() {
        this._selectionIntent++;
        this._selectionAbort?.abort();
    }

    _checkSelection(context) {
        this._checkRunning();
        if (context.signal.aborted || context.intent !== this._selectionIntent) {
            throw new ProtocolError('Radioauswahl durch einen neueren Modus- oder Einschaltbefehl abgebrochen.', 'CANCELLED');
        }
        this.channelObjects.checkTarget(context.target);
        if (Date.now() >= context.deadline) {
            throw new ProtocolError('Radioauswahl hat ihr Zeitlimit von 15 Sekunden erreicht.', 'CHANNEL_SELECTION');
        }
    }

    async _waitSelection(context, deadline) {
        this._checkSelection(context);
        const remaining = Math.min(deadline, context.deadline) - Date.now();
        if (remaining <= 0) return false;
        try {
            await this.selectionWait(Math.min(RADIO_POLL_INTERVAL_MS, remaining), context.signal);
        } catch (error) {
            this._checkSelection(context);
            throw error;
        }
        this._checkSelection(context);
        return Date.now() < deadline;
    }

    async _prepareRadioMode(context, report) {
        const modeSwitch = report.modeSwitch = {
            attempted: false, key: 'radio_mode_on', alphabet: 'l2700', value: 73,
            confirmed: false, observations: [],
        };
        report.phase = 'getCurrentPlaybackBefore';
        this._checkSelection(context);
        const before = await this._call('getCurrentPlayback', { deadline: context.deadline });
        report.playbackBeforeResponse = JSON.parse(json(before, 16 * 1024));
        this._checkSelection(context);
        report.playbackBefore = parseCurrentPlayback(before);
        modeSwitch.observations.push({ at: Date.now(), mode: report.playbackBefore.mode });
        await this._writeChanged('status.playback', json(before));
        if (report.playbackBefore.mode === 'radio') {
            modeSwitch.confirmed = true;
            return;
        }

        // Remote API 1.0.47, 9.4.1.1: l2700/73 is RADIO_MODE_ON.
        // InjectRCKey acknowledges receipt, so wait for the actual mode before
        // choosing a station. Do not repeat the key or fall back to RADIO/53.
        report.phase = 'radioModeOn';
        await this._safeWrite('channels.lastSelection', json(report));
        this._checkSelection(context);
        modeSwitch.attempted = true;
        const response = await this._call('key', 'radio_mode_on', { deadline: context.deadline });
        modeSwitch.response = JSON.parse(json(response, 16 * 1024));
        this._checkSelection(context);
        report.phase = 'waitRadioMode';
        const deadline = Math.min(context.deadline, Date.now() + RADIO_MODE_TIMEOUT_MS);
        for (let attempt = 0; attempt < RADIO_MODE_TIMEOUT_MS / RADIO_POLL_INTERVAL_MS; attempt++) {
            if (!await this._waitSelection(context, deadline)) break;
            const observed = await this._call('getCurrentPlayback', { deadline });
            modeSwitch.playbackResponse = JSON.parse(json(observed, 16 * 1024));
            this._checkSelection(context);
            const playback = parseCurrentPlayback(observed);
            modeSwitch.observations.push({ at: Date.now(), mode: playback.mode });
            await this._writeChanged('status.playback', json(observed));
            if (playback.mode === 'radio') {
                modeSwitch.confirmed = true;
                return;
            }
        }
        const lastMode = modeSwitch.observations.at(-1).mode;
        report.verification = lastMode === 'UNKNOWN' ? 'unknown' : 'differentMode';
        throw new ProtocolError(`Der TV meldet nach RADIO_MODE_ON weiterhin Modus ${lastMode}. `
            + 'Der Radiosender wurde deshalb nicht angewählt.', 'CHANNEL_SELECTION');
    }

    async _observeRadioSelection(context, report) {
        report.phase = 'getCurrentPlayback';
        report.playbackObservations = [];
        const deadline = Math.min(context.deadline, Date.now() + RADIO_VERIFY_TIMEOUT_MS);
        try {
            // Even a very fast SOAP reply can precede the actual station change.
            // Only observations are repeated; ZapToMedia is sent exactly once.
            for (let attempt = 0; attempt < RADIO_VERIFY_TIMEOUT_MS / RADIO_POLL_INTERVAL_MS; attempt++) {
                if (!await this._waitSelection(context, deadline)) break;
                const response = await this._call('getCurrentPlayback', { deadline });
                report.playbackResponse = JSON.parse(json(response, 16 * 1024));
                this._checkSelection(context);
                const playback = report.playback = parseCurrentPlayback(response);
                report.playbackUuidIgnored = /^chl0:00-00000000ffff00000000$/iu.test(playback.mediaItemUuid);
                const usableUuid = report.playbackUuidIgnored ? '' : playback.mediaItemUuid;
                report.stationConfirmed = false;
                if (playback.mode !== 'radio') {
                    report.verification = playback.mode === 'UNKNOWN' ? 'unknown' : 'differentMode';
                } else if (usableUuid) {
                    report.stationConfirmed = usableUuid === context.target.mediaItemUuid;
                    report.verification = report.stationConfirmed ? 'station' : 'differentStation';
                } else if (playback.locator) {
                    report.stationConfirmed = [report.resolvedLocator, context.target.locator].includes(playback.locator);
                    report.verification = report.stationConfirmed ? 'station' : 'differentStation';
                } else {
                    // The API only guarantees the additional identifiers for
                    // TV. Radio mode alone cannot confirm a particular station.
                    report.verification = 'radioModeOnly';
                }
                report.playbackObservations.push({ at: Date.now(), ...playback, verification: report.verification });
                await this._writeChanged('status.playback', json(response));
                if (report.stationConfirmed || report.verification === 'radioModeOnly') break;
            }
        } catch (error) {
            if (this.stopping || context.signal.aborted || context.intent !== this._selectionIntent
                || ['CHANNEL_UPDATING', 'CHANNEL_UNAVAILABLE'].includes(error.code)) throw error;
            // Preserve the preceding mutating request's actual result. A failed
            // observation must never trigger another zap or claim confirmation.
            report.stationConfirmed = false;
            report.verification = 'readFailed';
            report.playbackError = `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000);
        }
        report.status = report.stationConfirmed ? 'confirmed'
            : report.result === 0 && report.verification === 'radioModeOnly' ? 'accepted' : 'unconfirmed';
    }

    async _selectChannel(target, intent = this._selectionIntent) {
        const isRadio = target.itemClass === 'audio';
        // All radio reads, waits and the one zap share a finite transport budget.
        // Database operations retain their own existing short timeouts.
        const deadline = Date.now() + SELECTION_TIMEOUT_MS;
        const controller = isRadio ? new AbortController() : null;
        const context = isRadio ? { target, intent, deadline, signal: controller.signal } : null;
        if (controller) this._selectionAbort = controller;
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
            let locator = target.locator;
            if (isRadio) {
                this._checkSelection(context);
                report.phase = 'getMediaItem';
                const response = await this._call('getMediaItem', target.mediaItemUuid, { deadline });
                report.getMediaItemResponse = JSON.parse(json(response, 24 * 1024));
                this._checkSelection(context);
                const detail = parseMediaItem(response, target.mediaItemUuid);
                report.detail = detail;
                if (detail.itemClass === 'video' || /(?:^|\.)videoItem(?:\.|$)/u.test(detail.itemClass)) {
                    throw new ProtocolError('GetMediaItem hat einen TV-Eintrag für den ausgewählten Radiosender geliefert.', 'CHANNEL_SELECTION');
                }
                locator = detail.locator;
                report.locatorSource = 'GetMediaItem';
            }
            report.resolvedLocator = locator;
            if (isRadio) await this._prepareRadioMode(context, report);
            report.phase = 'zap';
            // A list refresh can finish while GetMediaItem or an ioBroker write
            // is pending. Never switch using that now outdated selection.
            this._checkRunning();
            this.channelObjects.checkTarget(target);
            if (isRadio) this._checkSelection(context);
            const response = isRadio
                ? await this._call('zap', locator, { deadline })
                : await this._call('zap', locator);
            report.zapResponse = JSON.parse(json(response, 16 * 1024));
            report.result = parseZapResult(response);
            this._checkZapResult(report.result);
            report.status = report.result === 0 ? 'accepted' : 'unconfirmed';
            if (isRadio) await this._observeRadioSelection(context, report);
            report.phase = 'complete';
        } catch (error) {
            report.status = 'error';
            report.error = `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000);
            throw error;
        } finally {
            report.finishedAt = Date.now();
            await this._safeWrite('channels.lastSelection', json(report));
            if (this._selectionAbort === controller) this._selectionAbort = null;
        }
    }

    async handleStateChange(fullId, state) {
        const prefix = `${this.adapter.namespace}.`;
        if (this.stopping || !state || state.ack || typeof fullId !== 'string' || !fullId.startsWith(prefix)) return;
        const id = fullId.slice(prefix.length);
        const object = this._objects.get(id);
        if (!object || object.type !== 'state' || !object.common.write) return;
        if (id.startsWith('api.') && !this.config.enableAdvanced) return;
        const value = state.val;
        if (['channels.view', 'channels.start', 'channels.count', 'channels.listStart', 'channels.mediaType'].includes(id)
            || id.endsWith('.parametersXml')) {
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
            this._cancelSelection();
            await this._wake(++this._powerIntent);
            return;
        }
        if (id === 'channels.refresh') {
            try { await this.channelRefresh.refresh({ manual: true }); }
            finally { if (!this.stopping) await this._write(id, false); }
            return;
        }
        if (['control.powerOff', 'remote.power_off', 'remote.power_all_code'].includes(id)) this._cancelWake();
        if (['control.powerOff', 'remote.power_off', 'remote.power_all_code', 'remote.power_on',
            'remote.radio_mode_on', 'remote.tv_mode_on', 'media.locator'].includes(id)) this._cancelSelection();
        // Capture parameter values when the send event arrives, before joining
        // the network queue. A later edit must not change an already queued command.
        const apiMatch = /^api\.([^.]+)\.send$/.exec(id);
        const channelQuery = id === 'channels.getLists' || id === 'channels.getChannels';
        const channelSelect = CHANNEL_SELECT_ID.test(id);
        const selectionIntent = this._selectionIntent;
        let channelTarget;
        let channelError;
        if (channelSelect) {
            try { channelTarget = this.channelObjects.target(id); } catch (error) { channelError = error; }
        }
        const snapshot = apiMatch
            ? this._parameter(`api.${apiMatch[1]}.parametersXml`, '')
            : channelQuery ? Promise.all([
                this._parameter('channels.view', ''), this._parameter('channels.start', 0), this._parameter('channels.count', 100),
                this._parameter('channels.listStart', 0), this._parameter('channels.mediaType', ''),
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
                    await this._selectChannel(capture.data, selectionIntent);
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
                } else if (apiMatch) {
                    const action = apiMatch[1];
                    const apiPrefix = `api.${action}`;
                    try {
                        validateParameters(action, capture.data, this.config.maxVolume);
                        const response = await this._call('request', action, capture.data);
                        await this._write(`${apiPrefix}.responseJson`, json(response));
                        const xmlTooLarge = Buffer.byteLength(response.xml) > MAX_STATE_BYTES;
                        await this._write(`${apiPrefix}.responseXml`, xmlTooLarge ? '' : response.xml);
                        await this._write(`${apiPrefix}.lastError`, '');
                        if (xmlTooLarge) {
                            await this._write(`${apiPrefix}.lastError`, 'Antwort-XML größer als 512 KiB, daher nicht in ioBroker gespeichert. Listen mit kleineren Bereichen abfragen.');
                        }
                        if (['GetVolume', 'SetVolume'].includes(action)) await this._readVolume();
                        if (['GetMute', 'SetMute'].includes(action)) await this._readMute();
                    } catch (error) {
                        if (!this.stopping) await this._write(`${apiPrefix}.lastError`, `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000));
                        throw error;
                    }
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
        this._cancelSelection();
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

module.exports = { AdapterRuntime, normalizeConfig, validateParameters };
