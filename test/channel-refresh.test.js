'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { AdapterRuntime, normalizeConfig } = require('../lib/adapter-runtime');

const VIEW = 'fastscan-refresh-fixture';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function response(action, fields = {}) {
    return { data: { Envelope: { Body: { [`${action}Response`]: fields } } } };
}

function entry(number, type = 'video', name = `N${number}`) {
    return { '@_mediaItemUuid': `${type}:${number}`, '@_shortInfo': name, '@_caption': String(number),
        '@_itemClass': type, '@_locator': `channel://${number}:ch${type}${number}:s` };
}

function page(view, start, entries, { count = 500, total = entries.length, hash = '4294967295' } = {}) {
    const part = entries.slice(start, start + count);
    return response('GetChannelList', {
        ChannelListView: view, ChannelListName: 'Fixture', ItemClass: 'undefined',
        ResultItemFragment: { '@_startIndex': String(start), '@_totalResults': String(total),
            '@_returnedResults': String(part.length), '@_hash': hash, ResultItemReference: part },
    });
}

class FakeClient {
    constructor() {
        this.entries = [entry(1), entry(100, 'audio')];
        this.calls = [];
        this.hooks = {};
        this.active = 0;
        this.maximumActive = 0;
        this.closed = false;
    }

    async invoke(method, args, fallback) {
        this.calls.push({ method, args });
        this.active++;
        this.maximumActive = Math.max(this.maximumActive, this.active);
        try { return this.hooks[method] ? await this.hooks[method](...args) : fallback(); }
        finally { this.active--; }
    }

    getChannels(view, start, count, type, options) {
        return this.invoke('getChannels', [view, start, count, type, options], () => page(view, start, this.entries, { count }));
    }

    getChannelLists(start, count, options) {
        return this.invoke('getChannelLists', [start, count, options], () => response('GetListOfChannelLists', {
            Result: 'OK', ResultItemChannelLists: { '@_startIndex': '0', '@_totalResults': '1', '@_returnedResults': '1',
                ResultItemChannelList: { View: VIEW, Name: 'Fixture', TotalResults: String(this.entries.length) } },
        }));
    }

    key(name) { return this.invoke('key', [name], () => response('InjectRCKey')); }
    getDeviceData() { return this.invoke('getDeviceData', [], () => response('GetDeviceData')); }
    getVolume() { return this.invoke('getVolume', [], () => 10); }
    getMute() { return this.invoke('getMute', [], () => false); }
    getSettings() { return this.invoke('getSettings', [], () => response('GetSettings')); }
    getCurrentPlayback() { return this.invoke('getCurrentPlayback', [], () => response('GetCurrentPlayback')); }
    close() { this.closed = true; }
}

class FakeAdapter {
    constructor(config) {
        this.namespace = 'loewe-tv.0';
        this.config = { host: 'fixture.invalid', pollInterval: 0, channelRefreshInterval: 300, pollPlayback: false, ...config };
        this.states = new Map([['channels.view', { val: VIEW, ack: true }]]);
        this.objects = new Map();
        this.writes = [];
        this.timers = new Map();
        this.nextTimer = 0;
        this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, () => {}]));
    }

    async extendObjectAsync(id, object) { this.objects.set(id, object); }
    async getStateAsync(id) { return this.states.get(id) || null; }
    async setStateAsync(id, state) { this.states.set(id, state); this.writes.push({ id, ...state }); }
    subscribeStates() {}
    setTimeout(fn, ms) { const id = ++this.nextTimer; this.timers.set(id, { fn, ms }); return id; }
    clearTimeout(id) { this.timers.delete(id); }
    fire(ms) {
        const match = [...this.timers.entries()].find(([, value]) => value.ms === ms);
        assert.ok(match, `No timer scheduled for ${ms} ms`);
        this.timers.delete(match[0]);
        match[1].fn();
    }
}

async function harness(t, config = {}, prepare = () => {}) {
    const adapter = new FakeAdapter(config);
    const client = new FakeClient();
    prepare(adapter, client);
    const runtime = new AdapterRuntime(adapter, { clientFactory: () => client });
    // The catalogue worker has its own integration suite. Capture its boundary
    // here so snapshot atomicity and transport scheduling are independently visible.
    const channelObjects = { selectionEpoch: 0, accepted: [], start() {}, stop() {},
        acceptPage(value, type) { this.accepted.push({ page: structuredClone(value), type }); this.selectionEpoch++; } };
    runtime.channelObjects = channelObjects;
    t.after(() => runtime.stop());
    await runtime.start();
    return { adapter, client, runtime, channelObjects };
}

