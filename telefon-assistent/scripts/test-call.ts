/**
 * Plant einen Test-Erinnerungsanruf in einer Minute.
 * Der Server muss laufen und dasselbe DATA_DIR verwenden – alternativ einfach anrufen und sagen:
 * "Ruf mich in einer Minute an und erinnere mich an den Test."
 */
import { randomUUID } from "node:crypto";
import { config } from "../src/config.js";
import { store } from "../src/store.js";

const id = "test-" + randomUUID().slice(0, 6);
store.upsertReminder({
  id,
  callAt: new Date(Date.now() + 60_000).toISOString(),
  greeting: `Hallo ${config.ownerName}, das ist ein Testanruf von deinem Assistenten. Hörst du mich gut?`,
  context: "Das ist ein Testanruf, um zu prüfen, ob die Erinnerungsanrufe funktionieren.",
  kind: "manuell",
  attempts: 0,
  status: "offen",
});
console.log(`Testanruf ${id} geplant – der laufende Server ruft in etwa einer Minute an.`);
