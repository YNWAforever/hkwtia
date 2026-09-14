import {readdirSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {agentNameEnum, agentTriggerEnum} from "@/lib/db/schema-core";

function migrationSource(): string {
  const file = readdirSync(resolve(process.cwd(), "drizzle"))
    .find((name) => name.endsWith("phase_d3_writer_agent.sql"));
  if (!file) throw new Error("phase_d3_writer_agent migration not found");
  return readFileSync(resolve(process.cwd(), "drizzle", file), "utf8");
}

describe("Phase D-3 writer agent schema contract", () => {
  it("adds the writer agent and the portal trigger", () => {
    expect(agentNameEnum.enumValues).toContain("writer");
    expect(agentTriggerEnum.enumValues).toContain("portal");
  });

  // The Phase C trap: drizzle-kit runs every pending file in one transaction and
  // Postgres forbids USING a new enum value in the transaction that added it, so
  // a DEFAULT or a backfill naming 'writer' aborts the whole deploy on a fresh
  // database, at deploy time, invisibly to every incremental test.
  it("declares the new values without using them in the same migration", () => {
    const sql = migrationSource();
    expect(sql).toMatch(/ADD VALUE (IF NOT EXISTS )?'writer'/);
    expect(sql).toMatch(/ADD VALUE (IF NOT EXISTS )?'portal'/);
    expect(sql).not.toMatch(/DEFAULT\s+'writer'/i);
    expect(sql).not.toMatch(/DEFAULT\s+'portal'/i);
    expect(sql).not.toMatch(/=\s*'writer'/i);
  });
});
