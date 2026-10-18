'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseChannelPage, parseResponse } = require('../lib/loewe-client');
const {
    SCHEMA_VERSION, MAX_CATALOG_BYTES, MAX_CATALOG_ENTRIES, MAX_CATALOG_PAGES,
    serviceId, serviceIdentity, nameSegment, assignServiceIds, mergeServiceRecords,
    normalizeServiceRecord, migrateServiceRecord, mergeChannelPage, restoreChannelCatalog, createChannelDefinitions,
} = require('../lib/channel-catalog');

function item(uuid, caption = '1', extra = {}) {
    return { mediaItemUuid: uuid, name: 'Sender ' + uuid, caption,
        locator: 'channel://' + caption + ':ch-' + uuid + ':sl-fixture', itemClass: 'video', ...extra };
}

function page(items, extra = {}) {
    return { view: 'fastscan-fixture', name: 'ASTRA fixture', itemClass: 'undefined',
        startIndex: 0, totalResults: items.length, returnedResults: items.length,
        hash: '4294967295', items, ...extra };
}

function merge(previous, response, filter = '') {
    return mergeChannelPage(previous, response, { mediaType: filter, now: 1792267200000 });
}

function service(catalog, uuid, type = 'video') {
    return catalog.services.find(entry => entry.mediaItemUuid === uuid && entry.itemClass === type);
}

function legacy(uuid, captions, extra = {}) {
    const positions = captions.map(caption => ({ caption, locator: 'channel://' + caption + ':ch-' + uuid + ':sl-fixture' }));
    const record = { listView: 'fastscan-fixture', itemClass: 'video', mediaItemUuid: uuid,
        name: 'Sender ' + uuid, positions, available: true, ...extra };
    const identity = record.mediaItemUuid.trim() ? ['uuid', record.mediaItemUuid] : ['locator', record.positions[0].locator];
    const hash = createHash('sha256').update(JSON.stringify([record.listView, record.itemClass, ...identity])).digest('hex');
    return { ...record, id: 'channels.' + (record.itemClass === 'video' ? 'tv' : 'radio') + '.service_' + hash };
}

function numeric(uuid, caption = '1', extra = {}) {
    const raw = item(uuid, caption, extra);
    return { ...raw, listView: 'fastscan-fixture',
        id: 'channels.' + (raw.itemClass === 'video' ? 'tv' : 'radio') + '.' + Number(caption),
        positions: [{ caption: raw.caption, locator: raw.locator }], available: true };
}

function cache(version, services) {
    const fresh = merge(null, page([item('fixture')]));
    return { ...fresh, schemaVersion: version, services,
        lastQuery: { mediaType: '', startIndex: 0, totalResults: 1, returnedResults: 1,
            complete: true, reconciled: true, skipped: 0 } };
}

test('SL420 mixed response groups TV positions and excludes radio without changing raw pagination counts', () => {
    const xml = '<Envelope><Body><GetChannelListResponse><ChannelListView>fastscan-fixture</ChannelListView>'
        + '<ChannelListName>ASTRA fixture</ChannelListName><ItemClass>undefined</ItemClass>'
        + '<ResultItemFragment startIndex="0" returnedResults="4" totalResults="4" hash="4294967295">'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="1" locator="channel://1:ch-first:sl-fixture" streamingUrl="http://tv.example/stream"/>'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="100" locator="channel://100:ch-first:sl-fixture"/>'
        + '<ResultItemReference mediaItemUuid="fixture:first" itemClass="video" shortInfo="Das Erste HD" caption="1000" locator="channel://1000:ch-first:sl-fixture"/>'
        + '<ResultItemReference mediaItemUuid="fixture:radio" itemClass="audio" shortInfo="Bayern 1" caption="100" locator="channel://100:ch-radio:sl-fixture"/>'
        + '</ResultItemFragment></GetChannelListResponse></Body></Envelope>';
    const catalog = merge(null, parseChannelPage(parseResponse(xml)));
    assert.equal(SCHEMA_VERSION, 3);
    assert.equal(catalog.services.length, 1);
    assert.deepEqual(new Set(catalog.services.map(entry => entry.id)),
        new Set(['channels.tv.Das_Erste_HD']));
    const first = service(catalog, 'fixture:first');
    assert.deepEqual(first.positions.map(position => position.caption), ['1', '100', '1000']);
    assert.equal(first.locator, 'channel://1:ch-first:sl-fixture');
    assert.equal(service(catalog, 'fixture:radio', 'audio'), undefined);
    assert.equal(catalog.lastQuery.returnedResults, 4);
    assert.equal(catalog.lastQuery.ignoredAudioResults, 1);
    assert.equal(catalog.lastQuery.skipped, 0);
    assert.equal(catalog.pages[0].items.length, 3);
    assert.equal(catalog.pages[0].returnedResults, 4);
    assert.deepEqual(catalog.pages[0].sourceIndexes, [0, 1, 2]);
    assert.equal(catalog.lastQuery.reconciled, true);
    assert.equal(JSON.stringify(catalog).includes('tv.example'), false);
    assert.equal(JSON.stringify(catalog).includes('fixture:radio'), false);
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(catalog)), catalog);
});

