# Admin-Links und direkter Zugriff auf die Programmübersicht

Stand der Quellenprüfung: 19.10.2026. Ab **0.1.20**, Build
**`0.1.20-web-entry.1`**, behandelt die Web-Erweiterung auch den allgemeinen
Einstieg `/loewe-tv/`. Die automatisch erzeugten Links in der Instanzübersicht
und im Admin-Schnellzugriff können diesen Pfad erzeugen, obwohl die
Programmübersicht bisher nur unter den instanzbezogenen Web-Pfaden erreichbar
war.

Inzwischen wurde der konkrete Fehler gemeldet: Der Schnellzugriff öffnet die
erreichbare Web-Adresse auf Port 8083 mit `/loewe-tv/`; Web antwortet mit
**404, Datei `index.html` nicht gefunden**. Dieser Pfad ist mit dem unveränderten
offiziellen Linkresolver von Admin 8.0.14 exakt reproduziert. Die tatsächlich
installierte Admin-Version ist weiterhin nicht bekannt. Die folgende Reparatur
behandelt den gemeldeten Einstieg im LOEWE-TV-Adapter und setzt kein Admin-Update
voraus.

Die vom Nutzer zunächst bestätigte Cloud-Programmübersicht und Fernbedienung
verwenden weiterhin die vorhandenen Web-Links je TV. Diese erste Rückmeldung ist
keine Bestätigung der beiden Admin-Links.

## Allgemeiner Web-Einstieg ab 0.1.20

Die folgenden Adressen unter der ausgewählten Web-Instanz führen jetzt zur
Programmübersicht beziehungsweise zur TV-Auswahl:

- `/loewe-tv`
- `/loewe-tv/`
- `/loewe-tv/index.html`
- `/loewe-tv/epg.html`

Ist dort genau eine aktive LOEWE-TV-Erweiterung geladen, wird direkt zu deren
Programmübersicht weitergeleitet. Bei mehreren erscheint eine Auswahl mit den
konfigurierten Namen und den Instanzkennungen, beispielsweise `loewe-tv.0` und
`loewe-tv.1`. Die Auswahl enthält nur die tatsächlich auf dieser Web-Instanz
geladenen LOEWE-TV-Erweiterungen. Ein gültiges `?instance=N` führt gezielt zur
angegebenen Instanz, sofern sie dort vorhanden ist. Ungültige, mehrdeutige oder
auf diesem Web-Adapter nicht verfügbare Instanzen wählen keinen anderen TV aus.

Bei dem geprüften Admin-8.0.14-Verhalten geht die Information über die
ursprünglich angeklickte TV-Kachel bereits in Admin verloren. Der LOEWE-Adapter
kann sie aus `/loewe-tv/` nicht wiederherstellen. Deshalb erfolgt bei zwei TVs
eine ausdrückliche Auswahl. Wer weiterhin mit einem Klick einen bestimmten TV
öffnen möchte, verwendet dessen direkten Link oder eine eigene
Schnellzugriffskachel aus den folgenden Abschnitten.

Die vorhandenen Web-/Cloud-Kacheln pro TV und die Pfade
`/loewe-tv.0/epg.html`, `/loewe-tv.1/epg.html` bleiben bestehen. Die neuen
Einstiegsadressen erzeugen keine zusätzlichen Web-Kacheln. Weiterleitungen und
Auswahllinks sind relativ, damit der Browser die bestehende Adresse, das
Protokoll und einen vorhandenen Proxy-Unterpfad behält. Für Cloud muss wie bisher
die Web-Instanz ausgewählt sein, auf der die jeweiligen LOEWE-TV-Erweiterungen
geladen sind.

### Nach dem Update

Nach der Installation von 0.1.20 **auch die in der LOEWE-Konfiguration ausgewählte
Web-Adapterinstanz neu starten**. Der Code der Web-Erweiterung läuft im
Web-Prozess; ein Neustart nur der LOEWE-TV-Instanzen lädt ihn dort nicht neu.
Sind die beiden TVs unterschiedlichen Web-Instanzen zugeordnet, die jeweils
betroffenen Web-Instanzen neu starten. Anschließend den Schnellzugriff im Browser
neu laden, bei Bedarf mit `Strg` + `F5`.

## Direkter Zugriff über Web und Cloud

Unter der bereits funktionierenden **Web-Adresse** gelten folgende Pfade:

