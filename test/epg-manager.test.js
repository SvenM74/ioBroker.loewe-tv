'use strict';

// Exercise the manager with the real runtime queue and database wrapper. Only
// the TV, ioBroker database and adapter timers are simulated; no device is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { AdapterRuntime, normalizeConfig } = require('../lib/adapter-runtime');
const { BATCH_SIZE } = require('../lib/epg-manager');
const { createEpgDefinitions, OBSOLETE_EPG_CHILD_TYPES } = require('../lib/epg-states');
const { createCache, MAX_CACHE_AGE } = require('../lib/epg-data');

const NOW = Date.UTC(2026, 9, 17, 12);
const MINUTE = 60000;

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function error(code, message = 'Simulated source failure') {
    return Object.assign(new Error(message), { code });
}

function service(number = 1, extra = {}) {
    return {
        id: `channels.tv.Sender_${number}`, name: `Sender ${number}`, number,
        caption: String(number), itemClass: 'video', listView: 'fixture-list',
        mediaItemUuid: `fixture-service-${number}`,
        locator: `channel://${number}:ch-fixture-${number}:sl-fixture`,
        positions: [{ caption: String(number), locator: `channel://${number}:ch-fixture-${number}:sl-fixture` }],
        available: true, ...extra,
    };
}

function programme(title, start, end, extra = {}) {
    return { eventId: `event-${title}`, title, subtitle: `${title} subtitle`,
        description: `${title} description`, start, end, ...extra };
}

function programmes(prefix = 'TV', time = NOW) {
    return [
        programme(`${prefix} current`, time - MINUTE, time + MINUTE),
        programme(`${prefix} next`, time + MINUTE, time + 2 * MINUTE),
        programme(`${prefix} later`, time + 2 * MINUTE, time + 3 * MINUTE),
    ];
}

function tvResult(events = programmes()) {
    return { source: 'tv', events };
}

class FakeAdapter {
    constructor(config) {
        this.namespace = 'loewe-tv.0';
        this.config = config;
        this.objects = new Map();
        this.states = new Map();
        this.writes = [];
        this.completedWrites = [];
        this.timers = new Map();
        this.nextTimer = 1;
        this.beforeWrite = null;
        this.logs = [];
        this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level =>
            [level, message => this.logs.push({ level, message })]));
    }

    async setStateAsync(id, state) {
        const value = structuredClone(state);
        this.writes.push({ id, ...value });
        if (this.beforeWrite) await this.beforeWrite(id, value);
        this.states.set(id, value);
        this.completedWrites.push({ id, ...value });
    }

    async getStateAsync(id) { return this.states.get(id) || null; }
    async getObjectAsync(id) { return this.objects.get(id) || null; }

    setTimeout(fn, ms) {
        const handle = this.nextTimer++;
        this.timers.set(handle, { fn, ms });
        return handle;
    }

    clearTimeout(handle) { this.timers.delete(handle); }

    fire(handle) {
        const timer = this.timers.get(handle);
        assert.ok(timer, 'Expected the manager to schedule this timer');
        this.timers.delete(handle);
        timer.fn();
    }
}

async function harness(t, options = {}) {
    let time = options.now ?? NOW;
    const config = normalizeConfig({ host: 'fixture.invalid', channelListView: 'fixture-list',
        pollInterval: 0, channelRefreshInterval: 0, epgRefreshInterval: 0,
        ...options.config });
    Object.assign(config, options.injectedConfig);
    const adapter = new FakeAdapter(config);
    for (const [id, val] of options.saved || []) adapter.states.set(id, { val, ack: true });
    const calls = { tv: [], requests: [], reset: 0 };
    const source = options.tvSource || {
        reset() { calls.reset++; },
        async read(selected, settings) {
            calls.tv.push({ service: selected, settings });
            return options.readTv ? options.readTv(selected, settings) : tvResult();
        },
    };
    const runtime = new AdapterRuntime(adapter, { epgOptions: {
        now: () => time, tvSource: source, ...options.epgOptions,
    } });
    runtime.config = config;
    runtime.client = options.client === null ? null : options.client || {
        async request(action, parameters, settings) {
            calls.requests.push({ action, parameters, settings });
            return options.request ? options.request(action, parameters, settings) : { action };
        },
        close() {},
    };
    runtime._connected = true;
    const manager = runtime.epg;
    t.after(() => { manager.stop(); runtime.stopping = true; });

    function register(services) {
        for (const selected of services) {
            if (selected.itemClass !== 'video' || selected.listView !== config.channelListView) continue;
            for (const definition of createEpgDefinitions(selected.id)) {
                adapter.objects.set(definition.id, structuredClone(definition));
                runtime._objects.set(definition.id, structuredClone(definition));
            }
        }
    }

    async function catalog(services, { materialize = true } = {}) {
        runtime.channelObjects.services = new Map(services.map(selected => [selected.id, selected]));
        await manager.prepareCatalog(services);
        if (materialize) register(services);
        manager.catalogReady();
        await manager._initialization;
    }

    await manager.start();
    await catalog(options.services || [service()]);
    return { adapter, runtime, manager, calls, catalog, register, config,
        setTime(value) { time = value; },
        value(id, suffix = '') { return adapter.states.get(suffix ? `${id}.${suffix}` : id)?.val; },
        snapshot(id = service().id) { return JSON.parse(adapter.states.get(`${id}.epg.data`).val); },
    };
}

