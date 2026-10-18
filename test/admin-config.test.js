'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

// ConfigGeneric.execute/executeCustom execute a FUNCTION BODY, not an expression.
// They add a return only when the source does not contain the substring "return".
// This matters when an expression contains a nested function with its own return.
// Primary sources (the rule is unchanged in both versions):
// https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigGeneric.tsx
// https://github.com/ioBroker/json-config/blob/6e910b3c71a3f884014992f92151a1ae223ef4c7/src/JsonConfigComponent/ConfigGeneric.tsx
function executeAdminFunction(source, data, { globalData = data, arrayIndex } = {}) {
    const body = source.includes('return') ? source : `return ${source}`;
    return vm.runInNewContext(`(function (data, globalData, arrayIndex) { ${body}\n})(data, globalData, arrayIndex)`, {
        data, globalData, arrayIndex, URL,
    });
}

function adminValidationErrors(config, data) {
    const errors = [];
    const visit = (items, values, globalData, pathPrefix = '', arrayIndex) => {
        for (const [key, item] of Object.entries(items)) {
            const id = `${pathPrefix}${key}`;
            if (item.hidden && executeAdminFunction(item.hidden, values, { globalData, arrayIndex })) continue;
            // A disabled control still reports validatorNoSaveOnError errors in
            // ConfigGeneric.render. Only hidden controls clear their errors.
            if (item.validator && item.validatorNoSaveOnError) {
                const valid = executeAdminFunction(item.validator, values, { globalData, arrayIndex });
                assert.equal(typeof valid, 'boolean', `${id} validator must return a boolean to Admin`);
                if (!valid) errors.push(id);
            }
            if (item.type === 'table') {
                const rows = values[key] === undefined ? item.default : values[key];
                if (Array.isArray(rows)) rows.forEach((row, index) => {
                    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
                    // ConfigTable passes current row as data, root native as
                    // globalData and column.attr as the field identifier.
                    visit(Object.fromEntries(item.items.map(column => [column.attr, column])), row, data, `${id}.${index}.`, index);
                });
            } else if (item.items) {
                visit(item.items, values, globalData, `${id}.`, arrayIndex);
            }
        }
    };
    visit(config.items, data, data);
    return errors;
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

function harness() {
    const replies = [];
    const logs = [];
    const timers = new Map();
    let nextTimer = 0;
    class FakeAdapter extends EventEmitter {
        constructor(options) {
            super();
            this.options = options;
            this.log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [
                level, message => logs.push({ level, message }),
            ]));
        }

        sendTo(from, command, message, callback) {
            replies.push({ from, command, message, callback });
        }
    }
    const module = { exports: {} };
    const load = name => {
        if (name === '@iobroker/adapter-core') return { Adapter: FakeAdapter };
        if (name === './lib/adapter-runtime') return { AdapterRuntime: class {} };
        throw new Error(`Unexpected main.js import: ${name}`);
    };
    const context = {
        require: load,
        module,
        Buffer,
        setTimeout(callback, ms) {
            const handle = { id: ++nextTimer, unref() {} };
            timers.set(handle, { callback, ms });
            return handle;
        },
        clearTimeout(handle) {
            timers.delete(handle);
        },
    };
    vm.runInNewContext(mainSource, context, { filename: 'main.js' });
    const adapter = module.exports();
    return { adapter, replies, logs, timers };
}

function request(command = 'getChannelLists', selected = 'fastscan-selected', from = 'system.adapter.admin.0') {
    return {
        from,
        command,
        message: { host: 'tv.example', port: '905', channelListView: selected },
        callback: { id: 7, ack: false, time: 1 },
    };
}

