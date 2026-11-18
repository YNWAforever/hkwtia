import {createHash} from "node:crypto";

import {canonicalNewsUrl, slugFromCanonicalUrl, type ArchiveArticle, type ArchiveBlock} from "@/lib/news/archive-document";
import {extractNewsArticle} from "@/lib/news/extract-archive-article";
import {unwrapFusionContent} from "@/lib/news/fusion-content";

export type OfficialPost = Readonly<{
  id: string;
  title: string;
  canonical_url: string;
  published_at_utc: string;
  modified_at_utc: string | null;
  categories: readonly string[];
  author_byline: string;
  featured_image_url: string | null;
  content: string;
  scope: "news_archive" | "review_candidate";
}>;

export type StoredAsset = Readonly<{
  localPath: string;
  originalPath: string | null;
  sha256: string;
}>;

export type ReconciliationRow = Readonly<{
  sourceId: string;
  canonicalUrl: string;
  destinationSlug: string;
  publishedAt: string;
  categories: readonly string[];
  inPreviousHtmlExtract: boolean;
  officialContentSha256: string;
  destinationPlainSha256: string;
  officialPlainChars: number;
  previousPlainChars: number | null;
  headings: number;
  lists: number;
  tables: number;
  figures: number;
  figuresStored: number;
  figuresOpen: number;
  files: number;
  filesOpen: number;
  shortcodesRemainInPlainText: boolean;
  gap: string | null;
}>;

const OPEN_ERROR = "open-awaiting-parent-file";

export function reconcileOfficialArchive(input: Readonly<{
  posts: readonly OfficialPost[];
  storedAssets: ReadonlyMap<string, StoredAsset>;
  openUrls: ReadonlySet<string>;
  previousPlainChars: ReadonlyMap<string, number>;
}>): {articles: ArchiveArticle[]; rows: ReconciliationRow[]; review: OfficialPost[]} {
  const articles: ArchiveArticle[] = [];
  const rows: ReconciliationRow[] = [];
  const review = input.posts.filter((post) => post.scope === "review_candidate");
  const slugs = new Set<string>();
  for (const post of input.posts) {
    if (post.scope !== "news_archive") continue;
    const canonical = canonicalNewsUrl(post.canonical_url);
    const html = unwrapFusionContent(post.content);
    const wrapped = syntheticPage(post, canonical, html);
    const extracted = extractNewsArticle(wrapped, canonical);
    extracted.sourceId = post.id;
    extracted.publishedAt = post.published_at_utc;
    extracted.modifiedAt = post.modified_at_utc;
    extracted.author = post.author_byline || extracted.author;
    extracted.categories = [...post.categories];
    extracted.title = post.title;
    if (post.featured_image_url) addFeatured(extracted, post.featured_image_url);
    extracted.blocks = extracted.blocks.map((block) => applyAsset(block, input.storedAssets, input.openUrls));
    extracted.slug = uniqueSlug(slugFromCanonicalUrl(canonical), slugs);
    const openBlocks = extracted.blocks.some((block) => block.type === "figure" || block.type === "file" ? block.assetStatus === "open" : false);
    extracted.extractionStatus = openBlocks ? "partial" : "extracted";
    extracted.errors = extracted.blocks.flatMap((block) => block.type === "figure" || block.type === "file" ? block.error ? [`${block.sourceUrl}: ${block.error}`] : [] : []);
    extracted.sourceSha256 = sha256(post.content);
    articles.push(extracted);
    const previous = input.previousPlainChars.get(canonical) ?? null;
    rows.push({
      sourceId: post.id,
      canonicalUrl: canonical,
      destinationSlug: extracted.slug,
      publishedAt: extracted.publishedAt,
      categories: extracted.categories,
      inPreviousHtmlExtract: previous !== null,
      officialContentSha256: extracted.sourceSha256,
      destinationPlainSha256: sha256(extracted.plainText),
      officialPlainChars: extracted.plainText.length,
      previousPlainChars: previous,
      headings: extracted.blocks.filter((block) => block.type === "heading").length,
      lists: extracted.blocks.filter((block) => block.type === "list").length,
      tables: extracted.blocks.filter((block) => block.type === "table").length,
      figures: extracted.blocks.filter((block) => block.type === "figure").length,
      figuresStored: extracted.blocks.filter((block) => block.type === "figure" && block.assetStatus === "stored").length,
      figuresOpen: extracted.blocks.filter((block) => block.type === "figure" && block.assetStatus === "open").length,
      files: extracted.blocks.filter((block) => block.type === "file").length,
      filesOpen: extracted.blocks.filter((block) => block.type === "file" && block.assetStatus === "open").length,
      shortcodesRemainInPlainText: /\[fusion_/i.test(extracted.plainText),
      gap: previous === null ? "no-prior-html-extract" : null,
    });
  }
  return {articles, rows, review};
}

function syntheticPage(post: OfficialPost, canonical: string, html: string): string {
  return `<html><head>
    <meta property="og:url" content="${canonical}" />
    <meta property="article:published_time" content="${post.published_at_utc}" />
    <meta name="author" content="${post.author_byline}" />
    </head><body class="postid-${post.id}">
    <h1 class="entry-title">${escapeText(post.title)}</h1>
    <div class="post-content">${html}</div>
    </body></html>`;
}

function addFeatured(article: ArchiveArticle, url: string): void {
  const present = article.blocks.some((block) => block.type === "figure" && block.sourceUrl.split("?")[0] === url.split("?")[0]);
  if (present) return;
  article.blocks = [{
    type: "figure",
    sourceUrl: url,
    alt: "",
    caption: [],
    localPath: null,
    originalPath: null,
    sha256: null,
    error: null,
    assetStatus: "unresolved",
  }, ...article.blocks];
}

function applyAsset(block: ArchiveBlock, stored: ReadonlyMap<string, StoredAsset>, openUrls: ReadonlySet<string>): ArchiveBlock {
  if (block.type !== "figure" && block.type !== "file") return block;
  const key = block.sourceUrl.split("?")[0] ?? block.sourceUrl;
  const asset = stored.get(key) ?? stored.get(block.sourceUrl);
  if (asset) {
    return {...block, localPath: asset.localPath, originalPath: asset.originalPath, sha256: asset.sha256, error: null, assetStatus: "stored"};
  }
  if (openUrls.has(key) || openUrls.has(block.sourceUrl)) {
    return {...block, localPath: null, originalPath: null, sha256: null, error: OPEN_ERROR, assetStatus: "open"};
  }
  return {...block, assetStatus: block.localPath ? "stored" : "unresolved"};
}

function uniqueSlug(slug: string, used: Set<string>): string {
  let candidate = slug;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
