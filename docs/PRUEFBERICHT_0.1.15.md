# Prüfbericht 0.1.15: Web-Adapter-Auswahl und Cloud-Zugriff

Stand: **19. Oktober 2026**. Version **0.1.15**, Build **`0.1.15-web-cloud.1`**.

## Ergebnis

Die Instanz-Konfiguration enthält jetzt den eigenen Reiter **Web-Zugriff** mit dem Feld **Web-Adapter für die Programmübersicht**. Das bisher unter den EPG-Einstellungen liegende Auswahlfeld bleibt technisch `native.webInstance`; vorhandene Werte wie `web.0` werden nicht umgeschrieben. Vorhandene deaktivierte Web-Instanzen bleiben in der Liste sichtbar. Für den tatsächlichen Zugriff müssen Web- und TV-Adapter laufen.

Die [Bedienungsanleitung](EPG_GUI.md#über-iobrokercloud-remote-öffnen) beschreibt die Auswahl derselben Web-Instanz in LOEWE-TV und ioBroker.cloud, deren lokale Bereitstellung sowie den instanzbezogenen EPG-Web-Link. Änderungen an Einstellungen anderer Adapter erfolgen nicht automatisch. TV-Protokoll, Aufnahmejournal und Schutz vor doppeltem Versand wurden für dieses Update nicht verändert.

## Automatisierte Prüfungen

Ausgeführt mit **Node.js v24.19.0**:

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **642 Tests bestanden**, 0 fehlgeschlagen, 0 übersprungen. |
| `npm run check` | Metadaten, Build-Kennung, Admin-Felder und Übersetzungen sowie JavaScript-Syntax gültig; 92 Objektdefinitionen in beiden geprüften Konfigurationsvarianten. |
| `git diff --check` | Keine fehlerhaften Leerzeichen oder Konfliktmarker im Änderungsdiff. |

Die Konfigurationstests prüfen die neue Reiterposition, genau ein gespeichertes `webInstance`-Feld, die unveränderte Wertebildung, gültige ältere Einstellungen und beide Übersetzungen. `short` und `long` bleiben ungesetzt: Das offizielle Steuerelement liefert damit `web.N`. Eine leere Auswahl bleibt zulässig und bedeutet Zugriff über Admin.

Die vorhandenen Web- und Bridge-Tests wurden um Cloud-Ursprünge erweitert. Sie prüfen für `iobroker.net` und `iobroker.pro` die relative Link- und Asset-Auflösung, zwei TV-Instanzen, den Root-Pfad `/socket.io`, die richtige Adapter-Zielinstanz und den Verzicht auf kopierte Zugangsdaten. Die Verbindungen werden dabei simuliert; es findet kein Zugriff auf ein Cloud-Konto statt. Die vollständige Suite enthält außerdem die bestehenden Tests zu Authentifizierung, Zeitlimits, verlorenen Antworten und dem Schutz vor automatischer Wiederholung von Aufnahmebefehlen.

## Abgleich mit offiziellen Schnittstellen

| Quelle | Geprüfter Vertrag |
|---|---|
| [JSONConfig 8.1.1](https://github.com/ioBroker/json-config/blob/v8.1.1/src/JsonConfigComponent/ConfigInstanceSelect.tsx), eingebunden in Admin 7.7.28; zusätzlich [JSONConfig 10.1.3](https://github.com/ioBroker/json-config/blob/v10.1.3/src/JsonConfigComponent/ConfigInstanceSelect.tsx) | `type: instance`, Filter `adapter: web`, Standardwertformat `web.N`, leerer Deaktivierungswert und Bedeutung von `onlyEnabled`. |
| [Web 9.1.15, Commit e640200](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts) | Ausgewählte Web-Erweiterung, relative `welcomePage()`-Links, lokale Anmeldung und Auswahl des ausgelieferten Socket-Clients. |
| [Cloud 6.2.11, Commit bd9dc1e](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/main.ts) | Normale EPG-Web-Pfade gehen zur gewählten Web-Instanz; `/adapter/` gehört zum Admin-Zugang. Die lokale Cloud-Verbindung lehnt eigene Web-Anmeldung und HTTPS ab. |
| [Cloud-Socket](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/lib/socketCloud.ts) | Cloud-Befehle verwenden den eigenen Cloud-Kontext und übernehmen nicht automatisch die Rechte einer lokalen Web-Sitzung. |

Die Anleitung grenzt die Cloud-Einrichtung auf eine zusätzliche Web-Instanz auf demselben Host ein: Bindung `127.0.0.1`, HTTP ohne lokale Web-Anmeldung, integriertes Socket.IO, leerer Web-Stammpfad und aktive Erweiterungen. Der bestehende Cloud-Login schützt den Fernzugriff. `pro: false` bleibt erhalten; ältere Web-Startseiten würden `pro: true` auf `iobroker.net` ausblenden. Die bestehende relative EPG-Route braucht für diese Konfiguration keine neue Transportlogik.

## Grenzen und nächster Praxistest

Der produktive ioBroker-Server, das Cloud-Konto und der Fernseher des Nutzers wurden nicht erreicht. Eine vollständige Prüfung von Anmeldung, Startseitenlink, EPG-Anzeige und Bedienaktionen über den tatsächlichen Cloud-Zugang steht deshalb noch aus. Auch die reine WebSocket-Variante des Portals ist nicht praktisch bestätigt. Der Quellcode des Portals selbst gehört nicht zum geprüften Cloud-Adapterrepository.

Nach dem [Update](INSTALLATION.md#update-auf-0115) `info.adapterBuild` prüfen und Admin vollständig neu laden. Dieselbe Web-Instanz in LOEWE-TV und Cloud auswählen, speichern und in Cloud 6.2.11 **Test web** ausführen. Anschließend über den Cloud-Web-Zugang die Kachel **Loewe TV · Programmübersicht** öffnen. Die localhost-Instanz ist nicht direkt vom Browser eines anderen LAN-Geräts erreichbar; lokal dafür den Programmübersichtsreiter oder die direkte Admin-Adresse verwenden.

Frühere Bestätigungen zu TV-EPG und Aufnahmeaufträgen bleiben historische Geräteergebnisse. Dieses Update erweitert deren bestätigten Umfang nicht; siehe [Gerätekompatibilität](COMPATIBILITY.md).
