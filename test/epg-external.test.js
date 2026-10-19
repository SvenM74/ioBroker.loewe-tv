'use strict';

// Real runtime, source parser, mapping and manager. All TV/HTTP responses,
// channel names, programmes, clocks and database records are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { AdapterRuntime, normalizeConfig } = require('../lib/adapter-runtime');
const { createEpgDefinitions } = require('../lib/epg-states');
const { loadXmltv } = require('../lib/epg-xmltv');

const NOW = Date.parse('2026-10-19T18:00:00Z');
const MINUTE = 60000;
const DAY = 24 * 60 * MINUTE;
const FEED_URL = 'https://guide.invalid/synthetic.xml';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function failure(code, message = 'Synthetic source failure') {
    return Object.assign(new Error(message), { code });
}

function service(extra = {}) {
    const locator = 'channel://1:synthetic-a:synthetic-list';
    return { id: 'channels.tv.Fixture_HD', name: 'Fixture HD', number: 1, caption: '1',
        itemClass: 'video', listView: 'synthetic-list', mediaItemUuid: 'synthetic-service-a',
        locator, positions: [{ caption: '1', locator }], available: true, ...extra };
}

function programme(title, start, end) {
    return { eventId: `synthetic-${title}`, title, subtitle: '', description: `${title} description`,
        start: NOW + start * MINUTE, end: NOW + end * MINUTE };
}

const stamp = value => new Date(value).toISOString().replace(/[-:T]/gu, '').slice(0, 14) + ' +0000';
const escape = value => String(value).replace(/[&<>"']/gu, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));

function feed(channels = [{ id: 'fixture-a', name: 'Fixture HD', events: [
    programme('External current', -10, 10), programme('External next', 10, 30),
    programme('External later', 120, 180), programme('External tomorrow', 720, 780),
] }]) {
    return '<?xml version="1.0" encoding="UTF-8"?><tv>'
        + channels.map(channel => `<channel id="${escape(channel.id)}"><display-name>${escape(channel.name)}</display-name>`
            + `<icon src="https://images.invalid/${escape(channel.id)}.svg"/></channel>`).join('')
        + channels.flatMap(channel => channel.events.map(event =>
            `<programme channel="${escape(channel.id)}" start="${stamp(event.start)}" stop="${stamp(event.end)}">`
            + `<title>${escape(event.title)}</title><desc>${escape(event.description)}</desc></programme>`)).join('') + '</tv>';
}

function response(xml) {
    const bytes = Buffer.from(xml);
    return { status: 200, headers: { 'content-type': 'application/xml', 'content-length': String(bytes.length) },
        body: Readable.from((function* () {
            for (let offset = 0; offset < bytes.length; offset += 17) yield bytes.subarray(offset, offset + 17);
        })()) };
}

function parsedLoader(xml, calls) {
    return async (url, options) => {
        calls.push({ url, services: structuredClone(options.services), manualMappings: structuredClone(options.manualMappings) });
        const result = await loadXmltv(url, { ...options, fetchImpl: async () => response(xml) });
        assert.equal(result.stats.wireBytes, Buffer.byteLength(xml), 'The complete synthetic document was consumed.');
        return result;
    };
}

class FakeAdapter {
    constructor(namespace, config) {
        this.namespace = namespace;
        this.config = config;
        this.objects = new Map();
        this.states = new Map();
        this.writes = [];
        this.timers = new Map();
        this.nextTimer = 1;
        this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, () => {}]));
    }
    async setStateAsync(id, state) {
        const value = structuredClone(state);
        this.writes.push({ id, ...value });
        this.states.set(id, value);
    }
    async getStateAsync(id) { return this.states.get(id) || null; }
    async getObjectAsync(id) { return this.objects.get(id) || null; }
    setTimeout(fn, ms) {
        const handle = this.nextTimer++;
        this.timers.set(handle, { fn, ms });
        return handle;
    }
    clearTimeout(handle) { this.timers.delete(handle); }
}

