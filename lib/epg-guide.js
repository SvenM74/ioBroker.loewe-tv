'use strict';

const { createHash } = require('node:crypto');
const { ProtocolError } = require('./loewe-client');
const { serviceIdentity } = require('./channel-catalog');
const { DAY, MAX_CACHE_AGE, MAX_EVENTS, selectNowNext } = require('./epg-data');

const MAX_GUIDE_CHANNELS = 2000;
const MAX_GUIDE_LIMIT = 32;
const DEFAULT_GUIDE_LIMIT = 20;
const MAX_GUIDE_BYTES = 512 * 1024;
const DEFAULT_WINDOW_MS = 3 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const QUERY_KEYS = new Set(['offset', 'limit', 'from', 'to', 'listView', 'catalogRevision']);
const STATUSES = new Set(['waiting', 'updating', 'ready', 'partial', 'empty', 'error', 'stale']);

function invalid(message, code = 'EPG_GUIDE_INVALID') { return new ProtocolError(message, code); }
function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function time(value) { return Number.isSafeInteger(value) && value >= 946684800000 && value < 4102444800000; }
function clip(value, maximum) {
    const result = value.slice(0, maximum);
    return /[\ud800-\udbff]$/u.test(result) ? result.slice(0, -1) : result;
}
function text(value, maximum) {
    return typeof value === 'string'
        ? clip(value.toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ''), maximum) : '';
}
function errorText(error) {
    const message = typeof error === 'string' ? error : error
        ? `${error.code || 'EPG_ERROR'}: ${error.message || 'Programmdaten konnten nicht gelesen werden.'}` : '';
    return text(message.replace(/https?:\/\/[^\s<>"']+/giu, '[URL]'), 1500);
}
function bytes(value) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }

function validateQuery(query, now, listView) {
    if (!plain(query) || Object.keys(query).some(key => !QUERY_KEYS.has(key))) {
        throw invalid('Die Anfrage der Programmübersicht ist ungültig.');
    }
    const offset = query.offset === undefined ? 0 : query.offset;
    const limit = query.limit === undefined ? DEFAULT_GUIDE_LIMIT : query.limit;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_GUIDE_CHANNELS
        || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_GUIDE_LIMIT) {
        throw invalid(`Die Programmübersicht erlaubt höchstens ${MAX_GUIDE_LIMIT} Sender je Seite.`);
    }
    const from = query.from === undefined ? Math.floor(now / HALF_HOUR_MS) * HALF_HOUR_MS : query.from;
    const to = query.to === undefined ? from + DEFAULT_WINDOW_MS : query.to;
    if (!time(from) || !time(to) || from < now - DAY || from > now + 2 * DAY
        || to <= from || to - from > DAY) {
        throw invalid('Das Zeitfenster muss höchstens 24 Stunden umfassen und zwischen gestern und übermorgen beginnen.');
    }
    if (query.listView !== undefined) {
        if (typeof query.listView !== 'string' || Buffer.byteLength(query.listView) > 2048
            || /[\u0000-\u001f\u007f]/u.test(query.listView)) throw invalid('Die Senderlistenkennung ist ungültig.');
        if (query.listView !== listView) {
            throw invalid('Die gewählte Senderliste wurde geändert. Bitte die Übersicht neu laden.', 'EPG_GUIDE_CHANGED');
        }
    }
    if (query.catalogRevision !== undefined && (typeof query.catalogRevision !== 'string'
        || !/^[a-f0-9]{64}$/u.test(query.catalogRevision))) {
        throw invalid('Die Versionskennung der Senderliste ist ungültig.');
    }
    return { from, to, offset, limit };
}

function currentServices(context, listView) {
    if (!context.running || !listView) return [];
    const values = context.services instanceof Map ? context.services.values()
        : Array.isArray(context.services) ? context.services : [];
    const services = [];
    const ids = new Set();
    for (const service of values) {
        if (!service || service.itemClass !== 'video' || service.listView !== listView
            || typeof service.id !== 'string' || !/^channels\.tv\.[A-Za-z0-9_]+$/u.test(service.id)
            || !Number.isSafeInteger(service.number) || service.number < 0 || ids.has(service.id)) continue;
        let identity;
        try { identity = serviceIdentity(service); } catch { continue; }
        services.push({ service, identity });
        ids.add(service.id);
        if (services.length > MAX_GUIDE_CHANNELS) throw invalid('Die Senderliste ist für die Programmübersicht zu groß.', 'EPG_GUIDE_LIMIT');
    }
    return services.sort((a, b) => a.service.number - b.service.number
        || (a.service.id < b.service.id ? -1 : a.service.id > b.service.id ? 1 : 0));
}

function usableEntry(context, { service, identity }) {
    const entry = context.entries instanceof Map ? context.entries.get(service.id) : null;
    if (!entry || entry.obsolete || !entry.initialized || entry.identity !== identity
        || entry.service?.listView !== context.listView || entry.service?.itemClass !== 'video') return null;
    try {
        if (serviceIdentity(entry.service) !== identity || (context.validEntry && !context.validEntry(entry))) return null;
    } catch { return null; }
    return entry;
}

function usableCache(entry, identity, now) {
    const cache = entry?.cache;
    return cache && cache.schemaVersion === 2 && cache.source === 'tv' && cache.identity === identity
        && time(cache.fetchedAt) && cache.fetchedAt <= now + 300000
        && Array.isArray(cache.events) && cache.events.length <= MAX_EVENTS ? cache : null;
}

function programme(value) {
    if (!plain(value) || typeof value.title !== 'string' || !value.title.trim() || !time(value.start)
        || (value.end !== null && (!time(value.end) || value.end <= value.start))
        || (value.endEstimated !== undefined && value.endEstimated !== false)) {
        throw invalid('Der gespeicherte Programmplan enthält ungültige Sendungen.', 'EPG_GUIDE_DATA');
    }
    const event = { eventId: text(value.eventId, 256), title: text(value.title, 512),
        subtitle: text(value.subtitle, 1024), description: text(value.description, 4096),
        start: value.start, end: value.end };
    if (['eventId', 'title', 'subtitle', 'description'].some(key => typeof value[key] === 'string' && value[key] !== event[key])) {
        event.textTruncated = true;
    }
    return event;
}

function channelRow(context, record, from, to, now) {
    const { service, identity } = record;
    const entry = usableEntry(context, record);
    const cache = usableCache(entry, identity, now);
    const row = {
        id: text(service.id, 256), name: text(service.name, 1024), number: service.number,
        available: service.available !== false, status: 'waiting', lastUpdate: cache?.fetchedAt || 0,
        lastError: entry ? errorText(entry.error) : '', events: [],
    };
    if (!context.enabled) { row.status = 'disabled'; return row; }
    if (!row.available) { row.status = 'inactive'; return row; }
    if (cache && now - cache.fetchedAt > MAX_CACHE_AGE) { row.status = 'stale'; return row; }
    if (!cache) {
        if (entry?.error) row.status = entry.error.code === 'EPG_TV_UNSUPPORTED' ? 'unsupported' : 'error';
        return row;
    }
    let events;
    try { events = cache.events.map(programme); }
    catch (error) {
        row.status = 'error';
        row.lastError = errorText(error);
        return row;
    }
    const selected = selectNowNext(events, now);
    if (selected.ambiguous) row.status = 'partial';
    else if (selected.now || selected.next) row.status = entry.error ? 'cached'
        : selected.now && selected.next ? 'ready' : 'partial';
    else if (entry.error) row.status = entry.error.code === 'EPG_TV_UNSUPPORTED' ? 'unsupported' : 'error';
    else row.status = 'empty';
    if (!row.lastError && selected.ambiguous) {
        row.lastError = 'EPG_AMBIGUOUS: Überschneidende oder mehrdeutige Sendungen können nicht eindeutig zugeordnet werden.';
    }
    // An unknown end remains unknown, including when its start precedes the
    // visible window. The view must not manufacture an end from its neighbour.
    row.events = events.filter(event => event.start < to && (event.end === null || event.end > from));
    return row;
}

function progressSnapshot(value) {
    const progress = {};
    for (const name of ['completed', 'total', 'successful', 'failed']) {
        progress[name] = Number.isSafeInteger(value?.[name]) && value[name] >= 0 && value[name] <= MAX_GUIDE_CHANNELS ? value[name] : 0;
    }
    return progress;
}

function shorten(row, maximumDescription, maximumSubtitle) {
    for (const event of row.events) {
        const description = clip(event.description, maximumDescription);
        const subtitle = clip(event.subtitle, maximumSubtitle);
        if (description !== event.description || subtitle !== event.subtitle) {
            event.description = description;
            event.subtitle = subtitle;
            event.textTruncated = true;
        }
    }
}

/**
 * Build a bounded view of the already validated, in-memory TV programme cache.
 * No database, socket, timer or state-write API is used by this serializer.
 */
function createEpgGuide(context, query = {}) {
    const now = context.now ?? Date.now();
    if (!time(now)) throw invalid('Die Systemzeit ist für die Programmübersicht ungültig.');
    const listView = typeof context.listView === 'string' ? context.listView : '';
    const { from, to, offset, limit } = validateQuery(query, now, listView);
    const services = currentServices(context, listView);
    const revision = createHash('sha256');
    // Host/port stay inside the hash. A previous page or refresh token must
    // not survive switching this instance to another TV with a matching list.
    revision.update(JSON.stringify([context.instance || '', context.deviceKey || '', listView, context.listName || '']));
    for (const { service, identity } of services) {
        revision.update(JSON.stringify([service.id, identity, service.name, service.number, service.available !== false]));
    }
    const catalogRevision = revision.digest('hex');
    if (query.catalogRevision !== undefined && query.catalogRevision !== catalogRevision) {
        throw invalid('Die Senderliste wurde während des Ladens geändert. Bitte die Übersicht neu laden.', 'EPG_GUIDE_CHANGED');
    }
    let status = !context.running ? 'unavailable' : !listView ? 'notConfigured' : !context.enabled ? 'disabled'
        : context.refreshing ? 'updating' : !services.length ? 'empty'
            : STATUSES.has(context.status) ? context.status : 'waiting';
    let lastUpdate = time(context.lastUpdate) ? context.lastUpdate : 0;
    let currentCaches = 0;
    let expiredCaches = 0;
    for (const record of services) {
        const cache = usableCache(usableEntry(context, record), record.identity, now);
        if (!cache || record.service.available === false) continue;
        lastUpdate = Math.max(lastUpdate, cache.fetchedAt);
        if (now - cache.fetchedAt > MAX_CACHE_AGE) expiredCaches++;
        else currentCaches++;
    }
    if (context.running && listView && context.enabled && !context.refreshing && expiredCaches && !currentCaches) status = 'stale';
    const response = {
        schemaVersion: 1, source: 'tv', now, generatedAt: now,
        instance: text(context.instance, 128), listView: text(listView, 2048), listName: text(context.listName, 1024),
        catalogRevision, status, connected: context.connected === true,
        refreshing: context.running === true && context.enabled === true && context.refreshing === true,
        lastUpdate, lastError: errorText(context.lastError || ''),
        progress: progressSnapshot(context.progress), from, to, offset, limit,
        total: services.length, nextOffset: null, channels: [],
    };
    // Reserve ample space for the pagination number and separators so the
    // final JSON is bounded even if this page stops earlier than requested.
    let used = bytes(response) + 256;
    for (const record of services.slice(offset, offset + limit)) {
        const row = channelRow(context, record, from, to, now);
        let size = bytes(row);
        if (used + size > MAX_GUIDE_BYTES && response.channels.length) break;
        if (used + size > MAX_GUIDE_BYTES) {
            shorten(row, 512, 256);
            size = bytes(row);
        }
        if (used + size > MAX_GUIDE_BYTES) {
            shorten(row, 0, 0);
            size = bytes(row);
        }
        if (used + size > MAX_GUIDE_BYTES) throw invalid('Eine Senderzeile überschreitet die Größenbegrenzung.', 'EPG_GUIDE_LIMIT');
        response.channels.push(row);
        used += size + 1;
    }
    const next = offset + response.channels.length;
    response.nextOffset = next < services.length ? next : null;
    return response;
}

module.exports = { createEpgGuide, MAX_GUIDE_BYTES, MAX_GUIDE_LIMIT, DEFAULT_GUIDE_LIMIT, MAX_GUIDE_CHANNELS };
