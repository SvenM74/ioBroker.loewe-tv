'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMappingRows, mappingStatus } = require('../lib/epg-config');
const { normalizeManualMappings, resolveMappings } = require('../lib/epg-mapping');
const { normalizeConfig } = require('../lib/adapter-runtime');

// Synthetic station names/IDs, with separate HD/SD/regional variants to ensure
// that populating an editable table cannot weaken conservative source matching.
const services = [
    { id: 'channels.tv.Fixture_HD', name: 'Fixture HD', number: 1, itemClass: 'video' },
    { id: 'channels.tv.Fixture_SD', name: 'Fixture SD', number: 2, itemClass: 'video' },
    { id: 'channels.tv.Regional_North', name: 'Regional North', number: 3, itemClass: 'video' },
];
const catalogue = [
    { id: 'fixture-hd', names: ['Fixture HD'] },
    { id: 'fixture-sd', names: ['Fixture SD'] },
    { id: 'regional-south', names: ['Regional South'] },
];

test('TV catalogue supplies every row before an XMLTV URL or catalogue exists', () => {
    const result = buildMappingRows(services, []);
    assert.deepEqual(result.rows.map(row => [row.channel, row.tvChannel, row.mode, row.xmltvId]), [
        ['channels.tv.Fixture_HD', '1. Fixture HD', 'auto', ''],
        ['channels.tv.Fixture_SD', '2. Fixture SD', 'auto', ''],
        ['channels.tv.Regional_North', '3. Regional North', 'auto', ''],
    ]);
    assert.ok(result.rows.every(row => row.assignment.includes('Quelle noch nicht geladen')));
    assert.deepEqual(normalizeManualMappings(result.rows), {});
    assert.match(mappingStatus(result, false, 0), /3 TV-Sender.*Quelle.*noch nicht geladen/u);
});

test('saving a fully populated automatic table preserves automatic matching and variant boundaries', () => {
    const result = buildMappingRows(services, catalogue, [], { catalogueLoaded: true, revision: 7 });
    const active = normalizeConfig({ host: 'synthetic-tv.invalid', channelListView: 'synthetic-list',
        epgSource: 'xmltv', epgXmltvUrl: 'https://guide.invalid/synthetic.xml', epgXmltvMappings: result.rows });
    assert.deepEqual(active.epgXmltvMappings, {});
    assert.deepEqual(resolveMappings(services, catalogue, active.epgXmltvMappings).map(row => row.status),
        ['automatic', 'automatic', 'unmatched']);
    assert.match(result.rows[0].assignment, /Automatisch: Fixture HD \[fixture-hd\]/u);
    assert.match(result.rows[2].assignment, /Kein eindeutiger Treffer.*Regional South/u);
    assert.equal(result.rows[2].xmltvId, '');
    assert.equal(result.assigned, 2);
    assert.ok(result.rows.every(row => row.revision === 7));
});

test('both historic object and two-column array formats migrate without losing corrections or disabled services', () => {
    const legacy = { 'channels.tv.Fixture_HD': 'custom-hd', 'channels.tv.Fixture_SD': '',
        'channels.tv.Previously_Stored': 'keep-this-id' };
    for (const input of [legacy, Object.entries(legacy).map(([channel, xmltvId]) => ({ channel, xmltvId }))]) {
        const before = structuredClone(input);
        const result = buildMappingRows(services, [], input);
        assert.deepEqual(result.rows.map(row => row.mode), ['manual', 'disabled', 'auto', 'manual']);
        assert.deepEqual(normalizeManualMappings(result.rows), legacy);
        assert.equal(result.retained, 1);
        assert.match(result.rows.at(-1).assignment, /Nicht in der gespeicherten TV-Senderliste/u);
        assert.deepEqual(input, before);
        result.rows[0].xmltvId = 'changed-in-form';
        assert.deepEqual(input, before, 'The returned draft has no writable aliases to older configuration.');
    }
});

