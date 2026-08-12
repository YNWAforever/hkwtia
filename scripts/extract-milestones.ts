import {readFileSync, readdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

/**
 * Drafts `content/milestones.ts` from the captured hkwtia.org HTML.
 *
 * The output is a DRAFT. WordPress markup across 25 years is not uniform, so a
 * human corrects the result and the corrected file is what ships. This script
 * is committed so the extraction can be re-run and audited, not because its
 * output is trusted verbatim.
 */
export const FEATURED_WORD_THRESHOLD = 150;

export type ParsedMilestone = Readonly<{
  slug: string; year: number; month: string;
  titleEn: string; titleZh: string;
  bodyEn: string; bodyZh: string;
  images: readonly {src: string; altEn: string; altZh: string}[];
  legacyPath: string;
  featured: boolean;
}>;

export function slugFromLegacyPath(
  legacyPath: string,
): {slug: string; year: number; month: string} {
  const match = /^\/(\d{4})\/(\d{2})\/([a-z0-9-]+)\/$/.exec(legacyPath);
  if (!match) throw new Error(`UNEXPECTED_LEGACY_PATH: ${legacyPath}`);
  return {slug: match[3]!, year: Number(match[1]), month: match[2]!};
}

/**
 * Decodes a numeric character reference (&#8217; or &#x2019;), falling back to
 * the original text for anything out of the valid code point range rather
 * than throwing and losing the whole page over one malformed entity.
 */
function decodeNumericEntity(digits: string, radix: 10 | 16, original: string): string {
  const code = parseInt(digits, radix);
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
}

function decode(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    // WordPress/Yoast render typographic quotes, dashes and primes as numeric
    // entities rather than named ones -- confirmed on the real archive:
    // &#8220;/&#8221; (curly quotes) and &#8211; (en dash) alone account for
    // 34 occurrences across the 61 real posts. Left undecoded, these show up
    // as literal "&#8221;" text on the live page.
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => decodeNumericEntity(hex, 16, m))
    .replace(/&#(\d+);/g, (m, dec: string) => decodeNumericEntity(dec, 10, m))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMilestoneHtml(
  html: string,
  legacyPath: string,
): ParsedMilestone {
  const {slug, year, month} = slugFromLegacyPath(legacyPath);
  const rawTitle = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? "";
  const titleEn = decode(rawTitle).replace(/\s*\|\s*WTIA\b.*$/, "").trim();

  const article = /<article[\s\S]*?<\/article>/.exec(html)?.[0]
    ?? /<main[\s\S]*?<\/main>/.exec(html)?.[0]
    ?? html;

  // The theme renders a "Related Posts" carousel *inside* the <article> tag,
  // picking the site's other posts by recency rather than relevance to this
  // one — verified on the real archive: a 2020 postponement notice's related
  // posts were three unconnected 2025 announcements. It always comes last
  // (after the byline and share box, right before </article>, on all 45 of
  // the 61 real captures that have one), so truncating there is safe and
  // keeps its unrelated thumbnails out of this milestone's images.
  const region = article.split(/<section[^>]*\brelated-posts\b[^>]*>/)[0]!;

  const bodyEn = [...region.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(([, inner]) => decode(inner))
    .filter((text) => text.length > 0)
    .join("\n\n");

  const images = [...region.matchAll(/<img[^>]*>/g)].flatMap((match) => {
    const tag = match[0];
    const rawSrc = /src="([^"]+)"/.exec(tag)?.[1] ?? "";
    // WordPress lazy-loading (class="lazyload", seen on 2 of the 61 real
    // captured pages) replaces src with an inline blank-SVG placeholder and
    // puts the real URL in data-orig-src (or data-src/data-lazy-src,
    // depending on plugin). Without this fallback the placeholder's data:
    // URI is skipped below and the real content image is silently dropped.
    const src = rawSrc.startsWith("data:")
      ? (/data-orig-src="([^"]+)"/.exec(tag)?.[1]
        ?? /data-src="([^"]+)"/.exec(tag)?.[1]
        ?? /data-lazy-src="([^"]+)"/.exec(tag)?.[1]
        ?? "")
      : rawSrc;
    if (!src || src.startsWith("data:") || /logo/i.test(src)) return [];
    const file = src.split("/").pop() ?? "";
    return [{
      src: `/images/history/${file}`,
      altEn: decode(/alt="([^"]*)"/.exec(tag)?.[1] ?? ""),
      altZh: "",
    }];
  });

  return {
    slug, year, month,
    titleEn,
    // Left empty deliberately. Task 7 drafts the missing locale; shipping an
    // English string in the Chinese field would look translated when it is not.
    titleZh: "",
    bodyEn,
    bodyZh: "",
    images,
    legacyPath,
    featured: bodyEn.split(/\s+/).filter(Boolean).length >= FEATURED_WORD_THRESHOLD,
  };
}

