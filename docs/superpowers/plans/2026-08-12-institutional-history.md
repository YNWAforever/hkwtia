# Institutional History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 25 years of WTIA's record off the site being switched off, and upgrade the 61 milestone redirects from a generic fallback to real destinations.

**Architecture:** Milestones become typed, Zod-validated content in the repository — following the `content/events.ts` pattern — because this work exists to rescue content from a system being turned off, and a repository file is preserved and diffable where a database row is not. A one-off script drafts the content from the captured HTML; a human corrects it; the reviewed file is the artifact. Entries above ~150 words get their own page, the rest render in full on a single timeline.

**Tech Stack:** Next.js 16 App Router (Server Components), TypeScript strict, Zod, next-intl v4, Vitest, Tailwind v3.

---

## Context you need before starting

Read `docs/superpowers/specs/2026-08-12-institutional-history-design.md` first. Then know these facts:

- **The source is `.legacy-capture/`**, produced by `scripts/capture-legacy-site.ts` in sub-project 1. It holds 577 captured pages as raw HTML. It is git-ignored and lives inside a git worktree — Task 1 exists because of that.
- **Typed content in this repo is Zod-validated at module load.** See `content/events.ts` (`eventSchema.array().parse([])`) and `content/schemas.ts`. A malformed entry fails the build, not a request. Follow that pattern exactly.
- **`content/schemas.ts` already enforces own-origin images** with `z.string().startsWith('/')`. Milestone images use the same trick with a tighter prefix.
- **Locale prefixes are never hand-built.** `zh-HK` is served at `/zh`. Use `localizedPath` for every `<Link href>`. `tests/unit/locale-href-boundary.test.ts` fails the build otherwise.
- **Every visible string lives in both `messages/en.json` and `messages/zh-HK.json`.** `npm run audit:strings` rejects unapproved JSX literals. Milestone *content* is data, not UI copy — it lives in `content/milestones.ts`. Only the page furniture (headings, labels) goes in the bundles.
- **`config/public-routes.ts` is the allowlist** for sitemap entries and redirect destinations. `tests/unit/legacy-urls.test.ts:26` asserts every redirect destination is a member.

---

## File Structure

| File | Responsibility |
|---|---|
| `content/schemas.ts` | **Modify.** Add `milestoneSchema` + `MilestoneRecord`, mirroring `eventSchema`. |
| `content/milestones.ts` | **Create.** The 61 reviewed entries, parsed at module load. Pure data. |
| `lib/history/milestones.ts` | **Create.** Pure derivations — group by year, find by slug, list featured. No I/O. |
| `scripts/extract-milestones.ts` | **Create.** One-off draft generator from captured HTML. Committed for auditability. |
| `scripts/download-milestone-images.ts` | **Create.** One-off asset fetcher. The images exist nowhere else. |
| `public/images/history/` | **Create.** 87 files, ~8 MB. |
| `app/[locale]/(public)/about/history/page.tsx` | **Create.** The timeline. |
| `app/[locale]/(public)/about/history/[slug]/page.tsx` | **Create.** Featured detail pages. |
| `components/marketing/milestone-timeline.tsx` | **Create.** Presentational; takes data, renders rows. |
| `config/public-routes.ts` | **Modify.** Add `/about/history`. |
| `content/legacy-urls.json` | **Modify.** Repoint the 61 milestone entries. |
| `tests/unit/legacy-urls.test.ts` | **Modify.** Extend valid destinations to declared milestone slugs. |
| `messages/{en,zh-HK}.json` | **Modify.** Page furniture + About founding/mission keys. |

---

## Task 1: Preserve the capture before anything else

`.legacy-capture/` is the only copy of 577 pages of WTIA's history. It is git-ignored and sits inside a git worktree, so `git worktree remove` destroys it, and `hkwtia.org` cannot be re-scraped once it is switched off. Nothing else in this plan matters if it is lost.

**Files:** none in the repository — this is an operator action.

- [ ] **Step 1: Locate the capture**

```bash
find /Users/willylai/Documents/Claude/Projects/HKwtia -maxdepth 4 -type d -name ".legacy-capture" 2>/dev/null
du -sh "$(find /Users/willylai/Documents/Claude/Projects/HKwtia -maxdepth 4 -type d -name '.legacy-capture' | head -1)"
```

Expected: one path, roughly 50M.

- [ ] **Step 2: Copy it outside the worktree**

```bash
SRC=$(find /Users/willylai/Documents/Claude/Projects/HKwtia -maxdepth 4 -type d -name ".legacy-capture" | head -1)
DEST="$HOME/wtia-legacy-capture-$(date +%Y%m%d)"
cp -R "$SRC" "$DEST"
du -sh "$DEST"
ls "$DEST/pages" | wc -l
```

Expected: same size, 577 files.

- [ ] **Step 3: Verify the copy is complete, not just present**

