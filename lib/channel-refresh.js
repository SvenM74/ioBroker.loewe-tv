'use strict';

const { setImmediate: nextTurn } = require('node:timers/promises');
const { ProtocolError, parseChannelPage, selectChannelList } = require('./loewe-client');
const { mergeChannelPage, MAX_CATALOG_BYTES } = require('./channel-catalog');

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const MAX_POSITIONS = 2000;
const SCAN_TIMEOUT_MS = 120000;

function failure(message, code = 'CHANNEL_REFRESH_INVALID') {
    return new ProtocolError(message, code);
}

/** Collect a complete list before allowing the object worker to reconcile it. */
class ChannelRefresh {
    constructor(runtime) {
        this.runtime = runtime;
        this.adapter = runtime.adapter;
        this.started = false;
        this.stopped = false;
        this.timer = null;
        this.promise = null;
        this.viewRevision = 0;
    }

    get enabled() { return this.runtime.config?.channelRefreshInterval > 0; }

    start() {
        if (this.started || this.stopped) return;
        this.started = true;
        if (!this.enabled) {
            void this.runtime._safeWrite('channels.refreshStatus', 'disabled');
            return;
        }
        // With status polling disabled, this separate read-only task can still
        // discover an available TV. It never sends Wake-on-LAN or a power key.
        if (!this.runtime._connected && this.runtime.config.pollInterval > 0) {
            void this.runtime._safeWrite('channels.refreshStatus', 'waiting');
        }
        this._schedule(this.runtime._connected || !this.runtime.config.pollInterval ? 0 : undefined);
    }

    connected() {
        if (this.started && this.enabled && !this.promise && !this.stopped) this._schedule(0);
    }

    viewChanged() {
        // Staging a parameter must never send a TV command or advance the next
        // scheduled refresh. Only invalidate a snapshot that is already running.
        this.viewRevision++;
    }

    _clearTimer() {
        if (this.timer === null) return;
        const clearTimer = this.adapter.clearTimeout?.bind(this.adapter) || clearTimeout;
        clearTimer(this.timer);
        this.timer = null;
    }

    _schedule(delay = this.runtime.config.channelRefreshInterval * 1000) {
        if (!this.started || !this.enabled || this.stopped || this.runtime.stopping) return;
        this._clearTimer();
        const setTimer = this.adapter.setTimeout?.bind(this.adapter) || setTimeout;
        this.timer = setTimer(() => {
            this.timer = null;
            if (this.stopped || this.runtime.stopping) return;
            // Existing status queries handle standby detection. Do not add a
            // second failing request while the TV is already known to be offline.
            if (!this.runtime._connected && this.runtime.config.pollInterval > 0) {
                void this.runtime._safeWrite('channels.refreshStatus', 'waiting');
                this._schedule();
                return;
            }
            void this.refresh();
        }, delay);
    }

    refresh({ manual = false } = {}) {
        if (this.stopped || this.runtime.stopping || !this.runtime.client) return Promise.resolve(false);
        if (this.promise) return this.promise;
        this._clearTimer();
        this.promise = this._run(manual).finally(() => {
            this.promise = null;
            this._schedule();
        });
        return this.promise;
    }

    _check(context) {
        this.runtime._checkRunning();
        if (this.stopped) throw failure('Senderabgleich wurde beendet.', 'CLOSED');
        if (Date.now() >= context.deadline) {
            throw failure('Der vollständige Senderabgleich hat sein Zeitlimit von 120 Sekunden erreicht.', 'CHANNEL_REFRESH_TIMEOUT');
        }
        if (this.viewRevision !== context.viewRevision || this.runtime.channelObjects.selectionEpoch !== context.catalogEpoch) {
            throw failure('Die ausgewählte Liste oder der Senderbestand wurde während des Abgleichs geändert. Die ältere Antwort wird verworfen.', 'CHANNEL_REFRESH_CHANGED');
        }
        if (context.view !== undefined && this.runtime._parameters.has('channels.view')
            && this.runtime._parameters.get('channels.view') !== context.view) {
            throw failure('Die ausgewählte Senderliste wurde während des Abgleichs geändert.', 'CHANNEL_REFRESH_CHANGED');
        }
    }

    async _queued(context, label, operation, manual = false) {
        let result;
        let error;
        const successful = await this.runtime._enqueue(label, async () => {
            try {
                this._check(context);
                result = await operation();
                this._check(context);
            } catch (caught) {
                error = caught;
                throw caught;
            }
        }, { manual });
        if (!successful) throw error || failure('Senderabgleich konnte nicht in der Befehlswarteschlange ausgeführt werden.', 'CHANNEL_REFRESH_QUEUE');
        return result;
    }

