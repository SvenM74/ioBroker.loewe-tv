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
            if (item.hidden === true || (typeof item.hidden === 'string'
                && executeAdminFunction(item.hidden, values, { globalData, arrayIndex }))) continue;
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

test('native guide iframe URL preserves the Admin proxy path and actual instance during startup', async () => {
    for (const basePath of ['/', '/iobroker/admin/', '/proxy-1/admin/', '/prox%C3%BD/admin/']) {
        const { adapter, replies, timers } = harness();
        adapter.namespace = 'loewe-tv.12';
        const message = { ...request('getEpgGuideUrl'), message: { basePath } };
        await adapter.onMessage(message);
        assert.equal(replies.length, 1);
        assert.equal(replies[0].message, `${basePath}adapter/loewe-tv/epg.html?instance=12`);
        assert.equal(timers.size, 0);
        assert.equal(adapter.runtime, null, 'URL generation must not depend on completed runtime startup');
    }
});

test('guide iframe URL cannot navigate to a supplied host or escape the Admin base', async () => {
    for (const basePath of ['https://example.org/', '//example.org/', '/a/../', '/%2e%2e/',
        '/a/%252e%252e/', '/a/%2f/', '/%5cfoo/', '/a/?bad/', '/a/#bad/', '/a/\n/', null]) {
        const { adapter, replies } = harness();
        adapter.namespace = 'loewe-tv.2';
        await adapter.onMessage({ ...request('getEpgGuideUrl'), message: { basePath } });
        assert.equal(replies[0].message, 'adapter/loewe-tv/epg.html?instance=2', String(basePath));
    }
    for (const namespace of [undefined, '', 'loewe-tv.null', 'loewe-tv.01', 'other.0', 'loewe-tv.1/..']) {
        const { adapter, replies } = harness();
        adapter.namespace = namespace;
        await adapter.onMessage({ ...request('getEpgGuideUrl'), message: {} });
        assert.equal(replies[0].message, 'adapter/loewe-tv/epg.html?invalidInstance=1');
    }
});

test('guide message responses preserve pagination errors without modifying configuration', async () => {
    const { adapter, replies, timers } = harness();
    const error = Object.assign(new Error('Senderliste geändert'), { code: 'EPG_GUIDE_CHANGED' });
    adapter.runtime = { async handleMessage(command, payload) {
        assert.equal(command, 'getEpgGuide');
        assert.deepEqual(clone(payload), { offset: 32 });
        throw error;
    } };
    await adapter.onMessage({ ...request('getEpgGuide'), message: { offset: 32 } });
    assert.deepEqual(clone(replies[0].message), { error: 'Senderliste geändert', code: 'EPG_GUIDE_CHANGED' });
    assert.equal(timers.size, 0);
});

test('guide message watchdog replies only once and does not wait for a TV refresh batch', async () => {
    for (const command of ['getEpgGuide', 'refreshEpgGuide']) {
        const { adapter, replies, timers } = harness();
        const pending = deferred();
        adapter.runtime = { handleMessage: () => pending.promise };
        const running = adapter.onMessage({ ...request(command), message: {} });
        assert.equal(timers.size, 1);
        const timer = [...timers.values()][0];
        assert.equal(timer.ms, 4000);
        timer.callback();
        assert.equal(replies.length, 1);
        assert.equal(replies[0].message.code, 'EPG_GUIDE_UNAVAILABLE');
        pending.resolve({ accepted: true });
        await running;
        assert.equal(replies.length, 1);
    }
});

test('guide message contract reports invalid or missing runtime replies inside the guide', async () => {
    for (const response of [undefined, null, [], '']) {
        const { adapter, replies } = harness();
        adapter.runtime = { handleMessage: () => response };
        await adapter.onMessage({ ...request('getEpgGuide'), message: {} });
        assert.equal(replies[0].message.code, 'EPG_GUIDE_UNAVAILABLE');
        assert.equal(typeof replies[0].message.error, 'string');
    }
    const { adapter, replies } = harness();
    await adapter.onMessage({ ...request('getEpgGuide'), message: {} });
    assert.equal(replies[0].message.code, 'EPG_GUIDE_UNAVAILABLE');
});

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

