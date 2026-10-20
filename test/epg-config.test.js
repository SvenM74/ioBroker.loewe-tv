'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../admin/jsonConfig.json');
const createAdminContract = require('./fixtures/admin-json-config/contract.cjs');
const { normalizeManualMappings } = require('../lib/epg-mapping');
const { buildMappingRows } = require('../lib/epg-config');
const { prepareInternetEpg } = require('../lib/epg-presets');
const { EPGSHARE_DE_URL } = require('../lib/epg-provider');

const items = config.items._epg.items;
const clone = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
const staleMessage = 'The form changed while loading. Click Reload saved TV channels again.';

function virtualClock() {
    let now = 0;
    let nextId = 0;
    const jobs = new Map();
    return {
        setTimeout(callback, delay = 0, ...args) {
            const id = ++nextId;
            jobs.set(id, { at: now + delay, callback, args });
            return id;
        },
        clearTimeout(id) { jobs.delete(id); },
        async advance(ms) {
            const until = now + ms;
            let executed = 0;
            for (;;) {
                const next = [...jobs.entries()].filter(([, job]) => job.at <= until)
                    .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
                if (!next) break;
                assert.ok(++executed < 200, 'The Admin fixture must not schedule an unbounded loop');
                const [id, job] = next;
                jobs.delete(id);
                now = job.at;
                job.callback(...job.args);
                await settle();
            }
            now = until;
            await settle();
        },
    };
}

function fullRow(instance = 0, mode = 'auto', xmltvId = '') {
    return {
        channel: `channels.tv.TV_${instance}`, tvChannel: `1. Fixture TV ${instance}`,
        mode, xmltvId, assignment: 'Previous source check', revision: 10,
    };
}

function form(instance = 0) {
    return {
        epgEnabled: true, epgRefreshInterval: 900, epgSource: 'auto',
        epgXmltvUrl: `https://fixture.invalid/tv-${instance}.xml`,
        channelListView: `saved-tv-list-${instance}`,
        epgXmltvMappings: [fullRow(instance)],
        _epgMappingStatus: 'Previous source check',
    };
}

