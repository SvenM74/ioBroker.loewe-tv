'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const source = require('../lib/logo-registry-catalog.json');
const { resolveLogo, registryLogoUrl, searchLogoOptions, registryEntry, catalog, metadata, LOGO_LIMITS } = require('../lib/logo-registry');

const match = (name, options) => resolveLogo({ name }, options);

test('the directory resolves only the complete package-pinned PNG catalogue', () => {
    assert.equal(catalog.length, source.entries.length);
    assert.equal(metadata.count, 1046);
    assert.equal(metadata.repository, 'tv-logo/tv-logos');
    assert.match(metadata.revision, /^[a-f0-9]{40}$/u);
    assert.equal(new Set(catalog.map(entry => entry.id)).size, catalog.length);
    for (const entry of catalog) {
        assert.equal(registryEntry(entry.id), entry);
        assert.equal(registryLogoUrl(entry.id), `https://raw.githubusercontent.com/tv-logo/tv-logos/${metadata.revision}/${entry.id}`);
        assert.match(entry.blob, /^[a-f0-9]{40}$/u);
        assert.ok(Number.isSafeInteger(entry.size) && entry.size > 0);
        assert.ok(Object.isFrozen(entry));
    }
    assert.ok(Object.isFrozen(catalog));
    assert.ok(Object.isFrozen(metadata));
    assert.ok(Object.isFrozen(metadata.scope));
});

test('ordinary TV spellings and quality markers select their exact registered logos', () => {
    const cases = [
        [' ZDF_HD ', 'countries/germany/hd/zdf-hd-de.png'],
        ['ZDFHD', 'countries/germany/hd/zdf-hd-de.png'],
        ['ZDF', 'countries/germany/zdf-de.png'],
        ['ZDF UHD', 'countries/germany/zdf-de.png'],
        ['RTL UHD', 'countries/germany/hd/rtl-uhd-de.png'],
        ['RTL HD', 'countries/germany/hd/rtl-hd-de.png'],
        ['RTL SD', 'countries/germany/rtl-de.png'],
        ['SAT.1 HD', 'countries/germany/hd/sat-1-hd-de.png'],
        ['DMAX HD', 'countries/germany/hd/dmax-hd-de.png'],
        ['Tele5 HD', 'countries/germany/hd/tele-5-hd-de.png'],
        ['ProSieben MAXX HD', 'countries/germany/hd/pro-sieben-maxx-hd-de.png'],
    ];
    for (const [name, expected] of cases) {
        assert.equal(match(name).status, 'automatic', name);
        assert.equal(match(name).logoId, expected, name);
    }
});

test('declared broadcaster aliases preserve brands while finding an exact HD mark', () => {
    const cases = [
        ['ARD HD', 'countries/germany/hd/das-erste-hd-de.png'],
        ['ARD Das Erste HD', 'countries/germany/hd/das-erste-hd-de.png'],
        ['Pro7 HD', 'countries/germany/hd/pro-sieben-hd-de.png'],
        ['Kabel1 HD', 'countries/germany/hd/kabel-eins-hd-de.png'],
        ['RTL II HD', 'countries/germany/hd/rtl-zwei-hd-de.png'],
        ['RTL 2', 'countries/germany/rtl-zwei-de.png'],
        ['RTL Super HD', 'countries/germany/hd/super-rtl-hd-de.png'],
        ['ORF eins HD', 'countries/austria/orf1-at.png'],
        ['SRF2 HD', 'countries/switzerland/srf-zwei-ch.png'],
    ];
    for (const [name, expected] of cases) assert.equal(match(name).logoId, expected, name);
});

