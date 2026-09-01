# WiseTech PR3 Institutional Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a photographic, question-led repository-backed homepage and a consistent verified institutional/history/programme page family without importing donor claims/assets or changing business systems.

**Architecture:** Canonical public repositories gain optional bounded reads; a dependency-injected Home loader settles event, news, and showcase independently into available/empty/unavailable states. PR3-only Server Components provide the editorial hero, highlight, intro, section, and gallery vocabulary, while existing typed milestone/programme records remain factual authorities. Existing metadata, JSON-LD, locale, redirect, and public-shell owners do not move.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript 5.8 strict, next-intl 4, Tailwind CSS 3, Drizzle ORM, Zod, Vitest 3, Testing Library 16, Playwright 1.61, axe-core.

## Global Constraints

- Base every PR3 commit on verified PR2 head `4d28a87eca70466a7f7e64132da9287fea7da3c0`.
- Scope routes to `/`, `/about`, `/about/chairman`, `/about/committees`, `/about/history`, `/about/history/[slug]`, and `/programs/{asa,cpai,hkict,tct}`.
- Use donor `YNWAforever/wisetech` commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, only for presentation evidence.
- Import no donor runtime, asset, claim, event, member, partner, person, award, testimonial, statistic, or programme content; all 99 donor assets remain non-publishable.
- Use current translations, repository-published records, typed milestones/programmes, and record-linked own-origin images as authorities.
- Remove Home `Stats`; add no replacement statistic.
- Home actions are exactly canonical `/events` and `/membership`; internal links use the existing locale-aware `Link` or `localizedPath`.
- Dynamic Home reads are bounded to one candidate per domain, deterministic, independent, and fail closed without error disclosure or static fallback arrays.
- Preserve existing metadata pathname/image inputs, Home organization JSON-LD, legacy redirects, sitemap/robots, locale fallback, PR2 shell, one visible `h1`, and one public `main#main-content`.
- Keep `PageHero` unchanged for routes outside PR3.
- Add no schema, migration, seed, authentication, payment, provider, API, admin, portal, deployment, or production change.
- Every behavior slice is test-first: run the focused test, read the intended failure, implement minimally, rerun, and commit only explicit task files.

---

## File map

- `lib/db/repos/events.ts`: bounded earliest-upcoming public event reader.
- `lib/db/repos/public-posts.ts`: optional bounded published-news reader.
- `lib/db/repos/showcase.ts`: optional bounded published-showcase read through database and injected stores.
- `lib/home/home-highlights.ts`: independent fail-closed Home aggregation and localized view models.
- `components/marketing/editorial-hero.tsx`: Home-only photographic question hero and canonical actions.
- `components/marketing/home-highlight-card.tsx`: available/empty/unavailable highlight presentation with `h3`.
- `components/marketing/institutional-page-intro.tsx`: PR3 inner-page image/heading lead.
- `components/marketing/story-section.tsx`: semantic `h2` story section.
- `components/marketing/media-gallery.tsx`: record-provided own-origin gallery.
- Existing PR3 route and domain component files: composition only; no factual source replacement.
- `messages/en.json`, `messages/zh-HK.json`: structurally identical PR3 visible copy.
- Focused repository, loader, component, route, scope, browser, and accessibility tests under `tests/`.

---

### Task 1: Bounded deterministic public feature readers

**Files:**
- Modify: `tests/unit/public-event-repository.test.ts`
- Modify: `tests/unit/public-posts-repository.test.ts`
- Modify: `tests/unit/m5-repository.test.ts`
- Modify: `lib/db/repos/events.ts`
- Modify: `lib/db/repos/public-posts.ts`
- Modify: `lib/db/repos/showcase.ts`

**Interfaces:**
- Produces: `PublicReadOptions = Readonly<{limit?: number}>`.
- Produces: `eventsRepository.listFeaturedPublic(actor, {asOf, limit}, source?)`.
- Produces: `listPublishedNews(asOf?, options?)`.
- Produces: `showcaseRepository.listPublished(filters, options?)`.
- Invariant: supplied `limit` is integer `1..12` and is validated before loading a database.

- [ ] **Step 1: Add failing event selection tests**

Add to `tests/unit/public-event-repository.test.ts`:

