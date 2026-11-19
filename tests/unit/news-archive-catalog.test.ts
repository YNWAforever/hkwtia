import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {loadArchiveArticles, resetArchiveCatalogForTests} from "@/lib/news/archive-catalog";

const root = process.cwd();
const matrix = JSON.parse(readFileSync(resolve(root, "content/news-archive/reconciliation-matrix.json"), "utf8")) as {
  newsArchive: number;
  reviewCandidates: number;
  previousHtmlExtracts: number;
  rows: {inPreviousHtmlExtract: boolean; gap: string | null; shortcodesRemainInPlainText: boolean; figuresOpen: number; filesOpen: number}[];
};
const review = JSON.parse(readFileSync(resolve(root, "content/news-archive/review-candidates.json"), "utf8")) as {count: number; items: {importedAsNews: boolean; importedWithSourceCategory: boolean; categories: string[]}[]};
const excoSearch = JSON.parse(readFileSync(resolve(root, "content/news-archive/exco-2022-photo-search.json"), "utf8")) as {officialReplacementFound: boolean; known404Retried: boolean};

describe("official news archive reconciliation", () => {
  resetArchiveCatalogForTests();
  const articles = loadArchiveArticles();
  const news = articles.filter((article) => article.collection === "news-archive");
  const candidates = articles.filter((article) => article.collection === "review-candidate");

  it("publishes the 49 official Archive and News posts and the 12 review candidates under their source categories", () => {
    expect(news).toHaveLength(49);
    expect(candidates).toHaveLength(12);
    expect(matrix.newsArchive).toBe(49);
    expect(matrix.reviewCandidates).toBe(12);
    expect(review.count).toBe(12);
    expect(review.items.every((item) => item.importedAsNews === false && item.importedWithSourceCategory === true)).toBe(true);
    expect(new Set(candidates.flatMap((article) => article.categories))).toEqual(new Set(["Resources", "Members' Update", "Meet our Members"]));
    expect(candidates.some((article) => article.categories.includes("Archive") || article.categories.includes("News"))).toBe(false);
    expect(excoSearch.officialReplacementFound).toBe(false);
    expect(excoSearch.known404Retried).toBe(false);
    expect(matrix.previousHtmlExtracts).toBe(45);
    expect(matrix.rows.filter((row) => row.gap === "no-prior-html-extract")).toHaveLength(4);
    expect(matrix.rows.every((row) => row.shortcodesRemainInPlainText === false)).toBe(true);
    expect(matrix.rows.reduce((sum, row) => sum + row.figuresOpen + row.filesOpen, 0)).toBe(1);
    const urls = new Set(news.map((article) => article.canonicalUrl));
    expect(urls.has("https://hkwtia.org/2020/01/2020-asia-smart-app-awards-2020")).toBe(true);
    expect(news.find((article) => article.canonicalUrl.endsWith("/2020-asia-smart-app-awards-2020"))?.plainText).toContain("Create Hong Kong");
    expect(candidates.filter((article) => article.categories.includes("Meet our Members")).every((article) => article.blocks.filter((block) => block.type === "figure").every((block) => block.type === "figure" && block.consent === "open-member-portrait"))).toBe(true);
  });

  it("checks stored files against their destination checksums and leaves open assets unstored", () => {
    let stored = 0;
    let open = 0;
    for (const article of news) {
      expect(article.plainText).not.toMatch(/\[fusion_/i);
      for (const block of article.blocks) {
        if (block.type !== "figure" && block.type !== "file") continue;
        if (block.assetStatus === "open") {
          open += 1;
          expect(block.localPath).toBeNull();
          continue;
        }
        if (block.assetStatus !== "stored" || !block.sha256) continue;
        const path = block.originalPath ?? block.localPath;
        expect(path).toBeTruthy();
        const bytes = readFileSync(resolve(root, "public", path!.slice(1)));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(block.sha256);
        stored += 1;
      }
    }
    expect(stored).toBeGreaterThan(0);
    expect(open).toBe(1);
    const claims = JSON.parse(readFileSync(resolve(root, "content/news-archive/asset-byte-claims.json"), "utf8")) as Record<string, string>;
    expect(claims["https://hkwtia.org/wp-content/uploads/2026/03/DSC08503-1-scaled.jpg"]).toBe("current-url-not-wxr-proven");
    expect(claims["https://hkwtia.org/wp-content/uploads/2020/03/2020-ASA--scaled.jpg"]).toBe("current-url-not-wxr-proven");
    expect(claims["https://hkwtia.org/wp-content/uploads/2020/03/2018-–-Develop-Market-Network-of-Internet-of-Vehicles-IoV-in-Mainland-China-.png"]).toBe("current-url-not-wxr-proven");
    expect(claims["https://hkwtia.org/wp-content/uploads/2020/02/2015-SafeWiFi.png"]).toBe("current-url-not-wxr-proven");
    const iov = news.flatMap((article) => article.blocks).find((block) => block.type === "figure" && block.sourceUrl.includes("2018-–-Develop-Market-Network"));
    expect(iov && iov.type === "figure" ? iov.byteClaim : null).toBe("current-url-not-wxr-proven");
    expect(iov && iov.type === "figure" ? iov.sha256 : "").toBe("dd2f64486c94dc7d62599eb71546d45ad9c50c561b102a9faaaad0bc75d3ae45");
    const openUrls = news.flatMap((article) => article.blocks).flatMap((block) => block.type === "figure" || block.type === "file" ? block.assetStatus === "open" ? [block.sourceUrl] : [] : []);
    expect(openUrls).toEqual(["https://hkwtia.org/wp-content/uploads/2022/09/301379874_4923078111125509_7909433195082011540_n-1-768x1024.jpg"]);
    const pdf = news.flatMap((article) => article.blocks).find((block) => block.type === "file" && block.sourceUrl.endsWith("annualreport_preview.pdf"));
    const reviewStored = candidates.flatMap((article) => article.blocks).filter((block) => (block.type === "figure" || block.type === "file") && block.assetStatus === "stored");
    expect(reviewStored.length).toBeGreaterThan(0);
    for (const block of reviewStored) {
      if (block.type !== "figure" && block.type !== "file") continue;
      const path = block.originalPath ?? block.localPath;
      expect(path).toBeTruthy();
      const bytes = readFileSync(resolve(root, "public", path!.slice(1)));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(block.sha256);
    }
    expect(pdf && pdf.type === "file" ? pdf.assetStatus : null).toBe("stored");
    expect(pdf && pdf.type === "file" ? pdf.sha256 : null).toBe("19b58667b0f39029855cfeae27802580aba8590b749f446dc162ccd4c834e82f");
    expect(pdf && pdf.type === "file" ? pdf.byteClaim : null).toBe("wxr-size-match");
  });
});