// React state/window/socket are controlled here. Expressions, templates,
// dependency binding, validation, native replies, and table debounce execute
// the pinned upstream methods in fixtures/admin-json-config, not a local
// reimplementation of Admin's JSONConfig rules.
function admin(initial, { instance = 0, alive = true, language = 'en' } = {}) {
    let data = clone(initial);
    const saved = clone(initial);
    const schema = clone(config);
    const clock = virtualClock();
    const components = [];
    const calls = [];
    const alerts = [];
    const logs = [];
    const reportedSaveErrors = [];
    let saveRequests = 0;
    const translations = require(`../admin/i18n/${language}/translations.json`);
    const classes = createAdminContract({
        isObject: value => Object.prototype.toString.call(value) === '[object Object]',
        I18n: { t: value => translations[value] || value },
        console: Object.fromEntries(['error', 'warn', 'log'].map(level => [level, (...args) => logs.push({ level, args })])),
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        window: {
            location: { protocol: 'https:', host: 'admin.fixture.invalid', hostname: 'admin.fixture.invalid',
                pathname: '/index.html', href: 'https://admin.fixture.invalid/index.html' },
            alert: text => alerts.push(text),
        },
    });
    const attachState = component => {
        component.state = {};
        component.setState = (update, callback) => {
            Object.assign(component.state, typeof update === 'function' ? update(component.state) : update);
            if (component.cells) {
                for (const cell of component.cells) cell.props.data = component.state.value[cell.props.arrayIndex];
            }
            callback?.();
        };
        component.forceUpdate = () => {};
        return component;
    };
    const registry = attachState(new classes.JsonConfigComponent());
    registry.state = { errors: {} };
    registry.props = { onError: error => reportedSaveErrors.push(error) };
    registry.buildDependencies(schema);
    const fields = registry.flatten(schema);
    const context = {
        adapterName: 'loewe-tv', instance, systemConfig: {}, instanceObj: {},
        onCommandRunning: running => {
            for (const component of components) if (!component.props.custom) component.props.commandRunning = running;
        },
        forceUpdate: (attrs, next) => {
            for (const component of components) {
                if (!component.props.custom && attrs.includes(component.props.attr)) component.onUpdate(next);
            }
        },
        socket: {
            sendTo(target, command, payload) {
                return new Promise(resolve => calls.push({ target, command, data: clone(payload), resolve }));
            },
        },
    };
    function setForm(next) {
        data = next;
        for (const component of components) {
            if (component.props.custom) component.props.globalData = data;
            else component.props.data = data;
        }
    }
    function control(attr, Class = classes.ConfigGeneric, options = {}) {
        const component = attachState(new Class());
        const fieldSchema = options.schema || fields[attr];
        assert.ok(fieldSchema, `Missing field schema: ${attr}`);
        component.props = {
            attr, schema: fieldSchema, data, originalData: saved, oContext: context,
            common: {}, alive, changed: true, onError: registry.onError,
            onChange(next, _value, callback, save) {
                if (save) saveRequests++;
                else setForm(next);
                callback?.();
            },
            ...options,
        };
        component.isError = {};
        component.defaultSendToDone = true;
        component.lang = language;
        component.state.value = component.props.data[attr];
        component.state.hostname = 'admin.fixture.invalid';
        if (Class === classes.ConfigGeneric) {
            component.renderItem = (error, disabled, defaultValue) => ({ error, disabled, defaultValue });
        }
        components.push(component);
        return component;
    }
    async function table() {
        const component = control('epgXmltvMappings', classes.ConfigTable);
        component.cells = [];
        component.validateUniqueProps = () => {};
        component.applyFilter = () => {};
        component.handleRequestSort = () => {};
        await component.componentDidMount();
        return component;
    }
    function cell(table, attr = 'xmltvId', index = 0, Class = classes.ConfigAutocompleteSendTo) {
        const component = control(attr, Class, {
            schema: table.props.schema.items.find(column => column.attr === attr),
            data: table.state.value[index], globalData: data, custom: true, table: true, arrayIndex: index,
            onChange(changedAttr, value, callback) {
                table.onTableCellChange(index, changedAttr, value);
                callback?.();
            },
        });
        table.cells.push(component);
        return component;
    }
    return {
        classes, fields, control, table, cell, clock, calls, alerts, logs, reportedSaveErrors,
        get data() { return data; },
        get saveRequests() { return saveRequests; },
        get saveBlocked() { return Object.keys(registry.state.errors).length > 0; },
        async change(attr, value) { await control(attr).onChange(attr, value); },
        async reply(call, response) { call.resolve(response); await settle(); },
        response(call, rows, status = 'TV channel assignments ready') {
            return { native: { _epgMappingResponse: {
                basis: { url: call.data.url ?? '', listView: call.data.listView ?? '', mappings: clone(call.data.mappings ?? []) },
                rows: clone(rows), status,
            } } };
        },
        saveNative() {
            const outer = new classes.JsonConfig();
            outer.state = { data, schema };
            return outer.copyNativeForSave({ native: clone(saved) }).obj.native;
        },
        noErrors() { assert.deepEqual(logs, [], 'Upstream Admin must evaluate every expression/template without errors'); },
    };
}

