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
    const button = (id, en, de) => state(id, en, de, 'boolean', 'button', false, true, { def: false });
    const json = (id, en, de) => state(id, en, de, 'string', 'json', true, false, { def: '{}' });
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

    channel('control', 'TV controls', 'TV-Steuerung');
    state('control.volume', 'Volume', 'Lautstärke', 'number', 'level.volume', true, true, {
        min: 0, max: config.maxVolume, step: 1,
        desc: names('TV App level. Only read-back values are acknowledged.', 'TV-App-Stufe. Bestätigung erst nach Rücklesen vom TV.'),
    });
    state('control.mute', 'Mute', 'Stummschaltung', 'boolean', 'media.mute', true, true);
    button('control.powerOn', 'Wake TV using Wake-on-LAN', 'TV per Wake-on-LAN einschalten');
    button('control.powerOff', 'Power off', 'Ausschalten');
    button('control.refresh', 'Read TV status now', 'TV-Status jetzt abfragen');

    channel('remote', 'Remote control', 'Fernbedienung');
    const keyLabels = {
        mute: ['Mute key', 'Stummtaste'], power_off: ['Power off', 'Ausschalten'],
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
        power_all_code: ['Additional power code 25', 'Zusätzlicher Power-Code 25'],
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

    channel('channels', 'Channel lists', 'Senderlisten');
    state('channels.view', 'TV channel list view identifier', 'Kennung der TV-Senderlistenansicht', 'string', 'text', true, true, { def: '' });
    state('channels.start', 'First query item', 'Erster Eintrag der Abfrage', 'number', 'level', true, true, { def: 0, min: 0, step: 1 });
    state('channels.count', 'Maximum items per query', 'Maximale Einträge je Abfrage', 'number', 'level', true, true, { def: 100, min: 1, max: 500, step: 1 });
    button('channels.getLists', 'Read available channel lists', 'Verfügbare Senderlisten abfragen');
    button('channels.getChannels', 'Read selected channel list', 'Ausgewählte Senderliste abfragen');
    json('channels.lists', 'Available channel lists response', 'Antwort mit verfügbaren Senderlisten');
    json('channels.items', 'Selected channels response', 'Antwort mit ausgewählten Sendern');

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