```ts
import {listFeaturedPublicEvents} from "@/lib/db/repos/events";

it("bounds the earliest upcoming public events with a slug tie-break", async () => {
  const asOf = new Date("2026-08-28T00:00:00.000Z");
  const rows = [
    event("past", {startsAt: new Date("2026-08-27T23:59:59.000Z")}),
    event("same-z", {startsAt: new Date("2026-09-01T10:00:00.000Z")}),
    event("same-a", {startsAt: new Date("2026-09-01T10:00:00.000Z")}),
    event("member", {memberOnly: true, startsAt: new Date("2026-08-29T00:00:00.000Z")}),
    event("draft", {published: false, startsAt: new Date("2026-08-29T00:00:00.000Z")}),
  ];

  await expect(
    listFeaturedPublicEvents(anonymous, {asOf, limit: 1}, rows),
  ).resolves.toHaveLength(1);
  await expect(
    listFeaturedPublicEvents(anonymous, {asOf, limit: 2}, rows),
  ).resolves.toMatchObject([{slug: "same-a"}, {slug: "same-z"}]);
});

it("rejects an invalid feature limit before reading", async () => {
  const source = {list: vi.fn(async () => [event("never")])};
  await expect(
    listFeaturedPublicEvents(anonymous, {asOf: new Date(), limit: 0}, source),
  ).rejects.toThrow();
  expect(source.list).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add failing news SQL-bound test**

In `tests/unit/public-posts-repository.test.ts`, call:

```ts
it("applies a deterministic SQL limit to published news", async () => {
  const fixture = predicateSensitiveProxy([
    row("zulu", {kind: "news"}),
    row("alpha", {kind: "news"}),
  ]);
  const repository = createPublicPostsRepository(async () => fixture.database as never);

  await expect(repository.listPublishedNews(asOf, {limit: 1}))
    .resolves.toMatchObject([{slug: "alpha"}]);
  expect(fixture.statements[0]?.sql).toMatch(/ORDER BY.*published_at.*DESC.*slug.*ASC/i);
  expect(fixture.statements[0]?.sql).toMatch(/LIMIT/i);
  expect(fixture.statements[0]?.params).toContain(1);
});
```

- [ ] **Step 3: Add failing showcase bound test**

Extend `memoryStore` in `tests/unit/m5-repository.test.ts` so `listPublished` records the optional options argument, then add:

```ts
it("bounds the deterministic published order", async () => {
  const store = memoryStore([
    listing({id: "free", slug: "free", status: "published", premium: false}),
    listing({id: "z", slug: "z", status: "published", premium: true, nameEn: "Zulu"}),
    listing({id: "a", slug: "a", status: "published", premium: true, nameEn: "Alpha"}),
  ]);
  const repo = createShowcaseRepository({store});

  await expect(repo.listPublished({}, {limit: 2}))
    .resolves.toMatchObject([{slug: "a"}, {slug: "z"}]);
});
```

- [ ] **Step 4: Run all three tests and confirm intended failures**

Run:

```powershell
npm.cmd test -- tests/unit/public-event-repository.test.ts tests/unit/public-posts-repository.test.ts tests/unit/m5-repository.test.ts
```

Expected: FAIL because the event reader and optional repository bounds do not exist. A failure caused only by a typo/import mismatch does not satisfy red; fix the test until it fails on the missing behavior.

- [ ] **Step 5: Implement the shared bound and event reader**

In `lib/db/repos/events.ts`, import `gte`, add:

```ts
const publicReadLimitSchema = z.number().int().min(1).max(12);

export type FeaturedPublicEventOptions = Readonly<{
  asOf: Date;
  limit: number;
}>;

export async function listFeaturedPublicEvents(
  _actor: Actor,
  options: FeaturedPublicEventOptions,
  source?: EventRows,
): Promise<Event[]> {
  const limit = publicReadLimitSchema.parse(options.limit);
  const asOf = z.coerce.date().parse(options.asOf);
  if (source) {
    return sorted(await rowsFrom(source))
      .filter((event) =>
        event.published && !event.memberOnly && event.startsAt >= asOf
      )
      .sort((left, right) =>
        left.startsAt.getTime() - right.startsAt.getTime()
        || left.slug.localeCompare(right.slug)
      )
      .slice(0, limit);
  }
  const database = await getDb();
  return database.select().from(events)
    .where(and(
      eq(events.published, true),
      eq(events.memberOnly, false),
      gte(events.startsAt, asOf),
    ))
    .orderBy(asc(events.startsAt), asc(events.slug))
    .limit(limit);
}
```

Add `listFeaturedPublic: listFeaturedPublicEvents` to `eventsRepository`. Do not change `listPublic`.

- [ ] **Step 6: Implement backward-compatible news/showcase options**

In both repository modules use:

```ts
export type PublicReadOptions = Readonly<{limit?: number}>;
const publicReadLimitSchema = z.number().int().min(1).max(12);
const readLimit = (options: PublicReadOptions = {}) =>
  options.limit === undefined ? undefined : publicReadLimitSchema.parse(options.limit);
