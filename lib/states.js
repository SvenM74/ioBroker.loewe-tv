'use strict';

const { KEYS, TABLET_ACTIONS } = require('./loewe-client');

const names = (en, de) => ({ en, de });

/** Objects are generated in one place so configuration, commands and tests agree. */
function createDefinitions(config) {
    const definitions = [];
    const channel = (id, en, de) => definitions.push({
        id, type: 'channel', common: { name: names(en, de) }, native: {},
    });
    const state = (id, en, de, type, role, read, write, extra = {}) => definitions.push({
        id, type: 'state', common: { name: names(en, de), type, role, read, write, ...extra }, native: {},
    });
    const button = (id, en, de, extra = {}) => state(id, en, de, 'boolean', 'button', false, true, { def: false, ...extra });
    const json = (id, en, de, extra = {}) => state(id, en, de, 'string', 'json', true, false, { def: '{}', ...extra });
    const text = (id, en, de) => state(id, en, de, 'string', 'text', true, false, { def: '' });

    channel('info', 'Connection and diagnostics', 'Verbindung und Diagnose');
    state('info.connection', 'TV reachable', 'TV erreichbar', 'boolean', 'indicator.connected', true, false, { def: false });
    state('info.lastSeen', 'Last successful response', 'Letzte erfolgreiche Antwort', 'number', 'date', true, false, { def: 0 });
    text('info.lastError', 'Last error', 'Letzter Fehler');
    text('info.lastCommand', 'Last command', 'Letzter Befehl');
    state('info.lastCommandAt', 'Last command time', 'Zeitpunkt des letzten Befehls', 'number', 'date', true, false, { def: 0 });
    json('info.lastResponse', 'Last response', 'Letzte Antwort');
    state('info.commandPending', 'Operation pending', 'Vorgang läuft', 'boolean', 'indicator.working', true, false, { def: false });
    state('info.wakeReady', 'TV MAC address known', 'TV-MAC-Adresse bekannt', 'boolean', 'indicator', true, false, { def: false });
    json('info.lastWakeOnLan', 'Last Wake-on-LAN transmission', 'Letzter Wake-on-LAN-Versand');
    json('info.powerOn', 'Power-on attempt and result', 'Einschaltversuch und Ergebnis', {
        desc: names('Progress and attempts while waking the network and sending the dedicated TV-on command. Successful transmission does not confirm a visible picture.',
            'Ablauf und Versuche beim Aufwecken des Netzwerks und Senden des gezielten Einschaltbefehls. Erfolgreicher Versand bestätigt kein sichtbares Bild.'),
    });

    channel('control', 'TV controls', 'TV-Steuerung');
    state('control.volume', 'Volume', 'Lautstärke', 'number', 'level.volume', true, true, {
        min: 0, max: config.maxVolume, step: 1,
        desc: names('TV App level. Only read-back values are acknowledged.', 'TV-App-Stufe. Bestätigung erst nach Rücklesen vom TV.'),
    });
    state('control.mute', 'Mute', 'Stummschaltung', 'boolean', 'media.mute', true, true);
    button('control.powerOn', 'Wake network and turn TV on', 'Netzwerk aufwecken und TV einschalten', {
        desc: names('Send Wake-on-LAN, then wait for the network service and send the dedicated TV-on command (22). The configured power-on time limit bounds the attempt.',
            'Wake-on-LAN senden, dann auf den Netzwerkdienst warten und den gezielten Einschaltbefehl (22) senden. Der Versuch endet spätestens am konfigurierten Zeitlimit.'),
    });
    button('control.powerOff', 'Turn TV off with the dedicated command', 'TV gezielt ausschalten', {
        desc: names('Send the dedicated off command (25).', 'Den gezielten Ausschaltbefehl (25) senden.'),
    });
    button('control.refresh', 'Read TV status now', 'TV-Status jetzt abfragen');

    channel('remote', 'Remote control', 'Fernbedienung');
    const keyLabels = {
        mute: ['Mute key', 'Stummtaste'], power_off: ['Power key (toggle, 12)', 'Ein-/Ausschalttaste (Umschalten, 12)'],
        power_on: ['Turn on reachable TV', 'Erreichbaren TV einschalten'],
        radio_mode_on: ['Select radio mode (73)', 'Radiomodus wählen (73)'],
        tv_mode_on: ['Select TV mode (72)', 'TV-Modus wählen (72)'],
        epg: ['Programme guide', 'Programmübersicht'], home: ['Home', 'Home'],
        pip: ['Picture in picture', 'Bild im Bild'], text: ['Teletext', 'Videotext'],
        menu: ['Menu', 'Menü'], back: ['Back', 'Zurück'], info: ['Information', 'Information'],
        volume_up: ['Volume up', 'Lauter'], volume_down: ['Volume down', 'Leiser'],
        channel_up: ['Next channel', 'Nächster Sender'], channel_down: ['Previous channel', 'Vorheriger Sender'],
        ok: ['OK', 'OK'], up: ['Up', 'Hoch'], down: ['Down', 'Runter'],
        left: ['Left', 'Links'], right: ['Right', 'Rechts'], red: ['Red', 'Rot'],
        green: ['Green', 'Grün'], yellow: ['Yellow', 'Gelb'], blue: ['Blue', 'Blau'],
        rewind: ['Rewind', 'Rücklauf'], play: ['Play', 'Wiedergabe'],
        fast_forward: ['Fast forward', 'Vorlauf'], record: ['Record', 'Aufnahme'],
        pause: ['Pause', 'Pause'], stop: ['Stop', 'Stopp'],
        power_all_code: ['Dedicated power off (25)', 'Gezielt ausschalten (25)'],
        epg_alt: ['Alternative programme guide key (78)', 'Alternative EPG-Taste (78)'],
    };
    for (let digit = 0; digit <= 9; digit++) keyLabels[`digit_${digit}`] = [`Digit ${digit}`, `Ziffer ${digit}`];
    for (const name of Object.keys(KEYS)) {
        button(`remote.${name}`, ...keyLabels[name]);
    }

    channel('media', 'Media and text input', 'Medien und Texteingabe');
    state('media.text', 'Send text to the active input field', 'Text an das aktive Eingabefeld senden', 'string', 'text', false, true);
    button('media.backspace', 'Delete previous character', 'Vorheriges Zeichen löschen');
    state('media.locator', 'Play TV media locator', 'TV-Medien-Locator wiedergeben', 'string', 'text', false, true);

    channel('status', 'Reported TV status', 'Gemeldeter TV-Status');
    state('status.volume', 'Reported App volume', 'Gemeldete App-Lautstärke', 'number', 'value', true, false);
    state('status.volumeRaw', 'Reported raw volume', 'Gemeldeter Lautstärke-Rohwert', 'number', 'value', true, false);
    state('status.mute', 'Reported mute state', 'Gemeldete Stummschaltung', 'boolean', 'media.mute', true, false);
    json('status.playback', 'Current playback response', 'Antwort zur aktuellen Wiedergabe');

    channel('device', 'Device information', 'Geräteinformationen');
    json('device.data', 'Device data response', 'Antwort mit Gerätedaten');
    json('device.settings', 'Settings response', 'Antwort mit Einstellungen');
    text('device.macLan', 'Detected LAN MAC address', 'Erkannte LAN-MAC-Adresse');
    text('device.macWlan', 'Detected Wi-Fi MAC address', 'Erkannte WLAN-MAC-Adresse');
    text('device.mac', 'Detected legacy MAC address', 'Erkannte MAC-Adresse älterer Fernseher');
    state('device.wolEnabled', 'Reported network wake-up setting', 'Gemeldete Einstellung zum Netzwerkaufwecken', 'boolean', 'indicator', true, false, {
        desc: names('Unknown until the TV reports a valid Wake-on-LAN setting.', 'Unbekannt, bis der TV eine gültige Wake-on-LAN-Einstellung meldet.'),
    });
    state('device.wolInteractive', 'Reported interactive wake-up setting', 'Gemeldete Einstellung zum interaktiven Aufwecken', 'boolean', 'indicator', true, false, {
        desc: names('Unknown until the TV reports a valid interactive wake-up setting.', 'Unbekannt, bis der TV eine gültige Einstellung zum interaktiven Aufwecken meldet.'),
    });

    channel('channels', 'Channel lists', 'Senderlisten');
    channel('channels.tv', 'TV channels', 'TV-Sender');
    channel('channels.radio', 'Radio channels', 'Radiosender');
    state('channels.view', 'TV channel list view identifier', 'Kennung der TV-Senderlistenansicht', 'string', 'text', true, true, {
        def: '', desc: names('Leave empty to select a channel list reported by the TV automatically.', 'Leer lassen, um automatisch eine vom TV gemeldete Senderliste auszuwählen.'),
    });
    state('channels.start', 'First channel index', 'Startindex der Senderabfrage', 'number', 'level', true, true, { def: 0, min: 0, step: 1 });
    state('channels.listStart', 'First channel-list index', 'Startindex der Senderlistenabfrage', 'number', 'level', true, true, { def: 0, min: 0, step: 1 });
    state('channels.count', 'Maximum items per query', 'Maximale Einträge je Abfrage', 'number', 'level', true, true, {
        def: 100, min: 1, max: 500, step: 1,
        desc: names('Page size for both channel-list and channel queries.', 'Seitengröße für die Abfrage der Senderlisten und der Sender.'),
    });
    state('channels.mediaType', 'Channel type', 'Senderart', 'string', 'text', true, true, {
        def: '', states: { '': 'TV and radio', video: 'TV', audio: 'Radio' },
        desc: names('Empty: TV and radio. video: TV only. audio: radio only.', 'Leer: TV und Radio. video: nur TV. audio: nur Radio.'),
    });
    button('channels.getLists', 'Read available channel lists', 'Verfügbare Senderlisten abfragen');
    button('channels.getChannels', 'Read selected channel list', 'Ausgewählte Senderliste abfragen');
    button('channels.refresh', 'Refresh the complete TV and radio list', 'TV- und Radiosender vollständig abgleichen');
    state('channels.refreshStatus', 'Complete channel refresh status', 'Status des vollständigen Senderabgleichs', 'string', 'text', true, false, {
        def: 'waiting', states: { disabled: 'Automatischer Abgleich aus', waiting: 'Wartet auf den TV', updating: 'Sender werden gelesen', ready: 'Vollständig an Objektaufbereitung übergeben', error: 'Fehler' },
    });
    text('channels.refreshError', 'Last complete channel refresh error', 'Letzter Fehler beim vollständigen Senderabgleich');
    state('channels.refreshLastUpdate', 'Last complete channel refresh', 'Letzter vollständiger Senderabgleich', 'number', 'date', true, false, { def: 0 });
    state('channels.refreshCount', 'Entries in the last complete list', 'Einträge der letzten vollständigen Senderliste', 'number', 'value', true, false, { def: 0, min: 0 });
    json('channels.lists', 'Available channel lists response', 'Antwort mit verfügbaren Senderlisten');
    json('channels.items', 'Selected channels response', 'Antwort mit ausgewählten Sendern');
    json('channels.lastSelection', 'Last channel selection and TV responses', 'Letzte Senderauswahl und TV-Antworten', {
        desc: names('Requested and resolved locator, radio mode change, ZapToMedia result and delayed playback observations. A radio mode response alone does not confirm the exact station.',
            'Angeforderte und aufgelöste Senderadresse, Wechsel in den Radiomodus, ZapToMedia-Ergebnis und zeitversetzte Wiedergabebeobachtungen. Der Radiomodus allein bestätigt nicht den konkreten Sender.'),
    });
    json('channels.availableLists', 'Available channel lists', 'Verfügbare Senderlisten', { def: '[]' });
    json('channels.entries', 'Channels on the latest page', 'Sender der zuletzt abgefragten Seite', { def: '[]' });
    state('channels.totalNumber', 'Reported total number of channels', 'Gemeldete Gesamtzahl der Sender', 'number', 'value', true, false, {
        def: -1, min: -1, desc: names('-1 means that the TV did not report a total.', '-1 bedeutet, dass der TV keine Gesamtzahl gemeldet hat.'),
    });
    state('channels.returnedNumber', 'Channels on the latest page', 'Senderzahl der zuletzt abgefragten Seite', 'number', 'value', true, false, { def: 0, min: 0 });
    state('channels.nextStart', 'Next channel index', 'Startindex der nächsten Senderseite', 'number', 'value', true, false, {
        def: -1, min: -1, desc: names('-1 means that no further page is indicated.', '-1 bedeutet, dass keine weitere Seite angezeigt wird.'),
    });
    state('channels.nextListStart', 'Next channel-list index', 'Startindex der nächsten Senderlistenseite', 'number', 'value', true, false, {
        def: -1, min: -1, desc: names('-1 means that no further page is indicated.', '-1 bedeutet, dass keine weitere Seite angezeigt wird.'),
    });
    state('channels.lastUpdate', 'Last successful channel query', 'Letzte erfolgreiche Senderabfrage', 'number', 'date', true, false, { def: 0 });
    text('channels.lastError', 'Last channel query error', 'Letzter Fehler bei der Senderabfrage');
    json('channels.catalog', 'Stored channel catalogue', 'Gespeicherter Senderkatalog');
    state('channels.catalogStatus', 'Channel object update status', 'Status der Senderobjekte', 'string', 'text', true, false, {
        def: 'empty', states: { empty: 'Keine Sender', updating: 'Senderobjekte werden aktualisiert', ready: 'Bereit', error: 'Fehler' },
    });
    text('channels.catalogError', 'Last channel object update error', 'Letzter Fehler beim Aktualisieren der Senderobjekte');
    state('channels.catalogLastUpdate', 'Last successful channel object update', 'Letzte erfolgreiche Aktualisierung der Senderobjekte', 'number', 'date', true, false, { def: 0 });

    if (config.enableAdvanced) {
        channel('api', 'Additional SOAP actions', 'Zusätzliche SOAP-Aktionen');
        for (const action of TABLET_ACTIONS) {
            const prefix = `api.${action}`;
            channel(prefix, action, action);
            state(`${prefix}.parametersXml`, 'Parameter XML fragment', 'XML-Parameterfragment', 'string', 'text', true, true, { def: '' });
            button(`${prefix}.send`, `Send ${action}`, `${action} senden`);
            json(`${prefix}.responseJson`, 'Parsed response', 'Ausgewertete Antwort');
            text(`${prefix}.responseXml`, 'Original response XML', 'Originales Antwort-XML');
            text(`${prefix}.lastError`, 'Last action error', 'Letzter Aktionsfehler');
        }
    }
    return definitions;
}

module.exports = { createDefinitions };
