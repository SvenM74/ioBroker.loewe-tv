'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const EpgWebExtension = require('../lib/web-extension');
const io = require('../io-package.json');
const sources = require('./fixtures/admin-link-resolver/sources.json');
const legacyResolver = require('./fixtures/admin-link-resolver/admin-8.0.14.cjs');
const directResolvers = [
    ['8.0.22', require('./fixtures/admin-link-resolver/admin-8.0.22.cjs')],
    ['8.3.0', require('./fixtures/admin-link-resolver/admin-8.3.0.cjs')],
];
const GUIDE = fs.readFileSync(path.join(__dirname, '..', 'admin', 'epg.html'));

function context({ selected = ['web.1', 'web.1'], secure = false, bind = '0.0.0.0' } = {}) {
    const instances = {};
    for (const number of [0, 1]) {
        const id = `system.adapter.loewe-tv.${number}`;
        instances[id] = {
            _id: id, type: 'instance',
            common: { ...io.common, enabled: true, host: 'broker' },
            native: { host: `192.168.178.${40 + number}`, port: 905, webInstance: selected[number] },
        };
    }
    for (const [namespace, port] of [['admin.0', 8081], ['web.0', 8082], ['web.1', 8083]]) {
        const id = `system.adapter.${namespace}`;
        instances[id] = { _id: id, type: 'instance',
            common: { name: namespace.split('.')[0], enabled: true, host: 'broker' },
            native: { bind, port, secure } };
    }
    return { instances, hostname: '192.168.178.24', adminInstance: 'admin.0', hosts: {} };
}

function links(resolver, configuration, number) {
    return resolver.replaceLink(io.common.localLinks._default, 'loewe-tv', number, configuration);
}

function host(configuration, namespace = 'web.1', auth = false) {
    const handlers = [];
    const app = { use(handler) { handlers.push(handler); } };
    const adapter = { namespace, config: { socketio: '' },
        sendTo() { assert.fail('Following an EPG link must not send a TV command.'); },
        setForeignState() { assert.fail('Following an EPG link must not write an ioBroker state.'); } };
    // Register TV 1 first to catch accidental dispatch to the first loaded TV.
    const extensions = [1, 0].map(number => new EpgWebExtension(null, { auth, language: 'de' }, adapter,
        configuration.instances[`system.adapter.loewe-tv.${number}`], app));
    const requests = [];
    return {
        extensions, handlers, requests,
        request(url, overrides = {}) {
            requests.push(url);
            const request = { url, method: 'GET', ...overrides };
            const response = { headers: {}, code: null, body: undefined, next: false,
                setHeader(name, value) { this.headers[name] = value; },
                status(code) { this.code = code; return this; },
                send(body) { this.body = body; return this; },
                end() { this.ended = true; return this; },
                redirect(code, location) { this.code = code; this.headers.Location = location; return this; } };
            let index = 0;
            const next = () => {
                if (index === handlers.length) response.next = true;
                else handlers[index++](request, response, next);
            };
            next();
            return response;
        },
    };
}

function followDirect(service, address, publicBase, number) {
    const base = new URL(publicBase);
    const firstUrl = new URL(address, base);
    assert.equal(firstUrl.origin, base.origin);
    assert.ok(firstUrl.pathname.startsWith(base.pathname));
    const firstPath = `/${firstUrl.pathname.slice(base.pathname.length)}${firstUrl.search}`;
    assert.equal(firstPath, `/adapter/loewe-tv/epg.html?instance=${number}`);
    const redirect = service.request(firstPath);
    assert.equal(redirect.code, 302, firstUrl.href);
    const target = new URL(redirect.headers.Location, firstUrl);
    assert.equal(target.href, new URL(`loewe-tv.${number}/epg.html`, base).href);
    const lastPath = `/${target.pathname.slice(base.pathname.length)}${target.search}`;
    const response = service.request(lastPath);
    assert.equal(response.code, 200, target.href);
    assert.deepEqual(response.body, GUIDE, 'The final response is the actual EPG, without a selection page.');
    assert.deepEqual(service.requests.slice(-2), [firstPath, `/loewe-tv.${number}/epg.html`]);
    return target;
}

