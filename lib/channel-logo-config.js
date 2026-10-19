'use strict';

const { ProtocolError } = require('./loewe-client');
const { channelLogo, televisionOrigin } = require('./channel-logos');
const { resolveLogo, registryLogoUrl, searchLogoOptions } = require('./logo-registry');
const catalogue = require('./logo-registry-catalog.json');

const CHANNEL_ID = /^channels\.tv\.[A-Za-z0-9_]{1,240}$/u;
const MAX_ROWS = 4000;
const MODES = ['auto', 'manual', 'disabled'];
const SOURCES = ['auto', 'tv', 'registry'];
const COUNTRIES = ['de', 'at', 'ch', 'all'];
const entries = new Map(catalogue.entries.map(entry => [entry.id, entry]));
const bounded = (value, length) => typeof value === 'string' ? value.slice(0, length).toWellFormed() : '';
const safeId = value => typeof value === 'string' && value.length <= 512 && value === value.trim()
    && value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value) ? value : '';

/** Logo mistakes are local to presentation. They never block TV startup or EPG.
 * Display names, paths outside the catalogue and extra draft properties cannot
 * change a television service's identity or command target.
 */
function normalizeLogoMappings(rows) {
    const result = {};
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) return result;
    for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.channel !== 'string' || !CHANNEL_ID.test(row.channel)) continue;
        if (Object.hasOwn(result, row.channel)) {
            result[row.channel] = { mode: 'disabled', logoId: '' };
            continue;
        }
        const mode = MODES.includes(row.mode) ? row.mode : 'disabled';
        result[row.channel] = { mode, logoId: mode === 'manual' ? safeId(row.logoId) : '' };
    }
    return result;
}

function normalizeLogoConfig(input = {}) {
    return { channelLogoSource: SOURCES.includes(input.channelLogoSource) ? input.channelLogoSource : 'auto',
        channelLogoCountry: COUNTRIES.includes(input.channelLogoCountry) ? input.channelLogoCountry : 'de',
        channelLogoMappings: normalizeLogoMappings(input.channelLogoMappings) };
}

function serviceRegistryLogo(service, config = {}) {
    if (config.channelLogoSource === 'tv') return '';
    const mapping = config.channelLogoMappings?.[service.id];
    const resolved = resolveLogo(service, { country: config.channelLogoCountry || 'de',
        mode: mapping?.mode || 'auto', logoId: mapping?.logoId || '' });
    return registryLogoUrl(resolved.logoId);
}

function logoLabel(id) {
    const entry = entries.get(id);
    return entry ? `${entry.name} (${entry.country.toUpperCase()}, ${entry.variant})` : id;
}

function assignmentLabel(resolved, mode, logoId) {
    if (mode === 'disabled') return 'Logo-Verzeichnis für diesen Sender deaktiviert';
    if (mode === 'manual' && !logoId) return 'Manuell: bitte ein Logo aus dem Verzeichnis auswählen';
    if (resolved.status === 'manual' || resolved.status === 'automatic') {
        return `${resolved.status === 'manual' ? 'Manuell' : 'Automatisch'}: ${logoLabel(resolved.logoId)}`;
    }
    if (resolved.status === 'missing') return `Logo fehlt im mitgelieferten Verzeichnis: ${logoId}`;
    const suggestions = (resolved.candidates || []).slice(0, 3).map(entry => logoLabel(entry.id)).join(' · ');
    return `${resolved.status === 'ambiguous' ? 'Mehrere passende Logos; bitte manuell auswählen' : 'Kein eindeutiger Treffer'}${suggestions ? `. Vorschläge: ${suggestions}` : ''}`;
}

