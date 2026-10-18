# Prüfbericht: EPG je TV-Sender in Version 0.1.7

Stand: **17. Oktober 2026 (UTC)**. Build: **`0.1.7-epg-now-next.1`**.

**Historischer Bericht zu Version 0.1.7.** Die hier beschriebene alternative EPG-Quelle wurde im Build `0.1.8-tv-epg-only.1` entfernt. Die aktuelle [EPG-Anleitung](EPG.md) und der [neue Prüfbericht](PRUEFBERICHT_0.1.8_TV_EPG.md) beschreiben den heutigen Umfang.

## Ergebnis und Gültigkeit

Version 0.1.7 ergänzt die aktuelle und die nächste Sendung direkt unter den vorhandenen TV-Senderordnern. Die lokale Loewe-Tabelle ist die bevorzugte Quelle. Eine konfigurierte XMLTV-Datei, beispielsweise aus dem vom Nutzer vorgeschlagenen [iptv-org/epg](https://github.com/iptv-org/epg), kann fehlende Daten ersetzen. Die Senderlistenauswahl aus 0.1.6 bleibt verbindlich; der Import legt keine zusätzlichen Sender aus dem externen Guide an.

**Die EPG-Funktion ist implementiert und automatisiert geprüft. Ein erfolgreicher EPG-Abruf am Loewe bild 7.55, Chassis SL420, Software V5.4.6.0 ist noch nicht bestätigt.** Die jüngste Rückmeldung des Nutzers bestätigt die vorherige Version mit Senderlistenauswahl, TV-Senderordnern und Steuerung. Sie ist kein Gerätetest dieser Erweiterung. Auch die erfolgreiche Bedienung von `remote.epg` und `remote.epg_alt` belegt nur das Öffnen der Anzeige am TV.

Die [damalige EPG-Anleitung](https://github.com/SvenM74/ioBroker.loewe-tv/blob/99b074b58a5e365ce2f75760e976b8247a58f129/docs/EPG.md) beschreibt Einrichtung, Datenpunkte und Statuswerte des früheren Stands. Die [historische XMLTV-Anleitung](https://github.com/SvenM74/ioBroker.loewe-tv/blob/99b074b58a5e365ce2f75760e976b8247a58f129/docs/XMLTV.md) enthält die damalige optionale Einrichtung des externen Guides. Quellen und Grenzen des lokalen Protokolls sind in [epg-protocol.md](epg-protocol.md) dokumentiert.

## Implementierter Umfang

| Bereich | Verhalten in 0.1.7 |
|---|---|
| Senderbezug | Vorhandene verfügbare TV-Dienste der konfigurierten Liste, mit Namens-IDs und Programmplatz als Anzeigename. Mehrfachbelegungen eines Dienstes teilen sich den EPG-Bestand. |
| Aktuelle/nächste Sendung | `epg.now` und `epg.next`, jeweils mit `available`, Titel, Untertitel, Beschreibung, Ereigniskennung, Beginn, Ende und Kennzeichnung eines abgeleiteten Endes. |
| Zeitformat | Unix-Zeit in Millisekunden; fehlende Einzelzeiten sind 0, fehlende Ereignisse im JSON sind `null`. |
| Zusammenhängende Ausgabe | `epg.data` enthält Senderbezug, Quelle, Status, letzten Abruf, Fehler, `now` und `next` in einem Wert. Dieser Wert wird nach den Einzelfeldern veröffentlicht. |
| Konfiguration | EPG standardmäßig aktiv, Quelle `auto`, Abrufintervall 900 Sekunden. `tv` und `xmltv` können ausdrücklich gewählt werden. Intervall 0 deaktiviert auch den automatischen Erstabruf. |
| Manueller Abruf | `channels.epgRefresh`; Mehrfachbetätigungen teilen sich einen laufenden Abruf. Der Taster blockiert nicht als vollständiger EPG-Lauf die TV-Befehlswarteschlange. |
| Verlauf | Globale Status-, Fortschritts- und Fehlerdatenpunkte sowie eigene Fehler-/Quellinformationen je Sender. Teilantworten mit einem zusätzlichen Quellenfehler sind erkennbar. |
| Aktualität | Lokale Zeitberechnung an Sendungsgrenzen und spätestens jede Minute, auch wenn der TV im Standby ist. Fehlgeschlagene Abrufe können noch gültige gespeicherte Programme weiterverwenden. Nach 24 Stunden Cachealter werden Programme ausgeblendet. |
| Entfernung und Ersetzung | Bei einem anderen Senderdienst unter derselben Ordner-ID werden alte Antworten gesperrt. Bereits begonnene Datenbankschreibvorgänge werden vor Ersetzung/Entfernung abgewartet. Geschützte Altordner werden inaktiv und ihre verwalteten Programmfelder geleert. |
| Beenden | Timer werden entfernt, laufende XMLTV-Anfragen und Parser abgebrochen, verspätete Ergebnisse verworfen. Das Beenden wartet nicht auf eine nicht antwortende Gegenstelle. |

Radio, der universelle API-Objektbaum und der frühere Media-Objektbaum bleiben entfernt. Die bestehenden Bereinigungs- und TV-Steuerabläufe werden weiterhin geprüft. Automatische Aufnahmeaufträge und Aufnahmebestätigungen gehören noch nicht zu dieser Version.

## Quellen und Zuordnung

Der lokale Import verwendet `CreateIterator` auf `de.loewe.sl2.epg`. SID, TSID und ONID werden aus dem in Abschnitt 8.7.1 der [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) dokumentierten `chl0:00-…`-Format gelesen. Jede Antwortzeile muss zu diesem DVB-Triplet gehören. Der Import schaltet keine Sender um und verwendet keine Fernbedienungs-EPG-Taste.

Die Herstellerbeispiele belegen die Senderkennung, den Titel und den Beginn. Eine zusätzlich veröffentlichte Modellbeschreibung belegt Bezeichnungen für Endzeit, Ereigniskennung und Texte derselben Tabelle, jedoch nicht ihre Verfügbarkeit auf dem SL420. Deshalb kann eine eindeutige Ablehnung des erweiterten Schemas einmal auf das Grundschema zurückfallen. Authentifizierungsfehler, Netzfehler, falsche Dienstkennungen und widersprüchliche Seiten dürfen diesen Rückfall nicht auslösen. Fehlende TV-Endzeiten werden nicht erfunden.

XMLTV wird mit HTTP(S), optional Gzip, begrenzten Weiterleitungen und begrenzter Streaming-Verarbeitung eingelesen. Die Auswertung berücksichtigt numerische Zeitzonenversätze und die UTC-Vorgabe bei fehlender Zone gemäß der [XMLTV-DTD](https://github.com/XMLTV/xmltv/blob/master/xmltv.dtd). Fehlt `stop`, darf ein tatsächlich vorhandener späterer Sendungsbeginn des gleichen Kanals ein Ende liefern; `endEstimated=true` kennzeichnet diese Ableitung.

Der externe Guide wird höchstens einmal je vollständigem Abgleichlauf geladen. Explizite Zuordnungen verwenden den relativen Senderpfad oder den genauen Sendernamen und die vollständige XMLTV-ID. Ohne solche Zuordnung sind ausschließlich eindeutige Namensübereinstimmungen zulässig. HD-/SD- und regionale Namensbestandteile bleiben erhalten. Der Adapter übernimmt pro Sender einen zusammenhängenden Bestand aus einer Quelle; Ereignisfelder unterschiedlicher Quellen werden nicht zusammengefügt.

Das iptv-org-Projekt ist ein Generator. Eine funktionierende öffentliche Standardadresse für deutsche Programme wurde bei der Prüfung nicht gefunden. Die dokumentierte Docker-/Node-Einrichtung stellt deshalb einen eigenen Guide bereit. Ein Live-Abruf der jeweiligen externen Programmquelle wurde hier nicht ausgeführt.

## Relevante Fehlerfälle und Begrenzungen

Die Tests prüfen nicht nur lesbare Beispieltitel, sondern die zeitliche und technische Zuordnung:

- Exakte Sendungsgrenzen, Zeitzonenwechsel, unbekannte Endzeiten, abgelaufene und überlappende Ereignisse, gleiche Startzeiten und leere Antworten.
- Begrenzte Datensätze dürfen keine für die Mehrdeutigkeit erforderlichen Gegenbelege verlieren. Die Prüfung umfasst insbesondere spätere Uhrzeitwechsel im Cache nach einer gekürzten Antwort.
- Wiederholte oder veränderte TV-Seiten, Schemaänderungen, falsche DVB-Kennungen, begrenzter Schemarückfall, Netzwerkfehler, Abbruch und Fristablauf.
- XMLTV mit nicht sortierten Sender-/Programmeinträgen, mehrsprachigen Texten, Gzip, Weiterleitungen, fehlerhaftem UTF-8/XML, unzulässigen Entity-Deklarationen, Zeit- und Größenlimits.
- Cachewiederherstellung nur bei passendem Dienst, Senderliste und EPG-Konfiguration; Positionsänderungen desselben Dienstes erhalten den Bezug. Geänderte Quellen, Zuordnungen und abgelaufene Caches werden nicht stillschweigend wiederverwendet.
- TV-Teilantwort plus fehlerhafte XMLTV-Quelle, leere TV-Antwort plus fehlgeschlagener Ersatz und weiterhin gültiger Altbestand, nicht eindeutige Senderzuordnungen und Quellenfehler ohne falschen TV-Verbindungsstatus.
- Mehr als 64 Sender mit fortgesetztem Abgleich, ein geteilter Guide-Download, mehrfacher manueller Taster und Ausführung eines Fernbedienungsbefehls zwischen zwei EPG-Anfragen.
- Verspätete TV-Antworten und echte verzögerte Datenbankschreibvorgänge bei Senderersetzung/-löschung, auch nach Ablauf des aufrufenden Datenbankzeitlimits. Nach Beginn des Beendens werden keine neuen EPG-Veröffentlichungen gestartet; bereits an die Datenbank übergebene Schreibvorgänge lassen sich dadurch nicht zurückholen.

Der TV-Abruf bleibt auf vier Seiten mit je 64 Zeilen und 30 Sekunden je Sender begrenzt. Ein Bearbeitungsabschnitt hat höchstens 64 Sender und 90 Sekunden Abruffrist; danach wird bei Bedarf fortgesetzt. Abschließende Datenbankschreibvorgänge kommen hinzu. Die Programme werden auf höchstens 128 Ereignisse je Sender und höchstens 128 KiB je Einzelcache begrenzt. Das gemeinsame berechnete JSON-Budget der normalisierten Sendercaches beträgt 16 MiB; es ist kein Limit für den gesamten Node.js-Prozess. Die gesonderten XMLTV-Grenzen stehen in der [historischen Importanleitung](https://github.com/SvenM74/ioBroker.loewe-tv/blob/99b074b58a5e365ce2f75760e976b8247a58f129/docs/XMLTV.md#betriebsgrenzen-des-imports).

Wenn ein notwendiger Mehrdeutigkeitsbeleg nicht sicher innerhalb der Grenzen erhalten werden kann, wird ein Fehler gemeldet. Der vorhandene Cache kann dann nach den normalen Aktualitätsregeln weiterverwendet werden. Ein vollständig gelesener leerer Plan darf dagegen als leer veröffentlicht werden, sofern nicht ein zusätzlicher Quellenfehler die Übernahme verhindert.

## Automatisierte Prüfung

Der vollständige Lauf unter **Node.js 24.19.0** wird in [TESTERGEBNIS_0.1.7.tap](TESTERGEBNIS_0.1.7.tap) mit Einzeltestnamen und Ergebniszählern festgehalten. Das Protokoll enthält Tests der neuen EPG-Module und ihrer Einbindung in die tatsächliche Adapter-Laufzeit sowie die bestehenden Sender-, Admin-, SOAP-, Transport-, Einschalt- und Abschaltregressionen.

| Prüfung | Ergebnis |
|---|---|
| Vollständiger Testlauf | **404 Tests bestanden**, 0 fehlgeschlagen, 0 abgebrochen, 0 übersprungen; Laufzeit 4,16 Sekunden. |
| Paketprüfung | `node scripts/check-package.js` erfolgreich; JavaScript-Syntax, Metadaten, Admin-Konfiguration und Protokollbelege geprüft. |
| Statische Objektdefinitionen | 107, auch bei einer alten `enableAdvanced`-Einstellung. |
| EPG je materialisiertem TV-Sender | 23 Zustände und 3 Ordner einschließlich des EPG-Hauptordners. |
| Fernbedienung und SOAP-Vertrag | 42 Taster, 34 originale XML-Vorlagen, 33 interne Aktionen; zusätzliche bekannte Tastenbelege bleiben geprüft. |
| Metadaten und Admin | Version/Build, native Standardwerte, Tabellenfelder, Übersetzungen und Validierung der EPG-Einstellungen werden geprüft. |

Reproduktion im Projektverzeichnis:

```bash
npm install
npm test
npm run check
npm pack
```

Die GitHub-Actions-Konfiguration führt dieselben Paketprüfungen und Tests unter Node.js 22 und 24 aus. Das Installationsarchiv heißt **`iobroker.loewe-tv-0.1.7.tgz`**. Die Updateanleitung steht in der [historischen README](https://github.com/SvenM74/ioBroker.loewe-tv/blob/99b074b58a5e365ce2f75760e976b8247a58f129/README.md).

Die Tests verwenden simulierte Geräteantworten, eine kontrollierte Uhr, simulierte ioBroker-Datenbanken und lokale HTTP-/UDP-Verbindungen. Sie ersetzen keinen Start in der ioBroker-Installation des Nutzers und keinen Test am realen TV. Die nächsten Prüfschritte am Gerät sind: Build-Kennung kontrollieren, EPG-Abgleich bei eingeschaltetem Fernseher auslösen und die aktuelle/nächste Sendung sowie Quelle und Status an zwei bekannten Sendern vergleichen. Falls der lokale Abruf keine ausreichenden Daten liefert, kann der dokumentierte XMLTV-Guide konfiguriert werden.
