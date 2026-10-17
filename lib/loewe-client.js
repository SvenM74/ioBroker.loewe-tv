'use strict';

const http = require('node:http');
const dgram = require('node:dgram');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { setImmediate: yieldToEventLoop } = require('node:timers/promises');
const sax = require('sax');

// Reconstructed from de.loewe.loeweapp 1.4.7 and the official Remote API.
// App-derived remote keys were reported working on bild 7.55 / SL420 / V5.4.6.0.
// Added mode keys and new read/power flows still need verification on that device.
const NAMESPACE = 'urn:loewe.de:RemoteTV:Tablet';
const ENDPOINT = '/loewe_tablet_0001';
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_XML_DEPTH = 128;
const XML_PARSE_CHUNK = 32 * 1024;
const XML_PREFIX = '<?xml version="1.0" encoding="UTF-8"?>\r\n'
    + '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" '
    + 'xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" '
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + 'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
    + `xmlns:ns1="${NAMESPACE}"><SOAP-ENV:Body>`;
const XML_SUFFIX = '</SOAP-ENV:Body></SOAP-ENV:Envelope>';

const TABLET_ACTIONS = Object.freeze([
    'RequestAccess', 'GetDeviceData', 'GetFeature', 'GetListOfChannelLists',
    'GetChannelList', 'GetMediaItem', 'GetMediaEvent', 'GetDRPlusArchive',
    'ExportServiceLists', 'ImportServiceLists', 'ZapToMedia', 'GetCurrentPlayback',
    'RemoveFavoriteList', 'AddFavoriteList', 'RenameFavoriteList', 'GetMute',
    'SetMute', 'GetVolume', 'SetVolume', 'PlayMultiroom', 'InjectRCKey',
    'InjectKeyboardKey', 'AddServicesFavoriteList', 'MoveServicesFavoriteList',
    'RemoveServicesFavoriteList', 'GetSettings', 'SetSetting', 'GetVolumes',
    'ProgramTimer', 'GetTimerList', 'CreateIterator', 'CloseIterator',
    'ActivateFeaturePackage',
]);
const ACTION_SET = new Set(TABLET_ACTIONS);
const TYPED_REQUESTS = new Set([
    'GetDeviceData', 'GetFeature', 'GetListOfChannelLists', 'GetChannelList',
]);

const KEYS = Object.freeze(Object.fromEntries(Object.entries({
    mute: ['l2700', 13],
    power_off: ['l2700', 12],
    // Official Remote API 1.0.47, 9.4.3: leave network standby using TV_ON.
    power_on: ['l2700', 22],
    // Official Remote API 1.0.47, 9.4.1.1, p. 25: discrete mode selection.
    // https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf
    tv_mode_on: ['l2700', 72],
    epg: ['l2700', 15],
    home: ['l2700', 49],
    pip: ['l2700', 10],
    text: ['l2700', 60],
    menu: ['l2700', 11],
    back: ['l2700', 63],
    info: ['l2700', 79],
    volume_up: ['l2700', 21],
    channel_up: ['l2700', 24],
    volume_down: ['l2700', 20],
    channel_down: ['l2700', 23],
    ok: ['l2700', 38],
    up: ['l2700', 32],
    down: ['l2700', 33],
    left: ['l2700', 17],
    right: ['l2700', 16],
    red: ['l2700', 27],
    green: ['l2700', 26],
    yellow: ['l2700', 43],
    blue: ['l2700', 40],
    rewind: ['l2700-hdr', 50],
    play: ['l2700-hdr', 53],
    fast_forward: ['l2700-hdr', 52],
    record: ['l2700-hdr', 55],
    pause: ['l2700-hdr', 41],
    stop: ['l2700-hdr', 54],
    // Separate BUTTON_POWER_ALL branch; this client addresses one TV only.
    power_all_code: ['l2700', 25],
    // Additional values from com.alternone.loeweremote 1.15,
    // assets/configuration.csv. Keep the original App's EPG=15 as well.
    digit_0: ['l2700', 0],
    digit_1: ['l2700', 1],
    digit_2: ['l2700', 2],
    digit_3: ['l2700', 3],
    digit_4: ['l2700', 4],
    digit_5: ['l2700', 5],
    digit_6: ['l2700', 6],
    digit_7: ['l2700', 7],
    digit_8: ['l2700', 8],
    digit_9: ['l2700', 9],
    epg_alt: ['l2700', 78],
}).map(([name, [alphabet, value]]) => [name, Object.freeze({ alphabet, value })])));

class ProtocolError extends Error {
    constructor(message, code = 'INVALID_RESPONSE', details = {}) {
        super(message, details.cause ? { cause: details.cause } : undefined);
        this.name = 'ProtocolError';
        this.code = code;
        for (const key of ['action', 'httpStatus', 'transportCode', 'soapFault', 'sessionInvalid']) {
            if (Object.hasOwn(details, key)) {
                this[key] = details[key];
            }
        }
    }
}

function validation(message) {
    return new ProtocolError(message, 'VALIDATION');
}

function deadlineError(action) {
    return new ProtocolError('TV command exceeded its total time limit; the operation was not retried.', 'NETWORK', {
        action, transportCode: 'ETIMEDOUT',
    });
}

function deadlineRemaining(deadline, action) {
    if (deadline === undefined) return Infinity;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw deadlineError(action);
    return remaining;
}

function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[char]);
}

function validXmlCodePoint(value) {
    return value === 0x09 || value === 0x0a || value === 0x0d
        || (value >= 0x20 && value <= 0xd7ff)
        || (value >= 0xe000 && value <= 0xfffd)
        || (value >= 0x10000 && value <= 0x10ffff);
}

