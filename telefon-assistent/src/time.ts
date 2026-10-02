import { config } from "./config.js";

const tz = () => config.timezone;

/** Offset der Zeitzone zu einem Zeitpunkt in Minuten (z. B. +120 für MESZ). */
function offsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** "2026-10-03T10:00" (Ortszeit) -> Date */
export function localToDate(local: string): Date {
  const normalized = local.length === 10 ? `${local}T00:00` : local;
  const naiveUtc = new Date(normalized.replace(/(Z|[+-]\d\d:\d\d)$/, "") + "Z");
  if (Number.isNaN(naiveUtc.getTime())) throw new Error(`Ungültiges Datum: ${local}`);
  if (/(Z|[+-]\d\d:\d\d)$/.test(local)) return new Date(local);
  const guess = new Date(naiveUtc.getTime() - offsetMinutes(naiveUtc, tz()) * 60000);
  return new Date(naiveUtc.getTime() - offsetMinutes(guess, tz()) * 60000);
}

/** Date -> "2026-10-03T10:00" in Ortszeit */
export function dateToLocal(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz(),
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function localDay(date: Date): string {
  return dateToLocal(date).slice(0, 10);
}

export function localTime(date: Date): string {
  return dateToLocal(date).slice(11, 16);
}

export function weekday(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz(), weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Lesbar für die Sprachausgabe, z. B. "Samstag, 3. Oktober 2026, 10:00 Uhr" */
export function spokenDateTime(date: Date): string {
  return (
    new Intl.DateTimeFormat("de-DE", {
      timeZone: tz(),
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date) + " Uhr"
  );
}

/** Mitternacht (Ortszeit) des Tages, zu dem `date` gehört, plus `addDays` Tage */
export function startOfLocalDay(date: Date, addDays = 0): Date {
  const [y, m, d] = localDay(date).split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + addDays));
  return localToDate(shifted.toISOString().slice(0, 10));
}
