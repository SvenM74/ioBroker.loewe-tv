# Gerätekompatibilität und bestätigte Tests

Stand: **18. Oktober 2026**. Aktueller Adapter: **0.1.8**, Build **`0.1.8-tv-epg-only.1`**.

Der aktuelle Build ruft Programminformationen ausschließlich direkt vom Fernseher ab. Er entfernt die externe EPG-Quelle, deren Einstellungen und überflüssige Datenpunkte. **Das neue Paket muss auch dann installiert werden, wenn bereits Version 0.1.8 angezeigt wird.** Der Build-Bezeichner unterscheidet die Paketstände. Die [EPG-Anleitung](EPG.md) beschreibt den aktuellen Funktionsumfang; der [Prüfbericht zum TV-EPG-Build](PRUEFBERICHT_0.1.8_TV_EPG.md) dokumentiert die Überarbeitung.

**Der neue Build `0.1.8-tv-epg-only.1` selbst wurde noch nicht am Gerät getestet.** Die folgenden EPG-Bestätigungen stammen vom früher bereitgestellten 0.1.8-Stand und bleiben als historische Geräteergebnisse erhalten.

## Rückmeldungen aus Gerätetests

| Modell | Chassis | TV-Software | Bestätigter Umfang |
|---|---|---|---|
| **Loewe bild 7.55** | **SL420** | **V5.4.6.0** | Direkter EPG-Abruf vom Fernseher mit dem damaligen 0.1.8-Stand am 18.10.2026 bestätigt. Frühere Rückmeldungen bestätigen Senderabruf, Senderordner, konfigurierte Senderliste und TV-Auswahl nach kurzem Test sowie die bereits vorhandenen Fernbedienungstaster. |
| **Loewe bild 5.32** | **SL310F** | **V5.4.6.0** | Direkter EPG-Abruf vom Fernseher mit dem damaligen 0.1.8-Stand am 18.10.2026 bestätigt. Die vom Nutzer ergänzte Gerätetabelle bestätigt außerdem Fernbedienung, Senderlisten und TV-Auswahl. |
| **Loewe Connect 26 SL** | **MB180** laut Loewe-Serviceanleitung | Nicht mitgeteilt | Der Nutzer meldet, dass das Gerät mit dieser Steuerung nicht kompatibel ist. Für die verwendete Tablet-Schnittstelle liegt kein positiver Kompatibilitätsnachweis vor. |

Die Modell-, Chassis- und Firmwareangaben der beiden bild-Geräte sowie ihre EPG-Ergebnisse stammen vom Nutzer. Seine Rückmeldung bestätigt den Abruf **vom Fernseher**. Die tatsächliche Verfügbarkeit aller Sender, Zeiträume und einzelnen EPG-Felder wurde dabei nicht vollständig dokumentiert. Automatische Aufnahmeprogrammierung ist weiterhin geplant. Die bisher fehlende Bestätigung des Einschaltens und die zurückgestellte Radiosteuerung werden durch den EPG-Test nicht geändert. Die vom Nutzer aktualisierte [Gerätetabelle in der README](../README.md#getestete-geräte) führt für beide bild-Geräte auch Fernbedienung, Senderlisten und TV-Auswahl auf.

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

Die weitere EPG- und Aufnahmeentwicklung kann sich auf die zwei positiv gemeldeten bild-Geräte konzentrieren. Programmdaten stehen bereits bei den TV-Sendern unter `channels.tv.<Sender-ID>.epg` und stammen im aktuellen Build ausschließlich vom Fernseher. Der nächste Gerätetest muss den neuen Build einschließlich Konfigurationsspeicherung und erneutem TV-EPG-Abruf prüfen. Für eine spätere Aufnahmeautomatik müssen Sendungszeiten, eindeutige Senderzuordnung und ein tatsächlich im Fernseher gespeicherter Aufnahmetimer gesondert geprüft werden. Eine vollständige Ereignisliste und Aufnahmedatenpunkte sind weiterhin geplant. Die [EPG-Anleitung](EPG.md), [Protokollbeschreibung](epg-protocol.md) und [Roadmap](ROADMAP.md) beschreiben diese nächsten Schritte.
