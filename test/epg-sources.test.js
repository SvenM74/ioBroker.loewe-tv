'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { serviceIdentity } = require('../lib/channel-catalog');
const { createCache, restoreCache, selectNowNext, MAX_CACHE_AGE } = require('../lib/epg-data');
const { guideUrl, normalizeEpgConfig, usesXmltv, configurationKey, channelSourceKey, combineCaches,
    safeMapping, serializeSources, restoreSources, MAX_BUNDLE_BYTES } = require('../lib/epg-sources');

// Synthetic channels, schedules and URLs; no captured TV or provider data.
const NOW = Date.parse('2026-10-19T18:00:00Z');
const MINUTE = 60000;
const SERVICE = { id: 'channels.tv.Test_HD', itemClass: 'video', name: 'Test HD',
    listView: 'test-list', mediaItemUuid: 'synthetic-tv-service-a', number: 1 };
const XMLTV_ID = 'test-hd.xmltv';
const EMPTY = { tvCache: null, xmltvCache: null, xmltvMapping: null };

function config(extra = {}) {
    return normalizeEpgConfig({ epgSource: 'auto', epgXmltvUrl: 'https://guide.invalid/guide.xml', ...extra });
}

function programme(title, start, end, extra = {}) {
    return { eventId: title, title, subtitle: '', description: '', start: NOW + start * MINUTE,
        end: end === null ? null : NOW + end * MINUTE, ...extra };
}

function cache(source, events, fetchedAt = NOW, cfg = config(), service = SERVICE, id = XMLTV_ID) {
    return createCache(service, { source, events,
        ...(source === 'tv' ? {} : { sourceKey: channelSourceKey(service, cfg) }),
        ...(source === 'xmltv' ? { sourceChannelId: id } : {}) }, fetchedAt);
}

function entry(cfg = config(), service = SERVICE) {
    const manual = Object.hasOwn(cfg.epgXmltvMappings, service.id);
    const id = manual ? cfg.epgXmltvMappings[service.id] : XMLTV_ID;
    return { service, identity: serviceIdentity(service),
        tvCache: cache('tv', [programme('TV current', -10, 10)], NOW - 5 * MINUTE, cfg, service),
        xmltvCache: cache('xmltv', [programme('XMLTV next', 10, 30)], NOW - MINUTE, cfg, service, id),
        xmltvMapping: { tvChannelId: service.id, xmltvId: id, status: manual ? 'manual' : 'automatic',
            iconUrl: 'https://images.invalid/test.svg', candidates: [{ id }] } };
}

function saved(value, cfg = config()) { return JSON.parse(serializeSources(value, cfg)); }
function restored(value, cfg = config(), service = SERVICE, now = NOW) {
    return restoreSources(JSON.stringify(value), service, cfg, now);
}

test('optional source mistakes remain an EPG diagnostic instead of throwing during configuration', () => {
    assert.deepEqual(normalizeEpgConfig({}), { epgSource: 'tv', epgXmltvUrl: '',
        epgXmltvMappings: {}, channelLogoOverrides: {}, epgConfigError: '' });
    for (const epgXmltvMappings of [false, 'invalid', [{ xmltvId: XMLTV_ID }],
        [{ channel: SERVICE.id, xmltvId: XMLTV_ID }, { channel: SERVICE.id, xmltvId: 'other' }]]) {
        const value = config({ epgXmltvMappings, channelLogoOverrides: [{ channel: SERVICE.id, url: {} }] });
        assert.equal(value.epgSource, 'auto');
        assert.match(value.epgConfigError, /Zuordnung/iu);
        assert.deepEqual(value.epgXmltvMappings, {});
    }
    for (const epgXmltvUrl of ['', 7, {}, 'file:///guide.xml', 'https://user:password@guide.invalid/guide.xml']) {
        const value = config({ epgXmltvUrl });
        assert.equal(value.epgXmltvUrl, '');
        assert.ok(value.epgConfigError);
    }
    assert.equal(config({ epgSource: 'tv', epgXmltvUrl: 7, epgXmltvMappings: 'invalid' }).epgConfigError, '');
});

