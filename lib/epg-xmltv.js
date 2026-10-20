'use strict';

const http = require('node:http');
const https = require('node:https');
const { createHash } = require('node:crypto');
const { Readable, PassThrough, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGunzip } = require('node:zlib');
const { setImmediate: nextTurn } = require('node:timers/promises');
const sax = require('sax');

const { resolveMappings, normalizeManualMappings, safeIconUrl, MAPPING_LIMITS } = require('./epg-mapping');
const { resolveSourceMappings } = require('./epg-provider');


// XMLTV's own DTD defines channel metadata before programmes, optional stops,
// and UTC when a timezone is absent:
// https://github.com/XMLTV/xmltv/blob/b424ef772a667856ca44b9dac3b4310d02191dea/xmltv.dtd
const HOUR = 3600000;
const XMLTV_LIMITS = Object.freeze({
    timeout: 30000, redirects: 3, wireBytes: 16 * 1024 * 1024,
    decodedBytes: 64 * 1024 * 1024, chunkBytes: 16 * 1024,
    programmes: 500000, channels: MAPPING_LIMITS.channels,
    eventsPerChannel: 2048, retainedEvents: 65536,
    retainedBytes: 24 * 1024 * 1024, metadataBytes: 8 * 1024 * 1024,
    lookback: 24 * HOUR, future: 48 * HOUR,
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
    if (typeof value !== 'string' || !value || value.length > 8192
        || /[\u0000-\u0020\u007f]/u.test(value) || !value.isWellFormed()) {
        throw invalid('Die Guide-URL ist ungültig.', 'XMLTV_URL');
    }
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
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s+([+-]\d{4}|UTC|GMT|Z|BST))?$/u.exec(value.trim());
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
    // The XMLTV DTD explicitly defines BST as +0100. Other ambiguous local
    // abbreviations are not guessed; feeds can supply a numeric UTC offset.
    let offset = zone === 'BST' ? HOUR : 0;
    if (/^[+-]/u.test(zone)) {
        const hours = Number(zone.slice(1, 3));
        const minutes = Number(zone.slice(3, 5));
        if (hours > 23 || minutes > 59) throw invalid('Der UTC-Versatz einer Sendezeit ist ungültig.', 'XMLTV_TIME');
        offset = (hours * 60 + minutes) * 60000 * (zone[0] === '+' ? 1 : -1);
    }
    return date.getTime() - offset;
}


function xmltvSourceKey(value) {
    return createHash('sha256').update(checkedUrl(value).href).digest('hex');
}

function identifier(value) {
    if (typeof value !== 'string' || !value || value !== value.trim()
        || Buffer.byteLength(value) > 512 || /[\u0000-\u001f\u007f]/u.test(value) || !value.isWellFormed()) {
        throw invalid('Eine Senderkennung fehlt oder ist ungültig.');
    }
    return value;
}

function languageRank(lang) {
    if (/^(de|deu|ger)(?:[-_]|$)/iu.test(lang)) return 0;
    return lang ? 2 : 1;
}

function validText(value) {
    if (!value.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value)) {
        throw invalid('Der Guide enthält ungültige XML-Zeichen.');
    }
}

// sax's strict mode still accepts a raw '<' inside a quoted attribute and a
// raw ']]>' in character data. This bounded lexical guard closes those gaps
// across chunk boundaries while leaving comments, CDATA and PIs to sax.
function lexicalGuard() {
    let mode = 'text';
    let opener = '';
    let quote = '';
    let tail = '';
    return text => {
        for (const character of text) {
            if (mode === 'text') {
                if (character === '<') { mode = 'open'; opener = '<'; tail = ''; }
                else {
                    if (character === '>' && tail === ']]') throw invalid('Der Guide enthält eine ungültige XML-Textbegrenzung.');
                    tail = (tail + character).slice(-2);
                }
            } else if (mode === 'open') {
                opener += character;
                if (opener === '<?') { mode = 'pi'; tail = ''; }
                else if (opener === '<!--') { mode = 'comment'; tail = ''; }
                else if (opener === '<![CDATA[') { mode = 'cdata'; tail = ''; }
                else if (opener === '<!DOCTYPE') { mode = 'declaration'; quote = ''; }
                else if (!['<!--', '<![CDATA[', '<!DOCTYPE'].some(value => value.startsWith(opener))) {
                    mode = character === '>' ? 'text' : 'tag';
                    quote = '';
                    tail = '';
                }
            } else if (mode === 'tag' || mode === 'declaration') {
                if (quote) {
                    if (mode === 'tag' && character === '<') throw invalid('Ein XML-Attribut enthält ein unmaskiertes Kleinerzeichen.');
                    if (character === quote) quote = '';
                } else if (character === '"' || character === "'") quote = character;
                else if (character === '>') { mode = 'text'; tail = ''; }
            } else {
                const close = mode === 'pi' ? '?>' : mode === 'comment' ? '-->' : ']]>';
                tail = (tail + character).slice(-close.length);
                if (tail === close) { mode = 'text'; tail = ''; }
            }
        }
    };
}

