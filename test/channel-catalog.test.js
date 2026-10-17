'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseChannelPage, parseResponse } = require('../lib/loewe-client');
const {
    SCHEMA_VERSION, MAX_CATALOG_BYTES, MAX_CATALOG_ENTRIES, MAX_CATALOG_PAGES,
    serviceId, normalizeServiceRecord, migrateServiceRecord, mergeChannelPage, restoreChannelCatalog, createChannelDefinitions,
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

function slot(catalog, number, type = 'tv') {
    return catalog.services.find(service => service.id === `channels.${type}.${number}`);
}

function legacy(uuid, captions, extra = {}) {
    const positions = captions.map(caption => ({ caption, locator: `channel://${caption}:ch-${uuid}:sl-fixture` }));
    const record = { listView: 'fastscan-fixture', itemClass: 'video', mediaItemUuid: uuid,
        name: `Sender ${uuid}`, positions, available: true, ...extra };
    const identity = record.mediaItemUuid.trim() ? ['uuid', record.mediaItemUuid] : ['locator', record.positions[0].locator];
    const hash = createHash('sha256').update(JSON.stringify([record.listView, record.itemClass, ...identity])).digest('hex');
    return { ...record, id: `channels.${record.itemClass === 'video' ? 'tv' : 'radio'}.service_${hash}` };
}

function legacyCache(services) {
    const fresh = merge(null, page([item('fixture')]));
    return { ...fresh, schemaVersion: 1, services,
        lastQuery: { mediaType: '', startIndex: 0, totalResults: 1, returnedResults: 1, complete: true, reconciled: true, skipped: 0 } };
}

test('SL420 response creates one folder per programme position and separates TV from radio', () => {
    // Matches the reported XML shape with invented identities. The same TV
    // service is deliberately present at three different programme positions.
    const xml = '<Envelope><Body><GetChannelListResponse><ChannelListView>fastscan-fixture</ChannelListView>'
        + '<ChannelListName>ASTRA fixture</ChannelListName><ItemClass>undefined</ItemClass>'
        + '<ResultItemFragment startIndex="0" returnedResults="4" totalResults="4" hash="4294967295">'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="1" locator="channel://1:ch-first:sl-fixture" streamingUrl="http://tv.example/stream"/>'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="100" locator="channel://100:ch-first:sl-fixture"/>'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="1000" locator="channel://1000:ch-first:sl-fixture"/>'
        + '<ResultItemReference mediaItemUuid="fixture:radio" itemClass="audio" shortInfo="Bayern 1" caption="100" locator="channel://100:ch-radio:sl-fixture"/>'
        + '</ResultItemFragment></GetChannelListResponse></Body></Envelope>';
    const catalog = merge(null, parseChannelPage(parseResponse(xml)));
    assert.equal(SCHEMA_VERSION, 2);
    assert.equal(catalog.services.length, 4);
    assert.deepEqual(new Set(catalog.services.map(service => service.id)),
        new Set(['channels.tv.1', 'channels.tv.100', 'channels.tv.1000', 'channels.radio.100']));
    assert.equal(catalog.lastQuery.reconciled, true);
    assert.ok(catalog.services.every(service => service.positions.length === 1));
    assert.equal(slot(catalog, 1).locator, 'channel://1:ch-first:sl-fixture');
    assert.equal(slot(catalog, 100).locator, 'channel://100:ch-first:sl-fixture');
    assert.equal(slot(catalog, 100, 'radio').mediaItemUuid, 'fixture:radio');
    assert.equal(JSON.stringify(catalog).includes('tv.example'), false, 'Streaming URLs are not duplicated in the catalogue.');
});

test('renaming and result order leave slot IDs intact while moving a station changes its folder', () => {
    const initial = merge(null, page([item('one', '100'), item('one', '1'), item('two', '2')]));
    const renamed = merge(initial, page([item('two', '2'), item('one', '1', { name: 'Neuer Name' })]));
    assert.equal(slot(renamed, 1).id, slot(initial, 1).id);
    assert.equal(slot(renamed, 1).name, 'Neuer Name');
    assert.equal(slot(renamed, 100), undefined);
    const moved = merge(renamed, page([item('two', '91'), item('one', '7', { name: 'Neuer Name' })]));
    assert.equal(slot(moved, 1), undefined);
    assert.equal(slot(moved, 7).mediaItemUuid, 'one');
    assert.equal(slot(moved, 7).locator, 'channel://7:ch-one:sl-fixture');
    const reordered = merge(null, page([...initial.pages[0].items].reverse()));
    assert.deepEqual(reordered.services, initial.services);
});

test('reusing a programme position atomically replaces UUID, name, locator and aliases', () => {
    const initial = merge(null, page([item('old', '1'), item('kept', '2')]));
    const updated = merge(initial, page([item('replacement', '1', { name: 'Neuer Sender' })], { totalResults: 3 }));
    assert.equal(slot(updated, 1).name, 'Neuer Sender');
    assert.equal(slot(updated, 1).mediaItemUuid, 'replacement');
    assert.equal(slot(updated, 1).locator, 'channel://1:ch-replacement:sl-fixture');
    assert.deepEqual(slot(updated, 1).positions, [{ caption: '1', locator: 'channel://1:ch-replacement:sl-fixture' }]);
    assert.deepEqual(slot(updated, 2), slot(initial, 2));
    const blankName = merge(updated, page([item('replacement', '1', { name: '' })], { totalResults: 3 }));
    assert.equal(slot(blankName, 1).name, '', 'A removed label must not keep the old occupant name.');
});

test('the same number and UUID are independent in TV/radio, and a list switch replaces list metadata', () => {
    const catalog = merge(null, page([
        item('same-uuid', '100', { name: 'Gleicher Name' }),
        item('same-uuid', '100', { name: 'Gleicher Name', itemClass: 'audio' }),
    ]));
    assert.equal(catalog.services.length, 2);
    assert.equal(slot(catalog, 100).itemClass, 'video');
    assert.equal(slot(catalog, 100, 'radio').itemClass, 'audio');
    const otherList = merge(catalog, page([item('new-uuid', '100')], { view: 'favlist-other' }));
    assert.equal(otherList.services.length, 1);
    assert.equal(slot(otherList, 100).id, slot(catalog, 100).id, 'The folder identifies the slot in the current list.');
    assert.equal(slot(otherList, 100).listView, 'favlist-other');
    assert.equal(slot(otherList, 100).mediaItemUuid, 'new-uuid');
    assert.equal(otherList.pages.length, 1);
});

test('numeric folder IDs are canonical while the original caption and locator stay byte-for-byte intact', () => {
    const catalog = merge(null, page([item('one', '0002'), item('two', '10'), item('zero', '0')]));
    assert.equal(slot(catalog, 2).caption, '0002');
    assert.equal(slot(catalog, 2).locator, 'channel://0002:ch-one:sl-fixture');
    assert.equal(slot(catalog, 2).number, 2);
    assert.deepEqual(catalog.services.map(service => service.number), [0, 2, 10]);
    assert.equal(serviceId('list', 'video', '0002'), 'channels.tv.2');
    assert.equal(serviceId('list', 'audio', 100), 'channels.radio.100');
});

test('missing or nonnumeric captions can only fall back to a valid numeric channel locator', () => {
    const catalog = merge(null, page([
        item('empty-caption', '', { locator: 'channel://8:ch-eight:sl-fixture' }),
        item('named-caption', 'Sender neun', { locator: 'channel://9:ch-nine:sl-fixture' }),
        item('invalid-caption', 'unknown'), item('negative', '-1'), item('fractional', '1.5'),
        item('spaces', ' 3 '), item('unsafe', '9007199254740993'),
        item('missing-number', '', { locator: 'http://tv.example/stream' }),
    ]));
    assert.deepEqual(catalog.services.map(service => service.number), [8, 9]);
    assert.equal(slot(catalog, 8).caption, '', 'The fallback must not replace the original caption.');
    assert.equal(slot(catalog, 9).locator, 'channel://9:ch-nine:sl-fixture');
    assert.equal(catalog.lastQuery.skipped, 6);
    assert.equal(catalog.lastQuery.invalidPositions, 6);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.throws(() => serviceId('list', 'video', 'unknown'), { code: 'INVALID_RESPONSE' });
});

test('contradictory caption/locator numbers disable the old slot without choosing either number', () => {
    const initial = merge(null, page([item('old', '1'), item('kept', '2')]));
    const catalog = merge(initial, page([item('new', '1', { locator: 'channel://5:ch-new:sl-fixture' })]));
    assert.equal(catalog.lastQuery.skipped, 1);
    assert.equal(catalog.lastQuery.invalidPositions, 1);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(slot(catalog, 1).mediaItemUuid, 'old');
    assert.equal(slot(catalog, 1).available, false);
    assert.equal(slot(catalog, 5), undefined);
    assert.deepEqual(slot(catalog, 2), slot(initial, 2));
});

test('conflicting occupants of one slot are all rejected, independently of response order', () => {
    const initial = merge(null, page([item('old', '1'), item('kept', '2')]));
    const candidates = [item('first', '1'), item('second', '1'), item('radio', '1', { itemClass: 'audio' })];
    const catalog = merge(initial, page(candidates));
    const reversed = merge(initial, page([...candidates].reverse()));
    assert.deepEqual(catalog.services, reversed.services);
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.equal(catalog.lastQuery.conflictingPositions, 1);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(slot(catalog, 1).mediaItemUuid, 'old');
    assert.equal(slot(catalog, 1).available, false);
    assert.ok(slot(catalog, 2));
    assert.equal(slot(catalog, 1, 'radio').mediaItemUuid, 'radio');
    const fresh = merge(null, page(candidates));
    assert.equal(slot(fresh, 1), undefined);
});

test('leading-zero collisions and conflicting labels are diagnosed even for one service UUID', () => {
    const collision = merge(null, page([item('one', '001'), item('one', '1')]));
    assert.equal(collision.services.length, 0);
    assert.equal(collision.lastQuery.skipped, 2);
    assert.equal(collision.lastQuery.conflictingPositions, 1);
    const labels = merge(null, page([item('one', '1'), item('one', '1', { name: 'Different' })]));
    assert.equal(labels.services.length, 0);
    assert.equal(labels.lastQuery.conflictingPositions, 1);
});

test('exactly repeated references are deduplicated without becoming an ambiguous slot', () => {
    const catalog = merge(null, page([item('one'), item('one')]));
    assert.equal(catalog.services.length, 1);
    assert.equal(catalog.lastQuery.returnedResults, 2);
    assert.equal(catalog.lastQuery.skipped, 0);
    assert.equal(catalog.lastQuery.reconciled, true);
});

test('partial refreshes retain unobserved positions even when collected ranges add up to a full list', () => {
    const initial = merge(null, page([item('old', '1'), item('kept', '2')]));
    const first = merge(initial, page([item('new', '3')], { totalResults: 2 }));
    assert.equal(first.lastQuery.complete, false);
    assert.deepEqual(new Set(first.services.map(service => service.number)), new Set([1, 2, 3]));
    const second = merge(first, page([item('kept', '4')], { startIndex: 1, totalResults: 2 }));
    assert.equal(second.lastQuery.reconciled, false, 'The constant SL420 hash cannot prove that pages share a generation.');
    assert.deepEqual(new Set(second.services.map(service => service.number)), new Set([1, 2, 3, 4]));
    const full = merge(second, page([item('new', '3'), item('kept', '4')]));
    assert.equal(full.lastQuery.reconciled, true);
    assert.deepEqual(full.services.map(service => service.number), [3, 4]);
});

test('a complete TV-only refresh preserves radio and a complete radio-only refresh preserves TV', () => {
    const both = merge(null, page([item('tv-old'), item('radio-old', '100', { itemClass: 'audio' })]));
    const television = merge(both, page([item('tv-new', '2')]), 'video');
    assert.equal(slot(television, 1), undefined);
    assert.equal(slot(television, 100, 'radio').mediaItemUuid, 'radio-old');
    const radio = merge(television, page([item('radio-new', '5', { itemClass: 'audio' })]), 'audio');
    assert.equal(slot(radio, 2).mediaItemUuid, 'tv-new');
    assert.equal(slot(radio, 100, 'radio'), undefined);
    assert.equal(slot(radio, 5, 'radio').mediaItemUuid, 'radio-new');
});

test('an empty complete filtered response removes only that type and a combined response clears both', () => {
    const both = merge(null, page([item('tv'), item('radio', '1', { itemClass: 'audio' })]));
    const onlyRadio = merge(both, page([]), 'video');
    assert.equal(onlyRadio.services.length, 1);
    assert.equal(onlyRadio.services[0].itemClass, 'audio');
    const empty = merge(onlyRadio, page([]));
    assert.equal(empty.lastQuery.reconciled, true);
    assert.deepEqual(empty.services, []);
    assert.equal(empty.pages.length, 1);
});

test('unknown types and missing identities are skipped without guessing TV or removing other positions', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([
        item('unknown', '2', { itemClass: 'undefined' }),
        item('', '3', { locator: '' }), item('new', '4'),
    ]));
    assert.equal(catalog.lastQuery.complete, true);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.deepEqual(catalog.services.map(service => service.number), [1, 4]);
    assert.equal(catalog.pages[0].items.length, 3, 'Raw compact references remain available for diagnostics.');
});

