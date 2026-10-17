'use strict';

const http = require('node:http');
const https = require('node:https');
const { createHash } = require('node:crypto');
const { Readable, PassThrough, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { setImmediate: nextTurn } = require('node:timers/promises');
const sax = require('sax');

const channelNameIndexes = new WeakMap();

const HOUR = 60 * 60 * 1000;
const XMLTV_LIMITS = Object.freeze({
    timeout: 30000,
    redirects: 3,
    wireBytes: 16 * 1024 * 1024,
    decodedBytes: 32 * 1024 * 1024,
    chunkBytes: 16 * 1024,
    programmes: 500000,
    channels: 50000,
    eventsPerDirection: 64,
    retainedEvents: 65536,
    retainedBytes: 24 * 1024 * 1024,
    lookback: 24 * HOUR,
    future: 48 * HOUR,
});

function invalid(message, code = 'XMLTV_INVALID_XML') {
    const error = new Error(`XMLTV: ${message}`);
    error.code = code;
    return error;
}

function checkAbort(signal) {
    if (signal?.aborted) throw signal.reason?.code?.startsWith('XMLTV_') ? signal.reason
        : invalid('Der Abruf wurde abgebrochen.', 'XMLTV_ABORTED');
}

function checkedUrl(value, base) {
    let result;
    try { result = new URL(value, base); }
    catch { throw invalid('Die Guide-URL ist ungültig.', 'XMLTV_URL'); }
    if (!['http:', 'https:'].includes(result.protocol) || !result.hostname || result.username || result.password) {
        throw invalid('Die Guide-URL muss HTTP oder HTTPS verwenden und darf keine Benutzerinfo enthalten.', 'XMLTV_URL');
    }
    result.hash = '';
    return result;
}

function header(response, name) {
    const headers = response.headers;
    if (headers && typeof headers.get === 'function') return headers.get(name) || '';
    const value = headers?.[name.toLowerCase()];
    return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

function discard(response) {
    const body = response?.body;
    if (typeof body?.destroy === 'function') body.destroy();
    else if (typeof body?.cancel === 'function') Promise.resolve(body.cancel()).catch(() => {});
}

// Unlike native fetch, this transport leaves Content-Encoding untouched. The
// compressed and expanded byte budgets are therefore enforced independently.
function openHttp(url, { signal }) {
    return new Promise((resolve, reject) => {
        const transport = url.protocol === 'https:' ? https : http;
        const request = transport.get(url, {
            signal,
            maxHeaderSize: 16384,
            headers: { Accept: 'application/xml,text/xml,application/gzip', 'Accept-Encoding': 'gzip',
                'User-Agent': 'ioBroker.loewe-tv XMLTV' },
        }, response => {
            response.on('error', () => {});
            resolve({ status: response.statusCode, headers: response.headers, body: response });
        });
        request.once('error', () => reject(invalid('Die HTTP-Verbindung ist fehlgeschlagen.', 'XMLTV_NETWORK')));
    });
}

async function abortableRequest(transport, url, signal) {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
        const abort = () => {
            try { checkAbort(signal); } catch (error) { reject(error); }
        };
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => {
            checkAbort(signal);
            return transport(url, { signal, redirect: 'manual',
                headers: { Accept: 'application/xml,text/xml,application/gzip', 'Accept-Encoding': 'gzip' } });
        })
            .then(response => {
                signal.removeEventListener('abort', abort);
                if (signal.aborted) { discard(response); abort(); }
                else resolve(response);
            }, () => {
                signal.removeEventListener('abort', abort);
                if (signal.aborted) abort();
                else reject(invalid('Die HTTP-Verbindung ist fehlgeschlagen.', 'XMLTV_NETWORK'));
            });
    });
}

function abortableRead(iterator, signal) {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
        const abort = () => {
            try { checkAbort(signal); } catch (error) { reject(error); }
        };
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => { checkAbort(signal); return iterator.next(); }).then(result => {
            signal.removeEventListener('abort', abort);
            if (signal.aborted) abort();
            else resolve(result);
        }, error => {
            signal.removeEventListener('abort', abort);
            reject(error);
        });
    });
}

