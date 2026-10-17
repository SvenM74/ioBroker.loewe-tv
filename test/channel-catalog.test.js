'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChannelPage, parseResponse } = require('../lib/loewe-client');
const {
    MAX_CATALOG_BYTES, MAX_CATALOG_ENTRIES, MAX_CATALOG_PAGES,
    serviceId, normalizeServiceRecord, mergeChannelPage, restoreChannelCatalog, createChannelDefinitions,
} = require('../lib/channel-catalog');

function item(uuid, caption = '1', extra = {}) {
    return { mediaItemUuid: uuid, name: `Sender ${uuid}`, caption,
        locator: `channel://${caption}:ch-${uuid}:sl-fixture`, itemClass: 'video', ...extra };
}

function page(items, extra = {}) {
    return { view: 'fastscan-fixture', name: 'ASTRA fixture', itemClass: 'undefined',
        startIndex: 0, totalResults: items.length, returnedResults: items.length,
        hash: '4294967295', items, ...extra };
}

function merge(previous, response, filter = '') {
    return mergeChannelPage(previous, response, { mediaType: filter, now: 1792267200000 });
}

function get(catalog, uuid, type = 'video') {
    return catalog.services.find(service => service.mediaItemUuid === uuid && service.itemClass === type);
}

test('SL420 response shape creates one service for repeated programme positions and separates TV from radio', () => {
    // Reproduces the reported structure with invented identities and an example
    // hostname. No client session, private address or device UUID is published.
    const xml = '<Envelope><Body><GetChannelListResponse><ChannelListView>fastscan-fixture</ChannelListView>'
        + '<ChannelListName>ASTRA fixture</ChannelListName><ItemClass>undefined</ItemClass>'
        + '<ResultItemFragment startIndex="0" returnedResults="4" totalResults="4" hash="4294967295">'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="1" locator="channel://1:ch-first:sl-fixture" streamingUrl="http://tv.example/stream"/>'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="100" locator="channel://100:ch-first:sl-fixture"/>'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="1000" locator="channel://1000:ch-first:sl-fixture"/>'
        + '<ResultItemReference mediaItemUuid="fixture:radio" itemClass="audio" shortInfo="Bayern 1" caption="100" locator="channel://100:ch-radio:sl-fixture"/>'
        + '</ResultItemFragment></GetChannelListResponse></Body></Envelope>';
    const catalog = merge(null, parseChannelPage(parseResponse(xml)));
    assert.equal(catalog.services.length, 2);
    assert.equal(catalog.lastQuery.reconciled, true);
    const television = get(catalog, 'fixture:first');
    const radio = get(catalog, 'fixture:radio', 'audio');
    assert.match(television.id, /^channels\.tv\.service_[a-f0-9]{64}$/u);
    assert.match(radio.id, /^channels\.radio\.service_[a-f0-9]{64}$/u);
    assert.deepEqual(television.positions.map(position => position.caption), ['1', '100', '1000']);
    assert.equal(television.locator, 'channel://1:ch-first:sl-fixture');
    assert.equal(radio.number, 100);
    assert.equal(JSON.stringify(catalog).includes('tv.example'), false, 'Streaming URLs are not duplicated in the catalogue.');
});

test('service IDs survive renaming, reordered results and programme renumbering', () => {
    const initial = merge(null, page([item('one', '100'), item('one', '1'), item('two', '2')]));
    const renamed = merge(initial, page([item('two', '91'), item('one', '7', { name: 'Neuer Name' })]));
    assert.equal(get(initial, 'one').id, get(renamed, 'one').id);
    assert.equal(get(renamed, 'one').name, 'Neuer Name');
    assert.equal(get(renamed, 'one').number, 7);
    assert.deepEqual(get(renamed, 'one').positions, [{ caption: '7', locator: 'channel://7:ch-one:sl-fixture' }]);
    const reordered = merge(null, page([...initial.pages[0].items].reverse()));
    assert.deepEqual(reordered.services, initial.services);
});

