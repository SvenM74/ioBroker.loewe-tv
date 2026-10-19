# Senderlogos: Herkunft und Verwendung

Stand: **19. Oktober 2026**.

## Auswahl in der Programmübersicht

Die Anzeige versucht verfügbare Bilder in dieser Reihenfolge:

1. Eine ausdrücklich für diesen TV-Sender eingetragene Logo-Adresse.
2. Die vom Fernseher gelieferte Bildadresse.
3. Das Logo des eindeutig zugeordneten XMLTV-Senders, sofern die externe Quelle eines enthält.
4. Ein passendes mitgeliefertes Logo.
5. Den ursprünglichen Sendernamen, falls kein Bild geladen werden kann.

Beim Laden eines Senderbildes wird jede Adresse höchstens einmal versucht. Schlägt eine Quelle fehl, bleibt die nächste passende Quelle verfügbar. Sendernummer, Suche, Tooltip und Screenreader behalten den ursprünglichen Namen aus der TV-Senderliste. Das XMLTV-Bild wird erst nach der Zuordnung zum konkreten TV-Dienst übernommen; die Logoauswahl selbst ordnet keine EPG-Programme zu.

Alle Sender haben dieselbe quadratische Anzeigefläche: **48 × 48 Pixel** auf größeren Ansichten und **44 × 44 Pixel** bis einschließlich 640 Pixel Ansichtsbreite. `object-fit: contain` erhält die ursprünglichen Proportionen der Grafik; breite oder hohe Logos werden weder gestreckt noch beschnitten. Die freie Fläche erhält einen dezenten hellen Hintergrund, ohne die Markenfarben zu verändern. Auch der Sendername als Ersatz bleibt in dieser Fläche. Er kann dort auf drei sichtbare Zeilen begrenzt sein; der vollständige ursprüngliche Name bleibt im Tooltip, in der Suche und für Screenreader erhalten. Die Sendernummer steht weiterhin separat daneben.

Die optionalen manuellen Einträge liegen in `native.channelLogoOverrides` als Zeilen mit `channel` und `url`: `channel` bezeichnet die exakte Service-ID aus dem TV-Senderkatalog, `url` eine absolute HTTP-/HTTPS-Bildadresse. Ein Sendername oder Programmplatz ersetzt diese Kennung nicht. Einträge ändern ausschließlich das Bild des betreffenden TV-Senders. TV- und XMLTV-Adressen sowie ein passendes mitgeliefertes Logo bleiben als Ersatz erhalten.

Die TV-Schnittstelle enthält das optionale Attribut `thumbnailUrl` an `ResultItemReference` in der Antwort auf `GetChannelList`. Der bestehende Parser in [loewe-client.js](../lib/loewe-client.js) liest es bereits; seit 0.1.14 bleibt es über den vollständigen Senderabruf und den [Senderkatalog](../lib/channel-catalog.js) bis zur [Programmübersicht](../lib/epg-guide.js) erhalten. Zusätzliche Logo- oder EPG-Abfragen an den TV werden dafür nicht gestartet. Ob der konkrete Loewe-TV gefüllte Bildadressen liefert, ist noch am Gerät zu prüfen. Nach dem Update kann bei eingeschaltetem TV einmal `channels.refresh=true` ausgelöst werden.

Absolute HTTP-/HTTPS-Adressen werden geprüft. Nur vom TV gelieferte relative Pfade werden gegen den konfigurierten TV-Host und Steuerport aufgelöst; manuelle und XMLTV-Logo-Adressen müssen absolut sein. Nicht unterstützte Protokolle, protokollrelative Adressen, Zugangsdaten, Steuerzeichen, Backslashes und überlange Adressen werden verworfen. Bei HTTPS-Aufruf der Programmübersicht werden HTTP-Bilder aus allen Quellen übersprungen. Dann wird die nächste HTTPS-Adresse, ein mitgeliefertes Logo oder der Sendername verwendet.

Die mitgelieferten SVGs liegen im Adapter und werden sowohl von Admin als auch von der gewählten Web-Instanz ausgeliefert. Für diese Ersatzbilder ist kein externer Logo-Dienst nötig. Bei allen externen Quellen lädt der Browser das Bild direkt von der angegebenen Adresse; der Adapter stellt dafür keinen Bildproxy bereit. Eine lokale TV-Adresse kann bei einem Fernzugriff daher unerreichbar sein. Ein aus dem jeweiligen Browser erreichbares HTTPS-Bild oder ein mitgeliefertes Logo kann in diesem Fall als Ersatz dienen. Bilder werden als `img` eingebunden und erhalten keine Farbfilter.

