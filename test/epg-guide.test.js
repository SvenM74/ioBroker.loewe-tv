'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EpgManager } = require('../lib/epg-manager');
const { serviceIdentity } = require('../lib/channel-catalog');
const { createCache, DAY, MAX_CACHE_AGE } = require('../lib/epg-data');
const { createEpgGuide, MAX_GUIDE_BYTES, MAX_GUIDE_LIMIT } = require('../lib/epg-guide');

const NOW = Date.UTC(2026, 9, 18, 12, 13, 20);
const MINUTE = 60000;
const HOUR = 60 * MINUTE;

function service(number = 1, extra = {}) {
    return {
        id: `channels.tv.Sender_${number}`, name: `Sender ${number}`, number, itemClass: 'video',
        listView: 'selected-list', mediaItemUuid: `fixture-service-${number}`, available: true,
        caption: String(number), locator: `channel://${number}:ch-fixture-${number}:sl-fixture`,
        positions: [{ caption: String(number), locator: `channel://${number}:ch-fixture-${number}:sl-fixture` }],
        ...extra,
    };
}

function programme(title, start, end, extra = {}) {
    return { eventId: `event-${title}`, title, subtitle: `${title} subtitle`, description: `${title} description`, start, end, ...extra };
}

function programmes(prefix = '') {
    return [
        programme(`${prefix}current`, NOW - 30 * MINUTE, NOW + 30 * MINUTE),
        programme(`${prefix}next`, NOW + 30 * MINUTE, NOW + HOUR),
        programme(`${prefix}later`, NOW + HOUR, NOW + 2 * HOUR),
        programme(`${prefix}even later`, NOW + 2 * HOUR, NOW + 3 * HOUR),
    ];
}

function context(channels = [service()], overrides = {}) {
    const entries = new Map();
    for (const selected of channels.filter(item => item.itemClass === 'video')) {
        entries.set(selected.id, { service: selected, identity: serviceIdentity(selected), initialized: true,
            obsolete: false, cache: createCache(selected, { source: 'tv', events: programmes(selected.name) }, NOW), error: null });
    }
    return {
        now: NOW, instance: 'loewe-tv.0', listView: 'selected-list', listName: 'Meine Fernsehsender',
        running: true, enabled: true, connected: true, refreshing: false,
        services: new Map(channels.map(selected => [selected.id, selected])), entries,
        status: 'ready', lastUpdate: NOW, lastError: '', progress: { completed: channels.length, total: channels.length,
            successful: channels.length, failed: 0 }, ...overrides,
    };
}

function entry(ctx, number = 1) { return ctx.entries.get(`channels.tv.Sender_${number}`); }
function read(ctx, query = {}) { return createEpgGuide(ctx, { from: NOW, to: NOW + 3 * HOUR, ...query }); }
function code(expected) { return error => error.code === expected; }

test('guide returns all cached upcoming programmes, original descriptions and UTC millisecond times', () => {
    const ctx = context();
    const result = read(ctx);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.source, 'tv');
    assert.equal(result.instance, 'loewe-tv.0');
    assert.equal(result.now, NOW);
    assert.equal(result.generatedAt, NOW);
    assert.equal(result.listName, 'Meine Fernsehsender');
    assert.equal(result.lastUpdate, NOW);
    assert.equal(result.status, 'ready');
    assert.equal(result.total, 1);
    assert.equal(result.nextOffset, null);
    assert.equal(result.channels[0].status, 'ready');
    assert.deepEqual(result.channels[0].events, entry(ctx).cache.events);
    assert.equal(result.channels[0].events.length, 4, 'The guide must not reduce the cache to now and next');
    assert.notEqual(result.channels[0].events[0], entry(ctx).cache.events[0]);
    result.channels[0].events[0].description = 'Edited in the caller';
    assert.notEqual(entry(ctx).cache.events[0].description, 'Edited in the caller');
});

