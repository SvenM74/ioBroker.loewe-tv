# Prüfbericht: Loewe-TV-Adapter 0.1.6 mit konfigurierbarer Senderliste

Stand: **18. Oktober 2026**, überarbeitete Fassung derselben Paketversion. Build: **`0.1.6-channel-list-config.1`**.

## Anlass und gültiger Funktionsumfang

Der Nutzer benötigt eine Auswahl der verfügbaren Senderlisten in der Adapter-Konfiguration. Ausschließlich die ausgewählte Liste soll unter `channels.tv` erscheinen. Zudem meldet er weiterhin Radioobjekte und verlangt die Entfernung des gesamten `media`-Bereichs. **Die Paketversion bleibt ausdrücklich 0.1.6.** Der aktuelle Stand wird als **`iobroker.loewe-tv-0.1.6-channel-lists.tgz`** bereitgestellt und über **`info.adapterBuild=0.1.6-channel-list-config.1`** identifizierbar.

Die vorangegangene öffentliche Fassung enthielt bereits keine Radio-Objektdefinitionen mehr. Ohne die installierten Dateien und das Startprotokoll des Nutzers ist nicht belegt, ob bei ihm ein älteres Paket ausgeführt wurde, eine Bereinigung scheiterte oder vorhandene Objekte weiterhin angezeigt wurden. Diese Überarbeitung prüft deshalb zusätzlich vorhandene und verwaiste Altobjekte, gespeicherte Radioeinträge und wirkungslose Schreibbefehle. Die Build-Kennung im Startprotokoll und als Datenpunkt macht gleichnamige Paketversionen unterscheidbar.

| Bereich | Belegter beziehungsweise aktueller Stand |
|---|---|
| TV-Sender | Die Auswahl mit Sendernamen als Ordner-IDs funktioniert nach dem kurzen Gerätetest des Nutzers. Dieser Aufbau bleibt erhalten. |
| Radio | Die Versuche mit 0.1.5 und dem ersten 0.1.6-Stand haben den Fehler am Gerät nicht behoben. Die Funktion ist zurückgestellt; der aktuelle Stand stellt keine Radio-Senderobjekte und keinen Radio-Auswahlablauf bereit. |
| Einschalten | Für den bisherigen Einschaltablauf liegt weiterhin keine Erfolgsmeldung vom Gerät vor. Die aktuelle Bereinigung ist keine Einschaltkorrektur. |
| EPG und Aufnahmen | Der EPG-Unterordner am TV-Sender bleibt als Platzhalter erhalten. Ein EPG-Import und automatische Aufnahmen sind weiterhin nicht umgesetzt. |

Die vorherigen Radio-Untersuchungen haben gezeigt, dass eine Audio-Detailantwort und `ZapToMedia.Result=0` allein noch keinen hörbaren Senderwechsel nachweisen. Auch der ergänzte Moduswechsel hat laut aktueller Nutzerbeobachtung keinen funktionierenden Radioablauf ergeben. Diese Befunde bleiben als Grundlage für eine spätere Untersuchung erhalten; sie begründen keine aktive Radiounterstützung im jetzigen Adapter.

## Änderung innerhalb von 0.1.6

### Auswahl in ioBroker Admin

Der neue Reiter **Senderlisten** enthält **TV-Senderliste**, **Senderlisten neu laden** und das Senderlistenintervall. `native.channelListView` enthält ausschließlich die gespeicherte Listenkennung. Die neue Einstellung ist anfangs leer; der alte Datenpunkt `channels.view` wird nicht als Konfiguration übernommen. Ohne Auswahl bleiben TV-Sender inaktiv und `channels.refreshStatus` meldet `notConfigured`.

