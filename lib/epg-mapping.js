'use strict';

const MAPPING_LIMITS = Object.freeze({ services: 2000, channels: 50000, names: 16, candidates: 8 });
const TV_CHANNEL_ID = /^channels\.tv\.[A-Za-z0-9_]{1,240}$/u;

function invalid(message) {
    return Object.assign(new Error(`XMLTV: ${message}`), { code: 'XMLTV_MAPPING' });
}

function identifier(value) {
    return typeof value === 'string' && value.length > 0 && value === value.trim()
        && Buffer.byteLength(value) <= 512 && !/[\u0000-\u001f\u007f]/u.test(value) && value.isWellFormed();
}

/** Formatting normalization keeps quality, region, numbers and '+' intact. */
function normalizeName(value) {
    return typeof value === 'string' ? value.normalize('NFC').toLowerCase()
        .replace(/[\u2010-\u2015._-]+/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
}

function safeIconUrl(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/u.test(value)) return '';
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password
            && !url.hash ? url.href : '';
    } catch { return ''; }
}

function normalizeManualMappings(input = {}) {
    if (!input || typeof input !== 'object') throw invalid('Die manuelle Senderzuordnung ist ungültig.');
    let entries;
    if (Array.isArray(input)) {
        entries = input.map(row => {
            if (!row || typeof row !== 'object' || Array.isArray(row)
                || Reflect.ownKeys(row).length !== 2 || !Object.hasOwn(row, 'channel') || !Object.hasOwn(row, 'xmltvId')) {
                throw invalid('Jede manuelle Zuordnung benötigt genau channel und xmltvId.');
            }
            return [row.channel, row.xmltvId];
        });
    } else {
        if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
            throw invalid('Die manuelle Senderzuordnung muss ein einfaches Objekt sein.');
        }
        entries = Reflect.ownKeys(input).map(key => [key, input[key]]);
    }
    if (entries.length > MAPPING_LIMITS.services) throw invalid('Zu viele manuelle Senderzuordnungen.');
    const result = {};
    for (const [channel, xmltvId] of entries) {
        if (typeof channel !== 'string' || !TV_CHANNEL_ID.test(channel)
            || (xmltvId !== '' && !identifier(xmltvId)) || Object.hasOwn(result, channel)) {
            throw invalid('Eine manuelle Senderzuordnung ist ungültig oder doppelt vorhanden.');
        }
        result[channel] = xmltvId;
    }
    return result;
}

function names(values) {
    if (!Array.isArray(values) || values.length > MAPPING_LIMITS.names
        || values.some(value => typeof value !== 'string' || value.length > 512
            || /[\u0000-\u001f\u007f]/u.test(value) || !value.isWellFormed())) {
        throw invalid('Ein Sender enthält ungültige Namen oder Aliasse.');
    }
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function quality(value) {
    // Broadcaster/grabber names also concatenate the quality suffix (ARDHD).
    // It may not disappear merely because an alternate name adds spaces.
    return [...new Set(value.match(/(?:uhd|hd|sd|4k|8k)(?=\s|$)/gu) || [])].sort().join(' ');
}

function tokens(value) { return value.split(/\s+/u).filter(Boolean); }

// An alternate name is evidence only if it retains explicit variants. Shared
// brand words followed by a changed/missing suffix may be a region or subbrand;
// those alternatives are offered for review instead of being chosen silently.
function safeAlias(primary, alternate) {
    if (primary === alternate) return true;
    if (quality(primary) !== quality(alternate)) return false;
    const variants = value => (value.match(/[+\d]+/gu) || []).join('');
    if (variants(primary) !== variants(alternate)) return false;
    const meaningful = value => tokens(value).filter(word => !/^(?:das|der|die|the|uhd|hd|sd|4k|8k)$/u.test(word));
    const first = meaningful(primary);
    const second = meaningful(alternate);
    if (!first.length || !second.length) return false;
    if (first.some(a => second.some(b => a === b
        || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)))))) return false;
    // A complete, explicitly provided single-brand alias can be used, e.g.
    // ARD HD / Das Erste HD. Additional words may denote an unknown region or
    // edition; without a canonical exact match those remain review proposals.
    return first.length === 1 && second.length === 1;
}

function addIndex(index, key, id) {
    if (!key) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(id);
}

function indexedChannels(input) {
    if (!Array.isArray(input) || input.length > MAPPING_LIMITS.channels) throw invalid('Zu viele oder ungültige XMLTV-Sender.');
    const channels = new Map();
    const allNames = new Map();
    const automaticNames = new Map();
    const compactNames = new Map();
    const words = new Map();
    for (const value of input) {
        if (!value || typeof value !== 'object' || !identifier(value.id) || channels.has(value.id)) {
            throw invalid('Eine XMLTV-Senderkennung fehlt oder ist doppelt vorhanden.');
        }
        const channel = { id: value.id, names: names(value.names) };
        const iconUrl = safeIconUrl(value.iconUrl);
        if (iconUrl) channel.iconUrl = iconUrl;
        channels.set(channel.id, channel);
        const primary = normalizeName(channel.names[0]);
        for (const name of channel.names) {
            const key = normalizeName(name);
            addIndex(allNames, key, channel.id);
            if (safeAlias(primary, key)) addIndex(automaticNames, key, channel.id);
            addIndex(compactNames, key.replace(/\s+/gu, ''), channel.id);
            for (const word of tokens(key)) {
                if (word.length > 1 && !/^(?:das|der|die|the|tv|hd|sd|uhd|4k|8k|fernsehen|channel)$/u.test(word)) {
                    addIndex(words, word, channel.id);
                }
            }
        }
    }
    return { channels, allNames, automaticNames, compactNames, words };
}