function appendXmlProperty(object, name, value) {
    if (Object.hasOwn(object, name)) {
        const previous = object[name];
        if (Array.isArray(previous)) {
            previous.push(value);
        } else {
            object[name] = [previous, value];
        }
    } else {
        // Defining an own property keeps XML element names such as __proto__
        // from changing the object's prototype.
        Object.defineProperty(object, name, {
            value, enumerable: true, configurable: true, writable: true,
        });
    }
}

function validateXmlBasics(xml, code) {
    if (typeof xml !== 'string' || !xml.isWellFormed()
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(xml)) {
        throw new ProtocolError('XML contains invalid characters.', code);
    }
    if (Buffer.byteLength(xml, 'utf8') > MAX_XML_BYTES) {
        throw new ProtocolError('XML exceeds the 8 MiB limit.', code);
    }
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
        throw new ProtocolError('DTD and entity declarations are not supported.', code);
    }
}

function validateCharacterReference(match, code) {
    const value = /^x/i.test(match[1])
        ? Number.parseInt(match[1].slice(1), 16) : Number(match[1]);
    if (!validXmlCodePoint(value)) {
        throw new ProtocolError('XML contains an invalid character reference.', code);
    }
}

/** Strict SAX parser plus a small, string-preserving XML-to-object transform. */
function createXmlDocument(xml, code) {
    const parser = sax.parser(true, {
        xmlns: true, strictEntities: true, trim: false, normalize: false,
        unquotedAttributeValues: false,
    });
    const stack = [];
    const document = {};
    let roots = 0;
    let declarations = 0;
    let openingAttributes = {};
    let attributeNames = new Set();
    parser.onerror = cause => {
        throw new ProtocolError(`Malformed XML: ${cause.message.slice(0, 200)}`, code, { cause });
    };
    parser.ondoctype = () => {
        throw new ProtocolError('DTD and entity declarations are not supported.', code);
    };
    parser.onprocessinginstruction = instruction => {
        if (instruction.name.toLowerCase() !== 'xml') {
            return;
        }
        declarations++;
        const declaration = /^version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*$/;
        if (instruction.name !== 'xml' || roots > 0 || declarations > 1
            || !/^\ufeff?<\?xml\s/.test(xml) || !declaration.test(instruction.body.trim())) {
            throw new ProtocolError('Invalid or misplaced XML declaration.', code);
        }
    };
    parser.onopentagstart = () => {
        openingAttributes = {};
        attributeNames = new Set();
    };
    parser.onattribute = attribute => {
        const expandedName = `${attribute.uri}\0${attribute.local}`;
        if (attributeNames.has(expandedName)) {
            throw new ProtocolError('XML contains a duplicate attribute.', code);
        }
        attributeNames.add(expandedName);
        if (attribute.uri !== 'http://www.w3.org/2000/xmlns/') {
            appendXmlProperty(openingAttributes, `@_${attribute.local}`, attribute.value);
        }
    };
    parser.onopentag = tag => {
        if (stack.length >= MAX_XML_DEPTH) {
            throw new ProtocolError(`XML exceeds the nesting limit of ${MAX_XML_DEPTH}.`, code);
        }
        if (stack.length === 0 && ++roots > 1) {
            throw new ProtocolError('XML must have exactly one root element.', code);
        }
        stack.push({ name: tag.local, data: openingAttributes, text: '' });
    };
    const addText = text => {
        if (stack.length) {
            stack[stack.length - 1].text += text;
        } else if (text.trim()) {
            throw new ProtocolError('XML contains text outside its root element.', code);
        }
    };
    parser.ontext = addText;
    parser.oncdata = addText;
    parser.onclosetag = () => {
        const node = stack.pop();
        let value = node.text;
        if (Object.keys(node.data).length) {
            value = node.data;
            if (node.text !== '') {
                appendXmlProperty(value, '#text', node.text);
            }
        }
        appendXmlProperty(stack.length ? stack[stack.length - 1].data : document, node.name, value);
    };
    const invoke = callback => {
        try {
            callback();
        } catch (cause) {
            if (cause instanceof ProtocolError) {
                throw cause;
            }
            throw new ProtocolError('Unable to parse XML.', code, { cause });
        }
    };
    return {
        write(chunk) {
            invoke(() => parser.write(chunk));
        },
        close() {
            invoke(() => parser.close());
            if (roots !== 1 || stack.length) {
                throw new ProtocolError('XML must have one complete root element.', code);
            }
            return document;
        },
    };
}

