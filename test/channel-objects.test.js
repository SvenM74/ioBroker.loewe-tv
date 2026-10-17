'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { AdapterRuntime } = require('../lib/adapter-runtime');
const { parseChannelPage } = require('../lib/loewe-client');
const { MAX_CATALOG_BYTES } = require('../lib/channel-catalog');

const VIEW = 'fastscan-integration-fixture';
const DYNAMIC = /^channels\.(tv|radio)\.service_[a-f0-9]{64}(?:\.|$)/u;

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function response(action, fields = {}) {
    return { xml: `<Envelope><Body><${action}Response/></Body></Envelope>`,
        data: { Envelope: { Body: { [`${action}Response`]: fields } } } };
}

function entry(uuid, number = '1', itemClass = 'video') {
    return {
        '@_mediaItemUuid': uuid, '@_shortInfo': `Fixture ${uuid}`, '@_caption': number, '@_itemClass': itemClass,
        '@_locator': `channel://${number}:ch-${uuid}:sl-fixture`,
    };
}

function channels(entries, { view = VIEW, start = 0, total = entries.length, itemClass = 'undefined' } = {}) {
    return response('GetChannelList', {
        ChannelListView: view, ChannelListName: 'Integration fixture', ItemClass: itemClass,
        ResultItemFragment: {
            '@_startIndex': String(start), '@_totalResults': String(total), '@_returnedResults': String(entries.length),
            '@_hash': '4294967295', ResultItemReference: entries,
        },
    });
}

class FakeClient {
    constructor() {
        this.calls = [];
        this.nextChannels = channels([]);
        this.zapHook = null;
        this.keyHook = null;
        this.closed = false;
    }

    async getChannels(...args) {
        this.calls.push({ method: 'getChannels', args });
        return this.nextChannels;
    }

    async key(...args) {
        this.calls.push({ method: 'key', args });
        if (this.keyHook) await this.keyHook(...args);
        return response('InjectRCKey');
    }

    async zap(...args) {
        this.calls.push({ method: 'zap', args });
        if (this.zapHook) await this.zapHook(...args);
        return response('ZapToMedia');
    }

    close() { this.closed = true; }
}

class FakeAdapter {
    constructor() {
        this.namespace = 'loewe-tv.0';
        this.config = { host: 'tv.example.invalid', pollInterval: 0 };
        this.objects = new Map();
        this.states = new Map([['channels.view', { val: VIEW, ack: true }]]);
        this.writes = [];
        this.dynamicCalls = [];
        this.dynamicActive = 0;
        this.dynamicMax = 0;
        this.dynamicHook = null;
        this.stateHook = null;
        this.logs = [];
        this.log = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, message => this.logs.push({ level, message })]));
    }

    id(value) { return value.startsWith(`${this.namespace}.`) ? value.slice(this.namespace.length + 1) : value; }

    async dynamic(operation, id, run) {
        if (!DYNAMIC.test(id)) return run();
        const call = { operation, id };
        this.dynamicCalls.push(call);
        this.dynamicActive++;
        this.dynamicMax = Math.max(this.dynamicMax, this.dynamicActive);
        try {
            if (this.dynamicHook) await this.dynamicHook(call);
            return run();
        } finally {
            this.dynamicActive--;
        }
    }

    async extendObjectAsync(fullId, object) {
        const id = this.id(fullId);
        return this.dynamic('extend', id, () => {
            const previous = this.objects.get(id) || {};
            this.objects.set(id, { ...previous, ...structuredClone(object),
                common: { ...previous.common, ...structuredClone(object.common || {}) },
                native: { ...previous.native, ...structuredClone(object.native || {}) } });
        });
    }

    async setStateAsync(fullId, state) {
        const id = this.id(fullId);
        if (this.stateHook) await this.stateHook(id, state);
        return this.dynamic('write', id, () => {
            this.states.set(id, structuredClone(state));
            this.writes.push({ id, ...structuredClone(state) });
        });
    }

    async getStateAsync(fullId) { return this.states.get(this.id(fullId)) || null; }
    async getAdapterObjectsAsync() { return Object.fromEntries([...this.objects].map(([id, object]) => [`${this.namespace}.${id}`, structuredClone(object)])); }
    subscribeStates() {}
}

