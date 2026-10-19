'use strict';

const catalogue = require('./logo-registry-catalog.json');
const bundledSources = require('../admin/logos/sources.json');
const { normalizedName } = require('./channel-logos');

const LOGO_LIMITS = Object.freeze({ name: 1024, aliases: 16, candidates: 8, query: 512, options: 1200 });
const COUNTRIES = new Set(['de', 'at', 'ch', 'int', 'eu']);
const PREFERENCES = new Set(['de', 'at', 'ch', 'all']);
const VARIANTS = Object.freeze({ standard: 0, alternate: 1, horizontal: 2, icon: 3 });
const COUNTRY_LABELS = Object.freeze({ de: 'Deutschland', at: 'Österreich', ch: 'Schweiz', int: 'International', eu: 'Europa' });
const VARIANT_LABELS = Object.freeze({ standard: '', alternate: 'Alternative', horizontal: 'Querformat', icon: 'Symbol' });

function safeName(value, limit = LOGO_LIMITS.name) {
    return typeof value === 'string' && value.length > 0 && value.length <= limit
        && value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : '';
}

function identifier(value) {
    return typeof value === 'string' && value.length <= 512
        && /^countries\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)*[a-z0-9][a-z0-9-]*\.png$/u.test(value);
}

/** Separate picture quality from the complete brand/region name. All other
 * words, channel numbers, '+' and subbrands remain part of the identity. */
function parsedName(value) {
    const name = safeName(value);
    if (!name) return { key: '', base: '', quality: '', words: [] };
    const qualities = [];
    let base = name.normalize('NFKC').toLowerCase().replace(
        /(^|[^\p{L}\p{N}+])(uhd|hd|sd|4k|8k)(?=$|[^\p{L}\p{N}+])/giu,
        (_match, boundary, quality) => { qualities.push(quality.toLowerCase()); return boundary; });
    // A broadcaster may join the suffix, e.g. ZDFHD. No prefix or interior
    // substring is removed from a brand such as HD1 or ZDF SDInfo.
    base = base.replace(/(uhd|hd|sd|4k|8k)$/iu, quality => { qualities.push(quality.toLowerCase()); return ''; });
    const quality = [...new Set(qualities)].sort().join(' ');
    return { key: normalizedName(name), base: normalizedName(base), quality,
        words: base.replace(/[äöüß]/gu, letter => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[letter]))
            .split(/[^\p{L}\p{N}+]+/u).filter(Boolean), text: base.trim() };
}

const keyOf = (base, quality = '') => `${base}|${quality}`;
const preference = value => PREFERENCES.has(value) ? value : 'de';

// This is an explicit, reviewable alias list. It does not derive brand identity
// from common prefixes: RTL, RTLZWEI, RTLup and RTL+ remain different channels.
const EQUIVALENT_NAMES = [
    ['Das Erste', 'ARD', 'ARD Das Erste'],
    ['RTL', 'RTL Television'],
    ['ProSieben', 'Pro7'],
    ['Kabel Eins', 'Kabel 1'],
    ['RTLZWEI', 'RTL II', 'RTL 2'],
    ['RTL Super', 'Super RTL'],
    ['WDR', 'WDR Fernsehen'],
    ['MDR', 'MDR Fernsehen'],
    ['NDR', 'NDR Fernsehen'],
    ['BR', 'BR Fernsehen', 'Bayerisches Fernsehen'],
    ['SR', 'SR Fernsehen', 'Saarländischer Rundfunk'],
    ['SWR', 'SWR Fernsehen'],
    ['hr', 'hr Fernsehen'],
    ['rbb', 'rbb Fernsehen'],
    ['WDR Düsseldorf', 'WDR Dusseldorf'],
    ['WDR Münster', 'WDR Munster'],
    ['MDR Thüringen', 'MDR Thuringen'],
    ['MDR S-Anhalt', 'MDR Sachsen-Anhalt'],
    ['NDR FS HH', 'NDR Hamburg'],
    ['NDR FS SH', 'NDR Schleswig-Holstein'],
    ['NDR FS MV', 'NDR Mecklenburg-Vorpommern'],
    ['NDR FS NDS', 'NDR Niedersachsen'],
    ['BR Süd', 'BR Sud', 'BR Fernsehen Süd'],
    ['BR Nord', 'BR Fernsehen Nord'],
    ['SWR BW', 'SWR Baden-Württemberg'],
    ['SWR RP', 'SWR Rheinland-Pfalz'],
    ['ORF 1', 'ORF eins'],
    ['ORF 2', 'ORF zwei'],
    ['ORF 3', 'ORF drei'],
    ['ORF Kärnten', 'ORF Karnten'],
    ['ORF Niederösterreich', 'ORF Niederosterreich'],
    ['ORF Oberösterreich', 'ORF Oberosterreich'],
    ['SRF 2', 'SRF zwei'],
    ['Baden TV Süd', 'Baden TV Sud'],
    ['TV Südostschweiz', 'TV Sudostschweiz'],
    ['Servus TV Deutschland', 'Servus TV Deutchland'],
];

