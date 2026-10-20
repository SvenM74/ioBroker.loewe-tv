'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { gzipSync } = require('node:zlib');
const { resolveMappings } = require('../lib/epg-mapping');
const { EPGSHARE_DE_URL, resolveSourceMappings } = require('../lib/epg-provider');
const { buildMappingRows } = require('../lib/epg-config');
const { loadXmltv, xmltvSourceKey } = require('../lib/epg-xmltv');

const NOW = Date.parse('2026-10-20T12:00:00Z');
const TV = { id: 'channels.tv.ZDF_HD', number: 2, name: 'ZDF HD', itemClass: 'video' };
const ZDF = { id: 'ZDF.de', names: ['ZDF'], iconUrl: 'https://icons.example/zdf.png' };
const NATIONALS = [
    ['Das Erste', 'Das.Erste.de'], ['ZDF', 'ZDF.de'], ['ARTE', 'ARTE.de'], ['3sat', '3sat.de'],
    ['KiKA', 'KIKA.de'], ['PHOENIX', 'PHOENIX.de'], ['ONE', 'ONE.de'], ['tagesschau24', 'tagesschau24.de'],
    ['ZDFinfo', 'ZDFinfo.de'], ['ZDFneo', 'ZDFneo.de'], ['RTL', 'RTL.de'], ['RTLZWEI', 'RTLZWEI.de'],
    ['VOX', 'VOX.de'], ['SAT.1', 'SAT.1.de'], ['ProSieben', 'ProSieben.de'], ['kabel eins', 'kabel.eins.de'],
    ['DMAX', 'DMAX.de'], ['NITRO', 'NITRO.de'], ['ntv', 'ntv.de'], ['sixx', 'sixx.de'], ['TLC', 'TLC.de'],
    ['WELT', 'WELT.de'], ['SUPER RTL', 'SUPER.RTL.de'],
];

function response(bytes, status = 200, headers = {}) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    return { status, headers, body: Readable.from((function* () {
        for (let start = 0; start < buffer.length; start += 3) yield buffer.subarray(start, start + 3);
    })()) };
}

const XML = '<tv><channel id="ZDF.de"><display-name>ZDF</display-name></channel>'
    + '<channel id="ZDF.at"><display-name>ZDF Österreich</display-name></channel>'
    + '<programme channel="ZDF.de" start="20261020130000 +0000" stop="20261020140000 +0000">'
    + '<title>Planbare Sendung</title><desc>Auch ohne eingeschalteten Fernseher.</desc></programme>'
    + '<programme channel="ZDF.at" start="invalid"><title>Andere Fassung</title></programme></tv>';

function read(url = EPGSHARE_DE_URL, options = {}) {
    return loadXmltv(url, { services: [TV], now: NOW, fetchImpl: async () => response(gzipSync(XML)), ...options });
}

test('the named German provider maps explicit national HD services to its published base IDs', () => {
    for (const [name, id] of NATIONALS) {
        const channel = { id, names: [name] };
        const television = { ...TV, name: `${name} HD` };
        assert.equal(resolveMappings([television], [channel])[0].status, 'unmatched', name);
        const [row] = resolveSourceMappings([television], [channel], {}, EPGSHARE_DE_URL);
        assert.equal(row.status, 'automatic', name);
        assert.equal(row.xmltvId, id, name);
        assert.deepEqual(row.candidates, [{ ...channel, reason: 'provider' }]);
        const base = [{ ...television, name }];
        assert.deepEqual(resolveSourceMappings(base, [channel], {}, EPGSHARE_DE_URL), resolveMappings(base, [channel]));
    }
    for (const name of ['ARD', 'ARD HD', 'das erste hd']) {
        const [row] = resolveSourceMappings([{ ...TV, name }], [{ id: 'Das.Erste.de', names: ['Das Erste'] }], {}, EPGSHARE_DE_URL);
        assert.equal(row.xmltvId, 'Das.Erste.de');
        assert.equal(row.status, 'automatic');
    }
    const [row] = resolveSourceMappings([TV], [ZDF], {}, EPGSHARE_DE_URL);
    assert.equal(row.iconUrl, ZDF.iconUrl);
    assert.equal(row.candidates[0].iconUrl, ZDF.iconUrl);
    assert.equal(resolveSourceMappings([TV], [{ ...ZDF, iconUrl: 'file:///secret' }], {}, EPGSHARE_DE_URL)[0].iconUrl, undefined);
});

