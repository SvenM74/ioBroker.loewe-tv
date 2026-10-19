'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveMappings, normalizeManualMappings, normalizeMappingRows, normalizeName, safeIconUrl, MAPPING_LIMITS } = require('../lib/epg-mapping');

const service = (name, aliases = [], id = 'channels.tv.Selected') => ({ id, name, aliases, itemClass: 'video' });
const channel = (id, ...names) => ({ id, names });
const match = (tv, channels, manual = {}) => resolveMappings([tv], channels, manual)[0];

test('a unique canonical name tolerates case and formatting but preserves quality, region and plus', () => {
    const tv = service('WDR–Köln HD');
    const row = match(tv, [channel('koeln', 'WDR Köln HD'), channel('duesseldorf', 'WDR Düsseldorf HD'),
        channel('sd', 'WDR Köln'), channel('uhd', 'WDR Köln UHD')]);
    assert.equal(row.status, 'automatic');
    assert.equal(row.xmltvId, 'koeln');
    assert.equal(normalizeName(' RTL+  HD '), 'rtl+ hd');
    assert.notEqual(normalizeName('RTL+'), normalizeName('RTL'));
    assert.notEqual(normalizeName('ZDF UHD'), normalizeName('ZDF HD'));
    assert.notEqual(normalizeName('RTL +1'), normalizeName('RTL 1'));
});

test('explicit brand aliases work in either source without inventing aliases from IDs', () => {
    const fromTv = match(service('ARD HD', ['Das Erste HD']), [channel('first', 'Das Erste HD')]);
    assert.equal(fromTv.status, 'automatic');
    assert.equal(fromTv.candidates[0].reason, 'alias');
    const fromFeed = match(service('ARD HD'), [channel('first', 'Das Erste HD', 'ARD HD')]);
    assert.equal(fromFeed.status, 'automatic');
    assert.equal(fromFeed.xmltvId, 'first');
    assert.equal(match(service('ARD HD'), [channel('ARD HD', 'Unrelated')]).status, 'unmatched');
});

test('a canonical match wins over a less specific TV alias', () => {
    const row = match(service('WDR Köln HD', ['WDR HD']), [channel('regional', 'WDR Köln HD'), channel('generic', 'WDR HD')]);
    assert.equal(row.xmltvId, 'regional');
    assert.deepEqual(row.candidates.map(value => value.id), ['regional']);
});

test('aliases dropping quality, numbers, regions or edition words are review proposals only', () => {
    for (const [primary, alias] of [
        ['ZDF HD', 'ZDF'], ['ZDF UHD', 'ZDF HD'], ['ZDF SD', 'ZDF'],
        ['WDR Köln HD', 'WDR HD'], ['NDR Niedersachsen', 'NDR'],
        ['Regional TV Süd HD', 'RTV HD'], ['RTL 2 HD', 'RTL HD'],
        ['RTL +1 HD', 'RTL HD'], ['RTL+ HD', 'RTL HD'],
        ['ARDHD', 'Das Erste'], ['ARDUHD', 'Das Erste HD'],
    ]) {
        const sourceAlias = match(service(alias), [channel('candidate', primary, alias)]);
        const televisionAlias = match(service(primary, [alias]), [channel('candidate', alias)]);
        for (const row of [sourceAlias, televisionAlias]) {
            assert.equal(row.xmltvId, null, primary + ' / ' + alias);
            assert.equal(row.status, 'unmatched');
            assert.equal(row.candidates[0].id, 'candidate');
        }
    }
});

test('two identical names remain ambiguous even when only one has a preferred-looking ID or icon', () => {
    const row = match(service('ZDF HD'), [{ ...channel('zdf', 'ZDF HD'), iconUrl: 'https://logo.example/zdf.svg' },
        channel('zdf-regional', 'ZDF HD')]);
    assert.equal(row.status, 'ambiguous');
    assert.equal(row.xmltvId, null);
    assert.deepEqual(row.candidates.map(value => value.id), ['zdf', 'zdf-regional']);
});

test('all exact candidates participate in ambiguity before the display list is capped', () => {
    const row = match(service('ZDF HD'), Array.from({ length: 40 }, (_, i) => channel('z' + i, 'ZDF HD')));
    assert.equal(row.status, 'ambiguous');
    assert.equal(row.candidates.length, MAPPING_LIMITS.candidates);
    assert.equal(row.xmltvId, null);
});

