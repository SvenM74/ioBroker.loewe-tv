# Prüfbericht: Loewe-TV-Adapter 0.1.4

Stand: **17. Oktober 2026**

## Ergebnis

**Abschließender Gesamtlauf: 199 von 199 Tests bestanden.** Keine Tests sind fehlgeschlagen, abgebrochen oder übersprungen worden. Dieser Bericht betrifft die Überarbeitung von Version 0.1.4 auf Sendernamen als Ordner-IDs. Der Gesamtlauf wurde nach den abschließenden Änderungen an Katalog, Objektmigration und Runtime erneut ausgeführt.

Die vollständige Ausgabe dieses Gesamtlaufs ist unter [TESTERGEBNIS_0.1.4.tap](TESTERGEBNIS_0.1.4.tap) abgelegt. Sie gehört zum gemeinsam veröffentlichten Quellstand mit Namens-IDs, Katalogschema 3 und Migration aus den bisherigen Hash- und Nummernordnern.

| Testdatei | Ausgeführte Tests |
|---|---:|
| `test/channel-catalog.test.js` | 39 |
| `test/channel-objects.test.js` | 32 |
| `test/channel-refresh.test.js` | 22 |
| `test/channels.test.js` | 9 |
| `test/client-regressions-010.test.js` | 18 |
| `test/loopback.test.js` | 4 |
| `test/power-on.test.js` | 17 |
| `test/protocol.test.js` | 23 |
| `test/regressions-010.test.js` | 8 |
| `test/runtime.test.js` | 27 |
| **Gesamt** | **199** |

**Zusätzliche Prüfung mit `npm run check`: bestanden.** Sie bestätigt 105 statische Objektdefinitionen im Standardmodus beziehungsweise 304 mit erweiterten Befehlen, übereinstimmende Paketversionen, Admin-Übersetzungen, JavaScript-Syntax und die vorhandenen 34 Protokollvorlagen mit 33 Aktionen. Dynamische Senderobjekte kommen zu den statischen Definitionen hinzu.

