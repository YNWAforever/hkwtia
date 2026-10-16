# WiseTech WP-3 Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `app/[locale]/(public)/page.tsx`'s current 4-section homepage with the WiseTech donor's 13-section homepage, each section a Server Component under `components/home/` reading a real hkwtia data owner (or a typed static record) and degrading to an honest empty state independently, per `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §4.4/§5 "WP-3" and `docs/superpowers/specs/2026-09-03-wisetech-wp3-homepage-design.md`.

**Architecture:** `app/[locale]/(public)/page.tsx` stays `export const dynamic = 'force-dynamic'` and becomes a thin composition point. Each of the 13 sections is authored as its own async function in `components/home/<name>.tsx` that resolves its own `next-intl` namespace and (where it has one) its own read model with `.catch(() => [])` or `Promise.allSettled`, then returns the section's JSX. `page.tsx` calls all 13 functions through one `Promise.all(...)` (matching the design doc's §4 performance guidance: "`Promise.all` at the page level ... fans out in parallel rather than in sequence") and renders the resolved elements in order. The two interactive sections (`ecosystem.tsx`, `legacy-network.tsx`) are `'use client'` presentational components that take already-localized, already-fetched data as plain serializable props; the async data/translation resolution for those two lives in small pure helpers under `lib/home/` (`ecosystem-industries.ts`, `legacy-network-groups.ts`) that `page.tsx` calls directly, because a function cannot cross the server/client boundary as a prop and a `'use client'` module's non-component exports cannot safely be called from server code. The hero adopts the donor's top-spanning scrim (design doc §2) instead of `EditorialHero`'s left-to-right fade; the placeholder photo `public/images/projects-hero.jpg` is unchanged. `#home-discover` — the pre-existing scroll anchor `tests/e2e/wisetech-pr3-public-pages.spec.ts` already exercises — moves from the old 3-card highlights grid onto the new Open Now section, since that is the first section below the hero.

**Tech Stack:** Next.js 16 App Router (Webpack), React 19 Server/Client Components, next-intl v4 (`getTranslations`, dotted namespaces, `t.raw`), Tailwind v3 + the donor CSS port (`app/styles/wisetech.css`, generated, byte-pinned — never hand-edited), the `components/wt/` primitives from WP-1, Drizzle repositories (`eventsRepository`, `showcaseRepository`, `cohortRepository`, `partnersRepository`), typed content records (`content/programs/*`, `content/milestones.ts`), vitest + Testing Library, Playwright 1.61, Lighthouse CI (`lighthouserc.js`).

**Programme context:** `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §4.4 (section catalogue), §5 "WP-3 · Homepage: the 13 sections over real read models" (the 13-row table this plan implements exactly), D-4 (AI+ industry pathways), D-6 (prepared `mailto:` / Concierge hand-off), D-7 (membership pathways, SME as an audience card not a plan), D-8 (impact metrics: computed at request time, zero hides the tile, never hard-code a total), D-9 (archive photography from typed milestones), D-10 (brand line); Appendix D errata E-13 (`heroVariantByRoute` static-rendering check), E-20 (the phone number was left unset; the contact page still prints the donor's number and now disagrees with the footer), E-25 (breakpoints: the desktop nav collapses at 1240px, not 1120px — any new e2e viewport sweep uses 1360 for "desktop"), E-47 (the overlay header needs a scrim of its own, or the donor hero fixes it by construction), E-52 (four route-matrix contracts around `#home-discover` were already broken/vacuous before this branch; WP-3 must re-measure, not nudge), E-64 (a photograph bounds every focus indicator drawn over it; re-measure after the new hero ships), E-68 (`Footer.addressLines` is the printed authority per locale; `siteConfig.contact.addressLines` is the English-only structured-data record — the two are deliberately different lists and must never be conflated). `docs/superpowers/specs/2026-09-03-wisetech-wp3-homepage-design.md` records this session's four closures (phone number, hero scrim, the errata list above, and the Lighthouse approach) as the addendum on top of the master table. Living status: `docs/integration/wisetech-design-fidelity-checklist.md`. Read `CLAUDE.md` and `AGENTS.md` first.

**Donor evidence, read-only:** commit `f91ecc5` is checked out read-only at `.worktrees/wisetech-pr6-wisetech-publication` (this session found it there directly; `git show f91ecc5:app/WiseTechSite.tsx` also works from any worktree). The 13 home sections are `Hero` (`:474`), `LegacyNetwork` (`:496`), `RealCommunity` (`:573`), `AudienceSection` (`:604`), `Ecosystem` (`:626`), `OpportunityBoard` (`:660`), `MarketProducts` (`:678`), `ProgrammeShowcase` (`:704`), `EventsPreview` (`:726`), `ImpactSection` (`:742`), `OutcomesSection` (`:758`), `GbaSection` (`:770`), `ConversionPaths` (`:779`); the `industries` and `audiences` static data arrays are at `:21` and `:66`. Never import, copy as runtime code, or merge that tree; `tests/unit/wisetech-shell-boundary.test.ts` already fails on any donor filename or class name inside the six shell files it scans, and every new component below is written from scratch against hkwtia's own data owners, adapting only the presentational copy the design doc and master spec license (D-8 forbids carrying over the donor's fabricated totals — `17`/`2`/`79` — even where the copy is otherwise reused).

**Environment rules:** work only in the worktree `.worktrees/wt-wp2-shell` on branch `feat/wt-wp2-shell`. `node_modules` there is a junction; Windows; use `npm run …` and `npx …`. Stage explicit paths only; never `git add -A`, never stage `AGENTS.md`, `next-env.d.ts`, or `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap`. Do not run Playwright or start a dev server as part of executing this plan's per-task steps — the two browser-dependent items (the discover-anchor re-measurement and the Lighthouse run) are both scoped into the final task, where they are unavoidable. `PLAYWRIGHT_BASE_URL` stays unset so Playwright manages the dev server, which maps `DATABASE_URL` to `DATABASE_URL_TEST` (`tests/fixtures/m2-runtime-env.ts`) — every data-backed section therefore renders its honest empty state in any browser run against a worktree with no `.env.local`, which is expected and is what the visual baseline captures.

---

## File structure

| Path | Responsibility |
|---|---|
| `config/site.ts` (modify) | `siteContact.phone` set to `'+852 2989 9164'` |
| `app/[locale]/(public)/contact/page.tsx` (modify) | Phone line reads `siteConfig.contact.phone` instead of a hard-coded literal |
| `app/[locale]/(public)/page.tsx` (rewrite) | Thin composition of the 13 sections via one `Promise.all` |
| `components/home/hero.tsx` (new) | Section 1: donor top-scrim hero over the placeholder photo |
| `components/home/open-now.tsx` (new) | Section 2: `eventsRepository.listPublic` (status `open`, limit 3); `#home-discover` anchor lives here |
| `components/home/pathways.tsx` (new) | Section 3: 5 static audience cards (D-7) |
| `components/home/events-journey.tsx` (new) | Section 4: `eventsRepository.listFeaturedPublic` (limit 2); Before/During/After stage grid always renders |
| `components/home/market-products.tsx` (new) | Section 5: `showcaseRepository.listPublished` (limit 12) length only, never a total |
| `components/home/outcomes.tsx` (new) | Section 6: always the honest publishing-framework state (D-8, no data owner) |
| `components/home/ecosystem.tsx` (new, `'use client'`) | Section 7: 6-industry selector (D-4), data passed in |
| `lib/home/ecosystem-industries.ts` (new) | Pure helper resolving the 6 industries' localized copy + hrefs |
| `components/home/programme-showcase.tsx` (new) | Section 8: 4 programme cards from typed records |
| `lib/home/programme-summaries.ts` (new) | Computes `{type, editionCount, latestYear}` per programme from the typed records |
| `components/home/gba-gateway.tsx` (new) | Section 9: `cohortRepository.listPublicCohorts` open-cohort flag |
| `components/home/impact-evidence.tsx` (new) | Section 10: renders `lib/home/impact-metrics.ts` tiles, omitting zero/failed ones |
| `lib/home/impact-metrics.ts` (new) | Computes `{pastEvents, publishedPartners, asaRegions}` at request time (D-8) |
| `components/home/archive-stories.tsx` (new) | Section 11: `featuredOnly(milestones)` top 4 (D-9) |
| `components/home/legacy-network.tsx` (new, `'use client'`) | Section 12: 3-tab partner network, data passed in; replaces `HomePartnerWall` |
| `lib/home/legacy-network-groups.ts` (new) | `partnersRepository.listPublished` grouped by category |
| `components/home/conversion-paths.tsx` (new) | Section 13: static membership/partnership panels |
| `lib/structured-data.ts` (modify) | `buildOrganizationData()` gains `alternateName`/`telephone`/`address`; new `buildWebSiteData()` |
| `components/seo/structured-data.tsx` (modify) | `StructuredData`'s `data` union gains `WebSite` |
| `messages/en.json`, `messages/zh-HK.json` (modify) | New `Home.*` namespace per section (below); old highlights/features/partnerWall/programs keys retired in Task 15 |
| `lighthouserc.js` (modify) | Adds `/` and `/zh` to the collected URLs |
| `tests/unit/contact-concierge-launcher.test.tsx` (modify) | Phone assertion derives from `siteConfig.contact.phone` |
| `tests/unit/site-footer.test.tsx` (modify) | Footer always renders the `tel:` line now that the phone is set |
| `tests/unit/home-hero.test.tsx` … `tests/unit/home-conversion-paths.test.tsx` (new) | One focused test per section (13 files) |
| `tests/unit/impact-metrics.test.ts` (new) | Pins `lib/home/impact-metrics.ts`'s computation and omission rules |
| `tests/unit/homepage.test.tsx` (rewrite) | Asserts the 13 landmarks in document order, empty/available branching, legacy-network hidden at 0 partners, impact tiles omitted at 0 |
| `tests/unit/home-partner-wall.test.tsx`, `tests/unit/homepage-partner-wall-integration.test.tsx` (delete) | Superseded by `tests/unit/home-legacy-network.test.tsx` and the rewritten `homepage.test.tsx` |
| `components/marketing/editorial-hero.tsx`, `feature-grid.tsx`, `home-partner-wall.tsx`, `program-grid.tsx` (delete) | Fully superseded by `components/home/*`; `components/marketing/section.tsx` and `home-highlight-card.tsx` are **kept** — the former is still used by `/membership` and `/launchpad`, the latter still has its own regression coverage in `tests/unit/media-revocation-render.test.tsx` |
| `tests/e2e/wisetech-pr3-public-pages.spec.ts` (modify) | New H1, new hero action count, re-measured `#home-discover` ratio (E-52) |
| `tests/e2e/accessibility.spec.ts` or a new WP-3 file (modify/new) | Re-measured overlay-header focus-ring contrast (E-64) |

---

### Task 1: Phone number and contact-page fix (design doc §1, closes errata E-20)

**Files:**
- Modify: `config/site.ts`
- Modify: `app/[locale]/(public)/contact/page.tsx`
- Modify: `tests/unit/contact-concierge-launcher.test.tsx`
- Modify: `tests/unit/site-footer.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/contact-concierge-launcher.test.tsx` — replace the hard-coded assertion at line 31 with one that derives the expected `href` from config, so a future edit to `config/site.ts` is what changes the page, not a second hand edit:

```ts
// at the top of the file, alongside the other imports
import {siteConfig} from "@/config/site";
```

```ts
    expect(en).toContain('href="mailto:contact@hkwtia.org"');
    expect(siteConfig.contact.phone).toBeDefined();
    expect(en).toContain(`href="tel:${siteConfig.contact.phone!.replace(/\s/g, "")}"`);
    expect(en).toContain(siteConfig.contact.phone!);
```

`tests/unit/site-footer.test.tsx` — the phone is no longer an opt-in field a single test mutates in; replace lines 117-118 (`expect(footer.querySelector('a[href^="tel:"]')).toBeNull(); expect(siteConfig.contact.phone).toBeUndefined();`) with:

```ts
    expect(within(footer).getByRole("link", {name: "+852 2989 9164"}))
      .toHaveAttribute("href", "tel:+85229899164");
    expect(siteConfig.contact.phone).toBe("+852 2989 9164");
```

and delete the now-redundant `it("renders the tel: line once a phone is configured", ...)` block (lines 147-157) — the assertion it existed to prove is now the permanent behaviour asserted above, and the `delete contact.phone` mutation it used no longer models a real state.

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

Run: `npx vitest run tests/unit/contact-concierge-launcher.test.tsx tests/unit/site-footer.test.tsx`
Expected: FAIL — `contact-concierge-launcher.test.tsx` fails because `siteConfig.contact.phone` is `undefined` (`replace` on `undefined` throws, or the `toBeDefined()` assertion fails first); `site-footer.test.tsx` fails because no `link` named "+852 2989 9164" exists in the footer yet.

- [ ] **Step 3: Set the phone number in config**

`config/site.ts` — add the field and update the comment, which currently frames the number as unverifiable:

```ts
/**
 * ... (existing paragraph about email/phone being what the footer prints is unchanged) ...
 *
 * `phone` is now confirmed by the product owner as `+852 2989 9164` (errata E-20's owner
 * action). The footer renders its `tel:` line unconditionally as soon as this field is set;
 * `app/[locale]/(public)/contact/page.tsx` reads the same field rather than its own literal,
 * so the two surfaces cannot disagree again.
 */
```

```ts
export const siteContact: SiteContact = {
  email: 'contact@hkwtia.org',
  phone: '+852 2989 9164',
  addressLines: ['4/F, KOHO', '73-75 Hung To Road', 'Kwun Tong, Hong Kong']
};
```

- [ ] **Step 4: Read the phone from config on the contact page**

`app/[locale]/(public)/contact/page.tsx` — add the import and replace the hard-coded literal at line 55:

```ts
import {siteConfig} from '@/config/site';
```

```tsx
            <a className="block font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${siteConfig.contact.phone!.replace(/\s/g, "")}`}>{siteConfig.contact.phone}</a>