test('Internet EPG setup prepares a saveable Admin draft and retains each TV list and manual assignments', async () => {
    for (const instance of [0, 1]) {
        const initial = { ...form(instance), epgEnabled: false,
            epgSource: instance ? 'xmltv' : 'tv', epgXmltvUrl: instance ? form(instance).epgXmltvUrl : '',
            epgRefreshInterval: instance ? ' 900 ' : 0,
            epgXmltvMappings: [fullRow(instance, 'manual', `retained-${instance}`)] };
        const harness = admin(initial, { instance, language: 'de' });
        const setup = harness.control('_epgInternetSetup', harness.classes.ConfigSendto);
        await setup.componentDidMount();
        assert.equal(harness.calls.length, 0, 'Opening the configuration must not enable an external source.');
        setup._onClick();
        const call = harness.calls[0];
        assert.equal(call.target, `loewe-tv.${instance}`);
        assert.equal(call.command, 'prepareInternetEpg');
        assert.deepEqual(call.data, { url: initial.epgXmltvUrl, source: initial.epgSource, refreshInterval: initial.epgRefreshInterval });
        await harness.reply(call, prepareInternetEpg(call.data));
        assert.equal(harness.saveRequests, 0, 'The button must not save or restart a running adapter.');
        const native = harness.saveNative();
        assert.equal(native.epgEnabled, true);
        assert.equal(native.epgSource, instance ? 'xmltv' : 'auto');
        assert.equal(native.epgXmltvUrl, instance ? initial.epgXmltvUrl : EPGSHARE_DE_URL);
        assert.equal(native.epgRefreshInterval, instance ? 900 : 3600);
        assert.equal(native.channelListView, initial.channelListView);
        assert.deepEqual(native.epgXmltvMappings, initial.epgXmltvMappings);
        assert.equal(native._epgInternetSetup, undefined);
        assert.equal(harness.saveBlocked, false);
        assert.match(harness.alerts.join(' '), /vorbereitet.*speichern/u);
        harness.noErrors();
    }
});

test('upstream Admin accepts numeric interval strings and keeps required interval validation', async () => {
    for (const value of [undefined, 0, '0', 300, '300', 900, '900', ' 900 ', 86400, '86400']) {
        const harness = admin({ ...form(), epgRefreshInterval: value });
        assert.equal(harness.control('epgRefreshInterval').calculate(harness.fields.epgRefreshInterval).error, false, String(value));
        harness.noErrors();
    }
    for (const value of [null, false, true, '', ' ', 'null', 1, '299', 86401, '900.5', 'NaN', 'Infinity']) {
        const harness = admin({ ...form(), epgRefreshInterval: value });
        const input = harness.control('epgRefreshInterval');
        assert.equal(input.render().error, true, String(value));
        await harness.clock.advance(150);
        assert.equal(harness.saveBlocked, true, String(value));
        await input.onChange('epgRefreshInterval', '900');
        assert.equal(input.render().error, false);
        await harness.clock.advance(150);
        assert.equal(harness.saveBlocked, false);
        assert.deepEqual(harness.reportedSaveErrors, [true, false]);
        harness.noErrors();
    }
});

test('missing or invalid optional source addresses show field errors without blocking all Admin settings', async () => {
    for (const url of ['', 'not a URL', 'file:///guide.xml', 'https://user:password@fixture.invalid/guide.xml']) {
        const harness = admin({ ...form(), epgSource: 'xmltv', epgXmltvUrl: url });
        assert.equal(harness.control('epgXmltvUrl').render().error, true, url);
        assert.notEqual(harness.control('_epgXmltvWarning').render(), null, 'The missing-source explanation must remain visible');
        await harness.clock.advance(150);
        assert.equal(harness.saveBlocked, false);
        assert.deepEqual(harness.reportedSaveErrors, []);
        harness.noErrors();
    }
    const harness = admin(form());
    assert.equal(harness.control('epgXmltvUrl').render().error, false);
    assert.equal(harness.control('_epgXmltvWarning').render(), null);
    const logo = config.items._channelLogos.items.channelLogoOverrides.items.find(column => column.attr === 'url');
    for (const url of [undefined, null, '', '   ', 'https://fixture.invalid/logo.svg']) {
        const input = harness.control('url', undefined, { schema: logo, custom: true, data: { url }, globalData: harness.data });
        assert.equal(input.render().error, false, String(url));
    }
    const invalidLogo = harness.control('url', undefined, { schema: logo, custom: true, data: { url: 'javascript:alert(1)' }, globalData: harness.data });
    assert.equal(invalidLogo.render().error, true);
    await harness.clock.advance(150);
    assert.equal(harness.saveBlocked, false);
    harness.noErrors();
});

