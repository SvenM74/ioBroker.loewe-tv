'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const EpgWebExtension = require('../lib/web-extension');
const { TV_NAMES_STATE } = require('../lib/tv-names');

function web(options = {}) {
    const handlers = options.host?.handlers || [];
    const app = options.host?.app || { use(handler) { handlers.push(handler); } };
    const adapter = options.host?.adapter || options.adapter || { namespace: options.webInstance || 'web.2', config: { socketio: options.socketio },
        sendTo() { assert.fail('Serving the guide must not send an adapter message.'); },
        setForeignState() { assert.fail('Serving the guide must not change ioBroker states.'); } };
    const instance = { _id: options.id || 'system.adapter.loewe-tv.3',
        common: { enabled: options.enabled !== false, name: options.name },
        native: { webInstance: options.selected === undefined ? 'web.2' : options.selected,
            host: options.tvHost, port: options.port } };
    const extension = new (options.Extension || EpgWebExtension)(null,
        { auth: options.auth === true, language: options.language || 'de' }, adapter, instance, app);
    return { extension, handlers, app, adapter, instance,
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
                return handlers[index++](req, res, next);
            }
            res.done = Promise.resolve(next()).then(() => res);
            return res;
        },
    };
}

const ENTRY_PATHS = ['/loewe-tv', '/loewe-tv/', '/loewe-tv/index.html', '/loewe-tv/epg.html'];

function pageLinks(response) {
    return [...String(response.body).matchAll(/\bhref=["']([^"']+)["']/g)].map(match => match[1]);
}

function tvLinks(response) {
    return pageLinks(response).filter(link => /(?:^|\/)loewe-tv\.\d+\/epg\.html$/.test(link));
}

function savedNames(devices) {
    return { val: JSON.stringify({ schemaVersion: 1, devices }), ack: true };
}

function namesAdapter(options = {}) {
    const reads = [];
    const subscriptions = [];
    const unsubscriptions = [];
    return { namespace: 'web.2', config: {}, reads, subscriptions, unsubscriptions,
        getForeignStateAsync(id) { reads.push(id); return options.read?.(id); },
        subscribeForeignStatesAsync(id) { subscriptions.push(id); return options.subscribe?.(id); },
        unsubscribeForeignStatesAsync(id) { unsubscriptions.push(id); return options.unsubscribe?.(id); },
        sendTo() { assert.fail('TV labels must not trigger TV or adapter commands.'); },
        setForeignState() { assert.fail('TV labels must not change ioBroker states.'); },
        setForeignObject() { assert.fail('TV labels must not rename or restart an adapter.'); },
    };
}