test('EPG configuration provides explicit TV/XMLTV sources separately from web access', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const panel = config.items._epg;
    const items = panel.items;
    const expected = { epgEnabled: true, epgRefreshInterval: 900, epgSource: 'tv', epgXmltvUrl: '', epgXmltvMappings: [] };
    assert.equal(panel.type, 'panel');
    assert.deepEqual(Object.keys(items).filter(key => !key.startsWith('_')).sort(), Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(io.native[key], value);
        if (key === 'epgXmltvMappings') {
            assert.equal(items[key].default, undefined, 'A delayed Admin default must not overwrite the automatically loaded TV rows');
        } else assert.deepEqual(items[key].default, value);
    }
    assert.match(items._epgHelp.text, /even while the TV is off/u);
    assert.deepEqual(items.epgSource.options.map(option => option.value), ['tv', 'auto', 'xmltv']);
    assert.equal(items._epgMappingPreview, undefined, 'The saved TV list is edited directly instead of a separate preview table');
    assert.equal(items._epgMappingResponse.doNotSave, true);
    assert.equal(items._epgMappingStatus.doNotSave, true);
    assert.equal(items._epgMappingLoad.onLoaded, true);
    assert.equal(items._epgMappingLoad.command, 'getEpgMappingRows', 'Opening the tab reads only the local TV catalogue');
    assert.equal(items.epgXmltvMappings.noDelete, true);
    assert.equal(items._epgMappingReload.useNative, true);
    assert.equal(items._epgMappingReload.onLoaded, undefined, 'A preview download requires an explicit click');
    const translatedItems = [panel, ...Object.values(items)];
    for (const language of ['de', 'en']) {
        const translations = JSON.parse(fs.readFileSync(path.join(root, `admin/i18n/${language}/translations.json`), 'utf8'));
        for (const item of translatedItems) {
            for (const key of ['label', 'title', 'text', 'help', 'validatorErrorText']) {
                if (item[key] && !item[key].includes('${')) assert.ok(translations[item[key]], `${language} translation missing: ${item[key]}`);
            }
        }
    }
});

test('web access uses the official instance selector without making old settings invalid', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const field = config.items._webAccess.items.webInstance;
    assert.equal(field.type, 'instance');
    assert.equal(field.adapter, 'web');
    assert.equal(field.allowDeactivate, true);
    assert.equal(field.onlyEnabled, false, 'A saved, temporarily disabled web instance must remain visible in the options.');
    // Admin 7.7.28 uses json-config 8.1.1; the same value contract exists in
    // json-config 10.1.3. Default values strip only "system.adapter."; short
    // would save only "0" and long would retain "system.adapter.web.0".
    // https://github.com/ioBroker/json-config/blob/v8.1.1/src/JsonConfigComponent/ConfigInstanceSelect.tsx
    // https://github.com/ioBroker/json-config/blob/v10.1.3/src/JsonConfigComponent/ConfigInstanceSelect.tsx
    assert.equal(field.short, undefined);
    assert.equal(field.long, undefined);
    assert.equal(field.all, undefined, 'A saved web selection identifies one existing instance.');
    assert.equal(field.default, '');
    assert.notEqual(field.doNotSave, true);
    assert.equal(field.onChange, undefined, 'Opening a different tab must not replace the saved selection.');
    assert.equal(field.hidden, undefined);
    assert.equal(field.disabled, undefined, 'Web access can be configured before either adapter starts.');
    assert.equal(io.native.webInstance, '');
    for (const webInstance of [undefined, '', 'web.0', 'web.12', 'web.123456789']) {
        const data = { ...clone(io.native), host: 'tv.example', webInstance };
        const before = clone(data);
        assert.deepEqual(adminValidationErrors(config, data), [], `Valid selection: ${webInstance}`);
        assert.deepEqual(clone(data), before);
    }
    for (const webInstance of [null, false, 0, '0', '*', 'web.01', 'web.-1', 'web.1234567890', 'admin.0', 'system.adapter.web.0', 'web.0/other', 'http://host:8082']) {
        assert.deepEqual(adminValidationErrors(config, { ...clone(io.native), host: 'tv.example', webInstance }), ['_webAccess.webInstance']);
    }
});

