# WiseTech PR6 Join, Portal and Admin Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Join, the member Portal, and staff Admin with the WiseTech internal application-shell system while preserving every existing hkwtia authority and closing the member-login, sign-out, billing-interval, onboarding-handoff, completion-state, and locale-return gaps.

**Architecture:** One server-only membership catalog reconciles persisted plan rows, canonical plan metadata, billing interval, and configured Stripe Price IDs. Join returns a discriminated, actor-scoped outcome; member authentication uses one typed Portal-continuation authority; checkout and completion derive state from the durable membership. Shared internal-shell primitives provide responsive navigation and presentation only, while existing Server Components, Server Actions, repositories, authorization, audit, lifecycle, seat, CMS, CRM, automation, and Concierge owners remain in place.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.8, React 19, next-intl 4, Neon Auth, Stripe, Drizzle ORM/Postgres, Zod, Radix Sheet/Dialog, Tailwind CSS, Vitest, Testing Library, Playwright, Axe, Lighthouse CI.

## Global Constraints

- Work from PR6 branch `codex/wisetech-pr6-join-portal-admin` at approved-spec commit `8c83969e9f2244dadf8f9c9e3bc4d4431320c94a`, stacked on PR5 head `3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`.
- Treat `https://github.com/YNWAforever/wisetech` at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, as presentation evidence only. Import no donor runtime, router, data, content, asset, authentication, or provider configuration.
- Add no schema, migration, production seed/import, provider configuration, production session, deployment, merge, or production action. Code for disposable test-fixture reset/insert and test-provider verification may be added only behind the exact isolated-acceptance guards in Tasks 4, 9, 10, and 12; running any such mutation or provider call requires a separate recorded approval and is not authorized by approval of this plan.
- Preserve the existing Next.js App Router, next-intl locale mapping (`en` and `zh-HK` at `/zh`), Neon Auth adapter, Stripe signed/idempotent webhook authority, Server Actions, repository authorization, same-transaction audits, lifecycle rules, seat rules, CMS/CRM owners, automation controls, and Concierge runtime.
- Only Server Components, Server Actions, and `server-only` services may read repositories or provider configuration. Client Components receive localized labels, safe hrefs, presentation state, and sanitized action results.
- Billing interval is part of plan identity. Community and Patron use `none`. Startup and Corporate expose only `annual` in PR6. Reject `monthly` until a distinct approved Stripe mapping exists.
- Persist `billingInterval` explicitly on membership creation. Once a membership exists, its stored `planCode` and `billingInterval` override missing or conflicting query input.
- Keep `/portal/company/listing` canonical and reject `/portal/showcase`. Keep invitation acceptance at `/portal/company/seats/accept?token=opaque-token` and never copy the token into generic member-login continuation.
- Join, Portal, and Admin never import the public `SiteHeader`, announcement bar, mega menu, or public footer. The Portal continues to mount exactly one Concierge widget.
- Every behavior task in Tasks 1-11 starts with a focused failing test, records the exact RED cause, makes the smallest production change, records GREEN, refactors, and commits only its explicit paths. Task 12 adds verification harnesses and aggregate evidence only: it must not manufacture a RED result; any newly exposed behavior failure returns to its owning task for a reviewed fix.
- Every new English label/state has a Traditional Chinese peer. New controls are keyboard reachable, visibly focused, at least 44 px, reduced-motion safe, and do not rely on color alone.
- Each numbered task is implemented by one fresh implementer, receives an immutable base/head review package, and reaches zero Critical, Important, and Minor findings before the next task starts.
- Preserve unrelated work. Stage explicit paths only; never use `git add -A`. Every PowerShell staging command uses single-quoted `:(literal)` Git pathspecs so `[locale]` and route-group parentheses are never interpreted by PowerShell or Git glob matching.

## File Structure

- Create `lib/membership/catalog.ts`: the only server-side reconciliation of persisted plans, canonical metadata, billing interval, and configured Stripe Price IDs.
- Modify `lib/membership/constants.ts` and `lib/membership/lifecycle.ts`: canonical billing-interval type and durable membership projection.
- Modify `lib/membership/public-catalog.ts`, the Membership page, and `TierComparison`: display-safe catalog formatting with exact plan/interval actions and no price-reference serialization.
- Modify Join schemas, navigation, services, actions, and five Join pages: validated draft context, durable terminal outcomes, direct checkout/review/complete routing, and no dead status card.
- Create `/[locale]/member-login` and `PortalSignOutButton`; modify Portal auth routing and public member-entry configuration: one rate-limited Neon magic-link path and one operable client sign-out.
- Modify checkout, billing-attempt locking, Join state reading, completion, and Portal billing: exact durable plan/interval price selection, webhook-authoritative display, and locale-correct Billing Portal return.
- Add route-level seat invitation tests around the existing page actions and seat repository service; do not create another invitation service or auth callback.
- Create `config/internal-navigation.ts` and focused components under `components/internal-shell`: presentation-only shell, grouped responsive navigation, page header, section, status, table, empty, and action-feedback primitives.
- Modify the Join and Portal layouts/pages, then the Admin layout/pages in CRM, CMS, and Operations slices. Pages keep their current readers, actions, authorization, audit, and lifecycle owners.
- Create credential-free and authenticated PR6 browser matrices plus `docs/integration/wisetech-pr6-verification.md`; replace M1's unconditional live skip, harden M2 mutation authority, add an isolated M7 CMS journey, and extend existing focused suites without weakening M1-M7 gates.

---

### Task 1: Establish the authoritative billing-interval catalog and exact public actions

**Files:**

- Create: `lib/membership/catalog.ts`, `tests/unit/membership-catalog.test.ts`.
- Modify: `lib/membership/constants.ts`, `lib/membership/public-catalog.ts`, `app/[locale]/(public)/membership/page.tsx`, `components/marketing/tier-comparison.tsx`, `config/navigation.ts`.
- Modify tests: `tests/unit/membership-public-catalog.test.ts`, `tests/unit/membership-page-catalog.test.tsx`, `tests/unit/membership-links.test.tsx`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`, `tests/e2e/public-shell.spec.ts`.

**Interfaces:**

- Consumes: `membershipPlansRepository.list()`, `PLAN_CATALOG`, `STRIPE_STARTUP_PRICE_ID`, and `STRIPE_CORPORATE_PRICE_ID`.
- Produces:

    export const BILLING_INTERVALS = ["annual", "monthly", "none"] as const;
    export type BillingInterval = (typeof BILLING_INTERVALS)[number];
    export type MembershipSelection = Readonly<{
      plan: PlanCode;
      billingInterval: BillingInterval;
    }>;
    export type ResolvedMembershipOption = Readonly<{
      planCode: PlanCode;
      billingInterval: BillingInterval;
      billingBehavior: "free" | "checkout" | "review";
      seatAllowance: number;
      amountHkd: number | null;
      stripePriceReference: string | null;
    }>;
    export type MembershipPriceIds = Readonly<{
      startup: string;
      corporate: string;
    }>;
    export type MembershipCatalogDependencies = Readonly<{
      plans: Readonly<{
        list(): Promise<readonly PersistedMembershipPlan[]>;
      }>;
      loadPriceIds(): MembershipPriceIds;
    }>;
    export function configuredMembershipPriceIds(
      environment?: NodeJS.ProcessEnv,
    ): MembershipPriceIds;
    export function reconcileMembershipOptions(input: Readonly<{
      rows: readonly PersistedMembershipPlan[];
      priceIds: MembershipPriceIds;
    }>): readonly ResolvedMembershipOption[];
    export async function resolveMembershipOption(
      selection: MembershipSelection,
      dependencies?: MembershipCatalogDependencies,
    ): Promise<ResolvedMembershipOption | null>;

- Invariant: `ResolvedMembershipOption` remains server-only. Public catalog DTOs never contain `stripePriceReference` or environment values.

- [ ] **Step 1: Write the failing domain, formatter, and public-action tests**

    In `tests/unit/membership-catalog.test.ts`, create exact fixtures for the four canonical rows and assert:

    import {describe, expect, it} from "vitest";
    import {
      reconcileMembershipOptions,
      resolveMembershipOption,
    } from "@/lib/membership/catalog";

    it("resolves only none, annual, annual, none in canonical order", () => {
      const options = reconcileMembershipOptions({rows: canonicalRows, priceIds});
      expect(options.map(({planCode, billingInterval}) => [planCode, billingInterval])).toEqual([
        ["community", "none"],
        ["startup", "annual"],
        ["corporate", "annual"],
        ["patron", "none"],
      ]);
      expect(options.some(({billingInterval}) => billingInterval === "monthly")).toBe(false);
    });

    it("rejects monthly even when a monthly amount exists without a distinct mapping", async () => {
      await expect(resolveMembershipOption(
        {plan: "startup", billingInterval: "monthly"},
        catalogDependencies(canonicalRows, priceIds),
      )).resolves.toBeNull();
    });

    it("fails closed for duplicate, inactive, malformed, or mismatched rows", () => {
      expect(reconcileMembershipOptions({
        rows: [canonicalRows[0], canonicalRows[1], canonicalRows[1]],
        priceIds,
      }).map(({planCode}) => planCode)).toEqual(["community"]);
    });

    Update the public-catalog tests to require:

    expect(catalog(canonicalRows)).toMatchObject([
      {code: "community", cta: {href: "/join?plan=community&interval=none"}},
      {code: "startup", price: {kind: "paid", options: [{cadence: "annual"}]},
        cta: {href: "/join?plan=startup&interval=annual"}},
      {code: "corporate", cta: {href: "/join?plan=corporate&interval=annual"}},
      {code: "patron", cta: {href: "/contact", kind: "contact"}},
    ]);
    expect(JSON.stringify(catalog(canonicalRows))).not.toContain("price_startup");
    expect(JSON.stringify(catalog(canonicalRows))).not.toContain("stripePriceReference");

    Inject `{plans, loadPriceIds}` into `resolveMembershipOption` tests. Require `plans.list()` and `loadPriceIds()` exactly once, prove the supplied IDs—not ambient `process.env`—drive reconciliation, and prove a rejected repository promise propagates rather than becoming `null`. Add direct `configuredMembershipPriceIds(environment)` cases for trimming only `STRIPE_STARTUP_PRICE_ID` and `STRIPE_CORPORATE_PRICE_ID`.

    Update navigation expectations so `publicShellActions.join.href` is `/membership` while `memberPortalAction` remains `/portal` until Task 3.

    Update `membership-links.test.tsx` at the same RED boundary: its `MembershipTier[]` fixtures expose Community `none`, Startup/Corporate `annual`, no paid monthly option, and exact `/join?plan=community&interval=none`, `/join?plan=startup&interval=annual`, and `/join?plan=corporate&interval=annual` hrefs. Update `public-shell.spec.ts` so the Chinese generic Join action renders `/zh/membership`, clicking it finishes on `/zh/membership`, and the plan-specific membership cards still own the interval-bearing `/zh/join?...` entry points.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx

    Expected: FAIL because the billing-interval domain and shared resolver do not exist, paid monthly is still advertised in both catalog and direct TierComparison fixtures, catalog hrefs omit `interval`, and the generic Join shell/browser action still targets bare `/join`.

    Run:

    npm.cmd run test:e2e -- tests/e2e/public-shell.spec.ts

    Expected: FAIL because the newly written Chinese browser contract expects the generic action at `/zh/membership`, while the current shell still renders/navigates to `/zh/join`. Record that exact assertion as browser RED before changing navigation.

- [ ] **Step 3: Implement the server-only resolver and display-safe formatter**

    Add the billing interval constants to `lib/membership/constants.ts` and implement `lib/membership/catalog.ts` with `import "server-only"`. The reconciliation order is `PLAN_CODES`. Each plan must have exactly one persisted row whose audience, billing behavior, seat allowance, active flag, and integer price fields match the canonical contract.

    Apply these exact option rules:

    - Community: `billingInterval: "none"`, `amountHkd: 0`, `stripePriceReference: null`, and both persisted price fields null or zero.
    - Patron: `billingInterval: "none"`, `amountHkd: null`, `stripePriceReference: null`, and no Join CTA from the public card.
    - Startup/Corporate: `billingInterval: "annual"` only; annual amount is a positive Postgres integer; configured ID is non-empty after trimming; a persisted reference is either null or exactly the configured ID; optional monthly amount is structurally valid but is not emitted.
    - Any unknown, duplicate, inactive, malformed, or mismatched row is unavailable. Never infer a monthly mapping from the annual ID.

    Define the default `MembershipCatalogDependencies` exactly as `{plans: membershipPlansRepository, loadPriceIds: () => configuredMembershipPriceIds(process.env)}`. The async resolver calls `plans.list()` and `loadPriceIds()` once each, passes both results to `reconcileMembershipOptions`, and reads no other environment field. Return `null` on an unavailable selection; do not catch repository or price-loader errors into a valid option.

    Make `buildPublicMembershipCatalog` accept reconciled options rather than independently reconciling rows. Format amounts by locale and omit `stripePriceReference`. Set exact CTAs:

    const joinHref = {
      community: "/join?plan=community&interval=none",
      startup: "/join?plan=startup&interval=annual",
      corporate: "/join?plan=corporate&interval=annual",
    } as const;

    Keep Patron at `/contact`. Render only the emitted annual paid option in `TierComparison`. Change `publicShellActions.join.href` to `/membership`.

- [ ] **Step 4: Run GREEN, perform the secret-serialization check, and refactor**

    Run:

    npm.cmd test -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx

    Expected: PASS. Public markup and the direct TierComparison contract contain exact plan/interval hrefs, no monthly label for paid tiers, and no configured Stripe identifier.

    Run:

    npm.cmd run test:e2e -- tests/e2e/public-shell.spec.ts

    Expected: PASS with the generic Chinese Join action rendering and navigating to `/zh/membership`; plan-specific cards remain the only interval-bearing Join entry points.

    Run:

    rg -n "STRIPE_(SECRET|STARTUP_PRICE_ID|CORPORATE_PRICE_ID)|stripePriceReference" app components

    Expected: no new client or rendered-page secret/reference access. Server page imports only the server-only catalog loader/formatter.

- [ ] **Step 5: Commit the catalog slice**

    git add -- ':(literal)lib/membership/constants.ts' ':(literal)lib/membership/catalog.ts' ':(literal)lib/membership/public-catalog.ts' ':(literal)app/[locale]/(public)/membership/page.tsx' ':(literal)components/marketing/tier-comparison.tsx' ':(literal)config/navigation.ts' ':(literal)tests/unit/membership-catalog.test.ts' ':(literal)tests/unit/membership-public-catalog.test.ts' ':(literal)tests/unit/membership-page-catalog.test.tsx' ':(literal)tests/unit/membership-links.test.tsx' ':(literal)tests/unit/navigation.test.ts' ':(literal)tests/unit/mobile-navigation.test.tsx' ':(literal)tests/e2e/public-shell.spec.ts'
    git commit -m "feat: reconcile membership billing options"

### Task 2: Carry typed Join context into durable membership outcomes

**Files:**

- Modify: `lib/membership/join-schema.ts`, `lib/membership/join-navigation.ts`, `lib/membership/onboarding.ts`, `lib/membership/join-service.ts`, `lib/membership/lifecycle.ts`, `lib/db/repos/memberships.ts`.
- Modify: `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`.
- Modify tests: `tests/unit/join-schema.test.ts`, `tests/unit/join-navigation.test.ts`, `tests/unit/join-service.test.ts`, `tests/unit/join-service-review.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/join-actions-profile-identity.test.ts`, `tests/unit/join-page.test.tsx`, `tests/unit/profile-identity-billing.test.ts`, `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/portal-content-scope.test.ts`, `tests/unit/repository-production-security.test.ts`, `tests/e2e/join-auth.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: `resolveMembershipOption(selection)` from Task 1 and existing actor-scoped applications, profiles, companies, memberships, and journey enrollment.
- Produces:

    export type JoinEntry = "join" | "member-login";
    export type JoinDraftContext = Readonly<{
      plan: PlanCode;
      billingInterval: BillingInterval;
      applicationId: string;
    }>;
    export type JoinOutcome =
      | (JoinDraftContext & {next: "profile" | "company"})
      | Readonly<{
          next: "checkout" | "review" | "complete";
          applicationId: string;
          membershipId: string;
        }>;
    export type JoinSubmissionReadDependencies = Readonly<{
      applications: Readonly<{
        getById(actor: Actor, applicationId: string): Promise<JoinApplication | null>;
      }>;
      memberships: Readonly<{
        getByApplicationId(
          actor: Actor,
          applicationId: string,
        ): Promise<JoinMembership | null>;
      }>;
      resolveOption(
        selection: MembershipSelection,
      ): Promise<ResolvedMembershipOption | null>;
    }>;
    export type PreparedJoinSubmission =
      | Readonly<{
          kind: "terminal";
          outcome: Extract<JoinOutcome, {next: "checkout" | "review" | "complete"}>;
        }>
      | Readonly<{
          kind: "draft";
          applicationId: string | null;
          option: ResolvedMembershipOption;
        }>;
    export async function prepareJoinSubmission(
      actor: Extract<Actor, {kind: "member"}>,
      rawInput: unknown,
      dependencies?: JoinSubmissionReadDependencies,
    ): Promise<PreparedJoinSubmission>;

    export const PORTAL_CONTINUATIONS = [
      "/portal",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/company/seats",
      "/portal/directory",
      "/portal/events",
      "/portal/documents",
      "/portal/billing",
    ] as const;
    export type PortalContinuation = (typeof PORTAL_CONTINUATIONS)[number];
    export function parsePortalContinuation(
      value: unknown,
      locale?: AppLocale,
    ): PortalContinuation | null;
    export function destinationForJoin(locale: AppLocale, outcome: JoinOutcome): string;