test('Admin lists use the saved native selection and a temporary reload trigger', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const items = config.items._channels.items;
    const select = items.channelListView;
    const reload = items._channelListsReload;
    assert.equal(io.common.messagebox, true, 'Controller must deliver Admin messages to the adapter');
    assert.equal(io.native.channelListView, '', 'Fresh and upgraded instances must explicitly select a list');
    assert.equal(select.type, 'selectSendTo');
    assert.equal(select.command, 'getChannelLists');
    assert.equal(select.manual, false);
    assert.equal(select.multiple, false);
    assert.equal(select.default, '');
    assert.equal(select.defaultSendTo, undefined, 'Loading list options must never select the first list');
    // Admin 7.0.23 ConfigGeneric.getPattern evaluates jsonData as a JavaScript
    // template literal with the form's data object in scope. JSON.stringify
    // keeps quoted names, backslashes and other characters as data.
    for (const data of [
        { host: 'tv.example', port: 905, channelListView: 'favourites' },
        { host: 'tv"\\example', port: '905', channelListView: 'list"\\${noCode}`\nsecond line' },
        { host: 'tv.example', port: 905 },
    ]) {
        const payload = JSON.parse(vm.runInNewContext(`\`${select.jsonData}\``, { data }));
        assert.deepEqual(payload, { ...data, channelListView: data.channelListView || '' });
    }
    assert.ok(select.alsoDependsOn.includes('host'));
    assert.ok(select.alsoDependsOn.includes('port'));
    assert.ok(select.alsoDependsOn.includes('_channelListsReload'));
    assert.ok(!select.alsoDependsOn.includes('channelListView'), 'Choosing an option must not rediscover all lists');
    assert.ok(['sendto', 'sendTo'].includes(reload.type));
    assert.equal(reload.command, 'refreshChannelLists');
    assert.equal(reload.useNative, true);
    assert.equal(reload.doNotSave, true);
    assert.equal(reload.reloadBrowser, undefined, 'Reloading options must preserve unsaved form entries');
    assert.equal(reload.timeout, 5000);
    assert.equal(Object.hasOwn(io.native, '_channelListsReload'), false);
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'admin/i18n/de/translations.json'), 'utf8'));
    assert.equal(translations[select.label], 'TV-Senderliste');
    assert.equal(translations[reload.label], 'Senderlisten neu laden');
});

test('EPG configuration reads directly from the TV with only enable and refresh settings', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const panel = config.items._epg;
    const items = panel.items;
    const expected = { epgEnabled: true, epgRefreshInterval: 900 };
    assert.equal(panel.type, 'panel');
    assert.deepEqual(Object.keys(items).filter(key => !key.startsWith('_')).sort(), Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(io.native[key], value);
        assert.deepEqual(items[key].default, value);
    }
    assert.match(items._epgHelp.text, /directly from the TV/u);
    assert.doesNotMatch(JSON.stringify(panel), /xmltv|epgSource|guide URL/iu);
    for (const key of ['epgSource', 'epgXmltvUrl', 'epgXmltvMappings']) {
        assert.equal(Object.hasOwn(io.native, key), false, `Obsolete EPG default: ${key}`);
    }
    const translatedItems = [panel, ...Object.values(items)];
    for (const language of ['de', 'en']) {
        const translations = JSON.parse(fs.readFileSync(path.join(root, `admin/i18n/${language}/translations.json`), 'utf8'));
        assert.doesNotMatch(JSON.stringify(translations), /xmltv/iu, `${language} must not contain obsolete XMLTV guidance`);
        for (const item of translatedItems) {
            for (const key of ['label', 'title', 'text', 'help', 'validatorErrorText']) {
                if (item[key]) assert.ok(translations[item[key]], `${language} translation missing: ${item[key]}`);
            }
        }
    }
});

test('EPG form validates manual-only operation and bounded automatic intervals', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const items = config.items._epg.items;
    const validateInterval = value => executeAdminFunction(items.epgRefreshInterval.validator, { epgRefreshInterval: value });
    for (const value of [0, 300, 900, 86400]) assert.equal(validateInterval(value), true, String(value));
    assert.equal(validateInterval(undefined), true, 'A missing upgrade setting uses the 900-second default');
    for (const value of [-1, 1, 299, 300.5, 86401, null, '900']) assert.equal(validateInterval(value), false, String(value));
    assert.equal(items.epgRefreshInterval.validatorNoSaveOnError, true);
    assert.equal(executeAdminFunction(items.epgRefreshInterval.disabled, { epgEnabled: false }), true);
    assert.equal(executeAdminFunction(items.epgRefreshInterval.disabled, { epgEnabled: true }), false);
    assert.equal(executeAdminFunction(items.epgRefreshInterval.disabled, {}), false, 'EPG defaults to enabled while Admin initializes upgrade defaults');
    assert.match(items.epgRefreshInterval.help, /0 disables automatic EPG network requests, including at startup/u);
    assert.match(items.epgRefreshInterval.help, /channels\.epgRefresh/u);
});

