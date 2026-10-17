'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { createHash } = require('node:crypto');
const { AdapterRuntime } = require('../lib/adapter-runtime');
const { parseChannelPage } = require('../lib/loewe-client');
const { MAX_CATALOG_BYTES } = require('../lib/channel-catalog');

const VIEW = 'fastscan-integration-fixture';
const DYNAMIC = /^channels\.(tv|radio)\.[A-Za-z0-9_]+(?:\.|$)/u;
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
        const result = this.zapHook ? await this.zapHook(...args) : null;
        return result || response('ZapToMedia', { Result: '0' });
    }

    close() { this.closed = true; }
}

class FakeAdapter {
    constructor() {
        this.namespace = 'loewe-tv.0';
        this.config = { host: 'tv.example.invalid', pollInterval: 0, channelRefreshInterval: 0 };
        this.objects = new Map();
        this.states = new Map([['channels.view', { val: VIEW, ack: true }]]);
        this.writes = [];
        this.dynamicCalls = [];
        this.dynamicActive = 0;
        this.dynamicMax = 0;
        this.dynamicHook = null;
        this.stateHook = null;
        this.inventoryHook = null;
        this.objectHook = null;
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
    async getObjectAsync(fullId) {
        const id = this.id(fullId);
        if (this.objectHook) await this.objectHook(id);
        return structuredClone(this.objects.get(id) || null);
    }
    async getObjectListAsync(options) {
        if (this.inventoryHook) return this.inventoryHook(options);
        assert.equal(options.include_docs, true);
        return { rows: [...this.objects].map(([id, doc]) => ({ id: `${this.namespace}.${id}`, doc: structuredClone(doc) }))
            .filter(row => row.id >= options.startkey && row.id <= options.endkey) };
    }
    async delObjectAsync(fullId, options) {
        const id = this.id(fullId);
        if (options.recursive) {
            assert.ok(['channels.radio', 'api'].includes(id), 'Only explicitly removed adapter trees may be deleted recursively.');
            for (const store of [this.objects, this.states]) {
                for (const childId of store.keys()) if (childId === id || childId.startsWith(`${id}.`)) store.delete(childId);
            }
            return;
        }
        assert.equal(options.recursive, false, 'Sender cleanup must never remove an arbitrary subtree.');
        return this.dynamic('delete', id, () => {
            if (this.objects.get(id)?.common?.dontDelete) return;
            this.objects.delete(id);
            this.states.delete(id);
        });
    }
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

test('a mixed list creates only named TV folders and preserves TV positions plus raw pagination', async t => {
    const h = await harness(t);
    await query(h, [entry('first', '1'), entry('first', '100'), entry('first', '1000'), entry('second', '2'), entry('radio', '100', 'audio')]);
    assert.equal(h.runtime.channelObjects.services.size, 2);
    const first = service(h, 'first');
    const radio = service(h, 'radio', 'audio');
    assert.match(first.id, /^channels\.tv\./u);
    assert.equal(radio, undefined);
    assert.ok(h.adapter.objects.has('channels.tv'));
    assert.equal(h.adapter.objects.has('channels.radio'), false);
    assert.equal(first.id, 'channels.tv.Fixture_first');
    assert.equal(h.adapter.objects.get(first.id).common.name, '1');
    assert.equal(h.adapter.objects.get(first.id).common.desc, 'Fixture first');
    assert.deepEqual(JSON.parse(state(h, `${first.id}.numbers`).val), ['1', '100', '1000']);
    assert.equal(state(h, `${first.id}.number`).val, 1);
    assert.equal(state(h, `${first.id}.locator`).val, 'channel://1:ch-first:sl-fixture');
    assert.deepEqual(JSON.parse(state(h, `${first.id}.locators`).val), [1, 100, 1000].map(number => `channel://${number}:ch-first:sl-fixture`));
    assert.equal(state(h, `${first.id}.epg.status`).val, 'notImplemented');
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(h.client.calls.length, 1, 'Object materialization must not make extra TV requests.');
    assert.equal(state(h, 'channels.returnedNumber').val, 5);
    assert.equal(h.client.calls[0].args[3], 'video');
    assert.equal(JSON.parse(state(h, 'channels.entries').val).length, 4);
    assert.equal(h.adapter.dynamicCalls.some(call => call.id.startsWith('channels.radio.')), false);
    const catalog = JSON.parse(state(h, 'channels.catalog').val);
    assert.equal(catalog.pages[0].returnedResults, 5);
    assert.equal(catalog.pages[0].ignoredAudioResults, 1);
    assert.equal(catalog.lastQuery.reconciled, true);
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

test('nonzero ZapToMedia result is an error for channel buttons and manual locators without a resend', async t => {
    const h = await harness(t);
    await query(h, [entry('tv'), entry('radio', '100', 'audio')]);
    h.client.zapHook = () => response('ZapToMedia', { Result: '3' });
    for (const button of [`${service(h, 'tv').id}.select`]) {
        h.client.calls.length = 0;
        await write(h, button, true);
        assert.equal(h.client.calls.filter(call => call.method === 'zap').length, 1);
        assert.equal(h.client.calls.filter(call => call.method === 'getCurrentPlayback').length, 0);
        assert.equal(h.client.calls.at(-1).method, 'zap');
        const report = JSON.parse(state(h, 'channels.lastSelection').val);
        assert.equal(report.result, 3);
        assert.equal(report.status, 'error');
        assert.equal(report.phase, 'zap');
        assert.match(report.error, /TV_REJECTED.*Result=3/u);
        assert.match(state(h, 'info.lastError').val, /TV_REJECTED/u);
        assert.equal(state(h, 'info.connection').val, true, 'A command rejection does not mean the TV is offline.');
    }
    await write(h, 'media.locator', 'channel://1:ch-manual:sl-fixture');
    assert.match(state(h, 'info.lastError').val, /TV_REJECTED/u);
});

test('upgrade from 0.1.2 builds sender objects from channels.items without contacting the TV', async t => {
    const raw = channels([entry('first'), entry('radio', '100', 'audio')]).data;
    const h = await harness(t, adapter => adapter.states.set('channels.items', { val: JSON.stringify(raw), ack: true }));
    assert.equal(h.client.calls.length, 0);
    assert.equal(h.runtime.channelObjects.services.size, 1);
    assert.equal(state(h, `${service(h, 'first').id}.select`).val, false);
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(JSON.parse(state(h, 'channels.catalog').val).schemaVersion, 3);
    assert.equal(h.adapter.objects.has('channels.radio.Fixture_radio'), false);
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

test('old named radio caches and native objects cannot return after TV-only startup or execute a saved selection', async t => {
    const original = await harness(t);
    await query(original, [entry('first')]);
    const radio = { ...legacyService('old-radio', [100], 'audio'), id: 'channels.radio.Fixture_old_radio' };
    const mixedResponse = channels([entry('first'), entry('old-radio', '100', 'audio')]);
    const mixedPage = parseChannelPage(mixedResponse);
    const oldCache = JSON.parse(state(original, 'channels.catalog').val);
    oldCache.services.push(radio);
    oldCache.pages = [{ ...mixedPage, mediaType: '' }];
    oldCache.lastQuery = { ...oldCache.lastQuery, totalResults: 2, returnedResults: 2 };
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(original.adapter.objects);
        adapter.objects.set(radio.id, { type: 'channel', common: { name: '100' }, native: {
            managedBy: 'loewe-tv-channel-catalog', schemaVersion: 3, channelService: { schemaVersion: 3, service: radio },
        } });
        adapter.objects.set(`${radio.id}.select`, { type: 'state', common: { type: 'boolean', write: true }, native: {
            managedBy: 'loewe-tv-channel-catalog',
        } });
        adapter.states.set(`${radio.id}.select`, { val: true, ack: false });
        adapter.states.set('channels.catalog', { val: JSON.stringify(oldCache), ack: true });
        adapter.states.set('channels.items', { val: JSON.stringify(mixedResponse.data), ack: true });
        adapter.states.set('channels.entries', { val: JSON.stringify(mixedPage.items), ack: true });
    });
    assert.equal(restarted.runtime.channelObjects.services.size, 1);
    assert.equal(service(restarted, 'first').id, service(original, 'first').id);
    assert.equal(service(restarted, 'old-radio', 'audio'), undefined);
    assert.equal([...restarted.adapter.objects.keys()].some(id => id === 'channels.radio' || id.startsWith('channels.radio.')), false);
    assert.equal(restarted.adapter.dynamicCalls.some(call => call.id.startsWith('channels.radio.')), false);
    assert.equal(state(restarted, `${radio.id}.select`), undefined);
    assert.equal(state(restarted, 'channels.catalog').val.includes('old-radio'), false);
    assert.deepEqual(JSON.parse(state(restarted, 'channels.entries').val).map(item => item.itemClass), ['video']);
    await restarted.runtime.handleStateChange(`${restarted.adapter.namespace}.${radio.id}.select`, { val: true, ack: false });
    assert.equal(restarted.client.calls.length, 0);

    const manager = restarted.runtime.channelObjects;
    const epoch = manager.selectionEpoch;
    assert.throws(() => manager.acceptPage(mixedPage, 'audio'), { code: 'VALIDATION' });
    assert.equal(manager.selectionEpoch, epoch);
    // Defense in depth: even a stale injected map entry cannot become a target.
    manager.services.set(radio.id, radio);
    assert.throws(() => manager.target(`${radio.id}.select`), { code: 'CHANNEL_UNAVAILABLE' });
    assert.throws(() => manager.checkTarget({ ...radio, epoch }), { code: 'CHANNEL_UNAVAILABLE' });
    manager.services.delete(radio.id);
    await write(restarted, `${service(restarted, 'first').id}.select`, true);
    assert.deepEqual(restarted.client.calls, [{ method: 'zap', args: ['channel://1:ch-first:sl-fixture'] }]);
});

test('native restoration with a saved or live partial first page preserves unqueried positions', async t => {
    const original = await harness(t);
    await query(original, [entry('first'), entry('second', '2'), entry('archived', '4'), entry('radio', '100', 'audio')]);
    await query(original, [entry('first'), entry('second', '2')], { mediaType: 'video' });
    assert.equal(service(original, 'archived'), undefined);
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
        assert.equal(service(restarted, 'radio', 'audio'), undefined);
        assert.equal(service(restarted, 'archived'), undefined);
        assert.equal(restarted.adapter.objects.has('channels.tv.Fixture_archived'), false);
    }
});

test('only complete TV responses delete absent managed positions while partial and ignored audio rows preserve history', async t => {
    const h = await harness(t);
    await query(h, [entry('first'), entry('second', '2'), entry('radio', '100', 'audio')]);
    const oldButton = `${service(h, 'second').id}.select`;
    await query(h, [entry('new', '3')], { total: 5, mediaType: 'video' });
    assert.equal(service(h, 'first').available, true);
    assert.equal(service(h, 'second').available, true);
    // Both jobs are consumed by one worker batch. Its final partial query must
    // not undo the removal established by the preceding complete answer.
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('first', '7')])), 'video');
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('last', '9')], { start: 0, total: 3 })), 'video');
    await h.runtime.channelObjects.whenIdle();
    assert.equal(h.runtime.channelObjects.catalog.lastQuery.reconciled, false);
    assert.equal(service(h, 'first').number, 7);
    assert.equal(service(h, 'first').available, true);
    assert.equal(service(h, 'second'), undefined);
    assert.equal(service(h, 'new'), undefined);
    assert.equal(service(h, 'last').available, true);
    assert.equal(service(h, 'radio', 'audio'), undefined);
    assert.equal(h.adapter.objects.has(oldButton), false);
    assert.equal(state(h, oldButton), undefined);
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_first'), true, 'Moving a service must preserve its folder ID.');
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').common.name, '7');
    const before = h.client.calls.length;
    await h.runtime.handleStateChange(`${h.adapter.namespace}.${oldButton}`, { val: true, ack: false });
    assert.equal(h.client.calls.length, before);
    assert.equal(state(h, oldButton), undefined);
    await query(h, [entry('audio-only', '7', 'audio')]);
    assert.equal(service(h, 'first').available, true);
    assert.equal(h.runtime.channelObjects.catalog.lastQuery.reconciled, false);
    await query(h, []);
    assert.equal(h.runtime.channelObjects.services.size, 0);
});