test('a response that ignores the requested type filter cannot falsely retire existing channels', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([item('other-radio', '1', { itemClass: 'audio' })]), 'video');
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(catalog.lastQuery.skipped, 1);
    assert.equal(slot(catalog, 1).mediaItemUuid, 'old');
    assert.equal(slot(catalog, 1, 'radio'), undefined);
});

test('a missing UUID is usable only with a validated channel locator for its programme position', () => {
    const catalog = merge(null, page([
        item('', '1', { locator: 'channel://1:ch-a:sl-fixture', name: 'Gleicher Name' }),
        item('', '2', { locator: 'channel://2:ch-b:sl-fixture', name: 'Gleicher Name' }),
        item('', '3', { locator: 'http://example.invalid/stream', name: 'Gleicher Name' }),
    ]));
    assert.deepEqual(catalog.services.map(service => service.id), ['channels.tv.1', 'channels.tv.2']);
    assert.equal(catalog.lastQuery.skipped, 1);
    assert.ok(catalog.services.every(service => service.available));
});

test('known UUIDs with unusable locators remain visible but unavailable', () => {
    const catalog = merge(null, page([
        item('one', '1', { locator: '' }), item('two', '2', { locator: 'http://example.invalid/media' }),
        item('three', '3', { locator: 'channel://3:ch-three\n:sl-fixture' }),
        item('four', '4', { locator: 'channel://arbitrary-url' }),
    ]));
    assert.equal(catalog.services.length, 4);
    assert.ok(catalog.services.every(service => service.available === false));
    assert.equal(catalog.lastQuery.reconciled, true);
});

