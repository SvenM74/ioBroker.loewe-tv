# EPG über XMLTV und iptv-org

Der Adapter kann Programmdaten aus einer XMLTV-Datei einlesen. Diese Quelle ist für Sender gedacht, deren EPG der Fernseher nicht liefert, oder wenn ein eigener Programmführer auch bei ausgeschaltetem TV verfügbar sein soll. Die Zuordnung erfolgt zu den TV-Sendern der bereits ausgewählten Loewe-Senderliste. Eine XMLTV-Datei legt keine zusätzlichen TV- oder Radio-Senderordner an.

## Was iptv-org bereitstellt

Das vom Nutzer vorgeschlagene Projekt [iptv-org/epg](https://github.com/iptv-org/epg) enthält Programme zum Herunterladen von EPG-Daten und zum Erzeugen einer `guide.xml`. Die [Projektanleitung](https://github.com/iptv-org/epg/blob/master/README.md) beschreibt den Betrieb auf einem eigenen Rechner oder mit Docker und die Bereitstellung des Guides über HTTP.

Es gibt keinen im Adapter fest eingetragenen öffentlichen iptv-org-Guide. Bei der Prüfung am 17. Oktober 2026 (UTC) waren in [GUIDES.md](https://github.com/iptv-org/epg/blob/master/GUIDES.md) vier Communityserver eingetragen, alle mit rotem Status und null Sendern. Daraus ließ sich keine funktionsfähige öffentliche Standardadresse für deutsche Programme ableiten. Der Adapter verwendet deshalb die vom Nutzer konfigurierte XMLTV-URL.

Die XML-Dateien unter `sites/` im iptv-org-Repository sind **Eingabedateien des Grabbers**. Sie beschreiben Sender, enthalten aber noch keine Sendungen. Ihre GitHub-URL gehört deshalb nicht in das XMLTV-URL-Feld des Adapters.

## Eigener Guide mit Docker

Das folgende Beispiel erzeugt einen kleinen Guide für Das Erste, ZDF und RTL. Voraussetzung ist ein Rechner mit Docker und Docker Compose, den der ioBroker-Rechner über das Netzwerk erreichen kann.

### 1. Senderdatei anlegen

Lege einen Arbeitsordner und darin die Datei `channels.xml` an:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<channels>
  <channel site="web.magentatv.de" site_id="373" lang="de" xmltv_id="DasErste.de@SD">Das Erste</channel>
  <channel site="web.magentatv.de" site_id="408" lang="de" xmltv_id="ZDF.de@SD">ZDF</channel>
  <channel site="web.magentatv.de" site_id="404" lang="de" xmltv_id="RTL.de@SD">RTL</channel>
</channels>
```

Diese Einträge stammen aus der bei der Umsetzung geprüften [web.magentatv.de.channels.xml](https://github.com/iptv-org/epg/blob/master/sites/web.magentatv.de/web.magentatv.de.channels.xml). Andere Sender kannst du mit ihren vollständigen Einträgen aus derselben Datei ergänzen. Behalte die dort angegebene `site_id` und `xmltv_id` bei. Manche regionalen Einträge haben im Projekt noch keine `xmltv_id`; für sie ist eine eigene eindeutige Kennung und eine passende Zuordnung erforderlich.

### 2. Compose-Datei anlegen

Speichere daneben diese `compose.yaml`:

```yaml
services:
  epg:
    image: ghcr.io/iptv-org/epg:master
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./channels.xml:/epg/public/channels.xml:ro
    environment:
      RUN_AT_STARTUP: "true"
      CRON_SCHEDULE: "0 0,12 * * *"
      DAYS: "2"
      MAX_CONNECTIONS: "1"
      TIMEOUT: "30000"
      DELAY: "1000"
```

Starte den Dienst im Arbeitsordner:

```bash
docker compose up -d
docker compose logs -f epg
```

Der erste Abruf beginnt beim Start. Warte, bis das Protokoll meldet, dass der Guide gespeichert wurde. Das Beispiel lädt anschließend zweimal täglich, um 00:00 und 12:00 UTC, erneut. Bild, Volume-Pfad und Umgebungsvariablen entsprechen dem [Docker-Abschnitt des Projekts](https://github.com/iptv-org/epg/blob/master/README.md#docker); die Abläufe stehen in [pm2.config.js](https://github.com/iptv-org/epg/blob/master/pm2.config.js).

Der Guide ist danach unter dieser Adresse erreichbar:

```text
http://<IP-des-EPG-Rechners>:3000/guide.xml
```

Ersetze den Platzhalter durch die wirkliche IP-Adresse. Wenn ioBroker in einem eigenen Container läuft, verweist `localhost` auf diesen ioBroker-Container. Verwende deshalb eine Adresse, die aus diesem Container erreichbar ist.

Der Abruf der jeweiligen Programmquelle hängt von deren Erreichbarkeit und vom aktuellen iptv-org-Grabber ab. Die Einrichtung wurde anhand des veröffentlichten Projekts geprüft. Ein Live-Abruf der Magenta-Quelle ist damit nicht zugesichert. Fehler des Grabbers sind in `docker compose logs epg` sichtbar.

### 3. Adapter konfigurieren

Wähle in der Adapter-Konfiguration die gewünschte EPG-Quelle:

| Konfigurationswert | Verwendung |
|---|---|
| `auto` | TV bevorzugen; eine konfigurierte XMLTV-Quelle als Fallback verwenden. |
| `tv` | Programmdaten ausschließlich vom Fernseher verwenden. |
| `xmltv` | Den konfigurierten XMLTV-Guide verwenden. |

Trage die Adresse des erzeugten Guides bei `epgXmltvUrl` ein. Hinterlege in `epgXmltvMappings` die benötigten Senderzuordnungen. Für die Beispieldatei passen folgende Einträge, sofern die Sender auf deinem Loewe genau so heißen:

```json
[
  { "channel": "Das Erste HD", "xmltvId": "DasErste.de@SD" },
  { "channel": "ZDF HD", "xmltvId": "ZDF.de@SD" },
  { "channel": "RTL Television", "xmltvId": "RTL.de@SD" }
]
```

`channel` ist entweder der **genaue Sendername** aus dem Loewe-Katalog oder die relative **Ordner-ID** wie `channels.tv.Das_Erste_HD`. Übernimm die wirkliche ID aus deinem Objektbaum. Eine Zuordnung zur Ordner-ID hat Vorrang vor einer Zuordnung zum Sendernamen.

Der Zusatz `@SD` ist hier Bestandteil der von der Quelle verwendeten Kennung. Er wird weder entfernt noch aus dem HD-Zusatz des Loewe-Sendernamens neu abgeleitet. Ordne immer den Feed zu, dessen Programmplan zu deinem Sender gehört; regionale Varianten können abweichen.

Wenn ein Sendername nach Vereinheitlichung von Groß-/Kleinschreibung, Unicode-NFC und Leerzeichen **eindeutig genau übereinstimmt**, kann der Adapter ihn auch ohne Eintrag in der Zuordnung finden. Er entfernt keine Zusätze wie HD, SD oder einen Regionalnamen. „Das Erste HD“ wird deshalb nicht automatisch „Das Erste“ zugeordnet. Haben zwei Guide-Sender denselben normalisierten Namen, ist eine explizite XMLTV-ID nötig. Eine unbekannte oder widersprüchlich konfigurierte ID führt zu einer Meldung und keinem geratenen Treffer.

## Weitere belegte Einträge der Beispielquelle

Die folgenden Kennungen waren bei der Umsetzung in der [Senderdatei von web.magentatv.de](https://github.com/iptv-org/epg/blob/master/sites/web.magentatv.de/web.magentatv.de.channels.xml) enthalten:

| Anzeigename der Quelle | `site_id` | `xmltv_id` |
|---|---:|---|
| Das Erste | 373 | `DasErste.de@SD` |
| ZDF | 408 | `ZDF.de@SD` |
| RTL | 404 | `RTL.de@SD` |
| SAT.1 | 381 | `SAT1.de@SD` |
| ProSieben | 374 | `ProSieben.de@SD` |
| 3sat | 392 | `3sat.de@SD` |
| KiKA | 387 | `KiKA.de@SD` |
| ARTE | 394 | `arte.de@SD` |
| phoenix | 371 | `phoenix.de@HD` |

Die [Quellenkonfiguration](https://github.com/iptv-org/epg/blob/master/sites/web.magentatv.de/web.magentatv.de.config.js) lädt standardmäßig zwei Tage und interpretiert ihre Zeitwerte in UTC. Der Stand einer externen Quelle kann sich ändern. Prüfe bei fehlenden Sendern zuerst deren aktuelle Datei und anschließend die `channel/@id`-Werte in deinem erzeugten `guide.xml`.

## Alternative ohne Docker

Die [iptv-org-Anleitung](https://github.com/iptv-org/epg/blob/master/README.md#installation) beschreibt auch die direkte Installation mit Node.js und Git:

```bash
git clone --depth 1 -b master https://github.com/iptv-org/epg.git
cd epg
npm install
```

Lege die gewünschte `channels.xml` im geklonten Ordner ab. Erzeuge anschließend den Guide:

```bash
npm run grab --- --channels=channels.xml --days=2 --maxConnections=1 --output=guide.xml
```

Oder lade zunächst die komplette Quellenliste, sofern die Dateigröße für deinen Einsatz passt:

```bash
npm run grab --- --sites=web.magentatv.de --days=2 --output=guide.xml
```

Mit dem in der Projektanleitung genannten Server kannst du die Datei über HTTP bereitstellen:

```bash
npx serve
```

Der dokumentierte Standardport ist 3000. Für einen dauerhaften Betrieb müssen der HTTP-Server weiterlaufen und der Grabber regelmäßig erneut ausgeführt werden. Die Docker-Variante oben übernimmt beides.

## Format und Zeitangaben

Der Import verarbeitet UTF-8-XMLTV. Ein minimales Beispiel sieht so aus:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="DasErste.de@SD">
    <display-name>Das Erste</display-name>
  </channel>
  <programme channel="DasErste.de@SD"
             start="20261018120000 +0000"
             stop="20261018123000 +0000">
    <title lang="de">Beispielsendung</title>
    <sub-title lang="de">Beispiel einer Folge</sub-title>
    <desc lang="de">Beschreibung der Beispielsendung.</desc>
  </programme>
</tv>
```

Dies ist eine reine Formatvorlage, kein aktueller Programmplan.

Es gelten die Zeitregeln der [offiziellen XMLTV-DTD](https://github.com/XMLTV/xmltv/blob/master/xmltv.dtd): Eine Sendung beginnt einschließlich `start` und endet ausschließlich `stop`. Fehlt der Zeitzonenversatz, gilt UTC. Der Import akzeptiert `YYYYMMDDhhmmss` sowie minutengenaue Werte `YYYYMMDDhhmm`, optional mit einem numerischen Versatz wie `+0200`. `UTC`, `GMT` und `Z` werden ebenfalls als UTC verstanden. Unvollständige Angaben nur bis zum Datum, ungültige Kalendertage und mehrdeutige Zeitzonennamen werden abgelehnt. Die Zeitzone des ioBroker-Hosts verändert diese Zeitpunkte nicht.

Start und Ende werden als Unix-Zeit in Millisekunden gespeichert. Ein fehlendes `stop` darf nur aus dem tatsächlich vorhandenen nächsten Start desselben Senders abgeleitet werden. Solche Endzeiten sind als `endEstimated: true` gekennzeichnet. Gibt es keinen nächsten Start, bleibt das Ende unbekannt. Ein letzter Programmeintrag wird dadurch nicht dauerhaft als laufende Sendung behandelt.

Bei mehrsprachigen Titeln und Beschreibungen wird Deutsch bevorzugt, danach Text ohne Sprachangabe und anschließend die erste verfügbare Sprache. Die [Referenzdateien von iptv-org](https://github.com/iptv-org/epg/blob/master/tests/__data__/expected/epg_grab/base.guide.xml) zeigen den entsprechenden XMLTV-Aufbau mit vollständigen Feed-IDs und UTC-Zeitangaben.

## Betriebsgrenzen des Imports

Der Import lädt jeden Guide als Datenstrom und verarbeitet ihn in Abschnitten von höchstens 16 KiB. Zwischen diesen Abschnitten gibt er die Ausführung an Node.js zurück. Beim Stoppen des Adapters werden offene HTTP-Anfragen, Datenströme und die laufende Verarbeitung abgebrochen.

| Grenze | Wert |
|---|---:|
| Gesamtzeit für Verbindung, Weiterleitungen, Download und Verarbeitung | 30 Sekunden oder eine kürzere vom Aufrufer gesetzte Frist |
| Weiterleitungen | höchstens 3 |
| Heruntergeladene Daten | höchstens 16 MiB |
| Entpackte Daten | höchstens 32 MiB |
| Senderkennungen im Guide | höchstens 50.000 |
| Geprüfte Programmeinträge | höchstens 500.000 |
| Reguläres Zeitfenster | letzte 24 Stunden für die jüngste Gruppe ohne Endzeit, nächste 48 Stunden für künftige Starts; nachweislich noch laufende Intervalle auch bei älterem Beginn |
| Zurückgegebene Ereignisse je Sender | bis zu 64 relevante Einträge mit Beginn bis zur Abrufzeit und 64 zukünftige |
| Insgesamt zwischengespeicherte Ereignisse einschließlich interner Gegenbelege | höchstens 65.536 |
| Budget für gespeicherte Texte und berechnete Datensatzgrößen | 24 MiB |

Die Budgetberechnung begrenzt gespeicherte Inhalte; sie ist keine Messung des gesamten JavaScript-Heaps. Bereits beendete Historie wird nicht als Sendungsbestand ausgegeben. Ihre Startzeiten werden bei der Verarbeitung trotzdem berücksichtigt, damit ein früherer Eintrag ohne Ende nicht fälschlich aktuell bleibt. Noch laufende bekannte Intervalle und erforderliche Gegenbelege bleiben erhalten.

Die Zukunft wird nur an vollständigen Startzeitgruppen gekürzt. Der früheste tatsächlich ausgelassene Beginn bleibt als Grenze und gegebenenfalls als Beleg für ein fehlendes Ende erhalten. Kein behaltenes bekanntes Ende darf über eine solche Schnittgrenze reichen. Nötige Gegenbelege, die nicht sicher in die Grenzen passen, führen zu `XMLTV_LIMIT`. Dadurch kann die tatsächliche Zahl unter 64 Einträgen je Richtung liegen. Zu große Guides sollten bereits im iptv-org-Grabber auf die tatsächlich benötigten Sender eingeschränkt werden.

Unterstützt werden HTTP und HTTPS sowie unkomprimiertes XML oder Gzip. Gzip wird auch am Dateiinhalt erkannt, wenn ein Server bei `.xml.gz` keinen `Content-Encoding`-Header setzt. Browserseiten, andere Komprimierungsverfahren, defektes XML und unvollständige Downloads werden nicht als Guide übernommen.

Eine Standarddeklaration wie `<!DOCTYPE tv SYSTEM "xmltv.dtd">` ist erlaubt; die referenzierte DTD wird nicht geladen. Interne DTD-Definitionen und benutzerdefinierte Entitäten werden abgelehnt. Namen, Titel und Beschreibungen bleiben Text. Der Import lädt keine Bilder oder Links aus dem Guide nach. HTTP- und Verbindungsfehler geben keine Guide-URL und keine geheimen Abfrageparameter im Fehlertext aus.

## Häufige Ursachen fehlender Daten

| Beobachtung | Prüfung |
|---|---|
| HTTP 404 | Hat der Grabber bereits erfolgreich eine `guide.xml` erzeugt? Stimmen Adresse und Pfad? |
| HTML statt XML | Zeigt die konfigurierte Adresse direkt auf den Guide oder auf eine Webseite beziehungsweise Anmeldung? |
| Sender nicht zugeordnet | Stimmen die XMLTV-ID einschließlich `@...` und die Senderzuordnung exakt? |
| HD-Sender findet keinen Treffer | Die automatische Zuordnung entfernt HD/SD nicht. Trage die passende ID ausdrücklich ein. |
| Mehrere Treffer | Ordne die richtige regionale Variante über ihre XMLTV-ID zu. |
| Keine aktuelle Sendung | Prüfe Zeitraum, Start-/Endzeiten und die Aktualisierung des externen Guides. |
| Größenlimit erreicht | Begrenze die `channels.xml` des Grabbers auf die benötigten Sender. |

## Schnittstelle für die Adapterentwicklung

`loadXmltv(url, { now, deadline, signal, fetchImpl })` liefert nach einem vollständigen erfolgreichen Abruf `{ channels, fetchedAt }`. `channels` ist eine `Map` mit Einträgen `{ id, names, events }`. Die Ereignisse enthalten `eventId`, `title`, `subtitle`, `description`, `start`, `end` und `endEstimated`. Es erfolgt keine teilweise Veröffentlichung bei Fehlern. Die Entscheidung, welche Sendung gerade läuft und welche als Nächstes folgt, trifft die EPG-Verwaltung des Adapters anhand dieser Zeitangaben.

`resolveXmltvChannel(feed, service, mappings)` liefert `{ channel }` oder `{ channel: null, error }`. `service.id` ist die relative Loewe-Ordner-ID; `service.name` ist der Sendername. `mappings` ist ein Array aus `{ channel, xmltvId }`. Ein Guide darf Programme ohne gesonderte `channel`-Definition enthalten. Diese Kennungen sind über explizite Zuordnung nutzbar, haben aber keinen Anzeigenamen für die automatische Suche.

Der optionale `fetchImpl` dient isolierten Tests. Er liefert einen **rohen**, nicht automatisch dekomprimierten Antwortstrom mit `status`, `headers` und einem asynchron iterierbaren `body`. Weiterleitungen behandelt der Loader selbst. Die Standardimplementierung verwendet Node.js HTTP/HTTPS, damit das Limit für komprimierte Übertragungsdaten getrennt vom Limit für entpackte Daten überprüfbar bleibt.
