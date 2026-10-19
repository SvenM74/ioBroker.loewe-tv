'use strict';

// Offline routing regression for the accompanying proposed ioBroker.admin patch.
// The official source is supplied by the caller and never changed on disk.
// Upstream code/patch license: LICENSE.ioBroker.admin in this directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const ORIGINAL_GUARD = 'if (instanceObj?.common.webExtension && native.webInstance) {';
const PROPOSED_GUARD = [
    '// Relative Admin assets belong to the Admin origin that opened this page.',
    '        // Preserve that origin and its proxy/Cloud prefix; only replace placeholders below.',
    '        const isAdminAssetLink = /^(?:\\.\\/)?adapter\\/[a-z0-9_-]+\\//i.test(link);',
    '        if (instanceObj?.common.webExtension && native.webInstance && !isAdminAssetLink) {',
].join('\n');

function proposedSource(source) {
    if (!source.includes('function getWebExtensionLinks')) return source; // Admin 7 control
    if (source.split(ORIGINAL_GUARD).length !== 2) {
        throw new Error('Expected one unmodified Web-extension guard. Use an unpatched official source.');
    }
    return source.replace(ORIGINAL_GUARD, PROPOSED_GUARD);
}

function loadSource(source, filename) {
    if (typeof stripTypeScriptTypes !== 'function') {
        throw new Error('This offline diagnostic needs Node.js with node:module.stripTypeScriptTypes.');
    }
    const js = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/^export\s+/gm, '');
    const context = { module: { exports: {} }, console, URL };
    vm.runInNewContext(`${js}\nmodule.exports = { replaceLink, applyReverseProxyToLink,\n` +
        'applyRemoteAccessToLink: typeof applyRemoteAccessToLink === "function" ? applyRemoteAccessToLink : null };',
    context, { filename, timeout: 1000 });
    return context.module.exports;
}

function fixture(base, bind, webSecure) {
    const hostname = new URL(base).hostname;
    const instances = {};
    for (const number of [0, 1]) {
        instances[`system.adapter.loewe-tv.${number}`] = {
            _id: `system.adapter.loewe-tv.${number}`, type: 'instance',
            common: { name: 'loewe-tv', host: 'broker', enabled: true, webExtension: 'lib/web-extension.js' },
            native: { host: `192.0.2.${24 + number}`, port: 905, webInstance: 'web.1' },
        };
    }
    instances['system.adapter.admin.0'] = { _id: 'system.adapter.admin.0',
        common: { name: 'admin', enabled: true, host: 'broker' },
        native: { bind: '0.0.0.0', port: 8081, secure: new URL(base).protocol === 'https:' } };
    instances['system.adapter.web.0'] = { _id: 'system.adapter.web.0',
        common: { name: 'web', enabled: true, host: 'broker' },
        native: { bind: '0.0.0.0', port: 8082, secure: webSecure } };
    instances['system.adapter.web.1'] = { _id: 'system.adapter.web.1',
        common: { name: 'web', enabled: true, host: 'broker' },
        native: { bind, port: 8083, secure: webSecure } };
    return { instances, hostname, adminInstance: 'admin.0', hosts: {} };
}

function browserTarget(api, template, instance, context, base) {
    const links = api.replaceLink(template, 'loewe-tv', instance, context);
    assert.equal(links.length, 1);
    let link = links[0].url;
    if (new URL(base).hostname === 'iobroker.pro' && api.applyRemoteAccessToLink) {
        link = api.applyRemoteAccessToLink(link, links[0].port,
            { origin: 'https://iobroker.pro', webPort: 8083, adminPort: 8081 });
    } else if (new URL(base).pathname.startsWith('/proxy/')) {
        link = api.applyReverseProxyToLink(link, `loewe-tv.${instance}`, context.instances, {
            globalPath: '/proxy/',
            paths: [{ instance: 'admin.0', path: '/proxy/admin/' }, { instance: 'web.1', path: '/proxy/web/' }],
        });
    }
    assert.equal(typeof link, 'string');
    return new URL(link, base).href;
}

function verify(filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const before = loadSource(source, filename);
    const after = loadSource(proposedSource(source), `${filename} (proposed in memory)`);
    const io = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'io-package.json'), 'utf8'));
    const template = io.common.localLinks._default;
    assert.equal(typeof template, 'string', 'Keep the string that prevents duplicate old Web cards');
    assert.equal(template, 'adapter/loewe-tv/epg.html?instance=%instance%');

    let checked = 0;
    let baselineDifferences = 0;
    for (const base of ['http://broker.example:8081/index.html', 'https://broker.example:8443/index.html',
        'https://broker.example/proxy/admin/index.html', 'https://iobroker.pro/admin/index.html']) {
        for (const bind of ['127.0.0.1', 'localhost', '0.0.0.0']) {
            for (const webSecure of [false, true]) {
                const context = fixture(base, bind, webSecure);
                for (const relative of [template, `./${template}`]) {
                    const targets = new Set();
                    for (const instance of [0, 1]) {
                        const expected = new URL(relative.replace('%instance%', String(instance)), base).href;
                        const actual = browserTarget(after, relative, instance, context, base);
                        assert.equal(actual, expected, `${bind}, web HTTPS=${webSecure}, TV ${instance}`);
                        assert.equal(new URL(actual).searchParams.get('instance'), String(instance));
                        assert.equal(new URL(actual).origin, new URL(base).origin);
                        targets.add(actual);
                        if (browserTarget(before, relative, instance, context, base) !== expected) baselineDifferences++;
                        checked++;
                    }
                    assert.equal(targets.size, 2, 'The two TVs must never collapse to one target');
                }
                // Ordinary Web-extension and external-service links retain upstream behavior.
                for (const control of ['loewe-tv.%instance%/epg.html',
                    '%web_protocol%://%ip%:%web_port%/loewe-tv.%instance%/epg.html',
                    'https://docs.example.invalid/loewe-tv/']) {
                    assert.equal(JSON.stringify(after.replaceLink(control, 'loewe-tv', 1, context)),
                        JSON.stringify(before.replaceLink(control, 'loewe-tv', 1, context)));
                }
                for (const instance of [0, 1]) context.instances[`system.adapter.loewe-tv.${instance}`].native.webInstance = '';
                assert.equal(JSON.stringify(after.replaceLink(template, 'loewe-tv', 1, context)),
                    JSON.stringify(before.replaceLink(template, 'loewe-tv', 1, context)));
            }
        }
    }
    return { source: path.basename(filename), adminTargetsChecked: checked,
        baselineTargetsDifferingFromAdmin: baselineDifferences, proposedTargetsCorrect: checked,
        webAndExternalLinkControls: 'unchanged', liveChanges: 0 };
}

if (require.main === module) {
    try {
        if (process.argv.length < 3) throw new Error('Usage: node repro-admin-links.cjs /path/to/official/utils.ts [...]');
        for (const filename of process.argv.slice(2)) console.log(JSON.stringify(verify(path.resolve(filename)), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { proposedSource, verify };
