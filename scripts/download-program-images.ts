import {existsSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

// downloadImages and fetchImageBytes already carry the Cloudflare 520 retry
// hkwtia.org needs, and the loop that can only report a url as saved once a
// file was actually written for it. Reusing them keeps one implementation of
// the bug that would otherwise ship a broken <img> on a page whose whole
// purpose is preserving the record.
import {downloadImages, fetchImageBytes} from "@/scripts/download-milestone-images";
import {extractArticleRegion, resolveImageSrc} from "@/scripts/extract-milestones";
import type {ProgramId} from "@/scripts/index-program-pages";

/**
 * Downloads the programme images from hkwtia.org into public/images/programs/.
 *
 * Same situation as the milestone pass: the site capture saved page HTML only,
 * so these files exist nowhere but the origin that is about to be switched off.
 * Own-origin hosting is also what the CSP requires -- `img-src 'self' data:`,
 * with no remotePatterns in next.config.ts, so a hotlinked image would render
 * nothing even while the old site is still up.
 */
const OUTPUT_DIR = "public/images/programs";

/**
 * Measured by running the extraction below over the 95 pages in
 * content/program-pages.json: 310 references, 180 unique urls (asa 66,
 * hkict 43, cpai 10, tct 72). A materially higher count on a re-run most
 * likely means the region selection started including the related-posts
 * carousel again; materially lower means it is dropping real content.
 *
 * The design spec's per-programme figures (asa 170, hkict 61, tct 57, cpai 5,
 * 293 total) are a manual catalogue made while surveying 135 pages, not a
 * systematic extraction, and they do not reconcile per programme -- ASA counts
 * far more than the indexed pages reference, TCT far fewer. Three things
 * explain the gap and all were checked before this constant was written: the
 * survey predates the seven Tech Connect workshop pages and the CPAI landing
 * page added to the index later; the ASA figure appears to include the site's
 * photo-gallery albums, which live on one unindexed page; and the region
 * selection was verified to be working on a real TCT event page (91,763 bytes
 * of page down to 19,649 of article, 8 <img> tags down to 6). The totals agree
 * to within six per cent, which is the level at which a hand count and a parse
 * should agree.
 */
export const EXPECTED_UNIQUE_IMAGES = 180;

/**
 * Recovers the remote image urls a captured programme page references, using
 * the identical region selection the milestone pass used: own content only,
 * "Related Posts" carousel excluded.
 */
export function extractImageUrls(html: string): string[] {
  const region = extractArticleRegion(html);
  return [...region.matchAll(/<img[^>]*>/g)]
    .map((match) => resolveImageSrc(match[0]))
    .filter((src): src is string => src !== null);
}

/**
 * Maps a recovered remote url to the filename it is saved under.
 *
 * Decodes first: urls arrive percent-encoded, and content/program-image-map
 * .json is keyed on the real filename a human read during review. Skipping the
 * decode would leave every non-ASCII entry unmatched and the file saved under a
 * name programImageSchema's src pattern can never match.
 */
export function localFilename(
  remoteUrl: string,
  renameMap: Readonly<Record<string, string>>,
): string {
  const original = decodeURIComponent(remoteUrl.split("/").pop() ?? "");
  return renameMap[original] ?? original;
}

async function main(): Promise<void> {
  const captureDir = process.argv[2];
  const countOnly = process.argv.includes("--count-only");
  if (!captureDir) throw new Error("USAGE: download-program-images <capture-dir> [--count-only]");

  const index = JSON.parse(
    readFileSync("content/program-pages.json", "utf8"),
  ) as Record<ProgramId, string[]>;
  const pagesDir = join(captureDir, "pages");
  const available = new Set(readdirSync(pagesDir));

  const perProgramme = new Map<ProgramId, Set<string>>();
  // Which page each image came from. Without this the download collapses to a
  // flat per-programme set and Task 8 faces ~170 loose ASA files to sort
  // against ten editions by eye. ASA and HKICT page slugs carry their year, so
  // recording the association makes attaching an image to the right edition a
  // lookup rather than a guess.
  const pageImages: Record<string, string[]> = {};
  const missingPages: string[] = [];

  for (const [id, files] of Object.entries(index) as [ProgramId, string[]][]) {
    const urls = new Set<string>();
    for (const file of files) {
      if (!available.has(file)) {
        missingPages.push(file);
        continue;
      }
      const found = extractImageUrls(readFileSync(join(pagesDir, file), "utf8"));
      pageImages[file] = found;
      for (const url of found) urls.add(url);
    }
    perProgramme.set(id, urls);
  }

  // content/program-pages.json was generated from these exact capture files, so
  // this should never fire. If it does, the two inputs have drifted and every
  // count below is unreliable.
  if (missingPages.length > 0) {
    throw new Error(
      `${missingPages.length} indexed page(s) missing from ${pagesDir}: ${missingPages.join(", ")}`,
    );
  }

  for (const [id, urls] of perProgramme) console.log(`${id}: ${urls.size} unique images`);
  const uniqueUrls = [...new Set([...perProgramme.values()].flatMap((set) => [...set]))].sort();
  console.log(`${uniqueUrls.length} unique across all four`);
  if (uniqueUrls.length !== EXPECTED_UNIQUE_IMAGES) {
    console.warn(
      `expected ${EXPECTED_UNIQUE_IMAGES} unique urls, got ${uniqueUrls.length} — investigate the `
        + "region selection (extractImageUrls) and content/program-pages.json before trusting this download.",
    );
  }
  if (countOnly) return;

  const renameMap = existsSync("content/program-image-map.json")
    ? (JSON.parse(readFileSync("content/program-image-map.json", "utf8")) as Record<string, string>)
    : {};

  const filenameForUrl = new Map<string, string>();
  const urlForFilename = new Map<string, string>();
  for (const url of uniqueUrls) {
    const name = localFilename(url, renameMap);
    const claimedBy = urlForFilename.get(name);
    // Local names are basenames, so two remote directories could in principle
    // hold a same-named file. Silently overwriting one with the other would
    // ship a wrong image on a page whose purpose is preserving the record.
    if (claimedBy && claimedBy !== url) {
      throw new Error(
        `two remote images resolve to the same local name "${name}": ${claimedBy} and ${url}`,
      );
    }
    urlForFilename.set(name, url);
    filenameForUrl.set(url, name);
  }

  // Checked before a single byte is fetched: a name the schema will reject is a
  // rename-map entry a human has to choose, and finding that out after a
  // several-hundred-file download wastes the one window this archive has.
  const unsafe = [...filenameForUrl.values()].filter((name) => !/^[A-Za-z0-9._-]+$/.test(name));
  if (unsafe.length > 0) {
    console.error(
      `${unsafe.length} filename(s) programImageSchema will reject; add them to content/program-image-map.json:`,
    );
    for (const name of unsafe) console.error(`  ${name}`);
    process.exitCode = 1;
    return;
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

  // Rewritten to local paths so Task 8 can ask "which images belong to the 2020
  // edition" by its page rather than by opening every file.
  writeFileSync(
    "content/program-image-pages.json",
    `${JSON.stringify(
      Object.fromEntries(
        Object.entries(pageImages).map(([page, urls]) => [
          page,
          urls.map((url) => `/images/programs/${filenameForUrl.get(url)!}`),
        ]),
      ),
      null,
      2,
    )}\n`,
  );

  console.log(`saved ${saved.length}, missed ${missed.length}, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  if (missed.length > 0) {
    console.error(`MISSED (${missed.length}):`);
    for (const url of missed) console.error(`  ${url}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("download-program-images.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Programme image download failed.");
    process.exitCode = 1;
  });
}
