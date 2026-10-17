# Prüfbericht: Loewe-TV-Adapter 0.1.6 – TV-Sender und bereinigte Datenpunkte

Stand: **17. Oktober 2026**, überarbeitete Fassung derselben Paketversion.

## Anlass und gültiger Funktionsumfang

Der Nutzer hat bestätigt, dass auch der erste Radio-Versuch in **0.1.6** am **Loewe bild 7.55, Chassis SL420, Firmware V5.4.6.0** nicht funktioniert. Auf seinen Wunsch wird die Radiounterstützung vorerst entfernt. Auch der gesamte bisherige API-Datenpunktbaum wird entfernt. **Die Paketversion bleibt ausdrücklich 0.1.6.** Der aktuelle Stand wird zur Unterscheidung als **`iobroker.loewe-tv-0.1.6-tv-only.tgz`** bereitgestellt.

| Bereich | Belegter beziehungsweise aktueller Stand |
|---|---|
| TV-Sender | Die Auswahl mit Sendernamen als Ordner-IDs funktioniert nach dem kurzen Gerätetest des Nutzers. Dieser Aufbau bleibt erhalten. |
| Radio | Die Versuche mit 0.1.5 und dem ersten 0.1.6-Stand haben den Fehler am Gerät nicht behoben. Die Funktion ist zurückgestellt; der aktuelle Stand stellt keine Radio-Senderobjekte und keinen Radio-Auswahlablauf bereit. |
| Einschalten | Für den bisherigen Einschaltablauf liegt weiterhin keine Erfolgsmeldung vom Gerät vor. Die aktuelle Bereinigung ist keine Einschaltkorrektur. |
| EPG und Aufnahmen | Der EPG-Unterordner am TV-Sender bleibt als Platzhalter erhalten. Ein EPG-Import und automatische Aufnahmen sind weiterhin nicht umgesetzt. |

Die vorherigen Radio-Untersuchungen haben gezeigt, dass eine Audio-Detailantwort und `ZapToMedia.Result=0` allein noch keinen hörbaren Senderwechsel nachweisen. Auch der ergänzte Moduswechsel hat laut aktueller Nutzerbeobachtung keinen funktionierenden Radioablauf ergeben. Diese Befunde bleiben als Grundlage für eine spätere Untersuchung erhalten; sie begründen keine aktive Radiounterstützung im jetzigen Adapter.

## Änderung innerhalb von 0.1.6

### TV-Senderbestand

Alle Senderabfragen verwenden fest den Filter **`video`**. Einen auswählbaren Medienart-Filter gibt es nicht mehr. Der Senderkatalog, seine Wiederherstellung und die Objektanlage übernehmen ausschließlich TV-Einträge. Liefert der Fernseher trotz des angeforderten Filters eine gemischte Antwort, werden daraus keine Radio-Senderobjekte erzeugt. Auch `channels.entries` wird auf TV-Einträge gefiltert.

Die bestehende TV-Struktur bleibt erhalten:

| Eigenschaft | Verhalten |
|---|---|
| Ordnerpfad | `channels.tv.<Sender-ID>`, beispielsweise `channels.tv.Das_Erste_HD`. |
| Ordner-ID | Aus dem Sendernamen gebildet; bei unverändertem Namen bleibt sie beim Umsortieren gleich. |
| Anzeigename | Bevorzugter Programmplatz als Text in `common.name`. |
| Beschreibung | Vollständiger Sendername in `common.desc`. |
| Mehrfachbelegung | Ein Ordner je Dienst; alle Positionen bleiben in den Positionsdaten erhalten. Die kleinste gültige Position wird bevorzugt. |
| Auswahl | `select` verwendet den gelieferten TV-Locator der bevorzugten Position. |
| EPG | `epg.status=notImplemented` direkt am TV-Sender. |