test('a profile requires the exact configured source URL and never weakens generic matching', () => {
    const generic = resolveMappings([TV], [ZDF]);
    for (const url of [undefined, '', 'https://guide.example/de.xml.gz', EPGSHARE_DE_URL.replace('https:', 'http:'),
        EPGSHARE_DE_URL.replace('epgshare01.online', 'www.epgshare01.online'),
        EPGSHARE_DE_URL.replace('epgshare01.online', 'EPGSHARE01.online'),
        EPGSHARE_DE_URL.replace('DE1', 'AT1'), `${EPGSHARE_DE_URL}?download=1`, `${EPGSHARE_DE_URL}#guide`,
        new URL(EPGSHARE_DE_URL)]) {
        assert.deepEqual(resolveSourceMappings([TV], [ZDF], {}, url), generic, String(url));
    }
    assert.equal(generic[0].xmltvId, null);
    assert.equal(generic[0].status, 'unmatched');
});

test('regional, shifted and other quality variants cannot use the national profile through aliases', () => {
    for (const name of ['ZDF Österreich HD', 'ZDF HD Österreich', 'ZDF UHD', 'ZDF SD', 'ZDF 4K', 'ZDF HD+1',
        'ZDF +1', 'ZDFHD', 'ARD regional HD', 'Das Erste Süd HD', 'WDR Köln HD', 'BR Fernsehen Süd HD']) {
        const services = [{ ...TV, name, aliases: ['ZDF HD'] }];
        const channels = [ZDF, { id: 'Das.Erste.de', names: ['Das Erste'] }, { id: 'WDR.de', names: ['WDR'] }];
        assert.deepEqual(resolveSourceMappings(services, channels, {}, EPGSHARE_DE_URL), resolveMappings(services, channels), name);
        assert.equal(resolveSourceMappings(services, channels, {}, EPGSHARE_DE_URL)[0].status, 'unmatched', name);
    }
});

test('a provider ID also requires an explicit plausible primary base name in the actual feed', () => {
    for (const channels of [[], [{ id: 'other', names: ['ZDF'] }], [{ ...ZDF, names: [] }],
        [{ ...ZDF, names: ['ZDF Österreich', 'ZDF'] }], [{ ...ZDF, names: ['ZDF +1', 'ZDF'] }],
        [{ ...ZDF, names: ['ZDF UHD', 'ZDF'] }], [{ ...ZDF, names: ['Other', 'ZDF'] }]]) {
        assert.deepEqual(resolveSourceMappings([TV], channels, {}, EPGSHARE_DE_URL), resolveMappings([TV], channels));
        assert.equal(resolveSourceMappings([TV], channels, {}, EPGSHARE_DE_URL)[0].status, 'unmatched');
    }
    const row = resolveSourceMappings([{ ...TV, name: 'ARD HD' }], [{ id: 'Das.Erste.de', names: ['ARD'] }], {}, EPGSHARE_DE_URL)[0];
    assert.equal(row.xmltvId, 'Das.Erste.de');
});

test('manual, disabled, missing, ambiguous and already automatic resolutions keep their exact outcome', () => {
    const other = { id: 'other', names: ['Different programme'] };
    const exact = { id: 'exact-hd', names: ['ZDF HD'] };
    const cases = [
        [[ZDF, other], { [TV.id]: 'other' }, 'manual'],
        [[ZDF], { [TV.id]: '' }, 'disabled'],
        [[ZDF], [{ channel: TV.id, mode: 'manual', xmltvId: '' }], 'disabled'],
        [[ZDF], { [TV.id]: 'absent' }, 'missing'],
        [[ZDF, exact, { id: 'second-hd', names: ['ZDF HD'] }], {}, 'ambiguous'],
        [[ZDF, exact], {}, 'automatic'],
    ];
    for (const [channels, manual, status] of cases) {
        const original = resolveMappings([TV], channels, manual);
        assert.equal(original[0].status, status);
        assert.deepEqual(resolveSourceMappings([TV], channels, manual, EPGSHARE_DE_URL), original, status);
    }
});

test('provider mapping keeps validation ahead of transport and rejects invalid catalogues', async () => {
    for (const url of [EPGSHARE_DE_URL, 'https://guide.example/other.xml']) {
        assert.throws(() => resolveSourceMappings([{ ...TV, id: 'foreign.id' }], [ZDF], {}, url), { code: 'XMLTV_MAPPING' });
        assert.throws(() => resolveSourceMappings([TV], [ZDF, ZDF], {}, url), { code: 'XMLTV_MAPPING' });
        assert.throws(() => resolveSourceMappings([TV], [{ ...ZDF, names: 'ZDF' }], {}, url), { code: 'XMLTV_MAPPING' });
        let calls = 0;
        await assert.rejects(read(url, { services: [{ ...TV, id: 'foreign.id' }],
            fetchImpl: async () => { calls++; return response(XML); } }), { code: 'XMLTV_MAPPING' });
        assert.equal(calls, 0);
    }
});