const equivalents = new Map();
for (const names of EQUIVALENT_NAMES) {
    const keys = [...new Set(names.map(normalizedName).filter(Boolean))];
    for (const key of keys) equivalents.set(key, keys);
}
const equivalentKeys = key => equivalents.get(key) || [key];

// Only these known regional services may fall back to their shared station
// mark. An exact regional logo always takes precedence, even without HD text.
const regionalBrands = new Map();
for (const source of bundledSources.filter(value => ['wdr', 'mdr', 'ndr', 'br', 'sr'].includes(value.slug))) {
    const common = source.slug;
    const generic = new Set(equivalentKeys(normalizedName(common)));
    for (const name of [source.name, ...(source.aliases || [])]) {
        const key = normalizedName(name);
        if (generic.has(key)) continue;
        for (const equivalent of equivalentKeys(key)) regionalBrands.set(equivalent, common);
    }
}
for (const [region, station] of [['SWR BW', 'SWR'], ['SWR RP', 'SWR'],
    ['rbb Berlin', 'rbb'], ['rbb Brandenburg', 'rbb']]) {
    for (const key of equivalentKeys(normalizedName(region))) regionalBrands.set(key, normalizedName(station));
}

function addIndex(index, key, entry) {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(entry);
}

// Explicit country editions in the repository can share a bare brand name
// only when the user's country preference resolves the edition. Never remove
// a language, city, region or country supplied in the TV's own channel name.
function countryBrand(parsed, country) {
    const suffixes = { de: /\s+(?:deutschland|deutchland|germany)$/u,
        at: /\s+(?:austria|österreich|oesterreich|osterreich)$/u,
        ch: /\s+(?:schweiz|switzerland)$/u };
    const base = suffixes[country] ? parsed.text.replace(suffixes[country], '') : parsed.text;
    return base !== parsed.text ? normalizedName(base) : '';
}

const entries = [];
const byId = new Map();
const names = new Map();
const countryNames = new Map();
const entryNames = new Map();
const validCatalogue = catalogue.schemaVersion === 1 && catalogue.repository === 'tv-logo/tv-logos'
    && /^[a-f0-9]{40}$/u.test(catalogue.revision) && Array.isArray(catalogue.entries)
    && catalogue.entries.length <= LOGO_LIMITS.options;
