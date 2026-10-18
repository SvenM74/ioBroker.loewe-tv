'use strict';

const { setImmediate: nextTurn } = require('node:timers/promises');

// Remote API 1.0.47, 8.7.1 and 9.22, documents the DVB identity,
// CreateIterator, fields 2000/2001/2002/2004/2007 and NotifyUpdate=NO.
// Additional named field constants are published in values-epg.h-derived
// model/dvb/model-epg.js in tonymiao2012/qunit_autotest. See docs/epg-protocol.md.
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 64;
const MAX_PAGES = 4;
const MAX_ROWS = PAGE_SIZE * MAX_PAGES;
const DEFAULT_DEADLINE_MS = 30000;
const MAX_DATE_MS = 8640000000000000;
const BASIC_FIELDS = Object.freeze([2000, 2001, 2002, 2004, 2007]);
const EXTENDED_FIELDS = Object.freeze([2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008]);

function epgError(message, code = 'EPG_TV_INVALID') {
    const error = new Error(`TV-EPG: ${message}`);
    error.code = code;
    error.action = 'CreateIterator';
    return error;
}

/** Decode only the format explicitly documented by Loewe; never guess from a name or ch UUID. */
function parseDvbServiceUuid(value) {
    if (typeof value !== 'string') {
        throw epgError('Der Sender hat keine unterstützte DVB-Medienkennung.', 'EPG_TV_UNSUPPORTED');
    }
    const match = /^chl0:00-([0-9a-f]{4})([0-9a-f]{4})ffff([0-9a-f]{4})([0-9a-f]{4})$/iu.exec(value);
    if (!match) throw epgError('Die DVB-Medienkennung hat ein unbekanntes Format.', 'EPG_TV_UNSUPPORTED');
    const [, frontend, onid, tsid, sid] = match;
    const result = {
        frontend: Number.parseInt(frontend, 16),
        onid: Number.parseInt(onid, 16),
        tsid: Number.parseInt(tsid, 16),
        sid: Number.parseInt(sid, 16),
    };
    if (result.sid === 0 || result.tsid === 0) {
        throw epgError('Analoge oder leere DVB-Kennungen werden nicht abgefragt.', 'EPG_TV_UNSUPPORTED');
    }
    return result;
}

function record(value, description) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw epgError(`${description} ist kein einzelnes Objekt.`);
    }
    return value;
}

function scalar(value, description, maxLength = 8192) {
    let text;
    if (typeof value === 'string') text = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(key => key === '#text' || key.startsWith('@_'))
        && (value['#text'] === undefined || typeof value['#text'] === 'string')) {
        text = value['#text'] ?? '';
    } else throw epgError(`${description} ist kein einzelner Textwert.`);
    if (text.length > maxLength || !text.isWellFormed()
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text)) {
        throw epgError(`${description} ist zu lang oder enthält ungültige Zeichen.`);
    }
    return text.trim();
}

function integer(value, description, maximum = Number.MAX_SAFE_INTEGER) {
    const text = scalar(value, description, 32);
    if (!/^\d+$/u.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > maximum) {
        throw epgError(`${description} ist keine gültige nichtnegative Ganzzahl.`);
    }
    return Number(text);
}

function utcMilliseconds(value, description, allowMissing = false) {
    const text = scalar(value, description, 32);
    if (allowMissing && (text === '' || text === '0')) return null;
    const seconds = integer(text, description, MAX_DATE_MS / 1000);
    const milliseconds = seconds * 1000;
    if (!Number.isSafeInteger(milliseconds)) throw epgError(`${description} überschreitet den Zeitbereich.`);
    return milliseconds;
}

function plainChildren(node) {
    return Object.keys(node).filter(key => key !== '#text' && !key.startsWith('@_'));
}

function checkContext({ deadline, signal, generation, source }) {
    if (signal?.aborted || generation !== source._generation) {
        throw epgError('Der Abruf wurde beendet.', 'CLOSED');
    }
    if (Date.now() >= deadline) {
        throw epgError('Das Zeitlimit für diesen Sender wurde erreicht.', 'EPG_TV_LIMIT');
    }
}

function selection(field, value) {
    // Both values are validated integers generated inside this module.
    return `<Selection><Field>${field}</Field><Condition>1</Condition><Value>${value}</Value></Selection>`;
}