test('switching lists deletes obsolete folders and cancels queued selections of the former list', async t => {
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
    assert.equal(h.runtime.channelObjects.services.has(oldId), false);
    assert.equal(h.adapter.objects.has(oldId), false);
    assert.equal(state(h, `${oldId}.select`), undefined);
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
    assert.equal(h.runtime.channelObjects.services.size, 280);
    const cacheBytes = Buffer.byteLength(state(h, 'channels.catalog').val, 'utf8');
    assert.ok(cacheBytes < MAX_CATALOG_BYTES, '372 realistic entries must fit in the persistent catalogue.');
    assert.equal(state(h, 'channels.catalog').val.includes('tv.example.invalid'), false);
    assert.equal(h.runtime.channelObjects.catalog.lastQuery.returnedResults, 372);
    assert.equal(h.runtime.channelObjects.catalog.lastQuery.ignoredAudioResults, 92);
    assert.equal(h.adapter.dynamicCalls.some(call => call.id.startsWith('channels.radio.')), false);
    t.diagnostic(`372 mixed references / 280 TV services, persisted catalogue ${cacheBytes} bytes, limit ${MAX_CATALOG_BYTES} bytes.`);
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

function legacyService(uuid, numbers, itemClass = 'video') {
    const positions = numbers.map(number => ({ caption: String(number), locator: `channel://${number}:ch-${uuid}:sl-fixture` }));
    const id = `channels.${itemClass === 'video' ? 'tv' : 'radio'}.service_${createHash('sha256')
        .update(JSON.stringify([VIEW, itemClass, 'uuid', uuid])).digest('hex')}`;
    return { id, listView: VIEW, itemClass, mediaItemUuid: uuid, name: `Fixture ${uuid}`,
        caption: positions[0].caption, number: Number(positions[0].caption), locator: positions[0].locator, positions, available: true };
}

function installLegacy(adapter, services, cache = true) {
    for (const service of services) {
        adapter.objects.set(service.id, { type: 'channel', common: { name: `${service.caption} · ${service.name}` },
            native: { managedBy: 'loewe-tv-channel-catalog', schemaVersion: 1,
                channelService: { schemaVersion: 1, service } } });
        for (const [suffix, type, val] of [
            ['name', 'string', service.name], ['number', 'number', service.number],
            ['numbers', 'string', JSON.stringify(service.positions.map(position => position.caption))],
            ['positions', 'string', JSON.stringify(service.positions)], ['locator', 'string', service.locator],
            ['locators', 'string', JSON.stringify(service.positions.map(position => position.locator))],
            ['mediaItemUuid', 'string', service.mediaItemUuid], ['listView', 'string', service.listView],
            ['available', 'boolean', true], ['select', 'boolean', true], ['epg.status', 'string', 'notImplemented'],
        ]) {
            const id = `${service.id}.${suffix}`;
            adapter.objects.set(id, { type: 'state', common: { name: suffix, type, read: true, write: suffix === 'select' }, native: {} });
            adapter.states.set(id, { val, ack: suffix !== 'select' });
        }
        adapter.objects.set(`${service.id}.epg`, { type: 'channel', common: { name: 'Programmdaten' }, native: {} });
    }
    if (cache) {
        const count = services.reduce((sum, service) => sum + service.positions.length, 0);
        adapter.states.set('channels.catalog', { val: JSON.stringify({ schemaVersion: 1, view: VIEW, name: 'Legacy fixture',
            updatedAt: 1, pages: [], services, lastQuery: { mediaType: '', startIndex: 0, totalResults: count,
                returnedResults: count, complete: true, reconciled: true, skipped: 0 } }), ack: true });
    }
}

function numericService(uuid, number, itemClass = 'video') {
    return { ...legacyService(uuid, [number], itemClass), id: `channels.${itemClass === 'video' ? 'tv' : 'radio'}.${number}` };
}

function installNumeric(adapter, services, cache = true) {
    installLegacy(adapter, services, cache);
    for (const service of services) {
        const root = adapter.objects.get(service.id);
        root.native.schemaVersion = 2;
        root.native.channelService.schemaVersion = 2;
        root.common.name = service.name;
        for (const [id, object] of adapter.objects) {
            if (id.startsWith(`${service.id}.`)) object.native.managedBy = 'loewe-tv-channel-catalog';
        }
    }
    if (cache) {
        const saved = adapter.states.get('channels.catalog');
        saved.val = JSON.stringify({ ...JSON.parse(saved.val), schemaVersion: 2 });
    }
}

test('numeric 0.1.4 caches and native roots migrate to stable service names without losing duplicate positions', async t => {
    const previous = [numericService('first', 1), numericService('first', 100), numericService('first', 1000),
        numericService('radio', 100, 'audio')];
    for (const cache of [true, false]) {
        const h = await harness(t, adapter => installNumeric(adapter, previous, cache));
        assert.equal(h.runtime.channelObjects.services.size, 1);
        assert.equal(h.client.calls.length, 0);
        assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').common.name, '1');
        assert.deepEqual(JSON.parse(state(h, 'channels.tv.Fixture_first.numbers').val), ['1', '100', '1000']);
        assert.equal(h.adapter.objects.has('channels.radio.Fixture_radio'), false);
        for (const old of previous) {
            assert.equal(h.adapter.objects.has(old.id), false);
            assert.equal(state(h, `${old.id}.select`), undefined);
        }
        await write(h, 'channels.tv.Fixture_first.select', true);
        assert.deepEqual(h.client.calls, [{ method: 'zap', args: ['channel://1:ch-first:sl-fixture'] }]);
    }
});

test('current named native objects outrank stale numeric caches and retain collision IDs after restart', async t => {
    const original = await harness(t);
    const sharedName = uuid => ({ ...entry(uuid, uuid === 'first' ? '7' : '8'), '@_shortInfo': 'Shared HD' });
    await query(original, [sharedName('first'), sharedName('second')]);
    const expected = new Map([...original.runtime.channelObjects.services.values()].map(value => [value.mediaItemUuid, value]));
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(original.adapter.objects);
        installNumeric(adapter, [numericService('first', 1), numericService('first', 100), numericService('second', 2)]);
    });
    for (const uuid of ['first', 'second']) {
        const restored = service(restarted, uuid);
        assert.equal(restored.id, expected.get(uuid).id);
        assert.deepEqual(restored.positions, expected.get(uuid).positions);
        assert.equal(restarted.adapter.objects.get(restored.id).common.name, String(expected.get(uuid).number));
    }
    assert.equal(restarted.runtime.channelObjects.services.size, 2);
    assert.equal(restarted.client.calls.length, 0);
});

