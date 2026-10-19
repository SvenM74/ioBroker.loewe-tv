'use strict';

const utils = require('@iobroker/adapter-core');
const { AdapterRuntime } = require('./lib/adapter-runtime');
const EPG_COMMANDS = ['getEpgGuide', 'refreshEpgGuide', 'selectEpgProgramme', 'recordEpgProgramme', 'getRecordings', 'cancelRecording'];
const REMOTE_COMMANDS = ['sendRemoteCommand', 'getRemoteStatus'];

function epgGuideUrl(namespace, message) {
    // iframeSendTo requires a URL string, including during adapter startup.
    // Keep the Admin's proxy prefix, but never accept a host or relative traversal.
    let base = '';
    const candidate = message?.basePath;
    if (typeof candidate === 'string' && candidate.length <= 2048
        && /^\/(?!\/)[A-Za-z0-9._~%/-]*$/u.test(candidate) && candidate.endsWith('/')) {
        try {
            const decoded = decodeURIComponent(candidate);
            if (!/[\u0000-\u0020\u007f\\?#%]/u.test(decoded) && !decoded.includes('//')
                && !decoded.split('/').some(part => part === '.' || part === '..')) base = candidate;
        } catch { /* A malformed proxy prefix falls back to Admin-relative assets. */ }
    }
    const instance = /^loewe-tv\.(0|[1-9]\d{0,8})$/u.exec(namespace || '')?.[1];
    return `${base}adapter/loewe-tv/epg.html?${instance === undefined ? 'invalidInstance=1' : `instance=${instance}`}`;
}

// Admin 7's selectSendTo expects an array even when discovery fails. Returning
// { error } would break the selector instead of showing the connection problem.
function messageFailure(command, message, error) {
    const reason = typeof error?.message === 'string' ? error.message : 'Die Anfrage ist fehlgeschlagen.';
    if (REMOTE_COMMANDS.includes(command)) {
        return { ok: false, error: reason.slice(0, 1200),
            code: typeof error?.code === 'string' ? error.code.slice(0, 80) : 'REMOTE_FAILED',
            delivery: error?.delivery === 'notSent' || command === 'getRemoteStatus' ? 'notSent' : 'unknown' };
    }
    if (EPG_COMMANDS.includes(command)) {
        return { error: reason.slice(0, 1200), code: typeof error?.code === 'string' ? error.code.slice(0, 80) : 'EPG_GUIDE_UNAVAILABLE' };
    }
    if (command === 'getDiscoveredTvs') return [{ value: '', label: `Gerätesuche nicht verfügbar: ${reason}` }];
    if (command !== 'getChannelLists') return { error: reason };
    const options = [{ value: '', label: `Senderlisten nicht verfügbar: ${reason}` }];
    const selected = typeof message?.channelListView === 'string' ? message.channelListView.trim() : '';
    if (selected && Buffer.byteLength(selected, 'utf8') <= 2048 && !/[\u0000-\u001f\u007f]/u.test(selected)) {
        options.push({ value: selected, label: `${selected} (Auswahl beibehalten; ${reason})` });
    }
    return options;
}

class LoeweTv extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'loewe-tv' });
        this.runtime = null;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.runtime = new AdapterRuntime(this);
        try {
            await this.runtime.start();
        } catch (error) {
            this.log.error(`Adapter konnte nicht starten: ${error.message}`);
            await this.runtime._recordError(error);
        }
    }

    onStateChange(id, state) {
        if (this.runtime) {
            void this.runtime.handleStateChange(id, state).catch(error => {
                this.log.error(`Datenpunkt konnte nicht verarbeitet werden: ${error.message}`);
            });
        }
    }

    async onMessage(message) {
        if (!message || !message.callback || typeof message.from !== 'string' || !message.from
            || !['getChannelLists', 'refreshChannelLists', 'getDiscoveredTvs', 'discoverTvs',
                'getEpgGuideUrl', ...EPG_COMMANDS, ...REMOTE_COMMANDS].includes(message.command)) return;

        if (message.command === 'getEpgGuideUrl') {
            // Render the guide even before the runtime is ready. Its own error
            // view then explains startup/offline problems without a blank frame.
            try {
                this.sendTo(message.from, message.command, epgGuideUrl(this.namespace, message.message), message.callback);
            } catch (error) {
                this.log.debug(`EPG-Oberfläche konnte nicht geladen werden: ${error.message}`);
            }
            return;
        }

        let timer;
        let completed = false;
        let dispatched = false;
        const reply = response => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            try {
                this.sendTo(message.from, message.command, response, message.callback);
            } catch (error) {
                this.log.debug(`Antwort an die Konfiguration konnte nicht gesendet werden: ${error.message}`);
            }
        };

        // Network searches have their own shorter runtime deadlines. Keep the UI response
        // bounded even if startup or a future runtime implementation fails.
        const timeout = message.command === 'getChannelLists' ? 35000
            : ['discoverTvs', 'selectEpgProgramme', 'sendRemoteCommand'].includes(message.command) ? 10000
                : ['recordEpgProgramme', 'cancelRecording'].includes(message.command) ? 6000 : 4000;
        timer = setTimeout(() => {
            const error = new Error('Zeitlimit erreicht. Fernseher und laufende Adapterinstanz prüfen.');
            if (REMOTE_COMMANDS.includes(message.command)) {
                Object.assign(error, { code: 'REMOTE_TIMEOUT', delivery: dispatched ? 'unknown' : 'notSent' });
            }
            reply(messageFailure(message.command, message.message, error));
        }, timeout);
        timer.unref?.();

        try {
            if (!this.runtime) throw Object.assign(new Error('Die Adapterinstanz ist noch nicht bereit. Bitte erneut versuchen.'),
                REMOTE_COMMANDS.includes(message.command) ? { code: 'REMOTE_UNAVAILABLE', delivery: 'notSent' } : {});
            dispatched = true;
            const response = await this.runtime.handleMessage(message.command, message.message);
            if (['getChannelLists', 'getDiscoveredTvs'].includes(message.command) && !Array.isArray(response)) {
                throw new Error(message.command === 'getChannelLists'
                    ? 'Ungültige Antwort beim Laden der Senderlisten.' : 'Ungültige Antwort beim Laden der gefundenen Fernseher.');
            }
            if (EPG_COMMANDS.includes(message.command)
                && (!response || typeof response !== 'object' || Array.isArray(response))) {
                throw new Error('Ungültige Antwort der EPG-Übersicht.');
            }
            if (REMOTE_COMMANDS.includes(message.command)
                && (!response || typeof response !== 'object' || Array.isArray(response)
                    || response.ok !== true || response.instance !== this.namespace
                    || (message.command === 'sendRemoteCommand' && (response.key !== message.message?.key
                        || !(response.key === 'power_on' ? ['started', 'alreadyRunning'] : ['sent']).includes(response.status)
                        || typeof response.message !== 'string'))
                    || (message.command === 'getRemoteStatus' && (typeof response.connected !== 'boolean'
                        || typeof response.commandPending !== 'boolean'
                        || (response.powerOn !== null && (!response.powerOn || typeof response.powerOn !== 'object' || Array.isArray(response.powerOn))))))) {
                throw Object.assign(new Error('Ungültige Antwort der Fernbedienung.'), { code: 'REMOTE_INVALID_RESPONSE' });
            }
            reply(response);
        } catch (error) {
            reply(messageFailure(message.command, message.message, error));
        }
    }

    async onUnload(callback) {
        let timer;
        let completed = false;
        const finish = () => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            callback();
        };
        // The controller's normal unload deadline is 500 ms. This callback must
        // also complete if a database or optional transport never settles.
        timer = setTimeout(finish, 250);
        try {
            await this.runtime?.stop();
        } catch (error) {
            this.log.debug(`Fehler beim Beenden: ${error.message}`);
        } finally {
            finish();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new LoeweTv(options);
} else {
    new LoeweTv();
}
