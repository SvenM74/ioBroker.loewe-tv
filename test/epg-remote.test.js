'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const remote = require('../admin/epg-remote');
const { KEYS } = require('../lib/loewe-client');

const reply = (key, status = 'sent', instance = 'loewe-tv.3') => ({ ok: true, key, status, instance });
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

// Minimal DOM/event model for the remote's own lifecycle. Native modal focus
// exclusion is modelled explicitly; this does not claim a real browser/TV test.
class EventSurface {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, listener) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(listener);
    }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    emit(name, event = {}) {
        event.target ||= this;
        event.preventDefault ||= function () { this.defaultPrevented = true; };
        event.stopPropagation ||= function () { this.propagationStopped = true; };
        for (const listener of this.listeners.get(name) || []) listener(event);
        return event;
    }
}
class Element extends EventSurface {
    constructor(document, tagName) {
        super();
        this.ownerDocument = document;
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentElement = null;
        this.attributes = new Map();
        this.dataset = {};
        this.style = { overflow: '' };
        this.hidden = false;
        this.disabled = false;
        this.inert = false;
        this.open = false;
        this.className = '';
        this._text = '';
        this.classList = {
            contains: name => this.className.split(/\s+/u).includes(name),
            toggle: (name, enabled) => {
                const values = new Set(this.className.split(/\s+/u).filter(Boolean));
                if (enabled) values.add(name); else values.delete(name);
                this.className = [...values].join(' ');
            },
        };
    }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(_value) { throw new Error('Remote content must be created as text or DOM nodes.'); }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentElement?.isConnected); }
    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'open') this.open = true;
        if (name === 'id') this.id = String(value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); if (name === 'open') this.open = false; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    focus() {
        const doc = this.ownerDocument;
        if (doc.modal && !doc.modal.contains(this)) return;
        for (let node = this; node; node = node.parentElement) if (node.inert) return;
        doc.activeElement = this;
        doc.emit('focusin', { target: this });
    }
    click() { if (!this.disabled) this.emit('click'); }
    showModal() { this.setAttribute('open', ''); this.ownerDocument.modal = this; }
    close() { this.removeAttribute('open'); this.ownerDocument.modal = null; this.emit('close'); }
}
function allNodes(node) { return [node, ...node.children.flatMap(allNodes)]; }
function keyboard(key, target, overrides = {}) {
    // KeyboardEvent properties are inherited and are not copied by {...event}.
    const properties = { key, repeat: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
        isComposing: false, ...overrides };
    const prototype = {};
    for (const [name, value] of Object.entries(properties)) Object.defineProperty(prototype, name, { get: () => value });
    return Object.assign(Object.create(prototype), { target });
}
function harness(options = {}) {
    const document = new EventSurface();
    document.body = new Element(document, 'body');
    document.hidden = false;
    document.createElement = tagName => new Element(document, tagName);
    document.createElementNS = (_namespace, tagName) => document.createElement(tagName);
    document.getElementById = id => allNodes(document.body).find(node => node.id === id) || null;
    document.defaultView = new EventSurface();
    const window = document.defaultView;
    window.navigator = { language: options.language || 'de-DE' };
    let now = 0;
    window.performance = { now: () => now };
    const add = (parent, tag, id) => {
        const element = document.createElement(tag);
        element.id = id;
        parent.appendChild(element);
        return element;
    };
    const main = add(document.body, 'main', 'epgGuide');
    const trigger = add(main, 'button', 'openRemote');
    add(trigger, 'span', 'remoteOpenLabel');
    const search = add(main, 'input', 'channelSearch');
    const recording = add(document.body, 'dialog', 'recordingDialog');
    const dialog = add(document.body, 'dialog', 'remoteDialog');
    for (const [tag, id] of [['h2', 'remoteTitle'], ['p', 'remoteTarget'], ['button', 'closeRemote']]) add(dialog, tag, id);
    const device = add(dialog, 'div', 'remoteDevice');
    add(device, 'div', 'remoteKeys');
    for (const id of ['remoteKeyboardHelp', 'remoteStatus', 'remoteQueueCount']) add(dialog, 'p', id);
    if (options.fallback) { dialog.showModal = undefined; dialog.close = undefined; }
    const calls = [];
    let instance = options.instance || 'loewe-tv.3';
    const bridge = {
        language: options.language || 'de',
        getInstance() { if (options.invalidTarget) throw new Error('Invalid page target'); return instance; },
        async sendRemoteCommand(key) { calls.push(key); return options.send ? options.send(key) : reply(key, 'sent', instance); },
        requestGuide() { throw new Error('Remote must not depend on EPG data.'); },
    };
    if (!options.missingBridge) window.LoeweEpgBridge = bridge;
    document.activeElement = trigger;
    const controller = remote.mount(document);
    const key = value => allNodes(dialog).find(node => node.dataset.remoteKey === value);
    const get = id => document.getElementById(id);
    const press = (value, eventOptions, target = document.activeElement) => document.emit('keydown', keyboard(value, target, eventOptions));
    return { document, window, main, trigger, search, recording, dialog, calls, bridge, controller, key, get, press,
        setInstance(value) { instance = value; }, setTime(value) { now = value; } };
}