```

Change `PublicPostsRepository.listPublishedNews` and the exported wrapper to accept `(asOf?: Date, options?: PublicReadOptions)`; construct the existing ordered query, then return `limit === undefined ? query : query.limit(limit)`.

Change `ShowcaseStore.listPublished` and `ShowcaseRepository.listPublished` to accept an optional `PublicReadOptions`. Apply the limit to the database query after its existing `orderBy`, pass options through `createShowcaseRepository`, and return:

```ts
const limit = readLimit(options);
const rows = publicSort(await store.listPublished(parsed, options));
return limit === undefined ? rows : rows.slice(0, limit);
```

Keep every current predicate, projection, join, and order clause.

- [ ] **Step 7: Run repository tests**

Run the Step 4 command.

Expected: PASS for all focused repository suites, including proof that old unbounded calls still return their complete ordered datasets.

- [ ] **Step 8: Commit the repository seam**

```powershell
git add tests/unit/public-event-repository.test.ts tests/unit/public-posts-repository.test.ts tests/unit/m5-repository.test.ts lib/db/repos/events.ts lib/db/repos/public-posts.ts lib/db/repos/showcase.ts
git commit -m "feat: add bounded public feature reads"
```

---

### Task 2: Independent fail-closed Home aggregation

**Files:**
- Create: `tests/unit/home-highlights.test.ts`
- Create: `lib/home/home-highlights.ts`

**Interfaces:**
- Consumes: Task 1 bounded readers, `localizeEvent`, `toPublicListing`, `AppLocale`.
- Produces: `HomeSlot<T>`, `HomeHighlights`, `HomeHighlightReaders`, `loadHomeHighlights(input)`.

- [ ] **Step 1: Write the failing loader contract**

Create `tests/unit/home-highlights.test.ts` with injected reader fixtures:

```ts
import {describe, expect, it, vi} from "vitest";
import {loadHomeHighlights} from "@/lib/home/home-highlights";

const asOf = new Date("2026-08-28T00:00:00.000Z");
const event = {id: "event-1", slug: "event-one", titleEn: "Event", titleZh: "活動",
  descriptionEn: "Event body", descriptionZh: "活動內容", startsAt: new Date("2026-09-01T00:00:00Z"),
  endsAt: null, venue: "Hong Kong", capacity: null, memberOnly: false, published: true,
  createdAt: asOf, updatedAt: asOf};
const news = {slug: "news-one", titleEn: "News", titleZh: "消息", publishedAt: asOf, author: "WTIA"};
const listing = {slug: "member-one", status: "published", premium: false, goneGlobal: false,
  views: 0, memberSince: "2020-01-01", nameEn: "Member", nameZhHk: "會員",
  taglineEn: "Tag", taglineZhHk: "標語", descriptionEn: "Body", descriptionZhHk: "內容",
  category: "software", useCases: [], deploymentOptions: [], supportedLanguages: [],
  worksWith: [], videoUrl: null, caseStudyUrl: null, caseStudySummaryEn: null,
  caseStudySummaryZhHk: null, logoReference: null};

function readers(overrides: Record<string, unknown> = {}) {
  return {
    events: vi.fn(async () => [event]),
    news: vi.fn(async () => [news]),
    showcase: vi.fn(async () => [listing]),
    ...overrides,
  };
}

it("requests one deterministic record from every domain", async () => {
  const source = readers();
  const result = await loadHomeHighlights({locale: "en", asOf, readers: source as never});
  expect(result.event).toMatchObject({status: "available", item: {slug: "event-one"}});
  expect(result.news).toMatchObject({status: "available", item: {slug: "news-one"}});
  expect(result.showcase).toMatchObject({status: "available", item: {slug: "member-one"}});
  expect(source.events).toHaveBeenCalledWith({asOf, limit: 1});
  expect(source.news).toHaveBeenCalledWith(asOf, {limit: 1});
  expect(source.showcase).toHaveBeenCalledWith({}, {limit: 1});
});

