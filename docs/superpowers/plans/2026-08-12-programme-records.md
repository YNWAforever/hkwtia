# Programme Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the four `/programs/*` stub pages with the editions, funders and winners that WTIA's captured archive actually supports — and nothing else.

**Architecture:** Four tight Zod schemas rather than one shared loose one, because CPAI is a credential with no editions while the other three are event series. `funder` and `organisedFor` live on the edition, never the programme, so the wrong-agency error this sub-project exists to prevent becomes unrepresentable rather than merely discouraged. Page furniture stays in the staff-editable message bundles; the factual record comes from typed content. 293 archive images are downloaded to own-origin storage before hkwtia.org is switched off.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript strict, Zod, next-intl v4, Vitest.

---

## Context you need before starting

Read these three, in this order, before touching code:

1. `docs/wtia-programme-claims-review.md` — **the verified claim log.** Four surveys read 135 pages of the capture and found thirteen claims in the content audit that WTIA's own archive contradicts.
2. `docs/superpowers/specs/2026-08-12-programme-records-design.md` — the spec this plan implements.
3. `docs/superpowers/plans/2026-08-12-institutional-history.md` — sub-project 2b, which shipped. Its Task 4 (extraction) and Task 6 (image download) are the working precedent for Tasks 1 and 7 here.

**The single most important thing about this sub-project:** `docs/wtia-content-migration-audit.md` is a claim log to verify, not a source. Sub-projects 1, 2a and 2b treated it as ground truth. It is wrong about all four programmes. **Any step you write or execute that reasons "per the audit" is a defect.** When the audit and `docs/wtia-programme-claims-review.md` disagree, the claims review wins; when the claims review and the archive disagree, re-read the archive.

The capture lives at `/Users/willylai/wtia-legacy-capture-20260812` — 577 pages under `pages/`, plus `inventory.json` (`{capturedUrls: string[]}`) and the WordPress sitemaps. Page filenames are the slugified URL, e.g. `https://hkwtia.org/2017/01/2017-asia-smart-app-summit-cum-award-presentation-ceremony/` became `hkwtia-org-2017-01-2017-asia-smart-app-summit-cum-award-presentation-ceremony.html`. `slugify()` in `scripts/capture-legacy-site.ts` is the function that named them.

**hkwtia.org is being switched off.** Task 7 and Task 8 fetch from it. If they start failing with connection errors rather than Cloudflare 520s, stop and raise it — the images exist nowhere else, and the rest of the plan can proceed without them but the record cannot be reconstructed later.

### Naming: this plan uses `programs`, not `programmes`

The spec's prose says `content/programmes/` and `public/images/programmes/`. The codebase already spells it `programs` in five places that are expensive or user-visible to change: the routes `/programs/{asa,hkict,cpai,tct}`, the `programs.*` message namespace staff edit at `/admin/page-copy`, `content/programs.ts`, `programSchema`/`ProgramRecord` in `content/schemas.ts`, and `components/marketing/program-detail.tsx`.

**Decision: one spelling, `programs`, everywhere.** Files land at `content/programs/*.ts` and `public/images/programs/`. This is a deliberate deviation from the spec's file paths and nothing else about the spec changes.

`content/programs.ts` (a file) and `content/programs/` (a directory) cannot coexist, so Task 2 moves the existing file to `content/programs/index.ts`. The import specifier `@/content/programs` keeps resolving, so its six importers need no change.

### Decisions this plan makes that the spec left open

| Question | Decision | Why |
|---|---|---|
| Where the four schemas live | `content/schemas.ts`, alongside `eventSchema`, `programSchema` and `milestoneSchema` | The codebase keeps all content schemas in one file and every test imports from `@/content/schemas`. The file grows from 62 to ~190 lines, which is still one screen of related definitions. |
| How "no record exists" is represented | An explicit tagged variant (`{kind: 'unrecorded'}`), never an empty array or `null` | An empty `winners: []` is indistinguishable from an editor who has not filled it in yet. A tag forces the author to state which, and lets the renderer show absence as absence. |
| Where microsite links live | Typed content, in the `off-site` winners variant | The URL is part of the factual record, not page furniture. Staff rewording an introduction must not be able to change where the winner list points. |
| The translation review list | Appended to the existing `docs/wtia-translation-review.md` | WTIA already has that document outstanding. A second one competes with it for the same reviewer. |

### Hard boundaries this plan touches

From `CLAUDE.md` — each has already caused a production incident:

- **Never hand-build a locale prefix.** `zh-HK` is served at `/zh`. Use `localizedPath` for `<Link href>`. Pinned by `tests/unit/locale-href-boundary.test.ts`.
- **Every user-visible string goes in both `messages/en.json` and `messages/zh-HK.json`**, in parity. `npm run audit:strings` fails on unapproved JSX literals.
- **No remote image hosts.** The CSP is `img-src 'self' data:` and `next.config.ts` declares no `remotePatterns`, so a hotlinked image renders nothing even while the old site is still up.
- **Public pages degrade rather than 500.** These four pages read from typed content, not the database, so there is nothing to catch — but do not introduce a database read here.

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run audit:strings` and `npm run build` before handing off.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `content/programs/index.ts` | The existing four-record route identity list, moved verbatim from `content/programs.ts` |
| `content/programs/agencies.ts` | The four government body names in both locales, written exactly once |
| `content/programs/asa.ts` | ASA editions: label, funder per edition, regions, venue, winners |
| `content/programs/hkict.ts` | HKICT editions: year, `organisedFor`, winners |
| `content/programs/cpai.ts` | CPAI as a credential: issuer, course partner, syllabus. No editions |
| `content/programs/tct.ts` | TCT editions: year, free-text shape, funder |
| `content/program-pages.json` | Programme id → captured page filenames, the input to image extraction |
| `scripts/index-program-pages.ts` | Classifies captured pages by programme, encoding the claims review's exclusions |
| `scripts/download-program-images.ts` | Recovers and downloads the archive images, modelled on `download-milestone-images.ts` |
| `components/marketing/program-editions.tsx` | Renders an edition list for ASA, HKICT and TCT |
| `components/marketing/program-credential.tsx` | Renders CPAI, which has no editions to list |
| `tests/unit/program-schema.test.ts` | The four schemas reject what they are meant to reject |
| `tests/unit/program-content.test.ts` | The real content parses, and the era-specific facts are right |
| `tests/unit/program-contradicted-claims.test.ts` | None of the thirteen contradicted claims reach a page |
| `tests/unit/index-program-pages.test.ts` | The classifier's exclusions hold |
| `tests/unit/download-program-images.test.ts` | Extraction excludes the related-posts carousel and resolves lazy-loaded sources |

**Modified:**

| Path | Change |
|---|---|
| `content/schemas.ts` | Four programme schemas plus their shared edition parts |
| `messages/en.json`, `messages/zh-HK.json` | Page furniture under `programs.*`, in parity |
| `app/[locale]/(public)/programs/{asa,hkict,tct}/page.tsx` | Render editions below the existing hero |
| `app/[locale]/(public)/programs/cpai/page.tsx` | Render the credential |
| `tests/unit/content-contract.test.ts` | Assert the four record modules parse |
| `docs/wtia-translation-review.md` | Append the programme proper-noun review list |
| `package.json` | Two script entries |

**Deleted:** `content/programs.ts` (moved to `content/programs/index.ts` in Task 2).

---

## Task 1: Index the captured pages by programme

The image extraction in Task 7 needs to know which of the 577 captured pages belong to which programme. Getting that set wrong is exactly the failure that inflated the milestone image estimate by a factor of two and a half, so the set is produced by a tested script rather than a shell glob, and its exclusions are the claims review's corrections.

**Files:**
- Create: `scripts/index-program-pages.ts`
- Create: `tests/unit/index-program-pages.test.ts`
- Create: `content/program-pages.json` (generated, then human-reviewed)
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/index-program-pages.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {classifyPage} from "@/scripts/index-program-pages";

describe("program page classification", () => {
  it("assigns the obvious pages to their programme", () => {
    expect(classifyPage("hkwtia-org-event-asia-smart-app-summit-2024.html")).toBe("asa");
    expect(classifyPage("hkwtia-org-2020-01-2020-hong-kong-ict-awards-ict-startup-award.html")).toBe("hkict");
    expect(classifyPage("hkwtia-org-event-tech-to-connect-4-0-leaders-summit-transforming-smart-lead-through-industry-4-0.html")).toBe("tct");
    expect(classifyPage(
      "hkwtia-org-event-graduation-ceremony-for-the-certified-practitioner-in-generative-ai-for-business-innovation-and-applications-cpai-program.html",
    )).toBe("cpai");
  });

  // The 2019 TechConnect Conference & Festival carries no "Tech to Connect"
  // branding, no edition number and no link to the series site. The 2023 summit
  // calls Tech to Connect 4.0 the "2nd edition", which makes 2021-22 the first.
  // 2019 is a same-named predecessor, not edition zero.
  it("excludes the 2019 TechConnect predecessor from TCT", () => {
    expect(classifyPage("hkwtia-org-2019-01-2019-techconnect-conference-festival.html")).toBeNull();
    expect(classifyPage("hkwtia-org-event-5g-iot-techconnect-conference.html")).toBeNull();
  });

  // The Best Ubiquitous Award (2006), renamed Best Mobile Apps Award in 2013,
  // is a different award stream from the ICT Startup Award, which begins with
  // the 2020 edition. Whether that lineage should appear at all is an open
  // question for WTIA, so it stays off the page until they answer.
  it("excludes the Best Mobile Apps lineage from HKICT", () => {
    for (const file of [
      "hkwtia-org-2006-01-2006-hong-kong-ict-awards-best-ubiquitous-award.html",
      "hkwtia-org-2015-01-2015-hong-kong-ict-awards-2015-best-mobile-apps-award.html",
      "hkwtia-org-2017-01-2017-hong-kong-ict-awards-best-mobile-app-award.html",
    ]) {
      expect(classifyPage(file), file).toBeNull();
    }
  });

  // GenAI appears in several WTIA event titles that have nothing to do with the
  // CPAI credential -- an AWS pop-up, a Google Cloud tour, a startups panel.
  // Matching on "genai" alone would pull all three into CPAI's image set.
  it("does not treat every GenAI event as CPAI", () => {
    for (const file of [
      "hkwtia-org-event-e3-80-90wtia-e5-b0-8e-e8-b3-9e-e5-9c-98-e3-80-91wtia-x-aws-genai-pop-up-e9-ab-94-e9-a9-97-e7-a9-ba-e9-96-93.html",
      "hkwtia-org-event-wtia-go-for-it-business-tour-google-cloud-genai-popup-experience-tour.html",
      "hkwtia-org-event-smart-innovation-meets-genai-trends-shaping-the-next-decade-of-startups.html",
    ]) {
      expect(classifyPage(file), file).toBeNull();
    }
  });

  it("returns null for a page belonging to no programme", () => {
    expect(classifyPage("hkwtia-org-2001-01-2001-establishment-of-wtia.html")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/index-program-pages.test.ts`
