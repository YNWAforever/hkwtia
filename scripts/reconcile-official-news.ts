import {createHash} from "node:crypto";
import {readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync} from "node:fs";
import {join} from "node:path";

import {canonicalNewsUrl, type ArchiveArticle} from "../lib/news/archive-document.ts";
import {reconcileOfficialArchive, type OfficialPost, type StoredAsset} from "../lib/news/reconcile-official-news.ts";

const ROOT = "content/news-archive";
const BASELINE = join(ROOT, "html-extract-baseline.json");

type Baseline = {
  plainChars: Record<string, number>;
  assets: Record<string, StoredAsset>;
};

const official = JSON.parse(readFileSync(join(ROOT, "official/sanitized-news.json"), "utf8")) as {
  news_archive: OfficialPost[];
  review_candidates: OfficialPost[];
};
const media = JSON.parse(readFileSync(join(ROOT, "official/required-media.json"), "utf8")) as {
  download_plan_required_news_public_assets_only: {source_url: string}[];
};

if (!existsSync(BASELINE)) {
  const plainChars: Record<string, number> = {};
  const assets: Record<string, StoredAsset> = {};
  for (const name of readdirSync(join(ROOT, "articles")).filter((file) => file.endsWith(".json"))) {
    const article = JSON.parse(readFileSync(join(ROOT, "articles", name), "utf8")) as ArchiveArticle;
    plainChars[article.canonicalUrl] = article.plainText.length;
    for (const block of article.blocks) {
      if ((block.type === "figure" || block.type === "file") && block.localPath && block.sha256) {
        assets[block.sourceUrl.split("?")[0] ?? block.sourceUrl] = {
          localPath: block.localPath,
          originalPath: block.type === "figure" ? block.originalPath : null,
          sha256: block.sha256,
        };
      }
    }
  }
  writeFileSync(BASELINE, `${JSON.stringify({plainChars, assets}, null, 2)}\n`);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
const byteClaimPath = join(ROOT, "asset-byte-claims.json");
const byteClaims = existsSync(byteClaimPath)
  ? new Map(Object.entries(JSON.parse(readFileSync(byteClaimPath, "utf8")) as Record<string, "wxr-size-match" | "current-url-not-wxr-proven" | "wxr-size-unknown">))
  : new Map();
const posts: OfficialPost[] = [
  ...official.news_archive.map((post) => ({...post, scope: "news_archive" as const})),
  ...official.review_candidates.map((post) => ({...post, scope: "review_candidate" as const})),
];
const result = reconcileOfficialArchive({
  posts,
  storedAssets: new Map(Object.entries(baseline.assets)),
  openUrls: new Set(media.download_plan_required_news_public_assets_only.map((item) => item.source_url.split("?")[0] ?? item.source_url)),
  previousPlainChars: new Map(Object.entries(baseline.plainChars).map(([url, chars]) => [canonicalNewsUrl(url), chars])),
  byteClaims,
});

const keep = new Set(result.articles.map((article) => `${article.slug}.json`));
for (const name of readdirSync(join(ROOT, "articles"))) {
  if (name.endsWith(".json") && !keep.has(name)) unlinkSync(join(ROOT, "articles", name));
}
for (const article of result.articles) {
  writeFileSync(join(ROOT, "articles", `${article.slug}.json`), `${JSON.stringify(article, null, 2)}\n`);
}
const review = result.review.map((post) => ({
  id: post.id,
  title: post.title,
  canonicalUrl: canonicalNewsUrl(post.canonical_url),
  publishedAt: post.published_at_utc,
  categories: post.categories,
  importedAsNews: false,
}));
writeFileSync(join(ROOT, "review-candidates.json"), `${JSON.stringify({count: review.length, items: review}, null, 2)}\n`);
const matrix = {
  source: "official-sanitized-wxr-news",
  databaseImportExecuted: false,
  newsArchive: result.articles.length,
  reviewCandidates: review.length,
  previousHtmlExtracts: result.rows.filter((row) => row.inPreviousHtmlExtract).length,
  rows: result.rows,
};
const matrixText = `${JSON.stringify(matrix, null, 2)}\n`;
writeFileSync(join(ROOT, "reconciliation-matrix.json"), matrixText);
writeFileSync(join(ROOT, "manifest.json"), `${JSON.stringify({
  databaseImport: {executed: false, reason: "Official reconciliation reads the sanitized export only. It does not write to the database."},
  liveOrigin: "not-refetched",
  reconciledWithLiveOrigin: false,
  officialCounts: {newsArchive: result.articles.length, archiveCategory: result.rows.filter((row) => row.categories.includes("Archive")).length, newsCategory: result.rows.filter((row) => row.categories.includes("News")).length, reviewCandidates: review.length},
  counts: {
    discovered: result.articles.length,
    imported: result.articles.length,
    unresolvedArticles: 0,
    mediaOpen: result.rows.reduce((sum, row) => sum + row.figuresOpen + row.filesOpen, 0),
    mediaStored: result.rows.reduce((sum, row) => sum + row.figuresStored, 0),
  },
  matrixSha256: createHash("sha256").update(matrixText).digest("hex"),
  articles: result.rows.map((row) => ({canonicalUrl: row.canonicalUrl, slug: row.destinationSlug, publishedAt: row.publishedAt, gap: row.gap})),
}, null, 2)}\n`);
const openAssets = result.articles.flatMap((article) => article.blocks.flatMap((block) => block.type === "figure" || block.type === "file" ? block.assetStatus === "open" ? [{slug: article.slug, sourceUrl: block.sourceUrl, error: block.error}] : [] : []));
writeFileSync(join(ROOT, "failed-links.json"), `${JSON.stringify({articles: [], openAssets}, null, 2)}\n`);
console.log(JSON.stringify({articles: result.articles.length, review: review.length, prior: result.rows.filter((row) => row.inPreviousHtmlExtract).length, open: openAssets.length}));
