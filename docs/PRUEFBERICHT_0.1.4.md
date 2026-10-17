# Prüfbericht: Loewe-TV-Adapter 0.1.4

Stand: **17. Oktober 2026**

## Ergebnis

**184 Tests bestanden; 0 fehlgeschlagen, abgebrochen oder übersprungen.** Die unveränderte Ausgabe des abschließenden gemeinsamen Testlaufs steht in [TESTERGEBNIS_0.1.4.tap](TESTERGEBNIS_0.1.4.tap). Der Lauf verwendet die endgültigen JavaScript-Dateien dieser Version.

| Testdatei | Ausgeführte Tests |
|---|---:|
| `test/channel-catalog.test.js` | 31 |
| `test/channel-objects.test.js` | 26 |
| `test/channel-refresh.test.js` | 22 |
| `test/channels.test.js` | 9 |
| `test/client-regressions-010.test.js` | 18 |
| `test/loopback.test.js` | 4 |
| `test/power-on.test.js` | 17 |
| `test/protocol.test.js` | 23 |
| `test/regressions-010.test.js` | 8 |
| `test/runtime.test.js` | 26 |
| **Gesamt** | **184** |

`npm run check` besteht ebenfalls: **105 statische Objektdefinitionen** im Standardmodus und **304** mit erweiterten Aktionen, konsistente Paketversionen und Admin-Übersetzungen sowie gültige JavaScript-Syntax. Die vorhandenen **34 XML-Vorlagen**, **33 SOAP-Aktionen** und Fernbedienungscodes werden weiter gegen ihre bestehenden Protokollbelege geprüft. Dynamische Senderobjekte kommen zu den statischen Definitionen hinzu.

## Umgebung und Reproduktion

Lokale Prüfung unter **Linux mit Node.js v24.19.0** und dem produktiven XML-Parser **sax 1.6.1**:

```bash
node --test --test-reporter=tap test/*.test.js > docs/TESTERGEBNIS_0.1.4.tap
npm run check
```

Die Tests für das Sendermodell verwenden die produktiven Katalogfunktionen. Die Objektintegration verwendet den produktiven `AdapterRuntime` und `ChannelObjects` mit kontrollierten ioBroker-Datenbank- und TV-Doubles. Die Tests des automatischen Abrufs kontrollieren die Übergabe an den Objektworker und prüfen die Netzwerkreihenfolge separat. Die vorhandenen vier Loopback-Tests öffnen echte HTTP-/UDP-Verbindungen ausschließlich lokal. Die vollständige Ausführung benötigt daher die Berechtigung für Loopback-Sockets und Node-Unterprozesse.

Es wurde kein Fernseher angesprochen und kein produktiver ioBroker-Controller gestartet. Das Ergebnis prüft Implementierung und Fehlerbehandlung; es ersetzt keinen Gerätetest der neuen Version.

## Ordner nach Programmplatz

Jeder Programmplatz wird durch eine eigene numerische ID dargestellt, beispielsweise `channels.tv.1`, `channels.tv.100` und `channels.radio.100`. Die Tests prüfen insbesondere:

- getrennte TV- und Radioordner auch bei gleicher Nummer;
- Sendername in `common.name` und `common.desc`;
- einen eigenen Ordner und den exakten Original-Locator für jeden Platz eines mehrfach eingetragenen Dienstes;
- Übernahme einer Umbenennung und vollständigen Ersatz von UUID, Name und Locator bei neuer Platzbelegung;
- Wechsel der Ordner-ID beim Verschieben eines Senders und Entfernung des nicht mehr vorhandenen alten Platzes nach vollständigem Abgleich;
- kanonische numerische IDs bei führenden Nullen, mit unveränderten Originalangaben in den Metadaten;
- Ablehnung mehrdeutiger Platzbelegungen oder widersprüchlicher Nummern, ohne ein Umschaltziel zu erraten;
- Umschalten ausschließlich über `select=true` mit `ack:false`, Rücksetzen des Tasters und Verwerfen veralteter wartender Auswahlaufträge.

