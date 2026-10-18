'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../admin/epg');

const NOW = Date.UTC(2026, 9, 18, 16, 13);
const START = Date.UTC(2026, 9, 18, 16, 0);
const event = (title, start = START, end = START + ui.HOUR, extra = {}) => ({
    eventId: title, title, subtitle: '', description: '', start, end, ...extra,
});
const channel = (id, number, events = []) => ({ id, name: id, number, available: true, status: 'ready', events });
const payload = channels => ({ schemaVersion: 1, source: 'tv', now: NOW, instance: 'loewe-tv.0',
    listName: 'ASTRA LCN', listView: 'selected-list', status: 'ready', lastUpdate: NOW, connected: true, channels });

test('guide accepts only the expected TV snapshot and a bounded event list', () => {
    for (const invalid of [null, {}, { ...payload([]), source: 'xmltv' },
        { ...payload([]), schemaVersion: 2 }, { ...payload([]), now: 'today' },
        payload([channel('one', 1, Array.from({ length: 129 }, () => event('too many')))])]) {
        assert.throws(() => ui.normalizeGuide(invalid), /EPG_GUIDE_RESPONSE_INVALID/);
    }
    assert.equal(ui.normalizeGuide(payload([])).channels.length, 0);
});

test('guide sorts by numeric channel position, keeps names and has no generated programmes', () => {
    const result = ui.normalizeGuide(payload([
        channel('ZDF HD', 2), channel('Sender ohne Position', null), channel('Das Erste HD', 1),
    ]));
    assert.deepEqual(result.channels.map(item => item.name), ['Das Erste HD', 'ZDF HD', 'Sender ohne Position']);
    assert.ok(result.channels.every(item => item.events.length === 0));
    assert.equal(result.instance, 'loewe-tv.0');
    assert.equal(result.listName, 'ASTRA LCN');
});

test('guide keeps uncertain endings and rejects invalid, estimated or reversed event times', () => {
    const result = ui.normalizeGuide(payload([channel('one', 1, [
        event('unknown', START, null), { ...event('missing'), end: undefined }, event('valid'),
        event('reversed', START, START - 1), event('estimated', START, START + 1000, { endEstimated: true }),
        event('bad start', '18:00'), event('', START, START + 1000),
    ])]));
    assert.equal(result.invalidEvents, 4);
    assert.equal(result.channels[0].events.length, 3);
    assert.equal(result.channels[0].events.find(item => item.title === 'unknown').end, null);
    assert.equal(result.channels[0].events.find(item => item.title === 'missing').end, null);
    assert.equal(ui.isCurrent(result.channels[0].events.find(item => item.title === 'unknown'), NOW), false);
});

test('different end times stay separate so overlapping source evidence is not silently removed', () => {
    const result = ui.normalizeGuide(payload([channel('one', 1, [
        event('same', START, START + ui.HOUR), event('same', START, START + ui.HOUR / 2),
        event('same', START, START + ui.HOUR),
    ])]));
    assert.equal(result.channels[0].events.length, 2);
    assert.notEqual(result.channels[0].events[0].key, result.channels[0].events[1].key);
    assert.equal(ui.timelineLayout(result.channels[0].events, START, START + ui.HOUR, 300).lanes, 2);
});

test('event visibility uses half-open time boundaries and retains an unknown earlier start as a marker', () => {
    const events = [event('ended', START - ui.HOUR, START), event('overlaps', START - ui.HOUR, START + 1),
        event('inside'), event('future boundary', START + ui.HOUR, START + 2 * ui.HOUR),
        event('unknown before', START - ui.HOUR, null), event('unknown after', START + 2 * ui.HOUR, null)];
    assert.deepEqual(ui.visibleEvents(events, START, START + ui.HOUR).map(item => item.title),
        ['overlaps', 'inside', 'unknown before']);
    assert.equal(ui.isCurrent(event('ends now', START, NOW), NOW), false);
    assert.equal(ui.isCurrent(event('starts now', NOW, NOW + 1000), NOW), true);
});

test('timeline widths follow the real duration and only visible edges are clipped', () => {
    const events = [event('before', START - ui.HOUR, START + ui.HOUR / 2),
        event('middle', START + ui.HOUR / 2, START + ui.HOUR),
        event('after', START + ui.HOUR, START + 4 * ui.HOUR)];
    const result = ui.timelineLayout(events, START, START + 3 * ui.HOUR, 900);
    assert.deepEqual(result.items.map(item => [item.left, item.width]), [[0, 150], [150, 150], [300, 600]]);
    assert.equal(result.items[0].before, true);
    assert.equal(result.items[2].after, true);
    assert.equal(result.lanes, 1);
});

test('overlapping programmes get separate lanes and lanes can be reused afterwards', () => {
    const result = ui.timelineLayout([
        event('long', START, START + ui.HOUR), event('overlap', START + ui.HOUR / 4, START + ui.HOUR / 2),
        event('next', START + ui.HOUR, START + 2 * ui.HOUR),
    ], START, START + 3 * ui.HOUR, 900);
    assert.deepEqual(result.items.map(item => item.lane), [0, 1, 0]);
    assert.equal(result.lanes, 2);
});