function limitsFor(overrides = {}) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw invalid('Ungültige Abrufgrenzen.', 'XMLTV_LIMIT');
    const limits = { ...XMLTV_LIMITS };
    for (const [name, value] of Object.entries(overrides)) {
        if (!Object.hasOwn(limits, name) || !Number.isSafeInteger(value)
            || value < (name === 'redirects' ? 0 : 1) || value > limits[name]) {
            throw invalid('Abrufgrenzen dürfen nur innerhalb der festen Obergrenzen verkleinert werden.', 'XMLTV_LIMIT');
        }
        limits[name] = value;
    }
    return limits;
}

/** Only selected, safely mapped TV services retain programme data. */
function parserState({ services, manual, windowStart, windowEnd, limits, sourceUrl }) {
    const channels = new Map();
    const retained = new Map();
    const context = new Map();
    const stack = [];
    let selected = null;
    let current = null;
    let capture = null;
    let rootSeen = false;
    let rootClosed = false;
    let programmesStarted = false;
    let programmeCount = 0;
    let retainedCount = 0;
    let retainedBytes = 0;
    let metadataBytes = 0;
    let declarations = 0;
    let doctypes = 0;
    let attributeNames = new Set();
    let attributes = Object.create(null);
    let documentPrefix = '';
    const checkSyntax = lexicalGuard();

    function metadata(size) {
        metadataBytes += size;
        if (metadataBytes > limits.metadataBytes) throw invalid('Die Senderliste des Guides ist zu groß.', 'XMLTV_LIMIT');
    }
    function channel(id) {
        if (!channels.has(id)) {
            if (channels.size >= limits.channels) throw invalid('Der Guide enthält zu viele Sender.', 'XMLTV_LIMIT');
            channels.set(id, { id, names: [] });
            metadata(Buffer.byteLength(id) + 96);
        }
        return channels.get(id);
    }
    function selectChannels() {
        if (selected) return;
        const rows = resolveSourceMappings(services, [...channels.values()], manual, sourceUrl);
        selected = new Set(rows.filter(row => ['manual', 'automatic'].includes(row.status)).map(row => row.xmltvId));
        // Channel definitions are optional in XMLTV. An explicit manual ID may
        // first occur on a programme; it is still never guessed from its name.
        for (const row of rows) if (row.status === 'missing' && row.xmltvId) selected.add(row.xmltvId);
    }
    function keepProgramme(record) {
        if (!record.keep) return;
        if (!record.title) throw invalid('Eine ausgewählte Sendung enthält keinen Titel.');
        const eventId = 'xmltv:' + createHash('sha256').update(JSON.stringify([
            record.channel, record.start, record.end, record.title, record.subtitle || '', record.clump || '',
        ])).digest('hex');
        const event = { eventId, title: record.title, subtitle: record.subtitle || '', description: record.description || '',
            start: record.start, end: record.end };
        const target = record.context ? context : retained;
        let events = target.get(record.channel);
        if (!events) { events = new Map(); target.set(record.channel, events); }
        if (record.context && events.size) {
            const previousStart = events.values().next().value.start;
            if (previousStart > event.start) return;
            if (previousStart < event.start) {
                for (const old of events.values()) retainedBytes -= Buffer.byteLength(JSON.stringify(old)) + 80;
                retainedCount -= events.size;
                events.clear();
            }
        }
        const previous = events.get(eventId);
        if (previous) {
            if (JSON.stringify(previous) !== JSON.stringify(event)) throw invalid('Doppelte Sendungen widersprechen sich.');
            return;
        }
        const channelCount = (retained.get(record.channel)?.size || 0) + (context.get(record.channel)?.size || 0);
        if (channelCount >= limits.eventsPerChannel || ++retainedCount > limits.retainedEvents) {
            throw invalid('Der Guide überschreitet die Grenze ausgewählter Sendungen. Bitte Quelle oder Zeitfenster eingrenzen.', 'XMLTV_LIMIT');
        }
        retainedBytes += Buffer.byteLength(JSON.stringify(event)) + 80;
        if (retainedBytes > limits.retainedBytes) throw invalid('Die ausgewählten Programmdaten sind zu groß.', 'XMLTV_LIMIT');
        events.set(eventId, event);
    }

    const parser = sax.parser(true, { trim: false, normalize: false, xmlns: true, strictEntities: true,
        unquotedAttributeValues: false });
    parser.onerror = error => {
        throw invalid(/^Max buffer length exceeded/u.test(error.message) ? 'Ein XML-Element ist zu groß.' : 'Der Guide ist kein gültiges XMLTV-Dokument.',
            /^Max buffer length exceeded/u.test(error.message) ? 'XMLTV_LIMIT' : 'XMLTV_INVALID_XML');
    };
    parser.ondoctype = declaration => {
        // sax never loads an external DTD. Reject internal subsets/entities;
        // the standard external XMLTV declaration is inert and remains usable.
        if (rootSeen || ++doctypes > 1 || !/^tv(?:\s+SYSTEM\s+(?:"[^"\[\]<>]{1,2048}"|'[^'\[\]<>]{1,2048}')|\s+PUBLIC\s+(?:"[^"\[\]<>]{1,2048}"|'[^'\[\]<>]{1,2048}')\s+(?:"[^"\[\]<>]{1,2048}"|'[^'\[\]<>]{1,2048}'))?\s*$/u.test(declaration.trim())) {
            throw invalid('Interne DTDs, Entitäten und fremde Dokumenttypen werden nicht unterstützt.');
        }
    };
    parser.onprocessinginstruction = instruction => {
        if (instruction.name.toLowerCase() !== 'xml') return;
        if (instruction.name !== 'xml' || rootSeen || ++declarations > 1 || !/^<\?xml\s/u.test(documentPrefix)
            || !/^version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])UTF-?8\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*$/iu.test(instruction.body.trim())) {
            throw invalid('Der Guide benötigt eine gültige XML-1.0-Deklaration in UTF-8.', 'XMLTV_ENCODING');
        }
    };
    parser.onopentagstart = () => {
        attributeNames = new Set();
        attributes = Object.create(null);
    };
    parser.onattribute = attribute => {
        const key = attribute.uri + '\0' + attribute.local;
        if (attributeNames.has(key)) throw invalid('Das XML enthält ein doppeltes Attribut.');
        attributeNames.add(key);
        if (attributeNames.size > 64 || attribute.name.length > 128 || attribute.value.length > 4096) {
            throw invalid('Ein XML-Attribut überschreitet die zulässige Größe.', 'XMLTV_LIMIT');
        }
        validText(attribute.value);
        if (!attribute.uri) attributes[attribute.name] = attribute.value;
    };
    parser.onopentag = node => {
        stack.push(node.name);
        if (stack.length > 32) throw invalid('Das XML-Dokument ist zu stark verschachtelt.', 'XMLTV_LIMIT');
        if (stack.length === 1) {
            if (node.name !== 'tv' || node.uri || rootSeen) throw invalid('Das Wurzelelement muss genau einmal tv sein.');
            rootSeen = true;
        } else if (stack.length === 2) {
            if (node.uri) throw invalid('XMLTV-Sender und Sendungen benötigen den XMLTV-Dokumentaufbau.');
            if (node.name === 'channel') {
                if (programmesStarted) throw invalid('XMLTV-Senderdefinitionen müssen vor den Sendungen stehen.');
                const id = identifier(attributes.id);
                if (channels.has(id)) throw invalid('Mehrere Senderdefinitionen verwenden dieselbe XMLTV-ID.');
                current = { kind: 'channel', id, names: [] };
            } else if (node.name === 'programme') {
                programmesStarted = true;
                if (++programmeCount > limits.programmes) throw invalid('Der Guide enthält zu viele Programmeinträge.', 'XMLTV_LIMIT');
                selectChannels();
                const id = identifier(attributes.channel);
                channel(id);
                current = { kind: 'programme', channel: id, keep: false };
                if (selected.has(id)) {
                    const start = parseXmltvTime(attributes.start);
                    const end = attributes.stop === undefined ? null : parseXmltvTime(attributes.stop);
                    if (end !== null && end <= start) throw invalid('Das Sendungsende liegt nicht nach dem Start.', 'XMLTV_TIME');
                    // Include known intervals overlapping the requested window.
                    // Unknown stops never acquire an invented duration.
                    // Keep only the latest whole pre-window unknown-start group
                    // temporarily. It may disprove a long overlapping interval;
                    // dropping that evidence could manufacture a current show.
                    const outside = end === null && start < windowStart;
                    const latest = context.get(id)?.values().next().value?.start;
                    const keep = start < windowEnd && (outside ? latest === undefined || start >= latest
                        : end === null || end > windowStart);
                    Object.assign(current, { start, end, keep, context: outside, clump: attributes.clumpidx || '', ranks: {} });
                }
            } else throw invalid('Unter tv werden nur channel und programme unterstützt.');
        } else if (stack.length === 3 && current && !node.uri) {
            if (current.kind === 'channel' && node.name === 'display-name') {
                capture = { name: node.name, key: 'names', text: '', maximum: 512 };
            } else if (current.kind === 'channel' && node.name === 'icon' && !current.iconUrl) {
                const iconUrl = safeIconUrl(attributes.src);
                if (iconUrl) current.iconUrl = iconUrl;
            } else if (current.kind === 'programme' && current.keep && ['title', 'sub-title', 'desc'].includes(node.name)) {
                capture = { name: node.name, key: { title: 'title', 'sub-title': 'subtitle', desc: 'description' }[node.name],
                    lang: attributes.lang || '', text: '', maximum: node.name === 'desc' ? 16384 : 1024 };
            }
        } else if (capture) throw invalid('Titel, Beschreibungen und Sendernamen müssen Text enthalten.');
    };
    const appendText = value => {
        validText(value);
        if (stack.length <= 2 && value.trim()) throw invalid('Text außerhalb der XMLTV-Datenfelder ist nicht zulässig.');
        if (!capture) return;
        if (capture.text.length + value.length > capture.maximum) throw invalid('Ein Textfeld im Guide ist zu lang.', 'XMLTV_LIMIT');
        capture.text += value;
    };
    parser.ontext = appendText;
    parser.oncdata = value => {
        if (!stack.length) throw invalid('CDATA außerhalb des XMLTV-Dokuments ist nicht zulässig.');
        appendText(value);
    };
    parser.onclosetag = name => {
        if (capture && stack.length === 3 && name === capture.name) {
            const value = capture.text.trim().replace(/\s+/gu, ' ');
            if (value) {
                if (capture.key === 'names') {
                    if (!current.names.includes(value)) {
                        if (current.names.length >= MAPPING_LIMITS.names) throw invalid('Ein Sender hat zu viele Anzeigenamen.', 'XMLTV_LIMIT');
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
                const value = channel(current.id);
                value.names = current.names;
                if (current.iconUrl) value.iconUrl = current.iconUrl;
                metadata(value.names.reduce((sum, name) => sum + Buffer.byteLength(name), 0) + (value.iconUrl?.length || 0));
            } else keepProgramme(current);
            current = null;
        }
        if (stack.length === 1) rootClosed = true;
        stack.pop();
    };
    return {
        write(text) {
            validText(text);
            documentPrefix = (documentPrefix + text).slice(0, 6);
            checkSyntax(text);
            parser.write(text);
        },
        finish() {
            parser.close();
            if (!rootSeen || !rootClosed || stack.length) throw invalid('Das XMLTV-Dokument ist unvollständig.');
            const list = [...channels.values()];
            const mappings = resolveSourceMappings(services, list, manual, sourceUrl);
            const eventsByChannel = new Map();
            for (const [id, extra] of context) {
                const start = extra.values().next().value?.start;
                const target = retained.get(id);
                if (target && [...target.values()].some(event => event.end !== null && event.start <= start)) {
                    for (const [eventId, event] of extra) target.set(eventId, event);
                } else retainedCount -= extra.size;
            }
            for (const row of mappings) {
                if (!['manual', 'automatic'].includes(row.status)) continue;
                const events = [...(retained.get(row.xmltvId)?.values() || [])].sort((a, b) => a.start - b.start
                    || (a.end ?? Infinity) - (b.end ?? Infinity) || a.eventId.localeCompare(b.eventId));
                eventsByChannel.set(row.tvChannelId, events);
            }
            return { channels: list, mappings, eventsByChannel,
                stats: { channels: channels.size, programmes: programmeCount, retainedEvents: retainedCount } };
        },
    };
}


async function parseBody(response, options, signal) {
    const { limits } = options;
    if (!response.body || !response.body[Symbol.asyncIterator]) throw invalid('Die HTTP-Antwort enthält keinen lesbaren Datenstrom.', 'XMLTV_NETWORK');
    const contentLength = header(response, 'content-length');
    if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > limits.wireBytes)) {
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
            if (wireBytes > limits.wireBytes) throw invalid('Der Guide überschreitet das Downloadlimit.', 'XMLTV_LIMIT');
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
        callback(decodedBytes > limits.decodedBytes ? invalid('Der entpackte Guide ist zu groß.', 'XMLTV_LIMIT') : null, chunk);
    } });
    const source = Readable.from(allChunks());
    const output = new PassThrough();
    const streams = gzip ? [source, createGunzip({ chunkSize: Math.max(64, limits.chunkBytes) }), counter, output] : [source, counter, output];
    let pipelineError;
    const completed = pipeline(...streams, { signal }).catch(error => { pipelineError = error; });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const state = parserState(options);
    try {
        for await (const chunk of output) {
            for (let offset = 0; offset < chunk.length; offset += limits.chunkBytes) {
                checkAbort(signal);
                let text;
                try { text = decoder.decode(chunk.subarray(offset, offset + limits.chunkBytes), { stream: true }); }
                catch { throw invalid('Der Guide enthält ungültiges UTF-8.'); }
                state.write(text);
                await nextTurn();
            }
        }
        await completed;
        if (pipelineError) throw pipelineError;
        checkAbort(signal);
        if (contentLength && Number(contentLength) !== wireBytes) throw invalid('Der Guide wurde nicht vollständig übertragen.', 'XMLTV_NETWORK');
        try { state.write(decoder.decode()); }
        catch (error) {
            if (error.code?.startsWith('XMLTV_')) throw error;
            throw invalid('Der Guide enthält unvollständiges UTF-8.');
        }
        const result = state.finish();
        result.stats.wireBytes = wireBytes;
        result.stats.decodedBytes = decodedBytes;
        return result;
    } finally {
        for (const stream of streams) stream.destroy();
        discard(response);
        // Do not await a third-party AsyncIterable that ignores cancellation.
        // All owned sockets and parsing streams have already been destroyed.
    }
}


