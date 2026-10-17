'use strict';

const { setImmediate: nextTurn } = require('node:timers/promises');
const { ProtocolError, parseChannelPage } = require('./loewe-client');
const {
    mergeChannelPage, restoreChannelCatalog, normalizeServiceRecord, createChannelDefinitions,
} = require('./channel-catalog');

const MAX_PENDING_PAGES = 20;
const MAX_SERVICES = 2000;
const SERVICE_ID = /^channels\.(tv|radio)\.service_[a-f0-9]{64}$/;

/** Object/database work runs independently from the serialized TV transport. */
class ChannelObjects {
    constructor(runtime) {
        this.runtime = runtime;
        this.adapter = runtime.adapter;
        this.catalog = null;
        this.services = new Map();
        this.applied = new Map();
        this.pending = [];
        this.worker = null;
        this.started = false;
        this.stopped = false;
        this.batchFailed = false;
        this.selectionEpoch = 0;
        this.appliedSelectionEpoch = 0;
    }

    start() {
        if (this.started || this.stopped) return;
        this.started = true;
        this.pending.unshift({ restore: true });
        this._schedule();
    }

    acceptPage(page, mediaType) {
        if (this.stopped || this.runtime.stopping) return;
        if (this.pending.length >= MAX_PENDING_PAGES) {
            throw new ProtocolError('Senderobjekte werden noch aufbereitet. Bitte die nächste Senderabfrage später starten.', 'CHANNEL_QUEUE');
        }
        const epoch = ++this.selectionEpoch;
        // Keep every accepted response in order. In particular, a later partial
        // first page must not replace a complete page and undo its removals.
        this.pending.push({ page, mediaType, epoch });
        this._schedule();
    }

    _check() {
        if (this.stopped || this.runtime.stopping || this.batchFailed) {
            throw new ProtocolError('Aufbereitung der Senderobjekte abgebrochen.', 'CANCELLED');
        }
    }

