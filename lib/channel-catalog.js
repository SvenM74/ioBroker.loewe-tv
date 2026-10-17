'use strict';

const { createHash } = require('node:crypto');

const SCHEMA_VERSION = 3;
const MAX_CATALOG_BYTES = 480 * 1024;
const MAX_CATALOG_ENTRIES = 10000;
const MAX_CATALOG_PAGES = 1000;
const TYPES = Object.freeze({ video: 'tv', audio: 'radio' });

function invalid(message, code = 'INVALID_RESPONSE') {
    const error = new Error(`Senderkatalog: ${message}`);
    error.code = code;
    return error;
}

function object(value, description) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${description} ist kein Objekt.`);
    return value;
}

function text(record, field, maxLength = 1024) {
    const value = record[field] ?? '';
    if (typeof value !== 'string' || value.length > maxLength) throw invalid(`${field} enthält keinen gültigen Text.`);
    return value;
}

function viewIdentifier(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw invalid('Die Listenkennung fehlt oder ist ungültig.');
    }
    return value;
}

function index(value, field) {
    if (value === undefined || value === null) return null;
    if (!Number.isSafeInteger(value) || value < 0) throw invalid(`${field} ist keine gültige nichtnegative Ganzzahl.`);
    return value;
}

function mediaType(value) {
    if (!['', 'video', 'audio'].includes(value)) throw invalid('Die Senderart muss leer, video oder audio sein.', 'VALIDATION');
    return value;
}

function isChannelLocator(value) {
    // A channel button must never become a generic media/URL launcher. Keep
    // valid TV locators byte-for-byte instead of rebuilding them from numbers.
    return typeof value === 'string' && value.length <= 4096
        && /^channel:\/\/\d+:[^:\s]+:[^:\s]+$/u.test(value)
        && !/[\u0000-\u001f\u007f]/u.test(value)
        && programmeNumber(value.slice(10).split(':', 1)[0]) !== null;
}

function programmeNumber(caption) {
    if (!/^\d+$/u.test(caption)) return null;
    const number = Number(caption);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function compareText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}

function comparePosition(a, b) {
    return positionNumber(a.caption, a.locator) - positionNumber(b.caption, b.locator)
        || a.caption.length - b.caption.length || compareText(a.caption, b.caption) || compareText(a.locator, b.locator);
}

function compareLegacyPosition(a, b) {
    const aNumber = programmeNumber(a.caption);
    const bNumber = programmeNumber(b.caption);
    if (aNumber !== null && bNumber === null) return -1;
    if (aNumber === null && bNumber !== null) return 1;
    if (aNumber !== null && aNumber !== bNumber) return aNumber - bNumber;
    return a.caption.length - b.caption.length || compareText(a.caption, b.caption) || compareText(a.locator, b.locator);
}

function locatorNumber(locator) {
    return isChannelLocator(locator) ? programmeNumber(locator.slice(10).split(':', 1)[0]) : null;
}

function positionNumber(caption, locator) {
    const fromCaption = programmeNumber(caption);
    const fromLocator = locatorNumber(locator);
    if (fromCaption !== null && fromLocator !== null && fromCaption !== fromLocator) {
        throw invalid('Programmplatz und Sender-Locator widersprechen sich.');
    }
    // The locator supplied by the TV contains its programme position as its
    // first component. It is the only permitted fallback for a missing or
    // nonnumeric caption; an array index would invent a different TV position.
    const number = fromCaption ?? fromLocator;
    if (number === null) throw invalid('Der numerische Programmplatz fehlt oder ist ungültig.');
    return number;
}

function identityHash(identity) {
    return createHash('sha256').update(identity).digest('hex');
}

function locatorService(locator) {
    if (!isChannelLocator(locator)) throw invalid('Der Sender-Locator ist ungültig.');
    // Programme numbers may change when the user sorts the TV list. The two
    // remaining components identify the service even when its UUID is absent.
    return locator.slice(10).split(':').slice(1).join(':');
}

function serviceIdentity(value) {
    const record = object(value, 'Ein Sender');
    const listView = viewIdentifier(record.listView);
    const itemClass = text(record, 'itemClass', 128);
    if (!Object.hasOwn(TYPES, itemClass)) throw invalid('Ein Sender hat eine unbekannte Senderart.');
    const uuid = text(record, 'mediaItemUuid');
    if (uuid.trim()) return JSON.stringify([listView, itemClass, 'uuid', uuid]);
    const positions = readPositions(record);
    const identifiers = new Set(positions.map(position => locatorService(position.locator)));
    if (identifiers.size !== 1) throw invalid('Ohne UUID gehören die gespeicherten Locators nicht zum selben Sender.');
    return JSON.stringify([listView, itemClass, 'locator', identifiers.values().next().value]);
}

function nameSegment(name, identity) {
    const umlauts = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', ẞ: 'SS' };
    let segment = text({ name }, 'name').replace(/[äöüÄÖÜßẞ]/gu, character => umlauts[character])
        .normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').replace(/[^A-Za-z0-9_]/gu, '_')
        .replace(/_+/gu, '_').replace(/^_+|_+$/gu, '');
    if (!segment) {
        if (typeof identity !== 'string' || !identity) throw invalid('Die Identität für einen unbenannten Sender fehlt.');
        segment = `Sender_${identityHash(identity)}`;
    }
    // Keep both historical folder formats reserved for unambiguous migration.
    if (/^\d+$/u.test(segment) || /^service_[a-f0-9]{64}$/u.test(segment)) segment = `Sender_${segment}`;
    return segment.slice(0, 120).replace(/_+$/gu, '');
}

/** Human-readable base ID. assignServiceIds resolves equal cleaned names. */
function serviceId(view, itemClass, name, mediaItemUuid = '', locator = '') {
    const identity = serviceIdentity({ listView: view, itemClass, mediaItemUuid, locator, caption: '' });
    return `channels.${TYPES[itemClass]}.${nameSegment(name, identity)}`;
}

// Version 1 keyed folders by service identity and grouped programme positions.
// Reproduce that exact identity check only for validating old cached records.
function legacyServiceId(view, itemClass, mediaItemUuid, locator = '') {
    const uuid = text({ mediaItemUuid }, 'mediaItemUuid');
    const identifier = uuid.trim() ? ['uuid', uuid] : ['locator', locator];
    if (identifier[0] === 'locator' && !legacyLocator(locator)) throw invalid('UUID und verwendbarer Sender-Locator fehlen.');
    const hash = createHash('sha256').update(JSON.stringify([view, itemClass, ...identifier])).digest('hex');
    return `channels.${TYPES[itemClass]}.service_${hash}`;
}

function legacyLocator(value) {
    return typeof value === 'string' && value.length > 10 && value.length <= 4096
        && value.startsWith('channel://') && !/[\s\u0000-\u001f\u007f]/u.test(value);
}

function compactItem(value) {
    const item = object(value, 'Ein Sendereintrag');
    return {
        mediaItemUuid: text(item, 'mediaItemUuid'),
        name: text(item, 'name'),
        caption: text(item, 'caption', 128),
        locator: text(item, 'locator', 4096),
        itemClass: text(item, 'itemClass', 128),
    };
}

function readPositions(record) {
    const originalPositions = record.positions ?? [{ caption: text(record, 'caption', 128), locator: text(record, 'locator', 4096) }];
    if (!Array.isArray(originalPositions) || !originalPositions.length) {
        throw invalid('Die Liste der Programmplätze ist ungültig.');
    }
    if (originalPositions.length > MAX_CATALOG_ENTRIES) throw invalid('Zu viele gespeicherte Programmplätze.', 'CATALOG_LIMIT');
    const positions = new Map();
    for (const value of originalPositions) {
        const position = object(value, 'Ein Programmplatz');
        const result = { caption: text(position, 'caption', 128), locator: text(position, 'locator', 4096) };
        positions.set(JSON.stringify([result.caption, result.locator]), result);
    }
    return [...positions.values()].sort(comparePosition);
}

/** Rebuild every derived field when restoring a record from ioBroker storage. */
function normalizeServiceRecord(value) {
    const record = object(value, 'Ein Sender');
    const listView = viewIdentifier(record.listView);
    const itemClass = text(record, 'itemClass', 128);
    if (!Object.hasOwn(TYPES, itemClass)) throw invalid('Ein Sender hat eine unbekannte Senderart.');
    const mediaItemUuid = text(record, 'mediaItemUuid');
    const name = text(record, 'name');
    const positions = readPositions(record);
    if (record.available !== undefined && typeof record.available !== 'boolean') throw invalid('Die Verfügbarkeit eines Senders ist ungültig.');
    if (new Set(positions.map(position => positionNumber(position.caption, position.locator))).size !== positions.length) {
        throw invalid('Die gespeicherten Programmplätze sind nicht eindeutig.');
    }
    const identity = serviceIdentity({ listView, itemClass, mediaItemUuid, positions });
    const usable = positions.filter(position => isChannelLocator(position.locator));
    const position = (usable.length ? usable : positions)[0];
    const number = positionNumber(position.caption, position.locator);
    const base = `channels.${TYPES[itemClass]}.${nameSegment(name, identity)}`;
    const id = record.id === undefined ? base : record.id;
    if (id !== base && id !== `${base}__${identityHash(identity)}`) throw invalid('Die gespeicherte Sender-ID passt nicht zu ihrem Namen und ihrer Identität.');
    return {
        id, itemClass, listView, mediaItemUuid, name,
        caption: position.caption, number, locator: position.locator,
        positions,
        // Runtime archives absent services with false. A cached record may
        // preserve that restriction, but true never validates a bad locator.
        available: record.available !== false && isChannelLocator(position.locator),
    };
}

/** Reassign name collisions deterministically, retaining validated old IDs. */
function assignServiceIds(values, previousServices = []) {
    const services = values.map(normalizeServiceRecord);
    const identities = services.map(serviceIdentity);
    if (new Set(identities).size !== identities.length) throw invalid('Ein Senderdienst ist mehrfach vorhanden.');
    const previous = new Map();
    const previousIds = new Set();
    for (const value of previousServices) {
        const service = normalizeServiceRecord(value);
        const identity = serviceIdentity(service);
        if (previous.has(identity) || previousIds.has(service.id)) throw invalid('Die bisherigen Sender-IDs sind nicht eindeutig.');
        previous.set(identity, service);
        previousIds.add(service.id);
    }
    const assigned = new Map();
    const usedIds = new Set();
    for (const service of services) {
        const identity = serviceIdentity(service);
        const old = previous.get(identity);
        if (!old || nameSegment(old.name, identity) !== nameSegment(service.name, identity)) continue;
        assigned.set(identity, old.id);
        usedIds.add(old.id);
    }
    for (const service of [...services].sort((a, b) => compareText(serviceIdentity(a), serviceIdentity(b)))) {
        const identity = serviceIdentity(service);
        if (assigned.has(identity)) continue;
        const base = serviceId(service.listView, service.itemClass, service.name, service.mediaItemUuid, service.locator);
        const id = usedIds.has(base) ? `${base}__${identityHash(identity)}` : base;
        if (usedIds.has(id)) throw invalid('Die Sendernamen lassen sich nicht eindeutig zuordnen.');
        assigned.set(identity, id);
        usedIds.add(id);
    }
    return services.map(service => ({ ...service, id: assigned.get(serviceIdentity(service)) })).sort(compareServices);
}

function compareServices(a, b) {
    return compareText(a.itemClass, b.itemClass) || a.number - b.number || compareText(a.id, b.id);
}

/** Group validated records belonging to the same service, including v2 slots. */
function mergeServiceRecords(values, previousServices = []) {
    const groups = new Map();
    for (const value of values) {
        const service = normalizeServiceRecord(value);
        const identity = serviceIdentity(service);
        const previous = groups.get(identity);
        if (!previous) groups.set(identity, service);
        else {
            if (service.name !== previous.name) throw invalid('Ein Senderdienst hat widersprüchliche Namen.');
            groups.set(identity, normalizeServiceRecord({ ...previous, id: undefined,
                positions: [...previous.positions, ...service.positions], available: previous.available && service.available }));
        }
    }
    return assignServiceIds([...groups.values()], previousServices);
}

/** Validate historical hashes/slot IDs before migrating to one named service. */
function migrateServiceRecord(value) {
    const record = object(value, 'Ein gespeicherter Sender');
    const numeric = /^channels\.(tv|radio)\.\d+$/u.test(record.id || '');
    const hashed = /^channels\.(tv|radio)\.service_[a-f0-9]{64}$/u.test(record.id || '');
    if (!numeric && !hashed) return [normalizeServiceRecord(record)];
    const listView = viewIdentifier(record.listView);
    const itemClass = text(record, 'itemClass', 128);
    if (!Object.hasOwn(TYPES, itemClass)) throw invalid('Ein Sender hat eine unbekannte Senderart.');
    const mediaItemUuid = text(record, 'mediaItemUuid');
    const name = text(record, 'name');
    const positions = readPositions(record);
    if (numeric) {
        if (positions.length !== 1) throw invalid('Ein alter Programmplatzordner enthält mehrere Positionen.');
        const number = positionNumber(positions[0].caption, positions[0].locator);
        if (record.id !== `channels.${TYPES[itemClass]}.${number}`) throw invalid('Die alte Sender-ID passt nicht zu ihrem Programmplatz.');
        return [normalizeServiceRecord({ ...record, id: undefined })];
    }
    const legacyPositions = [...positions].sort(compareLegacyPosition);
    const usable = legacyPositions.filter(position => legacyLocator(position.locator));
    const preferred = (usable.length ? usable : legacyPositions)[0];
    const legacyId = legacyServiceId(listView, itemClass, mediaItemUuid, preferred.locator);
    if (record.id !== undefined && record.id !== legacyId) throw invalid('Die alte Sender-ID passt nicht zu ihrer Identität.');
    return [normalizeServiceRecord({ listView, itemClass, mediaItemUuid, name, positions, available: record.available })];
}

function compactPage(value, filter) {
    const page = object(value, 'Eine Senderseite');
    if (!Array.isArray(page.items)) throw invalid('Die Senderseite ist ungültig.');
    if (page.items.length > MAX_CATALOG_ENTRIES) throw invalid('Zu viele Einträge auf der Senderseite.', 'CATALOG_LIMIT');
    const items = page.items.map(compactItem);
    const startIndex = index(page.startIndex, 'startIndex');
    const totalResults = index(page.totalResults, 'totalResults');
    if (page.returnedResults !== undefined && page.returnedResults !== items.length) {
        throw invalid('returnedResults stimmt nicht mit der Anzahl empfangener Einträge überein.');
    }
    if (startIndex !== null && !Number.isSafeInteger(startIndex + items.length)) throw invalid('Der Seitenbereich ist zu groß.');
    if (totalResults !== null && (items.length > totalResults
        || (startIndex !== null && items.length > 0 && startIndex + items.length > totalResults)
        || (startIndex !== null && items.length === 0 && startIndex < totalResults))) {
        throw invalid('Der Seitenbereich passt nicht zur gemeldeten Gesamtzahl.');
    }
    return { mediaType: mediaType(filter === undefined ? page.mediaType : filter), startIndex, totalResults, hash: text(page, 'hash'), items };
}

function analyseItems(view, page) {
    const slots = new Map();
    const observedSlots = new Set();
    const unavailableSlots = new Set();
    const unavailableIdentities = new Set();
    let skipped = 0;
    let invalidPositions = 0;
    let conflictingPositions = 0;
    for (const item of page.items) {
        if (!Object.hasOwn(TYPES, item.itemClass) || (page.mediaType && item.itemClass !== page.mediaType)) {
            skipped++;
            continue;
        }
        const captionNumber = programmeNumber(item.caption);
        const fromLocator = locatorNumber(item.locator);
        for (const number of [captionNumber, fromLocator]) {
            if (number !== null) observedSlots.add(JSON.stringify([item.itemClass, number]));
        }
        let slot;
        let service;
        try {
            slot = JSON.stringify([item.itemClass, positionNumber(item.caption, item.locator)]);
        } catch {
            skipped++;
            invalidPositions++;
            for (const number of [captionNumber, fromLocator]) {
                if (number !== null) unavailableSlots.add(JSON.stringify([item.itemClass, number]));
            }
            if (item.mediaItemUuid.trim()) unavailableIdentities.add(serviceIdentity({ ...item, listView: view }));
            continue;
        }
        try {
            service = normalizeServiceRecord({ ...item, listView: view });
        } catch {
            skipped++;
            unavailableSlots.add(slot);
            if (item.mediaItemUuid.trim()) unavailableIdentities.add(serviceIdentity({ ...item, listView: view }));
            continue;
        }
        let group = slots.get(slot);
        if (!group) {
            group = { count: 0, records: new Map() };
            slots.set(slot, group);
        }
        group.count++;
        group.records.set(JSON.stringify(service), service);
    }
    const groups = new Map();
    for (const [slot, group] of slots) {
        if (group.records.size !== 1 || unavailableSlots.has(slot)) {
            skipped += group.count;
            conflictingPositions++;
            unavailableSlots.add(slot);
            for (const service of group.records.values()) unavailableIdentities.add(serviceIdentity(service));
        } else {
            const service = group.records.values().next().value;
            const identity = serviceIdentity(service);
            const members = groups.get(identity) || { records: [], count: 0 };
            members.records.push(service);
            members.count += group.count;
            groups.set(identity, members);
        }
    }
    const services = [];
    for (const [identity, group] of groups) {
        try {
            // These are live references, so an unusable alias must not disable
            // another validated position of the same service.
            services.push(...mergeServiceRecords(group.records).map(service => normalizeServiceRecord({ ...service, available: true })));
        } catch {
            // Conflicting names or aliases for one identity must not silently
            // select whichever reference happened to arrive first.
            skipped += group.count;
            conflictingPositions++;
            unavailableIdentities.add(identity);
        }
    }
    return { services, observedSlots, unavailableIdentities, skipped, invalidPositions, conflictingPositions };
}

function queryResult(page, analysis) {
    const complete = page.startIndex === 0 && page.totalResults !== null && page.items.length === page.totalResults;
    return {
        mediaType: page.mediaType, startIndex: page.startIndex, totalResults: page.totalResults,
        returnedResults: page.items.length, complete, reconciled: complete && analysis.skipped === 0,
        skipped: analysis.skipped, invalidPositions: analysis.invalidPositions, conflictingPositions: analysis.conflictingPositions,
    };
}

function checkSize(catalog) {
    if (catalog.pages.length > MAX_CATALOG_PAGES
        || catalog.pages.reduce((count, page) => count + page.items.length, 0) > MAX_CATALOG_ENTRIES
        || catalog.services.reduce((count, service) => count + service.positions.length, 0) > MAX_CATALOG_ENTRIES) {
        throw invalid('Zu viele gespeicherte Seiten oder Senderreferenzen; bitte die Liste vollständig neu abrufen.', 'CATALOG_LIMIT');
    }
    if (Buffer.byteLength(JSON.stringify(catalog), 'utf8') > MAX_CATALOG_BYTES) {
        throw invalid('Der Senderkatalog überschreitet 480 KiB; bitte eine kleinere Senderliste verwenden.', 'CATALOG_LIMIT');
    }
    return catalog;
}

function mergeServices(analysis, retainedServices, previousServices) {
    const observed = new Set(analysis.services.map(serviceIdentity));
    const services = [];
    for (const service of retainedServices) {
        const identity = serviceIdentity(service);
        // A partial observation may already show a moved service. Replacing its
        // positions prevents its old, numerically smaller slot winning select.
        if (observed.has(identity)) continue;
        const remaining = service.positions.filter(position => !analysis.observedSlots.has(JSON.stringify([
            service.itemClass, positionNumber(position.caption, position.locator),
        ])));
        services.push(normalizeServiceRecord({ ...service,
            positions: remaining.length ? remaining : service.positions,
            available: service.available && remaining.length > 0 && !analysis.unavailableIdentities.has(identity),
        }));
    }
    return assignServiceIds([...services, ...analysis.services], previousServices);
}

function mergePages(previousPages, page) {
    const otherFilters = previousPages.filter(previous => previous.mediaType !== page.mediaType);
    let sameFilter = previousPages.filter(previous => previous.mediaType === page.mediaType);
    // A new first page starts a new collection, but the service history remains
    // available until a single complete response can authoritatively replace it.
    if (page.startIndex === 0 || page.startIndex === null || sameFilter.some(previous => previous.totalResults !== page.totalResults
        || (previous.hash && page.hash && previous.hash !== page.hash))) sameFilter = [];
    const end = page.startIndex === null ? null : page.startIndex + page.items.length;
    const remaining = [];
    for (const previous of sameFilter) {
        if (previous.startIndex === null) continue;
        const previousEnd = previous.startIndex + previous.items.length;
        if (end === null || previousEnd <= page.startIndex || previous.startIndex >= end) {
            remaining.push(previous);
            continue;
        }
        if (previous.startIndex < page.startIndex) {
            remaining.push({ ...previous, items: previous.items.slice(0, page.startIndex - previous.startIndex) });
        }
        if (previousEnd > end) {
            remaining.push({ ...previous, startIndex: end, items: previous.items.slice(end - previous.startIndex) });
        }
    }
    return [...otherFilters, ...remaining, page].sort((a, b) => compareText(a.mediaType, b.mediaType)
        || (a.startIndex ?? Number.MAX_SAFE_INTEGER) - (b.startIndex ?? Number.MAX_SAFE_INTEGER));
}

/** Validate a persisted cache and recompute IDs/selection fields; never trust them. */
function restoreChannelCatalog(value) {
    if (typeof value === 'string') {
        if (Buffer.byteLength(value, 'utf8') > MAX_CATALOG_BYTES) throw invalid('Der gespeicherte Katalog ist zu groß.', 'CATALOG_LIMIT');
        try { value = JSON.parse(value); } catch { throw invalid('Der gespeicherte Katalog enthält ungültiges JSON.'); }
    }
    const record = object(value, 'Der gespeicherte Katalog');
    if (![1, 2, SCHEMA_VERSION].includes(record.schemaVersion)) throw invalid('Die gespeicherte Katalogversion wird nicht unterstützt.');
    const view = viewIdentifier(record.view);
    const updatedAt = index(record.updatedAt, 'updatedAt');
    if (updatedAt === null) throw invalid('Der Zeitpunkt der Katalogaktualisierung fehlt.');
    if (!Array.isArray(record.pages) || !Array.isArray(record.services)) {
        throw invalid('Die gespeicherten Seiten oder Sender sind ungültig.');
    }
    if (record.pages.length > MAX_CATALOG_PAGES || record.services.length > MAX_CATALOG_ENTRIES) {
        throw invalid('Zu viele gespeicherte Seiten oder Sender.', 'CATALOG_LIMIT');
    }
    const pageReferences = record.pages.reduce((count, page) => count + (Array.isArray(page?.items) ? page.items.length : 0), 0);
    const serviceReferences = record.services.reduce((count, service) => count + (Array.isArray(service?.positions) ? service.positions.length : 1), 0);
    if (pageReferences > MAX_CATALOG_ENTRIES || serviceReferences > MAX_CATALOG_ENTRIES) {
        throw invalid('Zu viele gespeicherte Senderreferenzen.', 'CATALOG_LIMIT');
    }
    const pages = record.pages.map(page => compactPage(page));
    const originalIds = record.services.map(service => service?.id);
    if (originalIds.some(id => typeof id !== 'string') || new Set(originalIds).size !== originalIds.length) {
        throw invalid('Die gespeicherten Sender-IDs sind nicht eindeutig.');
    }
    if (record.schemaVersion === 1 && originalIds.some(id => !/^channels\.(tv|radio)\.service_[a-f0-9]{64}$/u.test(id))) {
        throw invalid('Die Sender-IDs passen nicht zur gespeicherten Katalogversion.');
    }
    if (record.schemaVersion === 2 && originalIds.some(id => !/^channels\.(tv|radio)\.\d+$/u.test(id))) {
        throw invalid('Die Sender-IDs passen nicht zur gespeicherten Katalogversion.');
    }
    const services = record.schemaVersion < SCHEMA_VERSION
        ? mergeServiceRecords(record.services.flatMap(migrateServiceRecord))
        : record.services.map(normalizeServiceRecord);
    if (services.some(service => service.listView !== view) || new Set(services.map(service => service.id)).size !== services.length
        || new Set(services.map(serviceIdentity)).size !== services.length) {
        throw invalid('Die gespeicherten Sender gehören nicht eindeutig zu dieser Liste.');
    }
    const activeSlots = new Set();
    for (const service of services.filter(service => service.available)) {
        for (const position of service.positions) {
            const slot = JSON.stringify([service.itemClass, positionNumber(position.caption, position.locator)]);
            if (activeSlots.has(slot)) throw invalid('Mehrere verfügbare Sender belegen denselben Programmplatz.');
            activeSlots.add(slot);
        }
    }
    const last = object(record.lastQuery, 'Die letzte Abfrage');
    const filter = mediaType(last.mediaType);
    const startIndex = index(last.startIndex, 'startIndex');
    const totalResults = index(last.totalResults, 'totalResults');
    const returnedResults = index(last.returnedResults, 'returnedResults');
    const skipped = index(last.skipped, 'skipped');
    if (returnedResults === null || skipped === null || skipped > returnedResults) throw invalid('Die gespeicherten Abfragezahlen sind ungültig.');
    const invalidPositions = index(last.invalidPositions ?? 0, 'invalidPositions');
    const conflictingPositions = index(last.conflictingPositions ?? 0, 'conflictingPositions');
    if (invalidPositions > skipped || conflictingPositions > skipped) throw invalid('Die gespeicherten Programmplatz-Diagnosen sind ungültig.');
    // These flags are diagnostic only. Reconciliation always uses the next live
    // response, never a cached claim of completeness or a possibly constant hash.
    const complete = startIndex === 0 && totalResults !== null && returnedResults === totalResults;
    return checkSize({
        schemaVersion: SCHEMA_VERSION, view, name: text(record, 'name'), updatedAt,
        pages, services,
        lastQuery: { mediaType: filter, startIndex, totalResults, returnedResults, complete, reconciled: complete && skipped === 0,
            skipped, invalidPositions, conflictingPositions },
    });
}

/** Merge one parsed TV response without network calls or ioBroker side effects. */
function mergeChannelPage(previous, value, { mediaType: filter = '', now = Date.now() } = {}) {
    const pageValue = object(value, 'Die Senderantwort');
    const view = viewIdentifier(pageValue.view);
    const page = compactPage(pageValue, filter);
    const updatedAt = index(now, 'now');
    if (updatedAt === null) throw invalid('Der Aktualisierungszeitpunkt fehlt.');
    const old = previous === null || previous === undefined ? null : restoreChannelCatalog(previous);
    const current = old?.view === view ? old : null;
    const analysis = analyseItems(view, page);
    const lastQuery = queryResult(page, analysis);
    const refreshedTypes = lastQuery.reconciled ? (filter ? [filter] : Object.keys(TYPES)) : [];
    const retained = (current?.services || []).filter(service => !refreshedTypes.includes(service.itemClass));
    const services = mergeServices(analysis, retained, current?.services || []);
    const previousPages = lastQuery.reconciled && !filter ? [] : (current?.pages || []);
    const pages = mergePages(previousPages, page);
    return checkSize({
        schemaVersion: SCHEMA_VERSION, view, name: text(pageValue, 'name') || current?.name || '', updatedAt,
        pages, services, lastQuery,
    });
}

/** Relative ioBroker definitions and acknowledged initial/metadata values. */
function createChannelDefinitions(value) {
    const service = normalizeServiceRecord(value);
    const prefix = service.id;
    const names = (en, de) => ({ en, de });
    const definitions = [{
        id: prefix, type: 'channel', common: { name: String(service.number), desc: service.name },
        native: { managedBy: 'loewe-tv-channel-catalog', schemaVersion: SCHEMA_VERSION, listView: service.listView,
            mediaItemUuid: service.mediaItemUuid, itemClass: service.itemClass, number: service.number },
    }];
    const values = {};
    const state = (suffix, en, de, type, role, value, extra = {}) => {
        const id = `${prefix}.${suffix}`;
        definitions.push({ id, type: 'state', common: { name: names(en, de), type, role, read: true, write: false, ...extra }, native: {} });
        values[id] = value;
    };
    definitions.push({
        id: `${prefix}.select`, type: 'state',
        common: { name: names('Select channel', 'Sender einschalten'), type: 'boolean', role: 'button', read: false, write: true, def: false,
            desc: names('Send true to select this channel. This button does not indicate the current channel.', 'true schreiben, um diesen Sender auszuwählen. Der Taster zeigt nicht den aktuell eingeschalteten Sender an.') }, native: {},
    });
    state('name', 'Channel name', 'Sendername', 'string', 'text', service.name);
    state('number', 'Programme number', 'Programmplatz', 'number', 'value', service.number, { min: 0 });
    state('numbers', 'Original programme captions', 'Originale Programmplatzangaben', 'string', 'json', JSON.stringify(service.positions.map(position => position.caption)));
    state('mediaItemUuid', 'TV service identifier', 'Senderkennung des TV', 'string', 'text', service.mediaItemUuid);
    state('locator', 'Channel locator', 'Sender-Locator', 'string', 'text', service.locator);
    state('locators', 'Original channel locators', 'Originale Sender-Locators', 'string', 'json', JSON.stringify(service.positions.map(position => position.locator)));
    state('positions', 'Programme caption and original locator', 'Programmplatz mit originalem Locator', 'string', 'json', JSON.stringify(service.positions));
    state('listView', 'Channel list identifier', 'Senderlistenkennung', 'string', 'text', service.listView);
    state('available', 'Channel available', 'Sender verfügbar', 'boolean', 'indicator', service.available);
    definitions.push({ id: `${prefix}.epg`, type: 'channel', common: { name: names('Programme guide', 'Programmdaten') }, native: {} });
    state('epg.status', 'EPG import status', 'Status des EPG-Abrufs', 'string', 'text', 'notImplemented', {
        states: { notImplemented: 'EPG-Abruf noch nicht enthalten' },
    });
    return { definitions, values };
}

module.exports = {
    SCHEMA_VERSION, MAX_CATALOG_BYTES, MAX_CATALOG_ENTRIES, MAX_CATALOG_PAGES,
    serviceId, serviceIdentity, nameSegment, assignServiceIds, mergeServiceRecords,
    normalizeServiceRecord, migrateServiceRecord, mergeChannelPage, restoreChannelCatalog, createChannelDefinitions,
};
