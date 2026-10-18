/* global window, document, URL, CustomEvent */
'use strict';

// Keep the guide independent of Admin's React version. Admin serves this page
// and its socket client with the current user's existing session and ACLs.
// Primary transport contract:
// https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/public/lib/js/socket.io.js
// https://github.com/ioBroker/ioBroker.socket-classes/blob/v2.2.21/src/lib/socketCommon.ts
// https://github.com/ioBroker/ioBroker.socket-classes/blob/v2.2.21/README.md
(function initializeEpgBridge() {
    const CONNECT_TIMEOUT_MS = 8000;
    const REQUEST_TIMEOUT_MS = 8000;
    const GUIDE_TIMEOUT_MS = 30000;
    const PAGE_SIZE = 32;
    const MAX_CHANNELS = 2000;
    const MAX_PENDING = 4;
    const MAX_CATALOG_RESTARTS = 2;
    let socketLibrary;
    let cancelSocketLibrary;
    let connection;
    let lastGuideReference;
    let disposed = false;
    const pending = new Set();

    const german = !/^en(?:-|$)/i.test(window.navigator?.language || 'de');
    const words = german ? {
        unavailable: 'Die Verbindung zur ioBroker-Administration ist nicht verfügbar. Lade die Konfiguration erneut.',
        timeout: 'Die ioBroker-Administration antwortet nicht rechtzeitig. Prüfe, ob die Adapterinstanz läuft.',
        auth: 'Die Admin-Sitzung ist abgelaufen oder nicht berechtigt. Melde dich in ioBroker erneut an.',
        instance: 'Die Adapterinstanz ist nicht eindeutig angegeben. Öffne die Vorschau aus den Instanzeinstellungen.',
        response: 'Die Programmvorschau hat eine unvollständige oder ungültige Antwort erhalten.',
        changed: 'Die Senderliste wurde während des Ladens mehrfach geändert. Lade die Vorschau erneut.',
        busy: 'Eine Anfrage läuft bereits. Bitte warte kurz.',
    } : {
        unavailable: 'The connection to ioBroker Admin is unavailable. Reload the configuration.',
        timeout: 'ioBroker Admin did not respond in time. Check that the adapter instance is running.',
        auth: 'The Admin session has expired or lacks permission. Sign in to ioBroker again.',
        instance: 'The adapter instance is missing or ambiguous. Open the guide from its instance settings.',
        response: 'The programme guide received an incomplete or invalid response.',
        changed: 'The channel list changed repeatedly while loading. Reload the guide.',
        busy: 'A request is already running. Please wait a moment.',
    };

    function failure(key, code) {
        const error = new Error(words[key] || words.response);
        if (code) error.code = code;
        return error;
    }

    function context() {
        const url = new URL(window.location.href);
        const instances = url.searchParams.getAll('instance');
        if (!/^https?:$/.test(url.protocol) || instances.length !== 1 ||
            !/^(?:0|[1-9]\d{0,8})$/.test(instances[0]) ||
            !url.pathname.endsWith('/adapter/loewe-tv/epg.html')) {
            throw failure('instance', 'EPG_GUIDE_INSTANCE');
        }
        return {
            namespace: `loewe-tv.${instances[0]}`,
            base: new URL('../../', url),
        };
    }

    function loadSocketLibrary(base) {
        if (window.io && typeof window.io.connect === 'function') return Promise.resolve(window.io);
        if (socketLibrary) return socketLibrary;
        socketLibrary = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let finished = false;
            const timer = window.setTimeout(() => finish(failure('unavailable')), CONNECT_TIMEOUT_MS);
            function finish(error) {
                if (finished) return;
                finished = true;
                cancelSocketLibrary = null;
                window.clearTimeout(timer);
                script.onload = null;
                script.onerror = null;
                if (error) {
                    script.remove();
                    socketLibrary = null;
                    reject(error);
                } else {
                    resolve(window.io);
                }
            }
            script.src = new URL('lib/js/socket.io.js', base).href;
            script.async = true;
            script.onload = () => finish(window.io && typeof window.io.connect === 'function' ? null : failure('unavailable'));
            script.onerror = () => finish(failure('unavailable'));
            cancelSocketLibrary = () => finish(failure('unavailable'));
            document.head.appendChild(script);
        });
        return socketLibrary;
    }

    function release(error = failure('unavailable')) {
        const previous = connection;
        connection = null;
        if (previous) {
            previous.finish(error);
            for (const [name, handler] of previous.handlers) previous.socket?.off?.(name, handler);
        }
        for (const request of [...pending]) request.finish(error);
        for (const transport of previous?.transports || []) {
            // Admin 7.7.28's client can schedule a reconnect from a late native
            // close event, even after destroy(). Only detach our own sockets.
            transport.onopen = null;
            transport.onclose = null;
            transport.onerror = null;
            transport.onmessage = null;
            try { transport.close(); } catch { /* Already closed or unloading. */ }
        }
        previous?.transports.clear();
        // A disconnect handler may run inside the client's close() method.
        // Dispose after that stack finishes, so its final reconnect timer is
        // cancelled as well. No private client fields or global patches.
        void Promise.resolve().then(() => {
            try {
                if (typeof previous?.socket?.destroy === 'function') previous.socket.destroy();
                else previous?.socket?.close?.();
            } catch { /* The browser may already have destroyed the document. */ }
        });
    }

    function connect(ctx) {
        if (disposed) return Promise.reject(failure('unavailable'));
        if (connection) return connection.promise;
        const current = { socket: null, transports: new Set(), handlers: [], ready: false, promise: null, finish: null };
        connection = current;
        current.promise = new Promise((resolve, reject) => {
            let completed = false;
            const timer = window.setTimeout(() => release(failure('timeout')), CONNECT_TIMEOUT_MS);
            current.finish = error => {
                if (completed) return;
                completed = true;
                window.clearTimeout(timer);
                if (error) reject(error);
                else {
                    current.ready = true;
                    resolve(current.socket);
                }
            };
        });
        void loadSocketLibrary(ctx.base).then(io => {
            if (disposed || connection !== current) return;
            // Same origin, scheme, port and reverse-proxy prefix as Admin.
            // Cookies are sent by the browser; no password or token is copied.
            current.socket = io.connect(ctx.base.href, {
                path: `${ctx.base.pathname}socket.io`,
                name: 'loewe-epg',
                connectTimeout: CONNECT_TIMEOUT_MS,
                authTimeout: CONNECT_TIMEOUT_MS,
                // The Admin client explicitly supports an injected WebSocket
                // constructor. This lets us clean up only this iframe's own
                // connections without touching the parent's Admin session.
                WebSocket: function EpgWebSocket(url, protocols) {
                    const transport = protocols === undefined ? new window.WebSocket(url)
                        : new window.WebSocket(url, protocols);
                    current.transports.add(transport);
                    transport.addEventListener('close', () => current.transports.delete(transport), { once: true });
                    return transport;
                },
            });
            const bind = (name, handler) => {
                current.handlers.push([name, handler]);
                current.socket.on(name, handler);
            };
            const authenticate = () => {
                if (connection !== current || disposed) return;
                current.socket.emit('authenticate', authenticated => {
                    if (connection !== current || disposed) return;
                    if (authenticated === true) current.finish();
                    else release(failure('auth'));
                });
            };
            bind('connect', authenticate);
            bind('reconnect', authenticate);
            bind('disconnect', () => release(failure('unavailable')));
            bind('error', () => release(failure('unavailable')));
            bind('connect_error', () => release(failure('unavailable')));
            bind('reauthenticate', () => release(failure('auth')));
            if (current.socket.connected) authenticate();
        }).catch(() => {
            if (connection === current) release(failure('unavailable'));
        });
        return current.promise;
    }

    async function send(command, message) {
        const ctx = context();
        if (pending.size >= MAX_PENDING) throw failure('busy');
        const socket = await connect(ctx);
        if (disposed || connection?.socket !== socket) throw failure('unavailable');
        if (pending.size >= MAX_PENDING) throw failure('busy');
        return new Promise((resolve, reject) => {
            const entry = { finish: null };
            let finished = false;
            const timer = window.setTimeout(() => release(failure('timeout')), REQUEST_TIMEOUT_MS);
            entry.finish = (error, data) => {
                if (finished) return;
                finished = true;
                window.clearTimeout(timer);
                pending.delete(entry);
                if (error) reject(error);
                else resolve(data);
            };
            pending.add(entry);
            try {
                socket.emit('sendTo', ctx.namespace, command, message, response => {
                    if (finished) return;
                    if (!response || typeof response !== 'object' || Array.isArray(response)) {
                        entry.finish(failure('response'));
                    } else if (response.error) {
                        const code = typeof response.code === 'string' ? response.code
                            : typeof response.error === 'object' ? response.error.code : response.error;
                        const error = failure(code === 'EPG_GUIDE_CHANGED' ? 'changed' : 'response', code);
                        if (typeof response.message === 'string') error.message = response.message.slice(0, 500);
                        else if (typeof response.error === 'string' && response.error !== code) error.message = response.error.slice(0, 500);
                        entry.finish(error);
                    } else {
                        entry.finish(null, response);
                    }
                });
            } catch {
                release(failure('unavailable'));
            }
        });
    }

    async function collectGuide(range) {
        const ctx = context();
        const startedAt = Date.now();
        const deadline = window.setTimeout(() => release(failure('timeout')), GUIDE_TIMEOUT_MS);
        let restarts = 0;
        let channels = [];
        let snapshot;
        let offset = 0;
        let revision;
        const ids = new Set();
        try {
            while (!disposed) {
                if (Date.now() - startedAt >= GUIDE_TIMEOUT_MS) throw failure('timeout');
                let page;
                try {
                    page = await send('getEpgGuide', {
                        from: range?.from, to: range?.to, offset, limit: PAGE_SIZE,
                        ...(revision === undefined ? {} : { catalogRevision: revision }),
                    });
                } catch (error) {
                    if (error.code !== 'EPG_GUIDE_CHANGED' || restarts >= MAX_CATALOG_RESTARTS) throw error;
                    restarts++;
                    channels = [];
                    snapshot = undefined;
                    offset = 0;
                    revision = undefined;
                    ids.clear();
                    continue;
                }
                if (page.schemaVersion !== 1 || page.source !== 'tv' || page.instance !== ctx.namespace ||
                    typeof page.listView !== 'string' || !Array.isArray(page.channels) ||
                    page.channels.length > PAGE_SIZE || !Number.isInteger(page.total) ||
                    page.total < 0 || page.total > MAX_CHANNELS ||
                    typeof page.catalogRevision !== 'string' || !/^[a-f0-9]{64}$/.test(page.catalogRevision)) {
                    throw failure('response');
                }
                if (snapshot && (page.catalogRevision !== revision || page.total !== snapshot.total)) {
                    if (restarts >= MAX_CATALOG_RESTARTS) throw failure('changed', 'EPG_GUIDE_CHANGED');
                    restarts++;
                    channels = [];
                    snapshot = undefined;
                    offset = 0;
                    revision = undefined;
                    ids.clear();
                    continue;
                }
                for (const channel of page.channels) {
                    if (!channel || typeof channel.id !== 'string' || !channel.id || ids.has(channel.id)) throw failure('response');
                    ids.add(channel.id);
                }
                snapshot ||= page;
                revision = page.catalogRevision;
                channels.push(...page.channels);
                if (channels.length > page.total) throw failure('response');
                if (page.nextOffset === null || page.nextOffset === undefined) {
                    if (channels.length !== page.total) throw failure('response');
                    lastGuideReference = { listView: snapshot.listView, catalogRevision: revision };
                    return { ...snapshot, channels, nextOffset: null };
                }
                if (!Number.isInteger(page.nextOffset) || page.nextOffset !== offset + page.channels.length ||
                    page.nextOffset <= offset || page.nextOffset >= page.total) throw failure('response');
                offset = page.nextOffset;
            }
            throw failure('unavailable');
        } finally {
            window.clearTimeout(deadline);
        }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        release();
        cancelSocketLibrary?.();
    }

    window.addEventListener('pagehide', dispose);
    window.addEventListener('beforeunload', dispose);
    window.LoeweEpgBridge = Object.freeze({
        language: german ? 'de' : 'en',
        requestGuide: collectGuide,
        refresh: () => send('refreshEpgGuide', lastGuideReference ? { ...lastGuideReference } : {}),
    });
    window.dispatchEvent(new CustomEvent('loewe-epg-bridge-ready'));
}());
