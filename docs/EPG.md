# Laufende und nächste Sendung je TV-Sender

Seit Version **0.1.7** stehen unter jedem vorhandenen TV-Sender die aktuelle und die nächste Sendung zur Verfügung. Der Standardweg liest die Programmdaten aus dem Loewe. Eine konfigurierte XMLTV-Datei kann fehlende Daten ersetzen. Sender werden dafür nicht umgeschaltet; der Adapter liest die Programmtabelle im Hintergrund.

Version **0.1.8** korrigiert die XMLTV-URLprüfung in der Adapter-Konfiguration: Eine fehlerhaft verschachtelte `return`-Anweisung konnte die Speichern-Schaltflächen blockieren. Bestehende Instanzen ohne die neuen EPG-Einstellungen werden ebenfalls akzeptiert. Beim TV-Abruf wurden die dokumentierte Zeitpositionierung und die Verarbeitung der Seitenindizes überarbeitet; ein zusätzlicher Diagnosewert macht das Ergebnis je Sender nachvollziehbar.

Nach Bereitstellung von **0.1.8** hat der Nutzer am **18. Oktober 2026** den erfolgreichen direkten EPG-Abruf vom Fernseher bestätigt: sowohl auf dem **Loewe bild 7.55 / SL420 / V5.4.6.0** als auch auf dem **Loewe bild 5.32 / SL310F / V5.4.6.0**. Die [Kompatibilitätsübersicht](COMPATIBILITY.md) hält diese Gerätekonfigurationen und den Umfang der Bestätigung fest.

Die Rückmeldung bestätigt den funktionierenden TV-EPG-Abruf auf diesen beiden Geräten. Eine EPG-Rohantwort wurde dabei nicht übermittelt; die Verfügbarkeit jedes einzelnen Feldes und die Abdeckung sämtlicher Sender und Zeiträume sind damit nicht einzeln nachgewiesen. Die automatisierten Prüfungen mit simulierten Protokollantworten ergänzen diesen Gerätetest.

## Am Fernseher beginnen

1. Version 0.1.8 installieren und die bestehende Instanz starten. `info.adapterBuild` muss **`0.1.8-epg-config-fix.1`** anzeigen. Eine bereits geöffnete Adapter-Konfiguration anschließend neu öffnen, damit die korrigierte Oberfläche geladen wird.
2. Fernseher einschalten und prüfen, dass die gewünschte Senderliste in der Adapter-Konfiguration ausgewählt ist. Die zugehörigen Sender müssen unter `channels.tv` vorhanden sein.
3. Im Reiter **EPG** die Voreinstellungen verwenden: EPG aktiviert, Quelle **Automatisch**, Abrufintervall **900 Sekunden**.
4. Nach dem Start und der Senderanlage beginnt der erste EPG-Abgleich automatisch. Über **`channels.epgRefresh=true`** kann er jederzeit manuell ausgelöst werden. Wie bei anderen Tastern mit `ack:false` schreiben.
5. Beispielsweise **`channels.tv.Das_Erste_HD.epg.now.title`** und **`epg.next.title`** prüfen. Verwende den tatsächlichen Senderpfad deiner Instanz.

Der Abgleich geht die bekannten, verfügbaren TV-Dienste der ausgewählten Liste durch. Mehrere Programmplätze desselben Dienstes teilen sich ihren Senderordner und dieselbe EPG-Abfrage. Eine XMLTV-Datei erzeugt keine weiteren Senderordner.

## Einstellungen

| Einstellung | Standard | Wirkung |
|---|---|---|
| EPG aktivieren | Ja | Programmdaten lesen und die Anzeige anhand der Uhrzeit aktualisieren. Bei ausgeschaltetem EPG werden aktuelle/nächste Sendung geleert. |
| Quelle | Automatisch (`auto`) | Zuerst den Fernseher abfragen. Bei fehlender aktueller oder nächster Sendung einen konfigurierten XMLTV-Guide versuchen. |
| Quelle: Fernseher (`tv`) | – | Ausschließlich den Loewe verwenden. |
| Quelle: XMLTV (`xmltv`) | – | Ausschließlich die konfigurierte Guide-URL verwenden; keine TV-EPG-Anfrage. |
| Abrufintervall | 900 Sekunden | Zeit zwischen abgeschlossenen Abgleichläufen. Mindestens 300 Sekunden, höchstens 86.400 Sekunden. `0` schaltet automatische Netzabfragen aus; der manuelle Taster bleibt verfügbar. |
| XMLTV-Guide-URL | Leer | Direkte HTTP(S)-Adresse einer XMLTV-Datei, optional Gzip. Für `auto` nur nötig, wenn der TV keine ausreichenden Daten liefert. |
| XMLTV-Senderzuordnungen | Leer | Tabelle aus Sender und XMLTV-ID. Sender ist die relative Ordner-ID oder der genaue Loewe-Sendername. |

