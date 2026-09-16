# Phase D-4d — Cancelling an event, and refunding its orders (Tasks 2–5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refund every paid order of a cancelled event with a retrying sweep, and let a cancelled event's page and pass explain what happened rather than 404ing.

**Architecture:** The cancel write (Task 1, already shipped) records the status and nothing else; a job sweeps the orders that are `paid` under a `cancelled` event and refunds each through D-4c's idempotent `refundOrder`, so the query itself is the work list and a failed run simply retries. A cancelled event stays reachable and unlisted, rendering a cancelled state with no way to register or pay.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle/Postgres (Neon), Stripe (SDK), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-phase-d4d-event-cancellation-design.md`

**Status of this file:** **Task 2 is complete below. Tasks 3, 4 and 5 are not yet written** — see the closing note. Task 1 shipped and was reviewed (commits `6b36b5df..c0632d1e`).

## Global Constraints

- **No migration and no schema change.** The sweep's work list is a query; the refund commit is conditional on `status = 'paid'`.
- **The job's authority is its own.** It refunds as `systemActor("event-cancellation")`; the audit records `actorType: "system"` with no user id. The widened actor type must **not** admit an anonymous actor.
- **A cancelled event's orders stay `paid` until each is refunded**, so they appear on the door list and in the Orders section while the sweep runs. Admission is prevented by the check-in's existing refusal, not by a new rule.
- **`refundOrder`'s outcomes are exhaustive**: `refunded`, `already_refunded`, `not_admissible`, `provider_failed`, `not_found`, `commit_failed`. A `provider_failed` or `commit_failed` leaves the order `paid` on purpose, so the next run retries it.
- **Every user-visible string lives in `messages/en.json` and `messages/zh-HK.json`, in parity**; run `npm run audit:strings`. A `.ts` file's literals are invisible to it — D-4c shipped that defect once.
- Conventional commits. Run before hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

### Task 2: The actor widening and the sweep job

**Files:**
- Modify: `lib/auth/authorize.ts`, `lib/tickets/refund-core.ts`, `lib/db/repos/event-orders.ts`, `lib/jobs/kinds.ts`, `lib/jobs/runners.ts`, `workers/src/index.ts` (the schedule)
- Create: `lib/jobs/limits.ts` (the batch bound, moved out of `runners.ts` to break the import cycle), `lib/jobs/event-cancellation-refunds.ts`, `app/api/jobs/event-cancellation-refunds/route.ts`
- Test: `tests/unit/event-cancellation-refunds-job.test.ts` (create), `tests/unit/refund-core.test.ts` (extend), `tests/unit/event-orders-cancellation-refund-query.test.ts` (create, the predicate pin), `workers/tests/worker.test.ts` (extend, the schedule coverage)

**Interfaces:**
- Consumes: `eventOrdersRepository.ordersAwaitingCancellationRefund(limit)`, `refundOrder(actor, {orderId, note})` (D-4c), `systemActor(source)`, `RUNNER_BATCH_LIMIT` (existing, 100), `createJobPost({kind, bucket, run})`.
- Produces: `runProductionEventCancellationRefunds(now)`, `jobRunners.eventCancellationRefunds(now)`, `PHASE_D_JOB_KIND.EVENT_CANCELLATION_REFUNDS`, and a widened `refundOrder` actor parameter.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/event-cancellation-refunds-job.test.ts`, driving the runner with an injected repository and a fake Stripe seam (do not call the network):

```ts
import {describe, expect, it, vi} from "vitest";

import {runEventCancellationRefunds, type EventCancellationRefundDependencies} from "@/lib/jobs/event-cancellation-refunds";

const now = new Date("2026-09-16T04:00:00Z");

function harness(overrides: Partial<EventCancellationRefundDependencies> = {}) {
  const orders = [
    {orderId: "cancelled-paid-1", eventId: "ev-cancelled"},
    {orderId: "cancelled-paid-2", eventId: "ev-cancelled"},
  ];
  const refundOrder = vi.fn(async (_actor, input: {orderId: string}) =>
    input.orderId === "cancelled-paid-2" ? {status: "provider_failed" as const} : {status: "refunded" as const});
  return {
    dependencies: {
      listOrders: vi.fn(async () => orders),
      refundOrder,
      ...overrides,
    },
    refundOrder,
  };
}