```bash
node -e "
const inv=require('$DEST/inventory.json');
const fs=require('fs');
console.log('inventory says:', inv.capturedUrls.length, 'missed:', inv.missed.length);
console.log('html on disk:', fs.readdirSync('$DEST/pages').length);
"
```

Expected: `577`, `0`, `577`. If they disagree, stop — the copy is not sound.

- [ ] **Step 4: Record where it went**

Tell the user the path. Do not commit it; 50 MB of third-party HTML does not belong in the repository, and Task 5 extracts the parts that do.

---

## Task 2: The milestone schema

**Files:**
- Modify: `content/schemas.ts`
- Test: `tests/unit/milestone-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/milestone-schema.test.ts
import {describe, expect, it} from "vitest";

import {milestoneSchema} from "@/content/schemas";

const valid = {
  slug: "2001-establishment-of-wtia",
  year: 2001,
  month: "01",
  titleEn: "Establishment of WTIA",
  titleZh: "香港無線科技商會成立",
  bodyEn: "The association was founded in 2001.",
  bodyZh: "商會於二零零一年成立。",
  images: [{src: "/images/history/2001-inauguration.jpg", altEn: "Inauguration", altZh: "就職典禮"}],
  legacyPath: "/2001/01/2001-establishment-of-wtia/",
  featured: false,
};

describe("milestone schema", () => {
  it("accepts a complete entry", () => {
    expect(milestoneSchema.parse(valid).slug).toBe("2001-establishment-of-wtia");
  });

  // Both locales are required rather than optional. A milestone with an empty
  // Chinese body would render a blank page on /zh rather than failing the build.
  it.each(["titleEn", "titleZh", "bodyEn", "bodyZh"])("requires %s", (field) => {
    expect(() => milestoneSchema.parse({...valid, [field]: ""})).toThrow();
  });

  // The CSP is `img-src 'self' data:` and next.config.ts declares no remote
  // hosts, so a remote image would silently fail to render in the browser.
  it("rejects an image that is not own-origin under /images/history/", () => {
    for (const src of ["https://hkwtia.org/a.jpg", "/images/a.jpg", "images/history/a.jpg"]) {
      expect(() => milestoneSchema.parse({
        ...valid, images: [{src, altEn: "a", altZh: "a"}],
      }), src).toThrow();
    }
  });

  it("rejects a legacy path that is not a WordPress dated post", () => {
    for (const legacyPath of ["/about", "/2001/establishment/", "2001/01/x/"]) {
      expect(() => milestoneSchema.parse({...valid, legacyPath}), legacyPath).toThrow();
    }
  });

  it("rejects a month outside 01-12", () => {
    for (const month of ["00", "13", "1", "aa"]) {
      expect(() => milestoneSchema.parse({...valid, month}), month).toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/unit/milestone-schema.test.ts`
Expected: FAIL — `milestoneSchema` is not exported from `@/content/schemas`.

- [ ] **Step 3: Add the schema**

Append to `content/schemas.ts`, after `programSchema`:

```ts
const milestoneImageSchema = z.object({
  // Own-origin under a dedicated prefix. The CSP is `img-src 'self' data:` and
  // next.config.ts declares no remotePatterns, so a remote src renders nothing.
  src: z.string().regex(/^\/images\/history\/[A-Za-z0-9._-]+$/),
  altEn: z.string().min(1),
  altZh: z.string().min(1)
});

export const milestoneSchema = z.object({
  slug,
  year: z.number().int().min(2001).max(2100),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/),
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  bodyEn: z.string().min(1),
  bodyZh: z.string().min(1),
  images: z.array(milestoneImageSchema),
  // The source URL. Task 9 maps these to redirect destinations, so the shape is
  // pinned rather than free text.
  legacyPath: z.string().regex(/^\/\d{4}\/\d{2}\/[a-z0-9-]+\/$/),
  // Frozen at extraction from the word-count threshold, never recomputed at
  // render time — otherwise a copy edit could move an entry between layouts and
  // change its URL.
  featured: z.boolean()
});

export type MilestoneRecord = z.infer<typeof milestoneSchema>;
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run tests/unit/milestone-schema.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add content/schemas.ts tests/unit/milestone-schema.test.ts
git commit -m "feat: add the milestone content schema"
```

---

## Task 3: Derivations

Pure functions over the milestone list. Separated from the content file so the data stays data, and from the pages so both routes and the redirect test share one implementation.