/**
 * Download a raw HTTP(S) UTF-8 XMLTV stream for selected TV services.
 * An injected fetchImpl must return {status, headers, body: AsyncIterable<Uint8Array>};
 * it must not transparently inflate content. No source URL is chosen implicitly.
 */
async function loadXmltv(url, { services, manualMappings = {}, now = Date.now(),
    windowStart, windowEnd, deadline, signal, fetchImpl, limits: overrides } = {}) {
    const limits = limitsFor(overrides);
    const manual = normalizeManualMappings(manualMappings);
    // Validate TV IDs/names and manual rows before any network request.
    resolveMappings(services, [], manual);
    windowStart ??= now - limits.lookback;
    windowEnd ??= now + limits.future;
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(windowStart) || !Number.isSafeInteger(windowEnd)
        || windowStart >= windowEnd || windowStart < now - limits.lookback || windowEnd > now + limits.future
        || (deadline !== undefined && !Number.isFinite(deadline))) {
        throw invalid('Der Abfragezeitpunkt oder das begrenzte Datumfenster ist ungültig.', 'XMLTV_TIME');
    }
    if (signal !== undefined && (typeof signal?.aborted !== 'boolean' || typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function')) throw invalid('Das Abbruchsignal ist ungültig.', 'XMLTV_ABORTED');
    let currentUrl = checkedUrl(url);
    const sourceKey = xmltvSourceKey(url);
    const controller = new AbortController();
    const abort = () => controller.abort(invalid('Der Abruf wurde abgebrochen.', 'XMLTV_ABORTED'));
    const end = Math.min(Date.now() + limits.timeout, deadline ?? Infinity);
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
                if (redirects >= limits.redirects) throw invalid('Zu viele Weiterleitungen beim Guide-Abruf.', 'XMLTV_REDIRECT');
                const location = header(response, 'location');
                if (!location) throw invalid('Eine Weiterleitung enthält kein Ziel.', 'XMLTV_REDIRECT');
                const next = checkedUrl(location, currentUrl);
                if (currentUrl.protocol === 'https:' && next.protocol === 'http:') {
                    throw invalid('Eine HTTPS-Quelle darf nicht auf unverschlüsseltes HTTP weiterleiten.', 'XMLTV_REDIRECT');
                }
                discard(response);
                response = null;
                currentUrl = next;
                continue;
            }
            if (status !== 200) throw invalid(`Der Guide-Server meldet HTTP ${Number.isInteger(status) ? status : 'unbekannt'}.`, 'XMLTV_HTTP');
            const result = await parseBody(response, { services, manual, windowStart, windowEnd, limits, sourceUrl: url }, controller.signal);
            checkAbort(controller.signal);
            return { source: 'xmltv', fetchedAt: now, sourceKey, ...result };
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

module.exports = { loadXmltv, parseXmltvTime, xmltvSourceKey, XMLTV_LIMITS };


