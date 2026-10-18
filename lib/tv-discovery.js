'use strict';

const dgram = require('node:dgram');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const sax = require('sax');

// The supplied Loewe app 1.4.7 sends this search target, multicast address and
// MX value (CloeweSsdp::SendSearchRequest, ELF 0x15b32c; template 0x3600d0).
// UPnP search replies are unicast to the ephemeral sending socket. We do not
// need to bind the shared discovery port or subscribe to notifications.
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;
const SEARCH = Buffer.from([
    'M-SEARCH * HTTP/1.1',
    `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
    'MAN: "ssdp:discover"',
    'MX: 3',
    'ST: upnp:rootdevice',
    'USER-AGENT: ioBroker/1.0 UPnP/1.1 loewe-tv',
    '', '',
].join('\r\n'));

const MAX_INTERFACES = 32;
const MAX_RESPONSES = 4096;
const MAX_CANDIDATES = 256;
const MAX_LOCATIONS_PER_HOST = 3;
const MAX_PARALLEL = 4;
const MAX_DESCRIPTION_BYTES = 128 * 1024;
const MAX_DATAGRAM_BYTES = 8192;
const REQUEST_TIMEOUT_MS = 1500;

function discoveryError(code, message) {
    return Object.assign(new Error(message), { name: 'DiscoveryError', code });
}

function abortError() {
    return discoveryError('ABORTED', 'TV discovery was cancelled.');
}

function ipv4Number(address) {
    if (net.isIPv4(address) !== true) return null;
    return address.split('.').reduce((value, part) => (value * 256) + Number(part), 0) >>> 0;
}

function isUnicast(address) {
    const number = ipv4Number(address);
    if (number === null) return false;
    const first = number >>> 24;
    return first !== 0 && first !== 127 && first < 224;
}

function readInterfaces(networkInterfaces) {
    const entries = [];
    const seen = new Set();
    for (const [name, addresses] of Object.entries(networkInterfaces() || {})) {
        for (const iface of addresses || []) {
            if (!iface || iface.internal || !['IPv4', 4].includes(iface.family)
                || !isUnicast(iface.address) || seen.has(iface.address)) continue;
            const mask = ipv4Number(iface.netmask);
            if (mask === null || mask === 0) continue;
            // Accept contiguous IPv4 masks only, avoiding a malformed interface
            // record accidentally authorizing arbitrary responder addresses.
            const inverted = (~mask) >>> 0;
            if (((inverted & (inverted + 1)) >>> 0) !== 0) continue;
            entries.push({ name, address: iface.address, mask, number: ipv4Number(iface.address) });
            seen.add(iface.address);
        }
    }
    return entries;
}

function sourceIsLocal(host, interfaces) {
    if (!isUnicast(host) || interfaces.some(iface => iface.address === host)) return false;
    const number = ipv4Number(host);
    return interfaces.some(iface => {
        const network = (iface.number & iface.mask) >>> 0;
        const broadcast = (network | (~iface.mask)) >>> 0;
        return ((number & iface.mask) >>> 0) === network
            && (iface.mask >= 0xfffffffe || (number !== network && number !== broadcast));
    });
}

function descriptionLocation(message, source, interfaces) {
    if (!Buffer.isBuffer(message) || message.length > MAX_DATAGRAM_BYTES
        || !sourceIsLocal(source, interfaces)) return null;
    const lines = message.toString('utf8').split(/\r?\n/);
    if (!/^HTTP\/1\.[01] 200(?: |$)/i.test(lines.shift() || '')) return null;
    let location;
    for (const line of lines) {
        if (!line) break;
        const colon = line.indexOf(':');
        if (colon < 1 || line.length > 2048) return null;
        const name = line.slice(0, colon).trim().toLowerCase();
        if (name === 'location') {
            if (location !== undefined) return null;
            location = line.slice(colon + 1).trim();
        }
    }
    if (!location || /[\u0000-\u0020\u007f]/u.test(location)) return null;
    try {
        const url = new URL(location);
        // Do not follow a LAN announcement to another host, a DNS name, a
        // credential-bearing URL, or a different protocol. There is no redirect
        // following in readDescription either. The actual request uses source.
        if (url.protocol !== 'http:' || !net.isIPv4(url.hostname)
            || url.hostname !== source || url.port === '0'
            || url.username || url.password || url.hash) return null;
        return url;
    } catch {
        return null;
    }
}

function cleanText(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 160);
}

function parseDescription(xml) {
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('Unsupported description XML.');
    const parser = sax.parser(true, { xmlns: true, strictEntities: true });
    const fields = new Set(['friendlyName', 'manufacturer', 'modelName', 'modelNumber', 'modelDescription', 'deviceType']);
    const frames = [];
    const devices = [];
    const deviceStack = [];
    parser.onopentag = tag => {
        if (frames.length >= 32) throw new Error('Description XML is too deeply nested.');
        const frame = { tag: tag.local, text: '' };
        if (tag.local === 'device') {
            if (devices.length >= 32) throw new Error('Too many embedded devices.');
            frame.device = { depth: frames.length, services: [] };
            devices.push(frame.device);
            deviceStack.push(frame.device);
        } else {
            const device = deviceStack.at(-1);
            if (device && ((frames.length === device.depth + 1 && fields.has(tag.local))
                || tag.local === 'serviceType')) frame.capture = device;
        }
        frames.push(frame);
    };
    const appendText = text => {
        const frame = frames.at(-1);
        if (frame?.capture) frame.text = (frame.text + text).slice(0, 1024);
    };
    parser.ontext = appendText;
    parser.oncdata = appendText;
    parser.onclosetag = () => {
        const frame = frames.pop();
        if (frame.device) deviceStack.pop();
        if (frame.capture) {
            if (frame.tag === 'serviceType') {
                if (frame.capture.services.length < 32) frame.capture.services.push(cleanText(frame.text));
            } else frame.capture[frame.tag] = cleanText(frame.text);
        }
    };
    parser.onerror = error => { throw error; };
    parser.write(xml).close();
    const candidates = devices.filter(device => {
        if (!/^loewe(?:\b|$)/i.test(device.manufacturer || '')) return false;
        // Do not turn a known Loewe speaker into a TV just because its custom
        // friendlyName is "TV" or its description says "TV soundbar".
        if (/\b(?:klang|speaker|soundbar|lautsprecher)\b/i.test(device.modelName || '')) return false;
        const model = [device.modelName, device.modelDescription].join(' ');
        if (/\b(?:klang|speaker|soundbar|lautsprecher)\b/i.test(model)
            && !/\b(?:tv|television|fernseher)\b/i.test(device.modelName || '')) return false;
        return true;
    }).map(device => {
        const model = [device.modelName, device.modelDescription].join(' ');
        const identity = [device.friendlyName, model].join(' ');
        const tvEvidence = /\b(?:tv|television|fernseher|bild|connect|individual|reference|art|sl[23456]\d{2}[a-z]?)\b/i.test(identity)
            || device.services.some(service => /(?:^|:)RemoteTV(?::|$)/i.test(service));
        return { name: device.friendlyName || device.modelName || 'Loewe TV', model: device.modelName || '', tvEvidence };
    });
    // The private Remote 1.15 app filters solely by manufacturer LOEWE. Model
    // wording varies and must not prevent a generically described TV from being
    // offered; processCandidate additionally checks its configured control port.
    return candidates.find(device => device.tvEvidence) || candidates[0] || null;
}

function readDescription(url, { signal, timeoutMs, request }) {
    return new Promise((resolve, reject) => {
        let finished = false;
        let req;
        let response;
        let bytes = 0;
        const chunks = [];
        const timer = setTimeout(() => finish(discoveryError('DESCRIPTION_TIMEOUT', 'Description request timed out.')), timeoutMs);
        const onAbort = () => finish(abortError());
        function finish(error, xml) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            response?.destroy();
            req?.destroy();
            if (error) {
                reject(error);
            } else resolve(xml);
        }
        if (signal.aborted) { finish(abortError()); return; }
        signal.addEventListener('abort', onAbort, { once: true });
        try {
            req = request({
                protocol: 'http:', hostname: url.hostname, port: Number(url.port || 80),
                method: 'GET', path: url.pathname + url.search,
                agent: false, maxHeaderSize: MAX_DATAGRAM_BYTES,
                headers: { Accept: 'application/xml,text/xml', Connection: 'close' },
            }, res => {
                response = res;
                // Keep error listeners after cancellation until sockets close,
                // so late transport errors cannot become unhandled exceptions.
                res.on('error', error => finish(error));
                if (finished) { res.destroy(); return; }
                if (res.statusCode !== 200 || (res.headers['content-encoding']
                    && res.headers['content-encoding'] !== 'identity')) {
                    finish(new Error('Description server returned an unsupported response.'));
                    return;
                }
                const length = Number(res.headers['content-length']);
                if (Number.isFinite(length) && length > MAX_DESCRIPTION_BYTES) {
                    finish(new Error('Description is too large.'));
                    return;
                }
                res.on('data', chunk => {
                    if (finished) return;
                    bytes += chunk.length;
                    if (bytes > MAX_DESCRIPTION_BYTES) {
                        finish(new Error('Description is too large.'));
                        return;
                    }
                    chunks.push(Buffer.from(chunk));
                });
                res.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
                res.on('aborted', () => finish(new Error('Description response was interrupted.')));
                res.on('close', () => {
                    if (!finished) finish(new Error('Description response closed before completion.'));
                });
            });
            req.on('error', error => finish(error));
            req.end();
        } catch (error) {
            finish(error);
        }
    });
}

function probePort(host, port, { signal, timeoutMs, connect }) {
    return new Promise(resolve => {
        let finished = false;
        let socket;
        const timer = setTimeout(() => finish(false), timeoutMs);
        const onAbort = () => finish(false);
        function finish(reachable) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            socket?.destroy();
            resolve(reachable);
        }
        if (signal.aborted) { finish(false); return; }
        signal.addEventListener('abort', onAbort, { once: true });
        try {
            socket = connect({ host, port, family: 4 });
            socket.on('error', () => finish(false));
            socket.once('connect', () => finish(true));
            socket.once('close', () => finish(false));
        } catch {
            finish(false);
        }
    });
}

/**
 * Search on the ioBroker host, never in the Admin browser. All network work is
 * contained in the overall deadline, with no SOAP registration/control calls.
 * apiReachable only reports a TCP connection to port; it is not compatibility.
 * Transport factories are injectable for tests; Admin should only supply port.
 */
async function discoverTvs({
    signal, port = 905, timeoutMs = 6500,
    networkInterfaces = os.networkInterfaces,
    createSocket = options => dgram.createSocket(options),
    request = (options, callback) => http.request(options, callback),
    connect = options => net.createConnection(options),
} = {}) {
    if (!Number.isInteger(port) || port < 1 || port > 65535
        || !Number.isFinite(timeoutMs) || timeoutMs < 10 || timeoutMs > 10000) {
        throw discoveryError('VALIDATION', 'Invalid TV discovery port or time limit.');
    }
    if (signal?.aborted) throw abortError();
    let interfaces;
    try { interfaces = readInterfaces(networkInterfaces); } catch {
        throw discoveryError('NO_INTERFACES', 'Local IPv4 network interfaces could not be read.');
    }
    if (!interfaces.length) {
        throw discoveryError('NO_INTERFACES', 'No usable IPv4 LAN interface is available for TV discovery.');
    }

    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const deadline = Date.now() + timeoutMs;
        const sockets = new Set();
        const timers = new Set();
        const jobs = new Set();
        const activeHosts = new Set();
        const queue = [];
        const seen = new Set();
        const hostLocations = new Map();
        const devices = new Map();
        const probes = new Map();
        const unconfirmedLoeweHosts = new Set();
        const warnings = new Set();
        let packets = 0;
        let sent = 0;
        let listening = true;
        let finished = false;
        let starting = true;
        let limited = false;
        const warn = message => { if (warnings.size < 16) warnings.add(message); };
        if (interfaces.length > MAX_INTERFACES) {
            interfaces = interfaces.slice(0, MAX_INTERFACES);
            warn('TV discovery was limited to 32 IPv4 interfaces.');
        }
        const later = (fn, ms) => {
            const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
            timers.add(timer);
        };
        function closeSocket(socket) {
            sockets.delete(socket);
            try { socket.close(); } catch { /* Already closed or not yet bound. */ }
        }
        function stopListening() {
            listening = false;
            for (const socket of [...sockets]) closeSocket(socket);
        }
        function finish(error) {
            if (finished) return;
            finished = true;
            stopListening();
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
            queue.length = 0;
            signal?.removeEventListener('abort', onAbort);
            controller.abort();
            // Helpers settle synchronously on abort; waiting for their promise
            // continuations preserves candidates identified just at the deadline.
            Promise.allSettled([...jobs]).then(() => {
                if (error) reject(error);
                else {
                    if ([...unconfirmedLoeweHosts].some(host => !devices.has(host))) {
                        warn('Some Loewe devices had no TV model information and their control port was not reachable.');
                    }
                    resolve({
                        devices: [...devices.values()].sort((left, right) => ipv4Number(left.host) - ipv4Number(right.host)),
                        warnings: [...warnings],
                    });
                }
            });
        }
        function maybeComplete() {
            if (!finished && !listening && jobs.size === 0 && queue.length === 0) finish();
        }
        function failedSocket(socket, iface, error) {
            if (finished) return;
            const code = cleanText(error?.code || 'NETWORK').replace(/[^A-Z0-9_]/gi, '').slice(0, 32);
            warn(`SSDP could not use ${cleanText(iface.name)} (${code}).`);
            closeSocket(socket);
            if (!starting && sockets.size === 0 && sent === 0) {
                finish(discoveryError('DISCOVERY_UNAVAILABLE', 'SSDP could not send on any IPv4 LAN interface.'));
            }
        }
        const onAbort = () => finish(abortError());
        signal?.addEventListener('abort', onAbort, { once: true });
        const remaining = () => Math.max(1, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()));
        async function processCandidate(candidate) {
            try {
                const xml = await readDescription(candidate.url, {
                    signal: controller.signal, timeoutMs: remaining(), request,
                });
                if (controller.signal.aborted) return;
                const metadata = parseDescription(xml);
                if (!metadata) return;
                let entry = devices.get(candidate.host);
                if (!entry && metadata.tvEvidence) {
                    entry = { host: candidate.host, name: metadata.name, model: metadata.model, port, apiReachable: false };
                    devices.set(candidate.host, entry);
                }
                if (!probes.has(candidate.host)) {
                    probes.set(candidate.host, probePort(candidate.host, port, {
                        signal: controller.signal, timeoutMs: remaining(), connect,
                    }));
                }
                const apiReachable = await probes.get(candidate.host);
                if (!entry && apiReachable) {
                    entry = { host: candidate.host, name: metadata.name, model: metadata.model, port, apiReachable };
                    devices.set(candidate.host, entry);
                }
                if (entry) entry.apiReachable = apiReachable;
                else unconfirmedLoeweHosts.add(candidate.host);
            } catch (error) {
                if (error?.code === 'DESCRIPTION_TIMEOUT') warn('Some device descriptions timed out during TV discovery.');
                // One non-Loewe, offline or malformed UPnP responder must not
                // prevent other TVs from appearing in the result.
            }
        }
        function drain() {
            if (!finished && Date.now() >= deadline) {
                if (jobs.size || queue.length) warn('Some device checks did not finish within the discovery time limit.');
                finish();
                return;
            }
            while (!finished && jobs.size < MAX_PARALLEL && queue.length) {
                const next = queue.findIndex(candidate => !activeHosts.has(candidate.host));
                if (next === -1) break;
                const candidate = queue.splice(next, 1)[0];
                activeHosts.add(candidate.host);
                const job = processCandidate(candidate);
                jobs.add(job);
                job.finally(() => {
                    jobs.delete(job);
                    activeHosts.delete(candidate.host);
                    drain();
                    maybeComplete();
                });
            }
            maybeComplete();
        }
        function onMessage(message, info) {
            if (!listening || finished) return;
            if (++packets > MAX_RESPONSES) {
                warn('TV discovery stopped receiving after 4096 SSDP responses.');
                stopListening();
                maybeComplete();
                return;
            }
            const url = descriptionLocation(message, info.address, interfaces);
            if (!url) return;
            const key = url.href;
            if (seen.has(key)) return;
            if (seen.size >= MAX_CANDIDATES) {
                if (!limited) warn('TV discovery was limited to 256 device descriptions.');
                limited = true;
                return;
            }
            const count = hostLocations.get(info.address) || 0;
            if (count >= MAX_LOCATIONS_PER_HOST) return;
            seen.add(key);
            hostLocations.set(info.address, count + 1);
            queue.push({ host: info.address, url });
            drain();
        }
        const searchMs = Math.min(4500, timeoutMs * 0.7);
        later(() => {
            if (jobs.size || queue.length) warn('Some device checks did not finish within the discovery time limit.');
            finish();
        }, timeoutMs);
        later(() => {
            stopListening();
            if (sent === 0) finish(discoveryError('DISCOVERY_UNAVAILABLE', 'SSDP could not send on any IPv4 LAN interface.'));
            else maybeComplete();
        }, searchMs);
        for (const iface of interfaces) {
            let socket;
            try {
                socket = createSocket({ type: 'udp4', reuseAddr: false });
                sockets.add(socket);
                socket.on('error', error => failedSocket(socket, iface, error));
                socket.on('message', onMessage);
                socket.once('listening', () => {
                    if (!listening || finished) { closeSocket(socket); return; }
                    try {
                        socket.setMulticastInterface(iface.address);
                        socket.setMulticastTTL(2);
                        const send = () => {
                            if (!listening || finished || !sockets.has(socket)) return;
                            try {
                                socket.send(SEARCH, SSDP_PORT, SSDP_ADDRESS, error => {
                                    if (finished) return;
                                    if (error) failedSocket(socket, iface, error);
                                    else sent++;
                                });
                            } catch (error) { failedSocket(socket, iface, error); }
                        };
                        send();
                        // A second datagram mitigates UDP packet loss. Keep the
                        // default response window longer than repeat delay + MX.
                        later(send, Math.min(500, searchMs / 3));
                    } catch (error) { failedSocket(socket, iface, error); }
                });
                socket.bind({ address: iface.address, port: 0 });
            } catch (error) {
                if (socket) failedSocket(socket, iface, error);
                else warn(`SSDP could not create a socket for ${cleanText(iface.name)}.`);
            }
        }
        starting = false;
        if (sockets.size === 0 && !finished) {
            finish(discoveryError('DISCOVERY_UNAVAILABLE', 'SSDP could not send on any IPv4 LAN interface.'));
        }
    });
}

module.exports = { discoverTvs };