test('the saved TV matrix has fixed sender rows, explicit modes, and no raw sender-ID or Add/Delete editor', () => {
    const table = items.epgXmltvMappings;
    assert.equal(table.type, 'table');
    assert.equal(table.noDelete, true, 'Admin uses noDelete for Add as well as Delete');
    assert.notEqual(table.doNotSave, true);
    assert.equal(table.default, undefined, 'A delayed Admin default must not overwrite fast onLoaded rows');
    assert.equal(table.hidden, undefined, 'Saved TV rows are visible before configuring an external source');
    assert.deepEqual(table.items.map(column => column.attr), ['tvChannel', 'mode', 'xmltvId', 'assignment']);
    assert.equal(table.items[0].readOnly, true);
    assert.equal(table.items[3].readOnly, true);
    assert.deepEqual(table.items[1].options.map(option => option.value), ['auto', 'manual', 'disabled']);
    assert.equal(table.items[2].type, 'autocompleteSendTo');
    assert.equal(table.items[2].freeSolo, true);
    assert.equal(table.items[2].maxLength, 512);
    for (const removed of ['_epgMappingChannel', '_epgMappingChoice', '_applyEpgMapping', '_epgMappingPreview']) {
        assert.equal(items[removed], undefined, removed);
    }
});

test('onLoaded sends only a local saved-TV request and applies legacy mappings without saving live objects', async () => {
    for (const instance of [0, 1]) {
        const legacy = { [`channels.tv.TV_${instance}`]: `manual-ID-${instance}` };
        const harness = admin({ ...form(instance), epgSource: 'tv', epgXmltvUrl: '', channelListView: '', epgXmltvMappings: legacy }, { instance });
        const table = await harness.table();
        assert.deepEqual(table.state.value, [], 'The original Admin table cannot render an unconverted mapping object');
        assert.deepEqual(harness.data.epgXmltvMappings, legacy, 'Mounting must not discard the saved legacy value');
        const load = harness.control('_epgMappingLoad', harness.classes.ConfigSendto);
        assert.equal(load.props.schema.hidden, undefined);
        assert.equal(load.props.schema.onLoaded, true);
        assert.equal(load.props.schema.timeout, 8000);
        await load.componentDidMount();
        assert.equal(harness.calls.length, 1);
        const call = harness.calls[0];
        assert.equal(call.target, `loewe-tv.${instance}`);
        assert.equal(call.command, 'getEpgMappingRows');
        assert.deepEqual(call.data, { url: '', mappings: legacy });
        const rows = [fullRow(instance, 'manual', `manual-ID-${instance}`)];
        await harness.reply(call, harness.response(call, rows));
        assert.deepEqual(harness.data.epgXmltvMappings, rows);
        assert.deepEqual(table.state.value, rows);
        assert.equal(harness.data._epgMappingStatus, 'TV channel assignments ready');
        assert.equal(harness.saveRequests, 0);
        const native = harness.saveNative();
        assert.deepEqual(native.epgXmltvMappings, rows, 'Hidden channel/revision metadata stays inside the saved native table');
        assert.equal(native._epgMappingResponse, undefined);
        assert.equal(native._epgMappingStatus, undefined);
        assert.deepEqual(harness.alerts, []);
        harness.noErrors();
    }
});

test('a missing native mapping value can load the TV rows without a competing table default', async () => {
    const initial = form();
    delete initial.epgXmltvMappings;
    const harness = admin(initial);
    const table = await harness.table();
    assert.deepEqual(table.state.value, [], 'Upstream ConfigTable already handles a missing value as an empty list');
    const load = harness.control('_epgMappingLoad', harness.classes.ConfigSendto);
    await load.componentDidMount();
    const call = harness.calls[0];
    assert.deepEqual(call.data.mappings, []);
    const rows = [fullRow()];
    await harness.reply(call, harness.response(call, rows));
    await harness.clock.advance(500);
    assert.deepEqual(harness.data.epgXmltvMappings, rows);
    assert.deepEqual(table.state.value, rows);
    harness.noErrors();
});

