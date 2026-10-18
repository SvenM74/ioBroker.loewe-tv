'use strict';

const names = (en, de) => ({ en, de });
const OWNER = 'loewe-tv-channel-catalog';

// Keep the materialized objects and the channel retirement allow-list derived
// from the same definitions. Unknown user children still prevent deletion.
const RELATIVE_DEFINITIONS = [];
const channel = (id, en, de) => RELATIVE_DEFINITIONS.push({
    id, type: 'channel', common: { name: names(en, de) }, native: { managedBy: OWNER },
});
const state = (id, en, de, type, role, def, extra = {}) => RELATIVE_DEFINITIONS.push({
    id, type: 'state', common: { name: names(en, de), type, role, read: true, write: false, def, ...extra },
    native: { managedBy: OWNER },
});

channel('epg', 'Programme guide', 'Programmdaten');
state('epg.status', 'EPG import status', 'Status des EPG-Abrufs', 'string', 'text', 'waiting', {
    states: {
        disabled: 'EPG ausgeschaltet', waiting: 'Wartet auf Programmdaten', updating: 'Programmdaten werden gelesen',
        ready: 'Programmdaten verfügbar', cached: 'Gespeicherte Programmdaten', partial: 'Programmdaten teilweise verfügbar',
        stale: 'Gespeicherte Programmdaten zu alt',
        empty: 'Keine passenden Programmdaten',
        unsupported: 'EPG-Abfrage nicht unterstützt', error: 'Fehler', inactive: 'Sender nicht mehr aktiv',
    },
});
state('epg.lastUpdate', 'Last successful EPG fetch', 'Letzter erfolgreicher EPG-Abruf', 'number', 'date', 0, { min: 0 });
state('epg.lastError', 'Last EPG error', 'Letzter EPG-Fehler', 'string', 'text', '');

for (const [slot, en, de] of [['now', 'Current programme', 'Aktuelle Sendung'], ['next', 'Next programme', 'Nächste Sendung']]) {
    const prefix = `epg.${slot}`;
    channel(prefix, en, de);
    state(`${prefix}.available`, 'Programme information available', 'Sendungsdaten verfügbar', 'boolean', 'indicator', false);
    state(`${prefix}.title`, 'Title', 'Titel', 'string', 'text', '');
    state(`${prefix}.subtitle`, 'Subtitle', 'Untertitel', 'string', 'text', '');
    state(`${prefix}.description`, 'Description', 'Beschreibung', 'string', 'text', '');
    state(`${prefix}.eventId`, 'Programme identifier', 'Sendungskennung', 'string', 'text', '');
    state(`${prefix}.start`, 'Start time', 'Beginn', 'number', 'date', 0, { min: 0,
        desc: names('Unix timestamp in milliseconds; 0 means unknown.', 'Unixzeit in Millisekunden; 0 bedeutet unbekannt.') });
    state(`${prefix}.end`, 'End time', 'Ende', 'number', 'date', 0, { min: 0,
        desc: names('Unix timestamp in milliseconds; 0 means unknown.', 'Unixzeit in Millisekunden; 0 bedeutet unbekannt.') });
}

state('epg.data', 'Current and next programme snapshot', 'Zusammenhängende Daten der aktuellen und nächsten Sendung', 'string', 'json', '{}', {
    desc: names('Consistent JSON snapshot for scripts. Missing programmes are null.',
        'Zusammenhängender JSON-Schnappschuss für Skripte. Fehlende Sendungen sind null.'),
});
state('epg.cache', 'Stored programme cache', 'Gespeicherte Programmdaten', 'string', 'json', '{}', {
    expert: true,
    desc: names('Internal versioned cache used to restore programme data after a restart. Limited to 128 KiB.',
        'Interner versionierter Cache zum Wiederherstellen der Programmdaten nach einem Neustart. Auf 128 KiB begrenzt.'),
});

const EPG_CHILD_TYPES = Object.freeze(Object.fromEntries(RELATIVE_DEFINITIONS.map(({ id, type }) => [id, type])));
const OBSOLETE_EPG_CHILD_TYPES = Object.freeze({
    'epg.source': 'state',
    'epg.sourceChannelId': 'state',
    'epg.now.endEstimated': 'state',
    'epg.next.endEstimated': 'state',
});

function createEpgDefinitions(rootId) {
    if (typeof rootId !== 'string' || !/^channels\.tv\.[A-Za-z0-9_]+$/u.test(rootId)) {
        throw new TypeError('EPG objects require an existing TV channel root.');
    }
    return RELATIVE_DEFINITIONS.map(definition => ({
        ...structuredClone(definition), id: `${rootId}.${definition.id}`,
    }));
}

module.exports = { createEpgDefinitions, EPG_CHILD_TYPES, OBSOLETE_EPG_CHILD_TYPES };
