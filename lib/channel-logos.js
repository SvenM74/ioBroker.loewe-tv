'use strict';

const { isIP } = require('node:net');
const { safeThumbnailUrl } = require('./channel-catalog');
const sources = require('../admin/logos/sources.json');

function normalizedName(value) {
    return typeof value === 'string' && value.length <= 1024
        ? value.normalize('NFKC').toLowerCase()
            .replace(/[äöüß]/gu, letter => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[letter]))
            .replace(/[^\p{L}\p{N}+]/gu, '') : '';
}

// These are explicit channel aliases, never a substring or fuzzy match. For
// example RTL, RTLZWEI and SUPER RTL must keep their separate identities.
const aliases = new Map();
for (const source of sources) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(source.slug)) continue;
    for (const name of [source.name, ...(source.aliases || [])]) {
        const key = normalizedName(name);
        if (key) aliases.set(key, `logos/${source.slug}.svg`);
    }
}

function bundledLogo(name) {
    const key = normalizedName(name);
    if (!key) return '';
    const direct = aliases.get(key);
    if (direct) return direct;
    // Quality markers can precede a declared regional name, e.g. "WDR HD Köln".
    // Keep regions and "+" intact; this normalization selects a picture only.
    const withoutQuality = normalizedName(name.normalize('NFKC')
        .replace(/(^|[^\p{L}\p{N}+])(?:uhd|hd|sd|4k)(?=$|[^\p{L}\p{N}+])/giu, '$1'));
    return aliases.get(withoutQuality)
        || aliases.get(key.replace(/(?:uhd|hd|sd|4k)$/u, ''))
        || aliases.get(withoutQuality.replace(/(?:uhd|hd|sd|4k)$/u, '')) || '';
}

/** The same HTTP host/control port used by the TV client, without credentials. */
function televisionOrigin(config = {}) {
    if (typeof config.host !== 'string') return '';
    const host = config.host.trim();
    const port = config.port ?? 905;
    if (!host || host.length > 253 || /[\s/\\?#@]/u.test(host)
        || !Number.isInteger(port) || port < 1 || port > 65535) return '';
    const bare = host.replace(/^\[|\]$/gu, '');
    const authority = isIP(bare) === 6 ? `[${bare}]` : host;
    if (isIP(bare) !== 6 && !/^[a-z0-9.-]+$/iu.test(authority)) return '';
    try { return new URL(`http://${authority}:${port}`).origin; } catch { return ''; }
}

function tvLogo(value, origin) {
    const url = safeThumbnailUrl(value);
    if (!url) return '';
    if (!url.startsWith('/')) return url;
    try {
        const base = new URL(origin);
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
            || base.pathname !== '/' || base.search || base.hash) return '';
        return safeThumbnailUrl(new URL(url, base).href);
    } catch { return ''; }
}

function absoluteLogo(value) {
    const url = safeThumbnailUrl(value);
    return url && !url.startsWith('/') ? url : '';
}

/**
 * Optional presentation metadata only; never part of channel/recording identity.
 * The caller must resolve overrides and XMLTV icons to this exact TV service.
 * External alternatives retain their order; the browser adds the local fallback.
 */
function channelLogo(service, origin, options = {}) {
    const candidates = [
        absoluteLogo(options?.overrideUrl),
        tvLogo(service?.thumbnailUrl, origin),
        absoluteLogo(options?.xmltvIconUrl),
    ];
    const seen = new Set();
    const external = candidates.filter(url => {
        if (!url) return false;
        const canonical = new URL(url).href;
        if (seen.has(canonical)) return false;
        seen.add(canonical);
        return true;
    });
    const fallback = bundledLogo(service?.name);
    if (external.length) return {
        logoUrl: external[0],
        ...(external.length > 1 ? { logoAlternatives: external.slice(1) } : {}),
        ...(fallback ? { logoFallback: fallback } : {}),
    };
    return fallback ? { logoUrl: fallback } : {};
}

module.exports = { bundledLogo, televisionOrigin, channelLogo, normalizedName };