test('an old active catalogue cannot reactivate a retired named native root', async t => {
    const original = await harness(t);
    await query(original, [entry('first')]);
    const oldCache = structuredClone(state(original, 'channels.catalog'));
    original.adapter.objects.set('channels.tv.Fixture_first.note', { type: 'state', common: { type: 'string' }, native: {} });
    await query(original, []);
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(original.adapter.objects);
        adapter.states.set('channels.catalog', oldCache);
    });
    assert.equal(restarted.runtime.channelObjects.services.size, 0);
    assert.equal(restarted.adapter.objects.get('channels.tv.Fixture_first').native.channelRetired, true);
    assert.equal(restarted.adapter.objects.get('channels.tv.Fixture_first.select').common.write, false);
    assert.equal(restarted.client.calls.length, 0);
});

test('a newer unavailable native occupant blocks a stale active numeric-cache occupant of that position', async t => {
    const original = await harness(t);
    await query(original, [{ ...entry('new'), '@_locator': '' }]);
    assert.equal(service(original, 'new').available, false);
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(original.adapter.objects);
        installNumeric(adapter, [numericService('old', 1)]);
    });
    assert.equal(service(restarted, 'new').available, false);
    assert.equal(service(restarted, 'old').available, false);
    await write(restarted, 'channels.tv.Fixture_old.select', true);
    assert.equal(restarted.client.calls.some(call => call.method === 'zap'), false);
    assert.match(state(restarted, 'info.lastError').val, /CHANNEL_UNAVAILABLE/u);
});

