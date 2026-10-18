# Prüfbericht: TV-EPG und Datenpunktbereinigung in 0.1.8

Stand: **18. Oktober 2026 (UTC)**. Paketversion: **`0.1.8`**. Build: **`0.1.8-tv-epg-only.1`**.

## Ergebnis

Der Adapter liest Programminformationen ausschließlich direkt vom Loewe-TV. Die alternative XMLTV-/iptv-org-Anbindung einschließlich Download, Parser, Quellenwahl, URL und Senderzuordnung wurde entfernt. Die EPG-Konfiguration enthält nur noch Aktivierung und Abrufintervall. Bereits gespeicherte, auch ungültige Einstellungen der entfernten Quelle werden ignoriert und blockieren weder den Adapterstart noch das Speichern in Admin.

Die Bereinigung entfernt **17 globale Zustände und sieben Zustände je TV-Sender**. Der verbleibende Bestand umfasst **90 statische Objekte, davon 83 Zustände und sieben Ordner**. Je TV-Sender entstehen **26 Zustände und vier Ordner** einschließlich des Senderordners. Vorher waren es 107 statische Objekte und 33 Zustände je Sender. Bei 100 Senderordnern sind damit 717 Zustände weniger erforderlich. Die Zählung bezieht sich auf die Adapterdefinitionen; vom Nutzer geschützte Altobjekte können zusätzlich erhalten bleiben.

**391 automatisierte Tests bestehen: keine Fehler, Abbrüche oder übersprungenen Tests.** Der vollständige Lauf unter Node.js 24.19.0 dauerte 4,05 Sekunden und ist im [TAP-Protokoll](TESTERGEBNIS_0.1.8_TV_EPG.tap) dokumentiert. Der Lauf verwendet die vollständige Testsuite mit zusätzlicher TAP-Ausgabe; die unveränderte GitHub-Prüfung führt `npm test` unter Node.js 22 und 24 aus.