Expected: FAIL — `Failed to resolve import "@/scripts/index-program-pages"`.

- [ ] **Step 3: Write the classifier**

Create `scripts/index-program-pages.ts`:

```ts
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
  ["hkict", /ict-startup-award|ict-awards/],
  ["tct", /tech-to-connect/],
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/index-program-pages.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the script entry**

In `package.json`, after the `"audit:strings"` line:

```json
    "content:index-programs": "node --experimental-strip-types scripts/index-program-pages.ts",
```

- [ ] **Step 6: Generate the index**

Run: `npm run content:index-programs -- /Users/willylai/wtia-legacy-capture-20260812`
Expected: four counts printed, and `content/program-pages.json` written.

- [ ] **Step 7: Review the index by hand**

Open `content/program-pages.json` and read every filename. You are looking for two failures the tests cannot catch: a page assigned to a programme it does not belong to, and a page missing entirely. Cross-check the count against the spec's per-programme image figures in mind — ASA has by far the most pages and should have by far the most.

If you find a misclassification, add the pattern to `EXCLUSIONS` (with a comment saying which archive page proved it) or tighten the inclusion regex, add a test case, and regenerate. **Do not hand-edit the JSON** — it must stay reproducible from the script.

- [ ] **Step 8: Commit**

```bash
git add scripts/index-program-pages.ts tests/unit/index-program-pages.test.ts content/program-pages.json package.json
git commit -m "feat: index the captured pages by programme"
```

---

## Task 2: The four schemas

Four tight schemas, not one shared loose one. Every schema is `.strict()`, which is what makes a programme-level `funder` a parse error rather than a code review note.

**Files:**
- Create: `tests/unit/program-schema.test.ts`
- Modify: `content/schemas.ts`
- Create: `content/programs/index.ts` (moved from `content/programs.ts`)
- Delete: `content/programs.ts`

- [ ] **Step 1: Move the existing record list**

```bash
mkdir -p content/programs
git mv content/programs.ts content/programs/index.ts
```

`@/content/programs` still resolves, so the six importers (`app/[locale]/(public)/programs/*/page.tsx`, `components/marketing/program-grid.tsx`, `tests/unit/content-contract.test.ts`) need no change.

- [ ] **Step 2: Verify nothing broke**

Run: `npm run typecheck && npx vitest run tests/unit/content-contract.test.ts`
Expected: typecheck clean, tests PASS.

- [ ] **Step 3: Write the failing schema test**

Create `tests/unit/program-schema.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {asaProgramSchema, cpaiProgramSchema, hkictProgramSchema, tctProgramSchema} from "@/content/schemas";

const listedWinners = {
  kind: "listed" as const,
  entries: [{nameEn: "RIFFAI", nameZh: "RIFFAI", categoryEn: "Living & Culture", categoryZh: "生活與文化"}],
};

const asa = {
  id: "asa" as const,
  editions: [{
    label: "2022/23",
    yearStart: 2022,
    funder: {
      kind: "named" as const,
      agency: "createhk" as const,
      initiativeEn: "CreateSmart Initiative",
      initiativeZh: "創意智優計劃",
    },
    regionsAttended: 16,
    venueEn: "Hong Kong",
    venueZh: "香港",
    winners: listedWinners,
    images: [],
  }],
};

const hkict = {
  id: "hkict" as const,
  editions: [{year: 2020, organisedFor: "ogcio" as const, winners: listedWinners, images: []}],
};

const tct = {
  id: "tct" as const,
  editions: [{
    year: 2023,
    shapeEn: "10 industry workshops, 2 seminars and a grand conference",
    shapeZh: "十場業界工作坊、兩場研討會及一場大型會議",
    funder: {kind: "named" as const, agency: "gsp" as const, initiativeEn: "GSP", initiativeZh: "GSP"},
    images: [],
  }],
};

const cpai = {
  id: "cpai" as const,
  issuerEn: "WTIA",
  issuerZh: "香港無線科技商會",
  coursePartnerEn: "CUHK School of Continuing and Professional Studies",
  coursePartnerZh: "香港中文大學專業進修學院",
  courseNameEn: "Generative AI for Business Innovation and Applications",
  courseNameZh: "生成式人工智能商業應用課程",
  syllabus: [{titleEn: "Foundations", titleZh: "基礎"}],
  images: [],
};

describe("programme schemas", () => {
  it("accept a complete record of each shape", () => {
    expect(asaProgramSchema.parse(asa).editions).toHaveLength(1);
    expect(hkictProgramSchema.parse(hkict).editions).toHaveLength(1);
    expect(tctProgramSchema.parse(tct).editions).toHaveLength(1);
    expect(cpaiProgramSchema.parse(cpai).issuerEn).toBe("WTIA");
  });

  // The structural fix for the CCIDA error. CreateHK funded 2017 through
  // 2022/23; CCIDA appears only from 2024. There must be no field in which
  // "the funder of ASA" can be written at all, so the mistake is
  // unrepresentable rather than merely discouraged.
  it("gives ASA no programme-level funder to write", () => {
    expect(() => asaProgramSchema.parse({
      ...asa,
      funder: {kind: "named", agency: "ccida", initiativeEn: "x", initiativeZh: "x"},
    })).toThrow();
  });

  // Same shape, same reason: OGCIO for 2020-2024, DPO from 2025.
  it("gives HKICT no programme-level counterparty to write", () => {
    expect(() => hkictProgramSchema.parse({...hkict, organisedFor: "dpo"})).toThrow();
  });

  it("requires a funder decision on every ASA edition", () => {
    const [edition] = asa.editions;
    const withoutFunder: Record<string, unknown> = {...edition};
    delete withoutFunder.funder;
    expect(() => asaProgramSchema.parse({...asa, editions: [withoutFunder]})).toThrow();
  });

  it("rejects a funding agency outside each programme's documented set", () => {
    // CCIDA never funded TCT; GSP never funded ASA. Sharing one agency enum
    // across programmes would let either through.
    expect(() => tctProgramSchema.parse({
      ...tct,
      editions: [{...tct.editions[0], funder: {...tct.editions[0].funder, agency: "ccida"}}],
    })).toThrow();
    expect(() => asaProgramSchema.parse({
      ...asa,
      editions: [{...asa.editions[0], funder: {...asa.editions[0].funder, agency: "gsp"}}],
    })).toThrow();
  });

  // An empty winners array is indistinguishable from an editor who has not
  // filled it in. The archive genuinely does not record ASA 2020-2021 or HKICT
  // 2021/2022/2024 winners, so absence has to be stated, not inferred.
  it("requires absence to be stated rather than left empty", () => {
    expect(() => hkictProgramSchema.parse({
      ...hkict, editions: [{...hkict.editions[0], winners: {kind: "listed", entries: []}}],
    })).toThrow();

    for (const winners of [{kind: "unrecorded"}, {kind: "off-site", url: "https://contest2020.bestasiaapp.hk/"}]) {
      expect(() => hkictProgramSchema.parse({
        ...hkict, editions: [{...hkict.editions[0], winners}],
      }), JSON.stringify(winners)).not.toThrow();
    }
  });

  it("requires an off-site winner list to say where", () => {
    expect(() => hkictProgramSchema.parse({
      ...hkict, editions: [{...hkict.editions[0], winners: {kind: "off-site"}}],
    })).toThrow();
  });

  // CPAI is a credential, not an event series. Giving it editions would invite
  // exactly the "when did CPAI run" framing the archive cannot support.
  it("gives CPAI no editions", () => {
    expect(() => cpaiProgramSchema.parse({...cpai, editions: []})).toThrow();
  });

  // The CSP is `img-src 'self' data:` with no remotePatterns, so a remote src
  // renders nothing in the browser.
  it("rejects an image that is not own-origin under /images/programs/", () => {
    for (const src of ["https://hkwtia.org/a.jpg", "/images/history/a.jpg", "images/programs/a.jpg"]) {
      expect(() => cpaiProgramSchema.parse({
        ...cpai, images: [{src, altEn: "a", altZh: "a"}],
      }), src).toThrow();
    }
  });

  it("requires both locales everywhere one is required", () => {
    expect(() => cpaiProgramSchema.parse({...cpai, issuerZh: ""})).toThrow();
    expect(() => cpaiProgramSchema.parse({...cpai, courseNameZh: ""})).toThrow();
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], shapeZh: ""}],
    })).toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/unit/program-schema.test.ts`
Expected: FAIL — `asaProgramSchema` is not exported from `@/content/schemas`.

- [ ] **Step 5: Add the schemas**

Append to `content/schemas.ts`:

```ts
// Own-origin under a dedicated prefix, for the same reason milestoneImageSchema
// pins /images/history/: the CSP is `img-src 'self' data:` and next.config.ts
// declares no remotePatterns, so a remote src renders nothing.
const programImageSchema = z.object({
  src: z.string().regex(/^\/images\/programs\/[A-Za-z0-9._-]+$/),
  altEn: z.string().min(1),
  altZh: z.string().min(1)
});

const winnerSchema = z.object({
  nameEn: z.string().min(1),
  nameZh: z.string().min(1),
  categoryEn: z.string().min(1),
  categoryZh: z.string().min(1)
});

/**
 * Absence is stated, never inferred from an empty array.
 *
 * The archive does not name the ASA 2020 or 2021 winners -- both editions defer
 * to microsites that were never captured -- nor the HKICT winners for 2021,
 * 2022 and 2024. `winners: []` would be indistinguishable from an unfinished
 * entry, so each edition has to declare which case it is, and the page renders
 * a link or an explicit line rather than an empty table.
 */
const winnersSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('listed'), entries: z.array(winnerSchema).min(1)}).strict(),
  z.object({kind: z.literal('off-site'), url: z.string().url()}).strict(),
  z.object({kind: z.literal('unrecorded')}).strict()
]);

/**
 * Funding is per edition and the agency set is per programme.
 *
 * The content audit called ASA "CCIDA-funded" as though that held throughout.
 * It does not: CCIDA appears only from 2024, and every documented edition from
 * 2017 through 2022/23 names Create Hong Kong under the CreateSmart Initiative.
 * A shared agency enum would let CCIDA be written against a 2017 edition; a
 * per-programme one will not.
 */
const fundingSchema = <T extends readonly [string, ...string[]]>(agencies: T) =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('named'),
      agency: z.enum(agencies),
      initiativeEn: z.string().min(1),
      initiativeZh: z.string().min(1)
    }).strict(),
    // The archive names no funder for this edition. Distinct from "not yet
    // filled in", and the page says nothing about funding rather than guessing.
    z.object({kind: z.literal('none-recorded')}).strict()
  ]);

export const asaProgramSchema = z.object({
  id: z.literal('asa'),
  editions: z.array(z.object({
    // Not every edition is a single calendar year -- "2022/23" is one edition.
    label: z.string().min(1),
    yearStart: z.number().int().min(2013).max(2100),
    funder: fundingSchema(['createhk', 'ccida']),
    // The audit read "16 regional co-organisers" off a page that says 16
    // regions attended. Explicit co-organiser counts exist only for 2013 (7)
    // and 2016 (9), so the field records attendance and is named for it.
    regionsAttended: z.number().int().positive().nullable(),
    venueEn: z.string().min(1),
    venueZh: z.string().min(1),
    winners: winnersSchema,
    images: z.array(programImageSchema)
  }).strict()).min(1)
}).strict();

export const hkictProgramSchema = z.object({
  id: z.literal('hkict'),
  editions: z.array(z.object({
    year: z.number().int().min(2020).max(2100),
    // OGCIO for 2020-2024, DPO from 2025. Programme-level would collapse them.
    organisedFor: z.enum(['ogcio', 'dpo']),
    winners: winnersSchema,
    images: z.array(programImageSchema)
  }).strict()).min(1)
}).strict();

/**
 * CPAI is a credential, not an event series: no editions, no winners, no years.
 *
 * WTIA issues CPAI alone. CUSCS separately issues its own completion
 * certificate to the same graduates -- 「一個課程，兩張認證」. The audit called it
 * a "joint WTIA x CUSCS certification", which understates what WTIA owns, so
 * the issuer and the course partner are separate required fields and there is
 * no field in which a joint issuer can be written.
 */
export const cpaiProgramSchema = z.object({
  id: z.literal('cpai'),
  issuerEn: z.string().min(1),
  issuerZh: z.string().min(1),
  coursePartnerEn: z.string().min(1),
  coursePartnerZh: z.string().min(1),
  courseNameEn: z.string().min(1),
  courseNameZh: z.string().min(1),
  syllabus: z.array(z.object({
    titleEn: z.string().min(1),
    titleZh: z.string().min(1)
  }).strict()),
  images: z.array(programImageSchema)
}).strict();

export const tctProgramSchema = z.object({
  id: z.literal('tct'),
  editions: z.array(z.object({
    year: z.number().int().min(2021).max(2100),
    // Free text, not workshop and seminar counts: the first edition (2021-22)
    // was 12 workshops and 4.0 (2023) was 10 workshops plus 2 seminars and a
    // conference. A count-shaped field invites applying one edition's structure
    // to all of them, which is how the audit got this wrong.
    shapeEn: z.string().min(1),
    shapeZh: z.string().min(1),
    // GSP is named exactly once in 577 pages, on the July 2023 seminar page.
    // The 2024-26 editions never mention it.
    funder: fundingSchema(['gsp']),
    images: z.array(programImageSchema)
  }).strict()).min(1)
}).strict();

export type AsaProgram = z.infer<typeof asaProgramSchema>;
export type HkictProgram = z.infer<typeof hkictProgramSchema>;
export type CpaiProgram = z.infer<typeof cpaiProgramSchema>;
export type TctProgram = z.infer<typeof tctProgramSchema>;
export type ProgramWinners = z.infer<typeof winnersSchema>;
export type ProgramImage = z.infer<typeof programImageSchema>;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/unit/program-schema.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
git add content/schemas.ts content/programs/index.ts tests/unit/program-schema.test.ts
git commit -m "feat: add four tight programme record schemas"
```

---

## Task 3: The government agency names

Four government bodies, each of which must be rendered exactly, written once. `docs/wtia-programme-claims-review.md` supplies all four.

**Files:**
- Create: `content/programs/agencies.ts`

- [ ] **Step 1: Write the module**

Create `content/programs/agencies.ts`:

```ts
/**
 * The government bodies named across the programme record, in both locales.
 *
 * Written once because these are the highest-consequence proper nouns on these
 * pages: publishing the wrong agency as a funder is specific, checkable, and
 * the kind of statement a trade association gets held to. Two of the four are
 * the same body before and after a rename, which is exactly the pair a
 * copy-paste would blur.
 */
