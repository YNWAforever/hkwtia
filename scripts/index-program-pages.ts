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
const EXCLUSIONS: readonly RegExp[] = [
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
 * Exported only so tests/unit/index-program-pages.test.ts can simulate a
 * future entry that collides with EXCLUSIONS; nothing else should import it.
 */
export const ALLOWLIST: Readonly<Record<string, ProgramId>> = {
  // "Asia Smart App Workshop - UIUX： Mobile first" (Apr 2023). WTIA's
  // original title used a fullwidth colon ("："), which the capture tool's
  // slugifier dropped along with everything after it, collapsing the slug
  // to the bare WordPress post ID. No filename pattern can recover "Asia
  // Smart App Workshop" from "7729" -- confirmed by reading the page's own
  // <title>.
  "hkwtia-org-event-7729.html": "asa",
  // CPAI's canonical landing page (<title> "CPAI - Certified Practitioner in
  // Generative AI for Business Innovation and Applications (CPAI)") -- the
  // issuer/course/credential prose a later task needs to transcribe. Its
  // slug, "certified-courses", has no programme-specific word in it, so a
  // pattern loose enough to match it risks matching some future unrelated
  // "certified ... course" page. This is one specific page, confirmed by its
  // <title>, not a rule.
  "hkwtia-org-certified-courses.html": "cpai",
};

export function classifyPage(filename: string): ProgramId | null {
  if (EXCLUSIONS.some((pattern) => pattern.test(filename))) return null;

  // Object.hasOwn, not `filename in ALLOWLIST` or bracket access: a plain
  // object's `in`/index lookup walks the prototype chain, so
  // classifyPage("toString") would return the Object.prototype method
  // instead of null. TypeScript's declared `ProgramId | null` return type
  // does not catch this -- tsconfig.json does not set
  // noUncheckedIndexedAccess.
  if (Object.hasOwn(ALLOWLIST, filename)) return ALLOWLIST[filename] as ProgramId;

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

  const pagesDir = join(captureDir, "pages");
  const files = readdirSync(pagesDir).sort();
  if (files.length !== EXPECTED_TOTAL_PAGES) {
    throw new Error(
      `expected ${EXPECTED_TOTAL_PAGES} captured pages, found ${files.length} in ${pagesDir} -- `
        + "refusing to overwrite the reviewed index with a possibly-partial one.",
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
