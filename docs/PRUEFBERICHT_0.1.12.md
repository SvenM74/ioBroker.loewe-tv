# Prüfbericht: Timerantworten nach Aufnahmeaufträgen

Stand: **19. Oktober 2026**. Paketversion **0.1.12**, Build **`0.1.12-recording-fix.1`**.

## Ergebnis und Prüfgrenze

Der vollständige lokale Testlauf mit **Node.js 24.19.0** hat **598 Tests bestanden**, ohne Fehler, ausgelassene oder abgebrochene Tests. Darunter sind acht zusätzliche Regressionstests für Timer-Metadaten, Verbindungsstatus, Bestätigung und Wiederherstellung der Aufnahmeaufträge. Die Timerantworten sind synthetische Fälle; ein Gerätetest dieses Fixes und die originale XML-Timerantwort des betroffenen Fernsehers stehen noch aus.

Die Änderung betrifft zwei Laufzeitdateien: [loewe-client.js](../lib/loewe-client.js) und [adapter-runtime.js](../lib/adapter-runtime.js). Die Aufnahme-Warteschlange und die eigentlichen TV-Schreibbefehle bleiben auf ihrem bisherigen Ablauf. Vorhandene Journaldaten können weiterverwendet werden.

## Ausgangslage

Untersucht wurde der gemeldete [Commit 72001f39](https://github.com/SvenM74/ioBroker.loewe-tv/commit/72001f39b7fe15d8bbab6033c013abd5cedf3a5c). Das Startprotokoll nennt **0.1.11 / `0.1.11-epg-recording.1`**. Laut Nutzerrückmeldung ist der Aufnahmeauftrag am TV angekommen. Anschließend konnte der Adapter einen Timereintrag nicht auswerten:

```text
INVALID_RESPONSE: GetTimerList: a timer entry contains an unrecognized structure.
```

Diese Meldung entstand bisher bei einem zusätzlichen direkten Element oder unerwartetem Text in einem `ResultTimerList`-Eintrag. Der Parser behandelte die acht aus der Original-App bekannten Felder als abschließendes Antwortschema. Die vorhandene Protokollevidenz belegt diese Beschränkung jedoch nicht.

Zusätzlich setzte `AdapterRuntime._recordError()` für jeden `INVALID_RESPONSE` die bestehende Verbindung auf offline. Ein semantischer Fehler in einer vom TV erhaltenen Timerantwort führte damit zu einer falschen Verbindungsanzeige.

**Ein Prozessabsturz durch diese Warnung wurde nicht nachgewiesen.** Im bereitgestellten Ausschnitt steht die angeforderte Beendigung um 19:06:17 vor dem erneuten Start um 19:06:23 und der Warnung um 19:07:00. In der Reproduktion blieb der Recording-Worker betriebsbereit; der gesendete Auftrag wurde `uncertain`, während nur der Verbindungsstatus fälschlich auf `false` wechselte.

## Korrektur

- Zusätzliche direkte Textmetadaten in Timereinträgen werden akzeptiert, einschließlich leerer Elemente, CDATA und XML-Attributen. Die bekannten Identitäts- und Zeitfelder werden unverändert streng ausgewertet.
- Unbekannte Unterbäume, wiederholte Felder, unerwarteter direkter Text, doppelte Timerkennungen und widersprüchliche Zähler bleiben ungültig. Unbekannte strukturierte Metadaten werden mit einem begrenzten Feldnamen gemeldet; ihre Inhalte erscheinen nicht in dieser Warnung.
- Nur semantische Fehler nach einer gültigen, eindeutigen `GetTimerListResponse` erhalten intern `timerListInvalid=true`. Sie erhalten eine bereits bestätigte TV-Verbindung. Eine bisher fehlende Verbindung wird dadurch nicht erfunden.
- Netzwerk- und Sitzungsfehler, kaputtes XML und fremde SOAP-Antworten behalten ihre bisherige Wirkung. Die Fehlerdiagnose in Log und `info.lastError` bleibt aktiv.
- Die Bestätigung benötigt weiterhin eine vollständige, vergleichbare Liste und genau einen Timer mit passender Senderidentität und exakten Zeiten. Ein möglicherweise gesendeter Auftrag wird auch nach Neustart nicht nochmals übertragen.

## Regressionen und Gegenprobe

| Bereich | Nachweis |
| --- | --- |
| Parser | Zusätzliche Textfelder ändern die bekannten Timerdaten nicht. Metadaten ersetzen keine fehlende Startzeit. Unbekannte Unterbäume werden weiterhin abgelehnt. |
| Fehlerklassifizierung | Semantische Timerfehler tragen das interne Kennzeichen; fremde oder unbrauchbare SOAP-Antworten nicht. |
| Bestehender Timer | Ein bereits vorhandener exakter Timer mit Zusatzmetadaten bestätigt den Auftrag ohne weiteren `ProgramTimer`-Aufruf. |
| Neuer Auftrag | Nach einem einzigen Versand bestätigt eine passende Timerantwort mit Zusatzmetadaten den Auftrag dauerhaft. |
| Unklares Rücklesen | Nach nicht auswertbarer Antwort bleibt der Auftrag `uncertain`; weitere Abgleiche und erneutes Laden des Journals erzeugen keinen weiteren Versand. |
| Adapterbetrieb | Ein echter Parserfehler durch den asynchronen Worker lässt die Aufnahmeverwaltung bereit und die bestehende Verbindung aktiv. Eine anschließende Fernbedienungstaste funktioniert im Test. |
| Bestehendes Offline-Verhalten | Netzwerkfehler, Fehler anderer Aktionen, unmarkierte Antwortfehler und ungültige Sitzungen setzen die Verbindung weiter auf offline. |

Die neuen Metadaten-Erfolgstests scheiterten mit dem unveränderten Basisparser. Der neue Runtime-Test scheiterte vor der Korrektur genau an der falschen Offline-Markierung. Nach der Korrektur bestehen [24 Protokolltests](../test/recording-protocol.test.js), [37 Recording-Manager-Tests](../test/recording-manager.test.js) und [91 Runtime-Tests](../test/runtime.test.js) als Teil des vollständigen Testsatzes.

Der vollständige Lauf wurde mit `npm test` ausgeführt. TCP-/UDP-Tests nutzen ausschließlich lokale Testserver; sie greifen nicht auf einen Fernseher zu. Die Paketprüfung erfolgt mit `npm run check`. Der vorhandene [GitHub-Workflow](../.github/workflows/test.yml) prüft Pull Requests auf Node.js 22 und 24; sein tatsächliches Ergebnis steht beim jeweiligen Commit in GitHub Actions.

## Prüfung am Fernseher

Nach dem [Update](INSTALLATION.md#update-auf-0112) muss `loewe-tv.0.info.adapterBuild` den Wert **`0.1.12-recording-fix.1`** zeigen. Einen noch unbestätigten Auftrag im Journal erhalten und den zugehörigen Timer am Fernseher kontrollieren. Eine lesbare passende Timerliste kann den vorhandenen Auftrag beim nächsten Abgleich bestätigen.

Falls erneut eine Warnung zu strukturierten Metadaten erscheint, hilft der nun enthaltene Feldname bei der Eingrenzung. Für die Unterstützung eines bislang unbekannten Zeit- oder Strukturformats wird eine reale `GetTimerList`-XML-Antwort benötigt. Ein tatsächlicher weiterer Neustart benötigt außerdem die zusammenhängenden Adapter- und Hostmeldungen vor und nach diesem Zeitpunkt. Aus dem bisher vorliegenden Ausschnitt lässt sich seine Ursache nicht bestimmen.
