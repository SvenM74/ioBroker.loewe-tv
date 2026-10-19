# Loewe TV Adapter für ioBroker

## Version 0.1.20

Build **`0.1.20-web-entry.1`** behebt den gemeldeten **404-Fehler „Datei index.html nicht gefunden“** beim Schnellzugriff auf **`/loewe-tv/`**. Die Web-Erweiterung bietet dort einen Einstieg: Bei einem verfügbaren TV öffnet sie dessen Programmübersicht direkt; bei mehreren TVs zeigt sie eine Auswahl mit Namen und Instanznummern. Nach dem Update muss die ausgewählte **Web-Instanz neu gestartet** werden. [Update](docs/INSTALLATION.md#update-auf-0120) · [Linkanleitung](docs/ADMIN_LINKS.md) · [Prüfbericht](docs/PRUEFBERICHT_0.1.20.md).

Die XMLTV-Konfiguration aus 0.1.19 verwendet weiterhin die gespeicherte TV-Senderliste als Zuordnungstabelle, auch bei ausgeschaltetem TV. Ältere manuelle Zuordnungen werden übernommen; Hinweise zu einer fehlenden optionalen Quelle blockieren das Speichern der übrigen Konfiguration nicht. [XMLTV einrichten](docs/EPG_XMLTV.md).

Unter **EPG-Einstellungen** stehen **Nur TV**, **TV mit XMLTV-Ergänzung** und **Nur XMLTV** zur Auswahl. **Quelle laden und Zuordnung prüfen** lädt die XMLTV-Sender zur gespeicherten TV-Liste. Jede Zeile bietet **Automatisch**, **Manuell** oder **Deaktiviert**. Bei **Manuell** erscheint direkt daneben die suchbare Auswahl des XMLTV-Senders; eindeutige Treffer und Vorschläge stehen in der Ergebnisspalte. Qualitätsstufen, regionale Varianten und zeitversetzte Sender werden nicht stillschweigend zusammengelegt. Erst das normale Speichern aktiviert Änderungen. TV-Befehle verwenden weiterhin den registrierten TV-Sender mit seinem tatsächlichen Locator.

**Senderlogos** und die Ersatzanzeige haben eine quadratische Fläche: **48 × 48 Pixel**, auf schmalen Ansichten **44 × 44 Pixel**. Die Grafik bleibt vollständig sichtbar und behält ihre Proportionen. Seit 0.1.19 enthalten sind **ARTE**, **RTLZWEI** und **VOX**; damit werden 20 Logos mit dokumentierter Herkunft ausgeliefert. Weitere Bilder können aus einer manuellen Bildadresse, vom TV oder aus dem zugeordneten XMLTV-Sender stammen. Bei nicht erreichbaren Bildern folgt die nächste Quelle oder der Sendername. [Logos und Quellen](docs/CHANNEL_LOGOS.md).

### Instanzlink und Schnellzugriff

Der inzwischen gemeldete Zielpfad **`/loewe-tv/`** entspricht genau dem im offiziellen **Admin-8.0.14-Resolver** reproduzierten Pfadverlust: Dateiname und TV-Instanznummer werden bei der Umschreibung auf die Web-Adresse entfernt. Die tatsächlich installierte Admin-Version ist weiterhin unbekannt. Version 0.1.20 bedient diesen Pfad auf der ausgewählten Web-Instanz. Weil beide TV-Kacheln dabei dieselbe URL erhalten können, ist bei mehreren TVs eine Auswahl nötig; die ursprüngliche Instanznummer lässt sich aus dieser URL nicht zurückgewinnen.

Für einen direkten Aufruf ohne Auswahl die instanzbezogenen Web-/Cloud-Links **`loewe-tv.0/epg.html`** beziehungsweise **`loewe-tv.1/epg.html`** verwenden. Eigene Schnellzugriffskacheln können diese vollständigen URLs übernehmen. Erzeugt Admin dagegen eine vom Browser nicht erreichbare Adresse wie `127.0.0.1`, bleibt die direkte Admin-Seite der passende Zugang; eine Web-Erweiterung kann nur Anfragen an ihren erreichbaren Server beantworten. Die [Linkanleitung](docs/ADMIN_LINKS.md) beschreibt diese Fälle. In LOEWE-TV und ioBroker.cloud bleibt dieselbe vorhandene Web-Instanz ausgewählt. [Web-/Cloud-Zugang](docs/EPG_GUI.md#über-iobrokercloud-remote-öffnen).

### Fernbedienung und Aufnahmevormerkungen

**Fernbedienung**, **Jetzt ansehen / Aufnahme planen** und **EPG aktualisieren** bleiben in der kompakten Bedienleiste. Die Fernbedienung bedient die Instanz der geöffneten Seite und funktioniert auch ohne geladene Programmdaten. Der Nutzer bestätigt in seinen ersten kleinen Tests ihre Funktion. Ein vollständiger Einzeltest aller Tasten und TV-Modelle liegt noch nicht vor. [Tasten und Bedienung](docs/REMOTE_CONTROL.md).

Der Nutzer bestätigt außerdem, dass bei ausgeschaltetem TV vorgemerkte Aufnahmeaufträge nach dem Einschalten übertragen werden. Die Warteschlange bleibt dauerhaft in **`recordings.jobs`** gespeichert. Sie wartet auf eine erreichbare TV-Steuerschnittstelle, ohne den TV dafür aufzuwecken. Ein möglicherweise bereits übertragener Auftrag wird nicht automatisch erneut gesendet. **Noch offen ist die direkte Übergabe neuer Timer im Schnellstart-Standby.** Das erfordert einen Gerätetest und folgt nicht allein aus der möglichen Erreichbarkeit im Schnellstartmodus. [Geräteergebnisse und Grenzen](docs/COMPATIBILITY.md).

Mit gespeicherter TV-Antwort zeigt die Oberfläche **An TV übertragen**; ein offener Timerabgleich bleibt separat sichtbar. **Im TV geplant** bedeutet, dass ein passender Timer in der TV-Timerliste nachgewiesen wurde. Die bereits bestätigte Übergabe zweier Aufträge und der Start der ersten Aufnahme bleiben dokumentiert; ihr vollständiger Abschluss ist noch nicht nachgewiesen.

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

Die TV-Steuerung arbeitet lokal. Eine konfigurierte externe XMLTV-Quelle und externe Logo-Adressen benötigen ihren jeweiligen Netzwerkzugang. Für die Installation kann ioBroker benötigte Node.js-Abhängigkeiten aus dem Internet nachladen. Das lokale `.tgz`-Paket ist deshalb keine Zusage einer vollständig netzlosen Installation.

Deutsch und Englisch.

[Installation, Update und Datenpunkte](docs/INSTALLATION.md)

Ab Version **0.1.9** kannst du in der Instanz-Konfiguration nach Loewe-TVs im lokalen Netzwerk suchen und eine der gefundenen IP-Adressen auswählen: [Fernseher suchen und auswählen](docs/NETWORK_DISCOVERY.md).

Die Programmvorschau verwendet die bereits geladenen TV- und optionalen XMLTV-Daten. Reines Öffnen und Blättern startet keinen neuen Quellenabruf. [EPG-Datenpunkte und Abruf](docs/EPG.md) · [Weitere Planung für automatische Aufnahmeregeln](docs/ROADMAP.md).
