import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("incremental migration journal", () => {
  it("never silently skips a later migration after deploying an earlier prefix", () => {
    const {entries} = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {entries: {idx: number; when: number; tag: string}[]};
    expect(entries.length).toBeGreaterThan(40);
    for (let i = 1; i < entries.length; i++) expect(entries[i]!.when, `${entries[i]!.tag} must follow ${entries[i-1]!.tag}`).toBeGreaterThan(entries[i-1]!.when);
  });
});
