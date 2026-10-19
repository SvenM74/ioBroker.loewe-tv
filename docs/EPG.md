# EPG: Programmübersicht, XMLTV und Datenpunkte

Diese Anleitung gilt für Version **0.1.21**, Build **`0.1.21-direct-links.1`**. Die Instanz-Konfiguration hat eigene Reiter für **EPG-Einstellungen**, **Web-Zugriff** und **Programmübersicht**. Die Übersicht zeigt die gespeicherte TV-Senderliste mit Zeitachse und Details. Aus einer ausgewählten Sendung kannst du auf ein aktuell eindeutig laufendes Programm umschalten oder eine zukünftige Aufnahme nach Bestätigung vormerken. Die Datenpunkte für aktuelle und nächste Sendung bleiben unter jedem TV-Sender erhalten; Aufnahmeaufträge stehen im dauerhaften Journal `recordings.jobs`.

Programmdaten stammen je nach gespeicherter **EPG-Quelle** vom Loewe-TV, aus einer selbst eingetragenen XMLTV-Quelle oder aus beiden Quellen. Standard ist **Nur TV**. XMLTV kann auch bei ausgeschaltetem Fernseher frische Programme liefern; dafür müssen die TV-Senderliste bereits gespeichert und die externe Quelle erreichbar sein. Die Übersicht und die Datenpunkte verwenden denselben daraus abgeleiteten Plan. Reines Blättern, Suchen und Lesen lädt keine Quelle neu. Die vollständige [XMLTV-Anleitung](EPG_XMLTV.md) erklärt Einrichtung, automatische Zuordnung, manuelle Korrekturen und Datenumfang. Die [Netzwerksuche](NETWORK_DISCOVERY.md) hilft bei der Auswahl der TV-Adresse.

Der Nutzer hat den direkten TV-EPG-Abruf mit dem früheren 0.1.8-Stand auf **Loewe bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** bestätigt. Diese Rückmeldungen belegen nicht jedes einzelne EPG-Feld oder sämtliche Sender und Zeiträume. Am **19. Oktober 2026** meldet er außerdem zwei am TV angekommene Aufnahmeaufträge und den Start der ersten Aufnahme. Version **0.1.13** trennt die Anzeige der Übertragung von einer noch offenen Timerbestätigung. Die originale XML-Timerantwort und ein erfolgreicher Aufnahmeabschluss sind weiterhin nicht dokumentiert. Die [Kompatibilitätsübersicht](COMPATIBILITY.md) beschreibt den bisherigen Nachweis; der [Prüfbericht zu 0.1.8](PRUEFBERICHT_0.1.8_TV_EPG.md) bleibt als historischer Bericht erhalten.

Die jüngste Rückmeldung bestätigt erste erfolgreiche Tests der Fernbedienung über den Remote-Zugang und die Übertragung wartender Aufnahmeaufträge nach dem Einschalten des Fernsehers. Die unmittelbare Timerübertragung im Standby mit aktiviertem Schnellstart ist damit noch nicht geprüft. Daraus folgt auch keine vollständige Prüfung aller Fernbedienungstasten oder der neuen XMLTV-Quelle.

## Programmübersicht in der Instanz

Öffne **Instanzen → loewe-tv.0 → Konfiguration**. **EPG-Einstellungen** enthält Aktivierung, Abrufintervall, Quellenwahl und XMLTV-Zuordnung. **Programmübersicht** enthält die Senderzeilen, Zeitachse, Detailauswahl, Fernbedienung und Aufnahmeaufträge. Voraussetzung sind **Admin ab 8.0.22**, eine laufende Adapterinstanz und die gespeicherte TV-Senderliste.

**Jetzt ansehen** prüft serverseitig, ob die ausgewählte Sendung eindeutig läuft, und kontrolliert dies nochmals unmittelbar vor dem Umschaltbefehl. **Aufnahme planen** öffnet für eine zukünftige Sendung den Bestätigungsdialog. Vergangene, veraltete oder zeitlich mehrdeutige Programme und Sendungen ohne bekannte Start- und Endzeit erlauben diese Aktionen nicht.

