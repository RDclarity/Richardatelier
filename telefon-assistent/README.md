# Telefon-Assistent

Ein persönlicher Assistent, den du **anrufen** kannst und der **dich anruft**.

- **Du rufst an** → du sprichst ganz normal mit ihm: „Was steht morgen an?“, „Verschieb das Aufmaß bei Maier auf Donnerstag 14 Uhr“, „Trag mir Freitag um 9 einen Termin mit dem Fliesenleger ein“, „Ruf mich in zwei Stunden an und erinnere mich an das Angebot für Schmidt“.
- **Er ruft dich an**
  - 15 Minuten vor jedem Termin (einstellbar),
  - morgens mit dem Tagesüberblick (z. B. 7:30 Uhr, nur an Tagen mit Terminen),
  - zu Erinnerungen, die du ihm am Telefon aufgetragen hast.
  - Gehst du nicht ran, versucht er es nach 3 Minuten erneut (bis zu 3 Versuche).
- **Sicher:** Er nimmt nur Anrufe von deiner Handynummer an, optional zusätzlich mit PIN. Bevor er etwas im Kalender ändert, liest er es dir vor und fragt nach.

## So funktioniert es

```
Dein Handy ──Anruf──▶ Twilio-Nummer ──▶ dieser Server ──▶ Claude (versteht & antwortet)
                         ▲  Sprache ⇄ Text              └──▶ Google Kalender
                         └──── Erinnerungsanrufe ◀── Planer (prüft alle 30 Sek. den Kalender)
```

Twilio übernimmt das Telefonieren, die Spracherkennung und die Sprachausgabe (ConversationRelay). Claude führt das Gespräch und bedient den Kalender. Der Server läuft dauerhaft, damit er Anrufe annehmen und rechtzeitig anrufen kann.

## Laufende Kosten (grob)

| Posten | Kosten |
|---|---|
| Twilio deutsche Telefonnummer | ca. 1–3 € / Monat (für deutsche Nummern verlangt Twilio einen Adressnachweis) |
| Twilio Gesprächsminuten inkl. Sprache ⇄ Text | ca. 0,10–0,15 € / Minute |
| Claude API | wenige Cent pro Gespräch |
| Hosting (Railway o. ä.) | ca. 5 € / Monat |

## Einrichtung (ca. 30–45 Minuten)

### 1. Claude API-Schlüssel
Auf <https://console.anthropic.com> ein Konto anlegen, Guthaben aufladen und unter **API Keys** einen Schlüssel erstellen → `ANTHROPIC_API_KEY`.

### 2. Google Kalender freigeben
1. <https://console.cloud.google.com> → neues Projekt anlegen.
2. **APIs & Dienste → Bibliothek** → „Google Calendar API“ aktivieren.
3. **OAuth-Zustimmungsbildschirm**: Typ „Extern“, deine eigene E-Mail als **Testnutzer** eintragen. Danach **„App veröffentlichen“** klicken, sonst läuft der Zugang nach 7 Tagen ab. Die Warnung „nicht verifiziert“ beim Anmelden kannst du dann bestätigen, denn es ist ja deine eigene App.
4. **Anmeldedaten → OAuth-Client-ID erstellen** → Typ „Desktop-App“ → `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` notieren.
5. Auf deinem Rechner (Node.js 20+ nötig):
   ```bash
   cd telefon-assistent
   npm install
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth
   ```
   Den Link öffnen, mit dem Google-Konto anmelden, dessen Kalender genutzt werden soll. Der ausgegebene `GOOGLE_REFRESH_TOKEN` kommt in die Konfiguration.

### 3. Twilio-Nummer
1. Konto auf <https://www.twilio.com> anlegen (Testguthaben reicht zum Ausprobieren, für Anrufe an deine echte Nummer musst du sie im Testmodus als „Verified Caller ID“ bestätigen).
2. **Phone Numbers → Buy a number** → Deutschland, „Voice“. Das ist die Nummer deines Assistenten → `TWILIO_PHONE_NUMBER`.
3. `Account SID` und `Auth Token` von der Startseite der Konsole → `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.

### 4. Server starten (Railway)
1. Auf <https://railway.app> **New Project → Deploy from GitHub repo** → dieses Repo wählen, als **Root Directory** `telefon-assistent` eintragen. Railway erkennt das `Dockerfile`.
2. **Settings → Networking → Generate Domain** → z. B. `https://dein-assistent.up.railway.app` → `PUBLIC_BASE_URL`.
3. **Volume** hinzufügen, eingehängt unter `/data`. Dort merkt sich der Assistent seine Erinnerungen, damit sie einen Neustart überstehen.
4. Unter **Variables** alle Werte aus [`.env.example`](.env.example) eintragen (mindestens die ohne Standardwert).

### 5. Twilio mit dem Server verbinden
Twilio-Konsole → **Phone Numbers → deine Nummer → Voice Configuration**:
**A call comes in** → Webhook → `https://dein-assistent.up.railway.app/voice/incoming` → **HTTP POST** → Speichern.

### 6. Ausprobieren
- Ruf die Twilio-Nummer von deinem Handy an. Er meldet sich mit „Hallo Richard, was kann ich für dich tun?“
- Sag: „Ruf mich in zwei Minuten an und erinnere mich an den Test.“ Dann leg auf und warte auf den Anruf.

## Einstellungen

Alle Einstellungen stehen in [`.env.example`](.env.example). Die wichtigsten:

| Variable | Bedeutung |
|---|---|
| `REMINDER_MINUTES_BEFORE` | Wie viele Minuten vor einem Termin er anruft (Standard 15) |
| `MORNING_BRIEFING_TIME` | Uhrzeit des Tagesüberblicks, leer = aus |
| `MORNING_BRIEFING_WEEKDAYS_ONLY` | Am Wochenende kein Tagesüberblick |
| `SKIP_KEYWORDS` | Termine mit diesen Wörtern im Titel lösen keinen Anruf aus. Ganztägige Termine lösen nie einen Anruf aus. |
| `ACCESS_PIN` | Zusätzliche PIN beim Anrufen (sagen oder eintippen) |
| `TTS_PROVIDER` / `TTS_VOICE` | Stimme, z. B. `Google` + `de-DE-Neural2-B` (männlich) oder `de-DE-Neural2-C` (weiblich); auch `ElevenLabs` ist möglich |

## Lokal entwickeln

```bash
cp .env.example .env    # ausfüllen
npm install
npm run dev
# Für Twilio muss der Server öffentlich erreichbar sein, z. B. mit: ngrok http 3000
# und PUBLIC_BASE_URL auf die ngrok-Adresse setzen.
```

## Gut zu wissen

- **Mailbox:** Springt bei einem Erinnerungsanruf deine Mailbox an, gilt die Erinnerung als zugestellt. Die Begrüßung mit dem Termin landet dann auf der Mailbox.
- **Mehrere Erinnerungen gleichzeitig** werden zu einem Anruf zusammengefasst.
- **Anderer Kalender** (Outlook/Microsoft 365, iCloud): Dafür muss nur `src/calendar.ts` ausgetauscht werden, der Rest bleibt gleich.
- **Code ist öffentlich sichtbar:** Dieser Ordner liegt im Website-Repo. Er enthält keine Zugangsdaten, die stehen ausschließlich in den Umgebungsvariablen. Lege niemals eine ausgefüllte `.env` ins Repo.
