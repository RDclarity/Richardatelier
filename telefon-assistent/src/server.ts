import Fastify from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { config } from "./config.js";
import { Conversation } from "./assistant.js";
import { store } from "./store.js";
import { handleCallStatus, startScheduler } from "./scheduler.js";
import { authorizedCalls, isOwner, rejectTwiml, relayTwiml, validTwilioRequest } from "./telephony.js";

const app = Fastify({ logger: { level: "info" } });
await app.register(formbody);
await app.register(websocket);

type TwilioParams = Record<string, string>;

app.get("/", async () => ({ status: "ok", name: "telefon-assistent" }));

/** Eingehender Anruf auf der Twilio-Nummer */
app.post("/voice/incoming", async (req, reply) => {
  const params = req.body as TwilioParams;
  reply.type("text/xml");
  if (!validTwilioRequest(req.headers["x-twilio-signature"] as string, req.url, params)) {
    req.log.warn("Ungültige Twilio-Signatur");
    return reply.code(403).send();
  }
  if (!isOwner(params.From)) {
    req.log.warn(`Anruf von fremder Nummer abgelehnt: ${params.From}`);
    return rejectTwiml();
  }
  const needsPin = !!config.accessPin;
  const greeting = needsPin
    ? "Hallo! Bitte sag oder tippe deine PIN."
    : `Hallo ${config.ownerName}, was kann ich für dich tun?`;
  authorizedCalls.set(params.CallSid, { needsPin, greeting });
  return relayTwiml(greeting);
});

/** Status-Rückmeldung zu ausgehenden Erinnerungsanrufen */
app.post("/voice/status", async (req, reply) => {
  const params = req.body as TwilioParams;
  if (!validTwilioRequest(req.headers["x-twilio-signature"] as string, req.url, params)) return reply.code(403).send();
  const reminderId = (req.query as Record<string, string>).reminderId;
  authorizedCalls.delete(params.CallSid);
  if (reminderId) handleCallStatus(reminderId, params.CallStatus);
  return reply.code(204).send();
});

/** Sprachverbindung von Twilio ConversationRelay */
app.register(async (scope) => {
  scope.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    let conversation: Conversation | undefined;
    let callSid = "";
    let locked = false;
    let pinAttempts = 0;
    let dtmfBuffer = "";
    let spokenThisTurn = "";
    let hangupTimer: NodeJS.Timeout | undefined;

    const send = (msg: object) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(msg));
    const say = (text: string) => send({ type: "text", token: text, last: true });
    const endCall = (afterText: string) => {
      // Warten, bis die Verabschiedung vorgelesen wurde (grob 70 ms pro Zeichen)
      clearTimeout(hangupTimer);
      hangupTimer = setTimeout(() => send({ type: "end" }), 1500 + afterText.length * 70);
    };

    const checkPin = (candidate: string) => {
      if (candidate === config.accessPin) {
        locked = false;
        say(`Danke ${config.ownerName}. Was kann ich für dich tun?`);
        return;
      }
      pinAttempts++;
      if (pinAttempts >= 3) {
        say("Die PIN war leider falsch. Auf Wiederhören.");
        endCall("Die PIN war leider falsch. Auf Wiederhören.");
      } else {
        say("Das hat nicht gepasst. Bitte nochmal.");
      }
    };

    socket.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "setup": {
          callSid = msg.callSid;
          const auth = authorizedCalls.get(callSid);
          if (!auth) {
            req.log.warn(`WebSocket für unbekannten Anruf ${callSid} abgelehnt`);
            send({ type: "end" });
            socket.close();
            return;
          }
          locked = auth.needsPin;
          const reminder = auth.reminderId ? store.getReminder(auth.reminderId) : undefined;
          conversation = new Conversation(
            { greeting: auth.greeting, reminderContext: reminder?.context },
            (token, last) => {
              if (token) spokenThisTurn += token;
              send({ type: "text", token, last });
              if (last && conversation?.wantsHangup) endCall(spokenThisTurn);
            },
          );
          req.log.info(`Gespräch gestartet (${auth.reminderId ? "Erinnerung " + auth.reminderId : "eingehend"})`);
          break;
        }

        case "prompt": {
          if (!conversation || !msg.voicePrompt?.trim()) return;
          req.log.info(`Nutzer: ${msg.voicePrompt}`);
          if (locked) return checkPin(String(msg.voicePrompt).replace(/\D/g, ""));
          clearTimeout(hangupTimer);
          conversation.wantsHangup = false;
          spokenThisTurn = "";
          conversation.handleUserText(msg.voicePrompt);
          break;
        }

        case "interrupt":
          if (!locked) conversation?.interrupt(msg.utteranceUntilInterrupt);
          break;

        case "dtmf":
          if (!locked) return;
          if (msg.digit === "#") {
            checkPin(dtmfBuffer);
            dtmfBuffer = "";
          } else {
            dtmfBuffer += msg.digit;
            if (dtmfBuffer.length === config.accessPin.length) {
              checkPin(dtmfBuffer);
              dtmfBuffer = "";
            }
          }
          break;

        case "error":
          req.log.error(`ConversationRelay-Fehler: ${msg.description}`);
          break;
      }
    });

    socket.on("close", () => {
      clearTimeout(hangupTimer);
      conversation?.interrupt();
      // Eingehende Anrufe: Freigabe entfernen (ausgehende werden im Status-Callback entfernt)
      if (callSid && !authorizedCalls.get(callSid)?.reminderId) authorizedCalls.delete(callSid);
      req.log.info("Gespräch beendet");
    });
  });
});

await app.listen({ port: config.port, host: "0.0.0.0" });
startScheduler();
app.log.info(`Telefon-Assistent läuft auf Port ${config.port} – Twilio-Webhook: ${config.publicBaseUrl}/voice/incoming`);