test('web access has a discoverable tab and distinct local and Cloud instructions in both languages', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const panel = config.items._webAccess;
    const tabs = Object.keys(config.items);
    assert.equal(panel.type, 'panel');
    assert.equal(panel.label, 'Web access');
    assert.equal(panel.hidden, undefined);
    assert.equal(panel.disabled, undefined);
    assert.equal(tabs.indexOf('_webAccess') + 1, tabs.indexOf('_programmeGuide'));
    assert.equal(config.items._epg.items.webInstance, undefined);
    assert.deepEqual(Object.keys(panel.items).filter(key => !key.startsWith('_')), ['webInstance']);
    assert.equal([...JSON.stringify(config).matchAll(/"webInstance":\{/gu)].length, 1,
        'The new panel keeps one native webInstance field; it must not add a second saved selection.');
    const guideHelp = config.items._programmeGuide.items._epgGuideHelp.text;
    assert.match(guideHelp, /configured under Web access/u);
    const field = panel.items.webInstance;
    assert.equal(field.label, 'Web adapter for the programme guide');
    for (const language of ['de', 'en']) {
        const translations = JSON.parse(fs.readFileSync(path.join(root, `admin/i18n/${language}/translations.json`), 'utf8'));
        for (const item of [panel, ...Object.values(panel.items)]) {
            for (const key of ['label', 'text', 'help', 'validatorErrorText']) {
                if (item[key]) assert.ok(translations[item[key]], `${language} translation missing: ${item[key]}`);
            }
        }
        assert.equal(translations[panel.label], language === 'de' ? 'Web-Zugriff' : 'Web access');
        assert.equal(translations[field.label], language === 'de'
            ? 'Web-Adapter für die Programmübersicht' : 'Web adapter for the programme guide');
        assert.ok(translations[guideHelp].includes(translations[panel.label]));
        const local = translations[panel.items._webGuideHelp.text];
        const cloud = translations[panel.items._cloudGuideHelp.text];
        assert.match(local, /Socket|socket/u);
        assert.match(cloud, /127\.0\.0\.1/u);
        assert.match(cloud, /HTTP/u);
        assert.match(cloud, /Socket\.IO/u);
        assert.match(cloud, language === 'de' ? /Cloud-Anmeldung/u : /Cloud login/u);
        assert.doesNotMatch(cloud, /user permissions|Benutzerrechte/u,
            'Cloud access must not be described as inheriting a local web user session.');
    }
});

test('Admin metadata declares per-TV programme pages as URL strings', () => {
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const link = io.common.localLinks._default;
    // Admin accepts string links; Intro defaults to intro:true and the adapter
    // title. An object here is also imported as an extra card by older web.
    // This checks our declaration, not every Admin resolver version. Admin 8
    // can redirect Web-extension links before opening them; see ADMIN_LINKS.md
    // and docs/upstream/repro-admin-links.cjs for executed upstream evidence.
    // https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Instances.tsx#L431-L460
    // https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Intro.tsx#L920-L981
    // https://github.com/ioBroker/ioBroker.web/blob/v9.0.0/src/main.ts#L824-L850
    assert.equal(typeof link, 'string');
    assert.equal(link, 'adapter/loewe-tv/epg.html?instance=%instance%');
    assert.equal(io.common.webExtension, 'lib/web-extension.js');
    assert.equal(fs.existsSync(path.join(root, io.common.webExtension)), true);
    for (const instance of [0, 1, 3, 12]) {
        const url = new URL(link.replace('%instance%', String(instance)), 'https://broker.example/proxy/admin/');
        assert.equal(url.pathname, '/proxy/admin/adapter/loewe-tv/epg.html');
        assert.equal(url.searchParams.get('instance'), String(instance));
        assert.equal(url.origin, 'https://broker.example');
    }
});