test('harmless saved table gaps no longer disable XMLTV or alter established source bindings', () => {
    const complete = [
        { channel: SERVICE.id, xmltvId: XMLTV_ID },
        { channel: 'channels.tv.Auto', mode: 'auto', xmltvId: '' },
        { channel: 'channels.tv.Disabled', mode: 'disabled', xmltvId: '' },
        { channel: 'channels.tv.Unfinished', mode: 'manual', xmltvId: '' },
    ];
    const partial = [
        {}, { channel: SERVICE.id, xmltvId: XMLTV_ID },
        { channel: 'channels.tv.Auto', mode: 'auto' },
        { channel: 'channels.tv.Disabled', mode: 'disabled', xmltvId: null },
        { channel: 'channels.tv.Unfinished', mode: 'manual' },
        { channel: '', xmltvId: '' },
    ];
    const expected = config({ epgXmltvMappings: complete });
    const recovered = config({ epgXmltvMappings: partial });
    assert.equal(recovered.epgConfigError, '');
    assert.equal(usesXmltv(recovered), true);
    assert.deepEqual(recovered.epgXmltvMappings, expected.epgXmltvMappings);
    assert.equal(configurationKey(recovered), configurationKey(expected));
    for (const id of complete.map(row => row.channel)) {
        const tv = { ...SERVICE, id };
        assert.equal(channelSourceKey(tv, recovered), channelSourceKey(tv, expected));
    }
    assert.deepEqual(config({ epgXmltvMappings: [{}] }), config({ epgXmltvMappings: [] }));
});

test('optional EPG errors leave the TV and remote runtime configuration usable', () => {
    const { normalizeConfig } = require('../lib/adapter-runtime');
    const value = normalizeConfig({ host: 'tv.invalid', port: 905, macLan: '02:00:00:00:00:01',
        epgSource: 'auto', epgXmltvUrl: 'data:invalid', epgXmltvMappings: [{}] });
    assert.equal(value.host, 'tv.invalid');
    assert.equal(value.port, 905);
    assert.equal(value.macLan, '02:00:00:00:00:01');
    assert.equal(value.timeout, 5000);
    assert.equal(value.epgSource, 'auto');
    assert.ok(value.epgConfigError);
});

test('feed and per-channel image configuration reject credentials and duplicate manual image assignments', () => {
    assert.equal(guideUrl('  https://GUIDE.invalid:443/guide.xml  '), 'https://guide.invalid/guide.xml');
    for (const value of ['//guide.invalid/a', '/guide.xml', 'file:///guide.xml', 'data:xml,test',
        'https://guide.invalid/a#fragment', 'https://user:secret@guide.invalid/a', 'https://guide.invalid/\na',
        'https://guide.invalid/' + 'x'.repeat(4096)]) assert.equal(guideUrl(value), '', value.slice(0, 80));
    const value = config({ channelLogoOverrides: [
        { channel: SERVICE.id, url: 'https://images.invalid/first.svg' },
        { channel: SERVICE.id, url: 'https://images.invalid/second.svg' },
        { channel: 'channels.tv.Other', url: 'https://images.invalid/other.svg' },
        { channel: 'channels.tv.Unsafe', url: 'https://user:secret@images.invalid/unsafe.svg' },
        { channel: 'Test HD', url: 'https://images.invalid/wrong-id.svg' },
    ] });
    assert.equal(Object.hasOwn(value.channelLogoOverrides, SERVICE.id), false);
    assert.equal(value.channelLogoOverrides['channels.tv.Other'], 'https://images.invalid/other.svg');
    assert.equal(Boolean(value.channelLogoOverrides['channels.tv.Unsafe']), false);
    assert.equal(Object.hasOwn(value.channelLogoOverrides, 'Test HD'), false);
});