function assertXml(xml, code = 'VALIDATION') {
    validateXmlBasics(xml, code);
    for (const match of xml.matchAll(/&#(x[\da-f]+|\d+);/gi)) {
        validateCharacterReference(match, code);
    }
    const parser = createXmlDocument(xml, code);
    parser.write(xml);
    return parser.close();
}

/** Network replies yield regularly so request deadlines and unload can run. */
async function assertXmlAsync(xml, code, checkCancelled) {
    checkCancelled();
    validateXmlBasics(xml, code);
    let references = 0;
    for (const match of xml.matchAll(/&#(x[\da-f]+|\d+);/gi)) {
        validateCharacterReference(match, code);
        if (++references % 4096 === 0) {
            await yieldToEventLoop();
            checkCancelled();
        }
    }
    const parser = createXmlDocument(xml, code);
    for (let offset = 0; offset < xml.length;) {
        checkCancelled();
        let end = Math.min(offset + XML_PARSE_CHUNK, xml.length);
        // Do not split a raw Unicode character between parser writes.
        const last = xml.charCodeAt(end - 1);
        if (end < xml.length && last >= 0xd800 && last <= 0xdbff) end--;
        parser.write(xml.slice(offset, end));
        offset = end;
        if (offset < xml.length) await yieldToEventLoop();
    }
    checkCancelled();
    return parser.close();
}

/** Build the exact APK envelope, without its final transport NUL byte. */
function buildEnvelope(action, parametersXml = '', clientId = '') {
    if (typeof action !== 'string' || !ACTION_SET.has(action)) {
        throw validation('Unknown Loewe Tablet SOAP action.');
    }
    if (typeof parametersXml !== 'string' || typeof clientId !== 'string') {
        throw validation('SOAP parameters and ClientId must be strings.');
    }
    let attributes;
    let contents;
    if (action === 'RequestAccess') {
        if (parametersXml.length) {
            throw validation('RequestAccess uses a fixed request and accepts no parameters.');
        }
        attributes = ' xsi:type="ns1:RequestAccessRequestType"';
        contents = '<fcid></fcid><DeviceType>----------------</DeviceType>';
    } else {
        // Validate an isolated fragment first. This also prevents closing the
        // current action or injecting a second SOAP operation from raw XML.
        const fragment = `<Parameters xmlns:ns1="${NAMESPACE}" `
            + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            + parametersXml + '</Parameters>';
        const parsed = assertXml(fragment).Parameters;
        if (parsed && typeof parsed === 'object'
            && (Object.hasOwn(parsed, 'fcid') || Object.hasOwn(parsed, 'ClientId'))) {
            throw validation('fcid and ClientId are added automatically; omit them from parameters.');
        }
        attributes = TYPED_REQUESTS.has(action) ? ' xsi:type="ns1:ClientRequestType"' : '';
        contents = '<fcid></fcid><ClientId>' + escapeXml(clientId) + '</ClientId>' + parametersXml;
    }
    const xml = `${XML_PREFIX}<ns1:${action}${attributes}>${contents}</ns1:${action}>${XML_SUFFIX}`;
    assertXml(xml);
    return xml;
}

function buildKeyParameters(name) {
    if (typeof name !== 'string' || !Object.hasOwn(KEYS, name)) {
        throw validation(`Unknown remote key: ${String(name)}.`);
    }
    const { alphabet, value } = KEYS[name];
    return '<InputEventSequence>'
        + `<RCKeyEvent alphabet="${alphabet}" mode="press" value="${value}"/>`
        + `<RCKeyEvent alphabet="${alphabet}" mode="release" value="${value}"/>`
        + '</InputEventSequence>';
}

function buildKeyboardParameters(codePoint, modifiers = '') {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        throw validation('Keyboard value must be a Unicode scalar value.');
    }
    if (modifiers !== '' && modifiers !== 'scancode') {
        throw validation('Keyboard modifiers must be empty or scancode.');
    }
    return '<InputEventSequence>'
        + `<KeyboardKeyEvent mode="press" modifiers="${modifiers}" value="${codePoint}"/>`
        + `<KeyboardKeyEvent mode="release" modifiers="${modifiers}" value="${codePoint}"/>`
        + '</InputEventSequence>';
}

function createWolPacket(mac) {
    if (typeof mac !== 'string') {
        throw validation('Wake-on-LAN requires a MAC address.');
    }
    const clean = mac.trim().replace(/[:-]/g, '');
    if (!/^[\da-f]{12}$/i.test(clean)) {
        throw validation('Invalid MAC address. Use six hexadecimal bytes, e.g. 02:00:00:00:00:01.');
    }
    const bytes = Buffer.from(clean, 'hex');
    const packet = Buffer.alloc(102, 0xff);
    for (let offset = 6; offset < packet.length; offset += 6) {
        bytes.copy(packet, offset);
    }
    return packet;
}

function ipv4Number(value) {
    if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    if (parts.some(part => part > 255)) return null;
    return parts.reduce((number, part) => number * 256 + part, 0) >>> 0;
}

function wakeTargets(host, broadcast, autoBroadcast, networkInterfaces) {
    const targets = new Set([broadcast]);
    const tvAddress = ipv4Number(host);
    // A configured destination always takes precedence. Only supplement the
    // global default, and derive subnet broadcasts from actual interface masks.
    if (!autoBroadcast || broadcast !== '255.255.255.255' || tvAddress === null) return [...targets];
    let interfaces;
    try {
        interfaces = networkInterfaces();
    } catch {
        // Interface enumeration may be unavailable in a restricted container.
        // The explicitly configured global broadcast remains usable.
        return [...targets];
    }
    for (const entries of Object.values(interfaces || {})) {
        for (const entry of entries || []) {
            if (entry.internal || !['IPv4', 4].includes(entry.family)) continue;
            const address = ipv4Number(entry.address);
            const mask = ipv4Number(entry.netmask);
            if (address === null || mask === null) continue;
            const hostMask = (~mask) >>> 0;
            // Exclude non-contiguous masks and /31-/32 point-to-point networks.
            if (hostMask < 3 || (hostMask & (hostMask + 1)) !== 0) continue;
            if (((tvAddress & mask) >>> 0) !== ((address & mask) >>> 0)) continue;
            const target = (tvAddress | hostMask) >>> 0;
            targets.add([24, 16, 8, 0].map(shift => (target >>> shift) & 255).join('.'));
        }
    }
    return [...targets];
}

function scalars(node, name) {
    const values = [];
    // Iteration avoids stack exhaustion for deeply nested but bounded replies.
    const pending = [node];
    while (pending.length) {
        const current = pending.pop();
        if (!current || typeof current !== 'object') {
            continue;
        }
        if (Array.isArray(current)) {
            for (const entry of current) {
                pending.push(entry);
            }
            continue;
        }
        for (const [key, value] of Object.entries(current)) {
            if (key === name) {
                const entries = Array.isArray(value) ? value : [value];
                for (const entry of entries) {
                    if (typeof entry === 'string') {
                        values.push(entry.trim());
                    } else if (entry && typeof entry === 'object'
                        && typeof entry['#text'] === 'string') {
                        values.push(entry['#text'].trim());
                    }
                }
            } else if (value && typeof value === 'object') {
                pending.push(value);
            }
        }
    }
    return values;
}

function scalar(response, name, action) {
    const values = scalars(response.data.Envelope.Body, name);
    if (values.length !== 1 || values[0] === '') {
        throw new ProtocolError(`${action} did not return one nonempty ${name}.`, 'INVALID_RESPONSE', { action });
    }
    return values[0];
}

function isSessionFault(fault) {
    const description = JSON.stringify(fault).slice(0, 4096);
    return /(?:unauthori[sz]ed|not\s+authori[sz]ed|access\s+denied)/i.test(description)
        || /(?:client|session).{0,100}(?:invalid|expired|unknown|missing|not\s+valid)/i.test(description)
        || /(?:invalid|expired|unknown|missing).{0,100}(?:client|session)/i.test(description);
}

function responseXml(input) {
    let xml;
    if (Buffer.isBuffer(input)) {
        if (input.length > MAX_XML_BYTES) {
            throw new ProtocolError('TV response exceeds the 8 MiB limit.', 'INVALID_RESPONSE');
        }
        try {
            xml = new TextDecoder('utf-8', { fatal: true }).decode(input);
        } catch (cause) {
            throw new ProtocolError('TV response is not valid UTF-8.', 'INVALID_RESPONSE', { cause });
        }
    } else if (typeof input === 'string') {
        if (Buffer.byteLength(input, 'utf8') > MAX_XML_BYTES) {
            throw new ProtocolError('TV response exceeds the 8 MiB limit.', 'INVALID_RESPONSE');
        }
        xml = input;
    } else {
        throw new ProtocolError('TV response must be XML text.', 'INVALID_RESPONSE');
    }
    // A suffix regex such as /\0+$/ backtracks quadratically when padding is
    // followed by another byte. Walk from the end once instead.
    let end = xml.length;
    while (end > 0 && xml.charCodeAt(end - 1) === 0) end--;
    return end === xml.length ? xml : xml.slice(0, end);
}

function checkedResponse(xml, data) {
    if (!data?.Envelope || typeof data.Envelope !== 'object' || Array.isArray(data.Envelope)
        || !Object.hasOwn(data.Envelope, 'Body') || Array.isArray(data.Envelope.Body)) {
        throw new ProtocolError('TV response is missing a SOAP Envelope/Body.', 'INVALID_RESPONSE');
    }
    const fault = data.Envelope.Body?.Fault;
    if (fault !== undefined) {
        const descriptions = scalars(fault, 'faultstring');
        const description = (descriptions[0] || 'The TV returned a SOAP fault.').slice(0, 300);
        throw new ProtocolError(`SOAP: ${description}`, 'SOAP', {
            soapFault: fault,
            sessionInvalid: isSessionFault(fault),
        });
    }
    return { xml, data };
}

/** Parse namespace-free XML while preserving text/attribute values as strings. */
function parseResponse(input) {
    const xml = responseXml(input);
    return checkedResponse(xml, assertXml(xml, 'INVALID_RESPONSE'));
}

/** Same result as parseResponse, with cancellable parsing for HTTP replies. */
async function parseResponseAsync(input, checkCancelled = () => {}) {
    checkCancelled();
    const xml = responseXml(input);
    const data = await assertXmlAsync(xml, 'INVALID_RESPONSE', checkCancelled);
    checkCancelled();
    return checkedResponse(xml, data);
}

function checkRange(start, count) {
    if (!Number.isSafeInteger(start) || start < 0
        || !Number.isSafeInteger(count) || count < 1 || count > 10000) {
        throw validation('Query range requires start >= 0 and an integer count between 1 and 10000.');
    }
}

function channelResponseError(action, message) {
    return new ProtocolError(`${action}: ${message}`, 'INVALID_RESPONSE', { action });
}

function channelResponseNode(response, action) {
    const node = response?.data?.Envelope?.Body?.[`${action}Response`];
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw channelResponseError(action, 'the expected SOAP response element is missing.');
    }
    return node;
}