test('remote entry point loads locally and remains outside EPG availability conditions', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin', 'epg.html'), 'utf8');
    assert.match(html, /<script src="epg-remote\.js" defer><\/script>/u);
    const entry = html.match(/<button[^>]+id="openRemote"[^>]*>/u)?.[0];
    assert.ok(entry);
    assert.doesNotMatch(entry, /\b(?:disabled|hidden)\b/u);
    assert.match(entry, /aria-haspopup="dialog"/u);
    assert.match(entry, /aria-controls="remoteDialog"/u);
    assert.ok(html.indexOf('id="refreshGuide"') < html.indexOf('id="openRemote"'));
    assert.ok(html.indexOf('id="openRemote"') < html.indexOf('id="channelSearch"'));
    assert.match(html, /<dialog[^>]+id="remoteDialog"[^>]+aria-labelledby="remoteTitle"/u);
    assert.match(html, /<dialog[^>]+id="remoteDialog"[^>]+aria-modal="true"/u);
    assert.match(html, /id="remoteStatus"[^>]+role="status"[^>]+aria-live="polite"/u);
});

test('every displayed command has a real backend key and accessible DE/EN labels', () => {
    assert.equal(new Set(remote.REMOTE_KEYS).size, remote.REMOTE_KEYS.length);
    for (const key of remote.REMOTE_KEYS) {
        assert.ok(Object.hasOwn(KEYS, key), `Missing real protocol key: ${key}`);
        for (const language of ['de', 'en']) assert.ok(remote.keyLabel(language, key), `${language}: ${key}`);
    }
    for (const key of ['power_all_code', 'epg_alt', 'back', 'stb', 'video', 'audio', 'star', 'input', 'bogus']) {
        assert.equal(remote.REMOTE_KEYS.includes(key), false, key);
    }
    for (const language of ['de-DE', 'en-GB']) {
        const view = harness({ language });
        const actual = allNodes(view.dialog).filter(node => node.dataset.remoteKey).map(node => node.dataset.remoteKey);
        assert.deepEqual(actual.sort(), [...remote.REMOTE_KEYS].sort());
        for (const key of remote.REMOTE_KEYS) {
            assert.equal(view.key(key).getAttribute('aria-label'), remote.keyLabel(language, key));
            assert.equal(view.key(key).title, remote.keyLabel(language, key));
        }
        assert.equal(view.key('back_step').textContent, 'BACK');
        assert.equal(view.key('record').title, language.startsWith('de') ? 'Direktaufnahme am TV' : 'Direct recording on the TV');
        assert.equal(view.key('dr_archive').title, language.startsWith('de') ? 'DR+-Archiv öffnen' : 'Open DR+ archive');
        assert.equal(view.get('remoteOpenLabel').textContent, language.startsWith('de') ? 'Fernbedienung' : 'Remote control');
        view.controller.destroy();
    }
});

test('rapid number presses are bounded and reach the TV once in their original order', async () => {
    const first = deferred();
    const calls = [];
    const events = [];
    const queue = remote.createCommandQueue(key => {
        calls.push(key);
        return calls.length === 1 ? first.promise : Promise.resolve(reply(key));
    }, event => events.push(event));
    for (const key of ['digit_1', 'digit_2', 'digit_3', 'digit_4', 'digit_5', 'digit_6']) assert.equal(queue.enqueue(key), true);
    assert.equal(queue.enqueue('digit_7'), false);
    assert.deepEqual(calls, ['digit_1']);
    assert.deepEqual(queue.snapshot(), { active: 'digit_1', queued: remote.MAX_PENDING - 1 });
    assert.equal(events.at(-1).type, 'full');
    first.resolve(reply('digit_1'));
    await flush();
    assert.deepEqual(calls, ['digit_1', 'digit_2', 'digit_3', 'digit_4', 'digit_5', 'digit_6']);
    assert.deepEqual(queue.snapshot(), { active: null, queued: 0 });
    assert.equal(queue.enqueue('constructor'), false);
});

