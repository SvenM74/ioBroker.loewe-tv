# Loewe TV für ioBroker

Version **0.1.1** steuert einen Loewe-Fernseher über ioBroker-Datenpunkte. Du kannst die Fernbedienungstasten auslösen, Lautstärke und Stummschaltung setzen, Text eingeben, Senderlisten abfragen, über einen Sender-Locator umschalten und Wake-on-LAN auslösen.

Die Grundlage ist die aus der Android-App **Loewe App 1.4.7** extrahierte Netzwerkschnittstelle. Die zusätzliche Analyse von **Löwenbändiger Remote 1.15** ergänzt Zifferntasten und einen weiteren EPG-Code. Beim erneuten Prüfen der ursprünglichen Loewe-App wurde außerdem ein älteres MAC-Adressformat nachgewiesen, das der Adapter jetzt ebenfalls auswertet. Jede Instanz steuert genau einen Fernseher. Für einen zweiten Fernseher wird eine zweite Instanz angelegt.

**Diese eigenständige Implementierung ist noch nicht an einem echten Loewe-Fernseher verifiziert.** Ob dein Modell und seine Firmware die Schnittstelle, einzelne Aktionen und das Aufwecken aus dem Standby unterstützen, lässt sich erst am Gerät prüfen. Der Adapter wird als lokale Paketdatei installiert und ist nicht im ioBroker-Adapterkatalog oder auf npm veröffentlicht.

0.1.1 behebt einen reproduzierbaren Fehler beim Verarbeiten bestimmter fehlerhafter TV-Antworten und trennt das Aufwecken von wartenden TV-Abfragen. Ob genau dieser Fehler eine konkrete gemeldete ioBroker-Störung verursacht hat, ist ohne entsprechende Protokolle nicht belegt.

## Projektziel: Aufnahmen anhand von EPG-Regeln

Der geplante Ausbau soll ioBroker ermöglichen, Programmdaten auszuwerten, passende Sendungen zu erkennen und dafür im Voraus Aufnahmetimer im Loewe-TV anzulegen. Regeln, beispielsweise für bestimmte Titel, Sender und Zeiträume, werden in ioBroker gesteuert. Der Adapter soll die Sender- und EPG-Daten bereitstellen, Aufnahmeaufträge übertragen und anhand der TV-Timerliste bestätigen.

Diese Automatik ist in 0.1.1 noch nicht umgesetzt. Die [Roadmap für EPG und automatische Aufnahmen](docs/ROADMAP.md) beschreibt die vorhandenen Schnittstellen, die geplanten Datenpunkte und die noch erforderlichen Gerätetests.

## Voraussetzungen

- Node.js ab **22**.
- ioBroker js-controller ab **6.0.11** und Admin ab **7.0.23**.
- Ein Loewe-Fernseher, der die Tablet-Schnittstelle auf TCP-Port **905** anbietet.
- Eine Netzwerkverbindung vom ioBroker-Rechner zum Fernseher. Zum Einrichten den Fernseher einschalten.
- Für Einschalten aus dem Standby: eine passende TV-MAC-Adresse und Unterstützung für Wake-on-LAN im Fernseher und im Netzwerk.

Der laufende Adapter arbeitet lokal. Für die Installation kann ioBroker benötigte Node.js-Abhängigkeiten aus dem Internet nachladen. Das lokale `.tgz`-Paket ist deshalb keine Zusage einer vollständig netzlosen Installation.

## Installationspaket aus dem Quellcode erzeugen

Der Quellcode steht im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv). Ein fertiges `.tgz`-Paket ist dort derzeit nicht als Release hinterlegt. Du kannst es mit den folgenden Schritten selbst erzeugen. Wenn du `iobroker.loewe-tv-0.1.1.tgz` bereits erhalten hast, kannst du diese Datei direkt für die anschließende Update- oder Erstinstallationsanleitung verwenden.

