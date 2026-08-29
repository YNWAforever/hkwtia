import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import {createPublicPostsRepository} from "@/lib/db/repos/public-posts";

const asOf = new Date("2026-08-29T12:00:00.000Z");
const publishedAt = new Date("2026-08-28T12:00:00.000Z");

type NewsFixture = Readonly<{
  slug: string;
  titleEn: string;
  titleZh: string;
  bodyMdx: string;
  bodyMdxZhHk: string | null;
}>;

const chineseNews: NewsFixture = {
  slug: "bilingual-news",
  titleEn: "English news",
  titleZh: "繁體消息",
  bodyMdx: "English content",
  bodyMdxZhHk: "繁體內容",
};
const englishOnlyNews: NewsFixture = {
  slug: "english-only",
  titleEn: "English only",
  titleZh: "僅英文",
  bodyMdx: "English-only content",
  bodyMdxZhHk: null,
};
const whitespaceOnlyNews: NewsFixture = {
  slug: "whitespace-only",
  titleEn: "Whitespace only",
  titleZh: "只有空白",
  bodyMdx: "English fallback is forbidden",
  bodyMdxZhHk: "\u00a0\u3000\ufeff",
};

function fixtureDatabase(news: readonly NewsFixture[]) {
  return drizzle(async (query, params) => {
    const chinese = /body_mdx_zh_hk/i.test(query);
    const detail = /\bLIMIT\b/i.test(query);
    const slug = /"posts"\."slug"\s*=\s*\$\d+/i.test(query)
      ? params.find((value) => typeof value === "string" && news.some((row) => row.slug === value)) as string | undefined
      : undefined;
    const visible = news
      .filter((row) => !chinese || (row.bodyMdxZhHk?.trim().length ?? 0) > 0)
      .filter((row) => slug === undefined || row.slug === slug)
      .map((row) => {
        const title = chinese ? row.titleZh : row.titleEn;
        const body = chinese ? row.bodyMdxZhHk : row.bodyMdx;
        return detail
          ? [row.slug, title, publishedAt, "WTIA", body]
          : [row.slug, title, publishedAt, "WTIA"];
      });
    return {rows: visible};
  });
}

describe("localized public News projections", () => {
  it("omits null and ECMAScript-blank Chinese bodies without English fallback", async () => {
    const repository = createPublicPostsRepository(
      async () => fixtureDatabase([chineseNews, englishOnlyNews, whitespaceOnlyNews]) as never,
    );

    await expect(repository.listPublishedNews("zh-HK", asOf)).resolves.toEqual([{
      slug: chineseNews.slug,
      title: chineseNews.titleZh,
      publishedAt,
      author: "WTIA",
    }]);
    await expect(repository.getPublishedNewsBySlug("zh-HK", "english-only", asOf))
      .resolves.toBeNull();
  });

  it("returns one localized News body while Build Log readers retain bodyMdx", async () => {
    const repository = createPublicPostsRepository(
      async () => fixtureDatabase([chineseNews]) as never,
    );
    const buildLogRepository = createPublicPostsRepository(async () => drizzle(async () => ({
      rows: [["single-build-log", "English build log", "營運日誌", publishedAt, "WTIA", "single operational body"]],
    })) as never);

    await expect(repository.getPublishedNewsBySlug("zh-HK", chineseNews.slug, asOf))
      .resolves.toEqual({
        slug: chineseNews.slug,
        title: chineseNews.titleZh,
        publishedAt,
        author: "WTIA",
        body: "繁體內容",
      });
    await expect(buildLogRepository.getPublishedBuildLogBySlug("single-build-log", asOf))
      .resolves.toMatchObject({bodyMdx: "single operational body"});
  });
});
