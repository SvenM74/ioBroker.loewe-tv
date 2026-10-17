'use strict';

// Exercise the manager with the real runtime queue and database wrapper. Only
// the TV, ioBroker database and adapter timers are simulated; no device is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { AdapterRuntime, normalizeConfig } = require('../lib/adapter-runtime');
const { BATCH_SIZE } = require('../lib/epg-manager');
const { createEpgDefinitions } = require('../lib/epg-states');
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
        description: `${title} description`, start, end, endEstimated: false, ...extra };
}

function programmes(prefix = 'TV', time = NOW) {
    return [
        programme(`${prefix} current`, time - MINUTE, time + MINUTE),
        programme(`${prefix} next`, time + MINUTE, time + 2 * MINUTE),
        programme(`${prefix} later`, time + 2 * MINUTE, time + 3 * MINUTE),
    ];
}

function tvResult(events = programmes(), sourceChannelId = 'tv-guide-1') {
    return { source: 'tv', sourceChannelId, events };
}

function feed(channels, fetchedAt = NOW) {
    return { channels: new Map(channels.map(channel => [channel.id, channel])), fetchedAt };
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
    const adapter = new FakeAdapter(config);
    for (const [id, val] of options.saved || []) adapter.states.set(id, { val, ack: true });
    const calls = { tv: [], xmltv: [], requests: [], reset: 0 };
    const source = options.tvSource || {
        reset() { calls.reset++; },
        async read(selected, settings) {
            calls.tv.push({ service: selected, settings });
            return options.readTv ? options.readTv(selected, settings) : tvResult();
        },
    };
    const runtime = new AdapterRuntime(adapter, { epgOptions: {
        now: () => time, tvSource: source,
        xmltvLoader: async (url, settings) => {
            calls.xmltv.push({ url, settings });
            if (options.loadXmltv) return options.loadXmltv(url, settings);
            throw error('EPG_XMLTV', 'No XMLTV feed configured in this fixture');
        },
        ...(options.xmltvResolver ? { xmltvResolver: options.xmltvResolver } : {}),
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

test('EPG configuration defaults are automatic, enabled and refreshed every fifteen minutes', () => {
    const config = normalizeConfig({});
    assert.equal(config.epgEnabled, true);
    assert.equal(config.epgSource, 'auto');
    assert.equal(config.epgRefreshInterval, 900);
    assert.equal(config.epgXmltvUrl, '');
    assert.deepEqual(config.epgXmltvMappings, []);
    for (const interval of [0, 300, 86400]) {
        assert.equal(normalizeConfig({ epgRefreshInterval: interval }).epgRefreshInterval, interval);
    }
    const configured = normalizeConfig({ epgSource: 'xmltv', epgEnabled: false,
        epgXmltvUrl: 'http://192.0.2.1:3000/guide.xml?token=private',
        epgXmltvMappings: [{ channel: ' Sender 1 ', xmltvId: ' DasErste.de@SD ' }] });
    assert.deepEqual(configured.epgXmltvMappings, [{ channel: 'Sender 1', xmltvId: 'DasErste.de@SD' }]);
});

test('EPG configuration rejects ambiguous mappings, invalid intervals and unsafe URL forms', () => {
    const invalid = [
        { epgEnabled: 'true' }, { epgSource: 'unknown' },
        { epgRefreshInterval: 299 }, { epgRefreshInterval: -1 }, { epgRefreshInterval: 86401 },
        { epgRefreshInterval: 300.5 },
        { epgXmltvUrl: 'file:///etc/passwd' }, { epgXmltvUrl: 'not a URL' },
        { epgXmltvUrl: 'https://private-user:private-password@example.invalid/guide.xml' },
        { epgXmltvUrl: 'https://example.invalid/a\nb.xml' },
        { epgXmltvMappings: {} }, { epgXmltvMappings: [null] },
        { epgXmltvMappings: [{ channel: '', xmltvId: 'one' }] },
        { epgXmltvMappings: [{ channel: 'one', xmltvId: '' }] },
        { epgXmltvMappings: [{ channel: 'A\nB', xmltvId: 'one' }] },
        { epgXmltvMappings: [{ channel: 'one', xmltvId: 'A\u0000B' }] },
        { epgXmltvMappings: [{ channel: 'one', xmltvId: 'a' }, { channel: ' one ', xmltvId: 'b' }] },
    ];
    for (const config of invalid) {
        assert.throws(() => normalizeConfig(config), caught => {
            assert.equal(caught.code, 'VALIDATION');
            assert.doesNotMatch(caught.message, /private-user|private-password/u);
            return true;
        }, JSON.stringify(config));
    }
});

test('complete TV programmes publish per-channel fields and a final consistent snapshot without loading XMLTV', async t => {
    const h = await harness(t, { config: { epgXmltvUrl: 'https://fixture.invalid/guide.xml' } });
    const id = service().id;
    const begin = h.adapter.completedWrites.length;
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.calls.xmltv.length, 0);
    assert.equal(h.value(id, 'epg.now.title'), 'TV current');
    assert.equal(h.value(id, 'epg.next.title'), 'TV next');
    assert.equal(h.value(id, 'epg.now.start'), NOW - MINUTE);
    assert.equal(h.value(id, 'epg.next.end'), NOW + 2 * MINUTE);
    assert.equal(h.value(id, 'epg.now.available'), true);
    const snapshot = h.snapshot();
    assert.equal(snapshot.status, 'ready');
    assert.equal(snapshot.source, 'tv');
    assert.equal(snapshot.sourceChannelId, 'tv-guide-1');
    assert.equal(snapshot.now.eventId, 'event-TV current');
    assert.equal(snapshot.lastUpdate, NOW);
    const writes = h.adapter.completedWrites.slice(begin).filter(write => write.id.startsWith(`${id}.epg.`));
    assert.equal(writes.at(-1).id, `${id}.epg.data`);
    assert.equal(h.value('channels.epgStatus'), 'ready');
    assert.equal(h.value('channels.epgLastUpdate'), NOW);
});

test('automatic fallback loads one feed and applies exact explicit IDs independently for each selected TV channel', async t => {
    const selected = [service(1), service(2)];
    const guide = feed([
        { id: 'first@SD', names: ['Unrelated display name'], events: programmes('External one') },
        { id: 'second@HD', names: [], events: programmes('External two') },
    ], NOW - 5000);
    const h = await harness(t, { services: selected, config: {
        epgXmltvUrl: 'http://192.0.2.1:3000/guide.xml', epgXmltvMappings: [
            { channel: selected[0].id, xmltvId: 'first@SD' },
            { channel: selected[1].name, xmltvId: 'second@HD' },
        ],
    }, readTv: async () => tvResult(programmes('Partial TV').slice(0, 1)), loadXmltv: async () => guide });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 2);
    assert.equal(h.calls.xmltv.length, 1);
    for (const [index, selectedService] of selected.entries()) {
        const data = h.snapshot(selectedService.id);
        assert.equal(data.source, 'xmltv');
        assert.equal(data.sourceChannelId, index === 0 ? 'first@SD' : 'second@HD');
        assert.equal(data.now.title, index === 0 ? 'External one current' : 'External two current');
        assert.equal(data.lastUpdate, NOW - 5000);
    }
});

test('automatic selection keeps one provider and never combines the TV current event with an unrelated XMLTV next event', async t => {
    const h = await harness(t, { config: { epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        readTv: async () => tvResult(programmes('TV only').slice(0, 1)),
        loadXmltv: async () => feed([{ id: 'one', names: ['Sender 1'], events: programmes('Other').slice(1, 2) }]),
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.snapshot().source, 'tv');
    assert.equal(h.snapshot().now.title, 'TV only current');
    assert.equal(h.snapshot().next, null);
    assert.equal(h.snapshot().status, 'partial');
});

test('a failed external fallback keeps fresh partial TV information and reports the degraded result', async t => {
    const h = await harness(t, { services: [service(1), service(2)],
        config: { epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        readTv: async () => tvResult(programmes('Partial TV').slice(0, 1)),
        loadXmltv: async () => { throw error('EPG_XMLTV_HTTP', 'Guide temporarily unavailable'); },
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 2);
    assert.equal(h.calls.xmltv.length, 1, 'A failed feed load is also shared by the whole cycle');
    for (const selected of [service(1), service(2)]) {
        const snapshot = h.snapshot(selected.id);
        assert.equal(snapshot.source, 'tv');
        assert.equal(snapshot.status, 'partial');
        assert.equal(snapshot.now.title, 'Partial TV current');
        assert.equal(snapshot.next, null);
        assert.match(snapshot.lastError, /EPG_XMLTV_HTTP/u);
        assert.equal(snapshot.lastUpdate, NOW);
    }
    assert.equal(h.value('channels.epgStatus'), 'partial');
    assert.match(h.value('channels.epgLastError'), /EPG_XMLTV_HTTP/u);
    assert.deepEqual(JSON.parse(h.value('channels.epgProgress')),
        { completed: 2, total: 2, successful: 2, failed: 0, degraded: 2 });
});

test('an empty TV response and failed external fallback do not erase a still-valid previous schedule', async t => {
    let empty = false;
    const h = await harness(t, { config: { epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        readTv: async () => tvResult(empty ? [] : programmes('Saved TV')),
        loadXmltv: async () => { throw error('EPG_XMLTV_HTTP'); },
    });
    await h.manager.refresh({ manual: true });
    const saved = h.value(service().id, 'epg.cache');
    empty = true;
    h.setTime(NOW + 10000);
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.snapshot().status, 'cached');
    assert.equal(h.snapshot().now.title, 'Saved TV current');
    assert.equal(h.snapshot().next.title, 'Saved TV next');
    assert.equal(h.snapshot().lastUpdate, NOW);
    assert.match(h.snapshot().lastError, /EPG_XMLTV_HTTP/u);
    assert.equal(h.value(service().id, 'epg.cache'), saved);
    assert.equal(h.value('channels.epgStatus'), 'error');
});

test('XMLTV-only operation works without a TV connection and never sends TV EPG requests', async t => {
    const h = await harness(t, { client: null, config: { epgSource: 'xmltv', epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        loadXmltv: async () => feed([{ id: 'one', names: ['Sender 1'], events: programmes('Guide') }]),
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.snapshot().source, 'xmltv');
    assert.equal(h.snapshot().now.title, 'Guide current');
});

test('XMLTV name ambiguity produces an unmapped channel rather than selecting an arbitrary schedule', async t => {
    const h = await harness(t, { config: { epgSource: 'xmltv', epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        loadXmltv: async () => feed([
            { id: 'one@SD', names: ['Sender 1'], events: programmes('SD') },
            { id: 'one@HD', names: ['Sender 1'], events: programmes('HD') },
        ]),
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.snapshot().status, 'unmapped');
    assert.equal(h.snapshot().now, null);
    assert.equal(h.snapshot().next, null);
    assert.equal(h.snapshot().source, '');
    assert.match(h.snapshot().lastError, /EPG_UNMAPPED/u);
    assert.equal(h.value('channels.epgStatus'), 'error');
});

test('TV-only mode reports unsupported EPG without contacting a configured external guide', async t => {
    const h = await harness(t, { config: { epgSource: 'tv', epgXmltvUrl: 'https://fixture.invalid/guide.xml' },
        readTv: async () => { throw error('EPG_TV_UNSUPPORTED'); },
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.xmltv.length, 0);
    assert.equal(h.snapshot().status, 'unsupported');
    assert.equal(h.snapshot().now, null);
});

test('a TV transport failure is limited to one attempt per cycle while the remaining channels share the external feed', async t => {
    const h = await harness(t, { services: [service(1), service(2), service(3)],
        config: { epgXmltvUrl: 'http://fixture.invalid/guide.xml' },
        readTv: async () => { throw error('NETWORK'); },
        loadXmltv: async () => feed([1, 2, 3].map(number =>
            ({ id: `guide-${number}`, names: [`Sender ${number}`], events: programmes(`Guide ${number}`) }))),
    });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.tv.length, 1);
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.snapshot(service(3).id).now.title, 'Guide 3 current');
    assert.equal(h.value('channels.epgStatus'), 'ready');
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
    assert.match(h.snapshot().lastError, /\[Guide-URL\]/u);
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
    assert.equal(h.snapshot().source, '');
    assert.equal(h.snapshot().lastUpdate, NOW);
});

test('saved programmes restore after restart and remain attached to the same service when its channel position changes', async t => {
    const config = normalizeConfig({ epgRefreshInterval: 0, channelListView: 'fixture-list' });
    const cached = createCache(service(), tvResult(), config, NOW - 5000);
    const moved = service(1, { number: 42, caption: '42', locator: 'channel://42:ch-fixture-1:sl-fixture',
        positions: [{ caption: '42', locator: 'channel://42:ch-fixture-1:sl-fixture' }] });
    const h = await harness(t, { services: [moved], saved: [[`${moved.id}.epg.cache`, JSON.stringify(cached)]] });
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.snapshot().now.title, 'TV current');
    assert.equal(h.snapshot().lastUpdate, NOW - 5000);
    assert.equal(h.snapshot().channel.mediaItemUuid, moved.mediaItemUuid);
});

test('a persisted cache cannot migrate to a different service, selected list or guide configuration', async t => {
    const originalConfig = normalizeConfig({ epgRefreshInterval: 0, channelListView: 'fixture-list' });
    const cached = JSON.stringify(createCache(service(), tvResult(), originalConfig, NOW));
    const variants = [
        { services: [service(1, { mediaItemUuid: 'replacement-service' })] },
        { services: [service(1, { listView: 'other-list' })], config: { channelListView: 'other-list' } },
        { config: { epgSource: 'tv' } },
        { config: { epgXmltvUrl: 'https://fixture.invalid/changed-guide.xml' } },
        { config: { epgXmltvMappings: [{ channel: service().id, xmltvId: 'changed@SD' }] } },
        { now: NOW + MAX_CACHE_AGE + 1 },
    ];
    for (const variant of variants) {
        const h = await harness(t, { ...variant, saved: [[`${service().id}.epg.cache`, cached]] });
        assert.equal(h.snapshot().now, null);
        assert.equal(h.snapshot().source, '');
        assert.equal(h.value(service().id, 'epg.cache'), '{}');
        assert.equal(h.calls.tv.length, 0);
        h.manager.stop();
    }
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
    assert.equal(h.calls.xmltv.length, 0);
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

test('a manual refresh continues after 64 channels and reuses the same XMLTV feed in the next batch', async t => {
    const selected = Array.from({ length: BATCH_SIZE + 1 }, (_, index) => service(index + 1));
    const h = await harness(t, { services: selected, config: {
        epgSource: 'xmltv', epgXmltvUrl: 'http://fixture.invalid/guide.xml',
        epgXmltvMappings: selected.map(channel => ({ channel: channel.id, xmltvId: 'shared' })),
    }, loadXmltv: async () => feed([{ id: 'shared', names: [], events: programmes('Shared') }]) });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.xmltv.length, 1);
    assert.deepEqual(JSON.parse(h.value('channels.epgProgress')),
        { completed: BATCH_SIZE, total: BATCH_SIZE + 1, successful: BATCH_SIZE, failed: 0, degraded: 0 });
    assert.equal(h.snapshot(selected.at(-1).id).status, 'waiting');
    assert.equal(h.adapter.timers.get(h.manager._fetchTimer).ms, 1000);
    h.adapter.fire(h.manager._fetchTimer);
    assert.ok(h.manager._fetchPromise);
    await h.manager._fetchPromise;
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.snapshot(selected.at(-1).id).now.title, 'Shared current');
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

test('stopping aborts an outstanding XMLTV load and prevents later writes or new timers', async t => {
    const entered = deferred();
    let signal;
    const h = await harness(t, { config: { epgSource: 'xmltv', epgXmltvUrl: 'http://fixture.invalid/guide.xml', epgRefreshInterval: 300 },
        loadXmltv: async (_url, options) => {
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