test('source keys bind feed, TV identity and own mapping while ignoring unrelated presentation changes', () => {
    const first = config({ epgXmltvMappings: [
        { channel: SERVICE.id, xmltvId: XMLTV_ID }, { channel: 'channels.tv.Other', xmltvId: 'other' },
    ] });
    const reordered = config({ epgXmltvMappings: [
        { channel: 'channels.tv.Other', xmltvId: 'other' }, { channel: SERVICE.id, xmltvId: XMLTV_ID },
    ] });
    assert.equal(configurationKey(first), configurationKey(reordered));
    const key = channelSourceKey(SERVICE, first);
    assert.equal(channelSourceKey({ ...SERVICE, number: 99, thumbnailUrl: 'https://images.invalid/new.svg' }, first), key);
    assert.equal(channelSourceKey(SERVICE, { ...first, channelLogoOverrides: { [SERVICE.id]: 'https://images.invalid/new.svg' } }), key);
    assert.equal(channelSourceKey(SERVICE, { ...first,
        epgXmltvMappings: { ...first.epgXmltvMappings, 'channels.tv.Other': 'changed-other' } }), key);
    for (const changed of [config({ epgXmltvUrl: 'https://different.invalid/guide.xml' }),
        config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: 'different' }] }),
        config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: '' }] }), config()]) {
        assert.notEqual(channelSourceKey(SERVICE, changed), key);
    }
    assert.notEqual(channelSourceKey({ ...SERVICE, mediaItemUuid: 'replacement' }, first), key);
    assert.notEqual(channelSourceKey({ ...SERVICE, listView: 'other-list' }, first), key);
    assert.notEqual(channelSourceKey({ ...SERVICE, name: 'Renamed HD' }, first), key);
});

test('automatic cache binding changes when matching aliases change but not when aliases are reordered', () => {
    const cfg = config();
    const first = { ...SERVICE, aliases: ['Declared alternate HD', 'Other declared alias HD'] };
    assert.equal(channelSourceKey(first, cfg), channelSourceKey({ ...first, aliases: [...first.aliases].reverse() }, cfg));
    assert.notEqual(channelSourceKey(first, cfg),
        channelSourceKey({ ...first, aliases: ['New alternate HD'] }, cfg));
});

test('explicit TV and XMLTV modes retain their own events and original acquisition times', () => {
    const value = entry();
    assert.equal(combineCaches(value, config({ epgSource: 'tv' }), NOW), value.tvCache);
    assert.equal(combineCaches(value, config({ epgSource: 'xmltv' }), NOW), value.xmltvCache);
    assert.equal(value.tvCache.source, 'tv');
    assert.equal(value.xmltvCache.source, 'xmltv');
    assert.equal(value.tvCache.fetchedAt, NOW - 5 * MINUTE);
    assert.equal(value.xmltvCache.fetchedAt, NOW - MINUTE);
});

test('automatic mode preserves TV intervals and uses complete XMLTV events only in uncovered intervals', () => {
    const cfg = config();
    const value = entry(cfg);
    value.tvCache = cache('tv', [programme('TV fixed', 10, 20)]);
    value.xmltvCache = cache('xmltv', [programme('External before', -5, 10),
        programme('External overlaps', 5, 15), programme('External same slot', 10, 20),
        programme('External after', 20, 30)]);
    const before = structuredClone(value);
    const result = combineCaches(value, cfg, NOW);
    assert.equal(result.source, 'mixed');
    assert.deepEqual(result.events.map(item => [item.title, item.start, item.end, item.source]), [
        ['External before', NOW - 5 * MINUTE, NOW + 10 * MINUTE, 'xmltv'],
        ['TV fixed', NOW + 10 * MINUTE, NOW + 20 * MINUTE, 'tv'],
        ['External after', NOW + 20 * MINUTE, NOW + 30 * MINUTE, 'xmltv'],
    ]);
    assert.deepEqual(value, before, 'Combining does not mutate either stored source.');
});

test('XMLTV fallback never supplies an invented end to a TV event with an unknown end', () => {
    const cfg = config();
    const value = entry(cfg);
    value.tvCache = cache('tv', [programme('TV unknown current', -5, null), programme('TV unknown later', 20, null)]);
    value.xmltvCache = cache('xmltv', [programme('XMLTV current', -10, 10), programme('XMLTV next', 10, 20)]);
    const result = combineCaches(value, cfg, NOW);
    for (const item of result.events.filter(item => item.source === 'tv')) assert.equal(item.end, null);
    const selected = selectNowNext(result.events, NOW);
    assert.equal(selected.now.title, 'XMLTV current');
    assert.equal(selected.now.source, 'xmltv');
    assert.equal(selected.now.end, NOW + 10 * MINUTE);
    assert.equal(selectNowNext(result.events, NOW + 20 * MINUTE).now, null);
    assert.equal(value.tvCache.events.every(item => item.end === null), true);
});

