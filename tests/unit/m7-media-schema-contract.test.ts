import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import * as schema from "@/lib/db/server-schema";

const exportsByName = schema as unknown as Record<string, unknown>;

function tableConfig(name: string) {
  const table = exportsByName[name];
  expect(table, `${name} must be exported`).toBeDefined();
  return table
    ? getTableConfig(table as Parameters<typeof getTableConfig>[0])
    : null;
}

describe("M7.3 media schema contract", () => {
  it("pins the media column set", () => {
    const table = tableConfig("media");
    if (!table) return;

    expect(table.name).toBe("media");
    // width/height are deliberately absent: with no upload they could only be
    // typed by hand, where a wrong value silently distorts the image.
    expect(table.columns.map((column) => column.name).sort()).toEqual([
      "alt_en",
      "alt_zh",
      "created_at",
      "id",
      "registered_by_profile_id",
      "updated_at",
      "url",
    ]);
  });

  it("requires a url and alt text in both locales", () => {
    const table = tableConfig("media");
    if (!table) return;

    const columns = new Map(table.columns.map((column) => [column.name, column]));
    for (const name of ["url", "alt_en", "alt_zh"]) {
      expect(columns.get(name)?.notNull, name).toBe(true);
    }
    // Nullable so removing a staff profile never deletes a registered image.
    expect(columns.get("registered_by_profile_id")?.notNull).toBe(false);
  });

  it("registers each file once", () => {
    const table = tableConfig("media");
    if (!table) return;

    const unique = table.indexes.find((entry) => entry.config.name === "media_url_unique");
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map((column) => (column as {name?: string}).name))
      .toEqual(["url"]);
  });

  it("links a showcase listing to a registry entry without disturbing the free-text column", () => {
    const listing = tableConfig("showcaseListings");
    if (!listing) return;

    const columns = new Map(listing.columns.map((column) => [column.name, column]));
    // Both survive: logo_reference still feeds the JSON-LD sink, logo_media_id
    // is what the site renders.
    expect(columns.get("logo_reference")).toBeDefined();
    expect(columns.get("logo_media_id")).toBeDefined();
    expect(columns.get("logo_media_id")?.notNull).toBe(false);
  });

  it("ships matching migration, generated snapshot, and journal metadata", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0017_m7_media.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0017_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE "media"');
    expect(migration).toContain('"media_url_unique"');
    expect(migration).toContain('ADD COLUMN "logo_media_id" uuid');
    // The milestone is additive; a DROP or an unrelated ALTER here would mean
    // uncommitted schema drift rode along with it.
    expect(migration).not.toContain("DROP");
    expect(migration.match(/ALTER TABLE "(?!media"|showcase_listings")/g)).toBeNull();

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables?: Record<string, unknown>;
    };
    expect(snapshot.tables).toHaveProperty("public.media");

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{idx?: number; tag?: string}>};
    expect(journal.entries?.find((entry) => entry.tag === "0017_m7_media"))
      .toMatchObject({idx: 17});
  });
});