test('EPG settings and programme guide have separate tabs without moving or duplicating saved parameters', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
    const settings = config.items._epg;
    const guide = config.items._programmeGuide;
    assert.equal(config.type, 'tabs');
    assert.equal(settings.type, 'panel');
    assert.equal(guide.type, 'panel');
    assert.equal(settings.label, 'EPG settings');
    assert.equal(guide.label, 'Programme guide');
    assert.notEqual(settings.label, guide.label);
    assert.equal(settings.items._epgGuide, undefined, 'The detailed guide belongs only to its own tab');
    assert.ok(Object.keys(guide.items).every(key => key.startsWith('_')), 'The guide must not add saved native fields');
    const savedEpgFields = [];
    const visit = items => {
        for (const [key, item] of Object.entries(items)) {
            if (/^epg/u.test(key)) savedEpgFields.push(key);
            if (item.items && !Array.isArray(item.items)) visit(item.items);
        }
    };
    visit(config.items);
    assert.deepEqual(savedEpgFields.sort(), ['epgEnabled', 'epgRefreshInterval', 'epgSource', 'epgXmltvMappings', 'epgXmltvUrl']);
    for (const [field, value] of Object.entries({ epgEnabled: true, epgRefreshInterval: 900 })) {
        assert.equal(settings.items[field].default, value);
        assert.equal(io.native[field], value);
        assert.notEqual(settings.items[field].doNotSave, true);
    }
    const iframe = guide.items._epgGuide;
    assert.equal(iframe.type, 'iframeSendTo');
    assert.equal(iframe.command, 'getEpgGuideUrl');
    assert.equal(iframe.doNotSave, true);
    assert.equal(iframe.useNative, undefined, 'Opening the guide must not submit unsaved TV configuration');
    assert.deepEqual(iframe.sandbox.split(/\s+/u).sort(), [
        'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-same-origin', 'allow-scripts',
    ]);
    for (const epgEnabled of [true, false]) {
        const native = { ...clone(io.native), host: 'tv.example', channelListView: 'saved-list', epgEnabled, epgRefreshInterval: 0 };
        const before = clone(native);
        assert.deepEqual(adminValidationErrors(config, native), [], 'The new tab must not block Save or Save and close');
        assert.deepEqual(native, before, 'Visiting or validating the guide must preserve configured EPG values');
    }
    for (const language of ['de', 'en']) {
        const translations = JSON.parse(fs.readFileSync(path.join(root, `admin/i18n/${language}/translations.json`), 'utf8'));
        assert.ok(translations[guide.label], `${language}: missing guide tab label`);
        assert.notEqual(translations[guide.label], translations[settings.label]);
        assert.ok(translations[guide.items._epgGuideHelp.text], `${language}: missing guide help`);
    }
});

