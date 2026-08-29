# WiseTech PR6 Join, Portal and Admin Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Join, the member Portal, and staff Admin with the WiseTech internal application-shell system while preserving every existing hkwtia authority and closing the member-login, sign-out, billing-interval, onboarding-handoff, completion-state, and locale-return gaps.

**Architecture:** One server-only membership catalog reconciles persisted plan rows, canonical plan metadata, billing interval, and configured Stripe Price IDs. Join returns a discriminated, actor-scoped outcome; member authentication uses one typed Portal-continuation authority; checkout and completion derive state from the durable membership. Shared internal-shell primitives provide responsive navigation and presentation only, while existing Server Components, Server Actions, repositories, authorization, audit, lifecycle, seat, CMS, CRM, automation, and Concierge owners remain in place.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.8, React 19, next-intl 4, Neon Auth, Stripe, Drizzle ORM/Postgres, Zod, Radix Sheet/Dialog, Tailwind CSS, Vitest, Testing Library, Playwright, Axe, Lighthouse CI.

## Global Constraints

- Work from PR6 branch `codex/wisetech-pr6-join-portal-admin` at approved-spec commit `8c83969e9f2244dadf8f9c9e3bc4d4431320c94a`, stacked on PR5 head `3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`.
- Treat `https://github.com/YNWAforever/wisetech` at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, as presentation evidence only. Import no donor runtime, router, data, content, asset, authentication, or provider configuration.
- Add no schema, migration, production seed/import, provider configuration, production session, deployment, merge, or production action. Code for disposable test-fixture reset/insert and test-provider verification may be added only behind the exact isolated-acceptance guards in Tasks 4, 9, 10, 11, and 12; running any such mutation or provider call requires a separate recorded approval and is not authorized by approval of this plan.
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
- Create credential-free and authenticated PR6 browser matrices plus `docs/integration/wisetech-pr6-verification.md`; replace M1's unconditional live skip, harden M2 mutation authority, make M3/M4B/M5 use the guarded managed runtime with complete restoration, add an isolated M7 CMS journey, and replace Lighthouse's local/public-upload fallback with an exact authorized-Preview public-route gate.

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

### Task 2: Carry typed Join context into one atomic durable terminal outcome

**Files:**

- Modify: `lib/membership/join-schema.ts`, `lib/membership/join-navigation.ts`, `lib/membership/onboarding.ts`, `lib/membership/join-service.ts`, `lib/membership/lifecycle.ts`, `lib/automation/enrollment.ts`, `lib/db/repos/applications.ts`, `lib/db/repos/memberships.ts`.
- Create: `lib/membership/join-terminal-state.ts`, `lib/db/repos/join-terminal.ts`.
- Modify: `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`.
- Create tests: `tests/unit/join-terminal-state.test.ts`, `tests/unit/join-terminal-transaction.test.ts`.
- Modify tests: `tests/unit/join-schema.test.ts`, `tests/unit/join-navigation.test.ts`, `tests/unit/join-service.test.ts`, `tests/unit/join-service-review.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/join-actions-profile-identity.test.ts`, `tests/unit/join-page.test.tsx`, `tests/unit/profile-identity-billing.test.ts`, `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/portal-content-scope.test.ts`, `tests/unit/repository-production-security.test.ts`, `tests/e2e/join-auth.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: `resolveMembershipOption(selection)` from Task 1 and existing actor-scoped applications, profiles, companies, memberships, company-member authorization, and journey enrollment.
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
          applicationId: string;
          membershipId: string;
        }>
      | Readonly<{
          kind: "draft";
          applicationId: string | null;
          option: ResolvedMembershipOption;
        }>;
    export type JoinTerminalDescriptor = Readonly<{
      applicationId: string;
      membershipId: string;
    }>;
    export type JoinTerminalProjection = Readonly<{
      outcome: Extract<JoinOutcome, {next: "checkout" | "review" | "complete"}>;
      application: Readonly<{
        currentStep: "checkout" | "review" | "complete";
        status: "pending_payment" | "pending_review" | "completed";
      }>;
      requiresActivationJourney: boolean;
    }>;
    export type JoinTerminalRepository = Readonly<{
      complete(
        actor: Extract<Actor, {kind: "member"}>,
        descriptor: JoinTerminalDescriptor,
      ): Promise<JoinTerminalProjection["outcome"]>;
    }>;
    export type JoinTerminalDependencies = Readonly<{
      terminal: JoinTerminalRepository;
    }>;
    export function projectJoinTerminalState(
      membershipStatus: MembershipStatus,
      ids: JoinTerminalDescriptor,
    ): JoinTerminalProjection;
    export async function prepareJoinSubmission(
      actor: Extract<Actor, {kind: "member"}>,
      rawInput: unknown,
      dependencies?: JoinSubmissionReadDependencies,
    ): Promise<PreparedJoinSubmission>;
    export async function completePreparedTerminal(
      actor: Extract<Actor, {kind: "member"}>,
      descriptor: JoinTerminalDescriptor,
      dependencies?: JoinTerminalDependencies,
    ): Promise<Extract<JoinOutcome, {next: "checkout" | "review" | "complete"}>>;

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
- `PreparedJoinSubmission.kind === "terminal"` deliberately carries only immutable row identities. It never carries a previously read membership status, outcome, application projection, timestamp, version, or journey decision. `completePreparedTerminal` must obtain all of those from rows locked inside its transaction.

- [ ] **Step 1: Write failing schema, state-machine, transaction, service, action, and route-handoff tests**

    Add these focused schema and outcome cases:

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

    In `join-terminal-state.test.ts`, drive the real membership-status union through an exhaustive table. Require exactly:

    - `pending_payment` maps to outcome `checkout` plus application `{currentStep: "checkout", status: "pending_payment"}` and no activation journey;
    - `pending_review` maps to outcome `review` plus application `{currentStep: "review", status: "pending_review"}` and no activation journey;
    - `active` maps to outcome `complete` plus application `{currentStep: "complete", status: "completed"}` and requires the exact `onboarding_90d` activation journey;
    - `past_due`, `cancel_at_period_end`, `cancelled`, and `expired` each throw `MEMBERSHIP_NOT_JOIN_RESUMABLE` before application, journey, catalog, or provider work.

    Require a `never` exhaustiveness assertion in the switch so a future status cannot silently fall into checkout. Test every allowed and rejected application predecessor pair against an explicit matrix: target `pending_payment/checkout` accepts only that exact pair or `draft` at `profile`, `company`, or `checkout`; target `pending_review/review` accepts only that exact pair or `draft` at `profile`, `company`, or `review`; target `completed/complete` accepts only that exact pair, `draft` at `profile`, `company`, or `complete`, `pending_payment/checkout`, or `pending_review/review`. `abandoned` and every other step/status combination are rejected with `JOIN_APPLICATION_STATE_CONFLICT`.

    In `join-terminal-transaction.test.ts`, exercise the real transaction executor and SQL ordering. It must:

    - lock the exact application and membership together with `FOR UPDATE OF membership_applications, memberships` before deriving status or writing;
    - require `membership.applicationId === application.id` and exact plan equality;
    - for a personal target, require `application.applicantUserId === actor.profileId`, null application/company membership targets, and `membership.ownerUserId === actor.profileId`;
    - for a company target, preserve the intersection of the existing application and membership repository authorities: require `membership.ownerUserId === null` and `membership.companyId === application.companyId`, then select and row-lock the current actor's exact active company-member row for that company before writes; do not additionally require `application.applicantUserId === actor.profileId`, and use the locked applicant—not a possibly different acting profile—as the activation-journey profile;
    - prove an active non-applicant company member may resume, while an applicant whose company membership is absent/revoked, an inactive/foreign non-applicant company member, and a non-applicant personal actor all fail before writes;
    - reject missing, foreign, mismatched, abandoned, or incompatible rows before writes;
    - derive the projection from the locked membership status, update only the exact application projection, and for `active` insert every exact `onboarding_90d` step with `instanceKey = "activation:" + membershipId` using `ON CONFLICT DO NOTHING`;
    - verify the complete expected activation-step key set before commit, then return the freshly derived outcome only after commit;
    - make an exact already-projected application plus complete activation-step set idempotent.

    Add scripted races where the status changes after preparation: `pending_payment -> active` must return the fresh complete outcome and atomically complete the application/journey, while `active -> past_due` must fail without mutation. Add application target, plan, abandoned-status, step/status, membership-link, owner, company, and company-member authorization drift cases. Inject application-update, journey-insert, and journey-verification failures and prove the whole terminal transaction rolls back. Prove PostgreSQL microsecond `updated_at` values are irrelevant: no JavaScript `Date` compare-and-swap or stale preflight field participates in correctness.

    Add resume/service tests proving:

    - a membership-bearing application prepares only `{kind: "terminal", applicationId, membershipId}`, and a terminal application with no actor-scoped membership throws `MEMBERSHIP_NOT_FOUND`;
    - a stored annual membership remains annual when query plan/interval is missing or conflicts with the durable row;
    - failures after membership creation or inside terminal completion leave one durable, recoverable membership; retry re-locks fresh rows, performs the atomic application/journey transaction, and returns the durable destination without catalog, profile, company, or provider work;
    - missing, monthly, unknown, multi-valued, or unavailable plan/interval on a new or nonterminal draft performs no profile, company, application, membership, journey, limiter, or provider mutation;
    - Community persists `none` and routes to complete; Patron persists `none` and routes to review.

    In `join-actions.test.ts` and `join-actions-profile-identity.test.ts`, invoke the real bound `saveProfile` and `saveCompany` actions. For each action, require terminal preparation to call `completePreparedTerminal` and receive its committed result before redirect, with zero profile/company/application-creation/membership-creation/catalog/limiter/provider writes outside that transaction. Exercise `checkout`, `review`, `complete`, and all four unsupported membership statuses. A terminal application without its actor-scoped membership fails before mutation. For draft paths, inject `resolveOption` returning `null` and rejecting, and assert zero calls after the resolver to profile upsert, company upsert, application create/update, membership create/update, journey enrollment, limiter, or provider seams.

    At the same action boundary, call `requestMagicLink` with syntactically valid `{plan: "startup", billingInterval: "annual"}` while an injected `resolveMembershipOption` fake returns `null` and while it rejects. Both cases return the same localized unavailable response and call neither `checkAuthSend`, `auth.signIn.magicLink`, nor any non-catalog repository/provider seam after the fake. A separate real-resolver action test permits exactly one read-only `plans.list()` catalog call, then requires zero limiter, auth-provider, profile/company/application/membership/journey mutation, or other repository calls on `null` or rejection. A valid resolved option calls the resolver once and builds the callback from `option.planCode`/`option.billingInterval`, not the raw selection. The `entry: "member-login"` plus null-selection branch never calls the catalog and continues to use only the validated Portal continuation. Assert no `ResolvedMembershipOption` or `stripePriceReference` is serialized into form state, bound arguments, markup, or callback URLs.

    Move `join-auth.spec.ts` into this task's ownership. Change valid Startup URLs at its current entry/resume/sign-in cases to `/join?plan=startup&interval=annual`; use `interval=none` for Community; add missing, `monthly`, unknown, and multi-valued interval cases that show localized fail-closed recovery and emit no observable application mutation request. Browser interception is client-traffic evidence only; the direct Server Action fakes above are the authority for zero Neon/provider/repository/database calls.

    Change the Server Action expectation after `saveCompany` from the dead status-card `/join` loop to:

    expect(redirectState.url)
      .toBe("/join/checkout?membership_id=membership-a");

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-terminal-state.test.ts tests/unit/join-terminal-transaction.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: FAIL because Join input has no interval, membership creation relies on the database default, terminal resume has no membership ID, no shared exhaustive terminal state mapper or cross-row transaction exists, actions do not call committed terminal completion, and actions can write profile/company or send/count a magic link before discovering an unavailable option.

    Run:

    npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts

    Expected: FAIL because the newly written valid journeys require explicit `annual`/`none` context and the new missing, monthly, unknown, and multi-valued interval cases expect fail-closed recovery, while the current browser flow still accepts plan-only/invalid interval input. Record the exact URL/assertion failures as browser RED.

- [ ] **Step 3: Implement fresh locked-state completion and final Join ordering**

    Add `billingIntervalSchema = z.enum(BILLING_INTERVALS)`. Validate scalar query values without making plan/interval authoritative over a durable row: parse the optional scalar application ID independently, and defer plan/interval validation until the flow is known to have no membership. Implement `prepareJoinSubmission` with exact defaults `{applications: applicationsRepository, memberships: membershipsRepository, resolveOption: resolveMembershipOption}`. When an application ID is present, require a member and load the actor-scoped application plus membership first. Any actor-scoped membership, including one paired with a still-draft application after a prior partial failure, must match `application.planCode` and determines plan, interval, ID, and the fact that completion is required even when query plan/interval is absent, invalid, multi-valued, or conflicting. Preparation returns only the two row IDs for this terminal path; it does not derive or cache the status/outcome/projection. A terminal application without that membership throws `MEMBERSHIP_NOT_FOUND`. Only a new/nonterminal draft with no membership parses scalar plan/interval and calls `resolveOption` exactly once. The prepared option and terminal descriptor are server-only and are never accepted from form data or a Client Component.

    Split the mutation phase into internal `continuePreparedJoin(actor, preparedDraft, dependencies)`, `completePreparedApplication(actor, preparedDraft, input, dependencies)`, and `completePreparedTerminal(actor, descriptor, dependencies)` seams. `startJoin` keeps its anonymous no-write draft-ID result. For a member, it calls `prepareJoinSubmission` and then must await `completePreparedTerminal` whenever preparation is terminal; only a draft may call `continuePreparedJoin`. None of the prepared seams re-reads environment or re-resolves the option. This makes the exact order:

    1. Parse only the optional scalar application ID; reject a multi-valued/invalid application ID independently of plan/interval.
    2. If resuming, require a member and load the actor-scoped application plus `memberships.getByApplicationId(actor, application.id)` before interpreting query plan/interval.
    3. If a membership exists, validate only its immutable relation and plan at preflight, return `{kind: "terminal", applicationId, membershipId}`, and defer status, destination, application compatibility, authorization revalidation, and journey decisions to the transaction.
    4. If the application claims a terminal status but its actor-scoped membership is absent, throw `MEMBERSHIP_NOT_FOUND`.
    5. Only for a new/nonterminal draft with no membership, parse scalar plan/interval, verify any application plan against that selection, and call `resolveOption` exactly once to produce `PreparedJoinSubmission.kind === "draft"`; no mutation has occurred.
    6. Only that server-produced prepared draft may reach ordinary profile, company, application, or membership writes.

    Implement `projectJoinTerminalState` as the single exhaustive policy above. There is no default success branch. Every unsupported status throws `MEMBERSHIP_NOT_JOIN_RESUMABLE`, and a compile-time `never` assertion makes the status table total.

    Implement `completePreparedTerminal` with exact default `{terminal: joinTerminalRepository}` and make it return only `await dependencies.terminal.complete(actor, descriptor)`. Implement `joinTerminalRepository.complete(actor, descriptor)` as one database transaction. Its first statement locks the exact joined application and membership rows together. Under those locks it revalidates actor, relation, plan, and personal/company target. Personal completion requires the locked applicant/owner to equal the actor. Company completion preserves the stricter membership-mutation authority while avoiding an applicant-only narrowing: every actor must obtain a blocking row lock on that actor's exact active company-member authorization before any write, but the actor need not equal the application applicant. It retains the locked application applicant as the journey profile even when that applicant differs from the actor. It then re-reads the membership status; calls `projectJoinTerminalState`; and validates the exact predecessor matrix before any write. It then updates the application to the mapper's exact step/status. For `active`, reuse a new exported pure `buildActivationJourneyEnrollment({profileId, membershipId, anchor})` from `lib/automation/enrollment.ts`; the existing `enrollActivatedMembership` delegates to that builder, while the transaction inserts the resulting rows on its own executor with `ON CONFLICT DO NOTHING` and verifies every expected journey/instance/step/delivery key before commit. Use the locked membership's database timestamp only as a stable scheduling anchor, never as a concurrency token. Return the mapper's freshly derived outcome after the transaction commits.

    Do not add a schema column or migration and do not use `updatedAt`/JavaScript `Date` compare-and-swap. The locked application/membership rows, plus the required company-member lock for every company target, are the freshness authority. Exact already-projected state and exact already-enrolled activation keys are idempotent; an incomplete activation set is repaired inside the same transaction. Any invalid row or failed update/insert/verification rolls back every application/journey write. A membership created by an earlier committed repository call may remain after a terminal transaction failure; the identity-only descriptor makes the next request safely recover it.

    `completePreparedApplication` checks again for an existing actor-scoped membership before creating one. A membership found in this second check calls the same `completePreparedTerminal` transaction. Otherwise the seam consumes the already prepared option rather than accepting query interval as authority. For a new membership, create with:

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

    After membership creation, call `completePreparedTerminal(actor, {applicationId: application.id, membershipId: membership.id})` unconditionally; do not directly update the application or call `enrollActivatedMembership` outside the transaction. Add `billingInterval` to `MembershipInput` and the lifecycle projection. Do not modify `lib/db/schema-core.ts` or add a migration; the column and enums already exist.

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

    For `entry: "join"`, keep `MembershipSelection` as the client-safe bound input but call server-only `resolveMembershipOption(selection)` inside the action after syntactic/email validation and before `checkAuthSend` or `auth.signIn.magicLink`. The real resolver may make exactly its documented read-only `plans.list()` catalog call. On `null` or rejection, return the same localized unavailable response with zero limiter, auth-provider, Join mutation, or any other repository/provider call after that catalog read. Direct-action tests with an injected resolver assert no additional seam at all after the injected `null`/rejection. On success, build the callback only from the returned `option.planCode` and `option.billingInterval`; never bind or serialize `ResolvedMembershipOption`. Task 3 consumes the `entry: "member-login"` branch with a required null selection; that branch validates only `PortalContinuation` and does not touch the catalog.

    Make `saveProfile` and `saveCompany` bind the interval, validate form shape, require the member actor, and call `prepareJoinSubmission` before their existing profile/company write. A terminal preparation must await `completePreparedTerminal` and redirect from its committed fresh result; it may not redirect directly from preparation. Only a draft preparation may write the profile/company and then call the matching prepared mutation seam; both seams consume that exact server-resolved option. Redirect directly through `destinationForJoin(locale, result)`. Update profile/company anonymous recovery URLs to preserve plan and interval. Remove the terminal status-card branch from `JoinPage`; authenticated terminal outcomes complete transactionally before checkout/review/complete redirect.

- [ ] **Step 4: Run GREEN and verify no default-interval or split-state dependence remains**

    Run:

    npm.cmd test -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-terminal-state.test.ts tests/unit/join-terminal-transaction.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: PASS with exact profile/company/checkout/review/complete destinations, explicit membership intervals, durable membership precedence over missing/conflicting query plan and interval, exhaustive status handling, fresh row-locked completion, atomic application/journey recovery, and every real terminal caller awaiting the transaction before redirect or profile/company mutation. Unavailable/rejected real catalog resolution performs exactly its one allowed `plans.list()` read and then zero profile/company/application/membership/journey/limiter/provider or other repository calls; injected-resolver tests permit no additional seam after the fake. Add `billingInterval: "annual"` or `"none"` to every typed `MembershipRecord` and `MembershipInput` fixture touched by the required property; do not weaken the property to optional.

    Run:

    npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts

    Expected: browser behavior PASS with annual/none on every valid Join journey, explicit missing/invalid/multi-valued interval recovery, and no observable application mutation request. The Step 1 direct-action fakes—not Playwright interception—prove zero server-side magic-link/provider/database mutation.

    Run:

    npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/portal-content-scope.test.ts tests/unit/repository-production-security.test.ts

    Expected: PASS with every required membership fixture explicit and repository authorization unchanged.

    Run:

    npm.cmd run typecheck

    Expected: PASS with the required durable interval and the exhaustive seven-status mapper across Join, repository-security, checkout, recovery, and Portal-content fixtures.

    Run:

    rg -n "membershipsRepository\.create|memberships\.create" lib app tests

    Expected: every production membership-creation path in scope either supplies `billingInterval` explicitly or is an existing seed/system path with an explicit value. No Join path relies on `default("annual")`.

- [ ] **Step 5: Commit the typed atomic Join slice**

    git add -- ':(literal)lib/membership/join-schema.ts' ':(literal)lib/membership/join-navigation.ts' ':(literal)lib/membership/onboarding.ts' ':(literal)lib/membership/join-service.ts' ':(literal)lib/membership/join-terminal-state.ts' ':(literal)lib/membership/lifecycle.ts' ':(literal)lib/automation/enrollment.ts' ':(literal)lib/db/repos/applications.ts' ':(literal)lib/db/repos/memberships.ts' ':(literal)lib/db/repos/join-terminal.ts' ':(literal)app/[locale]/(join)/join/actions.ts' ':(literal)app/[locale]/(join)/join/page.tsx' ':(literal)app/[locale]/(join)/join/profile/page.tsx' ':(literal)app/[locale]/(join)/join/company/page.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/join-schema.test.ts' ':(literal)tests/unit/join-navigation.test.ts' ':(literal)tests/unit/join-service.test.ts' ':(literal)tests/unit/join-service-review.test.ts' ':(literal)tests/unit/join-terminal-state.test.ts' ':(literal)tests/unit/join-terminal-transaction.test.ts' ':(literal)tests/unit/join-actions.test.ts' ':(literal)tests/unit/join-actions-profile-identity.test.ts' ':(literal)tests/unit/join-page.test.tsx' ':(literal)tests/unit/profile-identity-billing.test.ts' ':(literal)tests/unit/checkout-service.test.ts' ':(literal)tests/unit/checkout-recovery-service.test.ts' ':(literal)tests/unit/portal-content-scope.test.ts' ':(literal)tests/unit/repository-production-security.test.ts' ':(literal)tests/e2e/join-auth.spec.ts'
    git commit -m "feat: route atomic durable join outcomes"

### Task 3: Add explicit member login, one safe continuation authority, and Portal sign-out

**Files:**

- Create: `app/[locale]/(join)/member-login/page.tsx`, `components/portal/portal-sign-out-button.tsx`.
- Create tests: `tests/unit/member-login-page.test.tsx`, `tests/unit/portal-sign-out-button.test.tsx`, `tests/unit/portal-layout-auth.test.tsx`.
- Modify: `lib/membership/join-navigation.ts`, `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(member)/portal/layout.tsx`, `components/portal/portal-nav.tsx`, `lib/portal/queries.ts`, `config/navigation.ts`, `config/wisetech-integration-manifest.ts`, `messages/en.json`, `messages/zh-HK.json`.
- Modify tests: `tests/unit/join-navigation.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/portal-authorization.test.ts`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`, `tests/unit/page-indexability.test.ts`, `tests/unit/wisetech-route-parity.test.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`.

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

    npm.cmd run test:e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts

    Expected: PASS without credentials. Every stable Portal route reaches the localized `/member-login` route with its canonical allowlisted `next`; seat acceptance is not a generic continuation. Do not edit, launch, or stage `m2-admin-crm.spec.ts` in this task: until Task 9 installs the Task 4 managed sentinel/session boundary, even an apparently credential-free M2 command could enter its current credential-triggered reset and disk-auth path.

