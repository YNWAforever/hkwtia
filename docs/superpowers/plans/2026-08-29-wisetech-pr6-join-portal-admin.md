# WiseTech PR6 Join, Portal and Admin Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Join, the member Portal, and staff Admin with the WiseTech internal application-shell system while preserving every existing hkwtia authority and closing the member-login, sign-out, billing-interval, onboarding-handoff, completion-state, and locale-return gaps.

**Architecture:** One server-only membership catalog reconciles persisted plan rows, canonical plan metadata, billing interval, and configured Stripe Price IDs. Join returns a discriminated, actor-scoped outcome; member authentication uses one typed Portal-continuation authority; checkout and completion derive state from the durable membership. Shared internal-shell primitives provide responsive navigation and presentation only, while existing Server Components, Server Actions, repositories, authorization, audit, lifecycle, seat, CMS, CRM, automation, and Concierge owners remain in place.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.8, React 19, next-intl 4, Neon Auth, Stripe, Drizzle ORM/Postgres, Zod, Radix Sheet/Dialog, Tailwind CSS, Vitest, Testing Library, Playwright, Axe, Lighthouse CI.

## Global Constraints

- Work from PR6 branch `codex/wisetech-pr6-join-portal-admin` at approved-spec commit `8c83969e9f2244dadf8f9c9e3bc4d4431320c94a`, stacked on PR5 head `3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`.
- Treat `https://github.com/YNWAforever/wisetech` at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, as presentation evidence only. Import no donor runtime, router, data, content, asset, authentication, or provider configuration.
- Add no schema, migration, seed/import, provider mutation, production session, deployment, merge, or production action.
- Preserve the existing Next.js App Router, next-intl locale mapping (`en` and `zh-HK` at `/zh`), Neon Auth adapter, Stripe signed/idempotent webhook authority, Server Actions, repository authorization, same-transaction audits, lifecycle rules, seat rules, CMS/CRM owners, automation controls, and Concierge runtime.
- Only Server Components, Server Actions, and `server-only` services may read repositories or provider configuration. Client Components receive localized labels, safe hrefs, presentation state, and sanitized action results.
- Billing interval is part of plan identity. Community and Patron use `none`. Startup and Corporate expose only `annual` in PR6. Reject `monthly` until a distinct approved Stripe mapping exists.
- Persist `billingInterval` explicitly on membership creation. Once a membership exists, its stored `planCode` and `billingInterval` override missing or conflicting query input.
- Keep `/portal/company/listing` canonical and reject `/portal/showcase`. Keep invitation acceptance at `/portal/company/seats/accept?token=opaque-token` and never copy the token into generic member-login continuation.
- Join, Portal, and Admin never import the public `SiteHeader`, announcement bar, mega menu, or public footer. The Portal continues to mount exactly one Concierge widget.
- Every behavior task starts with a focused failing test, records the exact RED cause, makes the smallest production change, records GREEN, refactors, and commits only its explicit paths.
- Every new English label/state has a Traditional Chinese peer. New controls are keyboard reachable, visibly focused, at least 44 px, reduced-motion safe, and do not rely on color alone.
- Each numbered task is implemented by one fresh implementer, receives an immutable base/head review package, and reaches zero Critical, Important, and Minor findings before the next task starts.
- Preserve unrelated work. Stage explicit paths only; never use `git add -A`.

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
- Create `tests/e2e/wisetech-pr6-internal-journeys.spec.ts` and `docs/integration/wisetech-pr6-verification.md`; extend existing focused suites without weakening M1-M7 gates.

---

### Task 1: Establish the authoritative billing-interval catalog and exact public actions

**Files:**