test('similar compact or word names are bounded suggestions, never assignments', () => {
    const rows = resolveMappings([service('RTLHD'), service('WDR Bonn HD', [], 'channels.tv.Second')],
        [channel('rtl', 'RTL HD'), ...Array.from({ length: 1000 }, (_, i) => channel('wdr' + i, 'WDR Ort' + i + ' HD'))]);
    assert.equal(rows[0].candidates[0].id, 'rtl');
    assert.equal(rows[1].candidates.length, MAPPING_LIMITS.candidates);
    for (const row of rows) {
        assert.equal(row.status, 'unmatched');
        assert.equal(row.xmltvId, null);
        assert.ok(row.candidates.every(value => value.reason === 'similar'));
    }
});

test('manual selection overrides names and disabled/missing entries never fall back automatically', () => {
    const tv = service('ZDF HD');
    const channels = [channel('zdf', 'ZDF HD'), { ...channel('chosen', 'Another channel'), iconUrl: 'https://icons.example/chosen.svg' }];
    const chosen = match(tv, channels, { [tv.id]: 'chosen' });
    assert.equal(chosen.status, 'manual');
    assert.equal(chosen.xmltvId, 'chosen');
    assert.equal(chosen.iconUrl, 'https://icons.example/chosen.svg');
    assert.equal(chosen.candidates[0].reason, 'manual');
    assert.deepEqual(match(tv, channels, { [tv.id]: '' }), {
        tvChannelId: tv.id, xmltvId: null, status: 'disabled', candidates: [],
    });
    assert.deepEqual(match(tv, channels, { [tv.id]: 'gone' }), {
        tvChannelId: tv.id, xmltvId: 'gone', status: 'missing', candidates: [],
    });
});

test('manual rows normalize into a plain object and unselected TV IDs do not create rows', () => {
    const manual = normalizeManualMappings([{ channel: 'channels.tv.Selected', xmltvId: 'zdf' },
        { channel: 'channels.tv.Other', xmltvId: '' }]);
    assert.equal(Object.getPrototypeOf(manual), Object.prototype);
    assert.deepEqual(manual, { 'channels.tv.Selected': 'zdf', 'channels.tv.Other': '' });
    assert.deepEqual(normalizeManualMappings(manual), manual);
    const rows = resolveMappings([service('ZDF HD')], [channel('zdf', 'ZDF HD')], manual);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tvChannelId, 'channels.tv.Selected');
});

test('cleared or omitted Admin selections preserve automatic, disabled and unfinished manual intent', () => {
    const tv = service('ZDF HD');
    const catalogue = [channel('zdf', 'ZDF HD')];
    for (const selection of [{}, { xmltvId: undefined }, { xmltvId: null }, { xmltvId: '' }]) {
        for (const mode of ['auto', 'disabled', 'manual']) {
            const input = [{ channel: tv.id, mode, ...selection }];
            const before = structuredClone(input);
            const normalized = normalizeMappingRows(input);
            assert.deepEqual(normalized, [{ channel: tv.id, mode, xmltvId: '' }]);
            assert.deepEqual(normalizeManualMappings(input), mode === 'auto' ? {} : { [tv.id]: '' });
            const result = match(tv, catalogue, input);
            assert.equal(result.status, mode === 'auto' ? 'automatic' : 'disabled');
            assert.equal(result.xmltvId, mode === 'auto' ? 'zdf' : null);
            assert.deepEqual(input, before, 'Recovery never changes the saved form value in place.');
            assert.notEqual(normalized[0], input[0]);
        }
    }
});

test('empty legacy placeholders are skipped without losing adjacent saved corrections', () => {
    const input = [
        {}, { channel: '', xmltvId: '' }, { channel: null, xmltvId: null },
        { channel: undefined, xmltvId: undefined, mode: 'auto', tvChannel: '', assignment: '', revision: 3 },
        { mode: 'manual', tvChannel: ' ', assignment: '', revision: null },
        { channel: 'channels.tv.Selected', xmltvId: 'keep-this-id' },
        { channel: 'channels.tv.Other', xmltvId: '' },
        { channel: 'channels.tv.Unfinished' },
    ];
    const before = structuredClone(input);
    const normalized = normalizeMappingRows(input);
    assert.deepEqual(normalized, [
        { channel: 'channels.tv.Selected', xmltvId: 'keep-this-id' },
        { channel: 'channels.tv.Other', xmltvId: '' },
        { channel: 'channels.tv.Unfinished', xmltvId: '', mode: 'manual' },
    ]);
    assert.deepEqual(normalizeManualMappings(input), {
        'channels.tv.Selected': 'keep-this-id', 'channels.tv.Other': '', 'channels.tv.Unfinished': '',
    });
    assert.deepEqual(input, before);
    assert.deepEqual(normalizeMappingRows(normalized), normalized, 'Recovery is stable on a second load.');
});

