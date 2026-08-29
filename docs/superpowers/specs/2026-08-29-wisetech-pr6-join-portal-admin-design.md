# WiseTech PR6 Join, Portal and Admin Alignment Design

**Status:** proposed written design; implementation awaits explicit approval
**Date:** 2026-08-29
**Base:** PR5 head `3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`
**Target branch:** `codex/wisetech-pr6-join-portal-admin`

## Outcome

PR6 aligns the Join, member Portal, and staff Admin surfaces with the WiseTech visual system, closes the known public member-login and Portal sign-out gaps, and proves that the existing M1-M7 business contracts still hold. It is a presentation, routing, and regression slice over the current hkwtia authorities. It does not replace them.

The current Next.js App Router, `next-intl`, Neon Auth adapter, Stripe checkout/webhook services, Server Actions, repository authorization, audit writes, lifecycle rules, seat rules, CMS/CRM owners, automation controls, and Concierge runtime remain authoritative. The Site v13 repository is presentation evidence only: `https://github.com/YNWAforever/wisetech`, frozen by the existing reconciliation record at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`. PR6 imports no donor runtime, data, asset, router, authentication, or provider configuration.

## Evidence and authority

This design treats `WiseTech_Hong_Kong_hkwtia_Codex_Integration_Master_Plan.md` as product requirements and acceptance guidance, not as executable authority. Its Phase 5 requirements are the PR6 boundary: transactional/authenticated visual alignment without the marketing mega menu; revalidation of authentication, plan selection, onboarding, checkout/webhooks, Billing Portal, seats, CMS/CRM authorization and controls; an explicit member-login surface; a working Portal sign-out; and continued M1-M7 acceptance.

The exact PR6 checkout confirms:

- five Join routes under the transactional layout: `/join`, `/join/profile`, `/join/company`, `/join/checkout`, and `/join/complete`;
- ten Portal pages: dashboard, profile, company, company listing, seats, seat acceptance, directory, events, documents, and billing;
- twenty-six Admin pages covering dashboard, CRM, CMS, operations, approvals, reports, automation, listings, cohorts, and their detail views;
- separate Join, Portal, and Admin layouts that do not mount the public mega menu;
- an existing Neon `authClient.signOut()` capability but no operable Portal sign-out control;
- an auth-only magic-link branch inside the existing Join action, but no explicit `/member-login` route;
- a typed continuation list that omits several stable Portal destinations while the layout separately accepts any path beginning with `/portal`;
- a `CompleteApplicationResult` that already carries the paid membership ID and checkout command, while both form actions discard that handoff;
- a checkout page that safely authorizes the pending membership and application, but no production navigation currently reaches it from successful onboarding;
- a completion page that accepts only `pending_payment`, so the same owner-scoped membership becomes a 404 after the authoritative webhook activates it; and
- a Billing Portal return URL hard-coded to the English route.

The code knowledge graph was used to locate the owning functions and call paths. Its current index points to an older `scratch-m4b-safety` checkout, so every decision above was reconciled against the exact clean PR6 base named in this document.

## Scope

PR6 includes:

- a shared internal application-shell presentation system with distinct Join, Portal, and Admin variants;
- grouped, responsive, keyboard-operable Portal and Admin navigation with current-route semantics;
- one skip link and one `main#main-content` per transactional or authenticated page;
- an explicit localized `/member-login` page/action backed by the existing Neon magic-link path;
- a working Portal sign-out control backed by the existing Neon browser client;
- one typed authority for safe Portal authentication continuations;
- server-only membership-plan reconciliation for Join and Checkout, using the PR5 persisted catalog rules rather than creating another plan source;
- a complete typed onboarding handoff to profile, company, checkout, review, or completion;
- a webhook-authoritative completion read model and locale-correct Billing Portal return path;
- presentation-only alignment of all Portal and Admin page families through reusable internal primitives; and
- focused, repository-wide, credential-free browser, and separately gated isolated-authenticated M1-M7 regression evidence.

## Non-goals and prohibited work

PR6 does not:

