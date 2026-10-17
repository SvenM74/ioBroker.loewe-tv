# Prüfbericht: Loewe-TV-Adapter 0.1.2

Stand: **17. Oktober 2026**

## Ergebnis

**104 Tests bestanden; 0 fehlgeschlagen, abgebrochen oder übersprungen.** Die unveränderte Ausgabe des abschließenden gemeinsamen Testlaufs steht in [TESTERGEBNIS_0.1.2.tap](TESTERGEBNIS_0.1.2.tap). Der Lauf verwendet die endgültigen JavaScript-Dateien dieser Version.

| Testdatei | Ausgeführte Tests |
|---|---:|
| `test/channels.test.js` | 8 |
| `test/client-regressions-010.test.js` | 18 |
| `test/loopback.test.js` | 4 |
| `test/power-on.test.js` | 17 |
| `test/protocol.test.js` | 23 |
| `test/regressions-010.test.js` | 8 |
| `test/runtime.test.js` | 26 |
| **Gesamt** | **104** |

Zusätzlich besteht `npm run check`: 94 Objektdefinitionen im Standardmodus, 293 mit erweiterten Aktionen, 34 ursprüngliche XML-Vorlagen, 33 SOAP-Aktionen, 29 ursprüngliche und 11 ergänzende APK-Tasten sowie der dokumentierte TV_ON-Code 22. Paketversion, 12 Konfigurationsfelder, Admin-Übersetzungen und JavaScript-Syntax sind konsistent.

## Umgebung und Grenzen

Lokaler Testlauf unter **Linux mit Node.js v24.19.0** und dem produktiven XML-Parser `sax` 1.6.1:

```bash
node --test --test-reporter=tap test/*.test.js > docs/TESTERGEBNIS_0.1.2.tap
npm run check
```

Die Tests verwenden kontrollierte TV-Antworten und ioBroker-Datenbank-Doubles. Vier Tests öffnen echte HTTP-/UDP-Sockets ausschließlich auf der lokalen Loopback-Schnittstelle. Beim UDP-Test wird der angeforderte Produktionsport 9 geprüft und für den lokalen Empfang auf einen dynamischen Testport umgeleitet. Es wurde kein Fernseher angesprochen und kein produktiver ioBroker-Controller gestartet.

Die beiden Tests zur Gesamtfrist einer Texteingabe steuern Uhrzeit und Antworten gezielt. Dadurch ist beim Ablauf nachweislich eine Anfrage offen, deren Abbruch geprüft wird. Ein bereits beantworteter Request wird nicht irrtümlich als noch offen vorausgesetzt. Die übrigen Loopback-Tests prüfen weiterhin reale Transportfristen und die Reaktionsfähigkeit der Ereignisschleife.

## Senderabfrage

Der bisherige Komfortabruf übergab die zunächst leere `channels.view` an den Client. Dieser wies die Anfrage lokal zurück. Die Korrektur fragt bei leerer oder nur aus Leerzeichen bestehender Kennung zunächst die vorhandenen Listen ab und wählt eine tatsächlich gemeldete geeignete Liste. Explizit eingetragene Kennungen bleiben erhalten.

Geprüft wurden:

- automatische Auswahl ohne erfundene Listenkennung sowie Erhaltung einer ausdrücklich gewählten Favoritenliste;
- getrennte Seitenindizes für Listen und Sender sowie die Filter für TV, Radio und beide Medienarten;
- Auswertung von Listen, Sendernamen, Locators und Seitenangaben, einschließlich erhaltener Zeichenketten und führender Nullen;
- ein synchronisierender TV ohne Endlosschleife oder erfundene Ersatzliste;
- fehlerhafte Antworten mit gesicherter Rohantwort und Erhaltung der letzten erfolgreich aufbereiteten Senderdaten.

`channels.entries` enthält weiterhin jeweils **eine Seite**. Die Version sammelt noch keinen vollständigen Senderbestand über mehrere Seiten. Angaben zur nächsten Seite gelten nur, wenn sie sich aus der Antwort ableiten lassen.

## Einschalten und Abbruch

Die [Loewe Remote API 1.0.47, Kapitel 9.4.3](https://cdn.loewe.tv/manuals/de/plus/Remote%20API/remote_api_1.0.47_Loewe.pdf), unterscheidet Netzwerkstandby und interaktiven Betrieb. Der neue Ablauf ergänzt deshalb nach Wake-on-LAN den gezielten TV_ON-Code 22. Das [Benutzerhandbuch für bild-Geräte mit SL3xx/SL4xx](https://cdn.loewe.tv/manuals_new/TV_BA/SL3xx_SL4xx/universelles%20Benutzerhandbuch%20f%C3%BCr%20alle%20bild%20Ger%C3%A4te/36960000_UH_bild_universal_3l_DE_180813.pdf) nennt mindestens 30 Sekunden zwischen Standby und erneutem Netzwerkaufwecken.

Geprüft wurden:

- unmittelbarer WOL-Versand vor langsamen Datenbankzugriffen und unabhängig von wartenden SOAP-Anfragen;
- nachfolgender TV_ON-Befehl 22, begrenzte Einzelversuche und Gesamtfrist, Wiederholung nur bei dafür vorgesehenen vorübergehenden Fehlern;
- einmaliger weiterer WOL-Burst frühestens nach 35 Sekunden, sofern der Einschaltversuch noch läuft;
- Abbruch wartender Einschaltbefehle und noch geplanter WOL-Senderunden bei Ausschalten oder Beenden;
- die Folge Ein → Aus → Ein → Aus, ohne dass ein zurückgestellter Einschaltversuch später wieder startet;
- gezielter Ausschaltcode 25 über `control.powerOff`, bei unveränderten bisherigen Remote-Codes;
- unbekannte WOL-Einstellungen bis zu einer gültigen Geräteantwort, statt einer vorgetäuschten Deaktivierung.

`info.powerOn` dokumentiert den Ablauf. `powerKeySent` bestätigt eine erfolgreiche Antwort der Schnittstelle auf den Einschaltbefehl, **keinen sichtbaren Bildschirminhalt**. Bereits versandte Pakete können nicht zurückgeholt werden. Bereits begonnene Datenbankschreibvorgänge können nach einem Abbruch noch gespeichert werden; Zeitstempel helfen bei der Zuordnung.

## Rückmeldung vom realen Gerät

Der Nutzer meldete einen **Loewe bild 7.55, Chassis SL420, Software V5.4.6.0**. Im zuvor installierten Stand scheinen alle bisherigen Remote-Datenpunkte zu funktionieren. EPG 15 und EPG-Alt 78 öffnen dieselbe Anzeige. Senderabruf und Einschalten waren dort bislang nicht erfolgreich, obwohl Einschalten über LAN am TV aktiviert ist.

**Die neuen Sender- und Einschaltkorrekturen sind am SL420 noch nicht bestätigt.** Auch der neue Datenpunkt `remote.power_on` ist nicht durch den früheren Remote-Test abgedeckt. Die [README](../README.md) enthält Updateanleitung, Gerätetest und die dafür relevanten Diagnosewerte.

## Weiterer Recherchebefund

Kapitel 9.22 der Hersteller-API dokumentiert einen lokalen EPG-Zugriff über `CreateIterator` auf `de.loewe.sl2.epg`. Dieser Befund ist in der [Roadmap](ROADMAP.md) aufgenommen. Ein EPG-Importer und automatische Aufnahmeplanung sind in 0.1.2 noch nicht implementiert; passende SL420-Antworten und die notwendigen Zeitangaben müssen zuerst geprüft werden.