test('gzip parsing selects provider channels before retention and returns future programmes on TV channel IDs', async () => {
    const result = await read();
    assert.equal(result.mappings[0].status, 'automatic');
    assert.equal(result.mappings[0].candidates[0].reason, 'provider');
    assert.equal(result.mappings[0].xmltvId, 'ZDF.de');
    assert.deepEqual([...result.eventsByChannel.keys()], [TV.id]);
    const [event] = result.eventsByChannel.get(TV.id);
    assert.equal(event.title, 'Planbare Sendung');
    assert.equal(event.start, NOW + 3600000);
    assert.equal(event.end, NOW + 7200000);
    assert.match(event.eventId, /^xmltv:[a-f0-9]{64}$/u);
    assert.equal(result.stats.programmes, 2);
    assert.equal(result.stats.retainedEvents, 1);
    assert.equal(result.sourceKey, xmltvSourceKey(EPGSHARE_DE_URL));
    const other = await read('https://guide.example/other.xml.gz');
    assert.equal(other.mappings[0].status, 'unmatched');
    assert.equal(other.eventsByChannel.size, 0);
    assert.equal(other.stats.retainedEvents, 0);
});

test('parser profiles follow the original configured URL across redirects', async () => {
    for (const [original, redirected, expected] of [[EPGSHARE_DE_URL, 'https://cdn.example/guide.xml.gz', true],
        ['https://guide.example/redirect', EPGSHARE_DE_URL, false]]) {
        const urls = [];
        const result = await read(original, { fetchImpl: async url => {
            urls.push(url.href);
            return urls.length === 1 ? response('', 302, { location: redirected }) : response(gzipSync(XML));
        } });
        assert.deepEqual(urls, [original, redirected]);
        assert.equal(result.eventsByChannel.has(TV.id), expected);
        assert.equal(result.stats.retainedEvents, expected ? 1 : 0);
        assert.equal(result.sourceKey, xmltvSourceKey(original));
    }
});

test('the parser cannot infer undeclared provider IDs, and saved overrides govern programme retention', async () => {
    const programme = '<tv><programme channel="ZDF.de" start="20261020130000 +0000" stop="20261020140000 +0000">'
        + '<title>Ohne Senderdeklaration</title></programme></tv>';
    const implicit = await read(undefined, { fetchImpl: async () => response(gzipSync(programme)) });
    assert.equal(implicit.eventsByChannel.size, 0);
    assert.equal(implicit.stats.retainedEvents, 0);
    const manual = await read(undefined, { manualMappings: { [TV.id]: 'ZDF.de' },
        fetchImpl: async () => response(gzipSync(programme)) });
    assert.equal(manual.eventsByChannel.get(TV.id)[0].title, 'Ohne Senderdeklaration');
    assert.equal(manual.mappings[0].status, 'manual');
    for (const xmltvId of ['', 'missing']) {
        const result = await read(undefined, { manualMappings: { [TV.id]: xmltvId } });
        assert.equal(result.eventsByChannel.size, 0);
        assert.equal(result.stats.retainedEvents, 0);
        assert.equal(result.mappings[0].status, xmltvId ? 'missing' : 'disabled');
    }
});

test('editable Admin rows report the same provider match without replacing the user mode or XMLTV choice', () => {
    const rows = [{ channel: TV.id, mode: 'auto', xmltvId: '' }];
    const options = { catalogueLoaded: true, revision: 4, url: EPGSHARE_DE_URL };
    const result = buildMappingRows([TV], [ZDF], rows, options);
    assert.equal(result.assigned, 1);
    assert.equal(result.rows[0].mode, 'auto');
    assert.equal(result.rows[0].xmltvId, '');
    assert.equal(result.rows[0].revision, 4);
    assert.equal(result.rows[0].assignment, 'Automatisch: ZDF [ZDF.de]');
    assert.equal(buildMappingRows([TV], [ZDF], rows, { catalogueLoaded: true }).assigned, 0);
    assert.equal(buildMappingRows([TV], [ZDF], [{ channel: TV.id, mode: 'disabled', xmltvId: '' }], options).assigned, 0);
});
