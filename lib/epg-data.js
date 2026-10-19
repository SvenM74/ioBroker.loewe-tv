'use strict';

const { ProtocolError } = require('./loewe-client');
const { serviceIdentity } = require('./channel-catalog');

const DAY = 86400000;
const MAX_CACHE_BYTES = 128 * 1024;
const MIN_CACHE_BYTES = 8192;
const MAX_CACHE_AGE = DAY;
const MAX_EVENTS = 128;

function invalid(message) { return new ProtocolError(message, 'EPG_DATA'); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function timestamp(value) {
    return Number.isSafeInteger(value) && value >= 946684800000 && value < 4102444800000;
}
function clip(value, maximum) {
    const clipped = value.slice(0, maximum);
    return /[\ud800-\udbff]$/u.test(clipped) ? clipped.slice(0, -1) : clipped;
}
function text(value, maximum) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw invalid('EPG-Text hat ein ungültiges Format.');
    return clip(value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').toWellFormed(), maximum);
}

/** Current evidence and the complete earliest future start group are mandatory. */
function mandatoryCount(events, now) {
    const firstFuture = events.findIndex(event => event.start > now);
    if (firstFuture === -1) return events.length;
    let end = firstFuture + 1;
    while (end < events.length && events[end].start === events[firstFuture].start) end++;
    return end;
}

/**
 * Keep only whole start groups. A known end may not cross the cutoff: otherwise
 * a later clock tick could manufacture certainty after an overlapping event
 * was discarded from the cache.
 */
function safePrefixLength(events, maximum, now) {
    const mandatory = mandatoryCount(events, now);
    let latestEnd = -Infinity;
    let selected = null;
    for (let index = 0; index < Math.min(maximum, events.length); index++) {
        if (events[index].end !== null) latestEnd = Math.max(latestEnd, events[index].end);
        const count = index + 1;
        if (count < mandatory) continue;
        if (count === events.length || (events[index].start !== events[count].start && latestEnd <= events[count].start)) {
            selected = count;
        }
    }
    return selected;
}

/** The same validator handles source results and untrusted persisted caches. */
function normalizeEvents(input, now = Date.now()) {
    if (!timestamp(now) || !Array.isArray(input) || input.length > 2048) throw invalid('Zu viele oder ungültige EPG-Sendungen.');
    const unique = new Map();
    for (const value of input) {
        if (!plain(value) || !timestamp(value.start)
            || (value.end !== null && value.end !== undefined && (!timestamp(value.end) || value.end <= value.start))
            || (value.endEstimated !== undefined && value.endEstimated !== false)) {
            throw invalid('EPG-Sendung enthält ungültige Start- oder Endzeiten.');
        }
        const event = {
            eventId: text(value.eventId, 256), title: text(value.title, 512),
            subtitle: text(value.subtitle, 1024), description: text(value.description, 4096),
            start: value.start, end: value.end ?? null,
            ...(['tv', 'xmltv'].includes(value.source) ? { source: value.source } : {}),
        };
        if (!event.title) continue;
        if ((event.end !== null && event.end <= now - 60000) || event.start > now + 2 * DAY) continue;
        const key = JSON.stringify([event.eventId, event.title, event.start, event.end]);
        if (!unique.has(key)) unique.set(key, event);
    }
    const events = [...unique.values()].sort((a, b) => a.start - b.start || (a.end ?? Infinity) - (b.end ?? Infinity)
        || a.title.localeCompare(b.title));
    const relevant = events.filter(event => (event.end !== null && event.end > now) || event.start > now);
    const runningStarts = relevant.filter(event => event.start <= now).map(event => event.start);
    const earliestRunningStart = runningStarts.length ? Math.min(...runningStarts) : Infinity;
    const unknownPast = events.filter(event => event.end === null && event.start <= now
        && (event.start >= now - DAY || event.start >= earliestRunningStart));
    // Older unknown ends do not prove a current programme. Keep the most recent
    // four whole start groups so a newer unknown entry still challenges a known
    // current programme, without filling a basic-schema cache with old history.
    const recentUnknownStarts = new Set([...new Set(unknownPast.map(event => event.start))].slice(-4));
    const kept = [...unknownPast.filter(event => recentUnknownStarts.has(event.start)), ...relevant]
        .sort((a, b) => a.start - b.start || (a.end ?? Infinity) - (b.end ?? Infinity) || a.title.localeCompare(b.title));
    if (kept.length <= MAX_EVENTS) return kept;
    const count = safePrefixLength(kept, MAX_EVENTS, now);
    if (count === null) throw invalid('Das Sendungslimit würde aktuelle oder mehrdeutige Programmdaten abschneiden.');
    return kept.slice(0, count);
}

/** A programme without an end is useful as "next", but proves no current programme. */
function selectNowNext(events, now = Date.now()) {
    const current = events.filter(event => event.start <= now && event.end !== null && now < event.end);
    const future = events.filter(event => event.start > now).sort((a, b) => a.start - b.start);
    const sameFutureStart = future.length ? future.filter(event => event.start === future[0].start) : [];
    const candidate = current.length === 1 ? current[0] : null;
    const unknownReplacement = candidate && events.some(event => event.end === null
        && event.start <= now && event.start >= candidate.start);
    const nowEvent = candidate && !unknownReplacement ? candidate : null;
    const nextOverlaps = future.length > 0 && current.some(event => future[0].start < event.end);
    const nextEvent = sameFutureStart.length === 1 && !nextOverlaps ? future[0] : null;
    const ambiguous = current.length > 1 || sameFutureStart.length > 1 || nextOverlaps || Boolean(unknownReplacement);
    return { now: nowEvent, next: nextEvent, ambiguous };
}

function createCache(service, result, now = Date.now(), limit = MAX_CACHE_BYTES) {
    if (!plain(result) || !['tv', 'xmltv', 'mixed'].includes(result.source)
        || (result.source !== 'tv' && (typeof result.sourceKey !== 'string' || !/^[a-f0-9]{64}$/u.test(result.sourceKey)))
        || (result.source === 'xmltv' && (typeof result.sourceChannelId !== 'string' || !result.sourceChannelId
            || result.sourceChannelId !== result.sourceChannelId.trim() || !result.sourceChannelId.isWellFormed()
            || Buffer.byteLength(result.sourceChannelId) > 512 || /[\u0000-\u001f\u007f]/u.test(result.sourceChannelId)))) {
        throw invalid('Programmdaten benötigen eine bekannte Quelle und eine eindeutige Senderzuordnung.');
    }
    if (!timestamp(now) || !Number.isSafeInteger(limit) || limit < MIN_CACHE_BYTES || limit > MAX_CACHE_BYTES) {
        throw invalid('Ungültiger Zeitpunkt oder Größenrahmen für den EPG-Cache.');
    }
    const cache = {
        schemaVersion: result.source === 'tv' ? 2 : 3, identity: serviceIdentity(service), source: result.source,
        ...(result.source === 'tv' ? {} : { sourceKey: result.sourceKey }),
        ...(result.source === 'xmltv' ? { sourceChannelId: result.sourceChannelId } : {}),
        fetchedAt: now, events: normalizeEvents(result.events, now).map(event => result.source === 'mixed' ? event
            : result.source === 'xmltv' || event.source ? { ...event, source: result.source } : event),
    };
    // Preserve now/next first; long descriptions must not make a channel unusable.
    const bytes = () => Buffer.byteLength(JSON.stringify(cache));
    if (bytes() > limit) {
        cache.events = cache.events.map(event => ({ ...event, description: clip(event.description, 512), subtitle: clip(event.subtitle, 256) }));
    }
    while (bytes() > limit) {
        const count = safePrefixLength(cache.events, cache.events.length - 1, now);
        if (count === null) break;
        cache.events = cache.events.slice(0, count);
    }
    if (bytes() > limit) {
        // Metadata may be omitted before required programme identities/times.
        cache.events = cache.events.map(event => ({ ...event, description: '', subtitle: '' }));
    }
    if (bytes() > limit) throw invalid('EPG-Senderdaten überschreiten ohne sichere Kürzung die Größenbegrenzung.');
    return cache;
}

function restoreCache(value, service, now = Date.now(), { sourceKey } = {}) {
    if (!timestamp(now) || typeof value !== 'string' || Buffer.byteLength(value) > MAX_CACHE_BYTES) return null;
    try {
        const cache = JSON.parse(value);
        // Version 1 mixed TV and external schedules. Only explicit TV origin
        // may migrate; its former external-guide fingerprint is irrelevant.
        // Normalization also rejects any old estimated ends before publishing.
        const trustedTv = [1, 2].includes(cache?.schemaVersion) && cache.source === 'tv';
        const trustedExternal = cache?.schemaVersion === 3 && cache.source === 'xmltv'
            && typeof sourceKey === 'string' && /^[a-f0-9]{64}$/u.test(sourceKey) && cache.sourceKey === sourceKey;
        if (!plain(cache) || (!trustedTv && !trustedExternal)
            || cache.identity !== serviceIdentity(service)
            || !timestamp(cache.fetchedAt) || now - cache.fetchedAt > MAX_CACHE_AGE || cache.fetchedAt > now + 300000) return null;
        return { ...createCache(service, cache, now), fetchedAt: cache.fetchedAt };
    } catch { return null; }
}

module.exports = {
    DAY, MAX_CACHE_BYTES, MIN_CACHE_BYTES, MAX_CACHE_AGE, MAX_EVENTS,
    normalizeEvents, selectNowNext, createCache, restoreCache,
};
