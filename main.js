'use strict';

const utils = require('@iobroker/adapter-core');
const { AdapterRuntime } = require('./lib/adapter-runtime');

class LoeweTv extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'loewe-tv' });
        this.runtime = null;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
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
