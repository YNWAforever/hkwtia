import {readFileSync, readdirSync} from "node:fs";
import {generateDrizzleJson, generateMigration, type DrizzleSnapshotJSON} from "drizzle-kit/api";
import {describe, expect, it} from "vitest";

import * as schema from "@/lib/db/schema-core";

describe("pay-first migration metadata", () => {
  it("does not generate duplicate DDL for the already-journaled membership changes", async () => {
    const snapshots = readdirSync("drizzle/meta").filter((file) => /^\d+_snapshot\.json$/.test(file)).sort();
    expect(snapshots.length).toBeGreaterThan(40);
    const latest = JSON.parse(readFileSync(`drizzle/meta/${snapshots.at(-1)!}`, "utf8")) as DrizzleSnapshotJSON;
    const current = generateDrizzleJson(schema, latest.id);
    expect(await generateMigration(latest, current)).toEqual([]);
  });

  it("detects the retired snapshot shape that would replay the table and enum additions", async () => {
    const current = generateDrizzleJson(schema);
    const retired = structuredClone(current);
    delete retired.tables["public.organisation_application_details"];
    retired.enums["public.membership_plan_code"]!.values = ["community", "startup", "corporate", "patron"];
    const statements = await generateMigration(retired, current);
    expect(statements).toHaveLength(4);
    expect(statements.join("\n")).toContain('CREATE TABLE "organisation_application_details"');
    expect(statements).toContain('ALTER TYPE "public"."membership_plan_code" ADD VALUE \'individual\';');
    expect(statements).toContain('ALTER TYPE "public"."membership_plan_code" ADD VALUE \'platinum\';');
  });
});
