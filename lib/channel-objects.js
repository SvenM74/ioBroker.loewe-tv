'use strict';

const { setImmediate: nextTurn } = require('node:timers/promises');
const { ProtocolError, parseChannelPage } = require('./loewe-client');
const {
    SCHEMA_VERSION, mergeChannelPage, restoreChannelCatalog, normalizeServiceRecord, migrateServiceRecord,
    mergeServiceRecords, serviceIdentity, createChannelDefinitions,
} = require('./channel-catalog');

const MAX_PENDING_PAGES = 20;
const MAX_SERVICES = 2000;
const SERVICE_ID = /^channels\.(tv|radio)\.[A-Za-z0-9_]+$/;
const POSITION_ID = /^channels\.(tv|radio)\.(0|[1-9]\d*)$/;
const LEGACY_ID = /^channels\.(tv|radio)\.service_[a-f0-9]{64}$/;
const OWNER = 'loewe-tv-channel-catalog';
const CHILD_TYPES = Object.freeze({
    select: 'state', name: 'state', number: 'state', numbers: 'state', mediaItemUuid: 'state',
    locator: 'state', locators: 'state', positions: 'state', listView: 'state', available: 'state',
    epg: 'channel', 'epg.status': 'state',
});

function protectedObject(object) {
    return Boolean(object?.common?.dontDelete || (object?.common?.custom
        && Object.keys(object.common.custom).length));
}

function managedRoot(id, object) {
    const schema = object?.native?.channelService?.schemaVersion;
    const validId = schema === 1 ? LEGACY_ID.test(id) : schema === 2 ? POSITION_ID.test(id)
        : schema === SCHEMA_VERSION && SERVICE_ID.test(id);
    return validId && object?.type === 'channel' && object.native?.managedBy === OWNER;
}

function managedChild(rootId, id, object) {
    const suffix = id.slice(rootId.length + 1);
    return id.startsWith(`${rootId}.`) && Object.hasOwn(CHILD_TYPES, suffix) && object?.type === CHILD_TYPES[suffix]
        && (object.native?.managedBy === OWNER || (LEGACY_ID.test(rootId) && !object.native?.managedBy));
}

function positionKey(service, position) {
    const caption = /^\d+$/u.test(position.caption) ? position.caption : /^channel:\/\/(\d+):/u.exec(position.locator)?.[1];
    return JSON.stringify([service.listView, service.itemClass, Number(caption)]);
}

