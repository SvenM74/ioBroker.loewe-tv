# Prüfbericht 0.1.14

Stand: **19. Oktober 2026**. Version **0.1.14**, Build **`0.1.14-epg-web.1`**.

## Auftrag und umgesetztes Verhalten

| Anforderung | Ergebnis |
|---|---|
| Senderlogos vom TV, ersatzweise geeignete frei verwendbare Grafiken | Das vorhandene `thumbnailUrl`-Feld der Senderliste bleibt im Vollabruf und Katalog erhalten. Die Oberfläche verwendet zuerst das TV-Bild, dann ein passendes lokales Logo und schließlich den Sendernamen. 14 einzeln als PD-textlogo/Public Domain dokumentierte SVGs sind mitgeliefert. |
| Separates Öffnen an die Instanz verlagern | Der Button ist aus der Konfiguration entfernt. `common.localLinks._default` stellt die Programmübersicht an der Instanz und mit `intro: true` im Admin-Schnellzugriff bereit. |
| Zugriff über ioBroker.web konfigurieren | `native.webInstance` wählt eine vorhandene aktive Web-Instanz. Eine Web-Erweiterung liefert die vorhandenen EPG-Dateien unter `/loewe-tv.N/epg.html` und einen Eintrag auf der Web-Startseite aus. Standard ist deaktivierter Web-Zugriff. |
| Ansehen und Aufnahmeplanung in die untere Leiste | Der kontextabhängige Aktionsbutton steht zwischen Stundenauswahl und Sendersuche. |
| EPG-Aktualisierung dorthin verschieben | Die Aktualisierung steht unmittelbar daneben in derselben Leiste. |
| Große TV-Kanalfläche entfernen | Die Fläche samt großer Senderkachel und Fortschrittsbalken entfällt. Eine kompakte Auswahl zeigt Sender, Titel, Zeit und Status; Untertitel und Beschreibung bleiben aufklappbar. Die Tabelle nutzt die verbleibende Höhe. |

