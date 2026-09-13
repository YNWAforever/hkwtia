# Phase D Public Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public surface fully discoverable — structured data, per-entity share images, every history milestone published — and prove the `hkwtia.org` cutover before anyone touches DNS.

**Architecture:** Three new `schema-dts` builders extend the existing `lib/structured-data.ts` pattern. Breadcrumbs come from one shared helper called per page, with a discovery test making coverage impossible to drift. One `/api/og` route dispatches to three pure renderers chosen by what each entity can actually supply. Two scripts verify the 576 legacy redirects against the live hosts.

**Tech Stack:** Next.js 16 App Router (Webpack), React 19, TypeScript strict, next-intl v4, `schema-dts`, `next/og` (Satori), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-phase-d-public-surface-design.md`

---

## Context an engineer needs before starting

Read `CLAUDE.md` first. The rules that bite in this plan:

- **Never hand-build a locale prefix.** `zh-HK` is served at `/zh`. Use `localizedPath(locale, path)`. A literal `` `/${locale}/…` `` produces `/zh-HK/…`, which the proxy does not recognise. Pinned by `tests/unit/locale-href-boundary.test.ts`.
- **Every user-visible string lives in both `messages/en.json` and `messages/zh-HK.json`,** in parity. `npm run audit:strings` fails on unapproved JSX literals.
- **`'use client'` is for interactive browser behaviour only.** Nothing in this plan needs it.
- Files are kebab-case. Conventional commits. Comments explain *why*.

Run before every hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test`.

### What already exists (do not rebuild)

| Thing | Where | State |
|---|---|---|
| `StructuredData` component | `components/seo/structured-data.tsx` | Renders a `schema-dts` union as a JSON-LD script. Union must be widened for new types. |
| Builders | `lib/structured-data.ts` | `buildOrganizationData`, `buildWebSiteData`, `buildFaqData`, `buildEventData`, `buildMemberOrganizationData`, `buildBreadcrumbData`. |
| `BreadcrumbItem` | `lib/structured-data.ts:138` | `Readonly<{name: string; url: string}>` |
| Breadcrumb usage example | `app/[locale]/(public)/members/[slug]/page.tsx:124-128` | Copy this shape. |
| `buildPageMetadata` | `lib/metadata.ts:30` | Already accepts `image` (defaults to `siteConfig.defaultImage`) and runs it through `absoluteUrl`. **No change needed** — pages just pass a different `image`. |
| Legacy redirects | `next.config.ts:44-110`, `content/legacy-urls.json` | 576 classified entries. `tests/unit/redirects.test.ts` already resolves every one. |
| Nav labels | `messages/*.json` → `Navigation.links.*` | 18 of 22 public routes already have a label. Reuse them. |

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `lib/seo/route-breadcrumbs.ts` | The `route → labelKey` map and `routeBreadcrumbItems()`. One authority for static trails. |
| `lib/og/resolve-renderer.ts` | Pure: entity in, `{renderer, props}` out. All og decision logic lives here. |
| `lib/og/renderers.tsx` | The three Satori renderers (`editorial`, `logo`, `photo`). Presentation only. |
| `app/api/og/route.tsx` | Thin HTTP wrapper: parse params, load entity, hand to `resolveOgRenderer`, return `ImageResponse`. |
| `scripts/verify-legacy-redirects.mjs` | Replays all 576 legacy paths against a host, asserts each reaches 200. |
| `scripts/check-legacy-drift.mjs` | Diffs the live WordPress sitemaps against `content/legacy-urls.json`. |
| `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md` | The owner-executable runbook with rollback. |

**Modify**

| File | Change |
|---|---|
| `lib/structured-data.ts` | Add `buildArticleData`, `buildPersonData`, `buildEventSeriesData`. |
| `components/seo/structured-data.tsx` | Widen the union with `Article`, `Person`, `EventSeries`. |
| `app/sitemap.ts:87` | `featuredOnly(milestonesOnly(…))` → `milestonesOnly(…)`. |
| `app/[locale]/(public)/about/history/[slug]/page.tsx:21` | Same filter change, in lockstep. |
| 22 static public pages | Render the shared breadcrumb. |
| `app/[locale]/(public)/news/[slug]/page.tsx` | `Article` JSON-LD + og image. |
| `app/[locale]/(public)/about/chairman/page.tsx` | `Person` JSON-LD. |
| `app/[locale]/(public)/programs/*/page.tsx` | `EventSeries` JSON-LD. |
| `messages/en.json`, `messages/zh-HK.json` | Four new breadcrumb labels. |

---

## Task 1: Route breadcrumb helper