test('only manual matrix cells ask for XMLTV choices; real row/global templates preserve exact IDs and instance routing', async () => {
    for (const instance of [0, 1]) {
        const harness = admin(form(instance), { instance });
        const table = await harness.table();
        const input = harness.cell(table);
        assert.equal(input.render(), null);
        await harness.clock.advance(500);
        assert.equal(harness.calls.length, 0, 'Hidden automatic rows must not issue selector requests');
        await table.onTableCellChange(0, 'mode', 'disabled');
        assert.equal(input.render(), null);
        await harness.clock.advance(500);
        assert.equal(harness.calls.length, 0);
        await table.onTableCellChange(0, 'mode', 'manual');
        const typed = `Exact ID ${instance} \\"with quotes\\"`;
        await table.onTableCellChange(0, 'xmltvId', typed);
        input.state.value = typed;
        const rendered = input.render();
        assert.equal(rendered.item.value, typed, 'freeSolo keeps an exact manual ID even without a fetched option');
        await harness.clock.advance(50);
        assert.equal(harness.calls.length, 1);
        const call = harness.calls[0];
        assert.equal(call.target, `loewe-tv.${instance}`);
        assert.equal(call.command, 'getXmltvChannels');
        assert.deepEqual(call.data, {
            url: harness.data.epgXmltvUrl, listView: harness.data.channelListView,
            channel: `channels.tv.TV_${instance}`, selected: typed, query: typed,
        });
        await harness.reply(call, [{ value: typed, label: `Source channel ${instance}` }]);
        assert.equal(input.state.selectOptions[0].value, typed);
        await harness.clock.advance(300);
        assert.equal(harness.data.epgXmltvMappings[0].channel, `channels.tv.TV_${instance}`);
        assert.equal(harness.data.epgXmltvMappings[0].mode, 'manual');
        assert.equal(harness.data.epgXmltvMappings[0].xmltvId, typed);
        harness.noErrors();
    }
});

test('an upstream autocomplete event without a target value survives the real table, RPC, repair and native save', async t => {
    for (const mode of ['manual', 'auto', 'disabled']) {
        await t.test(mode, async () => {
            const rows = [fullRow(0, 'manual', 'previous-id'), fullRow(1, 'manual', 'keep-id'),
                fullRow(2, 'disabled'), fullRow(3)];
            const harness = admin({ ...form(), epgXmltvMappings: rows });
            const table = await harness.table();
            const input = harness.cell(table);
            const rendered = input.render();
            assert.equal(rendered.item.value, 'previous-id');
            assert.equal(typeof rendered.onInputChange, 'function');

            // Material UI can send an event whose target is an option element.
            // Execute the pinned upstream JSX callback itself, including its
            // unchecked target.value read, rather than synthesizing broken rows.
            rendered.onInputChange({ target: { tagName: 'LI' } });
            assert.equal(table.state.value[0].xmltvId, undefined);
            if (mode !== 'manual') table.onTableCellChange(0, 'mode', mode);
            await harness.clock.advance(300);
            assert.equal(harness.data.epgXmltvMappings[0].channel, rows[0].channel,
                'Editing a cell must preserve the hidden TV identity.');

            harness.control('_epgMappingLoad', harness.classes.ConfigSendto)._onClick();
            const call = harness.calls.find(request => request.command === 'getEpgMappingRows');
            assert.ok(call, 'The request must come from the shipped form and original SendTo implementation.');
            assert.equal(Object.hasOwn(call.data.mappings[0], 'xmltvId'), false,
                'The actual JSON request drops the undefined field.');
            assert.equal(call.data.mappings[0].mode, mode);
            const expected = { [rows[1].channel]: 'keep-id', [rows[2].channel]: '' };
            if (mode !== 'auto') expected[rows[0].channel] = '';
            assert.deepEqual(normalizeManualMappings(call.data.mappings), expected);

            const services = rows.map((row, index) => ({ id: row.channel,
                name: `Fixture TV ${index}`, number: index + 1, itemClass: 'video' }));
            const catalogue = services.map((service, index) => ({
                id: index === 1 ? 'keep-id' : `automatic-${index}`, names: [service.name],
            }));
            const repaired = buildMappingRows(services, catalogue, call.data.mappings,
                { catalogueLoaded: true, revision: 11 });
            assert.equal(repaired.rows[0].mode, mode);
            assert.equal(repaired.rows[0].xmltvId, '');
            assert.equal(repaired.rows[1].xmltvId, 'keep-id', 'Other manual corrections remain intact.');
            assert.equal(repaired.rows[2].mode, 'disabled');
            assert.equal(repaired.assigned, mode === 'auto' ? 3 : 2,
                'An unfinished manual row must not silently accept an automatic match.');
            if (mode === 'manual') assert.match(repaired.rows[0].assignment, /bitte einen XMLTV-Sender auswählen/u);

            await harness.reply(call, harness.response(call, repaired.rows));
            await harness.clock.advance(300);
            assert.deepEqual(harness.data.epgXmltvMappings, repaired.rows);
            const saved = harness.saveNative();
            assert.deepEqual(saved.epgXmltvMappings, repaired.rows);
            assert.deepEqual(normalizeManualMappings(saved.epgXmltvMappings), expected);
            assert.equal(Object.hasOwn(saved, '_epgMappingResponse'), false);

            const reopened = admin(saved);
            const reopenedTable = await reopened.table();
            assert.deepEqual(reopenedTable.state.value, repaired.rows);
            reopened.control('_epgMappingLoad', reopened.classes.ConfigSendto)._onClick();
            assert.deepEqual(normalizeManualMappings(reopened.calls[0].data.mappings), expected,
                'Opening the saved configuration must not repeat the error.');
            assert.deepEqual(harness.alerts, []);
            harness.noErrors();
            reopened.noErrors();
        });
    }
});

