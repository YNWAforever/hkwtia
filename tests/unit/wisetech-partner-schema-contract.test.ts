import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";
import * as schema from "@/lib/db/server-schema";

const exportsByName = schema as unknown as Record<string, unknown>;
function table(name: string) {
  expect(exportsByName[name], `${name} must be exported`).toBeDefined();
  return exportsByName[name] ? getTableConfig(exportsByName[name] as Parameters<typeof getTableConfig>[0]) : null;
}

describe("WiseTech partner schema contract", () => {
  it("adds the exact general partner authority and typed categories", () => {
    const partners = table("partners");
    if (!partners) return;
    expect(partners.name).toBe("partners");
    expect(partners.columns.map((column) => column.name).sort()).toEqual([
      "archived_at", "category", "created_at", "display_order", "featured", "id", "logo_media_id",
      "logo_rights_confirmed_at", "name_en", "name_zh_hk", "published_at", "relationship_confirmed_at",
      "relationship_ends_on", "relationship_starts_on", "updated_at", "website_url",
    ]);
    expect((exportsByName.partnerCategoryEnum as {enumValues: string[]}).enumValues).toEqual([
      "supporting", "media", "regional", "programme", "sponsor",
    ]);
    expect(partners.checks.map((entry) => entry.name).sort()).toEqual([
      "partners_display_order_check", "partners_name_en_check", "partners_name_zh_hk_check", "partners_relationship_window_check",
    ]);
  });

  it("adds publication/archive state to landing_partners", () => {
    const landing = table("landingPartners");
    if (!landing) return;
    const columns = new Map(landing.columns.map((column) => [column.name, column]));
    expect(columns.get("published_at")?.notNull).toBe(false);
    expect(columns.get("archived_at")?.notNull).toBe(false);
  });

  it("ships generated additive migration 0020, snapshot, and journal entry", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0020_wisetech_partners.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0020_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE "partners"');
    expect(migration).toContain('ALTER TABLE "landing_partners" ADD COLUMN "published_at"');
    expect(migration).toContain('ALTER TABLE "landing_partners" ADD COLUMN "archived_at"');
    expect(migration).not.toContain("DROP");
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {tables: Record<string, unknown>};
    expect(snapshot.tables).toHaveProperty("public.partners");
    const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as {entries: Array<{idx: number; tag: string}>};
    expect(journal.entries.find((entry) => entry.tag === "0020_wisetech_partners")).toMatchObject({idx: 20});
  });
});
