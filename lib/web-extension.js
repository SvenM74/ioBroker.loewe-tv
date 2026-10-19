'use strict';

// Official extension constructor, selected native.webInstance and welcomePage:
// https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/WEB-EXTENSIONS-HOWTO.md
// In that revision of src/main.ts, the login middleware is registered before
// extensions. Local web socket commands use that web instance's user permissions:
// https://github.com/ioBroker/ioBroker.socket-classes/blob/df02bc5d522796611cb1804485a91a0f37867ba1/src/lib/socketCommands.ts
// Cloud access uses the existing Cloud login and its own socket/ACL context;
// it does not inherit the selected web instance's individual user permissions:
// https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/lib/socketCloud.ts
// This class only serves the existing UI. It never opens a listener, creates a
// TV client or forwards adapter commands. The entry lists only the display name
// and namespace of each TV extension loaded on this web server.

const fs = require('node:fs');
const path = require('node:path');
const { setTimeout, clearTimeout } = require('node:timers');
const { TV_NAMES_STATE, parseTvNames, nameForTv } = require('./tv-names');

const INSTANCE = /^system\.adapter\.(loewe-tv\.(0|[1-9]\d{0,8}))$/;
const INSTANCE_NUMBER = /^(?:0|[1-9]\d{0,8})$/;
const WEB_INSTANCE = /^web\.(?:0|[1-9]\d{0,8})$/;
// All LOEWE constructors on one web server share its Express app. Keep the
// generic entry scoped to that app and to extensions that really loaded there.
const EXTENSIONS = new WeakMap();
const ENTRY_PAGES = new Set(['/loewe-tv', '/loewe-tv/', '/loewe-tv/index.html', '/loewe-tv/epg.html']);
const LOGO_FILE = /^[a-z0-9][a-z0-9-]{0,79}\.svg$/;
const MAX_ASSET_BYTES = 512 * 1024;
const MAX_LOGOS = 256;
const NAME_LOAD_TIMEOUT_MS = 1500;
const NAME_REFRESH_INTERVAL_MS = 5000;
const ADMIN = path.join(__dirname, '..', 'admin');
const FILES = Object.freeze({
    'epg.html': 'text/html; charset=utf-8',
    'epg.css': 'text/css; charset=utf-8',
    'epg-entry.css': 'text/css; charset=utf-8',
    'epg.js': 'application/javascript; charset=utf-8',
    'epg-bridge.js': 'application/javascript; charset=utf-8',
    'epg-remote.js': 'application/javascript; charset=utf-8',
    'loewe-tv.png': 'image/png',
});

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

function instanceName(common, german, instance) {
    let name = common?.name;
    if (name && typeof name === 'object') name = name[german ? 'de' : 'en'] || name.en || name.de;
    name = typeof name === 'string' ? name.trim().slice(0, 120) : '';
    return name && name !== 'loewe-tv' ? name : `${german ? 'Fernseher' : 'TV'} ${instance}`;
}