Der automatische und manuelle Senderabgleich bleibt verfügbar. Unvollständige Antworten, Fehler und Standby dürfen beim normalen TV-Abgleich keine fehlenden TV-Sender entfernen. Die bisherigen Schutzregeln für eigene Unterobjekte gelten weiterhin bei diesem TV-Abgleich.

### Veraltete Objekte beim Start entfernen

Vor der Wiederherstellung des TV-Katalogs bereinigt die aktualisierte Fassung folgende alten Datenpunkte der jeweiligen Instanz:

| Entfernter Bereich | Umfang |
|---|---|
| `loewe-tv.0.channels.radio` | Gesamter Radio-Unterbaum einschließlich der Senderdaten, Auswahltaster und EPG-Platzhalter. |
| `loewe-tv.0.api` | Gesamter bisheriger API-Unterbaum einschließlich Parameter, Sendetaster, Antworten und Fehlerdatenpunkte. |
| `loewe-tv.0.remote.radio_mode_on` | Der einzelne Radiomodus-Taster. |
| `loewe-tv.0.channels.mediaType` | Der bisherige Medienart-Wahlschalter. |

Die Freischaltoption für die API-Datenpunkte entfällt. Alte gespeicherte Radioeinträge werden bei der Wiederherstellung nicht erneut als Senderobjekte angelegt; eine alte Radio-Auswahldiagnose wird neutralisiert. Eine vorhandene TV-Auswahldiagnose bleibt erhalten. Schreibbefehle an entfernte Datenpunkte lösen keine Adapterfunktion mehr aus.

