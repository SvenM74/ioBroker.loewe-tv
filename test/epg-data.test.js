'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DAY, MAX_EVENTS, MAX_CACHE_BYTES, MIN_CACHE_BYTES, normalizeEvents, selectNowNext,
    createCache, restoreCache } = require('../lib/epg-data');

const NOW = Date.parse('2026-10-17T22:30:00Z');
const MINUTE = 60000;
const SERVICE = { id: 'channels.tv.Das_Erste_HD', itemClass: 'video', name: 'Das Erste HD',
    listView: 'fastscan-test', mediaItemUuid: 'chl0:00-00080001ffff03fb283d', number: 1 };

function event(title, start, end, extra = {}) {
    return { eventId: title, title, subtitle: '', description: '', start: NOW + start,
        end: end === null ? null : NOW + end, ...extra };
}

function choose(events, now = NOW) { return selectNowNext(normalizeEvents(events, now), now); }
function cache(events = [], source = 'tv', now = NOW, limit) {
    return createCache(SERVICE, { source, events }, now, limit);
}
function restore(value, service = SERVICE, now = NOW) {
    return restoreCache(JSON.stringify(value), service, now);
}

test('start is inclusive, end is exclusive, and an expired programme never remains current', () => {
    const previous = event('Davor', -2 * MINUTE, 0);
    const current = event('Jetzt', 0, MINUTE);
    const next = event('Danach', MINUTE, 2 * MINUTE);
    const selected = choose([next, previous, current]);
    assert.equal(selected.now.title, 'Jetzt');
    assert.equal(selected.next.title, 'Danach');
    assert.equal(selected.ambiguous, false);
    assert.deepEqual(normalizeEvents([previous], NOW), []);
    const after = choose([current, next], NOW + MINUTE);
    assert.equal(after.now.title, 'Danach');
    assert.equal(after.next, null);
});

test('an unknown end is useful as next but never proves a currently running programme', () => {
    const unknown = event('Unbekanntes Ende', -MINUTE, null);
    const future = event('Nächste Sendung', MINUTE, null);
    const selected = choose([unknown, future]);
    assert.equal(selected.now, null);
    assert.equal(selected.next.title, 'Nächste Sendung');
    assert.equal(selected.next.end, null);
    assert.equal(selected.ambiguous, false);
    assert.equal(choose([unknown, future], NOW + MINUTE).now, null);
    assert.equal(choose([unknown, future], NOW + MINUTE).next, null);
});

test('all overlapping current ends constrain next, even when current itself is ambiguous', () => {
    const first = event('A', -10 * MINUTE, 120 * MINUTE);
    const second = event('B', -5 * MINUTE, 60 * MINUTE);
    const inside = choose([first, second, event('Überlappt beide', 5 * MINUTE, 30 * MINUTE)]);
    assert.deepEqual(inside, { now: null, next: null, ambiguous: true });
    const after = choose([first, second, event('Danach', 120 * MINUTE, 150 * MINUTE)]);
    assert.equal(after.now, null);
    assert.equal(after.next.title, 'Danach');
    assert.equal(after.ambiguous, true);
});

test('a later or same-start unknown-end entry prevents false certainty about current', () => {
    const first = event('Bekanntes Ende', -10 * MINUTE, 20 * MINUTE);
    const future = event('Danach', 25 * MINUTE, 30 * MINUTE);
    for (const start of [-5 * MINUTE, -10 * MINUTE]) {
        const selected = choose([first, event('Mögliche Ablösung', start, null), future]);
        assert.equal(selected.now, null);
        assert.equal(selected.next.title, 'Danach');
        assert.equal(selected.ambiguous, true);
    }
    const old = choose([first, event('Älter', -11 * MINUTE, null), future]);
    assert.equal(old.now.title, 'Bekanntes Ende');
    assert.equal(old.ambiguous, false);
});

