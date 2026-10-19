'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sax = require('sax');
const { bundledLogo, televisionOrigin, channelLogo, normalizedName } = require('../lib/channel-logos');
const sources = require('../admin/logos/sources.json');

test('bundled logos match declared channel aliases and quality suffixes without fuzzy matches', () => {
    assert.ok(sources.length > 0);
    for (const source of sources) {
        for (const name of [source.name, ...source.aliases]) {
            assert.equal(bundledLogo(name), `logos/${source.slug}.svg`, name);
            assert.equal(bundledLogo(`${name} HD`), `logos/${source.slug}.svg`, `${name} HD`);
        }
    }
    assert.equal(bundledLogo(' zDf_HD '), 'logos/zdf.svg');
    assert.equal(bundledLogo('ZDF UHD'), 'logos/zdf.svg');
    for (const name of ['Not ZDF', 'ZDF unknown', 'Unknown', 'RTL+ extra', '', null, 7]) {
        assert.equal(bundledLogo(name), '', String(name));
    }
    assert.notEqual(bundledLogo('ZDFinfo'), bundledLogo('ZDF'));
    assert.notEqual(bundledLogo('SUPER RTL'), bundledLogo('RTL'));
});

test('logo aliases accept quality tokens and German spellings while preserving channel distinctions', () => {
    for (const name of ['WDR HD Köln', 'WDR HD Koeln', 'WDR Muenster HD', 'WDR Duesseldorf',
        ' WDR_UHD_Düsseldorf ', 'WDR HD Köln SD']) {
        assert.equal(bundledLogo(name), 'logos/wdr.svg', name);
    }
    assert.equal(bundledLogo('BR HD Sued'), 'logos/br.svg');
    assert.equal(bundledLogo('MDR HD Thueringen'), 'logos/mdr.svg');
    assert.equal(bundledLogo('NDR HD FS HH'), 'logos/ndr.svg');
    assert.equal(bundledLogo('ZDFHD'), 'logos/zdf.svg');
    assert.equal(bundledLogo('ZDF neo HD'), 'logos/zdfneo.svg');
    assert.equal(bundledLogo('KiKA HD'), 'logos/kika.svg');
    assert.equal(bundledLogo('phoenix HD'), 'logos/phoenix.svg');
    for (const name of ['WDR HD Unknown', 'NDR HD Radio', 'WDRHD Köln', 'RTL HD+',
        'RTL+ HD', 'RTLZWEI extra HD', 'SUPER RTL extra HD', 'ZDF neo extra', 'ZDF SDInfo',
        'ZDF' + ' '.repeat(1024), [], {}]) {
        assert.equal(bundledLogo(name), '', String(name));
    }
});

test('ARTE, RTLZWEI and VOX cover their names without claiming neighbouring programmes', () => {
    // Synthetic spelling examples, not a captured TV channel list.
    for (const name of ['ARTE', 'arte HD', 'ARTE UHD']) {
        assert.equal(bundledLogo(name), 'logos/arte.svg', name);
    }
    for (const name of ['RTLZWEI HD', 'RTL Zwei', 'RTL II HD', 'RTLII', 'RTL 2', 'RTL2 HD']) {
        assert.equal(bundledLogo(name), 'logos/rtlzwei.svg', name);
    }
    for (const name of ['VOX', 'Vox HD', 'VOX SD']) {
        assert.equal(bundledLogo(name), 'logos/vox.svg', name);
    }
    for (const name of ['RTLup HD', 'RTL+ HD', 'RTLZWEI YOU', 'VOXup HD', 'VOX Music TV', 'ARTE extra']) {
        assert.equal(bundledLogo(name), '', name);
    }
    assert.notEqual(bundledLogo('RTLZWEI'), bundledLogo('RTL'));
    assert.notEqual(bundledLogo('RTLZWEI'), bundledLogo('SUPER RTL'));
});

test('TV thumbnail takes precedence while retaining the local fallback and original service', () => {
    const service = { name: 'ZDF HD', thumbnailUrl: 'http://tv.invalid:905/images/zdf.png' };
    const before = structuredClone(service);
    assert.deepEqual(channelLogo(service), { logoUrl: service.thumbnailUrl, logoFallback: 'logos/zdf.svg' });
    assert.deepEqual(service, before);
    assert.deepEqual(channelLogo({ name: 'ZDF HD' }), { logoUrl: 'logos/zdf.svg' });
    assert.deepEqual(channelLogo({ name: 'Unknown' }), {});
    assert.deepEqual(channelLogo({ name: 'Unknown', thumbnailUrl: 'https://tv.invalid/image.png' }),
        { logoUrl: 'https://tv.invalid/image.png' });
});