test('a valid and an unidentified reference at the same number cannot silently choose the valid one', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([item('new'), item('', '1', { locator: '' })]));
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.equal(catalog.lastQuery.conflictingPositions, 1);
    assert.equal(slot(catalog, 1).mediaItemUuid, 'old');
    assert.equal(slot(catalog, 1).available, false);
});

test('repeated and overlapping partial pages do not duplicate stored references', () => {
    const first = merge(null, page([item('one'), item('two', '2')], { totalResults: 4 }));
    const repeat = merge(first, page([item('one'), item('two', '2')], { totalResults: 4 }));
    assert.equal(repeat.pages.length, 1);
    const overlap = merge(repeat, page([item('two-new', '2'), item('three', '3')], { startIndex: 1, totalResults: 4 }));
    assert.deepEqual(overlap.pages.map(value => [value.startIndex, value.items.length]), [[0, 1], [1, 2]]);
    assert.equal(overlap.services.length, 3);
    assert.equal(slot(overlap, 2).mediaItemUuid, 'two-new');
    assert.equal(slot(overlap, 2).positions.length, 1);
});

test('changing totals or hashes starts a fresh page collection without interpreting absence as deletion', () => {
    const original = merge(null, page([item('one')], { totalResults: 4, hash: 'first' }));
    const changed = merge(original, page([item('two', '2')], { startIndex: 1, totalResults: 5, hash: 'second' }));
    assert.equal(changed.pages.length, 1);
    assert.ok(slot(changed, 1));
    assert.ok(slot(changed, 2));
    assert.equal(changed.lastQuery.reconciled, false);
});