it("distinguishes empty and unavailable without coupling domains", async () => {
  const result = await loadHomeHighlights({
    locale: "zh-HK", asOf,
    readers: readers({
      events: vi.fn(async () => []),
      news: vi.fn(async () => { throw new Error("relation secret_table"); }),
    }) as never,
  });
  expect(result.event).toEqual({status: "empty"});
  expect(result.news).toEqual({status: "unavailable"});
  expect(result.showcase).toMatchObject({status: "available", item: {name: "會員"}});
  expect(JSON.stringify(result)).not.toContain("secret_table");
});
```

Add a table-driven case for each single rejected reader and all three rejected readers.

- [ ] **Step 2: Run and verify red**

Run: `npm.cmd test -- tests/unit/home-highlights.test.ts`

Expected: FAIL because `@/lib/home/home-highlights` does not exist.

- [ ] **Step 3: Implement the loader**

Create `lib/home/home-highlights.ts` with the interfaces from the design. Define default readers as thin calls to:

```ts
const anonymous = {kind: "anonymous", userId: null} as const;

const defaultReaders: HomeHighlightReaders = {
  events: (options) => eventsRepository.listFeaturedPublic(anonymous, options),
  news: (asOf, options) => listPublishedNews(asOf, options),
  showcase: (filters, options) => showcaseRepository.listPublished(filters, options),
};
```

Use one `Promise.allSettled` call. Convert event through `localizeEvent`, showcase through `toPublicListing`, and leave news as its validated summary. Implement a private `slot(result, map)` that returns `unavailable` on rejection, `empty` on no first item, and `available` otherwise. Do not catch/log outside that conversion.

- [ ] **Step 4: Run and verify green**

Run: `npm.cmd test -- tests/unit/home-highlights.test.ts`

Expected: PASS, with every reader called once even when siblings reject.

- [ ] **Step 5: Commit**

```powershell
git add tests/unit/home-highlights.test.ts lib/home/home-highlights.ts
git commit -m "feat: add fail-closed home highlights"
```

---

### Task 3: Question-led Home and dynamic highlight presentation

**Files:**
- Create: `components/marketing/editorial-hero.tsx`
- Create: `components/marketing/home-highlight-card.tsx`
- Create: `tests/unit/homepage.test.tsx`
- Modify: `app/[locale]/(public)/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`

**Interfaces:**
- Consumes: `loadHomeHighlights`, `HomeSlot`, current `FeatureGrid`, `ProgramGrid`, `Section`, organization JSON-LD.
- Produces: `EditorialHeroProps` and `HomeHighlightCardProps`; `#home-discover` anchor.
- Keeps: metadata image `/images/projects-hero.jpg` and `buildOrganizationData()`.

- [ ] **Step 1: Write failing Home component tests**

Create `tests/unit/homepage.test.tsx`. Mock `next-intl/server`, `next/image`, navigation `Link`, and `loadHomeHighlights`. Render `HomePage` in English and Chinese. Assert:

```ts
expect(screen.getByRole("heading", {level: 1, name: en.Home.question})).toBeVisible();
expect(screen.getByRole("link", {name: en.Home.actions.events})).toHaveAttribute("href", "/events");
expect(screen.getByRole("link", {name: en.Home.actions.membership})).toHaveAttribute("href", "/membership");
expect(screen.getByRole("img", {name: en.Home.imageAlt})).toHaveAttribute("src", "/images/projects-hero.jpg");
expect(screen.queryByText(en.Home.statsTitle)).not.toBeInTheDocument();
expect(screen.getByRole("heading", {level: 3, name: "Repository event"})).toBeVisible();
expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
```

Add independent state cases that supply `empty` and `unavailable` slots and assert the matching localized text, with no placeholder title. Assert all card headings are level 3.

- [ ] **Step 2: Run and verify red**

Run: `npm.cmd test -- tests/unit/homepage.test.tsx`

Expected: FAIL because Home still imports `Stats`, has no action keys, loader, or PR3 components.

- [ ] **Step 3: Add complete bilingual Home keys**

In both message bundles, replace `statsTitle`/`stats` with structurally matching keys:

```json
{
  "question": "Where can Hong Kong innovation go next?",
  "actions": {
    "events": "Find an event",
    "membership": "Explore membership",
    "discover": "Discover WiseTech"
  },
  "highlightsTitle": "What is happening now",
  "highlightsIntro": "Published opportunities and stories from the WTIA ecosystem.",
  "highlights": {
    "event": {"label": "Next event", "view": "View event", "empty": "No upcoming public event is available.", "unavailable": "Event information is temporarily unavailable."},
    "news": {"label": "Latest news", "view": "Read news", "empty": "No published news is available.", "unavailable": "News is temporarily unavailable."},
    "showcase": {"label": "Member solution", "view": "Explore solution", "empty": "No published member solution is available.", "unavailable": "Member solutions are temporarily unavailable."}
  }
}
```

