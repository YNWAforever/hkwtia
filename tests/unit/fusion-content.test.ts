import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {unwrapFusionContent} from "@/lib/news/fusion-content";
import {reconcileOfficialArchive, type OfficialPost} from "@/lib/news/reconcile-official-news";

describe("Fusion shortcode conversion", () => {
  it("keeps wording and drops builder attributes", () => {
    const html = unwrapFusionContent('[fusion_builder_container hundred_percent="yes"][fusion_text]政府擬制定電話智能卡實名登記制度。[/fusion_text][/fusion_builder_container]');
    expect(html).toContain("政府擬制定電話智能卡實名登記制度");
    expect(html).not.toContain("hundred_percent");
    expect(html).not.toContain("[fusion_");
  });

  it("keeps a table, a button link, and a content-box title", () => {
    const html = unwrapFusionContent(`[fusion_text]<table><tr><td>諮詢期</td><td>不足兩月</td></tr></table>[/fusion_text][fusion_button link="https://bestasiaapp.hk/" target="_blank"]Details[/fusion_button][fusion_content_box title="紀念特刊" link="https://hkwtia.org/wp-content/uploads/2022/10/annualreport_preview.pdf" linktext="Download Here!"]<p>正文</p>[/fusion_content_box]`);
    expect(html).toContain("<table>");
    expect(html).toContain("不足兩月");
    expect(html).toContain('href="https://bestasiaapp.hk/"');
    expect(html).toContain("Details");
    expect(html).toContain("紀念特刊");
    expect(html).toContain("annualreport_preview.pdf");
    expect(html).not.toContain("animation_speed");
  });
});

describe("official news reconciliation", () => {
  const official = JSON.parse(readFileSync(resolve(process.cwd(), "content/news-archive/official/sanitized-news.json"), "utf8")) as {
    news_archive: OfficialPost[];
    review_candidates: OfficialPost[];
  };
  const media = JSON.parse(readFileSync(resolve(process.cwd(), "content/news-archive/official/required-media.json"), "utf8")) as {
    download_plan_required_news_public_assets_only: {source_url: string; filesize: number | null}[];
  };
  const posts: OfficialPost[] = [
    ...official.news_archive.map((post) => ({...post, scope: "news_archive" as const})),
    ...official.review_candidates.map((post) => ({...post, scope: "review_candidate" as const})),
  ];
  const openUrls = new Set(media.download_plan_required_news_public_assets_only.map((item) => item.source_url));

  it("imports 49 archive and news posts, keeps 12 review items in their source categories, and is idempotent", () => {
    const first = reconcileOfficialArchive({posts, storedAssets: new Map(), openUrls, previousPlainChars: new Map()});
    const second = reconcileOfficialArchive({posts, storedAssets: new Map(), openUrls, previousPlainChars: new Map()});
    expect(first.articles).toHaveLength(49);
    expect(first.reviewArticles).toHaveLength(12);
    expect(first.review).toHaveLength(12);
    expect(first.articles.map((article) => article.canonicalUrl)).toEqual(second.articles.map((article) => article.canonicalUrl));
    expect(first.articles.map((article) => article.plainText)).toEqual(second.articles.map((article) => article.plainText));
    expect(first.articles.every((article) => article.collection === "news-archive")).toBe(true);
    expect(first.articles.some((article) => article.categories.includes("Meet our Members"))).toBe(false);
    expect(new Set(first.reviewArticles.flatMap((article) => article.categories))).toEqual(new Set(["Resources", "Members' Update", "Meet our Members"]));
    expect(first.reviewArticles.filter((article) => article.categories.includes("Meet our Members")).every((article) => article.blocks.some((block) => block.type === "figure" && block.consent === "open-member-portrait"))).toBe(true);
    const asa = first.articles.find((article) => article.canonicalUrl.endsWith("/2020/01/2020-asia-smart-app-awards-2020"));
    expect(asa?.plainText).toContain("Create Hong Kong");
    expect(first.articles.some((article) => /\[fusion_/i.test(article.plainText))).toBe(false);
    const open = first.articles.flatMap((article) => article.blocks).filter((block) => (block.type === "figure" || block.type === "file") && block.assetStatus === "open");
    expect(open).toHaveLength(19);
    expect(open.every((block) => block.type === "figure" || block.type === "file" ? block.localPath === null : false)).toBe(true);
    const pdf = open.find((block) => block.type === "file");
    expect(pdf && pdf.type === "file" ? pdf.sourceUrl : "").toContain("annualreport_preview.pdf");
    const iov = open.find((block) => block.type === "figure" && block.sourceUrl.includes("2018-"));
    expect(iov && iov.type === "figure" ? iov.localPath : "present").toBeNull();
  });
});