- `MembershipRecord` and `JoinMembership` gain required `billingInterval: BillingInterval`.

- [ ] **Step 1: Write failing schema, service, outcome, and route-handoff tests**

    Add these cases to the focused suites:

    expect(joinInputSchema.parse({
      plan: "startup",
      billingInterval: "annual",
      applicationId: null,
    })).toEqual({
      plan: "startup",
      billingInterval: "annual",
      applicationId: null,
    });
    expect(joinInputSchema.safeParse({
      plan: "startup",
      billingInterval: ["annual", "monthly"],
    }).success).toBe(false);

    const first = await completeApplication(member, {
      plan: "startup",
      billingInterval: "annual",
      profile,
      company,
    }, dependencies);
    expect(first).toMatchObject({
      next: "checkout",
      applicationId: expect.any(String),
      membershipId: expect.any(String),
    });
    expect(dependencies.inspect().memberships.values().next().value)
      .toMatchObject({planCode: "startup", billingInterval: "annual"});

    expect(destinationForJoin("zh-HK", {
      next: "company",
      plan: "startup",
      billingInterval: "annual",
      applicationId: "application-a",
    })).toBe("/zh/join/company?plan=startup&interval=annual&application=application-a");
    expect(destinationForJoin("en", {
      next: "checkout",
      applicationId: "application-a",
      membershipId: "membership-a",
    })).toBe("/join/checkout?membership_id=membership-a");

    Add resume tests proving:

    - a terminal application returns its actor-scoped membership ID;
    - a terminal application with no actor-scoped membership throws `MEMBERSHIP_NOT_FOUND`;
    - a stored annual membership remains annual when the query interval is missing or says monthly;
    - an unavailable or missing interval performs no profile, company, application, membership, or provider mutation;
    - Community persists `none` and routes to complete; Patron persists `none` and routes to review.

    In `join-actions.test.ts` and `join-actions-profile-identity.test.ts`, invoke the real bound `saveProfile` and `saveCompany` actions with a `resolveOption` fake that returns `null` and one that rejects. Assert zero calls to profile upsert, company upsert, application create/update, membership create/update, journey enrollment, and every provider seam. Add a terminal-resume case proving the durable membership outcome redirects before profile/company mutation and a terminal application without its actor-scoped membership fails before mutation.

    At the same action boundary, call `requestMagicLink` with syntactically valid `{plan: "startup", billingInterval: "annual"}` while mocked `resolveMembershipOption` returns `null` and while it rejects. Both cases return the same localized unavailable response and call neither `checkAuthSend`, `auth.signIn.magicLink`, nor any repository/provider seam. A valid resolved option calls the resolver once and builds the callback from `option.planCode`/`option.billingInterval`, not the raw selection. The `entry: "member-login"` plus null-selection branch never calls the catalog and continues to use only the validated Portal continuation. Assert no `ResolvedMembershipOption` or `stripePriceReference` is serialized into form state, bound arguments, markup, or callback URLs.

    Move `join-auth.spec.ts` into this task's ownership. Change valid Startup URLs at its current entry/resume/sign-in cases to `/join?plan=startup&interval=annual`; use `interval=none` for Community; add missing, `monthly`, unknown, and multi-valued interval cases that show localized fail-closed recovery and intercept zero magic-link/provider/database mutation requests.

    Change the Server Action expectation after `saveCompany` from the dead status-card `/join` loop to:

    expect(redirectState.url)
      .toBe("/join/checkout?membership_id=membership-a");

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: FAIL because Join input has no interval, membership creation relies on the database default, terminal resume has no membership ID, actions can write profile/company or send/count a magic link before discovering an unavailable option, and actions discard `CompleteApplicationResult`.

    Run:

    npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts

    Expected: FAIL because the newly written valid journeys require explicit `annual`/`none` context and the new missing, monthly, unknown, and multi-valued interval cases expect fail-closed recovery, while the current browser flow still accepts plan-only/invalid interval input. Record the exact URL/assertion failures as browser RED.

- [ ] **Step 3: Implement the final Join types and service ordering**

    Add `billingIntervalSchema = z.enum(BILLING_INTERVALS)`. Accept a scalar interval; arrays, unknown values, and duplicate query values fail closed. Implement `prepareJoinSubmission` as a read-only server preflight with exact defaults `{applications: applicationsRepository, memberships: membershipsRepository, resolveOption: resolveMembershipOption}`: parse scalar plan/interval/application ID; when resuming, load the actor-scoped application and its membership first; let a valid durable terminal membership win over missing or conflicting query interval; throw `MEMBERSHIP_NOT_FOUND` when the application claims terminal state without that membership; and only for a new/nonterminal draft call `resolveOption` exactly once. A missing, monthly, unknown, or unavailable selection returns/throws before any write. The prepared option is created only on the server and is never accepted from form data or a Client Component.

    Split the mutation phase into internal `continuePreparedJoin(actor, preparedDraft, dependencies)` and `completePreparedApplication(actor, preparedDraft, input, dependencies)` seams. `startJoin` keeps its anonymous no-write draft-ID result; for a member it composes the same preflight with `continuePreparedJoin`. Neither prepared seam re-reads environment nor re-resolves the option. This makes the exact order:

    1. Parse scalar plan, interval, and optional application ID.
    2. If resuming, require a member, load the actor-scoped application, and verify plan equality.
    3. Load `memberships.getByApplicationId(actor, application.id)`. When present, derive terminal outcome from its durable status and ID without replacing its interval from query input.
    4. If the application claims a terminal status but no membership exists, throw `MEMBERSHIP_NOT_FOUND`.
    5. Resolve the requested plan/interval into `PreparedJoinSubmission.kind === "draft"`; no mutation has occurred.
    6. Only a server-produced prepared draft may reach profile, company, application, membership, or journey writes.

    `completePreparedApplication` checks again for an existing actor-scoped membership before creating one and consumes the already prepared option rather than accepting query interval as authority. For a new membership, create with:

    {
      applicationId: application.id,
      ownerUserId: companyId ? null : actor.profileId,
      companyId,
      planCode: option.planCode,
      billingInterval: option.billingInterval,
      status: option.billingBehavior === "free"
        ? "active"
        : option.billingBehavior === "review"
          ? "pending_review"
          : "pending_payment",
      seatLimit: option.seatAllowance,
    }

    Add `billingInterval` to `MembershipInput` and the lifecycle projection. Do not modify `lib/db/schema-core.ts` or add a migration; the column and enum already exist.

    Replace status-only `destinationForJoin` results with one href for every outcome. Profile/company hrefs carry plan, interval, and application. Checkout/review/complete hrefs carry only the opaque membership ID.

    Change `requestMagicLink` to its final bound signature:

    export async function requestMagicLink(
      locale: AppLocale,
      entry: JoinEntry,
      selection: MembershipSelection | null,
      continuation: PortalContinuation | null,
      state: JoinFormState,
      formData: FormData,
    ): Promise<JoinFormState>

    For `entry: "join"`, keep `MembershipSelection` as the client-safe bound input but call server-only `resolveMembershipOption(selection)` inside the action after syntactic/email validation and before `checkAuthSend` or `auth.signIn.magicLink`. On `null` or rejection, return the same localized unavailable response with zero limiter, database, or provider calls. On success, build the callback only from the returned `option.planCode` and `option.billingInterval`; never bind or serialize `ResolvedMembershipOption`. Task 3 consumes the `entry: "member-login"` branch with a required null selection; that branch validates only `PortalContinuation` and does not touch the catalog.

    Make `saveProfile` and `saveCompany` bind the interval, validate form shape, require the member actor, and call `prepareJoinSubmission` before their existing profile/company write. A terminal preparation redirects immediately. Only a draft preparation may write the profile/company and then call the matching prepared mutation seam; both seams consume that exact server-resolved option. Redirect directly through `destinationForJoin(locale, result)`. Update profile/company anonymous recovery URLs to preserve plan and interval. Remove the terminal status-card branch from `JoinPage`; authenticated terminal outcomes redirect to checkout or completion.

- [ ] **Step 4: Run GREEN and verify no default-interval dependence remains**

    Run:

    npm.cmd test -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: PASS with exact profile/company/checkout/review/complete destinations, explicit membership intervals, read-only action preflight, and zero profile/company/application/membership/journey/limiter/provider calls when catalog resolution is unavailable or rejects. Add `billingInterval: "annual"` or `"none"` to every typed `MembershipRecord` and `MembershipInput` fixture touched by the required property; do not weaken the property to optional.

    Run:

    npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts

    Expected: PASS with annual/none on every valid Join journey and explicit missing/invalid/multi-valued interval recovery before magic-link, provider, or database mutation.

    Run:

    npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/portal-content-scope.test.ts tests/unit/repository-production-security.test.ts

    Expected: PASS with every required membership fixture explicit and repository authorization unchanged.

    Run:

    npm.cmd run typecheck

    Expected: PASS with the required durable interval across Join, repository-security, checkout, recovery, and Portal-content fixtures.

    Run:

    rg -n "membershipsRepository\.create|memberships\.create" lib app tests

    Expected: every production membership-creation path in scope either supplies `billingInterval` explicitly or is an existing seed/system path with an explicit value. No Join path relies on `default("annual")`.

- [ ] **Step 5: Commit the typed Join slice**

    git add -- ':(literal)lib/membership/join-schema.ts' ':(literal)lib/membership/join-navigation.ts' ':(literal)lib/membership/onboarding.ts' ':(literal)lib/membership/join-service.ts' ':(literal)lib/membership/lifecycle.ts' ':(literal)lib/db/repos/memberships.ts' ':(literal)app/[locale]/(join)/join/actions.ts' ':(literal)app/[locale]/(join)/join/page.tsx' ':(literal)app/[locale]/(join)/join/profile/page.tsx' ':(literal)app/[locale]/(join)/join/company/page.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/join-schema.test.ts' ':(literal)tests/unit/join-navigation.test.ts' ':(literal)tests/unit/join-service.test.ts' ':(literal)tests/unit/join-service-review.test.ts' ':(literal)tests/unit/join-actions.test.ts' ':(literal)tests/unit/join-actions-profile-identity.test.ts' ':(literal)tests/unit/join-page.test.tsx' ':(literal)tests/unit/profile-identity-billing.test.ts' ':(literal)tests/unit/checkout-service.test.ts' ':(literal)tests/unit/checkout-recovery-service.test.ts' ':(literal)tests/unit/portal-content-scope.test.ts' ':(literal)tests/unit/repository-production-security.test.ts' ':(literal)tests/e2e/join-auth.spec.ts'
    git commit -m "feat: route durable join outcomes"

### Task 3: Add explicit member login, one safe continuation authority, and Portal sign-out

**Files:**

- Create: `app/[locale]/(join)/member-login/page.tsx`, `components/portal/portal-sign-out-button.tsx`.
- Create tests: `tests/unit/member-login-page.test.tsx`, `tests/unit/portal-sign-out-button.test.tsx`, `tests/unit/portal-layout-auth.test.tsx`.
- Modify: `lib/membership/join-navigation.ts`, `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(member)/portal/layout.tsx`, `components/portal/portal-nav.tsx`, `lib/portal/queries.ts`, `config/navigation.ts`, `config/wisetech-integration-manifest.ts`, `messages/en.json`, `messages/zh-HK.json`.
- Modify tests: `tests/unit/join-navigation.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/portal-authorization.test.ts`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`, `tests/unit/page-indexability.test.ts`, `tests/unit/wisetech-route-parity.test.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`, `tests/e2e/m2-admin-crm.spec.ts`.

**Interfaces:**

- Consumes: Task 2 `PortalContinuation`, `parsePortalContinuation`, final `requestMagicLink`, `getActor()`, `requirePortalMember()`, and existing `authClient.signOut()`.
- Produces:

    export function buildPortalSignInPath(
      locale: AppLocale,
      continuation?: PortalContinuation,
    ): string;
    export type PortalSignOutButtonProps = Readonly<{
      destination: string;
      label: string;
      pendingLabel: string;
      errorLabel: string;
    }>;

- [ ] **Step 1: Write failing continuation, login-page, actor-boundary, and sign-out tests**

    Expand the continuation matrix to accept exactly the nine stable locale-neutral paths. For every rejected case below, call `parsePortalContinuation(value, locale)` with the shown locale and assert `null`:

    const rejected = [
      {locale: "en", value: "/portal/showcase"},
      {locale: "en", value: "/portal/company/seats/accept"},
      {locale: "en", value: "/portal/company/seats/accept?token=secret"},
      {locale: "en", value: "/portal/unknown"},
      {locale: "en", value: "/portal?query=1"},
      {locale: "en", value: "/portal#fragment"},
      {locale: "en", value: "/zh/portal"},
      {locale: "zh-HK", value: "/en/portal"},
      {locale: "zh-HK", value: "/fr/portal"},
      {locale: "en", value: "//evil.example/portal"},
      {locale: "en", value: "https://evil.example/portal"},
      {locale: "en", value: "https://user:pass@evil.example/portal"},
      {locale: "en", value: "/portal\\company"},
      {locale: "en", value: "/portal\n"},
      {locale: "en", value: "/portal/documents\t"},
      {locale: "en", value: ["/portal", "/admin"]},
    ] as const;

    Reject C0 controls, credentials, protocol-relative/absolute URLs, query/hash state, cross-locale prefixes, unknown locale prefixes, arrays, and the token-bearing acceptance route before any authentication or provider call. Add positive EN and zh-HK cases for all nine allowlisted destinations.

    Assert:

    expect(buildPortalSignInPath("en", "/portal/documents"))
      .toBe("/member-login?next=%2Fportal%2Fdocuments");
    expect(buildPortalSignInPath("zh-HK", "/portal/billing"))
      .toBe("/zh/member-login?next=%2Fportal%2Fbilling");

    In `member-login-page.test.tsx` cover:

    - no `next` defaults to `/portal`;
    - a safe explicit continuation creates `requestMagicLink.bind(null, "en", "member-login", null, continuation)`;
    - invalid or multi-valued `next` renders localized recovery and does not bind/call auth;
    - an authenticated member redirects to the validated continuation;
    - an authenticated staff actor renders member-access denied and no Portal data;
    - metadata is `{index: false, follow: false}` in both locales.

    In `join-actions.test.ts`, execute the final `entry: "member-login"` action branch directly. For Chinese Billing continuation, assert the only provider call has callback URL `https://members.example.test/zh/member-login?next=%2Fportal%2Fbilling`, the successful redirect is `/zh/member-login?sent=1&next=%2Fportal%2Fbilling`, and neither contains `/join`. Add an EN default-`/portal` case, rate-limited case, returned-provider-error case, thrown-provider-error case, and invalid-continuation case. The last four expose only localized safe state, do not redirect, and invalid continuation calls neither `checkAuthSend` nor `auth.signIn.magicLink`.

    In the sign-out test:

    authClient.signOut.mockResolvedValue({data: {}, error: null});
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(routerReplace).toHaveBeenCalledWith("/member-login");
    expect(routerRefresh).toHaveBeenCalledOnce();

    Add pending double-click and rejected/error-result cases. Failure must keep router calls at zero and show one localized `role="alert"`.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/join-navigation.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/portal-layout-auth.test.tsx tests/unit/portal-authorization.test.ts tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/page-indexability.test.ts tests/unit/wisetech-route-parity.test.ts

    Expected: FAIL because Portal redirects still use `/join` and a prefix-based continuation, `/member-login` is absent, staff can pass the layout-level authentication check, and Portal has no sign-out control.

- [ ] **Step 3: Implement the explicit login and client-only sign-out**

    Keep `PORTAL_CONTINUATIONS` in `join-navigation.ts` as the single continuation data authority. Move `buildPortalSignInPath` there and delete the duplicate builder from `lib/portal/queries.ts`. It always returns localized `/member-login?next=%2Fportal` or the equivalently encoded allowlisted path after parsing the canonical value.

    In Portal layout:

    const actor = await getActor();
    if (!actor) {
      const requestHeaders = await headers();
      const continuation = parsePortalContinuation(
        requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"),
        locale,
      ) ?? "/portal";
      redirect(buildPortalSignInPath(locale, continuation));
    }
    requirePortalMember(actor);

    Add a layout test where `getActor` rejects with `NEON_SESSION_UNAVAILABLE`; `PortalLayout` must reject with the same error, `redirect` must remain uncalled, and `requirePortalMember` must remain uncalled. Only an actual `null` actor is anonymous; never convert configuration, session-reader, or profile-repository failures into login redirects.

    Do not accept arbitrary `startsWith("/portal")` paths. A staff/exco/superadmin actor must not acquire member access.

    Build `MemberLoginPage` in the transactional layout. It validates one scalar continuation before invoking authentication, is noindex, redirects an existing member, renders a localized denied state for a non-member actor, and binds the same Task 2 Server Action with `entry: "member-login"`, null selection, and the parsed continuation. The callback and sent-state route remain `/member-login`. Keep the existing email validation, per-IP/per-address limiter, `APP_URL` origin validation, provider adapter, rate-limited result, and generic sanitized provider error. Never fall back to `/join`.

    Change `memberPortalAction.href` to `/member-login`. Add `route-member-login` to the integration manifest as an hkwtia-owned retained route. Keep `/member-login` out of `publicRoutes` so sitemap generation does not index it.

    Implement `PortalSignOutButton` as the only new auth Client Component. Disable while pending. Treat thrown errors and a returned `error` as failure. On success call `router.replace(destination)` then `router.refresh()`. Render it in both desktop and mobile Portal navigation through one component instance per responsive surface.

