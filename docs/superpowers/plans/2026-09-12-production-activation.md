# Production Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-merged two-sided platform actually work in production — fix the crash a signed-in staff member hits, retire the temporary auth diagnostics, apply the outstanding migrations, add the admin capability needed to create a test member, and walk four paths end to end.

**Architecture:** Two small guard fixes in existing files; one new admin-only repository module following the `admin-member-profile.ts` precedent (narrow `.strict()` input, `requireAdmin` first, insert plus audit row in one transaction) wired through the established `*-action-core.ts` / `*-actions.ts` server-action pair; then operational tasks — migrations rehearsed on a Neon branch before production, and a recorded production walk.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle on Neon Postgres, next-intl (`en` / `zh-HK`), Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-12-production-activation-design.md`

---

## Context an engineer needs before Task 1

**The bug that started this.** A staff member signing in lands on `/portal`. `PortalLayout`
admits any authenticated actor via `requireActor()`, so staff clear the layout, and then
`portal/page.tsx` calls `getDashboard(actor)` whose first statement is
`requireMember(actor)` — which throws `FORBIDDEN` for anything that is not
`kind: "member"`. The visitor sees the error boundary.

**Why the guard goes in two places.** `portal/page.tsx` already carries the reason, written
when the same thing happened for anonymous visitors:

> The layout redirects unauthenticated visitors, but Next renders layout and page in
> parallel, so `requireActor()` here threw UNAUTHORIZED into the runtime error log on
> every anonymous hit (Vercel, 2026-09; audit F21).

A layout-only fix leaves the page still throwing into the error log. Both, or neither.

**Actor kinds:** `anonymous`, `member`, `staff`, `exco`, `superadmin`, `system`.
`AdminActor` is `staff | exco | superadmin` (`lib/membership/lifecycle.ts`).

**A test that looks wrong but is right.** `tests/unit/member-login-page.test.tsx:35-42`
asserts a **staff** actor is redirected to `/zh/portal` after sign-in. That stays green and
stays correct: `/member-login` keeps sending everyone to their continuation, and `/portal`
now bounces admins onward to `/admin`. Do not "fix" that test to expect `/admin` — the
redirect it asserts is a different one.

---

## Task 1: Redirect an admin actor away from `/portal`

**Files:**
- Modify: `lib/auth/authorize.ts`
- Modify: `app/[locale]/(member)/portal/layout.tsx`
- Modify: `app/[locale]/(member)/portal/page.tsx`
- Test: `tests/unit/portal-admin-redirect.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/portal-admin-redirect.test.tsx`:

```tsx
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({redirectUrl: null as string | null}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("@/lib/auth/actor", () => ({
  getActor: vi.fn(async () => null),
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({getDashboard: vi.fn(async () => { throw new Error("getDashboard must not run for an admin actor"); })}));

import {getActor, requireActor} from "@/lib/auth/actor";
import PortalPage from "@/app/[locale]/(member)/portal/page";

describe("portal admin redirect", () => {
  beforeEach(() => { state.redirectUrl = null; });

  // Regression: a staff actor cleared PortalLayout's requireActor() and then threw
  // FORBIDDEN inside getDashboard()'s requireMember(), showing the error boundary.
  it.each([
    ["staff", "en", "/admin"],
    ["exco", "zh-HK", "/zh/admin"],
    ["superadmin", "en", "/admin"],
  ] as const)("sends a %s actor to the admin surface instead of rendering the member dashboard", async (kind, locale, expected) => {
    vi.mocked(getActor).mockResolvedValueOnce({kind, userId: "u2", profileId: "p2"});

    await expect(
      PortalPage({params: Promise.resolve({locale})}),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe(expected);
  });

  it("leaves a member actor on the dashboard path", async () => {
    vi.mocked(getActor).mockResolvedValueOnce({kind: "member", userId: "u3", profileId: "p3"});
    vi.mocked(requireActor).mockResolvedValueOnce({kind: "member", userId: "u3", profileId: "p3"});

    // getDashboard is mocked to throw if reached with a non-member; reaching it at all
    // proves the guard let a member through.
    await expect(PortalPage({params: Promise.resolve({locale: "en"})})).rejects.toThrow("getDashboard must not run");
    expect(state.redirectUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/portal-admin-redirect.test.tsx`
Expected: FAIL — the admin cases do not redirect; `state.redirectUrl` is `null` because
the page currently calls `getDashboard` for every authenticated actor.

- [ ] **Step 3: Add the predicate**

In `lib/auth/authorize.ts`, below `requireAdmin`, add:

```ts
/**
 * The non-throwing half of `requireAdmin`. A caller that must *route* on the
 * answer rather than refuse on it needs a predicate: throwing to decide where
 * to redirect turns ordinary navigation into an error-boundary render, which
 * is exactly what `/portal` did to every signed-in staff member.
 */
export function isAdminActor(actor: Actor): actor is AdminActor {
  return actor.kind === "staff" || actor.kind === "exco" || actor.kind === "superadmin";
}
```

- [ ] **Step 4: Guard the page**

In `app/[locale]/(member)/portal/page.tsx`, add `isAdminActor` to the existing
`@/lib/auth/authorize` imports (create the import if absent), then insert directly after
the existing `if (!actor) redirect(...)` line:

```ts
  // Staff have no member dashboard: getDashboard's requireMember() would throw
  // FORBIDDEN into the error boundary. Same parallel-render reason as the
  // anonymous guard above, so this lives in the page as well as the layout.
  if (isAdminActor(actor)) redirect(localizedPath(locale, "/admin"));
```

- [ ] **Step 5: Guard the layout**

In `app/[locale]/(member)/portal/layout.tsx`, replace the existing `try`/`catch` around
`requireActor()` with:

```ts
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      const requestHeaders = await headers();
      const continuation = parsePortalContinuation(requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"));
      redirect(memberLoginPath(locale, continuation));
    }
    throw error;
  }
  if (isAdminActor(actor)) redirect(localizedPath(locale, "/admin"));
```

Add `isAdminActor` to the `@/lib/auth/authorize` import and `localizedPath` is already
imported from `@/lib/urls`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/portal-admin-redirect.test.tsx tests/unit/portal-authorization.test.ts tests/unit/member-login-page.test.tsx`
Expected: PASS, all three files. `member-login-page.test.tsx` must stay green untouched —
see "A test that looks wrong but is right" above.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/authorize.ts "app/[locale]/(member)/portal/layout.tsx" "app/[locale]/(member)/portal/page.tsx" tests/unit/portal-admin-redirect.test.tsx
git commit -m "fix(portal): send an admin actor to /admin instead of the error boundary"
```

---

## Task 2: Retire the temporary auth diagnostics

**Files:**
- Modify: `proxy.ts`
- Test: `tests/unit/proxy.test.ts`

PR #56 added a presence-dump to find why the magic-link exchange never fired. It answered
the question (`hasChallengeCookie:false`) and its commit promised removal. Replace it with
one signal for the single case that cost the session: the exchange ran and Neon minted
nothing.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/proxy.test.ts`, inside the existing `describe("createNeonAuthExchange", ...)`:

```ts
  it("warns exactly once when Neon refuses to mint a session, and stays silent otherwise", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const refused = createNeonAuthExchange(async () => new Response(null, {status: 401}), env);
      await refused(new NextRequest(CALLBACK));
      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockClear();
      const ok = createNeonAuthExchange(async () => minted(), env);
      await ok(new NextRequest(CALLBACK));
      // A successful exchange and an ordinary request are both unremarkable.
      await ok(new NextRequest("https://hkwtia.vercel.app/zh/admin"));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
```

Add `vi` to the vitest import at the top of the file:

```ts
import {describe, expect, it, vi} from "vitest";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/proxy.test.ts`
Expected: FAIL — `expect(warn).toHaveBeenCalledTimes(1)` receives 0; nothing warns today.

- [ ] **Step 3: Replace the diagnostic with the failure-only signal**

In `proxy.ts`, delete the entire `logNeonAuthDiagnostic` function, its two call sites, and
the now-unused `NEON_AUTH_SESSION_CHALLENGE_COOKIE_NAME` import. Then replace the
no-cookie early return inside `neonAuthExchange` with:

```ts
    // No cookie means no session was minted. Redirecting anyway would strip the
    // verifier and land the visitor on the same form having silently spent it.
    if (cookies.length === 0) {
      // The one case worth a word. An exchange that falls through without any
      // signal is what made the original failure take a full session to find:
      // from outside it is indistinguishable from never having run.
      console.warn("[neon-auth] session exchange refused: verifier present, no session minted");
      return null;
    }
```

Leave every other branch silent — no verifier, an existing session, and a misconfigured
environment are all ordinary.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/proxy.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts tests/unit/proxy.test.ts
git commit -m "refactor(auth): retire the #56 diagnostics for a failure-only signal"
```

---

## Task 3: Admin membership repository

**Files:**
- Create: `lib/db/repos/admin-membership.ts`
- Test: `tests/unit/admin-membership.test.ts` (create)

Follows `lib/db/repos/admin-member-profile.ts` exactly: `requireAdmin` before any database
access, a `.strict()` schema whose exclusions each carry a reason, and the mutation plus its
audit row in one transaction.

**Schema facts this task depends on** (`lib/db/schema-core.ts`):
- `memberships_target_check` — `owner_user_id` **xor** `company_id`. A comp targets a
  profile, so `companyId` stays null and is not an input.
- `seatLimit` is `notNull()` with **no default**; `membershipPlans.seatAllowance` is the
  source of truth for it.
- `status` defaults to `pending_payment`; a comp overrides to `active`.
- `MEMBERSHIP_PLAN_CODES = ["community", "startup", "corporate", "patron"]`
  (`lib/membership/constants.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-membership.test.ts`:

```ts
import {describe, expect, it, vi} from "vitest";

import {compMembership, type CompMembershipDependencies} from "@/lib/db/repos/admin-membership";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";

const admin = {kind: "staff", userId: "u-staff", profileId: "p-staff"} as const;

function dependencies(overrides: Partial<{seatAllowance: number | null}> = {}) {
  const calls = {inserted: [] as unknown[], audited: [] as unknown[], order: [] as string[]};
  const deps: CompMembershipDependencies = {
    transaction: (work) => work({
      planSeatAllowance: async () => overrides.seatAllowance === undefined ? 5 : overrides.seatAllowance,
      insertMembership: async (input) => {
        calls.order.push("insert");
        calls.inserted.push(input);
        return {id: "m-1", ...input} as never;
      },
      insertAudit: async (input) => { calls.order.push("audit"); calls.audited.push(input); },
    }),
  };
  return {deps, calls};
}

describe("compMembership", () => {
  it.each([
    ["member", {kind: "member", userId: "u", profileId: "p"}],
    ["anonymous", ANONYMOUS_ACTOR],
    ["system", {kind: "system", userId: null, source: "stripe-webhook"}],
  ] as const)("refuses a %s actor before touching the database", async (_name, forged) => {
    const loadDatabase = vi.fn();
    await expect(compMembership(forged as never, {profileId: "p-1", planCode: "community"}, {
      transaction: loadDatabase as never,
    })).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("writes the membership active, seated from the plan, and audits it in the same transaction", async () => {
    const {deps, calls} = dependencies({seatAllowance: 12});

    await compMembership(admin, {profileId: "p-1", planCode: "corporate"}, deps);

    expect(calls.inserted).toEqual([{
      ownerUserId: "p-1",
      companyId: null,
      planCode: "corporate",
      status: "active",
      seatLimit: 12,
    }]);
    expect(calls.audited).toEqual([{
      actorUserId: "p-staff",
      actorType: "staff",
      action: "membership.comped",
      targetType: "membership",
      targetId: "m-1",
      metadata: {planCode: "corporate", ownerUserId: "p-1"},
    }]);
    // Audit must follow the insert inside the same transaction, never beside it.
    expect(calls.order).toEqual(["insert", "audit"]);
  });

  it.each([
    ["an unknown plan", {profileId: "p-1", planCode: "platinum"}],
    ["a blank profile", {profileId: "", planCode: "community"}],
    ["a hand-set status", {profileId: "p-1", planCode: "community", status: "past_due"}],
    ["a company target", {profileId: "p-1", planCode: "community", companyId: "c-1"}],
  ])("rejects %s", async (_name, input) => {
    const {deps} = dependencies();
    await expect(compMembership(admin, input, deps)).rejects.toThrow();
  });

  it("refuses when the plan has no seat allowance rather than inventing one", async () => {
    const {deps, calls} = dependencies({seatAllowance: null});
    await expect(compMembership(admin, {profileId: "p-1", planCode: "community"}, deps))
      .rejects.toThrow("MEMBERSHIP_PLAN_NOT_FOUND");
    expect(calls.inserted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/admin-membership.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/repos/admin-membership'`.

- [ ] **Step 3: Write the implementation**

Create `lib/db/repos/admin-membership.ts`:

```ts
import "server-only";

import {eq} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, membershipPlans, memberships, type Membership} from "@/lib/db/server-schema";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

/**
 * What staff may set when comping a membership, and deliberately no more.
 *
 * Excluded, each for its own reason:
 * - `status` — every value other than `active` (`pending_payment`, `pending_review`,
 *   `past_due`, `cancel_at_period_end`) is a billing state the Stripe webhook owns.
 *   Letting staff type one is how a membership reaches a state no payment event will
 *   ever move it out of. A comp is active by definition.
 * - `companyId` — `memberships_target_check` allows an owner **xor** a company, so a
 *   form offering both would produce a row the database refuses. A comp targets a person.
 * - `seatLimit` — derived from the plan's `seatAllowance` below. A hand-typed seat count
 *   silently diverges from what the plan sells.
 * - `stripeCustomerId`, `stripeSubscriptionId`, `billingPeriod*`, `cancelAtPeriodEnd` —
 *   billing facts. A comp is the absence of billing, not an edit to it.
 */
const compSchema = z.object({
  profileId: z.string().trim().min(1).max(200),
  planCode: z.enum(MEMBERSHIP_PLAN_CODES),
}).strict();

export type CompMembershipInput = z.output<typeof compSchema>;

export type CompMembershipDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  planSeatAllowance: (planCode: CompMembershipInput["planCode"]) => Promise<number | null>;
  insertMembership: (input: Readonly<{
    ownerUserId: string;
    companyId: null;
    planCode: CompMembershipInput["planCode"];
    status: "active";
    seatLimit: number;
  }>) => Promise<Membership>;
  insertAudit: (input: Readonly<{
    actorUserId: string;
    actorType: AdminActor["kind"];
    action: "membership.comped";
    targetType: "membership";
    targetId: string;
    metadata: Record<string, unknown>;
  }>) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

async function defaultDependencies(): Promise<CompMembershipDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    planSeatAllowance: async (planCode) =>
      (await tx.select({seatAllowance: membershipPlans.seatAllowance})
        .from(membershipPlans).where(eq(membershipPlans.code, planCode)).limit(1))[0]?.seatAllowance ?? null,
    insertMembership: async (input) => (await tx.insert(memberships).values(input).returning())[0],
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

/**
 * Grants a membership without a payment — a comp, a founding member, or the repair of a
 * checkout that took money and never activated.
 *
 * `membershipsRepository.create` cannot do this: it refuses any actor that is not
 * `member` or `system`, which is correct for the self-service and webhook paths it
 * serves. Widening it would put a staff-writable door on the member-facing gate, so this
 * is a separate module with its own narrow contract, exactly as `admin-member-profile.ts`
 * is for profile corrections.
 */
export async function compMembership(
  actor: Actor,
  input: unknown,
  dependencies?: CompMembershipDependencies,
): Promise<Membership> {
  requireAdmin(actor);
  const parsed = compSchema.parse(input);
  return (dependencies ?? await defaultDependencies()).transaction(async (transaction) => {
    const seatLimit = await transaction.planSeatAllowance(parsed.planCode);
    // A plan row missing or seatless is a seeding fault, not a membership to guess at.
    if (seatLimit === null) throw new Error("MEMBERSHIP_PLAN_NOT_FOUND");
    const row = await transaction.insertMembership({
      ownerUserId: parsed.profileId,
      companyId: null,
      planCode: parsed.planCode,
      status: "active",
      seatLimit,
    });
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "membership.comped",
      targetType: "membership",
      targetId: row.id,
      metadata: {planCode: parsed.planCode, ownerUserId: parsed.profileId},
    });
    return row;
  });
}

export const adminMembershipRepository = {comp: compMembership};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/admin-membership.test.ts`
Expected: PASS, 9 tests (3 actor cases + 1 happy path + 4 rejection cases + 1 seatless plan).

- [ ] **Step 5: Verify the repository boundary tests still pass**

This adds a file under `lib/db/repos/`, which discovery tests scan.

Run: `npx vitest run tests/unit/repository-boundary.test.ts tests/unit/repository-production-security.test.ts tests/unit/admin-repository-authorization.test.ts`
Expected: PASS. If a discovery test asserts a repository count, update that count in the
same commit — the count is the point of the test, not an obstacle to it.

- [ ] **Step 6: Commit**

```bash
git add lib/db/repos/admin-membership.ts tests/unit/admin-membership.test.ts
git commit -m "feat(admin): comp a membership without a payment, audited in-transaction"
```

---

## Task 4: Server action for comping a membership

**Files:**
- Create: `lib/admin/membership-comp-action-core.ts`
- Create: `lib/admin/membership-comp-actions.ts`
- Test: `tests/unit/membership-comp-action.test.ts` (create)

Hard boundary 3: a `"use server"` module must not export an actor-taking function, because
that directive publishes every export as an HTTP endpoint and an exported `fn(actor, …)`
accepts a forged actor. Logic goes in the core; the `"use server"` module exports only the
actor-resolving wrapper. `tests/unit/server-action-actor-boundary.test.ts` enforces this.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/membership-comp-action.test.ts`:

```ts
import {describe, expect, it, vi} from "vitest";

import {runCompMembershipAction} from "@/lib/admin/membership-comp-action-core";

const messages = {
  successMessage: "comped",
  validationMessage: "invalid",
  errorMessage: "failed",
};

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe("runCompMembershipAction", () => {
  it("reports success after the mutation runs", async () => {
    const mutate = vi.fn(async () => undefined);
    const state = await runCompMembershipAction({}, formData({profileId: "p-1", planCode: "community"}), {...messages, mutate});

    expect(mutate).toHaveBeenCalledWith({profileId: "p-1", planCode: "community"});
    expect(state).toEqual({status: "success", message: "comped"});
  });

  it("reports a validation failure without echoing an unknown plan back as success", async () => {
    const mutate = vi.fn(async () => undefined);
    const state = await runCompMembershipAction({}, formData({profileId: "p-1", planCode: "platinum"}), {...messages, mutate});

    expect(mutate).not.toHaveBeenCalled();
    expect(state.status).toBe("error");
    expect(state.message).toBe("invalid");
  });

  it("surfaces a failed mutation as an error rather than a silent success", async () => {
    const mutate = vi.fn(async () => { throw new Error("MEMBERSHIP_PLAN_NOT_FOUND"); });
    const state = await runCompMembershipAction({}, formData({profileId: "p-1", planCode: "community"}), {...messages, mutate});

    expect(state).toEqual({status: "error", message: "failed"});
  });

  it("lets an authorization denial through so the caller can hide the surface", async () => {
    const mutate = vi.fn(async () => { throw new Error("FORBIDDEN"); });

    await expect(runCompMembershipAction({}, formData({profileId: "p-1", planCode: "community"}), {...messages, mutate}))
      .rejects.toThrow("FORBIDDEN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/membership-comp-action.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/membership-comp-action-core'`.

- [ ] **Step 3: Write the core**

Create `lib/admin/membership-comp-action-core.ts`:

```ts
import {z} from "zod";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

export type CompMembershipActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
}>;

const formSchema = z.object({
  profileId: z.string().trim().min(1).max(200),
  planCode: z.enum(MEMBERSHIP_PLAN_CODES),
}).strict();

type CompMembershipOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (input: z.output<typeof formSchema>) => Promise<unknown>;
}>;

export async function runCompMembershipAction(
  _state: CompMembershipActionState,
  formData: FormData,
  options: CompMembershipOptions,
): Promise<CompMembershipActionState> {
  const parsed = formSchema.safeParse({
    profileId: formData.get("profileId"),
    planCode: formData.get("planCode"),
  });
  if (!parsed.success) return {status: "error", message: options.validationMessage};
  try {
    await options.mutate(parsed.data);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    // A denial is the caller's to translate into notFound(); swallowing it here
    // would render the admin surface to someone who may not see it exists.
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.errorMessage};
  }
}
```

- [ ] **Step 4: Write the server action**

Create `lib/admin/membership-comp-actions.ts`:

```ts
"use server";

import {notFound} from "next/navigation";

import {
  runCompMembershipAction,
  type CompMembershipActionState,
} from "@/lib/admin/membership-comp-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {adminMembershipRepository} from "@/lib/db/repos/admin-membership";

export type CompMembershipActionMessages = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
}>;

export async function compMembershipAction(
  path: string,
  messages: CompMembershipActionMessages,
  state: CompMembershipActionState,
  formData: FormData,
): Promise<CompMembershipActionState> {
  try {
    return await runCompMembershipAction(state, formData, {...messages, mutate: async (input) => {
      const actor = await requireAdminActor();
      await adminMembershipRepository.comp(actor, input);
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/membership-comp-action.test.ts tests/unit/server-action-actor-boundary.test.ts`
Expected: PASS both. The boundary test discovers the new `"use server"` module and must
find no actor-taking export.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/membership-comp-action-core.ts lib/admin/membership-comp-actions.ts tests/unit/membership-comp-action.test.ts
git commit -m "feat(admin): server action boundary for comping a membership"
```

---

## Task 5: Comp form on the member detail page

**Files:**
- Create: `components/admin/membership-comp-form.tsx`
- Modify: `app/[locale]/(admin)/admin/members/[id]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Test: `tests/unit/membership-comp-form.test.tsx` (create)

Model the component on `components/admin/member-profile-form.tsx`, which the same page
already renders via `updateMemberProfileAction.bind(...)`.

- [ ] **Step 1: Add the strings**

In `messages/en.json`, inside the existing `Admin` object (alongside the member-profile
form's keys), add:

```json
"membershipComp": {
  "title": "Grant a membership",
  "description": "Creates an active membership without a payment — for a comp, a founding member, or a checkout that took money and never activated.",
  "planLabel": "Plan",
  "submit": "Grant membership",
  "success": "Membership granted.",
  "invalid": "Choose a plan before granting a membership.",
  "error": "The membership could not be granted."
}
```

In `messages/zh-HK.json`, at the identical path:

```json
"membershipComp": {
  "title": "授予會籍",
  "description": "毋須付款即建立生效會籍——適用於贈予會籍、創始會員，或已付款但未啟用的結帳。",
  "planLabel": "會籍級別",
  "submit": "授予會籍",
  "success": "會籍已授予。",
  "invalid": "請先選擇會籍級別。",
  "error": "無法授予會籍。"
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/membership-comp-form.test.tsx`:

```tsx
import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {MembershipCompForm} from "@/components/admin/membership-comp-form";

const labels = {
  title: "Grant a membership",
  description: "Creates an active membership without a payment.",
  planLabel: "Plan",
  submit: "Grant membership",
};

describe("MembershipCompForm", () => {
  it("offers every sellable plan and carries the profile it grants to", () => {
    render(<MembershipCompForm action={async () => ({})} labels={labels} profileId="p-1" />);

    expect(screen.getByRole("combobox", {name: "Plan"})).toBeInTheDocument();
    for (const plan of ["community", "startup", "corporate", "patron"]) {
      expect(screen.getByRole("option", {name: plan})).toBeInTheDocument();
    }
    // The target is submitted, never typed: a free-text profile id on a staff form is a
    // membership granted to whoever was pasted in by mistake.
    expect(screen.getByTestId("membership-comp-form").querySelector('input[name="profileId"]'))
      .toHaveAttribute("value", "p-1");
  });

  it("announces the outcome politely rather than silently", () => {
    render(<MembershipCompForm action={async () => ({})} labels={labels} profileId="p-1" state={{status: "success", message: "Membership granted."}} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Membership granted.");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/membership-comp-form.test.tsx`
Expected: FAIL — `Cannot find module '@/components/admin/membership-comp-form'`.

- [ ] **Step 4: Write the component**

Create `components/admin/membership-comp-form.tsx`:

```tsx
"use client";

import {useActionState} from "react";

import type {CompMembershipActionState} from "@/lib/admin/membership-comp-action-core";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

type Props = Readonly<{
  action: (state: CompMembershipActionState, formData: FormData) => Promise<CompMembershipActionState>;
  labels: Readonly<{title: string; description: string; planLabel: string; submit: string}>;
  profileId: string;
  state?: CompMembershipActionState;
}>;

export function MembershipCompForm({action, labels, profileId, state: initialState}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState ?? {});
  return (
    <section className="glass-card p-5 sm:p-7">
      <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{labels.description}</p>
      <form action={formAction} className="mt-4 space-y-4" data-testid="membership-comp-form">
        <input name="profileId" type="hidden" value={profileId} readOnly/>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="membership-comp-plan">{labels.planLabel}</label>
          <select className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="membership-comp-plan" name="planCode" required>
            {MEMBERSHIP_PLAN_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground" disabled={pending} type="submit">
          {labels.submit}
        </button>
        {state.message
          ? <p className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
          : null}
      </form>
    </section>
  );
}
```

- [ ] **Step 5: Wire it into the page**

In `app/[locale]/(admin)/admin/members/[id]/page.tsx`, add the imports:

```ts
import {MembershipCompForm} from "@/components/admin/membership-comp-form";
import {compMembershipAction} from "@/lib/admin/membership-comp-actions";
```

Then render it immediately after the existing `<MemberProfileForm …/>` block:

```tsx
      <MembershipCompForm
        action={compMembershipAction.bind(null, `/admin/members/${id}`, {
          successMessage: t("membershipComp.success"),
          validationMessage: t("membershipComp.invalid"),
          errorMessage: t("membershipComp.error"),
        })}
        labels={{
          title: t("membershipComp.title"),
          description: t("membershipComp.description"),
          planLabel: t("membershipComp.planLabel"),
          submit: t("membershipComp.submit"),
        }}
        profileId={id}
      />
```

The names are confirmed: the page destructures `const {locale: localeValue, id} = await params;`
(line 25) and builds `const t = await getTranslations({locale, namespace: "Admin"});`
(line 34). Because `t` is already scoped to `Admin`, `t("membershipComp.success")` resolves
the keys added in Step 1 — do not prefix them with `Admin.` again.

- [ ] **Step 6: Run the gate**

Run: `npx vitest run tests/unit/membership-comp-form.test.tsx tests/unit/messages.test.ts && npm run audit:strings && npm run typecheck`
Expected: PASS. `messages.test.ts` proves `en` / `zh-HK` parity; `audit:strings` proves no
unapproved visible literal was introduced.

- [ ] **Step 7: Commit**

```bash
git add components/admin/membership-comp-form.tsx "app/[locale]/(admin)/admin/members/[id]/page.tsx" messages/en.json messages/zh-HK.json tests/unit/membership-comp-form.test.tsx
git commit -m "feat(admin): grant a membership from the member detail page"
```

---

## Task 6: Full gate, PR, merge, promote

**Files:** none

- [ ] **Step 1: Run the whole gate**

```bash
npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: `audit:strings` passes; lint 0 errors (pre-existing warnings are fine);
typecheck silent; the unit suite green; the build prints the route manifest including
`ƒ Proxy (Middleware)`.

If a heavy render test times out on a loaded machine, re-run the full suite once before
treating it as a regression — this repo has a documented contention pattern, and
`vitest.config.ts` already carries a 20s `testTimeout` for it.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin HEAD
gh pr create --base main --title "Production activation: portal routing, comped memberships, retired diagnostics" --body "Implements docs/superpowers/plans/2026-09-12-production-activation.md tasks 1-5. Migrations and the production walk follow in tasks 7-8."
```

- [ ] **Step 3: Merge once CI is green**

```bash
gh pr checks <number> --watch
gh pr merge <number> --squash --delete-branch=false
```

- [ ] **Step 4: Promote to production**

Merging builds but does not promote — this project requires an explicit promote.

```bash
gh api repos/YNWAforever/hkwtia/commits/main --jq '.sha'
npx vercel promote <deployment-url> --scope ynwaforevers-projects --yes
```

Confirm the alias moved before continuing: the deployment behind `hkwtia.vercel.app` must
report the merge commit's `githubCommitSha`. **Ask the owner before promoting** — production
promotion is theirs to authorise.

---

## Task 7: Migrations

**Files:**
- Modify: `docs/integration/phase-c-whatsapp-go-live.md`

Read the spec's §5 before starting. Order is load-bearing and the checks are specific.

- [ ] **Step 1: Establish ground truth**

Do not infer migration state from the UI: `/members` returns 200 with an empty state
whether the schema is correct or the query is failing, because public pages degrade with
`.catch(() => [])` by design.

```bash
neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479
```

Then, against that connection string, read the applied set:

```sql
SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
```

Record which of `0028`–`0034` are already applied. This is the only authority — memory has
been wrong about it once already.

- [ ] **Step 2: Rehearse on a Neon branch**

```bash
neonctl branches create --project-id fragrant-mountain-25240574 --name activation-rehearsal-2026-09-12
neonctl connection-string activation-rehearsal-2026-09-12 --project-id fragrant-mountain-25240574
DATABASE_URL=<branch-connection-string> npm run db:migrate
```

The branch is cut from production, so it carries the real data shape rather than a seed's.

- [ ] **Step 3: Verify on the branch**

```sql
SELECT count(*) AS applied FROM drizzle.__drizzle_migrations;
SELECT count(*) AS templates, count(*) FILTER (WHERE status <> 'pending') AS not_pending FROM whatsapp_templates;
SELECT count(*) AS orphan_recipients FROM campaign_recipients WHERE profile_id IS NULL AND contact_id IS NULL;
SELECT public_profile_status, count(*) FROM companies GROUP BY 1;
SELECT count(*) FILTER (WHERE slug IS NULL) AS slugless FROM companies;
```

Expected: `templates` = **10** and `not_pending` = 0 (the go-live doc says 9 — that is
stale since #54 added `event_reminder_24h_zh_hk`); `orphan_recipients` = 0; every company
`hidden`; `slugless` = 0.

The "journal ends at idx 34" check is on the **file**, not the database —
`drizzle/meta/_journal.json` is the repo's own record of the migration set, so confirm it
there rather than querying for it:

```bash
node -e "const j=require('./drizzle/meta/_journal.json');console.log(Math.max(...j.entries.map(e=>e.idx)))"
```

Expected: `34`.

- [ ] **Step 4: Apply to production**

Apply `0028`–`0030` first if pending, then `0031`+`0032` **as one unit**, then
`0033`+`0034`. 0031 alone opens a second conversation per person on the first inbound
after deploy, splitting exactly the threads the inbox exists to unify.

```bash
DATABASE_URL=<production-connection-string> npm run db:migrate
```

**Ask the owner before running this.** Re-run every query from Step 3 against production
and paste both sets of output into the checklist created in Task 8.

- [ ] **Step 5: Correct the stale doc**

In `docs/integration/phase-c-whatsapp-go-live.md`, row 1: change the expected
`whatsapp_templates` count from **9** to **10**, and replace "there is no local database on
this branch, so 0033 and 0034 have never been executed anywhere" with a note that they were
applied on 2026-09-12, rehearsed on a Neon branch first.

- [ ] **Step 6: Commit**

```bash
git add docs/integration/phase-c-whatsapp-go-live.md
git commit -m "docs(go-live): correct the template count and record the migration run"
```

- [ ] **Step 7: Delete the rehearsal branch**

```bash
neonctl branches delete activation-rehearsal-2026-09-12 --project-id fragrant-mountain-25240574
```

---

## Task 8: The production walk

**Files:**
- Create: `docs/integration/2026-09-12-production-activation-checklist.md`

Follows the living-checklist shape of `docs/integration/phase-c-whatsapp-go-live.md`: one
row per item, status the only column that changes, rows never deleted.

- [ ] **Step 1: Create the checklist**

```markdown
# Production activation — walk record

Plan: `docs/superpowers/plans/2026-09-12-production-activation.md`.
Statuses: `pending` · `done` (with evidence) · `blocked` · `declined` (with a reason).

| # | Walk | Proof required | Status | Evidence |
|---|---|---|---|---|
| 1 | Staff signs in and lands on `/admin` | Four dashboard queues render real counts; no new runtime error group | pending | |
| 2 | Staff comps a membership to a second profile; that account signs in | `/portal` renders status and onboarding; the comp wrote a `membership.comped` audit row | pending | |
| 3 | A company profile is submitted and approved at `/admin/profiles-review` | The row appears on `/members` and `/members/[slug]` renders with JSON-LD | pending | |
| 4 | `/join` renders four plans; selecting one creates a Checkout session | Session visible in Stripe. Stops there — no charge (spec P-4) | pending | |

## Migration output

Branch rehearsal and production output from Task 7 Step 3/4 are pasted here verbatim.

## Deferred

- The paid leg: live charge and webhook activation (spec P-4).
- Phase C activation: `RUN_LIVE_WOZTELL`, Meta/Woztell approval, the PDPO retention answer.
```

- [ ] **Step 2: Walk 1 — staff to `/admin`**

Sign in at `/member-login` with a staff account and follow the magic link. Confirm the
landing is `/admin` (via the `/portal` bounce from Task 1) and that all four dashboard
queues render counts.

Then confirm nothing new is erroring:

```bash
# Vercel → project → Logs → Errors, last 1h, or the runtime-errors API
```

Expected: no new error group since the promote. Record the result in row 1.

- [ ] **Step 3: Walk 2 — comp a membership, then sign in as that member**

On `/admin/members/<second-profile-id>`, grant a `community` membership with the new form.
Verify the audit row:

```sql
SELECT action, target_type, target_id, metadata FROM audit_events
WHERE action = 'membership.comped' ORDER BY created_at DESC LIMIT 1;
```

Sign in as that second account and confirm `/portal` renders membership status and
onboarding rather than the error boundary. Record both in row 2.

- [ ] **Step 4: Walk 3 — prove the public surface with real data**

"`/members` loads" proves nothing — the empty state renders identically when the query
fails. Submit a company profile from `/portal/company` on the member account, approve it at
`/admin/profiles-review`, then confirm the row appears on `/members` and that
`/members/<slug>` renders with `Organization` JSON-LD in the page source. Record in row 3.

- [ ] **Step 5: Walk 4 — join funnel up to Checkout**

Open `/join`, confirm the four plans render, select one and confirm a Checkout session is
created (visible in the Stripe dashboard). **Stop there — do not complete payment.** Record
in row 4, and confirm the deferred section still names the charge and webhook leg.

- [ ] **Step 6: Commit the completed checklist**

```bash
git add docs/integration/2026-09-12-production-activation-checklist.md
git commit -m "docs(activation): record the production walk"
```

---

## Done

- Four walks recorded `done` with evidence.
- `#56`'s diagnostics retired, failure-only signal in place.
- `0028`–`0034` applied, both sets of verification output in the checklist.
- The go-live doc's template count reads 10.