function channelText(node, name, action) {
    const value = node?.[name];
    if (value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && !Array.isArray(value)
        && typeof value['#text'] === 'string') return value['#text'].trim();
    throw channelResponseError(action, `${name} must be a single text value.`);
}

function channelNumber(node, name, action) {
    const value = channelText(node, name, action);
    if (value === '') return null;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw channelResponseError(action, `${name} must be a nonnegative integer.`);
    }
    return Number(value);
}

function channelEntries(fragment, name, action) {
    if (fragment === '') return [];
    if (!fragment || typeof fragment !== 'object' || Array.isArray(fragment)) {
        throw channelResponseError(action, 'the expected list fragment is missing.');
    }
    const value = fragment[name];
    if (value === undefined) return [];
    const entries = Array.isArray(value) ? value : [value];
    if (entries.length > 10000 || entries.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw channelResponseError(action, 'the list contains invalid or too many entries.');
    }
    return entries;
}

function channelPageMetadata(fragment, actualCount, action) {
    const startIndex = channelNumber(fragment, '@_startIndex', action);
    const totalResults = channelNumber(fragment, '@_totalResults', action);
    const returnedResults = channelNumber(fragment, '@_returnedResults', action) ?? actualCount;
    if (returnedResults !== actualCount) {
        throw channelResponseError(action, 'returnedResults does not match the received entries.');
    }
    if (totalResults !== null && actualCount > totalResults) {
        throw channelResponseError(action, 'the received entries exceed totalResults.');
    }
    const end = startIndex === null ? null : startIndex + actualCount;
    if (end !== null && !Number.isSafeInteger(end)) {
        throw channelResponseError(action, 'the reported page range is too large.');
    }
    if (totalResults !== null && end !== null
        && ((actualCount > 0 && end > totalResults) || (actualCount === 0 && startIndex < totalResults))) {
        throw channelResponseError(action, 'the page range is inconsistent with totalResults.');
    }
    return {
        startIndex,
        totalResults,
        returnedResults,
        // Unknown totals or a last/empty page never invent a further offset.
        nextStart: actualCount > 0 && end !== null && totalResults !== null && end < totalResults ? end : null,
    };
}