/** XMLTV timestamps with minute/second precision; omitted timezone means UTC. */
function parseXmltvTime(value) {
    if (typeof value !== 'string') throw invalid('Eine Sendezeit fehlt oder ist ungültig.', 'XMLTV_TIME');
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s+([+-]\d{4}|UTC|GMT|Z))?$/u.exec(value.trim());
    if (!match) throw invalid('Sendezeiten benötigen YYYYMMDDhhmm[ss] und optional einen numerischen UTC-Versatz.', 'XMLTV_TIME');
    const [, year, month, day, hour, minute, second = '00', zone = 'UTC'] = match;
    const parts = [year, month, day, hour, minute, second].map(Number);
    const [y, m, d, h, min, sec] = parts;
    if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || sec > 59) {
        throw invalid('Eine Sendezeit enthält ungültige Kalenderwerte.', 'XMLTV_TIME');
    }
    const date = new Date(0);
    date.setUTCFullYear(y, m - 1, d);
    date.setUTCHours(h, min, sec, 0);
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        throw invalid('Eine Sendezeit enthält ein ungültiges Kalenderdatum.', 'XMLTV_TIME');
    }
    let offset = 0;
    if (/^[+-]/u.test(zone)) {
        const hours = Number(zone.slice(1, 3));
        const minutes = Number(zone.slice(3, 5));
        if (hours > 23 || minutes > 59) throw invalid('Der UTC-Versatz einer Sendezeit ist ungültig.', 'XMLTV_TIME');
        offset = (hours * 60 + minutes) * 60000 * (zone[0] === '+' ? 1 : -1);
    }
    return date.getTime() - offset;
}

function identifier(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw invalid('Eine Senderkennung fehlt oder ist ungültig.');
    }
    return value;
}

function normalizeName(value) {
    return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE') : '';
}

function languageRank(lang) {
    if (/^(de|deu|ger)(?:[-_]|$)/iu.test(lang)) return 0;
    return lang ? 2 : 1;
}

