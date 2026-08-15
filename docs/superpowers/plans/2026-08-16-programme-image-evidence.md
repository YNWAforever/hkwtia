# Programme Image Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-read WTIA's programme archive for the facts that live in its images rather than its prose, and correct the four programme records and the claims review where they say "the archive does not name this" and the archive does — in a graphic.

**Architecture:** A triage step narrows 180 downloaded images to the ~40 that could plausibly carry an attribution, a review step reads those and writes findings to a structured JSON file, and the remaining tasks apply the findings: a schema change so TCT can name its funding body, record edits, and a correction pass over the client-facing claims review. Every finding carries the image it came from, so a reader can check it the same way the text-sourced facts already can be.

**Tech Stack:** TypeScript strict, Zod, Vitest, macOS `sips` for image metadata. No new dependencies.

---

## Why this exists

`docs/superpowers/plans/2026-08-12-programme-records.md` shipped four programme records built by transcribing page **text**. Four images were opened at the very end of that work, to write alt text. Three of the four changed what we knew:

- **Tech to Connect 4.0's speaker line-up graphic** (`TTC_9.jpg`) prints `Funding Organisation 創新科技署 Innovation and Technology Commission` beside `Organiser WTIA`. `content/programs/tct.ts` records the funder as a scheme with no body attached, and its own comment says the archive "never names the administering agency". The archive does; the prose doesn't.
- The same graphic **names thirteen speakers with their companies**, for a series `docs/wtia-programme-claims-review.md` describes as naming none.
- **The 2024 Asia Smart App Awards stage backdrop** (`ASA24_9.jpg`) carries `Sponsor CCIDAHK` and a government-funded-programme badge, independently corroborating a funder that had been read from a workshop disclaimer.

Four images, three findings. There are 176 more.

This matters beyond tidiness. The sub-project's entire promise to WTIA is that the new pages state what their archive supports and nothing else. A record that says "unrecorded" where WTIA's own poster says otherwise is a different kind of wrong from a fabrication, but it is still wrong, and it is the kind WTIA will notice first — because they remember the poster.

## What this plan does not do

- **It does not OCR.** No dependency is added and no text is machine-extracted. Images are looked at.
- **It does not re-open the transcription.** Text-sourced values stay as they are unless an image contradicts them, and a contradiction is recorded as a contradiction rather than silently resolved.
- **It does not touch `public/images/programs/` contents.** Those are committed and correct.

## Reading order

1. `docs/wtia-programme-claims-review.md` — the corrected claim log, now carrying a caution that its findings describe what is absent from page *text*.
2. `content/programs/{asa,hkict,cpai,tct}.ts` — the four records. Their docblocks enumerate every drafted value and every deliberate omission.
3. `content/schemas.ts` — `asaFundingSchema` and `tctProgramSchema` in particular. TCT's `funder` comment is the one this plan changes.
4. `content/program-image-pages.json` — maps each captured page to the local paths of the images it referenced. This is how an image gets attributed to an edition.

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `scripts/triage-program-images.ts` | Narrows 180 images to those whose shape or name suggests an attribution graphic |
| `content/program-image-findings.json` | One entry per reviewed image: what it shows, what it attributes, whether it agrees with the record |
| `tests/unit/triage-program-images.test.ts` | The triage keeps the known-positive images and drops obvious photographs |
| `tests/unit/program-image-findings.test.ts` | Every finding names a real image; every "contradicts" finding is reflected in a record comment |

**Modified:**

| Path | Change |
|---|---|
| `content/schemas.ts` | TCT funding gains an optional named body, so ITC can be recorded |
| `content/programs/tct.ts` | Records ITC for the 2023 edition; docblock loses the "cannot hold" section |
| `content/programs/{asa,hkict,cpai}.ts` | Image-sourced corrections, if the review finds any |
| `docs/wtia-programme-claims-review.md` | Corrections where an image answers a question the review asks WTIA |
| `AGENTS.md` | Changelog entry |

---

## Task 1: Triage the 180 images

Reviewing 180 images one by one is the obvious approach and the wrong one: most are event photographs that carry no attribution, and a reviewer who looks at 140 crowd shots stops reading carefully before reaching the poster that matters. This narrows the set by shape and name, and deliberately errs toward including too much.