async function harness(t, options = {}) {
    let now = options.now ?? NOW;
    const config = normalizeConfig({ host: 'synthetic-tv.invalid', channelListView: 'synthetic-list',
        pollInterval: 0, channelRefreshInterval: 0, epgRefreshInterval: 0,
        epgSource: 'xmltv', epgXmltvUrl: FEED_URL, ...options.config });
    const adapter = new FakeAdapter(options.namespace || 'loewe-tv.0', structuredClone(config));
    for (const [id, state] of options.saved || []) adapter.states.set(id, structuredClone(state));
    const calls = { tv: [], xmltv: [], zap: [] };
    const xmltvLoader = options.xmltvLoader || parsedLoader(options.xml || feed(), calls.xmltv);
    const runtime = new AdapterRuntime(adapter, { epgOptions: { now: () => now, xmltvLoader,
        tvSource: { reset() {}, async read(selected, settings) {
            calls.tv.push(structuredClone(selected));
            if (options.readTv) return options.readTv(selected, settings);
            throw failure('NETWORK', 'The synthetic TV is switched off.');
        } } } });
    runtime.config = config;
    runtime.client = {
        async zap(locator) {
            calls.zap.push({ namespace: adapter.namespace, host: runtime.config.host, locator });
            return { data: { Envelope: { Body: { ZapToMediaResponse: { Result: '0' } } } } };
        },
        close() {},
    };
    runtime._connected = options.connected === true;
    const manager = runtime.epg;
    t.after(() => { manager.stop(); runtime.stopping = true; });

    async function catalog(services) {
        runtime.channelObjects.services = new Map(services.map(selected => [selected.id, selected]));
        await manager.prepareCatalog(services);
        for (const selected of services) {
            if (selected.itemClass !== 'video' || selected.listView !== runtime.config.channelListView) continue;
            for (const definition of createEpgDefinitions(selected.id)) {
                adapter.objects.set(definition.id, structuredClone(definition));
                runtime._objects.set(definition.id, structuredClone(definition));
            }
        }
        manager.catalogReady();
        await manager._initialization;
    }

    await manager.start();
    await catalog(options.services || [service()]);
    return { adapter, runtime, manager, calls, catalog,
        configure(extra) {
            runtime.config = normalizeConfig({ ...runtime.config, ...extra });
            adapter.config = structuredClone(runtime.config);
        },
        setTime(value) { now = value; },
        snapshot(id = service().id) { return JSON.parse(adapter.states.get(`${id}.epg.data`).val); },
        value(id, suffix = '') { return adapter.states.get(suffix ? `${id}.${suffix}` : id)?.val; },
        savedCaches() { return [...adapter.states].filter(([id]) => id.endsWith('.epg.cache')); },
    };
}

function reference(guide, title, id = service().id) {
    const channel = guide.channels.find(row => row.id === id);
    const event = channel.events.find(row => row.title === title);
    assert.ok(event, `Expected ${title} in the actual guide response.`);
    return { channelId: channel.id, eventId: event.eventId, start: event.start, end: event.end,
        listView: guide.listView, catalogRevision: guide.catalogRevision };
}

function liveSnapshot(h) {
    const guide = h.manager.guide();
    return structuredClone({ runtimeConfig: h.runtime.config, adapterConfig: h.adapter.config,
        states: [...h.adapter.states], objects: [...h.adapter.objects], writes: h.adapter.writes,
        guide, calls: h.calls, entries: [...h.manager.entries].map(([id, entry]) => [id, {
            identity: entry.identity, cache: entry.cache, tvCache: entry.tvCache,
            xmltvCache: entry.xmltvCache, xmltvMapping: entry.xmltvMapping,
        }]) });
}

