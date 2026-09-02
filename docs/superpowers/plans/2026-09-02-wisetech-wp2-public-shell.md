# WiseTech WP-2 Public Shell Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-render hkwtia's public shell — announcement bar, header, desktop mega menu, mobile dialog, footer and Concierge launcher — in the WiseTech donor's markup grammar over the classes WP-1 already ported, keeping hkwtia's four canonical navigation groups (D-3), its data owners, its route union and its accessibility floor unchanged.

**Architecture:** Every shell component keeps its current data flow — the public layout reads `announcementsRepository.getActive`, resolves `Navigation` / `Footer` / `Concierge` messages and passes plain view models down — and changes only the markup and class names it emits, so `app/styles/wisetech.css` (generated, byte-pinned) styles it without being edited. The `<header>` element itself becomes a thin client wrapper, `header-shell.tsx`, which reads `usePathname()` and resolves `data-variant` through `lib/public-shell/hero-variant.ts` **during the server render**, so an overlay page never reflows after hydration; the same component owns the passive scroll listener that adds `.scrolled` past 56 px of `scrollY`. One further island, `announcement-dismiss.tsx`, persists a per-session dismissal in `sessionStorage` and adds the `.no-announcement` modifier. Everything the donor stylesheet does not provide — the solid header variant, the 44 px tap-target floor, the mobile dialog's overlay — lives in one new hand-written companion sheet, `app/styles/wisetech-shell.css`, imported straight after the port so the generated file stays reproducible.

**Tech Stack:** Next.js 16 App Router (Webpack), React 19, Tailwind v3 with `tailwind.config.ts`, Radix `react-navigation-menu` / `react-dialog` / `react-accordion`, next-intl v4 `Link` / `usePathname` / `useRouter`, vitest + Testing Library, Playwright 1.61, axe-core.

**Programme context:** `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §0.3 (operating rules), §2 (non-negotiables), §3 (D-3 four groups, D-6 prepared `mailto:`, D-10 brand line), §4.2, §4.4 (Header/Brand, Footer, Concierge rows), §5 WP-2, §6 (Shell and i18n acceptance rows), Appendix B (Navigation / Footer / Concierge keys) and Appendix D errata E-1 to E-12 — E-9 (the port is imported from the public layout, never from `globals.css`) and E-11 (`components/wt/*` are styled only inside `(public)`; use `ActionLink` for donor-styled links and `Button variant="wt…"` only for real buttons) constrain this work package directly. Living status: `docs/integration/wisetech-design-fidelity-checklist.md` rows 2.1 to 2.10. Read `CLAUDE.md` and `AGENTS.md` first.

**Donor evidence, read-only:** commit `f91ecc5` is in this repository's object store. Read donor files with `git show f91ecc5:app/WiseTechSite.tsx`, `git show f91ecc5:app/megaNav.ts`, `git show f91ecc5:app/globals.css`. Shell markup and state live entirely in `WiseTechSite.tsx` (`Brand` `:208-220`, announcement `:376-381`, header `:382-422`, mega menu `:423-444`, mobile menu `:446-469`, footer `:1015-1034`, Concierge `:1036-1051`) plus `megaNav.ts`. Never import, copy as runtime code, or merge that tree; `tests/unit/wisetech-shell-boundary.test.ts` fails on any `WiseTechSite|FullInnerPages|ExpansionPages|YNWAforever/wisetech` reference in the six shell files it scans.

**Environment rules:** work only in the worktree `.worktrees/wt-wp2-shell` on branch `feat/wt-wp2-shell`, whose base is the WP-1 branch `feat/wt-wp1-tokens` (PR #34, still open). `node_modules` there is a junction; Windows; use `npm run …` and `npx …`. Stage explicit paths only; never stage `AGENTS.md`, `next-env.d.ts` or `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap` (the dev server and line endings rewrite them). Keep helper scripts out of the repository — throwaway probes belong in the scratchpad directory. `PLAYWRIGHT_BASE_URL` stays unset so Playwright manages the dev server; that server maps `DATABASE_URL` to `DATABASE_URL_TEST` (`tests/fixtures/m2-runtime-env.ts`), so a worktree without `.env.local` renders every data-backed section in its honest empty state and `announcementsRepository.getActive` rejects — **there is no announcement in any browser run or visual baseline**, which is why Task 2 is unit-tested against a fixture and asserts only the absent-announcement path in e2e. Four unit files time out under full-suite load and pass when run alone; when `npm test` reports a timeout, re-run the named file on its own before treating it as a failure.

---

## File structure

| Path | Responsibility |
|---|---|
| `config/navigation.ts` (modify) | Adds `feature: {labelKey,titleKey,copyKey,ctaKey,href}` per group and the new `NavigationMessageKey` members; `localizeNavigation` resolves the feature into the view model |
| `config/site.ts` (modify) | `siteConfig.contact`: `email`, optional `phone`, `addressLines` |
| `lib/public-shell/hero-variant.ts` (create) | Typed pathname → `SiteHeaderVariant` authority (`"/"` is the only overlay route today) |
| `lib/ai/concierge-prompts.ts` (create) | Prompt sections, `resolveConciergePromptSection`, `localizeConciergePrompts` |
| `messages/en.json`, `messages/zh-HK.json` (modify) | `Navigation.{explore,viewOverview,search,brand.descriptor,feature.*,mobile.*}`, `Footer.{tagline,legalLine,brand.descriptor,columns.*,newsletter.*}`, `Concierge.{launcher,transparency,prompts.*}` |
| `app/styles/wisetech-shell.css` (create) | Hand-written companion to the generated port: solid header variant, 44 px tap floor, mobile dialog overlay, footer target sizing |
| `app/[locale]/(public)/layout.tsx` (modify) | Imports the companion sheet after the port; passes `hasAnnouncement` and the header variant; builds the Concierge prompt view model |
| `components/layout/announcement-bar.tsx` (modify) | Donor `.announcement` markup, server-rendered; the `×` is the client island |
| `components/layout/announcement-dismiss.tsx` (create) | Client island: `sessionStorage` dismissal, hides the bar, adds `.no-announcement` to the header |
| `components/layout/dual-brand-lockup.tsx` (modify) | Donor `.brand` / `.brand-logo-wrap` / `.brand-copy` tile with the D-10 descriptor |
| `components/layout/site-header.tsx` (modify) | Server Component: `.header-inner` three-column grid, `.header-actions`, mobile trigger, wrapped in `HeaderShell` |
| `components/layout/header-shell.tsx` (create) | Client `<header class="site-header">`: `data-variant` from `usePathname()` at render time, `.scrolled` past `scrollY > 56` |
| `components/layout/desktop-mega-navigation.tsx` (modify) | `.desktop-nav` triggers with the chevron span; owns open state, focus return and `data-current` |
| `components/layout/mega-menu-panel.tsx` (create) | The `.mega-menu-v2` panel itself: heading, titled columns, feature aside — presentational, so it can be rendered without mounting Radix |
| `components/layout/mobile-navigation.tsx` (modify) | `.mobile-menu` dialog: top bar, priority actions, utilities, eyebrow, accordions with `.mobile-view-all` |
| `components/layout/locale-switcher.tsx` (modify) | Renders the donor `.language-link` chrome; behaviour unchanged |
| `components/layout/site-footer.tsx` (modify) | `.site-footer` with `.footer-top`, four `.footer-links` columns, `.footer-bottom` |
| `components/layout/footer-newsletter.tsx` (create) | Client island: `noValidate` form, prepared `mailto:`, `role="status"` / `role="alert"` (D-6) |
| `components/ai/concierge-widget.tsx` (modify) | `.concierge-trigger` launcher with the `W+` badge, prompt list, transparency link; no runtime change |
| `components/ui/navigation-menu.tsx` (modify) | Donor trigger chrome; takes Radix's open focus proxy out of the tab order (axe `aria-hidden-focus`) |
| `components/ui/sheet.tsx` (modify) | `side="full"` variant and an optional built-in close, for the donor's full-bleed mobile menu |
| `tests/unit/hero-variant.test.tsx` (create) | Pins the variant map, the resolver and the header's `data-variant` |
| `tests/unit/navigation-feature.test.ts` (create) | Pins feature hrefs as retained `PublicRoute`s and both bundles' feature keys |
| `tests/unit/site-footer.test.tsx` (create) | Pins four columns, the `<address>`, the newsletter status/alert and the bottom row |
| `tests/unit/concierge-prompts.test.ts` (create) | Pins section resolution and prompt localisation |
| `tests/unit/public-shell.test.tsx` (modify) | Header actions, `data-variant`, the Suspense fallbacks, the feature aside, footer hrefs |
| `tests/unit/mobile-navigation.test.tsx` (modify) | Priority actions, utilities, view-all class |
| `tests/unit/public-layout-announcement.test.tsx` (modify) | Dismiss `aria-label`, `no-announcement` modifier |
| `tests/unit/announcement.test.tsx` (modify) | Donor `.announcement` classes, `sessionStorage` dismissal |
| `tests/unit/dual-brand-lockup.test.tsx` (modify) | Descriptor instead of operator; donor tile classes |
| `tests/unit/navigation.test.ts` (modify) | Feature hrefs join the canonical-destination assertion |
| `tests/unit/wisetech-shell-boundary.test.ts` (modify) | The five new shell files join the donor-reference scan (Tasks 2, 3, 4, 6) |
| `tests/unit/wisetech-css-port.test.ts` (modify) | The companion sheet's existence, import order and lack of `@import` (Task 2) |
| `tests/e2e/public-shell.spec.ts` (modify) | Scrolled-header assertion; desktop viewports move above the ported 1240 px collapse |
| `tests/e2e/accessibility.spec.ts` (modify) | Desktop viewport moves above the 1240 px collapse (Task 4) |
| `tests/e2e/__screenshots__/wisetech-visual-baseline/*.png` (regenerate) | The post-WP-2 shell baseline |
| `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md`, `docs/integration/wisetech-design-fidelity-checklist.md` (modify) | Errata E-13 to E-24; rows 2.1 to 2.10 |

---

### Task 1: Navigation feature data, shell messages and the hero-variant authority

Pure data and pure functions first, so every later task has typed inputs and both message bundles already in parity. Nothing rendered changes in this task.

**Files:**
- Create: `lib/public-shell/hero-variant.ts`
- Create: `lib/ai/concierge-prompts.ts`
- Modify: `config/navigation.ts`
- Modify: `messages/en.json`, `messages/zh-HK.json`
- Modify: `tests/unit/navigation.test.ts`
- Test: `tests/unit/navigation-feature.test.ts`, `tests/unit/concierge-prompts.test.ts`, `tests/unit/hero-variant.test.tsx`

- [ ] **Step 1: Write the failing feature and prompt tests**

`tests/unit/navigation-feature.test.ts`

```ts
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {describe, expect, it} from "vitest";

import {localizeNavigation, navigationGroups} from "@/config/navigation";
import {publicRoutes} from "@/config/public-routes";
import {wisetechIntegrationManifest} from "@/config/wisetech-integration-manifest";

const retained = new Set(
  wisetechIntegrationManifest
    .filter(({kind, disposition}) => kind === "route" && disposition === "retain")
    .map(({canonicalPath}) => canonicalPath),
);

function messageAt(bundle: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (current, segment) =>
      current === null || typeof current !== "object" ? undefined : (current as Record<string, unknown>)[segment],
    bundle,
  );
}

describe("navigation feature aside", () => {
  it("gives every canonical group one feature whose href is a retained public route", () => {
    expect(navigationGroups).toHaveLength(4);
    for (const group of navigationGroups) {
      expect(publicRoutes, group.id).toContain(group.feature.href);
      expect(retained.has(group.feature.href), group.id).toBe(true);
    }
    expect(navigationGroups.map((group) => group.feature.href)).toEqual([
      "/events", "/contact", "/ai-transparency", "/about/history",
    ]);
  });

  it("resolves every feature key in both bundles to a non-empty string", () => {
    for (const group of navigationGroups) {
      for (const key of [group.feature.labelKey, group.feature.titleKey, group.feature.copyKey, group.feature.ctaKey]) {
        for (const [name, bundle] of [["en", en], ["zh-HK", zh]] as const) {
          const value = messageAt(bundle, `Navigation.${key}`);
          expect(typeof value, `${name}:${key}`).toBe("string");
          expect((value as string).trim().length, `${name}:${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("carries the feature into the localized view model", () => {
    const view = localizeNavigation((key) => `translated:${key}`);
    expect(view.groups[0]?.feature).toEqual({
      label: "translated:feature.eventsProgrammes.label",
      title: "translated:feature.eventsProgrammes.title",
      copy: "translated:feature.eventsProgrammes.copy",
      cta: "translated:feature.eventsProgrammes.cta",
      href: "/events",
    });
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("adds the shell chrome keys the donor grammar needs, in both bundles", () => {
    for (const key of [
      "Navigation.explore", "Navigation.viewOverview", "Navigation.search",
      "Navigation.brand.descriptor",
      "Navigation.mobile.priority", "Navigation.mobile.utilities", "Navigation.mobile.exploreEcosystem",
      "Footer.tagline", "Footer.legalLine", "Footer.brand.descriptor",
      "Footer.columns.explore", "Footer.columns.membership", "Footer.columns.about", "Footer.columns.contact",
      "Footer.newsletter.eyebrow", "Footer.newsletter.title", "Footer.newsletter.emailLabel",
      "Footer.newsletter.placeholder", "Footer.newsletter.submit", "Footer.newsletter.success",
      "Footer.newsletter.error", "Footer.newsletter.mailSubject", "Footer.newsletter.mailBody",
      "Concierge.transparency",
    ]) {
      for (const [name, bundle] of [["en", en], ["zh-HK", zh]] as const) {
        expect(typeof messageAt(bundle, key), `${name}:${key}`).toBe("string");
      }
    }
    expect(messageAt(en, "Concierge.launcher")).toBe("Ask WiseTech");
    expect(messageAt(zh, "Concierge.launcher")).toBe("問 WiseTech");
    expect(messageAt(en, "Footer.newsletter.mailBody")).toContain("{email}");
    expect(messageAt(zh, "Footer.newsletter.mailBody")).toContain("{email}");
    // The operator line is replaced by the D-10 descriptor; leaving it behind would let a
    // component keep rendering "Operated by WTIA" and pass parity.
    expect(messageAt(en, "Navigation.brand.operator")).toBeUndefined();
    expect(messageAt(en, "Footer.brand.operator")).toBeUndefined();
  });
});
```

`tests/unit/concierge-prompts.test.ts`

```ts
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {describe, expect, it} from "vitest";

import {
  conciergePromptSections,
  localizeConciergePrompts,
  resolveConciergePromptSection,
} from "@/lib/ai/concierge-prompts";

describe("concierge prompt sections", () => {
  it.each([
    ["/", "home"],
    ["/zh", "home"],
    ["/ai-ops", "home"],
    ["/membership", "membership"],
    ["/zh/membership", "membership"],
    ["/join", "membership"],
    ["/showcase", "showcase"],
    ["/zh/showcase/acme", "showcase"],
    ["/events", "events"],
    ["/zh/events/summit-2026", "events"],
  ] as const)("maps %s to the %s prompts", (pathname, section) => {
    expect(resolveConciergePromptSection(pathname)).toBe(section);
  });

  it("localizes a two-prompt pair per section from both bundles", () => {
    for (const bundle of [en, zh]) {
      const prompts = localizeConciergePrompts(
        (key) => (bundle.Concierge as {prompts: Record<string, unknown>}).prompts[key.split(".")[1]!],
      );
      for (const section of conciergePromptSections) {
        expect(prompts[section], section).toHaveLength(2);
        for (const prompt of prompts[section]) expect(prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("degrades to no prompts when the bundle value is not a string array", () => {
    expect(localizeConciergePrompts(() => undefined).home).toEqual([]);
    expect(localizeConciergePrompts(() => ["ok", 7]).home).toEqual([]);
  });
});
```

`tests/unit/hero-variant.test.tsx` — the pure half only; Task 3 appends the `HeaderShell` block to the same file once that component exists:

```tsx
import {describe, expect, it} from "vitest";

import {
  DEFAULT_HEADER_VARIANT,
  heroVariantByRoute,
  resolveHeaderVariant,
} from "@/lib/public-shell/hero-variant";

describe("hero variant", () => {
  it("keeps the overlay list to routes that open with a full-bleed hero", () => {
    expect(heroVariantByRoute).toEqual({"/": "overlay"});
    expect(DEFAULT_HEADER_VARIANT).toBe("solid");
  });

  it.each([
    ["/", "overlay"],
    ["/events", "solid"],
    ["/about/history", "solid"],
    ["/unknown", "solid"],
    ["/events/", "solid"],
  ] as const)("resolves %s to %s", (pathname, variant) => {
    expect(resolveHeaderVariant(pathname)).toBe(variant);
  });
});
```

- [ ] **Step 2: Run them and read the failure**

Run: `npx vitest run tests/unit/navigation-feature.test.ts tests/unit/concierge-prompts.test.ts tests/unit/hero-variant.test.tsx`
Expected: FAIL. `concierge-prompts.test.ts` and `hero-variant.test.tsx` fail at import (`Cannot find module '@/lib/ai/concierge-prompts'` / `'@/lib/public-shell/hero-variant'`); `navigation-feature.test.ts` fails on `group.feature` being `undefined` and on every missing message key.

- [ ] **Step 3: Add the feature model to `config/navigation.ts`**

Extend the message-key union, add the feature types, give each group a `feature`, and resolve it in `localizeNavigation`. Replace lines 3 to 18 with:

```ts
export type NavigationGroupId = "events-programmes" | "membership-ecosystem" | "impact-insights" | "about-wtia";
export type NavigationMessageKey =
  | "groups.eventsProgrammes.label" | "groups.eventsProgrammes.description"
  | "groups.membershipEcosystem.label" | "groups.membershipEcosystem.description"
  | "groups.impactInsights.label" | "groups.impactInsights.description"
  | "groups.aboutWtia.label" | "groups.aboutWtia.description"
  | "feature.eventsProgrammes.label" | "feature.eventsProgrammes.title" | "feature.eventsProgrammes.copy" | "feature.eventsProgrammes.cta"
  | "feature.membershipEcosystem.label" | "feature.membershipEcosystem.title" | "feature.membershipEcosystem.copy" | "feature.membershipEcosystem.cta"
  | "feature.impactInsights.label" | "feature.impactInsights.title" | "feature.impactInsights.copy" | "feature.impactInsights.cta"
  | "feature.aboutWtia.label" | "feature.aboutWtia.title" | "feature.aboutWtia.copy" | "feature.aboutWtia.cta"
  | "columns.participate" | "columns.programmes" | "columns.membership" | "columns.insights" | "columns.organisation" | "columns.connect"
  | "links.events" | "links.launchpad" | "links.hkict" | "links.asa" | "links.tct" | "links.cpai" | "links.membership" | "links.showcase" | "links.news" | "links.aiOps" | "links.aiTransparency" | "links.about" | "links.history" | "links.chairman" | "links.committees" | "links.contact"
  | "actions.findEvent" | "actions.join" | "actions.memberSignIn";

export type NavigationLink = Readonly<{id: string; href: PublicRoute; labelKey: NavigationMessageKey}>;
export type NavigationColumn = Readonly<{id: string; labelKey: NavigationMessageKey; links: readonly NavigationLink[]}>;
/**
 * The donor's `.mega-feature-v2` aside (app/megaNav.ts `feature`). Its href is a
 * `PublicRoute` because the shell may only point at canonical hkwtia destinations —
 * tests/unit/wisetech-shell-boundary.test.ts rejects the donor's own paths.
 */