test('the default view starts at the preceding half hour and spans three hours', () => {
    const result = createEpgGuide(context());
    assert.equal(result.from, Date.UTC(2026, 9, 18, 12));
    assert.equal(result.to - result.from, 3 * HOUR);
    assert.equal(result.offset, 0);
    assert.equal(result.limit, 20);
});

test('Internet diagnostics expose only bounded source status without URLs or extra internal metadata', () => {
    const ctx = context([], { internet: { mode: 'auto', status: 'cached', automatic: true,
        totalChannels: 20, matchedChannels: 5, channelsWithData: 3, lastUpdate: NOW,
        error: 'XMLTV_NETWORK: https://user:password@fixture.invalid/feed?token=private-secret',
        url: 'https://fixture.invalid/private', internal: 'not for the browser' } });
    const result = read(ctx);
    assert.deepEqual(result.internet, { mode: 'auto', status: 'cached', automatic: true,
        matchedChannels: 5, totalChannels: 20, channelsWithData: 3, lastUpdate: NOW, error: 'XMLTV_NETWORK: [URL]' });
    assert.doesNotMatch(JSON.stringify(result.internet), /password|private-secret|fixture\.invalid|internal/u);
    ctx.internet = { mode: 'invented', status: 'invented', automatic: 'yes', matchedChannels: 2001,
        totalChannels: -1, channelsWithData: 0.5, lastUpdate: -1, error: 'x'.repeat(2000) };
    const invalid = read(ctx).internet;
    assert.equal(invalid.mode, 'tv');
    assert.equal(invalid.status, 'tvOnly');
    assert.equal(invalid.automatic, false);
    assert.equal(invalid.matchedChannels, 0);
    assert.equal(invalid.totalChannels, 0);
    assert.equal(invalid.channelsWithData, 0);
    assert.equal(invalid.lastUpdate, 0);
    assert.equal(invalid.error.length, 1500);
    ctx.internet = { mode: 'xmltv', status: 'ready', totalChannels: 3, matchedChannels: 5, channelsWithData: 7 };
    assert.deepEqual(Object.fromEntries(Object.entries(read(ctx).internet).filter(([key]) => key.endsWith('Channels') || key === 'channelsWithData')),
        { matchedChannels: 3, totalChannels: 3, channelsWithData: 3 });
});

test('guide exposes optional TV and bundled logos independently of programme availability', () => {
    const channels = [service(1, { name: 'ZDF HD', thumbnailUrl: '/images/zdf.png' }),
        service(2, { name: 'ZDF' }), service(3, { name: 'Unknown', thumbnailUrl: 'javascript:alert(1)' })];
    const ctx = context(channels, { tvOrigin: 'http://tv.invalid:905' });
    ctx.entries.clear();
    const result = read(ctx);
    assert.equal(result.channels[0].logoUrl, 'http://tv.invalid:905/images/zdf.png');
    assert.equal(result.channels[0].logoFallback, 'logos/zdf.svg');
    assert.equal(result.channels[0].status, 'waiting');
    assert.equal(result.channels[1].logoUrl, 'logos/zdf.svg');
    assert.equal(Object.hasOwn(result.channels[1], 'logoFallback'), false);
    assert.equal(Object.hasOwn(result.channels[2], 'logoUrl'), false);
    channels[0].thumbnailUrl = '/images/zdf-new.png';
    assert.equal(read(ctx).catalogRevision, result.catalogRevision,
        'Presentation changes must not invalidate channel selections or recording identity');
});

test('manager resolves root-relative TV logos with the configured TV address without an extra request', () => {
    const ctx = context([service(1, { thumbnailUrl: '/logos/one.png' })]);
    const forbidden = () => { throw new Error('Logo metadata must not start a TV request'); };
    const runtime = { adapter: { namespace: 'loewe-tv.0' },
        config: { host: 'tv.invalid', port: 906, channelListView: ctx.listView, epgEnabled: true },
        channelObjects: { services: ctx.services }, _lastValues: new Map(), _call: forbidden };
    const manager = new EpgManager(runtime, { now: () => NOW, tvSource: { read: forbidden } });
    manager.started = true;
    manager.entries = ctx.entries;
    assert.equal(manager.guide().channels[0].logoUrl, 'http://tv.invalid:906/logos/one.png');
});

