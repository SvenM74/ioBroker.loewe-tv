'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../admin/jsonConfig.json');
const createAdminContract = require('./fixtures/admin-json-config/contract.cjs');

const items = config.items._channelLogos.items;
const clone = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
const staleMessage = 'The form changed while loading. Click Reload TV channels and logos again.';

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

function fullRow(instance = 0, mode = 'auto', logoId = '') {
    return {
        channel: `channels.tv.TV_${instance}`, tvChannel: `1. Fixture TV ${instance}`,
        tvLogo: 'TV-Bildadresse vorhanden', mode, logoId, assignment: 'Previous logo check', revision: 10,
    };
}

function form(instance = 0) {
    return {
        epgEnabled: false, channelLogoSource: 'auto', channelLogoCountry: 'de',
        channelListView: `saved-tv-list-${instance}`,
        channelLogoMappings: [fullRow(instance)],
        _logoMappingStatus: 'Previous logo check',
        channelLogoOverrides: [{ channel: `channels.tv.TV_${instance}`, url: `https://fixture.invalid/manual-${instance}.png` }],
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
        const component = control('channelLogoMappings', classes.ConfigTable);
        component.cells = [];
        component.validateUniqueProps = () => {};
        component.applyFilter = () => {};
        component.handleRequestSort = () => {};
        await component.componentDidMount();
        return component;
    }
    function cell(table, attr = 'logoId', index = 0, Class = classes.ConfigAutocompleteSendTo) {
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
        response(call, rows, status = 'TV logo assignments ready') {
            return { native: { _logoMappingResponse: {
                basis: { source: call.data.source || 'auto', country: call.data.country || 'de',
                    listView: call.data.listView ?? '', mappings: clone(call.data.mappings ?? []) },
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

test('the logo tab uses saved TV rows, explicit source modes and a directory link supported by Admin 7', () => {
    const order = Object.keys(config.items);
    assert.equal(order[order.indexOf('_epg') + 1], '_channelLogos');
    assert.deepEqual(items.channelLogoSource.options.map(option => option.value), ['auto', 'tv', 'registry']);
    assert.equal(items.channelLogoSource.default, 'auto');
    assert.deepEqual(items.channelLogoCountry.options.map(option => option.value), ['de', 'at', 'ch', 'all']);
    assert.equal(items.channelLogoCountry.default, 'de');
    const table = items.channelLogoMappings;
    assert.equal(table.type, 'table');
    assert.equal(table.noDelete, true, 'The TV catalogue owns the rows; Admin must not offer Add or Delete');
    assert.equal(table.default, undefined, 'A delayed default must not overwrite the automatic catalogue reply');
    assert.equal(table.disabled, undefined, 'Assignments also work while EPG is disabled or a single source is selected');
    assert.equal(table.hidden, undefined);
    assert.deepEqual(table.items.map(column => column.attr), ['tvChannel', 'tvLogo', 'mode', 'logoId', 'assignment']);
    for (const attr of ['tvChannel', 'tvLogo', 'assignment']) {
        assert.equal(table.items.find(column => column.attr === attr).readOnly, true, attr);
    }
    assert.deepEqual(table.items.find(column => column.attr === 'mode').options.map(option => option.value), ['auto', 'manual', 'disabled']);
    assert.equal(table.items.find(column => column.attr === 'mode').options[2].label, 'No directory logo');
    assert.equal(items._logoMappingLoad.onLoaded, true);
    assert.equal(items._logoMappingLoad.command, 'getLogoMappingRows');
    assert.equal(items._logoMappingReload.command, 'getLogoMappingRows');
    assert.equal(items._logoMappingReload.onLoaded, undefined);
    // ConfigStaticText.tsx at json-config fd30206954a5c29c6093340b02aaae0993bbf11c
    // (blob 85cdfdc73e41ca10a11559746f434dd66efdf5cc) supports href and target.
    assert.equal(items._logoDirectory.type, 'staticText');
    assert.equal(items._logoDirectory.href, 'https://github.com/tv-logo/tv-logos');
    assert.equal(items._logoDirectory.target, '_blank');
});

test('opening the logo tab loads both instances independently with EPG disabled and keeps manual URLs', async () => {
    for (const instance of [0, 1]) {
        const initial = { ...form(instance), channelLogoSource: 'tv', channelLogoCountry: 'at' };
        const harness = admin(initial, { instance });
        const table = await harness.table();
        const load = harness.control('_logoMappingLoad', harness.classes.ConfigSendto);
        await load.componentDidMount();
        assert.equal(harness.calls.length, 1);
        const call = harness.calls[0];
        assert.equal(call.target, `loewe-tv.${instance}`);
        assert.equal(call.command, 'getLogoMappingRows');
        assert.deepEqual(call.data, { source: 'tv', country: 'at', listView: initial.channelListView,
            mappings: initial.channelLogoMappings });
        const rows = [{ ...fullRow(instance), assignment: 'Registry match available', revision: 20 }];
        await harness.reply(call, harness.response(call, rows));
        assert.deepEqual(harness.data.channelLogoMappings, rows);
        assert.deepEqual(table.state.value, rows);
        assert.equal(harness.data._logoMappingStatus, 'TV logo assignments ready');
        assert.deepEqual(harness.data.channelLogoOverrides, initial.channelLogoOverrides);
        assert.equal(harness.data.epgEnabled, false);
        assert.equal(harness.saveRequests, 0, 'Loading a catalogue prepares a draft and must not save live configuration');
        const saved = harness.saveNative();
        assert.deepEqual(saved.channelLogoMappings, rows, 'Hidden service identity and revision stay inside the native row');
        assert.deepEqual(saved.channelLogoOverrides, initial.channelLogoOverrides);
        for (const attr of ['_logoMappingResponse', '_logoMappingStatus', '_logoMappingLoad', '_logoMappingReload', '_logoDirectory']) {
            assert.equal(saved[attr], undefined, attr);
            assert.equal(items[attr].doNotSave, true, attr);
        }
        assert.deepEqual(harness.alerts, []);
        harness.noErrors();
    }
});

test('an upgraded configuration without new logo fields receives saved rows without a competing default', async () => {
    const initial = form();
    for (const attr of ['channelLogoSource', 'channelLogoCountry', 'channelLogoMappings']) delete initial[attr];
    initial.channelListView = '';
    const harness = admin(initial);
    const table = await harness.table();
    assert.deepEqual(table.state.value, []);
    assert.equal(harness.data.channelLogoMappings, undefined);
    const load = harness.control('_logoMappingLoad', harness.classes.ConfigSendto);
    await load.componentDidMount();
    const call = harness.calls[0];
    assert.deepEqual(call.data, { source: 'auto', country: 'de', mappings: [] });
    const rows = [fullRow()];
    await harness.reply(call, harness.response(call, rows));
    await harness.clock.advance(500);
    assert.deepEqual(harness.data.channelLogoMappings, rows);
    assert.deepEqual(table.state.value, rows);
    assert.deepEqual(harness.data.channelLogoOverrides, initial.channelLogoOverrides);
    harness.noErrors();
});

test('manual logo search uses real row and country context, exact paths and the correct TV instance', async () => {
    for (const instance of [0, 1]) {
        const harness = admin({ ...form(instance), channelLogoCountry: 'ch' }, { instance });
        const table = await harness.table();
        const input = harness.cell(table);
        assert.equal(input.render(), null);
        await harness.clock.advance(500);
        assert.equal(harness.calls.length, 0, 'Automatic rows need no individual selector requests');
        await table.onTableCellChange(0, 'mode', 'disabled');
        assert.equal(input.render(), null);
        await harness.clock.advance(500);
        assert.equal(harness.calls.length, 0);
        await table.onTableCellChange(0, 'mode', 'manual');
        const typed = `countries/switzerland/fixture ${instance} "logo".png`;
        await table.onTableCellChange(0, 'logoId', typed);
        input.state.value = typed;
        const rendered = input.render();
        assert.equal(rendered.item.value, typed, 'A saved or draft exact path survives a not-yet-loaded option list');
        await harness.clock.advance(50);
        assert.equal(harness.calls.length, 1);
        const call = harness.calls[0];
        assert.equal(call.target, `loewe-tv.${instance}`);
        assert.equal(call.command, 'getLogoRegistryChannels');
        assert.deepEqual(call.data, { country: 'ch', listView: harness.data.channelListView,
            channel: `channels.tv.TV_${instance}`, selected: typed, query: typed });
        await harness.reply(call, [{ value: typed, label: `Directory image ${instance}` }]);
        assert.equal(input.state.selectOptions[0].value, typed);
        await harness.clock.advance(300);
        assert.equal(harness.data.channelLogoMappings[0].channel, `channels.tv.TV_${instance}`);
        assert.equal(harness.data.channelLogoMappings[0].mode, 'manual');
        assert.equal(harness.data.channelLogoMappings[0].logoId, typed);
        assert.equal(harness.saveRequests, 0);
        harness.noErrors();
    }
});

test('country, source and channel-list changes invalidate the displayed check while retaining corrections', async () => {
    for (const [attr, value] of [
        ['channelLogoCountry', 'at'], ['channelLogoSource', 'registry'], ['channelListView', 'different-saved-list'],
    ]) {
        const manual = fullRow(0, 'manual', 'germany/keep-this-logo.png');
        const initial = { ...form(), channelLogoMappings: [manual], _logoMappingResponse: { obsolete: true } };
        const harness = admin(initial);
        const table = await harness.table();
        const input = harness.cell(table);
        const before = input.getContext();
        await harness.change(attr, value);
        assert.deepEqual(harness.data.channelLogoMappings, [{ ...manual, assignment: '', revision: 11 }], attr);
        assert.notEqual(input.getContext(), before, 'The row revision refreshes cached country-specific options');
        assert.deepEqual(harness.data.channelLogoOverrides, initial.channelLogoOverrides);
        assert.equal(harness.data._logoMappingResponse, undefined);
        assert.equal(harness.data._logoMappingStatus, '');
        assert.equal(harness.saveRequests, 0);
        harness.noErrors();
    }
});

test('rechecking prepares one guarded local form update and leaves existing manual image addresses intact', async () => {
    const initial = { ...form(), channelLogoCountry: 'all', channelLogoMappings: [fullRow(0, 'manual', 'manual-path.png')] };
    const harness = admin(initial);
    const preview = harness.control('_logoMappingReload', harness.classes.ConfigSendto);
    await preview.componentDidMount();
    assert.equal(harness.calls.length, 0, 'The extra recheck button only runs when clicked');
    preview._onClick();
    const call = harness.calls[0];
    assert.deepEqual(call.data, { source: 'auto', country: 'all', listView: initial.channelListView, mappings: initial.channelLogoMappings });
    const rows = [{ ...initial.channelLogoMappings[0], assignment: 'Chosen image', revision: 20 }];
    await harness.reply(call, harness.response(call, rows, 'One directory assignment checked'));
    assert.deepEqual(harness.data.channelLogoMappings, rows);
    assert.equal(harness.data._logoMappingStatus, 'One directory assignment checked');
    assert.deepEqual(harness.data.channelLogoOverrides, initial.channelLogoOverrides);
    assert.equal(harness.saveRequests, 0);
    assert.deepEqual(harness.alerts, []);
    harness.noErrors();
});

test('late logo replies cannot replace flushed row edits or a changed country, source or TV list', async () => {
    for (const buttonName of ['_logoMappingLoad', '_logoMappingReload']) {
        const harness = admin(form(), { language: 'de' });
        const table = await harness.table();
        harness.control(buttonName, harness.classes.ConfigSendto)._onClick();
        const call = harness.calls[0];
        table.onTableCellChange(0, 'mode', 'manual');
        table.onTableCellChange(0, 'logoId', 'chosen-during-load.png');
        await harness.clock.advance(300);
        const draft = clone(harness.data.channelLogoMappings);
        await harness.reply(call, harness.response(call, [{ ...fullRow(), revision: 99 }], 'Old directory result'));
        assert.deepEqual(harness.data.channelLogoMappings, draft);
        assert.equal(harness.data._logoMappingStatus, staleMessage);
        const status = harness.control('_logoMappingStatus');
        assert.equal(status.getText(status.props.schema.text), 'Das Formular wurde während des Ladens geändert. Klicke erneut auf „TV-Sender und Logos neu laden“.');
        assert.equal(harness.saveRequests, 0);
        harness.noErrors();
    }
    for (const [attr, value] of [
        ['channelLogoCountry', 'at'], ['channelLogoSource', 'tv'], ['channelListView', 'another-list'],
    ]) {
        const harness = admin(form());
        harness.control('_logoMappingReload', harness.classes.ConfigSendto)._onClick();
        const call = harness.calls[0];
        await harness.change(attr, value);
        const draft = clone(harness.data.channelLogoMappings);
        await harness.reply(call, harness.response(call, [fullRow(1)]));
        assert.deepEqual(harness.data.channelLogoMappings, draft, attr);
        assert.equal(harness.data._logoMappingStatus, staleMessage);
        harness.noErrors();
    }
});

test('a buffered logo edit survives a reply received before the Admin table flushes it', async () => {
    const harness = admin(form());
    const table = await harness.table();
    harness.control('_logoMappingReload', harness.classes.ConfigSendto)._onClick();
    const call = harness.calls[0];
    table.onTableCellChange(0, 'mode', 'manual');
    table.onTableCellChange(0, 'logoId', 'buffered-choice.png');
    await harness.clock.advance(100);
    assert.equal(harness.data.channelLogoMappings[0].mode, 'auto');
    await harness.reply(call, harness.response(call, [{ ...fullRow(), revision: 30 }]));
    await harness.clock.advance(300);
    assert.equal(harness.data.channelLogoMappings[0].mode, 'manual');
    assert.equal(harness.data.channelLogoMappings[0].logoId, 'buffered-choice.png');
    assert.equal(harness.data._logoMappingResponse, undefined);
    assert.equal(harness.data._logoMappingStatus, '');
    // Multiple edits around the 300 ms upstream table replacement still have
    // the documented Admin limitation covered by epg-config.test.js. Keep the
    // visible instruction to wait until the catalogue request has finished.
    assert.equal(items._logoMappingLoadingHelp.hidden, undefined);
    assert.equal(items._logoMappingLoadingHelp.controlStyle.fontWeight, 600);
    harness.noErrors();
});

test('an unavailable instance or failed local catalogue read preserves all existing logo settings', async () => {
    const initial = form();
    const harness = admin(initial, { alive: false });
    const load = harness.control('_logoMappingLoad', harness.classes.ConfigSendto);
    assert.equal(load.calculate(load.props.schema).disabled, true);
    await load.componentDidMount();
    assert.equal(harness.calls.length, 1, 'Upstream onLoaded executes even when its visible button is disabled');
    await harness.clock.advance(8000);
    assert.match(load.state._error, /timed out/u);
    assert.deepEqual(harness.data.channelLogoMappings, initial.channelLogoMappings);
    assert.deepEqual(harness.data.channelLogoOverrides, initial.channelLogoOverrides);
    await harness.reply(harness.calls[0], { error: 'Saved TV channel list is not ready' });
    assert.equal(load.state._error, 'Saved TV channel list is not ready');
    assert.deepEqual(harness.data.channelLogoMappings, initial.channelLogoMappings);
    assert.equal(harness.data._logoMappingResponse, undefined);
    assert.equal(harness.saveRequests, 0);
    harness.noErrors();
});

test('optional logo fields and manual image errors never block saving the other TV settings', async () => {
    for (const value of [undefined, null, '', 'unexpected-legacy-value']) {
        const harness = admin({ ...form(), channelLogoSource: value, channelLogoCountry: value });
        for (const attr of ['channelLogoSource', 'channelLogoCountry']) {
            assert.equal(harness.control(attr).render().error, false, `${attr}: ${value}`);
        }
        await harness.clock.advance(150);
        assert.equal(harness.saveBlocked, false);
        harness.noErrors();
    }
    const harness = admin(form());
    const schema = items.channelLogoOverrides.items.find(column => column.attr === 'url');
    for (const url of [undefined, null, '', '   ', 'https://fixture.invalid/logo.svg']) {
        const input = harness.control('url', undefined, { schema, custom: true, data: { url }, globalData: harness.data });
        assert.equal(input.render().error, false, String(url));
    }
    const invalid = harness.control('url', undefined, { schema, custom: true, data: { url: 'javascript:alert(1)' }, globalData: harness.data });
    assert.equal(invalid.render().error, true);
    await harness.clock.advance(150);
    assert.equal(harness.saveBlocked, false, 'An invalid optional image can be corrected without locking the Save button');
    assert.deepEqual(harness.reportedSaveErrors, []);
    harness.noErrors();
});

test('logo instructions, country choices and conflict guidance have complete German and English translations', () => {
    const strings = new Set([staleMessage]);
    function visit(fields) {
        for (const field of Object.values(fields)) {
            for (const key of ['label', 'title', 'help', 'text', 'validatorErrorText']) {
                if (typeof field[key] === 'string' && field[key] && !field[key].includes('${')) strings.add(field[key]);
            }
            for (const option of field.options || []) strings.add(option.label);
            if (field.items) visit(field.items);
        }
    }
    visit(items);
    for (const language of ['de', 'en']) {
        const translations = require(`../admin/i18n/${language}/translations.json`);
        for (const key of strings) {
            assert.ok(typeof translations[key] === 'string' && translations[key].trim(), `${language}: ${key}`);
        }
    }
    assert.doesNotMatch(items._logoExternalHelp.text, /royalty.free|public domain/iu);
});