test('new EPG actions and queue reads forward their exact payload and original reply route once', async () => {
    const selection = Object.freeze({
        channelId: 'channels.tv.das_erste_hd', eventId: 'event-123', start: 120000, end: 180000,
        listView: 'saved-list', catalogRevision: 'a'.repeat(64),
    });
    for (const [command, payload, response] of [
        ['selectEpgProgramme', selection, { action: 'confirmRecording', selection }],
        ['recordEpgProgramme', Object.freeze({ ...selection, confirmed: true }), { action: 'recordingQueued', job: { id: 'job-123', status: 'queued' } }],
        ['getRecordings', Object.freeze({}), { schemaVersion: 1, ready: true, updatedAt: 100000, lastError: '', jobs: [] }],
        ['cancelRecording', Object.freeze({ jobId: 'job-123' }), { job: { id: 'job-123', status: 'cancelled' } }],
    ]) {
        const { adapter, replies, timers } = harness();
        const received = [];
        adapter.namespace = 'loewe-tv.12';
        adapter.runtime = { async handleMessage(receivedCommand, receivedPayload) {
            received.push({ command: receivedCommand, payload: receivedPayload });
            return response;
        } };
        const message = { ...request(command, '', 'system.adapter.admin.2'), message: payload, callback: { id: 31, ack: false } };
        const before = clone(payload);
        const running = adapter.onMessage(message);
        const watchdog = [...timers.values()][0];
        await running;
        assert.deepEqual(received, [{ command, payload }]);
        assert.equal(received[0].payload, payload, 'Main must not substitute a different programme, device or consent value');
        assert.deepEqual(clone(payload), before);
        assert.equal(replies.length, 1);
        assert.equal(replies[0].from, message.from);
        assert.equal(replies[0].command, command);
        assert.equal(replies[0].callback, message.callback);
        assert.equal(replies[0].message, response);
        assert.equal(timers.size, 0);
        watchdog.callback();
        assert.equal(replies.length, 1, 'An already completed response must ignore its stale watchdog');
        assert.equal(received.length, 1);
    }
});

test('Main preserves missing or refused recording confirmation for runtime validation', async () => {
    for (const payload of [{ channelId: 'channels.tv.das_erste_hd' }, { channelId: 'channels.tv.das_erste_hd', confirmed: false }]) {
        const { adapter, replies, timers } = harness();
        let calls = 0;
        adapter.runtime = { async handleMessage(command, received) {
            calls++;
            assert.equal(command, 'recordEpgProgramme');
            assert.deepEqual(received, payload);
            assert.notEqual(received.confirmed, true, 'Only the user confirmation may provide consent');
            throw Object.assign(new Error('Die Aufnahme muss ausdrücklich bestätigt werden.'), { code: 'EPG_ACTION_VALIDATION' });
        } };
        await adapter.onMessage({ ...request('recordEpgProgramme'), message: Object.freeze(payload) });
        assert.deepEqual(clone(replies[0].message), {
            error: 'Die Aufnahme muss ausdrücklich bestätigt werden.', code: 'EPG_ACTION_VALIDATION',
        });
        assert.equal(replies.length, 1);
        assert.equal(calls, 1);
        assert.equal(timers.size, 0);
    }
});

test('new EPG commands report startup and invalid runtime responses as structured errors', async () => {
    for (const command of ['selectEpgProgramme', 'recordEpgProgramme', 'getRecordings', 'cancelRecording']) {
        for (const response of ['startup', undefined, null, [], 'permissionError']) {
            const { adapter, replies, timers } = harness();
            if (response !== 'startup') adapter.runtime = { async handleMessage() { return response; } };
            await adapter.onMessage({ ...request(command), message: {} });
            assert.equal(replies.length, 1, `${command}: exactly one error reply`);
            assert.equal(Array.isArray(replies[0].message), false, 'The guide never expects selector error options');
            assert.equal(replies[0].message.code, 'EPG_GUIDE_UNAVAILABLE');
            assert.match(replies[0].message.error, response === 'startup' ? /noch nicht bereit/u : /Ungültige Antwort/u);
            assert.equal(replies[0].message.native, undefined, 'Action errors must not alter saved settings');
            assert.equal(timers.size, 0);
        }
    }
});

test('new EPG commands retain bounded actionable runtime error messages and codes', async () => {
    for (const [command, code] of [
        ['selectEpgProgramme', 'EPG_GUIDE_CHANGED'],
        ['recordEpgProgramme', 'EPG_ACTION_EXPIRED'],
        ['getRecordings', 'RECORDING_STATE_UNAVAILABLE'],
        ['cancelRecording', 'RECORDING_NOT_CANCELLABLE'],
    ]) {
        const { adapter, replies, timers } = harness();
        adapter.runtime = { async handleMessage() {
            throw Object.assign(new Error('Die ausgewählte Sendung hat sich geändert.'), { code });
        } };
        await adapter.onMessage({ ...request(command), message: {} });
        assert.deepEqual(clone(replies[0].message), { error: 'Die ausgewählte Sendung hat sich geändert.', code });
        assert.equal(replies.length, 1);
        assert.equal(timers.size, 0);
    }
    const { adapter, replies } = harness();
    adapter.runtime = { async handleMessage() {
        throw Object.assign(new Error('x'.repeat(2000)), { code: 'y'.repeat(200) });
    } };
    await adapter.onMessage({ ...request('recordEpgProgramme'), message: {} });
    assert.equal(replies[0].message.error.length, 1200);
    assert.equal(replies[0].message.code.length, 80);
});

