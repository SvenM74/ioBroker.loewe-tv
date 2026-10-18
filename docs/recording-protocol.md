# Aufnahmeprotokoll: belegte Anfragen und Bestätigung

Der Adapter verwendet für einmalige TV-Aufnahmen die in der ursprünglichen **Loewe App 1.4.7** nachgewiesenen Aktionen `ProgramTimer` und `GetTimerList`. Die Requests werden mit den unveränderten Originalvorlagen in [protocol-templates.json](protocol-templates.json) verglichen. Ein Hardwaretest der Aufnahmefunktion und eine reale Timerantwort der Nutzergeräte stehen noch aus. Die funktionierenden EPG-Abfragen bestätigen diese Aufnahmefunktion nicht automatisch.

## Quelle und Nachvollziehbarkeit

Untersucht wurde die vom Nutzer bereitgestellte APK, insbesondere `lib/x86_64/libLoeweApp.so`:

| Artefakt | SHA-256 |
| --- | --- |
| Loewe App 1.4.7 APK | `e4b8cb245096021c6681db66e947d7d9acb2c3f947a820cce54158bcb9b9da36` |
| `lib/x86_64/libLoeweApp.so` | `4be7ca702da336a80bfd55d0703b386518649db41a300ceb56a60415b5f4a49e` |

Die folgenden Adressen beziehen sich auf diese Bibliothek. Die Requestvorlagen und ihre Extraktionsmetadaten sind im Repository gespeichert; die APK selbst wird nicht mit dem Adapter verteilt.

| Beleg | Beobachtung |
| --- | --- |
| Requestvorlage `0x34438a` | `ProgramTimer` mit `Device`, `RecordingType`, `Locator` und den Attributen `starttime`, `duration`, `repeatDays` eines `Timer`-Elements. |
| `CGame::ButtonPressed`, Aufruf bei `0xfa598` | Die App setzt `Device=PVR`, `RecordingType=default` und `repeatDays=0`; sie verwendet den Locator des ausgewählten Senders. |
| Dauerberechnung bei `0xfa456` | Die App berechnet die Dauer durch Subtraktion von Programmstart und Programmende. Die Zahlen werden mit `%d` formatiert. |
| `notifyProgramGuideFound` bei `0xef609` / `0xef634`, `SetProgramInfoView` bei `0xfe9af` / `0xfe9b4` | Die App wandelt die ISO-Zeiten mit `CNSystem::GetTimeFromISO` um und übernimmt sie in die Programmansicht. Der Aufnahmeaufruf verwendet dieselbe Zeitbasis. `GetUTCTimeInSeconds` im Programmabruf führt auf `time(NULL)`. |
| `CWidget::notifyProgramTimer`, `0xe6370` | Der untersuchte Callback gibt nur eine Debugmeldung aus. Er interpretiert keinen Ergebniscode und liefert keine Timerkennung. |
| Requestvorlage `0x34469c` | `GetTimerList` enthält außer `fcid` und `ClientId` keine weiteren Parameter. |
| SOAP-Parser bei `0x1500a4`, `0x15078d`–`0x1507bc` | Erkennung von `m:ResultTimerListFragment` mit `totalResults` und wiederholten `m:ResultTimerList`-Einträgen. |
| SOAP-Parser bei `0x1523c3`–`0x1525a2` | Erkennung der acht unten aufgeführten direkten Textfelder eines Timereintrags. |

## Einmalige Aufnahme anfragen

Der Client stellt diese Methode bereit:

```js
await client.programTimer({ locator, start, end }, { deadline, signal, canSend });
```

`start` und `end` sind UTC-Zeitpunkte in **Millisekunden seit Unix-Epoch**. Es müssen vollständige Sekunden ohne Rundung sein. `end` muss nach `start` liegen. Die Werte bleiben im durch die `%d`-Formatierung belegten vorzeichenbehafteten 32-Bit-Sekundenbereich. Der Client rechnet weder eine lokale Zeitzone hinzu noch entfernt er einen Zeitzonenversatz ein zweites Mal.

`locator` ist der vollständige, vom TV gelieferte `channel://…`-Locator des ausgewählten TV-Senders. Beispiel eines künstlichen Locators:

```xml
<Device>PVR</Device>
<RecordingType>default</RecordingType>
<Locator>channel://2:ch-fixture-tv:slc-fixture-list</Locator>
<Timer starttime="1792888200" duration="5400" repeatDays="0"/>
```

