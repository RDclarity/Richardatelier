import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import * as calendar from "./calendar.js";
import { store } from "./store.js";
import { dateToLocal, localToDate, spokenDateTime } from "./time.js";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

type Message = Anthropic.Beta.BetaMessageParam;
type ToolInput = Record<string, unknown>;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "termine_abrufen",
    description:
      "Liest Termine aus dem Kalender im angegebenen Zeitraum. Liefert für jeden Termin ID, Titel, Beginn, Ende und Ort. Für Fragen wie 'Was steht morgen an?' oder 'Wann ist der Termin mit Maier?' (dann mit suchbegriff und großzügigem Zeitraum).",
    input_schema: {
      type: "object",
      properties: {
        von: { type: "string", description: "Beginn des Zeitraums, Ortszeit, Format YYYY-MM-DDTHH:MM" },
        bis: { type: "string", description: "Ende des Zeitraums, Ortszeit, Format YYYY-MM-DDTHH:MM" },
        suchbegriff: { type: "string", description: "Optional: Freitextsuche in Titel, Ort und Beschreibung" },
      },
      required: ["von", "bis"],
    },
  },
  {
    name: "termin_anlegen",
    description:
      "Legt einen neuen Termin an. Nur aufrufen, nachdem der Nutzer die vorgelesenen Details (Titel, Tag, Uhrzeit) ausdrücklich bestätigt hat.",
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string" },
        beginn: { type: "string", description: "Ortszeit, YYYY-MM-DDTHH:MM (bei ganztägig YYYY-MM-DD)" },
        ende: {
          type: "string",
          description: "Ortszeit, YYYY-MM-DDTHH:MM. Ohne Angabe des Nutzers: eine Stunde nach Beginn. Bei ganztägig: Folgetag YYYY-MM-DD.",
        },
        ganztaegig: { type: "boolean" },
        ort: { type: "string" },
        notiz: { type: "string" },
      },
      required: ["titel", "beginn", "ende"],
    },
  },
  {
    name: "termin_aendern",
    description:
      "Ändert einen bestehenden Termin (verschieben, umbenennen, Ort ändern). Die termin_id stammt aus termine_abrufen. Wird nur der Beginn geändert, bleibt die Dauer erhalten. Nur nach ausdrücklicher Bestätigung aufrufen.",
    input_schema: {
      type: "object",
      properties: {
        termin_id: { type: "string" },
        titel: { type: "string" },
        beginn: { type: "string", description: "Ortszeit, YYYY-MM-DDTHH:MM" },
        ende: { type: "string", description: "Ortszeit, YYYY-MM-DDTHH:MM" },
        ort: { type: "string" },
        notiz: { type: "string" },
      },
      required: ["termin_id"],
    },
  },
  {
    name: "termin_loeschen",
    description: "Löscht einen Termin. Nur nach ausdrücklicher Bestätigung aufrufen. Die termin_id stammt aus termine_abrufen.",
    input_schema: {
      type: "object",
      properties: { termin_id: { type: "string" } },
      required: ["termin_id"],
    },
  },
  {
    name: "erinnerung_planen",
    description:
      "Plant einen Erinnerungsanruf zu einem bestimmten Zeitpunkt, z. B. 'Ruf mich in zwei Stunden an und erinnere mich an das Angebot für Schmidt'.",
    input_schema: {
      type: "object",
      properties: {
        zeitpunkt: { type: "string", description: "Ortszeit, YYYY-MM-DDTHH:MM" },
        text: { type: "string", description: "Woran erinnert werden soll, als kurzer Satz" },
      },
      required: ["zeitpunkt", "text"],
    },
  },
  {
    name: "erinnerungen_auflisten",
    description: "Listet alle noch offenen, geplanten Erinnerungsanrufe auf.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "erinnerung_loeschen",
    description: "Storniert einen geplanten Erinnerungsanruf. Die ID stammt aus erinnerungen_auflisten.",
    input_schema: {
      type: "object",
      properties: { erinnerung_id: { type: "string" } },
      required: ["erinnerung_id"],
    },
  },
  {
    name: "gespraech_beenden",
    description:
      "Legt auf. Aufrufen, wenn der Nutzer sich verabschiedet oder nichts mehr braucht – vorher kurz verabschieden.",
    input_schema: { type: "object", properties: {} },
  },
];

