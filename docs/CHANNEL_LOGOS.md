# Senderlogos: Herkunft und Verwendung

Stand: **19. Oktober 2026**.

## Senderlogos einrichten

Ab **0.1.23** enthält das Register **Senderlogos** eine Zuordnungstabelle aus der gespeicherten TV-Senderliste und den Katalog von [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos). Die Tabelle ist für jede Adapterinstanz getrennt. Die Sender müssen nicht von Hand angelegt werden; ein ausgeschalteter Fernseher und deaktiviertes EPG verhindern die lokale Zuordnung nicht. Eine laufende Adapterinstanz und eine bereits gespeicherte TV-Senderliste sind erforderlich.

1. Die Einstellungen der betreffenden LOEWE-Instanz öffnen und **Senderlogos** wählen.
2. Die **Logo-Quelle** wählen. Voreingestellt ist **Fernseher und Logo-Verzeichnis**.
3. Das **bevorzugte Land** wählen: Deutschland, Österreich, Schweiz oder alle Länder. Deutschland ist der Standard. Diese Einstellung entscheidet zwischen gleichwertigen Länderfassungen; der gesamte Katalog bleibt manuell auswählbar.
4. Die automatisch geladenen Senderzeilen prüfen. **TV-Sender und Logos neu laden** lädt die gespeicherte Liste erneut. **Logo-Zuordnung erneut prüfen** berechnet die Treffer für den aktuellen Formularstand.
5. Bei Bedarf in einer Zeile **Manuell** wählen und im Feld daneben nach dem passenden Logo suchen. Zum Beispiel finden `SAT.1` und `ZDFHD` auch die getrennt geschriebenen Katalognamen. Einen Treffer auswählen; ein bloß eingegebener Sendername ist noch kein gültiger Dateipfad.
6. Nach Änderungen die Zuordnung erneut prüfen und **Speichern**. Anschließend die Programmübersicht neu laden.

Während eine Liste lädt, zunächst die Antwort abwarten. Die Tabelle übernimmt Antworten nur, wenn der Formularstand noch zur Anfrage passt. Ein Fehler liefert keine leere Ersatztabelle und verändert keine gespeicherten Einstellungen. Korrekturen für vorübergehend fehlende TV-Sender bleiben erhalten. Die Original-Tabelle der unterstützten Admin-Basis puffert Änderungen kurz; weitere Hinweise zur getesteten Formularkompatibilität stehen im [Prüfbericht](PRUEFBERICHT_0.1.23.md).

| Zuordnung je TV-Sender | Wirkung |
|---|---|
| **Automatisch** | Verwendet einen eindeutigen Treffer aus dem Verzeichnis. Mehrere gleichwertige Kandidaten werden zur manuellen Auswahl vorgeschlagen. |
| **Manuell** | Verwendet genau den ausgewählten Katalogpfad. Ein leerer oder nicht mehr enthaltener Pfad wird angezeigt und führt zu keinem automatischen Ersatztreffer im Verzeichnis. |
| **Kein Verzeichnislogo** | Deaktiviert nur das Verzeichnislogo dieses Senders. Die übrigen gewählten Quellen und eine ausdrücklich eingetragene eigene Bildadresse bleiben möglich. |

Die Spalte **TV-Bildadresse** zeigt, ob der gespeicherte Senderkatalog eine gültige TV-Bildadresse enthält. Sie ist kein Downloadtest. Unter **Letzte Prüfung der Logo-Zuordnung** steht das Ergebnis der letzten lokalen Prüfung; nach Änderungen erneut prüfen. Beide Spalten dienen der Anzeige und ändern keine TV-Dienstkennung.

## Auswahl in der Programmübersicht

Eine ausdrücklich eingetragene **manuelle Logo-Adresse hat in allen Modi Vorrang**. Danach bestimmt die gewählte Quelle die automatische Auswahl:

| Logo-Quelle | Reihenfolge nach einer manuellen Bildadresse |
|---|---|
| **Nur Fernseher** | TV-Bild, anschließend Sendername |
| **Nur Logo-Verzeichnis** | Zugeordnetes Verzeichnislogo, anschließend Sendername |
| **Fernseher und Logo-Verzeichnis** | TV-Bild → Verzeichnislogo → eindeutig zugeordnetes XMLTV-Bild → mitgeliefertes SVG → Sendername |