function parserState(now) {
    const channels = new Map();
    const stack = [];
    let current = null;
    let capture = null;
    let rootSeen = false;
    let rootClosed = false;
    let programmeCount = 0;
    let retainedEvents = 0;
    let retainedBytes = 0;
    const first = now - XMLTV_LIMITS.lookback;
    const last = now + XMLTV_LIMITS.future;

    function budget(deltaBytes = 0, deltaEvents = 0) {
        retainedBytes += deltaBytes;
        retainedEvents += deltaEvents;
        if (retainedBytes > XMLTV_LIMITS.retainedBytes || retainedEvents > XMLTV_LIMITS.retainedEvents) {
            throw invalid('Der Guide überschreitet das Limit für gespeicherte Programmdaten. Bitte die Senderauswahl des Guides verkleinern.', 'XMLTV_LIMIT');
        }
    }

    function getChannel(id) {
        let channel = channels.get(id);
        if (!channel) {
            if (channels.size >= XMLTV_LIMITS.channels) throw invalid('Der Guide enthält zu viele Sender.', 'XMLTV_LIMIT');
            channel = { id, names: [], events: [], _defined: false, _running: [], _latestPast: [],
                _latestPastStart: null, _latestPastOverflow: false, _latestPastUnknown: false,
                _future: [], _futureCutoff: null };
            channels.set(id, channel);
            budget(Buffer.byteLength(id) + 128);
        }
        return channel;
    }

    function eventSize(event) {
        return 160 + ['title', 'subtitle', 'description'].reduce((sum, key) => sum + Buffer.byteLength(event[key]), 0);
    }

    function compareEvent(a, b) { return a.start - b.start || a.eventId.localeCompare(b.eventId); }

    function duplicateOf(values, event) {
        const duplicate = values.find(value => value.eventId === event.eventId);
        if (!duplicate) return false;
        if (['title', 'subtitle', 'description', 'start', 'end'].some(key => duplicate[key] !== event[key])) {
            throw invalid('Doppelte Programmeinträge widersprechen sich.');
        }
        return true;
    }

    function setCutoff(channel, start) {
        if (channel._futureCutoff === null || start < channel._futureCutoff) channel._futureCutoff = start;
    }

    function unsafeLimit() {
        return invalid('Das Senderlimit würde laufende oder mehrdeutige Programmdaten abschneiden. Bitte den Guide eingrenzen.', 'XMLTV_LIMIT');
    }

    function keepProgramme(record) {
        if (!record.title) throw invalid('Ein Programmeintrag enthält keinen Titel.');
        const channel = getChannel(record.channel);
        if (record.start > last) {
            setCutoff(channel, record.start);
            return;
        }
        if (record.start > now && channel._futureCutoff !== null && record.start >= channel._futureCutoff) return;
        const eventId = `xmltv:${createHash('sha256').update(JSON.stringify([record.channel, record.start, record.title])).digest('hex')}`;
        const event = { eventId, title: record.title, subtitle: record.subtitle || '', description: record.description || '',
            start: record.start, end: record.end, endEstimated: false };

        if (record.start <= now) {
            // Every actual past start closes an earlier missing stop, even if
            // that successor has already ended or lies outside the lookback.
            if (channel._latestPastStart === null || record.start > channel._latestPastStart) {
                budget(-channel._latestPast.reduce((sum, value) => sum + eventSize(value), 0), -channel._latestPast.length);
                channel._latestPast = [];
                channel._latestPastStart = record.start;
                channel._latestPastOverflow = false;
                channel._latestPastUnknown = false;
            }
            if (duplicateOf(channel._running, event) || duplicateOf(channel._latestPast, event)) return;
            if (record.end !== null && record.end > now) {
                // An old start is no reason to discard a still-running overlap.
                if (channel._running.length >= XMLTV_LIMITS.eventsPerDirection) throw unsafeLimit();
                channel._running.push(event);
                budget(eventSize(event), 1);
            } else if (record.start === channel._latestPastStart) {
                channel._latestPastUnknown ||= record.end === null;
                // Keep the latest group's ended rows too, so an unknown stop
                // cannot silently contradict an already-read duplicate there.
                // A later past group may still prove this entire group expired.
                if (channel._latestPast.length >= XMLTV_LIMITS.eventsPerDirection) channel._latestPastOverflow = true;
                else {
                    channel._latestPast.push(event);
                    budget(eventSize(event), 1);
                }
            }
            return;
        }

        const values = channel._future;
        if (duplicateOf(values, event)) return;
        values.push(event);
        values.sort(compareEvent);
        let bytes = eventSize(event);
        let count = 1;
        if (values.length > XMLTV_LIMITS.eventsPerDirection) {
            // Remove a complete final start group, never just one alternative.
            // Its start remains the true successor for estimating missing stops.
            const removedStart = values.at(-1).start;
            setCutoff(channel, removedStart);
            while (values.at(-1)?.start === removedStart) {
                bytes -= eventSize(values.pop());
                count--;
            }
        }
        budget(bytes, count);
    }

    function selectedEvents(channel) {
        const future = channel._future;
        const cutoff = channel._futureCutoff;
        const latestWithinLookback = channel._latestPastStart !== null && channel._latestPastStart >= first;
        const keepUnknown = latestWithinLookback || channel._running.length > 0;
        if (keepUnknown && channel._latestPastUnknown && channel._latestPastOverflow) throw unsafeLimit();
        const unknown = keepUnknown ? channel._latestPast.filter(event => event.end === null) : [];
        const past = [...channel._running, ...unknown];
        if (past.length > XMLTV_LIMITS.eventsPerDirection) throw unsafeLimit();
        // An overflowing earliest future group is mandatory "next" evidence.
        if (!future.length && cutoff !== null && cutoff <= last) throw unsafeLimit();

        function estimate(event, nextStart) {
            if (event.end === null && nextStart !== null && nextStart > event.start) {
                event.end = nextStart;
                event.endEstimated = true;
            }
        }
        // An ancient unknown stop must not become current solely because a
        // distant future programme happened to be present in the same guide.
        if (latestWithinLookback) {
            const firstFutureStart = future[0]?.start ?? cutoff;
            for (const event of unknown) estimate(event, firstFutureStart);
        }
        for (let begin = 0; begin < future.length;) {
            let end = begin + 1;
            while (end < future.length && future[end].start === future[begin].start) end++;
            const nextStart = future[end]?.start ?? cutoff;
            for (let index = begin; index < end; index++) estimate(future[index], nextStart);
            begin = end;
        }

        let count = future.length;
        if (cutoff !== null) {
            // A kept known end may not cross the first omitted start. Otherwise
            // a later cache tick could report it alone after losing its overlap.
            let latestEnd = past.reduce((maximum, event) => Math.max(maximum, event.end ?? -Infinity), -Infinity);
            let safeCount = null;
            for (let index = 0; index < future.length; index++) {
                latestEnd = Math.max(latestEnd, future[index].end ?? -Infinity);
                const nextStart = future[index + 1]?.start ?? cutoff;
                if (future[index].start !== nextStart && latestEnd <= nextStart) safeCount = index + 1;
            }
            if (future.length) {
                if (safeCount === null) throw unsafeLimit();
                count = safeCount;
            } else if (latestEnd > cutoff) throw unsafeLimit();
        }
        return [...past, ...future.slice(0, count)].sort(compareEvent);
    }

    const parser = sax.parser(true, { trim: false, normalize: false, strictEntities: true });
    parser.onerror = error => {
        if (/^Max buffer length exceeded/u.test(error.message)) throw invalid('Ein XML-Element ist zu groß.', 'XMLTV_LIMIT');
        throw invalid('Der Guide ist kein gültiges XMLTV-Dokument.');
    };
    parser.ondoctype = declaration => {
        // SAX never loads an external DTD. Accept the standard declaration,
        // but reject internal subsets/entities and unrelated HTML doctypes.
        if (!/^tv(?:\s+SYSTEM\s+(?:"[^"\[\]<>]{1,2048}"|'[^'\[\]<>]{1,2048}')|\s+PUBLIC\s+(?:"[^"\[\]<>]{1,2048}"|'[^'\[\]<>]{1,2048}')\s+(?:"[^"\[\]<>]{1,2048}"|'[^'\[\]<>]{1,2048}'))?\s*$/u.test(declaration.trim())) {
            throw invalid('Interne DTDs, Entitäten und fremde Dokumenttypen werden nicht unterstützt.');
        }
    };
    parser.onprocessinginstruction = instruction => {
        if (instruction.name.toLowerCase() !== 'xml') return;
        const encoding = /\bencoding\s*=\s*['"]([^'"]+)['"]/iu.exec(instruction.body);
        if (encoding && !/^utf-?8$/iu.test(encoding[1])) throw invalid('Der Guide muss als UTF-8 kodiert sein.');
    };
    parser.onattribute = attribute => {
        if (attribute.name.length > 128 || attribute.value.length > 4096) {
            throw invalid('Ein XML-Attribut überschreitet die zulässige Größe.', 'XMLTV_LIMIT');
        }
    };
    parser.onopentag = node => {
        stack.push(node.name);
        if (stack.length > 32 || Object.keys(node.attributes).length > 64) {
            throw invalid('Das XML-Dokument ist zu stark verschachtelt oder enthält zu viele Attribute.', 'XMLTV_LIMIT');
        }
        if (stack.length === 1) {
            if (node.name !== 'tv' || rootSeen) throw invalid('Das Wurzelelement muss genau einmal tv sein.');
            rootSeen = true;
        } else if (stack.length === 2) {
            if (node.name === 'channel') {
                current = { kind: 'channel', id: identifier(node.attributes.id), names: [] };
            } else if (node.name === 'programme') {
                if (++programmeCount > XMLTV_LIMITS.programmes) throw invalid('Der Guide enthält zu viele Programmeinträge.', 'XMLTV_LIMIT');
                const start = parseXmltvTime(node.attributes.start);
                const end = node.attributes.stop === undefined ? null : parseXmltvTime(node.attributes.stop);
                if (end !== null && end <= start) throw invalid('Das Ende einer Sendung liegt nicht nach ihrem Start.', 'XMLTV_TIME');
                current = { kind: 'programme', channel: identifier(node.attributes.channel), start, end, ranks: {} };
            } else throw invalid('Unter tv werden nur channel und programme unterstützt.');
        } else if (stack.length === 3 && current) {
            if (current.kind === 'channel' && node.name === 'display-name') {
                capture = { name: node.name, key: 'names', text: '', maximum: 512 };
            } else if (current.kind === 'programme' && ['title', 'sub-title', 'desc'].includes(node.name)) {
                capture = { name: node.name, key: { title: 'title', 'sub-title': 'subtitle', desc: 'description' }[node.name],
                    lang: node.attributes.lang || '', text: '', maximum: node.name === 'desc' ? 16384 : 1024 };
            }
        } else if (capture) throw invalid('Titel, Beschreibungen und Sendernamen müssen Text enthalten.');
    };
    const appendText = value => {
        if (!capture) return;
        if (capture.text.length + value.length > capture.maximum) throw invalid('Ein Textfeld im Guide ist zu lang.', 'XMLTV_LIMIT');
        capture.text += value;
    };
    parser.ontext = appendText;
    parser.oncdata = appendText;
    parser.onclosetag = name => {
        if (capture && stack.length === 3 && name === capture.name) {
            const value = capture.text.trim().replace(/\s+/gu, ' ');
            if (value) {
                if (capture.key === 'names') {
                    if (!current.names.includes(value)) {
                        if (current.names.length >= 16) throw invalid('Ein Sender hat zu viele Anzeigenamen.', 'XMLTV_LIMIT');
                        current.names.push(value);
                    }
                } else {
                    const rank = languageRank(capture.lang);
                    if (current.ranks[capture.key] === undefined || rank < current.ranks[capture.key]) {
                        current[capture.key] = value;
                        current.ranks[capture.key] = rank;
                    }
                }
            }
            capture = null;
        }
        if (stack.length === 2) {
            if (current.kind === 'channel') {
                if (!current.names.length) throw invalid('Eine Senderdefinition enthält keinen Anzeigenamen.');
                const channel = getChannel(current.id);
                const names = [...current.names].sort();
                if (channel._defined && JSON.stringify([...channel.names].sort()) !== JSON.stringify(names)) {
                    throw invalid('Mehrere Senderdefinitionen verwenden dieselbe ID mit unterschiedlichen Namen.');
                }
                if (!channel._defined) {
                    channel._defined = true;
                    channel.names = current.names;
                    budget(channel.names.reduce((sum, value) => sum + Buffer.byteLength(value), 0));
                }
            } else keepProgramme(current);
            current = null;
        }
        if (stack.length === 1) rootClosed = true;
        stack.pop();
    };

    async function finish(signal) {
        parser.close();
        if (!rootSeen || !rootClosed || stack.length) throw invalid('Das XMLTV-Dokument ist unvollständig.');
        let processed = 0;
        const names = new Map();
        for (const channel of channels.values()) {
            checkAbort(signal);
            channel.events = selectedEvents(channel);
            const staged = [...channel._running, ...channel._latestPast, ...channel._future];
            budget(channel.events.reduce((sum, event) => sum + eventSize(event), 0)
                - staged.reduce((sum, event) => sum + eventSize(event), 0), channel.events.length - staged.length);
            delete channel._running;
            delete channel._latestPast;
            delete channel._latestPastStart;
            delete channel._latestPastOverflow;
            delete channel._latestPastUnknown;
            delete channel._future;
            delete channel._futureCutoff;
            delete channel._defined;
            for (const key of new Set(channel.names.map(normalizeName))) {
                if (!key) continue;
                if (!names.has(key)) names.set(key, []);
                names.get(key).push(channel);
            }
            if (++processed % 100 === 0) await nextTurn();
        }
        channelNameIndexes.set(channels, { size: channels.size, names });
        return channels;
    }
    return { parser, finish };
}

