'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { KEYS, TABLET_ACTIONS, buildEnvelope } = require('../lib/loewe-client');
const { createDefinitions } = require('../lib/states');
const { normalizeConfig } = require('../lib/adapter-runtime');
const { BUILD_ID } = require('../lib/build-info');

const root = path.resolve(__dirname, '..');
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const pkg = readJson('package.json');
const io = readJson('io-package.json');
const admin = readJson('admin/jsonConfig.json');
const catalog = readJson('docs/protocol-templates.json');
const remote115 = readJson('docs/remote115-keys.json');

assert.equal(pkg.name, `iobroker.${io.common.name}`);
assert.equal(pkg.version, '0.1.16');
assert.equal(pkg.version, io.common.version);
assert.ok(BUILD_ID.startsWith(`${pkg.version}-`), 'Build identifier must match package version');
assert.equal(BUILD_ID, '0.1.16-web-links.1');
assert.ok(!pkg.keywords.includes('xmltv'), 'Package keywords must describe the supported TV-only EPG');
assert.equal(io.common.mode, 'daemon');
assert.equal(io.common.messagebox, true, 'Admin list selection requires adapter messaging');
assert.equal(io.common.connectionType, 'local');
assert.equal(io.common.adminUI.config, 'json');
assert.equal(io.common.platform, 'Javascript/Node.js');
assert.equal(io.common.compact, false, 'This adapter must run outside a shared compact process');
assert.ok(fs.existsSync(path.join(root, pkg.main)));
assert.ok(fs.existsSync(path.join(root, 'admin', io.common.icon)));
assert.equal(admin.i18n, true);
assert.equal(io.common.globalDependencies.find(dependency => dependency.admin)?.admin, '>=7.7.28',
    'The embedded programme guide needs native iframeSendTo support');
assert.equal(admin.items._programmeGuide.items._epgGuide.type, 'iframeSendTo');
for (const asset of ['epg.html', 'epg.css', 'epg.js', 'epg-bridge.js']) {
    assert.ok(fs.statSync(path.join(root, 'admin', asset)).isFile(), `Missing programme guide asset: ${asset}`);
}

const configFields = new Set();
const translationKeys = new Set();
function visit(items, nativeFields = true) {
    for (const [key, item] of Object.entries(items || {})) {
        if (nativeFields && !key.startsWith('_')) configFields.add(key);
        for (const name of ['label', 'title', 'help', 'text', 'validatorErrorText']) {
            if (typeof item[name] === 'string') translationKeys.add(item[name]);
        }
        for (const option of Array.isArray(item.options) ? item.options : []) {
            if (typeof option.label === 'string') translationKeys.add(option.label);
        }
        if (item.type === 'table') {
            // Admin 7 table items are row columns, each identified by attr.
            // They need translations but are not separate native settings.
            assert.ok(Array.isArray(item.items), `Table columns must be an array: ${key}`);
            const attrs = item.items.map(column => column.attr);
            assert.ok(attrs.every(attr => typeof attr === 'string' && attr), `Missing table column attr: ${key}`);
            assert.equal(new Set(attrs).size, attrs.length, `Duplicate table column attr: ${key}`);
            visit(item.items, false);
        } else {
            visit(item.items, nativeFields);
        }
    }
}
visit(admin.items);
assert.deepEqual([...configFields].sort(), Object.keys(io.native).sort(), 'Admin fields must match native defaults');
for (const language of ['de', 'en']) {
    const translations = readJson(`admin/i18n/${language}/translations.json`);
    for (const key of translationKeys) assert.ok(translations[key], `${language} translation missing: ${key}`);
}

