'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const config = require('../admin/jsonConfig.json');

const items = config.items._epg.items;
const clone = value => JSON.parse(JSON.stringify(value));

// Admin 7.7.28 uses json-config ^8.1.1. Both that version and current
// json-config resolve selector alsoDependsOn from props.data, whereas table
// cells receive the row as data and the root form separately as globalData.
// ConfigGeneric executes function bodies and applies onChange dependencies
// using the source control's schema, including sendTo useNative replies.
// https://github.com/ioBroker/json-config/tree/fd30206954a5c29c6093340b02aaae0993bbf11c/src/JsonConfigComponent
// https://github.com/ioBroker/json-config/tree/6e910b3c71a3f884014992f92151a1ae223ef4c7/src/JsonConfigComponent
function execute(source, data, { globalData = data, alive = true } = {}) {
    const body = source.includes('return') ? source : `return ${source}`;
    return vm.runInNewContext(`(function (data, globalData, _alive) { ${body}\n})(data, globalData, alive)`, {
        data, globalData, alive, URL,
    });
}

function payload(item, data, options) {
    assert.ok(item.jsonData.startsWith('${') && item.jsonData.endsWith('}'));
    return JSON.parse(execute(item.jsonData.slice(2, -1), data, options));
}

function context(item, data) {
    return JSON.stringify(Object.fromEntries((item.alsoDependsOn || []).map(attr => [
        attr, attr.split('.').reduce((value, key) => value?.[key], data),
    ])));
}

function fieldsOf(schema, result = {}) {
    for (const [attr, item] of Object.entries(schema.items || {})) {
        result[attr] = item;
        if (item.items && !Array.isArray(item.items)) fieldsOf(item, result);
    }
    return result;
}

const fields = fieldsOf(config);

function changeForm(data, sourceAttr, value, attr = sourceAttr) {
    const next = clone(data);
    next[attr] = value;
    for (const [target, item] of Object.entries(fields)) {
        if (item.onChange?.alsoDependsOn?.includes(sourceAttr)) {
            next[target] = execute(item.onChange.calculateFunc, next);
        }
    }
    if (fields[sourceAttr].onChange && !fields[sourceAttr].onChange.ignoreOwnChanges) {
        next[sourceAttr] = execute(fields[sourceAttr].onChange.calculateFunc, next);
    }
    return clone(next);
}

function nativeReply(data, sourceAttr, native) {
    let next = data;
    for (const [attr, value] of Object.entries(native)) next = changeForm(next, sourceAttr, value, attr);
    return next;
}

function form(instance = 0) {
    return {
        epgEnabled: true,
        epgSource: 'auto',
        epgXmltvUrl: `https://fixture.invalid/tv-${instance}.xml`,
        channelListView: `saved-tv-list-${instance}`,
        _epgMappingReload: 100,
        _epgMappingPreview: [{ channel: 'Fixture TV', match: 'Fixture XMLTV', status: 'Automatic', suggestions: '' }],
        _epgMappingChannel: `channels.tv.TV_${instance}`,
        _epgMappingChoice: `fixture-channel-${instance}`,
        epgXmltvMappings: [
            { channel: `channels.tv.Previous_${instance}`, xmltvId: 'previous-source-id' },
            { channel: `channels.tv.Disabled_${instance}`, xmltvId: '' },
        ],
    };
}

test('XMLTV selectors use the current instance form and allow exact manual IDs while online', () => {
    assert.equal(items._epgMappingChannel.type, 'selectSendTo');
    assert.equal(items._epgMappingChannel.command, 'getEpgTvChannels');
    assert.equal(items._epgMappingChannel.manual, false);
    assert.equal(items._epgMappingChoice.type, 'autocompleteSendTo');
    assert.equal(items._epgMappingChoice.command, 'getXmltvChannels');
    assert.equal(items._epgMappingChoice.freeSolo, true, 'selectSendTo.manual only enables an offline text fallback');
    assert.equal(items._epgMappingChoice.maxLength, 512);
    for (const attr of ['_epgMappingChannel', '_epgMappingChoice', '_applyEpgMapping']) {
        assert.equal(items[attr].doNotSave, true);
        assert.equal(items[attr].attr, undefined, 'The editor must not be a table row');
    }
    for (const instance of [0, 1]) {
        const data = form(instance);
        assert.deepEqual(payload(items._epgMappingChannel, data), {
            listView: data.channelListView, channel: data._epgMappingChannel,
        });
        const typed = changeForm(data, '_epgMappingChoice', `manual exact ID ${instance}`);
        assert.equal(typed._epgMappingChoice, `manual exact ID ${instance}`);
        assert.deepEqual(payload(items._epgMappingChoice, typed), {
            url: data.epgXmltvUrl, listView: data.channelListView, channel: data._epgMappingChannel,
            selected: `manual exact ID ${instance}`, query: `manual exact ID ${instance}`,
        });
        assert.deepEqual(typed.epgXmltvMappings, data.epgXmltvMappings, 'Typing a search or ID cannot change corrections');
    }
});