- import the public `SiteHeader`, announcement bar, marketing mega menu, public footer, donor components, donor CSS/runtime, donor data, or donor assets into Join, Portal, or Admin;
- add a second identity store, session, callback handler, magic-link provider call path, password flow, or sign-out endpoint;
- change Neon Auth provider configuration, secrets, user identities, or production sessions;
- change Stripe webhook parsing, raw-body verification, signatures, event idempotency, membership activation authority, prices in a browser bundle, customer ownership, or provider configuration;
- create or execute a migration, seed/import, content migration, provider mutation, deployment, merge, or production action;
- change repository ownership, actor-first authorization, staff 404 behavior, audit transactionality, archive/publication locks, approval safety, segment/campaign idempotency, automation retry eligibility, cohort transitions, Showcase permissions, seat capacity/roles, or last-owner protection;
- invent a document CMS or static member resources when the approved-resource reader returns no records;
- add a multi-company domain model or silently claim full multi-company workflow support; PR6 tests the current authorized-company behavior and records multi-company selection as a separate product decision if more than one company is supplied;
- reintroduce `/portal/showcase`; `/portal/company/listing` remains canonical; or
- claim Preview/UAT, isolated provider, migration, production-content, production-performance, or production-release gates have passed without separate evidence.

## Architecture

```text
public header member link
  -> /[locale]/member-login
  -> existing rate-limited Neon magic-link action
  -> safe typed callback
  -> requested Portal page

Join CTA
  -> persisted membership_plans + canonical PLAN_CATALOG reconciliation
  -> existing actor-scoped application/profile/company services
  -> typed outcome router
     -> profile | company | checkout | review | complete
  -> existing Stripe checkout service
  -> existing signed/idempotent webhook
  -> server-authoritative completion projection

Portal/Admin Server Component layouts
  -> existing authorization boundary
  -> internal application-shell presentation
  -> existing pages/components
  -> existing Server Actions and repositories
```

Only Server Components, Server Actions, and server-only services may read repositories or provider configuration. Client Components receive labels, localized hrefs, active-route presentation data, and safe action results. They make no role, ownership, billing, publication, or lifecycle decision.

## Internal application shells

### Shared presentation primitives

PR6 introduces a small presentation-only family under `components/internal-shell`:

- `InternalAppShell` owns the skip link, header/sidebar or header/drawer frame, the sole `main#main-content`, width, spacing, and shell token classes;
- `InternalNavigation` owns grouped links, `aria-current="page"`, desktop navigation, a `Sheet`-based mobile drawer, Escape close, focus return, and 44 px targets;
- `InternalPageHeader`, `InternalSection`, `InternalStatusBadge`, `InternalTableFrame`, `InternalEmptyState`, and `InternalActionFeedback` normalize repeated markup without owning queries or mutations.

The primitives use the PR2 `--shell-*` token family and the existing `Button` and `Sheet` components. They preserve semantic headings, form labels, field names, hidden inputs, action bindings, URL query contracts, and table structure. Internal tables may scroll inside `InternalTableFrame`; the document itself must not overflow at 320 or 375 px.

Join keeps a compact transactional variant with WTIA home and Membership links. Portal and Admin use application variants. None imports a public navigation component. Reduced-motion and visible-focus behavior follows the established global token utilities.

### Portal navigation

The Portal's eight primary destinations remain:

- Dashboard: `/portal`
- Profile: `/portal/profile`
- Company: `/portal/company`
- Showcase listing: `/portal/company/listing`
- Directory: `/portal/directory`
- Events: `/portal/events`
- Documents: `/portal/documents`
- Billing: `/portal/billing`

Seats and seat acceptance remain contextual Company routes, not additional global navigation items. Exact matching marks Dashboard active only at `/portal`; descendants mark their most-specific primary owner. The canonical listing editor is tested positively and `/portal/showcase` negatively.

### Admin navigation

The Admin shell retains every current destination and groups its sixteen primary entries:

- Workspace: Dashboard, Members, At-risk, Segments
- Content: Announcements, News, Page Copy, Media, Partners, Landing Partners
- Operations: Events, Listings, Cohorts, Approvals, Reports, Automations

Detail pages inherit the active state of their owning list destination. The brand is not the only way to reach Dashboard. Group labels and every link label exist in English and Traditional Chinese. Navigation configuration is presentation data only; every Admin page and action keeps its existing independent authorization.

## Authentication and navigation

### One typed Portal continuation authority

PR6 replaces the split `requestedPath`, `buildPortalSignInPath`, and partial `joinContinuations` assumptions with one server-safe contract. It accepts only these stable, locale-neutral paths:

- `/portal`
- `/portal/profile`
- `/portal/company`
- `/portal/company/listing`
- `/portal/company/seats`
- `/portal/directory`
- `/portal/events`
- `/portal/documents`
- `/portal/billing`

