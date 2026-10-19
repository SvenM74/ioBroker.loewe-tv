'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TV_NAMES_STATE, parseTvNames, mergeTvNames, mergeReportedTvName, nameForTv } = require('../lib/tv-names');

const empty = () => ({ schemaVersion: 1, devices: [] });
const snapshot = devices => ({ schemaVersion: 1, devices });

test('stored names resolve only the selected IPv4 address and control port', () => {
    const value = { schemaVersion: 1, devices: [
        { host: '192.0.2.10', port: 905, name: 'Loewe Wohnzimmer' },
        { host: '192.0.2.20', port: 905, name: 'Loewe Schlafzimmer' },
        { host: '192.0.2.20', port: 1905, name: 'Anderer Steuerport' },
    ] };
    const restored = parseTvNames(JSON.stringify(value));
    assert.equal(TV_NAMES_STATE, 'device.discoveryNames');
    assert.deepEqual(restored, value);
    assert.equal(nameForTv(restored, '192.0.2.20', 905), 'Loewe Schlafzimmer');
    assert.equal(nameForTv(restored, ' 192.0.2.20 ', '1905'), 'Anderer Steuerport');
    for (const [host, port] of [
        ['192.0.2.21', 905], ['192.0.2.20', 906], ['tv.invalid', 905], ['192.000.002.020', 905],
        ['192.0.2.20', true], ['192.0.2.20', '905/path'], ['', 905], ['::1', 905],
    ]) assert.equal(nameForTv(restored, host, port), '', `${host}:${port}`);
});

test('corrupt, oversized or ambiguous stored name snapshots become empty without throwing', () => {
    const good = { host: '192.0.2.10', port: 905, name: 'Wohnzimmer' };
    for (const value of [
        null, undefined, {}, 123, '', '{broken', 'null', '[]',
        JSON.stringify({ ...snapshot([good]), schemaVersion: 2 }),
        JSON.stringify({ ...snapshot([good]), unexpected: 'field' }),
        JSON.stringify(snapshot([good, good])),
        ...[
            { ...good, host: '192.0.2.999' }, { ...good, port: '905' }, { ...good, port: 0 },
            { ...good, name: '' }, { ...good, name: 'two\nlines' }, { ...good, name: 'x'.repeat(161) },
            { ...good, name: '\uD800' }, { ...good, name: { text: 'Wrong type' } },
            { ...good, model: 'unexpected field' },
        ].map(device => JSON.stringify(snapshot([device]))),
        JSON.stringify(snapshot(Array.from({ length: 257 }, (_, index) => ({ ...good,
            host: `192.0.${Math.floor(index / 256)}.${index % 256}` })))),
        `${' '.repeat(192 * 1024)}${JSON.stringify(snapshot([good]))}`,
    ]) assert.deepEqual(parseTvNames(value), empty());
});

test('a rescan updates exact identities and retains offline names without mutating its inputs', () => {
    const previous = snapshot([
        { host: '192.0.2.10', port: 905, name: 'Alter Name' },
        { host: '192.0.2.20', port: 905, name: 'Offline TV' },
        { host: '192.0.2.10', port: 1905, name: 'Anderer Port' },
    ]);
    const devices = [{ host: '192.0.2.10', name: '  Wohnzimmer\n & Küche  ', model: 'bild 7.55' }];
    const before = structuredClone({ previous, devices });
    const merged = mergeTvNames(previous, devices, 905);
    assert.equal(nameForTv(merged, '192.0.2.10', 905), 'Wohnzimmer & Küche');
    assert.equal(nameForTv(merged, '192.0.2.20', 905), 'Offline TV');
    assert.equal(nameForTv(merged, '192.0.2.10', 1905), 'Anderer Port');
    assert.deepEqual({ previous, devices }, before);
    assert.deepEqual(mergeTvNames(merged, [], 905), merged);
    assert.deepEqual(mergeTvNames(merged, null, 905), merged);
    assert.deepEqual(mergeTvNames(merged, devices, 0), merged);
    assert.deepEqual(mergeTvNames(merged, [{ host: '192.0.2.20', name: '' }], 905), merged);
});

test('name storage is bounded and preserves the most recently confirmed identities', () => {
    const devices = Array.from({ length: 256 }, (_, index) => ({ host: `192.0.2.${index}`, name: `TV ${index}` }));
    const full = mergeTvNames(empty(), devices, 905);
    assert.equal(full.devices.length, 256);
    const merged = mergeTvNames(full, [
        { host: '192.0.2.0', name: 'Kürzlich bestätigt' },
        { host: '192.0.3.1', name: 'Neu' },
        { host: 'tv.invalid', name: 'Hostname is not a discovery address' },
        { host: '192.0.3.2', name: { invalid: true } },
    ], 905);
    assert.equal(merged.devices.length, 256);
    assert.equal(nameForTv(merged, '192.0.2.0', 905), 'Kürzlich bestätigt');
    assert.equal(nameForTv(merged, '192.0.2.1', 905), '');
    assert.equal(nameForTv(merged, '192.0.3.1', 905), 'Neu');
    assert.deepEqual(parseTvNames(JSON.stringify(merged)), merged);
    const longName = mergeTvNames(empty(), [{ host: '192.0.2.1', name: 'x'.repeat(159) + '📺suffix' }], 905);
    assert.equal(longName.devices[0].name.length, 159);
    assert.equal(longName.devices[0].name.isWellFormed(), true);
});