Die ID bezeichnet den Platz in der ausgewählten Liste. Sie ist keine dauerhafte Identität eines bestimmten Senders. Skripte mit bisherigen `service_<Hash>`-IDs benötigen eine Anpassung. Für spätere EPG- und Aufnahmefunktionen muss zusätzlich die tatsächliche Senderkennung beachtet werden.

## Automatischer und manueller Abgleich

Der automatische Abgleich verwendet standardmäßig **300 Sekunden**. Der Wert **0** deaktiviert ihn; ansonsten sind ganze Werte von **60 bis 86.400 Sekunden** zulässig. `channels.refresh` bleibt als manueller Komplettabruf verfügbar. Start, tatsächliche Wiederverbindung, Intervall, deaktivierte Automatik und unabhängiges Statuspolling sind geprüft.

Der Abruf respektiert die ausgewählte Liste und lädt TV und Radio gemeinsam. Eine leere Listenkennung wird anhand einer tatsächlich gemeldeten Liste ausgewählt. Manuelle Parameter wie `channels.start`, `channels.count`, `channels.mediaType` und `channels.listStart` bleiben erhalten. Eine Parameteränderung allein erzeugt keinen TV-Aufruf; sie verwirft gegebenenfalls eine noch laufende ältere Antwort.

Eine vollständige Antwort wird vor der Übergabe an die Objektaufbereitung validiert. Bei mehreren Seiten werden zwei vollständige Lesedurchgänge inhaltlich verglichen. Der möglicherweise konstante TV-Hash `4294967295` wird nicht als Beweis einer unveränderten Liste verwendet. Tests decken geänderte Gesamtzahlen, wiederholte Seiten, geänderte Inhalte, unbekannte Medienarten, fehlende Gesamtzahlen, leere vollständige Listen und eine neuere manuelle Abfrage während des automatischen Abrufs ab.

Eine unbekannte Nutzdatenstruktur einer gültigen SOAP-Sender- oder Listenübersichtsantwort erzeugt einen Senderabgleichsfehler. Sie setzt eine funktionierende Verbindung nicht auf offline und provoziert deshalb keine wiederholten sofortigen Abgleiche durch normale Statuspolls. Tatsächliche Netzwerk-, XML-, Größenlimit- und Sessionfehler behalten ihre bisherige Fehlerbehandlung.

`channels.refreshStatus=ready` bestätigt die Übergabe eines geprüften Gesamtbestands. Die anschließende Objektverarbeitung ist über `channels.catalogStatus` zu beobachten. Diese beiden Schritte haben jeweils eigene Fehler- und Zeitstempeldatenpunkte.

## Migration, Bereinigung und Wiederherstellung

Gespeicherte Kataloge der Version 1 und die verwalteten Hash-Ordner aus 0.1.3 werden in das Katalogschema 2 mit einem Eintrag je Programmplatz übernommen. Die Migration verwendet vorhandene Daten ohne eigenen TV-Aufruf. Gespeicherte `true`-Tasterwerte werden nicht erneut gesendet. Auch mehrere alte Dienste, die denselben Programmplatz beanspruchen, dürfen keine beliebige Auswahl aktivieren; eindeutige neue Live-Daten können die Zuordnung wiederherstellen.

Normale Hash-Ordner werden erst nach Anlage ihrer Ersatzordner bereinigt. Bei aktuellen numerischen Ordnern erlaubt nur ein vollständig und erfolgreich gelesener Bestand die Entfernung fehlender Plätze. Einzelne Teilseiten, Standby, Netzwerkfehler und unvollständige oder widersprüchliche Antworten entfernen keine unbestätigt fehlenden Sender. Bei einem vollständigen gefilterten Abruf bleibt die jeweils andere Medienart erhalten. Eine bloße Folge manueller Teilseiten gilt nicht als Vollständigkeitsnachweis.