test('v2 caches round-trip and only compact known properties are restored', () => {
    const catalog = merge(null, page([item('one', '1', { thumbnailUrl: 'http://tv.example/thumbnail' })]));
    const cache = structuredClone(catalog);
    cache.unexpected = 'discard';
    cache.services[0].unexpected = 'discard';
    cache.pages[0].items[0].thumbnailUrl = 'discard';
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(cache)), catalog);
    assert.equal(JSON.stringify(catalog).includes('thumbnailUrl'), false);
});

test('restoring slot records recomputes selection fields and rejects mismatched IDs or grouped v2 positions', () => {
    const [service] = merge(null, page([item('one')])).services;
    const altered = { ...service, number: 999, locator: 'http://example.invalid', caption: '999' };
    assert.deepEqual(normalizeServiceRecord(altered), service);
    assert.throws(() => normalizeServiceRecord({ ...service, id: 'channels.tv.attacker' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => normalizeServiceRecord({ ...service, id: 'channels.tv.2' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => normalizeServiceRecord({ ...service, id: 'channels.radio.1' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => normalizeServiceRecord({ ...service, positions: [
        { caption: '1', locator: 'channel://1:ch-one:sl-fixture' },
        { caption: '2', locator: 'channel://2:ch-one:sl-fixture' },
    ] }), { code: 'INVALID_RESPONSE' });
});

test('version-1 grouped records migrate to separate slots and preserve explicit unavailable status', () => {
    const old = legacy('first', ['1', '100', '1000'], { name: 'Das Erste HD', available: false });
    const migrated = migrateServiceRecord(old);
    assert.deepEqual(migrated.map(service => service.id), ['channels.tv.1', 'channels.tv.100', 'channels.tv.1000']);
    assert.ok(migrated.every(service => service.available === false));
    assert.ok(migrated.every(service => service.positions.length === 1 && service.name === 'Das Erste HD'));
    assert.equal(migrated[1].locator, 'channel://100:ch-first:sl-fixture');
    assert.equal(createChannelDefinitions(migrated[1]).values['channels.tv.100.available'], false);
    assert.deepEqual(migrateServiceRecord(migrated[0]), [migrated[0]], 'The runtime helper also accepts a v2 record.');
});

test('a full version-1 catalogue migrates with TV/radio numbering, then round-trips as version 2', () => {
    const cache = legacyCache([
        legacy('first', ['1', '100', '1000'], { available: false }),
        legacy('radio', ['100'], { itemClass: 'audio' }),
    ]);
    const oldJson = JSON.stringify(cache);
    const catalog = restoreChannelCatalog(oldJson);
    assert.equal(catalog.schemaVersion, 2);
    assert.equal(catalog.services.length, 4);
    assert.equal(slot(catalog, 100).available, false);
    assert.equal(slot(catalog, 100, 'radio').available, true);
    assert.equal(slot(catalog, 1000).mediaItemUuid, 'first');
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(catalog)), catalog);
    assert.equal(JSON.stringify(cache), oldJson, 'Migration leaves the original cache untouched.');
    const observed = merge(catalog, page([item('replacement', '100')], { totalResults: 2 }));
    assert.equal(slot(observed, 100).mediaItemUuid, 'replacement');
    assert.equal(slot(observed, 100).available, true);
    assert.equal(slot(observed, 1).available, false);
});

test('legacy migration validates hashes and refuses ambiguous or unnumbered old slots', () => {
    const old = legacy('one', ['1']);
    assert.throws(() => migrateServiceRecord({ ...old, id: old.id.replace(/.$/u, old.id.endsWith('a') ? 'b' : 'a') }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => migrateServiceRecord(legacy('one', ['unknown'])), { code: 'INVALID_RESPONSE' });
    assert.throws(() => migrateServiceRecord(legacy('one', ['001', '1'])), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog(legacyCache([old, legacy('other', ['1'])])), { code: 'INVALID_RESPONSE' });
    const fallback = migrateServiceRecord(legacy('', ['12'], { positions: [{ caption: 'Name', locator: 'channel://12:ch-first:sl-fixture' }] }));
    assert.equal(fallback[0].id, 'channels.tv.12');
});

test('archived slots remain unavailable after restore until an unambiguous live observation', () => {
    const catalog = merge(null, page([item('one')]));
    const archived = { ...catalog.services[0], available: false };
    assert.equal(normalizeServiceRecord(archived).available, false);
    const restored = restoreChannelCatalog({ ...catalog, services: [archived] });
    assert.equal(slot(restored, 1).available, false);
    const unrelated = merge(restored, page([item('two', '2')], { totalResults: 3 }));
    assert.equal(slot(unrelated, 1).available, false);
    const observed = merge(unrelated, page([item('one')], { totalResults: 3 }));
    assert.equal(slot(observed, 1).available, true);
    const unusable = normalizeServiceRecord({ ...archived, available: true, positions: [{ caption: '1', locator: '' }] });
    assert.equal(unusable.available, false, 'A cached true cannot validate a missing locator.');
});

test('untrusted caches reject malformed records, mixed lists, duplicate slots and unsupported versions', () => {
    const catalog = merge(null, page([item('one')]));
    assert.throws(() => restoreChannelCatalog('{invalid'), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, schemaVersion: 7 }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, pages: [null] }), { code: 'INVALID_RESPONSE' });
    const other = merge(null, page([item('one')], { view: 'other-view' })).services[0];
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [other] }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [...catalog.services, ...catalog.services] }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, lastQuery: { ...catalog.lastQuery, conflictingPositions: 1 } }), { code: 'INVALID_RESPONSE' });
});