test('live names bind DNS and IPv6 targets exactly without guessing another address', () => {
    let value = empty();
    const hosts = ['tv-wohnzimmer.fritz.box', 'TV-Schlafzimmer', '2001:db8::1', '[2001:db8::2]'];
    for (const [index, host] of hosts.entries()) value = mergeReportedTvName(value,
        { host, port: 905, name: `Loewe ${index}`, source: 'network' });
    const restored = parseTvNames(JSON.stringify(value));
    for (const [index, host] of hosts.entries()) {
        assert.equal(nameForTv(restored, host, 905), `Loewe ${index}`);
        assert.equal(nameForTv(restored, host, 1905), '');
    }
    assert.equal(nameForTv(restored, '192.0.2.10', 905), '');
    assert.equal(nameForTv(restored, 'anderer-tv.fritz.box', 905), '');
    assert.equal(nameForTv(restored, '2001:db8::3', 905), '');
    assert.equal(nameForTv(restored, hosts[0], '905/path'), '');
    assert.deepEqual(restored, value);
});

test('network names improve streaming names and discovery names retain priority', () => {
    const target = { host: '192.0.2.10', port: 905 };
    const first = mergeReportedTvName(empty(), { ...target, name: 'Remote TV', source: 'streaming' });
    const network = mergeReportedTvName(first, { ...target, name: '  Loewe\n Wohnzimmer  ', source: 'network' });
    assert.equal(nameForTv(network, target.host, target.port), 'Loewe Wohnzimmer');
    const renamed = mergeReportedTvName(network, { ...target, name: 'Loewe Esszimmer', source: 'network' });
    assert.equal(nameForTv(renamed, target.host, target.port), 'Loewe Esszimmer');
    assert.deepEqual(mergeReportedTvName(renamed, { ...target, name: 'Remote TV', source: 'streaming' }), renamed);
    assert.deepEqual(first.devices, [{ ...target, name: 'Remote TV', source: 'streaming' }]);
    const discovered = mergeTvNames(renamed, [{ host: target.host, name: 'Mein Loewe' }], target.port);
    assert.deepEqual(discovered.devices, [{ ...target, name: 'Mein Loewe' }]);
    assert.deepEqual(mergeReportedTvName(discovered, { ...target, name: 'h1', source: 'network' }), discovered);
    assert.deepEqual(parseTvNames(JSON.stringify(discovered)), discovered);
});

test('empty, malformed and untrusted live name fields cannot erase an offline name', () => {
    const good = { host: '192.0.2.10', port: 905, name: 'Wohnzimmer', source: 'network' };
    const previous = mergeReportedTvName(empty(), good);
    for (const fields of [
        { name: '' }, { name: '  \n ' }, { name: null }, { name: { '#text': 'Wrong boundary' } },
        { name: '\uD800' }, { host: '' }, { host: 'http://tv.invalid' }, { host: 'tv.invalid/path' },
        { host: 'user@tv.invalid' }, { host: 'tv.invalid:905' }, { host: '192.0.2.999' },
        { host: '[tv.invalid]' }, { host: '-invalid' }, { host: 'x'.repeat(256) },
        { port: false }, { port: 0 }, { port: 65536 }, { source: 'discovery' },
        { source: '__proto__' }, { source: 'constructor' }, { source: null }, { source: ['network'] },
    ]) assert.deepEqual(mergeReportedTvName(previous, { ...good, ...fields }), previous);
    for (const source of ['discovery', '__proto__', 'constructor', null, ['network']]) {
        assert.deepEqual(parseTvNames(JSON.stringify(snapshot([{ ...good, source }]))), empty());
    }
    const longName = mergeReportedTvName(previous, { ...good, name: 'x'.repeat(159) + '📺suffix' });
    assert.equal(longName.devices[0].name.length, 159);
    assert.equal(longName.devices[0].name.isWellFormed(), true);
});

test('long DNS hosts and multibyte names round-trip within the persisted byte bound', () => {
    let value = empty();
    let lastHost;
    for (let index = 0; index < 256; index += 1) {
        lastHost = `${String(index).padStart(3, '0')}${'a'.repeat(60)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
        value = mergeReportedTvName(value, { host: lastHost, port: 905, name: '界'.repeat(160), source: 'streaming' });
    }
    const stored = JSON.stringify(value);
    assert.ok(Buffer.byteLength(stored) <= 192 * 1024);
    assert.ok(value.devices.length > 1 && value.devices.length < 256);
    assert.equal(nameForTv(value, lastHost, 905), '界'.repeat(160));
    assert.deepEqual(parseTvNames(stored), value);
    const discovered = mergeTvNames(value, [{ host: '192.0.2.10', name: '界'.repeat(160) }], 905);
    assert.deepEqual(parseTvNames(JSON.stringify(discovered)), discovered);
    assert.equal(nameForTv(discovered, lastHost, 905), '界'.repeat(160));
    assert.equal(nameForTv(discovered, '192.0.2.10', 905), '界'.repeat(160));
});