export const AGENCIES = {
  // Create Hong Kong. Funded ASA 2017 through 2022/23 under CreateSmart.
  createhk: {nameEn: 'Create Hong Kong', nameZh: '創意香港'},
  // Cultural and Creative Industries Development Agency. ASA from 2024 onward.
  // Whether the CreateHK -> CCIDA change is a rename or a transfer between
  // bodies is an open question for WTIA; until they answer, each edition names
  // the body its own archive page names and the pages assert no relationship.
  ccida: {nameEn: 'Cultural and Creative Industries Development Agency', nameZh: '文創產業發展處'},
  // Office of the Government Chief Information Officer. HKICT 2020-2024.
  ogcio: {nameEn: 'Office of the Government Chief Information Officer', nameZh: '政府資訊科技總監辦公室'},
  // Digital Policy Office. HKICT from 2025 only -- a June 2024 recruitment
  // event still bills its guest of honour under the OGCIO title.
  dpo: {nameEn: 'Digital Policy Office', nameZh: '數字政策辦公室'}
} as const;

export type AgencyId = keyof typeof AGENCIES;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add content/programs/agencies.ts
git commit -m "feat: record the four government agency names in both locales"
```

---

## Task 4: ASA's record

**This task transcribes from the archive. It does not summarise, infer, or fill gaps from the content audit.** Every edition, funder, venue and winner name comes from a captured page you have open in front of you.

**Files:**
- Create: `content/programs/asa.ts`
- Create: `tests/unit/program-content.test.ts`

- [ ] **Step 1: Read the source pages**

Read every ASA page listed under `"asa"` in `content/program-pages.json`. Start with these, which carry the edition-level facts:

```
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-2017-01-2017-asia-smart-app-summit-cum-award-presentation-ceremony.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-2019-01-2019-asia-smart-app-awards-2018-2019.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-2020-01-2020-asia-smart-app-awards-2020.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-asia-smart-app-awards-2024-award-presentation-ceremony-cum-luncheon.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-2025-11-2025-e4-ba-9e-e6-b4-b2-e6-99-ba-e6-85-a7-e5-89-b5-e6-96-b0-e5-a4-a7-e7-8d-8e-asia-smart-innovation-awards-2025.html
```

For each edition record: the label as the page writes it, the funding sentence verbatim, the venue, how many regions attended, and the winners with their categories.

**The four constraints from the claims review that decide this file:**

1. **Funder per edition.** 2017 through 2022/23 name Create Hong Kong under the CreateSmart Initiative — the 2017 post says "With funding support from Create Hong Kong of the Government of the Hong Kong Special Administrative Region". CCIDA only from 2024. If a page names neither, use `{kind: 'none-recorded'}`; do not carry a neighbouring edition's funder across.
2. **Regions attended, not co-organisers.** Record what the page says attended. Where the 2025 home page asserts 17 but its own Regional Partners carousel renders 15 logos, the archive contradicts itself — use `regionsAttended: null` and leave it for WTIA.
3. **2020 and 2021 winners are `{kind: 'off-site'}`**, pointing at `https://contest2020.bestasiaapp.hk/` and `https://contest2021.bestasiaapp.hk/`. Neither microsite was captured. Do not transcribe partial winner lists from photo captions.
4. **Only "Living & Culture" is named** for the 2025 category structure. Record the winners the page names — RIFFAI and 417 Technology among them — and no category you cannot source. What either company built is not described anywhere; do not describe it.

- [ ] **Step 2: Write the record**

Create `content/programs/asa.ts` with this shape, filled from Step 1:

```ts
import {asaProgramSchema, type AsaProgram} from '@/content/schemas';

/**
 * Transcribed from the captured archive, not from
 * docs/wtia-content-migration-audit.md, which is wrong about this programme's
 * funder for six editions. docs/wtia-programme-claims-review.md records what
 * the archive actually says.
 */
export const asa: AsaProgram = asaProgramSchema.parse({
  id: 'asa',
  editions: [
    {
      label: '2017',
      yearStart: 2017,
      funder: {
        kind: 'named',
        agency: 'createhk',
        initiativeEn: 'CreateSmart Initiative',
        initiativeZh: '創意智優計劃'
      },
      regionsAttended: null,
      venueEn: '…',
      venueZh: '…',
      winners: {kind: 'unrecorded'},
      images: []
    }
    // … one entry per documented edition, oldest first, through 2025.
  ]
});
```

Leave `images: []` on every edition — Task 8 fills them once the files exist on disk.

- [ ] **Step 3: Write the content test**

Create `tests/unit/program-content.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";

describe("ASA record", () => {
  // The parse in content/programs/asa.ts already throws on a malformed record;
  // this asserts the file is actually reachable and non-empty, so a future
  // refactor that stubs it out fails here rather than silently rendering
  // nothing.
  it("has editions", () => {
    expect(asa.editions.length).toBeGreaterThan(0);
  });

  // The correction this sub-project exists for. CCIDA appears only from 2024;
  // naming it against an earlier edition misattributes government funding.
  it("names no funder before its documented era", () => {
    for (const edition of asa.editions) {
      if (edition.funder.kind !== "named") continue;
      if (edition.funder.agency === "ccida") expect(edition.yearStart).toBeGreaterThanOrEqual(2024);
      if (edition.funder.agency === "createhk") expect(edition.yearStart).toBeLessThan(2024);
    }
  });

  // Neither microsite was captured, so a listed winner set for either year
  // means someone transcribed names from photo captions.
  it("defers the 2020 and 2021 winners off-site", () => {
    for (const yearStart of [2020, 2021]) {
      const edition = asa.editions.find((item) => item.yearStart === yearStart);
      if (!edition) continue;
      expect(edition.winners.kind, `${yearStart}`).toBe("off-site");
    }
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/program-content.test.ts`
Expected: PASS, 3 tests. A Zod error here means the record violates its own schema — fix the record, not the schema.

- [ ] **Step 5: Commit**

```bash
git add content/programs/asa.ts tests/unit/program-content.test.ts
git commit -m "feat: record ASA's editions with the funder the archive names"
```

---

## Task 5: HKICT's record

**Files:**
- Create: `content/programs/hkict.ts`
- Modify: `tests/unit/program-content.test.ts`

- [ ] **Step 1: Read the source pages**

Read every page listed under `"hkict"` in `content/program-pages.json`, starting with:

```
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-2020-01-2020-hong-kong-ict-awards-ict-startup-award.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-e3-80-90award-presentation-ceremony-e3-80-91hong-kong-ict-awards-2020-ict-startup-award-2020.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-hong-kong-ict-awards-2025-ict-startup-award-recruitment-day-e3-80-8c-e5-89-b5-e7-a7-91-e7-84-a1-e6-a5-b5-e9-99-90-ai-e5-bc-95-e9-a0-98-e5-88-9d-e5-89-b5-e6-96-b0-e6-99-82-e4-bb-a3-e3-80-8d.html
```

Two constraints from the claims review:

1. **OGCIO for 2020–2024, DPO for 2025 only.** A June 2024 recruitment event still bills its guest of honour under the OGCIO title.
2. **Winners for 2021, 2022 and 2024 are `{kind: 'unrecorded'}`.** Photo albums exist for two of those years and name nobody. If an album has a stable URL, `{kind: 'off-site'}` pointing at it is better than `unrecorded` — but only if it actually shows the winners.

The Best Mobile Apps Award lineage (2006 Best Ubiquitous → 2013–2017 Best Mobile Apps) is a different stream and stays off this page until WTIA answers whether it should appear.

- [ ] **Step 2: Write the record**

Create `content/programs/hkict.ts`:

```ts
import {hkictProgramSchema, type HkictProgram} from '@/content/schemas';

/**
 * The ICT Startup Award stream only, which begins with the 2020 edition. The
 * 2006 Best Ubiquitous Award -- renamed Best Mobile Apps Award in 2013 and run
 * through at least 2017 -- is a different stream, and whether it belongs on
 * this page is an open question in docs/wtia-programme-claims-review.md.
 */
export const hkict: HkictProgram = hkictProgramSchema.parse({
  id: 'hkict',
  editions: [
    {year: 2020, organisedFor: 'ogcio', winners: {kind: 'listed', entries: [/* … */]}, images: []}
    // … through 2025.
  ]
});
```

- [ ] **Step 3: Extend the content test**

Append to `tests/unit/program-content.test.ts`:

```ts
import {hkict} from "@/content/programs/hkict";

describe("HKICT record", () => {
  it("has editions", () => {
    expect(hkict.editions.length).toBeGreaterThan(0);
  });

  // DPO applies only from 2025. Naming it for an earlier edition attributes the
  // award to a body that did not exist under that name at the time.
  it("names the counterparty each edition's own era used", () => {
    for (const edition of hkict.editions) {
      if (edition.organisedFor === "dpo") expect(edition.year).toBeGreaterThanOrEqual(2025);
      if (edition.organisedFor === "ogcio") expect(edition.year).toBeLessThan(2025);
    }
  });

  // The Startup Award stream begins in 2020; anything earlier is the Best
  // Mobile Apps lineage, which is a different award.
  it("starts at the 2020 edition", () => {
    expect(Math.min(...hkict.editions.map(({year}) => year))).toBeGreaterThanOrEqual(2020);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/program-content.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add content/programs/hkict.ts tests/unit/program-content.test.ts
git commit -m "feat: record HKICT's editions with the era-correct counterparty"
```

