import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const sql = readFileSync("drizzle/0070_signup_attribution.sql", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{idx: number; tag: string; when: number}>;
};

describe("signup attribution migration 0070", () => {
  it("is the next journal entry and only adds nullable source columns", () => {
    const entry = journal.entries.at(-1);
    expect(entry).toMatchObject({idx: 70, tag: "0070_signup_attribution"});
    expect(entry!.when).toBeGreaterThan(journal.entries.at(-2)!.when);
    for (const table of ["membership_applications", "contacts"]) {
      for (const column of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referral_code", "referrer_host", "landing_path", "heard_about", "attribution_captured_at"]) {
        expect(sql).toContain(`ALTER TABLE "${table}" ADD COLUMN "${column}"`);
      }
    }
    expect(sql).not.toContain("organisation_application_details");
    expect(sql.toLowerCase()).not.toContain("drop ");
  });
});