test('sorting a list changes positions and locators while IDs remain stable regardless of response order', () => {
    const initial = merge(null, page([item('one', '100'), item('one', '1'), item('two', '2')]));
    const moved = merge(initial, page([item('two', '91'), item('one', '7')]));
    assert.equal(service(moved, 'one').id, 'channels.tv.Sender_one');
    assert.equal(service(moved, 'one').id, service(initial, 'one').id);
    assert.equal(service(moved, 'one').number, 7);
    assert.equal(service(moved, 'one').locator, 'channel://7:ch-one:sl-fixture');
    assert.deepEqual(service(moved, 'one').positions.map(position => position.caption), ['7']);
    assert.deepEqual(merge(null, page([...initial.pages[0].items].reverse())).services, initial.services);
});

test('a real station rename changes its named ID without retaining a stale alias', () => {
    const initial = merge(null, page([item('one'), item('two', '2')]));
    const changed = merge(initial, page([item('one', '7', { name: 'Neuer Name HD' }), item('two', '2')]));
    assert.equal(service(changed, 'one').id, 'channels.tv.Neuer_Name_HD');
    assert.equal(service(changed, 'one').number, 7);
    assert.equal(changed.services.some(entry => entry.id === 'channels.tv.Sender_one'), false);
});

test('names become readable safe segments and reserve old numeric and hash folder formats', () => {
    assert.equal(nameSegment('Das Erste HD'), 'Das_Erste_HD');
    assert.equal(nameSegment('SAT.1'), 'SAT_1');
    assert.equal(nameSegment('WDR HD Köln'), 'WDR_HD_Koeln');
    assert.equal(nameSegment('  Ä Ö Ü ß / +  '), 'Ae_Oe_Ue_ss');
    assert.equal(nameSegment('123'), 'Sender_123');
    assert.equal(nameSegment('service_' + 'a'.repeat(64)), 'Sender_service_' + 'a'.repeat(64));
    assert.equal(nameSegment('x'.repeat(119) + ' / long suffix'), 'x'.repeat(119));
    assert.equal(nameSegment('x'.repeat(1024)).length, 120);
    assert.equal(serviceId('list', 'video', 'Das Erste HD', 'first'), 'channels.tv.Das_Erste_HD');
    const unnamed = merge(null, page([item('one', '1', { name: '' }), item('two', '2', { name: ' / ' })]));
    assert.ok(unnamed.services.every(entry => /^channels\.tv\.Sender_[a-f0-9]{64}$/u.test(entry.id)));
    assert.notEqual(service(unnamed, 'one').id, service(unnamed, 'two').id);
    assert.equal(service(merge(unnamed, page([item('one', '27', { name: '' })])), 'one').id, service(unnamed, 'one').id);
});

test('different services with the same cleaned name receive deterministic identity suffixes', () => {
    const references = [item('a', '1', { name: 'SAT.1' }), item('b', '2', { name: 'SAT / 1' }),
        item('c', '3', { name: 'SAT_1' })];
    const catalog = merge(null, page(references));
    assert.equal(catalog.services.length, 3);
    assert.equal(service(catalog, 'a').id, 'channels.tv.SAT_1');
    const hash = createHash('sha256').update(serviceIdentity(service(catalog, 'b'))).digest('hex');
    assert.equal(service(catalog, 'b').id, 'channels.tv.SAT_1__' + hash);
    assert.deepEqual(merge(null, page([...references].reverse())).services, catalog.services);
    assert.equal(new Set(catalog.services.map(entry => entry.id)).size, 3);
    const truncated = merge(null, page([item('first', '1', { name: 'x'.repeat(120) + ' A' }),
        item('second', '2', { name: 'x'.repeat(120) + ' B' })]));
    assert.equal(new Set(truncated.services.map(entry => entry.id)).size, 2);
});

test('a new name collision cannot steal the existing base ID even with an earlier-sorting identity', () => {
    const old = merge(null, page([item('z', '30', { name: 'Gleicher Name' })]));
    const added = merge(old, page([item('a', '1', { name: 'Gleicher Name' }), item('z', '2', { name: 'Gleicher Name' })]));
    assert.equal(service(added, 'z').id, 'channels.tv.Gleicher_Name');
    assert.match(service(added, 'a').id, /^channels\.tv\.Gleicher_Name__[a-f0-9]{64}$/u);
    const moved = merge(added, page([item('z', '4', { name: 'Gleicher Name' }), item('a', '9', { name: 'Gleicher Name' })]));
    assert.equal(service(moved, 'z').id, service(added, 'z').id);
    assert.equal(service(moved, 'a').id, service(added, 'a').id);
});