test('per-service overrides, TV and mapped XMLTV icons retain bounded ordered fallbacks', () => {
    // Synthetic addresses exercise selection; these are not captured TV/XMLTV data.
    const service = Object.freeze({ serviceId: '1-2-3', name: 'ZDF HD', thumbnailUrl: '/images/zdf.png' });
    const options = Object.freeze({ overrideUrl: 'https://manual.invalid/logo.png',
        xmltvIconUrl: 'https://xmltv.invalid/zdf.png' });
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', options), {
        logoUrl: options.overrideUrl,
        logoAlternatives: ['http://tv.invalid:905/images/zdf.png', options.xmltvIconUrl],
        logoFallback: 'logos/zdf.svg',
    });
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', { xmltvIconUrl: options.xmltvIconUrl }), {
        logoUrl: 'http://tv.invalid:905/images/zdf.png',
        logoAlternatives: [options.xmltvIconUrl],
        logoFallback: 'logos/zdf.svg',
    });
    assert.deepEqual(channelLogo({ name: 'ZDF HD' }, undefined, options), {
        logoUrl: options.overrideUrl,
        logoAlternatives: [options.xmltvIconUrl],
        logoFallback: 'logos/zdf.svg',
    });
    assert.deepEqual(channelLogo({ name: 'Unknown' }, undefined, { xmltvIconUrl: options.xmltvIconUrl }),
        { logoUrl: options.xmltvIconUrl });
    assert.deepEqual(channelLogo({ name: 'ZDF HD' }, undefined, { xmltvIconUrl: options.xmltvIconUrl }),
        { logoUrl: options.xmltvIconUrl, logoFallback: 'logos/zdf.svg' });
    assert.deepEqual(channelLogo({ name: 'ZDF HD' }, undefined, null), { logoUrl: 'logos/zdf.svg' });
    assert.deepEqual(service, { serviceId: '1-2-3', name: 'ZDF HD', thumbnailUrl: '/images/zdf.png' });
    assert.deepEqual(options, { overrideUrl: 'https://manual.invalid/logo.png',
        xmltvIconUrl: 'https://xmltv.invalid/zdf.png' });
});

test('equivalent external image addresses are attempted only once', () => {
    assert.deepEqual(channelLogo({ name: 'ZDF', thumbnailUrl: 'https://logos.invalid/zdf.png' }, undefined, {
        overrideUrl: 'https://LOGOS.invalid:443/./zdf.png',
        xmltvIconUrl: 'https://logos.invalid/zdf.png',
    }), { logoUrl: 'https://LOGOS.invalid:443/./zdf.png', logoFallback: 'logos/zdf.svg' });
    assert.deepEqual(channelLogo({ name: 'Unknown', thumbnailUrl: '/logo.png' }, 'http://tv.invalid:905', {
        xmltvIconUrl: 'http://tv.invalid:905/logo.png',
    }), { logoUrl: 'http://tv.invalid:905/logo.png' });
});

test('automatic logo policy preserves manual, TV, registry, XMLTV and local fallback order', () => {
    const service = Object.freeze({ name: 'ZDF HD', thumbnailUrl: '/images/zdf.png' });
    const options = Object.freeze({ source: 'auto', overrideUrl: 'https://manual.invalid/zdf.png',
        registryLogoUrl: 'https://registry.invalid/zdf-hd.png', xmltvIconUrl: 'https://xmltv.invalid/zdf.png' });
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', options), {
        logoUrl: options.overrideUrl,
        logoAlternatives: ['http://tv.invalid:905/images/zdf.png', options.registryLogoUrl, options.xmltvIconUrl],
        logoFallback: 'logos/zdf.svg',
    });
    assert.deepEqual(channelLogo({ name: 'ZDF HD' }, undefined, {
        registryLogoUrl: options.registryLogoUrl, xmltvIconUrl: options.xmltvIconUrl,
    }), { logoUrl: options.registryLogoUrl, logoAlternatives: [options.xmltvIconUrl], logoFallback: 'logos/zdf.svg' });
});

test('strict TV policy excludes automatic registry, XMLTV and bundled pictures', () => {
    const service = { name: 'ZDF HD', thumbnailUrl: '/images/zdf.png' };
    const options = { source: 'tv', registryLogoUrl: 'https://registry.invalid/zdf.png',
        xmltvIconUrl: 'https://xmltv.invalid/zdf.png' };
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', options),
        { logoUrl: 'http://tv.invalid:905/images/zdf.png' });
    assert.deepEqual(channelLogo({ name: 'ZDF HD' }, 'http://tv.invalid:905', options), {});
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', { ...options, overrideUrl: 'https://manual.invalid/zdf.png' }),
        { logoUrl: 'https://manual.invalid/zdf.png', logoAlternatives: ['http://tv.invalid:905/images/zdf.png'] });
});

