/**
 * Idempotent archive of https://hkwtia.org/news/.
 * The live origin currently answers with a Cloudflare challenge. This script records that
 * and reads the public Wayback snapshots instead. It does not write to a database.
 */
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {join} from "node:path";

import sharp from "sharp";

import {canonicalNewsUrl, slugFromCanonicalUrl, type ArchiveArticle, type ArchiveBlock} from "../lib/news/archive-document.ts";
import {extractNewsArticle, parseNewsListing, parseSitemapLocs} from "../lib/news/extract-archive-article.ts";

const UA = "WTIA-archive-migration/1.0 (public research)";
const ROOT = "content/news-archive";
const REFRESH = process.argv.includes("--refresh");
const ORIGINAL_LIMIT = 2_500_000;

type FetchResult =
  | {kind: "ok"; body: string; sha256: string; timestamp: string | null}
  | {kind: "challenge"; status: number}
  | {kind: "error"; message: string};

async function main(): Promise<void> {
  await mkdir(join(ROOT, "snapshots"), {recursive: true});
  await mkdir(join(ROOT, "articles"), {recursive: true});
  await mkdir("public/images/news-archive/display", {recursive: true});
  await mkdir("public/images/news-archive/original", {recursive: true});
  await mkdir("public/files/news-archive", {recursive: true});

  const discovery = await discover();
  const articles: ArchiveArticle[] = [];
  const failed: {url: string; message: string}[] = [];
  let mediaSource = 0;
  let mediaImported = 0;
  let mediaUnresolved = 0;

  for (const url of discovery.listingUrls) {
    const fetched = await loadPage(url, snapshotName(url));
    if (fetched.kind !== "ok") {
      failed.push({url, message: fetched.kind === "challenge" ? "cloudflare-challenge" : fetched.message});
      continue;
    }
    const extracted = extractNewsArticle(fetched.body, url);
    extracted.waybackTimestamp = fetched.timestamp;
    extracted.sourceSha256 = fetched.sha256;
    const assets = await attachAssets(extracted.blocks);
    extracted.blocks = assets.blocks;
    mediaSource += assets.source;
    mediaImported += assets.imported;
    mediaUnresolved += assets.unresolved;
    if (assets.unresolved > 0 && extracted.extractionStatus === "extracted") extracted.extractionStatus = "partial";
    extracted.errors.push(...assets.errors);
    articles.push(extracted);
    await writeFile(join(ROOT, "articles", `${extracted.slug}.json`), `${JSON.stringify(extracted, null, 2)}\n`);
    await writeFile(join(ROOT, "snapshots", `${snapshotName(url)}.html`), snapshotHtml(fetched.body));
    console.log(`${extracted.extractionStatus} ${extracted.slug} media ${assets.imported}/${assets.source}`);
  }

  const outsideNotes: {url: string; categories: string[]; imported: boolean; error?: string}[] = [];
  for (const url of discovery.outsideListing) {
    const fetched = await loadPage(url, snapshotName(url));
    if (fetched.kind !== "ok") {
      outsideNotes.push({url, categories: [], imported: false, error: fetched.kind === "challenge" ? "cloudflare-challenge" : fetched.message});
      failed.push({url, message: outsideNotes.at(-1)!.error!});
      continue;
    }
    const extracted = extractNewsArticle(fetched.body, url);
    const newsCategory = extracted.categories.some((category) => /^(news|archive)$/i.test(category));
    outsideNotes.push({url, categories: extracted.categories, imported: newsCategory});
    if (!newsCategory) continue;
    extracted.waybackTimestamp = fetched.timestamp;
    extracted.sourceSha256 = fetched.sha256;
    const assets = await attachAssets(extracted.blocks);
    extracted.blocks = assets.blocks;
    mediaSource += assets.source;
    mediaImported += assets.imported;
    mediaUnresolved += assets.unresolved;
    articles.push(extracted);
    await writeFile(join(ROOT, "articles", `${extracted.slug}.json`), `${JSON.stringify(extracted, null, 2)}\n`);
    console.log(`outside-news ${extracted.slug} ${extracted.categories.join(",")}`);
  }

  const manifest = {
    databaseImport: {executed: false, reason: "Inserting into posts would mutate the database. Public routes read this static archive. Chinese source text is not copied into an English title field."},
    liveOrigin: discovery.liveOrigin,
    listingPages: discovery.listingPages,
    listingArticleCount: discovery.listingUrls.length,
    sitemapPostCount: discovery.sitemapUrls.length,
    sitemapOutsideListing: outsideNotes,
    categoryNewsCount: discovery.categoryNewsCount,
    wpJson: discovery.wpJson,
    counts: {
      discovered: discovery.listingUrls.length,
      imported: articles.filter((article) => article.extractionStatus !== "failed").length,
      unresolvedArticles: failed.length + articles.filter((article) => article.extractionStatus === "failed").length,
      mediaSource,
      mediaImported,
      mediaUnresolved,
    },
    reconciledWithLiveOrigin: false,
    articles: articles.map((article) => ({
      canonicalUrl: article.canonicalUrl,
      sourceId: article.sourceId,
      publishedAt: article.publishedAt,
      slug: article.slug,
      locales: article.sourceLanguages,
      extractionStatus: article.extractionStatus,
      photoCount: article.blocks.filter((block) => block.type === "figure").length,
      assets: article.blocks.flatMap((block) => block.type === "figure" || block.type === "file" ? [{
        sourceUrl: block.sourceUrl,
        localPath: block.localPath,
        originalPath: block.type === "figure" ? block.originalPath : null,
        sha256: block.sha256,
        error: block.error,
      }] : []),
      errors: article.errors,
    })),
    failed,
  };
  await writeFile(join(ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(ROOT, "failed-links.json"), `${JSON.stringify(failed, null, 2)}\n`);
  console.log(JSON.stringify(manifest.counts));
}

async function discover() {
  const live = await fetchPublic("https://hkwtia.org/news/");
  const liveOrigin = live.kind === "challenge" ? "cloudflare-challenge" : live.kind;
  const listingPages: {url: string; timestamp: string | null; count: number}[] = [];
  const listingUrls: string[] = [];
  const seen = new Set<string>();
  let pageUrl = "https://hkwtia.org/news/";
  for (let page = 1; page <= 20 && pageUrl; page += 1) {
    const fetched = await loadPage(pageUrl, `listing-${page}`);
    if (fetched.kind !== "ok") break;
    const parsed = parseNewsListing(fetched.body);
    listingPages.push({url: pageUrl, timestamp: fetched.timestamp, count: parsed.articleUrls.length});
    for (const url of parsed.articleUrls) {
      if (!seen.has(url)) {
        seen.add(url);
        listingUrls.push(url);
      }
    }
    const next = parsed.nextPageUrls.map((url) => canonicalNewsUrlSafe(url) ?? url).find((url) => !listingPages.some((item) => item.url === url));
    pageUrl = next ?? "";
  }
  const sitemap = await loadPage("https://hkwtia.org/post-sitemap.xml", "post-sitemap");
  const sitemapUrls = sitemap.kind === "ok" ? parseSitemapLocs(sitemap.body).map((url) => canonicalNewsUrlSafe(url)).filter((url): url is string => Boolean(url)) : [];
  const outsideListing = sitemapUrls.filter((url) => !seen.has(url));
  const category = await loadPage("https://hkwtia.org/category/news/", "category-news");
  const categoryNewsCount = category.kind === "ok" ? parseNewsListing(category.body).articleUrls.length : null;
  const wp = await fetchPublic("https://hkwtia.org/wp-json/wp/v2/posts?per_page=100");
  return {liveOrigin, listingPages, listingUrls, sitemapUrls, outsideListing, categoryNewsCount, wpJson: wp.kind === "challenge" ? "cloudflare-challenge" : wp.kind === "ok" ? "captured" : wp.message};
}

function canonicalNewsUrlSafe(url: string): string | null {
  try {
    return canonicalNewsUrl(url);
  } catch {
    return null;
  }
}

async function loadPage(url: string, name: string): Promise<FetchResult> {
  const path = join(ROOT, "snapshots", `${name}.html`);
  if (!REFRESH && existsSync(path) && !name.startsWith("listing") && name !== "post-sitemap" && name !== "category-news") {
    const body = await readFile(path, "utf8");
    return {kind: "ok", body, sha256: createHash("sha256").update(body).digest("hex"), timestamp: null};
  }
  const live = await fetchPublic(url);
  if (live.kind === "ok") return {...live, timestamp: null};
  const archived = await wayback(url);
  if (archived) return archived;
  return live.kind === "challenge" ? live : {kind: "error", message: live.kind === "error" ? live.message : "unavailable"};
}

async function fetchPublic(url: string): Promise<FetchResult> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {headers: {accept: "text/html,application/json", "user-agent": UA}, redirect: "follow"});
      const mitigated = response.headers.get("cf-mitigated");
      if (mitigated === "challenge" || response.status === 403) return {kind: "challenge", status: response.status};
      if (!response.ok) {
        if (attempt < 3 && response.status >= 500) {
          await delay(1000 * attempt);
          continue;
        }
        return {kind: "error", message: `http-${response.status}`};
      }
      const body = await response.text();
      if (body.includes("Just a moment") && body.includes("challenges.cloudflare.com")) return {kind: "challenge", status: response.status};
      return {kind: "ok", body, sha256: createHash("sha256").update(body).digest("hex"), timestamp: null};
    } catch (error) {
      if (attempt === 3) return {kind: "error", message: error instanceof Error ? error.message : "network"};
      await delay(1000 * attempt);
    }
  }
  return {kind: "error", message: "network"};
}