test('a validated collision suffix survives removal of its neighbour, cache restore and further full refreshes', () => {
    const first = merge(null, page([item('a', '1', { name: 'Gleich' }), item('b', '2', { name: 'Gleich' })]));
    const suffix = service(first, 'b').id;
    const alone = merge(first, page([item('b', '5', { name: 'Gleich' })]));
    assert.equal(alone.services[0].id, suffix);
    const restored = restoreChannelCatalog(JSON.stringify(alone));
    assert.equal(merge(restored, page([item('b', '19', { name: 'Gleich' })])).services[0].id, suffix);
});

test('radio with an identical name, number or UUID cannot collide with TV and changing lists resets old content', () => {
    const catalog = merge(null, page([item('same', '100', { name: 'Gleich' }),
        item('same', '100', { name: 'Gleich', itemClass: 'audio' })]));
    assert.deepEqual(catalog.services.map(entry => entry.id), ['channels.tv.Gleich']);
    assert.equal(catalog.lastQuery.reconciled, true);
    const other = merge(catalog, page([item('new', '100', { name: 'Gleich' })], { view: 'other-view' }));
    assert.equal(other.services.length, 1);
    assert.equal(other.services[0].listView, 'other-view');
    assert.equal(other.pages.length, 1);
});

test('without UUID, the locator service components group positions and remain stable after sorting', () => {
    const first = merge(null, page([item('', '1', { name: 'Ohne UUID', locator: 'channel://1:ch-a:sl-fixture' }),
        item('', '100', { name: 'Ohne UUID', locator: 'channel://100:ch-a:sl-fixture' })]));
    assert.equal(first.services.length, 1);
    assert.equal(first.services[0].positions.length, 2);
    const next = merge(first, page([item('', '27', { name: 'Ohne UUID', locator: 'channel://27:ch-a:sl-fixture' })]));
    assert.equal(serviceIdentity(first.services[0]), serviceIdentity(next.services[0]));
    assert.equal(next.services[0].id, first.services[0].id);
    assert.equal(next.services[0].locator, 'channel://27:ch-a:sl-fixture');
    assert.throws(() => normalizeServiceRecord({ ...first.services[0], positions: [
        { caption: '1', locator: 'channel://1:ch-a:sl-fixture' },
        { caption: '2', locator: 'channel://2:ch-b:sl-fixture' },
    ] }), { code: 'INVALID_RESPONSE' });
});

test('selection uses the lowest valid position and retains all original captions and locators', () => {
    const catalog = merge(null, page([item('one', '1', { locator: '' }), item('one', '010'), item('one', '2')]));
    const one = service(catalog, 'one');
    assert.equal(one.number, 2);
    assert.equal(one.available, true);
    assert.equal(one.locator, 'channel://2:ch-one:sl-fixture');
    assert.deepEqual(one.positions.map(position => position.caption), ['1', '2', '010']);
    const fallback = merge(null, page([item('blank', '', { locator: 'channel://8:ch-eight:sl-fixture' }),
        item('named', 'Sender neun', { locator: 'channel://9:ch-nine:sl-fixture' })]));
    assert.equal(service(fallback, 'blank').caption, '');
    assert.equal(service(fallback, 'blank').number, 8);
    assert.equal(service(fallback, 'named').number, 9);
});

test('nonnumeric or unsafe positions are not invented from names, array indexes or arbitrary URLs', () => {
    const catalog = merge(null, page([item('unknown', 'unknown'), item('negative', '-1'), item('fraction', '1.5'),
        item('space', ' 3 '), item('unsafe', '9007199254740993'),
        item('missing', '', { locator: 'http://tv.example/stream' })]));
    assert.equal(catalog.services.length, 0);
    assert.equal(catalog.lastQuery.skipped, 6);
    assert.equal(catalog.lastQuery.invalidPositions, 6);
    assert.equal(catalog.lastQuery.reconciled, false);
});

test('a partial move replaces the observed service positions instead of selecting a stale smaller number', () => {
    const initial = merge(null, page([item('a'), item('a', '100'), item('b', '2')]));
    const partial = merge(initial, page([item('a', '7')], { totalResults: 3 }));
    assert.equal(service(partial, 'a').id, service(initial, 'a').id);
    assert.deepEqual(service(partial, 'a').positions.map(position => position.caption), ['7']);
    assert.equal(service(partial, 'a').locator, 'channel://7:ch-a:sl-fixture');
    assert.deepEqual(service(partial, 'b'), service(initial, 'b'));
    assert.equal(partial.lastQuery.reconciled, false);
});

test('a partially observed replacement disables an old occupant and retains unrelated services', () => {
    const initial = merge(null, page([item('old'), item('kept', '2')]));
    const partial = merge(initial, page([item('replacement')], { totalResults: 3 }));
    assert.equal(service(partial, 'old').available, false);
    assert.equal(service(partial, 'replacement').available, true);
    assert.equal(service(partial, 'replacement').locator, 'channel://1:ch-replacement:sl-fixture');
    assert.deepEqual(service(partial, 'kept'), service(initial, 'kept'));
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(partial)), partial);
});

