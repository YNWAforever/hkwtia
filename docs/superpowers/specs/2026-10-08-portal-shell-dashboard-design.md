# Member portal — shell, dashboard and onboarding (sub-project 1 of 4)

Date: 2026-10-08 · Status: design approved in conversation, awaiting written-spec review

## Purpose

The public site has been through sixteen experience rounds to an award-grade standard; the member
portal has had none. A member who signs in leaves the WiseTech design for a generic shell — a "WTIA"
text link and nine flat links, Tailwind `glass-card` panels, emerald/amber status tints — and lands on
a dashboard that does not say what to do next. This phase brings the member side to the same standard.

**Success** (owner, 2026-10-08): the portal is recognisably the same brand as the public site, **and**
the main journeys are smooth — first view after sign-in, finishing onboarding, registering for and
creating events, managing company details, listing and seats.

## Programme decomposition

Fourteen portal pages are too many for one spec. Each sub-project gets its own spec → plan → PR:

1. **Shell, dashboard and onboarding** — the first impression. *This document.*
2. Forms: profile, company, showcase listing, seats.
3. Events (list, new, edit) and the directory.
4. Documents, tools, billing.

## Constraints

- **The agent cannot sign in.** Member sign-in is hosted Neon Auth, and the agent must not enter
  passwords on an external identity provider. Verification is by rendering real components with mock
  data (below) plus an owner walk-through on the real system before promotion (owner-approved).
- **No data or authorization change.** Every query, repository and permission check stays as it is;
  this is presentation and flow only. No migrations.
- **Admin is out of scope.** `InternalAppShell` is consumed only by the portal layout
  (`app/[locale]/(member)/portal/layout.tsx`); admin is untouched.
- **Every visible string** goes into `messages/en.json` and `messages/zh-HK.json` in parity.
- Server Components by default; `'use client'` only for the navigation's interactive behaviour.

## Design

### 1. Shell and navigation

- **Header:** the public site's `DualBrandLockup` with a "Member portal" label; on the right the
  language switch, a link back to the public site, and sign-out. No public mega-menu — this is a
  workspace, not marketing navigation.
