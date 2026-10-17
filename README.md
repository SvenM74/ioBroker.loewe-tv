# Loewe TV für ioBroker

Version **0.1.6** steuert einen Loewe-Fernseher über ioBroker-Datenpunkte. Du kannst die Fernbedienungstasten auslösen, Lautstärke und Stummschaltung setzen, Text eingeben, Senderlisten automatisch aktualisieren, einzelne Sender über eigene Taster anwählen und Wake-on-LAN auslösen. TV-Sendertaster mit Namens-IDs funktionieren nach einem kurzen Test am unten genannten SL420. Für die dort weiterhin erfolglose Radioauswahl prüft diese Version zuerst den Wiedergabemodus und aktiviert bei Bedarf gezielt den Radiomodus, bevor sie den Sender anwählt. Anschließend prüft sie zeitversetzt die Wiedergabe und hält den Ablauf in `channels.lastSelection` fest. **Ein erfolgreicher Gerätetest dieses neuen Radioablaufs steht noch aus.**

Die Senderordner verwenden weiterhin den Sendernamen als ID, beispielsweise `channels.tv.Das_Erste_HD`. Ihr angezeigter Name ist der aktuelle Programmplatz, ihre Beschreibung der Sendername. Beim Umsortieren bleiben die Senderpfade gleich.

Die Grundlage ist die aus der Android-App **Loewe App 1.4.7** extrahierte Netzwerkschnittstelle. Die zusätzliche Analyse von **Löwenbändiger Remote 1.15** ergänzt Zifferntasten und einen weiteren EPG-Code. Beim erneuten Prüfen der ursprünglichen Loewe-App wurde außerdem ein älteres MAC-Adressformat nachgewiesen, das der Adapter jetzt ebenfalls auswertet. Jede Instanz steuert genau einen Fernseher. Für einen zweiten Fernseher wird eine zweite Instanz angelegt.

## Rückmeldung vom getesteten Fernseher

| Merkmal | Gemeldeter Stand vom 17.10.2026 |
|---|---|
| Modell | **Loewe bild 7.55** |
| Chassis | **SL420** |
| Software | **V5.4.6.0** |
| Fernbedienung | Nach Rückmeldung des Nutzers scheinen sämtliche bereits vorhandenen Datenpunkte unter `remote` zu funktionieren. |
| EPG-Tasten | `remote.epg` (15) und `remote.epg_alt` (78) öffnen dieselbe Anzeige am TV. Das ist noch kein Abruf von EPG-Daten. |
| Senderabfrage | Eine echte `GetChannelListResponse` für **ASTRA LCN** liegt vor. Der TV meldet 372 Listeneinträge mit TV- und Radiosendern. Die ersten drei TV-Programme stimmen nach Prüfung des Nutzers mit seiner Konfiguration überein. |
| Senderordner und TV-Auswahl | Der Nutzer hat die Anlage der Senderordner, den ersten 0.1.4-Stand mit numerischen IDs und anschließend die TV-Auswahl des überarbeiteten 0.1.4-Stands mit Namens-IDs bestätigt. Nach einem kurzen Test funktionieren die TV-Channels fehlerfrei. |
| Radio-Auswahl | Auch 0.1.5 schaltet laut Nutzer nicht auf Radio um. Bei sunshine live bestätigt die echte Detailantwort einen Audioeintrag und liefert denselben Locator wie die Senderliste. `ZapToMedia` meldet `Result=0`; die unmittelbar folgende Abfrage zeigt jedoch weiter TV mit ZDF. Version 0.1.6 ergänzt den gezielten Moduswechsel und zeitversetzte Prüfungen. Deren Wirkung am Gerät ist noch unbestätigt. |
| Einschalten | Im bisher installierten Stand nicht erfolgreich, obwohl das Einschalten über LAN am TV aktiviert ist. |

**Senderabruf, Senderordner und die TV-Auswahl mit Namens-IDs sind damit am SL420 grundsätzlich nachgewiesen.** Die Zahl 372 umfasst TV- und Radioeinträge sowie mehrere Programmplätze desselben Dienstes und bezeichnet nicht 372 verschiedene TV-Sender. Der kurze TV-Test bestätigt weder alle Sender noch das Umsortieren, sämtliche Migrationsfälle oder den neuen Radioablauf. Auch für den Einschaltablauf aus Wake-on-LAN plus gezieltem `TV_ON`-Befehl fehlt weiterhin eine Erfolgsmeldung. Die frühere Rückmeldung zu den Fernbedienungstasten schließt `remote.power_on` aus 0.1.2 und die beiden neuen Modustasten aus 0.1.6 nicht ein. Sie ist auch keine Zusage für andere Modelle oder Firmwarestände.

Die ergänzende [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) dokumentiert die Senderlisten, das Netzwerkaufwecken und einen lokalen EPG-Zugriff. Diese Herstellerangaben ergänzen die App-Analyse; die jeweilige Wirkung wird weiterhin am Gerät geprüft. Der Adapter wird als lokale Paketdatei installiert und ist nicht im ioBroker-Adapterkatalog oder auf npm veröffentlicht.

## Projektziel: Aufnahmen anhand von EPG-Regeln

Der geplante Ausbau soll ioBroker ermöglichen, Programmdaten auszuwerten, passende Sendungen zu erkennen und dafür im Voraus Aufnahmetimer im Loewe-TV anzulegen. Regeln, beispielsweise für bestimmte Titel, Sender und Zeiträume, werden in ioBroker gesteuert. Der Adapter soll die Sender- und EPG-Daten bereitstellen, Aufnahmeaufträge übertragen und anhand der TV-Timerliste bestätigen.

Diese Automatik ist in 0.1.6 noch nicht umgesetzt. Jedes neue Senderobjekt enthält bereits einen `epg`-Unterordner mit dem Status `notImplemented`. Die [Roadmap für EPG und automatische Aufnahmen](docs/ROADMAP.md) beschreibt die vorhandenen Schnittstellen, die geplanten Datenpunkte direkt am Sender und die noch erforderlichen Gerätetests.

## Voraussetzungen

- Node.js ab **22**.
- ioBroker js-controller ab **6.0.11** und Admin ab **7.0.23**.
- Ein Loewe-Fernseher, der die Tablet-Schnittstelle auf TCP-Port **905** anbietet.
- Eine Netzwerkverbindung vom ioBroker-Rechner zum Fernseher. Zum Einrichten den Fernseher einschalten.
- Für Einschalten aus dem Standby: eine passende TV-MAC-Adresse und Unterstützung für Wake-on-LAN im Fernseher und im Netzwerk.

Der laufende Adapter arbeitet lokal. Für die Installation kann ioBroker benötigte Node.js-Abhängigkeiten aus dem Internet nachladen. Das lokale `.tgz`-Paket ist deshalb keine Zusage einer vollständig netzlosen Installation.

## Installationspaket aus dem Quellcode erzeugen

Der Quellcode steht im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv). Ein fertiges `.tgz`-Paket ist dort derzeit nicht als Release hinterlegt. Du kannst es mit den folgenden Schritten selbst erzeugen. Wenn du `iobroker.loewe-tv-0.1.6.tgz` bereits erhalten hast, kannst du diese Datei direkt für die anschließende Update- oder Erstinstallationsanleitung verwenden.

Zum Erzeugen des Pakets brauchst du Git und Node.js ab 22. Öffne ein Terminal in einem eigenen Arbeitsverzeichnis und führe aus:

```bash
git clone https://github.com/SvenM74/ioBroker.loewe-tv.git
cd ioBroker.loewe-tv
npm install
npm test
npm pack
```

`npm pack` erzeugt im Projektverzeichnis die Datei **`iobroker.loewe-tv-0.1.6.tgz`**. Die Entwicklungsbefehle gehören in diese Projektkopie, nicht in das produktive ioBroker-Hauptverzeichnis. Kopiere anschließend die erzeugte Paketdatei auf den ioBroker-Rechner und verwende die passende Anleitung unten.

## Update auf 0.1.6

Die vorhandene Instanz weiterverwenden. Erzeuge das Paket aus dem aktuellen Quellcode wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende das bereitgestellte Archiv **`iobroker.loewe-tv-0.1.6.tgz`**. Kopiere es auf den ioBroker-Rechner, beispielsweise nach `/tmp`. Führe dort diese Befehle in der angegebenen Reihenfolge aus:

```bash
iobroker stop loewe-tv.0
iobroker compact loewe-tv.0 disable
iobroker url /tmp/iobroker.loewe-tv-0.1.6.tgz loewe-tv
iobroker start loewe-tv.0
```

Der Compact-Befehl betrifft die Instanz `loewe-tv.0`. Ab Version 0.1.1 läuft der Adapter in einem eigenen Prozess; das gilt auch für 0.1.6. Die Umstellung erfolgt vor dem Paketupdate, damit sie auch bei einer vorhandenen Instanz wirksam wird. Die Syntax ist in der [offiziellen ioBroker-CLI-Dokumentation](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md) beschrieben. Die bisherige Konfiguration und eine eingetragene Senderlistenkennung bleiben erhalten.

**Beim Update von 0.1.5 oder vom 0.1.4-Stand mit Namens-IDs bleiben die Senderpfade erhalten.** Nur beim Wechsel von älteren Hash- oder Nummernordnern ändern sich die IDs einmalig: Aus `channels.tv.service_<Hash>` aus 0.1.3 oder `channels.tv.1` aus dem ersten 0.1.4-Stand werden Ordner wie `channels.tv.Das_Erste_HD`. Passe vorhandene Skripte, Aliase und Visualisierungen an, wenn sie noch auf diese alten IDs verweisen. Anschließend bleibt der Pfad beim Umsortieren erhalten: Verschiebst du Das Erste HD am TV von Platz 1 auf Platz 7, verwendet `channels.tv.Das_Erste_HD.select` nach dem Abgleich dessen neuen Programmplatz. Eine tatsächliche Änderung des Sendernamens führt dagegen zu einer neuen Namens-ID.

Der Adapter übernimmt vorhandene Kataloge und verwaltete Senderordner aus 0.1.3 sowie aus dem ersten 0.1.4-Stand in die neue Struktur. Mehrere Plätze desselben Dienstes werden in einem Senderordner zusammengefasst; der kleinste gültige Programmplatz ist die bevorzugte Position für Anzeige und Auswahl. Falls noch kein Katalog vorliegt, kann eine gültige alte Antwort aus `channels.items` verwendet werden. Diese Wiederherstellung arbeitet mit den vorhandenen Daten; zusätzlich ist die automatische Senderaktualisierung standardmäßig aktiv. Normale alte Hash- oder Nummernordner werden nach erfolgreicher Anlage des Ersatzes entfernt. Benutzerdefinierte Unterobjekte, `common.custom` und Löschschutz bleiben erhalten; betroffene Altordner bleiben deaktiviert bestehen.