test('manual, disabled and automatic mode changes round-trip while inactive remembered IDs remain harmless', () => {
    const result = buildMappingRows(services, catalogue, [], { catalogueLoaded: true });
    result.rows[0].mode = 'manual';
    result.rows[0].xmltvId = 'explicit-user-id';
    result.rows[1].mode = 'disabled';
    result.rows[1].xmltvId = 'remembered-but-disabled';
    result.rows[2].xmltvId = 'remembered-but-automatic';
    const effective = { 'channels.tv.Fixture_HD': 'explicit-user-id', 'channels.tv.Fixture_SD': '' };
    assert.deepEqual(normalizeManualMappings(result.rows), effective);
    const reloaded = buildMappingRows(services, [], result.rows);
    assert.deepEqual(normalizeManualMappings(reloaded.rows), effective);
    assert.equal(reloaded.rows[1].xmltvId, 'remembered-but-disabled');
    assert.equal(reloaded.rows[2].mode, 'auto');
    reloaded.rows[0].mode = 'auto';
    assert.deepEqual(normalizeManualMappings(reloaded.rows), { 'channels.tv.Fixture_SD': '' });
});

test('an unfinished manual row is clearly unassigned and never quietly selects a similarly named channel', () => {
    const rows = buildMappingRows(services, []).rows;
    rows[0].mode = 'manual';
    const result = buildMappingRows(services, catalogue, rows, { catalogueLoaded: true });
    assert.match(result.rows[0].assignment, /bitte einen XMLTV-Sender auswählen/u);
    assert.equal(normalizeManualMappings(result.rows)[services[0].id], '');
    assert.equal(result.assigned, 1);
});

test('saved partial rows can reload and remain editable without losing source choices or absent TV corrections', () => {
    const input = [
        {},
        { channel: services[0].id, mode: 'auto' },
        { channel: services[1].id, mode: 'manual', xmltvId: null },
        { channel: services[2].id, mode: 'disabled' },
        { channel: 'channels.tv.Temporarily_Absent', xmltvId: 'keep-exact-id' },
        { channel: 'channels.tv.Unfinished_Absent' },
    ];
    const before = structuredClone(input);
    const result = buildMappingRows(services, catalogue, input, { catalogueLoaded: true, revision: 8 });
    assert.deepEqual(result.rows.map(row => [row.channel, row.mode, row.xmltvId]), [
        [services[0].id, 'auto', ''], [services[1].id, 'manual', ''], [services[2].id, 'disabled', ''],
        ['channels.tv.Temporarily_Absent', 'manual', 'keep-exact-id'],
        ['channels.tv.Unfinished_Absent', 'manual', ''],
    ]);
    assert.equal(result.assigned, 1, 'The unselected manual SD row must not fall back to its exact automatic match.');
    assert.equal(result.retained, 2);
    assert.match(result.rows[1].assignment, /bitte einen XMLTV-Sender auswählen/u);
    assert.match(result.rows[2].assignment, /deaktiviert/u);
    assert.ok(result.rows.every(row => Object.hasOwn(row, 'xmltvId') && row.revision === 8));
    assert.deepEqual(normalizeManualMappings(result.rows), {
        [services[1].id]: '', [services[2].id]: '',
        'channels.tv.Temporarily_Absent': 'keep-exact-id', 'channels.tv.Unfinished_Absent': '',
    });
    assert.deepEqual(input, before);
    const reloaded = buildMappingRows(services, catalogue, result.rows, { catalogueLoaded: true, revision: 8 });
    assert.deepEqual(reloaded, result);
});

test('a legacy unfinished manual row becomes an editable request for a source selection', () => {
    for (const selection of [{}, { xmltvId: undefined }, { xmltvId: null }]) {
        const result = buildMappingRows(services, catalogue, [{ channel: services[0].id, ...selection }],
            { catalogueLoaded: true });
        assert.equal(result.rows[0].mode, 'manual');
        assert.equal(result.rows[0].xmltvId, '');
        assert.match(result.rows[0].assignment, /bitte einen XMLTV-Sender auswählen/u);
        assert.equal(result.assigned, 1);
    }
    const oldDisabled = buildMappingRows(services, catalogue, [{ channel: services[0].id, xmltvId: '' }],
        { catalogueLoaded: true });
    assert.equal(oldDisabled.rows[0].mode, 'disabled', 'An explicitly disabled legacy selection remains disabled.');
});