/** One page from Remote API 1.0.47, section 9.7.2; no network reads. */
function parseChannelLists(response) {
    const action = 'GetListOfChannelLists';
    const node = channelResponseNode(response, action);
    const result = channelText(node, 'Result', action);
    if (!['', 'OK', 'SYNC', 'NONE'].includes(result)) {
        throw channelResponseError(action, `the TV returned list status ${result.slice(0, 100)}.`);
    }
    const fragment = node.ResultItemChannelLists;
    // During synchronization the list data is not ready for selection. Keep
    // that status even if the TV also includes a provisional fragment.
    if (result === 'SYNC' || (fragment === undefined && result === 'NONE')) {
        return { result, lists: [], startIndex: null, totalResults: null, returnedResults: 0, nextStart: null };
    }
    const entries = channelEntries(fragment, 'ResultItemChannelList', action);
    const lists = entries.map(entry => {
        const view = channelText(entry, 'View', action);
        if (!view) throw channelResponseError(action, 'a channel list has no View identifier.');
        return {
            view,
            name: channelText(entry, 'Name', action),
            totalResults: channelNumber(entry, 'TotalResults', action),
            hash: channelText(entry, 'Hash', action),
        };
    });
    return { result, lists, ...channelPageMetadata(fragment, lists.length, action) };
}

/** Choose only an actual TV-provided list; AV inputs are not broadcast lists. */
function selectChannelList(lists) {
    if (!Array.isArray(lists)) return null;
    const candidates = lists.filter(list => list && typeof list.view === 'string'
        && list.view.trim() && !list.view.startsWith('avlist'));
    const nonempty = candidates.filter(list => list.totalResults !== 0);
    const preferred = nonempty.length ? nonempty : candidates;
    return preferred.find(list => list.view.startsWith('fastscan')) || preferred[0] || null;
}

/** Attribute names follow Remote API 1.0.47, section 9.7.1 (TV and radio). */
function parseChannelPage(response) {
    const action = 'GetChannelList';
    const node = channelResponseNode(response, action);
    const fragment = node.ResultItemFragment;
    const entries = channelEntries(fragment, 'ResultItemReference', action);
    const items = entries.map(entry => {
        const mediaItemUuid = channelText(entry, '@_mediaItemUuid', action);
        if (!mediaItemUuid) throw channelResponseError(action, 'a channel reference has no mediaItemUuid.');
        return {
            mediaItemUuid,
            name: channelText(entry, '@_shortInfo', action),
            locator: channelText(entry, '@_locator', action),
            caption: channelText(entry, '@_caption', action),
            itemClass: channelText(entry, '@_itemClass', action),
            attributes: channelText(entry, '@_attributes', action),
            thumbnailUrl: channelText(entry, '@_thumbnailUrl', action),
            streamingUrl: channelText(entry, '@_streamingUrl', action),
            originalStreamingUrl: channelText(entry, '@_originalStreamingUrl', action),
        };
    });
    return {
        view: channelText(node, 'ChannelListView', action),
        name: channelText(node, 'ChannelListName', action),
        ancestorUuid: channelText(node, 'AncestorUuid', action),
        itemClass: channelText(node, 'ItemClass', action),
        items,
        ...channelPageMetadata(fragment, items.length, action),
        hash: channelText(fragment, '@_hash', action),
    };
}

/** The operation parsers must never borrow a value from another SOAP action. */
function mediaResponseNode(response, action) {
    const envelope = response?.data?.Envelope;
    const body = envelope?.Body;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
        || !body || typeof body !== 'object' || Array.isArray(body)) {
        throw channelResponseError(action, 'the expected SOAP response element is missing.');
    }
    const elements = Object.keys(body).filter(key => key !== '#text' && !key.startsWith('@_'));
    const name = `${action}Response`;
    if (elements.length !== 1 || elements[0] !== name) {
        throw channelResponseError(action, 'exactly one matching SOAP response element is required.');
    }
    const node = body[name];
    // Some firmware replies acknowledge an action with an empty element.
    if (typeof node === 'string' && node.trim() === '') return {};
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw channelResponseError(action, 'the expected SOAP response element is not unique or is malformed.');
    }
    return node;
}

/** One direct text field, with XML attributes allowed but no nested elements. */
function mediaText(node, name, action, maxLength = 4096, trim = true) {
    if (!Object.hasOwn(node, name)) return '';
    const value = node[name];
    let text;
    if (typeof value === 'string') {
        text = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).every(key => key === '#text' || key.startsWith('@_'))
        && (value['#text'] === undefined || typeof value['#text'] === 'string')) {
        text = value['#text'] ?? '';
    } else {
        throw channelResponseError(action, `${name} must be a single text value.`);
    }
    if (text.length > maxLength) {
        throw channelResponseError(action, `${name} exceeds its length limit.`);
    }
    return trim ? text.trim() : text;
}

/** Preserve TV rejection codes; the caller records the reply before rejecting. */
function parseZapResult(response) {
    const action = 'ZapToMedia';
    const node = mediaResponseNode(response, action);
    if (!Object.hasOwn(node, 'Result')) return null;
    const result = mediaText(node, 'Result', action, 32);
    if (!/^[+-]?\d+$/u.test(result) || !Number.isSafeInteger(Number(result))) {
        throw channelResponseError(action, 'Result must be a single integer.');
    }
    return Number(result) === 0 ? 0 : Number(result);
}