Zum Erzeugen des Pakets brauchst du Git und Node.js ab 22. Öffne ein Terminal in einem eigenen Arbeitsverzeichnis und führe aus:

```bash
git clone https://github.com/SvenM74/ioBroker.loewe-tv.git
cd ioBroker.loewe-tv
npm install
npm test
npm pack
```

`npm pack` erzeugt im Projektverzeichnis die Datei **`iobroker.loewe-tv-0.1.1.tgz`**. Die Entwicklungsbefehle gehören in diese Projektkopie, nicht in das produktive ioBroker-Hauptverzeichnis. Kopiere anschließend die erzeugte Paketdatei auf den ioBroker-Rechner und verwende die passende Anleitung unten.

## Update von 0.1.0 auf 0.1.1

Die vorhandene Instanz weiterverwenden. Erzeuge `iobroker.loewe-tv-0.1.1.tgz` wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende eine bereits erhaltene Paketdatei dieser Version. Kopiere sie unverändert auf den ioBroker-Rechner, beispielsweise nach `/tmp`. Führe dort diese Befehle in der angegebenen Reihenfolge aus:

```bash
iobroker stop loewe-tv.0
iobroker compact loewe-tv.0 disable
iobroker url /tmp/iobroker.loewe-tv-0.1.1.tgz loewe-tv
```

Der Compact-Befehl betrifft die Instanz `loewe-tv.0`. Version 0.1.1 wird in einem eigenen Adapterprozess betrieben. Die Umstellung erfolgt vor dem Paketupdate, damit sie auch bei einer vorhandenen Instanz wirksam wird. Die Syntax ist in der [offiziellen ioBroker-CLI-Dokumentation](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md) beschrieben.

Öffne anschließend die Einstellungen von `loewe-tv.0`. Für die erste Prüfung nach dem Update:

1. TV-IP-Adresse kontrollieren und die zur verwendeten Netzwerkverbindung gehörende TV-MAC-Adresse im LAN- oder WLAN-Feld manuell eintragen.
2. Das **Aktualisierungsintervall zunächst auf 0** setzen. Dadurch entfallen automatische Statusabfragen einschließlich der Abfrage direkt beim Start.
3. Speichern und die Instanz wieder starten:

```bash
iobroker start loewe-tv.0
```

