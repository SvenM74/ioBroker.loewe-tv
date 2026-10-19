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
    listName: 'ASTRA LCN', listView: 'selected-list', catalogRevision: 'verified-catalogue', status: 'ready', lastUpdate: NOW, connected: true, channels });

// Synthetic schema-1 journal snapshot, including metadata already persisted
// by earlier adapter versions. No live TV response is used by these tests.
function recordingSnapshot(overrides = {}) {
    return { schemaVersion: 1, ready: true, updatedAt: NOW, jobs: [{
        id: 'existing-recording', status: 'uncertain', createdAt: NOW - 3000, updatedAt: NOW,
        attempts: 1, sentAt: NOW - 2000, acknowledgedAt: NOW - 1000, confirmedAt: null,
        lastError: 'Die TV-Timerliste ist nicht vollständig vergleichbar.', canCancel: false,
        channel: { name: 'Das Erste', number: 1 },
        programme: { title: 'Sendung', start: NOW + ui.HOUR, end: NOW + 2 * ui.HOUR },
        ...overrides,
    }] };
}

// Minimal DOM event surface for image fallback behavior; it performs no image
// requests and adds no browser dependency to the normal adapter test suite.
function logoDocument() {
    return { createElement(tagName) {
        const listeners = new Map();
        const element = { tagName, children: [], hidden: false, sources: [], textContent: '',
            appendChild(child) { this.children.push(child); return child; },
            addEventListener(type, callback) { listeners.set(type, callback); },
            emit(type) { listeners.get(type)?.({ target: this }); },
        };
        Object.defineProperty(element, 'src', {
            get() { return this.sources.at(-1); },
            set(value) { this.sources.push(value); },
        });
        return element;
    } };
}

