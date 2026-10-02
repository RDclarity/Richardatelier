import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example)`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  publicBaseUrl: required("PUBLIC_BASE_URL").replace(/\/$/, ""),
  port: Number(optional("PORT", "3000")),
  timezone: optional("TIMEZONE", "Europe/Berlin"),
  ownerName: optional("OWNER_NAME", "Chef"),
  ownerPhone: required("OWNER_PHONE"),
  accessPin: optional("ACCESS_PIN"),

  twilio: {
    accountSid: required("TWILIO_ACCOUNT_SID"),
    authToken: required("TWILIO_AUTH_TOKEN"),
    phoneNumber: required("TWILIO_PHONE_NUMBER"),
    ttsProvider: optional("TTS_PROVIDER", "Google"),
    voice: optional("TTS_VOICE"),
    transcriptionProvider: optional("TRANSCRIPTION_PROVIDER", "Deepgram"),
  },

  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    refreshToken: required("GOOGLE_REFRESH_TOKEN"),
    calendarId: optional("GOOGLE_CALENDAR_ID", "primary"),
  },

  reminders: {
    minutesBefore: Number(optional("REMINDER_MINUTES_BEFORE", "15")),
    morningBriefingTime: optional("MORNING_BRIEFING_TIME"),
    morningBriefingWeekdaysOnly: optional("MORNING_BRIEFING_WEEKDAYS_ONLY", "true") === "true",
    maxAttempts: Number(optional("MAX_CALL_ATTEMPTS", "3")),
    retryAfterMinutes: Number(optional("RETRY_AFTER_MINUTES", "3")),
    skipKeywords: optional("SKIP_KEYWORDS")
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
  },

  dataDir: optional("DATA_DIR", "./data"),
};

export const wsUrl = config.publicBaseUrl.replace(/^http/, "ws") + "/ws";