---

## Task 6: CPAI's and TCT's records

CPAI has no editions and TCT's editions have genuinely different shapes, so these two go together as the pair that does not fit the awards mould.

**Files:**
- Create: `content/programs/cpai.ts`
- Create: `content/programs/tct.ts`
- Modify: `tests/unit/program-content.test.ts`

- [ ] **Step 1: Read the CPAI sources**

```
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-e4-b8-ad-e5-a4-a7-cuscs-wtiai-e5-90-88-e8-be-a6-genai-e5-95-86-e6-a5-ad-e6-87-89-e7-94-a8-e8-aa-b2-e7-a8-8b-ef-bc-9acpai-e5-b0-88-e6-a5-ad-e8-aa-8d-e8-ad-89.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-graduation-ceremony-for-the-certified-practitioner-in-generative-ai-for-business-innovation-and-applications-cpai-program.html
```

Three constraints:

1. **WTIA issues CPAI alone.** 「CPAI（Certified Practitioner in GenAI）由 WTIA 頒發」…「完成課程後同時獲頒 … CUSCS 結業證書」…「一個課程，兩張認證。」 One course, two distinct certificates. Not a joint credential.
2. **The subject is generative AI**, and the course is CUSCS's *Generative AI for Business Innovation and Applications*. Enrolment happens on CUSCS systems, not on hkwtia.org.
3. **The "150+ I&T companies" figure has no source anywhere in 577 pages.** It does not go on the page. Neither do fee, assessment requirements, validity period or prerequisites — none are in the archive.

- [ ] **Step 2: Write the CPAI record**

Create `content/programs/cpai.ts`:

```ts
import {cpaiProgramSchema, type CpaiProgram} from '@/content/schemas';

/**
 * A credential, not an event series -- no editions, no winners, no years.
 *
 * WTIA issues CPAI; CUSCS separately issues its own completion certificate to
 * the same graduates. The content audit called this a "joint WTIA x CUSCS
 * certification", which understates what WTIA owns, and the schema has no field
 * in which a joint issuer can be written.
 */
export const cpai: CpaiProgram = cpaiProgramSchema.parse({
  id: 'cpai',
  issuerEn: 'WTIA',
  issuerZh: '香港無線科技商會',
  coursePartnerEn: '…',
  coursePartnerZh: '…',
  courseNameEn: 'Generative AI for Business Innovation and Applications',
  courseNameZh: '…',
  syllabus: [/* one entry per module the archive lists, both locales */],
  images: []
});
```

- [ ] **Step 3: Read the TCT sources**

```
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-e3-80-90tech-to-connect-series-e3-80-91kick-off-seminar-unleashing-the-unprecedented-opportunities-in-a-new-tech-era.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-tech-to-connect-4-0-leaders-summit-transforming-smart-lead-through-industry-4-0.html
/Users/willylai/wtia-legacy-capture-20260812/pages/hkwtia-org-event-tech-to-connect-2024-ai-leaders-summit-harnessing-ai-to-drive-global-transformation.html
```

Everything known about TCT is inferred from roughly 50 individual event listings — the site's own navigation linked off to `techtoconnect.net`, which was never captured. Four constraints:

1. **2021–22 is the first edition and was 12 workshops** (the archive holds exactly 12 matching workshop pages). Tech to Connect 4.0 (2023) is the "2nd edition" by the 2023 summit's own wording, and is the 10-workshops-plus-2-seminars-plus-conference edition the audit wrongly describes as the programme's shape.
2. **GSP funding appears once, on the July 2023 seminar page.** Every other edition is `{kind: 'none-recorded'}`.
3. **The AI Leaders' Summit speaker count is unresolved** — its own page says fifteen in one sentence and eighteen in the next, and names none of them. Publish no speaker count. The "15+ experts from Huawei, Microsoft, HKPC" claim has no support; HKPC is the venue.
4. The 2019 TechConnect Conference & Festival is not an edition and is already excluded by Task 1.

- [ ] **Step 4: Write the TCT record**

Create `content/programs/tct.ts`:

```ts
import {tctProgramSchema, type TctProgram} from '@/content/schemas';

/**
 * Reconstructed from ~50 individual event listings; the series' own site,
 * techtoconnect.net, was never captured. `shape` is free text per edition
 * because the editions genuinely differ -- the audit's "10 workshops + 2
 * seminars" describes 4.0 (2023) alone, while the first edition was 12.
 */
export const tct: TctProgram = tctProgramSchema.parse({
  id: 'tct',
  editions: [
    {
      year: 2021,
      shapeEn: '12 industry workshops',
      shapeZh: '十二場業界工作坊',
      funder: {kind: 'none-recorded'},
      images: []
    }
    // … 2023 (4.0, GSP-funded), then the 2024-26 AI and robotics editions.
  ]
});
```

- [ ] **Step 5: Extend the content test**

Append to `tests/unit/program-content.test.ts`:

```ts
import {cpai} from "@/content/programs/cpai";
import {tct} from "@/content/programs/tct";

describe("CPAI record", () => {
  it("names WTIA as the issuer and CUSCS only as the course partner", () => {
    expect(cpai.issuerEn).toBe("WTIA");
    expect(cpai.coursePartnerEn).not.toBe(cpai.issuerEn);
  });
});

describe("TCT record", () => {
  it("has editions and starts no earlier than 2021", () => {
    expect(tct.editions.length).toBeGreaterThan(0);
    expect(Math.min(...tct.editions.map(({year}) => year))).toBeGreaterThanOrEqual(2021);
  });

  // GSP is named exactly once in 577 pages, on the July 2023 seminar page.
  it("names GSP for the 2023 edition only", () => {
    for (const edition of tct.editions) {
      if (edition.funder.kind === "named") expect(edition.year).toBe(2023);
    }
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/unit/program-content.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add content/programs/cpai.ts content/programs/tct.ts tests/unit/program-content.test.ts
git commit -m "feat: record CPAI as a credential and TCT's per-edition shapes"
```

---

## Task 7: The image download script

Modelled on `scripts/download-milestone-images.ts`, which already solved the two problems that will otherwise bite: the theme renders a "Related Posts" carousel *inside* `<article>` (counting it inflated the milestone estimate by 2.5×), and some images lazy-load with the real URL in `data-orig-src` while `src` holds a blank-SVG placeholder. `extractArticleRegion` and `resolveImageSrc` in `scripts/extract-milestones.ts` handle both; reuse them rather than writing new parsing.

**Files:**
- Create: `scripts/download-program-images.ts`
- Create: `tests/unit/download-program-images.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/download-program-images.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {extractImageUrls, localFilename} from "@/scripts/download-program-images";

describe("programme image extraction", () => {
  // The related-posts carousel sits inside <article>. Counting it is what made
  // an earlier estimate of this same archive wrong by a factor of two and a
  // half, so this is pinned rather than assumed.
  it("excludes the related-posts carousel", () => {
    const html = `
      <article>
        <img src="https://hkwtia.org/wp-content/uploads/real.jpg">
        <div class="related-posts">
          <img src="https://hkwtia.org/wp-content/uploads/unrelated.jpg">
        </div>
      </article>`;
    expect(extractImageUrls(html)).toEqual(["https://hkwtia.org/wp-content/uploads/real.jpg"]);
  });

  // Lazy-loaded images hold a blank-SVG placeholder in src and the real URL in
  // data-orig-src. Reading src would download 1x1 placeholders over the record.
  it("prefers data-orig-src over a placeholder src", () => {
    const html = `<article><img src="data:image/svg+xml,blank" data-orig-src="https://hkwtia.org/wp-content/uploads/lazy.jpg"></article>`;
    expect(extractImageUrls(html)).toEqual(["https://hkwtia.org/wp-content/uploads/lazy.jpg"]);
  });

  it("renames only what the map covers", () => {
    const map = {"a–b.png": "a-b.png"};
    expect(localFilename("https://hkwtia.org/x/a–b.png", map)).toBe("a-b.png");
    expect(localFilename("https://hkwtia.org/x/plain.png", map)).toBe("plain.png");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/download-program-images.test.ts`
Expected: FAIL — cannot resolve `@/scripts/download-program-images`.

- [ ] **Step 3: Write the script**

Create `scripts/download-program-images.ts`:

