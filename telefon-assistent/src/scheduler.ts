import { config } from "./config.js";
import { listEvents, CalendarEvent } from "./calendar.js";
import { store, Reminder } from "./store.js";
import { callOwner } from "./telephony.js";
import { localDay, localTime, localToDate, spokenDateTime, startOfLocalDay, weekday } from "./time.js";

const TICK_MS = 30_000;

function shouldSkip(e: CalendarEvent): boolean {
  const text = `${e.title} ${e.description ?? ""}`.toLowerCase();
  return e.allDay || config.reminders.skipKeywords.some((k) => text.includes(k));
}

function timeSpoken(d: Date): string {
  const [h, m] = localTime(d).split(":").map(Number);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

/** Kalendertermine, deren Erinnerungszeit erreicht ist, als Erinnerung einplanen. */
async function planEventReminders(now: Date) {
  const lead = config.reminders.minutesBefore;
  const events = await listEvents(now, new Date(now.getTime() + (lead + 5) * 60_000));
  for (const e of events) {
    if (shouldSkip(e)) continue;
    const key = `termin:${e.id}@${e.start.toISOString()}`;
    const callAt = new Date(e.start.getTime() - lead * 60_000);
    if (store.isPlanned(key) || callAt > now || e.start <= now) continue;

    const minutes = Math.max(1, Math.round((e.start.getTime() - now.getTime()) / 60_000));
    const where = e.location ? ` Ort: ${e.location}.` : "";
    store.upsertReminder({
      id: key,
      callAt: now.toISOString(),
      greeting: `Hallo ${config.ownerName}, kurze Erinnerung: In ${minutes} Minuten, um ${timeSpoken(e.start)}, hast du: ${e.title}.${where}`,
      context: `Du erinnerst an den Termin "${e.title}" am ${spokenDateTime(e.start)}${e.location ? ` in ${e.location}` : ""}${
        e.description ? `. Notiz zum Termin: ${e.description}` : ""
      }.`,
      kind: "termin",
      attempts: 0,
      status: "offen",
    });
    store.markPlanned(key);
  }
}

/** Morgendlicher Tagesüberblick */
async function planMorningBriefing(now: Date) {
  const time = config.reminders.morningBriefingTime;
  if (!/^\d{1,2}:\d{2}$/.test(time)) return;
  const day = localDay(now);
  const key = `tagesueberblick:${day}`;
  if (store.isPlanned(key)) return;
  const wd = weekday(now);
  if (config.reminders.morningBriefingWeekdaysOnly && (wd === 0 || wd === 6)) return;

  const due = localToDate(`${day}T${time.padStart(5, "0")}`);
  // Nur im Fenster von einer Stunde nach der Uhrzeit (kein Nachholen am Nachmittag nach einem Neustart)
  if (now < due || now.getTime() - due.getTime() > 60 * 60_000) return;
  const events = (await listEvents(startOfLocalDay(now), startOfLocalDay(now, 1))).filter((e) => e.end > now);
  store.markPlanned(key);
  if (events.length === 0) return; // Keine Termine – kein Anruf

  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);
  const parts: string[] = [];
  if (timed.length) {
    parts.push(
      `Heute hast du ${timed.length === 1 ? "einen Termin" : `${timed.length} Termine`}: ` +
        timed.map((e) => `um ${timeSpoken(e.start)} ${e.title}`).join(", ") +
        ".",
    );
  }
  if (allDay.length) parts.push(`Ganztägig: ${allDay.map((e) => e.title).join(", ")}.`);

  store.upsertReminder({
    id: key,
    callAt: now.toISOString(),
    greeting: `Guten Morgen ${config.ownerName}! ${parts.join(" ")} Möchtest du noch etwas wissen oder ändern?`,
    context: `Du rufst morgens mit dem Tagesüberblick an. Die Termine von heute:\n${events
      .map((e) => `- ${e.allDay ? "ganztägig" : localTime(e.start) + "–" + localTime(e.end)} ${e.title}${e.location ? ` (${e.location})` : ""}`)
      .join("\n")}`,
    kind: "tagesueberblick",
    attempts: 0,
    status: "offen",
  });
}

let callInProgress = false;

/** Fällige Erinnerungen anrufen – immer nur einen Anruf gleichzeitig. */
async function placeDueCalls(now: Date) {
  // Anrufe ohne Rückmeldung von Twilio nach 30 Minuten abschließen
  for (const r of store.allReminders())
    if (r.status === "laeuft" && now.getTime() - Date.parse(r.callAt) > 30 * 60_000) store.upsertReminder({ ...r, status: "erledigt" });

  const all = store.allReminders();
  if (callInProgress || all.some((r) => r.status === "laeuft")) return;
  const due = all
    .filter((r) => r.status === "offen" && new Date(r.callAt) <= now)
    .sort((a, b) => a.callAt.localeCompare(b.callAt));
  const next = due[0];
  if (!next) return;

  callInProgress = true;
  try {
    // Mehrere fällige Erinnerungen zu einem Anruf zusammenfassen
    const bundled = due.slice(1);
    const reminder: Reminder = { ...next, callAt: now.toISOString(), attempts: next.attempts + 1, status: "laeuft" };
    if (bundled.length) {
      reminder.greeting += " Außerdem: " + bundled.map((r) => r.greeting.replace(/^Hallo [^,]*, (kurze Erinnerung: )?/i, "")).join(" ");
      reminder.context += "\n" + bundled.map((r) => r.context).join("\n");
      for (const r of bundled) store.upsertReminder({ ...r, status: "erledigt" });
    }
    reminder.lastCallSid = await callOwner(reminder.id, reminder.greeting);
    store.upsertReminder(reminder);
    console.log(`[anruf] ${reminder.kind} ${reminder.id} (Versuch ${reminder.attempts})`);
  } catch (err) {
    console.error("[anruf] fehlgeschlagen:", err);
    store.upsertReminder({ ...next, attempts: next.attempts + 1, callAt: retryTime(now) });
  } finally {
    callInProgress = false;
  }
}

function retryTime(now = new Date()): string {
  return new Date(now.getTime() + config.reminders.retryAfterMinutes * 60_000).toISOString();
}

/** Ergebnis eines Erinnerungsanrufs (Twilio-Status-Callback). */
export function handleCallStatus(reminderId: string, callStatus: string) {
  const r = store.getReminder(reminderId);
  if (!r) return;
  if (callStatus === "completed") {
    store.upsertReminder({ ...r, status: "erledigt" });
  } else if (r.attempts < config.reminders.maxAttempts) {
    console.log(`[anruf] ${reminderId}: ${callStatus} – neuer Versuch in ${config.reminders.retryAfterMinutes} Min.`);
    store.upsertReminder({ ...r, status: "offen", callAt: retryTime() });
  } else {
    console.log(`[anruf] ${reminderId}: ${callStatus} – aufgegeben`);
    store.upsertReminder({ ...r, status: "fehlgeschlagen" });
  }
}

export function startScheduler() {
  // Nach einem Neustart hängengebliebene Anrufe wieder freigeben
  for (const r of store.allReminders()) if (r.status === "laeuft") store.upsertReminder({ ...r, status: "offen" });

  const tick = async () => {
    const now = new Date();
    try {
      await planEventReminders(now);
      await planMorningBriefing(now);
      await placeDueCalls(now);
    } catch (err) {
      console.error("[planer] Fehler:", err);
    }
  };
  tick();
  setInterval(tick, TICK_MS);
  setInterval(() => store.cleanup(), 6 * 3600_000);
}