**Files:**
- Create: `scripts/triage-program-images.ts`
- Create: `tests/unit/triage-program-images.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/triage-program-images.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {isLikelyAttributionGraphic} from "@/scripts/triage-program-images";

describe("programme image triage", () => {
  // Verified by hand: this is the Tech to Connect 4.0 speaker line-up, and it
  // carries the funding-organisation line that motivated this whole plan. If
  // the triage ever stops selecting it, the triage is broken.
  it("keeps the graphic that started this", () => {
    expect(isLikelyAttributionGraphic({name: "TTC_9.jpg", width: 2000, height: 1000})).toBe(true);
  });

  // Wide aspect ratios are how a poster, banner or line-up card differs from a
  // photograph: 34 of the 180 are wider than 1.7:1, and every attribution found
  // by hand so far was one of them or was named like one.
  it("keeps wide graphics and name-flagged files", () => {
    expect(isLikelyAttributionGraphic({name: "anything.jpg", width: 1920, height: 1080})).toBe(true);
    expect(isLikelyAttributionGraphic({name: "Speaker-Line-up-1080x606.png", width: 800, height: 800})).toBe(true);
    expect(isLikelyAttributionGraphic({name: "TechToConnect-banner_300-01-01-1.png", width: 300, height: 300})).toBe(true);
  });

  // A 4:3 or 3:2 frame with no telling name is a camera photograph. Excluding
  // these is the entire point; if nothing is excluded the reviewer is back to
  // 180 images.
  it("drops ordinary photographs", () => {
    expect(isLikelyAttributionGraphic({name: "LAM1134-scaled.jpg", width: 2000, height: 1333})).toBe(false);
    expect(isLikelyAttributionGraphic({name: "ICT23_4.jpg", width: 1600, height: 1067})).toBe(false);
  });

  // The stage backdrop in ASA24_9.jpg carries "Sponsor CCIDAHK" and is a 3:2
  // photograph, so shape and name both miss it. The triage cannot catch this
  // class and must not pretend to -- Step 5 handles it by sampling.
  it("does not claim to catch attributions inside photographs", () => {
    expect(isLikelyAttributionGraphic({name: "ASA24_9.jpg", width: 2000, height: 1333})).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/triage-program-images.test.ts`
Expected: FAIL — cannot resolve `@/scripts/triage-program-images`.

- [ ] **Step 3: Write the triage**

Create `scripts/triage-program-images.ts`:

```ts
import {execFileSync} from "node:child_process";
import {readdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";

/**
 * Narrows the 180 downloaded programme images to those worth reading for an
 * attribution.
 *
 * The four images opened by hand at the end of the records migration produced
 * three findings, including a government funding body the records say the
 * archive never names. This exists so the other 176 get looked at without a
 * reviewer having to hold 180 images in their head -- attention spent on crowd
 * photographs is attention not spent on the poster that carries a sponsor line.
 *
 * Deliberately over-inclusive. A false positive costs one look; a false
 * negative costs a fact.
 */
const IMAGE_DIR = "public/images/programs";

// Posters, banners, line-up cards and agenda graphics are wider than photos.
// Measured: 34 of 180 exceed this, and every attribution found by hand was
// either one of them or carried one of the names below.
const WIDE_RATIO = 1.7;

const TELLING_NAMES =
  /banner|poster|line-?up|speaker|backdrop|agenda|programme|leaflet|flyer|kv|certificate|ws\d|workshop\d/i;

export type ImageShape = {name: string; width: number; height: number};

export function isLikelyAttributionGraphic({name, width, height}: ImageShape): boolean {
  if (TELLING_NAMES.test(name)) return true;
  return height > 0 && width / height > WIDE_RATIO;
}

/** Reads pixel dimensions via macOS sips, which needs no dependency. */
export function readShape(dir: string, name: string): ImageShape {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", join(dir, name)], {
    encoding: "utf8",
  });
  const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1] ?? 0);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1] ?? 0);
  return {name, width, height};
}

function main(): void {
  const names = readdirSync(IMAGE_DIR).filter((n) => !n.startsWith("."));
  const selected = names.map((n) => readShape(IMAGE_DIR, n)).filter(isLikelyAttributionGraphic);
  writeFileSync(
    "content/program-image-triage.json",
    `${JSON.stringify(selected.map(({name}) => name).sort(), null, 2)}\n`,
  );
  console.log(`${selected.length} of ${names.length} images selected for review`);
}

if (process.argv[1]?.endsWith("triage-program-images.ts")) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/triage-program-images.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the script entry and run it**

In `package.json`, after `"content:program-images"`:

```json
    "content:triage-images": "tsx scripts/triage-program-images.ts",