**Files:**
- Create: `lib/seo/route-breadcrumbs.ts`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/route-breadcrumbs.test.ts` (create)

18 of the 22 public routes already have a label at `Navigation.links.*`, and `/` has
`Common.breadcrumbHome`. Only `/join`, `/privacy` and `/members` need new strings — reuse
everything else rather than inventing a parallel vocabulary staff would have to keep in sync.

- [ ] **Step 1: Add the four labels**

In `messages/en.json`, inside the existing `Common` object (which already holds `breadcrumbHome`):

```json
"breadcrumbJoin": "Membership application",
"breadcrumbPrivacy": "Privacy",
"breadcrumbMembers": "Members"
```

In `messages/zh-HK.json`, at the identical path:

```json
"breadcrumbJoin": "會籍申請",
"breadcrumbPrivacy": "私隱聲明",
"breadcrumbMembers": "會員名錄"
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/route-breadcrumbs.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {publicRoutes} from "@/config/public-routes";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import {ROUTE_BREADCRUMB_LABEL_KEYS, routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";

const translate = (messages: Record<string, unknown>) => (key: string): string => {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
  if (typeof value !== "string") throw new Error(`missing message: ${key}`);
  return value;
};

describe("routeBreadcrumbItems", () => {
  it("gives every public route a label that resolves in both bundles", () => {
    // A route with no label throws MISSING_MESSAGE at request time and takes the page
    // down -- the exact shape of the /admin/page-copy outage of 2026-09-13.
    for (const route of publicRoutes) {
      const key = ROUTE_BREADCRUMB_LABEL_KEYS[route];
      expect(key, `${route} has no breadcrumb label key`).toBeDefined();
      expect(() => translate(en)(key!), `en: ${key}`).not.toThrow();
      expect(() => translate(zhHK)(key!), `zh-HK: ${key}`).not.toThrow();
    }
    // Held equal, so a label left behind by a deleted route surfaces too.
    expect(Object.keys(ROUTE_BREADCRUMB_LABEL_KEYS).sort()).toEqual([...publicRoutes].sort());
  });

  it("starts every trail at home and ends at the current page", () => {
    const items = routeBreadcrumbItems("en", "/about/chairman", translate(en));

    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({name: "Home", url: "https://hkwtia.vercel.app/"});
    expect(items[1]!.url).toBe("https://hkwtia.vercel.app/about");
    expect(items[2]!.url).toBe("https://hkwtia.vercel.app/about/chairman");
  });

  it("returns no trail for the home page itself, which has nowhere to point back to", () => {
    expect(routeBreadcrumbItems("en", "/", translate(en))).toEqual([]);
  });

  it("localises the trail through localizedPath, never a hand-built prefix", () => {
    const items = routeBreadcrumbItems("zh-HK", "/about/chairman", translate(zhHK));

    // CLAUDE.md hard boundary 5: zh-HK is served at /zh. A literal `/zh-HK/...` here
    // would be invisible until a crawler read it.
    for (const item of items) {
      expect(item.url).toContain("/zh/");
      expect(item.url).not.toContain("/zh-HK/");
    }
  });

  it("skips intermediate segments that are not themselves public routes", () => {
    // /programs is not in publicRoutes -- only /programs/<name> is -- so a trail for a
    // programme page must not invent a link to a page that does not exist.
    const items = routeBreadcrumbItems("en", "/programs/hkict", translate(en));

    expect(items.map((i) => i.url)).toEqual([
      "https://hkwtia.vercel.app/",
      "https://hkwtia.vercel.app/programs/hkict",
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/route-breadcrumbs.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seo/route-breadcrumbs"`.

- [ ] **Step 4: Write the implementation**

Create `lib/seo/route-breadcrumbs.ts`:

```ts
import {publicRoutes, type PublicRoute} from "@/config/public-routes";
import type {AppLocale} from "@/i18n/routing";
import type {BreadcrumbItem} from "@/lib/structured-data";
import {absoluteUrl, localizedPath} from "@/lib/urls";

/**
 * The message key naming each public route in a breadcrumb trail.
 *
 * Eighteen of these point at `Navigation.links.*`, which already names the same pages in
 * the header: a second vocabulary for the same routes would be one more thing for staff
 * to keep in sync, and it would drift. Only the four routes the navigation does not list
 * carry their own key.
 *
 * Held equal to `publicRoutes` by `tests/unit/route-breadcrumbs.test.ts`. A route without
 * a label throws MISSING_MESSAGE at request time and takes the page down -- exactly how
 * /admin/page-copy broke in both locales on 2026-09-13.
 */
export const ROUTE_BREADCRUMB_LABEL_KEYS: Readonly<Partial<Record<PublicRoute, string>>> = {
  "/": "Common.breadcrumbHome",
  "/join": "Common.breadcrumbJoin",
  "/privacy": "Common.breadcrumbPrivacy",
  "/members": "Common.breadcrumbMembers",
  "/about": "Navigation.links.about",
  "/about/chairman": "Navigation.links.chairman",
  "/about/committees": "Navigation.links.committees",
  "/about/history": "Navigation.links.history",
  "/membership": "Navigation.links.membership",
  "/showcase": "Navigation.links.showcase",
  "/launchpad": "Navigation.links.launchpad",
  "/ai-ops": "Navigation.links.aiOps",
  "/events": "Navigation.links.events",
  "/news": "Navigation.links.news",
  "/programs/cpai": "Navigation.links.cpai",
  "/programs/hkict": "Navigation.links.hkict",
  "/programs/tct": "Navigation.links.tct",
  "/programs/asa": "Navigation.links.asa",
  "/programmes": "Navigation.links.programmes",
  "/contact": "Navigation.links.contact",
  "/partners": "Navigation.links.partners",
  "/ai-transparency": "Navigation.links.aiTransparency",
};

const publicRouteSet: ReadonlySet<string> = new Set(publicRoutes);

/** Every ancestor path of `/a/b/c`, shallowest first, excluding "/" and the path itself. */
function ancestorsOf(pathname: string): readonly string[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join("/")}`);
}

/**
 * The trail for a static public route: home, then each ancestor that is itself a public
 * route, then the page.
 *
 * Ancestors that are not public routes are skipped rather than linked. `/programs` is the
 * case that matters -- only `/programs/<name>` exists -- and a breadcrumb offering a link
 * to a page that 404s is worse than a shorter trail.
 *
 * `translate` is passed in rather than imported so this stays a pure function the tests
 * can drive with either bundle. Callers hand it next-intl's `t` scoped to the root.
 */
export function routeBreadcrumbItems(
  locale: AppLocale,
  pathname: PublicRoute,
  translate: (key: string) => string,
): readonly BreadcrumbItem[] {
  // The home page is the root of every other trail and so has none of its own.
  if (pathname === "/") return [];

  const own = ROUTE_BREADCRUMB_LABEL_KEYS[pathname];
  if (!own) return [];

  const trail: BreadcrumbItem[] = [
    {name: translate("Common.breadcrumbHome"), url: absoluteUrl(localizedPath(locale, "/"))},
  ];
  for (const ancestor of ancestorsOf(pathname)) {
    if (!publicRouteSet.has(ancestor)) continue;
    const key = ROUTE_BREADCRUMB_LABEL_KEYS[ancestor as PublicRoute];
    if (!key) continue;
    trail.push({name: translate(key), url: absoluteUrl(localizedPath(locale, ancestor))});
  }
  trail.push({name: translate(own), url: absoluteUrl(localizedPath(locale, pathname))});
  return trail;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/route-breadcrumbs.test.ts`
Expected: PASS, 5 tests.

If the URL assertions fail on host, check what `absoluteUrl` resolves to in the test
environment and use that host in the expectations rather than changing `absoluteUrl`.

- [ ] **Step 6: Commit**

```bash
git add lib/seo/route-breadcrumbs.ts tests/unit/route-breadcrumbs.test.ts messages/en.json messages/zh-HK.json
git commit -F - <<'MSG'
feat(seo): one authority for static route breadcrumb trails

Reuses Navigation.links for the 18 routes the header already names, so
staff keep one vocabulary rather than two that drift. The label map is
held equal to publicRoutes by test: a route without a label throws
MISSING_MESSAGE at request time, which is how /admin/page-copy went down
in both locales earlier today.

Ancestors that are not themselves public routes are skipped, not linked.
/programs is the case that matters: only /programs/<name> exists, and a
breadcrumb pointing at a 404 is worse than a shorter trail.
MSG
```

---

## Task 2: Render breadcrumbs on every static public page

**Files:**
- Modify: 21 page files under `app/[locale]/(public)/` (every `publicRoutes` member except `/`)
- Test: `tests/unit/breadcrumb-coverage.test.ts` (create)

A server layout cannot read the pathname in the App Router, so this is per page. Coverage is
enforced by a discovery test instead — the same enforcement style as
`tests/unit/repository-boundary.test.ts`.

- [ ] **Step 1: Write the failing discovery test**

Create `tests/unit/breadcrumb-coverage.test.ts`:

```ts
import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {publicRoutes} from "@/config/public-routes";

const PUBLIC_DIR = join("app", "[locale]", "(public)");

/** The page file backing a static public route. */
function pageFileFor(route: string): string {
  return route === "/" ? join(PUBLIC_DIR, "page.tsx") : join(PUBLIC_DIR, ...route.split("/").filter(Boolean), "page.tsx");
}

describe("breadcrumb coverage", () => {
  it.each(publicRoutes.filter((route) => route !== "/"))(
    "%s renders the shared breadcrumb",
    (route) => {
      // Per page because a server layout cannot read the pathname. That makes drift the
      // real risk, so it is this test -- not a single render site -- that guarantees
      // coverage. A new public route fails here until it opts in.
      const source = readFileSync(pageFileFor(route), "utf8");
      expect(source, `${route} must call routeBreadcrumbItems`).toContain("routeBreadcrumbItems");
      expect(source, `${route} must render the trail`).toContain("buildBreadcrumbData");
    },
  );

  it("does not put a trail on the home page, which is the root of every other trail", () => {
    const source = readFileSync(pageFileFor("/"), "utf8");
    expect(source).not.toContain("routeBreadcrumbItems");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/breadcrumb-coverage.test.ts`
Expected: FAIL — 21 cases failing with "must call routeBreadcrumbItems".

If a case fails with `ENOENT` instead, that route's page lives at a path `pageFileFor` does
not predict. Fix `pageFileFor` for that route rather than skipping the route.

- [ ] **Step 3: Add the trail to each page**

For **every** static public route except `/`, add these imports:

```ts
import {StructuredData} from "@/components/seo/structured-data";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";
```

If the page does not already have a root-scoped translator, add one next to its existing
`getTranslations` call. Note the **absence** of a `namespace` — the label keys are fully
qualified (`Navigation.links.about`), so the translator must be unscoped:

```ts
const tRoot = await getTranslations({locale});
```

Several pages already render a **visual** breadcrumb — `about/chairman/page.tsx:41` passes a
`breadcrumb={{homeHref, homeLabel, current}}` prop to `PageHero`. That is presentation for a
reader; this is JSON-LD for a crawler. Add the structured data **alongside** it; do not remove
or refactor the visual one.

Then render the trail as the last child of the page's returned fragment, mirroring
`app/[locale]/(public)/members/[slug]/page.tsx:124-128`:

```tsx
<StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale, "/about/chairman", tRoot))} />
```

Replace `"/about/chairman"` with that page's own route. If the page returns a single element
rather than a fragment, wrap it in `<>…</>` first.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/breadcrumb-coverage.test.ts tests/unit/route-breadcrumbs.test.ts tests/unit/locale-href-boundary.test.ts`
Expected: PASS all three. The locale boundary test is included deliberately: it is the guard
against a hand-built `/zh-HK/…` creeping into any of the 21 edits.

- [ ] **Step 5: Verify the whole suite and the string audit**

Run: `npm run audit:strings && npx vitest run && npm run typecheck`
Expected: PASS. No new visible literals were added, so `audit:strings` must stay clean.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(public)" tests/unit/breadcrumb-coverage.test.ts
git commit -F - <<'MSG'
feat(seo): BreadcrumbList on every static public page

Per page rather than in the (public) layout, because a server layout
cannot read the pathname in the App Router. usePathname would mean a
client component for non-interactive markup, against this project's
convention, and injecting the path from proxy.ts would couple SEO markup
to auth middleware.

That makes drift the real risk, so coverage is enforced by a discovery
test over publicRoutes: a new public route fails until it opts in.
MSG
```

---

## Task 3: Article JSON-LD on news

**Files:**
- Modify: `lib/structured-data.ts`, `components/seo/structured-data.tsx`
- Modify: `app/[locale]/(public)/news/[slug]/page.tsx`
- Test: `tests/unit/structured-data-article.test.ts` (create)

`posts` carries no image column, so `Article.image` is deliberately omitted rather than
pointed at a placeholder — a fabricated image URL in structured data is worse than none.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/structured-data-article.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {buildArticleData} from "@/lib/structured-data";

describe("buildArticleData", () => {
  it("describes a news post with its canonical url, dates and publisher", () => {
    const data = buildArticleData({
      slug: "wtia-signs-gba-mou",
      title: "WTIA signs GBA memorandum",
      description: "A summary of the agreement.",
      publishedAt: new Date("2026-03-04T02:00:00Z"),
      updatedAt: new Date("2026-03-06T09:30:00Z"),
      author: "WTIA Secretariat",
    }, "en");

    expect(data["@type"]).toBe("Article");
    expect(data.headline).toBe("WTIA signs GBA memorandum");
    expect(data.datePublished).toBe("2026-03-04T02:00:00.000Z");
    expect(data.dateModified).toBe("2026-03-06T09:30:00.000Z");
    expect(data.mainEntityOfPage).toBe("https://hkwtia.vercel.app/news/wtia-signs-gba-mou");
    expect(data.author).toEqual({"@type": "Person", name: "WTIA Secretariat"});
  });

  it("omits image entirely rather than inventing one", () => {
    const data = buildArticleData({
      slug: "s", title: "t", description: "d",
      publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: null, author: null,
    }, "en");

    // `posts` has no image column. A placeholder url in structured data is a claim to a
    // crawler that something exists when it does not.
    expect("image" in data).toBe(false);
  });

  it("falls back to the published date when a post was never edited", () => {
    const data = buildArticleData({
      slug: "s", title: "t", description: "d",
      publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: null, author: null,
    }, "en");

    expect(data.dateModified).toBe("2026-01-01T00:00:00.000Z");
  });

  it("points a Chinese article at its /zh url", () => {
    const data = buildArticleData({
      slug: "s", title: "t", description: "d",
      publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: null, author: null,
    }, "zh-HK");

    expect(data.mainEntityOfPage).toBe("https://hkwtia.vercel.app/zh/news/s");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/structured-data-article.test.ts`
Expected: FAIL — `buildArticleData is not a function`.

- [ ] **Step 3: Write the builder**

In `lib/structured-data.ts`, add `Article` to the `schema-dts` type import on line 1, then
append:

```ts
export type ArticleRecord = Readonly<{
  slug: string;
  title: string;
  description: string;
  publishedAt: Date;
  updatedAt: Date | null;
  author: string | null;
}>;

/**
 * `Article` for a news post.
 *
 * `image` is deliberately absent: `posts` has no image column, and a placeholder url here
 * would tell a crawler something exists when it does not. The og:image route still gives
 * these pages a share card -- that is a rendered fallback, not a claim about stored media.
 */
export function buildArticleData(record: ArticleRecord, locale: AppLocale): WithContext<Article> {
  const url = absoluteUrl(localizedPath(locale, `/news/${record.slug}`));
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: record.title,
    description: record.description,
    datePublished: record.publishedAt.toISOString(),
    // A post that was never edited is unmodified, not undated.
    dateModified: (record.updatedAt ?? record.publishedAt).toISOString(),
    mainEntityOfPage: url,
    url,
    inLanguage: locale === 'en' ? 'en-HK' : 'zh-HK',
    ...(record.author ? {author: {'@type': 'Person' as const, name: record.author}} : {}),
    publisher: buildOrganizationData(),
  };
}
```

- [ ] **Step 4: Widen the component union**

In `components/seo/structured-data.tsx`, add `Article` to both the type import and the union:

```tsx
import type {Article, BreadcrumbList, Event, FAQPage, Organization, SoftwareApplication, WebSite, WithContext} from 'schema-dts';

type StructuredDataProps = {
  data: WithContext<Organization | FAQPage | Event | SoftwareApplication | WebSite | BreadcrumbList | Article>;
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/structured-data-article.test.ts && npm run typecheck`
Expected: PASS, 4 tests; typecheck silent.

- [ ] **Step 6: Render it on the news detail page**

In `app/[locale]/(public)/news/[slug]/page.tsx`, import `StructuredData` and `buildArticleData`,
then render it in the returned markup using the already-resolved post. The page resolves a post
via `publishedPost(appLocale, slug)` — reuse that value; do not fetch again.

```tsx
<StructuredData data={buildArticleData({
  slug: parsed,
  title: news.title,
  description: news.summary,
  publishedAt: news.publishedAt,
  updatedAt: news.updatedAt ?? null,
  author: news.author ?? null,
}, locale)} />
```

Match the field names the page's own record actually exposes — read the type before writing
this, and adjust the right-hand sides if they differ. Do not change `ArticleRecord` to match a
different shape; map at the call site.

- [ ] **Step 7: Run the gate**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/structured-data.ts components/seo/structured-data.tsx "app/[locale]/(public)/news/[slug]/page.tsx" tests/unit/structured-data-article.test.ts
git commit -F - <<'MSG'
feat(seo): Article structured data on news posts

image is omitted rather than defaulted: posts has no image column, and a
placeholder url in structured data claims to a crawler that something
exists when it does not. dateModified falls back to datePublished,
because a post that was never edited is unmodified rather than undated.
MSG
```

---

## Task 4: Person JSON-LD on the chairman page — DECLINED, DO NOT IMPLEMENT

**Status: declined by the owner on 2026-09-13. Skip this task entirely and move to Task 5.**

The site does not store the chairman's name. The `Chairman` namespace holds `metaTitle`,
`metaDescription`, `eyebrow`, `title`, `summary`, `messageTitle`, `message`, `signature` — and
`signature` is `"Chairman, WTIA"` / `"WTIA 主席"`, a **role**, not a name.

`Person` structured data requires a real `name`. Inventing one, deriving it from the page's
prose, or scraping it from the legacy WordPress site would publish a fabricated claim about a
real individual under WTIA's own domain. That is not a gap to work around.

To reinstate later: add `Chairman.personName` to both message bundles, then build
`buildPersonData(record, locale)` returning `WithContext<Person>` with `name`, `jobTitle` from
`signature`, `url` from `localizedPath(locale, "/about/chairman")`, and `affiliation` reusing
`buildOrganizationData()`.

---

## Task 5: EventSeries JSON-LD on programme pages

**Files:**
- Modify: `lib/structured-data.ts`, `components/seo/structured-data.tsx`
- Modify: `app/[locale]/(public)/programs/cpai/page.tsx`, `…/hkict/page.tsx`, `…/tct/page.tsx`, `…/asa/page.tsx`
- Test: `tests/unit/structured-data-event-series.test.ts` (create)

The four programmes are recurring award and event series — `EventSeries` is the type that says
"this runs repeatedly" rather than `Event`, which would claim a single dated occurrence.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/structured-data-event-series.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {buildEventSeriesData} from "@/lib/structured-data";

describe("buildEventSeriesData", () => {
  it("describes a programme as a recurring series, not a single occurrence", () => {
    const data = buildEventSeriesData({
      key: "hkict",
      name: "Hong Kong ICT Awards",
      description: "An annual awards programme.",
    }, "en");

    // EventSeries, not Event: these recur, and Event would claim one dated occurrence.
    expect(data["@type"]).toBe("EventSeries");
    expect(data.name).toBe("Hong Kong ICT Awards");
    expect(data.url).toBe("https://hkwtia.vercel.app/programs/hkict");
    expect((data.organizer as {"@type": string})["@type"]).toBe("Organization");
  });

  it("points the Chinese page at its /zh url", () => {
    const data = buildEventSeriesData({key: "asa", name: "n", description: "d"}, "zh-HK");

    expect(data.url).toBe("https://hkwtia.vercel.app/zh/programs/asa");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/structured-data-event-series.test.ts`
Expected: FAIL — `buildEventSeriesData is not a function`.

- [ ] **Step 3: Write the builder**

Add `EventSeries` to the `schema-dts` import, then append to `lib/structured-data.ts`:

```ts
export type EventSeriesRecord = Readonly<{
  key: 'cpai' | 'hkict' | 'tct' | 'asa';
  name: string;
  description: string;
}>;

/**
 * `EventSeries` for a programme.
 *
 * Not `Event`: these are recurring award and event programmes, and `Event` would assert a
 * single dated occurrence that the page does not describe. Individual editions remain
 * `Event`, built by `buildEventData`.
 */
export function buildEventSeriesData(
  record: EventSeriesRecord,
  locale: AppLocale,
): WithContext<EventSeries> {
  return {
    '@context': 'https://schema.org',
    '@type': 'EventSeries',
    name: record.name,
    description: record.description,
    url: absoluteUrl(localizedPath(locale, `/programs/${record.key}`)),
    organizer: buildOrganizationData(),
  };
}
```

- [ ] **Step 4: Widen the union**

In `components/seo/structured-data.tsx`, add `EventSeries` to the type import and the union.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/structured-data-event-series.test.ts && npm run typecheck`
Expected: PASS, 2 tests.

- [ ] **Step 6: Render it on all four programme pages**

On each of the four pages, pass that programme's own key and its existing translated name and
description. Read each page for the message keys it already uses for its title and summary.

Each programme's copy lives at `programs.<key>` with exactly these fields: `title`,
`description`, `status`, `audience`. So with the page's translator scoped to its own
programme namespace:

```tsx
<StructuredData data={buildEventSeriesData({
  key: "hkict",
  name: t("title"),
  description: t("description"),
}, locale)} />
```

Change only the `key` per page: `cpai`, `hkict`, `tct`, `asa`. If a page's translator is
scoped differently, use its existing scope rather than adding a second `getTranslations` call.

- [ ] **Step 7: Run the gate**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run audit:strings`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/structured-data.ts components/seo/structured-data.tsx "app/[locale]/(public)/programs" tests/unit/structured-data-event-series.test.ts
git commit -F - <<'MSG'
feat(seo): EventSeries structured data on the four programme pages

EventSeries rather than Event: these recur, and Event would assert one
dated occurrence the page does not describe. Individual editions stay
Event, via buildEventData.
MSG
```

---

## Task 6: Publish all 51 history milestones

**Files:**
- Modify: `app/sitemap.ts:87`
- Modify: `app/[locale]/(public)/about/history/[slug]/page.tsx:21`
- Test: `tests/unit/sitemap-milestones.test.ts` (extend)

Today both use `featuredOnly(milestonesOnly(…))`, so 6 of 51 milestones have a page and a
sitemap entry. They are consistent *by coincidence of both saying the same thing*, and nothing
enforces it. Changing one without the other publishes 45 URLs that 404.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/sitemap-milestones.test.ts`, inside its existing top-level `describe`:

```ts
  it("lists every milestone, and gives every listed milestone a page", async () => {
    const {milestones} = await import("@/content/milestones");
    const {milestonesOnly} = await import("@/lib/history/milestones");
    const all = milestonesOnly(milestones);

    // 51 milestones exist; only 6 were `featured`. The other 45 are real, bilingual,
    // 25-year association history rescued from the WordPress archive.
    expect(all.length).toBeGreaterThan(6);

    const entries = await sitemap();
    for (const milestone of all) {
      const url = `/about/history/${milestone.slug}`;
      expect(
        entries.some((entry) => entry.url.endsWith(url)),
        `${url} missing from sitemap`,
      ).toBe(true);
    }
  });

  it("keeps the sitemap and the route on the same filter", async () => {
    // These drifting apart is the actual failure mode: filtering the sitemap more widely
    // than generateStaticParams publishes urls that 404, which is worse than omitting
    // them. Read as source so the coupling is asserted, not assumed.
    const {readFileSync} = await import("node:fs");
    const route = readFileSync("app/[locale]/(public)/about/history/[slug]/page.tsx", "utf8");
    const sitemapSource = readFileSync("app/sitemap.ts", "utf8");

    const filterOf = (source: string) => /featuredOnly\(milestonesOnly\(/.test(source) ? "featured" : "all";
    expect(filterOf(route)).toBe(filterOf(sitemapSource));
  });
```

If the file's existing `sitemap()` import is named differently, match it rather than adding a
second import.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sitemap-milestones.test.ts`
Expected: FAIL — the first new test reports a missing `/about/history/<slug>` for each
non-featured milestone.

- [ ] **Step 3: Change both filters together**

In `app/sitemap.ts`, change:

```ts
  const milestoneEntries = featuredOnly(milestonesOnly(milestones))
```

to:

```ts
  // Every milestone, not only the featured six: these are 25 years of association
  // history, already bilingual, and they are the largest body of indexable content the
  // site has. Must stay in lockstep with generateStaticParams in the history route --
  // a sitemap wider than the route publishes urls that 404.
  const milestoneEntries = milestonesOnly(milestones)
```

In `app/[locale]/(public)/about/history/[slug]/page.tsx`, change:

```ts
  return featuredOnly(milestonesOnly(milestones)).map(({slug}) => ({slug}));
```

to:

```ts
  // Lockstep with app/sitemap.ts -- see the comment there.
  return milestonesOnly(milestones).map(({slug}) => ({slug}));
```

Then remove the now-unused `featuredOnly` import from each file **only if** nothing else in
that file uses it. The history route uses it elsewhere for the featured list — check before
deleting.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/sitemap-milestones.test.ts tests/unit/sitemap.test.ts tests/unit/redirects.test.ts`
Expected: PASS all three. `redirects.test.ts` is included because the six legacy
`/about/history/<slug>` destinations must still resolve.

- [ ] **Step 5: Confirm the pages actually build**

Run: `npm run build`
Expected: `Compiled successfully`, and the route manifest shows `/[locale]/about/history/[slug]`
with substantially more prerendered paths than before. Note the build time — the spec predicts
90 new pages (45 × 2 locales) against a current baseline of roughly 15–18 seconds.

- [ ] **Step 6: Commit**

```bash
git add app/sitemap.ts "app/[locale]/(public)/about/history/[slug]/page.tsx" tests/unit/sitemap-milestones.test.ts
git commit -F - <<'MSG'
feat(seo): publish all 51 history milestones, not only the featured six

45 milestones of bilingual association history, rescued from the
WordPress archive, had no page and no sitemap entry. They are the largest
body of indexable content the site has.

The sitemap and generateStaticParams were consistent only by coincidence
of both saying featuredOnly. A test now asserts they share one filter,
because a sitemap wider than the route publishes urls that 404.
MSG
```

---

## Task 7: Decide which og renderer an entity gets

**Files:**
- Create: `lib/og/resolve-renderer.ts`
- Test: `tests/unit/og-resolve-renderer.test.ts` (create)

All of the og decision logic lives here, as a pure function, because `next/og` emits PNG bytes
that cannot be meaningfully asserted on. This is the part that can be tested properly.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/og-resolve-renderer.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {resolveOgRenderer} from "@/lib/og/resolve-renderer";

describe("resolveOgRenderer", () => {
  it("gives an event with a hero image the photo treatment", () => {
    const resolved = resolveOgRenderer({
      kind: "event", title: "Hong Kong ICT Awards 2026", imageUrl: "https://cdn.example/hero.jpg", eyebrow: "Event",
    });

    expect(resolved.renderer).toBe("photo");
    expect(resolved.props.imageUrl).toBe("https://cdn.example/hero.jpg");
  });

  it("falls back to editorial for an event with no hero image", () => {
    // events.heroMediaId is nullable, so this is the ordinary case, not the exception.
    const resolved = resolveOgRenderer({kind: "event", title: "t", imageUrl: null, eyebrow: "Event"});

    expect(resolved.renderer).toBe("editorial");
  });

  it.each(["member", "showcase"] as const)("puts a %s logo on a light ground, never under a scrim", (kind) => {
    const resolved = resolveOgRenderer({kind, title: "Acme Wireless Ltd", imageUrl: "https://cdn.example/logo.svg", eyebrow: "Member"});

    // A logo cropped to 1200x630 and darkened mangles the member's mark. Their brand is
    // the thing the directory trades on.
    expect(resolved.renderer).toBe("logo");
  });

  it("falls back to editorial for a member with no logo", () => {
    const resolved = resolveOgRenderer({kind: "member", title: "t", imageUrl: null, eyebrow: "Member"});

    expect(resolved.renderer).toBe("editorial");
  });

  it.each(["news", "programme", "milestone", "page"] as const)("always renders %s editorially", (kind) => {
    // `posts` has no image column at all, so news can never supply one.
    const resolved = resolveOgRenderer({kind, title: "t", imageUrl: null, eyebrow: "News"});

    expect(resolved.renderer).toBe("editorial");
  });

  it("ignores an image supplied for a kind that has no image treatment", () => {
    const resolved = resolveOgRenderer({kind: "news", title: "t", imageUrl: "https://cdn.example/x.jpg", eyebrow: "News"});

    expect(resolved.renderer).toBe("editorial");
    expect("imageUrl" in resolved.props).toBe(false);
  });

  it("truncates a title too long to fit the card rather than overflowing it", () => {
    const resolved = resolveOgRenderer({kind: "news", title: "x".repeat(200), eyebrow: "News", imageUrl: null});

    expect(resolved.props.title.length).toBeLessThanOrEqual(120);
    expect(resolved.props.title.endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/og-resolve-renderer.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/og/resolve-renderer"`.

- [ ] **Step 3: Write the implementation**

Create `lib/og/resolve-renderer.ts`:

```ts
/** Every entity the og route can draw a card for. */
export type OgEntityKind = "event" | "member" | "showcase" | "news" | "programme" | "milestone" | "page";

export type OgEntity = Readonly<{
  kind: OgEntityKind;
  title: string;
  eyebrow: string;
  imageUrl: string | null;
}>;

export type OgRendererName = "photo" | "logo" | "editorial";

export type OgProps = Readonly<{title: string; eyebrow: string; imageUrl?: string}>;

export type ResolvedOgRenderer = Readonly<{renderer: OgRendererName; props: OgProps}>;

/**
 * Satori lays out at a fixed size and will not reflow an over-long headline into
 * something readable, so the title is bounded here rather than in the renderer: the
 * renderers stay presentational, and the bound is testable.
 */
const MAX_TITLE = 120;

function clampTitle(title: string): string {
  return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

/**
 * Which card an entity gets, and with what.
 *
 * The three treatments exist because the entities genuinely differ, not for variety:
 *
 * - `photo` -- an event's own hero behind a scrim. `events.heroMediaId` is nullable, so
 *   this is the lucky case rather than the guaranteed one.
 * - `logo` -- members and showcase listings store a **logo**, not a photograph. Cropped to
 *   1200x630 and darkened under a scrim it would be mangled, and a member's mark is the
 *   thing the directory trades on. Contained on a light ground instead.
 * - `editorial` -- everything else, and every fallback. `posts` has no image column at
 *   all, so news is always here -- on precisely the pages Article JSON-LD targets.
 */
export function resolveOgRenderer(entity: OgEntity): ResolvedOgRenderer {
  const base = {title: clampTitle(entity.title), eyebrow: entity.eyebrow};

  if (entity.imageUrl) {
    if (entity.kind === "event") return {renderer: "photo", props: {...base, imageUrl: entity.imageUrl}};
    if (entity.kind === "member" || entity.kind === "showcase") {
      return {renderer: "logo", props: {...base, imageUrl: entity.imageUrl}};
    }
  }
  // No image, or a kind with no image treatment: the image is dropped rather than passed
  // to a renderer that would not know what to do with it.
  return {renderer: "editorial", props: base};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/og-resolve-renderer.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/og/resolve-renderer.ts tests/unit/og-resolve-renderer.test.ts
git commit -F - <<'MSG'
feat(og): decide the share-card treatment from what an entity can supply

next/og emits PNG bytes that cannot be meaningfully asserted on, so every
decision lives in this pure function and the route stays presentational.

Three treatments because the entities genuinely differ: events may have a
photograph, members and showcase listings have a logo that must not be
cropped and darkened, and posts have no image column at all.
MSG
```

---

## Task 8: The og renderers and the route

**Files:**
- Create: `lib/og/renderers.tsx`, `app/api/og/route.tsx`
- Test: `tests/unit/og-route.test.ts` (create)

**Verify the font first.** `next/og` runs Satori, which needs real font bytes — it cannot use
a CSS variable. Before writing the renderers, find what `--font-serif` resolves to and whether
a `.ttf`/`.woff` for it is loadable at runtime. If it is not, use the system serif stack and
**report that as a concern**; do not silently ship an off-brand card.

- [ ] **Step 1: Establish whether a brand font is available to Satori**

```bash
grep -rn "font-serif\|--font-serif" app/layout.tsx app/[locale]/layout.tsx tailwind.config.ts
ls public/fonts 2>/dev/null || echo "no public/fonts"
```

Record what you find in the commit message. If no font file exists, the renderers use
`serif`/`sans-serif` and the concern is reported at hand-off.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/og-route.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {renderOgCard} from "@/lib/og/renderers";

describe("renderOgCard", () => {
  it.each(["editorial", "logo", "photo"] as const)("returns a 1200x630 element tree for %s", (renderer) => {
    // Asserting on PNG bytes would be brittle theatre. What is worth pinning is that each
    // renderer produces an element at the size every social crawler expects.
    const element = renderOgCard(renderer, {
      title: "Hong Kong ICT Awards 2026",
      eyebrow: "Event",
      imageUrl: "https://cdn.example/x.jpg",
    });

    expect(element).toBeTruthy();
    expect(element.props.style.width).toBe(1200);
    expect(element.props.style.height).toBe(630);
  });

  it("renders the title into the tree so a missing headline is caught here, not by eye", () => {
    const element = renderOgCard("editorial", {title: "A distinctive headline", eyebrow: "News"});

    expect(JSON.stringify(element)).toContain("A distinctive headline");
  });

  it("never darkens a logo, unlike the photo treatment", () => {
    const logo = JSON.stringify(renderOgCard("logo", {title: "Acme", eyebrow: "Member", imageUrl: "u"}));
    const photo = JSON.stringify(renderOgCard("photo", {title: "Acme", eyebrow: "Event", imageUrl: "u"}));

    // The scrim is what would mangle a member's mark.
    expect(photo).toContain("linear-gradient");
    expect(logo).not.toContain("linear-gradient");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/og-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/og/renderers"`.

- [ ] **Step 4: Write the renderers**

Create `lib/og/renderers.tsx`. Satori supports only a subset of CSS — flexbox, no `grid`, no
`gap` shorthand in older versions, and every element needs an explicit `display`. Keep to what
is here.

```tsx
import type {ReactElement} from "react";

import type {OgProps, OgRendererName} from "@/lib/og/resolve-renderer";

// The site's palette, resolved to literals: Satori has no CSS variables.
const BLUE = "#1b4f7a";
const SAND = "#e8cf9a";
const LIGHT = "#f5f5f5";

const FRAME = {width: 1200, height: 630, display: "flex" as const};

/**
 * The three share-card treatments.
 *
 * Presentation only -- which one an entity gets is `resolveOgRenderer`'s decision, and
 * keeping that split is what makes the choice testable at all, since these return trees
 * Satori turns into opaque PNG bytes.
 */
export function renderOgCard(renderer: OgRendererName, props: OgProps): ReactElement {
  if (renderer === "photo") return photoCard(props);
  if (renderer === "logo") return logoCard(props);
  return editorialCard(props);
}

function editorialCard({title, eyebrow}: OgProps): ReactElement {
  return (
    <div style={{...FRAME, flexDirection: "column", justifyContent: "space-between", backgroundColor: BLUE, padding: 72, color: "#ffffff"}}>
      <div style={{display: "flex", fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color: SAND}}>{eyebrow}</div>
      <div style={{display: "flex", flexDirection: "column"}}>
        <div style={{display: "flex", width: 110, height: 4, backgroundColor: SAND, marginBottom: 28}} />
        <div style={{display: "flex", fontFamily: "serif", fontSize: 68, lineHeight: 1.15}}>{title}</div>
      </div>
      <div style={{display: "flex", fontSize: 24, letterSpacing: 3, opacity: 0.75}}>WISETECH HONG KONG</div>
    </div>
  );
}

function logoCard({title, eyebrow, imageUrl}: OgProps): ReactElement {
  // Light ground, contained, undarkened. A member's mark is not a backdrop.
  return (
    <div style={{...FRAME, flexDirection: "column", backgroundColor: LIGHT}}>
      <div style={{display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: 80}}>
        {imageUrl ? <img src={imageUrl} width={520} height={260} style={{objectFit: "contain"}} alt="" /> : <div style={{display: "flex"}} />}
      </div>
      <div style={{display: "flex", flexDirection: "column", backgroundColor: BLUE, padding: "36px 72px", color: "#ffffff"}}>
        <div style={{display: "flex", fontSize: 24, letterSpacing: 6, textTransform: "uppercase", color: SAND}}>{eyebrow}</div>
        <div style={{display: "flex", fontFamily: "serif", fontSize: 52, marginTop: 10}}>{title}</div>
      </div>
    </div>
  );
}

function photoCard({title, eyebrow, imageUrl}: OgProps): ReactElement {
  return (
    <div style={{...FRAME, position: "relative"}}>
      {imageUrl ? <img src={imageUrl} width={1200} height={630} style={{objectFit: "cover"}} alt="" /> : <div style={{display: "flex", width: 1200, height: 630, backgroundColor: BLUE}} />}
      <div style={{display: "flex", position: "absolute", top: 0, left: 0, width: 1200, height: 630, background: "linear-gradient(to top, rgba(27,79,122,0.96) 22%, rgba(27,79,122,0.25) 100%)"}} />
      <div style={{display: "flex", position: "absolute", bottom: 0, left: 0, flexDirection: "column", padding: 72, color: "#ffffff"}}>
        <div style={{display: "flex", fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color: SAND, marginBottom: 14}}>{eyebrow}</div>
        <div style={{display: "flex", fontFamily: "serif", fontSize: 62, lineHeight: 1.15}}>{title}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/og-route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the route**

Create `app/api/og/route.tsx`. Keep it thin — parse, resolve, render:

```tsx
import {ImageResponse} from "next/og";
import {z} from "zod";

import {renderOgCard} from "@/lib/og/renderers";
import {resolveOgRenderer, type OgEntityKind} from "@/lib/og/resolve-renderer";

export const runtime = "edge";

const KINDS = ["event", "member", "showcase", "news", "programme", "milestone", "page"] as const;

// Query parameters are attacker-controlled: the title is drawn into an image served from
// our origin, so it is bounded here as well as in resolveOgRenderer.
const paramsSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(300),
  eyebrow: z.string().trim().min(1).max(60),
  image: z.string().url().max(500).optional(),
}).strict();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
    eyebrow: url.searchParams.get("eyebrow") ?? undefined,
    ...(url.searchParams.get("image") ? {image: url.searchParams.get("image")!} : {}),
  });
  // A bad request must not 500: a crawler that gets an error here drops the card for the
  // page entirely, so fall through to the card that needs nothing.
  const entity = parsed.success
    ? {kind: parsed.data.kind as OgEntityKind, title: parsed.data.title, eyebrow: parsed.data.eyebrow, imageUrl: parsed.data.image ?? null}
    : {kind: "page" as const, title: "WiseTech Hong Kong", eyebrow: "WTIA", imageUrl: null};

  const {renderer, props} = resolveOgRenderer(entity);
  return new ImageResponse(renderOgCard(renderer, props), {width: 1200, height: 630});
}
```

- [ ] **Step 7: Verify the route actually produces an image**

Run: `npm run dev` in one terminal, then in another:

```bash
curl -s -o /tmp/og.png -w "%{http_code} %{content_type} %{size_download}\n" \
  "http://localhost:3000/api/og?kind=news&title=A%20test%20headline&eyebrow=News"
```

Expected: `200 image/png` and a size well over 10000 bytes. Open `/tmp/og.png` and look at
it — this is the one step where the eye is the instrument. Repeat for `kind=event` with an
`&image=` pointing at any reachable https image, and for `kind=member`.

Stop the dev server afterwards.

- [ ] **Step 8: Run the gate and commit**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run build`
Expected: PASS, and the build manifest lists `/api/og`.

```bash
git add lib/og/renderers.tsx app/api/og/route.tsx tests/unit/og-route.test.ts
git commit -F - <<'MSG'
feat(og): render the three share-card treatments at /api/og

The route is thin on purpose: parse, resolve, render. Satori turns these
trees into opaque PNG bytes, so the tests pin the element structure --
size, the headline reaching the tree, and the scrim being absent from the
logo card -- rather than pretending to assert on pixels.

A malformed request falls back to the card that needs nothing instead of
500ing: a crawler that gets an error drops the page's card entirely.
MSG
```

---

## Task 9: Point each page's metadata at its own card

**Files:**
- Modify: `app/[locale]/(public)/news/[slug]/page.tsx`, `events/[slug]/page.tsx`, `members/[slug]/page.tsx`, `showcase/[slug]/page.tsx`, `about/history/[slug]/page.tsx`
- Test: `tests/unit/og-metadata.test.ts` (create)

`buildPageMetadata` already accepts `image` and runs it through `absoluteUrl`, so no helper
changes are needed — each page passes a different value.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/og-metadata.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {ogImagePath} from "@/lib/og/resolve-renderer";

describe("ogImagePath", () => {
  it("builds a card url carrying everything the renderer needs", () => {
    const path = ogImagePath({kind: "news", title: "WTIA signs GBA memorandum", eyebrow: "News", imageUrl: null});

    expect(path.startsWith("/api/og?")).toBe(true);
    const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));
    expect(params.get("kind")).toBe("news");
    expect(params.get("title")).toBe("WTIA signs GBA memorandum");
    expect(params.get("eyebrow")).toBe("News");
    expect(params.has("image")).toBe(false);
  });

  it("carries the image only when there is one", () => {
    const path = ogImagePath({kind: "event", title: "t", eyebrow: "Event", imageUrl: "https://cdn.example/h.jpg"});

    expect(new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("image")).toBe("https://cdn.example/h.jpg");
  });

  it("encodes a title containing an ampersand rather than truncating the query", () => {
    const path = ogImagePath({kind: "news", title: "Tech & Wisdom", eyebrow: "News", imageUrl: null});

    expect(new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("title")).toBe("Tech & Wisdom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/og-metadata.test.ts`
Expected: FAIL — `ogImagePath is not a function`.

- [ ] **Step 3: Add the helper**

Append to `lib/og/resolve-renderer.ts`:

```ts
/**
 * The `/api/og` url for an entity, for `buildPageMetadata`'s `image`.
 *
 * `URLSearchParams` does the encoding: a title containing `&` -- "Tech & Wisdom" is the
 * site's own tagline -- would otherwise cut the query short and lose the eyebrow.
 */
export function ogImagePath(entity: OgEntity): string {
  const params = new URLSearchParams({kind: entity.kind, title: entity.title, eyebrow: entity.eyebrow});
  if (entity.imageUrl) params.set("image", entity.imageUrl);
  return `/api/og?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/og-metadata.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into the five detail pages**

In each page's `generateMetadata`, pass `image: ogImagePath({…})` to `buildPageMetadata`, using
that entity's own kind, title, eyebrow and image. The eyebrow is user-visible text inside an
image, so it must come from the message bundles — **not** a hardcoded English word. Use the
page's existing translator and an existing key where one names the section; if none does, add
one to both bundles in this task.

Example for news:

```ts
image: ogImagePath({kind: "news", title: post.title, eyebrow: t("eyebrow"), imageUrl: null}),
```

For events, pass the resolved hero url or `null`. For members and showcase, pass the logo url
or `null`. For milestones, `kind: "milestone"` with `imageUrl: null`.

- [ ] **Step 6: Run the gate**

Run: `npm run audit:strings && npx vitest run && npm run typecheck && npm run lint && npm run build`
Expected: PASS. If `audit:strings` fails, an eyebrow was hardcoded — move it to the bundles.

- [ ] **Step 7: Commit**

```bash
git add lib/og/resolve-renderer.ts "app/[locale]/(public)" tests/unit/og-metadata.test.ts
git commit -F - <<'MSG'
feat(og): give every detail page its own share card

buildPageMetadata already accepted an image and ran it through
absoluteUrl, so this is a per-page value rather than a helper change.

URLSearchParams does the encoding: "Tech & Wisdom" is the site's own
tagline, and an unencoded ampersand would cut the query short and lose
the eyebrow.
MSG
```

---

## Task 10: Prove the 576 legacy redirects reach real pages

**Files:**
- Create: `scripts/verify-legacy-redirects.mjs`, `scripts/check-legacy-drift.mjs`

`tests/unit/redirects.test.ts` already proves `/event/foo/` *resolves to* `/events`. It does
not prove `/events` answers, and it cannot know what the live WordPress site has published
since the fixture was captured. Both scripts run against live hosts, so neither belongs in the
unit suite — network calls there make suites flaky.

- [ ] **Step 1: Write the replay script**

Create `scripts/verify-legacy-redirects.mjs`:

```js
#!/usr/bin/env node
// Replays every classified legacy url against a running host and asserts each one reaches
// a real page. The unit test proves the redirect *rule* resolves; only this proves the
// destination answers. A redirect to a 404 is still a broken link, and these carry
// twenty-five years of citations.
//
// Usage: node scripts/verify-legacy-redirects.mjs [--host https://hkwtia.vercel.app] [--concurrency 6]

import {readFileSync} from "node:fs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const host = (args.get("host") ?? "https://hkwtia.vercel.app").replace(/\/$/, "");
const concurrency = Number(args.get("concurrency") ?? 6);

const raw = JSON.parse(readFileSync("content/legacy-urls.json", "utf8"));
const entries = Array.isArray(raw) ? raw : (raw.entries ?? raw.urls ?? Object.values(raw).find(Array.isArray));
const paths = [...new Set(entries.map((e) => String(e.from ?? e.source ?? e.url ?? e)).map((u) => u.replace(/^https?:\/\/[^/]+/, "")))].filter((p) => p && p !== "/");

console.log(`Replaying ${paths.length} legacy paths against ${host} (concurrency ${concurrency})`);

const failures = [];
let done = 0;

async function check(path) {
  try {
    const response = await fetch(`${host}${path}`, {redirect: "follow", headers: {"user-agent": "wtia-cutover-verify"}});
    if (!response.ok) failures.push({path, status: response.status, landed: response.url});
  } catch (error) {
    failures.push({path, status: "ERROR", landed: String(error.message).slice(0, 80)});
  }
  if (++done % 50 === 0) console.log(`  ${done}/${paths.length}`);
}

const queue = [...paths];
await Promise.all(Array.from({length: concurrency}, async () => {
  for (let next = queue.pop(); next; next = queue.pop()) await check(next);
}));

if (failures.length === 0) {
  console.log(`\nOK: ${paths.length}/${paths.length} legacy paths reach a 200.`);
  process.exit(0);
}
console.error(`\nFAIL: ${failures.length} of ${paths.length} did not reach a 200:\n`);
for (const f of failures) console.error(`  ${f.status}  ${f.path}  ->  ${f.landed}`);
process.exit(1);
```

- [ ] **Step 2: Run it against production**

Run: `node scripts/verify-legacy-redirects.mjs`
Expected: `OK: 576/576 legacy paths reach a 200.`

If any fail, **do not change the script to pass**. Each failure is a real broken destination
that would break on cutover. Record them and fix the redirect or the destination page.

- [ ] **Step 3: Write the drift script**

Create `scripts/check-legacy-drift.mjs`:

```js
#!/usr/bin/env node
// Diffs the live WordPress sitemaps against content/legacy-urls.json.
//
// The fixture was captured once; hkwtia.org is still live and still publishing. Shapes
// covered by a pattern rule in next.config.ts (/event/, /author/, /category/, ...) are
// drift-proof by construction -- a new event matches /event/:path* whether or not it was
// captured. The literal entries are not, so a page published since capture would have no
// rule and would 404 the moment DNS moves.
//
// Usage: node scripts/check-legacy-drift.mjs [--wordpress https://hkwtia.org]

import {readFileSync} from "node:fs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const wordpress = (args.get("wordpress") ?? "https://hkwtia.org").replace(/\/$/, "");

// Must match legacyPatternRedirects in next.config.ts.
const PATTERN_PREFIXES = ["/event/", "/faq-items/", "/faq_category/", "/author/", "/category/", "/element_category/"];
const coveredByPattern = (path) => PATTERN_PREFIXES.some((prefix) => path.startsWith(prefix));

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

async function fetchText(url) {
  const response = await fetch(url, {headers: {"user-agent": "wtia-cutover-drift"}});
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.text();
}

const index = await fetchText(`${wordpress}/sitemap.xml`);
const subSitemaps = locs(index).filter((u) => u.endsWith(".xml"));
console.log(`Reading ${subSitemaps.length} sub-sitemaps from ${wordpress}`);

const live = new Set();
for (const sub of subSitemaps) {
  try {
    for (const url of locs(await fetchText(sub))) live.add(url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/");
  } catch (error) {
    console.warn(`  skipped ${sub}: ${error.message}`);
  }
}

const raw = JSON.parse(readFileSync("content/legacy-urls.json", "utf8"));
const entries = Array.isArray(raw) ? raw : (raw.entries ?? raw.urls ?? Object.values(raw).find(Array.isArray));
const captured = new Set(entries.map((e) => String(e.from ?? e.source ?? e.url ?? e).replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/"));

const gaps = [...live].filter((path) => path !== "/" && !captured.has(path) && !coveredByPattern(path));

console.log(`\nlive urls        : ${live.size}`);
console.log(`captured         : ${captured.size}`);
console.log(`uncovered literals: ${gaps.length}`);

if (gaps.length === 0) {
  console.log("\nOK: every live url is either captured or covered by a pattern rule.");
  process.exit(0);
}
console.error("\nThese live urls have no redirect and would 404 on cutover:\n");
for (const gap of gaps.sort()) console.error(`  ${gap}`);
process.exit(1);
```

- [ ] **Step 4: Run it**

Run: `node scripts/check-legacy-drift.mjs`
Expected: `OK: every live url is either captured or covered by a pattern rule.`

If gaps are reported, each is a real page published since capture. Add it to
`content/legacy-urls.json` with a reviewed destination and re-run `npx vitest run
tests/unit/redirects.test.ts` — do not weaken the script.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-legacy-redirects.mjs scripts/check-legacy-drift.mjs
git commit -F - <<'MSG'
feat(cutover): prove the legacy redirects reach real pages, and detect drift

redirects.test.ts proves /event/foo/ resolves to /events. It does not
prove /events answers, and it cannot know what hkwtia.org has published
since the fixture was captured. A redirect to a 404 is still a broken
link, and these carry twenty-five years of citations.

Both run against live hosts and so stay out of the unit suite: network
calls there make suites flaky.

Pattern-covered shapes are drift-proof by construction; the literal
entries are not, which is what the drift check is actually looking for.
MSG
```

---

## Task 11: The cutover runbook

**Files:**
- Create: `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md`
- Modify: `next.config.ts`

The `hkwtia.vercel.app` → `hkwtia.org` redirect must not fire before DNS moves, or it sends
every visitor to a WordPress site that no longer expects them. Gate it on the configured host.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/redirects.test.ts`, inside the existing `describe("legacy redirects", …)`:

```ts
  it("does not redirect the vercel host away until the site url says the cutover happened", async () => {
    // Shipping this rule unconditionally would send every visitor to a WordPress site that
    // no longer expects them, and there would be no way back except a deploy.
    const source = (await import("node:fs")).readFileSync("next.config.ts", "utf8");

    expect(source).toContain("hkwtia.org");
    // The rule must be inside a conditional keyed on the configured site url.
    expect(/NEXT_PUBLIC_SITE_URL|siteUrl/.test(source)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/redirects.test.ts`
Expected: FAIL — `next.config.ts` does not yet mention `hkwtia.org`.

- [ ] **Step 3: Add the host-gated redirect**

In `next.config.ts`, inside the existing `redirects()` function, append:

```ts
  // Only once NEXT_PUBLIC_SITE_URL says the cutover has happened. Shipped unconditionally
  // this would send every visitor to a WordPress site that no longer expects them, with no
  // way back except a deploy. Gated, it is inert until the env var flips and instant when
  // it does.
  const cutoverDone = (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("hkwtia.org");
  const hostRedirects = cutoverDone
    ? [{
        source: "/:path*",
        has: [{type: "host" as const, value: "hkwtia.vercel.app"}],
        destination: "https://hkwtia.org/:path*",
        permanent: true,
      }]
    : [];
```

Include `...hostRedirects` in the returned array.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/redirects.test.ts && npm run build`
Expected: PASS, and the build succeeds with the env var unset (the rule is inert).

- [ ] **Step 5: Write the runbook**

Create `docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md`:

```markdown
# hkwtia.org cutover runbook

Spec: `docs/superpowers/specs/2026-09-13-phase-d-public-surface-design.md`.
**Owner-executed.** Nothing here is automated, and nothing here touches the WordPress site,
which stays serveable throughout and is the rollback.

## Before the window

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Legacy destinations answer | `node scripts/verify-legacy-redirects.mjs` | `OK: 576/576` |
| 2 | No drift since capture | `node scripts/check-legacy-drift.mjs` | `OK: every live url …` |
| 3 | Suite green | `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build` | all pass |
| 4 | Production serves the intended commit | `npx vercel inspect https://hkwtia.vercel.app --scope ynwaforevers-projects` | `githubCommitSha` matches `main` |

Do not start the window unless all four pass.

## The window

1. **Vercel env.** Set `NEXT_PUBLIC_SITE_URL=https://hkwtia.org` for Production. This alone
   changes canonicals, `og:url` and the sitemap host, and arms the `hkwtia.vercel.app` → 308.
2. **Redeploy and promote.** The env var is read at build time, so a redeploy is required;
   merging alone builds only a Preview in this project. Promote explicitly and confirm with
   `vercel inspect` that the alias carries the intended `githubCommitSha`.
3. **Add the domain in Vercel.** Project → Domains → add `hkwtia.org` and `www.hkwtia.org`.
   Vercel will state the required DNS records.
4. **Cloudflare DNS.** Point the apex and `www` at Vercel as instructed. Keep the previous
   record values written down before changing them — that note is the rollback.
5. **Verify, in this order:**
   - `curl -sI https://hkwtia.org/ | head -1` → `200`
   - `curl -sI https://hkwtia.vercel.app/ | head -1` → `308`, `location: https://hkwtia.org/`
   - `curl -s https://hkwtia.org/sitemap.xml | grep -c "<loc>"` → well over 500
   - `curl -s https://hkwtia.org/ | grep canonical` → `https://hkwtia.org`
   - `node scripts/verify-legacy-redirects.mjs --host https://hkwtia.org` → `OK: 576/576`
6. **Google Search Console.** Add `hkwtia.org` as a property if the existing Site Kit property
   is not reusable, submit `https://hkwtia.org/sitemap.xml`, and use Change of Address only if
   the property is genuinely moving rather than being replaced in place.

## Rollback

Any step failing verification:

1. Restore the Cloudflare DNS records from the note taken in step 4. The WordPress site is
   untouched and resumes serving.
2. Unset `NEXT_PUBLIC_SITE_URL` (or set it back to the vercel.app host) and redeploy. The
   `hkwtia.vercel.app` → 308 is gated on that value and goes inert with it.

Rollback is DNS plus one env var. Nothing in this phase is destructive.

## After

- Re-run `node scripts/check-legacy-drift.mjs --wordpress https://hkwtia.org` once WordPress is
  retired, to confirm no URL was left behind.
- Watch GSC coverage for a crawl cycle. A rise in "crawled, not indexed" on `/about/history/*`
  is expected initially — 45 of those pages are newly published.
```

- [ ] **Step 6: Run the full gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit and open the PR**

```bash
git add next.config.ts docs/integration/2026-09-13-hkwtia-org-cutover-runbook.md tests/unit/redirects.test.ts
git commit -F - <<'MSG'
feat(cutover): host-gated vercel.app redirect and an owner runbook

The redirect is gated on NEXT_PUBLIC_SITE_URL naming hkwtia.org.
Unconditional, it would send every visitor to a WordPress site that no
longer expects them, with no way back except a deploy.

The runbook is owner-executed and does not touch the WordPress site,
which stays serveable throughout and is itself the rollback: DNS records
restored from the note taken before changing them, plus one env var.
MSG

git push -u origin HEAD
gh pr create --base main --title "Phase D public surface: structured data, share cards, every milestone, cutover proof" --body "Implements docs/superpowers/plans/2026-09-13-phase-d-public-surface.md. The DNS move itself remains the owner's action; this PR prepares and proves it."
```

---

## Verification checklist

Against the spec's §7 Definition of done:

| # | Done when | Task |
|---|---|---|
| 1 | `Article`, `EventSeries`, `BreadcrumbList` render where they should, coverage test passing | 1–3, 5 (`Person`/Task 4 declined) |
| 2 | `/api/og` returns a correct image per kind, member logos undarkened and contained | 7–9 |
| 3 | All 51 milestones have pages and sitemap entries, route and sitemap on one filter | 6 |
| 4 | Replay reports 576/576 reaching 200; drift reports zero uncovered literals | 10 |
| 5 | An owner-executable runbook exists, with rollback | 11 |

Not in scope, not claimed: the DNS move, any change to the WordPress site, the four acceptance
walks, weekly LHCI, and the GSC cross-reference.