test('EPG defaults expose only enablement and the fifteen-minute refresh interval', () => {
    const config = normalizeConfig({});
    assert.equal(config.epgEnabled, true);
    assert.equal(config.epgRefreshInterval, 900);
    assert.deepEqual(Object.keys(config).filter(key => key.startsWith('epg')).sort(), ['epgEnabled', 'epgRefreshInterval']);
    for (const interval of [0, 300, 86400]) {
        assert.equal(normalizeConfig({ epgRefreshInterval: interval }).epgRefreshInterval, interval);
    }
});

test('obsolete source options are ignored even when their values are invalid', () => {
    for (const legacy of [
        { epgSource: 'xmltv', epgXmltvUrl: 'file:///obsolete.xml', epgXmltvMappings: {} },
        { epgSource: {}, epgXmltvUrl: 42, epgXmltvMappings: [null] },
        { epgSource: 'unknown', epgXmltvUrl: 'not a URL', epgXmltvMappings: null },
    ]) {
        const config = normalizeConfig({ ...legacy, epgEnabled: false, epgRefreshInterval: 300 });
        assert.equal(config.epgEnabled, false);
        assert.equal(config.epgRefreshInterval, 300);
        assert.deepEqual(Object.keys(config).filter(key => key.startsWith('epg')).sort(), ['epgEnabled', 'epgRefreshInterval']);
    }
});

test('EPG configuration still rejects invalid enablement and refresh intervals', () => {
    for (const config of [
        { epgEnabled: 'true' }, { epgRefreshInterval: 299 }, { epgRefreshInterval: -1 },
        { epgRefreshInterval: 86401 }, { epgRefreshInterval: 300.5 },
    ]) assert.throws(() => normalizeConfig(config), { code: 'VALIDATION' });
});

test('complete TV programmes publish useful per-channel fields and a final consistent snapshot', async t => {
    const h = await harness(t);
    const id = service().id;
    const begin = h.adapter.completedWrites.length;
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.value(id, 'epg.now.title'), 'TV current');
    assert.equal(h.value(id, 'epg.next.title'), 'TV next');
    assert.equal(h.value(id, 'epg.now.start'), NOW - MINUTE);
    assert.equal(h.value(id, 'epg.next.end'), NOW + 2 * MINUTE);
    assert.equal(h.value(id, 'epg.now.available'), true);
    const snapshot = h.snapshot();
    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(Object.hasOwn(snapshot, 'source'), false);
    assert.equal(Object.hasOwn(snapshot, 'sourceChannelId'), false);
    assert.equal(Object.hasOwn(snapshot.now, 'endEstimated'), false);
    assert.equal(Object.hasOwn(snapshot.next, 'endEstimated'), false);
    assert.equal(snapshot.now.eventId, 'event-TV current');
    assert.equal(snapshot.lastUpdate, NOW);
    const writes = h.adapter.completedWrites.slice(begin).filter(write => write.id.startsWith(`${id}.epg.`));
    assert.equal(writes.at(-1).id, `${id}.epg.data`);
    assert.equal(h.value('channels.epgStatus'), 'ready');
    assert.equal(h.value('channels.epgLastUpdate'), NOW);
});

test('a manual EPG refresh recovers from a single cache initialization failure without refreshing the channel list', async t => {
    const h = await harness(t, { services: [] });
    const getState = h.adapter.getStateAsync.bind(h.adapter);
    let failed = false;
    h.adapter.getStateAsync = async id => {
        if (!failed && id.endsWith('.epg.cache')) {
            failed = true;
            throw error('DATABASE', 'One temporary cache read failed');
        }
        return getState(id);
    };
    await assert.rejects(h.catalog([service(1), service(2)]), { code: 'DATABASE' });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.manager._fetchTimer, null, 'Manual-only configuration must stay manual after an initialization error');
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 2);
    assert.equal(h.snapshot(service(1).id).now.title, 'TV current');
    assert.equal(h.snapshot(service(2).id).next.title, 'TV next');
    assert.equal(h.value('channels.epgStatus'), 'ready');
    assert.equal(h.value('channels.epgLastError'), '');
    assert.ok([...h.manager.entries.values()].every(entry => entry.initialized && entry.attempted));
});