Die Bereinigung verwendet eine aktuelle Objektinventur und überprüft die betroffenen Objekte nochmals vor jedem einzelnen, nicht rekursiven Löschaufruf. Fehlende Inventurzeilen autorisieren keine Löschung. Benutzerdefinierte Unterobjekte, benutzerdefinierte Einstellungen und Löschschutz werden erhalten. Betroffene Altordner bleiben mit gesperrter Auswahl bestehen; sie dürfen bei einem Neustart keine entfernten Sender wieder aktivieren. Die Eigentumsprüfung berücksichtigt die früheren unmarkierten Standardkinder ausschließlich bei den alten Hash-Ordnern.

Fehlerhafte gespeicherte Kataloge oder Rohantworten dürfen eine bereits während des Starts empfangene gültige Live-Antwort nicht verwerfen. Die Tests prüfen Wiederherstellung ohne JSON-Katalog, Übernahme von Teilseiten, Rücksetzen gespeicherter Taster und erneute Verarbeitung nach einem Datenbankfehler.

## Reaktionsfähigkeit und Grenzen

TV-Anfragen bleiben serialisiert. Zwischen den Seiten eines großen Abrufs können Fernbedienungsbefehle ausgeführt werden. Die Objektaufbereitung läuft unabhängig von dieser Warteschlange mit höchstens zwei gleichzeitigen Datenbankoperationen. Ein Test hält die Objektaufbereitung an und führt währenddessen erfolgreich einen Fernbedienungsbefehl aus. Eine synthetische Liste mit **372 Einträgen und realistisch langen Kennungen** wird vollständig verarbeitet und bleibt innerhalb der Kataloggrenze.

Ein bereits gestarteter Datenbankaufruf lässt sich durch einen Timeout nicht zurückholen. Deshalb wartet die Senderverarbeitung auf dessen tatsächliches Ende, bevor sie denselben Programmplatz erneut verwendet. Auch ein bereits begonnener, verspäteter Tasterreset darf keinen gelöschten Statewert wieder anlegen. Diese Wartebarrieren belegen nicht die Fernbedienungswarteschlange. Beim Beenden beginnen keine neuen dynamischen Datenbankoperationen.

Der Komplettabruf ist auf **500 Einträge je Seite**, **2.000 Programmplätze**, **20 Seiten je Lesedurchgang** und eine gemeinsame Transportdeadline von **120 Sekunden** begrenzt. Für den gespeicherten Katalog gelten **480 KiB**. Überschreitungen werden als Fehler behandelt; der Bestand wird nicht still abgeschnitten. Die Katalogfunktionen behalten zusätzlich ihre bestehenden Grenzen für gespeicherte Seiten und Referenzen.

## Stand der Gerätetests und EPG

Der Nutzer betreibt einen **Loewe bild 7.55, SL420, V5.4.6.0**. Er hat die ersten drei TV-Plätze seiner bereitgestellten ASTRA-LCN-Antwort mit der TV-Konfiguration verglichen und die Anlage der Senderordner in 0.1.3 bestätigt. Diese Rückmeldung ist kein Test der neuen Version 0.1.4. Die öffentlichen Fixtures verwenden synthetische Kennungen und übernehmen keine privaten Netzwerkadressen, Clientkennungen oder lokalen UUIDs aus seiner Antwort.

Am Gerät bleiben die neuen numerischen Ordner, ihre Aktualisierung nach einer TV-Konfigurationsänderung sowie die Auswahl der richtigen TV- und Radioplätze zu prüfen. Eine Bestätigung des zuvor gemeldeten Einschaltproblems liegt weiterhin nicht vor.

Der Unterordner `epg` bleibt direkt am jeweiligen Programmplatz vorhanden. **`epg.status` steht weiterhin auf `notImplemented`.** Diese Version enthält noch keinen EPG-Import und keine automatische Aufnahmeplanung. Bedienung, Update und weitere Schritte stehen in der [README](../README.md) und der [Roadmap](ROADMAP.md).
