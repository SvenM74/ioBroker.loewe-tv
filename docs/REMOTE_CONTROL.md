# Fernbedienung auf der Programmübersicht

Ab **Version 0.1.17**, Build **`0.1.17-remote.1`**, öffnet **Fernbedienung** neben **EPG aktualisieren** einen eigenen Dialog. Form, dunkles Gehäuse und Tastenanordnung orientieren sich an der Loewe-Assist-Fernbedienung. Die Bedienfläche wird aus den mitgelieferten HTML-, CSS- und JavaScript-Dateien aufgebaut. Das private Referenzfoto wird nicht ausgeliefert.

## Öffnen und den richtigen Fernseher bedienen

Öffne die Programmübersicht der gewünschten Adapterinstanz und drücke **Fernbedienung**. Im Dialog steht das Ziel, beispielsweise **Fernseher: loewe-tv.0** oder **Fernseher: loewe-tv.1**. Die Seite verwendet ihre bereits vorhandene Admin-, Web- oder Cloud-Verbindung. Auch ohne geladene EPG-Daten und ohne ausgewählte Senderliste bleiben die Fernbedienungstasten nutzbar, sofern die Instanz eingerichtet und der Fernseher erreichbar ist.

Bei Web-/Cloud-Zugriff bindet der Pfad `/loewe-tv.1/epg.html` die zweite TV-Instanz. Ein widersprechender `instance`-Parameter wird abgewiesen. Die Admin-Seite verwendet ihren eindeutig geprüften Instanzparameter. Eine fehlende oder ungültige Zuordnung fällt niemals auf `loewe-tv.0` zurück. Eine TV-Adresse, einen Port oder Zugangsdaten gibst du im Dialog nicht erneut ein.