async function harness(t, prepare = () => {}, { idle = true } = {}) {
    const adapter = new FakeAdapter();
    const client = new FakeClient();
    prepare(adapter, client);
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => client });
    t.after(() => runtime.stop());
    await runtime.start();
    if (idle) await runtime.channelObjects.whenIdle();
    return { adapter, client, runtime };
}

function write(h, id, val, ack = false) {
    const state = { val, ack };
    h.adapter.states.set(id, state);
    return h.runtime.handleStateChange(`${h.adapter.namespace}.${id}`, state);
}

async function query(h, entries, options = {}) {
    h.client.nextChannels = channels(entries, options);
    await write(h, 'channels.view', options.view || VIEW);
    await write(h, 'channels.start', options.start || 0);
    await write(h, 'channels.mediaType', options.mediaType || '');
    await write(h, 'channels.getChannels', true);
    if (options.idle !== false) await h.runtime.channelObjects.whenIdle();
}

function service(h, uuid, type = 'video') {
    return [...h.runtime.channelObjects.services.values()].find(value => value.mediaItemUuid === uuid && value.itemClass === type);
}

function state(h, id) { return h.adapter.states.get(id); }

async function until(predicate, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return;
        await nextTurn();
    }
    assert.fail(message);
}

async function within(promise, message) {
    let timer;
    try {
        return await Promise.race([promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), 1000);
        })]);
    } finally { clearTimeout(timer); }
}

test('a mixed live list creates separate TV/radio services and preserves duplicate programme positions', async t => {
    const h = await harness(t);
    await query(h, [entry('first', '1'), entry('first', '100'), entry('first', '1000'), entry('second', '2'), entry('radio', '100', 'audio')]);
    assert.equal(h.runtime.channelObjects.services.size, 3);
    const first = service(h, 'first');
    const radio = service(h, 'radio', 'audio');
    assert.match(first.id, /^channels\.tv\./u);
    assert.match(radio.id, /^channels\.radio\./u);
    assert.ok(h.adapter.objects.has('channels.tv'));
    assert.ok(h.adapter.objects.has('channels.radio'));
    assert.equal(h.adapter.objects.get(first.id).common.name, '1 · Fixture first');
    assert.deepEqual(JSON.parse(state(h, `${first.id}.numbers`).val), ['1', '100', '1000']);
    assert.equal(state(h, `${radio.id}.number`).val, 100);
    assert.equal(state(h, `${first.id}.epg.status`).val, 'notImplemented');
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(h.client.calls.length, 1, 'Object materialization must not make extra TV requests.');
    assert.equal(state(h, 'channels.returnedNumber').val, 5);
});

test('select sends only the exact stored locator for boolean true with ack false and resets the button', async t => {
    const h = await harness(t);
    await query(h, [entry('first', '100'), entry('first', '1')]);
    const first = service(h, 'first');
    const button = `${first.id}.select`;
    h.client.calls.length = 0;
    await write(h, button, true, true);
    await write(h, button, false);
    await write(h, button, 'true');
    await write(h, button, 1);
    await write(h, `${first.id}.locator`, 'channel://999:ch-wrong:sl-fixture');
    assert.equal(h.client.calls.length, 0);
    assert.match(state(h, 'info.lastError').val, /VALIDATION/u);
    assert.deepEqual(state(h, button), { val: false, ack: true });
    await write(h, button, true);
    assert.deepEqual(h.client.calls, [{ method: 'zap', args: ['channel://1:ch-first:sl-fixture'] }]);
    assert.deepEqual(state(h, button), { val: false, ack: true });
});