test('automatic EPG initialization retries with a delay and recovers when the database returns', async t => {
    const h = await harness(t, { services: [], config: { epgRefreshInterval: 900 } });
    const getState = h.adapter.getStateAsync.bind(h.adapter);
    let unavailable = true;
    let reads = 0;
    h.adapter.getStateAsync = async id => {
        if (id.endsWith('.epg.cache')) {
            reads++;
            if (unavailable) throw error('DATABASE', 'Database temporarily unavailable');
        }
        return getState(id);
    };
    await assert.rejects(h.catalog([service()]), { code: 'DATABASE' });
    await nextTurn();
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 30000);
    h.adapter.fire(h.manager._fetchTimer);
    await h.manager._fetchPromise;
    assert.equal(reads, 2, 'One retry per refresh, with no immediate retry loop');
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.value('channels.epgStatus'), 'error');
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 30000);
    unavailable = false;
    h.adapter.fire(h.manager._fetchTimer);
    await h.manager._fetchPromise;
    assert.equal(reads, 3);
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.snapshot().now.title, 'TV current');
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 900000);
});

test('EPG initialization retries after a temporary first publication failure', async t => {
    const h = await harness(t, { services: [] });
    let failed = false;
    h.adapter.beforeWrite = async id => {
        if (!failed && id.endsWith('.epg.data')) {
            failed = true;
            throw error('DATABASE', 'One snapshot write failed');
        }
    };
    await assert.rejects(h.catalog([service(1), service(2)]), { code: 'DATABASE' });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 2);
    assert.equal(h.snapshot(service(1).id).next.title, 'TV next');
    assert.equal(h.snapshot(service(2).id).next.title, 'TV next');
});

test('TV response metadata is retained in the snapshot even when the received EPG is empty', async t => {
    const diagnostic = { schema: 'basic', rows: 0, totalResults: 0, pages: 1,
        firstStartIndex: 0, dvb: { sid: 10301, tsid: 1019, onid: 1 } };
    const h = await harness(t, { readTv: async () => ({ ...tvResult([]), diagnostic }) });
    await h.manager.refresh({ manual: true });
    assert.equal(h.snapshot().status, 'empty');
    assert.deepEqual(h.snapshot().tvDiagnostic, { at: NOW, status: 'received', details: diagnostic });
    diagnostic.rows = 99;
    await h.manager.tick();
    assert.equal(h.snapshot().tvDiagnostic.details.rows, 0, 'Metadata is a copy of the actual attempt');
    assert.equal(JSON.parse(h.value(service().id, 'epg.cache')).tvDiagnostic, undefined, 'Attempt metadata is not a programme cache');
});

test('TV failure diagnostics identify the actual request and skipped channels separately', async t => {
    const diagnostic = { schema: 'extended', phase: 'response', rows: { startIndex: 41 },
        dvb: { sid: 10301, tsid: 1019, onid: 1 } };
    const h = await harness(t, { services: [service(1), service(2)], readTv: async () => {
        throw Object.assign(error('EPG_TV_SCHEMA', 'Unsupported fields'), { epgDiagnostic: diagnostic });
    } });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.deepEqual(h.snapshot(service(1).id).tvDiagnostic,
        { at: NOW, status: 'error', code: 'EPG_TV_SCHEMA', details: diagnostic });
    assert.deepEqual(h.snapshot(service(2).id).tvDiagnostic,
        { at: NOW, status: 'skipped', reason: 'previousFailure', code: 'EPG_TV_SCHEMA', blockedByChannel: service(1).id });
    assert.equal(h.snapshot(service(2).id).tvDiagnostic.details, undefined, 'Do not attribute another station response to this one');
});

