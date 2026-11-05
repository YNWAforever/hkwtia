import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const sql = readFileSync("drizzle/0071_media_and_press_route.sql", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{idx: number; tag: string; when: number}>;
};

describe("media and press route migration 0071", () => {
  it("follows 0070 and only widens the announcements href check", () => {
    const index = journal.entries.findIndex((item) => item.tag === "0071_media_and_press_route");
    expect(index).toBeGreaterThan(0);
    const entry = journal.entries[index];
    expect(entry).toMatchObject({idx: 71, tag: "0071_media_and_press_route"});
    expect(journal.entries[index - 1]).toMatchObject({idx: 70, tag: "0070_signup_attribution"});
    expect(entry!.when).toBeGreaterThan(journal.entries[index - 1]!.when);
    expect(sql).toContain('DROP CONSTRAINT "site_announcements_href_check"');
    expect(sql).toContain("'/media-and-press-coverage'");
    expect(sql).toContain("'/news'");
    expect(sql).not.toContain("utm_source");
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("drop column");
  });
});