test('conflicting TV evidence remains ambiguous instead of being hidden by XMLTV data', () => {
    const cfg = config();
    const value = entry(cfg);
    value.tvCache = cache('tv', [programme('TV A', -10, 30), programme('TV B', -5, 20)]);
    value.xmltvCache = cache('xmltv', [programme('External conflicting', 0, 10), programme('External after', 30, 40)]);
    const result = combineCaches(value, cfg, NOW);
    const selected = selectNowNext(result.events, NOW);
    assert.equal(selected.now, null);
    assert.equal(selected.ambiguous, true);
    assert.equal(selected.next.title, 'External after');
    assert.deepEqual(result.events.map(item => item.title), ['TV A', 'TV B', 'External after']);
});

test('one fresh source does not refresh or revive the other source at the age boundary', () => {
    const cfg = config();
    for (const oldSource of ['tv', 'xmltv']) {
        const value = entry(cfg);
        value[`${oldSource}Cache`].fetchedAt = NOW - MAX_CACHE_AGE;
        const originalTimes = [value.tvCache.fetchedAt, value.xmltvCache.fetchedAt];
        assert.equal(combineCaches(value, cfg, NOW).source, 'mixed');
        const result = combineCaches(value, cfg, NOW + 1);
        const freshSource = oldSource === 'tv' ? 'xmltv' : 'tv';
        assert.equal(result.source, freshSource);
        assert.equal(result.fetchedAt, value[`${freshSource}Cache`].fetchedAt);
        assert.equal(result.events.some(item => item.title.startsWith(oldSource === 'tv' ? 'TV ' : 'XMLTV ')), false);
        assert.deepEqual([value.tvCache.fetchedAt, value.xmltvCache.fetchedAt], originalTimes);
    }
    const bothOld = entry(cfg);
    bothOld.tvCache.fetchedAt = bothOld.xmltvCache.fetchedAt = NOW - MAX_CACHE_AGE - 1;
    assert.equal(combineCaches(bothOld, cfg, NOW).fetchedAt, NOW - MAX_CACHE_AGE - 1);
});

test('serialized source bundles retain separate acquisition times and restore valid automatic and manual bindings', () => {
    for (const cfg of [config(), config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: XMLTV_ID }] })]) {
        const value = entry(cfg);
        const bundle = saved(value, cfg);
        assert.equal(bundle.schemaVersion, 4);
        assert.equal(bundle.tv.source, 'tv');
        assert.equal(bundle.xmltv.source, 'xmltv');
        assert.equal(bundle.xmltv.sourceChannelId, XMLTV_ID);
        assert.equal(bundle.tv.fetchedAt, NOW - 5 * MINUTE);
        assert.equal(bundle.xmltv.fetchedAt, NOW - MINUTE);
        assert.equal(Object.hasOwn(bundle.mapping, 'candidates'), false);
        const result = restored(bundle, cfg);
        assert.equal(result.tvCache.fetchedAt, value.tvCache.fetchedAt);
        assert.equal(result.xmltvCache.fetchedAt, value.xmltvCache.fetchedAt);
        assert.equal(result.xmltvMapping.xmltvId, XMLTV_ID);
        assert.equal(result.xmltvMapping.status, value.xmltvMapping.status);
        assert.equal(result.xmltvMapping.iconUrl, value.xmltvMapping.iconUrl);
    }
});

test('feed, alias and manual-binding changes invalidate external persisted data while preserving valid TV data', () => {
    const cfg = config();
    const service = { ...SERVICE, aliases: ['Declared alternate HD'] };
    const bundle = saved(entry(cfg, service), cfg);
    for (const changed of [config({ epgSource: 'tv' }), config({ epgXmltvUrl: 'https://other.invalid/guide.xml' }),
        config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: XMLTV_ID }] }),
        config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: '' }] }),
        { ...cfg, epgConfigError: 'Invalid external settings' }]) {
        const result = restored(bundle, changed, service);
        assert.ok(result.tvCache);
        assert.equal(result.xmltvCache, null);
        assert.equal(result.xmltvMapping, null);
    }
    const changedAlias = restored(bundle, cfg, { ...service, aliases: ['Changed alternate HD'] });
    assert.ok(changedAlias.tvCache);
    assert.equal(changedAlias.xmltvCache, null);
    const manual = config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: XMLTV_ID }] });
    const manualBundle = saved(entry(manual), manual);
    for (const changed of [config(), config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: 'new-id' }] }),
        config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: '' }] })]) {
        assert.equal(restored(manualBundle, changed).xmltvCache, null);
    }
});