The parser may normalize the exact `/zh` locale prefix, but rejects protocol-relative values, other origins, credentials, backslashes, control characters, duplicate/multi-valued input, unknown paths, query strings, and fragments. `/portal/company/seats/accept` is deliberately excluded from generic continuation because its one-time `token` belongs to the existing invitation magic-link callback. That dedicated callback remains separately tested; PR6 does not copy the token into a general login URL.

Portal layout unauthenticated handling builds `/member-login?next=<canonical-path>` through this contract. Missing request-path headers safely fall back to `/portal`. After authentication, only a member actor may enter the Portal layout; a staff actor does not acquire member access through presentation routing.

### Explicit member login

`/[locale]/member-login` is a localized, noindex page rendered in the transactional shell. With no `next`, it targets `/portal`. A supplied `next` must pass the continuation parser or the page fails closed with localized recovery navigation.

The page and Join flow call one shared `requestMagicLink` Server Action and the same `auth.signIn.magicLink` provider adapter. A narrow entry enum allows only `/join` or `/member-login` as the sent-state and callback page. The existing email validation, per-IP/per-address rate limit, preview-correct `APP_URL`, safe callback origin checks, localized error state, and no-plan auth-only behavior remain. No client calls Neon directly to request a link.

An already authenticated member is redirected to the validated continuation. An authenticated non-member receives an honest localized member-access state and no Portal data.

The public header consumes the single typed navigation owners in `config/navigation.ts`. PR6 changes `memberPortalAction` to `/member-login`, so desktop and mobile member entries cannot drift, and changes the generic `publicShellActions.join` destination from bare `/join` to `/membership`, where a visitor must choose an available catalog option. Protected Portal redirects use `/member-login`. Only reconciled catalog options create Join URLs: Community uses `/join?plan=community&interval=none`, the currently supported paid options use `/join?plan=<code>&interval=annual`, and Patron remains a Contact/review action.

### Portal sign-out

`PortalSignOutButton` is the only new auth Client Component. It calls the existing `authClient.signOut()` method, disables itself while pending, and reports a localized `role="alert"` failure without navigating or pretending the session ended. After a confirmed success it replaces history with the localized `/member-login` route and refreshes the router so authenticated Server Components are discarded.

The control appears in both desktop and mobile Portal navigation through one responsive navigation composition. It does not create a Server Action, API route, cookie mutation, cross-origin redirect, or second auth client. Admin sign-out is not added by implication; this PR's explicit requirement is the member Portal control.

## Membership catalog and Join flow

### One reconciled server authority

PR5 established `membershipPlansRepository`, `PLAN_CODES`, `PLAN_CATALOG`, persisted structural checks, and server-only Stripe price-ID reconciliation for the public Membership page. PR6 extracts the non-display reconciliation into one shared server-only catalog resolver and keeps `public-catalog.ts` as a formatter over that result.

The resolver makes billing interval part of plan identity. Free and review plans resolve to `billingInterval: "none"`. Each paid option is an inseparable tuple of canonical plan code, `billingInterval`, persisted amount, seat allowance, and validated server-side Stripe price reference. That tuple is never serialized with its price reference. A requested option is available only when exactly one persisted row matches its canonical plan definition and the selected interval has one exact configured Stripe mapping. Unknown, duplicated, inactive, malformed, or mismatched plans/options fail closed.

PR6 preserves the current source contract without inventing a provider mapping: the single `STRIPE_STARTUP_PRICE_ID` and `STRIPE_CORPORATE_PRICE_ID` mappings are actionable only as the existing annual option. `annualPriceHkd` may be displayed only when that exact reference reconciles. `monthlyPriceHkd` remains persisted but is omitted from the public catalog and rejected by Join because the current schema/configuration has no distinct monthly Stripe reference. Adding monthly checkout requires a separately approved catalog/configuration contract; PR6 does not infer one or add a migration. Isolated provider acceptance must confirm that each configured Price is annual before the gate can pass.

`getPlan` remains the pure domain-code validator. `joinInputSchema` and `completeApplicationSchema` add a typed `billingInterval`; the callback, profile route, company route, and bound Server Actions preserve it until membership creation. New applications require a reconciled `(planCode, billingInterval)` before any profile, company, membership, or checkout mutation. Membership creation writes `billingInterval` explicitly instead of relying on the database default: `none` for Community/Patron and the resolved interval for paid plans. Once a membership exists, its durable interval is authoritative and a conflicting or missing query cannot replace it. `MembershipRecord` and the owner-scoped Join projections include that field. No page imports Drizzle or reads environment values directly.