test('empty/restored TV lists retain earlier corrections and describe the required initial TV import', () => {
    const saved = { 'channels.tv.Stored': 'stored-source', 'channels.tv.Disabled': '' };
    const empty = buildMappingRows([], [], saved);
    assert.equal(empty.total, 0);
    assert.equal(empty.retained, 2);
    assert.deepEqual(normalizeManualMappings(empty.rows), saved);
    assert.match(mappingStatus(empty, false, 0), /noch keine TV-Sender gespeichert.*einmal vom Fernseher einlesen/u);
    const restored = buildMappingRows([{ id: 'channels.tv.Stored', name: 'Restored', number: 1, itemClass: 'video' }], [], empty.rows);
    assert.equal(restored.total, 1);
    assert.equal(restored.retained, 1);
    assert.equal(restored.rows[0].tvChannel, '1. Restored');
    assert.deepEqual(normalizeManualMappings(restored.rows), saved);
});

test('a source change clears automatic evidence while retaining explicit manual IDs for review', () => {
    const result = buildMappingRows(services, catalogue, [{ channel: services[0].id, xmltvId: 'fixture-hd' }],
        { catalogueLoaded: true, revision: 8 });
    const unloaded = buildMappingRows(services, [], result.rows, { revision: 9 });
    assert.match(unloaded.rows[0].assignment, /fixture-hd.*Quelle noch nicht geladen/u);
    assert.match(unloaded.rows[1].assignment, /Quelle noch nicht geladen/u);
    const changed = buildMappingRows(services, [{ id: 'other-id', names: ['Fixture HD'] }], unloaded.rows,
        { catalogueLoaded: true, revision: 10 });
    assert.match(changed.rows[0].assignment, /XMLTV-ID fehlt.*fixture-hd/u);
    assert.equal(changed.assigned, 0, 'An explicit manual choice must not be silently replaced by an automatic match.');
});

test('full table validation retains strict IDs, allowed fields, duplicate checks and effective mapping limits', () => {
    const valid = buildMappingRows(services, []).rows[0];
    const invalid = [
        [{ ...valid, channel: 'channels.radio.Wrong' }],
        [{ ...valid, mode: 'anything' }], [{ ...valid, revision: -1 }],
        [{ ...valid, revision: 0.5 }], [{ ...valid, revision: Number.MAX_SAFE_INTEGER + 1 }],
        [{ ...valid, xmltvId: ' bad-id' }], [{ ...valid, tvChannel: '\ud800' }],
        [{ ...valid, assignment: 'bad\u0000label' }], [{ ...valid, tvChannel: 'x'.repeat(513) }],
        [{ ...valid, assignment: 'x'.repeat(1201) }], [{ ...valid, locator: 'channel://foreign-target' }],
        [valid, { ...valid, mode: 'manual', xmltvId: 'duplicate' }],
        [{ channel: valid.channel, xmltvId: '', tvChannel: 'No explicit mode' }],
        Array.from({ length: 2001 }, (_, i) => ({ ...valid, channel: `channels.tv.S${i}`, mode: 'disabled' })),
        Array.from({ length: 4001 }, (_, i) => ({ ...valid, channel: `channels.tv.S${i}` })),
    ];
    for (const rows of invalid) assert.throws(() => normalizeManualMappings(rows), { code: 'XMLTV_MAPPING' });
    const maxServices = Array.from({ length: 2000 }, (_, i) => ({ id: `channels.tv.Current${i}`,
        name: `Current ${i}`, number: i + 1, itemClass: 'video' }));
    const corrections = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`channels.tv.Previous${i}`, `id-${i}`]));
    const full = buildMappingRows(maxServices, [], corrections);
    assert.equal(full.rows.length, 4000, 'A full current catalogue and earlier corrections can coexist.');
    assert.deepEqual(normalizeManualMappings(full.rows), corrections);
});

test('display metadata cannot change effective XMLTV or TV IDs and remains valid when Unicode labels are shortened', () => {
    const rows = buildMappingRows(services, catalogue, [], { catalogueLoaded: true }).rows;
    rows[0].tvChannel = '999. A different television';
    rows[0].assignment = 'Manually assigned: misleading-label';
    assert.deepEqual(normalizeManualMappings(rows), {});
    const long = buildMappingRows([{ ...services[0], name: 'x'.repeat(508) + '🟦' }], []);
    assert.equal(long.rows[0].tvChannel.length <= 512, true);
    assert.equal(long.rows[0].tvChannel.isWellFormed(), true);
    assert.deepEqual(normalizeManualMappings(long.rows), {});
});