test('injected obsolete source configuration and loader hooks cannot replace failed TV requests', async t => {
    let externalCalls = 0;
    const h = await harness(t, {
        injectedConfig: { epgSource: 'xmltv', epgXmltvUrl: 'http://fixture.invalid/guide.xml', epgXmltvMappings: [] },
        epgOptions: { xmltvLoader() { externalCalls++; }, xmltvResolver() { externalCalls++; } },
        readTv: async () => { throw Object.assign(error('SOAP'), { epgDiagnostic: { schema: 'basic', requests: 1 } }); },
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.equal(externalCalls, 0);
    assert.equal(h.snapshot().status, 'error');
    assert.equal(h.snapshot().now, null);
    assert.match(h.snapshot().lastError, /SOAP/u);
    assert.equal(h.snapshot().tvDiagnostic.code, 'SOAP');
});

test('TV attempt diagnostics are bounded and are reset when a channel service is replaced', async t => {
    const h = await harness(t, { readTv: async () => ({ ...tvResult(), diagnostic: { large: 'x'.repeat(9000) } }) });
    await h.manager.refresh({ manual: true });
    assert.deepEqual(h.snapshot().tvDiagnostic.details, { omitted: true, reason: 'size' });
    await h.catalog([service(1, { mediaItemUuid: 'different-service' })]);
    assert.equal(h.snapshot().tvDiagnostic, null);

});

test('injected auto and XMLTV source modes never change complete, partial or empty TV programmes', async t => {
    for (const epgSource of ['auto', 'xmltv', 'tv', 'unknown']) {
        for (const events of [programmes(), programmes().slice(0, 1), []]) {
            let externalCalls = 0;
            const h = await harness(t, {
                injectedConfig: { epgSource, epgXmltvUrl: 'http://fixture.invalid/guide.xml',
                    epgXmltvMappings: [{ channel: service().id, xmltvId: 'other' }] },
                epgOptions: { xmltvLoader() { externalCalls++; }, xmltvResolver() { externalCalls++; } },
                readTv: async () => tvResult(events),
            });
            await h.manager.refresh({ manual: true });
            assert.equal(h.calls.tv.length, 1);
            assert.equal(externalCalls, 0);
            assert.equal(h.snapshot().status, events.length === 3 ? 'ready' : events.length ? 'partial' : 'empty');
            assert.equal(h.snapshot().now?.title ?? null, events.length ? 'TV current' : null);
            assert.equal(h.snapshot().next?.title ?? null, events.length === 3 ? 'TV next' : null);
            assert.equal(h.snapshot().lastError, '');
            assert.deepEqual(JSON.parse(h.value('channels.epgProgress')), { completed: 1, total: 1, successful: 1, failed: 0 });
            h.manager.stop();
        }
    }
});

test('an authoritative empty TV response clears a previously cached schedule', async t => {
    let empty = false;
    const h = await harness(t, { readTv: async () => tvResult(empty ? [] : programmes('Saved TV')) });
    await h.manager.refresh({ manual: true });
    empty = true;
    h.setTime(NOW + 10000);
    await h.manager.refresh({ manual: true });
    assert.equal(h.snapshot().status, 'empty');
    assert.equal(h.snapshot().now, null);
    assert.equal(h.snapshot().next, null);
    assert.equal(h.snapshot().lastUpdate, NOW + 10000);
    assert.equal(h.snapshot().lastError, '');
    assert.deepEqual(JSON.parse(h.value(service().id, 'epg.cache')).events, []);
});

test('legacy external-source options cannot provide programmes when no TV is configured', async t => {
    let externalCalls = 0;
    const h = await harness(t, { client: null,
        config: { epgSource: 'xmltv', epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        epgOptions: { xmltvLoader() { externalCalls++; } },
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(externalCalls, 0);
    assert.equal(h.snapshot().status, 'error');
    assert.equal(h.snapshot().now, null);
    assert.match(h.snapshot().lastError, /EPG_TV_UNAVAILABLE/u);
    assert.deepEqual(h.snapshot().tvDiagnostic,
        { at: NOW, status: 'skipped', reason: 'notConfigured', code: 'EPG_TV_UNAVAILABLE' });
});

test('unsupported TV EPG remains visible with no substitute source', async t => {
    const h = await harness(t, { readTv: async () => { throw error('EPG_TV_UNSUPPORTED'); } });
    await h.manager.refresh({ manual: true });
    assert.equal(h.snapshot().status, 'unsupported');
    assert.equal(h.snapshot().now, null);
});

test('a TV transport failure is limited to one attempt per cycle and the remaining channels are skipped', async t => {
    const h = await harness(t, { services: [service(1), service(2), service(3)],
        readTv: async () => { throw error('NETWORK'); },
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.snapshot(service(3).id).now, null);
    assert.equal(h.snapshot(service(3).id).tvDiagnostic.reason, 'previousFailure');
    assert.equal(h.value('channels.epgStatus'), 'error');
    assert.deepEqual(JSON.parse(h.value('channels.epgProgress')), { completed: 3, total: 3, successful: 0, failed: 3 });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 2, 'A new cycle may retry the TV after a prior failure');
});

test('temporary source errors preserve valid cached programmes and the clock advances them without another request', async t => {
    let unavailable = false;
    const h = await harness(t, { readTv: async () => {
        if (unavailable) throw error('NETWORK', 'Cannot read https://fixture.invalid/guide.xml?token=private-secret');
        return tvResult();
    } });
    await h.manager.refresh({ manual: true });
    unavailable = true;
    await h.manager.refresh({ manual: true });
    assert.equal(h.snapshot().status, 'cached');
    assert.equal(h.snapshot().now.title, 'TV current');
    assert.match(h.snapshot().lastError, /\[URL\]/u);
    assert.doesNotMatch(h.snapshot().lastError + h.value('channels.epgLastError'), /private-secret/u);
    h.setTime(NOW + MINUTE);
    await h.manager.tick();
    assert.equal(h.calls.tv.length, 2);
    assert.equal(h.snapshot().now.title, 'TV next');
    assert.equal(h.snapshot().next.title, 'TV later');
    assert.equal(h.snapshot().lastUpdate, NOW);
    h.setTime(NOW + 3 * MINUTE);
    await h.manager.tick();
    assert.equal(h.snapshot().now, null);
    assert.equal(h.snapshot().next, null);
    assert.equal(h.value(service().id, 'epg.now.available'), false);
    assert.equal(h.value(service().id, 'epg.now.title'), '');
    assert.equal(h.value(service().id, 'epg.now.start'), 0);
});

test('cached guide data is not advertised as current after its maximum age even if an event has not ended', async t => {
    const h = await harness(t, { readTv: async () => tvResult([
        programme('Long event', NOW - MINUTE, NOW + 2 * MAX_CACHE_AGE),
    ]) });
    await h.manager.refresh({ manual: true });
    h.setTime(NOW + MAX_CACHE_AGE + 1);
    await h.manager.tick();
    assert.equal(h.snapshot().status, 'stale');
    assert.equal(h.snapshot().now, null);
    assert.equal(h.snapshot().lastUpdate, NOW);
});

test('saved programmes restore after restart and remain attached to the same service when its channel position changes', async t => {
    const cached = createCache(service(), tvResult(), NOW - 5000);
    const moved = service(1, { number: 42, caption: '42', locator: 'channel://42:ch-fixture-1:sl-fixture',
        positions: [{ caption: '42', locator: 'channel://42:ch-fixture-1:sl-fixture' }] });
    const h = await harness(t, { services: [moved], saved: [[`${moved.id}.epg.cache`, JSON.stringify(cached)]] });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.snapshot().now.title, 'TV current');
    assert.equal(h.snapshot().lastUpdate, NOW - 5000);
    assert.equal(h.snapshot().channel.mediaItemUuid, moved.mediaItemUuid);
});

test('a persisted cache cannot migrate to a different service, selected list or expired time', async t => {
    const cached = JSON.stringify(createCache(service(), tvResult(), NOW));
    const variants = [
        { services: [service(1, { mediaItemUuid: 'replacement-service' })] },
        { services: [service(1, { listView: 'other-list' })], config: { channelListView: 'other-list' } },
        { now: NOW + MAX_CACHE_AGE + 1 },
    ];
    for (const variant of variants) {
        const h = await harness(t, { ...variant, saved: [[`${service().id}.epg.cache`, cached]] });
        assert.equal(h.snapshot().now, null);
        assert.equal(h.value(service().id, 'epg.cache'), '{}');
        assert.equal(h.calls.tv.length, 0);
        h.manager.stop();
    }
});

test('old external caches and their published fields are cleared before the first TV refresh', async t => {
    const id = service().id;
    for (const source of ['xmltv', undefined, null]) {
        const old = { ...createCache(service(), tvResult(programmes('External')), NOW),
            schemaVersion: 1, source, sourceChannelId: 'old-provider', fingerprint: 'old-config' };
        const h = await harness(t, {
            config: { epgSource: 'xmltv', epgXmltvUrl: 'invalid old URL', epgXmltvMappings: {} },
            saved: [[`${id}.epg.cache`, JSON.stringify(old)], [`${id}.epg.now.title`, 'External current'],
                [`${id}.epg.next.title`, 'External next'], [`${id}.epg.data`, JSON.stringify({ now: old.events[0] })]],
        });
        assert.equal(h.snapshot().now, null);
        assert.equal(h.snapshot().next, null);
        assert.equal(h.snapshot().lastUpdate, 0);
        assert.equal(h.value(id, 'epg.now.title'), '');
        assert.equal(h.value(id, 'epg.next.title'), '');
        assert.equal(h.value(id, 'epg.cache'), '{}');
        assert.equal(h.calls.tv.length, 0);
        assert.ok(h.adapter.writes.every(write => !String(write.val).includes('External')));
        await h.manager.refresh({ manual: true });
        assert.equal(h.snapshot().now.title, 'TV current');
        assert.equal(JSON.parse(h.value(id, 'epg.cache')).source, 'tv');
        h.manager.stop();
    }
});

test('valid legacy TV caches survive obsolete configuration and are rewritten in the TV-only schema', async t => {
    const id = service().id;
    const old = { ...createCache(service(), tvResult(), NOW - 5000), schemaVersion: 1,
        fingerprint: 'old-external-config', sourceChannelId: 'legacy-tv-id' };
    old.events = old.events.map(event => ({ ...event, endEstimated: false }));
    const h = await harness(t, { saved: [[`${id}.epg.cache`, JSON.stringify(old)]],
        config: { epgSource: 'xmltv', epgXmltvUrl: 'invalid old URL', epgXmltvMappings: [null] },
    });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.snapshot().now.title, 'TV current');
    assert.equal(h.snapshot().lastUpdate, NOW - 5000);
    const migrated = JSON.parse(h.value(id, 'epg.cache'));
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(Object.hasOwn(migrated, 'sourceChannelId'), false);
    assert.equal(Object.hasOwn(migrated, 'fingerprint'), false);
    assert.equal(Object.hasOwn(migrated.events[0], 'endEstimated'), false);
});

test('removed source and estimated-end states are never created or written, even if still registered', async t => {
    const h = await harness(t);
    const id = service().id;
    const obsolete = Object.keys(OBSOLETE_EPG_CHILD_TYPES).map(suffix => `${id}.${suffix}`);
    assert.equal(createEpgDefinitions(id).some(definition => obsolete.includes(definition.id)), false);
    for (const stateId of obsolete) {
        const object = { type: 'state', native: { managedBy: 'loewe-tv-channel-catalog' } };
        h.adapter.objects.set(stateId, object);
        h.runtime._objects.set(stateId, object);
    }
    await h.manager.refresh({ manual: true });
    h.setTime(NOW + MINUTE);
    await h.manager.tick();
    await h.catalog([]);
    await h.manager.retire(id, { retain: true });
    assert.equal(h.adapter.writes.some(write => obsolete.includes(write.id)), false);
});

test('EPG only reads materialized TV channels from the configured list', async t => {
    const h = await harness(t, { services: [] });
    const selected = [service(), service(2, { listView: 'unselected-list' }),
        service(3, { itemClass: 'audio', id: 'channels.radio.Station' })];
    await h.catalog(selected, { materialize: false });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.manager.entries.size, 1);
    assert.equal(h.adapter.objects.size, 0);
    h.register(selected);
    h.manager.catalogReady();
    await h.manager._initialization;
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.calls.tv[0].service.id, service().id);
    assert.ok([...h.adapter.objects.keys()].every(id => id.startsWith(`${service().id}.epg`)));
});

test('disabled EPG and unavailable channels publish empty fields and do not make source requests', async t => {
    const disabled = await harness(t, { config: { epgEnabled: false, epgRefreshInterval: 300 } });
    await disabled.manager.refresh({ manual: true });
    assert.equal(disabled.calls.tv.length, 0);
    assert.equal(disabled.snapshot().status, 'disabled');
    assert.equal(disabled.value('channels.epgStatus'), 'disabled');
    assert.equal(disabled.adapter.timers.size, 0);
    const unavailable = await harness(t, { services: [service(1, { available: false })] });
    await unavailable.manager.refresh({ manual: true });
    assert.equal(unavailable.calls.tv.length, 0);
    assert.equal(unavailable.snapshot().status, 'inactive');
    assert.equal(unavailable.snapshot().now, null);
});

test('no selected list leaves EPG unconfigured without creating a source request or channel data', async t => {
    const h = await harness(t, { config: { channelListView: '' } });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.value('channels.epgStatus'), 'notConfigured');
    assert.equal(h.manager.entries.size, 0);
    assert.equal(h.adapter.objects.size, 0);
    assert.equal(h.adapter.timers.size, 0);
});

