# Prüfbericht 0.1.23: Senderlogo-Verzeichnis

Stand: **19. Oktober 2026**. Build: **`0.1.23-logo-registry.1`**.

## Auftrag und Ausgangsstand

Das vorhandene Register „Senderlogos“ enthielt bisher manuelle Bildadressen. Gewünscht ist eine aus der TV-Liste vorbereitete Zuordnung zu [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos), ähnlich der vorhandenen XMLTV-Zuordnung. Als Quelle sollen Fernseher, Verzeichnis oder beide auswählbar sein.

Die Änderung baut auf dem veröffentlichten [0.1.22-Stand `e0b995e`](https://github.com/SvenM74/ioBroker.loewe-tv/commit/e0b995ee7a6774dcf8d853b71eea6e46358f1d33) auf. Die Mindestversion **Admin 7.7.28** bleibt erhalten. Es gibt keine Änderung an Web-/Cloud-Routen, der EPG-Brücke, Fernbedienungstasten oder dem Recording-Protokoll.

## Umsetzung

- Das Register „Senderlogos“ steht direkt hinter den EPG-Einstellungen und lädt die gespeicherte TV-Liste der eigenen Instanz. Der Fernseher muss dafür nicht erreichbar und EPG nicht aktiviert sein.
- Globale Quellenwahl: `auto` für TV und Verzeichnis, `tv` nur für TV, `registry` nur für Verzeichnis. Vorhandene eigene Bildadressen haben in allen Modi Vorrang.
- Länderpräferenz: Deutschland, Österreich, Schweiz oder alle Länder. Bei gleichwertigen Länderfassungen entscheidet die Präferenz; verbleibende Mehrdeutigkeit wird angezeigt.
- Pro TV-Sender: automatische Zuordnung, manueller exakter Katalogpfad oder „Kein Verzeichnislogo“. Der letzte Modus deaktiviert nur die Verzeichniszuordnung dieses Senders.
- Der lokale Katalog enthält **1.046 Bildvarianten** aus DE, AT, CH, International und Europa. Alle Pfade sind am Quellencommit `d32e347bb7c4c640dceec23957802ad9182f58a6` geprüft. PNG-Dateien werden nicht mitgeliefert und zur Laufzeit nicht serverseitig heruntergeladen.
- Beim Anzeigen lädt der Browser das passende Bild direkt per HTTPS. Im Modus „Beides“ folgt auf TV und Verzeichnis der bisherige XMLTV-/SVG-Ersatz. Die Fläche bleibt 48 × 48 beziehungsweise 44 × 44 Pixel groß.
- Die Logo-Einstellungen sind ausschließlich Darstellung. TV-Dienstkennungen, Umschaltziele, EPG-Cache-Schlüssel und Aufnahmezuordnungen werden nicht daraus gebildet.

Die [Bedienungsanleitung](CHANNEL_LOGOS.md) und die [Herkunftsdokumentation](logo-registry-source.md) erläutern Auswahlregeln, Quellenumfang, externe Bildzugriffe und die Bedingungen des Verzeichnisses. Es wird keine allgemeine Lizenzfreiheit der Sammlung behauptet.

## Automatisierte Prüfung

Der finale lokale Lauf mit Node.js **24.19.0** umfasst **874 Tests: 874 bestanden, 0 fehlgeschlagen, 0 übersprungen**. Der 0.1.22-Ausgangsstand enthielt 832 Tests. `npm run check` bestätigt Paketmetadaten, Admin-Feldschema, deutsche und englische Übersetzungen, Objektdefinitionen, Protokollverträge und JavaScript-Syntax.

| Prüfbereich | Aussage des Tests |
|---|---|
| Echter Admin-Formularvertrag | Die neue Tabelle wird mit den veröffentlichten JSONConfig-Klassen der unterstützten Admin-Basis geprüft. Zeilen laden ohne konkurrierenden Tabellenstandard; Änderungen und Fehler werden nicht durch verspätete Antworten überschrieben. |
| Vollständiger Nachrichtenweg | Die tatsächlich ausgelieferte `jsonData`-Vorlage wird durch `main.js`, `AdapterRuntime`, lokale Katalogwiederherstellung und Logo-Konfiguration geschickt. |
| TV aus, EPG aus | Gespeicherte Sender und automatische Treffer erscheinen ohne TV-, XMLTV- oder GitHub-Netzwerkaufruf. Ein während des Starts geöffneter Reiter wartet auf die lokale Senderliste. |
| Zwei Instanzen | Dieselbe relative TV-Kennung kann pro Runtime ein anderes manuelles Logo besitzen. Entwürfe bleiben lokal, bestehende TV-Ziele und EPG-Versionen unverändert. |
| Namen und Varianten | Exakte Qualität, bekannte Markenaliase, regionale Namen, Länderpräferenz, Standarddesigns und manuell auswählbare Alternativen werden am echten Katalog geprüft. |
| Keine falsche Zusammenlegung | Qualitätswechsel, unbekannte Regionen, Plus-Zeichen, Nummern, Submarken, Sprachangaben sowie AXN Black/White ergeben keine unzulässige automatische Ersetzung. |
| Suchfeld | `SAT.1` und `ZDFHD` finden die normalisierten Namen. Aktuelle und fehlende frühere Pfade bleiben auch bei ungültigem Suchtext auswählbar. |
| Quellenfolge | Manuelle URL → TV → Verzeichnis → XMLTV → lokales SVG → Name, begrenzt auf erlaubte Quellen und ohne doppelte Versuche. Strikte Einzelquellen nutzen keine ausgeschlossene automatische Quelle. |
| HTTPS und Bildfehler | Unverschlüsselte TV-Bilder werden auf HTTPS-Seiten übersprungen. Bis zu drei weitere externe Adressen und der lokale Ersatz werden in Reihenfolge versucht; danach bleibt der Sendername. |
| Fehlerhafte optionale Konfiguration | Ungültige JSON-Werte verursachen keinen Startabbruch. Doppelte Korrekturen deaktivieren nur den betroffenen Verzeichnistreffer. Nicht vorhandene Pfade erzeugen keine Bildadresse. |
| Größenlimit | Eine Zusammenführung oberhalb von 4.000 Zeilen liefert einen Fehler ohne ersetzende Tabelle, statt eine später nicht mehr lesbare Konfiguration zu erzeugen. |
| Bestandsfunktionen | Bestehende Prüfungen für EPG, XMLTV, Fernbedienung, Recording, direkte/generische Links und Web-/Cloud-Instanztrennung bestehen weiter. |

Im unabhängigen Review wurden eine fehlende String-Typprüfung in optionalen Logo-Zeilen und eine inkonsistente Obergrenze beim Zusammenführen alter Korrekturen gefunden, behoben und durch Regressionstests gesichert. Zusätzlich wurden 512 Kombinationen defekter JSON-Eingaben ohne Start- oder EPG-Ausnahme durchlaufen. Die Vorbereitung von 2.000 nicht zuordenbaren Sendern benötigte im lokalen Prüflauf etwa 280 ms; dieser Einzelwert ist keine Laufzeitgarantie für ein reales ioBroker-System.

## Paket und Quellen

Die Paketprüfung stellt sicher, dass Katalog, Matcher, Konfiguration, Admin-Dateien und Dokumentation ausgeliefert werden. Der Offline-Generator erzeugt aus dem vollständigen Git-Tree deterministisch dieselbe Katalogdatei. Alle 1.046 Pfade, Git-Blob-Hashes und Größen wurden gegen den Quellenstand abgeglichen. Gekürzte Trees, doppelte Pfade und fehlerhafte Metadaten werden vom Generator verworfen.

## Grenzen der Prüfung

Die Instanz- und Transportdaten in den automatisierten Prüfungen sind synthetisch. Es wurde kein echter Fernseher und keine laufende ioBroker-Installation des Nutzers erreicht. Daher sind weder die konkrete Trefferquote seiner TV-Listen noch die Erreichbarkeit jeder PNG-Adresse im Browser und über Cloud als Gerätetest bestätigt. Der im Katalog festgehaltene Dateibestand beweist keine aktuellen Senderechte, Sendetätigkeit oder Markenstände.

Die originale Admin-Tabelle puffert Zelländerungen ungefähr 300 ms. Der geprüfte Formularschutz verhindert die bekannten Fälle verspäteter Antworten auf bereits übernommene Änderungen und erhält einen einzelnen noch gepufferten Tabellenedit. Er ersetzt keine vollständige Sperre gegen jede Kombination mehrerer schneller Änderungen innerhalb dieses Puffers. Der Reiter bittet deshalb, das Laden zunächst abzuwarten und anschließend zu bearbeiten.

Der bekannte Linkaufbau älterer Admin-8-Versionen bleibt außerhalb dieser Logo-Änderung; er kann weiterhin zum allgemeinen TV-Auswahlmenü führen. Die vollständigen direkten Instanzpfade stehen in der [Linkanleitung](ADMIN_LINKS.md). Die bereits erreichte Mindestversion und die allgemeine Web-Route werden dafür nicht erneut verändert.