Use reviewed Traditional Chinese translations with identical key structure. Preserve existing title/summary meaning, feature/programme keys, and all metadata keys.

- [ ] **Step 4: Implement `EditorialHero` and `HomeHighlightCard`**

`EditorialHero` props are:

```ts
type EditorialHeroProps = Readonly<{
  eyebrow: string; title: string; description: string; image: string; imageAlt: string;
  actions: readonly [Readonly<{label: string; href: "/events"}>, Readonly<{label: string; href: "/membership"}>];
  discoverLabel: string;
}>;
```

Render one `h1`, a priority `Image fill sizes="100vw"`, two `Link` anchors with `min-h-11 min-w-11`, and `href="#home-discover"`.

`HomeHighlightCard` consumes a localized view model:

```ts
type HomeHighlightCardProps = Readonly<{
  label: string;
  state: "available" | "empty" | "unavailable";
  title?: string;
  summary?: string;
  meta?: string;
  href: string;
  actionLabel: string;
  stateMessage?: string;
}>;
```

For available state require `title`; render it as `h3`. Empty/unavailable render `stateMessage` and no fake title. Every state renders the safe canonical action.

- [ ] **Step 5: Rewrite Home composition**

In `app/[locale]/(public)/page.tsx`:

- export `dynamic = "force-dynamic"`;
- remove `Stats` and its static map;
- call `loadHomeHighlights({locale: appLocale})`;
- render `EditorialHero` with its `title`/`h1` value set to `t("question")`; `Home.title` may remain legacy bundle copy but is not the page `h1`;
- render one `Section` with `id="home-discover"` support or an outer anchored section and three `HomeHighlightCard` children;
- derive available view models only from slot items, using `localizedPath` for event/news/showcase details;
- format event/news dates with `Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"})`;
- retain existing FeatureGrid, ProgramGrid, metadata, and organization JSON-LD.

Do not add a static highlight array containing domain records. A three-element array of presentation descriptors that holds only labels, states, and canonical owners is permitted, but direct explicit card composition is clearer and preferred.

- [ ] **Step 6: Run focused Home and message gates**

```powershell
npm.cmd test -- tests/unit/homepage.test.tsx tests/unit/home-highlights.test.ts tests/unit/messages.test.ts tests/unit/apply-page-copy.test.ts
npm.cmd run audit:strings
```

Expected: PASS; no visible string audit findings and no Home statistics.

- [ ] **Step 7: Commit**

```powershell
git add components/marketing/editorial-hero.tsx components/marketing/home-highlight-card.tsx app/[locale]/\(public\)/page.tsx messages/en.json messages/zh-HK.json tests/unit/homepage.test.tsx
git commit -m "feat: rebuild question-led homepage"
```

---

### Task 4: PR3 institutional presentation primitives

**Files:**
- Create: `components/marketing/institutional-page-intro.tsx`
- Create: `components/marketing/story-section.tsx`
- Create: `components/marketing/media-gallery.tsx`
- Create: `tests/unit/institutional-components.test.tsx`

**Interfaces:**
- Produces: `InstitutionalPageIntro(props)`, `StorySection(props)`, `MediaGallery({images})`.
- `images` is `readonly {src: string; alt: string}[]`; all values are supplied by current content records.

- [ ] **Step 1: Write failing semantic/render tests**

Test one intro with and without image, two StorySection tones, and a two-image gallery. Assert one `h1`, section `h2`, intrinsic image dimensions/`sizes`, localized alt, no `main`, no client hooks, and rejection of a remote source through an exported pure guard:

```ts
expect(() => assertOwnOriginEditorialImage("https://donor.example/hero.jpg"))
  .toThrow("OWN_ORIGIN_IMAGE_REQUIRED");
expect(assertOwnOriginEditorialImage("/images/about-hero.jpg"))
  .toBe("/images/about-hero.jpg");
```

- [ ] **Step 2: Run and verify red**

Run: `npm.cmd test -- tests/unit/institutional-components.test.tsx`

Expected: FAIL because the three components do not exist.

- [ ] **Step 3: Implement minimal primitives**

`InstitutionalPageIntro` validates optional image with `assertOwnOriginEditorialImage`, renders a section and one `h1`; its image uses `sizes="(min-width: 1024px) 50vw, 100vw"`. `StorySection` renders a `section`, `h2`, optional intro, children, and `tone: "plain" | "warm"`. `MediaGallery` validates every source, renders nothing for an empty array, and otherwise renders a responsive list of `Image width={960} height={640}` with `sizes="(min-width: 768px) 50vw, 100vw"`.

