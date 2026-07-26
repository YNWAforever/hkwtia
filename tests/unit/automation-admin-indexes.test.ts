import {existsSync, readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

const migrationTag = "0009_m3_automation_admin_indexes";
const migrationPath = `drizzle/${migrationTag}.sql`;
const snapshotPath = `drizzle/meta/${migrationTag.slice(0, 4)}_snapshot.json`;
const schema = readFileSync("lib/db/schema-core.ts", "utf8");
const indexTargets = [
  ["public.journey_state", "journey_state_admin_recent_idx"],
  ["public.jobs", "jobs_automation_recent_idx"],
] as const;

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

  it("finds migration 0009 by tag and records SQL/snapshot index parity", () => {
    expect(existsSync(snapshotPath)).toBe(true);
    const journal = JSON.parse(
      readFileSync("drizzle/meta/_journal.json", "utf8"),
    ) as {entries: {idx: number; tag: string}[]};
    const laterEntry = {idx: 10, tag: "0010_future_migration"};
    const entriesWithLaterMigration = [
      ...journal.entries,
      laterEntry,
    ];
    const migrationEntry = entriesWithLaterMigration.find(
      (entry) => entry.tag === migrationTag,
    );

    expect({
      idx: migrationEntry?.idx,
      tag: migrationEntry?.tag,
    }).toEqual({
      idx: 9,
      tag: migrationTag,
    });
    expect(entriesWithLaterMigration).toContainEqual(laterEntry);

    const migration = readFileSync(migrationPath, "utf8");
    const snapshot = JSON.parse(
      readFileSync(snapshotPath, "utf8"),
    ) as {
      tables: Record<string, {
        indexes: Record<string, unknown>;
      }>;
    };
    for (const [table, index] of indexTargets) {
      expect(migration).toContain(`"${index}"`);
      expect(snapshot.tables[table]?.indexes).toHaveProperty(index);
    }
  });
});
