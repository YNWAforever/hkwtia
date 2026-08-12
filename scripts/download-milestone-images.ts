import {existsSync, readdirSync, readFileSync} from "node:fs";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

import {extractArticleRegion, resolveImageSrc} from "@/scripts/extract-milestones";
import {retryable} from "@/scripts/capture-legacy-site";

/**
 * Downloads the milestone images from hkwtia.org into public/images/history/.
 *
 * The site capture (scripts/capture-legacy-site.ts) saved page HTML only, no
 * assets, so these files exist nowhere but the origin that is about to be
 * switched off. Own-origin hosting is also what the CSP requires: `img-src
 * 'self' data:`, with no remotePatterns declared in next.config.ts.
 */
const ORIGIN = "https://hkwtia.org";
const OUTPUT_DIR = "public/images/history";

// Measured by running extractImageUrls (the same region selection used
// below) over all 61 captured milestone pages. A materially higher count on
// a re-run most likely means the region logic started including the
// related-posts carousel again; materially lower means it is dropping real
// content. Either way, that is a bug to find before downloading, not after —
// an earlier count of this same archive was wrong by a factor of two and a
// half for exactly the first reason.
export const EXPECTED_UNIQUE_IMAGES = 73;

/**
 * Mirrors slugify() in scripts/capture-legacy-site.ts (already mirrored once
 * more in scripts/extract-milestones.ts), which is what actually named every
 * file under pages/. Needed here to find each milestone's captured HTML file
 * from its legacyPath before this script can recover that page's image urls.
 */
