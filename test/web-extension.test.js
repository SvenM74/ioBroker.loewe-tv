'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EpgWebExtension = require('../lib/web-extension');

function web(options = {}) {
    const handlers = [];
    const app = { use(handler) { handlers.push(handler); } };
    const adapter = { namespace: options.webInstance || 'web.2', config: { socketio: options.socketio },
        sendTo() { assert.fail('Serving the guide must not send an adapter message.'); },
        setForeignState() { assert.fail('Serving the guide must not change ioBroker states.'); } };
    const instance = { _id: options.id || 'system.adapter.loewe-tv.3', common: { enabled: options.enabled !== false },
        native: { webInstance: options.selected === undefined ? 'web.2' : options.selected } };
    const extension = new (options.Extension || EpgWebExtension)(null,
        { auth: options.auth === true, language: options.language || 'de' }, adapter, instance, app);
    return { extension, handlers, adapter, instance,
        request(url, overrides = {}) {
            const req = { url, method: 'GET', ...overrides };
            const res = { headers: {}, code: null, body: undefined, next: false,
                setHeader(name, value) { this.headers[name] = value; },
                status(code) { this.code = code; return this; },
                send(body) { this.body = body; return this; },
                end() { this.ended = true; return this; },
                redirect(code, location) { this.code = code; this.headers.Location = location; return this; } };
            let index = 0;
            function next() {
                if (index >= handlers.length) { res.next = true; return; }
                handlers[index++](req, res, next);
            }
            next();
            return res;
        },
    };
}

test('web extension only activates for the enabled TV and explicitly selected web instance', () => {
    for (const options of [
        { selected: '' }, { selected: '*' }, { selected: 'web.1' }, { selected: 'system.adapter.web.2' },
        { enabled: false }, { id: 'system.adapter.other.3' }, { id: 'system.adapter.loewe-tv.03' },
        { webInstance: 'admin.2', selected: 'admin.2' },
    ]) {
        const service = web(options);
        assert.equal(service.handlers.length, 0);
        assert.equal(service.extension.welcomePage(), null);
        assert.equal(service.request('/loewe-tv.3/epg.html').next, true);
    }
    const service = web();
    assert.equal(service.handlers.length, 1);
    assert.equal(service.request('/loewe-tv.0/epg.html').next, true);
    assert.equal(service.request('/loewe-tv.30/epg.html').next, true);
});

test('selected web instance serves the existing Admin assets without a second UI copy', () => {
    const service = web();
    for (const file of ['epg.html', 'epg.css', 'epg.js', 'epg-bridge.js', 'epg-remote.js', 'loewe-tv.png']) {
        const response = service.request(`/loewe-tv.3/${file}`);
        assert.equal(response.code, 200, file);
        assert.equal(response.next, false);
        assert.deepEqual(response.body, fs.readFileSync(path.join(__dirname, '..', 'admin', file)));
        assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
        assert.equal(response.headers['Cache-Control'], 'no-cache');
    }
    const head = service.request('/loewe-tv.3/epg.html', { method: 'HEAD' });
    assert.equal(head.code, 200);
    assert.equal(head.body, undefined);
    assert.equal(head.ended, true);
});

