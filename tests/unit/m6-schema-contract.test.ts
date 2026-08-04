import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import * as schema from "@/lib/db/server-schema";

const exportsByName = schema as unknown as Record<string, unknown>;

function enumValues(name: string): readonly string[] | undefined {
  return (exportsByName[name] as {enumValues?: readonly string[]} | undefined)
    ?.enumValues;
}

function tableConfig(name: string) {
  const table = exportsByName[name];
  expect(table, `${name} must be exported`).toBeDefined();
  return table
    ? getTableConfig(table as Parameters<typeof getTableConfig>[0])
    : null;
}

describe("M6 Launch Pad schema contract", () => {
  it("declares the exact durable cohort lifecycles and tables", () => {
    expect(enumValues("cohortStatusEnum")).toEqual([
      "planning", "open", "active", "completed", "archived",
    ]);
    expect(enumValues("cohortApplicationStageEnum")).toEqual([
      "applied", "accepted", "ready", "match", "land", "scale", "graduated", "rejected",
    ]);
    expect(enumValues("landingPartnerMouStatusEnum")).toEqual([
      "prospect", "in_discussion", "signed", "inactive",
    ]);
    expect(tableConfig("cohorts")?.name).toBe("cohorts");
    expect(tableConfig("cohortApplications")?.name).toBe("cohort_applications");
    expect(tableConfig("landingPartners")?.name).toBe("landing_partners");
  });

  it("keeps applications, public indexes, and the graduate projection explicit", () => {
    const cohort = tableConfig("cohorts");
    const application = tableConfig("cohortApplications");
    const partner = tableConfig("landingPartners");
    const listing = tableConfig("showcaseListings");
    if (!cohort || !application || !partner || !listing) return;

    const applicationColumns = new Map(application.columns.map((column) => [column.name, column]));
    const listingColumns = new Map(listing.columns.map((column) => [column.name, column]));
    expect(applicationColumns.get("cohort_id")?.notNull).toBe(true);
    expect(applicationColumns.get("company_id")?.notNull).toBe(true);
    expect(applicationColumns.get("readiness")?.notNull).toBe(true);
    expect(applicationColumns.get("notes")?.notNull).toBe(false);
    expect(listingColumns.get("gone_global")?.notNull).toBe(true);
    expect(cohort.indexes.map((entry) => entry.config.name)).toContain(
      "cohorts_public_status_starts_on_idx",
    );
    expect(application.indexes.map((entry) => entry.config.name)).toEqual(
      expect.arrayContaining([
        "cohort_applications_cohort_company_unique",
        "cohort_applications_cohort_stage_idx",
        "cohort_applications_company_idx",
      ]),
    );
    expect(partner.indexes.map((entry) => entry.config.name)).toContain(
      "landing_partners_public_market_status_idx",
    );
  });

  it("ships matching migration, generated snapshot, and journal metadata", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0015_m6_launch_pad.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0015_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TYPE "public"."cohort_status"');
    expect(migration).toContain('CREATE TYPE "public"."cohort_application_stage"');
    expect(migration).toContain('CREATE TYPE "public"."landing_partner_mou_status"');
    expect(migration).toContain('CREATE TABLE "cohorts"');
    expect(migration).toContain('CREATE TABLE "cohort_applications"');
    expect(migration).toContain('CREATE TABLE "landing_partners"');
    expect(migration).toContain('"cohort_applications_cohort_company_unique"');
    expect(migration).toContain('ADD COLUMN "gone_global" boolean DEFAULT false NOT NULL');

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      enums?: Record<string, {values?: readonly string[]}>;
      tables?: Record<string, unknown>;
    };
    expect(snapshot.tables).toHaveProperty("public.cohorts");
    expect(snapshot.tables).toHaveProperty("public.cohort_applications");
    expect(snapshot.tables).toHaveProperty("public.landing_partners");
    expect(snapshot.enums?.["public.cohort_application_stage"]?.values).toEqual([
      "applied", "accepted", "ready", "match", "land", "scale", "graduated", "rejected",
    ]);

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{tag?: string}>};
    expect(journal.entries?.at(-1)?.tag).toBe("0015_m6_launch_pad");
  });
});
