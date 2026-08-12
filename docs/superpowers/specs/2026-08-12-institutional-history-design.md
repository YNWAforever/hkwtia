# Institutional History Design

Migration sub-project 2a of 4. See `docs/wtia-content-migration-audit.md` for the
audit, and `docs/superpowers/specs/2026-08-11-launch-safety-design.md` for
sub-project 1, which captured the source material this consumes.

## Goal and acceptance boundary

WTIA is retiring `hkwtia.org`. Its post archive is the only record of what the
association did between 2001 and 2025 — the founding, the first awards, Wi-Fi.HK,
SafeWiFi, the LegCo election forum, the 20+1 anniversary — and the new site
currently carries none of it. The About page does not say when WTIA was founded.

This sub-project moves that record across and closes the redirect gap that
blocks the domain cutover. Sub-project 1 pointed 61 milestone URLs at a generic
`/about` fallback because their real destination did not exist yet, and recorded
that both redirect passes must be live before DNS moves. This is the second pass.

Acceptance: all 61 milestone posts exist on the new site with their bodies and
images in both locales; `/about/history` is live; the 61 legacy paths resolve to
a real destination rather than a section fallback; and `/about` states the
founding year and the mission.

Leadership — the chairman's message, the Executive Committee, honorary chairmen
and the six Core Focus Groups — is sub-project 2b. It is excluded here because it
has no cutover deadline, and because the current roster is contested (see
"Open questions").

## What the source actually contains

Measured from the 577-page capture, not assumed:

- **61 milestone posts**, spanning 2001–2025.
- **Eight years have no posts at all**: 2004, 2008–2012, 2023, 2024. Nearly a
  third of the period, including a five-year run. The gap is real in the source.
- **The median body is 58 words**; the longest is 991. Total 7,258 words.
- **47 of 61 are English-only**, 3 are Chinese-only, 11 are mixed. WTIA's own
  Chinese site has never carried a Chinese version of most of its history.
- **81 image references resolving to 73 unique files**, ~93 KB each, roughly
  7 MB in total. Every one is hosted on `hkwtia.org` and will die with it.

  An earlier draft of this spec said 205/87. That count was wrong: the theme
  renders a "Related Posts" carousel *inside* `<article>` on 45 of the 61 pages,
  and the measurement counted those thumbnails as post content. Corrected after
  the extractor was run against the archive.
- Titles come in two shapes: year-prefixed milestones (`2001 - Establishment of
  WTIA`) and ordinary news posts that happen to be old (`New Term of Executive
  Committee (2022 - 2024)`).

## Options considered

**A page for every post.** Rejected. With a 58-word median, that produces ~46
pages of two or three sentences — thin content, which search engines discount and
which reads as a stub. Building the thing meant to rescue WTIA's search presence
in a shape that damages it is the wrong trade.

**One archive page, everything inline.** Rejected, narrowly. It avoids thin
content entirely and one strong page often outranks many weak ones, but it gives
up per-entry URLs, so the handful of genuinely substantial entries — the 991-word
anniversary record, the chairman's remarks — get no address of their own and the
inbound links to them stay pointed at a section.

**Threshold split.** Chosen. Entries above ~150 words get a page; the rest render
in full on the timeline. Measured against the real archive this yields **7**
featured entries, not the ~15 first estimated. Every word survives either way; the only thing that
varies is whether an entry has its own URL, and that tracks whether there is
enough content to justify one.

**Storage in the `posts` table.** Rejected. It would reuse the existing
bilingual schema and admin authoring, which is a real attraction. But the point
of this work is rescuing content from a system that is being switched off, and a
database row lives in one Neon instance while a repository file is preserved,
diffable, and reviewable forever. History is also the most immutable content
there is, which is precisely the case the "stable content lives in the repo"
convention exists for.

## Architecture

### 1. Extraction

A one-off script reads `.legacy-capture/pages/*.html` and emits a draft
`content/milestones.ts`: slug, year, month, bilingual title and body, image
references, and the legacy path.

WordPress markup across 25 years is not uniform, so the script produces a draft
and a human corrects it. **The reviewed file is the artifact**, not the script's
output. The script is committed anyway so the extraction is auditable rather than
a one-time act nobody can reproduce.

