# Prüfbericht 0.1.27: Internet-EPG und Aufnahmeplanung bei ausgeschaltetem TV

**Version:** 0.1.27  
**Build:** `0.1.27-internet-epg.1`  
**Datum:** 20. Oktober 2026  
**Ausgangspunkt:** veröffentlichte Version 0.1.26, Commit `f90cd7d87c5d47faab85314320c223e43141c2e8`

## Auftrag und Befund

Die funktionierenden Instanz- und Schnellzugriffslinks sollen weiter zur jeweiligen Programmübersicht führen. Bei ausgeschaltetem Fernseher sollen Programmdaten aus dem Internet verfügbar sein, damit zukünftige Sendungen zur Aufnahme vorgemerkt werden können.

Die Untersuchung hat **keine generelle Verbindungssperre im bestehenden XMLTV-Abruf** ergeben. Mit gültiger gespeicherter Quelle und TV-Senderliste lädt schon der Ausgangsstand externe Programme, bevor er TV-EPG abfragt. Auch Aufnahmevormerkungen sind nicht an einen verbundenen TV gebunden. Der Auftrag wird anhand der eigenen gespeicherten TV-Senderidentität in das Auftragsjournal übernommen.

Es bestanden jedoch konkrete Lücken bei der Einrichtung und Diagnose:

- Neue Instanzen verwenden **Nur TV** und besitzen keine voreingetragene Feedadresse. Dieser Modus kann bei TV aus keine neuen Internetprogramme beschaffen.
- Eine ältere gespeicherte Quellenadresse ohne `epgSource` wurde ebenfalls als Nur-TV-Konfiguration behandelt.
- Erfolgreiches Prüfen einer ungespeicherten Quelle aktiviert diese noch nicht in der laufenden Programmübersicht. Der Erfolgshinweis erklärte diesen notwendigen Schritt nicht ausdrücklich.
- Die Oberfläche stellte die fehlende TV-Verbindung in den Vordergrund. Ob eine Internetquelle fehlt, der Download scheitert oder keine Sender zugeordnet sind, war dort nicht ausreichend erkennbar.
- Die allgemeine Namenssuche lässt HD und Basisnamen bewusst getrennt. Bei einem Anbieter, der den gemeinsamen nationalen Programmplan ohne HD-Zusatz führt, blieben deshalb passende HD-Sender ohne automatische Zuordnung.

Die privaten Einstellungen und Geräte des Nutzers wurden nicht ausgelesen. Die Untersuchung belegt diese Codepfade und liefert Diagnosemöglichkeiten für die laufenden Instanzen; sie behauptet keine bestimmte unbekannte Einstellung des Nutzers.

## Umsetzung

### Speicherbaren Entwurf für Internet-EPG vorbereiten

Unter **EPG-Einstellungen** gibt es **Internet-EPG einrichten**. Der neue Nachrichtenhandler `prepareInternetEpg` bereitet vier Formularwerte vor:

| Feld | Verhalten |
|---|---|
| Programminformationen | Aktivieren. |
| EPG-Quelle | TV mit XMLTV-Ergänzung verwenden; bereits gewähltes Nur XMLTV erhalten. |
| XMLTV-Adresse | Gültige eigene Adresse erhalten; bei leerem Feld die Deutschland-Vorlage einsetzen. |
| Abrufintervall | Gültige 300–86400 Sekunden erhalten; deaktivierte, fehlende oder ungültige Werte auf 3600 Sekunden setzen. |

Der Handler schreibt weder Instanzkonfiguration noch Zustände. Er benötigt keine wiederhergestellte TV-Liste, keinen TV-Aufruf und keinen Feeddownload. Admin übernimmt die Werte über seinen bestehenden `useNative`-Weg in den Entwurf. Erst das normale Speichern aktiviert die Einstellungen. Die Erfolgsmeldung erklärt dies ausdrücklich. Eine ungültige vorhandene Adresse wird abgewiesen, ohne sie durch einen anderen Anbieter zu ersetzen. Senderzuordnungen werden vom Handler nicht überschrieben.

Die Prüfung der Quelle arbeitet weiter mit dem aktuellen Formularentwurf. Ihr Erfolgshinweis nennt jetzt zusätzlich das Speichern. Dadurch wird der Unterschied zwischen Quellenprüfung und aktivem Programmabruf sichtbar.

### Quellenbezogene nationale Senderzuordnung

Die editierbare Deutschland-Vorlage lautet:

```text
https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz
```

