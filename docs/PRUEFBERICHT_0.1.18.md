# Prüfbericht 0.1.18

Datum: **19. Oktober 2026**. Paketversion: **0.1.18**. Laufzeitkennung:
**`0.1.18-epg-offline.1`**. Ausgangspunkt ist der veröffentlichte 0.1.17-Stand
[`313044f0`](https://github.com/SvenM74/ioBroker.loewe-tv/commit/313044f06695e5458788fe8621cc6a56a7edd56b).

## Anlass und Ergebnis

Der Nutzer meldet defekte automatische Instanz- und Schnellzugriffslinks,
fehlende Senderlogos und fehlende Programmdaten bei ausgeschaltetem TV. Zugleich
bestätigt er erste kleine Remote-Fernbedienungstests sowie die Übertragung
wartender Aufnahmeaufträge nach dem Einschalten. Die direkte Timerübertragung
im Schnellstart-Standby ist ausdrücklich noch offen.

0.1.18 ergänzt eine selbst konfigurierte XMLTV-Quelle, deren Programme auch bei
TV aus geladen werden können. Die Zuordnung verwendet den gespeicherten
TV-Senderbestand, zeigt automatische Treffer und Vorschläge und bietet manuelle
Korrekturen im Konfigurationsformular. TV- und XMLTV-Daten besitzen getrennte
persistente Caches. Manuelle und zugeordnete XMLTV-Logos ergänzen die bisherigen
Bildquellen; ZDFneo, KiKA und phoenix erhöhen die mitgelieferte Auswahl auf 17.

**Das Adapterupdate repariert keinen installierten Admin-8-Resolver.** Die
Linkanalyse belegt zwei fehlerhafte Umschreibungen in offiziellen Admin-Ständen.
Direkte Admin-Pfade und eigene Schnellzugriffskacheln umgehen diese Umschreibung.
Gezielte Admin-Patchvorschläge mit einer ausführbaren Reproduktion liegen in
[`upstream/`](upstream/); sie sind nicht installiert und nicht bei ioBroker.admin
eingereicht. Die konkrete Admin-Version und fehlerhafte Ziel-URL der
Nutzerinstallation fehlen noch. [Linkanalyse und Anleitung](ADMIN_LINKS.md).

## Automatisierte Prüfung

Die vollständige Prüfung verwendet Node.js **24.19.0** und den regulären
Node-Testläufer mit eigenen Prozessen und lokalen Loopback-Verbindungen.
HTTP-/XMLTV-Inhalte, Fernseher, ioBroker-Datenbank und Uhren sind dort, wo
erforderlich, kontrollierte Testfixtures. Die Tests sind kein Zugriff auf die
beiden realen Fernseher.

| Prüfung | Ergebnis |
| --- | --- |
| `npm test` | **781 von 781 Tests bestanden**, keine fehlgeschlagenen, übersprungenen oder abgebrochenen Tests. |
| `npm run check` | Paketversion, Build, Konfigurationsfelder, deutsche/englische Texte und JavaScript-Syntax gültig. |
| Objektdefinitionen | 94 Definitionen, darunter unverändert 44 Fernbedienungs-Tastenobjekte. |
| Protokollvertrag | 34 exakte XML-Vorlagen für 33 Aktionen sowie die bisherigen belegten Tastencodes geprüft. |
| Admin-Linkreproduktion | Je 96 Zielkombinationen für Admin 7.7.28, Admin 8.0.14 und den festgehaltenen aktuellen Admin-Quellstand geprüft. |
| Paketarchiv | 133 Dateien einschließlich aller neuen XMLTV-Module, Anleitungen und 17 SVG-Logos; Einstieg, Paketversion und Build geprüft. Keine Workspace-Uploads oder installierten Abhängigkeiten im Archiv. |
| `git diff --check` | Keine Whitespacefehler. |

Der vorhandene GitHub-Workflow führt Paketprüfung und Tests für Node.js 22 und 24
auf dem veröffentlichten Commit aus. Sein Status gehört zum jeweiligen Commit;
dieser Bericht behauptet keinen noch nicht ausgeführten CI-Lauf.

### Quellen, Zuordnung und Cache

- XMLTV wird einmal je Abgleichlauf geladen und veröffentlicht, bevor mögliche
  TV-EPG-Abfragen beginnen. Der Modus **Nur XMLTV** benötigt für den EPG-Abruf
  keinen TV-Client. Intervall `0` startet keinen automatischen Erstabruf.
- UTF-8, gzip, explizite Zeiten und Zeitzonen, fehlende Enden, doppelte und
  widersprüchliche Programme, begrenzte Weiterleitungen, Download-/Speicherlimits,
  Abbruch und ungültiges XML sind abgedeckt. DTD-Dateien werden nicht nachgeladen;
  interne Entitätsdeklarationen werden zurückgewiesen.
- Automatische Zuordnung unterscheidet Qualitätsstufen, Regionen, Zahlen und
  zeitversetzte Sender. Mehrdeutige Treffer werden nicht willkürlich ausgewählt.
  Manuelle, fehlende und bewusst deaktivierte Zuordnungen besitzen eigene Fälle.
- Änderungen an Quelle, manueller Entscheidung, TV-Dienst, Namen oder Alias
  machen die alte externe Bindung ungültig. Ein neues Bild oder eine neue
  Programmplatznummer allein ändert nicht das TV-Ziel.
- Erfolgreiche leere Abrufe ersetzen alte Daten. Vorübergehende Fehler dürfen
  noch gültige Caches erhalten. Jede Quelle altert seit ihrem eigenen Abruf;
  frisches XMLTV verlängert nicht die Nutzbarkeit alter TV-Daten.
- Zuordnung und Programmdaten werden zusammen übernommen. Ein fehlerhafter
  neuer Cache darf einen alten Plan nicht mit einem anderen XMLTV-Sender oder
  dessen Logo versehen. Wiederherstellung prüft außerdem die konkrete
  XMLTV-Sender-ID und die aktuelle manuelle Entscheidung.
- Die Vorschau und **Korrektur in die Tabelle übernehmen** verändern weder
  Live-Konfiguration noch Datenbank, laufende Caches oder Aufnahmeaufträge.
  Einträge anderer Sender bleiben erhalten. Auch eine volle Korrekturtabelle
  kann aktualisiert werden, ohne das Limit durch eine neue Zeile zu überschreiten.
- Vorschauantworten nach geänderter TV-Liste, geändertem Sendernamen oder Alias
  werden verworfen. Ein regelmäßiger Quellenabruf überschreibt nicht die
  Optionsliste einer anderen, noch ungespeicherten Vorschauquelle.
- Zwei simulierte TVs mit ähnlichen Sendernamen behalten ihre eigenen
  Zuordnungen und tatsächlichen Umschaltziele. Die Auswahl wird gegen den
  aktuellen Programmcache geprüft; keine XMLTV-ID ersetzt einen TV-Locator.

Die vollständigen Grenzen, Zeitregeln und Konfigurationsschritte stehen in
[EPG_XMLTV.md](EPG_XMLTV.md).

### Oberfläche, Fernbedienung und Logos

Die Admin-Konfiguration ist anhand des offiziellen Konfigurationsvertrags
geprüft: TV-Auswahl, suchbare XMLTV-Eingabe und Übernahme liegen auf
Formularebene. Abhängigkeiten reagieren auf Quelle, TV-Liste und Vorschau.
Die XMLTV-ID bleibt frei eintragbar; direkte Tabellenänderungen sind möglich.
Quellenwechsel setzen die vorübergehende Vorschau zurück und behalten manuelle
Korrekturzeilen. Das normale Speichern aktiviert die Einstellungen.

Guide-Pagination erhält TV-, XMLTV- und gemischte Quellen. Ein Quellenwechsel
während des Blätterns startet die Seitensammlung neu, auch wenn sich die
Katalogrevision in der Testantwort nicht ändert. Herkunftsangaben bleiben bis
zur UI-Normalisierung erhalten. Die bestehenden Fernbedienungs-, Aufnahme-,
Web-Erweiterungs- und Instanztrennungstests laufen in der Gesamtsuite weiter.

Die Bildtests durchlaufen **manuell → TV → XMLTV → mitgeliefertes Logo →
Sendername**, einschließlich Ladefehlern, Deduplizierung, begrenzter Alternativen,
unzulässiger URLs und Überspringen aller HTTP-Bilder auf HTTPS-Seiten. Dateihashes,
statische SVG-Inhalte und einzelne Quellenbelege werden geprüft.
[Quellen und Nutzungsstatus](CHANNEL_LOGOS.md).

Ein bestehender Netzwerksuchetest setzte die gesamte Anzahl zeitlich
aufeinanderfolgender HTTP-Versuche mit deren Gleichzeitigkeit gleich. Die
Regression prüft jetzt die tatsächliche Zusage: ein aktiver Beschreibungsabruf
je Host, faire Startreihenfolge und Erkennung der übrigen TVs. Der Ablauf der
Netzwerksuche wurde dafür nicht geändert.

### Automatische Admin-Links

Die Reproduktion führt die unveränderte offizielle `replaceLink()`-Logik und
den jeweiligen Patch im Arbeitsspeicher aus. Sie umfasst zwei TV-Instanzen,
Loopback-/Wildcard-Web-Bindungen, HTTP/HTTPS, Proxy-Unterpfade und den
Admin-Cloud-Unterpfad. Normale Web- und fremde Dienstlinks dienen als Gegenproben.

| Offizieller Ausgangsstand | Richtige Admin-Ziele vorher | Mit engem Patch |
| --- | --- | --- |
| Admin 7.7.28, `2c53eab8` | 96/96 | 96/96; Gegenprobe ohne betroffenen Zweig |
| Admin 8.0.14, `e4b39b81` | 0/96 | 96/96 |
| Admin-Quellstand `727bb832` | 0/96 | 96/96 |

Die beiden Patchdateien lassen sich auf ihre festgehaltenen offiziellen
Ausgangsquellen anwenden. Daraus folgt weder die Installation eines Fixes noch
die genaue Ursache auf einem Gerät mit unbekannter Admin-Version. Eigene
Schnellzugriffslinks durchlaufen den betroffenen Resolver nach den geprüften
Admin-Quellen nicht.

## Was am Gerät noch zu prüfen ist

| Bereich | Nachweisstand |
| --- | --- |
| Fernbedienung remote | Erste kleine Nutzertests erfolgreich; kein vollständiger Tastentest auf allen Modellen. |
| Wartende Aufträge nach Einschalten | Vom Nutzer bestätigt. |
| Neuer Timer im Schnellstart-Standby | Noch offen; bei ausgeschaltetem Bildschirm prüfen, ob die Steuerschnittstelle erreichbar ist und der Timer ohne Einschalten übertragen wird. |
| Aufnahmeabschluss | Aus dem begonnenen Auftrag und einem Timerstatus nicht ableitbar; noch separat zu bestätigen. |
| XMLTV der Nutzerinstallation | Noch keine tatsächliche Feedadresse oder deren Senderabdeckung geprüft. Die konfigurierte Quelle und beide Zuordnungstabellen am Gerät prüfen. |
| Senderbilder lokal/remote | Neue statische Dateien und Bildlogik geprüft; tatsächliche TV-/Feed-Bildadressen und ihre Erreichbarkeit sind nicht vor Ort geprüft. |
| Instanz-/Schnellzugriffslink | Direkte Pfade, eigene Kacheln und Resolverkorrektur vorbereitet; automatisch erzeugte Links eines installierten Admin bleiben ohne passenden Admin-Fix potenziell fehlerhaft. |

Es gab keinen vollständigen React-/Browserlauf auf einer installierten
Admin-/Web-/Cloud-Umgebung und keinen neuen Hardwaretest durch diesen
Prüflauf. Das Update verändert keine Web-/Cloud-Konfiguration, programmiert
keinen Testtimer und führt keine TV-Einschaltaktion aus. Bestehende
Aufnahmeaufträge und ihr Schutz vor doppelter Übertragung bleiben erhalten.

## Installation

Beide laufenden TV-Instanzen auf demselben ioBroker-Host vor dem Paketupdate
stoppen, das Paket einmal aktualisieren und beide Instanzen wieder starten.
Danach bei beiden **`info.adapterBuild = 0.1.18-epg-offline.1`** prüfen und die
tatsächlich ausgewählte Web-Instanz neu starten. [Updateanleitung](INSTALLATION.md#update-auf-0118).

Für EPG bei TV aus anschließend die Quellenwahl und XMLTV-Adresse konfigurieren,
Zuordnung prüfen, nötige Korrekturen speichern und **EPG aktualisieren** drücken.
Die Standardquelle bleibt **Nur TV**, solange keine andere gültige Quelle
ausdrücklich gewählt ist. [XMLTV einrichten](EPG_XMLTV.md#einrichten).
