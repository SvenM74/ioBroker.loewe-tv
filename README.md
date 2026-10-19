# Loewe TV Adapter für ioBroker

## Version 0.1.17

Build **`0.1.17-remote.1`** ergänzt den Button **Fernbedienung** neben **EPG aktualisieren**. Er öffnet eine Bedienfläche, deren Form und Tastenanordnung an der Loewe-Assist-Fernbedienung orientiert sind: Ziffern, Steuerkreuz und OK, Lautstärke, Programmwechsel, TV-Menüs, Farbtasten, Wiedergabe und Direktaufnahme. **DR+** öffnet das Archiv; **BACK** verwendet den dokumentierten Schritt-zurück-Befehl. Über das Power-Symbol wählst du ausdrücklich **Einschalten** oder **Ausschalten**. [Tasten, Bedienung und Grenzen](docs/REMOTE_CONTROL.md) · [Update](docs/INSTALLATION.md#update-auf-0117) · [Prüfbericht](docs/PRUEFBERICHT_0.1.17.md).

Die Fernbedienung nutzt die bestehende Verbindung der EPG-Seite und bedient deren TV-Instanz, beispielsweise `loewe-tv.0` oder `loewe-tv.1`. Sie funktioniert auch ohne geladene Programmdaten. Eingaben werden begrenzt in Reihenfolge gesendet; nach einem Übertragungsfehler werden wartende Tasten verworfen. Eine TV-Antwort ist kein Nachweis der sichtbaren Ausführung. Die Geräteumschaltung auf fremde STB-/VIDEO-Geräte und nicht belegte Stern-/Quellenbefehle werden nicht als funktionslose Tasten eingeblendet.

Die Korrektur aus **0.1.16** gegen doppelte EPG-Kacheln auf der Web-/Cloud-Startseite bleibt enthalten. Pro TV bleibt der instanzbezogene Link **Loewe TV · Programmübersicht** unter `loewe-tv.N/epg.html` bestehen. Die zusätzlichen generischen Kacheln unter `adapter/loewe-tv/...` werden nicht mehr aus den Admin-Metadaten erzeugt. Die Admin-Verknüpfung verwendet im Schnellzugriff den Adaptertitel **Loewe TV**. [Update und Bereinigung](docs/INSTALLATION.md#doppelte-web-cloud-kacheln-bei-zwei-fernsehern-bereinigen) · [Prüfbericht zu 0.1.16](docs/PRUEFBERICHT_0.1.16.md).

Die Instanz-Konfiguration bietet weiterhin den Reiter **Web-Zugriff** mit dem Feld **Web-Adapter für die Programmübersicht**. Dort wählst du die vorhandene Web-Instanz, beispielsweise `web.0`, die die EPG-Seite darstellen soll. Eine bereits gespeicherte Auswahl bleibt erhalten. Auch deaktivierte Web-Instanzen bleiben sichtbar; für den Zugriff muss die ausgewählte Instanz laufen.

Für den Fernzugriff über **ioBroker.cloud** wählst du in LOEWE-TV und Cloud **dieselbe Web-Instanz**. Die [Cloud-Anleitung](docs/EPG_GUI.md#über-iobrokercloud-remote-öffnen) beschreibt eine zusätzliche, nur über `localhost` erreichbare Web-Instanz und den passenden EPG-Link. Lokal gelten die Anmeldung und Rechte von Admin beziehungsweise Web; remote gilt der bestehende Cloud-Zugang. Der Nutzer hat am **19. Oktober 2026** den erfolgreichen Remote-Aufruf beider konfigurierten TV-Instanzen bestätigt. Bedienaktionen über die Cloud und die bereinigte Startseite nach diesem Update sind damit noch nicht bestätigt.

Die kompakte Programmfläche und die Senderlogos aus 0.1.14 bleiben enthalten. **Jetzt ansehen / Aufnahme planen** und **EPG aktualisieren** stehen zwischen Stundenauswahl und Sendersuche. Sender, Titel und Zeit bleiben in einer kompakten Auswahlzeile sichtbar; die Beschreibung lässt sich bei Bedarf aufklappen.

Die Senderzeilen verwenden zuerst eine vom TV gelieferte Bildadresse, danach ein mitgeliefertes Logo. Für jedes mitgelieferte Logo sind Quelle und der dort ausgewiesene gemeinfreie Status dokumentiert. Kann kein Bild geladen werden, erscheint der Sendername. Ob die optionalen Bildadressen beim jeweiligen Loewe-Modell gefüllt sind, muss der tatsächliche Senderlistenabruf zeigen. [Logos und Quellen](docs/CHANNEL_LOGOS.md).

Die Programmübersicht ist direkt über den Link an der Adapterinstanz und die **Loewe-TV-Kachel im Admin-Schnellzugriff** erreichbar. Auf der ausgewählten Web-Instanz erscheint die Übersicht unter `loewe-tv.0/epg.html` und als Schnellzugriff auf der Web-Startseite. [Zugriff und Bedienung](docs/EPG_GUI.md).

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