Die Felder stehen innerhalb der vorhandenen `ProgramTimer`-SOAP-Hülle mit `fcid` und `ClientId`. `starttime` ist `start / 1000`; `duration` ist `(end - start) / 1000`. Die Methode akzeptiert keine zusätzlichen Felder für andere Aufnahmeziele, Wiederholungen, Vorlauf oder Nachlauf. Für diese Varianten liegt kein geprüfter App-Ablauf vor.

Eine passende SOAP-Antwort wird so normalisiert:

```js
{
    acknowledged: true,
    confirmed: false,
    result: null // oder der unveränderte Text aus Result, falls vorhanden
}
```

**`acknowledged` besagt ausschließlich, dass eine zur Aktion passende Antwort angekommen ist.** Es bestätigt keinen gespeicherten Timer. Auch für `Result=0` ist aus dem untersuchten Callback keine Erfolgsbedeutung belegt. HTTP-Fehler, SOAP-Faults und Verbindungsfehler werden als Fehler weitergereicht. Die Schreibanfrage wird vom Client nicht automatisch wiederholt: Bei einem Timeout kann der Fernseher den Timer trotzdem bereits gespeichert haben.

### Vor dem tatsächlichen Senden erneut prüfen

`deadline` ist optional eine absolute Frist in Epoch-Millisekunden. `signal` ist optional ein `AbortSignal`. `canSend` ist optional eine **synchrone** Funktion, die nur mit dem booleschen Wert `true` das Senden erlaubt. Die Runtime kann damit etwa einen zwischenzeitlich abgewählten Sender, einen stornierten Auftrag oder eine geänderte EPG-Referenz erkennen. Diese Bedingungen werden vor der Anmeldung und nochmals unmittelbar vor der Übergabe des SOAP-Bodys an HTTP geprüft, nachdem `RequestAccess` abgeschlossen ist.

Vorher abgelaufene, abgebrochene oder ungültig gewordene Aufträge senden keinen Aufnahmebefehl. Solche Fehler haben `recordingNotSent=true`, ebenso lokale Validierungsfehler. Sobald die Übergabe des HTTP-Bodys begonnen hat, wird dieses Kennzeichen nicht mehr gesetzt; selbst eine anschließende lokale Unterbrechung ist dann ein unklarer Schreibversuch. Die Guard-Fehlercodes lauten `CANCELLED` beziehungsweise `STALE_COMMAND`; Frist- und Transportfehler bleiben mit den vorhandenen Fehlercodes kompatibel.

Die gleichen optionalen Guards gelten für `client.zap(locator, options)`, damit eine in der Programmvorschau gewählte laufende Sendung nach einer verzögerten Anmeldung nicht erst nach ihrem Ende eingeschaltet wird. Bestehende Fernbedienungsaufrufe ohne Guards behalten ihr Verhalten.

## Timerliste abfragen und auswerten

```js
const snapshot = await client.getTimerList({ deadline });
```

Die Anfrage verwendet nur `fcid` und `ClientId`. Der Parser erwartet einen eindeutigen `GetTimerListResponse` mit `ResultTimerListFragment` und dessen `ResultTimerList`-Einträgen. XML-Namensräume werden wie bei den bestehenden SOAP-Aktionen entfernt. Ein Timereintrag enthält diese belegten Felder:

| Antwortfeld | Normalisiertes Feld | Behandlung |
| --- | --- | --- |
| `EntryUuid` | `id` | Unveränderte Timerkennung. Doppelte nichtleere Kennungen machen die Antwort unbrauchbar. |
| `EntryTitle` | `title` | Titel zur Anzeige; kein Identitätsbeleg. |
| `Start` | `startRaw`, `start` | Originaltext und, falls eindeutig, UTC-Millisekunden. |
| `End` | `endRaw`, `end` | Originaltext und, falls eindeutig, UTC-Millisekunden. |
| `Attributes` | `attributes` | Unveränderter Text. Die Bedeutung der Flags ist nicht belegt. |
| `SourceName` | `sourceName` | Sendername zur Anzeige; kein Identitätsbeleg. |
| `SourceUuid` | `sourceUuid` | Unveränderte Senderkennung. Ihr konkretes Format muss eine echte TV-Antwort bestätigen. |
| `SourceAncestorUuid` | `sourceAncestorUuid` | Unveränderte Kennung der übergeordneten Quelle/Senderliste. |