    async _scan(context, view) {
        let total = null;
        let name = '';
        let hash = '';
        let pages = 0;
        let bytes = 0;
        const items = [];
        do {
            if (pages >= MAX_PAGES) throw failure(`Der Senderabgleich ist auf ${MAX_PAGES} Seiten begrenzt.`, 'CHANNEL_REFRESH_LIMIT');
            const start = items.length;
            const response = await this._queued(context, 'channels.refresh.page',
                () => this.runtime._call('getChannels', view, start, PAGE_SIZE, 'video', { deadline: context.deadline }));
            // A valid SOAP reply with an unsupported list shape is a channel
            // error, not evidence that the previously reachable TV disconnected.
            const page = parseChannelPage(response);
            this._check(context);
            if (page.itemClass === 'audio') {
                throw failure('Die angeforderte TV-Liste wurde als Radioliste beantwortet. Der vorhandene TV-Bestand bleibt erhalten.');
            }
            if ((page.view && page.view !== view) || page.startIndex !== start || page.totalResults === null) {
                throw failure('Die Senderantwort enthält eine andere Liste oder keinen passenden Seitenbereich mit Gesamtzahl.');
            }
            if (page.items.length > PAGE_SIZE || page.totalResults > MAX_POSITIONS) {
                throw failure(`Höchstens ${PAGE_SIZE} Einträge je Seite und ${MAX_POSITIONS} Senderplätze werden übernommen.`, 'CHANNEL_REFRESH_LIMIT');
            }
            if (total !== null && (page.totalResults !== total || (hash && page.hash && page.hash !== hash)
                || (name && page.name && page.name !== name))) {
                throw failure('Die Senderliste hat sich während der Seitenabfrage geändert.', 'CHANNEL_REFRESH_CHANGED');
            }
            total = page.totalResults;
            name ||= page.name;
            hash ||= page.hash;
            for (const entry of page.items) {
                // Stream and preview URLs are unrelated to channel identity and
                // would multiply the size of the persistent catalogue.
                const compact = Object.fromEntries(['mediaItemUuid', 'name', 'locator', 'caption', 'itemClass', 'attributes']
                    .map(key => [key, entry[key]]));
                bytes += Buffer.byteLength(JSON.stringify(compact), 'utf8');
                if (bytes > MAX_CATALOG_BYTES) throw failure('Die Senderliste überschreitet die Kataloggrößengrenze.', 'CHANNEL_REFRESH_LIMIT');
                items.push(compact);
            }
            pages++;
            if (items.length > total || (items.length < total && page.nextStart !== items.length)) {
                throw failure('Die Senderseiten sind unvollständig oder überlappen sich.');
            }
            if (items.length === total) break;
            // Release the transport after every page, including a full event
            // loop turn for incoming remote commands before queuing the next.
            await nextTurn();
        } while (true);
        return { page: { view, name, hash, items, startIndex: 0, totalResults: total,
            returnedResults: items.length, nextStart: null, itemClass: 'undefined' }, pages };
    }

    async _run(manual) {
        const context = { deadline: Date.now() + SCAN_TIMEOUT_MS, viewRevision: this.viewRevision,
            catalogEpoch: this.runtime.channelObjects.selectionEpoch };
        try {
            await this.runtime._write('channels.refreshStatus', 'updating');
            await this.runtime._write('channels.refreshError', '');
            this._check(context);
            let view = await this.runtime._parameter('channels.view', '');
            if (typeof view !== 'string') throw failure('Die Senderlistenkennung muss Text sein.');
            view = view.trim();
            if (!view) {
                const lists = await this._queued(context, 'channels.refresh', async () => {
                    try {
                        return await this.runtime._channelLists(0, 500, { deadline: context.deadline });
                    } catch (error) {
                        // channelResponseError identifies semantic list errors by
                        // action and prefix. Preserve transport/XML/session errors:
                        // they are still evidence that the TV is not reachable.
                        if (error.code === 'INVALID_RESPONSE' && error.action === 'GetListOfChannelLists'
                            && error.message.startsWith('GetListOfChannelLists: ') && !error.sessionInvalid) {
                            throw failure(error.message);
                        }
                        throw error;
                    }
                }, manual);
                const selected = selectChannelList(lists.lists);
                if (!selected) throw failure('Der Fernseher hat keine geeignete Senderliste geliefert.', 'NO_CHANNEL_LIST');
                view = selected.view;
            } else if (manual) {
                await this._queued(context, 'channels.refresh', async () => {}, true);
            }
            context.view = view;
            this._check(context);
            const collected = await this._scan(context, view);
            if (collected.pages > 1) {
                // A constant hash such as 4294967295 is not a generation token.
                // Compare two complete reads instead of trusting it to prove
                // that separately requested pages belong together.
                await nextTurn();
                const verified = await this._scan(context, view);
                const content = result => JSON.stringify([result.page.view, result.page.name,
                    result.page.totalResults, result.page.items]);
                if (content(collected) !== content(verified)) {
                    throw failure('Die Senderliste war bei der Kontrollabfrage nicht identisch. Der vorhandene Bestand bleibt erhalten.', 'CHANNEL_REFRESH_CHANGED');
                }
            }
            this._check(context);
            // Validate the actual persisted model and its 480-KiB bound before
            // dispatch, so an invalid complete list cannot remove old objects.
            const checked = mergeChannelPage(null, collected.page, { mediaType: 'video' });
            if (!checked.lastQuery.reconciled) {
                throw failure('Die vollständige Senderliste enthält nicht eindeutig zuordenbare Senderplätze. Der vorhandene Bestand bleibt erhalten.');
            }
            this._check(context);
            this.runtime.channelObjects.acceptPage(collected.page, 'video');
            const television = collected.page.items.filter(item => item.itemClass === 'video');
            await this.runtime._write('channels.refreshCount', television.length);
            await this.runtime._write('channels.refreshLastUpdate', Date.now());
            await this.runtime._write('channels.refreshStatus', 'ready');
            return true;
        } catch (error) {
            if (!this.stopped && !this.runtime.stopping) {
                await Promise.all([
                    this.runtime._safeWrite('channels.refreshStatus', 'error'),
                    this.runtime._safeWrite('channels.refreshError', `${error.code || 'ERROR'}: ${error.message}`.slice(0, 2000)),
                ]);
                this.runtime._logError(error);
            }
            return false;
        }
    }

    stop() {
        this.stopped = true;
        this._clearTimer();
    }
}

module.exports = { ChannelRefresh, PAGE_SIZE, MAX_PAGES, SCAN_TIMEOUT_MS };
