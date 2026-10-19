# Prüfbericht 0.1.24: XMLTV-Zuordnung wieder laden

Stand: **19. Oktober 2026**. Build: **`0.1.24-xmltv-mapping.1`**.

## Gemeldeter Fehler und Ursache

Gemeldet wurde die wiederkehrende Meldung **„XMLTV: Jede Senderzuordnung benötigt channel und xmltvId.“**. Ausgangspunkt ist der veröffentlichte [0.1.23-Stand `00d7bdd`](https://github.com/SvenM74/ioBroker.loewe-tv/commit/00d7bddccb5a66c6cac0b67327b6ea7d45b29018).

Die bisherige Prüfung verlangte bei jeder Tabellenzeile beide Eigenschaften, bevor sie zwischen automatischer, manueller und deaktivierter Zuordnung unterschied. Eine Zeile mit gültiger TV-Kennung, aber ausgelassenem `xmltvId`, wies daher die ganze Tabelle ab. Dasselbe galt für vollständig leere Altzeilen. Der Fehler trat beim Einlesen gespeicherter Einstellungen, beim Wiederladen der TV-Zeilen und bei der Quellenvorschau auf. Eine ungültige optionale Zuordnung konnte dadurch auch den XMLTV-Abruf verhindern.

Ein passender Auslöser ist mit dem ursprünglichen Admin-Auswahlfeld reproduziert: Dessen `onInputChange` liest `e.target.value`. Ein Ereignistarget ohne `value` ergibt `undefined`; beim JSON-Versand verschwindet anschließend die Eigenschaft `xmltvId`. Die neue Regression verwendet diesen Originalcallback, die echte Tabellenverzögerung, die ausgelieferte Nachrichten-Vorlage und den Adapterparser. Mit dem veröffentlichten alten Validator scheitern alle drei Modi genau mit der Nutzermeldung. Mit der Korrektur bestehen dieselben Fälle.

Quelle ist die gepinnte [Admin-JSONConfig-Komponente](https://github.com/ioBroker/json-config/blob/fd30206954a5c29c6093340b02aaae0993bbf11c/src/JsonConfigComponent/ConfigAutocompleteSendTo.tsx), Blob `247640ecae3f87a0bd9819083bbdba1d54679c10`. Die [Fixture-Dokumentation](../test/fixtures/admin-json-config/README.md) beschreibt Herkunft und Ausführung. Das Ausblenden eines Feldes allein entfernt seinen gespeicherten Wert nicht. Die konkrete gespeicherte Konfiguration und das auslösende Browserereignis des Nutzers lagen nicht vor.

## Korrektur

`normalizeMappingRows()` normalisiert jetzt Tabellenentwürfe und gespeicherte Einstellungen nach denselben Regeln. `normalizeManualMappings()` und `buildMappingRows()` verwenden diese gemeinsame Verarbeitung.

| Eingabe | Verhalten ab 0.1.24 |
|---|---|
| Automatischer Sender mit fehlender, `null` oder leerer Auswahl | Bleibt automatisch; passende Quellenzuordnung wird wie bisher berechnet. |
| Deaktivierter Sender ohne XMLTV-ID | Bleibt ausdrücklich deaktiviert. |
| Manueller Sender ohne XMLTV-ID | Bleibt manueller Entwurf mit leerer Auswahl. Die Tabelle fordert zur Auswahl auf; kein automatischer Ersatz. |
| Alte Zweispaltenzeile nur mit `channel` | Wird als unfertige manuelle Auswahl erhalten. |
| Alte Zweispaltenzeile mit ausdrücklich leerem `xmltvId` | Die bisherige Deaktivierung bleibt bestehen. |
| Vollständig leere Formularzeile | Wird ignoriert. |
| Gültige bisherige Korrektur, auch für einen derzeit fehlenden TV-Sender | Senderkennung und manuelle Auswahl bleiben erhalten. |
| XMLTV-ID oder bedeutungstragender Anzeigetext ohne TV-Kennung | Verständlicher Fehler mit ursprünglicher Zeilennummer; keine Zuordnung aus Name oder Zeilenposition. |

Die Normalisierung verändert das Eingabeobjekt nicht. Typ-, Zeichen-, Größen- und Eindeutigkeitsprüfungen bleiben bestehen. Fremde TV-Pfade und unbekannte Felder werden weiter zurückgewiesen. Das ältere Objektformat mit TV-Kennungen als Schlüsseln bleibt strikt. Eine fehlerhafte Anfrage liefert keine ersetzende Tabelle und überschreibt keine bestehenden Einstellungen.

Die Produktionsänderung betrifft die XMLTV-Normalisierung und die Aufbereitung der Konfigurationszeilen. Admin-Mindestversion **7.7.28**, Logo-Verzeichnis, Senderidentitäten, Web-/Cloud-Zugänge, Fernbedienung und Aufnahmeprotokoll bleiben erhalten.

## Automatisierte Prüfung

Finaler lokaler Lauf mit Node.js **24.19.0**: **888 Tests, 888 bestanden, 0 fehlgeschlagen, 0 übersprungen**. Der vorherige veröffentlichte Stand enthielt 874 Tests. `npm run check` bestätigt Paketmetadaten, Admin-Übersetzungen, Objektdefinitionen, Protokollverträge und JavaScript-Syntax.

| Prüfbereich | Nachweis |
|---|---|
| Originales Auswahlfeld | Originalcallbacks für Leeren und Auswählen, Tabellenpuffer, Nachrichten-JSON, Antwortübernahme, Speichern und erneutes Öffnen. |
| Gespeicherte unvollständige Zeilen | Tatsächlicher Adapterstart und Admin-Nachrichtenweg; fehlende IDs und leere Zeilen verhindern das Wiederladen nicht. |
| Neustart | Reparierte Tabellen bleiben nach einem erneuten Start verwendbar. Manuelle und deaktivierte Entscheidungen bleiben erhalten. |
| TV ausgeschaltet | Explizite Quellenvorschau und anschließender regulärer Abgleich durchlaufen den echten XMLTV-Parser mit synthetischem Feed. Vorhandene manuelle Zuordnungen liefern weiterhin Programme. |
| Unfertige manuelle Auswahl | Keine fremden oder automatischen Programme; andere gültige Sender bleiben nutzbar. |
| Vorschau | Nur der angeforderte Quellenabruf findet statt; laufende Konfiguration, Datenbank, Programmdaten und TV-Steuerung bleiben unverändert. |
| Echte Fehler | Fehlende TV-Identität, doppelte Kennungen und ungültige Felder bleiben Fehler; Zeilennummern berücksichtigen davor übersprungene Leerzeilen. |
| Bestandsverhalten | Alle bisherigen Tests für XMLTV, EPG, Senderlogos, Fernbedienung, Aufnahmen und getrennte Web-/Cloud-Instanzen bestehen weiter. |

Ein unabhängiges Review prüfte zusätzlich eingefrorene Eingaben, Objekte ohne Prototyp, wiederholte Normalisierung, alte Deaktivierungen, vorübergehend fehlende Sender und die spätere erneute manuelle Verwendung einer gespeicherten ID. Es ergab keinen blockierenden Befund.

## Paketprüfung und Update

Das Installationspaket wird mit `npm pack` erzeugt. Die geänderten enthaltenen Dateien werden byteweise gegen den geprüften Arbeitsstand verglichen; die Git-Veröffentlichung verwendet denselben vollständigen Dateibaum. Die CI führt die Tests mit Node.js 22 und 24 aus. Der tatsächliche Veröffentlichungs- und CI-Status ist in [GitHub Actions](https://github.com/SvenM74/ioBroker.loewe-tv/actions) sichtbar.

Nach dem Update beide TV-Instanzen starten und deren `info.adapterBuild` auf **`0.1.24-xmltv-mapping.1`** prüfen. Die Instanzkonfiguration neu öffnen, unter **EPG-Einstellungen** **TV-Senderliste laden**, anschließend **Quelle laden und Zuordnung prüfen** ausführen. Noch leere manuelle Auswahlen vervollständigen oder bewusst auf **Automatisch** beziehungsweise **Deaktiviert** setzen. Danach speichern. Die XMLTV-Adresse und gültige Zuordnungen müssen nicht neu angelegt werden. [Updateanleitung](INSTALLATION.md#update-auf-0124).

## Grenzen

Es wurde kein realer Fernseher und keine laufende ioBroker-Installation des Nutzers erreicht. Die Tests verwenden synthetische Sender, Feeds und Datenbankeinträge. Sie belegen die Korrektur des nachgestellten Konfigurationsfehlers, nicht die Erreichbarkeit oder Senderabdeckung einer konkreten XMLTV-Quelle. Eine tatsächlich verlorene gewünschte manuelle ID kann aus einer leeren Auswahl nicht rekonstruiert werden; sie muss im Formular erneut gewählt werden.