test('a replacement TV service or list cannot inherit either persisted source', () => {
    const bundle = saved(entry());
    for (const service of [{ ...SERVICE, mediaItemUuid: 'replacement-service' }, { ...SERVICE, listView: 'other-list' }]) {
        assert.deepEqual(restored(bundle, config(), service), EMPTY);
    }
    const changedName = restored(bundle, config(), { ...SERVICE, name: 'Renamed HD' });
    assert.ok(changedName.tvCache, 'The unchanged TV service identity may keep its own TV cache.');
    assert.equal(changedName.xmltvCache, null);
});

test('persisted XMLTV caches require matching source, key, channel identity and explicit mapping evidence', () => {
    const bundle = saved(entry());
    const variants = [
        value => { value.xmltv.sourceKey = '0'.repeat(64); },
        value => { value.xmltv.identity = serviceIdentity({ ...SERVICE, mediaItemUuid: 'other' }); },
        value => { value.xmltv.source = 'mixed'; },
        value => { value.xmltv = value.tv; },
        value => { delete value.xmltv.sourceChannelId; },
        value => { value.xmltv.sourceChannelId = 'different-id'; },
        value => { value.mapping = null; },
        value => { value.mapping.tvChannelId = 'channels.tv.Other'; },
        value => { value.mapping.xmltvId = 'different-id'; },
        value => { value.mapping.xmltvId = ''; },
        value => { value.mapping.xmltvId = null; },
        ...['manual', 'ambiguous', 'unmatched', 'missing', 'disabled'].map(status => value => { value.mapping.status = status; }),
    ];
    for (const modify of variants) {
        const changed = structuredClone(bundle);
        modify(changed);
        const result = restored(changed);
        assert.ok(result.tvCache);
        assert.equal(result.xmltvCache, null, JSON.stringify(changed.mapping));
    }
});

test('manual restoration requires the current manual ID and manual status independently of the bundle key', () => {
    const cfg = config({ epgXmltvMappings: [{ channel: SERVICE.id, xmltvId: XMLTV_ID }] });
    const bundle = saved(entry(cfg), cfg);
    for (const change of [
        value => { value.mapping.status = 'automatic'; },
        value => { value.mapping.xmltvId = 'old-manual-id'; },
        value => { value.xmltv.sourceChannelId = value.mapping.xmltvId = 'old-manual-id'; },
    ]) {
        const changed = structuredClone(bundle);
        change(changed);
        assert.equal(restored(changed, cfg).xmltvCache, null);
        changed.xmltv.fetchedAt = NOW - MAX_CACHE_AGE - 1;
        assert.equal(restored(changed, cfg).xmltvMapping, null,
            'An expired schedule must not retain a conflicting manual mapping or its logo.');
    }
});

test('persisted XMLTV channel IDs obey the same exact UTF-8 identifier contract as live mappings', () => {
    const bundle = saved(entry());
    for (const id of [' ', ' leading', 'trailing ', 'line\nbreak', '\ud800', 'ü'.repeat(257)]) {
        const changed = structuredClone(bundle);
        changed.mapping.xmltvId = changed.xmltv.sourceChannelId = id;
        assert.equal(safeMapping(changed.mapping, SERVICE), null, JSON.stringify(id));
        assert.equal(restored(changed).xmltvCache, null, JSON.stringify(id));
        assert.equal(restoreCache(JSON.stringify(changed.xmltv), SERVICE, NOW,
            { sourceKey: changed.sourceKey }), null, JSON.stringify(id));
    }
    const valid = structuredClone(bundle);
    valid.mapping.xmltvId = valid.xmltv.sourceChannelId = 'regional kanal ä';
    assert.equal(restored(valid).xmltvCache.sourceChannelId, 'regional kanal ä');
});