- **Navigation in three groups** (new group labels in both locales):
  - *Me* — Dashboard, Profile
  - *My company* — Company, Showcase listing, **Seats** (today reachable only from the company page;
    promoted to its own entry — the only change to the nav's contents)
  - *Membership benefits* — Events, Directory, Tools, Documents, Billing
- **≥1121px:** a fixed left column; the current page marked with the public nav's left accent rule.
- **≤1120px:** a "Menu" button opening a full-screen panel with the public mobile menu's behaviour —
  focus trapped while open, Escape closes and returns focus, navigating closes it.
- **Kept exactly:** the skip link, the single `main#main-content`, `robots: noindex`, the
  unauthenticated → `/member-login?next=…` and admin → `/admin` redirects, the Concierge widget.

### 2. Dashboard and onboarding

Top to bottom:

1. **Welcome band** — inner-page header scale: "Welcome back, {name}" (serif), the company display
   name, the plan, and the membership status as a `status-label` (replacing the tinted card).
2. **Your next step** — at most one, chosen by priority:
   1. membership needs action: `past_due` / `pending_payment` → Billing; `pending_review` → a
      "WTIA will contact you" note with no button;
   2. onboarding incomplete → the profile step, then the company step;
   3. otherwise the block is not rendered.

   Rendered as the public `honest-empty` ink block: title, one line, one button. Onboarding adds a
   two-segment progress strip naming the steps ("Profile ✓ · Company") in place of
   "1 of 2 steps complete".
3. **Membership at a glance** — a three-field record row: plan; renewal date from
   `billingPeriodEnd`, read as "Ends on …" when `cancelAtPeriodEnd`; seats ("{seatLimit} seats",
   linking to seat management). A field with no value is omitted, never shown empty or guessed.
4. **Your benefits** — three `inner-card`s linking to Events, Directory and Tools in the portal.
   Replaces today's link-less "My profile" text card.
5. **Inactive membership** (`MEMBERSHIP_INACTIVE`) — the `honest-empty` block, keeping sign-out and
   "View membership options".

All data comes from `getDashboard()` as it is today (`profile`, `memberships`, `companies`,
`primaryStatus`, `onboarding`). Copy reuses `Portal.status.*` and `Portal.actions.*`; new keys cover
the next-step titles and lines, "Membership at a glance" and its field labels, the three benefit
cards, the progress-strip step names, the nav group labels, the "Member portal" label, the
"Back to public site" link and the phone "Menu" button.

### 3. Components and styling

| Unit | Responsibility | Depends on |
|---|---|---|
| `components/portal/portal-shell.tsx` | Brand header, navigation slot, skip link, the single `main#main-content` — replaces the layout's `InternalAppShell` use | `DualBrandLockup`, `PortalNavigation` |
| `components/portal/portal-navigation.tsx` (`'use client'`) | Three groups, current-page marker, phone menu panel (focus trap, Escape, close on navigate) | `config/internal-navigation.ts` (gains groups and Seats), `usePathname` |
| `components/portal/dashboard/welcome-band.tsx` | Greeting, company, plan, status label | `StatusLabel` |
| `lib/portal/next-step.ts` → `pickNextStep(vm)` | **Pure** choice of the one next step from a `DashboardViewModel` | — |
| `components/portal/dashboard/next-step.tsx` | Renders the chosen step and the onboarding strip | `ActionLink` |
| `components/portal/dashboard/membership-glance.tsx` | Plan / renewal-or-end date / seats, omitting empty fields | — |
| `components/portal/dashboard/benefit-cards.tsx` | Three benefit cards | `InnerCardGrid` |

`components/portal/status-card.tsx` is deleted once nothing imports it. `InternalAppShell` itself is
left in place (its own tests still run); the portal simply stops using it.

**Styling.** A new `app/styles/wisetech-portal.css`, imported only by the portal layout, holds the
shell and dashboard rules and uses the public tokens (`--wt-*`, `--xp-*`). The portal layout also
imports `wisetech.css`, `wisetech-shell.css` and `wisetech-experience.css`, which it loads none of
today. Public pages are unaffected: they never import the portal stylesheet.

**Known effect on the other thirteen pages.** The public stylesheets carry unscoped element rules —
`a { text-decoration: none }`, serif `h1`/`h2` with tight tracking, base `body` size and line-height
(`wisetech.css:20-28, 512-513, 633`). These will also restyle the thirteen pages that sub-projects
2–4 have not reached yet. Accepted (owner, 2026-10-08) as consistent with the brand goal, on the
condition that every portal page is screenshotted at 1440 and 390 with mock data and anything broken
— most likely links that relied on the browser underline — is fixed before merge.

**Rollback.** Removing the portal layout's stylesheet imports and restoring `InternalAppShell`
returns the portal to its current presentation; no data is involved.

## Verification

**Unit (Vitest):**
- `pickNextStep` over all five `PortalMembershipStatus` values × three onboarding states
  (`complete-profile`, `complete-company`, `none`), asserting the priority order above.
- `MembershipGlance`: omits a missing `billingPeriodEnd`; shows "Ends on" when `cancelAtPeriodEnd`.
- Navigation: three groups in order, Seats present, current-page marker, phone panel Escape and focus
  return. `tests/unit/portal-nav.test.tsx` is updated to the new structure.
- Unchanged and still green: `internal-shell-landmark-contract`, `portal-layout-admin-redirect`,
  `portal-admin-redirect`, `portal-continuation`.

**Visual (Playwright, `tests/e2e/portal-experience.spec.ts`)** — no server, database or session.
The pages are rendered to HTML with `renderToStaticMarkup` against a mocked actor and mocked
`lib/portal/queries` results (the pattern the existing `tests/unit/*-page.test.tsx` files use), and
that HTML is loaded with the real stylesheets, as `experience-rhythm.spec.ts` loads hand-written
markup:
- dashboard in four states — new member, onboarding incomplete, `past_due`, all done — at 1440 and
  390, plus the phone navigation panel;
- each asserts no horizontal scroll, no text under 11px, targets ≥ 24px, and axe with no critical or
  serious violation;
- one screenshot of each of the other thirteen portal pages at both widths, reviewed by eye.

**Existing e2e** (`portal-dashboard.spec.ts` and the other portal specs) needs a database and a
session; it runs where that environment exists and must stay green. Assertions bound to the old
markup are updated in the same PR.

**Gates before merge:** typecheck, lint, `audit:strings`, full unit suite, build, the new spec.

**Owner walk-through before promotion** (signed in on the real system, desktop and phone): dashboard
→ next step → profile → company; menu open/close on phone; language switch; sign-out. The PR will
carry this as a checklist.

## Out of scope

The content of the other thirteen pages (sub-projects 2–4); data, query, authorization or migration
changes; the admin surface; new portal features.