Die Bedienung ist in [EPG_GUI.md](EPG_GUI.md), die Einrichtung in [INSTALLATION.md](INSTALLATION.md#update-auf-0114) beschrieben.

## Senderbilder und Senderidentität

Bildadressen sind optionale Darstellungsdaten. Ungültige Werte werden entfernt. Unterschiedliche oder wechselnde Bilder verändern weder Senderidentität noch Programmplatz, Locator oder Aufnahmezuordnung. Bei einem durch Bildadressen zu großen Katalog werden die optionalen Bilder vor der bestehenden Größenprüfung entfernt. Die vollständigen erforderlichen Senderdaten bleiben erhalten. Bereits gespeicherte Kataloge ohne Bilder benötigen keine Migration.

Die UI prüft Bildadressen erneut und lädt sie über `img`. HTTP-TV-Bilder werden beim HTTPS-Zugriff übersprungen. Ein Fehler führt höchstens zum lokalen Ersatzbild und danach zum Namen. Sendernummer, Namenssuche und zugängliche Beschriftungen bleiben erhalten.

Alle 14 [Logoquellen](CHANNEL_LOGOS.md) wurden einzeln geprüft. Das [Manifest](../admin/logos/sources.json) hält die Commons-Dateiseite, den auf einen Commit festgelegten GitHub-Spiegel, Prüfdatum und SHA-256 fest. Die SVGs umfassen zusammen **33.000 Bytes**. Entfernt wurden ausschließlich XML-, Editor-, RDF- und vorhandene Darkreader-Metadaten; fehlende `viewBox`-Angaben wurden passend zum vorhandenen Viewport ergänzt. Es gibt keine aktiven SVG-Inhalte oder externen Ressourcen. Original und bereinigte Datei wurden für jedes Logo bei **190 × 90 Pixeln** gerendert und verglichen: alle 14 Ergebnisse sind pixelgleich. Der Kontaktbogen wurde zusätzlich visuell geprüft.

Die Commons-Einstufung als gemeinfrei ersetzt keine Markenlizenz. Die Grafiken dienen zur Senderkennzeichnung; ihre dokumentierten Varianten sind keine Zusage, dass jedes Logo die jeweils neueste Markenfassung darstellt.

## Admin, Web und Benutzerrechte

Der Web-Adapter lädt die Erweiterung ausschließlich für die ausgewählte Web-Instanz und einen aktivierten LOEWE-TV-Adapter. Die Erweiterung eröffnet keinen Port und liefert nur ausdrücklich zugelassene vorhandene UI-Dateien sowie lokale SVGs. Sie lädt keine TV-Konfiguration in das HTML und führt keine Adapterkommandos aus.

Daten und Aktionen laufen über den vorhandenen Socket der jeweiligen Admin-/Web-Instanz und deren Benutzerrechte. Eine deaktivierte oder externe Socket-Instanz wird für diesen Zugang mit einem Konfigurationshinweis abgelehnt; unterstützt wird die integrierte Verbindung. Instanzpfad, Seitenparameter und Web-Auswahl dürfen nicht auf einen anderen TV zeigen. Relative Weiterleitungen erhalten den Proxypräfix.

Beim Review wurde ein konkreter Unterschied zwischen dem regulären Socket.IO-Client und dem ioBroker-WS-Client reproduziert: Socket.IO deutet einen URL-Pfad als Namespace. Die Bridge übergibt dort nun die Origin als Ziel und den Proxypräfix separat im Transportpfad. Der WS-Client erhält weiterhin seine vollständige Basisadresse. Eine zweite Korrektur gleicht Backend und UI bei codierten Steuerzeichen, Backslashes und überlangen normalisierten Bildadressen ab, damit ein vorhandenes Ersatzlogo erhalten bleibt.

Der Adapter bleibt im Modus `daemon`. Er wird nicht in einen ausschließlich im Web-Prozess ausgeführten Adapter umgewandelt. Je nach Admin-Version wird eine konfigurierte Web-Erweiterung zusätzlich als solche dargestellt; `info.connection` bleibt der Nachweis für die TV-Verbindung.

## Tatsächlich durchgeführte Prüfungen

- Vollständiger Lauf mit **Node.js 24.19.0**: **641 Tests bestanden**, keine fehlgeschlagenen oder übersprungenen Tests.
- Die neuen Prüfungen decken den vollständigen Senderabruf mit Bildern, Kataloggrößen, wechselnde Bildadressen, exakte Senderzuordnung, TV- und Textfallback, HTTPS, Logoquellen und SVG-Inhalte ab.
- UI-Prüfungen sichern Button-Reihenfolge, verbleibende DOM-Referenzen, Auswahlbeschriftung, Aufnahmebestätigung und die bestehende Statusdarstellung.
- Web-/Bridge-Prüfungen sichern Instanzwahl, Admin-Schnellzugriff, Web-Startseite, zulässige Dateien, Authentifizierung, fehlende Berechtigung, externe/deaktivierte Sockets, Proxybasen und das Aufräumen eigener Verbindungen.
- Paketprüfung: Versionen, Build-Kennung, Konfigurationsfelder, Übersetzungen, Objektdefinitionen, Protokollvorlagen und JavaScript-Syntax gültig.
- `git diff --check` ohne Befund. `npm pack --dry-run` enthält die Web-Erweiterung, alle 14 SVGs, das Quellenmanifest und die neuen Anleitungen; insgesamt 108 Paketdateien.

Der unabhängige Review hat nach den beiden behobenen Integrationsfällen keine weiteren funktionalen Blocker gefunden. Die bestehenden Aufnahme-, Journal-, Timer- und Schutzprüfungen gegen erneute Übertragung laufen im vollständigen Testbestand mit.

## Grenzen der Prüfung

Ein produktiver ioBroker-Controller mit Admin und Web sowie der Fernseher des Nutzers wurden hier nicht angesprochen. Ein Browser mit installiertem Rendering-Backend steht in der Arbeitsumgebung nicht bereit; deshalb ist die tatsächliche neue EPG-Oberfläche noch nicht in einem Browser oder am Nutzergerät visuell bestätigt. Der separate SVG-Rendervergleich ist erfolgt, bestätigt aber keine gesamte Browseroberfläche.

Ob der Fernseher brauchbare `thumbnailUrl`-Adressen ausgibt, bleibt eine Geräteprüfung. Die gemeldete erfolgreiche Übergabe zweier Aufnahmeaufträge und der Start der ersten Aufnahme stammen aus dem vorherigen Stand. 0.1.14 verändert keine Sendung, keinen bereits gespeicherten Aufnahmeauftrag und keinen TV-Timer. Ein erfolgreicher Aufnahmeabschluss und die originale Timerlistenantwort bleiben offen dokumentiert.

## Primärquellen der ioBroker-Integration

- [Offizieller Vertrag für ioBroker.web-Erweiterungen](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/WEB-EXTENSIONS-HOWTO.md)
- [Web-Host: Erweiterungen, Anmeldung und Socket-Clients](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts)
- [Admin 7.7.28: localLinks im Schnellzugriff](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Intro.tsx)
- [Admin 7.7.28: Instanzverknüpfungen und Status](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Instances.tsx)
- [ioBroker-Socket-Kommandos und Berechtigungen](https://github.com/ioBroker/ioBroker.socket-classes/blob/df02bc5d522796611cb1804485a91a0f37867ba1/src/lib/socketCommands.ts)

Die jeweiligen Bildquellen sind separat in [CHANNEL_LOGOS.md](CHANNEL_LOGOS.md) verlinkt.