test('equal names, equal programme numbers and even equal UUIDs never mix TV, radio or different lists', () => {
    const catalog = merge(null, page([
        item('same-uuid', '100', { name: 'Gleicher Name' }),
        item('same-uuid', '100', { name: 'Gleicher Name', itemClass: 'audio' }),
        item('other-uuid', '100', { name: 'Gleicher Name' }),
    ]));
    assert.equal(catalog.services.length, 3);
    assert.equal(new Set(catalog.services.map(service => service.id)).size, 3);
    const otherList = merge(catalog, page([item('same-uuid', '100')], { view: 'favlist-other' }));
    assert.equal(otherList.services.length, 1);
    assert.notEqual(get(otherList, 'same-uuid').id, get(catalog, 'same-uuid').id);
    assert.equal(otherList.pages.length, 1);
});

test('the smallest usable numeric position is selected and original captions/locators remain unchanged', () => {
    const catalog = merge(null, page([
        item('one', '100'), item('one', '10'), item('one', '0002'), item('one', '1', { locator: '' }),
        item('one', 'unknown'), item('one', '9007199254740993'), item('one', '0002'),
    ]));
    const service = get(catalog, 'one');
    assert.equal(service.number, 2);
    assert.equal(service.caption, '0002');
    assert.equal(service.locator, 'channel://0002:ch-one:sl-fixture');
    assert.equal(service.positions.length, 6);
    assert.ok(service.positions.some(position => position.caption === '9007199254740993'));
});

test('partial refreshes retain previously known channels and aliases, even when their ranges add up to a full list', () => {
    const initial = merge(null, page([item('old', '1'), item('kept', '2')]));
    const first = merge(initial, page([item('new', '3')], { totalResults: 2 }));
    assert.equal(first.lastQuery.complete, false);
    assert.deepEqual(new Set(first.services.map(service => service.mediaItemUuid)), new Set(['old', 'kept', 'new']));
    const second = merge(first, page([item('kept', '4')], { startIndex: 1, totalResults: 2 }));
    assert.equal(second.lastQuery.reconciled, false, 'A constant SL420 hash cannot prove that pages share a generation.');
    assert.ok(get(second, 'old'));
    assert.deepEqual(get(second, 'kept').positions.map(position => position.caption), ['2', '4']);
    const full = merge(second, page([item('new', '3'), item('kept', '4')]));
    assert.equal(full.lastQuery.reconciled, true);
    assert.equal(get(full, 'old'), undefined);
    assert.deepEqual(get(full, 'kept').positions.map(position => position.caption), ['4']);
});

test('a complete TV-only refresh preserves radio and a complete radio-only refresh preserves TV', () => {
    const both = merge(null, page([item('tv-old'), item('radio-old', '100', { itemClass: 'audio' })]));
    const television = merge(both, page([item('tv-new', '2')]), 'video');
    assert.equal(get(television, 'tv-old'), undefined);
    assert.ok(get(television, 'radio-old', 'audio'));
    const radio = merge(television, page([item('radio-new', '5', { itemClass: 'audio' })]), 'audio');
    assert.ok(get(radio, 'tv-new'));
    assert.equal(get(radio, 'radio-old', 'audio'), undefined);
    assert.ok(get(radio, 'radio-new', 'audio'));
});

test('an empty complete filtered response removes only that type and an empty combined response clears both', () => {
    const both = merge(null, page([item('tv'), item('radio', '1', { itemClass: 'audio' })]));
    const onlyRadio = merge(both, page([]), 'video');
    assert.equal(onlyRadio.services.length, 1);
    assert.equal(onlyRadio.services[0].itemClass, 'audio');
    const empty = merge(onlyRadio, page([]));
    assert.equal(empty.lastQuery.reconciled, true);
    assert.deepEqual(empty.services, []);
    assert.equal(empty.pages.length, 1);
});

test('unknown types and missing identities are skipped without guessing TV or removing known channels', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([
        item('unknown', '2', { itemClass: 'undefined' }),
        item('', '3', { locator: '' }), item('new', '4'),
    ]));
    assert.equal(catalog.lastQuery.complete, true);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.equal(catalog.services.length, 2);
    assert.ok(get(catalog, 'old'));
    assert.ok(get(catalog, 'new'));
    assert.equal(catalog.pages[0].items.length, 3, 'The page still records every received reference for diagnostics.');
});

test('a response that ignores a requested type filter cannot falsely retire existing channels', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([item('other-radio', '1', { itemClass: 'audio' })]), 'video');
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(catalog.lastQuery.skipped, 1);
    assert.ok(get(catalog, 'old'));
    assert.equal(get(catalog, 'other-radio', 'audio'), undefined);
});