Der Pfeil in der Zeile **loewe-tv.0** öffnet direkt deren Programmübersicht, der Pfeil von **loewe-tv.1** entsprechend die zweite. **Admin ab 8.0.22** erhält dafür den vollständigen Link mit der TV-Nummer; ein Auswahlmenü wird auf diesem Weg nicht geöffnet. Ohne ausgewählte Web-Instanz bleibt der Aufruf unter der bestehenden Admin-Adresse, etwa `http://IOBROKER-HOST:8081/adapter/loewe-tv/epg.html?instance=0`. Mit ausgewählter Web-Instanz folgt eine direkte Weiterleitung zu deren `/loewe-tv.0/epg.html`. Nach einem Admin-Update dessen Browserseite vollständig neu laden. [Linkanleitung](ADMIN_LINKS.md).

Optional kann unter **Web-Zugriff → Web-Adapter für die Programmübersicht** eine vorhandene Web-Instanz gewählt werden. Sie stellt die Seite unter `/loewe-tv.0/epg.html` und als Schnellzugriff auf ihrer Startseite bereit. Lokal gelten die Anmeldung und Benutzerrechte der Web-Instanz; die integrierte Socket-Verbindung ist erforderlich. [Lokalen Web-Zugriff einrichten](EPG_GUI.md#über-iobrokerweb-öffnen).

Für Fernzugriff über **ioBroker.cloud** muss dort dieselbe Web-Instanz ausgewählt sein. Die Cloud-Anmeldung und ihr Socket-Kontext sind vom lokalen Web-Login getrennt. Die [Cloud-Anleitung](EPG_GUI.md#über-iobrokercloud-remote-öffnen) beschreibt die zusätzliche Web-Instanz auf `localhost` und den passenden EPG-Link.

Seit **0.1.16** verhindert die URL-Textform des Admin-Links dessen zusätzlichen Import als Web-Kachel. Bei zwei TVs bleiben die beiden instanzbezogenen Web-Links erhalten. Diese Änderung am Web-Import löst das separate Admin-8-Resolverproblem nicht. [Doppelte Kacheln nach dem Update bereinigen](INSTALLATION.md#doppelte-web-cloud-kacheln-bei-zwei-fernsehern-bereinigen).

Verfügbare Senderlogos ersetzen den Sendernamen in der Tabelle; Suche, Tooltip und Screenreader behalten den Namen. Manuelle Logo-Adressen, TV-Bilder, eindeutig zugeordnete XMLTV-Bilder und mitgelieferte Logos bilden die Ersatzreihenfolge. Die kompakte Auswahl zeigt Sendung und Quelle; die Beschreibung lässt sich aufklappen. **Jetzt ansehen / Aufnahme planen** und **EPG aktualisieren** stehen in der Bedienleiste. [Bildaufbau und Logoquellen](EPG_GUI.md#bildaufbau-und-navigation).

Die Vorschau kann über `now` und `next` hinausreichen, soweit weitere Sendungen geliefert und gespeichert wurden. Der TV-Abruf reicht ungefähr 24 Stunden voraus, die XMLTV-Auswahl bis 48 Stunden. Die Grenzen sind keine Zusage einer lückenlosen Vorschau: Quelle, Zuordnung, bekannte Zeiten und Speicherbudget bestimmen den tatsächlichen Bestand. [Bedienung, Status und Aufnahmeablauf](EPG_GUI.md).

## Am Fernseher beginnen

1. Den Build **`0.1.21-direct-links.1`** nach der [Updateanleitung](INSTALLATION.md#update-auf-0121) installieren und die bestehende Instanz starten. Ein Neustart allein übernimmt das Update nicht. `info.adapterBuild` muss **`0.1.21-direct-links.1`** anzeigen. Für die eingebettete Übersicht wird **Admin ab 8.0.22** benötigt. Admin vollständig neu laden und die Adapter-Konfiguration neu öffnen.
2. Fernseher einschalten und prüfen, dass die gewünschte Senderliste in der Adapter-Konfiguration ausgewählt ist. Die zugehörigen Sender müssen unter `channels.tv` vorhanden sein.
3. Im Reiter **EPG-Einstellungen** die Voreinstellungen verwenden: **Programminformationen aktivieren** eingeschaltet, Abrufintervall **900 Sekunden**, **EPG-Quelle → Nur TV**. Für frische Daten bei ausgeschaltetem TV anschließend [XMLTV einrichten](EPG_XMLTV.md#einrichten).
4. Nach dem Start und der Senderanlage beginnt der erste EPG-Abgleich automatisch. **EPG aktualisieren** in der Übersicht startet ihn auch manuell. Alternativ **`channels.epgRefresh=true`** wie bei anderen Tastern mit `ack:false` schreiben.
5. Beispielsweise **`channels.tv.Das_Erste_HD.epg.now.title`** und **`epg.next.title`** prüfen. Verwende den tatsächlichen Senderpfad deiner Instanz.

Der Abgleich geht die bekannten, verfügbaren TV-Dienste der ausgewählten Liste durch. Mehrere Programmplätze desselben Dienstes teilen sich ihren Senderordner und dieselbe EPG-Abfrage.

## Einstellungen

| Einstellung | Standard | Wirkung |
|---|---|---|
| Programminformationen aktivieren (`epgEnabled`) | Ja | Programmdaten lesen und die Anzeige anhand der Uhrzeit aktualisieren. Bei ausgeschaltetem EPG werden aktuelle/nächste Sendung geleert. |
| EPG-Aktualisierung (Sekunden) (`epgRefreshInterval`) | 900 Sekunden | Zeit zwischen abgeschlossenen Abgleichläufen. Ganze Werte von 300 bis 86.400 Sekunden. `0` schaltet automatische EPG-Netzabfragen aus; die Schaltfläche in der Übersicht und der manuelle Taster bleiben verfügbar. |
| EPG-Quelle (`epgSource`) | Nur TV (`tv`) | `auto`: TV mit XMLTV-Ergänzung; `xmltv`: EPG ausschließlich aus XMLTV. In den beiden externen Modi wird XMLTV vor möglichen TV-EPG-Anfragen geladen. |
| XMLTV-Adresse (`epgXmltvUrl`) | Leer | Eigene HTTP(S)-Adresse einer XMLTV- oder gzip-Datei. Es wird kein Anbieter automatisch ausgewählt. |
| Senderzuordnung (`epgXmltvMappings`) | Automatisch | Die gespeicherte TV-Liste gibt die Zeilen vor. Je Sender **Automatisch**, **Manuell** mit genauer XMLTV-ID oder **Deaktiviert** auswählen. |

Ein Intervall von `0` verhindert auch den automatischen EPG-Erstabruf. Bereits vorgemerkte Aufnahmeaufträge werden unabhängig von den Abrufintervallen weiterbearbeitet. Bereits gespeicherte Programme werden trotzdem zeitlich weitergeschaltet, solange EPG aktiviert ist. Bei `epgEnabled=false` starten weder die Schaltfläche noch der manuelle Taster einen Import.

Eine laufende Abfrage wird bei mehrfacher Betätigung des Tasters gemeinsam verwendet. Große Senderbestände werden in Abschnitten von bis zu 64 Sendern weiterbearbeitet. Eine manuell gestartete vollständige Runde wird auch bei Intervall `0` zu Ende geführt.

Die Einstellungen wirken nach dem Speichern. Das Blättern, Suchen oder Auswählen in der Programmübersicht verändert die Instanz-Konfiguration nicht. Die Übersicht verwendet stets die gespeicherte TV-Adresse und Senderliste; Änderungen im noch ungespeicherten Formular sind dort noch nicht aktiv.

**Quelle laden und Zuordnung prüfen** testet ausdrücklich die im Formular eingetragene XMLTV-Adresse und Zuordnung gegen die bereits gespeicherte TV-Senderliste. Die Vorschau speichert keine Konfiguration und ersetzt keine laufenden Programmcaches. Erst Speichern und ein regulärer EPG-Abgleich übernehmen die Änderungen. Gültige frühere Werte für `epgSource`, `epgXmltvUrl` und `epgXmltvMappings` werden wieder ausgewertet. Ungültige optionale XMLTV-Einstellungen verhindern den TV-Betrieb nicht: TV-EPG bleibt verfügbar, während `channels.epgLastError` das Konfigurationsproblem meldet.

Die TV-Sender erscheinen beim Öffnen direkt in der Tabelle, auch ohne eingetragene XMLTV-Adresse und bei ausgeschaltetem TV. Für eine Korrektur in der betreffenden Zeile **Manuell** wählen und daneben den XMLTV-Sender suchen beziehungsweise seine genaue ID eingeben. **Automatisch** setzt eine manuelle Entscheidung zurück. Anschließend normal speichern. Eine Änderung der Quelle oder TV-Senderliste setzt das Prüfergebnis zurück, erhält aber vorhandene manuelle Entscheidungen. Diese müssen dann auf die neue Quelle geprüft werden. Eine fehlende optionale Quellenadresse zeigt einen Hinweis und blockiert das Speichern der übrigen Einstellungen nicht.

## Datenpunkte am Sender

Alle Pfade in dieser Tabelle sind relativ zum Sender, beispielsweise **`loewe-tv.0.channels.tv.Das_Erste_HD`**. Sämtliche EPG-Zustände sind nur lesbar.

| Datenpunkt | Inhalt |
|---|---|
| `epg.now.available` | `true`, wenn die aktuelle Sendung zeitlich eindeutig bestimmbar ist. |
| `epg.now.title` | Titel der laufenden Sendung. |
| `epg.now.subtitle` | Untertitel oder Episodentitel, sofern geliefert. |
| `epg.now.description` | Beschreibung, sofern geliefert. |
| `epg.now.eventId` | Sendungskennung der Quelle; bei XMLTV eine stabile, vom Adapter gebildete Kennung. |
| `epg.now.start` | Beginn als Unix-Zeit in Millisekunden. |
| `epg.now.end` | Ende als Unix-Zeit in Millisekunden. |
| `epg.next.available` | `true`, wenn eine nächste Sendung eindeutig bestimmbar ist. |
| `epg.next.*` | Dieselben Felder wie `epg.now.*`, für die nächste zukünftige Sendung. |
| `epg.lastUpdate` | Zeitpunkt des letzten erfolgreichen Datenabrufs für diesen Sender, in Millisekunden. |
| `epg.status` | Zustand dieses Senders, siehe unten. |
| `epg.lastError` | Letzter Fehler oder Hinweis auf mehrdeutige Zeitdaten. |
| `epg.data` | Zusammenhängender JSON-Wert mit `schemaVersion: 2`, Senderbezug, Status, `now`, `next` und `tvDiagnostic`; bei aktiver externer Quelle zusätzlich Herkunft und XMLTV-Diagnose. Für Skripte vorzugsweise diesen Wert verwenden. |
| `epg.cache` | Internes, als Expertenobjekt markiertes Format für den Neustart. Kein stabiler Vertrag für eigene Automationen. |

Fehlende Programme haben `available=false`, leere Texte und Zeiten `0`. In `epg.data` sind sie `null`. Eine bekannte nächste Sendung darf ein unbekanntes Ende haben: Dann ist `next.available=true`, aber `next.end=0`; im JSON ist das Ende `null`. Aus einem bloßen Start ohne Ende wird keine sicher laufende Sendung abgeleitet.

Endzeiten werden nur verwendet, wenn die jeweilige Quelle sie ausdrücklich liefert. Der nächste Sendungsbeginn wird nicht als Ende der aktuellen Sendung eingesetzt. Im Modus **TV mit XMLTV-Ergänzung** haben vollständige TV-Intervalle Vorrang; XMLTV kann andere Zeitbereiche und passende Einträge mit unbekanntem TV-Ende übernehmen. Zeiten werden dafür weder gekürzt noch zwischen Quellen zusammengesetzt. [Genaue Zusammenführung](EPG_XMLTV.md#wie-tv-und-xmltv-zusammenwirken).

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
| `source` | Bei aktiver externer Quelle: `tv`, `xmltv`, `mixed` oder `null`, je nach verwendbarem Bestand. In **Nur TV** bleibt dieses zusätzliche Feld wie bisher aus. |
| `now.source`, `next.source` | Bei aus beiden Quellen abgeleiteten Plänen die Herkunft der einzelnen Sendung: `tv` oder `xmltv`. |
| `xmltvMapping`, `xmltvDiagnostic` | Bei aktiver externer Quelle die Zuordnung zum XMLTV-Sender und der letzte Abruf-/Zuordnungsbefund. [Felder und Fehlerklassen](EPG_XMLTV.md#diagnose). |

Automationen sollten sich bei zusammengehörenden Angaben auf dieses JSON stützen, damit Titel und Zeiten aus demselben veröffentlichten Stand stammen.

### Statuswerte

| Status | Bedeutung |
|---|---|
| `waiting` | Noch keine gespeicherten oder gelesenen Programmdaten. |
| `ready` | Aktuelle und nächste Sendung sind bestimmbar. Einzelne Texte können trotzdem fehlen. |
| `partial` | Nur ein Teil ist bestimmbar, oder Zeitangaben sind mehrdeutig. |
| `cached` | Der letzte Abruf ist fehlgeschlagen; noch zeitlich passende gespeicherte Programme bleiben sichtbar. `lastError` beschreibt den Fehler. |
| `empty` | Der verwendete Bestand enthält für diesen Zeitpunkt keine passende aktuelle/nächste Sendung. Ein erfolgreicher Abruf kann leer sein. |
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

`channels.epgStatus=ready` bedeutet, dass der Lauf für alle bearbeiteten Sender erfolgreich abgeschlossen ist und kein XMLTV-Abruf- oder Konfigurationsproblem offenbleibt. In **auto** kann ein gültiger XMLTV-Bestand die Anzeige trotz fehlgeschlagener TV-Abfrage versorgen. Ob ein Sender für den aktuellen Zeitpunkt Sendungen geliefert hat, zeigen dessen `epg.status` und `available`-Felder; `tvDiagnostic` hält einen gescheiterten TV-Versuch trotzdem fest. Eine erfolgreich gelesene leere Antwort ist kein Netzwerkfehler. Bei fehlerhafter XMLTV-Konfiguration und weiterhin nutzbarem TV-EPG lautet der Gesamtstatus `partial`.

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

Laut [Nutzerrückmeldung zum Einschalten](COMPATIBILITY.md) schaltet der getestete TV ohne Schnellstart seine Netzwerkfunktionen im Standby ab. Dann können keine frischen Daten direkt vom TV gelesen werden. Eine konfigurierte XMLTV-Quelle bleibt unabhängig davon erreichbar, solange der ioBroker-Rechner sie abrufen kann. Der Schnellstart muss direkt am TV aktiviert werden; das Einschalten über den Datenpunkt funktioniert bei diesem Gerät nur mit aktivierter Einstellung.

Ein fehlgeschlagener Abruf löscht den noch brauchbaren Bestand seiner Quelle nicht sofort. TV und XMLTV besitzen getrennte Abrufzeitpunkte und eine maximale Cache-Altersgrenze von jeweils **24 Stunden**. Ein neuer XMLTV-Abruf verjüngt keine alten TV-Daten. Erfolgreich gelesene leere Quellbestände ersetzen den jeweiligen bisherigen Bestand. Eine falsche Systemzeit auf dem ioBroker-Rechner führt zu einer falschen zeitlichen Auswahl; der Adapter stellt diese Uhr nicht um.

Beim Neustart werden nur gültige Bestände zum selben TV-Dienst und derselben Senderliste übernommen. In **Nur TV** bleibt der interne Cache bei **Schema 2** mit `source: "tv"`. Bei aktiver externer Quelle enthält eine **Schema-4-Hülle** den TV-Cache in Schema 2 und den XMLTV-Cache in Schema 3. XMLTV ist zusätzlich an Feedadresse, Dienstidentität/-name, manuelle Zuordnung und konkrete XMLTV-Sender-ID gebunden. Gültige TV-Caches aus Schema 1 werden weiter migriert; alte externe Schema-1-Caches, unbekannte Herkunft, unpassende Identitäten, ungültige Zeiten und geschätzte Endzeiten werden verworfen. [Speicherformat und Grenzen](EPG_XMLTV.md#speicherung-und-neustart).

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
| Gespeicherte Ereignisse je Quellcache und abgeleitetem Plan | Höchstens 128, zusätzlich durch das Bytebudget begrenzt |
| Persistenter Einzelcache | Höchstens 128 KiB je Quelle; bei vielen Sendern entsprechend kleiner |
| Hülle für TV- und XMLTV-Cache | Höchstens 264 KiB je Sender, einschließlich Zuordnung |
| Berechnungsgrundlage der Einzelcachegrenzen | 16 MiB geteilt durch Senderzahl, angewendet je Quellcache; kein gemeinsamer RAM-Deckel für alle Quellen oder den Node.js-Prozess |
| `tvDiagnostic.details` | Höchstens 8 KiB serialisierte Metadaten je Sender; keine Rohantwort |

Lange Beschreibungen oder weit entfernte zukünftige Sendungen können zur Einhaltung der Cachegrenzen gekürzt werden. Der Adapter erhält dafür die Informationen zur aktuellen und nächsten Sendung einschließlich möglicher Mehrdeutigkeiten. Bei nicht sicher kürzbaren Daten meldet er einen Fehler.

Die Programmübersicht liest ausschließlich den bereits geladenen Bestand im Arbeitsspeicher. Öffnen, Suchen, Blättern und das regelmäßige Nachladen der Anzeige lösen keine zusätzlichen SOAP- oder XMLTV-Abfragen aus und lesen nicht erneut alle EPG-Datenpunkte aus der Datenbank. Die Daten werden in begrenzten Seiten übertragen; die Oberfläche setzt diese zu den Senderzeilen zusammen. **EPG aktualisieren** fordert ausdrücklich einen neuen Abgleich der gespeicherten Quellen an. Die zusätzlichen [XMLTV-Abrufgrenzen](EPG_XMLTV.md#abrufgrenzen) gelten unabhängig vom TV-Protokoll. Umschalten und die Bearbeitung bestätigter Aufnahmevormerkungen haben eigene TV-Befehle.

## Aufnahmevormerkungen

Bestätigte zukünftige Sendungen werden dauerhaft unter **`loewe-tv.0.recordings.jobs`** gespeichert. Der JSON-Datenpunkt ist nur lesbar. Anlegen und Entfernen einer noch ungesendeten Vormerkung erfolgen über die Programmübersicht.

Auch bei einer Sendung mit Quelle **XMLTV** wird die Aufnahme dem gespeicherten TV-Dienst zugeordnet. Der Adapter verwendet den eigenen TV-Locator dieser Instanz; eine Feed-ID kann weder einen anderen Fernseher noch einen anderen Aufnahmehost vorgeben. Quelle und Senderzuordnung werden vor der Aktion erneut geprüft.

Bei unerreichbarem TV wartet der Adapter und prüft die Verbindung erneut, ohne Wake-on-LAN oder einen Einschaltbefehl auszulösen. Vor dem Sendungsbeginn kann der Auftrag einmalig übertragen werden. Ein noch ungesendeter Auftrag wird bei erreichtem Beginn **`missed`**. Ein offener Timerabgleich bleibt intern **`uncertain`**; ein möglicherweise gesendeter Auftrag wird auch nach einem Neustart nicht blind wiederholt. Hat der TV bereits auf den Aufnahmebefehl geantwortet, erscheint dieser Auftrag als **An TV übertragen**. Ohne Antwortnachweis bleibt die Anzeige **Übertragung unklar**. Wurde wegen eines möglicherweise vorhandenen Timers noch gar nicht gesendet, lautet sie **Timerabgleich offen**.

**`scheduled`** setzt genau einen passenden Timer in einer vollständig auswertbaren TV-Timerliste voraus. Eine Antwort auf den Schreibbefehl allein ist keine Bestätigung. Für die Nutzergeräte fehlt diese echte Timerantwort noch. Bei unbekanntem Format bleibt die Zuordnung offen. **Ein bestätigter Timer belegt keine erfolgreich ausgeführte Aufnahme.** Weitere Zustände und die separate URL erklärt die [Programmübersicht](EPG_GUI.md); die [Protokollnotizen](recording-protocol.md) beschreiben den nachgewiesenen App-Ablauf.

## Für eigene Automationen

Für eine zusammenhängende Auswertung eignet sich `epg.data`. Ein einfaches Beispiel für den ioBroker-JavaScript-Adapter:

```javascript
on({ id: 'loewe-tv.0.channels.tv.Das_Erste_HD.epg.data', change: 'ne' }, event => {
    let guide;
    try { guide = JSON.parse(event.state.val); } catch { return; }
    if (guide.now) log(`Jetzt: ${guide.now.title}`);
    if (guide.next) log(`Danach: ${guide.next.title}`);
});
```

Dieses Skript zeigt nur die Programmdaten an. Manuell bestätigte Aufnahmevormerkungen sind ab 0.1.11 in der Programmübersicht implementiert. Regeln zur automatischen Sendungssuche, Vor-/Nachlauf und die automatische Anpassung an geänderte EPG-Zeiten bleiben weitere Ausbauschritte; siehe [Roadmap](ROADMAP.md).
