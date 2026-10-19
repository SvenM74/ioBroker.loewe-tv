# Gerätekompatibilität und bestätigte Tests

Stand: **19. Oktober 2026**. Aktueller Adapter: **0.1.12**, Build **`0.1.12-recording-fix.1`**.

Seit Version 0.1.11 stehen **EPG-Einstellungen** und **Programmübersicht** in eigenen Reitern. Die [Programmübersicht](EPG_GUI.md) zeigt den TV-EPG-Cache der gespeicherten Senderliste und kann separat über die bestehende Admin-Adresse geöffnet werden. Laufende Sendungen lassen sich zum Umschalten auswählen; zukünftige Sendungen können nach Bestätigung zur Aufnahme vorgemerkt werden. Ein dauerhaftes Journal hält noch nicht übertragene Aufträge bis zur Erreichbarkeit des Fernsehers vor. Der Adapter verwendet dafür die in der App belegten Befehle `ProgramTimer` und `GetTimerList`; die [Aufnahme-Protokollbeschreibung](recording-protocol.md) nennt die Belege und Grenzen.

Die [Netzwerksuche](NETWORK_DISCOVERY.md), die Mindestversion Admin 7.7.28 und der ausschließliche EPG-Abruf vom TV bleiben erhalten. Die [Updateanleitung](INSTALLATION.md#update-auf-0112) beschreibt den aktuellen Build. Der [Prüfbericht zu 0.1.12](PRUEFBERICHT_0.1.12.md) dokumentiert die Timerkorrektur und ihre automatisierten Prüfungen. Der [Prüfbericht zu 0.1.11](PRUEFBERICHT_0.1.11.md) bleibt als Nachweis für den damaligen Stand erhalten.

**Für `0.1.12-recording-fix.1` liegt noch kein Gerätetest des Fixes vor; die originale XML-Timerantwort fehlt weiterhin. Eine erfolgreich abgeschlossene DR+-Aufnahme wurde für diesen Stand nicht nachgewiesen.** Der Nutzer bestätigt, dass ein Aufnahmeauftrag am Fernseher angekommen ist. Diese Rückmeldung nennt kein konkretes Modell und wird deshalb nicht pauschal beiden Geräten zugeschrieben. Die folgenden EPG-Bestätigungen stammen vom früher bereitgestellten 0.1.8-Stand und bleiben als historische Geräteergebnisse erhalten.

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

Der nächste Gerätetest muss den neuen Build einschließlich Konfigurationsspeicherung, erneutem TV-EPG-Abruf, gezieltem Umschalten und Timerübertragung prüfen. Ein Auftrag gilt erst mit einer eindeutig passenden TV-Timerkennung, Senderzuordnung und Start-/Endzeit als **im TV geplant**. Eine Antwort auf `ProgramTimer` allein genügt dafür nicht. Unklare Übertragungen werden zur Vermeidung doppelter Timer nicht automatisch erneut gesendet. Dafür ist besonders eine reale `GetTimerList`-Antwort der installierten Firmware hilfreich; die derzeitige Zeitparserprüfung arbeitet mit ausdrücklich datierten ISO-Zeitangaben samt Zeitzone.

Die [EPG-Anleitung](EPG.md), [EPG-Protokollbeschreibung](epg-protocol.md), [Aufnahme-Protokollbeschreibung](recording-protocol.md) und [Roadmap](ROADMAP.md) beschreiben den Funktionsumfang und die noch offenen Hardwaretests.