test('strict registry policy excludes TV, XMLTV and bundled pictures while retaining explicit URLs', () => {
    const service = { name: 'ZDF HD', thumbnailUrl: 'https://tv.invalid/zdf.png' };
    const options = { source: 'registry', registryLogoUrl: 'https://registry.invalid/zdf.png',
        xmltvIconUrl: 'https://xmltv.invalid/zdf.png' };
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', options), { logoUrl: options.registryLogoUrl });
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', { ...options, registryLogoUrl: '' }), {});
    assert.deepEqual(channelLogo(service, 'http://tv.invalid:905', { ...options, overrideUrl: 'https://manual.invalid/zdf.png' }),
        { logoUrl: 'https://manual.invalid/zdf.png', logoAlternatives: [options.registryLogoUrl] });
});

test('equivalent URLs are deduplicated across all four external logo sources', () => {
    const url = 'https://logos.invalid/zdf.png';
    assert.deepEqual(channelLogo({ name: 'ZDF', thumbnailUrl: url }, undefined, {
        overrideUrl: 'https://LOGOS.invalid:443/./zdf.png', registryLogoUrl: url, xmltvIconUrl: url,
    }), { logoUrl: 'https://LOGOS.invalid:443/./zdf.png', logoFallback: 'logos/zdf.svg' });
    assert.deepEqual(channelLogo({ name: 'ZDF', thumbnailUrl: url }, undefined, {
        source: 'registry', overrideUrl: url, registryLogoUrl: url,
    }), { logoUrl: url });
});

test('unsafe registry metadata cannot bypass URL validation or strict source policy', () => {
    for (const registryLogoUrl of ['//other.invalid/logo.png', '/local.svg', 'logos/zdf.svg',
        'javascript:alert(1)', 'data:image/png,test', 'https://user:secret@other.invalid/logo.png',
        'https://other.invalid/\\logo.png', 'https://other.invalid/%0alogo.png', {}, null]) {
        assert.deepEqual(channelLogo({ name: 'ZDF', thumbnailUrl: 'https://tv.invalid/zdf.png' }, undefined,
            { source: 'registry', registryLogoUrl }), {}, String(registryLogoUrl));
    }
    assert.deepEqual(channelLogo({ name: 'ZDF' }, undefined, { source: 'unknown' }), { logoUrl: 'logos/zdf.svg' });
});

test('manual and XMLTV image URLs must be absolute safe HTTP(S) addresses', () => {
    for (const value of [undefined, null, 7, {}, '', '/images/zdf.svg', 'logos/zdf.svg',
        'data:image/svg+xml,test', 'javascript:alert(1)', 'file:///tmp/zdf.svg', '//other.invalid/zdf.svg',
        'https://user:secret@logos.invalid/zdf.svg', 'https://@logos.invalid/zdf.svg',
        'https://logos.invalid/\\zdf.svg', 'https://logos.invalid/\nzdf.svg',
        'https://logos.invalid/%5czdf.svg', 'https://logos.invalid/%0azdf.svg',
        'https://logos.invalid/' + '字'.repeat(1000), 'https://logos.invalid/' + 'x'.repeat(2048)]) {
        const options = { overrideUrl: value, xmltvIconUrl: value };
        assert.deepEqual(channelLogo({ name: 'ZDF', thumbnailUrl: 'https://tv.invalid/zdf.png' }, undefined, options),
            { logoUrl: 'https://tv.invalid/zdf.png', logoFallback: 'logos/zdf.svg' }, String(value).slice(0, 80));
        assert.deepEqual(channelLogo({ name: 'Unknown' }, undefined, options), {}, String(value).slice(0, 80));
    }
    assert.deepEqual(channelLogo({ name: 'ZDF' }, undefined, { overrideUrl: 'https://logos.invalid/logo.svg?size=2#logo' }),
        { logoUrl: 'https://logos.invalid/logo.svg?size=2#logo', logoFallback: 'logos/zdf.svg' });
});