| TV-Instanz | Pfad unter der Web-Adresse |
| --- | --- |
| `loewe-tv.0` | `loewe-tv.0/epg.html` |
| `loewe-tv.1` | `loewe-tv.1/epg.html` |

Beispiel: Für Web unter `http://broker.example:8083/` lautet der erste Link
`http://broker.example:8083/loewe-tv.0/epg.html`. Ein vorhandener Proxy-Unterpfad
gehört zur Web-Adresse und bleibt vor diesem Pfad stehen. Die Instanz muss in
ihrer LOEWE-Konfiguration genau diesen Web-Adapter ausgewählt haben.

Für den vorhandenen Cloud-Zugang können weiterhin dessen funktionierende
Web-Kacheln `loewe-tv.0/epg.html` und `loewe-tv.1/epg.html` verwendet werden.
Ein vollständiger lokaler Link wird durch das Eintragen als eigene Kachel nicht
automatisch zu einem Cloud-Link.

## Direkter Zugriff über Admin

Falls Admin eine falsche Web-Zieladresse erzeugt, beispielsweise `127.0.0.1`
oder `localhost` auf dem Browsergerät, erreicht die Anfrage die Erweiterung
weiterhin nicht. Die neue Behandlung von `/loewe-tv/` kann einen solchen
Adressfehler nicht korrigieren. Der direkte Admin-Zugriff steht dafür weiterhin
zur Verfügung.

Im lokalen Browser die bestehende **Admin-Adresse** verwenden und folgenden Pfad
anhängen:

| TV-Instanz | Pfad unter der Admin-Adresse |
| --- | --- |
| `loewe-tv.0` | `adapter/loewe-tv/epg.html?instance=0` |
| `loewe-tv.1` | `adapter/loewe-tv/epg.html?instance=1` |

Beispiel: Wird Admin unter `https://broker.example/proxy/admin/` geöffnet, lautet
der erste Link
`https://broker.example/proxy/admin/adapter/loewe-tv/epg.html?instance=0`.
Protokoll, Adresse, Port und ein vorhandener Admin-Unterpfad gehören zur bereits
funktionierenden Admin-Adresse. Die Fernseher-IP und die Bind-Adresse eines nur
für Cloud verwendeten Web-Adapters sind dafür nicht vorgesehen.

## Eigene Kacheln im Admin-Schnellzugriff

1. In Admin **Schnellzugriff** öffnen und den Bearbeitungsmodus über den Stift
   einschalten.
2. Über **+** einen eigenen Link hinzufügen. Als Namen beispielsweise
   `Loewe TV 0 – Programmübersicht` und als URL den vollständigen Admin-Link für
   `instance=0` oder den vollständigen direkten Web-Link für `loewe-tv.0`
   eintragen. Mit **Hinzufügen** bestätigen.
3. Für TV 1 wiederholen und den passenden Link mit `instance=1` beziehungsweise
   `loewe-tv.1/epg.html` verwenden.
4. Die Änderungen des Schnellzugriffs über das Häkchen speichern. Anschließend
   beide Kacheln einzeln öffnen.

