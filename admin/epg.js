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
            heading: 'Programmübersicht', refresh: 'EPG aktualisieren', tvChannel: 'TV-KANAL',
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
            dataSource: 'Programmdaten vom Fernseher',
            keyboardHelp: 'Sendung anklicken für Details. Mit den Pfeiltasten zwischen Sendungen wechseln.',
            sourceNote: 'Die Übersicht zeigt die gespeicherte Senderliste dieser Instanz. Ungespeicherte Einstellungen sind noch nicht aktiv. Leere Bereiche enthalten keine gelieferten Programmdaten. Die Auswahl einer Sendung schaltet den Fernseher nicht um.',
            current: 'Jetzt im Programm', upcoming: 'Vorschau', ended: 'Vergangene Sendung',
            unknownEnd: 'Ende unbekannt', noDescription: 'Zu dieser Sendung liegt keine Beschreibung vor.',
            descriptionTruncated: 'Die Beschreibung wurde für die Übersicht gekürzt.',
            minutes: '{count} Min.', updated: 'Aktualisiert: {time}', noUpdate: 'Noch keine EPG-Aktualisierung',
            refreshing: 'EPG wird vom Fernseher geladen: {completed} von {total} Sendern.',
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
            noProgrammesDescription: 'Für diesen Zeitraum liegen vom Fernseher noch keine Programmdaten vor. Mit „Jetzt“ kehrst du zur aktuellen Vorschau zurück.',
            rowWaiting: 'Noch keine Programmdaten vorhanden', rowDisabled: 'EPG deaktiviert',
            rowInactive: 'Sender nicht verfügbar', rowStale: 'Programmdaten veraltet',
            rowError: 'Programmdaten konnten nicht geladen werden', rowUnsupported: 'TV liefert keine EPG-Daten für diesen Sender',
            channelDetails: 'Details zu {name}', programmes: '{channels} Sender · {events} Sendungen im Zeitraum',
            filteredProgrammes: '{channels} von {total} Sendern · {events} Sendungen im Zeitraum',
            today: 'Heute', programmeLabel: '{channel}, {title}, {time}',
            unavailable: 'Instanz nicht erreichbar', responseInvalid: 'Die Instanz hat eine ungültige Programmübersicht geliefert.',
        },
        en: {
            heading: 'Programme guide', refresh: 'Refresh EPG', tvChannel: 'TV CHANNEL',
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
            dataSource: 'Programme information from the TV',
            keyboardHelp: 'Select a programme for details. Use the arrow keys to move between programmes.',
            sourceNote: 'This guide shows the saved channel list for this instance. Unsaved settings are not active yet. Empty areas have no programme information from the TV. Selecting a programme does not change the TV channel.',
            current: 'On now', upcoming: 'Coming up', ended: 'Past programme',
            unknownEnd: 'End time unknown', noDescription: 'No description is available for this programme.',
            descriptionTruncated: 'The description has been shortened for this guide.',
            minutes: '{count} min', updated: 'Updated: {time}', noUpdate: 'EPG has not been updated yet',
            refreshing: 'Loading EPG from the TV: {completed} of {total} channels.',
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
            noProgrammesDescription: 'The TV has not supplied programme information for this time span. Select “Now” to return to the current schedule.',
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
    function timeWindow(from, hours, now) {
        const duration = [2, 3, 6].includes(Number(hours)) ? Number(hours) : 3;
        const clock = timestamp(now) ? now : Date.now();
        const minimum = Math.ceil((clock - DAY) / HALF_HOUR) * HALF_HOUR;
        const maximum = Math.floor((clock + 2 * DAY - duration * HOUR) / HALF_HOUR) * HALF_HOUR;
        const start = timestamp(from) ? from : Math.floor(clock / HALF_HOUR) * HALF_HOUR - HALF_HOUR;
        const bounded = Math.min(maximum, Math.max(minimum, start));
        return { from: bounded, to: bounded + duration * HOUR, hours: duration, minimum, maximum };
    }
    function normalizeGuide(input) {
        if (!input || typeof input !== 'object' || input.schemaVersion !== 1 || input.source !== 'tv'
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
            const keys = new Set();
            const events = Array.isArray(raw.events) ? raw.events : [];
            if (events.length > 128) throw new Error('EPG_GUIDE_RESPONSE_INVALID');
            for (const event of events) {
                if (!event || typeof event !== 'object' || !timestamp(event.start) || !string(event.title)
                    || (event.end !== null && event.end !== undefined && (!timestamp(event.end) || event.end <= event.start))
                    || (event.endEstimated !== undefined && event.endEstimated !== false)) { invalidEvents++; continue; }
                const normalized = { eventId: string(event.eventId, 256), title: string(event.title),
                    subtitle: string(event.subtitle, 1024), description: string(event.description, 4096),
                    start: event.start, end: event.end ?? null, textTruncated: event.textTruncated === true };
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
        return { instance: string(input.instance, 100), now: input.now, listName: string(input.listName),
            listView: string(input.listView, 512), status: string(input.status, 40),
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
        for (const name of ['listName', 'refreshGuide', 'detailNumber', 'detailStation', 'detailChannel', 'detailState',
            'programmeTitle', 'detailTimes', 'detailSubtitle', 'detailDescription', 'detailProgress', 'detailProgressBar',
            'previousDay', 'nextDay', 'guideDate', 'showNow', 'previousHour', 'nextHour', 'guideDuration', 'visiblePeriod',
            'channelSearch', 'guideStatus', 'statusText', 'retryGuide', 'timelineScroll', 'timelineGrid', 'emptyGuide',
            'emptyTitle', 'emptyDescription', 'guideSummary']) elements[name] = document.getElementById(name);
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
            if (Number.isFinite(available)) scroll.style.height = `${Math.max(233, Math.min(760, Math.floor(available)))}px`;
        }
        function renderDetail() {
            const entry = selection ? programmes.get(selection) : null;
            const channel = entry?.channel || guide?.channels.find(item => item.id === channelSelection);
            text(elements.detailNumber, channel?.number ?? '·');
            text(elements.detailStation, channel?.name || '');
            text(elements.detailChannel, channel ? `${channel.number === null ? '' : `${channel.number}. `}${channel.name}` : t('chooseProgramme'));
            elements.detailState.hidden = !entry;
            elements.detailSubtitle.hidden = !entry?.event.subtitle;
            elements.detailProgress.hidden = true;
            if (!entry) {
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
            text(elements.detailTimes, `${eventTime(event, true)}${event.end === null ? '' : ` · ${t('minutes', { count: Math.round((event.end - event.start) / 60000) })}`}`);
            text(elements.detailSubtitle, event.subtitle);
            text(elements.detailDescription, `${event.description || t('noDescription')}${event.textTruncated ? `\n${t('descriptionTruncated')}` : ''}`);
            text(elements.detailState, t(event.end === null ? 'unknownEnd' : current ? 'current' : event.end <= now ? 'ended' : 'upcoming'));
            elements.detailState.classList.toggle('is-live', current);
            if (current) {
                elements.detailProgress.hidden = false;
                elements.detailProgressBar.style.width = `${Math.max(0, Math.min(100, (now - event.start) / (event.end - event.start) * 100))}%`;
            }
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
            const previous = selection;
            const entry = programmes.get(key);
            selection = entry ? key : null;
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
                channelButton.appendChild(node('span', 'channel-name', channel.name));
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
        function errorMessage(error, fallback) {
            const detail = string(error?.message, 320).replace(/[\r\n\t]+/gu, ' ').trim();
            return `${t(fallback)}${detail && detail !== t(fallback) ? ` ${detail}` : ''}`;
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
                range = timeWindow(range.from, range.hours, clock());
                text(elements.listName, [guide.instance, guide.listName].filter(Boolean).join(' · '));
                elements.listName.title = elements.listName.textContent;
                renderControls();
                renderGrid();
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
            translatePage();
            elements.refreshGuide.disabled = true;
            void loadGuide();
        }
        function destroy() {
            if (stopped) return;
            stopped = true;
            window.clearTimeout(polling);
            window.clearTimeout(resizeTimer);
            window.clearTimeout(bridgeTimer);
            window.clearInterval(clockTimer);
            resizeObserver?.disconnect();
            window.removeEventListener('loewe-epg-bridge-ready', bindBridge);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', visible);
        }
        function visible() { if (!document.hidden) { updateClock(); void loadGuide(); } }
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
        elements.retryGuide.addEventListener('click', () => { bindBridge(); void loadGuide(); });
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
        visibleEvents, timelineLayout, eventKey, isCurrent, keyboardTarget, mount };
}));