function write(h, id, val, ack = false) {
    const state = { val, ack };
    h.adapter.states.set(id, state);
    return h.runtime.handleStateChange(`loewe-tv.0.${id}`, state);
}

function calls(h, method) { return h.client.calls.filter(call => call.method === method); }
function state(h, id) { return h.adapter.states.get(id)?.val; }

async function until(predicate, message) {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await nextTurn();
    }
    assert.fail(message);
}

async function fire(h, ms) {
    h.adapter.fire(ms);
    await until(() => !h.runtime.channelRefresh.promise && !h.runtime._pendingCount, 'Refresh did not finish');
}

test('channel refresh configuration defaults to five minutes and accepts only zero or 60 to 86400 seconds', () => {
    assert.equal(normalizeConfig({}).channelRefreshInterval, 300);
    for (const value of [0, 60, 300, 86400]) assert.equal(normalizeConfig({ channelRefreshInterval: value }).channelRefreshInterval, value);
    for (const value of [-1, 1, 59, 60.5, 86401, 'invalid']) assert.throws(() => normalizeConfig({ channelRefreshInterval: value }), { code: 'VALIDATION' });
});

test('startup and interval refresh the complete mixed list without changing manual page parameters', async t => {
    const h = await harness(t, {}, adapter => {
        for (const [id, val] of [['channels.start', 25], ['channels.count', 12], ['channels.mediaType', 'audio'], ['channels.listStart', 4]]) {
            adapter.states.set(id, { val, ack: true });
        }
    });
    await fire(h, 0);
    assert.equal(h.channelObjects.accepted.length, 1);
    assert.deepEqual(calls(h, 'getChannels')[0].args.slice(0, 4), [VIEW, 0, 500, '']);
    assert.ok(calls(h, 'getChannels')[0].args[4].deadline > Date.now());
    assert.deepEqual(h.channelObjects.accepted[0].page.items.map(value => value.itemClass), ['video', 'audio']);
    for (const [id, val] of [['channels.start', 25], ['channels.count', 12], ['channels.mediaType', 'audio'], ['channels.listStart', 4]]) {
        assert.equal(state(h, id), val);
    }
    assert.equal(state(h, 'channels.refreshStatus'), 'ready');
    assert.equal(state(h, 'channels.refreshCount'), 2);
    assert.ok(state(h, 'channels.refreshLastUpdate') > 0);
    h.client.entries = [entry(2, 'video', 'Renamed')];
    await fire(h, 300000);
    assert.equal(h.channelObjects.accepted.length, 2);
    assert.equal(h.channelObjects.accepted[1].page.items[0].name, 'Renamed');
    assert.deepEqual(h.client.calls.map(call => call.method), ['getChannels', 'getChannels']);
});

test('disabled automatic refresh sends nothing, while the explicit complete-refresh button still works', async t => {
    const h = await harness(t, { channelRefreshInterval: 0 });
    assert.equal(h.adapter.timers.size, 0);
    assert.equal(h.client.calls.length, 0);
    await write(h, 'channels.refresh', false);
    await write(h, 'channels.refresh', true, true);
    assert.equal(h.client.calls.length, 0);
    await write(h, 'channels.refresh', true);
    assert.equal(calls(h, 'getChannels').length, 1);
    assert.equal(state(h, 'channels.refresh'), false);
    assert.equal(h.adapter.states.get('channels.refresh').ack, true);
    assert.equal(h.adapter.timers.size, 0);
});

test('empty view selects a TV-reported list with a shared overall deadline', async t => {
    const h = await harness(t, { channelRefreshInterval: 0 }, adapter => adapter.states.set('channels.view', { val: '', ack: true }));
    await write(h, 'channels.refresh', true);
    assert.equal(state(h, 'channels.view'), VIEW);
    assert.equal(calls(h, 'getChannelLists').length, 1);
    assert.equal(calls(h, 'getChannelLists')[0].args[2].deadline, calls(h, 'getChannels')[0].args[4].deadline);
});

test('repeated refresh requests share one in-flight scan', async t => {
    const gate = deferred();
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
        client.hooks.getChannels = () => gate.promise;
    });
    const first = h.runtime.channelRefresh.refresh();
    const second = h.runtime.channelRefresh.refresh();
    assert.equal(first, second);
    await until(() => calls(h, 'getChannels').length === 1, 'Page request did not start');
    gate.resolve(page(VIEW, 0, h.client.entries));
    assert.equal(await first, true);
    assert.equal(h.channelObjects.accepted.length, 1);
    assert.equal(calls(h, 'getChannels').length, 1);
});

