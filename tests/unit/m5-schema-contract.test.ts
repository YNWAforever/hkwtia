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

describe("M5 Showcase schema contract", () => {
  it("declares the exact listing lifecycle and durable tables", () => {
    expect(enumValues("showcaseListingStatusEnum")).toEqual([
      "draft", "pending_review", "published", "rejected",
    ]);
    expect(tableConfig("showcaseListings")?.name).toBe("showcase_listings");
    expect(tableConfig("leads")?.name).toBe("leads");
  });

  it("keeps listing ownership, public ordering, facets, and lead integrity explicit", () => {
    const listing = tableConfig("showcaseListings");
    const lead = tableConfig("leads");
    if (!listing || !lead) return;

    const columns = new Map(listing.columns.map((column) => [column.name, column]));
    expect([...columns.keys()].sort()).toEqual([
      "case_study_summary_en", "case_study_summary_zh_hk", "case_study_url",
      "category", "company_id", "created_at", "deployment_options",
      "description_en", "description_zh_hk", "gone_global", "id", "logo_reference",
      "member_since", "name_en", "name_zh_hk", "premium", "rejection_reason",
      "reviewed_at", "reviewed_by_profile_id", "slug", "status", "tagline_en",
      "tagline_zh_hk", "updated_at", "use_cases", "video_url", "views",
      "works_with", "supported_languages",
    ].sort());
    expect(columns.get("company_id")?.notNull).toBe(true);
    expect(columns.get("member_since")?.notNull).toBe(true);
    expect(columns.get("premium")?.notNull).toBe(true);
    expect(columns.get("gone_global")?.notNull).toBe(true);
    expect(columns.get("views")?.notNull).toBe(true);
    expect(columns.get("rejection_reason")?.notNull).toBe(false);
    expect(listing.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "showcase_listings_company_unique",
        "showcase_listings_slug_unique",
        "showcase_listings_status_premium_category_idx",
      ]),
    );

    const leadColumns = new Map(lead.columns.map((column) => [column.name, column]));
    expect(leadColumns.get("listing_id")?.notNull).toBe(true);
    expect(leadColumns.get("email")?.notNull).toBe(true);
    expect(leadColumns.get("message")?.notNull).toBe(false);
    expect(lead.indexes.map((index) => index.config.name)).toContain(
      "leads_listing_created_idx",
    );
  });

  it("ships the migration, generated snapshot, and journal entry", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0014_m5_showcase.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0014_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TYPE "public"."showcase_listing_status"');
    expect(migration).toContain('CREATE TABLE "showcase_listings"');
    expect(migration).toContain('CREATE TABLE "leads"');
    expect(migration).toContain('"showcase_listings_company_unique"');
    expect(migration).toContain('"showcase_listings_slug_unique"');

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables?: Record<string, unknown>;
      enums?: Record<string, {values?: readonly string[]}>;
    };
    expect(snapshot.tables).toHaveProperty("public.showcase_listings");
    expect(snapshot.tables).toHaveProperty("public.leads");
    expect(snapshot.enums?.["public.showcase_listing_status"]?.values).toEqual([
      "draft", "pending_review", "published", "rejected",
    ]);

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{tag?: string}>};
    expect(journal.entries?.at(-1)?.tag).toBe("0015_m6_launch_pad");
  });
});