`createCheckoutSession` resolves price by the authorized membership's `(planCode, billingInterval)`, never by a query parameter or plan alone. The recovery path uses the same durable pair. Actor-first billing access, membership/application validation, row locking, active-attempt reuse, exact price reference stored on the attempt, idempotency key, opaque metadata, locale-aware success/cancel URLs, and the no-activation rule remain unchanged.

### Typed outcome navigation

The Join service returns a discriminated outcome with the identifiers required by its next route:

```ts
type JoinDraftContext = {
  plan: PlanCode;
  billingInterval: BillingInterval;
  applicationId: string;
};

type JoinOutcome =
  | (JoinDraftContext & {next: "profile" | "company"})
  | {next: "checkout" | "review" | "complete"; applicationId: string; membershipId: string};
```

`requestMagicLink`, `saveProfile`, `saveCompany`, and resumed `/join` processing pass validated draft context or durable membership outcome to one destination builder:

- profile/company -> localized step route with plan, billing interval, and actor-scoped application ID;
- checkout -> localized `/join/checkout?membership_id=<opaque-id>`; and
- review/complete -> localized `/join/complete?membership_id=<opaque-id>`.

Before membership creation, a missing, duplicated, or unsupported interval fails closed and returns to Membership recovery. After membership creation, checkout and completion derive interval only from the actor-scoped membership. No `next=checkout`, `status=active`, billing-interval query, success flag, or Stripe session query is trusted as durable state. A terminal application whose actor-scoped membership cannot be resolved fails closed instead of rendering a dead status card.

### Completion projection and Billing Portal locale

The current pending-only loader becomes an owner-scoped Join membership-state reader. It verifies member actor, membership, linked application, plan equality, and compatible durable statuses before returning a display projection. `/join/checkout` still accepts only `pending_payment`. `/join/complete` may display:

- processing for authoritative `pending_payment`;
- review for authoritative `pending_review`; or
- active for authoritative `active`.

The Stripe `session_id` and any success/cancel query never activate or choose the rendered state. Webhook processing remains the only Stripe activation authority. Missing, mismatched, cancelled, expired, or unauthorized records remain a 404 or an existing localized recovery state; errors expose no membership or provider details.

`createBillingPortalSession` accepts the already-validated `AppLocale` and builds its return URL with `localizedPath(locale, "/portal/billing")`. The Portal billing action passes that locale while preserving current ownership and recoverable-status checks.

## Portal page alignment

All ten Portal pages adopt the internal shell and shared primitives while retaining their owners:

- dashboard/profile/company use `getDashboard` and existing profile/company actions;
- company listing remains `/portal/company/listing` with existing manager/member permissions;
- seats keep capacity, role, invitation, revoke, and last-owner rules;
- directory keeps actor-scoped search, cursor pagination, and query semantics;
- events keep member eligibility and existing registration action;
- documents render only the approved-resource reader's results, including an honest empty state; and
- billing keeps owner/admin filtering, checkout recovery, Billing Portal ownership, and receipt safety.

PR6 does not choose an arbitrary new company context model. Existing one-company acceptance is exercised explicitly. If an isolated fixture returns multiple authorized companies, pages must not expose another company's private data; a full selector and cross-page context contract require separate product approval.

The existing Concierge remains mounted once by the Portal layout. Shell work does not create another assistant or lead flow.

## Admin page alignment and invariant freeze

All twenty-six Admin pages retain `requireAdminPageActor()` at the layout/page boundary and their actions retain independent `requireAdminActor()` calls before parsing or repository access. Presentation extraction must not move authorization into a Client Component or rely on hidden fields for access control.

The aligned page families are:

- CRM: dashboard, Member 360, notes, segments/results/export, at-risk, and campaign queueing;
- CMS: announcements, News, Page Copy, Media, Partners, and Landing Partners;
- Operations: Events, Showcase review, cohorts/Kanban, approvals, reports, Board draft preview, and automations.

The regression freeze explicitly retains:

- same-transaction audits for lifecycle and staff mutations;
- publication/archive locks, active media reference locks, partner relationship/rights evidence, bilingual News publication, and approved Page Copy leaves;
- sanitized approval and retention previews, already-decided handling, fixed/neutralized CSV export, consent/suppression filtering, frozen campaign recipients, and URL-bound idempotency;
- safe-code-only automation display, eligible-failure-only retry, and retry audit;
- inert escaped Board drafts with no send/publish control;
- rejection reasons for Showcase review; and
- legal cohort transitions with stage-change audit.