- Create: `lib/membership/catalog.ts`, `tests/unit/membership-catalog.test.ts`.
- Modify: `lib/membership/constants.ts`, `lib/membership/public-catalog.ts`, `app/[locale]/(public)/membership/page.tsx`, `components/marketing/tier-comparison.tsx`, `config/navigation.ts`.
- Modify tests: `tests/unit/membership-public-catalog.test.ts`, `tests/unit/membership-page-catalog.test.tsx`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`.

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
    export function reconcileMembershipOptions(input: Readonly<{
      rows: readonly PersistedMembershipPlan[];
      priceIds: Readonly<{startup: string; corporate: string}>;
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

    Update navigation expectations so `publicShellActions.join.href` is `/membership` while `memberPortalAction` remains `/portal` until Task 3.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx

    Expected: FAIL because the billing-interval domain and shared resolver do not exist, paid monthly is still advertised, catalog hrefs omit `interval`, and the generic Join shell action still targets bare `/join`.

- [ ] **Step 3: Implement the server-only resolver and display-safe formatter**

    Add the billing interval constants to `lib/membership/constants.ts` and implement `lib/membership/catalog.ts` with `import "server-only"`. The reconciliation order is `PLAN_CODES`. Each plan must have exactly one persisted row whose audience, billing behavior, seat allowance, active flag, and integer price fields match the canonical contract.

    Apply these exact option rules:

    - Community: `billingInterval: "none"`, `amountHkd: 0`, `stripePriceReference: null`, and both persisted price fields null or zero.
    - Patron: `billingInterval: "none"`, `amountHkd: null`, `stripePriceReference: null`, and no Join CTA from the public card.
    - Startup/Corporate: `billingInterval: "annual"` only; annual amount is a positive Postgres integer; configured ID is non-empty after trimming; a persisted reference is either null or exactly the configured ID; optional monthly amount is structurally valid but is not emitted.
    - Any unknown, duplicate, inactive, malformed, or mismatched row is unavailable. Never infer a monthly mapping from the annual ID.

    Make the default async resolver call `membershipPlansRepository.list()` and read only the two named price IDs on the server. Return `null` on an unavailable selection; do not catch repository errors into a valid option.

    Make `buildPublicMembershipCatalog` accept reconciled options rather than independently reconciling rows. Format amounts by locale and omit `stripePriceReference`. Set exact CTAs:

    const joinHref = {
      community: "/join?plan=community&interval=none",
      startup: "/join?plan=startup&interval=annual",
      corporate: "/join?plan=corporate&interval=annual",
    } as const;

    Keep Patron at `/contact`. Render only the emitted annual paid option in `TierComparison`. Change `publicShellActions.join.href` to `/membership`.

- [ ] **Step 4: Run GREEN, perform the secret-serialization check, and refactor**

    Run:

    npm.cmd test -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx

    Expected: PASS. Public markup contains exact plan/interval hrefs, no monthly label for paid tiers, and no configured Stripe identifier.

    Run:

    rg -n "STRIPE_(SECRET|STARTUP_PRICE_ID|CORPORATE_PRICE_ID)|stripePriceReference" app components

    Expected: no new client or rendered-page secret/reference access. Server page imports only the server-only catalog loader/formatter.

- [ ] **Step 5: Commit the catalog slice**

    git add lib/membership/constants.ts lib/membership/catalog.ts lib/membership/public-catalog.ts app/[locale]/(public)/membership/page.tsx components/marketing/tier-comparison.tsx config/navigation.ts tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx
    git commit -m "feat: reconcile membership billing options"

### Task 2: Carry typed Join context into durable membership outcomes

**Files:**

- Modify: `lib/membership/join-schema.ts`, `lib/membership/join-navigation.ts`, `lib/membership/onboarding.ts`, `lib/membership/join-service.ts`, `lib/membership/lifecycle.ts`, `lib/db/repos/memberships.ts`.
- Modify: `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`.
- Modify tests: `tests/unit/join-schema.test.ts`, `tests/unit/join-navigation.test.ts`, `tests/unit/join-service.test.ts`, `tests/unit/join-service-review.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/join-actions-profile-identity.test.ts`, `tests/unit/join-page.test.tsx`, `tests/unit/profile-identity-billing.test.ts`, `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/portal-content-scope.test.ts`, `tests/unit/repository-production-security.test.ts`.
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

    Change the Server Action expectation after `saveCompany` from the dead status-card `/join` loop to:

    expect(redirectState.url)
      .toBe("/join/checkout?membership_id=membership-a");

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: FAIL because Join input has no interval, membership creation relies on the database default, terminal resume has no membership ID, and actions discard `CompleteApplicationResult`.

- [ ] **Step 3: Implement the final Join types and service ordering**

    Add `billingIntervalSchema = z.enum(BILLING_INTERVALS)`. Accept a scalar interval; arrays, unknown values, and duplicate query values fail closed. For `startJoin`, allow a null interval only long enough to check an existing actor-scoped application membership. Before any draft mutation, resolve a non-null selection through Task 1.

    Order `startJoin` as follows:

    1. Parse scalar plan, interval, and optional application ID.
    2. If resuming, require a member, load the actor-scoped application, and verify plan equality.
    3. Load `memberships.getByApplicationId(actor, application.id)`. When present, derive terminal outcome from its durable status and ID without replacing its interval from query input.
    4. If the application claims a terminal status but no membership exists, throw `MEMBERSHIP_NOT_FOUND`.
    5. Resolve the requested plan/interval. Only then ensure a profile or create/update a draft application.

    Order `completeApplication` so it checks an existing membership before accepting query interval as authority. For a new membership, require a resolved option and create with:

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

    Join calls it with `entry: "join"` and a resolved selection. Build callbacks with plan and interval. Task 3 will consume the already-supported `"member-login"` branch with a null selection.

    Make `saveProfile` and `saveCompany` bind the interval and redirect directly through `destinationForJoin(locale, result)`. Update profile/company anonymous recovery URLs to preserve plan and interval. Remove the terminal status-card branch from `JoinPage`; authenticated terminal outcomes redirect to checkout or completion.

- [ ] **Step 4: Run GREEN and verify no default-interval dependence remains**

    Run:

    npm.cmd test -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: PASS with exact profile/company/checkout/review/complete destinations and explicit membership intervals. Add `billingInterval: "annual"` or `"none"` to every typed `MembershipRecord` and `MembershipInput` fixture touched by the required property; do not weaken the property to optional.

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

    git add lib/membership/join-schema.ts lib/membership/join-navigation.ts lib/membership/onboarding.ts lib/membership/join-service.ts lib/membership/lifecycle.ts lib/db/repos/memberships.ts app/[locale]/(join)/join/actions.ts app/[locale]/(join)/join/page.tsx app/[locale]/(join)/join/profile/page.tsx app/[locale]/(join)/join/company/page.tsx messages/en.json messages/zh-HK.json tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/portal-content-scope.test.ts tests/unit/repository-production-security.test.ts
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

    Expand the continuation matrix to accept exactly the nine stable paths and reject:

    [
      "/portal/showcase",
      "/portal/company/seats/accept",
      "/portal/company/seats/accept?token=secret",
      "/portal/unknown",
      "/portal?query=1",
      "/portal#fragment",
      "//evil.example/portal",
      "https://evil.example/portal",
      "/portal\\company",
      "/portal\r\n/admin",
      ["/portal", "/admin"],
    ]

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

    const actor = await getActor().catch(() => null);
    if (!actor) {
      const requestHeaders = await headers();
      const continuation = parsePortalContinuation(
        requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"),
        locale,
      ) ?? "/portal";
      redirect(buildPortalSignInPath(locale, continuation));
    }
    requirePortalMember(actor);

    Do not accept arbitrary `startsWith("/portal")` paths. A staff/exco/superadmin actor must not acquire member access.

    Build `MemberLoginPage` in the transactional layout. It validates one scalar continuation, is noindex, redirects an existing member, renders a localized denied state for a non-member actor, and binds the same Task 2 Server Action with `entry: "member-login"`, null selection, and the parsed continuation. The callback and sent-state route remain `/member-login`. Keep the existing email validation, per-IP/per-address limiter, `APP_URL` origin validation, provider adapter, and generic auth error.

    Change `memberPortalAction.href` to `/member-login`. Add `route-member-login` to the integration manifest as an hkwtia-owned retained route. Keep `/member-login` out of `publicRoutes` so sitemap generation does not index it.

    Implement `PortalSignOutButton` as the only new auth Client Component. Disable while pending. Treat thrown errors and a returned `error` as failure. On success call `router.replace(destination)` then `router.refresh()`. Render it in both desktop and mobile Portal navigation through one component instance per responsive surface.

- [ ] **Step 4: Run GREEN and the credential-free redirect checks**

    Run:

    npm.cmd test -- tests/unit/join-navigation.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/portal-layout-auth.test.tsx tests/unit/portal-authorization.test.ts tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/page-indexability.test.ts tests/unit/wisetech-route-parity.test.ts

    Expected: PASS. Both navigation renderers target `/member-login`; generic Join targets `/membership`; continuation coverage is exact; sign-out has success, pending, and fail-stay behavior.

    Run:

    npm.cmd run test:e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts

    Expected: PASS without credentials. Every stable Portal route reaches the localized `/member-login` route with its canonical allowlisted `next`. Seat acceptance is not a generic continuation.

- [ ] **Step 5: Commit the member-access slice**

    git add app/[locale]/(join)/member-login/page.tsx components/portal/portal-sign-out-button.tsx lib/membership/join-navigation.ts app/[locale]/(join)/join/actions.ts app/[locale]/(member)/portal/layout.tsx components/portal/portal-nav.tsx lib/portal/queries.ts config/navigation.ts config/wisetech-integration-manifest.ts messages/en.json messages/zh-HK.json tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/portal-layout-auth.test.tsx tests/unit/join-navigation.test.ts tests/unit/join-actions.test.ts tests/unit/portal-authorization.test.ts tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/page-indexability.test.ts tests/unit/wisetech-route-parity.test.ts tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts tests/e2e/m2-admin-crm.spec.ts
    git commit -m "feat: add explicit member access controls"

### Task 4: Resolve checkout by durable option and project authoritative completion state

**Files:**

- Modify: `lib/billing/checkout-service.ts`, `lib/db/repos/billing-attempts.ts`, `lib/membership/join-billing-state.ts`.
- Modify: `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`, `components/billing/checkout-status.tsx`.
- Modify tests: `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/billing-checkout-locking.test.ts`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/portal-billing-actions.test.tsx`, `tests/unit/m1-acceptance-services.test.ts`, `tests/e2e/m1-acceptance.spec.ts`.
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