Jede Adresse wird beim Laden eines Senderbildes höchstens einmal versucht. Schlägt sie fehl, folgt die nächste erlaubte Quelle. Sendernummer, Suche, Tooltip und Screenreader behalten den ursprünglichen Namen aus der TV-Liste. Das XMLTV-Bild wird erst nach der Zuordnung zum konkreten TV-Dienst übernommen. Eine Logo-Zuordnung ersetzt oder verändert keine EPG-Zuordnung, Programmdaten, Umschaltziele oder Aufnahmen.

Alle Sender haben dieselbe quadratische Anzeigefläche: **48 × 48 Pixel** auf größeren Ansichten und **44 × 44 Pixel** bis einschließlich 640 Pixel Ansichtsbreite. `object-fit: contain` erhält die ursprünglichen Proportionen; breite oder hohe Logos werden weder gestreckt noch beschnitten. Die freie Fläche erhält den vorhandenen dezenten Hintergrund. Auch der Sendername als Ersatz bleibt in dieser Fläche. Er kann dort auf drei sichtbare Zeilen begrenzt sein; der vollständige Name bleibt im Tooltip, in der Suche und für Screenreader erhalten. Die Sendernummer steht separat daneben.

Die TV-Schnittstelle enthält das optionale Attribut `thumbnailUrl` an `ResultItemReference` in der Antwort auf `GetChannelList`. Der [Parser](../lib/loewe-client.js) liest es bereits; seit 0.1.14 bleibt es über den Senderkatalog bis zur Programmübersicht erhalten. Für Logos werden keine zusätzlichen TV-Abfragen gestartet. Ob der konkrete Fernseher Bildadressen liefert, ist am Gerät zu prüfen. Eine vorhandene Liste kann bei eingeschaltetem TV einmal mit `channels.refresh=true` aktualisiert werden.

Absolute HTTP-/HTTPS-Adressen werden geprüft. Nur TV-Pfade dürfen relativ sein und werden dann gegen den konfigurierten TV-Host und Steuerport aufgelöst. Manuelle und XMLTV-Bildadressen müssen absolut sein. Nicht unterstützte Protokolle, protokollrelative Adressen, Zugangsdaten, Steuerzeichen, Backslashes und überlange Adressen werden verworfen. **HTTPS-Seiten überspringen HTTP-Bilder.** Im Modus „Beides“ kann dann direkt das HTTPS-Verzeichnislogo erscheinen.

Die mitgelieferten SVGs liegen im Adapter und werden von Admin beziehungsweise der gewählten Web-Instanz ausgeliefert. Externe Bilder lädt der Browser direkt von der angegebenen Adresse, ohne Referrer; ein Bildproxy wird nicht eingesetzt. Für Verzeichnisbilder ist HTTPS-Zugriff auf `raw.githubusercontent.com` nötig. Eine lokale TV-Adresse kann beim Fernzugriff unerreichbar sein. Bilder werden als `img` eingebunden und erhalten keine Farbfilter.

## Verzeichnis und automatische Zuordnung

Mitgeliefert wird ein Katalog mit **1.046 Bildvarianten**: Deutschland 683, Österreich 136, Schweiz 63, International 129 und Europa 35. Die Zahl enthält unter anderem HD-, Regional- und Designvarianten. Verzeichnisse `old` und `custom` sind ausgeschlossen. Der Quellstand ist auf einen Commit festgelegt; die Dateipfade werden nicht geraten. **Die PNG-Bilder selbst sind nicht Teil des Pakets.** Die [Herkunftsdokumentation](logo-registry-source.md) nennt den geprüften Commit, Dateihashes, Auswahlumfang, Nutzungshinweise und die Aktualisierung des Katalogs.