```

(The `!` is safe here: this page prints a phone unconditionally, unlike the footer, which still branches on `phone` being set for the general case of an unset number.)

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/contact-concierge-launcher.test.tsx tests/unit/site-footer.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add config/site.ts "app/[locale]/(public)/contact/page.tsx" tests/unit/contact-concierge-launcher.test.tsx tests/unit/site-footer.test.tsx
git commit -m "$(cat <<'EOF'
fix: confirm the WTIA phone number and read it from config on both surfaces

The owner confirmed +852 2989 9164 (errata E-20). config/site.ts now carries
it so the footer's conditional tel: line renders, and the contact page reads
the same field instead of its own hard-coded literal, so the two surfaces
cannot drift apart again.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Hero (section 1) — donor top-spanning scrim (design doc §2, closes errata E-47)

**Files:**
- Create: `components/home/hero.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-hero.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-hero.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>(
    (value, part) => (value as Record<string, unknown> | undefined)?.[part],
    bundles[locale],
  );
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("next/image", () => ({
  default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Hero", () => {
  it.each(["en", "zh-HK"] as const)("renders the donor top-scrim hero over the placeholder photo in %s", async (locale) => {
    const {Hero} = await import("@/components/home/hero");
    render(await Hero({locale}));

    const heading = screen.getByRole("heading", {level: 1, name: bundles[locale].Home.hero.title});
    expect(heading).toHaveAttribute("id", "hero-title");
    const section = heading.closest("section")!;
    expect(section).toHaveAttribute("aria-labelledby", "hero-title");
    expect(section).toHaveClass("hero");
    expect(section.querySelector(".hero-scrim")).not.toBeNull();
    expect(section.querySelector(".network-field")).not.toBeNull();

    const image = screen.getByRole("img", {name: bundles[locale].Home.hero.imageAlt});
    expect(image).toHaveAttribute("src", "/images/projects-hero.jpg");
    expect(image).toHaveClass("hero-image");
    expect(image).toHaveAttribute("data-priority", "true");
    expect(image).toHaveAttribute("sizes", "100vw");

    const actions = section.querySelectorAll(".hero-actions a");
    expect(actions).toHaveLength(3);
    expect(actions[0]).toHaveAttribute("href", "/events?status=open");
    expect(actions[1]).toHaveAttribute("href", "/join");
    expect(actions[2]).toHaveAttribute("href", "/showcase");

    const discover = screen.getByRole("link", {name: new RegExp(bundles[locale].Home.hero.discover)});
    expect(discover).toHaveAttribute("href", "#home-discover");
    expect(discover).toHaveClass("hero-scroll");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-hero.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/hero`.

- [ ] **Step 3: Add the message keys**

`Home.hero.*` — replace the whole existing flat `Home` block (`eyebrow`, `title`, `question`, `summary`, `imageAlt`, `actions.*`) is deferred to Task 15, when nothing references it any more; for now, add the new nested block alongside it (both bundles carry the new keys in parity from this task on):

| Key | EN | ZH |
|---|---|---|
| `Home.hero.eyebrow` | WiseTech Hong Kong | WiseTech Hong Kong |
| `Home.hero.title` | How can Hong Kong lead the AI+ era? | 香港如何引領 AI+ 時代？ |
| `Home.hero.lead` | WiseTech Hong Kong is the evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association — connecting corporates, SMEs, startups, professionals, academia, investors, public bodies, GBA partners and international markets. | WiseTech Hong Kong 是 Hong Kong Wireless Technology Industry Association 持續發展中的 AI+ 產業平台，連結企業、中小企、初創、專業人士、學界、投資者、公共機構、大灣區夥伴及國際市場。 |
| `Home.hero.imageAlt` | Hong Kong technology community | 香港創科社群 |
| `Home.hero.actions.findEvent` | Find Event or Activity | 尋找活動或參與機會 |
| `Home.hero.actions.join` | Join WiseTech | 加入 WiseTech |
| `Home.hero.actions.members` | Explore Members & Solutions | 探索會員及方案 |
| `Home.hero.note` | WiseTech Hong Kong · AI+ Industry Platform | WiseTech Hong Kong · AI+ 產業平台 |
| `Home.hero.discover` | Discover WiseTech | 探索 WiseTech |

The `lead` text keeps the Chinese legal-name caveat ("中文法定名稱待正式批准") off this new surface: D-10 already states it once on `Navigation.brand.descriptor` and once on `Footer.legalLine` (WP-2), and E-69 records that printing the same caveat a third time on a nearby surface is the exact defect that review pass corrected — the hero paragraph must not reintroduce it.

- [ ] **Step 4: Implement `components/home/hero.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';
import Image from 'next/image';

import {assertOwnOriginEditorialImage} from '@/components/marketing/institutional-page-intro';
import {ActionLink} from '@/components/wt/action-link';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

const HERO_IMAGE = '/images/projects-hero.jpg';

// Donor top-spanning scrim (design doc §2, closes E-47): app/styles/wisetech.css:92 .hero;
// :93 .hero-image/.hero-scrim/.network-field; :99 .hero-content; :102 .hero-actions;
// :103 .hero-note; :104 .hero-scroll. The photo stays the placeholder until WP-5.
export async function Hero({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.hero'});
  const image = assertOwnOriginEditorialImage(HERO_IMAGE);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <Image alt={t('imageAlt')} className="hero-image" fill priority sizes="100vw" src={image} />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="network-field" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="hero-content shell">
        <p className="eyebrow light">{t('eyebrow')}</p>
        <h1 id="hero-title">{t('title')}</h1>
        <p>{t('lead')}</p>
        <div className="hero-actions">
          <ActionLink href="/events?status=open" variant="button">{t('actions.findEvent')}</ActionLink>
          <ActionLink href="/join" variant="text-link-light">{t('actions.join')}</ActionLink>
          <ActionLink href="/showcase" variant="text-link-light">{t('actions.members')}</ActionLink>
        </div>
      </div>
      <div className="hero-note">{t('note')}</div>
      <Link className="hero-scroll" href="#home-discover">
        <span aria-hidden="true" />
        {t('discover')}
      </Link>
    </section>
  );
}
```

`#home-discover` is the pre-existing scroll anchor from the old highlights grid; Task 3 (Open Now) puts the id on its own section, since Open Now is the first section below the hero — the anchor contract E-52 tracks survives, only its content changes.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-hero.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/hero.tsx messages/en.json messages/zh-HK.json tests/unit/home-hero.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage hero with the donor's top-spanning scrim

Section 1 of 13. Replaces EditorialHero's left-to-right fade with the donor's
scrim band across the header strip (design doc §2, closes errata E-47), over
the unchanged placeholder photo. Hero actions and the #home-discover anchor
are wired for the sections Tasks 3-14 add below it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Open Now (section 2) — `eventsRepository.listPublic`, status `open`

**Files:**
- Create: `components/home/open-now.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-open-now.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-open-now.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic}}));

describe("OpenNow", () => {
  it("renders the #home-discover honest-empty state and both interest actions when no event is open", async () => {
    listPublic.mockResolvedValueOnce([]);
    const {OpenNow} = await import("@/components/home/open-now");
    render(await OpenNow({locale: "en"}));

    expect(document.querySelector("#home-discover")).not.toBeNull();
    const heading = screen.getByRole("heading", {level: 3, name: bundles.en.Home.openNow.empty.title});
    expect(heading.closest(".honest-empty")).not.toBeNull();
    expect(screen.getByRole("link", {name: bundles.en.Home.openNow.updatesAction})).toHaveAttribute("href", "/events?status=open");
    expect(screen.getByRole("link", {name: bundles.en.Home.openNow.challengeAction})).toHaveAttribute("href", "/contact");
  });

  it("renders up to 3 open events as cards linking to their own event page when available", async () => {
    listPublic.mockResolvedValueOnce([
      {id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2026-10-01T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
      {id: "2", slug: "demo-day", title: "Demo Day", description: "d", startsAt: "2026-11-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null},
    ]);
    const {OpenNow} = await import("@/components/home/open-now");
    render(await OpenNow({locale: "en"}));

    expect(screen.queryByText(bundles.en.Home.openNow.empty.title)).not.toBeInTheDocument();
    const card = screen.getByRole("heading", {level: 3, name: "AI Clinic"}).closest("article")!;
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/events/ai-clinic");
    expect(within(card).getByText(/Kwun Tong/)).toBeInTheDocument();
    expect(screen.getByRole("heading", {level: 3, name: "Demo Day"})).toBeInTheDocument();
    expect(listPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      expect.objectContaining({status: "open", locale: "en", limit: 3}),
    );
  });

  it("degrades to the honest-empty state when the read rejects", async () => {
    listPublic.mockRejectedValueOnce(new Error("db down"));
    const {OpenNow} = await import("@/components/home/open-now");
    render(await OpenNow({locale: "en"}));

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Home.openNow.empty.title})).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-open-now.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/open-now`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.openNow.eyebrow` | Open now | 現正開放 |
| `Home.openNow.title` | What can you join today? | 今天有甚麼可以參加？ |
| `Home.openNow.intro` | Only activities with confirmed dates, eligibility and registration details appear here. | 只有日期、資格及報名詳情已確認的活動，才會在此顯示。 |
| `Home.openNow.statusLabel` | Current availability | 目前狀態 |
| `Home.openNow.empty.title` | No activities are currently open. | 目前未有活動開放報名。 |
| `Home.openNow.empty.copy` | Register for activity updates, or bring the team a defined business challenge to help shape a useful future session. | 登記接收活動通知，或向團隊提出明確業務挑戰，協助策劃實用的未來活動。 |
| `Home.openNow.updatesAction` | Get activity updates | 接收活動通知 |
| `Home.openNow.challengeAction` | Submit a challenge | 提交挑戰 |

- [ ] **Step 4: Implement `components/home/open-now.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {CardGrid} from '@/components/wt/card-grid';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {eventsRepository} from '@/lib/db/repos/events';

const anonymous = {kind: 'anonymous', userId: null} as const;

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(new Date(value));
}

// Section 2 of 13. #home-discover is the pre-existing scroll anchor (E-52); this is the
// first section below the hero, so the anchor moved here from the old highlights grid.
// app/styles/wisetech.css:184 .opportunity-section; :764 .open-now-actions.
export async function OpenNow({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.openNow'});
  const events = await eventsRepository
    .listPublic(anonymous, {status: 'open', asOf: new Date(), locale, limit: 3})
    .catch(() => []);

  return (
    <Section id="home-discover" tone="ink" labelledBy="open-now-title">
      <SectionHeading
        eyebrow={t('eyebrow')}
        title={t('title')}
        headingId="open-now-title"
        variant="split"
        lead={t('intro')}
        inverse
      />
      {events.length > 0 ? (
        <CardGrid
          variant="service"
          items={events.map((event) => ({
            title: event.title,
            copy: event.venue ? `${formatDate(event.startsAt, locale)} · ${event.venue}` : formatDate(event.startsAt, locale),
            href: `/events/${event.slug}`,
          }))}
        />
      ) : (
        <HonestEmpty
          label={t('statusLabel')}
          title={t('empty.title')}
          copy={t('empty.copy')}
          actions={[
            {label: t('updatesAction'), href: '/events?status=open'},
            {label: t('challengeAction'), href: '/contact'},
          ]}
        />
      )}
    </Section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-open-now.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/open-now.tsx messages/en.json messages/zh-HK.json tests/unit/home-open-now.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage Open Now section over real open events

Section 2 of 13. Reads eventsRepository.listPublic (status open, limit 3);
renders up to 3 events as cards when available, otherwise the honest-empty
state with the interest and challenge actions. Carries the #home-discover
anchor forward from the retired highlights grid.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Pathways (section 3) — 5 static audience cards (D-7)

**Files:**
- Create: `components/home/pathways.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-pathways.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-pathways.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Pathways", () => {
  it("renders the 5 audience cards with the D-7 canonical hrefs, in order", async () => {
    const {Pathways} = await import("@/components/home/pathways");
    render(await Pathways({locale: "en"}));

    const cards = screen.getAllByRole("link").filter((link) => link.className.includes("audience-card"));
    expect(cards).toHaveLength(5);
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([
      "/membership", "/events", "/showcase", "/membership", "/launchpad",
    ]);
    expect(cards.map((card) => card.className)).toEqual([
      "audience-card accent-cyan", "audience-card accent-jade", "audience-card accent-amber",
      "audience-card accent-blue", "audience-card accent-violet",
    ]);
    expect(screen.getByText(bundles.en.Home.pathways.items.corporates.title)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.pathways.items.gba.cta)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-pathways.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/pathways`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.pathways.eyebrow` | Your pathway | 你的路徑 |
| `Home.pathways.title` | Where do you want to create impact? | 你希望在哪裡創造影響？ |
| `Home.pathways.intro` | Different ambitions need different routes. Start with the outcome you want, not the structure of an institution. | 不同目標需要不同路徑。先從你希望達成的成果開始，而非機構架構。 |
| `Home.pathways.items.corporates.title` | For Corporates | 企業 |
| `Home.pathways.items.corporates.copy` | Find solutions, talent and innovation partners. | 尋找技術方案、人才及創新夥伴。 |
| `Home.pathways.items.corporates.benefits` | Buyer challenges · Executive briefings · Industry councils | 企業挑戰 · 高層簡報 · 產業委員會 |
| `Home.pathways.items.corporates.cta` | Explore membership | 探索會籍 |
| `Home.pathways.items.smes.title` | For SMEs | 中小企 |
| `Home.pathways.items.smes.copy` | Turn AI opportunities into practical improvements. | 把 AI 機遇轉化為實際業務改善。 |
| `Home.pathways.items.smes.benefits` | Readiness · Clinics · Trusted providers | 準備度評估 · 診所 · 可信供應商 |
| `Home.pathways.items.smes.cta` | Find an event | 尋找活動 |
| `Home.pathways.items.startups.title` | For Startups | 初創企業 |
| `Home.pathways.items.startups.copy` | Meet buyers, investors and regional partners. | 連繫買家、投資者及區域夥伴。 |
| `Home.pathways.items.startups.benefits` | Structured visibility · Demo days · Market entry | 結構化曝光 · 展示日 · 市場進入 |
| `Home.pathways.items.startups.cta` | Explore the showcase | 探索方案展示 |
| `Home.pathways.items.professionals.title` | For Professionals | 專業人士 |
| `Home.pathways.items.professionals.copy` | Build skills, influence industry and expand your network. | 增進技能、參與產業發展並拓展網絡。 |
| `Home.pathways.items.professionals.benefits` | Councils · Certification · Mentorship | 委員會 · 專業認證 · 導師計劃 |
| `Home.pathways.items.professionals.cta` | Explore membership | 探索會籍 |
| `Home.pathways.items.gba.title` | For GBA & Global Partners | 大灣區及國際夥伴 |
| `Home.pathways.items.gba.copy` | Connect with Hong Kong technology and market opportunities. | 連接香港科技力量與市場機遇。 |
| `Home.pathways.items.gba.benefits` | Soft landing · Delegations · Buyer matching | 落地支援 · 考察團 · 買家配對 |
| `Home.pathways.items.gba.cta` | Explore Launch Pad | 探索創科加速平台 |

- [ ] **Step 4: Implement `components/home/pathways.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {CardIndex} from '@/components/wt/card-index';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

// D-7: SME is an audience pathway card, not a fifth plan. Hrefs are hkwtia's canonical
// destinations (master table row 3), not the donor's unported routes.
const items = [
  {key: 'corporates', href: '/membership', accent: 'cyan'},
  {key: 'smes', href: '/events', accent: 'jade'},
  {key: 'startups', href: '/showcase', accent: 'amber'},
  {key: 'professionals', href: '/membership', accent: 'blue'},
  {key: 'gba', href: '/launchpad', accent: 'violet'},
] as const;

// Section 3 of 13. app/styles/wisetech.css:137 .audience-grid; :138 .audience-card;
// :149 .benefit-line (hover reveal).
export async function Pathways({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.pathways'});

  return (
    <Section labelledBy="pathways-title" id="pathways">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="pathways-title" variant="split" lead={t('intro')} />
      <div className="audience-grid">
        {items.map((item, index) => (
          <Link key={item.key} className={`audience-card accent-${item.accent}`} href={item.href}>
            <CardIndex index={index + 1} />
            <h3>{t(`items.${item.key}.title`)}</h3>
            <p>{t(`items.${item.key}.copy`)}</p>
            <span className="benefit-line">{t(`items.${item.key}.benefits`)}</span>
            <b>{t(`items.${item.key}.cta`)} <Arrow /></b>
          </Link>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-pathways.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/pathways.tsx messages/en.json messages/zh-HK.json tests/unit/home-pathways.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage pathways section with the D-7 audience cards

Section 3 of 13. Five static audience cards (corporates, SMEs, startups,
professionals, GBA partners) over hkwtia's canonical destinations rather
than the donor's unported routes; SME stays an audience pathway, not a
fifth membership plan, per D-7.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Events Journey (section 4) — `eventsRepository.listFeaturedPublic`

**Files:**
- Create: `components/home/events-journey.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-events-journey.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-events-journey.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listFeaturedPublic = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listFeaturedPublic}}));

describe("EventsJourney", () => {
  it("always renders the 3-stage Before/During/After grid", async () => {
    listFeaturedPublic.mockResolvedValueOnce([]);
    const {EventsJourney} = await import("@/components/home/events-journey");
    render(await EventsJourney({locale: "en"}));

    const grid = document.querySelector(".event-stage-grid")!;
    expect(within(grid).getByText(bundles.en.Home.eventsJourney.stages.before.title)).toBeInTheDocument();
    expect(within(grid).getByText(bundles.en.Home.eventsJourney.stages.during.title)).toBeInTheDocument();
    expect(within(grid).getByText(bundles.en.Home.eventsJourney.stages.after.title)).toBeInTheDocument();
  });

  it("renders the .event-empty CTA to /events when no featured event exists", async () => {
    listFeaturedPublic.mockResolvedValueOnce([]);
    const {EventsJourney} = await import("@/components/home/events-journey");
    render(await EventsJourney({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.eventsJourney.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Home.eventsJourney.viewAllAction})).toHaveAttribute("href", "/events");
  });

  it("renders up to 2 featured events as cards when available, and calls the repository with limit 2", async () => {
    listFeaturedPublic.mockResolvedValueOnce([
      {id: "1", slug: "demo-day", title: "Demo Day", description: "d", startsAt: "2026-10-01T02:00:00.000Z", endsAt: null, venue: "Kwun Tong", capacity: 40, hero: null},
    ]);
    const {EventsJourney} = await import("@/components/home/events-journey");
    render(await EventsJourney({locale: "en"}));

    expect(screen.queryByText(bundles.en.Home.eventsJourney.emptyTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: /Demo Day/})).toHaveAttribute("href", "/events/demo-day");
    expect(listFeaturedPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      expect.objectContaining({limit: 2, locale: "en"}),
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-events-journey.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/events-journey`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.eventsJourney.eyebrow` | Upcoming Events & Activities | 即將舉行活動及參與機會 |
| `Home.eventsJourney.title` | A useful event is a journey, not a single date. | 有用活動是一段旅程，而不只是一個日期。 |
| `Home.eventsJourney.intro` | See how discovery, preparation and follow-through work, or explore what is currently open. | 了解活動發現、準備及跟進流程，或瀏覽現正開放的活動。 |
| `Home.eventsJourney.stages.before.title` | Before | 活動前 |
| `Home.eventsJourney.stages.before.copy` | Recommendations, pricing, capacity and matchmaking. | 推薦、票價、名額及配對。 |
| `Home.eventsJourney.stages.during.title` | During | 活動中 |
| `Home.eventsJourney.stages.during.copy` | Check-in, sessions, questions and meetings. | 登記、議程、提問及會面。 |
| `Home.eventsJourney.stages.after.title` | After | 活動後 |
| `Home.eventsJourney.stages.after.copy` | Resources, introductions, follow-up and outcomes. | 資源、引薦、跟進及成果。 |
| `Home.eventsJourney.statusLabel` | Current availability | 目前狀態 |
| `Home.eventsJourney.emptyTitle` | No activities are currently open. | 目前未有活動開放報名。 |
| `Home.eventsJourney.viewAllAction` | View Open Now & Past Events | 查看現正開放及過往活動 |

- [ ] **Step 4: Implement `components/home/events-journey.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {eventsRepository} from '@/lib/db/repos/events';

const anonymous = {kind: 'anonymous', userId: null} as const;
const stageKeys = ['before', 'during', 'after'] as const;

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(new Date(value));
}

// Section 4 of 13. app/styles/wisetech.css:227 .event-stage-grid; :232 .event-empty.
export async function EventsJourney({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.eventsJourney'});
  const events = await eventsRepository
    .listFeaturedPublic(anonymous, {asOf: new Date(), limit: 2, locale})
    .catch(() => []);

  return (
    <Section labelledBy="events-journey-title" id="events-journey">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="events-journey-title" variant="split" lead={t('intro')} />
      <div className="event-stage-grid">
        {stageKeys.map((stage, index) => (
          <article key={stage}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{t(`stages.${stage}.title`)}</h3>
            <p>{t(`stages.${stage}.copy`)}</p>
          </article>
        ))}
      </div>
      {events.length > 0 ? (
        <div className="service-grid">
          {events.map((event) => (
            <Link className="service-link" href={`/events/${event.slug}`} key={event.id}>
              <h3>{event.title}</h3>
              <p>{event.venue ? `${formatDate(event.startsAt, locale)} · ${event.venue}` : formatDate(event.startsAt, locale)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="event-empty">
          <div>
            <span className="status-label">{t('statusLabel')}</span>
            <h3>{t('emptyTitle')}</h3>
          </div>
          <ActionLink href="/events" variant="button-dark">{t('viewAllAction')}</ActionLink>
        </div>
      )}
    </Section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-events-journey.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/events-journey.tsx messages/en.json messages/zh-HK.json tests/unit/home-events-journey.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage events-journey section over featured public events

Section 4 of 13. The Before/During/After stage grid always renders; below
it, up to 2 eventsRepository.listFeaturedPublic results render as cards, or
the donor's .event-empty CTA to /events when none are open.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Market Products (section 5) — `showcaseRepository.listPublished` presence only

**Files:**
- Create: `components/home/market-products.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-market-products.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-market-products.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublished = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listPublished}}));

describe("MarketProducts", () => {
  it("prints the donor's exact 'no live records' copy on both panels when nothing is published", async () => {
    listPublished.mockResolvedValueOnce([]);
    const {MarketProducts} = await import("@/components/home/market-products");
    render(await MarketProducts({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.marketProducts.directory.copyEmpty)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.marketProducts.marketplace.copyEmpty)).toBeInTheDocument();
    expect(showcaseRepositoryCalledWithBound()).toBe(true);

    function showcaseRepositoryCalledWithBound() {
      const [, options] = listPublished.mock.calls[0] as [unknown, {limit: number}];
      return options.limit === 12;
    }
  });

  it("switches both panels to the available copy, with no printed count, when records are published", async () => {
    listPublished.mockResolvedValueOnce([{}, {}]);
    const {MarketProducts} = await import("@/components/home/market-products");
    render(await MarketProducts({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.marketProducts.directory.copyAvailable)).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.marketProducts.marketplace.copyAvailable)).toBeInTheDocument();
    expect(screen.queryByText(/^2$/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Home.marketProducts.directory.action})).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("link", {name: bundles.en.Home.marketProducts.marketplace.action})).toHaveAttribute("href", "/showcase");
  });

  it("degrades to the empty copy when the read rejects", async () => {
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const {MarketProducts} = await import("@/components/home/market-products");
    render(await MarketProducts({locale: "en"}));

    expect(screen.getByText(bundles.en.Home.marketProducts.directory.copyEmpty)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-market-products.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/market-products`.

- [ ] **Step 3: Add the message keys**

The read is bounded to 12 records (never a total), so the "available" copy states that records exist without a number — printing the length of a 12-record-bounded fetch as if it were a total count would itself be the kind of fabricated figure D-8 forbids for the Impact section, and the same principle applies here even though this row is not in the D-8 table.

| Key | EN | ZH |
|---|---|---|
| `Home.marketProducts.eyebrow` | Demand + Supply | 供需連結 |
| `Home.marketProducts.title` | Connections built for implementation | 為真正落地而建立的連結 |
| `Home.marketProducts.directory.label` | Member Directory | 會員名錄 |
| `Home.marketProducts.directory.title` | Meet the people shaping what comes next. | 認識正在塑造未來的人。 |
| `Home.marketProducts.directory.copyEmpty` | The directory is ready for approved public profiles, with controlled visibility and consent-based introductions. No live member records are shown yet. | 名錄已準備承載獲批公開的專頁，並設有可控可見度及需獲同意的引薦流程；目前尚未顯示現行會員紀錄。 |
| `Home.marketProducts.directory.copyAvailable` | Published member solutions are now live, with controlled visibility and consent-based introductions. | 已發布的會員方案現已上線，設有可控可見度及需獲同意的引薦流程。 |
| `Home.marketProducts.directory.action` | Discover members | 探索會員 |
| `Home.marketProducts.marketplace.label` | AI Solutions Marketplace | AI 解決方案市場 |
| `Home.marketProducts.marketplace.title` | Find AI ready for the real world. | 尋找可在真實環境落地的 AI。 |
| `Home.marketProducts.marketplace.copyEmpty` | The planned marketplace will compare maturity, deployment, security, market coverage and reviewed evidence. No live solution records are shown yet. | 規劃中的方案市場將比較成熟度、部署方式、安全、市場覆蓋及經審閱證據；目前尚未顯示現行方案紀錄。 |
| `Home.marketProducts.marketplace.copyAvailable` | Published solutions are now live to compare, by use case, deployment and reviewed evidence. | 已發布方案現已上線，可按用途、部署方式及已審閱證據比較。 |
| `Home.marketProducts.marketplace.action` | Explore solutions | 探索解決方案 |

- [ ] **Step 4: Implement `components/home/market-products.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {showcaseRepository} from '@/lib/db/repos/showcase';

const panels = [
  {key: 'directory', index: '01', href: '/showcase'},
  {key: 'marketplace', index: '02', href: '/showcase'},
] as const;

// Section 5 of 13. app/styles/wisetech.css:198 .product-split; :199 .product-panel;
// :202 .product-panel-head.
export async function MarketProducts({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.marketProducts'});
  const listings = await showcaseRepository.listPublished({}, {limit: 12}).catch(() => []);
  const available = listings.length > 0;

  return (
    <Section labelledBy="market-products-title" id="market-products">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="market-products-title" variant="stacked" />
      <div className="product-split">
        {panels.map((panel) => (
          <article className="product-panel" key={panel.key}>
            <div className="product-panel-head">
              <span>{panel.index}</span>
              <span className="status-label">{t(`${panel.key}.label`)}</span>
            </div>
            <h3>{t(`${panel.key}.title`)}</h3>
            <p>{t(available ? `${panel.key}.copyAvailable` : `${panel.key}.copyEmpty`)}</p>
            <Link className="text-link" href={panel.href}>{t(`${panel.key}.action`)} <Arrow /></Link>
          </article>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-market-products.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/market-products.tsx messages/en.json messages/zh-HK.json tests/unit/home-market-products.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage market-products section over showcase presence

Section 5 of 13. showcaseRepository.listPublished is bounded to 12 and used
only for presence (records exist or not) -- its length is never printed as
a total, since a 12-record-bounded fetch is not a real count.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Outcomes (section 6) — always the honest publishing-framework state (D-8)

**Files:**
- Create: `components/home/outcomes.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-outcomes.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-outcomes.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("Outcomes", () => {
  it("always renders the honest publishing-framework state, with no data owner", async () => {
    const {Outcomes} = await import("@/components/home/outcomes");
    render(await Outcomes({locale: "en"}));

    expect(screen.getByRole("heading", {level: 3, name: bundles.en.Home.outcomes.emptyTitle})).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.outcomes.frameworkSteps)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: bundles.en.Home.outcomes.action})).toHaveAttribute("href", "/contact");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-outcomes.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/outcomes`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.outcomes.eyebrow` | Outcome stories | 成果故事 |
| `Home.outcomes.title` | Results should be specific, attributable and permission-cleared. | 成果必須具體、有清晰歸屬並獲授權公開。 |
| `Home.outcomes.intro` | A case is published only when the participating organisation, challenge, action, reporting period and result can be stated responsibly. | 只有在參與機構、挑戰、行動、報告期及成果均可負責任地交代時，案例才會發布。 |
| `Home.outcomes.frameworkLabel` | Publishing framework | 發布框架 |
| `Home.outcomes.frameworkSteps` | Challenge → Connection → Action → Result | 挑戰 → 連結 → 行動 → 成果 |
| `Home.outcomes.statusLabel` | Current availability | 目前狀態 |
| `Home.outcomes.emptyTitle` | No public case study is available yet. | 目前尚未有公開案例。 |
| `Home.outcomes.emptyCopy` | The Association will add outcome stories only after the evidence, attribution and permission to publish have been confirmed. This avoids turning participation into an unsupported success claim. | 商會只會在證據、歸屬及發布許可獲確認後加入成果故事，避免把參與誤寫成未獲支持的成功聲稱。 |
| `Home.outcomes.action` | Discuss a measurable initiative | 洽談可量度項目 |

- [ ] **Step 4: Implement `components/home/outcomes.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

// Section 6 of 13. No data owner exists for outcome stories today (D-8) -- this section is
// always the honest publishing-framework state, never a fabricated case.
// app/styles/wisetech.css:247 .outcome-template; :249 .outcome-visual.
export async function Outcomes({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.outcomes'});

  return (
    <Section labelledBy="outcomes-title" id="outcomes">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="outcomes-title" variant="split" lead={t('intro')} />
      <div className="outcome-template">
        <div className="outcome-visual">
          <span>{t('frameworkLabel')}</span>
          <b>{t('frameworkSteps')}</b>
        </div>
        <div>
          <span className="status-label">{t('statusLabel')}</span>
          <h3>{t('emptyTitle')}</h3>
          <p>{t('emptyCopy')}</p>
          <Link className="text-link" href="/contact">{t('action')} <Arrow /></Link>
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-outcomes.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/outcomes.tsx messages/en.json messages/zh-HK.json tests/unit/home-outcomes.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage outcomes section as an always-honest empty state

Section 6 of 13. No repository or typed record backs outcome stories today
(D-8), so this section states the publishing framework and never fabricates
a case study.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Ecosystem (section 7) — 6-industry client selector (D-4)

A function cannot cross the server/client boundary as a prop, and a `'use client'` module's plain (non-component) exports cannot safely be called from server render code, so the localized industry list is built by a pure helper in `lib/home/`, called from `page.tsx` (Task 15) and passed into the client component as serializable data — matching the master table's "list passed in".

**Files:**
- Create: `lib/home/ecosystem-industries.ts`
- Create: `components/home/ecosystem.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-ecosystem.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-ecosystem.test.tsx`

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("buildEcosystemIndustries", () => {
  it("resolves the 6 industries in order, with D-4's real hrefs", async () => {
    const {buildEcosystemIndustries} = await import("@/lib/home/ecosystem-industries");
    const industries = buildEcosystemIndustries((key) => `t:${key}`);

    expect(industries.map((industry) => industry.key)).toEqual([
      "commerce", "manufacturing", "health", "responsibleAi", "retail", "education",
    ]);
    expect(industries.map((industry) => industry.href)).toEqual([
      "/showcase?category=commerce-professional-services",
      "/showcase?category=manufacturing-robotics",
      "/showcase?category=health-life-sciences",
      "/ai-transparency",
      "/showcase?category=retail-creative-industries",
      "/events",
    ]);
    expect(industries[0]!.name).toBe("t:items.commerce.name");
  });
});

describe("Ecosystem", () => {
  const industries = [
    {key: "commerce" as const, signal: "01", href: "/showcase?category=commerce-professional-services", name: "Commerce", brief: "Commerce brief"},
    {key: "manufacturing" as const, signal: "02", href: "/showcase?category=manufacturing-robotics", name: "Manufacturing", brief: "Manufacturing brief"},
  ];
  const labels = {
    eyebrow: "AI + Industry", title: "One ecosystem.", intro: "Six pathways.",
    selectedLabel: "Selected industry pathway", enterAction: "Enter this ecosystem",
    focusAreas: ["Industry challenges", "Relevant solution categories", "Programmes + events"],
  };

  it("shows the first industry's detail by default and switches on click", async () => {
    const {Ecosystem} = await import("@/components/home/ecosystem");
    render(<Ecosystem industries={industries} labels={labels} />);

    expect(screen.getByRole("heading", {level: 3, name: "Commerce"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: /Enter this ecosystem/})).toHaveAttribute("href", industries[0]!.href);

    fireEvent.click(screen.getByRole("button", {name: /Manufacturing/}));
    expect(screen.getByRole("heading", {level: 3, name: "Manufacturing"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: /Enter this ecosystem/})).toHaveAttribute("href", industries[1]!.href);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-ecosystem.test.tsx`
Expected: FAIL with a module-not-found error for `@/lib/home/ecosystem-industries` and `@/components/home/ecosystem`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.ecosystem.eyebrow` | AI + Industry | AI + 產業 |
| `Home.ecosystem.title` | One ecosystem. Every industry moving forward. | 一個生態系統，推動每個產業向前。 |
| `Home.ecosystem.intro` | Six industry pathways connect practical questions to technology, knowledge, programmes and market access. | 六條產業路徑把實務問題連接到科技、知識、計劃及市場拓展。 |
| `Home.ecosystem.selectedLabel` | Selected industry pathway | 已選產業路徑 |
| `Home.ecosystem.enterAction` | Enter this ecosystem | 進入此生態系統 |
| `Home.ecosystem.focusAreas` (array) | `["Industry challenges", "Relevant solution categories", "Programmes + events"]` | `["產業挑戰", "相關方案類別", "計劃 + 活動"]` |
| `Home.ecosystem.items.commerce.name` | Commerce + Professional Services | 商貿 + 專業服務 |
| `Home.ecosystem.items.commerce.brief` | Trusted automation, intelligence and client delivery. | 以可信任自動化、智能洞察及客戶服務提升競爭力。 |
| `Home.ecosystem.items.manufacturing.name` | Manufacturing + Robotics | 製造 + 機械人 |
| `Home.ecosystem.items.manufacturing.brief` | From operational challenge to practical deployment. | 把營運挑戰轉化為可落地的技術部署。 |
| `Home.ecosystem.items.health.name` | Health + Life Sciences | 健康 + 生命科學 |
| `Home.ecosystem.items.health.brief` | Human-centred adoption with evidence and care. | 兼顧實證、安全與人的需要。 |
| `Home.ecosystem.items.responsibleAi.name` | Responsible AI + Cybersecurity | 負責任 AI + 網絡安全 |
| `Home.ecosystem.items.responsibleAi.brief` | Governance, privacy and resilience by design. | 從設計開始融入管治、私隱與韌性。 |
| `Home.ecosystem.items.retail.name` | Retail + Creative Industries | 零售 + 創意產業 |
| `Home.ecosystem.items.retail.brief` | New customer experiences and commercial models. | 創造新的顧客體驗與商業模式。 |
| `Home.ecosystem.items.education.name` | Education + Future of Work | 教育 + 未來工作 |
| `Home.ecosystem.items.education.brief` | Skills, productivity and opportunity for people. | 為人才帶來技能、生產力與新機會。 |

`focusAreas` is a plain JSON array (matches the precedent at `Concierge.prompts.*`, per errata E-28: `t.raw` returns a JSON array unchanged; `tests/unit/messages.test.ts` treats an array as one leaf so parity still holds).

- [ ] **Step 4: Implement `lib/home/ecosystem-industries.ts`**

```ts
// D-4: "Enter this ecosystem" links to /showcase?category=<industry> (a real, unvalidated
// filter -- lib/showcase/contracts.ts's category is a free-form string); education routes to
// /events and responsible-ai to /ai-transparency instead, per D-4's own carve-outs.
export type EcosystemIndustryKey = 'commerce' | 'manufacturing' | 'health' | 'responsibleAi' | 'retail' | 'education';
export type EcosystemIndustryView = Readonly<{key: EcosystemIndustryKey; signal: string; href: string; name: string; brief: string}>;

const industries: readonly Readonly<{key: EcosystemIndustryKey; signal: string; href: string}>[] = [
  {key: 'commerce', signal: '01', href: '/showcase?category=commerce-professional-services'},
  {key: 'manufacturing', signal: '02', href: '/showcase?category=manufacturing-robotics'},
  {key: 'health', signal: '03', href: '/showcase?category=health-life-sciences'},
  {key: 'responsibleAi', signal: '04', href: '/ai-transparency'},
  {key: 'retail', signal: '05', href: '/showcase?category=retail-creative-industries'},
  {key: 'education', signal: '06', href: '/events'},
];

export function buildEcosystemIndustries(t: (key: string) => string): readonly EcosystemIndustryView[] {
  return industries.map((industry) => ({
    ...industry,
    name: t(`items.${industry.key}.name`),
    brief: t(`items.${industry.key}.brief`),
  }));
}
```

- [ ] **Step 5: Implement `components/home/ecosystem.tsx`**

```tsx
'use client';

import {useState} from 'react';

import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import type {EcosystemIndustryView} from '@/lib/home/ecosystem-industries';

type EcosystemProps = Readonly<{
  industries: readonly EcosystemIndustryView[];
  labels: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    selectedLabel: string;
    enterAction: string;
    focusAreas: readonly string[];
  }>;
}>;

// Section 7 of 13, 'use client': stateful industry selector, data passed in from page.tsx.
// app/styles/wisetech.css:164 .ecosystem-board; :165 .industry-list; :166 .industry-button;
// :171 .industry-focus.
export function Ecosystem({industries, labels}: EcosystemProps) {
  const [selectedKey, setSelectedKey] = useState(industries[0]!.key);
  const current = industries.find((industry) => industry.key === selectedKey) ?? industries[0]!;

  return (
    <section id="ecosystem" className="section shell ecosystem-section" aria-labelledby="ecosystem-title">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h2 id="ecosystem-title">{labels.title}</h2>
        </div>
        <p>{labels.intro}</p>
      </div>
      <div className="ecosystem-board">
        <div className="industry-list" role="list">
          {industries.map((industry) => (
            <button
              key={industry.key}
              type="button"
              className={industry.key === selectedKey ? 'industry-button active' : 'industry-button'}
              onClick={() => setSelectedKey(industry.key)}
            >
              <span>{industry.signal}</span>
              <b>{industry.name}</b>
              <Arrow />
            </button>
          ))}
        </div>
        <div className="industry-focus" aria-live="polite">
          <p className="eyebrow">{labels.selectedLabel}</p>
          <h3>{current.name}</h3>
          <p>{current.brief}</p>
          <ul>
            {labels.focusAreas.map((area) => <li key={area}>{area}</li>)}
          </ul>
          <Link className="text-link" href={current.href}>{labels.enterAction} <Arrow /></Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-ecosystem.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/home/ecosystem-industries.ts components/home/ecosystem.tsx messages/en.json messages/zh-HK.json tests/unit/home-ecosystem.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage ecosystem section with the D-4 industry selector

Section 7 of 13. components/home/ecosystem.tsx is a 'use client' selector
over 6 static industries; lib/home/ecosystem-industries.ts is the pure
helper that resolves their localized copy and D-4's real hrefs, called from
the server composition in Task 15.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Programme Showcase (section 8) — 4 typed programme records

**Files:**
- Create: `lib/home/programme-summaries.ts`
- Create: `components/home/programme-showcase.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/programme-summaries.test.ts`, `tests/unit/home-programme-showcase.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/programme-summaries.test.ts`

```ts
import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";
import {hkict} from "@/content/programs/hkict";
import {tct} from "@/content/programs/tct";

describe("summarizeProgrammes", () => {
  it("marks cpai a credential with no edition count or year, and the others event series", async () => {
    const {summarizeProgrammes} = await import("@/lib/home/programme-summaries");
    const summaries = summarizeProgrammes();

    expect(summaries.map((programme) => programme.id)).toEqual(["cpai", "hkict", "tct", "asa"]);
    const cpai = summaries.find((programme) => programme.id === "cpai")!;
    expect(cpai.type).toBe("credential");
    expect(cpai.editionCount).toBeNull();
    expect(cpai.latestYear).toBeNull();

    const hkictSummary = summaries.find((programme) => programme.id === "hkict")!;
    expect(hkictSummary.type).toBe("event-series");
    expect(hkictSummary.editionCount).toBe(hkict.editions.length);
    expect(hkictSummary.latestYear).toBe(Math.max(...hkict.editions.map((edition) => edition.year)));

    const tctSummary = summaries.find((programme) => programme.id === "tct")!;
    expect(tctSummary.editionCount).toBe(tct.editions.length);
    expect(tctSummary.latestYear).toBe(Math.max(...tct.editions.map((edition) => edition.year)));

    const asaSummary = summaries.find((programme) => programme.id === "asa")!;
    expect(asaSummary.editionCount).toBe(asa.editions.length);
    expect(asaSummary.latestYear).toBe(Math.max(...asa.editions.map((edition) => edition.yearStart)));
  });
});
```

`tests/unit/home-programme-showcase.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>(
    (v, p) => (v as Record<string, unknown> | undefined)?.[p],
    root,
  );
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const raw = String(messageAt(locale, namespace, key));
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ProgrammeShowcase", () => {
  it("renders 4 programme cards, the first marked .feature, cpai showing no edition count", async () => {
    const {ProgrammeShowcase} = await import("@/components/home/programme-showcase");
    render(await ProgrammeShowcase({locale: "en"}));

    const cards = document.querySelectorAll(".programme-card");
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveClass("feature");

    const cpaiCard = screen.getByRole("heading", {name: bundles.en.Home.programmeShowcase.items.cpai.name}).closest("article")!;
    expect(cpaiCard.textContent).toContain(bundles.en.Home.programmeShowcase.credentialFact);
    expect(cpaiCard.textContent).not.toMatch(/\d+ editions?/);

    const hkictCard = screen.getByRole("heading", {name: bundles.en.Home.programmeShowcase.items.hkict.name}).closest("article")!;
    expect(hkictCard.querySelector("a")).toHaveAttribute("href", "/programs/hkict");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/programme-summaries.test.ts tests/unit/home-programme-showcase.test.tsx`
Expected: FAIL with module-not-found errors for `@/lib/home/programme-summaries` and `@/components/home/programme-showcase`.

- [ ] **Step 3: Add the message keys**

The four programme names and descriptions are carried over unchanged from the retired flat `Home.programs.*` keys (Task 15 removes the old namespace once nothing references it), so this step does not re-author copy that already shipped and reads correctly.

| Key | EN | ZH |
|---|---|---|
| `Home.programmeShowcase.eyebrow` | Programmes + awards | 計劃 + 獎項 |
| `Home.programmeShowcase.title` | Participation that turns into progress | 把參與轉化為進步 |
| `Home.programmeShowcase.intro` | Existing programme equity is retained and reframed around clear outcomes, audiences and the next action. | 保留現有計劃的品牌資產，並以成果、受眾及下一步行動重新呈現。 |
| `Home.programmeShowcase.eventSeriesLabel` | Event series | 活動系列 |
| `Home.programmeShowcase.credentialLabel` | Credential | 專業資格 |
| `Home.programmeShowcase.editionsFact` | `{count, plural, one {# edition} other {# editions}} since {year}` | `自 {year} 年起共 {count} 屆` |
| `Home.programmeShowcase.credentialFact` | Issued directly by WTIA | 由 WTIA 直接頒發 |
| `Home.programmeShowcase.action` | View programme | 查看計劃 |
| `Home.programmeShowcase.items.cpai.name` | CPAI | CPAI |
| `Home.programmeShowcase.items.cpai.description` | A focused programme supporting applied innovation. | 支援應用創新的專項計劃。 |
| `Home.programmeShowcase.items.hkict.name` | HKICT Awards | 香港資訊及通訊科技獎 |
| `Home.programmeShowcase.items.hkict.description` | Recognising excellence across Hong Kong's technology sector. | 表揚香港科技界的卓越成果。 |
| `Home.programmeShowcase.items.tct.name` | TCT | TCT |
| `Home.programmeShowcase.items.tct.description` | Connecting technology, capability and talent. | 連接科技、能力與人才。 |
| `Home.programmeShowcase.items.asa.name` | Asia Smart App Awards | 亞洲智能應用程式大獎 |
| `Home.programmeShowcase.items.asa.description` | Celebrating outstanding smart applications across Asia. | 嘉許亞洲優秀智能應用程式。 |

- [ ] **Step 4: Implement `lib/home/programme-summaries.ts`**

```ts
import {asa} from '@/content/programs/asa';
import {cpai} from '@/content/programs/cpai';
import {hkict} from '@/content/programs/hkict';
import {programs} from '@/content/programs/index';
import {tct} from '@/content/programs/tct';

export type ProgrammeType = 'event-series' | 'credential';
export type ProgrammeSummary = Readonly<{
  id: 'cpai' | 'hkict' | 'tct' | 'asa';
  namespace: string;
  image: string;
  type: ProgrammeType;
  editionCount: number | null;
  latestYear: number | null;
}>;

// content/programs/index.ts is route identity only (id/namespace/image); the factual record --
// including how many editions exist -- lives in the typed record per programme. CPAI is a
// credential with no editions (content/schemas.ts cpaiProgramSchema's own comment).
export function summarizeProgrammes(): readonly ProgrammeSummary[] {
  return programs.map((record) => {
    if (record.id === 'cpai') {
      return {...record, type: 'credential', editionCount: null, latestYear: null};
    }
    if (record.id === 'hkict') {
      return {...record, type: 'event-series', editionCount: hkict.editions.length, latestYear: Math.max(...hkict.editions.map((edition) => edition.year))};
    }
    if (record.id === 'tct') {
      return {...record, type: 'event-series', editionCount: tct.editions.length, latestYear: Math.max(...tct.editions.map((edition) => edition.year))};
    }
    return {...record, type: 'event-series', editionCount: asa.editions.length, latestYear: Math.max(...asa.editions.map((edition) => edition.yearStart))};
  });
}
```

- [ ] **Step 5: Implement `components/home/programme-showcase.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {CardIndex} from '@/components/wt/card-index';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';

// Section 8 of 13. app/styles/wisetech.css:216 .programme-grid; :217 .programme-card;
// :219 .programme-card.feature.
export async function ProgrammeShowcase({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.programmeShowcase'});
  const summaries = summarizeProgrammes();

  return (
    <Section labelledBy="programme-showcase-title" id="programmes">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="programme-showcase-title" variant="split" lead={t('intro')} />
      <div className="programme-grid">
        {summaries.map((programme, index) => (
          <article className={index === 0 ? 'programme-card feature' : 'programme-card'} key={programme.id}>
            <div>
              <StatusLabel>{programme.type === 'credential' ? t('credentialLabel') : t('eventSeriesLabel')}</StatusLabel>
              <CardIndex index={index + 1} />
            </div>
            <h3>{t(`items.${programme.id}.name`)}</h3>
            <p>{t(`items.${programme.id}.description`)}</p>
            <small>
              {programme.type === 'credential'
                ? t('credentialFact')
                : t('editionsFact', {count: programme.editionCount ?? 0, year: programme.latestYear ?? ''})}
            </small>
            <Link href={`/programs/${programme.id}`}>{t('action')} <Arrow /></Link>
          </article>
        ))}
      </div>
    </Section>
  );
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/programme-summaries.test.ts tests/unit/home-programme-showcase.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/home/programme-summaries.ts components/home/programme-showcase.tsx messages/en.json messages/zh-HK.json tests/unit/programme-summaries.test.ts tests/unit/home-programme-showcase.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage programme-showcase section over typed programme records

Section 8 of 13. lib/home/programme-summaries.ts computes edition count and
latest year from the four typed content/programs/* records; CPAI is marked
a credential with neither, matching its own schema's comment that it has no
editions to count.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: GBA Gateway (section 9) — open-cohort flag

**Files:**
- Create: `components/home/gba-gateway.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-gba-gateway.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-gba-gateway.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublicCohorts = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/cohorts", () => ({cohortRepository: {listPublicCohorts}}));

describe("GbaGateway", () => {
  it("labels the CTA 'Explore Launch Pad' when no cohort is open", async () => {
    listPublicCohorts.mockResolvedValueOnce([{status: "active"}]);
    const {GbaGateway} = await import("@/components/home/gba-gateway");
    render(await GbaGateway({locale: "en"}));

    const cta = screen.getByRole("link", {name: bundles.en.Home.gbaGateway.exploreAction});
    expect(cta).toHaveAttribute("href", "/launchpad");
  });

  it("labels the CTA 'View open cohort' when an open cohort exists", async () => {
    listPublicCohorts.mockResolvedValueOnce([{status: "open"}]);
    const {GbaGateway} = await import("@/components/home/gba-gateway");
    render(await GbaGateway({locale: "en"}));

    const cta = screen.getByRole("link", {name: bundles.en.Home.gbaGateway.openCohortAction});
    expect(cta).toHaveAttribute("href", "/launchpad");
  });

  it("degrades to 'Explore Launch Pad' when the read rejects", async () => {
    listPublicCohorts.mockRejectedValueOnce(new Error("db down"));
    const {GbaGateway} = await import("@/components/home/gba-gateway");
    render(await GbaGateway({locale: "en"}));

    expect(screen.getByRole("link", {name: bundles.en.Home.gbaGateway.exploreAction})).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-gba-gateway.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/gba-gateway`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.gbaGateway.eyebrow` | GBA Gateway | 大灣區通道 |
| `Home.gbaGateway.title` | Hong Kong expertise. GBA opportunity. Global ambition. | 香港專長，大灣區機遇，全球視野。 |
| `Home.gbaGateway.copy` | A practical route for market entry, soft landing, delegations, buyer matching and long-term regional partnerships. | 提供市場進入、落地支援、考察團、買家配對及長期區域合作的實務路徑。 |
| `Home.gbaGateway.openCohortAction` | View open cohort | 查看現正開放的梯隊 |
| `Home.gbaGateway.exploreAction` | Explore Launch Pad | 探索創科加速平台 |

- [ ] **Step 4: Implement `components/home/gba-gateway.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {cohortRepository} from '@/lib/db/repos/cohorts';

const anonymous = {kind: 'anonymous', userId: null} as const;

// Section 9 of 13. cohortRepository.listPublicCohorts already filters to
// PUBLIC_COHORT_STATUSES (open, active); the CTA label distinguishes a literally open
// cohort from the general "come explore" state. app/styles/wisetech.css:253 .gba-section;
// :254 .gba-copy.
export async function GbaGateway({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.gbaGateway'});
  const cohorts = await cohortRepository.listPublicCohorts(anonymous).catch(() => []);
  const hasOpenCohort = cohorts.some((cohort) => cohort.status === 'open');

  return (
    <section className="gba-section" aria-labelledby="gba-gateway-title">
      <div className="gba-map" aria-hidden="true">
        <span className="hk-node">HK</span>
        <span className="gz-node">GZ</span>
        <span className="sz-node">SZ</span>
        <span className="world-node">↗</span>
      </div>
      <div className="shell gba-copy">
        <p className="eyebrow light">{t('eyebrow')}</p>
        <h2 id="gba-gateway-title">{t('title')}</h2>
        <p>{t('copy')}</p>
        <div className="hero-actions">
          <Link className="button button-light" href="/launchpad">
            {hasOpenCohort ? t('openCohortAction') : t('exploreAction')} <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-gba-gateway.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/gba-gateway.tsx messages/en.json messages/zh-HK.json tests/unit/home-gba-gateway.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage GBA gateway section with the open-cohort CTA

Section 9 of 13. cohortRepository.listPublicCohorts drives the CTA label:
"View open cohort" when a cohort's status is literally open, otherwise the
general "Explore Launch Pad" invitation. Both point at the same real route.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Impact Evidence (section 10) — computed metrics, zero hides the tile (D-8)

**Files:**
- Create: `lib/home/impact-metrics.ts`
- Create: `components/home/impact-evidence.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/impact-metrics.test.ts`, `tests/unit/home-impact-evidence.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/impact-metrics.test.ts`

```ts
import {describe, expect, it, vi} from "vitest";

const listPublic = vi.hoisted(() => vi.fn());
const listPublished = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repos/events", () => ({eventsRepository: {listPublic}}));
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished}}));

describe("loadImpactMetrics", () => {
  it("computes pastEvents and publishedPartners from the repositories, and asaRegions from the typed record", async () => {
    listPublic.mockResolvedValueOnce([{}, {}, {}]);
    listPublished.mockResolvedValueOnce([{category: "supporting"}, {category: "regional"}]);
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");
    const asOf = new Date("2026-09-01T00:00:00.000Z");

    const metrics = await loadImpactMetrics(asOf);

    expect(metrics.pastEvents).toEqual({value: 3, asOf});
    expect(metrics.publishedPartners).toEqual({value: 2, asOf});
    expect(metrics.asaRegions).not.toBeNull();
    expect(metrics.asaRegions!.value).toBeGreaterThan(0);
    expect(listPublic).toHaveBeenCalledWith(
      {kind: "anonymous", userId: null},
      expect.objectContaining({status: "past", asOf}),
    );
  });

  it("omits a tile whose count is 0, per D-8", async () => {
    listPublic.mockResolvedValueOnce([]);
    listPublished.mockResolvedValueOnce([]);
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");

    const metrics = await loadImpactMetrics();

    expect(metrics.pastEvents).toBeNull();
    expect(metrics.publishedPartners).toBeNull();
  });

  it("omits a tile whose read rejects", async () => {
    listPublic.mockRejectedValueOnce(new Error("db down"));
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const {loadImpactMetrics} = await import("@/lib/home/impact-metrics");

    const metrics = await loadImpactMetrics();

    expect(metrics.pastEvents).toBeNull();
    expect(metrics.publishedPartners).toBeNull();
  });
});
```

`tests/unit/home-impact-evidence.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>(
    (v, p) => (v as Record<string, unknown> | undefined)?.[p],
    root,
  );
}

const loadImpactMetrics = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const raw = String(messageAt(locale, namespace, key));
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/home/impact-metrics", () => ({loadImpactMetrics}));

describe("ImpactEvidence", () => {
  it("renders one tile per surviving metric, each with its value, definition and period", async () => {
    loadImpactMetrics.mockResolvedValueOnce({
      pastEvents: {value: 3, asOf: new Date("2026-09-01T00:00:00.000Z")},
      publishedPartners: null,
      asaRegions: {value: 17, year: 2025},
    });
    const {ImpactEvidence} = await import("@/components/home/impact-evidence");
    render(await ImpactEvidence({locale: "en"}));

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(bundles.en.Home.impact.pastEvents.definition)).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.queryByText(bundles.en.Home.impact.publishedPartners.definition)).not.toBeInTheDocument();
  });

  it("renders nothing when every tile is omitted", async () => {
    loadImpactMetrics.mockResolvedValueOnce({pastEvents: null, publishedPartners: null, asaRegions: null});
    const {ImpactEvidence} = await import("@/components/home/impact-evidence");
    const {container} = render(await ImpactEvidence({locale: "en"}) ?? <></>);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/impact-metrics.test.ts tests/unit/home-impact-evidence.test.tsx`
Expected: FAIL with module-not-found errors for `@/lib/home/impact-metrics` and `@/components/home/impact-evidence`.

- [ ] **Step 3: Add the message keys**

Per D-8, every value is computed at request time and rendered with a definition, a period and a source — never a hard-coded total like the donor's `17`/`2`/`79`.

| Key | EN | ZH |
|---|---|---|
| `Home.impact.eyebrow` | Published evidence | 已公布資料 |
| `Home.impact.title` | Clear facts, with their context attached. | 每項數據，都附有清晰脈絡。 |
| `Home.impact.intro` | These figures describe available WTIA programme, event and network records. They are not presented as current Association-wide totals. | 以下數字描述現有 WTIA 計劃、活動及網絡紀錄，並不代表商會現時的整體總數。 |
| `Home.impact.sourceLabel` | Source note | 來源說明 |
| `Home.impact.source` | Source: hkwtia.org published records. | 來源：hkwtia.org 已發布紀錄。 |
| `Home.impact.sourceLink` | Visit hkwtia.org | 瀏覽 hkwtia.org |
| `Home.impact.pastEvents.label` | completed event records | 個已完成活動紀錄 |
| `Home.impact.pastEvents.definition` | Definition: completed WTIA events published on this site | 定義：本網站已發布的已完成 WTIA 活動 |
| `Home.impact.pastEvents.period` | As of {date} | 截至 {date} |
| `Home.impact.publishedPartners.label` | published partner records | 個已發布夥伴紀錄 |
| `Home.impact.publishedPartners.definition` | Definition: published partner records across supporting, regional and media categories | 定義：已發布的支持機構、區域及媒體夥伴紀錄 |
| `Home.impact.publishedPartners.period` | As of {date} | 截至 {date} |
| `Home.impact.asaRegions.label` | Asian regions represented | 個亞洲地區參與 |
| `Home.impact.asaRegions.definition` | Definition: regions represented in the most recent Asia Smart Innovation Awards edition with a recorded count | 定義：最近一屆有記錄地區數目的亞洲智慧創新大獎所涵蓋地區 |
| `Home.impact.asaRegions.period` | {year} edition | {year} 年度 |

- [ ] **Step 4: Implement `lib/home/impact-metrics.ts`**

```ts
import 'server-only';

import {asa} from '@/content/programs/asa';
import {eventsRepository} from '@/lib/db/repos/events';
import {partnersRepository} from '@/lib/db/repos/partners';

const anonymous = {kind: 'anonymous', userId: null} as const;

export type ImpactDateTile = Readonly<{value: number; asOf: Date}>;
export type ImpactYearTile = Readonly<{value: number; year: number}>;
export type ImpactMetrics = Readonly<{
  pastEvents: ImpactDateTile | null;
  publishedPartners: ImpactDateTile | null;
  asaRegions: ImpactYearTile | null;
}>;

// D-8: every value is computed at request time; a tile with value 0 or a rejected read is
// omitted rather than printed as a hard-coded figure like the donor's 17/2/79.
function latestRecordedAsaEdition() {
  const recorded = asa.editions.filter((edition) => edition.regions.kind !== 'unrecorded');
  if (recorded.length === 0) return null;
  return recorded.reduce((latest, edition) => (edition.yearStart > latest.yearStart ? edition : latest));
}

export async function loadImpactMetrics(asOf: Date = new Date()): Promise<ImpactMetrics> {
  const [pastEventsResult, partnersResult] = await Promise.allSettled([
    eventsRepository.listPublic(anonymous, {status: 'past', asOf, locale: 'en', limit: 500}),
    partnersRepository.listPublished('en', {limit: 100, asOf}),
  ]);

  const pastEvents = pastEventsResult.status === 'fulfilled' && pastEventsResult.value.length > 0
    ? {value: pastEventsResult.value.length, asOf}
    : null;
  const publishedPartners = partnersResult.status === 'fulfilled' && partnersResult.value.length > 0
    ? {value: partnersResult.value.length, asOf}
    : null;

  const latestAsa = latestRecordedAsaEdition();
  const asaRegions = latestAsa && latestAsa.regions.kind !== 'unrecorded'
    ? {value: latestAsa.regions.count, year: latestAsa.yearStart}
    : null;

  return {pastEvents, publishedPartners, asaRegions};
}
```

- [ ] **Step 5: Implement `components/home/impact-evidence.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {loadImpactMetrics} from '@/lib/home/impact-metrics';

// Section 10 of 13. app/styles/wisetech.css:235 .impact-section; :236 .impact-grid;
// :240 .impact-metrics.
export async function ImpactEvidence({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.impact'});
  const metrics = await loadImpactMetrics();
  const formatDate = (value: Date) => new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(value);

  const tiles = [
    metrics.pastEvents ? {
      value: metrics.pastEvents.value,
      label: t('pastEvents.label'),
      definition: t('pastEvents.definition'),
      period: t('pastEvents.period', {date: formatDate(metrics.pastEvents.asOf)}),
    } : null,
    metrics.publishedPartners ? {
      value: metrics.publishedPartners.value,
      label: t('publishedPartners.label'),
      definition: t('publishedPartners.definition'),
      period: t('publishedPartners.period', {date: formatDate(metrics.publishedPartners.asOf)}),
    } : null,
    metrics.asaRegions ? {
      value: metrics.asaRegions.value,
      label: t('asaRegions.label'),
      definition: t('asaRegions.definition'),
      period: t('asaRegions.period', {year: metrics.asaRegions.year}),
    } : null,
  ].filter((tile): tile is NonNullable<typeof tile> => tile !== null);

  if (tiles.length === 0) return null;

  return (
    <section className="impact-section" aria-labelledby="impact-title">
      <div className="shell impact-grid">
        <div>
          <p className="eyebrow light">{t('eyebrow')}</p>
          <h2 id="impact-title">{t('title')}</h2>
          <p>{t('intro')}</p>
          <a className="text-link light-link" href="https://hkwtia.org/" target="_blank" rel="noreferrer">{t('sourceLink')} <Arrow /></a>
        </div>
        <div className="impact-metrics">
          {tiles.map((tile) => (
            <div key={tile.label}>
              <strong>{tile.value}</strong>
              <span>{tile.label}</span>
              <small>{tile.definition} · {tile.period}</small>
            </div>
          ))}
          <div className="method-card">
            <StatusLabel>{t('sourceLabel')}</StatusLabel>
            <p>{t('source')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/impact-metrics.test.ts tests/unit/home-impact-evidence.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/home/impact-metrics.ts components/home/impact-evidence.tsx messages/en.json messages/zh-HK.json tests/unit/impact-metrics.test.ts tests/unit/home-impact-evidence.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage impact-evidence section with computed metrics (D-8)

Section 10 of 13. lib/home/impact-metrics.ts computes past-event count,
published-partner count and the ASA record's most recent region count with
Promise.allSettled; a tile whose value is 0 or whose read rejected is
omitted, and the whole section hides if none survive. No hard-coded totals.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Archive Stories (section 11) — featured milestones (D-9)

**Files:**
- Create: `components/home/archive-stories.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-archive-stories.test.tsx`

- [ ] **Step 1: Write the failing test**

`content/milestones.ts` currently has exactly 3 entries with `featured: true` (confirmed by grep during planning), so the test below asserts 3 cards render, not the "top 4" ceiling — `.slice(0, 4)` is still the real cap the component applies, it simply is not reached by today's data.

`tests/unit/home-archive-stories.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {milestones} from "@/content/milestones";
import {featuredOnly} from "@/lib/history/milestones";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("next/image", () => ({
  default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ArchiveStories", () => {
  it("renders one card per featured milestone that has an image, capped at 4, linking to its history page", async () => {
    const {ArchiveStories} = await import("@/components/home/archive-stories");
    render(await ArchiveStories({locale: "en"}));

    const featured = featuredOnly(milestones).filter((milestone) => milestone.images.length > 0);
    const cards = document.querySelectorAll(".archive-photo-card");
    expect(cards).toHaveLength(Math.min(4, featured.length));

    const first = featured[0]!;
    expect(screen.getByRole("heading", {level: 3, name: first.titleEn})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: new RegExp(first.titleEn)})).toHaveAttribute("href", `/about/history/${first.slug}`);
    expect(screen.getByRole("link", {name: bundles.en.Home.archiveStories.galleryAction})).toHaveAttribute("href", "https://hkwtia.org/photo-gallery/");
  });

  it("renders nothing when no featured milestone has an image", async () => {
    vi.doMock("@/content/milestones", () => ({milestones: []}));
    vi.resetModules();
    const {ArchiveStories} = await import("@/components/home/archive-stories");
    const element = await ArchiveStories({locale: "en"});

    expect(element).toBeNull();
    vi.doUnmock("@/content/milestones");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-archive-stories.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/archive-stories`.

- [ ] **Step 3: Add the message keys**

| Key | EN | ZH |
|---|---|---|
| `Home.archiveStories.eyebrow` | From the WTIA archive | WTIA 真實活動紀錄 |
| `Home.archiveStories.title` | Real people. Real programmes. A platform with history. | 真實人物、真實計劃，一個承接歷史的平台。 |
| `Home.archiveStories.intro` | A look back at the people, programmes and regional exchanges that have shaped the WTIA community. | 回顧塑造 WTIA 社群的人物、計劃及區域交流活動。 |
| `Home.archiveStories.galleryAction` | View the official photo gallery | 查看官方相片集 |
| `Home.archiveStories.captionLabel` | WTIA Event Highlights | WTIA 活動回顧 |

- [ ] **Step 4: Implement `components/home/archive-stories.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';
import Image from 'next/image';

import {milestones} from '@/content/milestones';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {featuredOnly} from '@/lib/history/milestones';

// Section 11 of 13 (D-9). Top 4 featured milestones with at least one image; hidden
// entirely below that. app/styles/wisetech.css:517 .archive-proof; :521 .archive-photo-grid;
// :522 .archive-photo-card; :530 .archive-photo-feature (first card, wide).
export async function ArchiveStories({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.archiveStories'});
  const useChinese = locale === 'zh-HK';
  const stories = featuredOnly(milestones)
    .filter((milestone) => milestone.images.length > 0)
    .slice(0, 4);

  if (stories.length === 0) return null;

  return (
    <section className="archive-proof" aria-labelledby="archive-stories-title">
      <div className="shell">
        <div className="archive-proof-heading">
          <div>
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 id="archive-stories-title">{t('title')}</h2>
          </div>
          <div>
            <p>{t('intro')}</p>
            <a className="text-link" href="https://hkwtia.org/photo-gallery/" target="_blank" rel="noreferrer">
              {t('galleryAction')} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className="archive-photo-grid">
          {stories.map((story, index) => {
            const image = story.images[0]!;
            const title = useChinese ? story.titleZh : story.titleEn;
            const body = useChinese ? story.bodyZh : story.bodyEn;
            const alt = useChinese ? image.altZh : image.altEn;
            return (
              <figure className={index === 0 ? 'archive-photo-card archive-photo-feature' : 'archive-photo-card'} key={story.slug}>
                <div className="archive-photo-media">
                  <Image alt={alt} height={606} src={image.src} width={960} />
                </div>
                <figcaption>
                  <span>{t('captionLabel')}</span>
                  <Link href={`/about/history/${story.slug}`}><h3>{title}</h3></Link>
                  <p>{body}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-archive-stories.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/archive-stories.tsx messages/en.json messages/zh-HK.json tests/unit/home-archive-stories.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage archive-stories section over featured milestones (D-9)

Section 11 of 13. featuredOnly(milestones), filtered to entries with at
least one image and capped at 4, each linking to its own /about/history
page; the section is absent entirely when nothing qualifies.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Legacy Network (section 12) — 3-tab partner network, replaces `HomePartnerWall`

Same server/client split as Task 8: `lib/home/legacy-network-groups.ts` does the repository read (server-only), `components/home/legacy-network.tsx` is the `'use client'` tab component taking the grouped, already-localized data as props. A function prop cannot cross the boundary, so the "showing N of M" note is passed as a `{shown}`/`{total}` template string and interpolated client-side — the same pattern `components/layout/footer-newsletter.tsx` already uses for `Footer.newsletter.mailBody`'s `{email}` placeholder.

**Files:**
- Create: `lib/home/legacy-network-groups.ts`
- Create: `components/home/legacy-network.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/legacy-network-groups.test.ts`, `tests/unit/home-legacy-network.test.tsx`

- [ ] **Step 1: Write the failing tests**

`tests/unit/legacy-network-groups.test.ts`

```ts
import {describe, expect, it, vi} from "vitest";

const listPublished = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished}}));

describe("loadLegacyNetworkGroups", () => {
  it("groups published partners into supporting/regional/media, dropping other categories", async () => {
    listPublished.mockResolvedValueOnce([
      {id: "1", name: "A", category: "supporting", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
      {id: "2", name: "B", category: "regional", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
      {id: "3", name: "C", category: "media", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
      {id: "4", name: "D", category: "sponsor", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
    ]);
    const {loadLegacyNetworkGroups} = await import("@/lib/home/legacy-network-groups");

    const groups = await loadLegacyNetworkGroups("en");

    expect(groups.map((group) => group.category)).toEqual(["supporting", "regional", "media"]);
    expect(groups[0]!.partners.map((partner) => partner.id)).toEqual(["1"]);
    expect(groups.flatMap((group) => group.partners.map((partner) => partner.id))).not.toContain("4");
    expect(listPublished).toHaveBeenCalledWith("en", {limit: 100});
  });

  it("returns 3 empty groups when the read rejects", async () => {
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const {loadLegacyNetworkGroups} = await import("@/lib/home/legacy-network-groups");

    const groups = await loadLegacyNetworkGroups("en");

    expect(groups.every((group) => group.partners.length === 0)).toBe(true);
  });
});
```

`tests/unit/home-legacy-network.test.tsx`

```tsx
import {fireEvent, render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/media/url", () => ({isPrivateMediaDeliveryUrl: () => false}));

const labels = {
  eyebrow: "Built on real relationships",
  title: "A network with history",
  note: "Inclusion does not imply a current relationship.",
  viewAllAction: "View all partners",
  previewNote: "Showing {shown} of {total} records in this category.",
  tabs: {supporting: "Supporting Organizations", regional: "Regional Partners", media: "Media Partners"},
};

function partner(id: string) {
  return {id, name: `Partner ${id}`, category: "supporting" as const, websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false};
}

describe("LegacyNetwork", () => {
  it("hides entirely when every group is empty", async () => {
    const {LegacyNetwork} = await import("@/components/home/legacy-network");
    const groups = [
      {category: "supporting" as const, partners: []},
      {category: "regional" as const, partners: []},
      {category: "media" as const, partners: []},
    ];
    const {container} = render(<LegacyNetwork groups={groups} labels={labels} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the supporting tab by default, with padded counts, and switches tabs on click", async () => {
    const {LegacyNetwork} = await import("@/components/home/legacy-network");
    const groups = [
      {category: "supporting" as const, partners: [partner("1"), partner("2")]},
      {category: "regional" as const, partners: [partner("3")]},
      {category: "media" as const, partners: []},
    ];
    render(<LegacyNetwork groups={groups} labels={labels} />);

    const supportingTab = screen.getByRole("button", {name: /Supporting Organizations/});
    expect(within(supportingTab).getByText("02")).toBeInTheDocument();
    expect(screen.getByText("Partner 1")).toBeInTheDocument();
    expect(screen.getByText(labels.previewNote.replace("{shown}", "2").replace("{total}", "2"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: /Regional Partners/}));
    expect(screen.getByText("Partner 3")).toBeInTheDocument();
    expect(screen.queryByText("Partner 1")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/legacy-network-groups.test.ts tests/unit/home-legacy-network.test.tsx`
Expected: FAIL with module-not-found errors for `@/lib/home/legacy-network-groups` and `@/components/home/legacy-network`.

- [ ] **Step 3: Add the message keys**

Links to `/about`, not `/partners` — `/partners` is not in `PublicRoute` yet and un-retires in WP-7 (master table row 12).

| Key | EN | ZH |
|---|---|---|
| `Home.legacyNetwork.eyebrow` | Built on real relationships | 承接真實合作網絡 |
| `Home.legacyNetwork.title` | A network with history — and a future. | 有歷史根基，也有未來方向的網絡。 |
| `Home.legacyNetwork.note` | These partner logos come from WTIA's published supporting, regional and media network records. Inclusion does not imply a current relationship unless separately confirmed. | 夥伴標誌來自 WTIA 已發布的支持機構、區域夥伴及媒體夥伴紀錄；除非另有確認，列入名單並不代表現時合作關係。 |
| `Home.legacyNetwork.viewAllAction` | View all partners | 查看所有夥伴 |
| `Home.legacyNetwork.previewNote` | Showing {shown} of {total} records in this category. | 顯示此分類 {total} 個紀錄中的 {shown} 個。 |
| `Home.legacyNetwork.tabs.supporting` | Supporting Organizations | 支持機構 |
| `Home.legacyNetwork.tabs.regional` | Regional Partners | 區域夥伴 |
| `Home.legacyNetwork.tabs.media` | Media Partners | 媒體夥伴 |

- [ ] **Step 4: Implement `lib/home/legacy-network-groups.ts`**

```ts
import 'server-only';

import type {AppLocale} from '@/i18n/routing';
import {partnersRepository, type PartnerProjection} from '@/lib/db/repos/partners';

export type LegacyNetworkCategory = 'supporting' | 'regional' | 'media';
export type LegacyNetworkGroup = Readonly<{category: LegacyNetworkCategory; partners: readonly PartnerProjection[]}>;

const categories: readonly LegacyNetworkCategory[] = ['supporting', 'regional', 'media'];

// The 3-tab donor grammar covers 3 of the 5 partner_category values; programme and sponsor
// partners are out of scope for this display (master table row 12).
export async function loadLegacyNetworkGroups(locale: AppLocale): Promise<readonly LegacyNetworkGroup[]> {
  const partners = await partnersRepository.listPublished(locale, {limit: 100}).catch(() => []);
  return categories.map((category) => ({
    category,
    partners: partners.filter((partner) => partner.category === category),
  }));
}
```

- [ ] **Step 5: Implement `components/home/legacy-network.tsx`**

```tsx
'use client';

import Image from 'next/image';
import {useState} from 'react';

import {Link} from '@/i18n/navigation';
import type {LegacyNetworkCategory, LegacyNetworkGroup} from '@/lib/home/legacy-network-groups';
import {isPrivateMediaDeliveryUrl} from '@/lib/media/url';

type LegacyNetworkProps = Readonly<{
  groups: readonly LegacyNetworkGroup[];
  labels: Readonly<{
    eyebrow: string;
    title: string;
    note: string;
    viewAllAction: string;
    previewNote: string;
    tabs: Readonly<Record<LegacyNetworkCategory, string>>;
  }>;
}>;

// Section 12 of 13, 'use client': stateful tabs, data passed in from page.tsx. Replaces
// components/marketing/home-partner-wall.tsx. Hidden entirely at 0 published partners --
// never the donor's hard-coded 79. app/styles/wisetech.css:114 .legacy-network;
// :124 .legacy-logo-rail; :125 .legacy-logo-card.
export function LegacyNetwork({groups, labels}: LegacyNetworkProps) {
  const [active, setActive] = useState<LegacyNetworkCategory>('supporting');
  if (groups.every((group) => group.partners.length === 0)) return null;

  const selected = groups.find((group) => group.category === active) ?? groups[0]!;
  const preview = selected.partners.slice(0, 12);
  const previewNote = labels.previewNote
    .replace('{shown}', String(preview.length))
    .replace('{total}', String(selected.partners.length));

  return (
    <section className="legacy-network" aria-labelledby="legacy-network-title">
      <div className="shell">
        <div className="legacy-network-heading">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h2 id="legacy-network-title">{labels.title}</h2>
          </div>
          <div className="legacy-network-note">
            <p>{labels.note}</p>
            <Link href="/about">{labels.viewAllAction}</Link>
          </div>
        </div>
        <div className="legacy-tabs" role="group" aria-label={labels.title}>
          {groups.map((group) => (
            <button
              key={group.category}
              type="button"
              className={group.category === active ? 'active' : ''}
              aria-pressed={group.category === active}
              onClick={() => setActive(group.category)}
            >
              <span>{labels.tabs[group.category]}</span>
              <b>{String(group.partners.length).padStart(2, '0')}</b>
            </button>
          ))}
        </div>
        <div className="legacy-logo-rail" aria-live="polite">
          {preview.map((partner) => (
            <article className="legacy-logo-card" key={partner.id}>
              <div className="legacy-logo-image">
                {partner.logoUrl && partner.logoAlt ? (
                  <Image alt={partner.logoAlt} height={202} src={partner.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(partner.logoUrl)} width={320} />
                ) : null}
              </div>
              <h3>{partner.name}</h3>
            </article>
          ))}
        </div>
        <div className="legacy-directory-action">
          <p>{previewNote}</p>
          <Link className="button button-dark" href="/about">{labels.viewAllAction}</Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/legacy-network-groups.test.ts tests/unit/home-legacy-network.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/home/legacy-network-groups.ts components/home/legacy-network.tsx messages/en.json messages/zh-HK.json tests/unit/legacy-network-groups.test.ts tests/unit/home-legacy-network.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage legacy-network section, replacing the partner wall

Section 12 of 13. lib/home/legacy-network-groups.ts groups published
partners into supporting/regional/media; components/home/legacy-network.tsx
is the 'use client' tab component. Hidden entirely at 0 published partners,
never the donor's hard-coded 79. Supersedes HomePartnerWall (removed in
Task 15, once page.tsx stops importing it).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Conversion Paths (section 13) — static membership/partnership panels

**Files:**
- Create: `components/home/conversion-paths.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/home-conversion-paths.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/home-conversion-paths.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign((key: string) => String(messageAt(locale, namespace, key)), {raw: (key: string) => messageAt(locale, namespace, key)})),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

describe("ConversionPaths", () => {
  it("renders the membership and partnership panels with real PublicRoute hrefs", async () => {
    const {ConversionPaths} = await import("@/components/home/conversion-paths");
    render(await ConversionPaths({locale: "en"}));

    const membership = screen.getByText(bundles.en.Home.conversionPaths.membership.title).closest("article")!;
    expect(within(membership).getByRole("link", {name: bundles.en.Home.conversionPaths.membership.primaryAction})).toHaveAttribute("href", "/membership");
    expect(within(membership).getByRole("link", {name: bundles.en.Home.conversionPaths.membership.secondaryAction})).toHaveAttribute("href", "/join");
    expect(within(membership).getAllByRole("listitem")).toHaveLength(3);

    const partnership = screen.getByText(bundles.en.Home.conversionPaths.partnership.title).closest("article")!;
    expect(within(partnership).getByRole("link", {name: bundles.en.Home.conversionPaths.partnership.primaryAction})).toHaveAttribute("href", "/contact");
    expect(within(partnership).getByRole("link", {name: bundles.en.Home.conversionPaths.partnership.secondaryAction})).toHaveAttribute("href", "/about");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/home-conversion-paths.test.tsx`
Expected: FAIL with a module-not-found error for `@/components/home/conversion-paths`.

- [ ] **Step 3: Add the message keys**

`partnership.primaryAction` links to `/contact`, and `partnership.secondaryAction` to `/about` — the donor's `/partner-with-us` and `/partners` are not in `PublicRoute` yet.

| Key | EN | ZH |
|---|---|---|
| `Home.conversionPaths.eyebrow` | Take part | 投入參與 |
| `Home.conversionPaths.title` | Choose the relationship that fits your goal. | 按你的目標，選擇合適參與關係。 |
| `Home.conversionPaths.intro` | Membership supports ongoing participation. Partnership starts with a defined audience, initiative and intended outcome. | 會籍支援持續參與；夥伴合作則由清晰受眾、項目及預期成果開始。 |
| `Home.conversionPaths.membership.label` | Membership | 會籍 |
| `Home.conversionPaths.membership.title` | Build an active route into the ecosystem. | 建立持續參與生態系統的路徑。 |
| `Home.conversionPaths.membership.copy` | Choose a pathway for professionals, startups, SMEs, corporates or strategic partners. Current fees and final entitlements are provided by the membership team. | 專業人士、初創、中小企、企業及策略夥伴可選擇相應路徑；現行費用及最終權益由會員團隊提供。 |
| `Home.conversionPaths.membership.points` (array) | `["Relevant activities and knowledge", "Profile and visibility choices", "A practical first-90-day journey"]` | `["相關活動及知識", "專頁及可見度選擇", "實用的首 90 天旅程"]` |
| `Home.conversionPaths.membership.primaryAction` | Compare Membership | 比較會籍 |
| `Home.conversionPaths.membership.secondaryAction` | Prepare a membership enquiry | 準備會籍查詢 |
| `Home.conversionPaths.partnership.label` | Partnership | 夥伴合作 |
| `Home.conversionPaths.partnership.title` | Co-create a useful industry initiative. | 共同設計有用的產業項目。 |
| `Home.conversionPaths.partnership.copy` | Work with the Association on a business challenge, programme, knowledge initiative, event or market-access pathway with a defined purpose. | 與商會就業務挑戰、計劃、知識項目、活動或市場拓展路徑合作，並清楚界定目的。 |
| `Home.conversionPaths.partnership.points` (array) | `["Purpose and audience defined first", "Roles and public claims agreed", "Next steps and outcomes made clear"]` | `["先界定目的及受眾", "協定角色及公開聲稱", "清楚列明下一步及成果"]` |
| `Home.conversionPaths.partnership.primaryAction` | Start a Partnership | 展開合作 |
| `Home.conversionPaths.partnership.secondaryAction` | Meet the Network | 認識夥伴網絡 |

- [ ] **Step 4: Implement `components/home/conversion-paths.tsx`**

```tsx
import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';

const panels = [
  {key: 'membership', primaryHref: '/membership', secondaryHref: '/join'},
  {key: 'partnership', primaryHref: '/contact', secondaryHref: '/about'},
] as const;

// Section 13 of 13. app/styles/wisetech.css:774 .conversion-section; :775 .conversion-grid.
export async function ConversionPaths({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.conversionPaths'});

  return (
    <Section labelledBy="conversion-paths-title" id="conversion-paths">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="conversion-paths-title" variant="split" lead={t('intro')} />
      <div className="conversion-grid">
        {panels.map((panel) => {
          const points = t.raw(`${panel.key}.points`) as readonly string[];
          return (
            <article key={panel.key}>
              <StatusLabel>{t(`${panel.key}.label`)}</StatusLabel>
              <h3>{t(`${panel.key}.title`)}</h3>
              <p>{t(`${panel.key}.copy`)}</p>
              <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
              <div>
                <ActionLink href={panel.primaryHref} variant="button-dark">{t(`${panel.key}.primaryAction`)}</ActionLink>
                <ActionLink href={panel.secondaryHref} variant="text-link">{t(`${panel.key}.secondaryAction`)}</ActionLink>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/unit/home-conversion-paths.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/home/conversion-paths.tsx messages/en.json messages/zh-HK.json tests/unit/home-conversion-paths.test.tsx
git commit -m "$(cat <<'EOF'
feat: add homepage conversion-paths section (membership + partnership)

Section 13 of 13 -- the last of the 13 sections. Static membership and
partnership panels over real PublicRoute hrefs (/membership, /join,
/contact, /about); the donor's /partner-with-us and /partners are not yet
canonical routes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Page composition, metadata, structured data (design doc §3, closes errata E-68)

All 13 sections exist; this task wires them into `page.tsx` in order, extends structured data to read `siteConfig.contact` (closing E-68), retires the pre-WP-3 `Home.*` keys and marketing components nothing references any more, and rewrites `tests/unit/homepage.test.tsx` as the whole-page integration test the master spec's RED-test line describes.

**Files:**
- Modify: `lib/structured-data.ts`
- Modify: `components/seo/structured-data.tsx`
- Rewrite: `app/[locale]/(public)/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Rewrite: `tests/unit/homepage.test.tsx`
- Delete: `components/marketing/editorial-hero.tsx`, `components/marketing/feature-grid.tsx`, `components/marketing/home-partner-wall.tsx`, `components/marketing/program-grid.tsx`
- Delete: `tests/unit/home-partner-wall.test.tsx`, `tests/unit/homepage-partner-wall-integration.test.tsx`

- [ ] **Step 1: Write the failing structured-data test**

Add to `tests/unit/structured-data.test.ts` (create it if it does not already exist as a dedicated file; if `buildOrganizationData`/`buildFaqData` are exercised inline inside `homepage.test.tsx` or another file today, add these cases there instead — check with `grep -rl "buildOrganizationData" tests/unit` before choosing):

```ts
import {describe, expect, it} from "vitest";

import {siteConfig} from "@/config/site";
import {buildOrganizationData, buildWebSiteData} from "@/lib/structured-data";

describe("buildOrganizationData", () => {
  it("reads email, phone and address from siteConfig.contact, never the message bundle (E-68)", () => {
    const data = buildOrganizationData();

    expect(data.alternateName).toEqual(["WiseTech Hong Kong", "HKWTA", "WTIA"]);
    expect(data.email).toBe(siteConfig.contact.email);
    expect(data.telephone).toBe(siteConfig.contact.phone);
    expect(data.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: siteConfig.contact.addressLines.slice(0, -1).join(", "),
      addressLocality: siteConfig.contact.addressLines.at(-1),
      addressCountry: "HK",
    });
  });
});

describe("buildWebSiteData", () => {
  it("declares both site languages", () => {
    const data = buildWebSiteData();

    expect(data["@type"]).toBe("WebSite");
    expect(data.inLanguage).toEqual(["en-HK", "zh-Hant-HK"]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/unit/structured-data.test.ts`
Expected: FAIL — `buildOrganizationData()` today returns no `alternateName`/`email`/`telephone`/`address`, and `buildWebSiteData` does not exist.

- [ ] **Step 3: Extend `lib/structured-data.ts`**

```ts
import type {Event, FAQPage, Organization, WebSite, WithContext} from 'schema-dts';
```

Replace `buildOrganizationData` and add `buildWebSiteData` beneath it:

```ts
// E-68: reads siteConfig.contact -- the English machine-readable record -- never
// Footer.addressLines, which is the per-locale printed authority for what a reader sees.
export function buildOrganizationData(): WithContext<Organization> {
  const {contact} = siteConfig;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    alternateName: ['WiseTech Hong Kong', 'HKWTA', 'WTIA'],
    description: siteConfig.defaultDescription,
    url: absoluteUrl('/'),
    logo: absoluteUrl(siteConfig.defaultImage),
    email: contact.email,
    ...(contact.phone ? {telephone: contact.phone} : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: contact.addressLines.slice(0, -1).join(', '),
      addressLocality: contact.addressLines.at(-1),
      addressCountry: 'HK',
    },
  };
}

export function buildWebSiteData(): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: absoluteUrl('/'),
    inLanguage: ['en-HK', 'zh-Hant-HK'],
  };
}
```

- [ ] **Step 4: Add `WebSite` to `StructuredData`'s union**

`components/seo/structured-data.tsx`:

```tsx
import type {Event, FAQPage, Organization, SoftwareApplication, WebSite, WithContext} from 'schema-dts';

type StructuredDataProps = {
  data: WithContext<Organization | FAQPage | Event | SoftwareApplication | WebSite>;
};
```

- [ ] **Step 5: Run the structured-data test and confirm it passes**

Run: `npx vitest run tests/unit/structured-data.test.ts`
Expected: PASS

- [ ] **Step 6: Add the remaining message keys and retire the pre-WP-3 `Home` block**

`Home.metaTitle`/`Home.metaDescription` — replace the current values (the master table: title `WiseTech Hong Kong` absolute; description copied from the donor's `generateMetadata`):

| Key | EN | ZH |
|---|---|---|
| `Home.metaTitle` | WiseTech Hong Kong | WiseTech Hong Kong |
| `Home.metaDescription` | WiseTech Hong Kong connects trusted AI+ adoption, events, members, solutions, programmes and GBA market opportunities. | WiseTech Hong Kong 連接可信 AI+ 應用、活動、會員、方案、計劃及大灣區市場機遇。 |

Delete the following keys from **both** `messages/en.json` and `messages/zh-HK.json`'s `Home` object — nothing references them once `page.tsx` is rewritten in Step 7: `eyebrow`, `title`, `question`, `summary`, `imageAlt`, `actions` (the whole object: `events`, `membership`, `discover`), `highlightsTitle`, `highlightsIntro`, `highlights` (the whole object), `featuresTitle`, `featuresIntro`, `features` (the whole object), `partnerWallTitle`, `partnerWallIntro`, `programsTitle`, `programsIntro`, `programs` (the whole object), `viewProgram`. `lib/home/home-highlights.ts` and its own tests (`tests/unit/home-highlights*.test.ts`) are untouched — they read `event`/`news`/`showcase` slots independently of these message keys and stay, per the design doc, for reuse if a later work package wants them.

- [ ] **Step 7: Rewrite `app/[locale]/(public)/page.tsx`**

```tsx
import type {Metadata} from 'next';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ArchiveStories} from '@/components/home/archive-stories';
import {ConversionPaths} from '@/components/home/conversion-paths';
import {Ecosystem} from '@/components/home/ecosystem';
import {EventsJourney} from '@/components/home/events-journey';
import {GbaGateway} from '@/components/home/gba-gateway';
import {Hero} from '@/components/home/hero';
import {ImpactEvidence} from '@/components/home/impact-evidence';
import {LegacyNetwork} from '@/components/home/legacy-network';
import {MarketProducts} from '@/components/home/market-products';
import {OpenNow} from '@/components/home/open-now';
import {Outcomes} from '@/components/home/outcomes';
import {Pathways} from '@/components/home/pathways';
import {ProgrammeShowcase} from '@/components/home/programme-showcase';
import {StructuredData} from '@/components/seo/structured-data';
import type {AppLocale} from '@/i18n/routing';
import {buildEcosystemIndustries} from '@/lib/home/ecosystem-industries';
import {loadLegacyNetworkGroups} from '@/lib/home/legacy-network-groups';
import {buildPageMetadata} from '@/lib/metadata';
import {buildOrganizationData, buildWebSiteData} from '@/lib/structured-data';

type Props = {params: Promise<{locale: string}>};

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Home'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/', title: t('metaTitle'), description: t('metaDescription'), image: '/images/projects-hero.jpg'});
}

// 13 sections, each an independent read (design doc §4): Promise.all fans every section's
// own .catch(() => [])/Promise.allSettled read out in parallel, so one slow or failing model
// never blocks another. Ecosystem and LegacyNetwork are 'use client' presentational
// components -- their data/translation resolution happens here, in server code, and is
// passed down as plain serializable props (Tasks 8 and 13).
export default async function HomePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const appLocale = locale as AppLocale;

  const [
    hero, openNow, pathways, eventsJourney, marketProducts, outcomes,
    programmeShowcase, gbaGateway, impactEvidence, archiveStories, conversionPaths,
    ecosystemT, legacyNetworkGroups, legacyNetworkT,
  ] = await Promise.all([
    Hero({locale: appLocale}),
    OpenNow({locale: appLocale}),
    Pathways({locale: appLocale}),
    EventsJourney({locale: appLocale}),
    MarketProducts({locale: appLocale}),
    Outcomes({locale: appLocale}),
    ProgrammeShowcase({locale: appLocale}),
    GbaGateway({locale: appLocale}),
    ImpactEvidence({locale: appLocale}),
    ArchiveStories({locale: appLocale}),
    ConversionPaths({locale: appLocale}),
    getTranslations({locale, namespace: 'Home.ecosystem'}),
    loadLegacyNetworkGroups(appLocale),
    getTranslations({locale, namespace: 'Home.legacyNetwork'}),
  ]);

  const ecosystemIndustries = buildEcosystemIndustries((key) => ecosystemT(key));

  return (
    <>
      <StructuredData data={buildOrganizationData()} />
      <StructuredData data={buildWebSiteData()} />
      {hero}
      {openNow}
      {pathways}
      {eventsJourney}
      {marketProducts}
      {outcomes}
      <Ecosystem
        industries={ecosystemIndustries}
        labels={{
          eyebrow: ecosystemT('eyebrow'),
          title: ecosystemT('title'),
          intro: ecosystemT('intro'),
          selectedLabel: ecosystemT('selectedLabel'),
          enterAction: ecosystemT('enterAction'),
          focusAreas: ecosystemT.raw('focusAreas') as readonly string[],
        }}
      />
      {programmeShowcase}
      {gbaGateway}
      {impactEvidence}
      {archiveStories}
      <LegacyNetwork
        groups={legacyNetworkGroups}
        labels={{
          eyebrow: legacyNetworkT('eyebrow'),
          title: legacyNetworkT('title'),
          note: legacyNetworkT('note'),
          viewAllAction: legacyNetworkT('viewAllAction'),
          // Raw, not translated: the {shown}/{total} placeholders are filled in client-side
          // by LegacyNetwork itself (Task 13), the same pattern Footer.newsletter.mailBody
          // uses for {email} -- a function cannot cross the server/client boundary as a prop,
          // so the template string does instead.
          previewNote: legacyNetworkT.raw('previewNote') as string,
          tabs: {
            supporting: legacyNetworkT('tabs.supporting'),
            regional: legacyNetworkT('tabs.regional'),
            media: legacyNetworkT('tabs.media'),
          },
        }}
      />
      {conversionPaths}
    </>
  );
}
```

- [ ] **Step 8: Delete the fully-superseded marketing components and their dedicated tests**

`components/marketing/editorial-hero.tsx`, `components/marketing/feature-grid.tsx`, `components/marketing/program-grid.tsx` had no other importer (confirmed by grep during planning); `components/marketing/home-partner-wall.tsx` is superseded by `components/home/legacy-network.tsx`. `components/marketing/section.tsx` and `components/marketing/home-highlight-card.tsx` are **not** deleted: `section.tsx` is still imported by `/membership` and `/launchpad`, and `home-highlight-card.tsx` still has its own regression coverage in `tests/unit/media-revocation-render.test.tsx`, unrelated to the homepage.

```bash
git rm components/marketing/editorial-hero.tsx components/marketing/feature-grid.tsx components/marketing/home-partner-wall.tsx components/marketing/program-grid.tsx
git rm tests/unit/home-partner-wall.test.tsx tests/unit/homepage-partner-wall-integration.test.tsx
```

- [ ] **Step 9: Rewrite `tests/unit/homepage.test.tsx`**

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const listPublic = vi.hoisted(() => vi.fn());
const listFeaturedPublic = vi.hoisted(() => vi.fn());
const showcaseListPublished = vi.hoisted(() => vi.fn());
const partnersListPublished = vi.hoisted(() => vi.fn());
const listPublicCohorts = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) => {
        const raw = String(messageAt(locale, namespace, key));
        return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)), raw);
      },
      {raw: (key: string) => messageAt(locale, namespace, key)},
    )),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/image", () => ({
  default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/db/repos/events", () => ({
  eventsRepository: {
    listPublic: listPublic,
    listFeaturedPublic: listFeaturedPublic,
  },
}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {listPublished: showcaseListPublished}}));
vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished: partnersListPublished}}));
vi.mock("@/lib/db/repos/cohorts", () => ({cohortRepository: {listPublicCohorts}}));
// Deterministic: impact-evidence's asaRegions tile reads content/programs/asa directly, not
// through a mockable repository. Forcing every edition "unrecorded" here means the section's
// visibility in every test below depends only on the two repos this file already controls,
// not on whatever content/programs/asa.ts happens to contain when the suite runs.
vi.mock("@/content/programs/asa", () => ({
  asa: {id: "asa", editions: [{labelEn: "x", labelZh: "x", yearStart: 2013, funder: {kind: "none-recorded"}, regions: {kind: "unrecorded"}, winners: {kind: "unrecorded"}, images: []}]},
}));

const sectionIds = [
  "hero-title", "open-now-title", "pathways-title", "events-journey-title",
  "market-products-title", "outcomes-title", "ecosystem-title", "programme-showcase-title",
  "gba-gateway-title", "impact-title", "archive-stories-title", "legacy-network-title",
  "conversion-paths-title",
] as const;

function setEmptyFixtures() {
  listPublic.mockResolvedValue([]);
  listFeaturedPublic.mockResolvedValue([]);
  showcaseListPublished.mockResolvedValue([]);
  partnersListPublished.mockResolvedValue([]);
  listPublicCohorts.mockResolvedValue([]);
}

const pastEvent = {id: "1", slug: "past-event", title: "Past Event", description: "d", startsAt: "2025-01-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null};
const publishedPartner = {id: "1", name: "Partner", category: "supporting" as const, websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false};

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEmptyFixtures();
  });

  it.each(["en", "zh-HK"] as const)("renders all 13 sections as labelled landmarks, in order, in %s", async (locale) => {
    // A fully-populated fixture: every section that can hide (impact-evidence,
    // legacy-network) has at least one reason to render, so this test verifies order
    // across all 13 -- the two "hides at 0" behaviours get their own tests below.
    listPublic.mockImplementation(async (_actor: unknown, options: {status: string}) =>
      options.status === "past" ? [pastEvent] : []);
    partnersListPublished.mockResolvedValue([publishedPartner]);

    const {default: HomePage} = await import("@/app/[locale]/(public)/page");
    render(await HomePage({params: Promise.resolve({locale})}));

    const labelled = [...document.querySelectorAll("[aria-labelledby]")]
      .map((el) => el.getAttribute("aria-labelledby"))
      .filter((id): id is string => (sectionIds as readonly string[]).includes(id ?? ""));
    expect(labelled).toEqual([...sectionIds]);

    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"@type":"Organization"');
  });

  it("hides legacy-network at 0 published partners and shows it once a partner is published", async () => {
    const {default: HomePage} = await import("@/app/[locale]/(public)/page");

    render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(document.querySelector('[aria-labelledby="legacy-network-title"]')).toBeNull();

    partnersListPublished.mockResolvedValue([publishedPartner]);
    render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(document.querySelector('[aria-labelledby="legacy-network-title"]')).not.toBeNull();
  });

  it("omits every impact tile, and hides the section, when every metric is 0", async () => {
    const {default: HomePage} = await import("@/app/[locale]/(public)/page");
    render(await HomePage({params: Promise.resolve({locale: "en"})}));

    expect(document.querySelector('[aria-labelledby="impact-title"]')).toBeNull();
  });

  it("renders the Open Now honest-empty state when no event is open, and available cards once one is", async () => {
    const {default: HomePage} = await import("@/app/[locale]/(public)/page");

    render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(screen.getByText(bundles.en.Home.openNow.empty.title)).toBeInTheDocument();

    listPublic.mockImplementation(async (_actor: unknown, options: {status: string}) =>
      options.status === "open"
        ? [{id: "1", slug: "ai-clinic", title: "AI Clinic", description: "d", startsAt: "2026-10-01T02:00:00.000Z", endsAt: null, venue: null, capacity: null, hero: null}]
        : []);
    render(await HomePage({params: Promise.resolve({locale: "en"})}));
    expect(screen.getByRole("heading", {level: 3, name: "AI Clinic"})).toBeInTheDocument();
  });

  it("exports a force-dynamic home route", async () => {
    const home = await import("@/app/[locale]/(public)/page");
    expect(home.dynamic).toBe("force-dynamic");
  });
});
```

- [ ] **Step 10: Run the full homepage suite and confirm it fails, then implement, then confirm it passes**

Run: `npx vitest run tests/unit/homepage.test.tsx tests/unit/structured-data.test.ts`
Expected first: FAIL (the old `page.tsx` and the pre-Step-3 `structured-data.ts` are still in place at this point in the task if executed strictly test-first end to end; if Steps 3-8 above were already applied while writing this task's tests, run the whole task's tests together instead — either sequencing is acceptable as long as each RED assertion was observed failing before its corresponding implementation landed).

After Steps 3-8: Expected: PASS.

- [ ] **Step 11: Run the full targeted regression sweep**

Run: `npx vitest run tests/unit/homepage.test.tsx tests/unit/structured-data.test.ts tests/unit/home-highlights.test.ts tests/unit/home-highlights-bounded-event.test.ts tests/unit/media-revocation-render.test.tsx tests/unit/messages.test.ts tests/unit/audit-strings.test.ts`
Expected: PASS. (`home-highlights*` and `media-revocation-render` confirm the intentionally-retained files still work standalone; `messages.test.ts` and `audit-strings.test.ts` — or whatever the actual audit-strings test file is named, confirm via `grep -rl "audit:strings" tests/unit` if the name differs — confirm bundle parity and that no new JSX literal needs an allowlist entry.)

- [ ] **Step 12: Commit**

```bash
git add lib/structured-data.ts components/seo/structured-data.tsx "app/[locale]/(public)/page.tsx" messages/en.json messages/zh-HK.json tests/unit/structured-data.test.ts tests/unit/homepage.test.tsx
git commit -m "$(cat <<'EOF'
feat: compose the 13-section homepage and extend structured data (E-68)

app/[locale]/(public)/page.tsx is now a thin Promise.all composition of the
13 sections built in Tasks 2-14, in the master table's order. Organization
structured data gains alternateName/telephone/address from
siteConfig.contact (never the message bundle, closing E-68), and a new
WebSite node declares both site languages. The pre-WP-3 flat Home.* keys
and the marketing components nothing references any more are retired.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Discover-anchor and focus-ring re-measurement, Lighthouse, full gate, PR (closes E-52, E-64)

The homepage's shape changed completely in Tasks 2-15, so the `#home-discover` viewport-ratio threshold and the overlay header's focus-ring contrast readings in `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md`'s Appendix D are both stale against the new hero. Both closures require running the real, built app in a browser — this is the one task in this plan that does.

**Files:**
- Modify: `lighthouserc.js`
- Modify: `tests/e2e/wisetech-pr3-public-pages.spec.ts`
- Modify: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (Appendix D: add E-70 recording the new focus-ring readings)
- Modify: `docs/integration/wisetech-design-fidelity-checklist.md` (mark the WP-3 rows verified)

- [ ] **Step 1: Add `/` and `/zh` to the Lighthouse target list**

`lighthouserc.js` — extend the `url` array (the existing `/membership` targets stay; WP-3 adds the homepage):

```js
      url: [`${baseUrl}/`, `${baseUrl}/zh`, `${baseUrl}/membership`, `${baseUrl}/zh/membership`],
```

- [ ] **Step 2: Update the hero H1, image alt and hero-action count in the public-pages e2e spec**

`tests/e2e/wisetech-pr3-public-pages.spec.ts` — the `homeCases` array's `h1`, `imageAlt` and highlight fixtures described the retired hero and highlights grid. Replace the whole array (lines 18-49) with the new hero's copy, read from the bundles rather than duplicated by hand where the launcher label already is:

```ts
function homeMessage(locale: "en" | "zh-HK", key: string): string {
  const bundle = JSON.parse(
    readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"),
  ) as {Home: Record<string, unknown>};
  return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown> | undefined)?.[part], bundle.Home) as string;
}

const homeCases = [
  {
    path: "/",
    h1: homeMessage("en", "hero.title"),
    imageAlt: homeMessage("en", "hero.imageAlt"),
    findEventAction: homeMessage("en", "hero.actions.findEvent"),
    joinAction: homeMessage("en", "hero.actions.join"),
    membersAction: homeMessage("en", "hero.actions.members"),
    discoverAction: homeMessage("en", "hero.discover"),
    concierge: conciergeLauncher("en"),
  },
  {
    path: "/zh",
    h1: homeMessage("zh-HK", "hero.title"),
    imageAlt: homeMessage("zh-HK", "hero.imageAlt"),
    findEventAction: homeMessage("zh-HK", "hero.actions.findEvent"),
    joinAction: homeMessage("zh-HK", "hero.actions.join"),
    membersAction: homeMessage("zh-HK", "hero.actions.members"),
    discoverAction: homeMessage("zh-HK", "hero.discover"),
    concierge: conciergeLauncher("zh-HK"),
  },
] as const;
```

Update the first test (`${homeCase.path} renders the PR3 hero and three repository-backed highlight states` — rename it, since the highlights grid is gone) to assert the new hero structure instead of the retired 3-card grid:

```ts
for (const homeCase of homeCases) {
  test(`${homeCase.path} renders the WP-3 hero over the real homepage sections`, async ({page}) => {
    const response = await page.goto(homeCase.path);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.getByRole("heading", {level: 1, name: homeCase.h1})).toHaveCount(1);
    await expect(page.locator(runtimeOverlay)).toHaveCount(0);

    const hero = page.locator("section").filter({
      has: page.getByRole("heading", {level: 1, name: homeCase.h1}),
    }).first();
    await expect(hero.getByRole("img", {name: homeCase.imageAlt})).toBeVisible();
    await expect(hero.getByRole("link", {name: homeCase.findEventAction})).toBeVisible();
    await expect(hero.getByRole("link", {name: homeCase.joinAction})).toBeVisible();
    await expect(hero.getByRole("link", {name: homeCase.membersAction})).toBeVisible();
    await expect(hero.getByRole("link", {name: homeCase.discoverAction})).toHaveAttribute("href", "#home-discover");
  });

  for (const width of [375, 768, 1024, 1440]) {
    test(`${homeCase.path} fits ${width}px with 44px hero actions clear of Concierge`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      const response = await page.goto(homeCase.path);
      expect(response?.status()).toBeLessThan(400);

      const horizontalMetrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(horizontalMetrics.scrollWidth).toBeLessThanOrEqual(horizontalMetrics.clientWidth + 1);

      const hero = page.locator("section").filter({
        has: page.getByRole("heading", {level: 1, name: homeCase.h1}),
      }).first();
      const actionBoxes = await hero.locator(".hero-actions a").evaluateAll((links) => links.map((link) => {
        const rect = link.getBoundingClientRect();
        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
      }));
      expect(actionBoxes).toHaveLength(3);
      for (const box of actionBoxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }

      const concierge = page.getByRole("button", {name: homeCase.concierge});
      await expect(concierge).toBeVisible();
      const conciergeBox = await concierge.boundingBox();
      expect(conciergeBox).not.toBeNull();
      for (const actionBox of actionBoxes) {
        expect(rectanglesOverlap(actionBox, conciergeBox!)).toBe(false);
      }

      await page.setViewportSize({width, height: 600});
      const discoverTarget = page.locator("#home-discover");
      const discoverLink = hero.getByRole("link", {name: homeCase.discoverAction});
      await expect(discoverLink).toBeInViewport();
      // Re-measured for the WP-3 hero (E-52): see Step 3 for the procedure and the reading
      // this threshold is built from.
      await expect(discoverTarget).not.toBeInViewport({ratio: DISCOVER_REST_CEILING});
      await page.evaluate(() => {
        document.documentElement.dataset.testScrollEnded = "false";
        document.addEventListener("scrollend", () => {
          document.documentElement.dataset.testScrollEnded = "true";
        }, {once: true});
      });
      await discoverLink.click();
      await expect(page).toHaveURL(/#home-discover$/);
      await expect(page.locator("html")).toHaveAttribute("data-test-scroll-ended", "true");
      await expect(discoverTarget).toBeInViewport({ratio: DISCOVER_REST_CEILING});

      const renderedHeader = page.locator("header.site-header");
      await expect(renderedHeader).toBeVisible();
      await expect(renderedHeader).toHaveClass(/scrolled/);
    });
  }
}
```

- [ ] **Step 3: Measure the new `#home-discover` ratios and set `DISCOVER_REST_CEILING`**

Build and start the app, then run a throwaway measurement script against it — do not commit the script; it lives in the scratchpad directory only.

```bash
npm run build
npm run start -- -p 3100 &
```

`C:\Users\laich\AppData\Local\Temp\claude\...\scratchpad\measure-discover-ratio.mjs` (adjust the path to this session's actual scratchpad directory):

```js
import {chromium} from 'playwright';

const browser = await chromium.launch();
for (const width of [375, 768, 1024, 1440]) {
  const page = await browser.newPage({viewport: {width, height: 600}});
  await page.goto('http://localhost:3100/');
  const before = await page.locator('#home-discover').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return visible / rect.height;
  });
  await page.getByRole('link', {name: /Discover/}).first().click();
  await page.waitForTimeout(400);
  const after = await page.locator('#home-discover').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return visible / rect.height;
  });
  console.log(width, {before, after});
  await page.close();
}
await browser.close();
```

Run: `node "<scratchpad>/measure-discover-ratio.mjs"`

Read the four `{before, after}` pairs. `DISCOVER_REST_CEILING` is a constant placed near the low end of the gap between the largest `before` value and the smallest `after` value across all four widths — the same reasoning E-52 already documents (a threshold near the resting side's ceiling leaves the widest safety margin against the post-scroll floor, which is itself bounded well under 1.0 by the probe viewport). Add the constant and a comment recording the four measured pairs, in the same form as the comment this replaces:

```ts
// Measured on this tree against the WP-3 hero and Open Now section at a 600px probe
// viewport height: at rest {record the four `before` values at 375/768/1024/1440px}; after
// the anchor {record the four `after` values}. DISCOVER_REST_CEILING sits near the low end
// of the gap between the two, not its midpoint, for the reason E-52 already gives: the
// resting side has headroom to spare either way, while the post-anchor side is bounded by
// how tall the section renders inside a 600px probe viewport.
const DISCOVER_REST_CEILING = /* the measured value */;
```

Stop the throwaway server: `kill %1` (or `taskkill /IM node.exe /F` if the background job id is not tracked by the shell).

- [ ] **Step 4: Measure the overlay header's focus-ring contrast against the new hero (E-64)**

E-64 is explicit that this is a measurement against the rendered photograph, not a rule a colour choice can satisfy — repeat the review's own method rather than writing a new automated pass/fail gate that a photo cannot honestly support. With the app still running from Step 3, open `http://localhost:3100/` at each of 1440, 1360, 1120 and 820px, tab to the header's language-switcher control (the control E-33's companion rules already target), and read the focus ring's colour against the pixel it sits on using the browser's own colour picker or a screenshot sampled with any pixel tool. Record all four ratios — including the worst one found, the way E-64's own initial reading called out a bright flare at 1360px — as a new Appendix D row:

`docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md`, Appendix D, after the last existing row (`E-69`):

```markdown
| E-70 | §6 accessibility criterion, WP-3 Task 16 | E-64's owner action: re-measure the overlay header's focus-ring contrast against the WP-3 hero | Measured at 1440, 1360, 1120 and 820px with the new hero and its top-spanning scrim in place: {record the four ratios found, including which pixel each was sampled against}. {State whether the worst reading still clears 3:1, and if not, what pixel it sits on.} | {Record whatever follow-up the reading implies -- none, if every measurement clears 3:1, or a scoped companion-sheet fix over the specific control and breakpoint if it does not, following E-33's pattern of a measured, narrowly-scoped override rather than a new global rule.} |
```

- [ ] **Step 5: Run the re-measured e2e spec**

Run: `npx playwright test tests/e2e/wisetech-pr3-public-pages.spec.ts`
Expected: PASS at all four widths, both locales.

- [ ] **Step 6: Run the full local gate**

Run, in order, and confirm each is green before moving to the next:

```bash
npx vitest run
npm run lint
npm run typecheck
npm run build
npm run audit:strings
```

- [ ] **Step 7: Run Lighthouse and confirm the exit bar**

```bash
npm run test:lighthouse
```

Expected: `categories:performance` ≥ 0.90, `categories:accessibility` ≥ 0.95, `categories:seo` ≥ 0.95 on both `/` and `/zh` (and the pre-existing `/membership` targets stay green). If performance is short of 90 on `/`, apply the design doc §4 step 5 fallback before anything else: cache `partnersRepository.listPublished`'s result for the legacy-network/impact-evidence reads (it does not vary per request) rather than adding client-side fetching, which would trade LCP for a loading spinner the design does not have. Re-run `npm run test:lighthouse` after any such change.

- [ ] **Step 8: Update the living checklist**

`docs/integration/wisetech-design-fidelity-checklist.md` — mark every WP-3 row (the 13 sections, the phone number, the structured-data extension, the Lighthouse target) `verified`, with this PR's link once it exists.

- [ ] **Step 9: Commit**

```bash
git add lighthouserc.js tests/e2e/wisetech-pr3-public-pages.spec.ts docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md docs/integration/wisetech-design-fidelity-checklist.md
git commit -m "$(cat <<'EOF'
test: re-measure the discover anchor and focus-ring contrast for WP-3 (E-52, E-64)

The #home-discover viewport-ratio threshold was measured against the old
4-section homepage; WP-3 replaced the hero and everything below it, so both
the resting and post-scroll readings moved. Re-measured rather than nudged,
per E-52's own instruction. E-64's focus-ring reading against the new hero
is recorded as Appendix D row E-70. lighthouserc.js now collects / and /zh
alongside the existing /membership targets.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Open the pull request**

```bash
git push -u origin feat/wt-wp2-shell
gh pr create --title "WP-3: homepage, the 13 sections over real read models" --body "$(cat <<'EOF'
## Summary
- Replaces the 4-section homepage with the donor's 13-section homepage, each section its own Server Component reading a real hkwtia data owner or degrading to an honest empty state independently.
- Confirms the WTIA phone number (errata E-20) and reads it from config on both the footer and the contact page.
- Extends Organization structured data with alternateName/telephone/address from siteConfig.contact and adds a WebSite node (errata E-68).
- Re-measures the #home-discover viewport-ratio threshold and the overlay header's focus-ring contrast against the new hero (errata E-52, E-64), and adds / and /zh to the Lighthouse target list.

## Test plan
- [ ] `npx vitest run` green
- [ ] `npm run lint` green
- [ ] `npm run typecheck` green
- [ ] `npm run build` green
- [ ] `npm run audit:strings` green
- [ ] `npx playwright test tests/e2e/wisetech-pr3-public-pages.spec.ts` green at 375/768/1024/1440px, both locales
- [ ] `npm run test:lighthouse` clears performance ≥ 0.90, accessibility ≥ 0.95, seo ≥ 0.95 on / and /zh

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

**1. Spec coverage.** Walking the master table's 13 rows: row 1 (Hero) → Task 2; row 2 (Open Now) → Task 3; row 3 (Pathways) → Task 4; row 4 (Events Journey) → Task 5; row 5 (Market Products) → Task 6; row 6 (Outcomes) → Task 7; row 7 (Ecosystem) → Task 8; row 8 (Programme Showcase) → Task 9; row 9 (GBA Gateway) → Task 10; row 10 (Impact Evidence) → Task 11; row 11 (Archive Stories) → Task 12; row 12 (Legacy Network) → Task 13; row 13 (Conversion Paths) → Task 14. The design doc's four numbered items: §1 phone number → Task 1; §2 hero scrim → Task 2; §3 the four errata closures (E-13, E-52, E-64, E-68) → E-13 is a check-before-adding-a-hero instruction that this plan does not trigger (no section adds a second in-page photo hero) and is recorded as inapplicable in Task 2's design; E-52 and E-64 → Task 16; E-68 → Task 15; §4 the Lighthouse approach → Task 16. `lib/home/home-highlights.ts` staying untouched, per the design doc, is recorded in Task 15 Step 6 rather than silently dropped. No gaps found.

**2. Placeholder scan.** Every code block is complete, runnable code — no `TBD`, no "add appropriate X". The one place values are genuinely deferred to execution (Task 16 Steps 3-4, the discover-anchor ratio and the focus-ring readings) is not a placeholder in the forbidden sense: the full measurement procedure, script and file locations are given in complete, runnable form, and only the *numbers a live browser produces* are left for the engineer to transcribe — exactly how the master spec's own E-52 and E-64 rows were originally produced, and unavoidable for a value that depends on the rendered page.

**3. Type consistency.** `AppLocale`-typed `{locale}` props are identical across all 13 section components and match `page.tsx`'s calls. `PartnerProjection`/`LegacyNetworkGroup`/`LegacyNetworkCategory` from Task 13 are used identically in Task 15's `loadLegacyNetworkGroups` call and the `LegacyNetwork` props. `ProgrammeSummary`'s `type`/`editionCount`/`latestYear` fields from Task 9 are read with the same names in `programme-showcase.tsx`. `ImpactMetrics`' `pastEvents`/`publishedPartners`/`asaRegions` fields from Task 11 are read with the same names in `impact-evidence.tsx` and asserted with the same names in `tests/unit/impact-metrics.test.ts` and `tests/unit/homepage.test.tsx`. The `EcosystemIndustryView` shape from Task 8 (`key`/`signal`/`href`/`name`/`brief`) is used identically in `ecosystem.tsx` and `lib/home/ecosystem-industries.ts`. All 13 `aria-labelledby` ids used in Task 15's `homepage.test.tsx` (`hero-title`, `open-now-title`, `pathways-title`, `events-journey-title`, `market-products-title`, `outcomes-title`, `ecosystem-title`, `programme-showcase-title`, `gba-gateway-title`, `impact-title`, `archive-stories-title`, `legacy-network-title`, `conversion-paths-title`) match the id each task's own component renders. No mismatches found.