test('multi-page scans validate two complete reads and let remote commands run between pages', async t => {
    const gate = deferred();
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
        client.entries = Array.from({ length: 501 }, (_, index) => entry(index + 1));
        client.hooks.getChannels = async (view, start, count) => {
            if (client.calls.filter(call => call.method === 'getChannels').length === 1) await gate.promise;
            return page(view, start, client.entries, { count });
        };
    });
    const refresh = h.runtime.channelRefresh.refresh();
    await until(() => calls(h, 'getChannels').length === 1, 'First page did not start');
    const key = write(h, 'remote.home', true);
    gate.resolve();
    await Promise.all([refresh, key]);
    assert.deepEqual(h.client.calls.map(call => call.method), ['getChannels', 'key', 'getChannels', 'getChannels', 'getChannels']);
    assert.deepEqual(calls(h, 'getChannels').map(call => call.args[1]), [0, 500, 0, 500]);
    assert.equal(h.client.maximumActive, 1);
    assert.equal(h.channelObjects.accepted.length, 1, 'Individual pages must not be published');
    assert.equal(h.channelObjects.accepted[0].page.items.length, 501);
    assert.equal(h.channelObjects.accepted[0].page.startIndex, 0);
    assert.equal(h.channelObjects.accepted[0].page.totalResults, 501);
});

test('a changing list is rejected even when the TV always returns hash 4294967295', async t => {
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
        client.entries = Array.from({ length: 501 }, (_, index) => entry(index + 1));
        client.hooks.getChannels = (view, start, count) => {
            if (client.calls.filter(call => call.method === 'getChannels').length === 3) client.entries[0] = entry(1, 'video', 'Changed');
            return page(view, start, client.entries, { count });
        };
    });
    assert.equal(await h.runtime.channelRefresh.refresh(), false);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.equal(state(h, 'channels.refreshLastUpdate'), 0);
    assert.match(state(h, 'channels.refreshError'), /CHANNEL_REFRESH_CHANGED/u);
    assert.equal(calls(h, 'getChannels').length, 4);
});

test('a changed total or a repeated first page aborts pagination without publishing partial data', async t => {
    for (const mode of ['total', 'start']) {
        const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
            client.entries = Array.from({ length: 501 }, (_, index) => entry(index + 1));
            client.hooks.getChannels = (view, start, count) => page(view, mode === 'start' ? 0 : start, client.entries,
                { count, total: start && mode === 'total' ? 502 : 501 });
        });
        assert.equal(await h.runtime.channelRefresh.refresh(), false);
        assert.equal(h.channelObjects.accepted.length, 0);
        assert.equal(calls(h, 'getChannels').length, 2);
        assert.equal(state(h, 'channels.refreshStatus'), 'error');
    }
});

test('unknown totals and unknown media types cannot authorize removal of existing channel objects', async t => {
    for (const mode of ['total', 'type']) {
        const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
            client.hooks.getChannels = (view, start) => {
                const result = page(view, start, mode === 'type' ? [entry(1, 'unknown')] : client.entries);
                if (mode === 'total') delete result.data.Envelope.Body.GetChannelListResponse.ResultItemFragment['@_totalResults'];
                return result;
            };
        });
        assert.equal(await h.runtime.channelRefresh.refresh(), false);
        assert.equal(h.channelObjects.accepted.length, 0);
        assert.equal(calls(h, 'getChannels').length, 1);
    }
});

test('a confirmed empty complete list is handed to reconciliation once', async t => {
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => { client.entries = []; });
    assert.equal(await h.runtime.channelRefresh.refresh(), true);
    assert.equal(h.channelObjects.accepted.length, 1);
    assert.deepEqual(h.channelObjects.accepted[0].page.items, []);
    assert.equal(h.channelObjects.accepted[0].page.totalResults, 0);
});

test('a transport error preserves the old catalogue and retries only at the configured interval', async t => {
    const h = await harness(t, {}, (_adapter, client) => {
        client.hooks.getChannels = () => { throw Object.assign(new Error('TV in standby'), { code: 'NETWORK' }); };
    });
    await fire(h, 0);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.equal(state(h, 'channels.refreshStatus'), 'error');
    assert.equal(state(h, 'info.connection'), false);
    assert.deepEqual([...h.adapter.timers.values()].map(value => value.ms), [300000]);
    delete h.client.hooks.getChannels;
    await fire(h, 300000);
    assert.equal(h.channelObjects.accepted.length, 1);
    assert.equal(calls(h, 'getChannels').length, 2);
    assert.deepEqual([...h.adapter.timers.values()].map(value => value.ms), [300000], 'The refresh must not recursively schedule itself on reconnect');
});