test('upstream autocomplete clear and selection callbacks preserve an explicit XMLTV field', async () => {
    const harness = admin({ ...form(), epgXmltvMappings: [fullRow(0, 'manual', 'previous-id')] });
    const table = await harness.table();
    const input = harness.cell(table);
    const rendered = input.render();
    rendered.onChange({}, null);
    await harness.clock.advance(300);
    assert.equal(harness.data.epgXmltvMappings[0].xmltvId, '');
    assert.deepEqual(normalizeManualMappings(harness.data.epgXmltvMappings), { 'channels.tv.TV_0': '' });
    rendered.onChange({}, { value: 'replacement-id', label: 'Replacement channel' });
    await harness.clock.advance(300);
    assert.equal(harness.data.epgXmltvMappings[0].xmltvId, 'replacement-id');
    assert.deepEqual(normalizeManualMappings(harness.saveNative().epgXmltvMappings), { 'channels.tv.TV_0': 'replacement-id' });
    harness.noErrors();
});

test('source changes invalidate full-row choices but keep corrections and untouched legacy rows for backend migration', async () => {
    for (const [attr, value] of Object.entries({ epgSource: 'xmltv', epgXmltvUrl: 'https://fixture.invalid/replacement.xml', channelListView: 'other-saved-list' })) {
        const manual = fullRow(0, 'manual', 'keep-exact-id');
        const harness = admin({ ...form(), epgXmltvMappings: [manual], _epgMappingResponse: { obsolete: true } });
        const table = await harness.table();
        const input = harness.cell(table);
        const before = input.getContext();
        await harness.change(attr, value);
        assert.deepEqual(harness.data.epgXmltvMappings, [{ ...manual, assignment: '', revision: 11 }], attr);
        assert.notEqual(input.getContext(), before, 'The row revision refreshes options when the global source changes');
        assert.equal(harness.data._epgMappingResponse, undefined);
        assert.equal(harness.data._epgMappingStatus, '');
        harness.noErrors();
    }
    for (const legacy of [
        [{ channel: 'channels.tv.TV_0', xmltvId: 'legacy-id' }, { channel: 'channels.tv.Other', xmltvId: '' }],
        { 'channels.tv.TV_0': 'legacy-id', 'channels.tv.Other': '' },
    ]) {
        const harness = admin({ ...form(), epgXmltvMappings: legacy });
        await harness.change('epgXmltvUrl', 'https://fixture.invalid/new-before-first-load.xml');
        assert.deepEqual(harness.data.epgXmltvMappings, legacy, 'Do not add full-row metadata before legacy migration');
        harness.noErrors();
    }
});