test('late TV responses cannot restore an EPG tree after the selected channel has been removed', async t => {
    const gate = deferred();
    const entered = deferred();
    t.after(() => gate.resolve(tvResult()));
    const h = await harness(t, { readTv: async () => { entered.resolve(); return gate.promise; } });
    const pending = h.manager.refresh({ manual: true });
    await entered.promise;
    await h.catalog([]);
    for (const id of [...h.adapter.objects.keys()]) {
        h.adapter.objects.delete(id);
        h.adapter.states.delete(id);
        h.runtime._objects.delete(id);
    }
    const before = h.adapter.writes.length;
    gate.resolve(tvResult(programmes('Obsolete')));
    await pending;
    assert.equal(h.manager.entries.size, 0);
    assert.ok(h.adapter.writes.slice(before).every(write => !write.id.startsWith(`${service().id}.epg.`)));
    assert.ok([...h.adapter.states.keys()].every(id => !id.startsWith(`${service().id}.epg.`)));
});

for (const action of ['replacement', 'removal']) {
    test(`channel ${action} drains a real outstanding database write even after its timeout`, { timeout: 5000 }, async t => {
        const gate = deferred();
        t.after(() => gate.resolve());
        const h = await harness(t);
        const target = `${service().id}.epg.now.title`;
        let blocked = false;
        h.adapter.beforeWrite = async (id, state) => {
            if (!blocked && id === target && state.val === 'TV current') {
                blocked = true;
                await gate.promise;
            }
        };
        const database = h.runtime._database.bind(h.runtime);
        h.runtime._database = (operation, label, timeout) => database(operation, label, label === target ? 10 : timeout);
        await h.manager.refresh({ manual: true });
        assert.equal(blocked, true);
        assert.equal(h.value('channels.epgStatus'), 'error');
        const selected = action === 'replacement' ? [service(1, { mediaItemUuid: 'replacement-service' })] : [];
        h.runtime.channelObjects.services = new Map(selected.map(channel => [channel.id, channel]));
        let prepared = false;
        const preparing = h.manager.prepareCatalog(selected).then(() => { prepared = true; });
        await nextTurn();
        assert.equal(prepared, false, 'Catalog cleanup must await the actual database operation');
        gate.resolve();
        await preparing;
        if (action === 'replacement') {
            h.manager.catalogReady();
            await h.manager._initialization;
            assert.equal(h.value(target), '');
            assert.equal(h.snapshot().channel.mediaItemUuid, 'replacement-service');
            assert.equal(h.snapshot().now, null);
            await h.manager.refresh({ manual: true });
            assert.equal(h.snapshot().now.title, 'TV current');
            assert.equal(h.snapshot().channel.mediaItemUuid, 'replacement-service');
        } else {
            await h.manager.retire(service().id);
            for (const id of [...h.adapter.objects.keys()]) {
                h.adapter.objects.delete(id);
                h.adapter.states.delete(id);
                h.runtime._objects.delete(id);
            }
            const writes = h.adapter.writes.length;
            await h.manager.tick();
            await nextTurn();
            assert.equal(h.adapter.writes.length, writes);
            assert.equal(h.adapter.states.has(target), false);
        }
    });
}

