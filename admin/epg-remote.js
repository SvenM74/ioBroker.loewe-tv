(function (root, factory) {
    'use strict';
    const remote = factory();
    if (typeof module === 'object' && module.exports) module.exports = remote;
    if (root && root.document) {
        root.LoeweEpgRemote = remote;
        const start = () => remote.mount(root.document);
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
}(typeof window === 'undefined' ? null : window, function () {
    'use strict';

    const MAX_PENDING = 6;
    const MAX_WAIT_MS = 4000;
    const REMOTE_KEYS = Object.freeze([
        'mute', 'power_on', 'power_off', 'tv_mode_on', 'dr_archive',
        ...Array.from({ length: 10 }, (_, digit) => `digit_${digit}`),
        'epg', 'home', 'pip', 'text', 'menu', 'back_step', 'info',
        'volume_up', 'volume_down', 'channel_up', 'channel_down', 'up', 'left', 'ok', 'right', 'down',
        'red', 'green', 'yellow', 'blue', 'rewind', 'play', 'fast_forward', 'record', 'pause', 'stop',
    ]);
    const ALLOWED_KEYS = new Set(REMOTE_KEYS);
    const WORDS = {
        de: {
            title: 'Fernbedienung', close: 'Fernbedienung schließen', target: 'Fernseher: {instance}',
            noTarget: 'Kein eindeutiger Fernseher zugeordnet', ready: 'Wähle eine Taste.',
            unavailable: 'Die Fernbedienung ist noch nicht verbunden. Lade die Programmübersicht erneut, falls die Verbindung ausbleibt.',
            invalidTarget: 'Die TV-Instanz ist nicht eindeutig angegeben. Öffne die Programmübersicht über ihren Instanzlink.',
            powerChoice: 'Einschalten oder ausschalten wählen', powerQuestion: 'Was soll der Fernseher tun?',
            cancel: 'Abbrechen', powerOn: 'Einschalten', powerOff: 'Ausschalten',
            top: 'Ton und Ein-/Ausschalten', modes: 'TV und Aufnahmen', digits: 'Sendernummer',
            menus: 'TV-Menüs', navigation: 'Navigation und Sender', volume: 'Lautstärke', channels: 'Sender wechseln',
            colours: 'Farbtasten', transport: 'Wiedergabe und Direktaufnahme',
            keyboard: 'Die Pfeiltasten steuern den Fernseher, solange eine Fernbedienungstaste den Fokus hat. Ziffern wählen einen Sender. Escape schließt die Fernbedienung.',
            sending: 'Sende „{key}“ …', sent: 'Der Fernseher hat auf „{key}“ geantwortet.',
            started: 'Einschaltvorgang gestartet. Das kann einen Moment dauern.',
            alreadyRunning: 'Ein Einschaltvorgang läuft bereits.',
            pending: 'Eine zuvor gedrückte Taste wird noch übertragen.',
            queued: '{count} Taste(n) warten.',
            full: 'Es warten bereits mehrere Tasten. Diese weitere Taste wurde nicht gesendet.',
            expired: 'Die Wartezeit war zu lang. Noch wartende Tasten wurden verworfen.',
            cleared: 'Noch wartende Tasten wurden verworfen. Eine bereits laufende Übertragung kann noch ankommen.',
            notSent: '„{key}“ wurde nicht gesendet.', unknown: 'Übertragung von „{key}“ unklar. Die Taste kann am TV angekommen sein.',
            discarded: 'Noch wartende Tasten wurden verworfen.', noRetry: 'Es wird nichts automatisch erneut gesendet.',
            checkConnection: 'Prüfe die Verbindung zum Adapter und zum Fernseher.',
            permission: 'Melde dich erneut bei ioBroker an und prüfe die Benutzerrechte für Adapter-Nachrichten.',
            busy: 'Bitte warte kurz, bevor du eine weitere Taste drückst.',
            stopped: 'Starte die Adapterinstanz und lade die Programmübersicht erneut.',
            powerConfiguration: 'Prüfe die TV-MAC-Adresse und die Einstellungen zum Einschalten in der Adapter-Konfiguration.',
            invalidCommand: 'Der Tastenbefehl wurde nicht akzeptiert. Lade die Programmübersicht erneut.',
            labels: {
                mute: 'Stummschaltung umschalten', power_on: 'Fernseher einschalten', power_off: 'Fernseher ausschalten',
                tv_mode_on: 'TV-Modus einschalten', dr_archive: 'DR+-Archiv öffnen',
                epg: 'EPG am Fernseher öffnen', home: 'Startseite am Fernseher', pip: 'Bild im Bild',
                text: 'Videotext', menu: 'TV-Menü', back_step: 'Einen Schritt zurück', info: 'Informationen',
                volume_up: 'Lauter', volume_down: 'Leiser', channel_up: 'Nächster Sender', channel_down: 'Vorheriger Sender',
                up: 'Nach oben', left: 'Nach links', ok: 'OK / Bestätigen', right: 'Nach rechts', down: 'Nach unten',
                red: 'Rote Taste', green: 'Grüne Taste', yellow: 'Gelbe Taste', blue: 'Blaue Taste',
                rewind: 'Zurückspringen', play: 'Wiedergabe', fast_forward: 'Vorspringen', record: 'Direktaufnahme am TV', pause: 'Pause', stop: 'Stopp',
            },
            colourNames: { red: 'Rot', green: 'Grün', yellow: 'Gelb', blue: 'Blau' }, digit: 'Ziffer {digit}',
        },
        en: {
            title: 'Remote control', close: 'Close remote control', target: 'Television: {instance}',
            noTarget: 'No unambiguous television selected', ready: 'Choose a button.',
            unavailable: 'The remote control is not connected yet. Reload the programme guide if the connection does not become available.',
            invalidTarget: 'The TV instance is missing or ambiguous. Open the programme guide using its instance link.',
            powerChoice: 'Choose power on or power off', powerQuestion: 'What should the television do?',
            cancel: 'Cancel', powerOn: 'Power on', powerOff: 'Power off',
            top: 'Sound and power', modes: 'TV and recordings', digits: 'Channel number',
            menus: 'TV menus', navigation: 'Navigation and channels', volume: 'Volume', channels: 'Change channel',
            colours: 'Colour buttons', transport: 'Playback and direct recording',
            keyboard: 'The arrow keys control the television while a remote button has focus. Number keys select a channel. Escape closes the remote control.',
            sending: 'Sending “{key}” …', sent: 'The television responded to “{key}”.',
            started: 'Power-on started. This may take a moment.',
            alreadyRunning: 'A power-on operation is already in progress.',
            pending: 'A previously pressed button is still being transmitted.',
            queued: '{count} button(s) waiting.',
            full: 'Several buttons are already waiting. This additional button was not sent.',
            expired: 'The wait was too long. Buttons still waiting were discarded.',
            cleared: 'Buttons still waiting were discarded. A transmission already in progress may still arrive.',
            notSent: '“{key}” was not sent.', unknown: 'Delivery of “{key}” is uncertain. The button may have reached the TV.',
            discarded: 'Buttons still waiting were discarded.', noRetry: 'Nothing is automatically sent again.',
            checkConnection: 'Check the connection to the adapter and the television.',
            permission: 'Sign in to ioBroker again and check the user permissions for adapter messages.',
            busy: 'Please wait a moment before pressing another button.',
            stopped: 'Start the adapter instance and reload the programme guide.',
            powerConfiguration: 'Check the TV MAC address and the power-on settings in the adapter configuration.',
            invalidCommand: 'The button command was not accepted. Reload the programme guide.',
            labels: {
                mute: 'Toggle mute', power_on: 'Power on television', power_off: 'Power off television',
                tv_mode_on: 'Switch to TV mode', dr_archive: 'Open DR+ archive',
                epg: 'Open EPG on the television', home: 'TV home screen', pip: 'Picture in picture',
                text: 'Teletext', menu: 'TV menu', back_step: 'Go back one step', info: 'Information',
                volume_up: 'Volume up', volume_down: 'Volume down', channel_up: 'Next channel', channel_down: 'Previous channel',
                up: 'Up', left: 'Left', ok: 'OK / Confirm', right: 'Right', down: 'Down',
                red: 'Red button', green: 'Green button', yellow: 'Yellow button', blue: 'Blue button',
                rewind: 'Skip back', play: 'Play', fast_forward: 'Skip forward', record: 'Direct recording on the TV', pause: 'Pause', stop: 'Stop',
            },
            colourNames: { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' }, digit: 'Digit {digit}',
        },
    };

    function language(value) { return /^en(?:-|$)/i.test(value || '') ? 'en' : 'de'; }
    function translate(lang, key, values = {}) {
        return String(WORDS[language(lang)][key] || key).replace(/\{(\w+)\}/gu, (_, name) => String(values[name] ?? ''));
    }
    function keyLabel(lang, key) {
        if (/^digit_\d$/u.test(key)) return translate(lang, 'digit', { digit: key.slice(-1) });
        return WORDS[language(lang)].labels[key] || '';
    }
    function keyboardCommand(event) {
        if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return null;
        if (/^[0-9]$/u.test(event.key || '')) return `digit_${event.key}`;
        return { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key] || null;
    }
    function failure(code, delivery = 'notSent') {
        const error = new Error(code);
        error.code = code;
        error.delivery = delivery;
        return error;
    }
    function normalizeReply(value, key, instance) {
        const statuses = key === 'power_on' ? ['started', 'alreadyRunning'] : ['sent'];
        if (!value || value.ok !== true || value.key !== key || value.instance !== instance
            || !statuses.includes(value.status)) {
            throw failure('REMOTE_RESPONSE_INVALID', 'unknown');
        }
        return { key, status: value.status, instance };
    }
    function errorHint(lang, code, key) {
        let message = 'checkConnection';
        if (code === 'EPG_GUIDE_PERMISSION') message = 'permission';
        else if (code === 'REMOTE_BUSY') message = 'busy';
        else if (code === 'REMOTE_UNAVAILABLE' || code === 'CLOSED') message = 'stopped';
        else if (code === 'REMOTE_TARGET_CHANGED' || code === 'EPG_GUIDE_INSTANCE') message = 'invalidTarget';
        else if (code === 'REMOTE_VALIDATION') message = key === 'power_on' ? 'powerConfiguration' : 'invalidCommand';
        return translate(lang, message);
    }

    // A short FIFO permits number sequences without concurrent TV requests.
    // An error or stale first queued key discards the whole remaining sequence:
    // sending only the tail of a channel number would select a different channel.
    function createCommandQueue(send, onEvent = () => {}, options = {}) {
        const now = options.now || Date.now;
        const maxPending = options.maxPending || MAX_PENDING;
        const maxWait = options.maxWait || MAX_WAIT_MS;
        const waiting = [];
        let active = null;
        let generation = 0;
        let disposed = false;
        const snapshot = () => ({ active: active?.key || null, queued: waiting.length });
        function emit(type, details = {}) { if (!disposed) onEvent({ type, ...details, ...snapshot() }); }
        async function drain() {
            if (active || disposed || !waiting.length) return;
            const item = waiting.shift();
            if (now() - item.createdAt > maxWait) {
                const discarded = 1 + waiting.splice(0).length;
                emit('expired', { discarded });
                return;
            }
            active = item;
            emit('sending', { key: item.key });
            let result;
            let error;
            try { result = await send(item.key); } catch (caught) { error = caught || failure('REMOTE_FAILED', 'unknown'); }
            active = null;
            if (disposed) return;
            if (error) {
                const discarded = waiting.splice(0).length;
                generation++;
                emit('failed', { key: item.key, error, discarded });
            } else if (item.generation === generation) {
                emit('sent', { key: item.key, result });
            } else {
                emit('idle');
            }
            void drain();
        }
        return {
            snapshot,
            enqueue(key) {
                if (disposed || !ALLOWED_KEYS.has(key)) return false;
                if (waiting.length + (active ? 1 : 0) >= maxPending) { emit('full', { key }); return false; }
                waiting.push({ key, createdAt: now(), generation });
                emit('queued', { key });
                void drain();
                return true;
            },
            clear() {
                const discarded = waiting.splice(0).length;
                generation++;
                if (discarded) emit('cleared', { discarded });
                return discarded;
            },
            dispose() { disposed = true; waiting.splice(0); generation++; },
        };
    }

    function mount(document) {
        const dialog = document.getElementById('remoteDialog');
        const trigger = document.getElementById('openRemote');
        if (!dialog || !trigger || dialog.dataset.remoteMounted) return null;
        const window = document.defaultView;
        const ids = ['remoteOpenLabel', 'remoteTitle', 'remoteTarget', 'closeRemote', 'remoteKeys', 'remoteDevice',
            'remoteKeyboardHelp', 'remoteStatus', 'remoteQueueCount', 'epgGuide'];
        const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        if (Object.values(elements).some(element => !element)) return null;
        dialog.dataset.remoteMounted = 'true';
        const lang = language(window.LoeweEpgBridge?.language || window.navigator?.language);
        const t = (key, values) => translate(lang, key, values);
        const buttons = new Map();
        const orderedControls = [elements.closeRemote];
        let bridge = null;
        let instance = null;
        let available = false;
        let open = false;
        let stopped = false;
        let returnFocus = null;
        let background = null;
        let feedback = null;
        let powerToggle;
        let powerChoices;

        function status(message, tone = 'normal') {
            feedback = { message, tone };
            elements.remoteStatus.textContent = message;
            elements.remoteStatus.dataset.tone = tone;
        }
        function updateQueue(event) {
            elements.remoteQueueCount.hidden = event.queued === 0;
            elements.remoteQueueCount.textContent = t('queued', { count: event.queued });
            for (const [key, button] of buttons) button.classList.toggle('is-sending', key === event.active);
            if (event.type === 'sending') status(t('sending', { key: keyLabel(lang, event.key) }), 'pending');
            else if (event.type === 'sent') {
                const key = event.result.status === 'sent' ? 'sent' : event.result.status;
                status(t(key, { key: keyLabel(lang, event.key) }), 'success');
            } else if (event.type === 'failed') {
                const delivery = event.error?.delivery === 'notSent' ? 'notSent' : 'unknown';
                const discarded = event.discarded ? ` ${t('discarded')}` : '';
                status(`${t(delivery, { key: keyLabel(lang, event.key) })}${discarded} ${t('noRetry')} ${errorHint(lang, event.error?.code, event.key)}`, 'error');
            } else if (['full', 'expired', 'cleared'].includes(event.type)) status(t(event.type), 'warning');
            else if (event.type === 'idle' && !event.queued) status(t('ready'));
        }
        const queue = createCommandQueue(async key => {
            const expected = instance;
            let current;
            try { current = bridge?.getInstance(); } catch { throw failure('REMOTE_TARGET_CHANGED'); }
            if (!available || !bridge || current !== expected) throw failure('REMOTE_TARGET_CHANGED');
            const reply = await bridge.sendRemoteCommand(key);
            return normalizeReply(reply, key, expected);
        }, updateQueue, { now: () => window.performance?.now?.() ?? Date.now() });

        function group(className, label) {
            const node = document.createElement('div');
            node.className = className;
            node.setAttribute('role', 'group');
            node.setAttribute('aria-label', t(label));
            return node;
        }
        function control(parent, face, label, className, action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `remote-key ${className || ''}`.trim();
            button.setAttribute('aria-label', label);
            button.title = label;
            const symbol = document.createElement('span');
            symbol.className = 'remote-key-face';
            symbol.setAttribute('aria-hidden', 'true');
            if (face === 'mute') {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M11 4 6 8H3v8h3l5 4V4Z M15 9l6 6m0-6-6 6');
                svg.appendChild(path);
                symbol.appendChild(svg);
            } else symbol.textContent = face;
            button.appendChild(symbol);
            button.addEventListener('click', action);
            parent.appendChild(button);
            orderedControls.push(button);
            return button;
        }
        function keyButton(parent, key, face, className, letters) {
            const button = control(parent, face, keyLabel(lang, key), className, () => press(key));
            button.dataset.remoteKey = key;
            if (/^digit_\d$/u.test(key)) button.setAttribute('aria-keyshortcuts', key.slice(-1));
            const arrow = { up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowDown' }[key];
            if (arrow) button.setAttribute('aria-keyshortcuts', arrow);
            if (letters) {
                const hint = document.createElement('span');
                hint.className = 'remote-key-letters';
                hint.setAttribute('aria-hidden', 'true');
                hint.textContent = letters;
                button.appendChild(hint);
            }
            buttons.set(key, button);
            return button;
        }
        function powerChoice(show) {
            powerChoices.hidden = !show;
            powerToggle.setAttribute('aria-expanded', String(show));
            if (open) (show ? buttons.get('power_on') : powerToggle).focus();
        }
        const top = group('remote-top', 'top');
        keyButton(top, 'mute', 'mute', 'remote-round remote-mute');
        powerToggle = control(top, '⏻', t('powerChoice'), 'remote-round remote-power', () => powerChoice(powerChoices.hidden));
        powerToggle.setAttribute('aria-expanded', 'false');
        powerToggle.setAttribute('aria-controls', 'remotePowerOptions');
        elements.remoteKeys.appendChild(top);
        powerChoices = group('remote-power-options', 'powerQuestion');
        powerChoices.id = 'remotePowerOptions';
        powerChoices.hidden = true;
        const powerQuestion = document.createElement('p');
        powerQuestion.textContent = t('powerQuestion');
        powerChoices.appendChild(powerQuestion);
        keyButton(powerChoices, 'power_on', t('powerOn'), 'remote-power-on');
        keyButton(powerChoices, 'power_off', t('powerOff'), 'remote-power-off');
        control(powerChoices, t('cancel'), t('cancel'), 'remote-power-cancel', () => powerChoice(false));
        elements.remoteKeys.appendChild(powerChoices);
        const modes = group('remote-modes', 'modes');
        keyButton(modes, 'tv_mode_on', 'TV');
        keyButton(modes, 'dr_archive', 'DR+');
        elements.remoteKeys.appendChild(modes);
        const digits = group('remote-digits', 'digits');
        const letters = ['', '', 'abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz'];
        for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
            keyButton(digits, `digit_${digit}`, String(digit), `remote-digit${digit === 0 ? ' remote-zero' : ''}`, letters[digit]);
        }
        elements.remoteKeys.appendChild(digits);
        const menus = group('remote-menus', 'menus');
        const menuTop = document.createElement('div');
        menuTop.className = 'remote-menu-three';
        for (const key of ['epg', 'home', 'pip']) keyButton(menuTop, key, key.toUpperCase());
        menus.appendChild(menuTop);
        const menuBottom = document.createElement('div');
        menuBottom.className = 'remote-menu-four';
        for (const key of ['text', 'menu', 'back_step', 'info']) keyButton(menuBottom, key, key === 'back_step' ? 'BACK' : key.toUpperCase());
        menus.appendChild(menuBottom);
        elements.remoteKeys.appendChild(menus);
        const navigation = group('remote-navigation', 'navigation');
        const volume = group('remote-rocker', 'volume');
        keyButton(volume, 'volume_up', '+ V');
        keyButton(volume, 'volume_down', '− V');
        navigation.appendChild(volume);
        const dpad = group('remote-dpad', 'navigation');
        for (const [key, face] of [['up', '▲'], ['left', '◀'], ['ok', 'OK'], ['right', '▶'], ['down', '▼']]) {
            keyButton(dpad, key, face, `remote-direction remote-${key}`);
        }
        navigation.appendChild(dpad);
        const channels = group('remote-rocker', 'channels');
        keyButton(channels, 'channel_up', 'P +');
        keyButton(channels, 'channel_down', 'P −');
        navigation.appendChild(channels);
        elements.remoteKeys.appendChild(navigation);
        const colours = group('remote-colours', 'colours');
        for (const key of ['red', 'green', 'yellow', 'blue']) {
            keyButton(colours, key, WORDS[lang].colourNames[key], `remote-colour remote-colour-${key}`);
        }
        elements.remoteKeys.appendChild(colours);
        const transport = group('remote-transport', 'transport');
        for (const [key, face] of [['rewind', '◀◀'], ['play', '▶'], ['fast_forward', '▶▶'], ['record', '●'], ['pause', 'Ⅱ'], ['stop', '■']]) {
            keyButton(transport, key, face, `remote-transport-${key}`);
        }
        elements.remoteKeys.appendChild(transport);

        function bindBridge() {
            if (stopped) return;
            const candidate = window.LoeweEpgBridge;
            let next = null;
            let error = 'unavailable';
            if (candidate && typeof candidate.getInstance === 'function' && typeof candidate.sendRemoteCommand === 'function') {
                try {
                    next = candidate.getInstance();
                    if (typeof next !== 'string' || !/^loewe-tv\.(?:0|[1-9]\d{0,8})$/u.test(next)) next = null;
                } catch { next = null; }
                error = 'invalidTarget';
            }
            if (instance && next !== instance) queue.clear();
            instance = next;
            bridge = next ? candidate : null;
            available = Boolean(bridge);
            elements.remoteTarget.textContent = instance ? t('target', { instance }) : t('noTarget');
            for (const button of buttons.values()) button.disabled = !available;
            powerToggle.disabled = !available;
            if (!available) status(t(error), 'setup');
            else if (!feedback || feedback.tone === 'setup') status(t('ready'));
        }
        function press(key) {
            if (stopped || !open || !available || !ALLOWED_KEYS.has(key)) return false;
            if (key === 'power_on' || key === 'power_off') powerChoice(false);
            return queue.enqueue(key);
        }
        function visibleControls() {
            return orderedControls.filter(button => {
                if (button.disabled) return false;
                for (let node = button; node && node !== dialog; node = node.parentElement) if (node.hidden) return false;
                return true;
            });
        }
        function restoreBackground() {
            if (!background) return;
            elements.epgGuide.inert = background.inert;
            if (background.inertAttribute === null) elements.epgGuide.removeAttribute('inert');
            else elements.epgGuide.setAttribute('inert', background.inertAttribute);
            if (background.ariaHidden === null) elements.epgGuide.removeAttribute('aria-hidden');
            else elements.epgGuide.setAttribute('aria-hidden', background.ariaHidden);
            document.body.style.overflow = background.overflow;
            background = null;
        }
        function finishClose() {
            if (!open) return;
            open = false;
            queue.clear();
            powerChoices.hidden = true;
            powerToggle.setAttribute('aria-expanded', 'false');
            restoreBackground();
            const focus = returnFocus?.isConnected !== false && !returnFocus?.disabled ? returnFocus : trigger;
            focus?.focus();
            returnFocus = null;
        }
        function close() {
            if (!open) return;
            if (typeof dialog.close === 'function') dialog.close();
            else dialog.removeAttribute('open');
            finishClose();
        }
        function show() {
            if (stopped || open || document.getElementById('recordingDialog')?.open) return false;
            returnFocus = document.activeElement || trigger;
            bindBridge();
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
            open = true;
            background = { inert: Boolean(elements.epgGuide.inert), inertAttribute: elements.epgGuide.getAttribute('inert'),
                ariaHidden: elements.epgGuide.getAttribute('aria-hidden'), overflow: document.body.style.overflow };
            // Keep the top of the remote visible when the scrollable panel opens.
            (available ? buttons.get('mute') : elements.closeRemote).focus();
            elements.epgGuide.inert = true;
            elements.epgGuide.setAttribute('inert', '');
            elements.epgGuide.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = 'hidden';
            if (available && queue.snapshot().active) status(t('pending'), 'pending');
            return true;
        }
        function keydown(event) {
            if (!open || stopped) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
            if (!dialog.contains(event.target)) {
                event.preventDefault();
                event.stopPropagation();
                visibleControls()[0]?.focus();
                return;
            }
            event.stopPropagation();
            if (event.key === 'Tab') {
                const controls = visibleControls();
                const first = controls[0];
                const last = controls.at(-1);
                if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
                    event.preventDefault();
                    (event.shiftKey ? last : first)?.focus();
                }
                return;
            }
            if (!elements.remoteKeys.contains(event.target)) return;
            if (event.repeat && (keyboardCommand({ key: event.key, altKey: event.altKey, ctrlKey: event.ctrlKey,
                metaKey: event.metaKey, isComposing: event.isComposing }) || ['Enter', ' ', 'Spacebar'].includes(event.key))) {
                event.preventDefault();
                return;
            }
            if (powerChoices.contains(event.target)) return;
            const key = keyboardCommand(event);
            if (key) { event.preventDefault(); press(key); }
        }
        function focusin(event) {
            if (open && !dialog.contains(event.target)) visibleControls()[0]?.focus();
        }
        function cancel(event) { event.preventDefault(); close(); }
        function visibility() { if (document.hidden) queue.clear(); }
        function destroy() {
            if (stopped) return;
            close();
            stopped = true;
            queue.dispose();
            document.removeEventListener('keydown', keydown, true);
            document.removeEventListener('focusin', focusin, true);
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('loewe-epg-bridge-ready', bindBridge);
            window.removeEventListener('pagehide', destroy);
        }
        elements.remoteOpenLabel.textContent = t('title');
        elements.remoteTitle.textContent = t('title');
        elements.closeRemote.setAttribute('aria-label', t('close'));
        elements.closeRemote.title = t('close');
        elements.remoteKeyboardHelp.textContent = t('keyboard');
        trigger.addEventListener('click', show);
        elements.closeRemote.addEventListener('click', close);
        dialog.addEventListener('cancel', cancel);
        dialog.addEventListener('close', finishClose);
        document.addEventListener('keydown', keydown, true);
        document.addEventListener('focusin', focusin, true);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('loewe-epg-bridge-ready', bindBridge);
        window.addEventListener('pagehide', destroy, { once: true });
        bindBridge();
        return { open: show, close, press, destroy };
    }

    return { MAX_PENDING, MAX_WAIT_MS, REMOTE_KEYS, WORDS, language, translate, keyLabel, keyboardCommand,
        normalizeReply, createCommandQueue, mount };
}));