- [ ] **Step 5: Commit the member-access slice**

    git add -- ':(literal)app/[locale]/(join)/member-login/page.tsx' ':(literal)components/portal/portal-sign-out-button.tsx' ':(literal)lib/membership/join-navigation.ts' ':(literal)app/[locale]/(join)/join/actions.ts' ':(literal)app/[locale]/(member)/portal/layout.tsx' ':(literal)components/portal/portal-nav.tsx' ':(literal)lib/portal/queries.ts' ':(literal)config/navigation.ts' ':(literal)config/wisetech-integration-manifest.ts' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/member-login-page.test.tsx' ':(literal)tests/unit/portal-sign-out-button.test.tsx' ':(literal)tests/unit/portal-layout-auth.test.tsx' ':(literal)tests/unit/join-navigation.test.ts' ':(literal)tests/unit/join-actions.test.ts' ':(literal)tests/unit/portal-authorization.test.ts' ':(literal)tests/unit/navigation.test.ts' ':(literal)tests/unit/mobile-navigation.test.tsx' ':(literal)tests/unit/page-indexability.test.ts' ':(literal)tests/unit/wisetech-route-parity.test.ts' ':(literal)tests/e2e/portal-dashboard.spec.ts' ':(literal)tests/e2e/portal-secondary-pages.spec.ts' ':(literal)tests/e2e/seat-management.spec.ts'
    git commit -m "feat: add explicit member access controls"

### Task 4: Resolve checkout by durable option and project authoritative completion state

**Files:**