test('a lost reply discards all waiting keys and cannot replay them after the connection recovers', async () => {
    const first = deferred();
    const calls = [];
    const events = [];
    const queue = remote.createCommandQueue(key => {
        calls.push(key);
        return calls.length === 1 ? first.promise : Promise.resolve(reply(key));
    }, event => events.push(event));
    for (const key of ['digit_1', 'digit_2', 'digit_3']) queue.enqueue(key);
    first.reject(Object.assign(new Error('lost reply'), { delivery: 'unknown' }));
    await flush();
    assert.deepEqual(calls, ['digit_1']);
    assert.equal(events.at(-1).type, 'failed');
    assert.equal(events.at(-1).discarded, 2);
    await flush();
    assert.deepEqual(calls, ['digit_1']);
    queue.enqueue('mute');
    await flush();
    assert.deepEqual(calls, ['digit_1', 'mute'], 'Only the next explicit press may start a new request.');
});

test('stale number sequences are discarded in full, including a newer tail digit', async () => {
    let now = 0;
    const first = deferred();
    const calls = [];
    const events = [];
    const queue = remote.createCommandQueue(key => { calls.push(key); return first.promise; }, event => events.push(event), { now: () => now });
    queue.enqueue('digit_1');
    queue.enqueue('digit_2');
    now = remote.MAX_WAIT_MS + 1;
    queue.enqueue('digit_3');
    first.resolve(reply('digit_1'));
    await flush();
    assert.deepEqual(calls, ['digit_1']);
    assert.equal(events.at(-1).type, 'expired');
    assert.equal(events.at(-1).discarded, 2);
});

test('closing removes waiting keys while the active request keeps its place ahead of new input', async () => {
    const first = deferred();
    const calls = [];
    const queue = remote.createCommandQueue(key => {
        calls.push(key);
        return calls.length === 1 ? first.promise : Promise.resolve(reply(key));
    });
    queue.enqueue('digit_1');
    queue.enqueue('digit_2');
    assert.equal(queue.clear(), 1);
    queue.enqueue('digit_3');
    assert.deepEqual(calls, ['digit_1']);
    first.resolve(reply('digit_1'));
    await flush();
    assert.deepEqual(calls, ['digit_1', 'digit_3']);
    queue.dispose();
    assert.equal(queue.enqueue('digit_4'), false);
});

test('only a matching TV response can be presented as confirmation; power progress stays distinct', () => {
    assert.deepEqual(remote.normalizeReply(reply('mute'), 'mute', 'loewe-tv.3'), { key: 'mute', status: 'sent', instance: 'loewe-tv.3' });
    for (const status of ['started', 'alreadyRunning']) {
        assert.deepEqual(remote.normalizeReply({ ...reply('power_on', status), message: '<img src=x onerror=alert(1)>' }, 'power_on', 'loewe-tv.3'),
            { key: 'power_on', status, instance: 'loewe-tv.3' });
    }
    for (const value of [null, {}, { ok: true }, reply('mute', 'started'), reply('mute', 'alreadyRunning'),
        reply('mute', 'sent', 'loewe-tv.0'), reply('record'), { ...reply('mute'), ok: false }]) {
        assert.throws(() => remote.normalizeReply(value, 'mute', 'loewe-tv.3'), error => error.delivery === 'unknown');
    }
    assert.throws(() => remote.normalizeReply(reply('power_on', 'sent'), 'power_on', 'loewe-tv.3'), error => error.delivery === 'unknown');
});

