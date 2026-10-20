'use strict';

const { guideUrl } = require('./epg-sources');
const { EPGSHARE_DE_URL } = require('./epg-provider');

/** Prepare an explicitly requested Admin draft. Saving remains the user's step. */
function prepareInternetEpg(message = {}) {
    if (!message || typeof message !== 'object' || Array.isArray(message)
        || Object.keys(message).some(key => !['url', 'source', 'refreshInterval'].includes(key))) {
        throw Object.assign(new Error('Ungültige Anfrage zur Einrichtung des Internet-EPG.'), { code: 'EPG_XMLTV_CONFIG' });
    }
    const supplied = message.url ?? '';
    if (typeof supplied !== 'string' || (supplied.trim() && !guideUrl(supplied))) {
        throw Object.assign(new Error('Die vorhandene XMLTV-Adresse ist ungültig. Bitte korrigieren oder für die Deutschland-Vorlage leeren.'),
            { code: 'EPG_XMLTV_CONFIG' });
    }
    const value = message.refreshInterval;
    const interval = typeof value === 'number' || (typeof value === 'string' && /^\d{1,5}$/u.test(value.trim()))
        ? Number(value) : 0;
    return {
        native: {
            epgEnabled: true,
            epgSource: message.source === 'xmltv' ? 'xmltv' : 'auto',
            epgXmltvUrl: guideUrl(supplied) || EPGSHARE_DE_URL,
            // Restore automatic fetching when it was disabled or not set.
            // Keep an existing valid interval; the fallback is one hour.
            epgRefreshInterval: Number.isSafeInteger(interval) && interval >= 300 && interval <= 86400 ? interval : 3600,
        },
        result: 'internetEpgPrepared',
    };
}

module.exports = { prepareInternetEpg };
