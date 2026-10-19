# Gerätekompatibilität und bestätigte Tests

Stand: **19. Oktober 2026**. Diese Fassung beschreibt **0.1.17**, Build **`0.1.17-remote.1`**.

Seit Version 0.1.11 stehen **EPG-Einstellungen** und **Programmübersicht** in eigenen Reitern. Die [Programmübersicht](EPG_GUI.md) zeigt den TV-EPG-Cache der gespeicherten Senderliste und kann separat über die bestehende Admin-Adresse geöffnet werden. Laufende Sendungen lassen sich zum Umschalten auswählen; zukünftige Sendungen können nach Bestätigung zur Aufnahme vorgemerkt werden. Ein dauerhaftes Journal hält noch nicht übertragene Aufträge bis zur Erreichbarkeit des Fernsehers vor. Der Adapter verwendet dafür die in der App belegten Befehle `ProgramTimer` und `GetTimerList`; die [Aufnahme-Protokollbeschreibung](recording-protocol.md) nennt die Belege und Grenzen.

Die [Netzwerksuche](NETWORK_DISCOVERY.md), die Mindestversion Admin 7.7.28 und der ausschließliche EPG-Abruf vom TV bleiben erhalten. Die [Updateanleitung](INSTALLATION.md#update-auf-0117) beschreibt den aktuellen Build. Der [Prüfbericht zu 0.1.12](PRUEFBERICHT_0.1.12.md) dokumentiert die vorherige Timerkorrektur und ihre automatisierten Prüfungen. Der [Prüfbericht zu 0.1.11](PRUEFBERICHT_0.1.11.md) bleibt ebenfalls als Nachweis für den damaligen Stand erhalten.

**Am 19. Oktober 2026 bestätigt der Nutzer, dass beide Aufnahmeaufträge am Fernseher angekommen sind und die erste Aufnahme tatsächlich gestartet ist.** Eine erfolgreiche Fertigstellung ist damit noch nicht bestätigt. Diese Rückmeldung nennt kein konkretes Modell und wird deshalb keinem der unten aufgeführten Geräte einzeln oder pauschal beiden bild-Geräten zugeschrieben. Die originale `GetTimerList`-XML-Antwort liegt weiterhin nicht vor. Die Rückmeldung entstand vor der Anzeigeverbesserung in **`0.1.13-recording-status.1`**; deren Darstellung im tatsächlichen Admin ist noch zu prüfen. Die folgenden EPG-Bestätigungen stammen vom früher bereitgestellten 0.1.8-Stand und bleiben als historische Geräteergebnisse erhalten.

## Fernbedienung der EPG-Seite in 0.1.17

Die neue [Web-Fernbedienung](REMOTE_CONTROL.md) verwendet die bestehenden TV-Tasten sowie die zusätzlich dokumentierten Codes DR_ARCHIVE=92 und BACK=65. Ihr Layout orientiert sich am vom Nutzer am 19. Oktober 2026 bereitgestellten Foto. Normale Tastendrücke, instanzgebundene Übertragung über Admin/Web/Cloud, begrenzte Eingabefolgen und Fehlerfälle werden automatisiert geprüft. Das Einschalten nutzt den bestehenden Wake-on-LAN-/TV_ON-Ablauf; ausdrücklich gewähltes Ausschalten verwendet TV_OFF=25.

Eine gültige Antwort auf `InjectRCKey` bestätigt keinen sichtbaren Menüwechsel und keine laufende Aufnahme. Die neue Oberfläche und die zusätzlichen Tasten müssen noch auf den tatsächlichen Fernsehern geprüft werden. Die unten stehenden früheren Rückmeldungen zu Fernbedienungsdatenpunkten und Cloud-Seitenaufrufen sind keine vollständige Prüfung dieser neuen Bedienfläche. [Prüfbericht zu 0.1.17](PRUEFBERICHT_0.1.17.md).

## Zwei TVs über Cloud und doppelte Kacheln in 0.1.16

Am **19. Oktober 2026** bestätigt der Nutzer, dass beide konfigurierten TV-Instanzen über den Cloud-Adapter beziehungsweise remote geöffnet werden können. Sein Screenshot zeigt zwei passende Kacheln mit `loewe-tv.0/epg.html` und `loewe-tv.1/epg.html` sowie zwei zusätzliche generische Kacheln mit `adapter/loewe-tv/...`. Die Rückmeldung nennt keine installierte Web-Version und ordnet diesen Cloud-Test keinen konkreten TV-Modellen zu. Umschalten und Aufnahmeplanung über die Cloud sind darin nicht gesondert bestätigt.

Version **0.1.16** ersetzt die Objektform des Admin-Links durch die ebenfalls unterstützte URL-Textform. Dadurch importiert Web diesen Link nicht zusätzlich zu den beiden instanzbezogenen Kacheln der Erweiterung. Es handelt sich um doppelte Verknüpfungen; zusätzliche Adapterinstanzen oder Aufnahmeaufträge müssen nicht entfernt werden. Die Bereinigung wurde automatisiert geprüft. Ihre Wirkung auf der produktiven Cloud-Startseite steht nach Installation und Neuladen noch zur Kontrolle aus. [Prüfbericht zu 0.1.16](PRUEFBERICHT_0.1.16.md) · [Update für zwei TVs](INSTALLATION.md#doppelte-web-cloud-kacheln-bei-zwei-fernsehern-bereinigen).

## Web-Auswahl und Cloud-Einrichtung seit 0.1.15

Der Reiter **Web-Zugriff** enthält die ausdrückliche Auswahl **Web-Adapter für die Programmübersicht**. Das Verschieben aus den bisherigen EPG-Einstellungen ändert weder `native.webInstance` noch einen gespeicherten Wert wie `web.0`. Die Wertebildung wurde gegen JSONConfig 8.1.1 aus Admin 7.7.28 und JSONConfig 10.1.3 geprüft. [Offizielles Auswahlfeld](https://github.com/ioBroker/json-config/blob/v8.1.1/src/JsonConfigComponent/ConfigInstanceSelect.tsx).

Die [Cloud-Anleitung](EPG_GUI.md#über-iobrokercloud-remote-öffnen) und die automatisierten Pfadprüfungen beziehen sich auf Web 9.1.15 und Cloud 6.2.11. Die gemeinsame Web-Instanz, deren lokaler Zugriff über `127.0.0.1` und der getrennte Cloud-Socket-Kontext sind aus den dort verlinkten offiziellen Quellen abgeleitet. Der [Prüfbericht zu 0.1.15](PRUEFBERICHT_0.1.15.md) beschreibt den damaligen Quellcode- und Teststand vor der anschließenden Nutzerbestätigung des Remote-Aufrufs.

## Senderlogos und Web-Zugriff seit 0.1.14

Das optionale `thumbnailUrl`-Feld der TV-Senderliste wird bis zur Programmübersicht durchgereicht. Eine gefüllte Bildadresse wurde für die unten aufgeführten Geräte noch nicht durch eine echte Antwort belegt. Die mitgelieferten Logos funktionieren unabhängig davon; fehlende oder nicht ladbare Bilder lassen den Sendernamen sichtbar. [Quellen und Verhalten](CHANNEL_LOGOS.md).

Die kompakte Oberfläche und die Zugriffspfade über Admin und ioBroker.web sind mit automatisierten Prüfungen und den offiziellen ioBroker-Schnittstellen abgeglichen. Eine visuelle Prüfung im produktiven Admin/Web des Nutzers und ein Logoabruf von dessen TV stehen noch aus. Die neuen Links und Bilder ändern weder die TV-Programme noch vorhandene Aufträge.

## Rückmeldungen aus Gerätetests

| Modell | Chassis | TV-Software | Bestätigter Umfang |
|---|---|---|---|
| **Loewe bild 7.55** | **SL420** | **V5.4.6.0** | Direkter EPG-Abruf vom Fernseher mit dem damaligen 0.1.8-Stand am 18.10.2026 bestätigt. Frühere Rückmeldungen bestätigen Senderabruf, Senderordner, konfigurierte Senderliste und TV-Auswahl nach kurzem Test sowie die bereits vorhandenen Fernbedienungstaster. |
| **Loewe bild 5.32** | **SL310F** | **V5.4.6.0** | Direkter EPG-Abruf vom Fernseher mit dem damaligen 0.1.8-Stand am 18.10.2026 bestätigt. Die vom Nutzer ergänzte Gerätetabelle bestätigt außerdem Fernbedienung, Senderlisten und TV-Auswahl. |
| **Loewe Connect 26 SL** | **MB180** laut Loewe-Serviceanleitung | Nicht mitgeteilt | Der Nutzer meldet, dass das Gerät mit dieser Steuerung nicht kompatibel ist. Für die verwendete Tablet-Schnittstelle liegt kein positiver Kompatibilitätsnachweis vor. |

Die Modell-, Chassis- und Firmwareangaben der beiden bild-Geräte sowie ihre EPG-Ergebnisse stammen vom Nutzer. Seine Rückmeldung bestätigt den Abruf **vom Fernseher**. Die tatsächliche Verfügbarkeit aller Sender, Zeiträume und einzelnen EPG-Felder wurde dabei nicht vollständig dokumentiert. Manuell bestätigte einzelne Aufnahmeaufträge sind seit 0.1.11 implementiert. Eine automatische Suche nach Sendungen anhand von Regeln ist weiterhin geplant; die Radiosteuerung bleibt zurückgestellt. Die vom Nutzer aktualisierte [Gerätetabelle in der README](../README.md#getestete-geräte) führt für beide bild-Geräte auch Fernbedienung, Senderlisten und TV-Auswahl auf.

## Ein Suchtreffer ist noch kein Kompatibilitätsnachweis

Die neue Suche wertet SSDP-Antworten und die zugehörige Gerätebeschreibung aus. Sie berücksichtigt Geräte mit Loewe-Herstellerangabe und schließt bekannte Audiomodelle aus. Geräte mit einem TV-Hinweis im Namen, Modell oder angebotenen Dienst erscheinen auch bei nicht erreichbarem Steuerport. Allgemein beschriebene Loewe-Geräte, etwa als `MediaRenderer`, werden zusätzlich angeboten, wenn der konfigurierte TCP-Steuerport erreichbar ist. Dabei führt der Adapter weder eine `RequestAccess`-Anmeldung noch einen Fernbedienungsbefehl aus. Die Einzelheiten stehen in [NETWORK_DISCOVERY.md](NETWORK_DISCOVERY.md#was-ein-treffer-aussagt).

Ein gefundener Name und ein offener Port bestätigen daher noch keine erfolgreiche Tablet-API-Steuerung. Auch ein bisher nicht unterstütztes Loewe-Modell kann eine passende Netzwerkbeschreibung liefern. **Der Connect 26 SL / MB180 bleibt nicht unterstützt, selbst wenn er in der Suche erscheinen sollte.** Umgekehrt beweist ein fehlender Suchtreffer keine Inkompatibilität: SSDP muss im betreffenden Netz ankommen, und der Fernseher muss mit aktiver Netzwerkschnittstelle antworten. Für die neue Suche steht der Test an echten Fernsehern, einschließlich mehrerer gleichzeitig erreichbarer TVs, noch aus.

## Einschalten aus dem Standby

**Am 18. Oktober 2026 hat der Nutzer das Einschalten über den Adapter-Datenpunkt bestätigt, sofern am Fernseher der Schnellstart-Modus aktiviert ist.** Ohne Schnellstart schaltet der TV laut seiner Beobachtung die Netzwerkfunktionen im Standby ab und lässt sich dann nur mit der normalen Fernbedienung einschalten. Die Rückmeldung nennt dafür weder ein bestimmtes Modell noch einen Build. Sie wird deshalb nicht pauschal beiden Geräten in der Tabelle oder allen Loewe-Chassis zugeschrieben.

Schnellstart muss direkt am eingeschalteten Fernseher aktiviert werden. Ist der TV bereits über das Netzwerk unerreichbar, kann der Adapter diese Einstellung nicht ändern. Eine bekannte MAC-Adresse oder ein erfolgreich versendetes Wake-on-LAN-Paket hebt diese Voraussetzung nicht auf. Die Einstellung für Einschalten über LAN und die passenden Netzwerkparameter bleiben zusätzlich erforderlich. Die [Bedienungsanleitung](INSTALLATION.md#ein--und-ausschalten) beschreibt `control.powerOn` und seine Diagnosewerte.

Neue Timer können nur übertragen werden, solange der TV erreichbar ist. Die Aufnahmeverwaltung wartet auf diese Erreichbarkeit und sendet selbst kein Wake-on-LAN und keinen Einschaltbefehl. Ist ein noch nicht übertragener Auftrag beim Sendungsbeginn weiterhin offen, wird er als verpasst markiert und nicht nachträglich programmiert. Wie bereits im Fernseher gespeicherte Aufnahmetimer bei deaktiviertem Schnellstart ausgeführt werden, ist damit nicht geprüft und muss gesondert getestet werden.

## Loewe Connect 26 SL

**Ergebnis: Netzwerk-Medienfunktionen sind dokumentiert; eine native IP-Fernsteuerung, die dieser Adapter nutzen kann, ist für den Connect 26 SL nicht nachgewiesen. Das Modell wird deshalb als nicht unterstützt geführt.** Eine grundsätzlich unmögliche Steuerung über jede denkbare Netzwerkschnittstelle lässt sich aus der Dokumentation allein nicht beweisen.

### Modell und Chassis unterscheiden

Die von Loewe verfasste **Serviceanleitung 230-98287.040** ordnet den **Connect 26 SL, Artikelnummer 50401**, ausdrücklich dem Chassis **MB180** zu. Der Namenszusatz „SL“ ist hier kein Nachweis für ein Chassis der SL1xx-/SL2xx-/SL3xx-/SL4xx-Familien. Die Zuordnung steht auf der Titelseite und erneut in den technischen Daten auf Seite 60. [Quelle: Loewe-Serviceanleitung, Kopie bei ManualsLib](https://www.manualslib.com/manual/2973231/Loewe-Connect-22-Sl.html).

Unser Adapter verwendet `POST /loewe_tablet_0001` auf TCP-Port 905 mit dem SOAP-Namensraum `urn:loewe.de:RemoteTV:Tablet`. Die Anforderungen dieser Schnittstelle folgen aus der App-Analyse und der [Loewe Remote API](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf); ein LAN-Anschluss allein erfüllt sie nicht. Die Implementierung befindet sich in [lib/loewe-client.js](../lib/loewe-client.js).

### Was am Netzwerkanschluss belegt ist

Die Bedienungsanleitung beschreibt auf Seite 56 **MediaHome**: Der Fernseher spielt Fotos, Musik und Videos von Medienservern im Heimnetz ab. Dafür unterstützt er **UPnP AV**. Der Zugang erfolgt über Ethernet oder einen optionalen WLAN-USB-Stick. [Quelle: Loewe-Bedienungsanleitung, Seite 56](https://www.manualslib.de/manual/34240/Loewe-Connect-26-Sl.html?page=56); [vollständiges Hersteller-PDF](https://cdn.loewe.tv/manuals_new/TV_BA/MB180/50401xxx_50405xxx_Connect_22_26%20SL/35021000_Connect_22_26_DE_1n.pdf).

Das belegt die Nutzung des Fernsehers als Medienclient. Es belegt weder den Tablet-Steuerdienst noch einen von außen steuerbaren UPnP-MediaRenderer. Ebenso beweist die EPG-Anzeige am Fernseher noch keinen Abruf dieser Daten über eine Netzwerkschnittstelle. Die Suche ergab keinen verifizierten alternativen IP-Steuerweg speziell für **Connect 26 SL / MB180**. Beispiele zu anderen Connect-Modellen oder anderen Plattformen sind deshalb kein Implementierungsnachweis für dieses Gerät.

### Herstellerangaben zur App-Kompatibilität

In einer **von Loewe AG veröffentlichten Pressemitteilung vom 30.01.2012** wurde die damalige Assist Media App für internetfähige Loewe-LED-Fernseher **ab 32 Zoll** mit entsprechender TV-Software freigegeben. Der Connect 26 SL liegt außerhalb dieses angegebenen Umfangs. [Quelle: Loewe-Pressemitteilung bei pressetext](https://www.pressetext.com/news/smart-und-einmalig-loewe-assist-media-app.html).

Die beim Recherchezeitpunkt abrufbare **Loewe-FAQ** nennt für die Remote-Funktion der Loewe App **SL2xx ab V2.4.54** beziehungsweise **SL3xx/SL4xx ab V4.4**. MB180 wird dort nicht aufgeführt. Diese aktuelle Liste ist von der älteren Assist-Media-App zu unterscheiden. [Quelle: Loewe-FAQ, Software/App](https://www.loewe.tv/de/de/service/faq-listing?faq=4app).

Zusammen mit dem gemeldeten Fehlversuch spricht das für fehlende Unterstützung der verwendeten Schnittstelle. Es gibt derzeit keine Grundlage dafür, die Kompatibilität durch eine andere Senderkennung, EPG-Einstellung oder einen geratenen Portwechsel im Adapter zu versprechen.

### Mögliche alternative Anbindung

| Weg | Stand und Grenze |
|---|---|
| Netzwerkfähiger Infrarotsender | Als separate Lösung denkbar: ioBroker veranlasst den Sender, die Befehle der normalen Fernbedienung auszugeben. Das wäre eine indirekte Steuerung und müsste mit dem Gerät erprobt werden. Aus dem Senden eines IR-Befehls folgt keine Rückmeldung des TV-Zustands und kein EPG-Abruf. |
| Optionales RS232-Modul | Das Loewe-Produktblatt für den Connect 26 SL führt **RS232 C über RJ12** und **IR-Link** als nachrüstbar/optional. Ob diese Hardware im konkreten Gerät vorhanden ist, ist unbekannt. Ein verifiziertes MB180-Steuerprotokoll mit passenden Befehlen wurde nicht gefunden. |
| Andere native IP-Schnittstelle | Bisher kein positiver Nachweis für dieses genaue Modell. Sie müsste zunächst an der tatsächlich installierten Firmware identifiziert und mit einem lesenden Aufruf bestätigt werden. |

Quelle für die optionale serielle Ausstattung: [Loewe-Produktinformation Connect 26 SL, Seite 2](https://static.hifi-forum.de/produkte/65785341/broschuere_loewe-connect-26-sl.pdf). Das dort verwendete Optionszeichen bedeutet laut Legende „nachrüstbar/optional erhältlich“. Das Blatt ist keine Protokollspezifikation und sagt nicht aus, dass jedes ausgelieferte Gerät einen nutzbaren RJ12-Anschluss besitzt.

Für eine spätere Untersuchung des konkreten Geräts wären dessen **Softwareversion, vollständige Artikelnummer und vorhandene Anschlussausstattung** hilfreich. Eine lesende Prüfung der erreichbaren Dienste könnte dann klären, ob die Firmware mehr anbietet als dokumentiert. Ein offener Port oder ein im Netzwerk sichtbarer Medienclient allein wäre weiterhin kein Funktionsnachweis für die Tablet-API.

## Bedeutung für EPG und Aufnahmen

Die weitere EPG- und Aufnahmeentwicklung kann sich auf die zwei positiv gemeldeten bild-Geräte konzentrieren. Programmdaten stehen bei den TV-Sendern unter `channels.tv.<Sender-ID>.epg` und stammen ausschließlich vom Fernseher. Die Programmübersicht zeigt die vorhandene Ereignisliste; `recordings.jobs` speichert bestätigte Aufnahmeaufträge für diese Adapterinstanz.

Version 0.1.13 verbessert ausschließlich die Anzeige. Die Oberfläche unterscheidet eine dokumentierte Antwort auf `ProgramTimer` anhand des bereits dauerhaft gespeicherten Zeitpunkts `acknowledgedAt` von einem Versand ohne Antwortnachweis. Bei offenem Timerabgleich bleibt der interne Status `uncertain`. Die zugehörige Timerdiagnose ist weiterhin in einem aufklappbaren Detail zugänglich. Runtime, Journalformat, vorhandene Aufträge und die Regeln für TV-Schreibbefehle bleiben unverändert; die Anzeige löst keine erneute Übertragung aus.

Eine gültige `ProgramTimer`-Antwort bestätigt die Kommunikation zum Auftrag, aber keinen fachlichen Erfolg eines unbekannten `Result`-Werts. Erst eine eindeutig passende TV-Timerkennung mit Senderzuordnung und exakten Start-/Endzeiten in einer vollständig vergleichbaren Liste führt zu **im TV geplant** (`scheduled`). Auch dieser Zustand bestätigt keine erfolgreich abgeschlossene Aufnahme. Ein möglicherweise bereits gesendeter Auftrag wird bei weiteren Abgleichen oder nach Neustart nicht nochmals übertragen. Tatsächliche Transport- und SOAP-Fehler bleiben als Fehler sichtbar.

Für den automatischen Timerabgleich fehlt weiterhin die reale `GetTimerList`-XML-Antwort der installierten Firmware. Die derzeitige Zeitparserprüfung arbeitet mit ausdrücklich datierten ISO-Zeitangaben samt Zeitzone. Die neue Rückmeldung belegt die beiden am TV angekommenen Aufträge und den Start der ersten Aufnahme, aber noch keine allgemeine Unterstützung aller Timerformate.

Die [EPG-Anleitung](EPG.md), [EPG-Protokollbeschreibung](epg-protocol.md), [Aufnahme-Protokollbeschreibung](recording-protocol.md) und [Roadmap](ROADMAP.md) beschreiben den Funktionsumfang und die noch offenen Hardwaretests.
