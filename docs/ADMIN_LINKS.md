# Admin-Links und direkter Zugriff auf die Programmübersicht

Stand der Quellenprüfung: 19.10.2026. **LOEWE-TV 0.1.22**, Build
**`0.1.22-recovery.1`**, lässt **ioBroker.admin ab 7.7.28** wieder zu.
Die in 0.1.21 eingeführte Voraussetzung `admin >=8.0.22` wird zurückgenommen:
Sie konnte bei älterem Admin den Start der LOEWE-Instanzen verhindern. Ohne
laufende Adapterinstanz können weder die EPG-Seite noch die Fernbedienung
Antworten erhalten. Für diese Wiederherstellung ist bei bereits vorhandenem
Admin ab 7.7.28 **kein Admin-Upgrade erforderlich**. [Prüfbericht 0.1.22](PRUEFBERICHT_0.1.22.md)
· [Versionsprüfung vor dem Adapterstart im js-controller](https://github.com/ioBroker/ioBroker.js-controller/blob/e4c842b9056eb5b0b18bb56e70611821ecb3cc80/packages/controller/src/main.ts).

**Der automatische Instanz-Link ist damit nicht für alle Admin-Versionen
repariert.** Einige ältere Admin-8-Versionen entfernen die TV-Nummer aus dem
Link. Deren Instanz-Pfeile können bei mehreren Fernsehern weiterhin die
TV-Auswahl öffnen. Die direkten Admin- und Web-Adressen je TV lassen sich
unabhängig von diesem Linkaufbau verwenden.

Die Web-Erweiterung und der in 0.1.20 ergänzte Einstieg für `/loewe-tv/` bleiben
erhalten. Es erfolgt keine vollständige Rückkehr auf 0.1.19, bei der dieser
Einstieg noch mit 404 enden konnte. [Update-Anleitung](INSTALLATION.md).

## Wiederherstellung mit 0.1.22 prüfen

1. LOEWE-TV auf **0.1.22** aktualisieren und die vorhandenen LOEWE-TV-Instanzen
   starten. Zuerst im Startprotokoll und am jeweiligen `alive`-Datenpunkt prüfen,
   ob die Instanz tatsächlich läuft. Ein gespeicherter Build-Datenpunkt allein
   belegt das nicht.
2. Unter `loewe-tv.0.info.adapterBuild` beziehungsweise
   `loewe-tv.1.info.adapterBuild` muss nach erfolgreichem Start
   **`0.1.22-recovery.1`** stehen.
3. Die in der LOEWE-Konfiguration ausgewählte **Web-Adapterinstanz neu starten**,
   damit sie den installierten Erweiterungscode lädt. Sind die TVs verschiedenen
   Web-Instanzen zugeordnet, die jeweils betroffenen Web-Instanzen neu starten.
4. Die EPG-Seiten und Admin im Browser vollständig neu laden, beispielsweise
   mit **`Strg` + `F5`**. Für den Funktionstest zunächst einen der unten genannten
   direkten Links je TV öffnen und EPG sowie Fernbedienung getrennt prüfen.
5. Anschließend Instanz-Pfeile und Schnellzugriff prüfen. Öffnet ein automatisch
   erzeugter Link weiterhin nur `/loewe-tv/`, bleibt der unten beschriebene
   Admin-Linkfehler bestehen. Das ist von einem fehlgeschlagenen Adapterstart
   oder einer fehlenden EPG-Verbindung zu unterscheiden.

Die vorhandene Auswahl des Web-Adapters in jeder LOEWE-Konfiguration und die
bestehenden Web-/Cloud-Kacheln bleiben erhalten. Die Wiederherstellung ändert
den EPG- und Fernbedienungs-Transport nicht.

## Direkt die EPG-Seite eines Fernsehers öffnen

Die folgenden Pfade enthalten bereits eine eindeutige TV-Nummer und benötigen
keine Auswahlseite:

| TV-Instanz | Pfad unter der Admin-Adresse | Pfad unter der ausgewählten Web-Adresse |
| --- | --- | --- |
| `loewe-tv.0` | `adapter/loewe-tv/epg.html?instance=0` | `loewe-tv.0/epg.html` |
| `loewe-tv.1` | `adapter/loewe-tv/epg.html?instance=1` | `loewe-tv.1/epg.html` |

Beispiel für Web unter `http://broker.example:8083/`:

- TV 0: `http://broker.example:8083/loewe-tv.0/epg.html`
- TV 1: `http://broker.example:8083/loewe-tv.1/epg.html`

Beispiel für Admin unter `http://broker.example:8081/`:

- TV 0: `http://broker.example:8081/adapter/loewe-tv/epg.html?instance=0`
- TV 1: `http://broker.example:8081/adapter/loewe-tv/epg.html?instance=1`

Ein vorhandener Proxy-Unterpfad gehört vor den jeweiligen Pfad, beispielsweise
`https://broker.example/proxy/admin/adapter/loewe-tv/epg.html?instance=0`.
Für die Web-Adressen muss jede TV-Instanz in ihrer LOEWE-Konfiguration den
Web-Adapter ausgewählt haben, über dessen Adresse sie geöffnet wird. Die
erreichbare Admin- oder Web-Adresse ist gemeint, nicht die Steueradresse des TVs.

### Eigene Kacheln im Admin-Schnellzugriff

Die direkten URLs können als Lesezeichen oder eigene Schnellzugriffskacheln
gespeichert werden. Eigene Kacheln werden im Admin-Schnellzugriff über den
Bearbeitungsmodus und **+** angelegt. Ihr URL-Text durchläuft den automatischen
Adapter-Linkresolver nicht. Ein eingetragener lokaler vollständiger Link wird
dadurch nicht automatisch zu einem Cloud-Link. [Quelle:
Admin-Schnellzugriff](https://github.com/ioBroker/ioBroker.admin/blob/727bb83247192c151de8bb2abde049f0fd90c84b/src-admin/src/tabs/Intro.tsx).

### Bestehender Cloud-Zugang

Für den Cloud-Zugang die vorhandenen instanzbezogenen **Web-Kacheln je TV**
verwenden. Die Cloud-Konfiguration muss die zugehörige Web-Instanz
veröffentlichen. Ein lokales Lesezeichen mit Hostname oder LAN-IP ist kein
Remote-Link.

Cloud behandelt Pfade unter `/adapter/` als Admin-Zugang. Ein manueller lokaler
Admin-Link lässt sich deshalb nicht einfach mit einer anderen Basisadresse
als geprüft funktionierender Cloud-Link ausweisen. Die Tests prüfen die
URL-Aufbereitung des Admin-Resolvers und die bestehenden Web-Kacheln getrennt;
sie ersetzen keinen Live-Test von Anmeldung, EPG und Fernbedienung über das
Cloud-Konto. [Web-/Cloud-Zugang](EPG_GUI.md#über-iobrokercloud-remote-öffnen)
· [offizielles Cloud-Routing](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/main.ts).

## Automatische Instanz-Links: verbleibende Einschränkung

Der Adapter behält die vorhandene Linkvorlage bei:

```text
adapter/loewe-tv/epg.html?instance=%instance%
```

Admin ersetzt `%instance%` durch die Nummer der angeklickten Zeile. Bestimmte
ältere Admin-8-Versionen geben bei ausgewähltem Web-Adapter jedoch schon vorher
die allgemeine Web-Adresse mit `/loewe-tv/` zurück. Dateiname und TV-Nummer
gehen dabei verloren. Aus dieser URL kann die LOEWE-Web-Erweiterung nicht mehr
erkennen, welcher Instanz-Pfeil angeklickt wurde.

Der offizielle Fix in
[Admin 8.0.22 vom 02.10.2026](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22)
erhält Dateipfad und TV-Nummer. **8.0.22 ist eine optionale Voraussetzung für
diesen korrigierten Admin-Linkaufbau, nicht die Mindestversion zum Betrieb von
LOEWE-TV 0.1.22.** Ein LOEWE-TV-Update allein ersetzt weder den installierten
Admin-Code noch einen bereits geöffneten alten Browser-Tab. Ein Admin-Update
muss zu den Voraussetzungen der eigenen ioBroker-Installation passen.

Für die geprüften korrigierten Admin-Resolver ergibt sich bei ausgewähltem
Web-Adapter folgender Weg:

| Angeklickter Instanz-Link | Von Admin erzeugter Pfad | Ziel der LOEWE-Web-Weiterleitung |
| --- | --- | --- |
| `loewe-tv.0` | `adapter/loewe-tv/epg.html?instance=0` | `loewe-tv.0/epg.html` |
| `loewe-tv.1` | `adapter/loewe-tv/epg.html?instance=1` | `loewe-tv.1/epg.html` |

Die Tests verwenden die ursprünglichen Resolver aus veröffentlichten
Admin-Versionen zusammen mit der LOEWE-Web-Erweiterung. Sie belegen diesen
Linkaufbau und die instanzbezogene HTTP-Weiterleitung in der Testumgebung.
Sie bestätigen nicht die tatsächlich beim Nutzer installierte Admin-Version
oder die Erreichbarkeit seiner Web-Adresse.

### Geprüfte Admin-Versionen

| Geprüfter Admin-Stand | Verhalten des unveränderten Resolvers bei ausgewähltem Web-Adapter |
| --- | --- |
| **7.7.28** | Ersetzt `%instance%` und behält den relativen Admin-Pfad. Diese Version war von der späteren Web-Umschreibung nicht betroffen. |
| **8.0.14** | Gibt sofort die Web-Adresse mit `/loewe-tv/` zurück. Dateiname und TV-Nummer gehen verloren; beide TV-Zeilen erzeugen denselben Link. |
| **8.0.21** | Der Verlust von Dateipfad und TV-Nummer besteht weiterhin. |
| **8.0.22**, Commit `4dbd23e4` | Erster veröffentlichter Fix: erhält Dateipfad, Queryparameter und `%instance%`; die vorhandene LOEWE-Weiterleitung erreicht im Test die richtige TV-Seite ohne Auswahl. |
| **8.3.0** | Veröffentlichter Stand am 19.10.2026; der korrigierte Linkaufbau bleibt enthalten. |

Offizielle Quellen:
[7.7.28](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/helpers/utils.ts),
[8.0.14](https://github.com/ioBroker/ioBroker.admin/blob/v8.0.14/src-admin/src/helpers/utils.ts),
[8.0.21](https://github.com/ioBroker/ioBroker.admin/blob/v8.0.21/src-admin/src/helpers/utils.ts),
[8.0.22](https://github.com/ioBroker/ioBroker.admin/blob/4dbd23e49ed8d177f2bda06f9a40f4d490bffd58/src-admin/src/helpers/utils.ts),
[8.3.0](https://github.com/ioBroker/ioBroker.admin/blob/v8.3.0/src-admin/src/helpers/utils.ts).
Der Pfadverlust ist außerdem in
[Upstream-Issue 3661](https://github.com/ioBroker/ioBroker.admin/issues/3661)
dokumentiert und in den
[Releasehinweisen zu 8.0.22](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22)
als behoben beschrieben. Aus dem gemeldeten `/loewe-tv/`-Pfad allein lässt
sich die installierte Admin-Version nicht bestimmen.

## Allgemeiner Einstieg bleibt als Schutz vor 404 erhalten

Die in 0.1.20 ergänzten allgemeinen Adressen bleiben in 0.1.22 erreichbar:

- `/loewe-tv`
- `/loewe-tv/`
- `/loewe-tv/index.html`
- `/loewe-tv/epg.html`

Diese Adressen enthalten von sich aus **keine TV-Nummer**. Bei genau einer
geladenen TV-Erweiterung öffnet sich deren Programmübersicht direkt. Bei
mehreren TVs erscheint die Auswahl. Ein gültiges `?instance=N` öffnet die
angegebene Instanz direkt, sofern sie auf diesem Web-Adapter verfügbar ist.

Ab **0.1.25** zeigen die Auswahlkacheln die bei der Netzwerksuche erkannten
Fernsehernamen. Die gespeicherte IP-Adresse mit Steuerport bestimmt die
Zuordnung; Instanzkennung und EPG-Ziel bleiben erhalten. Für bestehende
Installationen nach dem Update in jeder TV-Instanz einmal **Fernseher suchen**
ausführen. Anschließend bleiben die Namen auch bei ausgeschaltetem TV
verfügbar. [Einrichtung der Namen](NETWORK_DISCOVERY.md#fernsehernamen-in-der-web-auswahl).

Der Einstieg wird weiterhin von alten Lesezeichen **und von den betroffenen
automatischen Admin-Links** benötigt. Die Auswahl enthält nur die tatsächlich
auf dieser Web-Instanz geladenen LOEWE-Erweiterungen. Ungültige, mehrdeutige oder
dort nicht verfügbare Instanznummern wählen keinen anderen TV aus. Es entstehen
dadurch keine zusätzlichen Web-Kacheln.

## Falls EPG und Fernbedienung beide nicht antworten

Beide Funktionen benötigen eine laufende LOEWE-Adapterinstanz. Die statische
Webseite kann trotzdem vom Web-Adapter ausgeliefert werden, auch wenn der
LOEWE-Prozess nicht läuft. Deshalb zuerst den Adapterstart prüfen:

1. **Läuft die richtige Instanz?**
   `system.adapter.loewe-tv.0.alive` beziehungsweise
   `system.adapter.loewe-tv.1.alive` prüfen. `info.connection` beschreibt dagegen
   die Verbindung zum Fernseher und beantwortet nicht die Frage, ob der
   Adapterprozess läuft.
2. **Was steht im Startprotokoll?** Auf eine abgelehnte Admin-Versionsvoraussetzung
   oder einen anderen Startfehler achten. Nach dem Update auf 0.1.22 die
   betroffenen Instanzen starten und das neue Protokoll prüfen. Ein alter
   gespeicherter Build-Wert ist kein Beleg für einen erfolgreichen Neustart.
3. **Welcher Build läuft?** Nach dem Start muss die betreffende Instanz
   `0.1.22-recovery.1` melden. Die Prüfung für beide TVs separat durchführen.
4. **Erst bei laufender Instanz die Browserverbindung prüfen.** Den passenden
   direkten Link aus der Tabelle öffnen, die Seite vollständig neu laden und
   ihre Statusmeldung lesen. Falls sie weiter keine Antwort erhält, in den
   Browser-Entwicklerwerkzeugen nach fehlgeschlagenen Skript- oder
   Verbindungsanfragen sowie einer abgelaufenen Anmeldung suchen. Die
   vollständige aufgerufene Adresse und die genaue Fehlermeldung helfen,
   Linkaufbau, Anmeldung und Nachrichtenverbindung auseinanderzuhalten.

0.1.22 nimmt die Versionsanforderung zurück. Es behauptet keine zusätzliche
Korrektur für Socket.IO, reine WebSockets oder eine konkrete Cloud-Verbindung.
Die Web-Socket-Konfiguration sollte nicht allein wegen eines fehlgeschlagenen
LOEWE-Adapterstarts umgestellt werden.

## Falls die Web-Zieladresse selbst falsch ist

Ein korrekt erhaltener Dateipfad macht eine falsche Zieladresse nicht
erreichbar. Insbesondere übernehmen die geprüften Admin-Versionen eine explizite
Web-Bindung an `127.0.0.1` oder `localhost` weiterhin in den Link. Im Browser
bezeichnet diese Adresse dessen eigenen Rechner. Das ist ein eigenständiges
Adressproblem und wird durch den Fix für Dateipfad und Instanznummer nicht
gelöst.

In diesem Fall für die Prüfung einen direkten Link unter der bereits
erreichbaren Admin- oder Web-Adresse aus der obigen Tabelle verwenden. Die
Konfiguration eines vorhandenen Reverse-Proxys oder Cloud-Zugangs bleibt dabei
zu berücksichtigen.

## Warum die vorhandene Web-Erweiterung bestehen bleibt

Der offizielle Web-Loader benötigt `common.webExtension` und die Auswahl in
`native.webInstance`, um die Erweiterung auf der richtigen Web-Instanz zu
laden. Das Entfernen dieser Angaben würde auch die vorhandenen
instanzbezogenen Web-/Cloud-Zugänge verändern. 0.1.22 erhält deshalb diese
Anbindung einschließlich des allgemeinen Einstiegs aus 0.1.20.
[Quelle:
Web-Loader und Dateiauslieferung](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts).

Die Stringform von `common.localLinks._default` bleibt ebenfalls bestehen, weil
ältere Web-Versionen bei der Objektform zusätzliche allgemeine Kacheln
importieren würden. Die Erweiterung liefert weiterhin ihre vorhandene
Web-Kachel pro TV.

## Historische Vorschläge für relative Admin-Adressen

Unter [upstream/](upstream/) bleiben frühere **nicht installierte und bei
ioBroker.admin nicht eingereichte** Patchvorschläge zur Quellenanalyse erhalten:

- [Vorschlag für Commit 727bb832](upstream/admin-relative-links.patch)
- [Vorschlag für Admin 8.0.14](upstream/admin-8.0.14-relative-links.patch)
- [Offline-Reproduktion und Gegenproben](upstream/repro-admin-links.cjs)

Für den Verlust von Dateipfad und TV-Nummer sind sie durch den veröffentlichten
Fix in Admin 8.0.22 überholt. Ob eine relative Admin-Seite grundsätzlich ihren
Admin-Ursprung behalten sollte, ist eine getrennte Frage. Die Reproduktion
vergleicht offiziellen Quelltext und Vorschlag nur im Arbeitsspeicher. Kein
Patch wird vom LOEWE-Update in eine fremde Admin-Installation eingespielt.
