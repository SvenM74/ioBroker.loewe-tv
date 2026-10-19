# Roadmap: EPG auswerten und Aufnahmen mit ioBroker steuern

## Aktueller Stand

**Version 0.1.13, Build `0.1.13-recording-status.1`**, zeigt vom Fernseher beantwortete Aufnahmeaufträge als **An TV übertragen** und trennt diesen Nachweis vom noch offenen Timerabgleich. Die Diagnose ist aufklappbar. Die Korrekturen an Timer-Textmetadaten und Verbindungsstatus aus 0.1.12 bleiben enthalten. Die automatische Suche nach Sendungen anhand eigener Regeln bleibt das nächste Ausbauziel.

| Baustein | Implementierter Stand |
|---|---|
| TV finden und konfigurieren | Netzwerksuche bietet gefundene Loewe-Adressen an. Jede Instanz verwendet den gespeicherten TV und eine ausgewählte Senderliste. [Netzwerksuche](NETWORK_DISCOVERY.md). |
| Senderbestand | Ausschließlich TV-Dienste unter `channels.tv`, mit Namens-ID und nachgeführter Position. Mehrere Plätze desselben Dienstes teilen sich einen Ordner. |
| TV-EPG | Abruf ausschließlich vom Fernseher; aktuelle und nächste Sendung unter jedem TV-Sender, weitere gelieferte Vorschauen im Cache. [EPG](EPG.md). |
| Oberfläche | Getrennte Reiter **EPG-Einstellungen** und **Programmübersicht**, Zeitachse und Sendungsdetails. **Separat öffnen** verwendet die bestehende Admin-Adresse samt Anmeldung, ohne eigenen Port. |
| Laufende Sendung ansehen | **Jetzt ansehen** sendet nur für eine aktuell eindeutig laufende Sendung. Die Gültigkeit wird direkt vor dem TV-Befehl erneut geprüft. |
| Aufnahme vormerken | Zukünftige Sendung mit vollständigen, eindeutigen Zeiten auswählen und den Dialog bestätigen. Der Auftrag wird dauerhaft in `recordings.jobs` gespeichert. |
| Offline-Übergabe | Aufträge warten auf einen erreichbaren TV. Kein Wake-on-LAN und kein Einschaltbefehl. Nur vor Sendungsbeginn darf ein neuer Timer übertragen werden. |
| Timer abgleichen | `GetTimerList` wird mit Senderkennung und exakten Zeiten abgeglichen. Nur ein eindeutig passender Timer führt zu `scheduled`. Unbekannte Formate bleiben unbestätigt. |

Die [Bedienungsanleitung zur Programmübersicht](EPG_GUI.md) beschreibt Dialoge, Zustände und die separate URL. Für eine gewöhnliche Admin-Installation lautet die URL beispielsweise `http://IOBROKER-HOST:8081/adapter/loewe-tv/epg.html?instance=0`; der Button übernimmt die tatsächlich verwendete Adresse einschließlich HTTPS, Proxy-Pfad und Instanznummer.

## Was am Gerät bereits bestätigt ist

Der Nutzer hat den direkten TV-EPG-Abruf mit dem früheren 0.1.8-Stand auf **Loewe bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** bestätigt. Die [Kompatibilitätsübersicht](COMPATIBILITY.md) dokumentiert die bisherigen Rückmeldungen. Daraus folgt keine Bestätigung jeder EPG-Spalte, sämtlicher Sender oder der neuen Aufnahmefunktion.

Am **19. Oktober 2026** bestätigt der Nutzer zwei erfolgreich am Fernseher angekommene Aufnahmeaufträge und den Start der ersten Aufnahme. Der Abschluss der Aufnahmen ist noch nicht dokumentiert. **Die originale XML-Timerantwort des betroffenen Fernsehers liegt noch nicht vor.** Der implementierte `ProgramTimer`-Aufruf und die bekannten Timerlistenfelder stammen aus der Original-App. Die [Aufnahme-Protokollnotizen](recording-protocol.md) halten die Fundstellen und Grenzen fest. Die EPG-Grundlage und zusätzliche Feldquellen sind in [epg-protocol.md](epg-protocol.md) beschrieben. Frühere Prüfberichte bleiben historische Nachweise für ihren jeweiligen Build.

## Verhalten der Aufnahmeaufträge seit 0.1.11

