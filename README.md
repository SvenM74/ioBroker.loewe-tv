# Loewe TV Adapter für ioBroker

## Version 0.1.11

Build **`0.1.11-epg-recording.1`** trennt **EPG-Einstellungen** und **Programmübersicht** in zwei Reiter. Die Übersicht zeigt die gespeicherte TV-Senderliste mit Zeitachse und Sendungsdetails. **Jetzt ansehen** schaltet auf eine zeitlich eindeutig laufende Sendung; zukünftige Sendungen lassen sich nach Bestätigung zur Aufnahme vormerken.

Aufträge werden dauerhaft in **`recordings.jobs`** gespeichert. Ist der TV offline, wartet der Adapter auf seine Erreichbarkeit, ohne ihn aufzuwecken. Bleibt ein Auftrag bis zum Sendungsbeginn ungesendet, wird er **`missed`**. Ein möglicherweise bereits übertragener Auftrag wird nicht automatisch erneut gesendet. **`scheduled`** bedeutet, dass ein passender Timer in der TV-Timerliste nachgewiesen wurde; eine bloße Antwort auf den Aufnahmebefehl reicht dafür nicht aus. Für die neue Aufnahmefunktion fehlt noch eine echte Timerantwort der Nutzergeräte und ein Gerätetest. Bei unbekanntem Antwortformat bleibt der Auftrag **`uncertain`**.

Über **Separat öffnen** ist die Programmübersicht auch außerhalb des Konfigurationsdialogs unter der bestehenden Admin-Adresse erreichbar. Sie verwendet die konfigurierte Admin-Anmeldung und benötigt keinen eigenen Port. [Bedienung, Aufnahmezustände und separate URL](docs/EPG_GUI.md).

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