test('only configured TV services appear in numerical order, including rows without programme data', () => {
    const channels = [service(12), service(3), service(2, { listView: 'other-list' }),
        service(1, { itemClass: 'audio', id: 'channels.radio.Station' }), service(7)];
    const ctx = context(channels);
    ctx.entries.delete(service(7).id);
    const result = read(ctx);
    assert.deepEqual(result.channels.map(row => row.number), [3, 7, 12]);
    assert.equal(result.total, 3);
    assert.equal(result.channels[1].name, 'Sender 7');
    assert.equal(result.channels[1].status, 'waiting');
    assert.deepEqual(result.channels[1].events, []);
});

test('pagination includes every channel exactly once and keeps the list revision stable across pages', () => {
    const channels = Array.from({ length: 75 }, (_, index) => service(75 - index));
    const ctx = context(channels);
    const observed = [];
    let offset = 0;
    let catalogRevision;
    do {
        const result = read(ctx, { offset, limit: MAX_GUIDE_LIMIT, ...(catalogRevision ? { catalogRevision } : {}) });
        assert.ok(result.channels.length <= MAX_GUIDE_LIMIT);
        catalogRevision ||= result.catalogRevision;
        assert.equal(result.catalogRevision, catalogRevision);
        assert.equal(result.total, 75);
        observed.push(...result.channels.map(row => row.number));
        offset = result.nextOffset;
    } while (offset !== null);
    assert.deepEqual(observed, Array.from({ length: 75 }, (_, index) => index + 1));
    const end = read(ctx, { offset: 75 });
    assert.deepEqual(end.channels, []);
    assert.equal(end.nextOffset, null);
});

test('oversized multi-byte programme pages stop at the response budget without losing channels or events', () => {
    const channels = Array.from({ length: 32 }, (_, index) => service(index + 1));
    const ctx = context(channels);
    for (const selected of ctx.entries.values()) {
        selected.cache = createCache(selected.service, { source: 'tv', events: programmes()
            .map(event => ({ ...event, description: '字'.repeat(4096) })) }, NOW);
    }
    const observed = [];
    let offset = 0;
    let pages = 0;
    do {
        const result = read(ctx, { offset, limit: 32 });
        assert.ok(Buffer.byteLength(JSON.stringify(result)) <= MAX_GUIDE_BYTES);
        assert.ok(result.channels.length > 0, 'The next offset must always make progress');
        for (const row of result.channels) {
            assert.equal(row.events.length, 4);
            assert.equal(row.events[0].description, '字'.repeat(4096));
        }
        observed.push(...result.channels.map(row => row.id));
        offset = result.nextOffset;
        pages++;
    } while (offset !== null);
    assert.ok(pages > 1, 'A large requested page must paginate earlier');
    assert.deepEqual(observed, channels.map(selected => selected.id));
});

test('an unexpectedly oversized single row keeps every event and explicitly marks shortened text', () => {
    const ctx = context();
    entry(ctx).cache.events = Array.from({ length: 128 }, (_, index) => programme(`event ${index}`, NOW + index * 1000,
        NOW + (index + 1) * 1000, { description: '字'.repeat(4096), subtitle: '語'.repeat(1024) }));
    const before = JSON.stringify(entry(ctx).cache);
    const result = read(ctx);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= MAX_GUIDE_BYTES);
    assert.equal(result.channels.length, 1);
    assert.equal(result.channels[0].events.length, 128);
    assert.ok(result.channels[0].events.every(event => event.textTruncated === true));
    assert.equal(result.channels[0].events[0].description, '字'.repeat(512));
    assert.equal(JSON.stringify(entry(ctx).cache), before, 'Displaying a bounded row must not modify the cache');
});