test('identical earliest future starts are never arbitrarily resolved to one programme', () => {
    const selected = choose([event('Jetzt', -MINUTE, MINUTE),
        event('Alternative 1', MINUTE, 2 * MINUTE), event('Alternative 2', MINUTE, 3 * MINUTE)]);
    assert.equal(selected.now.title, 'Jetzt');
    assert.equal(selected.next, null);
    assert.equal(selected.ambiguous, true);
});

test('a future programme overlapping the sole current event is not advertised as next', () => {
    const selected = choose([event('Jetzt', -MINUTE, 2 * MINUTE), event('Überlappt', MINUTE, 3 * MINUTE)]);
    assert.equal(selected.now.title, 'Jetzt');
    assert.equal(selected.next, null);
    assert.equal(selected.ambiguous, true);
});

test('a schedule gap remains empty now while a future programme can still be shown', () => {
    const selected = choose([event('Abgelaufen', -5 * MINUTE, -MINUTE), event('Später', MINUTE, null)]);
    assert.equal(selected.now, null);
    assert.equal(selected.next.title, 'Später');
    assert.equal(selected.ambiguous, false);
});

test('estimated ends are rejected and legacy false flags are removed from normalized data', () => {
    const confirmed = event('Jetzt', -MINUTE, MINUTE, { endEstimated: false });
    const events = normalizeEvents([confirmed, confirmed], NOW);
    assert.equal(events.length, 1);
    assert.equal(Object.hasOwn(events[0], 'endEstimated'), false);
    assert.equal(Object.hasOwn(restore(cache(events)).events[0], 'endEstimated'), false);
    for (const end of [MINUTE, null]) {
        assert.throws(() => normalizeEvents([event('Nur geschätzt', 0, end, { endEstimated: true })], NOW),
            { code: 'EPG_DATA' });
    }
});

test('exact duplicates collapse but different end times remain ambiguous evidence', () => {
    const first = event('Jetzt', -MINUTE, MINUTE);
    assert.equal(normalizeEvents([first, first], NOW).length, 1);
    const selected = choose([first, { ...first, end: NOW + 2 * MINUTE }]);
    assert.equal(selected.now, null);
    assert.equal(selected.ambiguous, true);
});

test('source and cache data reject malformed time values, records, text types and estimated flags', () => {
    const valid = event('Jetzt', -MINUTE, MINUTE);
    const values = [null, [], {}, { ...valid, start: '1792276140000' }, { ...valid, start: 1 },
        { ...valid, start: NaN }, { ...valid, end: NOW - 2 * MINUTE }, { ...valid, end: Infinity },
        { ...valid, endEstimated: 'true' }, { ...valid, endEstimated: null }, { ...valid, title: {} },
        { ...valid, description: [] }];
    for (const value of values) assert.throws(() => normalizeEvents([value], NOW), { code: 'EPG_DATA' });
    assert.throws(() => normalizeEvents(null, NOW), { code: 'EPG_DATA' });
    assert.throws(() => normalizeEvents(Array(2049).fill(valid), NOW), { code: 'EPG_DATA' });
    assert.throws(() => normalizeEvents([valid], NaN), { code: 'EPG_DATA' });
});

test('text limits remove control characters and do not split Unicode surrogate pairs', () => {
    const value = event('placeholder', -MINUTE, MINUTE, {
        title: ' a\u0000' + '😀'.repeat(300),
        subtitle: 'b' + '😀'.repeat(600), description: 'c' + '😀'.repeat(2200),
        eventId: 'd' + '😀'.repeat(140),
    });
    const [normalized] = normalizeEvents([value], NOW);
    for (const [key, max] of Object.entries({ title: 512, subtitle: 1024, description: 4096, eventId: 256 })) {
        assert.equal(normalized[key].isWellFormed(), true, key);
        assert.ok(normalized[key].length <= max, key);
    }
    assert.equal(normalized.title.startsWith('a😀'), true);
    assert.equal(normalized.title.includes('\u0000'), false);
    assert.equal(normalizeEvents([event(' \u0000 ', 0, MINUTE)], NOW).length, 0);
});

