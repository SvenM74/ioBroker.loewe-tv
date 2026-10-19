# Prüfbericht 0.1.22: Wiederherstellung der Startkompatibilität

Stand: **19. Oktober 2026**  
Version: **0.1.22**  
Build: **`0.1.22-recovery.1`**

## Anlass und Ziel

Nach dem Update auf 0.1.21 meldet der Nutzer weiterhin eine Fernseherauswahl hinter den Instanz-Pfeilen. Zusätzlich werden keine EPG-Daten mehr geladen, und die Fernbedienung funktioniert nicht mehr. Der Nutzer hat ausdrücklich erlaubt, die letzten Änderungen zurückzunehmen.

0.1.22 nimmt die neu eingeführte harte Abhängigkeit von Admin 8.0.22 zurück. Wieder gilt **Admin ab 7.7.28**. Die Veröffentlichung soll die zuvor unterstützte Installation wieder starten lassen, ohne dafür ein Admin-Update zu verlangen. Eine funktionierende EPG-Verbindung und Fernbedienung haben Vorrang vor einer Änderung der Instanz-Pfeile.

Die genaue Admin-Version und die aktuellen Startprotokolle der Nutzerinstallation liegen bei dieser Prüfung nicht vor. Der nachfolgend nachgewiesene Startblock ist deshalb eine **konkrete, zum Fehlerbild passende Ursache**, aber noch keine vor Ort bestätigte Diagnose.

## Nachgewiesene Änderung mit Auswirkung auf den Adapterstart

Der Vergleich der veröffentlichten Pakete ergibt:

| Übergang | Änderungen mit Bedeutung für diesen Fehler |
| --- | --- |
| 0.1.18 auf 0.1.19 | Korrekturen an der XMLTV-Konfiguration und Senderzuordnung sowie quadratische Logoflächen. Die Web-Erweiterung und die Verbindung der Fernbedienung bleiben erhalten. |
| 0.1.19 auf 0.1.20 | Ein generischer Einstieg unter `/loewe-tv/` fängt verkürzte Admin-Links ab. Bei mehreren Fernsehern zeigt dieser mehrdeutige Aufruf eine Auswahl. Die vorhandenen eindeutigen TV-Pfade bleiben erhalten. |
| 0.1.20 auf 0.1.21 | Kein geänderter Laufzeitcode für EPG, Fernbedienung oder Web-Auslieferung. Als betriebsrelevante Änderung wird `common.globalDependencies.admin` von `>=7.7.28` auf `>=8.0.22` erhöht. |
| 0.1.21 auf 0.1.22 | Die Admin-Abhängigkeit wird auf `>=7.7.28` zurückgesetzt. Versionsangaben, Prüfungen und Dokumentation werden daran angepasst. |