test('Admin function-body evaluation catches nested-return expressions that would lock Save', () => {
    const brokenPattern = 'Number.isInteger(data.epgRefreshInterval) && (() => { return true; })()';
    const data = { epgRefreshInterval: 900 };
    assert.equal(vm.runInNewContext(brokenPattern, { data }), true, 'Expression-only evaluation misses the defect');
    assert.equal(executeAdminFunction(brokenPattern, data), undefined, 'Admin receives no outer return and blocks saving');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    assert.equal(executeAdminFunction(config.items._epg.items.epgRefreshInterval.validator, data), true);
});

test('all Admin validators allow saving with EPG enabled, disabled or manual-only', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    for (const epgEnabled of [true, false]) {
        for (const epgRefreshInterval of [0, 300, 900, 86400]) {
            const data = { ...clone(io.native), host: '192.168.178.35', epgEnabled, epgRefreshInterval };
            assert.deepEqual(adminValidationErrors(config, data), [], `enabled=${epgEnabled}, interval=${epgRefreshInterval}`);
        }
    }
});

test('missing EPG defaults and obsolete settings do not block Save while upgrade defaults initialize', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const epgFields = Object.entries(config.items._epg.items).filter(([key]) => !key.startsWith('_'));
    for (const legacy of [
        {},
        { epgSource: 'xmltv', epgXmltvUrl: 'file:///old-guide.xml', epgXmltvMappings: [{}] },
        { epgSource: {}, epgXmltvUrl: 17, epgXmltvMappings: null },
    ]) {
        const data = { ...clone(io.native), ...legacy, host: 'tv.example', channelListView: 'selected-favourites' };
        for (const [key] of epgFields) delete data[key];
        // ConfigGeneric.componentDidMount initializes absent defaults via a
        // 100 ms timer. Validate before, during and after those separate updates,
        // including an untouched EPG tab while another field is edited.
        for (const order of [epgFields, epgFields.slice().reverse()]) {
            const native = clone(data);
            assert.deepEqual(adminValidationErrors(config, native), []);
            assert.deepEqual(native, data, 'Validation must not mutate the native settings');
            for (const [key, field] of order) {
                native[key] = clone(field.default);
                assert.deepEqual(adminValidationErrors(config, native), [], `After initializing ${key}`);
            }
            assert.equal(native.channelListView, 'selected-favourites');
        }
    }
});

test('obsolete XMLTV values are ignored while current form validation remains active', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    for (const epgEnabled of [true, false]) {
        const data = {
            ...clone(io.native), host: 'tv.example', epgEnabled, epgRefreshInterval: 0,
            epgSource: 'invalid', epgXmltvUrl: 'file:///guide.xml', epgXmltvMappings: [{ channel: '', xmltvId: '' }],
        };
        assert.deepEqual(adminValidationErrors(config, data), [], `Legacy values must not block Save, enabled=${epgEnabled}`);
        data.epgRefreshInterval = 299;
        assert.deepEqual(adminValidationErrors(config, data), ['_epg.epgRefreshInterval']);
        delete data.epgRefreshInterval;
        assert.deepEqual(adminValidationErrors(config, data), [], 'Missing current settings use their defaults');
        data.host = '';
        assert.deepEqual(adminValidationErrors(config, data), ['_connection.host'], 'Required connection validation stays active');
    }
});

test('main registers and forwards Admin discovery with the original callback exactly once', async () => {
    const { adapter, replies, timers } = harness();
    const message = request();
    const options = [{ value: '', label: 'Bitte auswählen' }, { value: 'fastscan-selected', label: 'ASTRA LCN' }];
    const received = [];
    adapter.runtime = {
        async handleMessage(command, payload) {
            received.push({ command, payload });
            return options;
        },
    };
    assert.equal(adapter.listenerCount('message'), 1);
    adapter.emit('message', message);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(received, [{ command: 'getChannelLists', payload: message.message }]);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].from, message.from);
    assert.equal(replies[0].command, message.command);
    assert.equal(replies[0].message, options);
    assert.equal(replies[0].callback, message.callback);
    assert.equal(timers.size, 0);
});

