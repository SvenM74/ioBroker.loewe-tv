# Roadmap: EPG auswerten und Aufnahmen mit ioBroker steuern

## Ziel und aktueller Stand

ioBroker soll Sendungen anhand frei definierbarer Regeln finden und dafür rechtzeitig Aufnahmetimer im Loewe-Fernseher anlegen. Eine Regel könnte beispielsweise eine bestimmte Sendereihe auf ausgewählten Sendern aufnehmen, mit fünf Minuten Vorlauf und zehn Minuten Nachlauf. Dieses Beispiel ist keine bereits eingerichtete Regel.

Die Regeln sollen in ioBroker bleiben. Der Adapter soll Programminformationen bereitstellen, strukturierte Aufnahmeaufträge übertragen und den tatsächlich ermittelten Zustand zurückmelden. Der Fernseher soll vorab gespeicherte Timer ausführen. Das Verhalten bei Standby und die Aufzeichnung auf dem vorgesehenen Datenträger müssen am konkreten Gerät geprüft werden.

**Aktueller Paketstand: Version 0.1.10, Build `0.1.10-epg-guide.1`, mit Programmübersicht auf einer Zeitachse direkt in den EPG-Einstellungen und der vorhandenen TV-Netzwerksuche. Die laufende und nächste Sendung je TV-Sender werden weiterhin ausschließlich direkt vom Loewe abgerufen. Aufnahmeregeln und TV-Timer sind weiterhin geplant.** Der erste EPG-Import ist seit 0.1.7 implementiert. Die externe EPG-Quelle und die zugehörigen Einstellungen sind seit der Bereinigung von 0.1.8 entfernt; für EPG bleiben `epgEnabled` und `epgRefreshInterval`. Fehlende EPG-Standardwerte und veraltete XMLTV-Einstellungen blockieren das Speichern bestehender Instanzen nicht. Die gewünschte TV-Senderliste bleibt in der Adapter-Konfiguration ausgewählt. Radiounterstützung sowie API- und Media-Datenpunktbäume bleiben entfernt.

Am **18. Oktober 2026** hat der Nutzer den erfolgreichen direkten TV-EPG-Abruf mit dem damaligen 0.1.8-Stand auf **Loewe bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** bestätigt. **Für den neuen Build `0.1.10-epg-guide.1` und seine Programmübersicht liegt noch kein eigener Gerätetest vor.** Die aktuelle Bedienung steht in der [EPG-Anleitung](EPG.md), der [Netzwerksuche-Anleitung](NETWORK_DISCOVERY.md) und der [Bedienungsanleitung](INSTALLATION.md); den Umfang der Gerätebestätigung beschreibt [COMPATIBILITY.md](COMPATIBILITY.md). Der [Prüfbericht zu `0.1.8-tv-epg-only.1`](PRUEFBERICHT_0.1.8_TV_EPG.md) dokumentiert die vorherige TV-EPG-Überarbeitung.