test('conflicting old numeric names cannot discard a fresh response queued during restoration', async t => {
    const gate = deferred();
    t.after(() => gate.resolve());
    let readingCache = false;
    const h = await harness(t, adapter => {
        installNumeric(adapter, [numericService('first', 1),
            { ...numericService('first', 100), name: 'An older partial name' }, numericService('radio', 100, 'audio')], false);
        let restoring = false;
        const getObjects = adapter.getAdapterObjectsAsync.bind(adapter);
        adapter.getAdapterObjectsAsync = async () => {
            restoring = true;
            return getObjects();
        };
        const getState = adapter.getStateAsync.bind(adapter);
        adapter.getStateAsync = async id => {
            if (restoring && adapter.id(id) === 'channels.catalog') {
                readingCache = true;
                await gate.promise;
            }
            return getState(id);
        };
    }, { idle: false });
    await until(() => readingCache, 'Expected startup to wait for its cache.');
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('first', '7')])), 'video');
    gate.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(h.runtime.channelObjects.services.size, 1);
    assert.equal(state(h, 'channels.tv.Fixture_first.number').val, 7);
    assert.equal(service(h, 'radio', 'audio'), undefined);
    assert.equal(h.adapter.objects.has('channels.tv.1'), false);
    assert.equal(h.adapter.objects.has('channels.tv.100'), false);
    assert.ok(h.adapter.logs.some(log => /ungültige gespeicherte Senderobjekte/u.test(log.message)));
    await write(h, 'channels.tv.Fixture_first.select', true);
    assert.deepEqual(h.client.calls, [{ method: 'zap', args: ['channel://7:ch-first:sl-fixture'] }]);
});

