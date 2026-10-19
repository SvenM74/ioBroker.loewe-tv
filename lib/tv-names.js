'use strict';

const { isIPv4 } = require('node:net');

const TV_NAMES_STATE = 'device.discoveryNames';
const MAX_DEVICES = 256;
const MAX_NAME_LENGTH = 160;
const MAX_SNAPSHOT_BYTES = 192 * 1024;

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

function validatedSnapshot(value) {
    if (!plainObject(value) || value.schemaVersion !== 1 || Object.keys(value).length !== 2
        || !Array.isArray(value.devices) || value.devices.length > MAX_DEVICES) return null;
    const devices = [];
    const identities = new Set();
    for (const device of value.devices) {
        if (!plainObject(device) || Object.keys(device).length !== 3
            || typeof device.host !== 'string' || !isIPv4(device.host)
            || typeof device.port !== 'number' || portNumber(device.port) === null
            || !device.name || cleanName(device.name) !== device.name) return null;
        const identity = `${device.host}:${device.port}`;
        if (identities.has(identity)) return null;
        identities.add(identity);
        devices.push({ host: device.host, port: device.port, name: device.name });
    }
    return { schemaVersion: 1, devices };
}

function parseTvNames(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_SNAPSHOT_BYTES) return emptySnapshot();
    try { return validatedSnapshot(JSON.parse(value)) || emptySnapshot(); }
    catch { return emptySnapshot(); }
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
    return { schemaVersion: 1, devices: [...known.values()].slice(-MAX_DEVICES) };
}

function nameForTv(snapshot, host, port) {
    const selectedHost = typeof host === 'string' ? host.trim() : '';
    const selectedPort = portNumber(port);
    if (!isIPv4(selectedHost) || selectedPort === null) return '';
    return validatedSnapshot(snapshot)?.devices.find(device => device.host === selectedHost
        && device.port === selectedPort)?.name || '';
}

module.exports = { TV_NAMES_STATE, parseTvNames, mergeTvNames, nameForTv };