```

Run: `npm run content:triage-images`
Expected: roughly 40–50 of 180 selected, and `content/program-image-triage.json` written.

**Then add, by hand, every image referenced by an edition-defining page** — the ceremony, summit and edition-post pages listed in each record's comments — regardless of shape. `ASA24_9.jpg` is the proof that a 3:2 photograph can carry a sponsor line on the backdrop behind the people. Look up those pages in `content/program-image-pages.json` and append their images to the triage file, deduplicated.

- [ ] **Step 6: Commit**

```bash
git add scripts/triage-program-images.ts tests/unit/triage-program-images.test.ts content/program-image-triage.json package.json
git commit -m "feat: triage the programme images worth reading for attributions"
```

---

## Task 2: Review the triaged images and record findings

**Files:**
- Create: `content/program-image-findings.json`
- Create: `tests/unit/program-image-findings.test.ts`

- [ ] **Step 1: Define the finding shape**

Create `content/program-image-findings.json` with this structure. One entry per image reviewed, including the ones that turn out to say nothing — an image reviewed and found empty is a fact about the archive, and without it a later reader cannot tell "checked, nothing there" from "never looked".

```json
{
  "TTC_9.jpg": {
    "shows": "Tech to Connect 4.0 Leaders Summit speaker line-up, 20 April 2023, HKPC Building",
    "attributions": [
      {
        "kind": "funder",
        "text": "Funding Organisation 創新科技署 Innovation and Technology Commission",
        "programme": "tct",
        "edition": 2023
      }
    ],
    "agreesWithRecord": false,
    "note": "content/programs/tct.ts records a scheme with no body and says the archive never names the administering agency."
  },
  "LAM1134-scaled.jpg": {
    "shows": "Group photograph, no visible signage",
    "attributions": [],
    "agreesWithRecord": true,
    "note": ""
  }
}
```

- [ ] **Step 2: Review the images in batches of ten**

Open each image in `content/program-image-triage.json` and write its entry. Ten at a time, committing after each batch — a reviewer who tries to hold forty in one pass writes worse notes by the thirtieth.

For each image, record: **what it shows**, and **every organisation name, role label and date printed in it**. The words that matter most are the ones next to a role: `Organiser`, `Sponsor`, `Funding Organisation`, `Supported by`, `Co-organiser`, `主辦`, `贊助`, `資助機構`, `合辦`.

Set `agreesWithRecord: false` when the image says something the corresponding record does not — whether the record is silent or says the opposite. Name the record and the field in `note`.

**Do not edit any record in this task.** Findings first, corrections second: a reviewer who edits as they go starts arguing with the record instead of reading the image.

- [ ] **Step 3: Write the findings test**

Create `tests/unit/program-image-findings.test.ts`:

```ts
import {existsSync, readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

const findings = JSON.parse(readFileSync("content/program-image-findings.json", "utf8")) as Record<
  string,
  {shows: string; attributions: {kind: string; text: string; programme: string}[]; agreesWithRecord: boolean; note: string}
>;

const triaged = JSON.parse(readFileSync("content/program-image-triage.json", "utf8")) as string[];

describe("programme image findings", () => {
  it("covers every triaged image", () => {
    const reviewed = new Set(Object.keys(findings));
    const missing = triaged.filter((name) => !reviewed.has(name));
    expect(missing, `unreviewed: ${missing.join(", ")}`).toEqual([]);
  });

  it("names a real image for every finding", () => {
    for (const name of Object.keys(findings)) {
      expect(existsSync(`public/images/programs/${name}`), name).toBe(true);
    }
  });

  // A disagreement with no note is a finding nobody can act on.
  it("explains every disagreement", () => {
    for (const [name, finding] of Object.entries(findings)) {
      if (finding.agreesWithRecord) continue;
      expect(finding.note.length, name).toBeGreaterThan(20);
      expect(finding.attributions.length, name).toBeGreaterThan(0);
    }
  });

  // Guards against a review that records only the interesting images and leaves
  // the empty ones out, which would make "checked and empty" indistinguishable
  // from "never opened".
  it("records the images that say nothing, too", () => {
    const empty = Object.values(findings).filter((f) => f.attributions.length === 0);
    expect(empty.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npx vitest run tests/unit/program-image-findings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add content/program-image-findings.json tests/unit/program-image-findings.test.ts
git commit -m "feat: record what the programme archive's images actually say"
```

---

## Task 3: Let TCT name a funding body

**Files:**
- Modify: `content/schemas.ts`
- Modify: `tests/unit/program-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/program-schema.test.ts`, inside the existing `describe("programme schemas")`:

```ts
  // TCT's funder was modelled as a scheme with no body because GSP appears once
  // in 577 pages of prose and no page expands it. The edition's own speaker
  // line-up graphic does: "Funding Organisation 創新科技署 Innovation and
  // Technology Commission". GSP is the ITC's General Support Programme, so the
  // two agree, and the schema now has somewhere to put the body.
  it("lets a TCT edition name the body behind the scheme", () => {
    const named = {kind: "named" as const, schemeEn: "GSP", schemeZh: "GSP"};
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], funder: {...named, agency: "itc"}}],
    })).not.toThrow();
    // Still optional: the 2021 and 2024-26 editions name no funder at all, and
    // 2023's prose named a scheme years before anyone read the poster.
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], funder: named}],
    })).not.toThrow();
    // And still not a free-text field -- the whole point of the agency enums is
    // that a wrong government body is a parse error, not a typo.
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], funder: {...named, agency: "ccida"}}],
    })).toThrow();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/program-schema.test.ts`
Expected: FAIL — `.strict()` rejects the unknown key `agency`.

- [ ] **Step 3: Add the field**

In `content/schemas.ts`, in `tctProgramSchema`'s `funder` union, extend the `named` member:

```ts
      z.object({
        kind: z.literal('named'),
        schemeEn: z.string().min(1),
        schemeZh: z.string().min(1),
        // Optional, and an enum rather than free text for the same reason ASA's
        // agency is: naming the wrong government body is specific and checkable.
        // Present only where an image or a page actually names the body -- the
        // 2023 edition's speaker line-up graphic prints "Funding Organisation
        // 創新科技署 Innovation and Technology Commission" beside "Organiser
        // WTIA". Absent where the archive names only a scheme.
        agency: z.enum(['itc']).optional()
      }).strict(),