Ein Intervall von `0` verhindert auch den automatischen Erstabruf. Bereits gespeicherte Programme werden trotzdem zeitlich weitergeschaltet, solange EPG aktiviert ist. Bei `epgEnabled=false` startet auch der manuelle Taster keinen Import.

Eine laufende Abfrage wird bei mehrfacher Betätigung des Tasters gemeinsam verwendet. Große Senderbestände werden in Abschnitten von bis zu 64 Sendern weiterbearbeitet. Eine manuell gestartete vollständige Runde wird auch bei Intervall `0` zu Ende geführt.

## Datenpunkte am Sender

Alle Pfade in dieser Tabelle sind relativ zum Sender, beispielsweise **`loewe-tv.0.channels.tv.Das_Erste_HD`**. Sämtliche EPG-Zustände sind nur lesbar.

| Datenpunkt | Inhalt |
|---|---|
| `epg.now.available` | `true`, wenn die aktuelle Sendung zeitlich eindeutig bestimmbar ist. |
| `epg.now.title` | Titel der laufenden Sendung. |
| `epg.now.subtitle` | Untertitel oder Episodentitel, sofern geliefert. |
| `epg.now.description` | Beschreibung, sofern geliefert. |
| `epg.now.eventId` | Kennung der Sendung in dieser EPG-Quelle, sofern geliefert. |
| `epg.now.start` | Beginn als Unix-Zeit in Millisekunden. |
| `epg.now.end` | Ende als Unix-Zeit in Millisekunden. |
| `epg.now.endEstimated` | `true`, wenn XMLTV kein Ende lieferte und dieses aus dem nächsten tatsächlich vorhandenen Sendungsbeginn abgeleitet wurde. |
| `epg.next.available` | `true`, wenn eine nächste Sendung eindeutig bestimmbar ist. |
| `epg.next.*` | Dieselben Felder wie `epg.now.*`, für die nächste zukünftige Sendung. |
| `epg.source` | `tv`, `xmltv` oder leer, solange noch keine verwendbare Quelle vorliegt. |
| `epg.sourceChannelId` | Zugeordnete XMLTV-ID; bei TV-Daten leer. Der DVB-Bezug folgt der Medienkennung des Senderobjekts. |
| `epg.lastUpdate` | Zeitpunkt des letzten erfolgreichen Datenabrufs für diesen Sender, in Millisekunden. |
| `epg.status` | Zustand dieses Senders, siehe unten. |
| `epg.lastError` | Letzter Fehler oder Hinweis auf mehrdeutige Zeitdaten. |
| `epg.data` | Zusammenhängender JSON-Wert mit Senderbezug, Quelle, Status, `now`, `next` und seit 0.1.8 `tvDiagnostic`. Für Skripte vorzugsweise diesen Wert verwenden. |
| `epg.cache` | Internes, als Expertenobjekt markiertes Format für den Neustart. Kein stabiler Vertrag für eigene Automationen. |

Fehlende Programme haben `available=false`, leere Texte und Zeiten `0`. In `epg.data` sind sie `null`. Eine bekannte nächste Sendung darf ein unbekanntes Ende haben: Dann ist `next.available=true`, aber `next.end=0`; im JSON ist das Ende `null`. Aus einem bloßen Start ohne Ende wird keine sicher laufende Sendung abgeleitet.

Für eine lokale Anzeige kann JavaScript beispielsweise `new Date(start).toLocaleString('de-DE')` verwenden. Die gespeicherten Millisekunden werden nicht noch einmal um einen Zeitzonenoffset verschoben.

### Statuswerte