test('reload response only changes the temporary Admin trigger', async () => {
    const { adapter, replies, timers } = harness();
    adapter.runtime = {
        async handleMessage(command) {
            assert.equal(command, 'refreshChannelLists');
            return { native: { _channelListsReload: 123 } };
        },
    };
    await adapter.onMessage(request('refreshChannelLists'));
    assert.deepEqual(clone(replies[0].message), { native: { _channelListsReload: 123 } });
    assert.equal(timers.size, 0);
});

test('discovery before runtime startup returns an error option while retaining the saved selection', async () => {
    const { adapter, replies, timers } = harness();
    await adapter.onMessage(request());
    assert.ok(Array.isArray(replies[0].message), 'Admin 7 directly calls filter on this response');
    assert.equal(replies[0].message[0].value, '');
    assert.match(replies[0].message[0].label, /noch nicht bereit/u);
    assert.equal(replies[0].message[1].value, 'fastscan-selected');
    assert.match(replies[0].message[1].label, /Auswahl beibehalten/u);
    assert.equal(timers.size, 0);
});

test('unexpected discovery errors and non-array responses are safe for the Admin selector', async () => {
    for (const response of [new Error('TV offline'), { error: 'TV offline' }, undefined]) {
        const { adapter, replies, timers } = harness();
        adapter.runtime = {
            async handleMessage() {
                if (response instanceof Error) throw response;
                return response;
            },
        };
        await adapter.onMessage(request());
        assert.equal(replies.length, 1);
        assert.ok(Array.isArray(replies[0].message));
        assert.equal(replies[0].message[1].value, 'fastscan-selected');
        assert.match(replies[0].message[0].label, /Senderlisten nicht verfügbar/u);
        assert.equal(timers.size, 0);
    }
});

test('reload startup failure uses the sendto button error format', async () => {
    const { adapter, replies } = harness();
    await adapter.onMessage(request('refreshChannelLists'));
    assert.equal(Array.isArray(replies[0].message), false);
    assert.match(replies[0].message.error, /noch nicht bereit/u);
    assert.equal(replies[0].message.native, undefined);
});

test('Admin watchdog answers within its deadline and ignores a late discovery result', async () => {
    const { adapter, replies, timers } = harness();
    const pending = deferred();
    adapter.runtime = { handleMessage: () => pending.promise };
    const operation = adapter.onMessage(request());
    const timer = [...timers.values()][0];
    assert.equal(timer.ms, 35000);
    timer.callback();
    assert.equal(replies.length, 1);
    assert.match(replies[0].message[0].label, /Zeitlimit/u);
    assert.equal(replies[0].message[1].value, 'fastscan-selected');
    pending.resolve([{ value: 'new', label: 'Late TV response' }]);
    await operation;
    assert.equal(replies.length, 1, 'A timed out message must never receive a second callback');
    assert.equal(timers.size, 0);
});

test('concurrent Admin callers receive their own responses and callback identifiers', async () => {
    const { adapter, replies } = harness();
    const first = deferred();
    const second = deferred();
    adapter.runtime = {
        handleMessage(_command, payload) {
            return payload.channelListView === 'first' ? first.promise : second.promise;
        },
    };
    const a = request('getChannelLists', 'first', 'system.adapter.admin.0');
    const b = request('getChannelLists', 'second', 'system.adapter.admin.1');
    b.callback = { ...b.callback, id: 8 };
    const waitingA = adapter.onMessage(a);
    const waitingB = adapter.onMessage(b);
    second.resolve([{ value: 'second', label: 'Second list' }]);
    await waitingB;
    first.resolve([{ value: 'first', label: 'First list' }]);
    await waitingA;
    assert.equal(replies.length, 2);
    assert.equal(replies[0].from, b.from);
    assert.equal(replies[0].callback, b.callback);
    assert.equal(replies[0].message[0].value, 'second');
    assert.equal(replies[1].from, a.from);
    assert.equal(replies[1].callback, a.callback);
    assert.equal(replies[1].message[0].value, 'first');
});

