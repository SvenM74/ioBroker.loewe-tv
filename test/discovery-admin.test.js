'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'admin/jsonConfig.json'), 'utf8'));
const io = JSON.parse(fs.readFileSync(path.join(root, 'io-package.json'), 'utf8'));
const items = config.items._connection.items;
const clone = value => JSON.parse(JSON.stringify(value));

function execute(source, data, alive = true) {
    // Admin evaluates function bodies, adding an outer return only if the
    // source does not already contain "return". Keep the same rule here.
    const body = source.includes('return') ? source : `return ${source}`;
    return vm.runInNewContext(`(function (data, _alive) { ${body}\n})(data, _alive)`, {
        data, _alive: alive,
    });
}

function form(initial) {
    let data = clone(initial);
    const persisted = clone(initial);
    return {
        get data() { return data; },
        get persisted() { return persisted; },
        change(attr, value) {
            const next = clone(data);
            next[attr] = value;
            // JsonConfigComponent indexes onChange.alsoDependsOn in the
            // source field's onChangeDependsOn. ConfigGeneric.onChange then
            // evaluates those direct dependents once and handles the source.
            // This models that Admin contract, including ignoreOwnChanges.
            // Primary sources, both checked against the current implementation:
            // https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/index.tsx
            // https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigGeneric.tsx
            for (const [dependent, item] of Object.entries(items)) {
                if (item.onChange?.alsoDependsOn?.includes(attr)) {
                    next[dependent] = execute(item.onChange.calculateFunc, next);
                }
            }
            const rule = items[attr]?.onChange;
            if (rule && !rule.ignoreOwnChanges) next[attr] = execute(rule.calculateFunc, next);
            data = next;
        },
        nativeResponse(values) {
            // ConfigSendto.useNative calls onChangeAsync per returned field;
            // it does not save unless the response separately says saveConfig.
            for (const [attr, value] of Object.entries(values)) this.change(attr, value);
        },
    };
}

test('TV discovery is an explicit bounded action; reading suggestions does not trigger a scan', () => {
    const select = items._discoveredTv;
    const search = items._tvDiscoveryReload;
    assert.equal(select.type, 'selectSendTo');
    assert.equal(select.command, 'getDiscoveredTvs');
    assert.deepEqual(select.alsoDependsOn, ['port', '_tvDiscoveryReload']);
    assert.equal(select.manual, false);
    assert.equal(select.multiple, false);
    assert.equal(select.noTranslation, true);
    assert.equal(select.default, '');
    assert.equal(select.defaultSendTo, undefined, 'Loading choices must never select the first television');
    assert.equal(select.doNotSave, true);
    assert.equal(search.type, 'sendto');
    assert.equal(search.command, 'discoverTvs');
    assert.equal(search.useNative, true);
    assert.equal(search.doNotSave, true);
    assert.equal(search.showProcess, true);
    assert.ok(search.timeout >= 10000 && search.timeout <= 15000, 'Leave time for the bounded scan and release the UI on timeout');
    assert.equal(search.onLoaded, undefined, 'Opening the form must not scan the network');
    assert.equal(search.reloadBrowser, undefined, 'A search must preserve unsaved fields');
    for (const key of ['_discoveredTv', '_tvDiscoveryReload']) {
        assert.equal(Object.hasOwn(io.native, key), false, `${key} must remain temporary form data`);
        assert.equal(execute(items[key].disabled, {}, false), true);
        assert.equal(execute(items[key].disabled, {}, true), false);
    }
});

test('discovery requests use the unsaved control port without leaking unrelated configuration', () => {
    for (const port of [905, 1234, '905', undefined, 'bad"\\${notCode}`\nvalue']) {
        const data = { ...io.native, port, host: 'original.example', macLan: '00:11:22:33:44:55', _discoveredTv: '192.168.1.2' };
        for (const item of [items._discoveredTv, items._tvDiscoveryReload]) {
            const payload = JSON.parse(vm.runInNewContext(`\`${item.jsonData}\``, { data }));
            assert.deepEqual(payload, port === undefined ? {} : { port });
        }
    }
});

test('two discovered televisions can be chosen independently and only change the unsaved host', () => {
    const initial = { ...io.native, host: 'original.example', channelListView: 'favourites', pollInterval: 17, _discoveredTv: '' };
    const first = form(initial);
    const second = form(initial);
    first.change('_discoveredTv', '192.168.178.35');
    second.change('_discoveredTv', '192.168.178.36');
    assert.equal(first.data.host, '192.168.178.35');
    assert.equal(second.data.host, '192.168.178.36');
    assert.equal(first.data._discoveredTv, '192.168.178.35');
    assert.equal(second.data._discoveredTv, '192.168.178.36');
    for (const current of [first, second]) {
        assert.equal(execute(items.host.validator, current.data), true, 'A selected address must permit saving');
        assert.equal(current.data.channelListView, 'favourites');
        assert.equal(current.data.pollInterval, 17);
        assert.deepEqual(current.persisted, initial, 'Choosing a suggestion must not write the running instance configuration');
    }
});

