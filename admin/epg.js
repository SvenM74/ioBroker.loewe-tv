(function (root, factory) {
    'use strict';
    const guide = factory();
    if (typeof module === 'object' && module.exports) module.exports = guide;
    if (root && root.document) {
        root.LoeweEpgGuide = guide;
        const start = () => guide.mount(root.document);
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
}(typeof window === 'undefined' ? null : window, function () {
    'use strict';

    const HOUR = 3600000;
    const DAY = 24 * HOUR;
    const HALF_HOUR = HOUR / 2;
    const LANE_HEIGHT = 70;
    const MESSAGES = {
        de: {
            heading: 'Programmübersicht', refresh: 'EPG aktualisieren', programmeDetails: 'Sendungsdetails',
            watchNow: 'Jetzt ansehen', planRecording: 'Aufnahme planen',
            actionChecking: 'Sendung wird geprüft …', actionRecording: 'Aufnahme wird vorgemerkt …',
            actionViewHint: 'Schaltet den Fernseher auf diesen Sender.',
            actionRecordHint: 'Aufnahme erst nach deiner Bestätigung vormerken.',
            actionOfflineHint: 'Der Fernseher ist offline. Die Aufnahme kann trotzdem vorgemerkt werden.',
            actionUnknownEnd: 'Für eine sichere Auswahl fehlt die Endzeit dieser Sendung.',
            actionEnded: 'Diese Sendung ist bereits beendet.', actionUnavailable: 'Diese Sendung ist derzeit nicht auswählbar.',
            actionFailed: 'Die Auswahl konnte nicht ausgeführt werden.',
            actionSwitched: 'Umschaltbefehl für {channel} wurde gesendet.',
            actionQueued: '„{title}“ ist zur Aufnahme vorgemerkt. Der Übertragungsstatus steht unter Aufnahmeaufträge.',
            selectionChanged: 'Die Senderliste oder die Sendung wurde inzwischen geändert. Bitte wähle die Sendung erneut aus.',
            recordingNoLongerFuture: 'Diese Sendung liegt nicht mehr in der Zukunft. Bitte wähle sie erneut aus.',
            actionResponseInvalid: 'Die Instanz hat eine ungültige Antwort zur Auswahl geliefert.',
            recordingConfirmTitle: 'Sendung aufnehmen?', recordingConfirmDescription: 'Diese Sendung wird zur Aufnahme vorgemerkt:',
            recordingConfirmNote: 'Ist der Fernseher offline, wartet der Adapter auf die Verbindung. Kann der Auftrag vor Sendungsbeginn nicht übertragen werden, ist die Aufnahme nicht gesichert.',
            confirmRecording: 'Aufnahme vormerken', cancel: 'Abbrechen', recordingJobs: 'Aufnahmeaufträge',
            recordingsLoading: 'Aufnahmeaufträge werden geladen …', recordingsEmpty: 'Noch keine Aufnahmeaufträge vorhanden.',
            recordingsFailed: 'Die Aufnahmeaufträge konnten nicht geladen werden.',
            recordingsNotReady: 'Die gespeicherten Aufnahmeaufträge sind noch nicht geladen.',
            recordingsOne: '1 Aufnahmeauftrag', recordingsShown: '{count} Aufnahmeaufträge', recordingsLimited: '{count} von {total} Aufnahmeaufträgen werden angezeigt. Offene Aufträge stehen zuerst.',
            recordingsNote: 'Offline vorgemerkte Aufträge werden übertragen, sobald der Fernseher erreichbar ist. „An TV übertragen“ bedeutet, dass der Fernseher auf den Auftrag geantwortet hat. „Im TV geplant“ bestätigt zusätzlich den passenden Timer.',
            recordingQueued: 'Wartet auf Übertragung', recordingWaiting: 'Wartet auf Fernseher', recordingSending: 'Wird übertragen',
            recordingUncertain: 'Übertragung unklar', recordingScheduled: 'Im TV geplant', recordingRejected: 'Abgelehnt',
            recordingTransferred: 'An TV übertragen', recordingTimerPending: 'Timerabgleich offen',
            recordingMissed: 'Startzeit verpasst', recordingCancelled: 'Vormerkung entfernt', recordingBlockedDevice: 'Anderer Fernseher konfiguriert',
            recordingUnknown: 'Status unbekannt', recordingCancel: 'Vormerkung entfernen', recordingCancelling: 'Wird entfernt …',
            recordingCancelledMessage: 'Die ungesendete Vormerkung wurde entfernt.', recordingCancelFailed: 'Die Vormerkung konnte nicht entfernt werden.',
            recordingUncertainNote: 'Bitte den Timer im Fernseher prüfen. Der Adapter sendet diesen Auftrag nicht automatisch erneut.',
            recordingTransferredNote: 'Der Fernseher hat auf den Aufnahmeauftrag geantwortet. Die automatische Bestätigung über die Timerliste steht noch aus.',
            recordingTimerPendingNote: 'Der Adapter hat noch keinen Aufnahmeauftrag gesendet. Die Zuordnung zu einem vorhandenen TV-Timer ist noch offen.',
            recordingTimerDetails: 'Details zum Timerabgleich',
            savedConfiguration: 'Gespeicherte Instanz-Konfiguration',
            chooseProgramme: 'Sendung auswählen', loading: 'Programmübersicht wird geladen …',
            loadingDescription: 'Die vorhandenen Programmdaten werden aus dem Adapter geladen.',
            controls: 'Programmübersicht einstellen', previousDay: 'Vorheriger Tag', nextDay: 'Nächster Tag',
            date: 'Datum', now: 'Jetzt', previousHour: 'Eine Stunde zurück', nextHour: 'Eine Stunde weiter',
            duration: 'Angezeigter Zeitraum', twoHours: '2 Stunden', threeHours: '3 Stunden', sixHours: '6 Stunden',
            search: 'Sender suchen', connecting: 'Verbindung zum Adapter wird hergestellt …',
            retry: 'Ansicht erneut laden', timeline: 'TV-Programm nach Sender und Uhrzeit',
            scrollable: 'Programmtabelle, horizontal und vertikal scrollbar', grid: 'TV-Programm',
            noChannels: 'Noch keine TV-Sender vorhanden',
            noChannelsDescription: 'Wähle eine Senderliste in der Instanz-Konfiguration und speichere die Einstellungen.',
            dataSource: 'Programmdaten mit Quellenangabe TV / XMLTV',
            keyboardHelp: 'Sendung anklicken für Details. Mit den Pfeiltasten zwischen Sendungen wechseln.',
            sourceNote: 'Die Übersicht zeigt die gespeicherte Senderliste. Leere Bereiche enthalten keine gelieferten Programmdaten. Die Auswahl zeigt Details; „Jetzt ansehen“ schaltet auf eine laufende Sendung. Zukünftige Sendungen lassen sich nach Bestätigung zur Aufnahme vormerken.',
            current: 'Jetzt im Programm', upcoming: 'Vorschau', ended: 'Vergangene Sendung',
            unknownEnd: 'Ende unbekannt', noDescription: 'Zu dieser Sendung liegt keine Beschreibung vor.',
            descriptionTruncated: 'Die Beschreibung wurde für die Übersicht gekürzt.',
            minutes: '{count} Min.', updated: 'Aktualisiert: {time}', noUpdate: 'Noch keine EPG-Aktualisierung',
            refreshing: 'EPG wird geladen: {completed} von {total} Sendern.',
            refreshStarting: 'EPG-Aktualisierung wird angefordert …',
            loadingCache: 'Gespeicherte Programmdaten werden geladen …',
            disabled: 'EPG ist für diese Instanz deaktiviert. Aktiviere EPG und speichere die Einstellungen.',
            notConfigured: 'Für diese Instanz ist noch keine Senderliste gespeichert.',
            offline: 'Der Fernseher ist nicht verbunden. Vorhandene Programmdaten werden angezeigt.',
            partial: 'Für einige Sender fehlen vollständige Programmdaten.',
            stale: 'Die vorhandenen Programmdaten sind veraltet. Starte eine EPG-Aktualisierung.',
            failed: 'Die letzte EPG-Aktualisierung war nicht erfolgreich. Vorhandene Programmdaten bleiben sichtbar.',
            invalidEvents: 'Einige Programmdaten hatten ungültige Zeitangaben und können nicht angezeigt werden.',
            connectionFailed: 'Die Programmübersicht konnte nicht geladen werden. Prüfe, ob die Instanz läuft.',
            refreshFailed: 'Die EPG-Aktualisierung konnte nicht gestartet werden.',
            bridgeMissing: 'Die Verbindung zur Instanz ist noch nicht bereit. Öffne die Übersicht über die Adapter-Konfiguration.',
            noResults: 'Kein passender Sender', noResultsDescription: 'Ändere den Suchbegriff, um die Sender wieder anzuzeigen.',
            noProgrammes: 'Keine Sendungen in diesem Zeitraum',
            noProgrammesDescription: 'Für diesen Zeitraum liegen aus den eingestellten Quellen keine Programmdaten vor. Mit „Jetzt“ kehrst du zur aktuellen Vorschau zurück.',
            rowWaiting: 'Noch keine Programmdaten vorhanden', rowDisabled: 'EPG deaktiviert',
            rowInactive: 'Sender nicht verfügbar', rowStale: 'Programmdaten veraltet',
            rowError: 'Programmdaten konnten nicht geladen werden', rowUnsupported: 'TV liefert keine EPG-Daten für diesen Sender',
            channelDetails: 'Details zu {name}', programmes: '{channels} Sender · {events} Sendungen im Zeitraum',
            filteredProgrammes: '{channels} von {total} Sendern · {events} Sendungen im Zeitraum',
            today: 'Heute', programmeLabel: '{channel}, {title}, {time}',
            unavailable: 'Instanz nicht erreichbar', responseInvalid: 'Die Instanz hat eine ungültige Programmübersicht geliefert.',
        },
        en: {
            heading: 'Programme guide', refresh: 'Refresh EPG', programmeDetails: 'Programme details',
            watchNow: 'Watch now', planRecording: 'Plan recording',
            actionChecking: 'Checking programme …', actionRecording: 'Queuing recording …',
            actionViewHint: 'Changes the TV to this channel.',
            actionRecordHint: 'Queue a recording after your confirmation.',
            actionOfflineHint: 'The TV is offline. You can still queue this recording.',
            actionUnknownEnd: 'The end time needed to select this programme safely is missing.',
            actionEnded: 'This programme has already ended.', actionUnavailable: 'This programme is not currently available for selection.',
            actionFailed: 'The selection could not be completed.',
            actionSwitched: 'The channel switch command for {channel} has been sent.',
            actionQueued: '“{title}” is queued for recording. See Recording requests for its transfer status.',
            selectionChanged: 'The channel list or programme has changed. Please select the programme again.',
            recordingNoLongerFuture: 'This programme is no longer in the future. Please select it again.',
            actionResponseInvalid: 'The instance returned an invalid response for this selection.',
            recordingConfirmTitle: 'Record this programme?', recordingConfirmDescription: 'This programme will be queued for recording:',
            recordingConfirmNote: 'If the TV is offline, the adapter waits for a connection. If the request cannot be transferred before the programme starts, the recording is not assured.',
            confirmRecording: 'Queue recording', cancel: 'Cancel', recordingJobs: 'Recording requests',
            recordingsLoading: 'Loading recording requests …', recordingsEmpty: 'No recording requests yet.',
            recordingsFailed: 'The recording requests could not be loaded.',
            recordingsNotReady: 'Saved recording requests have not loaded yet.',
            recordingsOne: '1 recording request', recordingsShown: '{count} recording requests', recordingsLimited: 'Showing {count} of {total} recording requests. Pending requests come first.',
            recordingsNote: 'Requests queued while offline are transferred when the TV becomes reachable. “Transferred to TV” means the TV replied to the request. “Scheduled on TV” also confirms the matching timer.',
            recordingQueued: 'Waiting for transfer', recordingWaiting: 'Waiting for TV', recordingSending: 'Transferring',
            recordingUncertain: 'Transfer uncertain', recordingScheduled: 'Scheduled on TV', recordingRejected: 'Rejected',
            recordingTransferred: 'Transferred to TV', recordingTimerPending: 'Timer check pending',
            recordingMissed: 'Start time missed', recordingCancelled: 'Request removed', recordingBlockedDevice: 'A different TV is configured',
            recordingUnknown: 'Unknown status', recordingCancel: 'Remove request', recordingCancelling: 'Removing …',
            recordingCancelledMessage: 'The unsent recording request has been removed.', recordingCancelFailed: 'The request could not be removed.',
            recordingUncertainNote: 'Please check the timer on the TV. The adapter will not automatically resend this request.',
            recordingTransferredNote: 'The TV has replied to the recording request. Automatic confirmation through the timer list is still pending.',
            recordingTimerPendingNote: 'The adapter has not sent a recording request yet. Matching it to an existing TV timer is still pending.',
            recordingTimerDetails: 'Timer check details',
            savedConfiguration: 'Saved instance configuration',
            chooseProgramme: 'Select a programme', loading: 'Loading the programme guide …',
            loadingDescription: 'Reading the programme information stored in the adapter.',
            controls: 'Programme guide settings', previousDay: 'Previous day', nextDay: 'Next day',
            date: 'Date', now: 'Now', previousHour: 'One hour earlier', nextHour: 'One hour later',
            duration: 'Visible time span', twoHours: '2 hours', threeHours: '3 hours', sixHours: '6 hours',
            search: 'Find a channel', connecting: 'Connecting to the adapter …',
            retry: 'Reload guide', timeline: 'TV programmes by channel and time',
            scrollable: 'Programme table, scrollable horizontally and vertically', grid: 'TV programmes',
            noChannels: 'No TV channels available yet',
            noChannelsDescription: 'Choose a channel list in the instance configuration and save the settings.',
            dataSource: 'Programme information labelled TV / XMLTV',
            keyboardHelp: 'Select a programme for details. Use the arrow keys to move between programmes.',
            sourceNote: 'This guide shows the saved channel list. Empty areas have no programme information from the configured sources. Select a programme for details; “Watch now” changes to a current programme. Future programmes can be queued for recording after confirmation.',
            current: 'On now', upcoming: 'Coming up', ended: 'Past programme',
            unknownEnd: 'End time unknown', noDescription: 'No description is available for this programme.',
            descriptionTruncated: 'The description has been shortened for this guide.',
            minutes: '{count} min', updated: 'Updated: {time}', noUpdate: 'EPG has not been updated yet',
            refreshing: 'Loading EPG: {completed} of {total} channels.',
            refreshStarting: 'Requesting an EPG update …', loadingCache: 'Loading stored programme information …',
            disabled: 'EPG is disabled for this instance. Enable EPG and save the settings.',
            notConfigured: 'No channel list has been saved for this instance yet.',
            offline: 'The TV is not connected. Available programme information is still shown.',
            partial: 'Complete programme information is not available for every channel.',
            stale: 'Stored programme information is out of date. Start an EPG update.',
            failed: 'The last EPG update failed. Available programme information is still shown.',
            invalidEvents: 'Some programmes had invalid times and cannot be shown.',
            connectionFailed: 'The programme guide could not be loaded. Check that the instance is running.',
            refreshFailed: 'The EPG update could not be started.',
            bridgeMissing: 'The connection to the instance is not ready. Open the guide from the adapter configuration.',
            noResults: 'No matching channel', noResultsDescription: 'Change your search to show the channels again.',
            noProgrammes: 'No programmes in this time span',
            noProgrammesDescription: 'The configured sources have no programme information for this time span. Select “Now” to return to the current schedule.',
            rowWaiting: 'No programme information available yet', rowDisabled: 'EPG disabled',
            rowInactive: 'Channel unavailable', rowStale: 'Programme information is out of date',
            rowError: 'Programme information could not be loaded', rowUnsupported: 'The TV does not supply EPG for this channel',
            channelDetails: 'Details for {name}', programmes: '{channels} channels · {events} programmes in this time span',
            filteredProgrammes: '{channels} of {total} channels · {events} programmes in this time span',
            today: 'Today', programmeLabel: '{channel}, {title}, {time}',
            unavailable: 'Instance unavailable', responseInvalid: 'The instance returned an invalid programme guide.',
        },
    };

    function string(value, maximum = 512) {
        return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').slice(0, maximum) : '';
    }
    function timestamp(value) { return Number.isSafeInteger(value) && value >= 946684800000 && value < 4102444800000; }
    function language(value) { return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'de'; }
    function translate(lang, key, values = {}) {
        return (MESSAGES[language(lang)][key] || MESSAGES.de[key] || key)
            .replace(/\{([a-z]+)\}/giu, (_match, name) => values[name] === undefined ? '' : String(values[name]));
    }
    function eventKey(channelId, event) { return JSON.stringify([channelId, event.eventId, event.start, event.end, event.title]); }
    function isCurrent(event, now) { return event.end !== null && event.start <= now && now < event.end; }
    function programmeAction(event, now, available = true) {
        if (!available || !event || !timestamp(event.start) || !timestamp(now)) return 'unavailable';
        if (!timestamp(event.end) || event.end <= event.start) return 'unknownEnd';
        if (event.end <= now) return 'ended';
        return event.start <= now ? 'view' : 'record';
    }
    function programmeSelection(guide, channel, event) {
        if (!guide || !channel || !event || !string(guide.listView) || !string(guide.catalogRevision, 128)
            || !string(channel.id) || !timestamp(event.start) || !timestamp(event.end) || event.end <= event.start) return null;
        return { channelId: channel.id, eventId: string(event.eventId, 256), start: event.start, end: event.end,
            listView: guide.listView, catalogRevision: guide.catalogRevision };
    }
    function selectionExists(guide, reference) {
        if (!guide || !reference || guide.listView !== reference.listView || guide.catalogRevision !== reference.catalogRevision) return false;
        const channel = guide.channels.find(item => item.id === reference.channelId && item.available !== false);
        return Boolean(channel?.events.some(event => event.eventId === reference.eventId
            && event.start === reference.start && event.end === reference.end));
    }
    function normalizeAction(input, reference) {
        if (!input || typeof input !== 'object' || Array.isArray(input)
            || !['switched', 'confirmRecording', 'recordingQueued', 'unavailable'].includes(input.action)) {
            throw new Error('EPG_PROGRAMME_RESPONSE_INVALID');
        }
        const result = { action: input.action, message: string(input.message || input.reason, 800), job: input.job };
        if (input.action === 'confirmRecording') {
            const programme = input.programme;
            const channel = input.channel;
            if (!reference || !channel || !string(channel.name) || !programme || !string(programme.title)
                || !timestamp(programme.start) || !timestamp(programme.end) || programme.end <= programme.start
                || programme.start !== reference.start || programme.end !== reference.end
                || !input.selection || ['channelId', 'eventId', 'start', 'end', 'listView', 'catalogRevision']
                    .some(key => input.selection[key] !== reference[key])) {
                throw new Error('EPG_PROGRAMME_RESPONSE_INVALID');
            }
            result.channel = { name: string(channel.name), number: Number.isSafeInteger(channel.number) && channel.number >= 0 ? channel.number : null };
            result.programme = { title: string(programme.title), start: programme.start, end: programme.end };
            result.selection = { ...reference };
        } else if (input.action === 'recordingQueued') {
            const job = normalizeRecordings({ schemaVersion: 1, ready: true, jobs: [input.job] }).jobs[0];
            if (!reference || !job || job.status === 'unknown' || job.programme.start !== reference.start
                || job.programme.end !== reference.end) throw new Error('EPG_PROGRAMME_RESPONSE_INVALID');
            result.job = job;
        }
        return result;
    }
    function normalizeRecordings(input) {
        if (!input || typeof input !== 'object' || input.schemaVersion !== 1 || !Array.isArray(input.jobs) || input.jobs.length > 512) {
            throw new Error('EPG_RECORDINGS_RESPONSE_INVALID');
        }
        const knownStatuses = new Set(['queued', 'sending', 'uncertain', 'scheduled', 'rejected', 'missed', 'cancelled', 'blockedDevice']);
        const ids = new Set();
        const jobs = [];
        for (const raw of input.jobs) {
            const id = string(raw?.id, 256);
            if (!id || ids.has(id) || !string(raw?.channel?.name) || !string(raw?.programme?.title)
                || !timestamp(raw.programme.start) || !timestamp(raw.programme.end) || raw.programme.end <= raw.programme.start) continue;
            ids.add(id);
            const status = knownStatuses.has(raw.status) ? raw.status : 'unknown';
            jobs.push({ id, status, channel: { name: string(raw.channel.name), number: Number.isSafeInteger(raw.channel.number) && raw.channel.number >= 0 ? raw.channel.number : null },
                programme: { title: string(raw.programme.title), start: raw.programme.start, end: raw.programme.end },
                createdAt: timestamp(raw.createdAt) ? raw.createdAt : 0,
                updatedAt: timestamp(raw.updatedAt) ? raw.updatedAt : 0,
                acknowledgedAt: raw.attempts === 1 && timestamp(raw.sentAt) && timestamp(raw.acknowledgedAt)
                    ? raw.acknowledgedAt : null,
                // Only explicit, consistent journal metadata proves that no
                // request was sent. Missing fields in older snapshots do not.
                notSent: raw.attempts === 0 && raw.sentAt === null && raw.acknowledgedAt === null,
                lastError: string(raw.lastError || raw.message, 800),
                canCancel: raw.canCancel === true && ['queued', 'blockedDevice'].includes(status) });
        }
        const rank = job => ['queued', 'sending', 'uncertain', 'blockedDevice'].includes(job.status) ? 0 : 1;
        jobs.sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt || b.updatedAt - a.updatedAt || a.programme.start - b.programme.start || a.id.localeCompare(b.id));
        return { ready: input.ready === true, updatedAt: timestamp(input.updatedAt) ? input.updatedAt : null,
            lastError: string(input.lastError, 800), jobs };
    }
    // Presentation only: journal status, retry rules and cancellation remain
    // unchanged. A TV reply never proves that recording has started or ended.
    function recordingPresentation(job, connected) {
        const statusKeys = { queued: connected === false ? 'recordingWaiting' : 'recordingQueued', sending: 'recordingSending',
            uncertain: 'recordingUncertain', scheduled: 'recordingScheduled', rejected: 'recordingRejected',
            missed: 'recordingMissed', cancelled: 'recordingCancelled', blockedDevice: 'recordingBlockedDevice', unknown: 'recordingUnknown' };
        const status = Object.hasOwn(statusKeys, job?.status) ? job.status : 'unknown';
        if (status === 'uncertain' && timestamp(job.acknowledgedAt)) {
            return { status: 'transferred', labelKey: 'recordingTransferred', noteKey: 'recordingTransferredNote',
                mutedNote: true, collapseDiagnostic: true };
        }
        if (status === 'uncertain' && job.notSent === true) {
            return { status: 'timerPending', labelKey: 'recordingTimerPending', noteKey: 'recordingTimerPendingNote',
                mutedNote: true, collapseDiagnostic: false };
        }
        return { status, labelKey: statusKeys[status], noteKey: status === 'uncertain' ? 'recordingUncertainNote' : null,
            mutedNote: false, collapseDiagnostic: false };
    }
    function standaloneUrl(value) {
        try {
            const url = new URL(value);
            const instances = url.searchParams.getAll('instance');
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
                || !url.pathname.endsWith('/adapter/loewe-tv/epg.html') || instances.length !== 1
                || !/^(?:0|[1-9]\d{0,8})$/u.test(instances[0])) return '';
            url.search = '';
            url.searchParams.set('instance', instances[0]);
            url.hash = '';
            return url.href;
        } catch { return ''; }
    }
    function timeWindow(from, hours, now) {
        const duration = [2, 3, 6].includes(Number(hours)) ? Number(hours) : 3;
        const clock = timestamp(now) ? now : Date.now();
        const minimum = Math.ceil((clock - DAY) / HALF_HOUR) * HALF_HOUR;
        const maximum = Math.floor((clock + 2 * DAY - duration * HOUR) / HALF_HOUR) * HALF_HOUR;
        const start = timestamp(from) ? from : Math.floor(clock / HALF_HOUR) * HALF_HOUR - HALF_HOUR;
        const bounded = Math.min(maximum, Math.max(minimum, start));
        return { from: bounded, to: bounded + duration * HOUR, hours: duration, minimum, maximum };
    }
    function localLogoUrl(value) {
        return typeof value === 'string' && value.length <= 90
            && /^logos\/[a-z0-9][a-z0-9-]{0,79}\.svg$/u.test(value) ? value : '';
    }
    function channelLogoUrl(value) {
        const local = localLogoUrl(value);
        if (local) return local;
        if (typeof value !== 'string' || !value || value.length > 2048
            || /[\s\\\u0000-\u001f\u007f]/u.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/iu.test(value)) return '';
        const authority = /^https?:\/\/([^/?#]+)(?:[/?#]|$)/iu.exec(value)?.[1];
        if (!authority || authority.includes('@')) return '';
        try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password
                && url.href.length <= 2048 ? url.href : '';
        } catch { return ''; }
    }
    function channelLogoSources(channel, pageProtocol) {
        const primary = channelLogoUrl(channel?.logoUrl);
        if (!primary) return [];
        if (localLogoUrl(primary)) return [primary];
        const fallback = localLogoUrl(channel?.logoFallback);
        const alternatives = Array.isArray(channel?.logoAlternatives) ? channel.logoAlternatives.slice(0, 3).map(channelLogoUrl) : [];
        return [...new Set([primary, ...alternatives, fallback])]
            .filter(url => url && !(pageProtocol === 'https:' && url.startsWith('http:')));
    }
    function createChannelIdentity(document, channel, pageProtocol) {
        const name = string(channel?.name) || string(channel?.id);
        const identity = document.createElement('span');
        identity.className = 'channel-identity';
        identity.title = name;
        const label = document.createElement('span');
        label.className = 'channel-name';
        label.textContent = name;
        identity.appendChild(label);
        const sources = channelLogoSources(channel, pageProtocol);
        if (sources.length) {
            const logo = document.createElement('img');
            logo.className = 'channel-logo';
            logo.alt = name;
            logo.title = name;
            // Reserve a square before loading; CSS sizes the shared image/text
            // frame for the viewport and contain preserves the logo's shape.
            logo.width = 48;
            logo.height = 48;
            logo.loading = 'lazy';
            logo.decoding = 'async';
            logo.referrerPolicy = 'no-referrer';
            logo.draggable = false;
            let sourceIndex = 0;
            let exhausted = false;
            logo.addEventListener('error', () => {
                if (exhausted) return;
                if (++sourceIndex < sources.length) logo.src = sources[sourceIndex];
                else {
                    exhausted = true;
                    logo.hidden = true;
                    label.hidden = false;
                }
            });
            label.hidden = true;
            identity.appendChild(logo);
            logo.src = sources[0];
        }
        return identity;
    }
    function normalizeGuide(input) {
        if (!input || typeof input !== 'object' || input.schemaVersion !== 1 || !['tv', 'xmltv', 'mixed'].includes(input.source)
            || !Array.isArray(input.channels) || input.channels.length > 4096 || !timestamp(input.now)) {
            throw new Error('EPG_GUIDE_RESPONSE_INVALID');
        }
        let invalidEvents = 0;
        const ids = new Set();
        const channels = [];
        for (const raw of input.channels) {
            if (!raw || typeof raw !== 'object' || !string(raw.id, 512)) continue;
            const id = string(raw.id, 512);
            if (ids.has(id)) continue;
            ids.add(id);
            const number = typeof raw.number === 'number' && Number.isSafeInteger(raw.number) && raw.number >= 0 ? raw.number : null;
            const channel = { id, name: string(raw.name) || id, number, available: raw.available !== false,
                status: string(raw.status, 40), lastUpdate: timestamp(raw.lastUpdate) ? raw.lastUpdate : null,
                lastError: string(raw.lastError, 1500), events: [] };
            const logoUrl = channelLogoUrl(raw.logoUrl);
            if (logoUrl) {
                channel.logoUrl = logoUrl;
                const fallback = localLogoUrl(raw.logoFallback);
                if (!localLogoUrl(logoUrl) && fallback) channel.logoFallback = fallback;
                if (Array.isArray(raw.logoAlternatives)) {
                    channel.logoAlternatives = [...new Set(raw.logoAlternatives.slice(0, 3).map(channelLogoUrl).filter(Boolean))];
                }
            }
            const keys = new Set();
            const events = Array.isArray(raw.events) ? raw.events : [];
            if (events.length > 128) throw new Error('EPG_GUIDE_RESPONSE_INVALID');
            for (const event of events) {
                if (!event || typeof event !== 'object' || !timestamp(event.start) || !string(event.title)
                    || (event.end !== null && event.end !== undefined && (!timestamp(event.end) || event.end <= event.start))
                    || (event.endEstimated !== undefined && event.endEstimated !== false)) { invalidEvents++; continue; }
                const normalized = { eventId: string(event.eventId, 256), title: string(event.title),
                    subtitle: string(event.subtitle, 1024), description: string(event.description, 4096),
                    start: event.start, end: event.end ?? null, textTruncated: event.textTruncated === true,
                    source: event.source === 'xmltv' ? 'xmltv' : event.source === 'tv' ? 'tv' : raw.source === 'xmltv' ? 'xmltv' : 'tv' };
                normalized.key = eventKey(id, normalized);
                if (keys.has(normalized.key)) continue;
                keys.add(normalized.key);
                channel.events.push(normalized);
            }
            channel.events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
            channels.push(channel);
        }
        channels.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name));
        const progress = input.progress && typeof input.progress === 'object' ? input.progress : {};
        const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
        return { source: input.source, instance: string(input.instance, 100), now: input.now, listName: string(input.listName),
            listView: string(input.listView, 512), catalogRevision: string(input.catalogRevision, 128), status: string(input.status, 40),
            lastUpdate: timestamp(input.lastUpdate) ? input.lastUpdate : null, lastError: string(input.lastError, 1500),
            connected: input.connected === true, refreshing: input.refreshing === true || input.status === 'updating',
            progress: { completed: count(progress.completed), total: count(progress.total) }, channels, invalidEvents };
    }
    function filterChannels(channels, query) {
        const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
        return terms.length ? channels.filter(channel => {
            const label = `${channel.number ?? ''} ${channel.name}`.toLocaleLowerCase();
            return terms.every(term => label.includes(term));
        }) : channels;
    }
    function visibleEvents(events, from, to) {
        // Unknown ends stay as explicitly marked start markers, also when their
        // start precedes the visible range. They never cover later time slots.
        return events.filter(event => event.start < to && (event.end === null || event.end > from));
    }
    function timelineLayout(events, from, to, width) {
        if (!(to > from) || !(width > 0)) return { items: [], lanes: 1 };
        const scale = width / (to - from);
        const occupied = [];
        const items = visibleEvents(events, from, to).map(event => {
            const left = Math.max(0, (event.start - from) * scale);
            const right = event.end === null ? Math.min(width, left + 160) : Math.min(width, (event.end - from) * scale);
            let lane = occupied.findIndex(end => end <= left + .01);
            if (lane < 0) lane = occupied.length;
            occupied[lane] = right;
            return { event, left, width: Math.max(1, right - left), lane,
                before: event.start < from, after: event.end !== null && event.end > to };
        });
        return { items, lanes: Math.max(1, occupied.length) };
    }
    function keyboardTarget(rows, channelId, key, direction) {
        const rowIndex = rows.findIndex(row => row.channel.id === channelId);
        if (rowIndex < 0) return null;
        const row = rows[rowIndex];
        const index = row.events.findIndex(event => event.key === key);
        if (index < 0) return null;
        if (direction === 'ArrowLeft') return row.events[Math.max(0, index - 1)] || null;
        if (direction === 'ArrowRight') return row.events[Math.min(row.events.length - 1, index + 1)] || null;
        if (direction === 'Home') return row.events[0] || null;
        if (direction === 'End') return row.events.at(-1) || null;
        if (!['ArrowUp', 'ArrowDown'].includes(direction)) return null;
        const step = direction === 'ArrowUp' ? -1 : 1;
        for (let next = rowIndex + step; next >= 0 && next < rows.length; next += step) {
            if (!rows[next].events.length) continue;
            const target = row.events[index];
            return rows[next].events.reduce((best, event) => Math.abs(event.start - target.start) < Math.abs(best.start - target.start) ? event : best);
        }
        return row.events[index];
    }

    function mount(document) {
        const container = document.getElementById('epgGuide');
        if (!container || container.dataset.mounted) return null;
        container.dataset.mounted = 'true';
        const window = document.defaultView;
        const elements = {};
        for (const name of ['listName', 'refreshGuide', 'detailChannel', 'detailState',
            'programmeTitle', 'detailTimes', 'detailSubtitle', 'detailDescription', 'programmeDescription',
            'previousDay', 'nextDay', 'guideDate', 'showNow', 'previousHour', 'nextHour', 'guideDuration', 'visiblePeriod',
            'channelSearch', 'guideStatus', 'statusText', 'retryGuide', 'timelineScroll', 'timelineGrid', 'emptyGuide',
            'emptyTitle', 'emptyDescription', 'guideSummary', 'programmeActions', 'programmeAction', 'programmeActionHint',
            'actionStatus', 'recordingsPanel', 'recordingCount', 'recordingsStatus', 'recordingsList',
            'recordingDialog', 'recordingConfirmChannel', 'recordingConfirmProgramme', 'recordingConfirmTime',
            'cancelRecordingConfirm', 'confirmRecording']) elements[name] = document.getElementById(name);
        let lang = language(window.navigator.language);
        let locale = lang === 'de' ? 'de-DE' : 'en-GB';
        let guide = null;
        let bridge = null;
        let receivedAt = Date.now();
        let range = timeWindow(null, 3, Date.now());
        let selection = null;
        let channelSelection = null;
        let rows = [];
        let buttons = new Map();
        let programmes = new Map();
        let width = 840;
        let pending = false;
        let reloadQueued = false;
        let stopped = false;
        let refreshPending = false;
        let polling = null;
        let resizeTimer = null;
        let bridgeTimer = null;
        let actionPending = '';
        let confirmation = null;
        let confirmationFocus = null;
        let recordings = null;
        let recordingsPending = false;
        let recordingsReloadQueued = false;
        let recordingsPolling = null;
        let recordingsError = '';
        const cancellingJobs = new Set();
        const expandedRecordingDiagnostics = new Set();
        const t = (key, values) => translate(lang, key, values);
        const clock = () => guide ? guide.now + Date.now() - receivedAt : Date.now();
        const time = value => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
        const day = value => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(value);
        const stamp = value => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
        function dateValue(value) {
            const date = new Date(value);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
        function text(element, value) { element.textContent = value; }
        function node(tag, className, content) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (content !== undefined) element.textContent = content;
            return element;
        }
        function translatePage() {
            lang = language(bridge?.language || window.navigator.language);
            locale = lang === 'de' ? 'de-DE' : 'en-GB';
            document.documentElement.lang = lang;
            document.title = `Loewe TV · ${t('heading')}`;
            for (const element of document.querySelectorAll('[data-i18n]')) text(element, t(element.getAttribute('data-i18n')));
            for (const [attribute, source] of [['aria-label', 'data-i18n-aria'], ['title', 'data-i18n-title'], ['placeholder', 'data-i18n-placeholder']]) {
                for (const element of document.querySelectorAll(`[${source}]`)) {
                    element.setAttribute(attribute, t(element.getAttribute(source)));
                }
            }
        }
        function setStatus(message, tone = 'ready', retry = false) {
            text(elements.statusText, message);
            elements.guideStatus.dataset.tone = tone;
            elements.retryGuide.hidden = !retry;
        }
        function setActionStatus(message, tone = 'ready') {
            if (stopped) return;
            text(elements.actionStatus, message);
            elements.actionStatus.hidden = !message;
            elements.actionStatus.dataset.tone = tone;
            fitTimeline();
        }
        function syncStatus() {
            elements.refreshGuide.disabled = !bridge || !guide || refreshPending || Boolean(guide?.refreshing)
                || Boolean(guide && ['disabled', 'notConfigured', 'unavailable'].includes(guide.status));
            elements.refreshGuide.classList.toggle('is-refreshing', refreshPending || Boolean(guide?.refreshing));
            if (refreshPending) { setStatus(t('refreshStarting'), 'waiting'); return; }
            if (pending) { setStatus(t('loadingCache'), 'waiting'); return; }
            if (!guide) return;
            if (guide.refreshing) {
                setStatus(t('refreshing', { completed: guide.progress.completed, total: guide.progress.total }), 'waiting'); return;
            }
            if (guide.status === 'disabled') { setStatus(t('disabled'), 'warning'); return; }
            if (guide.status === 'notConfigured') { setStatus(t('notConfigured'), 'warning'); return; }
            if (guide.status === 'unavailable') { setStatus(t('unavailable'), 'warning', true); return; }
            if (guide.status === 'stale') { setStatus(t('stale'), 'warning'); return; }
            let message = guide.lastUpdate ? t('updated', { time: stamp(guide.lastUpdate) }) : t('noUpdate');
            let tone = 'ready';
            if (!guide.connected) { message = `${t('offline')} ${message}`; tone = 'warning'; }
            else if (guide.status === 'error') { message = `${t('failed')} ${message}`; tone = 'warning'; }
            else if (guide.invalidEvents) { message = `${t('invalidEvents')} ${message}`; tone = 'warning'; }
            else if (guide.status === 'partial') { message = `${t('partial')} ${message}`; tone = 'warning'; }
            setStatus(message, tone);
        }
        function rowMessage(channel) {
            if (channel.available === false || channel.status === 'inactive') return t('rowInactive');
            const key = { disabled: 'rowDisabled', stale: 'rowStale', error: 'rowError', unsupported: 'rowUnsupported', waiting: 'rowWaiting' }[channel.status];
            return t(key || 'noProgrammes');
        }
        function eventTime(event, includeDate = false) {
            const prefix = includeDate ? `${day(event.start)} · ` : '';
            if (event.end === null) return `${prefix}${time(event.start)} · ${t('unknownEnd')}`;
            const end = dateValue(event.end) === dateValue(event.start) ? time(event.end) : `${day(event.end)} ${time(event.end)}`;
            return `${prefix}${time(event.start)} – ${end}`;
        }
        function fitTimeline() {
            const scroll = elements.timelineScroll;
            const footer = container.querySelector('.guide-footer');
            const note = container.querySelector('.source-note');
            const bottom = (footer?.offsetHeight || 0) + (note?.offsetHeight || 0) + 41;
            const available = window.innerHeight - scroll.getBoundingClientRect().top - bottom;
            if (Number.isFinite(available)) scroll.style.height = `${Math.max(233, Math.floor(available))}px`;
        }
        function renderAction(entry) {
            elements.programmeActions.hidden = !entry;
            elements.programmeActionHint.hidden = !entry;
            if (!entry) { elements.programmeAction.disabled = true; text(elements.programmeActionHint, ''); return; }
            const action = programmeAction(entry.event, clock(), entry.channel.available);
            const reference = programmeSelection(guide, entry.channel, entry.event);
            const supported = typeof bridge?.selectProgramme === 'function' && typeof bridge?.recordProgramme === 'function';
            elements.programmeAction.disabled = stopped || Boolean(actionPending) || Boolean(confirmation)
                || !supported || !reference || !['view', 'record'].includes(action);
            text(elements.programmeAction, actionPending ? t(actionPending === 'record' ? 'actionRecording' : 'actionChecking')
                : t(action === 'view' ? 'watchNow' : 'planRecording'));
            const hint = !supported || !reference ? 'actionUnavailable'
                : { view: 'actionViewHint', record: guide.connected ? 'actionRecordHint' : 'actionOfflineHint',
                    ended: 'actionEnded', unknownEnd: 'actionUnknownEnd', unavailable: 'actionUnavailable' }[action];
            text(elements.programmeActionHint, t(hint));
        }
        function renderDetail() {
            const entry = selection ? programmes.get(selection) : null;
            const channel = entry?.channel || guide?.channels.find(item => item.id === channelSelection);
            text(elements.detailChannel, channel ? `${channel.number === null ? '' : `${channel.number}. `}${channel.name}` : '');
            elements.detailChannel.hidden = !channel;
            elements.detailState.hidden = !entry;
            elements.detailSubtitle.hidden = !entry?.event.subtitle;
            elements.programmeDescription.hidden = !entry && !channel?.lastError;
            renderAction(entry);
            if (!entry) {
                if (elements.programmeDescription.hidden) elements.programmeDescription.open = false;
                text(elements.programmeTitle, channel ? rowMessage(channel) : guide ? t('chooseProgramme') : t('loading'));
                text(elements.detailTimes, '');
                text(elements.detailSubtitle, '');
                text(elements.detailDescription, channel?.lastError || (guide ? t('noProgrammesDescription') : t('loadingDescription')));
                fitTimeline();
                return;
            }
            const event = entry.event;
            const now = clock();
            const current = isCurrent(event, now);
            text(elements.programmeTitle, event.title);
            text(elements.detailTimes, `${eventTime(event, true)}${event.end === null ? '' : ` · ${t('minutes', { count: Math.round((event.end - event.start) / 60000) })}`}`
                + ` · ${event.source === 'xmltv' ? 'XMLTV' : 'TV'}`);
            text(elements.detailSubtitle, event.subtitle);
            text(elements.detailDescription, `${event.description || t('noDescription')}${event.textTruncated ? `\n${t('descriptionTruncated')}` : ''}`);
            text(elements.detailState, t(event.end === null ? 'unknownEnd' : current ? 'current' : event.end <= now ? 'ended' : 'upcoming'));
            elements.detailState.classList.toggle('is-live', current);
            fitTimeline();
        }
        function reveal(button) {
            const scroll = elements.timelineScroll;
            const stationWidth = parseFloat(window.getComputedStyle(container).getPropertyValue('--station-width')) || 190;
            const left = parseFloat(button.style.left);
            const right = left + parseFloat(button.style.width);
            const visibleWidth = Math.max(1, scroll.clientWidth - stationWidth);
            if (left < scroll.scrollLeft) scroll.scrollLeft = left;
            else if (right > scroll.scrollLeft + visibleWidth) scroll.scrollLeft = Math.min(left, right - visibleWidth);
            const top = button.parentElement.parentElement.offsetTop + button.offsetTop;
            if (top < scroll.scrollTop + 43) scroll.scrollTop = Math.max(0, top - 43);
            else if (top + LANE_HEIGHT > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + LANE_HEIGHT - scroll.clientHeight;
        }
        function select(key, focus = false) {
            if (stopped) return;
            const previous = selection;
            const entry = programmes.get(key);
            selection = entry ? key : null;
            if (previous !== selection) {
                if (confirmation && !actionPending) closeConfirmation();
                if (!actionPending) setActionStatus('');
            }
            channelSelection = entry ? entry.channel.id : channelSelection;
            if (previous && buttons.has(previous)) {
                buttons.get(previous).classList.remove('is-selected');
                buttons.get(previous).setAttribute('aria-selected', 'false');
                buttons.get(previous).tabIndex = -1;
            }
            const button = buttons.get(selection);
            if (button) {
                button.classList.add('is-selected');
                button.setAttribute('aria-selected', 'true');
                button.tabIndex = 0;
                if (focus) { button.focus({ preventScroll: true }); reveal(button); }
            }
            for (const heading of elements.timelineGrid.querySelectorAll('.channel-heading')) {
                heading.classList.toggle('is-selected', heading.dataset.channel === channelSelection);
            }
            renderDetail();
        }
        function chooseChannel(channel) {
            channelSelection = channel.id;
            const events = rows.find(row => row.channel.id === channel.id)?.events || [];
            const event = events.find(item => isCurrent(item, clock())) || events[0];
            select(event?.key || null);
        }
        function updateClock() {
            if (!guide) return;
            const now = clock();
            const left = (now - range.from) / (range.to - range.from) * width;
            for (const line of elements.timelineGrid.querySelectorAll('.now-line, .axis-now')) {
                line.hidden = left < 0 || left >= width;
                line.style.left = `${Math.max(0, Math.min(width, left))}px`;
                if (line.classList.contains('axis-now')) text(line, time(now));
            }
            for (const [key, button] of buttons) button.classList.toggle('is-current', isCurrent(programmes.get(key).event, now));
            renderDetail();
        }
        function renderGrid() {
            const scroll = elements.timelineScroll;
            fitTimeline();
            const oldScroll = { left: scroll.scrollLeft, top: scroll.scrollTop };
            const focused = document.activeElement?.dataset?.programme || null;
            const stationWidth = parseFloat(window.getComputedStyle(container).getPropertyValue('--station-width')) || 190;
            width = Math.max(Math.max(1, scroll.clientWidth - stationWidth), range.hours * 280);
            elements.timelineGrid.style.setProperty('--timeline-width', `${width}px`);
            elements.timelineGrid.style.setProperty('--hour-width', `${width / range.hours}px`);
            const channels = filterChannels(guide?.channels || [], elements.channelSearch.value);
            const fragment = document.createDocumentFragment();
            buttons = new Map();
            programmes = new Map();
            rows = [];
            elements.emptyGuide.hidden = channels.length > 0;
            elements.timelineGrid.hidden = !channels.length;
            if (!channels.length) {
                const filtered = Boolean(guide?.channels.length);
                text(elements.emptyTitle, t(filtered ? 'noResults' : 'noChannels'));
                text(elements.emptyDescription, t(filtered ? 'noResultsDescription' : 'noChannelsDescription'));
            }
            const heading = node('div', 'timeline-header');
            heading.setAttribute('role', 'row');
            heading.setAttribute('aria-rowindex', '1');
            const today = dateValue(range.from) === dateValue(clock());
            const date = node('div', 'timeline-date', `${today ? `${t('today')}, ` : ''}${day(range.from)}`);
            date.setAttribute('role', 'columnheader');
            heading.appendChild(date);
            const axis = node('div', 'timeline-axis');
            axis.setAttribute('role', 'columnheader');
            axis.setAttribute('aria-label', `${time(range.from)} – ${time(range.to)}`);
            for (let tick = Math.ceil(range.from / HALF_HOUR) * HALF_HOUR; tick < range.to; tick += HALF_HOUR) {
                const local = new Date(tick);
                const element = node('span', `axis-tick${local.getMinutes() !== 0 ? ' is-minor' : ''}${local.getHours() === 0 && local.getMinutes() === 0 ? ' is-midnight' : ''}`, time(tick));
                element.style.left = `${(tick - range.from) / (range.to - range.from) * width}px`;
                element.setAttribute('aria-hidden', 'true');
                axis.appendChild(element);
            }
            const nowLabel = node('span', 'axis-now');
            nowLabel.setAttribute('aria-hidden', 'true');
            axis.appendChild(nowLabel);
            heading.appendChild(axis);
            fragment.appendChild(heading);
            let totalEvents = 0;
            for (let index = 0; index < channels.length; index++) {
                const channel = channels[index];
                const layout = timelineLayout(channel.events, range.from, range.to, width);
                const row = node('div', 'timeline-row');
                row.setAttribute('role', 'row');
                row.setAttribute('aria-rowindex', String(index + 2));
                row.style.height = `${layout.lanes * LANE_HEIGHT}px`;
                const label = node('div', 'channel-heading');
                label.setAttribute('role', 'rowheader');
                label.dataset.channel = channel.id;
                const channelButton = node('button', 'channel-button');
                channelButton.type = 'button';
                channelButton.setAttribute('aria-label', t('channelDetails', { name: `${channel.number === null ? '' : `${channel.number}. `}${channel.name}` }));
                channelButton.appendChild(node('span', 'channel-number', channel.number ?? '·'));
                channelButton.appendChild(createChannelIdentity(document, channel, window.location?.protocol));
                channelButton.addEventListener('click', () => chooseChannel(channel));
                label.appendChild(channelButton);
                row.appendChild(label);
                const track = node('div', 'programme-track');
                track.setAttribute('role', 'presentation');
                const events = [];
                for (const item of layout.items) {
                    const event = item.event;
                    programmes.set(event.key, { channel, event });
                    events.push(event);
                    const button = node('button', `programme${event.end === null ? ' is-unknown' : ''}${item.width < 75 ? ' is-narrow' : ''}${item.before ? ' is-before' : ''}${item.after ? ' is-after' : ''}`);
                    button.type = 'button';
                    button.style.left = `${item.left}px`;
                    button.style.top = `${item.lane * LANE_HEIGHT}px`;
                    button.style.width = `${item.width}px`;
                    button.dataset.programme = event.key;
                    button.dataset.channel = channel.id;
                    button.setAttribute('role', 'gridcell');
                    button.setAttribute('aria-selected', 'false');
                    button.setAttribute('aria-label', t('programmeLabel', { channel: channel.name, title: event.title, time: eventTime(event) }));
                    button.title = `${event.title}\n${eventTime(event)}`;
                    button.tabIndex = -1;
                    button.appendChild(node('span', 'programme-title', event.title));
                    button.appendChild(node('span', 'programme-time', `${time(event.start)}${event.end === null ? ` · ${t('unknownEnd')}` : ''}`));
                    button.addEventListener('click', () => select(event.key));
                    button.addEventListener('focus', () => { if (selection !== event.key) select(event.key); });
                    track.appendChild(button);
                    buttons.set(event.key, button);
                }
                if (!layout.items.length) track.appendChild(node('span', 'track-empty', rowMessage(channel)));
                const nowLine = node('div', 'now-line');
                nowLine.setAttribute('aria-hidden', 'true');
                track.appendChild(nowLine);
                row.appendChild(track);
                fragment.appendChild(row);
                rows.push({ channel, events });
                totalEvents += events.length;
            }
            elements.timelineGrid.replaceChildren(fragment);
            elements.timelineGrid.setAttribute('aria-rowcount', String(channels.length + 1));
            if (!programmes.has(selection)) {
                const preferred = rows.find(row => row.channel.id === channelSelection) || rows.find(row => row.events.length) || rows[0];
                channelSelection = preferred?.channel.id || null;
                selection = preferred?.events.find(event => isCurrent(event, clock()))?.key || preferred?.events[0]?.key || null;
            }
            select(selection);
            updateClock();
            text(elements.guideSummary, t(channels.length === (guide?.channels.length || 0) ? 'programmes' : 'filteredProgrammes', {
                channels: channels.length, total: guide?.channels.length || 0, events: totalEvents,
            }));
            scroll.scrollLeft = oldScroll.left;
            scroll.scrollTop = oldScroll.top;
            if (focused && buttons.has(focused)) buttons.get(focused).focus({ preventScroll: true });
        }
        function renderControls() {
            elements.guideDate.value = dateValue(range.from);
            elements.guideDate.min = dateValue(range.minimum);
            elements.guideDate.max = dateValue(range.maximum);
            elements.guideDuration.value = String(range.hours);
            text(elements.visiblePeriod, `${time(range.from)} – ${time(range.to)}`);
            elements.previousHour.disabled = range.from <= range.minimum;
            elements.nextHour.disabled = range.from >= range.maximum;
            elements.previousDay.disabled = dateValue(range.from) <= dateValue(range.minimum);
            elements.nextDay.disabled = dateValue(range.from) >= dateValue(range.maximum);
        }
        function schedulePoll() {
            window.clearTimeout(polling);
            if (!stopped) polling = window.setTimeout(() => { if (document.hidden) schedulePoll(); else void loadGuide(); }, guide?.refreshing ? 5000 : 30000);
        }
        function scheduleRecordingsPoll() {
            window.clearTimeout(recordingsPolling);
            const waitingJob = recordings?.jobs.some(job => ['queued', 'sending', 'uncertain'].includes(job.status));
            if (!stopped && typeof bridge?.requestRecordings === 'function') recordingsPolling = window.setTimeout(() => {
                if (document.hidden) scheduleRecordingsPoll(); else void loadRecordings();
            }, waitingJob ? 5000 : 30000);
        }
        function errorMessage(error, fallback) {
            const detail = string(error?.message, 320).replace(/[\r\n\t]+/gu, ' ').trim();
            return `${t(fallback)}${detail && detail !== t(fallback) ? ` ${detail}` : ''}`;
        }
        function selectionError(error) {
            return ['EPG_GUIDE_CHANGED', 'EPG_PROGRAMME_CHANGED', 'EPG_PROGRAMME_NOT_FOUND',
                'EPG_PROGRAMME_UNAVAILABLE', 'EPG_ACTION_EXPIRED'].includes(error?.code);
        }
        function closeConfirmation(restoreFocus = true) {
            confirmation = null;
            if (elements.recordingDialog.open && typeof elements.recordingDialog.close === 'function') elements.recordingDialog.close();
            else elements.recordingDialog.removeAttribute('open');
            if (!stopped) {
                elements.confirmRecording.disabled = false;
                elements.cancelRecordingConfirm.disabled = false;
                if (restoreFocus && confirmationFocus && document.contains(confirmationFocus)) confirmationFocus.focus({ preventScroll: true });
                renderAction(selection ? programmes.get(selection) : null);
            }
            confirmationFocus = null;
        }
        function openConfirmation(result, reference, key) {
            if (stopped || selection !== key || !selectionExists(guide, reference)) {
                setActionStatus(t('selectionChanged'), 'warning'); return;
            }
            confirmation = { reference: result.selection, key, channel: result.channel, programme: result.programme };
            confirmationFocus = document.activeElement;
            text(elements.recordingConfirmChannel, `${result.channel.number === null ? '' : `${result.channel.number}. `}${result.channel.name}`);
            text(elements.recordingConfirmProgramme, result.programme.title);
            text(elements.recordingConfirmTime, eventTime(result.programme, true));
            elements.confirmRecording.disabled = false;
            elements.cancelRecordingConfirm.disabled = false;
            if (typeof elements.recordingDialog.showModal === 'function') elements.recordingDialog.showModal();
            else elements.recordingDialog.setAttribute('open', '');
            // The first focus is deliberately on cancel. Recording requires an explicit choice.
            elements.cancelRecordingConfirm.focus({ preventScroll: true });
            renderAction(selection ? programmes.get(selection) : null);
        }
        async function actOnProgramme() {
            if (stopped || actionPending || confirmation || !bridge) return;
            const key = selection;
            const entry = programmes.get(key);
            if (!entry || !['view', 'record'].includes(programmeAction(entry.event, clock(), entry.channel.available))) return;
            const reference = programmeSelection(guide, entry.channel, entry.event);
            if (!reference || typeof bridge.selectProgramme !== 'function') return;
            actionPending = 'select';
            setActionStatus('');
            renderAction(entry);
            try {
                // The adapter checks its own clock and cache before choosing an action.
                const result = normalizeAction(await bridge.selectProgramme(reference), reference);
                if (stopped) return;
                if (result.action === 'confirmRecording') openConfirmation(result, reference, key);
                else if (result.action === 'switched') setActionStatus(t('actionSwitched', { channel: entry.channel.name }));
                else if (result.action === 'unavailable') setActionStatus(result.message || t('actionUnavailable'), 'warning');
                else throw new Error('EPG_PROGRAMME_RESPONSE_INVALID');
            } catch (error) {
                if (stopped) return;
                setActionStatus(error?.message === 'EPG_PROGRAMME_RESPONSE_INVALID' ? t('actionResponseInvalid')
                    : errorMessage(error, selectionError(error) ? 'selectionChanged' : 'actionFailed'), 'error');
                if (selectionError(error)) await loadGuide();
            } finally {
                actionPending = '';
                if (!stopped) renderAction(selection ? programmes.get(selection) : null);
            }
        }
        async function confirmRecording() {
            if (stopped || actionPending || !confirmation || typeof bridge?.recordProgramme !== 'function') return;
            const chosen = confirmation;
            if (!selectionExists(guide, chosen.reference)) {
                closeConfirmation(); setActionStatus(t('selectionChanged'), 'warning'); return;
            }
            if (programmeAction(chosen.programme, clock()) !== 'record') {
                closeConfirmation(); setActionStatus(t('recordingNoLongerFuture'), 'warning'); void loadGuide(); return;
            }
            actionPending = 'record';
            elements.confirmRecording.disabled = true;
            elements.cancelRecordingConfirm.disabled = true;
            text(elements.confirmRecording, t('actionRecording'));
            renderAction(selection ? programmes.get(selection) : null);
            try {
                const request = { ...chosen.reference, confirmed: true };
                const result = normalizeAction(await bridge.recordProgramme(request), chosen.reference);
                if (stopped) return;
                closeConfirmation();
                if (result.action === 'recordingQueued') {
                    setActionStatus(t('actionQueued', { title: chosen.programme.title }));
                    elements.recordingsPanel.open = true;
                    await loadRecordings();
                    schedulePoll();
                } else if (result.action === 'unavailable') setActionStatus(result.message || t('actionUnavailable'), 'warning');
                else throw new Error('EPG_PROGRAMME_RESPONSE_INVALID');
            } catch (error) {
                if (stopped) return;
                closeConfirmation();
                setActionStatus(error?.message === 'EPG_PROGRAMME_RESPONSE_INVALID' ? t('actionResponseInvalid')
                    : errorMessage(error, selectionError(error) ? 'selectionChanged' : 'actionFailed'), 'error');
                // A failed write is never repeated automatically. The queue read can reveal
                // a request accepted before the connection dropped.
                await loadRecordings();
                if (selectionError(error)) await loadGuide();
            } finally {
                actionPending = '';
                if (!stopped) {
                    text(elements.confirmRecording, t('confirmRecording'));
                    renderAction(selection ? programmes.get(selection) : null);
                }
            }
        }
        function renderRecordings() {
            // Read the current DOM state before replacing the list. Native
            // toggle events can arrive after a refresh has already started.
            for (const details of elements.recordingsList.querySelectorAll('.recording-job-diagnostics')) {
                if (details.open) expandedRecordingDiagnostics.add(details.dataset.job);
                else expandedRecordingDiagnostics.delete(details.dataset.job);
            }
            const jobs = recordings?.jobs || [];
            text(elements.recordingCount, String(jobs.length));
            const fragment = document.createDocumentFragment();
            const shown = jobs.slice(0, 30);
            for (const id of expandedRecordingDiagnostics) {
                if (!jobs.some(job => job.id === id && job.status === 'uncertain' && job.lastError)) expandedRecordingDiagnostics.delete(id);
            }
            for (const job of shown) {
                const presentation = recordingPresentation(job, guide?.connected);
                const item = node('li', 'recording-job');
                item.dataset.job = job.id;
                const copy = node('div', 'recording-job-copy');
                copy.appendChild(node('div', 'recording-job-title', job.programme.title));
                copy.appendChild(node('div', 'recording-job-meta', `${job.channel.number === null ? '' : `${job.channel.number}. `}${job.channel.name} · ${eventTime(job.programme, true)}`));
                if (presentation.noteKey) copy.appendChild(node('p', presentation.mutedNote ? 'recording-job-note' : 'recording-job-detail', t(presentation.noteKey)));
                if (job.lastError && job.status !== 'scheduled') {
                    if (presentation.collapseDiagnostic) {
                        const details = node('details', 'recording-job-diagnostics');
                        details.dataset.job = job.id;
                        details.open = expandedRecordingDiagnostics.has(job.id);
                        details.appendChild(node('summary', '', t('recordingTimerDetails')));
                        details.appendChild(node('p', 'recording-job-detail', job.lastError));
                        copy.appendChild(details);
                    } else copy.appendChild(node('p', 'recording-job-detail', job.lastError));
                }
                item.appendChild(copy);
                const side = node('div', 'recording-job-side');
                const state = node('span', 'recording-job-state', t(presentation.labelKey));
                state.dataset.status = presentation.status;
                side.appendChild(state);
                if (recordings.ready && job.canCancel && typeof bridge?.cancelRecording === 'function') {
                    const button = node('button', 'text-button recording-cancel', t(cancellingJobs.has(job.id) ? 'recordingCancelling' : 'recordingCancel'));
                    button.type = 'button';
                    button.disabled = cancellingJobs.has(job.id);
                    button.addEventListener('click', () => { void cancelRecording(job.id); });
                    side.appendChild(button);
                }
                item.appendChild(side);
                fragment.appendChild(item);
            }
            elements.recordingsList.replaceChildren(fragment);
            if (recordingsError) {
                text(elements.recordingsStatus, recordingsError);
                elements.recordingsStatus.dataset.tone = 'error';
            } else if (recordings) {
                text(elements.recordingsStatus, !recordings.ready ? t('recordingsNotReady')
                    : recordings.lastError || (jobs.length > shown.length ? t('recordingsLimited', { count: shown.length, total: jobs.length })
                        : jobs.length ? t(jobs.length === 1 ? 'recordingsOne' : 'recordingsShown', { count: jobs.length }) : t('recordingsEmpty')));
                elements.recordingsStatus.dataset.tone = recordings.lastError ? 'error' : 'ready';
            }
            fitTimeline();
        }
        async function loadRecordings() {
            if (stopped || typeof bridge?.requestRecordings !== 'function') return;
            if (recordingsPending) { recordingsReloadQueued = true; return; }
            window.clearTimeout(recordingsPolling);
            recordingsPending = true;
            try {
                const result = normalizeRecordings(await bridge.requestRecordings());
                if (stopped) return;
                recordings = result;
                recordingsError = '';
                renderRecordings();
            } catch (error) {
                if (!stopped) {
                    recordingsError = errorMessage(error, 'recordingsFailed');
                    renderRecordings();
                }
            } finally {
                recordingsPending = false;
                if (!stopped && recordingsReloadQueued) { recordingsReloadQueued = false; void loadRecordings(); }
                else scheduleRecordingsPoll();
            }
        }
        async function cancelRecording(jobId) {
            if (stopped || cancellingJobs.has(jobId) || typeof bridge?.cancelRecording !== 'function') return;
            const job = recordings?.jobs.find(item => item.id === jobId);
            if (!recordings?.ready || !job?.canCancel) return;
            cancellingJobs.add(jobId);
            renderRecordings();
            try {
                const result = await bridge.cancelRecording(jobId);
                if (stopped) return;
                if (!result || !(result.job?.status === 'cancelled' || result.status === 'cancelled' || result.cancelled === true)) {
                    throw new Error('EPG_RECORDING_CANCEL_RESPONSE_INVALID');
                }
                setActionStatus(t('recordingCancelledMessage'));
            } catch (error) {
                if (!stopped) setActionStatus(errorMessage(error, 'recordingCancelFailed'), 'error');
            } finally {
                cancellingJobs.delete(jobId);
                if (!stopped) await loadRecordings();
            }
        }
        async function loadGuide() {
            if (stopped || !bridge) return;
            if (pending) { reloadQueued = true; return; }
            window.clearTimeout(polling);
            pending = true;
            container.setAttribute('aria-busy', 'true');
            range = timeWindow(range.from, range.hours, clock());
            const requested = { from: range.from, to: range.to };
            syncStatus();
            try {
                const result = normalizeGuide(await bridge.requestGuide(requested));
                if (stopped || requested.from !== range.from || requested.to !== range.to) return;
                guide = result;
                receivedAt = Date.now();
                const invalidatedConfirmation = confirmation && actionPending !== 'record' && !selectionExists(guide, confirmation.reference);
                if (invalidatedConfirmation) closeConfirmation(false);
                range = timeWindow(range.from, range.hours, clock());
                text(elements.listName, [guide.instance, guide.listName].filter(Boolean).join(' · '));
                elements.listName.title = elements.listName.textContent;
                renderControls();
                renderGrid();
                renderRecordings();
                if (invalidatedConfirmation) setActionStatus(t('selectionChanged'), 'warning');
            } catch (error) {
                if (!stopped && requested.from === range.from && requested.to === range.to) {
                    setStatus(error?.message === 'EPG_GUIDE_RESPONSE_INVALID' ? t('responseInvalid')
                        : errorMessage(error, 'connectionFailed'), 'error', true);
                    elements.refreshGuide.disabled = !guide || guide.refreshing
                        || ['disabled', 'notConfigured', 'unavailable'].includes(guide.status);
                    if (!guide) {
                        text(elements.programmeTitle, t('unavailable'));
                        text(elements.detailDescription, t('connectionFailed'));
                    }
                }
                return;
            } finally {
                pending = false;
                if (!stopped) container.setAttribute('aria-busy', 'false');
                if (reloadQueued && !stopped) { reloadQueued = false; void loadGuide(); }
                else schedulePoll();
            }
            syncStatus();
        }
        function changeRange(from, hours = range.hours) {
            range = timeWindow(from, hours, clock());
            renderControls();
            renderGrid();
            elements.timelineScroll.scrollLeft = 0;
            void loadGuide();
        }
        function moveDay(amount) {
            const date = new Date(range.from);
            date.setDate(date.getDate() + amount);
            changeRange(date.getTime());
        }
        async function refresh() {
            if (stopped || !bridge || !guide || refreshPending || guide.refreshing) return;
            refreshPending = true;
            syncStatus();
            try {
                await bridge.refresh();
                refreshPending = false;
                await loadGuide();
            } catch (error) {
                refreshPending = false;
                if (stopped) return;
                syncStatus();
                setStatus(errorMessage(error, 'refreshFailed'), 'error', true);
                if (error?.code === 'EPG_GUIDE_CHANGED') await loadGuide();
            }
        }
        function bindBridge() {
            const candidate = window.LoeweEpgBridge;
            if (!candidate || typeof candidate.requestGuide !== 'function' || typeof candidate.refresh !== 'function' || stopped) return;
            if (bridge === candidate) return;
            bridge = candidate;
            window.clearTimeout(bridgeTimer);
            window.clearTimeout(recordingsPolling);
            translatePage();
            elements.refreshGuide.disabled = true;
            void loadGuide();
            void loadRecordings();
        }
        function destroy() {
            if (stopped) return;
            stopped = true;
            if (confirmation) closeConfirmation(false);
            window.clearTimeout(polling);
            window.clearTimeout(resizeTimer);
            window.clearTimeout(bridgeTimer);
            window.clearTimeout(recordingsPolling);
            window.clearInterval(clockTimer);
            resizeObserver?.disconnect();
            window.removeEventListener('loewe-epg-bridge-ready', bindBridge);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', visible);
        }
        function visible() { if (!document.hidden) { updateClock(); void loadGuide(); void loadRecordings(); } }
        function resize() {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => { if (!stopped) renderGrid(); }, 100);
        }
        elements.previousDay.addEventListener('click', () => moveDay(-1));
        elements.nextDay.addEventListener('click', () => moveDay(1));
        elements.previousHour.addEventListener('click', () => changeRange(range.from - HOUR));
        elements.nextHour.addEventListener('click', () => changeRange(range.from + HOUR));
        elements.showNow.addEventListener('click', () => changeRange(null));
        elements.guideDuration.addEventListener('change', () => changeRange(range.from, Number(elements.guideDuration.value)));
        elements.guideDate.addEventListener('change', () => {
            if (!/^\d{4}-\d{2}-\d{2}$/u.test(elements.guideDate.value)) { renderControls(); return; }
            const [year, month, date] = elements.guideDate.value.split('-').map(Number);
            const current = new Date(range.from);
            const value = new Date(year, month - 1, date, current.getHours(), current.getMinutes()).getTime();
            changeRange(value);
        });
        elements.channelSearch.addEventListener('input', () => { elements.timelineScroll.scrollTop = 0; renderGrid(); });
        elements.refreshGuide.addEventListener('click', () => { void refresh(); });
        elements.retryGuide.addEventListener('click', () => { bindBridge(); void loadGuide(); void loadRecordings(); });
        elements.programmeAction.addEventListener('click', () => { void actOnProgramme(); });
        elements.confirmRecording.addEventListener('click', () => { void confirmRecording(); });
        elements.cancelRecordingConfirm.addEventListener('click', () => { if (!stopped && !actionPending) closeConfirmation(); });
        elements.recordingDialog.addEventListener('cancel', event => {
            event.preventDefault();
            if (!stopped && !actionPending) closeConfirmation();
        });
        elements.recordingDialog.addEventListener('close', () => { if (confirmation && !actionPending) closeConfirmation(); });
        elements.recordingsPanel.addEventListener('toggle', () => { if (!stopped) fitTimeline(); });
        elements.programmeDescription.addEventListener('toggle', () => { if (!stopped) fitTimeline(); });
        elements.timelineGrid.addEventListener('keydown', event => {
            const button = event.target.closest('.programme');
            if (!button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
                || event.altKey || event.metaKey || event.ctrlKey) return;
            const target = keyboardTarget(rows, button.dataset.channel, button.dataset.programme, event.key);
            if (target) { event.preventDefault(); select(target.key, true); }
        });
        const resizeObserver = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(resize) : null;
        resizeObserver?.observe(elements.timelineScroll);
        const clockTimer = window.setInterval(() => { if (!document.hidden && !stopped) updateClock(); }, 30000);
        window.addEventListener('pagehide', destroy, { once: true });
        window.addEventListener('loewe-epg-bridge-ready', bindBridge);
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', visible);
        translatePage();
        renderControls();
        bridgeTimer = window.setTimeout(() => { if (!bridge && !stopped) setStatus(t('bridgeMissing'), 'warning', true); }, 10000);
        bindBridge();
        return { destroy, reload: loadGuide };
    }

    return { HOUR, DAY, MESSAGES, translate, language, timeWindow, normalizeGuide, filterChannels,
        channelLogoSources, createChannelIdentity,
        visibleEvents, timelineLayout, eventKey, isCurrent, keyboardTarget, programmeAction, programmeSelection,
        selectionExists, normalizeAction, normalizeRecordings, recordingPresentation, standaloneUrl, mount };
}));
