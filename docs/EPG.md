# TV-EPG: Programmübersicht und Datenpunkte

Version **0.1.10**, Build **`0.1.10-epg-guide.1`**, ergänzt eine **Programmübersicht direkt in der Instanz-Konfiguration unter EPG**. Sie zeigt die TV-Sender der gespeicherten Senderliste mit einer gemeinsamen Zeitleiste und den vom Fernseher gelieferten Sendungen. Ein Klick auf eine Sendung öffnet deren Details. Die bisherigen Datenpunkte für die aktuelle und die nächste Sendung bleiben unter jedem TV-Sender erhalten.

Programmdaten stammen weiterhin ausschließlich direkt vom Loewe-TV. Der Hintergrundabruf und die Auswahl in der Übersicht schalten keinen Sender um. Die neue Ansicht verwendet den vorhandenen EPG-Cache; sie führt keine zusätzliche EPG-Quelle und keine neuen Datenpunkte ein. Die [Netzwerksuche](NETWORK_DISCOVERY.md) hilft bei der Auswahl der TV-Adresse.

Der Nutzer hat am **18. Oktober 2026** den erfolgreichen direkten EPG-Abruf vom Fernseher bestätigt: auf dem **Loewe bild 7.55 / SL420 / V5.4.6.0** und auf dem **Loewe bild 5.32 / SL310F / V5.4.6.0**. Diese Rückmeldungen betreffen den zuvor bereitgestellten 0.1.8-Stand. **Für die neue Programmübersicht und den Build `0.1.10-epg-guide.1` liegt noch kein eigener Gerätetest vor.** Die [Kompatibilitätsübersicht](COMPATIBILITY.md) hält den bestätigten Umfang fest. Der [Prüfbericht zu `0.1.8-tv-epg-only.1`](PRUEFBERICHT_0.1.8_TV_EPG.md) dokumentiert die vorherige TV-EPG-Bereinigung.

Die bisherigen Rückmeldungen bestätigen den funktionierenden TV-Abruf auf diesen Geräten. Eine EPG-Rohantwort wurde dabei nicht übermittelt; die Verfügbarkeit jedes einzelnen Feldes und die Abdeckung sämtlicher Sender und Zeiträume sind damit nicht einzeln nachgewiesen. Aufnahmeaufträge und TV-Timer bleiben geplant.

## Programmübersicht in der Instanz

Öffne in ioBroker Admin **Instanzen → loewe-tv.0 → Konfiguration → EPG**. Unter **Programminformationen aktivieren** und **EPG-Aktualisierung (Sekunden)** steht die eingebettete **Programmübersicht**. Voraussetzung sind **Admin ab 7.7.28**, eine laufende Adapterinstanz und eine gespeicherte TV-Senderliste. Die Ansicht verwendet deine bestehende Admin-Sitzung und benötigt keinen zusätzlichen Port.

Links stehen Senderposition und Sendername, rechts die Sendungen auf einer gemeinsamen Zeitachse. Oben erscheinen Titel, Zeiten und die verfügbare Beschreibung der ausgewählten Sendung. Über **Sender suchen**, Datum, Stundenpfeile, **Jetzt** und den Zeitraum von **2, 3 oder 6 Stunden** lässt sich die Vorschau eingrenzen. **EPG aktualisieren** startet den vorhandenen TV-Abgleich im Hintergrund. Eine Sendung anzuklicken zeigt nur ihre Informationen.

Die Übersicht kann mehr als `now` und `next` darstellen, sofern der TV weitere Sendungen geliefert hat und sie im Cache vorhanden sind. Der TV-Abruf reicht ungefähr bis 24 Stunden voraus; eine vollständige Vorschau für 48 Stunden oder eine Programmhistorie wird nicht zugesagt. Sender ohne passende Daten bleiben als Zeilen sichtbar. Die [Bedienungsanleitung zur Programmübersicht](EPG_GUI.md) erklärt den Bildaufbau, die Zeitnavigation und die Statusmeldungen.

## Am Fernseher beginnen

