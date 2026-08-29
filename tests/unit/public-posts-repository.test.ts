import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {createPublicPostsRepository} from "@/lib/db/repos/public-posts";

const asOf = new Date("2026-07-30T12:00:00.000Z");
const publishedAt = new Date("2026-07-29T04:00:00.000Z");

type FixtureRow = Readonly<{
  slug: string;
  kind: "buildlog" | "page" | "news";
  titleEn: string;
  titleZh: string;
  bodyMdx: string;
  bodyMdxZhHk: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  author: string | null;
}>;

function row(
  slug: string,
  overrides: Partial<FixtureRow> = {},
): FixtureRow {
  return {
    slug,
    kind: "buildlog",
    titleEn: `${slug} English`,
    titleZh: `${slug} 中文`,
    bodyMdx: `## ${slug}\n\nPublished evidence.`,
    bodyMdxZhHk: `## ${slug}\n\n已發佈證據。`,
    publishedAt,
    archivedAt: null,
    author: "HKWTIA Engineering",
    ...overrides,
  };
}

const visibleZulu = row("visible-zulu");
const visibleAlpha = row("visible-alpha");
const fullDataset: readonly FixtureRow[] = [
  visibleZulu,
  row("future-build-log", {
    publishedAt: new Date("2026-07-31T00:00:00.000Z"),
  }),
  row("draft-build-log", {publishedAt: null}),
  row("page-post", {kind: "page"}),
  row("news-post", {kind: "news"}),
  // Published, but retired: must leave the feed and its slug route together.
  row("archived-news-post", {kind: "news", archivedAt: new Date("2026-07-30T00:00:00.000Z")}),
  visibleAlpha,
];

function summaryOf(fixture: FixtureRow) {
  return {
    slug: fixture.slug,
    titleEn: fixture.titleEn,
    titleZh: fixture.titleZh,
    publishedAt: fixture.publishedAt,
    author: fixture.author,
  };
}

function detailOf(fixture: FixtureRow) {
  return {
    ...summaryOf(fixture),
    bodyMdx: fixture.bodyMdx,
  };
}

function normalizedSql(query: string, params: unknown[]): string {
  return `${query.replace(/\s+/g, " ").trim()} ${params.map(String).join(" ")}`;
}

