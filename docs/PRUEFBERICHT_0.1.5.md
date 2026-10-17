# Prüfbericht: Loewe-TV-Adapter 0.1.5

Stand: **17. Oktober 2026**

## Anlass und überprüfbarer Befund

Der Nutzer hat die TV-Auswahl des überarbeiteten **0.1.4-Stands mit Sendernamen als Ordner-IDs** nach einem kurzen Test als fehlerfrei bestätigt. Die Radioauswahl funktioniert laut derselben Rückmeldung gar nicht. Das Gerät ist ein **Loewe bild 7.55, Chassis SL420, Firmware V5.4.6.0**. Eine echte Senderlistenantwort mit TV- und Radioeinträgen liegt bereits vor; eine aktuelle Antwort auf die Auswahl eines Radiosenders und eine echte Radio-Detailantwort von `GetMediaItem` fehlen noch.

Die Untersuchung ergibt eine konkrete Abweichung vom Auswahlablauf der privaten Android-App **Löwenbändiger Remote 1.15**: Der bisherige Adapter übergab den Locator aus der Senderliste direkt an `ZapToMedia`. Die App lädt vorher Senderdetails über die Dienstkennung und verwendet daraus den Locator. Version 0.1.5 übernimmt diesen zusätzlichen Schritt für Radiosendertaster. Die bewährte direkte TV-Auswahl bleibt erhalten.

Damit ist ein nachvollziehbarer Unterschied behoben und die Diagnose des TV-Ergebnisses verbessert. **Es ist noch nicht bewiesen, dass genau dieser Unterschied die bisherige Radio-Störung verursacht oder die Änderung sie am SL420 vollständig behebt.** Eine synthetische Antwort oder ein erfolgreicher Softwaretest ersetzt diesen Gerätetest nicht.

## Quellen und ihre Aussagegrenzen

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) beschreibt die relevanten Anfragen:

| Abschnitt | Bedeutung für die Änderung |
|---|---|
| 9.5.1, Seite 30 | `GetMediaItem` fragt Senderdetails anhand `MediaItemReference` und `mediaItemUuid` ab. Das Beispiel enthält einen `MediaItem` mit Locator. Nicht sämtliche Detailinformationen sind ohne laufende Wiedergabe zugesichert. |
| 9.7.1, Seite 33 | `GetChannelList` kann TV- und Radioeinträge liefern; `MediaItemClass` ist ein Abfragefilter. |
| 9.9.1, Seite 44 | `ZapToMedia` akzeptiert TV- und Radio-Locators. `Player=0` ist die Hauptwiedergabe, `Player=1` PIP. `Result=0` signalisiert Erfolg. |
| 9.10, Seite 45 | `GetCurrentPlayback` kann `Mode=radio` liefern. Locator und Dienstkennung werden dort ausdrücklich nur für TV zugesichert. |

Die Herstellerdokumentation liefert somit keinen Beleg, dass Radio grundsätzlich einen anderen Player, ein `radio://`-Schema oder eine zusätzliche Modustaste benötigt. Sie begründet auch nicht die Behauptung, jeder vom Gerät gelieferte Radio-Locator funktioniere auf jeder Firmware zuverlässig.

Die lokale APK-Analyse zeigt folgende Aufrufkette: `getChannelList` führt zu `getChannelDetails`, das `GetMediaItem` für die Dienstkennung ausführt. Der `m:Locator` der Detailantwort wird über `channel.setLink` gespeichert. `MainActivity$6.onClick` liest ihn mit `getLink`; anschließend führen `AsyncChannel` und `sendChannel` zu `ZapToMedia` mit `Player=0`. Die Requestvorlagen sind in [remote115-protocol.json](remote115-protocol.json) erhalten.

Der App-Parser sucht den ersten `m:Locator` im Dokument. Aus diesem Suchverfahren lässt sich keine genaue Elternstruktur einer Radioantwort ableiten. Der Adapter prüft deshalb gezielt einen eindeutigen `MediaItem` und dessen Locator anhand des dokumentierten Antwortmodells. Bis die echte Radioantwort des SL420 vorliegt, bleibt diese konkrete Struktur am Gerät zu verifizieren. Öffentliche Beispiele und Tests verwenden synthetische Kennungen und keine privaten Netzwerkadressen oder vollständigen Nutzerantworten.

## Verhalten von 0.1.5

### Radioauswahl über die Dienstkennung

Ein Radio-`select` erfasst zunächst das aktuelle Senderziel einschließlich `itemClass`, `mediaItemUuid`, Listenkennung und Listen-Locator. Vor dem Umschalten fragt der Adapter `GetMediaItem` mit dieser Dienstkennung ab. Nur eine eindeutig auswertbare Detailantwort liefert den tatsächlich zu verwendenden Locator. Eine widersprechende Dienstkennung, ein expliziter TV-Eintrag oder eine unbrauchbare Detailantwort dürfen keinen beliebigen Senderwechsel auslösen.