Die Optionsabfrage verwendet `GetListOfChannelLists` ab Startindex 0 und liest Folgeseiten anhand der tatsächlichen Anzahl gelieferter Einträge. Sie erhält Favoriten, leere Listen und unbekannte Listenpräfixe. Nur reine `avlist`-Eingangslisten werden aus der Senderauswahl entfernt. Wiederholte Kennungen werden zusammengeführt; gleichnamige unterschiedliche Listen sind zusätzlich durch ihre Kennung beschriftet. Widersprüchliche Einträge, veränderte Gesamtzahlen und wiederholte Seiten werden als unvollständiger Abruf abgewiesen. Fehlt eine Gesamtzahl, ist eine abschließende leere Seite erforderlich. Keine beliebige erste Liste wird automatisch gespeichert.

Der Abruf ist auf 30 Sekunden, 20 Seiten, 2.000 Listenreferenzen und 256 KiB normalisierte Listendaten begrenzt. Das sind Grenzen für die Auswahl der Senderlisten; die unabhängigen Grenzen für die Sender innerhalb einer Liste bleiben bestehen. Bei einem Fehler wird keine unvollständige Liste als vollständig angeboten. Bereits gespeicherte beziehungsweise gerade im Formular ausgewählte Kennungen bleiben sichtbar, auch wenn der Fernseher sie nicht mehr meldet. Die Listenabfrage verändert weder die native Auswahl noch die aktiven Senderobjekte. Gleichzeitige Abfragen teilen sich einen laufenden Abruf; zwischen Seiten kann die normale Befehlswarteschlange weitere Aufträge bearbeiten.

Das Formular arbeitet mit der laufenden Adapterinstanz und deren gespeichertem Fernseher. Ungespeicherte Änderungen an Adresse oder Port führen zu einem Hinweis, zuerst zu speichern. Die Vorlage erzeugt ihre Nachricht mit `JSON.stringify`, sodass Sonderzeichen im aktuellen Formularwert als Daten übertragen werden. Der Reload-Wert ist nur ein temporärer Formularwert mit `doNotSave`; er schreibt keine neue native Senderwahl.