async function wayback(url: string): Promise<FetchResult | null> {
  const candidates = url.endsWith("/") ? [url] : [url, `${url}/`];
  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const available = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(candidate)}`, {headers: {"user-agent": UA}});
        if (!available.ok) {
          await delay(1000 * attempt);
          continue;
        }
        const data = await available.json() as {archived_snapshots?: {closest?: {available?: boolean; timestamp?: string; status?: string; url?: string}}};
        const closest = data.archived_snapshots?.closest;
        if (!closest?.available || !closest.timestamp) continue;
        const archivedUrl = closest.url?.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\//, `https://web.archive.org/web/${closest.timestamp}id_/`)
          ?? `https://web.archive.org/web/${closest.timestamp}id_/${candidate}`;
        const archived = await fetch(archivedUrl, {headers: {"user-agent": UA}});
        if (!archived.ok) {
          await delay(1000 * attempt);
          continue;
        }
        const body = await archived.text();
        if (!body.includes("entry-title") && !body.includes("post-content")) continue;
        return {kind: "ok", body, sha256: createHash("sha256").update(body).digest("hex"), timestamp: closest.timestamp};
      } catch {
        await delay(1000 * attempt);
      }
    }
  }
  return null;
}

async function attachAssets(blocks: ArchiveBlock[]): Promise<{blocks: ArchiveBlock[]; source: number; imported: number; unresolved: number; errors: string[]}> {
  let source = 0;
  let imported = 0;
  let unresolved = 0;
  const errors: string[] = [];
  const next: ArchiveBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "figure" && block.type !== "file") {
      next.push(block);
      continue;
    }
    source += 1;
    const stored = await storeAsset(block.sourceUrl, block.type);
    if (stored.localPath) imported += 1;
    else {
      unresolved += 1;
      errors.push(`${block.sourceUrl}: ${stored.error ?? "unresolved"}`);
    }
    next.push({...block, ...stored});
  }
  return {blocks: next, source, imported, unresolved, errors};
}

