# Roadmap: EPG auswerten und Aufnahmen mit ioBroker steuern

## Ziel und aktueller Stand

ioBroker soll Sendungen anhand frei definierbarer Regeln finden und dafür rechtzeitig Aufnahmetimer im Loewe-Fernseher anlegen. Eine Regel könnte beispielsweise eine bestimmte Sendereihe auf ausgewählten Sendern aufnehmen, mit fünf Minuten Vorlauf und zehn Minuten Nachlauf. Dieses Beispiel ist keine bereits eingerichtete Regel.

Die Regeln bleiben in ioBroker. Der Loewe-Adapter stellt Gerätedaten und Programminformationen bereit, verarbeitet strukturierte Aufnahmeaufträge und meldet den tatsächlich ermittelten Zustand zurück. Der Fernseher soll die vorab gespeicherten Timer ausführen. Das Verhalten bei Standby und die Aufzeichnung auf dem vorgesehenen Datenträger müssen am konkreten Gerät geprüft werden.

**Dieses Dokument beschreibt den geplanten Ausbau. Version 0.1.2 enthält noch keinen automatischen EPG-Import und keine fertige Aufnahmeautomatik.** Die vorhandenen universellen API-Datenpunkte erlauben bereits Einzelanfragen mit passenden Parametern. Die Bedienung steht in der [README](../README.md#zusätzliche-soap-befehle).

Das Nutzergerät ist seit der Rückmeldung vom **17.10.2026** bekannt: **Loewe bild 7.55, Chassis SL420, Software V5.4.6.0**. Die bisherigen Fernbedienungsdatenpunkte scheinen dort zu funktionieren; die Codes 15 und 78 öffnen dieselbe EPG-Anzeige. Senderabruf und Einschalten waren im bisher installierten Stand nicht erfolgreich. Die Korrekturen in 0.1.2 und die späteren Aufnahmefunktionen benötigen weiterhin einen Gerätetest.

## Welche Grundlagen vorhanden sind

| Baustein | Belegter Stand | Noch zu klären oder umzusetzen |
|---|---|---|
| Senderbestand | `GetListOfChannelLists` und `GetChannelList` mit Startindex und Seitengröße. 0.1.2 ergänzt automatische Listenauswahl, aufbereitete Antworten und getrennte Seitenindizes. Ohne Medienfilter werden TV und Radio angefragt. | Abruf am SL420 bestätigen und alle gewünschten Seiten sammeln; die aktuelle Implementierung hält jeweils eine Seite vor. Stabile Senderkennung und Locator zuordnen. |
| Lokales EPG | Kapitel 9.22 der Remote API 1.0.47 dokumentiert `CreateIterator` auf `de.loewe.sl2.epg`, einschließlich DVB-Senderzuordnung, Titel und Startzeit. `GetMediaEvent` bleibt ein gesonderter Zugriff über `mediaEventUuid`. | Begrenzten EPG-Import implementieren und die echten Antworten des SL420 prüfen. Verfügbarkeit, Umfang und Zuordnung am Gerät sind noch nicht bestätigt. |
| Externes EPG als Alternative | Die Original-App enthält einen gesonderten Gracenote-Abruf über `TVGRID_LOOKUP`, Senderzuordnung und Folgeabfragen. | Nur als zusätzliche Quelle betrachten; für den dokumentierten lokalen EPG-Weg ist Gracenote keine Voraussetzung. Aktueller Zugang und Senderabdeckung sind ungeklärt. |
| Aufnahme programmieren | `ProgramTimer` ist im App-Ablauf mit `PVR`, `default`, Sender-Locator, Start als Unixsekunden, Dauer in Sekunden und `repeatDays=0` nachgewiesen. | Verhalten des konkreten Aufnahmeziels bestätigen und einen vollständigen Einzeltimer am Gerät prüfen. |
| Timer abgleichen | `GetTimerList` und ein Antwortparser mit Timerkennungen und Zeitangaben sind vorhanden. | Antwort des Nutzergeräts auswerten und eine eindeutige Zuordnung zu Aufnahmeaufträgen herstellen. |
| Timer ändern oder löschen | Unter den bisher 33 extrahierten SOAP-Aktionen ist kein gesonderter Änderungs- oder Löschbefehl für Timer nachgewiesen. | Änderungen bereits gespeicherter Timer bleiben offen, bis ein geeigneter Weg belegt ist. |
| Aufnahmeergebnis | `GetDRPlusArchive` kann Archiveinträge abfragen. | Prüfen, ob eine tatsächlich abgeschlossene Aufnahme einem Auftrag zuverlässig zugeordnet werden kann. Ein Timerlisteneintrag allein bestätigt keine gelungene Aufnahme. |

Die lokalen Anfrageformen sind in [protocol-templates.json](protocol-templates.json) dokumentiert. Die Unterscheidung von Senderreferenz und Senderdetails ist auch in [remote115-protocol.json](remote115-protocol.json) sichtbar. Ein vorhandener Request beweist noch keine erfolgreiche Ausführung auf einem bestimmten TV-Modell.

### Lokales EPG über die dokumentierte Iterator-Schnittstelle

Mit der zusätzlich gefundenen **[Loewe Remote API 1.0.47, Kapitel 9.22](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf)** gibt es nun einen Herstellerbeleg für einen lokalen EPG-Abruf. Die bisherige offene Frage, ob nur einzelne bekannte Ereigniskennungen abgefragt werden können, ist damit auf Protokollebene beantwortet: `CreateIterator` kann die Tabelle **`de.loewe.sl2.epg`** abfragen. Die [lesbare Textfassung der Herstellerspezifikation](https://github.com/gadgetbazza/hass-loewetv-remoteapi/blob/main/supporting_files/remote_api_1.0.47_Loewe.txt) steht ebenfalls zur Verfügung.

Für einen ersten Import sind folgende Felder konkret belegt:

| Feldkennung | Dokumentierte Bedeutung |
|---|---|
| `2000` | DVB Service ID, kurz SID. |
| `2001` | DVB Transport Stream ID, kurz TSID. |
| `2002` | DVB Original Network ID, kurz ONID. |
| `2004` | Titel der Sendung. |
| `2007` | Beginn als UTC-Unixzeit in Sekunden. |

SID, TSID und ONID bilden gemeinsam den Bezug zum DVB-Sender. Ein Anzeigename allein reicht dafür nicht. Laut API wird ein mit `NotifyUpdate=NO` angelegter Iterator automatisch freigegeben; für den ersten Abruf ist daher kein dauerhaftes Aktualisierungsabonnement vorgesehen.

**Der EPG-Import ist in 0.1.2 noch nicht implementiert.** Zunächst wird eine begrenzte Anfrage am SL420 geprüft: Welche Datensätze kommen tatsächlich zurück, lassen sie sich den abgerufenen Sendern zuordnen und stimmen die Startzeiten? Danach werden Umfang, Aktualität sowie verlässlich gelieferte Endzeiten oder Dauern untersucht. Für Dauer und Beschreibung wird hier keine ungeprüfte Feldnummer angenommen. Ohne bestätigte Aufnahmedauer darf ein EPG-Treffer noch keinen automatischen Timer erzeugen.

Der lokale Zugriff wird damit der erste geplante EPG-Weg. Die weitere Verarbeitung bleibt so aufgebaut, dass eine separat eingerichtete externe Quelle später ergänzen kann.

### Aufnahmebefehle aus dem tatsächlichen App-Ablauf

Die statische Analyse der ursprünglichen **Loewe App 1.4.7**, Bibliothek `lib/x86_64/libLoeweApp.so`, zeigt einen Aufruf von `ProgramTimer` in `CGame::ButtonPressed` bei `0xfa598`. Dabei verwendet die App:

- `Device = PVR`;
- `RecordingType = default`;
- den Locator aus dem zugeordneten Senderobjekt;
- den Start als dezimal formatierte Unix-Epoch-Sekunden;
- die Dauer in Sekunden aus der Differenz von End- und Startwert;
- `repeatDays = 0`.

Die Requestvorlage liegt bei ELF-Dateioffset `0x34438a`. Diese Werte sind ein konkreter Ausgangspunkt für einen Gerätetest. Sie sind keine bestätigte Kompatibilitätszusage für alle Aufnahmeziele und TV-Modelle. Andere Aufnahmeziele, andere Aufnahmetypen und die Bedeutung weiterer Werte von `repeatDays` sind daraus nicht ableitbar.

Die Zeitbasis wurde über den Aufrufpfad nachvollzogen: `CGame::notifyProgramGuideFound` konvertiert Start und Ende bei `0xef609` und `0xef634` mit `CNSystem::GetTimeFromISO` in Epoch-Sekunden. `SetProgramInfoView` kopiert diese Werte bei `0xfe9af` und `0xfe9b4` unverändert in die vom Timeraufruf verwendeten Felder. `RequestProgramInfo` vergleicht sie außerdem mit `GetUTCTimeInSeconds`, das direkt `time(NULL)` verwendet. Vor dem Senden wird deshalb kein zusätzlicher lokaler Zeitzonenoffset aufgeschlagen. Der alte ISO-Parser wird nicht übernommen; neue Eingaben müssen ihr `Z` oder ihren Zeitzonenoffset korrekt berücksichtigen. Die tatsächliche Aufnahmezeit wird anschließend am Gerät geprüft.

`GetTimerList` verwendet die Vorlage bei `0x34469c`. Der App-Parser kennt `ResultTimerListFragment` mit `totalResults` sowie Einträge mit `EntryUuid`, `EntryTitle`, `Start`, `End`, `Attributes`, `SourceName`, `SourceUuid` und `SourceAncestorUuid`. Das konkrete Format der zurückgelieferten Zeitstrings und die Bedeutung von `Attributes` müssen anhand einer echten Antwort geprüft werden. Eine als unvollständig erkannte Timerantwort reicht nicht aus, um das Fehlen eines Timers festzustellen.

Der `ProgramTimer`-Callback in `CWidget::notifyProgramTimer` bei `0xe6370` liefert im untersuchten Ablauf keine neue Timerkennung. Deshalb soll die Bestätigung über eine nachfolgende Timerabfrage erfolgen.

Als davon unabhängigen externen EPG-Weg enthält die Original-App `CloeweEpg::GetProgramGuide` und die Anfragevorlagen bei `0x33e0d7` und `0x33e2f4`. Sie fragen einen externen Dienst mit eigener Anmeldung ab. `CGame::GetEpg` setzt beim Erstabruf ein Zeitfenster von insgesamt sieben Tagen. Aus diesen Befunden folgt keine Zusage zur heutigen Verfügbarkeit oder zur Abdeckung jedes Senders. Zugangsdaten aus der App werden nicht in das Projekt übernommen.

## So soll die Aufnahmeplanung arbeiten

1. **Sender zuordnen:** Eine stabile interne Senderkennung verbindet EPG-Quelle, TV-Sender und Umschalt-Locator. Namen dienen der Anzeige; gleichnamige HD-, SD- oder Regionalvarianten benötigen eindeutige Zuordnungen.
2. **Programmdaten laden:** Zuerst das lokale TV-EPG für ein begrenztes Zeitfenster einlesen und über die DVB-Kennungen zuordnen. Herkunft, Titel und Beginn sowie verifizierte Endzeiten oder Dauern und verfügbare Beschreibungen bereitstellen. Ereigniskennungen nur übernehmen, wenn tatsächlich geliefert. Aktualität, fehlende Felder und erkannte Unvollständigkeit müssen sichtbar sein.
3. **Regeln in ioBroker auswerten:** Titel, Sender, Zeitfenster und verfügbare Beschreibungen können Treffer erzeugen. Wiederholungs- oder Episodenfilter sind nur verlässlich, wenn die Quelle entsprechende Angaben liefert.
4. **Auftrag dauerhaft festhalten:** Jeder Auftrag bekommt eine stabile `requestId` und einen Bezug zur konkreten Ausstrahlung. Wiederholte Übermittlung derselben Kennung muss dasselbe Ergebnis liefern.
5. **Vorhandene Timer vergleichen:** Vor dem Schreiben eine aktuelle, ausreichend vollständig interpretierte Timerliste abgleichen. Mehrere Regeln für dieselbe Ausstrahlung sollen keinen zweiten Timer erzeugen.
6. **Timer rechtzeitig programmieren:** Start und Ende der Sendung mit Vor- und Nachlauf in das bestätigte TV-Format umrechnen. Anfragen pro Fernseher geordnet und mit Zeitlimit ausführen.
7. **Ergebnis zurücklesen:** Erst ein passender Eintrag in `GetTimerList` bestätigt, dass der Timer vorhanden ist. Den Ausgang einer unklar beantworteten Schreibanfrage zunächst erneut prüfen.

Intern werden eindeutige UTC-Zeitpunkte verwendet. Zeitzone und Herkunft der EPG-Daten bleiben erhalten. Für die Anzeige kann ioBroker lokale Uhrzeiten verwenden. Die Umrechnung in den TV-Auftrag erfolgt erst an der Protokollgrenze und muss auch über Sommer- und Winterzeit hinweg korrekt sein.

### Beispiel eines gewünschten Ergebnisses

Eine ioBroker-Regel erkennt eine passende Sendung von 20:15 bis 21:45 Uhr. Mit fünf Minuten Vorlauf und zehn Minuten Nachlauf wird ein Timer für 20:10 bis 21:55 Uhr geplant. Diese Zeiten sind ein Rechenbeispiel ohne konkretes Datum oder tatsächliche Senderbelegung.

Der Auftrag zeigt anschließend seinen Zustand, etwa `planned`, `awaitingDevice`, `submitting`, `unknown`, `confirmed`, `needsReview`, `failed` oder `missed`, jeweils mit einer Begründung. `confirmed` bedeutet dabei ausdrücklich: **Timer im Fernseher nachgewiesen.** Ein späterer Status für eine erfolgreiche Aufnahme benötigt einen eigenen Nachweis.

## Vorgeschlagene Datenpunkte

**Die folgenden Namen sind ein Entwurf und existieren in Version 0.1.2 noch nicht.** Die Auswahl soll die Steuerung durch andere ioBroker-Skripte ermöglichen, ohne dass diese SOAP-XML erzeugen müssen.

| Vorgeschlagener Datenpunkt | Zweck |
|---|---|
| `epg.<senderKey>.events` | Normalisierte Sendungen für ein begrenztes Zeitfenster dieses Senders. Große Listen müssen zusätzlich aufgeteilt werden. |
| `epg.<senderKey>.lastUpdate` | Zeitpunkt der letzten erfolgreichen Aktualisierung. |
| `epg.<senderKey>.status` | Herkunft, Zeitraum, Aktualität und erkannte Unvollständigkeit der Programmdaten. |
| `recording.enabled` | Aktiviert die spätere Verarbeitung von Aufnahmeaufträgen. Die erste Ausbaustufe beginnt mit einer Planungsvorschau. |
| `recording.request` | Ein vollständiger JSON-Auftrag mit `requestId`, Sendungsbezug, Senderbezug und Vor-/Nachlauf. Die Eingabe erfolgt zusammenhängend, um vermischte Teilparameter zu vermeiden. |
| `recording.jobs` | Begrenzte Übersicht der dauerhaft geführten Aufträge, mit Zustand, Begründung und gegebenenfalls TV-Timerkennung. |
| `recording.timers` | Zuletzt erfolgreich gelesene TV-Timerliste mit Abfragezeit und Kennzeichnung ihrer Vollständigkeit. |

Die EPG-Datenquelle soll austauschbar sein. Der dokumentierte lokale TV-Iterator ist jetzt der erste geplante Importweg; seine Abdeckung muss am Gerät geprüft werden. Eine separat eingerichtete EPG-Quelle kann später dieselbe interne Struktur beliefern. Die bestehenden Größenlimits für Datenpunkte gelten auch für EPG- und Auftragslisten; große Bestände werden in begrenzten Abschnitten verarbeitet.

## Verhalten bei Unterbrechungen und Programmänderungen

| Fall | Geplantes Verhalten |
|---|---|
| Ein `ProgramTimer`-Aufruf läuft in einen Timeout. | Als `unknown` behandeln und die Timerliste abgleichen. Der Fernseher könnte den Timer bereits gespeichert haben. Bei unklarer Zuordnung keine blinde Wiederholung. |
| ioBroker oder der Adapter startet neu. | Dauerhafte Aufträge und aktuelle TV-Timer erneut abgleichen. Bereits bestätigte oder noch unklare Vorgänge nicht pauschal neu senden. |
| Mehrere Regeln treffen dieselbe Ausstrahlung. | Gegen offene Aufträge und bestehende TV-Timer prüfen. Ein Titel allein reicht für die Identität einer Ausstrahlung nicht aus. |
| Das EPG verschiebt eine noch nicht programmierte Sendung. | Die Planung vor der Übertragung anpassen und Vor-/Nachlauf neu berechnen. |
| Das EPG ändert einen bereits programmierten Termin. | Die Abweichung als `needsReview` melden. Automatische Ersatzprogrammierung erst umsetzen, wenn Ändern oder Löschen vorhandener Timer nachgewiesen ist. |
| Ein zuvor bestätigter Timer wurde am TV entfernt. | Die Abweichung melden. Die ursprüngliche Regel soll einen bewusst entfernten Timer nicht automatisch wiederherstellen. |
| Der TV ist nicht erreichbar. | Auftrag bis zu einer definierten Frist offenhalten. Den begrenzten Netzwerkaufweckweg bei Bedarf nutzen und anschließend die Timer-Schnittstelle prüfen. Vor der Automatik klären, ob dafür interaktives Einschalten nötig oder unerwünscht ist. Nach Ablauf der Frist `missed` melden. |
| Timer überschneiden sich. | Verfügbare Geräteinformationen und TV-Rückmeldungen auswerten. Weder eine feste Tunerzahl noch uneingeschränkte Parallelaufnahmen annehmen. |
| Eintrag oder Zeitangabe ist mehrdeutig. | Die betroffene Zuordnung sichtbar offenlassen und keinen geratenen Aufnahmeauftrag daraus erzeugen. |

Netzwerkabfragen, EPG-Verarbeitung und Datenbankschreiben müssen begrenzt bleiben. Geänderte Einträge werden gezielt aktualisiert; wiederholte vollständige Importe dürfen weder endlose Warteschlangen noch einen blockierten ioBroker-Prozess verursachen. Eine Vorschau zeigt vor der Automatik, welche Sendungen die Regeln erfassen würden.

## Umsetzung in überprüfbaren Etappen

| Etappe | Ergebnis | Nachweis für den Abschluss |
|---|---|---|
| 1. Geräteantworten und Senderbestand | Vollständige gewünschte Senderlisten, eindeutige Locators und interpretierte Timerantworten. | Echte Antworten des Nutzergeräts, einschließlich Listenende und vorhandener manueller Timer. |
| 2. Aufnahmeweg für einen Einzeltimer | Ein zukünftiger Timer wird programmiert und im TV wiedergefunden. | Bestätigte Parameter und Zeiten, tatsächliche Aufnahme sowie Verhalten aus Standby am Gerät geprüft. |
| 3. Lokales EPG und Zuordnung | Ein begrenzter Import über `CreateIterator` liefert Programmdaten mit eindeutiger DVB-Senderzuordnung. | Echte SL420-Antworten, verfügbare Sender und Zeiträume, Startzeiten sowie notwendige Endzeiten oder Dauern geprüft. |
| 4. Regeln und Planungsvorschau | ioBroker-Regeln erzeugen nachvollziehbare Aufnahmepläne. | Duplikate, Neustarts, EPG-Verschiebungen und Zeitumstellung ohne Schreiben von TV-Timern durchgespielt. |
| 5. Aufnahmeautomatik | Geprüfte Pläne werden rechtzeitig übertragen und bestätigt. | Erfolgreicher vollständiger Ablauf einschließlich Fehler- und Wiederanlauffällen. |

Die Etappen 2 und 3 lassen sich unabhängig vorbereiten. Der einzelne Gerätetimer ist der erste praktische Nachweis, dass die Aufnahmefunktion des konkreten Fernsehers für die spätere Automatik geeignet ist. Dafür reichen zunächst bekannte Testzeiten; ein fertiger EPG-Import ist noch nicht erforderlich.

TV-Modell, Chassis und Firmware sind bereits bekannt. Für den nächsten Gerätetest fehlen noch das vorgesehene Aufnahmeziel, eine vorhandene manuell programmierte Aufnahme aus `GetTimerList` sowie echte Senderantworten mit Locator. Anschließend wird eine passende lokale EPG-Antwort benötigt. Damit lassen sich Zuordnung, Zeitangaben und ein konkreter Testauftrag mit nachvollziehbaren Werten prüfen.