test('sorting preserves station IDs, user configuration and the exact new selection locator', async t => {
    const h = await harness(t);
    await query(h, [entry('first'), entry('second', '2'), entry('radio', '100', 'audio')]);
    const oldIds = new Map([...h.runtime.channelObjects.services.values()].map(value => [value.mediaItemUuid, value.id]));
    h.adapter.objects.get('channels.tv.Fixture_first').common.custom = { 'history.0': { enabled: true } };
    await query(h, [entry('second', '1'), entry('first', '7'), entry('radio', '200', 'audio')]);
    for (const current of h.runtime.channelObjects.services.values()) assert.equal(current.id, oldIds.get(current.mediaItemUuid));
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').common.name, '7');
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_second').common.name, '1');
    assert.equal(h.adapter.objects.has('channels.radio.Fixture_radio'), false);
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').common.desc, 'Fixture first');
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').common.custom['history.0'].enabled, true);
    assert.equal(h.adapter.dynamicCalls.some(call => call.operation === 'delete'), false);
    await write(h, 'channels.tv.Fixture_first.select', true);
    await write(h, 'channels.tv.Fixture_second.select', true);
    assert.deepEqual(h.client.calls.filter(call => call.method === 'zap').map(call => call.args), [
        ['channel://7:ch-first:sl-fixture'], ['channel://1:ch-second:sl-fixture'],
    ]);
});

test('an actual station rename changes its name ID and preserves a protected old folder disabled', async t => {
    const h = await harness(t);
    await query(h, [entry('first'), entry('second', '2')]);
    h.adapter.objects.get('channels.tv.Fixture_first').common.custom = { 'history.0': { enabled: true } };
    const renamed = { ...entry('first', '4'), '@_shortInfo': 'Neuer Sendername HD' };
    await query(h, [renamed, entry('replacement', '1')]);
    assert.equal(h.adapter.objects.get('channels.tv.Neuer_Sendername_HD').common.name, '4');
    assert.equal(h.adapter.objects.get('channels.tv.Neuer_Sendername_HD').common.desc, 'Neuer Sendername HD');
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').native.channelRetired, true);
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first.select').common.write, false);
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_second'), false);
    assert.equal(state(h, 'channels.tv.Fixture_replacement.mediaItemUuid').val, 'replacement');
    await write(h, 'channels.tv.Fixture_replacement.select', true);
    await write(h, 'channels.tv.Neuer_Sendername_HD.select', true);
    assert.deepEqual(h.client.calls.filter(call => call.method === 'zap').map(call => call.args), [
        ['channel://1:ch-replacement:sl-fixture'], ['channel://4:ch-first:sl-fixture'],
    ]);
});

test('v1 grouped cache and native folders migrate offline to name IDs and remove old generated objects', async t => {
    const legacy = [legacyService('first', [1, 100, 1000]), legacyService('radio', [100], 'audio')];
    for (const cache of [true, false]) {
        const h = await harness(t, adapter => installLegacy(adapter, legacy, cache));
        assert.equal(h.runtime.channelObjects.services.size, 1);
        assert.equal(h.client.calls.length, 0);
        for (const id of ['channels.tv.Fixture_first']) {
            assert.ok(h.adapter.objects.has(id), id);
            assert.deepEqual(state(h, `${id}.select`), { val: false, ack: true });
            assert.equal(h.adapter.objects.get(id).native.channelService.schemaVersion, 3);
        }
        assert.deepEqual(JSON.parse(state(h, 'channels.tv.Fixture_first.numbers').val), ['1', '100', '1000']);
        for (const old of legacy) {
            assert.equal([...h.adapter.objects.keys()].some(id => id === old.id || id.startsWith(`${old.id}.`)), false);
            assert.equal([...h.adapter.states.keys()].some(id => id.startsWith(`${old.id}.`)), false);
        }
        await write(h, 'channels.tv.Fixture_first.select', true);
        assert.deepEqual(h.client.calls, [{ method: 'zap', args: ['channel://1:ch-first:sl-fixture'] }]);
    }
});