Ein Gerätetest dieses Builds steht noch aus. Die erfolgreichen direkten EPG-Abrufe auf **bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** sind Nutzerrückmeldungen zum vorherigen 0.1.8-Stand. Die vom Nutzer aktualisierte [Gerätetabelle](../README.md#getestete-geräte) bleibt erhalten. Die Bereinigung verändert weder die bewährte TV-Anfrage noch deren Senderkennungen.

## Entfernte Datenpunkte und ihre verbleibenden Zugriffe

| Entfernt | Verbleibender Zugriff und Zweck |
|---|---|
| `info.lastResponse` | Gezielte Rückmeldungen, etwa `status.playback`, `device.data`, `channels.lastSelection` und `epg.data.tvDiagnostic`. `info.lastError` und `info.lastCommand` bleiben für die Fehlersuche. |
| `status.volumeRaw` | Die zurückgemeldete TV-Lautstärke steht in `status.volume`; `control.volume` dient auch zur Steuerung. |
| `channels.start`, `channels.listStart`, `channels.count`, `channels.getLists`, `channels.getChannels` | Senderlistenwahl in der Adapter-Konfiguration und vollständiger Abgleich über `channels.refresh`. Der Adapter verarbeitet Antwortseiten intern. |
| `channels.lists`, `channels.items`, `channels.entries`, `channels.availableLists` | Die Konfiguration bekommt Listen direkt vom Adapter. `channels.catalog` hält den aufbereiteten Senderbestand; `channels.tv` enthält die ausgewählte Liste. |
| `channels.totalNumber`, `channels.returnedNumber`, `channels.nextStart`, `channels.nextListStart`, `channels.lastUpdate`, `channels.lastError` | `channels.refreshCount`, `channels.refreshLastUpdate`, `channels.refreshStatus` und `channels.refreshError` beschreiben den vollständigen Abruf. |
| Je Sender: `numbers`, `locators`, `listView` | `positions` enthält zusammengehörende Programmplätze und Locators. Die Listenkennung steht in `channels.view` sowie im Senderbezug von `epg.data`. |
| Je Sender: `epg.source`, `epg.sourceChannelId` | Die Quelle ist immer der TV. Der Senderbezug ist bereits in den Senderdaten und in `epg.data.channel` enthalten. |
| Je Sender: `epg.now.endEstimated`, `epg.next.endEstimated` | Fehlende Endzeiten werden nicht geschätzt. `end` bleibt bei unbekannter Endzeit im Einzelzustand 0 und im JSON `null`. |

Die vollständige Liste und Hinweise für bestehende Skripte stehen zusätzlich in der [Updateanleitung](INSTALLATION.md#datenpunktbereinigung-beim-update). Zugriffe auf entfernte IDs müssen auf die verbleibenden Werte umgestellt werden.

## Erhaltener Funktionsumfang

Die konfigurierte TV-Senderliste bleibt verbindlich. Senderordner behalten ihre Namens-IDs; ihre Anzeige und Auswahl verwenden nach dem Abgleich den aktuellen Programmplatz. Die Taster `channels.tv.<Sender>.select`, alle **42 Fernbedienungstaster**, Lautstärke, Stummschaltung, Ein-/Ausschaltablauf und vollständiger Senderabgleich bleiben bestehen.

Je Sender bleiben sieben Metadatenzustände: `select`, `name`, `number`, `mediaItemUuid`, `locator`, `positions` und `available`. Die 19 EPG-Zustände bestehen aus `status`, `lastUpdate`, `lastError`, `data`, `cache` sowie je sieben Zuständen unter `now` und `next`: `available`, `title`, `subtitle`, `description`, `eventId`, `start` und `end`.

`epg.data` ist der zusammenhängende Wert für Skripte. `epg.cache` ist weiterhin nötig, damit der Adapter gespeicherte TV-Programme nach einem Neustart wiederverwenden und die aktuelle/nächste Sendung an den Zeitgrenzen fortschreiben kann. Auch die getrennten Statuswerte für Senderabruf, Objektaufbereitung und EPG bleiben erforderlich: Ein abgeschlossener TV-Abruf allein bestätigt noch keine vollständig geschriebenen ioBroker-Objekte.

`remote.epg_alt` bleibt eine Fernbedienungstaste zum Öffnen der TV-Anzeige. Sie ruft keine Programmdaten ab und ist unabhängig von der entfernten externen EPG-Schnittstelle. Die früher entfernten Bäume `channels.radio`, `api` und `media` werden weiterhin bereinigt und nicht neu angelegt.

## Migration bestehender Installationen

Die globale Bereinigung läuft vor Senderwiederherstellung, Abonnements und TV-Verbindung. Sie entfernt nur die benannten alten Pfade innerhalb der eigenen Instanz und kontrolliert danach den Objektbestand. Ähnlich benannte eigene Zustände und andere Adapterinstanzen bleiben unberührt. Bei einem Datenbankfehler oder weiterhin vorhandenen geschützten globalen Altobjekt wird der Start mit einer konkreten Fehlermeldung beendet; Löschschutz wird nicht erzwungen aufgehoben.

Die sieben veralteten Kindzustände werden auch bei ausgeschaltetem TV anhand gespeicherter verwalteter Senderobjekte erkannt. Vor jeder einzelnen, nicht rekursiven Löschung werden Eigentum, Objekttyp sowie Schutz des Objekts und seiner Eltern erneut geprüft. Benutzerobjekte, `common.custom`, `common.dontDelete` und fremde Eigentümer bleiben erhalten. Ein geschützter alter Kindzustand kann deshalb mit einer Warnung stehen bleiben, wird aber nicht mehr aktualisiert. Eine spätere Senderaktualisierung kann die Bereinigung erneut versuchen.

Die EPG-Initialisierung beginnt nach erfolgreicher Anlage der aktuellen Senderobjekte unabhängig von der anschließenden Altobjektbereinigung. Ein Fehler beim Löschen eines alten Kindzustands darf deshalb keine früheren externen Programme stehen lassen und den TV-EPG-Abruf nicht dauerhaft verhindern. Die Vorbereitung ersetzter oder entfernter Sender und das Abwarten ihrer ausstehenden Schreibvorgänge erfolgen weiterhin vor der Objektänderung.

Zeitlimits verhindern unbegrenztes Warten auf Datenbankaufrufe. Ein bereits gestarteter, noch nicht abgeschlossener Schreib- oder Löschvorgang wird vor einer widersprechenden neueren Senderbearbeitung berücksichtigt. Nach Beginn des Beendens startet der Adapter keine weitere Bereinigungsmutation. Langsame Senderobjektarbeit belegt nicht die Warteschlange für Fernbedienungsbefehle.

Sender werden aus `channels.catalog` und den gespeicherten Dienstinformationen der verwalteten Senderordner wiederhergestellt. Ein sehr alter Bestand, der ausschließlich in der entfernten Rohantwort `channels.items` vorliegt, muss einmal mit `channels.refresh` neu geladen werden. Im bisher verwendeten Stand mit Namensordnern bleiben Senderidentitäten und die konfigurierte Liste erhalten.

## TV-EPG und Cacheformat

Das veröffentlichte JSON `epg.data` verwendet **Schema 2**. Quellenwahl, externe Senderkennung und die Kennzeichnung geschätzter Enden sind darin entfernt. Der interne Cache verwendet ebenfalls Schema 2 und behält zur Herkunftsprüfung fest `source: "tv"`.

Gültige TV-Caches aus Schema 1 werden nur bei passender Sender-/Listenidentität, gültigem Alter und gültigen Sendungszeiten übernommen. Ein früheres XMLTV-Ergebnis, unbekannte Herkunft oder geschätzte Endzeiten werden verworfen. Veraltete Fremddaten in veröffentlichten EPG-Feldern werden bereits bei der Initialisierung geleert; dafür ist kein erster automatischer TV-Abruf erforderlich. Das gilt auch bei manuellem Abrufintervall 0.

Scheitert eine neue TV-Abfrage, können noch gültige, tatsächlich vom TV stammende Cache-Daten weiterlaufen. Ein erfolgreicher, ausdrücklich leerer TV-Plan ersetzt dagegen den bisherigen Plan durch ein leeres Ergebnis. Fehlende, mehrdeutige oder zu alte Informationen werden nicht als sicher laufende Sendung ausgegeben. Die [EPG-Anleitung](EPG.md) beschreibt Statuswerte, Zeitangaben und Größen-/Zeitgrenzen.

Die TV-Protokollverarbeitung mit `CreateIterator`, begrenzter Seitennavigation und gegebenenfalls dem dokumentierten TV-Grundschema bleibt erhalten. Dieser Wechsel zwischen zwei Feldumfängen derselben lokalen TV-Tabelle ist keine alternative EPG-Quelle. Die [Protokollbeschreibung](epg-protocol.md) dokumentiert den Ablauf.

## Prüfungen und Reproduktion

| Bereich | Geprüftes Verhalten |
|---|---|
| Admin | Speichern mit fehlenden Standardwerten, alten Quellenwerten und ungültigen Alt-URLs; weiterhin strenge Prüfung von Aktivierung und Intervall; Senderlistenauswahl bleibt verfügbar. |
| Objektmigration | 17 entfernte globale Zustände; sieben Kindzustände je Sender; eigene Instanzgrenzen, Eigentumsprüfung, geschützte Eltern, verwaiste Objekte, verspätete Datenbankantworten und Beenden. |
| Sender | Vollständige und mehrseitige TV-Liste, stabile Namens-IDs, Umsortierung, exakter Locator für Auswahl, keine Wiederherstellung alter Radioeinträge. |
| EPG | Aktuelle/nächste Sendung, Zeitgrenzen und Mehrdeutigkeit, TV-Protokollseiten, Cache-Übernahme und -Ablehnung, fehlgeschlagene und leere TV-Antworten, Wiederanlauf nach Datenbankfehler. |
| Quellenentfernung | Alte Quellenoptionen und eingespritzte frühere Loader verändern den TV-Ablauf nicht; entfernte Quellzustände werden weder angelegt noch geschrieben. |
| Reaktionsfähigkeit | Fernbedienungsbefehle zwischen EPG-Anfragen, fortgesetzter Abgleich bei mehr als 64 Sendern, begrenzte Anfragen und Abbruch ohne späte Veröffentlichungen. |
| Tatsächlicher Transport | Lokale HTTP- und UDP-Testgegenstellen auf `127.0.0.1`, SOAP-Sitzung, NUL-Abschluss, unvollständige Antwort, wiederholte Wake-on-LAN-Pakete. Es wird kein realer Fernseher kontaktiert. |

Die Tests bestehen aus Simulationen, kontrollierten Uhren und Datenbanken sowie lokalen Socket- und Unterprozesstests. Eine abgeschirmte Umgebung muss diese lokalen Verbindungen und Unterprozesse zulassen; ein `EPERM` beim Anlegen einer Testgegenstelle ist keine Antwort eines Fernsehers.

Reproduktion im Projektverzeichnis:

```bash
npm install
npm run check
node --test --test-reporter=tap test/*.test.js
npm pack
```

`npm test` führt dieselbe vollständige Suite ohne erzwungenen TAP-Reporter aus. Die Paketprüfung kontrolliert Syntax, Versions-/Buildkonsistenz, native Standardwerte, Admin-Felder und Übersetzungen, 90 statische Objektdefinitionen, 42 Fernbedienungstaster sowie die weiterhin benötigten 34 XML-Protokollvorlagen mit 33 Aktionen.

## Installation und kurze Kontrolle am TV

Das neue Installationsarchiv heißt **`iobroker.loewe-tv-0.1.8-tv-epg-only.tgz`**. Die Paketversion bleibt auf Wunsch 0.1.8; das Archiv muss deshalb auch bei bereits installierter 0.1.8 erneut installiert werden. Danach Instanz starten, Admin vollständig neu laden und **`info.adapterBuild = 0.1.8-tv-epg-only.1`** kontrollieren. Die [Installationsanleitung](INSTALLATION.md#update-auf-018) enthält die Installationsbefehle.

Bei eingeschaltetem Fernseher und vorhandener Senderliste `channels.epgRefresh=true` mit `ack:false` auslösen. Anschließend an zwei bekannten TV-Sendern `epg.now.title` und `epg.next.title` mit der Anzeige am Fernseher vergleichen. Die EPG-Einstellungen sollen ausschließlich Aktivierung und Intervall anzeigen; normale ungeschützte Altobjekte aus der Bereinigungsliste sollen nach der Migration fehlen.
