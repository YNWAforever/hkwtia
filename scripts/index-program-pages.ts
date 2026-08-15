import {readdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import type {ProgramRecord} from "@/content/schemas";

/**
 * Which captured pages belong to which programme.
 *
 * The exclusions matter more than the matches. docs/wtia-programme-claims-
 * review.md documents two corrections about pages that look like they belong
 * to a programme and do not: the 2019 TechConnect predecessor (§4) and the
 * Best Mobile Apps award stream (§3). Pulling either in would attach the
 * wrong images -- and, worse, invite whoever writes the content next to
 * treat them as editions.
 *
 * The GenAI exclusions and the 5G/IoT TechConnect conference are this
 * script's own defensive guards, not claims-review corrections -- the
 * archive review never mentions them. As of this writing they rescue
 * nothing: only the Best Mobile Apps group currently blocks a page that
 * would otherwise match an inclusion pattern (all three would match
 * "ict-awards"). The techconnect and GenAI groups match no inclusion
 * pattern today, so deleting either would not fail a single test -- they
 * earn their place the moment an inclusion pattern is widened, which is why
 * they stay.
 */
export type ProgramId = ProgramRecord["id"];

// Checked before ALLOWLIST and INCLUSIONS. This is the plan's invariant:
// exclusions are the last word, so a future allowlist entry or a widened
// inclusion pattern can never silently override a claims-review correction.
// Exported so tests/unit/index-program-pages.test.ts can assert the real
// ALLOWLIST/EXCLUSIONS pair via conflictingAllowlistEntries (below) instead
// of only synthetic ones.
export const EXCLUSIONS: readonly RegExp[] = [
  // 2019 TechConnect Conference & Festival is the claims-review correction
  // (§4): same name, different event, no series branding. The 5G/IoT
  // TechConnect conference is this script's own defensive addition, caught
  // by the same fused "techconnect" pattern -- the claims review never
  // mentions it. Neither currently blocks a match: the two TCT inclusion
  // patterns below ("tech-to-connect", "tech-connect") both require a
  // hyphen between the words, so neither ever matches the fused "techconnect".
  /techconnect/,
  // Best Ubiquitous Award (2006) -> Best Mobile Apps Award (2013-2017) is
  // the claims-review correction (§3). A different stream from the ICT
  // Startup Award, which starts in 2020. This is the one exclusion doing
  // real work today: all three pages contain "ict-awards" and would
  // misclassify as hkict without it.
  /best-ubiquitous|best-mobile-app/,
  // GenAI events that are not the CPAI credential -- WTIA's own AWS pop-up,
  // Google Cloud tour and startups panel. This script's own defensive
  // guard, not a claims-review correction; none of the three currently
  // matches any inclusion pattern.
  /aws-genai|google-cloud-genai|smart-innovation-meets-genai/,
];

const INCLUSIONS: readonly (readonly [ProgramId, RegExp])[] = [
  // "asa" as a bare word would match "asama", "wasabi" and any percent-encoded
  // Chinese run containing those bytes, so match the spelled-out names and the
  // hyphen-delimited acronym only. asia-smartphone covers the programme's
  // earliest name -- Asia Smartphone Apps Contest (2013) -> Asia Smart App
  // Awards -> Asia Smart Innovation Awards -- the same lineage under an
  // earlier name, not a typo to "clean up": docs/wtia-programme-claims-review.md
  // sources ASA's co-organiser counts from exactly the 2013 and 2016 pages
  // this pattern reaches, and the ASA schema's yearStart minimum is 2013.
  ["asa", /asia-smart-app|asia-smart-innovation|asia-smartphone|-asa-/],
  // e8-b3-87...e7-8d-8e is the percent-hex encoding of 資訊科技初創企業獎
  // (Chinese for "ICT Startup Award"). Two 2024/2025 pages -- a recruitment
  // day and the 2025 award page -- carry that name only in Chinese in their
  // slug even though the page's own <title> is bilingual; "ict-startup-award"
  // alone missed both on the first pass. -icta reaches the 2023 ceremony
  // (icta23-awards-presentation-ceremony-cum-dinner.html, with the full 2023
  // winner list) and the 2023 startup seminar, both abbreviated "ICTA" in
  // their own titles -- claims-review lists HKICT winners as unavailable for
  // 2021, 2022 and 2024, pointedly not 2023, because 2023 lives on this page.
  // Checked against all 577 captured filenames: only those two match.
  ["hkict", /ict-startup-award|ict-awards|-icta|e8-b3-87-e8-a8-8a-e7-a7-91-e6-8a-80-e5-88-9d-e5-89-b5-e4-bc-81-e6-a5-ad-e7-8d-8e/],
  // WTIA renamed the series from "Tech to Connect" to "Tech Connect" (智創互聯)
  // partway through 2024-25 -- confirmed by hkwtia-org-2025-05-...tech-connect-
  // ai-leaders-seminar-series.html and the two "Tech Connect系列工作坊" (Tech
  // Connect Series Workshop) #3/#9 pages, all missed by the first pass because
  // they drop "to". This is a hyphenated *word*, not the fused "techconnect"
  // the EXCLUSIONS block screens out above, so the two patterns cannot collide
  // -- "tech-to-connect" never contains the contiguous substring "tech-connect".
  ["tct", /tech-to-connect|tech-connect/],
  ["cpai", /cpai|certified-practitioner-in-generative-ai/],
];

/**
 * Filenames the slug-pattern rules above can never reach, mapped directly to
 * their programme. Each entry needs the same kind of justification: either
 * the slug carries no reliable signal at all (a bare post ID), or the only
 * available signal is too generic to trust as a pattern (a single page's
 * slug that some future unrelated page could plausibly reuse). New entries
 * need the same title-read confirmation as these two -- this is an escape
 * hatch for real archive quirks, not a shortcut around writing a pattern.
 *
 * A Map, not a plain object: Map.get() only ever returns a value actually
 * set on it or undefined, with no prototype-chain surface to worry about --
 * `ALLOWLIST.get("toString")` is undefined, not Object.prototype.toString.
 */
export const ALLOWLIST: ReadonlyMap<string, ProgramId> = new Map([
  // "Asia Smart App Workshop - UIUX： Mobile first" (Apr 2023). WTIA's
  // original title used a fullwidth colon ("："), which the capture tool's
  // slugifier dropped along with everything after it, collapsing the slug
  // to the bare WordPress post ID. No filename pattern can recover "Asia
  // Smart App Workshop" from "7729" -- confirmed by reading the page's own
  // <title>.
  ["hkwtia-org-event-7729.html", "asa"],
  // CPAI's canonical landing page (<title> "CPAI - Certified Practitioner in
  // Generative AI for Business Innovation and Applications (CPAI)") -- the
  // issuer/course/credential prose a later task needs to transcribe. Its
  // slug, "certified-courses", has no programme-specific word in it, so a
  // pattern loose enough to match it risks matching some future unrelated
  // "certified ... course" page. This is one specific page, confirmed by its
  // <title>, not a rule.
  ["hkwtia-org-certified-courses.html", "cpai"],
  // Tech Connect workshops #4-#8 and the July 2025 「智創互聯：AI 防護盾」, all
  // titled in English with the Chinese series marker 「Tech Connect 系列工作坊#N」
  // only in the body. #3 and #9 kept the marker in their titles and so reach
  // `tct` by pattern; these six do not, and were found only by reading page
  // bodies while transcribing the record. Their images belong to TCT's set, so
  // leaving them out would have silently dropped a sixth of the edition's
  // pictures from the download.
  //
  // #6 was captured twice, under a bare slug and a bilingual one. Both are
  // listed: the download deduplicates by image url, so a page appearing twice
  // costs nothing, while guessing which copy is canonical could cost an image.
  ["hkwtia-org-event-ai-and-cloud-innovations-opening-new-horizons-for-effective-collaboration-and-strategic-decisions-ai-e8-88-87-e9-9b-b2-e7-ab-af-e5-89-b5-e6-96-b0-ef-bc-9a-e9-96-8b-e5-95-9f-e5-8d-94-e4-bd-9c.html", "tct"],
  ["hkwtia-org-event-ai-transportation-innovation-the-driving-force-of-future-mobility-ai-e9-81-8b-e8-bc-b8-e9-9d-a9-e6-96-b0-e6-9c-aa-e4-be-86-e4-ba-a4-e9-80-9a-e7-9a-84-e9-a9-85-e5-8b-95-e5-8a-9b.html", "tct"],
  ["hkwtia-org-event-ai-transaction-watchtower-smart-defenses-against-cyber-threats-ai-e5-ae-88-e6-9c-9b-e8-80-85-e6-99-ba-e6-85-a7-e9-98-b2-e8-a1-9b-e7-b6-b2-e7-b5-a1-e5-a8-81-e8-84-85.html", "tct"],
  ["hkwtia-org-event-ai-transaction-watchtower-smart-defenses-against-cyber-threats.html", "tct"],
  ["hkwtia-org-event-ai-infused-storytelling-merging-data-with-narrative-for-maximum-impact-ai-e5-8f-99-e4-ba-8b-e8-9e-8d-e5-85-a5-e6-95-b8-e6-93-9a-e5-8a-a9-e5-af-a6-e7-8f-be-e6-9c-80-e5-a4-a7-e5-bd-b1-e9-9f-bf.html", "tct"],
  ["hkwtia-org-event-aiot-innovations-building-a-future-of-smart-connections-aiot-e5-89-b5-e6-96-b0-e5-bb-ba-e7-ab-8b-e6-99-ba-e8-83-bd-e9-80-a3-e6-8e-a5-e7-9a-84-e6-9c-aa-e4-be-86.html", "tct"],
  ["hkwtia-org-event-ai-e9-98-b2-e8-ad-b7-e7-9b-be-ef-bc-9a-e5-b0-8b-e6-89-be-e5-ae-89-e5-85-a8-e4-b9-8b-e9-81-93.html", "tct"],
] as const satisfies (readonly [string, ProgramId])[]);

export function classifyPage(filename: string): ProgramId | null {
  // Exclusions are checked first: this is the plan's invariant that
  // exclusions are the last word, kept as defence in depth even though
  // conflictingAllowlistEntries (below) is what actually guarantees no
  // ALLOWLIST entry can reach this function while also matching an
  // exclusion pattern.
  if (EXCLUSIONS.some((pattern) => pattern.test(filename))) return null;

  const allowlisted = ALLOWLIST.get(filename);
  if (allowlisted) return allowlisted;

  const matches = INCLUSIONS.filter(([, pattern]) => pattern.test(filename));
  // Zero collisions today (pinned by a test), but first-match-wins is silent
  // -- a later widening of one pattern could quietly move a page from one
  // programme to another without anyone noticing. Fail loudly instead;
  // mirrors the duplicate-local-filename throw in
  // scripts/download-milestone-images.ts.
  if (matches.length > 1) {
    throw new Error(
      `"${filename}" matches more than one programme's inclusion pattern `
        + `(${matches.map(([id]) => id).join(", ")})`,
    );
  }
  return matches[0]?.[0] ?? null;
}

/**
 * Filenames that are both allowlisted and would independently match an
 * EXCLUSIONS pattern. Should always return [] -- if it doesn't, a human
 * deliberately allowlisted a page that a claims-review correction also
 * excludes, and classifyPage's exclusions-first ordering would silently
 * pick "excluded" as the winner. That is exactly the ambiguous-
 * classification failure the multi-inclusion-pattern throw above exists to
 * prevent, so main() throws here too rather than resolving it quietly.
 * A pure function, not a check baked into classifyPage, so it can be tested
 * with synthetic inputs instead of mutating the real ALLOWLIST.
 */
export function conflictingAllowlistEntries(
  allowlist: ReadonlyMap<string, ProgramId>,
  exclusions: readonly RegExp[],
): string[] {
  return [...allowlist.keys()].filter((filename) => exclusions.some((pattern) => pattern.test(filename)));
}

// Pinned against the 577-page capture at
// /Users/willylai/wtia-legacy-capture-20260812 (2026-08-12). Task 7 downloads
// irreplaceable images from a site that is about to be switched off, using
// exactly the index this script writes. readdirSync throws only when pages/
// is missing outright -- point it at a partial re-capture or the wrong
// archive and it would otherwise write a smaller index, print "asa: 0
// pages", and exit 0, silently destroying a human-reviewed artifact.
const EXPECTED_TOTAL_PAGES = 577;

function main(): void {
  const captureDir = process.argv[2];
  if (!captureDir) throw new Error("USAGE: index-program-pages <capture-dir>");

  const conflicts = conflictingAllowlistEntries(ALLOWLIST, EXCLUSIONS);
  if (conflicts.length > 0) {
    throw new Error(
      `ALLOWLIST ${conflicts.length === 1 ? "entry" : "entries"} also matched by an EXCLUSIONS pattern: `
        + `${conflicts.join(", ")} -- resolve the contradiction before generating the index.`,
    );
  }

  const pagesDir = join(captureDir, "pages");
  // Filter to .html before counting: readdirSync also returns dotfiles
  // (a single Finder visit to the capture directory creates .DS_Store), and
  // without this filter one incidental file inflates the count past
  // EXPECTED_TOTAL_PAGES and hard-fails a perfectly good capture.
  const files = readdirSync(pagesDir).filter((file) => file.endsWith(".html")).sort();
  if (files.length !== EXPECTED_TOTAL_PAGES) {
    throw new Error(
      `expected ${EXPECTED_TOTAL_PAGES} captured pages, found ${files.length} in ${pagesDir} -- `
        + "refusing to overwrite the reviewed index with a possibly-partial one. If this is a "
        + "legitimate new capture, update EXPECTED_TOTAL_PAGES and re-run the plan's Step 7 hand review.",
    );
  }

  const index: Record<ProgramId, string[]> = {asa: [], hkict: [], cpai: [], tct: []};
  for (const file of files) {
    const id = classifyPage(file);
    if (id) index[id].push(file);
  }

  const empty = Object.entries(index).filter(([, pages]) => pages.length === 0).map(([id]) => id);
  if (empty.length > 0) {
    throw new Error(`refusing to write an index where ${empty.join(", ")} has zero pages`);
  }

  writeFileSync("content/program-pages.json", `${JSON.stringify(index, null, 2)}\n`);
  for (const [id, files] of Object.entries(index)) console.log(`${id}: ${files.length} pages`);
}

if (process.argv[1]?.endsWith("index-program-pages.ts")) main();
