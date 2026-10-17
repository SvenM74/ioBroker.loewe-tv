# Prüfbericht: Loewe-TV-Adapter 0.1.6

Stand: **17. Oktober 2026**

## Befund am Fernseher

Version **0.1.5** konnte den gemeldeten Radiofehler am **Loewe bild 7.55, Chassis SL420, Firmware V5.4.6.0** noch nicht beheben. Der Nutzer hat inzwischen eine echte Diagnose für **sunshine live**, Programmplatz **210**, geliefert und bestätigt, dass der Radiosender hörbar nicht angewählt wurde. Die TV-Sendertaster des Stands 0.1.4 mit Namens-IDs funktionieren nach seinem kurzen Test.

| Beobachtung aus dem Versuch mit 0.1.5 | Aussage |
|---|---|
| `GetMediaItem` liefert `itemInfoClass=object.item.audioItem`. | Die angeforderte Dienstkennung führt in dieser Antwort tatsächlich zu einem Audioeintrag. |
| Detail-Locator und Listen-Locator sind identisch. | Der zusätzliche Auflösungsschritt aus 0.1.5 hat in diesem Fall keine andere Kanaladresse geliefert. Ein falsches Radio-Locatorschema ist damit nicht belegt. |
| `ZapToMediaResponse.Result=0`. | Der TV meldet den Auftrag als erfolgreich, obwohl der vom Nutzer erwartete Wiedergabewechsel ausbleibt. |
| Die direkt anschließende Wiedergabeabfrage meldet `Mode=tv` und den bisherigen ZDF-Locator. | Zum Abfragezeitpunkt wurde noch der vorherige TV-Zustand gemeldet. Die gesamte bisherige Folge dauerte nur rund 77 Millisekunden. |
| Die Wiedergabeantwort enthält `chl0:00-00000000ffff00000000` als Dienstkennung. | Diese Platzhalterkennung identifiziert keinen konkreten Sender und darf eine eindeutige Locator-Beobachtung nicht als angeblich anderer Dienst überstimmen. |

Der Befund begründet zwei Änderungen: Den Radiomodus vor der Senderwahl gezielt herstellen und die Wiedergabe nach dem Senderauftrag mit Abstand beobachten. Die sehr frühe Abfrage erklärt allein noch nicht die vom Nutzer bestätigte Fehlfunktion. **Ein erfolgreicher Gerätetest der Version 0.1.6 liegt zum Stand dieses Berichts noch nicht vor.** Der zusätzliche Moduswechsel ist eine gezielte Korrektur auf Grundlage der Diagnose und dokumentierter Steuerbefehle; seine Wirksamkeit auf der genannten Firmware bleibt zu prüfen.

## Quellen für Befehle und Reihenfolge

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) beschreibt die verwendeten Steuerbefehle und die Grenzen der Wiedergabeantwort:

| Abschnitt und gedruckte Seite | Dokumentierter Inhalt und Verwendung |
|---|---|
| 9.4.1, Seite 24 | `InjectRCKey` überträgt einen Tastencode mit Tastenalphabet und Ereignis. Ein vollständiger Tastendruck enthält Drücken und Loslassen. Seine Übertragung liefert noch keinen Nachweis der tatsächlichen Gerätewirkung. |
| 9.4.1.1, Seite 25 | Im Alphabet `l2700` stehen `TV_MODE_ON` für **72** und `RADIO_MODE_ON` für **73**. Der Adapter stellt beide als einzelne Remote-Taster bereit und verwendet 73 für den gezielten Radiomoduswechsel. |
| 9.5.1, Seite 30 | `GetMediaItem` fragt Details anhand einer Dienstkennung ab. Der zurückgegebene Locator wird als Senderziel verwendet. |
| 9.7.1, Seite 33 | `GetChannelList` kann TV- und Radioeinträge liefern. Die Medienart ist ein Listenfilter. |
| 9.9.1, Seite 44 | `ZapToMedia` verwendet einen `channel://…`-Locator für TV oder Radio. `Player=0` bezeichnet die Hauptwiedergabe, `Player=1` PIP. `Result=0` wird als Erfolg beschrieben. |
| 9.10, Seite 45 | `GetCurrentPlayback` kann `Mode=radio` liefern. Zusätzliche Felder für Locator und Dienstkennung sind in diesem Abschnitt nur für TV zugesichert. |

Die gleiche Tastentabelle führt auch `RADIO=53`. Sie erläutert dort jedoch keinen gleichwertigen Ablauf für das Herstellen des Radiomodus. Der Adapter verwendet deshalb den ausdrücklich benannten `RADIO_MODE_ON`-Befehl 73; eine weitere Taste 53 wird nicht als Fallback gesendet. Im gesonderten Alphabet `l2700-hdr` bezeichnet Code 53 die bereits vorhandene Wiedergabetaste. Tastenalphabet und Code gehören stets zusammen.

