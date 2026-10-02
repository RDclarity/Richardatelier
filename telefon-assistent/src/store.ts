import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/** Eine geplante Erinnerung, die per Anruf zugestellt wird. */
export interface Reminder {
  id: string;
  /** Zeitpunkt des Anrufs (ISO) */
  callAt: string;
  /** Was der Assistent zur Begrüßung sagt */
  greeting: string;
  /** Hintergrund für das Gespräch danach */
  context: string;
  kind: "termin" | "tagesueberblick" | "manuell";
  attempts: number;
  status: "offen" | "laeuft" | "erledigt" | "fehlgeschlagen";
  lastCallSid?: string;
}

interface State {
  reminders: Record<string, Reminder>;
  /** Schlüssel bereits eingeplanter Kalender-Erinnerungen, damit nichts doppelt angerufen wird */
  planned: Record<string, string>;
}

const file = path.join(config.dataDir, "state.json");
let state: State = { reminders: {}, planned: {} };

try {
  state = { ...state, ...JSON.parse(fs.readFileSync(file, "utf8")) };
} catch {
  // Erster Start – noch kein Zustand vorhanden
}

function save() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(state, null, 2));
  fs.renameSync(file + ".tmp", file);
}

export const store = {
  getReminder: (id: string) => state.reminders[id] as Reminder | undefined,
  allReminders: () => Object.values(state.reminders),

  upsertReminder(r: Reminder) {
    state.reminders[r.id] = r;
    save();
  },

  deleteReminder(id: string) {
    delete state.reminders[id];
    save();
  },

  isPlanned: (key: string) => key in state.planned,

  markPlanned(key: string) {
    state.planned[key] = new Date().toISOString();
    save();
  },

  /** Alte Einträge entfernen (älter als 3 Tage) */
  cleanup() {
    const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
    for (const [key, at] of Object.entries(state.planned)) if (Date.parse(at) < cutoff) delete state.planned[key];
    for (const r of Object.values(state.reminders))
      if (r.status !== "offen" && Date.parse(r.callAt) < cutoff) delete state.reminders[r.id];
    save();
  },
};
