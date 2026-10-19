# Prüfbericht 0.1.19

**Stand:** 19. Oktober 2026. **Version:** `0.1.19`. **Build:** `0.1.19-epg-config.1`.

## Auftrag und nachgestellte Fehler

Der Nutzer meldet weiterhin unvollständige Senderlogos und wünscht quadratische Anzeigeflächen. Außerdem bleibt die alternative EPG-Konfiguration ohne auswählbare TV-Sender; die Speicherknöpfe werden wieder rot. Gewünscht sind Zeilen aus der vorhandenen TV-Liste mit einer passenden XMLTV-Auswahl daneben.

Die konkrete Admin-Version, der aktuelle Formularinhalt und die XMLTV-Adresse der Installation liegen für diese Meldung nicht vor. Deshalb wird keiner der folgenden Befunde ungeprüft als alleinige Ursache auf dem Gerät des Nutzers bezeichnet.

| Nachgestellter Befund | Bedeutung |
|---|---|
| Ein Konfigurationsaufruf während der lokalen Katalogwiederherstellung konnte nur eine Platzhalteroption erhalten. Nach Abschluss derselben Wiederherstellung waren die TV-Sender vorhanden. | Die TV-Verbindung und ein frischer XMLTV-Abruf sind dafür nicht erforderlich. Es fehlte die Abstimmung mit der lokalen Wiederherstellung. |
| Admins Tabelle zeigt ein älteres Objekt mit TV-ID→XMLTV-ID ohne passende Migration intern als leere Liste. | Bereits gespeicherte Korrekturen konnten vorhanden und trotzdem unsichtbar sein. |
| Eine aktive, aber leere XMLTV-Adresse meldete einen Fehler mit `validatorNoSaveOnError`. | Eine noch nicht eingerichtete optionale Quelle konnte das Speichern der übrigen Instanz blockieren. |
| Der bisherige Intervallvalidator akzeptierte `900`, aber nicht den Zeichenkettenwert `"900"`. | Dieselbe gültige Einstellung konnte abhängig vom gelieferten Formularwert scheitern. |
| Ein verzögertes `default: []` kann bei tatsächlich fehlender Native-Eigenschaft eine vorher geladene Tabelle wieder überschreiben. | Die automatisch befüllte Tabelle benötigt keinen solchen Admin-Default. |

`sendTo` und `sendto`, die vorhandenen Funktionskörper mit `return` sowie die JSON-Templateauswertung sind in den geprüften Admin-Quellen gültig. Diese Schreibweisen werden nicht als Fehlerursache ausgegeben.

## Änderungen

### Quadratische Senderlogos

Bild und Textersatz verwenden dieselbe feste Fläche: **48 × 48 Pixel**, bis einschließlich 640 Pixel Ansichtsbreite **44 × 44 Pixel**. `object-fit: contain` erhält die Proportionen. Sendernummer, vollständiger Name im Tooltip, Suche und Screenreader-Beschriftung bleiben verfügbar. Lange Ersatznamen können innerhalb der Fläche auf drei sichtbare Zeilen begrenzt sein.

**ARTE, RTLZWEI und VOX** ergänzen den lokalen Bestand auf **20 Logos**. Die Grafiken haben individuelle Herkunfts- und Nutzungsnachweise sowie SHA-256-Prüfsummen im [Quellenverzeichnis](../admin/logos/sources.json). Die SVGs wurden zusätzlich gerendert und visuell kontrolliert. Daraus folgt keine vollständige Abdeckung der nicht vorliegenden TV-Senderlisten des Nutzers. Für SAT.1 wurde in dieser Ergänzung kein ausreichend belegter passender lokaler Ersatz übernommen. TV-, XMLTV- und eigene Logo-Adressen bleiben möglich. [Logoquellen und Grenzen](CHANNEL_LOGOS.md).

### TV-Liste als Zuordnungstabelle

`getEpgMappingRows` wartet höchstens 2,5 Sekunden auf den lokalen Katalog. Die Freigabe erfolgt nach der Übergabe der gültigen Dienste an den EPG-Manager; die weitere Objektmaterialisierung und TV-Netzabfragen müssen dafür nicht fertig sein. Timeout, Fehler und Shutdown liefern eine Diagnose ohne leere Ersatzmatrix. Ein einzelner abgelaufener Aufruf bricht die Wiederherstellung nicht ab.