test('expired history, very old unknown ends, and starts outside the two-day horizon are discarded', () => {
    const events = normalizeEvents([event('Alt', -2 * DAY, -DAY), event('Unbekannt alt', -DAY - 1, null),
        event('Zu weit', 2 * DAY + 1, 2 * DAY + MINUTE), event('Grenze', 2 * DAY, 2 * DAY + MINUTE)], NOW);
    assert.deepEqual(events.map(value => value.title), ['Grenze']);
});

test('the 128-event limit removes a complete boundary start group instead of one of its alternatives', () => {
    const current = event('Jetzt', -MINUTE, MINUTE);
    const future = Array.from({ length: 126 }, (_, index) => event(`Später ${index}`,
        (index + 1) * MINUTE, (index + 1.5) * MINUTE));
    const atLimit = [event('Grenze A', 127 * MINUTE, 127.5 * MINUTE),
        event('Grenze B', 127 * MINUTE, 127.5 * MINUTE), event('Weiter', 128 * MINUTE, 128.5 * MINUTE)];
    const events = normalizeEvents([current, ...future, ...atLimit], NOW);
    assert.equal(events.length, 127);
    assert.equal(events.some(value => value.title.startsWith('Grenze')), false);
    assert.equal(selectNowNext(events, NOW).next.title, 'Später 0');
});

test('current overlaps and the earliest future start group cannot be cut to meet the event limit', () => {
    const current = Array.from({ length: MAX_EVENTS + 1 }, (_, index) => event(`Läuft ${index}`, -MINUTE, MINUTE));
    assert.throws(() => normalizeEvents(current, NOW), { code: 'EPG_DATA' });
    const future = Array.from({ length: MAX_EVENTS }, (_, index) => event(`Alternative ${index}`, MINUTE, 2 * MINUTE));
    assert.throws(() => normalizeEvents([event('Jetzt', -MINUTE, MINUTE), ...future], NOW), { code: 'EPG_DATA' });
    const unknown = current.map(value => ({ ...value, end: null }));
    assert.throws(() => normalizeEvents(unknown, NOW), { code: 'EPG_DATA' });
});

test('a future known end cannot cross a truncation boundary and create false certainty on later clock ticks', () => {
    const current = event('Jetzt', -MINUTE, MINUTE);
    const future = Array.from({ length: 140 }, (_, index) => event(`Später ${index}`,
        (index + 1) * MINUTE, (index + 1.5) * MINUTE));
    future[125].end = NOW + 132 * MINUTE;
    const events = normalizeEvents([current, ...future], NOW);
    assert.equal(events.length, 126);
    assert.equal(events.some(value => value.title === 'Später 125'), false);
    const tick = selectNowNext(events, NOW + 130 * MINUTE);
    assert.equal(tick.now, null);
    assert.equal(tick.next, null);
    assert.throws(() => normalizeEvents([{ ...current, end: NOW + 141 * MINUTE }, ...future], NOW), { code: 'EPG_DATA' });
});

test('unknown past history keeps four complete recent start groups and preserves replacement uncertainty', () => {
    const history = Array.from({ length: 8 }, (_, index) => [event(`A ${index}`, (index - 8) * MINUTE, null),
        event(`B ${index}`, (index - 8) * MINUTE, null)]).flat();
    const normalized = normalizeEvents(history, NOW);
    assert.equal(normalized.length, 8);
    assert.equal(new Set(normalized.map(value => value.start)).size, 4);
    const selected = choose([event('Vermeintlich jetzt', -10 * MINUTE, MINUTE), ...history]);
    assert.equal(selected.now, null);
    assert.equal(selected.ambiguous, true);
});

test('a very long current candidate still retains an older unknown-end replacement as conflicting evidence', () => {
    const selected = choose([event('Marathon', -2 * DAY, MINUTE), event('Mögliche Ablösung', -DAY - MINUTE, null)]);
    assert.equal(selected.now, null);
    assert.equal(selected.ambiguous, true);
});

