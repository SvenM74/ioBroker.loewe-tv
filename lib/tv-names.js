'use strict';

const { isIP, isIPv4 } = require('node:net');

const TV_NAMES_STATE = 'device.discoveryNames';
const MAX_DEVICES = 256;
const MAX_NAME_LENGTH = 160;
const MAX_SNAPSHOT_BYTES = 192 * 1024;
const REPORTED_SOURCES = Object.freeze({ streaming: 1, network: 2 });

const emptySnapshot = () => ({ schemaVersion: 1, devices: [] });
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;

function portNumber(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d{1,5}$/u.test(value))) return null;
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function cleanName(value) {
    if (typeof value !== 'string' || !value.isWellFormed()) return '';
    // SSDP already bounds names this way. Apply the same text-only boundary
    // before persisting injected discovery results or reading saved metadata.
    return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim()
        .slice(0, MAX_NAME_LENGTH).replace(/[\uD800-\uDBFF]$/u, '');
}

function validHost(host) {
    if (typeof host !== 'string' || !host || host.length > 255 || host !== host.trim()) return false;
    if (isIP(host)) return true;
    // Accept the bracketed IPv6 form also accepted by the TV client. Binding
    // remains textual: no DNS lookup or name-to-IP association is inferred.
    if (host.startsWith('[') && host.endsWith(']')) return isIP(host.slice(1, -1)) === 6;
    if (/^[\d.]+$/u.test(host)) return false;
    const hostname = host.endsWith('.') ? host.slice(0, -1) : host;
    return hostname.length <= 253 && hostname.split('.').every(label =>
        /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/iu.test(label));
}

function validatedSnapshot(value) {
    if (!plainObject(value) || value.schemaVersion !== 1 || Object.keys(value).length !== 2
        || !Array.isArray(value.devices) || value.devices.length > MAX_DEVICES) return null;
    const devices = [];
    const identities = new Set();
    for (const device of value.devices) {
        const reported = plainObject(device) && Object.hasOwn(device, 'source');
        if (!plainObject(device) || Object.keys(device).length !== (reported ? 4 : 3)
            || (reported && (typeof device.source !== 'string' || !Object.hasOwn(REPORTED_SOURCES, device.source)))
            || !validHost(device.host)
            || typeof device.port !== 'number' || portNumber(device.port) === null
            || !device.name || cleanName(device.name) !== device.name) return null;
        const identity = `${device.host}:${device.port}`;
        if (identities.has(identity)) return null;
        identities.add(identity);
        devices.push({ host: device.host, port: device.port, name: device.name,
            ...(reported ? { source: device.source } : {}) });
    }
    return { schemaVersion: 1, devices };
}

function parseTvNames(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_SNAPSHOT_BYTES) return emptySnapshot();
    try { return validatedSnapshot(JSON.parse(value)) || emptySnapshot(); }
    catch { return emptySnapshot(); }
}

function boundedSnapshot(devices) {
    const retained = [];
    let bytes = Buffer.byteLength(JSON.stringify(emptySnapshot()));
    // The count bound alone is insufficient with long DNS hosts and multibyte
    // names. A snapshot we write must fit the same byte bound when restored.
    for (let index = devices.length - 1; index >= 0 && retained.length < MAX_DEVICES; index -= 1) {
        const size = Buffer.byteLength(JSON.stringify(devices[index])) + (retained.length ? 1 : 0);
        if (bytes + size > MAX_SNAPSHOT_BYTES) break;
        retained.push(devices[index]);
        bytes += size;
    }
    return { schemaVersion: 1, devices: retained.reverse() };
}

function mergeTvNames(previousSnapshot, devices, port) {
    const previous = validatedSnapshot(previousSnapshot) || emptySnapshot();
    const selectedPort = portNumber(port);
    if (!Array.isArray(devices) || selectedPort === null) return previous;
    const known = new Map(previous.devices.map(device => [`${device.host}:${device.port}`, device]));
    for (const device of devices.slice(0, MAX_DEVICES)) {
        if (!device || typeof device.host !== 'string' || !isIPv4(device.host)) continue;
        const name = cleanName(device.name);
        if (!name) continue;
        const identity = `${device.host}:${selectedPort}`;
        // Retain the most recently confirmed names when the bounded cache is
        // full. Empty or failed searches cannot erase an offline TV's name.
        known.delete(identity);
        known.set(identity, { host: device.host, port: selectedPort, name });
    }
    return boundedSnapshot([...known.values()]);
}

function mergeReportedTvName(previousSnapshot, { host, port, name, source } = {}) {
    const previous = validatedSnapshot(previousSnapshot) || emptySnapshot();
    const selectedHost = typeof host === 'string' ? host.trim() : '';
    const selectedPort = portNumber(port);
    const selectedName = cleanName(name);
    if (!validHost(selectedHost) || selectedPort === null || !selectedName
        || typeof source !== 'string' || !Object.hasOwn(REPORTED_SOURCES, source)) return previous;
    const identity = `${selectedHost}:${selectedPort}`;
    const known = new Map(previous.devices.map(device => [`${device.host}:${device.port}`, device]));
    const existing = known.get(identity);
    // Existing three-field entries came from SSDP's friendlyName. Retain them
    // ahead of network names, and retain a network name ahead of a streaming
    // server name. An equally authoritative live response can update its name.
    if (existing && (!existing.source || REPORTED_SOURCES[existing.source] > REPORTED_SOURCES[source])) return previous;
    known.delete(identity);
    known.set(identity, { host: selectedHost, port: selectedPort, name: selectedName, source });
    return boundedSnapshot([...known.values()]);
}

function nameForTv(snapshot, host, port) {
    const selectedHost = typeof host === 'string' ? host.trim() : '';
    const selectedPort = portNumber(port);
    if (!validHost(selectedHost) || selectedPort === null) return '';
    return validatedSnapshot(snapshot)?.devices.find(device => device.host === selectedHost
        && device.port === selectedPort)?.name || '';
}

module.exports = { TV_NAMES_STATE, parseTvNames, mergeTvNames, mergeReportedTvName, nameForTv };