- [ ] **Step 4: Run GREEN and the credential-free redirect checks**

    Run:

    npm.cmd test -- tests/unit/join-navigation.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/portal-layout-auth.test.tsx tests/unit/portal-authorization.test.ts tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/page-indexability.test.ts tests/unit/wisetech-route-parity.test.ts

    Expected: PASS. Both navigation renderers target `/member-login`; generic Join targets `/membership`; cross-locale/control/credential continuation rejection occurs before auth; the member-login action has exact callback/sent/rate-limit/provider-error behavior with no `/join` fallback; operational `getActor` rejection propagates; and sign-out has success, pending, and fail-stay behavior.

    Run:

    npm.cmd run test:e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts tests/e2e/m2-admin-crm.spec.ts

    Expected: PASS without credentials. Every stable Portal route reaches the localized `/member-login` route with its canonical allowlisted `next`; the M2 credential-free case now expects `/member-login?next=%2Fportal` rather than `/join?next=/portal`. Seat acceptance is not a generic continuation. Authenticated M2 cases remain separately gated and any skip is not acceptance evidence.

- [ ] **Step 5: Commit the member-access slice**

    git add -- ':(literal)app/[locale]/(join)/member-login/page.tsx' ':(literal)components/portal/portal-sign-out-button.tsx' ':(literal)lib/membership/join-navigation.ts' ':(literal)app/[locale]/(join)/join/actions.ts' ':(literal)app/[locale]/(member)/portal/layout.tsx' ':(literal)components/portal/portal-nav.tsx' ':(literal)lib/portal/queries.ts' ':(literal)config/navigation.ts' ':(literal)config/wisetech-integration-manifest.ts' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/member-login-page.test.tsx' ':(literal)tests/unit/portal-sign-out-button.test.tsx' ':(literal)tests/unit/portal-layout-auth.test.tsx' ':(literal)tests/unit/join-navigation.test.ts' ':(literal)tests/unit/join-actions.test.ts' ':(literal)tests/unit/portal-authorization.test.ts' ':(literal)tests/unit/navigation.test.ts' ':(literal)tests/unit/mobile-navigation.test.tsx' ':(literal)tests/unit/page-indexability.test.ts' ':(literal)tests/unit/wisetech-route-parity.test.ts' ':(literal)tests/e2e/portal-dashboard.spec.ts' ':(literal)tests/e2e/portal-secondary-pages.spec.ts' ':(literal)tests/e2e/seat-management.spec.ts' ':(literal)tests/e2e/m2-admin-crm.spec.ts'
    git commit -m "feat: add explicit member access controls"

### Task 4: Resolve checkout by durable option and project authoritative completion state

**Files:**

- Modify: `lib/billing/checkout-service.ts`, `lib/db/repos/billing-attempts.ts`, `lib/membership/join-billing-state.ts`.
- Modify: `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`, `components/billing/checkout-status.tsx`.
- Create: `tests/fixtures/m1-live-acceptance.ts`, `tests/unit/m1-live-acceptance-safety.test.ts`.
- Modify tests: `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/billing-checkout-locking.test.ts`, `tests/unit/billing-recovery-cas.test.ts`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/portal-billing-actions.test.tsx`, `tests/unit/m1-acceptance-services.test.ts`, `tests/e2e/m1-acceptance.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: durable `MembershipRecord.planCode` and `MembershipRecord.billingInterval`, Task 1 `resolveMembershipOption`, actor-scoped applications, existing billing-attempt repository, Stripe adapter, and webhook-owned membership status.
- Produces:

    export type JoinMembershipState = Readonly<{
      actor: Extract<Actor, {kind: "member"}>;
      membership: MembershipRecord & {
        applicationId: string;
        status: "pending_payment" | "pending_review" | "active";
      };
      application: Readonly<{id: string; planCode: string; status: string}>;
    }>;
    export type JoinStateApplication = Readonly<{
      id: string;
      planCode: string;
      status: string;
    }>;
    export type JoinStateDependencies = Readonly<{
      memberships: Readonly<{
        getById(
          actor: Actor,
          membershipId: string,
        ): Promise<MembershipRecord | null>;
      }>;
      applications: Readonly<{
        getById(
          actor: Actor,
          applicationId: string,
        ): Promise<JoinStateApplication | null>;
      }>;
    }>;
    export async function loadJoinMembershipState(
      actor: Actor | null,
      membershipId: string | undefined,
      dependencies?: JoinStateDependencies,
    ): Promise<JoinMembershipState | null>;

- `CheckoutDependencies` replaces `priceForPlan(planCode)` with:

    priceForOption(selection: MembershipSelection): Promise<string> | string;

- Billing-attempt locking consumes the full expected option:

    export type BillingAttemptSelection = Readonly<{
      planCode: MembershipPlanCode;
      billingInterval: BillingInterval;
    }>;

- `claimActive(actor, membershipId, priceReference, selection)` and `startNewAttempt(actor, membershipId, priceReference, selection, reason, request)` receive `BillingAttemptSelection` in that exact position; a lock-time mismatch throws `BILLING_OPTION_CHANGED` before an attempt or Stripe call.
- `createBillingPortalSession` final signature is `(actor, membershipId, locale, dependencies?)`.
- The isolated provider harness exports `M1_ACCEPTANCE_DESTRUCTIVE_SENTINEL = "M1_ISOLATED_FIXTURES_ONLY"`, `M1_ACCEPTANCE_PROVIDER_SENTINEL = "M1_TEST_PROVIDERS_ONLY"`, `missingM1LiveEnvironment(environment)`, `requireM1LiveAcceptanceEnvironment(environment)`, `snapshotM1Identities(guarded)`, `prepareM1Fixture(runId, identities, guarded)`, `checkpointM1IdentityMutations(runId, identities, guarded)`, `collectM1StripeRunLedger(runId, guarded, identifiers)`, `disposeM1StripeRun(ledger, guarded)`, `restoreM1Identities(runId, identities, guarded)`, and `cleanupM1Fixture(runId, guarded)`. It remains test-only and cannot be imported by `app`, `components`, or `lib` production modules.
- The exact pre-existing identity snapshot is:

    export type M1ProfileSnapshot = Readonly<{
      id: string;
      authUserId: string;
      email: string | null;
      role: "member" | "company-admin" | "staff";
      lastLoginAt: string | null;
      consentMarketing: boolean;
      interests: readonly string[];
      displayName: string;
      phone: string | null;
      jobTitle: string | null;
      locale: string;
      onboardingState: string;
      directoryVisible: boolean;
      createdAt: string;
      updatedAt: string;
      whatsappOptIn: boolean;
      whatsappNumber: string | null;
    }>;
    export type M1IdentitySnapshot = Readonly<{
      runStartedAt: string;
      owner: M1ProfileSnapshot;
      invitee: M1ProfileSnapshot;
    }>;

  The guard requires owner and invitee profiles to exist, their normalized emails/auth-user/profile IDs to be pairwise distinct, the invitee not to belong to the run target company, and `M1_TEST_OVERFLOW_EMAIL` to be a third distinct controlled-inbox test address. The owner must have no pre-existing Join application, membership, or company context that the journey would overwrite; fail before mutation instead of deleting it. Snapshot occurs before either browser authenticates.
- `M1StripeRunLedger` records the run ID; run-owned application, membership, and billing-attempt IDs; exact Checkout Session, Customer, and Subscription IDs; and exact Invoice, PaymentIntent, and Charge IDs reached from the owned Session/Subscription lineage. Because the production Billing Portal boundary intentionally exposes only its redirect URL, the ledger records sanitized Portal redirect/locale-return evidence and the named `retained_immutable_unaddressable_test_record` disposition without pretending an unexposed provider ID is available. Its remaining disposition result separates required cleanup (`expired_session`, `cancelled_subscription`, `deleted_customer`, `deleted_database_rows`) from `retained_immutable_test_record` evidence.
- The controlled inbox adapter has this exact test-only contract:

    export type M1MagicLinkInboxResponse = Readonly<{
      messages: readonly Readonly<{
        id: string;
        recipient: string;
        receivedAt: string;
        href: string;
      }>[];
    }>;

  The adapter exposes two bounded operations over `GET {M1_TEST_MAGIC_LINK_INBOX_URL}?recipient={encodedEmail}&after={encodedIsoTimestamp}` with `Authorization: Bearer {M1_TEST_MAGIC_LINK_INBOX_TOKEN}`. `pollExactlyOne` retries for at most 60 seconds and succeeds only with exactly one post-request message for the exact recipient; `receivedAt` must parse after the request timestamp, `href` must be HTTPS with no URL credentials, and following it must finish on the exact allowlisted `APP_URL` origin. `assertNoMessage` observes that same exact-recipient query for the full 60-second delivery window and fails immediately if any post-request message appears. Reject extra matches, stale messages, redirects to another origin, malformed JSON, or timeouts. Unit tests use a fake clock and scripted inbox responses, so the focused safety suite does not sleep.

- [ ] **Step 1: Write failing durable-price, locked-row, completion, and locale tests**

    Add checkout assertions:

    expect(setup.dependencies.priceForOption)
      .toHaveBeenCalledWith({plan: "startup", billingInterval: "annual"});
    expect(setup.attempts.claimActive).toHaveBeenCalledWith(
      actor,
      membershipId,
      "price_startup_annual",
      {planCode: "startup", billingInterval: "annual"},
    );

    Add a monthly durable membership case and expect `STRIPE_PRICE_NOT_CONFIGURED` before `claimActive` or Stripe. Add a lock-race case where preflight reads annual but the locked row is monthly; expect `BILLING_OPTION_CHANGED` and no attempt/Stripe mutation. Add a conflicting query object to the page test and prove it is ignored.

    In `billing-recovery-cas.test.ts`, add `billing_interval: "annual"` to every locked Startup row. Change all direct calls at the existing recovery/replay/authorization cases to `startNewAttempt(actor, membershipId, "price_startup_v1", {planCode: "startup", billingInterval: "annual"}, reason, request)` and `claimActive(system, membershipId, "price_1", {planCode: "startup", billingInterval: "annual"})`. Preserve the current system-actor denial, compare-and-swap, replay, and stale-request assertions.

    Extend the raw locked-membership test so SQL selects `billing_interval` and `claimActive` returns:

    expect(result.membership).toMatchObject({
      planCode: "startup",
      billingInterval: "annual",
    });

    Completion cases:

    it.each([
      ["pending_payment", "processing"],
      ["pending_review", "review"],
      ["active", "active"],
    ] as const)("renders durable %s as %s", async (status, expected) => {
      state.membership = {...state.membership, status};
      state.application = {
        ...state.application,
        status: status === "active" ? "completed" : status,
      };
      const html = renderToStaticMarkup(await CompletePage(props({
        membership_id: "membership-a",
        session_id: "forged-success",
      })));
      expect(html).toContain('data-join-status="' + expected + '"');
    });

    Add cancelled, expired, plan-mismatch, missing application, foreign actor, and multi-valued membership ID cases; each must call no Stripe adapter and return not-found/recovery.

    Assert Chinese Billing Portal return:

    await createBillingPortalSession(actor, membershipId, "zh-HK", dependencies);
    expect(stripe.portalRequests[0]).toEqual({
      customerId: "cus_owned",
      returnUrl: "https://members.example.test/zh/portal/billing",
    });

    In `m1-live-acceptance-safety.test.ts`, prove the guard rejects a missing or wrong destructive sentinel, missing or wrong provider sentinel, absent `DATABASE_URL_TEST`, `DATABASE_URL !== DATABASE_URL_TEST`, non-Neon/TLS-invalid/production-labelled/mismatched database hosts, `NEON_PROJECT_ID !== M1_TEST_NEON_PROJECT_ID`, missing or mismatched `M1_TEST_NEON_HOST`, missing `PLAYWRIGHT_BASE_URL`/`M1_E2E_ALLOWED_ORIGIN`, origin mismatch, non-HTTPS remote targets, the production host, non-test Stripe keys, unallowlisted mailbox origins, missing owner/invitee/overflow emails, any normalized email/identity collision, absent owner/invitee profile mapping, a pre-existing owner Join/company context, or a pre-existing invitee membership in the target company before a Pool, browser, inbox, Neon, or Stripe client is constructed.

    In the same file, unit-test the provider ledger and dispositions with a fake Stripe client: reject Session/client-reference/metadata lineage mismatches before cleanup; expire only an open Session and accept an already-expired Session; cancel owned Subscriptions in `active`, `trialing`, `past_due`, `unpaid`, `paused`, or `incomplete` before Customer deletion while treating `canceled` and `incomplete_expired` as terminal; verify the owned Customer deletion response; never call delete on completed Sessions, Portal Sessions, Invoices, PaymentIntents, Charges, configured Prices, or the shared webhook endpoint; emit every addressable immutable residual ID plus named sanitized Portal residual evidence; propagate incomplete required cleanup while accepting named immutable residual records.

    Unit-test identity restoration and failure aggregation: serialize every profile column exactly; accept only the unchanged baseline or an owner/invitee state whose allowed run-ID fields and `lastLoginAt`/`updatedAt` timestamps fall inside the recorded run window/checkpoints; restore the full original row including timestamps; reject external drift without overwriting it; treat an already restored row idempotently; and prove provider failure, early browser failure, identity-restoration failure, and Page/DB cleanup failure do not prevent the other independently safe cleanup phases from running. Add a live-fixture contract that requires a distinct invitee, a fresh browser context/session transition, accepted invitation/member IDs, exact capacity fill, and zero overflow inbox message/invitation row.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/m1-acceptance-services.test.ts tests/unit/m1-live-acceptance-safety.test.ts

    Expected: FAIL because checkout resolves by plan only, locked membership rows and the direct recovery-CAS caller omit interval/full selection, completion accepts pending payment only, Billing Portal returns to the English path, and the isolated M1 environment, distinct-invitee journey, profile snapshot/restoration, provider-lineage ledger, and aggregate cleanup-disposition contracts do not exist.

- [ ] **Step 3: Implement durable billing and status projection**

    Include `billingInterval` in `rawMembership` and the `FOR UPDATE` selection in `billing-attempts.ts`. Change `claimActive` and `startNewAttempt` to accept the full expected `{planCode, billingInterval}` option in the exact signatures above and compare both fields after the lock; add `BILLING_OPTION_CHANGED` to the typed error codes. Update every direct caller, including all five `billing-recovery-cas.test.ts` calls, without moving selection into `RecoveryRequest`. Preserve the existing actor-first billing-manager scope, row lock, active-attempt reuse, exact attempt price, and idempotency key.

    In both `createCheckoutSession` and `startNewCheckoutAttempt`:

    const selection = {
      plan: membership.planCode,
      billingInterval: membership.billingInterval,
    };
    const priceReference = await dependencies.priceForOption(selection);

    Pass the same `{planCode: membership.planCode, billingInterval: membership.billingInterval}` expectation into `claimActive` and `startNewAttempt`. Extend `RecoveryRequest` with no caller-controlled option fields; the service supplies the expected durable option separately so a request cannot select price or interval.

    The default `priceForOption` resolves Task 1's catalog option and returns a price only for `billingBehavior: "checkout"` with a non-null server reference. It throws `STRIPE_PRICE_NOT_CONFIGURED` otherwise. Never read plan or interval from URL input.

    Replace the pending-only Join loader with `loadJoinMembershipState`. It returns only a member-owned membership linked to an actor-scoped application with equal plan and one compatible pair:

    - `pending_payment` membership with `pending_payment` application;
    - `pending_review` membership with `pending_review` application;
    - `active` membership with `completed` application.

    Keep `CheckoutPage` restricted to `pending_payment` after loading. Make `CompletePage` render processing, review, or active from the durable projection. Ignore `session_id`, `status`, `success`, plan, and interval query keys when choosing state. Keep webhook processing as the only Stripe activation authority.

    Pass locale from Portal billing to `createBillingPortalSession` and build the return URL with `localizedPath(locale, "/portal/billing")`.

    Implement `m1-live-acceptance.ts` as a test-only fail-closed harness. It requires all Task 12 M1 variables, exact `DATABASE_URL === DATABASE_URL_TEST`, an independently allowlisted non-production Neon project and TLS host, exact target/origin/`APP_URL` equality, an allowlisted HTTPS test-inbox origin, three distinct test email addresses, existing owner/invitee profile mappings, a clean owner Join boundary, and Stripe `sk_test_` credentials before constructing external clients. The durable Startup option must have `seatLimit >= 2`; fail before authentication or mutation otherwise. Replace the unconditional always-skip case in `m1-acceptance.spec.ts` with one isolated describe whose skip condition is exactly `missingM1LiveEnvironment(process.env).length > 0`; a skip remains `NOT PASSED`.

    Before the journey or any browser authentication, snapshot every owner/invitee profile column above and record `runStartedAt`. Retrieve both configured Stripe test Prices and require `active === true`, `type === "recurring"`, `currency === "hkd"`, and `recurring.interval === "year"`. Tag every disposable database row with one generated `runId`; owner profile inputs, company names, synthetic capacity profiles, and test metadata also contain that run ID so owned intermediate states are recognizable without adding schema. Maintain a test-only `M1StripeRunLedger` in `tests/fixtures/m1-live-acceptance.ts`: start from the exact Checkout Session ID attached to the run-owned billing attempt, retrieve that Session after completion, require its `client_reference_id` and Session/Subscription metadata to equal the run-owned membership/application/attempt IDs, and record the exact Session, Customer, Subscription, Invoice, PaymentIntent, and Charge IDs reachable from that lineage. Record the Billing Portal redirect origin and exact locale-correct return only as named sanitized residual evidence because the production adapter intentionally does not expose that immutable Session ID. This ledger, rather than an unsupported claim that every Stripe object is deletable or accepts metadata, proves provider ownership without adding test-only fields to the production adapter.

    Request the owner's real test-mode Neon magic link, use `pollExactlyOne` only against the allowlisted controlled inbox for that exact recipient/request timestamp, open the callback, complete run-ID-marked profile/company onboarding, prove the stored annual option and exact Startup Price, complete Stripe test checkout, wait for the signed webhook to activate the durable membership, render active completion, open the locale-correct Billing Portal, and verify receipts/secondary pages. Before invitation, require the exact active company-member count to be one (the owner). From the owner seats UI, invite `M1_TEST_INVITEE_EMAIL` as `member`; capture the run-owned invitation ID and request timestamp, then sign the owner out and close that context.

    Open a fresh isolated browser context, use `pollExactlyOne` for the new invitee message, follow its HTTPS magic link, require the callback to finish on the exact allowlisted origin and `/portal/company/seats/accept?token=...`, and verify acceptance creates exactly one company-member row for the snapshotted invitee profile, marks that exact invitation accepted by that profile, and makes the exact active company-member count two. Replay the same callback and require the localized already-used safe error with no second membership. Sign the invitee out and close its context. Reopen a fresh owner context through a second owner magic link, then use the guarded fixture to insert exactly `seatLimit - 2` run-ID-owned synthetic profiles/company-member rows (zero when `seatLimit === 2`) and verify the exact active count equals the durable `seatLimit` before the denial attempt. Submit an invitation for distinct `M1_TEST_OVERFLOW_EMAIL`; require the localized capacity error, no invitation row, and `assertNoMessage` success for that exact recipient and request timestamp across the bounded 60-second delivery window. Record identity checkpoints after each login/profile mutation, then sign the owner out.

    `afterAll` must run after both success and failure and use independent nested `try/finally` phases whose errors are accumulated and thrown once at the end. First close every surviving browser context. Owner and invitee sign-out are journey assertions at the explicit checkpoints above; cleanup never creates a new authenticated browser request that could advance `lastLoginAt` before profile comparison/restoration. The Stripe phase collects/validates whatever owned ledger lineage exists, expires an owned open Checkout Session (or verifies expired; retains complete), cancels/terminal-verifies an owned Subscription, and deletes the disposable Customer only after subscription disposition; incomplete lineage is reported but never blocks later phases. Completed Checkout Sessions, Invoices, PaymentIntents, and Charges remain named `retained_immutable_test_record` evidence; the Portal Session remains `retained_immutable_unaddressable_test_record`; the owner/invitee mailbox message IDs remain named `retained_immutable_test_message` evidence. Never mutate/delete configured Prices, the webhook endpoint, pre-existing auth users, or immutable provider records.

    In an independent database `finally`, delete only rows owned through the run-owned application/company/membership/invitation/seat/synthetic-profile graph and verify zero remain; this includes the accepted invitee company-member row but never the invitee profile or unrelated memberships. In a final independent identity `finally`, re-read owner/invitee profiles. If a row equals baseline, do nothing; if it equals a recorded run checkpoint or the exact allowed run-ID/timestamp-window projection, restore every snapshotted column and timestamp and verify byte-for-byte serialized equality; if it shows external drift, preserve it and report failure. A provider, database, or one-identity failure never prevents the other safe cleanup attempts. Fail for any incomplete required Session/Subscription/Customer/database/identity cleanup, external drift, or seat/invitation residue; named immutable residuals are expected evidence. Do not use a production email, customer, Price, endpoint, database, identity, or catch-all deletion.