test('three conflicting legacy occupants remain unavailable until a fresh response resolves the position', async t => {
    const legacy = ['first', 'second', 'third'].map(uuid => legacyService(uuid, [1]));
    const h = await harness(t, adapter => installLegacy(adapter, legacy, false));
    for (const uuid of ['first', 'second', 'third']) {
        const restored = service(h, uuid);
        assert.equal(restored.available, false);
        assert.equal(state(h, `${restored.id}.available`).val, false);
        await write(h, `${restored.id}.select`, true);
    }
    assert.ok(h.adapter.logs.some(log => log.level === 'warn' && /ungültige gespeicherte Senderobjekte/u.test(log.message)));
    assert.equal(h.client.calls.some(call => call.method === 'zap'), false);
    assert.match(state(h, 'info.lastError').val, /CHANNEL_UNAVAILABLE/u);
    await query(h, [entry('confirmed')]);
    await write(h, 'channels.tv.Fixture_confirmed.select', true);
    assert.deepEqual(h.client.calls.filter(call => call.method === 'zap').at(-1).args, ['channel://1:ch-confirmed:sl-fixture']);
});

test('damaged catalogue and raw caches cannot discard a valid live response queued during restoration', async t => {
    const gate = deferred();
    t.after(() => gate.resolve());
    let readingCache = false;
    const h = await harness(t, adapter => {
        adapter.states.set('channels.catalog', { val: '{invalid catalogue', ack: true });
        adapter.states.set('channels.items', { val: '{invalid response', ack: true });
        let restoring = false;
        const getObjects = adapter.getAdapterObjectsAsync.bind(adapter);
        adapter.getAdapterObjectsAsync = async () => {
            restoring = true;
            return getObjects();
        };
        const getState = adapter.getStateAsync.bind(adapter);
        adapter.getStateAsync = async id => {
            if (restoring && adapter.id(id) === 'channels.catalog') {
                readingCache = true;
                await gate.promise;
            }
            return getState(id);
        };
    }, { idle: false });
    await until(() => readingCache, 'Expected restoration to be waiting for the saved catalogue.');
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([entry('live')])), '');
    gate.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(state(h, 'channels.tv.Fixture_live.mediaItemUuid').val, 'live');
    assert.equal(state(h, 'channels.catalogStatus').val, 'ready');
    assert.equal(h.runtime.channelObjects.pending.length, 0);
    assert.equal(h.runtime.channelObjects.appliedSelectionEpoch, h.runtime.channelObjects.selectionEpoch);
    assert.ok(h.adapter.logs.filter(log => /INVALID_RESPONSE/u.test(log.message)).length >= 2);
    await write(h, 'channels.tv.Fixture_live.select', true);
    assert.deepEqual(h.client.calls, [{ method: 'zap', args: ['channel://1:ch-live:sl-fixture'] }]);
});

test('removed folders containing custom settings, protected objects or user children remain disabled without resurrecting on restart', async t => {
    const h = await harness(t);
    await query(h, [entry('ordinary'), entry('custom', '2'), entry('protected', '3'), entry('user', '4')]);
    h.adapter.objects.get('channels.tv.Fixture_custom.name').common.custom = { 'history.0': { enabled: true } };
    h.adapter.objects.get('channels.tv.Fixture_protected').common.dontDelete = true;
    h.adapter.objects.set('channels.tv.Fixture_user.personalNote', { type: 'state', common: { name: 'My note', type: 'string' }, native: {} });
    h.adapter.states.set('channels.tv.Fixture_user.personalNote', { val: 'Keep me', ack: true });
    await query(h, []);
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_ordinary'), false);
    for (const name of ['custom', 'protected', 'user']) {
        const id = `channels.tv.Fixture_${name}`;
        assert.equal(h.adapter.objects.get(id).native.channelRetired, true);
        assert.equal(state(h, `${id}.available`).val, false);
        assert.equal(h.adapter.objects.get(`${id}.select`).common.write, false);
        assert.equal(h.runtime._objects.has(`${id}.select`), false);
    }
    assert.equal(state(h, 'channels.tv.Fixture_user.personalNote').val, 'Keep me');
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(h.adapter.objects);
        adapter.states = structuredClone(h.adapter.states);
    });
    assert.equal(restarted.runtime.channelObjects.services.size, 0);
    assert.equal(restarted.client.calls.length, 0);
    assert.equal(state(restarted, 'channels.tv.Fixture_user.personalNote').val, 'Keep me');
    await query(restarted, [entry('custom', '7')]);
    assert.equal(restarted.adapter.objects.get('channels.tv.Fixture_custom').native.channelRetired, false);
    assert.equal(restarted.adapter.objects.get('channels.tv.Fixture_custom.select').common.write, true);
    assert.equal(restarted.adapter.objects.get('channels.tv.Fixture_custom.name').common.custom['history.0'].enabled, true);
});

