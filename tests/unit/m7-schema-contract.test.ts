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

describe("M7 page copy schema contract", () => {
  it("pins the page_copy column set", () => {
    const pageCopy = tableConfig("pageCopy");
    if (!pageCopy) return;

    expect(pageCopy.name).toBe("page_copy");
    expect(pageCopy.columns.map((column) => column.name).sort()).toEqual([
      "created_at",
      "id",
      "key_path",
      "locale",
      "namespace",
      "updated_at",
      "updated_by_profile_id",
      "value",
    ]);
  });

  it("requires every field an override is identified and rendered by", () => {
    const pageCopy = tableConfig("pageCopy");
    if (!pageCopy) return;

    const columns = new Map(pageCopy.columns.map((column) => [column.name, column]));
    for (const name of ["locale", "namespace", "key_path", "value"]) {
      expect(columns.get(name)?.notNull, name).toBe(true);
    }
    // Nullable so removing a staff profile never deletes published copy.
    expect(columns.get("updated_by_profile_id")?.notNull).toBe(false);
  });

  it("makes one override per locale, namespace and key path the only possibility", () => {
    const pageCopy = tableConfig("pageCopy");
    if (!pageCopy) return;

    const unique = pageCopy.indexes
      .find((entry) => entry.config.name === "page_copy_locale_namespace_key_path_unique");
    expect(unique?.config.unique).toBe(true);
    expect(unique?.config.columns.map((column) => (column as {name?: string}).name)).toEqual([
      "locale", "namespace", "key_path",
    ]);
    expect(pageCopy.indexes.map((entry) => entry.config.name)).toContain("page_copy_locale_idx");
  });

  it("ships matching migration, generated snapshot, and journal metadata", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0016_m7_page_copy.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0016_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE "page_copy"');
    expect(migration).toContain('"page_copy_locale_namespace_key_path_unique"');
    // The milestone adds a table and nothing else; a stray ALTER here would
    // mean uncommitted schema drift rode along with it.
    expect(migration).not.toContain("DROP");
    expect(migration.match(/ALTER TABLE "(?!page_copy")/g)).toBeNull();

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables?: Record<string, unknown>;
    };
    expect(snapshot.tables).toHaveProperty("public.page_copy");

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{idx?: number; tag?: string}>};
    expect(journal.entries?.find((entry) => entry.tag === "0016_m7_page_copy"))
      .toMatchObject({idx: 16});
  });
});