test('regional logos take precedence over a generic station logo carrying HD text', () => {
    const cases = [
        ['WDR HD Bonn', 'countries/germany/wdr-bonn-de.png'],
        ['WDR HD Düsseldorf', 'countries/germany/wdr-dusseldorf-de.png'],
        ['WDR Duesseldorf HD', 'countries/germany/wdr-dusseldorf-de.png'],
        ['WDR Muenster HD', 'countries/germany/wdr-munster-de.png'],
        ['MDR HD Thüringen', 'countries/germany/mdr-thuringen-de.png'],
        ['MDR S-Anhalt HD', 'countries/germany/mdr-sachsen-anhalt-de.png'],
        ['NDR HD FS HH', 'countries/germany/ndr-hamburg-de.png'],
        ['NDR FS SH HD', 'countries/germany/ndr-schleswig-holstein-de.png'],
        ['BR HD Süd', 'countries/germany/br-sud-de.png'],
        ['BR Fernsehen Sued HD', 'countries/germany/br-sud-de.png'],
        ['rbb Berlin HD', 'countries/germany/rbb-berlin-de.png'],
        ['rbb Brandenburg HD', 'countries/germany/rbb-brandenburg-de.png'],
    ];
    for (const [name, expected] of cases) assert.equal(match(name).logoId, expected, name);
    assert.equal(match('WDR HD Köln').logoId, 'countries/germany/hd/wdr-hd-de.png', 'Declared region with no dedicated directory image');
    assert.equal(match('BR Nord HD').logoId, 'countries/germany/hd/br-hd-de.png');
    assert.equal(match('SWR RP HD').logoId, 'countries/germany/hd/swr-hd-de.png');
});

test('unknown regions, timeshifts, languages and subbrands never become a neighbouring station automatically', () => {
    for (const name of ['WDR Atlantis HD', 'BR Mitte HD', 'MDR West HD', 'NDR Radio HD',
        'SWR Unknown HD', 'RTL+1 HD', 'RTL HD+', 'RTLZWEI YOU HD', 'VOX Extra HD',
        'Sky Sport 99 HD', 'ZDF SDInfo', 'France 24 Klingon', 'BBC News', 'AXN Grey HD']) {
        const row = match(name);
        assert.equal(row.status, 'unmatched', name);
        assert.equal(row.logoId, null, name);
    }
    assert.equal(match('VOXup HD').logoId, 'countries/germany/hd/vox-up-hd-de.png');
    assert.equal(match('RTLup').logoId, 'countries/germany/rtl-up-de.png');
    assert.equal(match('AXN Black HD').logoId, 'countries/germany/hd/axn-black-hd-de.png');
    assert.equal(match('AXN White HD').logoId, 'countries/germany/hd/axn-white-hd-de.png');
    assert.notEqual(match('Sky Sport 1 HD').logoId, match('Sky Sport 2 HD').logoId);
    assert.notEqual(match('ORF1').logoId, match('ORF2').logoId);
});

test('a different explicit quality is a suggestion, never an automatic substitute', () => {
    assert.equal(match('Funbox UHD').logoId, 'countries/international/funbox-uhd-int.png');
    for (const name of ['Funbox', 'Funbox HD', 'Funbox SD', 'Funbox 4K']) {
        const row = match(name);
        assert.equal(row.status, 'unmatched', name);
        assert.equal(row.logoId, null, name);
        assert.ok(row.candidates.some(entry => entry.id === 'countries/international/funbox-uhd-int.png'), name);
    }
    assert.equal(match('ZDF HD SD').status, 'unmatched', 'Conflicting quality markers must not be guessed');
});

test('country preference chooses the declared edition and keeps an all-country conflict visible', () => {
    const german = 'countries/germany/hd/servus-tv-deutchland-hd-de.png';
    const austrian = 'countries/austria/hd/servus-tv-hd-at.png';
    assert.equal(match('Servus TV HD', { country: 'de' }).logoId, german);
    assert.equal(match('Servus TV HD', { country: 'at' }).logoId, austrian);
    assert.equal(match('Servus TV Deutschland HD', { country: 'at' }).logoId, german, 'An explicit edition overrides country preference');
    for (const country of ['all', 'ch']) {
        const row = match('Servus TV HD', { country });
        assert.equal(row.status, 'ambiguous');
        assert.equal(row.logoId, null);
        assert.deepEqual(new Set(row.candidates.map(entry => entry.id)), new Set([german, austrian]));
    }
    assert.equal(match('DMAX', { country: 'at' }).logoId, 'countries/austria/dmax-austria-at.png');
    assert.equal(match('DMAX Austria', { country: 'de' }).logoId, 'countries/austria/dmax-austria-at.png');
});

