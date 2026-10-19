# Prüfbericht 0.1.20

Stand: 19.10.2026. Version **0.1.20**, Build **`0.1.20-web-entry.1`**.

## Gemeldeter Fehler und Ursache

Der Schnellzugriff öffnet die erreichbare Web-Adresse auf Port 8083 mit dem
Pfad **`/loewe-tv/`**. Die Antwort lautet **404, Datei `index.html` nicht
gefunden**. Die Installation enthält zwei LOEWE-TV-Instanzen.

Der unveränderte offizielle Resolver aus **ioBroker.admin 8.0.14**, Commit
`e4b39b810f5f12cd6e969e25a39ff6f3188a6608`, wurde lokal mit zwei TV-Instanzen
und einem ausgewählten Web-Port 8083 ausgeführt. Beide Aufrufe erzeugen denselben
Pfad `/loewe-tv/`. `getWebExtensionLinks()` setzt die Web-Adresse und den
Adapternamen zusammen. `replaceLink()` gibt dieses Ergebnis zurück, bevor der
konfigurierte Dateipfad und `%instance%` ausgewertet werden.
[Offizielle Admin-Quelle](https://github.com/ioBroker/ioBroker.admin/blob/e4b39b810f5f12cd6e969e25a39ff6f3188a6608/src-admin/src/helpers/utils.ts).

Die tatsächlich beim Nutzer installierte Admin-Version ist nicht bekannt.
Nachgewiesen ist die Übereinstimmung des gemeldeten Zielpfads mit dem
reproduzierten Fehler. Die bisherige LOEWE-Web-Erweiterung behandelt diesen
allgemeinen Pfad nicht. Er fällt deshalb an die allgemeine Dateiauslieferung von
Web zurück, die bei einem Verzeichnisaufruf `index.html` ergänzt.
[Offizielle Web-Quelle](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts).

## Änderung

Die vorhandene Web-Erweiterung behandelt zusätzlich `/loewe-tv`, `/loewe-tv/`,
`/loewe-tv/index.html` und `/loewe-tv/epg.html`.

| Situation | Antwort |
| --- | --- |
| Genau eine geladene TV-Erweiterung auf dieser Web-Instanz | Relative Weiterleitung zu deren `/loewe-tv.N/epg.html`. |
| Mehrere geladene TV-Erweiterungen | HTML-Auswahl mit Anzeigenamen und sichtbaren Instanzkennungen. |
| Genau ein gültiger Parameter `instance=N`, TV hier verfügbar | Relative Weiterleitung zur gewählten Instanz. |
| Ungültiger oder mehrfacher Instanzparameter | HTTP 400; keine Auswahl eines anderen TVs. |
| Gültige, hier nicht verfügbare Instanznummer | HTTP 404; keine Weiterleitung zu einem anderen TV. |
| Web-Anmeldung erforderlich, Sitzung nicht angemeldet | HTTP 401 wie bei den bestehenden EPG-Routen. |
| Andere Methode als GET oder HEAD | HTTP 405 mit `Allow: GET, HEAD`. |

Die Registrierung ist an die Express-App der ausgewählten Web-Instanz gebunden.
Sie enthält ausschließlich tatsächlich geladene, aktivierte LOEWE-Erweiterungen.
Der offizielle Web-Loader ruft die Konstruktoren synchron auf und registriert die
allgemeine Dateiauslieferung erst danach. Es sind keine zusätzlichen
Datenbankabfragen erforderlich. Beim Entladen wird nur die eigene Registrierung
entfernt; eine bereits neu geladene Instanz wird durch ein verspätetes Entladen
ihres Vorgängers nicht entfernt.

Die Auswahl verwendet reguläre Links und eine mitgelieferte CSS-Datei. Sie baut
keine Socket-Verbindung auf und sendet keine TV-Befehle. Anzeigenamen werden
begrenzt und für HTML maskiert. Die relativen Ziele übernehmen den vorhandenen
Ursprung und Proxy-Unterpfad. Bestehende Web-/Cloud-Kacheln und die Stringform von
`common.localLinks` bleiben erhalten; es entsteht keine zusätzliche Web-Kachel.

## Automatisierte Prüfung

Ausgeführt mit Node.js **24.19.0**:

- **`npm test`: 824 Tests bestanden**, keine Fehler und keine übersprungenen Tests.
- Darin **23 Tests der Web-Erweiterung**, einschließlich **13 neuer Tests** für
  den allgemeinen Einstieg.
- **`npm run check`: erfolgreich**. Paketmetadaten, Admin-Übersetzungen,
  JavaScript-Syntax, 94 Objektdefinitionen und der vorhandene Protokollvertrag
  sind konsistent.
- **`git diff --check`: erfolgreich**.

Die neuen Tests prüfen die gemeldete URL und alle vier Einstiegspfade,
Ein-TV-Weiterleitung, Mehr-TV-Auswahl, numerische Sortierung, tatsächliche
Auslieferung der installierten CSS-Datei, Weiterleitung zur explizit gewählten
Instanz unabhängig von der Middleware-Reihenfolge, fehlerhafte Parameter,
Anmeldung, HEAD, Methoden, begrenzte Dateiauslieferung, mehrsprachige und maskierte
Namen sowie das Entladen und Ersetzen von Erweiterungen. Getrennte Web-Apps
vermischen ihre TV-Listen nicht. Browser-URL-Auflösung wird für lokale Adressen,
Cloud-Ursprünge und Proxy-Unterpfade geprüft.

## Grenzen und Installation

Dies sind automatisierte Tests der Erweiterung und eine lokale Ausführung des
offiziellen Admin-Resolvers. Ein Test im Browser der Nutzerinstallation, an
ihrem Cloud-Konto oder an den beiden Fernsehern wurde hier nicht durchgeführt.

Der neue Einstieg behebt den gemeldeten fehlenden Pfad auf einem erreichbaren
Web-Server. Er verändert keinen installierten Admin-Code und kann aus einem
bereits verkürzten Link nicht erkennen, welche TV-Kachel angeklickt wurde.
Bei mehreren TVs ist daher eine Auswahl erforderlich. Für den direkten Aufruf
bleiben `/loewe-tv.0/epg.html` und `/loewe-tv.1/epg.html` verfügbar. Eine vom
Browser nicht erreichbare Web-Adresse, etwa `127.0.0.1` auf einem anderen Gerät,
kann diese Änderung nicht korrigieren.

Nach dem Paketupdate **die ausgewählte Web-Instanz neu starten** und den Browser
neu laden. Der Build beider LOEWE-Instanzen muss **`0.1.20-web-entry.1`** anzeigen.
[Updateanleitung](INSTALLATION.md#update-auf-0120) · [Linkanleitung](ADMIN_LINKS.md).

Die bestehenden XMLTV-, Logo-, Fernbedienungs- und Aufnahmefunktionen werden
durch diesen Pfadfix nicht erweitert. Ihre bisherigen Geräteergebnisse und
bekannten Grenzen bleiben in den jeweiligen Anleitungen dokumentiert.
