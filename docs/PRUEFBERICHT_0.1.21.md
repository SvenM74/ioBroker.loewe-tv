# Prüfbericht 0.1.21

Stand: 19.10.2026. Version **0.1.21**, Build **`0.1.21-direct-links.1`**.

## Auftrag und Ergebnis

Die Pfeile in der Admin-Instanzübersicht sollen unmittelbar die Programmübersicht
des jeweiligen Fernsehers öffnen. Auf dem bereitgestellten Screenshot stehen
`loewe-tv.0` für **Loewe BILD 7.55** und `loewe-tv.1` für **Loewe BILD 5.32**.
Ein zusätzliches Menü zur Auswahl des Fernsehers ist bei diesen eindeutigen
Instanz-Links nicht erforderlich.

Die dafür benötigte Korrektur ist bereits in **ioBroker Admin 8.0.22** vom
02.10.2026 veröffentlicht. LOEWE-TV 0.1.21 setzt diesen Admin-Mindeststand jetzt
in seinen Paketmetadaten voraus. Neue Tests führen den ursprünglichen Code der
veröffentlichten Admin-Versionen aus und verfolgen die erzeugten Links durch
die tatsächliche LOEWE-Web-Erweiterung bis zur jeweiligen EPG-Seite.
[Offizielle Veröffentlichung von Admin 8.0.22](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22).

**Bei einer älteren installierten Admin-Version ist zuerst deren Update nötig.**
Das LOEWE-Paket allein ändert weder den installierten Admin-Linkaufbau noch eine
bereits im Browser geladene ältere Admin-Oberfläche.

## Nachgewiesene Ursache