function buildIteratorParameters(dvb, fields, startIndex, windowStart, seek) {
    // The documented EPG iterator selects the DVB triplet. Its time comparison
    // belongs to SeekToContentParameters, not the table's Selections. The seek
    // returns an absolute iterator index, used by the following range requests.
    const parameters = '<TableName>de.loewe.sl2.epg</TableName><Type>0</Type><Selections>'
        + selection(2002, dvb.onid) + selection(2000, dvb.sid) + selection(2001, dvb.tsid)
        + '</Selections><Fields>' + fields.map(field => `<Field>${field}</Field>`).join('')
        + '</Fields><Orders><Order><Field>2007</Field><Direction>1</Direction></Order></Orders>'
        + '<NotifyUpdate>NO</NotifyUpdate><QueryParameters>'
        + `<Range startIndex="${startIndex}" maxItems="${PAGE_SIZE}"/>`
        + '</QueryParameters>';
    if (!seek) return parameters;
    // Condition 5 means greater than in the manufacturer's seek example.
    // Include the first integral second of the requested window.
    const threshold = windowStart / 1000 - 1;
    return parameters + '<SeekToContentParameters><Selections><Selection>'
        + `<Field>2007</Field><Condition>5</Condition><Value>${threshold}</Value>`
        + '</Selection></Selections><Which>0</Which><Offset>0</Offset><WindowSize>0</WindowSize>'
        + '</SeekToContentParameters>';
}

function explicitSchemaMessage(value) {
    if (typeof value !== 'string' || value.length > 4096) return false;
    if (/auth|permission|access|denied|client\s*id|session|unauthori[sz]ed|forbidden/iu.test(value)) return false;
    const subject = /\b(?:field|column|selection|schema|table|iterator)\b|\b(?:Feld|Spalte|Tabelle)\b/iu;
    const rejection = /unknown|unsupported|not\s+supported|invalid|unrecogni[sz]ed|not\s+found|unbekannt|ungültig|nicht\s+unterstützt/iu;
    return subject.test(value) && rejection.test(value);
}

function canFallback(error) {
    if (!error || error.sessionInvalid || [401, 403].includes(error.httpStatus)) return false;
    if (error.code === 'EPG_TV_SCHEMA') return true;
    if (error.code !== 'SOAP') return false;
    let description = error.soapFault?.faultstring;
    if (description && typeof description === 'object' && !Array.isArray(description)) description = description['#text'];
    return explicitSchemaMessage(description) || explicitSchemaMessage(error.message);
}

function diagnosticNumber(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) value = value['#text'];
    if (typeof value === 'string' && /^-?\d{1,16}$/u.test(value.trim())
        && Number.isSafeInteger(Number(value))) return Number(value);
    // Do not include arbitrary TV text, URLs, client identifiers or programmes
    // in diagnostics. A type marker is sufficient for an invalid scalar.
    return value === undefined ? 'missing' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}

function summarizeIteratorResponse(response, fields) {
    const body = response?.data?.Envelope?.Body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { bodyType: body === undefined ? 'missing' : body === null ? 'null' : Array.isArray(body) ? 'array' : typeof body };
    }
    const names = plainChildren(body);
    const summary = {
        bodyElementCount: names.length,
        bodyElements: names.slice(0, 8).map(name => ['CreateIteratorResponse', 'Fault'].includes(name) ? name : 'otherElement'),
    };
    const node = body.CreateIteratorResponse;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return summary;
    summary.result = diagnosticNumber(node.Result);
    summary.iteratorIdPresent = Object.hasOwn(node, 'Id');
    const rows = node.Rows;
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) {
        summary.rowsType = diagnosticNumber(rows);
        return summary;
    }
    summary.startIndex = diagnosticNumber(rows['@_startIndex']);
    summary.totalResults = diagnosticNumber(rows['@_totalResults']);
    summary.returnedResults = diagnosticNumber(rows['@_returnedResults']);
    const values = rows.Row === undefined ? [] : Array.isArray(rows.Row) ? rows.Row : [rows.Row];
    summary.rowCount = values.length;
    const columns = values.slice(0, PAGE_SIZE).map(row => row?.V === undefined ? [] : Array.isArray(row.V) ? row.V : [row.V]);
    summary.columnCounts = [...new Set(columns.map(row => row.length))].slice(0, 8);
    if (columns[0]?.length === fields.length) {
        summary.firstRowNumbers = Object.fromEntries([2000, 2001, 2002, 2007, 2008]
            .filter(field => fields.includes(field))
            .map(field => [field, diagnosticNumber(columns[0][fields.indexOf(field)])]));
    }
    return summary;
}