1. Das neue Archiv **`iobroker.loewe-tv-0.1.10-epg-guide.1.tgz`** nach der [Updateanleitung](INSTALLATION.md#update-auf-0110) installieren und die bestehende Instanz starten. Ein Neustart allein übernimmt das Update nicht. `info.adapterBuild` muss **`0.1.10-epg-guide.1`** anzeigen. Für die eingebettete Übersicht wird **Admin ab 7.7.28** benötigt. Admin vollständig neu laden und die Adapter-Konfiguration neu öffnen.
2. Fernseher einschalten und prüfen, dass die gewünschte Senderliste in der Adapter-Konfiguration ausgewählt ist. Die zugehörigen Sender müssen unter `channels.tv` vorhanden sein.
3. Im Reiter **EPG** die Voreinstellungen verwenden: **Programminformationen aktivieren** eingeschaltet, Abrufintervall **900 Sekunden**.
4. Nach dem Start und der Senderanlage beginnt der erste EPG-Abgleich automatisch. **EPG aktualisieren** in der Übersicht startet ihn auch manuell. Alternativ **`channels.epgRefresh=true`** wie bei anderen Tastern mit `ack:false` schreiben.
5. Beispielsweise **`channels.tv.Das_Erste_HD.epg.now.title`** und **`epg.next.title`** prüfen. Verwende den tatsächlichen Senderpfad deiner Instanz.

Der Abgleich geht die bekannten, verfügbaren TV-Dienste der ausgewählten Liste durch. Mehrere Programmplätze desselben Dienstes teilen sich ihren Senderordner und dieselbe EPG-Abfrage.

## Einstellungen

| Einstellung | Standard | Wirkung |
|---|---|---|
| Programminformationen aktivieren (`epgEnabled`) | Ja | Programmdaten lesen und die Anzeige anhand der Uhrzeit aktualisieren. Bei ausgeschaltetem EPG werden aktuelle/nächste Sendung geleert. |
| EPG-Aktualisierung (Sekunden) (`epgRefreshInterval`) | 900 Sekunden | Zeit zwischen abgeschlossenen Abgleichläufen. Ganze Werte von 300 bis 86.400 Sekunden. `0` schaltet automatische Netzabfragen aus; die Schaltfläche in der Übersicht und der manuelle Taster bleiben verfügbar. |

Ein Intervall von `0` verhindert auch den automatischen Erstabruf. Bereits gespeicherte Programme werden trotzdem zeitlich weitergeschaltet, solange EPG aktiviert ist. Bei `epgEnabled=false` starten weder die Schaltfläche noch der manuelle Taster einen Import.

Eine laufende Abfrage wird bei mehrfacher Betätigung des Tasters gemeinsam verwendet. Große Senderbestände werden in Abschnitten von bis zu 64 Sendern weiterbearbeitet. Eine manuell gestartete vollständige Runde wird auch bei Intervall `0` zu Ende geführt.

Die Einstellungen wirken nach dem Speichern. Das Blättern, Suchen oder Auswählen in der Programmübersicht verändert die Instanz-Konfiguration nicht. Die Übersicht verwendet stets die gespeicherte TV-Adresse und Senderliste; Änderungen im noch ungespeicherten Formular sind dort noch nicht aktiv.

## Datenpunkte am Sender

Alle Pfade in dieser Tabelle sind relativ zum Sender, beispielsweise **`loewe-tv.0.channels.tv.Das_Erste_HD`**. Sämtliche EPG-Zustände sind nur lesbar.

| Datenpunkt | Inhalt |
|---|---|
| `epg.now.available` | `true`, wenn die aktuelle Sendung zeitlich eindeutig bestimmbar ist. |
| `epg.now.title` | Titel der laufenden Sendung. |
| `epg.now.subtitle` | Untertitel oder Episodentitel, sofern geliefert. |
| `epg.now.description` | Beschreibung, sofern geliefert. |
| `epg.now.eventId` | Kennung der Sendung im TV-EPG, sofern geliefert. |
| `epg.now.start` | Beginn als Unix-Zeit in Millisekunden. |
| `epg.now.end` | Ende als Unix-Zeit in Millisekunden. |
| `epg.next.available` | `true`, wenn eine nächste Sendung eindeutig bestimmbar ist. |
| `epg.next.*` | Dieselben Felder wie `epg.now.*`, für die nächste zukünftige Sendung. |
| `epg.lastUpdate` | Zeitpunkt des letzten erfolgreichen Datenabrufs für diesen Sender, in Millisekunden. |
| `epg.status` | Zustand dieses Senders, siehe unten. |
| `epg.lastError` | Letzter Fehler oder Hinweis auf mehrdeutige Zeitdaten. |
| `epg.data` | Zusammenhängender JSON-Wert mit `schemaVersion: 2`, Senderbezug, Status, `now`, `next` und `tvDiagnostic`. Für Skripte vorzugsweise diesen Wert verwenden. |
| `epg.cache` | Internes, als Expertenobjekt markiertes Format für den Neustart. Kein stabiler Vertrag für eigene Automationen. |

Fehlende Programme haben `available=false`, leere Texte und Zeiten `0`. In `epg.data` sind sie `null`. Eine bekannte nächste Sendung darf ein unbekanntes Ende haben: Dann ist `next.available=true`, aber `next.end=0`; im JSON ist das Ende `null`. Aus einem bloßen Start ohne Ende wird keine sicher laufende Sendung abgeleitet.

Endzeiten werden nur verwendet, wenn der TV sie liefert. Der nächste Sendungsbeginn wird nicht als Ende der aktuellen Sendung eingesetzt.

Für eine lokale Anzeige kann JavaScript beispielsweise `new Date(start).toLocaleString('de-DE')` verwenden. Die gespeicherten Millisekunden werden nicht noch einmal um einen Zeitzonenoffset verschoben.

### Zusammenhängendes JSON für Skripte

`epg.data` wird nach den einzelnen Anzeigezuständen als vollständiger Wert veröffentlicht. Seine Felder sind:

| JSON-Feld | Inhalt |
|---|---|
| `schemaVersion` | `2` für diesen Build. |
| `channel` | Senderbezug mit `id`, `name`, `mediaItemUuid` und `listView`. Die Listenkennung bleibt hier enthalten, auch wenn es keinen eigenen `listView`-Datenpunkt je Sender mehr gibt. |
| `status`, `lastUpdate`, `lastError` | Abrufzustand, Zeitpunkt des letzten erfolgreichen Abrufs und Fehlermeldung. |
| `now`, `next` | Sendungsobjekt mit `eventId`, `title`, `subtitle`, `description`, `start` und `end`, oder `null`, wenn die Sendung nicht eindeutig bestimmbar ist. |
| `tvDiagnostic` | Befund des letzten TV-Versuchs, siehe unten; vor dem ersten Versuch `null`. |

Automationen sollten sich bei zusammengehörenden Angaben auf dieses JSON stützen, damit Titel und Zeiten aus demselben veröffentlichten Stand stammen.

### Statuswerte

| Status | Bedeutung |
|---|---|
| `waiting` | Noch keine gespeicherten oder gelesenen Programmdaten. |
| `ready` | Aktuelle und nächste Sendung sind bestimmbar. Einzelne Texte können trotzdem fehlen. |
| `partial` | Nur ein Teil ist bestimmbar, oder Zeitangaben sind mehrdeutig. |
| `cached` | Der letzte Abruf ist fehlgeschlagen; noch zeitlich passende gespeicherte Programme bleiben sichtbar. `lastError` beschreibt den Fehler. |
| `empty` | Der TV wurde erfolgreich abgefragt, enthält für diesen Zeitpunkt aber keine passende aktuelle/nächste Sendung. |
| `unsupported` | Der TV-Abruf kann die Senderkennung nicht verwenden. |
| `error` | Abruf fehlgeschlagen, ohne zeitlich passende gespeicherte Programme. |
| `stale` | Der gespeicherte Abruf ist älter als 24 Stunden. Programme werden ausgeblendet. |
| `disabled` | EPG ist ausgeschaltet. |
| `inactive` | Der Sender ist nicht mehr verfügbar oder sein geschützter Altordner wurde stillgelegt. |

Der Status beschreibt die Datenverfügbarkeit des Programms. Er bestätigt weder den gerade am Bildschirm gewählten TV-Kanal noch eine laufende Aufnahme.

## Gesamtabgleich beobachten

| Datenpunkt unter `loewe-tv.0` | Verwendung |
|---|---|
| `channels.epgRefresh` | Taster für den vollständigen manuellen Abgleich. |
| `channels.epgStatus` | `waiting`, `updating`, `ready`, `partial`, `empty`, `error`, `disabled` oder `notConfigured`. |
| `channels.epgProgress` | Während eines Laufs JSON mit `completed`, `total`, `successful` und `failed`. Die Werte werden während der Verarbeitung fortgeschrieben. |
| `channels.epgLastUpdate` | Abschlusszeit des letzten Laufs seit dem Adapterstart mit mindestens einem erfolgreichen Datenabruf. |
| `channels.epgLastError` | Erste Fehlermeldung des aktuellen beziehungsweise letzten Laufs. Die einzelnen Sender besitzen eigene Fehlermeldungen. |

`channels.epgStatus=ready` bedeutet, dass der Lauf abgeschlossen ist und keine TV-Abfrage fehlgeschlagen ist. Ob ein Sender für den aktuellen Zeitpunkt Sendungen geliefert hat, zeigen dessen `epg.status` und `available`-Felder. Eine erfolgreich gelesene leere Antwort ist kein Netzwerkfehler.

### TV-Abruf diagnostizieren

Das Feld **`tvDiagnostic`** im JSON-Datenpunkt **`channels.tv.<Sender>.epg.data`** hält den letzten TV-Versuch für diesen Sender seit der Initialisierung fest. `at` ist der Zeitpunkt des Versuchs oder des Überspringens als Unix-Zeit in Millisekunden.

| Form von `tvDiagnostic` | Bedeutung |
|---|---|
| `null` | Für diesen Sender wurde seit der Initialisierung noch kein TV-Versuch erfasst, beispielsweise vor dem ersten manuellen Abruf bei Intervall `0`. |
| `{at, status: "received", details}` | Der TV-Abruf wurde erfolgreich verarbeitet. Die Antwort kann trotzdem leer sein oder nur unvollständige EPG-Felder enthalten. |
| `{at, status: "error", code, details}` | Der TV-Versuch ist fehlgeschlagen. `code` bezeichnet die Fehlerklasse; `details` enthält die verfügbaren Protokollmetadaten und kann `null` sein. |
| `{at, status: "skipped", reason: "previousFailure", code, blockedByChannel}` | In diesem Lauf wurde wegen eines vorherigen TV-Fehlers keine eigene Anfrage für diesen Sender gesendet. `blockedByChannel` benennt den Sender, bei dessen Versuch die Sperre entstand. |
| `{at, status: "skipped", reason: "notConfigured", code: "EPG_TV_UNAVAILABLE"}` | Für die lokale Abfrage ist noch kein TV-Client konfiguriert. |

Die `details` zeigen unter anderem `schema` (`extended` oder `basic`), `dvb`, `requests`, `pages`, `rows`, `fallbackUsed` sowie Metadaten zu `request` und `response`. Besonders hilfreich sind die angefragten Feldnummern, `request.startIndex`, `request.seek`, `response.startIndex`, `response.totalResults`, `response.returnedResults` und `response.columnCounts`. Bei erfolgreichem Abruf beschreibt `firstIndex` den tatsächlichen ersten Seitenindex. Eine ausgelassene Anfrage mit `previousFailure` ist kein Beleg dafür, dass genau dieser Sender fehlerhafte EPG-Daten liefert.

Die Diagnosedetails enthalten keine Rohantworten, Client-IDs, URLs, Sendungstitel oder Beschreibungen. Sie sind auf 8 KiB begrenzt; bei Überschreitung steht dort `{omitted: true, reason: "size"}`, bei nicht serialisierbaren Details `{omitted: true, reason: "format"}`. Die normalen `now`-/`next`-Felder enthalten weiterhin die Programminformationen.

Wenn keine TV-Daten erscheinen, zunächst `channels.epgRefresh=true` auslösen und anschließend `tvDiagnostic` und `epg.lastError` eines betroffenen Senders prüfen. Bei `previousFailure` ist die Diagnose unter `blockedByChannel` maßgeblich. Ein manueller neuer Abgleich prüft die TV-Feldunterstützung erneut. Die [Protokolldokumentation](epg-protocol.md) erklärt die geprüften Antwortformen und die Grenzen der bisherigen Gerätebestätigung.

## Verhalten bei Standby, Neustart und Senderänderungen

Der Adapter berechnet die Anzeige aus den gespeicherten Start-/Endzeiten neu, spätestens jede Minute und zusätzlich an bekannten Sendungsgrenzen. Dafür fragt er den Fernseher nicht erneut ab. Nach dem Ende verschwindet eine alte Sendung aus `now`; eine vorhandene Folgesendung rückt entsprechend nach. Das funktioniert auch im Standby, solange der gespeicherte Plan noch passende Daten enthält.

Laut [Nutzerrückmeldung zum Einschalten](COMPATIBILITY.md) schaltet der getestete TV ohne Schnellstart seine Netzwerkfunktionen im Standby ab. Dann können keine frischen EPG-Daten gelesen werden, bis der Fernseher wieder erreichbar ist. Der Schnellstart muss direkt am TV aktiviert werden; das Einschalten über den Datenpunkt funktioniert bei diesem Gerät nur mit aktivierter Einstellung.

Ein fehlgeschlagener TV-Abruf löscht einen noch brauchbaren Plan nicht sofort. Die Sendungszeiten und zusätzlich eine maximale Cache-Altersgrenze von **24 Stunden** begrenzen seine Verwendung. Ein erfolgreich gelesener leerer Plan ersetzt den bisherigen Bestand. Eine falsche Systemzeit auf dem ioBroker-Rechner führt zu einer falschen zeitlichen Auswahl; der Adapter stellt diese Uhr nicht um.

Beim Neustart wird der gespeicherte Plan nur übernommen, wenn er gültig ist und zum selben TV-Dienst sowie zur selben Senderliste gehört. Der interne Cache verwendet **Schema 2** und enthält zur Herkunftsprüfung fest `source: "tv"`. Gültige TV-Caches aus Schema 1 werden bei passender Identität und gültigem Alter in Schema 2 übernommen. Alte XMLTV-Caches, unbekannte Herkunft, unpassende Identitäten, ungültige Zeitdaten und geschätzte Endzeiten werden verworfen. Diese Prüfung erfolgt vor dem ersten neuen TV-Abruf; alte Fremddaten erscheinen deshalb auch bei Intervall `0` nicht weiter als aktuelles Programm.

Eine Positionsänderung desselben Dienstes setzt die EPG-Daten nicht zurück. Ein anderer Dienst unter derselben Namens-ID erhält einen neuen Plan. Vor dem Ersetzen oder Entfernen eines Ordners werden alte Veröffentlichungen gesperrt und bereits begonnene Datenbankschreibvorgänge abgewartet. Geschützte Altordner bleiben mit `inactive` und geleerten Programmfeldern erhalten. Die Entfernung früherer Kinddatenpunkte berücksichtigt Eigentum und Löschschutz; Einzelheiten stehen in der [Updateanleitung](INSTALLATION.md#datenpunktbereinigung-beim-update).

Scheitert die lokale EPG-Initialisierung beim Lesen oder Veröffentlichen des Caches durch einen Datenbankfehler, kann ein manueller Abgleich die Initialisierung erneut versuchen. Bei aktiviertem EPG und einem Abrufintervall größer als `0` wird nach einem solchen Fehler automatisch nach 30 Sekunden ein weiterer Versuch eingeplant. Bei Intervall `0` bleibt dieser Wiederholungsversuch manuell. Das betrifft die lokale Initialisierung; das normale Intervall für erfolgreiche Abgleichläufe bleibt unverändert.

Überlappende Sendungen oder mehrere unterschiedliche Sendungen mit demselben nächsten Beginn werden nicht willkürlich aufgelöst. Die betroffenen Angaben bleiben leer, der Status zeigt `partial`.

## Umfang und Belastung

Lokales TV-EPG wird über `CreateIterator` auf `de.loewe.sl2.epg` gelesen. Die dokumentierten DVB-Kennungen aus `mediaItemUuid` werden abgeglichen. Die [Protokolldokumentation](epg-protocol.md) erklärt die belegten Grundfelder, die zusätzlich veröffentlichten Endzeit-/Textfelder und das begrenzte Zurückfallen auf das Grundschema.

Jede lokale SOAP-Anfrage steht einzeln in der vorhandenen TV-Warteschlange. Zwischen den Antworten können Fernbedienungsbefehle ausgeführt werden. Es werden keine Hunderte gleichzeitigen TV-Anfragen gestartet. Verbindungsfehler und zurückgewiesene SOAP-Funktionen beenden weitere gleichartige TV-Versuche innerhalb dieses Laufs. Ein späterer Abgleich versucht den TV-Abruf erneut.

| Begrenzung | Wert |
|---|---|
| TV-Zeitfenster | Bis zu 24 Stunden rückwärts und 24 Stunden voraus |
| TV-Abfrage pro Sender | Bis zu 4 Seiten mit je 64 Zeilen, höchstens 30 Sekunden |
| Ein Bearbeitungsabschnitt | Bis zu 64 Sender mit 90 Sekunden Abruffrist; danach bei Bedarf Fortsetzung. Abschließende Datenbankschreibvorgänge kommen hinzu. |
| Gespeicherte Ereignisse je Sender | Höchstens 128, zusätzlich durch das Bytebudget begrenzt |
| Persistenter Einzelcache | Höchstens 128 KiB; bei vielen Sendern entsprechend kleiner |
| Gemeinsames Budget der normalisierten Sendercaches | 16 MiB berechnete JSON-Daten; kein Limit des gesamten Node.js-Prozesses |
| `tvDiagnostic.details` | Höchstens 8 KiB serialisierte Metadaten je Sender; keine Rohantwort |

Lange Beschreibungen oder weit entfernte zukünftige Sendungen können zur Einhaltung der Cachegrenzen gekürzt werden. Der Adapter erhält dafür die Informationen zur aktuellen und nächsten Sendung einschließlich möglicher Mehrdeutigkeiten. Bei nicht sicher kürzbaren Daten meldet er einen Fehler.

Die Programmübersicht liest ausschließlich den bereits geladenen Bestand im Arbeitsspeicher. Öffnen, Suchen, Blättern und das regelmäßige Nachladen der Anzeige lösen keine zusätzlichen SOAP-Abfragen aus und lesen nicht erneut alle EPG-Datenpunkte aus der Datenbank. Die Daten werden in begrenzten Seiten übertragen; die Oberfläche setzt diese zu den Senderzeilen zusammen. Nur **EPG aktualisieren** fordert ausdrücklich einen neuen TV-Abgleich an. Die vorhandenen Quellen-, Cache- und Datenpunktformate bleiben unverändert.

## Für spätere Automationen

Für eine zusammenhängende Auswertung eignet sich `epg.data`. Ein einfaches Beispiel für den ioBroker-JavaScript-Adapter:

```javascript
on({ id: 'loewe-tv.0.channels.tv.Das_Erste_HD.epg.data', change: 'ne' }, event => {
    let guide;
    try { guide = JSON.parse(event.state.val); } catch { return; }
    if (guide.now) log(`Jetzt: ${guide.now.title}`);
    if (guide.next) log(`Danach: ${guide.next.title}`);
});
```

Dies zeigt nur Daten an. Auch Version 0.1.10 und die neue Programmübersicht legen noch keine Aufnahmeaufträge oder TV-Timer an. Dafür werden vollständige Sendungszeiten, die Zuordnung zum TV und ein am Gerät bestätigter Timerablauf benötigt. Der weitere Ausbau steht in der [Roadmap](ROADMAP.md).