test('guide accepts known programme sources and a bounded event list', () => {
    for (const invalid of [null, {}, { ...payload([]), source: 'unknown' },
        { ...payload([]), schemaVersion: 2 }, { ...payload([]), now: 'today' },
        payload([channel('one', 1, Array.from({ length: 129 }, () => event('too many')))])]) {
        assert.throws(() => ui.normalizeGuide(invalid), /EPG_GUIDE_RESPONSE_INVALID/);
    }
    assert.equal(ui.normalizeGuide(payload([])).channels.length, 0);
    for (const source of ['tv', 'xmltv', 'mixed']) assert.equal(ui.normalizeGuide({ ...payload([]), source }).source, source);
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

test('channel logos retain only supported optional image sources without changing names or search', () => {
    const result = ui.normalizeGuide(payload([
        { ...channel('Das Erste HD', 1, []), logoUrl: 'http://192.0.2.10:905/channel.png', logoFallback: 'logos/das-erste.svg' },
        { ...channel('ZDF HD', 2, []), logoUrl: 'logos/zdf.svg', logoFallback: 'logos/ignored.svg' },
        { ...channel('Arte HD', 3, []), logoUrl: 'https://TV.example/channel.svg?size=small' },
        channel('Unknown station', 4, []),
    ]));
    assert.equal(result.channels[0].logoUrl, 'http://192.0.2.10:905/channel.png');
    assert.equal(result.channels[0].logoFallback, 'logos/das-erste.svg');
    assert.equal(result.channels[1].logoUrl, 'logos/zdf.svg');
    assert.equal(Object.hasOwn(result.channels[1], 'logoFallback'), false, 'A local logo does not need another fallback.');
    assert.equal(result.channels[2].logoUrl, 'https://tv.example/channel.svg?size=small');
    assert.equal(Object.hasOwn(result.channels[3], 'logoUrl'), false);
    assert.equal(Object.hasOwn(result.channels[3], 'logoFallback'), false);
    assert.equal(ui.filterChannels(result.channels, 'erste 1')[0].name, 'Das Erste HD');
});

test('unsafe, malformed and oversized logo addresses never enter the normalized guide', () => {
    for (const logoUrl of [undefined, null, 1, {}, '', 'javascript:alert(1)', 'data:image/svg+xml,test',
        'file:///tmp/logo.svg', '//tv.example/logo.svg', '/logos/zdf.svg', '../logos/zdf.svg',
        'logos/../zdf.svg', 'logos/%2e%2e/logo.svg', 'logos/zdf.svg?extra=1', 'logos/zdf.svg#extra',
        'logos/ZDF.svg', 'logos/zdf.png', 'logos\\zdf.svg', `logos/${'a'.repeat(81)}.svg`, 'http://tv.example\\logo.png',
        'http://user:password@tv.example/logo.png', 'http://@tv.example/logo.png', 'https:///logo.png',
        'https://tv.example/\nlogo.png', 'https://tv.example/logo.png ', 'https://tv.example/%5clogo.png',
        'https://tv.example/%0alogo.png', `https://tv.example/${'x'.repeat(2048)}`, `https://tv.example/${'ä'.repeat(400)}.svg`]) {
        const value = ui.normalizeGuide(payload([{ ...channel('Station', 1, []), logoUrl, logoFallback: 'logos/zdf.svg' }])).channels[0];
        assert.equal(Object.hasOwn(value, 'logoUrl'), false, String(logoUrl));
        assert.equal(Object.hasOwn(value, 'logoFallback'), false, 'A standalone fallback is not a valid primary image.');
    }
    for (const logoFallback of ['https://other.example/logo.svg', '../logo.svg', '//other/logo.svg', 'logos/logo.svg?x=1']) {
        const value = ui.normalizeGuide(payload([{ ...channel('Station', 1, []), logoUrl: 'http://192.0.2.10/logo.png', logoFallback }])).channels[0];
        assert.equal(value.logoUrl, 'http://192.0.2.10/logo.png');
        assert.equal(Object.hasOwn(value, 'logoFallback'), false);
    }
});

test('HTTPS pages skip HTTP TV logos and local assets keep the same relative path in either entry point', () => {
    const value = { logoUrl: 'http://192.0.2.10/logo.png', logoFallback: 'logos/das-erste.svg' };
    assert.deepEqual(ui.channelLogoSources(value, 'http:'), ['http://192.0.2.10/logo.png', 'logos/das-erste.svg']);
    assert.deepEqual(ui.channelLogoSources(value, 'https:'), ['logos/das-erste.svg']);
    assert.deepEqual(ui.channelLogoSources({ logoUrl: value.logoUrl }, 'https:'), []);
    assert.deepEqual(ui.channelLogoSources({ logoUrl: 'https://tv.example/logo.svg', logoFallback: value.logoFallback }, 'https:'),
        ['https://tv.example/logo.svg', 'logos/das-erste.svg']);
    for (const protocol of ['http:', 'https:']) {
        assert.deepEqual(ui.channelLogoSources({ logoUrl: 'logos/zdf.svg' }, protocol), ['logos/zdf.svg']);
    }
});

test('a logo retries only its one local fallback and then restores the full station name as text', () => {
    const document = logoDocument();
    const value = { name: 'Station <img src=x> & HD', logoUrl: 'http://192.0.2.10/logo.png', logoFallback: 'logos/das-erste.svg' };
    const identity = ui.createChannelIdentity(document, value, 'http:');
    const [label, logo] = identity.children;
    assert.equal(label.textContent, value.name);
    assert.equal(identity.title, value.name);
    assert.equal(logo.alt, value.name);
    assert.equal(logo.title, value.name);
    assert.equal(logo.loading, 'lazy');
    assert.equal(logo.referrerPolicy, 'no-referrer');
    assert.equal(logo.width, 48);
    assert.equal(logo.height, logo.width, 'The image reserves a square before CSS and source loading.');
    assert.equal(label.hidden, true);
    assert.deepEqual(logo.sources, [value.logoUrl]);
    logo.emit('error');
    assert.deepEqual(logo.sources, [value.logoUrl, value.logoFallback]);
    assert.equal(label.hidden, true);
    logo.emit('error');
    assert.equal(logo.hidden, true);
    assert.equal(label.hidden, false);
    logo.emit('error');
    assert.equal(logo.sources.length, 2, 'Repeated error events cannot create a retry loop.');

    const secure = ui.createChannelIdentity(document, value, 'https:');
    assert.deepEqual(secure.children[1].sources, [value.logoFallback]);
    secure.children[1].emit('error');
    assert.equal(secure.children[0].hidden, false);
    assert.equal(secure.children[1].hidden, true);
    for (const plain of [{ name: value.name }, { name: value.name, logoUrl: value.logoUrl }, { name: value.name, logoUrl: 'javascript:alert(1)' }]) {
        const node = ui.createChannelIdentity(document, plain, 'https:');
        assert.equal(node.children.length, 1);
        assert.equal(node.children[0].textContent, value.name);
        assert.equal(node.children[0].hidden, false);
    }
});

test('logo and text fallback share a fixed square inside the desktop and mobile channel heading', () => {
    // Read the actual stylesheet and created DOM classes. This checks the
    // declared box geometry and breakpoint cascade, not browser rendering.
    const css = fs.readFileSync(path.join(__dirname, '../admin/epg.css'), 'utf8');
    const declarations = (source, selector) => Object.fromEntries(
        [...source.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
            .filter(([, selectors]) => selectors.split(',').some(value => value.trim() === selector))
            .flatMap(([, , body]) => body.split(';').filter(value => value.includes(':')).map(value => {
                const colon = value.indexOf(':');
                return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
            })));
    for (const viewport of [300, 640, 641, 1280]) {
        const active = css.replace(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)^\}/gmu,
            (_, maximum, body) => viewport <= Number(maximum) ? body : '');
        const style = selector => declarations(active, selector);
        const variables = style(':root');
        const pixels = value => {
            const resolved = value?.replace(/var\((--[a-z-]+)\)/gu, (_, name) => variables[name]);
            assert.match(resolved || '', /^\d+px$/u, `A definite size is required: ${value}`);
            return Number.parseInt(resolved, 10);
        };
        const identity = ui.createChannelIdentity(logoDocument(), {
            name: 'Synthetic long station name HD', logoUrl: 'logos/zdf.svg',
        }, 'https:');
        const frame = style(`.${identity.className}`);
        const [label, image] = identity.children;
        const imageStyle = style(`.${image.className}`);
        const frameWidth = pixels(frame.width);
        const frameHeight = pixels(frame.height);
        assert.equal(frameWidth, viewport <= 640 ? 44 : 48);
        assert.equal(frameHeight, frameWidth, `Square logo frame at viewport ${viewport}`);
        assert.equal(frame.flex, '0 0 var(--channel-logo-size)', 'Flex layout cannot grow or shrink the square.');
        assert.equal(frame.background, '#f1f3f6');
        assert.equal(style('*')['box-sizing'], 'border-box');
        assert.equal(imageStyle.width, '100%');
        assert.equal(imageStyle.height, '100%');
        assert.equal(imageStyle['object-fit'], 'contain');
        assert.equal(style(`.${label.className}`)['overflow-wrap'], 'anywhere');
        assert.equal(style('[hidden]').display, 'none !important', 'Only the image or its name fallback occupies the frame.');

        const button = style('.channel-button');
        const [verticalPadding, horizontalPadding] = button.padding.split(/\s+/u).map(pixels);
        assert.ok(frameHeight + 2 * verticalPadding <= pixels(button['min-height']), 'The square fits the existing programme row.');
        assert.ok(frameWidth + 2 * horizontalPadding + pixels(button.gap) + pixels(style('.channel-number')['min-width'])
            < pixels(variables['--station-width']), 'The station number keeps its own space next to the square.');

        image.emit('error');
        assert.equal(image.hidden, true);
        assert.equal(label.hidden, false);
        assert.equal(label.textContent, identity.title);
        assert.deepEqual(style(`.${identity.className}`), frame, 'A failed logo keeps exactly the same frame.');
        const noLogo = ui.createChannelIdentity(logoDocument(), { name: identity.title }, 'https:');
        assert.equal(noLogo.children.length, 1);
        assert.deepEqual(style(`.${noLogo.className}`), frame, 'A station without a logo uses the same square.');
    }
});

test('manual, TV, registry and XMLTV logos fail over in order and HTTPS never loads an insecure alternative', () => {
    const manual = 'https://manual.example/station.svg';
    const tv = 'http://192.0.2.10/channel.png';
    const registry = 'https://raw.githubusercontent.com/tv-logo/tv-logos/pinned/channel.png';
    const xmltv = 'https://guide.example/station.png';
    const bundled = 'logos/zdf.svg';
    const cases = [
        { protocol: 'http:', primary: manual, alternatives: [tv, registry, xmltv], expected: [manual, tv, registry, xmltv, bundled] },
        { protocol: 'https:', primary: tv, alternatives: [registry, xmltv], expected: [registry, xmltv, bundled] },
        { protocol: 'https:', primary: manual, alternatives: [tv, registry, xmltv, 'https://ignored.example/extra.png'],
            expected: [manual, registry, xmltv, bundled] },
        { protocol: 'http:', primary: manual, alternatives: [tv, xmltv], expected: [manual, tv, xmltv, bundled] },
        { protocol: 'https:', primary: manual, alternatives: [tv, xmltv], expected: [manual, xmltv, bundled] },
        { protocol: 'https:', primary: 'http://manual.example/station.svg', alternatives: [tv, xmltv], expected: [xmltv, bundled] },
        { protocol: 'https:', primary: manual, alternatives: [manual, xmltv], expected: [manual, xmltv, bundled] },
        { protocol: 'https:', primary: manual, alternatives: ['data:image/svg+xml,test', '//other.example/image.png', xmltv],
            expected: [manual, xmltv, bundled] },
    ];
    for (const { protocol, primary, alternatives, expected } of cases) {
        const original = { ...channel('Fixture station HD', 1), logoUrl: primary,
            logoAlternatives: alternatives, logoFallback: bundled };
        const normalized = ui.normalizeGuide(payload([original])).channels[0];
        const identity = ui.createChannelIdentity(logoDocument(), normalized, protocol);
        const [label, image] = identity.children;
        assert.equal(label.textContent, original.name);
        assert.deepEqual(image.sources, expected.slice(0, 1));
        for (let i = 0; i < expected.length; i++) {
            assert.equal(image.hidden, false, `Image ${i + 1} must remain visible until it fails`);
            assert.equal(label.hidden, true);
            image.emit('error');
            assert.deepEqual(image.sources, expected.slice(0, i + 2));
        }
        assert.equal(image.hidden, true);
        assert.equal(label.hidden, false);
        image.emit('error');
        assert.deepEqual(image.sources, expected, 'No exhausted, duplicate or unbounded candidate is retried');
        if (protocol === 'https:') assert.ok(image.sources.every(url => !url.startsWith('http:')));
        assert.deepEqual(original.logoAlternatives, alternatives, 'Normalization must not rewrite the source snapshot');
    }
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

test('untrusted TV text remains data and the guide has no TV-command or playback transport', () => {
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

test('programme actions use half-open times and never execute without a known ending', () => {
    assert.equal(ui.programmeAction(event('current'), NOW), 'view');
    assert.equal(ui.programmeAction(event('starts now', NOW, NOW + 1), NOW), 'view');
    assert.equal(ui.programmeAction(event('future', NOW + 1, NOW + ui.HOUR), NOW), 'record');
    assert.equal(ui.programmeAction(event('ends now', START, NOW), NOW), 'ended');
    assert.equal(ui.programmeAction(event('past', START - ui.HOUR, START), NOW), 'ended');
    for (const end of [null, undefined, START, START - 1, 'unknown']) {
        assert.equal(ui.programmeAction({ ...event('unknown'), end }, NOW), 'unknownEnd');
    }
    assert.equal(ui.programmeAction(event('unavailable'), NOW, false), 'unavailable');
    assert.equal(ui.programmeAction(null, NOW), 'unavailable');
    assert.equal(ui.programmeAction(event('invalid clock'), 'now'), 'unavailable');
});

test('programme selection contains identity references and no client-supplied tuning or recording fields', () => {
    const guide = ui.normalizeGuide(payload([channel('channels.tv.eins', 1, [event('one')])]));
    const selected = guide.channels[0];
    const reference = ui.programmeSelection(guide, selected, selected.events[0]);
    assert.deepEqual(reference, { channelId: 'channels.tv.eins', eventId: 'one', start: START, end: START + ui.HOUR,
        listView: 'selected-list', catalogRevision: 'verified-catalogue' });
    assert.equal(ui.programmeSelection({ ...guide, catalogRevision: '' }, selected, selected.events[0]), null);
    assert.equal(ui.programmeSelection(guide, selected, { ...selected.events[0], end: null }), null);
    assert.equal(ui.selectionExists(guide, reference), true);
    for (const change of [{ listView: 'other' }, { catalogRevision: 'other-tv' }, { eventId: 'other-event' },
        { start: START + 1 }, { end: START + 2 * ui.HOUR }, { channelId: 'channels.tv.other' }]) {
        assert.equal(ui.selectionExists(guide, { ...reference, ...change }), false);
    }
    selected.available = false;
    assert.equal(ui.selectionExists(guide, reference), false);
});

test('recording confirmation must echo the exact selected channel, list revision and programme times', () => {
    const guide = ui.normalizeGuide(payload([channel('channels.tv.eins', 1, [event('future', NOW + ui.HOUR, NOW + 2 * ui.HOUR)])]));
    const selected = guide.channels[0];
    const reference = ui.programmeSelection(guide, selected, selected.events[0]);
    const response = { action: 'confirmRecording', selection: { ...reference },
        channel: { name: '<img src=x>', number: 1 }, programme: { title: '<script>data</script>', start: reference.start, end: reference.end } };
    const normalized = ui.normalizeAction(response, reference);
    assert.equal(normalized.channel.name, '<img src=x>');
    assert.equal(normalized.programme.title, '<script>data</script>');
    assert.deepEqual(normalized.selection, reference);
    assert.notEqual(normalized.selection, response.selection);
    for (const invalid of [null, {}, { action: 'recorded' }, { ...response, selection: undefined },
        { ...response, selection: { ...reference, channelId: 'channels.tv.other' } },
        { ...response, selection: { ...reference, catalogRevision: 'different-tv' } },
        { ...response, programme: { ...response.programme, end: null } },
        { ...response, programme: { ...response.programme, start: reference.start + 1 } }]) {
        assert.throws(() => ui.normalizeAction(invalid, reference), /EPG_PROGRAMME_RESPONSE_INVALID/);
    }
    assert.equal(ui.normalizeAction({ action: 'switched' }, reference).action, 'switched');
    assert.equal(ui.normalizeAction({ action: 'unavailable', message: 'Abgelaufen' }, reference).message, 'Abgelaufen');
    assert.throws(() => ui.normalizeAction({ action: 'recordingQueued', job: {} }, reference), /EPG_PROGRAMME_RESPONSE_INVALID/);
    assert.equal(ui.normalizeAction({ action: 'recordingQueued', job: { id: 'saved-job', status: 'queued',
        channel: response.channel, programme: response.programme } }, reference).job.id, 'saved-job');
});

test('recording snapshots preserve server status and allow cancellation only for explicitly cancellable unsent jobs', () => {
    const statuses = ['queued', 'sending', 'uncertain', 'scheduled', 'rejected', 'missed', 'cancelled', 'blockedDevice', 'unexpected'];
    const raw = { schemaVersion: 1, ready: true, updatedAt: NOW, jobs: statuses.map((status, index) => ({
        id: `job-${index}`, status, canCancel: true, createdAt: NOW + index, channel: { name: 'Das Erste', number: 1 },
        programme: { title: 'Sendung', start: NOW + ui.HOUR, end: NOW + 2 * ui.HOUR },
    })) };
    const result = ui.normalizeRecordings(raw);
    assert.equal(result.ready, true);
    assert.equal(result.jobs.length, 9);
    assert.deepEqual(result.jobs.filter(job => job.canCancel).map(job => job.status).sort(), ['blockedDevice', 'queued']);
    assert.equal(result.jobs.find(job => job.id === 'job-8').status, 'unknown');
    assert.equal(result.jobs.find(job => job.id === 'job-3').status, 'scheduled');
    assert.equal(ui.normalizeRecordings({ ...raw, jobs: [{ ...raw.jobs[0], canCancel: false }] }).jobs[0].canCancel, false);
});

test('existing acknowledged journal snapshots show transfer separately without rewriting their status', () => {
    const raw = recordingSnapshot({ canCancel: true });
    const before = JSON.stringify(raw);
    const job = ui.normalizeRecordings(raw).jobs[0];
    assert.equal(job.acknowledgedAt, NOW - 1000);
    assert.equal(job.status, 'uncertain');
    assert.equal(job.canCancel, false);
    assert.equal(job.lastError, raw.jobs[0].lastError, 'Timer diagnostics remain available.');
    assert.deepEqual(ui.recordingPresentation(job), {
        status: 'transferred', labelKey: 'recordingTransferred', noteKey: 'recordingTransferredNote',
        mutedNote: true, collapseDiagnostic: true,
    });
    assert.deepEqual(ui.normalizeRecordings(JSON.parse(before)).jobs[0], job, 'Reloading the same journal needs no migration.');
    assert.equal(JSON.stringify(raw), before, 'Display must not change the journal snapshot.');
    const clockCorrected = ui.normalizeRecordings(recordingSnapshot({ acknowledgedAt: NOW - 4000 })).jobs[0];
    assert.equal(clockCorrected.acknowledgedAt, NOW - 4000);
    assert.equal(ui.recordingPresentation(clockCorrected).status, 'transferred', 'A clock correction may put the reply time before the send time.');
});

test('missing, zero, coerced or contradictory recording metadata never proves a TV reply', () => {
    for (const acknowledgedAt of [undefined, null, 0, '', String(NOW), NaN, Infinity, -1,
        NOW + 0.5, 946684799999, 4102444800000, [], {}]) {
        const job = ui.normalizeRecordings(recordingSnapshot({ acknowledgedAt })).jobs[0];
        assert.equal(job.acknowledgedAt, null);
        const presentation = ui.recordingPresentation(job);
        assert.equal(presentation.status, 'uncertain');
        assert.equal(presentation.noteKey, 'recordingUncertainNote');
        assert.equal(presentation.collapseDiagnostic, false);
        assert.equal(presentation.mutedNote, false);
    }
    for (const patch of [
        { attempts: 0, sentAt: null }, { attempts: 0 }, { attempts: undefined }, { attempts: 2 }, { attempts: '1' },
        { sentAt: null }, { sentAt: undefined }, { sentAt: 0 }, { sentAt: String(NOW) }, { sentAt: NaN },
    ]) {
        const job = ui.normalizeRecordings(recordingSnapshot(patch)).jobs[0];
        assert.equal(job.acknowledgedAt, null, 'A reply timestamp requires complete, valid send metadata.');
        assert.equal(job.notSent, false, 'Contradictory reply metadata does not prove that no request was sent.');
        const presentation = ui.recordingPresentation(job);
        assert.equal(presentation.status, 'uncertain');
        assert.equal(presentation.noteKey, 'recordingUncertainNote');
        assert.equal(presentation.collapseDiagnostic, false);
    }
});

test('an uncertain job is described as unsent only with complete explicit journal evidence', () => {
    const unsent = { attempts: 0, sentAt: null, acknowledgedAt: null };
    const job = ui.normalizeRecordings(recordingSnapshot({ ...unsent, canCancel: true })).jobs[0];
    assert.equal(job.notSent, true);
    assert.equal(job.status, 'uncertain');
    assert.equal(job.canCancel, false, 'Presentation must not grant new cancellation rights.');
    assert.deepEqual(ui.recordingPresentation(job), {
        status: 'timerPending', labelKey: 'recordingTimerPending', noteKey: 'recordingTimerPendingNote',
        mutedNote: true, collapseDiagnostic: false,
    });
    for (const patch of [
        { attempts: undefined }, { attempts: '0' }, { attempts: 1 },
        { sentAt: undefined }, { sentAt: 0 }, { sentAt: NOW }, { sentAt: 'null' },
        { acknowledgedAt: undefined }, { acknowledgedAt: 0 }, { acknowledgedAt: NaN },
    ]) {
        const ambiguous = ui.normalizeRecordings(recordingSnapshot({ ...unsent, ...patch, notSent: true })).jobs[0];
        assert.equal(ambiguous.notSent, false, 'Incomplete metadata and supplied UI flags cannot prove no attempt.');
        assert.equal(ui.recordingPresentation(ambiguous).status, 'uncertain');
    }
});

test('TV replies never override a rejection or turn programme times into recording progress', () => {
    for (const status of ['queued', 'sending', 'scheduled', 'rejected', 'missed', 'cancelled', 'blockedDevice']) {
        const job = ui.normalizeRecordings(recordingSnapshot({ status })).jobs[0];
        const presentation = ui.recordingPresentation(job);
        assert.equal(presentation.status, status, status);
        assert.equal(presentation.noteKey, null, status);
        assert.equal(presentation.collapseDiagnostic, false, status);
    }
    for (const [start, end] of [
        [NOW + ui.HOUR, NOW + 2 * ui.HOUR], [NOW - ui.HOUR, NOW + ui.HOUR], [NOW - 2 * ui.HOUR, NOW - ui.HOUR],
    ]) {
        const raw = recordingSnapshot({ programme: { title: 'Sendung', start, end } });
        const job = ui.normalizeRecordings(raw).jobs[0];
        assert.equal(job.status, 'uncertain');
        assert.equal(ui.recordingPresentation(job).status, 'transferred', 'Start and end times do not prove recording activity.');
        raw.jobs[0].status = 'scheduled';
        raw.jobs[0].confirmedAt = NOW;
        raw.jobs[0].lastError = '';
        const confirmed = ui.recordingPresentation(ui.normalizeRecordings(raw).jobs[0]);
        assert.equal(confirmed.status, 'scheduled');
        assert.equal(confirmed.noteKey, null, 'A subsequent timer confirmation removes the pending note.');
    }
});

test('acknowledged pending jobs stay ahead of completed history and survive programme-action normalization', () => {
    const raw = recordingSnapshot();
    const selected = raw.jobs[0];
    raw.jobs.push(...Array.from({ length: 35 }, (_, index) => ({
        ...selected, id: `confirmed-${index}`, status: 'scheduled', createdAt: NOW + index,
    })));
    const jobs = ui.normalizeRecordings(raw).jobs;
    assert.equal(jobs.length, 36);
    assert.equal(jobs[0].id, selected.id, 'Open timer confirmation remains visible before the 30-row display limit.');
    assert.equal(jobs[0].status, 'uncertain');
    const result = ui.normalizeAction({ action: 'recordingQueued', job: selected }, selected.programme);
    assert.equal(result.job.acknowledgedAt, selected.acknowledgedAt);
    assert.equal(result.job.canCancel, false);
    assert.equal(ui.recordingPresentation(result.job).status, 'transferred');
});

test('transfer explanations and timer diagnostics are available in both languages and retain plain text', () => {
    const diagnosis = 'Timer <img src=x onerror=alert(1)> & <script>data</script>\u0000';
    const job = ui.normalizeRecordings(recordingSnapshot({ lastError: diagnosis })).jobs[0];
    const presentation = ui.recordingPresentation(job);
    assert.equal(job.lastError, diagnosis.replace('\u0000', ''));
    assert.equal(presentation.collapseDiagnostic, true);
    assert.equal(ui.translate('de', presentation.labelKey), 'An TV übertragen');
    assert.equal(ui.translate('en', presentation.labelKey), 'Transferred to TV');
    assert.equal(ui.translate('de', presentation.noteKey), 'Der Fernseher hat auf den Aufnahmeauftrag geantwortet. Die automatische Bestätigung über die Timerliste steht noch aus.');
    assert.equal(ui.translate('en', presentation.noteKey), 'The TV has replied to the recording request. Automatic confirmation through the timer list is still pending.');
    assert.equal(ui.translate('de', 'recordingTimerDetails'), 'Details zum Timerabgleich');
    assert.equal(ui.translate('en', 'recordingTimerDetails'), 'Timer check details');
});

test('recording snapshots reject oversized responses, strip controls and keep invalid entries out of the actionable list', () => {
    const job = { id: 'one', status: 'queued', canCancel: true,
        channel: { name: 'Sender\u0000<img src=x>', number: 0 },
        programme: { title: '<script>data</script>', start: NOW, end: NOW + ui.HOUR }, lastError: 'X'.repeat(5000) };
    const payload = { schemaVersion: 1, ready: false, jobs: [job, { ...job }, { ...job, id: 'no-end', programme: { ...job.programme, end: null } }] };
    const result = ui.normalizeRecordings(payload);
    assert.equal(result.ready, false);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].channel.name, 'Sender<img src=x>');
    assert.equal(result.jobs[0].lastError.length, 800);
    assert.equal(result.jobs[0].channel.number, 0);
    for (const invalid of [null, {}, { ...payload, schemaVersion: 2 }, { ...payload, jobs: 'jobs' },
        { ...payload, jobs: Array(513).fill(job) }]) assert.throws(() => ui.normalizeRecordings(invalid), /EPG_RECORDINGS_RESPONSE_INVALID/);
});

test('programme and refresh actions sit between duration and search with an accessible compact selection', () => {
    const html = fs.readFileSync(path.join(__dirname, '../admin/epg.html'), 'utf8');
    const controls = html.match(/<section class="guide-controls"[^>]*>([\s\S]*?)<\/section>/u)?.[1];
    assert.ok(controls, 'The common toolbar must be present.');
    const positions = ['guideDuration', 'programmeAction', 'refreshGuide', 'channelSearch']
        .map(id => controls.indexOf(`id="${id}"`));
    assert.ok(positions.every(position => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'DOM order keeps keyboard access consistent with the toolbar.');
    for (const id of ['programmeAction', 'refreshGuide']) {
        assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'gu'))].length, 1, `${id} must not be duplicated.`);
    }
    assert.match(controls, /id="programmeAction"[^>]+aria-describedby="selectionSummary programmeActionHint"/u);
    const selection = html.match(/<section class="programme-selection"[^>]*>([\s\S]*?)<\/section>/u)?.[1];
    assert.ok(selection);
    for (const id of ['selectionSummary', 'detailChannel', 'programmeTitle', 'detailTimes', 'programmeActionHint', 'actionStatus']) {
        assert.ok(selection.includes(`id="${id}"`), `The compact selection must retain ${id}.`);
    }
    const description = selection.match(/<details\b[^>]*id="programmeDescription"[^>]*>/u)?.[0];
    assert.ok(description, 'Programme descriptions remain available without a large permanent detail panel.');
    assert.doesNotMatch(description, /\sopen(?:\s|=|>)/u);
    assert.doesNotMatch(html, /id="(?:programmeDetail|detailNumber|detailStation|detailProgress|detailProgressBar|openStandalone)"/u);
    assert.match(html, /<dialog[^>]+id="recordingDialog"/u);
    assert.match(html, /id="recordingsList"/u);
});