test('a missing UUID falls back to the exact channel locator, never the name or programme number', () => {
    const catalog = merge(null, page([
        item('', '1', { locator: 'channel://1:ch-a:sl-fixture', name: 'Gleicher Name' }),
        item('', '1', { locator: 'channel://1:ch-b:sl-fixture', name: 'Gleicher Name' }),
        item('', '1', { locator: 'http://example.invalid/stream', name: 'Gleicher Name' }),
    ]));
    assert.equal(catalog.services.length, 2);
    assert.equal(catalog.lastQuery.skipped, 1);
    assert.notEqual(catalog.services[0].id, catalog.services[1].id);
    assert.notEqual(serviceId('fastscan-fixture', 'video', 'channel://1:ch-a:sl-fixture'),
        serviceId('fastscan-fixture', 'video', '', 'channel://1:ch-a:sl-fixture'), 'UUID and locator namespaces must be distinct.');
});

test('known services with no usable channel locator remain visible but unavailable', () => {
    const catalog = merge(null, page([
        item('one', '1', { locator: '' }),
        item('two', '2', { locator: 'http://example.invalid/media' }),
        item('three', '3', { locator: 'channel://3:ch-three\n:sl-fixture' }),
    ]));
    assert.equal(catalog.services.length, 3);
    assert.ok(catalog.services.every(service => service.available === false));
    assert.equal(catalog.lastQuery.reconciled, true);
});

test('repeated and overlapping partial pages do not duplicate persisted reference positions', () => {
    const first = merge(null, page([item('one'), item('two', '2')], { totalResults: 4 }));
    const repeat = merge(first, page([item('one'), item('two', '2')], { totalResults: 4 }));
    assert.equal(repeat.pages.length, 1);
    const overlap = merge(repeat, page([item('two', '2'), item('three', '3')], { startIndex: 1, totalResults: 4 }));
    assert.deepEqual(overlap.pages.map(value => [value.startIndex, value.items.length]), [[0, 1], [1, 2]]);
    assert.equal(overlap.services.length, 3);
    assert.equal(get(overlap, 'two').positions.length, 1);
});

test('changing totals or hashes starts a fresh page collection without treating absence as deletion', () => {
    const original = merge(null, page([item('one')], { totalResults: 4, hash: 'first' }));
    const changed = merge(original, page([item('two', '2')], { startIndex: 1, totalResults: 5, hash: 'second' }));
    assert.equal(changed.pages.length, 1);
    assert.ok(get(changed, 'one'));
    assert.ok(get(changed, 'two'));
    assert.equal(changed.lastQuery.reconciled, false);
});

test('catalogue caches round-trip and only compact, known properties are restored', () => {
    const catalog = merge(null, page([item('one', '1', { thumbnailUrl: 'http://tv.example/thumbnail' })]));
    const cache = structuredClone(catalog);
    cache.unexpected = 'discard';
    cache.services[0].unexpected = 'discard';
    cache.pages[0].items[0].thumbnailUrl = 'discard';
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(cache)), catalog);
    assert.equal(JSON.stringify(catalog).includes('thumbnailUrl'), false);
});

test('restoring service records recomputes derived selection fields and rejects mismatched IDs', () => {
    const [service] = merge(null, page([item('one')])).services;
    const altered = { ...service, number: 999, locator: 'http://example.invalid', caption: '999' };
    assert.deepEqual(normalizeServiceRecord(altered), service);
    assert.throws(() => normalizeServiceRecord({ ...service, id: 'channels.tv.attacker' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => normalizeServiceRecord({ ...service, listView: 'other-list' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => normalizeServiceRecord({ ...service, mediaItemUuid: '', positions: [
        { caption: '1', locator: 'channel://1:ch-one:sl-fixture' },
        { caption: '2', locator: 'channel://2:ch-other:sl-fixture' },
    ] }), { code: 'INVALID_RESPONSE' });
});

test('archived services remain unavailable after restore and definition creation until a new live observation', () => {
    const catalog = merge(null, page([item('one')]));
    const archived = { ...catalog.services[0], available: false };
    assert.equal(normalizeServiceRecord(archived).available, false);
    assert.equal(createChannelDefinitions(archived).values[`${archived.id}.available`], false);
    const restored = restoreChannelCatalog({ ...catalog, services: [archived] });
    assert.equal(restored.services[0].available, false);
    const observed = merge(restored, page([item('one')], { totalResults: 2 }));
    assert.equal(observed.services[0].available, true);
    const unusable = normalizeServiceRecord({ ...archived, available: true, positions: [{ caption: '1', locator: '' }] });
    assert.equal(unusable.available, false, 'A cached true must never make a missing locator usable.');
});

test('untrusted caches reject malformed records, mixed lists, duplicate identities and unsupported versions', () => {
    const catalog = merge(null, page([item('one')]));
    assert.throws(() => restoreChannelCatalog('{invalid'), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, schemaVersion: 7 }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, pages: [null] }), { code: 'INVALID_RESPONSE' });
    const other = merge(null, page([item('one')], { view: 'other-view' })).services[0];
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [other] }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [...catalog.services, ...catalog.services] }), { code: 'INVALID_RESPONSE' });
});