test('web welcome-page entries keep the TV and assets on local, proxied and Cloud origins', () => {
    for (const language of ['de', 'en']) {
        for (const instance of [0, 3]) {
            const service = web({ language, id: `system.adapter.loewe-tv.${instance}` });
            const entry = service.extension.welcomePage();
            const prefix = `/loewe-tv.${instance}/`;
            assert.equal(entry.link, `loewe-tv.${instance}/epg.html`);
            assert.equal(entry.localLink, entry.link, 'Older web welcome pages read localLink directly.');
            assert.equal(entry.id, `system.adapter.loewe-tv.${instance}`);
            assert.equal(entry.instance, instance);
            assert.match(entry.name, language === 'de' ? /Programmübersicht/ : /Programme guide/);
            assert.ok(entry.name.endsWith(` (${instance})`));
            assert.equal(entry.img, `loewe-tv.${instance}/loewe-tv.png`);
            assert.equal(entry.pro, false, 'Older web pages hide pro-only cards on iobroker.net.');
            assert.equal(new URL(entry.link, 'https://broker/proxy/web/').href,
                `https://broker/proxy/web${prefix}epg.html`);

            for (const origin of ['https://iobroker.net', 'https://iobroker.pro']) {
                for (const link of [entry.link, entry.localLink, entry.img]) {
                    const url = new URL(link, `${origin}/`);
                    assert.equal(url.origin, origin, 'Cloud links must not contain a LAN host or port.');
                    assert.ok(url.pathname.startsWith(prefix), url.href);
                    assert.doesNotMatch(url.pathname, /\/adapter\//, 'Cloud routes adapter paths to Admin.');
                    assert.equal(service.request(url.pathname).code, 200, url.href);
                }
                const page = new URL(entry.link, `${origin}/`);
                const html = service.request(page.pathname).body.toString('utf8');
                const assets = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
                assert.ok(assets.length > 0, 'Check the asset references actually served in the guide.');
                assets.push('logos/das-erste.svg');
                for (const asset of assets) {
                    const url = new URL(asset, page);
                    assert.equal(url.origin, origin);
                    assert.ok(url.pathname.startsWith(prefix), url.href);
                    assert.doesNotMatch(url.pathname, /\/adapter\//);
                    assert.equal(service.request(url.pathname).code, 200, url.href);
                }
            }
        }
    }
});

test('older web localLinks import leaves exactly one working extension route per TV', () => {
    const io = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'io-package.json'), 'utf8'));
    const services = [0, 1].map(instance => web({ id: `system.adapter.loewe-tv.${instance}` }));
    const extensionLinks = services.map(service => service.extension.welcomePage().link);

    // Model only the official older web import contract: object localLinks are
    // expanded per instance; strings are skipped; welcomePage() is added. The
    // extension entries and routes below are real, but this is no live Cloud test.
    // https://github.com/ioBroker/ioBroker.web/blob/v9.0.0/src/main.ts#L198-L235
    // https://github.com/ioBroker/ioBroker.web/blob/v9.0.0/src/main.ts#L824-L850
    // https://github.com/ioBroker/ioBroker.web/blob/v9.0.0/src/main.ts#L946-L955
    function collectLinks(localLinks) {
        const imported = Object.values(localLinks)
            .filter(link => typeof link === 'object')
            .flatMap(link => services.map(service => link.link.replace('%instance%', service.extension.instance)));
        return [...imported, ...extensionLinks];
    }

    const oldObjectForm = { _default: { link: 'adapter/loewe-tv/epg.html?instance=%instance%' } };
    assert.deepEqual(collectLinks(oldObjectForm), [
        'adapter/loewe-tv/epg.html?instance=0', 'adapter/loewe-tv/epg.html?instance=1',
        'loewe-tv.0/epg.html', 'loewe-tv.1/epg.html',
    ], 'The former object metadata imports the two unwanted Admin-path cards.');

    const links = collectLinks(io.common.localLinks);
    assert.deepEqual(links, ['loewe-tv.0/epg.html', 'loewe-tv.1/epg.html']);
    for (const [index, link] of links.entries()) {
        const pathname = new URL(link, 'https://iobroker.pro/').pathname;
        assert.equal(services[index].request(pathname).code, 200);
        assert.equal(services[1 - index].request(pathname).next, true, 'The other TV must not serve this route.');
    }
});

test('Admin extension links redirect to the matching TV and retain the reverse-proxy prefix', () => {
    const service = web();
    const response = service.request('/adapter/loewe-tv/epg.html?instance=3');
    assert.equal(response.code, 302);
    assert.equal(new URL(response.headers.Location, 'https://broker/proxy/web/adapter/loewe-tv/epg.html?instance=3').href,
        'https://broker/proxy/web/loewe-tv.3/epg.html');
    for (const query of ['', '?instance=0', '?instance=3&instance=3', '?instance=03']) {
        assert.equal(service.request(`/adapter/loewe-tv/epg.html${query}`).next, true);
    }
    for (const url of ['/loewe-tv.3', '/loewe-tv.3/']) {
        const redirect = service.request(url);
        assert.equal(redirect.code, 302);
        assert.equal(new URL(redirect.headers.Location, `https://broker/proxy/web${url}`).href,
            'https://broker/proxy/web/loewe-tv.3/epg.html');
    }
});

