# Prüfbericht: Programmwahl und Aufnahmeaufträge

Stand: **18. Oktober 2026**. Paketversion **0.1.11**, Build **`0.1.11-epg-recording.1`**.

## Ergebnis

Der vollständige Testlauf mit **Node.js 24.19.0** hat **590 Tests bestanden**, ohne Fehler, ausgelassene oder abgebrochene Tests. `npm run check` bestätigt die Paketmetadaten, **92 globale Objektdefinitionen**, die Konfigurationsfelder und Übersetzungen, die ursprünglichen 34 XML-Vorlagen sowie die JavaScript-Syntax. `git diff --check` meldet keine Fehler.

Die [Programmübersicht](EPG_GUI.md) befindet sich jetzt in einem eigenen Reiter; die speicherbaren EPG-Parameter stehen unter **EPG-Einstellungen**. Die Übersicht lässt sich über dieselbe ioBroker-Admin-Adresse separat öffnen. Sie bietet einen Umschaltbefehl für laufende Sendungen und eine ausdrückliche Aufnahmebestätigung für zukünftige Sendungen. Bestätigte Aufträge werden in `recordings.jobs` dauerhaft gespeichert und bei erreichbarem TV übertragen.

**Die neue Aufnahmefunktion ist softwareseitig geprüft, aber noch nicht an einem echten Loewe-Fernseher bestätigt.** Ein im TV gefundener Timer bestätigt die Planung; er ist kein Nachweis einer später erfolgreich ausgeführten Aufnahme. Die bisherigen positiven TV-EPG-Rückmeldungen gelten weiterhin für den damaligen 0.1.8-Stand, siehe [Gerätekompatibilität](COMPATIBILITY.md).

## Reguläre automatisierte Prüfungen

| Bereich | Geprüfte Eigenschaften |
| --- | --- |
| Reiter und Speichern | Eigene Reiter für Einstellungen und Programmübersicht; unveränderte native EPG-Felder; nicht zu speichernde iframe-Parameter; native Einbettung und Rechte für das separate Öffnen. |
| Auswahl im EPG | Exakte Referenz auf einen vorhandenen Eintrag im TV-EPG-Cache. Senderliste, TV-Konfiguration, Katalogrevision, Senderidentität, Sendungsbeginn und Ende werden geprüft. Browserdaten liefern keinen frei wählbaren TV-Locator. |
| Laufende Sendungen | Umschalten nur bei eindeutig laufender Sendung. Erneute Prüfung nach dem Warten auf die Befehlswarteschlange und unmittelbar vor dem SOAP-Versand. Abgelaufene, mehrdeutige oder überholte Auswahl löst keinen Umschaltbefehl aus. |
| Zukünftige Sendungen | Der erste Aufruf liefert ausschließlich eine Aufnahmeabfrage. Erst `confirmed: true` mit einer weiterhin gültigen Auswahl erzeugt den Auftrag. Beginnt die Sendung während der Bestätigung, wird der alte Auftrag abgelehnt. |
| Dauerhafte Speicherung | Bestätigung an die Oberfläche erst nach abgeschlossenem Datenbankschreiben. Wiederherstellung nach Neustart, begrenzte Journalgröße, keine Verdoppelung desselben Auftrags und kein Versand bei fehlgeschlagener Speicherung. |
| TV offline | Noch nicht gesendete Aufträge warten. Eine begrenzte Verbindungsprüfung läuft nur bei offenen Aufträgen. Nach Wiederverbindung folgen Timerabgleich und höchstens ein Schreibversuch. Dabei wird weder Wake-on-LAN noch ein Einschalt- oder Senderbefehl ausgelöst. |
| Übertragungsgrenzen | Vor dem Versand wird der Schreibversuch dauerhaft protokolliert. Sicher noch nicht gesendete, abgelaufene Queue-Einträge bleiben wiederholbar; ihre verspäteten Callbacks können keinen TV-Befehl mehr senden. Nach möglichem Versand bleibt ein unklarer Ausgang unbestätigt und wird nicht automatisch wiederholt. |
| Sitzung und Neustart | Sicher vor dem Body auftretende Sitzungsfehler können später erneut versucht werden. Ein Sitzungsfehler nach möglichem Versand sowie ein beim Neustart vorgefundener Schreibversuch führen zum Abgleich ohne erneute Programmierung. |
| Timerbestätigung | Passende Timerkennung, exakte Senderidentität und Start-/Endzeit sind erforderlich. Gleiche Namen oder Titel reichen nicht. Unvollständige, mehrdeutige oder zeitlich nicht interpretierbare Timerlisten erzeugen keine falsche Bestätigung. |
| Fristen und Stornierung | Nicht übertragene Aufträge werden spätestens bei Sendungsbeginn als verpasst behandelt. Nur noch nicht gesendete Aufträge können lokal entfernt werden. Aufträge für eine andere TV-Konfiguration bleiben gesperrt. |
| Beenden des Adapters | Wartende Aufnahmeoperationen werden abgebrochen; Queue-Timer werden freigegeben. Nach dem Beenden senden verspätete Callbacks keine TV-Befehle und beginnen keine weiteren Journalschreibvorgänge. |
| Admin-Kommunikation | Richtige Instanz und Proxy-Adresse, strukturierte Fehler, begrenzte Antwortzeit und genau eine Callback-Antwort. Timeout oder Neuverbindung wiederholen keine Benutzeraktion. |

