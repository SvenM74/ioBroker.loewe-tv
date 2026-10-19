# Admin-Links und direkter Zugriff auf die Programmübersicht

Stand der Quellenprüfung: 19.10.2026. Ab **0.1.21**, Build
**`0.1.21-direct-links.1`**, setzt LOEWE-TV **ioBroker.admin ab 8.0.22** voraus.
Der Öffnen-Pfeil in der Zeile `loewe-tv.0` führt zur Programmübersicht von TV 0;
der Pfeil in der Zeile `loewe-tv.1` führt zur Programmübersicht von TV 1.
**Zwischen dem Anklicken eines Instanz-Links und seiner EPG-Seite ist keine
TV-Auswahl nötig.** Dasselbe gilt für die automatisch erzeugten
instanzbezogenen Kacheln im Admin-Schnellzugriff.

Die Voraussetzung betrifft den Linkaufbau in Admin: Manche ältere
Admin-8-Versionen entfernen den Dateinamen und die TV-Nummer, bevor der Browser
die LOEWE-Seite überhaupt anfordert. Der dafür veröffentlichte Fix ist seit
[Admin 8.0.22 vom 02.10.2026](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22)
verfügbar. **Ein LOEWE-TV-Update allein ändert eine noch laufende alte
Admin-Oberfläche nicht.**

## Installation und Prüfung der Instanz-Links

1. **Zuerst Admin auf mindestens 8.0.22 aktualisieren.** Zum Zeitpunkt der
   Quellenprüfung ist
   [8.3.0](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.3.0)
   die aktuelle veröffentlichte Version. Die Voraussetzungen der gewählten
   Admin-Version müssen zur eigenen ioBroker-Installation passen.
2. LOEWE-TV auf **0.1.21** aktualisieren und die vorhandenen LOEWE-TV-Instanzen
   starten. Unter `info.adapterBuild` muss jeweils
   **`0.1.21-direct-links.1`** stehen.
3. Die in der LOEWE-Konfiguration ausgewählte **Web-Adapterinstanz neu starten**,
   damit auch dort der installierte Erweiterungscode geladen wird. Sind die TVs
   verschiedenen Web-Instanzen zugeordnet, beide betroffenen Web-Instanzen neu
   starten.
4. Admin im Browser mit **`Strg` + `F5` vollständig neu laden**. Ein vor dem
   Admin-Update geöffneter Browser-Tab kann noch den alten Linkaufbau verwenden.
5. In der Instanzübersicht die Öffnen-Pfeile für `loewe-tv.0` und `loewe-tv.1`
   einzeln prüfen. Jeder Pfeil muss die zugehörige Programmübersicht ohne
   Auswahlmenü öffnen. Anschließend die entsprechenden Schnellzugriffskacheln
   prüfen.

Die vorhandene Auswahl des Web-Adapters in jeder LOEWE-Konfiguration und die
funktionierenden Web-/Cloud-Kacheln bleiben erhalten. Eigene zusätzliche
Kacheln sind für den normalen Instanzzugriff nicht erforderlich.

## So bleibt die angeklickte TV-Instanz erhalten

Der Adapter behält den offiziellen String-Link bei:

```text
adapter/loewe-tv/epg.html?instance=%instance%
```

Admin ersetzt `%instance%` durch die Nummer der angeklickten Zeile. Ist ein
Web-Adapter ausgewählt, verwenden die korrigierten Admin-Versionen dessen
Adresse und erhalten den gesamten Dateipfad einschließlich TV-Nummer. Die
LOEWE-Web-Erweiterung leitet anschließend gezielt zur instanzbezogenen EPG-Seite
weiter. Dies ist eine HTTP-Weiterleitung ohne zusätzliche Seite oder
Benutzerentscheidung.

Beispiel für einen Web-Adapter unter `http://broker.example:8083/`:

| Angeklickter Instanz-Link | Von Admin erzeugter Pfad | Direkt geöffnete EPG-Seite |
| --- | --- | --- |
| `loewe-tv.0` | `adapter/loewe-tv/epg.html?instance=0` | `loewe-tv.0/epg.html` |
| `loewe-tv.1` | `adapter/loewe-tv/epg.html?instance=1` | `loewe-tv.1/epg.html` |

Die Prüfungen verwenden den unveränderten Resolver aus veröffentlichten
Admin-Versionen zusammen mit der LOEWE-Web-Erweiterung. Sie verfolgen beide
TV-Instanzen getrennt durch Linkaufbau und Weiterleitung bis zur passenden
EPG-Seite. Damit wird auch geprüft, dass die beiden Instanz-Links nicht wieder
auf denselben allgemeinen Einstieg zusammenfallen.

Die Stringform von `common.localLinks._default` bleibt bestehen, weil ältere
Web-Versionen bei der Objektform zusätzliche allgemeine Kacheln importieren
würden. Die Erweiterung liefert weiterhin genau ihre vorhandene Web-Kachel
pro TV.