    _schedule() {
        if (this.worker || this.stopped) return;
        this.worker = this._run().catch(async error => {
            this.pending.length = 0;
            if (this.stopped || this.runtime.stopping) return;
            await Promise.all([
                this.runtime._safeWrite('channels.catalogStatus', 'error'),
                this.runtime._safeWrite('channels.catalogError', `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000)),
            ]);
            this.runtime._logError(error);
        }).finally(() => {
            this.worker = null;
            if (this.pending.length && !this.stopped) this._schedule();
        });
    }

    async whenIdle() {
        while (this.worker) await this.worker;
    }

    async _run() {
        await nextTurn();
        this.batchFailed = false;
        this._check();
        await this.runtime._write('channels.catalogStatus', 'updating');
        while (this.pending.length) {
            this._check();
            const jobs = this.pending.splice(0);
            let candidate = this.catalog;
            let candidateServices = this.services;
            let candidateEpoch = this.appliedSelectionEpoch;
            for (const job of jobs) {
                if (job.restore) {
                    await this._restore();
                    candidate = this.catalog;
                    candidateServices = this.services;
                } else {
                    candidate = this._mergePage(candidate, job.page, job.mediaType, candidateServices);
                    candidateEpoch = job.epoch;
                }
                if (candidate) candidateServices = this._catalogServices(candidate, candidateServices);
            }
            if (candidate) {
                await this.runtime._writeChanged('channels.catalog', JSON.stringify(candidate));
                this.catalog = candidate;
                this.services = candidateServices;
                this.appliedSelectionEpoch = candidateEpoch;
            }
            await this._materialize();
        }
        this._check();
        await this.runtime._write('channels.catalogError', '');
        await this.runtime._write('channels.catalogLastUpdate', Date.now());
        await this.runtime._write('channels.catalogStatus', this.services.size ? 'ready' : 'empty');
    }

    _mergePage(catalog, page, mediaType, services = this.services) {
        let previous = catalog;
        if (!previous || previous.view !== page.view) {
            // The JSON cache may have been removed while the managed objects
            // survived. A partial response must not discard that known history.
            const known = [...services.values()].filter(service => service.listView === page.view);
            if (known.length) {
                const empty = mergeChannelPage(null, {
                    view: page.view, name: page.name || '', items: [], startIndex: null, totalResults: null,
                });
                previous = restoreChannelCatalog({ ...empty, services: known });
            }
        }
        return mergeChannelPage(previous, page, { mediaType });
    }

    _catalogServices(catalog, previous = this.services) {
        const desired = new Map(catalog.services.map(service => [service.id, service]));
        if (new Set([...previous.keys(), ...desired.keys()]).size > MAX_SERVICES) {
            throw new ProtocolError(`Höchstens ${MAX_SERVICES} Senderobjekte je Instanz werden verwaltet.`, 'CHANNEL_LIMIT');
        }
        const services = new Map(previous);
        for (const [id, service] of services) {
            const replaced = service.listView !== catalog.view || (catalog.lastQuery.reconciled
                && (!catalog.lastQuery.mediaType || service.itemClass === catalog.lastQuery.mediaType));
            if (!desired.has(id) && service.available && replaced) services.set(id, { ...service, available: false });
        }
        for (const [id, service] of desired) services.set(id, service);
        return services;
    }

    async _restore() {
        this._check();
        if (typeof this.adapter.getAdapterObjectsAsync === 'function') {
            const objects = await this.runtime._database(() => {
                this._check();
                return this.adapter.getAdapterObjectsAsync();
            }, 'Gespeicherte Senderobjekte');
            const prefix = `${this.adapter.namespace}.`;
            let invalid = 0;
            for (const [fullId, object] of Object.entries(objects || {})) {
                if (!fullId.startsWith(prefix)) continue;
                const id = fullId.slice(prefix.length);
                if (!SERVICE_ID.test(id) || object.type !== 'channel' || object.native?.channelService?.schemaVersion !== 1) continue;
                try {
                    const service = normalizeServiceRecord(object.native.channelService.service);
                    if (service.id !== id) throw new Error('Senderkennung stimmt nicht überein.');
                    if (this.services.size >= MAX_SERVICES) throw new ProtocolError('Zu viele gespeicherte Senderobjekte.', 'CHANNEL_LIMIT');
                    this.services.set(id, service);
                } catch (error) {
                    if (error.code === 'CHANNEL_LIMIT') throw error;
                    invalid++;
                }
            }
            if (invalid) this.adapter.log.warn(`${invalid} ungültige gespeicherte Senderobjekte wurden nicht als Steuerziele übernommen.`);
        }
        this._check();
        const saved = await this.runtime._readState('channels.catalog');
        if (typeof saved?.val === 'string' && saved.val && saved.val !== '{}') {
            this.catalog = restoreChannelCatalog(saved.val);
            return;
        }
        // Upgrade from 0.1.2: use the already captured response, without waking
        // or contacting the TV. New network responses can be queued meanwhile.
        const raw = await this.runtime._readState('channels.items');
        if (typeof raw?.val !== 'string' || !raw.val || raw.val === '{}') return;
        let data;
        try { data = JSON.parse(raw.val); } catch {
            throw new ProtocolError('Gespeicherte Senderantwort enthält ungültiges JSON. Senderliste erneut abfragen.', 'INVALID_RESPONSE');
        }
        if (data.omitted) return;
        const page = parseChannelPage({ data });
        if (!page.view) {
            const view = await this.runtime._parameter('channels.view', '');
            page.view = typeof view === 'string' ? view.trim() : '';
        }
        const mediaType = ['video', 'audio'].includes(page.itemClass) ? page.itemClass : '';
        this.catalog = this._mergePage(null, page, mediaType);
    }

    async _materialize() {
        const updates = [...this.services.values()].filter(service => this.applied.get(service.id) !== JSON.stringify(service));
        let index = 0;
        let firstError;
        const work = async () => {
            while (index < updates.length && !this.batchFailed) {
                const service = updates[index++];
                try {
                    this._check();
                    await this._syncService(service);
                    await nextTurn();
                } catch (error) {
                    firstError ||= error;
                    this.batchFailed = true;
                }
            }
        };
        // Bound outstanding DB operations; a timeout stops the entire batch.
        await Promise.all([work(), work()]);
        if (firstError) throw firstError;
    }

    async _syncService(service) {
        const { definitions, values } = createChannelDefinitions(service);
        for (const definition of definitions) {
            this._check();
            const { id, ...object } = definition;
            if (id === service.id) object.native = { ...object.native, channelService: { schemaVersion: 1, service } };
            await this.runtime._database(() => {
                this._check();
                return this.adapter.extendObjectAsync(id, object);
            }, `Senderobjekt ${id}`);
        }
        for (const [id, value] of Object.entries(values)) {
            this._check();
            await this.runtime._writeChanged(id, value);
        }
        this._check();
        if (!this.applied.has(service.id)) await this.runtime._write(`${service.id}.select`, false);
        this._check();
        // Registration follows resetting the button. No persisted true value
        // from an older adapter process may ever execute a channel selection.
        for (const { id, ...object } of definitions) this.runtime._objects.set(id, object);
        this.applied.set(service.id, JSON.stringify(service));
    }

    target(buttonId) {
        if (this.appliedSelectionEpoch !== this.selectionEpoch) {
            throw new ProtocolError('Eine neue Senderantwort wird noch übernommen. Bitte den Sender danach erneut auswählen.', 'CHANNEL_UPDATING');
        }
        const id = buttonId.endsWith('.select') ? buttonId.slice(0, -7) : '';
        const service = this.services.get(id);
        if (!service || !service.available || !service.locator) {
            throw new ProtocolError('Dieser Sender ist im zuletzt geladenen Senderbestand nicht verfügbar. Die passende Senderliste erneut abfragen.', 'CHANNEL_UNAVAILABLE');
        }
        return { id, locator: service.locator, epoch: this.selectionEpoch };
    }

    checkTarget(target) {
        if (target.epoch !== this.selectionEpoch || this.appliedSelectionEpoch !== this.selectionEpoch) {
            throw new ProtocolError('Die Senderliste wurde während der Wartezeit aktualisiert. Bitte den Sender erneut auswählen.', 'CHANNEL_UPDATING');
        }
        const current = this.services.get(target.id);
        if (!current?.available || !current.positions.some(position => position.locator === target.locator)) {
            throw new ProtocolError('Der Sender wurde während der Wartezeit geändert oder entfernt. Bitte erneut auswählen.', 'CHANNEL_UNAVAILABLE');
        }
    }

    stop() {
        this.stopped = true;
        this.pending.length = 0;
    }
}

module.exports = { ChannelObjects };