Dashboard/read failures continue to degrade independently where existing owners provide that behavior. A visual error state is never permission to bypass authorization or substitute static data.

## Accessibility, localization, and responsive behavior

Every new label and state is present in `messages/en.json` and `messages/zh-HK.json`. Route paths remain locale-correct. Locale switching retains the current pathname, serialized query, and hash under the existing safe locale-switcher contract.

Acceptance requires:

- exactly one visible H1 and one `main` landmark per page;
- a keyboard-visible skip link targeting `#main-content`;
- `aria-current="page"` on the most-specific active primary destination;
- named navigation landmarks and grouped navigation semantics;
- 44 px minimum interactive targets, visible focus, reduced-motion support, and no keyboard traps;
- mobile drawer Escape close and focus restoration;
- live/alert semantics for action feedback without color-only meaning;
- no document-level horizontal overflow or Concierge/navigation/control overlap at 320, 375, 768, 1024, and 1280 px;
- serious/critical Axe findings equal to zero on representative English and Chinese Join, Portal, CRM, CMS, reports, and automation surfaces that the test environment can authorize; and
- on an authorized Preview, Lighthouse meets at least 0.90 performance, 0.95 accessibility, and 0.95 SEO, with LCP at most 2.5 s, CLS at most 0.1, and INP at most 200 ms at the 75th percentile; otherwise this is recorded as `NOT PASSED`.

## Error and recovery behavior

- Invalid or unavailable plans return localized Membership recovery and perform no Join mutation.
- Invalid login continuations do not call Neon and do not fall back to an attacker-controlled path.
- Magic-link rate-limit/provider failures remain localized and reveal no identity existence.
- Sign-out failure leaves the current authenticated page intact and exposes a retryable localized error.
- Checkout membership/application/catalog mismatches fail before Stripe is called.
- Checkout provider failures use existing sanitized localized recovery; they never alter membership status.
- Completion is derived only from actor-scoped durable records and never from a success query.
- Portal/Admin authorization denial preserves the existing redirect or 404 contract; degraded reads expose no private fallback.
- Empty documents, reports, CMS lists, or operational queues render honest empty states without synthetic rows.

## Test design

Every behavioral task begins with a focused failing test, records the exact RED command and cause, applies the smallest production change, and records GREEN before refactoring. Presentation-only mechanical adoption still requires a source or rendering contract before bulk page edits.

### Static and unit contracts

- exact Join, ten-page Portal, twenty-six-page Admin, eight-item Portal-nav, and sixteen-item grouped Admin-nav inventories;
- no donor runtime/public mega-menu imports in Join, Portal, or Admin;
- one main/skip target, active-route specificity, label parity, focus and 44 px contracts;
- continuation allowlist normalization and rejection, including negative `/portal/showcase`, unknown Portal prefixes, query/fragment, cross-locale, CRLF, backslash, and external-origin cases;
- `/member-login` default/explicit continuation, sent state, already-member redirect, non-member state, rate limiting, and one Neon action path;
- sign-out pending, single invocation, success navigation/refresh, and failure-without-navigation;
- one public navigation contract proving both desktop and mobile member entry -> `/member-login`, generic Join -> `/membership`, and each catalog option -> its exact plan/interval URL;
- shared catalog reconciliation for public and transactional consumers, no secret/browser serialization, unavailable-option no-mutation, monthly omission without a distinct mapping, and an advertised-option -> typed Join input -> persisted membership interval -> exact `(planCode, billingInterval)` checkout-price contract;
- typed Join outcomes and direct profile/company/checkout/review/complete destinations, including resume and durable-interval precedence;
- checkout/completion actor scope, webhook-authoritative processing-to-active behavior, and forged-success rejection;
- English/Chinese checkout URLs and Billing Portal return URLs;
- a route-level seat-invitation callback test proving the Neon callback preserves the one-time token, the accept route delegates only for the invited identity, replay/expiry/revocation fail, and the token is never copied into generic `/member-login?next=` continuation; and
- existing seat capacity/roles/last-owner, billing ownership/idempotency, Portal permission, Admin authorization, audit, lifecycle, approval, segment, report, automation, M5, M6, and M7 suites unchanged and passing.

### Credential-free browser contracts

