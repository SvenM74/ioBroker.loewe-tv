# Loewe TV für ioBroker

Die aktualisierte Version **0.1.6** bietet eine **Auswahl der verfügbaren TV-Senderlisten in der Adapter-Konfiguration**. Unter `channels.tv` wird ausschließlich die dort ausgewählte Liste abgebildet. Du kannst Fernbedienungstasten auslösen, Lautstärke und Stummschaltung setzen, die gewählte TV-Liste automatisch aktualisieren, einzelne TV-Sender über eigene Taster anwählen und Wake-on-LAN auslösen. Die Bereiche `channels.radio`, `api` und `media` sind entfernt; vorhandene Objekte dieser Bereiche werden beim Start bereinigt. **Die Versionsnummer bleibt ausdrücklich 0.1.6. Installierte ältere Fassungen derselben Version müssen mit dem aktuellen Paket erneut installiert werden.** Die Kennung **`info.adapterBuild = 0.1.6-channel-list-config.1`** unterscheidet diesen Stand.

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
| Radio-Auswahl | Auch der erste Stand von 0.1.6 schaltet laut Nutzer weiterhin nicht auf Radio um. Die Radiounterstützung wurde deshalb auf seinen Wunsch aus der aktualisierten 0.1.6 entfernt und für später zurückgestellt. |
| Einschalten | Im bisher installierten Stand nicht erfolgreich, obwohl das Einschalten über LAN am TV aktiviert ist. |

**Senderabruf, Senderordner und die TV-Auswahl mit Namens-IDs sind damit am SL420 grundsätzlich nachgewiesen.** Die Zahl 372 stammt aus der früheren gemischten Antwort und umfasst TV, Radio sowie Mehrfachbelegungen; sie ist keine erwartete Anzahl der aktuellen TV-Senderordner. Der kurze TV-Test bestätigt nicht alle Sender, das Umsortieren oder sämtliche Migrationsfälle. Für den Einschaltablauf aus Wake-on-LAN plus gezieltem `TV_ON`-Befehl fehlt weiterhin eine Erfolgsmeldung. Die frühere Rückmeldung zu den Fernbedienungstasten schließt `remote.power_on` aus 0.1.2 und `remote.tv_mode_on` aus 0.1.6 nicht ein. Sie ist auch keine Zusage für andere Modelle oder Firmwarestände.

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

Der Quellcode steht im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv). Ein fertiges `.tgz`-Paket ist dort derzeit nicht als Release hinterlegt. Du kannst es mit den folgenden Schritten selbst erzeugen. Wenn du `iobroker.loewe-tv-0.1.6-channel-lists.tgz` bereits erhalten hast, kannst du diese Datei direkt für die anschließende Update- oder Erstinstallationsanleitung verwenden.

Zum Erzeugen des Pakets brauchst du Git und Node.js ab 22. Öffne ein Terminal in einem eigenen Arbeitsverzeichnis und führe aus:

```bash
git clone https://github.com/SvenM74/ioBroker.loewe-tv.git
cd ioBroker.loewe-tv
npm install
npm test
npm pack
mv iobroker.loewe-tv-0.1.6.tgz iobroker.loewe-tv-0.1.6-channel-lists.tgz
```

`npm pack` erzeugt zunächst `iobroker.loewe-tv-0.1.6.tgz`. Der letzte Befehl benennt die Datei zur Unterscheidung vom früheren Radio-Versuch in **`iobroker.loewe-tv-0.1.6-channel-lists.tgz`** um; die Paketversion bleibt **0.1.6**. Kopiere die neu erzeugte Datei auf den ioBroker-Rechner und verwende die passende Anleitung unten.

## Update auf 0.1.6

**Auch wenn bereits 0.1.6 installiert ist: das aktualisierte Paket erneut installieren und anschließend die Instanz starten. Ein einfacher Neustart lädt den geänderten Programmcode nicht nach.** Die vorhandene Instanz weiterverwenden. Erzeuge das Paket aus den aktuellen GitHub-Inhalten wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende das neu bereitgestellte Archiv **`iobroker.loewe-tv-0.1.6-channel-lists.tgz`**. Kopiere es auf den ioBroker-Rechner, beispielsweise nach `/tmp`, und führe aus:

```bash
iobroker stop loewe-tv.0
iobroker compact loewe-tv.0 disable
iobroker url /tmp/iobroker.loewe-tv-0.1.6-channel-lists.tgz loewe-tv
iobroker start loewe-tv.0
```

Der Compact-Befehl betrifft die Instanz `loewe-tv.0`. Ab Version 0.1.1 läuft der Adapter in einem eigenen Prozess; das gilt auch für 0.1.6. Die Umstellung erfolgt vor dem Paketupdate, damit sie auch bei einer vorhandenen Instanz wirksam wird. Die Syntax ist in der [offiziellen ioBroker-CLI-Dokumentation](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md) beschrieben. Verbindungs- und Einschalteinstellungen bleiben erhalten. **Die TV-Senderliste wird nach diesem Update erstmals in der Adapter-Konfiguration ausgewählt und gespeichert.** Ein früherer Wert in `channels.view` wird nicht automatisch als neue Konfiguration übernommen.

Beim Start werden **`loewe-tv.0.channels.radio`**, **`loewe-tv.0.api`** und **`loewe-tv.0.media`** einschließlich ihrer Unterobjekte sowie `remote.radio_mode_on` und `channels.mediaType` entfernt. Das gilt auch für verwaiste Kinder, deren oberster Ordner bereits fehlt. Alte Radioeinträge aus dem gespeicherten Katalog erzeugen keine neuen Radioordner. Schreibbefehle an entfernte Datenpunkte lösen keine Adapterfunktion mehr aus. `remote.tv_mode_on` und `remote.text` für Teletext bleiben verfügbar.