function normalizedServices(input) {
    if (!Array.isArray(input) || input.length > MAPPING_LIMITS.services) throw invalid('Zu viele oder ungültige TV-Sender.');
    const seen = new Set();
    return input.map(service => {
        if (!service || typeof service !== 'object' || typeof service.id !== 'string' || !TV_CHANNEL_ID.test(service.id)
            || seen.has(service.id) || (service.itemClass !== undefined && service.itemClass !== 'video')) {
            throw invalid('Die Senderzuordnung darf nur eindeutige TV-Sender der gewählten Liste enthalten.');
        }
        seen.add(service.id);
        const aliases = service.aliases === undefined ? [] : names(service.aliases);
        const all = names([service.name, ...aliases]);
        return { id: service.id, names: all };
    });
}

/**
 * Choose only an unambiguous exact name/explicit alias. Similar names are
 * suggestions, never assignments. Manual IDs override names, including an
 * explicit empty value which disables external data for that TV service.
 */
function resolveMappings(services, xmltvChannels, manualMappings = {}) {
    const manual = normalizeManualMappings(manualMappings);
    const television = normalizedServices(services);
    const index = indexedChannels(xmltvChannels);
    const candidate = (id, reason) => {
        const channel = index.channels.get(id);
        return { ...channel, names: [...channel.names], reason };
    };
    const sorted = ids => [...ids].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    return television.map(service => {
        const row = { tvChannelId: service.id, xmltvId: null, status: 'unmatched', candidates: [] };
        if (Object.hasOwn(manual, service.id)) {
            const id = manual[service.id];
            row.xmltvId = id || null;
            row.status = id === '' ? 'disabled' : index.channels.has(id) ? 'manual' : 'missing';
            if (row.status === 'manual') {
                row.candidates = [candidate(id, 'manual')];
                if (index.channels.get(id).iconUrl) row.iconUrl = index.channels.get(id).iconUrl;
            }
            return row;
        }
        const primary = normalizeName(service.names[0]);
        let exact = new Set(index.allNames.get(primary) || []);
        let eligible = new Set(index.automaticNames.get(primary) || []);
        let reason = 'name';
        if (!exact.size) {
            reason = 'alias';
            for (const name of service.names.slice(1)) {
                const key = normalizeName(name);
                for (const id of index.allNames.get(key) || []) exact.add(id);
                if (safeAlias(primary, key)) {
                    for (const id of index.automaticNames.get(key) || []) eligible.add(id);
                }
            }
        }
        if (exact.size) {
            const ids = sorted(exact);
            row.candidates = ids.slice(0, MAPPING_LIMITS.candidates).map(id => candidate(id, reason));
            if (ids.length === 1 && eligible.has(ids[0])) {
                row.xmltvId = ids[0];
                row.status = 'automatic';
                if (index.channels.get(ids[0]).iconUrl) row.iconUrl = index.channels.get(ids[0]).iconUrl;
            } else if (ids.length > 1) row.status = 'ambiguous';
            return row;
        }
        const possible = new Set();
        // Indexed suggestions avoid an unbounded pairwise edit-distance scan.
        // A cap affects only the review list, never an automatic decision.
        for (const name of service.names) {
            const key = normalizeName(name);
            for (const id of index.compactNames.get(key.replace(/\s+/gu, '')) || []) {
                possible.add(id);
                if (possible.size >= 256) break;
            }
            for (const word of tokens(key)) {
                for (const id of index.words.get(word) || []) {
                    possible.add(id);
                    if (possible.size >= 256) break;
                }
                if (possible.size >= 256) break;
            }
            if (possible.size >= 256) break;
        }
        const ownWords = new Set(tokens(primary));
        const score = id => Math.max(0, ...index.channels.get(id).names.map(name => {
            const key = normalizeName(name);
            return (key.replace(/\s+/gu, '') === primary.replace(/\s+/gu, '') ? 100 : 0)
                + tokens(key).filter(word => ownWords.has(word)).length * 2 + (quality(primary) === quality(key) ? 1 : 0);
        }));
        row.candidates = sorted(possible).map(id => ({ id, score: score(id) })).sort((a, b) => b.score - a.score)
            .slice(0, MAPPING_LIMITS.candidates).map(value => candidate(value.id, 'similar'));
        return row;
    });
}

module.exports = { resolveMappings, normalizeManualMappings, normalizeName, safeIconUrl, MAPPING_LIMITS };