function namesClock() {
    let now = 10000;
    const timers = [];
    const context = { module: { exports: {} }, __dirname: path.join(__dirname, '..', 'lib'), URL,
        Date: class extends Date { static now() { return now; } },
        require(name) {
            if (name === 'node:timers') return {
                setTimeout(callback, delay) {
                    const timer = { callback, delay, at: now + delay, cleared: false };
                    timers.push(timer);
                    return timer;
                },
                clearTimeout(timer) { if (timer) timer.cleared = true; },
            };
            return name === './tv-names' ? require('../lib/tv-names') : require(name);
        } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/web-extension.js'), 'utf8'), context);
    return { Extension: context.module.exports, timers,
        advance(milliseconds) {
            now += milliseconds;
            for (const timer of timers) {
                if (!timer.cleared && timer.at <= now) {
                    timer.cleared = true;
                    timer.callback();
                }
            }
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
        require(name) { return name === 'node:fs' ? fakeFs
            : name === './tv-names' ? require('../lib/tv-names') : require(name); } };
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

test('generic web entry replaces the missing index with the only configured TV', () => {
    const service = web();
    for (const pathname of ENTRY_PATHS) {
        const response = service.request(pathname);
        assert.equal(response.code, 302, pathname);
        assert.equal(response.next, false, pathname);
        assert.equal(response.headers['Cache-Control'], 'no-store');
        assert.equal(new URL(response.headers.Location, `http://192.168.178.24:8083${pathname}`).href,
            'http://192.168.178.24:8083/loewe-tv.3/epg.html');
        assert.equal(response.headers.Location, pathname === '/loewe-tv'
            ? 'loewe-tv.3/epg.html' : '../loewe-tv.3/epg.html');
    }
});

test('the reported quick-access URL shows each TV instead of choosing the first registered instance', () => {
    const service = web({ id: 'system.adapter.loewe-tv.10', name: 'Arbeitszimmer' });
    web({ host: service, id: 'system.adapter.loewe-tv.1', name: 'Schlafzimmer' });
    web({ host: service, id: 'system.adapter.loewe-tv.0', name: 'Wohnzimmer' });
    const url = new URL('http://192.168.178.24:8083/loewe-tv/');
    const response = service.request(url.pathname);
    assert.equal(response.code, 200);
    assert.equal(response.headers.Location, undefined, 'A link with no TV identity requires a choice.');
    assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    assert.deepEqual(tvLinks(response), [
        '../loewe-tv.0/epg.html', '../loewe-tv.1/epg.html', '../loewe-tv.10/epg.html',
    ]);
    const html = String(response.body);
    for (const name of ['Wohnzimmer', 'Schlafzimmer', 'Arbeitszimmer', 'loewe-tv.0', 'loewe-tv.1', 'loewe-tv.10']) {
        assert.ok(html.includes(name), name);
    }
    assert.doesNotMatch(html, /<script\b|\bonclick\s*=/i, 'Choosing a TV works with ordinary links.');
});

test('all chooser aliases keep TV links and their stylesheet on the existing proxy or Cloud origin', () => {
    const service = web({ id: 'system.adapter.loewe-tv.0' });
    web({ host: service, id: 'system.adapter.loewe-tv.1' });
    for (const base of [
        'http://192.168.178.24:8083/', 'https://broker/proxy/web/', 'https://iobroker.net/', 'https://iobroker.pro/',
    ]) {
        const baseUrl = new URL(base);
        for (const pathname of ENTRY_PATHS) {
            const page = new URL(pathname.slice(1), base);
            const response = service.request(pathname);
            assert.equal(response.code, 200, page.href);
            const links = pageLinks(response);
            const expectedCss = pathname === '/loewe-tv' ? 'loewe-tv/epg-entry.css' : 'epg-entry.css';
            assert.ok(links.includes(expectedCss), page.href);
            assert.deepEqual(tvLinks(response), [0, 1].map(instance =>
                `${pathname === '/loewe-tv' ? '' : '../'}loewe-tv.${instance}/epg.html`));
            for (const instance of [0, 1]) {
                const target = new URL(tvLinks(response)[instance], page);
                assert.equal(target.href, new URL(`loewe-tv.${instance}/epg.html`, base).href);
                const route = `/${target.pathname.slice(baseUrl.pathname.length)}`;
                assert.equal(service.request(route).code, 200, target.href);
            }
            const stylesheet = new URL(expectedCss, page);
            assert.equal(stylesheet.href, new URL('loewe-tv/epg-entry.css', base).href);
            const asset = service.request(`/${stylesheet.pathname.slice(baseUrl.pathname.length)}`);
            assert.equal(asset.code, 200, stylesheet.href);
            assert.equal(asset.headers['Content-Type'], 'text/css; charset=utf-8');
            assert.deepEqual(asset.body, fs.readFileSync(path.join(__dirname, '..', 'admin', 'epg-entry.css')));
        }
    }
});

test('an explicit generic-entry instance selects the matching TV regardless of middleware order', () => {
    const service = web({ id: 'system.adapter.loewe-tv.10' });
    web({ host: service, id: 'system.adapter.loewe-tv.0' });
    for (const pathname of ENTRY_PATHS) {
        for (const instance of [0, 10]) {
            const response = service.request(`${pathname}?instance=${instance}`);
            assert.equal(response.code, 302);
            assert.equal(new URL(response.headers.Location, `https://broker/proxy/web${pathname}?instance=${instance}`).href,
                `https://broker/proxy/web/loewe-tv.${instance}/epg.html`);
        }
    }
});

test('ambiguous, invalid and unavailable generic-entry instances never select another TV', () => {
    const service = web({ id: 'system.adapter.loewe-tv.0' });
    web({ host: service, id: 'system.adapter.loewe-tv.1' });
    web({ host: service, id: 'system.adapter.loewe-tv.7', enabled: false });
    web({ host: service, id: 'system.adapter.loewe-tv.8', selected: 'web.1' });
    const invalidQueries = [
        'instance=', 'instance=01', 'instance=-1', 'instance=%2B1', 'instance=1.0', 'instance=loewe-tv.1',
        'instance=foo', 'instance=1&instance=1', 'instance=0&instance=1', 'instance=1000000000',
        'instance=%2F%2Fevil.example',
    ];
    for (const pathname of ENTRY_PATHS) {
        for (const query of invalidQueries) {
            const response = service.request(`${pathname}?${query}`);
            assert.equal(response.code, 400, `${pathname}?${query}`);
            assert.equal(response.headers.Location, undefined);
            assert.equal(response.next, false);
        }
        for (const instance of [7, 8, 42]) {
            const response = service.request(`${pathname}?instance=${instance}`);
            assert.equal(response.code, 404, `${pathname}?instance=${instance}`);
            assert.equal(response.headers.Location, undefined);
            assert.equal(response.next, false);
        }
    }
});

test('generic entries and their stylesheet require the web login before returning any details', () => {
    const service = web({ id: 'system.adapter.loewe-tv.0', auth: true, name: 'Wohnzimmer' });
    web({ host: service, id: 'system.adapter.loewe-tv.1', auth: true, name: 'Schlafzimmer' });
    for (const pathname of [...ENTRY_PATHS, '/loewe-tv/epg-entry.css']) {
        for (const overrides of [{}, { user: 'admin', isAuthenticated: () => false }, { method: 'POST' }]) {
            const response = service.request(pathname, overrides);
            assert.equal(response.code, 401, pathname);
            assert.doesNotMatch(String(response.body), /Wohnzimmer|Schlafzimmer|loewe-tv\.[01]/);
            assert.equal(response.headers.Location, undefined);
        }
        assert.equal(service.request(pathname, { isAuthenticated: () => true }).code, 200, pathname);
        assert.equal(service.request(pathname, { user: 'admin' }).code, 200, pathname);
    }
    assert.equal(service.request('/loewe-tv/?instance=0').code, 401);
    assert.equal(service.request('/loewe-tv/?instance=0&instance=1').code, 401);
    const allowed = service.request('/loewe-tv/?instance=1', { isAuthenticated: () => true });
    assert.equal(allowed.code, 302);
    assert.equal(allowed.headers.Location, '../loewe-tv.1/epg.html');
});

test('generic entries support HEAD and reject mutation methods', () => {
    const single = web();
    const multiple = web({ id: 'system.adapter.loewe-tv.0' });
    web({ host: multiple, id: 'system.adapter.loewe-tv.1' });
    for (const pathname of ENTRY_PATHS) {
        const redirect = single.request(pathname, { method: 'HEAD' });
        assert.equal(redirect.code, 302);
        assert.equal(redirect.body, undefined);
        const head = multiple.request(pathname, { method: 'HEAD' });
        assert.equal(head.code, 200);
        assert.equal(head.body, undefined);
        assert.equal(head.ended, true);
        assert.equal(head.headers['Cache-Control'], 'no-store');
    }
    for (const pathname of [...ENTRY_PATHS, '/loewe-tv/epg-entry.css']) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
            const response = multiple.request(pathname, { method });
            assert.equal(response.code, 405, `${method} ${pathname}`);
            assert.equal(response.headers.Allow, 'GET, HEAD');
            assert.equal(response.headers.Location, undefined);
        }
    }
    const stylesheet = multiple.request('/loewe-tv/epg-entry.css', { method: 'HEAD' });
    assert.equal(stylesheet.code, 200);
    assert.equal(stylesheet.body, undefined);
    assert.equal(stylesheet.ended, true);
});

test('the generic prefix exposes only the chooser and its installed stylesheet', () => {
    const service = web();
    for (const pathname of [
        '/loewe-tv/epg.js', '/loewe-tv/epg-bridge.js', '/loewe-tv/package.json', '/loewe-tv/jsonConfig.json',
        '/loewe-tv/../main.js', '/loewe-tv/%2e%2e/main.js', '/loewe-tv/logos/../main.js',
        '/loewe-tv/index.html/extra', '/loewe-tv/index.html.bak',
    ]) {
        const response = service.request(pathname);
        assert.equal(response.code, 404, pathname);
        assert.equal(response.next, false, pathname);
    }
    for (const pathname of ['/loewe-tv-other/', '/loewe-tv2/', '/loewe-tv.30/epg.html', '/adapter/other/']) {
        assert.equal(service.request(pathname).next, true, pathname);
    }
});

test('chooser labels use localized names, escape markup and retain the TV namespace', () => {
    for (const language of ['de', 'en']) {
        const service = web({ id: 'system.adapter.loewe-tv.0', language,
            name: { de: 'Wohnzimmer Deutsch', en: 'Living room English' } });
        web({ host: service, id: 'system.adapter.loewe-tv.1', language,
            name: 'Fernseher <script>alert("TV")</script> & Nord' });
        const html = String(service.request('/loewe-tv/').body);
        assert.match(html, new RegExp(`<html[^>]*\\blang=["']${language}["']`));
        assert.ok(html.includes(language === 'de' ? 'Wohnzimmer Deutsch' : 'Living room English'));
        assert.doesNotMatch(html, /<script\b/i);
        assert.match(html, /&lt;script&gt;/);
        assert.match(html, /&lt;\/script&gt;/);
        assert.match(html, /&amp; Nord/);
        for (const instance of [0, 1]) assert.ok(html.includes(`loewe-tv.${instance}`));
    }
});

test('long or missing display names cannot hide the canonical TV identities', () => {
    const service = web({ id: 'system.adapter.loewe-tv.0', name: `${'A'.repeat(121)}UNBOUNDED_NAME` });
    web({ host: service, id: 'system.adapter.loewe-tv.1', name: null });
    web({ host: service, id: 'system.adapter.loewe-tv.2', name: { fr: 'Salon' } });
    const response = service.request('/loewe-tv/');
    assert.equal(response.code, 200);
    const html = String(response.body);
    assert.ok(html.includes('A'.repeat(100)));
    assert.ok(!html.includes('A'.repeat(121)));
    assert.doesNotMatch(html, /UNBOUNDED_NAME|\[object Object\]|undefined/);
    for (const instance of [0, 1, 2]) assert.ok(html.includes(`loewe-tv.${instance}`));
    assert.equal(tvLinks(response).length, 3);
});

test('TV choices remain isolated to the selected web app and exclude disabled extensions', () => {
    const first = web({ id: 'system.adapter.loewe-tv.0' });
    web({ host: first, id: 'system.adapter.loewe-tv.1' });
    web({ host: first, id: 'system.adapter.loewe-tv.7', enabled: false });
    web({ host: first, id: 'system.adapter.loewe-tv.8', selected: 'web.4' });
    const second = web({ id: 'system.adapter.loewe-tv.2', webInstance: 'web.4', selected: 'web.4' });
    assert.deepEqual(tvLinks(first.request('/loewe-tv/')), ['../loewe-tv.0/epg.html', '../loewe-tv.1/epg.html']);
    assert.equal(first.request('/loewe-tv/?instance=2').code, 404);
    const other = second.request('/loewe-tv/');
    assert.equal(other.code, 302);
    assert.equal(other.headers.Location, '../loewe-tv.2/epg.html');
    assert.equal(second.request('/loewe-tv/?instance=0').code, 404);
    first.extension.unload();
    assert.equal(second.request('/loewe-tv/').headers.Location, '../loewe-tv.2/epg.html');
});

test('unloading and reloading changes the chooser without retaining removed TVs', () => {
    const first = web({ id: 'system.adapter.loewe-tv.0', name: 'Alter Fernseher' });
    const second = web({ host: first, id: 'system.adapter.loewe-tv.1' });
    assert.equal(tvLinks(first.request('/loewe-tv/')).length, 2);
    first.extension.unload();
    const remaining = first.request('/loewe-tv/');
    assert.equal(remaining.code, 302);
    assert.equal(remaining.headers.Location, '../loewe-tv.1/epg.html');
    assert.equal(first.request('/loewe-tv/?instance=0').code, 404);
    assert.equal(first.request('/loewe-tv.0/epg.html').next, true);
    second.extension.unload();
    assert.equal(first.request('/loewe-tv/').next, true);
    assert.equal(first.request('/loewe-tv/epg-entry.css').next, true);
    web({ host: first, id: 'system.adapter.loewe-tv.0', name: 'Neuer Fernseher' });
    assert.equal(first.request('/loewe-tv/').headers.Location, '../loewe-tv.0/epg.html');
    web({ host: first, id: 'system.adapter.loewe-tv.1' });
    const reloaded = String(first.request('/loewe-tv/').body);
    assert.match(reloaded, /Neuer Fernseher/);
    assert.doesNotMatch(reloaded, /Alter Fernseher/);
});

test('late unloading of a replaced extension cannot remove its new registration', () => {
    const old = web({ id: 'system.adapter.loewe-tv.0', name: 'Alte Bezeichnung' });
    const second = web({ host: old, id: 'system.adapter.loewe-tv.1' });
    const replacement = web({ host: old, id: 'system.adapter.loewe-tv.0', name: 'Neue Bezeichnung' });
    old.extension.unload();
    assert.equal(old.extension.welcomePage(), null);
    assert.ok(replacement.extension.welcomePage());
    const response = old.request('/loewe-tv/');
    assert.deepEqual(tvLinks(response), ['../loewe-tv.0/epg.html', '../loewe-tv.1/epg.html']);
    assert.match(String(response.body), /Neue Bezeichnung/);
    assert.doesNotMatch(String(response.body), /Alte Bezeichnung/);
    second.extension.unload();
    assert.equal(old.request('/loewe-tv/').headers.Location, '../loewe-tv.0/epg.html');
    assert.equal(old.request('/loewe-tv.0/epg.html').code, 200);
});

test('the first chooser reads both saved TV names while offline without delaying assets or direct TV links', async () => {
    const resolvers = new Map();
    const adapter = namesAdapter({ read: id => new Promise(resolve => resolvers.set(id, resolve)) });
    const first = web({ adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30', name: 'loewe-tv' });
    const second = web({ host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31', name: 'loewe-tv' });
    const response = first.request('/loewe-tv/');
    assert.equal(response.code, null, 'The initial chooser waits for its short local database read.');
    assert.equal(first.request('/loewe-tv.0/epg.html').code, 200);
    assert.equal(first.request('/loewe-tv.1/epg.js').code, 200);
    assert.equal(first.request('/loewe-tv/epg-entry.css').code, 200);
    assert.equal(first.request('/loewe-tv/?instance=1').headers.Location, '../loewe-tv.1/epg.html');
    await new Promise(resolve => setImmediate(resolve));
    const identities = [
        { host: '192.168.1.30', port: 905, name: 'Loewe Wohnzimmer' },
        { host: '192.168.1.31', port: 905, name: 'Loewe Schlafzimmer' },
    ];
    const stateIds = [0, 1].map(instance => `loewe-tv.${instance}.${TV_NAMES_STATE}`);
    assert.deepEqual(adapter.reads, stateIds);
    assert.deepEqual(adapter.subscriptions, stateIds);
    for (const resolve of resolvers.values()) resolve(savedNames(identities));
    await response.done;
    let readyCalled = false;
    await first.extension.waitForReady(extension => {
        assert.equal(extension, first.extension);
        readyCalled = true;
    });
    assert.equal(readyCalled, true, 'The official callback-style Web readiness hook is supported.');
    assert.match(String(response.body), /Loewe Wohnzimmer/);
    assert.match(String(response.body), /Loewe Schlafzimmer/);
    assert.doesNotMatch(String(response.body), /Fernseher [01]/);
    assert.deepEqual(tvLinks(response), ['../loewe-tv.0/epg.html', '../loewe-tv.1/epg.html']);
    first.extension.unload();
    second.extension.unload();
    assert.deepEqual(adapter.unsubscriptions, [], 'Web owns shared subscriptions, including other readers of these states.');
});

test('a newer name update wins over a late initial read and cannot change another TV', async () => {
    let finishRead;
    let readStarted;
    const started = new Promise(resolve => { readStarted = resolve; });
    const adapter = namesAdapter({ read: id => id.startsWith('loewe-tv.0.') ? new Promise(resolve => {
        finishRead = resolve;
        readStarted();
    }) : savedNames([{ host: '192.168.1.31', port: 905, name: 'Schlafzimmer' }]) });
    const first = web({ adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    await started;
    const changed = savedNames([{ host: '192.168.1.30', port: 905, name: 'Neuer TV-Name' }]);
    first.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, changed);
    second.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, changed);
    first.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}.other`, savedNames([
        { host: '192.168.1.30', port: 905, name: 'Unrelated state' },
    ]));
    first.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, { ...changed, val: '{}', ack: false });
    finishRead(savedNames([{ host: '192.168.1.30', port: 905, name: 'Veralteter TV-Name' }]));
    await Promise.all([first.extension.waitForReady(), second.extension.waitForReady()]);
    const response = first.request('/loewe-tv/');
    assert.match(String(response.body), /Neuer TV-Name/);
    assert.match(String(response.body), /Schlafzimmer/);
    assert.doesNotMatch(String(response.body), /Veralteter|Unrelated/);
    first.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, null);
    assert.match(String(first.request('/loewe-tv/').body), /Fernseher 0/);
    first.extension.unload();
    second.extension.unload();
});

test('saved names require the configured IP and port and their markup is escaped', async () => {
    const adapter = namesAdapter({ read: () => savedNames([
        { host: '192.168.1.30', port: 905, name: 'TV <script>alert("x")</script> & Küche' },
    ]) });
    const first = web({ adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30', port: '905' });
    const changedHost = web({ host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31', name: 'Eigenes Gästezimmer' });
    const changedPort = web({ host: first, id: 'system.adapter.loewe-tv.2', tvHost: '192.168.1.30', port: 906 });
    const hostname = web({ host: first, id: 'system.adapter.loewe-tv.3', tvHost: 'tv.local' });
    const services = [first, changedHost, changedPort, hostname];
    await Promise.all(services.map(service => service.extension.waitForReady()));
    const response = first.request('/loewe-tv/');
    const html = String(response.body);
    assert.equal((html.match(/&lt;script&gt;/g) || []).length, 1);
    assert.match(html, /&quot;x&quot;/);
    assert.match(html, /&amp; Küche/);
    assert.doesNotMatch(html, /<script\b/i);
    assert.match(html, /Eigenes Gästezimmer/);
    assert.match(html, /Fernseher 2/);
    assert.match(html, /Fernseher 3/);
    assert.equal(tvLinks(response).length, 4);
    first.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, { val: '{broken', ack: true });
    assert.match(String(first.request('/loewe-tv/').body), /Fernseher 0/);
    for (const service of services) service.extension.unload();
});

test('name initialization has a fixed deadline when the state database does not answer', async () => {
    const timers = [];
    const context = { module: { exports: {} }, __dirname: path.join(__dirname, '..', 'lib'), URL,
        require(name) {
            if (name === 'node:timers') return {
                setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
                clearTimeout(timer) { if (timer) timer.cleared = true; },
            };
            return name === './tv-names' ? require('../lib/tv-names') : require(name);
        } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/web-extension.js'), 'utf8'), context);
    const adapter = namesAdapter({ read: () => new Promise(() => {}) });
    const first = web({ Extension: context.module.exports, adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ Extension: context.module.exports, host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    const response = first.request('/loewe-tv/');
    assert.equal(response.code, null);
    assert.equal(first.request('/loewe-tv.0/epg.html').code, 200);
    assert.equal(first.request('/loewe-tv/?instance=0').code, 302);
    assert.equal(timers.length, 2);
    for (const timer of timers) {
        assert.ok(timer.delay > 0 && timer.delay <= 2000, 'The chooser has a short, bounded initialization wait.');
        timer.callback();
    }
    await response.done;
    assert.equal(response.code, 200);
    assert.match(String(response.body), /Fernseher 0/);
    assert.match(String(response.body), /Fernseher 1/);
    assert.ok(timers.every(timer => timer.cleared));
    first.extension.unload();
    second.extension.unload();
});

test('name database failures fall back safely and a completed read cannot revive an unloaded extension', async () => {
    const adapter = namesAdapter({
        subscribe() { throw new Error('Subscription unavailable'); },
        read: () => Promise.reject(new Error('State unavailable')),
        unsubscribe() { assert.fail('The extension must not remove Web-owned subscriptions.'); },
    });
    const first = web({ adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    await Promise.all([first.extension.waitForReady(), second.extension.waitForReady()]);
    assert.equal(first.request('/loewe-tv/').code, 200);
    first.extension.unload();
    second.extension.unload();

    let finishRead;
    let readStarted;
    const started = new Promise(resolve => { readStarted = resolve; });
    const lateAdapter = namesAdapter({ read: () => new Promise(resolve => { finishRead = resolve; readStarted(); }) });
    const late = web({ adapter: lateAdapter, tvHost: '192.168.1.30' });
    await started;
    late.extension.unload();
    finishRead(savedNames([{ host: '192.168.1.30', port: 905, name: 'Name nach Entladen' }]));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(late.extension.name, 'Fernseher 3');
    assert.equal(late.request('/loewe-tv/').next, true);
    assert.equal(late.extension.welcomePage(), null);
    assert.deepEqual(lateAdapter.unsubscriptions, []);
});

test('replacing a TV extension preserves its name subscription despite a late old subscription or unload', async () => {
    for (const delayOldSubscription of [false, true]) {
        let finishOldSubscription;
        let subscribeStarted;
        let subscribeCount = 0;
        const started = new Promise(resolve => { subscribeStarted = resolve; });
        const adapter = namesAdapter({
            read: () => savedNames([{ host: '192.168.1.30', port: 905, name: 'Wohnzimmer' }]),
            subscribe() {
                subscribeCount += 1;
                if (subscribeCount !== 1 || !delayOldSubscription) return;
                return new Promise(resolve => { finishOldSubscription = resolve; subscribeStarted(); });
            },
        });
        const old = web({ adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
        if (delayOldSubscription) await started;
        else await old.extension.waitForReady();
        const replacement = web({ host: old, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
        old.extension.unload();
        finishOldSubscription?.();
        await replacement.extension.waitForReady();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(adapter.unsubscriptions, [], 'The old instance must not remove the replacement subscription.');
        replacement.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, savedNames([
            { host: '192.168.1.30', port: 905, name: 'Aktueller Name' },
        ]));
        assert.equal(replacement.extension.name, 'Aktueller Name');
        replacement.extension.unload();
        old.extension.unload();
        assert.deepEqual(adapter.unsubscriptions, []);
    }
});

test('a later chooser GET recovers stored TV names after the first database read and subscription failed', async () => {
    const clock = namesClock();
    let failed = true;
    const adapter = namesAdapter({
        subscribe() { throw new Error('Subscription unavailable'); },
        read(id) {
            if (failed) throw new Error('State unavailable during startup');
            return savedNames([{ host: id.startsWith('loewe-tv.0.') ? '192.168.1.30' : '192.168.1.31',
                port: 905, name: id.startsWith('loewe-tv.0.') ? 'Wohnzimmer' : 'Schlafzimmer' }]);
        },
    });
    const first = web({ Extension: clock.Extension, adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ Extension: clock.Extension, host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    await Promise.all([first.extension.waitForReady(), second.extension.waitForReady()]);
    assert.match(String(first.request('/loewe-tv/').body), /Fernseher 0/);
    failed = false;
    clock.advance(4999);
    assert.match(String(first.request('/loewe-tv/').body), /Fernseher 0/);
    assert.equal(adapter.reads.length, 2, 'Repeated page reloads respect the five-second read interval.');
    clock.advance(1);
    const response = first.request('/loewe-tv/');
    await response.done;
    assert.match(String(response.body), /Wohnzimmer/);
    assert.match(String(response.body), /Schlafzimmer/);
    assert.doesNotMatch(String(response.body), /Fernseher [01]/);
    assert.equal(adapter.reads.length, 4);
    assert.deepEqual(tvLinks(response), ['../loewe-tv.0/epg.html', '../loewe-tv.1/epg.html']);
    first.extension.unload();
    second.extension.unload();
});

test('parallel chooser reloads share one read per TV and recover a lost name event without delaying direct links', async () => {
    const clock = namesClock();
    const resolvers = new Map();
    let reload = false;
    const adapter = namesAdapter({ read: id => reload
        ? new Promise(resolve => resolvers.set(id, resolve))
        : savedNames([{ host: id.startsWith('loewe-tv.0.') ? '192.168.1.30' : '192.168.1.31', port: 905, name: 'Alter Name' }]) });
    const first = web({ Extension: clock.Extension, adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ Extension: clock.Extension, host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    await Promise.all([first.extension.waitForReady(), second.extension.waitForReady()]);
    reload = true;
    clock.advance(5000);
    assert.equal(first.request('/loewe-tv.0/epg.html').code, 200);
    assert.equal(first.request('/loewe-tv/?instance=1').headers.Location, '../loewe-tv.1/epg.html');
    assert.equal(first.request('/loewe-tv/epg-entry.css').code, 200);
    assert.equal(adapter.reads.length, 2, 'Assets and unambiguous redirects never start the extra name read.');
    const responses = Array.from({ length: 12 }, (_, index) => first.request(ENTRY_PATHS[index % ENTRY_PATHS.length]));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(adapter.reads.length, 4, 'Concurrent page reloads share their in-flight name reads.');
    assert.ok(responses.every(response => response.code === null));
    assert.equal(first.request('/loewe-tv.1/epg.js').code, 200);
    assert.equal(first.request('/loewe-tv/?instance=0').code, 302);
    for (const [id, resolve] of resolvers) {
        const firstTv = id.startsWith('loewe-tv.0.');
        resolve(savedNames([{ host: firstTv ? '192.168.1.30' : '192.168.1.31', port: 905,
            name: firstTv ? 'Neues Wohnzimmer' : 'Neues Schlafzimmer' }]));
    }
    await Promise.all(responses.map(response => response.done));
    for (const response of responses) {
        assert.equal(response.code, 200);
        assert.match(String(response.body), /Neues Wohnzimmer/);
        assert.match(String(response.body), /Neues Schlafzimmer/);
        assert.doesNotMatch(String(response.body), /Alter Name/);
    }
    assert.equal(first.request('/loewe-tv/').code, 200);
    assert.equal(adapter.reads.length, 4, 'A completed reload cannot immediately start another one.');
    first.extension.unload();
    second.extension.unload();
});

test('live name updates and unloading win over later chooser read responses', async () => {
    const clock = namesClock();
    const resolvers = new Map();
    let reload = false;
    const adapter = namesAdapter({ read: id => reload
        ? new Promise(resolve => resolvers.set(id, resolve))
        : savedNames([{ host: id.startsWith('loewe-tv.0.') ? '192.168.1.30' : '192.168.1.31', port: 905, name: 'Ursprünglich' }]) });
    const first = web({ Extension: clock.Extension, adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ Extension: clock.Extension, host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    await Promise.all([first.extension.waitForReady(), second.extension.waitForReady()]);
    reload = true;
    clock.advance(5000);
    const response = first.request('/loewe-tv/');
    await new Promise(resolve => setImmediate(resolve));
    first.extension.stateChange(`loewe-tv.0.${TV_NAMES_STATE}`, savedNames([
        { host: '192.168.1.30', port: 905, name: 'Aktueller Name aus Event' },
    ]));
    second.extension.unload();
    for (const [id, resolve] of resolvers) resolve(savedNames([
        { host: id.startsWith('loewe-tv.0.') ? '192.168.1.30' : '192.168.1.31', port: 905, name: 'Verspäteter Name' },
    ]));
    await response.done;
    assert.equal(first.extension.name, 'Aktueller Name aus Event');
    assert.equal(second.extension.name, 'Ursprünglich', 'A response cannot revive or rename an unloaded TV.');
    assert.equal(second.extension.welcomePage(), null);
    assert.equal(response.headers.Location, '../loewe-tv.0/epg.html', 'The final response uses the remaining active TV.');
    first.extension.unload();
});

test('a hung subscription and timed out read cannot prevent a later chooser from recovering', async () => {
    const clock = namesClock();
    const initialResolvers = new Map();
    let reload = false;
    const adapter = namesAdapter({ subscribe: () => new Promise(() => {}), read: id => reload
        ? savedNames([{ host: id.startsWith('loewe-tv.0.') ? '192.168.1.30' : '192.168.1.31', port: 905, name: 'Wiederhergestellt' }])
        : new Promise(resolve => initialResolvers.set(id, resolve)) });
    const first = web({ Extension: clock.Extension, adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ Extension: clock.Extension, host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    const initial = first.request('/loewe-tv/');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(adapter.reads.length, 2, 'Name reads do not depend on acknowledgement of a subscription.');
    clock.advance(1500);
    await initial.done;
    assert.equal(initial.code, 200);
    assert.match(String(initial.body), /Fernseher 0/);
    reload = true;
    clock.advance(3500);
    const recovered = first.request('/loewe-tv/');
    await recovered.done;
    assert.equal(adapter.reads.length, 4);
    assert.equal((String(recovered.body).match(/Wiederhergestellt/g) || []).length, 2);
    for (const [id, resolve] of initialResolvers) resolve(savedNames([
        { host: id.startsWith('loewe-tv.0.') ? '192.168.1.30' : '192.168.1.31', port: 905, name: 'Zu spät' },
    ]));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(first.extension.name, 'Wiederhergestellt');
    assert.equal(second.extension.name, 'Wiederhergestellt');
    first.extension.unload();
    second.extension.unload();
});

test('a chooser request does not recursively retry after its read deadline crosses the next refresh interval', async () => {
    const clock = namesClock();
    const adapter = namesAdapter({ read: () => new Promise(() => {}) });
    const first = web({ Extension: clock.Extension, adapter, id: 'system.adapter.loewe-tv.0', tvHost: '192.168.1.30' });
    const second = web({ Extension: clock.Extension, host: first, id: 'system.adapter.loewe-tv.1', tvHost: '192.168.1.31' });
    await new Promise(resolve => setImmediate(resolve));
    clock.advance(5000);
    const response = first.request('/loewe-tv/');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(adapter.reads.length, 4);
    clock.advance(20000);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(response.code, 200, 'Even after a long event-loop pause, this request renders after one deadline.');
    await response.done;
    assert.equal(adapter.reads.length, 4, 'Rendering after the deadline must not start another read.');
    assert.match(String(response.body), /Fernseher 0/);
    assert.match(String(response.body), /Fernseher 1/);
    assert.ok(clock.timers.every(timer => timer.delay === 1500 && timer.cleared));
    first.extension.unload();
    second.extension.unload();
});