Die detaillierten bisherigen Senderlisten- und TV-Auswahlbefunde beziehen sich auf den **Loewe bild 7.55, Chassis SL420, Software V5.4.6.0**. Der Nutzer hat die TV-Auswahl mit Namens-IDs nach einem kurzen Test bestätigt. Seine ergänzte [Gerätetabelle](../README.md#getestete-geräte) führt außerdem Fernbedienung, Senderlisten und TV-Auswahl für den bild 5.32 auf. Die ursprüngliche ASTRA-LCN-Antwort meldet 372 gemischte TV-/Radioeinträge einschließlich Mehrfachbelegungen. Der aktuelle Adapter fragt ausschließlich TV an und übernimmt nur `video` in den Katalog. Radio blieb auch mit dem ersten Moduswechsel-Versuch in 0.1.6 ohne Funktion und wird vorerst nicht weiterverfolgt. Die spätere Wiederaufnahme benötigt einen gesonderten, am Gerät bestätigten Steuerweg. Ein gezielter Nachweis für Umsortierung, sämtliche Migrationsfälle und die späteren Aufnahmefunktionen steht weiterhin aus.

**Das Einschalten per Adapter-Datenpunkt hat der Nutzer am 18. Oktober 2026 bei aktiviertem Schnellstart bestätigt.** Ohne Schnellstart werden nach seiner Beobachtung die Netzwerkfunktionen im Standby abgeschaltet; dann ist das Einschalten nur mit der normalen Fernbedienung möglich. Modell und Build hat er für diesen Test nicht genannt. Die [Kompatibilitätsdokumentation](COMPATIBILITY.md#einschalten-aus-dem-standby) hält diese Abgrenzung fest. Eine spätere Automatik muss neue Timer bei erreichbarem TV übertragen oder ihn mit aktiviertem Schnellstart rechtzeitig einschalten. Das Verhalten bereits im TV gespeicherter Timer bei ausgeschaltetem Schnellstart bleibt gesondert zu prüfen.

## Welche Grundlagen vorhanden sind

| Baustein | Belegter Stand | Noch zu klären oder umzusetzen |
|---|---|---|
| Fernseher im Netzwerk finden | Ab 0.1.9 per SSDP in der Instanz-Konfiguration implementiert. Mehrere IPv4-Adressen mit Geräteangaben werden angeboten; erst Auswahl und Speichern ändern die konfigurierte TV-Adresse. Eine Instanz kann bereits mit leerer Adresse für die Suche laufen. | Die Suche mit mehreren echten Loewe-TVs prüfen. SSDP-Erkennung und ein offener Steuerport bestätigen noch keine Tablet-API-Kompatibilität; manuelle Adresseingabe bleibt möglich. |
| Einschalten und Erreichbarkeit | Einschalten per Datenpunkt laut Nutzerrückmeldung vom 18.10.2026 mit aktiviertem Schnellstart möglich. Ohne Schnellstart sind im Standby keine Netzwerkfunktionen erreichbar. Modell und Build dieses Tests wurden nicht genannt. | Schnellstart direkt am TV aktivieren. Für die Aufnahmeautomatik Erreichbarkeit und Timerübertragung rechtzeitig prüfen; die Ausführung bereits gespeicherter Timer bei deaktiviertem Schnellstart separat testen. |
| TV-Senderbestand | Echte SL420-Daten enthalten Namen, Positionen, Dienstkennungen und Locators. Der Adapter übernimmt ausschließlich TV-Dienste, bündelt deren Positionen und verwendet die kleinste gültige Position. Die TV-Auswahl mit Namens-IDs ist nach kurzem Gerätetest bestätigt. | Migration und unveränderte Senderpfade nach dem Umsortieren umfassend prüfen. Für die Aufnahmeplanung die EPG-DVB-Zuordnung anhand protokollierter Antworten im Detail prüfen. |
| Lokales EPG | Kapitel 9.22 der Remote API 1.0.47 dokumentiert `CreateIterator` auf `de.loewe.sl2.epg`, einschließlich DVB-Senderzuordnung, Titel und Startzeit. Import seit 0.1.7 implementiert; im aktuellen Build der einzige EPG-Weg. Direkter Abruf mit dem früheren 0.1.8-Stand auf bild 7.55 / SL420 und bild 5.32 / SL310F, jeweils V5.4.6.0, am 18. Oktober 2026 vom Nutzer bestätigt. `GetMediaEvent` bleibt ein gesonderter Zugriff über `mediaEventUuid`. | Den neuen Build am Gerät prüfen. Die bisherige Rückmeldung enthält keine EPG-Rohantwort. Feldinhalte und genaue Zuordnung für die Aufnahmeplanung anhand solcher Antworten prüfen; die vollständige Sender- und Zeitraumabdeckung ist noch nicht dokumentiert. |
| Programmübersicht in der Instanz | Ab 0.1.10 zeigt der EPG-Reiter die ausgewählte TV-Liste mit Zeitachse, Sendungsdetails, Suche und Datumsnavigation. Die Ansicht liest den vorhandenen Cache; ein neuer TV-Abruf wird ausdrücklich gestartet. [Bedienung](EPG_GUI.md). | Die neue Oberfläche mit echten Senderdaten in ioBroker Admin ab 7.7.28 prüfen. Das Live-Videobild und Aufnahmebefehle sind nicht Teil der Ansicht. |
| Aufnahme programmieren | `ProgramTimer` ist im App-Ablauf mit `PVR`, `default`, Sender-Locator, Start als Unixsekunden, Dauer in Sekunden und `repeatDays=0` nachgewiesen. | Verhalten des konkreten Aufnahmeziels bestätigen und einen vollständigen Einzeltimer am Gerät prüfen. |
| Timer abgleichen | Für `GetTimerList` sind Anfragevorlage und die Auswertung von Timerkennungen und Zeitangaben im App-Code nachgewiesen. | Antwort des Nutzergeräts auswerten und eine eindeutige Zuordnung zu Aufnahmeaufträgen herstellen. |
| Timer ändern oder löschen | Unter den bisher 33 extrahierten SOAP-Aktionen ist kein gesonderter Änderungs- oder Löschbefehl für Timer nachgewiesen. | Änderungen bereits gespeicherter Timer bleiben offen, bis ein geeigneter Weg belegt ist. |
| Aufnahmeergebnis | `GetDRPlusArchive` kann Archiveinträge abfragen. | Prüfen, ob eine tatsächlich abgeschlossene Aufnahme einem Auftrag zuverlässig zugeordnet werden kann. Ein Timerlisteneintrag allein bestätigt keine gelungene Aufnahme. |

Die lokalen Anfrageformen sind in [protocol-templates.json](protocol-templates.json) dokumentiert. Die Unterscheidung von Senderreferenz und Senderdetails ist auch in [remote115-protocol.json](remote115-protocol.json) sichtbar. Diese Archive bleiben Entwicklungsunterlagen. Sie erzeugen keine bedienbaren API-Datenpunkte im aktuellen Adapter. Ein vorhandener Request beweist noch keine erfolgreiche Ausführung auf einem bestimmten TV-Modell.

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

**Der begrenzte EPG-Import ist ab 0.1.7 implementiert; der direkte Abruf mit dem früheren 0.1.8-Stand ist auf den beiden oben genannten Gerätekonfigurationen vom Nutzer bestätigt.** Er fragt DVB-Senderkennung, Titel und Startzeit sowie zusätzliche veröffentlichte Text-/Endzeitfelder ab. Bei einem erkannten Schemafehler fällt er einmal auf die dokumentierten Grundfelder zurück. Die genaue Herkunft der Felder und ihre Grenzen beschreibt [epg-protocol.md](epg-protocol.md). Für die Aufnahmeplanung sind verfügbare Endzeiten oder Dauern sowie die genaue Sender- und Ereigniszuordnung noch anhand protokollierter EPG-Antworten zu prüfen. Ohne bestätigte vollständige Zeiten und Timerparameter startet kein automatischer Aufnahmeauftrag.

Der aktuelle Build liest ausschließlich das lokale TV-EPG. Fehlende oder unvollständige Programmdaten werden über den Status und die Diagnose sichtbar; die [EPG-Anleitung](EPG.md) beschreibt den Abruf und seine Grenzen.

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

## So soll die Aufnahmeplanung arbeiten

1. **Sender zuordnen:** Die Ordner-ID wird seit dem überarbeiteten 0.1.4-Stand aus dem Sendernamen gebildet und bleibt beim Umsortieren gleich. EPG und Aufnahmeaufträge müssen sich zusätzlich auf Listenkennung, Medienart und `mediaItemUuid` beziehungsweise bestätigte DVB-Kennungen beziehen. Der EPG-Import in 0.1.7 leitet SID, TSID und ONID aus dem dokumentierten UUID-Format ab und prüft sie gegen die Antwort. Mehrere Plätze desselben Dienstes sind bereits in einem Ordner zusammengefasst und dürfen keine mehrfachen EPG-Abfragen oder Aufnahmetimer verursachen. Gleichnamige HD-, SD- oder Regionalvarianten benötigen trotz unterscheidbarer Ordner-IDs eindeutige fachliche Zuordnungen.
2. **Programmdaten laden:** Das lokale TV-EPG für ein begrenztes Zeitfenster einlesen und über die DVB-Kennungen zuordnen. Titel und Beginn sowie verifizierte Endzeiten oder Dauern und verfügbare Beschreibungen bereitstellen. Ereigniskennungen nur übernehmen, wenn tatsächlich geliefert. Aktualität, fehlende Felder und erkannte Unvollständigkeit müssen sichtbar sein.
3. **Regeln in ioBroker auswerten:** Titel, Sender, Zeitfenster und verfügbare Beschreibungen können Treffer erzeugen. Wiederholungs- oder Episodenfilter sind nur verlässlich, wenn das TV-EPG entsprechende Angaben liefert.
4. **Auftrag dauerhaft festhalten:** Jeder Auftrag bekommt eine stabile `requestId` und einen Bezug zur konkreten Ausstrahlung. Wiederholte Übermittlung derselben Kennung muss dasselbe Ergebnis liefern.
5. **Vorhandene Timer vergleichen:** Vor dem Schreiben eine aktuelle, ausreichend vollständig interpretierte Timerliste abgleichen. Mehrere Regeln für dieselbe Ausstrahlung sollen keinen zweiten Timer erzeugen.
6. **Timer rechtzeitig programmieren:** Start und Ende der Sendung mit Vor- und Nachlauf in das bestätigte TV-Format umrechnen. Anfragen pro Fernseher geordnet und mit Zeitlimit ausführen.
7. **Ergebnis zurücklesen:** Erst ein passender Eintrag in `GetTimerList` bestätigt, dass der Timer vorhanden ist. Den Ausgang einer unklar beantworteten Schreibanfrage zunächst erneut prüfen.

Intern werden eindeutige UTC-Zeitpunkte verwendet. Für die Anzeige kann ioBroker lokale Uhrzeiten verwenden. Die Umrechnung in den TV-Auftrag erfolgt erst an der Protokollgrenze und muss auch über Sommer- und Winterzeit hinweg korrekt sein.

### Beispiel eines gewünschten Ergebnisses

Eine ioBroker-Regel erkennt eine passende Sendung von 20:15 bis 21:45 Uhr. Mit fünf Minuten Vorlauf und zehn Minuten Nachlauf wird ein Timer für 20:10 bis 21:55 Uhr geplant. Diese Zeiten sind ein Rechenbeispiel ohne konkretes Datum oder tatsächliche Senderbelegung.

Der Auftrag zeigt anschließend seinen Zustand, etwa `planned`, `awaitingDevice`, `submitting`, `unknown`, `confirmed`, `needsReview`, `failed` oder `missed`, jeweils mit einer Begründung. `confirmed` bedeutet dabei ausdrücklich: **Timer im Fernseher nachgewiesen.** Ein späterer Status für eine erfolgreiche Aufnahme benötigt einen eigenen Nachweis.

## Vorhandene Senderobjekte und geplanter Ausbau der EPG-Datenpunkte

Version **0.1.10**, Build **`0.1.10-epg-guide.1`**, legt weiterhin ausschließlich TV-Sender unter **`channels.tv.<Sender-ID>`** an, beispielsweise `channels.tv.Das_Erste_HD`. Leerzeichen und Sonderzeichen werden für die ID zu Unterstrichen, Umlaute zu `ae`, `oe` beziehungsweise `ue` und `ß` zu `ss`. Gleichnamige Dienste erhalten einen stabilen Kennungssuffix. Der angezeigte Ordnername (`common.name`) enthält den bevorzugten Programmplatz als Text, die Beschreibung (`common.desc`) den Sendernamen. Steht derselbe Dienst auf den Plätzen 1, 100 und 1000, entsteht ein gemeinsamer Ordner. Sein `select`-Taster verwendet den exakten Locator der kleinsten gültigen Position, hier Platz 1. `channels.lastSelection` dokumentiert den TV-Auftrag und dessen Ergebnis.

Unter jedem Senderordner bleiben **`select`, `name`, `number`, `mediaItemUuid`, `locator`, `positions` und `available`**. `positions` enthält die bekannten Programmplätze desselben Dienstes zusammen mit ihren originalen Locators. Ein vollständiger erfolgreicher Abgleich aktualisiert die Belegung; Teilantworten, Fehler und Standby entfernen keine fehlenden Sender. Beim Update werden verwaltete Hash-Ordner aus 0.1.3 und numerische Ordner aus dem ersten 0.1.4-Stand in die neue Struktur übernommen. Bestehende Skripte und Aliase mit den alten IDs müssen einmalig angepasst werden. Bereits vorhandene Namens-IDs bleiben beim Update erhalten. Die Einzelheiten zur Migration, zum Schutz eigener Objekte und zum unabhängigen Senderlistenintervall stehen in der [Bedienungsanleitung](INSTALLATION.md#tv-sender-einzeln-anwählen).

Die vorhandenen EPG-Datenpunkte unter jedem Senderordner sind:

| Datenpunkte | Bedeutung |
|---|---|
| `epg.status`, `epg.lastUpdate`, `epg.lastError` | Abrufzustand, letzte erfolgreiche Aktualisierung und letzter Fehler. |
| `epg.now.available`, `epg.now.title`, `epg.now.subtitle`, `epg.now.description`, `epg.now.eventId`, `epg.now.start`, `epg.now.end` | Verfügbarkeit, Textfelder, Ereigniskennung und Zeiten der laufenden Sendung. |
| `epg.next.available`, `epg.next.title`, `epg.next.subtitle`, `epg.next.description`, `epg.next.eventId`, `epg.next.start`, `epg.next.end` | Entsprechende Felder der nächsten Sendung. |
| `epg.data` | Zusammenhängender JSON-Wert mit `schemaVersion: 2`, Senderbezug, Status, Aktualisierungszeit, Fehler, `now`, `next` und `tvDiagnostic`; für die Auswertung durch Skripte vorgesehen. |
| `epg.cache` | Interner Neustart-Cache mit `schemaVersion: 2` und `source: "tv"`; kein stabiler Vertrag für eigene Automationen. |

Ein alter XMLTV-Cache wird nicht übernommen. Ein gültiger TV-Cache der Version 1 kann nach Prüfung der Senderidentität, des Alters und der Sendungsdaten in Version 2 übernommen werden. Details zu Datenformat und Grenzen stehen in der [EPG-Anleitung](EPG.md).

Das EPG steht damit bereits direkt beim Sender. Beim Umsortieren bleibt sein Ordnerpfad gleich; Programmplatz und Locator werden aktualisiert. Eine tatsächliche Umbenennung des Senders ändert die Namens-ID. Deshalb folgt die interne EPG-Zuordnung der Dienstkennung und dem Listenbezug. Für die geplante Aufnahmefunktion sollen Aufträge ihren ursprünglichen Senderbezug behalten und vor der Übertragung gegen den aktuellen Bestand geprüft werden.

**Die folgenden Datenpunkte für eine vollständige Ereignisliste und für Aufnahmen sind ausschließlich ein Entwurf; der aktuelle Build legt sie nicht an.** `<Senderpfad>` steht für den vollständigen Pfad eines TV-Senderobjekts. Die geplanten Datenpunkte sollen die Steuerung durch andere ioBroker-Skripte ermöglichen, ohne dass diese SOAP-XML erzeugen müssen.

| Vorgeschlagener Datenpunkt | Zweck |
|---|---|
| `<Senderpfad>.epg.events` | Normalisierte Sendungen für ein begrenztes Zeitfenster dieses Senders. Große Listen müssen zusätzlich aufgeteilt werden. |
| `recording.enabled` | Aktiviert die spätere Verarbeitung von Aufnahmeaufträgen. Die erste Ausbaustufe beginnt mit einer Planungsvorschau. |
| `recording.request` | Ein vollständiger JSON-Auftrag mit `requestId`, Sendungsbezug, Senderbezug und Vor-/Nachlauf. Die Eingabe erfolgt zusammenhängend, um vermischte Teilparameter zu vermeiden. |
| `recording.jobs` | Begrenzte Übersicht der dauerhaft geführten Aufträge, mit Zustand, Begründung und gegebenenfalls TV-Timerkennung. |
| `recording.timers` | Zuletzt erfolgreich gelesene TV-Timerliste mit Abfragezeit und Kennzeichnung ihrer Vollständigkeit. |

Die geplante Aufnahmeauswertung baut auf dem direkten TV-EPG auf. Die Bestätigung des früheren 0.1.8-Abrufs auf den beiden genannten Geräten umfasst keine vollständige Prüfung aller Sender, Felder und Zeiträume. Zeitraum, Aktualität und erkannte Unvollständigkeit müssen bei einem späteren Ausbau sichtbar bleiben. Die bestehenden Größenlimits für Datenpunkte sollen auch für künftige Ereignis- und Auftragslisten gelten; große Bestände sollen in begrenzten Abschnitten verarbeitet werden.

## Verhalten bei Unterbrechungen und Programmänderungen

| Fall | Geplantes Verhalten |
|---|---|
| Ein `ProgramTimer`-Aufruf läuft in einen Timeout. | Als `unknown` behandeln und die Timerliste abgleichen. Der Fernseher könnte den Timer bereits gespeichert haben. Bei unklarer Zuordnung keine blinde Wiederholung. |
| ioBroker oder der Adapter startet neu. | Dauerhafte Aufträge und aktuelle TV-Timer erneut abgleichen. Bereits bestätigte oder noch unklare Vorgänge nicht pauschal neu senden. |
| Mehrere Regeln treffen dieselbe Ausstrahlung. | Gegen offene Aufträge und bestehende TV-Timer prüfen. Ein Titel allein reicht für die Identität einer Ausstrahlung nicht aus. |
| Das EPG verschiebt eine noch nicht programmierte Sendung. | Die Planung vor der Übertragung anpassen und Vor-/Nachlauf neu berechnen. |
| Das EPG ändert einen bereits programmierten Termin. | Die Abweichung als `needsReview` melden. Automatische Ersatzprogrammierung erst umsetzen, wenn Ändern oder Löschen vorhandener Timer nachgewiesen ist. |
| Ein Sender wird auf einen anderen Programmplatz verschoben. | Den unveränderten Senderbezug erhalten und vor dem Senden den aktuellen Locator aus dem abgeglichenen Bestand verwenden. Bereits am TV gespeicherte Timer gesondert abgleichen. |
| Ein Sender wird umbenannt, entfernt oder durch einen gleichnamigen Dienst ersetzt. | EPG und offene Aufnahmeaufträge anhand der tatsächlichen Senderkennung und des Listenbezugs abgleichen. Ein übereinstimmender Anzeigename allein darf keinen Auftrag auf einen anderen Dienst übertragen. |
| Ein zuvor bestätigter Timer wurde am TV entfernt. | Die Abweichung melden. Die ursprüngliche Regel soll einen bewusst entfernten Timer nicht automatisch wiederherstellen. |
| Der TV ist nicht erreichbar. | Auftrag bis zu einer definierten Frist offenhalten. Bei aktiviertem Schnellstart den begrenzten Einschaltweg bei Bedarf nutzen und anschließend die Timer-Schnittstelle prüfen. Ohne Schnellstart muss der TV laut Gerätetest zunächst mit der normalen Fernbedienung eingeschaltet werden. Vor der Automatik klären, ob interaktives Einschalten erwünscht ist, oder neue Timer bereits während vorheriger Erreichbarkeit übertragen. Nach Ablauf der Frist `missed` melden. Das betrifft neue Übertragungen; das Verhalten bereits gespeicherter TV-Timer ist gesondert zu prüfen. |
| Timer überschneiden sich. | Verfügbare Geräteinformationen und TV-Rückmeldungen auswerten. Weder eine feste Tunerzahl noch uneingeschränkte Parallelaufnahmen annehmen. |
| Eintrag oder Zeitangabe ist mehrdeutig. | Die betroffene Zuordnung sichtbar offenlassen und keinen geratenen Aufnahmeauftrag daraus erzeugen. |

Netzwerkabfragen, EPG-Verarbeitung und Datenbankschreiben müssen begrenzt bleiben. Geänderte Einträge werden gezielt aktualisiert; wiederholte vollständige Importe dürfen weder endlose Warteschlangen noch einen blockierten ioBroker-Prozess verursachen. Eine künftige Vorschau soll vor der Automatik zeigen, welche Sendungen die Regeln erfassen würden.

## Umsetzung in überprüfbaren Etappen

| Etappe | Ergebnis | Nachweis für den Abschluss |
|---|---|---|
| 1. Geräteantworten und TV-Senderbestand | TV-Ordner mit Namens-IDs je Dienst, nachgeführte Programmplätze, erhaltene Dienstkennungen, eindeutige Locators und interpretierte Timerantworten. | ASTRA-LCN-Senderantwort, die ersten drei TV-Plätze und die TV-Auswahl mit Namens-IDs sind nach kurzem Gerätetest bestätigt. Migration, Umsortieren, gewünschter TV-Gesamtbestand und vorhandene manuelle Timer bleiben am Gerät umfassend zu prüfen. |
| 2. Aufnahmeweg für einen Einzeltimer | Ein zukünftiger Timer wird programmiert und im TV wiedergefunden. | Bestätigte Parameter und Zeiten, tatsächliche Aufnahme sowie Verhalten aus Standby am Gerät geprüft. |
| 3. Lokales EPG und Zuordnung | Seit 0.1.7 implementiert: Ein begrenzter Import über `CreateIterator` liefert Programmdaten mit eindeutiger DVB-Senderzuordnung. Im aktuellen Build ausschließlich direkt vom TV. Direkter Abruf mit dem früheren 0.1.8-Stand auf bild 7.55 / SL420 und bild 5.32 / SL310F, jeweils V5.4.6.0, vom Nutzer bestätigt. | Den neuen Build am Gerät prüfen. Für den vollständigen Abschluss noch protokollierte EPG-Antworten, Sender- und Zeitraumabdeckung sowie die für Aufnahmen benötigten Start-/Endzeiten oder Dauern im Detail prüfen. |
| 4. Regeln und Planungsvorschau | ioBroker-Regeln erzeugen nachvollziehbare Aufnahmepläne. | Duplikate, Neustarts, EPG-Verschiebungen und Zeitumstellung ohne Schreiben von TV-Timern durchgespielt. |
| 5. Aufnahmeautomatik | Geprüfte Pläne werden rechtzeitig übertragen und bestätigt. | Erfolgreicher vollständiger Ablauf einschließlich Fehler- und Wiederanlauffällen. |

Die Etappen 2 und 3 lassen sich unabhängig vorbereiten. Der einzelne Gerätetimer ist der erste praktische Nachweis, dass die Aufnahmefunktion des konkreten Fernsehers für die spätere Automatik geeignet ist. Dafür reichen zunächst bekannte Testzeiten; ein fertiger EPG-Import ist noch nicht erforderlich.

TV-Modell, Chassis und Firmware sind für beide bestätigten EPG-Geräte bekannt; die vorhandene Senderantwort mit Locators stammt vom SL420. Für den nächsten Aufnahme-Gerätetest fehlen noch das vorgesehene Aufnahmeziel und eine vorhandene manuell programmierte Aufnahme aus `GetTimerList`. Für die Prüfung von Zuordnung, Zeitangaben und einem konkreten Testauftrag wird außerdem eine passende protokollierte EPG-Antwort benötigt; die Nutzerrückmeldung zum erfolgreichen Abruf enthält keine Rohantwort.

## Zurückgestellt: Radiosender

Die Radioauswahl ist nach der erneuten erfolglosen Rückmeldung zu 0.1.6 aus dem aktiven Adapter entfernt. Sie ist keine Voraussetzung für die nächsten Schritte mit TV-EPG und Aufnahmen. Eine spätere Wiederaufnahme beginnt mit einem isolierten Gerätetest eines tatsächlich funktionierenden Radio-Steuerwegs. Erst danach werden neue Radio-Datenpunkte und deren Aktualisierung geplant. Die bisherigen Protokollbefunde bleiben für diese Untersuchung erhalten.