test('an unsupported channel response keeps a working connection and does not provoke repeated reconnect refreshes', async t => {
    const h = await harness(t, { pollInterval: 30 }, (_adapter, client) => {
        client.hooks.getChannels = () => response('GetChannelList', { Unsupported: 'fixture' });
    });
    await fire(h, 0);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.equal(state(h, 'info.connection'), true);
    assert.equal(state(h, 'channels.refreshStatus'), 'error');
    assert.match(state(h, 'channels.refreshError'), /INVALID_RESPONSE/u);
    await h.runtime.poll();
    assert.equal([...h.adapter.timers.values()].some(value => value.ms === 0), false);
    assert.equal(calls(h, 'getChannels').length, 1);
});

test('an unsupported channel-list overview keeps a working connection without reconnect refresh loops', async t => {
    const h = await harness(t, { pollInterval: 30 }, (adapter, client) => {
        adapter.states.set('channels.view', { val: '', ack: true });
        client.hooks.getChannelLists = () => response('GetListOfChannelLists', { Unsupported: 'fixture' });
    });
    await fire(h, 0);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.equal(state(h, 'info.connection'), true);
    assert.equal(state(h, 'channels.refreshStatus'), 'error');
    assert.match(state(h, 'channels.refreshError'), /CHANNEL_REFRESH_INVALID/u);
    await h.runtime.poll();
    assert.equal([...h.adapter.timers.values()].some(value => value.ms === 0), false);
    assert.equal(calls(h, 'getChannelLists').length, 1);
    assert.equal(calls(h, 'getChannels').length, 0);
});

test('channel-list discovery preserves genuine transport and session failures', async t => {
    for (const error of [
        Object.assign(new Error('Socket failed'), { code: 'NETWORK' }),
        Object.assign(new Error('Invalid XML'), { code: 'INVALID_RESPONSE' }),
        Object.assign(new Error('TV response exceeds the 8 MiB limit.'), { code: 'INVALID_RESPONSE', action: 'GetListOfChannelLists' }),
        Object.assign(new Error('GetListOfChannelLists: session invalid'), { code: 'INVALID_RESPONSE', action: 'GetListOfChannelLists', sessionInvalid: true }),
    ]) {
        const h = await harness(t, { pollInterval: 30 }, (adapter, client) => {
            adapter.states.set('channels.view', { val: '', ack: true });
            client.hooks.getChannelLists = () => { throw error; };
        });
        await fire(h, 0);
        assert.equal(state(h, 'info.connection'), false);
        assert.equal(state(h, 'channels.refreshError'), `${error.code}: ${error.message}`);
        assert.equal(h.channelObjects.accepted.length, 0);
        assert.equal(calls(h, 'getChannelLists').length, 1);
    }
});

test('an offline polled TV waits for a real reconnect and ordinary later polls do not restart the scan', async t => {
    const h = await harness(t, { pollInterval: 30 }, (_adapter, client) => {
        client.hooks.getVolume = () => { throw Object.assign(new Error('Offline'), { code: 'NETWORK' }); };
    });
    await fire(h, 300000);
    assert.equal(calls(h, 'getChannels').length, 0);
    assert.equal(state(h, 'channels.refreshStatus'), 'waiting');
    delete h.client.hooks.getVolume;
    await h.runtime.poll();
    await fire(h, 0);
    assert.equal(calls(h, 'getChannels').length, 1);
    await h.runtime.poll();
    assert.equal([...h.adapter.timers.values()].some(value => value.ms === 0), false);
    assert.equal(calls(h, 'getChannels').length, 1);
});

test('a staged view edit preserves the existing refresh timer and sends nothing until explicitly refreshed', async t => {
    const h = await harness(t);
    await fire(h, 0);
    const existingTimers = [...h.adapter.timers.entries()];
    await write(h, 'channels.view', 'favlist-staged');
    await nextTurn();
    assert.deepEqual([...h.adapter.timers.entries()], existingTimers, 'Staging a view must not advance or replace the interval timer');
    assert.equal(calls(h, 'getChannels').length, 1);
    await write(h, 'channels.refresh', true);
    assert.equal(calls(h, 'getChannels').length, 2);
    assert.equal(h.channelObjects.accepted.at(-1).page.view, 'favlist-staged');
});