test('XMLTV results reload for root URL, preview, channel and search changes', () => {
    const data = form();
    const original = context(items._epgMappingChoice, data);
    for (const [attr, value] of Object.entries({
        epgXmltvUrl: 'https://fixture.invalid/replacement.xml',
        channelListView: 'saved-second-list',
        _epgMappingReload: 101,
        _epgMappingChannel: 'channels.tv.Second',
        _epgMappingChoice: 'search by sender name',
    })) {
        assert.notEqual(context(items._epgMappingChoice, { ...data, [attr]: value }), original, attr);
    }
    for (const item of [items._epgMappingChoice, items._epgMappingChannel]) {
        for (const attr of item.alsoDependsOn) {
            assert.ok(fields[attr], `A dependency must name a real root field: ${attr}`);
            assert.doesNotMatch(attr, /^(?:globalData|data)\./u);
        }
    }
    assert.notEqual(context(items._epgMappingChannel, { ...data, _epgMappingReload: 101 }),
        context(items._epgMappingChannel, data));
});

test('source and TV changes clear obsolete preview choices without discarding manual corrections', () => {
    const data = form();
    for (const [attr, value] of Object.entries({
        epgSource: 'xmltv',
        epgXmltvUrl: 'https://fixture.invalid/other.xml',
        channelListView: 'saved-other-list',
    })) {
        const next = changeForm(data, attr, value);
        assert.deepEqual(next._epgMappingPreview, [], attr);
        assert.equal(next._epgMappingReload, 0, attr);
        assert.equal(next._epgMappingChoice, '', attr);
        assert.deepEqual(next.epgXmltvMappings, data.epgXmltvMappings, attr);
        if (attr === 'channelListView') assert.equal(next._epgMappingChannel, '');
    }
    const next = changeForm(data, '_epgMappingChannel', 'channels.tv.Second');
    assert.equal(next._epgMappingChoice, '', 'An XMLTV ID selected for another TV channel must not carry over');
    assert.deepEqual(next.epgXmltvMappings, data.epgXmltvMappings);
});

test('preview is explicit and read-only; fresh useNative results survive their own reload token', () => {
    const data = form();
    const changed = changeForm(data, 'epgXmltvUrl', 'https://fixture.invalid/changed.xml');
    assert.equal(items._epgMappingReload.type, 'sendTo');
    assert.equal(items._epgMappingReload.command, 'previewEpgMappings');
    assert.equal(items._epgMappingReload.useNative, true);
    assert.equal(items._epgMappingReload.doNotSave, true);
    assert.equal(items._epgMappingReload.onLoaded, undefined, 'Downloading requires an explicit button click');
    assert.deepEqual(payload(items._epgMappingReload, changed), {
        url: changed.epgXmltvUrl, mappings: data.epgXmltvMappings, listView: data.channelListView,
    });
    assert.equal(items._epgMappingPreview.doNotSave, true);
    assert.equal(items._epgMappingPreview.noDelete, true, 'Admin also hides Add for noDelete tables');
    assert.ok(items._epgMappingPreview.items.every(column => column.readOnly === true));
    const rows = [{ channel: 'Fixture TV', match: 'Replacement [replacement-id]', status: 'Manual', suggestions: '' }];
    const loaded = nativeReply(changed, '_epgMappingReload', {
        _epgMappingPreview: rows, _epgMappingReload: 200,
    });
    assert.deepEqual(loaded._epgMappingPreview, rows);
    assert.equal(loaded._epgMappingReload, 200);
    assert.deepEqual(loaded.epgXmltvMappings, data.epgXmltvMappings);
    assert.equal(execute(items._epgMappingReload.disabled, loaded, { alive: false }), true);
});

