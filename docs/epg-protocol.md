# Direkter EPG-Abruf vom Loewe TV

`lib/epg-loewe.js` liest die EPG-Tabelle des Fernsehers für einen einzelnen
DVB-TV-Dienst. Die Quelle sendet ausschließlich `CreateIterator`. Sie schaltet
keinen Sender um und betätigt keine Fernbedienungstasten.

## Quellen und Gültigkeit

Die [Loewe Remote API 1.0.47](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf)
dokumentiert in Abschnitt 8.7.1 das Format der DVB-Medienkennung und in
Abschnitt 9.22 den EPG-Iterator. Eine
[Textfassung im Projekt hass-loewetv-remoteapi](https://github.com/gadgetbazza/hass-loewetv-remoteapi/blob/main/supporting_files/remote_api_1.0.47_Loewe.txt)
erleichtert das Nachschlagen. `GetCurrentEvent` und `GetNextEvent` aus Abschnitt
9.12 beziehen sich auf den aktiven Player; damit lässt sich nicht das EPG aller
konfigurierten Sender ohne Umschalten ermitteln.

Die zusätzliche [veröffentlichte EPG-Modellbeschreibung](https://github.com/tonymiao2012/qunit_autotest/blob/f1593d3e9758242c89b2ffcda51e720f073963a0/model/dvb/model-epg.js)
enthält aus `values-epg.h` generierte Feldkonstanten für dieselbe Tabelle
`de.loewe.sl2.epg`. Diese Quelle stammt aus einem Hisense-Testprojekt. Sie liefert
zusätzliche Belege für Feldnamen, jedoch keinen Nachweis, dass jedes Feld auf
einem Loewe SL420 mit V5.4.6.0 verfügbar ist. Deshalb gibt es ein begrenztes
Basisschema als Rückfall. Die Implementierung wurde mit Protokollantworten
geprüft; der direkte EPG-Abruf auf dieser Hardware muss noch bestätigt werden.

## Senderzuordnung

Akzeptiert wird ausschließlich das dokumentierte Format:

```text
chl0:00-GGGGOOOOffffTTTTSSSS
```

| Teil | Bedeutung | Verwendung |
| --- | --- | --- |
| `GGGG` | Frontend-Information, bei älteren Geräten GCN | Wird dekodiert, nicht als EPG-Auswahl genutzt. |
| `OOOO` | Original Network ID, hexadezimal | Auswahl auf Feld 2002 |
| `TTTT` | Transport Stream ID, hexadezimal | Auswahl auf Feld 2001 |
| `SSSS` | Service ID, hexadezimal | Auswahl auf Feld 2000 |

Beispiel aus der vom Nutzer gelieferten Senderliste:
`chl0:00-00080001ffff03fb283d` entspricht ONID 1, TSID 1019 und SID 10301.
Die `ch…`-UUID aus einem `channel://…`-Locator ist eine andere Kennung und wird
nicht für diese Auswahl verwendet. Namen und Programmplätze dienen ebenfalls
nicht als Ersatz für die DVB-Kennung. Analoge beziehungsweise leere Kennungen
mit SID oder TSID 0 werden als `EPG_TV_UNSUPPORTED` abgelehnt. Für jede
Antwortzeile wird das gesamte DVB-Triplet erneut gegen den angefragten Dienst
geprüft.

## Aktionen und Felder

Jede Seite erzeugt einen Iterator mit `TableName=de.loewe.sl2.epg`, `Type=0`
und `NotifyUpdate=NO`. Die drei DVB-Auswahlen verwenden `Condition=1`
(Gleichheit). Der Beginn wird mit Feld 2007 und dem im Herstellerbeispiel
verwendeten `Condition=5` (größer als) eingegrenzt. Eine um eine Sekunde
verminderte Untergrenze schließt die erste volle Sekunde des Fensters ein.
Sortiert wird nach Feld 2007 mit `Direction=1`.

| Feld | Bedeutung | Basisschema | Erweitertes Schema | Beleg |
| --- | --- | --- | --- | --- |
| 2000 | Service ID | Ja | Ja | Loewe-Beispiel |
| 2001 | Transport Stream ID | Ja | Ja | Loewe-Beispiel |
| 2002 | Original Network ID | Ja | Ja | Loewe-Beispiel |
| 2003 | Ereigniskennung | Nein | Ja | Zusätzliche Modellbeschreibung |
| 2004 | Titel | Ja | Ja | Loewe-Beispiel |
| 2005 | Kurztext | Nein | Ja | Zusätzliche Modellbeschreibung |
| 2006 | Beschreibung | Nein | Ja | Zusätzliche Modellbeschreibung |
| 2007 | Beginn als UTC-Unixzeit in Sekunden | Ja | Ja | Loewe-Beispiel |
| 2008 | Ende als UTC-Unixzeit in Sekunden | Nein | Ja | Zusätzliche Modellbeschreibung |

Die Reihenfolge der `<V>`-Werte wird gegen die angeforderten Felder geprüft.
Feld 2008 wird als absoluter Endzeitpunkt interpretiert, nicht als Dauer.
Intern werden Unixzeiten in Millisekunden umgerechnet. Eine fehlende oder mit
0 gemeldete Endzeit bleibt `null`; im Basisschema bleiben auch Ereigniskennung,
Kurztext und Beschreibung leer. Aus dem Beginn der nächsten Sendung wird in
dieser Quelle kein angeblich vom TV geliefertes Ende erzeugt.

Ein eindeutig abgelehntes Feld oder eine gleichförmig abweichende Spaltenzahl
auf der ersten Seite erlaubt einmal pro Sitzung einen neuen Versuch mit dem
Basisschema. Netzwerk-, Authentifizierungs- und mehrdeutige SOAP-Fehler lösen
diesen Versuch nicht aus. Ebenso wenig tun dies falsche DVB-Kennungen,
ungültige Zeitwerte, gemischte Spaltenzahlen oder eine Schemaänderung nach
einer bereits akzeptierten Seite. Die Wahl des Basisschemas bleibt bis
`reset()` erhalten.

## Iterator-Lebenszyklus und Grenzen

Laut Hersteller wird ein Iterator mit `NotifyUpdate=NO` nach der Erzeugung
automatisch freigegeben. Daher wird kein `CloseIterator` gesendet und kein
Iterator über mehrere Anfragen gehalten. Jede Seite ist ein neuer
`CreateIterator` mit `QueryParameters/Range`.

Der Abruf beginnt 24 Stunden vor `now` und liest aufsteigend bis 24 Stunden
danach. Alle Zeilen einer bereits empfangenen Seite werden ausgewertet, auch
wenn einzelne Starts hinter dieser Zukunftsgrenze liegen. Dadurch bleiben
bereits gelesene Gegenbelege, etwa verschiedene Sendungen mit gleichem Beginn,
berücksichtigt. Ein möglicherweise bereits vor dem Rückblickfenster begonnenes
sehr langes Programm kann fehlen. Die Quelle behauptet keine vollständige
Programmhistorie oder mehrtägige EPG-Abdeckung.

Pro Seite werden höchstens 64 Zeilen angefragt. Pro Sender gelten höchstens
vier erfolgreiche Seiten, 256 Zeilen und 30 Sekunden einschließlich
Wartezeit in der übergeordneten SOAP-Warteschlange. Ein fehlgeschlagener
erweiterter Probeaufruf kann vor dem Basisschema hinzukommen. Zwischen den
Seiten wird an den Event Loop abgegeben; die übergeordnete Warteschlange kann
dadurch Fernbedienungsbefehle bearbeiten. Eine kleinere vom Aufrufer gesetzte
Deadline gilt sofort. AbortSignal und `reset()` beenden einen offenen Abruf;
verspätete Antworten werden ignoriert.

Der nächste Seitenindex ergibt sich aus der tatsächlich gelieferten
Zeilenanzahl. Startindex, Rückgabeanzahl, Gesamtzahl, fortlaufende Sortierung,
doppelte Zeilen und konstante Gesamtzahlen werden geprüft. Getrennte Iteratoren
sind trotzdem kein nachweislich atomarer Schnappschuss: Ein TV kann seine
EPG-Tabelle zwischen Anfragen ändern, ohne die Gesamtzahl zu ändern. Erkannte
Widersprüche führen zu einem Fehler und veröffentlichen keinen Teilabruf als
vollständiges Ergebnis.

Wird vor dem gemeldeten Tabellenende wegen des Horizonts oder einer Abrufgrenze
angehalten, könnte die letzte gelesene Startzeitgruppe auf der nächsten Seite
weitergehen. Diese gesamte Gruppe wird deshalb aus dem Ergebnis entfernt.
Mindestens eine sicher abgeschlossene Zukunftsgruppe muss übrig bleiben, und
kein behaltenes bekanntes Ende darf über den entfernten Beginn hinausreichen.
Andernfalls endet der Abruf mit `EPG_TV_LIMIT`, statt nach einem späteren
Cache-Uhrwechsel falsche Eindeutigkeit zu erzeugen. Eine vollständig gelesene
Tabelle behält dagegen ihre letzte Startgruppe einschließlich mehrdeutiger
Alternativen. `diagnostic.boundaryStart` und `diagnostic.discardedBoundaryRows`
zeigen eine solche Kürzung an.

Ein erlaubtes Teilergebnis nach Erreichen der Seiten- oder Zeilengrenze trägt
`diagnostic.limited=true` und `diagnostic.complete=false`. Ein erreichtes
Tabellenende mit wenigen oder keinen Sendungen ist ein erfolgreiches,
gegebenenfalls leeres Ergebnis, kein Beweis für eine Störung. Die übergeordnete
EPG-Verarbeitung entscheidet anhand der tatsächlich verfügbaren Daten über
aktuelle/nächste Sendung und eine externe Ersatzquelle.

`diagnostic.complete` bedeutet, dass der angefragte begrenzte Ausschnitt bis
zur Zukunftsgrenze oder bis zum gemeldeten Tabellenende gelesen wurde.
`diagnostic.tableComplete` zeigt ausschließlich das erreichte Tabellenende.
Beide Werte machen keine Aussage über die Vollständigkeit des vom Sender
ausgestrahlten oder vom TV gespeicherten EPG.

## Schnittstelle

```js
const { LoeweEpgSource } = require('./lib/epg-loewe');
const source = new LoeweEpgSource({ request });
const result = await source.read(service, { now: Date.now(), deadline, signal });
// result: { source: 'tv', events, diagnostic }
// event: { eventId, title, subtitle, description, start, end, endEstimated: false }
```

`request(action, parametersXml, { deadline })` muss den vorhandenen
Loewe-Client einschließlich Sitzungsverwaltung, HTTP-Zeitlimits und
SOAP-Prüfung benutzen. Es erwartet dessen Ergebnisform `{ xml, data }`.
`reset()` löscht die gemerkte Schemafähigkeit und invalidiert laufende Abrufe.
Die Quelle selbst schreibt keine ioBroker-Objekte oder Zustände.

Die lokalen Protokollfehler heißen `EPG_TV_UNSUPPORTED`, `EPG_TV_SCHEMA`,
`EPG_TV_INVALID`, `EPG_TV_LIMIT` und `CLOSED`. Fehler aus dem übergebenen
Request werden unverändert weitergegeben, sofern kein ausdrücklich erlaubter
Schema-Rückfall erfolgt.
