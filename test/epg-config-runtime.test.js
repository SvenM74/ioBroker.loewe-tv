'use strict';

// Run the real startup, catalogue restoration and EPG manager together. Only
// ioBroker storage and external transports are synthetic; no TV is contacted.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { AdapterRuntime } = require('../lib/adapter-runtime');
const { mergeChannelPage } = require('../lib/channel-catalog');

const VIEW = 'configuration-fixture-list';
const configForm = require('../admin/jsonConfig.json').items._epg.items;
const logoForm = require('../admin/jsonConfig.json').items._channelLogos.items;
const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function page() {
    return { view: VIEW, name: 'Synthetic saved TV list', startIndex: 0, totalResults: 2,
        items: [1, 2].map(number => ({ mediaItemUuid: `fixture-${number}`, name: `Fixture ${number}`,
            caption: String(number), itemClass: 'video', locator: `channel://${number}:fixture-${number}:fixture-list` })) };
}

function formRequest(data, field = '_epgMappingLoad', row) {
    const item = row ? configForm.epgXmltvMappings.items.find(column => column.attr === field) : configForm[field];
    assert.equal(typeof item?.jsonData, 'string', `The real Admin field ${field} must define its sendTo payload.`);
    // ConfigGeneric.getPattern evaluates jsonData as a template literal. Table
    // controls receive their row in data and the complete form in globalData.
    const serialized = vm.runInNewContext('`' + item.jsonData + '`', { data: row || data, globalData: data });
    return { command: item.command, message: JSON.parse(serialized) };
}

function mappingEnvelope(response, request) {
    assert.equal(response.error, undefined);
    assert.deepEqual(Object.keys(response.native), ['_epgMappingResponse'],
        'A reply must offer one guarded response, without writing directly into the editable table.');
    const envelope = response.native._epgMappingResponse;
    assert.deepEqual(envelope.basis, { url: request.message.url ?? '', listView: request.message.listView ?? '',
        mappings: request.message.mappings ?? [] });
    assert.ok(Array.isArray(envelope.rows));
    assert.equal(typeof envelope.status, 'string');
    return envelope;
}

function logoFormRequest(data, field = '_logoMappingLoad', row) {
    const item = row ? logoForm.channelLogoMappings.items.find(column => column.attr === field) : logoForm[field];
    assert.equal(typeof item?.jsonData, 'string', `The actual logo field ${field} must define its sendTo payload.`);
    const serialized = vm.runInNewContext('`' + item.jsonData + '`', { data: row || data, globalData: data });
    return { command: item.command, message: JSON.parse(serialized) };
}

function messageRoute(runtime, adapter) {
    const replies = [];
    class MessageAdapter extends EventEmitter {
        constructor() {
            super();
            this.namespace = adapter.namespace;
            this.log = adapter.log;
        }
        sendTo(from, command, message, callback) { replies.push({ from, command, message, callback }); }
    }
    const module = { exports: {} };
    vm.runInNewContext(mainSource, {
        module, Buffer, setTimeout, clearTimeout,
        require(name) {
            if (name === '@iobroker/adapter-core') return { Adapter: MessageAdapter };
            if (name === './lib/adapter-runtime') return { AdapterRuntime };
            throw new Error(`Unexpected main.js import: ${name}`);
        },
    }, { filename: 'main.js' });
    const route = module.exports();
    route.runtime = runtime;
    return async request => {
        const previous = replies.length;
        const callback = { id: previous + 1, ack: false, time: 1 };
        await route.onMessage({ ...request, from: 'system.adapter.admin.0', callback });
        assert.equal(replies.length, previous + 1, 'The actual main.js route must answer exactly once.');
        const reply = replies[previous];
        assert.equal(reply.from, 'system.adapter.admin.0');
        assert.equal(reply.command, request.command);
        assert.equal(reply.callback, callback);
        return reply.message;
    };
}