test('an offline TV can receive complete XMLTV data, expose future selections and restore its own source after restart', async t => {
    const h = await harness(t);
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.runtime._connected, false);
    const guide = await h.runtime.handleMessage('getEpgGuide', { from: NOW, to: NOW + DAY });
    assert.equal(guide.source, 'xmltv');
    assert.equal(guide.connected, false);
    assert.equal(guide.channels[0].source, 'xmltv');
    assert.equal(guide.channels[0].events.length, 4);
    assert.ok(guide.channels[0].events.every(event => event.source === 'xmltv'));
    assert.equal(guide.channels[0].logoUrl, 'https://images.invalid/fixture-a.svg');
    assert.equal(h.snapshot().now.title, 'External current');
    assert.equal(h.snapshot().next.title, 'External next');
    const before = h.adapter.writes.length;
    const selected = await h.runtime.handleMessage('selectEpgProgramme', reference(guide, 'External tomorrow'));
    assert.equal(selected.action, 'confirmRecording');
    assert.equal(selected.timing, 'future');
    assert.equal(selected.channel.id, service().id);
    assert.equal(h.adapter.writes.length, before);
    assert.equal(h.calls.zap.length, 0);
    const originalCache = JSON.parse(h.value(service().id, 'epg.cache'));
    assert.equal(originalCache.xmltv.fetchedAt, NOW);
    assert.equal(originalCache.xmltv.sourceChannelId, 'fixture-a');
    h.manager.stop();

    const restarted = await harness(t, { saved: h.savedCaches(), now: NOW + 15 * MINUTE });
    assert.equal(restarted.calls.xmltv.length, 0, 'Restoring and opening the guide perform no download.');
    assert.equal(restarted.calls.tv.length, 0);
    assert.equal(restarted.snapshot().now.title, 'External next');
    assert.equal(restarted.snapshot().lastUpdate, NOW);
    const restoredGuide = restarted.manager.guide({ from: NOW + 15 * MINUTE, to: NOW + DAY });
    assert.equal(restarted.manager.selection(reference(restoredGuide, 'External tomorrow')).timing, 'future');
    assert.equal(JSON.parse(restarted.value(service().id, 'epg.cache')).xmltv.fetchedAt, NOW);
});

test('automatic mode keeps exact TV events and fills later slots with visibly external programmes', async t => {
    const tvEvents = [programme('TV current', -10, 10), programme('TV next', 10, 30)];
    const h = await harness(t, { config: { epgSource: 'auto' }, connected: true,
        readTv: async () => ({ source: 'tv', events: tvEvents }) });
    await h.manager.refresh({ manual: true });
    assert.equal(h.calls.xmltv.length, 1);
    assert.equal(h.calls.tv.length, 1);
    const guide = h.manager.guide({ from: NOW, to: NOW + DAY });
    const row = guide.channels[0];
    assert.equal(row.source, 'mixed');
    assert.deepEqual(row.events.map(event => [event.title, event.source]), [
        ['TV current', 'tv'], ['TV next', 'tv'], ['External later', 'xmltv'], ['External tomorrow', 'xmltv'],
    ]);
    assert.deepEqual(row.events.slice(0, 2).map(event => [event.eventId, event.start, event.end]),
        tvEvents.map(event => [event.eventId, event.start, event.end]));
    assert.equal(h.snapshot().now.source, 'tv');
    assert.equal(h.snapshot().next.source, 'tv');
    assert.equal(h.manager.selection(reference(guide, 'External later')).timing, 'future');
    const saved = JSON.parse(h.value(service().id, 'epg.cache'));
    assert.equal(saved.tv.source, 'tv');
    assert.equal(saved.xmltv.source, 'xmltv');
    assert.equal(saved.tv.events[0].title, 'TV current');
    assert.equal(saved.xmltv.events[0].title, 'External current');
});

