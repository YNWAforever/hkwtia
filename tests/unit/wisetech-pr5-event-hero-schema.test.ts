import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {events} from "@/lib/db/schema-core";

describe("WiseTech PR5 Event hero schema", () => {
  it("defines a nullable Event hero FK and index", () => {
    const config = getTableConfig(events);
    expect(config.columns.find((column) => column.name === "hero_media_id")?.notNull).toBe(false);
    const foreignKey = config.foreignKeys.find((candidate) =>
      candidate.reference().columns.some((column) => column.name === "hero_media_id"),
    );
    expect(foreignKey?.reference().foreignColumns.map((column) => column.name)).toEqual(["id"]);
    expect(foreignKey?.onDelete).toBe("set null");
    expect(config.indexes.map((entry) => entry.config.name)).toContain("events_hero_media_idx");
  });

  it("ships matching generated migration artifacts without a backfill", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0023_wisetech_event_hero.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0023_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('ALTER TABLE "events" ADD COLUMN "hero_media_id" uuid');
    expect(migration).toContain('FOREIGN KEY ("hero_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action');
    expect(migration).toContain('CREATE INDEX "events_hero_media_idx" ON "events" USING btree ("hero_media_id")');
    expect(migration).not.toMatch(/\b(?:INSERT INTO|UPDATE "events" SET)\b/i);

    const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as {entries?: Array<{idx?: number; tag?: string}>};
    expect(journal.entries?.find((entry) => entry.tag === "0023_wisetech_event_hero")).toMatchObject({idx: 23});
  });
});
