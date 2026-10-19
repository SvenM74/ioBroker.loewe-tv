# Loewe TV Adapter für ioBroker

## Version 0.1.18

Build **`0.1.18-epg-offline.1`** ergänzt wieder eine konfigurierbare **XMLTV-Quelle**, damit die Programmübersicht auch bei ausgeschaltetem Fernseher einen aktuellen externen Sendeplan laden kann. TV-Daten und externe Daten werden getrennt gespeichert und nach einem Neustart wiederhergestellt. Eine gültige frühere XMLTV-Adresse und frühere Zuordnungen können weiterverwendet werden. Ohne konfigurierte externe Quelle bleibt der direkte TV-Abruf der Standard. [Update](docs/INSTALLATION.md#update-auf-0118) · [XMLTV einrichten](docs/EPG_XMLTV.md) · [Prüfbericht](docs/PRUEFBERICHT_0.1.18.md).

Unter **EPG-Einstellungen** stehen **Nur TV**, **TV mit XMLTV-Ergänzung** und **Nur XMLTV** zur Auswahl. Eindeutige Sendernamen werden automatisch zugeordnet. Qualitätsstufen, regionale Varianten und zeitversetzte Sender werden nicht stillschweigend zusammengelegt. **Quelle laden und Zuordnung prüfen** zeigt die Treffer und Vorschläge anhand der gespeicherten TV-Senderliste. Manuelle Korrekturen sind in der Konfiguration möglich. Die Zuordnung wählt Programmdaten aus; TV-Befehle verwenden weiterhin den registrierten TV-Sender mit seinem tatsächlichen Locator.

**Senderlogos** können aus einer manuellen Bildadresse, vom TV, aus dem eindeutig zugeordneten XMLTV-Sender oder aus den mitgelieferten Bildern stammen. Neu enthalten sind **ZDFneo**, **KiKA** und **phoenix**, außerdem weitere Schreibweisen bestehender Sender. Für alle 17 mitgelieferten Logos sind Quelle und Nutzungsstatus einzeln dokumentiert. Bei nicht erreichbaren Bildern folgt die nächste verfügbare Quelle oder der Sendername. [Logos und Quellen](docs/CHANNEL_LOGOS.md).

### Instanzlink und Schnellzugriff

Der gemeldete Linkfehler lässt sich für bestimmte **Admin-8-Versionen** im offiziellen Resolver reproduzieren: Sie schreiben Admin-Links von Web-Erweiterungen auf die Web-Adresse um; ein älterer Stand verliert zusätzlich die TV-Instanznummer. **Dieses Adapterupdate repariert keinen bereits installierten Admin-Resolver.** Die genaue Admin-Version und fehlerhafte Zieladresse der Nutzerinstallation sind noch unbekannt.

Die [Linkanleitung](docs/ADMIN_LINKS.md) enthält direkte Admin-Pfade für beide TV-Instanzen, einen sofort nutzbaren Umweg über **eigene Schnellzugriffs-Kacheln** sowie gezielte, geprüfte Korrekturvorschläge für den Admin-Code. Die funktionierenden instanzbezogenen Web-/Cloud-Links `loewe-tv.N/epg.html` und die Korrektur gegen doppelte Web-Kacheln aus 0.1.16 bleiben erhalten. In LOEWE-TV und ioBroker.cloud muss weiterhin dieselbe vorhandene Web-Instanz ausgewählt sein. [Web-/Cloud-Zugang](docs/EPG_GUI.md#über-iobrokercloud-remote-öffnen).

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