test('unsupported commands and messages without a valid reply route do not reach the TV runtime', async () => {
    const { adapter, replies, timers } = harness();
    adapter.runtime = { handleMessage() { assert.fail('Unsupported message was forwarded'); } };
    for (const message of [null, {}, request('zap'), { ...request(), callback: null }, { ...request(), from: '' }]) {
        await adapter.onMessage(message);
    }
    assert.equal(replies.length, 0);
    assert.equal(timers.size, 0);
});

test('a failed response delivery is logged once without retrying the callback', async () => {
    const { adapter, logs, timers } = harness();
    let attempts = 0;
    adapter.runtime = { async handleMessage() { return []; } };
    adapter.sendTo = () => {
        attempts += 1;
        throw new Error('Messages database closed');
    };
    await adapter.onMessage(request());
    assert.equal(attempts, 1);
    assert.equal(logs.length, 1);
    assert.match(logs[0].message, /Messages database closed/u);
    assert.equal(timers.size, 0);
});

test('fallback option bounds use UTF-8 bytes and reject control characters', async () => {
    for (const [selected, expectedLength] of [['ä'.repeat(1024), 2], ['ä'.repeat(1025), 1], ['bad\u0000list', 1], ['', 1]]) {
        const { adapter, replies } = harness();
        await adapter.onMessage(request('getChannelLists', selected));
        assert.equal(replies[0].message.length, expectedLength);
    }
});

test('TV search and cached choice messages retain the original Admin reply routes', async () => {
    for (const command of ['discoverTvs', 'getDiscoveredTvs']) {
        const { adapter, replies, timers } = harness();
        const response = command === 'discoverTvs'
            ? { native: { _tvDiscoveryReload: 7, _discoveredTv: '' }, result: 'discoveryComplete', args: [2] }
            : [{ value: '', label: 'Select' }, { value: '192.0.2.10', label: 'Wohnzimmer' }, { value: '192.0.2.20', label: 'Schlafzimmer' }];
        adapter.runtime = { async handleMessage(received, message) {
            assert.equal(received, command);
            assert.equal(message.port, '1905');
            return response;
        } };
        const message = { ...request(command), message: { port: '1905' } };
        await adapter.onMessage(message);
        assert.equal(replies.length, 1);
        assert.equal(replies[0].message, response);
        assert.equal(replies[0].callback, message.callback);
        assert.equal(timers.size, 0);
    }
});

test('TV discovery startup errors use the matching button or selector response format', async () => {
    const { adapter, replies } = harness();
    await adapter.onMessage(request('getDiscoveredTvs'));
    assert.deepEqual(clone(replies[0].message).map(option => option.value), ['']);
    assert.match(replies[0].message[0].label, /noch nicht bereit/u);
    await adapter.onMessage(request('discoverTvs'));
    assert.equal(Array.isArray(replies[1].message), false);
    assert.match(replies[1].message.error, /noch nicht bereit/u);
});

test('TV search watchdog answers once within the Admin button timeout', async () => {
    const { adapter, replies, timers } = harness();
    const pending = deferred();
    adapter.runtime = { handleMessage: () => pending.promise };
    const running = adapter.onMessage(request('discoverTvs'));
    const timer = [...timers.values()][0];
    assert.equal(timer.ms, 10000);
    timer.callback();
    assert.equal(replies.length, 1);
    assert.match(replies[0].message.error, /Zeitlimit/u);
    pending.resolve({ result: 'discoveryComplete', args: [1] });
    await running;
    assert.equal(replies.length, 1);
    assert.equal(timers.size, 0);
});

test('invalid cached TV choices cannot break the Admin selectSendTo widget', async () => {
    for (const response of [undefined, { error: 'offline' }, new Error('failed')]) {
        const { adapter, replies } = harness();
        adapter.runtime = { async handleMessage() {
            if (response instanceof Error) throw response;
            return response;
        } };
        await adapter.onMessage(request('getDiscoveredTvs'));
        assert.equal(replies.length, 1);
        assert.ok(Array.isArray(replies[0].message));
        assert.equal(replies[0].message[0].value, '');
    }
});
