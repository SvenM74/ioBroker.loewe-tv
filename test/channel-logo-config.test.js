'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../lib/adapter-runtime');
const { serviceIdentity } = require('../lib/channel-catalog');
const { configurationKey, channelSourceKey } = require('../lib/epg-sources');
const { normalizeLogoMappings, buildLogoMappingRows, serviceRegistryLogo } = require('../lib/channel-logo-config');

const ZDF = 'countries/germany/hd/zdf-hd-de.png';
const SAT1 = 'countries/germany/hd/sat-1-hd-de.png';
const service = { id: 'channels.tv.ZDF_HD', name: 'ZDF HD', number: 2, itemClass: 'video',
    listView: 'saved-tv-list', locator: 'channel://2:zdf:fixture', mediaItemUuid: 'fixture-zdf',
    thumbnailUrl: '/images/zdf.png', available: true };

test('malformed optional logo settings cannot stop TV configuration or contaminate EPG errors', () => {
    const malformed = [null, false, 'invalid', {}, [null, [], {}],
        [{ channel: { toString: null }, mode: 'manual', logoId: ZDF }],
        [{ channel: [service.id], mode: 'manual', logoId: ZDF }],
        [{ channel: service.id, mode: 'manual', logoId: { toString: null } }],
        [{ channel: service.id, mode: 'manual', logoId: 'javascript:alert(1)' }],
        [{ channel: service.id, mode: { toString: null }, logoId: ZDF }],
        new Array(4001).fill({ channel: service.id, mode: 'manual', logoId: ZDF })];
    for (const channelLogoMappings of malformed) {
        const config = normalizeConfig({ host: 'tv.fixture.invalid', epgEnabled: true,
            channelLogoSource: { invalid: true }, channelLogoCountry: false, channelLogoMappings });
        assert.equal(config.host, 'tv.fixture.invalid');
        assert.equal(config.epgEnabled, true);
        assert.equal(config.epgConfigError, '');
        assert.equal(config.channelLogoSource, 'auto');
        assert.equal(config.channelLogoCountry, 'de');
        assert.doesNotThrow(() => serviceRegistryLogo(service, config));
    }
    assert.deepEqual(normalizeLogoMappings([{ channel: [service.id], mode: 'manual', logoId: ZDF }]), {});
});

test('conflicting logo rows disable only the directory assignment of the affected service', () => {
    const mappings = normalizeLogoMappings([
        { channel: service.id, mode: 'manual', logoId: ZDF },
        { channel: service.id, mode: 'manual', logoId: SAT1 },
        { channel: 'channels.tv.SAT1_HD', mode: 'manual', logoId: SAT1 },
    ]);
    assert.deepEqual(mappings[service.id], { mode: 'disabled', logoId: '' });
    assert.equal(serviceRegistryLogo(service, { channelLogoMappings: mappings }), '');
    assert.match(serviceRegistryLogo({ ...service, id: 'channels.tv.SAT1_HD', name: 'SAT.1 HD' },
        { channelLogoMappings: mappings }), /\/hd\/sat-1-hd-de\.png$/u);
});

test('logo matrix derives TV identity and names from the catalogue and retains absent manual corrections', () => {
    const mappings = [
        { channel: service.id, tvChannel: 'Forged title', mode: 'auto', logoId: SAT1, locator: 'channel://foreign' },
        { channel: 'channels.tv.Absent', tvChannel: '9. Temporarily missing', mode: 'manual', logoId: SAT1 },
        { channel: 'channels.tv.Disabled', mode: 'disabled', logoId: ZDF },
        { channel: 'channels.tv.AbsentAuto', mode: 'auto', logoId: ZDF },
    ];
    const before = structuredClone(mappings);
    const identity = serviceIdentity(service);
    const result = buildLogoMappingRows([service], mappings, { origin: 'http://tv.fixture.invalid:905', revision: 7 });
    assert.equal(result.total, 1);
    assert.equal(result.assigned, 1);
    assert.equal(result.retained, 2);
    assert.deepEqual(result.rows[0], { channel: service.id, tvChannel: '2. ZDF HD', tvLogo: 'TV-Bildadresse vorhanden',
        mode: 'auto', logoId: ZDF, assignment: 'Automatisch: ZDF HD (DE, standard)', revision: 7 });
    assert.equal(result.rows[1].logoId, SAT1);
    assert.match(result.rows[1].assignment, /Korrektur bleibt erhalten/u);
    assert.equal(result.rows[2].mode, 'disabled');
    assert.ok(result.rows.every(row => !Object.hasOwn(row, 'locator')));
    assert.deepEqual(mappings, before);
    assert.equal(serviceIdentity(service), identity);
});

test('missing or unfinished manual logos remain editable and do not fall back to an automatic registry match', () => {
    for (const logoId of ['', 'countries/germany/no-such-station-de.png']) {
        const mappings = [{ channel: service.id, mode: 'manual', logoId }];
        const result = buildLogoMappingRows([service], mappings);
        assert.equal(result.assigned, 0);
        assert.equal(result.rows[0].logoId, logoId);
        assert.equal(serviceRegistryLogo(service, { channelLogoMappings: normalizeLogoMappings(mappings) }), '');
        assert.match(result.rows[0].assignment, logoId ? /fehlt/u : /auswählen/u);
    }
});

test('a full saved matrix cannot be replaced by a merged matrix that the runtime would reject', () => {
    const mappings = Array.from({ length: 4000 }, (_, index) =>
        ({ channel: `channels.tv.Absent_${index}`, mode: 'manual', logoId: ZDF }));
    assert.throws(() => buildLogoMappingRows([service], mappings), { code: 'LOGO_MAPPING' });
    assert.equal(mappings.length, 4000);
    assert.equal(Object.keys(normalizeLogoMappings(mappings)).length, 4000);
});

test('logo choices leave EPG cache keys and TV service identity unchanged', () => {
    const input = { host: 'tv.fixture.invalid', channelListView: service.listView, epgSource: 'auto',
        epgXmltvUrl: 'https://guide.fixture.invalid/guide.xml',
        epgXmltvMappings: [{ channel: service.id, xmltvId: 'zdf.fixture' }] };
    const original = normalizeConfig(input);
    for (const channelLogoSource of ['tv', 'registry', 'auto']) {
        const changed = normalizeConfig({ ...input, channelLogoSource, channelLogoCountry: 'at',
            channelLogoMappings: [{ channel: service.id, mode: 'manual', logoId: SAT1 }],
            channelLogoOverrides: [{ channel: service.id, url: 'https://manual.fixture.invalid/logo.png' }] });
        assert.equal(configurationKey(changed), configurationKey(original));
        assert.equal(channelSourceKey(service, changed), channelSourceKey(service, original));
        assert.equal(changed.epgXmltvMappings[service.id], 'zdf.fixture');
    }
});
