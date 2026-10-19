# Fernseher im Netzwerk suchen

Ab **Version 0.1.9**, Build **`0.1.9-tv-discovery.1`**, kannst du in der Instanz-Konfiguration nach Loewe-TVs suchen. Die Auswahl zeigt die im Suchlauf erkannten **IPv4-Adressen** mit Gerätename und, soweit verfügbar, Modell. Sie berücksichtigt mehrere Fernseher. Jede Adapterinstanz verwendet anschließend eine von dir gespeicherte TV-Adresse.

Die Suche wird vom **ioBroker-Rechner** ausgeführt. Die Netzwerkverbindung des Handys oder PCs, auf dem du Admin geöffnet hast, ist dafür nicht maßgeblich. Zum ersten Einrichten die Fernseher einschalten. Für diese neue Funktion steht ein Test an echten Loewe-TVs noch aus; die früher bestätigten Gerätefunktionen sind in der [Kompatibilitätsübersicht](COMPATIBILITY.md) aufgeführt.

## Suchen und auswählen

1. Installiere das neue Paket nach der [Updateanleitung](INSTALLATION.md#update-auf-0126). Lade Admin danach vollständig neu und prüfe `info.adapterBuild`: Für das aktuelle Paket muss dort **`0.1.26-tv-names.1`** stehen.
2. Aktiviere die gewünschte Instanz, beispielsweise **`loewe-tv.0`**, in der Instanzübersicht und warte ihren Start ab.
3. Öffne **Instanzen → loewe-tv.0 → Einstellungen → Verbindung** und betätige **Fernseher suchen**.
4. Warte einige Sekunden. Öffne danach **Gefundene Fernseher** und wähle den gewünschten Eintrag. Jeder Treffer enthält die IP-Adresse und die verfügbaren Geräteangaben.
5. Prüfe das Feld **Adresse des Fernsehers**. Die Auswahl hat die gefundene IP-Adresse dorthin kopiert. Das Feld bleibt für eigene Eingaben editierbar.
6. Betätige **Speichern** oder **Speichern und schließen**. Erst jetzt wird die neue Adresse für die Instanz übernommen. Nach dem Neustart der Instanz kannst du die [TV-Senderliste auswählen](INSTALLATION.md#tv-senderliste-auswählen).

**Eine neue Instanz kann schon mit leerer TV-Adresse aktiviert werden.** Dafür ist keine vorläufige Adresse nötig. Die Suche steht dann zur Verfügung, während die TV-Steuerung auf eine gültige Konfiguration wartet. `info.connection=false` und der Hinweis zur fehlenden Adresse sind in diesem Zustand erwartbar. Die Adresse muss erst vor dem Speichern der ausgefüllten Konfiguration gültig sein. Ist **Fernseher suchen** deaktiviert, die Instanz zunächst in der Instanzübersicht aktivieren.

Eine Suche beginnt ausschließlich durch **Fernseher suchen**. Das Öffnen der Konfiguration und der Auswahlliste liest nur das letzte Ergebnis dieses Adapterstarts. Neue Suchläufe ersetzen die Vorschläge; sie überschreiben keine eingetragene TV-Adresse und keine anderen Einstellungen. Die aktuelle Trefferliste bleibt im Arbeitsspeicher. Ab **0.1.25** werden die dabei erkannten Namen zusätzlich mit IP-Adresse und Steuerport gespeichert, damit die Web-Auswahl sie nach einem Neustart wieder anzeigen kann.

## Fernsehernamen in der Web-Auswahl

Die allgemeine Auswahlseite `/loewe-tv/` zeigt den gespeicherten Fernsehernamen über der jeweiligen Instanzkennung. `loewe-tv.0` und `loewe-tv.1` bleiben unter den Namen sichtbar. **0.1.26** korrigiert die unvollständige Übernahme aus 0.1.25: Eine erneute manuelle Suche ist nicht mehr nötig, wenn der TV seinen Namen bei der regulären Statusabfrage liefert.

Nach dem Paketupdate **beide LOEWE-Instanzen und die ausgewählte Web-Instanz neu starten**. Die TVs einmal einschalten beziehungsweise erreichbar machen. Bei aktiviertem Statusabruf liest der Adapter ihre Geräteinformationen beim Start oder nach dem erneuten Verbindungsaufbau. Anschließend die Auswahlseite neu laden. Bei bewusst deaktiviertem Statusabruf (`pollInterval = 0`) bleibt die automatische Abfrage aus; der Taster **`control.refresh`** der jeweiligen Instanz liest die Angaben einmalig.

Der Adapter verwendet den vom TV gemeldeten **Netzwerknamen** aus `GetDeviceData` oder `GetSettings`. Falls nur ein **Streamingname** vorhanden ist, kann dieser als Ersatz dienen. Die Felder sind in der [Loewe Remote API 1.0.47, Seiten 22 und 63](https://cdn.loewe.tv/manuals/en/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf) dokumentiert. Liefert der TV während des Hochfahrens zunächst leere Felder, erfolgen innerhalb derselben Verbindung bei höchstens zwei späteren regulären Statusabfragen neue Versuche, frühestens jeweils nach 60 Sekunden. Dafür wird kein eigener Timer oder Suchlauf gestartet.

Ein bereits durch **Fernseher suchen** bestätigter Name hat Vorrang vor dem Netzwerknamen; dieser hat Vorrang vor dem Streamingnamen. Eine spätere erfolgreiche Suche aktualisiert einen aus der Suche gespeicherten Namen. Automatisch gelesene Netzwerknamen werden bei späteren vollständigen Geräteabfragen ebenfalls aktualisiert. Leere oder fehlgeschlagene Antworten löschen keine bekannten Namen. Nach der ersten erfolgreichen Übernahme bleiben die Namen auch bei ausgeschaltetem TV und nach weiteren Neustarts verfügbar.

Die Zuordnung verwendet die **genaue konfigurierte Adresse und den Steuerport** der aktuellen TV-Abfrage. DNS-Namen und IPv6-Adressen werden ebenfalls als exakte Ziele unterstützt. Eine DNS-Adresse wird nicht mit einer gefundenen IP-Adresse gleichgesetzt. Alte ungebundene `device.data`- oder `device.settings`-Antworten werden nicht nachträglich einer womöglich geänderten TV-Adresse zugeordnet.

Die Web-Auswahl liest nur die gespeicherten Daten der jeweils eigenen LOEWE-Instanz. Zustandsänderungen werden übernommen; spätere Seitenaufrufe lesen die Namen zusätzlich höchstens alle fünf Sekunden erneut ein. So kann sich die Anzeige nach einem fehlgeschlagenen Startabruf oder einer verpassten Zustandsmeldung erholen. Der Datenbankabruf wartet höchstens 1,5 Sekunden. Direkte EPG-Links und Dateien werden dadurch nicht verzögert. Beim Öffnen der Seite wird keine TV-Abfrage oder Netzwerksuche ausgelöst.

Ohne passenden gemeldeten Namen bleibt der vorhandene ioBroker-Instanzname beziehungsweise **Fernseher 0/1** sichtbar. Es werden keine Raumbezeichnungen erfunden. Der nur lesbare Zustand **`device.discoveryNames`** enthält höchstens 256 Einträge und 192 KiB mit `host`, `port` und `name`; automatisch gelesene Einträge enthalten zusätzlich `source: "network"` oder `source: "streaming"`. Die Kacheln verwenden weiterhin ihre instanzbezogenen EPG-Links. Der Name verändert keine TV-Steuerung, Senderkennung oder Aufnahmezuordnung. [Prüfbericht](PRUEFBERICHT_0.1.26.md).

## Mehrere Fernseher und mehrere Adressen

Es gibt keine Beschränkung auf den ersten gefundenen TV. Innerhalb der unten beschriebenen Suchgrenzen erscheinen alle erkannten Adressen. Mehrere Antworten derselben IP-Adresse werden zusammengefasst. Unterschiedliche Adressen bleiben einzeln auswählbar, auch wenn die Geräte denselben Namen melden.

Für zwei Fernseher jeweils eine eigene Instanz anlegen, etwa **`loewe-tv.0`** und **`loewe-tv.1`**, und darin die passende Adresse speichern. Beide Instanzen können dieselben erreichbaren Geräte finden. Ihre jeweilige Adresse entscheidet, welchen Fernseher sie steuern und von welchem TV sie Senderlisten und EPG lesen.

Ein einzelner Fernseher kann über LAN und WLAN unterschiedliche Adressen haben. Werden beide erkannt, erscheinen beide in der Auswahl. Die gemeldete Trefferzahl zählt daher **TV-Adressen**, nicht zwingend unterschiedliche Geräte. Gerätename und Modell stammen aus der jeweiligen Netzwerkbeschreibung; sie sind keine automatisch ermittelten Raumbezeichnungen.

Ändert der Router später die IP-Adresse, passt der Adapter die gespeicherte Adresse nicht selbstständig an. Führe die Suche erneut aus und speichere die gewünschte Adresse. Eine feste DHCP-Zuordnung im Router kann solche Änderungen vermeiden. Ein von Hand eingetragener Hostname bleibt ebenfalls möglich.

## Was ein Treffer aussagt

Ein Treffer setzt eine auswertbare Gerätebeschreibung mit Loewe-Herstellerangabe voraus. Bekannte Audiomodelle, etwa mit einer Modellangabe `klang`, `speaker` oder `soundbar`, werden ausgeschlossen. Enthält der Gerätename, das Modell oder der angebotene Dienst einen TV-Hinweis, bleibt das Gerät auch bei nicht erreichbarem Steuerport als Treffer erhalten.

Manche Fernseher melden möglicherweise nur eine allgemeine Beschreibung, beispielsweise Modell `MediaRenderer` und Gerätename `Wohnzimmer`. Eine solche Loewe-Beschreibung wird zusätzlich angeboten, wenn der konfigurierte TCP-Steuerport erreichbar ist. Fehlen sowohl ein TV-Hinweis als auch eine erfolgreiche Portprüfung, erscheint dieses Gerät nicht in der Auswahl. Ungewöhnliche oder unvollständige Gerätebeschreibungen können deshalb weiterhin dazu führen, dass ein TV nicht erkannt wird.

Zusätzlich versucht der Adapter eine TCP-Verbindung zum Steuerport, standardmäßig **905**. Ein nicht bestätigter Verbindungsaufbau wird beispielsweise als **Steuerport 905 nicht erreichbar** beim Treffer angezeigt. Der bereits als TV erkannte Eintrag bleibt zur Auswahl erhalten. Falls du unter **Erweitert → TV-Steuerport** einen anderen gültigen Port eingetragen hast, verwendet die Suche diesen Formularwert für die Prüfung. Eine Portänderung erfordert einen neuen Suchlauf, damit die Vorschläge zu dieser Prüfung passen.

**Ein Suchtreffer oder ein offener Port bestätigt noch keine erfolgreiche Tablet-API-Steuerung.** Die Suche meldet sich nicht mit `RequestAccess` am Fernseher an und sendet keine Fernbedienungs-, Umschalt- oder Einschaltbefehle. Sie startet auch keinen Wake-on-LAN-Ablauf. Ob der gespeicherte TV mit diesem Adapter funktioniert, ergibt sich aus der anschließenden Verbindung und den Gerätefunktionen. Der **Connect 26 SL / MB180** bleibt nicht unterstützt, selbst wenn er eine passende Netzwerkbeschreibung liefern und in der Suche erscheinen sollte. Siehe [Gerätekompatibilität](COMPATIBILITY.md#loewe-connect-26-sl).

## Wenn ein Fernseher fehlt

| Beobachtung | Prüfung |
|---|---|
| Die Schaltfläche ist deaktiviert. | Die Adapterinstanz muss laufen. Sie kann auch vor dem Eintragen einer TV-Adresse aktiviert werden. |
| Kein Treffer oder ein Fernseher fehlt. | Fehlende Fernseher einschalten und die Suche wiederholen. TV und ioBroker müssen im lokalen Netz miteinander kommunizieren können. |
| Im Standby fehlt der TV. | Ohne Schnellstart schaltet der TV laut [Nutzerrückmeldung](COMPATIBILITY.md#einschalten-aus-dem-standby) seine Netzwerkfunktionen ab. Mit der normalen Fernbedienung einschalten; Schnellstart direkt am TV aktivieren, wenn Netzwerksteuerung aus dem Standby benötigt wird. |
| Die Adresse lässt sich von Hand verwenden, die Suche findet sie aber nicht. | SSDP-Multicast kann durch Gastnetze, VLANs, WLAN-Isolation, Firewalls oder das Container-Netz getrennt sein. Eine manuelle Adresse bleibt ein gültiger Einrichtungsweg. |
| ioBroker läuft in Docker. | Entscheidend sind die Netzwerkschnittstellen und die Multicast-Erreichbarkeit innerhalb des Containers. Eine funktionierende Admin-Seite im Browser belegt diese Verbindung nicht. |
| Ein Treffer hat einen nicht erreichbaren Steuerport. | TV einschalten, Port und Netzwerk prüfen. Die Gerätebeschreibung kann erreichbar sein, obwohl der Tablet-Steuerdienst fehlt oder noch nicht bereit ist. |
| Nur ein Teilergebnis wird gemeldet. | Die Suche konnte nicht alle Schnittstellen oder Geräteprüfungen abschließen. Aufgelistete Adressen bleiben nutzbar; Suche bei eingeschalteten TVs erneut auslösen oder die Adresse manuell eintragen. |
| Die Suche scheitert. | Den Hinweis in Admin lesen. Die bisher eingetragene Adresse bleibt bestehen. Bei Bedarf im Adapterprotokoll mit Logstufe `debug` nach **Gerätesuche** suchen. |

Die automatische Erkennung umfasst IPv4-Netze an den lokalen Schnittstellen des ioBroker-Prozesses. Sie durchsucht keine beliebigen gerouteten Netze oder jede mögliche Adresse eines Subnetzes. Antworten jenseits dieser lokalen Netzgrenzen werden nicht ausgewertet. Ein fehlender Treffer allein ist deshalb kein Nachweis für Inkompatibilität.

## Ablauf und technische Grenzen

Die Implementierung steht in [lib/tv-discovery.js](../lib/tv-discovery.js), die Anbindung an die Instanz in [lib/adapter-runtime.js](../lib/adapter-runtime.js) und die Oberfläche in [admin/jsonConfig.json](../admin/jsonConfig.json).

Die Suche sendet pro verwendbarer lokaler IPv4-Schnittstelle eine SSDP-Nachricht an **`239.255.255.250:1900/UDP`**. Suchziel ist **`upnp:rootdevice`**, `MX` ist **3**. Ein zweites Paket nach ungefähr einer halben Sekunde hilft bei verlorenen UDP-Paketen. Die Antworten werden auf dem jeweiligen temporären UDP-Port empfangen. Eine dauerhafte Anmeldung auf Port 1900 oder ein Abonnement für UPnP-Meldungen ist dafür nicht erforderlich.

Aus einer Antwort wird die HTTP-Adresse in `LOCATION` gelesen. Die Gerätebeschreibung muss über dieselbe numerische IPv4-Adresse erreichbar sein, von der die lokale SSDP-Antwort kam. HTTP-Weiterleitungen, Hostnamen in Beschreibungs-URLs und Verweise auf andere Geräte werden nicht verfolgt. Anschließend werden Hersteller- und TV-Angaben geprüft sowie der konfigurierte TCP-Steuerport getestet. Die Ergebnisse werden nach IPv4-Adresse sortiert.

| Grenze im regulären Suchlauf | Wert und Zweck |
|---|---|
| Gesamtdauer der Netzwerksuche | **6,5 Sekunden**, einschließlich Gerätebeschreibungen und Portprüfungen. |
| Empfangsfenster für SSDP | Bis ungefähr **4,5 Sekunden**; laufende Geräteprüfungen nutzen die verbleibende Gesamtzeit. |
| Einzelne HTTP-Abfrage oder Portprüfung | Höchstens **1,5 Sekunden**, verkürzt durch die noch verfügbare Gesamtzeit. |
| Parallele Geräteprüfungen | Höchstens **4 insgesamt**, davon höchstens **1 je IP-Adresse**, um die Zahl gleichzeitiger Netzwerkzugriffe zu begrenzen. |
| Lokale IPv4-Schnittstellen | Höchstens **32**. |
| Gerätebeschreibungen | Höchstens **256 unterschiedliche URLs**, davon höchstens **3 je antwortender IP-Adresse**. Diese Grenze gilt bereits für UPnP-Kandidaten vor der Loewe-Erkennung. |
| SSDP-Antworten | Höchstens **4.096** Nachrichten; einzelne Nachrichten höchstens **8 KiB**. |
| Gerätebeschreibung | Höchstens **128 KiB** XML, höchstens **32** Verschachtelungsebenen und Geräteobjekte. |
| Zusätzliche Antwortzeitlimits | Die Laufzeit begrenzt die Netzwerksuche auf **8 Sekunden**, die Nachrichtenbehandlung einschließlich Namensspeicherung auf **10 Sekunden**; die Admin-Schaltfläche beendet das Warten nach **15 Sekunden**. |

Werden Umfangs- oder Zeitgrenzen erreicht, kann das Ergebnis unvollständig sein. Erkannte Einschränkungen des Suchlaufs werden in der Oberfläche gemeldet; weitere Hinweise stehen im Debug-Protokoll. Einzelne unbrauchbare Gerätebeschreibungen oder nicht zugelassene Verweise werden übersprungen und müssen keine gesonderte Meldung erzeugen. Das Ergebnis enthält alle innerhalb dieser Grenzen erkannten TV-Adressen. Ein einzelnes fehlerhaftes oder nicht antwortendes UPnP-Gerät soll die übrigen Treffer nicht verhindern. Die Suche verwendet eigene asynchrone Netzwerkzugriffe und belegt keine Position in der SOAP-Befehlswarteschlange. Beim Beenden der Instanz wird eine laufende Suche abgebrochen.

## Herkunft des Suchverfahrens

Die Grundlage ist die statische Analyse der für das Projekt bereitgestellten **Loewe App 1.4.7**, Bibliothek **`lib/x86_64/libLoeweApp.so`**. Die für die Implementierung verwendeten Befunde sind hier mit ihren Fundstellen dokumentiert. Die App enthält an `.rodata 0x3600d0` folgende Suchnachricht mit CRLF-Zeilenenden:

```http
M-SEARCH * HTTP/1.1
USER-AGENT: LOEWE/1.0 UPnP/1.1 LOEWE-APP
MX: 3
ST: upnp:rootdevice
Host: 239.255.255.250:1900
Man: "ssdp:discover"
```

`CloeweSsdp::SendSearchRequest` bei `0x15b32c–0x15b362` sendet die Nachricht an die Multicastadresse auf UDP-Port 1900. Die Routine ab `0x15d180` liest `LOCATION`; die HTTP-GET-Vorlage befindet sich bei `0x3468bf` und wird bei `0x15cddd` verwendet. Zu den ausgelesenen Beschreibungsfeldern gehören `friendlyName`, `manufacturer` und `modelName`. Der Tablet-Steuerport **905** wird im App-Code separat gesetzt. Die neue Implementierung übernimmt Suchziel und Suchweg mit eigener ioBroker-Kennung sowie den oben beschriebenen Zeit- und Umfangsgrenzen. Diese Protokollbefunde ersetzen keinen Gerätetest der neuen Adapterfunktion.

Die Konfiguration verwendet die vorhandenen Admin-Komponenten `sendto` und `selectSendTo` mit nur vorübergehend gehaltenen Formularfeldern. Grundlage ist die [offizielle JSON-Config-Beschreibung von ioBroker Admin 7.0.23](https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/SCHEMA.md) sowie deren Implementierung von [ConfigSendto](https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigSendto.tsx) und [ConfigSelectSendTo](https://github.com/ioBroker/ioBroker.admin/blob/v7.0.23/packages/jsonConfig/src/JsonConfigComponent/ConfigSelectSendTo.tsx).

## Prüfung der ursprünglichen Version 0.1.9

Am **18. Oktober 2026** bestanden mit **Node.js 24.19.0** alle **439 Tests** von `npm test`: keine Fehler, abgebrochenen oder übersprungenen Tests. `npm run check` bestätigte außerdem Paketmetadaten, Übersetzungen, Objektdefinitionen, Protokollvorlagen und JavaScript-Syntax. Gegenüber dem vorherigen Stand sind **48 Tests** für die neue Gerätesuche hinzugekommen.

Die zusätzlichen Tests prüfen mehrere Geräte und Netzwerkschnittstellen, doppelte Antworten, allgemeine Loewe-Modellangaben, langsame oder fehlerhafte Geräte, Suchgrenzen und Abbruch. Runtime- und Admin-Vertragstests prüfen die Suche bei leerer TV-Adresse, parallele Bedienung, Formularauswahl, manuelle Eingaben und das Verwerfen alter Treffer nach Fehlern. Zwei Tests verwenden echte HTTP- und TCP-Verbindungen ausschließlich zu lokalen Testservern auf `127.0.0.1`, einschließlich gestückelter XML-Antworten und Abbruch offener Verbindungen. Die SSDP-Antworten sind in den Tests simuliert.

Die Tests liegen in [tv-discovery.test.js](../test/tv-discovery.test.js), [discovery-loopback.test.js](../test/discovery-loopback.test.js), [discovery-admin.test.js](../test/discovery-admin.test.js), [admin-config.test.js](../test/admin-config.test.js) und [runtime.test.js](../test/runtime.test.js). Ein Test der neuen Suche an echten Loewe-TVs sowie ein Bedienungstest in einer laufenden ioBroker-Admin-Oberfläche stehen noch aus.