describe("the event-cancellation refund sweep", () => {
  it("refunds every still-paid order it is given, and reports what happened", async () => {
    const {dependencies, refundOrder} = harness();
    const result = await runEventCancellationRefunds(now, dependencies);
    expect(refundOrder).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({scanned: 2, refunded: 1, failed: 1});
  });

  it("refunds as the system actor, so the audit cannot name a person", async () => {
    const {dependencies, refundOrder} = harness();
    await runEventCancellationRefunds(now, dependencies);
    const [actor] = refundOrder.mock.calls[0]!;
    expect(actor).toEqual({kind: "system", userId: null, source: "event-cancellation"});
  });

  it("leaves a provider failure for the next run rather than recording a refund", async () => {
    const {dependencies, refundOrder} = harness();
    await runEventCancellationRefunds(now, dependencies);
    // The sweep reports it and moves on: nothing here may throw, or one bad
    // order would stop the whole batch.
    expect(refundOrder).toHaveBeenCalledTimes(2);
  });

  it("bounds the batch, so one run cannot walk an unbounded backlog", async () => {
    const listOrders = vi.fn(async () => []);
    await runEventCancellationRefunds(now, {listOrders, refundOrder: vi.fn()});
    expect(listOrders).toHaveBeenCalledWith(100);
  });

  it("counts an already-refunded order without calling it a failure", async () => {
    const {dependencies} = harness({refundOrder: vi.fn(async () => ({status: "already_refunded" as const}))});
    const result = await runEventCancellationRefunds(now, dependencies);
    expect(result).toMatchObject({refunded: 0, alreadyRefunded: 2, failed: 0});
  });
});
```

Also extend `tests/unit/refund-core.test.ts` with the property the widening must not lose: an anonymous actor cannot refund — `refundOrder({kind: "anonymous"} as never, {orderId})` is refused by the type, and, if any runtime guard exists, by it too.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/event-cancellation-refunds-job.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/jobs/event-cancellation-refunds"`.

- [ ] **Step 3: Implement**

**a. Widen the system actor** in `lib/auth/authorize.ts`:

```ts
/**
 * The authority an automated writer acts under. The source is a closed union so
 * a new automated writer is a reviewed change rather than a string, and the
 * audit records it instead of a person.
 */
export function systemActor(source: "stripe-webhook" | "event-cancellation"): Actor {
  return {kind: "system", userId: null, source};
}
```

**b. Widen `refundOrder`'s actor** in `lib/tickets/refund-core.ts` — it must admit the system actor and still refuse an anonymous one:

```ts
type RefundActor = AdminActor | Extract<Actor, {kind: "system"}>;

export async function refundOrder(
  actor: RefundActor,
  input: Readonly<{orderId: string; note?: string | null}>,
  dependencies: RefundDependencies = defaultDependencies(),
): Promise<RefundResult> {
```

The audit call already passes `actorUserId: actor.userId` and `actorType: actor.kind`; a system actor's `userId` is `null`, which the audit column allows, and its `kind` is `"system"`.

**c. Add the sweep's read** to `lib/db/repos/event-orders.ts`, as a transaction member and a public method:

```ts
  /** Orders still owed a refund because their event was cancelled. */
  ordersAwaitingCancellationRefund: (limit: number) => Promise<readonly Readonly<{orderId: string; eventId: string}>[]>;
```

```ts
    ordersAwaitingCancellationRefund: async (limit) => rows<{orderId: string; eventId: string}>(await tx.execute(sql`
      SELECT o.id AS "orderId", o.event_id AS "eventId"
      FROM ${eventOrders} o JOIN ${events} e ON e.id = o.event_id
      WHERE o.status = 'paid' AND e.status = 'cancelled'
      ORDER BY o.paid_at ASC NULLS LAST, o.id ASC
      LIMIT ${limit}
    `)),
```