if (validCatalogue) {
    for (const raw of catalogue.entries) {
        if (!raw || !identifier(raw.id) || !safeName(raw.name) || !COUNTRIES.has(raw.country)
            || !Object.hasOwn(VARIANTS, raw.variant) || byId.has(raw.id)) continue;
        const entry = Object.freeze({ ...raw });
        const parsed = parsedName(entry.name);
        if (!parsed.base || parsed.quality.includes(' ')) continue;
        entries.push(entry);
        byId.set(entry.id, entry);
        entryNames.set(entry.id, parsed);
        addIndex(names, keyOf(parsed.base, parsed.quality), entry);
        const bareCountryBrand = countryBrand(parsed, entry.country);
        if (bareCountryBrand) addIndex(countryNames, keyOf(bareCountryBrand, parsed.quality), entry);
    }
}
const catalog = Object.freeze(entries);
const metadata = Object.freeze({ repository: catalogue.repository, revision: catalogue.revision,
    sourceTree: catalogue.sourceTree, sourceUrl: catalogue.sourceUrl, readmeUrl: catalogue.readmeUrl,
    scope: Object.freeze([...(catalogue.scope || [])]), count: catalog.length });

function registryEntry(id) { return typeof id === 'string' ? byId.get(id) || null : null; }

/** Only package-pinned catalogue paths may become a registry URL. Manual image
 * URLs remain a separate feature; this is not an arbitrary URL constructor. */
function registryLogoUrl(id) {
    return validCatalogue && registryEntry(id)
        ? `https://raw.githubusercontent.com/${catalogue.repository}/${catalogue.revision}/${id}` : '';
}

function countryRank(entry, country) {
    if (country === 'all') return 0;
    return entry.country === country ? 0 : ['int', 'eu'].includes(entry.country) ? 1 : 2;
}

function compare(a, b, country) {
    return countryRank(a, country) - countryRank(b, country) || VARIANTS[a.variant] - VARIANTS[b.variant]
        || a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id, 'en');
}

function lookup(bases, quality) {
    const found = new Map();
    for (const base of bases) {
        for (const entry of [...(names.get(keyOf(base, quality)) || []),
            ...(countryNames.get(keyOf(base, quality)) || [])]) found.set(entry.id, entry);
    }
    return [...found.values()];
}

function safeServiceAlias(primary, alias) {
    if (!primary.base || !alias.base || primary.quality !== alias.quality) return false;
    if (equivalentKeys(primary.base).includes(alias.base)) return true;
    if ((primary.base.match(/[+\d]+/gu) || []).join('') !== (alias.base.match(/[+\d]+/gu) || []).join('')) return false;
    const meaningful = parsed => parsed.words.filter(word => !/^(?:das|der|die|the)$/u.test(word));
    const first = meaningful(primary);
    const second = meaningful(alias);
    // An explicit alternate single-brand name can identify the same station.
    // A removed/changed suffix, number or shared brand prefix cannot.
    return first.length === 1 && second.length === 1
        && !first[0].startsWith(second[0]) && !second[0].startsWith(first[0]);
}

function levels(parsed) {
    if (!parsed.base || parsed.quality.includes(' ')) return [];
    const alternatives = equivalentKeys(parsed.base).filter(value => value !== parsed.base);
    const result = [lookup([parsed.base], parsed.quality), lookup(alternatives, parsed.quality)];
    if (parsed.quality) result.push(lookup([parsed.base], ''), lookup(alternatives, ''));
    const shared = regionalBrands.get(parsed.base);
    if (shared) {
        result.push(lookup([shared], parsed.quality), lookup(equivalentKeys(shared).filter(key => key !== shared), parsed.quality));
        if (parsed.quality) result.push(lookup([shared], ''), lookup(equivalentKeys(shared).filter(key => key !== shared), ''));
    }
    return result;
}

function suggestions(parsed, aliases, country) {
    const references = [parsed, ...aliases].filter(value => value.base);
    if (!references.length) return [];
    const scored = [];
    for (const entry of catalog) {
        const candidate = entryNames.get(entry.id);
        let score = 0;
        for (const own of references) {
            const shared = own.words.filter(word => word.length > 1 && !['tv', 'fernsehen', 'channel'].includes(word)
                && candidate.words.includes(word)).length;
            const exactBase = equivalentKeys(own.base).includes(candidate.base);
            if (!shared && !exactBase) continue;
            score = Math.max(score, (exactBase ? 100 : 0) + shared * 5 + (own.quality === candidate.quality ? 2 : 0));
        }
        if (score) scored.push({ entry, score });
    }
    return scored.sort((a, b) => b.score - a.score || compare(a.entry, b.entry, country))
        .slice(0, LOGO_LIMITS.candidates).map(value => value.entry);
}