`featured` is computed once during extraction from the ~150-word threshold and
then frozen in the file. Recomputing it at render time would let a later copy
edit silently move an entry between layouts, changing its URL.

### 2. Data shape

```ts
type Milestone = Readonly<{
  slug: string;              // derived from the legacy path, stable forever
  year: number;
  month: string;             // "01".."12", from the legacy path
  titleEn: string; titleZh: string;
  bodyEn: string; bodyZh: string;
  images: readonly MilestoneImage[];
  legacyPath: string;        // the source URL, for the redirect upgrade
  featured: boolean;
}>;
```

`slug` derives from the legacy path so the mapping between old URL and new page
is mechanical and checkable, rather than a second thing to keep in sync.

### 3. Routes

- `/about/history` — all 61 grouped by year, newest first, with non-featured
  bodies rendered in full inline. Years with no entries are omitted; eight empty
  rows would advertise the gap rather than the record.
- `/about/history/[slug]` — the ~15 featured entries.

Both are Server Components reading typed content, so neither needs a database and
neither can fail the way a database-backed public page can.

### 4. Images

Download the 87 unique files to `public/images/history/`, rewrite the references
in the extracted content, and commit them. At ~8 MB that is comfortable in the
repository, and own-origin satisfies the existing `img-src 'self' data:` CSP with
no configuration change — the media registry and `next.config.ts` both
deliberately refuse remote hosts, so hotlinking would not render even while the
old site is still up.

### 5. Translation

Draft the missing locale for all 61 entries, then emit a separate list of proper
nouns — programme names, people, award titles, government schemes — for WTIA to
check. That list is what they act on. Asking them to review 7,258 words would
stall the work; asking them to confirm thirty names takes an hour and catches the
errors that actually matter.

### 6. Redirect upgrade

The 61 milestone entries in `content/legacy-urls.json` change destination from
`/about` to `/about/history/<slug>` where featured and `/about/history`
otherwise, and their `kind` changes from `section-fallback` to `equivalent` for
the featured ones.

`tests/unit/legacy-urls.test.ts` asserts every destination is a member of
`config/public-routes.ts`, and `/about/history/<slug>` is not a static route.
Because milestones are typed content, the slugs are known at build time, so that
test's notion of a valid destination extends to "declared in `publicRoutes`, or a
declared milestone slug." The guarantee it exists to provide — no redirect to a
route that does not exist — is preserved, and the milestone list becomes the
second source it checks against.

### 7. About page

Founding year and mission become new keys in the existing `About` namespace in
both bundles, rendered on the existing page. That namespace is already staff-
editable through `/admin/page-copy`, so this needs no new plumbing.

## Invariants this must not break

- Message bundles stay in parity and `npm run audit:strings` stays green. Every
  visible string added here goes in both `messages/en.json` and
  `messages/zh-HK.json`.
- No redirect may point at a route that does not exist. The test is extended, not
  relaxed.
- No image may reference a remote host. `img-src 'self' data:` stays as it is.
- Locale prefixes are never hand-built. `/about/history` links use
  `localizedPath`, because `zh-HK` is served at `/zh`.
- Both redirect passes must be deployed before DNS moves. This is the second.

## Risk: the capture is not durable

`.legacy-capture/` holds the only copy of 577 pages of WTIA's history, and it is
**deliberately git-ignored and lives inside a git worktree**. `git worktree
remove` deletes it. Once `hkwtia.org` is switched off it cannot be recreated.

Before implementation starts, that directory must be copied somewhere durable —
outside the worktree, and backed up. This is a prerequisite, not a cleanup task.
The 87 images are a sharper case still: the capture saved HTML only, so the
images exist nowhere but the live site, and step 4 is the first time they are
fetched at all.

## Open questions for 2b, recorded here so they are not lost

The audit lists the Executive Committee as term 2022–2026 with four named
officers. The captured archive contains a post titled *New Term of Executive
Committee (2022 - 2024)*. These disagree, and a website naming the wrong
office-holders is worse than one naming none. Sub-project 2b must confirm the
current roster with WTIA rather than trusting either source.

## Out of scope

Leadership (2b). Programme track records — editions, funders, winners — which are
sub-project 3. The photo gallery and Meet Our Members as real showcase entries,
which are sub-project 4. The membership tier migration and Launch Pad source
attribution, which are product decisions from the audit's P2.