test('an unowned child at a known metadata suffix is preserved as a user object when its station is removed', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    h.adapter.objects.set('channels.tv.Fixture_first.name', { type: 'state', common: { name: 'Personal counter', type: 'number' }, native: {} });
    h.adapter.states.set('channels.tv.Fixture_first.name', { val: 42, ack: true });
    await query(h, []);
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').native.channelRetired, true);
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first.name').common.name, 'Personal counter');
    assert.equal(state(h, 'channels.tv.Fixture_first.name').val, 42);
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first.select').common.write, false);
    assert.equal(h.runtime._objects.has('channels.tv.Fixture_first.select'), false);
    assert.equal(h.adapter.dynamicCalls.some(call => call.operation === 'delete'), false);
});

test('protected legacy folders are marked retired and cannot restore duplicate services on restart', async t => {
    const legacy = legacyService('first', [1, 100]);
    const h = await harness(t, adapter => {
        installLegacy(adapter, [legacy]);
        adapter.objects.set(`${legacy.id}.personal`, { type: 'state', common: { type: 'string' }, native: {} });
    });
    assert.equal(h.adapter.objects.get(legacy.id).native.channelRetired, true);
    assert.equal(h.adapter.objects.get(`${legacy.id}.select`).common.write, false);
    await query(h, [entry('replacement', '1')]);
    const restarted = await harness(t, adapter => {
        adapter.objects = structuredClone(h.adapter.objects);
        adapter.states = structuredClone(h.adapter.states);
    });
    assert.deepEqual([...restarted.runtime.channelObjects.services.keys()], ['channels.tv.Fixture_replacement']);
    assert.equal(state(restarted, 'channels.tv.Fixture_replacement.mediaItemUuid').val, 'replacement');
    assert.equal(restarted.adapter.objects.has('channels.tv.Fixture_first'), false);
    assert.ok(restarted.adapter.objects.has(`${legacy.id}.personal`));
});

test('a missing or failed cleanup inventory never authorizes deletions and a later refresh retries cleanup', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    h.adapter.inventoryHook = async () => ({ rows: [] });
    await query(h, []);
    assert.equal(h.adapter.dynamicCalls.some(call => call.operation === 'delete'), false);
    assert.ok(h.adapter.objects.has('channels.tv.Fixture_first'));
    h.adapter.inventoryHook = async () => { throw Object.assign(new Error('Inventory unavailable'), { code: 'DATABASE' }); };
    await query(h, []);
    assert.equal(state(h, 'channels.catalogStatus').val, 'error');
    assert.equal(h.adapter.dynamicCalls.some(call => call.operation === 'delete'), false);
    await write(h, 'remote.home', true);
    assert.ok(h.client.calls.some(call => call.method === 'key'));
    h.adapter.inventoryHook = null;
    await query(h, []);
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_first'), false);
    assert.equal(state(h, 'channels.catalogStatus').val, 'empty');
});

test('protection added after the cleanup inventory is respected before deleting that state', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    h.adapter.objectHook = async id => {
        if (id === 'channels.tv.Fixture_first.epg.status') h.adapter.objects.get(id).common.dontDelete = true;
    };
    await query(h, []);
    assert.ok(h.adapter.objects.has('channels.tv.Fixture_first.epg.status'));
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first').native.channelRetired, true);
    assert.equal(h.adapter.objects.get('channels.tv.Fixture_first.select').common.write, false);
});

test('a queued selection cannot recreate its deleted state value in the button reset', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const gate = deferred();
    t.after(() => gate.resolve());
    h.client.keyHook = () => gate.promise;
    const home = write(h, 'remote.home', true);
    await until(() => h.client.calls.some(call => call.method === 'key'), 'Remote command did not start.');
    const select = write(h, 'channels.tv.Fixture_first.select', true);
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([])), '');
    await h.runtime.channelObjects.whenIdle();
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_first.select'), false);
    assert.equal(state(h, 'channels.tv.Fixture_first.select'), undefined);
    gate.resolve();
    await Promise.all([home, select]);
    assert.equal(h.client.calls.some(call => call.method === 'zap'), false);
    assert.equal(state(h, 'channels.tv.Fixture_first.select'), undefined);
    assert.equal(h.runtime._lastValues.has('channels.tv.Fixture_first.select'), false);
});

test('cleanup waits for an already started button reset before deleting its state', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const gate = deferred();
    t.after(() => gate.resolve());
    const button = 'channels.tv.Fixture_first.select';
    let resetting = false;
    h.adapter.stateHook = (id, value) => {
        if (id === button && value.val === false) {
            resetting = true;
            return gate.promise;
        }
    };
    const select = write(h, button, true);
    await until(() => resetting, 'Expected the selection reset to enter the state database.');
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([])), '');
    await until(() => !h.runtime._objects.has(button), 'Expected cleanup to unregister the removed station.');
    assert.ok(h.adapter.objects.has(button), 'The object must remain until its pending reset settles.');
    assert.equal(h.adapter.dynamicCalls.some(call => call.operation === 'delete'), false);
    await within(write(h, 'remote.home', true), 'The remote queue waited for a pending button reset.');
    gate.resolve();
    await Promise.all([select, h.runtime.channelObjects.whenIdle()]);
    assert.equal(h.adapter.objects.has('channels.tv.Fixture_first'), false);
    assert.equal(h.adapter.objects.has(button), false);
    assert.equal(state(h, button), undefined);
    assert.equal(h.runtime._lastValues.has(button), false);
    assert.equal(h.runtime.channelObjects.resetWrites.size, 0);
});