test('two TV instances keep separate manual mappings and reject each other’s programme references before zap', async t => {
    const xml = feed([
        { id: 'fixture-a', name: 'Fixture HD', events: [programme('TV0 external programme', -5, 30)] },
        { id: 'fixture-b', name: 'Fixture HD', events: [programme('TV1 external programme', -5, 30)] },
    ]);
    const firstService = service();
    const secondLocator = 'channel://9:synthetic-b:synthetic-list';
    const secondService = service({ number: 9, caption: '9', mediaItemUuid: 'synthetic-service-b',
        locator: secondLocator, positions: [{ caption: '9', locator: secondLocator }] });
    const first = await harness(t, { namespace: 'loewe-tv.0', xml, services: [firstService], connected: true,
        config: { host: 'synthetic-tv0.invalid', epgXmltvMappings: [{ channel: firstService.id, xmltvId: 'fixture-a' }] } });
    const second = await harness(t, { namespace: 'loewe-tv.1', xml, services: [secondService], connected: true,
        config: { host: 'synthetic-tv1.invalid', epgXmltvMappings: [{ channel: secondService.id, xmltvId: 'fixture-b' }] } });
    await first.manager.refresh({ manual: true });
    await second.manager.refresh({ manual: true });
    assert.equal(first.snapshot().xmltvMapping.xmltvId, 'fixture-a');
    assert.equal(second.snapshot().xmltvMapping.xmltvId, 'fixture-b');
    const firstReference = reference(first.manager.guide(), 'TV0 external programme');
    const secondReference = reference(second.manager.guide(), 'TV1 external programme');
    await assert.rejects(first.runtime.handleMessage('selectEpgProgramme', secondReference), { code: 'EPG_GUIDE_CHANGED' });
    await assert.rejects(second.runtime.handleMessage('selectEpgProgramme', firstReference), { code: 'EPG_GUIDE_CHANGED' });
    assert.equal(first.calls.zap.length + second.calls.zap.length, 0);
    const firstReply = await first.runtime.handleMessage('selectEpgProgramme', firstReference);
    const secondReply = await second.runtime.handleMessage('selectEpgProgramme', secondReference);
    assert.equal(firstReply.action, 'switched');
    assert.equal(secondReply.action, 'switched');
    assert.equal(firstReply.stationConfirmed, false);
    assert.equal(secondReply.stationConfirmed, false);
    assert.deepEqual(first.calls.zap, [{ namespace: 'loewe-tv.0', host: 'synthetic-tv0.invalid', locator: firstService.locator }]);
    assert.deepEqual(second.calls.zap, [{ namespace: 'loewe-tv.1', host: 'synthetic-tv1.invalid', locator: secondLocator }]);
});

test('a failed external download keeps valid cached programmes and their original acquisition time', async t => {
    const h = await harness(t);
    await h.manager.refresh({ manual: true });
    const cacheBefore = h.value(service().id, 'epg.cache');
    const guideBefore = h.manager.guide();
    h.setTime(NOW + MINUTE);
    h.manager.xmltvLoader = async () => { throw failure('XMLTV_NETWORK', 'Failed https://guide.invalid/feed?token=must-not-leak'); };
    await h.manager.refresh({ manual: true });
    assert.equal(h.snapshot().now.title, 'External current');
    assert.equal(h.snapshot().lastUpdate, NOW);
    assert.equal(h.snapshot().xmltvDiagnostic.code, 'XMLTV_NETWORK');
    assert.equal(h.value(service().id, 'epg.cache'), cacheBefore);
    const guideAfter = h.manager.guide();
    assert.deepEqual(guideAfter.channels[0].events, guideBefore.channels[0].events);
    assert.equal(guideAfter.channels[0].lastUpdate, NOW);
    assert.match(guideAfter.lastError, /XMLTV_NETWORK/u);
    assert.doesNotMatch(JSON.stringify(guideAfter), /must-not-leak|guide\.invalid/u);
    assert.equal(h.calls.tv.length, 0);
});

test('a rejected replacement schedule cannot relabel a retained XMLTV cache with the new mapping or logo', async t => {
    const h = await harness(t, { config: { epgSource: 'auto' },
        readTv: async () => ({ source: 'tv', events: [programme('TV current', -10, 10)] }) });
    await h.manager.refresh({ manual: true });
    const previous = structuredClone(h.manager.entries.get(service().id).xmltvCache);
    const previousMapping = structuredClone(h.snapshot().xmltvMapping);
    // Valid XML and a unique name match, but 129 current alternatives cannot be
    // safely shortened to the programme cache's 128-event limit.
    h.manager.xmltvLoader = parsedLoader(feed([{ id: 'replacement-feed-id', name: 'Fixture HD',
        events: Array.from({ length: 129 }, (_, index) => programme(`Ambiguous ${index}`, -5, 20)) }]), []);
    await h.manager.refresh({ manual: true });
    const retained = h.manager.entries.get(service().id);
    assert.equal(retained.xmltvDiagnostic.code, 'EPG_DATA');
    assert.deepEqual(retained.xmltvCache, previous);
    assert.deepEqual(h.snapshot().xmltvMapping, previousMapping);
    const row = h.manager.guide().channels[0];
    assert.equal(row.source, 'mixed');
    assert.equal(row.logoUrl, 'https://images.invalid/fixture-a.svg');
    assert.ok(row.events.some(event => event.title === 'External later'));
    assert.equal(row.events.some(event => event.title.startsWith('Ambiguous ')), false);
});

