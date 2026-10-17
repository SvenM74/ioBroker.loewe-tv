'use strict';

const { LoeweClient, KEYS, TABLET_ACTIONS, buildEnvelope, parseResponse, createWolPacket, ProtocolError } = require('./loewe-client');
const { createDefinitions } = require('./states');

const ACTION_SET = new Set(TABLET_ACTIONS);
const MAX_QUEUE = 20;
const MAX_QUEUE_AGE_MS = 30000;
const DATABASE_TIMEOUT_MS = 2000;
const MAX_STATE_BYTES = 512 * 1024;
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
        timeout: integer('timeout', 5000, 1000, 30000),
        maxVolume: integer('maxVolume', 99, 0, 99),
        appendNul: boolean('appendNul', true), enableAdvanced: boolean('enableAdvanced', false),
        pollPlayback: boolean('pollPlayback', true),
        macLan: string('macLan'), macWlan: string('macWlan'),
        broadcastAddress: string('broadcastAddress', '255.255.255.255'),
    };
    if (config.pollInterval > 0 && config.pollInterval < 5) {
        throw validation('pollInterval muss 0 (aus) oder mindestens 5 Sekunden sein.');
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
    constructor(adapter, { clientFactory = options => new LoeweClient(options) } = {}) {
        this.adapter = adapter;
        this.clientFactory = clientFactory;
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
        this._lastLoggedError = '';
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

    async _write(id, val, timeout = DATABASE_TIMEOUT_MS) {
        const allowed = () => !this.stopping || (val === false && ['info.connection', 'info.commandPending'].includes(id));
        if (!allowed()) return;
        const written = await this._database(async () => {
            // The deadline helper yields once before invoking the DB operation.
            // stop() may have run in that gap, so check again at the actual write.
            if (!allowed()) return false;
            await this.adapter.setStateAsync(id, { val, ack: true });
            return true;
        }, id, timeout);
        if (written && allowed()) this._lastValues.set(id, val);
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
        if (this.config.pollInterval > 0) {
            await this.poll();
            this._schedule();
        }
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
        this._connected = true;
        await this._writeChanged('info.connection', true);
        await this._write('info.lastSeen', Date.now());
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
        if (readDevice) await this._optional('getSettings', 'device.settings');
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

    _wake() {
        if (this._wakePromise) return this._wakePromise;
        this._wakeActive = true;
        const startedAt = Date.now();
        const run = async () => {
            let notifications = Promise.resolve();
            try {
                this._checkRunning();
                const macs = this._wakeMacs();
                if (!macs.length) throw validation(
                    'Keine TV-MAC-Adresse bekannt. LAN-/WLAN-MAC konfigurieren oder bei eingeschaltetem TV control.refresh auslösen.',
                );
                // Start the datagram operation before awaiting database writes.
                // WOL must work while an offline TV holds the SOAP queue.
                const transport = this.client.wake(macs, this.config.broadcastAddress, { repeats: 3, autoBroadcast: true });
                notifications = Promise.all([
                    this._safeWrite('info.commandPending', true),
                    this._safeWrite('info.lastCommand', 'control.powerOn'),
                    this._safeWrite('info.lastCommandAt', startedAt),
                ]);
                const response = await transport;
                this._checkRunning();
                const details = { sentAt: startedAt, ...response };
                await this._safeWrite('info.lastWakeOnLan', json(details));
                await this._safeWrite('info.lastResponse', json({ wakeOnLan: details }));
                await this._safeWrite('info.lastError', '');
                return true;
            } catch (error) {
                await this._recordError(error, { affectConnection: false });
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
        }).finally(() => { this._wakePromise = null; });
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

    async _ackParameter(id, value) {
        if (id === 'channels.view' || id.endsWith('.parametersXml')) {
            if (typeof value !== 'string') throw validation('Dieser Datenpunkt erwartet Text.');
            if (Buffer.byteLength(value) > 1024 * 1024) throw validation('Parametertext ist auf 1 MiB begrenzt.');
        } else if (id === 'channels.start') {
            if (!Number.isSafeInteger(value) || value < 0) throw validation('channels.start muss eine ganze Zahl ab 0 sein.');
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

    async handleStateChange(fullId, state) {
        const prefix = `${this.adapter.namespace}.`;
        if (this.stopping || !state || state.ack || typeof fullId !== 'string' || !fullId.startsWith(prefix)) return;
        const id = fullId.slice(prefix.length);
        const object = this._objects.get(id);
        if (!object || object.type !== 'state' || !object.common.write) return;
        if (id.startsWith('api.') && !this.config.enableAdvanced) return;
        const value = state.val;
        if (id === 'channels.view' || id === 'channels.start' || id === 'channels.count' || id.endsWith('.parametersXml')) {
            try {
                await this._ackParameter(id, value);
            } catch (error) {
                await this._recordError(error);
                if (this._parameters.has(id)) await this._write(id, this._parameters.get(id));
            }
            return;
        }
        const isButton = object.common.role === 'button';
        if (isButton && value === false) {
            await this._write(id, false);
            return;
        }
        if (isButton && value !== true) {
            await this._recordError(validation('Tasten werden mit dem booleschen Wert true ausgelöst.'));
            await this._write(id, false);
            return;
        }
        if (id === 'control.powerOn') {
            await this._wake();
            return;
        }
        // Capture parameter values when the send event arrives, before joining
        // the network queue. A later edit must not change an already queued command.
        const apiMatch = /^api\.([^.]+)\.send$/.exec(id);
        const snapshot = apiMatch
            ? this._parameter(`api.${apiMatch[1]}.parametersXml`, '')
            : id.startsWith('channels.') ? Promise.all([
                this._parameter('channels.view', ''), this._parameter('channels.start', 0), this._parameter('channels.count', 100),
            ]) : Promise.resolve(null);
        // Attach a handler now to avoid a DB error becoming an unhandled rejection
        // while another network command is still running.
        const captured = snapshot.then(data => ({ data }), error => ({ error }));
        let successful = false;
        try {
            successful = await this._enqueue(id, async () => {
                const capture = await captured;
                if (capture.error) throw capture.error;
                if (id === 'control.volume') {
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
                    await this._call('key', 'power_off');
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
                    await this._call('zap', value);
                    await this._write(id, value);
                } else if (id === 'channels.getLists' || id === 'channels.getChannels') {
                    const [view, start, count] = capture.data;
                    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 1 || count > 500) {
                        throw validation('Senderabfrage: start >= 0 und count zwischen 1 und 500 erforderlich.');
                    }
                    const response = id === 'channels.getLists'
                        ? await this._call('getChannelLists', start, count)
                        : await this._call('getChannels', view, start, count);
                    await this._write(id === 'channels.getLists' ? 'channels.lists' : 'channels.items', json(response));
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
                if (isButton) await this._write(id, false);
                else if (!successful) await this._restoreConfirmed(id);
            }
        }
    }

    async stop() {
        if (this.stopping) return;
        this.stopping = true;
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
