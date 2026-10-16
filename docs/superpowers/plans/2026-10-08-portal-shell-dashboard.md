# Member Portal Shell, Dashboard and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the member portal the public site's WiseTech shell and a dashboard that shows one clear next step, without changing any data, query or permission.

**Architecture:** A new `PortalShell` + client `PortalNavigation` replace the layout's `InternalAppShell`/`PortalNav`; the dashboard page is recomposed from four small Server Components fed by the existing `getDashboard()` view model, with the next-step choice isolated in a pure function. Styling lives in a new portal-only stylesheet that reuses the public tokens; the portal layout also starts loading the three public stylesheets.

**Tech Stack:** Next.js 16 App Router (webpack), React 19, TypeScript strict, next-intl v4, Tailwind v3 + the WiseTech CSS layer, Vitest + Testing Library, Playwright + @axe-core/playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-portal-shell-dashboard-design.md`

## Global Constraints

- No change to any query, repository, authorization check, redirect or migration (spec: Constraints).
- Every visible string in `messages/en.json` **and** `messages/zh-HK.json`, same keys; `npm run audit:strings` must pass. The `Portal` namespace is outside `page-copy-scope`'s pinned count (`tests/unit/page-copy-scope.test.ts:44`), so no count changes.
- Never hand-build a locale prefix: links go through `@/i18n/navigation` `Link` / `ActionLink` / `InnerCardGrid` (all locale-aware) or `localizedPath`.
- Exactly one `main#main-content` and one skip link on every portal page (`tests/unit/internal-shell-landmark-contract.test.ts`).
- Kept as-is: `robots: {index: false, follow: false}`, the unauthenticated → `/member-login?next=…` and admin → `/admin` redirects in both `layout.tsx` and `page.tsx`, the `ConciergeWidget`.
- Server Components by default; only `portal-navigation.tsx` is `'use client'`.
- Files kebab-case. Comments explain *why* (match the repo's density).
- Do not touch admin, `InternalAppShell`'s own files, or the content of the 13 non-dashboard portal pages except to fix breakage found in Task 6.
- Dates render in the member's locale with `Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"})`.

## Review Focus

- **`cancel_at_period_end` with onboarding incomplete** — not a "needs action" status, so the onboarding step must show (test in Task 2).
- **`billingPeriodEnd` null** — the date field is omitted, never "Invalid Date" or empty (test in Task 4).
- **A member with no company** (`companies` empty, `companyComplete: false`) — welcome band shows no company line, next step is the company step, glance still renders (tests in Tasks 2 and 4).
- **`seatLimit` of 0** — shown as "0 seats", not dropped as falsy (test in Task 4).
- **Phone menu after navigation** — tapping a link closes the panel; Escape closes and returns focus to the Menu button (test in Task 3).

---

### Task 1: Group the portal navigation config and add Seats

**Files:**
- Modify: `config/internal-navigation.ts:7-23`
- Modify: `messages/en.json`, `messages/zh-HK.json` (`Portal`)
- Modify: `components/portal/portal-nav.tsx` (label map only, so it still type-checks until Task 3 removes it)
- Test: `tests/unit/portal-navigation-config.test.ts` (create)

**Interfaces:**
- Produces: `portalNavigationGroups` with three groups in this order — `{id: "me", links: dashboard, profile}`, `{id: "company", links: company, showcase-listing, seats}`, `{id: "benefits", links: events, directory, tools, documents, billing}`; new link `{id: "seats", href: "/portal/company/seats"}`. Message keys `Portal.navGroups.me|company|benefits`. The Seats label reuses the existing `Portal.seats.title`.

- [ ] **Step 1: Write the failing test** — `portal navigation groups`: `portalNavigationGroups.map(g => g.id)` equals `["me","company","benefits"]`; the flattened link ids equal `["dashboard","profile","company","showcase-listing","seats","events","directory","tools","documents","billing"]`; the seats href is `"/portal/company/seats"`; both bundles have non-empty `Portal.navGroups.me`, `.company`, `.benefits`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-navigation-config.test.ts` — Expected: FAIL (ids are `["primary"]`).
- [ ] **Step 3: Implement** the three groups (keep the D-2 comment beside `tools`) and the copy — en `"me": "Me"`, `"company": "My company"`, `"benefits": "Membership benefits"`; zh-HK `"me": "我的帳戶"`, `"company": "我的公司"`, `"benefits": "會員權益"`. Add `seats: "seats.title"` to `linkLabelKeys` in `components/portal/portal-nav.tsx`.
- [ ] **Step 4: Run** the new test and `npx vitest run tests/unit/portal-nav.test.tsx` — Expected: PASS after updating that file's "9 primary nav links" case to 10.
- [ ] **Step 5: Commit** — `feat(portal): group the member navigation and give Seats its own entry`

### Task 2: `pickNextStep` — the dashboard's single next step

**Files:**
- Create: `lib/portal/next-step.ts`
- Test: `tests/unit/portal-next-step.test.ts`

**Interfaces:**
- Consumes: `DashboardViewModel` from `lib/portal/queries.ts`.
- Produces:
  ```ts
  export type PortalNextStep =
    | {kind: "billing"; reason: "past_due" | "pending_payment"}
    | {kind: "review"}
    | {kind: "onboarding"; step: "profile" | "company"}
    | null;
  export function pickNextStep(vm: Pick<DashboardViewModel, "primaryStatus" | "onboarding">): PortalNextStep;
  ```

- [ ] **Step 1: Write the failing test** — a table over all five statuses × `onboarding.nextAction` ∈ {`complete-profile`, `complete-company`, `none`}: `past_due` / `pending_payment` → `{kind: "billing", reason: <status>}` whatever the onboarding; `pending_review` → `{kind: "review"}`; `active` and `cancel_at_period_end` → `{kind: "onboarding", step: "profile"}`, `{kind: "onboarding", step: "company"}`, `null` respectively (15 rows; covers Review Focus 1, and the no-company member through `complete-company`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-next-step.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `pickNextStep` — membership status first, then `onboarding.nextAction`.
- [ ] **Step 4: Run** — Expected: 15 passed.
- [ ] **Step 5: Commit** — `feat(portal): choose one dashboard next step from membership and onboarding state`

### Task 3: Portal shell and navigation

**Files:**
- Create: `components/portal/portal-shell.tsx`, `components/portal/portal-navigation.tsx`, `app/styles/wisetech-portal.css`
- Modify: `app/[locale]/(member)/portal/layout.tsx`, `components/layout/dual-brand-lockup.tsx` (export its labels type), `messages/en.json`, `messages/zh-HK.json`
- Delete: `components/portal/portal-nav.tsx`, `tests/unit/portal-nav.test.tsx` (its cases move to the new test)
- Test: `tests/unit/portal-navigation.test.tsx` (create); keep green: `internal-shell-landmark-contract`, `portal-layout-admin-redirect`, `portal-admin-redirect`, `portal-continuation`

**Interfaces:**
- Consumes: `portalNavigationGroups` (Task 1); `DualBrandLockup` (labels `{homeLabel, publicName, descriptor, logoAlt}` from the `Navigation` namespace, built as in `components/layout/site-header.tsx:46-51`); `LocaleSwitcher({locale, className})`; `PortalSignOutButton({label, errorLabel})`; `Sheet` / `SheetTrigger` / `SheetContent` from `@/components/ui/sheet` (Radix: focus trap, Escape, focus return); `findCurrentLink(groups, currentPath)` from `components/internal-shell/navigation.tsx`.
- Produces:
  ```ts
  export type DualBrandLockupLabels = {homeLabel: string; publicName: string; descriptor: string; logoAlt: string};
  export type PortalNavGroup = Readonly<{id: string; label: string; links: readonly Readonly<{id: string; href: string; label: string}>[]}>;
  export type PortalShellLabels = Readonly<{portalLabel: string; backToSite: string; signOut: string; signOutError: string}>;
  export function PortalNavigation(props: Readonly<{groups: readonly PortalNavGroup[]; labels: Readonly<{navigationLabel: string; openMenu: string; closeMenu: string}>}>): JSX.Element;
  export function PortalShell(props: Readonly<{locale: AppLocale; skipLabel: string; brand: DualBrandLockupLabels; labels: PortalShellLabels; navigation: ReactNode; children: ReactNode}>): JSX.Element;
  ```
  Group hrefs are already localized by the layout (`localizedPath`), as the old `PortalNav` did.

- [ ] **Step 1: Write the failing tests** (`portal-navigation.test.tsx`, with the `next-intl` provider and `usePathname` mock the old `portal-nav.test.tsx` used):
  - three groups render with the `Portal.navGroups` copy, in order, holding 10 links;
  - at `/portal/company/listing` Showcase listing has `aria-current="page"` and Dashboard does not; at `/portal/company/seats` Seats is current, not Company;
  - phone: the "Open menu" button opens a dialog containing the links; Escape closes it and focus is back on the button; clicking a link inside closes it (Review Focus 5);
  - `PortalShell` renders exactly one `main#main-content`, one skip link to `#main-content`, the "Member portal" label, a "Back to public site" link to `/`, and one sign-out button.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-navigation.test.tsx` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement**
  - `PortalNavigation`: desktop `<nav aria-label>` with each group as a labelled list; phone `Sheet` (side `left`) with the same lists and `onNavigate` closing it — the structure of `InternalNavigation`, with WiseTech class names (`portal-nav`, `portal-nav-group`, `portal-nav-link`) and the current link from `findCurrentLink`.
  - `PortalShell`: skip link first; `header.portal-header` with `DualBrandLockup`, the `portalLabel`, `LocaleSwitcher`, a `Link` to `/` (`backToSite`), `PortalSignOutButton`; `div.portal-frame` = navigation + `main#main-content`.
  - Layout: import `wisetech.css`, `wisetech-shell.css`, `wisetech-experience.css`, then `wisetech-portal.css` (the order of `app/[locale]/(public)/layout.tsx:23-29`, portal last); replace `InternalAppShell` + `PortalNav` with `PortalShell` + `PortalNavigation`, groups built from `portalNavigationGroups` with `Portal.navGroups.*` and the existing link labels; add the `Navigation` namespace to the translations it loads. Every redirect, `metadata`, `NextIntlClientProvider` and `ConciergeWidget` stays as it is.
  - Copy: `Portal.shell.portalLabel` "Member portal" / "會員專區"; `Portal.shell.backToSite` "Back to public site" / "返回主網站". The Menu button reuses `Common.openMenu` / `Common.closeMenu`.
  - `wisetech-portal.css` (shell only): ≥1121px `.portal-frame { grid-template-columns: 260px minmax(0, 1fr) }`, nav column `position: sticky; top: 0`; current link marked by a 2px left rule in `--wt-blue`; group labels at the 11px uppercase `status-label` scale; ≤1120px the nav column is hidden and the Menu button shown; links `min-height: 44px`; `--wt-*` / `--xp-*` tokens only.
- [ ] **Step 4: Run** the new test and the four keep-green tests — Expected: PASS.
- [ ] **Step 5: Run** `npm run typecheck && npm run audit:strings` — Expected: clean.
- [ ] **Step 6: Commit** — `feat(portal): WiseTech member shell with grouped navigation`

### Task 4: Dashboard components

**Files:**
- Create: `components/portal/dashboard/welcome-band.tsx`, `next-step.tsx`, `membership-glance.tsx`, `benefit-cards.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json` (`Portal.nextStep`, `Portal.onboardingSteps`, `Portal.glance`, `Portal.benefits`), `app/styles/wisetech-portal.css`
- Test: `tests/unit/portal-dashboard-components.test.tsx`

**Interfaces:**
- Consumes: `PortalNextStep` (Task 2); `StatusLabel`, `ActionLink`, `InnerCardGrid` / `InnerCardGridItem`.
- Produces (all take translated strings; none calls `getTranslations`):
  ```ts
  WelcomeBand(props: {greeting: string; companyName?: string; planLabel: string; statusLabel: string})
  NextStep(props: {label: string; title: string; body: string; action?: {href: string; label: string}; progress?: {summary: string; steps: readonly {label: string; done: boolean}[]}})
  MembershipGlance(props: {locale: AppLocale; planLabel: string; periodEnd: Date | null; endsAtPeriodEnd: boolean; seatsValue: string; labels: {title: string; plan: string; renews: string; ends: string; seats: string; manageSeats: string}})
  BenefitCards(props: {title: string; items: readonly InnerCardGridItem[]; actionLabel: string})
  ```

- [ ] **Step 1: Write the failing tests:**
  - `MembershipGlance` with `periodEnd: null` renders the plan and seats and no date term (Review Focus 2); with a date and `endsAtPeriodEnd: true` renders the `ends` label and the long-form date; with `seatsValue: "0 seats"` renders it (Review Focus 4, formatted by the page from `seatLimit` with ICU plural); the seats row links to `/portal/company/seats`.
  - `WelcomeBand` without `companyName` renders no company element (Review Focus 3).
  - `NextStep` without `action` renders no link; with a two-step `progress` (`Profile` done, `Company` not) renders an `ol` of two items, the first marked done, the list labelled by `summary`, and one link.
  - `BenefitCards` with the three items renders links to `/portal/events`, `/portal/directory`, `/portal/tools`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-dashboard-components.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the four components. `NextStep` uses the `honest-empty` ink grammar (`div.honest-empty`, `StatusLabel`, `h2`, `p`, `div.open-now-actions`); the progress strip is `ol.portal-steps`. Copy (en / zh-HK):
  - `nextStep.label` — "Your next step" / "下一步"
  - `nextStep.past_due` — "Update your payment details" / "請更新付款資料"; "Your last payment did not go through. Update billing to keep your membership active." / "上次付款未能完成。請更新付款資料，以保持會籍有效。"; action "Go to billing" / "前往帳單"
  - `nextStep.pending_payment` — "Complete your payment" / "完成付款"; "Your membership activates once payment is complete." / "完成付款後，會籍即會生效。"; action "Go to billing" / "前往帳單"
  - `nextStep.pending_review` — "Your application is under review" / "你的申請正在審核"; "WTIA will contact you when the review is complete." / "審核完成後，WTIA 會與你聯絡。"
  - `nextStep.profile` — "Complete your profile" / "完善個人資料"; "Add your role and contact preferences so WTIA can reach you." / "加上職銜及聯絡偏好，方便 WTIA 與你聯絡。"; action "Open profile" / "前往個人資料"
  - `nextStep.company` — "Add your company details" / "填寫公司資料"; "Your company details are used for your membership, seats and showcase listing." / "公司資料會用於會籍、名額及展示頁。"; action "Open company" / "前往公司資料"
  - `onboardingSteps.profile` "Profile" / "個人資料"; `onboardingSteps.company` "Company" / "公司"
  - `glance` — title "Membership at a glance" / "會籍概覽"; plan "Plan" / "計劃"; renews "Renews on" / "續期日"; ends "Ends on" / "結束日"; seats "Seats" / "名額"; seatsValue "{count, plural, one {# seat} other {# seats}}" / "{count} 個名額"; manageSeats "Manage seats" / "管理名額"
  - `benefits` — title "Your benefits" / "你的會員權益"; action "Open" / "前往"; events "Events" / "活動" — "Register for WTIA events and manage your registrations." / "報名 WTIA 活動及管理報名。"; directory "Member directory" / "會員名錄" — "Find and contact other WTIA members." / "搜尋及聯絡其他 WTIA 會員。"; tools "Member tools" / "會員工具" — "Use the tools included with your membership." / "使用會籍包括的工具。"

  Portal CSS: welcome heading at the inner-page scale (serif `clamp(36px, 4vw, 56px)`); glance as a three-column `dl` (one column ≤520px); steps strip with a done tick.
- [ ] **Step 4: Run** — Expected: PASS; `npm run audit:strings` clean.
- [ ] **Step 5: Commit** — `feat(portal): dashboard welcome, next step, membership glance and benefit cards`

### Task 5: Recompose the dashboard page

**Files:**
- Modify: `app/[locale]/(member)/portal/page.tsx`
- Delete: `components/portal/status-card.tsx` and its cases in `tests/unit/portal-presentational.test.tsx` (keep the plan-label cases)
- Test: `tests/unit/portal-dashboard-page.test.tsx` (create; mock `getActor` and `getDashboard` the way `tests/unit/portal-admin-redirect.test.tsx` mocks them)

**Interfaces:**
- Consumes: Tasks 2 and 4; `getDashboard`, `getActor`, `isAdminActor` unchanged.

- [ ] **Step 1: Write the failing tests:**
  - an `active` member, `nextAction: "complete-company"`, no companies → one `h1` (the greeting), the company next step linking to `/portal/company`, the glance, three benefit links, and no status-card markup;
  - `past_due` → the billing next step linking to `/portal/billing`, no onboarding step;
  - `getDashboard` rejecting with `MEMBERSHIP_INACTIVE` → an `inner-honest` block with the existing `membershipUnavailableTitle`, the sign-out button and a link to `/membership`;
  - the existing anonymous and admin redirect tests stay green.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-dashboard-page.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** — in order: `WelcomeBand` (existing `Portal.welcome` as the page's single `h1`; company = `companies[0]?.displayName`; plan from `Portal.plans`, status from `Portal.status.<status>.label`); `NextStep` when `pickNextStep` is non-null (progress only for `onboarding`, from `onboarding.profileComplete` / `companyComplete`, summary = existing `Portal.onboardingProgress`); `MembershipGlance` from `memberships[0]` (`seatsValue` = `t("glance.seatsValue", {count: seatLimit})`); `BenefitCards`. The inactive branch is `HonestEmpty variant="inner"` beside the existing sign-out button and membership-options link. Before removing message keys the page no longer reads (`dashboardTitle`, `onboarding`, `nextAction`, `profileTitle`, `profileDescription`), grep for other readers and keep any key still used.
- [ ] **Step 4: Run** the new test, `portal-presentational`, `portal-admin-redirect`, `portal-layout-admin-redirect` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(portal): dashboard leads with one next step`

### Task 6: Visual verification and the thirteen-page sweep

**Files:**
- Create: `tests/e2e/portal-experience.spec.ts`, `tests/e2e/fixtures/portal-render.tsx` (renders a portal page through the shell to HTML with `renderToStaticMarkup`, mocked actor and mocked `lib/portal/queries`)
- Modify: `app/styles/wisetech-portal.css` (fixes only)

**Interfaces:**
- Consumes: all of the above; stylesheets read the way `tests/e2e/experience-rhythm.spec.ts:9-12` reads them, plus `wisetech-portal.css`.

- [ ] **Step 1: Write the spec** — the dashboard in four states (new member: `pending_review` + `complete-profile`; onboarding incomplete: `active` + `complete-company`; `past_due`; all done: `active` + `none`) at 1440×900 and 390×844, plus the opened phone menu. Each asserts `scrollWidth <= innerWidth`, no visible text under 11px, every link and button at least 24×24, and axe (`wcag2a`, `wcag2aa`, `wcag21aa`) with no critical or serious violation; screenshots to `test-results/portal/`.
- [ ] **Step 2: Run** `PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/portal-experience.spec.ts --project=chromium` — Expected: PASS (fix CSS until it does).
- [ ] **Step 3: Sweep** — render each of the other thirteen pages (`profile`, `company`, `company/listing`, `company/seats`, `company/seats/accept`, `directory`, `documents`, `events`, `events/new`, `events/[id]/edit`, `tools`, `tools/[key]`, `billing`) at both widths, screenshot, and review every image. Fix in `wisetech-portal.css` what the global public rules broke — expected: in-text links that relied on the browser underline (`wisetech.css:21` sets `a { text-decoration: none }`). Add a no-horizontal-scroll assertion per page.
- [ ] **Step 4: Commit** — `test(portal): visual and accessibility checks for the member shell and dashboard`

### Task 7: Gates and pull request

- [ ] **Step 1: Run** `npm run typecheck && npm run lint && npm run audit:strings && npx vitest run && npm run build` — Expected: clean (lint 0 errors). Restore `next-env.d.ts` and the CRLF-only email snapshot before staging; stage files explicitly.
- [ ] **Step 2: Open the PR**, with the owner walk-through as a checklist in the body (signed in on the real system, desktop and phone): dashboard first view; follow the next step to profile, then company; phone menu open, Escape, navigate; language switch on a portal page; back to public site; sign out.
- [ ] **Step 3:** Do not promote to production until the owner has completed the checklist.