function withDiagnostic(error, dvb, schema, statistics) {
    if (error && typeof error === 'object' && Object.isExtensible(error)) {
        error.epgDiagnostic = {
            schema,
            dvb: { ...dvb },
            requests: statistics.requests,
            pages: statistics.pages,
            rows: statistics.rows,
            fallbackUsed: statistics.fallbackUsed,
            request: statistics.lastRequest ?? null,
            response: statistics.lastResponse ?? null,
        };
    }
    return error;
}

/** Validate a response against the fields of this particular request. */
function parseIteratorPage(response, fields, dvb, expectedIndex) {
    const envelope = record(response?.data?.Envelope, 'SOAP Envelope');
    const body = record(envelope.Body, 'SOAP Body');
    const names = plainChildren(body);
    if (names.length !== 1 || names[0] !== 'CreateIteratorResponse') {
        throw epgError('Es fehlt eine eindeutige CreateIteratorResponse.');
    }
    const node = record(body.CreateIteratorResponse, 'CreateIteratorResponse');
    const result = scalar(node.Result, 'Result', 256);
    if (result !== '0') {
        throw epgError(`Der Fernseher hat den Iterator abgelehnt (${result || 'leeres Result'}).`,
            explicitSchemaMessage(result) ? 'EPG_TV_SCHEMA' : 'EPG_TV_INVALID');
    }
    const rowsNode = record(node.Rows, 'Rows');
    const startIndex = integer(rowsNode['@_startIndex'], 'Rows.startIndex');
    const totalResults = integer(rowsNode['@_totalResults'], 'Rows.totalResults');
    const returnedResults = integer(rowsNode['@_returnedResults'], 'Rows.returnedResults', PAGE_SIZE);
    // A seek response reports its actual, absolute offset (41 in §9.22).
    // Subsequent range requests must still match exactly to avoid skipped rows.
    if (expectedIndex !== undefined && startIndex !== expectedIndex) {
        throw epgError('Der Fernseher hat eine andere Ergebnisseite geliefert.');
    }
    const value = rowsNode.Row;
    const rows = value === undefined ? [] : Array.isArray(value) ? value : [value];
    if (rows.length !== returnedResults || startIndex + returnedResults > totalResults
        || (returnedResults === 0 && startIndex < totalResults)) {
        throw epgError('Seitenumfang und gemeldete Trefferzahl widersprechen sich.');
    }
    const values = rows.map((row, index) => {
        record(row, `Row ${index}`);
        if (plainChildren(row).some(name => name !== 'V')) throw epgError('Eine EPG-Zeile hat unbekannte Felder.');
        return row.V === undefined ? [] : Array.isArray(row.V) ? row.V : [row.V];
    });
    const widths = new Set(values.map(row => row.length));
    if (widths.size > 1) throw epgError('Die EPG-Zeilen haben unterschiedliche Spaltenzahlen.');
    if (values.length && values[0].length !== fields.length) {
        throw epgError('Die EPG-Spalten entsprechen nicht den angeforderten Feldern.', 'EPG_TV_SCHEMA');
    }
    const events = values.map((row, index) => {
        const byField = new Map(fields.map((field, column) => [field, row[column]]));
        const sid = integer(byField.get(2000), `Row ${index} SID`, 65535);
        const tsid = integer(byField.get(2001), `Row ${index} TSID`, 65535);
        const onid = integer(byField.get(2002), `Row ${index} ONID`, 65535);
        if (sid !== dvb.sid || tsid !== dvb.tsid || onid !== dvb.onid) {
            throw epgError('Eine EPG-Zeile gehört zu einem anderen DVB-Sender.');
        }
        const start = utcMilliseconds(byField.get(2007), `Row ${index} Beginn`);
        const end = byField.has(2008) ? utcMilliseconds(byField.get(2008), `Row ${index} Ende`, true) : null;
        if (end !== null && end <= start) throw epgError('Das Sendungsende liegt nicht nach dem Beginn.');
        return {
            eventId: byField.has(2003) ? scalar(byField.get(2003), 'Ereigniskennung', 256) : '',
            title: scalar(byField.get(2004), 'Sendungstitel', 1024),
            subtitle: byField.has(2005) ? scalar(byField.get(2005), 'Sendungskurztext', 2048) : '',
            description: byField.has(2006) ? scalar(byField.get(2006), 'Sendungsbeschreibung', 8192) : '',
            start,
            end,
        };
    });
    return { events, startIndex, returnedResults, totalResults };
}