| Status | Bedeutung |
|---|---|
| `waiting` | Noch keine gespeicherten oder gelesenen Programmdaten. |
| `ready` | Aktuelle und nächste Sendung sind bestimmbar. Einzelne Texte können trotzdem fehlen. |
| `partial` | Nur ein Teil ist bestimmbar, oder Zeitangaben sind mehrdeutig. |
| `cached` | Der letzte Abruf ist fehlgeschlagen; noch zeitlich passende gespeicherte Programme bleiben sichtbar. `lastError` beschreibt den Fehler. |
| `empty` | Die Quelle wurde gelesen, enthält für diesen Zeitpunkt aber keine passende aktuelle/nächste Sendung. |
| `unmapped` | Für den XMLTV-Guide gibt es keine eindeutige Zuordnung. |
| `unsupported` | Die lokale TV-Quelle kann die Senderkennung nicht verwenden. |
| `error` | Abruf fehlgeschlagen, ohne zeitlich passende gespeicherte Programme. |
| `stale` | Der gespeicherte Abruf ist älter als 24 Stunden. Programme werden ausgeblendet. |
| `disabled` | EPG ist ausgeschaltet. |
| `inactive` | Der Sender ist nicht mehr verfügbar oder sein geschützter Altordner wurde stillgelegt. |

Der Status beschreibt Datenverfügbarkeit, nicht den gerade am Bildschirm gewählten TV-Kanal. `epg.source=tv` bezeichnet die Quelle des Programmplans. Es ist keine Bestätigung einer laufenden Aufnahme.

## Gesamtabgleich beobachten

| Datenpunkt unter `loewe-tv.0` | Verwendung |
|---|---|
| `channels.epgRefresh` | Taster für den vollständigen manuellen Abgleich. |
| `channels.epgStatus` | `waiting`, `updating`, `ready`, `partial`, `empty`, `error`, `disabled` oder `notConfigured`. |
| `channels.epgProgress` | JSON mit `completed`, `total`, `successful`, `failed` und `degraded`. `degraded` zählt erfolgreiche Teilantworten mit einem zusätzlichen Quellenfehler. Während des Laufs werden die Werte fortgeschrieben. |
| `channels.epgLastUpdate` | Abschlusszeit des letzten Laufs seit dem Adapterstart mit mindestens einem erfolgreichen Datenabruf. |
| `channels.epgLastError` | Erste Fehlermeldung des aktuellen beziehungsweise letzten Laufs. Die einzelnen Sender besitzen eigene Fehlermeldungen. |

`channels.epgStatus=ready` bedeutet, dass alle Abrufe dieses Laufs verarbeitet wurden. Ob ein Sender für den aktuellen Zeitpunkt Sendungen geliefert hat, zeigen dessen `epg.status` und `available`-Felder. Eine erfolgreich gelesene leere Antwort ist kein Netzwerkfehler.

### TV-Abruf diagnostizieren

Seit 0.1.8 enthält **`channels.tv.<Sender>.epg.data`** zusätzlich `tvDiagnostic`. Dieser Wert hält den letzten TV-Versuch für diesen Sender seit der Initialisierung fest. Er bleibt auch dann sichtbar, wenn anschließend XMLTV erfolgreich Daten liefert und `epg.source=xmltv` ist. `at` ist der Zeitpunkt des Versuchs oder des Überspringens als Unix-Zeit in Millisekunden.

| Form von `tvDiagnostic` | Bedeutung |
|---|---|
| `null` | Für diesen Sender wurde seit der Initialisierung noch kein TV-Versuch erfasst, beispielsweise bei ausschließlicher XMLTV-Nutzung. |
| `{at, status: "received", details}` | Der TV-Abruf wurde erfolgreich verarbeitet. Die Antwort kann trotzdem leer sein oder nur unvollständige EPG-Felder enthalten. |
| `{at, status: "error", code, details}` | Der TV-Versuch ist fehlgeschlagen. `code` bezeichnet die Fehlerklasse; `details` enthält die verfügbaren Protokollmetadaten und kann `null` sein. |
| `{at, status: "skipped", reason: "previousFailure", code, blockedByChannel}` | In diesem Lauf wurde wegen eines vorherigen TV-Fehlers keine eigene Anfrage für diesen Sender gesendet. `blockedByChannel` benennt den Sender, bei dessen Versuch die Sperre entstand. |
| `{at, status: "skipped", reason: "notConfigured", code: "EPG_TV_UNAVAILABLE"}` | Für die lokale Abfrage ist noch kein TV-Client konfiguriert. |