Vergleichsgrundlage sind die gepackten und veröffentlichten Stände [0.1.19](https://github.com/SvenM74/ioBroker.loewe-tv/commit/a0594ca55644053b522449ee1b3c5450ee728272), [0.1.20](https://github.com/SvenM74/ioBroker.loewe-tv/commit/5a4a6fe5f412419a2073efd1be105a6502bf65d2) und [0.1.21](https://github.com/SvenM74/ioBroker.loewe-tv/commit/c234f2aa81a5da350ff039902a6dbd39c89f61bc).

### Warum eine zu hohe Admin-Abhängigkeit beide Funktionen abschalten kann

Im offiziellen **js-controller 7.2.5** prüft `checkVersions()` vor dem Prozessstart die lokalen und globalen Adapterabhängigkeiten. `checkVersion()` wirft bei einer zu niedrigen installierten Version einen Fehler. `startInstance()` protokolliert diesen Fehler und kehrt anschließend ausdrücklich zurück, ohne die Instanz zu starten. Das gilt auch dann, wenn die fehlende Version nur für die Darstellung eines Links benötigt wird.

Quelle: [js-controller 7.2.5, `packages/controller/src/main.ts`](https://github.com/ioBroker/ioBroker.js-controller/blob/e4c842b9056eb5b0b18bb56e70611821ecb3cc80/packages/controller/src/main.ts), Funktionen `checkVersion`, `checkVersions` und `startInstance`. Die geprüfte Quelldatei hat die Git-Blob-ID `6f76de59e7cc362315ea64dd301b648e4afed59f`.

Mit beispielsweise Admin 8.0.14 und der Abhängigkeit aus 0.1.21 ergibt die Prüfung:

```text
Adapter dependency not fulfilled on any host: required adapter "admin" has wrong version. Installed "8.0.14", required ">=8.0.22"!
```

Der Controller versieht diese Meldung beim tatsächlichen Startversuch zusätzlich mit dem Host und `startInstance system.adapter.loewe-tv.N`. Der Text oben ist das Ergebnis der reproduzierten Versionsprüfung, **kein vom Nutzer übermittelter Logeintrag**.

Der Zusammenhang erklärt auch die Kombination aus sichtbarer Webseite und ausgefallenen Aktionen: Die Web-Erweiterung liefert statische Dateien im Web-Prozess aus. Sie wird für eine passend konfigurierte, aktivierte LOEWE-Instanz geladen und verlangt dafür keinen erfolgreichen Start des LOEWE-Prozesses. Ohne diesen Prozess können `getEpgGuide` und die Fernbedienungsnachrichten jedoch nicht beantwortet werden. Eine sichtbare Auswahl- oder EPG-Seite ist daher kein Nachweis, dass die zugehörige TV-Instanz läuft.

Quelle zur getrennten Web-Auslieferung: [ioBroker.web, `getExtensionsAndSettings()` und Laden der Erweiterungen](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts) sowie `lib/web-extension.js` dieses Adapters.

## Umfang der Wiederherstellung

Die Korrektur beschränkt sich auf die Startvoraussetzung und ihre begleitenden Prüfungen und Angaben. Es erfolgt **keine vollständige Rückkehr zu 0.1.19**. Insbesondere bleibt der Schutz gegen die zuvor gemeldete Antwort „Datei index.html nicht gefunden“ unter `/loewe-tv/` bestehen.

Der Laufzeitcode für EPG, Fernbedienung und Web-Auslieferung entspricht weiterhin 0.1.20. Senderzuordnungen, TV-Konfiguration, ausgewählte Web-Instanzen, gespeicherte Programmdaten und Aufnahmevormerkungen werden durch diese Korrektur nicht migriert oder gelöscht. Neue TV-Verbindungswege oder Befehlsprotokolle werden nicht eingeführt.

Beim regulären URL-Update übernimmt js-controller 7.2.5 die neuen `common`-Angaben in die vorhandenen Instanzen dieses Hosts. `extendCommon()` ersetzt Array-Felder vollständig; damit wird auch das Array `globalDependencies` auf den wiederhergestellten Wert gesetzt. Vorhandene `native`-Werte werden separat beibehalten. Eine manuelle Bearbeitung der Instanzobjekte ist für diese Rücknahme nicht erforderlich. Quelle: [`setupUpload.ts`, `extendCommon()` und `_upgradeAdapterObjectsHelper()`](https://github.com/ioBroker/ioBroker.js-controller/blob/e4c842b9056eb5b0b18bb56e70611821ecb3cc80/packages/cli/src/lib/setup/setupUpload.ts).

Ein Admin-Update ist für diese Wiederherstellung **nicht erforderlich**. Die höhere Admin-Version bleibt allenfalls für den dort korrigierten Linkaufbau relevant. Sie ist keine Startvoraussetzung des LOEWE-Adapters mehr.

## Verbleibendes Verhalten der Instanz-Pfeile

**0.1.22 verspricht nicht, die Instanz-Pfeile eines älteren Admin zu reparieren.** Verliert Admin beim Erzeugen des Links weiterhin die TV-Nummer, bleibt der allgemeine Aufruf `/loewe-tv/` bei zwei Fernsehern eine Auswahlseite. Ein solcher Aufruf enthält nicht die Information, welcher Instanz-Pfeil angeklickt wurde. Der Adapter darf daraus keinen Fernseher erraten.

Die folgenden eindeutigen Adressen führen auf der vom Nutzer genannten Web-Adresse direkt zur jeweiligen TV-Seite:

| Instanz | Direkte EPG-Adresse |
| --- | --- |
| `loewe-tv.0` | `http://192.168.178.24:8083/loewe-tv.0/epg.html` |
| `loewe-tv.1` | `http://192.168.178.24:8083/loewe-tv.1/epg.html` |

Diese Adressen setzen voraus, dass beide LOEWE-Instanzen die unter dieser Adresse erreichbare Web-Instanz ausgewählt haben. Sie sind bereits vorhandene instanzbezogene Routen. Für Cloud-Zugriff gelten die entsprechenden Pfade innerhalb des bestehenden Cloud-Zugangs; eine private LAN-Adresse ist dafür kein Ersatz.

Der offizielle [Admin-Fix ab 8.0.22](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22) erhält Pfad und Instanznummer. Seine Verfügbarkeit wird hier dokumentiert, ohne ein Update zur Voraussetzung für EPG oder Fernbedienung zu machen. Ein tatsächlich älterer oder im Browser noch geladener alter Admin-Linkaufbau wird durch die Installation von 0.1.22 nicht ersetzt.

## Prüfung und Grenzen

Ausgeführt mit Node.js **24.19.0**:

- **`npm test`: 832 Tests bestanden**, keine Fehler und keine übersprungenen Tests.
- **`npm run check`: erfolgreich**, einschließlich Paketmetadaten, Admin-Übersetzungen, JavaScript-Syntax, 94 Objektdefinitionen und vorhandenem Protokollvertrag.
- **52 Laufzeit- und Oberflächendateien** aus `main.js`, `lib/` und `admin/` stimmen bytegenau mit dem veröffentlichten Paket 0.1.20 überein. Ausgenommen ist nur die aktualisierte Build-Kennung. Die Adaptermetadaten entsprechen ebenfalls 0.1.20, abgesehen von Versionsnummer und Änderungshistorie.
- Die **acht bestehenden Admin-Linktests** bestehen mit der zurückgenommenen Mindestversion. Der Fall für den originalen Admin 8.0.14 erwartet ausdrücklich den allgemeinen Einstieg und folgt beiden dortigen TV-Links bis zur jeweils passenden EPG-HTML-Datei. Die korrigierten Admin-Resolver werden weiterhin getrennt geprüft.
- **`git diff --check`: erfolgreich**.

Zusätzlich wurden die originalen Funktionen `checkVersion()` und `checkVersions()` des js-controller 7.2.5 in einer isolierten Umgebung ausgeführt. Die Objektabfrage, Protokollierung und Aufbereitung des vorgegebenen Abhängigkeitsarrays sind dabei Testersatzfunktionen; es wird keine laufende ioBroker-Installation gestartet. **20 Kombinationen** aus fünf Admin-Versionen, beiden Abhängigkeiten und beiden TV-Instanzen ergaben:

| Installierter Admin in der Prüfumgebung | Prüfung mit `>=8.0.22` aus 0.1.21 | Prüfung mit `>=7.7.28` aus 0.1.22 |
| --- | --- | --- |
| 7.7.28 | Fehler | bestanden |
| 8.0.14 | Fehler | bestanden |
| 8.0.21 | Fehler | bestanden |
| 8.0.22 | bestanden | bestanden |
| 8.3.0 | bestanden | bestanden |

Die Tabelle gilt jeweils für `loewe-tv.0` und `loewe-tv.1`. Die bestehenden Oberflächentests allein hatten die durch die neue Abhängigkeit entstehende Startsperre nicht abgedeckt. Diese zusätzliche Prüfung untersucht deshalb ausdrücklich den Controller-Vertrag, der dem eigentlichen Adapterstart vorausgeht.

Der Versionsvergleich und die Controller-Analyse ersetzen keinen Test in der laufenden Nutzerinstallation. Es wurde nicht auf den privaten ioBroker-Rechner oder die Fernseher zugegriffen. Ein erfolgreicher Gesamtstart, geladene echte Programmdaten, eine tatsächlich ausgeführte Fernbedienungstaste und der Cloud-Zugriff müssen nach dem Update dort bestätigt werden.

## Kontrolle nach dem Update

1. Beide LOEWE-Instanzen starten und den Zustand `system.adapter.loewe-tv.N.alive` prüfen. `info.adapterBuild` muss bei beiden Instanzen `0.1.22-recovery.1` anzeigen. Eine vorhandene alte Build-Angabe allein beweist keinen aktuellen Prozessstart.
2. Die zugeordnete Web-Instanz neu starten und die EPG-Seite im Browser vollständig neu laden.
3. Zunächst die beiden eindeutigen EPG-Adressen aus der Tabelle öffnen. Für jede Instanz prüfen, ob Daten geladen werden und eine Fernbedienungstaste am zugehörigen TV reagiert.
4. Falls die Daten oder Befehle weiterhin ausfallen, die aktuellen Startmeldungen der betroffenen Instanz und den genauen Fehlertext der EPG-Seite prüfen. Dann liegt eine zusätzliche oder andere Ursache vor; weitere Umbauten dürfen nicht allein aus dem hier nachgewiesenen möglichen Startblock abgeleitet werden.

[Update-Anleitung](INSTALLATION.md) · [Linkverhalten](ADMIN_LINKS.md) · [Fernbedienung](REMOTE_CONTROL.md)