test('a timed-out reset must really settle before cleanup or a newer occupant can proceed', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const gate = deferred();
    const reported = deferred();
    t.after(() => gate.resolve());
    const button = 'channels.tv.Fixture_first.select';
    const database = h.runtime._database.bind(h.runtime);
    h.runtime._database = (operation, label, timeout) => database(operation, label,
        label === button || label.startsWith('Ausstehende Taster-Rücksetzungen ') ? 15 : timeout);
    let resetting = false;
    h.adapter.stateHook = (id, value) => {
        if (id === 'channels.catalogStatus' && value.val === 'error') reported.resolve();
        if (id === button && value.val === false) {
            resetting = true;
            return gate.promise;
        }
    };
    const selectionResult = write(h, button, true).then(() => null, error => error);
    await until(() => resetting, 'Expected the button reset to start.');
    h.runtime.channelObjects.acceptPage(parseChannelPage(channels([])), '');
    await within(reported.promise, 'The pending-reset deadline was not reported.');
    assert.equal((await selectionResult).code, 'DATABASE');
    assert.equal(h.adapter.dynamicCalls.some(call => call.operation === 'delete'), false);
    assert.ok(h.runtime.channelObjects.worker, 'The timed-out mutation must still occupy the object worker.');
    const callsAfterFailure = h.adapter.dynamicCalls.length;
    await query(h, [{ ...entry('replacement'), '@_shortInfo': 'Fixture first' }], { idle: false });
    await within(write(h, 'remote.home', true), 'The remote queue waited for a timed-out reset.');
    assert.equal(h.adapter.dynamicCalls.length, callsAfterFailure);
    h.adapter.stateHook = null;
    gate.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(state(h, 'channels.tv.Fixture_first.mediaItemUuid').val, 'replacement');
    assert.equal(state(h, 'channels.tv.Fixture_first.epg.status').val, 'notImplemented');
    assert.deepEqual(state(h, button), { val: false, ack: true });
    assert.equal(h.runtime.channelObjects.resetWrites.size, 0);
    await write(h, button, true);
    assert.deepEqual(h.client.calls.filter(call => call.method === 'zap').at(-1).args, ['channel://1:ch-replacement:sl-fixture']);
});

test('a timed-out delete must settle before a new service using the same name ID is materialized', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const gate = deferred();
    const reported = deferred();
    t.after(() => gate.resolve());
    const database = h.runtime._database.bind(h.runtime);
    h.runtime._database = (operation, label, timeout) => database(operation, label, label.endsWith('entfernen') ? 15 : timeout);
    h.adapter.dynamicHook = call => call.operation === 'delete' && call.id === 'channels.tv.Fixture_first.epg.status' ? gate.promise : undefined;
    h.adapter.stateHook = (id, value) => { if (id === 'channels.catalogStatus' && value.val === 'error') reported.resolve(); };
    await query(h, [], { idle: false });
    await within(reported.promise, 'The delete deadline was not reported.');
    const callsAfterFailure = h.adapter.dynamicCalls.length;
    await query(h, [{ ...entry('replacement', '1'), '@_shortInfo': 'Fixture first' }], { idle: false });
    await write(h, 'remote.home', true);
    assert.equal(h.adapter.dynamicCalls.length, callsAfterFailure, 'New channel writes must wait for the outstanding delete.');
    assert.ok(h.client.calls.some(call => call.method === 'key'));
    h.adapter.dynamicHook = null;
    gate.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(state(h, 'channels.tv.Fixture_first.mediaItemUuid').val, 'replacement');
    assert.equal(state(h, 'channels.tv.Fixture_first.epg.status').val, 'notImplemented');
    await write(h, 'channels.tv.Fixture_first.select', true);
    assert.deepEqual(h.client.calls.filter(call => call.method === 'zap').at(-1).args, ['channel://1:ch-replacement:sl-fixture']);
});

test('stop during cleanup prevents further database calls after the current delete settles', async t => {
    const h = await harness(t);
    await query(h, [entry('first')]);
    const gate = deferred();
    t.after(() => gate.resolve());
    h.adapter.dynamicHook = call => call.operation === 'delete' ? gate.promise : undefined;
    await query(h, [], { idle: false });
    await until(() => h.adapter.dynamicCalls.some(call => call.operation === 'delete'), 'Expected cleanup to begin.');
    await h.runtime.stop();
    const callsAtStop = h.adapter.dynamicCalls.length;
    gate.resolve();
    await h.runtime.channelObjects.whenIdle();
    assert.equal(h.adapter.dynamicCalls.length, callsAtStop);
});