- [ ] **Step 4: Run and verify green**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add components/marketing/institutional-page-intro.tsx components/marketing/story-section.tsx components/marketing/media-gallery.tsx tests/unit/institutional-components.test.tsx
git commit -m "feat: add institutional story primitives"
```

---

### Task 5: About, Chairman, and Committees editorial composition

**Files:**
- Create: `tests/unit/institutional-pages.test.tsx`
- Modify: `tests/unit/about-page.test.ts`
- Modify: `app/[locale]/(public)/about/page.tsx`
- Modify: `app/[locale]/(public)/about/chairman/page.tsx`
- Modify: `app/[locale]/(public)/about/committees/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`

**Interfaces:**
- Consumes: Task 4 components and current namespaces.
- Preserves: existing `generateMetadata` path/title/description and About image `/images/about-hero.jpg`.
- Claim boundary: current unattributed Chairman message and three current committee descriptions only.

- [ ] **Step 1: Write failing route composition tests**

Mock request translations and render all three pages in each locale. Assert each page has one `InstitutionalPageIntro`, the expected `h2` sequence, no `PageHero`, no person portrait/name, no committee member list, and About history link `/about/history`. Keep existing founding-year assertions.

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- tests/unit/institutional-pages.test.tsx tests/unit/about-page.test.ts
```

Expected: FAIL because routes still compose `PageHero` and generic `FeatureGrid`.

- [ ] **Step 3: Add only structural bilingual copy**

Add keys for section kickers/action labels only where required by the new layout. Do not change existing founding, mission, Chairman message/signature, committee titles/descriptions, or metadata text. Every new English leaf has a real Chinese counterpart.

- [ ] **Step 4: Migrate the three pages**

Use `InstitutionalPageIntro` and `StorySection`:

- About: image `/images/about-hero.jpg`; current three roles; founded/mission story; history link.
- Chairman: no image unless a current approved own-origin image already exists (none does at this base); current message blockquote/signature.
- Committees: no people data; render current three committee descriptions as articles with `h3`.

Keep all routes as Server Components and preserve `setRequestLocale`.

- [ ] **Step 5: Run focused and shared contracts**

```powershell
npm.cmd test -- tests/unit/institutional-pages.test.tsx tests/unit/about-page.test.ts tests/unit/messages.test.ts tests/unit/metadata.test.ts tests/unit/public-landmark-contract.test.ts
npm.cmd run audit:strings
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add tests/unit/institutional-pages.test.tsx tests/unit/about-page.test.ts app/[locale]/\(public\)/about/page.tsx app/[locale]/\(public\)/about/chairman/page.tsx app/[locale]/\(public\)/about/committees/page.tsx messages/en.json messages/zh-HK.json
git commit -m "feat: refresh institutional story pages"
```

---

### Task 6: History timeline and featured detail presentation

**Files:**
- Modify: `tests/unit/history-page.test.tsx`
- Modify: `tests/unit/history-detail.test.ts`
- Modify: `app/[locale]/(public)/about/history/page.tsx`
- Modify: `app/[locale]/(public)/about/history/[slug]/page.tsx`
- Modify: `components/marketing/milestone-timeline.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`

**Interfaces:**
- Consumes: `milestonesOnly`, `featuredOnly`, `findBySlug`, Task 4 intro/section/gallery.
- Preserves: exactly three generated featured slugs at this base; non-featured bodies inline; non-milestone/non-featured/unknown direct requests 404.

- [ ] **Step 1: Extend failing presentation tests**

