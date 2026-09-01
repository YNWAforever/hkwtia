import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import * as schema from "@/lib/db/server-schema";

const exportsByName = schema as unknown as Record<string, unknown>;

function announcementTable() {
  const table = exportsByName.siteAnnouncements;
  expect(table, "siteAnnouncements must be exported").toBeDefined();
  return table
    ? getTableConfig(table as Parameters<typeof getTableConfig>[0])
    : null;
}

describe("WiseTech announcement schema contract", () => {
  it("pins the additive site_announcements column set and nullability", () => {
    const table = announcementTable();
    if (!table) return;

    expect(table.name).toBe("site_announcements");
    expect(table.columns.map((column) => column.name).sort()).toEqual([
      "archived_at",
      "created_at",
      "cta_label_en",
      "cta_label_zh_hk",
      "ends_at",
      "href",
      "id",
      "priority",
      "published_at",
      "starts_at",
      "title_en",
      "title_zh_hk",
      "updated_at",
    ]);

    const columns = new Map(table.columns.map((column) => [column.name, column]));
    for (const name of [
      "title_en", "title_zh_hk", "cta_label_en", "cta_label_zh_hk",
      "href", "starts_at", "ends_at", "priority", "created_at", "updated_at",
    ]) {
      expect(columns.get(name)?.notNull, name).toBe(true);
    }
    expect(columns.get("published_at")?.notNull).toBe(false);
    expect(columns.get("archived_at")?.notNull).toBe(false);
    expect(columns.get("priority")?.default).toBe(0);
  });

  it("enforces exact window, priority, text, CTA, and canonical-href checks", () => {
    const table = announcementTable();
    if (!table) return;

    expect(table.checks.map((entry) => entry.name).sort()).toEqual([
      "site_announcements_cta_label_en_check",
      "site_announcements_cta_label_zh_hk_check",
      "site_announcements_href_check",
      "site_announcements_priority_check",
      "site_announcements_title_en_check",
      "site_announcements_title_zh_hk_check",
      "site_announcements_window_check",
    ]);
  });

  it("ships only migration 0019 with a generated snapshot and journal entry", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0019_wisetech_announcements.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0019_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE "site_announcements"');
    expect(migration).toContain('CONSTRAINT "site_announcements_window_check"');
    expect(migration).toContain('CONSTRAINT "site_announcements_priority_check"');
    expect(migration).toContain('CONSTRAINT "site_announcements_href_check"');
    expect(migration).not.toContain("DROP");

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables?: Record<string, unknown>;
    };
    expect(snapshot.tables).toHaveProperty("public.site_announcements");

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{idx?: number; tag?: string}>};
    expect(journal.entries?.find((entry) => entry.tag === "0019_wisetech_announcements"))
      .toMatchObject({idx: 19});
  });
});
