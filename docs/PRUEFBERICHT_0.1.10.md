# Prüfbericht zur Programmübersicht

Stand: **18. Oktober 2026**. Paketversion **0.1.10**, Build **`0.1.10-epg-guide.1`**.

## Ergebnis

Der vollständige Testlauf mit **Node.js 24.19.0** hat **496 Tests bestanden**, ohne Fehler, ausgelassene oder abgebrochene Tests. Die Paketprüfung mit `npm run check` hat Metadaten, Objektdefinitionen, Konfigurationsfelder, Übersetzungen, Protokollvorlagen und JavaScript-Syntax erfolgreich geprüft. `git diff --check` meldete keine Fehler.

Die neue Ansicht ist unter den EPG-Einstellungen der Instanz eingebettet. Sie liest ausschließlich den vorhandenen TV-EPG-Cache der gespeicherten Senderliste. Zeitachse, Senderzeilen, Auswahl und Detailansicht sind beschrieben in [Programmübersicht](EPG_GUI.md); das Update steht unter [Installation](INSTALLATION.md#update-auf-0110).

## Automatisierte Prüfungen im Repository

Zusätzlich zu den bisherigen Adaptertests wurden folgende Bereiche abgesichert:

| Bereich | Geprüftes Verhalten |
|---|---|
| Guide aus dem EPG-Cache | Nur die gespeicherte TV-Liste, numerische Reihenfolge, Identität der Cacheeinträge, leere und deaktivierte Einträge, Alterung sowie Programmfenster. Der reine Lesezugriff startet keine TV-Abfragen und schreibt keine Datenpunkte. |
| Große Senderlisten | Begrenzte Seitengröße und Antwortgröße; vollständige Sammlung auch bei kürzeren Seiten, keine doppelten Sender, konsistente Revision und höchstens begrenzte Neustarts nach Listenänderungen. |
| Konfigurationswechsel | Senderliste sowie TV-Host und Port gehen in die Katalogrevision ein. Veraltete Aktualisierungsaufträge werden abgelehnt, bevor sie den anderen TV ansprechen könnten. |
| Hintergrundaktualisierung | Sofortige Bestätigung statt Warten auf alle Sender. Ein laufender EPG-Zyklus wird auch zwischen zwei Abschnitten weiterverwendet; deaktiviertes EPG wird nicht durch die Ansicht aktiviert. |
| Admin-Einbettung | Gültige URL beim Start, richtige Instanz statt Rückfall auf Instanz 0, Admin-Basispfad hinter einem Proxy, unveränderte speicherbare Einstellungen und begrenzte Message-Laufzeit. |
| Admin-Verbindung | Authentifizierung vor Adapteranfragen, Fehler und Zeitlimits, strukturierte Antworten, Vollständigkeitsprüfungen und Freigabe der eigenen Verbindung beim Schließen. |
| Darstellung der Daten | Zeitfenster, Suche, numerische Reihenfolge, überlappende Sendungen, unbekannte Endzeiten, laufende Sendungen und Tastaturnavigation. TV-Texte werden als Text eingefügt. |

Die enthaltenen Tests lassen sich mit `npm test` ausführen. Lokale TCP-/UDP-Testserver prüfen unter anderem die vorhandenen Verbindungs-, Protokoll- und Netzwerksuchfunktionen. Dafür muss die Testumgebung lokale Sockets erlauben. Diese Tests verwenden keinen echten Fernseher.

## Zusätzliche Integrationsprüfungen

**11 DOM-Prüfungen mit dem tatsächlichen HTML und Produktionsskript bestanden.** Verwendet wurde ein temporäres Harness mit dem eigenständigen `linkedom`-Worker; dem Adapter wurde dafür keine Abhängigkeit hinzugefügt. Geprüft wurden die gerenderten Sender und Texte, Sendungsauswahl, Sendersuche, Cache-Nachladen, Zustands- und Fehlermeldungen, genau ein manueller Refresh bei Doppelbetätigung, erneutes Laden nach `EPG_GUIDE_CHANGED`, verspätete Antworten sowie die Freigabe von Timern und Observern. Diese elf Prüfungen sind zusätzlich zum regulären Testlauf ausgeführt worden und nicht Teil des veröffentlichten Testsatzes.

Das **unveränderte offizielle Admin-v7.7.28-Socket-Bundle** wurde außerdem mit simulierten nativen Browser-WebSockets ausgeführt. Geprüft wurden der `authenticate`-Handshake, eine Verbindung über einen HTTPS-Proxy-Basispfad, die richtige Adapterinstanz, mehrseitige Antworten, Schließen der Ansicht und serverseitiger Verbindungsabbruch. Nach dem Aufräumen blieben keine zusätzlichen Verbindungen, Verbindungs-Timer oder Heartbeat-Intervalle zurück. Ein verzögertes Wiederverbinden des ursprünglichen Clients nach `destroy()` wurde reproduziert; die Bridge verhindert es für ihre eigenen Verbindungen. Verbindungen der übergeordneten Admin-Seite werden dabei nicht verändert.

## Prüfgrenzen

Ein echter Browser mit ioBroker Admin und eine reale TV-Verbindung standen für diesen Build nicht zur Verfügung. Die DOM-Prüfungen bestätigen Struktur und Bedienlogik, **keine visuelle Prüfung des CSS-Layouts**. Die Anmeldung an einem echten Admin-Server einschließlich Benutzerrechten und Reverse Proxy sowie die Darstellung mit den tatsächlichen TV-Daten müssen in einer ioBroker-Installation bestätigt werden.

Die vom Nutzer bestätigten TV-EPG-Tests auf **bild 7.55 / SL420 / V5.4.6.0** und **bild 5.32 / SL310F / V5.4.6.0** gelten für den früheren 0.1.8-Stand. Sie werden nicht als Gerätetest der neuen Oberfläche ausgegeben. Die Übersicht zeigt nur vorhandene Programminformationen; sie enthält weder ein Live-Videobild noch eine Aufnahmeprogrammierung.

## Verwendete Primärquellen

- [Native iframeSendTo-Komponente in ioBroker JSONConfig](https://github.com/ioBroker/json-config/blob/v8.1.1/src/JsonConfigComponent/ConfigIFrameSendTo.tsx)
- [Offizielles Socket-Bundle aus ioBroker Admin v7.7.28](https://github.com/ioBroker/ioBroker.admin/blob/v7.7.28/src-admin/public/lib/js/socket.io.js)
- [Authentifizierung und Verbindung im offiziellen Socket-Client](https://github.com/ioBroker/socket-client/blob/main/src/Connection.ts)

Die Einbettung setzt **ioBroker Admin ab 7.7.28** voraus. Die vorhandene CI-Konfiguration führt den regulären Testsatz auf Node.js 22 und 24 aus; den Status des jeweiligen Commits zeigen die [GitHub Actions](https://github.com/SvenM74/ioBroker.loewe-tv/actions).
