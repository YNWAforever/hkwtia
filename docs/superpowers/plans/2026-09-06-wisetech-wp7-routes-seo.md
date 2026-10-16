# WP-7 — Route, redirect, SEO and manifest amendments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every donor `merge` path a real redirect, un-retire `/partners` and `/programmes` as real pages, finish the public SEO surface (titles, `x-default`, `noindex`), and record the manifest amendments with their validator fixtures and parity document — all as pre-approved by the master plan's WP-7 section.

**Architecture:** A pure generator (`config/wisetech-redirects.ts`) derives `next.config.ts` rules from the manifest so the two can never drift. Two new public pages reuse existing read models (`partnersRepository.listPublished`, `summarizeProgrammes`) and the `wt` primitives; the home programme grid is extracted into a shared presentational component. Manifest and inventory flip two rows from `retire` to `retain` in the same commit as the parity doc. SEO changes are additive (`x-default`, layout-level `robots`, `robots.ts` disallow) plus a message-bundle title rewrite.

**Design:** `docs/superpowers/specs/2026-09-06-wisetech-wp7-routes-seo-design.md` (decisions D-1…D-8). Master plan: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §5 WP-7, Appendix D (E-5, E-19, E-21).

**Tech Stack:** Next.js 16 App Router (Webpack), React 19, TypeScript strict, next-intl v4 (`en`, `zh-HK` at `/zh`), Vitest + Testing Library, Playwright.