async function parseBody(response, now, signal) {
    if (!response.body || !response.body[Symbol.asyncIterator]) throw invalid('Die HTTP-Antwort enthält keinen lesbaren Datenstrom.', 'XMLTV_NETWORK');
    const contentLength = header(response, 'content-length');
    if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > XMLTV_LIMITS.wireBytes)) {
        throw invalid('Der Guide überschreitet das Downloadlimit.', 'XMLTV_LIMIT');
    }
    const encoding = header(response, 'content-encoding').trim().toLowerCase();
    if (!['', 'identity', 'gzip', 'x-gzip'].includes(encoding)) {
        throw invalid('Der Guide verwendet eine nicht unterstützte Komprimierung.', 'XMLTV_ENCODING');
    }
    let wireBytes = 0;
    async function* wireChunks() {
        for await (const value of response.body) {
            checkAbort(signal);
            if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array) && typeof value !== 'string') {
                throw invalid('Die HTTP-Antwort enthält ungültige Daten.', 'XMLTV_NETWORK');
            }
            const size = typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
            wireBytes += size;
            if (wireBytes > XMLTV_LIMITS.wireBytes) throw invalid('Der Guide überschreitet das Downloadlimit.', 'XMLTV_LIMIT');
            const buffer = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            if (buffer.length) yield buffer;
        }
    }
    const iterator = wireChunks()[Symbol.asyncIterator]();
    const leading = [];
    let leadingBytes = 0;
    // Peek only at the first two bytes; .xml.gz is frequently served without a
    // Content-Encoding header. Every byte is still counted before inflation.
    while (leadingBytes < 2) {
        checkAbort(signal);
        const part = await abortableRead(iterator, signal);
        if (part.done) break;
        leading.push(part.value);
        leadingBytes += part.value.length;
    }
    const prefix = leading.length ? Buffer.concat(leading.map(value => value.subarray(0, 2)), 2) : Buffer.alloc(0);
    const gzip = ['gzip', 'x-gzip'].includes(encoding) || (prefix[0] === 0x1f && prefix[1] === 0x8b);
    async function* allChunks() {
        yield* leading;
        try {
            for (;;) {
                checkAbort(signal);
                const value = await abortableRead(iterator, signal);
                if (value.done) break;
                yield value.value;
            }
        } finally { await iterator.return?.(); }
    }
    let decodedBytes = 0;
    const counter = new Transform({ transform(chunk, _encoding, callback) {
        decodedBytes += chunk.length;
        callback(decodedBytes > XMLTV_LIMITS.decodedBytes ? invalid('Der entpackte Guide ist zu groß.', 'XMLTV_LIMIT') : null, chunk);
    } });
    const source = Readable.from(allChunks());
    const output = new PassThrough();
    const streams = gzip ? [source, createGunzip({ chunkSize: XMLTV_LIMITS.chunkBytes }), counter, output] : [source, counter, output];
    let pipelineError;
    const completed = pipeline(...streams, { signal }).catch(error => { pipelineError = error; });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const state = parserState(now);
    try {
        for await (const chunk of output) {
            for (let offset = 0; offset < chunk.length; offset += XMLTV_LIMITS.chunkBytes) {
                checkAbort(signal);
                let text;
                try { text = decoder.decode(chunk.subarray(offset, offset + XMLTV_LIMITS.chunkBytes), { stream: true }); }
                catch { throw invalid('Der Guide enthält ungültiges UTF-8.'); }
                state.parser.write(text);
                await nextTurn();
            }
        }
        await completed;
        if (pipelineError) throw pipelineError;
        checkAbort(signal);
        try { state.parser.write(decoder.decode()); }
        catch (error) {
            if (error.code?.startsWith('XMLTV_')) throw error;
            throw invalid('Der Guide enthält unvollständiges UTF-8.');
        }
        return await state.finish(signal);
    } finally {
        for (const stream of streams) stream.destroy();
        discard(response);
        // Do not await a third-party AsyncIterable that ignores cancellation.
        // All owned sockets and parsing streams have already been destroyed.
    }
}