test('every element used by the mounted guide remains present after the detail-panel removal', () => {
    const html = fs.readFileSync(path.join(__dirname, '../admin/epg.html'), 'utf8');
    const code = fs.readFileSync(path.join(__dirname, '../admin/epg.js'), 'utf8');
    const names = new Set([...code.matchAll(/\belements\.([a-zA-Z][a-zA-Z0-9]*)/gu)].map(match => match[1]));
    for (const name of names) assert.ok(html.includes(`id="${name}"`), `Missing mounted element: ${name}`);
});

test('the retained standalone URL helper validates Admin URLs while the old UI button is absent', () => {
    assert.equal(ui.standaloneUrl('https://iobroker.example:8081/proxy/admin/adapter/loewe-tv/epg.html?instance=12&extra=private#details'),
        'https://iobroker.example:8081/proxy/admin/adapter/loewe-tv/epg.html?instance=12');
    assert.equal(ui.standaloneUrl('http://iobroker.local:8081/adapter/loewe-tv/epg.html?instance=0'),
        'http://iobroker.local:8081/adapter/loewe-tv/epg.html?instance=0');
    for (const invalid of ['javascript:alert(1)', '/adapter/loewe-tv/epg.html?instance=0',
        'https://user:password@example.com/adapter/loewe-tv/epg.html?instance=0',
        'https://example.com/adapter/other/epg.html?instance=0',
        'https://example.com/adapter/loewe-tv/epg.html',
        'https://example.com/adapter/loewe-tv/epg.html?instance=0&instance=1',
        'https://example.com/adapter/loewe-tv/epg.html?instance=-1',
        'https://example.com/adapter/loewe-tv/epg.html?instance=null']) assert.equal(ui.standaloneUrl(invalid), '');
    const html = fs.readFileSync(path.join(__dirname, '../admin/epg.html'), 'utf8');
    assert.doesNotMatch(html, /id="openStandalone"/u);
    assert.match(html, /<dialog[^>]+id="recordingDialog"/u);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../admin/epg.js'), 'utf8'), /window\.confirm\s*\(|window\.alert\s*\(/u);
});