function str(input: ToolInput, key: string, required = true): string | undefined {
  const v = input[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (required) throw new Error(`Feld '${key}' fehlt`);
  return undefined;
}

function describe(e: calendar.CalendarEvent) {
  return {
    termin_id: e.id,
    titel: e.title,
    beginn: e.allDay ? dateToLocal(e.start).slice(0, 10) + " (ganztägig)" : dateToLocal(e.start),
    ende: e.allDay ? undefined : dateToLocal(e.end),
    ort: e.location,
    notiz: e.description,
  };
}

export interface CallContext {
  /** Hintergrund, wenn der Assistent selbst angerufen hat */
  reminderContext?: string;
  /** Was zur Begrüßung bereits gesagt wurde */
  greeting: string;
}

/**
 * Ein Telefongespräch mit Claude. Text wird stückweise über `speak` ausgegeben,
 * damit die Sprachausgabe sofort beginnt.
 */
export class Conversation {
  private messages: Message[] = [];
  private system: string;
  private abort?: AbortController;
  private busy: Promise<void> = Promise.resolve();
  wantsHangup = false;

  constructor(
    ctx: CallContext,
    private speak: (token: string, last: boolean) => void,
  ) {
    const now = new Date();
    this.system = [
      `Du bist der persönliche Telefon-Assistent von ${config.ownerName}. Ihr sprecht am Telefon miteinander, auf Deutsch, per Du.`,
      `Jetzt ist ${spokenDateTime(now)} (Ortszeit ${dateToLocal(now)}, Zeitzone ${config.timezone}).`,
      "",
      "So sprichst du:",
      "- Deine Antworten werden vorgelesen. Antworte kurz und natürlich wie ein guter Assistent am Telefon – meist ein bis drei Sätze.",
      "- Kein Markdown, keine Aufzählungszeichen, keine Emojis, keine Abkürzungen wie 'ca.' oder 'z. B.'.",
      "- Uhrzeiten so: 'um zehn Uhr dreißig'. Daten so: 'Samstag, der dritte Oktober'. Sag 'heute', 'morgen', 'übermorgen', wo es passt.",
      "- Bei mehreren Terminen: Anzahl nennen, dann in zeitlicher Reihenfolge mit Uhrzeit und Titel. Orte nur nennen, wenn danach gefragt wird oder es wichtig ist.",
      "- Die Spracherkennung kann sich verhören. Wenn etwas unklar ist, frag kurz nach, statt zu raten.",
      "- Antworte zügig; es wartet jemand am Telefon.",
      "",
      "Kalender:",
      "- Für jede Frage zu Terminen zuerst termine_abrufen nutzen; nie Termine erfinden.",
      "- Bevor du einen Termin anlegst, änderst oder löschst: lies die Details einmal vor und frag 'Soll ich das so eintragen?'. Erst nach einem klaren Ja ausführen, danach kurz bestätigen.",
      "- Fehlt bei einem neuen Termin die Dauer, nimm eine Stunde.",
      "",
      "Wenn der Nutzer sich verabschiedet ('danke, das war's', 'tschüss'), verabschiede dich kurz und rufe gespraech_beenden auf.",
      ctx.reminderContext
        ? `\nDieser Anruf geht von dir aus: ${ctx.reminderContext}\nDu hast zur Begrüßung bereits gesagt: "${ctx.greeting}". Wiederhole das nicht, sondern reagiere auf die Antwort. Wenn ${config.ownerName} nur bestätigt ('okay', 'danke'), verabschiede dich kurz und lege auf.`
        : `\n${config.ownerName} hat dich angerufen. Du hast bereits gesagt: "${ctx.greeting}".`,
    ].join("\n");
  }

  /** Neue Äußerung des Nutzers. Ein laufender Turn wird abgebrochen. */
  handleUserText(text: string) {
    this.interrupt();
    this.enqueue(() => {
      this.appendUser(text);
      return this.runTurn();
    });
  }

  /** Der Nutzer hat dazwischengeredet: aktuelle Antwort abbrechen. */
  interrupt(spokenSoFar?: string) {
    if (this.abort) {
      this.abort.abort();
      this.abort = undefined;
    }
    if (spokenSoFar)
      this.enqueue(() => this.appendUser(`(Du wurdest unterbrochen. Gesagt hattest du bis dahin nur: "${spokenSoFar}")`));
  }

  /** Alles nacheinander abarbeiten, damit der Verlauf immer gültig bleibt (Werkzeugergebnisse direkt nach dem Aufruf). */
  private enqueue(task: () => void | Promise<void>) {
    this.busy = this.busy.then(task).catch((err) => {
      console.error("Turn-Fehler:", err);
      this.speak("Entschuldige, da ist gerade etwas schiefgelaufen. Versuch es bitte noch einmal.", true);
    });
  }

  private appendUser(text: string) {
    const last = this.messages.at(-1);
    if (last?.role === "user") {
      // Noch unbeantwortete Nutzernachricht ergänzen statt zwei Nutzer-Turns hintereinander
      const content = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
      last.content = [...content, { type: "text", text }];
    } else {
      this.messages.push({ role: "user", content: text });
    }
  }

  private async runTurn() {
    const abort = new AbortController();
    this.abort = abort;
    let saidFiller = false;

    try {
      for (let step = 0; step < 8; step++) {
        if (abort.signal.aborted) return;

        const stream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 4000,
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
            tools,
            messages: this.messages,
          },
          { signal: abort.signal },
        );
        stream.on("text", (delta) => {
          if (!abort.signal.aborted) this.speak(delta, false);
        });

        let response: Anthropic.Beta.BetaMessage;
        try {
          response = await stream.finalMessage();
        } catch (err) {
          if (abort.signal.aborted) return; // Unterbrochen – nichts in den Verlauf schreiben
          throw err;
        }

        if (response.stop_reason === "refusal") {
          this.speak("Dabei kann ich dir leider nicht helfen.", false);
          // Abgelehnten Turn nicht im Verlauf behalten
          this.appendUser("(Deine vorige Antwort wurde abgebrochen.)");
          return;
        }

        this.messages.push({ role: "assistant", content: response.content });

        const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        if (response.stop_reason !== "tool_use" || toolUses.length === 0) return;

        if (!saidFiller && toolUses.some((t) => t.name !== "gespraech_beenden")) {
          this.speak("Einen Moment. ", false);
          saidFiller = true;
        }

        // Werkzeuge immer vollständig ausführen und Ergebnisse anhängen, damit der Verlauf konsistent bleibt
        const results = await Promise.all(toolUses.map((t) => this.runTool(t)));
        this.messages.push({ role: "user", content: results });
      }
    } finally {
      if (this.abort === abort) this.abort = undefined;
      if (!abort.signal.aborted) this.speak("", true);
    }
  }

  private async runTool(tool: Anthropic.Beta.BetaToolUseBlock): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const input = (tool.input ?? {}) as ToolInput;
    try {
      const result = await this.execute(tool.name, input);
      console.log(`[tool] ${tool.name}`, JSON.stringify(input));
      return { type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(result) };
    } catch (err) {
      console.error(`[tool] ${tool.name} fehlgeschlagen:`, err);
      return {
        type: "tool_result",
        tool_use_id: tool.id,
        is_error: true,
        content: `Fehler: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async execute(name: string, input: ToolInput): Promise<unknown> {
    switch (name) {
      case "termine_abrufen": {
        const events = await calendar.listEvents(
          localToDate(str(input, "von")!),
          localToDate(str(input, "bis")!),
          str(input, "suchbegriff", false),
        );
        return events.length ? events.map(describe) : "Keine Termine in diesem Zeitraum.";
      }
      case "termin_anlegen": {
        const e = await calendar.createEvent({
          title: str(input, "titel")!,
          start: str(input, "beginn")!,
          end: str(input, "ende")!,
          allDay: input.ganztaegig === true,
          location: str(input, "ort", false),
          description: str(input, "notiz", false),
        });
        return { angelegt: describe(e) };
      }
      case "termin_aendern": {
        const e = await calendar.updateEvent(str(input, "termin_id")!, {
          title: str(input, "titel", false),
          start: str(input, "beginn", false),
          end: str(input, "ende", false),
          location: str(input, "ort", false),
          description: str(input, "notiz", false),
        });
        return { geaendert: describe(e) };
      }
      case "termin_loeschen":
        await calendar.deleteEvent(str(input, "termin_id")!);
        return "Termin gelöscht.";
      case "erinnerung_planen": {
        const callAt = localToDate(str(input, "zeitpunkt")!);
        if (callAt.getTime() < Date.now() - 60_000) throw new Error("Der Zeitpunkt liegt in der Vergangenheit");
        const text = str(input, "text")!;
        const id = randomUUID().slice(0, 8);
        store.upsertReminder({
          id,
          callAt: callAt.toISOString(),
          greeting: `Hallo ${config.ownerName}, hier ist dein Assistent. Du wolltest erinnert werden: ${text}`,
          context: `Du rufst an, weil du gebeten wurdest, an Folgendes zu erinnern: ${text}`,
          kind: "manuell",
          attempts: 0,
          status: "offen",
        });
        return { geplant: { erinnerung_id: id, anruf_um: dateToLocal(callAt), text } };
      }
      case "erinnerungen_auflisten": {
        const open = store
          .allReminders()
          .filter((r) => r.status === "offen")
          .sort((a, b) => a.callAt.localeCompare(b.callAt));
        return open.length
          ? open.map((r) => ({ erinnerung_id: r.id, anruf_um: dateToLocal(new Date(r.callAt)), art: r.kind, text: r.greeting }))
          : "Keine geplanten Erinnerungen.";
      }
      case "erinnerung_loeschen": {
        const id = str(input, "erinnerung_id")!;
        if (!store.getReminder(id)) throw new Error("Unbekannte Erinnerung");
        store.deleteReminder(id);
        return "Erinnerung storniert.";
      }
      case "gespraech_beenden":
        this.wantsHangup = true;
        return "Gespräch wird nach deiner Verabschiedung beendet. Sag nichts weiter.";
      default:
        throw new Error(`Unbekanntes Werkzeug ${name}`);
    }
  }
}