**Files:**
- Create: `lib/history/milestones.ts`
- Test: `tests/unit/history-milestones.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/history-milestones.test.ts
import {describe, expect, it} from "vitest";

import type {MilestoneRecord} from "@/content/schemas";
import {byYearDescending, featuredOnly, findBySlug} from "@/lib/history/milestones";

function milestone(overrides: Partial<MilestoneRecord>): MilestoneRecord {
  return {
    slug: "x", year: 2010, month: "01",
    titleEn: "t", titleZh: "t", bodyEn: "b", bodyZh: "b",
    images: [], legacyPath: "/2010/01/x/", featured: false,
    ...overrides,
  } as MilestoneRecord;
}

describe("milestone derivations", () => {
  it("groups by year, newest first, and omits years with no entries", () => {
    const groups = byYearDescending([
      milestone({slug: "a", year: 2003}),
      milestone({slug: "b", year: 2016}),
      milestone({slug: "c", year: 2003}),
    ]);

    // 2004-2015 have no entries and must not appear as empty rows.
    expect(groups.map(({year}) => year)).toEqual([2016, 2003]);
    expect(groups[1]?.milestones.map(({slug}) => slug)).toEqual(["a", "c"]);
  });

  it("returns only featured entries", () => {
    const list = [milestone({slug: "a", featured: true}), milestone({slug: "b"})];
    expect(featuredOnly(list).map(({slug}) => slug)).toEqual(["a"]);
  });

  it("finds by slug and returns null for an unknown one", () => {
    const list = [milestone({slug: "a"})];
    expect(findBySlug(list, "a")?.slug).toBe("a");
    expect(findBySlug(list, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/unit/history-milestones.test.ts`
Expected: FAIL — cannot resolve `@/lib/history/milestones`.

- [ ] **Step 3: Implement**

```ts
// lib/history/milestones.ts
import type {MilestoneRecord} from "@/content/schemas";

export type MilestoneYear = Readonly<{
  year: number;
  milestones: readonly MilestoneRecord[];
}>;

/**
 * Groups newest year first. Years with no entries are absent rather than empty:
 * eight of the twenty-five have no surviving post, and rendering them as blank
 * rows advertises the gap instead of the record.
 */
export function byYearDescending(
  milestones: readonly MilestoneRecord[],
): readonly MilestoneYear[] {
  const groups = new Map<number, MilestoneRecord[]>();
  for (const milestone of milestones) {
    const existing = groups.get(milestone.year);
    if (existing) existing.push(milestone);
    else groups.set(milestone.year, [milestone]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => ({year, milestones: entries}));
}

export function featuredOnly(
  milestones: readonly MilestoneRecord[],
): readonly MilestoneRecord[] {
  return milestones.filter(({featured}) => featured);
}

export function findBySlug(
  milestones: readonly MilestoneRecord[],
  slug: string,
): MilestoneRecord | null {
  return milestones.find((milestone) => milestone.slug === slug) ?? null;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run tests/unit/history-milestones.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/history/milestones.ts tests/unit/history-milestones.test.ts
git commit -m "feat: add milestone derivations"
```

---

## Task 4: The extraction script

Produces a **draft** for a human to correct. It is committed so the extraction is auditable rather than a one-time act nobody can reproduce.

**Files:**
- Create: `scripts/extract-milestones.ts`
- Test: `tests/unit/extract-milestones.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/extract-milestones.test.ts
import {describe, expect, it} from "vitest";

import {
  FEATURED_WORD_THRESHOLD,
  parseMilestoneHtml,
  slugFromLegacyPath,
} from "@/scripts/extract-milestones";

const html = `<html><head><title>2003 - The 1st WTIA Awards | WTIA - Hong Kong Wireless Technology Industry Association</title></head>
<body><article>
<p>The first WTIA Awards recognised J2ME Open entries.</p>
<img src="https://hkwtia.org/wp-content/uploads/awards.jpg" alt="Award ceremony" />
<p>&nbsp;</p>
<p>It drew entries from across the region.</p>
</article></body></html>`;

describe("milestone extraction", () => {
  it("derives slug, year and month from the legacy path", () => {
    expect(slugFromLegacyPath("/2003/01/2003-the-1st-wtia-awards/"))
      .toEqual({slug: "2003-the-1st-wtia-awards", year: 2003, month: "01"});
  });

  it("strips the site suffix from the title", () => {
    expect(parseMilestoneHtml(html, "/2003/01/x/").titleEn)
      .toBe("2003 - The 1st WTIA Awards");
  });

  it("joins paragraphs and drops whitespace-only ones", () => {
    const {bodyEn} = parseMilestoneHtml(html, "/2003/01/x/");
    expect(bodyEn).toBe(
      "The first WTIA Awards recognised J2ME Open entries.\n\nIt drew entries from across the region.",
    );
    expect(bodyEn).not.toContain(" ");
  });

  // Images are rewritten to the own-origin path Task 6 will populate. Leaving
  // the hkwtia.org URL would produce content that renders nothing under the CSP
  // and breaks entirely when the site is switched off.
  it("rewrites image sources to the local history directory", () => {
    expect(parseMilestoneHtml(html, "/2003/01/x/").images).toEqual([
      {src: "/images/history/awards.jpg", altEn: "Award ceremony", altZh: ""},
    ]);
  });

  it("marks an entry featured only above the word threshold", () => {
    const long = html.replace(
      "It drew entries from across the region.",
      "word ".repeat(FEATURED_WORD_THRESHOLD),
    );
    expect(parseMilestoneHtml(html, "/2003/01/x/").featured).toBe(false);
    expect(parseMilestoneHtml(long, "/2003/01/x/").featured).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/unit/extract-milestones.test.ts`