class LoeweClient extends EventEmitter {
    /** timeout is a total request deadline in milliseconds. dependencies is a test seam. */
    constructor(options = {}, dependencies = {}) {
        super();
        const { host, port = 905, timeout = 8000, appendNul = true } = options;
        if (typeof host !== 'string' || !host.trim()
            || /[\s/\\?#@]/u.test(host) || host.includes('://')) {
            throw validation('Configure a TV hostname or IP address without URL, path or credentials.');
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw validation('TV port must be an integer between 1 and 65535.');
        }
        if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300000) {
            throw validation('Request timeout must be between 1 and 300000 milliseconds.');
        }
        if (typeof appendNul !== 'boolean') {
            throw validation('appendNul must be a boolean.');
        }
        this.host = host.replace(/^\[|\]$/g, '');
        this.port = port;
        this.timeout = timeout;
        this.appendNul = appendNul;
        this._request = dependencies.request || http.request;
        this._createSocket = dependencies.createSocket || dgram.createSocket;
        this._networkInterfaces = dependencies.networkInterfaces || os.networkInterfaces;
        this._clientId = '';
        this._handshake = null;
        this._closed = false;
        this._pending = new Set();
    }

    get isSessionReady() {
        return !this._closed && this._clientId !== '';
    }

    _checkOpen() {
        if (this._closed) {
            throw new ProtocolError('The Loewe client has been closed.', 'CLOSED');
        }
    }

    _setSession(clientId) {
        const wasReady = this.isSessionReady;
        this._clientId = clientId;
        if (wasReady !== this.isSessionReady) {
            this.emit('session', this.isSessionReady);
        }
    }