Die `details` zeigen unter anderem `schema` (`extended` oder `basic`), `dvb`, `requests`, `pages`, `rows`, `fallbackUsed` sowie Metadaten zu `request` und `response`. Besonders hilfreich sind die angefragten Feldnummern, `request.startIndex`, `request.seek`, `response.startIndex`, `response.totalResults`, `response.returnedResults` und `response.columnCounts`. Bei erfolgreichem Abruf beschreibt `firstIndex` den tatsächlichen ersten Seitenindex. Eine ausgelassene Anfrage mit `previousFailure` ist kein Beleg dafür, dass genau dieser Sender fehlerhafte EPG-Daten liefert.

Die Diagnosedetails enthalten keine Rohantworten, Client-IDs, URLs, Sendungstitel oder Beschreibungen. Sie sind auf 8 KiB begrenzt; bei Überschreitung steht dort `{omitted: true, reason: "size"}`, bei nicht serialisierbaren Details `{omitted: true, reason: "format"}`. Die normalen `now`-/`next`-Felder enthalten weiterhin die Programminformationen.

Wenn keine TV-Daten erscheinen, zunächst `channels.epgRefresh=true` auslösen und anschließend `tvDiagnostic` und `epg.lastError` eines betroffenen Senders prüfen. Bei `previousFailure` ist die Diagnose unter `blockedByChannel` maßgeblich. Ein manueller neuer Abgleich prüft die TV-Feldunterstützung erneut. Die [Protokolldokumentation](epg-protocol.md) erklärt die geprüften Antwortformen und die Grenzen der bisherigen Gerätebestätigung.

## XMLTV als Ersatzquelle

