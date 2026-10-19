# Herkunft des externen Senderlogo-Katalogs

Der Katalog in `lib/logo-registry-catalog.json` enthält Dateipfade und Metadaten
aus [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos). Die PNG-Bilder selbst
werden nicht mit dem Adapter ausgeliefert. Die Einträge sind eine Hilfe zur
Auswahl eines Logos und keine Liste verifizierter TV-Sender oder Empfangsdaten.

## Geprüfter Quellenstand

| Eigenschaft | Wert |
|---|---|
| Repository | `tv-logo/tv-logos` |
| Commit | `d32e347bb7c4c640dceec23957802ad9182f58a6` |
| Commit-Datum | 2. Mai 2026 |
| Git-Tree | `9f469ca6f9aacf33b9ba5235ba68f593a1916d49` |
| Prüfung | 19. Oktober 2026, vollständiger rekursiver Git-Tree, nicht gekürzt |
| README-Blob | `c61baff18262e9672cb2a83dd99e7a0a04c34937` |
| Katalogschema | `schemaVersion: 1` |

Die [Quelldateien am festgelegten Commit](https://github.com/tv-logo/tv-logos/tree/d32e347bb7c4c640dceec23957802ad9182f58a6)
und die [zugehörige README](https://github.com/tv-logo/tv-logos/blob/d32e347bb7c4c640dceec23957802ad9182f58a6/README.md)
bleiben damit für diesen Adapterstand nachvollziehbar. Jeder Eintrag enthält
zusätzlich den Git-Blob-Hash und die Größe der ursprünglichen PNG-Datei.

## Umfang und Auswahl

Der Katalog enthält **1.046 Bildvarianten** aus fünf Bereichen. Verschiedene
Auflösungskennzeichnungen, Gestaltungsformen und regionale Sender sind eigene
Einträge; die Zahl ist deshalb keine Anzahl unterschiedlicher Programme.

| Bereich | Länderkennung | Verzeichnis | Einträge |
|---|---|---|---:|
| Deutschland | `de` | `countries/germany/` | 683 |
| Österreich | `at` | `countries/austria/` | 136 |
| Schweiz | `ch` | `countries/switzerland/` | 63 |
| International | `int` | `countries/international/` | 129 |
| Europa | `eu` | `countries/world-europe/` | 35 |

Unterverzeichnisse wie `hd/`, `sky-sport/` und `arena-sport/` sind eingeschlossen.
Verzeichnisse namens `old` und `custom` sind ausgeschlossen, ebenso Mosaike,
Dokumentation und andere Dateiformate. Das Quellrepository enthält insgesamt
10.777 PNGs; andere Länder und die allgemeinen `misc/`-Bilder gehören nicht zum
mitgelieferten Katalog.

Dateinamen werden in lesbare Namen umgewandelt. Die Länderendung entfällt im
Anzeigenamen, bleibt aber im eindeutigen `id`-Pfad und im Feld `country` erhalten.
Der Katalog unterscheidet die beobachteten Gestaltungsmarker:

| Marker im Dateinamen | `variant` | Einträge |
|---|---|---:|
| Kein nachstehender Marker | `standard` | 850 |
| Eigenes Wort `alt` oder `alt2` | `alternate` | 137 |
| Eigenes Wort `hz` | `horizontal` | 47 |
| Eigenes Wort `icon` | `icon` | 12 |

Bei mehreren Markern gilt `horizontal` vor `icon` vor `alternate`. Alle erkannten
Designmarker werden aus dem Anzeigenamen entfernt; der vollständige Pfad bleibt
unverändert. HD, UHD, SD, 4K, Plus, Nummern und Regionen bleiben im Namen stehen.
Auch Black und White bleiben erhalten, da sie beispielsweise bei AXN getrennte
Programme bezeichnen. Andere Wörter werden nicht als Designmarker erraten.

Die Namen folgen den tatsächlichen Dateinamen. Deshalb bleibt beispielsweise
der Quellfehler `servus-tv-deutchland-de.png` im Pfad erhalten. Ein vorhandener
Dateiname beweist nicht, dass ein Sender heute noch sendet oder das Logo noch
aktuell ist. Alte Marken können außerhalb eines `old/`-Verzeichnisses stehen.
Die automatische Zuordnung muss außerdem Länder, Programmnummern und Regionen
berücksichtigen; ein Treffer in diesem Bildverzeichnis ist keine EPG-Zuordnung.

## Laden der Bilder

Die verlinkten Bilder verwenden denselben festgelegten Commit wie der Katalog:

```text
https://raw.githubusercontent.com/tv-logo/tv-logos/<revision>/<id>
```

Beispiel für Das Erste HD:

```text
https://raw.githubusercontent.com/tv-logo/tv-logos/d32e347bb7c4c640dceec23957802ad9182f58a6/countries/germany/hd/das-erste-hd-de.png
```

Der Adapter braucht zur Laufzeit keine GitHub-Verzeichnisabfrage. Auswahl und
Zuordnung arbeiten mit dem lokalen JSON-Katalog. Für ein externes Bild braucht
der Browser Zugriff auf die Bildadresse. Die Erreichbarkeit eines Bildes wird
durch seine Aufnahme in den Katalog nicht garantiert. Der Quellenstand wechselt
erst mit einer gezielten Katalogaktualisierung.

Die Quelle beschreibt PNG-Logos für dunkle Hintergründe und eine Breite von
512 Pixeln. Ein quadratischer Anzeigerahmen mit `object-fit: contain` bewahrt die
Proportionen; die Originaldatei wird nicht verändert.

## Hinweise des Anbieters

Die README beschreibt eine kostenlose persönliche Nutzung sowie direkte
RAW-Verlinkung. Sie verlangt eine Quellenangabe bei Weiterverteilung, untersagt
den Verkauf der Logos und bittet bei der Nutzung in Websites, Services oder Apps
um vorherigen Kontakt. Sie verweist allgemein auf CC BY-SA, CC BY-NC-SA sowie
die Rechte der Markeninhaber. Der geprüfte Stand enthält keine separate
Lizenzdatei und keine verifizierte Lizenzzuordnung je Bild.

Der Katalog stellt daher keine pauschale Lizenzfreigabe dar. Die Logos sind
nicht als allgemein lizenzfrei ausgewiesen und werden nicht unter die
MIT-Lizenz des Adaptercodes gestellt. Maßgeblich bleiben die
[Nutzungshinweise des Anbieters](https://github.com/tv-logo/tv-logos/blob/d32e347bb7c4c640dceec23957802ad9182f58a6/README.md)
und die Rechte am jeweiligen Logo.

## Katalog für eine neue Adapterversion erzeugen

`scripts/build-logo-registry-catalog.js` ist ein Wartungswerkzeug ohne
Netzwerkzugriff. Es erhält eine bereits gespeicherte, vollständige Antwort der
GitHub-Git-Tree-API und den dazugehörigen Commit. Es wird weder beim Start des
Adapters noch beim Öffnen der Logo-Einstellungen ausgeführt.

1. Den gewünschten Commit und dessen Tree im Quellrepository prüfen. Die
   vollständige rekursive Tree-Antwort als lokale JSON-Datei speichern. Die
   Antwort darf nicht `truncated: true` enthalten.
2. Die README dieses Commits und Änderungen an Ländern oder Namenskonventionen
   prüfen. Eine neue Quelle darf nicht automatisch als unverändert lizenziert
   oder inhaltlich aktuell behandelt werden.
3. Den Katalog aus dem gespeicherten Tree erzeugen:

   ```bash
   node scripts/build-logo-registry-catalog.js /pfad/zum/gespeicherten-tree.json d32e347bb7c4c640dceec23957802ad9182f58a6
   ```

4. Änderungen an Pfaden, Namen, Varianten, Umfang und Zuordnung prüfen und die
   Herkunftsangaben in dieser Datei aktualisieren. Die Katalogtests ausführen.

Ein optionales drittes Argument legt eine andere Ausgabedatei fest. Das Werkzeug
akzeptiert auch einen kompakten, gespeicherten Snapshot mit `repository`, `ref`,
`tree` und `files: [{path, sha, size}]`, sofern er aus dem überprüften Git-Tree
stammt. Diese Eingabeform ist kein Ersatz für die Prüfung der vollständigen
Quelle. Das Werkzeug lädt keine Bilder und prüft keine fremden Bildlizenzen.