function buildLogoMappingRows(services, mappings = [], { country = 'de', revision = 0, origin = '' } = {}) {
    if (!Array.isArray(mappings) || mappings.length > MAX_ROWS) {
        throw new ProtocolError('Die Logo-Zuordnung muss eine Liste mit höchstens 4000 Zeilen sein.', 'LOGO_MAPPING');
    }
    const normalized = normalizeLogoMappings(mappings);
    const previous = new Map(mappings.filter(row => row && typeof row === 'object' && typeof row.channel === 'string' && CHANNEL_ID.test(row.channel))
        .map(row => [row.channel, row]));
    const present = new Set();
    let assigned = 0;
    const rows = services.map(service => {
        present.add(service.id);
        const mapping = normalized[service.id] || { mode: 'auto', logoId: '' };
        const resolved = resolveLogo(service, { country, ...mapping });
        if (['automatic', 'manual'].includes(resolved.status)) assigned++;
        const logoId = mapping.mode === 'auto' ? resolved.logoId || '' : mapping.logoId;
        return { channel: service.id, tvChannel: bounded(`${service.number}. ${service.name}`, 512),
            tvLogo: channelLogo(service, origin, { source: 'tv' }).logoUrl ? 'TV-Bildadresse vorhanden' : 'Keine TV-Bildadresse',
            mode: mapping.mode, logoId, assignment: bounded(assignmentLabel(resolved, mapping.mode, logoId), 1200), revision };
    });
    for (const [channel, mapping] of Object.entries(normalized)) {
        if (present.has(channel) || mapping.mode === 'auto') continue;
        rows.push({ channel, tvChannel: bounded(previous.get(channel)?.tvChannel || channel, 512),
            tvLogo: 'Nicht in der gespeicherten TV-Senderliste', ...mapping,
            assignment: 'Nicht in der gespeicherten TV-Senderliste; bisherige Korrektur bleibt erhalten', revision });
    }
    if (rows.length > MAX_ROWS) {
        throw new ProtocolError('Die aktuellen TV-Sender und bisherigen Logo-Korrekturen überschreiten zusammen 4000 Zeilen. Die bestehende Tabelle bleibt erhalten; nicht mehr benötigte Korrekturen in der Instanzkonfiguration bereinigen.', 'LOGO_MAPPING');
    }
    return { rows, assigned, total: services.length, retained: rows.length - services.length };
}

/** Local configuration reads use ChannelObjects directly, including when the TV
 * is disconnected or EPG is disabled. No source load, TV request or live write.
 */
class LogoConfiguration {
    constructor(runtime) {
        this.runtime = runtime;
        this.revision = 0;
    }

    _services(message, fields) {
        const runtime = this.runtime;
        if (!message || typeof message !== 'object' || Array.isArray(message)
            || Object.keys(message).some(key => !fields.includes(key))
            || (message.country !== undefined && !COUNTRIES.includes(message.country))
            || (message.source !== undefined && !SOURCES.includes(message.source))) {
            throw new ProtocolError('Ungültige Anfrage der Logo-Zuordnung.', 'LOGO_MAPPING');
        }
        if (runtime.stopping || !runtime.channelObjects?.started || runtime.channelObjects.stopped
            || !runtime.config?.channelListView
            || (message.listView !== undefined && message.listView !== runtime.config.channelListView)) {
            throw new ProtocolError('Zuerst die TV-Senderliste speichern und diese Adapterinstanz starten.', 'LOGO_MAPPING');
        }
        return [...runtime.channelObjects.services.values()]
            .filter(service => service.listView === runtime.config.channelListView && service.available !== false)
            .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
    }

    mappingRows(message = {}) {
        const services = this._services(message, ['source', 'country', 'mappings', 'listView']);
        const source = message.source || 'auto';
        const country = message.country || 'de';
        this.revision = Math.max(this.revision + 1, this.runtime._now());
        const result = buildLogoMappingRows(services, message.mappings ?? [],
            { country, revision: this.revision, origin: televisionOrigin(this.runtime.config) });
        const television = result.total ? `${result.total} TV-Sender aus der gespeicherten Senderliste.`
            : 'Es sind noch keine TV-Sender gespeichert. Zuerst die gewünschte TV-Senderliste speichern und einmal vom Fernseher einlesen.';
        const mode = source === 'tv' ? 'Aktive Quelle: Fernseher; die Verzeichnis-Zuordnung ist vorbereitet.'
            : source === 'registry' ? 'Aktive Quelle: Logo-Verzeichnis.' : 'Aktive Quellen: Fernseher und Logo-Verzeichnis.';
        const status = `${television} ${catalogue.entries.length} Logo-Dateien im lokalen Katalog; ${result.assigned} von ${result.total} TV-Sendern zugeordnet. ${mode}`
            + (result.retained ? ` ${result.retained} bisherige Korrekturen zu fehlenden Sendern bleiben erhalten.` : '');
        return { native: { _logoMappingResponse: { basis: { source, country, listView: message.listView ?? '',
            mappings: structuredClone(message.mappings ?? []) }, rows: result.rows, status } } };
    }

    registryOptions(message = {}) {
        const services = this._services(message, ['country', 'listView', 'channel', 'selected', 'query']);
        if ((message.query !== undefined && (typeof message.query !== 'string' || message.query.length > 512))
            || (message.selected !== undefined && (typeof message.selected !== 'string' || message.selected.length > 512))
            || (message.channel !== undefined && (typeof message.channel !== 'string' || !CHANNEL_ID.test(message.channel)))) {
            throw new ProtocolError('Die Logo-Suche ist zu lang oder ungültig.', 'LOGO_MAPPING');
        }
        return searchLogoOptions({ service: services.find(service => service.id === message.channel),
            country: message.country || 'de', query: message.query || '', selected: safeId(message.selected) });
    }
}

module.exports = { normalizeLogoConfig, normalizeLogoMappings, serviceRegistryLogo, buildLogoMappingRows, LogoConfiguration };