Expected: FAIL — cannot resolve `@/scripts/extract-milestones`.

- [ ] **Step 3: Implement**

```ts
// scripts/extract-milestones.ts
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

function decode(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
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

  const region = /<article[\s\S]*?<\/article>/.exec(html)?.[0]
    ?? /<main[\s\S]*?<\/main>/.exec(html)?.[0]
    ?? html;

  const bodyEn = [...region.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(([, inner]) => decode(inner))
    .filter((text) => text.length > 0)
    .join("\n\n");

  const images = [...region.matchAll(/<img[^>]*>/g)].flatMap((match) => {
    const tag = match[0];
    const src = /src="([^"]+)"/.exec(tag)?.[1] ?? "";
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

function main(): void {
  const captureDir = process.argv[2];
  if (!captureDir) throw new Error("USAGE: extract-milestones <capture-dir>");

  const inventory = JSON.parse(
    readFileSync(join(captureDir, "inventory.json"), "utf8"),
  ) as {capturedUrls: string[]};

  const milestonePaths = inventory.capturedUrls
    .map((url) => new URL(url).pathname)
    .filter((path) => /^\/\d{4}\/\d{2}\//.test(path))
    .sort();

  const files = readdirSync(join(captureDir, "pages"));
  const parsed: ParsedMilestone[] = [];
  const missed: string[] = [];

  for (const legacyPath of milestonePaths) {
    const slugPart = legacyPath.replace(/\//g, "-").replace(/^-|-$/g, "");
    const file = files.find((name) => name.includes(slugPart));
    if (!file) {
      missed.push(legacyPath);
      continue;
    }
    parsed.push(parseMilestoneHtml(
      readFileSync(join(captureDir, "pages", file), "utf8"),
      legacyPath,
    ));
  }

  writeFileSync(
    "content/milestones.draft.json",
    `${JSON.stringify({milestones: parsed, missed}, null, 2)}\n`,
  );
  console.log(`drafted ${parsed.length}, missed ${missed.length}`);
  console.log(`featured: ${parsed.filter(({featured}) => featured).length}`);
}

if (process.argv[1]?.endsWith("extract-milestones.ts")) {
  main();
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/extract-milestones.test.ts && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Run the extraction for real**

```bash
npx tsx scripts/extract-milestones.ts "$HOME/wtia-legacy-capture-<date>"
```

Expected: `drafted 61, missed 0`. **If `missed` is non-zero, stop and report which paths** — a milestone with no matching capture file cannot be migrated and needs a decision.

- [ ] **Step 6: Commit the script only**

The draft JSON is an intermediate artifact; Task 5 turns it into the real file.

```bash
echo "content/milestones.draft.json" >> .gitignore
git add scripts/extract-milestones.ts tests/unit/extract-milestones.test.ts .gitignore
git commit -m "feat: draft milestone content from the captured archive"
```

---

## Task 5: Review the draft and commit the real content

This is the task where a human reads. It cannot be automated, and pretending otherwise would ship 7,258 words of unreviewed machine output as WTIA's official history.

**Files:**
- Create: `content/milestones.ts`

- [ ] **Step 1: Generate the file from the draft**

```bash
node -e "
const {milestones}=require('./content/milestones.draft.json');
const body='import {milestoneSchema, type MilestoneRecord} from \'@/content/schemas\';\n\n'
 + 'export const milestones: MilestoneRecord[] = milestoneSchema.array().parse(\n'
 + JSON.stringify(milestones, null, 2) + '\n);\n';
require('fs').writeFileSync('content/milestones.ts', body);
console.log('wrote', milestones.length, 'entries');
"
```

- [ ] **Step 2: Review every entry against its source**

For each of the 61, open the captured HTML and check:

- `titleEn` reads as a title, not a truncated page title
- `bodyEn` is the article, not navigation or footer text that leaked past the region match
- paragraph breaks land where the original had them
- `images[].altEn` is real alt text, not a filename
- `featured` matches whether the entry is substantial enough to deserve its own page

Fix in `content/milestones.ts` directly. The generated file is a starting point, not an answer.

- [ ] **Step 3: Verify it parses**

Run: `npm run typecheck`
Expected: clean. A schema violation fails here, because `milestoneSchema.array().parse(...)` runs at module load.

Note `titleZh` and `bodyZh` are still empty at this point and the schema requires `.min(1)` — so **this step is expected to fail until Task 7**. Either complete Task 7 before running typecheck, or temporarily place the English text in the Chinese fields and let Task 7 replace it. Prefer the former; the latter risks shipping if Task 7 slips.

- [ ] **Step 4: Commit**

```bash
git add content/milestones.ts
git commit -m "feat: add the reviewed 2001-2025 milestone record"
```

---

## Task 6: Download the images

The capture saved HTML only. These 87 files exist nowhere but the live site.

**Files:**
- Create: `scripts/download-milestone-images.ts`
- Create: `public/images/history/` (87 files)

- [ ] **Step 1: Implement the downloader**

```ts
// scripts/download-milestone-images.ts
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

