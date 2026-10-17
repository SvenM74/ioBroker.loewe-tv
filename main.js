'use strict';

const utils = require('@iobroker/adapter-core');
const { AdapterRuntime } = require('./lib/adapter-runtime');

// Admin 7's selectSendTo expects an array even when discovery fails. Returning
// { error } would break the selector instead of showing the connection problem.
function messageFailure(command, message, error) {
    const reason = typeof error?.message === 'string' ? error.message : 'Die Anfrage ist fehlgeschlagen.';
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
            || !['getChannelLists', 'refreshChannelLists'].includes(message.command)) return;

        let timer;
        let completed = false;
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

        // Discovery has its own shorter runtime deadline. Keep the UI response
        // bounded even if startup or a future runtime implementation fails.
        const timeout = message.command === 'getChannelLists' ? 35000 : 4000;
        timer = setTimeout(() => reply(messageFailure(message.command, message.message,
            new Error('Zeitlimit erreicht. Fernseher und laufende Adapterinstanz prüfen.'))), timeout);
        timer.unref?.();

        try {
            if (!this.runtime) throw new Error('Die Adapterinstanz ist noch nicht bereit. Bitte erneut versuchen.');
            const response = await this.runtime.handleMessage(message.command, message.message);
            if (message.command === 'getChannelLists' && !Array.isArray(response)) {
                throw new Error('Ungültige Antwort beim Laden der Senderlisten.');
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
