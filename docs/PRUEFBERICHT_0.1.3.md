# Prüfbericht: Loewe-TV-Adapter 0.1.3

Stand: **17. Oktober 2026**

## Ergebnis

**137 Tests bestanden; 0 fehlgeschlagen, abgebrochen oder übersprungen.** Die unveränderte Ausgabe des abschließenden gemeinsamen Testlaufs steht in [TESTERGEBNIS_0.1.3.tap](TESTERGEBNIS_0.1.3.tap). Der Lauf verwendet die endgültigen JavaScript-Dateien dieser Version.

| Testdatei | Ausgeführte Tests |
|---|---:|
| `test/channel-catalog.test.js` | 21 |
| `test/channel-objects.test.js` | 12 |
| `test/channels.test.js` | 8 |
| `test/client-regressions-010.test.js` | 18 |
| `test/loopback.test.js` | 4 |
| `test/power-on.test.js` | 17 |
| `test/protocol.test.js` | 23 |
| `test/regressions-010.test.js` | 8 |
| `test/runtime.test.js` | 26 |
| **Gesamt** | **137** |

`npm run check` besteht ebenfalls: **100 statische Objektdefinitionen** im Standardmodus, **299** mit erweiterten Aktionen, konsistente Paketversionen und Admin-Übersetzungen sowie gültige JavaScript-Syntax. Die bisherigen 34 XML-Vorlagen, 33 SOAP-Aktionen und Fernbedienungscodes werden weiterhin gegen ihre vorhandenen Protokollbelege geprüft. Dynamische Senderobjekte kommen zu den statischen Definitionen hinzu.

## Umgebung und Aussagekraft

Lokaler Testlauf unter **Linux mit Node.js v24.19.0** und dem produktiven XML-Parser `sax` 1.6.1:

```bash
node --test --test-reporter=tap test/*.test.js > docs/TESTERGEBNIS_0.1.3.tap
npm run check
```

Die neuen Integrationstests verwenden den produktiven `AdapterRuntime` und `ChannelObjects` mit kontrollierten ioBroker-Datenbank- und TV-Doubles. Die vorhandenen vier Loopback-Tests öffnen HTTP-/UDP-Sockets ausschließlich lokal. Es wurde kein Fernseher angesprochen und kein produktiver ioBroker-Controller gestartet. Damit sind Implementierung und Fehlerbehandlung geprüft; ein Gerätetest der neuen Sendertaster steht noch aus.

## Ausgangspunkt am SL420

Der Nutzer betreibt einen **Loewe bild 7.55, Chassis SL420, Software V5.4.6.0** und hat eine echte `GetChannelListResponse` für **ASTRA LCN** bereitgestellt. Ihr Kopf meldet 372 zurückgegebene von 372 Listeneinträgen ab Index 0. Die ersten drei TV-Programme hat er mit seiner Konfiguration abgeglichen. Die Antwort enthält TV und Radio sowie mehrere Programmplätze desselben Dienstes. Die Zahl 372 bezeichnet deshalb keine Zahl eindeutiger TV-Sender.

Die öffentlichen Tests bilden diese Antwortstruktur mit synthetischen Kennungen nach. Private Netzwerkadressen, die tatsächliche Clientkennung und lokale Listen-/Channel-UUIDs des Nutzers sind nicht in die Testfixtures übernommen worden. Die bereitgestellte vollständige JSON-Zeichenkette selbst wurde nicht als Testdatei ausgeführt; die Tests prüfen repräsentative Strukturen und zusätzlich eine große synthetische Liste.

## Senderobjekte und Auswahl

Die Zuordnung erfolgt anhand von `itemClass` **am jeweiligen Eintrag**: `video` unter `channels.tv`, `audio` unter `channels.radio`. Der übergeordnete Textwert `ItemClass="undefined"` ist keine Klassifikation des einzelnen Senders.

Geprüft wurden:

- stabile Objekt-IDs aus Listenkennung, Medienart und Dienstkennung, einschließlich unveränderter IDs bei Umbenennung oder Umnummerierung;
- Zusammenführung mehrerer Programmplätze eines Dienstes, beispielsweise 1, 100 und 1000, bei Erhaltung aller originalen Zuordnungen in `positions`;
- getrennte TV-/Radioobjekte auch bei gleicher Programmnummer;
- Auswahl mit dem unveränderten `channel://`-Locator des bevorzugten verwendbaren Programmplatzes;
- Auslösung nur durch den booleschen Wert `true` mit `ack:false`, Zurücksetzen des Tasters auch nach einem Transportfehler und keine Ausführung bestätigter oder falsch typisierter Werte;
- Wiederherstellung aus Katalog und verwalteten Objekten sowie Übernahme einer gespeicherten Antwort aus 0.1.2 ohne TV-Aufruf oder Wiederholung alter Tastendrücke.