Prüfe dann `info.wakeReady` und löse `control.powerOn` mit `true` und `ack: false` aus. Unter `info.lastWakeOnLan` stehen die verwendeten Zieladressen und der Zeitpunkt des Paketversands. Der Abschnitt [Ein- und Ausschalten](#ein--und-ausschalten) erklärt die Auswertung.

Wenn der Fernseher erreichbar ist, kannst du mit `control.refresh` gezielt eine Statusabfrage auslösen. Für den späteren Normalbetrieb das Intervall beispielsweise wieder auf 30 Sekunden setzen. Bei ausgeschalteter Automatik bleibt `info.connection` nach dem Start zunächst `false`, bis ein erfolgreicher manueller TV-Befehl oder eine manuelle Abfrage die Verbindung bestätigt.

## Erstinstallation aus der Paketdatei

1. Erzeuge **`iobroker.loewe-tv-0.1.1.tgz`** wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende eine bereits erhaltene Paketdatei dieser Version. Die Datei nicht entpacken.
2. Kopiere sie auf den Rechner, auf dem ioBroker läuft, beispielsweise nach `/tmp/iobroker.loewe-tv-0.1.1.tgz`.
3. Öffne dort ein Terminal oder eine SSH-Verbindung und führe aus:

```bash
iobroker url /tmp/iobroker.loewe-tv-0.1.1.tgz loewe-tv
```

4. Lege beim ersten Installieren eine Instanz an:

```bash
iobroker add loewe-tv
```

5. Öffne in ioBroker Admin **Instanzen → loewe-tv.0 → Einstellungen**. Trage die IP-Adresse des Fernsehers ein und speichere die Konfiguration.
6. **Aktiviere die Instanz `loewe-tv.0`** in der Instanzübersicht. Neue Instanzen werden zunächst deaktiviert angelegt, damit vor dem Start die TV-Adresse eingetragen werden kann.
7. Öffne **Objekte → loewe-tv.0**. Bei erreichbarem Fernseher und aktiviertem Abfrageintervall sollte `info.connection` auf `true` wechseln. Bei Intervall 0 stattdessen `control.refresh = true` auslösen. Mit `remote.home = true` lässt sich anschließend der erste Tastendruck testen.

Der Pfad hinter `iobroker url` muss auf dem ioBroker-Rechner existieren und für die Installation lesbar sein. Ein Downloadpfad auf deinem Handy oder PC genügt nicht. Bei Docker muss die Datei innerhalb des ioBroker-Containers erreichbar sein und der Befehl dort ausgeführt werden. Verwende auf anderen Systemen den entsprechenden absoluten Pfad.

Für das Update einer bestehenden Installation die Anleitung oben verwenden. Eine zusätzliche Instanz ist dafür nicht erforderlich. Lade die Admin-Seite nach dem Update neu, falls noch die bisherige Konfigurationsmaske angezeigt wird.

Diese Installation verwendet den ioBroker-Befehl für eine eigene Paketquelle. Der offizielle js-controller reicht die Paketdatei an seinen Paketinstaller weiter und übernimmt danach die Adapterdateien und Objektdefinitionen. Siehe [ioBroker-Installationscode](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts).

## Konfiguration

### Verbindung

| Einstellung | Standard | Bedeutung |
|---|---:|---|
| Adresse des Fernsehers | leer | IP-Adresse oder Hostname des TVs, ohne `http://`, Pfad oder Port. Eine feste DHCP-Zuordnung im Router ist hilfreich. |
| Aktualisierungsintervall | 30 Sekunden | 0 deaktiviert automatische Abfragen einschließlich der Abfrage beim Start. Andernfalls sind ganze Werte von 5 bis 3.600 Sekunden möglich. Manuelle Befehle und `control.refresh` bleiben verfügbar. |
| Maximale Lautstärke bei direkten Befehlen | 99 | Obergrenze für `control.volume` und `api.SetVolume`. Für den Alltag kann hier beispielsweise 40 stehen. Fernbedienungstasten und Änderungen direkt am TV werden dadurch nicht begrenzt. |
| Aktuelle Wiedergabe abfragen | aktiviert | Fragt bei Statusabfragen zusätzlich die aktuelle Wiedergabe ab, auch bei einem manuellen `control.refresh`. Bei einem Modell ohne Unterstützung für `GetCurrentPlayback` deaktivieren. |

### Einschalten

| Einstellung | Standard | Bedeutung |
|---|---|---|
| LAN-MAC-Adresse | leer | MAC-Adresse des kabelgebundenen TV-Netzwerkanschlusses. |
| WLAN-MAC-Adresse | leer | MAC-Adresse des TV-WLAN-Anschlusses. Die Möglichkeit zum Aufwecken über WLAN hängt vom TV ab. |
| Broadcastadresse | `255.255.255.255` | Beim Standardwert wird zusätzlich eine passende lokale Broadcastadresse versucht, wenn die konfigurierte TV-Adresse eine IPv4-Adresse im gemeinsamen lokalen Subnetz ist. Eine ausdrücklich eingetragene andere Adresse wird genau so verwendet. |

Der Adapter liest MAC-Adressen auch aus den Gerätedaten des erreichbaren Fernsehers, einschließlich des älteren Antwortfelds `MAC-Address`. Diese Geräteabfrage erfolgt vor den Abfragen von Lautstärke und Stummschaltung. Wenn der Fernseher bereits im Standby ist und noch keine MAC-Adresse bekannt ist, muss die passende TV-MAC-Adresse für den ersten Einschaltversuch manuell eingetragen werden. Bei Intervall 0 findet auch keine automatische MAC-Erkennung beim Start statt.

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
| `control.powerOn` | Taster | `true` sendet Wake-on-LAN unabhängig von wartenden TV-Abfragen. Voraussetzung ist eine bekannte TV-MAC-Adresse. |
| `control.powerOff` | Taster | `true` sendet den extrahierten Ausschaltbefehl. |
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

| Datenpunkt unter `remote` | Funktion | Extrahierter Code |
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
| `power_off` | Ausschalten | 12 |
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
| `power_all_code` | Separater „Power all“-Code der App | 25 |
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

`remote.power_all_code` wird nur an den Fernseher dieser Instanz gesendet. Der Name stammt aus der App und bedeutet im Adapter nicht, dass alle Instanzen gemeinsam angesprochen werden. Die konkrete Gerätewirkung dieses zusätzlichen Codes ist noch nicht am Fernseher bestätigt. Zum gewöhnlichen Ausschalten `control.powerOff` oder `remote.power_off` verwenden.

```javascript
// Einen einzelnen Tastendruck senden.
setState('loewe-tv.0.remote.home', true, false);
```

`remote.text` öffnet Teletext. **`media.text` sendet Texteingaben.** Diese beiden Datenpunkte haben unterschiedliche Aufgaben:

```javascript
// Zuerst am Fernseher ein Textfeld öffnen, dann den Text senden.
setState('loewe-tv.0.media.text', 'Hallo', false);
```

Die zehn Zifferntasten und `epg_alt` wurden in 0.1.1 anhand von Löwenbändiger Remote 1.15 ergänzt. Die bisherigen 29 Tastenbelegungen bleiben unverändert. `epg_alt` kann auf Modellen ausprobiert werden, die den bisherigen EPG-Code nicht wie erwartet behandeln. Die Zifferntasten senden einzelne Tastendrücke; ob eine Ziffernfolge eine Senderwahl auslöst, hängt vom TV und vom gerade geöffneten Bildschirm ab.

```javascript
setState('loewe-tv.0.remote.digit_1', true, false);
```

### Senderlisten und Umschalten

| Datenpunkt | Typ | Bedeutung |
|---|---|---|
| `channels.view` | Text, lesen/schreiben | Kennung der abzufragenden Senderliste aus der TV-Antwort. |
| `channels.start` | Zahl, lesen/schreiben | Startindex der Abfrage, standardmäßig 0. |
| `channels.count` | Zahl, lesen/schreiben | Anzahl pro Abfrage, standardmäßig 100, höchstens 500. |
| `channels.getLists` | Taster | Lädt die verfügbaren Senderlisten. |
| `channels.lists` | JSON-Text, lesen | Antwort mit den verfügbaren Senderlisten. |
| `channels.getChannels` | Taster | Lädt die Sender der unter `channels.view` gewählten Liste. |
| `channels.items` | JSON-Text, lesen | Antwort mit den Sendern der abgefragten Seite. |

So gehst du vor:

1. `channels.getLists` auf `true` schreiben.
2. Aus `channels.lists` die gewünschte Listenkennung übernehmen und in `channels.view` schreiben.
3. `channels.getChannels` auf `true` schreiben.
4. In `channels.items` den Locator des gewünschten Senders suchen und genau diesen Wert in `media.locator` schreiben.

Die JSON-Struktur stammt vom Fernseher und kann sich je nach Firmware unterscheiden. Der Adapter speichert die Antwort und erzeugt keine zusätzlichen, automatisch benannten Datenpunkte für jeden einzelnen Sender. Für weitere Seiten `channels.start` erhöhen und dieselbe Abfrage erneut auslösen. Das Schreiben von `view`, `start` und `count` allein sendet noch keine Senderabfrage. Wird eine Antwort wegen ihrer Größe ausgelassen, `channels.count` verringern und kleinere Seiten abfragen.

Eine vorhandene Senderkennung aus dem TV kann beispielsweise so gewählt werden; `LISTENKENNUNG_AUS_TV` vorher ersetzen:

```javascript
async function senderlisteAbfragen() {
    await setStateAsync('loewe-tv.0.channels.view', 'LISTENKENNUNG_AUS_TV', false);
    await setStateAsync('loewe-tv.0.channels.start', 0, false);
    await setStateAsync('loewe-tv.0.channels.count', 100, false);
    await setStateAsync('loewe-tv.0.channels.getChannels', true, false);
}
senderlisteAbfragen();
```

`setStateAsync` bestätigt hier das Schreiben in ioBroker. Die Antwort des Fernsehers folgt anschließend in `channels.items`.

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
| `status.volume` | Zuletzt vom Fernseher gelesene Lautstärke in App-Stufen. |
| `status.volumeRaw` | Rohwert der Lautstärke im Loewe-Protokoll. |
| `status.mute` | Zuletzt vom Fernseher gelesene Stummschaltung. |
| `status.playback` | Zuletzt gelesene Wiedergabeantwort als JSON-Text. |
| `device.data` | Gerätedaten als JSON-Text. |
| `device.settings` | Zuletzt gelesene TV-Einstellungen als JSON-Text. |
| `device.macLan` | Ermittelte LAN-MAC-Adresse. |
| `device.macWlan` | Ermittelte WLAN-MAC-Adresse. |
| `device.mac` | MAC-Adresse aus dem älteren TV-Antwortfeld `MAC-Address`, als zusätzliche Quelle für Wake-on-LAN. |

**`info.connection` ist kein verlässlicher Bildschirm-Ein/Aus-Zustand.** Ein Fernseher kann im Standby noch auf Netzwerkbefehle antworten. Umgekehrt kann ein eingeschalteter Fernseher bei einem Netzwerkfehler unerreichbar sein. `control.powerOn` und `control.powerOff` sind deshalb bewusst Befehls-Taster.

Bei Verbindungsproblemen sind vorhandene Statuswerte die zuletzt bekannten Werte. `info.connection`, `info.lastSeen` und `info.lastError` helfen dabei, ihre Aktualität einzuordnen.

Bei einem Intervall größer als 0 werden Lautstärke und Stummschaltung regelmäßig abgefragt, die Wiedergabe bei aktivierter Option ebenfalls. Mit Intervall 0 finden keine automatischen Statusabfragen statt. Gerätedaten werden vor Lautstärke und Stummschaltung gelesen, damit fehlende Unterstützung einer Statusfunktion die MAC-Erkennung nicht verhindert. `control.refresh` fordert die Status-, Geräte- und Einstellungsdaten manuell neu an. Nicht unterstützte Abfragen werden im Adapterprotokoll gemeldet.

SOAP-Anfragen werden nacheinander ausgeführt. Die Warteschlange ist auf 20 laufende oder wartende Vorgänge begrenzt. Ein Vorgang, der beim Erreichen seines Platzes mehr als 30 Sekunden gewartet hat, wird verworfen. **Wake-on-LAN läuft unabhängig von dieser Warteschlange**, damit ein nicht antwortender Fernseher seinen eigenen Einschaltversuch nicht verzögert.

Ein fehlgeschlagener SOAP-Steuerbefehl wird nicht automatisch wiederholt, weil der Fernseher ihn vor einem Verbindungsabbruch bereits ausgeführt haben könnte. Nach einem solchen Fehler stellt der nächste Versuch die Anmeldung bei Bedarf neu her. Die drei vorgesehenen Wake-on-LAN-Sendungen sind davon unabhängig.

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
| `GetChannelList` | `ChannelListView`; `QueryParameters/Range` mit `@startIndex` und `@maxItems`. Die App ergänzt in `QueryParameters` außerdem `OrderField` mit `field="userChannelNumber"`, `type="ascending"`, `MediaItemInformation=true` und `MediaItemClass=video`. |
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

Zum Ausschalten:

```javascript
setState('loewe-tv.0.control.powerOff', true, false);
```

Zum Einschalten:

```javascript
setState('loewe-tv.0.control.powerOn', true, false);
```

Wake-on-LAN sendet Magic Packets per UDP an Port 9. In 0.1.1 wird jedes Paar aus MAC-Adresse und Zieladresse dreimal bedient, mit 150 Millisekunden Pause zwischen den Senderunden. Der Versand läuft unabhängig von SOAP-Anfragen, die noch auf den ausgeschalteten Fernseher warten.

### Den Einschaltversuch prüfen

1. Trage für die erste Prüfung aus dem Standby die tatsächliche TV-MAC-Adresse manuell in der Konfiguration ein. Sie lässt sich beispielsweise in den TV-Netzwerkeinstellungen oder im Router nachsehen. Alternativ den TV einschalten und einmal `control.refresh` auslösen, damit die MAC-Adresse ausgelesen werden kann.
2. Kontrolliere `info.wakeReady`. `true` bedeutet nur, dass eine MAC-Adresse zum Senden bekannt ist. Es sagt nichts darüber aus, ob das Modell Wake-on-LAN unterstützt oder die passende Standby-Einstellung aktiviert ist.
3. Löse `control.powerOn` aus und prüfe anschließend `info.lastWakeOnLan`. `sentAt` muss zum aktuellen Versuch gehören. `targets` zeigt die verwendeten Broadcastadressen, `macs` die MAC-Adressen und `repeats` die Anzahl der Senderunden. Bleibt der Eintrag unverändert, auch `info.lastError` lesen.
4. Wenn der Fernseher startet, warte, bis er wieder auf Steuerbefehle reagiert. Bei Intervall 0 eine manuelle Abfrage über `control.refresh` auslösen; ohne Abfrage wird `info.connection` nach einem reinen Wake-on-LAN-Versand nicht automatisch auf `true` gesetzt.

Ein erfolgreicher UDP-Versand ist keine Empfangs- oder Einschaltbestätigung des Fernsehers. Wenn das Gerät nicht aufwacht, sind TV-Einstellung, tatsächliche MAC-Adresse, Broadcastziel und die Erreichbarkeit über das Netzwerk zu prüfen. Manche Geräte reagieren nur über LAN oder nur in bestimmten Standby-Modi.

**Die zusätzlich analysierte App Löwenbändiger Remote 1.15 enthält keinen nachgewiesenen Einschalt- oder Wake-on-LAN-Befehl.** Ihre zusätzlichen Tastencodes liefern deshalb keine andere belegte Methode zum Einschalten. Die Analyse ist unter [docs/Loewenbaendiger_Remote_1.15_Analyse.txt](docs/Loewenbaendiger_Remote_1.15_Analyse.txt) dokumentiert.

## Fehler eingrenzen

| Beobachtung | Nächster sinnvoller Schritt |
|---|---|
| `info.connection` bleibt `false` | Bei Intervall 0 zunächst `control.refresh` auslösen. Sonst Fernseher einschalten, IP-Adresse und Port 905 prüfen und `info.lastError` lesen. Router-, Gastnetz- oder VLAN-Trennung prüfen. |
| Verbindung bricht nach einem TV-Neustart ab | Einen weiteren Statuszyklus abwarten oder `control.refresh` auslösen. Die Anmeldung wird vom Adapter verwaltet. |
| Einzelne Anfrage meldet einen SOAP-Fehler | Die Schnittstelle ist erreichbar, diese Aktion oder ihre Parameter werden aber möglicherweise vom TV nicht unterstützt. Bei Wiedergabeproblemen `pollPlayback` deaktivieren. |
| Schreiben eines Datenpunkts bewirkt nichts | Mit `ack: false` schreiben. Taster erwarten `true`; Parameterfelder der API führen ohne den zugehörigen `send`-Taster keine Anfrage aus. |
| Lautstärke lässt sich nicht hoch genug setzen | Den Wert und die konfigurierte maximale Lautstärke prüfen. `control.volume` erwartet eine ganze App-Stufe, keinen Protokollrohwert. |
| `info.wakeReady` ist `false` | Die passende TV-MAC-Adresse manuell konfigurieren oder bei eingeschaltetem TV `control.refresh` auslösen. Bei Intervall 0 wird die MAC-Adresse beim Start nicht automatisch abgefragt. |
| `info.wakeReady` ist `true`, aber der TV startet nicht | Den aktuellen Eintrag in `info.lastWakeOnLan` prüfen: MAC-Adressen, Zieladressen und Auslösezeitpunkt. Danach Netzwerk-Wakeup-Einstellung und Standby-Modus des TVs prüfen. `wakeReady` bestätigt allein die bekannte MAC-Adresse. |
| Ein Einschaltversuch aktualisiert `info.lastWakeOnLan` nicht | `info.lastError` lesen und prüfen, ob `control.powerOn` mit `true` und `ack: false` geschrieben wurde. Eine frühere Versandmeldung ist kein Nachweis für den aktuellen Versuch. |
| ioBroker wird nach dem Aktivieren der bisherigen Version träge | `loewe-tv.0` stoppen und die Updateanleitung auf 0.1.1 einschließlich der instanzbezogenen Compact-Umstellung ausführen. Für die anschließende Prüfung automatische Abfragen mit Intervall 0 deaktivieren. |
| Senderabfrage scheitert | Eine echte Listenkennung aus `channels.lists` in `channels.view` verwenden. Für `media.locator` einen vollständigen Locator aus der TV-Antwort verwenden. |
| Texteingabe erscheint nicht | Erst ein passendes Eingabefeld am TV fokussieren. Nicht jede TV-Oberfläche nimmt Tastatureingaben an. |
| `api` fehlt | Zusätzliche TV-Befehle in der Konfiguration aktivieren, speichern und die Instanz neu starten. |
| Eine JSON-Antwort enthält `omitted: true` oder API-XML ist leer mit Größenhinweis | Kleinere Sender- oder Archivbereiche abfragen, beispielsweise `channels.count` reduzieren. Der Hinweis beschreibt die ausgelassene Speicherung einer großen Antwort. |
| Ein Befehl meldet eine volle Warteschlange oder zu lange Wartezeit | Befehle langsamer senden, laufende TV-Zeitüberschreitungen prüfen und für die Diagnose Intervall 0 verwenden. |

Für einen Fehlerbericht sind TV-Modell, Firmware, Adapterversion und der konkrete Fehlertext hilfreich. Bei Einschaltproblemen zusätzlich die verwendete LAN-/WLAN-Verbindung, `info.wakeReady` und den aktuellen Inhalt von `info.lastWakeOnLan` angeben. Bei einem Problem mit Senderlisten oder Wiedergabedaten außerdem die zugehörige TV-Antwort beilegen. Persönliche Senderlisten, Gerätekennungen oder MAC-Adressen können darin enthalten sein.

## Stabilitätsänderungen in 0.1.1

Im bisherigen Empfangspfad konnte ein regulärer Ausdruck zum Entfernen nachgestellter NUL-Zeichen bei bestimmten fehlerhaften Antworten sehr lange Rechenzeit beanspruchen und die JavaScript-Verarbeitung blockieren. Dieser Fehler wurde unabhängig von einem echten Fernseher reproduziert. 0.1.1 verwendet dafür ein Verfahren mit linearer Laufzeit und verarbeitet empfangene XML-Antworten asynchron in Abschnitten.

Zusätzlich läuft der Adapter in einem eigenen Prozess und unterstützt ab dieser Version keinen Compact-Betrieb mehr. So teilt seine JavaScript-Verarbeitung keinen Compact-Prozess mit anderen Adaptern oder dem Hauptcontroller. Die Wartezeit auf einzelne Datenbankoperationen ist auf zwei Sekunden begrenzt; beim Beenden ist auch das Warten auf abschließende Statusmeldungen begrenzt. Der Unload-Pfad ist auf eine Rückgabe innerhalb von höchstens 250 Millisekunden ausgelegt.

Diese Änderungen beheben nachgewiesene Schwachstellen der Implementierung. Ohne passende Laufzeitprotokolle lässt sich daraus nicht ableiten, dass genau diese Schwachstellen jede gemeldete Störung verursacht haben. Ein Modell- und Firmwaretest am tatsächlichen Fernseher bleibt erforderlich.

## Protokoll und Grenzen dieser Version

Die Netzwerkschnittstelle verwendet `POST /loewe_tablet_0001` mit dem SOAP-Namensraum `urn:loewe.de:RemoteTV:Tablet`. Die Anmeldung erfolgt mit `RequestAccess`; die Antwort liefert die `ClientId` für Folgeanfragen. Die Original-App hängt ein NUL-Byte an den XML-Body an. Der Adapter übernimmt dieses Verhalten standardmäßig.

Die ursprünglichen Tastencodes, Requestvorlagen und die Lautstärkeskalierung stammen aus Loewe App 1.4.7. Die Zifferntasten und der alternative EPG-Code stammen aus Löwenbändiger Remote 1.15. Die App-Stufe 20 entspricht im Protokoll dem Wert 200000. `SetMute` mit `Value=1` ist im App-Sendepfad nachgewiesen. Das Aufheben mit `Value=0` ist aus dem Antwortparser und der Gegenoperation abgeleitet; die Toggle-Taste `remote.mute` ist separat nachgewiesen.

Bei `AddServicesFavoriteList` enthält die extrahierte Originalvorlage einen falschen XML-Endtag. Der Adapter erzeugt für diese Aktion wohlgeformtes XML.

Die universellen API-Datenpunkte erschließen die extrahierten Aktionen. Sie enthalten keine bestätigte Kompatibilitätsliste aller Loewe-Modelle und bilden komplexe Aufnahme- und Favoritenverwaltung noch nicht als eigene Formularoberfläche ab. Die UPnP/DLNA-Mediensteuerung aus der App, WS-Eventing, automatische Gerätesuche und lange Fernbedienungstastendrücke gehören nicht zum Funktionsumfang dieser Version.

## Quellcode und Weiterentwicklung

Die Weiterentwicklung findet im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv) statt. Das Abrufen des Quellcodes, die Tests und das Erzeugen des installierbaren `.tgz`-Pakets sind unter [Installationspaket aus dem Quellcode erzeugen](#installationspaket-aus-dem-quellcode-erzeugen) beschrieben.

Die Tests verwenden simulierte TV-Antworten sowie echte HTTP- und UDP-Verbindungen ausschließlich über die lokale Loopback-Schnittstelle. Sie prüfen das Verhalten der Implementierung, ersetzen aber keinen Start in einem tatsächlichen ioBroker-Controller und keinen Modell- und Firmwaretest am realen Fernseher. Einzelheiten und ausgeführte Prüfungen stehen in [docs/PRUEFBERICHT.txt](docs/PRUEFBERICHT.txt).

Offizielle ioBroker-Grundlagen:

- [Installation eigener Paketquellen im js-controller](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts)
- [Instanzen und Compact-Modus über die ioBroker-CLI](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md)
- [JSON-Konfiguration im Admin](https://github.com/ioBroker/ioBroker.admin/blob/master/packages/jsonConfig/README.md)
- [Datenpunkte steuern mit `setState`](https://github.com/ioBroker/ioBroker.javascript/blob/master/docs/en/javascript.md#setstate)

## Lizenz

Der neu geschriebene Adaptercode steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE).

## Änderungsverlauf

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