Eigene Links werden in `system.config.native.introLinks` gespeichert und direkt
an die Link-Komponente übergeben. Sie durchlaufen den automatischen
`replaceLink()`-Resolver der Adapter-Kacheln nicht. Der Editor speichert den
URL-Text unverändert. Das ist sowohl für Admin 7.7.28 als auch für die geprüften
Admin-8-Stände im Quelltext belegt. Die Kacheln lassen sich bei Bedarf später
wieder löschen. [Quellen: Admin 7 –
Intro](https://github.com/ioBroker/ioBroker.admin/blob/2c53eab88ab8dc5d1bef6104aeffd8748c3181bc/src-admin/src/tabs/Intro.tsx),
[Link-Komponente](https://github.com/ioBroker/ioBroker.admin/blob/2c53eab88ab8dc5d1bef6104aeffd8748c3181bc/src-admin/src/components/Intro/IntroCard.tsx),
[Editor](https://github.com/ioBroker/ioBroker.admin/blob/2c53eab88ab8dc5d1bef6104aeffd8748c3181bc/src-admin/src/components/Intro/EditIntroLinkDialog.tsx);
[aktueller Admin –
Intro](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/tabs/Intro.tsx),
[Link-Komponente](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/components/Intro/IntroCard.tsx),
[Editor](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/components/Intro/EditIntroLinkDialog.tsx).

Alternativ ist in einer eigenen Kachel auch der relative **Admin-Pfad** aus der
entsprechenden Tabelle möglich. Er übernimmt die Adresse und das Verzeichnis der
geöffneten Admin-Seite und eignet sich damit für HTTP, HTTPS und einen korrekt eingerichteten
Proxy-Unterpfad. Ein vollständiger lokaler Link bleibt dagegen ein lokaler Link;
er wird von einer eigenen Kachel nicht automatisch in einen Cloud-Link umgewandelt.
Ein bloßer relativer Web-Pfad gehört dagegen unter die Web-Adresse und sollte
nicht als relativer Link unter Admin eingetragen werden.

Falls die fehlerhaften automatisch erzeugten Admin-Kacheln ausgeblendet werden
sollen, dies **erst nach dem Speichern der eigenen Kacheln in einem neuen
Bearbeitungsvorgang** erledigen. In den geprüften Admin-Quellen behandelt
`saveCards()` das Ausblenden und das Speichern eigener Links in getrennten
Bedingungen; gleichzeitige Änderungen können deshalb eine der beiden Änderungen
nicht speichern. Es müssen weder globale Web-Bindungen noch andere
Adapterinstanzen geändert werden. [Quelle:
`saveCards()`](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/tabs/Intro.tsx#L944-L964).

## Nachgewiesene Unterschiede zwischen Admin-Versionen

Die Tabelle beschreibt den unveränderten Admin-Resolver. Das LOEWE-TV-Update
0.1.20 verändert diesen Resolver nicht; es ergänzt die Behandlung des verlorenen
Dateipfads auf der erreichbaren Web-Instanz. Die Analyse in 0.1.18 und 0.1.19
hatte den allgemeinen Einstieg noch nicht ergänzt.

Der Adapter hinterlegt den offiziellen String-Link
`adapter/loewe-tv/epg.html?instance=%instance%`. Die Instanzübersicht und die
automatischen Schnellzugriffskacheln verwenden dafür denselben Admin-Resolver.
Die Stringform bleibt erforderlich, damit ältere Web-Versionen keine zusätzliche
allgemeine Kachel neben jeder vorhandenen Web-Erweiterung erzeugen.

| Geprüfter Admin-Stand | Verhalten bei gesetztem `native.webInstance` und `common.webExtension` |
| --- | --- |
| **7.7.28**, Commit `2c53eab8` | Ersetzt `%instance%` und lässt den relativen Admin-Pfad bestehen. Die untersuchte Web-Umschreibung findet hier nicht statt. |
| **8.0.14**, Commit `e4b39b81` | Gibt sofort die Adresse der Web-Instanz mit `/<Adaptername>/` zurück. Pfad, Dateiname und TV-Nummer gehen verloren. Für beide TVs entsteht derselbe Link. Dies entspricht dem inzwischen gemeldeten `/loewe-tv/`-Ziel. Ab LOEWE-TV 0.1.20 behandelt der allgemeine Einstieg diese Anfrage mit Weiterleitung oder TV-Auswahl. |
| **Aktueller Quellstand**, Commit `727bb832` | Erhält Pfad und TV-Nummer, setzt davor aber die Adresse der ausgewählten Web-Instanz. `127.0.0.1` und `localhost` bleiben dabei unverändert. Die aktuelle Cloud-Zuordnung kann anschließend den generischen `/adapter/...`-Pfad erzeugen. |

Eine Loopback-Adresse bezeichnet im Browser dessen eigenen Rechner. Sie erreicht
nicht den ioBroker-Server, wenn der Browser auf einem anderen Gerät läuft.
Die Web-Erweiterung kann das nicht nachträglich korrigieren: Bei einer falschen
Zieladresse erreicht die Anfrage ihren Server gar nicht. In Admin 8.0.14 ist
zusätzlich die Information über die angeklickte TV-Instanz bereits verloren.

Die vollständigen geprüften Resolver stehen in den offiziellen Quellen:
[7.7.28](https://github.com/ioBroker/ioBroker.admin/blob/2c53eab88ab8dc5d1bef6104aeffd8748c3181bc/src-admin/src/helpers/utils.ts),
[8.0.14](https://github.com/ioBroker/ioBroker.admin/blob/e4b39b810f5f12cd6e969e25a39ff6f3188a6608/src-admin/src/helpers/utils.ts),
[aktueller Stand](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/helpers/utils.ts).
Der Pfadverlust wurde auch für eine andere Web-Erweiterung unter Admin 8.0.14 in
[Upstream-Issue 3661](https://github.com/ioBroker/ioBroker.admin/issues/3661)
gemeldet. Ein späterer
[Admin-Fix für fremde Dienst-Adressen](https://github.com/ioBroker/ioBroker.admin/commit/c63750b08943bce2ac75b9876df89fe91e1866ab)
fügt keine Ausnahme für relative Admin-Seiten hinzu.

## Warum der Adapter keine Web-Einstellungen umschreibt

Ein Wechsel zu `./adapter/...`, einem führenden `/` oder expliziten
`%admin_protocol%`-/`%admin_port%`-Platzhaltern behebt die geprüften
Admin-8-Fälle nicht. Admin 8.0.14 wertet den individuellen Link in diesem Fall
überhaupt nicht aus. Auch der aktuelle Resolver schreibt explizite
Admin-Platzhalter auf den Web-Host um.

Das Entfernen oder Umbenennen von `native.webInstance` wäre ebenfalls keine
kompatible Reparatur. Der offizielle Web-Loader lädt eine Erweiterung nur bei
exakter Auswahl seiner Instanz oder bei `*`. Eine statische `www`-Seite würde
andere Pfade und eine andere Auswahl der Web-Server erhalten. Deshalb bleiben
die funktionierenden Web-Erweiterungen und ihre beiden TV-Routen erhalten.
[Quelle:
Web-Loader und Dateiauslieferung](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts).

## Reviewbarer Vorschlag für ioBroker.admin

Unter [upstream/](upstream/) liegen zwei kleine **nicht installierte und bei
ioBroker.admin nicht eingereichte** Patchvorschläge: für den geprüften aktuellen Admin-Stand und
als Rückübertragung auf 8.0.14. Sie behandeln relative Admin-Assetpfade
`adapter/<name>/...` beziehungsweise `./adapter/<name>/...` vor der automatischen
Web-Erweiterungszuordnung. Danach ersetzt die vorhandene Logik `%instance%`;
der Browser behält den tatsächlich geöffneten Admin-Ursprung und Unterpfad.
Gewöhnliche Links auf Web-Erweiterungen durchlaufen weiterhin die bisherige Logik.

- [Vorschlag für Commit 727bb832](upstream/admin-relative-links.patch)
- [Vorschlag für Admin 8.0.14](upstream/admin-8.0.14-relative-links.patch)
- [Offline-Reproduktion und Gegenproben](upstream/repro-admin-links.cjs)

Die Reproduktion benötigt eine lokale Kopie der offiziellen
`src-admin/src/helpers/utils.ts` und Node.js mit eingebautem
`node:module.stripTypeScriptTypes`. Beispiel aus dem Adapterverzeichnis:

```sh
node docs/upstream/repro-admin-links.cjs /pfad/ioBroker.admin/src-admin/src/helpers/utils.ts
```

Das Skript führt den unveränderten Resolver und die vorgeschlagene enge Änderung
im Arbeitsspeicher aus. Es prüft TVs 0/1, Web-Bindungen `127.0.0.1`, `localhost`
und `0.0.0.0`, HTTP/HTTPS sowie Admin im Proxy- und Cloud-Unterpfad. Es schreibt
keine Admin-Datei, installiert nichts und ändert keine Live-Objekte. Der gleiche
Aufruf mit der Quelle aus 7.7.28 dient als Gegenprobe ohne Web-Umschreibungszweig.

Diese Vorschläge ersetzen keinen veröffentlichten Admin-Fix. Insbesondere wird
ein installiertes Admin nicht durch ein Update des LOEWE-TV-Adapters gepatcht.
Der allgemeine Web-Einstieg ab 0.1.20 fängt den gemeldeten Pfadverlust auf der
erreichbaren Web-Adresse ab. Er kann weder eine falsche Zieladresse noch die in
Admin verlorene Zuordnung zur ursprünglich angeklickten TV-Instanz reparieren.
Die direkten URLs, eigenen Schnellzugriffskacheln und die Programmübersicht in
der Adapterkonfiguration bleiben dafür verfügbar.