test('a partial replacement can keep an unaffected confirmed alternative position of the old service', () => {
    const initial = merge(null, page([item('old'), item('old', '100'), item('kept', '2')]));
    const partial = merge(initial, page([item('replacement')], { totalResults: 4 }));
    assert.equal(service(partial, 'old').number, 100);
    assert.equal(service(partial, 'old').available, true);
    assert.deepEqual(service(partial, 'old').positions.map(position => position.caption), ['100']);
    assert.equal(service(partial, 'old').locator, 'channel://100:ch-old:sl-fixture');
});

test('moving B onto A in a partial reply updates B and disables the previous A target', () => {
    const initial = merge(null, page([item('a'), item('b', '2')]));
    const partial = merge(initial, page([item('b')], { totalResults: 2 }));
    assert.equal(service(partial, 'a').available, false);
    assert.equal(service(partial, 'b').id, service(initial, 'b').id);
    assert.equal(service(partial, 'b').locator, 'channel://1:ch-b:sl-fixture');
    assert.equal(service(partial, 'b').positions.length, 1);
});

test('contradictory caption and locator numbers disable both claimed old positions', () => {
    const initial = merge(null, page([item('old'), item('other', '5'), item('kept', '2')]));
    const catalog = merge(initial, page([item('new', '1', { locator: 'channel://5:ch-new:sl-fixture' })]));
    assert.equal(catalog.lastQuery.invalidPositions, 1);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.equal(service(catalog, 'old').available, false);
    assert.equal(service(catalog, 'other').available, false);
    assert.deepEqual(service(catalog, 'kept'), service(initial, 'kept'));
    const unknown = merge(initial, page([item('old', 'unknown')]));
    assert.equal(service(unknown, 'old').available, false);
});

test('conflicting TV occupants are rejected independently of response order while radio is ignored', () => {
    const initial = merge(null, page([item('old'), item('kept', '2')]));
    const references = [item('first'), item('second'), item('radio', '1', { itemClass: 'audio' })];
    const catalog = merge(initial, page(references));
    assert.deepEqual(catalog.services, merge(initial, page([...references].reverse())).services);
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.equal(catalog.lastQuery.conflictingPositions, 1);
    assert.equal(service(catalog, 'old').available, false);
    assert.equal(service(catalog, 'first'), undefined);
    assert.equal(service(catalog, 'radio', 'audio'), undefined);
    assert.equal(catalog.lastQuery.ignoredAudioResults, 1);
});

test('leading-zero slot collisions and inconsistent names of one service are rejected', () => {
    for (const references of [
        [item('one', '001'), item('one', '1')],
        [item('one'), item('one', '1', { name: 'Different' })],
        [item('one'), item('one', '100', { name: 'Different' })],
    ]) {
        const catalog = merge(null, page(references));
        assert.equal(catalog.services.length, 0);
        assert.equal(catalog.lastQuery.skipped, 2);
        assert.equal(catalog.lastQuery.conflictingPositions, 1);
        assert.equal(catalog.lastQuery.reconciled, false);
    }
});

test('exact repeated references are deduplicated without making a slot ambiguous', () => {
    const catalog = merge(null, page([item('one'), item('one')]));
    assert.equal(catalog.services.length, 1);
    assert.equal(catalog.services[0].positions.length, 1);
    assert.equal(catalog.lastQuery.returnedResults, 2);
    assert.equal(catalog.lastQuery.skipped, 0);
    assert.equal(catalog.lastQuery.reconciled, true);
});

test('collected partial ranges never imply reconciliation and only a full live reply removes missing services', () => {
    const initial = merge(null, page([item('old'), item('kept', '2')]));
    const first = merge(initial, page([item('new', '3')], { totalResults: 2 }));
    const second = merge(first, page([item('kept', '4')], { startIndex: 1, totalResults: 2 }));
    assert.equal(second.lastQuery.reconciled, false);
    assert.deepEqual(second.services.map(entry => entry.number), [1, 3, 4]);
    const full = merge(second, page([item('new', '3'), item('kept', '4')]));
    assert.equal(full.lastQuery.reconciled, true);
    assert.deepEqual(full.services.map(entry => entry.number), [3, 4]);
});

test('complete mixed replies reconcile TV while radio-only replies cannot clear existing TV services', () => {
    const both = merge(null, page([item('tv'), item('radio', '100', { itemClass: 'audio' })]));
    const television = merge(both, page([item('new', '2'), item('radio', '100', { itemClass: 'audio' })]), 'video');
    assert.equal(service(television, 'tv'), undefined);
    assert.equal(television.services.length, 1);
    assert.equal(television.lastQuery.reconciled, true);
    const audioOnly = merge(television, page([item('radio', '5', { itemClass: 'audio' })]), 'video');
    assert.deepEqual(audioOnly.services, television.services);
    assert.equal(audioOnly.lastQuery.reconciled, false);
    assert.equal(audioOnly.lastQuery.ignoredAudioResults, 1);
    assert.deepEqual(merge(audioOnly, page([]), 'video').services, []);
    assert.throws(() => merge(television, page([]), 'audio'), { code: 'VALIDATION' });
    assert.throws(() => merge(television, page([], { itemClass: 'audio' })), { code: 'INVALID_RESPONSE' });
});