Der ursprüngliche Resolver von Admin 8.0.14 ersetzt einen Link zur
Web-Erweiterung vorzeitig durch die Kombination aus Web-Adresse und
Adaptername. Er gibt dieses Ergebnis zurück, bevor Dateipfad und
Instanzparameter der Linkvorlage verarbeitet werden. Beide TV-Pfeile führen
dadurch zu derselben Adresse `/loewe-tv/`. Dieser Teil des Resolvers ist in
Admin 8.0.21 noch identisch.
[Offizieller Quellstand von Admin 8.0.14](https://github.com/ioBroker/ioBroker.admin/blob/e4b39b810f5f12cd6e969e25a39ff6f3188a6608/src-admin/src/helpers/utils.ts).

Admin 8.0.22 erhält beim Wechsel zur Web-Adresse den vollständigen Link und
ersetzt `%instance%` durch die jeweilige TV-Nummer. Damit funktionieren die
bereits vorhandenen LOEWE-Metadaten:

```json
{
  "localLinks": {
    "_default": "adapter/loewe-tv/epg.html?instance=%instance%"
  }
}
```

Bei ausgewählter Web-Instanz nimmt die vorhandene LOEWE-Web-Erweiterung diese
Adresse entgegen und leitet direkt zur instanzbezogenen EPG-Seite weiter.
Der allgemeine Einstieg `/loewe-tv/` wird dabei nicht aufgerufen.
[Offizieller Quellstand von Admin 8.0.22](https://github.com/ioBroker/ioBroker.admin/blob/4dbd23e49ed8d177f2bda06f9a40f4d490bffd58/src-admin/src/helpers/utils.ts).

| Angeklickter Pfeil | Link mit erhaltener Instanz auf der ausgewählten Web-Instanz | Ziel der direkten Weiterleitung |
| --- | --- | --- |
| `loewe-tv.0` – Loewe BILD 7.55 | `/adapter/loewe-tv/epg.html?instance=0` | `/loewe-tv.0/epg.html` |
| `loewe-tv.1` – Loewe BILD 5.32 | `/adapter/loewe-tv/epg.html?instance=1` | `/loewe-tv.1/epg.html` |

Ohne ausgewählte Web-Instanz bleibt die vollständige EPG-Adresse unter dem
vorhandenen Admin-Ursprung erhalten. Die vorhandenen instanzbezogenen
Web-/Cloud-Kacheln behalten ihre eigenen EPG-Ziele. Der allgemeine Einstieg aus
0.1.20 bleibt für ältere Lesezeichen ohne TV-Nummer verfügbar; bei mehreren TVs
ist dort weiterhin eine Auswahl notwendig, weil diese Adresse keine bestimmte
Instanz bezeichnet.

## Änderungen in 0.1.21

- `io-package.json` verlangt unter `common.globalDependencies` jetzt
  **Admin `>=8.0.22`**. Die Paketprüfung sichert diese Mindestversion ab.
- Paketversion, Build-Kennung, Änderungsbeschreibung und aktuelle Anleitungen
  sind auf **0.1.21 / `0.1.21-direct-links.1`** aktualisiert.
- `test/admin-link-routing.test.js` ergänzt **acht Regressionstests** mit den
  originalen Linkfunktionen aus Admin **8.0.14**, **8.0.22** und **8.3.0**.
- `test/fixtures/admin-link-resolver/` enthält die vollständigen ursprünglichen
  TypeScript-Helferdateien, daraus erzeugte CommonJS-Dateien, die MIT-Lizenz,
  Quellverweise, Prüfsummen und eine Anleitung zur Offline-Reproduktion.

Die CommonJS-Dateien entfernen ausschließlich TypeScript-Syntax und
Modul-Export-Schlüsselwörter und machen die geprüften Funktionen für die Tests
zugänglich. Der Linkalgorithmus wurde nicht verändert. Die Tests benötigen
keinen Netzwerkzugriff und keine TypeScript-Transformation zur Laufzeit.
[Quellnachweise und Reproduktion](../test/fixtures/admin-link-resolver/README.md).

Die Laufzeitimplementierung der LOEWE-Web-Erweiterung und die bestehende
Linkvorlage werden in dieser Version nicht umgebaut. Der entscheidende
Funktionsfix stammt aus der angegebenen offiziellen Admin-Version.

## Automatisierte Prüfung

Ausgeführt mit Node.js **24.19.0**:

- **`npm test`: 832 Tests bestanden**, keine Fehler und keine übersprungenen Tests.
- Darin **acht neue Tests** der Admin-Linkauflösung sowie die vorhandenen
  **23 Tests der Web-Erweiterung**.
- **`npm run check`: erfolgreich**. Paketmetadaten, Admin-Übersetzungen,
  JavaScript-Syntax, 94 Objektdefinitionen und der bestehende Protokollvertrag
  sind konsistent.
- **`git diff --check`: erfolgreich**.

Die neuen Tests prüfen folgende Eigenschaften:

| Prüfung | Ergebnis |
| --- | --- |
| Originaler Admin 8.0.14 mit beiden TVs | Der frühere Verlust von Pfad und TV-Nummer wird reproduziert. |
| Originaler Admin 8.0.22 und 8.3.0 mit beiden TVs | Jeder Pfeil erreicht durch die echte Web-Middleware die zugehörige EPG-HTML-Datei; die Auswahlseite wird nicht angefordert. |
| Unterschiedliche ausgewählte Web-Instanzen | Zugehöriger Host, Port und HTTPS-Einstellung bleiben erhalten. |
| Offizielle Reverse-Proxy-Umschreibung | Der öffentliche Unterpfad bleibt auch bei der relativen EPG-Weiterleitung erhalten. |
| Offizielle Admin-Cloud-Umschreibung | Die TV-Identität bleibt bei der URL-Umschreibung erhalten. |
| Instanzbezogene Web-/Cloud-Startseitenlinks | Jeder bestehende kanonische Link erreicht seine eigene TV-Seite. |
| Keine ausgewählte Web-Instanz | Der direkte Admin-Link einschließlich TV-Nummer und gegebenenfalls Proxy-Unterpfad bleibt erhalten. |
| Anmeldung und widersprüchliche Instanzangaben | Anmeldung wird verlangt; ungültige oder widersprüchliche Angaben öffnen keinen anderen Fernseher. |
| Herkunft der Testdateien | Git-Blob-Kennungen und SHA-256-Prüfsummen der Originalquellen, erzeugten Dateien und Lizenz stimmen überein. |

## Aussagegrenzen und Installation

Geprüft wurden die unveränderten veröffentlichten Admin-Linkfunktionen und die
tatsächliche LOEWE-Web-Middleware in automatisierten Tests. Die Cloud-Prüfung
unterscheidet ausdrücklich zwischen der URL-Umschreibung durch Admin und dem
Aufruf der kanonischen Web-/Cloud-Startseitenlinks. Cloud behandelt
`/adapter/...` als Admin-Pfad; dessen Auslieferung wird hier nicht als
vollständiger Cloud-Durchlauf nachgebildet.

Ein Test im Browser der Nutzerinstallation, im Cloud-Konto oder an den beiden
Fernsehern wurde hier nicht durchgeführt. Die beim Nutzer installierte
Admin-Version ist weiterhin nicht bekannt. Eine vom Browser nicht erreichbare
Web-Adresse, beispielsweise `127.0.0.1` auf einem anderen Gerät, ist ein
separates Adressproblem und wird durch die Erhaltung der TV-Nummer nicht behoben.

Für die Installation:

1. **Admin auf mindestens 8.0.22 aktualisieren**, falls noch ein älterer Stand
   installiert ist. Einen bereits neueren Stand beibehalten.
2. **LOEWE-TV 0.1.21 installieren** und beide TV-Instanzen starten.
3. **Die ausgewählte Web-Instanz neu starten.**
4. **Die Admin-Browserseite vollständig neu laden**, beispielsweise mit
   **Strg+F5**, und beide Pfeile erneut öffnen.
5. In beiden Instanzen **`info.adapterBuild = 0.1.21-direct-links.1`** prüfen.

[Vollständige Updateanleitung](INSTALLATION.md#update-auf-0121) ·
[Linkanleitung mit direkten Beispieladressen](ADMIN_LINKS.md).