/**
 * Load XMLTV once for every configured TV channel. fetchImpl, if injected, must
 * return a raw response {status, headers, body: AsyncIterable<Uint8Array>} and
 * honour signal. It must not transparently decompress the body.
 */
async function loadXmltv(url, { now = Date.now(), deadline, signal, fetchImpl } = {}) {
    if (!Number.isFinite(now) || (deadline !== undefined && !Number.isFinite(deadline))) {
        throw invalid('Der Abfragezeitpunkt oder das Zeitlimit ist ungültig.', 'XMLTV_TIME');
    }
    let currentUrl = checkedUrl(url);
    const controller = new AbortController();
    const abort = () => controller.abort(invalid('Der Abruf wurde abgebrochen.', 'XMLTV_ABORTED'));
    const end = Math.min(Date.now() + XMLTV_LIMITS.timeout, deadline ?? Infinity);
    const timer = setTimeout(() => controller.abort(invalid('Das Zeitlimit für den Guide-Abruf ist abgelaufen.', 'XMLTV_TIMEOUT')),
        Math.max(0, end - Date.now()));
    timer.unref?.();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const transport = fetchImpl || openHttp;
    let response;
    const cancelBody = () => discard(response);
    controller.signal.addEventListener('abort', cancelBody);
    try {
        if (end <= Date.now()) throw invalid('Das Zeitlimit für den Guide-Abruf ist abgelaufen.', 'XMLTV_TIMEOUT');
        for (let redirects = 0; ; redirects++) {
            checkAbort(controller.signal);
            response = await abortableRequest(transport, currentUrl, controller.signal);
            const status = response?.status;
            if ([301, 302, 303, 307, 308].includes(status)) {
                if (redirects >= XMLTV_LIMITS.redirects) throw invalid('Zu viele Weiterleitungen beim Guide-Abruf.', 'XMLTV_REDIRECT');
                const location = header(response, 'location');
                if (!location) throw invalid('Eine Weiterleitung enthält kein Ziel.', 'XMLTV_REDIRECT');
                const next = checkedUrl(location, currentUrl);
                discard(response);
                response = null;
                currentUrl = next;
                continue;
            }
            if (status !== 200) throw invalid(`Der Guide-Server meldet HTTP ${Number.isInteger(status) ? status : 'unbekannt'}.`, 'XMLTV_HTTP');
            const channels = await parseBody(response, now, controller.signal);
            checkAbort(controller.signal);
            return { channels, fetchedAt: Date.now() };
        }
    } catch (error) {
        if (controller.signal.aborted) checkAbort(controller.signal);
        if (error.code?.startsWith('XMLTV_')) throw error;
        throw invalid('Der Guide konnte nicht vollständig gelesen oder entpackt werden.', 'XMLTV_NETWORK');
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.signal.removeEventListener('abort', cancelBody);
        discard(response);
        if (!controller.signal.aborted) controller.abort(invalid('Der Abruf wurde beendet.', 'XMLTV_ABORTED'));
    }
}