Der Adapter prüft das erfasste Senderziel vor dem tatsächlichen Umschalten erneut. Wird während der Detailabfrage eine geänderte Senderliste übernommen, darf ein inzwischen veralteter Auswahlauftrag nicht dennoch ausgeführt werden. Die TV-Auswahl verwendet weiterhin den bekannten Listen-Locator, ohne vorgeschaltete Detailabfrage. Die Namens-IDs und das Katalogschema aus 0.1.4 bleiben erhalten.

### Umschaltergebnis und Wiedergabe getrennt auswerten

Ein ausdrücklich von null abweichendes `ZapToMediaResponse.Result` wird als Fehler gemeldet. `Result=0` führt zum Status `accepted`; ein fehlendes Ergebnis bleibt `unconfirmed`. Die explizite Ergebnisprüfung gilt auch für den direkten Medienbefehl `media.locator`. Dieser direkte Medienbefehl löst allerdings keine Radio-Dienstkennung auf und verwendet nicht den Ablauf eines Radiosendertasters.

Nach einem nicht ausdrücklich abgelehnten Radioauftrag erfolgt einmalig `GetCurrentPlayback`. `Mode=radio` ohne weitere Kennung bestätigt nur den Modus. Stimmen eine zurückgemeldete Dienstkennung oder, wenn diese fehlt, ein zurückgemeldeter Locator mit dem angeforderten Ziel überein, wird die Senderbestätigung gesondert vermerkt. Ein anderer Modus oder Sender unmittelbar nach dem Auftrag ist zunächst eine Momentaufnahme; der Fernseher kann noch umschalten. Eine fehlgeschlagene Beobachtung macht eine zuvor angenommene Umschaltanfrage nicht rückwirkend zu einer nachgewiesenen Ablehnung.

Es gibt keine blinde Wiederholung von `ZapToMedia` und keinen zusätzlichen Tastendruck zum Wechseln des Betriebsmodus. Das vermeidet weitere Umschaltaufträge, deren Wirkung nach einer fehlenden oder verspäteten Antwort unklar wäre.

### Diagnose unter `channels.lastSelection`

Der neue Datenpunkt ist schreibgeschützt und enthält die letzte gestartete Senderauswahl als JSON. Normales Statuspolling ersetzt diese Diagnose nicht. Die Auswahl selbst schreibt zuerst einen laufenden und anschließend einen abgeschlossenen Bericht.

| Felder | Inhalt |
|---|---|
| `requested` | Senderpfad, Name, Position, Medienart, Dienstkennung und Listenkennung des Auftrags. |
| `listLocator`, `resolvedLocator`, `locatorSource` | Ursprünglicher Listen-Locator, tatsächlich verwendeter Locator und Quelle der Auflösung. |
| `status`, `phase`, `result` | Verarbeitungsschritt sowie Annahme, fehlende Bestätigung oder Fehler des Umschaltauftrags. |
| `getMediaItemResponse`, `zapResponse`, `playbackResponse` | Größenbegrenzt gespeicherte Antworten der ausgeführten Schritte. |
| `playback`, `verification`, `stationConfirmed` | Aufbereitete Wiedergabe und deren Aussage zur Senderbestätigung. |
| `error`, `playbackError` | Fehler des Auswahlablaufs beziehungsweise der nachgelagerten Beobachtung. |
| `startedAt`, `finishedAt` | Beginn und Ende der Verarbeitung als Unixzeit in Millisekunden. |

Die möglichen Auswahlergebnisse sind `running`, `accepted`, `unconfirmed` und `error`. Für die Wiedergabe unterscheidet der Bericht `notChecked`, `radioModeOnly`, `station`, `differentStation`, `differentMode`, `unknown` und `readFailed`. Die boolesche Eigenschaft `stationConfirmed` wird nicht allein durch eine erfolgreiche SOAP-Anfrage oder `Mode=radio` gesetzt.

Eine Auswahl kann bereits vor ihrem Start abgewiesen werden, etwa weil der Sender nicht verfügbar ist oder sein Bestand gerade aktualisiert wird. Bleibt `startedAt` trotz eines Tastendrucks unverändert, gehört der gespeicherte Bericht zum vorherigen Versuch; der aktuelle frühe Fehler steht in `info.lastError`. Das Rücksetzen von `select` auf `false` bestätigt nur die Verarbeitung des Tasters.

### Zeitbudget und Beenden

Die TV-Anfragen des Radioablaufs teilen sich ein gemeinsames Budget von `min(15 Sekunden, 3 × konfiguriertes Antwortzeitlimit)`. Einzelne Anfragen behalten zusätzlich das konfigurierte Antwortzeitlimit. Wartende Folgeanfragen dürfen nach Ablauf der gemeinsamen Frist nicht mehr starten. Datenbankschritte behalten ihre getrennten kurzen Zeitlimits; das Netzwerkbudget ist keine Garantie für eine identische Gesamtdauer einschließlich aller ioBroker-Schreibvorgänge.