test('changing the source URL, source mode or manual binding during a download discards the old result', async t => {
    for (const change of [
        { epgXmltvUrl: 'https://different.invalid/new.xml' },
        { epgSource: 'tv' },
        { epgXmltvMappings: [{ channel: service().id, xmltvId: 'new-manual-id' }] },
    ]) {
        const started = deferred();
        const release = deferred();
        const calls = [];
        const parse = parsedLoader(feed(), calls);
        const h = await harness(t, { xmltvLoader: async (url, options) => {
            const result = await parse(url, options);
            started.resolve();
            await release.promise;
            return result;
        } });
        const refresh = h.manager.refresh({ manual: true });
        await started.promise;
        const before = h.adapter.writes.length;
        h.configure(change);
        release.resolve();
        await refresh;
        assert.equal(h.manager.entries.get(service().id).xmltvCache, null, JSON.stringify(change));
        assert.equal(h.manager.guide({ from: NOW, to: NOW + DAY }).channels[0].events.length, 0);
        assert.equal(h.manager._xmltvCatalogue, null, 'An obsolete source must not populate configuration choices.');
        assert.equal(h.adapter.writes.slice(before).some(write => JSON.stringify(write).includes('External current')), false);
        assert.equal(h.calls.zap.length, 0);
    }
});

test('replacing the TV service during a download cannot publish the old service’s programmes to its reused ID', async t => {
    const started = deferred();
    const release = deferred();
    const parse = parsedLoader(feed(), []);
    const h = await harness(t, { xmltvLoader: async (url, options) => {
        const result = await parse(url, options);
        started.resolve();
        await release.promise;
        return result;
    } });
    const refresh = h.manager.refresh({ manual: true });
    await started.promise;
    await h.catalog([service({ mediaItemUuid: 'replacement-service' })]);
    const before = h.adapter.writes.length;
    release.resolve();
    await refresh;
    assert.equal(h.manager.entries.get(service().id).xmltvCache, null);
    assert.equal(h.snapshot().now, null);
    assert.equal(h.manager.guide().channels[0].events.length, 0);
    assert.equal(h.adapter.writes.slice(before).some(write => JSON.stringify(write).includes('External current')), false);
});

test('a name or alias change with unchanged TV identity cannot adopt an earlier automatic match', async t => {
    for (const changed of [{ name: 'Different HD' }, { aliases: ['New declared alias HD'] }]) {
        const started = deferred();
        const release = deferred();
        const parse = parsedLoader(feed(), []);
        const h = await harness(t, { xmltvLoader: async (url, options) => {
            const result = await parse(url, options);
            started.resolve();
            await release.promise;
            return result;
        } });
        const refresh = h.manager.refresh({ manual: true });
        await started.promise;
        await h.catalog([service(changed)]);
        release.resolve();
        await refresh;
        assert.equal(h.manager.entries.get(service().id).xmltvCache, null, JSON.stringify(changed));
        assert.equal(h.manager.guide().channels[0].events.length, 0);
        assert.equal(h.snapshot().now, null);
    }
});