- `claimActive` and `startNewAttempt` receive `BillingAttemptSelection`; a lock-time mismatch throws `BILLING_OPTION_CHANGED` before an attempt or Stripe call.
- `createBillingPortalSession` final signature is `(actor, membershipId, locale, dependencies?)`.

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

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/m1-acceptance-services.test.ts

    Expected: FAIL because checkout resolves by plan only, locked membership rows omit interval, completion accepts pending payment only, and Billing Portal returns to the English path.

- [ ] **Step 3: Implement durable billing and status projection**

    Include `billingInterval` in `rawMembership` and the `FOR UPDATE` selection in `billing-attempts.ts`. Change `claimActive` and `startNewAttempt` to accept the full expected `{planCode, billingInterval}` option and compare both fields after the lock; add `BILLING_OPTION_CHANGED` to the typed error codes. Preserve the existing actor-first billing-manager scope, row lock, active-attempt reuse, exact attempt price, and idempotency key.

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

- [ ] **Step 4: Run GREEN and the M1 deterministic regression**

    Run:

    npm.cmd test -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/m1-acceptance-services.test.ts

    Expected: PASS. Price selection uses the durable pair, all completion states are actor-scoped, and forged success never activates or selects active state.

    Run:

    npm.cmd run test:e2e -- tests/e2e/m1-acceptance.spec.ts

    Expected: deterministic fixture checks PASS. Any live Neon/Stripe acceptance remains an explicit skip and is recorded as `NOT PASSED`.

- [ ] **Step 5: Commit the durable billing slice**

    git add lib/billing/checkout-service.ts lib/db/repos/billing-attempts.ts lib/membership/join-billing-state.ts app/[locale]/(join)/join/checkout/page.tsx app/[locale]/(join)/join/complete/page.tsx app/[locale]/(member)/portal/billing/page.tsx components/billing/checkout-status.tsx messages/en.json messages/zh-HK.json tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/m1-acceptance-services.test.ts tests/e2e/m1-acceptance.spec.ts
    git commit -m "feat: project durable billing state"

### Task 5: Lock the one-time seat invitation callback at route level

**Files:**

- Modify: `app/[locale]/(member)/portal/company/seats/page.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`.
- Create test: `tests/unit/seat-invitation-routes.test.tsx`.
- Modify tests: `tests/unit/seat-service.test.ts`, `tests/e2e/seat-management.spec.ts`.

**Interfaces:**

- Consumes: existing `inviteSeat`, `revokeInvitation`, `acceptSeatInvitation`, `auth.signIn.magicLink`, `requireActor`, `appEnv().appUrl`, and `SeatServiceError`.
- Produces no new runtime service, endpoint, identity store, or callback handler. It exposes the existing page-local callback/action functions for deterministic route tests only.

- [ ] **Step 1: Write failing invitation delivery, identity, replay, expiry, and revocation tests**

    In `seat-invitation-routes.test.tsx`, mock the current repository/auth boundaries and assert:

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

    Expected: FAIL because the page-local callback and invite action are not test exports and the route-level delegation/token invariants are not covered.

- [ ] **Step 3: Make the existing route seams testable without creating a second flow**

    Export the existing `invitationCallbackUrl` and `inviteSeatAction` from the seats page. Keep their production call sequence unchanged:

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

    git add app/[locale]/(member)/portal/company/seats/page.tsx app/[locale]/(member)/portal/company/seats/accept/page.tsx tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts tests/e2e/seat-management.spec.ts
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

    Render tests require one skip link, one `main#main-content`, named grouped navigation, `aria-current="page"` only on the most-specific item, 44 px target classes, table-local horizontal scrolling, and `role="alert"` only for error feedback.

    In JSDOM, open the mobile Sheet, press Escape, await close, and assert focus returns to the trigger.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts

    Expected: FAIL because no internal-shell family or grouped navigation configuration exists.

