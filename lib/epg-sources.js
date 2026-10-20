'use strict';

const { createHash } = require('node:crypto');
const { serviceIdentity, safeThumbnailUrl } = require('./channel-catalog');
const { normalizeManualMappings } = require('./epg-mapping');
const { createCache, restoreCache, MAX_CACHE_AGE, MAX_CACHE_BYTES } = require('./epg-data');

const CHANNEL_ID = /^channels\.tv\.[A-Za-z0-9_]{1,240}$/u;
const MAX_BUNDLE_BYTES = 2 * MAX_CACHE_BYTES + 8192;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function guideUrl(value) {
    if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value.trim())) return '';
    try {
        const url = new URL(value.trim());
        return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password && !url.hash
            ? url.href : '';
    } catch { return ''; }
}

/** Optional EPG mistakes must not disable working TV and remote-control commands. */
function normalizeEpgConfig(input) {
    const url = guideUrl(input.epgXmltvUrl || '');
    // A valid existing feed with no source setting comes from an older
    // configuration. Honor it without overriding an explicit TV-only choice.
    const source = ['tv', 'auto', 'xmltv'].includes(input.epgSource) ? input.epgSource
        : input.epgSource === undefined && url ? 'auto' : 'tv';
    let mappings = {};
    let problem = '';
    try { mappings = normalizeManualMappings(input.epgXmltvMappings ?? []); }
    catch { problem = 'Die XMLTV-Senderzuordnung ist ungültig oder enthält doppelte TV-Sender. Bitte die EPG-Konfiguration korrigieren.'; }
    if (source !== 'tv' && !url) problem = 'Eine gültige HTTP(S)-Adresse für die XMLTV-Quelle in den EPG-Einstellungen eintragen.';
    const logos = {};
    const rows = input.channelLogoOverrides;
    if (Array.isArray(rows) && rows.length <= 2000) {
        const duplicates = new Set();
        for (const row of rows) {
            if (!row || typeof row !== 'object' || typeof row.channel !== 'string' || !CHANNEL_ID.test(row.channel)) continue;
            const url = typeof row.url === 'string' ? safeThumbnailUrl(row.url.trim()) : '';
            if (Object.hasOwn(logos, row.channel)) duplicates.add(row.channel);
            logos[row.channel] = url && /^https?:\/\//iu.test(url) ? url : '';
        }
        for (const id of duplicates) delete logos[id];
    }
    return { epgSource: source, epgXmltvUrl: url, epgXmltvMappings: mappings,
        channelLogoOverrides: logos, epgConfigError: source === 'tv' ? '' : problem };
}

function usesXmltv(config) { return !config.epgConfigError && ['auto', 'xmltv'].includes(config.epgSource); }

function configurationKey(config) {
    return hash([config.epgSource || 'tv', config.epgXmltvUrl || '',
        Object.entries(config.epgXmltvMappings || {}).sort(([a], [b]) => a.localeCompare(b))]);
}

function channelSourceKey(service, config) {
    const mappings = config.epgXmltvMappings || {};
    return hash([config.epgXmltvUrl || '', serviceIdentity(service), service.name,
        Array.isArray(service.aliases) ? [...new Set(service.aliases.filter(value => typeof value === 'string'))].sort() : [],
        Object.hasOwn(mappings, service.id) ? ['manual', mappings[service.id]] : ['automatic']]);
}

function fresh(cache, now) {
    return cache && Number.isSafeInteger(cache.fetchedAt) && cache.fetchedAt <= now + 300000
        && now - cache.fetchedAt <= MAX_CACHE_AGE;
}

function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
}