async function storeAsset(url: string, kind: "figure" | "file"): Promise<{localPath: string | null; originalPath: string | null; sha256: string | null; error: string | null}> {
  const fetched = await fetchBinary(url);
  if (!fetched) return {localPath: null, originalPath: null, sha256: null, error: "download-failed"};
  const sha256 = createHash("sha256").update(fetched.bytes).digest("hex");
  const id = sha256.slice(0, 16);
  if (kind === "file") {
    if (fetched.bytes.length > 8_000_000) {
      return {localPath: null, originalPath: null, sha256, error: `pdf-${fetched.bytes.length}-bytes-not-committed`};
    }
    const path = `/files/news-archive/${id}.pdf`;
    await writeFile(join("public", path), fetched.bytes);
    return {localPath: path, originalPath: null, sha256, error: null};
  }
  try {
    const image = sharp(fetched.bytes, {failOn: "none"}).rotate();
    const display = await image.clone().resize({width: 1600, height: 1600, fit: "inside", withoutEnlargement: true}).jpeg({quality: 78}).toBuffer();
    const displayPath = `/images/news-archive/display/${id}.jpg`;
    await writeFile(join("public", displayPath), display);
    let originalPath: string | null = null;
    if (fetched.bytes.length <= ORIGINAL_LIMIT) {
      const extension = extensionOf(url);
      originalPath = `/images/news-archive/original/${id}.${extension}`;
      await writeFile(join("public", originalPath), fetched.bytes);
    }
    return {localPath: displayPath, originalPath, sha256, error: fetched.bytes.length > ORIGINAL_LIMIT ? "original-over-2.5mb-not-committed" : null};
  } catch (error) {
    return {localPath: null, originalPath: null, sha256, error: error instanceof Error ? error.message : "image-decode"};
  }
}