test('restoring one stale source preserves the other without updating its age', () => {
    const bundle = saved(entry());
    for (const oldSource of ['tv', 'xmltv']) {
        const changed = structuredClone(bundle);
        changed[oldSource].fetchedAt = NOW - MAX_CACHE_AGE - 1;
        const result = restored(changed);
        assert.equal(result[`${oldSource}Cache`], null);
        const freshSource = oldSource === 'tv' ? 'xmltv' : 'tv';
        assert.equal(result[`${freshSource}Cache`].fetchedAt, bundle[freshSource].fetchedAt);
    }
    const future = structuredClone(bundle);
    future.xmltv.fetchedAt = NOW + 300001;
    assert.equal(restored(future).xmltvCache, null);
    assert.ok(restored(future).tvCache);
});

test('single-source cache metadata cannot mislabel its events as the other source', () => {
    for (const source of ['tv', 'xmltv']) {
        const contradictory = cache(source, [programme('Conflicting source label', -5, 5,
            { source: source === 'tv' ? 'xmltv' : 'tv' })]);
        for (const item of contradictory.events) assert.equal(item.source ?? contradictory.source, source);
        const raw = JSON.parse(JSON.stringify(contradictory));
        raw.events[0].source = source === 'tv' ? 'xmltv' : 'tv';
        const restoredCache = restoreCache(JSON.stringify(raw), SERVICE, NOW,
            source === 'xmltv' ? { sourceKey: channelSourceKey(SERVICE, config()) } : {});
        assert.ok(restoredCache);
        for (const item of restoredCache.events) assert.equal(item.source ?? restoredCache.source, source);
    }
});

test('a derived mixed cache is never accepted as a persisted single-source schedule', () => {
    const mixed = combineCaches(entry(), config(), NOW);
    assert.equal(mixed.source, 'mixed');
    assert.equal(restoreCache(JSON.stringify(mixed), SERVICE, NOW, { sourceKey: mixed.sourceKey }), null);
    assert.deepEqual(restoreSources(JSON.stringify(mixed), SERVICE, config(), NOW), EMPTY);
});

test('mapping snapshots expose an image only for a matched TV service and omit untrusted extra fields', () => {
    const row = entry().xmltvMapping;
    const valid = safeMapping({ ...row, error: 'Do not expose', password: 'Do not expose' }, SERVICE);
    assert.deepEqual(valid, { tvChannelId: SERVICE.id, xmltvId: XMLTV_ID, status: 'automatic',
        iconUrl: 'https://images.invalid/test.svg' });
    assert.equal(safeMapping({ ...row, tvChannelId: 'channels.tv.Other' }, SERVICE), null);
    assert.equal(safeMapping({ ...row, status: 'made-up' }, SERVICE), null);
    for (const status of ['ambiguous', 'unmatched', 'missing', 'disabled']) {
        assert.equal(Object.hasOwn(safeMapping({ ...row, status }, SERVICE), 'iconUrl'), false);
    }
    for (const iconUrl of ['//images.invalid/a', '/local.svg', 'data:image/svg+xml,test',
        'https://user:secret@images.invalid/a', 'https://images.invalid/%5c.svg']) {
        assert.equal(Object.hasOwn(safeMapping({ ...row, iconUrl }, SERVICE), 'iconUrl'), false);
    }
});

test('legacy TV caches remain restorable while malformed and oversized source bundles are rejected', () => {
    const tv = entry().tvCache;
    const value = restoreSources(JSON.stringify(tv), SERVICE, config(), NOW);
    assert.equal(value.tvCache.source, 'tv');
    assert.equal(value.tvCache.fetchedAt, tv.fetchedAt);
    assert.equal(value.xmltvCache, null);
    for (const invalid of [null, {}, '', 'not json', '[]', '{}']) {
        assert.deepEqual(restoreSources(invalid, SERVICE, config(), NOW), EMPTY);
    }
    const oversized = saved(entry());
    oversized.extra = 'x'.repeat(MAX_BUNDLE_BYTES);
    assert.deepEqual(restored(oversized), EMPTY);
});