Der [GitHub-Workflow](https://github.com/SvenM74/ioBroker.loewe-tv/actions) führt dieselben Tests und Paketprüfungen zusätzlich unter Node.js 22 und 24 aus. Der Status des jeweiligen veröffentlichten Commits ist dort einsehbar.

## Umgebung und Reproduktion

**Testumgebung: Linux, Node.js v24.19.0, produktiver XML-Parser `sax` 1.6.1.** Der gemeinsame Gesamtlauf dauerte rund 3,8 Sekunden. Zur Reproduktion im Projektverzeichnis:

```bash
node --test --test-reporter=tap test/*.test.js > docs/TESTERGEBNIS_0.1.4.tap 2>&1
npm run check
```

Die Tests für das Sendermodell verwenden die produktiven Katalogfunktionen. Die Objektintegration verwendet den produktiven `AdapterRuntime` und `ChannelObjects` mit kontrollierten ioBroker-Datenbank- und TV-Doubles. Die Tests des automatischen Abrufs kontrollieren die Übergabe an den Objektworker und prüfen die Netzwerkreihenfolge separat. Die Loopback-Tests öffnen echte HTTP-/UDP-Verbindungen ausschließlich lokal. Die vollständige Ausführung benötigt daher die Berechtigung für Loopback-Sockets und Node-Unterprozesse.

Diese automatisierten Tests sprechen keinen Fernseher an und starten keinen produktiven ioBroker-Controller. Sie prüfen Implementierung und Fehlerbehandlung; sie ersetzen keinen Gerätetest der überarbeiteten Version.

## Sendernamen als Ordner-IDs und Katalogschema 3

Ein Senderdienst erhält einen gemeinsamen Ordner mit lesbarer Namens-ID, beispielsweise `channels.tv.Das_Erste_HD` oder `channels.radio.Bayern_1`. Mehrere Programmplätze desselben Dienstes werden im Katalogschema **3** zusammengefasst. Der Ordnername (`common.name`) ist die Textdarstellung des kleinsten gültigen Programmplatzes; die Beschreibung (`common.desc`) bleibt der vollständige Sendername. Die zugehörigen Tests decken insbesondere Folgendes ab:

- getrennte TV- und Radioordner auch bei gleichen Sendernamen oder Programmpositionen;
- lesbare IDs mit Unterstrichen und ausgeschriebenen Umlauten sowie Behandlung reservierter alter ID-Formate;
- unveränderte Sender-IDs beim Umsortieren, unabhängig von der Reihenfolge der TV-Antwort;
- Aktualisierung von `number`, `common.name` und `locator`, ohne dabei einen bestehenden Senderordner oder seine benutzerdefinierten Einstellungen zu ersetzen;
- einen gemeinsamen Ordner für beispielsweise die Plätze 1, 100 und 1000, wobei `positions`, `numbers` und `locators` alle Originalangaben erhalten;
- Auswahl über den exakten Original-Locator der kleinsten gültigen Position;
- getrennte Dienstidentitäten bei gleichen bereinigten Namen, mit stabilen Kennungssuffixen;
- Erhalt bereits zugewiesener IDs, wenn später eine Namenskollision hinzukommt oder ein gleichnamiger Nachbardienst entfällt;
- Änderung der Namens-ID bei einer tatsächlichen Senderumbenennung und Erhalt eines geschützten alten Ordners mit gesperrter Auswahl;
- Wiederherstellung derselben ID-Zuordnung aus Katalog und nativen Objektmetadaten;
- Gruppierung über die Dienstbestandteile eines gültigen Locators, wenn keine `mediaItemUuid` vorhanden ist;
- Ablehnung mehrdeutiger Dienst- oder Platzzuordnungen sowie widersprüchlicher Nummern, ohne ein Umschaltziel zu erraten;
- Umschalten ausschließlich über registrierte Senderpfade mit `select=true` und `ack:false`, Rücksetzen des Tasters und Verwerfen veralteter wartender Auswahlaufträge.

Der Programmplatz ist kein Bestandteil einer Namens-ID oder ihres Kennungssuffixes. Skripte mit bisherigen `service_<Hash>`-IDs oder numerischen IDs müssen einmalig angepasst werden. Die neue ID bleibt beim Umsortieren erhalten; für spätere EPG- und Aufnahmefunktionen müssen trotzdem die tatsächliche Dienstkennung, Medienart und Listenkennung verwendet werden. Ein gleicher Sendername beweist keine identische Dienstzuordnung.

## Automatischer und manueller Abgleich

Der automatische Abgleich verwendet weiterhin standardmäßig **300 Sekunden**. Der Wert **0** deaktiviert ihn; ansonsten sind ganze Werte von **60 bis 86.400 Sekunden** zulässig. `channels.refresh` bleibt als manueller Komplettabruf verfügbar. Die Tests decken Start, tatsächliche Wiederverbindung, Intervall, deaktivierte Automatik und unabhängiges Statuspolling ab.

Der Abruf respektiert die ausgewählte Liste und lädt TV und Radio gemeinsam. Eine leere Listenkennung wird anhand einer tatsächlich gemeldeten Liste ausgewählt. Manuelle Parameter wie `channels.start`, `channels.count`, `channels.mediaType` und `channels.listStart` bleiben erhalten. Eine Parameteränderung allein erzeugt keinen TV-Aufruf; sie verwirft gegebenenfalls eine noch laufende ältere Antwort.

Eine vollständige Antwort wird vor der Übergabe an die Objektaufbereitung validiert. Bei mehreren Seiten werden zwei vollständige Lesedurchgänge inhaltlich verglichen. Der möglicherweise konstante TV-Hash `4294967295` wird nicht als Beweis einer unveränderten Liste verwendet. Tests decken geänderte Gesamtzahlen, wiederholte Seiten, geänderte Inhalte, unbekannte Medienarten, fehlende Gesamtzahlen, leere vollständige Listen und eine neuere manuelle Abfrage während des automatischen Abrufs ab.

Eine unbekannte Nutzdatenstruktur einer gültigen SOAP-Sender- oder Listenübersichtsantwort erzeugt einen Senderabgleichsfehler. Sie setzt eine funktionierende Verbindung nicht auf offline und provoziert deshalb keine wiederholten sofortigen Abgleiche durch normale Statuspolls. Tatsächliche Netzwerk-, XML-, Größenlimit- und Sessionfehler behalten ihre bisherige Fehlerbehandlung.

`channels.refreshStatus=ready` bestätigt die Übergabe eines geprüften Gesamtbestands. Die anschließende Objektverarbeitung ist über `channels.catalogStatus` zu beobachten. Diese beiden Schritte haben jeweils eigene Fehler- und Zeitstempeldatenpunkte.

## Migration, Bereinigung und Wiederherstellung

Gespeicherte Kataloge im **Schema 1** und die verwalteten Hash-Ordner aus 0.1.3 sowie Kataloge im **Schema 2** und numerische Ordner aus dem ersten 0.1.4-Stand werden in **Schema 3** überführt. Mehrere gültige alte Plätze desselben Dienstes werden wieder gruppiert. Die Migration validiert alte Hash-IDs beziehungsweise den Zusammenhang von Nummern-ID und Position, bevor sie die gespeicherten Daten übernimmt. Sie verwendet vorhandene Daten ohne eigenen TV-Aufruf. Gespeicherte `true`-Tasterwerte werden nicht erneut gesendet. Auch mehrere alte Dienste, die denselben Programmplatz beanspruchen, dürfen keine beliebige Auswahl aktivieren; eindeutige neue Live-Daten können die Zuordnung wiederherstellen.

Die Wiederherstellung berücksichtigt den Fortschritt einer bereits begonnenen Migration: **Native Objektdaten im Schema 3 haben Vorrang vor einem älteren Cache im Schema 1 oder 2.** Dadurch dürfen ein zurückgebliebener numerischer Katalog oder alte Gruppen weder aktuelle Positionen ersetzen noch bereits zugewiesene Kollisionssuffixe neu vergeben. Auch eine neuere ausdrücklich nicht verfügbare Belegung sperrt den veralteten aktiven Anspruch eines anderen Dienstes auf denselben Platz. Ein als stillgelegt markierter Senderordner darf durch einen älteren aktiven Katalog ohne neue TV-Bestätigung nicht wieder aktiviert werden.

Normale Hash- und Nummernordner werden erst nach Anlage ihrer Ersatzordner bereinigt. Bei aktuellen Namensordnern erlaubt nur ein vollständig und erfolgreich gelesener Bestand die Entfernung unbestätigt fehlender Dienste. Einzelne Teilseiten, Standby, Netzwerkfehler und unvollständige oder widersprüchliche Antworten dürfen aus bloßer Abwesenheit keine Entfernung ableiten. Bei einem vollständigen gefilterten Abruf bleibt die jeweils andere Medienart erhalten. Eine bloße Folge manueller Teilseiten gilt nicht als Vollständigkeitsnachweis.

Teilantworten können trotzdem konkrete Änderungen belegen und müssen dann ein veraltetes Umschaltziel sperren. Tests behandeln einen Sender, der auf einer Teilseite mit einer neuen Position erscheint, eine neue Belegung eines bereits bekannten Platzes sowie das Verschieben von Dienst B auf den bisherigen Platz von Dienst A. Neu beobachtete Positionen eines verschobenen Senders ersetzen dessen veraltete Auswahl, statt weiterhin einen kleineren alten Platz zu bevorzugen. Ein verdrängter Dienst wird deaktiviert, wenn keine unberührte, zuvor bestätigte Alternativposition erhalten bleibt. Nicht betroffene Dienste bleiben vorhanden. Widersprüche zwischen Beschriftung und Locator oder unbekannte Einträge an einem belegten Platz dürfen keinen beliebigen Empfänger des Umschaltbefehls freigeben.

Die Bereinigung verwendet eine aktuelle Objektinventur und überprüft die betroffenen Objekte nochmals vor jedem einzelnen, nicht rekursiven Löschaufruf. Fehlende Inventurzeilen autorisieren keine Löschung. Benutzerdefinierte Unterobjekte, benutzerdefinierte Einstellungen und Löschschutz werden erhalten. Betroffene Altordner bleiben mit `available=false` und gesperrter Auswahl bestehen; sie dürfen bei einem Neustart keine entfernten Sender ohne Live-Nachweis wieder aktivieren. Die Eigentumsprüfung berücksichtigt die früheren unmarkierten Standardkinder ausschließlich bei den alten Hash-Ordnern.

Fehlerhafte gespeicherte Kataloge oder Rohantworten dürfen eine bereits während des Starts empfangene gültige Live-Antwort nicht verwerfen. Dasselbe gilt für widersprüchliche alte Nummernordner, die für denselben Dienst unterschiedliche Namen speichern. Solche Gruppen werden isoliert verworfen; gültige andere Gruppen und wartende Live-Antworten bleiben nutzbar. Die Tests prüfen außerdem Wiederherstellung ohne JSON-Katalog, Übernahme von Teilseiten, Rücksetzen gespeicherter Taster und erneute Verarbeitung nach einem Datenbankfehler.

## Reaktionsfähigkeit und Grenzen

TV-Anfragen bleiben serialisiert. Zwischen den Seiten eines großen Abrufs können Fernbedienungsbefehle ausgeführt werden. Die Objektaufbereitung läuft unabhängig von dieser Warteschlange mit höchstens zwei gleichzeitigen Datenbankoperationen. Ein Test hält die Objektaufbereitung an und prüft, dass währenddessen ein Fernbedienungsbefehl ausgeführt werden kann. Eine synthetische Liste mit **372 Einträgen und realistisch langen Kennungen** dient der Prüfung der vollständigen Verarbeitung innerhalb der Kataloggrenze.

Ein bereits gestarteter Datenbankaufruf lässt sich durch einen Timeout nicht zurückholen. Deshalb wartet die Senderverarbeitung auf dessen tatsächliches Ende, bevor sie einen betroffenen Objektpfad erneut verwendet. Das gilt auch, wenn nach einer Entfernung ein anderer Dienst dieselbe Namens-ID erhalten könnte. Ein bereits begonnener, verspäteter Tasterreset darf keinen gelöschten Statewert wieder anlegen. Der Runtime-Test für die neuen Namen prüft zusätzlich die Erfassung des tatsächlich gestarteten Reset-Schreibvorgangs. Diese Wartebarrieren belegen nicht die Fernbedienungswarteschlange. Beim Beenden beginnen keine neuen dynamischen Datenbankoperationen.

Der Komplettabruf ist auf **500 Einträge je Seite**, **2.000 Programmplätze**, **20 Seiten je Lesedurchgang** und eine gemeinsame Transportdeadline von **120 Sekunden** begrenzt. Die Objektverwaltung begrenzt den Bestand getrennt davon auf **2.000 Dienste**; ein Dienst kann mehrere Programmplätze umfassen. Für den gespeicherten Katalog gelten **480 KiB**. Überschreitungen werden als Fehler behandelt; der Bestand wird nicht still abgeschnitten. Die Katalogfunktionen behalten zusätzlich ihre bestehenden Grenzen für gespeicherte Seiten und Referenzen. Die Grenzprüfungen schließen die Migration alter Kataloge ein.

## Stand der Gerätetests und EPG

Der Nutzer betreibt einen **Loewe bild 7.55, SL420, V5.4.6.0**. Er hat die ersten drei TV-Plätze seiner bereitgestellten ASTRA-LCN-Antwort mit der TV-Konfiguration verglichen, die Anlage der Senderordner in 0.1.3 und anschließend allgemein die Funktion des ersten **0.1.4-Stands mit numerischen IDs** bestätigt. Auf seinen Wunsch wird die Änderung auf Namens-IDs ebenfalls unter Version 0.1.4 geführt. Diese neue Überarbeitung ist noch nicht am Gerät getestet. Die öffentlichen Fixtures verwenden synthetische Kennungen und übernehmen keine privaten Netzwerkadressen, Clientkennungen oder lokalen UUIDs aus seiner Antwort.

Am Gerät bleiben die neuen Namensordner, die automatische Migration, die gleichbleibenden Pfade nach dem Umsortieren und die Auswahl der richtigen TV- und Radiosender zu prüfen. Aus der allgemeinen Erfolgsmeldung zum bisherigen Stand folgt kein gezielter Erfolgstest des zuvor gemeldeten Einschaltproblems.

Der Unterordner `epg` bleibt direkt am jeweiligen Sender vorhanden; mehrere Positionen desselben Dienstes teilen sich diesen Ordner. **`epg.status` steht weiterhin auf `notImplemented`.** Diese Version enthält noch keinen EPG-Import und keine automatische Aufnahmeplanung. Bedienung, erneute Installation derselben Paketversion und weitere Schritte stehen in der [README](../README.md) und der [Roadmap](ROADMAP.md).
