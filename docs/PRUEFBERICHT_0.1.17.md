# Prüfbericht 0.1.17: Fernbedienung auf der EPG-Seite

Stand: **19. Oktober 2026**. Geprüfter Build: **`0.1.17-remote.1`**, Node.js **24.19.0**.

## Ergebnis und Umfang

Die Programmübersicht enthält einen zusätzlichen Button **Fernbedienung**. Er öffnet einen Dialog mit **41 TV-Kommandos**, orientiert am vom Nutzer bereitgestellten Foto einer Loewe-Assist-Fernbedienung. Dazu gehören DR+-Archiv und BACK mit zusätzlich aus der Hersteller-API belegten Codes. Die Power-Taste öffnet eine ausdrückliche Ein-/Aus-Auswahl. Die zwei neuen ioBroker-Taster heißen `remote.dr_archive` und `remote.back_step`.

Die [Bedienungs- und Tastenbeschreibung](REMOTE_CONTROL.md) trennt die unterstützten kurzen Tastendrücke von Geräteumschaltungen, langen Tastendrücken und nicht belegten Stern-/Quellenmenü-Codes. Das Foto selbst ist kein Bestandteil des Pakets. Der Dialog benötigt keine geladenen EPG-Daten und verwendet die bereits vorhandene Verbindung der Seite.

## Ausgeführte automatisierte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm test` | **696 Tests bestanden**, 0 fehlgeschlagen, 0 übersprungen, 0 abgebrochen. |
| `npm run check` | Version/Build, Admin-Übersetzungen, Protokollverträge und JavaScript-Syntax gültig; **94 Objektdefinitionen** in beiden geprüften Varianten, **44 Protokoll-Keys**. |
| `npm pack --dry-run` | Paketliste auf die neuen Fernbedienungsdateien, Backend-Dateien und Anleitung geprüft. |
| `git diff --check` | Keine Whitespace-Fehler. |

Die Tests verwenden simulierte HTTP-/Socket-Transporte und ein gezieltes DOM-Modell. Es wurden keine Bedienbefehle an echte Fernseher gesendet.

### Vollständige Tastenanbindung

Der Integrationstest übernimmt die **41 angebotenen UI-Kommandos** aus `admin/epg-remote.js`. Alle **39 normalen Tasten** laufen jeweils genau einmal durch Runtime, echten `LoeweClient`, XML-Parser und simulierten HTTP-Transport. Sie erzeugen jeweils einen `InjectRCKey`-Aufruf mit einem `press`-/`release`-Paar. Sieben unabhängige Zahlen-/Alphabet-Erwartungen bleiben zusätzlich als Gegenprobe erhalten. Einschalten und Ausschalten werden in eigenen Tests geprüft.

Die neuen Protokolltests prüfen **DR_ARCHIVE=92** und **BACK=65** einschließlich ihrer schreibbaren Button-Definitionen. Die bisherigen Codes `back=63` und `power_off=12` bleiben kompatibel erhalten. Die ausdrückliche UI-Auswahl **Ausschalten** sendet stattdessen den dokumentierten **TV_OFF=25**, wie der vorhandene `control.powerOff`-Ablauf.

### Instanzbindung, Anmeldung und Cloud-Pfade

Die Browser-Bridge-Prüfungen decken beide Ziele **`loewe-tv.0` und `loewe-tv.1`** über Admin-, Web-, Proxy- sowie die modellierten `iobroker.net`-/`iobroker.pro`-Pfade ab. Der Test prüft Anmeldung vor `sendTo`, den einzelnen `{key}`-Parameter und die Antwortbindung an dieselbe TV-Instanz und Taste. Fehlende, mehrdeutige oder widersprechende Instanzangaben senden keinen Befehl; eine andere Instanz wird nicht als Standard angenommen.

Die Web-Erweiterung liefert `epg-remote.js` über denselben instanzbezogenen Pfad wie die übrigen EPG-Dateien aus. Die vorhandenen Prüfungen für Web-Anmeldung, relative Asset-Adressen, verweigerte fremde Routen und die Korrektur doppelter Web-Kacheln laufen weiterhin mit.

### Reihenfolge, Fristen und einmaliger Versand

Die Runtime-Tests prüfen ungültige Payloads, volle Warteschlangen, Datenbankfehler vor dem Versand, einen nicht antwortenden Fernseher, SOAP-/Sessionfehler, verspätete Anmeldung und Adapter-Unload. Normale Tasten haben eine gemeinsame **8-Sekunden-Frist** für Queue, Anmeldung und Request. Eine abgelaufene Taste kann später nicht mehr gesendet werden. Die Fehler erreichen `main.js` und Bridge mit ihrem Code und der Unterscheidung **`notSent` / `unknown`**. Eine verlorene Antwort verursacht keine Wiederholung, auch nicht nach einer späteren Statusabfrage.

Die neue Statusabfrage `getRemoteStatus` liest ausschließlich bereits vorhandene Laufzeitdaten. Sie fragt den TV und die Datenbank nicht zusätzlich ab. `connected` beschreibt die letzte API-Erreichbarkeit; es wird nicht als Einschaltzustand interpretiert.