test('TV cache round-trip binds the service and recomputes programme selection', () => {
    const result = cache([event('Jetzt', -MINUTE, MINUTE), event('Danach', MINUTE, 2 * MINUTE)]);
    const restored = restore(result, SERVICE, NOW + MINUTE);
    assert.equal(restored.schemaVersion, 2);
    assert.equal(restored.source, 'tv');
    assert.equal(Object.hasOwn(restored, 'sourceChannelId'), false);
    assert.equal(Object.hasOwn(restored, 'fingerprint'), false);
    assert.equal(restored.fetchedAt, NOW);
    assert.equal(selectNowNext(restored.events, NOW + MINUTE).now.title, 'Danach');
    assert.ok(restore(result, { ...SERVICE, name: 'Umbenannt', number: 50 }));
});

test('changed list, media type or service identity invalidates persisted data', () => {
    const value = cache();
    for (const service of [{ ...SERVICE, listView: 'other-list' }, { ...SERVICE, mediaItemUuid: 'other-service' },
        { ...SERVICE, itemClass: 'audio' }]) assert.equal(restore(value, service), null);
});

test('legacy TV caches migrate without external configuration metadata or estimated flags', () => {
    const legacy = { ...cache([event('Jetzt', -MINUTE, MINUTE)]), schemaVersion: 1,
        fingerprint: 'old-external-config-fingerprint', sourceChannelId: 'obsolete-source-id' };
    legacy.events[0].endEstimated = false;
    const restored = restore(legacy);
    assert.equal(restored.schemaVersion, 2);
    assert.equal(restored.source, 'tv');
    assert.equal(restored.events[0].title, 'Jetzt');
    assert.equal(Object.hasOwn(restored, 'fingerprint'), false);
    assert.equal(Object.hasOwn(restored, 'sourceChannelId'), false);
    assert.equal(Object.hasOwn(restored.events[0], 'endEstimated'), false);
    assert.equal(restored.fetchedAt, NOW);
});

test('external, missing-origin and estimated legacy caches never become TV programmes', () => {
    for (const schemaVersion of [1, 2]) {
        const value = { ...cache([event('Extern', -MINUTE, MINUTE)]), schemaVersion };
        for (const source of ['xmltv', 'auto', '', 'TV', undefined, null, {}]) {
            assert.equal(restore({ ...value, source }), null);
        }
        for (const endEstimated of [true, 'false', null]) {
            assert.equal(restore({ ...value, events: [{ ...value.events[0], endEstimated }] }), null);
        }
    }
    for (const source of ['xmltv', undefined, null, 'auto']) {
        assert.throws(() => createCache(SERVICE, { source, events: [] }, NOW), { code: 'EPG_DATA' });
    }
});

test('cache age is limited to 24 hours and future timestamps allow only the documented small clock skew', () => {
    const value = cache();
    assert.ok(restore(value, SERVICE, NOW + DAY));
    assert.equal(restore(value, SERVICE, NOW + DAY + 1), null);
    assert.ok(restore({ ...value, fetchedAt: NOW + 300000 }));
    assert.equal(restore({ ...value, fetchedAt: NOW + 300001 }), null);
    for (const fetchedAt of ['1792276200000', null, true, 0, 4102444800000]) {
        assert.equal(restore({ ...value, fetchedAt }), null);
    }
});

test('malformed, oversized, wrong-version and untrusted cache values are rejected without throwing', () => {
    const value = cache([event('Jetzt', -MINUTE, MINUTE)]);
    for (const raw of ['', '{', 'null', '[]', '{}', 'x'.repeat(MAX_CACHE_BYTES + 1), 0, null, {}]) {
        assert.equal(restoreCache(raw, SERVICE, NOW), null);
    }
    for (const changed of [{ ...value, schemaVersion: 3 }, { ...value, source: 'remote' },
        { ...value, events: null }, { ...value, events: Array(2049).fill(null) },
        { ...value, events: [{ ...value.events[0], end: NOW - MINUTE }] },
        { ...value, events: [{ ...value.events[0], endEstimated: 'false' }] }]) assert.equal(restore(changed), null);
    assert.equal(restore(value, {}), null);
    assert.equal(restore(value, SERVICE, NaN), null);
});