test('invalid request shapes and unbounded or coerced pagination parameters are rejected', () => {
    for (const query of [null, [], true, '', 42, { arbitrary: 1 }, { offset: '0' }, { offset: -1 },
        { offset: 2001 }, { offset: 0.5 }, { limit: '20' }, { limit: 0 }, { limit: 33 },
        { limit: Infinity }, { limit: NaN }, { listView: 1 }, { listView: 'bad\nlist' },
        { listView: 'x'.repeat(2049) }, { catalogRevision: [] }, { catalogRevision: 'stale' },
        JSON.parse('{"__proto__":{"offset":0}}')]) {
        assert.throws(() => createEpgGuide(context(), query), code('EPG_GUIDE_INVALID'));
    }
    assert.doesNotThrow(() => createEpgGuide(context(), Object.create(null)));
});

test('window bounds allow yesterday through the day after tomorrow without promising historical data', () => {
    const ctx = context();
    for (const from of [NOW - DAY, NOW, NOW + 2 * DAY]) {
        assert.doesNotThrow(() => read(ctx, { from, to: from + DAY }));
    }
    for (const query of [
        { from: NOW - DAY - 1 }, { from: NOW + 2 * DAY + 1, to: NOW + 3 * DAY },
        { from: String(NOW) }, { from: NaN }, { from: NOW + 0.5 }, { to: NOW },
        { to: NOW - 1 }, { to: NOW + DAY + 1 }, { to: Infinity },
    ]) assert.throws(() => read(ctx, query), code('EPG_GUIDE_INVALID'));
    assert.deepEqual(read(ctx, { from: NOW + 2 * DAY, to: NOW + 3 * DAY }).channels[0].events, []);
});

test('the visible window uses interval intersections and keeps unknown ends without inventing times', () => {
    const ctx = context();
    const events = [
        programme('ended', NOW - HOUR, NOW),
        programme('overlaps', NOW - MINUTE, NOW + MINUTE),
        programme('unknown earlier', NOW - HOUR, null),
        programme('starts at right edge', NOW + 3 * HOUR, NOW + 4 * HOUR),
        programme('unknown future', NOW + HOUR, null),
    ];
    entry(ctx).cache.events = events;
    const row = read(ctx).channels[0];
    assert.deepEqual(row.events.map(event => event.title), ['overlaps', 'unknown earlier', 'unknown future']);
    assert.equal(row.events.find(event => event.title === 'unknown earlier').end, null);
    assert.equal(row.events.find(event => event.title === 'unknown future').end, null);
    assert.equal(events[2].end, null);
});

test('unknown descriptions and HTML-looking strings remain plain programme text', () => {
    const ctx = context();
    const description = '<img src=x onerror="alert(1)"> & TV text\nSecond line';
    entry(ctx).cache.events[0].description = description;
    assert.equal(read(ctx).channels[0].events[0].description, description);
});

test('EPG disabled, inactive channels and unavailable managers never expose programmes', () => {
    const disabled = read(context([service(2), service(1)], { enabled: false }));
    assert.equal(disabled.status, 'disabled');
    assert.deepEqual(disabled.channels.map(row => row.number), [1, 2]);
    assert.ok(disabled.channels.every(row => row.status === 'disabled' && row.events.length === 0));
    const inactive = read(context([service(1, { available: false })])).channels[0];
    assert.equal(inactive.status, 'inactive');
    assert.equal(inactive.available, false);
    assert.deepEqual(inactive.events, []);
    const unavailable = read(context([service()], { running: false, refreshing: true }));
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(unavailable.refreshing, false);
    assert.equal(unavailable.total, 0);
    assert.deepEqual(unavailable.channels, []);
    const missingList = read(context([service()], { listView: '' }));
    assert.equal(missingList.status, 'notConfigured');
    assert.deepEqual(missingList.channels, []);
    assert.equal(read(context([])).status, 'empty');
});

