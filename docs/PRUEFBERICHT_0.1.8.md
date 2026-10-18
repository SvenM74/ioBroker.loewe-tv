# Prüfbericht: Konfiguration und TV-EPG in Version 0.1.8

Stand: **18. Oktober 2026 (UTC)**. Build: **`0.1.8-epg-config-fix.1`**.

**Historischer Bericht zu einem früheren 0.1.8-Build.** Der aktuelle Stand `0.1.8-tv-epg-only.1` entfernt die alternative EPG-Quelle und überflüssige Datenpunkte. Seine Änderungen und Prüfergebnisse stehen im [neuen Prüfbericht](PRUEFBERICHT_0.1.8_TV_EPG.md). Die folgenden damaligen Ergebnisse und Updatehinweise bleiben zur Nachvollziehbarkeit erhalten; für die aktuelle Installation gilt die [Installationsanleitung](INSTALLATION.md#update-auf-018).

## Nachtrag vom 18. Oktober 2026: TV-EPG bestätigt

Nach Bereitstellung von **0.1.8** hat der Nutzer den erfolgreichen direkten EPG-Abruf vom Fernseher für folgende Geräte bestätigt:

| TV-Modell | Chassis | Software | Nutzerrückmeldung |
|---|---|---|---|
| Loewe bild 7.55 | SL420 | V5.4.6.0 | Direkter TV-EPG-Abruf erfolgreich |
| Loewe bild 5.32 | SL310F | V5.4.6.0 | Direkter TV-EPG-Abruf erfolgreich |

Diese Rückmeldung ergänzt den ursprünglichen Prüfstand um die Gerätebestätigung. Sie enthält keine EPG-Rohantwort und erlaubt keine Zuordnung des Erfolgs zu einer einzelnen Korrektur. Die vollständige Abdeckung aller Sender, Zeiträume und EPG-Felder sowie Einschaltablauf, Aufnahmetimer und tatsächliche Aufnahmen sind damit nicht nachgewiesen. Die [Kompatibilitätsübersicht](COMPATIBILITY.md) dokumentiert den aktuellen Stand.

**Die folgenden Abschnitte geben den ursprünglichen Veröffentlichungsstand vor dieser Nutzerrückmeldung wieder.** Aussagen zur damals noch fehlenden EPG-Bestätigung und die Ergebnisse des ursprünglichen automatisierten Testlaufs bleiben als historische Dokumentation erhalten.

## Ergebnis (ursprünglicher Veröffentlichungsstand)

Der Nutzer meldet seit 0.1.7 gesperrte Speichern-Tasten in der Adapter-Konfiguration und ausbleibende TV-EPG-Daten. Der Formularfehler wurde mit der tatsächlichen Auswertungsweise von ioBroker Admin reproduziert und korrigiert. Zusätzlich wurden eine dauerhaft blockierende EPG-Initialisierung nach einem Datenbankfehler und Abweichungen vom dokumentierten TV-Iteratorablauf bearbeitet.

**423 automatisierte Tests bestehen. Der erfolgreiche TV-EPG-Abruf am Loewe bild 7.55, Chassis SL420, Software V5.4.6.0 ist weiterhin nicht bestätigt.** Es besteht kein Zugriff auf die ioBroker-Installation oder den Fernseher des Nutzers. Für die konkrete fehlgeschlagene EPG-Abfrage aus 0.1.7 liegt noch keine Geräteantwort vor. Die Protokollkorrektur und der neue Diagnosebefund ermöglichen den nächsten gezielten Gerätetest.

| Befund | Nachweis | Änderung in 0.1.8 |
|---|---|---|
| Leere optionale XMLTV-Adresse blockiert das Speichern | Reproduktion mit dem von Admin verwendeten Funktionskörper, Ergebnis des alten Prüfausdrucks ist `undefined` | Explizite äußere Rückgabe; leere Adresse bleibt gültig |
| Neue EPG-Felder fehlen in älteren Instanzen | Validierung vor, während und nach dem Einsetzen der Standardwerte geprüft | Fehlende Werte werden wie die dokumentierten Standardwerte behandelt |
| Einzelner Cache-/Datenbankfehler hält die EPG-Initialisierung im Fehlerzustand | Test mit gezielt einmalig fehlschlagender Datenbankoperation; vorher keine TV-Abfragen bei späterem Refresh | Initialisierung beim nächsten Refresh erneut ausführen; bei automatischem Betrieb 30 Sekunden Abstand nach Initialisierungsfehlern |
| Zeitvergleich lag in den Tabellenfiltern | Vergleich mit Herstellerbeschreibung und Beispiel in §9.22 | DVB-Filter in `Selections`, zeitliche Positionierung in `SeekToContentParameters` |
| Erste EPG-Seite musste bei 0 beginnen | Dokumentierte Antwort enthält einen absoluten Startindex von 41; zusätzlicher simulierter Abruf prüft andere Startindizes | Ersten absoluten Antwortindex übernehmen; Folgeseiten exakt anhand dieses Index fortsetzen |
| Letzter TV-Abruf war nach einem XMLTV-Ersatz nicht mehr erkennbar | Tests für leere Antworten, Schemafehler, übersprungene Sender und erfolgreichen XMLTV-Ersatz | Begrenzten Befund in `epg.data.tvDiagnostic` veröffentlichen |

## Warum die Speichern-Tasten blockiert waren

ioBroker Admin führt den als Zeichenkette hinterlegten Prüfausdruck als Funktionskörper aus. Enthält er bereits das Wort `return`, ergänzt Admin keine eigene äußere Rückgabe. Diese Logik steht in [`ConfigGeneric.execute` des mindestens unterstützten Admin 7.0.23](https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigGeneric.tsx); sie wurde auch in der [aktuellen ausgelagerten JSON-Konfiguration](https://github.com/ioBroker/json-config/blob/6e910b3c71a3f884014992f92151a1ae223ef4c7/src/JsonConfigComponent/ConfigGeneric.tsx) geprüft.

Der URL-Prüfausdruck aus 0.1.7 enthielt `return` in einer verschachtelten Funktion. Der äußere Ausdruck hatte dadurch in Admin keine Rückgabe. Auch eine leere, eigentlich zulässige URL ergab `undefined`. Mit `validatorNoSaveOnError=true` blockiert das die Speicherfunktion. Das konnte auch bei deaktiviertem XMLTV-Feld auftreten.

0.1.8 verwendet einen ausdrücklich zurückgebenden Funktionskörper. Die neue Prüfung bildet Admin-Auswertung, vollständige Formulardaten und den abweichenden Datenbereich einzelner Tabellenzeilen nach. Sie prüft außerdem das schrittweise Ergänzen fehlender EPG-Felder bei älteren Instanzen. Ungültige URLs, doppelte oder unvollständige Zuordnungen und ungültige Intervalle werden weiterhin abgelehnt.

Die bisherigen Tests in 0.1.7 werteten den Validator direkt als JavaScript-Ausdruck aus. Damit übersahen sie diesen Unterschied. Der damalige bestandene Testlauf war deshalb kein Nachweis für funktionierende Speichern-Tasten. Die neuen Tests korrigieren diese konkrete Lücke; ein vollständiger Browsertest mit laufendem ioBroker Admin wurde hier nicht ausgeführt.

## TV-Abfrage: dokumentierter Ablauf und verbleibende Annahmen

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf), §9.22.1, beschreibt EPG-Abfragen über `CreateIterator` auf `de.loewe.sl2.epg`. Das Beispiel filtert die Tabelle nach SID, TSID und ONID. Die zeitliche Positionierung steht gesondert in `SeekToContentParameters` mit Feld 2007, Bedingung 5 sowie `Which=0`, `Offset=0` und `WindowSize=0`.

Der Adapter setzt diesen Aufbau jetzt für die erste Seite ein. Weitere Seiten werden mit dem tatsächlichen Antwortindex plus der tatsächlich zurückgegebenen Zeilenanzahl angefordert. Für diese Folgeseiten erfolgt kein erneuter Seek; ihre Antwortindizes müssen genau passen. Die Begrenzung auf vier erfolgreiche Seiten, 256 Zeilen und 30 Sekunden einschließlich Warteschlange und optionalem Schemawechsel bleibt bestehen.

**Die Herstelleranfrage beginnt bereits bei `Range startIndex="41"`; auch die Beispielantwort beginnt bei 41.** Der zusätzliche Test einer ersten Anfrage mit Range 0 und Seek, auf die ein anderer absoluter Index folgt, ist eine aus der beschriebenen Positionierung abgeleitete Simulation. Er ist keine aufgezeichnete SL420-Antwort. Der Adapter verwendet weiterhin eine Sortierung nach Startzeit, Seiten mit bis zu 64 Einträgen und zunächst die erweiterten Felder. Das ist vom wörtlichen Herstellerbeispiel zu unterscheiden.

Das dokumentierte Grundschema mit fünf Spalten bleibt der begrenzte Rückfall bei einer erkannten Ablehnung zusätzlicher Felder. Ein beliebiger numerischer TV-Fehler wird nicht als Beweis für ein anderes Schema interpretiert. Fehlende TV-Endzeiten werden nicht erfunden. Daher kann eine Antwort Titel und nächste Startzeiten liefern, ohne dass die aktuell laufende Sendung eindeutig bestimmbar ist. Quellen, Feldnummern und genaue Grenzen stehen in [epg-protocol.md](epg-protocol.md).

## Wiederanlauf und Diagnose

Eine fehlgeschlagene Cache-Leseoperation oder erste Datenveröffentlichung kann die EPG-Initialisierung künftig nicht dauerhaft an denselben abgelehnten Promise binden. Ein manueller Refresh versucht sie erneut. Bei aktiviertem automatischem Abruf wird nach einem Initialisierungsfehler nach 30 Sekunden erneut versucht. Bei Intervall 0 bleibt der Abruf manuell. Nach dem Beenden entstehen keine weiteren Timer.

`epg.data.tvDiagnostic` enthält den letzten Versuch für den jeweiligen Sender. Vor einem TV-Versuch ist der Wert `null`; danach enthält er Zeitpunkt und einen der Zustände:

- `received`: auswertbare Antwort, gegebenenfalls auch mit null Programmzeilen;
- `error`: eigener TV-Versuch fehlgeschlagen, mit Fehlercode und verfügbaren Strukturangaben;
- `skipped`: für diesen Sender erfolgte keine TV-Abfrage, etwa weil ein vorheriger Fehler den TV-Teil des laufenden Durchlaufs angehalten hat.

Die Details enthalten Schema, DVB-Kennung, angeforderte Feldnummern und Seiten-/Zeilenzähler. Beliebige Rohantworten, Client-IDs, URLs und Sendungstitel werden nicht in diese Zusatzdiagnose kopiert. Die Details sind auf 8 KiB begrenzt. Ein erfolgreicher XMLTV-Ersatz erhält den vorherigen TV-Fehlerbefund. Ein anderer Senderdienst unter derselben Ordner-ID verwirft den alten Befund.

`received` ist kein Nachweis für verfügbare aktuelle und nächste Programme. Maßgeblich bleiben `epg.now.available`, `epg.next.available`, `epg.status` und die Zeitangaben.

## Prüfungen

Der vollständige lokale Lauf ist in [TESTERGEBNIS_0.1.8.tap](TESTERGEBNIS_0.1.8.tap) enthalten.

| Prüfung | Ergebnis |
|---|---|
| Vollständiger Testlauf unter Node.js 24 | **423 bestanden**, 0 fehlgeschlagen, 0 abgebrochen, 0 übersprungen; 4,11 Sekunden |
| Admin-Konfiguration | 19 Tests, einschließlich tatsächlicher Funktionskörperauswertung und älterer Instanzen |
| Loewe-EPG-Protokoll | 43 Tests, einschließlich Herstellerantwort, absolutem Paging und Diagnosefilterung |
| EPG-Ablauf mit tatsächlicher Runtime-Warteschlange | 37 Tests mit simulierten Quellen, Datenbank und Uhr, einschließlich Wiederinitialisierung und Quellenersatz |
| Paketprüfung | `node scripts/check-package.js` erfolgreich: Syntax, Versionskonsistenz, native Einstellungen, Übersetzungen, Objektdefinitionen und Protokollbelege |
| Bestehender Funktionsumfang | 107 statische Objektdefinitionen, 42 Fernbedienungstaster und je TV-Sender 23 EPG-Zustände mit 3 EPG-Ordnern; bestehende Senderlisten-, TV-Auswahl-, Lösch- und Transporttests bestehen |

Die GitHub-Workflowdefinition prüft Paket und vollständige Tests unter Node.js 22 und 24. Die konkrete Ausführung ist unter [Actions](https://github.com/SvenM74/ioBroker.loewe-tv/actions) sichtbar. Reproduktion im Projektverzeichnis:

```bash
npm install
npm test
npm run check
npm pack
```

## Update und Gerätetest

Das Paket heißt **`iobroker.loewe-tv-0.1.8.tgz`**. Nach der [damaligen Updateanleitung](https://github.com/SvenM74/ioBroker.loewe-tv/blob/99b074b58a5e365ce2f75760e976b8247a58f129/README.md#update-auf-018) die Admin-Seite vollständig neu laden und die Konfiguration erneut öffnen. Die bestehende Instanz und ihre Senderlistenauswahl weiterverwenden. `info.adapterBuild` muss **`0.1.8-epg-config-fix.1`** anzeigen.

Für den TV-Test EPG aktivieren, Quelle **Nur TV** wählen, die optionale XMLTV-Adresse leer lassen und speichern. Den Fernseher einschalten und `channels.epgRefresh=true` mit `ack: false` auslösen. Anschließend den Abschluss über `channels.epgProgress` und `channels.epgStatus` beobachten. Aktuelle und nächste Sendung an zwei bekannten Sendern mit der TV-Anzeige vergleichen.

Bleiben die Programmfelder leer, genügt für die nächste Diagnose zunächst `epg.data` eines betroffenen Senders zusammen mit `channels.epgLastError` und `channels.epgProgress`. Dafür ist kein erneuter Export der gesamten Senderliste erforderlich. Die Bedienung und alle Diagnosefelder beschreibt [EPG.md](EPG.md).