export type NavigationFeature = Readonly<{
  labelKey: NavigationMessageKey;
  titleKey: NavigationMessageKey;
  copyKey: NavigationMessageKey;
  ctaKey: NavigationMessageKey;
  href: PublicRoute;
}>;
export type NavigationGroup = Readonly<{id: NavigationGroupId; landingHref: PublicRoute; eventFirst: boolean; labelKey: NavigationMessageKey; descriptionKey: NavigationMessageKey; feature: NavigationFeature; columns: readonly NavigationColumn[]}>;
export type LocalizedNavigationLink = Readonly<{id: string; href: PublicRoute; label: string}>;
export type LocalizedNavigationFeature = Readonly<{label: string; title: string; copy: string; cta: string; href: PublicRoute}>;
export type LocalizedNavigationGroup = Readonly<{id: NavigationGroupId; landingHref: PublicRoute; eventFirst: boolean; label: string; description: string; feature: LocalizedNavigationFeature; columns: readonly Readonly<{id: string; label: string; links: readonly LocalizedNavigationLink[]}>[]}>;
type PublicShellAction = Readonly<{id: "find-event" | "join-wisetech"; href: PublicRoute; labelKey: NavigationMessageKey; priority: "primary" | "secondary"}>;
```

Add a `feature` to each entry of `navigationGroups` (the rest of every entry is untouched):

```ts
  {id: "events-programmes", landingHref: "/events", eventFirst: true, labelKey: "groups.eventsProgrammes.label", descriptionKey: "groups.eventsProgrammes.description",
    feature: {labelKey: "feature.eventsProgrammes.label", titleKey: "feature.eventsProgrammes.title", copyKey: "feature.eventsProgrammes.copy", ctaKey: "feature.eventsProgrammes.cta", href: "/events"}, columns: [
```

```ts
  {id: "membership-ecosystem", landingHref: "/membership", eventFirst: false, labelKey: "groups.membershipEcosystem.label", descriptionKey: "groups.membershipEcosystem.description",
    feature: {labelKey: "feature.membershipEcosystem.label", titleKey: "feature.membershipEcosystem.title", copyKey: "feature.membershipEcosystem.copy", ctaKey: "feature.membershipEcosystem.cta", href: "/contact"}, columns: [
```

```ts
  {id: "impact-insights", landingHref: "/news", eventFirst: false, labelKey: "groups.impactInsights.label", descriptionKey: "groups.impactInsights.description",
    feature: {labelKey: "feature.impactInsights.label", titleKey: "feature.impactInsights.title", copyKey: "feature.impactInsights.copy", ctaKey: "feature.impactInsights.cta", href: "/ai-transparency"}, columns: [
```

```ts
  {id: "about-wtia", landingHref: "/about", eventFirst: false, labelKey: "groups.aboutWtia.label", descriptionKey: "groups.aboutWtia.description",
    feature: {labelKey: "feature.aboutWtia.label", titleKey: "feature.aboutWtia.title", copyKey: "feature.aboutWtia.copy", ctaKey: "feature.aboutWtia.cta", href: "/about/history"}, columns: [
```

In `localizeNavigation`, resolve the feature alongside the columns:

```ts
    groups: navigationGroups.map((group) => ({
      id: group.id,
      landingHref: group.landingHref,
      eventFirst: group.eventFirst,
      label: translate(group.labelKey),
      description: translate(group.descriptionKey),
      feature: {
        label: translate(group.feature.labelKey),
        title: translate(group.feature.titleKey),
        copy: translate(group.feature.copyKey),
        cta: translate(group.feature.ctaKey),
        href: group.feature.href,
      },
      columns: group.columns.map((column) => ({id: column.id, label: translate(column.labelKey), links: column.links.map((link) => ({id: link.id, href: link.href, label: translate(link.labelKey)}))})),
    })),
```

- [ ] **Step 4: Add `lib/public-shell/hero-variant.ts`**

```ts
import type {PublicRoute} from "@/config/public-routes";

/**
 * The donor header is always transparent and absolutely positioned over a full-bleed photo
 * hero. hkwtia has public pages with no hero at all, where white-on-white chrome would be
 * invisible, so "solid" is the group default and "overlay" is opted into per route.
 * WP-3 and WP-4 extend the map as each page gains its donor hero.
 */
export type SiteHeaderVariant = "overlay" | "solid";

export const DEFAULT_HEADER_VARIANT: SiteHeaderVariant = "solid";

export const heroVariantByRoute = {
  "/": "overlay",
} as const satisfies Partial<Record<PublicRoute, SiteHeaderVariant>>;

/** `pathname` is the locale-stripped path from `usePathname` in `@/i18n/navigation`. */
export function resolveHeaderVariant(pathname: string): SiteHeaderVariant {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (heroVariantByRoute as Record<string, SiteHeaderVariant | undefined>)[normalized] ?? DEFAULT_HEADER_VARIANT;
}
```

- [ ] **Step 5: Add `lib/ai/concierge-prompts.ts`**

```ts
export const conciergePromptSections = ["home", "membership", "showcase", "events"] as const;
export type ConciergePromptSection = typeof conciergePromptSections[number];
export type ConciergePrompts = Readonly<Record<ConciergePromptSection, readonly string[]>>;

/**
 * The donor branches on `path[0]` with `membership|join`, `members`, `events` and a default
 * (app/WiseTechSite.tsx `:1041-1044`). hkwtia merges the donor's members and solutions
 * sections into `/showcase` (D-3), so that donor branch supplies the showcase pair.
 * `pathname` may still carry the `/zh` prefix here: the Concierge reads it from
 * `window.location`, not from `usePathname`, so the widget needs no router hook.
 */
export function resolveConciergePromptSection(pathname: string): ConciergePromptSection {
  const withoutLocale = pathname.startsWith("/zh/") ? pathname.slice(3) : pathname === "/zh" ? "/" : pathname;
  const segment = withoutLocale.split("/").filter(Boolean)[0];
  if (segment === "membership" || segment === "join") return "membership";
  if (segment === "showcase") return "showcase";
  if (segment === "events") return "events";
  return "home";
}

function promptPair(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
    ? (value as readonly string[])
    : [];
}

/** `raw` is next-intl's `t.raw` for the `Concierge` namespace; the values are arrays. */
export function localizeConciergePrompts(raw: (key: string) => unknown): ConciergePrompts {
  return Object.fromEntries(
    conciergePromptSections.map((section) => [section, promptPair(raw(`prompts.${section}`))]),
  ) as ConciergePrompts;
}
```

- [ ] **Step 6: Add the message keys to both bundles**

Every value below is authored in the donor's register; the zh column is the donor's own Traditional Chinese where the donor has an equivalent string, and newly authored HK-register Chinese where hkwtia's four groups have no donor counterpart. The donor's `events-activities` feature title ("No activities are currently open.") is **not** ported: it is the donor's honest empty state for a site with no event data, and printing it as static navigation copy over hkwtia's real `events` table would be a fabricated claim (spec §0.3).

`Navigation` — replace `brand.operator` with `brand.descriptor` and add the new leaves:

| Key | EN | ZH |
|---|---|---|
| `Navigation.brand.descriptor` | The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association | Hong Kong Wireless Technology Industry Association 持續發展中的 AI+ 產業平台 · 中文法定名稱待正式批准 |
| `Navigation.explore` | Explore | 探索 |
| `Navigation.viewOverview` | View overview | 查看總覽 |
| `Navigation.search` | Search WiseTech | 搜尋 WiseTech |
| `Navigation.mobile.priority` | Priority actions | 主要操作 |
| `Navigation.mobile.utilities` | Utility navigation | 實用導覽 |
| `Navigation.mobile.exploreEcosystem` | Explore the ecosystem | 探索生態系統 |
| `Navigation.feature.eventsProgrammes.label` | Open now | 現正開放 |
| `Navigation.feature.eventsProgrammes.title` | See what is open before you plan. | 先看清現正開放的項目，再作計劃。 |
| `Navigation.feature.eventsProgrammes.copy` | Registrations, awards and programme rounds appear here as WTIA records confirm them. | 報名、獎項及計劃輪次一經 WTIA 記錄確認，即會在此顯示。 |
| `Navigation.feature.eventsProgrammes.cta` | Browse what is open | 瀏覽現正開放項目 |
| `Navigation.feature.membershipEcosystem.label` | Member platform | 會員平台 |
| `Navigation.feature.membershipEcosystem.title` | Bring a real business need into the network. | 把真實業務需要帶進網絡。 |
| `Navigation.feature.membershipEcosystem.copy` | Prepare a buyer brief without exposing confidential information or implying a guaranteed match. | 在不公開機密資料或暗示保證配對下準備買家簡報。 |
| `Navigation.feature.membershipEcosystem.cta` | Submit a challenge | 提交挑戰 |
| `Navigation.feature.impactInsights.label` | Technology + Wisdom | 科技 + 智慧 |
| `Navigation.feature.impactInsights.title` | Practical progress needs responsible choices. | 實務進步需要負責任選擇。 |
| `Navigation.feature.impactInsights.copy` | Explore human accountability, data protection, security, transparency and ongoing evaluation. | 探索人的問責、資料保障、安全、透明度及持續評估。 |
| `Navigation.feature.impactInsights.cta` | AI transparency | 人工智能透明度 |
| `Navigation.feature.aboutWtia.label` | The association | 認識商會 |
| `Navigation.feature.aboutWtia.title` | Read the association's own record. | 細閱商會的自身紀錄。 |
| `Navigation.feature.aboutWtia.copy` | History milestones, the chairman's message, committees and contact channels are published as WTIA holds them. | 歷史里程碑、主席的話、委員會及聯絡渠道，均按 WTIA 持有的紀錄發布。 |
| `Navigation.feature.aboutWtia.cta` | Read the history | 細閱歷史 |

`Footer` — replace `brand.operator` with `brand.descriptor` and add:

| Key | EN | ZH |
|---|---|---|
| `Footer.brand.descriptor` | The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association | Hong Kong Wireless Technology Industry Association 持續發展中的 AI+ 產業平台 · 中文法定名稱待正式批准 |
| `Footer.legalLine` | WiseTech Hong Kong — the evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association. | WiseTech Hong Kong — Hong Kong Wireless Technology Industry Association 持續發展中的 AI+ 產業平台。[官方中文名稱待正式批准] |
| `Footer.tagline` | Technology + Wisdom. Hong Kong + The World. | Technology + Wisdom. Hong Kong + The World. |
| `Footer.columns.explore` | Explore | 探索 |
| `Footer.columns.membership` | Membership | 會籍 |
| `Footer.columns.about` | About | 關於 |
| `Footer.columns.contact` | Contact | 聯絡 |
| `Footer.newsletter.eyebrow` | Activity updates | 活動通知 |
| `Footer.newsletter.title` | What should Hong Kong build next? | 香港下一步應建設甚麼？ |
| `Footer.newsletter.emailLabel` | Work email | 工作電郵 |
| `Footer.newsletter.placeholder` | Work email | 工作電郵 |
| `Footer.newsletter.submit` | Prepare activity-update email | 準備活動通知電郵 |
| `Footer.newsletter.success` | Your email app should open with a prepared request. This page does not create a subscription automatically. | 你的電郵程式應會開啟並備妥查詢；本頁不會自動建立訂閱。 |
| `Footer.newsletter.error` | Enter a valid work email. | 請輸入有效工作電郵。 |
| `Footer.newsletter.mailSubject` | WiseTech activity updates | WiseTech 活動通知 |
| `Footer.newsletter.mailBody` | Please add {email} to the WiseTech activity update list. | 請將 {email} 加入 WiseTech 活動通知名單。 |

`Concierge` — change two existing values and add three leaves:

| Key | EN | ZH |
|---|---|---|
| `Concierge.launcher` | Ask WiseTech | 問 WiseTech |
| `Concierge.transparency` | How this assistant works | 了解智能助理運作方式 |
| `Concierge.prompts.home` | `["How can WiseTech help my organisation?", "Show the AI+ industry pathways"]` | `["WiseTech 如何幫助我的機構？", "顯示 AI+ 產業路徑"]` |
| `Concierge.prompts.membership` | `["Which membership suits my organisation?", "What benefits do startups receive?"]` | `["哪種會籍適合我的機構？", "初創企業可獲得甚麼權益？"]` |
| `Concierge.prompts.showcase` | `["Find providers serving SMEs", "How do introductions work?"]` | `["尋找服務中小企的供應商", "引薦流程如何運作？"]` |
| `Concierge.prompts.events` | `["Which event is relevant to retail?", "Show Cantonese events"]` | `["哪些活動適合零售業？", "顯示粵語活動"]` |

`Concierge.title`, `description` and `close` keep hkwtia's current values. The donor hard-codes English there and its `description` is a trust statement rather than a capability statement (donor brief §6); changing them is a copy decision for the owner, not a fidelity gap, and `tests/e2e/concierge.spec.ts` names the dialog by `Concierge.title`.

`collectLeafKeys` in `tests/unit/messages.test.ts` treats an array as one leaf, so the four prompt arrays keep key parity, and `collectLeafEntries` skips arrays, so the ICU checks never try to parse them.

- [ ] **Step 7: Extend `tests/unit/navigation.test.ts` for the feature destinations**

In `it("keeps every public destination canonical and retained")`, extend the `destinations` array so a feature href can never point outside the canonical union:

```ts
    const destinations = [
      ...groupShape.flatMap(({links}) => links),
      ...navigationGroups.map((group) => group.feature.href),
      publicShellActions.findEvent.href,
      publicShellActions.join.href,
    ];
```

Add `navigationGroups` to the import list from `@/config/navigation` if it is not already there (it is, at line 6).

- [ ] **Step 8: Run the focused tests and the neighbours**

Run: `npx vitest run tests/unit/navigation-feature.test.ts tests/unit/concierge-prompts.test.ts tests/unit/hero-variant.test.tsx tests/unit/navigation.test.ts tests/unit/messages.test.ts`
Expected: all pass. `messages.test.ts` proves both bundles are still in leaf-key parity and every ICU plural still formats. `public-shell.test.tsx`, `dual-brand-lockup.test.tsx` and `site-footer` are expected to be **red** from this commit onward because `brand.operator` is gone — Task 3 and Task 6 fix them, and Step 9 records that.

- [ ] **Step 9: Typecheck, lint, string audit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint config lib/public-shell lib/ai messages --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. `tsc` proves the four `feature` entries satisfy `NavigationGroup` and that every `labelKey` is a `NavigationMessageKey` member.

- [ ] **Step 10: Commit**

```bash
git add config/navigation.ts lib/public-shell/hero-variant.ts lib/ai/concierge-prompts.ts messages/en.json messages/zh-HK.json tests/unit/navigation-feature.test.ts tests/unit/concierge-prompts.test.ts tests/unit/hero-variant.test.tsx tests/unit/navigation.test.ts
git commit -m "feat: add the mega-menu feature model, shell messages and hero-variant map (WP-2)" -m "<why: D-3 keeps four groups and ports presentation only; D-10 replaces the operator line with the descriptor; feature hrefs are retained PublicRoute members; RED then GREEN totals; public-shell/dual-brand-lockup stay red until Task 3>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Announcement bar in the donor grammar, with per-session dismissal

The bar becomes a Server Component in the donor's `.announcement` markup; only the `×` is a client island, which is what makes the `sessionStorage` dismissal possible without shipping the bar's text through the client boundary. Data is unchanged: the layout still reads `announcementsRepository.getActive(new Date()).catch(() => null)` and passes the same four-field `AnnouncementBarView`.

**Files:**
- Modify: `components/layout/announcement-bar.tsx`
- Create: `components/layout/announcement-dismiss.tsx`
- Create: `app/styles/wisetech-shell.css`
- Modify: `app/[locale]/(public)/layout.tsx`
- Modify: `tests/unit/wisetech-shell-boundary.test.ts`, `tests/unit/wisetech-css-port.test.ts`
- Test: `tests/unit/announcement.test.tsx`, `tests/unit/public-layout-announcement.test.tsx`

- [ ] **Step 1: Rewrite the failing `AnnouncementBar` block and extend the layout test**

Replace the whole `describe("AnnouncementBar")` block at the end of `tests/unit/announcement.test.tsx` with:

```tsx
describe("AnnouncementBar", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    document.body.innerHTML = "";
  });

  const announcement = {id: "launch", href: "/events" as const, text: "瀏覽即將舉行的活動", ctaLabel: "查看活動"};

  it("renders the donor bar and dismisses it for the session only", () => {
    document.body.insertAdjacentHTML("afterbegin", '<header class="site-header"></header>');
    render(<AnnouncementBar announcement={announcement} label="公告" dismissLabel="關閉公告" />);

    const bar = screen.getByRole("complementary", {name: "公告"});
    expect(bar).toHaveClass("announcement");
    expect(bar).toHaveAttribute("aria-live", "polite");
    expect(bar).toHaveAttribute("aria-atomic", "true");
    expect(bar.querySelector(".announcement-dot")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("瀏覽即將舉行的活動")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "查看活動"})).toHaveAttribute("href", "/events");

    const dismiss = screen.getByRole("button", {name: "關閉公告"});
    expect(dismiss).toHaveClass("announcement-close");
    fireEvent.click(dismiss);

    expect(screen.queryByRole("complementary", {name: "公告"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "關閉公告"})).not.toBeInTheDocument();
    expect(document.querySelector("header.site-header")).toHaveClass("no-announcement");
    expect(window.sessionStorage.getItem("hkwtia:announcement-dismissed")).toBe("launch");
    expect(document.cookie).toBe("");
  });

  it("stays dismissed for the same id after a remount and returns for a new one", () => {
    window.sessionStorage.setItem("hkwtia:announcement-dismissed", "launch");
    const first = render(<AnnouncementBar announcement={announcement} label="公告" dismissLabel="關閉公告" />);
    expect(screen.queryByRole("complementary", {name: "公告"})).not.toBeInTheDocument();
    first.unmount();

    render(<AnnouncementBar announcement={{...announcement, id: "second"}} label="公告" dismissLabel="關閉公告" />);
    expect(screen.getByRole("complementary", {name: "公告"})).toBeInTheDocument();
  });

  it("survives a sessionStorage that throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<AnnouncementBar announcement={announcement} label="Announcement" dismissLabel="Dismiss announcement" />);
    expect(screen.getByRole("complementary", {name: "Announcement"})).toBeInTheDocument();
    getItem.mockRestore();
  });

  it("renders nothing for a null provider result", () => {
    const {container} = render(<AnnouncementBar announcement={null} label="Announcement" dismissLabel="Dismiss announcement" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps an arbitrary allowed token breakable at narrow widths", () => {
    render(<AnnouncementBar announcement={{...announcement, text: "a".repeat(180)}} label="Announcement" dismissLabel="Dismiss announcement" />);
    expect(screen.getByText("a".repeat(180))).toHaveClass("announcement-text");
  });
});
```

Add `beforeEach` to the vitest import at the top of the file (`import {beforeEach, describe, expect, it, vi} from "vitest";`).

In `tests/unit/public-layout-announcement.test.tsx`, record the bar's own props and the header's, then assert the layout's new contract. Replace the two shell mocks with:

```tsx
vi.mock("@/components/layout/site-header", () => ({
  SiteHeader: (props: {hasAnnouncement?: boolean}) => {
    barState.hasAnnouncement = props.hasAnnouncement;
    return <header>Header</header>;
  },
}));
vi.mock("@/components/layout/announcement-bar", () => ({
  AnnouncementBar: ({announcement, dismissLabel}: {announcement: {id: string; href: string; text: string; ctaLabel: string} | null; dismissLabel: string}) => {
    barState.announcement = announcement;
    barState.dismissLabel = dismissLabel;
    return announcement ? <aside>{announcement.text} {announcement.ctaLabel}</aside> : null;
  },
}));
```

Widen the hoisted state and add the assertions inside the existing `it`:

```tsx
const barState = vi.hoisted(() => ({
  announcement: null as Record<string, unknown> | null,
  dismissLabel: "",
  hasAnnouncement: undefined as boolean | undefined,
}));
```

```tsx
    expect(barState.dismissLabel).toBe("dismiss");
    expect(barState.hasAnnouncement).toBe(true);
```

and, after the rejected read, `expect(barState.hasAnnouncement).toBe(false);` (the mocked translator returns the key, so `dismissLabel` is the literal `"dismiss"`).

- [ ] **Step 2: Run them and read the failure**

Run: `npx vitest run tests/unit/announcement.test.tsx tests/unit/public-layout-announcement.test.tsx`
Expected: FAIL. The bar has no `announcement` class, no `.announcement-dot`, the link's accessible name is still `text + " " + ctaLabel`, nothing writes `sessionStorage` or `no-announcement`, and `barState.hasAnnouncement` is `undefined` because the layout does not pass it yet.

- [ ] **Step 3: Write the dismiss island**

`components/layout/announcement-dismiss.tsx`

```tsx
"use client";

import {useEffect, useState} from "react";

/**
 * One key, not one per id: the donor dismisses "the announcement", and the repository only
 * ever serves one at a time (announcementsRepository.getActive). Storing the id lets a newly
 * published announcement reappear without the reader having to clear anything.
 */
const DISMISSED_KEY = "hkwtia:announcement-dismissed";

/** Private browsing and blocked site data make sessionStorage throw, not return null. */
function readDismissedId(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissedId(id: string) {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, id);
  } catch {
    // A reader who cannot persist the dismissal still gets it for this page view.
  }
}

type AnnouncementDismissProps = {
  announcementId: string;
  label: string;
  /** id of the server-rendered `.announcement` element this button lives inside. */
  barId: string;
};

export function AnnouncementDismiss({announcementId, label, barId}: AnnouncementDismissProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (readDismissedId() === announcementId) setDismissed(true);
  }, [announcementId]);

  // The bar and the header are server-rendered siblings, so the island writes to them
  // directly rather than lifting their markup across the client boundary. React never
  // re-renders those nodes, so nothing competes for these attributes.
  useEffect(() => {
    const bar = document.getElementById(barId);
    const header = document.querySelector<HTMLElement>("header.site-header");
    if (bar) {
      bar.setAttribute("data-dismissed", String(dismissed));
      if (dismissed) bar.setAttribute("aria-hidden", "true");
      else bar.removeAttribute("aria-hidden");
    }
    header?.classList.toggle("no-announcement", dismissed);
  }, [barId, dismissed]);

  if (dismissed) return null;

  return (
    <button
      type="button"
      className="announcement-close"
      aria-label={label}
      onClick={() => {
        writeDismissedId(announcementId);
        setDismissed(true);
      }}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
```

- [ ] **Step 4: Rewrite `components/layout/announcement-bar.tsx` as a Server Component**

```tsx
import {AnnouncementDismiss} from "@/components/layout/announcement-dismiss";
import {Arrow} from "@/components/wt/arrow";
import {Link} from "@/i18n/navigation";
import type {AnnouncementBarView} from "@/lib/public-shell/announcement";

/** The dismiss island targets the bar by id; the header modifier is keyed off the same state. */
const ANNOUNCEMENT_ELEMENT_ID = "site-announcement";

type AnnouncementBarProps = {
  announcement: AnnouncementBarView | null;
  label: string;
  dismissLabel: string;
};

// Donor app/WiseTechSite.tsx :376-381 — an ink bar with an amber dot, the message, a CTA with
// the arrow, and a round × on the right. hkwtia keeps the <aside> landmark and the polite live
// region the donor's plain <div> lacks (spec §2.9 accessibility floor).
export function AnnouncementBar({announcement, label, dismissLabel}: AnnouncementBarProps) {
  if (!announcement) return null;

  return (
    <aside
      id={ANNOUNCEMENT_ELEMENT_ID}
      className="announcement"
      aria-label={label}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="announcement-dot" aria-hidden="true" />
      <span className="announcement-text">{announcement.text}</span>
      <Link href={announcement.href}>
        {announcement.ctaLabel} <Arrow />
      </Link>
      <AnnouncementDismiss
        announcementId={announcement.id}
        label={dismissLabel}
        barId={ANNOUNCEMENT_ELEMENT_ID}
      />
    </aside>
  );
}
```

- [ ] **Step 5: Create the companion stylesheet with the rules the port cannot carry**

`app/styles/wisetech-shell.css`

```css
/*
 * Hand-written companion to app/styles/wisetech.css.
 *
 * The port is regenerated byte for byte by scripts/port-wisetech-css.mjs and pinned by
 * tests/unit/wisetech-css-port.test.ts, so it must never be hand-edited. Everything hkwtia
 * needs that the donor stylesheet does not contain lives here instead, and this file is
 * imported from the public layout immediately after the port so it wins on equal specificity
 * (design-fidelity errata E-9 ordering).
 */

/* The donor's announcement is dismissed by unmounting a client-owned <div>. hkwtia renders the
 * bar on the server so its text never crosses the client boundary; the island marks it
 * instead. */
.announcement[data-dismissed="true"] { display: none; }
.announcement-text { min-width: 0; overflow-wrap: anywhere; }
```

- [ ] **Step 6: Import the companion sheet and pass the new props from the public layout**

In `app/[locale]/(public)/layout.tsx`, add the second import directly under the port import (keeping the existing errata E-9 comment above them):

```tsx
import "../../styles/wisetech.css";
// Hand-written shell overrides; must load after the generated port so equal-specificity
// rules win. See app/styles/wisetech-shell.css for what belongs here and why.
import "../../styles/wisetech-shell.css";
```

and pass the announcement flag to the header:

```tsx
      <SiteHeader locale={appLocale} hasAnnouncement={announcement !== null} />
```

`SiteHeader` does not accept `hasAnnouncement` until Task 3, so `tsc` stays red between this commit and Task 3's, and `npm run build` therefore fails at this commit; Step 8 records that and Task 3 Step 9 clears it.

- [ ] **Step 6a: Cover the companion sheet in the port contract**

The generated port has a test that pins where it is imported; the companion sheet needs the same protection, or nothing catches it being dropped, moved before the port, or given an `@import`. Extend `it("is imported by the public route group, after the Tailwind layers")` in `tests/unit/wisetech-css-port.test.ts:63-66`:

```ts
const shellOverrides = existsSync(resolve(process.cwd(), "app/styles/wisetech-shell.css"))
  ? readFileSync(resolve(process.cwd(), "app/styles/wisetech-shell.css"), "utf8")
  : null;
```

```ts
  it("is imported by the public route group, after the Tailwind layers", () => {
    expect(rootLayout).toContain('import "../globals.css";');
    expect(rootLayout).not.toContain("styles/wisetech.css");
    expect(publicLayout).toContain('import "../../styles/wisetech.css";');

    // The hand-written companion must load after the generated port so its equal-specificity
    // rules win, and it must not pull anything in of its own (errata E-24).
    expect(shellOverrides).not.toBeNull();
    expect(publicLayout.indexOf('import "../../styles/wisetech-shell.css";'))
      .toBeGreaterThan(publicLayout.indexOf('import "../../styles/wisetech.css";'));
    expect(shellOverrides).not.toContain("@import");
  });
```

Add the shell file to the donor-reference scan in `tests/unit/wisetech-shell-boundary.test.ts:6-13` as well:

```ts
  "components/layout/announcement-bar.tsx",
  "components/layout/announcement-dismiss.tsx",
```

- [ ] **Step 7: Run the focused tests and the neighbours**

Run: `npx vitest run tests/unit/announcement.test.tsx tests/unit/public-layout-announcement.test.tsx tests/unit/wisetech-shell-boundary.test.ts tests/unit/public-landmark-contract.test.ts tests/unit/wisetech-css-port.test.ts`
Expected: all pass. `wisetech-css-port.test.ts` still reads `app/styles/wisetech.css` unchanged — if any of its selector or keyframe assertions fail, the generated port was hand-edited; restore it with `npm run port:wisetech`.

- [ ] **Step 8: Lint and string audit**

Run: `npx eslint components/layout app --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. The `×` glyph is symbol-only and additionally sits inside an `aria-hidden` span, so `scripts/audit-visible-strings.mjs` accepts it on both rules. `npx tsc --noEmit` is expected to fail on `SiteHeader`'s missing `hasAnnouncement` prop until Task 3, and `npm run build` therefore fails at this commit; do not "fix" it by dropping the prop.

- [ ] **Step 9: Commit**

```bash
git add components/layout/announcement-bar.tsx components/layout/announcement-dismiss.tsx app/styles/wisetech-shell.css "app/[locale]/(public)/layout.tsx" tests/unit/wisetech-shell-boundary.test.ts tests/unit/wisetech-css-port.test.ts tests/unit/announcement.test.tsx tests/unit/public-layout-announcement.test.tsx
git commit -m "feat: render the announcement bar in the donor grammar with session dismissal (WP-2)" -m "<why: server-rendered .announcement so the text never crosses the client boundary; the × is the only island; sessionStorage per session and the .no-announcement header modifier; RED then GREEN totals; tsc red on SiteHeader.hasAnnouncement until the header task>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Brand lockup, header shell and the scroll state

**Files:**
- Modify: `components/layout/dual-brand-lockup.tsx`
- Modify: `components/layout/site-header.tsx`
- Modify: `components/layout/site-footer.tsx` (brand label only; the rest lands in Task 6)
- Modify: `components/layout/locale-switcher.tsx`
- Create: `components/layout/header-shell.tsx`
- Modify: `tests/unit/wisetech-shell-boundary.test.ts`
- Modify: `app/styles/wisetech-shell.css`
- Modify: `app/[locale]/(public)/layout.tsx`
- Test: `tests/unit/hero-variant.test.tsx`, `tests/unit/dual-brand-lockup.test.tsx`, `tests/unit/public-shell.test.tsx`

- [ ] **Step 1: Write the failing header tests**

Task 1 already created `tests/unit/hero-variant.test.tsx` with the pure `describe("hero variant")` block. Replace its import header with the one below — the `hero-variant` imports and the existing `describe` stay exactly as they are — and append the second `describe`:

```tsx
import {render} from "@testing-library/react";
import {act} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";

const {pathnameState} = vi.hoisted(() => ({pathnameState: {current: "/"}}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameState.current,
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));

import {HeaderShell} from "@/components/layout/header-shell";

afterEach(() => {
  window.scrollY = 0;
});

describe("HeaderShell", () => {
  it("puts the per-route variant in the server markup, before any effect can run", () => {
    pathnameState.current = "/";
    const overlay = renderToStaticMarkup(<HeaderShell hasAnnouncement><span /></HeaderShell>);
    expect(overlay).toContain('data-variant="overlay"');
    expect(overlay).toContain('class="site-header"');

    pathnameState.current = "/events";
    const solid = renderToStaticMarkup(<HeaderShell hasAnnouncement={false}><span /></HeaderShell>);
    expect(solid).toContain('data-variant="solid"');
    expect(solid).toContain("site-header no-announcement");
    expect(solid).not.toContain("scrolled");
  });

  it("adds and removes the scrolled class at the 56px threshold", () => {
    pathnameState.current = "/";
    const {container} = render(<HeaderShell hasAnnouncement={false}><span /></HeaderShell>);
    const header = container.querySelector("header")!;
    expect(header.classList.contains("scrolled")).toBe(false);

    act(() => {
      window.scrollY = 57;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.classList.contains("scrolled")).toBe(true);

    act(() => {
      window.scrollY = 20;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.classList.contains("scrolled")).toBe(false);
  });

  it("stops listening once unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const view = render(<HeaderShell hasAnnouncement={false}><span /></HeaderShell>);
    view.unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });
});
```

In `tests/unit/dual-brand-lockup.test.tsx`, replace the `labels` object and both `it` bodies:

```tsx
const labels = {
  homeLabel: "WiseTech Hong Kong home",
  publicName: "WiseTech Hong Kong",
  descriptor: "The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association",
  logoAlt: "WTIA",
};

describe("DualBrandLockup", () => {
  it("renders the donor tile with the WTIA logo and the D-10 descriptor", () => {
    const {container} = render(<DualBrandLockup labels={labels} priority />);

    const link = screen.getByRole("link", {name: labels.homeLabel});
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("brand");
    expect(container.querySelector(".brand-logo-wrap")).not.toBeNull();
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByText(labels.publicName).tagName).toBe("STRONG");
    expect(screen.getByText(labels.descriptor).tagName).toBe("SMALL");
  });

  it("keeps long localized labels inside a 44px, width-constrained target", () => {
    const longLabels = {
      ...labels,
      publicName: "WiseTech Hong Kong 香港智慧科技創新協會國際合作及企業創新發展中心",
      descriptor: "由香港智慧科技創新協會營運並提供本地社群及產業支援服務",
    };

    render(<DualBrandLockup labels={longLabels} />);

    const link = screen.getByRole("link", {name: longLabels.homeLabel});
    expect(link).toHaveClass("min-h-11", "min-w-11", "max-w-full");
    expect(screen.getByRole("img", {name: longLabels.logoAlt})).toHaveClass("object-contain");
  });
});
```

In `tests/unit/public-shell.test.tsx`, add `import {renderToStaticMarkup} from "react-dom/server";` at the top and make the pathname mock (`tests/unit/public-shell.test.tsx:36-41`) mutable, because `HeaderShell` now resolves the variant from it during render:

```tsx
const {imagePriorities, pathnameState} = vi.hoisted(() => ({
  imagePriorities: [] as boolean[],
  pathnameState: {current: "/events"},
}));
```

```tsx
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameState.current,
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));
```

Then replace the header `it.each` and the Suspense-fallback test, and add the variant test:

```tsx
  it.each([
    ["en", "Events & Programmes", "Join WiseTech", "The evolving AI+ industry platform of the Hong Kong Wireless Technology Industry Association", "Search WiseTech"],
    ["zh-HK", "活動及計劃", "加入 WiseTech", "Hong Kong Wireless Technology Industry Association 持續發展中的 AI+ 產業平台 · 中文法定名稱待正式批准", "搜尋 WiseTech"],
  ] as const)("renders complete %s header copy", async (locale, group, join, descriptor, search) => {
    const view = render(await SiteHeader({locale, hasAnnouncement: true}));
    expect(screen.getByText("WiseTech Hong Kong")).toBeInTheDocument();
    expect(screen.getByText(descriptor)).toBeInTheDocument();
    expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", {name: join})).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", {name: search})).toHaveAttribute("href", "/showcase");
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("data-priority", "true");
    expect(imagePriorities).toContain(true);
    view.unmount();
  });

  it("carries the route's variant and the announcement modifier on the header element", async () => {
    pathnameState.current = "/";
    const overlay = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: true}));
    expect(overlay).toContain('data-variant="overlay"');
    expect(overlay).toContain('class="site-header"');

    pathnameState.current = "/events";
    const solid = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: false}));
    expect(solid).toContain('data-variant="solid"');
    expect(solid).toContain("site-header no-announcement");
  });

  it("uses a non-landmark layout placeholder for the desktop navigation suspense fallback", () => {
    const source = readFileSync(resolve(process.cwd(), "components/layout/site-header.tsx"), "utf8");

    expect(source).not.toContain("fallback={<nav");
    expect(source).toContain('fallback={<div aria-hidden="true" className="desktop-nav" />}');
    expect(source).toContain("<HeaderShell hasAnnouncement={hasAnnouncement}>");
  });
```

- [ ] **Step 2: Run them and read the failure**

Run: `npx vitest run tests/unit/hero-variant.test.tsx tests/unit/dual-brand-lockup.test.tsx tests/unit/public-shell.test.tsx`
Expected: FAIL. `hero-variant.test.tsx` cannot resolve `@/components/layout/header-shell` (its `describe("hero variant")` block from Task 1 still passes); the lockup still renders `labels.operator` and Tailwind-only markup; the header still renders two rows, a "Find an event" button and the old fallback literal, and rejects `hasAnnouncement`.

- [ ] **Step 3: Rewrite the brand lockup**

`components/layout/dual-brand-lockup.tsx`

```tsx
import Image from "next/image";

import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type DualBrandLockupProps = {
  labels: {
    homeLabel: string;
    publicName: string;
    /** D-10: the association's own description of itself, including the zh legal-name note. */
    descriptor: string;
    logoAlt: string;
  };
  priority?: boolean;
  className?: string;
};

// Donor app/WiseTechSite.tsx :208-220 — a white 108x48 logo tile beside the wordmark and the
// descriptor. The Tailwind utilities on the anchor are hkwtia's own 44px tap-target floor
// (spec §2.9); the donor's .brand carries no minimum. No `min-w-0` here: `.brand` already
// sets min-width: 0 (app/styles/wisetech.css:55), and passing both to `cn` would let
// tailwind-merge drop `min-w-11` and fail the lockup's own 44px assertion. The PNG is
// byte-pinned by tests/unit/wisetech-asset-provenance.test.ts — restyle the tile, never the file.
export function DualBrandLockup({labels, priority = false, className}: DualBrandLockupProps) {
  return (
    <Link
      className={cn("brand min-h-11 min-w-11 max-w-full", className)}
      href="/"
      aria-label={labels.homeLabel}
    >
      <span className="brand-logo-wrap">
        <Image
          src="/images/wtia-logo.png"
          alt={labels.logoAlt}
          width={2001}
          height={721}
          priority={priority}
          className="h-full w-full object-contain"
        />
      </span>
      <span className="brand-copy">
        <strong>{labels.publicName}</strong>
        <small>{labels.descriptor}</small>
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Write the header shell**

`components/layout/header-shell.tsx`

```tsx
"use client";

import {useEffect, useState, type ReactNode} from "react";

import {usePathname} from "@/i18n/navigation";
import {resolveHeaderVariant} from "@/lib/public-shell/hero-variant";
import {cn} from "@/lib/utils";

/** Donor app/WiseTechSite.tsx :236-241 — solid chrome once the reader is past the hero. */
const SCROLLED_THRESHOLD = 56;

type HeaderShellProps = {
  hasAnnouncement: boolean;
  children: ReactNode;
};

/**
 * The `<header>` element itself, as a client component, so `data-variant` is part of the
 * server-rendered HTML.
 *
 * app/[locale]/(public)/layout.tsx cannot resolve it: an App Router layout has no pathname,
 * and the only server-side source — a path forwarded from proxy.ts and read with `headers()` —
 * opts the whole public route group out of static and ISR rendering, which /ai-ops
 * (`revalidate = 300`) and the twelve page-copy routes depend on. Writing the attribute from an
 * effect instead is worse: `solid` is `position: sticky` and in flow while `overlay` is
 * `position: absolute` and out of it, so every load of the home page would shift its content up
 * by the header's height after hydration, against the CLS < 0.05 target in spec §6.
 *
 * `usePathname` is safe here during static rendering: it is `useContext(PathnameContext)`
 * (next/dist/client/components/navigation.js:125), the provider is rendered by AppRouter on the
 * server (app-router.js:435), and the dynamic-params bail applies only to prerender-client and
 * prerender-ppr with fallback params (server/app-render/dynamic-rendering.js:524-583).
 * components/layout/desktop-mega-navigation.tsx:30 already calls it on every static public
 * route. See errata E-13.
 */
export function HeaderShell({hasAnnouncement, children}: HeaderShellProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLLED_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, {passive: true});
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn("site-header", !hasAnnouncement && "no-announcement", scrolled && "scrolled")}
      data-variant={resolveHeaderVariant(pathname)}
    >
      {children}
    </header>
  );
}
```

- [ ] **Step 5: Rewrite the header**

`components/layout/site-header.tsx`

```tsx
import {Suspense} from "react";
import {getTranslations} from "next-intl/server";

import {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {HeaderShell} from "@/components/layout/header-shell";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {localizeNavigation, type NavigationMessageKey} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

type SiteHeaderProps = {
  locale: AppLocale;
  /** Drives the donor's `.no-announcement` modifier, which lifts the header to `top: 0`. */
  hasAnnouncement?: boolean;
};

// Donor app/WiseTechSite.tsx :382-422 — one row: brand, primary navigation, actions. hkwtia's
// second row ("Find an event") is gone; the donor carries that call to action on the
// event-first navigation trigger and in the mobile priority actions (errata E-15).
export async function SiteHeader({locale, hasAnnouncement = false}: SiteHeaderProps) {
  const t = await getTranslations({locale, namespace: "Navigation"});
  const navigation = localizeNavigation((key: NavigationMessageKey) => t(key));
  const mobileLabels = {
    open: t("openMenu"),
    close: t("closeMenu"),
    title: t("menuTitle"),
    description: t("menuDescription"),
    priority: t("mobile.priority"),
    utilities: t("mobile.utilities"),
    exploreEcosystem: t("mobile.exploreEcosystem"),
    search: t("search"),
    viewOverview: t("viewOverview"),
    english: t("english"),
    chinese: t("chinese"),
    switchToEnglish: t("switchToEnglish"),
    switchToChinese: t("switchToChinese"),
  };
  const brand = {
    homeLabel: t("homeLabel"),
    publicName: t("brand.publicName"),
    descriptor: t("brand.descriptor"),
    logoAlt: t("logoAlt"),
  };

  return (
    <HeaderShell hasAnnouncement={hasAnnouncement}>
      <div className="header-inner">
        <DualBrandLockup labels={brand} priority />
        <Suspense fallback={<div aria-hidden="true" className="desktop-nav" />}>
          <DesktopMegaNavigation
            groups={navigation.groups}
            primaryLabel={t("primaryLabel")}
            exploreLabel={t("explore")}
            viewOverviewLabel={t("viewOverview")}
          />
        </Suspense>
        <div className="header-actions">
          {/* No search surface exists yet (spec §4.4 SearchPage row); the icon opens the
              showcase, which is the only place a reader can look records up today. */}
          <Link className="search-link" href="/showcase" aria-label={t("search")}>
            <span aria-hidden="true">⌕</span>
          </Link>
          <LocaleSwitcher
            className="language-link"
            locale={locale}
            englishLabel={mobileLabels.english}
            chineseLabel={mobileLabels.chinese}
            switchToEnglishLabel={mobileLabels.switchToEnglish}
            switchToChineseLabel={mobileLabels.switchToChinese}
          />
          <Link className="signin-link" href={navigation.memberPortal.href}>
            {navigation.memberPortal.label}
          </Link>
          {/* Plain Link, not ActionLink: the donor's header button carries no arrow (errata E-16). */}
          <Link className="button button-small" href={navigation.actions.join.href}>
            {navigation.actions.join.label}
          </Link>
          <Suspense fallback={<div aria-hidden="true" className="mobile-trigger" />}>
            <MobileNavigation locale={locale} navigation={navigation} labels={mobileLabels} brand={brand} />
          </Suspense>
        </div>
      </div>
    </HeaderShell>
  );
}
```

`cn` is no longer imported here — `HeaderShell` owns the class list.

`DesktopMegaNavigation` and `MobileNavigation` do not accept these props until Tasks 4 and 5, so `tsc` stays red on those two call sites; Step 8 records it.

- [ ] **Step 6: Let the locale switcher wear the donor chrome**

In `components/layout/locale-switcher.tsx`, add `className?: string` to `LocaleSwitcherProps`, thread it through `LocaleSwitcherFallback` and `LocaleSwitcherContent` into `LocaleSwitcherButton`, and change the button's class to:

```tsx
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
```

with `import {cn} from '@/lib/utils';` added. Every utility is kept, not just the box ones: the mobile menu and the footer render this button with no donor class, and its `focus-visible` ring is the only thing giving it the visible focus indicator spec §2 item 9 requires. `twMerge` lets a caller override any of them through `className` — `language-link` adds donor type on top rather than replacing them, and `tests/unit/mobile-navigation.test.tsx` still finds the `[&_button]:min-w-11` wrapper around it.

- [ ] **Step 7: Extend the companion stylesheet**

Append to `app/styles/wisetech-shell.css`:

```css
/* The donor header is always transparent over a photo hero. `solid` renders the donor's
 * scrolled chrome at rest and stays in flow, so a page with no hero is not covered. Both
 * selectors are needed: .site-header.scrolled would otherwise switch a solid header to
 * position: fixed and pull it out of flow mid-scroll. */
.site-header[data-variant="solid"],
.site-header[data-variant="solid"].scrolled {
  position: sticky;
  top: 0;
  color: var(--wt-ink);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 1px 0 rgba(15, 76, 129, 0.14);
  backdrop-filter: blur(18px);
}

/* Tap-target floor. The donor drops these below 44px; hkwtia's accessibility floor
 * (spec §2.9) and the width sweep in tests/e2e/public-shell.spec.ts pin 44 (errata E-14). */
.search-link { width: 44px; height: 44px; }
.header-actions .button-small { min-height: 44px; }
.language-link { display: inline-flex; min-height: 44px; align-items: center; }
/* .signin-link is display:none at or below 1240px (app/styles/wisetech.css:1086) — the ported
 * collapse. An unconditional `display: inline-flex` here would come later in the cascade and
 * un-hide it, so the floor is applied only above the breakpoint. */
@media (min-width: 1241px) {
  .signin-link { display: inline-flex; min-height: 44px; align-items: center; }
}
@media (max-width: 520px) {
  .mobile-trigger { width: 44px; height: 44px; }
}
```

- [ ] **Step 8: Point the footer's lockup at the new brand key and widen the boundary scan**

`app/[locale]/(public)/layout.tsx` needs no further change: Task 2 already renders `<SiteHeader locale={appLocale} hasAnnouncement={announcement !== null} />`, and `HeaderShell` resolves the variant itself.

`components/layout/site-footer.tsx` still calls `t("brand.operator")`, which Task 1 deleted, so the footer's lockup would render `undefined` and `tsc` would keep failing. Change line 24 now, ahead of Task 6's full rewrite:

```tsx
            descriptor: t("brand.descriptor"),
```

Add the new shell file to the donor-reference scan in `tests/unit/wisetech-shell-boundary.test.ts:6-13`:

```ts
  "components/layout/header-shell.tsx",
```

- [ ] **Step 8a: Confirm the failing-then-passing pair for this task**

Run: `npx vitest run tests/unit/hero-variant.test.tsx tests/unit/wisetech-shell-boundary.test.ts`
Expected: both pass; the boundary test now scans seven files.

- [ ] **Step 9: Run the focused tests and the neighbours**

Run: `npx vitest run tests/unit/hero-variant.test.tsx tests/unit/dual-brand-lockup.test.tsx tests/unit/public-shell.test.tsx tests/unit/public-layout-announcement.test.tsx tests/unit/announcement.test.tsx tests/unit/wisetech-asset-provenance.test.ts tests/unit/locale-href-boundary.test.ts tests/unit/wisetech-shell-boundary.test.ts`
Expected: all pass, `public-shell.test.tsx` included — its footer assertions still describe the pre-Task-6 footer, which Step 8 has only relabelled, not restructured. If any footer `expect` is red here, the brand-key change in Step 8 was missed. Record the totals in the commit body.

- [ ] **Step 10: Lint and string audit**

Run: `npx eslint components/layout lib/public-shell app --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. `⌕` is symbol-only and additionally `aria-hidden`; the brand `<strong>`/`<small>` render props, not literals. `npx tsc --noEmit` stays red on the two navigation call sites until Tasks 4 and 5, and `npm run build` therefore fails at this commit.

- [ ] **Step 11: Commit**

```bash
git add components/layout/dual-brand-lockup.tsx components/layout/site-header.tsx components/layout/site-footer.tsx components/layout/header-shell.tsx components/layout/locale-switcher.tsx app/styles/wisetech-shell.css tests/unit/wisetech-shell-boundary.test.ts tests/unit/hero-variant.test.tsx tests/unit/dual-brand-lockup.test.tsx tests/unit/public-shell.test.tsx
git commit -m "feat: rebuild the public header in the donor shell grammar (WP-2)" -m "<why: one .header-inner row with the D-10 brand tile, search/language/sign-in/join actions and the mobile trigger; the <header> is a client shell so data-variant is server-rendered and an overlay route never reflows after hydration; .scrolled at 56px; RED then GREEN totals; tsc and build red on the nav call sites until the next two tasks>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Desktop mega menu with the feature aside, and the `aria-current` repro

The keyboard contract stays Radix's. A repository-wide grep for `delayDuration`, `skipDelayDuration`, `180ms` and `180 ms` returns nothing: hkwtia has never configured a hover timer, so the spec's "keep the 180 ms hover-close timer" has nothing to keep. Radix's own defaults provide hover-intent, `ArrowLeft`/`ArrowRight`/`Home`/`End` roving across triggers, `ArrowDown` entry, `Escape` return and pointer-down-outside close — all of them already pinned by `tests/e2e/public-shell.spec.ts` — and this task keeps them. That is recorded as errata E-17.

**Files:**
- Modify: `components/layout/desktop-mega-navigation.tsx`
- Create: `components/layout/mega-menu-panel.tsx`
- Modify: `components/ui/navigation-menu.tsx`
- Modify: `app/styles/wisetech-shell.css`
- Modify: `tests/unit/wisetech-shell-boundary.test.ts`
- Modify: `tests/unit/public-shell.test.tsx`
- Modify: `tests/e2e/public-shell.spec.ts`, `tests/e2e/accessibility.spec.ts`

Radix renders `NavigationMenuContent` through `Presence`, so a closed menu emits no panel markup at all — a server render of `SiteHeader` contains four triggers and nothing else, and opening one in jsdom mounts the Radix Viewport, which measures with `ResizeObserver` that `tests/setup.ts` does not polyfill. The panel therefore becomes its own presentational component, which the unit test renders directly. That is also why `public-shell.test.tsx` keeps passing today: it never opens a menu.

- [ ] **Step 1: Write the failing feature-aside assertions**

Add to `tests/unit/public-shell.test.tsx`, inside `describe("public shell server surfaces")`, and add `import {MegaMenuPanel} from "@/components/layout/mega-menu-panel";` plus `import {localizeNavigation} from "@/config/navigation";` at the top:

```tsx
  it.each([
    ["events-programmes", "See what is open before you plan.", "Browse what is open", "/events", true],
    ["membership-ecosystem", "Bring a real business need into the network.", "Submit a challenge", "/contact", false],
    ["impact-insights", "Practical progress needs responsible choices.", "AI transparency", "/ai-transparency", false],
    ["about-wtia", "Read the association's own record.", "Read the history", "/about/history", false],
  ] as const)("gives %s a heading, titled columns and a feature aside", (groupId, title, cta, href, eventFirst) => {
    const groups = localizeNavigation((key) => key).groups;
    const group = groups.find(({id}) => id === groupId)!;
    const {container} = render(
      <MegaMenuPanel
        group={{
          ...group,
          label: "Group label",
          feature: {label: "Status", title, copy: "Feature copy", cta, href},
        }}
        exploreLabel="Explore"
        viewOverviewLabel="View overview"
        pathname="/events"
        onNavigate={() => undefined}
      />,
    );

    const panel = container.querySelector(".mega-menu-v2")!;
    expect(panel.classList.contains("mega-event")).toBe(eventFirst);
    expect(within(panel as HTMLElement).getByText("Explore")).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText("Group label").tagName).toBe("STRONG");
    expect(within(panel as HTMLElement).getByRole("link", {name: "View overview"}))
      .toHaveAttribute("href", group.landingHref);

    expect(panel.querySelectorAll(".mega-column")).toHaveLength(group.columns.length);
    expect(panel.querySelectorAll(".mega-column-title")).toHaveLength(group.columns.length);

    const aside = panel.querySelector(".mega-feature-v2")!;
    expect(within(aside as HTMLElement).getByText("Status")).toHaveClass("status-label");
    expect(within(aside as HTMLElement).getByText(title).tagName).toBe("STRONG");
    expect(within(aside as HTMLElement).getByText("Feature copy")).toBeInTheDocument();
    expect(within(aside as HTMLElement).getByRole("link", {name: cta})).toHaveAttribute("href", href);
  });

  it("marks the exact current leaf inside a panel", () => {
    const group = localizeNavigation((key) => key).groups[0]!;
    const {container} = render(
      <MegaMenuPanel
        group={group}
        exploreLabel="Explore"
        viewOverviewLabel="View overview"
        pathname="/events"
        onNavigate={() => undefined}
      />,
    );
    const links = [...container.querySelectorAll(".mega-column a")];
    expect(links.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/events");
  });

  it("marks the event-first trigger and keeps the trigger hook", async () => {
    const markup = renderToStaticMarkup(await SiteHeader({locale: "en", hasAnnouncement: true}));
    expect(markup).toContain("nav-button event-first");
    expect(markup).toContain('data-navigation-trigger="events-programmes"');
    expect(markup).toContain('class="desktop-nav"');
  });
```

- [ ] **Step 2: Run it and read the failure**

Run: `npx vitest run tests/unit/public-shell.test.tsx`
Expected: FAIL — `@/components/layout/mega-menu-panel` does not resolve, and the header markup carries neither `nav-button` nor `desktop-nav`.

- [ ] **Step 3: Give the Radix wrapper the donor chrome**

Replace `components/ui/navigation-menu.tsx` with:

```tsx
"use client";

import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import * as React from "react";

import {cn} from "@/lib/utils";

const NavigationMenuItem = NavigationMenuPrimitive.Item;
const NavigationMenuLink = NavigationMenuPrimitive.Link;

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({children, value, ...props}, forwardedRef) => {
  const rootRef = React.useRef<HTMLElement | null>(null);

  /*
   * While a menu is open, @radix-ui/react-navigation-menu renders a VisuallyHidden focus
   * proxy next to the trigger with `aria-hidden` and `tabIndex={0}` (its NavigationMenuTrigger,
   * "open && <VisuallyHidden aria-hidden tabIndex={0} …>"). axe reports that as a serious
   * `aria-hidden-focus` violation, which tests/e2e/accessibility.spec.ts fails on because it
   * filters to serious and critical with no rule allowlist. Taking the proxy out of the tab
   * order keeps Radix's ArrowDown entry (onEntryKeyDown) and its Escape return intact, and
   * makes Tab move to the next trigger — which is what the donor header does anyway.
   *
   * A MutationObserver rather than a one-shot effect: the proxy is mounted and unmounted on
   * every open, and Radix mounts it after this effect has already run for the new `value`.
   * Writing tabIndex changes the attribute, which fires the observer once more; the element no
   * longer matches `[tabindex="0"]`, so it settles immediately.
   */
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const neutralise = () => {
      for (const proxy of root.querySelectorAll<HTMLElement>('[aria-hidden="true"][tabindex="0"]')) {
        proxy.tabIndex = -1;
      }
    };
    neutralise();
    const observer = new MutationObserver(neutralise);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["tabindex", "aria-hidden"],
    });
    return () => observer.disconnect();
  }, [value]);

  return (
    <NavigationMenuPrimitive.Root
      ref={(node) => {
        rootRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      value={value}
      {...props}
    >
      {children}
    </NavigationMenuPrimitive.Root>
  );
});
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({className, ...props}, ref) => (
  <NavigationMenuPrimitive.List ref={ref} className={cn("desktop-nav-list", className)} {...props} />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({className, children, ...props}, ref) => (
  <NavigationMenuPrimitive.Trigger ref={ref} className={className} {...props}>
    {children}
    {/* Donor app/WiseTechSite.tsx :109 — a text chevron, rotated by `.nav-button.active span`. */}
    <span aria-hidden="true">⌄</span>
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({className, ...props}, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn("left-0 top-0 w-full", className)}
    {...props}
  />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({className, ...props}, ref) => (
  // Neither this wrapper nor .desktop-nav is positioned, so `absolute` resolves against
  // .site-header — which is what centres the donor panel under the whole header rather than
  // under the trigger row. The panel sizes itself through .mega-menu-v2.
  <div className="absolute left-0 top-full flex w-full justify-center">
    <NavigationMenuPrimitive.Viewport ref={ref} className={cn("relative w-full", className)} {...props} />
  </div>
));
NavigationMenuViewport.displayName = NavigationMenuPrimitive.Viewport.displayName;

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
};
```

- [ ] **Step 4: Write the panel, then rewrite the mega navigation**

`components/layout/mega-menu-panel.tsx`

```tsx
"use client";

import {Arrow} from "@/components/wt/arrow";
import {StatusLabel} from "@/components/wt/status-label";
import type {LocalizedNavigationGroup} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type MegaMenuPanelProps = {
  group: LocalizedNavigationGroup;
  exploreLabel: string;
  viewOverviewLabel: string;
  /** Locale-stripped path from `usePathname`; drives the exact-match `aria-current`. */
  pathname: string;
  onNavigate: () => void;
};

// Donor app/WiseTechSite.tsx :423-444. Split out of DesktopMegaNavigation because Radix only
// mounts NavigationMenuContent while a menu is open, and opening one in jsdom pulls in the
// Viewport's ResizeObserver, which the test environment does not provide. Keeping the panel
// presentational lets tests/unit/public-shell.test.tsx render it directly for all four groups.
export function MegaMenuPanel({
  group,
  exploreLabel,
  viewOverviewLabel,
  pathname,
  onNavigate,
}: MegaMenuPanelProps) {
  return (
    <div className={cn("mega-menu-v2", group.eventFirst && "mega-event")}>
      <div className="mega-menu-main">
        <div className="mega-menu-heading">
          <div>
            <span>{exploreLabel}</span>
            <strong>{group.label}</strong>
          </div>
          <Link href={group.landingHref} onClick={onNavigate}>
            {viewOverviewLabel}
            <Arrow />
          </Link>
        </div>
        <div className="mega-columns">
          {group.columns.map((column) => (
            <div className="mega-column" key={column.id}>
              <p className="mega-column-title">{column.label}</p>
              {column.links.map((link) => (
                <Link
                  key={link.id}
                  href={link.href}
                  aria-current={pathname === link.href ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {link.label}
                  <Arrow />
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <aside className="mega-feature-v2">
        <StatusLabel>{group.feature.label}</StatusLabel>
        <strong className="mega-feature-title">{group.feature.title}</strong>
        <p>{group.feature.copy}</p>
        <Link href={group.feature.href} onClick={onNavigate}>
          {group.feature.cta}
          <Arrow />
        </Link>
      </aside>
    </div>
  );
}
```

The leaves are plain `Link`s rather than `NavigationMenuLink asChild`. Radix's `Link` only adds `data-active` and an `onSelect` convenience; the close-and-return-focus behaviour the tests pin comes from `onNavigate`, and the controlled `value` closes the menu, so nothing is lost and the panel stays renderable without a `NavigationMenu` ancestor.

`components/layout/desktop-mega-navigation.tsx`

```tsx
"use client";

import {useState} from "react";

import {MegaMenuPanel} from "@/components/layout/mega-menu-panel";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu";
import type {LocalizedNavigationGroup} from "@/config/navigation";
import {usePathname} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type DesktopMegaNavigationProps = {
  groups: readonly LocalizedNavigationGroup[];
  primaryLabel: string;
  exploreLabel: string;
  viewOverviewLabel: string;
};

/** Prefix match: `/about/history` keeps the About group marked as the current section. */
export function pathBelongsToGroup(pathname: string, group: LocalizedNavigationGroup): boolean {
  return group.columns.some((column) => column.links.some(({href}) =>
    pathname === href || pathname.startsWith(`${href}/`),
  ));
}

// Donor app/WiseTechSite.tsx :423-444 — .mega-menu-v2 is a two-part panel: the main side with
// an "Explore <group>" heading, a "View overview" link and titled columns, and a feature aside.
// Radix keeps the keyboard contract (roving arrows, ArrowDown entry, Escape return, outside
// pointer-down close); nothing here overrides its timings.
export function DesktopMegaNavigation({
  groups,
  primaryLabel,
  exploreLabel,
  viewOverviewLabel,
}: DesktopMegaNavigationProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState("");

  function closeAndReturnFocus(groupId: string) {
    setOpenGroup("");
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-navigation-trigger="${groupId}"]`)?.focus();
    });
  }

  return (
    <nav className="desktop-nav" aria-label={primaryLabel}>
      <NavigationMenu value={openGroup} onValueChange={setOpenGroup}>
        <NavigationMenuList>
          {groups.map((group) => {
            const current = pathBelongsToGroup(pathname, group);
            return (
              <NavigationMenuItem key={group.id} value={group.id}>
                <NavigationMenuTrigger
                  data-navigation-trigger={group.id}
                  data-current={current ? "true" : undefined}
                  className={cn(
                    "nav-button",
                    group.eventFirst && "event-first",
                    current && "current",
                    openGroup === group.id && "active",
                  )}
                >
                  {group.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <MegaMenuPanel
                    group={group}
                    exploreLabel={exploreLabel}
                    viewOverviewLabel={viewOverviewLabel}
                    pathname={pathname}
                    onNavigate={() => closeAndReturnFocus(group.id)}
                  />
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          })}
        </NavigationMenuList>
        <NavigationMenuViewport />
      </NavigationMenu>
    </nav>
  );
}
```

- [ ] **Step 5: Bridge the donor's `.scrolled` states to the solid variant**

Append to `app/styles/wisetech-shell.css`:

```css
/* The donor only ever has an overlay header, so it keys its ink-on-white trigger states off
 * `.scrolled`. The solid variant needs the same states at rest. */
.site-header[data-variant="solid"] .nav-button.active,
.site-header[data-variant="solid"] .nav-button:hover { background: rgba(7, 23, 32, 0.07); }
.site-header[data-variant="solid"] .nav-button.event-first { color: var(--wt-ink); background: rgba(26, 128, 182, 0.1); }

/* Radix nests <nav><ul><li> between .desktop-nav and the triggers, so the donor's own
 * `gap` on .desktop-nav never reaches them. 6px is the port's final value
 * (app/styles/wisetech.css:1030); keep the two in step if the port is regenerated. */
.desktop-nav-list { display: flex; align-items: center; gap: 6px; list-style: none; margin: 0; padding: 0; }
.desktop-nav > nav, .desktop-nav li { min-width: 0; }
```

- [ ] **Step 6: Move the desktop e2e viewports above the ported collapse**

`app/styles/wisetech.css:1085-1089` collapses the desktop navigation at `max-width: 1240px` — the donor's final, authoritative breakpoint, wider than the 1120 px rule earlier in the same file. Four existing tests use 1120 as a "desktop" width and would now find the mobile trigger instead. In `tests/e2e/public-shell.spec.ts`:

- `test("desktop navigation supports trigger traversal, open, Escape, active state, and focus return")`: `await page.setViewportSize({width: 1360, height: 900});`
- `test("locale switch preserves path, repeated query values, and fragment")`: `await page.setViewportSize({width: 1360, height: 900});`
- the `${path} marks ${group} as the active group` loop: `await page.setViewportSize({width: 1360, height: 900});`
- the width sweep's branch: change `if (width < 1024)` to `if (width <= 1240)` — the boundary is inclusive because the port's rule is `@media(max-width: 1240px)`, so 1240 itself is a mobile width — and change the else-branch comment to name the ported breakpoint.

`tests/e2e/accessibility.spec.ts:28` uses the same 1120 as a desktop width in `test("open desktop and mobile navigation surfaces pass axe")`; change it to `await page.setViewportSize({width: 1360, height: 900});` in this task too, or the test clicks a `display: none` trigger and silently asserts nothing.

Leave the width list `[320, 375, 768, 1120, 1440]` alone: 1120 now exercises the mobile branch, which is the point of the change.

Add the new panel file to the donor-reference scan in `tests/unit/wisetech-shell-boundary.test.ts:6-13`:

```ts
  "components/layout/mega-menu-panel.tsx",
```

- [ ] **Step 7: Confirm the known `aria-current` cause, then apply the scoped locator**

The cause is already on record. The WP-1 branch-tip browser run (`<scratchpad>/wp1-e2e-run.log:210-235`) shows the locator resolving 43 times to

```
<a href="/events" class="inline-flex min-h-11 min-w-11 max-w-full items-center break-words underline-offset-4 hover:text-shell-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]">Events</a>
```

— the **footer** journey link, which precedes the mega-menu link in DOM order only because `.first()` takes whichever appears first in the document and the footer link is never hidden. The component is correct; the assertion is under-scoped.

Run it once to confirm the reading still holds on this branch, and record what it printed in the commit body:

Run: `npx playwright test tests/e2e/public-shell.spec.ts -g "desktop navigation supports trigger traversal" --reporter=list`

- **Expected, and the fix:** the resolved `<a>` is outside `nav[aria-label="Primary navigation"]`. Scope both assertions to the navigation landmark:

```ts
  const eventsLink = nav.getByRole("link", {name: "Events", exact: true}).first();
  await expect(eventsLink).toBeVisible();
  await expect(eventsLink).toHaveAttribute("aria-current", "page");
```

- **If instead the resolved `<a>` is the mega-menu link and carries no `aria-current`**, the component is wrong: `usePathname()` from `@/i18n/navigation` is returning something other than `/events`. Log it once with `await page.evaluate(() => document.querySelector('.mega-column a')?.getAttribute('href'))`, then fix the comparison in `mega-menu-panel.tsx` — never by loosening the test to `toBeVisible()` alone.
- **If the locator resolves to nothing**, the panel had not mounted: add `await expect(nav.locator(".mega-menu-v2")).toBeVisible();` before the assertion rather than a bare timeout.
- **If the test passes as written**, the footer link is no longer first in DOM order for some other reason. Record that in the commit body and change nothing — do not apply the scoped locator speculatively.

- [ ] **Step 8: Run the focused unit tests and the browser shell suite**

Run: `npx vitest run tests/unit/public-shell.test.tsx tests/unit/navigation.test.ts tests/unit/navigation-feature.test.ts tests/unit/wisetech-shell-boundary.test.ts`
Expected: all pass, including the new mega-menu assertions; the footer assertions still describe the pre-Task-6 footer and stay green because Task 6 changes the footer and its expectations together.

Run: `npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts`
Expected: every test passes, including the four whose viewport moved and the axe pair whose desktop step moved with them. If the "44px/overflow sweep" now reports horizontal overflow at 1440, the mega-menu viewport wrapper is resolving against the wrong ancestor — confirm with `await page.evaluate(() => getComputedStyle(document.querySelector('nav.desktop-nav')!).position)`; it must be `static`, and if a Radix release has changed that, set `position: static` on `.desktop-nav > nav` in the companion sheet rather than clamping the panel width.

- [ ] **Step 9: Lint, typecheck, string audit**

Run: `npx eslint components --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. `⌄` is symbol-only and `aria-hidden`; `Arrow` renders `↗` inside its own `aria-hidden` span. `npx tsc --noEmit` stays red only on `MobileNavigation`'s new label props until Task 5, and `npm run build` therefore fails at this commit.

- [ ] **Step 10: Commit**

```bash
git add components/layout/desktop-mega-navigation.tsx components/layout/mega-menu-panel.tsx components/ui/navigation-menu.tsx app/styles/wisetech-shell.css tests/unit/wisetech-shell-boundary.test.ts tests/unit/public-shell.test.tsx tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts
git commit -m "feat: render the desktop mega menu in the donor .mega-menu-v2 grammar (WP-2)" -m "<why: D-3 four canonical groups with the donor presentation; feature aside from config/navigation.ts; Radix keyboard contract unchanged and no hover timer invented; desktop e2e viewports move above the ported 1240px collapse; aria-current repro reading: …>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Mobile dialog in the donor grammar, and the `aria-hidden-focus` repro

The Radix Sheet stays. It is `@radix-ui/react-dialog`, so the focus trap, `Escape` close, `aria-modal` and scroll lock the donor hand-rolls are already built in and already pinned by `tests/e2e/public-shell.spec.ts` (sixteen `Tab` presses stay inside `[role="dialog"]`). Replacing it with the donor's own listener would re-implement three tested behaviours for no fidelity gain, so this task restyles it instead. `SheetContent` and `AccordionTrigger` are used by this component only, so both can be reshaped safely.

**Files:**
- Modify: `components/layout/mobile-navigation.tsx`
- Modify: `components/ui/sheet.tsx`
- Modify: `components/ui/accordion.tsx`
- Modify: `app/styles/wisetech-shell.css`
- Modify: `tests/unit/mobile-navigation.test.tsx`

- [ ] **Step 1: Write the failing mobile assertions**

In `tests/unit/mobile-navigation.test.tsx`, extend the labels fixture, **replace** the existing first `it` (`"puts event and join actions first, then the four groups and utilities"`) with the version below, then **append** the second `it`:

```tsx
const labels = {
  open: "Open navigation",
  close: "Close navigation",
  title: "Navigation",
  description: "Explore WiseTech Hong Kong",
  priority: "Priority actions",
  utilities: "Utility navigation",
  exploreEcosystem: "Explore the ecosystem",
  search: "Search WiseTech",
  viewOverview: "View overview",
  english: "EN",
  chinese: "中文",
  switchToEnglish: "Switch to English",
  switchToChinese: "Switch to Chinese",
};
const brand = {
  homeLabel: "WiseTech Hong Kong home",
  publicName: "WiseTech Hong Kong",
  descriptor: "The evolving AI+ industry platform",
  logoAlt: "WTIA",
};
```

The dialog now renders `DualBrandLockup` in its top bar, so **every** `render(<MobileNavigation …>)` in this file — the two new tests and the four existing ones — takes `brand={brand}`, and the file needs `vi.mock("next/image", …)` alongside its existing mocks:

```tsx
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));
```

```tsx
  it("puts event and join actions first, then utilities, the eyebrow and the four groups", () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    fireEvent.click(screen.getByRole("button", {name: labels.open}));
    const dialog = screen.getByRole("dialog");

    const priority = within(dialog).getByTestId("mobile-priority-actions");
    const priorityLinks = within(priority).getAllByRole("link");
    expect(priorityLinks.map((link) => link.getAttribute("href"))).toEqual(["/events", "/join"]);
    expect(priorityLinks[0]).toHaveClass("mobile-event-action");

    const utilities = within(dialog).getByRole("navigation", {name: labels.utilities});
    expect(within(utilities).getByRole("link", {name: labels.search})).toHaveAttribute("href", "/showcase");
    expect(within(utilities).getByRole("link", {name: "actions.memberSignIn"})).toHaveAttribute("href", "/portal");
    expect(within(utilities).getByRole("button", {name: labels.switchToChinese}).parentElement).toHaveClass("[&_button]:min-w-11");

    expect(within(dialog).getByText(labels.exploreEcosystem)).toHaveClass("eyebrow");
    expect(within(dialog).getAllByRole("button", {expanded: false})).toHaveLength(4);
  });

  it("shows at most five leaves per group and closes each panel with a view-all link", () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    fireEvent.click(screen.getByRole("button", {name: labels.open}));
    fireEvent.click(screen.getByRole("button", {name: "groups.eventsProgrammes.label"}));

    const panel = document.querySelector(".mobile-accordion-panel")!;
    const links = within(panel as HTMLElement).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links.slice(0, 5).map((link) => link.getAttribute("href"))).toEqual([
      "/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct",
    ]);
    expect(links[5]).toHaveClass("mobile-view-all");
    expect(links[5]).toHaveAccessibleName(labels.viewOverview);
    expect(links[5]).toHaveAttribute("href", "/events");
  });
```

- [ ] **Step 2: Run it and read the failure**

Run: `npx vitest run tests/unit/mobile-navigation.test.tsx`
Expected: FAIL — the component rejects the new label props, there is no `mobile-event-action` class, no utilities landmark, no eyebrow, and each group still renders every leaf inside per-column `<section>`s.

- [ ] **Step 3: Let the Sheet be full-bleed and own its close button**

In `components/ui/sheet.tsx`, change the variants and make the built-in close optional:

```tsx
const sheetVariants = cva(
  'fixed z-50',
  {
    variants: {
      side: {
        right: 'inset-y-0 right-0 h-full w-[min(24rem,88vw)] gap-4 border-l bg-background p-6 shadow-xl transition-transform',
        left: 'inset-y-0 left-0 h-full w-[min(24rem,88vw)] gap-4 border-r bg-background p-6 shadow-xl transition-transform',
        // The donor mobile menu is an opaque full-screen panel that brings its own background
        // and padding through .mobile-menu; utilities here would only fight it.
        full: 'inset-0'
      }
    },
    defaultVariants: {side: 'right'}
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Omit to place the close control inside the panel yourself with `SheetClose`. */
  closeLabel?: string;
}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({side = 'right', className, children, closeLabel, ...props}, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({side}), className)} {...props}>
        {children}
        {closeLabel === undefined ? null : (
          <SheetPrimitive.Close
            className="absolute right-4 top-4 rounded-sm p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={closeLabel}
          >
            <X aria-hidden="true" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
);
```

- [ ] **Step 4: Let the accordion carry the donor's `+` / `−` marker**

In `components/ui/accordion.tsx`, add an opt-in marker to `AccordionTrigger` (the lucide chevron stays the default for any future caller):

```tsx
type AccordionTriggerProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
  /** Replaces the chevron; the donor mobile menu uses a text `+` / `−` styled by CSS. */
  marker?: React.ReactNode;
};

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({className, children, marker, ...props}, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex min-h-12 min-w-0 flex-1 items-center justify-between py-3 text-left text-base font-semibold break-words outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))] data-[current=true]:text-shell-blue",
        className,
      )}
      {...props}
    >
      {children}
      {marker ?? (
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
```

- [ ] **Step 5: Rewrite the mobile navigation**

`components/layout/mobile-navigation.tsx`

```tsx
"use client";

import {useRef, useState} from "react";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger} from "@/components/ui/sheet";
import {Arrow} from "@/components/wt/arrow";
import type {LocalizedNavigationGroup, NavigationViewModel} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

type MobileNavigationProps = {
  locale: AppLocale;
  navigation: NavigationViewModel;
  labels: {
    open: string;
    close: string;
    title: string;
    description: string;
    priority: string;
    utilities: string;
    exploreEcosystem: string;
    search: string;
    viewOverview: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
  brand: {homeLabel: string; publicName: string; descriptor: string; logoAlt: string};
};

/**
 * Donor `mobileLinksFor` (app/WiseTechSite.tsx :358-363) flattens a group's columns and slices
 * to five, where the donor's fifth entry is always its own "View All …" leaf. hkwtia's groups
 * carry no such leaf, so the slice keeps the first five and the group landing route is appended
 * as the view-all. The events group's sixth leaf (/programs/cpai) is therefore reached from the
 * desktop mega menu and the footer, not this list — recorded as errata E-19.
 */
function mobileLinksFor(group: LocalizedNavigationGroup, viewOverviewLabel: string) {
  const leaves = group.columns.flatMap((column) => column.links).slice(0, 5);
  return [
    ...leaves,
    {id: `${group.id}-overview`, href: group.landingHref, label: viewOverviewLabel},
  ];
}

// Donor app/WiseTechSite.tsx :446-469 — top bar, priority actions, utilities, the eyebrow and
// the accordions. Radix Dialog supplies the focus trap, Escape close and scroll lock the donor
// writes by hand.
export function MobileNavigation({locale, navigation, labels, brand}: MobileNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setExpandedGroup("");
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <button ref={triggerRef} type="button" className="mobile-trigger" aria-label={labels.open}>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="full" className="mobile-menu">
        {/* Radix Dialog requires a title; the donor names its dialog with aria-label instead,
            so the heading is visually hidden and still supplies the accessible name. */}
        <SheetTitle className="sr-only">{labels.title}</SheetTitle>
        <SheetDescription className="sr-only">{labels.description}</SheetDescription>

        <div className="mobile-menu-top">
          <DualBrandLockup labels={brand} />
          <SheetClose asChild>
            <button type="button" aria-label={labels.close}>
              <span aria-hidden="true">×</span>
            </button>
          </SheetClose>
        </div>

        <nav className="mobile-priority-actions" aria-label={labels.priority} data-testid="mobile-priority-actions">
          <SheetClose asChild>
            <Link className="mobile-event-action" href={navigation.actions.findEvent.href}>
              {navigation.actions.findEvent.label}
              <Arrow />
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={navigation.actions.join.href}>
              {navigation.actions.join.label}
              <Arrow />
            </Link>
          </SheetClose>
        </nav>

        <nav className="mobile-utilities" aria-label={labels.utilities}>
          <SheetClose asChild>
            <Link href="/showcase">{labels.search}</Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={navigation.memberPortal.href}>{navigation.memberPortal.label}</Link>
          </SheetClose>
          {/* Not a SheetClose: switching locale is a router.replace, not a Link navigation, so
              the dialog has to be closed by hand. Removing this wrapper silently breaks
              close-after-locale-switch, which tests/unit/mobile-navigation.test.tsx pins. */}
          <div className="[&_button]:min-w-11" onClick={() => handleOpenChange(false)}>
            <LocaleSwitcher
              locale={locale}
              englishLabel={labels.english}
              chineseLabel={labels.chinese}
              switchToEnglishLabel={labels.switchToEnglish}
              switchToChineseLabel={labels.switchToChinese}
            />
          </div>
        </nav>

        <p className="eyebrow">{labels.exploreEcosystem}</p>

        <div className="mobile-accordions">
          <Accordion type="single" collapsible value={expandedGroup} onValueChange={setExpandedGroup}>
            {navigation.groups.map((group) => {
              const current = group.columns.some((column) => column.links.some(({href}) =>
                pathname === href || pathname.startsWith(`${href}/`),
              ));
              const links = mobileLinksFor(group, labels.viewOverview);
              return (
                <AccordionItem
                  key={group.id}
                  value={group.id}
                  className={cn("mobile-accordion", group.eventFirst && "event-first")}
                >
                  <AccordionTrigger
                    data-current={current ? "true" : undefined}
                    marker={<span aria-hidden="true">{expandedGroup === group.id ? "−" : "+"}</span>}
                  >
                    {group.label}
                  </AccordionTrigger>
                  <AccordionContent className="mobile-accordion-panel">
                    {links.map((link, index) => (
                      <SheetClose asChild key={link.id}>
                        <Link
                          className={index === links.length - 1 ? "mobile-view-all" : undefined}
                          href={link.href}
                          aria-current={pathname === link.href ? "page" : undefined}
                        >
                          {link.label}
                          <Arrow />
                        </Link>
                      </SheetClose>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

`SiteHeader` already passes `brand={brand}` (Task 3 Step 5), so no header edit is needed here.

- [ ] **Step 6: Style the pieces the donor does not have**

Append to `app/styles/wisetech-shell.css`:

```css
/* hkwtia switches locale with router.replace, so the donor's utility <a> is a <button> here. */
.mobile-utilities button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  font-weight: 750;
}

/* Radix Accordion wraps the trigger in a header element, so the donor's own
 * `.mobile-accordion > button` rules (app/styles/wisetech.css:321-322 and :1079-1080) never
 * reach it. These restate them one level deeper; keep the two in step if the port is
 * regenerated. */
.mobile-accordion > h3 { display: flex; margin: 0; }
.mobile-accordion > h3 > button {
  flex: 1 1 auto;
  min-height: 62px;
  border: 0;
  background: transparent;
  color: white;
  font-family: var(--font-serif);
  font-size: clamp(20px, 4.8vw, 24px);
  padding: 10px 2px;
  text-align: left;
}
.mobile-accordion.event-first > h3 > button { color: #8fc4e0; }
.mobile-accordion > h3 > button span {
  color: #8fc4e0;
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 400;
}
```

Verify the accordion header's element name before committing these rules:

Run: `npx vitest run tests/unit/mobile-navigation.test.tsx -t "puts event and join actions first"` then, if the layout is wrong in the browser, `npm run test:e2e -- tests/e2e/public-shell.spec.ts -g "shell fits 375px"` and read the screenshot. Radix Accordion's `Header` renders an `<h3>` by default; if a Radix release changes it, change the selectors above to the element the DOM actually shows — do not add a `!important`.

- [ ] **Step 7: Confirm the known axe finding is gone**

The cause is already on record. The WP-1 branch-tip run (`<scratchpad>/wp1-e2e-run.log:93-140`) reports exactly one `aria-hidden-focus` violation, impact `serious`, one node:

```
<span aria-hidden="true" tabindex="0" style="position: absolute; border: 0px; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; overflow-wrap: normal;"></span>
```

at target `li:nth-child(1) > span:nth-child(2)` — `@radix-ui/react-navigation-menu`'s open-state focus proxy, rendered as a sibling of the trigger inside the first `NavigationMenuItem`. Task 4 Step 3's `MutationObserver` in `components/ui/navigation-menu.tsx` is the fix; Task 4 also moved this spec's desktop viewport above the 1240 px collapse.

Run: `npx playwright test tests/e2e/accessibility.spec.ts -g "open desktop and mobile navigation surfaces pass axe" --reporter=list`

- **Expected:** it passes. Record that in the commit body and change nothing further.
- **If it still reports `aria-hidden-focus` on that same span**, the observer is not reaching it: check that `rootRef` is attached (`NavigationMenu`'s composed ref) and that the observer's `subtree` option is set, rather than widening the query to `document`.
- **If the node is inside `[role="dialog"]`**, it belongs to the Sheet. Print its `target` and fix that element: an `aria-hidden` wrapper of ours gets the attribute removed, and a Radix artefact gets the same `tabIndex = -1` treatment in `components/ui/sheet.tsx`.
- **If the violation id is anything else** (for example `color-contrast` on `.mobile-utilities` text), fix the contrast in `app/styles/wisetech-shell.css` and record the pair of colours in the commit body; never add a `disableRules` entry — the spec runs axe with no allowlist by design (spec §2.9).

- [ ] **Step 8: Run the focused tests and the suites around them**

Run: `npx vitest run tests/unit/mobile-navigation.test.tsx tests/unit/public-shell.test.tsx tests/unit/dual-brand-lockup.test.tsx tests/unit/wisetech-shell-boundary.test.ts tests/unit/locale-href-boundary.test.ts`
Expected: mobile navigation passes all four of its original tests plus the new one; `public-shell.test.tsx` is still red only on the footer.

Run: `npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts`
Expected: both green. The mobile Sheet test's sixteen `Tab` presses must still land inside `[role="dialog"]`; if the count now overruns the panel, the dialog gained or lost focusable controls — adjust the loop bound only if the trap itself still holds, and record the new count.

- [ ] **Step 9: Lint, typecheck, string audit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components app --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. This is the first task where `tsc` is clean again — every header call site now matches.

- [ ] **Step 10: Commit**

```bash
git add components/layout/mobile-navigation.tsx components/ui/sheet.tsx components/ui/accordion.tsx app/styles/wisetech-shell.css tests/unit/mobile-navigation.test.tsx
git commit -m "feat: rebuild the mobile navigation in the donor .mobile-menu grammar (WP-2)" -m "<why: top bar, priority actions, utilities, eyebrow and accordions over the Radix Sheet so the focus trap and scroll lock stay built-in; close-after-locale-switch wrapper preserved; axe aria-hidden-focus reading: …>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Footer in the donor grammar, with `siteConfig.contact` and the prepared-email block

**Files:**
- Modify: `config/site.ts`
- Modify: `messages/en.json`, `messages/zh-HK.json` (`Footer.addressLines` replaces `Footer.address`)
- Modify: `components/layout/site-footer.tsx`
- Create: `components/layout/footer-newsletter.tsx`
- Modify: `app/styles/wisetech-shell.css`
- Modify: `tests/unit/wisetech-shell-boundary.test.ts`
- Test: `tests/unit/site-footer.test.tsx`, `tests/unit/public-shell.test.tsx`

**Phone number — decided, not deferred.** The donor prints `+852 2989 9164` in its footer and hkwtia's current footer repeats it as a literal. It was not confirmable against hkwtia.org on 2026-09-02: the site answers with a bot challenge, which must not be bypassed, and neither message bundle carries a phone number — only the address. `siteConfig.contact.phone` is therefore typed optional and left **unset**, the footer renders no `tel:` line while it is unset, and the owner supplies the number in `config/site.ts` when they confirm it. Recorded as errata E-20; checklist row 3.16 (WP-3) inherits the open question.

- [ ] **Step 1: Write the failing footer test**

`tests/unit/site-footer.test.tsx`

```tsx
import {render, screen, within, fireEvent} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", async () => {
  const {readFileSync} = await import("node:fs");
  const {resolve} = await import("node:path");
  const bundles = {
    en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
    "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
  } as const;
  const read = (locale: "en" | "zh-HK", namespace: string, key: string) =>
    key.split(".").reduce<unknown>(
      (current, segment) => (current as Record<string, unknown>)[segment],
      (bundles[locale] as Record<string, unknown>)[namespace],
    );
  return {
    getTranslations: async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
      Object.assign(
        (key: string, values?: Record<string, string | number>) =>
          Object.entries(values ?? {}).reduce(
            (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
            String(read(locale, namespace, key)),
          ),
        {raw: (key: string) => read(locale, namespace, key)},
      ),
  };
});
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {siteConfig} from "@/config/site";

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({...window.location, assign} as unknown as Location);
});
afterEach(() => vi.restoreAllMocks());

describe("SiteFooter", () => {
  it("renders four donor columns, the address and the bottom row", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");

    const columns = footer.querySelectorAll(".footer-links > div");
    expect(columns).toHaveLength(4);
    expect([...columns].map((column) => column.querySelector("strong")?.textContent)).toEqual([
      "Explore", "Membership", "About", "Contact",
    ]);

    const address = footer.querySelector("address")!;
    for (const line of siteConfig.contact.addressLines) expect(address.textContent).toContain(line);
    expect(within(footer).getByRole("link", {name: siteConfig.contact.email}))
      .toHaveAttribute("href", `mailto:${siteConfig.contact.email}`);
    expect(footer.querySelector('a[href^="tel:"]')).toBeNull();
    expect(siteConfig.contact.phone).toBeUndefined();

    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", {name: "Privacy statement"})).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("button", {name: "Switch to Chinese"})).toBeInTheDocument();
    expect(within(footer).queryByRole("link", {name: /terms|accessibility/i})).toBeNull();
    expect(footer.querySelector(".footer-bottom small")?.textContent)
      .toContain(`© ${new Date().getFullYear()} WiseTech Hong Kong.`);
  });

  it("prepares an email instead of subscribing, and reports both outcomes", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    const input = within(footer).getByLabelText("Work email");

    fireEvent.change(input, {target: {value: "not-an-email"}});
    fireEvent.click(within(footer).getByRole("button", {name: "Prepare activity-update email"}));
    expect(within(footer).getByRole("alert")).toHaveTextContent("Enter a valid work email.");
    expect(assign).not.toHaveBeenCalled();

    fireEvent.change(input, {target: {value: "reader@example.com"}});
    fireEvent.click(within(footer).getByRole("button", {name: "Prepare activity-update email"}));
    expect(within(footer).getByRole("status")).toHaveTextContent("This page does not create a subscription automatically.");
    expect(assign).toHaveBeenCalledTimes(1);
    const target = assign.mock.calls[0]![0] as string;
    expect(target.startsWith(`mailto:${siteConfig.contact.email}?`)).toBe(true);
    expect(decodeURIComponent(target)).toContain("reader@example.com");
    expect(within(footer).queryByRole("alert")).toBeNull();
  });

  it("keeps the Chinese footer bilingual", async () => {
    render(await SiteFooter({locale: "zh-HK"}));
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("探索")).toBeInTheDocument();
    expect(footer.querySelector("address")!.textContent).toContain("KOHO");
    expect(within(footer).getByText("Technology + Wisdom. Hong Kong + The World.")).toBeInTheDocument();
  });
});
```

In `tests/unit/public-shell.test.tsx`, drop the phone entry from the 44 px target set so the assertion matches the shipped footer:

```tsx
      "mailto:contact@hkwtia.org",
```

(remove the `"tel:+85229899164",` line; the surrounding `toHaveLength(targetHrefs.size)` assertion then expects 18 targets).

- [ ] **Step 2: Run them and read the failure**

Run: `npx vitest run tests/unit/site-footer.test.tsx tests/unit/public-shell.test.tsx`
Expected: FAIL — no `.footer-links` columns, no `<address>` from config, no newsletter block, and `siteConfig.contact` does not exist.

- [ ] **Step 3: Add `siteConfig.contact`**

`config/site.ts`

```ts
/**
 * One record for the details the footer, the contact page and (from WP-3) the Organization
 * structured data all print. `phone` is optional and currently unset: the donor prints
 * "+852 2989 9164", but on 2026-09-02 hkwtia.org could not be read to confirm it — the site
 * answers with a bot challenge, which is not something to work around — and no message bundle
 * carries a number. An unverifiable number is omitted rather than repeated; set it here once
 * the association confirms it and the footer renders the tel: line on its own.
 */
type SiteContact = Readonly<{
  email: string;
  phone?: string;
  addressLines: readonly string[];
}>;

export const siteContact: SiteContact = {
  email: 'contact@hkwtia.org',
  addressLines: ['4/F, KOHO', '73-75 Hung To Road', 'Kwun Tong, Hong Kong']
};

export const siteConfig = {
  name: 'Hong Kong Wireless Technology Industry Association',
  shortName: 'WTIA',
  defaultDescription:
    'Connecting Hong Kong\'s wireless technology community through collaboration, innovation and industry development.',
  defaultImage: '/images/wtia-logo.png',
  contact: siteContact
} as const;
```

- [ ] **Step 4: Replace `Footer.address` with `Footer.addressLines` in both bundles**

The donor renders the address as three `<br/>`-separated lines, English in both languages. hkwtia already holds a proper Chinese address, so the lines become an array per locale rather than a config constant — `siteConfig.contact.addressLines` stays as the canonical English record for structured data, and the test above pins the footer against it.

| Key | EN | ZH |
|---|---|---|
| `Footer.addressLines` | `["4/F, KOHO", "73-75 Hung To Road", "Kwun Tong, Hong Kong"]` | `["香港觀塘鴻圖道 73-75 號", "KOHO 4 樓"]` |

Delete four now-orphaned keys from both bundles in the same edit; `site-footer.tsx` was the only reader of each:

- `Footer.address` — replaced by `Footer.addressLines`.
- `Footer.journeys` — the old `<nav aria-label>` and `sr-only` heading; the donor footer has no navigation landmark, only four titled columns.
- `Footer.connect` and `Footer.legal` — the old two-block bottom row, replaced by `Footer.columns.contact` and the tagline row.

`Footer.copyright` is **kept** and still rendered, as the `<small>` in `.footer-bottom` above.

- [ ] **Step 5: Write the newsletter island**

`components/layout/footer-newsletter.tsx`

```tsx
"use client";

import {useState, type FormEvent} from "react";

import {Eyebrow} from "@/components/wt/eyebrow";
import {siteConfig} from "@/config/site";

export type FooterNewsletterLabels = Readonly<{
  eyebrow: string;
  title: string;
  emailLabel: string;
  placeholder: string;
  submit: string;
  success: string;
  error: string;
  mailSubject: string;
  /** Carries a literal `{email}` placeholder; interpolated here, not by next-intl. */
  mailBody: string;
}>;

/**
 * D-6: there is no persisted subscriber model and adding one is a separate product decision,
 * so this prepares an email and hands over to the reader's mail client exactly as the donor
 * does (app/WiseTechSite.tsx :512-517). `noValidate` is deliberate — the block owns its own
 * validation message so the browser bubble cannot replace the `role="alert"` text.
 */
export function FooterNewsletter({labels}: {labels: FooterNewsletterLabels}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "error" | "success">("idle");

  function subscribe(event: FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) {
      setState("error");
      return;
    }
    setState("success");
    const subject = encodeURIComponent(labels.mailSubject);
    const body = encodeURIComponent(labels.mailBody.replace("{email}", email));
    window.location.assign(`mailto:${siteConfig.contact.email}?subject=${subject}&body=${body}`);
  }

  return (
    <div className="footer-newsletter">
      <Eyebrow light>{labels.eyebrow}</Eyebrow>
      <h2>{labels.title}</h2>
      {state === "success" ? (
        <div className="newsletter-success" role="status">
          <span aria-hidden="true">↗</span>
          <p>{labels.success}</p>
        </div>
      ) : (
        <form noValidate onSubmit={subscribe}>
          <label className="sr-only" htmlFor="footer-newsletter-email">{labels.emailLabel}</label>
          <input
            id="footer-newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            maxLength={320}
            value={email}
            placeholder={labels.placeholder}
            aria-invalid={state === "error"}
            onChange={(event) => {
              setEmail(event.target.value);
              setState("idle");
            }}
          />
          <button type="submit" aria-label={labels.submit}>
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
      {state === "error" ? (
        <p className="newsletter-error" role="alert">{labels.error}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Rewrite the footer**

`components/layout/site-footer.tsx`

```tsx
import {getTranslations} from "next-intl/server";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {FooterNewsletter} from "@/components/layout/footer-newsletter";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {
  localizeNavigation,
  type LocalizedNavigationGroup,
  type LocalizedNavigationLink,
  type NavigationGroupId,
  type NavigationMessageKey,
} from "@/config/navigation";
import {siteConfig} from "@/config/site";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

// hkwtia's own 44px tap-target floor (spec §2.9); the donor's .footer-links a sets type only.
const footerTargetClassName = "inline-flex min-h-11 min-w-11 max-w-full items-center break-words";

export async function SiteFooter({locale}: {locale: AppLocale}) {
  const [navigationT, t] = await Promise.all([
    getTranslations({locale, namespace: "Navigation"}),
    getTranslations({locale, namespace: "Footer"}),
  ]);
  const navigation = localizeNavigation((key: NavigationMessageKey) => navigationT(key));
  const groups = Object.fromEntries(navigation.groups.map((group) => [group.id, group])) as
    Record<NavigationGroupId, LocalizedNavigationGroup>;
  const leaves = (id: NavigationGroupId): readonly LocalizedNavigationLink[] =>
    groups[id].columns.flatMap((column) => column.links);
  const addressLines = t.raw("addressLines") as readonly string[];

  // Donor .footer-links (app/WiseTechSite.tsx :1030) is four columns. The donor's own columns
  // are Explore / Connect / Membership / Contact, but its Connect column is entirely donor-only
  // routes (member directory, solutions, partners, GBA, partner-with-us) that D-3 merges into
  // /showcase, so hkwtia's fourth grouping is About instead (errata E-21). Every one of the 16
  // navigation leaves appears exactly once.
  const columns = [
    {id: "explore", label: t("columns.explore"), links: leaves("events-programmes")},
    {
      id: "membership",
      label: t("columns.membership"),
      links: [
        ...leaves("membership-ecosystem"),
        {id: "join", href: navigation.actions.join.href, label: navigation.actions.join.label},
        {id: "member-sign-in", href: navigation.memberPortal.href, label: navigation.memberPortal.label},
      ],
    },
    {
      id: "about",
      label: t("columns.about"),
      links: [
        ...leaves("about-wtia").filter((link) => link.href !== "/contact"),
        ...leaves("impact-insights"),
      ],
    },
  ];

  const contactLink = leaves("about-wtia").find((link) => link.href === "/contact")!;

  return (
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-brand">
          <DualBrandLockup labels={{
            homeLabel: t("brand.homeLabel"),
            publicName: t("brand.publicName"),
            descriptor: t("brand.descriptor"),
            logoAlt: t("brand.logoAlt"),
          }} />
          <p>{t("summary")}</p>
          <small>{t("legalLine")}</small>
        </div>
        <FooterNewsletter labels={{
          eyebrow: t("newsletter.eyebrow"),
          title: t("newsletter.title"),
          emailLabel: t("newsletter.emailLabel"),
          placeholder: t("newsletter.placeholder"),
          submit: t("newsletter.submit"),
          success: t("newsletter.success"),
          error: t("newsletter.error"),
          mailSubject: t("newsletter.mailSubject"),
          mailBody: t.raw("newsletter.mailBody") as string,
        }} />
      </div>

      <div className="shell footer-links">
        {columns.map((column) => (
          <div key={column.id}>
            <strong>{column.label}</strong>
            {column.links.map((link) => (
              <Link className={footerTargetClassName} key={link.id} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
        <div>
          <strong>{t("columns.contact")}</strong>
          <Link className={footerTargetClassName} href={contactLink.href}>{contactLink.label}</Link>
          <a className={footerTargetClassName} href={`mailto:${siteConfig.contact.email}`}>
            {siteConfig.contact.email}
          </a>
          {siteConfig.contact.phone === undefined ? null : (
            <a className={footerTargetClassName} href={`tel:${siteConfig.contact.phone.replace(/\s/g, "")}`}>
              {siteConfig.contact.phone}
            </a>
          )}
          <address>
            {addressLines.map((line, index) => (
              <span key={line}>
                {line}
                {index === addressLines.length - 1 ? null : <br />}
              </span>
            ))}
          </address>
        </div>
      </div>

      <div className="shell footer-bottom">
        <strong>{t("tagline")}</strong>
        <div>
          <Link className={footerTargetClassName} href="/privacy">{t("privacy")}</Link>
          {/* Terms and Accessibility are `retire` in the manifest until WP-7 reviews copy for
              them; the donor's bottom row links both. The donor carries no copyright line at
              all — hkwtia keeps one, because a legal notice is worth more than that much
              fidelity (errata E-22). */}
          <small>{t("copyright", {year: new Date().getFullYear()})}</small>
          <LocaleSwitcher
            locale={locale}
            englishLabel={navigationT("english")}
            chineseLabel={navigationT("chinese")}
            switchToEnglishLabel={navigationT("switchToEnglish")}
            switchToChineseLabel={navigationT("switchToChinese")}
          />
        </div>
      </div>
    </footer>
  );
}
```

The donor's own footer language link drops the reader back to the site root rather than the translated page; hkwtia keeps `LocaleSwitcher`, which preserves the path, query and fragment (errata E-22).

- [ ] **Step 7: Style the pieces the donor does not have**

Append to `app/styles/wisetech-shell.css`:

```css
/* The donor footer language control is an <a>; hkwtia's is the shared LocaleSwitcher button.
 * The <small> alongside it is hkwtia's copyright line, which the donor's bottom row omits. */
.footer-bottom button, .footer-bottom small { color: rgba(255, 255, 255, 0.5); font-size: 9px; }

/* .footer-links a is a type rule only; the 44px floor comes from hkwtia's own utilities, and
 * this keeps the column stack from collapsing them onto one line. */
.footer-links > div > a { align-self: flex-start; }
```

Add the new footer file to the donor-reference scan in `tests/unit/wisetech-shell-boundary.test.ts:6-13`:

```ts
  "components/layout/footer-newsletter.tsx",
```

- [ ] **Step 8: Run the focused tests and the neighbours**

Run: `npx vitest run tests/unit/site-footer.test.tsx tests/unit/public-shell.test.tsx tests/unit/messages.test.ts tests/unit/dual-brand-lockup.test.tsx tests/unit/wisetech-shell-boundary.test.ts tests/unit/public-landmark-contract.test.ts`
Expected: all pass. `public-shell.test.tsx` was green before this task and must stay green: the 17 route hrefs and the `mailto:` are still in the new footer, and the only expectation this task changed is the removal of `tel:` from `targetHrefs`. If `vi.spyOn(window, "location", "get")` throws in this jsdom version, replace the `beforeEach` body with `Object.defineProperty(window, "location", {configurable: true, value: {...window.location, assign}});` and restore it in `afterEach`; do not change the component to make it testable.

- [ ] **Step 9: Lint, typecheck, string audit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components config app --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. `contact@hkwtia.org` is email-shaped, so the audit accepts it as a JSX text node; `↗` is symbol-only and `aria-hidden`.

- [ ] **Step 10: Commit**

```bash
git add config/site.ts components/layout/site-footer.tsx components/layout/footer-newsletter.tsx app/styles/wisetech-shell.css messages/en.json messages/zh-HK.json tests/unit/wisetech-shell-boundary.test.ts tests/unit/site-footer.test.tsx tests/unit/public-shell.test.tsx
git commit -m "feat: rebuild the footer in the donor .site-footer grammar (WP-2)" -m "<why: four columns covering every navigation leaf, address from siteConfig.contact, D-6 prepared mailto with role=status/role=alert, no Terms or Accessibility until WP-7; the donor-printed phone was not verifiable so siteConfig.contact.phone stays unset and no tel: line renders>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Concierge launcher, prompt labels and the transparency link

`tests/unit/concierge-widget.test.tsx` and `tests/e2e/concierge.spec.ts` must pass **unchanged**, so this task adds only optional props (the existing test's `ConciergeLabels` literal must keep type-checking, which rules out extending `conciergeLabelKeys`) and puts its own coverage in a new file. Nothing in the streaming, Turnstile, escalation, feedback or focus-return logic moves.

**Scope decision, recorded as errata E-18.** The donor panel is a popover anchored inside `.concierge` (`position: absolute; right: 0; bottom: 66px`), and hkwtia's is a Radix modal portalled to `<body>` whose geometry `tests/e2e/concierge.spec.ts` pins at 1280×900 and 375×812. Putting `.concierge-panel` on `Dialog.Content` would move it to the bottom-right of the document, and its ink background would need the transcript, the composer, both inputs and the feedback control restyled for dark — a change to far more than chrome. WP-2 therefore ships the launcher in the donor grammar and adds the prompt list and transparency link in hkwtia's own panel chrome; the ink panel is revisited in WP-6 when the app-shell chrome is decided.

**Files:**
- Modify: `components/ai/concierge-widget.tsx`
- Modify: `app/[locale]/(public)/layout.tsx`
- Test: `tests/unit/concierge-shell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

`tests/unit/concierge-shell.test.tsx`

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {ConciergeWidget} from "@/components/ai/concierge-widget";
import {localizeConcierge} from "@/lib/ai/concierge-labels";
import {localizeConciergePrompts} from "@/lib/ai/concierge-prompts";

const bundle = JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")) as {
  Concierge: Record<string, unknown> & {prompts: Record<string, unknown>};
};
const labels = localizeConcierge((key) => String(bundle.Concierge[key]));
const prompts = localizeConciergePrompts((key) => bundle.Concierge.prompts[key.split(".")[1]!]);

afterEach(() => vi.unstubAllGlobals());

describe("Concierge shell", () => {
  it("wears the donor trigger with the W+ badge and the WiseTech label", () => {
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    const launcher = screen.getByRole("button", {name: "Ask WiseTech"});
    expect(launcher).toHaveClass("concierge-trigger", "touch-manipulation");
    expect(within(launcher).getByText("W+")).toHaveAttribute("aria-hidden", "true");
  });

  it("offers the section's prompts, fills the composer and never sends by itself", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    window.history.replaceState(null, "", "/");
    render(<ConciergeWidget locale="en" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));

    const first = screen.getByRole("button", {name: "How can WiseTech help my organisation?"});
    expect(screen.getByRole("button", {name: "Show the AI+ industry pathways"})).toBeInTheDocument();
    fireEvent.click(first);

    const composer = screen.getByRole("textbox", {name: labels.messageLabel});
    expect(composer).toHaveValue("How can WiseTech help my organisation?");
    expect(composer).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("picks the prompt set from the current section, locale prefix included", () => {
    window.history.replaceState(null, "", "/zh/events");
    render(<ConciergeWidget locale="zh-HK" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.getByRole("button", {name: "Which event is relevant to retail?"})).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });

  it("links the transparency page with a locale-correct href and hides it when unlabelled", () => {
    window.history.replaceState(null, "", "/");
    const view = render(<ConciergeWidget locale="zh-HK" labels={labels} prompts={prompts} transparencyLabel={String(bundle.Concierge.transparency)} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.getByRole("link", {name: String(bundle.Concierge.transparency)}))
      .toHaveAttribute("href", "/zh/ai-transparency");
    view.unmount();

    render(<ConciergeWidget locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: "Ask WiseTech"}));
    expect(screen.queryByRole("link", {name: String(bundle.Concierge.transparency)})).toBeNull();
    expect(screen.queryByRole("button", {name: "How can WiseTech help my organisation?"})).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and read the failure**

Run: `npx vitest run tests/unit/concierge-shell.test.tsx`
Expected: FAIL — `ConciergeWidget` rejects `prompts` and `transparencyLabel`, the launcher has no `concierge-trigger` class or `W+` badge, and no prompt buttons or transparency link exist.

- [ ] **Step 3: Extend the widget's props and the launcher**

In `components/ai/concierge-widget.tsx`, drop `MessageCircle` from the `lucide-react` import and add:

```tsx
import {useState, useEffect} from "react"; // already imported; no new import needed
import {
  type ConciergePromptSection,
  type ConciergePrompts,
  resolveConciergePromptSection,
} from "@/lib/ai/concierge-prompts";
import {Arrow} from "@/components/wt/arrow";
import {localizedPath} from "@/lib/urls";
```

Extend `Props`:

```tsx
type Props = Readonly<{
  locale: "en" | "zh-HK";
  labels: ConciergeLabels;
  /** Absent when Turnstile is not configured; the challenge is then skipped. */
  turnstileSiteKey?: string;
  /**
   * Optional so the label contract (`ConciergeLabels`) stays a closed 31-key tuple and the
   * widget's own suite keeps compiling. Absent means no prompt list and no transparency link.
   */
  prompts?: ConciergePrompts;
  transparencyLabel?: string;
}>;
```

Add the section state next to the widget's other `useState` calls:

```tsx
  // The donor keys its prompt set on path[0]. Read from window.location, not a router hook:
  // the widget renders inside both the public and the portal layouts and its suite mounts it
  // with no router context. Presentation only — nothing here reaches the action.
  const [promptSection, setPromptSection] = useState<ConciergePromptSection>("home");
  useEffect(() => {
    setPromptSection(resolveConciergePromptSection(window.location.pathname));
  }, []);
  const sectionPrompts = prompts?.[promptSection] ?? [];
```

Replace the launcher's children and class list:

```tsx
        <button
          type="button"
          aria-label={labels.launcher}
          aria-controls={dialogId}
          aria-expanded={open}
          className="concierge-trigger fixed touch-manipulation bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg motion-safe:transition-[opacity,transform] motion-safe:duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-90"
        >
          {/* Both class families on purpose: `.concierge-trigger` and its `span` rule style this
              inside the public route group, where the port is loaded, and the Tailwind
              utilities keep it looking right in the portal, where it is not (errata E-11). The
              label must stay a bare text node — `.concierge-trigger span` turns any span into
              the 38px badge. */}
          <span
            aria-hidden="true"
            className="inline-grid size-9 shrink-0 place-items-center rounded-full bg-white font-serif text-[15px] font-bold text-primary"
          >
            W+
          </span>
          {labels.launcher}
        </button>
```

- [ ] **Step 4: Add the prompt list and the transparency link to the panel**

Replace the transcript's empty-state `<li>` with:

```tsx
              {messages.length === 0 && !disabledState ? (
                <li className="text-sm leading-6 text-muted-foreground">
                  {labels.empty}
                  {sectionPrompts.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {sectionPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="flex min-h-11 touch-manipulation items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                          onClick={() => {
                            // Fills the composer instead of sending: `submit` is the only path
                            // that runs the contact-email and Turnstile gates, and WP-2 changes
                            // no runtime behaviour (errata E-23).
                            setDraft(prompt);
                            textareaRef.current?.focus();
                          }}
                        >
                          {prompt}
                          <Arrow />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ) : null}
```

Add the transparency link between the transcript `</ol>` and the `aria-live="assertive"` error region:

```tsx
            {transparencyLabel === undefined ? null : (
              <p className="px-4 pb-2 text-xs leading-5 text-muted-foreground">
                <a
                  className="inline-flex min-h-11 touch-manipulation items-center gap-1 underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  href={localizedPath(locale, "/ai-transparency")}
                >
                  {transparencyLabel}
                  <Arrow />
                </a>
              </p>
            )}
```

`localizedPath` rather than `Link`: it is a pure function, so the widget still mounts with no router context (`tests/unit/concierge-widget.test.tsx` provides none), and `tests/unit/locale-href-boundary.test.ts` names it as the sanctioned way to build a locale-correct href from a raw string.

- [ ] **Step 5: Feed the prompts from the public layout**

In `app/[locale]/(public)/layout.tsx`:

```tsx
import {localizeConciergePrompts} from '@/lib/ai/concierge-prompts';
```

```tsx
  const conciergeLabels = localizeConcierge((key) => concierge.raw(key));
  const conciergePrompts = localizeConciergePrompts((key) => concierge.raw(key));
```

```tsx
      <ConciergeWidget
        locale={appLocale}
        labels={conciergeLabels}
        prompts={conciergePrompts}
        transparencyLabel={concierge('transparency')}
        {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
      />
```

`app/[locale]/(member)/portal/layout.tsx` is left alone: the donor prompt copy is public-journey copy, and the portal does not load the ported stylesheet.

- [ ] **Step 6: Run the concierge suites — the old one must be untouched**

Run: `npx vitest run tests/unit/concierge-shell.test.tsx tests/unit/concierge-widget.test.tsx tests/unit/concierge-layouts.test.ts tests/unit/contact-concierge-launcher.test.tsx`
Expected: all pass, with `concierge-widget.test.tsx` reporting its original 13 tests. Confirm the file is untouched: `git diff --exit-code tests/unit/concierge-widget.test.tsx` must exit 0.

Run: `npm run test:e2e -- tests/e2e/concierge.spec.ts`
Expected: the four viewport × locale tests pass (the member test skips without M2 credentials). The spec reads `Concierge.launcher` and `Concierge.title` live from the bundles, so the renamed launcher copy needs no test edit — but the dialog is still named by `Concierge.title`, which this task does not change.

- [ ] **Step 7: Lint, typecheck, string audit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint components app lib --ext .ts,.tsx && npm run audit:strings`
Expected: exit 0 each. `W+` contains a letter, so it passes the audit only because of its `aria-hidden="true"` span — if the audit fails here, the attribute was dropped, not the allowlist.

- [ ] **Step 8: Commit**

```bash
git add components/ai/concierge-widget.tsx "app/[locale]/(public)/layout.tsx" tests/unit/concierge-shell.test.tsx
git commit -m "feat: restyle the Concierge launcher and add per-section prompts (WP-2)" -m "<why: donor .concierge-trigger with the W+ badge and Ask WiseTech; prompts fill the composer so every send still goes through the existing gated action; transparency link to /ai-transparency; ink panel deferred because the donor popover geometry conflicts with the pinned Radix modal; concierge-widget.test.tsx and concierge.spec.ts unchanged and green>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Scrolled-header assertion, axe, visual baselines and the full gate

**Files:**
- Modify: `tests/e2e/public-shell.spec.ts`
- Regenerate: `tests/e2e/__screenshots__/wisetech-visual-baseline/*.png`

- [ ] **Step 1: Write the failing scrolled-header test**

Append to `tests/e2e/public-shell.spec.ts`:

```ts
test("the header floats over the hero, then goes solid past 56px", async ({page}) => {
  await page.setViewportSize({width: 1360, height: 900});
  await page.goto("/");
  const header = page.locator("header.site-header");

  // Playwright manages a dev server with no database, so getActive rejects and the layout
  // renders no announcement: the header carries the donor's `.no-announcement` modifier and
  // sits at top: 0. An announcement is covered by tests/unit/announcement.test.tsx instead.
  await expect(header).toHaveClass(/no-announcement/);
  await expect(header).toHaveAttribute("data-variant", "overlay");
  await expect(header).not.toHaveClass(/scrolled/);

  await page.mouse.wheel(0, 400);
  await expect(header).toHaveClass(/scrolled/);

  await page.mouse.wheel(0, -400);
  await expect(header).not.toHaveClass(/scrolled/);

  await page.goto("/events");
  await expect(page.locator("header.site-header")).toHaveAttribute("data-variant", "solid");
});
```

- [ ] **Step 2: Run it and read the failure**

Run: `npm run test:e2e -- tests/e2e/public-shell.spec.ts -g "floats over the hero"`
Expected: PASS if Tasks 3 to 5 landed correctly. If `data-variant` is still `solid` on `/`, `HeaderShell` resolved the wrong path — read what `usePathname()` returns there with `await page.evaluate(() => location.pathname)` and check `heroVariantByRoute` rather than special-casing the test. If `.scrolled` never appears, `window.scrollY` stayed at 0 because the page is shorter than the viewport, in which case scroll a taller route (`/news`) and say so in the commit body rather than lowering the threshold.

- [ ] **Step 3: Run the whole browser shell and accessibility set**

Run: `npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/concierge.spec.ts tests/e2e/public-route-matrix.spec.ts`
Expected: all pass. Treat any axe finding as a defect in the shell, not in the test: fix the contrast or the attribute in `app/styles/wisetech-shell.css` or the component, and never add a rule allowlist (spec §2.9).

- [ ] **Step 4: Look at the drift before accepting it**

Run: `npm run test:e2e -- tests/e2e/wisetech-visual-baseline.spec.ts`
Expected: FAIL on most of the 72 comparisons — every route carries the new header, footer and Concierge pill. Open one desktop and one mobile diff under `test-results/` and confirm the differences are the intended shell: the ink announcement seam absent (no database), the one-row header, the four-column dark footer, the `W+` pill. Stop and report BLOCKED with the diff path if any page shows overlapping text, a header covering body copy on a non-overlay route, or a horizontal scrollbar.

- [ ] **Step 5: Capture and prove the new baselines**

Run: `npx playwright test tests/e2e/wisetech-visual-baseline.spec.ts --update-snapshots=changed`
Expected: 72 passed, only the changed PNGs rewritten.

Run: `npm run test:e2e -- tests/e2e/wisetech-visual-baseline.spec.ts`
Expected: 72 passed with no diffs; `git status --short tests/e2e/__screenshots__` lists only modified files, no additions.

The baseline spec's `revealLazyContent` helper scrolls the page and returns to the top before capturing, which now toggles `.scrolled` on the way down and off again on the way back. `toHaveScreenshot`'s stability retry absorbs the transition, so this is not a source of drift — but an implementer who sees a one-off header difference in a single shot should **re-run the spec** before regenerating anything.

The harness captures 1440 / 1120 / 820 / 390 (`tests/e2e/wisetech-visual-baseline.spec.ts:56-60`). The spec's WP-2 exit line names 1440 / 1120 / 820 / 520; 390 sits inside the donor's ≤520 band and is the width WP-0 committed, so the baselines are not re-cut to 520 (errata E-26). 1120 now renders the mobile trigger, which is exactly the ported 1240 px collapse under test.

- [ ] **Step 6: Full local gate**

Run, in order:

```
npm run audit:strings
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
```

Expected: exit 0 each; record the vitest file and test totals. If `npm test` reports a timeout in one of the four known slow files, re-run that file alone (`npx vitest run <file>`) and record both results — a pass alone is the environment, a fail alone is a defect.

`npm run build` must still list the twelve page-copy public routes as statically rendered and `/ai-ops` as ISR; if any of them flipped to dynamic, a `headers()` or `cookies()` call reached the public layout — find and remove it rather than accepting the flip (errata E-13).

- [ ] **Step 7: Commit the baselines**

```bash
git add tests/e2e/public-shell.spec.ts tests/e2e/__screenshots__
git commit -m "test: assert the scrolled header and refresh the shell visual baselines (WP-2)" -m "<capture and plain-run summary lines; what changed visually per breakpoint>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Errata, checklist and pull request

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (Appendix D)
- Modify: `docs/integration/wisetech-design-fidelity-checklist.md` rows 2.1 to 2.10

- [ ] **Step 1: Append errata rows E-13 to E-29 to Appendix D**

Add one row per deviation, in the appendix's existing five-column shape (`#`, spec location, spec says, verified state, action for later WPs):

| # | Spec location | Spec says | Verified state | Action for later WPs |
|---|---|---|---|---|
| E-13 | WP-2, §8 risk row | The public layout passes `variant` from a pathname map | An App Router layout has no pathname, and the only server-side source — a path forwarded from `proxy.ts` and read with `headers()` — opts the whole `(public)` group out of static and ISR rendering, which `/ai-ops` (`revalidate = 300`) and twelve page-copy routes depend on. Applying the variant from an effect is worse than that: `solid` is `position: sticky` and in flow while `overlay` is `position: absolute` and out of it, so every load of `/` would shift its content up by the header's height after hydration, against §6's CLS < 0.05. The `<header>` is therefore a client component, `components/layout/header-shell.tsx`, which resolves `data-variant` through `lib/public-shell/hero-variant.ts` **during the server render** and owns the `.scrolled` listener. `usePathname` is safe in a statically rendered route: it is `useContext(PathnameContext)` (`next/dist/client/components/navigation.js:125`), the provider is rendered by AppRouter on the server (`app-router.js:435`), and the dynamic-params bail applies only to prerender-client and prerender-ppr with fallback params (`server/app-render/dynamic-rendering.js:524-583`) — `components/layout/desktop-mega-navigation.tsx:30` already calls it on every static public route | Extend `heroVariantByRoute` as WP-3 and WP-4 give pages their donor heroes. Do not introduce `headers()` in the public layout, and do not move the variant back into an effect |
| E-14 | §2.9, WP-2 | Port the donor shell verbatim | The donor drops below hkwtia's 44 px tap floor at its smallest breakpoints: `.mobile-trigger` 42 px (≤520), `.search-link` 38 px, `.button-small` 42 px | `app/styles/wisetech-shell.css` restores 44 px on all three. Keep the floor over donor fidelity in every later WP |
| E-15 | WP-2 header bullet | Header actions: search, language, Member sign in, Join WiseTech, mobile trigger | hkwtia's second header row and its "Find an event" button are removed to match the donor's single `.header-inner`. The call to action survives on the event-first navigation trigger and in `.mobile-priority-actions` | `tests/unit/public-shell.test.tsx` asserts "Join WiseTech" in the header instead |
| E-16 | Errata E-11 | Use `ActionLink` for donor-styled links | The donor's header Join button carries no arrow, while `ActionLink` always appends one. The header uses a plain `Link` with `className="button button-small"` | One-off; every other donor-styled link keeps `ActionLink` |
| E-17 | WP-2 mega-menu bullet | Keep the 180 ms hover-close timer | No timer exists to keep: a repository-wide grep for `delayDuration`, `skipDelayDuration`, `180ms` and `180 ms` returns nothing, and every hover, roving-arrow, `ArrowDown`, `Escape` and outside-pointer behaviour is a Radix default already pinned by `tests/e2e/public-shell.spec.ts` | Do not add a timer; if hover intent ever needs tuning, change `delayDuration` on the Radix root and extend the e2e |
| E-18 | WP-2 Concierge bullet | Restyle the panel header, prompt list, answer and transparency-link classes | The donor panel is a popover anchored inside `.concierge` (`position: absolute; bottom: 66px`); hkwtia's is a Radix modal portalled to `<body>` whose geometry `tests/e2e/concierge.spec.ts` pins at 1280×900 and 375×812. `.concierge-panel` would move it to the document's bottom-right, and its ink background would need the transcript, composer, inputs and feedback control restyled for dark. WP-2 ships the `.concierge-trigger` launcher, the prompt list and the transparency link in hkwtia's own panel chrome | WP-6 decides the panel skin with the app-shell chrome |
| E-19 | WP-2 mobile bullet | First five links per group, last styled `.mobile-view-all` | hkwtia's groups carry no "View All" leaf, so the five leaves are followed by the group landing route as the view-all. The events group has six leaves, so `/programs/cpai` is reached from the desktop mega menu and the footer rather than the mobile accordion | Revisit if the mobile menu gains a per-group overflow |
| E-20 | §4.4 Footer row, WP-3 `config/site.ts` | `phone: "+852 2989 9164"` — verify against hkwtia.org before the PR | Not verifiable on 2026-09-02: hkwtia.org answers with a bot challenge, which must not be bypassed, and neither message bundle carries a phone number. `siteConfig.contact.phone` is optional and unset; the footer renders no `tel:` line | **Owner action:** confirm the number and set `siteConfig.contact.phone`. WP-3's structured data must treat `telephone` as optional |
| E-21 | Appendix B `Footer.columns` | `columns.{explore,connect,membership,contact}` | Three of the donor's five Connect links do have canonical destinations (`members`/`solutions` → `/showcase`, `gba` → `/launchpad`, `partner-with-us` → `/contact`), so the column is not donor-only. It is unusable for a different reason: reusing it would either duplicate `/contact` across two columns, breaking the every-leaf-appears-once property that `tests/unit/public-shell.test.tsx:88` pins through its exact target count, or leave hkwtia's five About leaves (`/about`, `/about/history`, `/about/chairman`, `/about/committees`, plus the evidence pages) with no column at all. The keys are therefore `Footer.columns.{explore,membership,about,contact}`, and all 16 navigation leaves appear exactly once | WP-7 may reintroduce a Connect column when `/partners` is un-retired and the showcase/launchpad links have somewhere of their own to live |
| E-22 | §5 WP-2 footer bullet | `footer-bottom` = tagline + Privacy + language link | Two differences. The donor's footer language link drops the reader at the site root; hkwtia keeps the shared `LocaleSwitcher`, which preserves path, query and fragment and is pinned by `tests/e2e/public-shell.spec.ts`. And the donor's bottom row carries no copyright at all, while hkwtia's `Footer.copyright` is a real legal notice — it is kept as a `<small>` in the same row, and only the three keys the rewrite genuinely orphans (`Footer.journeys`, `Footer.connect`, `Footer.legal`) are deleted alongside `Footer.address` | Keep both |
| E-23 | WP-2 Concierge bullet | Prompts "sent through the existing action" | The donor sends immediately. hkwtia's `submit` is the only path that runs the contact-email and Turnstile gates, so a prompt fills the composer and focuses it; the send still goes through the existing action | Revisit only with a test that proves both gates still run |
| E-24 | WP-1 errata E-11, WP-2 | The port is the only donor stylesheet | `scripts/port-wisetech-css.mjs` reproduces `app/styles/wisetech.css` byte for byte, so shell rules hkwtia needs and the donor lacks live in a new hand-written `app/styles/wisetech-shell.css`, imported from the public layout immediately after the port | Add shell overrides there, never to the generated file; `npm run port:wisetech && git diff --exit-code app/styles/wisetech.css` stays the drift check |
| E-25 | §4.2 breakpoints | Breakpoints 1320 / 1120 / 820 / 520 | The donor's final pass collapses the desktop navigation at `max-width: 1240px` (`app/styles/wisetech.css:1085-1089`), later and wider than its own 1120 px rule, so 1240 governs. Four e2e tests that used 1120 as a desktop width moved to 1360, and the width sweep's branch moved from 1024 to 1240 | Use 1360 for any new desktop-navigation browser test |
| E-26 | WP-2 exit line, Appendix B | Baselines at 1440 / 1120 / 820 / 520; `Navigation.brand.operator`, `Footer.address` | The WP-0 harness captures 1440 / 1120 / 820 / 390, and 390 is inside the donor's ≤520 band. D-10 replaces `brand.operator` with `brand.descriptor` in both namespaces; `Footer.address` becomes the bilingual array `Footer.addressLines`; one `Navigation.search` string covers the donor's two ("Search WiseTech" as both the icon's label and the mobile link's text); `Navigation.logoAlt` keeps hkwtia's "WTIA" rather than the donor's sentence-long alt | Later WPs read `Footer.addressLines` and `siteConfig.contact.addressLines`, never `Footer.address` |
| E-27 | WP-2 mega-menu bullet | Feature copy from the donor's closest group | The donor's `events-activities` feature title is "No activities are currently open." — its own honest empty state for a site with no event data. Printed as static navigation copy over hkwtia's real `events` table it would be a fabricated claim (§0.3), so the events feature copy is authored; the membership, insights and about features reuse the donor's text where it is true without data | Keep feature copy free of counts, dates and availability claims (D-8) |
| E-28 | Appendix B `Concierge` | `prompts.{home,membership,showcase,events}.{0,1}` | The keys ship as JSON arrays rather than objects with `"0"` and `"1"` members. `tests/unit/messages.test.ts:19` treats an array as a single leaf, so parity still holds, and `:10` skips arrays when collecting ICU entries, so the pairs are never handed to `createTranslator`. `next-intl`'s `t.raw` returns the array unchanged, which is what `localizeConciergePrompts` validates | Read prompt pairs through `t.raw`, never `t`; keep each pair at exactly two entries so the panel's layout is predictable |
| E-29 | §4.4 SearchPage row | Header search icon links to `/showcase` "with focus on `q`" | There is no fragment to target: `components/marketing/showcase-filters.tsx:13` renders the search input with `name="q"` and no `id`, so `/showcase#q` would resolve to nothing and the port's `[id] { scroll-margin-top }` rule would have no anchor. WP-2 links to `/showcase` plain | WP-4 owns `showcase-filters.tsx`; give the input an `id` and add the fragment there, in the same commit as the test that proves focus lands on it |

- [ ] **Step 2: Flip checklist rows 2.1 to 2.10**

Set each row to `ported` in the commit that earns it and to `verified` with the PR link once the PR exists (the WP-0 and WP-1 pattern). Row-by-row evidence:

| Row | Evidence to record |
|---|---|
| 2.1 | `tests/unit/announcement.test.tsx`, `tests/unit/public-layout-announcement.test.tsx`; no announcement in browser runs (empty `DATABASE_URL`) |
| 2.2 | `tests/unit/public-shell.test.tsx`, `tests/unit/hero-variant.test.tsx`, `public-shell.spec.ts` scrolled test; note errata E-13, E-15 |
| 2.3 | `tests/unit/public-shell.test.tsx` feature assertions, `navigation.test.ts`, `navigation-feature.test.ts`, `public-shell.spec.ts`; note errata E-17 |
| 2.4 | `tests/unit/mobile-navigation.test.tsx`, `public-shell.spec.ts`; note errata E-19 |
| 2.5 | `tests/unit/dual-brand-lockup.test.tsx`, `wisetech-asset-provenance.test.ts` |
| 2.6 | `tests/unit/site-footer.test.tsx`; note errata E-20 (phone unset), E-21 (About column) |
| 2.7 | `tests/unit/concierge-shell.test.tsx` plus `concierge-widget.test.tsx` / `concierge.spec.ts` unchanged and green; note errata E-18, E-23 |
| 2.8 | `public-shell.test.tsx` and `hero-variant.test.tsx` variant assertions; note errata E-13, and that `div.site-root` was delivered in WP-1 (`app/[locale]/(public)/layout.tsx:44`) — WP-2 adds only the header variant, the companion stylesheet import and the Concierge props |
| 2.9 | `messages.test.ts`, `navigation-feature.test.ts`, `concierge-prompts.test.ts`, `npm run audit:strings`; note errata E-26 and E-28 |
| 2.10 | `wisetech-shell-boundary.test.ts`, `accessibility.spec.ts`, refreshed baselines; note errata E-25, E-26 |

- [ ] **Step 3: Commit the documentation**

```bash
git add docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md docs/integration/wisetech-design-fidelity-checklist.md
git commit -m "docs: record the WP-2 errata and checklist status" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push and open the pull request**

Write the body to the session scratchpad, not the repository — helper files stay out of git:

```bash
SCRATCH="C:/Users/laich/AppData/Local/Temp/claude/C--Users-laich-Documents-hkwtia/9846a2a1-661b-48fc-88f4-af3f5fd61eaa/scratchpad"
git push -u origin feat/wt-wp2-shell
gh pr create --base main --title "WP-2: WiseTech public shell fidelity" --body-file "$SCRATCH/wp2-pr-body.md"
```

The PR body follows `docs/integration/wisetech-delivery-gates.md`: every command with its exit code and totals, the RED and GREEN line per task, the two runtime readings (what the `aria-current` locator actually resolved to, and the axe node that raised `aria-hidden-focus`), the errata rows added, and the decisions for the owner. Include the open question explicitly:

> **Owner decision — Concierge panel skin (errata E-18).** WP-2 ships the donor launcher, prompts and transparency link; the donor's ink popover panel is not adopted because it conflicts with the pinned Radix modal geometry. Confirm that WP-6 owns the panel chrome, or ask for it now with a budget for restyling the transcript and composer for dark.

> **Owner action — telephone (errata E-20).** `siteConfig.contact.phone` is unset because the donor's `+852 2989 9164` could not be confirmed against hkwtia.org on 2026-09-02. Supply the number and the footer renders the `tel:` line with no further change.

> **Owner decision — footer column set (errata E-21).** The four columns shipped are Explore / Membership / About / Contact, so all sixteen navigation leaves appear exactly once. The donor's own set is Explore / Connect / Membership / Contact; matching it would mean a Connect column of `/showcase` and `/launchpad` with the five About leaves folded into Explore, which makes Explore eleven links long and hides the association's own pages under a programmes heading. Say if you prefer the donor's set and it becomes a one-file change in `site-footer.tsx` plus one message key.

Note in the PR that the base is `feat/wt-wp1-tokens` (PR #34) and that this branch must be rebased on `origin/main` once #34 merges, per the spec's §8 risk row on production drift.

---

## Self-check before hand-off

- [ ] Every bullet of the spec's WP-2 section maps to a task: announcement (2), header + variant (3), mega menu + feature data (1, 4), mobile dialog (5), brand lockup (3), footer + newsletter (6), Concierge (7), layout wiring (2, 3, 7), messages (1, 6, 7). The spec's `div.site-root` wrapper is **not** WP-2 work — WP-1 already delivered it (`app/[locale]/(public)/layout.tsx:44`, with the `zh-Hant-HK` lang); WP-2 only adds `hasAnnouncement`, the companion stylesheet import and the Concierge props.
- [ ] Every Appendix B key for `Navigation`, `Footer` and `Concierge` is added with EN and ZH values in Task 1 or Task 6, and every deviation from those key names is in errata E-21 or E-26.
- [ ] `npm run audit:strings` is run in every task that adds JSX text.
- [ ] `tests/unit/concierge-widget.test.tsx` and `tests/e2e/concierge.spec.ts` are never edited; `git diff --exit-code` on the first is a step in Task 7.
- [ ] `app/styles/wisetech.css` is never edited; `npm run port:wisetech && git diff --exit-code app/styles/wisetech.css` proves it.
- [ ] `git status --short` shows no `AGENTS.md`, `next-env.d.ts` or `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap` staged in any commit.