Die Zuordnung bevorzugt exakte Namen und Qualitätsstufen, danach ausdrücklich hinterlegte gleichwertige Schreibweisen. Ein Sender mit HD-Kennung erhält bevorzugt sein HD-Bild oder ein allgemeines Logo desselben Senders; eine andere ausdrückliche Qualitätsstufe wird nur vorgeschlagen. Ein vorhandenes regionales Logo hat Vorrang vor einem allgemeinen Logo. Bekannte Regionalnamen dürfen auf ihre gemeinsame Sendermarke zurückfallen; unbekannte Regionen werden nicht entfernt. Plus-Zeichen, Nummern, `Black`/`White` und Submarken bleiben unterscheidbar. Standarddesigns haben bei sonst gleichwertigen Treffern Vorrang vor Alternativ-, Querformat- oder Symbolvarianten. Verbleibende Gleichstände erfordern eine manuelle Entscheidung.

Beispiele aus dem Katalog und den automatisierten Prüfungen:

| TV-Name | Automatischer Treffer |
|---|---|
| `ARD HD` | Das Erste HD |
| `ZDFHD` | ZDF HD |
| `SAT.1 HD` | Sat 1 HD |
| `RTL II HD` | RTL Zwei HD |
| `WDR HD Aachen` | WDR Aachen, eigenes Regionalbild |

Diese Beispiele bestätigen die implementierten Regeln am mitgelieferten Katalog. Die konkrete Trefferquote deiner beiden TV-Listen wurde hier nicht am Gerät gemessen. Ein vorhandener Dateiname garantiert auch nicht den heutigen Sendebetrieb oder Markenstand.

## Gespeicherte Einstellungen und Darstellung

`native.channelLogoSource` enthält `auto`, `tv` oder `registry`, `native.channelLogoCountry` enthält `de`, `at`, `ch` oder `all`. `native.channelLogoMappings` besteht aus Zeilen mit der exakten TV-Service-ID `channel`, `mode` und `logoId` sowie ausschließlich angezeigten Metadaten. Nur Katalogpfade können Registry-Bildadressen erzeugen. Fehlerhafte optionale Logo-Einstellungen verhindern den Adapterstart nicht.

Eigene Bildadressen bleiben in `native.channelLogoOverrides` als Zeilen mit `channel` und `url`. Der bestehende Editor und gespeicherte Adressen bleiben erhalten. Eine Bildadresse muss für den exakt ausgewählten TV-Dienst gelten; Sendername oder Programmplatz ersetzen dessen Kennung nicht.

Der interne Darstellungsvertrag erweitert `channelLogo(service, tvOrigin, { source, overrideUrl, registryLogoUrl, xmltvIconUrl })`. Er liefert optional `logoUrl`, höchstens **drei** weitere externe Adressen in `logoAlternatives` und einen lokalen Pfad in `logoFallback`. Gleiche normalisierte URLs werden entfernt. Die EPG-Schicht löst Registry- und XMLTV-Logos vorher für den konkreten TV-Sender auf. Kein Logofeld ist Teil der Sender-, EPG-Cache- oder Aufnahmeidentität.

## Nutzungsstatus und Herkunft

Die unten verlinkten Wikimedia-Commons-Dateiseiten kennzeichnen die jeweilige Grafik als **Public domain / PD-textlogo**: einfache Schrift- oder Formlogos, die nach der dortigen Bewertung die urheberrechtliche Schutzschwelle nicht erreichen. Das ist die Grundlage für die Auswahl dieser einzelnen Grafiken. Eine pauschale Aussage über beliebige Senderlogos oder ganze Logosammlungen wird damit nicht getroffen.

**Markenrechte bleiben bestehen.** Die Grafiken dienen hier zur Kennzeichnung des jeweiligen TV-Senders in der Programmliste. Die urheberrechtliche Einstufung ist keine Markenlizenz und keine Aussage, dass die Sender dieses Projekt unterstützen. Die MIT-Lizenz des Adaptercodes ändert die Rechte an den Senderkennzeichen nicht.

Die SVG-Dateien wurden aus den jeweils angegebenen, auf einen Commit festgelegten öffentlichen GitHub-Spiegeln übernommen. Ihre Nutzungsgrundlage wird durch die einzelne Commons-Dateiseite dokumentiert. Editor-Metadaten und externe DTD-Deklarationen wurden entfernt; ausgeliefert werden statische SVG-Elemente ohne Skripte, externe Ressourcen oder eingebettete Rasterbilder. Die sichtbaren Formen und Farben bleiben erhalten. Das [maschinenlesbare Quellenverzeichnis](../admin/logos/sources.json) enthält zusätzlich Prüfdatum, exakte Downloadquelle und SHA-256 der tatsächlich mitgelieferten Datei.