test('a failed channel selection resets the momentary button and reports the transport error', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const button = `${service(h, 'first').id}.select`;
    h.client.zapHook = async () => { throw Object.assign(new Error('Fixture timeout'), { code: 'NETWORK' }); };
    await write(h, button, true);
    assert.deepEqual(state(h, button), { val: false, ack: true });
    assert.match(state(h, 'info.lastError').val, /NETWORK.*Fixture timeout/u);
});

test('upgrade from 0.1.2 builds sender objects from channels.items without contacting the TV', async t => {
    const raw = channels([entry('first'), entry('radio', '100', 'audio')]).data;
    const h = await harness(t, adapter => adapter.states.set('channels.items', { val: JSON.stringify(raw), ack: true }));
    assert.equal(h.client.calls.length, 0);
    assert.equal(h.runtime.channelObjects.services.size, 2);
    assert.equal(state(h, `${service(h, 'first').id}.select`).val, false);
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(JSON.parse(state(h, 'channels.catalog').val).schemaVersion, 1);
});

test('restart restores cache/native service identities and clears saved true buttons without replaying them', async t => {
    const original = await harness(t);
    await query(original, [entry('first'), entry('radio', '100', 'audio')]);
    const button = `${service(original, 'first').id}.select`;
    const gate = deferred();
    t.after(() => gate.resolve());
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(original.adapter.objects);
        adapter.states = structuredClone(original.adapter.states);
        adapter.states.set(button, { val: true, ack: false });
        adapter.dynamicHook = call => call.operation === 'extend' ? gate.promise : undefined;
    }, { idle: false });
    await until(() => restarted.adapter.dynamicCalls.length > 0, 'Expected sender restoration to start.');
    await restarted.runtime.handleStateChange(`${restarted.adapter.namespace}.${button}`, { val: true, ack: false });
    assert.equal(restarted.client.calls.length, 0, 'An unregistered startup value cannot trigger a command.');
    gate.resolve();
    await restarted.runtime.channelObjects.whenIdle();
    assert.equal(restarted.client.calls.length, 0);
    assert.deepEqual(state(restarted, button), { val: false, ack: true });
    assert.equal(service(restarted, 'first').id, service(original, 'first').id);
    await write(restarted, button, true);
    assert.deepEqual(restarted.client.calls, [{ method: 'zap', args: ['channel://1:ch-first:sl-fixture'] }]);
});

test('native restoration with a saved or live partial first page preserves availability and archived services', async t => {
    const original = await harness(t);
    await query(original, [entry('first'), entry('second', '2'), entry('archived', '4'), entry('radio', '100', 'audio')]);
    await query(original, [entry('first'), entry('second', '2')], { mediaType: 'video' });
    assert.equal(service(original, 'archived').available, false);
    for (const source of ['saved', 'live']) {
        const restarted = await harness(t, adapter => {
            adapter.objects = structuredClone(original.adapter.objects);
            adapter.states.set('channels.catalog', { val: '{}', ack: true });
            const raw = source === 'saved'
                ? JSON.stringify(channels([entry('new', '3')], { start: 0, total: 5, itemClass: 'video' }).data) : '{}';
            adapter.states.set('channels.items', { val: raw, ack: true });
        });
        assert.equal(restarted.client.calls.length, 0);
        assert.equal(service(restarted, 'first').available, true);
        if (source === 'live') await query(restarted, [entry('new', '3')], { start: 0, total: 5, mediaType: 'video' });
        for (const uuid of ['first', 'second', 'new']) {
            const restored = service(restarted, uuid);
            assert.equal(restored.available, true, `${uuid} must remain selectable after an incomplete ${source} response.`);
            assert.equal(state(restarted, `${restored.id}.available`).val, true);
        }
        assert.equal(service(restarted, 'radio', 'audio').available, true);
        assert.equal(service(restarted, 'archived').available, false);
        assert.equal(state(restarted, `${service(restarted, 'archived').id}.available`).val, false);
    }
});