Die gespeicherte TV-Liste liefert die Zeilen. Jede Zeile bietet **Automatisch**, **Manuell** oder **Deaktiviert**. Eine sichtbare automatische Zeile erzeugt keinen leeren manuellen Override. Bei **Manuell** erscheint die suchbare XMLTV-Auswahl direkt daneben. Die Zuordnung verwendet weiterhin eindeutige Namen und ausdrücklich vorhandene Aliasse; HD-/SD-/UHD-, Regional- und zeitversetzte Varianten werden nicht still zusammengelegt.

Alte Objektzuordnungen und zweispaltige Zeilen werden übernommen. Frühere Korrekturen zu derzeit fehlenden TV-Sendern bleiben erhalten. Bis zu 2.000 aktuelle TV-Sender und 2.000 ältere Korrekturen passen gemeinsam in die Tabelle; höchstens 2.000 wirksame manuelle Entscheidungen werden akzeptiert. Anzeigefelder dürfen keine TV-Ziele oder externen Senderkennungen bestimmen.

Das automatische Öffnen der Tabelle liest ausschließlich lokale Daten. **Quelle laden und Zuordnung prüfen** lädt die ausdrücklich eingetragene Quelle in einen getrennten Vorschaukatalog. Beides verändert weder aktive Konfiguration noch Programmcaches. Normales Speichern aktiviert den Entwurf.

### Formular und Speicherprüfung

Eine fehlende oder ungültige optionale XMLTV-Adresse bleibt sichtbar, sperrt aber das Speichern anderer Einstellungen nicht. Dasselbe gilt für optionale Logo-Adressen. Der Intervallvalidator akzeptiert gültige numerische Zeichenketten; leere Werte, `null`, Booleans, Bruchteile und Werte außerhalb der bestehenden Grenzen bleiben ungültig.

Ladeantworten enthalten zunächst nur einen temporären Umschlag `_epgMappingResponse` mit Anfragebasis, Zeilen und Status. Der dokumentierte Admin-Abhängigkeitsmechanismus vergleicht Quelle, TV-Liste und Zuordnungsentwurf vor der Übernahme. Bei bereits im Formularmodell vorliegenden Änderungen bleibt der aktuelle Entwurf erhalten; der Status fordert zum erneuten lokalen Laden auf. Der Umschlag und Status werden nicht als Native-Einstellungen gespeichert. Der verzögerte Tabellen-Default ist entfernt.

## Bekannte Admin-Grenze bei Eingaben während des Ladens

Admins Tabellenbaustein puffert Zelländerungen etwa **300 ms**. Der Formularvergleich kann diesen noch lokalen Puffer nicht sehen. Ein einzelner gepufferter Edit überlebt die Antwort. Zwei Änderungen über die Antwortgrenze hinweg können jedoch ein anderes Feld verlieren: zuerst Modus und ID ändern, dann trifft die Ladeantwort vor dem Übertrag des Puffers ein, anschließend erneut die ID bearbeiten. Im reproduzierten Fall blieb die neue ID erhalten, der Modus stand wieder auf `auto`.

Diese verbleibende Grenze wird **nicht als behoben ausgegeben**. Ein ausdrücklich benannter `known Admin limitation`-Test dokumentiert sie mit den ursprünglichen Admin-Methoden. Der sichtbare Bedienhinweis lautet: **Während die Senderliste oder XMLTV-Quelle lädt, bitte warten und erst anschließend Zuordnungen bearbeiten.** Vollständig auflösen ließe sich der Fall durch eine Änderung des Admin-Tabellenpuffers oder einen eigenständigen Editor; beides ist nicht Bestandteil dieses Updates.

## Ausgeführte Prüfungen

Der abschließende lokale Lauf verwendet **Node.js 24.19.0** mit dem regulären Testläufer und echten Testunterprozessen:

```text
npm test
811 Tests, 811 bestanden, 0 fehlgeschlagen, 0 übersprungen

npm run check
Paketmetadaten, Admin-Übersetzungen und JavaScript-Syntax gültig
94 statische Objektdefinitionen; 44 Fernbedienungszustände
34 ursprüngliche XML-Vorlagen und 33 Tablet-Aktionen geprüft
```

Die Zahl erfolgreicher Tests umfasst den ausdrücklich dokumentierenden Test der oben genannten Admin-Grenze; sie ist keine Aussage, dass diese Grenze behoben wäre.

| Bereich | Nachweis |
|---|---|
| Echte Admin-Auswertung | 13 fokussierte Tests verwenden ausgewählte Originalmethoden von json-config 8.1.1 für Templates, Validierung, globale Speicherfehler, Tabellenzeilen, Abhängigkeiten, `onLoaded`, `useNative` und die Übernahme von Native-Einstellungen. [Fixture, Lizenz und exakte Quellen](../test/fixtures/admin-json-config/README.md). |
| Startup und tatsächlicher Formularrequest | 10 Tests führen die ausgelieferten `jsonData`-Templates durch `main.js.onMessage`, `AdapterRuntime` und `EpgManager`. Unter anderem TV offline, EPG an/aus, leere Quelle, Wiederherstellung, Fehler, Altzuordnungen und zwei Instanzen. In diesen lokalen Leseprüfungen bleiben externe Aufrufe bei null. |
| Matrix und Quellen | Migration, Auto/Manuell/Deaktiviert, abwesende Dienste, Grenzen, ungültige Felder, konservative Varianten, Quellenwechsel, unveränderliche Anfragebasis und fehlgeschlagene Downloads. |
| Instanztrennung | Identische relative TV-IDs in zwei Instanzen behalten getrennte gespeicherte Locators und Konfigurationen. Bearbeitete Tabellenbeschriftungen ändern keine Befehlsziele. |
| Logos | Quadratgrößen für Desktop/Mobilansicht, Bild- und Textersatz, HTTPS-Verhalten, Quellenreihenfolge, neue Aliase, Abgrenzung benachbarter Sender, statisches SVG-XML und Datei-Hashes. |
| Bestehender Adapter | Gesamtsuite zu TV-Protokoll, Senderkatalog, EPG, Fernbedienung, Aufnahmejournal, Web-Erweiterung und Admin-Anbindung. |

Die Admin-Fixture stammt aus dem festgelegten Commit `fd30206954a5c29c6093340b02aaae0993bbf11c`; Admin 7.7.28 deklariert json-config `^8.1.1`. Die betreffenden Methoden von json-config 10.1.3 wurden zusätzlich im Quellcode geprüft. Die Tests binden kontrollierte Timer, React-Zustandsfunktionen und Socketantworten ein. Sie sind keine vollständige Browserprüfung.

## Grenzen und Installation

Es besteht kein direkter Zugang zu den beiden Fernsehern, zur ioBroker-Datenbank oder zur konkreten XMLTV-Adresse des Nutzers. Quelle, Senderabdeckung und Darstellung müssen nach Installation auf der tatsächlichen Umgebung kontrolliert werden. Ein fehlendes Senderlogo ist durch die zusätzliche lokale Auswahl nicht für jeden möglichen Sender behoben.

Die bekannten Admin-8-Linkprobleme, direkte Timerübertragung im Schnellstart-Standby und der vollständige Aufnahmeabschluss bleiben bei ihrem dokumentierten Nachweisstand. Dieses Update macht dazu keine neue Geräte- oder Browserzusage.

Nach dem [Update](INSTALLATION.md#update-auf-0119) muss `info.adapterBuild` bei beiden TV-Instanzen **`0.1.19-epg-config.1`** anzeigen. Admin und EPG-Seite vollständig neu laden; bei Web-/Cloud-Nutzung die ausgewählte Web-Instanz neu starten. Danach die TV-Zeilen kontrollieren, die XMLTV-Quelle laden, das Laden abwarten, gewünschte Korrekturen auswählen und normal speichern. [Einrichtung der Senderzuordnung](EPG_XMLTV.md#einrichten).