Die Prüfungen sind unter anderem in [epg-actions.test.js](../test/epg-actions.test.js), [runtime.test.js](../test/runtime.test.js), [recording-manager.test.js](../test/recording-manager.test.js), [recording-protocol.test.js](../test/recording-protocol.test.js), [admin-config.test.js](../test/admin-config.test.js) und [epg-bridge.test.js](../test/epg-bridge.test.js) enthalten. `npm test` führt sie gemeinsam mit den bisherigen Adapter-, EPG-, Netzwerk- und Protokolltests aus. Die lokalen TCP-/UDP-Testserver sprechen keinen echten Fernseher an.

## Zusätzliche Integrationsprüfungen

**30 DOM-Prüfungen mit dem tatsächlichen HTML und Produktionsskript bestanden.** Das temporäre Harness verwendet den eigenständigen `linkedom`-Worker; dem Adapter wurde dafür keine zusätzliche Laufzeitabhängigkeit hinzugefügt. Geprüft wurden die vorhandene Zeitachse und Navigation sowie die neuen Aktionsschaltflächen, Aufnahmeabfrage, Abbrechen, Doppelbetätigung, abgelaufene Bestätigung, geänderte TV-/Listen-Konfiguration, Auftragsanzeige und deren Aktualisierung. Fehler bleiben als Text sichtbar. Das separate Öffnen erhält Admin-Basispfad und Instanz; die Seite erhält keinen Zugriff auf das ursprüngliche Fenster. Versteckte Ansichten pausieren Abfragen, das Schließen räumt Timer und Observer auf. Diese Prüfungen sind zusätzlich zu den 590 regulären Tests ausgeführt worden.

Das **unveränderte offizielle Admin-v7.7.28-Socket-Bundle** wurde mit simulierten nativen Browser-WebSockets erneut ausgeführt. Authentifizierung, HTTPS-Proxy-Basispfad, richtige Instanz, mehrseitige Antworten sowie Aufräumen nach Schließen der Ansicht und serverseitigem Verbindungsabbruch bestanden. Die bestehende Bridge verhindert dabei die zuvor nachgewiesene verspätete Wiederverbindung ihrer bereits geschlossenen Verbindung.

## Protokollnachweis und Prüfgrenzen

`ProgramTimer` und `GetTimerList` sowie deren relevante Felder stammen aus der vom Nutzer bereitgestellten ursprünglichen Loewe-App. Die [Aufnahme-Protokollbeschreibung](recording-protocol.md) führt Artefakt-Hashes, Fundstellen, Requestaufbau und Parsergrenzen auf. Die Tests vergleichen die Requests mit den extrahierten Originalvorlagen. Die getesteten Timerantworten sind synthetische Protokollfälle; eine echte `GetTimerList`-Antwort der Nutzergeräte liegt noch nicht vor. Unbekannte Zeitformate werden deshalb nicht in eine vermeintlich sichere Bestätigung umgedeutet.

Ein echter Browser mit ioBroker Admin und eine reale TV-Verbindung standen für diesen Build nicht zur Verfügung. Die DOM-Prüfungen bestätigen die Struktur und Bedienlogik, **keine visuelle Prüfung des CSS-Layouts**. Zu prüfen bleiben daher die Darstellung in der realen Instanz, Anmeldung und Berechtigungen am tatsächlichen Admin-Server, Umschalten, DR+-Timerprogrammierung und die spätere Aufnahme selbst. Vor-/Nachlauf, wiederholte Timer, Tuner- und Speicherkonflikte sowie automatische Aufnahmeregeln sind nicht Bestandteil dieser Umsetzung.

Die eigenständige URL verwendet den bestehenden Admin-Server einschließlich seiner konfigurierten Anmeldung und Berechtigungen. Der Adapter öffnet dafür keinen zusätzlichen Webport und richtet keinen Internetzugang ein. Das Warten auf den Fernseher umgeht auch nicht die vom Nutzer bestätigte Schnellstart-Voraussetzung für Netzwerk-Erreichbarkeit im Standby.

## Primärquellen zur Admin-Einbindung

- [Native iframeSendTo-Komponente in ioBroker JSONConfig](https://github.com/ioBroker/json-config/blob/v8.1.1/src/JsonConfigComponent/ConfigIFrameSendTo.tsx)
- [Offizielles Socket-Bundle aus ioBroker Admin v7.7.28](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/public/lib/js/socket.io.js)
- [Admin-Webserver: Anmeldung und Adapterdateien](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src/lib/web.ts)

Die Mindestversion bleibt **ioBroker Admin 7.7.28**. Der vorhandene CI-Workflow führt die Paketprüfung und den regulären Testsatz auf Node.js 22 und 24 aus. Den Status des jeweiligen veröffentlichten Commits zeigen die [GitHub Actions](https://github.com/SvenM74/ioBroker.loewe-tv/actions).