class MemoryAdapter {
    constructor(config) {
        this.namespace = 'loewe-tv.0';
        this.config = config;
        this.objects = new Map();
        this.states = new Map();
        this.logs = [];
        this.readObjects = null;
        this.beforeExtend = null;
        this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level =>
            [level, message => this.logs.push({ level, message })]));
    }
    async getStateAsync(id) { return structuredClone(this.states.get(id) || null); }
    async setStateAsync(id, state) { this.states.set(id, structuredClone(state)); }
    async getObjectAsync(id) { return structuredClone(this.objects.get(id) || null); }
    async extendObjectAsync(id, object) {
        if (this.beforeExtend) await this.beforeExtend(id);
        const previous = this.objects.get(id) || {};
        this.objects.set(id, { ...previous, ...structuredClone(object),
            common: { ...previous.common, ...structuredClone(object.common || {}) },
            native: { ...previous.native, ...structuredClone(object.native || {}) } });
    }
    async delObjectAsync(id, options) {
        for (const store of [this.objects, this.states]) {
            for (const candidate of store.keys()) {
                if (candidate === id || (options.recursive && candidate.startsWith(`${id}.`))) store.delete(candidate);
            }
        }
    }
    async getAdapterObjectsAsync() {
        if (this.readObjects) await this.readObjects();
        return Object.fromEntries([...this.objects].map(([id, object]) => [`${this.namespace}.${id}`, structuredClone(object)]));
    }
    async getObjectListAsync({ startkey, endkey }) {
        return { rows: [...this.objects].map(([id, doc]) => ({ id: `${this.namespace}.${id}`, doc: structuredClone(doc) }))
            .filter(row => row.id >= startkey && row.id <= endkey) };
    }
    subscribeStates() {}
}

async function harness(t, options = {}) {
    const catalog = mergeChannelPage(null, options.page || page());
    const mappings = { [catalog.services[0].id]: 'fixture-one', 'channels.tv.Previous_Sender': '' };
    const adapter = new MemoryAdapter({ host: 'tv.fixture.invalid', pollInterval: 0,
        channelRefreshInterval: 0, channelListView: VIEW, epgRefreshInterval: 0,
        epgSource: 'xmltv', epgXmltvUrl: 'https://guide.fixture.invalid/guide.xml',
        epgXmltvMappings: mappings, ...options.config });
    adapter.namespace = options.namespace || adapter.namespace;
    if (options.saved !== false) adapter.states.set('channels.catalog', { val: JSON.stringify(catalog), ack: true });
    const calls = [];
    const blockedTransport = async (...args) => {
        calls.push(args);
        throw Object.assign(new Error('The synthetic TV is switched off.'), { code: 'NETWORK' });
    };
    const client = new Proxy({ close() {} }, {
        get(target, key) { return key === 'then' ? undefined : Object.hasOwn(target, key) ? target[key] : blockedTransport; },
    });
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => client,
        epgOptions: { xmltvLoader: blockedTransport, tvSource: { reset() {}, read: blockedTransport } } });
    const restoreEntered = deferred();
    const restoreRelease = deferred();
    const materializeEntered = deferred();
    const materializeRelease = deferred();
    let firstRead = true;
    adapter.readObjects = async () => {
        if (!firstRead) return;
        firstRead = false;
        restoreEntered.resolve();
        if (options.blockRestore) await restoreRelease.promise;
        if (options.restoreError) throw Object.assign(new Error('Synthetic local catalogue read failed.'), { code: 'DATABASE' });
    };
    adapter.beforeExtend = async id => {
        if (options.blockMaterialize && id === catalog.services[0].id) {
            materializeEntered.resolve();
            await materializeRelease.promise;
        }
    };
    t.after(async () => {
        restoreRelease.resolve();
        materializeRelease.resolve();
        await runtime.stop();
        await runtime.channelObjects.whenIdle();
        await runtime.epg._initialization;
    });
    if (options.start !== false) await runtime.start();
    return { adapter, runtime, calls, catalog, mappings, send: messageRoute(runtime, adapter),
        restoreEntered, restoreRelease, materializeEntered, materializeRelease };
}