```ts
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

// downloadImages and fetchImageBytes already carry the Cloudflare 520 retry
// that hkwtia.org needs; reusing them keeps one implementation of the loop
// whose bug would silently record a failed fetch as saved.
import {downloadImages, fetchImageBytes} from "@/scripts/download-milestone-images";
import {extractArticleRegion, resolveImageSrc} from "@/scripts/extract-milestones";
import type {ProgramId} from "@/scripts/index-program-pages";

const OUTPUT_DIR = "public/images/programs";

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
 * Some originals carry an en-dash or Chinese characters, which the schema's src
 * pattern (/^\/images\/programs\/[A-Za-z0-9._-]+$/) can never match.
 * content/program-image-map.json records the ASCII-safe name chosen for each
 * during review; anything absent keeps its already-safe basename.
 */
export function localFilename(remoteUrl: string, renameMap: Readonly<Record<string, string>>): string {
  const original = decodeURIComponent(remoteUrl.split("/").pop() ?? "");
  return renameMap[original] ?? original;
}

async function main(): Promise<void> {
  const captureDir = process.argv[2];
  const countOnly = process.argv.includes("--count-only");
  if (!captureDir) throw new Error("USAGE: download-program-images <capture-dir> [--count-only]");

  const index = JSON.parse(readFileSync("content/program-pages.json", "utf8")) as Record<ProgramId, string[]>;
  const pagesDir = join(captureDir, "pages");
  const available = new Set(readdirSync(pagesDir));

  const perProgramme = new Map<ProgramId, Set<string>>();
  const missingPages: string[] = [];
  for (const [id, files] of Object.entries(index) as [ProgramId, string[]][]) {
    const urls = new Set<string>();
    for (const file of files) {
      if (!available.has(file)) {
        missingPages.push(file);
        continue;
      }
      for (const url of extractImageUrls(readFileSync(join(pagesDir, file), "utf8"))) urls.add(url);
    }
    perProgramme.set(id, urls);
  }

  // content/program-pages.json was generated from these exact capture files, so
  // this should never fire. If it does, the two inputs have drifted and every
  // count below is unreliable.
  if (missingPages.length > 0) {
    throw new Error(`${missingPages.length} indexed page(s) missing from ${pagesDir}: ${missingPages.join(", ")}`);
  }

  for (const [id, urls] of perProgramme) console.log(`${id}: ${urls.size} unique images`);
  const uniqueUrls = [...new Set([...perProgramme.values()].flatMap((set) => [...set]))].sort();
  console.log(`${uniqueUrls.length} unique across all four`);
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
      throw new Error(`two remote images resolve to the same local name "${name}": ${claimedBy} and ${url}`);
    }
    urlForFilename.set(name, url);
    filenameForUrl.set(url, name);
  }

  const unsafe = [...filenameForUrl.values()].filter((name) => !/^[A-Za-z0-9._-]+$/.test(name));
  if (unsafe.length > 0) {
    console.error(`${unsafe.length} filename(s) the schema will reject; add them to content/program-image-map.json:`);
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/download-program-images.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the script entry**

In `package.json`, after `"content:index-programs"`:

```json
    "content:program-images": "node --experimental-strip-types scripts/download-program-images.ts",
```

- [ ] **Step 6: Count before downloading**

Run: `npm run content:program-images -- /Users/willylai/wtia-legacy-capture-20260812 --count-only`

Expected: four per-programme counts and a total. **The spec's figures are ASA 170, HKICT 61, TCT 57, CPAI 5 — 293 total.** Those came from a manual catalogue during the survey, so an exact match is not required, but a material divergence is a bug to find *before* downloading:

- **Materially higher** — the region selection is probably including the related-posts carousel again. Check `extractArticleRegion` against a page with a carousel.
- **Materially lower** — it is dropping real content, or `content/program-pages.json` is missing pages. Re-run Task 1 Step 7's review.

Do not proceed to Task 8 until you can explain the difference.

- [ ] **Step 7: Commit**

```bash
git add scripts/download-program-images.ts tests/unit/download-program-images.test.ts package.json
git commit -m "feat: add the programme image download script"
```

---

## Task 8: Download the images and reference them

**Files:**
- Create: `public/images/programs/*` (binary)
- Create: `content/program-image-map.json` (only if Step 2 reports unsafe filenames)
- Modify: `content/programs/{asa,hkict,cpai,tct}.ts`

- [ ] **Step 1: Download**

Run: `npm run content:program-images -- /Users/willylai/wtia-legacy-capture-20260812`
Expected: `saved N, missed 0`.

If it exits reporting unsafe filenames, create `content/program-image-map.json` mapping each original basename to an ASCII-safe name — same shape as `content/milestone-image-map.json`:

```json
{
  "2017-–-Asia-Smart-App-Summit-1.png": "2017-Asia-Smart-App-Summit-1.png"
}
```

Then re-run. If it reports misses, re-run once — hkwtia.org returns intermittent Cloudflare 520s. If a URL misses twice, record it and raise it before continuing; these files exist nowhere else.

- [ ] **Step 2: Attach images to the records**

For each programme, add the relevant entries to the `images` arrays in `content/programs/*.ts`, with alt text in both locales:

```ts
      images: [
        {
          src: '/images/programs/2017-Asia-Smart-App-Summit-1.png',
          altEn: 'Award presentation at the 2017 Asia Smart App Summit',
          altZh: '二零一七年亞洲智能應用高峰會頒獎典禮'
        }
      ],
```

Write alt text that describes the photograph, not the edition — a reader using a screen reader already has the edition heading. Not every downloaded image needs a home: banners and repeated decorative furniture can stay on disk unreferenced.

- [ ] **Step 3: Verify every reference exists on disk**

Run:

```bash
node --experimental-strip-types -e "
import {existsSync} from 'node:fs';
import {readFileSync} from 'node:fs';
const srcs = ['asa','hkict','cpai','tct'].flatMap((id) =>
  [...readFileSync(\`content/programs/\${id}.ts\`, 'utf8').matchAll(/src: '(\/images\/programs\/[^']+)'/g)].map(([, s]) => s));
const missing = srcs.filter((s) => !existsSync(\`public\${s}\`));
console.log(\`\${srcs.length} referenced, \${missing.length} missing\`);
for (const s of missing) console.error(s);
process.exitCode = missing.length ? 1 : 0;"
```

Expected: `N referenced, 0 missing`.

- [ ] **Step 4: Run the schema tests**

Run: `npx vitest run tests/unit/program-schema.test.ts tests/unit/program-content.test.ts`
Expected: PASS. A failure here means an `src` does not match `/^\/images\/programs\/[A-Za-z0-9._-]+$/` — add it to the rename map, re-download, and fix the reference.

- [ ] **Step 5: Commit**

```bash
git add public/images/programs content/programs content/program-image-map.json
git commit -m "feat: bring the programme archive images own-origin"
```

---

## Task 9: Page furniture in the message bundles

Everything on these pages that is not a fact goes in the bundles, where staff can edit it at `/admin/page-copy`. Staff can reword an introduction; they cannot edit a funder or a winner.

**Files:**
- Modify: `messages/en.json`, `messages/zh-HK.json`

- [ ] **Step 1: Add the shared record furniture**

In `messages/en.json`, add a `record` key inside the existing `programs` object (alongside `asa`, `cpai`, `hkict`, `tct`):

```json
    "record": {
      "editionsHeading": "Editions",
      "winnersHeading": "Winners",
      "categoryHeading": "Category",
      "fundedBy": "Funded by {agency} under the {initiative}",
      "organisedFor": "Organised for {agency}",
      "regionsAttended": "{count} regions attended",
      "venue": "Venue",
      "winnersOffSite": "The full winner list is published on the edition's own site.",
      "winnersOffSiteLink": "View the winners",
      "winnersUnrecorded": "WTIA's archive does not record the winners for this edition.",
      "credentialIssuer": "Issued by",
      "credentialCoursePartner": "Course delivered with",
      "credentialSyllabus": "Syllabus"
    }
```

- [ ] **Step 2: Mirror it in Chinese**

Add the same keys to `messages/zh-HK.json` under `programs.record`:

```json
    "record": {
      "editionsHeading": "歷屆",
      "winnersHeading": "得獎者",
      "categoryHeading": "組別",
      "fundedBy": "由{agency}透過{initiative}資助",
      "organisedFor": "為{agency}籌辦",
      "regionsAttended": "{count} 個地區參與",
      "venue": "地點",
      "winnersOffSite": "完整得獎名單刊於該屆的專題網站。",
      "winnersOffSiteLink": "查看得獎名單",
      "winnersUnrecorded": "商會的存檔沒有記錄該屆得獎者。",
      "credentialIssuer": "頒發機構",
      "credentialCoursePartner": "課程合辦機構",
      "credentialSyllabus": "課程內容"
    }
```

The `{agency}` and `{initiative}` placeholders are filled from `content/programs/agencies.ts` and the edition's own `initiativeEn`/`initiativeZh`, so a government body name is never written into the bundle where staff could edit it.

- [ ] **Step 3: Verify parity**

Run: `npm test -- messages` and `npm run audit:strings`
Expected: parity tests PASS, string audit clean.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/zh-HK.json
git commit -m "feat: add programme record page furniture to both bundles"
```

---

## Task 10: Render the editions

**Files:**
- Create: `components/marketing/program-editions.tsx`
- Create: `components/marketing/program-credential.tsx`
- Modify: `app/[locale]/(public)/programs/{asa,hkict,tct,cpai}/page.tsx`

- [ ] **Step 1: Write the editions component**

Create `components/marketing/program-editions.tsx`. It is a Server Component — no `'use client'`, because nothing here is interactive:

```tsx
import Image from 'next/image';
import {useTranslations} from 'next-intl';

import {AGENCIES, type AgencyId} from '@/content/programs/agencies';
import type {ProgramImage, ProgramWinners} from '@/content/schemas';

type Edition = {
  heading: string;
  attribution: {agency: AgencyId; initiative: string} | null;
  organisedFor: AgencyId | null;
  meta: readonly string[];
  winners: ProgramWinners;
  images: readonly ProgramImage[];
};

type ProgramEditionsProps = {
  editions: readonly Edition[];
  agencyName: (id: AgencyId) => string;
  alt: (image: ProgramImage) => string;
};

export function ProgramEditions({editions, agencyName, alt}: ProgramEditionsProps) {
  const t = useTranslations('programs.record');

  return (
    <section className="container mx-auto px-6 py-16">
      <h2 className="text-2xl font-semibold">{t('editionsHeading')}</h2>
      <ol className="mt-8 space-y-12">
        {editions.map((edition) => (
          <li key={edition.heading} className="glass-card p-6">
            <h3 className="text-xl font-semibold">{edition.heading}</h3>

            {edition.attribution ? (
              <p className="text-muted-foreground mt-2">
                {t('fundedBy', {
                  agency: agencyName(edition.attribution.agency),
                  initiative: edition.attribution.initiative
                })}
              </p>
            ) : null}

            {edition.organisedFor ? (
              <p className="text-muted-foreground mt-2">
                {t('organisedFor', {agency: agencyName(edition.organisedFor)})}
              </p>
            ) : null}

            {edition.meta.map((line) => (
              <p key={line} className="text-muted-foreground mt-2">{line}</p>
            ))}

            <Winners winners={edition.winners} />

            {edition.images.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {edition.images.map((image) => (
                  <Image key={image.src} src={image.src} alt={alt(image)} width={640} height={427} className="rounded-lg" />
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Absence is shown as absence. Where the archive defers to a microsite the page
 * links out; where it records nothing it says so. Neither case renders an empty
 * table, which would read as "nobody won".
 */
