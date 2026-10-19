# Prüfbericht 0.1.25: Fernsehernamen in der Auswahl

Stand: **20. Oktober 2026**, Europe/Berlin. Build: **`0.1.25-tv-names.1`**.

## Auftrag und Ausgangspunkt

Die allgemeine Web-Auswahl `/loewe-tv/` zeigte im bereitgestellten Screenshot zwei Kacheln mit **„Fernseher 0“** und **„Fernseher 1“**. Gewünscht sind die tatsächlichen TV-Namen, die bereits zusammen mit den IP-Adressen in der Netzwerksuche erscheinen.

Ausgangspunkt ist der veröffentlichte [0.1.24-Stand `7a961ea`](https://github.com/SvenM74/ioBroker.loewe-tv/commit/7a961ea1503459ba1a199bbc2fc319a0106b750e). Die Suche liest bereits `friendlyName` aus der Gerätebeschreibung und liefert Name, Modell und IP-Adresse. Bisher lagen die Treffer jedoch ausschließlich im Arbeitsspeicher. Das Admin-Auswahlfeld übernahm nur die IP-Adresse. Die Web-Auswahl verwendete ihrerseits nur `common.name` der ioBroker-Instanz und fiel beim generischen Adapternamen auf „Fernseher N“ zurück.

## Umsetzung

Der neue nur lesbare Zustand **`device.discoveryNames`** speichert die Namen aller Treffer einer ausdrücklich angeforderten Suche. Jeder Eintrag enthält **`host`**, **`port`** und **`name`** in einem gemeinsamen JSON-Snapshot mit `schemaVersion: 1`. Die Zuordnung verwendet ausschließlich die passende IPv4-Adresse und den Steuerport. Höchstens 256 Einträge und 160 Zeichen je Name werden behalten.

Alle Treffer werden bereits vor einer späteren TV-Auswahl gespeichert. Dadurch übersteht auch der Name eines erst anschließend ausgewählten Fernsehers das Speichern der Konfiguration und den Adapterneustart. Leere oder fehlgeschlagene Suchen erhalten bekannte Namen. Ein neuer Treffer für dieselbe Adresse und denselben Port aktualisiert den Namen. Änderungen an der TV-Adresse übernehmen keinen Namen einer unpassenden Adresse. DNS-Hostnamen werden nicht automatisch mit gefundenen IP-Adressen gleichgesetzt.

Jede Web-Erweiterung liest und abonniert genau den Namenszustand ihrer eigenen LOEWE-Instanz. Sie zeigt den passenden gespeicherten TV-Namen an und behält darunter die Instanzkennung. Ohne passenden Treffer verwendet sie weiterhin den bisherigen ioBroker-Instanznamen beziehungsweise die neutrale Beschriftung. Die EPG-Links werden nicht aus Namen gebildet.

Die erste Auswahlseite wartet höchstens 1,5 Sekunden auf die gespeicherten Namen. Direkte Instanzlinks und Dateien warten darauf nicht. Neue Zustandsmeldungen gewinnen gegen verspätete initiale Leseergebnisse. Nach dem Entladen ignoriert eine Erweiterung weitere Ergebnisse. Die gemeinsame Subscription gehört dem Web-Adapter und wird von der Erweiterung nicht eigenmächtig aufgehoben.

Es werden keine automatischen Netzwerksuchen ergänzt. Beim Öffnen der Seite werden keine TV-, Steuer- oder Aufnahmebefehle gesendet. `common.name` und native Einstellungen werden nicht automatisch verändert. Die vorhandenen Web-/Cloud-Routen, Schnellzugriffs-Metadaten, EPG, Fernbedienung, XMLTV-Korrektur und Logo-Zuordnung bleiben erhalten. Admin ab **7.7.28** bleibt ausreichend.

Implementierung: [Namensspeicher](../lib/tv-names.js), [Runtime](../lib/adapter-runtime.js), [Web-Erweiterung](../lib/web-extension.js). Die Readiness- und Zustandsänderungs-Hooks wurden gegen die [offizielle Web-Anleitung](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/WEB-EXTENSIONS-HOWTO.md) und den zugehörigen [Web-Loader](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts) geprüft.

## Prüfung

Finaler lokaler Lauf mit Node.js **24.19.0**: **904 Tests, 904 bestanden, 0 fehlgeschlagen, 0 übersprungen**. Der Ausgangsstand enthielt 888 Tests. `npm run check` bestätigt Paketmetadaten, Übersetzungen, 95 Objektdefinitionen, Protokollverträge und JavaScript-Syntax.

| Prüfbereich | Nachweis |
|---|---|
| Vollständiger Datenweg | Echte `discoverTvs`-Nachricht bei leerer TV-Adresse, persistierter Snapshot, neue Runtime mit gewählter IP und echte Web-Erweiterung. Zwei Kacheln zeigen jeweils den Namen ihres eigenen TVs mit dem richtigen EPG-Link. |
| TV ausgeschaltet | Namen werden aus dem gespeicherten Zustand gelesen. Weder Wiederherstellung noch Seitenaufruf benötigen einen neuen TV-Abruf. |
| Zuordnung | Unterschiedliche IP-Adressen, Ports und Instanzen bleiben getrennt. Unbekannte oder ungültige Identitäten übernehmen keinen fremden Namen. |
| Weitere Suchläufe | Geänderte Namen werden aktualisiert; leere und fehlgeschlagene Suchen erhalten bekannte Namen. |
| Datenbankfehler | Fehler beim optionalen Anlegen, Lesen oder Schreiben des Namensspeichers blockieren weder Adapterstart noch erfolgreiche Suche und Fernbedienung. Die Warnung ist pro Adapterlauf begrenzt. |
| Web-Lebenszyklus | Zustandsänderungen während eines initialen Reads, Zeitlimit, spätes Subscribe, Entladen und Ersetzen einer Erweiterung werden geprüft. Keine Abmeldung gemeinsam genutzter Web-Subscriptions. |
| Darstellung | Sonderzeichen und HTML-Markup erscheinen als Text. Namen verändern keine URLs. |
| Bestandsfunktionen | Die vorhandenen Tests für XMLTV, EPG, Logos, Fernbedienung, Aufnahmeverwaltung und getrennte Web-/Cloud-Zugänge bestehen weiter. |

Im unabhängigen Review wurden die Ersetzungsreihenfolge der Erweiterung und die Ownership gemeinsam genutzter Subscriptions korrigiert. Im abschließenden Stand gibt es keinen verbleibenden blockierenden Befund. Das Paket wird byteweise gegen den geprüften Dateistand verglichen. Der GitHub-Dateibaum muss diesem Stand entsprechen; die CI prüft Node.js 22 und 24.

## Übernahme in vorhandene Installationen

Nach dem Update beide LOEWE-Instanzen und die ausgewählte Web-Instanz starten beziehungsweise neu starten. In jeder LOEWE-Konfiguration unter **Verbindung → Fernseher suchen** einmal bei eingeschalteten TVs suchen. Eine bereits richtige Adresse beibehalten. Anschließend die Auswahlseite neu laden. Die Namen werden beim Suchlauf gespeichert; nur eine tatsächliche Konfigurationsänderung benötigt zusätzlich **Speichern**. [Updateanleitung](INSTALLATION.md#update-auf-0125) · [Namenseinrichtung](NETWORK_DISCOVERY.md#fernsehernamen-in-der-web-auswahl).

Diese einmalige Suche ist für ältere Installationen erforderlich, weil Version 0.1.24 und davor die Namen beim Neustart verworfen haben. Die Prüfung verwendet synthetische Gerätenamen und Netzwerkantworten. Sie belegt die Datenzuordnung und Darstellung, ersetzt aber keinen Test auf der laufenden ioBroker-Installation des Nutzers. Es wurden keine konkreten Namen oder IP-Zuordnungen seiner Fernseher erfunden oder fest im Code eingetragen.
