import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {createPublicPostsRepository} from "@/lib/db/repos/public-posts";

const asOf = new Date("2026-07-30T12:00:00.000Z");
const publishedAt = new Date("2026-07-29T04:00:00.000Z");
const published = {
  slug: "m4-ai-ops-dashboard",
  titleEn: "How we built the AI-Ops dashboard",
  titleZh: "我們如何建立 AI 營運儀表板",
  publishedAt,
  author: "HKWTIA Engineering",
} as const;

function normalizedSql(query: string, params: unknown[]): string {
  return `${query.replace(/\s+/g, " ").trim()} ${params.map(String).join(" ")}`;
}

describe("public posts repository", () => {
  it("selects only the public summary allowlist for currently published build logs", async () => {
    const statements: Array<{sql: string; params: unknown[]}> = [];
    const database = drizzle(async (query, params) => {
      statements.push({sql: normalizedSql(query, params), params});
      return {rows: [[
        published.slug,
        published.titleEn,
        published.titleZh,
        published.publishedAt,
        published.author,
      ]]};
    });
    const repository = createPublicPostsRepository(async () => database as never);

    await expect(repository.listPublishedBuildLogs(asOf)).resolves.toEqual([published]);

    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toMatch(/FROM "posts"/i);
    expect(statements[0].sql).toMatch(/kind.*=.*buildlog/i);
    expect(statements[0].sql).toMatch(/published_at.*IS NOT NULL/i);
    expect(statements[0].sql).toMatch(/published_at.*<=/i);
    expect(statements[0].sql).toMatch(/ORDER BY.*published_at.*DESC.*slug.*ASC/i);
    expect(statements[0].sql).not.toMatch(
      /agent_run_id|source_key|profile|email|phone|summary/i,
    );
    expect(statements[0].sql).not.toMatch(/body_mdx/i);
    expect(statements[0].params).toEqual(
      expect.arrayContaining(["buildlog", asOf.toISOString()]),
    );
  });

  it("selects the public detail allowlist and limits lookup to one safe slug", async () => {
    const detail = {
      ...published,
      bodyMdx: "## Build notes\n\nPublished evidence.",
    };
    const statements: Array<{sql: string; params: unknown[]}> = [];
    const database = drizzle(async (query, params) => {
      statements.push({sql: normalizedSql(query, params), params});
      return {rows: [[
        detail.slug,
        detail.titleEn,
        detail.titleZh,
        detail.publishedAt,
        detail.author,
        detail.bodyMdx,
      ]]};
    });
    const repository = createPublicPostsRepository(async () => database as never);

    await expect(
      repository.getPublishedBuildLogBySlug(published.slug, asOf),
    ).resolves.toEqual(detail);

    expect(statements[0].sql).toMatch(/FROM "posts"/i);
    expect(statements[0].sql).toMatch(/kind.*=.*buildlog/i);
    expect(statements[0].sql).toMatch(/published_at.*IS NOT NULL/i);
    expect(statements[0].sql).toMatch(/published_at.*<=/i);
    expect(statements[0].sql).toMatch(/slug.*=/i);
    expect(statements[0].sql).toMatch(/LIMIT/i);
    expect(statements[0].sql).toMatch(/body_mdx/i);
    expect(statements[0].sql).not.toMatch(
      /agent_run_id|source_key|profile|email|phone|summary/i,
    );
    expect(statements[0].params).toEqual(
      expect.arrayContaining(["buildlog", published.slug, asOf.toISOString(), 1]),
    );
  });

  it("rejects invalid slugs before loading the database", async () => {
    const loadDatabase = vi.fn();
    const repository = createPublicPostsRepository(loadDatabase);

    await expect(
      repository.getPublishedBuildLogBySlug("../private", asOf),
    ).rejects.toThrow();
    await expect(
      repository.getPublishedBuildLogBySlug(`a${"-a".repeat(101)}`, asOf),
    ).rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["future", {kind: "buildlog", publishedAt: new Date("2026-07-31T00:00:00.000Z")}],
    ["null-published", {kind: "buildlog", publishedAt: null}],
    ["page", {kind: "page", publishedAt}],
    ["news", {kind: "news", publishedAt}],
  ])("never exposes a %s row", async (_name, hidden) => {
    const database = drizzle(async (query, params) => {
      const queryText = normalizedSql(query, params);
      const visible =
        /kind.*=.*buildlog/i.test(queryText)
        && /published_at.*is not null/i.test(queryText)
        && /published_at.*<=/i.test(queryText)
        && hidden.kind === "buildlog"
        && hidden.publishedAt instanceof Date
        && hidden.publishedAt <= asOf;
      return {rows: visible ? [{...published, publishedAt: hidden.publishedAt}] : []};
    });
    const repository = createPublicPostsRepository(async () => database as never);

    await expect(repository.listPublishedBuildLogs(asOf)).resolves.toEqual([]);
  });

  it("rejects malformed projected rows instead of widening the public contract", async () => {
    const database = drizzle(async () => ({
      rows: [{...published, author: null}],
    }));
    const repository = createPublicPostsRepository(async () => database as never);

    await expect(repository.listPublishedBuildLogs(asOf)).rejects.toThrow();
  });
});