const config = normalizeConfig({
    ...io.native, host: 'fixture.invalid',
    epgSource: 'xmltv', epgXmltvUrl: 'not a guide URL', epgXmltvMappings: [{}],
});
for (const key of ['epgEnabled', 'epgRefreshInterval']) {
    assert.deepEqual(config[key], io.native[key], `Runtime must preserve the EPG default: ${key}`);
}
for (const key of ['epgSource', 'epgXmltvUrl', 'epgXmltvMappings']) {
    assert.ok(!configFields.has(key), `Removed EPG setting must not appear in Admin: ${key}`);
    assert.ok(!Object.hasOwn(io.native, key), `Removed EPG setting must not have a native default: ${key}`);
    assert.ok(!Object.hasOwn(config, key), `Runtime must ignore obsolete EPG settings: ${key}`);
}
const retiredStaticStates = [
    'info.lastResponse', 'status.volumeRaw',
    'channels.start', 'channels.listStart', 'channels.count',
    'channels.getLists', 'channels.getChannels', 'channels.lists', 'channels.items',
    'channels.entries', 'channels.totalNumber', 'channels.returnedNumber',
    'channels.nextStart', 'channels.nextListStart', 'channels.lastUpdate',
    'channels.lastError', 'channels.availableLists',
];
for (const advanced of [false, true]) {
    const objects = createDefinitions({ ...config, enableAdvanced: advanced });
    const ids = new Set();
    for (const object of objects) {
        assert.ok(!ids.has(object.id), `Duplicate object: ${object.id}`);
        ids.add(object.id);
        if (object.id.includes('.')) assert.ok(ids.has(object.id.slice(0, object.id.lastIndexOf('.'))), `Missing parent: ${object.id}`);
        if (object.type === 'state') {
            assert.ok(['boolean', 'number', 'string'].includes(object.common.type));
            assert.equal(typeof object.common.read, 'boolean');
            assert.equal(typeof object.common.write, 'boolean');
            if (object.common.role === 'button') {
                assert.equal(object.common.type, 'boolean');
                assert.equal(object.common.read, false);
                assert.equal(object.common.write, true);
                assert.equal(object.common.def, false);
            }
        }
    }
    assert.equal([...ids].filter(id => /^remote\.[^.]+$/.test(id)).length, 42);
    assert.equal(objects.length, 92);
    for (const id of retiredStaticStates) {
        assert.ok(!ids.has(id), `Retired static data point must not be recreated: ${id}`);
    }
    assert.ok(![...ids].some(id => /^(?:api|media|channels\.radio)(?:\.|$)/.test(id)));
    assert.ok(ids.has('info.adapterBuild'));
    const journal = objects.find(object => object.id === 'recordings.jobs');
    assert.equal(journal?.common.write, false, 'Recording journal must be read-only');
    assert.equal(journal?.common.type, 'string');
    assert.deepEqual(JSON.parse(journal.common.def).jobs, []);
    assert.equal(objects.find(object => object.id === 'channels.view').common.write, false);
    assert.equal(objects.find(object => object.id === 'channels.epgRefresh')?.common.role, 'button');
    for (const id of ['channels.epgStatus', 'channels.epgLastUpdate', 'channels.epgLastError', 'channels.epgProgress']) {
        assert.equal(objects.find(object => object.id === id)?.common.write, false, `Missing read-only EPG state: ${id}`);
    }
    assert.ok(!ids.has('channels.mediaType'));
    assert.ok(!ids.has('remote.radio_mode_on'));
    console.log(`Object definitions valid: ${objects.length} objects (${advanced ? 'legacy advanced setting ignored' : 'standard'}).`);
}

// Independent oracle: compare all original APK XML envelopes, including both
// DR+ archive variants, against the production XML builder.
const actions = new Set();
for (const template of catalog.templates) {
    const action = template.action;
    actions.add(action);
    let expected = template.exact_xml_template;
    if (action === 'AddServicesFavoriteList') expected = expected.replace('</AddServicesFavoriteList>', '</ns1:AddServicesFavoriteList>');
    expected = expected.replace('<fcid>%s</fcid>', '<fcid></fcid>')
        .replace('<ClientId>%s</ClientId>', '<ClientId>fixture-session</ClientId>')
        .replace(/%s/g, '1');
    const inner = expected.match(new RegExp(`<ns1:${action}(?:\\s[^>]*)?>([\\s\\S]*)</ns1:${action}>`));
    assert.ok(inner, `No body for ${action}`);
    const parameters = action === 'RequestAccess' ? '' : inner[1]
        .replace('<fcid></fcid>', '').replace('<ClientId>fixture-session</ClientId>', '');
    assert.equal(buildEnvelope(action, parameters, 'fixture-session'), expected, `APK template mismatch: ${action}`);
}
assert.deepEqual([...actions].sort(), [...TABLET_ACTIONS].sort());
const sourceKeys = catalog.remote_keymap.map(key => `${key.alphabet}:${key.sent_code}`).sort();
const clientKeys = Object.entries(KEYS).filter(([name]) => !/^digit_\d$/.test(name)
    && !['epg_alt', 'power_on', 'tv_mode_on'].includes(name))
    .map(([, key]) => `${key.alphabet}:${key.value}`).sort();
assert.deepEqual(clientKeys, sourceKeys, 'Original remote keys differ from Loewe App extraction');
for (let digit = 0; digit <= 9; digit++) {
    const evidence = remote115.keys.find(key => key.label === String(digit) && key.sends_remote_command);
    assert.ok(evidence, `Missing second APK evidence for digit ${digit}`);
    assert.deepEqual(KEYS[`digit_${digit}`], { alphabet: evidence.alphabet, value: evidence.value });
}
const epg = remote115.keys.find(key => key.value === 78 && key.sends_remote_command);
assert.ok(epg);
assert.deepEqual(KEYS.epg_alt, { alphabet: epg.alphabet, value: epg.value });
// Loewe Remote API 1.0.47, section 9.4.3 documents l2700 key 22 as TV_ON.
// This additional official API mapping is not part of the original APK oracle.
assert.deepEqual(KEYS.power_on, { alphabet: 'l2700', value: 22 });
// Remote API 1.0.47, 9.4.1.1 documents the discrete mode keys.
assert.equal(KEYS.radio_mode_on, undefined);
assert.deepEqual(KEYS.tv_mode_on, { alphabet: 'l2700', value: 72 });
assert.ok(!Object.values(KEYS).some(key => [1337, 1338].includes(key.value)), 'Local app UI actions are not TV keys');
console.log(`APK contract valid: ${catalog.templates.length} exact XML templates, ${actions.size} actions, 29 original and 11 additional APK key mappings; TV_ON and TV_MODE_ON verified against Remote API 1.0.47, sections 9.4.3 and 9.4.1.1.`);

// Check syntax without importing adapter-core or starting an ioBroker process.
for (const directory of ['', 'lib', 'admin', 'scripts', 'test']) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const file = path.join(root, directory, entry.name);
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || `JavaScript syntax error: ${file}`);
    }
}
console.log('Package metadata, Admin translations and JavaScript syntax valid.');