test('recovery retains the Admin 7.7.28 minimum and fixture sources retain their upstream hashes', () => {
    const dependency = io.common.globalDependencies.find(item => Object.hasOwn(item, 'admin'));
    // Keep the established runtime requirement. Direct extension arrows have
    // a separate Admin resolver limitation, documented by the tests below.
    assert.equal(dependency?.admin, '>=7.7.28');
    const directory = path.join(__dirname, 'fixtures', 'admin-link-resolver');
    for (const source of sources.resolvers) {
        const raw = fs.readFileSync(path.join(directory, 'sources', source.sourceFile));
        const blob = crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
        assert.equal(blob, source.blobSha, source.version);
        assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), source.sourceSha256);
        const fixture = fs.readFileSync(path.join(directory, source.fixture));
        assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'), source.fixtureSha256);
    }
    const license = fs.readFileSync(path.join(directory, sources.license.file));
    assert.equal(crypto.createHash('sha1').update(`blob ${license.length}\0`).update(license).digest('hex'),
        sources.license.blobSha);
});

test('Admin 8.0.14 still opens the generic entry whose explicit TV links reach their own EPG', () => {
    const configuration = context();
    const service = host(configuration);
    const urls = [0, 1].map(number => links(legacyResolver, configuration, number));
    assert.deepEqual(urls, [0, 1].map(() => [{
        url: 'http://192.168.178.24:8083/loewe-tv/', port: 8083, instance: 'web.1',
    }]));
    const response = service.request(new URL(urls[0][0].url).pathname);
    assert.equal(response.code, 200);
    assert.equal(response.headers.Location, undefined);
    assert.match(String(response.body), /Fernseher auswählen/);
    for (const number of [0, 1]) {
        const href = String(response.body).match(new RegExp(`href="([^"]*loewe-tv\\.${number}/epg\\.html)"`));
        assert.ok(href, `The generic entry must offer TV ${number}.`);
        const target = new URL(href[1], urls[number][0].url);
        assert.equal(target.href, `http://192.168.178.24:8083/loewe-tv.${number}/epg.html`);
        const guide = service.request(target.pathname);
        assert.equal(guide.code, 200);
        assert.deepEqual(guide.body, GUIDE);
    }
});

test('Admin 8.0.22 and 8.3.0 resolve both instance arrows directly to their own EPG', () => {
    for (const [version, resolver] of directResolvers) {
        const configuration = context();
        const service = host(configuration);
        for (const number of [0, 1]) {
            const result = links(resolver, configuration, number);
            assert.deepEqual(result, [{
                url: `http://192.168.178.24:8083/adapter/loewe-tv/epg.html?instance=${number}`,
                port: 8083, instance: 'web.1',
            }], version);
            followDirect(service, result[0].url, 'http://192.168.178.24:8083/', number);
        }
        assert.equal(service.requests.some(url => /^\/loewe-tv(?:\/|\?|$)/.test(url)), false,
            'Neither instance arrow may request the generic selection entry.');
    }
});

test('direct links use each selected Web host, port and HTTPS setting instead of the TV endpoint', () => {
    for (const [, resolver] of directResolvers) {
        const configuration = context({ selected: ['web.0', 'web.1'], secure: true });
        configuration.instances['system.adapter.web.1'].common.host = 'second-host';
        configuration.hosts['system.host.second-host'] = {
            native: { hardware: { networkInterfaces: { eth0: [
                { address: '192.168.178.50', family: 'IPv4', internal: false, netmask: '255.255.255.0' },
            ] } } },
        };
        for (const [number, namespace, hostname, port] of [
            [0, 'web.0', '192.168.178.24', 8082], [1, 'web.1', '192.168.178.50', 8083],
        ]) {
            const result = links(resolver, configuration, number);
            assert.equal(result.length, 1, 'Another installed Web instance must not add another arrow.');
            assert.equal(result[0].instance, namespace);
            assert.equal(result[0].port, port);
            const service = host(configuration, namespace);
            assert.equal(service.handlers.length, 1, 'Only the TV assigned to this Web instance is loaded.');
            followDirect(service, result[0].url, `https://${hostname}:${port}/`, number);
            assert.equal(service.request(`/loewe-tv.${1 - number}/epg.html`).next, true);
        }
    }
});

