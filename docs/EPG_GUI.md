# Programmübersicht und Aufnahmeaufträge

**Version 0.1.13, Build `0.1.13-recording-status.1`**, bietet zwei getrennte Reiter: **EPG-Einstellungen** für Aktivierung und Abrufintervall sowie **Programmübersicht** für die Senderliste mit Zeitachse, Sendungsdetails und Aktionen. Die Vorschau verwendet ausschließlich den vom TV geladenen EPG-Bestand der gespeicherten Senderliste.

## Öffnen und vorbereiten

1. Installiere den Build nach der [Updateanleitung](INSTALLATION.md#update-auf-0113). `info.adapterBuild` muss **`0.1.13-recording-status.1`** anzeigen.
2. Verwende **ioBroker Admin ab 7.7.28**. Lade Admin nach dem Update vollständig neu und öffne die Instanz-Konfiguration erneut.
3. Starte die betreffende Instanz, beispielsweise **`loewe-tv.0`**. Prüfe unter **Verbindung** und **Senderlisten** die TV-Adresse und die gewünschte TV-Senderliste.
4. Aktiviere unter **EPG-Einstellungen** die **Programminformationen**. Das Abrufintervall beträgt standardmäßig **900 Sekunden**. Speichere Änderungen, bevor du die Übersicht verwendest.
5. Öffne **Programmübersicht**. **EPG aktualisieren** startet bei erreichbarem TV einen Abgleich; der Fortschritt erscheint in der Ansicht.

Ein EPG-Intervall von `0` deaktiviert automatische EPG-Abfragen einschließlich des Erstabrufs. Bei aktiviertem EPG bleiben manuelle Aktualisierungen möglich. Das Intervall beeinflusst weder die Anzeige gespeicherter Programme noch die Bearbeitung bereits vorgemerkter Aufnahmeaufträge.

## Bildaufbau und Navigation

Oben stehen Sender, Titel, Start, bekanntes Ende, Untertitel und Beschreibung der ausgewählten Sendung. Für eine eindeutig laufende Sendung erscheint der Fortschritt. Die Senderkachel zeigt Name und Position; Livevideo ist nicht integriert.

Darunter stehen Datum, Zeitfenster, Suche und Abrufstatus. Die Programmtabelle ordnet die Sender links nach ihrer gespeicherten Position und die Sendungen rechts nach der Uhrzeit an. Mehrere Plätze desselben TV-Dienstes teilen sich wie im Senderbaum eine Zeile; die kleinste gültige Position bestimmt ihre Einordnung. Sender ohne passende EPG-Daten bleiben sichtbar. Die Ansicht enthält ausschließlich die TV-Sender der konfigurierten Liste.

| Element | Wirkung |
|---|---|
| Sendung anklicken | Wählt die Sendung und zeigt ihre Details sowie die passende Aktion. |
| Sendername oder Position anklicken | Wählt die Senderzeile für die Detailanzeige. |
| **Sender suchen** | Filtert nach Name oder Position; ein leeres Suchfeld zeigt wieder alle Sender. |
| Datum und Tagespfeile | Wählen den Tag innerhalb des verfügbaren Navigationsbereichs. |
| Stundenpfeile | Verschieben den sichtbaren Ausschnitt um eine Stunde. |
| **Jetzt** | Kehrt zur aktuellen Uhrzeit zurück. |
| **2 Stunden / 3 Stunden / 6 Stunden** | Wählt die Breite der Zeitachse; Standard sind drei Stunden. |
| **EPG aktualisieren** | Fordert den vorhandenen TV-Abgleich an. Ein bereits laufender Abgleich wird weiterverwendet. |
| **Separat öffnen** | Öffnet dieselbe Instanzübersicht als eigene Seite unter der bestehenden Admin-Adresse. |
| **Aufnahmeaufträge** | Zeigt vorgemerkte Aufträge, ihren Übertragungszustand und gegebenenfalls einen Fehler. |

Tab erreicht die Bedienelemente; Pfeiltasten wechseln innerhalb der Programmtabelle zwischen Sendungen und Zeilen. **Pos1** und **Ende** führen zur ersten beziehungsweise letzten angezeigten Sendung der Zeile. Die Uhrzeiten erscheinen in der lokalen Zeitzone des Browsers. Für Aktionsprüfungen verwendet der Adapter die Uhrzeit des ioBroker-Rechners; diese muss stimmen.

Suche, Blättern und reine Detailauswahl ändern keine Einstellungen. Die Übersicht verwendet die **gespeicherte** TV-Adresse und Liste. Ungespeicherte Formularänderungen werden erst nach dem Speichern wirksam.

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

## Als separate Seite öffnen

Die Schaltfläche **Separat öffnen** übernimmt Adresse, HTTP/HTTPS, Port, einen vorhandenen Proxy-Pfad und die Instanznummer aus der aktuellen Ansicht. Diese URL lässt sich als Lesezeichen speichern. Für eine normale Admin-Installation auf Port 8081 lautet sie beispielsweise:

```text
http://IOBROKER-HOST:8081/adapter/loewe-tv/epg.html?instance=0
```

`IOBROKER-HOST` ist die Adresse deines ioBroker-Rechners. Für `loewe-tv.1` lautet der Parameter `instance=1`. Bei HTTPS, abweichendem Port oder einem Reverse Proxy verwende den vom Button geöffneten Link. Die Seite läuft über den **vorhandenen ioBroker Admin** und verwendet dessen konfigurierte Anmeldung und Benutzerrechte. Es gibt keinen eigenen Webserver und keine zusätzliche Portfreigabe für den Adapter. Von außerhalb des Heimnetzes muss derselbe Admin-Zugang bereits erreichbar sein. Eine lokal vom Dateisystem geöffnete HTML-Datei verbindet sich nicht mit dem Adapter.

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
| Admin-Sitzung abgelaufen oder nicht berechtigt | Über den vorhandenen Admin-Zugang erneut anmelden beziehungsweise Benutzerrechte prüfen. |
| **An TV übertragen** | Der TV hat geantwortet; der automatische Timerabgleich ist noch offen. **Details zum Timerabgleich** öffnet die Diagnose. Der Auftrag wird nicht erneut übertragen. |
| **Übertragung unklar** oder **Timerabgleich offen** | Timerliste direkt am TV prüfen. Für die Protokollanpassung wird eine echte, auswertbare Timerantwort benötigt. |

Öffnen, Suchen und Blättern lesen den vorhandenen Arbeitsspeicher-Cache und starten keine eigenen EPG-TV-Abfragen. **EPG aktualisieren** und das konfigurierte Intervall verwenden den bestehenden Hintergrundabgleich. Die EPG-Datenpunkte unter jedem Sender bleiben unverändert; neu ist das Aufnahmejournal `recordings.jobs`.

Der direkte TV-EPG-Abruf wurde mit dem früheren 0.1.8-Stand vom Nutzer auf **bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** bestätigt. Am **19. Oktober 2026** bestätigt der Nutzer nach Bereitstellung von 0.1.12 zwei am TV angekommene Aufnahmeaufträge und den Start der ersten Aufnahme. Der Screenshot zeigt dabei noch die pauschale Anzeige **Übertragung unklar**. Version 0.1.13 korrigiert diese Darstellung anhand der vorhandenen TV-Antwortzeit. Ein erfolgreicher Aufnahmeabschluss und die originale XML-Timerantwort sind weiterhin nicht dokumentiert. Weitere Diagnosefelder und Abrufgrenzen beschreibt die [EPG-Anleitung](EPG.md).