function predicateSensitiveProxy(dataset: readonly FixtureRow[]) {
  const statements: Array<{sql: string; params: unknown[]}> = [];
  const database = drizzle(async (query, params) => {
    statements.push({sql: normalizedSql(query, params), params});
    let filtered = [...dataset];

    const selectedKind = params.find(
      (value) => value === "buildlog" || value === "news" || value === "page",
    );
    if (/"posts"\."kind"\s*=\s*\$\d+/i.test(query) && typeof selectedKind === "string") {
      filtered = filtered.filter((fixture) => fixture.kind === selectedKind);
    }
    if (/"posts"\."published_at"\s+is\s+not\s+null/i.test(query)) {
      filtered = filtered.filter((fixture) => fixture.publishedAt !== null);
    }
    if (/"posts"\."published_at"\s*<=\s*\$\d+/i.test(query)) {
      const timestamp = params.find(
        (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value),
      );
      const cutoff = new Date(String(timestamp));
      filtered = filtered.filter(
        (fixture) => fixture.publishedAt === null || fixture.publishedAt <= cutoff,
      );
    }
    if (/"posts"\."archived_at"\s+is\s+null/i.test(query)) {
      filtered = filtered.filter((fixture) => fixture.archivedAt === null);
    }
    if (/"posts"\."title_zh"\s+is\s+not\s+null/i.test(query)) {
      filtered = filtered.filter((fixture) => fixture.titleZh !== null);
    }
    if (/btrim\("posts"\."title_zh"/i.test(query)) {
      filtered = filtered.filter((fixture) => fixture.titleZh.trim().length > 0);
    }
    if (/"posts"\."body_mdx_zh_hk"\s+is\s+not\s+null/i.test(query)) {
      filtered = filtered.filter((fixture) => fixture.bodyMdxZhHk !== null);
    }
    if (/btrim\("posts"\."body_mdx_zh_hk"/i.test(query)) {
      filtered = filtered.filter((fixture) => fixture.bodyMdxZhHk?.trim().length);
    }
    const selectedSlug = params.find(
      (value) => typeof value === "string" && dataset.some((fixture) => fixture.slug === value),
    );
    if (/"posts"\."slug"\s*=\s*\$\d+/i.test(query) && typeof selectedSlug === "string") {
      filtered = filtered.filter((fixture) => fixture.slug === selectedSlug);
    }
    if (/order by "posts"\."published_at" desc,\s*"posts"\."slug" asc/i.test(query)) {
      filtered.sort((left, right) => {
        const dateOrder =
          (right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY)
          - (left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
        return dateOrder || left.slug.localeCompare(right.slug);
      });
    }
    if (/\slimit\s+\$\d+/i.test(query)) {
      const limit = params.find((value) => typeof value === "number");
      filtered = filtered.slice(0, Number(limit));
    }

    const chineseNewsProjection =
      selectedKind === "news" && /"posts"\."body_mdx_zh_hk"/i.test(query);
    const detailProjection =
      selectedKind === "buildlog"
        ? /body_mdx/i.test(query)
        : /"posts"\."slug"\s*=\s*\$\d+/i.test(query);
    return {
      rows: filtered.map((fixture) => {
        if (selectedKind === "news") {
          return [
            fixture.slug,
            chineseNewsProjection ? fixture.titleZh : fixture.titleEn,
            fixture.publishedAt,
            fixture.author,
            chineseNewsProjection ? fixture.bodyMdxZhHk : fixture.bodyMdx,
          ];
        }
        const projected = [
          fixture.slug,
          fixture.titleEn,
          fixture.titleZh,
          fixture.publishedAt,
          fixture.author,
        ];
        return detailProjection ? [...projected, fixture.bodyMdx] : projected;
      }),
    };
  });

  return {database, statements};
}

describe("public posts repository", () => {
  it("uses every publication predicate to exclude future, draft, page, and news rows", async () => {
    const fixture = predicateSensitiveProxy(fullDataset);
    const repository = createPublicPostsRepository(
      async () => fixture.database as never,
    );

    const summaries = await repository.listPublishedBuildLogs(asOf);

    expect(summaries).toEqual([
      summaryOf(visibleAlpha),
      summaryOf(visibleZulu),
    ]);
    expect(summaries.map(({slug}) => slug)).not.toEqual(
      expect.arrayContaining([
        "future-build-log",
        "draft-build-log",
        "page-post",
        "news-post",
      ]),
    );

    expect(fixture.statements).toHaveLength(1);
    const [statement] = fixture.statements;
    expect(statement.sql).toMatch(/FROM "posts"/i);
    expect(statement.sql).toMatch(/kind.*=.*buildlog/i);
    expect(statement.sql).toMatch(/published_at.*IS NOT NULL/i);
    expect(statement.sql).toMatch(/published_at.*<=/i);
    expect(statement.sql).toMatch(
      /ORDER BY.*published_at.*DESC.*slug.*ASC/i,
    );
    expect(statement.sql).not.toMatch(
      /agent_run_id|source_key|profile|email|phone|summary/i,
    );
    expect(statement.sql).not.toMatch(/body_mdx/i);
    expect(statement.params).toEqual(
      expect.arrayContaining(["buildlog", asOf.toISOString()]),
    );
  });

  it("requires the safe slug predicate for the public detail projection", async () => {
    const fixture = predicateSensitiveProxy(fullDataset);
    const repository = createPublicPostsRepository(
      async () => fixture.database as never,
    );

    await expect(
      repository.getPublishedBuildLogBySlug(visibleAlpha.slug, asOf),
    ).resolves.toEqual(detailOf(visibleAlpha));

    expect(fixture.statements).toHaveLength(1);
    const [statement] = fixture.statements;
    expect(statement.sql).toMatch(/FROM "posts"/i);
    expect(statement.sql).toMatch(/kind.*=.*buildlog/i);
    expect(statement.sql).toMatch(/published_at.*IS NOT NULL/i);
    expect(statement.sql).toMatch(/published_at.*<=/i);
    expect(statement.sql).toMatch(/slug.*=/i);
    expect(statement.sql).toMatch(/LIMIT/i);
    expect(statement.sql).toMatch(/body_mdx/i);
    expect(statement.sql).not.toMatch(
      /agent_run_id|source_key|profile|email|phone|summary/i,
    );
    expect(statement.params).toEqual(
      expect.arrayContaining([
        "buildlog",
        visibleAlpha.slug,
        asOf.toISOString(),
        1,
      ]),
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

  it("rejects a projected positional row whose author is null", async () => {
    const malformed = row("malformed-author", {author: null});
    const database = drizzle(async () => ({
      rows: [[
        malformed.slug,
        malformed.titleEn,
        malformed.titleZh,
        malformed.publishedAt,
        malformed.author,
      ]],
    }));
    const repository = createPublicPostsRepository(
      async () => database as never,
    );

    await expect(repository.listPublishedBuildLogs(asOf)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({path: [0, "author"]}),
      ]),
    });
  });

  // Archiving retires a published post: it must leave the feed, its slug route
  // and (through listPublishedNews) the sitemap together. Unpublishing is the
  // reversible working state; archiving is not the same thing.
  it("excludes an archived news post from the feed", async () => {
    const fixture = predicateSensitiveProxy(fullDataset);
    const repository = createPublicPostsRepository(async () => fixture.database as never);

    const summaries = await repository.listPublishedNews("en", asOf);

    expect(summaries.map(({slug}) => slug)).toContain("news-post");
    expect(summaries.map(({slug}) => slug)).not.toContain("archived-news-post");
    expect(fixture.statements[0]?.sql).toMatch(/archived_at.*IS NULL/i);
  });

  it("applies a deterministic SQL limit without weakening news publication predicates", async () => {
    const fixture = predicateSensitiveProxy([
      row("zulu-news", {kind: "news"}),
      row("alpha-news", {kind: "news"}),
      row("future-news", {kind: "news", publishedAt: new Date("2026-07-31T00:00:00.000Z")}),
      row("draft-news", {kind: "news", publishedAt: null}),
      row("archived-news", {kind: "news", archivedAt: new Date("2026-07-30T00:00:00.000Z")}),
      row("buildlog-only"),
    ]);
    const repository = createPublicPostsRepository(async () => fixture.database as never);

    await expect(repository.listPublishedNews("en", asOf, {limit: 1}))
      .resolves.toMatchObject([{slug: "alpha-news"}]);
    expect(fixture.statements[0]?.sql).toMatch(/kind.*=.*news/i);
    expect(fixture.statements[0]?.sql).toMatch(/published_at.*IS NOT NULL/i);
    expect(fixture.statements[0]?.sql).toMatch(/published_at.*<=/i);
    expect(fixture.statements[0]?.sql).toMatch(/archived_at.*IS NULL/i);
    expect(fixture.statements[0]?.sql).toMatch(/ORDER BY.*published_at.*DESC.*slug.*ASC/i);
    expect(fixture.statements[0]?.sql).toMatch(/LIMIT/i);
    expect(fixture.statements[0]?.params).toContain(1);
  });

  it.each([0, 13, 1.5])("rejects invalid news limit %s before loading the database", async (limit) => {
    const loadDatabase = vi.fn();
    const repository = createPublicPostsRepository(loadDatabase);

    await expect(repository.listPublishedNews("en", asOf, {limit})).rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("returns null for an archived news slug", async () => {
    const fixture = predicateSensitiveProxy(fullDataset);
    const repository = createPublicPostsRepository(async () => fixture.database as never);

    await expect(repository.getPublishedNewsBySlug("en", "archived-news-post", asOf)).resolves.toBeNull();
    await expect(repository.getPublishedNewsBySlug("en", "news-post", asOf)).resolves.toMatchObject({slug: "news-post"});
  });
});
