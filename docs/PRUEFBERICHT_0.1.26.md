# Prüfbericht 0.1.26: TV-Namen automatisch übernehmen

Stand: **20. Oktober 2026**, Europe/Berlin. Build: **`0.1.26-tv-names.1`**.

## Fehler und Ursache

Der Nutzer meldet, dass **0.1.25** weiterhin **„Fernseher 0“** und **„Fernseher 1“** auf der allgemeinen Auswahlseite zeigt. Ausgangspunkt ist der veröffentlichte [0.1.25-Stand `0d335c8`](https://github.com/SvenM74/ioBroker.loewe-tv/commit/0d335c8629ab5ae8835396608dc0730a1cff7b2f).

Die Ursache wurde mit der echten Adapter-Runtime nachgestellt: Der TV antwortet beim normalen Start erfolgreich auf `GetDeviceData`, aber `device.discoveryNames` bleibt leer. 0.1.25 befüllte diesen Zustand ausschließlich nach einer ausdrücklich gestarteten Netzwerksuche. Die bisherigen Tests führten diese Suche aus und deckten den normalen Updateablauf ohne Suche daher nicht ab. Die Web-Auswahl fiel anschließend auf die neutrale Beschriftung zurück.

Ein zweiter reproduzierter Fall betraf den Web-Adapter: Wenn dessen einmaliges initiales Lesen fehlschlug oder ein späteres Zustandsereignis ausblieb, lud ein weiterer Seitenaufruf den inzwischen vorhandenen Namen nicht erneut aus der Datenbank.

## Übernahme aus den vorhandenen TV-Abfragen

Die [offizielle Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) dokumentiert auf **Seite 22** `NetworkHostName` und `StreamingServerName` in `GetDeviceDataResponse`. Auf **Seite 63** ist `NetworkHostName` ebenfalls in `GetSettingsResponse` beschrieben. Der Name kann Leerzeichen enthalten; ältere Chassis können Felder weglassen oder leer zurückgeben.

0.1.26 übernimmt diese Felder aus den bereits vorhandenen vollständigen Statusabfragen. Der Netzwerkname hat Vorrang vor einem Streamingnamen. Ein bereits bei der Netzwerksuche erkannter `friendlyName` behält seine höhere Priorität; ein neuer Suchlauf kann ihn aktualisieren. Gleichrangige automatisch gelesene Namen können durch spätere vollständige Statusabfragen aktualisiert werden.

Host und Steuerport werden einmal am Anfang des gesamten Statusabrufs festgehalten. Beide Metadatenantworten gehören zu diesem Ziel. Ändert sich die Konfiguration währenddessen oder wird der Adapter entladen, wird die Antwort nicht einer neuen Adresse zugeordnet. Alte `device.data`- oder `device.settings`-Inhalte besitzen keine gespeicherte Zielbindung und werden deshalb nicht als Namensnachweis für die heutige Adresse migriert. Das Feld `DeviceName` aus dem Zugriffsantrag bezeichnet den Client und wird nicht als TV-Name verwendet.

Der bestehende Zustand **`device.discoveryNames`** bleibt erhalten. Alte Einträge mit `host`, `port` und `name` bleiben lesbar. Automatische Einträge besitzen zusätzlich `source: "network"` oder `source: "streaming"`. Exakte konfigurierte DNS-Namen und IPv6-Adressen sind zusätzlich zu IPv4 zulässig; DNS-Auflösung oder eine Zusammenführung mit einer vermeintlich passenden IP-Adresse findet nicht statt. Der Speicher bleibt auf höchstens 256 Einträge, 160 Zeichen je Name und 192 KiB begrenzt. Auch sehr lange Adressen mit mehrbyteigen Namen müssen nach dem Speichern vollständig wieder einlesbar sein.

Bei aktiviertem Statusabruf erfolgt die erste Geräteabfrage bereits beim Start und nach einem erneuten Verbindungsaufbau. Wenn weiterhin kein Name bekannt ist, sind innerhalb derselben Verbindung höchstens zwei weitere Versuche bei regulären Statusabfragen mit mindestens 60 Sekunden Abstand möglich. Ein eigener Timer oder automatischer SSDP-Suchlauf wird nicht ergänzt. `pollInterval = 0` bleibt passiv; **`control.refresh`** liest die Angaben wie bisher sofort. Leere Felder erhalten vorhandene Namen. Fehler beim optionalen Namensspeichern brechen die TV-Steuerung nicht ab.

## Auswahlseite nach fehlenden Ereignissen aktualisieren

Die Web-Erweiterung liest bei späteren GET-Aufrufen der allgemeinen Auswahl die eigenen gespeicherten Namen erneut, höchstens einmal je fünf Sekunden und Instanz. Gleichzeitige Seitenaufrufe teilen einen Leseversuch. Jeder Versuch wartet höchstens 1,5 Sekunden. Eine hängende Subscription blockiert das Lesen nicht; ein fehlgeschlagener oder zeitlich abgelaufener Versuch verhindert keinen späteren neuen Versuch.

Sequenz und Revisionsprüfung schützen gegen veraltete Antworten. Aktuelle Zustandsereignisse gewinnen gegen zuvor begonnene Reads, entladene Erweiterungen übernehmen keine Namen mehr. Pro Seitenaufruf wird höchstens ein Durchlauf abgewartet, auch nach einer langen Unterbrechung der Timerverarbeitung. Direkte EPG-Links, eindeutige Weiterleitungen und Dateien warten nicht auf diese zusätzliche Namensprüfung. Der Browseraufruf erzeugt keine TV-Anfrage.

## Verifikation

Finaler lokaler Lauf: **924 Tests, 924 bestanden, 0 fehlgeschlagen, 0 übersprungen**. `npm run check` prüft Paketmetadaten, Übersetzungen, 95 Objektdefinitionen, Protokollverträge und JavaScript-Syntax. Das npm-Paket wird byteweise mit dem geprüften Dateistand verglichen; der veröffentlichte GitHub-Dateibaum muss diesem Stand entsprechen. Die GitHub-CI prüft Node.js 22 und 24.

| Prüfbereich | Nachweis |
|---|---|
| Normaler Updateablauf | Zwei vorhandene Instanzen starten ohne neue Netzwerksuche. Dokumentierte Felder aus tatsächlichen XML-Parserantworten füllen getrennte, zielgebundene Namen. |
| Namensquellen | Geräte-Netzwerkname, Settings-Netzwerkname, Streaming-Ersatz, Text und `#text`, fehlende und fehlerhafte Werte sowie Vorrang eines vorhandenen Suchnamens. |
| TV ausgeschaltet | Erfolgreich gespeicherte Namen überstehen einen Neustart ohne erreichbaren TV; ungebundene alte Rohantworten werden nicht übernommen. |
| Exakte Zuordnung | IPv4, konfigurierte DNS-Namen, IPv6 und verschiedene Ports bleiben getrennt. Änderungen während der Geräteantwort verhindern auch die Übernahme des anschließend vom alten Client gelesenen Settings-Namens. |
| Später Name | Kein erneuter Metadatenabruf vor 60 Sekunden, maximal drei automatische Abfragepaare pro Verbindung, Ende der Wiederholungen nach einem erkannten Namen. Ausgeschaltetes Polling bleibt passiv. |
| Datenbankfehler | Ein optionaler Namensspeicherfehler beendet weder die normale Statusabfrage noch eine anschließend erfolgreiche Fernbedienung. |
| Web-Wiederherstellung | Fehlgeschlagener Startabruf, fehlgeschlagene oder hängende Subscription, verlorenes Zustandsereignis und hängende alte Reads erholen sich bei späteren Auswahlaufrufen. |
| Gleichzeitige Aufrufe | Zwölf parallele Auswahlaufrufe teilen einen Abruf je TV; aktuelle Ereignisse, Entladen und stark verzögerte Timer bleiben korrekt. |
| Grenzen und Darstellung | Lange DNS-Adressen mit mehrbyteigen Namen bleiben innerhalb der Speichergrenze wieder einlesbar. Namen werden als Text dargestellt und erzeugen keine URLs. |
| Bestehende Funktionen | Die Tests für EPG, XMLTV, Senderlogos, Fernbedienung, Aufnahmeverwaltung und getrennte Web-/Cloud-Routen bestehen weiter. |

Im unabhängigen Review wurden die tatsächliche Bytegrenze bei langen Namen und die gemeinsame Endpunktbindung beider Metadatenantworten nachgebessert. Im finalen Review gibt es keinen verbleibenden blockierenden Befund. Namensdaten verändern weder `common.name` noch native Einstellungen, TV-Locators oder Aufnahmezuordnungen. Die Admin-Mindestversion bleibt **7.7.28**.

## Update und verbleibende Voraussetzung

Das Paket auf **0.1.26** aktualisieren, beide LOEWE-Instanzen neu starten und danach die **tatsächlich ausgewählte Web-Instanz neu starten**. Der Web-Neustart ist erforderlich, damit die Erweiterung den neuen Code und das ergänzte Namensformat lädt. Ein Browser-Reload allein aktualisiert keinen noch laufenden Web-Prozess.

Die Fernseher müssen einmal erreichbar sein und einen Namen liefern. Bei aktiviertem Statusabruf geschieht die Übernahme automatisch. Bei bewusst ausgeschaltetem Statusabruf den Taster `control.refresh` je TV verwenden. Anschließend die Auswahlseite neu laden. Eine erneute manuelle Netzwerksuche ist für die automatische Übernahme nicht nötig. [Updateanleitung](INSTALLATION.md#update-auf-0126) · [Details und Namenspriorität](NETWORK_DISCOVERY.md#fernsehernamen-in-der-web-auswahl).

Die Prüfung verwendet synthetische Geräteantworten entsprechend dem dokumentierten Vertrag. Sie belegt die Korrektur des nachgestellten Datenwegs, ersetzt aber keinen Test auf den beiden realen Fernsehern des Nutzers. Es wurde nicht auf seinen privaten ioBroker-Rechner zugegriffen und kein TV-Name oder IP-Ziel erfunden.