Der Adapter bestätigt eine Vormerkung erst nach dem Speichern des Journals. Bei Offline-TV bleibt ein ungesendeter Auftrag `queued`. Er wird weiterbearbeitet, sobald die Steuerschnittstelle erreichbar ist. Dieser Ablauf gilt auch bei deaktivierten regulären Status-, Sender- oder EPG-Abrufintervallen. Ein noch ungesendeter Auftrag wird nach Erreichen seiner Startzeit `missed` und nicht verspätet übertragen.

Eine möglicherweise wirksame Übergabe wird höchstens einmal versucht. Bei unklarem Versand oder einem Neustart während der Übergabe bleibt der Auftrag `uncertain`; ein späterer Timerlistenabgleich kann ihn bestätigen. Eine gespeicherte TV-Antwort führt in der Oberfläche bereits zur Anzeige **An TV übertragen**, ohne den Journalstatus zu ändern. Ein sicher noch nicht gesendeter Auftrag darf weiter warten. Eine bloße SOAP-Antwort, einschließlich `Result=0`, belegt keinen gespeicherten Timer. **`scheduled` bedeutet Timer im TV nachgewiesen, nicht Aufnahme erfolgreich abgeschlossen.**

Die Vormerkung behält den ursprünglichen TV-, Sender- und Sendungsbezug. Eine Änderung der TV-Adresse oder des Steuerports überträgt alte Aufträge nicht auf das neue Ziel. Ungesendete Vormerkungen können in der Oberfläche entfernt werden. Bereits übertragene oder unklare Timer müssen am Fernseher geprüft werden. Gespeicherte Aufträge werden bei EPG-Änderungen nicht automatisch verschoben.

## Nächste überprüfbare Schritte

| Schritt | Benötigtes Ergebnis |
|---|---|
| Automatische Timerbestätigung am Nutzergerät prüfen | Nach den bestätigten Übertragungen die echte `GetTimerList`-Antwort auswerten und Sender, Beginn, Ende sowie Aufnahmeziel am TV vergleichen. Unbekannte Felder nicht raten. |
| Standby und Aufnahmeabschluss prüfen | Nach dem bestätigten ersten Aufnahmestart den erfolgreichen Abschluss sowie die Ausführung gespeicherter Timer aus Standby separat prüfen. Fehlende Erreichbarkeit ohne Schnellstart bleibt eine Grenze für neue Übertragungen. |
| Automatische Suchregeln | Sendungen nach Titel, Sender oder weiteren gelieferten Merkmalen auswählen; zunächst eine nachvollziehbare Planungsvorschau, anschließend ausdrücklich aktivierbare Regeln. |
| Vor- und Nachlauf | Zusätzliche Zeit vor und nach einer Sendung anbieten und die daraus entstehenden Grenzen sowie Überschneidungen prüfen. Im aktuellen Build werden die ausgewählten Sendungszeiten verwendet. |
| Geänderte Sendezeiten | Abweichungen zwischen gespeicherter Vormerkung und neuem EPG erkennen. Änderungen am TV erst automatisieren, wenn Ändern oder Löschen bestehender Timer belegt ist. |
| Timer ändern oder löschen | Einen am Gerät bestätigten Steuerweg finden. Das lokale Entfernen einer ungesendeten Vormerkung ersetzt keine TV-Timerlöschung. |
| Konflikte und Aufnahmeergebnis | Gerätespezifische Rückmeldungen und gegebenenfalls das DR+-Archiv auswerten. Weder eine feste Tunerzahl noch eine erfolgreich ausgeführte Aufnahme aus dem Timerstatus ableiten. |

Regeln, Vor-/Nachlauf, frei wählbare Aufnahmeziele, automatische Verschiebungen, TV-Timerlöschung und eine Erfolgskontrolle abgeschlossener Aufnahmen sind **noch nicht implementiert**. Es werden dafür keine vorbereitenden `recording.*`-Datenpunkte angelegt. Der bestehende lesbare Datenpunkt heißt **`recordings.jobs`**.

Radiosteuerung bleibt zurückgestellt. `channels.radio`, `api` und `media` sind weiterhin aus dem Funktionsumfang entfernt. Für Radio wäre vor einer Wiederaufnahme ein eigener, am TV bestätigter Umschaltweg erforderlich.