- Modify: `lib/billing/checkout-service.ts`, `lib/db/repos/billing-attempts.ts`, `lib/db/repos/jobs.ts`, `lib/membership/join-billing-state.ts`.
- Modify shared managed runtime: `package.json`, `playwright.config.ts`, `tests/fixtures/m2-runtime-env.ts`.
- Modify: `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`, `components/billing/checkout-status.tsx`.
- Create managed launch boundary: `scripts/managed-runtime-environment.mjs`, `scripts/managed-runtime-environment.d.mts`, `scripts/run-managed-playwright.mjs`, `scripts/run-managed-next.mjs`, `tests/fixtures/managed-process-env-probe.mjs`, `tests/fixtures/managed-webserver-probe.mjs`, `tests/fixtures/managed-webserver-probe.playwright.config.ts`, `tests/fixtures/managed-next-env-probe.mjs`, `tests/unit/managed-runtime-process-boundary.test.ts`, `tests/unit/managed-webserver-boundary.test.ts`, `tests/unit/managed-next-environment-boundary.test.ts`, `tests/unit/managed-browser-process-boundary.test.ts`.
- Create: `tests/fixtures/isolated-runtime-env.ts`, `tests/unit/isolated-runtime-environment.test.ts`, `tests/fixtures/managed-auth-session.ts`, `tests/unit/managed-auth-session.test.ts`, `tests/fixtures/m1-live-acceptance.ts`, `tests/unit/m1-live-acceptance-safety.test.ts`, `tests/fixtures/webhook-postgres-safety.ts`, `tests/fixtures/webhook-postgres-test-db.ts`, `tests/unit/webhook-postgres-safety.test.ts`, `tests/integration/webhook-join-projection-postgres.test.ts`.
- Modify tests: `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/billing-checkout-locking.test.ts`, `tests/unit/billing-recovery-cas.test.ts`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/portal-billing-actions.test.tsx`, `tests/unit/webhook-service.test.ts`, `tests/unit/webhook-repository-sequential.test.ts`, `tests/unit/m1-acceptance-services.test.ts`, `tests/e2e/m1-acceptance.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: durable `MembershipRecord.planCode` and `MembershipRecord.billingInterval`, Task 1 `resolveMembershipOption`, Task 2's exhaustive `projectJoinTerminalState` and pure activation-journey builder, actor-scoped applications, existing billing-attempt/job repositories, Stripe adapter, and webhook-owned membership status.
- Produces:

    export type JoinMembershipState = Readonly<{
      actor: Extract<Actor, {kind: "member"}>;
      membership: MembershipRecord & {
        applicationId: string;
        status: "pending_payment" | "pending_review" | "active";
      };
      application: JoinStateApplication;
    }>;
    export type JoinStateApplication = Readonly<{
      id: string;
      planCode: string;
      currentStep: "checkout" | "review" | "complete";
      status: "pending_payment" | "pending_review" | "completed";
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
- Task 4 owns the shared test-only managed-runtime boundary used by mutating M1, M2, M3, M4B, M5, M6, M7, and final authenticated-Axe suites: `scripts/managed-runtime-environment.d.mts` is the exact sibling declaration for the `.mjs` implementation and owns every exported constant, type, and function below; TypeScript consumers import that single runtime module with no duplicate TS implementation.

    export const MUTATING_MANAGED_SUITE_SENTINELS = [
      "M1_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M2_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M3_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M4B_IDENTITY_RESTORE_ALLOW_DESTRUCTIVE",
      "M5_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M6_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M7_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "PR6_AUTHENTICATED_AXE_ALLOW_DESTRUCTIVE",
    ] as const;
    export function managedPlaywrightOrigin(
      environment: Readonly<Record<string, string | undefined>>,
    ): string;
    export function buildManagedPlaywrightRunnerEnvironment(
      originalEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function buildManagedNextServerEnvironment(
      sanitizedRunnerEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function buildManagedBrowserEnvironment(
      sanitizedRunnerEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function buildCredentialFreeVerificationEnvironment(
      originalEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function assertManagedNextDotenvBoundary(
      repositoryRoot: string,
    ): string;
    export type ManagedRunnerTarget = Readonly<{
      suite: "M1" | "M2" | "M3" | "M4B" | "M5" | "M6" | "M7" | "AXE";
      origin: string;
      databaseUrlTest: string;
      databaseHost: string;
      neonProjectId: string | null;
      targetFingerprint: string;
    }>;
    export function requireManagedPlaywrightRunnerTarget(
      sanitizedEnvironment: Readonly<Record<string, string | undefined>>,
      expectedSuite: ManagedRunnerTarget["suite"],
    ): ManagedRunnerTarget;

  Any nonempty value for any sentinel name activates the managed safety posture even when the value is wrong. `MANAGED_SUITE_ENVIRONMENT_MANIFESTS` classifies every suite name as original-parent-required, runner-retained, or Next-only mapping; no suite-level skip/guard may rediscover this ad hoc. Against the original parent, reject more than one active mutating suite, reject any present `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_BROWSERS_PATH`, validate one canonical decimal `PLAYWRIGHT_PORT` (default `3000`), and derive exactly `http://localhost:<port>`. Validate original `APP_URL` and the suite allowlist against that origin, original standard `NEON_PROJECT_ID` against the suite's test project where required, and all other suite-specific parent inputs before sanitizing. Before either wrapper launch, `assertManagedNextDotenvBoundary(repositoryRoot)` uses `lstat`/Windows reparse checks on the exact repository-root candidates `.env.development.local`, `.env.local`, `.env.development`, `.env.test.local`, `.env.test`, and `.env`; any present file, FIFO, directory, symlink, junction, reparse point, permission ambiguity, or stat race fails, including ignored `*.local` files. Carry the ordered absence fingerprint in the launch attestation and recheck it immediately inside `run-managed-next.mjs`. That origin is the sole `use.baseURL`, `webServer.url`, Next `APP_URL`, Next `NEXT_PUBLIC_SITE_URL`, and suite allowed origin. `reuseExistingServer` is `false` for any nonempty destructive sentinel, so an occupied port fails instead of attaching to a stale server.

  Account for Playwright 1.61.1's real launch semantics: it constructs the configured web-server process environment as `{BROWSER: "none", FORCE_COLOR: "1", DEBUG_COLORS: "1", ...process.env, ...webServer.env}` and launches the command with `shell: true`. Therefore an omitted key in `webServer.env` is not scrubbed. `package.json` routes both `e2e` and `test:e2e` through the exact local `node scripts/run-managed-playwright.mjs` wrapper. When no mutating sentinel is present, the wrapper delegates to the repository-local Playwright CLI with existing credential-free behavior. When any mutating sentinel is present, the wrapper must complete every pure authorization, dotenv-candidate, collision, target, origin, executable-routing, and required-value guard against the original parent environment before importing application/provider/database code, then spawn the absolute repository-local Playwright CLI with `shell: false` and a replacement `env` object. It forwards only the original CLI arguments, propagates native exit/signal state, writes no environment or auth artifact, and never invokes an npm shim or PATH-resolved executable.

  Build that managed Playwright-runner environment from an explicit case-folded operational allowlist, not by copying the ambient environment. On Windows, realpath `SystemRoot` and `WINDIR` to the same canonical Windows directory, require `ComSpec` to be the exact regular `%SystemRoot%\System32\cmd.exe`, fix `PATHEXT=.COM;.EXE;.BAT;.CMD`, and rebuild `PATH` from only the canonical current-Node directory plus `%SystemRoot%\System32`; retain canonical existing `TEMP`, `TMP`, `LOCALAPPDATA`, `APPDATA`, and `USERPROFILE` only as non-routing runtime directories. On POSIX, rebuild `PATH` from only the canonical current-Node directory plus fixed `/usr/bin` and `/bin`, require the platform shell selected by Node to be the canonical `/bin/sh`, and retain only canonical `HOME`/`TMPDIR` plus validated `LANG`, optional `LC_ALL`, `TERM`, and `XDG_CACHE_HOME`. Reject `PLAYWRIGHT_BROWSERS_PATH`, duplicate ASCII-uppercase key identities, noncanonical/missing shell or Node paths, writable fake shell/path entries, and every ambient executable-routing override before capture. `CI` and fixed `NODE_ENV=test` are the only generic additions. Retain `DATABASE_URL_TEST` and only the active suite's enumerated test-source names. Add exact non-secret wrapper projections `PR6_MANAGED_SUITE`, `PR6_MANAGED_ORIGIN`, `PR6_MANAGED_DB_HOST`, optional `PR6_MANAGED_NEON_PROJECT_ID`, `PR6_MANAGED_DOTENV_ABSENCE_FINGERPRINT`, `PR6_MANAGED_TARGET_FINGERPRINT`, and a launch attestation; these bind the original-only validations without retaining original standard names. Omit every inactive-suite source and every standard/live external capability, including `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, and `NEON_PROJECT_ID`. The config and every runner-side fixture call `requireManagedPlaywrightRunnerTarget(actualProcessEnv, expectedSuite)` before web-server/browser/Pool/Auth/provider construction. It verifies the complete actual key set, suite/source manifest, canonical shell/runtime paths, dotenv absence, canonical origin, `DATABASE_URL_TEST` host/TLS, non-secret projections, and attestation/fingerprint, then returns the only Pool/origin/project input a runner fixture may use. Missing required source, invalid attestation, standard-name leakage, direct-run bypass, or a suite guard that still expects a stripped standard name fails. A manually launched Playwright process is allowed only if its actual environment already satisfies this same replacement-environment contract.

  `playwright.config.ts` uses a fixed command containing the canonical absolute `process.execPath` and repository-local `scripts/run-managed-next.mjs`; no value from the environment is interpolated into shell syntax. Because Playwright's web-server boundary is necessarily a shell string, a tested platform-specific serializer quotes both validated paths and rejects NUL/newline plus every platform shell-expansion ambiguity before config construction; the managed config sets no `webServer.env` override. The inner wrapper accepts only Playwright's exact `BROWSER=none`, `FORCE_COLOR=1`, and `DEBUG_COLORS=1` additions alongside the attested runner map, strips those three defaults, revalidates the remaining complete case-folded key set, rechecks the exact dotenv-candidate absence fingerprint, and rejects any other merge result. `run-managed-next.mjs` then spawns the absolute repository-local Next CLI with `shell: false`, the exact fixed `dev --webpack` arguments and managed loopback port, and a second replacement `env` object from `buildManagedNextServerEnvironment`. The actual Next process receives only the validated OS-runtime allowlist plus exact mapped application variables, fixed `NEXT_TELEMETRY_DISABLED=1`, and the locked Next 16.3.0 loader's exact `__NEXT_PROCESSED_ENV=true` defense after the explicit absence proof. It receives no wrapper attestation, runner-only/test-source name, inactive-suite value, live standard value, npm variable, arbitrary ambient variable, or inherited provider capability. The launcher itself never imports `app`, `components`, or `lib` provider/database modules.

  The external-capability classification is Windows-case-safe on every platform. Reject the original input before launch when two defined keys share the same ASCII-uppercase identity. Classify every case-insensitive name matched by `/(?:^|_)(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY_ID)(?:_|$)/i`, every suite-source name matched by `/^(?:M[1-7](?:[A-Z])?|PR6|NEON_AUTH_TEST|STRIPE_TEST)_/i`, and every entry in `MANAGED_RUNTIME_EXTERNAL_CAPABILITY_NAMES`. That exact current-repository tuple includes `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_URL_TEST`, and `NEON_PROJECT_ID`; `VERCEL`/`VERCEL_ENV`; all live and test Stripe keys, publishable key, webhook secret, and Price IDs; Resend/email sender/delivery mode; OpenAI/Anthropic keys, Concierge secret, agent/model/live-eval flags; R2 account/jurisdiction/bucket/public URL; all WOZTELL runtime/acceptance credentials, channel/recipient/host/template/live-delivery flags; Turnstile keys; Sentry/Plausible destinations; cron/unsubscribe secrets; Neon Auth standard/test names; `SHOWCASE_STAFF_EMAIL`; `VERCEL_SHARE_TOKEN`; and `PLAYWRIGHT_BASE_URL`/`PLAYWRIGHT_PORT`. A source contract enumerates exact names declared by `.env.example`, `lib/config/env.ts`, `lib/media/r2-storage.ts`, `lib/channels/woztell.ts`, `lib/ai/woztell-production.ts`, and `lib/jobs/runners.ts` and fails when any external-capability name is neither matched nor explicitly classified.

  Only after the runner target is revalidated may the Next-server builder set `DATABASE_URL <- target.databaseUrlTest`, `APP_URL`/`NEXT_PUBLIC_SITE_URL <- target.origin`, fixed `NEXT_TELEMETRY_DISABLED=1`, and the active suite's exact standard server names from guarded test sources. Reject any ambient override of the telemetry or processed-environment markers. M1, M2, M6, M7, and authenticated Axe map server `NEON_PROJECT_ID` only from their respective test-project source after the original-parent equality proof and require it to equal `target.neonProjectId`; other suites leave the server name absent. M1/M2 map all four `STRIPE_TEST_*` sources; M2 maps `M2_TEST_CRON_SECRET` and `M2_TEST_UNSUBSCRIBE_TOKEN_SECRET`; M3 maps `M3_TEST_UNSUBSCRIBE_TOKEN_SECRET`; every authenticated suite maps `NEON_AUTH_TEST_BASE_URL`/`NEON_AUTH_COOKIE_SECRET` only after canonical non-production HTTPS and exact independent `NEON_AUTH_TEST_ALLOWED_ORIGIN` equality. Test-source names and `PR6_MANAGED_*` projections remain available only to the sanitized Playwright runner and are absent from the replacement Next environment. Missing suite-required values fail before a Pool, browser, Auth, provider, or mutation client.

  For every active managed sentinel, `playwright.config.ts` also sets `use.launchOptions.env = buildManagedBrowserEnvironment(process.env)`. That builder starts empty and retains only the canonical browser-required OS directories, fixed locale/runtime keys, rebuilt minimal `PATH`, and fixed `NODE_ENV=test`; it excludes `DATABASE_URL_TEST`, every suite source, credentials, `PR6_MANAGED_*` projection, proxy, loader override, and arbitrary ambient key. Pin and source-test the installed Playwright 1.61.1 browser launcher contract: `BrowserType` uses `options.env` instead of `process.env` when supplied, and Chromium's `amendEnvironment` returns that explicit map unchanged. Any package/version/source drift is a hard failure before a managed browser run.

  `managed-webserver-boundary.test.ts` invokes the real repository-local Playwright CLI through `run-managed-playwright.mjs` with `managed-webserver-probe.playwright.config.ts`; the config uses the production serializer and exact `webServer.command`, while `managed-webserver-probe.mjs` serves only loopback readiness and reports sorted key names plus hashes of synthetic non-secret values. Contaminate the original parent with a fake `ComSpec`, writable PATH shims, mixed-case secret canaries, default-key overrides, and an ignored `.env.local` candidate. Prove the prelaunch guard rejects the contaminated cases; for the clean synthetic case prove the actual Playwright `shell: true` web-server boundary uses the canonical system shell, admits only the three pinned Playwright defaults atop the attested runner map, reaches the inner wrapper, and produces the exact replacement Next probe map. A fake shell marker must never execute. This is an actual CLI/webServer test, not a direct call to the wrapper builder.

  `managed-runtime-process-boundary.test.ts` exercises the outer runner and inner Next OS child processes with synthetic canaries. Assert the actual runner child has only the canonical operational allowlist, `DATABASE_URL_TEST`, the active suite's sources, dotenv-absence fingerprint, and exact `PR6_MANAGED_*` projections; the actual Next child has only the operational allowlist, fixed telemetry/processed-loader markers, and exact standard test mappings; and every mixed-case live/standard/inactive/test-source canary is absent at the appropriate boundary rather than `""`. Run every suite manifest and its real missing/guard helper against both captured maps so original-parent-required names are never mistakenly required in the runner and runner sources are never expected in Next. Prove direct managed CLI bypass, PATH/shim launch, unsafe shell-string path serialization, duplicate-case input, unexpected/default-key drift, invalid attestation, occupied port, child failure, and missing local CLI all fail before provider/database/browser mutation.

  `managed-next-environment-boundary.test.ts` runs the locked Next 16.3.0 `@next/env` loader in `managed-next-env-probe.mjs` against an exact clean synthetic repository and verifies the post-loader effective key/value set, not merely the spawn input. For each development/test dotenv candidate, show with a synthetic canary that the real loader would add capability, then require the production guard to reject any present regular file, FIFO, directory, symlink, junction/reparse point, unreadable entry, or changed absence fingerprint before launch; the fixed processed marker and second absence check remain defense in depth. It also proves `NEXT_TELEMETRY_DISABLED` is exactly `"1"` and cannot be overridden.

  `managed-browser-process-boundary.test.ts` loads the real managed Playwright config under a contaminated runner map, extracts the exact `use.launchOptions.env` consumed by the pinned launcher, and runs the process probe with that same map. Assert the complete case-folded key/value set contains only browser-required operational keys and no suite/provider/database/Auth/password/token/projection/proxy/loader canary. It also source-pins the installed Playwright launch branch and Chromium amendment above, rejects a missing or merged browser env, and requires the real credential-gated browser smoke path to expose the same environment fingerprint in its verification record.

  Import the real application environment parsers against the captured actual Next-child map with optional Concierge, Turnstile, Resend, R2, and WOZTELL names absent, and prove M2's invalid-signature WOZTELL request still reaches the existing 401 contract. This makes an M2 auth/order regression run with no ambient/live Resend, AI, R2, WOZTELL, Turnstile, telemetry, database, Stripe, cron, unsubscribe, or Auth capability beyond the exact guarded isolated test mappings it intentionally needs. The same test type-imports every public API from `managed-runtime-environment.mjs`, asserts the sibling `.d.mts` value signatures match the runtime export-name set, and launches `run-managed-playwright.mjs`/`run-managed-next.mjs` only as real Node subprocesses through their test-only probe mode; it never directly imports those executable scripts, so no undeclared MJS seam or duplicate implementation exists.

  Task 4 also owns `managed-auth-session.ts`. Every real Neon Auth sign-in in M1, M2, M3, M4B, M5, M6, M7, and authenticated Axe must return a registry-owned context; suites may not call `context.close()` directly. In aggregate cleanup, and before any profile restoration, the registry independently attempts real same-origin `POST /api/auth/sign-out` from each still-open authenticated context, requires a successful response, then requires `GET /api/auth/get-session` to resolve anonymous/null and one protected route to exhibit the expected anonymous redirect/404. It still closes every context if another revocation fails, aggregates all failures, and makes incomplete revocation `NOT PASSED`. A success-path sign-out is verified again rather than trusted. The helper never creates, deletes, or resets an auth user.

  When any mutating sentinel is active, `playwright.config.ts` forces `trace: "off"`, `screenshot: "off"`, and `video: "off"`. Managed auth state is in memory only: no `storageState({path})`, cookie JSON, trace ZIP, screenshot, or video may be written. Unit/source tests inject early page/test failures, a closed page with an open context, sign-out failure, anonymous-verification failure, and multiple sessions; they prove revocation-before-close ordering, independent cleanup aggregation, and no credential-bearing artifact API/path. Credential-free runs retain existing behavior. Only M4C and the public Lighthouse gate remain separately guarded read-only Preview flows.
- The isolated provider harness exports `M1_ACCEPTANCE_DESTRUCTIVE_SENTINEL = "M1_ISOLATED_FIXTURES_ONLY"`, `M1_ACCEPTANCE_PROVIDER_SENTINEL = "M1_TEST_PROVIDERS_ONLY"`, `missingM1ParentEnvironment(originalEnvironment)`, `missingM1LiveRunnerEnvironment(sanitizedEnvironment)`, `requireM1LiveRunnerEnvironment(sanitizedEnvironment)`, `snapshotM1Identities(guarded)`, `prepareM1Fixture(runId, identities, guarded)`, `checkpointM1IdentityMutations(runId, identities, guarded)`, `collectM1StripeRunLedger(runId, guarded, identifiers)`, `collectM1DatabaseRunLedger(runId, guarded, identifiers)`, `disposeM1StripeRun(ledger, guarded)`, `restoreM1IdentitiesAfterQuiescence(runId, identities, guarded)`, and `cleanupM1Fixture(runId, guarded)`. It remains test-only and cannot be imported by `app`, `components`, or `lib` production modules.
- The exact pre-existing identity snapshot is:

    export type M1ProfileSnapshot = Readonly<{
      id: string;
      authUserId: string;
      email: string | null;
      role: "member" | "staff" | "exco" | "superadmin";
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

  `requireM1LiveRunnerEnvironment(process.env)` must first return the attested `ManagedRunnerTarget` plus validated retained M1 test sources; standard `APP_URL`, `DATABASE_URL`, and `NEON_PROJECT_ID` are forbidden in that runner input. Construct the only guarded read-only Pool from `target.databaseUrlTest`, and use `target.origin`/`target.neonProjectId` for every runner-side target comparison before browser, inbox, Neon Auth, or Stripe construction. Only after those pass may that Pool load the full owner/invitee snapshots; both profiles must exist with `role === "member"`, each configured email must equal its normalized profile email, and normalized emails, auth-user IDs, and profile IDs must be pairwise distinct. `M1_TEST_OVERFLOW_EMAIL` is a third distinct controlled-inbox test address. The owner must have no pre-existing Join application, membership, or company context that the journey would overwrite; fail after the guarded DB preflight but before browser/inbox/Auth/Stripe construction or mutation. The run target company does not yet exist at preflight: after owner onboarding creates it and before invitation, require the invitee has no active membership in that exact new company and require the exact active company-member count to be one.
- `M1StripeRunLedger` records the run ID; exact run-owned application, membership, billing-attempt, Checkout Session, Customer, Subscription, Invoice, PaymentIntent, and Charge IDs; request window and expected price/idempotency context; and every cleanup disposition. Provider Session/Subscription metadata ownership is exactly `{membershipId, applicationId, planCode}`—never an attempt ID. Billing-attempt ownership is proven by the guarded attempt row whose attached Session ID, membership ID, exact price, and idempotency key match the run. `M1DatabaseRunLedger` records the exact signed Stripe event ID, job ID, webhook audit ID, webhook-created journey IDs, and post-webhook application projection. A successful job must have `runKey === eventId`, `kind === "checkout.session.completed"`, `state === "completed"`, its expected attempt/time window, membership `active`, application `completed/complete`, and the complete exact activation-journey key set; its audit must have null actor user, actor type `system`, action `stripe.webhook.processed`, target type `membership`, target ID equal to the run membership, request ID equal to the event ID, and exact metadata `{eventType, stripeCreated, eventId, status: "active"}`. A transient partial webhook failure may leave the exact redacted failed job and no audit, but the locked membership/application/attempt/journey/audit/job-completion transaction must have rolled back; a correlation rejection leaves neither a job nor an audit. Because the production Billing Portal boundary exposes only its redirect URL, record sanitized redirect/locale-return evidence as `retained_immutable_unaddressable_test_record` without inventing a provider ID.
- The controlled inbox adapter has this exact test-only contract:

    export type M1MagicLinkInboxResponse = Readonly<{
      messages: readonly Readonly<{
        id: string;
        recipient: string;
        receivedAt: string;
        href: string;
      }>[];
    }>;

  The adapter exposes two bounded retrieval-only operations over `GET {M1_TEST_MAGIC_LINK_INBOX_URL}?recipient={encodedEmail}&after={encodedIsoTimestamp}` with `Authorization: Bearer {M1_TEST_MAGIC_LINK_INBOX_TOKEN}`. `pollExactlyOne` retries for at most 60 seconds and succeeds only with exactly one post-request message for the exact recipient; `receivedAt` must parse after the request timestamp, and `href` must be HTTPS, contain no URL credentials, and have the exact canonical `M1_TEST_MAGIC_LINK_ALLOWED_ORIGIN`. The adapter must never issue GET, HEAD, redirect resolution, prefetch, or any other request to `href`. The fresh Playwright context navigates to that exact href once, validates every redirect origin against the auth-link/application allowlist, and validates the final exact `target.origin` and expected path. `assertNoMessage` only queries the inbox API for the same exact recipient through the full 60-second window and fails on any post-request message. Reject extra matches, stale messages, malformed JSON, or timeouts. Unit tests use a fake clock and scripted inbox responses and prove the link URL is never dereferenced outside the browser.
- The stateful live M1 case defines `M1_LIVE_TEST_TIMEOUT_MS = 900_000` and its aggregate `afterAll` defines `M1_CLEANUP_TIMEOUT_MS = 600_000`. Apply the test timeout before any inbox poll and set the hook timeout at hook entry. The live journey has three independent bounded `pollExactlyOne` windows plus one full negative `assertNoMessage` window (at least 240 seconds before browser, provider, and assertion overhead), so it must never inherit Playwright's current 180-second global timeout. Unit/source tests require those exact overrides, prove each exceeds its named worst-case budget, and prove cleanup still runs when the live body reaches its deadline.

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
        currentStep: status === "active"
          ? "complete"
          : status === "pending_review"
            ? "review"
            : "checkout",
        status: status === "active" ? "completed" : status,
      };
      const html = renderToStaticMarkup(await CompletePage(props({
        membership_id: "membership-a",
        session_id: "forged-success",
      })));
      expect(html).toContain('data-join-status="' + expected + '"');
    });

    Add `past_due`, `cancel_at_period_end`, `cancelled`, `expired`, plan-mismatch, missing application, foreign actor, and multi-valued membership ID cases; each must call no Stripe adapter and return not-found/recovery. This separate loader/read-model boundary therefore exercises all seven membership statuses independently of Task 2's mapper tests.

    In `webhook-repository-sequential.test.ts`, extend the scripted `checkout.session.completed` contract without pretending it executes PostgreSQL. The checkout-only locked read must use an `INNER JOIN membership_applications` and `FOR UPDATE OF memberships, membership_applications`; non-checkout lifecycle commands retain the existing nullable-application `LEFT JOIN` and membership-only lock. Require exact event membership/application/plan/target and Stripe Session/Customer/Subscription/attempt correlation. Determine stale ordering before lifecycle/application predecessor validation. Preserve and test four distinct outcomes:

    1. An already claimed/completed identical event returns `duplicate` after the claim and writes nothing.
    2. A valid stale checkout—including the existing later-cancelled case—locks/verifies its correlated attempt, performs no membership/application/attempt/journey mutation, inserts exactly one `stripe.webhook.ignored_stale` audit, marks the job completed, and commits.
    3. A non-stale correlated checkout accepts the existing membership lifecycle sources only with a coherent application pair: `pending_payment/checkout` for pending payment, `pending_review/review` for pending review, and `completed/complete` for active, past-due, or cancel-at-period-end membership. It maps next status `active`, updates membership plus application, completes the attempt, inserts and verifies activation steps anchored to the validated Stripe `eventCreated` timestamp, inserts `stripe.webhook.processed`, marks the job completed, and commits all of them together.
    4. A correlation error rolls back the claim and creates neither failed job nor audit. A transient update/projection/journey/audit/job-completion failure rolls back membership/application/attempt/journey/audit/job, then records only the existing redacted failed-job fallback outside the rolled-back transaction.

    Inject failure independently at membership update, application update, attempt update, journey insert, journey verification, processed-audit insert, and job-completion update. Prove every transactional row rolls back and only transient failures take the failed-job path. Assert exact `scheduled_at` values from `new Date(command.eventCreated * 1000)`, not only journey keys. Preserve the same-second event-ID tiebreaker and stale audit semantics. Update exact scripted statement counts/order; do not weaken the SQL-string harness.

    Add `webhook-postgres-safety.test.ts`, test-only `webhook-postgres-test-db.ts`, and guarded `webhook-join-projection-postgres.test.ts`. The integration module may statically import only the pure safety helper and Vitest APIs. Before constructing a Pool or dynamically importing `lib/db/repos/jobs.ts`, require exact `PR6_WEBHOOK_POSTGRES_ALLOW_DESTRUCTIVE=PR6_ISOLATED_WEBHOOK_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, absent standard `DATABASE_URL`, independently matched non-production Neon/TLS host/project identity, `DATABASE_URL_TEST`, and a fixed advisory-lock ID. Construct one `pg.Pool` and Drizzle handle solely from the guarded URL, install a `vi.doMock` for the exact resolved `lib/db/client.ts` module that returns only that handle, and only then dynamically import the production repository. A default `getDb`/client load, unmocked import, second URL, raw unverified executor, or fixture/repository connection-identity mismatch throws before a statement; source/unit tests prove the production client module body never evaluates. Under the fixed advisory lock, a read-only preflight requires exactly one existing `startup` membership-plan row matching Task 1's canonical persisted fields; snapshot its complete row and never insert, update, or delete it. Derive a unique run-owned profile ID, auth-user ID, `.invalid` email, application ID, membership ID, and attempt ID; require every exact run predicate absent, then insert the complete member profile before its application/membership/attempt dependants. No Neon Auth user or provider call is created. `webhook-postgres-test-db.ts` wraps the same guarded Drizzle handle with named test-only observation/failpoint seams: after the real checkout `INNER JOIN ... FOR UPDATE OF` returns, a barrier signals the test and holds the production transaction; a second dedicated client attempts the exact conflicting application/relation update under bounded `lock_timeout`, and the test proves it remains pending until release before both operations finish. Separate named failpoints throw at processed-audit insert and job-completion update. Apply bounded statement, idle-transaction, barrier, cancellation, and whole-test deadlines; every connection is tracked and aggregate cleanup attempts rollback/cancel/release before `pool.end()` even after timeout. Prove success commits membership/application/attempt/journey/audit/job atomically and each injected failure rolls all transactional rows back. In `finally`, independently drain/cancel all tracked operations, delete exact run-owned audit/job/journey/attempt/membership/application/profile rows in FK-safe order through the same guarded handle, prove every predicate absent, prove the canonical plan row remains byte-identical, restore Vitest mocks, and close every client/Pool. Missing approval/resources, a present ambient `DATABASE_URL`, missing/mismatched plan, collision, barrier/timeout ambiguity, default-client load, connection leak, or incomplete cleanup is `NOT PASSED`; it is never a credential-free PASS.

    In `webhook-service.test.ts`, preserve signed-event and job idempotency and the service's existing delegation-only ownership. Assert the repository cannot return `processed` until membership, application, attempt, journeys, processed/ignored audit, and job completion have committed. Distinguish correlation rejection with no failed job/audit from transient repository failure with the existing redacted failed-job record and no processed audit.

    Assert Chinese Billing Portal return:

    await createBillingPortalSession(actor, membershipId, "zh-HK", dependencies);
    expect(stripe.portalRequests[0]).toEqual({
      customerId: "cus_owned",
      returnUrl: "https://members.example.test/zh/portal/billing",
    });

    In `isolated-runtime-environment.test.ts`, prove external `PLAYWRIGHT_BASE_URL` rejection, canonical managed origin/port equality, multiple-suite rejection, original-parent `APP_URL`/`NEON_PROJECT_ID` equality, exact runner projection/fingerprint creation, exact Next database/APP mappings, standard Stripe/cron/unsubscribe/Auth scrubbing, suite-only retention/remapping, missing suite-required values at their declared parent/runner boundary, non-test Stripe/Auth inputs, and `reuseExistingServer: false` for every nonempty M1/M2/M3/M4B/M5/M6/M7/Axe sentinel including malformed values. In `m1-live-acceptance-safety.test.ts`, separately prove the original-parent guard rejects missing/wrong destructive or provider sentinels, absent `DATABASE_URL_TEST`, non-Neon/TLS-invalid/production-labelled/mismatched database hosts/projects, managed origin/original `APP_URL`/`M1_E2E_ALLOWED_ORIGIN` mismatch, any present `PLAYWRIGHT_BASE_URL`, original `NEON_PROJECT_ID` mismatch, non-test Stripe credentials, invalid or mismatched `NEON_AUTH_TEST_BASE_URL`/`NEON_AUTH_TEST_ALLOWED_ORIGIN`, weak `NEON_AUTH_TEST_COOKIE_SECRET`, unallowlisted inbox/auth-link origins, missing owner/invitee/overflow emails, and normalized email collisions before launch. Prove the runner guard accepts the sanitized map, returns the exact target, and rejects leaked/missing standard names, source/projection drift, suite mismatch, or invalid attestation before Pool/browser/inbox/Auth/Stripe. Then prove the guarded read-only DB preflight rejects absent or non-member owner/invitee profile mappings, configured/profile email or auth/profile-ID collisions, and pre-existing owner Join/company context after only the guarded Pool exists but before any other client or mutation. Finally prove the post-company/pre-invitation checkpoint rejects an existing invitee membership or active count other than one for the exact run-owned company.

    In the same file, unit-test provider/database ledgers and dispositions with fake clients. Reject Session/client-reference/`{membershipId, applicationId, planCode}` metadata, Customer, Subscription, attempt-row, price/quantity, and URL lineage mismatches before cleanup. Cover create-success plus `attachSession`/fallback-read failure: before any DB deletion, perform a read-only bounded Checkout Session search over the exact run request window and complete pagination, then match `livemode === false`, run membership `client_reference_id`, exact three-field metadata, exact Customer, one line item with exact Price/quantity, and exact managed success/cancel URLs. Adopt exactly one candidate; zero is `no_session_created` only after a complete successful search, while multiple candidates, pagination overflow/`has_more`, or provider failure fails and mutates none. Never use idempotent replay during cleanup because it could create a Session. Expire only an owned open Session and accept an already-expired Session; cancel owned Subscriptions in `active`, `trialing`, `past_due`, `unpaid`, `paused`, or `incomplete` before Customer deletion while treating `canceled` and `incomplete_expired` as terminal. Verify Customer deletion; never delete completed Sessions, Portal Sessions, Invoices, PaymentIntents, Charges, configured Prices, or webhook configuration. Cover the exact completed/failed webhook job, processed audit, duplicate replay, webhook-created journey rows, and transient-failed-job/no-audit and correlation-no-job/no-audit cleanup predicates.

    Unit-test managed session revocation/no-artifact behavior, identity restoration, explicit live/hook timeout budgets, and failure aggregation: serialize every profile column exactly; accept only baseline or an owner/invitee state whose allowed run-ID fields and `lastLoginAt`/`updatedAt` timestamps fall inside recorded checkpoints. After all sessions are revoked/proved anonymous and contexts close, poll both full rows until each is stable for a bounded quiet window. Restore with compare-and-swap against the full last-observed row; if a late allowed run touch lands, repeat within a fixed deadline. Preserve and fail on external drift. Success requires each restored row to remain byte-identical to baseline for a second full quiet window. Test a delayed `touchLastLogin` after context close and after the first restore, idempotent already-restored rows, independent restoration of both identities, aggregate provider/browser/database/identity/cleanup failures, a live-body timeout, and an independently budgeted cleanup hook that still executes. Add a live-fixture contract requiring a distinct invitee, fresh browser context/session transitions, exactly-once magic-link navigation, accepted invitation/member IDs, exact capacity fill, and zero overflow inbox message/invitation row.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/webhook-postgres-safety.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/m1-acceptance-services.test.ts tests/unit/m1-live-acceptance-safety.test.ts

    Expected: FAIL because checkout resolves by plan only, locked membership rows/direct recovery omit interval/full selection, the paid webhook locks/projects only the membership/application-incoherently, completion accepts pending payment only, Billing Portal returns to English, and the actual replacement-environment Playwright/Next process boundary plus isolated M1 environment, deterministic session revocation/no auth artifacts, explicit 900-second live/600-second cleanup budgets, distinct-invitee journey, retrieval-only magic-link contract, profile quiescence/CAS restoration, recoverable provider lineage, signed local webhook, database residue ledger, and aggregate cleanup dispositions do not exist. The real Playwright-CLI/webServer probe must fail against the current `{BROWSER: "none", FORCE_COLOR: "1", DEBUG_COLORS: "1", ...process.env, ...webServer.env}` inheritance, ambient `ComSpec`/PATH routing, inherited browser environment, and Next dotenv loading even if an old pure builder reports omitted keys.

    Run the guarded PostgreSQL contract only under its separate named mutation gate:

    npm.cmd test -- tests/integration/webhook-join-projection-postgres.test.ts

    Expected without the exact sentinel and isolated Neon variables: the integration case skips and is recorded as `NOT PASSED`, not RED/GREEN evidence. With separate database-mutation approval and the complete guard, expected RED is the current PostgreSQL error/contract gap: checkout still uses a nullable `LEFT JOIN` and does not atomically project the application. Never supply or infer credentials merely to obtain RED.

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

    - `pending_payment` membership with `pending_payment/checkout` application;
    - `pending_review` membership with `pending_review/review` application;
    - `active` membership with `completed/complete` application.

    Keep `CheckoutPage` restricted to `pending_payment` after loading. Make `CompletePage` render processing, review, or active from the durable projection. Ignore `session_id`, `status`, `success`, plan, and interval query keys when choosing state. Keep webhook processing as the only Stripe activation authority.

    Harden the existing `checkout.session.completed` repository transaction in `lib/db/repos/jobs.ts`; do not add a later best-effort application repair and do not move ownership into the delegation-only webhook service. Split the locked lookup by event kind: checkout uses an `INNER JOIN` to its required linked application and `FOR UPDATE OF memberships, membership_applications`, while non-checkout lifecycle events preserve the current `LEFT JOIN`/nullable application path and membership-only lock. For checkout, validate exact event/application/membership IDs, equal plan and target lineage, plus existing Stripe Session/Customer/Subscription/active-attempt correlation under lock. Read the latest lifecycle audit and compute the existing `(stripeCreated,eventId)` stale ordering before enforcing non-stale lifecycle/application predecessor compatibility. A stale event performs no membership/application/attempt/journey projection; inside the same transaction it inserts only `stripe.webhook.ignored_stale`, marks the job completed, and returns `processed`. A non-stale event preserves `lifecycleSources(command)` and requires the coherent current application pair named in Step 1. Call Task 2's mapper for next status `active`; update membership activation fields and application `completed/complete`, complete the attempt, insert the pure builder's activation rows with `anchor = new Date(command.eventCreated * 1000)` and `ON CONFLICT DO NOTHING`, verify every exact key and scheduled timestamp, insert `stripe.webhook.processed`, and mark the claimed job completed—all before the one transaction commits. Same-event claim duplication remains the idempotent replay. Correlation errors roll the claim back and deliberately bypass failed-job recording; transient statement failures roll the transaction back and retain the existing redacted failed-job fallback. Thus no successful non-stale checkout can expose an active membership with a stale application, and the frozen duplicate/stale/audit/job semantics remain unchanged.

    Implement `webhook-postgres-safety.ts` as a test-only pure guard with no production/provider import. Require exact sentinel `PR6_WEBHOOK_POSTGRES_ALLOW_DESTRUCTIVE=PR6_ISOLATED_WEBHOOK_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL` and standard `DATABASE_URL`, `DATABASE_URL_TEST`, canonical TLS, exact `PR6_WEBHOOK_TEST_DB_HOST`, independently exact `NEON_PROJECT_ID === PR6_WEBHOOK_TEST_NEON_PROJECT_ID`, and a non-production host/project label before constructing a Pool. The integration file performs that guard before a dynamic repository import; `webhook-postgres-test-db.ts` creates the sole Pool/Drizzle handle, installs the exact client-module mock, records that the default loader never evaluates, and exposes only the named lock barrier/failpoints. Read-only validate/fingerprint the canonical Startup plan; prove all run-key predicates absent; insert one complete run-owned member profile followed by its application, membership, and active attempt; execute the real mocked-to-guarded repository SQL; and use a second tracked connection to prove deterministic blocking behind the application/membership locks before release. Its aggregate `finally` cancels/rolls back/releases all tracked connections, removes exact run-owned audit/job/journey/attempt/membership/application/profile rows in FK-safe order, verifies zero residue, rechecks the untouched plan fingerprint, restores mocks, and closes the Pool under independent deadlines. Unit tests cover ambient-standard rejection, mock-before-import ordering, default-loader invocation, cross-database handle mismatch, profile/auth/email/run-key collisions, missing or altered plan, barrier never reached, premature second update, lock/statement timeout, each named failpoint, every partial insert/transaction failure, independent cleanup continuation, connection leakage, and plan-drift preservation. It never creates an Auth user, mutates a plan, migrates, seeds shared data, contacts Stripe/Vercel/Neon APIs, selects an arbitrary existing profile, or runs without separate database-mutation approval.

    Pass locale from Portal billing to `createBillingPortalSession` and build the return URL with `localizedPath(locale, "/portal/billing")`.

    Implement the shared managed runtime first and make `tests/fixtures/m2-runtime-env.ts` delegate/re-export its neutral parent/runner/Next helpers without weakening existing M2 names. Implement `m1-live-acceptance.ts` as a test-only fail-closed harness. `missingM1ParentEnvironment(originalEnvironment)` covers every Task 12 M1 operator input; the outer launcher applies it plus managed-loopback, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M1_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID`/test-project, independently allowlisted non-production Neon/TLS identity, allowlisted HTTPS inbox/auth-link origins, three distinct test emails, and `sk_test_` checks before sanitizing. `missingM1LiveRunnerEnvironment(process.env)` requires only the active sentinel, retained test sources, `DATABASE_URL_TEST`, and exact M1 `PR6_MANAGED_*` target/attestation; it rejects standard `APP_URL`, `DATABASE_URL`, and `NEON_PROJECT_ID`, then `requireM1LiveRunnerEnvironment` returns the typed target used for Pool/origin/project comparisons. Pure runner checks precede Pool; one guarded read-only DB preflight then proves the two exact member profile mappings and clean owner boundary before any other client or mutation. The durable Startup option must have `seatLimit >= 2`. Replace the unconditional always-skip case with one isolated serial describe whose skip condition is exactly `missingM1LiveRunnerEnvironment(process.env).length > 0`, apply `M1_LIVE_TEST_TIMEOUT_MS` before the live body, and set `M1_CLEANUP_TIMEOUT_MS` at aggregate-hook entry; a parent failure prevents runner launch, while a runner skip or timeout remains `NOT PASSED`.

    After guarded DB preflight and before browser authentication, snapshot every owner/invitee profile column and record `runStartedAt`. Retrieve both configured Stripe test Prices and require active annual recurring HKD values. Tag every disposable DB row with one `runId`. Maintain both ledgers. Start Session ownership from the attempt-attached Session when present; otherwise, whenever the provider boundary may have been crossed, run the bounded read-only recovery search above before DB deletion. Require Session/Subscription metadata exactly `{membershipId, applicationId, planCode}` and prove attempt ID only through the guarded billing-attempt row. Record exact reachable provider lineage and named immutable residuals; do not add test-only production metadata or widen the strict webhook schema.

    Request the owner's real test-mode Neon magic link, retrieve it without dereferencing, navigate exactly once in a fresh browser context, validate its redirect chain/final managed origin, complete run-ID-marked profile/company onboarding, prove durable annual option and exact Startup Price, and complete Stripe test checkout. Register every authenticated context with the shared managed-session owner; a success-path sign-out calls its idempotent revoke/verify/close operation, while aggregate cleanup owns any unfinished context. Retrieve the exact owned Session and Subscription from the test API, build one supported `checkout.session.completed` event with a unique run-owned event ID and the retrieved test objects, serialize one exact raw body, generate its valid Stripe signature with `STRIPE_TEST_WEBHOOK_SECRET`, and POST it to the real managed-origin `/api/stripe/webhook` route. Require `processed` behavior, durable membership activation, exact `completed/complete` application projection, exact completed job/audit/journey ledger rows, then replay the identical signed body and require idempotent duplicate behavior with no second audit or mutation. Do not wait for external Stripe delivery and do not create a tunnel or mutate webhook endpoint/provider configuration. Render active completion, open locale-correct Billing Portal, and verify receipts/secondary pages. Before invitation, require the invitee is not already in the exact run-owned company and its exact active member count is one; then invite `M1_TEST_INVITEE_EMAIL`, capture the exact invitation/request time, finish the owner session through the shared revoke/anonymous-verify/close registry.

    Open a fresh isolated browser context, retrieve the new invitee message without dereferencing, navigate to its exact HTTPS auth link once, validate the allowed redirect chain and final managed `/portal/company/seats/accept?token=...` path, and verify exactly one company-member row for the snapshotted invitee plus exact accepted invitation and active count two. Replay the already-consumed application callback state through the browser and require localized safe error/no second membership; never prefetch the one-time auth link. Finish that invitee session through the same registry. Reopen a fresh owner context through a newly retrieved owner link navigated once, insert exactly `seatLimit - 2` run-owned synthetic members, require active count equals `seatLimit`, then prove the distinct overflow invitation fails with no row and no inbox message through the bounded window. Record identity checkpoints after every authenticated/profile mutation and finish the last owner session through the same registry.

    `afterAll` runs after success or failure with independent nested `try/finally` phases and one aggregate error. First finish every registered session by attempting real sign-out, proving anonymous state, and closing its context; aggregate failures and stop all new authenticated requests before profile restoration. Poll the full owner/invitee rows to the required pre-restore quiet window so fire-and-forget `touchLastLogin` writes drain or the cleanup fails boundedly. The Stripe phase collects attached or safely recovered lineage, expires/terminal-verifies the owned Checkout Session, cancels/terminal-verifies the owned Subscription, and deletes the disposable Customer only after subscription disposition; incomplete or ambiguous recovery is reported and never blocks later phases. Immutable completed Sessions, Invoices, PaymentIntents, Charges, sanitized Portal evidence, and mailbox IDs remain named retained evidence. Never mutate configured Prices, webhook endpoint/configuration, pre-existing auth users, or immutable provider records.

    In an independent database `finally`, capture and validate the exact signed-event job, processed audit, and webhook-created journey rows before deleting anything. Delete the exact owned webhook audit first, then exact job, then the run-owned Join/company/membership/invitation/seat/synthetic-profile graph; verify zero ledger rows and residue, including accepted invitee company membership, while never deleting the invitee profile or unrelated memberships. A failed webhook may have only the exact failed job and no audit; preserve unexpected candidates. In the final identity `finally`, perform compare-and-swap restoration with bounded retries, external-drift preservation, and the post-restore quiet window described above for both identities independently. Any provider, DB, or one-identity failure must not prevent another safe phase. Fail for incomplete required Session/Subscription/Customer/job/audit/journey/database/identity cleanup, recovery ambiguity, drift, or seat/invitation residue; retained immutable evidence is expected.

- [ ] **Step 4: Run GREEN and prove the M1 harness can reach an authorized isolated result**

    Run:

    npm.cmd test -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/webhook-postgres-safety.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/m1-acceptance-services.test.ts tests/unit/m1-live-acceptance-safety.test.ts

    Expected: PASS. Price selection uses the durable pair; paid membership/application/attempt/journey/audit/job completion is one locked transaction with exact duplicate, stale, correlation, and transient-failure behavior; all seven completion states are actor-scoped; and forged success never activates/selects state. The real Playwright-CLI probe proves canonical shell routing and exact default-key handling; the runner has no ambient/live capability; the locked Next loader proves exact post-dotenv guarded mappings with telemetry disabled; and the browser gets its own capability-free launch environment. Every authenticated context is revoked/verified before close without disk state or traces; M1 live/cleanup budgets exceed every bounded inbox/provider/cleanup window; every unsafe M1 identity/environment fails at its correct pure or guarded-DB phase; and provider/database/profile cleanup remains independent under injected failures including orphan Session recovery, transient webhook residue, correlation rejection, delayed login touches, and a timed-out live body.

    Run the separately gated real-PostgreSQL contract:

    npm.cmd test -- tests/integration/webhook-join-projection-postgres.test.ts

    Expected without the exact gate: skip and `NOT PASSED`. With separate database-mutation approval and the complete isolated target: PASS only when the pure guard runs before dynamic repository import, the default database client never evaluates, fixtures and production SQL share the one mocked guarded Drizzle handle, the canonical Startup-plan fingerprint is unchanged, the complete synthetic profile graph is owned, a deterministic barrier proves the checkout `INNER JOIN`/two-row locks block the second connection until release, named audit/job failpoints fully roll back, every connection closes, and zero run-owned residue remains.

    Run:

    npm.cmd run test:e2e -- tests/e2e/m1-acceptance.spec.ts

    Expected without the complete gate: deterministic fixture cases PASS and the isolated live describe skips as `NOT PASSED`. With separate provider/database mutation approval and every M1 variable, the same command must execute against the managed server, navigate each retrieved magic link exactly once, inject/replay the valid locally signed webhook through the real route, prove distinct-invitee acceptance/capacity denial, recover any attach-failure Session safely, clean exact webhook job/audit/journey residue, restore both profile snapshots through quiet-window CAS, record named immutable provider/mailbox evidence, and PASS. Missing variables, skip, live or cleanup timeout, ambiguous recovery, unclassified/unexpected residuals, or incomplete required mutable cleanup never become a passing result; the explicitly named immutable completed-Session/Invoice/PaymentIntent/Charge/Portal/mailbox evidence is expected and must be retained in the record.

- [ ] **Step 5: Commit the durable billing slice**

    git add -- ':(literal)package.json' ':(literal)playwright.config.ts' ':(literal)scripts/managed-runtime-environment.mjs' ':(literal)scripts/managed-runtime-environment.d.mts' ':(literal)scripts/run-managed-playwright.mjs' ':(literal)scripts/run-managed-next.mjs' ':(literal)tests/fixtures/managed-process-env-probe.mjs' ':(literal)tests/fixtures/managed-webserver-probe.mjs' ':(literal)tests/fixtures/managed-webserver-probe.playwright.config.ts' ':(literal)tests/fixtures/managed-next-env-probe.mjs' ':(literal)tests/unit/managed-runtime-process-boundary.test.ts' ':(literal)tests/unit/managed-webserver-boundary.test.ts' ':(literal)tests/unit/managed-next-environment-boundary.test.ts' ':(literal)tests/unit/managed-browser-process-boundary.test.ts' ':(literal)tests/fixtures/isolated-runtime-env.ts' ':(literal)tests/unit/isolated-runtime-environment.test.ts' ':(literal)tests/fixtures/managed-auth-session.ts' ':(literal)tests/unit/managed-auth-session.test.ts' ':(literal)tests/fixtures/m2-runtime-env.ts' ':(literal)lib/billing/checkout-service.ts' ':(literal)lib/db/repos/billing-attempts.ts' ':(literal)lib/db/repos/jobs.ts' ':(literal)lib/membership/join-billing-state.ts' ':(literal)app/[locale]/(join)/join/checkout/page.tsx' ':(literal)app/[locale]/(join)/join/complete/page.tsx' ':(literal)app/[locale]/(member)/portal/billing/page.tsx' ':(literal)components/billing/checkout-status.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/fixtures/m1-live-acceptance.ts' ':(literal)tests/unit/m1-live-acceptance-safety.test.ts' ':(literal)tests/fixtures/webhook-postgres-safety.ts' ':(literal)tests/fixtures/webhook-postgres-test-db.ts' ':(literal)tests/unit/webhook-postgres-safety.test.ts' ':(literal)tests/integration/webhook-join-projection-postgres.test.ts' ':(literal)tests/unit/checkout-service.test.ts' ':(literal)tests/unit/checkout-recovery-service.test.ts' ':(literal)tests/unit/billing-checkout-locking.test.ts' ':(literal)tests/unit/billing-recovery-cas.test.ts' ':(literal)tests/unit/join-billing-pages.test.tsx' ':(literal)tests/unit/portal-billing-actions.test.tsx' ':(literal)tests/unit/webhook-service.test.ts' ':(literal)tests/unit/webhook-repository-sequential.test.ts' ':(literal)tests/unit/m1-acceptance-services.test.ts' ':(literal)tests/e2e/m1-acceptance.spec.ts'
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
- Modify isolated fixtures: `tests/fixtures/m2-runtime-env.ts`, `tests/fixtures/m2-auth.ts`, `tests/fixtures/m2-reset.ts`, `tests/e2e/m2-admin-crm.spec.ts`.
- Consume without restaging unless changed here: Task 4 `playwright.config.ts`, `tests/fixtures/isolated-runtime-env.ts`, and `tests/unit/isolated-runtime-environment.test.ts`.
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

    Task 9 is the first task allowed to edit or launch `m2-admin-crm.spec.ts`. First change its credential-free Portal redirect assertion from `/join?next=/portal` to `/member-login?next=%2Fportal`, then install the complete Task 4 managed sentinel/session boundary before any authenticated reset, login, or storage-state operation can execute. Expand `m2-admin-crm.spec.ts` from its ten-entry sample to the complete inventory. Import `protectedRouteOwnershipInventory`, require exactly 26 `admin` and 19 `api` owners, and materialize every dynamic token through an explicit exhaustive ID-keyed map. `M2_ADMIN_DENIAL_PATHS` contains exactly these concrete pages (the malformed members query remains a separate edge case):

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

    Extend the M2 safety/runtime tests across both declared boundaries. The outer-parent manifest requires `M2_ACCEPTANCE_ALLOW_DESTRUCTIVE=M2_ISOLATED_FIXTURES_ONLY`, original `M2_E2E_ALLOWED_ORIGIN`/`APP_URL`, original `NEON_PROJECT_ID`, `M2_TEST_NEON_PROJECT_ID`, `M2_TEST_NEON_HOST`, `DATABASE_URL_TEST`, `M2_TEST_CRON_SECRET`, and `M2_TEST_UNSUBSCRIBE_TOKEN_SECRET`; it proves original origin/project equality and non-production Neon/TLS identity before sanitizing. The sanitized M2 runner retains the sentinel, `DATABASE_URL_TEST`, M2/Stripe/Auth test sources, and exact `PR6_MANAGED_*` projections, but must omit standard `APP_URL`, `DATABASE_URL`, `NEON_PROJECT_ID`, Stripe, cron, unsubscribe, and Auth names. `requireManagedPlaywrightRunnerTarget(process.env, "M2")` returns the only target accepted by `m2-reset.ts`; its Pool uses `target.databaseUrlTest`, and its comparisons use `target.origin`, `target.databaseHost`, and `target.neonProjectId`. Next alone receives `DATABASE_URL`, `APP_URL`, `NEON_PROJECT_ID`, `CRON_SECRET`, and `UNSUBSCRIBE_TOKEN_SECRET` mapped from that target/test sources. Require both test secrets nonempty and distinct, with the unsubscribe secret at least 32 bytes. Assert any present `PLAYWRIGHT_BASE_URL`, missing/wrong sentinel, original parent mismatch, source/projection/attestation mismatch, standard-name leakage into the runner, missing project/test/secret variable, equal or undersized test secrets, production/non-Neon/mismatched/TLS-invalid DB, multiple mutating sentinels, or reusable/occupied server fails at its declared boundary before `connect` or `seedM2`.
    Change `m2-reset.ts` and `resetM2AuthenticatedFixtures` to accept the typed M2 `ManagedRunnerTarget` (or a Pool already constructed solely from `target.databaseUrlTest`) rather than call the legacy environment-derived database URL helper or require runner-side `DATABASE_URL === DATABASE_URL_TEST`/`NEON_PROJECT_ID === M2_TEST_NEON_PROJECT_ID`. Unit/source tests make those standard names absent, prove the old path fails RED, prove only the attested target can construct the Pool, and reject a raw URL or unverified environment. After that pure runner check, acquire the M2 advisory lock, resolve and validate the exact configured staff/member/company-admin profile/auth identities, and snapshot every profile column before calling `resetM2AuthenticatedFixtures` or `seedM2`. Only then run the named `beforeAll` reset/seed and require the seeded identities still have the same profile/auth IDs and expected fixture roles. A reset/seed failure retains the pre-reset snapshots for aggregate cleanup.

    Refactor `m2-auth.ts` to use Task 4's managed-session registry and in-memory authentication only. Remove `storageState({path})` and the `test-results/m2-auth` writer entirely. Every authenticated M2 context uses trace/screenshot/video off through the active managed sentinel and is revoked, proved anonymous, and closed by the registry before data/profile restoration. At implementation time, remove the exact legacy `test-results/m2-auth` directory only after resolving it under this worktree's `test-results` root; fail on any path mismatch and verify absence. Unit/source tests require no cookie/storage-state path, no trace-capable override, and cleanup execution on early test failure.

    In `afterAll`, first aggregate session revocation/anonymous verification/context closure. Then run the named mutation reset under the same lock, poll all three profiles through a bounded quiet window, and compare-and-swap restore the pre-reset snapshots against the exact post-reset rows. Retry only an allowed in-window `lastLoginAt`/`updatedAt` touch, require a second byte-identical quiet window, preserve external drift, aggregate session/reset/identity failures independently, and fail on any incomplete restoration. Inject seed-overwrites-baseline, reset failure, delayed `touchLastLogin` after reset and after first CAS, session-revocation failure, and partial multi-identity cleanup in unit tests. The E2E source contract requires snapshot-before-reset in `beforeAll` and revoke/close-before-reset-before-quiescent-restore in `afterAll`.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/admin-presentational.test.tsx tests/unit/admin-dashboard-tiles.test.tsx tests/unit/admin-member-list.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-member-profile.test.ts tests/unit/member-note-server-action-boundary.test.ts tests/unit/segment-query.test.ts tests/unit/segment-save-action.test.ts tests/unit/campaign-server-action-auth.test.ts tests/unit/at-risk-repository-boundary.test.ts tests/unit/admin-page-auth.test.ts tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts

    Expected: FAIL because Admin navigation is flat, Dashboard is brand-only, CRM pages lack shared primitives, the M2 reset/browser path is not yet bound to the shared deny-by-default managed runtime, pre-reset three-profile snapshots, deterministic session revocation/no-artifact behavior, test-only cron/unsubscribe mappings, and quiescent restoration are absent, and the browser suite lacks the complete 26-page and 19-API authority matrices.

- [ ] **Step 3: Adopt Admin shell and CRM primitives without moving authority**

    Build the three localized groups and render `InternalNavigation` from `AdminNav`. Load existing `Navigation` locale labels, mount one existing `LocaleSwitcher` through `InternalAppShell.utility`, and replace the layout frame and separate main with `InternalAppShell variant="admin"`. Keep `await requireAdminPageActor()` before any private child render.

    Add `M2_ACCEPTANCE_DESTRUCTIVE_SENTINEL = "M2_ISOLATED_FIXTURES_ONLY"` and the complete parent/runner/Next M2 manifest. Keep `tests/fixtures/m2-runtime-env.ts` as an M2-specific wrapper that delegates/re-exports Task 4's neutral helpers: parent missing/semantic checks validate original standard names; runner missing/semantic checks consume only retained sources plus `requireManagedPlaywrightRunnerTarget(..., "M2")`; and Next mapping alone creates standard application names after the full scrub. `m2-admin-crm.spec.ts` computes skip state from the runner helper only, passes the typed target into `m2-reset.ts`, and never expects stripped `APP_URL`, `DATABASE_URL`, or `NEON_PROJECT_ID`. Require `PLAYWRIGHT_BASE_URL` absent, `target.origin === M2_E2E_ALLOWED_ORIGIN`, `target.databaseUrlTest === DATABASE_URL_TEST`, `target.databaseHost === M2_TEST_NEON_HOST`, `target.neonProjectId === M2_TEST_NEON_PROJECT_ID`, standard Stripe names mapped only from `STRIPE_TEST_*`, and standard cron/unsubscribe names mapped only into Next from the distinct valid M2 test secrets; forbid `hkwtia.vercel.app`. Any nonempty destructive sentinel forces no server reuse; a parent launch failure or runner skip remains `NOT PASSED` before mutation. A separately approved valid run snapshots all three identities under lock before reset/seed, performs the reset, and only then starts managed registered sessions. Cleanup revokes/verifies/closes all sessions, runs the named reset, and restores the original pre-reset profiles through bounded quiet-window CAS.

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

    Expected: PASS with grouped active navigation, locale retention, unchanged CRM/security assertions, complete provider-capability scrubbing plus exact M2-only mappings, every unsafe M2 reset/target case blocked before connection or seed, pre-reset identity snapshots preserved across seed overwrite, no disk auth state/traces, all sessions revoked before close, and delayed login touches unable to survive quiescent three-profile cleanup.

    Run:

    npm.cmd run test:e2e -- tests/e2e/m2-admin-crm.spec.ts

    Expected: credential-free anonymous 26-page/two-locale Admin 404 PASS. The isolated anonymous/member/company-admin 19-API matrix, authenticated member/company-admin page matrix, and CRM cases run only after separate mutation approval and the complete M2 variable gate; all 26 pages deny both authenticated roles, every API preserves its route-specific denial/no-op status, the fingerprint is unchanged, all registered sessions are revoked/proved anonymous and contexts close, and `afterAll` completes deterministic data reset plus quiet-window/CAS restoration of staff/member/company-admin profiles. Missing approval, sentinel, database identity, origin, test secrets, credentials, or complete cleanup remains `NOT PASSED` and never calls `seedM2` before the guard.

- [ ] **Step 5: Commit the Admin CRM slice**

    git add -- ':(literal)app/[locale]/(admin)/admin/layout.tsx' ':(literal)components/admin/admin-nav.tsx' ':(literal)app/[locale]/(admin)/admin/page.tsx' ':(literal)app/[locale]/(admin)/admin/members/page.tsx' ':(literal)app/[locale]/(admin)/admin/members/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/segments/page.tsx' ':(literal)app/[locale]/(admin)/admin/at-risk/page.tsx' ':(literal)components/admin/dashboard-tiles.tsx' ':(literal)components/admin/member-table.tsx' ':(literal)components/admin/member-360.tsx' ':(literal)components/admin/member-note-form.tsx' ':(literal)components/admin/member-profile-form.tsx' ':(literal)components/admin/segment-builder.tsx' ':(literal)components/admin/segment-results.tsx' ':(literal)components/admin/segment-save-form.tsx' ':(literal)components/admin/at-risk-table.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-crm-shell.test.tsx' ':(literal)tests/unit/admin-presentational.test.tsx' ':(literal)tests/unit/admin-dashboard-tiles.test.tsx' ':(literal)tests/unit/admin-member-list.test.ts' ':(literal)tests/unit/admin-member-page-boundary.test.ts' ':(literal)tests/unit/admin-member-profile.test.ts' ':(literal)tests/unit/member-note-server-action-boundary.test.ts' ':(literal)tests/unit/segment-query.test.ts' ':(literal)tests/unit/segment-save-action.test.ts' ':(literal)tests/unit/campaign-server-action-auth.test.ts' ':(literal)tests/unit/at-risk-repository-boundary.test.ts' ':(literal)tests/unit/admin-page-auth.test.ts' ':(literal)tests/unit/m2-auth-reset.test.ts' ':(literal)tests/unit/m2-runtime-environment.test.ts' ':(literal)tests/unit/m2-browser-acceptance-contract.test.ts' ':(literal)tests/fixtures/m2-runtime-env.ts' ':(literal)tests/fixtures/m2-auth.ts' ':(literal)tests/fixtures/m2-reset.ts' ':(literal)tests/e2e/m2-admin-crm.spec.ts'
    git commit -m "feat: align admin crm shell"

### Task 10: Align all Admin CMS pages while preserving publication and media locks

**Files:**

- Modify CMS pages: `app/[locale]/(admin)/admin/announcements/page.tsx`, `app/[locale]/(admin)/admin/announcements/[id]/page.tsx`, `app/[locale]/(admin)/admin/news/page.tsx`, `app/[locale]/(admin)/admin/news/[id]/page.tsx`, `app/[locale]/(admin)/admin/page-copy/page.tsx`, `app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx`, `app/[locale]/(admin)/admin/media/page.tsx`, `app/[locale]/(admin)/admin/media/[id]/page.tsx`, `app/[locale]/(admin)/admin/partners/page.tsx`, `app/[locale]/(admin)/admin/partners/[id]/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx`.
- Modify presentation components: `components/admin/announcement-form.tsx`, `components/admin/news-form.tsx`, `components/admin/page-copy-form.tsx`, `components/admin/media-form.tsx`, `components/admin/media-upload-form.tsx`, `components/admin/partner-form.tsx`, `components/admin/landing-partner-form.tsx`, `components/admin/archive-toggle.tsx`.
- Create tests/fixtures: `tests/unit/wisetech-pr6-admin-cms-shell.test.tsx`, `tests/fixtures/authenticated-identity-safety.ts`, `tests/unit/authenticated-identity-safety.test.ts`, `tests/fixtures/m7-acceptance-safety.ts`, `tests/unit/m7-acceptance-safety.test.ts`, `tests/unit/m7-browser-acceptance-contract.test.ts`, `tests/e2e/m7-cms.spec.ts`.
- Consume unchanged: Task 4 managed `playwright.config.ts`/isolated-runtime helper and its no-reuse test contract.
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
      keyPath: string;
      value: string;
      updatedByProfileId: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    export type M7PageCopyTupleSnapshot = Readonly<{
      identity: `${"en" | "zh-HK"}:${string}`;
      locale: "en" | "zh-HK";
      namespace: "Privacy";
      keyPath: string;
      row: M7PageCopyRowSnapshot | null;
      baselineResolvedValue: string;
    }>;
    export type M7PageCopySnapshot = Readonly<{
      catalogKeyPaths: readonly string[];
      tuples: readonly M7PageCopyTupleSnapshot[];
      preexistingPageCopyAuditIds: readonly string[];
      baselineRenderedValues: Readonly<
        Record<"en" | "zh-HK", Readonly<Record<string, string>>>
      >;
    }>;

- The fixture also snapshots pre-run audit ID sets for Page Copy, the exact run-owned News ID, and the exact run-owned Media ID, then records bounded start/end timestamps around each real UI mutation. News/Media audit rows do not cascade when their target rows are deleted, so their exact IDs are first-class cleanup ledger entries rather than “other disposable rows.”
- `authenticated-identity-safety.ts` is a test-only full-profile snapshot/quiescence/CAS helper for M3-M7 and final authenticated verification. After pure target/DB guards and before login, it snapshots every column for the exact configured profile. After the shared registry revokes/proves anonymous/closes all browser contexts, it drains fire-and-forget `touchLastLogin` writes over a bounded quiet window, compare-and-swap restores the full baseline, retries only an allowed in-window late login touch, preserves external drift, and requires a second byte-identical quiet window. It aggregates identities independently and never imports into production.
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

    Add M7 safety RED cases at both managed boundaries. The outer parent requires `M7_ACCEPTANCE_ALLOW_DESTRUCTIVE=M7_ISOLATED_FIXTURES_ONLY`, original `APP_URL`/`M7_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID === M7_TEST_NEON_PROJECT_ID`, `DATABASE_URL_TEST`, canonical TLS/exact non-production `M7_TEST_NEON_HOST`, absent `PLAYWRIGHT_BASE_URL`, valid test-only Neon Auth inputs, one active sentinel, and exact Admin credentials before sanitizing. The runner requires `requireManagedPlaywrightRunnerTarget(..., "M7")`, constructs its Pool from `target.databaseUrlTest`, and compares `target.origin`/host/project to retained M7 sources while standard `APP_URL`, `DATABASE_URL`, `NEON_PROJECT_ID`, and Auth names remain absent. Next alone receives their guarded mappings. Pure parent/runtime or runner-target failures occur before Pool/auth/browser; guarded DB identity checks occur after only that Pool exists and before auth/browser or mutation.
    Snapshot the configured M7 Admin profile through the generic helper after guarded DB identity validation and before authentication. Register the real Admin context with Task 4's session owner; unit/source RED requires revoke/anonymous-verify before context closure, no disk auth artifacts, pre-restore drain, full-row CAS, post-restore quiet verification, delayed-touch coverage, external-drift preservation, and cleanup aggregation independent of Page Copy/News/Media phases.

    Define `m7-cms.spec.ts` as the isolated bilingual acceptance journey on Task 4's managed server. A guarded fixture inserts only run-ID-owned disposable News, Media registry, and reference rows and snapshots pre-run audit IDs for their exact target IDs. Page Copy has fixed `(locale, namespace, key_path)` identity and no run-ID column. Derive the authoritative ordered key set from `pageCopyCatalog("Privacy")`; require no duplicate key path, then snapshot every catalog tuple across both locales as a complete row or explicit absence, plus all preexisting Page Copy audit IDs and every resolved public baseline value. Fail before writes on any unreadable/missing catalog coverage. Re-read and byte-compare the full tuple set immediately before submit. Through the real UI, staff edits/publishes bilingual News, submits exact run Page Copy values while supplying every other catalog field from the guarded snapshot/bundle baseline, and exercises Media visibility/reference-lock/archive. Around every action, query guarded `SELECT clock_timestamp()` immediately before dispatch and immediately after the response, then reconstruct audit IDs by set difference; those database-derived inclusive bounds, never runner `Date.now()`, own audit time. Do not claim the DB-only Media URL resolves and do not call storage/provider APIs.

    Track Page Copy mutation/audit state separately. Re-read and drift-check the entire catalog-derived two-locale tuple set immediately before both mutation and restoration; any non-owned change in any target or non-target Privacy leaf stops the write, is preserved, and fails. Compute the complete actual before/after diff across all tuples, not an intended one-key set. In the independent cleanup phase, recompute audit-ID differences even when flags/captured IDs are missing and classify every tuple as exact baseline, exact owned run value/absence, or external drift. A Page Copy audit is owned only when its ID is new, `createdAt` lies inside the database `clock_timestamp()` bounds for the exact mutation/restoration UI request, actor user/type equal the configured Admin profile, action is `page_copy.updated`, target type is `page_copy`, target ID is `Privacy`, and metadata is exactly `{namespace: "Privacy", updated: [...actual changed-present tuple identities in `routing.locales` then `pageCopyCatalog` order], cleared: [...actual changed-absent tuple identities in that same production order]}` for that request. There is no tuple target or run-ID metadata. Skip baseline; restore only the complete exact owned diff; preserve/report drift. A fresh authenticated full-namespace UI submit supplies the exact baseline value for every prior-present tuple and the approved blank representation for every prior-absent tuple, including all unchanged leaves/locales. Only successful real-action restoration followed by both public locales rendering every catalog leaf's exact resolved baseline can pass; then CAS-restore original row metadata/timestamps for every restored prior-present tuple. If UI restoration or public verification fails while any tuple still equals its owned run value/absence, guarded direct DB restore may contain persistent data leakage for only the full exact owned diff, but it does not invalidate cache or satisfy public-baseline acceptance: report failure, terminate the isolated managed target, and make no restoration claim. Delete only mutation/restoration audit IDs satisfying the full predicate; preserve/report unexpected or extra candidates.

    In another unconditional independent `finally`, reconstruct and validate News/Media audit ownership before deleting target rows. Owned News audits are new IDs inside their exact database-clock request bounds with configured actor, target type `post`, target ID equal to the exact run News ID, action `post.updated` with metadata exactly `{fields: [...Object.keys(parsedSubmittedNewsUpdate).sort()]}`, or action `post.published` with metadata exactly `{slug: runSlug}`. The owned Media audit is a new ID inside its database-clock archive bounds with configured actor, action `media.archived`, target type `media`, target ID equal to the exact run Media ID, and metadata exactly `{url: runUrl}`. Unexpected, extra, out-of-window, or mismatched audit rows are preserved and fail cleanup. Independently delete exact owned audit IDs, reference, News, and Media rows and verify zero; no phase suppresses another. Unit/source contracts cover partial UI mutation/audit capture, non-cascading audit residue, idempotent reruns, drift preservation, runner/DB clock skew, and aggregate errors.

    In `m7-browser-acceptance-contract.test.ts`, require the shared managed guard before Pool/auth, bilingual route markers, run-ID ownership only where fields support it, both lifecycle hooks, nested aggregate cleanup, complete catalog-derived two-locale present/absent Page Copy snapshots, full-set baseline/run/drift classification including non-target-leaf drift, pre-write/pre-restore full-set rejection, complete-actual-diff audit ownership, real-UI restoration, every-leaf public baseline verification, database-derived request windows and audit-ID set differences, the real Page Copy `Privacy` target/`{namespace, updated, cleared}` metadata, full metadata restoration, and independently unconditional News/Media audit plus row cleanup. Require direct DB containment to fail acceptance and terminate the isolated target rather than claim revalidation. Require active Media visibility, reference-lock, archive visibility/removal, and no storage imports. In `m7-acceptance-safety.test.ts`, unit-test prior-row/prior-absence including an unchanged absent locale's blank representation, one-locale mutation, success before flag/capture, unexpected/extra/out-of-window audit rejection, exact News `post.updated` metadata object `{fields: [...]` plus `post.published` and Media `media.archived` predicates, non-cascading audit deletion, idempotency, early/UI restoration/public-verification failure, containment-without-success, external drift, independent phases, aggregate errors, fail-before-mutation drift, and runner clock skew proving only guarded DB `clock_timestamp()` bounds own audits. Keep `media-upload-delivery-routes.test.ts` unchanged as provider-double delivery evidence.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/authenticated-identity-safety.test.ts tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/admin-announcement-pages-rendered.test.tsx tests/unit/announcement-form-rendered.test.tsx tests/unit/admin-news.test.ts tests/unit/news-actions-auth-order.test.ts tests/unit/page-copy-action-state.test.ts tests/unit/page-copy-scope.test.ts tests/unit/admin-media.test.ts tests/unit/media-upload-form-rendered.test.tsx tests/unit/media-upload-delivery-routes.test.ts tests/unit/admin-partner-pages-rendered.test.tsx tests/unit/admin-partners.test.ts tests/unit/partner-media-locking.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/admin-revalidate-path.test.ts tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts

    Expected: FAIL on the new presentation/source contract and absent M7 guard/journey; existing publication, authorization, and reference-lock tests remain diagnostic controls.

- [ ] **Step 3: Apply CMS presentation primitives**

    Use `InternalPageHeader` on every list/detail page, `InternalSection` around existing forms/previews, `InternalTableFrame` around existing semantic tables, `InternalEmptyState` for empty repository results, and `InternalActionFeedback` for existing sanitized action state.

    Preserve all form names, hidden IDs, field-level errors, action bindings, repository calls, publication/archive locks, active-media transaction checks, partner provenance, bilingual News requirements, Page Copy allowlist, storage delivery paths, and localized revalidation. Do not add hard-coded production content or synthetic production rows.

    Implement the generic authenticated-identity helper and then the M7 test-only safety module, run-ID fixture, catalog-derived full-namespace/two-locale Page Copy snapshot/classifier, complete actual-diff ownership, request-window audit ledgers, guarded full-set re-reads, full-namespace UI restore, exact metadata/timestamp containment, and independent audit/row cleanup described in Step 1. The M7 fixture connects only after shared/pure checks, snapshots the configured Admin before login, exposes `prepareM7Fixture`, `snapshotM7PageCopy`, `assertM7PageCopyUnchanged`, `restoreM7PageCopyMetadata`, and `cleanupM7Fixture`, and is forbidden from production imports. After the shared registry revokes/proves anonymous/closes its session, identity restore is an independent aggregate phase. Never infer ownership from a fixed tuple alone, never expect run-ID Page Copy metadata, remove no non-owned record, preserve all unexpected audit candidates, and make cleanup idempotent. Direct DB containment after real-action failure always fails and disposes the managed target.

- [ ] **Step 4: Run GREEN and the complete CMS invariant subset**

    Run the Step 2 command again.

    Expected: PASS with all twelve pages aligned, CMS invariants unchanged, every unsafe M7 runtime rejected at the correct phase, configured Admin profile restored after quiet-window/CAS verification, complete catalog/two-locale present/absent Page Copy real-action restore and every-leaf public revalidation plus exact production audit ownership proven, non-cascading News/Media audit residue independently cleaned, source contract verifying the guarded E2E journey, and provider-double Media delivery only. A direct DB containment fallback can protect data but cannot pass. The mutating browser suite still requires separate isolated-mutation approval; absent approval is `NOT PASSED`.

- [ ] **Step 5: Commit the Admin CMS slice**

    git add -- ':(literal)app/[locale]/(admin)/admin/announcements/page.tsx' ':(literal)app/[locale]/(admin)/admin/announcements/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/news/page.tsx' ':(literal)app/[locale]/(admin)/admin/news/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/page-copy/page.tsx' ':(literal)app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx' ':(literal)app/[locale]/(admin)/admin/media/page.tsx' ':(literal)app/[locale]/(admin)/admin/media/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/partners/page.tsx' ':(literal)app/[locale]/(admin)/admin/partners/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/landing-partners/page.tsx' ':(literal)app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx' ':(literal)components/admin/announcement-form.tsx' ':(literal)components/admin/news-form.tsx' ':(literal)components/admin/page-copy-form.tsx' ':(literal)components/admin/media-form.tsx' ':(literal)components/admin/media-upload-form.tsx' ':(literal)components/admin/partner-form.tsx' ':(literal)components/admin/landing-partner-form.tsx' ':(literal)components/admin/archive-toggle.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/fixtures/authenticated-identity-safety.ts' ':(literal)tests/unit/authenticated-identity-safety.test.ts' ':(literal)tests/unit/wisetech-pr6-admin-cms-shell.test.tsx' ':(literal)tests/unit/admin-announcement-pages-rendered.test.tsx' ':(literal)tests/unit/announcement-form-rendered.test.tsx' ':(literal)tests/unit/admin-news.test.ts' ':(literal)tests/unit/news-actions-auth-order.test.ts' ':(literal)tests/unit/page-copy-action-state.test.ts' ':(literal)tests/unit/page-copy-scope.test.ts' ':(literal)tests/unit/admin-media.test.ts' ':(literal)tests/unit/media-upload-form-rendered.test.tsx' ':(literal)tests/unit/admin-partner-pages-rendered.test.tsx' ':(literal)tests/unit/admin-partners.test.ts' ':(literal)tests/unit/partner-media-locking.test.ts' ':(literal)tests/unit/admin-server-action-boundaries.test.ts' ':(literal)tests/unit/admin-revalidate-path.test.ts' ':(literal)tests/fixtures/m7-acceptance-safety.ts' ':(literal)tests/unit/m7-acceptance-safety.test.ts' ':(literal)tests/unit/m7-browser-acceptance-contract.test.ts' ':(literal)tests/e2e/m7-cms.spec.ts'
    git commit -m "feat: align admin cms shell"

### Task 11: Align Admin Operations pages and freeze lifecycle/audit controls

**Files:**

- Modify Operations pages: `app/[locale]/(admin)/admin/events-mgmt/page.tsx`, `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`, `app/[locale]/(admin)/admin/listings-review/page.tsx`, `app/[locale]/(admin)/admin/cohorts/page.tsx`, `app/[locale]/(admin)/admin/cohorts/[id]/page.tsx`, `app/[locale]/(admin)/admin/approvals/page.tsx`, `app/[locale]/(admin)/admin/reports/page.tsx`, `app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx`, `app/[locale]/(admin)/admin/automations/page.tsx`.
- Modify presentation components: `components/admin/event-form.tsx`, `components/admin/attendee-table.tsx`, `components/admin/showcase-review-table.tsx`, `components/admin/cohort-form.tsx`, `components/admin/cohort-kanban.tsx`, `components/admin/approval-list.tsx`, `components/admin/report-cards.tsx`, `components/admin/board-draft-list.tsx`, `components/admin/safe-generated-content.tsx`, `components/admin/automation-dashboard.tsx`, `components/admin/automation-retry-form.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-operations-shell.test.tsx`.
- Modify tests: `tests/unit/admin-events.test.ts`, `tests/unit/event-check-in.test.ts`, `tests/unit/m5-admin-review.test.tsx`, `tests/unit/admin-cohort-management.test.ts`, `tests/unit/m6-admin-cohorts.test.tsx`, `tests/unit/approval-authorization.test.ts`, `tests/unit/approval-server-action-auth.test.ts`, `tests/unit/approval-list.test.tsx`, `tests/unit/report-reconciliation.test.ts`, `tests/unit/board-reporter-render.test.ts`, `tests/unit/automation-dashboard-review.test.tsx`, `tests/unit/automation-retry.test.ts`, `tests/unit/admin-server-action-boundaries.test.ts`.
- Create M3 browser lifecycle: `tests/fixtures/m3-browser-lifecycle.ts`, `tests/unit/m3-browser-lifecycle.test.ts`.
- Modify M3 guard/safety/browser files: `tests/fixtures/m3-acceptance-safety.ts`, `tests/unit/m3-acceptance-isolation.test.ts`, `tests/unit/m3-acceptance-safety.test.ts`, `tests/unit/m3-e2e-safety.test.ts`, `tests/e2e/m3-automations.spec.ts`.
- Consume unchanged retry invariant: `tests/unit/automation-admin.test.ts`.
- Create M6 target/browser lifecycle: `tests/fixtures/m6-neon-target.ts`, `tests/unit/m6-neon-target.test.ts`, `tests/fixtures/m6-browser-lifecycle.ts`.
- Modify M6 seed/safety/browser files: `scripts/seed-m6.ts`, `tests/unit/m6-seed.test.ts`, `tests/unit/m6-e2e-safety-contract.test.ts`, `tests/e2e/m6-launch-pad.spec.ts`.
- Consume unchanged: Task 10 `tests/fixtures/authenticated-identity-safety.ts` and `tests/unit/authenticated-identity-safety.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes existing Event, Showcase, Cohort, Approval, Report, Board draft, and Automation owners.
- Produces no new transition, approval kind, publish/send control, retry eligibility, or audit path.
- Produces test-only M3/M6 reset, residue, audit, and identity evidence only; production retry eligibility, unsubscribe semantics, cohort transitions, Showcase projection, provider boundaries, and audit transaction order remain unchanged.

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
    Add M3 source/unit RED for a complete managed-loopback browser lifecycle, not only page reads. The original-parent manifest requires `M3_ACCEPTANCE_ALLOW_DESTRUCTIVE=M3_ISOLATED_FIXTURES_ONLY`, exact `M3_ACCEPTANCE_SEED=true` and canonical `M3_SEED_NOW`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M3_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, independently allowlisted non-production DB identity, valid test-only Neon Auth inputs, and `M3_TEST_UNSUBSCRIBE_TOKEN_SECRET` of at least 32 bytes. The runner requires the exact M3 `ManagedRunnerTarget`, builds its Pool from `target.databaseUrlTest`, uses `target.origin`, and rejects standard `APP_URL`/`DATABASE_URL`/Auth/unsubscribe names; Next alone receives `DATABASE_URL`, `APP_URL`, Auth, and `UNSUBSCRIBE_TOKEN_SECRET` mapped after the neutral scrub. No reuse is allowed. Under the M3 seed advisory lock and before any write, resolve the exact configured staff/member emails to one `staff` and one `member` profile, require their normalized emails/auth IDs/profile IDs pairwise distinct and disjoint from every fixture profile identity, and snapshot both complete login-profile rows. In the same locked preflight, capture a complete serializable ledger for every predicate `clearFixture` can delete or `writeFixture` can overwrite: referenced membership-plan codes; all fixture profile rows; every membership and cascade child owned by fixture profile IDs; staff tasks, email/WhatsApp logs, journey states, suppressions, engagement events/scores for those profiles; the fixed saved segment, campaign and campaign recipients; fixed approvals; audit rows whose target is a fixture journey/approval or whose request ID matches `m3-seed:%`; and jobs at fixture IDs or `run_key LIKE 'm3-seed:%'`. Record full rows plus prior absence in FK-safe groups; any unreadable set, identity overlap, duplicate natural key, or predicate expansion after the lock fails before `seedM3`. Locally verify `M3_TEST_UNSUBSCRIBE_TOKEN_EN` and `M3_TEST_UNSUBSCRIBE_TOKEN_ZH_HK` with the retained test secret, exact fixture profile/locale payloads, and an expiry covering the run before browser/auth. Only then call `seedM3` and require exact seeded markers in the managed UI before creating the run-owned eligible retry/ineligible controls.

    Add M6 source/unit RED for one deterministic managed-loopback lifecycle. The original-parent manifest requires `M6_ACCEPTANCE_ALLOW_DESTRUCTIVE=M6_ISOLATED_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, exact `M6_ACCEPTANCE_SEED=true`, fixed canonical `M6_ACCEPTANCE_AS_OF`, original `APP_URL`/`M6_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID === M6_TEST_NEON_PROJECT_ID`, `DATABASE_URL_TEST`, no reuse, exact syntax for `M6_TEST_NEON_PROJECT_ID`, branch/endpoint/host IDs, a nonempty project-scoped `M6_TEST_NEON_API_KEY`, and valid test-only Neon Auth inputs before sanitizing. The runner requires the exact M6 `ManagedRunnerTarget`, uses `target.origin` and retained project/branch/endpoint/host/API-key sources, and rejects standard `APP_URL`, `DATABASE_URL`, `NEON_PROJECT_ID`, and Auth names; Next alone receives guarded DB/APP/project/Auth mappings. The API key is consumed only by the runner-side test fixture and is always absent from Next.

    After pure checks and before constructing a Pool/browser/Auth client or running a seed, `m6-neon-target.ts` performs only bounded authenticated `GET` requests to `https://console.neon.tech/api/v2/projects/{projectId}`, `/projects/{projectId}/branches/{branchId}`, and `/projects/{projectId}/branches/{branchId}/endpoints`. Require the provider responses to identify the exact configured project, branch, and one primary read-write endpoint; require endpoint project/branch/ID/host exact equality with the canonical TLS `DATABASE_URL_TEST`; require the branch to be a non-default child (`parent_id` nonnull and ID unequal to project `default_branch_id`), unprotected, and both project/branch names to reject case-insensitive `prod`, `production`, `main`, and `live` labels. Require `target.neonProjectId === M6_TEST_NEON_PROJECT_ID`, `target.databaseHost` plus the parsed `target.databaseUrlTest` to equal the direct non-pooled endpoint host, `sslmode=require` or stricter, and the reviewed operator approval record to name the same project/branch/endpoint IDs. An HTTP redirect, non-GET attempt, unexpected API host/path, missing/extra read-write endpoint, provider timeout/error, identity/name/protection/default/host/TLS mismatch, or inability to prove the metadata is `NOT PASSED` before Pool construction. Unit tests use a strict fake that rejects all mutation methods and prove an operator host allowlist or two equal database URLs alone can never authorize M6.

    Only after that independent provider proof may the lifecycle construct its guarded Pool. Under the seed advisory lock, snapshot every full row at all fixed cohort/partner/company/application IDs, the exact member-company application boundary, pre-run audit IDs, and full configured member/staff profiles. For each of the five fixed cohort/company pairs, query the unique key as well as the fixed ID and fail before seed if a pair resolves to an alternate ID or either identity is ambiguous. Query every Showcase row for the graduation company and require exactly one expected target ID before mutation; snapshot its full row, including `goneGlobal`/`updatedAt`. Run `seedM6(pool, {asOf})` only after those checks and require the managed UI to render exact seeded identities before mutation. Audit request ownership uses guarded database `clock_timestamp()` bounds, with unit coverage for runner/DB clock skew.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/authenticated-identity-safety.test.ts tests/unit/wisetech-pr6-admin-operations-shell.test.tsx tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/m5-admin-review.test.tsx tests/unit/admin-cohort-management.test.ts tests/unit/m6-admin-cohorts.test.tsx tests/unit/approval-authorization.test.ts tests/unit/approval-server-action-auth.test.ts tests/unit/approval-list.test.tsx tests/unit/report-reconciliation.test.ts tests/unit/board-reporter-render.test.ts tests/unit/automation-dashboard-review.test.tsx tests/unit/automation-retry.test.ts tests/unit/automation-admin.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/m6-seed.test.ts tests/unit/m6-neon-target.test.ts tests/unit/m6-e2e-safety-contract.test.ts

    Expected: FAIL on new shell/presentation assertions and absent managed M3/M6 browser lifecycle contracts, complete M3 pre-seed ledger/restoration, M6 provider-verified non-default/unprotected test project/branch/endpoint identity before Pool plus unique-pair/Showcase cardinality guards, and database-clock audit ownership. Existing authorization, retry/audit transaction, seed, cohort-transition, and Showcase controls remain diagnostic baselines.

- [ ] **Step 3: Apply Operations presentation primitives**

    Use `InternalPageHeader`, `InternalSection`, `InternalTableFrame`, `InternalEmptyState`, `InternalStatusBadge`, and `InternalActionFeedback` according to current page content. Keep all repository reads and Server Actions in their current files.

    Do not change Event fields, Showcase review state, Cohort transition matrix, approval decision rules, report formulas, Board draft sanitization, automation retry eligibility, or audit transaction order. Do not add send/publish controls to Board drafts.
    Implement `m3-browser-lifecycle.ts` without production imports. Refactor the M3 safety helpers from external Preview/different-runner-DB assumptions to Task 4 managed origin, exact child DB mapping, no-reuse sentinel, shared test-only Auth mapping, and `UNSUBSCRIBE_TOKEN_SECRET <- M3_TEST_UNSUBSCRIBE_TOKEN_SECRET` after the neutral scrub while preserving non-production host/TLS checks. Under the seed lock, resolve and snapshot the disjoint configured login profiles plus the complete Step 1 ledger before any seed write; verify both supplied unsubscribe tokens locally against the mapped secret; run `seedM3`; and prove the exact managed target shows the seeded markers before the real Server Action. Staff clicks retry once; use guarded `clock_timestamp()` immediately before/after the request and require journey `scheduled`/null error, matching email exact Admin-authorized code, and exactly one new audit inside those DB bounds with configured actor, action `journey.failed_retry_requested`, target `journey_state`/run ID, and exact `{scheduledAt, deliveryKey}`. Reload/replay and the sent/ineligible control must deny another transition/audit; `automation-admin.test.ts` directly submits non-failed IDs and proves no write. Existing English/Chinese console, Member 360, denial, and unsubscribe cases stay. In aggregate `afterAll`, revoke/verify/close every registered session; delete exact run retry audit/email/journey controls; then compare-and-swap restore every ledger group in FK-safe order, deleting rows absent before and restoring full rows present before. Preserve/fail on any unexpected drift or new predicate match, verify every pre-run row set byte-identically including prior absence, and only then quiet-window/CAS restore the pre-seed login-profile snapshots. Never use `seedM3` as restoration, and forbid provider, job-runner, delivery retry, or mail send.

    Implement `m6-neon-target.ts` and `m6-browser-lifecycle.ts`, and make `m6-launch-pad.spec.ts` call the lifecycle in `beforeAll`/`afterAll`. Provider-verify the exact non-default, unprotected, non-production-labelled project/branch/read-write endpoint through the bounded GET-only Neon adapter before Pool construction; never pass its API key to the child. Before seed, enforce the fixed-ID/unique-pair equality for all five cohort applications and exact one-row/expected-ID Showcase cardinality for the graduation company. The member application is owned only by exact cohort, controlled member company, DB-clock request bounds, and pre-run absence/baseline. Each stage audit is owned only by new ID, configured staff actor/type, action `cohort_application.stage_changed`, target type/id, database-clock request bounds, and exact `{fromStage, toStage}` chain. Snapshot and compare-and-swap restore every pair-owned application, all seed-upserted fixed rows, and the complete graduation-company Showcase set including `goneGlobal`/`updatedAt`; delete only a truly absent-before member application and its exact residue. Revoke/verify/close registered sessions, drain/restore both profiles with the shared helper, then verify byte-identical pre-run database and identity baselines. Partial provider proof, seed, application, transition, audit, Showcase, session, or one-identity failure cannot suppress another cleanup phase. Unexpected alternate IDs, cardinality change, clock-skew candidate, or drift is preserved and fails.

- [ ] **Step 4: Run GREEN and M3-M7 focused regression suites**

    Run the Step 2 command again.

    Expected: PASS with all nine Operations pages aligned and all invariant controls unchanged.

    Run:

    npm.cmd test -- tests/unit/authenticated-identity-safety.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/automation-admin.test.ts tests/unit/m4b-runtime-guard.test.ts tests/unit/m5-contracts.test.ts tests/unit/m5-repository.test.ts tests/unit/m6-contracts.test.ts tests/unit/m6-repository.test.ts tests/unit/m6-seed.test.ts tests/unit/m6-neon-target.test.ts tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m7-schema-contract.test.ts tests/unit/m7-media-schema-contract.test.ts

    Expected: PASS, including exact M3 full-footprint pre-seed ledger and prior-present/prior-absent restoration, unsubscribe/retry/audit residue, M6 provider-verified test project/branch/endpoint plus fixed-pair collision/cardinality guards and seed/application/stage-audit/all-Showcase restoration, database-clock ownership under runner skew, and delayed-login identity cleanup contracts. Environment/provider-dependent acceptance remains separately gated.

    With separate named approvals and complete managed variables, run `npm.cmd run test:e2e -- tests/e2e/m3-automations.spec.ts` and `npm.cmd run test:e2e -- tests/e2e/m6-launch-pad.spec.ts` separately. Each must use the guarded managed server mapped to `DATABASE_URL_TEST`, exercise its real UI outcomes, restore complete database and identity baselines in `afterAll`, and prove zero unexpected residue. Missing authority/guard, an M3 predicate-ledger mismatch, an M6 alternate pair ID/Showcase cardinality mismatch, or any cleanup uncertainty is `NOT PASSED`.

- [ ] **Step 5: Commit the Admin Operations slice**

    git add -- ':(literal)app/[locale]/(admin)/admin/events-mgmt/page.tsx' ':(literal)app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/listings-review/page.tsx' ':(literal)app/[locale]/(admin)/admin/cohorts/page.tsx' ':(literal)app/[locale]/(admin)/admin/cohorts/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/approvals/page.tsx' ':(literal)app/[locale]/(admin)/admin/reports/page.tsx' ':(literal)app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/automations/page.tsx' ':(literal)components/admin/event-form.tsx' ':(literal)components/admin/attendee-table.tsx' ':(literal)components/admin/showcase-review-table.tsx' ':(literal)components/admin/cohort-form.tsx' ':(literal)components/admin/cohort-kanban.tsx' ':(literal)components/admin/approval-list.tsx' ':(literal)components/admin/report-cards.tsx' ':(literal)components/admin/board-draft-list.tsx' ':(literal)components/admin/safe-generated-content.tsx' ':(literal)components/admin/automation-dashboard.tsx' ':(literal)components/admin/automation-retry-form.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-operations-shell.test.tsx' ':(literal)tests/unit/admin-events.test.ts' ':(literal)tests/unit/event-check-in.test.ts' ':(literal)tests/unit/m5-admin-review.test.tsx' ':(literal)tests/unit/admin-cohort-management.test.ts' ':(literal)tests/unit/m6-admin-cohorts.test.tsx' ':(literal)tests/unit/approval-authorization.test.ts' ':(literal)tests/unit/approval-server-action-auth.test.ts' ':(literal)tests/unit/approval-list.test.tsx' ':(literal)tests/unit/report-reconciliation.test.ts' ':(literal)tests/unit/board-reporter-render.test.ts' ':(literal)tests/unit/automation-dashboard-review.test.tsx' ':(literal)tests/unit/automation-retry.test.ts' ':(literal)tests/unit/admin-server-action-boundaries.test.ts' ':(literal)tests/fixtures/m3-acceptance-safety.ts' ':(literal)tests/unit/m3-acceptance-isolation.test.ts' ':(literal)tests/unit/m3-acceptance-safety.test.ts' ':(literal)tests/fixtures/m3-browser-lifecycle.ts' ':(literal)tests/unit/m3-e2e-safety.test.ts' ':(literal)tests/unit/m3-browser-lifecycle.test.ts' ':(literal)tests/e2e/m3-automations.spec.ts' ':(literal)scripts/seed-m6.ts' ':(literal)tests/fixtures/m6-neon-target.ts' ':(literal)tests/unit/m6-neon-target.test.ts' ':(literal)tests/fixtures/m6-browser-lifecycle.ts' ':(literal)tests/unit/m6-seed.test.ts' ':(literal)tests/unit/m6-e2e-safety-contract.test.ts' ':(literal)tests/e2e/m6-launch-pad.spec.ts'
    git commit -m "feat: align admin operations shell"

### Task 12: Prove bilingual, accessibility, M1-M7, and delivery gates without widening authority

**Files:**

- Create: `tests/e2e/wisetech-pr6-internal-journeys.spec.ts`, `tests/fixtures/m5-browser-lifecycle.ts`, `tests/unit/m5-browser-lifecycle.test.ts`, `tests/fixtures/pr6-authenticated-accessibility-lifecycle.ts`, `tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts`, `tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts`, `scripts/run-credential-free-verification.mjs`, `tests/unit/credential-free-verification-boundary.test.ts`, `scripts/run-lighthouse-preview.mjs`, `scripts/run-lighthouse-preview.d.mts`, `tests/fixtures/lighthouse-process-env-probe.mjs`, `tests/fixtures/lighthouse-config-loader-probe.cjs`, `tests/unit/lighthouse-process-boundary.test.ts`, `tests/unit/lighthouse-runner.test.ts`, `tests/unit/lighthouse-config.test.ts`, `tests/unit/lighthouse-config-loader.test.ts`, `lighthouserc.d.cts`, `docs/integration/wisetech-pr6-verification.md`, `docs/integration/wisetech-pr6-pr-body.md`.
- Consume unchanged in final regression commands: `tests/e2e/accessibility.spec.ts`, `tests/e2e/core-pages.spec.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`. Their behavior changes, if any, belong to Tasks 5, 7, or 8 and must be staged there; Task 12 adds no assertion or edit to these files.
- Modify managed M4B/M5 browser gates: `tests/fixtures/m4b-e2e-safety.ts`, `tests/unit/m4b-e2e-safety.test.ts`, `tests/e2e/m4b-agents.spec.ts`, `tests/e2e/m5-showcase.spec.ts`. Both consume Task 10's generic authenticated-identity helper.
- Modify the public performance gate: `package.json`; rename the existing ESM-incompatible `lighthouserc.js` to CommonJS `lighthouserc.cjs` and add sibling `lighthouserc.d.cts`. The package script delegates to the exact local wrapper; the config uses only the authorized Preview route allowlist below, a run-owned OS-temp working/output directory, no local-server fields, and no noindex/authenticated URL.
- Consume without weakening: Task 1 `tests/e2e/public-shell.spec.ts`; Task 2 `tests/e2e/join-auth.spec.ts`; Task 4 shared managed runtime plus M1; Task 9 M2 reset/browser; Task 10 authenticated-identity helper plus M7; Task 11 complete managed M3/M6 browser lifecycles; and existing M4C read-only guard/browser suite.

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
    - browser request interception fails the test if a credential-free case itself issues a request to a mutating application endpoint or unexpected external origin. It does not claim visibility into server-to-server Neon, Stripe, repository, or database calls; focused action/service fakes and guarded before/after fingerprints are the authority for those no-call contracts. Do not synthesize authenticated HTML.

    In `wisetech-pr6-authenticated-accessibility.spec.ts`, use the real guarded identities and run this exact EN/zh-HK route matrix at all five widths:
    This suite has its own managed lifecycle. The original parent requires `PR6_AUTHENTICATED_AXE_ALLOW_DESTRUCTIVE=PR6_ISOLATED_IDENTITIES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`PR6_AXE_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID === PR6_AXE_TEST_NEON_PROJECT_ID`, `DATABASE_URL_TEST`, exact non-production `PR6_AXE_TEST_DB_HOST`, valid test-only Neon Auth inputs, and exactly four pairwise-distinct route-matrix identities: M2 member/staff, M3 staff, and M7 Admin. The runner requires `requireManagedPlaywrightRunnerTarget(..., "AXE")`, builds its Pool from `target.databaseUrlTest`, compares the target projections to the retained Axe sources, and rejects standard DB/APP/project/Auth names; Next alone receives guarded mappings. After the guarded Pool exists, snapshot every distinct full profile before login. Each real sign-in must return the exact expected profile/auth identity, register its context with the shared session owner, and advance that same guarded DB profile's `lastLoginAt` inside database `clock_timestamp()` request bounds, observationally binding target and database before continuing. Revoke every session through real sign-out, prove anonymous state, close every context, and quiet-window/CAS restore all identities in an aggregate `afterAll`; a parent launch failure, runner skip, binding failure, drift, or incomplete restoration is `NOT PASSED`.

    | Surface | English | Traditional Chinese | Guarded identity/fixture |
    | --- | --- | --- | --- |
    | Join | `/join?plan=startup&interval=annual#join-form` | `/zh/join?plan=startup&interval=annual#join-form` | credential-free |
    | Portal | `/portal` | `/zh/portal` | M2 member |
    | CRM | `/admin/members` | `/zh/admin/members` | M2 staff |
    | CMS | `/admin/news` | `/zh/admin/news` | M7 staff |
    | Reports | `/admin/reports` | `/zh/admin/reports` | M2 staff |
    | Automations | `/admin/automations` | `/zh/admin/automations` | M3 staff |

    For all 60 route/width cases, require zero serious/critical Axe violations, one H1/main, no document overflow, visible keyboard focus, and no console/page error. For Portal/Admin, small widths require mobile Escape/focus return and large widths require desktop sidebar. Join retains compact navigation. Locale switches preserve exact query/hash. The suite never fakes auth, and it cannot pass unless every distinct configured identity is target-to-DB bound, every browser context is closed, and all full-profile snapshots remain byte-identical through the post-restore quiet window.

    Refactor `m4b-e2e-safety.ts` and `m4b-agents.spec.ts` onto Task 4 managed runtime. The original parent requires `M4B_IDENTITY_RESTORE_ALLOW_DESTRUCTIVE=M4B_TEST_IDENTITIES_ONLY`, canonical `M4B_ACCEPTANCE_AS_OF`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M4B_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M4B_TEST_DB_HOST`, valid test-only Neon Auth inputs, and exact distinct staff/member credentials. The runner requires the exact M4B `ManagedRunnerTarget`, constructs its Pool from `target.databaseUrlTest`, uses `target.origin`, and rejects standard DB/APP/Auth names; Next alone receives guarded mappings. A guarded read-only preflight derives the exact fixture window/source keys from `M4B_ACCEPTANCE_AS_OF` and requires exactly the three expected pending retention approvals plus one exact inert Board-report post and no ambiguous duplicate before login; it never calls `seedM4B`, an agent, a job route, or a provider. Snapshot both full profiles through Task 10 generic helper. Load both message catalogs and iterate locale prefixes `""` and `"/zh"`: staff must see the three retention approvals, reports, and inert Board preview in both locales; member must receive each locale's real 404 on approvals/reports. Revoke/anonymous-verify/close every registered session and independently quiet-window/CAS restore both profiles; a parent failure, runner skip, missing/stale fixture evidence, one missing locale, late touch, or restoration failure is `NOT PASSED`.

    Implement `m5-browser-lifecycle.ts` as a managed, advisory-locked, test-only lifecycle. The original parent requires `M5_ACCEPTANCE_ALLOW_DESTRUCTIVE=M5_ISOLATED_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M5_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M5_TEST_DB_HOST`, valid test-only Neon Auth inputs, exact distinct manager/member/staff credentials, `M5_TEST_COMPANY_ID`, and `M5_TEST_LISTING_ID`. The runner requires the exact M5 `ManagedRunnerTarget`, constructs its Pool from `target.databaseUrlTest`, uses `target.origin`, and rejects standard DB/APP/Auth names; Next alone receives guarded mappings. Guarded DB preflight requires manager/member application profiles with role `member` and staff with role `staff`; normalized email/auth/profile IDs are pairwise distinct; manager has exactly one active company context at the target with company role `owner` or `admin`; ordinary member has exactly one at the same company with role `member`; and the listing ID is absent or belongs only to that company with no natural-key collision. Snapshot all three full profiles and the complete listing row or prior absence, then compare-and-swap initialize one exact draft run value. Through separate fresh contexts, manager saves a real draft and submits review, ordinary member sees the same listing read-only with no save/submit controls, and staff rejects the exact pending row with one nonempty run reason; verify every durable transition against the guarded DB. After all registered sessions are revoked, proved anonymous, and closed, CAS restore/delete the listing to its exact baseline, terminate the managed target so no stale cache is claimed, and quiet-window/CAS restore all three profiles independently. Unit/source tests cover parent/runner boundary confusion, pure guard-before-Pool/browser/auth, origin mismatch, role/company ambiguity, alternate listing ownership, prior-present/prior-absent rows, every partial transition, late login touches, external drift, and aggregate cleanup.

    Before Step 2, create executable-only `scripts/run-credential-free-verification.mjs` and `credential-free-verification-boundary.test.ts`. It imports only Task 4's pure managed-environment module, accepts exactly `unit` or `e2e` plus literal forwarded test paths, rejects every `tests/integration` path in credential-free mode, resolves the repository-local Vitest or managed-Playwright entrypoint without PATH/npm shims, and spawns it with `shell: false` plus `buildCredentialFreeVerificationEnvironment(originalEnvironment)`. That replacement map has only the canonical shell/Node/runtime allowlist, fixed `NODE_ENV=test`/`NEXT_TELEMETRY_DISABLED=1`, and no standard/test database, provider, Auth, password, token, sentinel, proxy, telemetry destination, or arbitrary ambient key. Its real child probe contaminates the parent and proves exact key-set replacement; unsupported mode/path, case collision, local-CLI mismatch, dotenv candidate, or child failure fails. This wrapper is mandatory for Steps 2-4 and the nonmutating part of Step 5, so an ambient `DATABASE_URL_TEST` cannot activate legacy integration tests and ambient credentials cannot activate an isolated browser suite. Existing real-PostgreSQL integration files are excluded and recorded as separate external gates; PR6's new webhook integration runs only under its named gate below.

    Also create `scripts/run-lighthouse-preview.mjs`, `scripts/run-lighthouse-preview.d.mts`, `tests/fixtures/lighthouse-process-env-probe.mjs`, `tests/fixtures/lighthouse-config-loader-probe.cjs`, `tests/unit/lighthouse-process-boundary.test.ts`, `tests/unit/lighthouse-runner.test.ts`, `tests/unit/lighthouse-config.test.ts`, and `tests/unit/lighthouse-config-loader.test.ts`; rename `lighthouserc.js` to `lighthouserc.cjs`, add `lighthouserc.d.cts`, and point `package.json`'s `test:lighthouse` script at the wrapper's exact `.cjs` path. All four Lighthouse unit contracts and both declaration/runtime export contracts must execute without network or Chrome launch in the focused aggregate. The loader test spawns the real locked `@lhci/utils` 0.15.1 config loader through `lighthouse-config-loader-probe.cjs` under synthetic verified inputs and proves it loads the CommonJS file and returns the exact guarded shape; any `ERR_REQUIRE_ESM`, alternate config discovery, or package-version drift fails before the authorized Preview collection in Step 6.

- [ ] **Step 2: Run the focused PR6 cross-surface aggregate**

    Run:

    node scripts/run-credential-free-verification.mjs unit -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-links.test.tsx tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-terminal-state.test.ts tests/unit/join-terminal-transaction.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/credential-free-verification-boundary.test.ts tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/webhook-postgres-safety.test.ts tests/unit/m1-live-acceptance-safety.test.ts tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/locale-switcher.test.tsx tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/authenticated-identity-safety.test.ts tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts tests/unit/wisetech-pr6-admin-operations-shell.test.tsx tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m5-browser-lifecycle.test.ts tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts tests/unit/lighthouse-process-boundary.test.ts tests/unit/lighthouse-runner.test.ts tests/unit/lighthouse-config.test.ts tests/unit/lighthouse-config-loader.test.ts

    Expected: PASS. Record timestamp, exit code, files, test total, warnings, and skips.

- [ ] **Step 3: Run dependency, static, unit, lint, type, build, security, and diff gates**

    Run each separately and record its exact result:

    npm.cmd ci
    npm.cmd run audit:strings
    node scripts/run-credential-free-verification.mjs unit -- tests/unit
    git ls-files -- ':(glob)tests/integration/**'
    npm.cmd run lint
    npm.cmd run typecheck
    npm.cmd run build
    npm.cmd audit --omit=dev --audit-level=high
    git diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD

    Expected: credential-free static and complete `tests/unit` gates PASS; audit reports zero high vulnerabilities. The command must not discover `tests/integration`, and the verification record inventories every excluded real-PostgreSQL file as a separately authorized external gate. Existing migration/seed/truncation integrations are never invoked from an ambient `DATABASE_URL_TEST`; absent separate hardening/approval they remain `NOT PASSED`. If a command is blocked by the existing worktree junction, missing credential, or external environment, record the exact command/error and classify it as a baseline/environment gate, not a passing result and not a PR6 regression without reproduction against the base.

- [ ] **Step 4: Run credential-free and complete repository browser gates**

    Run:

    node scripts/run-credential-free-verification.mjs e2e -- tests/e2e/wisetech-pr6-internal-journeys.spec.ts tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/core-pages.spec.ts tests/e2e/join-auth.spec.ts tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts

    Expected: credential-free PR6 cases PASS at the exact locale/width matrix without provider or mutation traffic.

    Run:

    node scripts/run-credential-free-verification.mjs e2e

    Expected: every credential-free repository browser case PASS under the replacement environment. Isolated M1, M2, M3, M4B, M4C, M5, M6, M7, and authenticated-Axe cases must skip because the wrapper removes their credentials/sentinels; each remains `NOT PASSED`, is run only in Step 5 under separate authority, and is never counted as credential-free acceptance.

- [ ] **Step 5: Prove safety contracts, then run isolated M1-M7 only with separate authority**

    First run the non-mutating safety-contract command:

    node scripts/run-credential-free-verification.mjs unit -- tests/unit/credential-free-verification-boundary.test.ts tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/authenticated-identity-safety.test.ts tests/unit/m1-live-acceptance-safety.test.ts tests/unit/webhook-postgres-safety.test.ts tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/m4b-runtime-guard.test.ts tests/unit/m4b-e2e-safety.test.ts tests/unit/m5-browser-lifecycle.test.ts tests/unit/m6-neon-target.test.ts tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts

    Expected: PASS. The actual Playwright-CLI web-server probe proves canonical shell/runtime routing and the exact three-key Playwright merge; the outer wrapper and inner launcher each replace, rather than merge, their environment; the real locked Next loader proves the post-load child contains only guarded test mappings, fixed telemetry/processed-loader markers, and its operational allowlist; and the pinned browser launcher receives a separate capability-free environment. The PostgreSQL guard proves mock-before-import single-handle binding, default-client non-evaluation, deterministic lock/failpoint behavior, managed identity target-to-DB binding, no-reuse behavior, and every destructive/provider/database/target/identity guard fails closed at its specified pure or guarded-DB phase before unauthorized mutation.

    Record a separate operator approval reference in the verification document before setting any destructive/provider sentinel. Never print values. The variables listed below are exact original-parent operator inputs. The outer launcher validates them before sanitization; the Playwright runner receives only the retained test-source names and attested `PR6_MANAGED_*` projections declared by the suite manifest, while standard application names exist only in the replacement Next environment:

    Every managed authenticated suite additionally requires exact `NEON_AUTH_TEST_BASE_URL`, `NEON_AUTH_TEST_ALLOWED_ORIGIN`, and `NEON_AUTH_TEST_COOKIE_SECRET`. The pure shared guard requires canonical non-production HTTPS, exact base-origin/allowlist equality, and a cookie secret of at least 32 bytes before mapping child `NEON_AUTH_BASE_URL`/`NEON_AUTH_COOKIE_SECRET`; ambient standard/test Auth values are scrubbed first. Every created session is registry-owned, revoked through the real sign-out endpoint, proved anonymous, and closed before profile/data restoration; disk storage state and managed-suite trace/screenshot/video output are forbidden.

    - M1: `M1_ACCEPTANCE_ALLOW_DESTRUCTIVE=M1_ISOLATED_FIXTURES_ONLY`, `M1_ACCEPTANCE_ALLOW_PROVIDER_CALLS=M1_TEST_PROVIDERS_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M1_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `M1_TEST_NEON_PROJECT_ID`/`M1_TEST_NEON_HOST`, the shared test-only Neon Auth trio, all four `STRIPE_TEST_SECRET_KEY`/`STRIPE_TEST_WEBHOOK_SECRET`/`STRIPE_TEST_STARTUP_PRICE_ID`/`STRIPE_TEST_CORPORATE_PRICE_ID`, exact `M1_TEST_OWNER_EMAIL`/`M1_TEST_INVITEE_EMAIL`/`M1_TEST_OVERFLOW_EMAIL`, `M1_TEST_MAGIC_LINK_INBOX_URL`, `M1_TEST_MAGIC_LINK_INBOX_TOKEN`, and `M1_TEST_MAGIC_LINK_ALLOWED_ORIGIN`. Standard child DB/Stripe/Auth/APP names come only from guarded mappings.
    - M2: `M2_ACCEPTANCE_ALLOW_DESTRUCTIVE=M2_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M2_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `M2_TEST_NEON_PROJECT_ID`/`M2_TEST_NEON_HOST`, the shared test-only Neon Auth trio, all four exact `STRIPE_TEST_*` names listed for M1, distinct valid `M2_TEST_CRON_SECRET`/`M2_TEST_UNSUBSCRIBE_TOKEN_SECRET`, and exact `M2_TEST_STAFF_EMAIL`/`M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`/`M2_TEST_MEMBER_PASSWORD`, and `M2_TEST_COMPANY_ADMIN_EMAIL`/`M2_TEST_COMPANY_ADMIN_PASSWORD`. Snapshot all three profiles under lock before the first reset/seed; never write cookie storage state.
    - M3: `M3_ACCEPTANCE_ALLOW_DESTRUCTIVE=M3_ISOLATED_FIXTURES_ONLY`, `M3_ACCEPTANCE_SEED=true`, fixed canonical `M3_SEED_NOW`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M3_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` mapped to child `DATABASE_URL`, exact non-production `M3_ACCEPTANCE_EXPECTED_DB_HOST`, the shared test-only Neon Auth trio, exact `M3_TEST_STAFF_EMAIL`/`M3_TEST_STAFF_PASSWORD` and `M3_TEST_MEMBER_EMAIL`/`M3_TEST_MEMBER_PASSWORD`, `M3_TEST_UNSUBSCRIBE_TOKEN_SECRET`, and locally verified `M3_TEST_UNSUBSCRIBE_TOKEN_EN`/`M3_TEST_UNSUBSCRIBE_TOKEN_ZH_HK`. The lifecycle snapshots login profiles before seed, restores the complete seed footprint and identities, and has no Preview/share-token fallback.
    - M4B: `M4B_IDENTITY_RESTORE_ALLOW_DESTRUCTIVE=M4B_TEST_IDENTITIES_ONLY`, canonical `M4B_ACCEPTANCE_AS_OF`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M4B_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M4B_TEST_DB_HOST` mapped to the child, the shared test-only Neon Auth trio, and exact `M4B_TEST_STAFF_EMAIL`/`M4B_TEST_STAFF_PASSWORD` plus `M4B_TEST_MEMBER_EMAIL`/`M4B_TEST_MEMBER_PASSWORD`. The bilingual suite read-only-preflights exact existing M4B outputs and restores both full profiles; it never seeds or runs agents.
    - M4C: non-production `PLAYWRIGHT_BASE_URL` and `VERCEL_SHARE_TOKEN` when required; it is read-only and must continue to assert the private canary is absent.
    - M5: `M5_ACCEPTANCE_ALLOW_DESTRUCTIVE=M5_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M5_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M5_TEST_DB_HOST` mapped to the child, the shared test-only Neon Auth trio, exact `M5_TEST_MANAGER_EMAIL`/`M5_TEST_MANAGER_PASSWORD`, `M5_TEST_MEMBER_EMAIL`/`M5_TEST_MEMBER_PASSWORD`, `M5_TEST_STAFF_EMAIL`/`M5_TEST_STAFF_PASSWORD`, `M5_TEST_COMPANY_ID`, and `M5_TEST_LISTING_ID`. It restores three full profiles and the prior-present/prior-absent listing row.
    - M6: `M6_ACCEPTANCE_ALLOW_DESTRUCTIVE=M6_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M6_E2E_ALLOWED_ORIGIN`, `M6_ACCEPTANCE_SEED=true`, fixed canonical `M6_ACCEPTANCE_AS_OF`, `DATABASE_URL_TEST` mapped to child `DATABASE_URL`, `NEON_PROJECT_ID`, exact `M6_TEST_NEON_PROJECT_ID`, `M6_TEST_NEON_BRANCH_ID`, `M6_TEST_NEON_ENDPOINT_ID`, `M6_TEST_NEON_HOST`, project-scoped `M6_TEST_NEON_API_KEY`, the shared test-only Neon Auth trio, exact `M6_TEST_MEMBER_EMAIL`/`M6_TEST_MEMBER_PASSWORD`, `M6_TEST_STAFF_EMAIL`/`M6_TEST_STAFF_PASSWORD`, `M6_TEST_MEMBER_COMPANY_DISPLAY_NAME`, and `M6_TEST_GRADUATE_COMPANY_DISPLAY_NAME`. The parent performs bounded GET-only Neon project/branch/endpoint verification before Pool; the API key and all test-source names are scrubbed from the child. Any nonempty sentinel disables reuse; lifecycle restores seed rows, member application, audits, Showcase state, sessions, and identities.
    - M7: `M7_ACCEPTANCE_ALLOW_DESTRUCTIVE=M7_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M7_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `M7_TEST_NEON_PROJECT_ID`/`M7_TEST_NEON_HOST`, the shared test-only Neon Auth trio, and exact `M7_TEST_ADMIN_EMAIL`/`M7_TEST_ADMIN_PASSWORD`. It restores the Admin profile as well as CMS data/audits.
    - Authenticated Axe: `PR6_AUTHENTICATED_AXE_ALLOW_DESTRUCTIVE=PR6_ISOLATED_IDENTITIES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`PR6_AXE_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `PR6_AXE_TEST_NEON_PROJECT_ID`/`PR6_AXE_TEST_DB_HOST`, the shared test-only Neon Auth trio, and exactly `M2_TEST_MEMBER_EMAIL`/`M2_TEST_MEMBER_PASSWORD`, `M2_TEST_STAFF_EMAIL`/`M2_TEST_STAFF_PASSWORD`, `M3_TEST_STAFF_EMAIL`/`M3_TEST_STAFF_PASSWORD`, and `M7_TEST_ADMIN_EMAIL`/`M7_TEST_ADMIN_PASSWORD`. Those four normalized email/auth/profile identities must be pairwise distinct; the suite mutates only login timestamps and restores every full profile.

    Each managed guard requires canonical origins, two explicit replacement process environments verified by actual child probes, independent non-production resource identity, exact test-only Next-child mappings, a fixed validated operational allowlist, and registered session revocation/no disk auth artifacts. M1 handles recoverable provider/webhook/database/profile cleanup; M2 pre-reset baseline plus deterministic reset and quiescent three-profile restoration; M3 pre-seed login snapshots, complete seed-footprint restoration, test-only unsubscribe verification, and identity restoration; M4B exact read-only fixture preflight plus bilingual two-profile restoration; M5 manager/member/staff listing plus identity restoration; M6 provider-verified non-default/unprotected Neon project/branch/endpoint plus fixed-pair/all-Showcase/audit/identity reset; M7 full-Privacy-namespace Page Copy/News/Media/audit/Admin-profile restoration; and authenticated Axe four-identity restoration. Any ambiguity, cleanup, snapshot, drift, audit ownership, identity quiet-window, seat residue, or public-baseline failure fails. M1/M2/M3/M4B/M5/M6/M7/Axe are managed loopback only; M4C is separately guarded read-only Preview. No external/provider/database mutation occurs without separate named approval.

    Before M4B or M5, their managed source/unit lifecycle contracts must pass; those E2E files call their lifecycle themselves, so each separate command restores all profiles and M5 data before exit. The final authenticated Axe suite owns its own managed sentinel and restore lifecycle. Do not run a bare authenticated command outside these wrappers.

    Under the separate Task 4 database-mutation approval and exact `PR6_WEBHOOK_POSTGRES_ALLOW_DESTRUCTIVE=PR6_ISOLATED_WEBHOOK_FIXTURES_ONLY` guard, first run the real PostgreSQL projection contract separately:

    npm.cmd test -- tests/integration/webhook-join-projection-postgres.test.ts

    Expected without its exact isolated Neon/TLS host/project variables and approval: skip and `NOT PASSED`. With the complete guard: PASS with an unchanged canonical Startup-plan fingerprint, an exact run-owned profile/application/membership/attempt fixture graph, executable checkout `INNER JOIN`/two-row locking, observed concurrent blocking, event-time activation schedules, atomic membership/application/attempt/journey/audit/job commit, injected rollback, and zero run-owned residue. This result is recorded independently from M1 browser acceptance.

    With each suite's separate approval and complete variables, run each browser suite separately for attributable evidence:

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

    - M1 proves annual durable pricing, retrieval-only/exactly-once magic links, managed checkout, locally signed real-route webhook plus idempotent replay, activation/Billing Portal, distinct invitee capacity denial, registered-session revocation/anonymous verification, recoverable Session lineage, exact job/audit/journey cleanup, independent DB/provider cleanup, and quiet-window/CAS profile restoration.
    - M2 proves all 26 Admin pages across two locales and anonymous/member/company-admin identities, the exact route-specific negative authority/no-op contract for all 19 protected API handlers with an unchanged side-effect fingerprint, plus Member 360, notes, segments/CSV/campaign, at-risk, check-in, approvals, reports, audits, pre-reset three-profile baseline preservation, deterministic session revocation/no disk auth state, and deterministic reset/restore.
    - M3 proves managed-target seeded automation data, locally verified test-secret unsubscribe tokens, exactly one audited real-UI retry and sent/ineligible denial, isolated unsubscribe changes, complete pre-seed footprint restoration including prior absence, and full pre-seed staff/member identity restoration.
    - M4B proves the exact read-only M4B fixture and retention approvals plus inert Board draft preview in both English and Traditional Chinese, then restores both profiles; M4C proves bilingual privacy-safe AI-Ops without app-login identity mutation.
    - M5 proves one exact manager can save/submit, an ordinary member is read-only, and staff can reject the same pending listing with a required reason; it then restores the prior-present/prior-absent listing and all three profiles.
    - M6 proves provider-verified non-default/unprotected/non-production-labelled Neon project/branch/read-write endpoint identity before Pool, legal cohort transitions/stage audits and Showcase projection under deterministic managed reset, then restores exact seed rows, all fixed cohort/company pair identities, member application, database-clock-owned audit set, every graduation-company Showcase row, sessions, and both identities.
    - M7 proves bilingual News, approved Page Copy, and Media lifecycle/reference locks; Page Copy snapshots and drift-checks every catalog-derived Privacy tuple across both locales, owns the complete actual `{namespace, updated, cleared}` diff, and verifies every public baseline leaf after real-action restoration; News uses exact `{fields: [...]}` update-audit metadata, News/Media audits are independently deleted, the session is revoked, and the Admin identity is restored. Direct DB containment alone cannot pass.
    - Authenticated accessibility proves the exact 60-case matrix on its own managed target, revokes/proves anonymous/closes every registered session, and restores every distinct target-bound M2/M3/M7 profile.

    Missing separate authority, database, identities, test providers, allowlist, or cleanup capability means `NOT PASSED`. Do not seed, send, accept, mutate, or clean a live/Preview target without that separate approval.

- [ ] **Step 6: Run the exact authorized-Preview Lighthouse and field-performance gates**

    Use the fail-closed wrapper/config contracts implemented before Step 2. Before creating a run root or launching Chrome, `run-lighthouse-preview.mjs` requires the separately approved exact `LHCI_PREVIEW_DEPLOYMENT_ID`, canonical `LHCI_PREVIEW_DEPLOYMENT_URL`, `LHCI_VERCEL_PROJECT_ID`, optional exact `LHCI_VERCEL_TEAM_ID`, canonical JSON `LHCI_PRODUCTION_ORIGINS_JSON` from that same approval record, `LHCI_REVIEWED_HEAD`, `LHCI_REVIEWED_BRANCH=codex/wisetech-pr6-join-portal-admin`, parent-only scoped `LHCI_VERCEL_READ_TOKEN`, exact canonical `LHCI_CHROME_PATH`, lowercase 64-hex `LHCI_CHROME_SHA256`, and canonical nonempty `LHCI_CHROME_ALLOWED_ROOTS_JSON` from the same approval record. It performs one bounded, no-redirect authenticated `GET https://api.vercel.com/v13/deployments/{encodedDeploymentId}` with only the exact optional team query. Require HTTP 200 plus response `id === LHCI_PREVIEW_DEPLOYMENT_ID`, `projectId === LHCI_VERCEL_PROJECT_ID`, optional exact team/owner identity, `readyState === "READY"`, and `target === null`; the exact null target is the provider-returned standard Preview proof, while `"production"`, `"staging"`, any custom target, an omitted target, or any other value is `NOT PASSED`. Require Git metadata `githubCommitOrg: "YNWAforever"`, `githubCommitRepo: "wisetech"`, `githubCommitRef` equal to the reviewed branch, and `githubCommitSha` equal to the reviewed head; if legacy duplicate `githubOrg`/ `githubRepo` keys are present, they must agree exactly rather than substitute for the commit keys. Require `LHCI_PREVIEW_DEPLOYMENT_URL === "https://" + response.url`; this provider-returned deployment hostname, not any member of `alias`/`automaticAliases`, becomes the verified immutable base. Reject the canonical production origin `https://hkwtia.vercel.app` and every canonical origin in the nonempty approval-record denylist. Treat every `alias` and `automaticAliases` entry as a provider hostname, not an origin: require a canonical lowercase ASCII hostname with no scheme, credentials, port, path, query, fragment, wildcard, trailing dot, or Unicode ambiguity; convert it to exactly `https://<hostname>`; reject duplicate host/origin forms across both arrays; and compare those strict HTTPS origins to the generated origin and complete denylist. A production alias supplied as bare `hkwtia.vercel.app` must therefore fail. Malformed alias/denylist entries, missing or ambiguous metadata, redirects, non-GET attempts, and provider errors also fail. The read token, approval input, and raw provider response remain parent-only and are never written to disk or passed to LHCI/Chrome; only their validated non-secret projections and hashes enter the record. This is a read-only metadata proof under the separately authorized Preview gate; it never creates, promotes, aliases, or mutates a deployment.

    Only after provider proof, the wrapper validates the repository root and absolute local `@lhci/cli` entrypoint without a shell. It parses the approved Chrome-root array as unique canonical absolute directories, resolves `LHCI_CHROME_PATH` through `realpath`, and requires an absolute regular executable whose basename is exactly `chrome.exe` or `chromium.exe` on Windows, `Google Chrome` or `Chromium` on macOS, or `google-chrome`, `google-chrome-stable`, `chromium`, or `chromium-browser` on Linux; no symlink or Windows reparse-point ambiguity in any existing path component, strict descent under exactly one approved root, and an exact streaming SHA-256 match to `LHCI_CHROME_SHA256`. Capture the canonical file identity/size/mtime tuple, then re-stat and re-hash immediately before both the version preflight and LHCI spawn; any replacement or drift fails closed, and a final post-run hash is recorded. A bounded `--version` preflight uses that exact executable, `shell: false`, the same replacement environment described below, and must return a recognizable Chrome/Chromium version before LHCI can run; discovery through ambient `PATH`, registry fallback, or an unapproved browser is forbidden.

    The wrapper generates one canonical lowercase UUID run ID, resolves `runRoot = path.join(os.tmpdir(), "wisetech-pr6-lhci-" + runId)`, and atomically creates that absent path with non-recursive semantics; `EEXIST`, a symlink/reparse component, or realpath mismatch fails. It creates canonical `<runRoot>/tmp` the same way before any executable launch. Build the version/LHCI child environment from an empty object, never `{...process.env}`, and reject any ASCII-case-folded duplicate across projected and operational keys: include exact-equal provider-verified `LHCI_BASE_URL`, `LHCI_ALLOWED_ORIGIN`, and `LHCI_VERIFIED_DEPLOYMENT_URL`; `LHCI_VERIFIED_DEPLOYMENT_ID`, `LHCI_VERIFIED_GIT_SHA`, and `LHCI_VERIFIED_GIT_BRANCH`; validated non-secret `LHCI_VERIFIED_PRODUCTION_ORIGINS_JSON`; `LHCI_RUN_ROOT`/`LHCI_OUTPUT_DIR=<runRoot>/upload`; and canonical `CHROME_PATH` plus exact-equal `LHCI_VERIFIED_CHROME_PATH`/`LHCI_VERIFIED_CHROME_SHA256`. Add only a platform-specific operational allowlist whose values are independently validated: on Windows, canonical existing `SystemRoot`/`WINDIR`, `LOCALAPPDATA`, `APPDATA`, and `USERPROFILE`, exact `TEMP=TMP=<runRoot>/tmp`, fixed `PATHEXT=.COM;.EXE;.BAT;.CMD`, and a rebuilt `PATH` containing only the canonical Node directory, Chrome directory, and `System32`; on POSIX, canonical existing `HOME`, exact `TMPDIR=<runRoot>/tmp`, validated `LANG` and optional `LC_ALL`/`XDG_RUNTIME_DIR`, and a rebuilt `PATH` containing only the canonical Node/Chrome directories plus fixed `/usr/bin` and `/bin`. Never copy ambient `PATH` or temp path, proxy variables, `NODE_OPTIONS`, dynamic-loader variables, database/provider/Auth credentials, Vercel token, raw provider response, approval-source variables, or self-asserted Preview flags. With that exact environment built, re-stat/re-hash the approved Chrome and run its bounded no-shell `--version` preflight; re-stat/re-hash it again, then spawn `process.execPath` with the absolute repository-local `@lhci/cli` entrypoint and arguments `autorun --config <absolute repository lighthouserc.cjs>` under `shell: false`, with `cwd=runRoot`. Re-hash Chrome after LHCI exits and fail on drift. Because the child's temp variables are run-owned, the chrome-launcher user-data/profile directory and other child temp artifacts also remain beneath `<runRoot>/tmp`. LHCI's mandatory `.lighthouseci` collect/assert working directory and filesystem upload directory therefore both live inside one unique run-owned OS-temp root, never the repository. The wrapper rejects missing operational prerequisites, path/hash/version mismatch, an existing root, a nonlocal CLI/config, shell execution, or an output path outside the exact root; it propagates the native exit code and prints only sanitized deployment ID/SHA/run-root/browser-version evidence. It retains that unique directory on success or failure for the verification record and never deletes or reuses another run's evidence.

    `lighthouserc.cjs` requires canonical HTTPS `LHCI_BASE_URL`, `LHCI_ALLOWED_ORIGIN`, and wrapper-owned `LHCI_VERIFIED_DEPLOYMENT_URL` to be exact-equal; requires exact nonempty `LHCI_VERIFIED_DEPLOYMENT_ID`, `LHCI_VERIFIED_GIT_SHA`, and `LHCI_VERIFIED_GIT_BRANCH=codex/wisetech-pr6-join-portal-admin`; requires canonical absolute `CHROME_PATH === LHCI_VERIFIED_CHROME_PATH` plus lowercase 64-hex `LHCI_VERIFIED_CHROME_SHA256`; and parses the wrapper-validated `LHCI_VERIFIED_PRODUCTION_ORIGINS_JSON`. It rejects localhost, `https://hkwtia.vercel.app`, every verified production origin, and any base/route origin mismatch, and never trusts `VERCEL_ENV`, `LHCI_PREVIEW_ONLY`, `LHCI_PREVIEW_DEPLOYMENT_URL`, or `PLAYWRIGHT_BASE_URL`. It also requires canonical absolute `LHCI_RUN_ROOT`/`LHCI_OUTPUT_DIR`, proves the latter equals `<runRoot>/upload`, sets `upload.target = "filesystem"` and exact `upload.outputDir`, and contains no `collect.startServerCommand`, `startServerReadyPattern`, `startServerReadyTimeout`, or `staticDistDir`. Collect exactly `/membership`, `/zh/membership`, `/join?plan=startup&interval=annual`, and `/zh/join?plan=startup&interval=annual` for three runs against that provider-verified immutable Preview. Never include noindex `/member-login` or authenticated routes. Assert performance at least 0.90, accessibility at least 0.95, SEO at least 0.95, `largest-contentful-paint` at most 2,500 ms, and `cumulative-layout-shift` at most 0.1. Never use temporary public storage.

    `lighthouse-runner.test.ts` uses injected fetch/filesystem/hash/spawn/UUID seams to prove guard-before-network, GET-only exact Vercel path/team query, timeout/no-redirect behavior, exact deployment/project/team/READY/`target === null`/generated-URL/Git-commit-org/repo/SHA/ref binding, agreement of any duplicate legacy org/repo keys, canonical approval-record production-origin parsing/rejection, strict hostname-to-HTTPS normalization for `alias`/`automaticAliases`, cross-array duplicate rejection, bare-host production-alias denial, parent-only token/raw-response handling, unique absent OS-temp ownership, and local no-shell CLI/config invocation. It also covers canonical Chrome-root/path descent, regular-file/name/hash/version checks, fixed platform allowlists, rebuilt `PATH`, run-owned temp/profile confinement, exact `CHROME_PATH` projection, executable revalidation before each launch and after exit, exit propagation, retention on failure, and rejection of missing/non-null/custom targets, aliases, metadata ambiguity, symlink/reparse/hash/version/path failures, a preexisting/outside-worktree-or-temp mismatch, or any attempted provider mutation without touching the real network/filesystem or launching Chrome. `lighthouse-process-boundary.test.ts` contaminates a parent environment, spawns the real Node probe with the constructed replacement child environment, and asserts its complete case-folded key/value set: every verified non-secret marker and required platform key is present, while every Vercel approval/token, database/provider/Auth secret, proxy, `NODE_OPTIONS`, dynamic-loader key, ambient `PATH` entry, and arbitrary variable is absent. `lighthouse-config.test.ts` imports the real config under synthetic wrapper-verified URL/browser markers and proves exact verified-URL/origin/denylist/Chrome equality, route equality, guard-before-collect behavior, thresholds, run count, explicit filesystem `outputDir`, no self-asserted Preview or parent approval variable, no local server/autodiscovery fields, no local/private/production/noindex routes, and no public upload. `run-lighthouse-preview.d.mts` declares the exact collection, execution-manifest, and post-commit verification APIs and is checked against the runtime value-export-name set. `lighthouserc.d.cts` gives the real CommonJS config one exact readonly LHCI-config shape; the TS config test imports through that sibling declaration and rejects declaration/runtime shape drift. `lighthouse-config-loader.test.ts` invokes the locked LHCI 0.15.1 CommonJS loader through the real probe and requires the same shape. None of these tests copies implementation logic.

    Immediately before any authorized collection, the wrapper builds a canonical execution manifest over the exact bytes of `scripts/run-lighthouse-preview.mjs`, its `.d.mts`, `lighthouserc.cjs`, `lighthouserc.d.cts`, `package.json`, `package-lock.json`, both Lighthouse probe files, and all four Lighthouse unit-test files. Record ordered repository-relative paths, byte lengths, raw SHA-256 values, and Git-blob IDs computed from the working bytes; also record the exact Node version plus the resolved local `@lhci/cli` entrypoint/package version/entrypoint SHA-256. Re-read and re-hash every item after LHCI exits; any drift fails the run. Write only this non-secret canonical manifest and its aggregate SHA-256 under `<runRoot>`, and copy the values into the verification record. Unit tests change each file/CLI seam between pre/post reads and require failure.

    Run:

    node scripts/run-credential-free-verification.mjs unit -- tests/unit/lighthouse-process-boundary.test.ts tests/unit/lighthouse-runner.test.ts tests/unit/lighthouse-config.test.ts tests/unit/lighthouse-config-loader.test.ts
    npm.cmd run test:lighthouse

    Expected: the runner/config contracts, exact read-only Vercel deployment metadata proof, and authorized immutable-Preview collection PASS for the exact four public URLs. Require the verification record to bind deployment ID, generated URL, project ID, reviewed SHA/branch, READY/Preview target, provider response hash with token removed, normalized alias-origin set, production-origin denylist, canonical Chrome realpath, approved-root fingerprint, executable SHA-256/version, the exact platform operational-key set, the run-owned temp/profile-root fingerprint, and the complete pre/post Lighthouse execution-manifest aggregate hash. Require `<runRoot>/.lighthouseci` and `<runRoot>/upload/manifest.json` to be the only LHCI roots, require the manifest URLs/runs to match the exact allowlist, hash the retained manifest/reports into the verification record, and verify `git status --short` is unchanged because no artifact is inside the worktree. Record LCP at most 2.5 seconds and CLS at most 0.1 from those run-owned artifacts. Record INP at most 200 ms at p75 only from separately authorized field/Preview telemetry; if that evidence is absent, older than the reviewed deployment, bound to another origin, or above 200 ms, the INP/performance external gate is `NOT PASSED`. Retain and report the exact unique OS-temp run root as local external evidence; never stage, overwrite, reuse, or claim cleanup of it.

- [ ] **Step 7: Write the verification record and prove the committed range**

    In `docs/integration/wisetech-pr6-verification.md` record:

    - immutable PR5 base and the reviewed implementation head that existed before Task 12 evidence authoring; the final PR6 commit SHA is intentionally captured after commit in the external immutable review package, not self-referenced inside this commit;
    - every command, timestamp, exit code, totals, warnings, skips, exact blocker, and separate operator-approval reference when an isolated suite ran;
    - RED and GREEN evidence for Tasks 1-11, plus Task 12 aggregate verification without fabricated RED;
    - independent per-task review result;
    - credential-free versus isolated-authenticated evidence, plus an inventory of every excluded legacy real-PostgreSQL integration gate and its separate-approval status;
    - the Lighthouse pre/post execution-manifest aggregate hash, every candidate committed-file blob/SHA-256 entry, and local LHCI version/entrypoint hash; mark final-commit binding as pending because this document cannot self-reference its own commit, then record the Step 8 binding result only in the external immutable review package;
    - external gates as `PASSED` or `NOT PASSED` with no implied acceptance;
    - confirmation of no schema migration, production seed/import, provider configuration, or production action;
    - exact disposable cleanup evidence for every authorized suite: M1 provider/webhook/session/profile ledgers and named immutable evidence; M2 pre-reset identity baseline, session revocation, data reset, and three-profile quiescence; M3 complete seed-predicate ledger plus session/identity restoration; M4B bilingual/session/two-profile restoration; M5 listing/session/three-profile restoration; M6 GET-only provider metadata proof plus pair/application/audit/all-Showcase/session/identity reset; M7 full-namespace Page Copy/News/Media/audit/session/Admin-profile restoration; authenticated-Axe all-session/all-profile restoration; the separately gated real-PostgreSQL webhook plan fingerprint, run-owned profile graph, projection/rollback, and zero-residue result; and the exact managed runner/Next/browser environment fingerprints plus retained outside-worktree Lighthouse run root, manifest hashes, Chrome path/hash/version, and Lighthouse child-environment allowlist fingerprint;
    - source-only rollback: revert PR6 commits to PR5 head.
    Before staging, run `git diff --check` for unstaged Task 12 edits; prove the exact managed suites expose no disk auth-state/trace path, the legacy `test-results/m2-auth` path is absent, the reported Lighthouse run root is outside the worktree, and no generated result, credential, environment, or Lighthouse file is selected. Do not claim a clean worktree or final head yet; both become meaningful only after the Task 12 commit.

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

    git diff --check

    Expected: no whitespace errors in the uncommitted Task 12 slice. Final range/name/status checks occur only after the commit below.

- [ ] **Step 8: Stage every Task 12 path, commit, then prove the immutable final range**

    git add -- ':(literal)tests/e2e/wisetech-pr6-internal-journeys.spec.ts' ':(literal)tests/fixtures/m5-browser-lifecycle.ts' ':(literal)tests/unit/m5-browser-lifecycle.test.ts' ':(literal)tests/fixtures/pr6-authenticated-accessibility-lifecycle.ts' ':(literal)tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts' ':(literal)tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts' ':(literal)tests/fixtures/m4b-e2e-safety.ts' ':(literal)tests/unit/m4b-e2e-safety.test.ts' ':(literal)tests/e2e/m4b-agents.spec.ts' ':(literal)tests/e2e/m5-showcase.spec.ts' ':(literal)package.json' ':(literal)scripts/run-credential-free-verification.mjs' ':(literal)tests/unit/credential-free-verification-boundary.test.ts' ':(literal)scripts/run-lighthouse-preview.mjs' ':(literal)scripts/run-lighthouse-preview.d.mts' ':(literal)tests/fixtures/lighthouse-process-env-probe.mjs' ':(literal)tests/fixtures/lighthouse-config-loader-probe.cjs' ':(literal)tests/unit/lighthouse-process-boundary.test.ts' ':(literal)tests/unit/lighthouse-runner.test.ts' ':(literal)tests/unit/lighthouse-config.test.ts' ':(literal)tests/unit/lighthouse-config-loader.test.ts' ':(literal)lighthouserc.js' ':(literal)lighthouserc.cjs' ':(literal)lighthouserc.d.cts' ':(literal)docs/integration/wisetech-pr6-verification.md' ':(literal)docs/integration/wisetech-pr6-pr-body.md'
    git diff --cached --name-status
    git diff --cached --check

    Expected: exactly the literal Task 12 paths above, including the staged `lighthouserc.js` deletion plus new `lighthouserc.cjs`/`lighthouserc.d.cts` before the cached checks and commit, with no whitespace errors.
    git commit -m "test: verify PR6 internal journeys"
    $finalHead = git rev-parse HEAD
    git diff --name-status 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...$finalHead
    git log --oneline 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae..$finalHead
    git diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...$finalHead
    git status --short
    $lighthouseGateStatus = (Read-Host "Enter exact Lighthouse gate status: PASSED or NOT_PASSED").Trim()
    if ($lighthouseGateStatus -ceq "PASSED") {
      $lighthouseRunRoot = (Read-Host "Paste the exact retained Lighthouse run root from the verification record").Trim()
      node scripts/run-lighthouse-preview.mjs verify-commit --run-root "$lighthouseRunRoot" --head "$finalHead"
      if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_COMMIT_BINDING_FAILED" }
    } elseif ($lighthouseGateStatus -cne "NOT_PASSED") {
      throw "PR6_LIGHTHOUSE_GATE_STATUS_INVALID"
    }

    Expected: approved PR6 files only, cohesive commits, no range whitespace errors, and a clean worktree. When the authorized Lighthouse gate is recorded as `PASSED`, `verify-commit` must re-resolve the same local LHCI entrypoint/version/hash and prove every final-commit blob/byte SHA-256 equals the retained pre/post execution manifest; a mismatch requires rerunning the collection and evidence. If Lighthouse was not separately authorized, do not invent a run root: record this binding and the external performance gate as `NOT PASSED`. Preserve `$finalHead` in the immutable review package and publication checks; do not amend the committed verification document merely to self-record its own SHA.

- [ ] **Step 9: Complete independent review and publish the stacked draft PR**

    Generate the final immutable review package from PR5 head to the committed PR6 head. A fresh reviewer must inspect the approved spec, this plan, the complete diff, focused RED/GREEN evidence, full verification record, authorization/import boundaries, and rollback statement. Resolve findings and repeat review until the result is zero Critical, zero Important, and zero Minor.

    The zero-finding verdict must print the exact 40-character reviewed commit SHA. In one publication PowerShell session, obtain `$reviewedHead` from that verdict—not from current `HEAD`—and define all immutable names:

    $reviewedHead = (Read-Host "Paste the exact SHA printed by the zero-finding PR6 review").Trim()
    if ($reviewedHead -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_REVIEWED_HEAD_INVALID" }
    $expectedOwner = "YNWAforever"
    $expectedBranch = "codex/wisetech-pr6-join-portal-admin"
    $expectedBaseBranch = "codex/wisetech-pr5-public-journeys"
    $expectedBase = "3856dd71842f9a2e1d9c4b7a46521416a5bd83ae"
    $expectedRepo = "YNWAforever/wisetech"
    $expectedRepoUrl = "https://github.com/YNWAforever/wisetech"
    $expectedGitRemote = "https://github.com/YNWAforever/wisetech.git"
    $remoteHeadRef = "refs/heads/$expectedBranch"
    $bodyPath = "docs/integration/wisetech-pr6-pr-body.md"
    & git cat-file -e "$reviewedHead^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "PR6_REVIEWED_HEAD_MISSING" }

    Refuse every visible Git `url.*` configuration section before any remote lookup or mutation, covering both fetch and push rewrite forms without depending on a narrower key suffix. Independently bind the GitHub CLI repository identity; the local `origin` is intentionally never read or used because this checkout may belong to another repository:

    $urlRewriteLines = @(& git config --show-origin --get-regexp "^url\.")
    $urlRewriteExit = $LASTEXITCODE
    if ($urlRewriteExit -ne 0 -and $urlRewriteExit -ne 1) { throw "PR6_GIT_URL_REWRITE_CHECK_FAILED" }
    if ($urlRewriteLines.Count -ne 0) { throw "PR6_GIT_URL_REWRITE_PRESENT" }

    $repoJsonLines = @(& gh repo view $expectedRepo --json nameWithOwner,url)
    if ($LASTEXITCODE -ne 0) { throw "PR6_GITHUB_REPOSITORY_LOOKUP_FAILED" }
    try {
      $repository = (($repoJsonLines -join "`n") | ConvertFrom-Json)
    } catch {
      throw "PR6_GITHUB_REPOSITORY_JSON_INVALID"
    }
    if ($repository.nameWithOwner -cne $expectedRepo -or $repository.url -cne $expectedRepoUrl) {
      throw "PR6_GITHUB_REPOSITORY_IDENTITY_MISMATCH"
    }

    Define fail-closed helpers. They validate native-command exit codes, exact branch, every tracked/untracked status entry, detached-HEAD/ref drift, unambiguous remote refs, and exact repository-owner/head PR identity:

    function Assert-Pr6LocalState([string] $phase) {
      $branchLines = @(& git branch --show-current)
      if ($LASTEXITCODE -ne 0) { throw "PR6_BRANCH_LOOKUP_FAILED:$phase" }
      $branch = ($branchLines -join "`n").Trim()
      if ($branch -cne $expectedBranch) { throw "PR6_BRANCH_MISMATCH:$phase" }

      $statusLines = @(& git status --porcelain=v1 --untracked-files=all)
      if ($LASTEXITCODE -ne 0) { throw "PR6_STATUS_LOOKUP_FAILED:$phase" }
      if ($statusLines.Count -ne 0) { throw "PR6_WORKTREE_NOT_CLEAN:$phase" }

      $headLines = @(& git rev-parse HEAD)
      if ($LASTEXITCODE -ne 0) { throw "PR6_HEAD_LOOKUP_FAILED:$phase" }
      $head = ($headLines -join "`n").Trim()
      $branchHeadLines = @(& git rev-parse "refs/heads/$expectedBranch")
      if ($LASTEXITCODE -ne 0) { throw "PR6_BRANCH_REF_LOOKUP_FAILED:$phase" }
      $branchHead = ($branchHeadLines -join "`n").Trim()
      if ($head -cne $reviewedHead -or $branchHead -cne $reviewedHead) {
        throw "PR6_LOCAL_REVIEW_BINDING_FAILED:$phase"
      }
    }

    function Get-Pr6OptionalRemoteOid([string] $ref, [string] $errorCode) {
      $remoteLines = @(& git ls-remote $expectedGitRemote $ref)
      if ($LASTEXITCODE -ne 0) { throw $errorCode }
      if ($remoteLines.Count -eq 0) { return $null }
      if ($remoteLines.Count -ne 1) { throw $errorCode }
      $fields = @($remoteLines[0] -split "\s+")
      if ($fields.Count -lt 2 -or $fields[0] -cnotmatch "^[0-9a-f]{40}$" -or $fields[1] -cne $ref) {
        throw $errorCode
      }
      return $fields[0]
    }

    function Get-Pr6RemoteOid([string] $ref, [string] $errorCode) {
      $oid = Get-Pr6OptionalRemoteOid $ref $errorCode
      if ($null -eq $oid) { throw $errorCode }
      return $oid
    }

    function Assert-Pr6RemoteBase([string] $phase) {
      $remoteBase = Get-Pr6RemoteOid "refs/heads/$expectedBaseBranch" "PR6_REMOTE_BASE_LOOKUP_FAILED:$phase"
      if ($remoteBase -cne $expectedBase) { throw "PR6_REMOTE_BASE_DRIFT:$phase" }
    }

    function Get-Pr6OpenHeadPrs([string] $phase) {
      $listLines = @(& gh pr list --repo $expectedRepo --state open --head $expectedBranch --limit 1000 --json number,url,headRefName,headRepositoryOwner)
      if ($LASTEXITCODE -ne 0) { throw "PR6_PR_DISCOVERY_FAILED:$phase" }
      try {
        $parsed = (($listLines -join "`n") | ConvertFrom-Json)
      } catch {
        throw "PR6_PR_DISCOVERY_JSON_INVALID:$phase"
      }
      $exact = @(@($parsed) | Where-Object {
        $_.headRefName -ceq $expectedBranch -and
        $_.headRepositoryOwner.login -ceq $expectedOwner
      })
      return @($exact)
    }

    Assert-Pr6LocalState "pre-body"
    Assert-Pr6RemoteBase "pre-body"
    $openHeadPrs = @(Get-Pr6OpenHeadPrs "pre-body")
    if ($openHeadPrs.Count -ne 0) { throw "PR6_PREEXISTING_OPEN_HEAD_PR:pre-body" }

    Source the PR body only from the reviewed commit blob. Never read the mutable working-tree file for publication or verification:

    $bodySpec = "${reviewedHead}:$bodyPath"
    $bodyLines = @(& git show --no-ext-diff --no-textconv $bodySpec)
    if ($LASTEXITCODE -ne 0) { throw "PR6_REVIEWED_BODY_READ_FAILED" }
    $expectedBody = (($bodyLines -join "`n") -replace "`r`n", "`n").TrimEnd("`r", "`n")
    if ([string]::IsNullOrWhiteSpace($expectedBody)) { throw "PR6_REVIEWED_BODY_EMPTY" }

    Immediately before any push, repeat local/base/open-PR checks and inspect the exact remote head ref. A different remote SHA fails without mutation. If the ref is absent, create it with an empty-expectation lease; `--force-with-lease=<ref>:` is used only as an atomic create-if-absent compare-and-set and can never overwrite an existing ref. If the ref already equals the reviewed SHA, perform no push:

    Assert-Pr6LocalState "pre-push"
    Assert-Pr6RemoteBase "pre-push"
    $openHeadPrs = @(Get-Pr6OpenHeadPrs "pre-push")
    if ($openHeadPrs.Count -ne 0) { throw "PR6_PREEXISTING_OPEN_HEAD_PR:pre-push" }
    $remoteHeadBefore = Get-Pr6OptionalRemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:pre-push"
    if ($null -ne $remoteHeadBefore -and $remoteHeadBefore -cne $reviewedHead) {
      throw "PR6_REMOTE_HEAD_DRIFT:pre-push"
    }
    if ($null -eq $remoteHeadBefore) {
      $createOnlyLease = "--force-with-lease=${remoteHeadRef}:"
      $pushRefspec = "${reviewedHead}:$remoteHeadRef"
      & git push $createOnlyLease $expectedGitRemote $pushRefspec
      if ($LASTEXITCODE -ne 0) { throw "PR6_CREATE_ONLY_PUSH_FAILED" }
    }

    $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:post-push"
    if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:post-push" }

    Immediately before PR creation, reassert the exact local branch/clean/ref state, immutable remote base, pushed remote head, and absence of an existing exact-owner/head open PR. No command that can create a commit, update a branch, or edit a file may intervene:

    Assert-Pr6LocalState "pre-create"
    Assert-Pr6RemoteBase "pre-create"
    $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:pre-create"
    if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:pre-create" }
    $preExistingPrs = @(Get-Pr6OpenHeadPrs "pre-create")
    if ($preExistingPrs.Count -ne 0) { throw "PR6_PREEXISTING_OPEN_HEAD_PR:pre-create" }

    Create the stacked draft with the reviewed-blob body. Only a zero native exit plus exactly one exact repository URL/number emitted by that `gh pr create` invocation may establish the automatic-close identity. Independently discover the exact owner/head candidate for validation, but never use discovery alone as a close target; an absent/ambiguous stdout identity or any nonzero/uncertain create exit fails for manual inspection without closing or otherwise mutating a discovered PR:

    $createOutput = @(& gh pr create --repo $expectedRepo --draft --base $expectedBaseBranch --head $expectedBranch --title "feat: align WiseTech Join Portal and Admin" --body $expectedBody)
    $createExit = $LASTEXITCODE

    $stdoutIdentities = @()
    foreach ($line in $createOutput) {
      $stdoutMatch = [regex]::Match(([string]$line).Trim(), "^https://github\.com/YNWAforever/wisetech/pull/([1-9][0-9]*)$")
      if ($stdoutMatch.Success) {
        $stdoutIdentities += [pscustomobject]@{
          number = $stdoutMatch.Groups[1].Value
          url = $stdoutMatch.Value
        }
      }
    }

    $postCreateCandidates = @()
    $discoveryFailure = $null
    try {
      $postCreateCandidates = @(Get-Pr6OpenHeadPrs "post-create-discovery")
    } catch {
      $discoveryFailure = $_
    }

    if ($createExit -ne 0 -or $stdoutIdentities.Count -ne 1) {
      throw "PR6_CREATED_PR_HAS_NO_SAFE_CLOSE_TARGET:STDOUT_$($stdoutIdentities.Count):CREATE_EXIT_$createExit"
    }
    $createdPrNumber = [string]$stdoutIdentities[0].number
    $prUrl = [string]$stdoutIdentities[0].url

    Validate the exact stdout-captured draft in a guarded block. If independent discovery or any local/remote/base/head/body/OID/state check fails after that successful-create capture, close only that exact emitted draft PR, retain the reviewed remote branch for diagnosis, verify closure, and rethrow:

    try {
      if ($createExit -ne 0) { throw "PR6_PR_CREATE_FAILED_AFTER_CAPTURE:$createExit" }
      if ($null -ne $discoveryFailure) { throw $discoveryFailure }
      if ($postCreateCandidates.Count -ne 1 -or [string]($postCreateCandidates[0].number) -cne $createdPrNumber) {
        throw "PR6_CREATED_PR_DISCOVERY_MISMATCH"
      }

      Assert-Pr6LocalState "post-create"
      Assert-Pr6RemoteBase "post-create"
      $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:post-create"
      if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:post-create" }

      $viewJsonLines = @(& gh pr view $createdPrNumber --repo $expectedRepo --json url,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,headRepositoryOwner,body,mergeStateStatus,statusCheckRollup)
      if ($LASTEXITCODE -ne 0) { throw "PR6_PR_VIEW_FAILED" }
      try {
        $published = (($viewJsonLines -join "`n") | ConvertFrom-Json)
      } catch {
        throw "PR6_PR_VIEW_JSON_INVALID"
      }
      $publishedBody = (($published.body -replace "`r`n", "`n")).TrimEnd("`r", "`n")
      if ($published.url -cne $prUrl) { throw "PR6_PR_URL_MISMATCH" }
      if ($published.state -cne "OPEN") { throw "PR6_PR_NOT_OPEN" }
      if ($published.isDraft -ne $true) { throw "PR6_PR_NOT_DRAFT" }
      if ($publishedBody -cne $expectedBody) { throw "PR6_PR_BODY_MISMATCH" }
      if ($published.baseRefName -cne $expectedBaseBranch -or $published.baseRefOid -cne $expectedBase) {
        throw "PR6_PR_BASE_MISMATCH"
      }
      if ($published.headRefName -cne $expectedBranch -or $published.headRepositoryOwner.login -cne $expectedOwner -or $published.headRefOid -cne $reviewedHead) {
        throw "PR6_PR_HEAD_MISMATCH"
      }

      Assert-Pr6LocalState "post-validate"
      Assert-Pr6RemoteBase "post-validate"
      $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:post-validate"
      if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:post-validate" }
      $finalCandidates = @(Get-Pr6OpenHeadPrs "post-validate")
      if ($finalCandidates.Count -ne 1 -or [string]($finalCandidates[0].number) -cne $createdPrNumber) {
        throw "PR6_OPEN_HEAD_PR_SET_CHANGED"
      }
    } catch {
      $validationFailure = $_
      $closeOutput = @(& gh pr close $createdPrNumber --repo $expectedRepo --comment "Closed automatically: immutable PR6 post-create verification failed; inspect the publication log before retrying.")
      $closeExit = $LASTEXITCODE
      if ($closeExit -ne 0) {
        throw "PR6_POST_CREATE_VALIDATION_FAILED_AND_DRAFT_CLOSE_FAILED:$createdPrNumber"
      }
      $closedJsonLines = @(& gh pr view $createdPrNumber --repo $expectedRepo --json state)
      if ($LASTEXITCODE -ne 0) {
        throw "PR6_POST_CREATE_VALIDATION_FAILED_AND_DRAFT_CLOSE_UNVERIFIED:$createdPrNumber"
      }
      try {
        $closed = (($closedJsonLines -join "`n") | ConvertFrom-Json)
      } catch {
        throw "PR6_POST_CREATE_VALIDATION_FAILED_AND_DRAFT_CLOSE_JSON_INVALID:$createdPrNumber"
      }
      if ($closed.state -cne "CLOSED") {
        throw "PR6_POST_CREATE_VALIDATION_FAILED_AND_DRAFT_NOT_CLOSED:$createdPrNumber"
      }
      throw $validationFailure
    }

    Expected: one OPEN draft PR at the captured URL with exact reviewed-commit body, base name/OID `codex/wisetech-pr5-public-journeys`/`3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`, and local branch ref/local HEAD/published head/remote head all exactly equal to `$reviewedHead` from the zero-finding verdict. Report pending/failing remote checks separately. Do not merge, deploy, mutate providers, or convert an external gate into PASS.

## Self-Review

- Spec coverage: Tasks 1-2 cover the one catalog authority, interval identity, typed Join context/outcomes, direct terminal navigation, durable membership precedence, explicit persistence, exhaustive handling of all seven membership statuses, and fresh row-locked application/journey completion when membership creation committed first, with personal applicant/owner equality and the existing active-company-member authorization intersection preserved. Task 3 covers the complete continuation allowlist, explicit noindex member login, one Neon magic-link path, member-only Portal entry, public navigation destinations, and sign-out behavior. Task 4 covers durable checkout pricing, atomic membership/application/attempt/journey webhook projection, webhook-authoritative completion, and localized Billing Portal return. Task 5 covers invitation callback/token identity, replay, expiry, revocation, and provider-free route tests.
- Presentation coverage: Task 6 creates the shared shell family, grouped eight-item Portal and 4/6/6 Admin navigation, active specificity, skip/main/mobile/focus/table/feedback behavior, and exact 6/10/26 route inventories. Tasks 7-8 align every Join/member-login and Portal route while preserving current owners and failing closed on ambiguous company context. Tasks 9-11 align every Admin CRM, CMS, and Operations page while retaining authorization, audits, publication/media locks, approvals, reports, automations, Showcase, and cohort transitions.
- Verification coverage: Task 12 includes exact credential-free and 60-case authenticated matrices, 26-page/19-API denial proof, replacement-environment unit/browser aggregates, and managed M1-M7/M4B/M5/Axe lifecycles. Actual Playwright-CLI, runner, locked-Next-loader, and browser-launch contracts prove canonical shell routing, absent dotenv candidates, telemetry opt-out, exact guarded Next mappings, and a capability-free browser environment. The separately gated real-PostgreSQL webhook contract binds fixtures and production repository SQL to one mock-before-import guarded Drizzle handle, proves deterministic lock blocking/failpoints/rollback, and closes every connection. It also covers real session revocation with no disk auth artifacts and complete identity/data restoration; M1 bounded timeout/immutable evidence; M2 pre-reset baseline/test-secret/quiescence safety; M3 pre-seed identity plus complete seed ledger; M4B exact read-only fixture preflight; M6 GET-only provider proof plus conflict-key/all-Showcase restoration; M7 full catalog-derived Privacy namespace/database-clock/audit-object ownership; and an exact four-route authorized-Preview Lighthouse CommonJS config with normalized aliases, a validated hash-bound Chrome executable, a platform allowlist verified through a real child probe, a unique outside-worktree run root, and a pre/post execution manifest re-bound to the final commit. Stage-before-commit ordering, post-commit immutable range proof, and publication remain bound to the exact zero-finding SHA, reviewed commit body, local/remote refs, captured PR identity, and automatic closure of a mismatched created draft.
- Type consistency: `BillingInterval`, `MembershipSelection`, `MembershipPriceIds`, and the exact `{plans.list, loadPriceIds}` `MembershipCatalogDependencies` boundary originate in Task 1 and all later catalog/Join/checkout signatures consume those names. `PreparedJoinSubmission` carries only terminal row identities or one server-resolved draft; `JoinTerminalDescriptor`, the exhaustive terminal mapper, and the row-locked transaction originate in Task 2 and are reused by Task 4's paid-webhook projection. No JavaScript timestamp is a concurrency token. `PortalContinuation` is defined once in Task 2 and consumed by Task 3. `JoinStateDependencies` is fully defined in Task 4. `InternalNavigationGroup` and shell primitive names originate in Task 6 and are used unchanged in Tasks 7-11. Every TypeScript import of a Task 4/12 `.mjs` or `.cjs` module resolves through its owned `.d.mts`/`.d.cts` declaration, while executable wrappers are subprocess-only.
- Placeholder scan: every task names exact files, interfaces, RED/GREEN or final commands, expected evidence, constraints, and staging. M1 names provider/Auth-session/webhook/profile ledgers; M2 exact 26/19 matrices plus pre-reset profile/no-artifact cleanup; M3 complete seed/unsubscribe/retry/audit/session/identity reset; M6 provider metadata plus full seed/application/audit/Showcase/session/identity restore; M7 full-namespace Page Copy and exact News/Media audit predicates plus real-action public restore and failing containment; Task 12 names external artifacts, managed identities/sessions, and executable commit/review/publication order. No implementation step delegates an unspecified safety or ownership decision.

## Execution Handoff

Execution mode is already approved: Subagent-Driven. After explicit approval of this implementation plan, dispatch one fresh implementer per numbered task. Require its focused RED/GREEN/refactor evidence and exact commit, generate an immutable base/head review package, obtain a fresh independent review with zero Critical, Important, and Minor findings, and only then advance to the next task.

Approval of this plan does not authorize provider calls, database migration/seed/import, Preview mutation, merge, deployment, or production action. Those remain separate gates.