test('a delayed old programme write cannot overtake a newer clock snapshot following a database timeout', { timeout: 5000 }, async t => {
    const gate = deferred();
    t.after(() => gate.resolve());
    const h = await harness(t);
    const target = `${service().id}.epg.now.title`;
    let held = false;
    h.adapter.beforeWrite = async (id, state) => {
        if (!held && id === target && state.val === 'TV current') { held = true; await gate.promise; }
    };
    const database = h.runtime._database.bind(h.runtime);
    h.runtime._database = (operation, label, timeout) => database(operation, label, label === target ? 10 : timeout);
    await h.manager.refresh({ manual: true });
    h.setTime(NOW + MINUTE);
    let published = false;
    const ticking = h.manager.tick().then(() => { published = true; });
    await nextTurn();
    assert.equal(published, false);
    assert.equal(h.adapter.writes.some(write => write.id === target && write.val === 'TV next'), false);
    gate.resolve();
    await ticking;
    assert.equal(h.value(target), 'TV next');
    assert.equal(h.snapshot().now.title, 'TV next');
    assert.equal(h.snapshot().next.title, 'TV later');
});

test('retained obsolete folders clear only existing adapter-owned EPG states', async t => {
    const h = await harness(t);
    await h.manager.refresh({ manual: true });
    const id = service().id;
    const protectedState = `${id}.epg.now.description`;
    h.adapter.objects.get(protectedState).native.managedBy = 'user';
    const absent = `${id}.epg.now.subtitle`;
    h.adapter.objects.delete(absent);
    h.adapter.states.delete(absent);
    const userChild = `${id}.epg.userAnnotation`;
    h.adapter.objects.set(userChild, { type: 'state', native: { managedBy: 'user' } });
    h.adapter.states.set(userChild, { val: 'Keep this annotation', ack: true });
    await h.catalog([]);
    await h.manager.retire(id, { retain: true });
    assert.equal(h.value(id, 'epg.status'), 'inactive');
    assert.equal(h.value(id, 'epg.now.title'), '');
    assert.equal(h.value(id, 'epg.now.available'), false);
    assert.equal(h.value(id, 'epg.cache'), '{}');
    assert.equal(h.value(id, 'epg.data'), '{}');
    assert.equal(h.value(protectedState), 'TV current description');
    assert.equal(h.adapter.states.has(absent), false);
    assert.equal(h.value(userChild), 'Keep this annotation');
});

