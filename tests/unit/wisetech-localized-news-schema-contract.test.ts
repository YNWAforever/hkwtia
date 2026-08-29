import {existsSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {posts} from "@/lib/db/server-schema";

const ecmascriptWhitespaceSql = "U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'";
const missingTranslationExpression =
  `char_length(btrim(body_mdx_zh_hk, ${ecmascriptWhitespaceSql})) = 0`;

describe("WiseTech localized news schema contract", () => {
  it("adds exactly one nullable Traditional Chinese body column to posts", () => {
    const config = getTableConfig(posts);
    const column = config.columns.find((candidate) => candidate.name === "body_mdx_zh_hk");

    expect(column).toBeDefined();
    expect(column?.notNull).toBe(false);
    expect(column?.hasDefault).toBe(false);
  });

  it("keeps every posts kind and the existing English body contract unchanged", () => {
    const config = getTableConfig(posts);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    expect(columns.get("body_mdx")?.notNull).toBe(true);
    expect(columns.get("body_mdx_zh_hk")?.notNull).toBe(false);
    expect(posts.kind.enumValues).toEqual(["news", "buildlog", "page"]);
  });

  it("ships generated 0022 metadata without a false translation backfill", () => {
    const migrationPath = join(process.cwd(), "drizzle", "0022_wisetech_localized_news.sql");
    const snapshotPath = join(process.cwd(), "drizzle", "meta", "0022_snapshot.json");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(snapshotPath)).toBe(true);
    if (!existsSync(migrationPath) || !existsSync(snapshotPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('ALTER TABLE "posts" ADD COLUMN "body_mdx_zh_hk" text');
    expect(migration).not.toMatch(/UPDATE\s+"?posts"?/i);
    expect(migration).not.toMatch(/body_mdx_zh_hk[^;]*(?:DEFAULT|NOT NULL)/i);
    expect(migration).toContain("kind = 'news'");
    expect(migration).toContain("body_mdx_zh_hk IS NULL");

    const evidence = readFileSync(
      join(process.cwd(), "docs", "integration", "wisetech-pr4-migration-and-import.md"),
      "utf8",
    );
    expect(migration).toContain(missingTranslationExpression);
    expect(evidence).toContain(missingTranslationExpression);
    expect(migration).not.toContain("U&'\\\\0009");

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      tables?: Record<string, {columns?: Record<string, {notNull?: boolean; hasDefault?: boolean}>}>;
    };
    expect(snapshot.tables?.["public.posts"]?.columns?.body_mdx_zh_hk)
      .toMatchObject({notNull: false});

    const journal = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "_journal.json"),
      "utf8",
    )) as {entries?: Array<{idx?: number; tag?: string}>};
    const entries = journal.entries ?? [];
    const localizedNewsIndex = entries.findIndex((entry) => entry.idx === 22 && entry.tag === "0022_wisetech_localized_news");
    const eventHeroIndex = entries.findIndex((entry) => entry.idx === 23 && entry.tag === "0023_wisetech_event_hero");
    expect(localizedNewsIndex).toBeGreaterThan(-1);
    expect(eventHeroIndex).toBe(localizedNewsIndex + 1);
  });
});