test('preview runs only on an explicit click, keeps unsaved rows in the request and applies one guarded form update', async () => {
    const harness = admin({ ...form(), epgXmltvMappings: [fullRow(0, 'manual', 'unsaved-correction')] });
    const preview = harness.control('_epgMappingReload', harness.classes.ConfigSendto);
    await preview.componentDidMount();
    assert.equal(harness.calls.length, 0, 'No external source is downloaded by mounting the form');
    preview._onClick();
    const call = harness.calls[0];
    assert.equal(call.command, 'previewEpgMappings');
    assert.deepEqual(call.data, { url: harness.data.epgXmltvUrl, listView: harness.data.channelListView, mappings: harness.data.epgXmltvMappings });
    const rows = [{ ...fullRow(0, 'manual', 'unsaved-correction'), assignment: 'Matched source channel', revision: 20 }];
    await harness.reply(call, { ...harness.response(call, rows, 'One channel assigned'), result: 'mappingPreviewReady', args: ['1', '1'] });
    assert.deepEqual(harness.data.epgXmltvMappings, rows);
    assert.equal(harness.data._epgMappingStatus, 'One channel assigned');
    assert.equal(harness.saveRequests, 0);
    assert.deepEqual(harness.alerts, [], 'A result popup must not bypass the stale-draft guard');
    assert.equal(items._epgMappingResponse.doNotSave, true);
    assert.equal(items._epgMappingResponse.hidden, true);
    harness.noErrors();
});

test('late native replies preserve edits made while loading and explain how to reload the saved TV list', async () => {
    for (const command of ['_epgMappingLoad', '_epgMappingReload']) {
        const harness = admin(form(), { language: 'de' });
        const table = await harness.table();
        const button = harness.control(command, harness.classes.ConfigSendto);
        button._onClick();
        const call = harness.calls[0];
        table.onTableCellChange(0, 'mode', 'manual');
        table.onTableCellChange(0, 'xmltvId', 'chosen-during-request');
        await harness.clock.advance(300);
        const draft = clone(harness.data.epgXmltvMappings);
        await harness.reply(call, harness.response(call, [{ ...fullRow(), revision: 99 }], 'Old source response'));
        assert.deepEqual(harness.data.epgXmltvMappings, draft);
        assert.equal(harness.data._epgMappingStatus, staleMessage);
        const status = harness.control('_epgMappingStatus');
        assert.equal(status.getText(status.props.schema.text), 'Das Formular wurde während des Ladens geändert. Klicke erneut auf TV-Senderliste laden.');
        assert.equal(harness.saveRequests, 0);
        harness.noErrors();
    }
    for (const [attr, value] of [['epgXmltvUrl', 'https://fixture.invalid/changed.xml'], ['channelListView', 'different-tv-list']]) {
        const harness = admin(form());
        harness.control('_epgMappingReload', harness.classes.ConfigSendto)._onClick();
        const call = harness.calls[0];
        await harness.change(attr, value);
        const draft = clone(harness.data.epgXmltvMappings);
        await harness.reply(call, harness.response(call, [fullRow(1)]));
        assert.deepEqual(harness.data.epgXmltvMappings, draft);
        assert.equal(harness.data._epgMappingStatus, staleMessage);
        harness.noErrors();
    }
});

