import { google, calendar_v3 } from "googleapis";
import { config } from "./config.js";
import { localToDate } from "./time.js";

const auth = new google.auth.OAuth2(config.google.clientId, config.google.clientSecret);
auth.setCredentials({ refresh_token: config.google.refreshToken });
const api = google.calendar({ version: "v3", auth });
const calendarId = config.google.calendarId;

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
}

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  const allDay = !e.start?.dateTime;
  const start = allDay ? localToDate(e.start!.date!) : new Date(e.start!.dateTime!);
  const end = allDay ? localToDate(e.end!.date!) : new Date(e.end!.dateTime!);
  return {
    id: e.id,
    title: e.summary || "(ohne Titel)",
    start,
    end,
    allDay,
    location: e.location || undefined,
    description: e.description?.slice(0, 500) || undefined,
  };
}

export async function listEvents(from: Date, to: Date, query?: string): Promise<CalendarEvent[]> {
  const res = await api.events.list({
    calendarId,
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
    q: query || undefined,
  });
  return (res.data.items ?? []).map(toEvent).filter((e): e is CalendarEvent => e !== null);
}

function timeField(local: string, allDay: boolean): calendar_v3.Schema$EventDateTime {
  return allDay ? { date: local.slice(0, 10) } : { dateTime: `${local.slice(0, 16)}:00`, timeZone: config.timezone };
}

export async function createEvent(input: {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description?: string;
}): Promise<CalendarEvent> {
  const res = await api.events.insert({
    calendarId,
    requestBody: {
      summary: input.title,
      start: timeField(input.start, !!input.allDay),
      end: timeField(input.end, !!input.allDay),
      location: input.location,
      description: input.description,
    },
  });
  return toEvent(res.data)!;
}

export async function updateEvent(
  id: string,
  changes: { title?: string; start?: string; end?: string; location?: string; description?: string },
): Promise<CalendarEvent> {
  const current = await api.events.get({ calendarId, eventId: id });
  const allDay = !current.data.start?.dateTime;
  const body: calendar_v3.Schema$Event = {};
  if (changes.title !== undefined) body.summary = changes.title;
  if (changes.location !== undefined) body.location = changes.location;
  if (changes.description !== undefined) body.description = changes.description;
  if (changes.start !== undefined) body.start = timeField(changes.start, allDay);
  if (changes.end !== undefined) {
    body.end = timeField(changes.end, allDay);
  } else if (changes.start !== undefined && !allDay) {
    // Nur verschoben: Dauer beibehalten
    const old = toEvent(current.data)!;
    const newStart = localToDate(changes.start);
    const newEnd = new Date(newStart.getTime() + (old.end.getTime() - old.start.getTime()));
    body.end = { dateTime: newEnd.toISOString(), timeZone: config.timezone };
  }
  const res = await api.events.patch({ calendarId, eventId: id, requestBody: body });
  return toEvent(res.data)!;
}

export async function deleteEvent(id: string): Promise<void> {
  await api.events.delete({ calendarId, eventId: id });
}