[EPGShare01](https://epgshare01.online/) bietet die Quelle kostenlos an. Das [Anbieterverzeichnis](https://epgshare01.online/epgshare01/), die [Verwendungshinweise](https://epgshare01.online/epgshare01/0_READ_ME_FIRST_AS_I_CONTAIN_VERY_HELPFUL_INFO.html) und die [Deutschland-Senderkennungen](https://epgshare01.online/epgshare01/epg_ripper_DE1.txt) wurden gelesen. Die Kennungen bilden die Grundlage für das begrenzte Profil in [epg-provider.js](../lib/epg-provider.js).

Das Profil ergänzt 23 nationale Sender mit ausdrücklich aufgeführten Basis- und HD-Namen. Beispiele sind **Das Erste HD → Das.Erste.de** und **ZDF HD → ZDF.de**. Ein Treffer setzt zusätzlich den passenden primären Anzeigenamen im geladenen Feed voraus; eine plausibel aussehende Kennung genügt nicht.

Das Profil greift ausschließlich bei der genauen konfigurierten Vorlagenadresse und nur bei bislang nicht zugeordneten Zeilen. Manuelle, deaktivierte, fehlende manuelle und mehrdeutige Zuordnungen sowie bestehende automatische Treffer behalten ihren Vorrang. Regionale Zusätze, UHD, SD als ausdrücklicher Namenszusatz, 4K und Zeitversatz werden nicht pauschal entfernt. Gemeinsame Aliasse erlauben keine Umgehung dieser Grenze.

Die ursprünglich konfigurierte Adresse bleibt auch bei HTTP-Weiterleitungen maßgeblich. Parser und Admin verwenden denselben Mapper. Der Parser trifft die Zuordnung bereits vor der Auswahl der aufzubewahrenden Programme; dadurch werden die betreffenden HD-Programme tatsächlich eingelesen und nicht erst nach dem Verwerfen der Daten einem Sender zugeordnet.

### Internetstatus in der Programmübersicht

Der Guide enthält eine begrenzte `internet`-Diagnose mit Modus, Status, automatischer Aktualisierung, Senderzahlen, Zeitpunkt und bereinigtem Fehlertext. Sie enthält keine Quellenadresse oder Zugangsdaten.

Die Oberfläche unterscheidet Nur TV, deaktiviertes EPG, fehlende Quelle, Konfigurationsfehler, fehlende TV-Liste, wartenden/laufenden Abruf, Downloadfehler, fehlende Zuordnungen, leere Programmdaten und verfügbare Internetprogramme. Bei einem gescheiterten Folgeabruf zeigt sie noch verwendbare gespeicherte Programme mit entsprechendem Hinweis. Die Zeit- und Quellenbindung vorhandener Caches wird dafür weiter geprüft.

Bei fehlender TV-Verbindung und verfügbaren Internetprogrammen weist die Oberfläche ausdrücklich auf die mögliche Aufnahmevormerkung hin. Ein noch laufender TV-Abgleich verdeckt diese Information nicht. Bei ausgeschalteter automatischer Aktualisierung wird der manuelle Aktualisieren-Button erklärt.

### Ältere Konfiguration

Eine gültige gespeicherte XMLTV-Adresse ohne jeglichen gespeicherten Quellenmodus aktiviert wieder **TV mit XMLTV-Ergänzung**. Eine ausdrücklich gespeicherte Einstellung **Nur TV** bleibt erhalten. Fehlende oder ungültige Adressen führen nicht zur stillen Auswahl eines Providers. Die neue Deutschland-Vorlage wird durch den Einrichtungsbutton bewusst vorbereitet.

## Aufnahmeablauf

1. Der Adapter stellt die eigene gespeicherte TV-Senderliste wieder her.
2. Im eingerichteten Internetbetrieb lädt der automatische Erstabruf XMLTV auch bei nicht verbundenem TV.
3. Die Programmübersicht bietet eine zukünftige Sendung mit vollständigen Zeiten zur Aufnahme an.
4. Nach Bestätigung wird der Auftrag mit dem registrierten TV-Senderziel gespeichert.
5. Ein noch ausgeschalteter oder nicht erreichbarer TV verhindert diese Vormerkung nicht. Der Auftrag bleibt auch nach einem Adapterneustart erhalten.
6. Bei erreichbarem TV übernimmt der vorhandene Aufnahmeprozess die Übertragung und den Abgleich mit der Timerliste.

Eine Vormerkung bestätigt noch keine Aufnahme auf dem Gerät. Der Fernseher muss den Auftrag rechtzeitig vor Sendungsbeginn annehmen können. Die Änderung schaltet ihn dafür nicht automatisch ein. Der Zugriff im Schnellstart-/Standby-Modus hängt von der tatsächlichen Erreichbarkeit und den Antworten des Geräts ab und wurde nicht an einem physischen TV geprüft.

## Verifikation

**Vollständiger Testlauf:** `npm test` mit **950 Tests, 950 bestanden, 0 fehlgeschlagen, 0 übersprungen**. Der Ausgangsstand enthielt 924 Tests. Die 26 zusätzlichen Prüfungen verteilen sich wie folgt:

| Bereich | Zusätzliche Tests | Geprüfte Wirkung |
|---|---:|---|
| Manager und Guide | 7 | Internetdiagnose, nutzbarer Bestand nach Fehlern, speicherpflichtige Vorschau, einheitliche Providerzuordnung. |
| Gemountete EPG-Oberfläche | 5 | Offline-Hinweise, aktiver Aufnahmebutton, Fehleranzeige, bereinigte Texte und Einrichtungshinweise in Deutsch/Englisch. |
| Provider und Parser | 10 | Feste Namen/IDs, Quellbindung, manuelle Vorgaben, Mehrdeutigkeit, Varianten, Redirects und echtes gzip-/Streaming-Parsing. |
| Runtime mit Aufnahmejournal | 1 | Offline-Start, automatischer Internetabruf, Auswahl und Bestätigung einer Sendung sowie Wiederherstellung nach Neustart in beiden Quellenmodi. |
| Admin, Nachrichtenroute und Migration | 3 | Echter Admin-Entwurfs-/Speicherweg für zwei Instanzen, Einrichtung ohne TV-Zugriff, Erhalt eigener Werte und älterer Quelle. |

Der Runtime-Test verbindet die echte Senderkatalog-Wiederherstellung, `AdapterRuntime`, `EpgManager`, XMLTV-Parser, Programmauswahl und Aufnahmeverwaltung. Speicher, Uhr und externe Transporte sind kontrollierte Testumgebungen. Er prüft den korrekten TV-Locator und Geräteschlüssel sowie null TV-Steueranfragen während der Offline-Vormerkung. Der zweite Start stellt Guide und Auftrag aus dem Speicher wieder her.

Die Admin-Prüfung führt die im Repository festgehaltenen ursprünglichen Admin-Methoden für `ConfigSendto`, `useNative` und `copyNativeForSave` aus. Sie prüft, dass die vier EPG-Felder im speicherbaren Objekt landen, keine automatische Speicherung ausgelöst wird und Senderliste sowie manuelle Auswahl je Instanz erhalten bleiben. Eine weitere Prüfung führt die tatsächliche `main.js`-Nachrichtenroute aus.

**Paketprüfung:** `npm run check` bestanden. Versionsdaten, deutsche/englische Übersetzungen, 95 Objektdefinitionen, der bestehende Protokollvertrag und JavaScript-Syntax sind gültig. Die übrigen Tests umfassen weiterhin Links, Web-/Cloud-Brücke, Fernbedienung, Gerätenamen und Aufnahmeübertragung.

## Grenzen und Prüfung beim Nutzer

Die Tests verwenden synthetische Programmdaten. Der direkte Download der komprimierten Anbieterdatei war in dieser Ausführungsumgebung durch deren URL-Zugriffsregel blockiert. Dies ist kein nachgewiesener Fehler des Anbieters. Website, Dateiverzeichnis und Senderkennungen waren lesbar; die aktuelle XML-Datei, ihre vollständige Abdeckung und ihre heutige Programmaktualität wurden hier nicht live verifiziert.

Nach dem Update daher bei **beiden TV-Instanzen** **Internet-EPG einrichten → Quelle laden und Zuordnung prüfen → speichern** ausführen. Eine vorhandene eigene Quelle kann weiter verwendet werden. Danach mit ausgeschaltetem TV die Programmübersicht aktualisieren, den Internetstatus prüfen und eine zukünftige Sendung vormerken. Bei einer noch fehlenden Zuordnung die entsprechende TV-Zeile manuell korrigieren. Eine gespeicherte TV-Liste ist Voraussetzung; nur wenn diese fehlt, muss sie zuerst vom erreichbaren TV gelesen werden.

[Einrichtung und Diagnose](EPG_XMLTV.md) · [Installation](INSTALLATION.md#update-auf-0127)
