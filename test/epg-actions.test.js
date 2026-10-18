'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEpgGuide, resolveEpgProgramme } = require('../lib/epg-guide');
const { createCache, MAX_CACHE_AGE } = require('../lib/epg-data');
const { serviceIdentity } = require('../lib/channel-catalog');

const NOW = Date.UTC(2026, 9, 18, 12);
const HOUR = 3600000;

function fixture(extra = {}) {
    const service = { id: 'channels.tv.Das_Erste_HD', name: 'Das Erste HD', number: 1,
        itemClass: 'video', mediaItemUuid: 'chl0:00-00080001ffff03fb283d',
        locator: 'channel://1:ch-first:sl-selected', listView: 'fastscan-selected', available: true };
    const event = { eventId: 'event-fixture', title: 'Testsendung', subtitle: '', description: '',
        start: NOW, end: NOW + HOUR, ...extra };
    const context = { now: NOW, running: true, enabled: true, connected: false,
        instance: 'loewe-tv.3', deviceKey: 'saved-tv', listView: service.listView,
        services: new Map([[service.id, service]]), entries: new Map([[service.id, {
            service, identity: serviceIdentity(service), initialized: true, obsolete: false,
            cache: createCache(service, { source: 'tv', events: [event] }, NOW),
        }]]) };
    const reference = { channelId: service.id, eventId: event.eventId, start: event.start, end: event.end,
        listView: service.listView, catalogRevision: createEpgGuide(context).catalogRevision };
    return { context, reference, service, event, entry: context.entries.get(service.id) };
}

test('programme actions use the server clock and exact start/end boundaries', () => {
    const { context, reference } = fixture();
    for (const [now, timing] of [[NOW - 1, 'future'], [NOW, 'current'], [NOW + HOUR - 1, 'current'], [NOW + HOUR, 'ended']]) {
        context.now = now;
        assert.equal(resolveEpgProgramme(context, reference).timing, timing);
    }
});

test('offline guide references resolve without network access or invented programme fields', () => {
    const { context, reference, event } = fixture();
    const selected = resolveEpgProgramme(context, reference);
    assert.equal(selected.programme.title, event.title);
    assert.deepEqual(selected.selection, reference);
    assert.deepEqual(selected.channel, { id: reference.channelId, name: 'Das Erste HD', number: 1 });
    assert.equal(Object.hasOwn(selected.channel, 'locator'), false);
    assert.equal(Object.hasOwn(selected, 'deviceKey'), false);
});

test('an unknown end never becomes a currently-running or recordable programme', () => {
    const { context, reference } = fixture({ end: null });
    assert.equal(resolveEpgProgramme(context, reference).timing, 'unknown');
});

test('missing optional event IDs work only when the time reference has a unique match', () => {
    const { context, reference, entry } = fixture({ eventId: '' });
    assert.equal(resolveEpgProgramme(context, reference).timing, 'current');
    entry.cache.events.push({ ...entry.cache.events[0], title: 'Widersprüchliche Sendung' });
    assert.throws(() => resolveEpgProgramme(context, reference), { code: 'EPG_PROGRAMME_CHANGED' });
});

test('the browser cannot supply a TV address, channel locator, title, mode or free recording times', () => {
    const { context, reference } = fixture();
    for (const query of [null, [], {}, { ...reference, host: 'other-tv' }, { ...reference, locator: 'channel://9:other:list' },
        { ...reference, title: 'Injected title' }, { ...reference, itemClass: 'audio' },
        { ...reference, channelId: 'channels.radio.Test' }, { ...reference, start: String(NOW) },
        { ...reference, end: NOW }, { ...reference, confirmed: 'true' }, { ...reference, catalogRevision: '' },
        { ...reference, eventId: 'x'.repeat(257) }]) {
        assert.throws(() => resolveEpgProgramme(context, query), { code: 'EPG_ACTION_VALIDATION' });
    }
    for (const query of [{ ...reference, start: NOW + 1000 }, { ...reference, end: NOW + HOUR + 1000 },
        { ...reference, eventId: 'different-event' }]) {
        assert.throws(() => resolveEpgProgramme(context, query), { code: 'EPG_PROGRAMME_CHANGED' });
    }
});

test('TV, list, channel position and service replacement invalidate an old browser reference', () => {
    for (const change of [ctx => { ctx.deviceKey = 'other-tv'; }, ctx => { ctx.listView = 'other-list'; },
        ctx => { ctx.services.values().next().value.number = 9; },
        ctx => { ctx.services.values().next().value.mediaItemUuid = 'different-service'; }]) {
        const { context, reference } = fixture();
        change(context);
        assert.throws(() => resolveEpgProgramme(context, reference), { code: 'EPG_GUIDE_CHANGED' });
    }
});

test('programme replacement, stale caches, external sources and disabled EPG cannot authorize a command', () => {
    for (const change of [ctx => { ctx.enabled = false; },
        (ctx, entry) => { entry.cache.fetchedAt = NOW - MAX_CACHE_AGE - 1; },
        (ctx, entry) => { entry.cache.source = 'xmltv'; },
        (ctx, entry) => { entry.initialized = false; },
        (ctx, entry) => { entry.obsolete = true; },
        (ctx, entry) => { entry.cache.identity = 'other-service'; }]) {
        const { context, reference, entry } = fixture();
        change(context, entry);
        assert.throws(() => resolveEpgProgramme(context, reference), { code: 'EPG_PROGRAMME_UNAVAILABLE' });
    }
    const { context, reference, entry } = fixture();
    entry.cache.events[0].end += 60000;
    assert.throws(() => resolveEpgProgramme(context, reference), { code: 'EPG_PROGRAMME_CHANGED' });
});

test('overlapping programmes and an unknown replacement cannot authorize watching or recording', () => {
    for (const end of [NOW + HOUR, null]) {
        const { context, reference, entry } = fixture();
        context.now = NOW + 1800000;
        entry.cache.events.push({ ...entry.cache.events[0], eventId: 'conflicting-event', start: NOW + 1000, end });
        assert.throws(() => resolveEpgProgramme(context, reference), { code: 'EPG_PROGRAMME_UNAVAILABLE' });
        context.now = NOW - 60000;
        assert.throws(() => resolveEpgProgramme(context, reference), { code: 'EPG_PROGRAMME_UNAVAILABLE' });
    }
});
