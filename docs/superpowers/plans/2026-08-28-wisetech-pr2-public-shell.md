# WiseTech PR2 Public Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved bilingual, event-first WiseTech Hong Kong public shell as a stacked PR2 without changing data, authentication, protected layouts, APIs, or production state.

**Architecture:** `config/navigation.ts` is the single typed source for four public journey groups and three shell actions. Async server components translate that model and compose the shell; focused Radix client components own desktop disclosure, mobile dialog/accordion state, announcement dismissal, and active-route presentation. PR1's public-route and integration manifests remain the routing authority, with the corrected donor repository represented only through pinned provenance and one hashed own-origin logo.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8, next-intl 4, Tailwind CSS 3, Radix Navigation Menu/Dialog/Accordion, Vitest 3, Testing Library 16, Playwright 1.61, axe-core.

## Global Constraints

- Base every PR2 commit on PR1 commit `bf5dbd9b8d5fb6ff141b7caef7772a7f34454646`; keep PR2 stacked on `codex/wisetech-hkwtia-integration` until PR1 merges.
- Render the four groups in exactly this order: Events & Programmes; Membership & Ecosystem; Impact & Insights; About WTIA.
- Use only retained canonical routes from `config/public-routes.ts` and `config/wisetech-integration-manifest.ts`; never expose source-only, merged, redirected, or retired paths.
- Keep `app/[locale]/(public)/layout.tsx` as the sole owner of skip link, optional announcement, header, exactly one `main#main-content`, footer, and Concierge, in that order.
- Preserve English and Traditional Chinese copy, current path, query, and fragment during locale switches.
- Keep every pointer target at least 44 by 44 CSS pixels and prevent horizontal page overflow at 320 CSS pixels.
- Use the existing Inter and Playfair Display font variables with `PingFang TC`, `Noto Sans TC`, `Microsoft JhengHei`, and system fallbacks; add no remote runtime font request.
- Pin donor repository `https://github.com/YNWAforever/wisetech` at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, and logo SHA-256 `4ABAB36F7D09F36F6D54165E9A8F4C719CAD5CAA7B6CBBCD5F2819F6180DEC51`.
- Preserve the discrepancy with missing original commit `d2d82c01099490a8c2768c942186735667bbc881` and archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`; do not claim byte-for-byte continuity.
- Add no schema, database, CMS provider, authentication, payments, admin, portal, API route, migration, seed, deployment, or production change.
- Do not copy the donor runtime, its five-group navigation, hard-coded announcement, mock newsletter, hero/archive imagery, member/partner claims, or source-only routes.

---

## File map

- `config/navigation.ts`: typed public group/action policy plus pure localization adapter.
- `config/wisetech-integration-manifest.ts`: corrected donor and logo provenance while retaining original-archive discrepancy.
- `lib/public-shell/announcement.ts`: pure announcement validation and injected-clock activation.
- `components/layout/announcement-bar.tsx`: client-local, session-only dismissal view.
- `components/layout/dual-brand-lockup.tsx`: WiseTech public identity plus WTIA legal-operator lockup.
- `components/ui/navigation-menu.tsx`: thin styled Radix Navigation Menu primitives.
- `components/ui/accordion.tsx`: thin styled Radix Accordion primitives.
- `components/layout/desktop-mega-navigation.tsx`: desktop open state, route state, and real localized anchors.
- `components/layout/mobile-navigation.tsx`: Sheet, priority actions, accordion state, route close, and focus return.
- `components/layout/site-header.tsx`: async translation boundary, brand, navigation, locale, and global actions.
- `components/layout/site-footer.tsx`: async translation boundary and journey links derived from the shared model.
- `app/[locale]/(public)/layout.tsx`: sole public composition root and null PR2 announcement provider.
- `components/layout/locale-switcher.tsx`: path/query/fragment-preserving locale transition.
- `messages/en.json`, `messages/zh-HK.json`: complete shell, action, announcement, and footer copy.
- `app/globals.css`, `tailwind.config.ts`: additive semantic shell aliases and reduced-motion/Chinese font behavior.
- Focused unit, contract, source-boundary, browser, responsive, and accessibility tests under `tests/`.

---

### Task 1: Typed four-group navigation authority

**Files:**
- Modify: `tests/unit/navigation.test.ts`
- Modify: `config/navigation.ts`

**Interfaces:**
- Consumes: `PublicRoute`, `publicRoutes`, `wisetechIntegrationManifest`.
- Produces: `navigationGroups`, `publicShellActions`, `memberPortalAction`, `localizeNavigation`, `NavigationViewModel`, `LocalizedNavigationGroup`, and `NavigationGroupId`.

- [ ] **Step 1: Replace the flat-navigation test with the failing policy contract**

```ts
import {describe, expect, it} from "vitest";

import {
  localizeNavigation,
  memberPortalAction,
  navigationGroups,
  publicShellActions,
} from "@/config/navigation";
import {publicRoutes} from "@/config/public-routes";
import {wisetechIntegrationManifest} from "@/config/wisetech-integration-manifest";

const groupShape = navigationGroups.map((group) => ({
  id: group.id,
  landingHref: group.landingHref,
  eventFirst: group.eventFirst,
  links: group.columns.flatMap((column) => column.links.map(({href}) => href)),
}));