```ts
    /**
     * The sweep's work list. A query rather than a queue: the predicate is the
     * work, so a missed run catches up and nothing has to be enqueued.
     */
    async ordersAwaitingCancellationRefund(limit: number): Promise<readonly Readonly<{orderId: string; eventId: string}>[]> {
      return runTransaction((tx) => tx.ordersAwaitingCancellationRefund(limit));
    },
```

**d. The runner**, in a module of its own so the job does not have to import the whole runner registry — `lib/jobs/event-cancellation-refunds.ts`:

```ts
import "server-only";

import {systemActor} from "@/lib/auth/authorize";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {RUNNER_BATCH_LIMIT} from "@/lib/jobs/runners";
import {refundOrder, type RefundResult} from "@/lib/tickets/refund-core";

export type EventCancellationRefundDependencies = Readonly<{
  listOrders: (limit: number) => Promise<readonly Readonly<{orderId: string; eventId: string}>[]>;
  refundOrder: (actor: ReturnType<typeof systemActor>, input: Readonly<{orderId: string; note?: string | null}>) => Promise<RefundResult>;
}>;

export type EventCancellationRefundSummary = Readonly<{
  scanned: number; refunded: number; alreadyRefunded: number; failed: number;
}>;

/**
 * Refund every order still owed money because its event was cancelled.
 *
 * Nothing here throws for a single order's failure: a provider refusal leaves
 * that order `paid`, which is exactly what makes the next run retry it. Throwing
 * would abort the batch and strand the orders behind the one that failed.
 */
export async function runEventCancellationRefunds(
  now: Date,
  dependencies: EventCancellationRefundDependencies = {
    listOrders: (limit) => eventOrdersRepository.ordersAwaitingCancellationRefund(limit),
    refundOrder: (actor, input) => refundOrder(actor, input),
  },
): Promise<EventCancellationRefundSummary> {
  const orders = await dependencies.listOrders(RUNNER_BATCH_LIMIT);
  const actor = systemActor("event-cancellation");
  let refunded = 0;
  let alreadyRefunded = 0;
  let failed = 0;

  for (const order of orders) {
    const result = await dependencies.refundOrder(actor, {orderId: order.orderId, note: "Event cancelled"});
    if (result.status === "refunded") refunded += 1;
    else if (result.status === "already_refunded") alreadyRefunded += 1;
    else if (result.status !== "not_found") failed += 1;
  }

  return {scanned: orders.length, refunded, alreadyRefunded, failed};
}
```

`RUNNER_BATCH_LIMIT` is currently a module-private const in `lib/jobs/runners.ts`. Export it there (one word) rather than duplicating the number, because the batch bound is a single policy.

**e. Register the runner** in `lib/jobs/runners.ts` — add `runEventCancellationRefunds` to `ProductionRunnerOverrides`, resolve it like its siblings, and expose it:

```ts
  runEventCancellationRefunds:
    overrides.runEventCancellationRefunds ?? runProductionEventCancellationRefunds;
```

```ts
    eventCancellationRefunds(now: Date) {
      return runEventCancellationRefunds(now);
    },
```

with

```ts
export function runProductionEventCancellationRefunds(now: Date): Promise<EventCancellationRefundSummary> {
  return runEventCancellationRefunds(now);
}
```

**First, break the cycle.** The runner module needs the batch bound, and `runners.ts` will import the runner — so importing `RUNNER_BATCH_LIMIT` from `runners.ts` would be a cycle. Move the constant to a leaf module and re-export it:

```ts
// lib/jobs/limits.ts
/**
 * How many items one runner pass may process. A bound, not a target: it keeps a
 * single run proportional and lets the next run continue the backlog.
 */
export const RUNNER_BATCH_LIMIT = 100;
```

`lib/jobs/runners.ts` then imports it from `lib/jobs/limits.ts` instead of declaring it, and keeps any existing re-export so its callers are unaffected. `lib/jobs/event-cancellation-refunds.ts` imports it from `lib/jobs/limits.ts`.

**f. The job kind, in a group of its own** — `lib/jobs/kinds.ts`:

