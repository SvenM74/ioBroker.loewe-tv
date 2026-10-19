'use strict';

const { normalizeManualMappings, normalizeMappingRows, resolveMappings } = require('./epg-mapping');

const bounded = (value, length) => value.slice(0, length).toWellFormed();

function channelLabel(channel) {
    return `${channel.names?.[0] || channel.id} [${channel.id}]`;
}

function assignmentLabel(row, mode, xmltvId, catalogueLoaded, channels) {
    if (mode === 'disabled') return 'Alternative EPG-Daten deaktiviert';
    if (mode === 'manual' && !xmltvId) return 'Manuell: bitte einen XMLTV-Sender auswählen';
    if (!catalogueLoaded) return mode === 'manual'
        ? `Manuell: ${xmltvId} (Quelle noch nicht geladen)` : 'Quelle noch nicht geladen; automatische Zuordnung noch offen';
    if (['automatic', 'manual'].includes(row.status)) {
        return `${row.status === 'automatic' ? 'Automatisch' : 'Manuell'}: ${channelLabel(channels.get(row.xmltvId))}`;
    }
    if (row.status === 'missing') return `XMLTV-ID fehlt in dieser Quelle: ${xmltvId}`;
    const candidates = row.candidates.slice(0, 3).map(channelLabel).join(' · ');
    return `${row.status === 'ambiguous' ? 'Mehrere passende Sender; bitte manuell auswählen'
        : 'Kein eindeutiger Treffer'}${candidates ? `. Vorschläge: ${candidates}` : ''}`;
}

/** Build the editable Admin draft from the TV catalogue without changing live
 * settings. Display fields never determine a TV command target or a source ID.
 * Corrections for temporarily absent services stay in the draft for later use.
 */
function buildMappingRows(services, catalogue, mappings = [], { catalogueLoaded = false, revision = 0 } = {}) {
    const normalized = normalizeMappingRows(mappings);
    const manual = normalizeManualMappings(normalized);
    const draft = new Map(normalized.filter(row => Object.hasOwn(row, 'mode')).map(row => [row.channel, row]));
    const resolved = resolveMappings(services, catalogue, manual);
    const channels = new Map(catalogue.map(channel => [channel.id, channel]));
    const present = new Set();
    const rows = services.map((service, index) => {
        present.add(service.id);
        const previous = draft.get(service.id);
        const mode = previous?.mode || (Object.hasOwn(manual, service.id) ? manual[service.id] ? 'manual' : 'disabled' : 'auto');
        const xmltvId = previous?.xmltvId ?? manual[service.id] ?? '';
        return { channel: service.id, tvChannel: bounded(`${service.number}. ${service.name}`, 512), mode, xmltvId,
            assignment: bounded(assignmentLabel(resolved[index], mode, xmltvId, catalogueLoaded, channels), 1200), revision };
    });
    for (const [channel, xmltvId] of Object.entries(manual)) {
        if (present.has(channel)) continue;
        const previous = draft.get(channel);
        rows.push({ channel, tvChannel: previous?.tvChannel || channel,
            mode: previous?.mode || (xmltvId ? 'manual' : 'disabled'), xmltvId: previous?.xmltvId ?? xmltvId,
            assignment: 'Nicht in der gespeicherten TV-Senderliste; bisherige Korrektur bleibt erhalten', revision });
    }
    return { rows, assigned: resolved.filter(row => ['automatic', 'manual'].includes(row.status)).length,
        total: services.length, retained: rows.length - services.length };
}

function mappingStatus(result, catalogueLoaded, catalogueSize) {
    const source = catalogueLoaded ? `${catalogueSize} XMLTV-Sender geladen; ${result.assigned} von ${result.total} TV-Sendern zugeordnet.`
        : 'Die XMLTV-Quelle ist noch nicht geladen. Adresse eintragen und „Quelle laden und Zuordnung prüfen“ anklicken.';
    const television = result.total ? `${result.total} TV-Sender aus der gespeicherten Senderliste.`
        : 'Es sind noch keine TV-Sender gespeichert. Zuerst die gewünschte TV-Senderliste speichern und einmal vom Fernseher einlesen.';
    return `${television} ${source}${result.retained ? ` ${result.retained} bisherige Korrekturen zu fehlenden Sendern bleiben erhalten.` : ''}`;
}

module.exports = { buildMappingRows, mappingStatus };