test('unknown types, missing identities and audio-only replies cannot retire existing TV services', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([item('unknown', '2', { itemClass: 'undefined' }),
        item('', '3', { locator: '' }), item('new', '4')]));
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.equal(catalog.lastQuery.reconciled, false);
    assert.deepEqual(catalog.services.map(entry => entry.number), [1, 4]);
    const wrongFilter = merge(initial, page([item('radio', '1', { itemClass: 'audio' })]), 'video');
    assert.deepEqual(wrongFilter.services, initial.services);
    assert.equal(wrongFilter.lastQuery.skipped, 0);
    assert.equal(wrongFilter.lastQuery.ignoredAudioResults, 1);
    assert.equal(wrongFilter.lastQuery.reconciled, false);
});

test('missing UUIDs require valid locators while known UUIDs may remain visible but unavailable', () => {
    const catalog = merge(null, page([item('', '1', { name: 'Gleich', locator: 'channel://1:ch-a:sl-fixture' }),
        item('', '2', { name: 'Gleich', locator: 'channel://2:ch-b:sl-fixture' }),
        item('', '3', { locator: 'http://example.invalid/stream' })]));
    assert.equal(catalog.services.length, 2);
    assert.equal(new Set(catalog.services.map(entry => entry.id)).size, 2);
    assert.equal(catalog.lastQuery.skipped, 1);
    const known = merge(null, page([item('one', '1', { locator: '' }),
        item('two', '2', { locator: 'http://example.invalid/media' }),
        item('three', '3', { locator: 'channel://3:ch-three\n:sl-fixture' }),
        item('four', '4', { locator: 'channel://arbitrary-url' })]));
    assert.equal(known.services.length, 4);
    assert.ok(known.services.every(entry => entry.available === false));
    assert.equal(known.lastQuery.reconciled, true);
});

test('an unidentified reference at the same position invalidates an otherwise valid new occupant', () => {
    const initial = merge(null, page([item('old')]));
    const catalog = merge(initial, page([item('new'), item('', '1', { locator: '' })]));
    assert.equal(catalog.lastQuery.skipped, 2);
    assert.equal(catalog.lastQuery.conflictingPositions, 1);
    assert.equal(service(catalog, 'new'), undefined);
    assert.equal(service(catalog, 'old').available, false);
});

test('repeated and overlapping pages retain only one copy of each stored raw range', () => {
    const first = merge(null, page([item('one'), item('two', '2')], { totalResults: 4 }));
    const repeat = merge(first, page([item('one'), item('two', '2')], { totalResults: 4 }));
    assert.equal(repeat.pages.length, 1);
    const overlap = merge(repeat, page([item('new-two', '2'), item('three', '3')], { startIndex: 1, totalResults: 4 }));
    assert.deepEqual(overlap.pages.map(value => [value.startIndex, value.items.length]), [[0, 1], [1, 2]]);
    assert.equal(service(overlap, 'two').available, false);
    assert.equal(service(overlap, 'new-two').available, true);
});

test('partial mixed pages and overlapping raw ranges preserve TV history and offsets across cache restore', () => {
    const initial = merge(null, page([item('kept', '9')]));
    const mixed = merge(initial, page([
        item('radio-first', '1', { itemClass: 'audio' }), item('one'),
        item('radio-middle', '2', { itemClass: 'audio' }), item('two', '2'),
    ], { totalResults: 6 }), 'video');
    assert.equal(mixed.lastQuery.returnedResults, 4);
    assert.equal(mixed.lastQuery.reconciled, false);
    assert.deepEqual(mixed.pages[0].sourceIndexes, [1, 3]);
    assert.equal(service(mixed, 'kept').available, true);
    const restored = restoreChannelCatalog(JSON.stringify(mixed));
    const overlap = merge(restored, page([item('three', '3'), item('radio-next', '3', { itemClass: 'audio' })], {
        startIndex: 2, totalResults: 6,
    }), 'video');
    assert.deepEqual(overlap.pages.map(value => [value.startIndex, value.returnedResults, value.items.length]), [[0, 2, 1], [2, 2, 1]]);
    assert.deepEqual(overlap.pages.map(value => value.sourceIndexes), [[1], [0]]);
    assert.equal(overlap.lastQuery.reconciled, false);
    assert.ok(service(overlap, 'kept'));
    assert.ok(service(overlap, 'two'), 'Replacing diagnostic page ranges does not infer removal from a partial result.');
    assert.equal(JSON.stringify(overlap).includes('radio-'), false);
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(overlap)), overlap);
    const last = merge(overlap, page([item('four', '4'), item('five', '5')], { startIndex: 4, totalResults: 6 }));
    assert.equal(last.lastQuery.reconciled, false, 'Even collected contiguous partial pages must not purge old services.');
    assert.ok(service(last, 'kept'));
});