- [ ] **Step 3: Implement presentation-only primitives**

    Put stable href/id/match data in `config/internal-navigation.ts` and localize labels in layouts. Dashboard uses `match: "exact"`. Other entries use prefix matching; `activeInternalNavigationItem` chooses the matching item with the longest href, so listing wins over company and reports own Board drafts.

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

    git add config/internal-navigation.ts components/internal-shell/internal-app-shell.tsx components/internal-shell/internal-navigation.tsx components/internal-shell/internal-page-header.tsx components/internal-shell/internal-section.tsx components/internal-shell/internal-status-badge.tsx components/internal-shell/internal-table-frame.tsx components/internal-shell/internal-empty-state.tsx components/internal-shell/internal-action-feedback.tsx components/internal-shell/index.ts messages/en.json messages/zh-HK.json tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts
    git commit -m "feat: add internal application shell"

### Task 7: Apply the compact transactional shell to Join and member login

**Files:**

- Modify: `app/[locale]/(join)/layout.tsx`.
- Modify: `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`, `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(join)/member-login/page.tsx`.
- Modify: `components/join/join-form.tsx`, `components/join/progress.tsx`, `components/billing/checkout-status.tsx`.
- Create test: `tests/unit/wisetech-pr6-join-shell.test.tsx`.
- Modify tests: `tests/unit/join-page.test.tsx`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/member-login-page.test.tsx`, `tests/unit/page-indexability.test.ts`, `tests/e2e/join-auth.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: Task 6 `InternalAppShell`, `InternalNavigation`, `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, Task 2 Join outcomes, and Task 3 member login.
- Produces no new Join reader, action, repository, auth, or billing owner.

- [ ] **Step 1: Write the failing Join shell/rendering contract**

    The test reads all six transactional page sources and renders representative entry, profile, company, processing, review, active, invalid-plan, invalid-continuation, and sent states. Require:

    - the layout imports `@/components/internal-shell` and no public shell/navigation component;
    - exactly one `main#main-content` comes from the layout;
    - one visible H1 per rendered page state;
    - the skip link targets `#main-content`;
    - WTIA home and Membership links are locale-correct;
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

    npm.cmd test -- tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts

    Expected: FAIL because the transactional layout still owns bespoke markup and Join states do not use internal presentation primitives.

- [ ] **Step 3: Adopt the compact shell without changing behavior owners**

    Replace the layout frame with `InternalAppShell variant="join"`. Pass localized skip, brand, home, and Membership labels. Use the compact navigation variant for the two locale-correct links; do not mount the public header, public footer, or mega menu.

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

    npm.cmd test -- tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts

    Expected: PASS with one H1/main, exact form/action contracts, and no public-shell import.

    Run:

    npm.cmd run test:e2e -- tests/e2e/join-auth.spec.ts

    Expected: PASS at widths below 400 px in English and Chinese; no provider call occurs during render/validation, no horizontal document overflow appears, and forged status input does not create a terminal state.

- [ ] **Step 5: Commit the Join presentation slice**

    git add app/[locale]/(join)/layout.tsx app/[locale]/(join)/join/page.tsx app/[locale]/(join)/join/profile/page.tsx app/[locale]/(join)/join/company/page.tsx app/[locale]/(join)/join/checkout/page.tsx app/[locale]/(join)/join/complete/page.tsx app/[locale]/(join)/member-login/page.tsx components/join/join-form.tsx components/join/progress.tsx components/billing/checkout-status.tsx messages/en.json messages/zh-HK.json tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts tests/e2e/join-auth.spec.ts
    git commit -m "feat: align transactional join shell"

### Task 8: Apply the application shell to all Portal pages and fail closed on ambiguous company context

**Files:**

- Create: `lib/portal/company-context.ts`, `tests/unit/portal-company-context.test.ts`, `tests/unit/wisetech-pr6-portal-shell.test.tsx`.
- Modify: `app/[locale]/(member)/portal/layout.tsx`, `components/portal/portal-nav.tsx`.
- Modify all ten Portal pages: `app/[locale]/(member)/portal/page.tsx`, `app/[locale]/(member)/portal/profile/page.tsx`, `app/[locale]/(member)/portal/company/page.tsx`, `app/[locale]/(member)/portal/company/listing/page.tsx`, `app/[locale]/(member)/portal/company/seats/page.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`, `app/[locale]/(member)/portal/directory/page.tsx`, `app/[locale]/(member)/portal/events/page.tsx`, `app/[locale]/(member)/portal/documents/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`.
- Modify presentation components as needed: `components/portal/status-card.tsx`, `components/portal/directory-results.tsx`, `components/portal/document-list.tsx`, `components/portal/event-registration-form.tsx`, `components/portal/seat-invite-form.tsx`, `components/portal/seat-table.tsx`, `components/portal/showcase-listing-form.tsx`, `components/billing/billing-actions.tsx`.
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

    Assert exact eight-item navigation order, grouped semantics, Dashboard exact active state, Listing most-specific active state, seats owned by Company, mobile Sheet focus return, and sign-out in both responsive surfaces.

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

    Build localized Portal groups from `config/internal-navigation.ts` and render them through `InternalNavigation`. Pass `PortalSignOutButton` as navigation footer content. Replace the layout's separate `main` with `InternalAppShell variant="portal"` and pass the existing single Concierge widget as `afterMain`.

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

    Expected: PASS with one main/H1, exact active nav, one-company behavior retained, and multi-company private data withheld pending a separate selector decision.

    Run:

    npm.cmd run test:e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts

    Expected: credential-free protection PASS. Authenticated presentation cases run only when the isolated M2 identity/database gate is present; missing gate is recorded as `NOT PASSED`.