test('empty EPG still permits the modal, traps focus and restores the exact previous background state', () => {
    for (const fallback of [false, true]) {
        const view = harness({ fallback });
        view.main.setAttribute('aria-hidden', 'false');
        view.document.body.style.overflow = 'auto';
        assert.equal(view.controller.open(), true);
        assert.equal(view.dialog.open, true);
        assert.equal(view.main.inert, true);
        assert.equal(view.main.getAttribute('aria-hidden'), 'true');
        assert.equal(view.document.body.style.overflow, 'hidden');
        assert.equal(view.document.activeElement, view.key('mute'));
        assert.equal(view.get('remoteTarget').textContent, 'Fernseher: loewe-tv.3');
        view.key('stop').focus();
        assert.equal(view.press('Tab').defaultPrevented, true);
        assert.equal(view.document.activeElement, view.get('closeRemote'));
        assert.equal(view.press('Tab', { shiftKey: true }).defaultPrevented, true);
        assert.equal(view.document.activeElement, view.key('stop'));
        assert.equal(view.press('Escape').defaultPrevented, true);
        assert.equal(view.dialog.open, false);
        assert.equal(view.main.inert, false);
        assert.equal(view.main.getAttribute('inert'), null);
        assert.equal(view.main.getAttribute('aria-hidden'), 'false');
        assert.equal(view.document.body.style.overflow, 'auto');
        assert.equal(view.document.activeElement, view.trigger);
        view.controller.destroy();
    }
});

test('keyboard shortcuts only operate inside the remote and held buttons cannot auto-repeat', async () => {
    const view = harness();
    assert.equal(view.press('ArrowRight', {}, view.search).defaultPrevented, undefined);
    view.controller.open();
    assert.equal(view.press('ArrowRight', {}, view.search).defaultPrevented, true);
    assert.deepEqual(view.calls, []);
    view.key('ok').focus();
    assert.equal(view.press('ArrowLeft').defaultPrevented, true);
    assert.equal(view.press('ArrowLeft', { repeat: true }).defaultPrevented, true);
    assert.equal(view.press('Enter', { repeat: true }).defaultPrevented, true);
    view.press('ArrowUp', { ctrlKey: true });
    view.press('2');
    await flush();
    assert.deepEqual(view.calls, ['left', 'digit_2']);
    view.get('closeRemote').focus();
    view.press('ArrowDown');
    assert.deepEqual(view.calls, ['left', 'digit_2']);
    view.controller.close();
    view.key('record').click();
    assert.deepEqual(view.calls, ['left', 'digit_2']);
});

test('power requires an explicit on/off choice and direct recording uses the real TV record key', async () => {
    const view = harness({ send: key => reply(key, key === 'power_on' ? 'started' : 'sent') });
    view.controller.open();
    const toggle = allNodes(view.dialog).find(node => node.getAttribute('aria-controls') === 'remotePowerOptions');
    toggle.click();
    assert.deepEqual(view.calls, []);
    assert.equal(view.get('remotePowerOptions').hidden, false);
    assert.equal(view.document.activeElement, view.key('power_on'));
    view.press('ArrowRight');
    assert.deepEqual(view.calls, []);
    view.key('power_on').click();
    await flush();
    assert.deepEqual(view.calls, ['power_on']);
    assert.equal(view.get('remotePowerOptions').hidden, true);
    assert.match(view.get('remoteStatus').textContent, /Einschaltvorgang gestartet/u);
    assert.doesNotMatch(view.get('remoteStatus').textContent, /ist eingeschaltet|ist an/u);
    toggle.click();
    view.key('power_off').click();
    await flush();
    view.key('record').click();
    await flush();
    assert.deepEqual(view.calls, ['power_on', 'power_off', 'record']);
    assert.equal(view.recording.open, false, 'Direct recording must not open the separate EPG planning dialog.');
    assert.match(view.get('remoteStatus').textContent, /hat auf „Direktaufnahme am TV“ geantwortet/u);
});

test('invalid or missing target cannot default to TV zero, while the dialog remains closable', () => {
    for (const options of [{ invalidTarget: true }, { instance: 'loewe-tv.03' }, { instance: '<img src=x>' }, { missingBridge: true }]) {
        const view = harness(options);
        view.trigger.click();
        assert.equal(view.dialog.open, true);
        assert.equal(view.document.activeElement, view.get('closeRemote'));
        assert.equal(view.key('mute').disabled, true);
        assert.equal(view.controller.press('mute'), false);
        assert.doesNotMatch(view.get('remoteTarget').textContent, /loewe-tv\.0|<img/u);
        assert.deepEqual(view.calls, []);
        view.get('closeRemote').click();
        assert.equal(view.dialog.open, false);
        assert.equal(view.document.activeElement, view.trigger);
    }
});