class LoeweEpgSource {
    constructor({ request } = {}) {
        if (typeof request !== 'function') throw new TypeError('LoeweEpgSource requires a request function.');
        this._request = request;
        this._schema = 'extended';
        this._fallbackAttempted = false;
        this._generation = 0;
        this._pending = new Set();
    }

    /** Clear the per-session schema choice and invalidate in-flight reads. */
    reset() {
        this._generation++;
        this._schema = 'extended';
        this._fallbackAttempted = false;
        for (const cancel of this._pending) cancel(epgError('Die TV-Sitzung wurde zurückgesetzt.', 'CLOSED'));
    }

    async _call(xml, context) {
        checkContext(context);
        return await new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const finish = (error, response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                context.signal?.removeEventListener('abort', onAbort);
                this._pending.delete(cancel);
                if (error) reject(error);
                else resolve(response);
            };
            const cancel = error => finish(error);
            const onAbort = () => finish(epgError('Der Abruf wurde beendet.', 'CLOSED'));
            this._pending.add(cancel);
            context.signal?.addEventListener('abort', onAbort, { once: true });
            timer = setTimeout(() => finish(epgError('Das Zeitlimit für diesen Sender wurde erreicht.', 'EPG_TV_LIMIT')),
                Math.max(1, context.deadline - Date.now()));
            Promise.resolve().then(() => {
                checkContext(context);
                return this._request('CreateIterator', xml, { deadline: context.deadline });
            }).then(response => {
                try {
                    checkContext(context);
                    finish(null, response);
                } catch (error) { finish(error); }
            }, error => finish(error));
        });
    }

    async _readSchema(dvb, context, schema, statistics) {
        const fields = schema === 'extended' ? EXTENDED_FIELDS : BASIC_FIELDS;
        const events = [];
        const seen = new Set();
        let lastStart = -1;
        let totalResults = null;
        let startIndex = 0;
        let firstIndex = null;
        let horizonReached = false;
        let tableComplete = false;
        const windowStart = Math.max(0, Math.floor((context.now - DAY_MS) / 1000) * 1000);
        const windowEnd = Math.min(MAX_DATE_MS, Math.floor((context.now + DAY_MS) / 1000) * 1000);
        for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
            checkContext(context);
            const seek = pageNumber === 0;
            const xml = buildIteratorParameters(dvb, fields, startIndex, windowStart, seek);
            statistics.lastRequest = {
                action: 'CreateIterator', fields: [...fields], startIndex, maxItems: PAGE_SIZE,
                seek, ...(seek ? { seekAfter: windowStart / 1000 - 1 } : {}),
            };
            statistics.lastResponse = null;
            statistics.requests++;
            const response = await this._call(xml, context);
            checkContext(context);
            statistics.lastResponse = summarizeIteratorResponse(response, fields);
            const page = parseIteratorPage(response, fields, dvb, seek ? undefined : startIndex);
            if (totalResults !== null && page.totalResults !== totalResults) {
                throw epgError('Die EPG-Trefferzahl hat sich während des Abrufs geändert.');
            }
            totalResults = page.totalResults;
            if (firstIndex === null) firstIndex = page.startIndex;
            statistics.pages++;
            statistics.rows += page.returnedResults;
            for (const event of page.events) {
                checkContext(context);
                if (event.start < windowStart) throw epgError('Der Fernseher hat den EPG-Zeitfilter nicht eingehalten.');
                if (event.start < lastStart) throw epgError('Die EPG-Zeilen sind nicht nach Beginn sortiert.');
                lastStart = event.start;
                const identity = JSON.stringify([event.eventId, event.start, event.title]);
                if (seen.has(identity)) throw epgError('Der Fernseher hat eine EPG-Zeile wiederholt geliefert.');
                seen.add(identity);
                // Every row already received is evidence, including another
                // programme at the first start beyond the requested window.
                // Discarding it could manufacture an unambiguous next event.
                events.push(event);
                if (event.start > windowEnd) horizonReached = true;
            }
            startIndex = page.startIndex + page.returnedResults;
            tableComplete = startIndex === totalResults;
            if (horizonReached || tableComplete) break;
            // The request callback owns the global TV queue. No whole-guide
            // lock is held here, so queued remote commands can run between pages.
            if (pageNumber + 1 < MAX_PAGES) await nextTurn();
        }
        checkContext(context);
        const limited = !horizonReached && !tableComplete;
        let boundaryStart = null;
        let discardedBoundaryRows = 0;
        if (!tableComplete) {
            // More rows exist, and the next page could continue the final
            // start group. Remove that entire group. Its start then provides
            // a witnessed lower bound for all omitted rows in this ordering.
            // Retained known ends must not cross that bound, or later cache
            // clock ticks could hide an omitted overlapping programme.
            boundaryStart = events[events.length - 1].start;
            const count = events.findIndex(event => event.start === boundaryStart);
            const kept = events.slice(0, count);
            if (!kept.some(event => event.start > context.now)
                || kept.some(event => event.end !== null && event.end > boundaryStart)) {
                throw epgError(`Der begrenzte Abruf (${MAX_ROWS} Zeilen/${MAX_PAGES} Seiten oder Zeitfenster) `
                    + 'würde eine nächste Startgruppe oder überlappende Programmdaten abschneiden.', 'EPG_TV_LIMIT');
            }
            discardedBoundaryRows = events.length - count;
            events.splice(count);
        }
        return {
            source: 'tv',
            events,
            diagnostic: {
                schema,
                pages: statistics.pages,
                requests: statistics.requests,
                rows: statistics.rows,
                totalResults,
                firstIndex,
                windowStart,
                windowEnd,
                complete: !limited,
                tableComplete,
                limited,
                stopReason: horizonReached ? 'horizon' : tableComplete ? 'end' : 'limit',
                fallbackUsed: statistics.fallbackUsed,
                boundaryStart,
                discardedBoundaryRows,
                dvb: { ...dvb },
                request: statistics.lastRequest,
                response: statistics.lastResponse,
            },
        };
    }

    async read(service, { now = Date.now(), deadline, signal } = {}) {
        if (!Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0 || now > MAX_DATE_MS
            || (deadline !== undefined && (!Number.isFinite(deadline) || !Number.isSafeInteger(deadline)))
            || (signal !== undefined && (typeof signal?.addEventListener !== 'function'
                || typeof signal?.removeEventListener !== 'function' || typeof signal.aborted !== 'boolean'))) {
            throw epgError('Die Abrufzeit oder der Abbruchkontext ist ungültig.');
        }
        if (!service || typeof service !== 'object' || Array.isArray(service)
            || (service.itemClass !== undefined && service.itemClass !== 'video')) {
            throw epgError('Nur ein TV-Sender kann EPG-Daten erhalten.', 'EPG_TV_UNSUPPORTED');
        }
        const dvb = parseDvbServiceUuid(service.mediaItemUuid);
        const context = {
            now,
            deadline: Math.min(deadline ?? Infinity, Date.now() + DEFAULT_DEADLINE_MS),
            signal,
            generation: this._generation,
            source: this,
        };
        checkContext(context);
        const statistics = { pages: 0, requests: 0, rows: 0, fallbackUsed: false };
        const schema = this._schema;
        try {
            return await this._readSchema(dvb, context, schema, statistics);
        } catch (error) {
            try { checkContext(context); } catch (contextError) {
                throw withDiagnostic(contextError, dvb, schema, statistics);
            }
            // Never retry connectivity, authorization, wrong-station or corrupt
            // data errors. A schema fallback is permitted once per session and
            // only before any valid page has been accepted for this sender.
            if (schema !== 'extended' || this._fallbackAttempted || statistics.pages !== 0 || !canFallback(error)) {
                throw withDiagnostic(error, dvb, schema, statistics);
            }
            this._fallbackAttempted = true;
            this._schema = 'basic';
            statistics.fallbackUsed = true;
            try {
                return await this._readSchema(dvb, context, 'basic', statistics);
            } catch (fallbackError) {
                throw withDiagnostic(fallbackError, dvb, 'basic', statistics);
            }
        }
    }
}

module.exports = {
    LoeweEpgSource,
    parseDvbServiceUuid,
    parseIteratorPage,
    BASIC_FIELDS,
    EXTENDED_FIELDS,
};