test('the actual Admin form and message route wait for offline TV channels before materialization', async t => {
    for (const epgEnabled of [true, false]) {
        await t.test(`epgEnabled=${epgEnabled}`, async t => {
            const h = await harness(t, { config: { epgEnabled, epgXmltvUrl: '' }, blockRestore: true, blockMaterialize: true });
            await h.restoreEntered.promise;
            const request = { listView: VIEW, channel: '' };
            // This was the startup race: a synchronous selector could report
            // an apparently successful empty catalogue before local restore.
            assert.deepEqual(h.runtime.epg.channelOptions(request), [{ value: '', label: 'TV-Sender auswählen' }]);
            let answered = false;
            const waiting = h.runtime.channelObjects.waitForReady().then(result => { answered = true; return result; });
            // Blank form list IDs used to hide an otherwise valid saved list.
            // Evaluate the shipped jsonData instead of inventing an RPC body.
            const draft = { ...structuredClone(h.adapter.config), channelListView: '' };
            const before = structuredClone(draft);
            const requestFromForm = formRequest(draft);
            assert.equal(requestFromForm.command, 'getEpgMappingRows');
            assert.deepEqual(requestFromForm.message, { url: '', mappings: h.mappings });
            let formAnswered = false;
            const formReply = h.send(requestFromForm).then(result => { formAnswered = true; return result; });
            await nextTurn();
            assert.equal(answered, false);
            assert.equal(formAnswered, false, 'Startup must not return a successful but empty matrix.');
            h.restoreRelease.resolve();
            assert.deepEqual(await waiting, { ready: true, status: 'ready' });
            const response = await formReply;
            const envelope = mappingEnvelope(response, requestFromForm);
            await h.materializeEntered.promise;
            assert.ok(h.runtime.channelObjects.worker, 'Configuration does not wait for every object to be written.');
            assert.deepEqual(h.runtime.epg.channelOptions(request).slice(1), h.catalog.services.map(service =>
                ({ value: service.id, label: `${service.number}. ${service.name}` })));
            assert.deepEqual(envelope.rows.map(({ channel, tvChannel, mode, xmltvId }) =>
                ({ channel, tvChannel, mode, xmltvId })), [
                { channel: h.catalog.services[0].id, tvChannel: '1. Fixture 1', mode: 'manual', xmltvId: 'fixture-one' },
                { channel: h.catalog.services[1].id, tvChannel: '2. Fixture 2', mode: 'auto', xmltvId: '' },
                { channel: 'channels.tv.Previous_Sender', tvChannel: 'channels.tv.Previous_Sender', mode: 'disabled', xmltvId: '' },
            ]);
            assert.match(envelope.status, /2 TV-Sender/u);
            assert.match(envelope.status, /noch nicht geladen/u);
            assert.deepEqual(draft, before, 'Loading the matrix returns a draft update without mutating the request.');
            assert.deepEqual(h.runtime.config.epgXmltvMappings, h.mappings, 'Legacy and unavailable-sender corrections survive startup.');
            assert.equal(h.runtime._connected, false);
            assert.deepEqual(h.calls, [], 'Reading the stored sender list must not wake or query the TV or download XMLTV.');
        });
    }
});

test('one readiness timeout does not cancel restoration or another waiting configuration request', async t => {
    const h = await harness(t, { blockRestore: true });
    await h.restoreEntered.promise;
    const timedOut = h.runtime.channelObjects.waitForReady({ timeoutMs: 10 });
    let answered = false;
    const patient = h.runtime.channelObjects.waitForReady().then(result => { answered = true; return result; });
    assert.deepEqual(await timedOut, { ready: false, status: 'timeout' });
    assert.equal(answered, false);
    h.restoreRelease.resolve();
    assert.deepEqual(await patient, { ready: true, status: 'ready' });
    assert.deepEqual(await h.runtime.channelObjects.waitForReady({ timeoutMs: 0 }), { ready: true, status: 'ready' });
    assert.deepEqual(h.calls, []);
});