test('bridge readiness enables remote controls without a guide request, and modal dialogs never stack', () => {
    const view = harness({ missingBridge: true, language: 'en-GB' });
    view.window.LoeweEpgBridge = view.bridge;
    view.window.emit('loewe-epg-bridge-ready');
    assert.equal(view.key('mute').disabled, false);
    assert.equal(view.get('remoteTarget').textContent, 'Television: loewe-tv.3');
    view.recording.open = true;
    assert.equal(view.controller.open(), false);
    view.recording.open = false;
    assert.equal(view.controller.open(), true);
    const event = view.dialog.emit('cancel');
    assert.equal(event.defaultPrevented, true);
    assert.equal(view.dialog.open, false);
});

test('delivery markers produce distinct localized messages without exposing response HTML or host data', async () => {
    for (const language of ['de', 'en']) {
        for (const delivery of ['notSent', 'unknown', undefined]) {
            const first = deferred();
            const view = harness({ language, send: () => first.promise });
            view.controller.open();
            view.key('digit_1').click();
            view.key('digit_2').click();
            first.reject(Object.assign(new Error('<img src=x> password=secret 192.0.2.50'), { delivery }));
            await flush();
            assert.deepEqual(view.calls, ['digit_1']);
            const text = view.get('remoteStatus').textContent;
            assert.match(text, language === 'de' ? /nichts automatisch erneut/u : /Nothing is automatically sent again/u);
            assert.match(text, delivery === 'notSent' ? (language === 'de' ? /wurde nicht gesendet/u : /was not sent/u)
                : (language === 'de' ? /Übertragung.*unklar/u : /Delivery.*uncertain/u));
            assert.doesNotMatch(text, /<img|secret|192\.0\.2\.50/u);
            assert.equal(view.get('remoteQueueCount').hidden, true);
            view.controller.destroy();
        }
    }
});

test('changing the validated page target cannot redirect a queued key to another TV', async () => {
    const first = deferred();
    const view = harness({ send: () => first.promise });
    view.controller.open();
    view.key('digit_1').click();
    view.key('digit_2').click();
    view.setInstance('loewe-tv.4');
    first.resolve(reply('digit_1'));
    await flush();
    assert.deepEqual(view.calls, ['digit_1']);
    assert.match(view.get('remoteStatus').textContent, /„Ziffer 2“ wurde nicht gesendet/u);
});

test('permission, busy, stopped-instance and power-configuration errors offer the matching DE/EN action', async () => {
    const cases = [
        ['EPG_GUIDE_PERMISSION', 'mute', /erneut bei ioBroker.*Benutzerrechte/u, /Sign in to ioBroker.*permissions/u],
        ['REMOTE_BUSY', 'mute', /warte kurz/u, /wait a moment/u],
        ['REMOTE_UNAVAILABLE', 'mute', /Starte die Adapterinstanz/u, /Start the adapter instance/u],
        ['CLOSED', 'mute', /Starte die Adapterinstanz/u, /Start the adapter instance/u],
        ['REMOTE_VALIDATION', 'power_on', /TV-MAC-Adresse.*Einstellungen zum Einschalten/u, /TV MAC address.*power-on settings/u],
        ['REMOTE_VALIDATION', 'mute', /Tastenbefehl wurde nicht akzeptiert/u, /button command was not accepted/u],
    ];
    for (const language of ['de', 'en']) {
        for (const [code, key, german, english] of cases) {
            const view = harness({ language, send: () => Promise.reject(Object.assign(new Error('untrusted server text'), { code, delivery: 'notSent' })) });
            view.controller.open();
            view.controller.press(key);
            await flush();
            const text = view.get('remoteStatus').textContent;
            assert.match(text, language === 'de' ? german : english, `${language}: ${code}: ${key}`);
            assert.doesNotMatch(text, /untrusted server text/u);
            view.controller.destroy();
        }
    }
});

test('closing, hiding or leaving the page removes pending keys without retrying an active one', async () => {
    for (const action of ['close', 'hide', 'destroy']) {
        const first = deferred();
        const view = harness({ send: () => first.promise });
        view.controller.open();
        view.key('digit_1').click();
        view.key('digit_2').click();
        if (action === 'close') view.get('closeRemote').click();
        else if (action === 'hide') { view.document.hidden = true; view.document.emit('visibilitychange'); }
        else view.window.emit('pagehide');
        first.resolve(reply('digit_1'));
        await flush();
        assert.deepEqual(view.calls, ['digit_1'], action);
        if (action === 'destroy') {
            assert.equal(view.controller.open(), false);
            assert.equal(view.document.listeners.get('keydown').size, 0);
        }
    }
});