/** Keep real source times. A missing TV end is never inferred from another programme. */
function combineCaches(entry, config, now, limit) {
    const tv = entry.tvCache;
    const xmltv = entry.xmltvCache?.sourceKey === channelSourceKey(entry.service, config) ? entry.xmltvCache : null;
    if (!usesXmltv(config)) return tv;
    if (config.epgSource === 'xmltv') return xmltv;
    if (!fresh(xmltv, now)) return tv || xmltv;
    if (!fresh(tv, now)) return xmltv;
    const certainTv = tv.events.filter(event => event.end !== null);
    const external = xmltv.events.filter(event => !certainTv.some(other => event.end !== null
        ? overlaps(event, other) : event.start >= other.start && event.start < other.end));
    const uncertainTv = tv.events.filter(event => event.end === null
        && !external.some(other => other.start <= event.start && other.end !== null && event.start < other.end));
    const tvEvents = [...certainTv, ...uncertainTv];
    const externalEvents = external.filter(event => !uncertainTv.some(other => other.start === event.start));
    const events = [...tvEvents.map(event => ({ ...event, source: 'tv' })),
        ...externalEvents.map(event => ({ ...event, source: 'xmltv' }))];
    const source = tvEvents.length && externalEvents.length ? 'mixed' : externalEvents.length ? 'xmltv' : 'tv';
    const result = createCache(entry.service, { source, sourceKey: channelSourceKey(entry.service, config),
        sourceChannelId: xmltv.sourceChannelId, events }, now, limit);
    result.fetchedAt = source === 'tv' ? tv.fetchedAt : source === 'xmltv' ? xmltv.fetchedAt : Math.max(tv.fetchedAt, xmltv.fetchedAt);
    return result;
}

function safeMapping(row, service) {
    if (!row || row.tvChannelId !== service.id || !['automatic', 'manual', 'ambiguous', 'unmatched', 'missing', 'disabled'].includes(row.status)
        || (row.xmltvId !== null && (typeof row.xmltvId !== 'string' || Buffer.byteLength(row.xmltvId) > 512
            || row.xmltvId !== row.xmltvId.trim() || !row.xmltvId.isWellFormed() || /[\u0000-\u001f\u007f]/u.test(row.xmltvId)))) return null;
    const icon = typeof row.iconUrl === 'string' ? safeThumbnailUrl(row.iconUrl) : '';
    return { tvChannelId: service.id, xmltvId: row.xmltvId, status: row.status,
        ...(icon && /^https?:\/\//iu.test(icon) && ['automatic', 'manual'].includes(row.status) ? { iconUrl: icon } : {}) };
}

function serializeSources(entry, config) {
    if (!usesXmltv(config)) return JSON.stringify(entry.tvCache || {});
    return JSON.stringify({ schemaVersion: 4, identity: entry.identity, sourceKey: channelSourceKey(entry.service, config),
        tv: entry.tvCache || null, xmltv: entry.xmltvCache || null, mapping: safeMapping(entry.xmltvMapping, entry.service) });
}

function restoreSources(value, service, config, now) {
    const empty = { tvCache: null, xmltvCache: null, xmltvMapping: null };
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BUNDLE_BYTES) return empty;
    try {
        const bundle = JSON.parse(value);
        if (bundle?.schemaVersion !== 4) return { ...empty, tvCache: restoreCache(value, service, now) };
        if (bundle.identity !== serviceIdentity(service)) return empty;
        const tvCache = bundle.tv ? restoreCache(JSON.stringify(bundle.tv), service, now) : null;
        if (!usesXmltv(config) || config.epgConfigError || bundle.sourceKey !== channelSourceKey(service, config)) return { ...empty, tvCache };
        const xmltvCache = bundle.xmltv ? restoreCache(JSON.stringify(bundle.xmltv), service, now,
            { sourceKey: channelSourceKey(service, config) }) : null;
        const mapping = safeMapping(bundle.mapping, service);
        const manual = Object.hasOwn(config.epgXmltvMappings || {}, service.id);
        if (mapping && (manual
            ? config.epgXmltvMappings[service.id] === '' ? mapping.status !== 'disabled'
                : !['manual', 'missing'].includes(mapping.status) || mapping.xmltvId !== config.epgXmltvMappings[service.id]
            : !['automatic', 'ambiguous', 'unmatched'].includes(mapping.status))) return { ...empty, tvCache };
        if (xmltvCache && (xmltvCache.source !== 'xmltv' || !mapping || !mapping.xmltvId
            || mapping.xmltvId !== xmltvCache.sourceChannelId
            || mapping.status !== (manual ? 'manual' : 'automatic')
            || (manual && config.epgXmltvMappings[service.id] !== mapping.xmltvId))) return { ...empty, tvCache };
        return { tvCache, xmltvCache, xmltvMapping: mapping };
    } catch { return empty; }
}

module.exports = { guideUrl, normalizeEpgConfig, usesXmltv, configurationKey, channelSourceKey,
    combineCaches, safeMapping, serializeSources, restoreSources, MAX_BUNDLE_BYTES };