test('recovery never infers a missing TV identity from a source ID, label or row position', () => {
    for (const incomplete of [{ xmltvId: 'keep-this-id' }, { channel: null, xmltvId: 'keep-this-id' },
        { tvChannel: '1. ZDF HD', mode: 'auto' }, { assignment: 'Manuell: ZDF HD', mode: 'manual' }]) {
        assert.throws(() => normalizeMappingRows([{}, { channel: 'channels.tv.Other', xmltvId: 'other' }, incomplete]),
            error => error.code === 'XMLTV_MAPPING' && /Zeile 3: Der TV-Sender fehlt/u.test(error.message));
    }
    for (const row of [{ host: '' }, { xmltvId: '', locator: '' }, { mode: 'unknown' },
        { revision: -1 }, { xmltvId: false }, { tvChannel: ' '.repeat(513) },
        { assignment: ' '.repeat(1201) }, { assignment: '\n' }, { channel: 'channels.radio.Wrong', mode: 'auto' }]) {
        assert.throws(() => normalizeMappingRows([row]), { code: 'XMLTV_MAPPING' });
    }
    assert.throws(() => normalizeMappingRows([
        { channel: 'channels.tv.Selected', mode: 'auto' }, {}, { channel: 'channels.tv.Selected', mode: 'disabled' },
    ]), error => error.code === 'XMLTV_MAPPING' && /Zeile 3: Der TV-Sender ist doppelt/u.test(error.message));
});

test('manual mapping validation rejects duplicate, foreign and malformed rows before use', () => {
    for (const input of [null, '', [{ channel: 'channels.tv.Selected', xmltvId: 'x' }, { channel: 'channels.tv.Selected', xmltvId: 'x' }],
        [{ channel: 'loewe-tv.1.channels.tv.Selected', xmltvId: 'x' }], [{ channel: 'channels.radio.Selected', xmltvId: 'x' }],
        [{ channel: 'channels.tv.Selected', xmltvId: 'x', host: 'other' }], { 'channels.tv.Selected': null },
        { '': '' }, { 'channels.tv.Selected': ' x' }, { 'channels.tv.Selected': 'x\u0000' }, new Map(),
        { 'channels.tv.Selected': 'x'.repeat(513) }]) {
        assert.throws(() => normalizeManualMappings(input), { code: 'XMLTV_MAPPING' });
    }
});

test('duplicate XMLTV IDs, invalid services and oversized metadata cannot influence matching', () => {
    const cases = [
        () => resolveMappings([service('A')], [channel('same', 'A'), channel('same', 'B')]),
        () => resolveMappings([service('A'), service('B')], []),
        () => resolveMappings([{ ...service('A'), itemClass: 'audio' }], []),
        () => resolveMappings([service('A')], [channel('x', 'A\u0000')]),
        () => resolveMappings([service('A')], [channel('x', ...Array(17).fill('A'))]),
    ];
    for (const action of cases) assert.throws(action, { code: 'XMLTV_MAPPING' });
});

test('icons are optional validated HTTP(S) URLs and returned arrays do not alias inputs', () => {
    const good = { ...channel('zdf', 'ZDF HD'), iconUrl: 'https://icons.example/zdf.svg?variant=hd' };
    const row = match(service('ZDF HD'), [good]);
    assert.equal(row.iconUrl, good.iconUrl);
    row.candidates[0].names.push('changed');
    assert.deepEqual(good.names, ['ZDF HD']);
    for (const value of ['javascript:alert(1)', 'data:image/png;base64,x', 'file:///secret', '/relative.svg',
        'https://user:secret@icons.example/a.svg', 'https://icons.example/a.svg#fragment', 'https://icons.example/a\n.svg']) {
        assert.equal(safeIconUrl(value), '');
        const unsafe = match(service('ZDF HD'), [{ ...good, iconUrl: value }]);
        assert.equal(Object.hasOwn(unsafe, 'iconUrl'), false);
        assert.equal(Object.hasOwn(unsafe.candidates[0], 'iconUrl'), false);
    }
});