test('a view edit while reading discards the old snapshot and waits for the regular interval before reading the new list', async t => {
    const gate = deferred();
    const h = await harness(t, {}, (_adapter, client) => {
        client.hooks.getChannels = async (view, start, count) => {
            if (view === VIEW) await gate.promise;
            return page(view, start, client.entries, { count });
        };
    });
    h.adapter.fire(0);
    const running = h.runtime.channelRefresh.promise;
    await until(() => calls(h, 'getChannels').length === 1, 'Initial page did not start');
    await write(h, 'channels.view', 'favlist-changed');
    gate.resolve();
    assert.equal(await running, false);
    assert.equal(h.channelObjects.accepted.length, 0);
    await nextTurn();
    assert.equal(calls(h, 'getChannels').length, 1, 'A view edit must not trigger an immediate follow-up request');
    assert.deepEqual([...h.adapter.timers.values()].map(value => value.ms), [300000]);
    await fire(h, 300000);
    assert.equal(h.channelObjects.accepted.length, 1);
    assert.equal(h.channelObjects.accepted[0].page.view, 'favlist-changed');
});

test('a newer manual channel query cannot be overwritten by an older automatic snapshot', async t => {
    const gate = deferred();
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
        client.entries = Array.from({ length: 501 }, (_, index) => entry(index + 1));
        client.hooks.getChannels = async (view, start, count) => {
            if (client.calls.filter(call => call.method === 'getChannels').length === 1) await gate.promise;
            return page(view, start, client.entries, { count });
        };
    });
    const automatic = h.runtime.channelRefresh.refresh();
    await until(() => calls(h, 'getChannels').length === 1, 'Initial page did not start');
    await write(h, 'channels.count', 1);
    const manual = write(h, 'channels.getChannels', true);
    gate.resolve();
    await manual;
    assert.equal(await automatic, false);
    assert.equal(h.channelObjects.accepted.length, 1);
    assert.equal(h.channelObjects.accepted[0].page.items.length, 1);
    assert.match(state(h, 'channels.refreshError'), /CHANNEL_REFRESH_CHANGED/u);
});

test('stopping while a page is pending prevents publication and removes all refresh timers', async t => {
    const gate = deferred();
    const h = await harness(t, {}, (_adapter, client) => { client.hooks.getChannels = () => gate.promise; });
    h.adapter.fire(0);
    const running = h.runtime.channelRefresh.promise;
    await until(() => calls(h, 'getChannels').length === 1, 'Page did not start');
    await h.runtime.stop();
    const writes = h.adapter.writes.length;
    gate.resolve(page(VIEW, 0, h.client.entries));
    assert.equal(await running, false);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.equal(h.adapter.timers.size, 0);
    assert.equal(h.adapter.writes.length, writes);
    assert.equal(h.client.closed, true);
});

test('a TV returning tiny pages cannot cause an unbounded pagination loop', async t => {
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
        client.entries = Array.from({ length: 21 }, (_, index) => entry(index + 1));
        client.hooks.getChannels = (view, start) => page(view, start, client.entries, { count: 1 });
    });
    assert.equal(await h.runtime.channelRefresh.refresh(), false);
    assert.equal(calls(h, 'getChannels').length, 20);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.match(state(h, 'channels.refreshError'), /CHANNEL_REFRESH_LIMIT/u);
});

test('entry count and catalogue byte limits reject oversized snapshots before publication', async t => {
    for (const mode of ['count', 'bytes']) {
        const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => {
            client.entries = mode === 'bytes' ? [entry(1, 'video', 'x'.repeat(250000)), entry(2, 'video', 'y'.repeat(250000))] : [entry(1)];
            client.hooks.getChannels = (view, start) => page(view, start, client.entries, { total: mode === 'count' ? 2001 : 2 });
        });
        assert.equal(await h.runtime.channelRefresh.refresh(), false);
        assert.equal(h.channelObjects.accepted.length, 0);
        assert.equal(calls(h, 'getChannels').length, 1);
        assert.match(state(h, 'channels.refreshError'), /CHANNEL_REFRESH_LIMIT/u);
    }
});

test('the overall deadline prevents further pages after a delayed reply', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 1000 });
    const gate = deferred();
    const h = await harness(t, { channelRefreshInterval: 0 }, (_adapter, client) => { client.hooks.getChannels = () => gate.promise; });
    const running = h.runtime.channelRefresh.refresh();
    await until(() => calls(h, 'getChannels').length === 1, 'Page did not start');
    assert.equal(calls(h, 'getChannels')[0].args[4].deadline, 121000);
    t.mock.timers.tick(120001);
    gate.resolve(page(VIEW, 0, h.client.entries));
    assert.equal(await running, false);
    assert.equal(h.channelObjects.accepted.length, 0);
    assert.equal(calls(h, 'getChannels').length, 1);
    assert.match(state(h, 'channels.refreshError'), /CHANNEL_REFRESH_TIMEOUT/u);
});
