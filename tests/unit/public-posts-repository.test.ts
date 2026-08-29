import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import {createPublicPostsRepository} from "@/lib/db/repos/public-posts";

const asOf = new Date("2026-07-30T12:00:00.000Z");
const publishedAt = new Date("2026-07-29T04:00:00.000Z");
type Row = Readonly<{slug: string; kind: "buildlog" | "news" | "page"; titleEn: string; titleZh: string; bodyMdx: string; bodyMdxZhHk: string | null; publishedAt: Date | null; archivedAt: Date | null; author: string}>;
const row = (slug: string, overrides: Partial<Row> = {}): Row => ({slug, kind: "news", titleEn: `${slug} English`, titleZh: `${slug} 中文`, bodyMdx: `## ${slug}`, bodyMdxZhHk: `## ${slug} 中文`, publishedAt, archivedAt: null, author: "WTIA", ...overrides});

function database(rows: readonly Row[]) {
  const statements: Array<{query: string; params: unknown[]}> = [];
  const db = drizzle(async (query, params) => {
    statements.push({query, params});
    const kind = params.find((value) => value === "buildlog" || value === "news" || value === "page");
    const cutoff = params.find((value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value));
    const slug = params.find((value) => typeof value === "string" && rows.some((entry) => entry.slug === value));
    const limit = params.find((value) => typeof value === "number");
    const chinese = /body_mdx_zh_hk/i.test(query);
    const detail = /\blimit\b/i.test(query);
    const filtered = rows.filter((entry) =>
      entry.kind === kind && entry.publishedAt !== null && entry.publishedAt <= new Date(String(cutoff)) && entry.archivedAt === null && (slug === undefined || entry.slug === slug) && (!chinese || (entry.bodyMdxZhHk?.trim().length ?? 0) > 0),
    ).sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) || a.slug.localeCompare(b.slug)).slice(0, typeof limit === "number" ? limit : undefined);
    return {rows: filtered.map((entry) => kind === "news" ? (detail ? [entry.slug, chinese ? entry.titleZh : entry.titleEn, entry.publishedAt, entry.author, chinese ? entry.bodyMdxZhHk : entry.bodyMdx] : [entry.slug, chinese ? entry.titleZh : entry.titleEn, entry.publishedAt, entry.author]) : (detail ? [entry.slug, entry.titleEn, entry.titleZh, entry.publishedAt, entry.author, entry.bodyMdx] : [entry.slug, entry.titleEn, entry.titleZh, entry.publishedAt, entry.author]))};
  });
  return {db, statements};
}

describe("public posts repository", () => {
  it("retains the Build Log kind and single body projection", async () => {
    const fixture = database([row("build", {kind: "buildlog"}), row("news")]);
    const repository = createPublicPostsRepository(async () => fixture.db as never);
    await expect(repository.getPublishedBuildLogBySlug("build", asOf)).resolves.toMatchObject({slug: "build", bodyMdx: "## build"});
    expect(fixture.statements[0]?.params).toContain("buildlog");
    expect(fixture.statements[0]?.query).toContain("body_mdx");
  });

  it("uses publication, archive, ordering, and limit predicates for English News", async () => {
    const fixture = database([row("zulu"), row("alpha"), row("future", {publishedAt: new Date("2026-07-31T00:00:00.000Z")}), row("archived", {archivedAt: asOf}), row("build", {kind: "buildlog"})]);
    const repository = createPublicPostsRepository(async () => fixture.db as never);
    await expect(repository.listPublishedNews("en", asOf, {limit: 1})).resolves.toEqual([{slug: "alpha", title: "alpha English", publishedAt, author: "WTIA"}]);
    expect(fixture.statements[0]?.params).toContain("news");
  });

  it("excludes null and ECMAScript-blank Chinese News bodies", async () => {
    const fixture = database([row("bilingual"), row("null", {bodyMdxZhHk: null}), row("blank", {bodyMdxZhHk: "\u00a0\u3000\ufeff"})]);
    const repository = createPublicPostsRepository(async () => fixture.db as never);
    await expect(repository.listPublishedNews("zh-HK", asOf)).resolves.toEqual([{slug: "bilingual", title: "bilingual 中文", publishedAt, author: "WTIA"}]);
    await expect(repository.getPublishedNewsBySlug("zh-HK", "null", asOf)).resolves.toBeNull();
  });

  it.each([0, 13, 1.5])("rejects invalid News limit %s before loading", async (limit) => {
    const load = vi.fn();
    const repository = createPublicPostsRepository(load);
    await expect(repository.listPublishedNews("en", asOf, {limit})).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