/**
 * Mirrors slugify() in scripts/capture-legacy-site.ts, which is what actually
 * named every file under pages/. A naive `legacyPath.replace(/\//g, "-")`
 * leaves "%" untouched, so it silently fails to find every percent-encoded
 * (non-ASCII) slug — verified against the real archive, this drops exactly
 * the 12 Chinese-titled posts that most need a human's attention, while
 * reporting them as "missed" (not captured) when they were in fact captured
 * fine. File lookup has to use the identical transform capture used.
 */
function slugify(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractPostId(html: string): string | null {
  return /<article[^>]*\bid="post-(\d+)"/.exec(html)?.[1]
    ?? /[?&]p=(\d+)/.exec(html)?.[1]
    ?? null;
}

function main(): void {
  const captureDir = process.argv[2];
  if (!captureDir) throw new Error("USAGE: extract-milestones <capture-dir>");

  const inventory = JSON.parse(
    readFileSync(join(captureDir, "inventory.json"), "utf8"),
  ) as {capturedUrls: string[]};

  const milestoneUrls = inventory.capturedUrls
    .filter((url) => /^\/\d{4}\/\d{2}\//.test(new URL(url).pathname))
    .sort();

  const files = new Set(readdirSync(join(captureDir, "pages")));
  const parsed: ParsedMilestone[] = [];
  const missed: string[] = [];
  // WordPress falls back to a percent-encoded slug when a post's title is
  // Chinese and no manual slug was set. milestoneSchema.slug is ASCII-only by
  // design (see content/schemas.ts), so no automatic slug is possible for
  // these — a human has to pick one in Task 5. The content is still drafted
  // under a `pending-slug-<wordpress-post-id>` placeholder, using the site's
  // own stable numeric post id, rather than silently dropping 12 of the 61
  // captured pages or crashing the whole batch over them.
  const pendingSlug: string[] = [];

  for (const url of milestoneUrls) {
    const legacyPath = new URL(url).pathname;
    const file = `${slugify(url)}.html`;
    if (!files.has(file)) {
      missed.push(legacyPath);
      continue;
    }
    const html = readFileSync(join(captureDir, "pages", file), "utf8");

    try {
      parsed.push(parseMilestoneHtml(html, legacyPath));
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("UNEXPECTED_LEGACY_PATH")) {
        throw error;
      }
      const postId = extractPostId(html);
      const yearMonth = /^\/(\d{4}\/\d{2})\//.exec(legacyPath)?.[1];
      if (!postId || !yearMonth) {
        missed.push(legacyPath);
        continue;
      }
      // year/month come from the real path; only the slug is placeholder, and
      // legacyPath is restored below so Task 10's redirect map still points
      // at the true legacy URL rather than this synthetic one.
      const placeholder = parseMilestoneHtml(html, `/${yearMonth}/pending-slug-${postId}/`);
      parsed.push({...placeholder, legacyPath});
      pendingSlug.push(legacyPath);
    }
  }

  writeFileSync(
    "content/milestones.draft.json",
    `${JSON.stringify({milestones: parsed, missed}, null, 2)}\n`,
  );
  console.log(`drafted ${parsed.length}, missed ${missed.length}`);
  console.log(`featured: ${parsed.filter(({featured}) => featured).length}`);
  if (pendingSlug.length > 0) {
    console.log(`PENDING SLUG — needs a human-chosen slug (${pendingSlug.length}):`);
    for (const path of pendingSlug) console.log(`  ${path}`);
  }
}

if (process.argv[1]?.endsWith("extract-milestones.ts")) {
  main();
}
