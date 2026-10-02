import twilio from "twilio";
import { config, wsUrl } from "./config.js";

export const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);

/** CallSids, die mit dem WebSocket sprechen dürfen (geprüfter eingehender Anruf oder eigener Anruf). */
export const authorizedCalls = new Map<string, { reminderId?: string; needsPin: boolean; greeting: string }>();

export function normalizePhone(n: string | undefined): string {
  return (n ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");
}

export function isOwner(from: string | undefined): boolean {
  return normalizePhone(from) === normalizePhone(config.ownerPhone);
}

/** TwiML, das den Anruf an den Sprach-Assistenten (ConversationRelay) übergibt. */
export function relayTwiml(greeting: string, params: Record<string, string> = {}): string {
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  const relay = connect.conversationRelay({
    url: wsUrl,
    language: "de-DE",
    welcomeGreeting: greeting,
    ttsProvider: config.twilio.ttsProvider,
    ...(config.twilio.voice ? { voice: config.twilio.voice } : {}),
    transcriptionProvider: config.twilio.transcriptionProvider,
    interruptible: "any",
    dtmfDetection: true,
  });
  for (const [name, value] of Object.entries(params)) relay.parameter({ name, value });
  response.hangup();
  return response.toString();
}

export function rejectTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ language: "de-DE" }, "Dieser Anschluss ist leider nicht erreichbar.");
  response.hangup();
  return response.toString();
}

/** Prüft die Twilio-Signatur eines Webhooks. */
export function validTwilioRequest(signature: string | undefined, path: string, params: Record<string, string>) {
  if (!signature) return false;
  return twilio.validateRequest(config.twilio.authToken, signature, config.publicBaseUrl + path, params);
}

/** Ruft den Besitzer an und startet ein Gespräch mit der gegebenen Begrüßung. */
export async function callOwner(reminderId: string, greeting: string): Promise<string> {
  const call = await twilioClient.calls.create({
    to: config.ownerPhone,
    from: config.twilio.phoneNumber,
    twiml: relayTwiml(greeting, { reminderId }),
    timeout: 30,
    statusCallback: `${config.publicBaseUrl}/voice/status?reminderId=${encodeURIComponent(reminderId)}`,
    statusCallbackMethod: "POST",
  });
  authorizedCalls.set(call.sid, { reminderId, needsPin: false, greeting });
  return call.sid;
}