- [ ] **Step 5: Commit the Portal presentation slice**

    git add lib/portal/company-context.ts app/[locale]/(member)/portal/layout.tsx components/portal/portal-nav.tsx app/[locale]/(member)/portal/page.tsx app/[locale]/(member)/portal/profile/page.tsx app/[locale]/(member)/portal/company/page.tsx app/[locale]/(member)/portal/company/listing/page.tsx app/[locale]/(member)/portal/company/seats/page.tsx app/[locale]/(member)/portal/company/seats/accept/page.tsx app/[locale]/(member)/portal/directory/page.tsx app/[locale]/(member)/portal/events/page.tsx app/[locale]/(member)/portal/documents/page.tsx app/[locale]/(member)/portal/billing/page.tsx components/portal/status-card.tsx components/portal/directory-results.tsx components/portal/document-list.tsx components/portal/event-registration-form.tsx components/portal/seat-invite-form.tsx components/portal/seat-table.tsx components/portal/showcase-listing-form.tsx components/billing/billing-actions.tsx messages/en.json messages/zh-HK.json tests/unit/portal-company-context.test.ts tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-presentational.test.tsx tests/unit/portal-content-scope.test.ts tests/unit/portal-content-runtime-authorization.test.ts tests/unit/portal-billing-actions.test.tsx tests/unit/m5-member-listing.test.tsx tests/unit/concierge-layouts.test.ts tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts
    git commit -m "feat: align member portal shell"

### Task 9: Apply grouped Admin shell to Dashboard and CRM pages

**Files:**

- Modify: `app/[locale]/(admin)/admin/layout.tsx`, `components/admin/admin-nav.tsx`.
- Modify CRM pages: `app/[locale]/(admin)/admin/page.tsx`, `app/[locale]/(admin)/admin/members/page.tsx`, `app/[locale]/(admin)/admin/members/[id]/page.tsx`, `app/[locale]/(admin)/admin/segments/page.tsx`, `app/[locale]/(admin)/admin/at-risk/page.tsx`.
- Modify presentation components: `components/admin/dashboard-tiles.tsx`, `components/admin/member-table.tsx`, `components/admin/member-360.tsx`, `components/admin/member-note-form.tsx`, `components/admin/member-profile-form.tsx`, `components/admin/segment-builder.tsx`, `components/admin/segment-results.tsx`, `components/admin/segment-save-form.tsx`, `components/admin/at-risk-table.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-crm-shell.test.tsx`.
- Modify tests: `tests/unit/admin-presentational.test.tsx`, `tests/unit/admin-dashboard-tiles.test.tsx`, `tests/unit/admin-member-list.test.ts`, `tests/unit/admin-member-page-boundary.test.ts`, `tests/unit/admin-member-profile.test.ts`, `tests/unit/member-note-server-action-boundary.test.ts`, `tests/unit/segment-query.test.ts`, `tests/unit/segment-save-action.test.ts`, `tests/unit/campaign-server-action-auth.test.ts`, `tests/unit/at-risk-repository-boundary.test.ts`, `tests/unit/admin-page-auth.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: Task 6 Admin groups and shell primitives plus every existing Admin CRM reader/action.
- Produces presentation only. `requireAdminPageActor()` remains at layout/page boundaries; independent Server Actions still call `requireAdminActor()` before parsing or repository access.

- [ ] **Step 1: Write failing grouped-navigation, source-owner, and CRM rendering tests**

    Require Admin groups and order:

    - Workspace: Dashboard, Members, At-risk, Segments.
    - Content: Announcements, News, Page Copy, Media, Partners, Landing Partners.
    - Operations: Events, Listings, Cohorts, Approvals, Reports, Automations.

    Assert Dashboard is a visible link and exact-active only at `/admin`. Assert Member detail inherits Members and no unlisted Admin href appears.

    For the five CRM pages, assert one H1/main, grouped navigation label parity in English/Chinese, honest independent dashboard degradation, Member 360/note actions, exact segment query/export/campaign contracts, at-risk evidence, and existing auth-before-parse source ordering.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/admin-presentational.test.tsx tests/unit/admin-dashboard-tiles.test.tsx tests/unit/admin-member-list.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-member-profile.test.ts tests/unit/member-note-server-action-boundary.test.ts tests/unit/segment-query.test.ts tests/unit/segment-save-action.test.ts tests/unit/campaign-server-action-auth.test.ts tests/unit/at-risk-repository-boundary.test.ts tests/unit/admin-page-auth.test.ts

    Expected: FAIL because Admin navigation is flat, Dashboard is reachable only through the brand, and CRM pages do not use the shared internal presentation family.

- [ ] **Step 3: Adopt Admin shell and CRM primitives without moving authority**

    Build the three localized groups and render `InternalNavigation` from `AdminNav`. Replace the layout frame and separate main with `InternalAppShell variant="admin"`. Keep `await requireAdminPageActor()` before any private child render.

    Apply:

    - Dashboard: `InternalPageHeader` and independently guarded `InternalSection` tiles.
    - Members: `InternalPageHeader` and `InternalTableFrame` around the existing table.
    - Member 360: `InternalPageHeader`, `InternalSection`, `InternalStatusBadge`, and existing forms/actions.
    - Segments: `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, and `InternalTableFrame`.
    - At-risk: `InternalPageHeader` and `InternalTableFrame`.

    Keep same-transaction audits, sanitized notes, consent/suppression filtering, frozen campaign recipients, URL-bound idempotency, fixed CSV headers/formula neutralization, and all actor-first repository scopes unchanged.

- [ ] **Step 4: Run GREEN and M2 CRM regressions**

    Run the Step 2 command again.

    Expected: PASS with grouped active navigation and unchanged CRM/security assertions.

    Run:

    npm.cmd run test:e2e -- tests/e2e/m2-admin-crm.spec.ts

    Expected: credential-free anonymous Admin 404 PASS. Authenticated CRM cases run only with the complete isolated M2 gate; absent credentials remain `NOT PASSED`.