test('real table payloads keep two TV instances and their stored command targets separate', async t => {
    const otherPage = page();
    for (const item of otherPage.items) {
        item.mediaItemUuid = `other-${item.mediaItemUuid}`;
        item.locator = item.locator.replace(':fixture-', ':other-');
    }
    otherPage.items[1].name = 'Other television only';
    const first = await harness(t, { namespace: 'loewe-tv.0', config: { epgEnabled: false } });
    const second = await harness(t, { namespace: 'loewe-tv.1', page: otherPage, config: { epgEnabled: false } });
    await Promise.all([first, second].map(h => h.runtime.channelObjects.whenIdle()));
    const sharedId = first.catalog.services[0].id;
    assert.equal(second.catalog.services[0].id, sharedId, 'Different instances may contain the same relative sender ID.');
    const targets = [first, second].map(h => h.runtime.channelObjects.target(`${sharedId}.select`));
    assert.notEqual(targets[0].locator, targets[1].locator);

    for (const [index, h] of [first, second].entries()) {
        const liveSettings = structuredClone(h.runtime.config);
        const draft = { ...structuredClone(h.adapter.config), channelListView: index === 0 ? undefined : null };
        const request = formRequest(draft);
        assert.equal(Object.hasOwn(request.message, 'listView'), false, 'An absent form choice uses this instance\'s saved list.');
        const response = await h.send(request);
        const envelope = mappingEnvelope(response, request);
        assert.deepEqual(envelope.rows.slice(0, 2).map(row => row.channel), h.catalog.services.map(service => service.id));
        assert.equal(envelope.rows[1].tvChannel, `2. ${h.catalog.services[1].name}`);

        // The Admin onChange guard is exercised by the config tests. Here the
        // unchanged form explicitly accepts the proposed rows for its next RPC.
        draft.epgXmltvMappings = envelope.rows;
        const row = draft.epgXmltvMappings[0];
        row.mode = 'manual';
        row.xmltvId = `unsaved-source-${index}`;
        row.tvChannel = 'A client-supplied display name must not rename the TV sender';
        const optionRequest = formRequest(draft, 'xmltvId', row);
        assert.deepEqual(optionRequest.message, { url: draft.epgXmltvUrl, channel: sharedId,
            selected: `unsaved-source-${index}`, query: `unsaved-source-${index}` });
        const options = await h.send(optionRequest);
        assert.ok(options.some(option => option.value === row.xmltvId), 'The exact draft XMLTV ID survives a source that is not yet loaded.');
        const reloadRequest = formRequest(draft);
        const reloaded = mappingEnvelope(await h.send(reloadRequest), reloadRequest);
        assert.equal(reloaded.rows[0].xmltvId, `unsaved-source-${index}`);
        assert.equal(reloaded.rows[0].tvChannel, '1. Fixture 1', 'Display fields come from the authoritative TV catalogue.');
        assert.deepEqual(h.runtime.config, liveSettings, 'Returning a draft never saves active settings.');
        assert.deepEqual(h.runtime.channelObjects.target(`${sharedId}.select`), targets[index]);
        h.runtime.channelObjects.checkTarget(targets[index]);
        assert.equal(h.runtime._connected, false);
        assert.deepEqual(h.calls, []);
    }
});

test('a catalogue read error reaches the real form as an error without a replacement draft', async t => {
    const h = await harness(t, { restoreError: true, config: { epgEnabled: false, epgXmltvUrl: '' } });
    const draft = structuredClone(h.adapter.config);
    const before = structuredClone(draft);
    const request = formRequest(draft);
    const response = await h.send(request);
    assert.match(response.error, /gespeicherte Senderliste konnte nicht gelesen/u);
    assert.deepEqual(Object.keys(response), ['error'], 'An error must not offer a native._epgMappingResponse with empty replacement rows.');
    assert.deepEqual(draft, before);
    assert.deepEqual(h.runtime.config.epgXmltvMappings, h.mappings);
    assert.deepEqual(h.calls, []);
});

test('unsaved list changes and invalid table rows preserve the form and active sender targets', async t => {
    const h = await harness(t);
    await h.runtime.channelObjects.whenIdle();
    const originalTarget = h.runtime.channelObjects.target(`${h.catalog.services[0].id}.select`);
    const liveSettings = structuredClone(h.runtime.config);
    const cases = [
        { channelListView: 'another-list-not-saved' },
        { epgXmltvMappings: [
            { channel: h.catalog.services[0].id, mode: 'manual', xmltvId: 'one' },
            { channel: h.catalog.services[0].id, mode: 'manual', xmltvId: 'conflicting' },
        ] },
        { epgXmltvMappings: [{ channel: h.catalog.services[0].id, mode: 'manual', xmltvId: 'one', locator: 'channel://1:foreign:foreign' }] },
    ];
    for (const changes of cases) {
        const draft = { ...structuredClone(h.adapter.config), ...changes };
        const before = structuredClone(draft);
        const response = await h.send(formRequest(draft));
        assert.equal(typeof response.error, 'string');
        assert.equal(Object.hasOwn(response, 'native'), false);
        assert.deepEqual(draft, before);
        assert.deepEqual(h.runtime.config, liveSettings);
        assert.deepEqual(h.runtime.channelObjects.target(`${h.catalog.services[0].id}.select`), originalTarget);
    }
    assert.deepEqual(h.calls, []);
});