/** Logo matching is presentation metadata only. It never chooses an EPG
 * source, a recording service ID or a television command target. */
function resolveLogo(service, { country = 'de', mode = 'auto', logoId = '' } = {}) {
    country = preference(country);
    const result = { status: 'unmatched', logoId: null, candidates: [] };
    if (mode === 'disabled') return { ...result, status: 'disabled' };
    if (mode === 'manual') {
        const chosen = registryEntry(logoId);
        return { status: chosen ? 'manual' : 'missing', logoId: identifier(logoId) ? logoId : null,
            candidates: chosen ? [chosen] : [] };
    }
    const parsed = parsedName(service?.name);
    const aliases = Array.isArray(service?.aliases) ? service.aliases.slice(0, LOGO_LIMITS.aliases)
        .map(parsedName).filter(value => value.base) : [];
    const eligibleAliases = aliases.filter(alias => safeServiceAlias(parsed, alias));
    const candidatesByLevel = levels(parsed);
    for (const alias of eligibleAliases) candidatesByLevel.push(...levels(alias));
    for (const candidates of candidatesByLevel) {
        if (!candidates.length) continue;
        const sorted = [...candidates].sort((a, b) => compare(a, b, country));
        const first = sorted[0];
        const best = sorted.filter(value => countryRank(value, country) === countryRank(first, country)
            && VARIANTS[value.variant] === VARIANTS[first.variant]);
        return { status: best.length === 1 ? 'automatic' : 'ambiguous',
            logoId: best.length === 1 ? first.id : null,
            candidates: sorted.slice(0, LOGO_LIMITS.candidates) };
    }
    return { ...result, candidates: suggestions(parsed, aliases, country) };
}

function label(entry) {
    return `${entry.name} · ${COUNTRY_LABELS[entry.country]}${VARIANT_LABELS[entry.variant]
        ? ` · ${VARIANT_LABELS[entry.variant]}` : ''} [${entry.id}]`;
}

function retainSelected(options, selected) {
    if (identifier(selected) && !options.some(option => option.value === selected)) {
        const entry = registryEntry(selected);
        options.unshift({ value: selected, label: entry ? label(entry) : `Nicht im aktuellen Verzeichnis: ${selected}` });
    }
    return options;
}

/** Keep the full small pinned directory selectable. A suggestion is ordering,
 * never a hidden filter; manual corrections can choose another country/logo. */
function searchLogoOptions({ service, country = 'de', query = '', selected = '' } = {}) {
    country = preference(country);
    const queryText = query === '' ? '' : safeName(query, LOGO_LIMITS.query);
    if (query !== '' && !queryText) return retainSelected([], selected);
    const tokens = queryText.toLowerCase().split(/\s+/u).filter(Boolean);
    const preferred = new Map(resolveLogo(service, { country }).candidates.map((entry, index) => [entry.id, index]));
    const filtered = catalog.filter(entry => {
        const searchable = `${entry.name} ${entry.id} ${COUNTRY_LABELS[entry.country]}`.toLowerCase();
        const compact = `${normalizedName(entry.name)} ${normalizedName(entry.id)} ${normalizedName(COUNTRY_LABELS[entry.country])}`;
        return tokens.every(token => searchable.includes(token) || (normalizedName(token) && compact.includes(normalizedName(token))));
    }).sort((a, b) => (preferred.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (preferred.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        || compare(a, b, country));
    const options = filtered.slice(0, LOGO_LIMITS.options).map(entry => ({ value: entry.id, label: label(entry) }));
    return retainSelected(options, selected);
}

module.exports = { resolveLogo, registryLogoUrl, searchLogoOptions, registryEntry,
    catalog, metadata, LOGO_LIMITS };
