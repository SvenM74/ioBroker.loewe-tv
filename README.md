# Loewe TV Adapter für ioBroker

## Version 0.1.14

Build **`0.1.14-epg-web.1`** vergrößert die nutzbare Programmfläche und ergänzt Senderlogos sowie den Zugriff über **ioBroker.web**. Die große TV-Kanalfläche entfällt. **Jetzt ansehen / Aufnahme planen** und **EPG aktualisieren** stehen zwischen Stundenauswahl und Sendersuche. Sender, Titel und Zeit bleiben in einer kompakten Auswahlzeile sichtbar; die Beschreibung lässt sich bei Bedarf aufklappen.

Die Senderzeilen verwenden zuerst eine vom TV gelieferte Bildadresse, danach ein mitgeliefertes Logo. Für jedes mitgelieferte Logo sind Quelle und der dort ausgewiesene gemeinfreie Status dokumentiert. Kann kein Bild geladen werden, erscheint der Sendername. Ob die optionalen Bildadressen beim jeweiligen Loewe-Modell gefüllt sind, muss der tatsächliche Senderlistenabruf zeigen. [Logos und Quellen](docs/CHANNEL_LOGOS.md).

Ein Link **Programmübersicht** ist direkt an der Adapterinstanz und im **Admin-Schnellzugriff** erreichbar. Unter **EPG-Einstellungen → Programmübersicht in ioBroker.web** kann zusätzlich eine vorhandene Web-Instanz gewählt werden. Dort erscheint die Übersicht unter `loewe-tv.0/epg.html` und als Schnellzugriff auf der Web-Startseite. Die bestehende Anmeldung und Benutzerrechte gelten weiter. [Zugriff und Bedienung](docs/EPG_GUI.md) · [Update und Installation](docs/INSTALLATION.md#update-auf-0114) · [Prüfbericht](docs/PRUEFBERICHT_0.1.14.md).

**EPG-Einstellungen** und **Programmübersicht** haben seit 0.1.11 eigene Reiter. **Jetzt ansehen** schaltet auf eine zeitlich eindeutig laufende Sendung; zukünftige Sendungen lassen sich nach Bestätigung zur Aufnahme vormerken. Aufträge werden dauerhaft in **`recordings.jobs`** gespeichert. Ist der TV offline, wartet der Adapter auf seine Erreichbarkeit, ohne ihn aufzuwecken. Ein möglicherweise bereits übertragener Auftrag wird nicht automatisch erneut gesendet. **`scheduled`** bedeutet, dass ein passender Timer in der TV-Timerliste nachgewiesen wurde.

Die Statuskorrekturen aus 0.1.12 und 0.1.13 bleiben enthalten: Bei gespeicherter TV-Antwort zeigt die Übersicht **An TV übertragen**, während ein noch offener Timerabgleich separat angezeigt wird. Am **19. Oktober 2026** hat der Nutzer bestätigt, dass beide Aufnahmeaufträge angekommen sind und die erste Aufnahme gestartet wurde. Der Abschluss der Aufnahmen und die originale XML-Timerantwort sind noch nicht dokumentiert. [Geräteergebnisse und Grenzen](docs/COMPATIBILITY.md).

## Getestete Geräte

Die folgenden Ergebnisse stammen aus den Gerätetests des Nutzers. Sie gelten für die genannten Kombinationen aus Modell, Chassis und Software.

| Modell | Chassis | TV-Software | Status |
|---|---|---|---|
| **Loewe bild 7.55** | **SL420** | **V5.4.6.0** | Direkter TV-EPG-Abruf; Fernbedienung, Senderlisten und TV-Auswahl. |
| **Loewe bild 5.32** | **SL310F** | **V5.4.6.0** | Direkter TV-EPG-Abruf; Fernbedienung, Senderlisten und TV-Auswahl. |
| **Loewe Connect 26 SL** | **MB180** | alle | NICHT kompatibel. |

## Voraussetzungen

- Node.js ab **22**.
- ioBroker js-controller ab **6.0.11** und Admin ab **7.7.28**.
- Ein Loewe-Fernseher, der die Tablet-Schnittstelle auf TCP-Port **905** anbietet.
- Eine Netzwerkverbindung vom ioBroker-Rechner zum Fernseher. Zum Einrichten den Fernseher einschalten.
- Für Einschalten aus dem Standby: **Schnellstart am Fernseher aktivieren**, eine passende TV-MAC-Adresse und Unterstützung für Wake-on-LAN im Fernseher und im Netzwerk. Ohne Schnellstart ist das Einschalten per Datenpunkt laut Gerätetest nicht möglich; siehe [Hinweise zum Einschalten](docs/COMPATIBILITY.md#einschalten-aus-dem-standby).

Der laufende Adapter arbeitet lokal. Für die Installation kann ioBroker benötigte Node.js-Abhängigkeiten aus dem Internet nachladen. Das lokale `.tgz`-Paket ist deshalb keine Zusage einer vollständig netzlosen Installation.

Deutsch und Englisch.

[Installation, Update und Datenpunkte](docs/INSTALLATION.md)

Ab Version **0.1.9** kannst du in der Instanz-Konfiguration nach Loewe-TVs im lokalen Netzwerk suchen und eine der gefundenen IP-Adressen auswählen: [Fernseher suchen und auswählen](docs/NETWORK_DISCOVERY.md).

Die Programmvorschau verwendet ausschließlich die bereits vom Fernseher geladenen EPG-Daten. [EPG-Datenpunkte und Abruf](docs/EPG.md) · [Weitere Planung für automatische Aufnahmeregeln](docs/ROADMAP.md).