describe("public shell navigation", () => {
  it("uses the approved group order, landing routes, and unique leaf ownership", () => {
    expect(groupShape).toEqual([
      {
        id: "events-programmes",
        landingHref: "/events",
        eventFirst: true,
        links: [
          "/events", "/launchpad", "/programs/hkict", "/programs/asa",
          "/programs/tct", "/programs/cpai",
        ],
      },
      {
        id: "membership-ecosystem",
        landingHref: "/membership",
        eventFirst: false,
        links: ["/membership", "/showcase"],
      },
      {
        id: "impact-insights",
        landingHref: "/news",
        eventFirst: false,
        links: ["/news", "/ai-ops", "/ai-transparency"],
      },
      {
        id: "about-wtia",
        landingHref: "/about",
        eventFirst: false,
        links: [
          "/about", "/about/history", "/about/chairman",
          "/about/committees", "/contact",
        ],
      },
    ]);

    const leaves = groupShape.flatMap(({links}) => links);
    expect(new Set(leaves).size).toBe(leaves.length);
  });

  it("keeps every public destination canonical and retained", () => {
    const retained = new Set(
      wisetechIntegrationManifest
        .filter(({kind, disposition}) => kind === "route" && disposition === "retain")
        .map(({canonicalPath}) => canonicalPath),
    );
    const destinations = [
      ...groupShape.flatMap(({links}) => links),
      publicShellActions.findEvent.href,
      publicShellActions.join.href,
    ];

    for (const href of destinations) {
      expect(publicRoutes, href).toContain(href);
      expect(retained.has(href), href).toBe(true);
    }
  });

  it("keeps global actions separate and the protected utility explicit", () => {
    expect(publicShellActions).toEqual({
      findEvent: {
        id: "find-event",
        href: "/events",
        labelKey: "actions.findEvent",
        priority: "primary",
      },
      join: {
        id: "join-wisetech",
        href: "/join",
        labelKey: "actions.join",
        priority: "secondary",
      },
    });
    expect(memberPortalAction).toEqual({
      id: "member-sign-in",
      href: "/portal",
      labelKey: "actions.memberSignIn",
    });
    expect(publicRoutes).not.toContain("/portal" as never);
    expect(
      wisetechIntegrationManifest.find(({id}) => id === "route-portal"),
    ).toEqual(expect.objectContaining({canonicalPath: "/portal", disposition: "retain"}));
  });

  it("localizes one serializable model without adding visible strings to config", () => {
    const view = localizeNavigation((key) => `translated:${key}`);

    expect(view.groups[0]?.label).toBe("translated:groups.eventsProgrammes.label");
    expect(view.groups[0]?.columns[1]?.links[0]?.label).toBe("translated:links.hkict");
    expect(view.actions.findEvent.label).toBe("translated:actions.findEvent");
    expect(view.memberPortal.label).toBe("translated:actions.memberSignIn");
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});
```

- [ ] **Step 2: Run the test and prove the old flat model fails**

Run: `npm.cmd test -- tests/unit/navigation.test.ts`

Expected: FAIL because the current module exports only `navigationItems` and has no approved grouped/action model.

- [ ] **Step 3: Replace `config/navigation.ts` with the typed shared model**

```ts
import type {PublicRoute} from "@/config/public-routes";

export type NavigationGroupId =
  | "events-programmes"
  | "membership-ecosystem"
  | "impact-insights"
  | "about-wtia";

export type NavigationMessageKey =
  | "groups.eventsProgrammes.label"
  | "groups.eventsProgrammes.description"
  | "groups.membershipEcosystem.label"
  | "groups.membershipEcosystem.description"
  | "groups.impactInsights.label"
  | "groups.impactInsights.description"
  | "groups.aboutWtia.label"
  | "groups.aboutWtia.description"
  | "columns.participate"
  | "columns.programmes"
  | "columns.membership"
  | "columns.insights"
  | "columns.organisation"
  | "columns.connect"
  | "links.events"
  | "links.launchpad"
  | "links.hkict"
  | "links.asa"
  | "links.tct"
  | "links.cpai"
  | "links.membership"
  | "links.showcase"
  | "links.news"
  | "links.aiOps"
  | "links.aiTransparency"
  | "links.about"
  | "links.history"
  | "links.chairman"
  | "links.committees"
  | "links.contact"
  | "actions.findEvent"
  | "actions.join"
  | "actions.memberSignIn";

export type NavigationLink = Readonly<{
  id: string;
  href: PublicRoute;
  labelKey: NavigationMessageKey;
}>;

export type NavigationColumn = Readonly<{
  id: string;
  labelKey: NavigationMessageKey;
  links: readonly NavigationLink[];
}>;

export type NavigationGroup = Readonly<{
  id: NavigationGroupId;
  landingHref: PublicRoute;
  eventFirst: boolean;
  labelKey: NavigationMessageKey;
  descriptionKey: NavigationMessageKey;
  columns: readonly NavigationColumn[];
}>;

export type LocalizedNavigationLink = Readonly<{
  id: string;
  href: PublicRoute;
  label: string;
}>;

export type LocalizedNavigationGroup = Readonly<{
  id: NavigationGroupId;
  landingHref: PublicRoute;
  eventFirst: boolean;
  label: string;
  description: string;
  columns: readonly Readonly<{
    id: string;
    label: string;
    links: readonly LocalizedNavigationLink[];
  }>[];
}>;

type PublicShellAction = Readonly<{
  id: "find-event" | "join-wisetech";
  href: PublicRoute;
  labelKey: NavigationMessageKey;
  priority: "primary" | "secondary";
}>;

export const navigationGroups = [
  {
    id: "events-programmes",
    landingHref: "/events",
    eventFirst: true,
    labelKey: "groups.eventsProgrammes.label",
    descriptionKey: "groups.eventsProgrammes.description",
    columns: [
      {
        id: "participate",
        labelKey: "columns.participate",
        links: [
          {id: "events", href: "/events", labelKey: "links.events"},
          {id: "launchpad", href: "/launchpad", labelKey: "links.launchpad"},
        ],
      },
      {
        id: "programmes",
        labelKey: "columns.programmes",
        links: [
          {id: "hkict", href: "/programs/hkict", labelKey: "links.hkict"},
          {id: "asa", href: "/programs/asa", labelKey: "links.asa"},
          {id: "tct", href: "/programs/tct", labelKey: "links.tct"},
          {id: "cpai", href: "/programs/cpai", labelKey: "links.cpai"},
        ],
      },
    ],
  },
  {
    id: "membership-ecosystem",
    landingHref: "/membership",
    eventFirst: false,
    labelKey: "groups.membershipEcosystem.label",
    descriptionKey: "groups.membershipEcosystem.description",
    columns: [{
      id: "membership",
      labelKey: "columns.membership",
      links: [
        {id: "membership", href: "/membership", labelKey: "links.membership"},
        {id: "showcase", href: "/showcase", labelKey: "links.showcase"},
      ],
    }],
  },
  {
    id: "impact-insights",
    landingHref: "/news",
    eventFirst: false,
    labelKey: "groups.impactInsights.label",
    descriptionKey: "groups.impactInsights.description",
    columns: [{
      id: "insights",
      labelKey: "columns.insights",
      links: [
        {id: "news", href: "/news", labelKey: "links.news"},
        {id: "ai-ops", href: "/ai-ops", labelKey: "links.aiOps"},
        {id: "ai-transparency", href: "/ai-transparency", labelKey: "links.aiTransparency"},
      ],
    }],
  },
  {
    id: "about-wtia",
    landingHref: "/about",
    eventFirst: false,
    labelKey: "groups.aboutWtia.label",
    descriptionKey: "groups.aboutWtia.description",
    columns: [
      {
        id: "organisation",
        labelKey: "columns.organisation",
        links: [
          {id: "about", href: "/about", labelKey: "links.about"},
          {id: "history", href: "/about/history", labelKey: "links.history"},
          {id: "chairman", href: "/about/chairman", labelKey: "links.chairman"},
          {id: "committees", href: "/about/committees", labelKey: "links.committees"},
        ],
      },
      {
        id: "connect",
        labelKey: "columns.connect",
        links: [{id: "contact", href: "/contact", labelKey: "links.contact"}],
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];

export const publicShellActions = Object.freeze({
  findEvent: Object.freeze({
    id: "find-event",
    href: "/events",
    labelKey: "actions.findEvent",
    priority: "primary",
  } satisfies PublicShellAction),
  join: Object.freeze({
    id: "join-wisetech",
    href: "/join",
    labelKey: "actions.join",
    priority: "secondary",
  } satisfies PublicShellAction),
});

export const memberPortalAction = Object.freeze({
  id: "member-sign-in",
  href: "/portal" as const,
  labelKey: "actions.memberSignIn" as const,
});

export type NavigationViewModel = Readonly<{
  groups: readonly LocalizedNavigationGroup[];
  actions: Readonly<{
    findEvent: Readonly<Omit<(typeof publicShellActions)["findEvent"], "labelKey"> & {label: string}>;
    join: Readonly<Omit<(typeof publicShellActions)["join"], "labelKey"> & {label: string}>;
  }>;
  memberPortal: Readonly<Omit<typeof memberPortalAction, "labelKey"> & {label: string}>;
}>;

export function localizeNavigation(
  translate: (key: NavigationMessageKey) => string,
): NavigationViewModel {
  return {
    groups: navigationGroups.map((group) => ({
      id: group.id,
      landingHref: group.landingHref,
      eventFirst: group.eventFirst,
      label: translate(group.labelKey),
      description: translate(group.descriptionKey),
      columns: group.columns.map((column) => ({
        id: column.id,
        label: translate(column.labelKey),
        links: column.links.map((link) => ({
          id: link.id,
          href: link.href,
          label: translate(link.labelKey),
        })),
      })),
    })),
    actions: {
      findEvent: {
        id: publicShellActions.findEvent.id,
        href: publicShellActions.findEvent.href,
        priority: publicShellActions.findEvent.priority,
        label: translate(publicShellActions.findEvent.labelKey),
      },
      join: {
        id: publicShellActions.join.id,
        href: publicShellActions.join.href,
        priority: publicShellActions.join.priority,
        label: translate(publicShellActions.join.labelKey),
      },
    },
    memberPortal: {
      id: memberPortalAction.id,
      href: memberPortalAction.href,
      label: translate(memberPortalAction.labelKey),
    },
  };
}
```

- [ ] **Step 4: Run the navigation contract**

Run: `npm.cmd test -- tests/unit/navigation.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit the navigation authority**

```powershell
git add config/navigation.ts tests/unit/navigation.test.ts
git commit -m "feat: define PR2 public navigation model"
```

---

### Task 2: Locale switching preserves the complete URL state

**Files:**
- Modify: `tests/unit/locale-switcher.test.tsx`
- Modify: `components/layout/locale-switcher.tsx`

**Interfaces:**
- Consumes: current `usePathname`, `useSearchParams`, and next-intl router replacement.
- Produces: locale replacement URL containing the current path, serialized query, and current fragment.

- [ ] **Step 1: Add a failing fragment-preservation test**

Add this test inside `describe("LocaleSwitcher", ...)`:

```tsx
it("preserves the current fragment after path and query when switching locale", () => {
  searchState.current = new URLSearchParams("filter=member");
  window.history.replaceState(null, "", "/events?filter=member#schedule");
  render(<LocaleSwitcher locale="en" {...labels} />);

  fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));

  expect(routerReplace).toHaveBeenCalledWith(
    "/events?filter=member#schedule",
    {locale: "zh-HK"},
  );
});
```

Also add this line to `beforeEach` so tests are isolated:

```ts
window.history.replaceState(null, "", "/");
```

- [ ] **Step 2: Run the focused test and observe the missing fragment**

Run: `npm.cmd test -- tests/unit/locale-switcher.test.tsx`

Expected: FAIL because the current replacement href ends after the query string.

- [ ] **Step 3: Build the href at activation time with the current hash**

Replace the `search`/`href` declarations and `onClick` in `LocaleSwitcherContent` with:

```tsx
const search = searchParams.toString();

function switchLocale() {
  const query = search ? `?${search}` : "";
  const fragment = window.location.hash;
  router.replace(`${pathname}${query}${fragment}`, {locale: targetLocale});
}

return <LocaleSwitcherButton
  accessibleLabel={accessibleLabel}
  label={label}
  onClick={switchLocale}
/>;
```

- [ ] **Step 4: Run all locale-switcher cases**

Run: `npm.cmd test -- tests/unit/locale-switcher.test.tsx`

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit the complete locale transition**

```powershell
git add components/layout/locale-switcher.tsx tests/unit/locale-switcher.test.tsx
git commit -m "fix: preserve locale switch fragments"
```

---

### Task 3: Pin the corrected donor and import the verified logo

**Files:**
- Modify: `config/wisetech-integration-manifest.ts`
- Modify: `tests/unit/wisetech-route-parity.test.ts`
- Create: `tests/unit/wisetech-asset-provenance.test.ts`
- Replace binary: `public/images/wtia-logo.png`

**Interfaces:**
- Consumes: the original PR1 provenance record and the user-authoritative donor clone.
- Produces: `wisetechIntegrationProvenance.site.currentDonor` with repository, commit, tree, and logo identity; one `site-v13-source` asset entry.

- [ ] **Step 1: Add failing provenance and byte-hash contracts**

Replace the existing `uses next-intl without claiming unavailable Site source evidence` test with:

```ts
it("uses next-intl and records the donor without rewriting the missing original archive", () => {
  const locale = wisetechIntegrationManifest.find(({id}) => id === "locale-language-toggle");
  expect(locale?.localeMechanism).toBe("next-intl-router-replace");
  expect(JSON.stringify(locale)).not.toContain("/zh-HK");

  expect(wisetechIntegrationProvenance.site).toEqual(expect.objectContaining({
    sourceCommit: "d2d82c01099490a8c2768c942186735667bbc881",
    reportedArchiveSha256: "411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54",
    archiveAvailable: false,
  }));
  expect(wisetechIntegrationProvenance.site.currentDonor).toEqual({
    repository: "https://github.com/YNWAforever/wisetech",
    importedCommit: "f91ecc5fa29c2b9d416ed8315f23e9492baf993d",
    gitTree: "d13a99e6c47f2b3ea279c5d02da5cf15008807b7",
    continuityWithReportedArchive: false,
    logo: {
      sourcePath: "public/brand/wtia-legacy-logo.png",
      canonicalPath: "public/images/wtia-logo.png",
      sha256: "4ABAB36F7D09F36F6D54165E9A8F4C719CAD5CAA7B6CBBCD5F2819F6180DEC51",
      width: 2001,
      height: 721,
    },
  });

  expect(
    wisetechIntegrationManifest.filter(({evidence}) => evidence === "site-v13-source"),
  ).toEqual([
    expect.objectContaining({
      id: "asset-wtia-logo",
      canonicalPath: "public/images/wtia-logo.png",
      disposition: "retain",
    }),
  ]);
});
```

Create `tests/unit/wisetech-asset-provenance.test.ts`:

```ts
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {wisetechIntegrationProvenance} from "@/config/wisetech-integration-manifest";

describe("WiseTech donor asset provenance", () => {
  it("tracks the exact pinned logo bytes at the own-origin destination", () => {
    const logo = wisetechIntegrationProvenance.site.currentDonor.logo;
    const bytes = readFileSync(resolve(process.cwd(), logo.canonicalPath));
    const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();

    expect(sha256).toBe(logo.sha256);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
```

- [ ] **Step 2: Run the contracts before changing provenance or bytes**

Run: `npm.cmd test -- tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-asset-provenance.test.ts`

Expected: FAIL because `currentDonor` is absent, the asset entry still cites only the hkwtia repository, and the current logo hash is `5917F360C6FE66D80B5A0C95F16E9E1ABD79320925F5B720BE78CE988D3B14A6`.

- [ ] **Step 3: Extend the frozen provenance without changing the original identifiers**

Add this property inside `wisetechIntegrationProvenance.site` after `archiveStatus`:

```ts
currentDonor: Object.freeze({
  repository: "https://github.com/YNWAforever/wisetech",
  importedCommit: "f91ecc5fa29c2b9d416ed8315f23e9492baf993d",
  gitTree: "d13a99e6c47f2b3ea279c5d02da5cf15008807b7",
  continuityWithReportedArchive: false,
  logo: Object.freeze({
    sourcePath: "public/brand/wtia-legacy-logo.png",
    canonicalPath: "public/images/wtia-logo.png",
    sha256: "4ABAB36F7D09F36F6D54165E9A8F4C719CAD5CAA7B6CBBCD5F2819F6180DEC51",
    width: 2001,
    height: 721,
  }),
}),
```

Replace only the `asset-wtia-logo` entry with:

```ts
entry({
  id: "asset-wtia-logo",
  kind: "asset",
  source: "https://github.com/YNWAforever/wisetech/blob/f91ecc5fa29c2b9d416ed8315f23e9492baf993d/public/brand/wtia-legacy-logo.png",
  canonicalPath: "public/images/wtia-logo.png",
  disposition: "retain",
  dataOwner: "User-authoritative WiseTech donor commit plus the tracked own-origin copy.",
  rationale: "The pinned WTIA logo supports legal-operator identity without importing the donor runtime or implying a member or partner relationship.",
  evidence: "site-v13-source",
}),
```

- [ ] **Step 4: Copy only the pinned logo bytes and verify them before staging**

Run from the PR2 worktree:

```powershell
Copy-Item -LiteralPath 'C:\Users\laich\.graphify\repos\YNWAforever\wisetech\public\brand\wtia-legacy-logo.png' -Destination 'public\images\wtia-logo.png' -Force
Get-FileHash -Algorithm SHA256 -LiteralPath 'public\images\wtia-logo.png'
```

Expected hash: `4ABAB36F7D09F36F6D54165E9A8F4C719CAD5CAA7B6CBBCD5F2819F6180DEC51`.

- [ ] **Step 5: Run both provenance contracts**

Run: `npm.cmd test -- tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-asset-provenance.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the single-asset provenance slice**

```powershell
git add config/wisetech-integration-manifest.ts public/images/wtia-logo.png tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-asset-provenance.test.ts
git commit -m "feat: pin WiseTech donor logo provenance"
```

---

### Task 4: Pure announcement validation and session-only dismissal

**Files:**
- Create: `lib/public-shell/announcement.ts`
- Create: `components/layout/announcement-bar.tsx`
- Create: `tests/unit/announcement.test.tsx`

**Interfaces:**
- Consumes: `publicRoutes`, `PublicRoute`, `AppLocale`, and localized labels supplied by the shell.
- Produces: `resolveAnnouncement(value, now): ActiveAnnouncement | null` and `<AnnouncementBar announcement locale label dismissLabel />`.

- [ ] **Step 1: Write boundary and dismissal tests**

```tsx
import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {AnnouncementBar} from "@/components/layout/announcement-bar";
import {resolveAnnouncement} from "@/lib/public-shell/announcement";

vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));

const record = {
  id: "launch",
  startsAt: "2026-08-28T00:00:00.000Z",
  endsAt: "2026-08-29T00:00:00.000Z",
  href: "/events",
  text: {en: "See upcoming events", "zh-HK": "瀏覽即將舉行的活動"},
};

describe("announcement resolver", () => {
  it("uses an inclusive start and exclusive end", () => {
    expect(resolveAnnouncement(record, new Date(record.startsAt))).toEqual(record);
    expect(resolveAnnouncement(record, new Date("2026-08-28T23:59:59.999Z"))).toEqual(record);
    expect(resolveAnnouncement(record, new Date(record.endsAt))).toBeNull();
  });

  it.each([
    [null, "null"],
    [{...record, href: "/activities"}, "non-canonical href"],
    [{...record, startsAt: "not-a-date"}, "malformed start"],
    [{...record, endsAt: record.startsAt}, "empty window"],
    [{...record, text: {...record.text, en: ""}}, "missing English text"],
  ])("rejects %s (%s)", (value) => {
    expect(resolveAnnouncement(value, new Date("2026-08-28T12:00:00.000Z"))).toBeNull();
  });

  it("rejects future and expired records", () => {
    expect(resolveAnnouncement(record, new Date("2026-08-27T23:59:59.999Z"))).toBeNull();
    expect(resolveAnnouncement(record, new Date("2026-08-30T00:00:00.000Z"))).toBeNull();
  });
});

describe("AnnouncementBar", () => {
  it("renders localized text as a canonical anchor and dismisses only local state", () => {
    const announcement = resolveAnnouncement(record, new Date("2026-08-28T12:00:00.000Z"));
    render(
      <AnnouncementBar
        announcement={announcement}
        locale="zh-HK"
        label="公告"
        dismissLabel="關閉公告"
      />,
    );

    expect(screen.getByRole("complementary", {name: "公告"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: record.text["zh-HK"]})).toHaveAttribute("href", "/events");
    fireEvent.click(screen.getByRole("button", {name: "關閉公告"}));
    expect(screen.queryByRole("complementary", {name: "公告"})).not.toBeInTheDocument();
    expect(document.cookie).toBe("");
  });

  it("renders nothing for a null provider result", () => {
    const {container} = render(
      <AnnouncementBar announcement={null} locale="en" label="Announcement" dismissLabel="Dismiss announcement" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests and prove both modules are absent**

Run: `npm.cmd test -- tests/unit/announcement.test.tsx`

Expected: FAIL with unresolved imports for the announcement model and component.

- [ ] **Step 3: Create the pure announcement resolver**

```ts
import {z} from "zod";

import {publicRoutes, type PublicRoute} from "@/config/public-routes";

const canonicalHref = z.custom<PublicRoute>(
  (value) => typeof value === "string" && publicRoutes.includes(value as PublicRoute),
  "Announcement href must be a canonical public route",
);

const announcementSchema = z.object({
  id: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime({offset: true}),
  endsAt: z.string().datetime({offset: true}),
  href: canonicalHref,
  text: z.object({
    en: z.string().trim().min(1).max(180),
    "zh-HK": z.string().trim().min(1).max(180),
  }).strict(),
}).strict();

export type ActiveAnnouncement = Readonly<z.infer<typeof announcementSchema>>;

export function resolveAnnouncement(value: unknown, now: Date): ActiveAnnouncement | null {
  const parsed = announcementSchema.safeParse(value);
  const nowMs = now.getTime();
  if (!parsed.success || !Number.isFinite(nowMs)) return null;

  const startsAt = Date.parse(parsed.data.startsAt);
  const endsAt = Date.parse(parsed.data.endsAt);
  if (endsAt <= startsAt || nowMs < startsAt || nowMs >= endsAt) return null;
  return parsed.data;
}
```

- [ ] **Step 4: Create the dismissible client view**

```tsx
"use client";

import {X} from "lucide-react";
import {useState} from "react";

import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import type {ActiveAnnouncement} from "@/lib/public-shell/announcement";

type AnnouncementBarProps = {
  announcement: ActiveAnnouncement | null;
  locale: AppLocale;
  label: string;
  dismissLabel: string;
};

export function AnnouncementBar({
  announcement,
  locale,
  label,
  dismissLabel,
}: AnnouncementBarProps) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  if (!announcement || dismissedId === announcement.id) return null;

  return (
    <aside className="bg-shell-navy text-white" aria-label={label}>
      <div className="mx-auto flex min-h-11 max-w-shell items-center justify-center gap-3 px-4 py-2 text-center text-sm">
        <Link className="font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" href={announcement.href}>
          {announcement.text[locale]}
        </Link>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={dismissLabel}
          onClick={() => setDismissedId(announcement.id)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Run the announcement suite**

Run: `npm.cmd test -- tests/unit/announcement.test.tsx`

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit the announcement seam**

```powershell
git add lib/public-shell/announcement.ts components/layout/announcement-bar.tsx tests/unit/announcement.test.tsx
git commit -m "feat: add validated announcement seam"
```

---

### Task 5: Dual-brand lockup and additive shell tokens

**Files:**
- Create: `components/layout/dual-brand-lockup.tsx`
- Create: `tests/unit/dual-brand-lockup.test.tsx`
- Create: `tests/unit/public-shell-tokens.test.ts`
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Consumes: own-origin `/images/wtia-logo.png`, localized public-name/operator labels, existing font variables.
- Produces: `<DualBrandLockup labels priority compact />` and `shell-*` token aliases.

- [ ] **Step 1: Write failing component and token contracts**

Create `tests/unit/dual-brand-lockup.test.tsx`:

```tsx
import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";

vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) =>
    <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));

const labels = {
  homeLabel: "WiseTech Hong Kong home",
  publicName: "WiseTech Hong Kong",
  operator: "Operated by WTIA",
  logoAlt: "WTIA",
};

describe("DualBrandLockup", () => {
  it("pairs WiseTech public identity with WTIA legal identity", () => {
    render(<DualBrandLockup labels={labels} priority />);

    expect(screen.getByRole("link", {name: labels.homeLabel})).toHaveAttribute("href", "/");
    expect(screen.getByRole("img", {name: labels.logoAlt})).toHaveAttribute("src", "/images/wtia-logo.png");
    expect(screen.getByText(labels.publicName)).toBeInTheDocument();
    expect(screen.getByText(labels.operator)).toBeInTheDocument();
  });
});
```

Create `tests/unit/public-shell-tokens.test.ts`:

```ts
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const tailwind = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf8");

describe("public shell semantic tokens", () => {
  it.each([
    "--shell-canvas", "--shell-raised", "--shell-warm", "--shell-ink",
    "--shell-muted", "--shell-navy", "--shell-blue", "--shell-accent",
    "--shell-border", "--shell-shadow-sm", "--shell-shadow-lg",
    "--shell-radius-sm", "--shell-radius-lg", "--shell-focus", "--shell-content",
  ])("defines %s without replacing the base tokens", (token) => {
    expect(globals).toContain(token);
  });

  it("registers Chinese-capable fallbacks and reduced-motion protection", () => {
    expect(globals).toContain('"PingFang TC"');
    expect(globals).toContain('"Noto Sans TC"');
    expect(globals).toContain('"Microsoft JhengHei"');
    expect(globals).toContain("prefers-reduced-motion: reduce");
  });

  it.each(["canvas", "raised", "warm", "ink", "navy", "blue"])(
    "exposes the shell %s colour through Tailwind",
    (name) => expect(tailwind).toContain(`${name}: \"hsl(var(--shell-${name}))\"`),
  );
});
```

- [ ] **Step 2: Run the new tests and prove component/tokens are absent**

Run: `npm.cmd test -- tests/unit/dual-brand-lockup.test.tsx tests/unit/public-shell-tokens.test.ts`

Expected: FAIL with a missing component and absent `--shell-*` aliases.

- [ ] **Step 3: Create the dual-brand component**

```tsx
import Image from "next/image";

import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

export type DualBrandLabels = Readonly<{
  homeLabel: string;
  publicName: string;
  operator: string;
  logoAlt: string;
}>;

type DualBrandLockupProps = {
  labels: DualBrandLabels;
  priority?: boolean;
  compact?: boolean;
};

export function DualBrandLockup({labels, priority = false, compact = false}: DualBrandLockupProps) {
  return (
    <Link className="group inline-flex min-w-0 items-center gap-3" href="/" aria-label={labels.homeLabel}>
      <Image
        src="/images/wtia-logo.png"
        alt={labels.logoAlt}
        width={2001}
        height={721}
        priority={priority}
        className={cn("w-auto shrink-0 object-contain", compact ? "h-8" : "h-10")}
      />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold tracking-tight text-current sm:text-base">
          {labels.publicName}
        </span>
        <span className="block truncate text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-shell-muted group-hover:text-current">
          {labels.operator}
        </span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Add semantic aliases under `:root` without changing existing values**

Append these declarations inside the current `:root` block:

```css
  --shell-canvas: 36 33% 98%;
  --shell-raised: 0 0% 100%;
  --shell-warm: 38 43% 95%;
  --shell-ink: 216 38% 14%;
  --shell-muted: 215 14% 40%;
  --shell-navy: 218 48% 18%;
  --shell-blue: 210 100% 38%;
  --shell-accent: 25 95% 55%;
  --shell-border: 214 18% 84%;
  --shell-shadow-sm: 0 8px 24px hsl(218 48% 18% / 0.08);
  --shell-shadow-lg: 0 24px 64px hsl(218 48% 18% / 0.16);
  --shell-radius-sm: 0.5rem;
  --shell-radius-lg: 1.25rem;
  --shell-focus: 210 100% 38%;
  --shell-content: 88rem;
```

Replace the body font declaration with:

```css
body { margin: 0; background: hsl(var(--background)); color: hsl(var(--foreground)); font-family: var(--font-sans), "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif; }
```

Append:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Extend `tailwind.config.ts` with aliases**

Add inside `extend.colors`:

```ts
shell: {
  canvas: "hsl(var(--shell-canvas))",
  raised: "hsl(var(--shell-raised))",
  warm: "hsl(var(--shell-warm))",
  ink: "hsl(var(--shell-ink))",
  muted: "hsl(var(--shell-muted))",
  navy: "hsl(var(--shell-navy))",
  blue: "hsl(var(--shell-blue))",
  accent: "hsl(var(--shell-accent))",
  border: "hsl(var(--shell-border))",
},
```

Add inside `extend` beside `colors` and `borderRadius`:

```ts
maxWidth: {shell: "var(--shell-content)"},
boxShadow: {
  "shell-sm": "var(--shell-shadow-sm)",
  "shell-lg": "var(--shell-shadow-lg)",
},
```

Add inside `extend.borderRadius`:

```ts
"shell-sm": "var(--shell-radius-sm)",
"shell-lg": "var(--shell-radius-lg)",
```

- [ ] **Step 6: Run component and token contracts**

Run: `npm.cmd test -- tests/unit/dual-brand-lockup.test.tsx tests/unit/public-shell-tokens.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the visual foundation**

```powershell
git add app/globals.css tailwind.config.ts components/layout/dual-brand-lockup.tsx tests/unit/dual-brand-lockup.test.tsx tests/unit/public-shell-tokens.test.ts
git commit -m "feat: add WiseTech shell brand foundation"
```

---

### Task 6: Accessible desktop mega navigation

**Files:**
- Create: `components/ui/navigation-menu.tsx`
- Create: `components/layout/desktop-mega-navigation.tsx`
- Create: `tests/unit/desktop-mega-navigation.test.tsx`

**Interfaces:**
- Consumes: `readonly LocalizedNavigationGroup[]`, localized primary-nav label, and next-intl `usePathname`.
- Produces: `<DesktopMegaNavigation groups primaryLabel />`, `pathBelongsToGroup`, and exact-leaf `aria-current` behavior.

- [ ] **Step 1: Write failing keyboard, active-state, and anchor tests**

```tsx
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import {localizeNavigation} from "@/config/navigation";

const route = vi.hoisted(() => ({pathname: "/events"}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => route.pathname,
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));

const groups = localizeNavigation((key) => key).groups;

describe("DesktopMegaNavigation", () => {
  beforeEach(() => { route.pathname = "/events"; });

  it("renders the four triggers in approved order and marks only group state on the trigger", () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const nav = screen.getByRole("navigation", {name: "Primary navigation"});
    const triggers = Array.from(nav.querySelectorAll("button"));

    expect(triggers.map((trigger) => trigger.textContent?.trim())).toEqual([
      "groups.eventsProgrammes.label",
      "groups.membershipEcosystem.label",
      "groups.impactInsights.label",
      "groups.aboutWtia.label",
    ]);
    expect(triggers[0]).toHaveAttribute("data-current", "true");
    expect(triggers[0]).not.toHaveAttribute("aria-current");
  });

  it("uses Radix arrow, Home, and End movement between triggers", () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const triggers = screen.getAllByRole("button");
    triggers[0]?.focus();
    fireEvent.keyDown(triggers[0]!, {key: "ArrowRight"});
    expect(triggers[1]).toHaveFocus();
    fireEvent.keyDown(triggers[1]!, {key: "End"});
    expect(triggers[3]).toHaveFocus();
    fireEvent.keyDown(triggers[3]!, {key: "Home"});
    expect(triggers[0]).toHaveFocus();
  });

  it("opens from the keyboard, exposes canonical anchors, closes on navigation, and returns focus", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const trigger = screen.getAllByRole("button")[0]!;
    trigger.focus();
    fireEvent.keyDown(trigger, {key: "Enter"});

    const events = await screen.findByRole("link", {name: "links.events"});
    expect(events).toHaveAttribute("href", "/events");
    expect(events).toHaveAttribute("aria-current", "page");
    fireEvent.click(events);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and restores the initiating trigger", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const trigger = screen.getAllByRole("button")[0]!;
    trigger.focus();
    fireEvent.keyDown(trigger, {key: "ArrowDown"});
    expect(await screen.findByRole("link", {name: "links.events"})).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? trigger, {key: "Escape"});
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
```

- [ ] **Step 2: Run the test and prove both components are absent**

Run: `npm.cmd test -- tests/unit/desktop-mega-navigation.test.tsx`

Expected: FAIL with an unresolved `desktop-mega-navigation` import.

- [ ] **Step 3: Create the thin Radix wrapper**

```tsx
"use client";

import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import {ChevronDown} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const NavigationMenu = NavigationMenuPrimitive.Root;
const NavigationMenuItem = NavigationMenuPrimitive.Item;
const NavigationMenuLink = NavigationMenuPrimitive.Link;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({className, ...props}, ref) => (
  <NavigationMenuPrimitive.List ref={ref} className={cn("flex list-none items-center gap-1", className)} {...props} />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({className, children, ...props}, ref) => (
  <NavigationMenuPrimitive.Trigger
    ref={ref}
    className={cn(
      "group inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold text-shell-ink outline-none hover:bg-shell-warm focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))] data-[state=open]:bg-shell-warm data-[current=true]:text-shell-blue",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({className, ...props}, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn("left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out", className)}
    {...props}
  />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({className, ...props}, ref) => (
  <div className="absolute left-0 top-full flex w-full justify-start">
    <NavigationMenuPrimitive.Viewport
      ref={ref}
      className={cn(
        "relative mt-2 h-[var(--radix-navigation-menu-viewport-height)] w-[var(--radix-navigation-menu-viewport-width)] min-w-[36rem] origin-top-left overflow-hidden rounded-shell-lg border border-shell-border bg-shell-raised shadow-shell-lg",
        className,
      )}
      {...props}
    />
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

- [ ] **Step 4: Create the focused desktop navigation client**

```tsx
"use client";

import {useState} from "react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu";
import type {LocalizedNavigationGroup} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type DesktopMegaNavigationProps = {
  groups: readonly LocalizedNavigationGroup[];
  primaryLabel: string;
};

export function pathBelongsToGroup(pathname: string, group: LocalizedNavigationGroup): boolean {
  return group.columns.some((column) => column.links.some(({href}) =>
    pathname === href || pathname.startsWith(`${href}/`),
  ));
}

export function DesktopMegaNavigation({groups, primaryLabel}: DesktopMegaNavigationProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState("");

  function closeAndReturnFocus(groupId: string) {
    setOpenGroup("");
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-navigation-trigger="${groupId}"]`)?.focus();
    });
  }

  return (
    <nav aria-label={primaryLabel}>
      <NavigationMenu className="relative" value={openGroup} onValueChange={setOpenGroup}>
        <NavigationMenuList>
          {groups.map((group) => {
            const current = pathBelongsToGroup(pathname, group);
            return (
              <NavigationMenuItem key={group.id} value={group.id}>
                <NavigationMenuTrigger
                  data-navigation-trigger={group.id}
                  data-current={current ? "true" : undefined}
                  className={cn(group.eventFirst && "bg-shell-blue text-white hover:bg-shell-navy data-[state=open]:bg-shell-navy data-[current=true]:text-white")}
                >
                  {group.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid min-w-[36rem] grid-cols-[14rem_1fr] gap-8 p-6">
                    <div className="rounded-shell-lg bg-shell-warm p-5">
                      <p className="text-lg font-bold text-shell-ink">{group.label}</p>
                      <p className="mt-2 text-sm leading-6 text-shell-muted">{group.description}</p>
                    </div>
                    <div className={cn("grid gap-6", group.columns.length > 1 && "grid-cols-2")}>
                      {group.columns.map((column) => (
                        <section key={column.id} aria-labelledby={`${group.id}-${column.id}`}>
                          <h2 id={`${group.id}-${column.id}`} className="text-xs font-bold uppercase tracking-[0.14em] text-shell-muted">
                            {column.label}
                          </h2>
                          <ul className="mt-3 space-y-1">
                            {column.links.map((link) => (
                              <li key={link.id}>
                                <NavigationMenuLink asChild>
                                  <Link
                                    href={link.href}
                                    aria-current={pathname === link.href ? "page" : undefined}
                                    className="block rounded-shell-sm px-3 py-3 text-sm font-semibold text-shell-ink hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]"
                                    onClick={() => closeAndReturnFocus(group.id)}
                                  >
                                    {link.label}
                                  </Link>
                                </NavigationMenuLink>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
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

- [ ] **Step 5: Run and adjust only for demonstrated Radix/jsdom differences**

Run: `npm.cmd test -- tests/unit/desktop-mega-navigation.test.tsx`

Expected: PASS, 4 tests. If jsdom lacks `ResizeObserver`, add this exact local shim before `describe`:

```ts
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
```

- [ ] **Step 6: Commit the desktop interaction slice**

```powershell
git add components/ui/navigation-menu.tsx components/layout/desktop-mega-navigation.tsx tests/unit/desktop-mega-navigation.test.tsx
git commit -m "feat: add accessible desktop mega navigation"
```

---

### Task 7: Mobile Sheet and grouped Accordion navigation

**Files:**
- Create: `components/ui/accordion.tsx`
- Modify: `components/layout/mobile-navigation.tsx`
- Create: `tests/unit/mobile-navigation.test.tsx`

**Interfaces:**
- Consumes: `NavigationViewModel`, localized mobile labels, current next-intl pathname, existing Sheet and LocaleSwitcher.
- Produces: `<MobileNavigation locale navigation labels />` with reset-on-close Accordion state and real canonical anchors.

- [ ] **Step 1: Write failing priority, accordion, close, and focus tests**

```tsx
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {localizeNavigation} from "@/config/navigation";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
  useRouter: () => ({replace: vi.fn()}),
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

const navigation = localizeNavigation((key) => key);
const labels = {
  open: "Open navigation",
  close: "Close navigation",
  title: "Navigation",
  description: "Explore WiseTech Hong Kong",
  english: "EN",
  chinese: "中文",
  switchToEnglish: "Switch to English",
  switchToChinese: "Switch to Chinese",
};

describe("MobileNavigation", () => {
  it("puts event and join actions first, then the four groups and utilities", () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: labels.open}));
    const dialog = screen.getByRole("dialog");
    const priority = within(dialog).getByTestId("mobile-priority-actions");
    expect(within(priority).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/events", "/join",
    ]);
    expect(within(dialog).getAllByRole("button", {expanded: false})).toHaveLength(4);
    expect(within(dialog).getByRole("link", {name: "actions.memberSignIn"})).toHaveAttribute("href", "/portal");
  });

  it("opens a group, marks the exact current leaf, closes on navigation, and returns focus", async () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
    const trigger = screen.getByRole("button", {name: labels.open});
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", {name: "groups.eventsProgrammes.label"}));
    const eventLink = screen.getByRole("link", {name: "links.events"});
    expect(eventLink).toHaveAttribute("aria-current", "page");
    fireEvent.click(eventLink);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("resets stale accordion state after Escape and reopen", async () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
    const trigger = screen.getByRole("button", {name: labels.open});
    fireEvent.click(trigger);
    const group = screen.getByRole("button", {name: "groups.eventsProgrammes.label"});
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("dialog"), {key: "Escape"});
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    expect(screen.getByRole("button", {name: "groups.eventsProgrammes.label"})).toHaveAttribute("aria-expanded", "false");
  });
});
```

- [ ] **Step 2: Run the tests against the old flat mobile API**

Run: `npm.cmd test -- tests/unit/mobile-navigation.test.tsx`

Expected: FAIL because the component accepts `items`, has no Accordion, and routes Join to `/membership`.

- [ ] **Step 3: Create the thin Accordion wrapper**

```tsx
"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {ChevronDown} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({className, ...props}, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn("border-b border-shell-border", className)} {...props} />
));
AccordionItem.displayName = AccordionPrimitive.Item.displayName;

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({className, children, ...props}, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex min-h-12 flex-1 items-center justify-between py-3 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))] data-[current=true]:text-shell-blue",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({className, children, ...props}, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export {Accordion, AccordionContent, AccordionItem, AccordionTrigger};
```

- [ ] **Step 4: Replace `mobile-navigation.tsx` with the grouped controlled client**

```tsx
"use client";

import {Menu} from "lucide-react";
import {useRef, useState} from "react";

import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Button} from "@/components/ui/button";
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger} from "@/components/ui/sheet";
import type {NavigationViewModel} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

type MobileNavigationProps = {
  locale: AppLocale;
  navigation: NavigationViewModel;
  labels: {
    open: string;
    close: string;
    title: string;
    description: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
};

export function MobileNavigation({locale, navigation, labels}: MobileNavigationProps) {
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
        <Button ref={triggerRef} variant="ghost" size="icon" className="min-h-11 min-w-11 lg:hidden" aria-label={labels.open}>
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={labels.close} className="overflow-y-auto bg-shell-raised text-shell-ink">
        <SheetTitle>{labels.title}</SheetTitle>
        <SheetDescription>{labels.description}</SheetDescription>

        <div className="mt-6 grid grid-cols-2 gap-3" data-testid="mobile-priority-actions">
          {[navigation.actions.findEvent, navigation.actions.join].map((action) => (
            <SheetClose asChild key={action.id}>
              <Link
                href={action.href}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-shell-blue px-3 text-center text-sm font-bold text-white first:bg-shell-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]"
              >
                {action.label}
              </Link>
            </SheetClose>
          ))}
        </div>

        <nav className="mt-6" aria-label={labels.title}>
          <Accordion type="single" collapsible value={expandedGroup} onValueChange={setExpandedGroup}>
            {navigation.groups.map((group) => {
              const current = group.columns.some((column) => column.links.some(({href}) =>
                pathname === href || pathname.startsWith(`${href}/`),
              ));
              return (
                <AccordionItem key={group.id} value={group.id}>
                  <AccordionTrigger data-current={current ? "true" : undefined}>{group.label}</AccordionTrigger>
                  <AccordionContent>
                    {group.columns.map((column) => (
                      <section key={column.id} className="mt-3" aria-labelledby={`mobile-${group.id}-${column.id}`}>
                        <h2 id={`mobile-${group.id}-${column.id}`} className="text-xs font-bold uppercase tracking-[0.14em] text-shell-muted">
                          {column.label}
                        </h2>
                        <ul className="mt-2 space-y-1">
                          {column.links.map((link) => (
                            <li key={link.id}>
                              <SheetClose asChild>
                                <Link
                                  href={link.href}
                                  aria-current={pathname === link.href ? "page" : undefined}
                                  className="block min-h-11 rounded-shell-sm px-3 py-3 font-medium hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]"
                                >
                                  {link.label}
                                </Link>
                              </SheetClose>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </nav>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-shell-border pt-6">
          <SheetClose asChild>
            <Link className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:bg-shell-warm" href={navigation.memberPortal.href}>
              {navigation.memberPortal.label}
            </Link>
          </SheetClose>
          <LocaleSwitcher
            locale={locale}
            englishLabel={labels.english}
            chineseLabel={labels.chinese}
            switchToEnglishLabel={labels.switchToEnglish}
            switchToChineseLabel={labels.switchToChinese}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Run mobile interaction tests**

Run: `npm.cmd test -- tests/unit/mobile-navigation.test.tsx`

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit the mobile interaction slice**

```powershell
git add components/ui/accordion.tsx components/layout/mobile-navigation.tsx tests/unit/mobile-navigation.test.tsx
git commit -m "feat: group the mobile public navigation"
```

---

### Task 8: Translate and compose the server-owned shell

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Modify: `components/layout/site-header.tsx`
- Modify: `components/layout/site-footer.tsx`
- Modify: `app/[locale]/(public)/layout.tsx`
- Modify: `tests/unit/messages.test.ts`
- Create: `tests/unit/public-shell.test.tsx`
- Create: `tests/unit/wisetech-shell-boundary.test.ts`

**Interfaces:**
- Consumes: `localizeNavigation`, `DualBrandLockup`, desktop/mobile clients, `AnnouncementBar`, existing Concierge localization.
- Produces: `SiteHeader({locale, variant?: "solid" | "hero-overlay"})`, derived footer groups, and exact public-layout composition order.

- [ ] **Step 1: Add complete bilingual Navigation, Announcement, and Footer namespaces**

Replace the English `Navigation` and `Footer` objects and insert `Announcement` between them:

```json
"Navigation": {
  "brand": {
    "publicName": "WiseTech Hong Kong",
    "operator": "Operated by WTIA"
  },
  "groups": {
    "eventsProgrammes": {"label": "Events & Programmes", "description": "Find current events, awards and programmes backed by WTIA records."},
    "membershipEcosystem": {"label": "Membership & Ecosystem", "description": "Join the association and discover reviewed member solutions."},
    "impactInsights": {"label": "Impact & Insights", "description": "Read published updates and inspect WTIA's AI evidence."},
    "aboutWtia": {"label": "About WTIA", "description": "Understand the association, its history, governance and contact channels."}
  },
  "columns": {
    "participate": "Participate",
    "programmes": "Programmes",
    "membership": "Membership",
    "insights": "Evidence & insight",
    "organisation": "Organisation",
    "connect": "Connect"
  },
  "links": {
    "events": "Events",
    "launchpad": "Launch Pad",
    "hkict": "HKICT Awards",
    "asa": "Asia Smart App Awards",
    "tct": "Tech to Connect",
    "cpai": "CPAI",
    "membership": "Membership",
    "showcase": "Member & solution showcase",
    "news": "News",
    "aiOps": "AI operations",
    "aiTransparency": "AI transparency",
    "about": "About WTIA",
    "history": "History",
    "chairman": "Chairman's message",
    "committees": "Committees",
    "contact": "Contact"
  },
  "actions": {
    "findEvent": "Find an event",
    "join": "Join WiseTech",
    "memberSignIn": "Member sign in"
  },
  "openMenu": "Open navigation",
  "closeMenu": "Close navigation",
  "menuTitle": "Navigation",
  "menuDescription": "Explore WiseTech Hong Kong journeys and change language.",
  "english": "EN",
  "chinese": "中文",
  "switchToEnglish": "Switch to English",
  "switchToChinese": "Switch to Chinese",
  "homeLabel": "WiseTech Hong Kong home",
  "logoAlt": "WTIA",
  "primaryLabel": "Primary navigation"
},
"Announcement": {
  "label": "Announcement",
  "dismiss": "Dismiss announcement"
},
"Footer": {
  "brand": {
    "publicName": "WiseTech Hong Kong",
    "operator": "Operated by WTIA",
    "homeLabel": "WiseTech Hong Kong home",
    "logoAlt": "WTIA"
  },
  "summary": "WiseTech Hong Kong connects technology businesses, practitioners and programmes through WTIA's verified public services.",
  "address": "4/F, KOHO, 73-75 Hung To Road, Kwun Tong, Hong Kong",
  "journeys": "Explore",
  "connect": "Contact",
  "legal": "Legal",
  "privacy": "Privacy statement",
  "copyright": "© {year} WiseTech Hong Kong. Operated by WTIA. All rights reserved."
}
```

Replace the Traditional Chinese `Navigation` and `Footer` objects and insert `Announcement` between them:

```json
"Navigation": {
  "brand": {
    "publicName": "WiseTech Hong Kong",
    "operator": "由 WTIA 營運"
  },
  "groups": {
    "eventsProgrammes": {"label": "活動及計劃", "description": "探索由 WTIA 記錄支持的最新活動、獎項及計劃。"},
    "membershipEcosystem": {"label": "會員與創科生態", "description": "加入協會，並探索經審核的會員方案。"},
    "impactInsights": {"label": "影響與洞察", "description": "閱讀已發布消息，並查閱 WTIA 的人工智能實證。"},
    "aboutWtia": {"label": "關於 WTIA", "description": "了解協會、歷史、管治及聯絡渠道。"}
  },
  "columns": {
    "participate": "參與",
    "programmes": "計劃",
    "membership": "會員",
    "insights": "實證與洞察",
    "organisation": "協會",
    "connect": "聯絡"
  },
  "links": {
    "events": "活動",
    "launchpad": "創科起動",
    "hkict": "香港資訊及通訊科技獎",
    "asa": "亞洲智能應用程式大獎",
    "tct": "Tech to Connect",
    "cpai": "CPAI",
    "membership": "會員計劃",
    "showcase": "會員與方案展示",
    "news": "最新消息",
    "aiOps": "人工智能營運",
    "aiTransparency": "人工智能透明度",
    "about": "關於 WTIA",
    "history": "歷史",
    "chairman": "主席的話",
    "committees": "委員會",
    "contact": "聯絡我們"
  },
  "actions": {
    "findEvent": "尋找活動",
    "join": "加入 WiseTech",
    "memberSignIn": "會員登入"
  },
  "openMenu": "開啟導覽選單",
  "closeMenu": "關閉導覽選單",
  "menuTitle": "網站導覽",
  "menuDescription": "瀏覽 WiseTech Hong Kong 服務及切換語言。",
  "english": "EN",
  "chinese": "中文",
  "switchToEnglish": "Switch to English",
  "switchToChinese": "切換至中文",
  "homeLabel": "WiseTech Hong Kong 首頁",
  "logoAlt": "WTIA",
  "primaryLabel": "主要導覽"
},
"Announcement": {
  "label": "公告",
  "dismiss": "關閉公告"
},
"Footer": {
  "brand": {
    "publicName": "WiseTech Hong Kong",
    "operator": "由 WTIA 營運",
    "homeLabel": "WiseTech Hong Kong 首頁",
    "logoAlt": "WTIA"
  },
  "summary": "WiseTech Hong Kong 透過 WTIA 經核實的公開服務，連繫科技企業、專業人士及計劃。",
  "address": "香港觀塘鴻圖道 73-75 號 KOHO 4 樓",
  "journeys": "探索",
  "connect": "聯絡",
  "legal": "法律資訊",
  "privacy": "私隱聲明",
  "copyright": "© {year} WiseTech Hong Kong。由 WTIA 營運。版權所有。"
}
```

- [ ] **Step 2: Extend message parity with exact shell copy assertions**

Add inside `tests/unit/messages.test.ts`:

```ts
it("ships complete bilingual WiseTech shell labels", () => {
  expect(en.Navigation.groups).toEqual({
    eventsProgrammes: expect.objectContaining({label: "Events & Programmes"}),
    membershipEcosystem: expect.objectContaining({label: "Membership & Ecosystem"}),
    impactInsights: expect.objectContaining({label: "Impact & Insights"}),
    aboutWtia: expect.objectContaining({label: "About WTIA"}),
  });
  expect(zh.Navigation.groups).toEqual({
    eventsProgrammes: expect.objectContaining({label: "活動及計劃"}),
    membershipEcosystem: expect.objectContaining({label: "會員與創科生態"}),
    impactInsights: expect.objectContaining({label: "影響與洞察"}),
    aboutWtia: expect.objectContaining({label: "關於 WTIA"}),
  });
  expect(en.Navigation.actions).toEqual({
    findEvent: "Find an event",
    join: "Join WiseTech",
    memberSignIn: "Member sign in",
  });
  expect(zh.Navigation.actions).toEqual({
    findEvent: "尋找活動",
    join: "加入 WiseTech",
    memberSignIn: "會員登入",
  });
});
```

- [ ] **Step 3: Run the message contract**

Run: `npm.cmd test -- tests/unit/messages.test.ts`

Expected: PASS with English/Traditional Chinese leaf-key parity.

- [ ] **Step 4: Replace `site-header.tsx` with the async translation/composition boundary**

```tsx
import {getTranslations} from "next-intl/server";

import {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {Button} from "@/components/ui/button";
import {localizeNavigation, type NavigationMessageKey} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

export type SiteHeaderVariant = "solid" | "hero-overlay";

type SiteHeaderProps = {
  locale: AppLocale;
  variant?: SiteHeaderVariant;
};

export async function SiteHeader({locale, variant = "solid"}: SiteHeaderProps) {
  const t = await getTranslations({locale, namespace: "Navigation"});
  const navigation = localizeNavigation((key: NavigationMessageKey) => t(key));
  const mobileLabels = {
    open: t("openMenu"),
    close: t("closeMenu"),
    title: t("menuTitle"),
    description: t("menuDescription"),
    english: t("english"),
    chinese: t("chinese"),
    switchToEnglish: t("switchToEnglish"),
    switchToChinese: t("switchToChinese"),
  };
  const brand = {
    homeLabel: t("homeLabel"),
    publicName: t("brand.publicName"),
    operator: t("brand.operator"),
    logoAlt: t("logoAlt"),
  };

  return (
    <header
      data-variant={variant}
      className={cn(
        "z-40 border-b",
        variant === "solid"
          ? "sticky top-0 border-shell-border bg-shell-raised/95 text-shell-ink backdrop-blur-xl"
          : "absolute inset-x-0 top-0 border-transparent bg-transparent text-white",
      )}
    >
      <div className="mx-auto flex min-h-20 max-w-shell items-center justify-between gap-4 px-4 sm:px-6">
        <DualBrandLockup labels={brand} priority compact />
        <div className="hidden items-center gap-2 lg:flex">
          <Link className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]" href={navigation.memberPortal.href}>
            {navigation.memberPortal.label}
          </Link>
          <LocaleSwitcher locale={locale} englishLabel={mobileLabels.english} chineseLabel={mobileLabels.chinese} switchToEnglishLabel={mobileLabels.switchToEnglish} switchToChineseLabel={mobileLabels.switchToChinese} />
          <Button asChild variant="outline" className="min-h-11 rounded-full px-5">
            <Link href={navigation.actions.join.href}>{navigation.actions.join.label}</Link>
          </Button>
        </div>
        <MobileNavigation locale={locale} navigation={navigation} labels={mobileLabels} />
      </div>
      <div className="hidden border-t border-shell-border lg:block">
        <div className="mx-auto flex min-h-14 max-w-shell items-center justify-between gap-5 px-6">
          <DesktopMegaNavigation groups={navigation.groups} primaryLabel={t("primaryLabel")} />
          <Button asChild className="min-h-11 shrink-0 rounded-full bg-shell-navy px-5 text-white hover:bg-shell-blue">
            <Link href={navigation.actions.findEvent.href}>{navigation.actions.findEvent.label}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Replace `site-footer.tsx` with the shared-model footer**

```tsx
import {getTranslations} from "next-intl/server";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {localizeNavigation, type NavigationMessageKey} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

export async function SiteFooter({locale}: {locale: AppLocale}) {
  const [navigationT, t] = await Promise.all([
    getTranslations({locale, namespace: "Navigation"}),
    getTranslations({locale, namespace: "Footer"}),
  ]);
  const navigation = localizeNavigation((key: NavigationMessageKey) => navigationT(key));

  return (
    <footer className="border-t border-shell-border bg-shell-warm py-14 text-shell-ink">
      <div className="mx-auto grid max-w-shell gap-10 px-6 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <DualBrandLockup labels={{
            homeLabel: t("brand.homeLabel"),
            publicName: t("brand.publicName"),
            operator: t("brand.operator"),
            logoAlt: t("brand.logoAlt"),
          }} />
          <p className="mt-5 max-w-md text-sm leading-6 text-shell-muted">{t("summary")}</p>
          <p className="mt-4 text-xs leading-5 text-shell-muted">{t("address")}</p>
        </div>

        <nav aria-label={t("journeys")}>
          <h2 className="sr-only">{t("journeys")}</h2>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {navigation.groups.map((group) => (
              <section key={group.id} aria-labelledby={`footer-${group.id}`}>
                <h3 id={`footer-${group.id}`} className="text-sm font-bold">{group.label}</h3>
                <ul className="mt-3 space-y-2 text-sm text-shell-muted">
                  {group.columns.flatMap((column) => column.links).map((link) => (
                    <li key={link.id}>
                      <Link className="underline-offset-4 hover:text-shell-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]" href={link.href}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-shell-border pt-6 lg:col-span-2">
          <div className="flex flex-col gap-5 text-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-bold">{t("connect")}</h2>
              <address className="mt-2 space-y-1 not-italic text-shell-muted">
                <a className="block underline-offset-4 hover:underline" href="mailto:contact@hkwtia.org">contact@hkwtia.org</a>
                <a className="block underline-offset-4 hover:underline" href="tel:+85229899164">+852 2989 9164</a>
              </address>
            </div>
            <div className="text-shell-muted">
              <h2 className="font-bold text-shell-ink">{t("legal")}</h2>
              <Link className="mt-2 block underline-offset-4 hover:underline" href="/privacy">{t("privacy")}</Link>
              <p className="mt-2 text-xs">{t("copyright", {year: new Date().getFullYear()})}</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Insert the null announcement provider into the sole public layout**

Import `AnnouncementBar`, request the `Announcement` namespace in the existing `Promise.all`, and return this exact order:

```tsx
<>
  <a className="skip-link" href="#main-content">
    {t("skipToContent")}
  </a>
  <AnnouncementBar
    announcement={null}
    locale={appLocale}
    label={announcement("label")}
    dismissLabel={announcement("dismiss")}
  />
  <SiteHeader locale={appLocale} />
  <main id="main-content">{children}</main>
  <SiteFooter locale={appLocale} />
  <ConciergeWidget
    locale={appLocale}
    labels={conciergeLabels}
    {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
  />
</>
```

The translation load becomes:

```ts
const [t, concierge, announcement] = await Promise.all([
  getTranslations({locale, namespace: "Common"}),
  getTranslations({locale, namespace: "Concierge"}),
  getTranslations({locale, namespace: "Announcement"}),
]);
```

- [ ] **Step 7: Add server-render and source-boundary tests**

Create `tests/unit/public-shell.test.tsx`:

```tsx
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", async () => {
  const {readFileSync} = await import("node:fs");
  const {resolve} = await import("node:path");
  const bundles = {
    en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
    "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
  } as const;
  return {
    getTranslations: async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
      (key: string, values?: Record<string, string | number>) => {
        const value = key.split(".").reduce<unknown>(
          (current, segment) => (current as Record<string, unknown>)[segment],
          (bundles[locale] as Record<string, unknown>)[namespace],
        );
        return Object.entries(values ?? {}).reduce(
          (text, [name, replacement]) => text.replace(`{${name}}`, String(replacement)),
          String(value),
        );
      },
  };
});
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) =>
    <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
  useRouter: () => ({replace: vi.fn()}),
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams()}));

import {SiteFooter} from "@/components/layout/site-footer";
import {SiteHeader} from "@/components/layout/site-header";

describe("public shell server surfaces", () => {
  it.each([
    ["en", "Events & Programmes", "Find an event", "Operated by WTIA"],
    ["zh-HK", "活動及計劃", "尋找活動", "由 WTIA 營運"],
  ] as const)("renders complete %s header copy", async (locale, group, action, operator) => {
    const view = render(await SiteHeader({locale}));
    expect(screen.getByText("WiseTech Hong Kong")).toBeInTheDocument();
    expect(screen.getByText(operator)).toBeInTheDocument();
    expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", {name: action}).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", {name: "WTIA"})).toHaveAttribute("src", "/images/wtia-logo.png");
    view.unmount();
  });

  it("derives every English footer journey anchor from the shared navigation model", async () => {
    render(await SiteFooter({locale: "en"}));
    const footer = screen.getByRole("contentinfo");
    const hrefs = within(footer).getAllByRole("link").map((link) => link.getAttribute("href"));
    for (const href of [
      "/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct", "/programs/cpai",
      "/membership", "/showcase", "/news", "/ai-ops", "/ai-transparency", "/about", "/about/history",
      "/about/chairman", "/about/committees", "/contact", "/privacy",
    ]) expect(hrefs, href).toContain(href);
    expect(within(footer).queryByText(/newsletter/i)).not.toBeInTheDocument();
  });

  it("keeps the public shell owner order and exactly one named main", () => {
    const source = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/layout.tsx"), "utf8");
    const ordered = ["skip-link", "<AnnouncementBar", "<SiteHeader", "<main id=\"main-content\"", "<SiteFooter", "<ConciergeWidget"];
    const positions = ordered.map((token) => source.indexOf(token));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source.match(/<main\b/g)).toHaveLength(1);
  });
});
```

Create `tests/unit/wisetech-shell-boundary.test.ts`:

```ts
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const implementationFiles = [
  "config/navigation.ts",
  "components/layout/site-header.tsx",
  "components/layout/site-footer.tsx",
  "components/layout/desktop-mega-navigation.tsx",
  "components/layout/mobile-navigation.tsx",
  "app/[locale]/(public)/layout.tsx",
];

describe("WiseTech PR2 source boundary", () => {
  it("does not import donor runtime modules or create another shell owner", () => {
    for (const file of implementationFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/WiseTechSite|FullInnerPages|ExpansionPages|\.graphify|YNWAforever\/wisetech/);
    }
  });

  it("does not expose donor-only five-group or retired paths", () => {
    const navigation = readFileSync(resolve(process.cwd(), "config/navigation.ts"), "utf8");
    for (const sourceOnly of [
      "/activities", "/members", "/solutions", "/programmes/", "/gba", "/insights",
      "events-activities", "members-solutions", "programmes-gba", "insights-about",
    ]) expect(navigation, sourceOnly).not.toContain(sourceOnly);
  });
});
```

- [ ] **Step 8: Run the complete shell-focused unit set**

Run:

```powershell
npm.cmd test -- tests/unit/navigation.test.ts tests/unit/messages.test.ts tests/unit/locale-switcher.test.tsx tests/unit/announcement.test.tsx tests/unit/dual-brand-lockup.test.tsx tests/unit/desktop-mega-navigation.test.tsx tests/unit/mobile-navigation.test.tsx tests/unit/public-shell.test.tsx tests/unit/public-landmark-contract.test.ts tests/unit/wisetech-shell-boundary.test.ts tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-asset-provenance.test.ts
```

Expected: PASS with no skipped tests.

- [ ] **Step 9: Commit the server-owned bilingual shell**

```powershell
git add messages/en.json messages/zh-HK.json components/layout/site-header.tsx components/layout/site-footer.tsx 'app/[locale]/(public)/layout.tsx' tests/unit/messages.test.ts tests/unit/public-shell.test.tsx tests/unit/wisetech-shell-boundary.test.ts
git commit -m "feat: compose the bilingual WiseTech public shell"
```

---

### Task 9: Browser accessibility, responsive behavior, and review screenshots

**Files:**
- Modify: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/public-shell.spec.ts`

**Interfaces:**
- Consumes: the real local or preview base URL, real server-rendered pages, Radix interactions, and axe.
- Produces: keyboard/focus, active-state, locale, 320–1440 width, open-menu axe, and screenshot evidence without request interception.

- [ ] **Step 1: Expand the accessibility route matrix and open-surface checks**

Replace `tests/e2e/accessibility.spec.ts` with:

```ts
import {AxeBuilder} from "@axe-core/playwright";
import {expect, test} from "@playwright/test";

const pages = [
  "/", "/events", "/membership", "/news", "/about",
  "/zh", "/zh/events", "/zh/membership", "/zh/news", "/zh/about",
];

async function expectNoSeriousOrCritical(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({page}).analyze();
  const violations = results.violations.filter(({impact}) => impact === "serious" || impact === "critical");
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

for (const path of pages) {
  test(`${path} has no serious or critical accessibility violations`, async ({page}) => {
    await page.goto(path);
    await expectNoSeriousOrCritical(page);
  });
}

test("open desktop and mobile navigation surfaces pass axe", async ({page}) => {
  await page.setViewportSize({width: 1120, height: 900});
  await page.goto("/");
  await page.getByRole("navigation", {name: "Primary navigation"}).getByRole("button").first().click();
  await expectNoSeriousOrCritical(page);

  await page.setViewportSize({width: 375, height: 800});
  await page.goto("/zh");
  await page.getByRole("button", {name: "開啟導覽選單"}).click();
  await page.getByRole("button", {name: "活動及計劃"}).click();
  await expectNoSeriousOrCritical(page);
});

test("skip link targets the sole main content landmark", async ({page}) => {
  await page.goto("/");
  const skipLink = page.locator("a.skip-link");
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator("main#main-content")).toHaveCount(1);
});
```

- [ ] **Step 2: Create end-to-end shell interaction and responsive evidence**

```ts
import {expect, test} from "@playwright/test";

test("desktop navigation supports trigger traversal, open, Escape, active state, and focus return", async ({page}, testInfo) => {
  await page.setViewportSize({width: 1120, height: 900});
  await page.goto("/events");
  const nav = page.getByRole("navigation", {name: "Primary navigation"});
  const triggers = nav.getByRole("button");
  await expect(triggers).toHaveCount(4);
  await expect(triggers).toHaveText([
    /Events & Programmes/, /Membership & Ecosystem/, /Impact & Insights/, /About WTIA/,
  ]);

  await triggers.nth(0).focus();
  await triggers.nth(0).press("ArrowRight");
  await expect(triggers.nth(1)).toBeFocused();
  await triggers.nth(1).press("End");
  await expect(triggers.nth(3)).toBeFocused();
  await triggers.nth(3).press("Home");
  await expect(triggers.nth(0)).toBeFocused();
  await triggers.nth(0).press("ArrowDown");
  await expect(page.getByRole("link", {name: "Events", exact: true}).first()).toBeVisible();
  await expect(page.getByRole("link", {name: "Events", exact: true}).first()).toHaveAttribute("aria-current", "page");
  await page.screenshot({path: testInfo.outputPath("desktop-events-menu.png"), fullPage: true});
  await page.keyboard.press("Escape");
  await expect(triggers.nth(0)).toBeFocused();
});

test("mobile Sheet traps focus, resets Accordion, closes on navigation, and restores the trigger", async ({page}, testInfo) => {
  await page.setViewportSize({width: 375, height: 800});
  await page.goto("/zh/events");
  const trigger = page.getByRole("button", {name: "開啟導覽選單"});
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await expect(dialog.getByRole("link", {name: "尋找活動"})).toHaveAttribute("href", "/zh/events");
  await expect(dialog.getByRole("link", {name: "加入 WiseTech"})).toHaveAttribute("href", "/zh/join");
  const group = dialog.getByRole("button", {name: "活動及計劃"});
  await group.click();
  await expect(dialog.getByRole("link", {name: "活動", exact: true})).toHaveAttribute("aria-current", "page");
  await page.screenshot({path: testInfo.outputPath("mobile-zh-navigation.png"), fullPage: true});
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("button", {name: "活動及計劃"})).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
});

test("captures all four open desktop menu shapes", async ({page}, testInfo) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.goto("/");
  const triggers = page.getByRole("navigation", {name: "Primary navigation"}).getByRole("button");
  const names = ["events-programmes", "membership-ecosystem", "impact-insights", "about-wtia"];
  for (let index = 0; index < names.length; index += 1) {
    await triggers.nth(index).click();
    await expect(triggers.nth(index)).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({path: testInfo.outputPath(`desktop-${names[index]}.png`), fullPage: true});
    await page.keyboard.press("Escape");
  }
});

for (const localeCase of [
  {path: "/", open: "Open navigation", group: "Events & Programmes", file: "mobile-en-navigation.png"},
  {path: "/zh", open: "開啟導覽選單", group: "活動及計劃", file: "mobile-zh-navigation-review.png"},
] as const) {
  test(`captures ${localeCase.path} mobile Sheet review evidence`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto(localeCase.path);
    await page.getByRole("button", {name: localeCase.open}).click();
    await page.getByRole("button", {name: localeCase.group}).click();
    await page.screenshot({path: testInfo.outputPath(localeCase.file), fullPage: true});
  });
}

for (const width of [320, 375, 768, 1120, 1440]) {
  for (const path of ["/", "/zh"]) {
    test(`${path} shell fits ${width}px and keeps 44px controls`, async ({page}) => {
      await page.setViewportSize({width, height: 900});
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      if (width < 1024) {
        const trigger = page.getByRole("button", {name: /open navigation|開啟導覽選單/i});
        const box = await trigger.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText(/Find an event|尋找活動/);
        const priorityActions = dialog.getByTestId("mobile-priority-actions").getByRole("link");
        for (let index = 0; index < await priorityActions.count(); index += 1) {
          const actionBox = await priorityActions.nth(index).boundingBox();
          expect(actionBox?.height).toBeGreaterThanOrEqual(44);
        }
        if (path === "/zh") {
          const groupButtons = dialog.getByRole("button", {expanded: false});
          for (let index = 0; index < await groupButtons.count(); index += 1) {
            expect(await groupButtons.nth(index).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
          }
        }
      } else {
        await expect(page.getByRole("navigation", {name: /Primary navigation|主要導覽/})).toBeVisible();
      }
    });
  }
}

test("locale switch preserves path, repeated query values, and fragment", async ({page}) => {
  await page.goto("/events?topic=ai&topic=cloud#main-content");
  await page.getByRole("button", {name: "Switch to Chinese"}).first().click();
  await expect(page).toHaveURL(/\/zh\/events\?topic=ai&topic=cloud#main-content$/);
  await page.setViewportSize({width: 1120, height: 900});
  await expect(page.getByRole("button", {name: "活動及計劃"})).toHaveAttribute("data-current", "true");
});

for (const [path, group] of [
  ["/events", "Events & Programmes"],
  ["/showcase", "Membership & Ecosystem"],
  ["/ai-ops", "Impact & Insights"],
  ["/about/history", "About WTIA"],
] as const) {
  test(`${path} marks ${group} as the active group`, async ({page}) => {
    await page.setViewportSize({width: 1120, height: 900});
    await page.goto(path);
    await expect(page.getByRole("button", {name: group})).toHaveAttribute("data-current", "true");
  });
}
```

- [ ] **Step 3: Run the browser suite against its actual base URL**

For the Playwright-managed local server:

Run: `npm.cmd run e2e -- tests/e2e/accessibility.spec.ts tests/e2e/public-shell.spec.ts`

Expected base URL: `http://localhost:3000` from `playwright.config.ts`; all tests pass without request interception. If `PLAYWRIGHT_BASE_URL` is explicitly supplied, record that exact URL in the PR evidence.

- [ ] **Step 4: Commit browser contracts**

```powershell
git add tests/e2e/accessibility.spec.ts tests/e2e/public-shell.spec.ts
git commit -m "test: verify PR2 shell journeys and accessibility"
```

---

### Task 10: Full regression, scope proof, and stacked draft PR

**Files:**
- Verify all PR2 files against base `bf5dbd9b8d5fb6ff141b7caef7772a7f34454646`.
- No production, deployment, database, provider, seed, or migration mutation.

**Interfaces:**
- Consumes: all preceding commits and local/browser evidence.
- Produces: a pushed `codex/wisetech-pr2-public-shell` branch and a stacked draft PR targeting `codex/wisetech-hkwtia-integration`.

- [ ] **Step 1: Run string, unit/integration, lint, type, and build gates**

```powershell
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected: every command exits 0. Report any environment-gated integration suite separately; do not reinterpret a skipped provider/database gate as passing.

- [ ] **Step 2: Run the complete browser gate and identify the base URL**

Run: `npm.cmd run e2e`

Expected: exit 0 against either Playwright's managed `http://localhost:3000` or the explicitly reported `PLAYWRIGHT_BASE_URL`.

- [ ] **Step 3: Prove the source scope and donor hash**

```powershell
$base = 'bf5dbd9b8d5fb6ff141b7caef7772a7f34454646'
$changed = @(git diff --name-only "$base...HEAD")
$forbidden = @($changed | Where-Object { $_ -match '^(lib/db/|lib/auth/|lib/billing/|lib/payments/|lib/stripe/|db/|drizzle/|app/api/|app/\[locale\]/\(admin\)/|app/\[locale\]/\(member\)/|app/\[locale\]/\(join\)/|scripts/.*seed|.*migration)' })
if ($forbidden.Count -gt 0) { $forbidden; throw 'PR2 changed a forbidden boundary' }
Get-FileHash -Algorithm SHA256 -LiteralPath 'public\images\wtia-logo.png'
git diff --check "$base...HEAD"
git status --short --branch
```

Expected: no forbidden paths, logo hash `4ABAB36F7D09F36F6D54165E9A8F4C719CAD5CAA7B6CBBCD5F2819F6180DEC51`, no whitespace errors, and a clean branch.

- [ ] **Step 4: Review the complete branch diff before publication**

Run:

```powershell
git diff --stat 'bf5dbd9b8d5fb6ff141b7caef7772a7f34454646...HEAD'
git log --oneline --decorate 'bf5dbd9b8d5fb6ff141b7caef7772a7f34454646..HEAD'
```

Expected: only the approved PR2 spec, shell/config/message/token/asset files, and focused tests appear; the commit series is reviewable and PR1 is the direct stack base.

- [ ] **Step 5: Push the branch and open the stacked draft PR**

```powershell
git push -u origin codex/wisetech-pr2-public-shell
gh pr create --repo YNWAforever/hkwtia --draft --base codex/wisetech-hkwtia-integration --head codex/wisetech-pr2-public-shell --title "feat: deliver WiseTech bilingual public shell" --body "## Summary`n- add one typed four-group bilingual navigation model for desktop, mobile, and footer`n- pin the user-authoritative WiseTech donor and verified WTIA logo without importing its runtime`n- preserve the sole public layout, Concierge, canonical routes, and protected boundaries`n`n## Verification`n- npm.cmd run audit:strings`n- npm.cmd test`n- npm.cmd run lint`n- npm.cmd run typecheck`n- npm.cmd run build`n- npm.cmd run e2e`n- git diff --check bf5dbd9b8d5fb6ff141b7caef7772a7f34454646...HEAD`n`n## External gates`n- stacked on draft PR #20 until PR1 merges`n- no merge, deployment, seeding, migration, provider, or production action performed"
```

Expected: GitHub returns a new draft PR URL whose base is `codex/wisetech-hkwtia-integration`.

- [ ] **Step 6: Record remote checks independently**

Run: `gh pr checks --repo YNWAforever/hkwtia <PR_NUMBER>`

Expected: report GitHub Actions, Vercel, and branch-protection state individually. A billing/spending-limit startup failure is an external gate, not source-test evidence; do not merge or deploy from this task.
