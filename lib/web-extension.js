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
// TV client, forwards adapter commands or reads configuration into the page.

const fs = require('node:fs');
const path = require('node:path');

const INSTANCE = /^system\.adapter\.(loewe-tv\.(0|[1-9]\d{0,8}))$/;
const WEB_INSTANCE = /^web\.(?:0|[1-9]\d{0,8})$/;
const LOGO_FILE = /^[a-z0-9][a-z0-9-]{0,79}\.svg$/;
const MAX_ASSET_BYTES = 512 * 1024;
const MAX_LOGOS = 256;
const ADMIN = path.join(__dirname, '..', 'admin');
const FILES = Object.freeze({
    'epg.html': 'text/html; charset=utf-8',
    'epg.css': 'text/css; charset=utf-8',
    'epg.js': 'application/javascript; charset=utf-8',
    'epg-bridge.js': 'application/javascript; charset=utf-8',
    'epg-remote.js': 'application/javascript; charset=utf-8',
    'loewe-tv.png': 'image/png',
});

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
        this.assetFiles = assets();
        this.active = true;
        this.handler = (req, res, next) => this._handle(req, res, next);
        app.use(this.handler);
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
    }

    _reply(req, res, status, type, data) {
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.status(status);
        if (req.method === 'HEAD') res.end();
        else res.send(data);
    }

    _handle(req, res, next) {
        if (!this.active || typeof req.url !== 'string' || !req.url.startsWith('/')) return next();
        const pathname = req.url.split('?')[0];
        const generic = pathname === '/adapter/loewe-tv/epg.html';
        const root = pathname === this.route.slice(0, -1);
        if (!generic && !root && !pathname.startsWith(this.route)) return next();
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

        const file = pathname.slice(this.route.length);
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
