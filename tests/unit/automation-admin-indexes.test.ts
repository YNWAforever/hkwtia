import {existsSync, readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

const migrationPath = "drizzle/0009_m3_automation_admin_indexes.sql";
const snapshotPath = "drizzle/meta/0009_snapshot.json";
const schema = readFileSync("lib/db/schema-core.ts", "utf8");

describe("automation admin index contracts", () => {
  it("defines planner-compatible global journey and partial job indexes", () => {
    expect(schema).toMatch(
      /index\("journey_state_admin_recent_idx"\)\s*\.on\(table\.scheduledAt\.desc\(\), table\.id\.desc\(\)\)/,
    );
    expect(schema).toMatch(
      /index\("jobs_automation_recent_idx"\)\s*\.on\(table\.updatedAt\.desc\(\), table\.id\.desc\(\)\)\s*\.where\(/,
    );
  });

  it("generates migration 0009 with the exact partial allowlist predicate", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('"journey_state_admin_recent_idx"');
    expect(migration).toMatch(
      /"journey_state".*"scheduled_at" DESC.*"id" DESC/i,
    );
    expect(migration).toContain('"jobs_automation_recent_idx"');
    expect(migration).toMatch(/"jobs".*"updated_at" DESC.*"id" DESC/i);
    for (const kind of [
      "journey-runner",
      "renewal-runner",
      "engagement-score",
      "approvals-expirer",
      "worker-alert",
    ]) {
      expect(migration).toContain(`'${kind}'`);
    }
    expect(migration).not.toContain("stripe");
  });

  it("records migration 0009 and both indexes in Drizzle metadata", () => {
    expect(existsSync(snapshotPath)).toBe(true);
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8"),
    ) as {entries: {idx: number; tag: string}[]};
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 9,
      tag: "0009_m3_automation_admin_indexes",
    });

    const snapshot = JSON.parse(
      readFileSync(snapshotPath, "utf8"),
    ) as {
      tables: Record<string, {
        indexes: Record<string, unknown>;
      }>;
    };
    expect(
      snapshot.tables["public.journey_state"]?.indexes,
    ).toHaveProperty("journey_state_admin_recent_idx");
    expect(
      snapshot.tables["public.jobs"]?.indexes,
    ).toHaveProperty("jobs_automation_recent_idx");
  });
});