test('changing totals or hash starts a new raw page collection without treating absence as deletion', () => {
    const original = merge(null, page([item('one')], { totalResults: 4, hash: 'first' }));
    const changed = merge(original, page([item('two', '2')], { startIndex: 1, totalResults: 5, hash: 'second' }));
    assert.equal(changed.pages.length, 1);
    assert.ok(service(changed, 'one'));
    assert.ok(service(changed, 'two'));
    assert.equal(changed.lastQuery.reconciled, false);
});

test('schema-3 caches round-trip while unknown properties and streaming metadata are omitted', () => {
    const catalog = merge(null, page([item('one', '1', { thumbnailUrl: 'http://tv.example/thumbnail' })]));
    const altered = structuredClone(catalog);
    altered.unexpected = 'discard';
    altered.services[0].unexpected = 'discard';
    altered.pages[0].items[0].thumbnailUrl = 'discard';
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(altered)), catalog);
    assert.equal(JSON.stringify(catalog).includes('thumbnailUrl'), false);
});

test('normalization recomputes selection fields and validates IDs, collisions and availability', () => {
    const [one] = merge(null, page([item('one'), item('one', '100')])).services;
    assert.deepEqual(normalizeServiceRecord({ ...one, number: 999, locator: 'http://example.invalid', caption: '999' }), one);
    for (const id of [null, 'channels.tv.attacker', 'channels.tv.1', 'channels.radio.Sender_one',
        'channels.tv.Sender_one__' + 'a'.repeat(64)]) {
        assert.throws(() => normalizeServiceRecord({ ...one, id }), { code: 'INVALID_RESPONSE' });
    }
    assert.throws(() => normalizeServiceRecord({ ...one, available: 'false' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => normalizeServiceRecord({ ...one, positions: [
        { caption: '1', locator: 'channel://1:ch-one:sl-fixture' },
        { caption: '001', locator: 'channel://001:ch-one:sl-fixture' },
    ] }), { code: 'INVALID_RESPONSE' });
});

test('version-1 groups retain their positions while migrating from validated hashes to readable names', () => {
    const old = legacy('first', ['1', '100', '1000'], { name: 'Das Erste HD', available: false });
    const [migrated] = migrateServiceRecord(old);
    assert.equal(migrated.id, 'channels.tv.Das_Erste_HD');
    assert.equal(migrated.positions.length, 3);
    assert.equal(migrated.available, false);
    assert.equal(migrated.locator, 'channel://1:ch-first:sl-fixture');
    assert.deepEqual(migrateServiceRecord(migrated), [migrated]);
    const restored = restoreChannelCatalog(cache(1, [old, legacy('radio', ['100'], { itemClass: 'audio' })]));
    assert.equal(restored.schemaVersion, 3);
    assert.equal(restored.services.length, 1);
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(restored)), restored);
});