- English and Chinese `/member-login` render below 400, noindex, submit validation without provider calls, and preserve only safe navigation;
- anonymous access to every stable Portal destination reaches localized member login with the correct canonical path; Admin denial remains 404;
- Join invalid-plan and forged-completion paths fail closed;
- pure/internal shell harnesses prove desktop/mobile grouping, active route, skip link, keyboard drawer behavior, focus return, one H1/main, and document overflow constraints without authenticating or mutating data;
- the seat-invitation route harness uses a mocked Neon send and disposable service fixtures to prove exact callback/token handoff without sending mail or touching a provider;
- representative empty/error states remain honest and usable; and
- no browser test sends a real magic link, creates a real checkout, invokes Stripe/Neon/Resend/WOZTELL, mutates a database, or accepts a live invitation unless isolated credentials and explicit authority are supplied.

### Isolated authenticated M1-M7 acceptance

On an explicitly isolated Neon branch with test identities and test-mode providers, run:

- M1: advertised billing option and interval selection, magic-link redirect, profile/company onboarding, persisted interval, exact Stripe Price handoff, signed webhook activation, completion, Billing Portal locale, receipts, seat invitation callback/acceptance, seat limits, Portal secondary pages, and sign-out;
- M2: Member 360, note, segment/CSV/campaign idempotency, at-risk, event check-in, approval audit, reports, and denial across the complete Admin inventory and protected APIs;
- M3: automation data plus one eligible audited retry, with sent/ineligible rows denied;
- M4: retention approvals and inert Board draft preview in both locales;
- M5: canonical Portal listing manager/member permissions and staff review/rejection reason;
- M6: legal cohort transitions and stage audit; and
- M7: bilingual News, Page Copy, and Media lifecycle/reference-lock journeys.

These tests must use disposable fixtures and deterministic cleanup. Missing credentials, provider setup, or isolated infrastructure is `NOT PASSED`, never a skip converted into acceptance.

### Repository-wide verification

Before PR publication, run and record:

- focused RED/GREEN commands for every behavior task;
- the exact PR6 cross-surface unit aggregate;
- `npm.cmd ci`;
- `npm.cmd run audit:strings`;
- `npm.cmd test`;
- `npm.cmd run lint`;
- `npm.cmd run typecheck`;
- `npm.cmd run build`;
- the focused credential-free PR6 Playwright command;
- `npm.cmd run test:e2e` for the full repository browser gate;
- isolated authenticated M1-M7 tests only when their explicit gate is available;
- representative accessibility/responsive checks;
- `npm.cmd run test:lighthouse`;
- `npm.cmd audit --omit=dev --audit-level=high`;
- `git diff --check`; and
- exact committed-range and clean-worktree checks.

Record command, timestamp, exit code, totals, warnings, skips, and environment blockers. A local build or Vercel source Preview does not prove provider, migration, UAT, or production readiness.

## Delivery and rollback

PR6 is stacked on PR5 and remains independently reviewable. Its commits should be sliced by behavioral owner: contract freeze; shell primitives; login/continuation/sign-out; catalog/Join handoff; checkout/completion/billing locale; Portal alignment; Admin alignment; browser/M1-M7 regression; final evidence. Each implementation task receives an immutable base/head review package and a fresh independent review with zero Critical, Important, or Minor findings before the next task begins.

Rollback is source-only: revert PR6 commits to return to the verified PR5 head. Because PR6 adds no schema, migration, data import, provider configuration, or production mutation, rollback requires no data reversal. Any external Preview or isolated-test artifacts are reported separately and are not part of source completion.

## External gates

The following remain `NOT PASSED` until separately authorized and evidenced:

- isolated Neon branch and test identities;
- test-mode Stripe, Neon Auth, email, WOZTELL, Cloudflare job, and storage/provider setup;
- migration/rollback execution, even though PR6 proposes no migration;
- authenticated Preview/UAT and named staff acceptance;
- approved production content, translations, partner/media rights, and document resources;
- Preview accessibility, Lighthouse/performance, visual, and security review;
- GitHub branch protection/required checks beyond observed PR checks;
- production approval, merge, deployment, scheduled-job ownership, observation, and rollback rehearsal.

## Approval gate

Approval of this document authorizes writing the detailed PR6 implementation plan only. It does not authorize implementation, provider calls, database work, migration/seed/import, Preview mutation, merge, deployment, or production activity. The exact next approval phrase is:

`Approve PR6 written spec`
