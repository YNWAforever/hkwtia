import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import {createPublicPostsRepository} from "@/lib/db/repos/public-posts";

const asOf = new Date("2026-08-29T12:00:00.000Z");
const publishedAt = new Date("2026-08-28T12:00:00.000Z");
type Fixture = Readonly<{slug: string; titleZh: string | null; bodyMdxZhHk: string | null}>;
const fixtures: readonly Fixture[] = [
  {slug: "valid", titleZh: "有效標題", bodyMdxZhHk: "有效內容"},
  {slug: "null-title", titleZh: null, bodyMdxZhHk: "內容"},
  {slug: "blank-title", titleZh: "\u00a0\u3000\ufeff", bodyMdxZhHk: "內容"},
  {slug: "null-body", titleZh: "無內容", bodyMdxZhHk: null},
  {slug: "blank-body", titleZh: "空白內容", bodyMdxZhHk: "\u00a0\u3000\ufeff"},
];
function repositoryWithRawLocalizedRows() {
  const statements: string[] = [];
  const database = drizzle(async (query, params) => {
    statements.push(query);
    const slug = params.find((value) => typeof value === "string" && fixtures.some((fixture) => fixture.slug === value));
    const rows = fixtures.filter((fixture) => slug === undefined || fixture.slug === slug).map((fixture) => [fixture.slug, fixture.titleZh, publishedAt, "WTIA", fixture.bodyMdxZhHk]);
    return {rows};
  });
  return {repository: createPublicPostsRepository(async () => database as never), statements};
}
describe("Chinese News title and body eligibility", () => {
  it("omits null and ECMAScript-blank localized title/body rows before DTO parsing", async () => {
    const {repository, statements} = repositoryWithRawLocalizedRows();
    await expect(repository.listPublishedNews("zh-HK", asOf)).resolves.toEqual([{slug: "valid", title: "有效標題", publishedAt, author: "WTIA"}]);
    for (const slug of ["null-title", "blank-title", "null-body", "blank-body"]) await expect(repository.getPublishedNewsBySlug("zh-HK", slug, asOf)).resolves.toBeNull();
    expect(statements[0]).toMatch(/btrim\("posts"\."title_zh"/i);
    expect(statements[0]).toMatch(/btrim\("posts"\."body_mdx_zh_hk"/i);
  });
});