Schalte den TV für den ersten Abgleich ein und schreibe bei Bedarf `channels.refresh=true` mit `ack:false`. Der Adapter lädt die gewählte Liste vollständig mit TV und Radio. Sobald `channels.refreshStatus=ready` und `channels.catalogStatus=ready` stehen, kannst du beispielsweise `channels.tv.Das_Erste_HD.select` prüfen. Für den Radioablauf folgt der gezielte Test unter [Radioauswahl prüfen](#radioauswahl-prüfen). Die Struktur und die Bedeutung der Statuswerte stehen unter [TV- und Radiosender einzeln anwählen](#tv--und-radiosender-einzeln-anwählen). Eine Senderwahl setzt einen erreichbaren Fernseher voraus und startet keinen eigenen Einschaltablauf.

Wenn du zugleich das bisher erfolglose Einschalten prüfen möchtest, beschreibt [Ein- und Ausschalten](#ein--und-ausschalten) den separaten Test mit `control.powerOn` und `info.powerOn`. Für eine Diagnose ohne automatische TV-Abfragen **beide Intervalle**, `pollInterval` und `channelRefreshInterval`, auf 0 setzen. `info.connection` bleibt dann nach dem Start zunächst `false`, bis eine erfolgreiche manuelle TV-Abfrage oder ein Befehl die Verbindung bestätigt.

## Erstinstallation aus der Paketdatei

1. Erzeuge **`iobroker.loewe-tv-0.1.6.tgz`** wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende eine bereits erhaltene Paketdatei dieser Version. Die Datei nicht entpacken.
2. Kopiere sie auf den Rechner, auf dem ioBroker läuft, beispielsweise nach `/tmp/iobroker.loewe-tv-0.1.6.tgz`.
3. Öffne dort ein Terminal oder eine SSH-Verbindung und führe aus:

```bash
iobroker url /tmp/iobroker.loewe-tv-0.1.6.tgz loewe-tv
```

4. Lege beim ersten Installieren eine Instanz an:

```bash
iobroker add loewe-tv
```

5. Öffne in ioBroker Admin **Instanzen → loewe-tv.0 → Einstellungen**. Trage die IP-Adresse des Fernsehers ein und speichere die Konfiguration.
6. **Aktiviere die Instanz `loewe-tv.0`** in der Instanzübersicht. Neue Instanzen werden zunächst deaktiviert angelegt, damit vor dem Start die TV-Adresse eingetragen werden kann.
7. Öffne **Objekte → loewe-tv.0**. Bei erreichbarem Fernseher und aktivierten automatischen Abfragen sollte `info.connection` auf `true` wechseln. Sind beide Abfrageintervalle auf 0 gesetzt, stattdessen `control.refresh = true` auslösen. Mit `remote.home = true` lässt sich anschließend der erste Tastendruck testen; `channels.refresh = true` lädt die vollständige Senderliste.

Der Pfad hinter `iobroker url` muss auf dem ioBroker-Rechner existieren und für die Installation lesbar sein. Ein Downloadpfad auf deinem Handy oder PC genügt nicht. Bei Docker muss die Datei innerhalb des ioBroker-Containers erreichbar sein und der Befehl dort ausgeführt werden. Verwende auf anderen Systemen den entsprechenden absoluten Pfad.

Für das Update einer bestehenden Installation die Anleitung oben verwenden. Eine zusätzliche Instanz ist dafür nicht erforderlich. Lade die Admin-Seite nach dem Update neu, falls noch die bisherige Konfigurationsmaske angezeigt wird.

Diese Installation verwendet den ioBroker-Befehl für eine eigene Paketquelle. Der offizielle js-controller reicht die Paketdatei an seinen Paketinstaller weiter und übernimmt danach die Adapterdateien und Objektdefinitionen. Siehe [ioBroker-Installationscode](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts).

## Konfiguration

### Verbindung

| Einstellung | Standard | Bedeutung |
|---|---:|---|
| Adresse des Fernsehers | leer | IP-Adresse oder Hostname des TVs, ohne `http://`, Pfad oder Port. Eine feste DHCP-Zuordnung im Router ist hilfreich. |
| Statusintervall (`pollInterval`) | 30 Sekunden | 0 deaktiviert automatische Statusabfragen einschließlich der Statusabfrage beim Start. Andernfalls sind ganze Werte von 5 bis 3.600 Sekunden möglich. Die Senderaktualisierung hat ein eigenes Intervall. Manuelle Befehle und `control.refresh` bleiben verfügbar. |
| Senderlistenintervall (`channelRefreshInterval`) | 300 Sekunden | Lädt die gewählte Senderliste automatisch beim Start beziehungsweise nach bestätigter Wiederverbindung und danach im eingestellten Abstand neu. 0 deaktiviert diese Automatik; sonst sind ganze Werte von 60 bis 86.400 Sekunden möglich. `channels.refresh` bleibt manuell verfügbar. |
| Maximale Lautstärke bei direkten Befehlen | 99 | Obergrenze für `control.volume` und `api.SetVolume`. Für den Alltag kann hier beispielsweise 40 stehen. Fernbedienungstasten und Änderungen direkt am TV werden dadurch nicht begrenzt. |
| Aktuelle Wiedergabe abfragen | aktiviert | Fragt bei Statusabfragen zusätzlich die aktuelle Wiedergabe ab, auch bei einem manuellen `control.refresh`. Bei einem Modell ohne Unterstützung für `GetCurrentPlayback` deaktivieren. |

### Einschalten

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
| Zusätzliche TV-Befehle freischalten | deaktiviert | Legt die zusätzlichen `api`-Datenpunkte an und erlaubt die 33 extrahierten SOAP-Aktionen mit eigenen Parametern. Einige davon ändern Senderlisten, Aufnahmen oder Geräteeinstellungen. |

## Datenpunkte verwenden

Die folgenden Namen stehen unter **`loewe-tv.0`**. Bei einer weiteren Instanz ersetzt du die `0` durch deren Instanznummer.

Ein Steuerbefehl wird in ioBroker mit **`ack: false`** geschrieben. `ack: true` steht für einen vom Adapter bestätigten Zustand und löst keinen neuen Befehl aus. Im JavaScript-Adapter ist der dritte Parameter von `setState` dafür vorgesehen:

```javascript
setState('loewe-tv.0.control.volume', 20, false);
```

Bei einem Taster schreibst du `true`. Der Adapter setzt den Taster nach der Verarbeitung wieder auf `false`. Das gilt auch für `remote.home`, `control.refresh` und die `api`-Sendetaster. Für einen weiteren Tastendruck erneut `true` schreiben. Gespeicherte Steuerwerte werden beim Adapterstart nicht erneut gesendet.

Im Objektbaum von Admin beim Schreiben die Bestätigung nicht aktivieren. In Blockly den Block zum **Steuern** verwenden. Ein Aktualisieren mit gesetztem Bestätigungskennzeichen löst keinen Befehl aus. Die Bedeutung von `setState` und `ack` beschreibt die [Dokumentation des ioBroker-JavaScript-Adapters](https://github.com/ioBroker/ioBroker.javascript/blob/master/docs/en/javascript.md#setstate).

### Hauptfunktionen

| Datenpunkt | Typ | Verwendung |
|---|---|---|
| `control.volume` | Zahl, lesen/schreiben | Zum Setzen eine ganze TV-Stufe von 0 bis 99 schreiben. Die konfigurierte Obergrenze gilt zusätzlich. Der Lesewert stammt aus der TV-Rückmeldung. |
| `control.mute` | Wahrheitswert, lesen/schreiben | `true` zum Stummschalten, `false` zum Aufheben. |
| `control.powerOn` | Taster | Startet Wake-on-LAN sofort und sendet anschließend den gezielten Einschaltbefehl 22, sobald die Schnittstelle antwortet. Bekannte TV-MAC-Adresse erforderlich; begrenzte Gesamtdauer und Ablauf in `info.powerOn`. |
| `control.powerOff` | Taster | Bricht einen laufenden Einschaltversuch ab und sendet den gezielten Ausschaltbefehl 25. |
| `control.refresh` | Taster | `true` fragt den TV-Status sowie die Geräteinformationen und Einstellungen erneut ab. |
| `media.text` | Text, schreiben | Schickt einen nicht leeren Text mit höchstens 2.048 Unicode-Zeichen als Tastatureingabe an das aktive Eingabefeld des TVs. |
| `media.backspace` | Taster | Sendet einmal die Rücktaste. |
| `media.locator` | Text, schreiben | Schaltet auf den geschriebenen Sender- oder Medien-Locator um. Den Locator aus einer TV-Antwort übernehmen. |

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

Es handelt sich bei `control.volume` um die Stufen der App. **Nicht mit 10.000 multiplizieren:** Diese Umrechnung erledigt der Adapter. Die Rohantwort lässt sich zusätzlich in `status.volumeRaw` ansehen. Meldet der Fernseher selbst einen Wert oberhalb des Schreibbereichs zurück, bleibt diese Rückmeldung zur Diagnose erhalten.

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
| `radio_mode_on` | Gezielt in den Radiomodus wechseln | 73 |
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

Die sechs Wiedergabetasten von `rewind` bis `stop` verwenden das Tastenalphabet `l2700-hdr`. Die übrigen Tasten verwenden `l2700`. Du musst das bei den Datenpunkten nicht selbst einstellen.

Die neuen Tasten `remote.radio_mode_on` und `remote.tv_mode_on` folgen der [Loewe Remote API 1.0.47, Abschnitt 9.4.1.1, Seite 25](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf). Sie senden jeweils einen Tastendruck einschließlich Loslassen. Diese einzelnen Modustasten wählen keinen bestimmten Sender aus; dafür gibt es die `select`-Taster am Sender. Eine erfolgreiche Übertragung der Taste bestätigt noch nicht den am Gerät erreichten Modus.

`remote.power_all_code` wird nur an den Fernseher dieser Instanz gesendet. Der Name stammt aus der App und bleibt für vorhandene Skripte erhalten. Die [Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) unterscheidet den Umschaltbefehl 12 von `TV_ON` (22) und dem gezielten Ausschaltbefehl 25. **Ab 0.1.2 verwendet `control.powerOff` den Code 25.** `remote.power_off` behält den bisherigen Code 12. Zum Aufwecken aus dem Standby `control.powerOn` verwenden; `remote.power_on` sendet allein die Taste 22 über die bereits erreichbare Steuerschnittstelle.

```javascript
// Einen einzelnen Tastendruck senden.
setState('loewe-tv.0.remote.home', true, false);
```

`remote.text` öffnet Teletext. **`media.text` sendet Texteingaben.** Diese beiden Datenpunkte haben unterschiedliche Aufgaben:

```javascript
// Zuerst am Fernseher ein Textfeld öffnen, dann den Text senden.
setState('loewe-tv.0.media.text', 'Hallo', false);
```

Die zehn Zifferntasten und `epg_alt` wurden in 0.1.1 anhand von Löwenbändiger Remote 1.15 ergänzt. Die bisherigen 29 Tastenbelegungen bleiben unverändert. Auf dem oben beschriebenen bild 7.55 führten die EPG-Codes 15 und 78 laut Nutzer zur gleichen TV-Anzeige. Die Zifferntasten senden einzelne Tastendrücke; ob eine Ziffernfolge eine Senderwahl auslöst, hängt vom TV und vom gerade geöffneten Bildschirm ab.

```javascript
setState('loewe-tv.0.remote.digit_1', true, false);
```

### Senderlisten und Umschalten

**Mit `channels.refresh = true` wird die gewählte Senderliste vollständig abgeglichen.** Bei erreichbarem TV und dem standardmäßigen Senderlistenintervall von 300 Sekunden geschieht das auch automatisch. Ist `channels.view` leer, fragt der Adapter zunächst die tatsächlich vorhandenen Listen ab und wählt daraus eine Senderliste. Nach Möglichkeit wird eine nichtleere `fastscan`-Liste bevorzugt; `avlist`-Eingangslisten werden nicht automatisch gewählt. Die gewählte Kennung wird in `channels.view` eingetragen. Eine bereits gesetzte Kennung bleibt erhalten; eine nicht mehr gültige Kennung führt zu einem Fehler und wird nicht stillschweigend durch eine andere Liste ersetzt.

| Datenpunkt | Typ | Bedeutung |
|---|---|---|
| `channels.view` | Text, lesen/schreiben | Gewünschte Listenkennung aus der TV-Antwort. Leer bedeutet automatische Auswahl. |
| `channels.refresh` | Taster | Lädt die vollständige gewählte Liste für TV und Radio; verwendet dafür eigene Seitenparameter. |
| `channels.start` | Zahl, lesen/schreiben | Startindex für die manuelle Einzelseitenabfrage `channels.getChannels`, Standard 0. |
| `channels.listStart` | Zahl, lesen/schreiben | Eigener Startindex für `channels.getLists`, Standard 0. |
| `channels.count` | Zahl, lesen/schreiben | Seitengröße für `channels.getChannels` und `channels.getLists`, Standard 100, erlaubte Werte 1 bis 500. |
| `channels.mediaType` | Text, lesen/schreiben | Filter für `channels.getChannels`: leer für TV und Radio, `video` nur für TV, `audio` nur für Radio. Standard ist leer. |
| `channels.getLists` | Taster | Fragt die Senderlisten ab `channels.listStart` ab. |
| `channels.getChannels` | Taster | Fragt eine einzelne Senderseite ab `channels.start` ab; löst bei leerer Kennung zuerst die automatische Listenauswahl aus. |
| `channels.availableLists` | JSON-Text, lesen | Aufbereitete Listen der zuletzt abgefragten Seite, mit `view`, `name`, `totalResults` und `hash`. Anfangswert `[]`. |
| `channels.entries` | JSON-Text, lesen | Aufbereitete Sender der zuletzt manuell abgefragten Seite. Anfangswert `[]`. |
| `channels.totalNumber` | Zahl, lesen | Vom TV gemeldete Gesamtzahl der Listeneinträge bei der Seitenabfrage; `-1`, wenn unbekannt. Mehrfachbelegungen werden mitgezählt. |
| `channels.returnedNumber` | Zahl, lesen | Anzahl der Listeneinträge auf der zuletzt manuell empfangenen Seite. |
| `channels.nextStart` | Zahl, lesen | Startindex der nächsten Senderseite. `-1`, wenn keine weitere Seite ermittelt wurde. |
| `channels.nextListStart` | Zahl, lesen | Startindex der nächsten Senderlistenseite. `-1`, wenn keine weitere Seite ermittelt wurde. |
| `channels.lastUpdate` | Zeitstempel, lesen | Letzte erfolgreiche manuelle Sender- oder Senderlistenabfrage, Unixzeit in Millisekunden. |
| `channels.lastError` | Text, lesen | Letzter Fehler der manuellen Abfragen; wird nach erfolgreicher Abfrage geleert. |
| `channels.lastSelection` | JSON-Text, lesen | Diagnose der letzten gestarteten Senderauswahl mit Senderkennung, Kanaladressen, TV-Antworten und Fehlern. Bei Radio zusätzlich der vorherige Modus, ein gegebenenfalls ausgelöster Moduswechsel und die zeitversetzte Prüfung der Wiedergabe. |
| `channels.lists` | JSON-Text, lesen | Unveränderte Struktur der Senderlistenantwort, auch zur Fehlersuche. |
| `channels.items` | JSON-Text, lesen | Unveränderte Struktur der Senderantwort der zuletzt manuell abgefragten Seite. |

`channels.refresh` berücksichtigt `channels.view` und fragt immer beide Medienarten ab. Die manuellen Parameter `start`, `count`, `mediaType` und `listStart` bleiben unverändert. Das Schreiben eines Parameters allein startet keine TV-Anfrage. Um nach einer Änderung der Listenkennung sofort abzugleichen, anschließend `channels.refresh` auslösen.

`channels.entries` enthält pro Sender die Felder `mediaItemUuid`, `name`, `locator`, `caption`, `itemClass`, `attributes`, `thumbnailUrl`, `streamingUrl` und `originalStreamingUrl`. Nicht gelieferte optionale Texte bleiben leer. Für die Senderauswahl den jeweiligen `select`-Taster verwenden. Ein direkt nach `media.locator` geschriebener Locator wird als eigener Medienbefehl gesendet; dieser Weg führt keine Radioauflösung anhand der Senderkennung durch. Eine Senderreferenz oder der sichtbare Name ersetzt den Locator nicht.

Für eine andere Liste zuerst `channels.getLists` auslösen und die gewünschte `view` aus `channels.availableLists` übernehmen. Danach `channels.refresh` auslösen. Falls der TV noch seine Listen synchronisiert, die gemeldete Ursache lesen und den Abruf später erneut starten.

**`channels.getChannels` und `channels.getLists` bleiben Einzelseitenabfragen.** Sobald `channels.getChannels` abgeschlossen ist und `channels.nextStart` einen Wert ab 0 enthält, kannst du diesen Wert nach `channels.start` übernehmen und erneut `channels.getChannels` auslösen. Für weitere Senderlistenseiten entsprechend `channels.nextListStart` nach `channels.listStart` übernehmen und `channels.getLists` auslösen. Die nächste Senderseite ersetzt die vorherigen Seitendaten in `channels.items` und `channels.entries` und ergänzt die Senderobjekte. `-1` allein ist kein Vollständigkeitsnachweis, wenn die TV-Antwort keine ausreichenden Seitenangaben enthält.

Die zusätzlichen Informationen zu TV und Radio folgen dem dokumentierten Anfrageformat in Kapitel 9.7 der [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf). In der eingereichten SL420-Antwort sind beide Medienarten vorhanden: `itemClass=video` für TV und `itemClass=audio` für Radio. Das übergeordnete `ItemClass` hat dort den Textwert `undefined`; für die Zuordnung zählt deshalb die Medienart am einzelnen Listeneintrag.

Beispiel für einen vollständigen Abruf mit automatischer Listenauswahl:

```javascript
async function senderlisteAbfragen() {
    await setStateAsync('loewe-tv.0.channels.view', '', false);
    await setStateAsync('loewe-tv.0.channels.refresh', true, false);
}
senderlisteAbfragen();
```

`setStateAsync` bestätigt hier das Schreiben in ioBroker. Die TV-Abfrage folgt anschließend; `channels.refreshStatus` und `channels.refreshError` zeigen den Abruf, `channels.catalogStatus` die anschließende Objektaufbereitung.

### TV- und Radiosender einzeln anwählen

Für jeden bekannten Senderdienst legt der Adapter einen eigenen Ordner unter **`channels.tv`** oder **`channels.radio`** an. **Die Ordner-ID wird aus dem Sendernamen gebildet. Der angezeigte Name ist die bevorzugte Speicherposition; die Beschreibung bleibt der Sendername.** Intern steht die Position als Text in `common.name`, der Sendername in `common.desc`. Jeder Sender hat einen `select`-Taster und einen eigenen `epg`-Unterordner.

Beispiele aus der gemeldeten Senderbelegung:

| Ordner-ID | Name (`common.name`) | Beschreibung (`common.desc`) |
|---|---|---|
| `channels.tv.Das_Erste_HD` | `1` | Das Erste HD |
| `channels.tv.ZDF_HD` | `2` | ZDF HD |
| `channels.tv.RTL_Television` | `3` | RTL Television |
| `channels.radio.Bayern_1` | `100` | Bayern 1 |

Leerzeichen und Sonderzeichen im Sendernamen werden für die ID zu Unterstrichen, Umlaute zu `ae`, `oe` beziehungsweise `ue` und `ß` zu `ss`. So kann beispielsweise aus „WDR HD Köln“ die ID `WDR_HD_Koeln` werden. Der vollständige Sendername bleibt als Beschreibung und im Datenpunkt `name` erhalten. Verschiedene Dienste mit demselben bereinigten Namen werden über einen stabilen Suffix aus der Dienstidentität unterschieden. Die Programmposition ist kein Bestandteil dieses Suffixes. TV und Radio bleiben auch bei identischen Namen getrennt.

**Zum Umschalten `select = true` mit `ack: false` schreiben.** In ioBroker Admin also die Bestätigung beim Schreiben nicht aktivieren; in Blockly den Block zum Steuern verwenden. Der Taster kehrt nach der Verarbeitung auf `false` zurück. Er ist ein Befehl zum Anwählen des Senders und kein dauerhafter Ein/Aus-Zustand. Der Fernseher muss erreichbar sein. Der Taster startet kein Wake-on-LAN; dafür gibt es weiterhin `control.powerOn`.

```javascript
// Das Erste HD auf seinem aktuellen bevorzugten Programmplatz anwählen.
setState('loewe-tv.0.channels.tv.Das_Erste_HD.select', true, false);
```

Während eine neu empfangene Senderantwort in den Bestand übernommen wird, kann die Auswahl kurz mit `CHANNEL_UPDATING` abgewiesen werden. Das gilt auch für einen wartenden Tastendruck, wenn inzwischen eine weitere Senderliste empfangen wurde. Nach der Aktualisierung erneut auswählen; der Adapter sendet dadurch keinen veralteten Umschaltauftrag.

| Datenpunkt im Senderobjekt | Inhalt |
|---|---|
| `select` | Taster zum Umschalten. TV verwendet den Listen-Locator der bevorzugten Position. Radio löst die Dienstkennung mit `GetMediaItem` auf und wartet vor der Senderwahl auf einen bestätigten Radiomodus. |
| `name` | Sendername. |
| `number` | Kleinster gültiger Programmplatz dieses Dienstes; seine Textdarstellung ist der angezeigte Ordnername. |
| `numbers` | JSON-Liste mit den Originalbeschriftungen aller bekannten Programmplätze dieses Dienstes. |
| `mediaItemUuid` | Dienstkennung aus der TV-Antwort. |
| `locator` | Original-Locator der bevorzugten Position aus der Senderliste. Eine bei Radio zusätzlich aufgelöste Kanaladresse steht in `channels.lastSelection`. |
| `locators` | JSON-Liste mit den Original-Locators aller bekannten Programmplätze dieses Dienstes. |
| `positions` | JSON-Liste mit den zusammengehörenden Werten `caption` und `locator` aller bekannten Positionen. |
| `listView` | Kennung der zugehörigen Senderliste. |
| `available` | Ob der Sender im bekannten aktiven Bestand eindeutig zugeordnet und über einen verwendbaren Locator auswählbar ist; kein Empfangs-, Wiedergabe- oder Bildschirmstatus. |
| `epg.status` | In 0.1.6 fest `notImplemented`: Der Ordner ist für den späteren EPG-Import vorbereitet. |

Ein Sender kann mehrfach in der TV-Liste stehen. Das Erste HD auf 1, 100 und 1000 ergibt **einen Ordner**: `channels.tv.Das_Erste_HD`. `numbers`, `locators` und `positions` enthalten alle drei Belegungen. `number`, der angezeigte Ordnername und die direkte TV-Auswahl verwenden die kleinste gültige Position, in diesem Beispiel 1. Entfernst du diesen Platz und bleiben 100 und 1000 erhalten, wird nach dem vollständigen Abgleich Platz 100 bevorzugt. Der Ordnerpfad bleibt gleich. Bei Radio bleibt diese Position in den Listenmetadaten erhalten; die Auflösung über `GetMediaItem` kann einen anderen gültigen Locator desselben Dienstes zurückgeben.

Die Programmposition wird aus der gültigen numerischen Beschriftung des Eintrags bestimmt; führende Nullen entfallen in `number` und im angezeigten Ordnernamen. Fehlt eine brauchbare Beschriftung, kann die Nummer aus einem passenden `channel://`-Locator übernommen werden. Originalbeschriftung und Original-Locator bleiben in den Positionsdaten erhalten. Eine widersprüchliche oder nicht eindeutig zuordenbare Position wird nicht als Umschaltziel verwendet.

**Beim Umsortieren bleibt die Sender-ID erhalten.** Verschiebst du Das Erste HD von Platz 1 auf Platz 7, bleibt `channels.tv.Das_Erste_HD` bestehen. Nach dem vollständigen Abgleich zeigen `number` und der Ordnername den Wert 7; `locator` und der Taster verwenden die neue Position. Das vorhandene Skript mit `channels.tv.Das_Erste_HD.select` steuert weiterhin Das Erste HD. Voraussetzung ist, dass Platz 7 dann die kleinste noch vorhandene Position dieses Dienstes ist. Eine echte Umbenennung am TV ändert dagegen die aus dem Namen gebildete ID. EPG- und Aufnahmeregeln müssen zusätzlich `mediaItemUuid`, Medienart und Listenbezug erhalten, damit gleichnamige Dienste eindeutig zugeordnet bleiben.

#### Radioauswahl in 0.1.6

Die echte Diagnose aus 0.1.5 grenzt den Fehler ein: Für **sunshine live** liefert `GetMediaItem` einen Audioeintrag mit `itemInfoClass=object.item.audioItem` und denselben `channel://…`-Locator wie die Senderliste. `ZapToMedia` meldet `Result=0`, obwohl der TV nach Nutzerbeobachtung nicht auf Radio wechselt. Die damalige sofortige Wiedergabeabfrage zeigt weiterhin `Mode=tv` und den vorherigen TV-Sender. Sie wurde bereits nach insgesamt rund 77 Millisekunden gelesen. Eine Annahme des Auftrags genügt damit nicht als Wiedergabebestätigung.

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) dokumentiert `RADIO_MODE_ON=73` und `TV_MODE_ON=72` im Tastenalphabet `l2700` (Abschnitt 9.4.1.1, Seite 25). `ZapToMedia` bleibt auch für Radio der dokumentierte Senderbefehl mit `Player=0` für die Hauptwiedergabe und einem `channel://…`-Locator (Abschnitt 9.9.1, Seite 44). Das [Loewe-Benutzerhandbuch für bild-Geräte, Seite 75](https://cdn.loewe.tv/manuals_new/TV_BA/SL3xx_SL4xx/universelles%20Benutzerhandbuch%20f%C3%BCr%20alle%20bild%20Ger%C3%A4te/36960000_UH_bild_universal_3l_DE_180813.pdf) beschreibt bei der Fernbedienung den Einstieg in den DVB-Radiobetrieb vor der Senderauswahl. Diese Quellen und die reale Diagnose begründen den zusätzlichen Modusschritt; sie belegen noch keinen erfolgreichen SOAP-Ablauf auf dieser Firmware.

Ein Radiosendertaster führt nun folgende Schritte aus:

1. Die Dienstkennung mit `GetMediaItem` auflösen und den Locator des ausgewählten Audiodienstes prüfen. Dieser Schritt folgt weiterhin dem nachvollzogenen Ablauf von Löwenbändiger Remote 1.15; die [extrahierten Vorlagen](docs/remote115-protocol.json) sind dokumentiert.
2. Den aktuellen Modus mit `GetCurrentPlayback` lesen. Ist er bereits `radio`, unmittelbar mit der Senderwahl fortfahren. Andernfalls einmal `radio_mode_on` senden und mit weiteren Wiedergabeabfragen auf `Mode=radio` warten.
3. Erst nach bestätigtem Radiomodus den aufgelösten Locator einmal mit `ZapToMedia`, `Player=0`, senden. Wird der Radiomodus nicht erreicht, endet der Auftrag mit `CHANNEL_SELECTION`; es wird kein Senderauftrag gesendet.
4. Die Wiedergabe erstmals nach 500 Millisekunden erneut lesen. Weitere Prüfungen erfolgen im Abstand von 500 Millisekunden innerhalb eines begrenzten Beobachtungsfensters. Nur diese Abfragen werden wiederholt, nicht die Modustaste oder der Senderauftrag.

Für das Erreichen des Radiomodus stehen höchstens **6 Sekunden**, für die Beobachtung nach `ZapToMedia` höchstens **3 Sekunden** bereit. Für weitere TV-Anfragen und Wartezeiten gilt eine gemeinsame **15-Sekunden-Frist ab Beginn der Auswahl**; einzelne Anfragen behalten zusätzlich das konfigurierte Antwortzeitlimit. Das verbleibende Budget kann einen späteren Schritt verkürzen. Die Verarbeitung bleibt asynchron. ioBroker-Datenbankoperationen einschließlich der abschließenden Diagnose verwenden eigene Zeitlimits von jeweils zwei Sekunden. Die 15 Sekunden sind deshalb keine absolute Zusage für die Gesamtdauer einschließlich aller Datenbankschritte.

Ein ausdrücklicher Ein-/Ausschaltauftrag, eine der beiden neuen Remote-Modustasten, `media.locator` oder das Stoppen der Instanz bricht eine laufende beziehungsweise noch wartende Radioauswahl ab. Bereits übertragene Gerätebefehle können nicht zurückgenommen werden. Weitere normale Sendertaster und rohe Expertenbefehle werden weiterhin in ihrer Warteschlangenreihenfolge verarbeitet.

Laut Herstellerabschnitt 9.10 sind `Locator` und `MediaItemUuid` bei `GetCurrentPlayback` nur für TV zugesichert. **`Mode=radio` allein bestätigt deshalb weiterhin nur den Modus.** Die in der echten Antwort gelieferte Platzhalterkennung `chl0:00-00000000ffff00000000` zählt nicht als Identität eines Senders; sie bleibt in der Rohantwort zur Diagnose erhalten.

| Feld in `channels.lastSelection` | Bedeutung |
|---|---|
| `requested` | Angeforderter Sender mit `id`, `name`, `number`, `itemClass`, `mediaItemUuid` und `listView`. Die aufbereitete Medienart eines Radioeintrags ist `audio`. |
| `detail` | Aufbereitete Senderdetails aus `GetMediaItem`, einschließlich `itemClass` und originalem `itemInfoClass`. |
| `listLocator`, `resolvedLocator`, `locatorSource` | Ursprüngliche Kanaladresse, aufgelöste Kanaladresse und deren Quelle. Bei Radio ist die Quelle nach erfolgreicher Auflösung `GetMediaItem`. |
| `playbackBefore` | Aufbereitete Wiedergabe vor einem möglichen Moduswechsel. |
| `modeSwitch` | Ob die Modustaste gesendet wurde (`attempted`), welche Taste vorgesehen ist (`key`), ob der Radiomodus bestätigt wurde (`confirmed`) und die zeitlich zugeordneten Beobachtungen in `observations`. |
| `status`, `phase`, `result` | Verarbeitungsergebnis, erreichter Schritt und numerisches `ZapToMedia`-Ergebnis. `result=null` bedeutet, dass kein auswertbares Ergebnis vorliegt. |
| `verification`, `stationConfirmed` | Aussage der Wiedergabeprüfung. `radioModeOnly` bestätigt nur den Modus; `station` mit `stationConfirmed=true` zusätzlich eine passende Dienstkennung oder Kanaladresse. |
| `getMediaItemResponse`, `playbackBeforeResponse`, `zapResponse`, `playbackResponse` | Größenbegrenzt gespeicherte Antworten der ausgeführten Schritte. |
| `playbackObservations`, `playbackUuidIgnored` | Zeitlich zugeordnete Beobachtungen nach der Senderwahl und Angabe, ob die zuletzt gelieferte Dienstkennung als Platzhalter ignoriert wurde. |
| `playback`, `error`, `playbackError` | Zuletzt nach der Senderwahl beobachtete Wiedergabe und gegebenenfalls Ablauf- oder Beobachtungsfehler. |
| `startedAt`, `finishedAt` | Beginn und Ende der Verarbeitung als Unixzeit in Millisekunden. |

Bei Radio bedeutet `status=confirmed`, dass die Wiedergabeprüfung den gewünschten Sender bestätigt hat. `accepted` steht für `Result=0` mit bestätigtem Radiomodus, aber ohne genaue Senderidentität. `unconfirmed` kennzeichnet eine ausbleibende Wiedergabebestätigung; `error` einen Ablauf- oder ausdrücklich gemeldeten Befehlsfehler. Während der Verarbeitung gilt `running`. Ein vom TV ausdrücklich von null abweichendes `ZapToMediaResponse.Result` wird als Fehler behandelt. `differentMode` oder `differentStation` beschreibt die beobachtete Abweichung; `unknown`, `readFailed` und `notChecked` bestätigen keine Wiedergabe. Auch eine erfolglose zeitversetzte Beobachtung beweist nicht, dass der TV nie mehr umschalten wird.

#### Radioauswahl prüfen

1. Version **0.1.6** installieren und die vorhandene Instanz starten. Den Fernseher einschalten und zunächst einen TV-Sender wiedergeben. Bei Bedarf `channels.refresh=true` auslösen und auf `channels.catalogStatus=ready` warten.
2. Den Radiosendertaster für **sunshine live** einmal auslösen, sofern dieser Sender im eigenen Bestand vorhanden ist:

```javascript
setState('loewe-tv.0.channels.radio.sunshine_live.select', true, false);
```

3. Den Ablauf abschließen lassen und am Fernseher prüfen, ob sunshine live tatsächlich zu hören ist. Danach **`channels.lastSelection`** lesen. Der zurückgesetzte Taster allein bestätigt keine Wiedergabe.

Falls es weiterhin nicht funktioniert, genügt zunächst dieser Diagnosewert mit der Angabe, welcher Modus vor dem Versuch aktiv war. Er enthält auch die Modusprüfung und den Senderauftrag. Bleibt `startedAt` unverändert, zusätzlich `info.lastError` lesen, da der Auftrag schon vor seinem Start abgewiesen worden sein kann. Die gesamte Senderliste muss nicht erneut kopiert werden.

Als optionaler getrennter Diagnoseschritt lässt sich anschließend `remote.radio_mode_on=true` auslösen. Nach etwa zwei Sekunden `control.refresh=true` senden und `status.playback` sowie die sichtbare beziehungsweise hörbare Reaktion am Gerät prüfen. Das zeigt, ob bereits die einzelne dokumentierte Modustaste angenommen wird. Die abgeschlossene `channels.lastSelection` des vorherigen Senderversuchs bleibt dafür erhalten. Der Erfolg des neuen Radioablaufs am SL420 ist erst durch den Gerätetest bestätigt.

#### Gespeicherter Senderbestand und Aktualisierung

**Ja, die Senderobjekte werden an die Konfiguration des Fernsehers angepasst.** Bei aktivem `channelRefreshInterval` erfolgt der Abgleich automatisch beim Start, nach einer tatsächlich erkannten Wiederverbindung und anschließend im eingestellten Abstand. Standard sind 300 Sekunden. Ist der TV bei aktiviertem Statuspolling bereits als nicht erreichbar bekannt, wartet der Senderabruf auf die Wiederverbindung. Bei deaktiviertem Statuspolling versucht die Senderaktualisierung den Abruf selbst. Ein laufender Abgleich wird nicht parallel gestartet und weckt den TV nicht auf.

Mit `channels.refresh=true` kannst du jederzeit einen vollständigen Abgleich anfordern, auch wenn das Senderlistenintervall 0 ist. Die Statusabfragen über `pollInterval` und `control.refresh` bleiben davon unabhängig. Für einen rein manuellen Betrieb beide Intervalle auf 0 setzen.

Der Komplettabruf liest ab Startindex 0 mit höchstens 500 Einträgen je Seite. Eine Liste mit mehreren Seiten wird zweimal vollständig gelesen und nur bei übereinstimmendem Inhalt übernommen. Dadurch werden während des Abrufs geänderte Listen nicht als sicherer Gesamtbestand behandelt. Ein Lauf ist auf 2.000 Programmplätze, 20 Seiten je Durchlauf und ein Zeitlimit von 120 Sekunden für den Abruf begrenzt. Für den gespeicherten Katalog gelten weiterhin 480 KiB. Bei überschrittenen Grenzen oder einer nicht eindeutig auswertbaren Antwort bleibt der bisherige Bestand erhalten.

Nach einem erfolgreichen vollständigen Abgleich werden neue Senderordner angelegt und die Positionen vorhandener Sender aktualisiert. Ordner für nicht mehr vorhandene, vom Adapter verwaltete Sender werden entfernt. **Fehler, Standby und einzelne Teilantworten lösen keine Entfernung fehlender Sender aus.** Manuell geladene Teilseiten ergänzen beziehungsweise aktualisieren eindeutig beobachtete Senderdaten und erhalten die übrigen Einträge. Eine einzelne vollständige und gültige manuelle Antwort kann ebenfalls einen Abgleich auslösen; bei Filter `video` bleibt Radio erhalten und bei `audio` entsprechend TV. Eine bloße Folge manueller Teilseiten gilt nicht als Nachweis eines vollständigen Bestands.

Benutzerdefinierte Kinder, Objekte mit `common.custom` und Objekte mit `common.dontDelete` werden bei der Bereinigung geschützt. Benötigte alte Ordner bleiben dann als deaktivierte Reste mit `available=false` und gesperrter Auswahl bestehen. Das betrifft auch geschützte Hash-Ordner aus 0.1.3 und Nummernordner aus dem ersten 0.1.4-Stand. Normale verwaltete Altobjekte ohne solche Ergänzungen werden entfernt. Beim Wechsel der gewählten Senderliste bildet die Struktur nach dem vollständigen Abgleich den Senderbestand dieser Liste ab.

Die Zuordnung bleibt über einen Adapterneustart hinweg erhalten. Wiederherstellung und Migration verwenden den gespeicherten Katalog, verwaltete Senderobjekte oder eine vorhandene Antwort in `channels.items`; gespeicherte Tasterwerte werden zurückgesetzt und führen keinen Umschaltbefehl aus. Die Objektaufbereitung läuft in begrenzten Abschnitten im Hintergrund und belegt die TV-Befehlswarteschlange nicht. Bei größeren Listen können Ordner deshalb nach und nach erscheinen.

| Datenpunkt | Bedeutung |
|---|---|
| `channels.refreshStatus` | `disabled`: Automatik aus; `waiting`: Warten auf einen wieder erreichbaren TV; `updating`: Komplettabruf läuft; `ready`: vollständiger Bestand an die Objektaufbereitung übergeben; `error`: Abruf fehlgeschlagen. |
| `channels.refreshError` | Fehler des letzten Komplettabrufs. |
| `channels.refreshLastUpdate` | Zeitpunkt der letzten erfolgreichen Übergabe einer vollständig geprüften Liste, Unixzeit in Millisekunden. |
| `channels.refreshCount` | Anzahl der Einträge in der zuletzt vollständig geladenen Liste. |
| `channels.catalog` | Versionierter JSON-Katalog für Wiederherstellung und Zusammenführung der eingelesenen Senderdaten. |
| `channels.catalogStatus` | `empty`: noch kein Bestand aufgebaut; `updating`: Aufbereitung läuft; `ready`: Aufbereitung abgeschlossen; `error`: Aufbereitung fehlgeschlagen. |
| `channels.catalogError` | Fehler beim Wiederherstellen oder Aufbereiten des Senderbestands. |
| `channels.catalogLastUpdate` | Letzte erfolgreiche Objektaufbereitung als Unixzeit in Millisekunden. Eine Wiederherstellung kann diesen Wert aktualisieren; er belegt weder einen frischen TV-Abruf noch TV-Erreichbarkeit. |

`channels.refreshStatus=ready` bestätigt die Übergabe des vollständigen Abrufs. **Erst `channels.catalogStatus=ready` bestätigt die abgeschlossene Objektaufbereitung.** Für die manuelle Seitenabfrage stehen weiterhin `channels.lastError`, `channels.items` und `channels.entries` bereit. Ein alter erfolgreicher Statuswert ist kein aktueller Empfangs- oder Bildschirmstatus.

**EPG-Inhalte werden in dieser Version noch nicht geladen.** Spätere Sendungslisten, Aktualisierungszeiten und EPG-Fehler sollen direkt unter `channels.tv.<Sender-ID>.epg` beziehungsweise `channels.radio.<Sender-ID>.epg` liegen, beispielsweise `channels.tv.Das_Erste_HD.epg`. Der vorhandene Datenpunkt `epg.status` hat den Wert `notImplemented`. Mehrere Programmplätze desselben Dienstes teilen sich diesen EPG-Ordner. Die spätere EPG-Zuordnung erfolgt anhand der Senderkennung.

### Status und Gerätedaten

| Datenpunkt | Bedeutung |
|---|---|
| `info.connection` | Ob der Fernseher zuletzt über die Steuerschnittstelle erreichbar war. |
| `info.lastSeen` | Zeitpunkt der letzten erfolgreichen Kommunikation als Unix-Zeit in Millisekunden. |
| `info.lastError` | Letzter gemeldeter Fehler. Wird nach einem erfolgreichen Vorgang wieder geleert. |
| `info.lastCommand` | Zuletzt verarbeiteter Steuerbefehl. |
| `info.lastCommandAt` | Zeitpunkt dieses Steuerbefehls als Unix-Zeit in Millisekunden. |
| `info.lastResponse` | Letzte protokollierte Antwort als JSON-Text. Bei Lautstärke und Stummschaltung enthält sie den bereits ausgewerteten Wert. |
| `info.commandPending` | Ob gerade ein Steuerbefehl oder eine Statusabfrage bearbeitet wird beziehungsweise weitere Vorgänge warten. |
| `info.wakeReady` | `true`, wenn eine formal gültige TV-MAC-Adresse zum Paketversand bekannt ist. Dies ist keine Bestätigung der Wake-on-LAN-Fähigkeit des TVs. |
| `info.lastWakeOnLan` | Letzter erfolgreicher Wake-on-LAN-Paketversand als JSON mit `macs`, `broadcast`, `targets`, `port`, `repeats` und `sentAt`. `sentAt` ist der Auslösezeitpunkt als Unix-Zeit in Millisekunden. |
| `info.powerOn` | Einschaltablauf als JSON, unter anderem mit `phase`, `startedAt`, `updatedAt`, `deadline`, `attempts` und `wakeBursts`. Die Phase `powerKeySent` bestätigt keinen sichtbaren Bildschirminhalt. |
| `status.volume` | Zuletzt vom Fernseher gelesene Lautstärke in App-Stufen. |
| `status.volumeRaw` | Rohwert der Lautstärke im Loewe-Protokoll. |
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

JSON-Antworten werden bis 512 KiB in einem Datenpunkt gespeichert. Größere Antworten werden durch einen JSON-Hinweis mit `omitted`, `bytes`, `limit` und `reason` ersetzt. Für `info.lastResponse` gilt eine Grenze von 64 KiB. Diese Grenzen halten große Sender- oder Archivlisten aus häufig aktualisierten Diagnosewerten heraus.

Für eine vollständige Texteingabe über `media.text` gilt ein Gesamtzeitlimit von 15 Sekunden, einschließlich einer gegebenenfalls erforderlichen Anmeldung. Danach wird die Eingabe abgebrochen und ein Fehler gemeldet. Bereits übertragene Zeichen können im TV-Eingabefeld stehen bleiben; vor einem erneuten Senden deshalb den sichtbaren Text prüfen. Kurze Texte vermeiden lange Wartezeiten zwischen aufeinanderfolgenden Zeichen.

## Zusätzliche SOAP-Befehle

Aktiviere in der Konfiguration **Zusätzliche TV-Befehle freischalten** und starte die Instanz mit dieser Konfiguration neu. Unter `api` erscheint für jede der 33 extrahierten Aktionen ein eigener Kanal. Wenn du die Option später wieder deaktivierst, können die vorhandenen Objekte sichtbar bleiben; ihre API-Befehle werden dann nicht ausgeführt.

Jeder Kanal hat diese Datenpunkte:

| Datenpunkt innerhalb `api.<Aktion>` | Verwendung |
|---|---|
| `parametersXml` | XML-Fragment mit den Parametern der Aktion, ohne SOAP-Hülle und ohne `ClientId` oder `fcid`. |
| `send` | `true` sendet die Aktion mit den aktuellen Parametern. |
| `responseJson` | Letzte Antwort dieser Aktion als JSON-Text; oberhalb von 512 KiB ein Hinweis auf die ausgelassene Antwort. |
| `responseXml` | Letzte XML-Antwort dieser Aktion bis 512 KiB. Größere XML-Antworten werden nicht gespeichert; der Wert wird geleert und `lastError` enthält einen Hinweis. |
| `lastError` | Letzter Fehler dieser Aktion. |

Das Schreiben von `parametersXml` speichert die Parameter. Erst `send = true` führt die Anfrage aus. Die Anmeldung und die Einfügung der aktuellen `ClientId` übernimmt der Adapter. Fehlende erforderliche Parameterelemente werden vor dem Senden abgewiesen. `parametersXml` ist auf 1 MiB begrenzt. Welche Namen, Locators, Timerwerte oder Funktionspakete dein TV akzeptiert, muss aus dessen Antworten beziehungsweise den zugehörigen Protokollinformationen stammen.

Bei `api.SetVolume` gilt dieselbe konfigurierte Lautstärkeobergrenze wie bei `control.volume`, umgerechnet in den Rohwert mit dem Faktor 10.000. Auch über diesen API-Kanal werden höhere Werte abgewiesen.

### Beispiele

Die Timerliste benötigt keine zusätzlichen Parameter:

```javascript
setState('loewe-tv.0.api.GetTimerList.send', true, false);
```

Die Antwort steht danach in `api.GetTimerList.responseJson` beziehungsweise `api.GetTimerList.responseXml`.

Zum Abfragen der ersten 50 Archiveinträge:

```javascript
async function archivAbfragen() {
    await setStateAsync(
        'loewe-tv.0.api.GetDRPlusArchive.parametersXml',
        '<QueryParameters><Range startIndex="0" maxItems="50"/></QueryParameters>',
        false
    );
    await setStateAsync('loewe-tv.0.api.GetDRPlusArchive.send', true, false);
}
archivAbfragen();
```

Dieser Aufruf liest das Archiv. Er programmiert keine Aufnahme.

### Verfügbare Aktionen

| Bereich | Aktionen |
|---|---|
| Anmeldung und Gerät | `RequestAccess`, `GetDeviceData`, `GetFeature` |
| Fernbedienung und Tastatur | `InjectRCKey`, `InjectKeyboardKey` |
| Ton | `GetVolume`, `SetVolume`, `GetMute`, `SetMute` |
| Senderlisten | `GetListOfChannelLists`, `GetChannelList`, `ExportServiceLists`, `ImportServiceLists` |
| Medien und Wiedergabe | `GetMediaItem`, `GetMediaEvent`, `GetCurrentPlayback`, `ZapToMedia`, `PlayMultiroom` |
| Aufnahmen und Datenträger | `GetDRPlusArchive`, `GetVolumes`, `ProgramTimer`, `GetTimerList` |
| Favoritenlisten | `AddFavoriteList`, `RemoveFavoriteList`, `RenameFavoriteList` |
| Favoriteneinträge | `AddServicesFavoriteList`, `MoveServicesFavoriteList`, `RemoveServicesFavoriteList` |
| Einstellungen | `GetSettings`, `SetSetting`, `ActivateFeaturePackage` |
| Tabellenabfragen | `CreateIterator`, `CloseIterator` |

`GetVolume` fragt die Lautstärke ab, **`GetVolumes` die Datenträger**. Der generische API-Zugang nimmt rohe Protokollparameter entgegen. Für tägliche Lautstärkeregelung, Fernbedienung und Texteingabe sind die bereits erläuterten Datenpunkte einfacher zu verwenden.

### Parameterreferenz aller Aktionen

Die Tabelle nennt die XML-Elemente innerhalb von `parametersXml`. `A/B` bezeichnet ein Element `B` innerhalb von `A`, `@name` ein XML-Attribut. XML-Groß- und Kleinschreibung beachten. Textwerte mit XML-Sonderzeichen müssen korrekt maskiert werden, beispielsweise `&amp;` für `&`.

`fcid`, `ClientId`, den Aktionsnamen und die SOAP-Hülle nicht mitgeben. Die vollständigen extrahierten HTTP- und XML-Vorlagen samt Belegmetadaten liegen in [docs/protocol-templates.json](docs/protocol-templates.json). Darin stehen die Platzhalter der Original-App; zum Senden werden sie durch konkrete TV-Werte ersetzt. Bei komplexen Aktionen zeigt diese Datei auch die Reihenfolge und Verschachtelung aller Elemente.

| Aktion | Zusätzliche XML-Parameter |
|---|---|
| `RequestAccess` | Keine. Die feste Anmeldeanfrage wird automatisch erzeugt. |
| `GetDeviceData` | Keine. |
| `GetFeature` | `Name`. |
| `GetListOfChannelLists` | `QueryParameters/Range` mit `@startIndex` und `@maxItems`. |
| `GetChannelList` | `ChannelListView`; `QueryParameters/Range` mit `@startIndex` und `@maxItems`. Die ursprüngliche App ergänzt `OrderField` mit `field="userChannelNumber"`, `type="ascending"`, `MediaItemInformation=true` und `MediaItemClass=video`. Der Komfortabruf ab 0.1.2 setzt den Medienfilter nur bei entsprechend gewähltem `channels.mediaType`. |
| `GetMediaItem` | `MediaItemReference` mit `@mediaItemUuid`. |
| `GetMediaEvent` | `MediaEventReference` mit `@mediaEventUuid`. |
| `GetDRPlusArchive` | `QueryParameters/Range` mit `@startIndex` und `@maxItems`; optional `VolumeId`. |
| `ExportServiceLists` | Keine. |
| `ImportServiceLists` | `Data` mit dem passenden Exportinhalt. |
| `ZapToMedia` | `Player` mit dem App-Wert `0`; `Locator`. |
| `GetCurrentPlayback` | Keine. |
| `RemoveFavoriteList` | `ViewName`. |
| `AddFavoriteList` | `Name`, `AdditionalAttributes`. |
| `RenameFavoriteList` | `ListViewName`, `NewName`. |
| `GetMute` | Keine. |
| `SetMute` | `Value`, `1` für stumm, `0` für die abgeleitete Gegenoperation. |
| `GetVolume` | Keine. |
| `SetVolume` | `Value` als Protokollrohwert; App-Stufe × 10.000. |
| `PlayMultiroom` | `Locator`, `AncestorUuid`, `MultiroomClientIds/MultiroomClientId` mit `@id` für die beteiligten Clients. |
| `InjectRCKey` | `InputEventSequence/RCKeyEvent`, jeweils mit `@alphabet`, `@mode` und `@value`. |
| `InjectKeyboardKey` | `InputEventSequence/KeyboardKeyEvent`, jeweils mit `@mode`, `@modifiers` und `@value`. |
| `AddServicesFavoriteList` | `ViewName`; `LocatorSequence/Locator` mit dem Attribut `@Locator`. |
| `MoveServicesFavoriteList` | `ViewName`, `NumBegin`, `NumEnd`, `NumNewPosition`. |
| `RemoveServicesFavoriteList` | `ViewName`, `NumBegin`, `NumEnd`. |
| `GetSettings` | Keine. |
| `SetSetting` | `Name`, `Value`. |
| `GetVolumes` | `QueryParameters/Range` mit `@startIndex`, `@maxItems`; `AdditionalParameters/Properties` mit `@isActiveList`, `@hasPurpose`. |
| `ProgramTimer` | `Device`, `RecordingType`, `Locator`; `Timer` mit `@starttime` als Unixsekunden, `@duration` in Sekunden und `@repeatDays`. Die Original-App verwendet `PVR`, `default` und `repeatDays=0`. Siehe [Aufnahme-Roadmap](docs/ROADMAP.md#aufnahmebefehle-aus-dem-tatsächlichen-app-ablauf). |
| `GetTimerList` | Keine. |
| `CreateIterator` | `TableName`, `Type`, `Selections`, `Fields`, `Orders`, `NotifyUpdate`. |
| `CloseIterator` | `Ids`. |
| `ActivateFeaturePackage` | `Package`. |

Die Extraktion liefert die Namen und den Aufbau dieser Parameter. Für `ProgramTimer` sind inzwischen die oben genannten Werte und Zeiteinheiten aus dem tatsächlichen App-Ablauf nachvollzogen. Andere Werte für `RecordingType`, die Wahl bestimmter Aufnahmeziele, weitere `repeatDays`-Werte oder TV-spezifische Einstellungsnamen sind dadurch nicht vollständig spezifiziert. Die Aufnahmefunktion muss am konkreten Gerät geprüft werden.

## Ein- und Ausschalten

Die [Loewe Remote API 1.0.47, Kapitel 9.4.3](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf), unterscheidet das Aufwecken des Netzwerkdiensts vom interaktiven Einschalten. Abhängig von `WolInteractive` kann ein Magic Packet allein den Bildschirm ausgeschaltet lassen. Deshalb verwendet der Adapter ab 0.1.2 den anschließenden gezielten `TV_ON`-Befehl 22. Diese dokumentierte Unterscheidung erklärt einen möglichen Fehler im bisherigen Ansatz; ob sie Svens konkretes Einschaltproblem vollständig behebt, ist erst nach dem Gerätetest bekannt.

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

1. Den Fernseher zum Einrichten einschalten. Die passende LAN- oder WLAN-MAC-Adresse manuell konfigurieren oder mit `control.refresh` aus den Gerätedaten lernen. Das Einschalten über LAN muss am TV aktiviert sein.
2. `info.wakeReady` prüfen. `true` bedeutet, dass eine MAC-Adresse bekannt ist. Nach einer gültigen Geräteabfrage zeigen außerdem `device.wolEnabled` und `device.wolInteractive` die vom TV gemeldeten Einstellungen. Ein unbekannter Wert bedeutet keine bestätigte Deaktivierung.
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
| `info.connection` bleibt `false` | Sind beide Intervalle 0, zunächst `control.refresh` auslösen. Sonst Fernseher einschalten, IP-Adresse und Port 905 prüfen und `info.lastError` lesen. Router-, Gastnetz- oder VLAN-Trennung prüfen. |
| Verbindung bricht nach einem TV-Neustart ab | Einen weiteren Statuszyklus abwarten oder `control.refresh` auslösen. Die Anmeldung wird vom Adapter verwaltet. |
| Einzelne Anfrage meldet einen SOAP-Fehler | Die Schnittstelle ist erreichbar, diese Aktion oder ihre Parameter werden aber möglicherweise vom TV nicht unterstützt. Bei Wiedergabeproblemen `pollPlayback` deaktivieren. |
| Schreiben eines Datenpunkts bewirkt nichts | Mit `ack: false` schreiben. Taster erwarten `true`; Parameterfelder der API führen ohne den zugehörigen `send`-Taster keine Anfrage aus. |
| Lautstärke lässt sich nicht hoch genug setzen | Den Wert und die konfigurierte maximale Lautstärke prüfen. `control.volume` erwartet eine ganze App-Stufe, keinen Protokollrohwert. |
| `info.wakeReady` ist `false` | Die passende TV-MAC-Adresse manuell konfigurieren oder bei eingeschaltetem TV `control.refresh` auslösen. Bei `pollInterval=0` wird die MAC-Adresse beim Start nicht automatisch abgefragt. |
| `info.wakeReady` ist `true`, aber der TV startet nicht | Den aktuellen Eintrag in `info.lastWakeOnLan` und den Ablauf in `info.powerOn` prüfen. Nach dem Ausschalten mindestens 30 Sekunden warten. `powerKeySent` bestätigt nur die Antwort auf den Einschaltbefehl, kein Bild. |
| Ein Einschaltversuch aktualisiert `info.lastWakeOnLan` nicht | `info.lastError` lesen und prüfen, ob `control.powerOn` mit `true` und `ack: false` geschrieben wurde. Eine frühere Versandmeldung ist kein Nachweis für den aktuellen Versuch. |
| ioBroker wird nach dem Aktivieren der bisherigen Version träge | `loewe-tv.0` stoppen und die Updateanleitung auf 0.1.6 einschließlich der instanzbezogenen Compact-Umstellung ausführen. Für die anschließende Prüfung `pollInterval` und `channelRefreshInterval` auf 0 setzen. |
| Senderabfrage scheitert | `channels.lastError`, `channels.lists` und `channels.items` prüfen. Für einen Komplettabruf `channels.refreshError` prüfen. Zum erneuten automatischen Auswählen `channels.view` leeren und `channels.refresh` auslösen; alternativ eine Kennung aus `channels.availableLists` setzen. Bei Synchronisierung später wiederholen. |
| Sender wurden empfangen, unter `channels.tv` oder `channels.radio` fehlen noch Objekte | `channels.catalogStatus` prüfen und bei `updating` die Hintergrundaufbereitung abwarten. Bei `error` steht die Ursache in `channels.catalogError`; danach die passende Senderliste erneut abfragen. |
| Ein Sendertaster meldet `CHANNEL_UNAVAILABLE` | Die Liste dieses Senders erneut abfragen. Bei `available=false` gehört er nicht zum aktiven Bestand oder es fehlt ein verwendbarer Locator. Nach Änderungen während der Wartezeit den Sender erneut auswählen. |
| TV-Sendertaster funktionieren, Radio schaltet nicht um | Version 0.1.6 installieren und [Radioauswahl prüfen](#radioauswahl-prüfen). Nach dem Versuch `channels.lastSelection` lesen. Die Diagnose zeigt die Detailauflösung, den Modus vor der Auswahl, einen gegebenenfalls ausgelösten Moduswechsel und die Wiedergabe nach dem Senderauftrag. |
| Der Sendertaster ist wieder `false`, aber der Sender läuft nicht | Das Rücksetzen bestätigt nur die Verarbeitung des Tasters. `channels.lastSelection` auf TV-Ergebnis, Auflösungsfehler und Wiedergabebeobachtung prüfen. Ein fehlendes `Result` bestätigt die Befehlsannahme nicht; `Mode=radio` allein bestätigt keinen bestimmten Radiosender. |
| Texteingabe erscheint nicht | Erst ein passendes Eingabefeld am TV fokussieren. Nicht jede TV-Oberfläche nimmt Tastatureingaben an. |
| `api` fehlt | Zusätzliche TV-Befehle in der Konfiguration aktivieren, speichern und die Instanz neu starten. |
| Eine JSON-Antwort enthält `omitted: true` oder API-XML ist leer mit Größenhinweis | Kleinere Sender- oder Archivbereiche abfragen, beispielsweise `channels.count` reduzieren. Der Hinweis beschreibt die ausgelassene Speicherung einer großen Antwort. |
| Ein Befehl meldet eine volle Warteschlange oder zu lange Wartezeit | Befehle langsamer senden, laufende TV-Zeitüberschreitungen prüfen und für die Diagnose beide Abfrageintervalle auf 0 setzen. |

Für einen Fehlerbericht sind TV-Modell, Firmware, Adapterversion und der konkrete Fehlertext hilfreich. Bei Einschaltproblemen zusätzlich die verwendete LAN-/WLAN-Verbindung, `info.wakeReady`, `info.lastWakeOnLan` und `info.powerOn` angeben. Bei Fehlern der Senderauswahl zunächst `channels.lastSelection` direkt nach dem Versuch sowie den vorherigen TV- oder Radiomodus angeben. Bei Fehlern des Senderabrufs helfen `channels.refreshStatus`, `channels.refreshError`, `channels.lastError`, `channels.catalogStatus`, `channels.catalogError`, `channels.lists` und `channels.items`. Persönliche Senderlisten, Gerätekennungen oder MAC-Adressen können darin enthalten sein.

## Stabilitätsänderungen in 0.1.1

Im bisherigen Empfangspfad konnte ein regulärer Ausdruck zum Entfernen nachgestellter NUL-Zeichen bei bestimmten fehlerhaften Antworten sehr lange Rechenzeit beanspruchen und die JavaScript-Verarbeitung blockieren. Dieser Fehler wurde unabhängig von einem echten Fernseher reproduziert. 0.1.1 verwendet dafür ein Verfahren mit linearer Laufzeit und verarbeitet empfangene XML-Antworten asynchron in Abschnitten.

Zusätzlich läuft der Adapter in einem eigenen Prozess und unterstützt ab dieser Version keinen Compact-Betrieb mehr. So teilt seine JavaScript-Verarbeitung keinen Compact-Prozess mit anderen Adaptern oder dem Hauptcontroller. Die Wartezeit auf einzelne Datenbankoperationen ist auf zwei Sekunden begrenzt; beim Beenden ist auch das Warten auf abschließende Statusmeldungen begrenzt. Der Unload-Pfad ist auf eine Rückgabe innerhalb von höchstens 250 Millisekunden ausgelegt.

Diese Änderungen beheben nachgewiesene Schwachstellen der Implementierung. Ohne passende Laufzeitprotokolle lässt sich daraus nicht ableiten, dass genau diese Schwachstellen jede gemeldete Störung verursacht haben. Die inzwischen vorliegende Rückmeldung zur Fernbedienung steht oben; sie ist kein vollständiger Stabilitätsnachweis.

## Protokoll und Grenzen dieser Version

Die Netzwerkschnittstelle verwendet `POST /loewe_tablet_0001` mit dem SOAP-Namensraum `urn:loewe.de:RemoteTV:Tablet`. Die Anmeldung erfolgt mit `RequestAccess`; die Antwort liefert die `ClientId` für Folgeanfragen. Die Original-App hängt ein NUL-Byte an den XML-Body an. Der Adapter übernimmt dieses Verhalten standardmäßig.

Die ursprünglichen Tastencodes, Requestvorlagen und die Lautstärkeskalierung stammen aus Loewe App 1.4.7. Die Zifferntasten und der alternative EPG-Code stammen aus Löwenbändiger Remote 1.15. TV_ON (22), TV_MODE_ON (72), RADIO_MODE_ON (73) und die ergänzte Bedeutung der Ein-/Ausschaltcodes folgen der Remote API 1.0.47. Die App-Stufe 20 entspricht im Protokoll dem Wert 200000. `SetMute` mit `Value=1` ist im App-Sendepfad nachgewiesen. Das Aufheben mit `Value=0` ist aus dem Antwortparser und der Gegenoperation abgeleitet; die Toggle-Taste `remote.mute` ist separat nachgewiesen.

Bei `AddServicesFavoriteList` enthält die extrahierte Originalvorlage einen falschen XML-Endtag. Der Adapter erzeugt für diese Aktion wohlgeformtes XML.

Ein lokaler EPG-Abruf über `CreateIterator` und die Tabelle `de.loewe.sl2.epg` ist inzwischen in Kapitel 9.22 der Hersteller-API dokumentiert. Dieser Import ist noch nicht umgesetzt; Details und belegte Feldkennungen stehen in der [Aufnahme-Roadmap](docs/ROADMAP.md#lokales-epg-über-die-dokumentierte-iterator-schnittstelle). Gracenote ist damit keine notwendige Voraussetzung für den geplanten ersten EPG-Weg.

Die universellen API-Datenpunkte erschließen die extrahierten Aktionen. Sie enthalten keine bestätigte Kompatibilitätsliste aller Loewe-Modelle und bilden komplexe Aufnahme- und Favoritenverwaltung noch nicht als eigene Formularoberfläche ab. Die UPnP/DLNA-Mediensteuerung aus der App, WS-Eventing, automatische Gerätesuche und lange Fernbedienungstastendrücke gehören nicht zum Funktionsumfang dieser Version.

## Quellcode und Weiterentwicklung

Die Weiterentwicklung findet im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv) statt. Das Abrufen des Quellcodes, die Tests und das Erzeugen des installierbaren `.tgz`-Pakets sind unter [Installationspaket aus dem Quellcode erzeugen](#installationspaket-aus-dem-quellcode-erzeugen) beschrieben.

Die Tests verwenden simulierte TV-Antworten sowie echte HTTP- und UDP-Verbindungen ausschließlich über die lokale Loopback-Schnittstelle. Sie prüfen das Verhalten der Implementierung, ersetzen aber keinen Start in einem tatsächlichen ioBroker-Controller und keinen Modell- und Firmwaretest am realen Fernseher. Die Prüfung des Radioablaufs steht im [Prüfbericht zu 0.1.6](docs/PRUEFBERICHT_0.1.6.md). Die historischen Prüfberichte zu [0.1.5](docs/PRUEFBERICHT_0.1.5.md), [0.1.4](docs/PRUEFBERICHT_0.1.4.md), [0.1.3](docs/PRUEFBERICHT_0.1.3.md), [0.1.2](docs/PRUEFBERICHT_0.1.2.md) und [0.1.1](docs/PRUEFBERICHT.txt) bleiben als Nachweise für die damaligen Stände erhalten.

Der Nutzerbericht zum tatsächlichen bild 7.55 ist oben gesondert aufgeführt. Er bestätigt inzwischen auch die TV-Auswahl des 0.1.4-Stands mit Namens-IDs nach einem kurzen Test. Radio ist sowohl in 0.1.4 als auch nach dem Versuch mit 0.1.5 als nicht funktionierend gemeldet. Die Wirkung des neuen Radioablaufs in 0.1.6, das Umsortieren und sämtliche Migrationsfälle bleiben am Gerät zu prüfen. Für den Einschaltablauf liegt ebenfalls keine Erfolgsmeldung vor.

Offizielle ioBroker-Grundlagen:

- [Installation eigener Paketquellen im js-controller](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts)
- [Instanzen und Compact-Modus über die ioBroker-CLI](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md)
- [JSON-Konfiguration im Admin](https://github.com/ioBroker/ioBroker.admin/blob/master/packages/jsonConfig/README.md)
- [Datenpunkte steuern mit `setState`](https://github.com/ioBroker/ioBroker.javascript/blob/master/docs/en/javascript.md#setstate)

## Lizenz

Der neu geschriebene Adaptercode steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE).

## Änderungsverlauf

### 0.1.6

- Radioauswahl prüft nach `GetMediaItem` zuerst den aktuellen Wiedergabemodus. Falls nötig, einmal gezielt `RADIO_MODE_ON` senden und auf einen bestätigten Radiomodus warten; erst danach den Sender-Locator mit `ZapToMedia` übertragen.
- Zeitversetzte Wiedergabeprüfung ergänzt: erstes Lesen nach 500 Millisekunden, weitere begrenzte Leseversuche. Moduswechsel und Senderauftrag werden nicht automatisch wiederholt. Netzwerk- und Wartezeiten teilen sich ein Gesamtbudget von 15 Sekunden.
- `remote.radio_mode_on` (`l2700/73`) und `remote.tv_mode_on` (`l2700/72`) als getrennte Taster ergänzt. Die direkte TV-Senderauswahl bleibt erhalten.
- `channels.lastSelection` um vorherige Wiedergabe, Moduswechsel und dessen Beobachtungen erweitert. `confirmed` setzt eine passende Senderidentität voraus; die leere Platzhalterkennung gilt nicht als Nachweis.
- Echten Befund aus 0.1.5 dokumentiert: Audio-Detailantwort und identischer Locator für sunshine live, dennoch kein hörbarer Radiowechsel trotz `Result=0`. Die Wirkung des neuen Ablaufs bleibt am SL420 zu prüfen.

### 0.1.5

- Radioauswahl ergänzt den in Löwenbändiger Remote 1.15 nachvollzogenen Ablauf: `mediaItemUuid` mit `GetMediaItem` auflösen und den zurückgegebenen `MediaItem/Locator` an `ZapToMedia` mit `Player=0` übergeben. TV-Sendertaster verwenden weiterhin direkt den Listen-Locator.
- Explizite Ergebnisse von `ZapToMedia` werden geprüft. Eine Ablehnung des TVs wird als Fehler gemeldet; ein fehlendes Ergebnis bleibt unbestätigt.
- `channels.lastSelection` bündelt Senderdaten, Auflösung, Kanaladressen, Antworten und Fehler. Eine einzelne Wiedergabeabfrage nach Radioauswahl beobachtet den Modus; Radiomodus allein bestätigt noch keinen bestimmten Sender.
- Gemeinsames TV-Anfragebudget des Radioablaufs auf höchstens 15 Sekunden begrenzt, ohne blinde Umschaltwiederholung oder zusätzliche Modustaste. Datenbankschritte behalten eigene kurze Zeitlimits. Die bestehende Namensstruktur und der Senderabgleich werden weiterverwendet.
- Rückmeldung des Nutzers dokumentiert: TV-Sendertaster mit Namens-IDs in 0.1.4 nach kurzem Test fehlerfrei, Radioauswahl ohne Funktion. Die Wirkung der Änderung in 0.1.5 ist noch am SL420 zu prüfen.

### 0.1.4

- Auf Wunsch innerhalb derselben Version überarbeitet: Sendername als Ordner-ID, beispielsweise `channels.tv.Das_Erste_HD`; der Name (`common.name`) zeigt den bevorzugten Programmplatz, die Beschreibung (`common.desc`) den Sendernamen. Umsortieren aktualisiert Position und Locator bei unverändertem Senderpfad.
- Mehrere Programmplätze desselben Dienstes werden in einem Ordner zusammengefasst. Der kleinste gültige Platz ist die bevorzugte Auswahl; alle Originalpositionen und Locators bleiben erhalten. Gleichnamige Dienste erhalten bei Bedarf einen stabilen Kennungssuffix.
- Bestehende Kataloge und Hash-Ordner aus 0.1.3 sowie numerische Ordner aus dem ersten 0.1.4-Stand werden in die Namensstruktur übernommen. Die geänderten IDs erfordern einmalige Anpassungen an Skripten, Aliasen und Visualisierungen. Bereits installierte Version 0.1.4 mit dem aktuellen Archiv erneut installieren.
- `channels.refresh` für den vollständigen Abgleich und ein eigenes Senderlistenintervall mit standardmäßig 300 Sekunden. Automatische Aktualisierung beim Start, nach Wiederverbindung und im eingestellten Abstand; das Statuspolling bleibt unabhängig.
- Mehrseitenlisten werden vor dem Abgleich zweimal vollständig verglichen. Fehlgeschlagene, unvollständige oder mehrdeutige Antworten entfernen keine fehlenden Sender.
- Veraltete verwaltete Senderordner werden gezielt bereinigt; Benutzerobjekte, benutzerdefinierte Einstellungen und Löschschutz bleiben erhalten. EPG steht weiterhin als Platzhalter direkt unter jedem Sender bereit.

### 0.1.3

- Getrennte Senderobjekte unter `channels.tv` und `channels.radio` mit einem `select`-Taster je Dienst. Umschalten verwendet den tatsächlich gelieferten Locator.
- Stabile Objektkennungen aus Senderliste, Medienart und Dienstkennung; mehrere Programmplätze desselben Dienstes werden in `numbers` und `locators` zusammengefasst.
- Senderbestand über Neustarts erhalten, vorhandene Antworten aus 0.1.2 ohne TV-Kontakt übernehmen und Senderobjekte im Hintergrund aufbereiten. Teilseiten deaktivieren keine fehlenden Dienste; inaktive Objekte bleiben mit gesperrtem Auswahltaster erhalten.
- Metadaten und ein eigener `epg`-Unterordner je Dienst. `epg.status=notImplemented` kennzeichnet den noch ausstehenden EPG-Import.
- Echte ASTRA-LCN-Senderantwort des bild 7.55 mit SL420 dokumentiert: TV und Radio sowie wiederholte Dienstkennungen auf unterschiedlichen Programmplätzen. Der Nutzer hat die ersten drei TV-Sender mit seiner Konfiguration abgeglichen.

### 0.1.2

- Nutzerbericht zum Loewe bild 7.55 mit SL420 und Software V5.4.6.0 ergänzt: bisherige Fernbedienungstasten scheinen zu funktionieren; beide EPG-Tasten öffnen dieselbe Anzeige.
- Automatische Auswahl einer tatsächlich vom TV gemeldeten Senderliste, aufbereitete Sender- und Listenantworten sowie getrennte Seitenindizes ergänzt. TV und Radio sind ohne zusätzlichen Filter abfragbar.
- Einschaltablauf um den dokumentierten TV_ON-Code 22 ergänzt: asynchrone Versuche mit Gesamtzeitlimit, gezieltem Abbruch und Diagnose in `info.powerOn`.
- `control.powerOff` verwendet nun den gezielten Ausschaltcode 25; bestehende Remote-Codes bleiben erhalten. `remote.power_on` ergänzt den gezielten Einschaltcode 22.
- Gemeldete WOL-Einstellungen als zusätzliche Gerätedaten; unbekannte Werte werden nicht als `false` vorbelegt.
- Dokumentierten lokalen EPG-Weg in die Roadmap aufgenommen. Der EPG-Import und die Aufnahmeautomatik sind weiterhin geplant; Senderabruf und Einschaltkorrekturen benötigen die Rückmeldung vom Gerät.

### 0.1.1

- Langsame Verarbeitung bestimmter fehlerhafter Antworten durch lineares Entfernen nachgestellter NUL-Zeichen und asynchrones XML-Parsing ersetzt.
- Eigener Adapterprozess; Compact-Betrieb deaktiviert.
- Wake-on-LAN unabhängig von der SOAP-Warteschlange, drei Senderunden und passende lokale Broadcastadressen aus den tatsächlichen Netzmasken.
- Zusätzliche MAC-Erkennung für ältere Geräte, frühere Geräteabfrage und die Diagnosewerte `info.wakeReady` sowie `info.lastWakeOnLan`.
- Automatische Statusabfragen mit Intervall 0 vollständig abschaltbar, einschließlich der Startabfrage.
- Warteschlange, Wartezeiten für Datenbankzugriffe, Beenden und die Größe gespeicherter Antworten begrenzt; Texteingaben auf 15 Sekunden Gesamtdauer begrenzt.
- Zehn Zifferntasten und ein zusätzlicher EPG-Code aus Löwenbändiger Remote 1.15 ergänzt.

### 0.1.0

- Erste Version für die aus Loewe App 1.4.7 extrahierte Tablet-Schnittstelle.
- Fernbedienung, Ton, Texteingabe, Senderlisten und Wake-on-LAN über Datenpunkte.
- Statusabfragen und zusätzliche API-Kanäle für die 33 SOAP-Aktionen.
- Konfiguration auf Deutsch und Englisch.
