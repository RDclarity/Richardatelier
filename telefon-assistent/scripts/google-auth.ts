/**
 * Einmalig ausführen, um den GOOGLE_REFRESH_TOKEN zu erhalten:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth
 * Dann den angezeigten Link im Browser öffnen und mit dem Google-Konto anmelden, dessen Kalender genutzt werden soll.
 */
import "dotenv/config";
import http from "node:http";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Bitte GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET setzen (in .env oder als Umgebungsvariable).");
  process.exit(1);
}

const port = 53682;
const redirectUri = `http://localhost:${port}/callback`;
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"],
});

http
  .createServer(async (req, res) => {
    const code = new URL(req.url ?? "", redirectUri).searchParams.get("code");
    if (!code) return res.end("Kein Code erhalten.");
    const { tokens } = await oauth.getToken(code);
    res.end("Fertig! Du kannst dieses Fenster schließen und zurück ins Terminal gehen.");
    console.log("\nTrag das in deine .env bzw. bei Railway ein:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    process.exit(0);
  })
  .listen(port, () => {
    console.log("Öffne diesen Link im Browser und erlaube den Kalenderzugriff:\n");
    console.log(url + "\n");
  });