Das [Loewe-Benutzerhandbuch für bild-Geräte, Abschnitt Radio-Betrieb, Seite 75](https://cdn.loewe.tv/manuals_new/TV_BA/SL3xx_SL4xx/universelles%20Benutzerhandbuch%20f%C3%BCr%20alle%20bild%20Ger%C3%A4te/36960000_UH_bild_universal_3l_DE_180813.pdf) beschreibt den Einstieg in den DVB-Radiobetrieb und anschließend die Auswahl eines Radiosenders. Es deckt auch bild-7-Geräte ab. Die Beschreibung betrifft die Bedienung am Gerät; sie ist kein Nachweis, dass ein einzelner `ZapToMedia`-Aufruf auf jeder SL420-Firmware selbständig den Modus wechselt.

Der vorgeschaltete Auflösungsschritt bleibt durch die Analyse von **Löwenbändiger Remote 1.15** begründet: `getChannelDetails` fragt `GetMediaItem` anhand der Dienstkennung ab, speichert den gefundenen `m:Locator` und übergibt ihn bei der Senderauswahl an `ZapToMedia` mit `Player=0`. Die [extrahierten Anfragevorlagen](remote115-protocol.json) sowie der [Prüfbericht zu 0.1.5](PRUEFBERICHT_0.1.5.md) halten diesen Befund fest. Die echte Detailantwort des Nutzers bestätigt inzwischen einen Audioeintrag, aber keinen von der Senderliste abweichenden Locator.

## Radioablauf in 0.1.6

### Modus vor dem Senderauftrag bestätigen

Ein Radio-`select` erfasst das aktuelle Senderziel und löst dessen `mediaItemUuid` mit `GetMediaItem` auf. Die Auswertung berücksichtigt auch `itemInfoClass=object.item.audioItem` als Kennzeichnung eines Audioeintrags. Dienstkennung, Medienart und Locator müssen zum angeforderten Ziel passen. Der Adapter bewahrt die originale Detailantwort in der größenbegrenzten Diagnose auf; die aufbereitete Medienart lautet `audio`.

Anschließend wird `GetCurrentPlayback` ausgeführt. Bei bereits aktivem `Mode=radio` ist keine Modustaste nötig. Andernfalls sendet der Adapter **einmal** `InjectRCKey` mit `l2700`, Code **73**, als Drücken und Loslassen. Er liest danach im Abstand von 500 Millisekunden den Wiedergabemodus, bis Radio bestätigt ist oder die dafür verfügbare Frist endet.

**Ohne bestätigten Radiomodus wird kein `ZapToMedia` gesendet.** Der Auswahlauftrag endet dann mit `CHANNEL_SELECTION`. Bei bestätigtem Modus wird der aufgelöste Locator einmal mit `Player=0` angewählt. Eine explizit von null abweichende `ZapToMedia`-Rückmeldung bleibt ein Befehlsfehler.

Die direkte TV-Senderauswahl verwendet weiterhin den in der Senderliste gelieferten bevorzugten Locator. Sie erhält keinen vorgeschalteten Radiomoduswechsel. Die beiden neuen Datenpunkte `remote.radio_mode_on` und `remote.tv_mode_on` lassen sich unabhängig als Modustaster verwenden; sie durchlaufen nicht selbst die vollständige Senderauswahl.

### Zeitversetzte Wiedergabeprüfung

Nach dem Radio-Senderauftrag wartet der Adapter zunächst 500 Millisekunden und liest dann `GetCurrentPlayback`. Weitere Abfragen erfolgen im Abstand von 500 Millisekunden innerhalb des begrenzten Beobachtungsfensters. Wiederholt werden nur diese Leseanfragen. Der Senderauftrag und der Modustastendruck werden wegen einer verzögerten oder fehlenden Bestätigung nicht erneut gesendet.

Die Platzhalterkennung `chl0:00-00000000ffff00000000` wird bei der Prüfung der Senderidentität wie eine fehlende Kennung behandelt. Sie bleibt in der Rohantwort erhalten. Ist stattdessen eine brauchbare Dienstkennung vorhanden, muss diese zum angeforderten Sender passen. Fehlt eine verwertbare Kennung, kann ein passender Locator zur Bestätigung dienen. Meldet der TV nur `Mode=radio`, bestätigt dies ausschließlich den Modus.

Die maximalen Fristen sind **6 Sekunden für den Moduswechsel** und **3 Sekunden für die Beobachtung nach dem Senderauftrag**. Für weitere TV-Anfragen und Wartezeiten gilt gemeinsam eine **15-Sekunden-Frist ab Beginn der Auswahl**. Jede Anfrage behält zusätzlich das konfigurierte Antwortzeitlimit. Das verbleibende Budget kann spätere Schritte verkürzen. Wartezeiten laufen asynchron. ioBroker-Datenbankschritte einschließlich des abschließenden Schreibens von `channels.lastSelection` behalten eigene Zeitlimits von jeweils zwei Sekunden. Daraus folgt keine absolute Gesamtdauer von 15 Sekunden einschließlich aller Datenbankoperationen.

### Unterbrechung durch gezielte Steuerbefehle

Ein- und Ausschaltbefehle über die dafür vorgesehenen Datenpunkte, `remote.radio_mode_on`, `remote.tv_mode_on`, `media.locator` und das Stoppen der Instanz brechen laufende beziehungsweise überholte Radioauswahlen ab. Ein bereits übertragener Befehl kann nicht zurückgeholt werden; nach erkanntem Abbruch darf kein weiterer wartender Radio-Schritt gesendet werden. Weitere normale Sendertaster und rohe Advanced-API-Aufträge behalten dagegen ihre FIFO-Reihenfolge. Es gibt kein allgemeines Ersetzen aller Aufträge durch den zuletzt geschriebenen Datenpunkt.

## Diagnose und Bedeutung der Ergebnisse

`channels.lastSelection` bleibt ein schreibgeschützter JSON-Datenpunkt. Die Diagnose enthält den letzten gestarteten Auswahlversuch und wird vom normalen Statuspolling nicht überschrieben.

| Feld | Inhalt |
|---|---|
| `requested` | Senderpfad, Name, Position, Medienart, Dienstkennung und Listenkennung des Auftrags. |
| `detail` | Aufbereitete Detailantwort einschließlich normalisierter Medienart und originalem `itemInfoClass`. |
| `listLocator`, `resolvedLocator`, `locatorSource` | Ursprüngliche und aufgelöste Kanaladresse sowie die Quelle der Auflösung. |
| `playbackBefore` | Aufbereitete Wiedergabe vor dem möglichen Moduswechsel. |
| `modeSwitch.attempted`, `.key`, `.confirmed` | Ob die Modustaste gesendet wurde, welche Taste verwendet wird und ob der Radiomodus bestätigt wurde. |
| `modeSwitch.observations` | Zeitlich zugeordnete Beobachtungen des Modus während der Prüfung; jeder Eintrag enthält unter anderem `at` und `mode`. |
| `getMediaItemResponse`, `playbackBeforeResponse`, `zapResponse`, `playbackResponse` | Größenbegrenzt erhaltene Antworten der ausgeführten Schritte. |
| `playback` | Zuletzt nach der Senderwahl beobachtete Wiedergabe. |
| `playbackObservations`, `playbackUuidIgnored` | Zeitliche Folge der Beobachtungen nach der Senderwahl und Angabe, ob die zuletzt gemeldete Dienstkennung als Platzhalter ignoriert wurde. |
| `status`, `phase`, `result` | Zusammengefasstes Ergebnis, erreichter Schritt und das numerische `ZapToMedia`-Ergebnis, soweit vorhanden. |
| `verification`, `stationConfirmed` | Aussage der Wiedergabeprüfung und ausdrückliche Bestätigung der Senderidentität. |
| `error`, `playbackError` | Fehler des Ablaufs beziehungsweise der nachgelagerten Beobachtung. |
| `startedAt`, `finishedAt` | Beginn und Ende des Versuchs als Unixzeit in Millisekunden. |

Für die Radioauswahl gelten folgende Statuswerte:

| `status` | Bedeutung |
|---|---|
| `running` | Der Auswahlablauf läuft noch. |
| `confirmed` | Die spätere Wiedergabeantwort bestätigt den gewünschten Radiosender anhand einer passenden Identität. |
| `accepted` | `ZapToMedia` meldet `Result=0` und die anschließende Wiedergabe bestätigt den Radiomodus, aber keine genaue Senderidentität. |
| `unconfirmed` | Der Auftrag wurde nicht ausdrücklich als Fehler zurückgewiesen, aber die erforderliche Wiedergabebestätigung bleibt aus. |
| `error` | Ein Ablauf- oder Befehlsfehler liegt vor, beispielsweise ein nicht erreichter Radiomodus vor dem Senderauftrag. |

`verification=radioModeOnly` ist keine Bestätigung eines bestimmten Senders. `station` mit `stationConfirmed=true` ist die genaue Senderbestätigung. `differentMode` und `differentStation` halten eine beobachtete Abweichung fest; `unknown`, `readFailed` und `notChecked` liefern keinen Wiedergabenachweis. Eine später ausbleibende Bestätigung ist keine Zusage, dass der Fernseher den Auftrag zu keinem weiteren Zeitpunkt noch umsetzen wird.

Die Auswahl kann bereits vor ihrem Start abgewiesen werden, etwa bei einem veralteten oder nicht verfügbaren Senderziel. Ändert sich `startedAt` trotz eines Tastendrucks nicht, gehört die gespeicherte Diagnose zum vorherigen Versuch; dann ist zusätzlich `info.lastError` relevant. Das Rücksetzen des `select`-Tasters bestätigt ausschließlich dessen Verarbeitung.

## Automatisierte Prüfung und Reproduktion

Der vollständige lokale Testlauf auf **Node.js 24.19.0** ist abgeschlossen: **237 Tests bestanden, 0 fehlgeschlagen**. Das [vollständige TAP-Protokoll](TESTERGEBNIS_0.1.6.tap) gehört zu dieser Version. Darin enthalten sind 20 Radio-Protokolltests und 50 Tests für Senderobjekte und Auswahlabläufe. Die lokale HTTP-Integration prüft unter anderem den verzögerten Wechsel von TV zu Radio, den einmaligen Modustastendruck und Senderauftrag sowie die anschließende Bestätigung anhand des Locators bei einer Platzhalter-Dienstkennung.

Für diese Änderung sind insbesondere die Reihenfolge von Detailabfrage, Modusprüfung, einmaligem Modustastendruck und Senderauftrag sowie die zeitversetzte Bestätigung zu prüfen. Weitere Fälle sind ein bereits aktiver Radiomodus, ein ausbleibender Moduswechsel ohne anschließenden Senderauftrag, die Platzhalterkennung, ein tatsächlich anderer Sender, fehlende oder ablehnende Antworten, abgelaufene Fristen, Beenden während einer Wartephase und ein gleichzeitig geänderter Senderbestand. Der direkte TV-Pfad bleibt ein gesonderter Prüfpunkt.

Der definierte Objektbestand umfasst **43 Remote-Taster**, **108 Standardobjekte** beziehungsweise **307 Objekte bei aktivierten Expertenfunktionen**, jeweils vor der dynamischen Anlage der Senderobjekte. Die Paketprüfung für Versionsangaben, Übersetzungen und Paketdateien ist erfolgreich durchgelaufen.

Zur Reproduktion im Projektverzeichnis:

```bash
node --test --test-reporter=tap test/*.test.js > docs/TESTERGEBNIS_0.1.6.tap 2>&1
npm run check
npm pack
```

Automatisierte Prüfungen verwenden kontrollierte TV-Antworten und lokale HTTP-/UDP-Verbindungen. Sie ersetzen weder den Start in einem tatsächlichen ioBroker-Controller noch den Wiedergabetest auf dem Nutzergerät. Das Test- und Paketergebnis ist vom noch offenen Hardwareergebnis zu unterscheiden.

## Gezielter Gerätetest

1. Das Paket **`iobroker.loewe-tv-0.1.6.tgz`** installieren und die vorhandene Instanz starten. Den Fernseher einschalten und zunächst einen TV-Sender wiedergeben. Den Senderbestand bei Bedarf mit `channels.refresh=true` aktualisieren und auf einen bereiten Katalog warten.
2. Einmal `channels.radio.sunshine_live.select=true` mit `ack:false` schreiben, sofern sunshine live im eigenen Bestand vorhanden ist.
3. Den Ablauf abschließen lassen, am Fernseher die tatsächliche Radiowiedergabe prüfen und anschließend **`channels.lastSelection`** lesen. Bei einem Fehler zunächst diesen Wert und den vorherigen Modus melden; eine erneute vollständige Senderliste ist dafür nicht nötig.

Falls die Auswahl erneut scheitert, kann als getrennter Diagnoseschritt `remote.radio_mode_on=true` ausgelöst werden. Nach etwa zwei Sekunden `control.refresh=true` ausführen und `status.playback` sowie die Reaktion am Gerät prüfen. Dieser Einzeltest grenzt ein, ob die dokumentierte Modustaste selbst wirksam ist. Er ersetzt die Diagnose des vollständigen Senderversuchs nicht.

**EPG-Import und automatische Aufnahmen bleiben in 0.1.6 noch nicht implementiert.** Der vorbereitete Unterordner mit `epg.status=notImplemented` bleibt direkt am Sender. Installation und Datenpunkte stehen in der [README](../README.md); die geplanten EPG- und Aufnahmefunktionen in der [Roadmap](ROADMAP.md).
