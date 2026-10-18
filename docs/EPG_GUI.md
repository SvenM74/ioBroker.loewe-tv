# Programmübersicht in der Instanz-Konfiguration

Ab **Version 0.1.10**, Build **`0.1.10-epg-guide.1`**, enthält die Instanz-Konfiguration eine eingebettete **Programmübersicht**. Sie zeigt die TV-Sender der gespeicherten Senderliste mit einer gemeinsamen Zeitachse. Du kannst das Programm durchsuchen, in der Zeit blättern und die Informationen zu einzelnen Sendungen lesen.

Die Daten kommen weiterhin ausschließlich vom Fernseher. Die Übersicht verwendet denselben vorhandenen EPG-Bestand wie die Datenpunkte unter `channels.tv.<Sender>.epg`. Zusätzlich zu aktueller und nächster Sendung zeigt sie weitere Vorschauen an, soweit diese bereits vom TV geliefert wurden und im Cache vorhanden sind. Die [EPG-Anleitung](EPG.md) beschreibt den Abruf und die unveränderten Datenpunkte für Automationen.

## Öffnen und vorbereiten

1. Installiere den Build **`0.1.10-epg-guide.1`** nach der [Updateanleitung](INSTALLATION.md#update-auf-0110). Der Datenpunkt `info.adapterBuild` muss diese Kennung anzeigen.
2. Verwende **ioBroker Admin ab 7.7.28**. Die eingebettete Ansicht benötigt die dort verfügbare Komponente `iframeSendTo`. Lade nach dem Update die Admin-Seite vollständig neu und öffne die Instanz-Konfiguration erneut.
3. Starte die betreffende Adapterinstanz, beispielsweise **`loewe-tv.0`**. Öffne **Instanzen → loewe-tv.0 → Konfiguration** und prüfe die gespeicherte TV-Adresse sowie die ausgewählte TV-Senderliste.
4. Öffne den Reiter **EPG**. Aktiviere **Programminformationen aktivieren** und speichere, falls du diese Einstellung oder die Senderliste geändert hast.
5. Unter den EPG-Einstellungen erscheint die **Programmübersicht**. Bei erreichbarem Fernseher kannst du mit **EPG aktualisieren** einen Abgleich starten. Der Fortschritt wird angezeigt; du kannst währenddessen weiter in der Übersicht lesen.

Das normale Abrufintervall beträgt **900 Sekunden**. **EPG-Aktualisierung (Sekunden) = 0** schaltet automatische TV-Abfragen einschließlich des Erstabrufs aus. Solange EPG aktiviert ist, bleibt die manuelle Schaltfläche nutzbar. Bereits vorhandene Programme können auch ohne neuen Abruf angezeigt werden.

Die Übersicht läuft innerhalb der bestehenden ioBroker-Administration mit deren Adresse, Protokoll, Port und angemeldeter Sitzung. Es wird kein zusätzlicher Webserver oder Port für den Adapter eingerichtet. Öffne sie über die Instanz-Konfiguration. Eine separat vom Dateisystem geöffnete HTML-Datei hat keine Verbindung zur Adapterinstanz. Die Berechtigungen der Admin-Sitzung gelten auch für diese Ansicht.

## Bildaufbau

**Oben stehen die Details zur ausgewählten Sendung.** Die Senderkachel zeigt Position und Sendername. Daneben stehen Sendungstitel, Start und gegebenenfalls Ende und Dauer, Untertitel sowie die gelieferte Beschreibung. Bei einer zeitlich eindeutig laufenden Sendung zeigt ein Balken den Fortschritt. Fehlende Texte bleiben als fehlende Informationen erkennbar.

Die Senderkachel ersetzt in diesem Aufbau den Livebild-Bereich des TV-Beispiels. Sie zeigt Text und Senderposition; ein Videostream ist in dieser Version nicht integriert. Auch das Referenzfoto wird nicht als vermeintliches Livebild eingebettet.

**Unter den Details stehen die Bedienelemente** für Datum, Uhrzeit, angezeigten Zeitraum und Sendersuche. Die Statuszeile nennt den letzten Abgleich beziehungsweise den Fortschritt oder einen Hinweis zur Datenverfügbarkeit.

**Im unteren Bereich liegt die Programmtabelle.** Links stehen die Sender nach ihrer gespeicherten Position sortiert. Rechts sind die Sendungen zeitlich angeordnet. Bei bekannter Endzeit entspricht die Breite einer Karte der Sendedauer im gewählten Zeitraum. Die aktuelle Uhrzeit ist markiert. Senderliste und Zeitachse bleiben beim Scrollen zur Orientierung sichtbar.

Die Zeilen entsprechen den eingelesenen TV-Sendern der **in dieser Instanz gespeicherten Senderliste**. Radiosender und Sender aus anderen Listen werden nicht ergänzt. Mehrere Programmplätze desselben TV-Dienstes werden wie im bestehenden Senderbaum zusammengefasst; seine kleinste vorhandene Position bestimmt die Einordnung. Sender ohne passende EPG-Daten bleiben als Zeilen sichtbar.

## Bedienung

| Element | Wirkung |
|---|---|
| **Sendung anklicken** | Zeigt die verfügbaren Informationen oben an. Der Fernseher wird dadurch nicht umgeschaltet. |
| **Sendername oder Senderposition anklicken** | Wählt die Zeile für die Detailanzeige. Auch diese Auswahl ist rein innerhalb der Übersicht. |
| **Sender suchen** | Filtert nach Sendername oder Position. Mehrere Suchwörter werden gemeinsam berücksichtigt. Ein leeres Suchfeld zeigt wieder die ganze Liste. |
| **Datum** | Wählt den Tag innerhalb des verfügbaren Navigationsbereichs. Die bisherige Uhrzeit wird soweit möglich beibehalten. |
| Pfeile **Vorheriger Tag / Nächster Tag** | Verschieben den angezeigten Ausschnitt um einen Tag. |
| Pfeile **Eine Stunde zurück / Eine Stunde weiter** | Verschieben den Ausschnitt um eine Stunde. Der sichtbare Zeitbereich wird zwischen den Pfeilen angezeigt. |
| **Jetzt** | Kehrt zum Ausschnitt um die aktuelle Uhrzeit zurück. |
| Auswahl **2 Stunden / 3 Stunden / 6 Stunden** | Legt die Breite des sichtbaren Zeitfensters fest. Voreinstellung sind drei Stunden. |
| **EPG aktualisieren** | Fordert einen neuen TV-Abgleich für die Sender der gespeicherten Liste an. Ein bereits laufender Abgleich wird weiterverwendet. |
| **Ansicht erneut laden** | Erscheint bei einem Ladefehler und liest die Ansicht erneut aus dem vorhandenen Bestand. Diese Schaltfläche fordert keinen neuen TV-EPG-Abruf an. |
| Scrollen | Zeigt weitere Sender beziehungsweise den übrigen horizontalen Teil des gewählten Zeitfensters. |

Mit der Tabulatortaste erreichst du die Bedienelemente und Programmkarten. Innerhalb der Programmtabelle wechseln die Pfeiltasten zwischen Sendungen beziehungsweise Senderzeilen. Die Detailanzeige folgt der Auswahl. **Pos1** und **Ende** führen zur ersten beziehungsweise letzten angezeigten Sendung der Zeile.

Die dargestellten Uhrzeiten verwenden die lokale Zeitzone des Browsers. Die zugrunde liegenden Zeiten bleiben Unix-Zeitstempel in Millisekunden. Die Systemzeit des ioBroker-Rechners sollte stimmen, damit laufende Sendungen richtig eingeordnet werden.

Suche, Datumsnavigation und die Auswahl einer Sendung ändern keine Adaptereinstellungen. Eine geänderte TV-Adresse, Senderliste oder EPG-Aktivierung wird dagegen erst nach dem **Speichern** wirksam. Bis dahin zeigt die Übersicht die bisher gespeicherte Konfiguration. Nach einem Listenwechsel werden die Zeilen nach dem Senderabgleich aktualisiert. Bei mehreren Adapterinstanzen zeigt jede ihre eigene gespeicherte TV-Zuordnung und Liste.

## Wie weit reicht die Vorschau?

Der bestehende TV-Abruf liest die Programmtabelle ungefähr bis **24 Stunden voraus**. Die tatsächlich verfügbare Vorschau hängt davon ab, welche Sendungen der Fernseher für den jeweiligen Kanal liefert, wann der letzte Abruf erfolgreich war und welche Daten innerhalb der Cachegrenzen erhalten bleiben.

Die Oberfläche erlaubt Zeitnavigation ungefähr von **24 Stunden zurück bis 48 Stunden voraus**; das gewählte Fenster wird an diesen Grenzen begrenzt. Diese Navigation ist keine Zusage, dass für den gesamten Bereich Programme vorliegen. Ein Datum auszuwählen erweitert den TV-Abruf nicht. Bereiche außerhalb des gelieferten Plans bleiben leer. Mit **Jetzt** gelangst du zurück zur aktuellen Vorschau.

Der Cache ist keine Programmhistorie. Bereits beendete Sendungen werden bereinigt. Auch die Vorschau für morgen kann Lücken haben. Eine neue TV-Abfrage kann zusätzliche vom TV bereitgestellte Informationen übernehmen, aber fehlende Daten werden weder erfunden noch durch eine alternative EPG-Quelle ersetzt.

**Unbekannte Endzeiten bleiben unbekannt.** Eine solche Sendung wird entsprechend markiert und zeigt **Ende unbekannt**. Ihre Kartendarstellung ist keine bestätigte Dauer. Aus dem Beginn der nächsten Sendung wird kein Ende abgeleitet, und ohne sichere Endzeit wird keine laufende Sendung mit Fortschrittsbalken behauptet. Überlappende Programme können auf zusätzlichen Spuren derselben Senderzeile erscheinen, damit die gelieferten Angaben sichtbar bleiben.

Beschreibungen werden nur angezeigt, soweit sie geliefert und im Cache vorhanden sind. Sehr lange Texte können bereits beim Speichern begrenzt werden. Wenn eine zusätzliche Kürzung für die Übertragung der Übersicht notwendig ist, weist die Detailanzeige darauf hin.

## Statusmeldungen und fehlende Daten

| Anzeige oder Situation | Bedeutung und nächster Schritt |
|---|---|
| **EPG wird vom Fernseher geladen …** | Der bestehende Hintergrundabgleich läuft. Der Fortschritt nennt bearbeitete und insgesamt vorgesehene Sender. Große Listen werden in Abschnitten abgearbeitet. |
| **Noch keine Programmdaten vorhanden** | Für diesen Sender liegt noch kein verwendbarer Plan vor. Prüfe bei eingeschaltetem TV die gespeicherte Liste und starte **EPG aktualisieren**. |
| **Keine Sendungen in diesem Zeitraum** | Der gewählte Ausschnitt enthält keine passenden Daten. Mit **Jetzt** zur aktuellen Vorschau zurückkehren; gegebenenfalls den TV-Abgleich aktualisieren. |
| **Kein passender Sender** | Die Suche findet keine Zeile. Suchbegriff ändern oder löschen. |
| **Der Fernseher ist nicht verbunden …** | Vorhandene, noch verwendbare Programmdaten können angezeigt werden. Für neue Informationen muss der TV wieder erreichbar sein. |
| Letzter Abruf fehlgeschlagen / gespeicherte Daten | Ein vorübergehender TV-Fehler löscht brauchbare Daten nicht sofort. Der Senderstatus kann `cached` sein. Die Anzeige ist dann der zuletzt gelieferte Plan, keine Bestätigung eines frischen Abrufs. |
| **Programmdaten veraltet** | Der letzte gültige Abruf ist älter als 24 Stunden. Der Plan wird ausgeblendet. Erneut abrufen, sobald der TV erreichbar ist. |
| **EPG deaktiviert** | EPG in der Konfiguration aktivieren und speichern. Bei deaktiviertem EPG werden keine Programme angezeigt und kein manueller TV-Abgleich gestartet. |
| Noch keine gespeicherte Senderliste | In den Instanzeinstellungen die gewünschte TV-Liste auswählen und speichern. Warten, bis ihre Sender eingelesen sind. |
| **Sender nicht verfügbar** | Der Sender ist nicht mehr als verfügbar markiert. Die Übersicht verwendet hierfür keine alten Programme. |
| **Programmdaten konnten nicht geladen werden** | Fehler am betroffenen Sender. Die Fehlerangaben und `epg.data.tvDiagnostic` helfen bei der Diagnose; siehe [TV-Abruf diagnostizieren](EPG.md#tv-abruf-diagnostizieren). |
| **Instanz nicht erreichbar** oder Ansicht lädt nicht | Prüfen, ob die Instanz läuft, Admin mindestens 7.7.28 verwendet wird und das neue Adapterpaket installiert ist. Admin neu laden und die Konfiguration erneut öffnen. |
| Admin-Sitzung abgelaufen oder nicht berechtigt | Erneut in ioBroker Admin anmelden beziehungsweise die vorhandenen Benutzerrechte prüfen und die Konfiguration neu öffnen. |

Laut der bisherigen Nutzerrückmeldung schaltet der getestete TV im Standby ohne Schnellstart seine Netzwerkfunktionen ab. Dann sind frische Programmdaten erst wieder bei erreichbarem TV möglich. Die [Kompatibilitätsübersicht](COMPATIBILITY.md) beschreibt diese Rückmeldung zum Schnellstart; daraus folgt keine allgemeine Zusage für andere Modelle.

## Aktualisierung und Umfang

Die Übersicht liest ihren Stand aus dem bereits geladenen **Arbeitsspeicher-Cache** des Adapters. Das Öffnen der Ansicht, die Sendersuche, das Blättern und das regelmäßige Nachladen der Anzeige lösen keine eigenen TV-Abfragen aus. Dafür werden auch nicht bei jeder Anzeigeaktualisierung alle EPG-Datenpunkte aus der Datenbank gelesen. Größere Senderlisten werden in begrenzten Seiten übertragen und in der Oberfläche zusammengeführt.

Nur **EPG aktualisieren** fordert ausdrücklich einen neuen Abgleich an. Dieser nutzt dieselbe vorhandene TV-Warteschlange, dieselben Abrufgrenzen und dieselbe Quellenprüfung wie der bisherige EPG-Abruf. Die Schaltfläche wartet nicht auf den kompletten Senderbestand, bevor die Oberfläche weiter benutzbar ist. Ein laufender Abgleich wird durch erneutes Anfordern nicht von vorn gestartet. Der konfigurierte automatische Abruf bleibt unverändert.

Die neue Ansicht benötigt keine zusätzlichen Datenpunkte. Vorhandene Skripte können weiterhin `epg.data` beziehungsweise `epg.now.*` und `epg.next.*` verwenden. **Aufnahmeaufträge und TV-Timer lassen sich in dieser Version noch nicht über die Programmübersicht anlegen.** Die weitere Planung steht in der [Roadmap](ROADMAP.md).

Der direkte TV-EPG-Abruf wurde vom Nutzer mit dem früheren 0.1.8-Stand auf **Loewe bild 7.55 / SL420 / V5.4.6.0** und **Loewe bild 5.32 / SL310F / V5.4.6.0** bestätigt. Für die neue Oberfläche in **`0.1.10-epg-guide.1`** steht ein eigener Test in einer realen ioBroker-Installation mit TV noch aus. Die bekannten Abruf- und Cachegrenzen stehen unter [Umfang und Belastung](EPG.md#umfang-und-belastung).