```ts
/**
 * A group of its own, for the reason PHASE_C_JOB_KIND records: a member added to
 * `M3_AUTOMATION_JOB_KINDS` is interpolated into `jobs_automation_recent_idx`'s
 * partial predicate, so the next generated migration emits an unintended DROP
 * INDEX / CREATE INDEX and two contract tests go red for a reason unrelated to
 * this job.
 */
export const PHASE_D_JOB_KIND = {
  EVENT_CANCELLATION_REFUNDS: "event-cancellation-refunds",
} as const;

export const PHASE_D_JOB_KINDS = [PHASE_D_JOB_KIND.EVENT_CANCELLATION_REFUNDS] as const;

export type PhaseDJobKind = typeof PHASE_D_JOB_KINDS[number];
```

Check `createJobPost`'s `kind` parameter type in `lib/jobs/handler.ts`; if it is narrower than "any job kind", widen it to admit `PhaseDJobKind` alongside the existing groups and report the change.

**g. The route** — `app/api/jobs/event-cancellation-refunds/route.ts`:

```ts
import {createJobPost} from "@/lib/jobs/handler";
import {PHASE_D_JOB_KIND} from "@/lib/jobs/kinds";
import {jobRunners} from "@/lib/jobs/runners";

export const POST = createJobPost({
  kind: PHASE_D_JOB_KIND.EVENT_CANCELLATION_REFUNDS,
  bucket: "hourly",
  run: ({now}) => jobRunners.eventCancellationRefunds(now),
});
```

If the repo pins its job routes in an inventory or a discovery test (the way admin routes and protected routes are pinned), add this route there with the reason recorded rather than letting a test fail with no explanation.

- [ ] **Step 3h: schedule the job in the Worker, or it is not live**

**A job route is not live until the Worker schedules it.** `workers/src/index.ts` is the only scheduler — there is no `vercel.json` and no workflow hitting `/api/jobs` — so a route the Worker does not know is dead code, and the sweep's headline promise is silently inert however complete its tests look. This is exactly how Task 2 first shipped: the route, the runner and the repository all worked and nothing ever invoked them.

Add `"event-cancellation-refunds"` to the Worker's `WORKER_JOBS`, to the hourly cron group in `JOBS_BY_CRON` (a query sweep belongs beside the other hourly recovery jobs), and to `REQUEST_TIMEOUT_BY_JOB`. The `0 * * * *` cron already exists in `workers/wrangler.toml`, so no trigger changes — and `workers/tests/worker.test.ts` now asserts that every declared `WorkerJob` is scheduled on a cron, and that the scheduled crons match Wrangler's `[triggers] crons`, so the next job cannot ship without one.

Extend `workers/tests/worker.test.ts`'s hourly job list and its per-job call-count assertions for the fourth hourly job.

Run: `npx vitest run` in `workers/`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/event-cancellation-refunds-job.test.ts tests/unit/refund-core.test.ts && npm run typecheck && npm run lint`
Expected: PASS, typecheck silent, lint unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/authorize.ts lib/tickets/refund-core.ts lib/db/repos/event-orders.ts lib/jobs "app/api/jobs/event-cancellation-refunds" tests/unit/event-cancellation-refunds-job.test.ts tests/unit/refund-core.test.ts
git commit -m "feat(jobs): sweep cancelled events and refund their paid orders"
```

---

## Not yet written

**Tasks 3, 4 and 5 are not in this file yet.** They are:

3. **The cancelled public state** — the detail read admits `published` or `cancelled` and projects a flag; the page renders the notice, the event's details and the refund-policy link with **no** registration control, is `noindex`, and publishes `EventCancelled`; the listing keeps excluding it.
4. **The pass page's discriminated result** — `passForSeat` returns `active | cancelled | unavailable` instead of `null`, so the pass page can say the event was cancelled while `unavailable` still 404s.
5. **The gated walk and the full gate** — cancel the seeded event, assert the costed confirmation, the public cancelled state, the listing exclusion and the pass page's cancelled state; then the five gate commands.

Do not begin one of these from this file: it does not yet contain their code, and a half-written plan is worse than none. The spec's §5.4, §5.5 and §8, plus `.superpowers/sdd/d4d-handoff.md`, are the requirements for them.