/**
 * Fetches the milestone images from hkwtia.org into public/images/history/.
 *
 * The site capture saved page HTML and no assets, so these files exist only on
 * the origin that is about to be switched off. Own-origin hosting is also what
 * the CSP requires: `img-src 'self' data:` with no remotePatterns declared.
 */
const OUTPUT_DIR = "public/images/history";

export async function downloadAll(
  sources: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{saved: string[]; missed: string[]}> {
  await mkdir(OUTPUT_DIR, {recursive: true});
  const saved: string[] = [];
  const missed: string[] = [];
  for (const url of sources) {
    const file = url.split("/").pop() ?? "";
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(String(response.status));
      await writeFile(
        join(OUTPUT_DIR, file),
        Buffer.from(await response.arrayBuffer()),
      );
      saved.push(file);
    } catch {
      missed.push(url);
    }
  }
  return {saved, missed};
}

if (process.argv[1]?.endsWith("download-milestone-images.ts")) {
  const urls = process.argv.slice(2);
  downloadAll(urls).then(({saved, missed}) => {
    console.log(`saved ${saved.length}, missed ${missed.length}`);
    for (const url of missed) console.error(`MISSED ${url}`);
    if (missed.length > 0) process.exitCode = 1;
  });
}
```

- [ ] **Step 2: Collect the source URLs and run it**

```bash
node -e "
const {milestones}=require('./content/milestones.draft.json');
const files=[...new Set(milestones.flatMap(m=>m.images.map(i=>i.src.split('/').pop())))];
console.log(files.length);
" 
# Then, from the captured HTML, recover the original absolute URLs:
node -e "
const fs=require('fs'),path='$HOME/wtia-legacy-capture-<date>/pages';
const urls=new Set();
for (const f of fs.readdirSync(path)) {
  if (!/-\d{4}-\d{2}-/.test(f)) continue;
  const s=fs.readFileSync(path+'/'+f,'utf8');
  const region=(s.match(/<article[\s\S]*?<\/article>/)||[''])[0];
  for (const m of region.matchAll(/<img[^>]+src=\"(https?:[^\"]+)\"/g)) {
    if (!/logo/i.test(m[1])) urls.add(m[1]);
  }
}
fs.writeFileSync('/tmp/milestone-images.txt',[...urls].join('\n'));
console.log('unique image urls:', urls.size);
"
npx tsx scripts/download-milestone-images.ts $(cat /tmp/milestone-images.txt | tr '\n' ' ')
```

Expected: `saved 87, missed 0`. **A non-zero `missed` count is a stop condition** — hkwtia.org 520s intermittently, so retry; if a file is permanently gone, remove its reference from `content/milestones.ts` rather than shipping a broken image.

- [ ] **Step 3: Verify every referenced image exists on disk**

```bash
node -e "
const {milestones}=require('./content/milestones.draft.json');
const fs=require('fs');
const missing=milestones.flatMap(m=>m.images.map(i=>i.src)).filter(s=>!fs.existsSync('public'+s));
console.log('referenced but absent:', [...new Set(missing)]);
"
```

Expected: `[]`.

- [ ] **Step 4: Commit**

```bash
git add scripts/download-milestone-images.ts public/images/history
git commit -m "feat: rehost the milestone images on our own origin"
```

---

## Task 7: Draft the missing locale

47 of 61 entries are English-only; 3 are Chinese-only. WTIA reviews a proper-noun list, not the prose.

**Files:**
- Modify: `content/milestones.ts`
- Create: `docs/wtia-translation-review.md`

- [ ] **Step 1: Fill every empty `titleZh` / `bodyZh` (and the English side of the three Chinese-only entries)**

Translate the content in `content/milestones.ts` directly. Keep proper nouns in their established forms — `Wi-Fi.HK`, `HKICT`, `Cyberport`, `香港無線科技商會` — rather than translating them literally.

- [ ] **Step 2: Emit the review list**

```bash
node -e "
const {milestones}=require('./content/milestones.draft.json');
const names=new Set();
for (const m of milestones) {
  for (const n of (m.titleEn+' '+m.bodyEn).match(/\b[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*\b/g)||[]) {
    if (n.length>3 && !/^(The|And|For|With|This|That|WTIA)$/.test(n)) names.add(n);
  }
}
console.log([...names].sort().join('\n'));
" > /tmp/proper-nouns.txt
wc -l /tmp/proper-nouns.txt
```

Write `docs/wtia-translation-review.md` containing that list with the Chinese rendering used for each, and a one-line instruction: confirm or correct each row. That file is what WTIA receives.

- [ ] **Step 3: Verify the content now parses**

Run: `npm run typecheck && npm run lint`
Expected: clean. Every `.min(1)` field is now populated.

- [ ] **Step 4: Commit**

```bash
git add content/milestones.ts docs/wtia-translation-review.md
git commit -m "feat: draft the missing locale for the milestone record"
```

---

## Task 8: The timeline route

**Files:**
- Create: `components/marketing/milestone-timeline.tsx`
- Create: `app/[locale]/(public)/about/history/page.tsx`
- Modify: `config/public-routes.ts`, `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/history-page.test.tsx`

- [ ] **Step 1: Add the page furniture strings**

In both bundles, add a `History` namespace with identical keys:

```json
"History": {
  "metaTitle": "History | WTIA",
  "metaDescription": "Twenty-five years of the Hong Kong Wireless Technology Industry Association, 2001 to 2025.",
  "eyebrow": "Since 2001",
  "title": "Our history",
  "intro": "Milestones from twenty-five years of building Hong Kong's wireless and technology industry.",
  "readMore": "Read more"
}
```

Use the Traditional Chinese equivalents in `messages/zh-HK.json`. Keys must match exactly — `npm run audit:strings` and the parity test both check.

- [ ] **Step 2: Add the route to the allowlist**

In `config/public-routes.ts`, add `'/about/history'` after `'/about/committees'`.

- [ ] **Step 3: Write the failing test**

```tsx
// tests/unit/history-page.test.tsx
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import type {MilestoneRecord} from "@/content/schemas";

function milestone(overrides: Partial<MilestoneRecord>): MilestoneRecord {
  return {
    slug: "x", year: 2010, month: "01",
    titleEn: "Title EN", titleZh: "標題", bodyEn: "Body EN", bodyZh: "正文",
    images: [], legacyPath: "/2010/01/x/", featured: false,
    ...overrides,
  } as MilestoneRecord;
}

describe("milestone timeline", () => {
  it("renders the requested locale only", () => {
    const html = renderToStaticMarkup(
      <MilestoneTimeline locale="zh-HK" readMoreLabel="更多" milestones={[milestone({})]} />,
    );
    expect(html).toContain("標題");
    expect(html).not.toContain("Title EN");
  });

  it("renders a short entry's body inline and links a featured one out", () => {
    const html = renderToStaticMarkup(
      <MilestoneTimeline locale="en" readMoreLabel="Read more" milestones={[
        milestone({slug: "short", bodyEn: "Two sentences only."}),
        milestone({slug: "long", featured: true, titleEn: "Long one"}),
      ]} />,
    );
    expect(html).toContain("Two sentences only.");
    expect(html).toContain("/about/history/long");
    expect(html).not.toContain("/about/history/short");
  });

  it("groups by year without emitting empty years", () => {
    const html = renderToStaticMarkup(
      <MilestoneTimeline locale="en" readMoreLabel="Read more" milestones={[
        milestone({slug: "a", year: 2003}), milestone({slug: "b", year: 2016}),
      ]} />,
    );
    expect(html).toContain("2016");
    expect(html).toContain("2003");
    expect(html).not.toContain("2004");
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `npx vitest run tests/unit/history-page.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 5: Implement the component**

```tsx
// components/marketing/milestone-timeline.tsx
import {Link} from "@/i18n/navigation";
import type {MilestoneRecord} from "@/content/schemas";
import type {AppLocale} from "@/i18n/routing";
import {byYearDescending} from "@/lib/history/milestones";

export function MilestoneTimeline({milestones, locale, readMoreLabel}: {
  milestones: readonly MilestoneRecord[];
  locale: AppLocale;
  readMoreLabel: string;
}) {
  const groups = byYearDescending(milestones);
  return (
    <div className="space-y-16">
      {groups.map(({year, milestones: entries}) => (
        <section key={year}>
          <h2 className="text-3xl font-semibold text-primary">{year}</h2>
          <ul className="mt-6 space-y-8">
            {entries.map((entry) => {
              const title = locale === "zh-HK" ? entry.titleZh : entry.titleEn;
              const body = locale === "zh-HK" ? entry.bodyZh : entry.bodyEn;
              return (
                <li className="border-l-2 border-border pl-6" key={entry.slug}>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  {/* A featured entry has its own page, so the timeline shows a
                      link rather than duplicating a long body in two places. */}
                  {entry.featured ? (
                    <Link
                      className="mt-2 inline-block font-semibold text-primary"
                      href={`/about/history/${entry.slug}`}
                    >
                      {readMoreLabel}
                    </Link>
                  ) : (
                    <div className="mt-2 space-y-3 text-muted-foreground">
                      {body.split("\n\n").map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

`Link` comes from `@/i18n/navigation`, which applies the locale prefix. Never write `` `/${locale}/about/history/...` `` — `zh-HK` is served at `/zh` and the hand-built form is unroutable.

- [ ] **Step 6: Implement the page**

```tsx
// app/[locale]/(public)/about/history/page.tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MilestoneTimeline} from "@/components/marketing/milestone-timeline";
import {PageHero} from "@/components/marketing/page-hero";
import {milestones} from "@/content/milestones";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "History"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/history",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function HistoryPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("History");
  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      <section className="container mx-auto px-6 py-16">
        <MilestoneTimeline
          locale={locale as AppLocale}
          milestones={milestones}
          readMoreLabel={t("readMore")}
        />
      </section>
    </>
  );
}
```

No `export const dynamic` — this reads typed content, not a database, so static prerendering is correct here and cannot go stale the way `app/sitemap.ts` did.

- [ ] **Step 7: Verify**

Run: `npx vitest run tests/unit/history-page.test.tsx && npm run typecheck && npm run lint && npm run audit:strings && npm run build`
Expected: all clean; the build lists `/[locale]/about/history`.

- [ ] **Step 8: Commit**

```bash
git add components/marketing/milestone-timeline.tsx "app/[locale]/(public)/about/history/page.tsx" \
  config/public-routes.ts messages/en.json messages/zh-HK.json tests/unit/history-page.test.tsx
git commit -m "feat: add the 2001-2025 history timeline"
```

---

## Task 9: Featured detail pages

**Files:**
- Create: `app/[locale]/(public)/about/history/[slug]/page.tsx`
- Test: `tests/unit/history-detail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/history-detail.test.ts
import {describe, expect, it} from "vitest";

import {milestones} from "@/content/milestones";
import {featuredOnly, findBySlug} from "@/lib/history/milestones";
import {generateStaticParams} from "@/app/[locale]/(public)/about/history/[slug]/page";

describe("history detail pages", () => {
  it("generates a param for every featured milestone and no others", async () => {
    const params = await generateStaticParams();
    const featuredSlugs = featuredOnly(milestones).map(({slug}) => slug).sort();

    expect(params.map(({slug}) => slug).sort()).toEqual(featuredSlugs);
  });

  it("every generated slug resolves to a milestone", async () => {
    for (const {slug} of await generateStaticParams()) {
      expect(findBySlug(milestones, slug), slug).not.toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run tests/unit/history-detail.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

```tsx
// app/[locale]/(public)/about/history/[slug]/page.tsx
import type {Metadata} from "next";
import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {milestones} from "@/content/milestones";
import type {AppLocale} from "@/i18n/routing";
import {featuredOnly, findBySlug} from "@/lib/history/milestones";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string; slug: string}>};

export function generateStaticParams(): {slug: string}[] {
  // Only featured entries have pages. A short entry lives on the timeline, and
  // generating a two-sentence page for it is the thin content this design
  // deliberately avoids.
  return featuredOnly(milestones).map(({slug}) => ({slug}));
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const milestone = findBySlug(milestones, slug);
  if (!milestone) return {};
  const appLocale = locale as AppLocale;
  return buildPageMetadata({
    locale: appLocale,
    pathname: `/about/history/${slug}`,
    title: appLocale === "zh-HK" ? milestone.titleZh : milestone.titleEn,
    description: (appLocale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn).slice(0, 160),
  });
}

export default async function MilestonePage({params}: Props) {
  const {locale, slug} = await params;
  setRequestLocale(locale);
  const milestone = findBySlug(milestones, slug);
  if (!milestone || !milestone.featured) notFound();

  const appLocale = locale as AppLocale;
  const title = appLocale === "zh-HK" ? milestone.titleZh : milestone.titleEn;
  const body = appLocale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;

  return (
    <article className="container mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        {milestone.year}
      </p>
      <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
      <div className="mt-8 space-y-4 text-muted-foreground">
        {body.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      {milestone.images.map((image) => (
        <img
          alt={appLocale === "zh-HK" ? image.altZh : image.altEn}
          className="mt-8 w-full rounded-lg"
          key={image.src}
          src={image.src}
        />
      ))}
    </article>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/history-detail.test.ts && npm run typecheck && npm run lint && npm run build`
Expected: PASS; the build lists `/[locale]/about/history/[slug]` with the featured count prerendered.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(public)/about/history/[slug]/page.tsx" tests/unit/history-detail.test.ts
git commit -m "feat: add pages for the substantial milestones"
```

---

## Task 10: Upgrade the 61 redirects

**Files:**
- Modify: `content/legacy-urls.json`, `tests/unit/legacy-urls.test.ts`

- [ ] **Step 1: Extend the destination allowlist in the test**

`tests/unit/legacy-urls.test.ts` currently asserts every destination is in `publicRoutes`. Replace the allowlist construction and the membership assertion:

```ts
import {milestones} from "@/content/milestones";

const allowed = new Set<string>(publicRoutes);
// Milestone detail pages are typed content, so their slugs are known at build
// time. They are valid destinations even though they are not static routes —
// the guarantee this test provides, that no redirect points at a page which does
// not exist, is preserved by checking them against the milestone record.
const milestonePaths = new Set(
  milestones.filter(({featured}) => featured).map(({slug}) => `/about/history/${slug}`),
);

// ...inside the existing "never points at a route outside the public allowlist" test:
expect(
  allowed.has(entry.to) || milestonePaths.has(entry.to),
  `${entry.from} -> ${entry.to}`,
).toBe(true);
```

- [ ] **Step 2: Repoint the entries**

```bash
node -e "
const fs=require('fs');
const f=JSON.parse(fs.readFileSync('content/legacy-urls.json','utf8'));
const {milestones}=require('./content/milestones.draft.json');
const byPath=new Map(milestones.map(m=>[m.legacyPath,m]));
let featured=0, timeline=0;
for (const e of f.entries) {
  const m=byPath.get(e.from);
  if (!m) continue;
  if (m.featured) { e.to='/about/history/'+m.slug; e.kind='equivalent'; featured++; }
  else { e.to='/about/history'; e.kind='section-fallback'; timeline++; }
}
fs.writeFileSync('content/legacy-urls.json', JSON.stringify(f,null,2)+'\n');
console.log('featured:',featured,'timeline:',timeline,'total:',featured+timeline);
"
```

Expected: total 61. **If it is lower, a `legacyPath` in the milestone record does not match a `from` in the redirect fixture** — reconcile before continuing, because the difference is milestones whose redirects were not upgraded.

- [ ] **Step 3: Verify**

Run: `npx vitest run tests/unit/legacy-urls.test.ts tests/unit/redirects.test.ts && npm run build`
Expected: PASS. `redirects.test.ts` checks that every fixture URL resolves through a rule or is a real route; the new destinations must survive that too.

- [ ] **Step 4: Commit**

```bash
git add content/legacy-urls.json tests/unit/legacy-urls.test.ts
git commit -m "feat: point the milestone redirects at their real destinations"
```

---

## Task 11: Founding year and mission on /about

**Files:**
- Modify: `messages/en.json`, `messages/zh-HK.json`, `app/[locale]/(public)/about/page.tsx`
- Test: `tests/unit/about-page.test.ts`

- [ ] **Step 1: Add the keys to both bundles**

Inside the existing `About` namespace:

```json
"foundedTitle": "Established 2001",
"foundedBody": "WTIA is a not-for-profit trade association founded in 2001 for Hong Kong's wireless, mobile and emerging technology community.",
"missionTitle": "Our mission",
"missionBody": "To advance wireless, mobile and emerging technologies, accelerate their real-world adoption, and help shape Hong Kong into a top-class innovation and technology hub.",
"historyLink": "Read our history"
```

Traditional Chinese equivalents in `messages/zh-HK.json`, same keys.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/about-page.test.ts
import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("about page copy", () => {
  it.each(["foundedTitle", "foundedBody", "missionTitle", "missionBody", "historyLink"])(
    "declares %s in both bundles",
    (key) => {
      expect(Object.keys(en.About)).toContain(key);
      expect(Object.keys(zh.About)).toContain(key);
    },
  );

  // The audit's headline finding was that the new About page never said when
  // WTIA was founded.
  it("states the founding year in both locales", () => {
    expect(en.About.foundedBody).toContain("2001");
    expect(zh.About.foundedBody).toContain("2001");
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run tests/unit/about-page.test.ts`
Expected: FAIL — the keys do not exist.

- [ ] **Step 4: Render them**

In `app/[locale]/(public)/about/page.tsx`, add a `Section` after the existing history grid:

```tsx
<Section heading={t('foundedTitle')} intro={t('foundedBody')}>
  <h3 className="text-xl font-semibold">{t('missionTitle')}</h3>
  <p className="mt-3 text-muted-foreground">{t('missionBody')}</p>
  <Link className="mt-6 inline-block font-semibold text-primary" href="/about/history">
    {t('historyLink')}
  </Link>
</Section>
```

Import `Link` from `@/i18n/navigation`, not `next/link`.

- [ ] **Step 5: Full gate**

Run: `npm run typecheck && npm run lint && npm run audit:strings && npm test && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/zh-HK.json "app/[locale]/(public)/about/page.tsx" tests/unit/about-page.test.ts
git commit -m "feat: state the founding year and mission on /about"
```

---

## Self-review notes

- **Spec coverage.** Extraction → Tasks 4–5. Data shape → Task 2. Routes → Tasks 8–9. Images → Task 6. Translation → Task 7. Redirect upgrade → Task 10. About page → Task 11. The durability risk the spec names as a prerequisite → Task 1, ordered first.
- **Known ordering hazard, stated in place.** `content/milestones.ts` cannot typecheck between Task 5 and Task 7, because the schema requires both locales and the extractor deliberately leaves the Chinese fields empty. Task 5 Step 3 says so and recommends completing Task 7 before running the gate rather than stubbing the fields.
- **Two tasks depend on `content/milestones.draft.json`**, which Task 4 git-ignores. Tasks 6 and 10 read it. Do not delete it until Task 10 is committed.
- **Not covered, deliberately.** Leadership is sub-project 2b — the spec records the unresolved ExCo term contradiction there rather than guessing.