test('only complete responses deactivate absent services and filtered refreshes preserve the other type', async t => {
    const h = await harness(t);
    await query(h, [entry('first'), entry('second', '2'), entry('radio', '100', 'audio')]);
    const oldButton = `${service(h, 'second').id}.select`;
    await query(h, [entry('new', '3')], { total: 5, mediaType: 'video' });
    assert.equal(service(h, 'first').available, true);
    assert.equal(service(h, 'second').available, true);
    // Both jobs are consumed by one worker batch. Its final partial query must
    // not undo the deactivation established by the preceding complete answer.
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('first', '7')])), 'video');
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('last', '9')], { start: 0, total: 3 })), 'video');
    await h.runtime.channelObjects.whenIdle();
    assert.equal(h.runtime.channelObjects.catalog.lastQuery.reconciled, false);
    assert.equal(service(h, 'first').number, 7);
    assert.equal(service(h, 'first').available, true);
    assert.equal(service(h, 'second').available, false);
    assert.equal(service(h, 'new').available, false);
    assert.equal(service(h, 'last').available, true);
    assert.equal(service(h, 'radio', 'audio').available, true);
    assert.ok(h.adapter.objects.has(oldButton), 'Retired channel objects remain to preserve user references.');
    const before = h.client.calls.length;
    await write(h, oldButton, true);
    assert.equal(h.client.calls.length, before);
    assert.match(state(h, 'info.lastError').val, /CHANNEL_UNAVAILABLE/u);
    assert.deepEqual(state(h, oldButton), { val: false, ack: true });
    await query(h, [], { mediaType: 'audio' });
    assert.equal(service(h, 'radio', 'audio').available, false);
    assert.equal(service(h, 'first').available, true);
});

test('switching channel lists keeps old objects inactive and a queued removed target is not sent', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const oldId = service(h, 'first').id;
    const hold = deferred();
    const cacheHold = deferred();
    t.after(() => hold.resolve());
    t.after(() => cacheHold.resolve());
    h.client.keyHook = () => hold.promise;
    const home = write(h, 'remote.home', true);
    await until(() => h.client.calls.some(call => call.method === 'key'), 'Expected blocking TV command to start.');
    const select = write(h, `${oldId}.select`, true);
    let cacheStarted = false;
    h.adapter.stateHook = id => {
        if (id !== 'channels.catalog') return;
        cacheStarted = true;
        return cacheHold.promise;
    };
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('replacement', '2')], { view: 'favlist-other' })), '');
    await until(() => cacheStarted, 'Expected the newly received list to wait on its cache write.');
    assert.equal(h.runtime.channelObjects.services.get(oldId).available, true, 'The race is tested before the old service map is replaced.');
    const newlySelected = write(h, `${oldId}.select`, true);
    hold.resolve();
    await within(Promise.all([home, select, newlySelected]), 'Queued selections waited for the blocked catalogue cache.');
    assert.equal(h.client.calls.some(call => call.method === 'zap'), false);
    assert.match(state(h, 'info.lastError').val, /CHANNEL_UPDATING/u);
    cacheHold.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(h.runtime.channelObjects.services.get(oldId).available, false);
    await write(h, `${oldId}.select`, true);
    assert.match(state(h, 'info.lastError').val, /CHANNEL_UNAVAILABLE/u);
    assert.ok(h.adapter.objects.has(oldId));
});