test('a failed local restore is reported explicitly and a later valid catalogue can become ready', async t => {
    const h = await harness(t, { restoreError: true });
    assert.deepEqual(await h.runtime.channelObjects.waitForReady(), { ready: false, status: 'error' });
    await h.runtime.channelObjects.whenIdle();
    assert.ok(h.adapter.logs.some(entry => /Synthetic local catalogue read failed/u.test(entry.message)));
    assert.equal(h.runtime.epg.entries.size, 0);
    h.runtime.channelObjects.acceptPage(page());
    await h.runtime.channelObjects.whenIdle();
    assert.deepEqual(await h.runtime.channelObjects.waitForReady(), { ready: true, status: 'ready' });
    assert.equal(h.runtime.epg.channelOptions({ listView: VIEW }).length, 3);
    assert.deepEqual(h.calls, []);
});

test('shutdown releases all readiness waiters and a late restore response cannot revive the catalogue', { timeout: 1000 }, async t => {
    const h = await harness(t, { blockRestore: true });
    await h.restoreEntered.promise;
    const waiting = [h.runtime.channelObjects.waitForReady(), h.runtime.channelObjects.waitForReady()];
    await h.runtime.stop();
    assert.deepEqual(await Promise.all(waiting), [{ ready: false, status: 'stopped' }, { ready: false, status: 'stopped' }]);
    h.restoreRelease.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(h.runtime.channelObjects.services.size, 0);
    assert.equal(h.runtime.epg.entries.size, 0);
    assert.deepEqual(await h.runtime.channelObjects.waitForReady(), { ready: false, status: 'stopped' });
    assert.deepEqual(h.calls, []);
});

test('a fully restored empty catalogue differs from an instance that has not started yet', async t => {
    const h = await harness(t, { start: false, saved: false });
    assert.deepEqual(await h.runtime.channelObjects.waitForReady(), { ready: false, status: 'starting' });
    await h.runtime.start();
    assert.deepEqual(await h.runtime.channelObjects.waitForReady(), { ready: true, status: 'empty' });
    assert.deepEqual(h.calls, []);
});

test('the shipped logo form waits for saved channels and resolves logos with TV and EPG off', async t => {
    const televisionPage = page();
    televisionPage.items[0].name = 'ZDF HD';
    televisionPage.items[0].thumbnailUrl = '/images/zdf.png';
    televisionPage.items[1].name = 'SAT.1 HD';
    const h = await harness(t, { page: televisionPage, blockRestore: true,
        config: { epgEnabled: false, epgSource: 'tv', epgXmltvUrl: '' } });
    await h.restoreEntered.promise;
    const draft = { ...structuredClone(h.adapter.config), channelListView: '' };
    const before = structuredClone(draft);
    const request = logoFormRequest(draft);
    let answered = false;
    const waiting = h.send(request).then(response => { answered = true; return response; });
    await nextTurn();
    assert.equal(answered, false, 'The form must wait instead of replacing the TV list with an empty table.');
    h.restoreRelease.resolve();
    const response = await waiting;
    assert.equal(response.error, undefined);
    assert.deepEqual(Object.keys(response.native), ['_logoMappingResponse']);
    const envelope = response.native._logoMappingResponse;
    assert.deepEqual(envelope.basis, { source: 'auto', country: 'de', listView: '', mappings: [] });
    assert.deepEqual(envelope.rows.map(row => [row.tvChannel, row.logoId]), [
        ['1. ZDF HD', 'countries/germany/hd/zdf-hd-de.png'],
        ['2. SAT.1 HD', 'countries/germany/hd/sat-1-hd-de.png'],
    ]);
    assert.equal(envelope.rows[0].tvLogo, 'TV-Bildadresse vorhanden');
    assert.equal(envelope.rows[1].tvLogo, 'Keine TV-Bildadresse');
    assert.match(envelope.status, /2 von 2 TV-Sendern zugeordnet/u);
    const options = await h.send(logoFormRequest(draft, 'logoId', { ...envelope.rows[1], mode: 'manual', logoId: 'SAT.1' }));
    assert.ok(options.some(option => option.value === 'countries/germany/hd/sat-1-hd-de.png'));
    assert.deepEqual(draft, before);
    const guide = h.runtime.epg.guide();
    assert.equal(guide.channels[0].logoUrl, 'http://tv.fixture.invalid:905/images/zdf.png');
    assert.match(guide.channels[0].logoAlternatives[0], /\/hd\/zdf-hd-de\.png$/u);
    assert.match(guide.channels[1].logoUrl, /\/hd\/sat-1-hd-de\.png$/u);
    assert.ok(guide.channels.every(channel => channel.status === 'disabled'));
    assert.equal(h.runtime._connected, false);
    assert.deepEqual(h.calls, [], 'Opening the logo tab must not contact or wake a TV, XMLTV or GitHub.');
});