Die Bereinigung arbeitet mit relativen IDs innerhalb der eigenen Adapterinstanz. Die beiden rekursiven Löschvorgänge haben jeweils ein Zeitlimit von 15 Sekunden, einzelne Datenbankzugriffe weiterhin 2 Sekunden. Eine anschließende Objektabfrage kontrolliert die entfernten Pfade. Das ist nötig, weil die rekursive Controller-Löschung bestimmte Lesefehler nicht weiterreicht und mit `common.dontDelete` geschützte Objekte überspringt; dies ist in der [Controller-Implementierung von v6.0.11](https://github.com/ioBroker/ioBroker.js-controller/blob/v6.0.11/packages/adapter/src/lib/adapter/adapter.ts) nachlesbar. Gemeldete Restobjekte, weitergereichte Datenbankfehler oder ein überschrittenes Zeitlimit brechen den Start mit einer Bereinigungsfehlermeldung ab, bevor der TV-Client gestartet oder der Senderkatalog wiederhergestellt wird. Ein Beenden des Adapters wartet nicht auf einen ausstehenden Löschvorgang; nach seiner Rückkehr werden keine weiteren Bereinigungsschritte gestartet.

Die Nachkontrolle verwendet die explizite Liste der eigenen Instanz über `getObjectListAsync`, nicht das Fehler unterdrückende `getAdapterObjectsAsync`. Ihre Grenze liegt beim Controller: Dessen [Redis-Objektimplementierung in v6.0.11](https://github.com/ioBroker/ioBroker.js-controller/blob/v6.0.11/packages/db-objects-redis/src/lib/objects/objectsInRedisClient.ts) kann einen internen `mget`-Fehler ebenfalls als leere Liste zurückgeben. Deshalb wird keine vollständige Erkennung sämtlicher intern verschluckter Datenbankfehler behauptet. Vorhandener Löschschutz wird nicht umgangen.

**`remote.tv_mode_on` bleibt verfügbar.** Der interne SOAP-Transport bleibt ebenfalls Bestandteil des Adapters, weil Fernbedienung, Statusabfragen und TV-Senderwahl ihn benötigen. Die Entfernung des API-Objektbaums betrifft die bisherige universelle Bedienoberfläche für frei parametrierte Aktionen.

Rohantworten wie `channels.items`, `status.playback` oder `info.lastResponse` können weiterhin Daten wiedergeben, die der Fernseher tatsächlich geliefert hat, darunter Audioeinträge oder einen extern am TV gewählten Radiomodus. Daraus entstehen keine Radio-Steuerdatenpunkte. Vom TV gemeldete Seitenzähler beschreiben die empfangene Antwort und müssen nicht der Anzahl der TV-Senderordner entsprechen.

Bei gemischten Antworten bleiben die ursprünglichen Seitenbereiche erhalten. Der gespeicherte Katalog enthält nur TV-Referenzen und die für den Seitenabgleich benötigten Zähler und Quellpositionen; herausgefilterte Radiosender werden nicht gespeichert. Dadurch springt die nächste Abfrage trotz ausgefilterter Audioeinträge an die richtige Position. Eine ausschließlich als Radio deklarierte Antwort oder eine nur aus Audioeinträgen bestehende Antwort darf keinen bisherigen TV-Bestand löschen. Eine gültige leere TV-Liste bleibt dagegen ein zulässiger vollständiger Abgleich.

## Diagnose der TV-Auswahl

`channels.lastSelection` enthält die zuletzt gestartete **TV-Senderauswahl**. Eine Auswahl schreibt zunächst einen laufenden und anschließend einen abgeschlossenen Bericht.

| Feld | Bedeutung |
|---|---|
| `requested` | Senderpfad, Name, Position, Medienart `video`, Dienstkennung und Listenkennung des Auftrags. |
| `listLocator`, `resolvedLocator`, `locatorSource` | Für die TV-Auswahl verwendeter Listen-Locator und dessen Quelle `GetChannelList`. |
| `status` | `running` während der Verarbeitung, `accepted` bei `Result=0`, `unconfirmed` ohne auswertbares Ergebnis, `error` bei einem Fehler. |
| `phase` | Erreichter Schritt: Validierung, Senderauftrag oder Abschluss. |
| `result` | Numerisches Ergebnis von `ZapToMedia`, soweit geliefert. |
| `zapResponse`, `error` | Größenbegrenzt gespeicherte Geräteantwort und gegebenenfalls Fehler. |
| `stationConfirmed`, `verification` | Für diesen direkten TV-Ablauf `false` beziehungsweise `notChecked`; es wird keine automatische Senderbestätigung behauptet. |
| `startedAt`, `finishedAt` | Beginn und Ende des Versuchs als Unixzeit in Millisekunden. |

Ein ausdrücklich von null abweichendes `ZapToMediaResponse.Result` wird als Fehler gemeldet. `accepted` bestätigt die TV-Antwort auf den Auftrag, noch nicht den sichtbaren Programminhalt. Dasselbe gilt für das Zurücksetzen des `select`-Tasters. Bleibt `startedAt` nach einem Tastendruck unverändert, kann der Auftrag bereits vor seinem Start abgewiesen worden sein; dann ist zusätzlich `info.lastError` relevant.

## Aktualisierung einer vorhandenen 0.1.6

**Ein Neustart allein reicht nicht aus:** Die geänderten Dateien müssen zunächst aus dem aktuellen GitHub-Stand oder dem neuen Archiv installiert werden. Dass ioBroker bereits die Versionsnummer 0.1.6 anzeigt, unterscheidet den früheren Radio-Versuch nicht von dieser überarbeiteten Fassung.

Die vollständigen Paket- und Installationsbefehle stehen in der [README](../README.md#update-auf-016). Nach der erneuten Installation und dem Start der vorhandenen Instanz wird die alte Radio-/API-Struktur bereinigt und der TV-Katalog wiederhergestellt. Für den anschließenden Test:

1. In der Objektansicht prüfen, ob die in der Bereinigungstabelle genannten Bereiche entfernt wurden. Bestehende TV-Senderordner und ihre EPG-Platzhalter sollen erhalten sein.
2. Bei eingeschaltetem Fernseher `channels.refresh=true` mit `ack:false` auslösen und auf `channels.catalogStatus=ready` warten.
3. Einen bekannten TV-Sender über seinen `select`-Taster anwählen, beispielsweise `channels.tv.Das_Erste_HD.select`. Bei einer Abweichung `channels.lastSelection` und `info.lastError` lesen.

Ein weiterer Radiotest gehört nicht zum Abnahmeschritt dieser Fassung.

## Automatisierte Prüfung und Reproduktion

Der Prüfumfang für diese Überarbeitung betrifft den festen TV-Filter, die Behandlung gemischter Antworten, die Wiederherstellung gespeicherter Kataloge, die Entfernung des Radio-/API-Objektbaums und den erhaltenen TV-Auswahlpfad. Zusätzlich müssen die verbleibenden Objektdefinitionen, die Konfiguration und das Installationspaket zum unveränderten Versionsstand 0.1.6 passen. Testergebnisse des früheren Radio-Versuchs sind kein Nachweis für die jetzige Bereinigung.

Der vollständige aktuelle Lauf unter **Node.js 24.19.0** ist im [TAP-Protokoll dieser Überarbeitung](TESTERGEBNIS_0.1.6.tap) enthalten:

| Prüfung | Ergebnis |
|---|---:|
| Automatisierte Tests | **223 bestanden**, 0 fehlgeschlagen, 0 übersprungen, 0 abgebrochen |
| Statische Objektdefinitionen | **105** sowohl mit normaler Konfiguration als auch mit altem `enableAdvanced: true` |
| Verbleibende Fernbedienungstaster | **42**, einschließlich `power_on` und `tv_mode_on` |
| SOAP-Vertrag | **34** Originalvorlagen und **33** interne Aktionen geprüft |
| Paketmetadaten, Admin-Übersetzungen und JavaScript-Syntax | Fehlerfrei |
| `git diff --check` | Fehlerfrei |

Die Tests verwenden auch eine gemischte Liste mit 501 Einträgen über zwei Seiten: Die Rohpositionen **0, 500, 0, 500** bleiben bei den beiden vollständigen Durchläufen korrekt, während nur die 251 TV-Dienste in den aktiven Katalog gelangen. Weitere Fälle prüfen alte Radio-Caches, wirkungslose veraltete Schreibbefehle, den erhaltenen direkten TV-Umschaltauftrag sowie Fehler und Beenden während der Bereinigung und ihrer Nachkontrolle.

Zur Reproduktion im Projektverzeichnis:

```bash
npm test
npm run check
npm pack
mv iobroker.loewe-tv-0.1.6.tgz iobroker.loewe-tv-0.1.6-tv-only.tgz
```

Automatisierte Tests verwenden kontrollierte Geräteantworten und lokale Verbindungen. Sie ersetzen weder einen tatsächlichen ioBroker-Start noch den Prüfungsschritt an den bestehenden Objekten und am Fernseher des Nutzers. Die hier ausgewiesenen Ergebnisse betreffen den aktuellen Code; für diese Überarbeitung liegt noch keine Rückmeldung vom realen Gerät vor.

## Erhaltene Protokollgrundlagen und nächste Schritte

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) beschreibt den TV-Filter bei `GetChannelList` in Abschnitt 9.7.1 und die Senderwahl mit `ZapToMedia`, `Player=0`, in Abschnitt 9.9.1. Der erhaltene TV-Modustaster entspricht `TV_MODE_ON=72` aus Abschnitt 9.4.1.1.

Die extrahierten [Originalvorlagen](protocol-templates.json) und [Vorlagen aus Löwenbändiger Remote 1.15](remote115-protocol.json) bleiben Entwicklungsunterlagen. Die historischen Prüfberichte zu 0.1.1 bis 0.1.5 werden nicht verändert. Für die nächsten Funktionen stehen TV-EPG und spätere Aufnahmeaufträge im Vordergrund. Radio kann nach einem gesondert bestätigten Steuerweg wieder aufgenommen werden; die [Roadmap](ROADMAP.md) beschreibt diese Reihenfolge.