test('international and uniquely named neighbouring-country channels remain available', () => {
    assert.equal(match('CNN International HD').logoId, 'countries/international/cnn-international-int.png');
    assert.equal(match('Arena Sport 1').logoId, 'countries/world-europe/arena-sport/arena-sport-1-eu.png');
    assert.equal(match('ORF1 HD').logoId, 'countries/austria/orf1-at.png');
    assert.equal(match('SRF 1 HD').logoId, 'countries/switzerland/srf-1-ch.png');
    assert.equal(match('Disney Channel', { country: 'de' }).logoId, 'countries/germany/disney-channel-de.png');
    assert.equal(match('Disney Channel', { country: 'all' }).status, 'ambiguous');
});

test('the standard mark wins only over declared design alternatives', () => {
    const sky = match('Sky Cinema Christmas HD');
    assert.equal(sky.status, 'automatic');
    assert.equal(sky.logoId, 'countries/germany/hd/sky-cinema-christmas-hd-de.png');
    assert.ok(sky.candidates.some(entry => entry.variant === 'alternate'));
    assert.ok(sky.candidates.some(entry => entry.variant === 'horizontal'));
    assert.equal(match('Arena Sport 1').logoId, 'countries/world-europe/arena-sport/arena-sport-1-eu.png');
    assert.equal(match('BBC News Arabic White').logoId, 'countries/international/bbc-news-arabic-white-hz-int.png');
    assert.equal(match('BBC News Arabic').logoId, 'countries/international/bbc-news-arabic-int.png');
});

test('TV aliases can help without discarding the primary service region, quality or number', () => {
    assert.equal(resolveLogo({ name: 'Zweites HD', aliases: ['ZDF HD'] }).logoId, 'countries/germany/hd/zdf-hd-de.png');
    assert.equal(resolveLogo({ name: 'ZDF HD', aliases: ['Das Erste HD'] }).logoId, 'countries/germany/hd/zdf-hd-de.png');
    for (const service of [
        { name: 'WDR Atlantis HD', aliases: ['WDR HD'] },
        { name: 'RTLZWEI YOU HD', aliases: ['RTL HD'] },
        { name: 'Example SD', aliases: ['ZDF HD'] },
        { name: 'Sport 99 HD', aliases: ['Sky Sport 1 HD'] },
    ]) {
        assert.equal(resolveLogo(service).status, 'unmatched', JSON.stringify(service));
    }
});

test('manual choices and disabled directory rows do not depend on name or country guesses', () => {
    const chosen = 'countries/austria/atv2-at.png';
    const manual = match('ZDF HD', { mode: 'manual', logoId: chosen, country: 'de' });
    assert.equal(manual.status, 'manual');
    assert.equal(manual.logoId, chosen);
    assert.deepEqual(manual.candidates, [registryEntry(chosen)]);
    assert.deepEqual(match('ZDF HD', { mode: 'disabled', logoId: chosen }),
        { status: 'disabled', logoId: null, candidates: [] });
    assert.deepEqual(match('ZDF HD', { mode: 'manual', logoId: 'countries/germany/no-longer-present-de.png' }),
        { status: 'missing', logoId: 'countries/germany/no-longer-present-de.png', candidates: [] });
    assert.deepEqual(match('ZDF HD', { mode: 'manual', logoId: '' }),
        { status: 'missing', logoId: null, candidates: [] });
});

test('unknown registry IDs cannot inject remote URLs, mutable branches, traversal or markup', () => {
    for (const id of [undefined, null, 7, {}, '', 'main/countries/germany/zdf-de.png',
        'https://example.invalid/logo.png', '//example.invalid/logo.png',
        'countries/germany/../../another.png', 'countries/germany/zdf-de.png?token=x',
        'countries/germany/zdf-de.png#x', 'countries/germany/zdf-de.png\n',
        'countries/germany/%2e%2e.png', 'countries/germany/<script>.png', '__proto__']) {
        assert.equal(registryLogoUrl(id), '', String(id));
        assert.equal(registryEntry(id), null, String(id));
    }
    assert.equal(registryLogoUrl('countries/germany/no-longer-present-de.png'), '');
});

