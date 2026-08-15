import {readdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

/**
 * Which captured pages belong to which programme.
 *
 * The exclusions matter more than the matches. Three claims in
 * docs/wtia-programme-claims-review.md are about pages that look like they
 * belong to a programme and do not: the 2019 TechConnect predecessor, the Best
 * Mobile Apps award stream, and WTIA's unrelated GenAI events. Pulling any of
 * them in would attach the wrong images -- and, worse, invite whoever writes
 * the content next to treat them as editions.
 */
export type ProgramId = "asa" | "hkict" | "cpai" | "tct";

// Checked before any include rule. Each entry is a claims-review correction.
const EXCLUSIONS: readonly RegExp[] = [
  // 2019 TechConnect Conference & Festival, and the 5G/IoT TechConnect
  // conference: same name, different event, no series branding.
  /techconnect/,
  // Best Ubiquitous Award (2006) -> Best Mobile Apps Award (2013-2017).
  // A different stream from the ICT Startup Award, which starts in 2020.
  /best-ubiquitous|best-mobile-app/,
  // GenAI events that are not the CPAI credential.
  /aws-genai|google-cloud-genai|smart-innovation-meets-genai/,
];

const INCLUSIONS: readonly (readonly [ProgramId, RegExp])[] = [
  // "asa" as a bare word would match "asama", "wasabi" and any percent-encoded
  // Chinese run containing those bytes, so match the spelled-out names and the
  // hyphen-delimited acronym only.
  ["asa", /asia-smart-app|asia-smart-innovation|-asa-/],
  // e8-b3-87...e7-8d-8e is the percent-hex encoding of 資訊科技初創企業獎
  // (Chinese for "ICT Startup Award"). Two 2024/2025 pages -- a recruitment
  // day and the 2025 award page -- carry that name only in Chinese in their
  // slug even though the page's own <title> is bilingual; "ict-startup-award"
  // alone missed both on the first pass.
  ["hkict", /ict-startup-award|ict-awards|e8-b3-87-e8-a8-8a-e7-a7-91-e6-8a-80-e5-88-9d-e5-89-b5-e4-bc-81-e6-a5-ad-e7-8d-8e/],
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

export function classifyPage(filename: string): ProgramId | null {
  if (EXCLUSIONS.some((pattern) => pattern.test(filename))) return null;
  return INCLUSIONS.find(([, pattern]) => pattern.test(filename))?.[0] ?? null;
}

function main(): void {
  const captureDir = process.argv[2];
  if (!captureDir) throw new Error("USAGE: index-program-pages <capture-dir>");

  const index: Record<ProgramId, string[]> = {asa: [], hkict: [], cpai: [], tct: []};
  for (const file of readdirSync(join(captureDir, "pages")).sort()) {
    const id = classifyPage(file);
    if (id) index[id].push(file);
  }

  writeFileSync("content/program-pages.json", `${JSON.stringify(index, null, 2)}\n`);
  for (const [id, files] of Object.entries(index)) console.log(`${id}: ${files.length} pages`);
}

if (process.argv[1]?.endsWith("index-program-pages.ts")) main();