test('expired programmes disappear at the cache-age boundary while their last update remains visible', () => {
    const ctx = context();
    entry(ctx).cache.fetchedAt = NOW - MAX_CACHE_AGE;
    assert.equal(read(ctx).channels[0].events.length, 4);
    entry(ctx).cache.fetchedAt--;
    const result = read(ctx);
    assert.equal(result.status, 'stale');
    assert.equal(result.channels[0].status, 'stale');
    assert.equal(result.channels[0].lastUpdate, NOW - MAX_CACHE_AGE - 1);
    assert.deepEqual(result.channels[0].events, []);
});

test('a temporary TV error preserves usable cache data and does not expose URLs in error summaries', () => {
    const ctx = context([service()], { connected: false, status: 'error' });
    entry(ctx).error = { code: 'NETWORK', message: 'Failed http://username:password@fixture.invalid/private?token=hidden' };
    const row = read(ctx).channels[0];
    assert.equal(row.status, 'cached');
    assert.equal(row.events.length, 4);
    assert.equal(row.lastError, 'NETWORK: Failed [URL]');
    entry(ctx).cache = null;
    assert.equal(read(ctx).channels[0].status, 'error');
    entry(ctx).error = { code: 'EPG_TV_UNSUPPORTED', message: 'Unknown DVB identity' };
    assert.equal(read(ctx).channels[0].status, 'unsupported');
});

test('obsolete, uninitialized, mismatched and external caches never leak into another service or list', () => {
    const mutations = [
        value => { value.identity = 'previous identity'; },
        value => { value.initialized = false; },
        value => { value.obsolete = true; },
        value => { value.service = { ...value.service, mediaItemUuid: 'different service' }; },
        value => { value.service = { ...value.service, listView: 'different list' }; },
        value => { value.cache.identity = 'previous identity'; },
        value => { value.cache.source = 'xmltv'; },
        value => { value.cache.schemaVersion = 1; },
        value => { value.cache.fetchedAt = NOW + 300001; },
    ];
    for (const mutate of mutations) {
        const ctx = context();
        mutate(entry(ctx));
        const row = read(ctx).channels[0];
        assert.equal(row.status, 'waiting');
        assert.equal(row.lastUpdate, 0);
        assert.deepEqual(row.events, []);
    }
    const denied = read(context([service()], { validEntry: () => false })).channels[0];
    assert.deepEqual(denied.events, []);
});

test('invalid cached times or estimated ends do not become a displayed programme schedule', () => {
    for (const change of [{ end: NOW - HOUR }, { end: undefined }, { endEstimated: true }, { title: '' }]) {
        const ctx = context();
        Object.assign(entry(ctx).cache.events[0], change);
        const row = read(ctx).channels[0];
        assert.equal(row.status, 'error');
        assert.match(row.lastError, /^EPG_GUIDE_DATA:/u);
        assert.deepEqual(row.events, []);
    }
});

test('catalog revision rejects pages after a channel move, rename, replacement, removal or list change', () => {
    for (const change of [
        ctx => { ctx.services.get(service(1).id).number = 9; },
        ctx => { ctx.services.get(service(1).id).name = 'Renamed'; },
        ctx => { ctx.services.get(service(1).id).mediaItemUuid = 'replacement'; },
        ctx => { ctx.services.delete(service(1).id); },
        ctx => { ctx.listView = 'another list'; },
    ]) {
        const ctx = context([service(1), service(2)]);
        const first = read(ctx, { limit: 1 });
        change(ctx);
        assert.throws(() => read(ctx, { offset: 1, limit: 1, catalogRevision: first.catalogRevision }), code('EPG_GUIDE_CHANGED'));
    }
    assert.throws(() => read(context(), { listView: 'not-the-saved-list' }), code('EPG_GUIDE_CHANGED'));
});

