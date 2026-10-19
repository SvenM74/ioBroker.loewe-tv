# Prüfbericht 0.1.16: Doppelte EPG-Kacheln

Stand: **19. Oktober 2026**. Version **0.1.16**, Build **`0.1.16-web-links.1`**.

## Gemeldetes Verhalten

Der Nutzer hat zwei TV-Instanzen eingerichtet und bestätigt, dass beide über Cloud beziehungsweise remote geöffnet werden können. Der beigefügte Screenshot zeigt neben den zwei funktionierenden Links `loewe-tv.0/epg.html` und `loewe-tv.1/epg.html` zwei zusätzliche **Programmübersicht**-Kacheln mit dem Pfad `adapter/loewe-tv/...`. Eine konkrete Web-Version sowie Bedienaktionen über Cloud sind in dieser Rückmeldung nicht genannt.

Die beiden zusätzlichen Kacheln entstehen aus einer zweiten Linkregistrierung für dieselben TV-Instanzen. In 0.1.14/0.1.15 wurde der Admin-Link als Objekt in `common.localLinks._default` hinterlegt. Ältere Web-Versionen importieren solche Objektwerte zusätzlich zu den Einträgen, die unsere Web-Erweiterung über `welcomePage()` liefert. Die beiden Pfadtypen sind verschieden; eine Bereinigung nach identischen URLs entfernt sie deshalb nicht. Belege: [Web 9.0.0: Import von Linkobjekten](https://github.com/ioBroker/ioBroker.web/blob/v9.0.0/src/main.ts#L823-L850) und [Cloud 6.2.11: Startseitenverarbeitung](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/main.ts).

## Korrektur

`common.localLinks` verwendet jetzt die ebenfalls unterstützte URL-Textform:

```json
{
  "_default": "adapter/loewe-tv/epg.html?instance=%instance%"
}
```

Admin 7.7.28 und der geprüfte aktuelle Admin-Stand unterstützen diese Form für den Instanzlink und den Schnellzugriff. Instanzplatzhalter und relativer Pfad bleiben erhalten. Der Schnellzugriff verwendet den Adaptertitel **Loewe TV**. Der Web-Import übernimmt nur Objektwerte und erzeugt aus diesem String keine zweite Kachel. Die funktionierenden `welcomePage()`-Einträge, ihre Icons und instanzbezogenen Routen werden nicht verändert. Belege: [Admin-Instanzlinks](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Instances.tsx#L431-L486) und [Admin-Schnellzugriff](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Intro.tsx#L920-L980).

Die Metadatenübernahme im **js-controller 7.2.5** ersetzt `common.localLinks` bestehender Instanzen ausdrücklich vollständig. Die alte Objektform bleibt damit nicht durch ein Zusammenführen erhalten. Native-Einstellungen wie die gewählte `webInstance` werden bewahrt. Eine zusätzliche Migration in der TV-Laufzeit ist nicht nötig. Bei mehreren Hosts muss das Paket auf den jeweiligen Adapter-Hosts aktualisiert werden. [Offizieller Upload-/Updatecode](https://github.com/ioBroker/ioBroker.js-controller/blob/e4c842b9056eb5b0b18bb56e70611821ecb3cc80/packages/cli/src/lib/setup/setupUpload.ts).

TV-Protokoll, Auftragsjournal und bestehende Schutzmaßnahmen gegen doppelten Aufnahmeversand wurden für diese Korrektur nicht geändert.

## Automatisierte Prüfung

Ausgeführt mit **Node.js v24.19.0**:

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **643 Tests bestanden**, 0 fehlgeschlagen, 0 übersprungen. |
| `npm run check` | Paket-/Build-Metadaten, Admin-Übersetzungen und JavaScript-Syntax gültig; 92 Objektdefinitionen in beiden geprüften Varianten. |

Der neue Regressionstest modelliert den offiziell dokumentierten älteren Web-Import für zwei TV-Instanzen. Als positive Fehlerkontrolle erzeugt die bisherige Objektform vier Links, darunter die zwei unerwünschten Admin-Pfade. Mit der neuen String-Form bleiben genau die beiden Extension-Links übrig. Der Test prüft anschließend deren tatsächliche lokale Auslieferung durch die jeweilige Erweiterung und dass die andere TV-Instanz die Route nicht übernimmt.

Der bestehende Admin-Test prüft weiterhin die Instanzen 0, 3 und 12, die Ersetzung von `%instance%` und den Erhalt eines Admin-Proxy-Präfixes. Die Quellen zur String-Unterstützung sind direkt im Test referenziert. Die vollständige Suite umfasst außerdem die bestehenden TV-, Aufnahme-, Web- und Bridge-Prüfungen.

## Übernahme und verbleibende Kontrolle

Die [Updateanleitung für zwei Fernseher](INSTALLATION.md#doppelte-web-cloud-kacheln-bei-zwei-fernsehern-bereinigen) enthält die Schritte. Nach dem regulären URL-Update muss bei beiden TV-Instanzen `info.adapterBuild = 0.1.16-web-links.1` stehen. Danach die ausgewählte Web-Instanz neu starten und die Cloud-Web-Startseite erneut öffnen. Erwartet werden die zwei funktionierenden LOEWE-Kacheln zusätzlich zu den Einträgen anderer Adapter.

Ein vollständiger Adapterupload ist nur dann erneut nötig, wenn die Metadatenübernahme nach der Paketinstallation unterbrochen wurde. Die vorhandenen TV-Instanzen und Aufnahmeaufträge müssen nicht gelöscht werden. Die funktionierende Web-/Cloud-Auswahl bleibt bestehen.

Der tatsächliche Cloud-Zugang wurde hier nicht aufgerufen. Die grundsätzliche Remote-Erreichbarkeit beider TVs ist durch den Nutzer bestätigt; die bereinigte Darstellung nach Installation von 0.1.16 ist noch vor Ort zu kontrollieren. Das Ergebnis des modellierten Importtests wird nicht als ausgeführter Cloud-Test ausgegeben.