test('two actual runtimes keep manual logo assignments separate without changing TV targets or EPG revisions', async t => {
    const televisionPage = page();
    televisionPage.items[0].name = 'ZDF HD';
    const id = mergeChannelPage(null, televisionPage).services[0].id;
    const logos = ['countries/germany/hd/zdf-hd-de.png', 'countries/germany/hd/sat-1-hd-de.png'];
    const runtimes = [];
    for (let index = 0; index < 2; index++) {
        const h = await harness(t, { namespace: `loewe-tv.${index}`, page: televisionPage,
            config: { epgSource: 'tv', epgEnabled: false, channelLogoSource: 'registry',
                channelLogoMappings: [{ channel: id, mode: 'manual', logoId: logos[index] }] } });
        await h.runtime.channelObjects.whenIdle();
        runtimes.push(h);
        const beforeConfig = structuredClone(h.runtime.config);
        const beforeTarget = h.runtime.channelObjects.target(`${id}.select`);
        const beforeGuide = h.runtime.epg.guide();
        assert.ok(beforeGuide.channels[0].logoUrl.endsWith(`/${logos[index]}`));
        assert.equal(beforeGuide.instance, `loewe-tv.${index}`);
        const draft = { ...structuredClone(h.adapter.config), channelLogoCountry: 'ch',
            channelLogoMappings: [{ channel: id, mode: 'manual', logoId: logos[1 - index] }] };
        const response = await h.send(logoFormRequest(draft));
        assert.equal(response.native._logoMappingResponse.rows[0].logoId, logos[1 - index]);
        assert.deepEqual(h.runtime.config, beforeConfig, 'Loading a draft does not activate unsaved choices.');
        assert.deepEqual(h.runtime.channelObjects.target(`${id}.select`), beforeTarget);
        const afterGuide = h.runtime.epg.guide();
        assert.deepEqual(afterGuide.channels, beforeGuide.channels, 'A logo form preview cannot alter the live guide.');
        assert.equal(afterGuide.catalogRevision, beforeGuide.catalogRevision);
        assert.deepEqual(h.calls, []);
    }
    assert.notEqual(runtimes[0].runtime.epg.guide().channels[0].logoUrl, runtimes[1].runtime.epg.guide().channels[0].logoUrl);
});

test('a failed logo catalogue read or stale list choice keeps the form and current selection intact', async t => {
    for (const restoreError of [true, false]) {
        const h = await harness(t, { restoreError });
        await h.runtime.channelObjects.whenIdle();
        const selected = 'countries/germany/hd/zdf-hd-de.png';
        const draft = { ...structuredClone(h.adapter.config), channelListView: restoreError ? VIEW : 'unsaved-other-list',
            channelLogoSource: 'registry', channelLogoMappings: [{ channel: h.catalog.services[0].id, mode: 'manual', logoId: selected }] };
        const before = structuredClone(draft);
        const response = await h.send(logoFormRequest(draft));
        assert.equal(typeof response.error, 'string');
        assert.equal(Object.hasOwn(response, 'native'), false);
        const options = await h.send(logoFormRequest(draft, 'logoId', draft.channelLogoMappings[0]));
        assert.ok(Array.isArray(options));
        assert.ok(options.some(option => option.value === selected));
        assert.deepEqual(draft, before);
        assert.deepEqual(h.calls, []);
    }
});