```

- [ ] **Step 4: Add ITC to the agency map**

In `content/programs/agencies.ts`, add the entry and delete the paragraph explaining why there is no `gsp` entry — replace it with the corrected account:

```ts
  // Innovation and Technology Commission. Named as Tech to Connect 4.0's
  // "Funding Organisation" on that edition's own speaker line-up graphic, and
  // again in a 2025 workshop hashtag (「#創新科技署」). GSP, the only funding
  // token in 577 pages of prose, is the ITC's General Support Programme, so
  // the scheme and the body agree. There is still no `gsp` entry: GSP is a
  // scheme, not an agency, and tctProgramSchema keeps the two apart.
  itc: {
    nameEn: 'Innovation and Technology Commission',
    nameZh: '創新科技署'
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/program-schema.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add content/schemas.ts content/programs/agencies.ts tests/unit/program-schema.test.ts
git commit -m "feat: let a TCT edition name the body behind its funding scheme"
```

---

## Task 4: Apply the findings to the records

**Files:**
- Modify: `content/programs/tct.ts`
- Modify: `content/programs/{asa,hkict,cpai}.ts` as the findings require
- Modify: `tests/unit/program-content.test.ts`

- [ ] **Step 1: Record ITC on the 2023 TCT edition**

In `content/programs/tct.ts`, on the `year: 2023` edition's funder:

```ts
      funder: {
        kind: 'named',
        schemeEn: 'GSP',
        schemeZh: 'GSP',
        // TTC_9.jpg, this edition's own speaker line-up graphic: "Funding
        // Organisation 創新科技署 Innovation and Technology Commission", beside
        // "Organiser WTIA". The prose names only the scheme.
        agency: 'itc'
      },
```

- [ ] **Step 2: Rewrite the docblock section that says this cannot be held**

The file's docblock carries a section headed `ONE FINDING THIS RECORD CANNOT HOLD, AND IT IS THE IMPORTANT ONE`. It can now hold it. Replace that section with a shorter one recording that the fact came from an image, and keep the general lesson — it is the most useful sentence in the file:

```
 * The 2023 funder's `agency` came from an image, not from prose: this
 * edition's speaker line-up graphic prints "Funding Organisation 創新科技署
 * Innovation and Technology Commission". Every other value in this file was
 * read from page text, and WTIA puts funder attributions, sponsor logos and
 * speaker rosters in graphics -- a text-only sweep of this archive is not a
 * complete sweep of it. content/program-image-findings.json records what the
 * image pass found, image by image.
```

- [ ] **Step 3: Apply every other finding whose `agreesWithRecord` is false**

Work through `content/program-image-findings.json`. For each, either correct the record — citing the image filename in the comment, exactly as text-sourced values cite their page — or, where the schema has no field for it, add the fact to the record's docblock and to Task 5's claims-review pass.

**Where an image contradicts a page rather than filling a gap, record both and change nothing.** The archive contradicting itself is a fact about the archive, and this project's convention is to state it and ask WTIA. `content/programs/asa.ts` already does this for the 2025 regions figure; follow that shape.

- [ ] **Step 4: Add the test**

In `tests/unit/program-content.test.ts`, inside `describe("TCT record")`:

```ts
  // The one fact in these four records sourced from an image rather than prose.
  it("names ITC behind the 2023 funding scheme", () => {
    const edition = tct.editions.find(({year}) => year === 2023);
    expect(edition?.funder.kind).toBe("named");
    expect(edition?.funder.kind === "named" && edition.funder.agency).toBe("itc");
  });
```

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/unit/program-content.test.ts && npm run typecheck && npx eslint content/ tests/
git add content/programs tests/unit/program-content.test.ts
git commit -m "fix: apply the image-sourced findings to the programme records"
```

---

## Task 5: Correct the claims review

`docs/wtia-programme-claims-review.md` goes to WTIA and asks them to correct thirteen claims. It has already been corrected twice during this migration — once on the "150+ companies" figure and once on the Huawei/Microsoft/HKPC speakers — both times because a survey had missed a page. A third correction is owed if the image pass found anything the document asserts is absent.

**Files:**
- Modify: `docs/wtia-programme-claims-review.md`

- [ ] **Step 1: Re-read the document against the findings**

For each `agreesWithRecord: false` finding, check whether the review makes a claim about it. The two known cases:

- The review asks WTIA for the 2024–26 TCT funder. TTC_9.jpg answers it for 2023 and narrows the question.
- The review says the AI Leaders' Summit "names none of them" of its speakers. That is true of the *AI* Leaders' Summit (2024/2025) and false of the *4.0* Leaders Summit (2023), whose line-up graphic names thirteen with their companies. Distinguish the two events by name and date, and say which claim survives.

- [ ] **Step 2: Write the corrections in the document's established shape**

Each correction states what the archive says, where, and what it means for the question being asked — and, where an earlier draft was wrong, says so in a parenthetical. Two such parentheticals already exist; match them.

- [ ] **Step 3: Commit**

```bash
git add docs/wtia-programme-claims-review.md
git commit -m "docs: correct the claims review against the image evidence"
```

---

## Task 6: Verification and changelog

- [ ] **Step 1: Run everything**

```bash
npm test && npm run lint && npm run typecheck && npm run audit:strings && npm run build
```

Expected: all green.

- [ ] **Step 2: Check the invariants**

- `grep -rn "images/programs" content/programs/` — every `src` own-origin, no `http`.
- Every `agency:` value in `content/programs/` is a key of `AGENCIES` in `content/programs/agencies.ts`.
- Every image cited in a record comment exists in `content/program-image-findings.json`.

- [ ] **Step 3: Update AGENTS.md**

Add a changelog entry. The line that matters for whoever reads it next is not that ITC was added — it is that the archive keeps facts in images, so a text sweep of it is incomplete by construction.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record the image-evidence pass in the changelog"
```

---

## Out of scope

- **OCR, or any machine text extraction from images.** The set is 180 files; a person or an agent can look at forty of them. A dependency added here would have to be maintained for one pass.
- **Re-verifying text-sourced values.** Those were independently checked against the archive during the records migration, with zero fabrications found across ASA's ten editions and HKICT's thirteen winners.
- **The other 176 images' alt text.** Four images are attached to records; the rest stay preserved and unreferenced, which the records plan explicitly allows. If the review finds an image worth showing, attaching it is in scope — writing alt text for all 180 is not.
- **The 2026 HKICT and TCT editions.** Both are described on the home page and neither names a counterparty; they wait on WTIA, not on this plan.

## Self-review notes

Checked against the finding that prompted this plan:

- **Facts in images, not prose** → Tasks 1 and 2 find them, Task 4 applies them, Task 5 tells WTIA.
- **TCT's funding body specifically** → Task 3 (schema), Task 4 Step 1 (value), Task 4 Step 4 (test).
- **The claims review's two known overstatements** → Task 5 Step 1 names both.
- **Not silently resolving contradictions** → Task 4 Step 3 states the rule and points at the existing precedent in `asa.ts`.

Type consistency: `ImageShape` is defined in `scripts/triage-program-images.ts` and used by its test. The findings JSON's shape is declared inline in `tests/unit/program-image-findings.test.ts` and nowhere else, deliberately — it is a review artefact, not a runtime type, and giving it a Zod schema would imply the pages read it.

The triage in Task 1 cannot catch an attribution printed on a backdrop inside an ordinary photograph — `ASA24_9.jpg` is exactly that, and its test asserts the triage returns `false` for it rather than pretending otherwise. Step 5 covers that class by hand, adding every image from an edition-defining page regardless of shape. If the review in Task 2 finds attributions in photographs that Step 5 did not pull in, the triage heuristic is wrong and should be widened before the remaining batches are read.