test('malformed TV names cannot break lookup or change the immutable catalogue', () => {
    for (const name of [undefined, null, 4, [], {}, '', 'ZDF\nHD', 'ZDF\u0000HD', '\ud800', 'ZDF' + ' '.repeat(1024)]) {
        assert.equal(match(name).status, 'unmatched', String(name));
    }
    const service = Object.freeze({ name: 'WDR HD Bonn', aliases: Object.freeze(['WDR Bonn HD']) });
    const options = Object.freeze({ country: 'de', mode: 'auto', logoId: '' });
    const result = resolveLogo(service, options);
    result.candidates.length = 0;
    assert.equal(resolveLogo(service, options).logoId, 'countries/germany/wdr-bonn-de.png');
    assert.ok(resolveLogo(service, options).candidates.length > 0);
});

test('manual dropdown starts with useful suggestions but keeps the whole directory available', () => {
    const options = searchLogoOptions({ service: { name: 'ZDF HD' }, country: 'de' });
    assert.equal(options.length, catalog.length);
    assert.equal(options[0].value, 'countries/germany/hd/zdf-hd-de.png');
    assert.ok(options.some(option => option.value === 'countries/austria/atv2-at.png'));
    assert.ok(options.some(option => option.value === 'countries/switzerland/srf-1-ch.png'));
    assert.equal(new Set(options.map(option => option.value)).size, options.length);
    assert.ok(options.every(option => typeof option.label === 'string' && !option.label.includes('undefined')));
    const unknown = searchLogoOptions({ service: { name: 'An unknown TV channel' } });
    assert.equal(unknown.length, catalog.length, 'An unmatched channel must still have manual choices');
});

test('manual dropdown filtering preserves an existing choice instead of clearing it', () => {
    const selected = 'countries/austria/atv2-at.png';
    const filtered = searchLogoOptions({ query: 'ZDF HD', selected });
    assert.equal(filtered[0].value, selected);
    assert.ok(filtered.slice(1).every(option => /zdf/iu.test(option.label) && /hd/iu.test(option.label)));
    const missing = 'countries/germany/previous-choice-de.png';
    const retained = searchLogoOptions({ query: 'ZDF HD', selected: missing });
    assert.equal(retained[0].value, missing);
    assert.match(retained[0].label, /Nicht im aktuellen Verzeichnis/u);
    assert.deepEqual(searchLogoOptions({ query: 'x'.repeat(LOGO_LIMITS.query + 1) }), []);
    assert.deepEqual(searchLogoOptions({ query: 'ZDF\n' }), []);
    for (const query of ['x'.repeat(LOGO_LIMITS.query + 1), 'ZDF\n', {}, null]) {
        const invalidSearch = searchLogoOptions({ query, selected });
        assert.equal(invalidSearch.length, 1);
        assert.equal(invalidSearch[0].value, selected, 'Invalid search text must not discard the saved logo choice');
    }
});

test('manual search accepts familiar punctuation and joined quality suffixes', () => {
    assert.ok(searchLogoOptions({ query: 'SAT.1' }).some(option => option.value === 'countries/germany/sat-1-de.png'));
    assert.ok(searchLogoOptions({ query: 'SAT.1 HD' }).some(option => option.value === 'countries/germany/hd/sat-1-hd-de.png'));
    assert.ok(searchLogoOptions({ query: 'ZDFHD' }).some(option => option.value === 'countries/germany/hd/zdf-hd-de.png'));
    assert.ok(searchLogoOptions({ query: 'SRF2' }).length === 0, 'Search formatting normalization does not invent an alias');
    assert.equal(match('WDR Unknown').status, 'unmatched', 'Search normalization never weakens automatic assignment');
});

test('similar-name suggestions remain bounded and are never silently selected', () => {
    const row = match('Sky Sport 99 HD');
    assert.equal(row.status, 'unmatched');
    assert.equal(row.logoId, null);
    assert.ok(row.candidates.length > 0 && row.candidates.length <= LOGO_LIMITS.candidates);
    assert.equal(match('WDR Atlantis HD').logoId, null);
    assert.equal(match('AXN Grey HD').logoId, null);
});