Ein normalisierter Snapshot hat die Form:

```js
{
    recognized: true,
    complete: true,
    comparable: true,
    totalResults: 1,
    returnedResults: 1,
    startIndex: null,
    timers: [{
        id, title, start, end, startRaw, endRaw,
        attributes, sourceName, sourceUuid, sourceAncestorUuid,
        matchable: true
    }],
    result: null
}
```

`complete` ist nur wahr, wenn `totalResults` vorhanden ist und genau der Anzahl empfangener Einträge entspricht; ein vorhandener `startIndex` muss dabei `0` sein. Fehlt das Attribut `startIndex`, bleibt der normalisierte Wert `null`; das beeinträchtigt eine ansonsten vollständige Antwort nicht. Falls `returnedResults` oder `startIndex` in der Antwort vorkommen, prüft der Parser ihre Konsistenz. Ohne `returnedResults` wird die tatsächlich empfangene Anzahl verwendet. Eine fehlende Gesamtzahl wird nicht ergänzt.

`matchable` setzt eine nichtleere Timerkennung, eine nichtleere `SourceUuid` und eindeutige, aufsteigend geordnete Start-/Endzeitpunkte voraus. Der Aufrufer muss die Senderidentität selbst exakt gegen den beauftragten Sender prüfen. `comparable` ist nur bei einer vollständigen Liste mit ausschließlich solchen Einträgen wahr. Eine nur teilweise gelieferte oder unverständliche Liste reicht nicht aus, um das Fehlen eines Timers festzustellen.

### Zeitformat bewusst begrenzen

Die App erkennt `Start` und `End`; eine echte Antwort mit deren Format liegt bisher nicht vor. Der Parser verarbeitet deshalb ausschließlich gültige ISO-Zeitpunkte mit explizitem `Z` oder einem Versatz wie `+01:00`. Bis zu drei Nachkommastellen werden verlustfrei übernommen. Ungültige Kalenderdaten, fehlende Zeitzonen, `-00:00` als unbekannter Versatz und numerische Zeitstrings werden als Rohtext erhalten und ergeben `start=null` beziehungsweise `end=null`. Es gibt keine automatische Vermutung, ob eine Zahl Sekunden oder Millisekunden bezeichnet.

Sollte der Fernseher ein anderes Format liefern, ist dessen Zeitbasis anhand einer vorhandenen, am TV manuell angelegten Aufnahme zu prüfen. Erst danach kann der Parser um dieses belegte Format ergänzt werden.

## Eindeutige Zuordnung und Grenzen

Zur Bestätigung eines Auftrags müssen Start und Ende sowie die Senderidentität übereinstimmen. Ein gleicher Titel oder Sendername allein genügt nicht. Die Queue kann `SourceUuid` exakt mit der bekannten `mediaItemUuid` vergleichen. Ist `SourceUuid` stattdessen eine `ch-…`-Kennung aus dem Locator, muss zusätzlich `SourceAncestorUuid` exakt zur `slc-…`-Komponente dieses Locators passen. Eine vorhandene widersprüchliche übergeordnete Kennung darf nicht ignoriert werden. Listenansichten mit einem Präfix wie `fastscan` werden nicht automatisch in eine andere Kennung umgeschrieben.

Eine passende Timerkennung bestätigt die **Existenz des Timers**. Sie bestätigt weder genügend Speicherplatz noch Empfang, Konfliktfreiheit oder eine später erfolgreich abgeschlossene Aufnahme. Unklare Antwortcodes und unbekannte `Attributes` werden nicht in solche Aussagen übersetzt. Mehrdeutige Einträge oder unklare Übertragungsergebnisse erfordern weiteren Abgleich; sie lösen keinen erneuten Schreibversuch aus.

## Automatisierte Prüfung

[recording-protocol.test.js](../test/recording-protocol.test.js) prüft die Requests gegen die extrahierten Originalvorlagen, Zeitumrechnung über den Wechsel von Sommer- zu Winterzeit, ungültige Eingaben, vollständige und unvollständige Timerlisten, uneindeutige Zeiten, fremde SOAP-Antworten und das Ausbleiben automatischer Schreibwiederholungen nach einem Timeout. Die Timerantworten dieser Tests sind ausdrücklich synthetische Protokollfälle und ersetzen keinen Test am Gerät.
