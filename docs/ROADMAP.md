# Roadmap: EPG auswerten und Aufnahmen mit ioBroker steuern

## Aktueller Stand

**Version 0.1.18, Build `0.1.18-epg-offline.1`**, ergänzt die TV-Vorschau wieder um eine selbst konfigurierte XMLTV-Quelle. Automatische Senderzuordnung, anpassbare Vorschläge und getrennt gespeicherte Quellcaches ermöglichen frische Programmdaten auch bei ausgeschaltetem TV. Manuelle und XMLTV-Senderbilder ergänzen jetzt 17 mitgelieferte Logos. Erste Fernbedienungstests über Remote sowie die Übertragung wartender Aufträge nach dem Einschalten sind vom Nutzer bestätigt. Die direkte Timerübertragung im Schnellstart-Standby und die neue XMLTV-Konfiguration benötigen noch Gerätetests.

Die automatisch erzeugten Links an Instanzen und im Admin-Schnellzugriff können durch den Admin-8-Resolver falsch umgeschrieben werden. Dieser Fehler wird nicht durch das Adapterupdate behoben. Die [Linkanalyse](ADMIN_LINKS.md) beschreibt direkte Admin-Adressen, eigene Schnellzugriffskacheln und vorbereitete Korrekturvorschläge für Admin. Die bestehenden Web-/Cloud-Routen je TV bleiben erhalten.

| Baustein | Implementierter Stand |
|---|---|
| TV finden und konfigurieren | Netzwerksuche bietet gefundene Loewe-Adressen an. Jede Instanz verwendet den gespeicherten TV und eine ausgewählte Senderliste. [Netzwerksuche](NETWORK_DISCOVERY.md). |
| Senderbestand | Ausschließlich TV-Dienste unter `channels.tv`, mit Namens-ID und nachgeführter Position. Mehrere Plätze desselben Dienstes teilen sich einen Ordner. |
| EPG | TV, XMLTV oder TV mit XMLTV-Ergänzung; aktuelle und nächste Sendung unter jedem TV-Sender sowie weitere gelieferte Vorschauen im Cache. [EPG](EPG.md), [XMLTV und Senderzuordnung](EPG_XMLTV.md). |
| Oberfläche | Senderlogos, Zeitachse und kompakte Sendungsauswahl mit aufklappbarer Beschreibung. Aktionen und EPG-Aktualisierung stehen zwischen Stundenauswahl und Suche. |
| Zugriff | Direkter Admin-Pfad und eigene Schnellzugriffskacheln; automatische Admin-Links sind versionsabhängig betroffen. Optional eine vorhandene ioBroker.web-Instanz mit integrierter Socket-Verbindung auswählen; eigener TV-Instanzpfad und Web-/Cloud-Schnellzugriff. |
| Fernbedienung | Seit 0.1.17 eigener Dialog mit belegten TV-Befehlen über dieselbe Admin-, Web- oder Cloud-Verbindung. Erste kleine Remote-Tests vom Nutzer bestätigt. [Tasten und Grenzen](REMOTE_CONTROL.md). |
| Laufende Sendung ansehen | **Jetzt ansehen** sendet nur für eine aktuell eindeutig laufende Sendung. Die Gültigkeit wird direkt vor dem TV-Befehl erneut geprüft. |
| Aufnahme vormerken | Zukünftige Sendung mit vollständigen, eindeutigen Zeiten auswählen und den Dialog bestätigen. Der Auftrag wird dauerhaft in `recordings.jobs` gespeichert. |
| Offline-Übergabe | Aufträge warten auf einen erreichbaren TV. Kein Wake-on-LAN und kein Einschaltbefehl. Nur vor Sendungsbeginn darf ein neuer Timer übertragen werden. |
| Timer abgleichen | `GetTimerList` wird mit Senderkennung und exakten Zeiten abgeglichen. Nur ein eindeutig passender Timer führt zu `scheduled`. Unbekannte Formate bleiben unbestätigt. |

Die [Bedienungsanleitung zur Programmübersicht](EPG_GUI.md) beschreibt Dialoge, Zustände, Senderbilder und beide Zugangswege. Die [Logoquellen](CHANNEL_LOGOS.md) führen den geprüften Nutzungsstatus jedes mitgelieferten Bildes auf.

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
| XMLTV am Nutzergerät prüfen | Tatsächliche Feedadresse laden, automatische Zuordnungen und Vorschläge für beide TV-Listen prüfen und nötige Ausnahmen speichern. Programme bei TV aus sowie nach Adapterneustart vergleichen. |
| Admin-Linkfehler zuordnen | Installierte Admin-Version und fehlerhafte Zieladresse gegen die reproduzierten Resolverfälle prüfen. Eigene Direktzugriffskacheln bis zu einem passenden Admin-Fix verwenden. |
| Automatische Timerbestätigung am Nutzergerät prüfen | Nach den bestätigten Übertragungen die echte `GetTimerList`-Antwort auswerten und Sender, Beginn, Ende sowie Aufnahmeziel am TV vergleichen. Unbekannte Felder nicht raten. |
| Schnellstart und Aufnahmeabschluss prüfen | Bei aktivem Schnellstart und ausgeschaltetem Bildschirm einen zukünftigen Auftrag vormerken und kontrollieren, ob der Timer bereits ohne Einschalten übertragen wird. Die Übertragung nach dem Einschalten ist bestätigt; der erfolgreiche Aufnahmeabschluss und die Ausführung aus Standby sind separat zu prüfen. |
| Automatische Suchregeln | Sendungen nach Titel, Sender oder weiteren gelieferten Merkmalen auswählen; zunächst eine nachvollziehbare Planungsvorschau, anschließend ausdrücklich aktivierbare Regeln. |
| Vor- und Nachlauf | Zusätzliche Zeit vor und nach einer Sendung anbieten und die daraus entstehenden Grenzen sowie Überschneidungen prüfen. Im aktuellen Build werden die ausgewählten Sendungszeiten verwendet. |
| Geänderte Sendezeiten | Abweichungen zwischen gespeicherter Vormerkung und neuem EPG erkennen. Änderungen am TV erst automatisieren, wenn Ändern oder Löschen bestehender Timer belegt ist. |
| Timer ändern oder löschen | Einen am Gerät bestätigten Steuerweg finden. Das lokale Entfernen einer ungesendeten Vormerkung ersetzt keine TV-Timerlöschung. |
| Konflikte und Aufnahmeergebnis | Gerätespezifische Rückmeldungen und gegebenenfalls das DR+-Archiv auswerten. Weder eine feste Tunerzahl noch eine erfolgreich ausgeführte Aufnahme aus dem Timerstatus ableiten. |

Regeln, Vor-/Nachlauf, frei wählbare Aufnahmeziele, automatische Verschiebungen, TV-Timerlöschung und eine Erfolgskontrolle abgeschlossener Aufnahmen sind **noch nicht implementiert**. Es werden dafür keine vorbereitenden `recording.*`-Datenpunkte angelegt. Der bestehende lesbare Datenpunkt heißt **`recordings.jobs`**.

Radiosteuerung bleibt zurückgestellt. `channels.radio`, `api` und `media` sind weiterhin aus dem Funktionsumfang entfernt. Für Radio wäre vor einer Wiederaufnahme ein eigener, am TV bestätigter Umschaltweg erforderlich.