/** Exact explicit IDs take precedence over names; never guess an HD/SD feed. */
function resolveXmltvChannel(feed, service, mappings = []) {
    const failure = error => ({ channel: null, error });
    if (!(feed?.channels instanceof Map) || !service || !Array.isArray(mappings)) {
        return failure('XMLTV-Zuordnung oder Senderdaten sind ungültig.');
    }
    if (mappings.length > XMLTV_LIMITS.channels || mappings.some(mapping => !mapping || typeof mapping !== 'object'
        || typeof mapping.channel !== 'string' || !mapping.channel.trim() || mapping.channel.length > 1024
        || typeof mapping.xmltvId !== 'string' || !mapping.xmltvId.trim() || mapping.xmltvId.length > 512)) {
        return failure('Die konfigurierte XMLTV-Zuordnung ist ungültig.');
    }
    const idMatches = typeof service.id === 'string' ? mappings.filter(mapping => mapping.channel === service.id) : [];
    const nameMatches = typeof service.name === 'string' ? mappings.filter(mapping => mapping.channel === service.name) : [];
    const explicit = idMatches.length ? idMatches : nameMatches;
    if (explicit.length) {
        const ids = new Set(explicit.map(mapping => mapping.xmltvId));
        if (ids.size !== 1) return failure('Für diesen Sender sind widersprüchliche XMLTV-Zuordnungen konfiguriert.');
        const channel = feed.channels.get(explicit[0].xmltvId);
        return channel ? { channel } : failure('Die konfigurierte XMLTV-ID ist im Guide nicht vorhanden.');
    }
    const name = normalizeName(service.name);
    if (!name) return failure('Für diesen Sender ist keine XMLTV-Zuordnung möglich.');
    let index = channelNameIndexes.get(feed.channels);
    if (!index || index.size !== feed.channels.size) {
        index = { size: feed.channels.size, names: new Map() };
        for (const channel of feed.channels.values()) {
            for (const key of new Set(channel.names.map(normalizeName))) {
                if (!index.names.has(key)) index.names.set(key, []);
                index.names.get(key).push(channel);
            }
        }
        channelNameIndexes.set(feed.channels, index);
    }
    const matches = index.names.get(name) || [];
    if (matches.length === 1) return { channel: matches[0] };
    return failure(matches.length ? 'Mehrere XMLTV-Sender haben denselben Namen. Bitte eine XMLTV-ID zuordnen.'
        : 'Kein XMLTV-Sendername stimmt überein. Bitte eine XMLTV-ID zuordnen.');
}

module.exports = { loadXmltv, resolveXmltvChannel, parseXmltvTime, XMLTV_LIMITS };