Die UI-Tests prüfen eine auf sechs aktive/wartende Eingaben begrenzte Folge, ihre Reihenfolge, das Verwerfen nach vier Sekunden Wartezeit vor Beginn, Schließen, Ausblenden und verlorene Antworten. Es wird kein veralteter Rest einer Sendernummer nachträglich gesendet.

### Einschalten und Ausschalten

Der Einschaltaufruf bestätigt zeitnah den tatsächlichen Start des bestehenden Wake-Ablaufs oder einen bereits laufenden Vorgang. Fehlende beziehungsweise ungültige MAC-Adressen und ein synchron gescheiterter Start werden davor abgewiesen. `started` und `alreadyRunning` behaupten keinen sichtbaren eingeschalteten TV.

Ein kritischer Ablauf wurde zusätzlich unabhängig geprüft: Ein TV_ON-Versuch wartet auf eine gehaltene `RequestAccess`-Anmeldung; danach wird Ausschalten ausgelöst und erst anschließend die Anmeldung beantwortet. Der alte Einschaltversuch endet als abgebrochen. Die einzige anschließende Tastensequenz ist **press 25 / release 25**. Es folgt kein verspätetes TV_ON 22.

### Dialog und Tastatur

Die neue UI-Suite prüft jede angebotene Taste, explizite Power-Auswahl, Direktaufnahme, deutsche/englische Beschriftungen und passende Fehlerhilfen. Sie prüft außerdem Fokusführung, Escape, Tab-Grenzen, Rückkehr zum ursprünglichen Fokus, Hintergrund-Inertheit und deren Wiederherstellung in einem DOM-Modell. Geerbte KeyboardEvent-Eigenschaften werden ausdrücklich modelliert, damit gehaltene Pfeil-/Zifferntasten nicht durch eine unvollständige Event-Kopie wiederholt werden.

Die CSS-Regeln begrenzen die Dialogbreite und -höhe und machen den Tastenbereich scrollbar. Native Modalität und ein Fallback mit eigenem Stapelindex sind vorgesehen. Eine visuelle Kontrolle in einem echten Browser wurde hier **nicht** durchgeführt: Es war kein Browser verfügbar, und der Download des Testbrowsers wurde vom Netzwerkzugang mit HTTP 403 abgewiesen. Der DOM-Test ist kein Ersatznachweis für tatsächlich gerenderte Handyansichten.

## Im unabhängigen Review gefundene und korrigierte Fälle

Bei einer Fristüberschreitung eines laufenden TV-Requests schrieb der Socket-Abbruch zunächst `CANCELLED`, obwohl die äußere Remote-Antwort bereits einen Timeout meldete. Jetzt bleibt dieser Fall als Transport-Zeitüberschreitung (`NETWORK`, `ETIMEDOUT`) in der Diagnose erkennbar und wertet die Verbindung entsprechend ab. Ein reiner Fristablauf in der Queue vor einem Versand markiert den TV dagegen nicht als offline. Beide Fälle sind geprüft.

Eine bereits konfigurierte, aber noch initialisierende Instanz meldet jetzt **`REMOTE_UNAVAILABLE`**. Die Fälle fehlende TV-Adresse und Adapter-Unload bleiben davon getrennt. Es wird nicht mehr während der Initialisierung fälschlich zum Eintragen einer bereits vorhandenen Adresse aufgefordert.

## Übernahme und Grenzen

Die [Updateanleitung](INSTALLATION.md#update-auf-0117) beschreibt das Paketupdate für beide TV-Instanzen. Nach dem Update muss bei beiden Instanzen **`info.adapterBuild = 0.1.17-remote.1`** stehen. Danach die ausgewählte Web-Instanz neu starten und die EPG-Seite vollständig neu laden, damit sie die neue JavaScript-Datei erhält. Die vorhandene Web-/Cloud-Zuordnung, Senderkonfiguration und Aufnahmevormerkungen bleiben erhalten.

Ein `InjectRCKey`-Aufruf liefert laut Hersteller-API keinen verlässlichen Nachweis der sichtbaren Tastenwirkung. Die Erfolgsmeldung bestätigt daher nur die fehlerfreie Antwortverarbeitung. Insbesondere bestätigt der Aufnahmetastendruck keine laufende oder abgeschlossene Aufnahme. Die Webseite zeigt kein TV-Livebild und erkennt kein geöffnetes TV-Menü.

Die tatsächliche Bedienung der beiden Fernseher, die neuen DR+-/BACK-Funktionen und die Darstellung auf den Geräten des Nutzers müssen noch vor Ort geprüft werden. Der vom Nutzer bereits bestätigte Cloud-Aufruf beider EPG-Seiten und die früher bestätigten Fernbedienungsdatenpunkte sind gesonderte historische Ergebnisse. Der [Kompatibilitätsstand](COMPATIBILITY.md) erhält diese Trennung.