test('manual-only refreshes coalesce while pending and do not create a periodic fetch timer', async t => {
    const entered = deferred();
    const gate = deferred();
    t.after(() => gate.resolve(tvResult()));
    const h = await harness(t, { readTv: async () => { entered.resolve(); return gate.promise; } });
    await h.manager.refresh();
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.manager._fetchTimer, null);
    const first = h.manager.refresh({ manual: true });
    const second = h.manager.refresh({ manual: true });
    assert.equal(first, second);
    await entered.promise;
    gate.resolve(tvResult());
    await Promise.all([first, second]);
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.manager._fetchTimer, null);
    assert.ok(h.manager._clockTimer !== null, 'The programme clock still runs in manual refresh mode');
});

test('a manual TV refresh continues after 64 channels without adding a periodic refresh', async t => {
    const selected = Array.from({ length: BATCH_SIZE + 1 }, (_, index) => service(index + 1));
    const h = await harness(t, { services: selected,
        readTv: async channel => tvResult(programmes(channel.name)),
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, BATCH_SIZE);
    assert.deepEqual(JSON.parse(h.value('channels.epgProgress')),
        { completed: BATCH_SIZE, total: BATCH_SIZE + 1, successful: BATCH_SIZE, failed: 0 });
    assert.equal(h.snapshot(selected.at(-1).id).status, 'waiting');
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 1000);
    h.adapter.fire(h.manager._fetchTimer);
    assert.ok(h.manager._fetchPromise);
    await h.manager._fetchPromise;
    assert.equal(h.calls.tv.length, BATCH_SIZE + 1);
    assert.equal(h.snapshot(selected.at(-1).id).now.title, `Sender ${BATCH_SIZE + 1} current`);
    assert.equal(h.value('channels.epgStatus'), 'ready');
    assert.equal(h.manager._fetchTimer, null);
    assert.equal(h.manager._cycle, null);
});