async function fetchBinary(url: string): Promise<{bytes: Buffer} | null> {
  const live = await fetchBytes(url);
  if (live) return live;
  const available = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {headers: {"user-agent": UA}});
  if (!available.ok) return null;
  const data = await available.json() as {archived_snapshots?: {closest?: {timestamp?: string; available?: boolean}}};
  const timestamp = data.archived_snapshots?.closest?.available ? data.archived_snapshots.closest.timestamp : null;
  if (!timestamp) return null;
  return fetchBytes(`https://web.archive.org/web/${timestamp}id_/${url}`);
}

async function fetchBytes(url: string): Promise<{bytes: Buffer} | null> {
  try {
    const response = await fetch(url, {headers: {"user-agent": UA}});
    if (!response.ok || response.headers.get("cf-mitigated") === "challenge") return null;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 ? {bytes} : null;
  } catch {
    return null;
  }
}

function extensionOf(url: string): string {
  const match = new URL(url).pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match?.[1] ?? "bin";
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(extension) ? extension : "bin";
}

function snapshotName(url: string): string {
  return `post-${slugFromCanonicalUrl(canonicalNewsUrlSafe(url) ?? url)}`;
}

function snapshotHtml(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv.includes("--retry-failed")) await retryFailed();
else await main();

async function retryFailed(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(ROOT, "manifest.json"), "utf8")) as {
    sitemapOutsideListing: unknown;
    listingPages: unknown;
    sitemapPostCount: number;
    categoryNewsCount: number | null;
    wpJson: string;
    liveOrigin: string;
    articles: {canonicalUrl: string}[];
    counts: {mediaSource: number; mediaImported: number; mediaUnresolved: number};
  };
  const failed = JSON.parse(await readFile(join(ROOT, "failed-links.json"), "utf8")) as {url: string; message: string}[];
  const stillFailed: {url: string; message: string}[] = [];
  for (const item of failed) {
    const fetched = await loadPage(item.url, snapshotName(item.url));
    if (fetched.kind !== "ok") {
      stillFailed.push({url: item.url, message: fetched.kind === "challenge" ? "cloudflare-challenge" : fetched.message});
      console.log(`still-failed ${item.url}`);
      continue;
    }
    const extracted = extractNewsArticle(fetched.body, item.url);
    extracted.waybackTimestamp = fetched.timestamp;
    extracted.sourceSha256 = fetched.sha256;
    const assets = await attachAssets(extracted.blocks);
    extracted.blocks = assets.blocks;
    if (assets.unresolved > 0 && extracted.extractionStatus === "extracted") extracted.extractionStatus = "partial";
    extracted.errors.push(...assets.errors);
    await writeFile(join(ROOT, "articles", `${extracted.slug}.json`), `${JSON.stringify(extracted, null, 2)}\n`);
    await writeFile(join(ROOT, "snapshots", `${snapshotName(item.url)}.html`), snapshotHtml(fetched.body));
    manifest.counts.mediaSource += assets.source;
    manifest.counts.mediaImported += assets.imported;
    manifest.counts.mediaUnresolved += assets.unresolved;
    console.log(`recovered ${extracted.slug} ${extracted.extractionStatus}`);
  }
  const {readdirSync, readFileSync} = await import("node:fs");
  const articles = readdirSync(join(ROOT, "articles")).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(ROOT, "articles", name), "utf8")) as ArchiveArticle);
  const rebuilt = {
    ...manifest,
    reconciledWithLiveOrigin: false,
    counts: {
      discovered: 46,
      imported: articles.filter((article) => article.extractionStatus !== "failed").length,
      unresolvedArticles: stillFailed.length,
      mediaSource: manifest.counts.mediaSource,
      mediaImported: manifest.counts.mediaImported,
      mediaUnresolved: manifest.counts.mediaUnresolved,
    },
    articles: articles.map((article) => ({
      canonicalUrl: article.canonicalUrl,
      sourceId: article.sourceId,
      publishedAt: article.publishedAt,
      slug: article.slug,
      locales: article.sourceLanguages,
      extractionStatus: article.extractionStatus,
      photoCount: article.blocks.filter((block) => block.type === "figure").length,
      assets: article.blocks.flatMap((block) => block.type === "figure" || block.type === "file" ? [{
        sourceUrl: block.sourceUrl,
        localPath: block.localPath,
        originalPath: block.type === "figure" ? block.originalPath : null,
        sha256: block.sha256,
        error: block.error,
      }] : []),
      errors: article.errors,
    })),
    failed: stillFailed,
  };
  await writeFile(join(ROOT, "manifest.json"), `${JSON.stringify(rebuilt, null, 2)}\n`);
  await writeFile(join(ROOT, "failed-links.json"), `${JSON.stringify(stillFailed, null, 2)}\n`);
  console.log(JSON.stringify(rebuilt.counts));
}