test('mapping preview and option reads affect only temporary RAM choices, not live configuration or programme caches', async t => {
    const h = await harness(t);
    await h.manager.refresh({ manual: true });
    const configBefore = structuredClone(h.runtime.config);
    const adapterConfigBefore = structuredClone(h.adapter.config);
    const statesBefore = structuredClone([...h.adapter.states]);
    const guideBefore = h.manager.guide();
    const cacheBefore = structuredClone(h.manager.entries.get(service().id).xmltvCache);
    const before = h.adapter.writes.length;
    const previewCalls = [];
    h.manager.xmltvLoader = parsedLoader(feed([{ id: 'preview-other', name: 'Different preview channel',
        events: [programme('Preview only programme', -5, 20)] }]), previewCalls);
    const url = 'https://preview.invalid/other.xml';
    const preview = await h.runtime.handleMessage('previewEpgMappings', { url, listView: 'synthetic-list',
        mappings: [{ channel: service().id, xmltvId: 'preview-other' }] });
    assert.equal(preview.result, 'mappingPreviewReady');
    assert.deepEqual(preview.args, [1, 1]);
    assert.match(preview.native._epgMappingPreview[0].match, /preview-other/u);
    assert.deepEqual(Object.keys(preview.native).sort(), ['_epgMappingPreview', '_epgMappingReload']);
    const channels = await h.runtime.handleMessage('getEpgTvChannels', { listView: 'synthetic-list' });
    const options = await h.runtime.handleMessage('getXmltvChannels', { url, listView: 'synthetic-list', channel: service().id });
    assert.ok(channels.some(option => option.value === service().id));
    assert.ok(options.some(option => option.value === 'preview-other'));
    assert.equal(previewCalls.length, 1, 'Option reads do not start another download.');
    assert.equal(h.calls.tv.length, 0);
    assert.equal(h.adapter.writes.length, before);
    assert.deepEqual([...h.adapter.states], statesBefore);
    assert.deepEqual(h.runtime.config, configBefore);
    assert.deepEqual(h.adapter.config, adapterConfigBefore);
    assert.deepEqual(h.manager.entries.get(service().id).xmltvCache, cacheBefore);
    assert.deepEqual(h.manager.guide(), guideBefore);
    assert.equal(h.snapshot().xmltvMapping.xmltvId, 'fixture-a');
});

test('mapping editor replaces exactly one draft row and preserves unrelated and disabled rows without changing live data', async t => {
    const h = await harness(t);
    await h.manager.refresh({ manual: true });
    const mappings = [
        { channel: 'channels.tv.Previous', xmltvId: 'previous-source-id' },
        { channel: service().id, xmltvId: 'draft-old-id' },
        { channel: 'channels.tv.Disabled', xmltvId: '' },
        { channel: 'channels.tv.Not_In_Current_List', xmltvId: 'retained-source-id' },
    ];
    const message = { channel: service().id, xmltvId: 'exact replacement ID',
        listView: 'synthetic-list', mappings };
    const inputBefore = structuredClone(message);
    const before = liveSnapshot(h);
    const reply = await h.runtime.handleMessage('applyEpgMapping', message);
    assert.deepEqual(reply, { native: { epgXmltvMappings: [
        mappings[0], { channel: service().id, xmltvId: 'exact replacement ID' }, mappings[2], mappings[3],
    ] } });
    assert.deepEqual(message, inputBefore);
    assert.deepEqual(liveSnapshot(h), before);
    reply.native.epgXmltvMappings[0].xmltvId = 'edited reply only';
    assert.deepEqual(message, inputBefore, 'Returned form rows do not alias the supplied draft.');
    assert.deepEqual(liveSnapshot(h), before, 'Editing the reply cannot change live configuration or caches.');
});

test('mapping editor appends exact free XMLTV IDs without requiring a downloaded catalogue', async t => {
    const h = await harness(t);
    const mappings = [{ channel: 'channels.tv.Previous', xmltvId: 'kept' },
        { channel: 'channels.tv.Disabled', xmltvId: '' }];
    const before = liveSnapshot(h);
    for (const xmltvId of ['Manual Ä HD +1/region:unlisted', 'ä'.repeat(256)]) {
        const reply = await h.runtime.handleMessage('applyEpgMapping', {
            listView: 'synthetic-list', channel: service().id, xmltvId, mappings,
        });
        assert.deepEqual(reply.native.epgXmltvMappings, [...mappings, { channel: service().id, xmltvId }]);
    }
    assert.deepEqual(liveSnapshot(h), before);
    assert.equal(h.calls.xmltv.length, 0, 'Applying a free ID does not download the source.');
});