Die [bestehende Web-/Cloud-Konfiguration](EPG_GUI.md#über-iobrokercloud-remote-öffnen) gilt auch für diese Bedienung. Lokal werden die Sitzung und Nachrichtenrechte von Admin beziehungsweise Web verwendet; remote gilt der Socket-Kontext des vorhandenen Cloud-Zugangs.

## Tasten

Jede eingeblendete TV-Taste ist einem unterstützten Netzwerkbefehl zugeordnet. Der Fernseher entscheidet abhängig von seiner aktuellen Ansicht und Ausstattung, welche Wirkung die Taste hat. Die Oberfläche empfängt kein Livebild und erkennt nicht, welches Menü auf dem TV geöffnet ist.

| Taste | Funktion |
|---|---|
| Ton aus/ein | Stummschaltung umschalten. |
| Power-Symbol | Die Auswahl **Einschalten**, **Ausschalten**, **Abbrechen** öffnen. Das Symbol selbst sendet noch keinen TV-Befehl. |
| Einschalten | Den vorhandenen Einschaltablauf mit Wake-on-LAN und dem gezielten TV_ON-Befehl starten. |
| Ausschalten | Einen laufenden Einschaltablauf abbrechen und den gezielten TV_OFF-Befehl senden. |
| TV | TV-Modus aufrufen. |
| DR+ | DR+-Archiv aufrufen. |
| 0 bis 9 | Ziffern für Senderwahl oder Eingaben im TV-Menü senden. |
| EPG | Die elektronische Programmübersicht am Fernseher aufrufen. Der separate Webseitenbutton **EPG aktualisieren** aktualisiert dagegen die Programmdaten des Adapters. |
| HOME, PIP | Den bestehenden Home-Befehl beziehungsweise Bild-im-Bild senden. |
| TEXT, MENU, INFO | Videotext, Menü oder Informationen am Fernseher aufrufen. |
| BACK | Einen Schritt beziehungsweise eine Ebene zurückgehen. |
| Steuerkreuz, OK | Im TV-Menü navigieren und eine Auswahl bestätigen; OK kann im normalen TV-Betrieb die Senderliste öffnen. |
| V+/V−, P+/P− | Lautstärke erhöhen/verringern beziehungsweise zum nächsten/vorherigen Sender wechseln. |
| Rot, Grün, Gelb, Blau | Die jeweilige Farbtaste senden; ihre Funktion richtet sich nach dem aktuellen TV-Menü. |
| Zurück, Wiedergabe, Vor | Kurze Rücklauf-/Wiedergabe-/Vorlauf-Tastendrücke senden. Beim Original dienen die kurzen Rücklauf-/Vorlauf-Tastendrücke zum Springen. |
| Aufnahmepunkt, Pause, Stopp | Direktaufnahme, Pause oder Stopp am Fernseher auslösen. |

Die Record-Taste ist als **Direktaufnahme am TV** beschriftet. Sie sendet denselben kurzen Tastendruck wie eine Fernbedienung. Je nach TV-Ansicht kann dabei zunächst die Aufnahmedauer abgefragt werden. Das ist ein anderer Ablauf als **Aufnahme planen** für eine ausgewählte zukünftige EPG-Sendung: Es entsteht durch den Fernbedienungstaster keine Vormerkung im Journal `recordings.jobs`.

Es werden kurze Tastendrücke mit genau einem `press`-/`release`-Paar gesendet. Lange Tastendrücke, Dauerwiederholung und umprogrammierte Funktionen des privaten Handgeräts werden nicht nachgebildet. Für DR+, PIP, Timeshift und Aufnahme muss der Fernseher die passende Funktion und Ausstattung bereitstellen. Die Standardbelegung und die Unterscheidung zwischen kurzem und langem Druck beschreibt die [Loewe-Assist1-Anleitung, Seiten 1–2](https://cdn.loewe.tv/manuals/de/plus/Assist1/assist1.pdf).

### Unterschiede zum fotografierten Original

**STB und VIDEO** schalten am Original die Fernbedienung auf andere Geräte um. Solche Geräte werden von dieser TV-Steuerung nicht bedient. **AUDIO** ist am Original umprogrammierbar und ab Werk der Radiomodus; die zuvor entfernte Radiosteuerung wird hier nicht wieder eingeführt.

Für die separate **Sterntaste** zum Hinzufügen zu Home-Favoriten und das allgemeine **Quellenmenü** wurde kein ausreichend belegter passender Netzwerkcode gefunden. Diese Tasten werden deshalb vorerst nicht angezeigt. Der API-Name `EPG_STAR` ist kein Nachweis für die Home-Favoritentaste. Ebenso sind einzelne HDMI-Eingangscodes kein Nachweis für den Quellenmenü-Taster. Die beiden Funktionen bleiben offen, bis passende Protokollbelege oder ein überprüfbarer Geräteablauf vorliegen.

### Belegte zusätzliche Codes

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf), Abschnitt **9.4.1.1**, dokumentiert im Alphabet `l2700` unter anderem `DR_ARCHIVE=92`, `BACK=65`, `END=63`, `ON_OFF=12`, `TV_OFF=25`, `TV_ON=22` und `TV_MODE_ON=72`. Zur maschinenlesbaren Prüfung wurde die [Textkopie des Herstellerdokuments in dieser festen Revision](https://github.com/gadgetbazza/hass-loewetv-remoteapi/blob/cf3606bf3616de22eb810054f3d515fa62e0d681/supporting_files/remote_api_1.0.47_Loewe.txt) verwendet.

Die neuen Datenpunkte **`remote.dr_archive`** und **`remote.back_step`** stehen zusätzlich als normale ioBroker-Taster zur Verfügung. Der bestehende Datenpunkt `remote.back` behält aus Kompatibilitätsgründen seinen bisherigen END-Code 63; die neue sichtbare BACK-Taste verwendet Code 65. Der historische Datenpunkt `remote.power_off` behält ebenfalls seinen bisherigen ON_OFF-Code 12. Die neue ausdrückliche Auswahl **Ausschalten** verwendet dagegen wie `control.powerOff` den diskreten TV_OFF-Code 25.

Die übrigen Tasten verwenden die bereits vorhandenen und in [protocol-templates.json](protocol-templates.json), [remote115-keys.json](remote115-keys.json) und [lib/loewe-client.js](../lib/loewe-client.js) dokumentierten Zuordnungen. Eine erfolgreiche API-Antwort auf `InjectRCKey` belegt keine sichtbare Ausführung; diese Einschränkung nennt die Hersteller-API in Abschnitt 9.4.1.

## Reihenfolge, Meldungen und Abbruch

Schnell aufeinander gedrückte Tasten werden in Reihenfolge gesendet. Die Webseite lässt insgesamt höchstens sechs aktive oder wartende Eingaben zu und beginnt keinen weiteren TV-Tastendruck, bevor der vorige beantwortet wurde. Wartet eine Eingabe länger als vier Sekunden auf ihren Beginn, wird die verbliebene Folge verworfen. Dadurch wird nach einer Verzögerung nicht nur der Rest einer veralteten Sendernummer gesendet.

Der Adapter begrenzt normale Tastendrücke auf acht Sekunden ab Eingang einschließlich Queue und TV-Anmeldung. Ein Abbruchsignal und eine Prüfung unmittelbar vor dem tatsächlichen Versand verhindern einen späteren Tastendruck nach diesem Zeitlimit. Schließen oder Escape entfernt noch in der Webseite wartende Eingaben. Ein bereits übertragener Befehl kann dadurch nicht zurückgenommen werden.

| Meldung | Bedeutung |
|---|---|
| Der Fernseher hat auf die Taste geantwortet | Eine gültige Antwort liegt vor; die sichtbare Wirkung ist nicht beobachtet. |
| Einschaltvorgang gestartet / läuft bereits | Der Einschaltablauf wurde gestartet oder läuft schon. Das bestätigt noch kein eingeschaltetes Bild. |
| Taste wurde nicht gesendet | Die Anfrage wurde vor einem möglichen Tastendruck abgewiesen, etwa wegen eines ungültigen Ziels oder einer vollen Warteschlange. |
| Übertragung unklar | Ein Versand kann erfolgt sein; die Antwort fehlt oder ist nicht eindeutig. |

Nach einem Sendefehler verwirft die Webseite noch wartende Tasten. Sie sendet weder die fehlgeschlagene Taste noch einen Aufnahmetastendruck automatisch erneut, auch nicht nach einer wiederhergestellten Verbindung. Das bestehende Einschaltverfahren hat eigene begrenzte TV_ON-Versuche und seine Diagnose in `info.powerOn`; die neue Bedienfläche startet davon höchstens einen Vorgang gleichzeitig.

Zum Einschalten gelten die [bestehenden Voraussetzungen](COMPATIBILITY.md#einschalten-aus-dem-standby), insbesondere Schnellstart und eine passende MAC-Adresse. Andere Fernbedienungstasten wecken einen nicht erreichbaren Fernseher nicht auf.

## Tastatur und schmale Bildschirme

Der Dialog hat eine scrollbare Tastenfläche sowie eine dauerhaft erreichbare Kopf- und Statuszeile. **Tab** wechselt zwischen den Bedienelementen. **Enter** oder **Leertaste** betätigen die fokussierte Schaltfläche. Mit Fokus auf der eigentlichen Tastenfläche senden **Pfeiltasten** die Navigationsbefehle und **0–9** die Ziffern an den TV. Innerhalb der geöffneten Ein-/Aus-Auswahl werden diese Kurzbefehle nicht gesendet. Außerhalb des Dialogs gelten weiterhin die Tasten der Programmübersicht. Gedrückthalten erzeugt keine automatischen TV-Wiederholungen.

**Escape** oder das Schließen-Symbol schließt den Dialog und stellt den Fokus wieder her. Die Beschriftungen und Statusmeldungen sind auf Deutsch und Englisch verfügbar.

## Prüfstand

Die Tastenbelegung, Nachrichtengrenzen, Fehlerfälle, instanzgebundenen Web-/Cloud-Pfade und Dialogabläufe werden automatisiert geprüft. Der [Prüfbericht zu 0.1.17](PRUEFBERICHT_0.1.17.md) nennt den tatsächlich ausgeführten Umfang. Am 19. Oktober 2026 bestätigt der Nutzer die Funktion der Web-Fernbedienung nach ersten kleinen Tests. Eine vollständige Prüfung aller Tasten, insbesondere der zusätzlichen DR+- und BACK-Funktionen je TV-Modell, ist damit noch nicht dokumentiert. Die frühere Nutzerbestätigung über den Remote-Aufruf beider EPG-Seiten bleibt davon getrennt.