/** Prefer newer schemas/caches, then combine old slots without losing positions. */
function restoreServices(records) {
    const groups = new Map();
    let conflicts = 0;
    for (const record of records) {
        const key = serviceIdentity(record.service);
        const previous = groups.get(key);
        if (!previous || previous.rank < record.rank) groups.set(key, { rank: record.rank, records: [record.service] });
        else if (previous.rank === record.rank) previous.records.push(record.service);
    }
    const combined = [];
    for (const [key, group] of groups) {
        try {
            for (const service of mergeServiceRecords(group.records)) combined.push({ key, rank: group.rank, service });
        } catch {
            // Old position folders can disagree after a partial rename. Keep
            // them unregistered until fresh data arrives, without losing other
            // services or live responses already queued during restoration.
            conflicts++;
        }
    }
    // A newer stored occupant invalidates an older claimant. Equal-ranked,
    // different claimants are all disabled until a fresh response resolves it.
    const slots = new Map();
    for (const [key, group] of groups) {
        const rank = group.rank;
        for (const service of group.records) {
            for (const position of service.positions) {
                const slot = positionKey(service, position);
                const previous = slots.get(slot);
                // A newer explicit unavailable observation still disproves an
                // older occupant. At the same rank only active claims compete.
                if (!previous || previous.rank < rank) slots.set(slot, { rank, keys: new Set(service.available ? [key] : []) });
                else if (previous.rank === rank && service.available) previous.keys.add(key);
            }
        }
    }
    const services = combined.map(({ key, rank, service }) => {
        if (!service.available) return service;
        const positions = service.positions.filter(position => {
            const owner = slots.get(positionKey(service, position));
            return owner.rank === rank && owner.keys.size === 1 && owner.keys.has(key);
        });
        if (positions.length === service.positions.length) return service;
        conflicts++;
        return normalizeServiceRecord({ ...service, positions: positions.length ? positions : service.positions,
            available: positions.length > 0 });
    });
    // Only IDs already stored with schema 3 are authoritative assignments.
    // Generated names from older numeric/hash records must not steal one.
    const reserved = [];
    const ids = new Set();
    const identities = new Set();
    for (const record of [...records].sort((a, b) => b.rank - a.rank)) {
        if (record.rank < 5) continue;
        const key = serviceIdentity(record.service);
        if (ids.has(record.service.id) || identities.has(key)) continue;
        ids.add(record.service.id);
        identities.add(key);
        reserved.push(record.service);
    }
    return { services: mergeServiceRecords(services, reserved), conflicts };
}

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
        this.managed = new Set();
        this.legacy = new Map();
        this.retirement = new Set();
        this.retirementWarnings = new Set();
        this.inFlight = new Set();
        this.resetWrites = new Map();
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
            // A database timeout cannot cancel its underlying mutation. Keep
            // this worker occupied until it settles, so a late delete/extend
            // cannot corrupt a newer occupant of the same programme position.
            await Promise.allSettled([...this.inFlight]);
        }).finally(() => {
            this.worker = null;
            if (this.pending.length && !this.stopped) this._schedule();
        });
    }

    async whenIdle() {
        while (this.worker) await this.worker;
    }

    _database(operation, label) {
        return this.runtime._database(() => {
            this._check();
            const pending = Promise.resolve().then(() => {
                this._check();
                return operation();
            });
            this.inFlight.add(pending);
            void pending.finally(() => this.inFlight.delete(pending)).catch(() => undefined);
            return pending;
        }, label);
    }

    trackButtonReset(id, operation) {
        // Track the underlying mutation, not the caller's timeout promise: a
        // timed-out setStateAsync can still finish after its object is deleted.
        const pending = Promise.resolve(operation);
        let writes = this.resetWrites.get(id);
        if (!writes) {
            writes = new Set();
            this.resetWrites.set(id, writes);
        }
        writes.add(pending);
        this.inFlight.add(pending);
        void pending.finally(() => {
            writes.delete(pending);
            if (!writes.size) this.resetWrites.delete(id);
            this.inFlight.delete(pending);
        }).catch(() => undefined);
        return pending;
    }

    async _waitButtonResets(id) {
        const pending = [];
        for (const [buttonId, writes] of this.resetWrites) {
            if (buttonId.startsWith(`${id}.`)) pending.push(...writes);
        }
        if (!pending.length) return;
        await this._database(() => Promise.allSettled(pending), `Ausstehende Taster-Rücksetzungen ${id}`);
        this._check();
    }

    async _writeValue(id, value, force = false) {
        this._check();
        if (!force && this.runtime._lastValues.has(id) && this.runtime._lastValues.get(id) === value) return;
        await this._database(() => this.adapter.setStateAsync(id, { val: value, ack: true }), id);
        this._check();
        this.runtime._lastValues.set(id, value);
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
                if (candidate) candidateServices = this._catalogServices(candidate, candidateServices, !job.restore);
            }
            if (candidate) {
                await this._writeValue('channels.catalog', JSON.stringify(candidate));
                this.catalog = candidate;
                this.services = candidateServices;
            }
            await this._materialize();
            await this._cleanup();
            this.appliedSelectionEpoch = candidateEpoch;
        }
        this._check();
        const skipped = this.catalog?.lastQuery?.skipped || 0;
        await this.runtime._write('channels.catalogError', skipped
            ? `${skipped} nicht eindeutig zuordenbare Sendereinträge wurden ausgelassen. Der übrige bisherige Bestand bleibt erhalten.` : '');
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

    _catalogServices(catalog, previous = this.services, live = false) {
        const desired = new Map(catalog.services.map(service => [service.id, service]));
        const identities = new Set(catalog.services.map(serviceIdentity));
        const services = new Map(previous);
        for (const [id, service] of services) {
            const replaced = live && catalog.lastQuery.reconciled
                && (!catalog.lastQuery.mediaType || service.itemClass === catalog.lastQuery.mediaType);
            if (!desired.has(id) && (replaced || identities.has(serviceIdentity(service)))) {
                services.delete(id);
                this.retirement.add(id);
            } else if (!desired.has(id) && service.listView !== catalog.view) {
                services.set(id, { ...service, available: false });
            }
        }
        for (const [id, service] of desired) services.set(id, service);
        if (services.size > MAX_SERVICES) {
            throw new ProtocolError(`Höchstens ${MAX_SERVICES} Sender je Instanz werden verwaltet.`, 'CHANNEL_LIMIT');
        }
        if (live && catalog.lastQuery.reconciled) {
            for (const id of this.managed) {
                const type = id.startsWith('channels.tv.') ? 'video' : 'audio';
                if ((!catalog.lastQuery.mediaType || type === catalog.lastQuery.mediaType) && !services.has(id)) this.retirement.add(id);
            }
        }
        return services;
    }

    async _restore() {
        this._check();
        const records = [];
        const roots = new Map();
        const retired = [];
        let invalid = 0;
        if (typeof this.adapter.getAdapterObjectsAsync === 'function') {
            const objects = await this.runtime._database(() => {
                this._check();
                return this.adapter.getAdapterObjectsAsync();
            }, 'Gespeicherte Senderobjekte');
            const prefix = `${this.adapter.namespace}.`;
            for (const [fullId, object] of Object.entries(objects || {})) {
                if (!fullId.startsWith(prefix)) continue;
                const id = fullId.slice(prefix.length);
                if (!managedRoot(id, object)) continue;
                this.managed.add(id);
                if (object.native.channelRetired) {
                    this.retirement.add(id);
                    const schema = object.native.channelService.schemaVersion;
                    try {
                        const stored = object.native.channelService.service;
                        if (stored?.id !== id) throw new Error('Senderkennung stimmt nicht überein.');
                        const services = schema === SCHEMA_VERSION ? [normalizeServiceRecord(stored)] : migrateServiceRecord(stored);
                        for (const service of services) retired.push({ id, schema, identity: serviceIdentity(service) });
                    } catch { invalid++; }
                    continue;
                }
                try {
                    const schema = object.native.channelService.schemaVersion;
                    const stored = object.native.channelService.service;
                    if (stored?.id !== id) throw new Error('Senderkennung stimmt nicht überein.');
                    const services = schema === SCHEMA_VERSION ? [normalizeServiceRecord(stored)] : migrateServiceRecord(stored);
                    roots.set(id, services.map(serviceIdentity));
                    records.push(...services.map(service => ({ service, rank: schema * 2 - 1 })));
                    if (records.length > MAX_SERVICES * 3) throw new ProtocolError('Zu viele gespeicherte Senderobjekte.', 'CHANNEL_LIMIT');
                } catch (error) {
                    if (error.code === 'CHANNEL_LIMIT') throw error;
                    invalid++;
                }
            }
        }
        this._check();
        const saved = await this.runtime._readState('channels.catalog');
        let catalog = null;
        if (typeof saved?.val === 'string' && saved.val && saved.val !== '{}') {
            try {
                catalog = restoreChannelCatalog(saved.val);
                const schema = JSON.parse(saved.val).schemaVersion;
                records.push(...catalog.services.filter(service => !retired.some(root =>
                    root.id === service.id || (schema <= root.schema && serviceIdentity(service) === root.identity)))
                    .map(service => ({ service, rank: schema * 2 })));
            } catch (error) {
                // A broken cache must not discard a new live response already
                // queued while startup was reading the database.
                this.runtime._logError(error);
            }
        }
        const restored = restoreServices(records);
        invalid += restored.conflicts;
        if (restored.services.length > MAX_SERVICES) throw new ProtocolError('Zu viele gespeicherte Senderobjekte.', 'CHANNEL_LIMIT');
        this.services = new Map(restored.services.map(service => [service.id, service]));
        const replacements = new Map(restored.services.map(service => [serviceIdentity(service), service.id]));
        for (const [id, identities] of roots) {
            const ids = [...new Set(identities.map(identity => replacements.get(identity)).filter(Boolean))];
            if (ids.length && !ids.includes(id)) this.legacy.set(id, ids);
        }
        if (invalid) this.adapter.log.warn(`${invalid} ungültige gespeicherte Senderobjekte wurden nicht als Steuerziele übernommen.`);
        if (catalog) {
            // A schema-2 cache left behind during an upgrade must not replace
            // newer schema-3 native positions or assigned collision suffixes.
            this.catalog = restoreChannelCatalog({ ...catalog,
                services: restored.services.filter(service => service.listView === catalog.view) });
            return;
        }
        // Upgrade from 0.1.2: use the already captured response, without waking
        // or contacting the TV. New network responses can be queued meanwhile.
        const raw = await this.runtime._readState('channels.items');
        if (typeof raw?.val !== 'string' || !raw.val || raw.val === '{}') return;
        try {
            let data;
            try { data = JSON.parse(raw.val); } catch {
                throw new ProtocolError('Gespeicherte Senderantwort enthält ungültiges JSON. Senderliste erneut abfragen.', 'INVALID_RESPONSE');
            }
            if (data?.omitted) return;
            const page = parseChannelPage({ data });
            if (!page.view) {
                const view = await this.runtime._parameter('channels.view', '');
                page.view = typeof view === 'string' ? view.trim() : '';
            }
            const mediaType = ['video', 'audio'].includes(page.itemClass) ? page.itemClass : '';
            this.catalog = this._mergePage(null, page, mediaType);
            this.catalog = restoreChannelCatalog({ ...this.catalog,
                services: this.catalog.services.filter(service => !retired.some(root => root.id === service.id
                    || root.identity === serviceIdentity(service))) });
        } catch (error) {
            // As with a broken catalogue, a damaged legacy response cannot
            // invalidate the live pages already queued behind restoration.
            this.runtime._logError(error);
        }
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

    _forget(id, subtree = false) {
        for (const map of [this.runtime._objects, this.runtime._lastValues]) {
            for (const key of map.keys()) if (key === id || (subtree && key.startsWith(`${id}.`))) map.delete(key);
        }
        this.applied.delete(id);
    }

    async _inventory() {
        if (typeof this.adapter.getObjectListAsync !== 'function' || typeof this.adapter.getObjectAsync !== 'function'
            || typeof this.adapter.delObjectAsync !== 'function') {
            throw new ProtocolError('Die ioBroker-Objektverwaltung für die Senderbereinigung ist nicht verfügbar.', 'DATABASE');
        }
        const prefix = `${this.adapter.namespace}.channels.`;
        const result = await this._database(() => this.adapter.getObjectListAsync({
            startkey: prefix, endkey: `${prefix}\u9999`, include_docs: true,
        }), 'Senderbestand für Bereinigung');
        if (!Array.isArray(result?.rows)) throw new ProtocolError('Die Senderinventur ist unvollständig.', 'DATABASE');
        const objects = new Map();
        for (const row of result.rows) {
            if (typeof row.id !== 'string' || !row.id.startsWith(prefix)) continue;
            const object = row.doc || row.value;
            if (object && typeof object === 'object') objects.set(row.id.slice(this.adapter.namespace.length + 1), object);
        }
        return objects;
    }

    _readObject(id) {
        return this._database(() => this.adapter.getObjectAsync(id), `Senderobjekt ${id} vor Bereinigung`);
    }

    async _retainRetired(id) {
        const object = await this._readObject(id);
        if (!managedRoot(id, object)) return;
        this._forget(id, true);
        if (!object.native.channelRetired) {
            await this._database(() => this.adapter.extendObjectAsync(id, { native: { channelRetired: true } }), `Altordner ${id}`);
        }
        for (const suffix of ['select', 'available']) {
            const childId = `${id}.${suffix}`;
            const child = await this._readObject(childId);
            if (!managedChild(id, childId, child) || child.common?.type !== 'boolean') continue;
            if (suffix === 'select' && child.common.write) {
                await this._database(() => this.adapter.extendObjectAsync(childId, { common: { write: false } }), `Alt-Taster ${childId}`);
            }
            await this._writeValue(childId, false);
        }
        if (!this.retirementWarnings.has(id)) {
            this.retirementWarnings.add(id);
            this.adapter.log.warn(`${id} enthält geschützte oder benutzerdefinierte Objekte. Der Altordner bleibt erhalten; seine Senderwahl ist deaktiviert.`);
        }
    }

    async _cleanup() {
        for (const [id, replacements] of this.legacy) {
            if (replacements.length && replacements.every(replacement => this.applied.has(replacement))) this.retirement.add(id);
        }
        for (const id of this.services.keys()) this.retirement.delete(id);
        if (!this.retirement.size) return;
        const objects = await this._inventory();
        for (const id of [...this.retirement]) {
            this._check();
            // Missing rows are not evidence of absence: some ioBroker database
            // backends can return a partial list after a read error.
            if (!managedRoot(id, objects.get(id))) continue;
            const root = await this._readObject(id);
            if (!managedRoot(id, root)) continue;
            const children = [...objects].filter(([childId]) => childId.startsWith(`${id}.`));
            if (protectedObject(root) || children.some(([childId, child]) => !managedChild(id, childId, child) || protectedObject(child))) {
                await this._retainRetired(id);
                continue;
            }
            // Unregister before deleting, so an already queued button reset
            // cannot recreate an orphaned state value after its object is gone.
            this._forget(id, true);
            // A reset which has already entered setStateAsync also has to
            // settle before deletion. Its real promise survives DB timeouts.
            await this._waitButtonResets(id);
            const ids = children.map(([childId]) => childId).sort((a, b) => b.split('.').length - a.split('.').length);
            ids.push(id);
            let retained = false;
            for (const childId of ids) {
                this._check();
                const child = await this._readObject(childId);
                if (!child) continue;
                if (protectedObject(child) || !(childId === id ? managedRoot(id, child) : managedChild(id, childId, child))) {
                    retained = true;
                    break;
                }
                await this._database(() => this.adapter.delObjectAsync(childId, { recursive: false }), `Senderobjekt ${childId} entfernen`);
                if (await this._readObject(childId)) {
                    retained = true;
                    break;
                }
                this._forget(childId);
                await nextTurn();
            }
            if (retained) {
                await this._retainRetired(id);
                continue;
            }
            this.managed.delete(id);
            this.retirement.delete(id);
            this.legacy.delete(id);
            this.retirementWarnings.delete(id);
        }
    }

    async _syncService(service) {
        const { definitions, values } = createChannelDefinitions(service);
        for (const definition of definitions) {
            this._check();
            const { id, ...object } = definition;
            object.native = { ...object.native, managedBy: OWNER };
            if (id === service.id) object.native = { ...object.native,
                channelService: { schemaVersion: SCHEMA_VERSION, service }, channelRetired: false };
            await this._database(() => this.adapter.extendObjectAsync(id, object), `Senderobjekt ${id}`);
            if (id === service.id) this.managed.add(id);
        }
        for (const [id, value] of Object.entries(values)) {
            this._check();
            await this._writeValue(id, value);
        }
        this._check();
        if (!this.applied.has(service.id)) await this._writeValue(`${service.id}.select`, false, true);
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