test('merging never mutates a caller-owned page or previously saved catalogue', () => {
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

test('explicit byte, entry and page limits reject oversized data without truncation, including migration', () => {
    const catalog = merge(null, page([item('one')]));
    assert.throws(() => restoreChannelCatalog(' '.repeat(MAX_CATALOG_BYTES + 1)), { code: 'CATALOG_LIMIT' });
    assert.throws(() => merge(null, page(Array.from({ length: MAX_CATALOG_ENTRIES + 1 }, () => item('one')))), { code: 'CATALOG_LIMIT' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, pages: Array(MAX_CATALOG_PAGES + 1).fill(catalog.pages[0]) }), { code: 'CATALOG_LIMIT' });
    const old = legacy('one', ['1']);
    assert.throws(() => restoreChannelCatalog(legacyCache([{ ...old, positions: Array(MAX_CATALOG_ENTRIES + 1).fill(old.positions[0]) }])), { code: 'CATALOG_LIMIT' });
    const large = Array.from({ length: 250 }, (_, number) => item(`fixture-${number}`, String(number), { name: 'x'.repeat(1024) }));
    assert.throws(() => merge(null, page(large)), { code: 'CATALOG_LIMIT' });
    assert.equal(catalog.services.length, 1);
});

test('invalid page metadata is rejected before any catalogue can be replaced', () => {
    assert.throws(() => merge(null, page([item('one')], { returnedResults: 2 })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')], { startIndex: 1 })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')], { view: '' })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')]), 'guessed-type'), { code: 'VALIDATION' });
    assert.throws(() => mergeChannelPage(null, page([item('one')]), { now: NaN }), { code: 'INVALID_RESPONSE' });
    const unknownRange = merge(null, page([item('one')], { startIndex: null, totalResults: null }));
    assert.equal(unknownRange.lastQuery.reconciled, false);
});