Der interne Darstellungsvertrag ist rückwärtskompatibel: `channelLogo(service, tvOrigin, { overrideUrl, xmltvIconUrl })` liefert optional `logoUrl`, höchstens zwei weitere externe Adressen in `logoAlternatives` und einen lokalen Pfad in `logoFallback`. Ohne externe Adresse steht der lokale Pfad unmittelbar in `logoUrl`. Doppelte Adressen werden anhand ihrer normalisierten URL entfernt. Die aufrufende EPG-Schicht muss beide Zusatzquellen bereits dem richtigen TV-Dienst zugeordnet haben. Kein Logofeld ist Teil der Sender- oder Aufnahmeidentität.

## Nutzungsstatus und Herkunft

Die unten verlinkten Wikimedia-Commons-Dateiseiten kennzeichnen die jeweilige Grafik als **Public domain / PD-textlogo**: einfache Schrift- oder Formlogos, die nach der dortigen Bewertung die urheberrechtliche Schutzschwelle nicht erreichen. Das ist die Grundlage für die Auswahl dieser einzelnen Grafiken. Eine pauschale Aussage über beliebige Senderlogos oder ganze Logosammlungen wird damit nicht getroffen.

**Markenrechte bleiben bestehen.** Die Grafiken dienen hier zur Kennzeichnung des jeweiligen TV-Senders in der Programmliste. Die urheberrechtliche Einstufung ist keine Markenlizenz und keine Aussage, dass die Sender dieses Projekt unterstützen. Die MIT-Lizenz des Adaptercodes ändert die Rechte an den Senderkennzeichen nicht.

Die SVG-Dateien wurden aus den jeweils angegebenen, auf einen Commit festgelegten öffentlichen GitHub-Spiegeln übernommen. Ihre Nutzungsgrundlage wird durch die einzelne Commons-Dateiseite dokumentiert. Editor-Metadaten und externe DTD-Deklarationen wurden entfernt; ausgeliefert werden statische SVG-Elemente ohne Skripte, externe Ressourcen oder eingebettete Rasterbilder. Die sichtbaren Formen und Farben bleiben erhalten. Das [maschinenlesbare Quellenverzeichnis](../admin/logos/sources.json) enthält zusätzlich Prüfdatum, exakte Downloadquelle und SHA-256 der tatsächlich mitgelieferten Datei.

Die ARTE-Datei enthält die waagerechte Fassung der Wortmarke; die verlinkte Commons-Seite dokumentiert dieselbe Wortmarke in senkrechter Ausrichtung. RTLZWEI verwendet das Zeichen mit offenem Rahmen von 2019, VOX die Fassung mit roter Kugel von 2013. Die Nutzungsangabe für das einzelne VOX-Logo stammt von seiner Commons-Dateiseite und ist keine Aussage über die übrigen Grafiken der als Downloadquelle verwendeten picons-Sammlung.

Diese Prüfung gilt für die unten aufgeführten mitgelieferten Dateien. Für über TV, XMLTV oder manuelle Adressen geladene Bilder gelten die Bedingungen ihrer jeweiligen Quelle; ihre Nutzungsrechte werden durch die URL-Prüfung nicht bestätigt.

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

Die Auswahl umfasst **20 mitgelieferte Logos**. ARTE, RTLZWEI und VOX ergänzen die bisherige Abdeckung; daraus folgt keine Aussage, welche Sender bei einem bestimmten TV fehlten. Für SAT.1 wird in diesem Stand kein lokaler Ersatz mitgeliefert: Eine passende farbige SVG mit ausreichend belegter Quelle wurde bei dieser Ergänzung nicht übernommen. Vorhandene TV-, XMLTV- und manuelle Bildadressen bleiben auch für SAT.1 verfügbar. Neue Ersatzlogos können nach Einzelprüfung ihrer Quelle und Rechte in `admin/logos/` ergänzt und im Quellenverzeichnis registriert werden. Nicht abgedeckte Sender bleiben vollständig bedienbar und zeigen ihren Namen, sofern keine der konfigurierten Quellen ein nutzbares Bild liefert.

## Prüfumfang

Automatisierte Prüfungen sichern die Quellenreihenfolge, begrenzte und deduplizierte Alternativen, lokalen Ersatz, Textfallback, quadratische Geometrie für Desktop und Mobilansicht, HTTPS-Verhalten, sichere Adressen, Namenszuordnung, Dateiquellen, Hashes, wohlgeformtes SVG-XML mit gültiger `viewBox` und statische SVG-Inhalte ab. Testadressen und Varianten für die neue Quellenreihenfolge sind synthetisch und keine aufgezeichneten Antworten eines Fernsehers oder XMLTV-Anbieters. Bei großen Senderlisten werden optionale TV-Bildadressen zuerst verworfen, bevor die bestehende Größenbegrenzung einen Katalog ablehnt. Geänderte Bildadressen gelten nicht als Wechsel der Senderidentität.

Die mitgelieferten Grafiken und automatisierten Tests ersetzen keine Geräteprüfung der optionalen Bildadressen oder einen Aufruf der Programmübersicht über die tatsächliche lokale beziehungsweise Cloud-Verbindung.