- [ ] **Step 4: Run GREEN and prove the M1 harness can reach an authorized isolated result**

    Run:

    npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/m1-acceptance-services.test.ts tests/unit/m1-live-acceptance-safety.test.ts

    Expected: PASS. Price selection uses the durable pair, all completion states are actor-scoped, forged success never activates or selects active state, every unsafe M1 identity/environment fails before external construction, and identity/DB/provider cleanup phases remain independent under injected failures.

    Run:

    npm.cmd run test:e2e -- tests/e2e/m1-acceptance.spec.ts

    Expected without the complete gate: deterministic fixture cases PASS and the isolated live describe is conditionally skipped as `NOT PASSED`; the old unconditional skip string is absent. After the separate provider/database mutation approval and every Task 12 M1 variable are present, the same command must execute the full isolated journey, confirm both configured Prices are annual recurring test Prices, complete distinct-invitee callback/acceptance and exact capacity denial, restore both identity snapshots, perform every independent provider/database disposition above, record immutable Stripe/mailbox test residuals, and PASS. Never convert a missing variable, skip, retained immutable record, or incomplete required cleanup into a different result.

- [ ] **Step 5: Commit the durable billing slice**

    git add -- ':(literal)lib/billing/checkout-service.ts' ':(literal)lib/db/repos/billing-attempts.ts' ':(literal)lib/membership/join-billing-state.ts' ':(literal)app/[locale]/(join)/join/checkout/page.tsx' ':(literal)app/[locale]/(join)/join/complete/page.tsx' ':(literal)app/[locale]/(member)/portal/billing/page.tsx' ':(literal)components/billing/checkout-status.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/fixtures/m1-live-acceptance.ts' ':(literal)tests/unit/m1-live-acceptance-safety.test.ts' ':(literal)tests/unit/checkout-service.test.ts' ':(literal)tests/unit/checkout-recovery-service.test.ts' ':(literal)tests/unit/billing-checkout-locking.test.ts' ':(literal)tests/unit/billing-recovery-cas.test.ts' ':(literal)tests/unit/join-billing-pages.test.tsx' ':(literal)tests/unit/portal-billing-actions.test.tsx' ':(literal)tests/unit/m1-acceptance-services.test.ts' ':(literal)tests/e2e/m1-acceptance.spec.ts'
    git commit -m "feat: project durable billing state"

### Task 5: Lock the one-time seat invitation callback at route level

**Files:**

- Create: `app/[locale]/(member)/portal/company/seats/actions.ts`, `lib/portal/seat-invitation-callback.ts`.
- Modify: `app/[locale]/(member)/portal/company/seats/page.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`.
- Create test: `tests/unit/seat-invitation-routes.test.tsx`.
- Modify tests: `tests/unit/seat-service.test.ts`, `tests/e2e/seat-management.spec.ts`.

**Interfaces:**

- Consumes: existing `inviteSeat`, `revokeInvitation`, `acceptSeatInvitation`, `auth.signIn.magicLink`, `requireActor`, `appEnv().appUrl`, and `SeatServiceError`.
- Produces no new endpoint, identity store, or callback handler. `app/[locale]/(member)/portal/company/seats/actions.ts` begins with `"use server"` and exports the existing `inviteSeatAction(formData: FormData)`; `lib/portal/seat-invitation-callback.ts` begins with `import "server-only"` and exports `invitationCallbackUrl(appUrl: string, locale: AppLocale, token: string): string`. The page imports those seams and exports only Next-supported page-module fields.