Keep all current factual tests and add assertions that the list/detail use the new intro, year headings remain ordered, only featured items link, detail gallery images use record alt text, and page/detail each expose exactly one `h1` when rendered under the public shell contract.

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/history-milestones.test.ts
```

Expected: the new composition assertions FAIL while existing filtering/count assertions remain green.

- [ ] **Step 3: Migrate list/detail presentation**

History list uses `InstitutionalPageIntro` with existing History strings, then `MilestoneTimeline`. Update timeline classes/hierarchy without moving `milestonesOnly` into the component.

Detail replaces its ad hoc top block with `InstitutionalPageIntro` and `StorySection`; pass `milestone.images` localized by current locale to `MediaGallery`. Keep `generateStaticParams`, `resolveFeaturedMilestone`, metadata, paragraph splitting, and `notFound()` logic unchanged.

- [ ] **Step 4: Run history and redirect contracts**

```powershell
npm.cmd test -- tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/history-milestones.test.ts tests/unit/redirects.test.ts tests/unit/public-landmark-contract.test.ts
```

Expected: PASS, including exactly three generated params.

- [ ] **Step 5: Commit**

```powershell
git add tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts app/[locale]/\(public\)/about/history/page.tsx app/[locale]/\(public\)/about/history/[slug]/page.tsx components/marketing/milestone-timeline.tsx messages/en.json messages/zh-HK.json
git commit -m "feat: refresh verified history stories"
```

---

### Task 7: Typed programme editorial treatment

**Files:**
- Create: `tests/unit/program-presentation.test.tsx`
- Modify: `components/marketing/program-detail.tsx`
- Modify: `components/marketing/program-editions.tsx`
- Modify: `components/marketing/program-credential.tsx`
- Modify: `app/[locale]/(public)/programs/asa/page.tsx`
- Modify: `app/[locale]/(public)/programs/cpai/page.tsx`
- Modify: `app/[locale]/(public)/programs/hkict/page.tsx`
- Modify: `app/[locale]/(public)/programs/tct/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`

**Interfaces:**
- Consumes: current `programs`, `asa`, `cpai`, `hkict`, `tct`, `AGENCIES`, localization helpers, Task 4 primitives.
- Preserves: four distinct factual schemas and all explicit absence variants.

- [ ] **Step 1: Write failing programme presentation tests**

Render `ProgramDetail`, `ProgramEditions`, and `ProgramCredential` with minimal typed fixtures. Assert one intro `h1`, edition `h2`/item `h3`, gallery alts, CPAI issuer/course-partner/separate certificate, TCT with no winners heading, `unrecorded` text for ASA/HKICT, and no `PageHero`.

Add route-level checks that each page imports its programme-specific record and does not import donor/config mock data.

- [ ] **Step 2: Run and verify red**

```powershell
npm.cmd test -- tests/unit/program-presentation.test.tsx tests/unit/program-content.test.ts tests/unit/program-schema.test.ts tests/unit/program-contradicted-claims.test.ts
```

Expected: presentation tests FAIL; all factual record tests remain green.

- [ ] **Step 3: Migrate shared programme components**

- `ProgramDetail`: compose `InstitutionalPageIntro` using the current route record image/title/description and a `StorySection` for status.
- `ProgramEditions`: retain `EditionView`, `LocalisedWinners`, `localiseWinners`, and `localiseImages`; use `StorySection` and `MediaGallery`; preserve `winners?:` omission.
- `ProgramCredential`: retain its non-edition shape and Facts; use `StorySection` and `MediaGallery`.

Do not merge schemas or move factual mapping into presentation components.

- [ ] **Step 4: Keep route logic factual and thin**

Each of the four pages retains current translation keys, metadata image/path, record-specific maps/comments, agency-era selection, and status. Only prop shape changes required by the shared presentation components are permitted.

- [ ] **Step 5: Run programme, messages, and image contracts**

```powershell
npm.cmd test -- tests/unit/program-presentation.test.tsx tests/unit/program-content.test.ts tests/unit/program-schema.test.ts tests/unit/program-contradicted-claims.test.ts tests/unit/download-program-images.test.ts tests/unit/messages.test.ts
npm.cmd run audit:strings
```

Expected: PASS with no changed factual expectation.

- [ ] **Step 6: Commit**

```powershell
git add tests/unit/program-presentation.test.tsx components/marketing/program-detail.tsx components/marketing/program-editions.tsx components/marketing/program-credential.tsx app/[locale]/\(public\)/programs/asa/page.tsx app/[locale]/\(public\)/programs/cpai/page.tsx app/[locale]/\(public\)/programs/hkict/page.tsx app/[locale]/\(public\)/programs/tct/page.tsx messages/en.json messages/zh-HK.json
git commit -m "feat: refresh verified programme stories"
```

---

### Task 8: Scope guards and complete PR3 acceptance

**Files:**
- Create: `tests/unit/wisetech-pr3-scope-boundary.test.ts`
- Create: `tests/e2e/wisetech-pr3-public-pages.spec.ts`
- Modify: `tests/e2e/public-route-matrix.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify only if an assertion identifies a real PR3 defect: files from Tasks 1-7.

**Interfaces:**
- Consumes: all PR3 routes/components and existing route/landmark/locale contracts.
- Produces: deterministic source-scope guard and browser evidence at 375/768/1024/1440 widths.

- [ ] **Step 1: Write the failing source boundary**