test('Apply requires a TV and nonempty ID and sends every existing exception to the unsaved form update', () => {
    const data = form();
    const apply = items._applyEpgMapping;
    assert.equal(apply.type, 'sendTo');
    assert.equal(apply.command, 'applyEpgMapping');
    assert.equal(apply.useNative, true);
    assert.equal(apply.onLoaded, undefined);
    assert.equal(execute(apply.disabled, data), false);
    assert.equal(execute(apply.disabled, data, { alive: false }), true);
    for (const changes of [
        { epgEnabled: false }, { _epgMappingChannel: '' }, { _epgMappingChannel: null },
        { _epgMappingChannel: 'not-a-tv-id' }, { _epgMappingChoice: '' },
        { _epgMappingChoice: '   ' }, { _epgMappingChoice: undefined },
        { _epgMappingChoice: { value: 'wrong-object' } }, { _epgMappingChoice: 'x'.repeat(513) },
    ]) assert.equal(execute(apply.disabled, { ...data, ...changes }), true, JSON.stringify(changes));
    assert.deepEqual(payload(apply, data), {
        mappings: data.epgXmltvMappings, channel: data._epgMappingChannel,
        xmltvId: data._epgMappingChoice, listView: data.channelListView,
    });
    assert.deepEqual(payload(apply, { ...data, epgXmltvMappings: undefined }).mappings, []);
    const mappings = [...data.epgXmltvMappings, { channel: data._epgMappingChannel, xmltvId: data._epgMappingChoice }];
    const updated = nativeReply(data, '_applyEpgMapping', { epgXmltvMappings: mappings });
    assert.deepEqual(updated.epgXmltvMappings, mappings);
    assert.deepEqual(updated._epgMappingPreview, [], 'The previous preview must not claim to include a new correction');
    assert.deepEqual(data.epgXmltvMappings, form().epgXmltvMappings, 'The original saved values stay untouched');
});

test('manual rows remain editable, support deliberate empty IDs and deletion restores automatic matching', () => {
    const table = items.epgXmltvMappings;
    assert.equal(table.type, 'table');
    assert.notEqual(table.doNotSave, true);
    assert.notEqual(table.noDelete, true);
    assert.equal(table.onChange, undefined, 'Existing rows must not be replaced or normalized in the form');
    assert.deepEqual(table.items.map(column => column.attr), ['channel', 'xmltvId']);
    const [tv, xmltv] = table.items;
    assert.equal(tv.type, 'selectSendTo');
    assert.equal(tv.command, 'getEpgTvChannels');
    assert.equal(tv.manual, true, 'An existing TV ID remains editable in the offline fallback');
    assert.equal(xmltv.type, 'text', 'A Select would prevent typing an ID while the adapter is online');
    assert.equal(xmltv.default, '');
    for (const item of [tv, xmltv]) assert.notEqual(item.readOnly, true);
    for (const attr of ['command', 'jsonData', 'alsoDependsOn', 'validator']) assert.equal(xmltv[attr], undefined);
    const data = form();
    assert.deepEqual(payload(tv, data.epgXmltvMappings[0], { globalData: data }), {
        channel: data.epgXmltvMappings[0].channel, listView: data.channelListView,
    });
    const cleared = data.epgXmltvMappings.map(row => ({ ...row, xmltvId: '' }));
    const edited = changeForm(data, 'epgXmltvMappings', cleared);
    assert.deepEqual(edited.epgXmltvMappings, cleared);
    assert.deepEqual(edited._epgMappingPreview, []);
    assert.deepEqual(changeForm(edited, 'epgXmltvMappings', []).epgXmltvMappings, []);
});

test('the correction editor and editable ID column have German and English labels and instructions', () => {
    const strings = [items._epgMappingEditorHelp.text, items._epgMappingChannel.label, items._epgMappingChoice.label,
        items._applyEpgMapping.label, items.epgXmltvMappings.help, items.epgXmltvMappings.items[1].title];
    for (const language of ['de', 'en']) {
        const translations = require(`../admin/i18n/${language}/translations.json`);
        for (const key of strings) assert.ok(typeof translations[key] === 'string' && translations[key].trim(), `${language}: ${key}`);
    }
});