test('an untrusted cache cannot use normalization limits to make overlapping current events seem unique', () => {
    const value = cache();
    value.events = Array.from({ length: MAX_EVENTS + 1 }, (_, index) => event(`Läuft ${index}`, -MINUTE, MINUTE));
    assert.ok(Buffer.byteLength(JSON.stringify(value)) < MAX_CACHE_BYTES);
    assert.equal(restore(value), null);
});

test('a smaller per-channel byte budget preserves current and next, trims metadata, and observes UTF-8 byte size', () => {
    const events = [event('Jetzt', -MINUTE, MINUTE), ...Array.from({ length: 30 }, (_, index) => event(`Später ${index}`,
        (index + 1) * MINUTE, (index + 2) * MINUTE))].map(value => ({ ...value,
        description: 'Beschreibung 😀'.repeat(400), subtitle: 'Folge 😀'.repeat(200) }));
    const result = cache(events, 'tv', NOW, MIN_CACHE_BYTES);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= MIN_CACHE_BYTES);
    const selected = selectNowNext(result.events, NOW);
    assert.equal(selected.now.title, 'Jetzt');
    assert.equal(selected.next.title, 'Später 0');
    assert.ok(result.events.length < events.length);
    for (const value of result.events) {
        assert.equal(value.description.isWellFormed(), true);
        assert.equal(value.subtitle.isWellFormed(), true);
    }
});

test('byte truncation retains every alternative of the earliest future start group', () => {
    const heavy = index => ({ eventId: `${index}` + '😀'.repeat(127), title: `${index}` + '😀'.repeat(255),
        description: '😀'.repeat(2048), subtitle: '😀'.repeat(512) });
    const events = [event('Jetzt', -MINUTE, MINUTE, heavy(0)),
        ...Array.from({ length: 3 }, (_, index) => event(`Alternative ${index}`, MINUTE, 2 * MINUTE, heavy(index + 1))),
        ...Array.from({ length: 10 }, (_, index) => event(`Später ${index}`, (index + 2) * MINUTE,
            (index + 3) * MINUTE, heavy(index + 10)))];
    const result = cache(events, 'tv', NOW, MIN_CACHE_BYTES);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= MIN_CACHE_BYTES);
    assert.equal(result.events.filter(value => value.start === NOW + MINUTE).length, 3);
    assert.equal(selectNowNext(result.events, NOW).next, null);
    assert.equal(selectNowNext(result.events, NOW).ambiguous, true);
});

test('an impossible byte budget fails rather than discarding current overlaps or next alternatives', () => {
    const heavy = Array.from({ length: 8 }, (_, index) => event(`Läuft ${index}`, -MINUTE, MINUTE,
        { eventId: `${index}` + '😀'.repeat(127), title: `${index}` + '😀'.repeat(255) }));
    assert.throws(() => cache(heavy, 'tv', NOW, MIN_CACHE_BYTES), { code: 'EPG_DATA' });
    const future = heavy.map(value => ({ ...value, start: NOW + MINUTE, end: NOW + 2 * MINUTE }));
    assert.throws(() => cache(future, 'tv', NOW, MIN_CACHE_BYTES), { code: 'EPG_DATA' });
});

test('invalid cache budgets, timestamps and sources fail explicitly', () => {
    for (const limit of [0, MIN_CACHE_BYTES - 1, MIN_CACHE_BYTES + 0.5, MAX_CACHE_BYTES + 1, Infinity, NaN]) {
        assert.throws(() => cache([], 'tv', NOW, limit), { code: 'EPG_DATA' });
    }
    assert.throws(() => cache([], 'other'), { code: 'EPG_DATA' });
    assert.throws(() => cache([], 'tv', NaN), { code: 'EPG_DATA' });
});