test('version-2 numbered folders are validated against their position and grouped into services', () => {
    const old = cache(2, [numeric('first', '1', { name: 'Das Erste HD' }),
        numeric('first', '100', { name: 'Das Erste HD' }), numeric('first', '1000', { name: 'Das Erste HD' }),
        numeric('radio', '100', { name: 'Bayern 1', itemClass: 'audio' })]);
    const original = JSON.stringify(old);
    const restored = restoreChannelCatalog(old);
    assert.equal(restored.services.length, 1);
    assert.equal(service(restored, 'first').id, 'channels.tv.Das_Erste_HD');
    assert.deepEqual(service(restored, 'first').positions.map(position => position.caption), ['1', '100', '1000']);
    assert.equal(service(restored, 'radio', 'audio'), undefined);
    assert.equal(JSON.stringify(old), original);
    assert.throws(() => migrateServiceRecord({ ...numeric('first'), id: 'channels.tv.2' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => migrateServiceRecord({ ...numeric('first'), id: 'channels.radio.1' }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => migrateServiceRecord({ ...numeric('first'), positions: [
        { caption: '1', locator: 'channel://1:ch-first:sl-fixture' },
        { caption: '100', locator: 'channel://100:ch-first:sl-fixture' },
    ] }), { code: 'INVALID_RESPONSE' });
});

test('schema-3 mixed caches discard every radio record and obsolete audio-query claims', () => {
    const initial = merge(null, page([item('television')]));
    const radio = { ...numeric('old-radio', '100', { itemClass: 'audio' }), id: 'channels.radio.Sender_old_radio' };
    const mixedPage = { ...page([item('television'), item('old-radio', '100', { itemClass: 'audio' })]), mediaType: '' };
    const old = { ...initial, pages: [mixedPage], services: [...initial.services, radio] };
    const restored = restoreChannelCatalog(old);
    assert.deepEqual(restored.services, initial.services);
    assert.equal(restored.pages[0].returnedResults, 2);
    assert.equal(restored.pages[0].ignoredAudioResults, 1);
    assert.equal(JSON.stringify(restored).includes('old-radio'), false);
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(restored)), restored);
    const audioQuery = restoreChannelCatalog({ ...old,
        pages: [{ ...page([item('old-radio', '100', { itemClass: 'audio' })]), mediaType: 'audio' }],
        lastQuery: { ...initial.lastQuery, mediaType: 'audio' } });
    assert.deepEqual(audioQuery.services, initial.services);
    assert.deepEqual(audioQuery.pages, []);
    assert.equal(audioQuery.lastQuery.reconciled, false);
    assert.deepEqual(restoreChannelCatalog(JSON.stringify(audioQuery)), audioQuery);
    for (const normalize of [normalizeServiceRecord, migrateServiceRecord, createChannelDefinitions, serviceIdentity]) {
        assert.throws(() => normalize(radio), { code: 'INVALID_RESPONSE' });
    }
    assert.throws(() => serviceId('list', 'audio', 'Radio', 'radio'), { code: 'INVALID_RESPONSE' });
});

test('migration handles duplicate names without merging different services and conservatively preserves restrictions', () => {
    const old = cache(2, [numeric('a', '1', { name: 'Gleich' }), numeric('b', '2', { name: 'Gleich' }),
        { ...numeric('a', '100', { name: 'Gleich' }), available: false }]);
    const restored = restoreChannelCatalog(old);
    assert.equal(restored.services.length, 2);
    assert.equal(new Set(restored.services.map(entry => entry.id)).size, 2);
    assert.equal(service(restored, 'a').positions.length, 2);
    assert.equal(service(restored, 'a').available, false);
    assert.throws(() => restoreChannelCatalog(cache(2, [numeric('a'), numeric('b')])), { code: 'INVALID_RESPONSE' });
});

test('legacy migration rejects altered hashes, ambiguous old slots and invalid fallback service groups', () => {
    const old = legacy('one', ['1']);
    assert.throws(() => migrateServiceRecord({ ...old, id: old.id.replace(/.$/u, old.id.endsWith('a') ? 'b' : 'a') }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => migrateServiceRecord(legacy('one', ['unknown'])), { code: 'INVALID_RESPONSE' });
    assert.throws(() => migrateServiceRecord(legacy('one', ['001', '1'])), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog(cache(1, [old, legacy('other', ['1'])])), { code: 'INVALID_RESPONSE' });
    const fallback = legacy('', ['12'], { positions: [{ caption: 'Name', locator: 'channel://12:ch-first:sl-fixture' }] });
    assert.equal(migrateServiceRecord(fallback)[0].number, 12);
    const mixed = legacy('', ['1', '2'], { positions: [{ caption: '1', locator: 'channel://1:ch-first:sl-fixture' },
        { caption: '2', locator: 'channel://2:ch-other:sl-fixture' }] });
    assert.throws(() => migrateServiceRecord(mixed), { code: 'INVALID_RESPONSE' });
});

test('archived services remain unavailable after restore until a valid live observation', () => {
    const catalog = merge(null, page([item('one')]));
    const archived = { ...catalog.services[0], available: false };
    const restored = restoreChannelCatalog({ ...catalog, services: [archived] });
    const unrelated = merge(restored, page([item('two', '2')], { totalResults: 3 }));
    assert.equal(service(unrelated, 'one').available, false);
    assert.equal(service(merge(unrelated, page([item('one', '7')], { totalResults: 3 })), 'one').available, true);
    assert.equal(normalizeServiceRecord({ ...archived, available: true, positions: [{ caption: '1', locator: '' }] }).available, false);
});

test('untrusted caches reject malformed records, mixed lists, duplicate identities and duplicate active positions', () => {
    const catalog = merge(null, page([item('one')]));
    assert.throws(() => restoreChannelCatalog('{invalid'), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, schemaVersion: 7 }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, pages: [null] }), { code: 'INVALID_RESPONSE' });
    const other = merge(null, page([item('one')], { view: 'other-view' })).services[0];
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [other] }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [...catalog.services, ...catalog.services] }), { code: 'INVALID_RESPONSE' });
    const renamedDuplicate = normalizeServiceRecord({ ...catalog.services[0], id: undefined, name: 'Anderer Name' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [...catalog.services, renamedDuplicate] }), { code: 'INVALID_RESPONSE' });
    const sameSlot = merge(null, page([item('other')])).services[0];
    assert.throws(() => restoreChannelCatalog({ ...catalog, services: [...catalog.services, sameSlot] }), { code: 'INVALID_RESPONSE' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, lastQuery: { ...catalog.lastQuery, conflictingPositions: 1 } }), { code: 'INVALID_RESPONSE' });
});

test('grouping helpers preserve prior schema-3 collision IDs and reject invalid identity assignments', () => {
    const initial = merge(null, page([item('z', '1', { name: 'Gleich' })]));
    const migrated = [numeric('a', '2', { name: 'Gleich' }), numeric('z', '100', { name: 'Gleich' })]
        .flatMap(migrateServiceRecord);
    const grouped = mergeServiceRecords([...initial.services, ...migrated], initial.services);
    assert.equal(grouped.find(entry => entry.mediaItemUuid === 'z').id, initial.services[0].id);
    assert.deepEqual(grouped.find(entry => entry.mediaItemUuid === 'z').positions.map(position => position.caption), ['1', '100']);
    assert.throws(() => assignServiceIds([...initial.services, ...initial.services]), { code: 'INVALID_RESPONSE' });
    assert.throws(() => assignServiceIds(initial.services, [...initial.services, ...initial.services]), { code: 'INVALID_RESPONSE' });
});

