'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { KEYS, TABLET_ACTIONS, buildEnvelope } = require('../lib/loewe-client');
const { createDefinitions } = require('../lib/states');
const { normalizeConfig, validateParameters } = require('../lib/adapter-runtime');

const root = path.resolve(__dirname, '..');
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const pkg = readJson('package.json');
const io = readJson('io-package.json');
const admin = readJson('admin/jsonConfig.json');
const catalog = readJson('docs/protocol-templates.json');
const remote115 = readJson('docs/remote115-keys.json');

assert.equal(pkg.name, `iobroker.${io.common.name}`);
assert.equal(pkg.version, io.common.version);
assert.equal(io.common.mode, 'daemon');
assert.equal(io.common.connectionType, 'local');
assert.equal(io.common.adminUI.config, 'json');
assert.equal(io.common.platform, 'Javascript/Node.js');
assert.equal(io.common.compact, false, 'This adapter must run outside a shared compact process');
assert.ok(fs.existsSync(path.join(root, pkg.main)));
assert.ok(fs.existsSync(path.join(root, 'admin', io.common.icon)));
assert.equal(admin.i18n, true);

const configFields = new Set();
const translationKeys = new Set();
function visit(items) {
    for (const [key, item] of Object.entries(items || {})) {
        if (!key.startsWith('_')) configFields.add(key);
        for (const name of ['label', 'help', 'text', 'validatorErrorText']) {
            if (typeof item[name] === 'string') translationKeys.add(item[name]);
        }
        visit(item.items);
    }
}
visit(admin.items);
assert.deepEqual([...configFields].sort(), Object.keys(io.native).sort(), 'Admin fields must match native defaults');
for (const language of ['de', 'en']) {
    const translations = readJson(`admin/i18n/${language}/translations.json`);
    for (const key of translationKeys) assert.ok(translations[key], `${language} translation missing: ${key}`);
}

const config = normalizeConfig({ ...io.native, host: 'fixture.invalid' });
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
    assert.equal([...ids].filter(id => /^remote\.[^.]+$/.test(id)).length, 41);
    assert.equal([...ids].filter(id => /^api\.[^.]+\.send$/.test(id)).length, advanced ? 33 : 0);
    console.log(`Object definitions valid: ${objects.length} objects (${advanced ? 'advanced enabled' : 'standard'}).`);
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
    validateParameters(action, parameters, 99);
}
assert.deepEqual([...actions].sort(), [...TABLET_ACTIONS].sort());
const sourceKeys = catalog.remote_keymap.map(key => `${key.alphabet}:${key.sent_code}`).sort();
const clientKeys = Object.entries(KEYS).filter(([name]) => !/^digit_\d$/.test(name) && !['epg_alt', 'power_on'].includes(name))
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
assert.ok(!Object.values(KEYS).some(key => [1337, 1338].includes(key.value)), 'Local app UI actions are not TV keys');
console.log(`APK contract valid: ${catalog.templates.length} exact XML templates, ${actions.size} actions, 29 original and 11 additional APK key mappings; dedicated TV_ON verified against Remote API 1.0.47, section 9.4.3.`);

// Check syntax without importing adapter-core or starting an ioBroker process.
for (const directory of ['', 'lib', 'scripts', 'test']) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const file = path.join(root, directory, entry.name);
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || `JavaScript syntax error: ${file}`);
    }
}
console.log('Package metadata, Admin translations and JavaScript syntax valid.');