`select` ist ein Befehlstaster und kein gelesener Wiedergabezustand. Er setzt einen erreichbaren Fernseher voraus. Der eigene Einschaltablauf bleibt bei `control.powerOn`.

## Teilseiten, Änderungen und Wiederherstellung

Eine Teilseite ergänzt bekannte Dienste. Fehlende Dienste werden nur durch eine vollständig auswertbare Einzelantwort ab Index 0 für den jeweiligen Filter abgeglichen. Eine vollständige TV-Abfrage lässt Radioeinträge derselben Liste bestehen und umgekehrt. Aus mehreren Teilseiten und dem gegebenenfalls konstanten Hash `4294967295` wird keine sichere Entfernung abgeleitet.

Die Tests prüfen zusätzlich zwei konkrete Fehlerfälle: Eine vollständige Antwort und eine folgende Teilantwort mit gleichem Startindex bleiben in ihrer Reihenfolge erhalten. Eine neu empfangene Antwort kann nicht von einem alten wartenden Umschaltauftrag überholt werden, auch wenn das Speichern des Katalogs noch wartet. Während der Übernahme wird die Auswahl mit `CHANNEL_UPDATING` abgewiesen; ein danach entfernter Dienst meldet `CHANNEL_UNAVAILABLE`.

Bei einem Listenwechsel werden alte Dienste inaktiv. Ihre Objekte und EPG-Unterbäume bleiben erhalten. Gespeichertes `available:false` bleibt nach einem Neustart erhalten und kann erst durch einen wieder gemeldeten verwendbaren Eintrag aufgehoben werden. Fehlt der JSON-Katalog, erhalten sowohl eine gespeicherte Teilseite beim Start als auch eine spätere Live-Teilseite den bekannten Bestand aus den verwalteten Objekten.

## Reaktionsfähigkeit und Grenzen

Die Objektaufbereitung läuft außerhalb der TV-Befehlswarteschlange. Ein Integrationstest hält gleichzeitig zwei Objektzugriffe an und weist nach, dass `remote.home` währenddessen erfolgreich ausgeführt wird. Der Test verarbeitet **372 synthetische Dienste mit realistisch langen Kennungen und Locators**. Sein persistierter Katalog umfasst **297.269 Bytes** bei einer Grenze von **491.520 Bytes (480 KiB)**. Streaming- und Vorschaubild-URLs werden im Katalog nicht zusätzlich dupliziert; die bisherigen Rohdatenpunkte bleiben erhalten.

Der Senderworker verwendet höchstens zwei parallele Datenbankoperationen. Ein Datenbankfehler stoppt den laufenden Durchgang; ein erneuter Senderabruf kann ihn wiederholen. Nach `stop()` beginnen keine weiteren dynamischen Datenbankzugriffe. Bereits an die Datenbank übergebene Operationen lassen sich nicht zurückholen.

Weitere Grenzen sind 20 wartende Senderseiten, 2.000 verwaltete Senderobjekte je Instanz, 10.000 Referenzen und 1.000 gespeicherte Seiten im Katalog. Überschreitungen werden als Fehler gemeldet; Daten werden nicht still abgeschnitten. Die vorhandenen Datenbank-Zeitlimits gelten auch für die Senderaufbereitung.

## EPG und offene Gerätetests

Jeder Sender hat einen eigenen `epg`-Unterordner mit **`epg.status="notImplemented"`**. Es werden keine Ereignislisten oder erfolgreichen EPG-Abfragen vorgetäuscht. Der geplante Ausbau steht in der [Roadmap](ROADMAP.md).

Die neuen Sendertaster müssen noch am bild 7.55 geprüft werden. Ebenso liegt weiterhin keine Bestätigung vor, dass der Einschaltablauf aus 0.1.2 das gemeldete Standby-Problem behebt. Die [README](../README.md) enthält die Updateanleitung und die getrennten Diagnosewerte für Senderabfrage, Objektaufbereitung und Einschalten.
