import {readdirSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

// S-4 defaults messages.direction to 'inbound' precisely so a forgetful writer
// cannot push a row into the SEND ledger. The cost of that choice is that a
// forgetful writer silently mislabels every OUTBOUND row instead — which is
// four simultaneous silent failures (see Task 3 Step 6). This is the only thing
// that would catch the fifth writer somebody adds in Phase D.
describe("every messages writer names direction", () => {
  it("finds no INSERT INTO messages that omits the column", () => {
    const files = readdirSync("lib/db/repos").filter((name) => name.endsWith(".ts"));
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(`lib/db/repos/${file}`, "utf8");
      for (const statement of source.split(/INSERT\s+INTO\s+\$\{messages\}/i).slice(1)) {
        const columnList = statement.slice(0, statement.indexOf(")"));
        if (!/\bdirection\b/.test(columnList)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The guard above is a text scan, so it is worth proving it can fail. A column
  // list that names `direction` only in the VALUES clause — the exact near-miss
  // a hurried edit produces — must not read as compliant.
  it("rejects a column list that names direction only after the parenthesis", () => {
    const source = [
      "INSERT INTO ${messages}",
      "  (conversation_id, role, channel, content)",
      "VALUES (${id}, 'assistant', 'whatsapp', ${content}, ${direction})",
    ].join("\n");
    const [, statement] = source.split(/INSERT\s+INTO\s+\$\{messages\}/i);
    const columnList = (statement ?? "").slice(0, (statement ?? "").indexOf(")"));
    expect(/\bdirection\b/.test(columnList)).toBe(false);
  });

  // The two writers that exist today, named so a deletion is a decision rather
  // than an accident: `claimInbound` (the webhook's inbound row) and
  // `appendMessageFrom` (every concierge and web-widget row).
  it("still finds both known writers, so the scan is not passing on an empty set", () => {
    const files = readdirSync("lib/db/repos").filter((name) => name.endsWith(".ts"));
    const writers = files.filter((file) => (
      /INSERT\s+INTO\s+\$\{messages\}/i.test(readFileSync(`lib/db/repos/${file}`, "utf8"))
    ));
    expect(writers.sort()).toEqual(["conversations.ts", "woztell-inbound-events.ts", "woztell.ts"]);
  });
});