test('merging never mutates a caller-owned page or previously persisted catalogue', () => {
    const old = merge(null, page([item('one')]));
    const nextPage = page([item('two', '2')], { startIndex: 1, totalResults: 3 });
    const oldJson = JSON.stringify(old);
    const pageJson = JSON.stringify(nextPage);
    const next = merge(old, nextPage);
    next.services[0].positions[0].caption = 'caller mutation';
    next.pages[0].items[0].name = 'caller mutation';
    assert.equal(JSON.stringify(old), oldJson);
    assert.equal(JSON.stringify(nextPage), pageJson);
});

test('explicit cache, entry and page limits reject oversized data without truncating it', () => {
    const catalog = merge(null, page([item('one')]));
    assert.throws(() => restoreChannelCatalog(' '.repeat(MAX_CATALOG_BYTES + 1)), { code: 'CATALOG_LIMIT' });
    assert.throws(() => merge(null, page(Array.from({ length: MAX_CATALOG_ENTRIES + 1 }, () => item('one')))), { code: 'CATALOG_LIMIT' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, pages: Array(MAX_CATALOG_PAGES + 1).fill(catalog.pages[0]) }), { code: 'CATALOG_LIMIT' });
    const large = Array.from({ length: 250 }, (_, number) => item(`fixture-${number}`, String(number), { name: 'x'.repeat(1024) }));
    assert.throws(() => merge(null, page(large)), { code: 'CATALOG_LIMIT' });
    assert.equal(catalog.services.length, 1);
});

test('invalid page metadata is rejected before any catalogue state can be replaced', () => {
    assert.throws(() => merge(null, page([item('one')], { returnedResults: 2 })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')], { startIndex: 1 })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')], { view: '' })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')]), 'guessed-type'), { code: 'VALIDATION' });
    assert.throws(() => mergeChannelPage(null, page([item('one')]), { now: NaN }), { code: 'INVALID_RESPONSE' });
    const unknownRange = merge(null, page([item('one')], { startIndex: null, totalResults: null }));
    assert.equal(unknownRange.lastQuery.reconciled, false);
});

test('dynamic definitions expose a momentary select button, all positions and an honest per-channel EPG placeholder', () => {
    const [service] = merge(null, page([item('one', '001', { name: 'Änderung & HD' }), item('one', '100')])).services;
    const { definitions, values } = createChannelDefinitions(service);
    const button = definitions.find(definition => definition.id === `${service.id}.select`);
    assert.equal(button.common.type, 'boolean');
    assert.equal(button.common.role, 'button');
    assert.equal(button.common.write, true);
    assert.equal(button.common.read, false);
    assert.equal(button.common.def, false);
    assert.equal(Object.hasOwn(values, button.id), false, 'A metadata refresh must not overwrite a running button command.');
    assert.equal(definitions[0].common.name, '001 · Änderung & HD');
    assert.equal(values[`${service.id}.number`], 1);
    assert.deepEqual(JSON.parse(values[`${service.id}.numbers`]), ['001', '100']);
    assert.deepEqual(JSON.parse(values[`${service.id}.positions`]), service.positions);
    assert.equal(values[`${service.id}.epg.status`], 'notImplemented');
    assert.ok(definitions.some(definition => definition.id === `${service.id}.epg` && definition.type === 'channel'));
    assert.equal(definitions.some(definition => definition.id.includes('events')), false);
    assert.ok(definitions.filter(definition => definition.type === 'state' && definition.id !== button.id)
        .every(definition => definition.common.read === true && definition.common.write === false));
});
