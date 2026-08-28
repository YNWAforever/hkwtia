import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {media} from "@/lib/db/server-schema";

const uploadColumns = [
  "storage_key", "storage_etag", "original_filename", "content_type", "byte_size",
  "width", "height", "focal_x", "focal_y", "checksum_sha256",
];

describe("WiseTech private media upload schema", () => {
  it("adds one all-or-none nullable metadata group with bounded checks", () => {
    const table = getTableConfig(media);
    const columns = new Map(table.columns.map((column) => [column.name, column]));
    for (const name of uploadColumns) {
      expect(columns.get(name), name).toBeDefined();
      expect(columns.get(name)?.notNull, name).toBe(false);
    }
    const checks = table.checks.map((entry) => entry.name).sort();
    expect(checks).toEqual(expect.arrayContaining([
      "media_upload_metadata_all_or_none_check",
      "media_upload_byte_size_check",
      "media_upload_dimensions_check",
      "media_upload_focal_check",
      "media_upload_checksum_check",
      "media_upload_etag_check",
      "media_upload_content_type_check",
    ]));
    expect(table.indexes.find((entry) => entry.config.name === "media_storage_key_unique")?.config.unique)
      .toBe(true);
  });

  it("ships only generated migration 0021, matching snapshot, journal, and verification evidence", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0021_wisetech_media_upload.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0021_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    for (const name of uploadColumns) expect(migration).toContain(`\"${name}\"`);
    expect(migration).toContain("media_upload_metadata_all_or_none_check");
    expect(migration).toContain("4194304");
    expect(migration).toContain("40000000");
    expect(migration).toContain("^[0-9a-f]{64}$");
    expect(migration).not.toContain("DROP");

    const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
      entries: Array<{idx: number; tag: string}>;
    };
    expect(journal.entries.at(-1)).toMatchObject({idx: 21, tag: "0021_wisetech_media_upload"});

    const evidence = readFileSync(
      join(process.cwd(), "docs/integration/wisetech-pr4-migration-and-import.md"), "utf8",
    );
    expect(evidence).toContain("## Task 4 — secure media upload and delivery");
    expect(evidence).toContain("uploaded media with incomplete metadata");
    expect(evidence).toContain("original_filename,alt_en,alt_zh,focal_x,focal_y,source_file");
  });
});