The test discovers changed source files from an explicit PR3 allowlist (not Git state), asserts each expected route/component is present, and scans imports/content. It must catch hostile samples for each rule. Reject:

```ts
const forbiddenRoots = [
  "drizzle/", "lib/auth/", "lib/payments/", "app/api/",
  "app/[locale]/(admin)/", "app/[locale]/(member)/", "scripts/seed-",
];
const forbiddenText = [
  "YNWAforever/wisetech/", "partnerData", "visualData",
  "http://", "https://images.", "Stats",
];
```

Permit `https://github.com/YNWAforever/wisetech` only inside the two PR3 docs, not runtime imports. Assert `components/marketing/page-hero.tsx`, `next.config.ts`, `drizzle/`, schema files, and seed files are absent from the implementation allowlist. Include a hostile fixture proving the detector fails on a donor import and a safe fixture proving local imports pass.

- [ ] **Step 2: Add failing browser acceptance**

Create `tests/e2e/wisetech-pr3-public-pages.spec.ts`:

- Home/zh Home: one `h1`, one `main#main-content`, hero image, `/events` and `/membership` actions, no stats heading, three highlight regions in available/empty/unavailable form.
- At 375 and 1440: no horizontal overflow; action boxes are at least 44px; Concierge does not overlap actions.
- About/Chairman/Committees/History/one featured history detail/all four programmes, in both locales: status below 400, one visible `h1`, one main, no runtime overlay.
- Capture Home and one programme screenshot at 375 and 1440.

Expand `public-route-matrix.spec.ts` with `/about`, `/about/chairman`, `/about/committees`, `/about/history`, and the three current featured history slugs. Expand `accessibility.spec.ts` representative pages with `/about/chairman`, one history detail, `/programs/asa`, and Chinese equivalents.

- [ ] **Step 3: Run focused red and fix only observed defects**

```powershell
npm.cmd test -- tests/unit/wisetech-pr3-scope-boundary.test.ts
npm.cmd run test:e2e -- tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts
```

Expected first run: scope test or browser assertions identify incomplete composition/coverage. Make only the smallest PR3 file changes needed, then rerun to green. Do not weaken route counts, landmark counts, axe impact filtering, or hostile source fixtures.

- [ ] **Step 4: Run the focused PR3 unit gate**

```powershell
npm.cmd test -- tests/unit/public-event-repository.test.ts tests/unit/public-posts-repository.test.ts tests/unit/m5-repository.test.ts tests/unit/home-highlights.test.ts tests/unit/homepage.test.tsx tests/unit/institutional-components.test.tsx tests/unit/institutional-pages.test.tsx tests/unit/history-page.test.tsx tests/unit/history-detail.test.ts tests/unit/history-milestones.test.ts tests/unit/program-presentation.test.tsx tests/unit/program-content.test.ts tests/unit/program-schema.test.ts tests/unit/program-contradicted-claims.test.ts tests/unit/wisetech-pr3-scope-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all local static/unit gates**

```powershell
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
git diff --check 4d28a87eca70466a7f7e64132da9287fea7da3c0...HEAD
git status --short
```

Expected: all commands exit 0; status lists only intended PR3 work before the final commit. If a baseline/environment failure appears, reproduce it against `4d28a87` before classifying it as non-regression.

- [ ] **Step 6: Run browser gates with explicit environment evidence**

Run the Step 3 Playwright command against the local managed server. Record actual base URL, viewport screenshots, and whether no database, an isolated database, or another explicitly authorized environment supplied dynamic rows.

If an isolated Preview is authorized later, rerun with:

```powershell
$env:PLAYWRIGHT_BASE_URL = '<authorized-preview-url>'
npm.cmd run test:e2e -- tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Do not create/seed a database, install provider credentials, deploy, or touch production as part of this task.

- [ ] **Step 7: Commit the acceptance slice**

```powershell
git add tests/unit/wisetech-pr3-scope-boundary.test.ts tests/e2e/wisetech-pr3-public-pages.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "test: verify PR3 institutional journeys"
```

- [ ] **Step 8: External handoff gates**

Report separately, without claiming them from local evidence:

- GitHub Actions result for the pushed commit;
- isolated Vercel Preview URL and commit identity;
- Lighthouse thresholds: performance at least 0.90, accessibility at least 0.95, SEO at least 0.95;
- content-owner review of English, Traditional Chinese, Chairman, Committees, milestone, and programme claims;
- rights/alt review for every displayed current asset;
- staff UAT and explicit production approval.

PR3 is source-complete when local gates pass and the branch is reviewable. It is not production-approved until the external gates are satisfied.