Die Umsetzung ist anhand von [Admin 7.0.23 `ConfigSelectSendTo`](https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigSelectSendTo.tsx) und [`ConfigSendto`](https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigSendto.tsx) geprüft. `selectSendTo` erwartet auch im Fehlerfall ein Array aus `value` und `label`. Deshalb werden Fehler als sichtbare Optionen zurückgegeben; ein bloßes Fehlerobjekt würde in dieser Mindestversion nicht funktionieren. `main.js` antwortet höchstens einmal und besitzt einen zusätzlichen 35-Sekunden-Wächter. `common.messagebox=true` aktiviert die nötige Nachrichtenannahme, entsprechend der [Controller-Funktion `isMessageboxSupported`](https://github.com/ioBroker/ioBroker.js-controller/blob/v6.0.11/packages/adapter/src/lib/adapter/utils.ts).

### TV-Senderbestand

Alle Senderabfragen verwenden fest den Filter **`video`** und ausschließlich die in `channelListView` konfigurierte Liste. `channels.view` ist nur lesbar und zeigt diese Kennung an. Alte oder neue Schreibbefehle an diesen früheren Parameter können die Auswahl nicht ändern. Der automatische Komplettabruf und die manuelle Einzelseitenabfrage prüfen die zurückgemeldete Listenkennung; eine andere oder fehlende Kennung wird nicht dem konfigurierten Bestand zugeschrieben.

Der Senderkatalog, seine Wiederherstellung und die Objektanlage übernehmen ausschließlich passende TV-Einträge. Das gilt für gespeicherte Kataloge, native Metadaten bestehender Senderordner, alte Rohantworten und neue TV-Antworten. Beim Wechsel der Konfiguration werden normale verwaltete Ordner früherer Listen auch ohne erreichbaren TV entfernt. Ohne Auswahl wird kein alter TV-Bestand aktiviert. Eigene Unterobjekte und geschützte TV-Ordner bleiben nach den bestehenden Schutzregeln als deaktivierte Reste erhalten, mit `available=false`, schreibgeschütztem Auswahltaster und ohne registriertes Steuerziel. Das Protokoll nennt den betroffenen Ordner.

Liefert der Fernseher trotz des angeforderten Filters eine gemischte Antwort, werden daraus keine Radio-Senderobjekte erzeugt. Auch `channels.entries` wird auf TV-Einträge gefiltert. Einen auswählbaren Medienart-Filter gibt es nicht mehr.

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
| `loewe-tv.0.media` | Gesamter bisheriger Media-Unterbaum einschließlich `text`, `backspace` und freiem `locator`. |
| `loewe-tv.0.remote.radio_mode_on` | Der einzelne Radiomodus-Taster. |
| `loewe-tv.0.channels.mediaType` | Der bisherige Medienart-Wahlschalter. |

Die Freischaltoption für die API-Datenpunkte entfällt. Alte gespeicherte Radioeinträge werden bei der Wiederherstellung nicht erneut als Senderobjekte angelegt; eine alte Radio-Auswahldiagnose wird neutralisiert. Eine vorhandene TV-Auswahldiagnose bleibt erhalten. Schreibbefehle an entfernte Datenpunkte lösen keine Adapterfunktion mehr aus.

Die Bereinigung arbeitet mit relativen IDs innerhalb der eigenen Adapterinstanz. Die drei rekursiven Löschvorgänge haben jeweils ein Zeitlimit von 15 Sekunden, einzelne Datenbankzugriffe weiterhin 2 Sekunden. Eine anschließende Objektabfrage kontrolliert die entfernten Pfade. Das ist nötig, weil die rekursive Controller-Löschung bestimmte Lesefehler nicht weiterreicht und mit `common.dontDelete` geschützte Objekte überspringt; dies ist in der [Controller-Implementierung von v6.0.11](https://github.com/ioBroker/ioBroker.js-controller/blob/v6.0.11/packages/adapter/src/lib/adapter/adapter.ts) nachlesbar. Gemeldete Restobjekte, weitergereichte Datenbankfehler oder ein überschrittenes Zeitlimit brechen den Start mit einer Bereinigungsfehlermeldung ab, bevor der TV-Client gestartet oder der Senderkatalog wiederhergestellt wird. Ein Beenden des Adapters wartet nicht auf einen ausstehenden Löschvorgang; nach seiner Rückkehr werden keine weiteren Bereinigungsschritte gestartet.

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

Die vollständigen Paket- und Installationsbefehle stehen in der [README](../README.md#update-auf-016). Der offizielle [Installationsablauf in Controller 6.0.11](https://github.com/ioBroker/ioBroker.js-controller/blob/v6.0.11/packages/cli/src/lib/setup/setupInstall.ts) lädt bei `iobroker url` die Adapterdateien einschließlich Admin erneut hoch und ruft die [Aktualisierung vorhandener Instanzobjekte](https://github.com/ioBroker/ioBroker.js-controller/blob/v6.0.11/packages/cli/src/lib/setup/setupUpload.ts) auf. Dadurch werden auch die Nachrichtenunterstützung und das neue native Feld übernommen. Für den anschließenden Test:

1. Im Startprotokoll und in `info.adapterBuild` den Wert **`0.1.6-channel-list-config.1`** prüfen. Bei fehlendem Datenpunkt Installation und einen möglichen Bereinigungsfehler beim Start prüfen.
2. In der Objektansicht prüfen, ob Radio, API und Media einschließlich der Unterobjekte entfernt wurden.
3. Den Fernseher einschalten, die Konfiguration erneut öffnen und im Reiter **Senderlisten** die gewünschte **TV-Senderliste** auswählen. Speichern.
4. Bei Bedarf `channels.refresh=true` mit `ack:false` auslösen und auf `channels.catalogStatus=ready` warten. Die Ordner unter `channels.tv` müssen zur gewählten Liste gehören.
5. Einen bekannten TV-Sender über seinen `select`-Taster anwählen, beispielsweise `channels.tv.Das_Erste_HD.select`. Bei einer Abweichung `channels.lastSelection` und `info.lastError` lesen.

Ein weiterer Radiotest gehört nicht zum Abnahmeschritt dieser Fassung.

## Automatisierte Prüfung und Reproduktion

Der Prüfumfang dieser Überarbeitung betrifft die vollständige Liste der Auswahloptionen, Admin-Nachrichten und Rückmeldungen, unveränderte Auswahl bei Abfragefehlern, die verbindliche konfigurierte Liste, deren Wiederherstellung und Synchronisierung sowie die Entfernung der Radio-/API-/Media-Objektbäume. Zusätzlich werden die bestehenden TV-Auswahl-, Parser-, Transport-, Wake-on-LAN- und Abschaltregressionen geprüft. Testergebnisse der früheren 0.1.6-Fassungen sind kein Nachweis für diesen Stand.

Der vollständige aktuelle Lauf unter **Node.js 24.19.0** ist im [TAP-Protokoll dieser Überarbeitung](TESTERGEBNIS_0.1.6.tap) enthalten:

| Prüfung | Ergebnis |
|---|---:|
| Automatisierte Tests | **258 bestanden**, 0 fehlgeschlagen, 0 übersprungen, 0 abgebrochen |
| Statische Objektdefinitionen | **102** sowohl mit normaler Konfiguration als auch mit altem `enableAdvanced: true` |
| Verbleibende Fernbedienungstaster | **42**, einschließlich `power_on` und `tv_mode_on` |
| SOAP-Vertrag | **34** Originalvorlagen und **33** interne Aktionen geprüft |
| Paketmetadaten, Admin-Übersetzungen und JavaScript-Syntax | Fehlerfrei |
| `git diff --check` | Fehlerfrei |

Die Tests verwenden unter anderem eine gemischte Liste mit 501 Einträgen über zwei Seiten: Die Rohpositionen **0, 500, 0, 500** bleiben bei den beiden vollständigen Durchläufen korrekt, während nur die 251 TV-Dienste in den aktiven Katalog gelangen. Neue Fälle prüfen die mehrseitige Ermittlung der Listenauswahl, unbekannte Gesamtzahlen, doppelte Namen, geänderte oder wiederholte Seiten, Fristablauf und Abbruch, gleichzeitige Admin-Anfragen und die unveränderte Auswahl bei Fehlern. Weitere Fälle prüfen die Entfernung fremder Listenbestände ohne TV-Verbindung, ausbleibende Wiederherstellung aus fremden Katalogen und Rohantworten, wirkungslose Zugriffe auf `channels.view`, Radio und Media sowie verwaiste Altobjekte. Die Nachrichtenbrücke ist mit einmaligen Antworten und verspäteten Ergebnissen geprüft.

Zur Reproduktion im Projektverzeichnis:

```bash
npm test
npm run check
npm pack
mv iobroker.loewe-tv-0.1.6.tgz iobroker.loewe-tv-0.1.6-channel-lists.tgz
```

Automatisierte Tests verwenden kontrollierte Geräteantworten und lokale Verbindungen. Sie ersetzen weder einen tatsächlichen ioBroker-Start noch den Prüfungsschritt an den bestehenden Objekten und am Fernseher des Nutzers. Die hier ausgewiesenen Ergebnisse betreffen den aktuellen Code; für diese Überarbeitung liegt noch keine Rückmeldung vom realen Gerät vor.

## Erhaltene Protokollgrundlagen und nächste Schritte

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) beschreibt den TV-Filter bei `GetChannelList` in Abschnitt 9.7.1 und die Senderwahl mit `ZapToMedia`, `Player=0`, in Abschnitt 9.9.1. Der erhaltene TV-Modustaster entspricht `TV_MODE_ON=72` aus Abschnitt 9.4.1.1.

Die extrahierten [Originalvorlagen](protocol-templates.json) und [Vorlagen aus Löwenbändiger Remote 1.15](remote115-protocol.json) bleiben Entwicklungsunterlagen. Die historischen Prüfberichte zu 0.1.1 bis 0.1.5 werden nicht verändert. Für die nächsten Funktionen stehen TV-EPG und spätere Aufnahmeaufträge im Vordergrund. Radio kann nach einem gesondert bestätigten Steuerweg wieder aufgenommen werden; die [Roadmap](ROADMAP.md) beschreibt diese Reihenfolge.