test('TV-relative thumbnails resolve only against a validated configured TV origin', () => {
    const service = { name: 'Unknown', thumbnailUrl: '/images/channel.svg?size=small' };
    assert.deepEqual(channelLogo(service, televisionOrigin({ host: '192.0.2.20', port: 905 })),
        { logoUrl: 'http://192.0.2.20:905/images/channel.svg?size=small' });
    assert.deepEqual(channelLogo(service, televisionOrigin({ host: '2001:db8::20', port: 906 })),
        { logoUrl: 'http://[2001:db8::20]:906/images/channel.svg?size=small' });
    assert.equal(televisionOrigin({ host: '[2001:db8::20]', port: 906 }), 'http://[2001:db8::20]:906');
    assert.equal(televisionOrigin({ host: 'loewe-tv.local' }), 'http://loewe-tv.local:905');
    for (const origin of [undefined, '', 'file:///tmp', 'https://user:secret@tv.invalid',
        'https://tv.invalid/private', 'https://tv.invalid/?secret=x', 'https://tv.invalid/#x']) {
        assert.deepEqual(channelLogo(service, origin), {}, String(origin));
    }
});

test('invalid TV metadata and origins cannot introduce browser-active URLs or credentials', () => {
    for (const thumbnailUrl of ['javascript:alert(1)', 'data:image/svg+xml,test', '//other.invalid/logo',
        'file:///tmp/logo.svg', 'http://user:secret@tv.invalid/logo', '/\\other.invalid/logo',
        'https://tv.invalid/\nlogo', 'https://tv.invalid/%5clogo', '/images/%0a-logo',
        'https://tv.invalid/' + '字'.repeat(1000), 'https://tv.invalid/' + 'x'.repeat(2048)]) {
        assert.deepEqual(channelLogo({ name: 'ZDF', thumbnailUrl }, 'http://tv.invalid:905'),
            { logoUrl: 'logos/zdf.svg' }, thumbnailUrl.slice(0, 80));
    }
    for (const host of ['', 'http://tv.invalid', 'user@tv.invalid', 'tv.invalid/path',
        'tv.invalid:905', 'tv.invalid?secret=x', 'tv.invalid\\path', 'tv invalid']) {
        assert.equal(televisionOrigin({ host }), '', host);
    }
    for (const port of [0, -1, 65536, '905', 1.2]) {
        assert.equal(televisionOrigin({ host: 'tv.invalid', port }), '', String(port));
    }
});

test('every bundled logo has traceable licensing, a unique alias and a checked static SVG', () => {
    const owners = new Map();
    const slugs = new Set();
    for (const source of sources) {
        assert.match(source.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
        assert.equal(slugs.has(source.slug), false, source.slug);
        slugs.add(source.slug);
        assert.match(source.sourcePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
        assert.match(source.downloadSource, /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\//u);
        assert.match(source.license, /PD-textlogo|Public domain/iu);
        assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/u);
        const svg = fs.readFileSync(path.join(__dirname, '../admin/logos', `${source.slug}.svg`), 'utf8');
        assert.equal(createHash('sha256').update(svg).digest('hex'), source.sha256, source.slug);
        assert.match(svg, /<svg\b/u);
        assert.match(svg, /\bviewBox=/u);
        const parser = sax.parser(true);
        let root;
        parser.onopentag = node => { if (!root) root = node; };
        assert.doesNotThrow(() => parser.write(svg).close(), `${source.slug}: well-formed SVG`);
        assert.equal(root.name, 'svg', source.slug);
        assert.equal(root.attributes.xmlns, 'http://www.w3.org/2000/svg', source.slug);
        const viewBox = root.attributes.viewBox.trim().split(/[\s,]+/u).map(Number);
        assert.equal(viewBox.length, 4, source.slug);
        assert.ok(viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0,
            `${source.slug}: valid image proportions`);
        assert.doesNotMatch(svg, /<(?:script|foreignObject|iframe|image|animate|set)\b|\bon[a-z]+\s*=|<!ENTITY|<!DOCTYPE|@import/iu);
        for (const match of svg.matchAll(/\bhref\s*=\s*["']([^"']*)["']/giu)) {
            assert.match(match[1], /^#/u, `${source.slug}: external SVG reference`);
        }
        for (const match of svg.matchAll(/\burl\(([^)]*)\)/giu)) {
            assert.match(match[1].trim().replace(/^["']|["']$/gu, ''), /^#/u,
                `${source.slug}: external SVG style reference`);
        }
        for (const alias of [source.name, ...source.aliases]) {
            const key = normalizedName(alias);
            assert.ok(key);
            assert.ok(!owners.has(key) || owners.get(key) === source.slug, `Conflicting channel alias: ${alias}`);
            owners.set(key, source.slug);
        }
    }
    assert.deepEqual(fs.readdirSync(path.join(__dirname, '../admin/logos')).filter(name => name.endsWith('.svg')).sort(),
        [...slugs].map(slug => `${slug}.svg`).sort());
});