test('manual host editing remains available while online or offline and allows selecting the same TV again', () => {
    assert.equal(items.host.type, 'text', 'Admin 7 selectSendTo.manual is editable only offline');
    assert.equal(items.host.disabled, undefined);
    assert.equal(items.host.hidden, undefined);
    const current = form({ ...io.native, host: 'original.example', _discoveredTv: '' });
    current.change('_discoveredTv', '192.168.178.35');
    current.change('host', 'living-room.example');
    assert.equal(current.data.host, 'living-room.example');
    assert.equal(current.data._discoveredTv, '', 'Clear the previous suggestion when the address is manually changed');
    assert.equal(execute(items.host.validator, current.data, false), true);
    current.change('_discoveredTv', '192.168.178.35');
    assert.equal(current.data.host, '192.168.178.35');
    assert.equal(current.data._discoveredTv, '192.168.178.35');
});

test('search completion, an empty result and port changes preserve the current host', () => {
    const current = form({ ...io.native, host: '192.168.178.35', _discoveredTv: '192.168.178.35' });
    current.nativeResponse({ _tvDiscoveryReload: 'scan-1', _discoveredTv: '' });
    assert.equal(current.data.host, '192.168.178.35');
    current.change('host', 'manually-entered.example');
    current.change('port', 1234);
    current.nativeResponse({ _discoveredTv: '', _tvDiscoveryReload: 'scan-2-empty' });
    assert.equal(current.data.host, 'manually-entered.example');
    assert.equal(current.data.port, 1234);
    assert.equal(current.data._discoveredTv, '');
    assert.equal(current.data._tvDiscoveryReload, 'scan-2-empty');
});

test('a failed completed search uses a result message so Admin also refreshes stale suggestions', () => {
    // ConfigSendto processes response.error in an exclusive branch. It only
    // applies response.native in the other branch, after showing a result.
    // Sending {error, native} would leave the previous dropdown contents and
    // selection visible even though the backend has discarded that result.
    // https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigSendto.tsx
    const applyResponse = (current, response, language) => {
        const translations = JSON.parse(fs.readFileSync(path.join(root, `admin/i18n/${language}/translations.json`), 'utf8'));
        const kind = response.error ? 'error' : 'result';
        const key = response.error || response.result;
        const textKey = items._tvDiscoveryReload[kind][key];
        assert.ok(textKey, `${kind} response ${key} needs a message`);
        let message = translations[textKey];
        for (const arg of response.args || []) message = message.replace('%s', arg);
        if (!response.error && response.native && items._tvDiscoveryReload.useNative) {
            current.nativeResponse(response.native);
        }
        return message;
    };
    for (const language of ['de', 'en']) {
        const current = form({ ...io.native, host: 'manual.example', _discoveredTv: '192.168.178.35', _tvDiscoveryReload: 1 });
        const native = { _tvDiscoveryReload: 2, _discoveredTv: '' };
        applyResponse(current, { error: 'discoveryFailed', args: ['socket failure'], native }, language);
        assert.equal(current.data._tvDiscoveryReload, 1, 'Admin ignores native in an error response');
        assert.equal(current.data._discoveredTv, '192.168.178.35');
        const message = applyResponse(current, { result: 'discoveryFailed', args: ['socket failure'], native }, language);
        assert.match(message, /socket failure/u);
        assert.doesNotMatch(message, /%s/u);
        assert.equal(current.data._tvDiscoveryReload, 2);
        assert.equal(current.data._discoveredTv, '');
        assert.equal(current.data.host, 'manual.example');
        for (const result of ['discoveryComplete', 'discoveryPartial']) {
            const text = applyResponse(current, { result, args: [2], native: {} }, language);
            assert.match(text, /2/u);
            assert.doesNotMatch(text, /%s/u);
        }
    }
});

test('placeholder and malformed discovery values never overwrite a manually entered host', () => {
    for (const value of ['', null, undefined, 123, {}, 'TV name', '999.168.178.35', '192.168.1', 'http://192.168.1.2', '192.168.1.2:905', '192.168.1.2\n']) {
        const current = form({ ...io.native, host: 'manual.example', _discoveredTv: '' });
        current.change('_discoveredTv', value);
        assert.equal(current.data.host, 'manual.example', `Invalid suggestion: ${JSON.stringify(value)}`);
    }
});

test('discovery guidance and all result/error messages have German and English translations', () => {
    const keys = [
        items._tvDiscoveryHelp.text,
        items._tvDiscoveryNetworkHelp.text,
        items._discoveredTv.label,
        items._tvDiscoveryReload.label,
        ...Object.values(items._tvDiscoveryReload.result),
        ...Object.values(items._tvDiscoveryReload.error),
    ];
    for (const language of ['de', 'en']) {
        const translations = JSON.parse(fs.readFileSync(path.join(root, `admin/i18n/${language}/translations.json`), 'utf8'));
        for (const key of keys) assert.ok(translations[key], `${language} translation missing: ${key}`);
    }
    assert.match(items._tvDiscoveryHelp.text, /start the instance before entering a TV address/iu);
    assert.match(items._tvDiscoveryNetworkHelp.text, /Quick Start/u);
    assert.match(items._tvDiscoveryNetworkHelp.text, /not a guarantee/iu);
});