function slugify(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Recovers the original remote image urls referenced by a captured milestone
 * page, applying the identical region selection extract-milestones.ts uses
 * (own content only, "Related Posts" carousel excluded) so this script can
 * never download either a surplus of unrelated thumbnails or fewer files
 * than the content actually references.
 */
export function extractImageUrls(html: string): string[] {
  const region = extractArticleRegion(html);
  return [...region.matchAll(/<img[^>]*>/g)]
    .map((match) => resolveImageSrc(match[0]))
    .filter((src): src is string => src !== null);
}

/**
 * Maps a recovered remote image url to the filename it should be saved
 * under. 11 of the 73 real originals contain an en-dash or Chinese
 * characters, which milestoneSchema's src pattern
 * (/^\/images\/history\/[A-Za-z0-9._-]+$/) can never match, so
 * content/milestone-image-map.json records the ASCII-safe name a human
 * picked for each during review. Anything not in that map keeps its
 * original (already ASCII-safe) basename.
 */
export function localFilename(
  remoteUrl: string,
  renameMap: Readonly<Record<string, string>>,
): string {
  const original = remoteUrl.split("/").pop() ?? "";
  return renameMap[original] ?? original;
}

// The subset of the fetch() signature this script actually depends on, so a
// test can supply a fake without constructing a full DOM Response.
type FetchImpl = (
  url: string,
  init?: {headers?: Record<string, string>},
) => Promise<{ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>}>;

/**
 * Fetches one image with retry. hkwtia.org returns intermittent Cloudflare
 * 520s -- the same reason scripts/capture-legacy-site.ts's fetchText retries
 * -- and these files are irreplaceable once the site goes down, so a single
 * transient failure must not lose one.
 */
export async function fetchImageBytes(
  url: string,
  fetchImpl: FetchImpl,
  retryOptions: {attempts: number; delayMs: number},
): Promise<Buffer | null> {
  return retryable(async () => {
    const response = await fetchImpl(url, {headers: {"user-agent": "wtia-migration-capture"}});
    if (!response.ok) throw new Error(`${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }, retryOptions);
}

/**
 * Kept separate from the fetch loop so `saved` can only ever contain urls
 * this function actually wrote a file for — folding a failed fetch into
 * "saved" is exactly the kind of bug that would ship a broken <img> on a
 * page whose whole purpose is preserving the record. Mirrors capturePages()
 * in scripts/capture-legacy-site.ts for the same reason.
 */
export async function downloadImages(
  urls: readonly string[],
  fetchBinary: (url: string) => Promise<Buffer | null>,
  onImageFetched: (url: string, bytes: Buffer) => void | Promise<void>,
): Promise<{saved: string[]; missed: string[]}> {
  const saved: string[] = [];
  const missed: string[] = [];

  for (const url of urls) {
    const bytes = await fetchBinary(url);
    if (!bytes) {
      missed.push(url);
      continue;
    }
    await onImageFetched(url, bytes);
    saved.push(url);
  }

  return {saved, missed};
}

/**
 * Reads the images[].src values straight out of content/milestones.ts as
 * text rather than importing it. The file legitimately fails Zod validation
 * right now -- titleZh, bodyZh and most alt text are still empty pending
 * Task 7 -- so importing it would throw before this script could run at all.
 */
export function extractReferencedImagePaths(source: string): string[] {
  return [...source.matchAll(/src: '(\/images\/history\/[^']+)'/g)].map(([, src]) => src!);
}

async function main(): Promise<void> {
  const captureDir = process.argv[2];
  if (!captureDir) throw new Error("USAGE: download-milestone-images <capture-dir>");

  // content/milestones.ts cannot be imported (see extractReferencedImagePaths),
  // but the pre-review draft is plain JSON and carries the same 61 legacyPaths.
  const draft = JSON.parse(
    readFileSync("content/milestones.draft.json", "utf8"),
  ) as {milestones: {legacyPath: string}[]};

  const pagesDir = join(captureDir, "pages");
  const availablePages = new Set(readdirSync(pagesDir));

  const allRefs: string[] = [];
  const missingPages: string[] = [];
  for (const {legacyPath} of draft.milestones) {
    const file = `${slugify(`${ORIGIN}${legacyPath}`)}.html`;
    if (!availablePages.has(file)) {
      missingPages.push(legacyPath);
      continue;
    }
    const html = readFileSync(join(pagesDir, file), "utf8");
    allRefs.push(...extractImageUrls(html));
  }

  // draft.json was itself generated from these exact capture files, so this
  // should never fire -- if it does, the two inputs have drifted and every
  // count below would be unreliable.
  if (missingPages.length > 0) {
    throw new Error(
      `${missingPages.length} milestone page(s) referenced by content/milestones.draft.json `
        + `are missing from ${pagesDir}: ${missingPages.join(", ")}`,
    );
  }

  const uniqueUrls = [...new Set(allRefs)].sort();
  console.log(`recovered ${allRefs.length} image references across 61 pages, ${uniqueUrls.length} unique urls`);
  if (uniqueUrls.length !== EXPECTED_UNIQUE_IMAGES) {
    console.warn(
      `expected ${EXPECTED_UNIQUE_IMAGES} unique urls, got ${uniqueUrls.length} — `
        + "investigate the region selection (extractImageUrls) before trusting this download.",
    );
  }

  const renameMap = JSON.parse(
    readFileSync("content/milestone-image-map.json", "utf8"),
  ) as Record<string, string>;

  const filenameForUrl = new Map<string, string>();
  const urlForFilename = new Map<string, string>();
  for (const url of uniqueUrls) {
    const name = localFilename(url, renameMap);
    const claimedBy = urlForFilename.get(name);
    // Local filenames are basenames only; two different remote directories
    // could in principle both hold a same-named file. That never happens in
    // the current archive (verified: 73 unique urls, 73 unique local names),
    // but if it ever did, the second download would silently overwrite the
    // first rather than erroring — worth failing loudly instead.
    if (claimedBy && claimedBy !== url) {
      throw new Error(`two different remote images resolve to the same local filename "${name}": ${claimedBy} and ${url}`);
    }
    urlForFilename.set(name, url);
    filenameForUrl.set(url, name);
  }

  await mkdir(OUTPUT_DIR, {recursive: true});

  let totalBytes = 0;
  const {saved, missed} = await downloadImages(
    uniqueUrls,
    (url) => fetchImageBytes(url, fetch, {attempts: 5, delayMs: 2_000}),
    async (url, bytes) => {
      await writeFile(join(OUTPUT_DIR, filenameForUrl.get(url)!), bytes);
      totalBytes += bytes.length;
    },
  );

  console.log(`saved ${saved.length}, missed ${missed.length}`);
  console.log(`${(totalBytes / (1024 * 1024)).toFixed(2)} MB written to ${OUTPUT_DIR}`);
  if (missed.length > 0) {
    console.error(`MISSED (${missed.length}):`);
    for (const url of missed) console.error(`  ${url}`);
  }

  const milestonesSource = readFileSync("content/milestones.ts", "utf8");
  const referenced = extractReferencedImagePaths(milestonesSource);
  const missingOnDisk = [...new Set(referenced.filter((src) => !existsSync(join("public", src))))];
  console.log(`verified ${referenced.length} images[].src references in content/milestones.ts against disk`);
  if (missingOnDisk.length > 0) {
    console.error(`MISSING ON DISK (${missingOnDisk.length}):`);
    for (const src of missingOnDisk) console.error(`  ${src}`);
  } else {
    console.log("every referenced image exists on disk");
  }

  if (missed.length > 0 || missingOnDisk.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("download-milestone-images.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Milestone image download failed.");
    process.exitCode = 1;
  });
}