test('a table edit already buffered by Admin survives a reply that arrives before its 300 ms form update', async () => {
    const harness = admin(form());
    const table = await harness.table();
    harness.control('_epgMappingReload', harness.classes.ConfigSendto)._onClick();
    const call = harness.calls[0];
    table.onTableCellChange(0, 'mode', 'manual');
    table.onTableCellChange(0, 'xmltvId', 'buffered-exact-id');
    await harness.clock.advance(100);
    assert.equal(harness.data.epgXmltvMappings[0].mode, 'auto', 'Upstream has not flushed the row to root form data yet');
    await harness.reply(call, harness.response(call, [{ ...fullRow(), assignment: 'Checked', revision: 30 }]));
    // Contract boundary: native forceUpdate can replace the table's local
    // view during this gap. The existing debounce callback still contains
    // the complete edited row and must not be discarded by the response.
    assert.equal(table.state.value[0].mode, 'auto');
    await harness.clock.advance(300);
    assert.equal(harness.data.epgXmltvMappings[0].mode, 'manual');
    assert.equal(harness.data.epgXmltvMappings[0].xmltvId, 'buffered-exact-id');
    assert.equal(harness.data._epgMappingResponse, undefined);
    assert.equal(harness.data._epgMappingStatus, '');
    harness.noErrors();
});

test('known Admin limitation: two row edits around a reply can lose a field inside the 300 ms table buffer', async () => {
    // This records an upstream limitation, not a completed fix. The visible
    // loading notice asks users to wait before editing. A schema-only guard
    // sees root form data, but Admin's pending local table edit is not there yet.
    const harness = admin(form());
    const table = await harness.table();
    harness.control('_epgMappingReload', harness.classes.ConfigSendto)._onClick();
    const call = harness.calls[0];
    table.onTableCellChange(0, 'mode', 'manual');
    table.onTableCellChange(0, 'xmltvId', 'first-edit');
    await harness.clock.advance(100);
    await harness.reply(call, harness.response(call, [{ ...fullRow(), revision: 30 }]));
    await harness.clock.advance(50);
    table.onTableCellChange(0, 'xmltvId', 'second-edit');
    await harness.clock.advance(300);
    assert.equal(harness.data.epgXmltvMappings[0].xmltvId, 'second-edit');
    assert.equal(harness.data.epgXmltvMappings[0].mode, 'auto',
        'Known behavior: the second edit copied the replaced local row, so the first mode edit was lost');
    assert.equal(items._epgMappingLoadingHelp.hidden, undefined, 'The documented workaround must remain visible');
    assert.equal(items._epgMappingLoadingHelp.controlStyle.fontWeight, 600);
    harness.noErrors();
});

test('a failed or offline automatic reload retains the existing matrix and exposes a bounded error', async () => {
    const harness = admin(form(), { alive: false });
    const load = harness.control('_epgMappingLoad', harness.classes.ConfigSendto);
    assert.equal(load.calculate(load.props.schema).disabled, true);
    await load.componentDidMount();
    assert.equal(harness.calls.length, 1, 'Upstream onLoaded runs even when the visible button is disabled');
    await harness.clock.advance(8000);
    assert.match(load.state._error, /timed out/u);
    assert.deepEqual(harness.data.epgXmltvMappings, form().epgXmltvMappings);
    assert.equal(harness.saveRequests, 0);
    await harness.reply(harness.calls[0], { error: 'Saved TV channel list is not ready' });
    assert.equal(load.state._error, 'Saved TV channel list is not ready');
    assert.deepEqual(harness.data.epgXmltvMappings, form().epgXmltvMappings);
    assert.equal(harness.data._epgMappingResponse, undefined);
    harness.noErrors();
});

test('the TV matrix, modes, validation warning and conflict guidance have German and English text', () => {
    const strings = [items._epgMappingHelp.text, items._epgMappingLoadingHelp.text, items._epgXmltvWarning.text,
        items._epgMappingLoad.label, items._epgMappingReload.label, items.epgXmltvMappings.label,
        items.epgXmltvMappings.help, staleMessage,
        ...items.epgXmltvMappings.items.map(column => column.title),
        ...items.epgXmltvMappings.items[1].options.map(option => option.label)];
    for (const language of ['de', 'en']) {
        const translations = require(`../admin/i18n/${language}/translations.json`);
        for (const key of strings) assert.ok(typeof translations[key] === 'string' && translations[key].trim(), `${language}: ${key}`);
    }
});