test('mapping editor rejects unavailable or foreign-list TV services and invalid IDs without changing the draft or database', async t => {
    const unavailable = service({ id: 'channels.tv.Unavailable', available: false });
    const foreign = service({ id: 'channels.tv.Foreign_List', listView: 'other-list' });
    const radio = service({ id: 'channels.radio.Fixture', itemClass: 'audio' });
    const h = await harness(t, { services: [service(), unavailable, foreign, radio] });
    const base = { channel: service().id, xmltvId: 'valid-id', listView: 'synthetic-list',
        mappings: [{ channel: 'channels.tv.Disabled', xmltvId: '' }] };
    const before = liveSnapshot(h);
    const invalid = [
        ...['channels.tv.Unknown', unavailable.id, foreign.id, radio.id, '', 'loewe-tv.1.' + service().id]
            .map(channel => ({ ...base, channel })),
        ...['', ' ', ' leading', 'trailing ', 'bad\u0000id', 'bad\u007fid', '\ud800',
            'x'.repeat(513), 'ä'.repeat(257), 7, null, { value: 'wrong-shape' }]
            .map(xmltvId => ({ ...base, xmltvId })),
        { ...base, listView: 'other-list' },
        { ...base, mappings: [{ channel: service().id, xmltvId: 'one' }, { channel: service().id, xmltvId: 'two' }] },
    ];
    for (const message of invalid) {
        const inputBefore = structuredClone(message);
        await assert.rejects(h.runtime.handleMessage('applyEpgMapping', message), error =>
            ['EPG_MAPPING', 'XMLTV_MAPPING'].includes(error.code), JSON.stringify(message));
        assert.deepEqual(message, inputBefore);
    }
    assert.deepEqual(liveSnapshot(h), before);
});

test('mapping editor responses remain separate for two TV instances and accept only each instance’s saved TV services', async t => {
    const firstService = service({ id: 'channels.tv.Only_TV0' });
    const secondService = service({ id: 'channels.tv.Only_TV1', mediaItemUuid: 'synthetic-service-b' });
    const first = await harness(t, { namespace: 'loewe-tv.0', services: [firstService] });
    const second = await harness(t, { namespace: 'loewe-tv.1', services: [secondService] });
    const firstBefore = liveSnapshot(first);
    const secondBefore = liveSnapshot(second);
    const firstDraft = [{ channel: 'channels.tv.Disabled_TV0', xmltvId: '' }];
    const secondDraft = [{ channel: 'channels.tv.Previous_TV1', xmltvId: 'previous-tv1' }];
    const firstReply = await first.runtime.handleMessage('applyEpgMapping', {
        channel: firstService.id, xmltvId: 'xmltv-for-tv0', mappings: firstDraft, listView: 'synthetic-list',
    });
    const secondReply = await second.runtime.handleMessage('applyEpgMapping', {
        channel: secondService.id, xmltvId: 'xmltv-for-tv1', mappings: secondDraft, listView: 'synthetic-list',
    });
    assert.deepEqual(firstReply.native.epgXmltvMappings,
        [...firstDraft, { channel: firstService.id, xmltvId: 'xmltv-for-tv0' }]);
    assert.deepEqual(secondReply.native.epgXmltvMappings,
        [...secondDraft, { channel: secondService.id, xmltvId: 'xmltv-for-tv1' }]);
    for (const [h, channel] of [[first, secondService.id], [second, firstService.id]]) {
        await assert.rejects(h.runtime.handleMessage('applyEpgMapping', {
            channel, xmltvId: 'foreign-tv-source', mappings: [], listView: 'synthetic-list',
        }), { code: 'EPG_MAPPING' });
    }
    assert.deepEqual(liveSnapshot(first), firstBefore);
    assert.deepEqual(liveSnapshot(second), secondBefore);
});