Die Netzwerkverarbeitung bleibt asynchron und serialisiert. Beim Beenden werden keine neuen Umschaltaufträge aus wartenden Schritten begonnen. Bereits gesendete Befehle können nicht zurückgeholt werden. Für eine nachgelagerte Wiedergabeabfrage werden Fehler als Beobachtungsfehler erhalten; sie lösen keine automatische Wiederholung des Senderwechsels aus.

## Automatisierte Prüfung und Reproduktion

Der vollständige Testlauf mit **Node.js v24.19.0** hat **223 von 223 Tests** bestanden: keine Fehler, abgebrochenen oder übersprungenen Tests. Das vollständige TAP-Protokoll liegt in [TESTERGEBNIS_0.1.5.tap](TESTERGEBNIS_0.1.5.tap). Gegenüber dem letzten 0.1.4-Stand sind 24 Testfälle für Radioauflösung, Umschaltergebnisse, Wiedergabebeobachtung und den dazugehörigen Transport hinzugekommen.

Die Paketprüfung hat **106 Standardobjekte beziehungsweise 305 Objekte mit aktivierten Expertenfunktionen**, übereinstimmende Versionsangaben, Admin-Übersetzungen und die JavaScript-Syntax geprüft. Auch der bestehende Abgleich mit **34 extrahierten XML-Vorlagen für 33 SOAP-Aktionen** ist erfolgreich. Die neue Radio-Anfragefolge wurde zusätzlich vom ioBroker-Sendertaster über den produktiven HTTP-Client bis zu einem ausschließlich lokalen Testserver geprüft; dessen Antworten sind synthetisch.

Zur Reproduktion im Projektverzeichnis:

```bash
node --test --test-reporter=tap test/*.test.js > docs/TESTERGEBNIS_0.1.5.tap 2>&1
npm run check
npm pack
```

Der gezielte Prüfumfang umfasst Radioauflösung und Anfragefolge, den erhaltenen direkten TV-Pfad, unterschiedliche TV- und Radioziele bei identischen Programmplätzen, explizite Ablehnungen und fehlende Umschaltergebnisse, eindeutige Detailantworten, unveränderte beziehungsweise abweichende Wiedergabeangaben, begrenzte Wartezeiten sowie veraltete Senderziele nach einem gleichzeitigen Listenabgleich. Die Tests verwenden kontrollierte Antworten und lokale HTTP-/UDP-Verbindungen. Sie sprechen keinen echten Fernseher an und starten keinen produktiven ioBroker-Controller.

Die bestehenden Tests für Senderkatalog, Wiederherstellung, Objektbereinigung, Status, Fernbedienung und Einschaltablauf sind in den 223 erfolgreichen Tests enthalten. Der [GitHub-Workflow](https://github.com/SvenM74/ioBroker.loewe-tv/actions) prüft den jeweiligen Commit zusätzlich mit Node.js 22 und 24; sein Ergebnis ist am konkreten veröffentlichten Commit einsehbar.

## Noch erforderlicher Gerätetest

1. Das Paket **`iobroker.loewe-tv-0.1.5.tgz`** installieren und die vorhandene Instanz starten. Bei eingeschaltetem Fernseher den Senderbestand bei Bedarf aktualisieren.
2. Einen tatsächlich am TV funktionierenden Radiosender aus dem aktiven TV-Betrieb über seinen `select`-Taster anwählen, beispielsweise `channels.radio.Bayern_1.select`.
3. Am Gerät prüfen, ob der gewünschte Sender zu hören ist. Direkt danach `channels.lastSelection` lesen und den konkreten Versuch anhand seiner Zeitstempel zuordnen.
4. Dieselbe Auswahl aus dem bereits aktiven Radiomodus prüfen. Falls ein Versuch scheitert, dessen Diagnose vor dem nächsten Sendertaster sichern und die Ausgangssituation dazuschreiben.

Die vollständige Senderliste muss für diesen ersten Fehlerbericht nicht erneut kopiert werden. Entscheidend sind die echte Detailantwort, das Umschaltergebnis und die anschließend beobachtete Wiedergabe. Erst diese Rückmeldung bestätigt den neuen Ablauf auf dem SL420 oder zeigt, an welchem Schritt weiter untersucht werden muss.

**EPG-Import und automatische Aufnahmen sind in 0.1.5 weiterhin nicht implementiert.** `epg.status=notImplemented` bleibt direkt unter jedem Sender bestehen. Installation und Datenpunkte stehen in der [README](../README.md), die weiteren EPG- und Aufnahmeschritte in der [Roadmap](ROADMAP.md).