test('unknown durations never expand to the next programme or the entire time window', () => {
    const result = ui.timelineLayout([
        event('unknown before', START - ui.HOUR, null), event('unknown', START + ui.HOUR, null),
        event('next', START + 2 * ui.HOUR, START + 3 * ui.HOUR),
    ], START, START + 6 * ui.HOUR, 1680);
    assert.equal(result.items[0].width, 160);
    assert.equal(result.items[0].left, 0);
    assert.equal(result.items[0].before, true);
    assert.equal(result.items[1].width, 160);
    assert.equal(result.items[1].event.end, null);
    assert.equal(ui.isCurrent(result.items[1].event, START + 90 * 60000), false);
});

test('date navigation stays in the server window and now includes a preceding half hour', () => {
    assert.deepEqual(ui.timeWindow(null, 3, NOW), {
        from: START - ui.HOUR / 2, to: START + 2.5 * ui.HOUR, hours: 3,
        minimum: START - ui.DAY + ui.HOUR / 2, maximum: START + 2 * ui.DAY - 3 * ui.HOUR,
    });
    for (const hours of [2, 3, 6]) {
        const past = ui.timeWindow(START - 7 * ui.DAY, hours, NOW);
        const future = ui.timeWindow(START + 7 * ui.DAY, hours, NOW);
        assert.ok(past.from >= NOW - ui.DAY);
        assert.ok(future.to <= NOW + 2 * ui.DAY);
        assert.equal(future.to - future.from, hours * ui.HOUR);
    }
    assert.equal(ui.timeWindow(null, '1000', NOW).hours, 3);
});

test('channel filtering accepts names, positions, spaces and German characters', () => {
    const channels = [channel('Das Erste HD', 1), channel('WDR Köln HD', 105), channel('ZDF HD', 2)];
    assert.deepEqual(ui.filterChannels(channels, '  wdr KÖLN ').map(item => item.number), [105]);
    assert.deepEqual(ui.filterChannels(channels, '105').map(item => item.name), ['WDR Köln HD']);
    assert.deepEqual(ui.filterChannels(channels, 'HD 2').map(item => item.name), ['ZDF HD']);
    assert.equal(ui.filterChannels(channels, '').length, 3);
    assert.equal(ui.filterChannels(channels, 'does not exist').length, 0);
});

test('keyboard navigation crosses channels without selecting a wrong time or empty row', () => {
    const guide = ui.normalizeGuide(payload([
        channel('one', 1, [event('one-a'), event('one-b', START + ui.HOUR, START + 2 * ui.HOUR)]),
        channel('empty', 2),
        channel('three', 3, [event('three-a', START - ui.HOUR, START + ui.HOUR / 2),
            event('three-b', START + ui.HOUR, START + 2 * ui.HOUR)]),
    ]));
    const rows = guide.channels.map(item => ({ channel: item, events: item.events }));
    const a = rows[0].events[0];
    const b = rows[0].events[1];
    assert.equal(ui.keyboardTarget(rows, 'one', a.key, 'ArrowRight').key, b.key);
    assert.equal(ui.keyboardTarget(rows, 'one', a.key, 'ArrowLeft').key, a.key);
    assert.equal(ui.keyboardTarget(rows, 'one', b.key, 'ArrowDown').title, 'three-b');
    assert.equal(ui.keyboardTarget(rows, 'three', rows[2].events[1].key, 'ArrowUp').key, b.key);
    assert.equal(ui.keyboardTarget(rows, 'one', b.key, 'Home').key, a.key);
    assert.equal(ui.keyboardTarget(rows, 'one', a.key, 'End').key, b.key);
    assert.equal(ui.keyboardTarget(rows, 'missing', a.key, 'ArrowDown'), null);
});

test('all static UI strings have German and English translations with matching substitutions', () => {
    assert.deepEqual(Object.keys(ui.MESSAGES.de).sort(), Object.keys(ui.MESSAGES.en).sort());
    for (const key of Object.keys(ui.MESSAGES.de)) {
        assert.deepEqual(ui.MESSAGES.de[key].match(/\{[a-z]+\}/giu)?.sort(), ui.MESSAGES.en[key].match(/\{[a-z]+\}/giu)?.sort(), key);
    }
    const html = fs.readFileSync(path.join(__dirname, '../admin/epg.html'), 'utf8');
    for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="([^"]+)"/gu)) {
        assert.ok(ui.MESSAGES.de[match[1]], match[1]);
        assert.ok(ui.MESSAGES.en[match[1]], match[1]);
    }
    assert.equal(ui.translate('en-US', 'minutes', { count: 30 }), '30 min');
    assert.equal(ui.translate('de', 'minutes', { count: 30 }), '30 Min.');
});

test('untrusted TV text remains data and the guide has no direct network or playback transport', () => {
    const hostile = '<img src=x onerror=alert(1)><script>unsafe()</script>';
    const result = ui.normalizeGuide(payload([channel(hostile, 1, [event(hostile, START, START + ui.HOUR, {
        description: `${hostile}\u0000`, subtitle: hostile,
    })])]));
    assert.equal(result.channels[0].name, hostile);
    assert.equal(result.channels[0].events[0].description, hostile);
    const code = fs.readFileSync(path.join(__dirname, '../admin/epg.js'), 'utf8');
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(/u);
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|ZapToMedia|streamingUrl|thumbnailUrl/iu);
    const html = fs.readFileSync(path.join(__dirname, '../admin/epg.html'), 'utf8');
    assert.doesNotMatch(html, /<(?:video|iframe|img)\b|(?:src|href)="https?:/iu);
});
