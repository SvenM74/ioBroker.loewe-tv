# XMLTV: Programmdaten bei ausgeschaltetem Fernseher

Diese Anleitung gilt für **Version 0.1.18**, Build **`0.1.18-epg-offline.1`**. Der Adapter kann eine selbst gewählte XMLTV-Quelle laden, deren Sender der gespeicherten TV-Senderliste zuordnen und die Programme auch bei ausgeschaltetem Fernseher anzeigen. Quelle und Senderzuordnung bleiben bei jeder Sendung nachvollziehbar. Eine zukünftige Sendung mit vollständigen Zeiten kann anschließend wie ein TV-EPG-Eintrag zur Aufnahme vorgemerkt werden.

Eine **eigene HTTP(S)-Adresse** ist erforderlich. Der Adapter wählt keinen Anbieter automatisch und liefert kein Abonnement mit. Die Adresse muss eine XMLTV-Datei oder deren gzip-komprimierte Fassung ausliefern; eine normale Webseite mit einem Fernsehprogramm genügt nicht. Verwende eine Quelle, die du nutzen darfst und die deine Sender einschließlich der passenden regionalen und HD-/SD-/UHD-Varianten abdeckt.

Die [Programmübersicht](EPG_GUI.md) beschreibt die Bedienung, Fernbedienung und Aufnahmeaufträge. Die [EPG-Datenpunkte](EPG.md) eignen sich für eigene Automationen. Das Datenformat der Quelle ist in der [offiziellen XMLTV-DTD](https://github.com/XMLTV/xmltv/blob/b424ef772a667856ca44b9dac3b4310d02191dea/xmltv.dtd) beschrieben.

## Einrichten

1. Aktualisiere nach der [Installationsanleitung](INSTALLATION.md#update-auf-0118). Unter `info.adapterBuild` muss **`0.1.18-epg-offline.1`** stehen. Die betreffende LOEWE-TV-Instanz muss laufen; nach dem Update Admin vollständig neu laden.
2. Prüfe die **gespeicherte TV-Senderliste**. Bei der ersten Einrichtung den Fernseher einschalten, die gewünschte Liste wählen und die Sender abrufen. Die zugehörigen Dienste müssen unter `channels.tv` vorhanden sein. XMLTV erzeugt keine TV-Senderliste und erfindet keine Sender-Locators. Eine bereits gespeicherte Liste kann anschließend auch bei TV aus verwendet werden.
3. Öffne **Instanzen → loewe-tv.0 → Konfiguration → EPG-Einstellungen**. Aktiviere **Programminformationen**. Das Abrufintervall beträgt standardmäßig **900 Sekunden**.
4. Wähle **EPG-Quelle → TV mit XMLTV-Ergänzung** oder **Nur XMLTV**. Trage unter **XMLTV-Adresse** die vollständige Adresse deiner Quelle ein. HTTP und HTTPS sind zulässig; Benutzername/Passwort im URL-Benutzerinfofeld sowie ein Fragment nach `#` sind nicht zulässig.
5. Drücke ausdrücklich **Quelle laden und Zuordnung prüfen**. Die Quelle wird heruntergeladen und die Vorschau mit der bereits gespeicherten TV-Liste erstellt. Eine gerade erst ungespeichert ausgewählte andere TV-Liste muss zuerst gespeichert und geladen werden.
6. Kontrolliere **Vorschau der Senderzuordnung**. Eindeutige automatische Treffer benötigen keine zusätzliche Zeile. Für eine Ausnahme wähle oberhalb der Korrekturtabelle **TV-Sender für die Korrektur**. Suche unter **XMLTV-Sender oder genaue ID** nach dem Sendernamen und wähle einen Treffer oder gib die exakte XMLTV-ID ein. Drücke **Korrektur in die Tabelle übernehmen** und kontrolliere die entstandene beziehungsweise aktualisierte Zeile. Anschließend kannst du die Vorschau erneut ausdrücklich prüfen lassen.
7. **Speichere** die Konfiguration. Die Vorschau allein aktiviert keine neue Quelle, speichert keine Zuordnung und ersetzt keine laufenden Programmcaches. Der laufende Betrieb verwendet ausschließlich die gespeicherten Einstellungen.
8. Öffne **Programmübersicht** und drücke bei Bedarf **EPG aktualisieren**. Prüfe die Quellangabe **TV / XMLTV** an einer ausgewählten Sendung und anschließend die Anzeige bei ausgeschaltetem TV.

Bei zwei Fernsehern gilt die Konfiguration je LOEWE-TV-Instanz. Beide können dieselbe Feedadresse nutzen, behalten aber ihre eigene TV-Senderliste, Zuordnung, Bedienung und Aufnahmeaufträge. Eine erfolgreiche Zuordnung bei `loewe-tv.0` ist keine Freigabe eines anderen TV-Ziels.

## Quellenmodi

| Auswahl | Gespeicherter Wert | Verhalten |
|---|---|---|
| **Nur TV** | `tv` | Standard für eine neue oder nicht ausdrücklich anders konfigurierte Instanz. Programmdaten werden direkt vom TV gelesen. Eine unbenutzte XMLTV-Adresse oder Korrekturtabelle aktiviert keine externen Abfragen. |
| **TV mit XMLTV-Ergänzung** | `auto` | Lädt zuerst XMLTV und veröffentlicht die zugeordneten Programme. Anschließend wird TV-EPG abgefragt. Vollständige TV-Intervalle haben Vorrang; XMLTV ergänzt andere Zeitbereiche. |
| **Nur XMLTV** | `xmltv` | Liest EPG ausschließlich aus der konfigurierten XMLTV-Quelle. Dafür wird kein TV-Client benötigt, wohl aber die bereits gespeicherte TV-Senderliste. Andere TV-Funktionen wie Fernbedienung und Aufnahmeversand bleiben an ihre normale Verbindung gebunden. |

**XMLTV wird vor den möglichen TV-EPG-Anfragen geladen.** Ein ausgeschalteter TV hält daher die Veröffentlichung erfolgreicher externer Programmdaten nicht auf. Der externe Abruf findet einmal je vollständigem Abgleichlauf statt, nicht je Sender und nicht beim Blättern in der Übersicht.

`epgRefreshInterval=0` schaltet automatische EPG-Abfragen einschließlich des Erstabrufs aus. Bei eingeschaltetem EPG bleiben **EPG aktualisieren**, der Taster `channels.epgRefresh` und die ausdrücklich angeforderte Zuordnungsvorschau verfügbar. Die Uhrzeitauswahl innerhalb vorhandener Daten läuft weiter. Bei deaktivierten **Programminformationen** werden die EPG-Anzeigen geleert und es findet kein regulärer Quellenabruf statt. Bereits gespeicherte Aufnahmeaufträge werden unabhängig davon weiterbearbeitet.

Gültige, noch vorhandene Werte in `native.epgSource`, `native.epgXmltvUrl` und `native.epgXmltvMappings` aus früheren Versionen werden wieder ausgewertet. Dabei wird kein alter Anbieter geraten und kein früherer externer Programmcache ungeprüft übernommen. Prüfe nach dem Update die angezeigte Quellenwahl, Adresse und Senderzuordnung. Ohne ausdrücklichen gültigen Quellenmodus gilt **Nur TV**.

Ungültige optionale XMLTV-Einstellungen legen den Adapter und sein TV-EPG nicht still. Der Manager verwendet dann TV-Daten und meldet das Problem als `EPG_XMLTV_CONFIG` unter `channels.epgLastError`. Bei erfolgreichem TV-Abruf kann der einzelne Sender `ready` sein, während der Gesamtstatus wegen der fehlerhaften externen Konfiguration `partial` zeigt. Das Formular verhindert außerdem das Speichern einer erkennbar ungültigen aktiven Feedadresse.

## Sender automatisch zuordnen und korrigieren

Die automatische Zuordnung vergleicht die Namen und ausdrücklich vorhandenen Aliasse des gespeicherten TV-Dienstes mit den Anzeigenamen der XMLTV-Sender. Groß-/Kleinschreibung, wiederholte Leerzeichen und übliche Trennzeichen werden normalisiert. Ein eindeutiger exakter Hauptname hat Vorrang vor einem weniger spezifischen Alias.

**HD, SD, UHD, Zahlen, zeitversetzte Varianten und Regionen bleiben unterscheidend.** Ein ähnlicher Name genügt nicht für eine automatische Auswahl. Auch ein scheinbar passender XMLTV-ID-Text oder die Position eines Senders ist kein Namensnachweis. Aliasse mit zusätzlichen oder fehlenden Editions-/Regionalwörtern bleiben konservativ Vorschläge. Ein mehrfach im Feed vorkommender passender Anzeigename wird nicht nach Reihenfolge, Logo oder besonders plausibel aussehender ID entschieden.

| Vorschau | Bedeutung | Nächster Schritt |
|---|---|---|
| **Automatisch zugeordnet** | Genau ein geeigneter Namenstreffer wurde gefunden. | Sender und Variante prüfen; eine zusätzliche Korrekturzeile ist nicht nötig. |
| **Manuell zugeordnet** | Die ausdrücklich gewählte XMLTV-ID kommt in der Quelle vor. | Prüfen, dass sie tatsächlich zum TV-Dienst passt. Die manuelle Auswahl hat Vorrang vor der Namenssuche. |
| **Mehrdeutig; bitte auswählen** | Mehrere Namenstreffer sind möglich. | Den richtigen Sender anhand der Quelle identifizieren und als Korrektur festlegen. |
| **Kein eindeutiger Treffer** | Kein sicherer automatischer Treffer; gegebenenfalls gibt es Vorschläge. | Vorschläge prüfen oder eine bekannte exakte XMLTV-ID eingeben. |
| **Manuelle XMLTV-ID fehlt in der Quelle** | Die gespeicherte manuelle Kennung wurde im geladenen Guide nicht gefunden. | Feed und Schreibweise prüfen. Der Adapter ersetzt diese Auswahl nicht automatisch durch einen anderen Sender. |
| **Manuell deaktiviert** | Für diesen TV-Sender ist ausdrücklich eine leere XMLTV-ID hinterlegt. | So belassen oder die Zeile löschen, wenn wieder automatisch zugeordnet werden soll. |

Die Vorschau ist eine Prüfansicht. Sie übernimmt keine Vorschläge in die Korrekturtabelle und speichert keine Live-Konfiguration. Sie kann bereits ungespeicherte Formularwerte prüfen; das ändert weder die aktuell sichtbaren Programme noch die persistenten TV-/XMLTV-Caches. Die gelesenen XMLTV-Sendernamen stehen anschließend für die suchbare Eingabe beziehungsweise Auswahl oberhalb der Korrekturtabelle zur Verfügung.

**Korrektur in die Tabelle übernehmen** ändert ausschließlich das offene Formular. Für den ausgewählten TV-Sender wird die Korrekturzeile angelegt beziehungsweise aktualisiert. Erst das normale **Speichern** der Instanz aktiviert sie. Bestehende Zeilen können auch direkt bearbeitet werden. Wenn du die Quellenadresse oder TV-Senderliste wechselst, werden die Vorschau und die zugehörige XMLTV-Auswahl zurückgesetzt; vorhandene manuelle Korrekturzeilen bleiben erhalten und müssen zur neuen Quelle geprüft werden.

### Drei unterschiedliche Entscheidungen

| Korrekturtabelle | Wirkung nach dem Speichern |
|---|---|
| Für den TV-Sender fehlt eine Zeile. | Automatische Namen-/Aliaszuordnung verwenden. |
| Eine Zeile enthält die genaue XMLTV-ID. | Diese Kennung verwenden; bei fehlender Kennung in der Quelle bleiben externe Programme für diesen Sender aus. |
| Eine Zeile enthält eine leere XMLTV-ID. | Externe Programme für diesen Sender bewusst deaktivieren. Das ist nicht „automatisch“. |

Zum Zurücksetzen einer manuellen Entscheidung **die Zeile löschen**, nicht nur deren XMLTV-ID leeren. Jeder TV-Sender darf höchstens einmal in der Korrekturtabelle stehen. Doppelte beziehungsweise ungültige Zeilen führen zu einer Konfigurationsdiagnose; der Adapter entscheidet nicht stillschweigend zwischen ihnen.

Die gespeicherten Zeilen verwenden `channel` für die TV-Dienst-ID und `xmltvId` für die exakte Kennung im Feed. Ein schematisches Beispiel, dessen Kennungen durch die tatsächlichen Werte ersetzt werden müssen:

```json
[
  { "channel": "channels.tv.Beispiel_HD", "xmltvId": "beispiel-hd" },
  { "channel": "channels.tv.Andere_Region", "xmltvId": "" }
]
```

Die TV-ID beginnt innerhalb der jeweiligen Instanz mit `channels.tv.`. Sie ist weder die Feed-ID noch die Programmplatznummer. Frühere einfache Zuordnungsobjekte mit TV-ID→XMLTV-ID werden im Backend ebenfalls normalisiert. Die Oberfläche verwaltet die Korrekturen als Zeilen.

Wenn ein Guide seine Sender nur über die `channel`-Angaben der Programme bezeichnet und keine Anzeigenamen liefert, fehlt die Grundlage für eine automatische Namenserkennung. Eine ausdrücklich manuelle, tatsächlich im Feed vorkommende ID ist weiterhin verwendbar. Das folgt aus der optionalen Senderdefinition im [XMLTV-Format](https://github.com/XMLTV/xmltv/blob/b424ef772a667856ca44b9dac3b4310d02191dea/xmltv.dtd).

## Wie TV und XMLTV zusammenwirken

Im Modus **TV mit XMLTV-Ergänzung** behalten beide Quellen ihre eigenen Programme und Zeiten. Eine Sendung mit ausdrücklich bekanntem TV-Start und TV-Ende hat Vorrang vor einem sich damit überschneidenden externen Eintrag. Ein XMLTV-Eintrag in einem anderen Zeitbereich kann übernommen werden. Vollständige XMLTV-Daten können einen TV-Eintrag ohne bekanntes Ende ersetzen, wenn sein Start in diesem XMLTV-Intervall liegt.

Beispielhafte Zeitverhältnisse, keine Angaben zu einem realen Fernsehprogramm:

| TV-Daten | XMLTV-Daten | Ergebnis in `auto` |
|---|---|---|
| Vollständig 14:00–15:00 | Ebenfalls 14:00–15:00 | TV-Intervall bleibt maßgeblich. |
| Vollständig 14:00–15:00 | 15:00–16:00 | Beide Sendungen können nacheinander erscheinen. |
| Vollständig 14:00–15:00 | 14:50–15:40 | Der überschneidende externe Eintrag wird nicht übernommen. Er wird nicht künstlich auf 15:00–15:40 gekürzt. |
| Start 14:00, Ende unbekannt | Vollständig 14:00–15:00 | Der vollständige XMLTV-Eintrag kann den unvollständigen TV-Eintrag ersetzen; seine Quelle bleibt **XMLTV**. |
| Kein nutzbarer TV-Bestand | Eindeutig zugeordnete, gültige XMLTV-Daten | XMLTV kann die Vorschau allein liefern. |

Der Adapter hängt keine fremde Endzeit an einen TV-Titel und berechnet keine Endzeit aus der nächsten Sendung. Fehlende Enden bleiben unbekannt. Konflikte innerhalb einer Quelle, mehrere gleichzeitig mögliche Programme oder zeitlich mehrdeutige Einträge werden nicht willkürlich aufgelöst. Sie können die Anzeige von „jetzt“/„danach“ und die zugehörigen TV-Aktionen verhindern.

Die einzelne Sendung zeigt **TV** oder **XMLTV**. Ein intern gemischter Bestand kann beide Quellen enthalten, ohne deren Zeitangaben zu vermischen. Die Auswahl- und Zeitregeln liegen in [epg-sources.js](../lib/epg-sources.js) und [epg-data.js](../lib/epg-data.js).

## Zeiten und Datenumfang

Die Quelle muss UTF-8-XMLTV liefern. Ein Guide darf unkomprimiert oder mit gzip komprimiert sein; gzip wird über den Antwortheader oder die Dateisignatur erkannt. Die Dateiendung allein entscheidet nicht. Der Adapter verarbeitet den Download als begrenzten Datenstrom.

XMLTV verwendet für Programme `start`, optional `stop` und eine `channel`-Kennung. Die [offizielle DTD](https://github.com/XMLTV/xmltv/blob/b424ef772a667856ca44b9dac3b4310d02191dea/xmltv.dtd) beschreibt auch verkürzte Datumswerte. Dieser Adapter benötigt für eine verwendbare Sendung mindestens **Jahr, Monat, Tag, Stunde und Minute**; Sekunden dürfen fehlen. Aus einem Datum ohne konkrete Uhrzeit wird kein Programmstart erfunden.

| Zeitangabe | Verarbeitung |
|---|---|
| `20261019140000 +0200` | Entspricht 12:00 UTC; der numerische Offset gehört zur gelieferten Zeit. |
| `202610191200` | 12:00 UTC, Sekunden `00`; ohne Zeitzone gilt nach XMLTV UTC. |
| `UTC`, `GMT` oder `Z` nach der Zeit | UTC. |
| `BST` nach der Zeit | Der ausdrücklich in der XMLTV-DTD definierte Offset `+0100`. |
| Andere lokale Abkürzung | Wird nicht geraten. Die Quelle sollte einen numerischen UTC-Offset liefern. |
| Fehlendes `stop` | Unbekanntes Ende, intern `null`; keine automatische Ergänzung. |

Numerische Offsets unterscheiden auch zweimal vorkommende lokale Uhrzeiten beim Wechsel zwischen Sommer- und Winterzeit. Der Adapter speichert Unix-Zeiten in Millisekunden. Die Webseite zeigt sie in der Zeitzone des Browsers; Aktionsprüfungen verwenden die Systemuhr des ioBroker-Rechners. Eine falsche Rechnerzeit wird nicht vom Adapter korrigiert.

Die XMLTV-Auswahl reicht standardmäßig **24 Stunden zurück und 48 Stunden voraus**, bezogen auf den Abrufzeitpunkt. Eine bekannte Sendung, deren Intervall die Fenstergrenze überschreitet, kann relevant bleiben. Ein letzter unbekannter Start vor der Grenze wird nur als notwendiger Konflikthinweis behalten, wenn sonst eine lange Sendung fälschlich als eindeutig gelten könnte. Es werden ausschließlich Programme der gewählten, erfolgreich zugeordneten TV-Dienste gespeichert. Der abgeleitete Cache ist keine Programmhistorie und keine Zusage einer vollständig gefüllten 48-Stunden-Tafel.

Titel, Untertitel und Beschreibungen werden übernommen, soweit geliefert; bei mehreren Sprachfassungen haben deutsche Texte Vorrang. XMLTV-Ereignisse erhalten stabile synthetische IDs für die Auswahl. Daraus wird keine Loewe-Aufnahme-ID abgeleitet. Exakt doppelte Programme werden zusammengefasst; unterschiedliche Alternativen bleiben unterscheidbar.

## Speicherung und Neustart

TV und XMLTV besitzen **getrennte Quellcaches mit eigenen Abrufzeitpunkten**. Ein erfolgreicher Abruf aktualisiert nur die betreffende Quelle. Ein neuer XMLTV-Abruf macht einen alten TV-Cache nicht wieder frisch. Jede Quelle darf höchstens **24 Stunden seit ihrem eigenen erfolgreichen Abruf** verwendet werden. Ein Plan bis 48 Stunden voraus verlängert diese Altersgrenze nicht.

Bei vorübergehendem Download- oder TV-Fehler können noch gültige gespeicherte Programme weiter erscheinen. Ein erfolgreicher leerer Abruf ersetzt den bisherigen Bestand dieser Quelle. Eine fehlende, mehrdeutige oder ausdrücklich deaktivierte XMLTV-Zuordnung liefert keine fremden Programme als Ersatz.

| Bestandteil | Internes Schema | Grenze |
|---|---|---|
| TV-Quellcache | `2`, `source: "tv"` | Bis 128 KiB je Sender; bei vielen Sendern kleiner. |
| XMLTV-Quellcache | `3`, `source: "xmltv"` | Bis 128 KiB je Sender; bei vielen Sendern kleiner. |
| Gemeinsame persistente Hülle bei externer Quellenwahl | `4`, enthält TV, XMLTV und Zuordnung | Bis 264 KiB je Sender. |
| Normalisierte Sendungen je Cache | Quellenunabhängige Zeitprüfung | Höchstens 128, zusätzlich durch das Bytebudget begrenzt. |

In **Nur TV** bleibt der bisherige TV-Cache ohne externe Hülle verwendbar. Die Einzelgrenzen werden aus 16 MiB geteilt durch die Anzahl der Sender berechnet und auf 8 bis 128 KiB begrenzt. Diese Berechnungsgrundlage ist kein pauschaler Gesamt-RAM-Deckel für beide Quellen, eine abgeleitete Ansicht oder den Node.js-Prozess. Beschreibungen und sicher entfernbare spätere Einträge können gekürzt werden; notwendige Konflikthinweise für aktuelle beziehungsweise nächste Programme werden nicht still entfernt.

Beim Neustart prüft der Adapter TV-Dienst und Senderliste sowie Alter und Zeitdaten. XMLTV ist zusätzlich an die konfigurierte Feedadresse, Dienstidentität und Namen/Aliasse, die manuelle Entscheidung und die konkrete XMLTV-Sender-ID gebunden. Ändern sich diese Angaben, darf der alte externe Plan nicht unter der neuen Zuordnung weiterlaufen. Eine geänderte Programmplatznummer desselben TV-Dienstes allein macht den Bestand nicht zu einem anderen Sender.

Gültige **TV-Caches aus Schema 1** können weiterhin migriert werden. **Externe Schema-1-Caches** aus der früheren Implementierung werden nicht übernommen; sie müssen aus der aktuell konfigurierten Quelle neu gelesen werden. Ebenso werden unbekannte Herkunft, unpassende Identitäten, ungültige Zeiten und geschätzte Endzeiten verworfen. Das gilt schon vor dem ersten Abruf und auch bei Intervall `0`.

`epg.cache` ist ein internes Expertenformat. Für eigene Automationen das zusammenhängende **`epg.data`** verwenden; dessen Schema bleibt `2` und wird bei aktiver externer Quelle um Herkunft und Diagnose ergänzt. [Cacheimplementierung](../lib/epg-sources.js) · [Zeit- und Größenprüfung](../lib/epg-data.js).

## Aufnahme und Umschalten bei TV aus

Eine XMLTV-Sendung kann nur dann zur Aufnahme vorgemerkt werden, wenn sie einem gespeicherten TV-Dienst eindeutig zugeordnet ist, ihre Start- und Endzeit bekannt sind und ihr Beginn noch bevorsteht. Die Auswahl wird beim Bestätigen serverseitig erneut geprüft. Ändern sich Quelle oder Senderzuordnung, muss die aktuelle Sendung neu ausgewählt werden.

Der TV-Befehl verwendet **immer den gespeicherten TV-Locator der eigenen Adapterinstanz**. Eine XMLTV-Kennung ersetzt diesen Locator nicht und kann keinen anderen Fernseher, Host oder fremden Senderpfad vorgeben. Ein manuell falsch zugeordneter Feed kann dennoch falsche Programmtitel und Zeiten für den gewählten TV-Sender liefern; deshalb ist die inhaltliche Kontrolle der Korrekturtabelle erforderlich.

Bei TV aus wird die bestätigte Vormerkung dauerhaft im nur lesbaren Journal `recordings.jobs` gespeichert. Der Adapter wartet auf eine erreichbare TV-Steuerschnittstelle und sendet den Auftrag vor Sendungsbeginn, sofern die übrigen Prüfungen erfüllt sind. Die Aufnahmeverwaltung löst dafür **kein Wake-on-LAN und keinen Einschaltbefehl** aus. Ein möglicherweise bereits gesendeter Auftrag wird auch nach Fehler oder Neustart nicht automatisch erneut gesendet. Die [Auftragszustände](EPG_GUI.md#zustände-der-aufnahmeaufträge) unterscheiden wartend, übertragen, unklar und im TV bestätigten Timer.

Der Nutzer hat die Übertragung wartender Aufträge nach dem Einschalten inzwischen bestätigt. Eine direkte Timerprogrammierung im Standby mit aktiviertem Schnellstart ist weiterhin nicht am Gerät bestätigt. Ebenso belegt ein bestätigter TV-Timer keinen erfolgreichen Aufnahmeabschluss. Das XMLTV-Update verändert diese Nachweisgrenzen nicht.

**Jetzt ansehen** benötigt einen erreichbaren Fernseher und eine zum Ausführungszeitpunkt noch eindeutig laufende Sendung. Diese Aktion startet keinen Einschaltablauf. Die separate Fernbedienung bleibt auch ohne EPG-Auswahl bedienbar; [Tasten und Einschaltablauf](REMOTE_CONTROL.md).

## Abrufgrenzen

| Begrenzung | Wert |
|---|---|
| Regulärer XMLTV-Abruf | Höchstens 30 Sekunden insgesamt, einschließlich Weiterleitungen, Download und Verarbeitung. |
| Ausdrückliche Zuordnungsvorschau | Höchstens 25 Sekunden für den Quellenabruf. |
| Weiterleitungen | Höchstens 3; HTTP(S), keine Benutzerinfo, kein Wechsel von HTTPS auf HTTP. |
| Übertragene Daten | Höchstens 16 MiB. |
| Entpackte Daten | Höchstens 64 MiB. |
| Senderkennungen im Guide | Höchstens 50.000; begrenzte Namen und Metadaten. |
| Programmeinträge im Guide | Höchstens 500.000 insgesamt, auch wenn nur ausgewählte Sender gespeichert werden. |
| Vor der Cachenormalisierung behaltene Programme | Höchstens 2.048 je zugeordnetem XMLTV-Sender und 65.536 insgesamt. |
| Behaltene Programmdaten beim Import | Höchstens 24 MiB; Sender-Metadaten zusätzlich höchstens 8 MiB. |

Eine Überschreitung liefert einen nachvollziehbaren Fehler und keinen still unvollständigen neuen Plan. Der Adapter wiederholt einen fehlgeschlagenen Download nicht sofort automatisch; ein späterer regulärer oder manuell angeforderter Abgleich kann erneut abrufen. Ungültiges UTF-8, kaputte XML-Struktur, widersprüchliche ausgewählte Sendungen und nicht unterstützte Komprimierung werden ebenfalls abgewiesen.

Eine übliche externe Deklaration wie `<!DOCTYPE tv SYSTEM "xmltv.dtd">` wird als inerte Formatangabe akzeptiert. Externe DTD-Dateien werden nicht geladen. Interne DTD-Teilmengen und Entitätsdeklarationen werden abgewiesen; es findet keine DTD-basierte Entitätserweiterung und kein Zugriff auf darin genannte Dateien oder Adressen statt. Die üblichen XML-Zeichenreferenzen wie `&amp;` bleiben verwendbar. [XMLTV-Loader und Limits](../lib/epg-xmltv.js).

## Diagnose

Zuerst **Quelle laden und Zuordnung prüfen**, danach den gespeicherten Betrieb mit **EPG aktualisieren** kontrollieren. Unter `channels.epgLastError` steht der erste Fehler des aktuellen beziehungsweise letzten Abgleichs. Das `epg.data` des betroffenen TV-Senders enthält bei aktiver externer Quelle zusätzliche Angaben:

| JSON-Feld | Inhalt |
|---|---|
| `source` | Verwendeter Bestand: `tv`, `xmltv`, `mixed` oder `null`. |
| `now.source`, `next.source` | Herkunft des einzelnen angezeigten Programms, sofern vorhanden. |
| `xmltvMapping` | Exakte `tvChannelId`, zugeordnete `xmltvId` oder `null`, Zuordnungsstatus und gegebenenfalls `iconUrl`. |
| `xmltvDiagnostic` | Zeitpunkt `at` und Zuordnungsstatus; beim Abruffehler zusätzlich `code` und `message`. Vor dem ersten Versuch `null`. |
| `tvDiagnostic` | Weiterhin der tatsächliche letzte TV-Versuch. Erfolgreiche externe Daten löschen dessen Aussage über einen TV-Fehler nicht. |

| Beobachtung | Prüfung |
|---|---|
| `EPG_XMLTV_CONFIG` | Quellenmodus, gültige HTTP(S)-Adresse und manuelle Korrekturen prüfen. TV-EPG bleibt bei optionalem Konfigurationsfehler nutzbar. |
| `XMLTV_URL`, `XMLTV_REDIRECT` | Direktlink auf die Feeddatei verwenden; erlaubtes Protokoll, Weiterleitungsziel und Anzahl prüfen. |
| `XMLTV_HTTP`, `XMLTV_NETWORK`, `XMLTV_TIMEOUT` | Erreichbarkeit vom ioBroker-Rechner, HTTP-Status und Antwortdauer des Anbieters prüfen. |
| `XMLTV_ENCODING`, `XMLTV_INVALID_XML`, `XMLTV_TIME` | Tatsächliches XMLTV in UTF-8, unterstützte Komprimierung, konkrete Sendezeiten und Zeitzonen prüfen. Eine HTML-Fehler-/Loginseite ist kein Guide. |
| `XMLTV_LIMIT` | Kleinere beziehungsweise passend eingegrenzte Quelle verwenden; die feste Grenze wird nicht durch einen Teilimport umgangen. |
| Fehlender oder mehrdeutiger Sender | Vorschau prüfen, TV-Sender wählen und den XMLTV-Sender suchen oder seine genaue ID eingeben. **Korrektur in die Tabelle übernehmen**, prüfen und normal speichern. Ähnliche Namen werden nicht automatisch bestätigt. |
| Leere Vorschau trotz erfolgreichem Abruf | Gewählten Zeitraum, Quelle, Senderabdeckung und deren tatsächlich gelieferte Programme prüfen. **Jetzt** stellt die aktuelle Zeitansicht wieder her. |
| Daten nach einem Tag verschwunden | Die betroffene Quelle erneut erfolgreich abrufen. Ein bis 48 Stunden reichender Plan bleibt nicht länger als 24 Stunden ohne gültige Aktualisierung verwendbar. |

Fehlermeldungen aus dem XMLTV-Loader enthalten keine Feedadresse oder deren Query. Die Cachebindung verwendet einen Hash. Die bewusst konfigurierte Adresse bleibt selbstverständlich in der Instanz-Konfiguration gespeichert.

## Logos, Web und Cloud

Ein XMLTV-Sender darf eine Bildadresse liefern. Sie wird nur nach erfolgreicher Zuordnung zum konkreten TV-Sender berücksichtigt. Die Reihenfolge ist **manuelles Logo → TV-Logo → zugeordnetes XMLTV-Logo → mitgeliefertes Logo → Sendername**. Externe Bilder lädt der Browser direkt; der Adapter lädt sie nicht im Hintergrund und stellt keinen Bildproxy bereit. Deshalb kann ein privates TV-Bild remote unerreichbar sein. Unter HTTPS werden HTTP-Bilder übersprungen. [Logoquellen und manuelle Bilder](CHANNEL_LOGOS.md).

XMLTV ändert die vorhandene Web-/Cloud-Anbindung nicht. Die ausgewählte `native.webInstance` bleibt erhalten; jede TV-Instanz hat ihre eigene Route wie `/loewe-tv.0/epg.html` oder `/loewe-tv.1/epg.html`. Für Cloud-Zugriff weiterhin dieselbe Web-Instanz in LOEWE-TV und Cloud auswählen und die funktionierenden Web-Startseitenkacheln verwenden. [Web-/Cloud-Einrichtung](EPG_GUI.md#über-iobrokercloud-remote-öffnen).

Das bekannte **Admin-8-Linkproblem ist mit diesem Update nicht behoben**. Automatisch erzeugte Instanz- oder Schnellzugrifflinks können durch Admin auf eine falsche Adresse zeigen. Verwende dann die direkte Admin-Adresse mit passendem `?instance=0` beziehungsweise `?instance=1`, den Reiter **Programmübersicht** oder eigene Schnellzugriffskacheln. Dafür müssen weder Web-/Cloud-Auswahl noch andere Instanzen gelöscht oder umkonfiguriert werden. [Direktlinks und eigene Admin-Kacheln](ADMIN_LINKS.md).

## Nachweisstand

Die XMLTV-/Mappingtests verwenden synthetische Dateien und Streams. Sie prüfen unter anderem eindeutige und mehrdeutige Sender, manuelle Ausnahmen, UTF-8/gzip, Zeitzonen, fehlende Enden, Größen- und Zeitgrenzen sowie Abbruch und ungültiges XML. Das ist kein Test einer konkreten Feedadresse des Nutzers. Der jeweils gewählte Anbieter, seine Senderabdeckung und seine Aktualität müssen anhand der Vorschau und der tatsächlichen Daten geprüft werden.

Erste erfolgreiche Remote-Fernbedienungstests und die Übertragung wartender Aufnahmeaufträge nach dem Einschalten stammen aus der Nutzerrückmeldung. Sie werden keinem dabei ungenannten TV-Modell zugeordnet. Direkte Timerübertragung im Schnellstart-Standby, erfolgreicher Aufnahmeabschluss und die originale Timer-XML-Antwort sind weiterhin nicht dokumentiert. Die bisherigen abgeschlossenen Prüfberichte behalten ihren historischen Stand; aktuelle Gerätebefunde stehen in der [Kompatibilitätsübersicht](COMPATIBILITY.md).