test('merging never mutates caller-owned pages or existing caches', () => {
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

test('byte, entry and page limits reject oversized data without truncation, including migrations', () => {
    const catalog = merge(null, page([item('one')]));
    assert.throws(() => restoreChannelCatalog(' '.repeat(MAX_CATALOG_BYTES + 1)), { code: 'CATALOG_LIMIT' });
    assert.throws(() => merge(null, page(Array.from({ length: MAX_CATALOG_ENTRIES + 1 }, () => item('one')))), { code: 'CATALOG_LIMIT' });
    assert.throws(() => restoreChannelCatalog({ ...catalog, pages: Array(MAX_CATALOG_PAGES + 1).fill(catalog.pages[0]) }), { code: 'CATALOG_LIMIT' });
    const old = legacy('one', ['1']);
    assert.throws(() => restoreChannelCatalog(cache(1, [{ ...old, positions: Array(MAX_CATALOG_ENTRIES + 1).fill(old.positions[0]) }])), { code: 'CATALOG_LIMIT' });
    const large = Array.from({ length: 250 }, (_, number) => item('fixture-' + number, String(number), { name: 'x'.repeat(1024) }));
    assert.throws(() => merge(null, page(large)), { code: 'CATALOG_LIMIT' });
});

test('invalid page metadata is rejected before any catalogue can be replaced', () => {
    assert.throws(() => merge(null, page([item('one')], { returnedResults: 2 })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')], { startIndex: 1 })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')], { view: '' })), { code: 'INVALID_RESPONSE' });
    assert.throws(() => merge(null, page([item('one')]), 'guessed-type'), { code: 'VALIDATION' });
    assert.throws(() => mergeChannelPage(null, page([item('one')]), { now: NaN }), { code: 'INVALID_RESPONSE' });
    assert.equal(merge(null, page([item('one')], { startIndex: null, totalResults: null })).lastQuery.reconciled, false);
    const catalog = merge(null, page([item('one'), item('radio', '100', { itemClass: 'audio' })]));
    for (const fields of [{ sourceIndexes: undefined }, { sourceIndexes: [2] }, { ignoredAudioResults: 2 },
        { ignoredAudioResults: -1 }, { sourceIndexes: [0, 1] }]) {
        assert.throws(() => restoreChannelCatalog({ ...catalog, pages: [{ ...catalog.pages[0], ...fields }] }), { code: 'INVALID_RESPONSE' });
    }
});

test('folder ID contains the station name, common name is its preferred position, and description keeps its label', () => {
    const catalog = merge(null, page([item('one', '001', { name: 'Änderung & HD' }),
        item('one', '100', { name: 'Änderung & HD' })]));
    const one = service(catalog, 'one');
    const { definitions, values } = createChannelDefinitions(one);
    const prefix = 'channels.tv.Aenderung_HD';
    const button = definitions.find(definition => definition.id === prefix + '.select');
    assert.equal(definitions[0].id, prefix);
    assert.equal(definitions[0].common.name, '1');
    assert.equal(definitions[0].common.desc, 'Änderung & HD');
    assert.equal(definitions[0].native.schemaVersion, 3);
    assert.equal(button.common.type, 'boolean');
    assert.equal(button.common.role, 'button');
    assert.equal(button.common.write, true);
    assert.equal(button.common.read, false);
    assert.equal(button.common.def, false);
    assert.equal(Object.hasOwn(values, button.id), false);
    assert.equal(values[prefix + '.number'], 1);
    assert.deepEqual(JSON.parse(values[prefix + '.positions']), one.positions);
    assert.deepEqual(JSON.parse(values[prefix + '.positions']), [
        { caption: '001', locator: 'channel://001:ch-one:sl-fixture' },
        { caption: '100', locator: 'channel://100:ch-one:sl-fixture' },
    ]);
    for (const suffix of ['numbers', 'locators', 'listView', 'epg.source', 'epg.sourceChannelId',
        'epg.now.endEstimated', 'epg.next.endEstimated']) {
        assert.equal(definitions.some(definition => definition.id === `${prefix}.${suffix}`), false, suffix);
        assert.equal(Object.hasOwn(values, `${prefix}.${suffix}`), false, suffix);
    }
    assert.equal(definitions[0].native.listView, one.listView, 'The internal list identity still belongs to the service.');
    assert.ok(!Object.keys(values).some(id => id.startsWith(prefix + '.epg.')),
        'Programme values are owned by the EPG manager, not by ordinary station metadata updates.');
    assert.equal(definitions.find(definition => definition.id === prefix + '.epg.status').common.def, 'waiting');
    assert.ok(definitions.some(definition => definition.id === prefix + '.epg' && definition.type === 'channel'));
    assert.ok(definitions.filter(definition => definition.type === 'state' && definition.id !== button.id)
        .every(definition => definition.common.read === true && definition.common.write === false));
});