function Winners({winners}: {winners: ProgramWinners}) {
  const t = useTranslations('programs.record');

  if (winners.kind === 'unrecorded') {
    return <p className="text-muted-foreground mt-4">{t('winnersUnrecorded')}</p>;
  }

  if (winners.kind === 'off-site') {
    return (
      <p className="text-muted-foreground mt-4">
        {t('winnersOffSite')}{' '}
        {/* An external microsite, so a bare <a> is correct -- localizedPath and
            next-intl's Link are for our own routes only. */}
        <a className="underline" href={winners.url} rel="noreferrer" target="_blank">
          {t('winnersOffSiteLink')}
        </a>
      </p>
    );
  }

  return (
    <table className="mt-4 w-full text-left">
      <thead>
        <tr>
          <th scope="col" className="py-2">{t('winnersHeading')}</th>
          <th scope="col" className="py-2">{t('categoryHeading')}</th>
        </tr>
      </thead>
      <tbody>
        {winners.entries.map((entry) => (
          <tr key={`${entry.name}-${entry.category}`} className="border-t">
            <td className="py-2">{entry.name}</td>
            <td className="py-2">{entry.category}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

The component takes already-localised strings (`heading`, `meta`, `entry.name`) rather than reaching into `nameEn`/`nameZh` itself, so locale selection happens once per page instead of once per field.

- [ ] **Step 2: Wire up the ASA page**

Modify `app/[locale]/(public)/programs/asa/page.tsx`, keeping the existing hero and metadata exactly as they are and appending the editions below:

```tsx
import {AGENCIES} from '@/content/programs/agencies';
import {asa} from '@/content/programs/asa';
import {ProgramEditions} from '@/components/marketing/program-editions';
```

Inside the component, after the existing `<ProgramDetail … />`:

```tsx
  const zh = locale === 'zh-HK';
  return (
    <>
      <ProgramDetail program={program} title={t('title')} description={t('description')} status={t('status')} />
      <ProgramEditions
        agencyName={(id) => (zh ? AGENCIES[id].nameZh : AGENCIES[id].nameEn)}
        alt={(image) => (zh ? image.altZh : image.altEn)}
        editions={asa.editions.map((edition) => ({
          heading: edition.label,
          attribution: edition.funder.kind === 'named'
            ? {agency: edition.funder.agency, initiative: zh ? edition.funder.initiativeZh : edition.funder.initiativeEn}
            : null,
          organisedFor: null,
          meta: [zh ? edition.venueZh : edition.venueEn],
          winners: localiseWinners(edition.winners, zh),
          images: edition.images
        }))}
      />
    </>
  );
```

Add `localiseWinners` to `components/marketing/program-editions.tsx` and export it, so all four pages share one implementation:

```tsx
export function localiseWinners(winners: ProgramWinners, zh: boolean) {
  if (winners.kind !== 'listed') return winners;
  return {
    kind: 'listed' as const,
    entries: winners.entries.map((entry) => ({
      name: zh ? entry.nameZh : entry.nameEn,
      category: zh ? entry.categoryZh : entry.categoryEn
    }))
  };
}
```

Adjust the `ProgramWinners` type used by the component to the localised shape (`{kind: 'listed', entries: {name, category}[]} | {kind: 'off-site', url} | {kind: 'unrecorded'}`) — define it in the component file as `LocalisedWinners` and keep `ProgramWinners` as the storage shape.

- [ ] **Step 3: Wire up HKICT and TCT the same way**

HKICT maps `organisedFor: edition.organisedFor`, `attribution: null`, `heading: String(edition.year)`, `meta: []`.

TCT maps `heading: String(edition.year)`, `attribution` from its funder, `organisedFor: null`, `meta: [zh ? edition.shapeZh : edition.shapeEn]`.

- [ ] **Step 4: Write the CPAI component and wire its page**

Create `components/marketing/program-credential.tsx` rendering issuer, course partner, course name and syllabus from `programs.record` keys. It takes localised strings and has no editions, no winners and no funder — the shape difference is the point.

- [ ] **Step 5: Verify the pages render in both locales**

Run: `npm run dev` and open all eight:

```
http://localhost:3000/en/programs/asa      http://localhost:3000/zh/programs/asa
http://localhost:3000/en/programs/hkict    http://localhost:3000/zh/programs/hkict
http://localhost:3000/en/programs/cpai     http://localhost:3000/zh/programs/cpai
http://localhost:3000/en/programs/tct      http://localhost:3000/zh/programs/tct
```

Check: every edition heading renders; funders read correctly per era; images load (a broken image means the CSP rejected a remote host — check the browser console); the off-site and unrecorded winner cases render their line rather than an empty table; `/zh` pages are Chinese throughout.

- [ ] **Step 6: Run the checks**

Run: `npm run lint && npm run typecheck && npm run audit:strings && npm test`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add components/marketing/program-editions.tsx components/marketing/program-credential.tsx "app/[locale]/(public)/programs"
git commit -m "feat: render the programme record on the four programme pages"
```

---

## Task 11: Guard the thirteen contradicted claims

The plan's tests so far prove the record is *well-formed*. This one proves it is not *wrong* in the specific ways the archive already caught the audit being wrong.

**Files:**
- Create: `tests/unit/program-contradicted-claims.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/unit/program-contradicted-claims.test.ts`:

```ts
import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

/**
 * The thirteen claims in docs/wtia-content-migration-audit.md that WTIA's own
 * archive contradicts, pinned so none can reach a public page.
 *
 * This asserts on the content source text rather than on rendered output
 * because the failure mode is an editor pasting a claim back in from the audit,
 * which is a source-level event. Where a check can be behavioural instead --
 * funder era, edition start year -- it lives in program-content.test.ts.
 */
const SOURCES = ["asa", "hkict", "cpai", "tct"].map((id) => ({
  id,
  text: readFileSync(`content/programs/${id}.ts`, "utf8"),
}));

const messages = ["en", "zh-HK"].map((locale) => ({
  locale,
  text: JSON.stringify(JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).programs),
}));

describe("contradicted claims stay off the programme pages", () => {
  // No list, no logos, no named employers, no indication whether it is a
  // survey, a pledge list or a membership count. Not in 577 pages.
  it("does not publish the unsourced '150+ companies' figure", () => {
    for (const {id, text} of SOURCES) expect(text, id).not.toMatch(/150\+/);
    for (const {locale, text} of messages) expect(text, locale).not.toMatch(/150\+/);
  });

  // WTIA issues CPAI alone; CUSCS separately issues its own completion
  // certificate. Calling it joint understates what WTIA owns.
  it("does not describe CPAI as jointly issued", () => {
    const cpai = SOURCES.find(({id}) => id === "cpai")!.text;
    expect(cpai).not.toMatch(/joint/i);
    for (const {locale, text} of messages) expect(text, locale).not.toMatch(/joint/i);
  });

  // HKPC is the venue. No Huawei, Microsoft or HKPC person appears anywhere in
  // the archive, and the AI Leaders' Summit page names no speakers at all --
  // while contradicting itself on whether there were fifteen or eighteen.
  it("claims no speaker roster for the AI Leaders' Summit", () => {
    const tct = SOURCES.find(({id}) => id === "tct")!.text;
    for (const pattern of [/Huawei/i, /Microsoft/i, /HKPC/i, /15\+ experts/i]) {
      expect(tct, String(pattern)).not.toMatch(pattern);
    }
  });

  // The audit read "16 regional co-organisers" off a page that says 16 regions
  // attended. Explicit co-organiser counts exist only for 2013 and 2016.
  it("does not claim regional co-organisers", () => {
    for (const {id, text} of SOURCES) expect(text, id).not.toMatch(/co-?organiser/i);
    for (const {locale, text} of messages) expect(text, locale).not.toMatch(/co-?organiser/i);
  });

  // A same-named predecessor with no series branding and no edition number.
  it("does not present the 2019 TechConnect event as a TCT edition", () => {
    const tct = SOURCES.find(({id}) => id === "tct")!.text;
    expect(tct).not.toMatch(/2019/);
    expect(tct).not.toMatch(/TechConnect/i);
  });

  // Every documented ASA edition from 2017 through 2022/23 names Create Hong
  // Kong. This catches the string form; program-content.test.ts catches the
  // structural form.
  it("never names CCIDA in ASA's pre-2024 prose", () => {
    const asa = SOURCES.find(({id}) => id === "asa")!.text;
    const ccidaLines = asa.split("\n").filter((line) => /ccida/i.test(line));
    for (const line of ccidaLines) expect(line, line).not.toMatch(/201\d|202[0-3]/);
  });

  // The proof the guard can still catch a violation -- otherwise a refactor
  // that empties SOURCES would let every assertion above pass vacuously.
  it("detects the shapes it is meant to catch", () => {
    expect(SOURCES).toHaveLength(4);
    for (const {id, text} of SOURCES) expect(text.length, id).toBeGreaterThan(200);
    const hostile = "recognised by 150+ I&T companies, a joint certification";
    expect(hostile).toMatch(/150\+/);
    expect(hostile).toMatch(/joint/i);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/program-contradicted-claims.test.ts`
Expected: PASS, 7 tests. **A failure is a real finding** — the content repeats a claim the archive contradicts. Fix the content, not the test.

- [ ] **Step 3: Prove the guard fails when it should**

Temporarily add `// recognised by 150+ I&T companies` to `content/programs/cpai.ts` and re-run.
Expected: FAIL on the first test. Remove the line and confirm PASS again.

- [ ] **Step 4: Extend the content contract**

In `tests/unit/content-contract.test.ts`, add to the existing `describe('public content contract')`:

```ts
  it('parses every programme record module', async () => {
    const records = await Promise.all([
      import('@/content/programs/asa'),
      import('@/content/programs/hkict'),
      import('@/content/programs/cpai'),
      import('@/content/programs/tct')
    ]);
    // Each module parses at import time, so reaching here means all four are
    // valid; this pins that all four are actually wired up and reachable.
    expect(records).toHaveLength(4);
  });
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/program-contradicted-claims.test.ts tests/unit/content-contract.test.ts
git commit -m "test: keep the thirteen contradicted claims off the programme pages"
```

---

## Task 12: The translation review list

**Files:**
- Modify: `docs/wtia-translation-review.md`

- [ ] **Step 1: Append the programme section**

Add a section listing only the proper nouns, each with the rendering used and the archive page it came from — award names in both Chinese forms where the archive gives two, the four government bodies, and company names of winners. WTIA reviews a list of terms, not prose.

Call out the one the archive contradicts itself on: the 2025 rebrand uses 亞洲智慧創新大獎 in one post's title and 亞洲智能創新大獎 for the grand award in the same post. Ask which is correct rather than picking one.

- [ ] **Step 2: Commit**

```bash
git add docs/wtia-translation-review.md
git commit -m "docs: add the programme proper nouns to the translation review"
```

---

## Task 13: Full verification

- [ ] **Step 1: Run everything**

```bash
npm test && npm run lint && npm run typecheck && npm run audit:strings && npm run build
```

Expected: all green. The build is not optional — `next build --webpack` is where a Server/Client Component boundary mistake surfaces.

- [ ] **Step 2: Check the invariants by hand**

- `grep -rn "images/programs" content/programs/` — every `src` own-origin, no `http`.
- `grep -rn '/\${locale}' app/\[locale\]/\(public\)/programs/` — no hits. Hand-built locale prefixes render `/zh-HK/…`, which the proxy does not recognise.
- `grep -rni "funder" content/schemas.ts` — `funder` appears only inside an `editions` array element.

- [ ] **Step 3: Update AGENTS.md**

Add a changelog entry recording what shipped and, most importantly, that the content audit is unreliable for these four programmes and `docs/wtia-programme-claims-review.md` is the corrected source.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record the programme records migration in the changelog"
```

---

## Out of scope

Do not let the work grow into these:

- **Leadership content** — sub-project 2b's tail.
- **The photo gallery and Meet Our Members as showcase entries** — sub-project 4.
- **Anything in the spec's "Known gaps" list.** Judging criteria, judge names, entry counts, prize values, ASA 2020/2021 winner lists, HKICT 2021/2022/2024 winners, the full 2025 ASA category structure, what RIFFAI and 417 Technology built, CPAI's fee and assessment terms, the "150+" figure's source, and TCT's 2024–26 funder all require answers from WTIA. They are recorded as gaps so a later reader does not mistake them for oversights. **Shipping without them is the design, not a compromise.**
- **Legacy redirects for programme URLs.** The 61 post redirects shipped in sub-project 2b; nothing in this spec extends them.
- **Renaming the `/programs` routes to `/programmes`.** They are public URLs.

---

## Self-review notes

Checked against the spec, section by section:

- **Goal and acceptance boundary** → Tasks 4–6 (editions, funders, winners), Task 10 (microsite links), Task 11 (none of the thirteen claims).
- **The audit is unreliable** → stated in Context, encoded as exclusions in Task 1, pinned in Task 11.
- **Four schemas, not one** → Task 2. `funder` on the edition only, enforced by `.strict()` and tested directly.
- **Rendering** → Tasks 9 and 10. The furniture/fact split is the reason `programs.record` holds no agency names.
- **Images** → Tasks 7 and 8, reusing the milestone region selection so the carousel and lazy-load lessons carry over.
- **Translation** → Task 12, appended to the existing review document.
- **Invariants** → all five covered: unevidenced attribution (Task 11), no programme-level funder (Task 2), bundle parity (Task 9), no remote host (Task 2 schema + Task 13), no hand-built locale prefix (Task 13).
- **Known gaps** → Out of scope, listed individually.

Type consistency: `ProgramId` is defined in `scripts/index-program-pages.ts` and imported by `scripts/download-program-images.ts`. `ProgramWinners` and `ProgramImage` are exported from `content/schemas.ts`; the localised winners shape is a separate `LocalisedWinners` in the component, which Task 10 Step 2 calls out explicitly so the two are not conflated.

Two places where a step says to fill from a source rather than showing the final value — the edition arrays in Tasks 4–6, and the alt text in Task 8. That is deliberate: the values exist only in the capture, and the step names the exact files to transcribe from, the constraints that decide each field, and the schema that rejects a half-filled record. Inventing plausible winner names here would be the worst possible failure for a sub-project whose whole purpose is not publishing unsourced claims.
