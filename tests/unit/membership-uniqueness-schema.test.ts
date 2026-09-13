import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {memberships} from "@/lib/db/server-schema";

const config = getTableConfig(memberships);
const byName = new Map(config.indexes.map((index) => [index.config.name, index]));

/** Every migration's DDL, concatenated — the statements that actually run. */
const migrationSql = readdirSync("drizzle")
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join("drizzle", file), "utf8"))
  .join("\n");

/**
 * One membership in play per target. `cancelled` and `expired` are terminal in
 * `allowedTransitions`, so rows in those states are history and may accumulate; every
 * other status can still reach `active`, and a second row alongside one of them is a
 * duplicate membership for the same person or company.
 */
describe("membership uniqueness schema contract", () => {
  it.each([
    ["memberships_owner_live_unique", "owner_user_id"],
    ["memberships_company_live_unique", "company_id"],
  ])("%s is a partial unique index on %s", (name, column) => {
    const index = byName.get(name);
    expect(index, `${name} must exist`).toBeDefined();
    expect(index!.config.unique, `${name} must be unique`).toBe(true);
    expect(index!.config.columns.map((c) => (c as {name: string}).name)).toEqual([column]);
    // Partial, not plain: a plain unique index would mean a lapsed member or company
    // could never be given a new membership, which is precisely when one is wanted.
    expect(index!.config.where, `${name} must be partial`).toBeDefined();
  });

  it.each([
    ["memberships_owner_live_unique", "owner_user_id"],
    ["memberships_company_live_unique", "company_id"],
  ])("%s ships DDL that excludes NULL targets and terminal statuses", (name, column) => {
    // The schema object says "there is a predicate"; only the DDL says what it is, and
    // the DDL is what Postgres enforces.
    const statement = migrationSql
      .split(/;\s*(?:-->\s*statement-breakpoint)?/)
      .find((s) => s.includes(name));
    expect(statement, `${name} must appear in a migration`).toBeDefined();

    expect(statement).toContain("CREATE UNIQUE INDEX");
    expect(statement).toContain(`"${column}" IS NOT NULL`);
    expect(statement).toContain("'cancelled'");
    expect(statement).toContain("'expired'");
  });

  it("keeps the two indexes independent, so the owner/company XOR is respected", () => {
    // memberships_target_check allows an owner xor a company, so exactly one of the two
    // columns is NULL on every row. An index that did not exclude its NULLs would collapse
    // every row of the other kind into a single duplicate group.
    const owner = migrationSql.includes(`"owner_user_id" IS NOT NULL`);
    const company = migrationSql.includes(`"company_id" IS NOT NULL`);
    expect(owner && company, "both partial predicates must exclude their NULL target").toBe(true);
  });
});