Die ARTE-Datei enthält die waagerechte Fassung der Wortmarke; die verlinkte Commons-Seite dokumentiert dieselbe Wortmarke in senkrechter Ausrichtung. RTLZWEI verwendet das Zeichen mit offenem Rahmen von 2019, VOX die Fassung mit roter Kugel von 2013. Die Nutzungsangabe für das einzelne VOX-Logo stammt von seiner Commons-Dateiseite und ist keine Aussage über die übrigen Grafiken der als Downloadquelle verwendeten picons-Sammlung.

Diese Prüfung gilt für die unten aufgeführten mitgelieferten Dateien. Für über TV, Logo-Verzeichnis, XMLTV oder manuelle Adressen geladene Bilder gelten die Bedingungen ihrer jeweiligen Quelle; ihre Nutzungsrechte werden durch die URL-Prüfung nicht bestätigt.

## Mitgelieferte Logos

| Sender | Nutzungsstatus / Quelldatei | Übernommene Datei |
|---|---|---|
| Das Erste | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Das_Erste_2014.svg) | [das-erste.svg](https://github.com/Dominique21000/accueil/blob/c5622ebf84c92f0432d9e49b7e5bbb7c4ce86c48/img/Das_Erste_2014.svg) |
| ZDF | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:ZDF_logo.svg) | [zdf.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/ZDF_logo.svg) |
| 3sat | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:3sat_2019.svg) | [3sat.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/3sat_2019.svg) |
| RTL | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:RTL_Logo_2021.svg) | [rtl.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/RTL_(2021)_II.svg) |
| ProSieben | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:ProSieben.svg) | [pro-sieben.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/ProSieben.svg) |
| kabel eins | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Kabel_eins_Logo_2015.svg) | [kabel-eins.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/Kabel_eins_2015.svg) |
| sixx | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Sixx_Logo.svg) | [sixx.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/Sixx.svg) |
| RTL Super | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:RTL_Super_Logo_2023.svg) | [rtl-super.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/RTL_Super_logo_2023.svg) |
| ZDFinfo | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:ZDFinfo_2011.svg) | [zdfinfo.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/ZDFinfo_2011.svg) |
| WDR Fernsehen | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:WDR_Dachmarke.svg) | [wdr.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/WDR_2012.svg) |
| MDR Fernsehen | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:MDR_Logo_2017.svg) | [mdr.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/MDR_2017.svg) |
| NDR Fernsehen | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:NDR_Dachmarke.svg) | [ndr.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/NDR_2019.svg) |
| BR Fernsehen | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Logo_Bayerischer_Rundfunk_2024.svg) | [br.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/Bayerischer_Rundfunk_2024.svg) |
| SR Fernsehen | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:SR_Fernsehen_Logo_2023.svg) | [sr.svg](https://github.com/atishramkhe/atishramkhe.github.io/blob/07242b7d2273891fea9cd31ad8d2524f0fbf845d/sport/logos/Germany/SR_Fernsehen_(2023).svg) |
| ZDFneo | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:ZDFneo2017_Logo.svg) | [zdfneo.svg](https://github.com/mediathekview/MediathekView/blob/55f8f7dfda8adaeb8f6d4112dac4b38e0d149639/src/main/resources/icons/sender/ZDFneo.svg) |
| KiKA | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Kika_2012.svg) | [kika.svg](https://github.com/mediathekview/MediathekView/blob/55f8f7dfda8adaeb8f6d4112dac4b38e0d149639/src/main/resources/icons/sender/kika.svg) |
| phoenix | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Phoenix-logo-2018.svg) | [phoenix.svg](https://github.com/mediathekview/MediathekView/blob/55f8f7dfda8adaeb8f6d4112dac4b38e0d149639/src/main/resources/icons/sender/phoenix.svg) |
| ARTE | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:Arte_Logo_2017.svg) | [arte.svg](https://github.com/mediathekview/MediathekView/blob/55f8f7dfda8adaeb8f6d4112dac4b38e0d149639/src/main/resources/icons/sender/arte.svg) |
| RTLZWEI | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:RTLZWEI_Logo_2019.svg) | [rtlzwei.svg](https://github.com/Jasmeet181/mediaportal-de-logos/blob/8eabb30922657c839259795597d2cba35b8af18d/TV/RTLZwei.svg) |
| VOX | [PD-textlogo auf Commons](https://commons.wikimedia.org/wiki/File:VOX_Logo_2013.svg) | [vox.svg](https://github.com/picons/picons/blob/2666916e01c5b87c74a809a755d0e133a238ac95/build-source/logos/vox.default.svg) |

Die Zuordnung verwendet ausdrücklich eingetragene Sendernamen und Aliase. Groß-/Kleinschreibung, übliche Trennzeichen, deutsche Umschriften wie `ö`/`oe` sowie HD-, SD-, UHD- und 4K-Qualitätsmarker werden berücksichtigt. Qualitätsmarker können auch vor einer ausdrücklich hinterlegten Region stehen, beispielsweise in `WDR HD Köln`. Regionale Zusätze werden nicht entfernt, und `+` bleibt ein unterscheidendes Zeichen. RTL, RTL Super und andere Programme werden nicht über unscharfe Teiltreffer zusammengelegt. Für WDR, NDR, MDR und BR sind geläufige regionale Namen ausdrücklich hinterlegt. Die Grafik ist reine Darstellung und hat keinen Einfluss auf Dienstkennung, Programmplatz, Umschalten oder Aufnahmezuordnung.

Für RTLZWEI sind zusätzlich `RTL II` und `RTL 2` als frühere beziehungsweise gebräuchliche Schreibweisen hinterlegt. Diese Identität und die Schreibweise `RTL2` sind in der [Erläuterung des Senders zur Wortmarke](https://unternehmen.rtl2.de/blog/so-schreibt-man-rtlzwei-ein-oder-zwei-gedanken-zu-unserer-wortmarke) dokumentiert. RTL, RTL Super, RTLup und RTL+ erhalten dadurch kein RTLZWEI-Logo; VOXup und VOX Music TV erhalten kein VOX-Logo.

Die Auswahl umfasst **20 mitgelieferte Logos**. ARTE, RTLZWEI und VOX ergänzen die bisherige Abdeckung; daraus folgt keine Aussage, welche Sender bei einem bestimmten TV fehlten. Für SAT.1 wird in diesem Stand kein lokaler Ersatz mitgeliefert: Eine passende farbige SVG mit ausreichend belegter Quelle wurde bei dieser Ergänzung nicht übernommen. Das neue externe Verzeichnis enthält SAT.1 einschließlich HD und Regionalvarianten; TV-, XMLTV- und manuelle Bildadressen bleiben ebenfalls möglich. Neue Ersatzlogos können nach Einzelprüfung ihrer Quelle und Rechte in `admin/logos/` ergänzt und im Quellenverzeichnis registriert werden. Nicht abgedeckte Sender bleiben vollständig bedienbar und zeigen ihren Namen, sofern keine der konfigurierten Quellen ein nutzbares Bild liefert.

## Prüfumfang

Automatisierte Prüfungen sichern die Quellenreihenfolge, begrenzte und deduplizierte Alternativen, lokalen Ersatz, Textfallback, quadratische Geometrie für Desktop und Mobilansicht, HTTPS-Verhalten, sichere Adressen, Namenszuordnung, Dateiquellen, Hashes, wohlgeformtes SVG-XML mit gültiger `viewBox` und statische SVG-Inhalte ab. Testadressen und Varianten für die neue Quellenreihenfolge sind synthetisch und keine aufgezeichneten Antworten eines Fernsehers oder XMLTV-Anbieters. Bei großen Senderlisten werden optionale TV-Bildadressen zuerst verworfen, bevor die bestehende Größenbegrenzung einen Katalog ablehnt. Geänderte Bildadressen gelten nicht als Wechsel der Senderidentität.

Die mitgelieferten Grafiken und automatisierten Tests ersetzen keine Geräteprüfung der optionalen Bildadressen oder einen Aufruf der Programmübersicht über die tatsächliche lokale beziehungsweise Cloud-Verbindung.