    async _access(deadline) {
        this._checkOpen();
        deadlineRemaining(deadline, 'RequestAccess');
        if (!this._handshake) {
            const handshake = this._post('RequestAccess', '', deadline).then(response => {
                this._checkOpen();
                this._setSession(scalar(response, 'ClientId', 'RequestAccess'));
                return response;
            });
            this._handshake = handshake;
            const clear = () => {
                if (this._handshake === handshake) this._handshake = null;
            };
            // A caller's shorter wait must not discard or cancel an existing
            // handshake which other operations still need.
            void handshake.then(clear, clear);
        }
        const handshake = this._handshake;
        if (deadline === undefined) return await handshake;
        return await new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(response);
            };
            const timer = setTimeout(() => finish(deadlineError('RequestAccess')),
                deadlineRemaining(deadline, 'RequestAccess'));
            handshake.then(response => {
                try {
                    deadlineRemaining(deadline, 'RequestAccess');
                    finish(null, response);
                } catch (error) {
                    finish(error);
                }
            }, error => finish(error));
        });
    }

    /** No failed operation is retried: it may already have changed the TV. */
    async request(action, parametersXml = '', options = {}) {
        this._checkOpen();
        if (!options || typeof options !== 'object' || Array.isArray(options)
            || (options.deadline !== undefined && !Number.isFinite(options.deadline))) {
            throw validation('Request options must contain a finite deadline timestamp when provided.');
        }
        const { deadline } = options;
        deadlineRemaining(deadline, action);
        // Validate locally before even the initial RequestAccess touches the TV.
        buildEnvelope(action, parametersXml, this._clientId);
        try {
            deadlineRemaining(deadline, action);
            if (action === 'RequestAccess') {
                this._setSession('');
                return await this._access(deadline);
            }
            if (!this.isSessionReady) {
                await this._access(deadline);
            }
            this._checkOpen();
            const response = await this._post(action, parametersXml, deadline);
            deadlineRemaining(deadline, action);
            return response;
        } catch (error) {
            if (error.code === 'NETWORK' || error.sessionInvalid
                || (error.code === 'HTTP' && [401, 403].includes(error.httpStatus))) {
                this._setSession('');
            }
            throw error;
        }
    }

    _post(action, parametersXml, deadline) {
        this._checkOpen();
        deadlineRemaining(deadline, action);
        const xml = buildEnvelope(action, parametersXml, this._clientId);
        const body = Buffer.from(xml + (this.appendNul ? '\0' : ''), 'utf8');
        const timeout = Math.min(this.timeout, deadlineRemaining(deadline, action));
        return new Promise((resolve, reject) => {
            let request;
            let response;
            let settled = false;
            let timer;
            const finish = (error, result) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                this._pending.delete(abort);
                if (error) {
                    if (error instanceof ProtocolError && !error.action) {
                        error.action = action;
                    }
                    reject(error);
                } else {
                    resolve(result);
                }
            };
            const abort = error => {
                finish(error);
                response?.destroy();
                request?.destroy();
            };
            const networkError = cause => new ProtocolError(
                `TV request failed${cause?.code ? ` (${cause.code})` : ''}.`, 'NETWORK',
                { cause, transportCode: cause?.code, action },
            );
            this._pending.add(abort);
            timer = setTimeout(() => abort(timeout < this.timeout ? deadlineError(action) : new ProtocolError(
                `TV request timed out after ${this.timeout} ms; the operation was not retried.`,
                'NETWORK', { action, transportCode: 'ETIMEDOUT' },
            )), timeout);
            try {
                request = this._request({
                    hostname: this.host,
                    port: this.port,
                    method: 'POST',
                    path: ENDPOINT,
                    agent: false,
                    headers: {
                        'User-Agent': 'LOEWE SOAP/1.0',
                        'Content-Type': 'text/xml; charset=utf-8',
                        'Content-Length': body.length,
                        Connection: 'close',
                        SOAPAction: `"${NAMESPACE}#${action}"`,
                    },
                }, incoming => {
                    response = incoming;
                    if (settled) {
                        response.destroy();
                        return;
                    }
                    const chunks = [];
                    let length = 0;
                    const tooLarge = () => abort(new ProtocolError(
                        'TV response exceeds the 8 MiB limit.', 'INVALID_RESPONSE', { action },
                    ));
                    response.on('error', cause => finish(networkError(cause)));
                    response.on('aborted', () => finish(new ProtocolError(
                        'The TV closed the response before it was complete.', 'NETWORK', { action },
                    )));
                    const advertisedLength = Number(response.headers?.['content-length']);
                    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_XML_BYTES) {
                        tooLarge();
                        return;
                    }
                    response.on('data', chunk => {
                        if (settled) {
                            return;
                        }
                        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                        length += bytes.length;
                        if (length > MAX_XML_BYTES) {
                            tooLarge();
                        } else {
                            chunks.push(bytes);
                        }
                    });
                    response.on('end', async () => {
                        if (settled) {
                            return;
                        }
                        const status = response.statusCode || 0;
                        let result;
                        try {
                            result = await parseResponseAsync(Buffer.concat(chunks, length), () => {
                                if (settled) {
                                    throw new ProtocolError('TV response parsing was cancelled.', 'CLOSED', { action });
                                }
                                deadlineRemaining(deadline, action);
                            });
                        } catch (error) {
                            if (settled) return;
                            if (error.code === 'SOAP') {
                                error.httpStatus = status;
                                finish(error);
                                return;
                            }
                            if (status >= 200 && status < 300) {
                                finish(error);
                                return;
                            }
                        }
                        if (settled) return;
                        if (status < 200 || status >= 300) {
                            finish(new ProtocolError(`TV returned HTTP ${status}.`, 'HTTP', {
                                action, httpStatus: status,
                            }));
                        } else {
                            finish(null, result);
                        }
                    });
                });
                request.on('error', cause => finish(networkError(cause)));
                request.end(body);
            } catch (cause) {
                abort(cause instanceof ProtocolError ? cause : networkError(cause));
            }
        });
    }

    key(name, options = {}) {
        return this.request('InjectRCKey', buildKeyParameters(name), options);
    }

    setVolume(level) {
        if (!Number.isInteger(level) || level < 0 || level > 99) {
            return Promise.reject(validation('Volume must be an integer App level between 0 and 99.'));
        }
        return this.request('SetVolume', `<Value>${level * 10000}</Value>`);
    }

    async getVolume() {
        const response = await this.request('GetVolume');
        const value = scalar(response, 'Value', 'GetVolume');
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
            throw new ProtocolError('GetVolume returned an invalid numeric Value.', 'INVALID_RESPONSE', {
                action: 'GetVolume',
            });
        }
        // Preserve reported values above the App's send limit, e.g. 1000000 -> 100.
        return Number(value) / 10000;
    }

    setMute(mute) {
        if (typeof mute !== 'boolean') {
            return Promise.reject(validation('Mute must be a boolean.'));
        }
        return this.request('SetMute', `<Value>${mute ? 1 : 0}</Value>`);
    }

    async getMute() {
        const response = await this.request('GetMute');
        const value = scalar(response, 'Value', 'GetMute');
        if (value !== '0' && value !== '1') {
            throw new ProtocolError('GetMute returned a Value other than 0 or 1.', 'INVALID_RESPONSE', {
                action: 'GetMute',
            });
        }
        return value === '1';
    }

    async text(value, options = {}) {
        this._checkOpen();
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw validation('Keyboard text options must be an object.');
        }
        const { timeoutMs = 15000 } = options;
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
            throw validation('Keyboard text timeoutMs must be an integer between 1 and 15000.');
        }
        const deadline = Date.now() + timeoutMs;
        if (typeof value !== 'string') {
            throw validation('Keyboard text must be a well-formed Unicode string.');
        }
        // A Unicode character uses at most two UTF-16 code units. Reject very
        // large input before allocating an array for every character.
        if (value.length > 2048 * 2) {
            throw validation('Keyboard text is limited to 2048 Unicode characters per command.');
        }
        if (!value.isWellFormed()) {
            throw validation('Keyboard text must be a well-formed Unicode string.');
        }
        const characters = Array.from(value);
        if (characters.length > 2048) {
            throw validation('Keyboard text is limited to 2048 Unicode characters per command.');
        }
        // Validate every character before sending a possibly partial text.
        const fragments = characters.map(char => buildKeyboardParameters(char.codePointAt(0)));
        let lastResponse = null;
        for (const fragment of fragments) {
            deadlineRemaining(deadline, 'InjectKeyboardKey');
            lastResponse = await this.request('InjectKeyboardKey', fragment, { deadline });
        }
        return lastResponse;
    }

    backspace() {
        return this.request('InjectKeyboardKey', buildKeyboardParameters(14, 'scancode'));
    }

    zap(locator, options = {}) {
        if (typeof locator !== 'string' || !locator.trim()) {
            return Promise.reject(validation('ZapToMedia requires a Locator returned by the TV.'));
        }
        return this.request('ZapToMedia', `<Player>0</Player><Locator>${escapeXml(locator)}</Locator>`, options);
    }

    getDeviceData() {
        return this.request('GetDeviceData');
    }

    getSettings() {
        return this.request('GetSettings');
    }

    getCurrentPlayback(options = {}) {
        // Remote API 1.0.47 documents Player 0 for the main screen.
        return this.request('GetCurrentPlayback', '<Player>0</Player>', options);
    }

    getChannelLists(start = 0, count = 100, options = {}) {
        checkRange(start, count);
        return this.request('GetListOfChannelLists',
            `<QueryParameters><Range startIndex="${start}" maxItems="${count}"/></QueryParameters>`, options);
    }

    getChannels(view, start = 0, count = 100, mediaItemClass = 'video', options = {}) {
        checkRange(start, count);
        if (typeof view !== 'string' || !view.trim()) {
            return Promise.reject(validation('GetChannelList requires a ChannelListView returned by the TV.'));
        }
        if (!['', 'audio', 'video'].includes(mediaItemClass)) {
            return Promise.reject(validation('Channel media class must be empty, audio or video.'));
        }
        return this.request('GetChannelList', `<ChannelListView>${escapeXml(view.trim())}</ChannelListView>`
            + `<QueryParameters><Range startIndex="${start}" maxItems="${count}"/>`
            + '<OrderField field="userChannelNumber" type="ascending"/>'
            + '<MediaItemInformation>true</MediaItemInformation>'
            + `<MediaItemClass>${mediaItemClass}</MediaItemClass></QueryParameters>`, options);
    }

    async wake(macs, broadcast = '255.255.255.255', options = {}) {
        this._checkOpen();
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw validation('Wake-on-LAN options must be an object.');
        }
        const { repeats = 1, intervalMs = 150, autoBroadcast = false, signal } = options;
        if (signal !== undefined && (typeof signal?.addEventListener !== 'function'
            || typeof signal?.removeEventListener !== 'function' || typeof signal?.aborted !== 'boolean')) {
            throw validation('Wake-on-LAN signal must be an AbortSignal.');
        }
        if (signal?.aborted) {
            throw new ProtocolError('Wake-on-LAN was cancelled.', 'CANCELLED');
        }
        if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) {
            throw validation('Wake-on-LAN repeats must be an integer between 1 and 5.');
        }
        if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 10000) {
            throw validation('Wake-on-LAN intervalMs must be an integer between 0 and 10000.');
        }
        if (typeof autoBroadcast !== 'boolean') {
            throw validation('Wake-on-LAN autoBroadcast must be a boolean.');
        }
        const addresses = typeof macs === 'string' ? [macs] : macs;
        if (!Array.isArray(addresses) || addresses.some(mac => typeof mac !== 'string')) {
            throw validation('Wake-on-LAN requires a MAC address or an array of MAC addresses.');
        }
        const unique = [...new Set(addresses.map(mac => mac.trim().replace(/[:-]/g, '').toUpperCase()).filter(Boolean))];
        if (!unique.length) {
            throw validation('No MAC address is configured or known; configure the TV MAC address first.');
        }
        const packets = unique.map(createWolPacket);
        if (ipv4Number(broadcast) === null) {
            throw validation('Wake-on-LAN broadcast must be an IPv4 address.');
        }
        const targets = wakeTargets(this.host, broadcast, autoBroadcast, this._networkInterfaces);
        const transmissions = packets.flatMap(packet => targets.map(address => ({ packet, address })));
        return new Promise((resolve, reject) => {
            let socket;
            let settled = false;
            let timer;
            let repeatTimer;
            const finish = error => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                clearTimeout(repeatTimer);
                signal?.removeEventListener('abort', onSignalAbort);
                this._pending.delete(abort);
                try {
                    socket?.close();
                } catch {
                    // An unbound socket may already have closed after an error.
                }
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        macs: unique.map(mac => mac.match(/.{2}/g).join(':')),
                        broadcast,
                        port: 9,
                        targets,
                        repeats,
                    });
                }
            };
            const abort = error => finish(error);
            const onSignalAbort = () => finish(new ProtocolError('Wake-on-LAN was cancelled.', 'CANCELLED'));
            const fail = cause => finish(new ProtocolError(
                `Wake-on-LAN failed${cause?.code ? ` (${cause.code})` : ''}.`, 'NETWORK',
                { cause, transportCode: cause?.code },
            ));
            const send = (index, round = 0) => {
                if (settled) {
                    return;
                }
                if (index >= transmissions.length) {
                    if (round + 1 >= repeats) {
                        finish();
                    } else {
                        repeatTimer = setTimeout(() => {
                            repeatTimer = null;
                            send(0, round + 1);
                        }, intervalMs);
                    }
                    return;
                }
                const { packet, address } = transmissions[index];
                try {
                    socket.send(packet, 0, packet.length, 9, address, error => {
                        if (error) {
                            fail(error);
                        } else {
                            send(index + 1, round);
                        }
                    });
                } catch (error) {
                    fail(error);
                }
            };
            signal?.addEventListener('abort', onSignalAbort, { once: true });
            if (signal?.aborted) {
                onSignalAbort();
                return;
            }
            this._pending.add(abort);
            timer = setTimeout(() => finish(new ProtocolError(
                'Wake-on-LAN timed out.', 'NETWORK', { transportCode: 'ETIMEDOUT' },
            )), this.timeout);
            try {
                socket = this._createSocket('udp4');
                if (settled) {
                    socket.close();
                    return;
                }
                socket.on('error', fail);
                socket.bind(0, '0.0.0.0', () => {
                    if (settled) {
                        return;
                    }
                    try {
                        socket.setBroadcast(true);
                        send(0);
                    } catch (error) {
                        fail(error);
                    }
                });
            } catch (cause) {
                fail(cause);
            }
        });
    }

    close() {
        if (this._closed) {
            return;
        }
        this._setSession('');
        this._closed = true;
        for (const abort of [...this._pending]) {
            abort(new ProtocolError('The Loewe client was closed.', 'CLOSED'));
        }
        this._handshake = null;
    }
}

module.exports = {
    LoeweClient,
    KEYS,
    TABLET_ACTIONS,
    buildEnvelope,
    buildKeyParameters,
    buildKeyboardParameters,
    createWolPacket,
    parseResponse,
    parseResponseAsync,
    parseChannelLists,
    parseChannelPage,
    parseZapResult,
    selectChannelList,
    ProtocolError,
};