function assets() {
    const result = new Map(Object.entries(FILES).map(([name, type]) => [name, { type }]));
    // File names come from the installed, bounded asset directory, not from a
    // requested path. Only regular SVG files with safe names become routable.
    try {
        const logos = fs.readdirSync(path.join(ADMIN, 'logos'), { withFileTypes: true })
            .filter(file => file.isFile() && LOGO_FILE.test(file.name)).slice(0, MAX_LOGOS);
        for (const file of logos) result.set(`logos/${file.name}`, { type: 'image/svg+xml; charset=utf-8' });
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    return result;
}

class EpgWebExtension {
    constructor(_server, webSettings, adapter, instanceSettings, app) {
        this.active = false;
        this.assetFiles = new Map();
        this._namesReady = Promise.resolve();
        this._namesReadyDone = true;
        this._nameRevision = 0;
        this._nameReadSequence = 0;
        this._nextNameReadAt = 0;
        const match = INSTANCE.exec(instanceSettings?._id || '');
        if (!match || instanceSettings?.common?.enabled !== true ||
            !WEB_INSTANCE.test(adapter?.namespace || '') ||
            instanceSettings?.native?.webInstance !== adapter.namespace) return;
        if (typeof app?.use !== 'function') throw new TypeError('A web extension requires the existing Express app.');

        this.namespace = match[1];
        this.instance = match[2];
        this.route = `/${this.namespace}/`;
        this.adapter = adapter;
        this.authentication = webSettings?.auth === true;
        this.german = !/^en(?:-|$)/i.test(webSettings?.language || 'de');
        this.fallbackName = instanceName(instanceSettings.common, this.german, this.instance);
        this.name = this.fallbackName;
        this.tvHost = instanceSettings.native.host;
        this.tvPort = instanceSettings.native.port ?? 905;
        this.nameStateId = `${this.namespace}.${TV_NAMES_STATE}`;
        this.assetFiles = assets();
        this.instances = EXTENSIONS.get(app) || new Map();
        EXTENSIONS.set(app, this.instances);
        this.active = true;
        this.handler = (req, res, next) => this._handle(req, res, next);
        app.use(this.handler);
        const previous = this.instances.get(this.namespace);
        this.instances.set(this.namespace, this);
        previous?.unload();
        // A missing subscription response must not prevent the local database
        // read. Later chooser requests can also recover from lost events.
        void Promise.resolve().then(() => {
            if (!this.active || typeof this.adapter.subscribeForeignStatesAsync !== 'function') return;
            return this.adapter.subscribeForeignStatesAsync(this.nameStateId);
        }).catch(() => {});
        this._loadNames();
    }

    _loadNames() {
        if (!this.active || typeof this.adapter.getForeignStateAsync !== 'function'
            || !this._namesReadyDone || Date.now() < this._nextNameReadAt) return;
        this._nextNameReadAt = Date.now() + NAME_REFRESH_INTERVAL_MS;
        const sequence = ++this._nameReadSequence;
        const revision = this._nameRevision;
        let finished = false;
        let timer;
        let finish;
        this._namesReadyDone = false;
        this._namesReady = new Promise(resolve => {
            finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (this._nameReadSequence === sequence) this._namesReadyDone = true;
                resolve();
            };
        });
        this._finishNameRead = finish;
        // All simultaneous chooser requests share this bounded read. A timed
        // out attempt cannot block a later retry or finish its replacement.
        timer = setTimeout(finish, NAME_LOAD_TIMEOUT_MS);
        void Promise.resolve().then(async () => {
            if (!this.active || this._nameReadSequence !== sequence) return;
            const state = await this.adapter.getForeignStateAsync(this.nameStateId);
            if (this.active && this._nameReadSequence === sequence && this._nameRevision === revision) {
                this._applyNames(state);
            }
        }).catch(() => {}).finally(finish);
    }

    // ioBroker.web calls this optional hook with a callback, not an async
    // constructor. Returning the promise also supports direct initialization.
    waitForReady(callback) {
        return typeof callback === 'function'
            ? this._namesReady.then(() => callback(this)).catch(() => {}) : this._namesReady;
    }

    _applyNames(state) {
        if (state?.ack === false) return;
        const name = nameForTv(parseTvNames(state?.val), this.tvHost, this.tvPort);
        this.name = name || this.fallbackName;
    }

    // Web forwards subscribed state changes to all extensions. Only this
    // instance's saved, host-bound names may alter its visible TV label.
    stateChange(id, state) {
        if (!this.active || id !== this.nameStateId || state?.ack === false) return;
        this._nameRevision += 1;
        this._applyNames(state);
    }

    welcomePage() {
        if (!this.active) return null;
        const link = `${this.namespace}/epg.html`;
        return { link, localLink: link, name: `Loewe TV · ${this.german ? 'Programmübersicht' : 'Programme guide'} (${this.instance})`,
            img: `${this.namespace}/loewe-tv.png`, color: '#213047', order: 40, pro: false,
            id: `system.adapter.${this.namespace}`, instance: Number(this.instance) };
    }

    unload() {
        // The host owns Express and its listener. Keep an inert middleware if
        // it reuses that app; do not touch private Express router internals.
        this.active = false;
        this.assetFiles.clear();
        if (this.instances?.get(this.namespace) === this) this.instances.delete(this.namespace);
        this._finishNameRead?.();
        // Web also uses this adapter's subscriptions for its browser clients.
        // Unsubscribing here could remove another reader of this same state;
        // the host owns cleanup. This instance ignores later reads and events.
    }

    _reply(req, res, status, type, data, cacheControl = 'no-cache') {
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', cacheControl);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.status(status);
        if (req.method === 'HEAD') res.end();
        else res.send(data);
    }

    _entry(req, res, pathname, query, next, namesChecked) {
        if (!ENTRY_PAGES.has(pathname)) {
            if (pathname === '/loewe-tv/epg-entry.css') return this._serve(req, res, 'epg-entry.css');
            return this._reply(req, res, 404, 'text/plain; charset=utf-8', 'Not found');
        }
        if (query.length > 1 || (query.length === 1 && !INSTANCE_NUMBER.test(query[0]))) {
            return this._reply(req, res, 400, 'text/plain; charset=utf-8',
                this.german ? 'Die TV-Instanz ist nicht eindeutig angegeben.' : 'The TV instance is missing or ambiguous.');
        }
        const instances = [...this.instances.values()]
            .filter(extension => extension.active && extension.adapter.namespace === this.adapter.namespace)
            .sort((left, right) => Number(left.instance) - Number(right.instance));
        const selected = query.length ? instances.find(extension => extension.instance === query[0])
            : instances.length === 1 ? instances[0] : null;
        if (query.length && !selected) {
            return this._reply(req, res, 404, 'text/plain; charset=utf-8', this.german
                ? 'Für diese TV-Instanz ist auf diesem Web-Adapter keine Programmübersicht verfügbar.'
                : 'This TV instance has no programme guide on this web adapter.');
        }
        const prefix = pathname === '/loewe-tv' ? '' : '../';
        const target = extension => `${prefix}${extension.namespace}/epg.html`;
        if (selected) {
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect(302, target(selected));
        }
        if (!namesChecked) {
            if (req.method === 'GET') for (const extension of instances) extension._loadNames();
            const pending = instances.filter(extension => !extension._namesReadyDone);
            if (pending.length) {
                // Re-check active routes after waiting, but never start another
                // read for this same request, even after a long event-loop pause.
                return Promise.all(pending.map(extension => extension._namesReady))
                    .then(() => this._handle(req, res, next, true));
            }
        }
        const heading = this.german ? 'Fernseher auswählen' : 'Choose a TV';
        const description = this.german ? 'Für welchen Fernseher möchtest du die Programmübersicht öffnen?'
            : 'Which TV would you like to open the programme guide for?';
        const action = this.german ? 'Programmübersicht öffnen' : 'Open programme guide';
        const note = this.german ? 'Fernbedienung und Aufnahmeplanung gehören jeweils zum ausgewählten Fernseher.'
            : 'The remote control and recording planner use the TV you select.';
        const stylesheet = pathname === '/loewe-tv' ? 'loewe-tv/epg-entry.css' : 'epg-entry.css';
        const entries = instances.map(extension => `        <li><a href="${target(extension)}">
            <span class="tv-name">${escapeHtml(extension.name)}</span>
            <span class="tv-instance">${extension.namespace}</span>
            <span class="tv-open">${action} <span aria-hidden="true">→</span></span>
        </a></li>`).join('\n');
        // Admin 8.0.14 discards the path and instance when building a web link.
        // Never guess the clicked TV from /loewe-tv/. This page only navigates;
        // it needs no socket connection and sends no TV commands.
        return this._reply(req, res, 200, FILES['epg.html'], `<!doctype html>
<html lang="${this.german ? 'de' : 'en'}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Loewe TV · ${heading}</title>
    <link rel="stylesheet" href="${stylesheet}">
</head>
<body>
<main class="tv-picker">
    <p class="eyebrow">LOEWE TV</p>
    <h1>${heading}</h1>
    <p class="description">${description}</p>
    <ul class="tv-list">
${entries}
    </ul>
    <p class="note">${note}</p>
</main>
</body>
</html>`, 'no-store');
    }

    _handle(req, res, next, namesChecked = false) {
        if (!this.active || typeof req.url !== 'string' || !req.url.startsWith('/')) return next();
        const pathname = req.url.split('?')[0];
        const generic = pathname === '/adapter/loewe-tv/epg.html';
        const entry = pathname === '/loewe-tv' || pathname.startsWith('/loewe-tv/');
        const root = pathname === this.route.slice(0, -1);
        if (!entry && !generic && !root && !pathname.startsWith(this.route)) return next();
        const query = new URL(req.url, 'http://localhost').searchParams.getAll('instance');
        if (generic && (query.length !== 1 || query[0] !== this.instance)) return next();

        // The web host already applies its authentication middleware. Keep the
        // same condition here as a fail-closed guard for authenticated hosts.
        if (this.authentication && !(typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : req.user)) {
            return this._reply(req, res, 401, 'text/plain; charset=utf-8',
                this.german ? 'Bitte an dieser ioBroker.web-Instanz anmelden.' : 'Please sign in to this ioBroker.web instance.');
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.setHeader('Allow', 'GET, HEAD');
            return this._reply(req, res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
        }
        if (entry) return this._entry(req, res, pathname, query, next, namesChecked);
        if (query.length > 1 || (query.length === 1 && query[0] !== this.instance)) {
            return this._reply(req, res, 400, 'text/plain; charset=utf-8', 'Ambiguous TV instance');
        }
        if (generic || root || pathname === this.route) {
            // Relative redirects retain the public reverse-proxy prefix. New
            // Admin versions rewrite an extension's relative localLink to web;
            // older Admin versions continue opening that link in Admin itself.
            const target = generic ? `../../${this.namespace}/epg.html`
                : root ? `${this.namespace}/epg.html` : 'epg.html';
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect(302, target);
        }

        return this._serve(req, res, pathname.slice(this.route.length));
    }

    _serve(req, res, file) {
        const asset = this.assetFiles.get(file);
        if (!asset) return this._reply(req, res, 404, 'text/plain; charset=utf-8', 'Not found');
        if (file === 'epg.html' && this.adapter.config?.socketio !== undefined && this.adapter.config.socketio !== '') {
            return this._reply(req, res, 503, 'text/plain; charset=utf-8', this.german
                ? `Bitte in ${this.adapter.namespace} die integrierte Socket-Verbindung aktivieren. Die Programmübersicht verwendet dieselbe Web-Instanz und Anmeldung; eine separate Socket-Instanz wird nicht verwendet.`
                : `Please enable the integrated socket connection in ${this.adapter.namespace}. The programme guide uses the same web instance and login; a separate socket instance is not used.`);
        }
        try {
            if (!asset.data) {
                const filename = path.join(ADMIN, file);
                const stat = fs.lstatSync(filename);
                if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) throw new Error('Invalid programme guide asset');
                asset.data = fs.readFileSync(filename);
            }
            return this._reply(req, res, 200, asset.type, asset.data);
        } catch {
            return this._reply(req, res, 500, 'text/plain; charset=utf-8',
                this.german ? 'Die Programmübersicht konnte nicht geladen werden. Bitte den Adapter erneut installieren.'
                    : 'The programme guide could not be loaded. Please reinstall the adapter.');
        }
    }
}

module.exports = EpgWebExtension;
