# Prüfbericht 0.1.13

Stand: **19. Oktober 2026**. Version **0.1.13**, Build **`0.1.13-recording-status.1`**.

## Anlass und bestätigter Gerätebefund

Der Nutzer meldet, dass beide Aufnahmeaufträge erfolgreich an den Fernseher übertragen wurden und die erste Aufnahme bereits gestartet ist. Der beigefügte Screenshot zeigt beide Aufträge dennoch als **Übertragung unklar**, jeweils mit dem Hinweis auf eine nicht vollständig vergleichbare Timerliste.

Die Rückmeldung bestätigt die Übergabe beider Aufträge und den Beginn einer Aufnahme. Ein erfolgreich abgeschlossener Mitschnitt, die Zuordnung dieser Rückmeldung zu einem bestimmten TV-Modell und die originale `GetTimerList`-XML-Antwort sind damit nicht dokumentiert.

## Ursache

`RecordingManager` speichert eine passende Antwort auf den Aufnahmebefehl bereits dauerhaft als `acknowledgedAt`. Dieser Zeitpunkt überlebt das erneute Laden des Journals und spätere Fehler beim Timerabgleich. Der Browser hat dieses Feld bisher in `normalizeRecordings()` verworfen und deshalb alle Aufträge mit internem Status `uncertain` gleich dargestellt.

Die im Screenshot gezeigte Meldung entsteht beim Timerabgleich. Eine lesbare, aber nicht vollständig vergleichbare Timerliste erzeugt dabei keine zusätzliche Runtime-Warnung. Die Anzeigeverbesserung benötigt deshalb keine Änderung an der Protokollierung tatsächlicher Transport-, SOAP-, Parser- oder Datenbankfehler.

## Änderung

| Vorhandener Nachweis | Darstellung |
|---|---|
| Passende TV-Antwort mit gültigem Antwortzeitpunkt und konsistenten Versandangaben | **An TV übertragen**, blauer Status und sachlicher Hinweis auf den offenen automatischen Timerabgleich. |
| Kein eindeutiger Antwortnachweis nach möglichem Versand | **Übertragung unklar** mit dem bestehenden Prüfhinweis. |
| Ausdrücklich noch kein Sendversuch und keine TV-Antwort, aber ein möglicher vorhandener Timer | **Timerabgleich offen**. |
| Genau ein passender Timer wurde nachgewiesen | **Im TV geplant**. |

Die vollständige bisherige Diagnose bleibt bei übertragenen Aufträgen unter **Details zum Timerabgleich** zugänglich. Geöffnete Details werden beim regelmäßigen Aktualisieren der Auftragsliste wieder geöffnet. Die Texte und der HTML-Fallback sind auf Deutsch und Englisch abgestimmt; Textinhalte werden weiterhin über `textContent` ausgegeben.

Der interne Auftragsstatus, das Journalformat, Timerzuordnung, Warteschlange und Schutz vor erneutem Versand werden nicht verändert. Vorhandene Journale benötigen keine Migration. Die Anzeige eines übertragenen Auftrags beruht auf bereits gespeicherten Informationen und benötigt keine erneute Übertragung.

Eine passende TV-Antwort kann einen unbekannten Ergebniswert enthalten. Sie belegt deshalb keine bestätigte Timeranlage. Ebenso wird aus Start- oder Endzeit einer Sendung kein tatsächlicher Aufnahmebeginn oder erfolgreicher Aufnahmeabschluss abgeleitet.

## Prüfung und Umfang

Die Regressionen prüfen gespeicherte Aufträge mit gültigem Antwortnachweis, fehlende oder ungültige Zeitpunkte, widersprüchliche Versandangaben, ungesendete Aufträge, spätere Timerbestätigung und ausdrückliche Ablehnung. Auch bestehende Aufträge aus einer erneuten Programmauswahl und die begrenzte Auftragsanzeige werden geprüft. Diagnose, Übersetzungen und Quelldaten bleiben erhalten.

Die Änderungen an der Funktion beschränken sich auf `admin/epg.js`, `admin/epg.css` und `admin/epg.html`. `RecordingManager`, TV-Client und Adapter-Runtime bleiben auf dem bereits geprüften Stand aus 0.1.12. Versionsangaben, Installationsanleitung, Gerätebefunde und bestehende UI-Tests sind angepasst.

Im unabhängigen Code-Review wurden widersprüchliche Versandangaben und ein möglicher Wettlauf zwischen nativem Aufklappereignis und Listenaktualisierung zusätzlich berücksichtigt. Die Oberfläche verlangt konsistente Versandangaben und liest den aktuellen Zustand geöffneter Diagnoseelemente unmittelbar vor dem Ersetzen der Liste. Ein nachträgliches Ereignis eines bereits entfernten Elements verändert diesen Zustand nicht.

Ergebnisse unter **Node.js 24.19.0**:

- `npm test`: **604 Tests bestanden**, keine Fehler, übersprungenen oder abgebrochenen Tests.
- Sechs zusätzliche UI-Regressionen gegenüber dem vorherigen Stand mit 598 Tests.
- `npm run check`: Paketmetadaten, Admin-Übersetzungen, JavaScript-Syntax, 92 Objektdefinitionen und 34 XML-Vorlagen erfolgreich geprüft.
- `npm pack --dry-run`: installierbarer Paketinhalt für 0.1.13 geprüft; die geänderten Admin-Dateien und dieser Bericht sind enthalten.
- `git diff --check`: ohne Befund.

Der vorhandene GitHub-Workflow prüft veröffentlichte Änderungen auf `main` zusätzlich unter Node.js 22 und 24. Die Tests verwenden synthetische Daten und lokale Loopback-Verbindungen; ein tatsächlicher Browser- oder TV-Test wird daraus nicht abgeleitet.

## Installation und Kontrolle

Die [Installationsanleitung](INSTALLATION.md#update-auf-0113) verwendet den GitHub-Hauptzweig. Nach dem Update muss `loewe-tv.0.info.adapterBuild` den Wert **`0.1.13-recording-status.1`** anzeigen. Admin vollständig neu laden. Vorhandene Aufnahmeaufträge mit gespeicherter TV-Antwort erhalten dann die neue Darstellung.

Die ursprüngliche Gerätebestätigung entstand vor dieser Anzeigeänderung. Der Einsatz der neuen Darstellung im tatsächlichen ioBroker Admin des Nutzers bleibt nach der Veröffentlichung zu prüfen.