Das vorgeschlagene Projekt **[iptv-org/epg](https://github.com/iptv-org/epg)** erzeugt XMLTV-Dateien auf einem eigenen Rechner oder Server. Eine verlässlich nutzbare öffentliche deutsche Standardadresse wurde bei der Umsetzung nicht gefunden. Deshalb benötigt der Adapter eine konkrete Guide-URL; im ausgelieferten Standard bleibt das Feld leer.

Die [vollständige XMLTV-Anleitung](XMLTV.md) enthält eine Docker-Compose-Konfiguration, die Senderdatei für ein kleines deutsches Beispiel und passende Senderzuordnungen. Die Adresse lautet bei dieser Einrichtung beispielsweise `http://<IP-des-EPG-Rechners>:3000/guide.xml`.

Der Adapter lädt einen benötigten Guide einmal pro Abgleichlauf. Ohne explizite Zuordnung verwendet er nur eindeutig übereinstimmende Sendernamen. HD, SD und regionale Zusätze bleiben Teil des Namens. Eine manuelle Zuordnung kann beispielsweise `channels.tv.Das_Erste_HD` auf die zum tatsächlichen Programm passende XMLTV-ID legen.

Im automatischen Modus wird für jeden Sender ein zusammenhängender Datenbestand aus einer Quelle verwendet. Ein Bestand mit aktueller und nächster Sendung wird bevorzugt. Ist nur eine der beiden verfügbar, erhält die aktuelle Sendung Vorrang; bei gleicher Bewertung bleibt die TV-Quelle. Titel, Zeiten und Ereigniskennungen verschiedener Quellen werden nicht zu einer Sendung vermischt. Ein Fehler des XMLTV-Servers verändert `info.connection` zum Fernseher nicht.

## Verhalten bei Standby, Neustart und Senderänderungen

Der Adapter berechnet die Anzeige aus den gespeicherten Start-/Endzeiten neu, spätestens jede Minute und zusätzlich an bekannten Sendungsgrenzen. Dafür fragt er den Fernseher nicht erneut ab. Nach dem Ende verschwindet eine alte Sendung aus `now`; eine vorhandene Folgesendung rückt entsprechend nach. Das funktioniert auch im Standby, solange der gespeicherte Plan noch passende Daten enthält.

Ein fehlgeschlagener Abruf löscht einen noch brauchbaren Plan nicht sofort. Die Sendungszeiten und zusätzlich eine maximale Cache-Altersgrenze von 24 Stunden begrenzen seine Verwendung. Ein erfolgreich gelesener leerer Plan ersetzt den bisherigen Bestand, sofern dabei kein zusätzlicher Quellenfehler auftrat. Liefert der TV leer und scheitert der XMLTV-Ersatz, bleibt ein noch gültiger Cache sichtbar. Eine falsche Systemzeit auf dem ioBroker-Rechner führt zu einer falschen zeitlichen Auswahl; der Adapter stellt diese Uhr nicht um.

Beim Neustart wird der gespeicherte Plan nur übernommen, wenn Senderdienst, Senderliste und EPG-Konfiguration einschließlich Quelle, URL und Zuordnungen übereinstimmen. Eine Positionsänderung desselben Dienstes setzt die EPG-Daten nicht zurück. Ein anderer Dienst unter derselben Namens-ID erhält einen neuen Plan. Vor dem Ersetzen oder Entfernen eines Ordners werden alte Veröffentlichungen gesperrt und bereits begonnene Datenbankschreibvorgänge abgewartet. Geschützte Altordner bleiben mit `inactive` und geleerten Programmfeldern erhalten.

Scheitert die lokale EPG-Initialisierung beim Lesen oder Veröffentlichen des Caches durch einen Datenbankfehler, kann ein manueller Abgleich die Initialisierung erneut versuchen. Bei aktiviertem EPG und einem Abrufintervall größer als `0` wird nach einem solchen Fehler automatisch nach 30 Sekunden ein weiterer Versuch eingeplant. Bei Intervall `0` bleibt dieser Wiederholungsversuch manuell. Das betrifft die lokale Initialisierung; das normale Intervall für erfolgreiche Abgleichläufe bleibt unverändert.

Überlappende Sendungen oder mehrere unterschiedliche Sendungen mit demselben nächsten Beginn werden nicht willkürlich aufgelöst. Die betroffenen Angaben bleiben leer, der Status zeigt `partial`.

## Umfang und Belastung

Lokales TV-EPG wird über `CreateIterator` auf `de.loewe.sl2.epg` gelesen. Die dokumentierten DVB-Kennungen aus `mediaItemUuid` werden abgeglichen. Die [Protokolldokumentation](epg-protocol.md) erklärt die belegten Grundfelder, die zusätzlich veröffentlichten Endzeit-/Textfelder und das begrenzte Zurückfallen auf das Grundschema.

Jede lokale SOAP-Anfrage steht einzeln in der vorhandenen TV-Warteschlange. Zwischen den Antworten können Fernbedienungsbefehle ausgeführt werden. Es werden keine Hunderte gleichzeitigen TV-Anfragen gestartet. Verbindungsfehler und zurückgewiesene SOAP-Funktionen beenden weitere gleichartige lokale Versuche innerhalb dieses Laufs; eine konfigurierte Ersatzquelle bleibt nutzbar.

| Begrenzung | Wert |
|---|---|
| TV-Zeitfenster | Bis zu 24 Stunden rückwärts und 24 Stunden voraus |
| TV-Abfrage pro Sender | Bis zu 4 Seiten mit je 64 Zeilen, höchstens 30 Sekunden |
| Ein Bearbeitungsabschnitt | Bis zu 64 Sender mit 90 Sekunden Abruffrist; danach bei Bedarf Fortsetzung. Abschließende Datenbankschreibvorgänge kommen hinzu. |
| Gespeicherte Ereignisse je Sender | Höchstens 128, zusätzlich durch das Bytebudget begrenzt |
| Persistenter Einzelcache | Höchstens 128 KiB; bei vielen Sendern entsprechend kleiner |
| Gemeinsames Budget der normalisierten Sendercaches | 16 MiB berechnete JSON-Daten; kein Limit des gesamten Node.js-Prozesses |
| `tvDiagnostic.details` | Höchstens 8 KiB serialisierte Metadaten je Sender; keine Rohantwort |

Lange Beschreibungen oder weit entfernte zukünftige Sendungen können zur Einhaltung der Cachegrenzen gekürzt werden. Der Adapter erhält dafür die Informationen zur aktuellen und nächsten Sendung einschließlich möglicher Mehrdeutigkeiten. Bei nicht sicher kürzbaren Daten meldet er einen Fehler. Die gesonderten Download- und Speichergrenzen des XMLTV-Imports stehen in [XMLTV.md](XMLTV.md#betriebsgrenzen-des-imports).

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

Dies zeigt nur Daten an. Auch Version 0.1.8 legt noch keine Aufnahmeaufträge oder TV-Timer an. Dafür werden vollständige Sendungszeiten, die Zuordnung zum TV und ein am Gerät bestätigter Timerablauf benötigt. Der weitere Ausbau steht in der [Roadmap](ROADMAP.md).