test('folder name and description contain the station name and each slot owns its select button and EPG', () => {
    const catalog = merge(null, page([item('one', '001', { name: 'Änderung & HD' }), item('one', '100')]));
    const service = slot(catalog, 1);
    const { definitions, values } = createChannelDefinitions(service);
    const button = definitions.find(definition => definition.id === 'channels.tv.1.select');
    assert.equal(button.common.type, 'boolean');
    assert.equal(button.common.role, 'button');
    assert.equal(button.common.write, true);
    assert.equal(button.common.read, false);
    assert.equal(button.common.def, false);
    assert.equal(Object.hasOwn(values, button.id), false, 'Metadata refresh must not overwrite a pending button command.');
    assert.equal(definitions[0].id, 'channels.tv.1');
    assert.equal(definitions[0].common.name, 'Änderung & HD');
    assert.equal(definitions[0].common.desc, 'Änderung & HD');
    assert.equal(definitions[0].native.schemaVersion, 2);
    assert.equal(values['channels.tv.1.number'], 1);
    assert.deepEqual(JSON.parse(values['channels.tv.1.numbers']), ['001']);
    assert.deepEqual(JSON.parse(values['channels.tv.1.positions']), service.positions);
    assert.equal(values['channels.tv.1.epg.status'], 'notImplemented');
    assert.ok(definitions.some(definition => definition.id === 'channels.tv.1.epg' && definition.type === 'channel'));
    assert.equal(definitions.some(definition => definition.id.includes('events')), false);
    assert.ok(definitions.filter(definition => definition.type === 'state' && definition.id !== button.id)
        .every(definition => definition.common.read === true && definition.common.write === false));
    assert.equal(createChannelDefinitions(slot(catalog, 100)).values['channels.tv.100.locator'], 'channel://100:ch-one:sl-fixture');
});