Öffne nach dem Update die Einstellungen neu, wähle bei eingeschaltetem TV die gewünschte Senderliste und speichere. Die Anleitung steht unter [TV-Senderliste auswählen](#tv-senderliste-auswählen). Prüfe anschließend `info.adapterBuild`: Für dieses Paket muss der Wert **`0.1.6-channel-list-config.1`** lauten. Fehlt der Wert, ist dieser Programmstand noch nicht bis zur Initialisierung der Datenpunkte gestartet; prüfe Installation und Startprotokoll. Das Startprotokoll enthält die Build-Kennung auch vor der Bereinigung. Bleiben entfernte Objekte stehen, meldet der Adapter einen Bereinigungsfehler und setzt die Senderanlage nicht fort.

**Beim Update von einem Stand mit Namens-IDs bleiben die TV-Senderpfade erhalten.** Nur beim Wechsel von älteren Hash- oder Nummernordnern ändern sich die IDs einmalig: Aus `channels.tv.service_<Hash>` aus 0.1.3 oder `channels.tv.1` aus dem ersten 0.1.4-Stand werden Ordner wie `channels.tv.Das_Erste_HD`. Passe vorhandene Skripte, Aliase und Visualisierungen an, wenn sie noch auf diese alten IDs verweisen. Anschließend bleibt der Pfad beim Umsortieren erhalten: Verschiebst du Das Erste HD am TV von Platz 1 auf Platz 7, verwendet `channels.tv.Das_Erste_HD.select` nach dem Abgleich dessen neuen Programmplatz. Eine tatsächliche Änderung des Sendernamens führt dagegen zu einer neuen Namens-ID.

Wiederherstellung und Migration übernehmen ausschließlich Daten, die zur konfigurierten Listenkennung gehören. Das gilt für gespeicherte Kataloge, verwaltete TV-Senderordner und alte Antworten aus `channels.items`. Mehrere Plätze desselben Dienstes werden in einem Senderordner zusammengefasst; der kleinste gültige Programmplatz ist die bevorzugte Position für Anzeige und Auswahl. Normale verwaltete Ordner anderer Listen werden beim Start entfernt, auch wenn der TV nicht erreichbar ist. Ohne gewählte Liste wird kein TV-Senderbestand aktiviert. Benutzerdefinierte Unterobjekte, `common.custom` und Löschschutz bleiben beim TV-Abgleich erhalten; betroffene Altordner bleiben deaktiviert bestehen.

Schalte den TV ein, speichere die gewünschte Liste in der Konfiguration und schreibe bei Bedarf `channels.refresh=true` mit `ack:false`. Der Adapter fragt diese Liste mit dem festen Filter `video` ab und übernimmt ausschließlich TV-Sender. Sobald `channels.refreshStatus=ready` und `channels.catalogStatus=ready` stehen, kannst du beispielsweise `channels.tv.Das_Erste_HD.select` prüfen. Die Struktur und die Bedeutung der Statuswerte stehen unter [TV-Sender einzeln anwählen](#tv-sender-einzeln-anwählen). Eine Senderwahl setzt einen erreichbaren Fernseher voraus und startet keinen eigenen Einschaltablauf.

Wenn du zugleich das bisher erfolglose Einschalten prüfen möchtest, beschreibt [Ein- und Ausschalten](#ein--und-ausschalten) den separaten Test mit `control.powerOn` und `info.powerOn`. Für eine Diagnose ohne automatische TV-Abfragen **beide Intervalle**, `pollInterval` und `channelRefreshInterval`, auf 0 setzen. `info.connection` bleibt dann nach dem Start zunächst `false`, bis eine erfolgreiche manuelle TV-Abfrage oder ein Befehl die Verbindung bestätigt.

## Erstinstallation aus der Paketdatei

1. Erzeuge **`iobroker.loewe-tv-0.1.6-channel-lists.tgz`** wie [oben beschrieben](#installationspaket-aus-dem-quellcode-erzeugen) oder verwende eine bereits erhaltene Paketdatei dieser Version. Die Datei nicht entpacken.
2. Kopiere sie auf den Rechner, auf dem ioBroker läuft, beispielsweise nach `/tmp/iobroker.loewe-tv-0.1.6-channel-lists.tgz`.
3. Öffne dort ein Terminal oder eine SSH-Verbindung und führe aus:

```bash
iobroker url /tmp/iobroker.loewe-tv-0.1.6-channel-lists.tgz loewe-tv
```

4. Lege beim ersten Installieren eine Instanz an:

```bash
iobroker add loewe-tv
```

5. Öffne in ioBroker Admin **Instanzen → loewe-tv.0 → Einstellungen**. Trage die IP-Adresse des Fernsehers ein und speichere die Konfiguration.
6. **Aktiviere die Instanz `loewe-tv.0`** in der Instanzübersicht. Neue Instanzen werden zunächst deaktiviert angelegt, damit vor dem Start die TV-Adresse eingetragen werden kann.
7. Öffne die Einstellungen erneut und wähle die gewünschte **TV-Senderliste** wie unten beschrieben. Speichere die Konfiguration.
8. Öffne **Objekte → loewe-tv.0**. Bei erreichbarem Fernseher und aktivierten automatischen Abfragen sollte `info.connection` auf `true` wechseln. Sind beide Abfrageintervalle auf 0 gesetzt, stattdessen `control.refresh = true` auslösen. Mit `remote.home = true` lässt sich anschließend der erste Tastendruck testen; `channels.refresh = true` lädt die vollständige konfigurierte Senderliste.

Der Pfad hinter `iobroker url` muss auf dem ioBroker-Rechner existieren und für die Installation lesbar sein. Ein Downloadpfad auf deinem Handy oder PC genügt nicht. Bei Docker muss die Datei innerhalb des ioBroker-Containers erreichbar sein und der Befehl dort ausgeführt werden. Verwende auf anderen Systemen den entsprechenden absoluten Pfad.

Für das Update einer bestehenden Installation die Anleitung oben verwenden. Eine zusätzliche Instanz ist dafür nicht erforderlich. Lade die Admin-Seite nach dem Update neu, falls noch die bisherige Konfigurationsmaske angezeigt wird.

Diese Installation verwendet den ioBroker-Befehl für eine eigene Paketquelle. Der offizielle js-controller reicht die Paketdatei an seinen Paketinstaller weiter und übernimmt danach die Adapterdateien und Objektdefinitionen. Siehe [ioBroker-Installationscode](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts).

## Konfiguration

### Verbindung und Senderlisten

| Einstellung | Standard | Bedeutung |
|---|---:|---|
| Adresse des Fernsehers | leer | IP-Adresse oder Hostname des TVs, ohne `http://`, Pfad oder Port. Eine feste DHCP-Zuordnung im Router ist hilfreich. |
| TV-Senderliste (`channelListView`) | keine Auswahl | Verbindliche Senderliste für `channels.tv`. Die Auswahlliste wird vom laufenden Adapter am eingeschalteten TV abgefragt. Ohne Auswahl werden keine TV-Sender aktiviert. |
| Statusintervall (`pollInterval`) | 30 Sekunden | 0 deaktiviert automatische Statusabfragen einschließlich der Statusabfrage beim Start. Andernfalls sind ganze Werte von 5 bis 3.600 Sekunden möglich. Die Senderaktualisierung hat ein eigenes Intervall. Manuelle Befehle und `control.refresh` bleiben verfügbar. |
| Senderlistenintervall (`channelRefreshInterval`) | 300 Sekunden | Lädt die gewählte Senderliste automatisch beim Start beziehungsweise nach bestätigter Wiederverbindung und danach im eingestellten Abstand neu. 0 deaktiviert diese Automatik; sonst sind ganze Werte von 60 bis 86.400 Sekunden möglich. `channels.refresh` bleibt manuell verfügbar. |
| Maximale Lautstärke bei direkten Befehlen | 99 | Obergrenze für `control.volume`. Für den Alltag kann hier beispielsweise 40 stehen. Fernbedienungstasten und Änderungen direkt am TV werden dadurch nicht begrenzt. |
| Aktuelle Wiedergabe abfragen | aktiviert | Fragt bei Statusabfragen zusätzlich die aktuelle Wiedergabe ab, auch bei einem manuellen `control.refresh`. Bei einem Modell ohne Unterstützung für `GetCurrentPlayback` deaktivieren. |

### TV-Senderliste auswählen

1. Den Fernseher einschalten. Seine Adresse und den Steuerport in der Adapter-Konfiguration speichern und die Instanz aktivieren.
2. **Instanzen → loewe-tv.0 → Einstellungen → Senderlisten** öffnen. Im Feld **TV-Senderliste** lädt der Adapter die verfügbaren Senderlisten vom TV. Mit **Senderlisten neu laden** kannst du den Abruf wiederholen.
3. Die gewünschte Liste auswählen, beispielsweise **ASTRA LCN** oder eine eigene Favoritenliste, und **Speichern und schließen** wählen.
4. Der nächste vollständige Abgleich bildet ausschließlich diese Liste unter **`loewe-tv.0.channels.tv`** ab. Bei deaktivierter Senderautomatik einmal `channels.refresh=true` auslösen.

Die Auswahl verwendet die vom Fernseher gelieferte Listenkennung. Gleichnamige Listen lassen sich über ihre Kennung unterscheiden. Es werden auch weitere Antwortseiten und leere Senderlisten berücksichtigt. Reine `avlist`-Eingangslisten gehören nicht zu den Senderlisten. Die Listenabfrage verändert die gespeicherte Auswahl nicht; erst das Speichern der Konfiguration legt eine andere Liste fest.

Beim ersten Update auf diese Fassung ist die neue Auswahl leer. `channels.refreshStatus=notConfigured` fordert zur Auswahl auf. Ein alter Wert in `channels.view` überschreibt die Konfiguration nicht. **`channels.view` ist jetzt nur lesbar** und zeigt die konfigurierte Kennung an. Schreibbefehle an den früheren Parameter schalten nicht mehr auf eine andere Liste um.

Bei ausgeschaltetem TV, laufender TV-Synchronisierung oder einem Abruffehler zeigt die Auswahl einen Hinweis. Eine bereits eingetragene Kennung bleibt bestehen; der Adapter wählt keinen Ersatz. Wenn du Adresse oder Port noch nicht gespeichert hast, zunächst speichern und die Einstellungen erneut öffnen. Wird die gewählte Liste später am Fernseher gelöscht, wähle bewusst eine andere Liste in der Konfiguration. Das bloße Öffnen der Einstellungen schaltet den Fernseher nicht auf einen anderen Sender um.

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
| `control.powerOn` | Taster | Startet Wake-on-LAN sofort und sendet anschließend den gezielten Einschaltbefehl 22, sobald die Schnittstelle antwortet. Bekannte TV-MAC-Adresse erforderlich; begrenzte Gesamtdauer und Ablauf in `info.powerOn`. |
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

`remote.tv_mode_on` folgt dem Befehl `TV_MODE_ON=72` im Alphabet `l2700` aus der [Loewe Remote API 1.0.47, Abschnitt 9.4.1.1, Seite 25](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf). Der Taster sendet einen Tastendruck einschließlich Loslassen und wechselt gezielt in den TV-Modus. Für die Auswahl eines bestimmten TV-Senders gibt es dessen `select`-Taster.

`remote.power_all_code` wird nur an den Fernseher dieser Instanz gesendet. Der Name stammt aus der App und bleibt für vorhandene Skripte erhalten. Die [Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) unterscheidet den Umschaltbefehl 12 von `TV_ON` (22) und dem gezielten Ausschaltbefehl 25. **Ab 0.1.2 verwendet `control.powerOff` den Code 25.** `remote.power_off` behält den bisherigen Code 12. Zum Aufwecken aus dem Standby `control.powerOn` verwenden; `remote.power_on` sendet allein die Taste 22 über die bereits erreichbare Steuerschnittstelle.

```javascript
// Einen einzelnen Tastendruck senden.
setState('loewe-tv.0.remote.home', true, false);
```

`remote.text` öffnet Teletext. Die frühere freie Texteingabe über `media.text` gehört zum entfernten `media`-Bereich und steht nicht mehr als Datenpunkt zur Verfügung.

Die zehn Zifferntasten und `epg_alt` wurden in 0.1.1 anhand von Löwenbändiger Remote 1.15 ergänzt. Die bisherigen 29 Tastenbelegungen bleiben unverändert. Auf dem oben beschriebenen bild 7.55 führten die EPG-Codes 15 und 78 laut Nutzer zur gleichen TV-Anzeige. Die Zifferntasten senden einzelne Tastendrücke; ob eine Ziffernfolge eine Senderwahl auslöst, hängt vom TV und vom gerade geöffneten Bildschirm ab.

```javascript
setState('loewe-tv.0.remote.digit_1', true, false);
```

### Senderlisten und Umschalten

**Mit `channels.refresh = true` wird die in der Adapter-Konfiguration ausgewählte Senderliste vollständig abgeglichen.** Bei erreichbarem TV und dem standardmäßigen Senderlistenintervall von 300 Sekunden geschieht das auch automatisch. Die Auswahl erfolgt im Feld **TV-Senderliste** (`channelListView`); `channels.view` zeigt diese Kennung nur an. Ohne Auswahl startet kein automatischer Senderabruf. Eine nicht mehr gültige Kennung wird nicht durch eine andere Liste ersetzt.

| Datenpunkt | Typ | Bedeutung |
|---|---|---|
| `channels.view` | Text, nur lesen | Kennung der in der Adapter-Konfiguration ausgewählten Liste. Leer bedeutet: noch keine Liste konfiguriert. |
| `channels.refresh` | Taster | Lädt die vollständige gewählte TV-Senderliste; verwendet dafür eigene Seitenparameter und immer den Filter `video`. |
| `channels.start` | Zahl, lesen/schreiben | Startindex für die manuelle Einzelseitenabfrage `channels.getChannels`, Standard 0. |
| `channels.listStart` | Zahl, lesen/schreiben | Eigener Startindex für `channels.getLists`, Standard 0. |
| `channels.count` | Zahl, lesen/schreiben | Seitengröße für `channels.getChannels` und `channels.getLists`, Standard 100, erlaubte Werte 1 bis 500. |
| `channels.getLists` | Taster | Fragt die Senderlisten ab `channels.listStart` ab. |
| `channels.getChannels` | Taster | Fragt mit dem festen Filter `video` eine einzelne Seite der konfigurierten Senderliste ab `channels.start` ab. Ohne konfigurierte Liste erscheint ein Hinweis. |
| `channels.availableLists` | JSON-Text, lesen | Aufbereitete Listen mit `view`, `name`, `totalResults` und `hash`. Nach dem erfolgreichen Abruf der Konfigurationsauswahl enthält der Wert alle eingelesenen Listen; nach `channels.getLists` nur die manuell angefragte Seite. Anfangswert `[]`. |
| `channels.entries` | JSON-Text, lesen | Aufbereitete TV-Sender der zuletzt manuell abgefragten Seite, auf `video` gefiltert. Anfangswert `[]`. |
| `channels.totalNumber` | Zahl, lesen | Vom TV gemeldete Gesamtzahl der Listeneinträge bei der Seitenabfrage; `-1`, wenn unbekannt. Mehrfachbelegungen werden mitgezählt. |
| `channels.returnedNumber` | Zahl, lesen | Anzahl der Listeneinträge auf der zuletzt manuell empfangenen Seite. |
| `channels.nextStart` | Zahl, lesen | Startindex der nächsten Senderseite. `-1`, wenn keine weitere Seite ermittelt wurde. |
| `channels.nextListStart` | Zahl, lesen | Startindex der nächsten Senderlistenseite. `-1`, wenn keine weitere Seite ermittelt wurde. |
| `channels.lastUpdate` | Zeitstempel, lesen | Letzte erfolgreiche Einzelseitenabfrage über `channels.getChannels` oder `channels.getLists`, Unixzeit in Millisekunden. Der Abruf der Konfigurationsauswahl ändert diesen Wert nicht. |
| `channels.lastError` | Text, lesen | Letzter Fehler der manuellen Abfragen; wird nach erfolgreicher Abfrage geleert. |
| `channels.lastSelection` | JSON-Text, lesen | Diagnose der letzten gestarteten TV-Senderauswahl mit Senderkennung, verwendetem Locator, Umschaltergebnis, TV-Antwort und gegebenenfalls Fehler. |
| `channels.lists` | JSON-Text, lesen | Unveränderte Antwort der letzten manuellen Senderlistenseite über `channels.getLists`. Der Abruf der Konfigurationsauswahl aktualisiert diesen Wert nicht. |
| `channels.items` | JSON-Text, lesen | Unveränderte Struktur der Senderantwort der zuletzt manuell abgefragten Seite. |

`channels.refresh` und `channels.getChannels` verwenden ausschließlich `channelListView` aus der Konfiguration und immer den TV-Filter `video`. Die manuellen Parameter `start`, `count` und `listStart` bleiben davon unabhängig. Das Schreiben eines solchen Seitenparameters allein startet keine TV-Anfrage. Eine Antwort mit abweichender Listenkennung wird nicht in die Senderobjekte übernommen.

`channels.entries` enthält pro Sender die Felder `mediaItemUuid`, `name`, `locator`, `caption`, `itemClass`, `attributes`, `thumbnailUrl`, `streamingUrl` und `originalStreamingUrl`. Nicht gelieferte optionale Texte bleiben leer. Zum Umschalten den jeweiligen `select`-Taster unter `channels.tv` verwenden. Die frühere freie Locator-Eingabe im entfernten `media`-Bereich entfällt.

Für eine andere Liste die Adapter-Konfiguration öffnen, bei Bedarf **Senderlisten neu laden**, eine Liste auswählen und speichern. Der Abruf der Auswahloptionen allein ändert den aktiven Senderbestand nicht. Falls der TV noch seine Listen synchronisiert, den Abruf später erneut starten.

**`channels.getChannels` und `channels.getLists` bleiben Einzelseitenabfragen.** Sobald `channels.getChannels` abgeschlossen ist und `channels.nextStart` einen Wert ab 0 enthält, kannst du diesen Wert nach `channels.start` übernehmen und erneut `channels.getChannels` auslösen. Für weitere Senderlistenseiten entsprechend `channels.nextListStart` nach `channels.listStart` übernehmen und `channels.getLists` auslösen. Die nächste Senderseite ersetzt die vorherigen Seitendaten in `channels.items` und `channels.entries` und ergänzt die Senderobjekte. `-1` allein ist kein Vollständigkeitsnachweis, wenn die TV-Antwort keine ausreichenden Seitenangaben enthält.

Das Anfrageformat folgt Kapitel 9.7 der [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf). Der Adapter fordert ausschließlich `video` an. Falls der Fernseher dennoch gemischte Antworten liefert, übernimmt der Senderkatalog nur Einträge mit `itemClass=video`. Rohdiagnosen können weiterhin Audioeinträge aus der Geräteantwort enthalten; daraus werden keine Radioobjekte erzeugt. Gemeldete Seitenzahlen beziehen sich auf die TV-Antwort und müssen nicht der Anzahl der erzeugten Senderordner entsprechen.

Beispiel für einen vollständigen Abruf der konfigurierten Liste:

```javascript
setState('loewe-tv.0.channels.refresh', true, false);
```

Das Schreiben löst die TV-Abfrage aus; `channels.refreshStatus` und `channels.refreshError` zeigen den Abruf, `channels.catalogStatus` die anschließende Objektaufbereitung.

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
| `numbers` | JSON-Liste mit den Originalbeschriftungen aller bekannten Programmplätze dieses Dienstes. |
| `mediaItemUuid` | Dienstkennung aus der TV-Antwort. |
| `locator` | Original-Locator der bevorzugten Position aus der TV-Senderliste. |
| `locators` | JSON-Liste mit den Original-Locators aller bekannten Programmplätze dieses Dienstes. |
| `positions` | JSON-Liste mit den zusammengehörenden Werten `caption` und `locator` aller bekannten Positionen. |
| `listView` | Kennung der zugehörigen Senderliste. |
| `available` | Ob der Sender im bekannten aktiven Bestand eindeutig zugeordnet und über einen verwendbaren Locator auswählbar ist; kein Empfangs-, Wiedergabe- oder Bildschirmstatus. |
| `epg.status` | In 0.1.6 fest `notImplemented`: Der Ordner ist für den späteren EPG-Import vorbereitet. |

Ein Sender kann mehrfach in der TV-Liste stehen. Das Erste HD auf 1, 100 und 1000 ergibt **einen Ordner**: `channels.tv.Das_Erste_HD`. `numbers`, `locators` und `positions` enthalten alle drei Belegungen. `number`, der angezeigte Ordnername und die direkte TV-Auswahl verwenden die kleinste gültige Position, in diesem Beispiel 1. Entfernst du diesen Platz und bleiben 100 und 1000 erhalten, wird nach dem vollständigen Abgleich Platz 100 bevorzugt. Der Ordnerpfad bleibt gleich.

Die Programmposition wird aus der gültigen numerischen Beschriftung des Eintrags bestimmt; führende Nullen entfallen in `number` und im angezeigten Ordnernamen. Fehlt eine brauchbare Beschriftung, kann die Nummer aus einem passenden `channel://`-Locator übernommen werden. Originalbeschriftung und Original-Locator bleiben in den Positionsdaten erhalten. Eine widersprüchliche oder nicht eindeutig zuordenbare Position wird nicht als Umschaltziel verwendet.

**Beim Umsortieren bleibt die Sender-ID erhalten.** Verschiebst du Das Erste HD von Platz 1 auf Platz 7, bleibt `channels.tv.Das_Erste_HD` bestehen. Nach dem vollständigen Abgleich zeigen `number` und der Ordnername den Wert 7; `locator` und der Taster verwenden die neue Position. Das vorhandene Skript mit `channels.tv.Das_Erste_HD.select` steuert weiterhin Das Erste HD. Voraussetzung ist, dass Platz 7 dann die kleinste noch vorhandene Position dieses Dienstes ist. Eine echte Umbenennung am TV ändert dagegen die aus dem Namen gebildete ID. EPG- und Aufnahmeregeln müssen zusätzlich `mediaItemUuid`, Medienart und Listenbezug erhalten, damit gleichnamige Dienste eindeutig zugeordnet bleiben.

#### Rückmeldung der TV-Senderauswahl

`channels.lastSelection` enthält die zuletzt gestartete Auswahl mit Senderziel, verwendetem Locator, `ZapToMedia`-Antwort, Ergebnis und Zeitstempeln. `status=accepted` bedeutet `Result=0`; `unconfirmed` steht für eine Antwort ohne auswertbares Ergebnis, `error` für einen Ablauf- oder Befehlsfehler. Ein ausdrücklich von null abweichendes `Result` wird als Fehler gemeldet. Die Annahme des Befehls und das Rücksetzen des Tasters sind noch kein Nachweis des sichtbaren Programms am Fernseher.

Für einen Fehlerbericht genügt zunächst dieser Diagnosewert nach dem betreffenden Versuch. Bleibt `startedAt` unverändert, zusätzlich `info.lastError` lesen, da die Auswahl bereits vor ihrem Start abgewiesen worden sein kann. Die gesamte Senderliste muss nicht erneut kopiert werden.

#### Gespeicherter Senderbestand und Aktualisierung

**Ja, die Senderobjekte werden an die Konfiguration des Fernsehers angepasst.** Bei aktivem `channelRefreshInterval` erfolgt der Abgleich automatisch beim Start, nach einer tatsächlich erkannten Wiederverbindung und anschließend im eingestellten Abstand. Standard sind 300 Sekunden. Ist der TV bei aktiviertem Statuspolling bereits als nicht erreichbar bekannt, wartet der Senderabruf auf die Wiederverbindung. Bei deaktiviertem Statuspolling versucht die Senderaktualisierung den Abruf selbst. Ein laufender Abgleich wird nicht parallel gestartet und weckt den TV nicht auf.

Mit `channels.refresh=true` kannst du jederzeit einen vollständigen Abgleich anfordern, auch wenn das Senderlistenintervall 0 ist. Die Statusabfragen über `pollInterval` und `control.refresh` bleiben davon unabhängig. Für einen rein manuellen Betrieb beide Intervalle auf 0 setzen.

Der Komplettabruf liest ab Startindex 0 mit höchstens 500 Einträgen je Seite. Eine Liste mit mehreren Seiten wird zweimal vollständig gelesen und nur bei übereinstimmendem Inhalt übernommen. Dadurch werden während des Abrufs geänderte Listen nicht als sicherer Gesamtbestand behandelt. Ein Lauf ist auf 2.000 Programmplätze, 20 Seiten je Durchlauf und ein Zeitlimit von 120 Sekunden für den Abruf begrenzt. Für den gespeicherten Katalog gelten weiterhin 480 KiB. Bei überschrittenen Grenzen oder einer nicht eindeutig auswertbaren Antwort bleibt der bisherige Bestand erhalten.

Nach einem erfolgreichen vollständigen Abgleich werden neue Senderordner angelegt und die Positionen vorhandener Sender aktualisiert. Ordner für nicht mehr vorhandene, vom Adapter verwaltete Sender werden entfernt. **Fehler, Standby und einzelne Teilantworten lösen keine Entfernung fehlender Sender aus.** Manuell geladene Teilseiten ergänzen beziehungsweise aktualisieren eindeutig beobachtete Senderdaten und erhalten die übrigen Einträge. Eine einzelne vollständige und gültige manuelle TV-Antwort kann ebenfalls einen Abgleich auslösen. Eine bloße Folge manueller Teilseiten gilt nicht als Nachweis eines vollständigen Bestands.

Beim laufenden TV-Senderabgleich werden benutzerdefinierte Kinder, Objekte mit `common.custom` und Objekte mit `common.dontDelete` geschützt. Benötigte alte Ordner bleiben dann als deaktivierte Reste mit `available=false` und gesperrter Auswahl bestehen. Das betrifft auch geschützte Hash-Ordner aus 0.1.3 und Nummernordner aus dem ersten 0.1.4-Stand. Normale verwaltete Altobjekte ohne solche Ergänzungen werden entfernt. **Nach dem Speichern einer anderen Senderliste werden die verwalteten Ordner der bisherigen Liste beim Start aussortiert, auch ohne erreichbaren TV.** Der nächste Abruf baut ausschließlich den Bestand der neuen Liste auf. Bei leerer Konfiguration wird kein Bestand aktiviert. Diese ausdrücklich konfigurierte Listenänderung ist von einem vorübergehenden Abruffehler bei derselben Liste zu unterscheiden.

Die Zuordnung bleibt bei unveränderter Listenwahl über einen Adapterneustart hinweg erhalten. Wiederherstellung und Migration verwenden ausschließlich passende Daten aus dem gespeicherten Katalog, verwalteten Senderobjekten oder einer vorhandenen Antwort in `channels.items`. Daten anderer Listen sowie Radiosender werden nicht aktiviert. Gespeicherte Tasterwerte werden zurückgesetzt und führen keinen Umschaltbefehl aus. Die Objektaufbereitung läuft in begrenzten Abschnitten im Hintergrund und belegt die TV-Befehlswarteschlange nicht. Bei größeren Listen können Ordner deshalb nach und nach erscheinen.

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

`channels.refreshStatus=ready` bestätigt die Übergabe des vollständigen Abrufs. **Erst `channels.catalogStatus=ready` bestätigt die abgeschlossene Objektaufbereitung.** Für die manuelle Seitenabfrage stehen weiterhin `channels.lastError`, `channels.items` und `channels.entries` bereit. Ein alter erfolgreicher Statuswert ist kein aktueller Empfangs- oder Bildschirmstatus.

**EPG-Inhalte werden in dieser Version noch nicht geladen.** Spätere Sendungslisten, Aktualisierungszeiten und EPG-Fehler sollen direkt unter `channels.tv.<Sender-ID>.epg` liegen, beispielsweise `channels.tv.Das_Erste_HD.epg`. Der vorhandene Datenpunkt `epg.status` hat den Wert `notImplemented`. Mehrere Programmplätze desselben Dienstes teilen sich diesen EPG-Ordner. Die spätere EPG-Zuordnung erfolgt anhand der Senderkennung.

### Status und Gerätedaten

| Datenpunkt | Bedeutung |
|---|---|
| `info.connection` | Ob der Fernseher zuletzt über die Steuerschnittstelle erreichbar war. |
| `info.adapterBuild` | Eindeutiger Programmstand innerhalb von 0.1.6; für diese Fassung `0.1.6-channel-list-config.1`. |
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
| Schreiben eines Datenpunkts bewirkt nichts | Mit `ack: false` schreiben. Taster erwarten `true`; Parameter der Senderabfrage starten allein noch keine Anfrage. |
| Lautstärke lässt sich nicht hoch genug setzen | Den Wert und die konfigurierte maximale Lautstärke prüfen. `control.volume` erwartet eine ganze App-Stufe, keinen Protokollrohwert. |
| `info.wakeReady` ist `false` | Die passende TV-MAC-Adresse manuell konfigurieren oder bei eingeschaltetem TV `control.refresh` auslösen. Bei `pollInterval=0` wird die MAC-Adresse beim Start nicht automatisch abgefragt. |
| `info.wakeReady` ist `true`, aber der TV startet nicht | Den aktuellen Eintrag in `info.lastWakeOnLan` und den Ablauf in `info.powerOn` prüfen. Nach dem Ausschalten mindestens 30 Sekunden warten. `powerKeySent` bestätigt nur die Antwort auf den Einschaltbefehl, kein Bild. |
| Ein Einschaltversuch aktualisiert `info.lastWakeOnLan` nicht | `info.lastError` lesen und prüfen, ob `control.powerOn` mit `true` und `ack: false` geschrieben wurde. Eine frühere Versandmeldung ist kein Nachweis für den aktuellen Versuch. |
| ioBroker wird nach dem Aktivieren der bisherigen Version träge | `loewe-tv.0` stoppen und die Updateanleitung auf 0.1.6 einschließlich der instanzbezogenen Compact-Umstellung ausführen. Für die anschließende Prüfung `pollInterval` und `channelRefreshInterval` auf 0 setzen. |
| Senderabfrage scheitert | In der Adapter-Konfiguration eine verfügbare TV-Senderliste auswählen und speichern. `channels.view` zeigt die gespeicherte Kennung. Für einen Komplettabruf `channels.refreshError` prüfen, bei manuellen Seitenabfragen `channels.lastError`, `channels.lists` und `channels.items`. Bei TV-Synchronisierung später wiederholen. |
| In der Konfiguration fehlen Senderlisten | TV einschalten, Adresse und Port speichern, Instanz aktivieren und Einstellungen erneut öffnen. **Senderlisten neu laden** betätigen und den angezeigten Hinweis beachten. |
| Radio-, API- oder Media-Objekte sind weiterhin vorhanden | `info.adapterBuild` muss `0.1.6-channel-list-config.1` zeigen. Sonst das neue Paket erneut installieren. Bei passender Build-Kennung das Startprotokoll auf Bereinigungsfehler und Löschschutz prüfen; die Objektansicht anschließend neu laden. |
| Sender wurden empfangen, unter `channels.tv` fehlen noch Objekte | `channels.catalogStatus` prüfen und bei `updating` die Hintergrundaufbereitung abwarten. Bei `error` steht die Ursache in `channels.catalogError`; danach die passende Senderliste erneut abfragen. |
| Ein Sendertaster meldet `CHANNEL_UNAVAILABLE` | Die Liste dieses Senders erneut abfragen. Bei `available=false` gehört er nicht zum aktiven Bestand oder es fehlt ein verwendbarer Locator. Nach Änderungen während der Wartezeit den Sender erneut auswählen. |
| Der Sendertaster ist wieder `false`, aber der Sender läuft nicht | Das Rücksetzen bestätigt nur die Verarbeitung des Tasters. `channels.lastSelection` auf TV-Ergebnis und Fehler prüfen. Die Annahme des Befehls allein bestätigt noch keine Wiedergabe. |
| Eine JSON-Antwort enthält `omitted: true` | Kleinere Senderbereiche abfragen, beispielsweise `channels.count` reduzieren. Der Hinweis beschreibt die ausgelassene Speicherung einer großen Antwort. |
| Ein Befehl meldet eine volle Warteschlange oder zu lange Wartezeit | Befehle langsamer senden, laufende TV-Zeitüberschreitungen prüfen und für die Diagnose beide Abfrageintervalle auf 0 setzen. |

Für einen Fehlerbericht sind TV-Modell, Firmware, Adapterversion und der konkrete Fehlertext hilfreich. Bei Einschaltproblemen zusätzlich die verwendete LAN-/WLAN-Verbindung, `info.wakeReady`, `info.lastWakeOnLan` und `info.powerOn` angeben. Bei Fehlern der Senderauswahl zunächst `channels.lastSelection` direkt nach dem Versuch sowie das vorherige und das gewünschte TV-Programm angeben. Bei Fehlern des Senderabrufs helfen `channels.refreshStatus`, `channels.refreshError`, `channels.lastError`, `channels.catalogStatus`, `channels.catalogError`, `channels.lists` und `channels.items`. Persönliche Senderlisten, Gerätekennungen oder MAC-Adressen können darin enthalten sein.

## Stabilitätsänderungen in 0.1.1

Im bisherigen Empfangspfad konnte ein regulärer Ausdruck zum Entfernen nachgestellter NUL-Zeichen bei bestimmten fehlerhaften Antworten sehr lange Rechenzeit beanspruchen und die JavaScript-Verarbeitung blockieren. Dieser Fehler wurde unabhängig von einem echten Fernseher reproduziert. 0.1.1 verwendet dafür ein Verfahren mit linearer Laufzeit und verarbeitet empfangene XML-Antworten asynchron in Abschnitten.

Zusätzlich läuft der Adapter in einem eigenen Prozess und unterstützt ab dieser Version keinen Compact-Betrieb mehr. So teilt seine JavaScript-Verarbeitung keinen Compact-Prozess mit anderen Adaptern oder dem Hauptcontroller. Die Wartezeit auf einzelne Datenbankoperationen ist auf zwei Sekunden begrenzt; beim Beenden ist auch das Warten auf abschließende Statusmeldungen begrenzt. Der Unload-Pfad ist auf eine Rückgabe innerhalb von höchstens 250 Millisekunden ausgelegt.

Diese Änderungen beheben nachgewiesene Schwachstellen der Implementierung. Ohne passende Laufzeitprotokolle lässt sich daraus nicht ableiten, dass genau diese Schwachstellen jede gemeldete Störung verursacht haben. Die inzwischen vorliegende Rückmeldung zur Fernbedienung steht oben; sie ist kein vollständiger Stabilitätsnachweis.

## Protokoll und Grenzen dieser Version

Die Netzwerkschnittstelle verwendet `POST /loewe_tablet_0001` mit dem SOAP-Namensraum `urn:loewe.de:RemoteTV:Tablet`. Die Anmeldung erfolgt mit `RequestAccess`; die Antwort liefert die `ClientId` für Folgeanfragen. Die Original-App hängt ein NUL-Byte an den XML-Body an. Der Adapter übernimmt dieses Verhalten standardmäßig.

Die ursprünglichen Tastencodes, Requestvorlagen und die Lautstärkeskalierung stammen aus Loewe App 1.4.7. Die Zifferntasten und der alternative EPG-Code stammen aus Löwenbändiger Remote 1.15. TV_ON (22), TV_MODE_ON (72) und die ergänzte Bedeutung der Ein-/Ausschaltcodes folgen der Remote API 1.0.47. Die App-Stufe 20 entspricht im Protokoll dem Wert 200000. `SetMute` mit `Value=1` ist im App-Sendepfad nachgewiesen. Das Aufheben mit `Value=0` ist aus dem Antwortparser und der Gegenoperation abgeleitet; die Toggle-Taste `remote.mute` ist separat nachgewiesen.

Die extrahierten SOAP-Vorlagen bleiben in [protocol-templates.json](docs/protocol-templates.json) und [remote115-protocol.json](docs/remote115-protocol.json) als Entwicklungsunterlagen erhalten. Der Adapter verwendet den internen SOAP-Transport weiterhin für seine dokumentierten Funktionen.

Ein lokaler EPG-Abruf über `CreateIterator` und die Tabelle `de.loewe.sl2.epg` ist inzwischen in Kapitel 9.22 der Hersteller-API dokumentiert. Dieser Import ist noch nicht umgesetzt; Details und belegte Feldkennungen stehen in der [Aufnahme-Roadmap](docs/ROADMAP.md#lokales-epg-über-die-dokumentierte-iterator-schnittstelle). Gracenote ist damit keine notwendige Voraussetzung für den geplanten ersten EPG-Weg.

Die universellen API-Datenpunkte, die Radiosteuerung und der gesamte `media`-Datenpunktbaum sind aus dem aktuellen Funktionsumfang entfernt. Komplexe Aufnahme- und Favoritenverwaltung, UPnP/DLNA-Mediensteuerung, WS-Eventing, automatische Gerätesuche und lange Fernbedienungstastendrücke sind ebenfalls nicht als Bedienfunktionen umgesetzt.

## Quellcode und Weiterentwicklung

Die Weiterentwicklung findet im [GitHub-Repository SvenM74/ioBroker.loewe-tv](https://github.com/SvenM74/ioBroker.loewe-tv) statt. Das Abrufen des Quellcodes, die Tests und das Erzeugen des installierbaren `.tgz`-Pakets sind unter [Installationspaket aus dem Quellcode erzeugen](#installationspaket-aus-dem-quellcode-erzeugen) beschrieben.

Die Tests verwenden simulierte TV-Antworten sowie echte HTTP- und UDP-Verbindungen ausschließlich über die lokale Loopback-Schnittstelle. Sie prüfen das Verhalten der Implementierung, ersetzen aber keinen Start in einem tatsächlichen ioBroker-Controller und keinen Modell- und Firmwaretest am realen Fernseher. Die Änderung auf reine TV-Senderunterstützung steht im [Prüfbericht zu 0.1.6](docs/PRUEFBERICHT_0.1.6.md). Die historischen Prüfberichte zu [0.1.5](docs/PRUEFBERICHT_0.1.5.md), [0.1.4](docs/PRUEFBERICHT_0.1.4.md), [0.1.3](docs/PRUEFBERICHT_0.1.3.md), [0.1.2](docs/PRUEFBERICHT_0.1.2.md) und [0.1.1](docs/PRUEFBERICHT.txt) bleiben als Nachweise für die damaligen Stände erhalten.

Der Nutzerbericht zum tatsächlichen bild 7.55 ist oben gesondert aufgeführt. Die TV-Auswahl mit Namens-IDs ist nach einem kurzen Test bestätigt. Radio blieb auch mit dem ersten 0.1.6-Versuch ohne Funktion und wurde auf Wunsch zurückgestellt. Umsortieren, sämtliche Migrationsfälle und der Einschaltablauf besitzen weiterhin keinen vollständigen Gerätetestnachweis.

Offizielle ioBroker-Grundlagen:

- [Installation eigener Paketquellen im js-controller](https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/cli/src/lib/setup/setupInstall.ts)
- [Instanzen und Compact-Modus über die ioBroker-CLI](https://github.com/ioBroker/ioBroker.docs/blob/master/docs/en/config/cli.md)
- [JSON-Konfiguration im Admin](https://github.com/ioBroker/ioBroker.admin/blob/master/packages/jsonConfig/README.md)
- [Datenpunkte steuern mit `setState`](https://github.com/ioBroker/ioBroker.javascript/blob/master/docs/en/javascript.md#setstate)

## Lizenz

Der neu geschriebene Adaptercode steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE).

## Änderungsverlauf

### 0.1.6

- Auf Nutzerwunsch innerhalb derselben Version überarbeitet: Alle verfügbaren Senderlisten in der Adapter-Konfiguration laden, gewünschte Liste auswählen und ausschließlich diese unter `channels.tv` abbilden.
- Die neue Konfiguration `channelListView` ist verbindlich. `channels.view` ist nur noch eine Anzeige. Keine automatische Ersatzliste; ohne Auswahl keine aktivierten TV-Sender.
- Gespeicherte Kataloge, native Objekte, alte Rohantworten und neue Seiten auf die konfigurierte Liste begrenzen. Beim Listenwechsel normale verwaltete Altordner auch ohne Netzwerkverbindung entfernen; geschützte TV-Altordner deaktivieren.
- Radio bleibt nach dem Gerätetest ohne Funktion und wird vorerst aus dem Adapter entfernt. `api` einschließlich Expertenoption und der gesamte `media`-Datenpunktbaum sind entfernt. Der interne SOAP-Transport und die Protokollarchive bleiben für die Adapterentwicklung erhalten.
- Beim Start veraltete Radio-, API- und Media-Objekte sowie die Radiomodustaste und den Medienart-Wahlschalter bereinigen; auch verwaiste Unterobjekte erfassen und die Bereinigung nachprüfen.
- Alle Senderabfragen verwenden fest `video`; gemischte Geräteantworten erzeugen keine Radioobjekte. `remote.tv_mode_on` (`l2700/72`) bleibt verfügbar.
- `info.adapterBuild` kennzeichnet diesen Programmstand als `0.1.6-channel-list-config.1`. Das aktualisierte Paket muss auch bei bereits installierter 0.1.6 erneut installiert werden; danach Senderliste in der Konfiguration auswählen.

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
