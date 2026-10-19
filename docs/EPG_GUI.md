# Programmübersicht und Aufnahmeaufträge

**Version 0.1.17, Build `0.1.17-remote.1`**, bietet getrennte Reiter für **EPG-Einstellungen** mit Aktivierung und Abrufintervall, **Web-Zugriff** mit der Web-Adapter-Auswahl sowie **Programmübersicht** mit Senderliste, Zeitachse und Aktionen. Die Vorschau verwendet ausschließlich den vom TV geladenen EPG-Bestand der gespeicherten Senderliste.

## Öffnen und vorbereiten

1. Installiere den Build nach der [Updateanleitung](INSTALLATION.md#update-auf-0117). `info.adapterBuild` muss **`0.1.17-remote.1`** anzeigen.
2. Verwende **ioBroker Admin ab 7.7.28**. Lade Admin nach dem Update vollständig neu und öffne die Instanz-Konfiguration erneut.
3. Starte die betreffende Instanz, beispielsweise **`loewe-tv.0`**. Prüfe unter **Verbindung** und **Senderlisten** die TV-Adresse und die gewünschte TV-Senderliste.
4. Aktiviere unter **EPG-Einstellungen** die **Programminformationen**. Das Abrufintervall beträgt standardmäßig **900 Sekunden**. Speichere Änderungen, bevor du die Übersicht verwendest.
5. Öffne **Programmübersicht**. **EPG aktualisieren** startet bei erreichbarem TV einen Abgleich; der Fortschritt erscheint in der Ansicht.

Ein EPG-Intervall von `0` deaktiviert automatische EPG-Abfragen einschließlich des Erstabrufs. Bei aktiviertem EPG bleiben manuelle Aktualisierungen möglich. Das Intervall beeinflusst weder die Anzeige gespeicherter Programme noch die Bearbeitung bereits vorgemerkter Aufnahmeaufträge.

## Bildaufbau und Navigation

Die große TV-Kanal-/Detailfläche ist entfernt. In der kompakten Auswahlzeile stehen Sender, Titel, Zeitraum und Status der gewählten Sendung. Unter **Sendungsdetails** lässt sich die Beschreibung aufklappen. Livevideo ist nicht integriert.

Die gemeinsame Bedienleiste enthält Datum, Stundenpfeile, **Jetzt**, die Stundenauswahl, **Jetzt ansehen / Aufnahme planen**, **EPG aktualisieren**, **Fernbedienung** und anschließend die Sendersuche. Auf schmalen Bildschirmen bricht sie in dieser Reihenfolge um. Die Programmtabelle nutzt die verbleibende Höhe und ordnet die Sender nach ihrer gespeicherten Position, die Sendungen nach der Uhrzeit an. Mehrere Plätze desselben TV-Dienstes teilen sich eine Zeile; die kleinste gültige Position bestimmt die Einordnung. Sender ohne passende EPG-Daten bleiben sichtbar.

Senderlogos ersetzen den Namen in der linken Tabellenspalte, wenn ein Bild verfügbar ist. Die Sendernummer bleibt sichtbar; der vollständige Name bleibt für Suche, Tooltip und Screenreader verfügbar. Eine TV-Bildadresse hat Vorrang vor dem mitgelieferten Logo. Bei Ladefehlern fällt die Anzeige auf das mitgelieferte Logo oder den Sendernamen zurück. Unter HTTPS werden unverschlüsselte TV-Bilder übersprungen. Die [Logoquellen und Grenzen](CHANNEL_LOGOS.md) sind einzeln dokumentiert.

| Element | Wirkung |
|---|---|
| Sendung anklicken | Wählt die Sendung und zeigt ihre Details sowie die passende Aktion. |
| Senderlogo, Sendername oder Position anklicken | Wählt die Senderzeile für die kompakte Auswahl. |
| **Sender suchen** | Filtert nach Name oder Position; ein leeres Suchfeld zeigt wieder alle Sender. |
| Datum und Tagespfeile | Wählen den Tag innerhalb des verfügbaren Navigationsbereichs. |
| Stundenpfeile | Verschieben den sichtbaren Ausschnitt um eine Stunde. |
| **Jetzt** | Kehrt zur aktuellen Uhrzeit zurück. |
| **2 Stunden / 3 Stunden / 6 Stunden** | Wählt die Breite der Zeitachse; Standard sind drei Stunden. |
| **Jetzt ansehen / Aufnahme planen** | Führt nach Auswahl der Sendung zur passenden TV-Aktion beziehungsweise zum Bestätigungsdialog. |
| **EPG aktualisieren** | Fordert den vorhandenen TV-Abgleich an. Ein bereits laufender Abgleich wird weiterverwendet. |
| **Fernbedienung** | Öffnet die TV-Fernbedienung der jeweiligen Instanz, auch ohne ausgewählte Sendung oder geladene EPG-Daten. |
| **Aufnahmeaufträge** | Zeigt vorgemerkte Aufträge, ihren Übertragungszustand und gegebenenfalls einen Fehler. |

Tab erreicht die Bedienelemente; Pfeiltasten wechseln innerhalb der Programmtabelle zwischen Sendungen und Zeilen. **Pos1** und **Ende** führen zur ersten beziehungsweise letzten angezeigten Sendung der Zeile. Die Uhrzeiten erscheinen in der lokalen Zeitzone des Browsers. Für Aktionsprüfungen verwendet der Adapter die Uhrzeit des ioBroker-Rechners; diese muss stimmen.

Suche, Blättern und reine Detailauswahl ändern keine Einstellungen. Die Übersicht verwendet die **gespeicherte** TV-Adresse und Liste. Ungespeicherte Formularänderungen werden erst nach dem Speichern wirksam.

## Fernbedienung öffnen

Seit **0.1.17** öffnet **Fernbedienung** einen eigenen Dialog im Stil der Loewe-Assist-Fernbedienung. Das Ziel steht im Kopf der Bedienfläche. Jede TV-Taste verwendet die bestehende Verbindung und die Instanz der Seite; eine zweite TV-Instanz bekommt ihre eigene Bedienung über ihren EPG-Link. Die vollständige [Tastenübersicht](REMOTE_CONTROL.md) erklärt DR+, BACK, Power-Auswahl, Tastaturbedienung sowie das Verhalten bei Verbindungsfehlern.

**EPG** auf der Fernbedienung bedient die Programmübersicht am TV. **EPG aktualisieren** bleibt der Datenabgleich der Webseite. **Direktaufnahme am TV** sendet den kurzen Aufnahmetastendruck; die nachfolgend beschriebene **Aufnahmeplanung** erstellt dagegen eine bestätigte Vormerkung für eine zukünftige Sendung.

Nach dem Update die ausgewählte Web-Instanz neu starten und die Seite vollständig neu laden, damit der neue Fernbedienungs-Code geladen wird. Die vorhandene Web-/Cloud-Auswahl bleibt bestehen.

## Laufende Sendung ansehen

Wähle eine aktuelle Sendung und drücke **Jetzt ansehen**. Der Adapter prüft Senderzuordnung und Programmzeiten erneut. Der Umschaltbefehl wird nur gesendet, wenn diese Sendung **jetzt eindeutig läuft**. Überschneidungen, unbekannte Endzeiten, veraltete Daten oder eine inzwischen geänderte Senderzuordnung verhindern die Aktion.

Die Prüfung erfolgt nochmals unmittelbar vor dem TV-Befehl, auch wenn die Anfrage zuvor auf eine freie Verbindung oder die TV-Anmeldung warten musste. Endet die Sendung währenddessen, wird kein verspäteter Umschaltbefehl mehr gesendet. Eine Meldung über den gesendeten Befehl bestätigt dessen Übergabe; sie ist kein Nachweis des tatsächlich angezeigten Bildes. Der TV muss erreichbar sein. Die Aktion startet keinen Einschaltablauf.

## Zukünftige Sendung aufnehmen

1. Wähle eine zukünftige Sendung mit eindeutigem Sender sowie bekannten Start- und Endzeiten.
2. Drücke **Aufnahme planen**. Der Dialog **Sendung aufnehmen?** zeigt Sender, Titel und Zeitraum.
3. Bestätige mit **Aufnahme vormerken**. **Abbrechen** verwirft den Dialog ohne Auftrag.
4. Öffne **Aufnahmeaufträge**, um den Zustand zu verfolgen.

Der Adapter prüft die Auswahl beim Bestätigen erneut. Hat die Sendung inzwischen begonnen oder sind die Angaben nicht mehr eindeutig, entsteht kein neuer Auftrag. Vergangene Sendungen und Einträge ohne vollständige Zeiten können nicht vorgemerkt werden.

Die Vormerkung wird vor dem Versand dauerhaft in **`loewe-tv.0.recordings.jobs`** gespeichert und übersteht einen Adapterneustart. Der Datenpunkt enthält ein JSON-Journal und ist **nur lesbar**. Die Oberfläche ist der vorgesehene Weg zum Anlegen und Entfernen einer noch ungesendeten Vormerkung.

Ist der TV offline, bleibt der Auftrag in der Warteschlange. Solange Aufträge zu bearbeiten sind, prüft der laufende Adapter die Erreichbarkeit regelmäßig, unabhängig von den drei normalen Abrufintervallen. Sobald die Steuerschnittstelle erreichbar ist und die Sendung noch nicht begonnen hat, kann er den Timer übertragen. **Dafür wird kein Wake-on-LAN und kein Einschaltbefehl ausgelöst.** Ohne Schnellstart ist der TV laut bisheriger Nutzerrückmeldung im Standby nicht über das Netzwerk erreichbar; dann muss er rechtzeitig auf anderem Weg eingeschaltet werden.

Jeder Auftrag wird höchstens einmal möglicherweise wirksam an den TV gesendet. Nur wenn sicher noch kein Aufnahmebefehl gesendet wurde, darf ein späterer Versuch folgen. Bei einer mehrdeutigen Antwort oder einem Verbindungsabbruch nach möglichem Versand erfolgt keine automatische Wiederholung. Stattdessen gleicht der Adapter die TV-Timerliste ab.

### Zustände der Aufnahmeaufträge

| Zustand | Bedeutung |
|---|---|
| `queued` – Wartet auf Übertragung | Dauerhaft gespeichert, noch nicht an den TV gesendet. Bei fehlender Verbindung wartet der Adapter. |
| `sending` – Wird übertragen | Der Versand wird bearbeitet. Nach einem Neustart in diesem Zustand folgt zunächst `uncertain`. |
| `uncertain` mit gespeicherter TV-Antwort – An TV übertragen | Der Fernseher hat auf den Aufnahmebefehl geantwortet. Der automatische Timerabgleich steht noch aus. Die Anzeige ist blau; Einzelheiten stehen unter **Details zum Timerabgleich**. Kein erneuter Versand. |
| `uncertain` ohne TV-Antwort – Übertragung unklar | Ein Versand könnte erfolgt sein, aber es liegt kein Antwortnachweis vor. Kein automatischer erneuter Versand. Timer am TV prüfen. |
| `uncertain` vor einem Sendversuch – Timerabgleich offen | Ein möglicherweise passender Timer ist bereits vorhanden, aber noch nicht eindeutig zugeordnet. Der Adapter hat deshalb keinen neuen Aufnahmebefehl gesendet. Timer am TV prüfen. |
| `scheduled` – Im TV geplant | Genau ein passender Timer wurde in einer vollständig auswertbaren TV-Timerliste nachgewiesen. Senderkennung sowie Start und Ende müssen passen. |
| `missed` – Startzeit verpasst | Der noch ungesendete Auftrag konnte vor Sendungsbeginn nicht übertragen werden. Er wird nicht nachträglich gesendet. |
| `blockedDevice` – Anderer Fernseher konfiguriert | Die konfigurierte TV-Adresse oder der Steuerport gehören nicht zum ursprünglich vorgemerkten Ziel. Es erfolgt kein Versand an das andere Ziel. |
| `rejected` – Abgelehnt | Der Auftrag wurde ausdrücklich als zurückgewiesen gemeldet; die Fehlerangabe enthält den Grund. |
| `cancelled` – Vormerkung entfernt | Eine noch ungesendete Vormerkung wurde entfernt. |

**`scheduled` bestätigt einen TV-Timer, keine erfolgreich ausgeführte Aufnahme.** Eine Antwort auf `ProgramTimer`, auch `Result=0`, reicht für den Timer-Nachweis nicht aus. Die Anzeige **An TV übertragen** nutzt den bereits gespeicherten Zeitpunkt der TV-Antwort (`acknowledgedAt`) und funktioniert deshalb auch für vorhandene Aufträge nach einem Update oder Neustart. Die aktuelle Uhrzeit allein erzeugt keinen Status für eine laufende oder abgeschlossene Aufnahme. Unbekannte Timerlistenformate oder unvollständige Zuordnungen bleiben intern `uncertain`; die [Protokollnotizen](recording-protocol.md) dokumentieren die belegten Felder und Grenzen.

**Vormerkung entfernen** ist nur vor dem Versand verfügbar. Bereits übertragene oder unklare TV-Timer werden damit nicht gelöscht. Prüfe und ändere solche Timer direkt am Fernseher. Änderungen der EPG-Zeiten passen einen gespeicherten Auftrag in dieser Version nicht automatisch an. Aufnahmeregeln, Vor-/Nachlauf und die Wahl eines anderen Aufnahmeziels sind noch nicht integriert.

## Instanzübersicht und Schnellzugriff

Der bisherige Button **Separat öffnen** ist aus der Konfiguration entfernt. In der ioBroker-Instanzübersicht bietet die Instanz einen direkten Link zur Programmübersicht. Im **Admin-Schnellzugriff** ist er seit 0.1.16 über die Kachel mit dem Adaptertitel **Loewe TV** erreichbar. Die eigene Seite lässt sich als Lesezeichen speichern. Eine normale Admin-Installation auf Port 8081 verwendet beispielsweise:

```text
http://IOBROKER-HOST:8081/adapter/loewe-tv/epg.html?instance=0
```

`IOBROKER-HOST` ist die Adresse deines ioBroker-Rechners. Für `loewe-tv.1` lautet der Parameter `instance=1`. HTTPS, Port und ein vorgeschalteter Proxy richten sich nach deiner bestehenden Installation. Die Seite verwendet die konfigurierte **Admin-Anmeldung und Benutzerrechte**. Eine lokal vom Dateisystem geöffnete HTML-Datei verbindet sich nicht mit dem Adapter.

## Über ioBroker.web öffnen

1. Eine vorhandene **web-Instanz**, zum Beispiel `web.0`, aktivieren. In dieser Instanz die **integrierte Socket-Verbindung** verwenden.
2. In der LOEWE-TV-Konfiguration unter **Web-Zugriff → Web-Adapter für die Programmübersicht** diese Web-Instanz auswählen.
3. **Speichern**. ioBroker.web kann beim Laden der Erweiterung neu starten. Die TV-Adapterinstanz muss für die Daten und Aktionen laufen.
4. Auf der Startseite der gewählten Web-Instanz den Schnellzugriff **Loewe TV · Programmübersicht (0)** öffnen. Alternativ den direkten instanzbezogenen Pfad verwenden:

```text
http://IOBROKER-HOST:8082/loewe-tv.0/epg.html
```

Der Port `8082` ist ein Beispiel; maßgeblich ist die Konfiguration deiner Web-Instanz. Für die zweite TV-Instanz lautet der Pfad `/loewe-tv.1/epg.html`. Mehrere TVs können dieselbe Web-Instanz verwenden und bekommen getrennte Links. Bei neueren Admin-Versionen kann der Link an der Instanz automatisch zur gewählten Web-Instanz führen; die Admin-Adresse bleibt ebenfalls nutzbar.

Läuft die Web-Instanz auf einem anderen ioBroker-Host, muss das LOEWE-TV-Adapterpaket auch dort verfügbar sein, damit der Web-Adapter die Erweiterungsdatei laden kann.

Die Auswahl ist zunächst **deaktiviert**. Ohne gewählte Web-Instanz steht die Programmübersicht über Admin bereit. Eine in 0.1.14 gespeicherte Auswahl bleibt erhalten; der Schlüssel `native.webInstance` und das Format `web.N` ändern sich nicht. Auch vorhandene deaktivierte Web-Instanzen sind auswählbar, damit eine gespeicherte Auswahl sichtbar bleibt. Für den Zugriff muss die gewählte Instanz aktiviert sein und laufen.

Der **direkte lokale Web-Zugriff** übernimmt HTTP/HTTPS, Anmeldung und Benutzerrechte der ausgewählten Web-Instanz. Der Benutzer benötigt das Recht zum Senden von Adapter-Nachrichten. Eine deaktivierte oder separat ausgelagerte Socket-Verbindung wird mit einem Konfigurationshinweis gemeldet. Es entsteht kein zusätzlicher Server oder Port; die Seite verwendet dieselben Daten und Aufnahmeaufträge wie die Admin-Ansicht. Für den Fernzugriff gelten die folgenden Cloud-Einstellungen.

Je nach Admin-Version kann die Instanz bei aktiviertem Web-Zugriff zusätzlich als Web-Erweiterung erscheinen. Für die Verbindung zum Fernseher bleiben `info.connection` und der Verbindungsstatus in der Programmübersicht maßgeblich; die Web-Erreichbarkeit allein belegt keine TV-Verbindung.

## Über ioBroker.cloud remote öffnen

**LOEWE-TV und der Cloud-Adapter müssen dieselbe Web-Instanz auswählen.** Beispiel: Wenn `cloud.0` seine Webseiten von `web.1` lädt, wähle auch bei `loewe-tv.0` unter **Web-Zugriff → Web-Adapter für die Programmübersicht** den Eintrag **`web.1`**. Die Cloud-Einrichtung und das vorhandene Cloud-Konto bleiben im Cloud-Adapter; LOEWE-TV benötigt dafür weder App-Key noch Cloud-Passwort.

Der geprüfte **Cloud-Adapter 6.2.11** ruft die ausgewählte Web-Instanz lokal ab. Er lehnt dabei Web-Instanzen mit eigener Anmeldung oder HTTPS ausdrücklich ab. Die offizielle Empfehlung ist eine zusätzliche Web-Instanz, die nur an `localhost` gebunden ist. Deshalb ist für diese Einrichtung eine separate Instanz auf demselben ioBroker-Host wie `cloud.0` vorgesehen. [Offizielle Cloud-Anleitung](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/README.md) · [Prüfung im Cloud-Code](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/main.ts#L745-L894).

1. Erstelle oder verwende auf diesem Host eine zusätzliche **Web-Instanz**, etwa `web.1`, und aktiviere sie. Stelle die **Bind-Adresse auf `127.0.0.1`**, wähle einen freien lokalen Port und lasse **HTTPS** sowie die **lokale Web-Anmeldung** ausgeschaltet. Die Verbindung nach außen wird über die Cloud-Anmeldung geschützt. Eine bereits anders genutzte Web-Instanz muss dafür nicht umkonfiguriert werden.
2. Wähle für die hier beschriebene EPG-Anbindung die **integrierte Socket.IO-Verbindung**: Socket-Instanz integriert (`socketio: ""`), **reine WebSockets aus** (`usePureWebSockets: false`). Lasse den Web-Stammpfad leer (`rootPath: ""`) und Web-Erweiterungen aktiviert (`disableExtensions: false`). Dies legt den hier geprüften Client- und Pfadvertrag fest; die reine WebSocket-Variante des Cloud-Portals ist noch nicht am echten Zugang geprüft.
3. Wähle in **LOEWE-TV → Web-Zugriff → Web-Adapter für die Programmübersicht** diese Instanz und **speichere**. Ein bereits laufender Web-Adapter kann zum Laden der Erweiterung neu starten. Die LOEWE-TV-Instanz muss anschließend ebenfalls laufen.
4. Wähle in **cloud.0** bei der **Web-Instanz** denselben Eintrag, beispielsweise **`web.1`**, und speichere. Verwende die vorhandene Cloud-Konto-/App-Key-Konfiguration. Bei Cloud 6.2.11 kannst du mit **Test web** die lokale Verbindung und die ausgelieferte Web-Startseite prüfen.
5. Melde dich über den für dein Konto verfügbaren Cloud-Web-Zugang an und öffne auf dessen Web-Startseite **Loewe TV · Programmübersicht (0)**. Verwende den angebotenen Link. Für `loewe-tv.0` endet der EPG-Pfad auf **`/loewe-tv.0/epg.html`**, für `loewe-tv.1` auf **`/loewe-tv.1/epg.html`**. Den lokalen Port der Web-Instanz brauchst du für diesen Fernzugriff nicht in eine öffentliche URL einzutragen.

Der EPG-Web-Link und seine JS-, CSS- und mitgelieferten Logo-Dateien werden an die ausgewählte Web-Instanz weitergeleitet. Ein Pfad unter `/adapter/` gehört beim Cloud-Adapter dagegen zum Admin-Zugang. Öffne die entfernte EPG-Seite deshalb über den **Web-Startseitenlink**. Die EPG-Webseite benötigt keine Freigabe des gesamten Admin-Bereichs und keinen Eintrag in der Dienste-Whitelist. [HTTP-Routing und Dienste im Cloud-Code](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/main.ts).

**Die Cloud-Anmeldung ist von einem lokalen Web-Login getrennt.** Die EPG-Bedienbefehle verwenden den bestehenden Socket-Kontext des Cloud-Adapters. Dieser übernimmt nicht automatisch die Benutzerrechte einer lokalen Web-Sitzung. Die EPG-Seite kopiert keine Zugangsdaten und verwendet dieselbe öffentliche Adresse wie die geöffnete Seite. [Cloud-Socket](https://github.com/ioBroker/ioBroker.cloud/blob/bd9dc1ebf6cce755deb80532b59ad9ad4d4d2ae1/src/lib/socketCloud.ts) · [Client-Auswahl im Web-Adapter](https://github.com/ioBroker/ioBroker.web/blob/e6402003159b17f41c0db1b4004fb37b7edfa684/src/main.ts#L1478-L1539).

Die Web-Instanz auf `127.0.0.1` ist vom Browser eines anderen LAN-Geräts nicht direkt erreichbar. Öffne die lokale Ansicht deshalb im Reiter **Programmübersicht** der LOEWE-TV-Instanzeinstellungen oder über die [oben angegebene direkte Admin-Adresse](#instanzübersicht-und-schnellzugriff). Neuere Admin-Versionen können den automatisch erzeugten Instanz-/Schnellzugrifflink auf die ausgewählte Web-Instanz umstellen; ein dort enthaltenes `127.0.0.1` ist für einen anderen LAN-Browser nicht das ioBroker-Gerät. Mitgelieferte Logos sind über die EPG-Seite auch remote erreichbar. Eine private TV-Bildadresse kann außerhalb des Heimnetzes nicht erreichbar sein; dann greift der vorhandene Logo-/Text-Ersatz.

**Prüfstand:** Der Nutzer hat am **19. Oktober 2026** den erfolgreichen Remote-Aufruf beider konfigurierten TV-Instanzen bestätigt. Sein Screenshot zeigt die beiden korrekten Web-Links und zwei zusätzliche generische Admin-Links. Die Korrektur dieser Doppelanzeige in 0.1.16 ist automatisiert geprüft; ihre Wirkung auf der produktiven Cloud-Startseite muss nach dem Update kontrolliert werden. Bedienaktionen und neue Aufnahmeaufträge über die Cloud sind mit dieser Rückmeldung nicht separat bestätigt. Der Adapter ändert keine Web- oder Cloud-Einstellungen selbstständig.

### Zusätzliche Programmübersichts-Kacheln entfernen

Bei den Builds 0.1.14/0.1.15 können ältere Web-Versionen zusätzlich zu **Loewe TV · Programmübersicht (0)/(1)** zwei generische Kacheln mit `adapter/loewe-tv/...` erzeugen. Ursache ist die Objektform des Admin-Links in `common.localLinks`: Sie wird zusätzlich zu den Web-Links der Erweiterung in die Startseite aufgenommen. Die Links unterscheiden sich, sodass eine Bereinigung allein nach identischen URLs sie nicht zusammenfasst.

Ab **0.1.16** ist der Admin-Link als URL-Text hinterlegt. Admin unterstützt diese Form weiterhin für Instanzlink und Schnellzugriff; der zusätzliche Web-Import übernimmt nur Linkobjekte. Damit liefert allein die Web-Erweiterung ihre passende Kachel pro TV. [Admin-Vertrag](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/src/tabs/Intro.tsx) · [Web-Linkimport](https://github.com/ioBroker/ioBroker.web/blob/v9.0.0/src/main.ts#L823-L850).

Aktualisiere den Adapter, prüfe den Build bei beiden Instanzen, starte die ausgewählte Web-Instanz neu und öffne die Cloud-Web-Startseite erneut. Die [Anleitung für zwei Fernseher](INSTALLATION.md#doppelte-web-cloud-kacheln-bei-zwei-fernsehern-bereinigen) enthält die Befehle. Die vorhandenen TV-Instanzen und Aufnahmeaufträge bleiben bestehen.

## Datenumfang und Hilfe

Der TV-Abruf reicht ungefähr 24 Stunden voraus; nur tatsächlich gelieferte und gespeicherte Daten erscheinen. Die Zeitnavigation von ungefähr 24 Stunden zurück bis 48 Stunden voraus erweitert den Abruf nicht. Der Cache ist keine Programmhistorie. Endzeiten werden nicht aus der nächsten Sendung geschätzt; mehrdeutige oder fehlende Angaben bleiben sichtbar unvollständig.

| Situation | Nächster Schritt |
|---|---|
| Keine Programme oder leerer Zeitraum | Mit **Jetzt** zur aktuellen Vorschau zurückkehren, gespeicherte Liste prüfen und bei eingeschaltetem TV **EPG aktualisieren** auslösen. |
| **EPG deaktiviert** | Unter **EPG-Einstellungen** aktivieren und speichern. |
| TV offline / gespeicherte Daten | Noch gültige Daten bleiben sichtbar. Frische Programmdaten benötigen einen erreichbaren TV. |
| Programmdaten veraltet | Nach mehr als 24 Stunden seit dem letzten gültigen Abruf wird der Plan ausgeblendet; erneut abrufen. |
| Auswahl inzwischen geändert | Übersicht neu laden und die Sendung erneut auswählen. |
| Instanz oder Ansicht nicht erreichbar | Instanz starten, Build und Admin-Version prüfen; Admin nach dem Update neu laden. |
| Admin-/Web-Sitzung abgelaufen oder nicht berechtigt | Am jeweils verwendeten Admin-/Web-Zugang anmelden und die Benutzerrechte zum Senden von Adapter-Nachrichten prüfen. |
| Web-Seite meldet eine fehlende integrierte Socket-Verbindung | In der gewählten Web-Instanz die integrierte Verbindung aktivieren und speichern. |
| Kein Feld zur Web-Auswahl sichtbar | `info.adapterBuild = 0.1.17-remote.1` prüfen, Admin mit Strg+F5 neu laden und den Reiter **Web-Zugriff** öffnen. Eine Web-Instanz muss bereits installiert sein. |
| Cloud zeigt keine EPG-Seite oder einen anderen Fernseher | In LOEWE-TV und Cloud dieselbe Web-Instanz auswählen und speichern; den instanzbezogenen Link auf der Cloud-Web-Startseite öffnen. |
| Zusätzlich zu den LOEWE-Kacheln erscheinen **Programmübersicht.0/.1** mit `adapter/loewe-tv/...` | Auf 0.1.17 aktualisieren, den Build beider TV-Instanzen prüfen, die ausgewählte Web-Instanz neu starten und die Cloud-Web-Startseite neu öffnen. |
| Cloud meldet Anmeldung, HTTPS oder einen anderen Host als Fehler | Die separate Web-Instanz wie oben auf dem Host des Cloud-Adapters einrichten und **Test web** erneut ausführen. |
| Kein Senderlogo | Senderliste bei eingeschaltetem TV über `channels.refresh` neu abrufen; nicht jeder TV und nicht jeder Sender liefert ein Bild. Der Sendername bleibt als Ersatz sichtbar. |
| **An TV übertragen** | Der TV hat geantwortet; der automatische Timerabgleich ist noch offen. **Details zum Timerabgleich** öffnet die Diagnose. Der Auftrag wird nicht erneut übertragen. |
| **Übertragung unklar** oder **Timerabgleich offen** | Timerliste direkt am TV prüfen. Für die Protokollanpassung wird eine echte, auswertbare Timerantwort benötigt. |

Öffnen, Suchen und Blättern lesen den vorhandenen Arbeitsspeicher-Cache und starten keine eigenen EPG-TV-Abfragen. **EPG aktualisieren** und das konfigurierte Intervall verwenden den bestehenden Hintergrundabgleich. Die EPG-Datenpunkte unter jedem Sender bleiben unverändert; neu ist das Aufnahmejournal `recordings.jobs`.

Der direkte TV-EPG-Abruf wurde mit dem früheren 0.1.8-Stand vom Nutzer auf **bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** bestätigt. Am **19. Oktober 2026** bestätigt der Nutzer nach Bereitstellung von 0.1.12 zwei am TV angekommene Aufnahmeaufträge und den Start der ersten Aufnahme. Der Screenshot zeigt dabei noch die pauschale Anzeige **Übertragung unklar**. Version 0.1.13 korrigiert diese Darstellung anhand der vorhandenen TV-Antwortzeit. Ein erfolgreicher Aufnahmeabschluss und die originale XML-Timerantwort sind weiterhin nicht dokumentiert. Weitere Diagnosefelder und Abrufgrenzen beschreibt die [EPG-Anleitung](EPG.md).