test('released Admin reverse-proxy rewriting and the extension redirect preserve the full public prefix', () => {
    for (const [, resolver] of directResolvers) {
        const configuration = context({ bind: '127.0.0.1' });
        const service = host(configuration);
        const proxy = { globalPath: '/home/', paths: [
            { instance: 'admin.0', path: '/home/admin/' },
            { instance: 'web.1', path: '/home/web/' },
        ] };
        for (const number of [0, 1]) {
            const [local] = links(resolver, configuration, number);
            const publicLink = resolver.applyReverseProxyToLink(local.url, `loewe-tv.${number}`,
                configuration.instances, proxy);
            assert.equal(publicLink, `/home/web/adapter/loewe-tv/epg.html?instance=${number}`);
            followDirect(service, publicLink, 'https://broker.example/home/web/', number);
        }
    }
});

test('released Admin Cloud rewriting keeps TV identity and existing Cloud tiles open canonical EPG pages', () => {
    for (const [, resolver] of directResolvers) {
        const configuration = context();
        configuration.instances['system.adapter.cloud.0'] = {
            common: { name: 'cloud', enabled: true },
            native: { cloudUrl: 'https://iobroker.pro:10656', instance: 'web.1', allowAdmin: 'admin.0' },
        };
        const remote = resolver.detectRemoteAccess(configuration.instances,
            new URL('https://iobroker.pro/admin/'));
        assert.equal(remote.webPort, 8083);
        const service = host(configuration);
        for (const number of [0, 1]) {
            const [local] = links(resolver, configuration, number);
            assert.equal(resolver.applyRemoteAccessToLink(local.url, local.port, remote),
                `https://iobroker.pro/adapter/loewe-tv/epg.html?instance=${number}`);
            // Cloud's existing welcome-page path stays independent of the
            // Admin asset route; this exercises our real per-TV extension.
            const entry = service.extensions.find(extension => extension.instance === `${number}`).welcomePage();
            const target = new URL(entry.link, remote.origin);
            assert.equal(target.href, `https://iobroker.pro/loewe-tv.${number}/epg.html`);
            assert.deepEqual(service.request(target.pathname).body, GUIDE);
        }
        assert.equal(resolver.applyRemoteAccessToLink('http://broker:8082/example/', 8082, remote), null,
            'A Web instance that Cloud does not publish must not be selected by guesswork.');
        assert.deepEqual(service.requests, ['/loewe-tv.0/epg.html', '/loewe-tv.1/epg.html']);
    }
});

test('without a selected Web instance, both links stay directly on their own Admin EPG with proxy prefix', () => {
    for (const resolver of [legacyResolver, ...directResolvers.map(([, item]) => item)]) {
        const configuration = context({ selected: ['', ''] });
        const service = host(configuration);
        assert.equal(service.handlers.length, 0);
        for (const number of [0, 1]) {
            const result = links(resolver, configuration, number);
            assert.deepEqual(result, [{ url: `adapter/loewe-tv/epg.html?instance=${number}`, port: undefined }]);
            assert.equal(new URL(result[0].url, 'https://broker.example/home/admin/').href,
                `https://broker.example/home/admin/adapter/loewe-tv/epg.html?instance=${number}`);
        }
    }
});

test('direct instance links retain Web authentication and reject ambiguous or mismatched TV identities', () => {
    const configuration = context();
    const service = host(configuration, 'web.1', true);
    const resolver = directResolvers[0][1];
    for (const number of [0, 1]) {
        const [link] = links(resolver, configuration, number);
        const url = new URL(link.url);
        const route = url.pathname + url.search;
        assert.equal(service.request(route).code, 401);
        assert.equal(service.request(route, { isAuthenticated: () => false, user: 'admin' }).code, 401);
        const redirect = service.request(route, { isAuthenticated: () => true });
        assert.equal(redirect.code, 302);
        const target = new URL(redirect.headers.Location, url);
        assert.equal(target.pathname, `/loewe-tv.${number}/epg.html`);
        assert.deepEqual(service.request(target.pathname, { isAuthenticated: () => true }).body, GUIDE);
        assert.equal(service.request(`${target.pathname}?instance=${1 - number}`,
            { isAuthenticated: () => true }).code, 400);
    }
    for (const query of ['instance=0&instance=1', 'instance=01', 'instance=999']) {
        const response = service.request(`/adapter/loewe-tv/epg.html?${query}`, { isAuthenticated: () => true });
        assert.equal(response.next, true);
        assert.equal(response.headers.Location, undefined, 'An invalid link must not be redirected to another TV.');
    }
});