**Conventions every task follows:**
- Worktree `C:\Users\laich\Documents\hkwtia\.claude\worktrees\wt-wp7-routes-seo`, branch `worktree-wt-wp7-routes-seo`. Never `cd` elsewhere.
- Files are kebab-case; every user-visible string goes into both `messages/en.json` and `messages/zh-HK.json`; `<Link href>` takes locale-neutral paths (`@/i18n/navigation`'s `Link` prefixes `/zh` itself) — never hand-build a `/zh-HK/` path.
- `next dev`/`next build` rewrite `AGENTS.md` and `next-env.d.ts`; run `git status` before every commit and `git checkout -- AGENTS.md next-env.d.ts` if they show. Never stage `package-lock.json` unless you ran `npm install`.
- The donor tree is read-only evidence (`git show f91ecc5:app/<file>`); never import from it.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Task 1: Redirect generator and `next.config.ts` wiring

**Files:**
- Create: `config/wisetech-redirects.ts`
- Modify: `next.config.ts`, `config/wisetech-integration-manifest.ts` (lines 1–4: alias import → relative import), `tests/unit/redirects.test.ts`
- Test: `tests/unit/wisetech-redirects.test.ts`
- Regression: `tests/unit/redirects.test.ts`, `tests/unit/wisetech-route-parity.test.ts`

Background: the manifest classifies 51 donor sitemap routes and a further set of dispatcher patterns as `merge` (they conceptually fold into an hkwtia page). Today nothing serves them, so every old design link 404s. `next.config.ts` cannot import through the `@/` alias (Next's config loader does not apply `tsconfig` paths), so the whole import chain from `next.config.ts` must be relative.

- [ ] **Step 1: Write the failing test**

`tests/unit/wisetech-redirects.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import legacyUrls from "@/content/legacy-urls.json";
import {publicRoutes} from "@/config/public-routes";
import {authoritativeSourceInventory} from "@/config/wisetech-authoritative-source-inventory";
import {wisetechDesignRedirects} from "@/config/wisetech-redirects";

const explicitSources = ["/projects", "/history", "/members", "/members/:id"];
const rules = wisetechDesignRedirects(explicitSources);
const bySource = new Map(rules.map((rule) => [rule.source, rule]));
const toPattern = (path: string) => path.replace(/\[([^/\]]+)\]/g, ":$1");

// Dispatcher rows whose source already IS the canonical page (identity) or whose source is
// covered by a pre-existing explicit rule (design D-8). Everything else that is `merge` must
// produce a rule.
const identityDispatcher = new Set([
  "/events/[slug]", "/portal/profile", "/portal/company", "/portal/directory",
  "/portal/events", "/portal/documents", "/portal/billing",
]);
const explicitCollision = new Set(["/members/[slug]"]);

describe("wisetechDesignRedirects", () => {
  it("covers all 51 merge donor sitemap routes, three sources each", () => {
    const merges = authoritativeSourceInventory.sitemapRoutes.filter(({disposition}) => disposition === "merge");
    expect(merges).toHaveLength(51);
    for (const row of merges) {
      const source = toPattern(row.sourcePath);
      for (const prefix of ["", "/en", "/zh"]) {
        expect(bySource.has(`${prefix}${source}`), `${prefix}${source}`).toBe(true);
      }
    }
  });

  it("covers every merge dispatcher pattern except identities and explicit collisions", () => {
    const merges = authoritativeSourceInventory.dispatcherOnlyRoutes.filter(({disposition}) => disposition === "merge");
    expect(merges.length).toBeGreaterThan(0);
    for (const row of merges) {
      const source = toPattern(row.sourcePath);
      const expected = !identityDispatcher.has(row.sourcePath) && !explicitCollision.has(row.sourcePath);
      expect(bySource.has(source), row.sourcePath).toBe(expected);
    }
    expect(bySource.get("/join/success")?.destination).toBe("/join/complete");
    expect(bySource.get("/portal/seats")?.destination).toBe("/portal/company/seats");
    expect(bySource.get("/portal/solution")?.destination).toBe("/portal/company/listing");
    expect(bySource.get("/solutions/:slug")?.destination).toBe("/showcase/:slug");
    expect(bySource.get("/insights/:slug")?.destination).toBe("/news/:slug");
    expect(bySource.get("/programmes/hkict")?.destination).toBe("/programs/hkict");
  });

  it("targets the canonical's static prefix when the source cannot supply a param (D-7)", () => {
    expect(bySource.get("/request-introduction")?.destination).toBe("/showcase");
    expect(bySource.get("/events/asia-smart-innovation-awards-summit-2025")?.destination).toBe("/events");
    expect(bySource.get("/zh/events/smart-innovation-meets-genai")?.destination).toBe("/zh/events");
  });

  it("prefixes the zh destination and leaves the en destination unprefixed (D-6)", () => {
    expect(bySource.get("/why-wisetech")?.destination).toBe("/about");
    expect(bySource.get("/en/why-wisetech")?.destination).toBe("/about");
    expect(bySource.get("/zh/why-wisetech")?.destination).toBe("/zh/about");
    expect(bySource.get("/zh/members/:slug")).toBeUndefined();
  });

  it("is temporary, self-free, sorted and frozen", () => {
    for (const rule of rules) {
      expect(rule.permanent, rule.source).toBe(false);
      expect(rule.source, rule.source).not.toBe(rule.destination);
    }
    expect(rules.map(({source}) => source)).toEqual([...rules.map(({source}) => source)].sort((a, b) => a.localeCompare(b)));
    expect(Object.isFrozen(rules)).toBe(true);
    expect(rules.every((rule) => Object.isFrozen(rule))).toBe(true);
  });

  it("never shadows a live public route or a classified legacy url", () => {
    const legacySources = new Set(legacyUrls.entries.map(({from}) => (from.length > 1 && from.endsWith("/") ? from.slice(0, -1) : from)));
    for (const rule of rules) {
      expect(publicRoutes, rule.source).not.toContain(rule.source);
      expect(legacySources.has(rule.source), rule.source).toBe(false);
    }
  });

  it("is spread into next.config after the explicit rules and before the legacy rules", async () => {
    const configured = ((await nextConfig.redirects?.()) ?? []) as {source: string; destination: string; permanent: boolean}[];
    const sources = configured.map(({source}) => source);
    const firstGenerated = sources.indexOf(rules[0]!.source);
    const lastExplicit = Math.max(...explicitSources.map((source) => sources.indexOf(source)));
    const firstLegacy = sources.indexOf("/event/:path*");
    expect(firstGenerated).toBeGreaterThan(lastExplicit);
    expect(firstGenerated).toBeLessThan(firstLegacy);
    expect(configured.find(({source}) => source === "/zh/about/leadership")).toEqual({source: "/zh/about/leadership", destination: "/zh/about/chairman", permanent: false});
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wisetech-redirects.test.ts`
Expected: FAIL — `@/config/wisetech-redirects` does not exist.

- [ ] **Step 3: Make the manifest's import chain alias-free**

In `config/wisetech-integration-manifest.ts` change lines 1–4 from
```ts
import {
  authoritativeSourceInventory,
  reportedArchiveIdentity,
} from "@/config/wisetech-authoritative-source-inventory";
```
to
```ts
// Relative, not `@/`: next.config.ts imports config/wisetech-redirects.ts, which imports this
// file, and Next's config loader does not apply tsconfig paths.
import {
  authoritativeSourceInventory,
  reportedArchiveIdentity,
} from "./wisetech-authoritative-source-inventory";
```

- [ ] **Step 4: Implement the generator**

`config/wisetech-redirects.ts`:

```ts
import {wisetechIntegrationManifest} from "./wisetech-integration-manifest";

/**
 * Real redirects for every route the integration manifest classifies as `merge`: the donor
 * design's own paths (and the chatgpt.site sitemap that still lists them) resolve on this domain
 * instead of 404ing. Generated from the manifest so a disposition change can never leave a stale
 * rule behind. Design: docs/superpowers/specs/2026-09-06-wisetech-wp7-routes-seo-design.md §4.1.
 *
 * Three sources per rule (D-6): the donor served `/en/*` and `/zh/*`. `/zh/<x>` must be matched
 * here because the next-intl proxy would otherwise rewrite it to a `zh-HK` page that does not
 * exist; `/en/<x>` is matched so the rule fires before the proxy rather than depending on the
 * proxy's default-locale strip. `permanent: false` (D-5): these are design paths, not the
 * hkwtia.org legacy urls in content/legacy-urls.json, which keep their 308s.
 */
export type WisetechRedirect = Readonly<{source: string; destination: string; permanent: false}>;

const localePrefixes = [
  {source: "", destination: ""},
  {source: "/en", destination: ""},
  {source: "/zh", destination: "/zh"},
] as const;

function toNextPattern(path: string): string {
  return path.replace(/\[([^/\]]+)\]/g, ":$1");
}

function paramNames(pattern: string): ReadonlySet<string> {
  return new Set([...pattern.matchAll(/:([^/]+)/g)].map((match) => match[1]!));
}

/** `/members/:id` and `/members/[slug]` are the same shape; explicit rules win (D-8). */
function shape(path: string): string {
  return toNextPattern(path).replace(/:[^/]+/g, ":p");
}

/** Cut the destination at the first param the source cannot supply (D-7). */
function resolveDestination(source: string, canonicalPath: string): string {
  const supplied = paramNames(source);
  const segments = toNextPattern(canonicalPath).split("/");
  const cut = segments.findIndex((segment) => segment.startsWith(":") && !supplied.has(segment.slice(1)));
  const kept = cut === -1 ? segments : segments.slice(0, cut);
  const joined = kept.join("/");
  return joined === "" ? "/" : joined;
}

function prefixed(prefix: string, path: string): string {
  return path === "/" ? (prefix === "" ? "/" : prefix) : `${prefix}${path}`;
}

export function wisetechDesignRedirects(explicitSources: readonly string[]): readonly WisetechRedirect[] {
  const explicit = new Set(explicitSources.map(shape));
  const rules: WisetechRedirect[] = [];

  for (const entry of wisetechIntegrationManifest) {
    if (entry.kind !== "route" || entry.disposition !== "merge" || !entry.source.startsWith("/")) continue;
    if (typeof entry.canonicalPath !== "string") {
      // A merge without a destination is a manifest bug: fail the build, never drop the rule.
      throw new Error(`WISETECH_REDIRECT_MISSING_CANONICAL:${entry.id}`);
    }
    const source = toNextPattern(entry.source);
    if (shape(source) === shape(entry.canonicalPath)) continue;
    if (explicit.has(shape(source))) continue;
    const destination = resolveDestination(source, entry.canonicalPath);
    if (destination === source) continue;
    for (const prefix of localePrefixes) {
      rules.push({
        source: prefixed(prefix.source, source),
        destination: prefixed(prefix.destination, destination),
        permanent: false,
      });
    }
  }

  rules.sort((a, b) => a.source.localeCompare(b.source));
  return Object.freeze(rules.map((rule) => Object.freeze(rule)));
}
```

- [ ] **Step 5: Wire it into `next.config.ts`**

Add the import after the `legacyUrls` import:
```ts
import {wisetechDesignRedirects} from "./config/wisetech-redirects";
```

Replace the `redirects()` method (lines 155–164) with:
```ts
  async redirects() {
    // The four explicit rules pre-date the programme and stay as they are; the WiseTech design
    // rules are generated from the manifest (config/wisetech-redirects.ts) and go before the
    // hkwtia.org legacy list so a design path is never swallowed by a legacy pattern.
    const explicitRedirects = [
      {source: "/projects", destination: "/programs/asa", permanent: true},
      {source: "/history", destination: "/about", permanent: true},
      {source: "/members", destination: "/showcase", permanent: false},
      {source: "/members/:id", destination: "/showcase", permanent: false},
    ];
    return [
      ...explicitRedirects,
      ...wisetechDesignRedirects(explicitRedirects.map(({source}) => source)),
      ...legacyPatternRedirects,
      ...legacyLiteralRedirects,
    ];
  },
```

- [ ] **Step 6: Update `tests/unit/redirects.test.ts`**

Its "makes every legacy rule permanent so link equity transfers" test filters out only the four pre-existing rules; the generated rules are temporary by design. Change that test to:
```ts
  it("makes every legacy rule permanent so link equity transfers", async () => {
    const redirects = await getRedirects();
    const preExisting = new Set(["/projects", "/history", "/members", "/members/:id"]);
    // WiseTech design paths are 307s by design (config/wisetech-redirects.ts, D-5); only the
    // hkwtia.org legacy urls carry link equity worth a 308.
    const generated = new Set(wisetechDesignRedirects([...preExisting]).map(({source}) => source));
    const legacyRules = redirects.filter(({source}) => !preExisting.has(source) && !generated.has(source));

    expect(legacyRules.length).toBeGreaterThan(0);
    for (const redirect of legacyRules) {
      expect(redirect.permanent, redirect.source).toBe(true);
    }
  });
```
and add `import {wisetechDesignRedirects} from "@/config/wisetech-redirects";` to its imports.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wisetech-redirects.test.ts tests/unit/redirects.test.ts tests/unit/wisetech-route-parity.test.ts`
Expected: PASS. (The parity validator only checks `redirect`-disposition entries against `next.config`, and only requires a `merge` entry's canonical to be backed by a page — both still hold.)

- [ ] **Step 8: Prove the config loader resolves the chain**

Run: `npx tsc --noEmit` — clean.
Run: `npm run build` — must complete; a failure mentioning `@/config/...` means an alias import survived in the chain (`config/wisetech-redirects.ts` → `config/wisetech-integration-manifest.ts` → `config/wisetech-authoritative-source-inventory.ts`). Then `git checkout -- AGENTS.md next-env.d.ts`.

- [ ] **Step 9: Commit**

```bash
git add config/wisetech-redirects.ts config/wisetech-integration-manifest.ts next.config.ts tests/unit/wisetech-redirects.test.ts tests/unit/redirects.test.ts
git commit -m "$(cat <<'EOF'
feat: generate real redirects for every WiseTech merge route from the manifest

config/wisetech-redirects.ts derives 307 rules from the integration
manifest's merge entries -- all 51 donor sitemap routes plus the merge
dispatcher patterns -- so the donor's own paths (and the chatgpt.site
sitemap that still lists them) resolve here instead of 404ing. Three
sources per rule because the donor served /en/* and /zh/*; a static
source that merges into a dynamic page goes to that page's static prefix;
a source an explicit rule already covers yields to it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shared `ProgrammeGrid` and `firstYear` in the programme summaries

**Files:**
- Create: `components/marketing/programme-grid.tsx`
- Modify: `components/home/programme-showcase.tsx`, `lib/home/programme-summaries.ts`
- Test: `tests/unit/programme-grid.test.tsx`, `tests/unit/programme-summaries.test.ts` (extend)
- Regression: `tests/unit/home-programme-showcase.test.tsx`, `tests/unit/homepage.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/programme-grid.test.tsx`:
```tsx
import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import {ProgrammeGrid} from "@/components/marketing/programme-grid";

const summaries = [
  {id: "cpai" as const, namespace: "programs.cpai", image: "/images/projects-hero.jpg", type: "credential" as const, editionCount: null, latestYear: null, firstYear: null},
  {id: "hkict" as const, namespace: "programs.hkict", image: "/images/projects-hero.jpg", type: "event-series" as const, editionCount: 6, latestYear: 2025, firstYear: 2020},
];
const labels = {
  eventSeriesLabel: "Event series",
  credentialLabel: "Credential",
  credentialFact: "Issued directly by WTIA",
  editionsFact: (count: number, year: number) => `${count} editions since ${year}`,
  action: "View programme",
  items: {
    cpai: {name: "CPAI", description: "Applied innovation."},
    hkict: {name: "HKICT Awards", description: "Recognising excellence."},
    tct: {name: "TCT", description: "Connecting."},
    asa: {name: "ASA", description: "Celebrating."},
  },
};

describe("ProgrammeGrid", () => {
  it("renders one card per summary, the first as .feature, with the typed facts", () => {
    render(<ProgrammeGrid summaries={summaries} labels={labels} />);
    const cards = document.querySelectorAll(".programme-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass("feature");
    expect(screen.getByRole("heading", {name: "CPAI"}).closest("article")!.textContent).toContain("Issued directly by WTIA");
    expect(screen.getByRole("heading", {name: "HKICT Awards"}).closest("article")!.textContent).toContain("6 editions since 2020");
    expect(screen.getByRole("heading", {name: "CPAI"}).closest("article")!.querySelector("a")).toHaveAttribute("href", "/programs/cpai");
  });
});
```

Extend `tests/unit/programme-summaries.test.ts` — add inside the existing `it` after the `asaSummary` assertions:
```ts
    expect(cpai.firstYear).toBeNull();
    expect(hkictSummary.firstYear).toBe(Math.min(...hkict.editions.map((edition) => edition.year)));
    expect(tctSummary.firstYear).toBe(Math.min(...tct.editions.map((edition) => edition.year)));
    expect(asaSummary.firstYear).toBe(Math.min(...asa.editions.map((edition) => edition.yearStart)));
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/programme-grid.test.tsx tests/unit/programme-summaries.test.ts`
Expected: FAIL — module missing; `firstYear` undefined.

- [ ] **Step 3: Add `firstYear` to the summaries**

In `lib/home/programme-summaries.ts` add `firstYear: number | null;` to `ProgrammeSummary` after `latestYear`, and rewrite the function body:
```ts
    if (record.id === 'cpai') {
      return {...record, type: 'credential', editionCount: null, latestYear: null, firstYear: null};
    }
    if (record.id === 'hkict') {
      const years = hkict.editions.map((edition) => edition.year);
      return {...record, type: 'event-series', editionCount: hkict.editions.length, latestYear: Math.max(...years), firstYear: Math.min(...years)};
    }
    if (record.id === 'tct') {
      const years = tct.editions.map((edition) => edition.year);
      return {...record, type: 'event-series', editionCount: tct.editions.length, latestYear: Math.max(...years), firstYear: Math.min(...years)};
    }
    const years = asa.editions.map((edition) => edition.yearStart);
    return {...record, type: 'event-series', editionCount: asa.editions.length, latestYear: Math.max(...years), firstYear: Math.min(...years)};
```

- [ ] **Step 4: Extract the grid**

`components/marketing/programme-grid.tsx`:
```tsx
import {Arrow} from '@/components/wt/arrow';
import {CardIndex} from '@/components/wt/card-index';
import {StatusLabel} from '@/components/wt/status-label';
import {Link} from '@/i18n/navigation';
import type {ProgrammeSummary} from '@/lib/home/programme-summaries';

export type ProgrammeGridLabels = Readonly<{
  eventSeriesLabel: string;
  credentialLabel: string;
  credentialFact: string;
  editionsFact: (count: number, year: number) => string;
  action: string;
  items: Readonly<Record<ProgrammeSummary['id'], Readonly<{name: string; description: string}>>>;
}>;

// The donor's .programme-grid (app/styles/wisetech.css:216-225), shared by home section 8 and
// /programmes so the two can never drift. A plain <Link> is used for the CTA rather than
// ActionLink: `.programme-card>a` styles a bare child anchor directly.
export function ProgrammeGrid({summaries, labels}: Readonly<{summaries: readonly ProgrammeSummary[]; labels: ProgrammeGridLabels}>) {
  return (
    <div className="programme-grid">
      {summaries.map((programme, index) => (
        <article className={index === 0 ? 'programme-card feature' : 'programme-card'} key={programme.id}>
          <div>
            <StatusLabel>{programme.type === 'credential' ? labels.credentialLabel : labels.eventSeriesLabel}</StatusLabel>
            <CardIndex index={index + 1} />
          </div>
          <h3>{labels.items[programme.id].name}</h3>
          <p>{labels.items[programme.id].description}</p>
          <small>
            {programme.type === 'credential'
              ? labels.credentialFact
              : labels.editionsFact(programme.editionCount ?? 0, programme.latestYear ?? 0)}
          </small>
          <Link href={`/programs/${programme.id}`}>{labels.action} <Arrow /></Link>
        </article>
      ))}
    </div>
  );
}
```

Rewrite `components/home/programme-showcase.tsx` to compose it (identical output to today):
```tsx
import {getTranslations} from 'next-intl/server';

import {ProgrammeGrid} from '@/components/marketing/programme-grid';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';

// Section 8 of 13. The grid itself lives in components/marketing/programme-grid.tsx since WP-7,
// shared with /programmes.
export async function ProgrammeShowcase({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.programmeShowcase'});
  const summaries = summarizeProgrammes();

  return (
    <Section labelledBy="programme-showcase-title" id="programmes">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="programme-showcase-title" variant="split" lead={t('intro')} />
      <ProgrammeGrid
        summaries={summaries}
        labels={{
          eventSeriesLabel: t('eventSeriesLabel'),
          credentialLabel: t('credentialLabel'),
          credentialFact: t('credentialFact'),
          editionsFact: (count, year) => t('editionsFact', {count, year}),
          action: t('action'),
          items: {
            cpai: {name: t('items.cpai.name'), description: t('items.cpai.description')},
            hkict: {name: t('items.hkict.name'), description: t('items.hkict.description')},
            tct: {name: t('items.tct.name'), description: t('items.tct.description')},
            asa: {name: t('items.asa.name'), description: t('items.asa.description')},
          },
        }}
      />
    </Section>
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/programme-grid.test.tsx tests/unit/programme-summaries.test.ts tests/unit/home-programme-showcase.test.tsx tests/unit/homepage.test.tsx`
Expected: PASS, the two regression files unmodified. `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add components/marketing/programme-grid.tsx components/home/programme-showcase.tsx lib/home/programme-summaries.ts tests/unit/programme-grid.test.tsx tests/unit/programme-summaries.test.ts
git commit -m "$(cat <<'EOF'
refactor: extract the programme grid for reuse by the /programmes index

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/programmes` typed index

**Files:**
- Create: `app/[locale]/(public)/programmes/page.tsx`
- Modify: `config/public-routes.ts`, `lib/i18n/page-copy-scope.ts`, `messages/en.json`, `messages/zh-HK.json`, `tests/unit/page-copy-scope.test.ts`
- Test: `tests/unit/wt-pages/programmes-page.test.tsx`
- Regression: `tests/unit/seo-routes.test.ts`, `tests/unit/page-copy-scope.test.ts`, `tests/unit/messages.test.ts`, `tests/unit/public-landmark-contract.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/wt-pages/programmes-page.test.tsx` — copy the `bundles`, `messageAt` and `resolveIcuPlural` helpers and the `next-intl/server` mock from `tests/unit/home-programme-showcase.test.tsx` verbatim (adding `setRequestLocale: vi.fn()` to the mock object and `within` to the Testing Library import), mock `@/i18n/navigation`'s `Link` as an `<a>` the same way, then:
```tsx
import {siteConfig} from "@/config/site";

describe("ProgrammesPage", () => {
  it("renders the hero, three groupings, the four typed programme cards and the honest applications state", async () => {
    const {default: ProgrammesPage} = await import("@/app/[locale]/(public)/programmes/page");
    render(await ProgrammesPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: bundles.en.Programmes.hero.title})).toBeInTheDocument();
    const groupings = within(screen.getByRole("navigation", {name: bundles.en.Programmes.groupings.label})).getAllByRole("link");
    expect(groupings.map((link) => link.getAttribute("href"))).toEqual(["#catalogue", "#launchpad", "#history"]);
    expect(document.querySelectorAll(".programme-card")).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent(bundles.en.Programmes.open.emptyTitle);
    expect(screen.getByRole("link", {name: new RegExp(bundles.en.Programmes.open.action)})).toHaveAttribute("href", `mailto:${siteConfig.contact.email}?subject=Programme%20enquiry`);
    expect(screen.getByRole("link", {name: new RegExp(bundles.en.Programmes.launchpad.action)})).toHaveAttribute("href", "/launchpad");
  });

  it("lists each programme's recorded edition span in the history section", async () => {
    const {default: ProgrammesPage} = await import("@/app/[locale]/(public)/programmes/page");
    render(await ProgrammesPage({params: Promise.resolve({locale: "en"})}));
    const history = document.querySelector("#history")!;
    expect(within(history as HTMLElement).getAllByRole("listitem")).toHaveLength(4);
    expect(history.textContent).toContain("2020–2025");
    expect(history.textContent).toContain(bundles.en.Programmes.history.credential);
  });

  it("builds indexable bilingual metadata", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/programmes/page");
    const metadata = await generateMetadata({params: Promise.resolve({locale: "zh-HK"})});
    expect(metadata.title).toBe(bundles["zh-HK"].Programmes.metaTitle);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/zh/programmes");
    expect(metadata.robots).toBeUndefined();
  });
});
```
(`2020–2025` is HKICT's real first and latest edition years from `content/programs/hkict.ts`; the separator is an en dash.)

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wt-pages/programmes-page.test.tsx`
Expected: FAIL — page and `Programmes` namespace missing.

- [ ] **Step 3: Add the route and messages**

`config/public-routes.ts`: insert `'/programmes',` after `'/programs/asa',` and `'/partners',` after `'/contact',` (Task 5 adds the `/partners` page; adding both routes now keeps `PublicRoute` stable across both tasks — the sitemap will list `/partners` one task early, which is a sitemap entry only).

`lib/i18n/page-copy-scope.ts`: add `"Programmes",` and `"Partners",` after `"AiTransparency",` in `pageCopyNamespaces`, and `Programmes: ["/programmes"],` / `Partners: ["/partners"],` after `AiTransparency:` in `pageCopyRoutes`.

`messages/en.json` — add a top-level `"Programmes"` namespace immediately after the `"programs"` namespace's closing brace:
```json
  "Programmes": {
    "metaTitle": "Programmes | WiseTech Hong Kong",
    "metaDescription": "WTIA's programmes and awards on the record: Tech to Connect, Asia Smart App Awards, HKICT Awards and CPAI, with their editions, funders and where each leads next.",
    "hero": {
      "eyebrow": "Programmes",
      "title": "Programmes that turn participation into progress.",
      "lead": "Explore awards, learning, market-access and industry-development programmes across the WiseTech ecosystem, each one backed by WTIA's own typed record.",
      "breadcrumbCurrent": "Programmes"
    },
    "groupings": {
      "label": "Programme groupings",
      "catalogue": "Programme catalogue",
      "launchpad": "Market access",
      "history": "Programme history"
    },
    "open": {
      "eyebrow": "Programme catalogue",
      "title": "Find a programme that moves you forward.",
      "intro": "Browse by purpose, audience and previous editions. Applications open through each programme's own page or through a Launch Pad cohort, never through this index.",
      "statusLabel": "Open applications",
      "emptyTitle": "No programme applications are open on this site.",
      "emptyCopy": "Ask the programme team for upcoming editions, eligibility and key dates.",
      "action": "Ask the programme team",
      "mailSubject": "Programme enquiry"
    },
    "catalogue": {
      "eyebrow": "Catalogue",
      "title": "Four programmes with a record behind them.",
      "intro": "Each card is read from the typed programme record; the edition counts are computed from it, never typed in."
    },
    "launchpad": {
      "eyebrow": "Market access",
      "title": "Launch Pad is the cohort-backed route into the Greater Bay Area.",
      "copy": "Cohorts publish on their own page with real dates, and an application form appears only while a cohort is open.",
      "action": "Explore Launch Pad"
    },
    "history": {
      "eyebrow": "Programme history",
      "title": "Built on programmes with lasting value.",
      "intro": "Every edition WTIA's archive records, from the first to the latest, with new programme information added as it becomes available.",
      "span": "{first}–{latest}",
      "editions": "{count, plural, one {# recorded edition} other {# recorded editions}}",
      "credential": "Credential issued directly by WTIA; no editions to record.",
      "events": "View related activities",
      "partner": "Become a programme partner"
    }
  },
```

`messages/zh-HK.json` — the same keys, immediately after its `"programs"` namespace:
```json
  "Programmes": {
    "metaTitle": "計劃總覽｜WiseTech Hong Kong",
    "metaDescription": "WTIA 計劃及獎項的正式紀錄：Tech to Connect、亞洲智能應用程式大獎、香港資訊及通訊科技獎與 CPAI，包括歷屆內容、資助機構及下一步。",
    "hero": {
      "eyebrow": "計劃",
      "title": "把參與轉化為進步的計劃。",
      "lead": "探索 WiseTech 生態系統的獎項、學習、市場拓展及產業發展計劃，每項均以 WTIA 自身的結構化紀錄為依據。",
      "breadcrumbCurrent": "計劃總覽"
    },
    "groupings": {
      "label": "計劃分組",
      "catalogue": "計劃目錄",
      "launchpad": "市場拓展",
      "history": "計劃歷史"
    },
    "open": {
      "eyebrow": "計劃目錄",
      "title": "尋找推動你向前的計劃。",
      "intro": "按目的、受眾及歷屆內容瀏覽。申請只會透過各計劃專頁或創科起動的開放梯隊進行，不會經由此總覽頁。",
      "statusLabel": "開放申請",
      "emptyTitle": "本網站目前沒有開放申請的計劃。",
      "emptyCopy": "歡迎向計劃團隊查詢新一屆內容、參加資格及重要日期。",
      "action": "聯絡計劃團隊",
      "mailSubject": "計劃查詢"
    },
    "catalogue": {
      "eyebrow": "目錄",
      "title": "四項有紀錄可依的計劃。",
      "intro": "每張卡片均讀取自結構化計劃紀錄；屆數由紀錄計算得出，並非人手輸入。"
    },
    "launchpad": {
      "eyebrow": "市場拓展",
      "title": "創科起動是以梯隊為本、進入大灣區的路徑。",
      "copy": "各梯隊在其專頁公布真實日期，申請表格只在梯隊開放期間出現。",
      "action": "探索創科起動"
    },
    "history": {
      "eyebrow": "計劃歷史",
      "title": "承接具長遠價值的計劃經驗。",
      "intro": "WTIA 檔案所記錄的每一屆，由首屆到最新一屆；新計劃資訊將陸續加入。",
      "span": "{first}–{latest}",
      "editions": "{count} 屆紀錄",
      "credential": "由 WTIA 直接頒發的專業資格，沒有屆數紀錄。",
      "events": "查看相關活動",
      "partner": "成為計劃夥伴"
    }
  },
```

- [ ] **Step 4: Write the page**

`app/[locale]/(public)/programmes/page.tsx`:
```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ProgrammeGrid} from '@/components/marketing/programme-grid';
import {ActionLink} from '@/components/wt/action-link';
import {Arrow} from '@/components/wt/arrow';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {siteConfig} from '@/config/site';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';
import {buildPageMetadata} from '@/lib/metadata';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Programmes'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/programmes', title: t('metaTitle'), description: t('metaDescription')});
}

// The typed index the manifest retired for want of one (route-design-programmes, WP-7): four
// records from content/programs/index.ts, the cohort-backed Launch Pad, and the archive's edition
// spans. Nothing here is a count or a date typed by hand -- summarizeProgrammes() reads them.
export default async function ProgrammesPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common, home] = await Promise.all([
    getTranslations({locale, namespace: 'Programmes'}),
    getTranslations({locale, namespace: 'Common'}),
    getTranslations({locale, namespace: 'Home.programmeShowcase'}),
  ]);
  const summaries = summarizeProgrammes();
  const mailto = `mailto:${siteConfig.contact.email}?subject=${encodeURIComponent(t('open.mailSubject'))}`;
  const groupings = [
    {id: 'catalogue', label: t('groupings.catalogue')},
    {id: 'launchpad', label: t('groupings.launchpad')},
    {id: 'history', label: t('groupings.history')},
  ] as const;

  return (
    <>
      <PageHero
        eyebrow={t('hero.eyebrow')}
        title={t('hero.title')}
        lead={t('hero.lead')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('hero.breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <Section id="open" labelledBy="programmes-open-title">
        <SectionHeading variant="inner" eyebrow={t('open.eyebrow')} title={t('open.title')} headingId="programmes-open-title" lead={t('open.intro')} />
        <nav className="programme-groupings" aria-label={t('groupings.label')}>
          {groupings.map((grouping, index) => (
            <a href={`#${grouping.id}`} key={grouping.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {grouping.label}
              <Arrow />
            </a>
          ))}
        </nav>
        <HonestEmpty variant="inner" label={t('open.statusLabel')} title={t('open.emptyTitle')} copy={t('open.emptyCopy')} actions={[{href: mailto, label: t('open.action')}]} />
      </Section>
      <Section id="catalogue" labelledBy="programmes-catalogue-title">
        <SectionHeading variant="split" eyebrow={t('catalogue.eyebrow')} title={t('catalogue.title')} headingId="programmes-catalogue-title" lead={t('catalogue.intro')} />
        <ProgrammeGrid
          summaries={summaries}
          labels={{
            eventSeriesLabel: home('eventSeriesLabel'),
            credentialLabel: home('credentialLabel'),
            credentialFact: home('credentialFact'),
            editionsFact: (count, year) => home('editionsFact', {count, year}),
            action: home('action'),
            items: {
              cpai: {name: home('items.cpai.name'), description: home('items.cpai.description')},
              hkict: {name: home('items.hkict.name'), description: home('items.hkict.description')},
              tct: {name: home('items.tct.name'), description: home('items.tct.description')},
              asa: {name: home('items.asa.name'), description: home('items.asa.description')},
            },
          }}
        />
      </Section>
      <Section id="launchpad" tone="bright" labelledBy="programmes-launchpad-title">
        <SectionHeading variant="inner" eyebrow={t('launchpad.eyebrow')} title={t('launchpad.title')} headingId="programmes-launchpad-title" lead={t('launchpad.copy')} />
        <div className="directory-actions">
          <ActionLink href="/launchpad" variant="button-dark">{t('launchpad.action')}</ActionLink>
        </div>
      </Section>
      <Section id="history" labelledBy="programmes-history-title">
        <SectionHeading variant="inner" eyebrow={t('history.eyebrow')} title={t('history.title')} headingId="programmes-history-title" lead={t('history.intro')} />
        <ul className="programme-groupings">
          {summaries.map((programme, index) => (
            <li key={programme.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <b>{home(`items.${programme.id}.name`)}</b>
              {programme.type === 'credential' || programme.firstYear === null || programme.latestYear === null ? (
                <span>{t('history.credential')}</span>
              ) : (
                <span>{t('history.span', {first: programme.firstYear, latest: programme.latestYear})} · {t('history.editions', {count: programme.editionCount ?? 0})}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="directory-actions">
          <ActionLink href="/events" variant="button-dark">{t('history.events')}</ActionLink>
          <ActionLink href="/contact" variant="text-link">{t('history.partner')}</ActionLink>
        </div>
      </Section>
    </>
  );
}
```
If `npm run audit:strings` flags the ` · ` separator between the two `t()` calls, move it into the `span` message (`"{first}–{latest} · "`) in both bundles and drop the literal.

- [ ] **Step 5: Update the page-copy sizes**

Run `npx vitest run tests/unit/page-copy-scope.test.ts`; it fails on the `sizes` expectation. Add `Programmes: <n>,` with the real count the failure prints (every leaf under the namespace; arrays count as one leaf) and the comment `// WP-7 Task 3: the /programmes index copy.`; raise the total by `n`. `Partners` is added in Task 5.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wt-pages/programmes-page.test.tsx tests/unit/page-copy-scope.test.ts tests/unit/seo-routes.test.ts tests/unit/messages.test.ts tests/unit/public-landmark-contract.test.ts`
Expected: PASS. `npm run audit:strings` passes. `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(public)/programmes/page.tsx" config/public-routes.ts lib/i18n/page-copy-scope.ts messages/en.json messages/zh-HK.json tests/unit/page-copy-scope.test.ts tests/unit/wt-pages/programmes-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: add /programmes, the typed programme index the manifest retired for want of one

Four cards from content/programs/index.ts through the shared grid, the
cohort-backed Launch Pad as the market-access grouping, and the archive's
edition spans; applications stay honest (none open here) and point at the
programme team. The donor's seven marketing groupings had no data behind
them and are not ported.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Relationship window on the public partner projection

**Files:**
- Modify: `lib/db/repos/partners.ts` (`PartnerProjection` type, line 32; the `rows.map` at the end of `listPublishedPartners`, line 55)
- Test: `tests/unit/partner-public-url-projection.test.ts` (extend — read it first; it builds `PublicPartnerRow` fixtures and calls `listPublishedPartners` with an array source)
- Regression: `tests/unit/legacy-network-groups.test.ts`, `tests/unit/home-legacy-network.test.tsx`, `tests/unit/partner-rereview-regressions.test.ts`, `tests/unit/m6-contracts.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/partner-public-url-projection.test.ts`, reusing its existing `row(websiteUrl)` fixture (the rows share a name, so the projection's tie-break is the id — give the second row a later id to keep the order deterministic):
```ts
  it("projects the relationship window as ISO date strings or null", async () => {
    const windowed: PublicPartnerRow = {...row("https://example.com/"), relationshipStartsOn: "2019-03-01", relationshipEndsOn: null};
    const open: PublicPartnerRow = {...row("https://example.com/"), id: "44444444-4444-4444-8444-444444444444"};
    const rows = await listPublishedPartners("en", {asOf: now}, [windowed, open]);
    expect(rows.map(({relationshipStartsOn, relationshipEndsOn}) => [relationshipStartsOn, relationshipEndsOn]))
      .toEqual([["2019-03-01", null], [null, null]]);
  });
```
The dates are `date` columns (`lib/db/schema-core.ts:826-827`), which Drizzle returns as `YYYY-MM-DD` strings — the same strings `publicSource()` compares against `hkDate(now)`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/partner-public-url-projection.test.ts`
Expected: FAIL — the projection has no such fields.

- [ ] **Step 3: Extend the projection**

`PartnerProjection` (line 32) gains `relationshipStartsOn: string | null; relationshipEndsOn: string | null;` after `featured: boolean`. In the final `rows.map` of `listPublishedPartners` add `relationshipStartsOn: row.relationshipStartsOn, relationshipEndsOn: row.relationshipEndsOn` after `featured: row.featured`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/partner-public-url-projection.test.ts tests/unit/legacy-network-groups.test.ts tests/unit/home-legacy-network.test.tsx tests/unit/partner-rereview-regressions.test.ts tests/unit/m6-contracts.test.ts`
Expected: PASS; `npx tsc --noEmit` clean (any fixture typed as `PartnerProjection` elsewhere now needs the two fields — `tsc` names them; add `relationshipStartsOn: null, relationshipEndsOn: null` to each).

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/partners.ts tests/unit/partner-public-url-projection.test.ts
git commit -m "$(cat <<'EOF'
feat: expose the relationship window on the public partner projection

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```
(Add any test fixture files `tsc` made you touch.)

---

## Task 5: `/partners` page

**Files:**
- Create: `app/[locale]/(public)/partners/page.tsx`, `lib/partners/public-groups.ts`
- Modify: `components/home/legacy-network.tsx` (two `href="/about"` → `/partners`), `messages/en.json`, `messages/zh-HK.json`, `tests/unit/page-copy-scope.test.ts`, `tests/unit/image-render-policy.test.ts`, `tests/unit/home-legacy-network.test.tsx`
- Test: `tests/unit/partners-public-groups.test.ts`, `tests/unit/wt-pages/partners-page.test.tsx`
- Regression: `tests/unit/homepage.test.tsx`, `tests/unit/messages.test.ts`, `tests/unit/public-landmark-contract.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/partners-public-groups.test.ts`:
```ts
import {describe, expect, it} from "vitest";

import {groupPublishedPartners, partnerCategoryOrder} from "@/lib/partners/public-groups";

const partner = (id: string, category: "supporting" | "regional" | "media" | "programme" | "sponsor") => ({
  id, name: `Partner ${id}`, category, websiteUrl: null, logoUrl: "/media/x.png", logoAlt: "x", displayOrder: 1, featured: false,
  relationshipStartsOn: null, relationshipEndsOn: null,
});

describe("groupPublishedPartners", () => {
  it("keeps the fixed category order and drops empty categories", () => {
    const groups = groupPublishedPartners([partner("1", "media"), partner("2", "supporting"), partner("3", "media")]);
    expect(partnerCategoryOrder).toEqual(["supporting", "regional", "media", "programme", "sponsor"]);
    expect(groups.map(({category, partners}) => [category, partners.length])).toEqual([["supporting", 1], ["media", 2]]);
  });

  it("returns no groups for no partners", () => {
    expect(groupPublishedPartners([])).toEqual([]);
  });
});
```

`tests/unit/wt-pages/partners-page.test.tsx` — the same `bundles`/`messageAt`/`resolveIcuPlural` helpers and `next-intl/server` mock (with `setRequestLocale`) as Task 3's test, plus:
```tsx
const listPublished = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished}}));
vi.mock("@/lib/media/url", () => ({isPrivateMediaDeliveryUrl: () => false}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

type Category = "supporting" | "regional" | "media" | "programme" | "sponsor";
const row = (id: string, category: Category, extra: Partial<{websiteUrl: string | null; relationshipStartsOn: string | null; relationshipEndsOn: string | null}> = {}) => ({
  id, name: `Partner ${id}`, category, websiteUrl: null, logoUrl: "/media/logo.png", logoAlt: `Partner ${id} logo`, displayOrder: 1, featured: false,
  relationshipStartsOn: null, relationshipEndsOn: null, ...extra,
});

describe("PartnersPage", () => {
  beforeEach(() => listPublished.mockReset());

  it("groups published records by category with live counts and prints each record's status", async () => {
    listPublished.mockResolvedValue([
      row("1", "supporting", {websiteUrl: "https://example.org", relationshipStartsOn: "2019-03-01"}),
      row("2", "supporting"),
      row("3", "media", {relationshipStartsOn: "2021-01-01", relationshipEndsOn: "2027-12-31"}),
    ]);
    const {default: PartnersPage} = await import("@/app/[locale]/(public)/partners/page");
    render(await PartnersPage({params: Promise.resolve({locale: "en"})}));

    const nav = screen.getByRole("navigation", {name: bundles.en.Partners.categories.label});
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#partners-supporting", "#partners-media"]);
    expect(within(nav).getByText("2")).toBeInTheDocument();
    expect(document.querySelectorAll(".partner-record-card")).toHaveLength(3);

    const first = screen.getByRole("heading", {name: "Partner 1"}).closest("article")!;
    expect(within(first).getByRole("link", {name: /example\.org/})).toHaveAttribute("href", "https://example.org");
    expect(first.textContent).toContain("2019");
    expect(first.textContent).not.toMatch(/unconfirmed/i);

    const second = screen.getByRole("heading", {name: "Partner 2"}).closest("article")!;
    expect(second.textContent).toContain(bundles.en.Partners.record.confirmed);

    const third = screen.getByRole("heading", {name: "Partner 3"}).closest("article")!;
    expect(third.textContent).toContain("2021");
    expect(third.textContent).toContain("2027");
    expect(within(third).queryByRole("link", {name: /http/})).toBeNull();

    expect(screen.getByRole("link", {name: new RegExp(bundles.en.Partners.update.action)})).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the honest empty state, and no category nav, when nothing is published", async () => {
    listPublished.mockResolvedValue([]);
    const {default: PartnersPage} = await import("@/app/[locale]/(public)/partners/page");
    render(await PartnersPage({params: Promise.resolve({locale: "en"})}));
    expect(screen.queryByRole("navigation", {name: bundles.en.Partners.categories.label})).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(bundles.en.Partners.empty.title);
    expect(document.querySelectorAll(".partner-record-card")).toHaveLength(0);
  });

  it("degrades to the empty state when the read fails", async () => {
    listPublished.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));
    const {default: PartnersPage} = await import("@/app/[locale]/(public)/partners/page");
    render(await PartnersPage({params: Promise.resolve({locale: "en"})}));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("builds indexable bilingual metadata", async () => {
    const {generateMetadata} = await import("@/app/[locale]/(public)/partners/page");
    const metadata = await generateMetadata({params: Promise.resolve({locale: "zh-HK"})});
    expect(metadata.title).toBe(bundles["zh-HK"].Partners.metaTitle);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/zh/partners");
  });
});
```

Also extend `tests/unit/home-legacy-network.test.tsx` — in the existing "shows the supporting tab…" test, after the `Partner 1` assertion add:
```ts
    for (const link of screen.getAllByRole("link", {name: labels.viewAllAction})) expect(link).toHaveAttribute("href", "/partners");
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/partners-public-groups.test.ts tests/unit/wt-pages/partners-page.test.tsx tests/unit/home-legacy-network.test.tsx`
Expected: FAIL — modules missing; the home links still point at `/about`.

- [ ] **Step 3: Grouping helper**

`lib/partners/public-groups.ts`:
```ts
import type {PartnerProjection} from '@/lib/db/repos/partners';

export type PartnerCategory = PartnerProjection['category'];
export type PublishedPartnerGroup = Readonly<{category: PartnerCategory; partners: readonly PartnerProjection[]}>;

// The donor's three tabs cover three of the five partner_category values; /partners shows all five
// in this fixed order, and omits a category with nothing published rather than showing a zero.
export const partnerCategoryOrder: readonly PartnerCategory[] = ['supporting', 'regional', 'media', 'programme', 'sponsor'];

export function groupPublishedPartners(partners: readonly PartnerProjection[]): readonly PublishedPartnerGroup[] {
  return partnerCategoryOrder
    .map((category) => ({category, partners: partners.filter((partner) => partner.category === category)}))
    .filter((group) => group.partners.length > 0);
}
```

- [ ] **Step 4: Messages**

`messages/en.json` — add a top-level `"Partners"` namespace immediately after `"Programmes"`:
```json
  "Partners": {
    "metaTitle": "Partners | WiseTech Hong Kong",
    "metaDescription": "WTIA's published partner records: supporting organisations, regional, media, programme and sponsor partners, each with a confirmed relationship and confirmed logo rights.",
    "hero": {
      "eyebrow": "Partner ecosystem",
      "title": "The organisations WTIA works with, on the record.",
      "lead": "Every record here is published by WTIA with a confirmed relationship and confirmed logo rights. Nothing is listed on the strength of a historical logo alone.",
      "breadcrumbCurrent": "Partners"
    },
    "sourceNote": {
      "eyebrow": "Relationship context",
      "title": "Published records, not a scraped logo wall.",
      "copy": "A record appears only after WTIA confirms both the relationship and the right to show the logo, and only while the relationship window is current.",
      "count": "{count, plural, one {# published partner record} other {# published partner records}}"
    },
    "categories": {
      "label": "Partner record categories",
      "supporting": "Supporting Organisations",
      "regional": "Regional Partners",
      "media": "Media Partners",
      "programme": "Programme Partners",
      "sponsor": "Sponsors"
    },
    "group": {
      "eyebrow": "Category",
      "count": "{count, plural, one {# published record} other {# published records}}"
    },
    "record": {
      "badge": "Published record",
      "relationship": "Relationship",
      "relationshipCopy": {
        "supporting": "Listed by WTIA as a supporting organisation.",
        "regional": "Listed by WTIA as a regional partner.",
        "media": "Listed by WTIA as a media partner.",
        "programme": "Listed by WTIA as a programme partner.",
        "sponsor": "Listed by WTIA as a sponsor."
      },
      "website": "Website",
      "status": "Current status",
      "confirmed": "Confirmed by WTIA",
      "since": "Confirmed by WTIA, since {year}",
      "window": "Confirmed by WTIA, {start} to {end}"
    },
    "empty": {
      "label": "Published records",
      "title": "No published partner records yet.",
      "copy": "Partner records appear here once WTIA confirms the relationship and the logo rights for each one.",
      "action": "Contact the team"
    },
    "update": {
      "eyebrow": "Update a record",
      "title": "Represent one of these organisations?",
      "copy": "Contact the team to confirm the present relationship, correct a listing or discuss a new collaboration.",
      "action": "Contact the team"
    }
  },
```

`messages/zh-HK.json`, after its `"Programmes"`:
```json
  "Partners": {
    "metaTitle": "合作夥伴｜WiseTech Hong Kong",
    "metaDescription": "WTIA 已發布的夥伴紀錄：支持機構、區域夥伴、媒體夥伴、計劃夥伴及贊助機構，每項均已確認合作關係及標誌使用權。",
    "hero": {
      "eyebrow": "夥伴生態系統",
      "title": "與 WTIA 合作的機構，有紀錄可依。",
      "lead": "此處每項紀錄均由 WTIA 發布，並已確認合作關係及標誌使用權；不會單憑過往標誌而列入名單。",
      "breadcrumbCurrent": "合作夥伴"
    },
    "sourceNote": {
      "eyebrow": "關係脈絡",
      "title": "已發布的紀錄，而非抓取而來的標誌牆。",
      "copy": "紀錄只會在 WTIA 同時確認合作關係及標誌使用權後出現，並只在合作期內顯示。",
      "count": "{count} 項已發布夥伴紀錄"
    },
    "categories": {
      "label": "夥伴紀錄分類",
      "supporting": "支持機構",
      "regional": "區域夥伴",
      "media": "媒體夥伴",
      "programme": "計劃夥伴",
      "sponsor": "贊助機構"
    },
    "group": {
      "eyebrow": "分類",
      "count": "{count} 項已發布紀錄"
    },
    "record": {
      "badge": "已發布紀錄",
      "relationship": "關係",
      "relationshipCopy": {
        "supporting": "由 WTIA 列為支持機構。",
        "regional": "由 WTIA 列為區域夥伴。",
        "media": "由 WTIA 列為媒體夥伴。",
        "programme": "由 WTIA 列為計劃夥伴。",
        "sponsor": "由 WTIA 列為贊助機構。"
      },
      "website": "網站",
      "status": "現時狀態",
      "confirmed": "已由 WTIA 確認",
      "since": "已由 WTIA 確認，自 {year} 年起",
      "window": "已由 WTIA 確認，{start} 至 {end}"
    },
    "empty": {
      "label": "已發布紀錄",
      "title": "目前尚未有已發布的夥伴紀錄。",
      "copy": "當 WTIA 逐項確認合作關係及標誌使用權後，夥伴紀錄便會在此顯示。",
      "action": "聯絡團隊"
    },
    "update": {
      "eyebrow": "更新紀錄",
      "title": "你是否代表以上機構？",
      "copy": "請聯絡團隊確認現時關係、修正名單，或洽談新合作。",
      "action": "聯絡團隊"
    }
  },
```

- [ ] **Step 5: The page**

(`StatusLabel` takes `as?: 'span' | 'p'` and `className`; `Eyebrow` renders `<p class="eyebrow">` — both verified.)

`app/[locale]/(public)/partners/page.tsx`:
```tsx
import type {Metadata} from 'next';
import Image from 'next/image';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {PageHero} from '@/components/wt/page-hero';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {partnersRepository, type PartnerProjection} from '@/lib/db/repos/partners';
import {isPrivateMediaDeliveryUrl} from '@/lib/media/url';
import {buildPageMetadata} from '@/lib/metadata';
import {groupPublishedPartners} from '@/lib/partners/public-groups';

export const dynamic = 'force-dynamic';
type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Partners'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/partners', title: t('metaTitle'), description: t('metaDescription')});
}

function year(date: string | null): string | null {
  return date ? date.slice(0, 4) : null;
}

// The manifest retired /partners while no verified partner authority existed
// (route-design-partners). PR4/WP-5 created one: listPublished returns only rows with both
// confirmations, bilingual logo alt text and a current window, so every record printed here is
// "confirmed" by construction -- the donor's "historical listing, unconfirmed" copy and its
// hard-coded 79 are not ported. Donor grammar: app/styles/wisetech.css:788-812.
export default async function PartnersPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, common, partners] = await Promise.all([
    getTranslations({locale, namespace: 'Partners'}),
    getTranslations({locale, namespace: 'Common'}),
    partnersRepository.listPublished(locale, {limit: 100}).catch((): readonly PartnerProjection[] => []),
  ]);
  const groups = groupPublishedPartners(partners);

  const status = (partner: PartnerProjection): string => {
    const start = year(partner.relationshipStartsOn);
    const end = year(partner.relationshipEndsOn);
    if (start && end) return t('record.window', {start, end});
    if (start) return t('record.since', {year: start});
    return t('record.confirmed');
  };

  return (
    <>
      <PageHero
        eyebrow={t('hero.eyebrow')}
        title={t('hero.title')}
        lead={t('hero.lead')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('hero.breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <section className="section partner-directory-page" aria-labelledby="partners-source-title">
        <div className="shell">
          <div className="partner-source-note">
            <div>
              <Eyebrow>{t('sourceNote.eyebrow')}</Eyebrow>
              <h2 id="partners-source-title">{t('sourceNote.title')}</h2>
            </div>
            <div>
              <p>{t('sourceNote.copy')}</p>
              <p>{t('sourceNote.count', {count: partners.length})}</p>
            </div>
          </div>
          {groups.length === 0 ? (
            <HonestEmpty variant="inner" label={t('empty.label')} title={t('empty.title')} copy={t('empty.copy')} actions={[{href: '/contact', label: t('empty.action')}]} />
          ) : (
            <>
              <nav className="partner-category-nav" aria-label={t('categories.label')}>
                {groups.map((group) => (
                  <a href={`#partners-${group.category}`} key={group.category}>
                    <span>{t(`categories.${group.category}`)}</span>
                    <b>{group.partners.length}</b>
                  </a>
                ))}
              </nav>
              {groups.map((group) => (
                <section className="partner-record-group" id={`partners-${group.category}`} key={group.category} aria-labelledby={`partners-${group.category}-title`}>
                  <div className="partner-record-heading">
                    <div>
                      <Eyebrow>{t('group.eyebrow')}</Eyebrow>
                      <h2 id={`partners-${group.category}-title`}>{t(`categories.${group.category}`)}</h2>
                    </div>
                    <p>{t('group.count', {count: group.partners.length})}</p>
                  </div>
                  <div className="partner-record-grid">
                    {group.partners.map((partner) => (
                      <article className="partner-record-card" key={partner.id}>
                        <div className="partner-record-logo">
                          {partner.logoUrl && partner.logoAlt ? (
                            <Image alt={partner.logoAlt} height={202} src={partner.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(partner.logoUrl)} width={320} />
                          ) : null}
                        </div>
                        <div className="partner-record-body">
                          <StatusLabel as="span" className="partner-status">{t('record.badge')}</StatusLabel>
                          <h3>{partner.name}</h3>
                          <dl>
                            <div><dt>{t('record.relationship')}</dt><dd>{t(`record.relationshipCopy.${partner.category}`)}</dd></div>
                            {partner.websiteUrl ? (
                              <div><dt>{t('record.website')}</dt><dd><a href={partner.websiteUrl} rel="noreferrer">{partner.websiteUrl.replace(/^https?:\/\//, '')}</a></dd></div>
                            ) : null}
                            <div><dt>{t('record.status')}</dt><dd>{status(partner)}</dd></div>
                          </dl>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
          <div className="partner-confirmation">
            <div>
              <Eyebrow>{t('update.eyebrow')}</Eyebrow>
              <h2>{t('update.title')}</h2>
              <p>{t('update.copy')}</p>
            </div>
            <ActionLink href="/contact" variant="button-light">{t('update.action')}</ActionLink>
          </div>
        </div>
      </section>
    </>
  );
}
```

In `components/home/legacy-network.tsx` change both `href="/about"` to `href="/partners"` and update the comment on lines 22–25 to say the wall previews `/partners`.

Add `"app/[locale]/(public)/partners/page.tsx"` to `tests/unit/image-render-policy.test.ts`'s allowlist next to `components/home/legacy-network.tsx` (read the file for its exact shape).

- [ ] **Step 6: Page-copy sizes**

Run `npx vitest run tests/unit/page-copy-scope.test.ts`; add `Partners: <n>,` with the real count and `// WP-7 Task 5: the /partners page copy.`; raise the total.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/partners-public-groups.test.ts tests/unit/wt-pages/partners-page.test.tsx tests/unit/home-legacy-network.test.tsx tests/unit/homepage.test.tsx tests/unit/page-copy-scope.test.ts tests/unit/messages.test.ts tests/unit/public-landmark-contract.test.ts tests/unit/image-render-policy.test.ts`
Expected: PASS. `npm run audit:strings` passes (the `replace(/^https?:\/\//, '')` expression prints data, not a literal). `npx tsc --noEmit` clean.

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/(public)/partners/page.tsx" lib/partners/public-groups.ts components/home/legacy-network.tsx messages/en.json messages/zh-HK.json tests/unit/page-copy-scope.test.ts tests/unit/partners-public-groups.test.ts tests/unit/wt-pages/partners-page.test.tsx tests/unit/home-legacy-network.test.tsx tests/unit/image-render-policy.test.ts
git commit -m "$(cat <<'EOF'
feat: add /partners over the published partner authority

Only rows the repository already publishes -- both confirmations, bilingual
logo alt, a current window -- grouped by category with live counts and
each record's confirmed status. The donor's hard-coded 79 and its
"unconfirmed" copy are not ported; the home wall now links here.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Un-retire `/partners` and `/programmes` in the manifest, inventory and parity document

**Files:**
- Modify: `config/wisetech-integration-manifest.ts`, `config/wisetech-authoritative-source-inventory.ts`, `docs/integration/wisetech-route-parity.md`
- Test: `tests/unit/wisetech-route-parity.test.ts` (extend)
- Regression: `tests/unit/navigation.test.ts`, `tests/unit/wisetech-redirects.test.ts`, `tests/unit/redirects.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/wisetech-route-parity.test.ts`'s main `describe`:
```ts
  it("un-retires /partners and /programmes now that their authorities exist (WP-7)", () => {
    const bySource = new Map(wisetechIntegrationManifest.map((item) => [item.source, item]));
    expect(bySource.get("/partners")).toMatchObject({id: "route-design-partners", disposition: "retain", canonicalPath: "/partners", evidence: "hkwtia-repository", sourceEvidenceId: "sitemap-46"});
    expect(bySource.get("/programmes")).toMatchObject({id: "route-design-programmes", disposition: "retain", canonicalPath: "/programmes", evidence: "hkwtia-repository", sourceEvidenceId: "sitemap-29"});
    expect(wisetechIntegrationManifest.filter(({disposition}) => disposition === "retire")).toHaveLength(13);
    for (const route of ["/partners", "/programmes"]) expect(appRoutes.has(route), route).toBe(true);
    expect(authoritativeSourceInventory.navigationTargets.filter(({path}) => path === "programmes").every(({disposition, canonicalPath}) => disposition === "retain" && canonicalPath === "/programmes")).toBe(true);
  });
```
(Confirm `sitemap-46`/`sitemap-29` by counting the inventory's `sitemapRoutes` rows — `/programmes` is the 29th row and `/partners` the 46th; adjust if the count differs.)

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/wisetech-route-parity.test.ts`
Expected: FAIL on the new case.

- [ ] **Step 3: Amend the inventory**

In `config/wisetech-authoritative-source-inventory.ts` `sitemapRoutes`: `"programmes|retire|"` → `"programmes|retain|/programmes"` and `"partners|retire|"` → `"partners|retain|/partners"`. In `navigationTargets`, the three `programmes-gba` rows whose path is `"programmes"`: `"retire", null` → `"retain", "/programmes"`. Nothing else in the file changes (identity, tree hashes, assets).

- [ ] **Step 4: Amend the manifest**

Remove the `route-design-programmes` and `route-design-partners` rows from `retiredDesignRoutes` and add, after `route-concierge-api` in `repositoryRoutes`:
```ts
  // WP-7 un-retired both (master plan §5 WP-7; docs/superpowers/specs/2026-09-06-wisetech-wp7-routes-seo-design.md
  // §4.2): the retire rationales named a missing authority, and PR4/WP-5 (published partners) and
  // the four typed programme records now provide one. The ids keep their route-design- prefix so
  // every existing reference resolves.
  ["route-design-programmes", "/programmes", "Typed programme index over content/programs/index.ts and the four typed records."],
  ["route-design-partners", "/partners", "Published partner records (partners repository; both confirmations and bilingual logo alt required)."],
```

- [ ] **Step 5: Rewrite the affected parts of `docs/integration/wisetech-route-parity.md`**

- Line 20: `retain 47, redirect 4, merge 67 and retire 15` → `retain 49, redirect 4, merge 67 and retire 13`.
- Repository-backed table: add `| `/programmes` | Typed programme index over the four typed records (WP-7) |` and `| `/partners` | Published partner records with both confirmations and bilingual logo alt (WP-7) |`.
- "Design-document routes merged into real destinations": retitle **"Design-document routes redirected to real destinations"** and replace its first paragraph with: "Since WP-7 every `merge` route below is a real `next.config.ts` redirect (`permanent: false`), generated from the manifest by `config/wisetech-redirects.ts` and served for the bare path, `/en/<path>` and `/zh/<path>` (the donor served both prefixes). A static source that merges into a dynamic page redirects to that page's static prefix (`/request-introduction` → `/showcase`; the two historical event paths → `/events`). `/members/[slug]` yields to the pre-existing explicit `/members/:id` rule. `tests/unit/wisetech-redirects.test.ts` pins all of this against the frozen inventory."
- Retired table: delete the `/programmes` and `/partners` rows; add above the table: "`/programmes` and `/partners` left this table in WP-7 (see the repository-backed table)."
- Line 158: `merge 45` → `merge 51` (Appendix D E-5).

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/wisetech-route-parity.test.ts tests/unit/navigation.test.ts tests/unit/wisetech-redirects.test.ts tests/unit/redirects.test.ts`
Expected: PASS (the parity validator now finds the `/partners` and `/programmes` pages; the generated redirect set is unchanged because both entries are `retain`, not `merge`).

- [ ] **Step 7: Commit**

```bash
git add config/wisetech-integration-manifest.ts config/wisetech-authoritative-source-inventory.ts docs/integration/wisetech-route-parity.md tests/unit/wisetech-route-parity.test.ts
git commit -m "$(cat <<'EOF'
feat: un-retire /partners and /programmes in the manifest, inventory and parity record

Both retire rationales named a missing authority; the published partner
repository and the four typed programme records now supply one. Counts
and the "merge 45" figure in the parity document are corrected (E-5).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Navigation, mobile and footer

**Files:**
- Modify: `config/navigation.ts`, `messages/en.json`, `messages/zh-HK.json`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`, `tests/unit/public-shell.test.tsx`
- Regression: `tests/unit/wisetech-shell-boundary.test.ts`, `tests/unit/site-footer.test.tsx`, `tests/unit/messages.test.ts`, every other test that pins the leaf list (grep `tests/unit` for `"/programs/cpai"`)

- [ ] **Step 1: Update the tests first**

`tests/unit/navigation.test.ts` line 22: links `["/events", "/launchpad", "/programmes", "/programs/hkict", "/programs/asa", "/programs/tct", "/programs/cpai"]`; line 25: `["/about", "/about/history", "/about/chairman", "/about/committees", "/contact", "/partners"]`.

`tests/unit/mobile-navigation.test.tsx` lines 86–88: `["/events", "/launchpad", "/programmes", "/programs/hkict", "/programs/asa"]`.

`tests/unit/public-shell.test.tsx` `expectedHrefs` (lines 134–142): add `"/programmes",` after `"/programs/cpai",` and `"/partners",` after `"/contact",`; update the comment on lines 148–150 (`leaving the total at 20` → `22`).

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/public-shell.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Config and messages**

`config/navigation.ts`: extend `NavigationMessageKey` with `| "links.programmes" | "links.partners"` on the `links.*` line. Programmes column:
```ts
    {id: "programmes", labelKey: "columns.programmes", links: [{id: "programmes", href: "/programmes", labelKey: "links.programmes"}, {id: "hkict", href: "/programs/hkict", labelKey: "links.hkict"}, {id: "asa", href: "/programs/asa", labelKey: "links.asa"}, {id: "tct", href: "/programs/tct", labelKey: "links.tct"}, {id: "cpai", href: "/programs/cpai", labelKey: "links.cpai"}]},
```
Connect column:
```ts
    {id: "connect", labelKey: "columns.connect", links: [{id: "contact", href: "/contact", labelKey: "links.contact"}, {id: "partners", href: "/partners", labelKey: "links.partners"}]},
```
Add above `navigationGroups`: `// WP-7 (design D-3): /programmes leads the Programmes column and /partners joins Connect. The mobile accordion shows a group's first five leaves, so tct and cpai reach mobile users through /programmes, the desktop menu and the footer (errata E-19).`

`messages/en.json` `Navigation.links`: add `"programmes": "Programmes",` before `"hkict"` and `"partners": "Partners"` after `"contact"`. `messages/zh-HK.json`: `"programmes": "計劃總覽",` and `"partners": "合作夥伴"`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/public-shell.test.tsx tests/unit/wisetech-shell-boundary.test.ts tests/unit/site-footer.test.tsx tests/unit/messages.test.ts`
Expected: PASS. If another shell test pins the old leaf count or list, update only that count/list.

- [ ] **Step 5: Commit**

```bash
git add config/navigation.ts messages/en.json messages/zh-HK.json tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/public-shell.test.tsx
git commit -m "$(cat <<'EOF'
feat: put /programmes and /partners into the public navigation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Page titles → `<Page> | WiseTech Hong Kong` (D-1)

**Files:**
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/page-titles.test.ts` (new)
- Regression: `tests/unit/messages.test.ts`, `tests/unit/page-indexability.test.ts`, `tests/unit/wt-pages/*.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/page-titles.test.ts`:
```ts
import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

function metaTitles(bundle: Record<string, unknown>): [string, string][] {
  return Object.entries(bundle).flatMap(([namespace, value]) => {
    const title = (value as {metaTitle?: unknown} | null)?.metaTitle;
    return typeof title === "string" ? [[namespace, title] as [string, string]] : [];
  });
}

// Design D-1: the public brand is WiseTech Hong Kong; WTIA stays the legal short name in
// openGraph.siteName and the copy, not in the title suffix.
describe("page titles", () => {
  it("suffixes every English metaTitle with the public brand", () => {
    const titles = metaTitles(en);
    expect(titles.length).toBeGreaterThanOrEqual(16);
    for (const [namespace, title] of titles) {
      expect(title === "WiseTech Hong Kong" || title.endsWith(" | WiseTech Hong Kong"), `${namespace}: ${title}`).toBe(true);
      expect(title, namespace).not.toMatch(/\| WTIA$/);
    }
    expect(en.Metadata.title).toBe("WiseTech Hong Kong");
  });

  it("suffixes every Chinese metaTitle with the fullwidth separator and the same brand", () => {
    for (const [namespace, title] of metaTitles(zh)) {
      expect(title === "WiseTech Hong Kong" || title.endsWith("｜WiseTech Hong Kong"), `${namespace}: ${title}`).toBe(true);
    }
    expect(zh.Metadata.title).toBe("WiseTech Hong Kong");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/page-titles.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the titles**

`messages/en.json`: `Metadata.title` → `"WiseTech Hong Kong"`; every `metaTitle` ending ` | WTIA` → ` | WiseTech Hong Kong`; `"About WTIA"` → `"About | WiseTech Hong Kong"`; `"Contact WTIA"` → `"Contact | WiseTech Hong Kong"`; `"Join WTIA | Membership application"` → `"Membership application | WiseTech Hong Kong"`; `Home.metaTitle` stays `"WiseTech Hong Kong"`.

`messages/zh-HK.json`: `Metadata.title` → `"WiseTech Hong Kong"`; every `metaTitle` ending `｜WTIA` or ` | WTIA` → `｜WiseTech Hong Kong` (fullwidth, no spaces); `"關於 WTIA"` → `"關於我們｜WiseTech Hong Kong"`; `"聯絡 WTIA"` → `"聯絡我們｜WiseTech Hong Kong"`; `"加入 WTIA｜會籍申請"` → `"會籍申請｜WiseTech Hong Kong"`. The `Programmes`/`Partners` titles from Tasks 3/5 already comply.

Grep `tests/unit` for `| WTIA` afterwards: `aiops-page.test.tsx:14` and `history-page.test.tsx:19` are mock bundle values, not assertions, and `extract-milestones.test.ts:9` is a scraped-HTML fixture — leave all three.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/page-titles.test.ts tests/unit/messages.test.ts tests/unit/page-indexability.test.ts tests/unit/wt-pages`
Expected: PASS. Then `npx vitest run` (full) — a page test that asserted a literal `| WTIA` title would fail here; update that assertion to the new title.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/zh-HK.json tests/unit/page-titles.test.ts
git commit -m "$(cat <<'EOF'
feat: title every public page under the WiseTech Hong Kong brand

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `x-default` alternates (D-2)

**Files:**
- Modify: `lib/metadata.ts`, `app/sitemap.ts`
- Test: `tests/unit/metadata.test.ts`, `tests/unit/sitemap.test.ts` (extend)
- Regression: `tests/unit/seo-routes.test.ts`, `tests/unit/event-detail-seo.test.ts`

- [ ] **Step 1: Update the tests first**

`tests/unit/metadata.test.ts` expectation becomes:
```ts
      languages: {
        en: 'http://localhost:3000/membership',
        'zh-HK': 'http://localhost:3000/zh/membership',
        'x-default': 'http://localhost:3000/membership'
      }
```
`tests/unit/sitemap.test.ts` — add:
```ts
  it("declares en, zh-HK and an English x-default alternate on every static entry", async () => {
    publicPosts.listPublishedBuildLogs.mockResolvedValue([]);
    const entries = await sitemap();
    const home = entries.find((entry) => entry.url === "http://localhost:3000/")!;
    expect(home.alternates?.languages).toEqual({
      en: "http://localhost:3000/",
      "zh-HK": "http://localhost:3000/zh",
      "x-default": "http://localhost:3000/",
    });
  });
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run tests/unit/metadata.test.ts tests/unit/sitemap.test.ts`

- [ ] **Step 3: Implement**

`lib/metadata.ts` `languages`: add `'x-default': englishUrl` after `'zh-HK': chineseUrl`. `app/sitemap.ts` `alternates()`: add `"x-default": absoluteUrl(localizedPath("en", pathname))`. One-line comment on each: `// x-default -> English (design D-2): hreflang tags stay zh-HK, not the donor's zh-Hant.`

- [ ] **Step 4: Run and confirm they pass**

Run: `npx vitest run tests/unit/metadata.test.ts tests/unit/sitemap.test.ts tests/unit/seo-routes.test.ts tests/unit/event-detail-seo.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/metadata.ts app/sitemap.ts tests/unit/metadata.test.ts tests/unit/sitemap.test.ts
git commit -m "$(cat <<'EOF'
feat: add an English x-default alternate to page metadata and the sitemap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `noindex` for Portal, Admin and `robots.txt` disallows

**Files:**
- Modify: `app/[locale]/(member)/portal/layout.tsx`, `app/[locale]/(admin)/admin/layout.tsx`, `app/robots.ts`
- Test: `tests/unit/page-indexability.test.ts`, `tests/unit/seo-routes.test.ts` (extend)
- Regression: `tests/unit/portal-authorization.test.ts`, `tests/unit/admin-page-auth.test.ts`, `tests/unit/concierge-layouts.test.ts`, `tests/unit/internal-shell-landmark-contract.test.ts`

- [ ] **Step 1: Update the tests first**

`tests/unit/page-indexability.test.ts` — add imports and a case:
```ts
import {metadata as portalMetadata} from "@/app/[locale]/(member)/portal/layout";
import {metadata as adminMetadata} from "@/app/[locale]/(admin)/admin/layout";
import {metadata as memberLoginMetadata} from "@/app/[locale]/member-login/page";
// …
  it.each([
    ["portal layout", portalMetadata],
    ["admin layout", adminMetadata],
    ["member-login", memberLoginMetadata],
  ])("keeps the %s out of search results", (_name, value) => {
    expect(value.robots).toEqual({index: false, follow: false});
  });
```
The portal and admin layouts import `@/lib/auth/actor` and `@/lib/admin/page-auth` at module scope; mock both at the top of this test (`vi.mock("@/lib/auth/actor", () => ({requireActor: vi.fn(), getActor: vi.fn()}))`, `vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: vi.fn()}))`) the way `tests/unit/concierge-layouts.test.ts` loads the portal layout — read that file first.

`tests/unit/seo-routes.test.ts` — add:
```ts
  it('keeps authenticated and mid-flow surfaces out of every crawler', () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    for (const rule of list) {
      expect(rule.disallow).toEqual(['/portal', '/admin', '/member-login', '/join/profile', '/join/company', '/join/checkout', '/join/complete', '/unsubscribe', '/api']);
    }
  });
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run tests/unit/page-indexability.test.ts tests/unit/seo-routes.test.ts`

- [ ] **Step 3: Implement**

Both layouts: add `import type {Metadata} from "next";` and, next to `export const dynamic = "force-dynamic";`:
```ts
// Authenticated surface: never indexed (master plan WP-7 SEO row). Layout metadata merges into
// every page below it, so no page needs its own robots block.
export const metadata: Metadata = {robots: {index: false, follow: false}};
```
`app/robots.ts`:
```ts
const disallow = ['/portal', '/admin', '/member-login', '/join/profile', '/join/company', '/join/checkout', '/join/complete', '/unsubscribe', '/api'];
// …
    rules: [
      {userAgent: '*', allow: ['/'], disallow},
      {userAgent: 'GPTBot', allow: ['/'], disallow},
      {userAgent: 'ClaudeBot', allow: ['/'], disallow},
      {userAgent: 'PerplexityBot', allow: ['/'], disallow},
    ],
```

- [ ] **Step 4: Run and confirm they pass**

Run: `npx vitest run tests/unit/page-indexability.test.ts tests/unit/seo-routes.test.ts tests/unit/portal-authorization.test.ts tests/unit/admin-page-auth.test.ts tests/unit/concierge-layouts.test.ts tests/unit/internal-shell-landmark-contract.test.ts`

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(member)/portal/layout.tsx" "app/[locale]/(admin)/admin/layout.tsx" app/robots.ts tests/unit/page-indexability.test.ts tests/unit/seo-routes.test.ts
git commit -m "$(cat <<'EOF'
feat: keep Portal, Admin, member-login and the join steps out of search

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Errata, checklist and parity-document sweep

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (Appendix D, after E-71), `docs/integration/wisetech-design-fidelity-checklist.md` (rows 7.1–7.5), `docs/integration/wisetech-route-parity.md` (final read-through)

- [ ] **Step 1: Append errata rows E-72 to E-78**

Same five-column table shape as E-70/E-71 (`| # | Spec location | Spec says | Verified state | Action for later WPs |`). One row each, citing the commit hashes from `git log --oneline`:
- E-72 — WP-7 SEO row: sitemap `alternates.languages` as `en`/`zh-Hant` → hkwtia keeps `zh-HK` (the more specific valid tag, already in `buildPageMetadata` and `<html lang>`) and adds `x-default` → English in both places (D-2).
- E-73 — WP-7 table: one redirect per merge route → three sources per rule (`/x`, `/en/x`, `/zh/x`), because the donor served both prefixes and the next-intl proxy rewrites `/zh/x` to a non-existent `zh-HK` page before any redirect could see it (D-6); `config/wisetech-redirects.ts`, pinned by `tests/unit/wisetech-redirects.test.ts`.
- E-74 — Appendix A: `/request-introduction → /showcase/[slug]`, two historical event paths → `/events/[slug]` → a static source cannot supply a slug, so the rule targets the canonical's static prefix (`/showcase`, `/events`) (D-7).
- E-75 — Appendix A: `/members/[slug] → /showcase/[slug]` → yields to the pre-existing explicit `/members/:id → /showcase` rule (same shape; explicit wins) (D-8).
- E-76 — WP-7 `/partners` row (donor `PartnersPage`): "79 organisations" hero and per-record "Unconfirmed" status → not ported; `listPublished` returns only doubly-confirmed rows, so the page counts what it renders and every record states "Confirmed by WTIA" with its window.
- E-77 — WP-7 `/programmes` row (donor `ProgrammesPage`): seven marketing groupings → three data-backed groupings (catalogue, Launch Pad, history) plus one honest applications state; `firstYear` added to `summarizeProgrammes()` for the edition span.
- E-78 — WP-7 SEO row: `<Page> | WiseTech Hong Kong` → applied to every `metaTitle` in both bundles (fullwidth `｜` in zh-HK) and `Metadata.title`; `siteConfig.shortName`/`openGraph.siteName` stay `WTIA` (legal short name) (D-1); pinned by `tests/unit/page-titles.test.ts`.

- [ ] **Step 2: Checklist rows 7.1–7.5**

Set status `ported`; evidence column: `branch worktree-wt-wp7-routes-seo` plus the test file names that pin each row (7.1 `wt-pages/partners-page.test.tsx`, `wisetech-route-parity.test.ts`; 7.2 `wt-pages/programmes-page.test.tsx`, `wisetech-redirects.test.ts`; 7.3 `wisetech-redirects.test.ts`, `redirects.test.ts`; 7.4 `wisetech-route-parity.test.ts`; 7.5 `page-titles.test.ts`, `metadata.test.ts`, `sitemap.test.ts`, `seo-routes.test.ts`, `page-indexability.test.ts`). WP-8 flips them to `verified` with the PR link after the gate.

- [ ] **Step 3: Read `docs/integration/wisetech-route-parity.md` end to end** and fix any count or sentence Task 6 left inconsistent (the retired table has 11 rows after removing two; the "Exit condition" paragraph does not change).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md docs/integration/wisetech-design-fidelity-checklist.md docs/integration/wisetech-route-parity.md
git commit -m "$(cat <<'EOF'
docs: record WP-7 errata E-72 to E-78 and mark rows 7.1-7.5 ported

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Whole-branch gate, browser suites and visual baselines (verification only)

**Files:** `tests/e2e/wisetech-redirects.spec.ts` (new), `tests/e2e/public-route-matrix.spec.ts` (only if it enumerates routes literally), regenerated `tests/e2e/__screenshots__/*-win32-chromium.png` (changed ones only).

- [ ] **Step 1: The master plan §7 gate, in order**

```sh
npm run audit:strings
npx vitest run tests/unit/wisetech-redirects.test.ts tests/unit/wisetech-route-parity.test.ts tests/unit/wt-pages/partners-page.test.tsx tests/unit/wt-pages/programmes-page.test.tsx tests/unit/page-titles.test.ts
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
```
Record every exit code and the focused/total test counts for the PR description. `npm test` must be 0 failures (the full suite has shown load-related timeouts in `repository-boundary`, `server-action-actor-boundary` and `launchpad-page`; rerun any timed-out file alone and report both results). After `npm run build`: `git checkout -- AGENTS.md next-env.d.ts`.

- [ ] **Step 2: Browser suites**

Start the managed dev server on a free port (`PLAYWRIGHT_PORT=3100` if 3000 is held), then:
```sh
npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/wisetech-visual-baseline.spec.ts
```
Read `tests/e2e/public-route-matrix.spec.ts`; if it enumerates public routes literally, add `/partners` and `/programmes`. Add `tests/e2e/wisetech-redirects.spec.ts`:
```ts
import {expect, test} from "@playwright/test";

const cases: readonly [string, string][] = [
  ["/why-wisetech", "/about"],
  ["/en/why-wisetech", "/about"],
  ["/zh/why-wisetech", "/zh/about"],
  ["/programmes/launchpad", "/launchpad"],
  ["/zh/join/success", "/zh/join/complete"],
  ["/request-introduction", "/showcase"],
];

test.describe("WiseTech design redirects", () => {
  for (const [source, destination] of cases) {
    test(`${source} resolves to ${destination}`, async ({page}) => {
      const response = await page.goto(source, {waitUntil: "commit"});
      expect(response?.ok()).toBe(true);
      expect(new URL(page.url()).pathname).toBe(destination);
    });
  }
});
```
Run it. Regenerate baselines once: `npm run test:e2e -- tests/e2e/wisetech-visual-baseline.spec.ts --update-snapshots=changed`, rerun that spec to confirm 0 diffs, and commit only the PNGs that changed. Then `git checkout -- AGENTS.md next-env.d.ts`.

- [ ] **Step 3: Commit the e2e additions and baselines**

```bash
git add tests/e2e/wisetech-redirects.spec.ts tests/e2e/public-route-matrix.spec.ts tests/e2e/__screenshots__
git commit -m "$(cat <<'EOF'
test: WP-7 redirect and route-matrix e2e coverage, visual baselines regenerated

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Report** the gate table (command, exit code, totals) and stop. Do not push and do not open a PR — that is a human decision, as in every previous WP.