- [ ] **Step 1: Write failing invitation delivery, identity, replay, expiry, and revocation tests**

    In `seat-invitation-routes.test.tsx`, import `inviteSeatAction` from the adjacent `actions.ts`, import `invitationCallbackUrl` from its server-only module, import only the acceptance page's default component from `page.tsx`, mock the current repository/auth boundaries, and assert:

    await expect(inviteSeatAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(auth.signIn.magicLink).toHaveBeenCalledWith({
      email: "invitee@example.test",
      callbackURL:
        "https://preview.example.test/zh/portal/company/seats/accept?token=opaque-token",
    });
    expect(auth.signIn.magicLink.mock.calls[0][0].callbackURL)
      .not.toContain("/member-login");

    Render `SeatInvitationAcceptancePage` with one scalar token and assert it calls:

    expect(acceptSeatInvitation).toHaveBeenCalledWith(
      {kind: "member", userId: "auth-user", profileId: "invitee-profile"},
      "opaque-token",
    );

    Add multi-valued/missing token tests that do not call the repository. Map `INVITATION_ALREADY_ACCEPTED`, `INVITATION_EXPIRED`, `INVITATION_REVOKED`, and `INVITATION_EMAIL_MISMATCH` to the same localized safe error without exposing the code.

    In `seat-service.test.ts`, add actual disposable-service cases by mutating the in-memory invitation:

    - with `vi.useFakeTimers()` and `vi.setSystemTime(now)`, `expiresAt` equal to or earlier than `now` rejects `INVITATION_EXPIRED`;
    - non-null `revokedAt` rejects `INVITATION_REVOKED`;
    - second acceptance rejects `INVITATION_ALREADY_ACCEPTED`;
    - a profile/session email different from `invitedEmail` rejects `INVITATION_EMAIL_MISMATCH` before membership insert.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts

    Expected: FAIL because the valid adjacent Server Action and callback-builder modules do not exist and the route-level delegation/token invariants are not covered. Do not make a Next page module export arbitrary helpers to satisfy RED.

- [ ] **Step 3: Make the existing route seams testable without creating a second flow**

    Move the existing invite Server Action, without widening behavior, to the adjacent `"use server"` `actions.ts`. Move URL construction to the server-only callback module and pass `appEnv().appUrl` from the action. Import the action into the seats page; do not export either helper from `page.tsx`. Keep the production call sequence unchanged:

    1. require the current actor;
    2. create or reuse the actor-authorized invitation;
    3. for a newly returned token, send one Neon magic link to the dedicated acceptance callback;
    4. revoke that exact invitation if delivery fails;
    5. redirect to the localized seats page or its sanitized error state.

    Keep the acceptance page's one scalar token parser and direct `acceptSeatInvitation(actor, token)` call. Do not route through member-login, store the plaintext token, add another callback, or call a live provider in tests.

- [ ] **Step 4: Run GREEN and the credential-free protected-route check**

    Run:

    npm.cmd test -- tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts

    Expected: PASS with disposable in-memory state and mocked Neon delivery.

    Run:

    npm.cmd run test:e2e -- tests/e2e/seat-management.spec.ts

    Expected: anonymous seat management reaches `/member-login` with `next=/portal/company/seats`; the acceptance-token route is not placed in generic continuation.

- [ ] **Step 5: Commit the invitation regression slice**

    git add -- ':(literal)app/[locale]/(member)/portal/company/seats/actions.ts' ':(literal)lib/portal/seat-invitation-callback.ts' ':(literal)app/[locale]/(member)/portal/company/seats/page.tsx' ':(literal)app/[locale]/(member)/portal/company/seats/accept/page.tsx' ':(literal)tests/unit/seat-invitation-routes.test.tsx' ':(literal)tests/unit/seat-service.test.ts' ':(literal)tests/e2e/seat-management.spec.ts'
    git commit -m "test: lock seat invitation callback"

### Task 6: Build shared internal-shell primitives and grouped navigation

**Files:**

- Create: `config/internal-navigation.ts`.
- Create: `components/internal-shell/internal-app-shell.tsx`, `components/internal-shell/internal-navigation.tsx`, `components/internal-shell/internal-page-header.tsx`, `components/internal-shell/internal-section.tsx`, `components/internal-shell/internal-status-badge.tsx`, `components/internal-shell/internal-table-frame.tsx`, `components/internal-shell/internal-empty-state.tsx`, `components/internal-shell/internal-action-feedback.tsx`, `components/internal-shell/index.ts`.
- Create tests: `tests/unit/internal-navigation.test.tsx`, `tests/unit/internal-shell.test.tsx`, `tests/unit/wisetech-pr6-route-inventory.test.ts`.
- Modify: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Produces:

    export type InternalNavigationItem = Readonly<{
      id: string;
      href: string;
      label: string;
      match: "exact" | "prefix";
    }>;
    export type InternalNavigationGroup = Readonly<{
      id: string;
      label: string;
      items: readonly InternalNavigationItem[];
    }>;
    export function activeInternalNavigationItem(
      pathname: string,
      groups: readonly InternalNavigationGroup[],
    ): string | null;
    export function InternalNavigation(props: Readonly<{
      variant: "compact" | "application";
      groups: readonly InternalNavigationGroup[];
      labels: Readonly<{navigation: string; open: string; close: string}>;
      footer?: ReactNode;
    }>): ReactNode;
    export function InternalAppShell(props: Readonly<{
      variant: "join" | "portal" | "admin";
      skipLabel: string;
      brand: Readonly<{href: string; label: string}>;
      navigation?: ReactNode;
      utility?: ReactNode;
      afterMain?: ReactNode;
      children: ReactNode;
    }>): ReactNode;

- `InternalNavigation` accepts grouped localized data, mobile open/close labels, and optional footer content. `InternalAppShell` owns the sole `main#main-content` and skip target.

- [ ] **Step 1: Write failing route-inventory, active-route, drawer, landmark, and primitive tests**

    In the inventory test, derive App Router paths from tracked page files and require the exact final sets:

    const joinRoutes = [
      "/join", "/join/profile", "/join/company", "/join/checkout",
      "/join/complete", "/member-login",
    ];
    const portalRoutes = [
      "/portal", "/portal/profile", "/portal/company",
      "/portal/company/listing", "/portal/company/seats",
      "/portal/company/seats/accept", "/portal/directory", "/portal/events",
      "/portal/documents", "/portal/billing",
    ];
    const adminRoutes = [
      "/admin", "/admin/members", "/admin/members/[id]", "/admin/at-risk",
      "/admin/segments", "/admin/announcements", "/admin/announcements/[id]",
      "/admin/news", "/admin/news/[id]", "/admin/page-copy",
      "/admin/page-copy/[namespace]", "/admin/media", "/admin/media/[id]",
      "/admin/partners", "/admin/partners/[id]", "/admin/landing-partners",
      "/admin/landing-partners/[id]", "/admin/events-mgmt",
      "/admin/events-mgmt/[id]", "/admin/listings-review", "/admin/cohorts",
      "/admin/cohorts/[id]", "/admin/approvals", "/admin/reports",
      "/admin/reports/board-drafts/[id]", "/admin/automations",
    ];

    Assert the Portal navigation has eight primary items, Admin has sixteen entries grouped 4/6/6, seats are not primary, and `/portal/showcase` is absent.

    Active-state tests:

    expect(activeInternalNavigationItem("/portal", portalGroups)).toBe("dashboard");
    expect(activeInternalNavigationItem("/portal/company/listing", portalGroups))
      .toBe("showcase-listing");
    expect(activeInternalNavigationItem("/portal/company/seats", portalGroups))
      .toBe("company");
    expect(activeInternalNavigationItem("/admin/reports/board-drafts/a", adminGroups))
      .toBe("reports");
    expect(activeInternalNavigationItem("/portal/companyish", portalGroups))
      .toBeNull();
    expect(activeInternalNavigationItem("/admin/reports-old", adminGroups))
      .toBeNull();

    Render tests require one skip link, one `main#main-content`, named grouped navigation, `aria-current="page"` only on the most-specific item, 44 px target classes, table-local horizontal scrolling, and `role="alert"` only for error feedback.

    In JSDOM, open the mobile Sheet, press Escape, await close, and assert focus returns to the trigger.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts

    Expected: FAIL because no internal-shell family or grouped navigation configuration exists.

- [ ] **Step 3: Implement presentation-only primitives**

    Put stable href/id/match data in `config/internal-navigation.ts` and localize labels in layouts. Dashboard uses `match: "exact"`. A prefix item matches only when `pathname === href || pathname.startsWith(href + "/")`; then `activeInternalNavigationItem` chooses the matching item with the longest href, so listing wins over company and reports own Board drafts without near-prefix false positives.

    `InternalNavigation` is a Client Component using the existing `Sheet`, `SheetTrigger`, `SheetContent`, `SheetClose`, and localized `usePathname`. Render the same groups in a desktop sidebar and mobile Sheet. Wrap each mobile link in `SheetClose asChild`. Let Radix handle Escape and focus restoration; do not add document-level key listeners.

    `InternalAppShell` renders:

    <div data-internal-shell={variant} className="min-h-screen bg-shell-canvas text-shell-ink">
      <a className="skip-link" href="#main-content">{skipLabel}</a>
      <header>{brand link, mobile navigation trigger, utility}</header>
      <div className={variant === "join" ? "mx-auto max-w-3xl" : "lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]"}>
        {navigation}
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
      {afterMain}
    </div>

    Use existing `--shell-*` Tailwind tokens and `Button`/`Sheet`; add no new CSS token or dependency.

    Implement the remaining primitives as semantic wrappers:

    - `InternalPageHeader`: one supplied H1, optional eyebrow/description/actions.
    - `InternalSection`: labelled `section` with optional H2 and description.
    - `InternalStatusBadge`: text plus tone, never color alone.
    - `InternalTableFrame`: labelled wrapper with `overflow-x-auto`; it never rewrites table semantics.
    - `InternalEmptyState`: H2 or H3 chosen explicitly by prop, description, optional action.
    - `InternalActionFeedback`: `role="alert"` for error and `role="status"` for success/pending.

- [ ] **Step 4: Run GREEN and the import-boundary test**

    Run:

    npm.cmd test -- tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts tests/unit/public-shell-tokens.test.ts

    Expected: PASS in both message catalogs with exact inventories, active states, landmarks, drawer behavior, and existing token coverage.

    Run:

    rg -n "@/components/layout/(site-header|desktop-mega-navigation|mobile-navigation)|announcement-bar" components/internal-shell config/internal-navigation.ts

    Expected: zero hits.

- [ ] **Step 5: Commit the primitive slice**

    git add -- ':(literal)config/internal-navigation.ts' ':(literal)components/internal-shell/internal-app-shell.tsx' ':(literal)components/internal-shell/internal-navigation.tsx' ':(literal)components/internal-shell/internal-page-header.tsx' ':(literal)components/internal-shell/internal-section.tsx' ':(literal)components/internal-shell/internal-status-badge.tsx' ':(literal)components/internal-shell/internal-table-frame.tsx' ':(literal)components/internal-shell/internal-empty-state.tsx' ':(literal)components/internal-shell/internal-action-feedback.tsx' ':(literal)components/internal-shell/index.ts' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/internal-navigation.test.tsx' ':(literal)tests/unit/internal-shell.test.tsx' ':(literal)tests/unit/wisetech-pr6-route-inventory.test.ts'
    git commit -m "feat: add internal application shell"

### Task 7: Apply the compact transactional shell to Join and member login

**Files:**

- Modify: `app/[locale]/(join)/layout.tsx`.
- Modify: `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`, `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(join)/member-login/page.tsx`.
- Modify: `components/join/join-form.tsx`, `components/join/progress.tsx`, `components/billing/checkout-status.tsx`.
- Create test: `tests/unit/wisetech-pr6-join-shell.test.tsx`.
- Modify tests: `tests/unit/join-page.test.tsx`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/member-login-page.test.tsx`, `tests/unit/page-indexability.test.ts`, `tests/unit/locale-switcher.test.tsx`, `tests/e2e/join-auth.spec.ts`. Task 2 owns its interval-valid/invalid journey semantics; Task 7 adds only shell, locale, viewport, overflow, and forged-presentation assertions to the already-GREEN suite.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: Task 6 `InternalAppShell`, `InternalNavigation`, `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, the existing `LocaleSwitcher` and `Navigation` locale-label authority, Task 2 Join outcomes, and Task 3 member login.
- Produces no new Join reader, action, repository, auth, or billing owner.

- [ ] **Step 1: Write the failing Join shell/rendering contract**

    The test reads all six transactional page sources and renders representative entry, profile, company, processing, review, active, invalid-plan, invalid-continuation, and sent states. Require:

    - the layout imports `@/components/internal-shell` and no public shell/navigation component;
    - exactly one `main#main-content` comes from the layout;
    - one visible H1 per rendered page state;
    - the skip link targets `#main-content`;
    - WTIA home and Membership links are locale-correct;
    - the existing `LocaleSwitcher` is mounted through `InternalAppShell.utility`;
    - switching EN to zh-HK and zh-HK to EN on `/join?plan=startup&interval=annual#join-form` retains the exact pathname, serialized query, and hash passed to the locale-aware router;
    - form field names, labels, hidden/bound context, action functions, and `JoinProgress` step order remain unchanged;
    - input/button targets retain `min-h-11`;
    - invalid plan/interval/continuation states have localized recovery and make no repository/provider call.

    Add the exact browser URLs:

    /join?plan=startup&interval=annual
    /zh/join?plan=startup&interval=annual
    /member-login
    /zh/member-login

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts tests/unit/locale-switcher.test.tsx

    Expected: FAIL because the transactional layout still owns bespoke markup and Join states do not use internal presentation primitives.

- [ ] **Step 3: Adopt the compact shell without changing behavior owners**

    Replace the layout frame with `InternalAppShell variant="join"`. Load the existing `Navigation` locale labels, mount one existing `LocaleSwitcher` through `InternalAppShell.utility`, and pass localized skip, brand, home, and Membership labels. Use the compact navigation variant for the two locale-correct links; do not mount the public header, public footer, or mega menu.

    Replace each page's repeated card header/state markup with the exact semantic primitive:

    | Route | Primitive use |
    | --- | --- |
    | `/join` | `InternalPageHeader` plus `InternalActionFeedback` for invalid/sent/provider state |
    | `/join/profile` | `InternalPageHeader` and `InternalSection` around the existing form |
    | `/join/company` | `InternalPageHeader` and `InternalSection` around the existing form |
    | `/join/checkout` | layout only; it remains a server redirect after actor/state validation |
    | `/join/complete` | `InternalPageHeader` plus durable `InternalStatusBadge`/`CheckoutStatus` |
    | `/member-login` | `InternalPageHeader`, `InternalSection`, and `InternalActionFeedback` |

    Preserve every field name, autocomplete value, action binding, query contract, metadata `index: false` setting, and server redirect from Tasks 2-4. Presentation components receive localized strings only.

- [ ] **Step 4: Run GREEN and credential-free bilingual Join checks**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts tests/unit/locale-switcher.test.tsx

    Expected: PASS with one H1/main, exact form/action contracts, no public-shell import, one utility locale switcher, and exact EN/zh-HK path/query/hash retention.

    Run:

    npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts

    Expected: PASS at widths below 400 px in English and Chinese; no provider call occurs during render/validation, no horizontal document overflow appears, and forged status input does not create a terminal state.

- [ ] **Step 5: Commit the Join presentation slice**

    git add -- ':(literal)app/[locale]/(join)/layout.tsx' ':(literal)app/[locale]/(join)/join/page.tsx' ':(literal)app/[locale]/(join)/join/profile/page.tsx' ':(literal)app/[locale]/(join)/join/company/page.tsx' ':(literal)app/[locale]/(join)/join/checkout/page.tsx' ':(literal)app/[locale]/(join)/join/complete/page.tsx' ':(literal)app/[locale]/(join)/member-login/page.tsx' ':(literal)components/join/join-form.tsx' ':(literal)components/join/progress.tsx' ':(literal)components/billing/checkout-status.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-join-shell.test.tsx' ':(literal)tests/unit/join-page.test.tsx' ':(literal)tests/unit/join-billing-pages.test.tsx' ':(literal)tests/unit/member-login-page.test.tsx' ':(literal)tests/unit/page-indexability.test.ts' ':(literal)tests/unit/locale-switcher.test.tsx' ':(literal)tests/e2e/join-auth.spec.ts'
    git commit -m "feat: align transactional join shell"

### Task 8: Apply the application shell to all Portal pages and fail closed on ambiguous company context

**Files:**

- Create: `lib/portal/company-context.ts`, `tests/unit/portal-company-context.test.ts`, `tests/unit/wisetech-pr6-portal-shell.test.tsx`.
- Modify: `app/[locale]/(member)/portal/layout.tsx`, `components/portal/portal-nav.tsx`.
- Modify all ten Portal pages: `app/[locale]/(member)/portal/page.tsx`, `app/[locale]/(member)/portal/profile/page.tsx`, `app/[locale]/(member)/portal/company/page.tsx`, `app/[locale]/(member)/portal/company/listing/page.tsx`, `app/[locale]/(member)/portal/company/seats/page.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`, `app/[locale]/(member)/portal/directory/page.tsx`, `app/[locale]/(member)/portal/events/page.tsx`, `app/[locale]/(member)/portal/documents/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`.
- Modify presentation components: `components/portal/status-card.tsx`, `components/portal/directory-results.tsx`, `components/portal/document-list.tsx`, `components/portal/event-registration-form.tsx`, `components/portal/seat-invite-form.tsx`, `components/portal/seat-table.tsx`, `components/portal/showcase-listing-form.tsx`, `components/billing/billing-actions.tsx`.
- Modify tests: `tests/unit/portal-presentational.test.tsx`, `tests/unit/portal-content-scope.test.ts`, `tests/unit/portal-content-runtime-authorization.test.ts`, `tests/unit/portal-billing-actions.test.tsx`, `tests/unit/m5-member-listing.test.tsx`, `tests/unit/concierge-layouts.test.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Produces:

    export type PortalCompanyContext =
      | Readonly<{kind: "ready"; company: DashboardCompany}>
      | Readonly<{kind: "empty"}>
      | Readonly<{kind: "multiple"}>;
    export function selectPortalCompanyContext(
      companies: readonly DashboardCompany[],
    ): PortalCompanyContext;

- [ ] **Step 1: Write failing Portal shell, navigation, company-context, and owner-preservation tests**

    Assert exact eight-item navigation order, grouped semantics, Dashboard exact active state, Listing most-specific active state, seats owned by Company, mobile Sheet focus return, sign-out in both responsive surfaces, and one existing `LocaleSwitcher` mounted through the shell utility. Exercise EN to zh-HK and zh-HK to EN on `/portal/company/listing?status=draft#listing` and retain the exact pathname, serialized query, and hash.

    Assert every Portal page source:

    - remains under the authorized Portal layout;
    - imports no public shell;
    - keeps its current reader/action owner names;
    - uses at least one appropriate internal primitive;
    - contains no Drizzle/server-schema import in a Client Component;
    - does not introduce `/portal/showcase`.

    Company-context tests:

    expect(selectPortalCompanyContext([])).toEqual({kind: "empty"});
    expect(selectPortalCompanyContext([companyA]))
      .toEqual({kind: "ready", company: companyA});
    expect(selectPortalCompanyContext([companyA, companyB]))
      .toEqual({kind: "multiple"});

    Render company, listing, and seats with the multi-company projection and assert neither company's legal name, private listing data, seat email, nor action form appears. Render a localized selection-required message instead; do not add a selector.

    Keep one-company positive tests for profile/company/listing/seats, actor-scoped directory cursor, event eligibility, document empty state, billing-manager filtering, receipt safety, and Concierge count exactly one.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/portal-presentational.test.tsx tests/unit/portal-content-scope.test.ts tests/unit/portal-content-runtime-authorization.test.ts tests/unit/portal-billing-actions.test.tsx tests/unit/m5-member-listing.test.tsx tests/unit/concierge-layouts.test.ts

    Expected: FAIL because Portal uses the flat header nav, pages use repeated cards/headers, and company pages choose `companies[0]` when more than one authorized company exists.

- [ ] **Step 3: Adopt the Portal shell while keeping every data/action owner**

    Build localized Portal groups from `config/internal-navigation.ts` and render them through `InternalNavigation`. Load existing `Navigation` locale labels and pass one existing `LocaleSwitcher` through `InternalAppShell.utility`; pass `PortalSignOutButton` as navigation footer content. Replace the layout's separate `main` with `InternalAppShell variant="portal"` and pass the existing single Concierge widget as `afterMain`.

    Implement `selectPortalCompanyContext` as a pure length check. Company, Listing, and Seats pages must:

    - render current empty state for zero;
    - use the sole authorized company for one;
    - render localized selection-required state and no private record/action for more than one.

    Apply primitives by owner:

    - dashboard/profile/company: `InternalPageHeader`, `InternalSection`, `InternalStatusBadge`;
    - listing/seats: `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, and `InternalTableFrame` where a table already exists;
    - seat acceptance: `InternalPageHeader` plus `InternalActionFeedback`;
    - directory/events/documents/billing: `InternalPageHeader` plus `InternalTableFrame` or `InternalEmptyState` matching the current result.

    Do not change `getDashboard`, profile/company actions, Showcase listing permissions, seat repository rules, directory pagination, event registration action, approved-resource reader, billing ownership, receipt projection, or Concierge runtime.

- [ ] **Step 4: Run GREEN and existing Portal browser gates**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/portal-presentational.test.tsx tests/unit/portal-content-scope.test.ts tests/unit/portal-content-runtime-authorization.test.ts tests/unit/portal-billing-actions.test.tsx tests/unit/m5-member-listing.test.tsx tests/unit/concierge-layouts.test.ts

    Expected: PASS with one main/H1, exact active nav, locale-switch path/query/hash retention, one-company behavior retained, and multi-company private data withheld pending a separate selector decision.

    Run:

    npm.cmd run test:e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts

    Expected: credential-free protection PASS. Authenticated presentation cases run only when the isolated M2 identity/database gate is present; missing gate is recorded as `NOT PASSED`.

- [ ] **Step 5: Commit the Portal presentation slice**

    git add -- ':(literal)lib/portal/company-context.ts' ':(literal)app/[locale]/(member)/portal/layout.tsx' ':(literal)components/portal/portal-nav.tsx' ':(literal)app/[locale]/(member)/portal/page.tsx' ':(literal)app/[locale]/(member)/portal/profile/page.tsx' ':(literal)app/[locale]/(member)/portal/company/page.tsx' ':(literal)app/[locale]/(member)/portal/company/listing/page.tsx' ':(literal)app/[locale]/(member)/portal/company/seats/page.tsx' ':(literal)app/[locale]/(member)/portal/company/seats/accept/page.tsx' ':(literal)app/[locale]/(member)/portal/directory/page.tsx' ':(literal)app/[locale]/(member)/portal/events/page.tsx' ':(literal)app/[locale]/(member)/portal/documents/page.tsx' ':(literal)app/[locale]/(member)/portal/billing/page.tsx' ':(literal)components/portal/status-card.tsx' ':(literal)components/portal/directory-results.tsx' ':(literal)components/portal/document-list.tsx' ':(literal)components/portal/event-registration-form.tsx' ':(literal)components/portal/seat-invite-form.tsx' ':(literal)components/portal/seat-table.tsx' ':(literal)components/portal/showcase-listing-form.tsx' ':(literal)components/billing/billing-actions.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/portal-company-context.test.ts' ':(literal)tests/unit/wisetech-pr6-portal-shell.test.tsx' ':(literal)tests/unit/portal-presentational.test.tsx' ':(literal)tests/unit/portal-content-scope.test.ts' ':(literal)tests/unit/portal-content-runtime-authorization.test.ts' ':(literal)tests/unit/portal-billing-actions.test.tsx' ':(literal)tests/unit/m5-member-listing.test.tsx' ':(literal)tests/unit/concierge-layouts.test.ts' ':(literal)tests/e2e/portal-dashboard.spec.ts' ':(literal)tests/e2e/portal-secondary-pages.spec.ts'
    git commit -m "feat: align member portal shell"

### Task 9: Apply grouped Admin shell to Dashboard and CRM pages

**Files:**

- Modify: `app/[locale]/(admin)/admin/layout.tsx`, `components/admin/admin-nav.tsx`.
- Modify CRM pages: `app/[locale]/(admin)/admin/page.tsx`, `app/[locale]/(admin)/admin/members/page.tsx`, `app/[locale]/(admin)/admin/members/[id]/page.tsx`, `app/[locale]/(admin)/admin/segments/page.tsx`, `app/[locale]/(admin)/admin/at-risk/page.tsx`.
- Modify presentation components: `components/admin/dashboard-tiles.tsx`, `components/admin/member-table.tsx`, `components/admin/member-360.tsx`, `components/admin/member-note-form.tsx`, `components/admin/member-profile-form.tsx`, `components/admin/segment-builder.tsx`, `components/admin/segment-results.tsx`, `components/admin/segment-save-form.tsx`, `components/admin/at-risk-table.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-crm-shell.test.tsx`.
- Modify tests: `tests/unit/admin-presentational.test.tsx`, `tests/unit/admin-dashboard-tiles.test.tsx`, `tests/unit/admin-member-list.test.ts`, `tests/unit/admin-member-page-boundary.test.ts`, `tests/unit/admin-member-profile.test.ts`, `tests/unit/member-note-server-action-boundary.test.ts`, `tests/unit/segment-query.test.ts`, `tests/unit/segment-save-action.test.ts`, `tests/unit/campaign-server-action-auth.test.ts`, `tests/unit/at-risk-repository-boundary.test.ts`, `tests/unit/admin-page-auth.test.ts`, `tests/unit/m2-auth-reset.test.ts`, `tests/unit/m2-runtime-environment.test.ts`, `tests/unit/m2-browser-acceptance-contract.test.ts`.
- Modify isolated fixtures: `tests/fixtures/m2-runtime-env.ts`, `tests/fixtures/m2-reset.ts`, `tests/e2e/m2-admin-crm.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: Task 6 Admin groups and shell primitives, the existing `LocaleSwitcher` and `Navigation` label authority, every existing Admin CRM reader/action, and the current M2 isolated reset/runtime boundary.
- Produces presentation only. `requireAdminPageActor()` remains at layout/page boundaries; independent Server Actions still call `requireAdminActor()` before parsing or repository access.

- [ ] **Step 1: Write failing grouped-navigation, source-owner, and CRM rendering tests**

    Require Admin groups and order:

    - Workspace: Dashboard, Members, At-risk, Segments.
    - Content: Announcements, News, Page Copy, Media, Partners, Landing Partners.
    - Operations: Events, Listings, Cohorts, Approvals, Reports, Automations.

    Assert Dashboard is a visible link and exact-active only at `/admin`. Assert Member detail inherits Members and no unlisted Admin href appears.

    For the five CRM pages, assert one H1/main, grouped navigation label parity in English/Chinese, one existing `LocaleSwitcher` in `InternalAppShell.utility`, EN to zh-HK and zh-HK to EN retention on `/admin/reports?from=2026-01-01&to=2026-12-31#revenue`, honest independent dashboard degradation, Member 360/note actions, exact segment query/export/campaign contracts, at-risk evidence, and existing auth-before-parse source ordering.

    Expand `m2-admin-crm.spec.ts` from its ten-entry sample to the complete inventory. Import `protectedRouteOwnershipInventory`, require exactly 26 `admin` and 19 `api` owners, and materialize every dynamic token through an explicit exhaustive ID-keyed map. `M2_ADMIN_DENIAL_PATHS` contains exactly these concrete pages (the malformed members query remains a separate edge case):

    ```text
    /admin
    /admin/members
    /admin/members/m2-risk-01
    /admin/at-risk
    /admin/segments
    /admin/announcements
    /admin/announcements/00000000-0000-4000-8000-000000000001
    /admin/news
    /admin/news/00000000-0000-4000-8000-000000000001
    /admin/page-copy
    /admin/page-copy/Privacy
    /admin/media
    /admin/media/00000000-0000-4000-8000-000000000001
    /admin/partners
    /admin/partners/00000000-0000-4000-8000-000000000001
    /admin/landing-partners
    /admin/landing-partners/00000000-0000-4000-8000-000000000001
    /admin/events-mgmt
    /admin/events-mgmt/2a000000-0000-4000-8000-000000000001
    /admin/listings-review
    /admin/cohorts
    /admin/cohorts/00000000-0000-4000-8000-000000000001
    /admin/approvals
    /admin/reports
    /admin/reports/board-drafts/00000000-0000-4000-8000-000000000001
    /admin/automations
    ```

    For locale prefixes `""` and `"/zh"`, anonymous, member, and company-admin contexts must receive 404 plus the locale-correct `NotFound` H1 for all 26 pages. Keep anonymous cases in the credential-free describe; member/company-admin cases remain behind the authenticated M2 gate. Run `/admin/members?limit=not-a-number` and its `/zh` peer separately for all three identities so malformed input never weakens auth-first denial.

    Define an exhaustive `M2_PROTECTED_API_DENIAL_CASES` keyed by all 19 API inventory IDs and run it under anonymous, member, and company-admin cookies only inside the separately authorized, fully guarded isolated M2 describe so its before/after database fingerprint is available. Preserve each handler's real authority instead of pretending every API is Admin-only:

    - `GET /api/admin/segments/{seededSegmentId}/export` and same-origin empty `POST /api/admin/media/upload` return 404 for all three non-staff identities before export parsing, form parsing, storage, or audit writes.
    - Cross-origin JSON `POST /api/ai/concierge` and `POST /api/ai/conversations/00000000-0000-4000-8000-000000000001/feedback` return 403 before rate-limit/provider/repository work. `GET /api/auth/m2-denial-unknown` returns the provider gateway's 404 without sending mail. Cookies do not confer any of those capabilities.
    - `GET /api/showcase/m2_invalid/view` is the documented 204 no-op before `recordView`; `GET /api/media/00000000-0000-4000-8000-000000000001` returns 404 before storage; and `POST /api/unsubscribe?token=invalid` returns 400 before suppression. These public/capability routes are tested for safe rejection/no-op, not relabelled as staff routes.
    - Invalid-signature `POST /api/stripe/webhook` returns 400 and invalid `x-woztell-signature` `POST /api/webhooks/woztell` returns 401 before event processing.
    - Missing-Authorization `POST` requests to all nine exact jobs—`aiops-metrics`, `approvals-expirer`, `board-reporter`, `chat-retention`, `engagement-score`, `journey-runner`, `renewal-runner`, `retention-analyst`, and `worker-alert`—return 401 before job-row/audit creation or a runner call.

    Add `readM2ProtectedApiDenialFingerprint` to the guarded fixture and require exact equality before/after the 19-case matrix for the seeded segment export audit, Media registry, chosen Concierge conversation/feedback IDs, invalid Showcase slug/view count, target profile suppression state, invalid webhook event/message IDs, all nine job-run keys, and related audit rows. Any response/status mismatch, inventory omission, side-effect drift, provider/storage call, or fingerprint-read failure fails the suite. Extend `m2-browser-acceptance-contract.test.ts` to source-assert the exact 26/19 counts, two locale prefixes, three identity contexts, method/status table, auth-first grouping, exhaustive inventory-key equality, and before/after fingerprint.

    Extend the existing M2 safety tests to require `M2_ACCEPTANCE_ALLOW_DESTRUCTIVE=M2_ISOLATED_FIXTURES_ONLY`, `M2_E2E_ALLOWED_ORIGIN`, and `NEON_PROJECT_ID` in the centralized `M2_LIVE_ENV_NAMES` list and exact runtime-environment contract. Assert missing/wrong sentinel, missing/mismatched origin, missing project ID, production target/host, non-Neon host, project mismatch, raw `DATABASE_URL !== DATABASE_URL_TEST`, and missing TLS all fail before `connect` or `seedM2`. Assert `m2-admin-crm.spec.ts` calls the guarded reset in both `beforeAll` and `afterAll`, and cleanup failure fails the suite.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/admin-presentational.test.tsx tests/unit/admin-dashboard-tiles.test.tsx tests/unit/admin-member-list.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-member-profile.test.ts tests/unit/member-note-server-action-boundary.test.ts tests/unit/segment-query.test.ts tests/unit/segment-save-action.test.ts tests/unit/campaign-server-action-auth.test.ts tests/unit/at-risk-repository-boundary.test.ts tests/unit/admin-page-auth.test.ts tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts

    Expected: FAIL because Admin navigation is flat, Dashboard is reachable only through the brand, CRM pages do not use the shared internal presentation family, M2 reset can seed/mutate without the new explicit destructive sentinel/target-origin contract, and the browser suite covers neither the complete 26-page denial inventory nor all 19 protected API authorities.

- [ ] **Step 3: Adopt Admin shell and CRM primitives without moving authority**

    Build the three localized groups and render `InternalNavigation` from `AdminNav`. Load existing `Navigation` locale labels, mount one existing `LocaleSwitcher` through `InternalAppShell.utility`, and replace the layout frame and separate main with `InternalAppShell variant="admin"`. Keep `await requireAdminPageActor()` before any private child render.

    Add `M2_ACCEPTANCE_DESTRUCTIVE_SENTINEL = "M2_ISOLATED_FIXTURES_ONLY"` and add all three required names—`M2_ACCEPTANCE_ALLOW_DESTRUCTIVE`, `M2_E2E_ALLOWED_ORIGIN`, and `NEON_PROJECT_ID`—to `M2_LIVE_ENV_NAMES`. The runtime-environment test must assert that exact centralized set. Before any delete or `seedM2`, require the exact sentinel, exact `DATABASE_URL === DATABASE_URL_TEST`, canonical TLS, a `.neon.tech` host with no prod/production/live label, `NEON_PROJECT_ID === M2_TEST_NEON_PROJECT_ID`, exact `M2_TEST_NEON_HOST`, and exact `PLAYWRIGHT_BASE_URL` (or managed `APP_URL`) origin equality with `M2_E2E_ALLOWED_ORIGIN`; forbid `hkwtia.vercel.app`. Run the same targeted reset before and after the authenticated describe. It may delete only named M2 mutation rows and rerun `seedM2`; no flag means the authenticated suite skips as `NOT PASSED`, not a mutation.

    Implement the complete page/API matrices and guarded fingerprint exactly as Step 1. Inventory equality is bidirectional: an unmaterialized inventory ID or an extra test case fails before the browser loop. Construct deliberately invalid/capability-free requests only, so the matrix cannot send mail, invoke AI/Stripe/WOZTELL/storage, suppress a real profile, record a view, or run a job. Keep route-specific authority and response semantics unchanged.

    Apply:

    - Dashboard: `InternalPageHeader` and independently guarded `InternalSection` tiles.
    - Members: `InternalPageHeader` and `InternalTableFrame` around the existing table.
    - Member 360: `InternalPageHeader`, `InternalSection`, `InternalStatusBadge`, and existing forms/actions.
    - Segments: `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, and `InternalTableFrame`.
    - At-risk: `InternalPageHeader` and `InternalTableFrame`.

    Keep same-transaction audits, sanitized notes, consent/suppression filtering, frozen campaign recipients, URL-bound idempotency, fixed CSV headers/formula neutralization, and all actor-first repository scopes unchanged.

- [ ] **Step 4: Run GREEN and M2 CRM regressions**

    Run the Step 2 command again.

    Expected: PASS with grouped active navigation, locale-switch retention, unchanged CRM/security assertions, and all unsafe M2 reset/target cases blocked before connection or seed.

    Run:

    npm.cmd run test:e2e -- tests/e2e/m2-admin-crm.spec.ts

    Expected: credential-free anonymous 26-page/two-locale Admin 404 PASS. The isolated anonymous/member/company-admin 19-API matrix, authenticated member/company-admin page matrix, and CRM cases run only after separate mutation approval and the complete M2 variable gate; all 26 pages deny both authenticated roles, every API preserves its route-specific denial/no-op status, the fingerprint is unchanged, and `beforeAll`/`afterAll` both complete deterministic cleanup. Missing approval, sentinel, database identity, origin, or credentials remains `NOT PASSED` and never calls `seedM2`.

- [ ] **Step 5: Commit the Admin CRM slice**

    git add -- ':(literal)app/[locale]/(admin)/admin/layout.tsx' ':(literal)components/admin/admin-nav.tsx' ':(literal)app/[locale]/(admin)/admin/page.tsx' ':(literal)app/[locale]/(admin)/admin/members/page.tsx' ':(literal)app/[locale]/(admin)/admin/members/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/segments/page.tsx' ':(literal)app/[locale]/(admin)/admin/at-risk/page.tsx' ':(literal)components/admin/dashboard-tiles.tsx' ':(literal)components/admin/member-table.tsx' ':(literal)components/admin/member-360.tsx' ':(literal)components/admin/member-note-form.tsx' ':(literal)components/admin/member-profile-form.tsx' ':(literal)components/admin/segment-builder.tsx' ':(literal)components/admin/segment-results.tsx' ':(literal)components/admin/segment-save-form.tsx' ':(literal)components/admin/at-risk-table.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-crm-shell.test.tsx' ':(literal)tests/unit/admin-presentational.test.tsx' ':(literal)tests/unit/admin-dashboard-tiles.test.tsx' ':(literal)tests/unit/admin-member-list.test.ts' ':(literal)tests/unit/admin-member-page-boundary.test.ts' ':(literal)tests/unit/admin-member-profile.test.ts' ':(literal)tests/unit/member-note-server-action-boundary.test.ts' ':(literal)tests/unit/segment-query.test.ts' ':(literal)tests/unit/segment-save-action.test.ts' ':(literal)tests/unit/campaign-server-action-auth.test.ts' ':(literal)tests/unit/at-risk-repository-boundary.test.ts' ':(literal)tests/unit/admin-page-auth.test.ts' ':(literal)tests/unit/m2-auth-reset.test.ts' ':(literal)tests/unit/m2-runtime-environment.test.ts' ':(literal)tests/unit/m2-browser-acceptance-contract.test.ts' ':(literal)tests/fixtures/m2-runtime-env.ts' ':(literal)tests/fixtures/m2-reset.ts' ':(literal)tests/e2e/m2-admin-crm.spec.ts'
    git commit -m "feat: align admin crm shell"

### Task 10: Align all Admin CMS pages while preserving publication and media locks

**Files:**

- Modify CMS pages: `app/[locale]/(admin)/admin/announcements/page.tsx`, `app/[locale]/(admin)/admin/announcements/[id]/page.tsx`, `app/[locale]/(admin)/admin/news/page.tsx`, `app/[locale]/(admin)/admin/news/[id]/page.tsx`, `app/[locale]/(admin)/admin/page-copy/page.tsx`, `app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx`, `app/[locale]/(admin)/admin/media/page.tsx`, `app/[locale]/(admin)/admin/media/[id]/page.tsx`, `app/[locale]/(admin)/admin/partners/page.tsx`, `app/[locale]/(admin)/admin/partners/[id]/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx`.
- Modify presentation components: `components/admin/announcement-form.tsx`, `components/admin/news-form.tsx`, `components/admin/page-copy-form.tsx`, `components/admin/media-form.tsx`, `components/admin/media-upload-form.tsx`, `components/admin/partner-form.tsx`, `components/admin/landing-partner-form.tsx`, `components/admin/archive-toggle.tsx`.
- Create tests/fixtures: `tests/unit/wisetech-pr6-admin-cms-shell.test.tsx`, `tests/fixtures/m7-acceptance-safety.ts`, `tests/unit/m7-acceptance-safety.test.ts`, `tests/unit/m7-browser-acceptance-contract.test.ts`, `tests/e2e/m7-cms.spec.ts`.
- Modify tests: `tests/unit/admin-announcement-pages-rendered.test.tsx`, `tests/unit/announcement-form-rendered.test.tsx`, `tests/unit/admin-news.test.ts`, `tests/unit/news-actions-auth-order.test.ts`, `tests/unit/page-copy-action-state.test.ts`, `tests/unit/page-copy-scope.test.ts`, `tests/unit/admin-media.test.ts`, `tests/unit/media-upload-form-rendered.test.tsx`, `tests/unit/admin-partner-pages-rendered.test.tsx`, `tests/unit/admin-partners.test.ts`, `tests/unit/partner-media-locking.test.ts`, `tests/unit/admin-server-action-boundaries.test.ts`, `tests/unit/admin-revalidate-path.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes existing announcement, News, Page Copy, Media, Partner, and Landing Partner repositories/actions.
- Produces no new CMS model, publication state, storage adapter, media URL, partner claim, or page-copy scope.
- The test-only fixture produces:

    export type M7PageCopyRowSnapshot = Readonly<{
      id: string;
      locale: "en" | "zh-HK";
      namespace: "Privacy";
      keyPath: "sections.0.body.0";
      value: string;
      updatedByProfileId: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    export type M7PageCopySnapshot = Readonly<{
      rows: Readonly<Record<"en" | "zh-HK", M7PageCopyRowSnapshot | null>>;
      preexistingAuditIds: readonly string[];
      baselineRenderedValues: Readonly<Record<"en" | "zh-HK", string>>;
    }>;

- [ ] **Step 1: Write failing CMS family source and rendering contracts**

    For all twelve pages, require their correct Content navigation owner, one H1/main, internal page/section/table/empty/feedback primitives, localized empty/error states, and preserved action imports.

    Retain focused assertions for:

    - bilingual Announcement and News fields;
    - auth before input parsing;
    - approved Page Copy namespace/leaves only;
    - active-media validation and archive reference lock;
    - provider-neutral Media upload action state;
    - Partner relationship, rights evidence, and active-media locks;
    - Landing Partner publication/archive behavior;
    - exact localized revalidation paths after mutation.

    Add M7 safety RED cases for `M7_ACCEPTANCE_ALLOW_DESTRUCTIVE=M7_ISOLATED_FIXTURES_ONLY`, exact `DATABASE_URL === DATABASE_URL_TEST`, canonical TLS, independently matching `M7_TEST_NEON_PROJECT_ID`/`M7_TEST_NEON_HOST`, non-production host labels, exact `PLAYWRIGHT_BASE_URL === M7_E2E_ALLOWED_ORIGIN === APP_URL` origin, and staff credentials. Every bad case fails before Pool/auth/browser construction.

    Define `m7-cms.spec.ts` as the isolated bilingual acceptance journey. A guarded fixture inserts only run-ID-owned disposable News, Media registry, and reference rows. Page Copy is different: `(locale, namespace, key_path)` is its fixed identity and has no run-ID column. Before mutation, snapshot the complete English and zh-HK row (or explicit absence), existing namespace audit IDs, and both public rendered baseline values for `Privacy` / `sections.0.body.0`; fail before writes if any snapshot read fails. Immediately before submitting, re-read and require exact snapshot equality so concurrent drift cannot be overwritten. Staff edits English and Traditional Chinese News, publishes and observes both public locales, writes exact run-ID-bearing Page Copy values through the real guarded UI and observes both locales, captures each new `page_copy.updated` audit ID by set difference and verifies actor/action/target/metadata ownership, proves the active Media row appears in the guarded Admin list/selector, proves its disposable reference prevents archive, removes only that reference, archives the row, then proves it is absent from the active list/selector and visibly marked archived in Admin. Do not claim the database-only fixture URL resolves: no R2 object exists. Do not upload Blob data or call storage/provider APIs.

    Track Page Copy mutation/audit state separately from News/Media/reference ownership. `afterAll` always uses nested `try/finally` cleanup phases, accumulates every error, and throws one aggregate only after all independently safe phases run. In the Page Copy phase, freshly compute the audit-ID set difference from the pre-run snapshot even if the journey failed before assigning its mutation flag or captured-ID variables, and classify each English and zh-HK tuple independently as exact baseline, exact run value, or external drift. Treat a new audit ID as owned only when its actor, `page_copy.updated` action, fixed tuple target, and run-ID metadata all match. Skip a baseline tuple; restore every exact run-value tuple even if its mutation flag or captured audit ID is missing; preserve and report each true external-drift tuple. A fresh authenticated staff UI may submit the complete namespace, using baseline for the unchanged locale and the snapshotted value (or approved blank representation of prior absence) for each owned run-value locale. Then verify both public locales render baseline and restore exact original metadata/timestamps. If UI restoration fails while a tuple still equals its exact owned run value, use the guarded direct snapshot restore for that tuple to prevent a data leak but report the cache/revalidation failure. Delete only captured or freshly reconstructed mutation/restoration audit IDs that pass the complete ownership predicate; never delete an unexpected audit.

    In an unconditional independent `finally`, delete and verify only run-ID-owned News, Media, reference, and other disposable M7 rows even when authentication, Page Copy mutation, restoration, public verification, or audit cleanup failed. One cleanup failure never suppresses another cleanup attempt. Unit/source contracts cover failure before Page Copy mutation, failure after the database write but before the mutation flag, UI-restoration failure with direct owned fallback, external drift preservation, independently successful run-row cleanup, aggregate errors, and idempotent reruns.

    In `m7-browser-acceptance-contract.test.ts`, read the E2E/fixture sources and require the safety guard before Pool/auth construction, exact bilingual News/Page Copy/Media route markers, run-ID ownership only where a run-ID field exists, both `beforeAll` and `afterAll`, nested aggregate-error cleanup, present/absent Page Copy snapshots, mutation-state recovery, per-locale baseline/run/drift classification, pre-write and pre-restore drift rejection, real-UI restoration plus guarded owned fallback, public baseline re-verification, exact audit-ID set-difference reconstruction/cleanup, full metadata restoration, independently unconditional run-row cleanup, active-list/selector visibility before archive, reference-lock assertion, archived-state/removal assertions, and absence of Blob/storage client imports. In `m7-acceptance-safety.test.ts`, unit-test both prior-row and prior-absence paths, exact snapshot equality, one-locale-only mutation, mutation success before flag/audit capture, unexpected-audit rejection, idempotent owned cleanup, early failure, restoration failure, external-drift preservation, independent run-row cleanup, aggregate errors, and failure before mutation on drift. Run the existing `tests/unit/media-upload-delivery-routes.test.ts` unchanged as the separate non-mutating delivery contract: its dependency-injected storage double proves active uploaded row plus matching object returns 200, an archived/missing row returns 404 before provider access, and revocation is rechecked on every request. This source/unit evidence supplies RED/GREEN coverage without claiming that the database-only M7 fixture owns an R2 object.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/admin-announcement-pages-rendered.test.tsx tests/unit/announcement-form-rendered.test.tsx tests/unit/admin-news.test.ts tests/unit/news-actions-auth-order.test.ts tests/unit/page-copy-action-state.test.ts tests/unit/page-copy-scope.test.ts tests/unit/admin-media.test.ts tests/unit/media-upload-form-rendered.test.tsx tests/unit/media-upload-delivery-routes.test.ts tests/unit/admin-partner-pages-rendered.test.tsx tests/unit/admin-partners.test.ts tests/unit/partner-media-locking.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/admin-revalidate-path.test.ts tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts

    Expected: FAIL on the new presentation/source contract and absent M7 guard/journey; existing publication, authorization, and reference-lock tests remain diagnostic controls.

- [ ] **Step 3: Apply CMS presentation primitives**

    Use `InternalPageHeader` on every list/detail page, `InternalSection` around existing forms/previews, `InternalTableFrame` around existing semantic tables, `InternalEmptyState` for empty repository results, and `InternalActionFeedback` for existing sanitized action state.

    Preserve all form names, hidden IDs, field-level errors, action bindings, repository calls, publication/archive locks, active-media transaction checks, partner provenance, bilingual News requirements, Page Copy allowlist, storage delivery paths, and localized revalidation. Do not add hard-coded production content or synthetic production rows.

    Implement the M7 test-only safety module, run-ID fixture, `M7PageCopySnapshot`, guarded re-read, UI restore, and exact audit/metadata cleanup described in Step 1. Its guarded database connection is constructed only after every exact check; it exposes `prepareM7Fixture`, `snapshotM7PageCopy`, `assertM7PageCopyUnchanged`, `restoreM7PageCopyMetadata`, and `cleanupM7Fixture` for the E2E suite and is forbidden from production imports. Remove no non-owned record, never classify a fixed Page Copy tuple as run-ID-owned, and make cleanup idempotent.

- [ ] **Step 4: Run GREEN and the complete CMS invariant subset**

    Run the Step 2 command again.

    Expected: PASS with all twelve pages aligned, every existing CMS invariant unchanged, every unsafe M7 environment rejected before connection, both present/absent Page Copy snapshot/restore paths and exact audit ownership proven, the guarded E2E journey verified by the non-mutating source contract, and Media delivery/revocation proven with the dependency-injected storage double only. Do not run the mutating M7 browser suite in this task without the separate isolated-mutation approval; absent approval is `NOT PASSED`, not GREEN evidence.

- [ ] **Step 5: Commit the Admin CMS slice**

    git add -- ':(literal)app/[locale]/(admin)/admin/announcements/page.tsx' ':(literal)app/[locale]/(admin)/admin/announcements/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/news/page.tsx' ':(literal)app/[locale]/(admin)/admin/news/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/page-copy/page.tsx' ':(literal)app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx' ':(literal)app/[locale]/(admin)/admin/media/page.tsx' ':(literal)app/[locale]/(admin)/admin/media/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/partners/page.tsx' ':(literal)app/[locale]/(admin)/admin/partners/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/landing-partners/page.tsx' ':(literal)app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx' ':(literal)components/admin/announcement-form.tsx' ':(literal)components/admin/news-form.tsx' ':(literal)components/admin/page-copy-form.tsx' ':(literal)components/admin/media-form.tsx' ':(literal)components/admin/media-upload-form.tsx' ':(literal)components/admin/partner-form.tsx' ':(literal)components/admin/landing-partner-form.tsx' ':(literal)components/admin/archive-toggle.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-cms-shell.test.tsx' ':(literal)tests/unit/admin-announcement-pages-rendered.test.tsx' ':(literal)tests/unit/announcement-form-rendered.test.tsx' ':(literal)tests/unit/admin-news.test.ts' ':(literal)tests/unit/news-actions-auth-order.test.ts' ':(literal)tests/unit/page-copy-action-state.test.ts' ':(literal)tests/unit/page-copy-scope.test.ts' ':(literal)tests/unit/admin-media.test.ts' ':(literal)tests/unit/media-upload-form-rendered.test.tsx' ':(literal)tests/unit/admin-partner-pages-rendered.test.tsx' ':(literal)tests/unit/admin-partners.test.ts' ':(literal)tests/unit/partner-media-locking.test.ts' ':(literal)tests/unit/admin-server-action-boundaries.test.ts' ':(literal)tests/unit/admin-revalidate-path.test.ts' ':(literal)tests/fixtures/m7-acceptance-safety.ts' ':(literal)tests/unit/m7-acceptance-safety.test.ts' ':(literal)tests/unit/m7-browser-acceptance-contract.test.ts' ':(literal)tests/e2e/m7-cms.spec.ts'
    git commit -m "feat: align admin cms shell"

### Task 11: Align Admin Operations pages and freeze lifecycle/audit controls

**Files:**

- Modify Operations pages: `app/[locale]/(admin)/admin/events-mgmt/page.tsx`, `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`, `app/[locale]/(admin)/admin/listings-review/page.tsx`, `app/[locale]/(admin)/admin/cohorts/page.tsx`, `app/[locale]/(admin)/admin/cohorts/[id]/page.tsx`, `app/[locale]/(admin)/admin/approvals/page.tsx`, `app/[locale]/(admin)/admin/reports/page.tsx`, `app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx`, `app/[locale]/(admin)/admin/automations/page.tsx`.
- Modify presentation components: `components/admin/event-form.tsx`, `components/admin/attendee-table.tsx`, `components/admin/showcase-review-table.tsx`, `components/admin/cohort-form.tsx`, `components/admin/cohort-kanban.tsx`, `components/admin/approval-list.tsx`, `components/admin/report-cards.tsx`, `components/admin/board-draft-list.tsx`, `components/admin/safe-generated-content.tsx`, `components/admin/automation-dashboard.tsx`, `components/admin/automation-retry-form.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-operations-shell.test.tsx`.
- Modify tests: `tests/unit/admin-events.test.ts`, `tests/unit/event-check-in.test.ts`, `tests/unit/m5-admin-review.test.tsx`, `tests/unit/admin-cohort-management.test.ts`, `tests/unit/m6-admin-cohorts.test.tsx`, `tests/unit/approval-authorization.test.ts`, `tests/unit/approval-server-action-auth.test.ts`, `tests/unit/approval-list.test.tsx`, `tests/unit/report-reconciliation.test.ts`, `tests/unit/board-reporter-render.test.ts`, `tests/unit/automation-dashboard-review.test.tsx`, `tests/unit/automation-retry.test.ts`, `tests/unit/admin-server-action-boundaries.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes existing Event, Showcase, Cohort, Approval, Report, Board draft, and Automation owners.
- Produces no new transition, approval kind, publish/send control, retry eligibility, or audit path.

- [ ] **Step 1: Write failing Operations family source and rendering contracts**

    For all nine pages, require correct Operations navigation ownership, one H1/main, internal primitives, localized empty/error states, and preserved current reader/action symbols.

    Assert the regression freeze:

    - Event publication/media locks and check-in audit remain;
    - Showcase approval/rejection reason and member/staff permissions remain;
    - Cohort stage transitions remain legal and audited;
    - approval previews stay sanitized and decided/expired handling remains;
    - reports retain reconciled formulas and explicit unavailable values;
    - Board drafts render escaped inert content with no send/publish control;
    - automation rows display safe codes only; retry appears only for eligible failures and writes its audit.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-admin-operations-shell.test.tsx tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/m5-admin-review.test.tsx tests/unit/admin-cohort-management.test.ts tests/unit/m6-admin-cohorts.test.tsx tests/unit/approval-authorization.test.ts tests/unit/approval-server-action-auth.test.ts tests/unit/approval-list.test.tsx tests/unit/report-reconciliation.test.ts tests/unit/board-reporter-render.test.ts tests/unit/automation-dashboard-review.test.tsx tests/unit/automation-retry.test.ts tests/unit/admin-server-action-boundaries.test.ts

    Expected: FAIL only on new shell/presentation assertions while existing lifecycle, audit, and authorization controls remain the comparison baseline.

- [ ] **Step 3: Apply Operations presentation primitives**

    Use `InternalPageHeader`, `InternalSection`, `InternalTableFrame`, `InternalEmptyState`, `InternalStatusBadge`, and `InternalActionFeedback` according to current page content. Keep all repository reads and Server Actions in their current files.

    Do not change Event fields, Showcase review state, Cohort transition matrix, approval decision rules, report formulas, Board draft sanitization, automation retry eligibility, or audit transaction order. Do not add send/publish controls to Board drafts.

- [ ] **Step 4: Run GREEN and M3-M7 focused regression suites**

    Run the Step 2 command again.

    Expected: PASS with all nine Operations pages aligned and all invariant controls unchanged.

    Run:

    npm.cmd test -- tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m4b-runtime-guard.test.ts tests/unit/m5-contracts.test.ts tests/unit/m5-repository.test.ts tests/unit/m6-contracts.test.ts tests/unit/m6-repository.test.ts tests/unit/m7-schema-contract.test.ts tests/unit/m7-media-schema-contract.test.ts

    Expected: PASS. Environment/provider-dependent acceptance remains separately gated.

- [ ] **Step 5: Commit the Admin Operations slice**

    git add -- ':(literal)app/[locale]/(admin)/admin/events-mgmt/page.tsx' ':(literal)app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/listings-review/page.tsx' ':(literal)app/[locale]/(admin)/admin/cohorts/page.tsx' ':(literal)app/[locale]/(admin)/admin/cohorts/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/approvals/page.tsx' ':(literal)app/[locale]/(admin)/admin/reports/page.tsx' ':(literal)app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/automations/page.tsx' ':(literal)components/admin/event-form.tsx' ':(literal)components/admin/attendee-table.tsx' ':(literal)components/admin/showcase-review-table.tsx' ':(literal)components/admin/cohort-form.tsx' ':(literal)components/admin/cohort-kanban.tsx' ':(literal)components/admin/approval-list.tsx' ':(literal)components/admin/report-cards.tsx' ':(literal)components/admin/board-draft-list.tsx' ':(literal)components/admin/safe-generated-content.tsx' ':(literal)components/admin/automation-dashboard.tsx' ':(literal)components/admin/automation-retry-form.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-operations-shell.test.tsx' ':(literal)tests/unit/admin-events.test.ts' ':(literal)tests/unit/event-check-in.test.ts' ':(literal)tests/unit/m5-admin-review.test.tsx' ':(literal)tests/unit/admin-cohort-management.test.ts' ':(literal)tests/unit/m6-admin-cohorts.test.tsx' ':(literal)tests/unit/approval-authorization.test.ts' ':(literal)tests/unit/approval-server-action-auth.test.ts' ':(literal)tests/unit/approval-list.test.tsx' ':(literal)tests/unit/report-reconciliation.test.ts' ':(literal)tests/unit/board-reporter-render.test.ts' ':(literal)tests/unit/automation-dashboard-review.test.tsx' ':(literal)tests/unit/automation-retry.test.ts' ':(literal)tests/unit/admin-server-action-boundaries.test.ts'
    git commit -m "feat: align admin operations shell"

### Task 12: Prove bilingual, accessibility, M1-M7, and delivery gates without widening authority

**Files:**

- Create: `tests/e2e/wisetech-pr6-internal-journeys.spec.ts`, `tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts`, `docs/integration/wisetech-pr6-verification.md`, `docs/integration/wisetech-pr6-pr-body.md`.
- Consume unchanged in final regression commands: `tests/e2e/accessibility.spec.ts`, `tests/e2e/core-pages.spec.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`. Their behavior changes, if any, belong to Tasks 5, 7, or 8 and must be staged there; Task 12 adds no assertion or edit to these files.
- Consume without weakening: Task 1 `tests/e2e/public-shell.spec.ts`; Task 2 `tests/e2e/join-auth.spec.ts`; Task 4 `tests/fixtures/m1-live-acceptance.ts` and `tests/e2e/m1-acceptance.spec.ts`; Task 9 M2 safety/runtime/reset files and `tests/e2e/m2-admin-crm.spec.ts`; Task 10 M7 safety fixture and `tests/e2e/m7-cms.spec.ts`; existing M3-M6 guards and browser suites.
- Modify only if required by measured public-route coverage: `lighthouserc.js`.

**Interfaces:**

- Consumes all Tasks 1-11 and their exact credential-free, deterministic, and isolated acceptance harnesses.
- Produces command-by-command evidence only. It performs no schema migration, production seed/import, provider configuration, merge, deployment, or production mutation. It runs an isolated database/test-provider mutation only after a separate approval is recorded and every suite-specific guard below passes.

- [ ] **Step 1: Define final credential-free and authenticated browser verification matrices**

    This is final verification, not a manufactured RED step. Every behavior assertion should already be GREEN after Tasks 1-11. If a new assertion fails, record it, return the change to its owning task, obtain an immutable review for that fix, and rerun this step.

    In `wisetech-pr6-internal-journeys.spec.ts`, cover both locales at widths 320, 375, 768, 1024, and 1280. At each width, assert:

    - `/join?plan=startup&interval=annual`, `/zh/join?plan=startup&interval=annual`, `/member-login`, and `/zh/member-login` are under 400, have one H1 and one `main#main-content`, have no document overflow, and expose one 44 px locale control;
    - invalid Join plan/interval, invalid or multi-valued continuation, and forged completion fail closed without provider or database mutation;
    - each stable Portal destination redirects anonymous users to localized member login with its exact canonical `next`; `/portal/showcase` and the token acceptance route are not generic continuations;
    - anonymous Admin remains a real localized 404;
    - the skip link, visible focus, mobile drawer Escape/focus return, one main/H1, 44 px controls, and table-local overflow contracts hold wherever their surface is reachable;
    - switching locale on representative Join URLs retains exact pathname, serialized query, and hash;
    - request interception fails the test if a credential-free case reaches Stripe, Neon magic-link send, Resend, WOZTELL, Cloudflare jobs, storage mutation, database mutation, invitation acceptance, or another mutating API. Do not synthesize authenticated HTML.

    In `wisetech-pr6-authenticated-accessibility.spec.ts`, use the real guarded identities and run this exact EN/zh-HK route matrix at all five widths:

    | Surface | English | Traditional Chinese | Guarded identity/fixture |
    | --- | --- | --- | --- |
    | Join | `/join?plan=startup&interval=annual#join-form` | `/zh/join?plan=startup&interval=annual#join-form` | credential-free |
    | Portal | `/portal` | `/zh/portal` | M2 member |
    | CRM | `/admin/members` | `/zh/admin/members` | M2 staff |
    | CMS | `/admin/news` | `/zh/admin/news` | M7 staff |
    | Reports | `/admin/reports` | `/zh/admin/reports` | M2 staff |
    | Automations | `/admin/automations` | `/zh/admin/automations` | M3 staff |

    For all 60 route/width cases, require zero serious/critical Axe violations, one H1/main, no document overflow, visible keyboard focus, and no console/page error. For Portal and Admin, widths 320, 375, and 768 require the mobile trigger, Escape close, and focus return; widths 1024 and 1280 require the desktop sidebar and no mobile trigger. Join retains its compact navigation and reachable locale control at all five widths. On `/portal/company/listing?status=draft#listing`, `/admin/reports?from=2026-01-01&to=2026-12-31#revenue`, and the Join URL above, switch EN to zh-HK and back and require exact serialized query/hash retention. The suite must skip as `NOT PASSED` before login if any required guard is absent; it may never fake auth state.

- [ ] **Step 2: Run the focused PR6 cross-surface aggregate**

    Run:

    npm.cmd test -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-links.test.tsx tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/m1-live-acceptance-safety.test.ts tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/locale-switcher.test.tsx tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts tests/unit/wisetech-pr6-admin-operations-shell.test.tsx

    Expected: PASS. Record timestamp, exit code, files, test total, warnings, and skips.

- [ ] **Step 3: Run dependency, static, unit, lint, type, build, security, and diff gates**

    Run each separately and record its exact result:

    npm.cmd ci
    npm.cmd run audit:strings
    npm.cmd test
    npm.cmd run lint
    npm.cmd run typecheck
    npm.cmd run build
    npm.cmd audit --omit=dev --audit-level=high
    git diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD

    Expected: source gates PASS; audit reports zero high vulnerabilities. If a command is blocked by the existing worktree junction, missing credential, or external environment, record the exact command/error and classify it as a baseline/environment gate, not a passing result and not a PR6 regression without reproduction against the base.

- [ ] **Step 4: Run credential-free and complete repository browser gates**

    Run:

    npm.cmd run test:e2e -- tests/e2e/wisetech-pr6-internal-journeys.spec.ts tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/core-pages.spec.ts tests/e2e/join-auth.spec.ts tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts

    Expected: credential-free PR6 cases PASS at the exact locale/width matrix without provider or mutation traffic.

    Run:

    npm.cmd run test:e2e

    Expected: the complete repository browser gate PASS or record every credential-gated skip/failure without converting it to acceptance. A skipped M1, M2, M3, M4B, M4C, M5, M6, M7, or authenticated Axe suite is `NOT PASSED`.

- [ ] **Step 5: Prove safety contracts, then run isolated M1-M7 only with separate authority**

    First run the non-mutating safety-contract command:

    npm.cmd test -- tests/unit/m1-live-acceptance-safety.test.ts tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m4b-runtime-guard.test.ts tests/unit/m4b-e2e-safety.test.ts tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m7-acceptance-safety.test.ts

    Expected: PASS with every destructive, provider, database, and target guard failing closed before client construction.

    Record a separate operator approval reference in the verification document before setting any destructive/provider sentinel. Never print values. Required variables are exact:

    - M1: `M1_ACCEPTANCE_ALLOW_DESTRUCTIVE=M1_ISOLATED_FIXTURES_ONLY`, `M1_ACCEPTANCE_ALLOW_PROVIDER_CALLS=M1_TEST_PROVIDERS_ONLY`, `DATABASE_URL_TEST`, equal runtime `DATABASE_URL`, `NEON_PROJECT_ID`, matching `M1_TEST_NEON_PROJECT_ID`, matching `M1_TEST_NEON_HOST`, `PLAYWRIGHT_BASE_URL`, identical `M1_E2E_ALLOWED_ORIGIN` and `APP_URL` origins, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, `STRIPE_TEST_CORPORATE_PRICE_ID`, `M1_TEST_MEMBER_EMAIL`, `M1_TEST_INVITEE_EMAIL`, `M1_TEST_OVERFLOW_EMAIL`, `M1_TEST_MAGIC_LINK_INBOX_URL`, `M1_TEST_MAGIC_LINK_INBOX_ALLOWED_ORIGIN`, and `M1_TEST_MAGIC_LINK_INBOX_TOKEN`.
    - M2: `M2_ACCEPTANCE_ALLOW_DESTRUCTIVE=M2_ISOLATED_FIXTURES_ONLY`, `DATABASE_URL_TEST`, equal mapped runtime `DATABASE_URL`, `NEON_PROJECT_ID`, matching `M2_TEST_NEON_PROJECT_ID`, matching `M2_TEST_NEON_HOST`, `PLAYWRIGHT_BASE_URL` or managed `APP_URL`, exact `M2_E2E_ALLOWED_ORIGIN`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, `STRIPE_TEST_CORPORATE_PRICE_ID`, `M2_TEST_STAFF_EMAIL`, `M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`, `M2_TEST_MEMBER_PASSWORD`, `M2_TEST_COMPANY_ADMIN_EMAIL`, and `M2_TEST_COMPANY_ADMIN_PASSWORD`.
    - M3: `M3_ACCEPTANCE_ALLOW_DESTRUCTIVE=isolated-preview`, `DATABASE_URL_TEST`, independently different runtime `DATABASE_URL` where the existing integration guard requires it, `M3_ACCEPTANCE_EXPECTED_DB_HOST`, `PLAYWRIGHT_BASE_URL`, `M3_E2E_ALLOWED_ORIGIN`, `M3_TEST_STAFF_EMAIL`, `M3_TEST_STAFF_PASSWORD`, `M3_TEST_MEMBER_EMAIL`, `M3_TEST_MEMBER_PASSWORD`, `M3_TEST_UNSUBSCRIBE_TOKEN_EN`, `M3_TEST_UNSUBSCRIBE_TOKEN_ZH_HK`, and `VERCEL_SHARE_TOKEN` when Preview protection requires it.
    - M4B: `PLAYWRIGHT_BASE_URL`, `M4B_E2E_ALLOWED_ORIGIN`, `VERCEL_ENV=preview` or `M4B_E2E_PREVIEW_ONLY=true`, `M4B_TEST_STAFF_EMAIL`, `M4B_TEST_STAFF_PASSWORD`, `M4B_TEST_MEMBER_EMAIL`, `M4B_TEST_MEMBER_PASSWORD`, and `VERCEL_SHARE_TOKEN` when required.
    - M4C: non-production `PLAYWRIGHT_BASE_URL` and `VERCEL_SHARE_TOKEN` when required; it is read-only and must continue to assert the private canary is absent.
    - M5: non-production `PLAYWRIGHT_BASE_URL`, `M5_ACCEPTANCE_EMAIL`, and `M5_ACCEPTANCE_PASSWORD`; the existing browser case is read-only.
    - M6: managed loopback only, `M6_ACCEPTANCE_SEED=true`, `DATABASE_URL_TEST`, equal runtime `DATABASE_URL`, `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `M6_TEST_MEMBER_EMAIL`, `M6_TEST_MEMBER_PASSWORD`, `M6_TEST_MEMBER_COMPANY_DISPLAY_NAME`, `M6_TEST_STAFF_EMAIL`, `M6_TEST_STAFF_PASSWORD`, and `M6_TEST_GRADUATE_COMPANY_DISPLAY_NAME`.
    - M7: `M7_ACCEPTANCE_ALLOW_DESTRUCTIVE=M7_ISOLATED_FIXTURES_ONLY`, `DATABASE_URL_TEST`, equal runtime `DATABASE_URL`, `NEON_PROJECT_ID`, matching `M7_TEST_NEON_PROJECT_ID`, matching `M7_TEST_NEON_HOST`, `PLAYWRIGHT_BASE_URL`, identical `M7_E2E_ALLOWED_ORIGIN` and `APP_URL` origins, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `M7_TEST_STAFF_EMAIL`, and `M7_TEST_STAFF_PASSWORD`.

    Each target guard requires canonical URLs, exact origins, non-production hosts/projects, and its existing allowlist evidence. M1 independently disposes owned Stripe objects, deletes the run-owned Join/company/invitation/seat graph, and drift-safely restores the full owner/invitee profile snapshots. M2 performs deterministic named cleanup before and after. M7 uses aggregate-error cleanup: it reconciles/restores fixed Page Copy tuples and exact audit IDs while an unconditional independent phase deletes run-ID-owned News/Media/reference rows. Any cleanup, snapshot, drift, audit-ownership, identity-restoration, seat-residue, or public-baseline restoration failure fails the command. Existing M3 and M6 may run only under their documented isolated reset/seed lifecycle, and the verification record must show restoration evidence or mark that milestone `NOT PASSED`. Preview mutation, provider calls, or fixture reset remain forbidden until the separate approval explicitly names those suites and targets.

    With approval and complete variables, run each suite separately for attributable evidence:

    npm.cmd run test:e2e -- tests/e2e/m1-acceptance.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m2-admin-crm.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m3-automations.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m4b-agents.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m4c-aiops.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m5-showcase.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m6-launch-pad.spec.ts
    npm.cmd run test:e2e -- tests/e2e/m7-cms.spec.ts
    npm.cmd run test:e2e -- tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts

    Required outcomes:

    - M1 proves advertised annual interval, owner magic-link continuation, run-marked profile/company onboarding, persisted interval, both configured annual Stripe Price metadata, exact Checkout Price, signed webhook activation, completion, localized Billing Portal, receipts/secondary pages, a distinct invitee magic-link callback and one-time acceptance in a fresh context, exact active-seat counts of one before invitation, two after acceptance, and `seatLimit` before overflow, exact durable capacity denial with no overflow invitation or message across the bounded observation window, both sign-outs, independent required provider/database cleanup, drift-safe full restoration of owner/invitee profile snapshots, and exact ledgers of retained immutable Stripe/mailbox test records.
    - M2 proves all 26 Admin pages across two locales and anonymous/member/company-admin identities, the exact route-specific negative authority/no-op contract for all 19 protected API handlers with an unchanged side-effect fingerprint, plus Member 360, notes, segments/CSV/campaign, at-risk, check-in, approvals, reports, audits, and deterministic before/after reset.
    - M3 proves automation data and one eligible audited retry while sent/ineligible rows are denied; unsubscribe mutation remains isolated, and missing restoration evidence is `NOT PASSED`.
    - M4B proves retention approvals and inert Board draft preview; M4C proves bilingual privacy-safe AI-Ops without canary leakage.
    - M5 proves canonical listing manager/member permissions and staff review/rejection reason.
    - M6 proves legal cohort transitions and stage audit under its existing managed-loopback seed guard.
    - M7 proves bilingual News, approved Page Copy, and Media lifecycle/reference locks through the real guarded UI; Page Copy evidence includes exact prior-present/prior-absent snapshot, drift guard, UI restoration, public baseline re-verification, metadata restoration, and exact test-created audit-ID cleanup.
    - Authenticated accessibility proves the exact 60-case route/locale/width matrix.

    Missing separate authority, database, identities, test providers, allowlist, or cleanup capability means `NOT PASSED`. Do not seed, send, accept, mutate, or clean a live/Preview target without that separate approval.

- [ ] **Step 6: Run Lighthouse and field-performance gates**

    Run:

    npm.cmd run test:lighthouse

    Expected: on an authorized reachable target, performance is at least 0.90, accessibility at least 0.95, and SEO at least 0.95. Record LCP at most 2.5 s and CLS at most 0.1 from Lighthouse. Record INP at most 200 ms at p75 only from authorized field/Preview evidence; if unavailable, mark the INP gate `NOT PASSED`. Do not upload private authenticated pages to public temporary storage.

- [ ] **Step 7: Write the verification record and prove the committed range**

    In `docs/integration/wisetech-pr6-verification.md` record:

    - immutable PR5 base and PR6 head;
    - every command, timestamp, exit code, totals, warnings, skips, exact blocker, and separate operator-approval reference when an isolated suite ran;
    - RED and GREEN evidence for Tasks 1-11, plus Task 12 aggregate verification without fabricated RED;
    - independent per-task review result;
    - credential-free versus isolated-authenticated evidence;
    - external gates as `PASSED` or `NOT PASSED` with no implied acceptance;
    - confirmation of no schema migration, production seed/import, provider configuration, or production action;
    - exact disposable cleanup evidence for each authorized mutating suite, including M1 owner/invitee full-profile snapshots, allowed checkpoints, drift-safe restoration, invite/seat residue checks and independent cleanup errors, plus M7 Page Copy present/absent mutation state, drift checks, UI/direct-owned restoration, unconditional run-row cleanup, full metadata equality, and exact audit-ID dispositions;
    - source-only rollback: revert PR6 commits to PR5 head.

    Create `docs/integration/wisetech-pr6-pr-body.md` with this exact reviewable body:

    ## Summary

    - Align Join, Portal, and Admin with shared internal application-shell primitives.
    - Add explicit member login and Portal sign-out while preserving Neon Auth ownership.
    - Carry durable billing interval through Join, checkout, completion, and localized Billing Portal return.
    - Preserve existing M1-M7 authorization, audit, lifecycle, seat, CMS, CRM, automation, and Concierge authorities.

    ## Verification

    See `docs/integration/wisetech-pr6-verification.md` for exact commands, totals, skips, blockers, and external gates.

    ## Safety

    No schema migration, production seed/import, provider configuration, production mutation, merge, or deployment is included. Isolated fixture/provider evidence ran only where the linked verification record names separate authority and deterministic cleanup.

    Run:

    git diff --name-status 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD
    git log --oneline 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae..HEAD
    git diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD
    git status --short

    Expected: only approved PR6 files, cohesive commits, no whitespace errors, and a clean worktree after the verification record commit.

- [ ] **Step 8: Commit only the browser/evidence slice**

    git add -- ':(literal)tests/e2e/wisetech-pr6-internal-journeys.spec.ts' ':(literal)tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts' ':(literal)docs/integration/wisetech-pr6-verification.md' ':(literal)docs/integration/wisetech-pr6-pr-body.md'
    git commit -m "test: verify PR6 internal journeys"

    If `lighthouserc.js` changed only to add approved public/member-login route collection without exposing authenticated URLs, stage that exact file with `git add -- ':(literal)lighthouserc.js'` before the commit. Do not stage test results, traces, credentials, environment files, generated runtime output, or unrelated changes.

- [ ] **Step 9: Complete independent review and publish the stacked draft PR**

    Generate the final immutable review package from PR5 head to the committed PR6 head. A fresh reviewer must inspect the approved spec, this plan, the complete diff, focused RED/GREEN evidence, full verification record, authorization/import boundaries, and rollback statement. Resolve findings and repeat review until the result is zero Critical, zero Important, and zero Minor.

    Confirm the exact branch, clean state, immutable local head, and immutable remote base:

    git branch --show-current
    git status --short
    git rev-parse HEAD
    $expectedBase = "3856dd71842f9a2e1d9c4b7a46521416a5bd83ae"
    $remoteBaseLine = git ls-remote origin refs/heads/codex/wisetech-pr5-public-journeys
    if ($LASTEXITCODE -ne 0) { throw "PR6_REMOTE_BASE_LOOKUP_FAILED" }
    $remoteBase = ($remoteBaseLine -split "\s+")[0]
    if ($remoteBase -cne $expectedBase) { throw "PR6_REMOTE_BASE_DRIFT" }

    Expected: `codex/wisetech-pr6-join-portal-admin`, no worktree changes, the reviewed local head SHA, and remote PR5 base exactly `3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`. Stop before push if the base drifted.

    Push only the reviewed branch:

    git push --set-upstream origin codex/wisetech-pr6-join-portal-admin

    Open the stacked draft pull request:

    gh pr create --draft --base codex/wisetech-pr5-public-journeys --head codex/wisetech-pr6-join-portal-admin --title "feat: align WiseTech Join Portal and Admin" --body-file docs/integration/wisetech-pr6-pr-body.md

    Verify published body, refs, immutable OIDs, remote head, and observed checks:

    $localHead = git rev-parse HEAD
    $published = gh pr view --json url,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,body,mergeStateStatus,statusCheckRollup | ConvertFrom-Json
    $expectedBody = ((Get-Content -Raw -LiteralPath "docs/integration/wisetech-pr6-pr-body.md") -replace "`r`n", "`n").TrimEnd("`r", "`n")
    $publishedBody = ($published.body -replace "`r`n", "`n").TrimEnd("`r", "`n")
    if ($published.state -cne "OPEN") { throw "PR6_PR_NOT_OPEN" }
    if ($published.isDraft -ne $true) { throw "PR6_PR_NOT_DRAFT" }
    if ($publishedBody -cne $expectedBody) { throw "PR6_PR_BODY_MISMATCH" }
    if ($published.baseRefName -cne "codex/wisetech-pr5-public-journeys" -or $published.baseRefOid -cne $expectedBase) { throw "PR6_PR_BASE_MISMATCH" }
    if ($published.headRefName -cne "codex/wisetech-pr6-join-portal-admin" -or $published.headRefOid -cne $localHead) { throw "PR6_PR_HEAD_MISMATCH" }
    $remoteHeadLine = git ls-remote origin refs/heads/codex/wisetech-pr6-join-portal-admin
    if ($LASTEXITCODE -ne 0) { throw "PR6_REMOTE_HEAD_LOOKUP_FAILED" }
    $remoteHead = ($remoteHeadLine -split "\s+")[0]
    if ($remoteHead -cne $localHead) { throw "PR6_REMOTE_HEAD_MISMATCH" }

    Expected: OPEN draft PR, exact reviewed body, base name/OID `codex/wisetech-pr5-public-journeys`/`3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`, head name/OID equal to the reviewed local PR6 head, and remote head equal to that same SHA. Report pending/failing remote checks separately. Do not merge, deploy, mutate providers, or convert an external gate into PASS.


## Self-Review

- Spec coverage: Tasks 1-2 cover the one catalog authority, interval identity, typed Join context/outcomes, direct terminal navigation, durable interval precedence, and explicit membership persistence. Task 3 covers the complete continuation allowlist, explicit noindex member login, one Neon magic-link path, member-only Portal entry, public navigation destinations, and sign-out behavior. Task 4 covers durable checkout pricing, lock projection, webhook-authoritative completion, and localized Billing Portal return. Task 5 covers invitation callback/token identity, replay, expiry, revocation, and provider-free route tests.
- Presentation coverage: Task 6 creates the shared shell family, grouped eight-item Portal and 4/6/6 Admin navigation, active specificity, skip/main/mobile/focus/table/feedback behavior, and exact 6/10/26 route inventories. Tasks 7-8 align every Join/member-login and Portal route while preserving current owners and failing closed on ambiguous company context. Tasks 9-11 align every Admin CRM, CMS, and Operations page while retaining authorization, audits, publication/media locks, approvals, reports, automations, Showcase, and cohort transitions.
- Verification coverage: Task 12 includes exact credential-free and 60-case authenticated accessibility matrices, the 26-page/two-locale/three-identity Admin denial proof, the route-specific 19-API negative-authority fingerprint, the PR6 unit/safety aggregates, `npm.cmd ci`, string audit, full unit/lint/type/build, focused and full Playwright, separately attributable isolated M1-M7 commands with exact variables, M1 distinct invitee/capacity/profile restoration, M7 aggregate Page Copy/run-row restoration, immutable-provider-record dispositions, Lighthouse thresholds, high-vulnerability audit, diff/range/worktree checks, evidence classification, source-only rollback, final independent review, immutable remote-base validation, published-body equality, explicit OPEN/draft assertions, and exact PR base/head/remote OID verification.
- Type consistency: `BillingInterval`, `MembershipSelection`, `MembershipPriceIds`, and the exact `{plans.list, loadPriceIds}` `MembershipCatalogDependencies` boundary originate in Task 1 and all later catalog/Join/checkout signatures consume those names. `PreparedJoinSubmission` and its read-only dependencies are fully defined in Task 2, and only its server-produced draft variant reaches writes. `PortalContinuation` is defined once in Task 2 and consumed by Task 3. `JoinStateDependencies` is fully defined in Task 4. `InternalNavigationGroup` and shell primitive names originate in Task 6 and are used unchanged in Tasks 7-11.
- Placeholder scan: every task names exact files, interfaces, RED/GREEN or final-verification commands, expected failure/pass evidence, production constraints, and an explicit commit. M1 names its provider-lineage ledger, distinct invitee/capacity journey, full identity snapshot/restoration, independent cleanup, and exact deletable/immutable dispositions; M2 names the exact 26-page/19-API authority matrices and denial fingerprint; M7 separates run-ID-owned rows from fixed Page Copy tuples and names mutation state, early/restoration failure, aggregate cleanup, snapshot, drift, UI/direct-owned restoration, metadata, and audit-ID behavior. No implementation step delegates an unspecified error, edge case, test, provider, or data decision.

## Execution Handoff

Execution mode is already approved: Subagent-Driven. After explicit approval of this implementation plan, dispatch one fresh implementer per numbered task. Require its focused RED/GREEN/refactor evidence and exact commit, generate an immutable base/head review package, obtain a fresh independent review with zero Critical, Important, and Minor findings, and only then advance to the next task.

Approval of this plan does not authorize provider calls, database migration/seed/import, Preview mutation, merge, deployment, or production action. Those remain separate gates.