test('mapping editor rejects an append beyond the mapping limit but permits replacement in a full table', async t => {
    const h = await harness(t);
    const mappings = Array.from({ length: 2000 }, (_, index) => ({ channel: `channels.tv.Stored_${index}`, xmltvId: '' }));
    const before = liveSnapshot(h);
    await assert.rejects(h.runtime.handleMessage('applyEpgMapping', {
        channel: service().id, xmltvId: 'new-id', mappings, listView: 'synthetic-list',
    }), { code: 'XMLTV_MAPPING' });
    mappings[0] = { channel: service().id, xmltvId: 'previous-id' };
    const reply = await h.runtime.handleMessage('applyEpgMapping', {
        channel: service().id, xmltvId: 'replacement-id', mappings, listView: 'synthetic-list',
    });
    assert.equal(reply.native.epgXmltvMappings.length, 2000);
    assert.deepEqual(reply.native.epgXmltvMappings[0], { channel: service().id, xmltvId: 'replacement-id' });
    assert.deepEqual(reply.native.epgXmltvMappings.slice(1), mappings.slice(1));
    assert.equal(mappings[0].xmltvId, 'previous-id');
    assert.deepEqual(liveSnapshot(h), before);
});

test('late mapping previews are discarded after a TV name, alias or saved-list change', async t => {
    for (const change of [
        h => h.catalog([service({ name: 'Replacement Name HD' })]),
        h => h.catalog([service({ aliases: ['New Alias HD'] })]),
        h => h.configure({ channelListView: 'another-saved-list' }),
    ]) {
        const started = deferred();
        const release = deferred();
        const parse = parsedLoader(feed(), []);
        const h = await harness(t, { xmltvLoader: async (url, options) => {
            const result = await parse(url, options);
            started.resolve();
            await release.promise;
            return result;
        } });
        const pending = h.runtime.handleMessage('previewEpgMappings', {
            url: FEED_URL, listView: 'synthetic-list', mappings: [],
        });
        const rejected = assert.rejects(pending, { code: 'EPG_MAPPING' });
        await started.promise;
        await change(h);
        const before = liveSnapshot(h);
        release.resolve();
        await rejected;
        assert.equal(h.manager._previewCatalogue, null);
        assert.deepEqual(liveSnapshot(h), before);
    }
});

test('preview choices survive periodic source loading and preserve selections beyond filtered or bounded options', async t => {
    const h = await harness(t);
    const previewUrl = 'https://preview.invalid/unsaved-source.xml';
    const channels = Array.from({ length: 1002 }, (_, index) => ({
        id: `preview-${String(index).padStart(4, '0')}`, name: `Unrelated synthetic ${String(index).padStart(4, '0')}`, events: [],
    }));
    const calls = [];
    const previewLoader = parsedLoader(feed(channels), calls);
    const liveLoader = parsedLoader(feed(), calls);
    h.manager.xmltvLoader = (url, options) => url === previewUrl ? previewLoader(url, options) : liveLoader(url, options);
    const request = { url: previewUrl, listView: 'synthetic-list', mappings: [] };
    const first = await h.runtime.handleMessage('previewEpgMappings', request);
    const second = await h.runtime.handleMessage('previewEpgMappings', request);
    assert.ok(second.native._epgMappingReload > first.native._epgMappingReload,
        'Two explicit reloads remain distinguishable with an unchanged clock.');
    await h.manager.refresh({ manual: true });
    const before = liveSnapshot(h);
    const selected = 'preview-1001';
    for (const query of ['', 'preview-0000']) {
        const options = await h.runtime.handleMessage('getXmltvChannels', {
            url: previewUrl, listView: 'synthetic-list', channel: service().id, selected, query,
        });
        assert.equal(options.filter(option => option.value === selected).length, 1);
        assert.ok(options.some(option => option.value === 'preview-0000'));
        assert.equal(options.some(option => option.value === 'fixture-a'), false);
    }
    const liveOptions = await h.runtime.handleMessage('getXmltvChannels', {
        url: FEED_URL, listView: 'synthetic-list', channel: service().id,
    });
    assert.ok(liveOptions.some(option => option.value === 'fixture-a'));
    assert.equal(liveOptions.some(option => option.value.startsWith('preview-')), false);
    assert.deepEqual(calls.map(call => call.url), [previewUrl, previewUrl, FEED_URL]);
    assert.deepEqual(liveSnapshot(h), before);
});