test('slow sender object creation does not block the remote-control command queue', async t => {
    const h = await harness(t);
    const hold = deferred();
    t.after(() => hold.resolve());
    h.adapter.dynamicHook = call => call.operation === 'extend' ? hold.promise : undefined;
    const listId = 'sl11111111-2222-4333-8444-555555555555';
    const entries = Array.from({ length: 372 }, (_, index) => {
        const uuid = `chl0:00-00080001ffff${(index + 1).toString(16).padStart(8, '0')}`;
        const channelId = `ch00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
        return {
            ...entry(uuid, String(index + 1), index < 280 ? 'video' : 'audio'),
            '@_shortInfo': `Testprogramm ${index + 1} mit langem Sendernamen HD`,
            '@_locator': `channel://${index + 1}:${channelId}:${listId}`,
            '@_thumbnailUrl': `http://tv.example.invalid:1543/lt0/xetn/0/$1$${listId}$${channelId}`,
            '@_streamingUrl': `http://tv.example.invalid:1543/lt0/0/$1$${listId}$${channelId}`,
        };
    });
    await query(h, entries, { view: `fastscan${listId}`, idle: false });
    await until(() => h.adapter.dynamicActive === 2, 'Expected two pending sender object operations.');
    await within(write(h, 'remote.home', true), 'remote.home waited for slow sender object creation.');
    assert.ok(h.client.calls.some(call => call.method === 'key' && call.args[0] === 'home'));
    assert.equal(h.adapter.dynamicActive, 2, 'The slow object operations must still be pending.');
    hold.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(h.runtime.channelObjects.services.size, 372);
    const cacheBytes = Buffer.byteLength(state(h, 'channels.catalog').val, 'utf8');
    assert.ok(cacheBytes < MAX_CATALOG_BYTES, '372 realistic entries must fit in the persistent catalogue.');
    assert.equal(state(h, 'channels.catalog').val.includes('tv.example.invalid'), false);
    t.diagnostic(`372 synthetic services, persisted catalogue ${cacheBytes} bytes, limit ${MAX_CATALOG_BYTES} bytes.`);
});

test('stop prevents new sender object/database operations after already started calls settle', async t => {
    const h = await harness(t);
    const hold = deferred();
    t.after(() => hold.resolve());
    h.adapter.dynamicHook = () => hold.promise;
    await query(h, [entry('first'), entry('second', '2'), entry('third', '3')], { idle: false });
    await until(() => h.adapter.dynamicActive === 2, 'Expected materialization to be in progress.');
    await h.runtime.stop();
    const callsAtStop = h.adapter.dynamicCalls.length;
    hold.resolve();
    await h.runtime.channelObjects.whenIdle();
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('late', '9')])), '');
    await nextTurn();
    assert.equal(h.adapter.dynamicCalls.length, callsAtStop);
    assert.equal(h.client.closed, true);
    assert.equal(h.runtime.channelObjects.pending.length, 0);
});

test('sender materialization limits concurrent dynamic database calls to two', async t => {
    const h = await harness(t);
    h.adapter.dynamicHook = () => nextTurn();
    await query(h, Array.from({ length: 5 }, (_, index) => entry(`service-${index}`, String(index + 1))));
    assert.equal(h.adapter.dynamicMax, 2);
    assert.equal(h.adapter.dynamicActive, 0);
    assert.ok(h.adapter.dynamicCalls.some(call => call.operation === 'extend'));
    assert.ok(h.adapter.dynamicCalls.some(call => call.operation === 'write'));
    assert.equal(h.runtime.channelObjects.applied.size, 5);
});

test('a database failure aborts the current materialization batch and the next query can recover', async t => {
    const h = await harness(t);
    const hold = deferred();
    t.after(() => hold.resolve());
    let started = 0;
    h.adapter.dynamicHook = () => {
        if (++started === 1) throw Object.assign(new Error('Fixture object database failure'), { code: 'DATABASE' });
        return hold.promise;
    };
    await query(h, [entry('first'), entry('second', '2'), entry('third', '3')], { idle: false });
    await until(() => h.runtime.channelObjects.batchFailed, 'Expected the materialization batch to stop after a database failure.');
    hold.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.ok(h.adapter.dynamicCalls.length <= 2, 'Failure must prevent further object or state calls in this batch.');
    assert.equal(h.runtime.channelObjects.applied.size, 0);
    assert.equal(state(h, 'channels.catalogStatus').val, 'error');
    assert.match(state(h, 'channels.catalogError').val, /DATABASE.*Fixture object database failure/u);
    await write(h, 'remote.home', true);
    assert.ok(h.client.calls.some(call => call.method === 'key'));
    h.adapter.dynamicHook = null;
    await query(h, [entry('first'), entry('second', '2'), entry('third', '3')]);
    assert.equal(h.runtime.channelObjects.applied.size, 3);
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(state(h, 'channels.catalogError').val, '');
});