test('periodic EPG updates and Map order do not invalidate a catalog pagination token', () => {
    const ctx = context([service(1), service(2)]);
    const first = read(ctx, { limit: 1 });
    entry(ctx, 2).cache.events[0].description = 'New TV description';
    entry(ctx, 2).cache.fetchedAt = NOW + 1;
    ctx.services = new Map([...ctx.services].reverse());
    const second = read(ctx, { offset: 1, limit: 1, catalogRevision: first.catalogRevision });
    assert.equal(second.catalogRevision, first.catalogRevision);
    assert.equal(second.channels[0].number, 2);
    assert.equal(second.channels[0].events[0].description, 'New TV description');
});

test('manager guide snapshots active or completed progress and invokes no TV, database or state operations', () => {
    const ctx = context();
    let forbiddenCalls = 0;
    const forbidden = () => { forbiddenCalls++; throw new Error('A guide request must only read RAM'); };
    const adapter = { namespace: 'loewe-tv.4', getStateAsync: forbidden, setStateAsync: forbidden,
        getObjectAsync: forbidden, getStatesAsync: forbidden, setTimeout: forbidden };
    const runtime = { adapter, config: { channelListView: ctx.listView, epgEnabled: true }, stopping: false,
        channelObjects: { services: ctx.services, catalog: { view: ctx.listView, name: 'ASTRA LCN' } },
        _connected: false, _lastValues: new Map([
            ['channels.epgStatus', 'ready'], ['channels.epgLastUpdate', NOW], ['channels.epgLastError', ''],
            ['channels.epgProgress', JSON.stringify({ total: 1, completed: 1, successful: 1, failed: 0 })],
        ]), _call: forbidden, _readState: forbidden, _database: forbidden, _writeChanged: forbidden };
    const manager = new EpgManager(runtime, { now: () => NOW, tvSource: { read: forbidden, reset: forbidden } });
    manager.entries = ctx.entries;
    assert.equal(manager.guide().status, 'unavailable');
    manager.started = true;
    const completed = manager.guide();
    assert.equal(completed.instance, 'loewe-tv.4');
    assert.equal(completed.listName, 'ASTRA LCN');
    assert.equal(completed.connected, false);
    assert.equal(completed.channels.length, 1);
    assert.deepEqual(completed.progress, { completed: 1, total: 1, successful: 1, failed: 0 });
    manager._fetchPromise = Promise.resolve();
    manager._cycle = { completed: 12, total: 30, successful: 10, failed: 2, entries: [] };
    const updating = manager.guide();
    assert.equal(updating.status, 'updating');
    assert.equal(updating.refreshing, true);
    assert.deepEqual(updating.progress, { completed: 12, total: 30, successful: 10, failed: 2 });
    manager._fetchPromise = null;
    assert.equal(manager.guide().refreshing, true, 'A cycle remains active while waiting for its next batch');
    runtime.channelObjects.catalog.view = 'old-list';
    assert.equal(manager.guide().listName, '');
    runtime.stopping = true;
    assert.deepEqual(manager.guide().channels, []);
    assert.equal(forbiddenCalls, 0);
});

test('manager pagination and refresh tokens change when the configured TV host or port changes', () => {
    const ctx = context();
    const runtime = {
        adapter: { namespace: 'loewe-tv.0' }, config: { host: 'first-tv.invalid', port: 905,
            channelListView: ctx.listView, epgEnabled: true }, stopping: false,
        channelObjects: { services: ctx.services }, _lastValues: new Map(),
    };
    const manager = new EpgManager(runtime, { now: () => NOW, tvSource: {} });
    manager.started = true;
    manager.entries = ctx.entries;
    const first = manager.guide();
    runtime.config.host = 'second-tv.invalid';
    assert.throws(() => manager.guide({ catalogRevision: first.catalogRevision }), code('EPG_GUIDE_CHANGED'));
    const second = manager.guide();
    runtime.config.port = 906;
    assert.throws(() => manager.guide({ catalogRevision: second.catalogRevision }), code('EPG_GUIDE_CHANGED'));
    assert.equal(JSON.stringify(first).includes('first-tv.invalid'), false, 'The TV address need not be exposed by the view token');
});