## Direkter Zugriff über Web und Cloud

Die bestehenden direkten Pfade unter der ausgewählten **Web-Adresse** lauten:

| TV-Instanz | Pfad unter der Web-Adresse |
| --- | --- |
| `loewe-tv.0` | `loewe-tv.0/epg.html` |
| `loewe-tv.1` | `loewe-tv.1/epg.html` |

Beispiel: Für Web unter `http://broker.example:8083/` lautet der erste Link
`http://broker.example:8083/loewe-tv.0/epg.html`. Ein vorhandener Proxy-Unterpfad
steht vor diesem Pfad. Jede TV-Instanz muss in ihrer LOEWE-Konfiguration genau
den Web-Adapter ausgewählt haben, über dessen Adresse sie geöffnet wird.

Für den bestehenden Cloud-Zugang bleiben die funktionierenden Web-Kacheln je TV
verwendbar. Die korrigierten Admin-Versionen können auch ihre Instanz- und
Schnellzugriffslinks dem vorhandenen Cloud-Zugang zuordnen, sofern dieser die
ausgewählte Web-Instanz veröffentlicht. Der geprüfte Admin-Resolver erhält
dabei die TV-Nummer. Die tatsächliche Weiterleitung übernimmt Cloud; insbesondere
behandelt Cloud Pfade unter `/adapter/` als Admin-Zugang. Die Tests prüfen die
URL-Aufbereitung getrennt von den bestehenden Web-Kacheln und ersetzen keinen
Live-Test des Cloud-Zugangs. [Admin-8.0.22-Releasehinweise](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22)
· [Web-/Cloud-Zugang](EPG_GUI.md#über-iobrokercloud-remote-öffnen).

## Allgemeiner Einstieg für alte oder unvollständige Lesezeichen

Die in 0.1.20 ergänzten allgemeinen Adressen bleiben erreichbar:

- `/loewe-tv`
- `/loewe-tv/`
- `/loewe-tv/index.html`
- `/loewe-tv/epg.html`

Diese Adressen enthalten von sich aus **keine TV-Nummer**. Bei genau einer
geladenen TV-Erweiterung öffnet sich deren Programmübersicht direkt. Bei
mehreren TVs erscheint weiterhin eine Auswahl, damit ein altes allgemeines
Lesezeichen nicht versehentlich den falschen Fernseher steuert. Ein gültiges
`?instance=N` öffnet die angegebene Instanz direkt, sofern sie auf diesem
Web-Adapter verfügbar ist.

**Dieser allgemeine Einstieg ist ab 0.1.21 nicht das vorgesehene Ziel eines
normalen Instanz-Pfeils.** Er dient alten oder unvollständigen Lesezeichen. Wenn
ein Instanz-Pfeil weiterhin nur `/loewe-tv/` öffnet, zunächst die installierte
Admin-Version und das vollständige Neuladen der Admin-Oberfläche prüfen.

Die Auswahl enthält nur die tatsächlich auf dieser Web-Instanz geladenen
LOEWE-Erweiterungen. Ungültige, mehrdeutige oder dort nicht verfügbare
Instanznummern wählen keinen anderen TV aus. Es entstehen durch den allgemeinen
Einstieg keine zusätzlichen Web-Kacheln.

## Geprüfte Admin-Versionen und Ursache des früheren Fehlers

| Geprüfter Admin-Stand | Verhalten des unveränderten Resolvers bei ausgewähltem Web-Adapter |
| --- | --- |
| **7.7.28** | Ersetzt `%instance%` und behält den relativen Admin-Pfad. Diese ältere Version war von der späteren Web-Umschreibung nicht betroffen. |
| **8.0.14** | Gibt sofort die Web-Adresse mit `/loewe-tv/` zurück. Dateiname und TV-Nummer gehen verloren; beide TV-Zeilen erzeugen denselben Link. |
| **8.0.21** | Der Verlust von Dateipfad und TV-Nummer besteht weiterhin. |
| **8.0.22**, Commit `4dbd23e4` | Erster veröffentlichter Fix: erhält Dateipfad, Queryparameter und `%instance%`; die vorhandene LOEWE-Weiterleitung erreicht die richtige TV-Seite ohne Auswahl. |
| **8.3.0** | Aktueller veröffentlichter Stand am 19.10.2026; der korrigierte Linkaufbau bleibt enthalten. |

Obwohl Admin 7.7.28 den früheren relativen Link richtig behandelte, setzt
LOEWE-TV 0.1.21 nun **Admin ab 8.0.22** voraus. So schließt die
Versionsvoraussetzung die zwischenzeitliche Regression aus, statt eine bereits
bekannt fehlerhafte Admin-Version weiterhin als ausreichend auszuweisen.

Offizielle Quellen:
[7.7.28](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/helpers/utils.ts),
[8.0.14](https://github.com/ioBroker/ioBroker.admin/blob/v8.0.14/src-admin/src/helpers/utils.ts),
[8.0.21](https://github.com/ioBroker/ioBroker.admin/blob/v8.0.21/src-admin/src/helpers/utils.ts),
[8.0.22](https://github.com/ioBroker/ioBroker.admin/blob/4dbd23e49ed8d177f2bda06f9a40f4d490bffd58/src-admin/src/helpers/utils.ts),
[8.3.0](https://github.com/ioBroker/ioBroker.admin/blob/v8.3.0/src-admin/src/helpers/utils.ts).
Der ursprüngliche Pfadverlust ist außerdem in
[Upstream-Issue 3661](https://github.com/ioBroker/ioBroker.admin/issues/3661)
dokumentiert und in den
[Releasehinweisen zu 8.0.22](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22)
als behoben beschrieben. Die tatsächlich beim Nutzer installierte
Admin-Version lässt sich aus dem gemeldeten `/loewe-tv/`-Pfad allein nicht
bestimmen.

## Falls die Web-Zieladresse selbst falsch ist

Ein korrekt erhaltener Dateipfad macht eine falsche Zieladresse nicht
erreichbar. Insbesondere übernehmen die geprüften Admin-Versionen eine explizite
Web-Bindung an `127.0.0.1` oder `localhost` weiterhin in den Link. Im Browser
bezeichnet diese Adresse dessen eigenen Rechner. Das ist ein eigenständiges
Adressproblem und wird durch den Fix für Dateipfad und Instanznummer nicht
gelöst.

Für einen direkten Zugriff über die bereits erreichbare **Admin-Adresse**
können diese Pfade als Lesezeichen oder eigene Schnellzugriffskacheln verwendet
werden:

| TV-Instanz | Pfad unter der Admin-Adresse |
| --- | --- |
| `loewe-tv.0` | `adapter/loewe-tv/epg.html?instance=0` |
| `loewe-tv.1` | `adapter/loewe-tv/epg.html?instance=1` |

Ein vorhandener Admin-Unterpfad gehört davor, beispielsweise
`https://broker.example/proxy/admin/adapter/loewe-tv/epg.html?instance=0`.
Eigene Schnellzugriffskacheln werden über den Bearbeitungsmodus und **+**
angelegt. Ihr URL-Text durchläuft den automatischen Adapter-Linkresolver nicht.
Ein darin eingetragener lokaler vollständiger Link wird dadurch nicht
automatisch zu einem Cloud-Link. [Quelle:
Admin-Schnellzugriff](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/tabs/Intro.tsx).

## Warum die vorhandene Web-Erweiterung bestehen bleibt

Der offizielle Web-Loader benötigt `common.webExtension` und die Auswahl in
`native.webInstance`, um die Erweiterung auf der richtigen Web-Instanz zu
laden. Das Entfernen dieser Angaben würde auch die funktionierenden
instanzbezogenen Web-/Cloud-Zugänge verändern. Die Korrektur verwendet deshalb
den veröffentlichten Admin-Fix und erhält die vorhandene Web-Anbindung.
[Quelle:
Web-Loader und Dateiauslieferung](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts).

## Historische Vorschläge für relative Admin-Adressen

Unter [upstream/](upstream/) bleiben zwei frühere **nicht installierte und bei
ioBroker.admin nicht eingereichte** Patchvorschläge zur Quellenanalyse
erhalten. Sie würden relative Admin-Assetpfade zusätzlich am geöffneten
Admin-Ursprung belassen, statt sie auf die Web-Adresse umzuschreiben:

- [Vorschlag für Commit 727bb832](upstream/admin-relative-links.patch)
- [Vorschlag für Admin 8.0.14](upstream/admin-8.0.14-relative-links.patch)
- [Offline-Reproduktion und Gegenproben](upstream/repro-admin-links.cjs)

Für den **Verlust von Dateipfad und TV-Nummer** sind diese Vorschläge durch den
bereits veröffentlichten Fix in Admin 8.0.22 überholt. Die weitergehende Frage,
ob eine relative Admin-Seite grundsätzlich ihren Admin-Ursprung behalten
sollte, ist davon getrennt. Keiner dieser Vorschläge wird vom LOEWE-Update in
eine fremde Admin-Installation eingespielt.

Die historische Reproduktion kann weiterhin mit einer lokalen offiziellen
Quelldatei ausgeführt werden:

```sh
node docs/upstream/repro-admin-links.cjs /pfad/ioBroker.admin/src-admin/src/helpers/utils.ts
```

Sie vergleicht unveränderten Quelltext und Vorschlag ausschließlich im
Arbeitsspeicher. Sie schreibt keine Admin-Datei, installiert nichts und ändert
keine Live-Objekte. Für die direkten Instanz-Links in LOEWE-TV 0.1.21 ist die
veröffentlichte Admin-Version ab 8.0.22 maßgeblich.
