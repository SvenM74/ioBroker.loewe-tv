# Installation und Bedienung

Diese Anleitung gilt für **Version 0.1.21**, Build **`0.1.21-direct-links.1`**. Sie beschreibt Installation, Update, die Programmübersicht mit Senderlogos und Fernbedienung, die Web-Adapter-Auswahl für lokalen und Cloud-Zugriff, Aufnahmevormerkungen, Netzwerksuche und TV-Steuerung. Der Adapter liest Programminformationen vom Fernseher und auf Wunsch aus einer konfigurierten XMLTV-Quelle. [XMLTV und Senderzuordnung](EPG_XMLTV.md) erklären die Einrichtung bei ausgeschaltetem TV. Die bestätigten Geräte stehen in der [README](../README.md#getestete-geräte).

## Voraussetzungen

- Node.js ab **22**.
- ioBroker js-controller ab **6.0.11** und Admin ab **8.0.22**.
- Ein Loewe-Fernseher, der die Tablet-Schnittstelle auf TCP-Port **905** anbietet.
- Eine Netzwerkverbindung vom ioBroker-Rechner zum Fernseher. Zum Einrichten den Fernseher einschalten.
- Für Einschalten aus dem Standby: **Schnellstart am Fernseher aktivieren**, eine passende TV-MAC-Adresse und Unterstützung für Wake-on-LAN im Fernseher und im Netzwerk. Ohne Schnellstart ist das Einschalten per Datenpunkt laut [Gerätetest](COMPATIBILITY.md#einschalten-aus-dem-standby) nicht möglich.

Die TV-Steuerung arbeitet lokal. Externe XMLTV-Quellen und Logo-Adressen benötigen den jeweiligen Netzwerkzugang. Für die Installation kann ioBroker benötigte Node.js-Abhängigkeiten aus dem Internet nachladen. Das lokale `.tgz`-Paket ist deshalb keine Zusage einer vollständig netzlosen Installation.

## Installationspaket aus dem Quellcode erzeugen

Der Quellcode steht im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv). Du kannst das Paket mit den folgenden Schritten selbst erzeugen. Wenn du **`iobroker.loewe-tv-0.1.21-direct-links.1.tgz`** bereits erhalten hast, verwende diese Datei direkt für die anschließende Update- oder Erstinstallationsanleitung.

Zum Erzeugen des Pakets brauchst du Git und Node.js ab 22. Öffne ein Terminal in einem eigenen Arbeitsverzeichnis und führe aus:

```bash
git clone https://github.com/SvenM74/ioBroker.loewe-tv.git
cd ioBroker.loewe-tv
npm install
npm test
npm pack
mv iobroker.loewe-tv-0.1.21.tgz iobroker.loewe-tv-0.1.21-direct-links.1.tgz
```

`npm pack` erzeugt zunächst **`iobroker.loewe-tv-0.1.21.tgz`**. Der letzte Befehl ergänzt die Build-Kennung im Dateinamen zu **`iobroker.loewe-tv-0.1.21-direct-links.1.tgz`**. Prüfe vor dem Erzeugen in `lib/build-info.js`, dass die Build-Kennung **`0.1.21-direct-links.1`** enthalten ist. Kopiere anschließend das neue Archiv auf den ioBroker-Rechner.

<a id="update-auf-018"></a>
<a id="update-auf-019"></a>
<a id="update-auf-0110"></a>
<a id="update-auf-0111"></a>
<a id="update-auf-0112"></a>
<a id="update-auf-0113"></a>
<a id="update-auf-0114"></a>
<a id="update-auf-0115"></a>
<a id="update-auf-0116"></a>
<a id="update-auf-0117"></a>
<a id="update-auf-0118"></a>
<a id="update-auf-0119"></a>
<a id="update-auf-0120"></a>

## Update auf 0.1.21

**Aktueller Stand: Version 0.1.21, Build `0.1.21-direct-links.1`.** Der Adapter verlangt jetzt **Admin ab 8.0.22**, damit jeder Pfeil in der Instanzübersicht ohne TV-Auswahl die zugehörige Programmübersicht öffnet. Die TV-Nummer bleibt durch den veröffentlichten Admin-Fix im Link enthalten. Die bestehende Web-Erweiterung führt diesen Aufruf direkt zur passenden `/loewe-tv.N/epg.html`. [Linkanleitung](ADMIN_LINKS.md).

**Vor dem LOEWE-Update den installierten Admin-Stand prüfen.** Bei einer älteren Version Admin zuerst auf **8.0.22 oder neuer** aktualisieren. `iobroker upgrade admin` installiert die im konfigurierten Repository angebotene Version. Soll gezielt der erste korrigierte Stand installiert werden, unterstützt der js-controller auch `iobroker upgrade admin@8.0.22`. Eine bereits neuere Admin-Version beibehalten. Anschließend den tatsächlichen Versionsstand kontrollieren und die Admin-Seite mit **Strg+F5** vollständig neu laden. [Offizieller Admin-Fix](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22) · [CLI mit Versionsangabe im js-controller 7.2.5](https://github.com/ioBroker/ioBroker.js-controller/blob/e4c842b9056eb5b0b18bb56e70611821ecb3cc80/packages/cli/src/lib/setup/setupUpgrade.ts).

Unter **EPG-Einstellungen** erscheint die gespeicherte TV-Liste automatisch als Zuordnungstabelle. **Quelle laden und Zuordnung prüfen** lädt die XMLTV-Auswahl. Pro TV-Sender **Automatisch**, **Manuell** oder **Deaktiviert** wählen; in manuellen Zeilen steht die suchbare XMLTV-Auswahl direkt daneben. Erst **Speichern** übernimmt geänderte Einstellungen für den laufenden Adapter. Pro TV die eigene gespeicherte Senderliste verwenden. Bei automatischem Abrufintervall `0` muss auch XMLTV ausdrücklich über **EPG aktualisieren** geladen werden.

Die XMLTV-Tabelle und quadratischen Senderlogos aus 0.1.19, die gewählte Web-Instanz und die Korrektur doppelter Web-/Cloud-Kacheln aus 0.1.16 bleiben erhalten. Die neue Mindestversion schließt die Admin-Stände mit dem nachgewiesenen Pfadverlust aus. Das LOEWE-Paket selbst verändert keinen installierten Admin-Code. Für einen unerreichbaren Web-Host siehe [direkter Zugang](ADMIN_LINKS.md).

### Update direkt aus GitHub installieren

Version 0.1.21 ist im Hauptzweig `main` verfügbar. Die bestehende Instanz kann direkt über die normale GitHub-Projektadresse aktualisiert werden:

```bash
iobroker stop loewe-tv.0
iobroker url "https://github.com/SvenM74/ioBroker.loewe-tv" loewe-tv
iobroker start loewe-tv.0
```

Prüfe danach `loewe-tv.0.info.adapterBuild`: Der Wert muss **`0.1.21-direct-links.1`** sein. Starte die ausgewählte Web-Instanz neu, damit sie die installierten EPG-Dateien ausliefert. Lade anschließend die EPG-Seite vollständig neu; am Desktop beispielsweise mit **Strg+F5**. Eine bereits funktionierende Web-/Cloud-Zuordnung weiterverwenden. Bei erstmaliger Einrichtung steht die Auswahl unter **Web-Zugriff → Web-Adapter für die Programmübersicht**. Die vorhandenen Aufnahmeaufträge und ihr Schutz vor erneutem Versand bleiben erhalten. Die Implementierung der GitHub-Installationsangabe ist im [offiziellen ioBroker-Installer](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts) dokumentiert.

Bei **zwei TV-Instanzen auf demselben Host** beide vor dem Paketupdate stoppen und anschließend wieder starten. Das Paket muss auf diesem Host nur einmal aktualisiert werden:

```bash
iobroker stop loewe-tv.0
iobroker stop loewe-tv.1
iobroker url "https://github.com/SvenM74/ioBroker.loewe-tv" loewe-tv
iobroker start loewe-tv.0
iobroker start loewe-tv.1
```

Prüfe die Build-Kennung bei beiden Instanzen und starte danach die tatsächlich ausgewählte Web-Instanz neu. Öffne jeweils die zugehörige EPG-Seite; die Fernbedienung nennt im Kopf `loewe-tv.0` beziehungsweise `loewe-tv.1`. Bei mehreren ioBroker-Hosts muss das neue Paket auf den beteiligten Adapter-/Web-Hosts verfügbar sein.

### Doppelte Web-/Cloud-Kacheln bei zwei Fernsehern bereinigen

Die Kombination aus **Loewe TV · Programmübersicht (0)/(1)** mit `loewe-tv.N/epg.html` und zusätzlichen **Programmübersicht.0/.1**-Kacheln mit `adapter/loewe-tv/...` entsteht durch zwei Linkquellen für dieselben TV-Instanzen. Die zweite Quelle wird mit 0.1.16 aus dem Web-Import entfernt. Das reguläre URL-Update ersetzt die alten `common.localLinks` sowohl im Adapterobjekt als auch in den vorhandenen Instanzen auf diesem Host vollständig; es ist keine manuelle Löschung von Instanzen oder Objekten nötig. Gespeicherte Werte wie `native.webInstance` bleiben erhalten. [Metadatenübernahme im js-controller 7.2.5](https://github.com/ioBroker/ioBroker.js-controller/blob/e4c842b9056eb5b0b18bb56e70611821ecb3cc80/packages/cli/src/lib/setup/setupUpload.ts).

Für zwei vorhandene Instanzen auf demselben ioBroker-Host:

```bash
iobroker stop loewe-tv.0
iobroker stop loewe-tv.1
iobroker url "https://github.com/SvenM74/ioBroker.loewe-tv" loewe-tv
iobroker start loewe-tv.0
iobroker start loewe-tv.1
```

Prüfe bei **beiden** Instanzen `info.adapterBuild = 0.1.21-direct-links.1`. Starte danach gezielt die Web-Instanz neu, die in LOEWE-TV und Cloud ausgewählt ist. Wenn das `web.0` ist:

```bash
iobroker restart web.0
```

Bei einer anderen Auswahl den tatsächlichen Instanznamen verwenden. Das lädt die Web-Erweiterung und ihre Startseite neu. Öffne anschließend die Cloud-Web-Startseite erneut; bei einer bereits offenen Browseransicht vollständig neu laden. Erwartet werden genau die beiden LOEWE-Webkacheln für die zwei TVs, zusätzlich zu den Einträgen anderer Adapter.

Ein normales erfolgreiches URL-Update enthält den Datei-Upload und die Metadatenübernahme bereits. Falls das neue Paket installiert ist, die Metadatenübernahme aber unterbrochen wurde, kann sie mit `iobroker upload loewe-tv` vollständig wiederholt werden; danach die ausgewählte Web-Instanz neu starten. Dieser Befehl installiert selbst keine neue Version. Bei mehreren ioBroker-Hosts muss das Paket auf jedem betroffenen Adapter-Host aktualisiert werden. Die funktionierende Web-/Cloud-Zuordnung muss für diese Korrektur nicht geändert werden.

### Update über eine Paketdatei

**Für das Update das neue Paket installieren; ein Neustart allein übernimmt die neuen Funktionen nicht.** Die vorhandene Instanz weiterverwenden. Erzeuge das Paket aus dem aktuellen Quellcode wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende das bereitgestellte Archiv **`iobroker.loewe-tv-0.1.21-direct-links.1.tgz`**. Kopiere es auf den ioBroker-Rechner, beispielsweise nach `/tmp`, und führe aus:

```bash
iobroker stop loewe-tv.0
iobroker compact loewe-tv.0 disable
iobroker url /tmp/iobroker.loewe-tv-0.1.21-direct-links.1.tgz loewe-tv
iobroker start loewe-tv.0
```

Der Compact-Befehl betrifft die Instanz `loewe-tv.0`. Ab Version 0.1.1 läuft der Adapter in einem eigenen Prozess; das gilt auch für 0.1.21. Die Umstellung erfolgt vor dem Paketupdate, damit sie auch bei einer vorhandenen Instanz wirksam wird. Die Syntax ist in der [offiziellen ioBroker-CLI-Dokumentation](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md) beschrieben. Verbindungs- und Einschalteinstellungen bleiben erhalten. **Eine bereits in 0.1.6 gespeicherte Senderlistenauswahl bleibt erhalten.** Beim Update von einem älteren Stand muss die Liste einmal in der Konfiguration ausgewählt werden; ein früherer Wert in `channels.view` wird nicht automatisch übernommen.

Beim Start werden **`loewe-tv.0.channels.radio`**, **`loewe-tv.0.api`** und **`loewe-tv.0.media`** einschließlich ihrer Unterobjekte sowie `remote.radio_mode_on` und `channels.mediaType` entfernt. Das gilt auch für verwaiste Kinder, deren oberster Ordner bereits fehlt. Alte Radioeinträge aus dem gespeicherten Katalog erzeugen keine neuen Radioordner. Schreibbefehle an entfernte Datenpunkte lösen keine Adapterfunktion mehr aus. `remote.tv_mode_on` und `remote.text` für Teletext bleiben verfügbar.

Lade nach dem Update die Admin-Seite vollständig neu, beispielsweise mit **Strg+F5**, und öffne die Instanzeinstellungen erneut. Im Reiter **Verbindung** bleibt die Fernseher-Suche verfügbar. Du kannst die bisherige TV-Adresse unverändert weiterverwenden oder [einen Fernseher suchen und auswählen](#fernseher-suchen-und-auswählen). Aktivierung und Abrufintervall stehen jetzt unter **EPG-Einstellungen**; die vollständige Vorschau hat den eigenen Reiter **Programmübersicht**. Dafür muss die Instanz laufen; die Vorschau zeigt die gespeicherte Konfiguration. Eine vorhandene Senderlistenauswahl weiterverwenden; andernfalls bei eingeschaltetem TV die gewünschte Senderliste wählen und speichern. Die Anleitung steht unter [TV-Senderliste auswählen](#tv-senderliste-auswählen). Prüfe anschließend **`info.adapterBuild = 0.1.21-direct-links.1`**. Fehlt dieser Wert oder steht dort eine ältere Kennung, prüfe Paketinstallation und Startprotokoll. Das Startprotokoll enthält die Build-Kennung bereits vor der Bereinigung. Bleiben entfernte globale Objekte wegen eines Datenbankfehlers oder Löschschutzes stehen, meldet der Adapter einen Bereinigungsfehler und setzt die Senderanlage nicht fort.

**Beim Update von einem Stand mit Namens-IDs bleiben die TV-Senderpfade erhalten.** Nur beim Wechsel von älteren Hash- oder Nummernordnern ändern sich die IDs einmalig: Aus `channels.tv.service_<Hash>` aus 0.1.3 oder `channels.tv.1` aus dem ersten 0.1.4-Stand werden Ordner wie `channels.tv.Das_Erste_HD`. Passe vorhandene Skripte, Aliase und Visualisierungen an, wenn sie noch auf diese alten IDs verweisen. Anschließend bleibt der Pfad beim Umsortieren erhalten: Verschiebst du Das Erste HD am TV von Platz 1 auf Platz 7, verwendet `channels.tv.Das_Erste_HD.select` nach dem Abgleich dessen neuen Programmplatz. Eine tatsächliche Änderung des Sendernamens führt dagegen zu einer neuen Namens-ID.

Wiederherstellung und Migration übernehmen ausschließlich Daten, die zur konfigurierten Listenkennung gehören. Dafür werden der gespeicherte Katalog und verwaltete TV-Senderordner verwendet. Mehrere Plätze desselben Dienstes werden in einem Senderordner zusammengefasst; der kleinste gültige Programmplatz ist die bevorzugte Position für Anzeige und Auswahl. Normale verwaltete Ordner anderer Listen werden beim Start entfernt, auch wenn der TV nicht erreichbar ist. Ohne gewählte Liste wird kein TV-Senderbestand aktiviert. Benutzerdefinierte Unterobjekte, `common.custom` und Löschschutz bleiben beim TV-Abgleich erhalten; betroffene Altordner bleiben deaktiviert bestehen.

Schalte den TV ein, speichere die gewünschte Liste in der Konfiguration und schreibe bei Bedarf `channels.refresh=true` mit `ack:false`. Der Adapter fragt diese Liste mit dem festen Filter `video` ab und übernimmt ausschließlich TV-Sender. Sobald `channels.refreshStatus=ready` und `channels.catalogStatus=ready` stehen, kannst du beispielsweise `channels.tv.Das_Erste_HD.select` prüfen. Die Struktur und die Bedeutung der Statuswerte stehen unter [TV-Sender einzeln anwählen](#tv-sender-einzeln-anwählen). Eine Senderwahl setzt einen erreichbaren Fernseher voraus und startet keinen eigenen Einschaltablauf.

Das Einschalten per Datenpunkt ist laut [Nutzerrückmeldung vom 18. Oktober 2026](COMPATIBILITY.md#einschalten-aus-dem-standby) bei aktiviertem Schnellstart möglich. [Ein- und Ausschalten](#ein--und-ausschalten) beschreibt den Test mit `control.powerOn` und `info.powerOn`. Für eine Diagnose ohne reguläre Status-, Sender- und EPG-Abfragen **alle drei Intervalle**, `pollInterval`, `channelRefreshInterval` und `epgRefreshInterval`, auf 0 setzen. Bereits vorgemerkte Aufnahmeaufträge prüfen die Erreichbarkeit unabhängig davon weiter. Ohne solche Aufträge bleibt `info.connection` nach dem Start zunächst `false`, bis eine erfolgreiche manuelle TV-Abfrage oder ein Befehl die Verbindung bestätigt.

### Datenpunktbereinigung beim Update

Der Adapter entfernt die folgenden bisherigen Datenpunkte. Passe Skripte, Aliase oder Visualisierungen an, wenn sie darauf zugreifen. Die Senderordner mit Namens-IDs und ihre `select`-Taster bleiben erhalten.

| Bisherige Datenpunkte | Aktueller Zugriff |
|---|---|
| `info.lastResponse`, `status.volumeRaw` | `info.lastError`, `info.lastCommand`, die jeweiligen Geräte- und Wiedergabedaten sowie die TV-Lautstärke in `status.volume`. |
| `channels.start`, `channels.listStart`, `channels.count`, `channels.getLists`, `channels.getChannels` | Die Liste in Admin auswählen und mit `channels.refresh` vollständig abgleichen. |
| `channels.lists`, `channels.items`, `channels.entries`, `channels.availableLists` | Listenwahl in Admin; aufbereiteter Senderbestand in `channels.catalog` und unter `channels.tv`. |
| `channels.totalNumber`, `channels.returnedNumber`, `channels.nextStart`, `channels.nextListStart`, `channels.lastUpdate`, `channels.lastError` | Ergebnis des vollständigen Abrufs in `channels.refreshCount`, `channels.refreshLastUpdate`, `channels.refreshStatus` und `channels.refreshError`. |
| Je Sender: `numbers`, `locators`, `listView` | Zusammengehörende Programmplätze und Locators in `positions`; Listenkennung in `channels.view` oder im JSON-Feld `channel.listView` von `epg.data`. |
| Je Sender: `epg.source`, `epg.sourceChannelId` | Der TV-Senderbezug steht im JSON-Feld `channel` von `epg.data`. Bei aktivem XMLTV zeigen `source` und `xmltvMapping` darin zusätzlich die Herkunft und Zuordnung; die alten Einzelzustände werden nicht wieder angelegt. |
| Je Sender: `epg.now.endEstimated`, `epg.next.endEstimated` | `end` enthält die gelieferte Endzeit. Fehlende Endzeiten werden nicht geschätzt. |

Die sieben entfernten Kinddatenpunkte je Sender werden nur gelöscht, wenn sie als vom Adapter verwaltet erkennbar sind. Eigene oder geänderte Objekte, `common.custom`, `common.dontDelete` und geschützte Eltern werden berücksichtigt. Geschützte frühere Kinddatenpunkte können deshalb mit einer Warnung erhalten bleiben, werden aber nicht weiter aktualisiert. Die neue Oberfläche benötigt keine manuelle Bereinigung alter EPG-Konfigurationswerte. Zum übernommenen TV-Cache und den verworfenen alten Fremddaten siehe [Verhalten bei Standby, Neustart und Senderänderungen](EPG.md#verhalten-bei-standby-neustart-und-senderänderungen).

## Erstinstallation aus der Paketdatei

1. Erzeuge **`iobroker.loewe-tv-0.1.21-direct-links.1.tgz`** wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende eine bereits erhaltene Paketdatei dieser Version. Die Datei nicht entpacken.
2. Kopiere sie auf den Rechner, auf dem ioBroker läuft, beispielsweise nach `/tmp/iobroker.loewe-tv-0.1.21-direct-links.1.tgz`.
3. Öffne dort ein Terminal oder eine SSH-Verbindung und führe aus:

```bash
iobroker url /tmp/iobroker.loewe-tv-0.1.21-direct-links.1.tgz loewe-tv
```

4. Lege beim ersten Installieren eine Instanz an:

```bash
iobroker add loewe-tv
```

5. **Aktiviere die Instanz `loewe-tv.0`** in der Instanzübersicht. Neue Instanzen werden zunächst deaktiviert angelegt. Ab 0.1.9 kannst du sie bereits mit leerer TV-Adresse starten, um die Suche zu nutzen. Solange keine gültige Adresse gespeichert ist, bleibt `info.connection=false` und die TV-Steuerung wartet auf die Konfiguration.
6. Schalte den Fernseher ein. Öffne **Instanzen → loewe-tv.0 → Einstellungen → Verbindung**, betätige **Fernseher suchen** und wähle deinen TV unter **Gefundene Fernseher** aus. Die IP-Adresse erscheint im Feld **Adresse des Fernsehers**. Alternativ kannst du sie dort von Hand eintragen. Speichere die Konfiguration. Für die Suche ist keine vorläufige oder erfundene Adresse nötig.
7. Öffne die Einstellungen nach dem Neustart der Instanz erneut und wähle die gewünschte **TV-Senderliste** wie unten beschrieben. Speichere die Konfiguration.
8. Öffne **Objekte → loewe-tv.0**. Bei erreichbarem Fernseher und aktivierten automatischen Abfragen sollte `info.connection` auf `true` wechseln. Sind alle drei Abfrageintervalle auf 0 gesetzt, stattdessen `control.refresh = true` auslösen. Mit `remote.home = true` lässt sich anschließend der erste Tastendruck testen; `channels.refresh = true` lädt die vollständige konfigurierte Senderliste.

Der Pfad hinter `iobroker url` muss auf dem ioBroker-Rechner existieren und für die Installation lesbar sein. Ein Downloadpfad auf deinem Handy oder PC genügt nicht. Bei Docker muss die Datei innerhalb des ioBroker-Containers erreichbar sein und der Befehl dort ausgeführt werden. Verwende auf anderen Systemen den entsprechenden absoluten Pfad.

Für das Update einer bestehenden Installation die Anleitung oben verwenden. Eine zusätzliche Instanz ist dafür nicht erforderlich. Lade die Admin-Seite nach dem Update neu, falls noch die bisherige Konfigurationsmaske angezeigt wird.

Diese Installation verwendet den ioBroker-Befehl für eine eigene Paketquelle. Der offizielle js-controller reicht die Paketdatei an seinen Paketinstaller weiter und übernimmt danach die Adapterdateien und Objektdefinitionen. Siehe [ioBroker-Installationscode](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts).

## Konfiguration

### Verbindung und Senderlisten

| Einstellung | Standard | Bedeutung |
|---|---:|---|
| Fernseher suchen | manuell | Startet die begrenzte Suche im lokalen Netzwerk vom ioBroker-Rechner aus. Die Instanz muss aktiviert sein; eine TV-Adresse muss dafür noch nicht gespeichert sein. |
| Gefundene Fernseher | keine Auswahl | Zeigt die gefundenen IPv4-Adressen mit Gerätename beziehungsweise Modell. Die Auswahl kopiert die IP-Adresse in das Adressfeld; erst Speichern übernimmt sie für die Instanz. Die Trefferliste selbst wird nicht als Einstellung gespeichert. |
| Adresse des Fernsehers | leer | IP-Adresse oder Hostname des TVs, ohne `http://`, Pfad oder Port. Kann aus der Suche übernommen oder von Hand eingetragen werden. Eine feste DHCP-Zuordnung im Router ist hilfreich. |
| TV-Senderliste (`channelListView`) | keine Auswahl | Verbindliche Senderliste für `channels.tv`. Die Auswahlliste wird vom laufenden Adapter am eingeschalteten TV abgefragt. Ohne Auswahl werden keine TV-Sender aktiviert. |
| Statusintervall (`pollInterval`) | 30 Sekunden | 0 deaktiviert automatische Statusabfragen einschließlich der Statusabfrage beim Start. Andernfalls sind ganze Werte von 5 bis 3.600 Sekunden möglich. Die Senderaktualisierung hat ein eigenes Intervall. Manuelle Befehle und `control.refresh` bleiben verfügbar. |
| Senderlistenintervall (`channelRefreshInterval`) | 300 Sekunden | Lädt die gewählte Senderliste automatisch beim Start beziehungsweise nach bestätigter Wiederverbindung und danach im eingestellten Abstand neu. 0 deaktiviert diese Automatik; sonst sind ganze Werte von 60 bis 86.400 Sekunden möglich. `channels.refresh` bleibt manuell verfügbar. |
| Maximale Lautstärke bei direkten Befehlen | 99 | Obergrenze für `control.volume`. Für den Alltag kann hier beispielsweise 40 stehen. Fernbedienungstasten und Änderungen direkt am TV werden dadurch nicht begrenzt. |
| Aktuelle Wiedergabe abfragen | aktiviert | Fragt bei Statusabfragen zusätzlich die aktuelle Wiedergabe ab, auch bei einem manuellen `control.refresh`. Bei einem Modell ohne Unterstützung für `GetCurrentPlayback` deaktivieren. |

### Fernseher suchen und auswählen

1. Die Fernseher einschalten und die Instanz in der ioBroker-Instanzübersicht aktivieren. Eine neu angelegte Instanz darf dafür noch eine leere TV-Adresse haben.
2. **Instanzen → loewe-tv.0 → Einstellungen → Verbindung** öffnen und **Fernseher suchen** anklicken. Die Suche dauert einige Sekunden und beginnt nur auf diesen Tastendruck.
3. **Gefundene Fernseher** öffnen. Die Liste zeigt alle innerhalb des Suchlaufs erkannten Loewe-TV-Adressen, beispielsweise mit dem Gerätenamen und der Modellangabe. Mehrfachantworten derselben IP-Adresse ergeben nur einen Eintrag.
4. Den gewünschten Eintrag wählen. Seine IPv4-Adresse wird in **Adresse des Fernsehers** übernommen. Du kannst dieses Feld weiterhin von Hand ändern.
5. **Speichern** oder **Speichern und schließen** betätigen. Erst dann verwendet die Instanz die neue Adresse. Anschließend bei einem anderen TV auch dessen gewünschte Senderliste auswählen.

Für zwei oder mehr Fernseher jeweils eine eigene Instanz verwenden, beispielsweise `loewe-tv.0` und `loewe-tv.1`, und darin die passende Adresse wählen. Jede Instanz kann dieselben erreichbaren TVs finden, steuert aber jeweils nur den gespeicherten TV. Hat ein Fernseher gleichzeitig unterschiedliche LAN- und WLAN-Adressen, können beide erscheinen; die Trefferzahl zählt Adressen, nicht zwingend unterschiedliche Geräte.

Die Suche läuft auf dem ioBroker-Rechner. Netztrennung, blockiertes Multicast oder die Netzwerkeinstellungen eines Containers können Treffer verhindern. Ohne aktive Netzwerkfunktionen ist ein TV nicht auffindbar; zum Einrichten einschalten und für den späteren Standby-Betrieb die [Schnellstart-Hinweise](#einschalten) beachten. Eine erfolglose Suche löscht weder die eingetragene TV-Adresse noch andere Einstellungen. Die manuelle Eingabe bleibt verfügbar.

Ein Treffer belegt die Erkennung als Loewe-TV. Die zusätzliche Prüfung des Steuerports, standardmäßig **905**, ist noch kein Nachweis für eine erfolgreiche Anmeldung oder vollständige Kompatibilität. Ein nicht erreichbarer Steuerport wird beim Treffer angezeigt. Der **Connect 26 SL / MB180** bleibt für diesen Adapter nicht unterstützt. Bedienung, Grenzen und Protokollnachweise stehen unter [Netzwerksuche](NETWORK_DISCOVERY.md).

### TV-Senderliste auswählen

1. Den Fernseher einschalten. Seine Adresse und den Steuerport in der Adapter-Konfiguration speichern und die Instanz aktivieren.
2. **Instanzen → loewe-tv.0 → Einstellungen → Senderlisten** öffnen. Im Feld **TV-Senderliste** lädt der Adapter die verfügbaren Senderlisten vom TV. Mit **Senderlisten neu laden** kannst du den Abruf wiederholen.
3. Die gewünschte Liste auswählen, beispielsweise **ASTRA LCN** oder eine eigene Favoritenliste, und **Speichern und schließen** wählen.
4. Der nächste vollständige Abgleich bildet ausschließlich diese Liste unter **`loewe-tv.0.channels.tv`** ab. Bei deaktivierter Senderautomatik einmal `channels.refresh=true` auslösen.

Die Auswahl verwendet die vom Fernseher gelieferte Listenkennung. Gleichnamige Listen lassen sich über ihre Kennung unterscheiden. Es werden auch weitere Antwortseiten und leere Senderlisten berücksichtigt. Reine `avlist`-Eingangslisten gehören nicht zu den Senderlisten. Die Listenabfrage verändert die gespeicherte Auswahl nicht; erst das Speichern der Konfiguration legt eine andere Liste fest.

Bei einer Erstinstallation oder einem Update von einem Stand vor der Senderlistenkonfiguration ist die Auswahl leer. `channels.refreshStatus=notConfigured` fordert zur Auswahl auf. Ein alter Wert in `channels.view` überschreibt die Konfiguration nicht. **`channels.view` ist jetzt nur lesbar** und zeigt die konfigurierte Kennung an. Schreibbefehle an den früheren Parameter schalten nicht mehr auf eine andere Liste um.

Bei ausgeschaltetem TV, laufender TV-Synchronisierung oder einem Abruffehler zeigt die Auswahl einen Hinweis. Eine bereits eingetragene Kennung bleibt bestehen; der Adapter wählt keinen Ersatz. Wenn du Adresse oder Port noch nicht gespeichert hast, zunächst speichern und die Einstellungen erneut öffnen. Wird die gewählte Liste später am Fernseher gelöscht, wähle bewusst eine andere Liste in der Konfiguration. Das bloße Öffnen der Einstellungen schaltet den Fernseher nicht auf einen anderen Sender um.

### EPG-Einstellungen

Im Reiter **EPG-Einstellungen** stehen **Programminformationen aktivieren** und **EPG-Aktualisierung (Sekunden)**. Standard sind aktiviertes EPG und **900 Sekunden**. Die Daten kommen direkt vom TV. Bei vorhandenen TV-Senderordnern beginnt der Abruf nach dem Start automatisch. Intervall `0` deaktiviert auch diesen Erstabruf; **`channels.epgRefresh=true`** startet bei aktiviertem EPG weiterhin einen manuellen Abgleich. Zulässig sind `0` oder ganze Werte von 300 bis 86.400 Sekunden. Änderungen werden nach dem Speichern wirksam. Die [EPG-Anleitung](EPG.md) erklärt Datenfelder, Cache und Statuswerte.

### Programmübersicht und Aufnahmevormerkungen

Der eigene Reiter **Programmübersicht** enthält die TV-Sender der gespeicherten Liste mit Zeitachse und Sendungsdetails. Öffnen, Suchen und Blättern verwenden den vorhandenen Cache. **EPG aktualisieren** startet den manuellen TV-Abgleich im Hintergrund.

Wähle eine Sendung und betätige **Jetzt ansehen**, um auf ein aktuell eindeutig laufendes Programm umzuschalten. Der Adapter prüft die Zeit nochmals direkt vor dem Befehl. Für eine zukünftige Sendung öffnet **Aufnahme planen** einen Dialog; erst **Aufnahme vormerken** legt den dauerhaften Auftrag an. Ohne bekannte, eindeutige Start- und Endzeiten sind diese Aktionen nicht verfügbar.

**Aufnahmeaufträge** zeigt den Stand der Übergabe. Offline-Vormerkungen warten auf einen erreichbaren TV und lösen kein Wake-on-LAN aus. Nicht rechtzeitig gesendete Aufträge werden `missed`. Bei einem offenen Timerabgleich bleibt der interne Status `uncertain`: Mit gespeicherter TV-Antwort lautet die Anzeige **An TV übertragen**, ohne Antwortnachweis **Übertragung unklar** und vor einem wegen möglicher vorhandener Timer zurückgehaltenen Sendversuch **Timerabgleich offen**. Es erfolgt kein automatischer erneuter Versand. Nur ein eindeutiger Eintrag in der TV-Timerliste führt zu `scheduled` und **Im TV geplant**.

**Jetzt ansehen / Aufnahme planen** und **EPG aktualisieren** stehen in der gemeinsamen Leiste zwischen Stundenauswahl und Sendersuche. Sender, Titel und Zeitraum bleiben kompakt sichtbar; **Sendungsdetails** öffnet die Beschreibung. Verfügbare Logos ersetzen den Sendernamen in der Tabelle, während Position und Suche erhalten bleiben. [Logoquellen](CHANNEL_LOGOS.md).

### Separater Zugriff über Admin und ioBroker.web

Die Programmübersicht ist über den Link an der Adapterinstanz und die Kachel **Loewe TV** im Admin-Schnellzugriff erreichbar. Eine typische Admin-Adresse ist `http://IOBROKER-HOST:8081/adapter/loewe-tv/epg.html?instance=0`. Sie nutzt die vorhandene Admin-Anmeldung. Der Web-Schnellzugriff behält die Bezeichnung **Loewe TV · Programmübersicht**.

Unter **Web-Zugriff → Web-Adapter für die Programmübersicht** eine vorhandene Web-Instanz auswählen, zum Beispiel `web.0`, aktivieren und speichern. Diese Web-Instanz muss ihre **integrierte Socket-Verbindung** verwenden. Beim Laden der Erweiterung kann ioBroker.web neu starten. Auf dessen Startseite erscheint **Loewe TV · Programmübersicht (0)** als Schnellzugriff. Die typische direkte Adresse lautet `http://IOBROKER-HOST:8082/loewe-tv.0/epg.html`. Host, Port, HTTPS und Proxy-Pfad richten sich nach der Web-Konfiguration. Für diesen lokalen Web-Zugriff benötigen Benutzer das Recht zum Senden von Adapter-Nachrichten.

Für **ioBroker.cloud** dieselbe Web-Instanz in der Cloud-Konfiguration auswählen. Die [Cloud-Anleitung](EPG_GUI.md#über-iobrokercloud-remote-öffnen) beschreibt dafür eine zusätzliche Instanz auf dem Host des Cloud-Adapters, nur an `127.0.0.1` gebunden. Der Fernzugriff verwendet die Cloud-Anmeldung und deren eigenen Socket-Kontext. Die lokale Programmübersicht bleibt im Reiter **Programmübersicht** der LOEWE-TV-Einstellungen verfügbar.

Die Web-Auswahl ist standardmäßig deaktiviert. Beide Zugänge verwenden dieselbe laufende TV-Adapterinstanz und ihre gespeicherten Daten. Für mehrere TVs gibt es getrennte Instanzpfade. [Ausführliche Bedienung, Zugriff und Aufnahmezustände](EPG_GUI.md).

### Einschalten

**Schnellstart direkt am Fernseher aktivieren.** Ohne Schnellstart schaltet der TV nach der [Nutzerrückmeldung](COMPATIBILITY.md#einschalten-aus-dem-standby) seine Netzwerkfunktionen im Standby ab. Dann hilft nur das Einschalten mit der normalen Fernbedienung. Der Adapter kann Schnellstart am unerreichbaren TV nicht aktivieren; dafür gibt es keine Einstellung in der Adapter-Konfiguration. Auch Einschalten über LAN muss am TV erlaubt sein.

| Einstellung | Standard | Bedeutung |
|---|---|---|
| LAN-MAC-Adresse | leer | MAC-Adresse des kabelgebundenen TV-Netzwerkanschlusses. |
| WLAN-MAC-Adresse | leer | MAC-Adresse des TV-WLAN-Anschlusses. Die Möglichkeit zum Aufwecken über WLAN hängt vom TV ab. |
| Broadcastadresse | `255.255.255.255` | Beim Standardwert wird zusätzlich eine passende lokale Broadcastadresse versucht, wenn die konfigurierte TV-Adresse eine IPv4-Adresse im gemeinsamen lokalen Subnetz ist. Eine ausdrücklich eingetragene andere Adresse wird genau so verwendet. |
| Zeitlimit für Einschalten | 60 Sekunden | Gesamtzeit für Wake-on-LAN und den anschließenden gezielten Einschaltbefehl. Einstellbar von 5 bis 120 Sekunden; nach Ablauf wird der Versuch beendet. |

Der Adapter liest MAC-Adressen auch aus den Gerätedaten des erreichbaren Fernsehers, einschließlich des älteren Antwortfelds `MAC-Address`. Diese Geräteabfrage erfolgt vor den Abfragen von Lautstärke und Stummschaltung. Wenn der Fernseher bereits im Standby ist und noch keine MAC-Adresse bekannt ist, muss die passende TV-MAC-Adresse für den ersten Einschaltversuch manuell eingetragen werden. Bei Statusintervall `pollInterval=0` findet keine automatische MAC-Erkennung beim Start statt; die unabhängige Senderaktualisierung ersetzt die Geräteabfrage nicht.

Die zusätzliche Broadcastadresse wird aus der tatsächlichen Netzmaske eines passenden lokalen Netzwerkanschlusses berechnet. Es wird keine feste `/24`-Netzmaske angenommen. Ist die TV-Adresse ein Hostname, liegt der TV in einem anderen Subnetz oder ist die Ermittlung im Container nicht möglich, kann eine passende Broadcastadresse manuell eingetragen werden. Bei Netzwerken mit VLANs, Subnetzen oder Containern muss das Wake-on-LAN-Paket den Fernseher erreichen können.

### Erweitert

| Einstellung | Standard | Bedeutung |
|---|---:|---|
| Port für die TV-Steuerung | 905 | TCP-Port der Loewe-Schnittstelle. |
| Wartezeit auf Antworten | 5.000 Millisekunden | Zeitlimit je Anfrage, einstellbar von 1.000 bis 30.000 Millisekunden. |
| Kompatibilitätsbyte anhängen (NUL) | aktiviert | Verwendet das abschließende Nullbyte der Original-App. Im Normalfall aktiviert lassen. |

## Datenpunkte verwenden

Die folgenden Namen stehen unter **`loewe-tv.0`**. Bei einer weiteren Instanz ersetzt du die `0` durch deren Instanznummer.

Ein Steuerbefehl wird in ioBroker mit **`ack: false`** geschrieben. `ack: true` steht für einen vom Adapter bestätigten Zustand und löst keinen neuen Befehl aus. Im JavaScript-Adapter ist der dritte Parameter von `setState` dafür vorgesehen:

```javascript
setState('loewe-tv.0.control.volume', 20, false);
```

Bei einem Taster schreibst du `true`. Der Adapter setzt den Taster nach der Verarbeitung wieder auf `false`. Das gilt auch für `remote.home`, `control.refresh` und `channels.refresh`. Für einen weiteren Tastendruck erneut `true` schreiben. Gespeicherte Steuerwerte werden beim Adapterstart nicht erneut gesendet.

Im Objektbaum von Admin beim Schreiben die Bestätigung nicht aktivieren. In Blockly den Block zum **Steuern** verwenden. Ein Aktualisieren mit gesetztem Bestätigungskennzeichen löst keinen Befehl aus. Die Bedeutung von `setState` und `ack` beschreibt die [Dokumentation des ioBroker-JavaScript-Adapters](https://github.com/ioBroker/ioBroker.javascript/blob/master/docs/en/javascript.md#setstate).

### Hauptfunktionen

| Datenpunkt | Typ | Verwendung |
|---|---|---|
| `control.volume` | Zahl, lesen/schreiben | Zum Setzen eine ganze TV-Stufe von 0 bis 99 schreiben. Die konfigurierte Obergrenze gilt zusätzlich. Der Lesewert stammt aus der TV-Rückmeldung. |
| `control.mute` | Wahrheitswert, lesen/schreiben | `true` zum Stummschalten, `false` zum Aufheben. |
| `control.powerOn` | Taster | Startet Wake-on-LAN sofort und sendet anschließend den gezielten Einschaltbefehl 22, sobald die Schnittstelle antwortet. Schnellstart und Einschalten über LAN müssen am TV aktiviert sein; eine bekannte TV-MAC-Adresse ist erforderlich. Begrenzte Gesamtdauer und Ablauf in `info.powerOn`. |
| `control.powerOff` | Taster | Bricht einen laufenden Einschaltversuch ab und sendet den gezielten Ausschaltbefehl 25. |
| `control.refresh` | Taster | `true` fragt den TV-Status sowie die Geräteinformationen und Einstellungen erneut ab. |

`control.volume` und `control.mute` werden nach einer Änderung erneut am Fernseher abgefragt. Die bestätigten Werte stammen aus dieser Rückmeldung. Ein erfolgreich abgesendeter Befehl allein ersetzt diese Rückmeldung nicht.

Beispiel für die Lautstärke:

```javascript
// TV-Stufe 20 einstellen.
setState('loewe-tv.0.control.volume', 20, false);
```

Beispiel für Stummschalten und Aufheben, jeweils als eigener Aufruf:

```javascript
setState('loewe-tv.0.control.mute', true, false);
```

```javascript
setState('loewe-tv.0.control.mute', false, false);
```

Es handelt sich bei `control.volume` um die Stufen der App. **Nicht mit 10.000 multiplizieren:** Diese Umrechnung erledigt der Adapter. `status.volume` zeigt die vom TV zurückgemeldete Lautstärke. Meldet der Fernseher selbst einen Wert oberhalb des Schreibbereichs zurück, bleibt diese Rückmeldung erhalten.

### Fernbedienung

Alle folgenden Datenpunkte sind Taster. Der normale Tastendruck enthält Drücken und Loslassen. Langes Halten oder automatische Tastenwiederholung ist in diesen Tastern nicht eingebaut.

| Datenpunkt unter `remote` | Funktion | Code |
|---|---|---:|
| `home` | Startbildschirm | 49 |
| `menu` | Menü | 11 |
| `back` | Zurück | 63 |
| `info` | Information | 79 |
| `epg` | Programmübersicht | 15 |
| `epg_alt` | Alternativer EPG-Code aus Löwenbändiger Remote 1.15 | 78 |
| `pip` | Bild im Bild | 10 |
| `text` | Teletext | 60 |
| `up` | Hoch | 32 |
| `down` | Runter | 33 |
| `left` | Links | 17 |
| `right` | Rechts | 16 |
| `ok` | Bestätigen | 38 |
| `volume_up` | Lauter | 21 |
| `volume_down` | Leiser | 20 |
| `channel_up` | Nächstes Programm | 24 |
| `channel_down` | Vorheriges Programm | 23 |
| `mute` | Stummschaltung umschalten | 13 |
| `power_off` | Bisherige Ein-/Ausschalttaste; laut API ein Umschaltbefehl | 12 |
| `power_on` | Erreichbaren TV gezielt einschalten, ohne Wake-on-LAN | 22 |
| `tv_mode_on` | Gezielt in den TV-Modus wechseln | 72 |
| `red` | Rot | 27 |
| `green` | Grün | 26 |
| `yellow` | Gelb | 43 |
| `blue` | Blau | 40 |
| `rewind` | Rücklauf | 50 |
| `play` | Wiedergabe | 53 |
| `fast_forward` | Vorlauf | 52 |
| `record` | Aufnahme | 55 |
| `pause` | Pause | 41 |
| `stop` | Stopp | 54 |
| `power_all_code` | Gezieltes Ausschalten; bisheriger Datenpunktname bleibt erhalten | 25 |
| `digit_0` | Ziffer 0 | 0 |
| `digit_1` | Ziffer 1 | 1 |
| `digit_2` | Ziffer 2 | 2 |
| `digit_3` | Ziffer 3 | 3 |
| `digit_4` | Ziffer 4 | 4 |
| `digit_5` | Ziffer 5 | 5 |
| `digit_6` | Ziffer 6 | 6 |
| `digit_7` | Ziffer 7 | 7 |
| `digit_8` | Ziffer 8 | 8 |
| `digit_9` | Ziffer 9 | 9 |

**Alle 42 Fernbedienungstaster bleiben unverändert.** `remote.epg` und `remote.epg_alt` senden nur Tastenbefehle für die Anzeige am TV. Der Abruf der Programmdaten erfolgt unabhängig davon über die EPG-Schnittstelle.

Die sechs Wiedergabetasten von `rewind` bis `stop` verwenden das Tastenalphabet `l2700-hdr`. Die übrigen Tasten verwenden `l2700`. Du musst das bei den Datenpunkten nicht selbst einstellen.

`remote.tv_mode_on` folgt dem Befehl `TV_MODE_ON=72` im Alphabet `l2700` aus der [Loewe Remote API 1.0.47, Abschnitt 9.4.1.1, Seite 25](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf). Der Taster sendet einen Tastendruck einschließlich Loslassen und wechselt gezielt in den TV-Modus. Für die Auswahl eines bestimmten TV-Senders gibt es dessen `select`-Taster.

`remote.power_all_code` wird nur an den Fernseher dieser Instanz gesendet. Der Name stammt aus der App und bleibt für vorhandene Skripte erhalten. Die [Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) unterscheidet den Umschaltbefehl 12 von `TV_ON` (22) und dem gezielten Ausschaltbefehl 25. **Ab 0.1.2 verwendet `control.powerOff` den Code 25.** `remote.power_off` behält den bisherigen Code 12. Zum Aufwecken aus dem Standby `control.powerOn` verwenden; `remote.power_on` sendet allein die Taste 22 über die bereits erreichbare Steuerschnittstelle.

```javascript
// Einen einzelnen Tastendruck senden.
setState('loewe-tv.0.remote.home', true, false);
```

`remote.text` öffnet Teletext. Die frühere freie Texteingabe über `media.text` gehört zum entfernten `media`-Bereich und steht nicht mehr als Datenpunkt zur Verfügung.

Die zehn Zifferntasten und `epg_alt` wurden in 0.1.1 anhand von Löwenbändiger Remote 1.15 ergänzt. Die bisherigen 29 Tastenbelegungen bleiben unverändert. Auf dem bild 7.55 / SL420 führten die EPG-Codes 15 und 78 laut Nutzer zur gleichen TV-Anzeige. Die Zifferntasten senden einzelne Tastendrücke; ob eine Ziffernfolge eine Senderwahl auslöst, hängt vom TV und vom gerade geöffneten Bildschirm ab.

```javascript
setState('loewe-tv.0.remote.digit_1', true, false);
```

### Senderlisten und Umschalten

**Mit `channels.refresh = true` wird die in der Adapter-Konfiguration ausgewählte Senderliste vollständig abgeglichen.** Bei erreichbarem TV und dem standardmäßigen Senderlistenintervall von 300 Sekunden geschieht das auch automatisch. Die Auswahl erfolgt im Feld **TV-Senderliste** (`channelListView`); `channels.view` zeigt diese Kennung nur an. Ohne Auswahl startet kein automatischer Senderabruf. Eine nicht mehr gültige Kennung wird nicht durch eine andere Liste ersetzt.

| Datenpunkt | Typ | Bedeutung |
|---|---|---|
| `channels.view` | Text, nur lesen | Kennung der in der Adapter-Konfiguration ausgewählten Liste. Leer bedeutet: noch keine Liste konfiguriert. |
| `channels.refresh` | Taster | Lädt die vollständige gewählte TV-Senderliste. Der Adapter verarbeitet alle Seiten intern und verwendet immer den Filter `video`. |
| `channels.lastSelection` | JSON-Text, lesen | Diagnose der letzten gestarteten TV-Senderauswahl mit Senderkennung, verwendetem Locator, Umschaltergebnis, TV-Antwort und gegebenenfalls Fehler. |

Für eine andere Liste die Adapter-Konfiguration öffnen, bei Bedarf **Senderlisten neu laden**, eine Liste auswählen und speichern. Der Abruf der Auswahloptionen allein ändert den aktiven Senderbestand nicht. Falls der TV noch seine Listen synchronisiert, den Abruf später erneut starten.

Das Anfrageformat folgt Kapitel 9.7 der [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf). Falls der Fernseher gemischte Antworten liefert, übernimmt der Senderkatalog ausschließlich Einträge mit `itemClass=video`. Mehrere Programmplätze desselben Dienstes werden in einem Senderordner zusammengefasst.

Beispiel für einen vollständigen Abruf der konfigurierten Liste:

```javascript
setState('loewe-tv.0.channels.refresh', true, false);
```

`channels.refreshStatus` und `channels.refreshError` zeigen das Abrufresultat; `channels.catalogStatus` zeigt die anschließende Objektaufbereitung. Die zugehörigen Ergebnis- und Katalogwerte sind unter [Gespeicherter Senderbestand und Aktualisierung](#gespeicherter-senderbestand-und-aktualisierung) aufgeführt.

### TV-Sender einzeln anwählen

Für jeden bekannten TV-Senderdienst **der konfigurierten Liste** legt der Adapter einen eigenen Ordner unter **`channels.tv`** an. **Die Ordner-ID wird aus dem Sendernamen gebildet. Der angezeigte Name ist die bevorzugte Speicherposition; die Beschreibung bleibt der Sendername.** Intern steht die Position als Text in `common.name`, der Sendername in `common.desc`. Jeder Sender hat einen `select`-Taster und einen eigenen `epg`-Unterordner.

Beispiele aus der gemeldeten Senderbelegung:

| Ordner-ID | Name (`common.name`) | Beschreibung (`common.desc`) |
|---|---|---|
| `channels.tv.Das_Erste_HD` | `1` | Das Erste HD |
| `channels.tv.ZDF_HD` | `2` | ZDF HD |
| `channels.tv.RTL_Television` | `3` | RTL Television |

Leerzeichen und Sonderzeichen im Sendernamen werden für die ID zu Unterstrichen, Umlaute zu `ae`, `oe` beziehungsweise `ue` und `ß` zu `ss`. So kann beispielsweise aus „WDR HD Köln“ die ID `WDR_HD_Koeln` werden. Der vollständige Sendername bleibt als Beschreibung und im Datenpunkt `name` erhalten. Verschiedene Dienste mit demselben bereinigten Namen werden über einen stabilen Suffix aus der Dienstidentität unterschieden. Die Programmposition ist kein Bestandteil dieses Suffixes.

**Zum Umschalten `select = true` mit `ack: false` schreiben.** In ioBroker Admin also die Bestätigung beim Schreiben nicht aktivieren; in Blockly den Block zum Steuern verwenden. Der Taster kehrt nach der Verarbeitung auf `false` zurück. Er ist ein Befehl zum Anwählen des Senders und kein dauerhafter Ein/Aus-Zustand. Der Fernseher muss erreichbar sein. Der Taster startet kein Wake-on-LAN; dafür gibt es weiterhin `control.powerOn`.

```javascript
// Das Erste HD auf seinem aktuellen bevorzugten Programmplatz anwählen.
setState('loewe-tv.0.channels.tv.Das_Erste_HD.select', true, false);
```

Während eine neu empfangene Senderantwort in den Bestand übernommen wird, kann die Auswahl kurz mit `CHANNEL_UPDATING` abgewiesen werden. Das gilt auch für einen wartenden Tastendruck, wenn inzwischen eine weitere Senderliste empfangen wurde. Nach der Aktualisierung erneut auswählen; der Adapter sendet dadurch keinen veralteten Umschaltauftrag.

| Datenpunkt im Senderobjekt | Inhalt |
|---|---|
| `select` | Taster zum Umschalten auf den Listen-Locator der bevorzugten TV-Position. |
| `name` | Sendername. |
| `number` | Kleinster gültiger Programmplatz dieses Dienstes; seine Textdarstellung ist der angezeigte Ordnername. |
| `mediaItemUuid` | Dienstkennung aus der TV-Antwort. |
| `locator` | Original-Locator der bevorzugten Position aus der TV-Senderliste. |
| `positions` | JSON-Liste mit den zusammengehörenden Werten `caption` und `locator` aller bekannten Positionen. |
| `available` | Ob der Sender im bekannten aktiven Bestand eindeutig zugeordnet und über einen verwendbaren Locator auswählbar ist; kein Empfangs-, Wiedergabe- oder Bildschirmstatus. |
| `epg.status` | Tatsächlicher EPG-Zustand, beispielsweise `ready`, `partial`, `cached` oder `error`. |
| `epg.now.*` / `epg.next.*` | Jeweils `available`, `title`, `subtitle`, `description`, `eventId`, `start` und `end` für die aktuelle beziehungsweise nächste Sendung. |
| `epg.lastUpdate` / `epg.lastError` | Zeitpunkt des letzten erfolgreichen EPG-Abrufs und letzter Fehler für diesen Sender. |
| `epg.data` | Zusammenhängender JSON-Wert mit `schemaVersion: 2`, Senderbezug, Status, `now`, `next` und dem Befund des letzten TV-Versuchs (`tvDiagnostic`). |
| `epg.cache` | Interner Speicher für die Wiederherstellung nach einem Neustart; als Expertenobjekt gekennzeichnet. |

Ein Sender kann mehrfach in der TV-Liste stehen. Das Erste HD auf 1, 100 und 1000 ergibt **einen Ordner**: `channels.tv.Das_Erste_HD`. `positions` enthält alle drei Belegungen mit ihrer jeweiligen Beschriftung und ihrem Locator. `number`, der angezeigte Ordnername und die direkte TV-Auswahl verwenden die kleinste gültige Position, in diesem Beispiel 1. Entfernst du diesen Platz und bleiben 100 und 1000 erhalten, wird nach dem vollständigen Abgleich Platz 100 bevorzugt. Der Ordnerpfad bleibt gleich.

Die Programmposition wird aus der gültigen numerischen Beschriftung des Eintrags bestimmt; führende Nullen entfallen in `number` und im angezeigten Ordnernamen. Fehlt eine brauchbare Beschriftung, kann die Nummer aus einem passenden `channel://`-Locator übernommen werden. Originalbeschriftung und Original-Locator bleiben in den Positionsdaten erhalten. Eine widersprüchliche oder nicht eindeutig zuordenbare Position wird nicht als Umschaltziel verwendet.

**Beim Umsortieren bleibt die Sender-ID erhalten.** Verschiebst du Das Erste HD von Platz 1 auf Platz 7, bleibt `channels.tv.Das_Erste_HD` bestehen. Nach dem vollständigen Abgleich zeigen `number` und der Ordnername den Wert 7; `locator` und der Taster verwenden die neue Position. Das vorhandene Skript mit `channels.tv.Das_Erste_HD.select` steuert weiterhin Das Erste HD. Voraussetzung ist, dass Platz 7 dann die kleinste noch vorhandene Position dieses Dienstes ist. Eine echte Umbenennung am TV ändert dagegen die aus dem Namen gebildete ID. EPG- und Aufnahmeregeln müssen zusätzlich `mediaItemUuid`, Medienart und Listenbezug erhalten, damit gleichnamige Dienste eindeutig zugeordnet bleiben.

#### Rückmeldung der TV-Senderauswahl

`channels.lastSelection` enthält die zuletzt gestartete Auswahl mit Senderziel, verwendetem Locator, `ZapToMedia`-Antwort, Ergebnis und Zeitstempeln. `status=accepted` bedeutet `Result=0`; `unconfirmed` steht für eine Antwort ohne auswertbares Ergebnis, `error` für einen Ablauf- oder Befehlsfehler. Ein ausdrücklich von null abweichendes `Result` wird als Fehler gemeldet. Die Annahme des Befehls und das Rücksetzen des Tasters sind noch kein Nachweis des sichtbaren Programms am Fernseher.

Für einen Fehlerbericht genügt zunächst dieser Diagnosewert nach dem betreffenden Versuch. Bleibt `startedAt` unverändert, zusätzlich `info.lastError` lesen, da die Auswahl bereits vor ihrem Start abgewiesen worden sein kann. Die gesamte Senderliste muss nicht erneut kopiert werden.

#### Gespeicherter Senderbestand und Aktualisierung

**Ja, die Senderobjekte werden an die Konfiguration des Fernsehers angepasst.** Bei aktivem `channelRefreshInterval` erfolgt der Abgleich automatisch beim Start, nach einer tatsächlich erkannten Wiederverbindung und anschließend im eingestellten Abstand. Standard sind 300 Sekunden. Ist der TV bei aktiviertem Statuspolling bereits als nicht erreichbar bekannt, wartet der Senderabruf auf die Wiederverbindung. Bei deaktiviertem Statuspolling versucht die Senderaktualisierung den Abruf selbst. Ein laufender Abgleich wird nicht parallel gestartet und weckt den TV nicht auf.

Mit `channels.refresh=true` kannst du jederzeit einen vollständigen Abgleich anfordern, auch wenn das Senderlistenintervall 0 ist. Die Statusabfragen über `pollInterval` und `control.refresh` bleiben davon unabhängig. Für einen rein manuellen Betrieb `pollInterval`, `channelRefreshInterval` und `epgRefreshInterval` auf 0 setzen.

Der Komplettabruf liest ab Startindex 0 mit höchstens 500 Einträgen je Seite. Eine Liste mit mehreren Seiten wird zweimal vollständig gelesen und nur bei übereinstimmendem Inhalt übernommen. Dadurch werden während des Abrufs geänderte Listen nicht als sicherer Gesamtbestand behandelt. Ein Lauf ist auf 2.000 Programmplätze, 20 Seiten je Durchlauf und ein Zeitlimit von 120 Sekunden für den Abruf begrenzt. Für den gespeicherten Katalog gelten weiterhin 480 KiB. Bei überschrittenen Grenzen oder einer nicht eindeutig auswertbaren Antwort bleibt der bisherige Bestand erhalten.

Nach einem erfolgreichen vollständigen Abgleich werden neue Senderordner angelegt und die Positionen vorhandener Sender aktualisiert. Ordner für nicht mehr vorhandene, vom Adapter verwaltete Sender werden entfernt. **Fehler, Standby und unvollständige Antworten lösen keine Entfernung fehlender Sender aus.** Der bisherige vollständige Bestand bleibt in diesen Fällen erhalten.

Beim laufenden TV-Senderabgleich werden benutzerdefinierte Kinder, Objekte mit `common.custom` und Objekte mit `common.dontDelete` geschützt. Benötigte alte Ordner bleiben dann als deaktivierte Reste mit `available=false` und gesperrter Auswahl bestehen. Das betrifft auch geschützte Hash-Ordner aus 0.1.3 und Nummernordner aus dem ersten 0.1.4-Stand. Normale verwaltete Altobjekte ohne solche Ergänzungen werden entfernt. **Nach dem Speichern einer anderen Senderliste werden die verwalteten Ordner der bisherigen Liste beim Start aussortiert, auch ohne erreichbaren TV.** Der nächste Abruf baut ausschließlich den Bestand der neuen Liste auf. Bei leerer Konfiguration wird kein Bestand aktiviert. Diese ausdrücklich konfigurierte Listenänderung ist von einem vorübergehenden Abruffehler bei derselben Liste zu unterscheiden.

Die Zuordnung bleibt bei unveränderter Listenwahl über einen Adapterneustart hinweg erhalten. Wiederherstellung und Migration verwenden passende Daten aus dem gespeicherten Katalog und verwalteten Senderobjekten. Daten anderer Listen sowie Radiosender werden nicht aktiviert. Gespeicherte Tasterwerte werden zurückgesetzt und führen keinen Umschaltbefehl aus. Die Objektaufbereitung läuft in begrenzten Abschnitten im Hintergrund und belegt die TV-Befehlswarteschlange nicht. Bei größeren Listen können Ordner deshalb nach und nach erscheinen.

| Datenpunkt | Bedeutung |
|---|---|
| `channels.refreshStatus` | `notConfigured`: zuerst eine TV-Senderliste in der Konfiguration wählen; `disabled`: Automatik aus; `waiting`: Warten auf einen wieder erreichbaren TV; `updating`: Komplettabruf läuft; `ready`: vollständiger Bestand an die Objektaufbereitung übergeben; `error`: Abruf fehlgeschlagen. |
| `channels.refreshError` | Fehler des letzten Komplettabrufs. |
| `channels.refreshLastUpdate` | Zeitpunkt der letzten erfolgreichen Übergabe einer vollständig geprüften Liste, Unixzeit in Millisekunden. |
| `channels.refreshCount` | Anzahl der TV-Einträge im letzten vollständigen Abruf, einschließlich mehrfach belegter TV-Programme; herausgefilterte Radioeinträge werden nicht mitgezählt. |
| `channels.catalog` | Versionierter JSON-Katalog für Wiederherstellung und Zusammenführung der eingelesenen Senderdaten. |
| `channels.catalogStatus` | `empty`: noch kein Bestand aufgebaut; `updating`: Aufbereitung läuft; `ready`: Aufbereitung abgeschlossen; `error`: Aufbereitung fehlgeschlagen. |
| `channels.catalogError` | Fehler beim Wiederherstellen oder Aufbereiten des Senderbestands. |
| `channels.catalogLastUpdate` | Letzte erfolgreiche Objektaufbereitung als Unixzeit in Millisekunden. Eine Wiederherstellung kann diesen Wert aktualisieren; er belegt weder einen frischen TV-Abruf noch TV-Erreichbarkeit. |

`channels.refreshStatus=ready` bestätigt die Übergabe des vollständigen Abrufs. **Erst `channels.catalogStatus=ready` bestätigt die abgeschlossene Objektaufbereitung.** Ein alter erfolgreicher Statuswert ist kein aktueller Empfangs- oder Bildschirmstatus.

**EPG-Inhalte werden ab 0.1.7 direkt am TV-Sender bereitgestellt**, beispielsweise unter `channels.tv.Das_Erste_HD.epg.now.title` und `channels.tv.Das_Erste_HD.epg.next.title`. Dazu kommen `available`, Start-/Endzeiten, Beschreibungen, Ereigniskennung und Abrufstatus. Mehrere Programmplätze desselben Dienstes teilen sich einen EPG-Ordner. Eine Positionsänderung erhält die Daten; ein anderer Senderdienst unter derselben ID bekommt eine neue Zuordnung. Zeitlich abgelaufene Programme verschwinden auch im Standby aus der Anzeige. Alle Einzelheiten stehen in der [EPG-Anleitung](EPG.md).

### Aufnahmeaufträge

| Datenpunkt | Typ | Bedeutung |
|---|---|---|
| `recordings.jobs` | JSON-Text, nur lesen | Dauerhaftes Journal der bestätigten Vormerkungen mit Sender, Sendung, Zeiten, Übertragungszustand, Fehler und gegebenenfalls nachgewiesener TV-Timerkennung. |

Aufträge werden in der **Programmübersicht** angelegt. Eine noch ungesendete Vormerkung lässt sich dort entfernen. Bereits übertragene oder unklare Timer müssen direkt am TV geprüft und gegebenenfalls gelöscht werden. Das Journal bleibt über Neustarts erhalten; ein beim Neustart möglicherweise laufender Versand wird zunächst als `uncertain` behandelt. `scheduled` bestätigt den geplanten Timer, nicht die erfolgreiche Durchführung der Aufnahme. Die [Zustandstabelle](EPG_GUI.md#zustände-der-aufnahmeaufträge) erläutert alle Werte.

### Status und Gerätedaten

| Datenpunkt | Bedeutung |
|---|---|
| `info.connection` | Ob der Fernseher zuletzt über die Steuerschnittstelle erreichbar war. |
| `info.adapterBuild` | Eindeutiger Programmstand; für diese Fassung `0.1.21-direct-links.1`. |
| `info.lastSeen` | Zeitpunkt der letzten erfolgreichen Kommunikation als Unix-Zeit in Millisekunden. |
| `info.lastError` | Letzter gemeldeter Fehler. Wird nach einem erfolgreichen Vorgang wieder geleert. |
| `info.lastCommand` | Zuletzt verarbeiteter Steuerbefehl. |
| `info.lastCommandAt` | Zeitpunkt dieses Steuerbefehls als Unix-Zeit in Millisekunden. |
| `info.commandPending` | Ob gerade ein Steuerbefehl oder eine Statusabfrage bearbeitet wird beziehungsweise weitere Vorgänge warten. |
| `info.wakeReady` | `true`, wenn eine formal gültige TV-MAC-Adresse zum Paketversand bekannt ist. Bestätigt weder die Wake-on-LAN-Fähigkeit noch einen aktivierten Schnellstart am TV. |
| `info.lastWakeOnLan` | Letzter erfolgreicher Wake-on-LAN-Paketversand als JSON mit `macs`, `broadcast`, `targets`, `port`, `repeats` und `sentAt`. `sentAt` ist der Auslösezeitpunkt als Unix-Zeit in Millisekunden. |
| `info.powerOn` | Einschaltablauf als JSON, unter anderem mit `phase`, `startedAt`, `updatedAt`, `deadline`, `attempts` und `wakeBursts`. Die Phase `powerKeySent` bestätigt keinen sichtbaren Bildschirminhalt. |
| `status.volume` | Zuletzt vom Fernseher gelesene Lautstärke in App-Stufen. |
| `status.mute` | Zuletzt vom Fernseher gelesene Stummschaltung. |
| `status.playback` | Zuletzt gelesene Wiedergabeantwort als JSON-Text. |
| `device.data` | Gerätedaten als JSON-Text. |
| `device.settings` | Zuletzt gelesene TV-Einstellungen als JSON-Text. |
| `device.macLan` | Ermittelte LAN-MAC-Adresse. |
| `device.macWlan` | Ermittelte WLAN-MAC-Adresse. |
| `device.mac` | MAC-Adresse aus dem älteren TV-Antwortfeld `MAC-Address`, als zusätzliche Quelle für Wake-on-LAN. |
| `device.wolEnabled` | Gültig vom TV gemeldete Wake-on-LAN-Einstellung. Bleibt bis zur ersten gültigen Antwort unbekannt. |
| `device.wolInteractive` | Gültig vom TV gemeldete Einstellung `WolInteractive`. Bleibt bis zur ersten gültigen Antwort unbekannt. |

**`info.connection` ist kein verlässlicher Bildschirm-Ein/Aus-Zustand.** Ein Fernseher kann im Standby noch auf Netzwerkbefehle antworten. Umgekehrt kann ein eingeschalteter Fernseher bei einem Netzwerkfehler unerreichbar sein. `control.powerOn` und `control.powerOff` sind deshalb bewusst Befehls-Taster.

Bei Verbindungsproblemen sind vorhandene Statuswerte die zuletzt bekannten Werte. `info.connection`, `info.lastSeen` und `info.lastError` helfen dabei, ihre Aktualität einzuordnen.

Bei einem Intervall größer als 0 werden Lautstärke und Stummschaltung regelmäßig abgefragt, die Wiedergabe bei aktivierter Option ebenfalls. Mit Intervall 0 finden keine automatischen Statusabfragen statt. Gerätedaten werden vor Lautstärke und Stummschaltung gelesen, damit fehlende Unterstützung einer Statusfunktion die MAC-Erkennung nicht verhindert. `control.refresh` fordert die Status-, Geräte- und Einstellungsdaten manuell neu an. Nicht unterstützte Abfragen werden im Adapterprotokoll gemeldet.

SOAP-Anfragen werden nacheinander ausgeführt. Die Warteschlange ist auf 20 laufende oder wartende Vorgänge begrenzt. Ein Vorgang, der beim Erreichen seines Platzes mehr als 30 Sekunden gewartet hat, wird verworfen. **Wake-on-LAN läuft unabhängig von dieser Warteschlange**, damit ein nicht antwortender Fernseher seinen eigenen Einschaltversuch nicht verzögert.

Gewöhnliche SOAP-Steuerbefehle werden nach einem Fehler nicht automatisch wiederholt, weil der Fernseher sie vor einem Verbindungsabbruch bereits ausgeführt haben könnte. Nach einem solchen Fehler stellt der nächste Versuch die Anmeldung bei Bedarf neu her. Eine gezielte Ausnahme ist der zeitlich begrenzte Einschaltablauf: Er darf den dokumentierten Befehl `TV_ON` bei vorübergehenden Verbindungsproblemen wiederholen. Er verwendet dabei keinen Umschaltbefehl. Die Wartephasen zwischen diesen Versuchen belegen die SOAP-Warteschlange nicht.

Geräte-, Wiedergabe- und Befehlsantworten werden bis 512 KiB in einem Datenpunkt gespeichert. Größere Antworten werden durch einen JSON-Hinweis mit `omitted`, `bytes`, `limit` und `reason` ersetzt. Der Senderkatalog und die EPG-Caches haben eigene Größenbegrenzungen; diese stehen beim Senderabgleich und in der [EPG-Anleitung](EPG.md#umfang-und-belastung).

## Ein- und Ausschalten

**Das Einschalten über den Datenpunkt funktioniert laut Nutzerrückmeldung vom 18. Oktober 2026 nur mit aktiviertem Schnellstart am Fernseher.** Ohne Schnellstart sind dessen Netzwerkfunktionen im Standby abgeschaltet; der Nutzer kann ihn dann nur mit der normalen Fernbedienung einschalten. Aktiviere Schnellstart deshalb direkt am eingeschalteten TV. Der Adapter kann diese Einstellung nicht nachträglich über eine bereits abgeschaltete Netzwerkverbindung ändern. Ein längeres Zeitlimit oder wiederholter Paketversand behebt das nicht. Die Rückmeldung nennt kein bestimmtes TV-Modell und keinen Build; ihr Umfang ist in [COMPATIBILITY.md](COMPATIBILITY.md#einschalten-aus-dem-standby) festgehalten.

Die [Loewe Remote API 1.0.47, Kapitel 9.4.3](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf), unterscheidet das Aufwecken des Netzwerkdiensts vom interaktiven Einschalten. Abhängig von `WolInteractive` kann ein Magic Packet allein den Bildschirm ausgeschaltet lassen. Deshalb verwendet der Adapter ab 0.1.2 den anschließenden gezielten `TV_ON`-Befehl 22. Dieser Ablauf bleibt unverändert; Schnellstart ist die am Gerät ermittelte Voraussetzung dafür.

Zum Einschalten:

```javascript
setState('loewe-tv.0.control.powerOn', true, false);
```

Der Ablauf ist zeitlich begrenzt:

1. Sofort drei Wake-on-LAN-Senderunden per UDP an Port 9, mit 150 Millisekunden Abstand. Der Versand wartet nicht auf offene SOAP-Abfragen.
2. Nach dem ersten Versand und einer Wartezeit von einer Sekunde beginnt der Versuch, den gezielten Einschaltbefehl 22 zu senden. Ein einzelner Versuch einschließlich Warteschlange und Anmeldung hat höchstens drei Sekunden Zeit.
3. Bei vorübergehenden Netzwerk- oder Anmeldeproblemen folgt nach zwei Sekunden ein weiterer Versuch. Wenn der Ablauf noch läuft, wird frühestens nach 35 Sekunden einmal ein weiterer WOL-Burst gesendet.
4. Nach der eingestellten Gesamtfrist endet der Vorgang. Standard sind 60 Sekunden, einstellbar sind 5 bis 120 Sekunden. Ein Ausschaltbefehl oder das Beenden des Adapters bricht die Sequenz ab, damit wartende Versuche den TV nicht später wieder einschalten.

Die Wartezeiten laufen asynchron. Bereits gesendete Netzwerkpakete lassen sich beim Abbruch nicht zurückholen; noch wartende Einschaltversuche werden vor ihrem Versand erneut auf Abbruch und Zeitlimit geprüft.

Zum gezielten Ausschalten:

```javascript
setState('loewe-tv.0.control.powerOff', true, false);
```

Ab 0.1.2 verwendet dieser Datenpunkt den dokumentierten Code 25. Der bisherige Datenpunkt `remote.power_off` bleibt beim Umschaltcode 12, `remote.power_all_code` bleibt beim gezielten Ausschaltcode 25. `remote.power_on` sendet nur Code 22 und führt keinen WOL-Ablauf aus.

### Den Einschaltversuch prüfen

1. Den Fernseher mit der normalen Fernbedienung einschalten. **Schnellstart und Einschalten über LAN direkt am TV aktivieren.** Die passende LAN- oder WLAN-MAC-Adresse manuell konfigurieren oder mit `control.refresh` aus den Gerätedaten lernen.
2. `info.wakeReady` prüfen. `true` bedeutet, dass eine MAC-Adresse bekannt ist, und bestätigt keinen aktivierten Schnellstart. Nach einer gültigen Geräteabfrage zeigen außerdem `device.wolEnabled` und `device.wolInteractive` die vom TV gemeldeten Einstellungen. Diese Werte ersetzen die Prüfung des Schnellstarts am TV nicht. Ein unbekannter Wert bedeutet keine bestätigte Deaktivierung.
3. Den TV in Standby versetzen und **mindestens 30 Sekunden warten**. Diesen Mindestabstand nennt das [Loewe-Benutzerhandbuch für bild-Geräte mit SL3xx/SL4xx](https://cdn.loewe.tv/manuals_new/TV_BA/SL3xx_SL4xx/universelles%20Benutzerhandbuch%20f%C3%BCr%20alle%20bild%20Ger%C3%A4te/36960000_UH_bild_universal_3l_DE_180813.pdf) für das erneute Einschalten über LAN/WLAN.
4. `control.powerOn` mit `true` und `ack: false` auslösen. In `info.lastWakeOnLan` müssen `sentAt`, `targets` und `macs` zum aktuellen Versuch passen. `info.powerOn` zeigt den anschließenden Ablauf und gegebenenfalls einen Fehler.

| Phase in `info.powerOn` | Bedeutung |
|---|---|
| `waking` | Wake-on-LAN wird gesendet. |
| `waiting` | Warten vor dem ersten oder einem weiteren TV_ON-Versuch. |
| `powerKeySent` | Die Steuerschnittstelle hat den gezielten Einschaltbefehl erfolgreich beantwortet. **Kein Nachweis, dass ein Bild sichtbar ist.** |
| `failed` | Fehler oder Gesamtzeitlimit erreicht; den gemeldeten Fehler lesen. |
| `cancelled` | Der Einschaltablauf wurde abgebrochen. |

Ein erfolgreicher UDP-Versand bestätigt nicht den Empfang am TV. Auch eine erfolgreiche SOAP-Antwort ist kein verlässlicher Bildschirmstatus. `info.connection` zeigt die Erreichbarkeit der Schnittstelle. Bleiben die Diagnosen unverändert, `info.lastError` auf einen vor Beginn erkannten Fehler wie eine fehlende MAC-Adresse prüfen.

Die zweite App Löwenbändiger Remote 1.15 lieferte keinen nachgewiesenen WOL-Ablauf. Der neue zweistufige Einschaltweg stützt sich auf die Hersteller-API. Eine lesbare [Textfassung der Remote-API-Spezifikation](https://github.com/gadgetbazza/hass-loewetv-remoteapi/blob/main/supporting_files/remote_api_1.0.47_Loewe.txt) wird im unabhängigen Home-Assistant-Projekt bereitgestellt.

## Fehler eingrenzen

| Beobachtung | Nächster sinnvoller Schritt |
|---|---|
| `info.connection` bleibt `false` | Sind alle drei Abfrageintervalle 0, zunächst `control.refresh` auslösen. Sonst Fernseher einschalten, IP-Adresse und Port 905 prüfen und `info.lastError` lesen. Router-, Gastnetz- oder VLAN-Trennung prüfen. |
| Verbindung bricht nach einem TV-Neustart ab | Einen weiteren Statuszyklus abwarten oder `control.refresh` auslösen. Die Anmeldung wird vom Adapter verwaltet. |
| Einzelne Anfrage meldet einen SOAP-Fehler | Die Schnittstelle ist erreichbar, diese Aktion oder ihre Parameter werden aber möglicherweise vom TV nicht unterstützt. Bei Wiedergabeproblemen `pollPlayback` deaktivieren. |
| Schreiben eines Datenpunkts bewirkt nichts | Mit `ack: false` schreiben. Taster erwarten `true`. Die Senderliste wird in der Adapter-Konfiguration gewählt. |
| Lautstärke lässt sich nicht hoch genug setzen | Den Wert und die konfigurierte maximale Lautstärke prüfen. `control.volume` erwartet eine ganze App-Stufe, keinen Protokollrohwert. |
| `info.wakeReady` ist `false` | Die passende TV-MAC-Adresse manuell konfigurieren oder bei eingeschaltetem TV `control.refresh` auslösen. Bei `pollInterval=0` wird die MAC-Adresse beim Start nicht automatisch abgefragt. |
| Schnellstart ist deaktiviert und der TV im Standby nicht erreichbar | Mit der normalen Fernbedienung einschalten und Schnellstart am TV aktivieren. Im gemeldeten Gerätetest werden ohne Schnellstart die Netzwerkfunktionen abgeschaltet; der Adapter kann diese Einstellung dann nicht ändern. |
| `info.wakeReady` ist `true`, aber der TV startet nicht | Zuerst Schnellstart und Einschalten über LAN am TV prüfen. `info.wakeReady` belegt nur eine bekannte MAC-Adresse. Anschließend `info.lastWakeOnLan` und `info.powerOn` prüfen. Nach dem Ausschalten mindestens 30 Sekunden warten. `powerKeySent` bestätigt nur die Antwort auf den Einschaltbefehl, kein Bild. |
| Ein Einschaltversuch aktualisiert `info.lastWakeOnLan` nicht | `info.lastError` lesen und prüfen, ob `control.powerOn` mit `true` und `ack: false` geschrieben wurde. Eine frühere Versandmeldung ist kein Nachweis für den aktuellen Versuch. |
| ioBroker wird nach dem Aktivieren der bisherigen Version träge | `loewe-tv.0` stoppen und die Updateanleitung auf 0.1.21 einschließlich der instanzbezogenen Compact-Umstellung ausführen. Für die anschließende Prüfung `pollInterval`, `channelRefreshInterval` und `epgRefreshInterval` auf 0 setzen. |
| **Fernseher suchen** ist deaktiviert | Die Instanz in der Instanzübersicht aktivieren und ihren Start abwarten. Das ist auch bei noch leerer TV-Adresse möglich. Die Suchfunktion benötigt eine laufende Instanz. |
| Die Suche findet keinen oder nur einen Teil der Fernseher | Die fehlenden TVs einschalten. Netzwerkverbindung vom ioBroker-Rechner, Multicast, Gastnetz/VLAN und bei Docker das Container-Netz prüfen. Suche erneut auslösen oder die IP-Adresse von Hand eintragen; siehe [Netzwerksuche](NETWORK_DISCOVERY.md#wenn-ein-fernseher-fehlt). |
| Ein Suchtreffer meldet **Steuerport 905 nicht erreichbar** | Die Adresse wurde als Loewe-TV erkannt, die TCP-Verbindung zum Steuerport konnte aber nicht bestätigt werden. TV einschalten, Port und Netzwerk prüfen. Ein Treffer allein bestätigt keine Adapterkompatibilität. |
| Speichern-Tasten sind blockiert oder die alte EPG-Maske wird angezeigt | Das neue Paket erneut installieren, `info.adapterBuild = 0.1.21-direct-links.1` prüfen, Admin vollständig neu laden und die Konfiguration erneut öffnen. EPG, **Web-Zugriff** und **Programmübersicht** haben eigene Reiter; die Übersicht benötigt eine laufende Instanz. Admin ab 8.0.22 ist erforderlich. |
| Senderabfrage scheitert | In der Adapter-Konfiguration eine verfügbare TV-Senderliste auswählen und speichern. `channels.view` zeigt die gespeicherte Kennung. `channels.refreshStatus`, `channels.refreshError` und `channels.catalogError` prüfen. Bei TV-Synchronisierung später wiederholen. |
| In der Konfiguration fehlen Senderlisten | TV einschalten, Adresse und Port speichern, Instanz aktivieren und Einstellungen erneut öffnen. **Senderlisten neu laden** betätigen und den angezeigten Hinweis beachten. |
| Programmübersicht fehlt oder ist leer | Admin ab 8.0.22 verwenden, die Instanz starten und Admin nach dem Paketupdate neu laden. Gespeicherte TV-Adresse und Senderliste prüfen. In der Übersicht **EPG aktualisieren** anklicken; leere Senderbereiche können auf fehlende TV-Daten hinweisen. [Weitere Hilfe](EPG_GUI.md). |
| Entfernte globale Datenpunkte sind weiterhin vorhanden | `info.adapterBuild` muss `0.1.21-direct-links.1` zeigen. Sonst das neue Paket erneut installieren. Bei passender Build-Kennung das Startprotokoll auf Bereinigungsfehler und Löschschutz prüfen; die Objektansicht anschließend neu laden. |
| Sender wurden empfangen, unter `channels.tv` fehlen noch Objekte | `channels.catalogStatus` prüfen und bei `updating` die Hintergrundaufbereitung abwarten. Bei `error` steht die Ursache in `channels.catalogError`; danach die passende Senderliste erneut abfragen. |
| Ein Sendertaster meldet `CHANNEL_UNAVAILABLE` | Die Liste dieses Senders erneut abfragen. Bei `available=false` gehört er nicht zum aktiven Bestand oder es fehlt ein verwendbarer Locator. Nach Änderungen während der Wartezeit den Sender erneut auswählen. |
| Der Sendertaster ist wieder `false`, aber der Sender läuft nicht | Das Rücksetzen bestätigt nur die Verarbeitung des Tasters. `channels.lastSelection` auf TV-Ergebnis und Fehler prüfen. Die Annahme des Befehls allein bestätigt noch keine Wiedergabe. |
| Eine JSON-Antwort enthält `omitted: true` | Der Hinweis beschreibt die ausgelassene Speicherung einer zu großen Antwort. Für einen Fehlerbericht den betroffenen Datenpunkt und die Angaben `bytes`, `limit` und `reason` angeben. |
| Aufnahme zeigt **An TV übertragen** | Der TV hat auf den Auftrag geantwortet. Der automatische Timerabgleich ist noch offen; die Diagnose lässt sich unter **Details zum Timerabgleich** öffnen. Der Auftrag wird nicht erneut übertragen. |
| Aufnahme zeigt **Übertragung unklar** oder **Timerabgleich offen** | Die Timerliste am TV prüfen. Ein möglicherweise bereits gesendeter Auftrag wird nicht automatisch wiederholt; eine unbekannte Timerlisten-Antwort führt nicht zu `scheduled`. |
| Aufnahme steht auf `missed` | Der ungesendete Auftrag hat seine Startzeit erreicht. Den TV für weitere Vormerkungen vor Sendungsbeginn erreichbar machen; die Aufnahmeverwaltung schaltet ihn nicht ein. |
| Ein Befehl meldet eine volle Warteschlange oder zu lange Wartezeit | Befehle langsamer senden, laufende TV-Zeitüberschreitungen prüfen und für die Diagnose `pollInterval`, `channelRefreshInterval` und `epgRefreshInterval` auf 0 setzen. |

Die Einstellung aller drei Abrufintervalle auf `0` beendet keine bereits vorgemerkten Aufnahmeaufträge. Diese können weiterhin Verbindungsprüfungen und Timerabgleiche auslösen.

Für einen Fehlerbericht sind TV-Modell, Firmware, Adapterversion und der konkrete Fehlertext hilfreich. Bei Einschaltproblemen zusätzlich angeben, ob Schnellstart und Einschalten über LAN am TV aktiviert sind, sowie die verwendete LAN-/WLAN-Verbindung, `info.wakeReady`, `info.lastWakeOnLan` und `info.powerOn`. Bei Fehlern der Senderauswahl zunächst `channels.lastSelection` direkt nach dem Versuch sowie das vorherige und das gewünschte TV-Programm angeben. Bei Fehlern des Senderabrufs helfen `channels.refreshStatus`, `channels.refreshError`, `channels.refreshCount`, `channels.catalogStatus` und `channels.catalogError`. Persönliche Senderlisten, Gerätekennungen oder MAC-Adressen können darin enthalten sein.

Bei EPG-Problemen helfen `channels.epgStatus`, `channels.epgProgress`, `channels.epgLastError` und `epg.data` des betroffenen TV-Senders. Prüfe zunächst am eingeschalteten Fernseher und löse `channels.epgRefresh=true` mit `ack: false` aus. Ab 0.1.8 enthält `epg.data.tvDiagnostic` den letzten TV-Versuch: `received` bedeutet eine auswertbare Antwort, `error` einen fehlgeschlagenen Versuch und `skipped` eine übersprungene TV-Abfrage. Auch eine leere Antwort kann `received` ergeben; die Programmverfügbarkeit zeigen weiterhin `epg.now.available` und `epg.next.available`. Nach einem vorübergehenden Cache-/Datenbankfehler wird die EPG-Initialisierung erneut versucht, bei automatischem Betrieb nach 30 Sekunden. Die [EPG-Anleitung](EPG.md) erklärt die Diagnosefelder. Programmzeiten werden in Millisekunden gespeichert.

## Protokoll und Grenzen dieser Version

Die Netzwerkschnittstelle verwendet `POST /loewe_tablet_0001` mit dem SOAP-Namensraum `urn:loewe.de:RemoteTV:Tablet`. Die Anmeldung erfolgt mit `RequestAccess`; die Antwort liefert die `ClientId` für Folgeanfragen. Die Original-App hängt ein NUL-Byte an den XML-Body an. Der Adapter übernimmt dieses Verhalten standardmäßig.

Die ursprünglichen Tastencodes, Requestvorlagen und die Lautstärkeskalierung stammen aus Loewe App 1.4.7. Die Zifferntasten und der alternative EPG-Code stammen aus Löwenbändiger Remote 1.15. TV_ON (22), TV_MODE_ON (72) und die ergänzte Bedeutung der Ein-/Ausschaltcodes folgen der Remote API 1.0.47. Die App-Stufe 20 entspricht im Protokoll dem Wert 200000. `SetMute` mit `Value=1` ist im App-Sendepfad nachgewiesen. Das Aufheben mit `Value=0` ist aus dem Antwortparser und der Gegenoperation abgeleitet; die Toggle-Taste `remote.mute` ist separat nachgewiesen.

Die extrahierten SOAP-Vorlagen bleiben in [protocol-templates.json](protocol-templates.json) und [remote115-protocol.json](remote115-protocol.json) als Entwicklungsunterlagen erhalten. Der Adapter verwendet den internen SOAP-Transport weiterhin für seine dokumentierten Funktionen.

Der lokale EPG-Abruf über `CreateIterator` und `de.loewe.sl2.epg` ist in 0.1.7 implementiert. Die Grundfelder stammen aus Kapitel 9.22 der Hersteller-API; ergänzende veröffentlichte Feldkennungen werden mit begrenztem Rückfall auf das Grundschema verwendet. Die [EPG-Protokolldokumentation](epg-protocol.md) trennt Herstellerangaben, zusätzliche Quellen und noch ausstehende Gerätetests. Dieser direkte TV-Abruf ist der einzige EPG-Weg dieses Builds.

Ab 0.1.9 sucht der Adapter auf Anforderung in der Konfiguration per SSDP nach Loewe-TVs und bietet die gefundenen IP-Adressen zur Auswahl an. Die Suche nutzt die Gerätebeschreibungen und prüft den Steuerport ohne Anmeldung oder TV-Befehl. Sie läuft nicht automatisch beim Öffnen der Konfiguration und ändert keine gespeicherte TV-Adresse. Einzelheiten und Grenzen stehen in der [Netzwerksuche-Dokumentation](NETWORK_DISCOVERY.md).

Ab 0.1.11 sind manuell bestätigte Aufnahmevormerkungen aus dem TV-EPG mit dauerhaftem Journal und Timerlistenabgleich implementiert. Der verwendete `ProgramTimer`-Ablauf folgt der Original-App. Am 19. Oktober 2026 bestätigt der Nutzer zwei übertragene Aufträge und den Start der ersten Aufnahme. Der erfolgreiche Abschluss und die automatische Zuordnung anhand der originalen XML-Timerantwort sind weiter offen. [Belegter Aufnahmeablauf](recording-protocol.md).

Die universellen API-Datenpunkte, die Radiosteuerung und der gesamte `media`-Datenpunktbaum bleiben entfernt. Automatische Aufnahmeregeln, Vor-/Nachlauf, Änderung oder Löschung übertragener TV-Timer, Favoritenverwaltung, UPnP/DLNA-Mediensteuerung, WS-Eventing und lange Fernbedienungstastendrücke sind nicht als Bedienfunktionen umgesetzt.

## Weiterführende Dokumentation

- [Programmübersicht in den Instanz-Einstellungen](EPG_GUI.md)
- [EPG: laufende und nächste Sendung](EPG.md)
- [Fernseher im Netzwerk suchen und auswählen](NETWORK_DISCOVERY.md)
- [Gerätekompatibilität und bestätigte Tests](COMPATIBILITY.md)
- [Prüfbericht zum zugrunde liegenden TV-EPG-Funktionsstand `.1`](PRUEFBERICHT_0.1.8_TV_EPG.md)
- [Roadmap für EPG-Regeln und Aufnahmen](ROADMAP.md)
- [Projektübersicht](../README.md)