test('new command watchdogs answer once without retrying late or failed programme mutations', async () => {
    for (const [command, deadline] of [
        ['selectEpgProgramme', 10000], ['recordEpgProgramme', 6000], ['getRecordings', 4000], ['cancelRecording', 6000],
    ]) {
        for (const settlesWithError of [false, true]) {
            const { adapter, replies, timers } = harness();
            const pending = deferred();
            let calls = 0;
            adapter.runtime = { handleMessage() { calls++; return pending.promise; } };
            const message = { ...request(command), message: { confirmed: true } };
            const running = adapter.onMessage(message);
            assert.equal(timers.size, 1);
            const watchdog = [...timers.values()][0];
            assert.equal(watchdog.ms, deadline);
            watchdog.callback();
            assert.equal(replies.length, 1);
            assert.equal(replies[0].message.code, 'EPG_GUIDE_UNAVAILABLE');
            assert.match(replies[0].message.error, /Zeitlimit/u);
            assert.equal(replies[0].from, message.from);
            assert.equal(replies[0].callback, message.callback);
            if (settlesWithError) pending.reject(Object.assign(new Error('Späte Ablehnung'), { code: 'EPG_ACTION_EXPIRED' }));
            else pending.resolve({ action: 'recordingQueued', job: { id: 'late-job' } });
            await running;
            watchdog.callback();
            assert.equal(replies.length, 1, `${command}: the original timeout must remain the only reply`);
            assert.equal(calls, 1, `${command}: a missing reply must never automatically repeat the operation`);
            assert.equal(timers.size, 0);
        }
    }
});

test('failed delivery of a recording acknowledgment does not repeat the recording operation', async () => {
    const { adapter, logs, timers } = harness();
    let operations = 0;
    let deliveries = 0;
    adapter.runtime = { async handleMessage(command) {
        operations++;
        assert.equal(command, 'recordEpgProgramme');
        return { action: 'recordingQueued', job: { id: 'job-123', status: 'queued' } };
    } };
    adapter.sendTo = () => { deliveries++; throw new Error('Admin connection closed'); };
    await adapter.onMessage({ ...request('recordEpgProgramme'), message: { confirmed: true } });
    assert.equal(operations, 1);
    assert.equal(deliveries, 1);
    assert.equal(logs.length, 1);
    assert.match(logs[0].message, /Admin connection closed/u);
    assert.equal(timers.size, 0);
});

test('EPG form validates manual-only operation and bounded automatic intervals', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
    const items = config.items._epg.items;
    const validateInterval = value => executeAdminFunction(items.epgRefreshInterval.validator, { epgRefreshInterval: value });
    for (const value of [0, 300, 900, 86400, '0', '300', '900', '86400']) assert.equal(validateInterval(value), true, String(value));
    assert.equal(validateInterval(undefined), true, 'A missing upgrade setting uses the 900-second default');
    for (const value of [-1, 1, 299, 300.5, 86401, null, '', ' ', 'invalid']) assert.equal(validateInterval(value), false, String(value));
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
                if (field.default !== undefined) native[key] = clone(field.default);
                assert.deepEqual(adminValidationErrors(config, native), [], `After initializing ${key}`);
            }
            assert.equal(native.epgXmltvMappings, undefined, 'The mapping table is filled by the guarded local reply, not an Admin default timer');
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
