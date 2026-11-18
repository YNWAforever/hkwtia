import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {loadArchiveArticles} from "@/lib/news/archive-catalog";

const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "content/news-archive/manifest.json"), "utf8")) as {
  liveOrigin: string;
  reconciledWithLiveOrigin: boolean;
  databaseImport: {executed: boolean};
  counts: {discovered: number; imported: number; unresolvedArticles: number; mediaSource: number; mediaImported: number; mediaUnresolved: number};
  failed: {url: string; message: string}[];
  sitemapPostCount: number;
  sitemapOutsideListing: {imported: boolean; categories: string[]}[];
};

describe("imported hkwtia.org news archive", () => {
  const articles = loadArchiveArticles();

  it("reconciles the archived listing without claiming the blocked live origin", () => {
    expect(manifest.liveOrigin).toBe("cloudflare-challenge");
    expect(manifest.reconciledWithLiveOrigin).toBe(false);
    expect(manifest.databaseImport.executed).toBe(false);
    expect(manifest.counts.discovered).toBe(46);
    expect(manifest.counts.imported).toBe(articles.length);
    expect(manifest.counts.unresolvedArticles).toBe(manifest.failed.length);
    expect(manifest.counts.imported + manifest.counts.unresolvedArticles).toBe(manifest.counts.discovered);
    expect(manifest.failed.map((row) => row.url)).toEqual([
      "https://hkwtia.org/2020/01/2020-asia-smart-app-awards-2020",
    ]);
    expect(manifest.sitemapPostCount).toBe(58);
    expect(manifest.sitemapOutsideListing).toHaveLength(12);
    expect(manifest.sitemapOutsideListing.every((row) => row.imported === false)).toBe(true);
  });

  it("keeps unique slugs, source wording, and local media checksums", () => {
    expect(new Set(articles.map((article) => article.slug)).size).toBe(articles.length);
    expect(new Set(articles.map((article) => article.canonicalUrl)).size).toBe(articles.length);
    const sim = articles.find((article) => article.slug === "simcardregistration");
    const founding = articles.find((article) => article.slug === "2001-establishment-of-wtia");
    expect(sim?.plainText).toContain("政府擬制定電話智能卡實名登記制度");
    expect(sim?.plainText).not.toMatch(/<script/i);
    expect(founding?.plainText).toContain("Inauguration Ceremony of WTIA");
    expect(founding?.sourceLanguages).toEqual(["en"]);
    expect(sim?.sourceLanguages).toContain("zh-Hant");
    let checked = 0;
    for (const article of articles) {
      for (const block of article.blocks) {
        if (block.type !== "figure" && block.type !== "file") continue;
        if (!block.localPath || !block.sha256) continue;
        const stored = block.type === "figure" && block.originalPath ? block.originalPath : block.localPath;
        const bytes = readFileSync(resolve(process.cwd(), "public", stored.slice(1)));
        if (block.type === "file" || block.originalPath) {
          expect(createHash("sha256").update(bytes).digest("hex")).toBe(block.sha256);
        }
        checked += 1;
        expect(block.localPath.startsWith("/images/news-archive/") || block.localPath.startsWith("/files/news-archive/")).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(manifest.counts.mediaImported + manifest.counts.mediaUnresolved).toBe(manifest.counts.mediaSource);
  });
});