test('automatic refresh uses one timer and resumes at the configured interval after a successful cycle', async t => {
    const h = await harness(t, { config: { epgRefreshInterval: 300 } });
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 1000);
    h.manager.catalogReady();
    await h.manager._initialization;
    assert.equal([...h.adapter.timers.values()].filter(timer => timer.ms === 1000).length, 1);
    h.adapter.fire(h.manager._fetchTimer);
    await h.manager._fetchPromise;
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 300000);
    h.manager.connected();
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 1000);
});

test('stopping aborts an outstanding TV read and prevents later writes or new timers', async t => {
    const entered = deferred();
    let signal;
    const h = await harness(t, { config: { epgRefreshInterval: 300 },
        readTv: async (_channel, options) => {
            signal = options.signal;
            entered.resolve();
            return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(error('CLOSED')), { once: true }));
        },
    });
    const loading = h.manager.refresh({ manual: true });
    await entered.promise;
    const before = h.adapter.writes.length;
    h.manager.stop();
    assert.equal(signal.aborted, true);
    await loading;
    await h.manager.tick();
    await h.manager.refresh({ manual: true });
    await nextTurn();
    assert.equal(h.adapter.writes.length, before);
    assert.equal(h.adapter.timers.size, 0);
    assert.equal(h.manager._fetchTimer, null);
    assert.equal(h.manager._clockTimer, null);
});

test('stopping rechecks ownership before a delayed database callback can start a new EPG write', async t => {
    const gate = deferred();
    const entered = deferred();
    t.after(() => gate.resolve());
    const h = await harness(t);
    const target = `${service().id}.epg.now.title`;
    const database = h.runtime._database.bind(h.runtime);
    h.runtime._database = async (operation, label, timeout) => {
        if (label === target) { entered.resolve(); await gate.promise; }
        return database(operation, label, timeout);
    };
    const pending = h.manager.refresh({ manual: true });
    await entered.promise;
    const before = h.adapter.writes.length;
    h.manager.stop();
    gate.resolve();
    await pending;
    assert.equal(h.adapter.writes.length, before);
    assert.equal(h.adapter.timers.size, 0);
    assert.equal(h.value(target), '');
});

test('the real refresh button runs outside the TV queue and lets a manual command execute between EPG SOAP requests', { timeout: 5000 }, async t => {
    const started = deferred();
    const release = deferred();
    t.after(() => release.resolve());
    const order = [];
    let h;
    const tvSource = { reset() {}, async read() {
        await h.manager._soap('GetEpgFirst', '<Fixture/>', {});
        await h.manager._soap('GetEpgSecond', '<Fixture/>', {});
        return tvResult();
    } };
    h = await harness(t, { tvSource, request: async action => {
        order.push(action);
        if (action === 'GetEpgFirst') { started.resolve(); await release.promise; }
        return { action };
    } });
    const refreshId = 'channels.epgRefresh';
    h.runtime._objects.set(refreshId, { type: 'state', common: { type: 'boolean', role: 'button', write: true } });
    const pressed = h.runtime.handleStateChange(`loewe-tv.0.${refreshId}`, { val: true, ack: false });
    await started.promise;
    const manual = h.runtime._enqueue('remote.volume_up', async () => { order.push('manual-volume'); }, { manual: true });
    release.resolve();
    await Promise.all([pressed, manual]);
    assert.deepEqual(order, ['GetEpgFirst', 'manual-volume', 'GetEpgSecond']);
    assert.equal(h.value(refreshId), false);
    assert.equal(h.adapter.states.get(refreshId).ack, true);
    assert.equal(h.runtime._pendingCount, 0);
    assert.equal(h.snapshot().now.title, 'TV current');
    await h.runtime.handleStateChange(`loewe-tv.0.${refreshId}`, { val: true, ack: true });
    assert.equal(order.length, 3, 'Acknowledged button writes must not start another EPG refresh');
});

test('an EPG capability error does not mark the real TV connection offline and the refresh button is reset', async t => {
    let h;
    const tvSource = { reset() {}, async read() {
        await h.manager._soap('GetEpg', '<Fixture/>', {});
        return tvResult();
    } };
    h = await harness(t, { tvSource, request: async () => { throw error('SOAP', 'EPG operation unsupported'); } });
    const id = 'channels.epgRefresh';
    h.runtime._objects.set(id, { type: 'state', common: { type: 'boolean', role: 'button', write: true } });
    await h.runtime.handleStateChange(`loewe-tv.0.${id}`, { val: true, ack: false });
    assert.equal(h.runtime._connected, true);
    assert.equal(h.value(id), false);
    assert.equal(h.runtime._pendingCount, 0);
    assert.equal(h.snapshot().now, null);
    assert.match(h.snapshot().lastError, /SOAP/u);
    let manualRan = false;
    await h.runtime._enqueue('remote.volume_up', async () => { manualRan = true; }, { manual: true });
    assert.equal(manualRan, true);
});