- [ ] **Step 5: Commit the Admin CRM slice**

    git add app/[locale]/(admin)/admin/layout.tsx components/admin/admin-nav.tsx app/[locale]/(admin)/admin/page.tsx app/[locale]/(admin)/admin/members/page.tsx app/[locale]/(admin)/admin/members/[id]/page.tsx app/[locale]/(admin)/admin/segments/page.tsx app/[locale]/(admin)/admin/at-risk/page.tsx components/admin/dashboard-tiles.tsx components/admin/member-table.tsx components/admin/member-360.tsx components/admin/member-note-form.tsx components/admin/member-profile-form.tsx components/admin/segment-builder.tsx components/admin/segment-results.tsx components/admin/segment-save-form.tsx components/admin/at-risk-table.tsx messages/en.json messages/zh-HK.json tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/admin-presentational.test.tsx tests/unit/admin-dashboard-tiles.test.tsx tests/unit/admin-member-list.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-member-profile.test.ts tests/unit/member-note-server-action-boundary.test.ts tests/unit/segment-query.test.ts tests/unit/segment-save-action.test.ts tests/unit/campaign-server-action-auth.test.ts tests/unit/at-risk-repository-boundary.test.ts tests/unit/admin-page-auth.test.ts tests/e2e/m2-admin-crm.spec.ts
    git commit -m "feat: align admin crm shell"

### Task 10: Align all Admin CMS pages while preserving publication and media locks

**Files:**