test('authenticated web hosts do not release pages or redirects without their established login', () => {
    const service = web({ auth: true });
    for (const url of ['/loewe-tv.3/epg.html', '/loewe-tv.3/epg.js', '/loewe-tv.3/epg-remote.js',
        '/adapter/loewe-tv/epg.html?instance=3']) {
        assert.equal(service.request(url).code, 401);
        assert.equal(service.request(url, { isAuthenticated: () => false, user: 'admin' }).code, 401,
            'An explicit failed login is not replaced by a stale user property.');
        assert.equal(service.request(url, { isAuthenticated: () => true }).code, url.includes('/adapter/') ? 302 : 200);
        assert.equal(service.request(url, { user: 'admin' }).code, url.includes('/adapter/') ? 302 : 200,
            'The web host supports an established user when no Passport method exists.');
    }
    assert.equal(web({ auth: false }).request('/loewe-tv.3/epg.html').code, 200,
        'The web host configuration decides whether login is required; no separate login is created.');
});

test('web guide refuses external or disabled sockets instead of connecting with a different session', () => {
    for (const socketio of ['none', 'system.adapter.socketio.0', 'system.adapter.ws.1', ':8084', null, false]) {
        const response = web({ socketio }).request('/loewe-tv.3/epg.html');
        assert.equal(response.code, 503);
        assert.match(response.body, /web\.2.*integrierte Socket-Verbindung/);
    }
    assert.equal(web({ socketio: '' }).request('/loewe-tv.3/epg.html').code, 200);
    assert.equal(web().request('/loewe-tv.3/epg.html').code, 200);
});

test('web route cannot select a different instance, write data or expose arbitrary package files', () => {
    const service = web();
    for (const suffix of ['epg.html?instance=0', 'epg.html?instance=3&instance=3']) {
        assert.equal(service.request(`/loewe-tv.3/${suffix}`).code, 400);
    }
    assert.equal(service.request('/loewe-tv.3/epg.html?instance=3').code, 200);
    for (const file of ['../package.json', '%2e%2e/package.json', 'logos/../../main.js', 'logos%2Fsecret.svg',
        'jsonConfig.json', 'i18n/de/translations.json', 'main.js', 'package.json', 'epg.html/extra']) {
        assert.equal(service.request(`/loewe-tv.3/${file}`).code, 404, file);
    }
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
        const response = service.request('/loewe-tv.3/epg.html', { method });
        assert.equal(response.code, 405);
        assert.equal(response.headers.Allow, 'GET, HEAD');
    }
});

test('only installed regular SVG logos with safe names are exposed under the web route', () => {
    const read = [];
    const content = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const fakeFs = {
        readdirSync() { return [
            { name: 'station-hd.svg', isFile: () => true },
            { name: 'linked.svg', isFile: () => false },
            { name: '../secret.svg', isFile: () => true },
            { name: 'script.js', isFile: () => true },
        ]; },
        lstatSync() { return { isFile: () => true, size: content.length }; },
        readFileSync(filename) { read.push(filename); return content; },
    };
    const context = { module: { exports: {} }, __dirname: path.join(__dirname, '..', 'lib'), URL,
        require(name) { return name === 'node:fs' ? fakeFs : require(name); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/web-extension.js'), 'utf8'), context);
    const service = web({ Extension: context.module.exports });
    assert.equal(service.request('/loewe-tv.3/logos/station-hd.svg').code, 200);
    assert.equal(service.request('/loewe-tv.3/logos/station-hd.svg').headers['Content-Type'], 'image/svg+xml; charset=utf-8');
    for (const file of ['linked.svg', 'missing.svg', '../secret.svg', 'script.js']) {
        assert.equal(service.request(`/loewe-tv.3/logos/${file}`).code, 404);
    }
    assert.deepEqual(read, [path.join(__dirname, '..', 'admin', 'logos', 'station-hd.svg')]);
});

test('unloading leaves the host server intact and stops serving this TV extension', () => {
    const service = web();
    assert.equal(service.request('/loewe-tv.3/epg.html').code, 200);
    service.extension.unload();
    assert.equal(service.request('/loewe-tv.3/epg.html').next, true);
    assert.equal(service.request('/adapter/loewe-tv/epg.html?instance=3').next, true);
    assert.equal(service.extension.welcomePage(), null);
});