- Modify CMS pages: `app/[locale]/(admin)/admin/announcements/page.tsx`, `app/[locale]/(admin)/admin/announcements/[id]/page.tsx`, `app/[locale]/(admin)/admin/news/page.tsx`, `app/[locale]/(admin)/admin/news/[id]/page.tsx`, `app/[locale]/(admin)/admin/page-copy/page.tsx`, `app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx`, `app/[locale]/(admin)/admin/media/page.tsx`, `app/[locale]/(admin)/admin/media/[id]/page.tsx`, `app/[locale]/(admin)/admin/partners/page.tsx`, `app/[locale]/(admin)/admin/partners/[id]/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx`.
- Modify presentation components: `components/admin/announcement-form.tsx`, `components/admin/news-form.tsx`, `components/admin/page-copy-form.tsx`, `components/admin/media-form.tsx`, `components/admin/media-upload-form.tsx`, `components/admin/partner-form.tsx`, `components/admin/landing-partner-form.tsx`, `components/admin/archive-toggle.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-cms-shell.test.tsx`.
- Modify tests: `tests/unit/admin-announcement-pages-rendered.test.tsx`, `tests/unit/announcement-form-rendered.test.tsx`, `tests/unit/admin-news.test.ts`, `tests/unit/news-actions-auth-order.test.ts`, `tests/unit/page-copy-action-state.test.ts`, `tests/unit/page-copy-scope.test.ts`, `tests/unit/admin-media.test.ts`, `tests/unit/media-upload-form-rendered.test.tsx`, `tests/unit/admin-partner-pages-rendered.test.tsx`, `tests/unit/admin-partners.test.ts`, `tests/unit/partner-media-locking.test.ts`, `tests/unit/admin-server-action-boundaries.test.ts`, `tests/unit/admin-revalidate-path.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes existing announcement, News, Page Copy, Media, Partner, and Landing Partner repositories/actions.
- Produces no new CMS model, publication state, storage adapter, media URL, partner claim, or page-copy scope.

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

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    npm.cmd test -- tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/admin-announcement-pages-rendered.test.tsx tests/unit/announcement-form-rendered.test.tsx tests/unit/admin-news.test.ts tests/unit/news-actions-auth-order.test.ts tests/unit/page-copy-action-state.test.ts tests/unit/page-copy-scope.test.ts tests/unit/admin-media.test.ts tests/unit/media-upload-form-rendered.test.tsx tests/unit/admin-partner-pages-rendered.test.tsx tests/unit/admin-partners.test.ts tests/unit/partner-media-locking.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/admin-revalidate-path.test.ts

    Expected: FAIL only on the new presentation/source contract; existing publication, authorization, and reference-lock tests remain diagnostic controls.

- [ ] **Step 3: Apply CMS presentation primitives**

    Use `InternalPageHeader` on every list/detail page, `InternalSection` around existing forms/previews, `InternalTableFrame` around existing semantic tables, `InternalEmptyState` for empty repository results, and `InternalActionFeedback` for existing sanitized action state.

    Preserve all form names, hidden IDs, field-level errors, action bindings, repository calls, publication/archive locks, active-media transaction checks, partner provenance, bilingual News requirements, Page Copy allowlist, storage delivery paths, and localized revalidation. Do not add hard-coded content or synthetic rows.

- [ ] **Step 4: Run GREEN and the complete CMS invariant subset**

    Run the Step 2 command again.

    Expected: PASS with all twelve pages aligned and every existing CMS invariant unchanged.

- [ ] **Step 5: Commit the Admin CMS slice**

    git add app/[locale]/(admin)/admin/announcements/page.tsx app/[locale]/(admin)/admin/announcements/[id]/page.tsx app/[locale]/(admin)/admin/news/page.tsx app/[locale]/(admin)/admin/news/[id]/page.tsx app/[locale]/(admin)/admin/page-copy/page.tsx app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx app/[locale]/(admin)/admin/media/page.tsx app/[locale]/(admin)/admin/media/[id]/page.tsx app/[locale]/(admin)/admin/partners/page.tsx app/[locale]/(admin)/admin/partners/[id]/page.tsx app/[locale]/(admin)/admin/landing-partners/page.tsx app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx components/admin/announcement-form.tsx components/admin/news-form.tsx components/admin/page-copy-form.tsx components/admin/media-form.tsx components/admin/media-upload-form.tsx components/admin/partner-form.tsx components/admin/landing-partner-form.tsx components/admin/archive-toggle.tsx messages/en.json messages/zh-HK.json tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/admin-announcement-pages-rendered.test.tsx tests/unit/announcement-form-rendered.test.tsx tests/unit/admin-news.test.ts tests/unit/news-actions-auth-order.test.ts tests/unit/page-copy-action-state.test.ts tests/unit/page-copy-scope.test.ts tests/unit/admin-media.test.ts tests/unit/media-upload-form-rendered.test.tsx tests/unit/admin-partner-pages-rendered.test.tsx tests/unit/admin-partners.test.ts tests/unit/partner-media-locking.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/admin-revalidate-path.test.ts
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

    git add app/[locale]/(admin)/admin/events-mgmt/page.tsx app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx app/[locale]/(admin)/admin/listings-review/page.tsx app/[locale]/(admin)/admin/cohorts/page.tsx app/[locale]/(admin)/admin/cohorts/[id]/page.tsx app/[locale]/(admin)/admin/approvals/page.tsx app/[locale]/(admin)/admin/reports/page.tsx app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx app/[locale]/(admin)/admin/automations/page.tsx components/admin/event-form.tsx components/admin/attendee-table.tsx components/admin/showcase-review-table.tsx components/admin/cohort-form.tsx components/admin/cohort-kanban.tsx components/admin/approval-list.tsx components/admin/report-cards.tsx components/admin/board-draft-list.tsx components/admin/safe-generated-content.tsx components/admin/automation-dashboard.tsx components/admin/automation-retry-form.tsx messages/en.json messages/zh-HK.json tests/unit/wisetech-pr6-admin-operations-shell.test.tsx tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/m5-admin-review.test.tsx tests/unit/admin-cohort-management.test.ts tests/unit/m6-admin-cohorts.test.tsx tests/unit/approval-authorization.test.ts tests/unit/approval-server-action-auth.test.ts tests/unit/approval-list.test.tsx tests/unit/report-reconciliation.test.ts tests/unit/board-reporter-render.test.ts tests/unit/automation-dashboard-review.test.tsx tests/unit/automation-retry.test.ts tests/unit/admin-server-action-boundaries.test.ts
    git commit -m "feat: align admin operations shell"

### Task 12: Prove bilingual, accessibility, M1-M7, and delivery gates without widening authority

**Files:**

- Create: `tests/e2e/wisetech-pr6-internal-journeys.spec.ts`, `docs/integration/wisetech-pr6-verification.md`, `docs/integration/wisetech-pr6-pr-body.md`.
- Modify: `tests/e2e/accessibility.spec.ts`, `tests/e2e/core-pages.spec.ts`, `tests/e2e/join-auth.spec.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`, `tests/e2e/m1-acceptance.spec.ts`, `tests/e2e/m2-admin-crm.spec.ts`.
- Modify only if required by measured route coverage: `lighthouserc.js`.

**Interfaces:**

- Consumes all Tasks 1-11 and existing isolated M1-M7 fixtures.
- Produces command-by-command evidence only. It performs no migration, seed, live invitation, provider call, merge, deployment, or production mutation.

- [ ] **Step 1: Write the failing credential-free PR6 browser contract**

    Cover both locales and widths 320, 375, 768, 1024, and 1280. The spec must assert:

    - `/member-login` is under 400, noindex in metadata/unit evidence, has one H1/main, validates bad email without a provider call, and preserves only a safe continuation;
    - each stable Portal destination redirects anonymous users to localized member login with the exact canonical `next`;
    - `/portal/showcase` is not a valid primary destination;
    - anonymous Admin remains a real 404;
    - invalid Join plan/interval and forged completion fail closed;
    - skip link, visible focus, mobile drawer Escape/focus return, one main/H1, 44 px controls, and no document overflow hold on accessible credential-free pages;
    - serious/critical Axe violations equal zero on all accessible English/Chinese representatives;
    - no browser request reaches real Stripe, Neon magic-link send, Resend, WOZTELL, Cloudflare job, storage mutation, database mutation, or invitation acceptance.

    Use request interception to fail the test if a credential-free case attempts a provider/mutation endpoint. Do not synthesize authenticated HTML.

- [ ] **Step 2: Run the focused PR6 cross-surface aggregate**

    Run:

    npm.cmd test -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/wisetech-pr6-admin-operations-shell.test.tsx

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

- [ ] **Step 4: Run focused and full browser gates**

    Run:

    npm.cmd run test:e2e -- tests/e2e/wisetech-pr6-internal-journeys.spec.ts

    Expected: credential-free PR6 cases PASS.

    Run:

    npm.cmd run test:e2e

    Expected: the complete repository browser gate PASS or records explicit credential-gated skips/failures without converting them to acceptance.

    Run:

    npm.cmd run test:lighthouse

    Expected: on an authorized reachable target, performance is at least 0.90, accessibility at least 0.95, and SEO at least 0.95. Record LCP at most 2.5 s and CLS at most 0.1 from Lighthouse. Record INP at most 200 ms at p75 only from authorized field/Preview evidence; if unavailable, mark the INP gate `NOT PASSED`. Do not upload private authenticated pages to public temporary storage.

- [ ] **Step 5: Run isolated M1-M7 only when the explicit gate exists**

    First run the existing environment-contract tests. If the complete isolated variables and explicit test authority are present, run:

    npm.cmd run test:e2e -- tests/e2e/m1-acceptance.spec.ts tests/e2e/m2-admin-crm.spec.ts tests/e2e/m3-automations.spec.ts tests/e2e/m4b-agents.spec.ts tests/e2e/m4c-aiops.spec.ts tests/e2e/m5-showcase.spec.ts tests/e2e/m6-launch-pad.spec.ts tests/e2e/seat-management.spec.ts tests/e2e/portal-secondary-pages.spec.ts

    Expected under an authorized isolated environment:

    - M1 proves advertised interval, magic-link continuation, profile/company onboarding, persisted interval, exact Stripe Price, signed webhook activation, completion, localized Billing Portal, receipts, seats, secondary pages, and sign-out.
    - M2 proves full Admin inventory denial plus Member 360, notes, segments/CSV/campaign, at-risk, check-in, approvals, reports, and audits.
    - M3 proves automation data and one eligible audited retry while sent/ineligible rows are denied.
    - M4 proves retention approvals and inert Board draft preview in both locales.
    - M5 proves canonical listing manager/member permissions and staff review/rejection reason.
    - M6 proves legal cohort transitions and stage audit.
    - M7 proves bilingual News, Page Copy, and Media lifecycle/reference locks through its existing focused unit/integration suites.

    Missing isolated database, identities, test providers, or cleanup authority means `NOT PASSED`. Do not seed, migrate, send, accept, or mutate a live/Preview environment without separate approval.

- [ ] **Step 6: Write the verification record and prove the committed range**

    In `docs/integration/wisetech-pr6-verification.md` record:

    - immutable PR5 base and PR6 head;
    - every command, timestamp, exit code, totals, warnings, skips, and exact blocker;
    - RED and GREEN evidence for Tasks 1-11;
    - independent per-task review result;
    - credential-free versus isolated-authenticated evidence;
    - external gates as `PASSED` or `NOT PASSED` with no implied acceptance;
    - confirmation of no schema/migration/seed/provider/production action;
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

    No migration, seed/import, provider configuration, production mutation, merge, or deployment is included.

    Run:

    git diff --name-status 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD
    git log --oneline 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae..HEAD
    git diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD
    git status --short

    Expected: only approved PR6 files, cohesive commits, no whitespace errors, and a clean worktree after the verification record commit.

- [ ] **Step 7: Commit only the browser/evidence slice**

    git add tests/e2e/wisetech-pr6-internal-journeys.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/core-pages.spec.ts tests/e2e/join-auth.spec.ts tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts tests/e2e/m1-acceptance.spec.ts tests/e2e/m2-admin-crm.spec.ts docs/integration/wisetech-pr6-verification.md docs/integration/wisetech-pr6-pr-body.md
    git commit -m "test: verify PR6 internal journeys"

    If `lighthouserc.js` changed only to add approved public/member-login route collection without exposing authenticated URLs, stage that exact file too. Do not stage test results, traces, credentials, environment files, generated runtime output, or unrelated changes.

- [ ] **Step 8: Complete independent review and publish the stacked draft PR**

    Generate the final immutable review package from PR5 head to the committed PR6 head. A fresh reviewer must inspect the approved spec, this plan, the complete diff, focused RED/GREEN evidence, full verification record, authorization/import boundaries, and rollback statement. Resolve findings and repeat review until the result is zero Critical, zero Important, and zero Minor.

    Confirm the exact branch and clean state:

    git branch --show-current
    git status --short
    git rev-parse HEAD

    Expected: `codex/wisetech-pr6-join-portal-admin`, no worktree changes, and the reviewed head SHA.

    Push only the reviewed branch:

    git push --set-upstream origin codex/wisetech-pr6-join-portal-admin

    Open the stacked draft pull request:

    gh pr create --draft --base codex/wisetech-pr5-public-journeys --head codex/wisetech-pr6-join-portal-admin --title "feat: align WiseTech Join Portal and Admin" --body-file docs/integration/wisetech-pr6-pr-body.md

    Verify remote identity and observed checks:

    gh pr view --json url,state,isDraft,baseRefName,headRefName,mergeStateStatus,statusCheckRollup
    git ls-remote origin refs/heads/codex/wisetech-pr6-join-portal-admin

    Expected: OPEN draft PR, base `codex/wisetech-pr5-public-journeys`, head `codex/wisetech-pr6-join-portal-admin`, and remote SHA equal to the reviewed local head. Report pending/failing remote checks separately. Do not merge, deploy, mutate providers, or convert an external gate into PASS.

## Self-Review

- Spec coverage: Tasks 1-2 cover the one catalog authority, interval identity, typed Join context/outcomes, direct terminal navigation, durable interval precedence, and explicit membership persistence. Task 3 covers the complete continuation allowlist, explicit noindex member login, one Neon magic-link path, member-only Portal entry, public navigation destinations, and sign-out behavior. Task 4 covers durable checkout pricing, lock projection, webhook-authoritative completion, and localized Billing Portal return. Task 5 covers invitation callback/token identity, replay, expiry, revocation, and provider-free route tests.
- Presentation coverage: Task 6 creates the shared shell family, grouped eight-item Portal and 4/6/6 Admin navigation, active specificity, skip/main/mobile/focus/table/feedback behavior, and exact 6/10/26 route inventories. Tasks 7-8 align every Join/member-login and Portal route while preserving current owners and failing closed on ambiguous company context. Tasks 9-11 align every Admin CRM, CMS, and Operations page while retaining authorization, audits, publication/media locks, approvals, reports, automations, Showcase, and cohort transitions.
- Verification coverage: Task 12 includes the exact PR6 unit aggregate, `npm.cmd ci`, string audit, full unit/lint/type/build, focused and full Playwright, isolated M1-M7 gates, Lighthouse thresholds, high-vulnerability audit, diff/range/worktree checks, evidence classification, source-only rollback, final independent review, and stacked draft-PR publication with remote SHA verification.
- Type consistency: `BillingInterval` and `MembershipSelection` originate in Tasks 1-2; all later Join, checkout, completion, navigation, and test signatures consume those exact names. `PortalContinuation` is defined once in Task 2 and consumed by Task 3. `InternalNavigationGroup` and shell primitive names originate in Task 6 and are used unchanged in Tasks 7-11.
- Placeholder scan: every task names exact files, interfaces, RED/GREEN commands, expected failure/pass evidence, production constraints, and an explicit commit. No implementation step delegates an unspecified error, edge case, test, provider, or data decision.

## Execution Handoff

Execution mode is already approved: Subagent-Driven. After explicit approval of this implementation plan, dispatch one fresh implementer per numbered task. Require its focused RED/GREEN/refactor evidence and exact commit, generate an immutable base/head review package, obtain a fresh independent review with zero Critical, Important, and Minor findings, and only then advance to the next task.

Approval of this plan does not authorize provider calls, database migration/seed/import, Preview mutation, merge, deployment, or production action. Those remain separate gates.
