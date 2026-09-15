# Phase D-4c — Refunds by staff, and the refund policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff refund a whole ticket order with one confirmation, and publish a refund policy that buyers see before paying and keep afterwards.

**Architecture:** A `refund-core` service with injected dependencies calls the payment provider **first** using the deterministic `ticket-refund:<orderId>` key, then commits `refunded` with a *conditional* update plus an audit row in one transaction — so a provider failure writes nothing and a retry is idempotent. A new Orders read feeds a section on the admin event page; the policy is a public page whose text lives in a staff-editable message namespace.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Drizzle/Postgres (Neon), Stripe (SDK), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-phase-d4c-refunds-and-policy-design.md`

**Base:** this branch is based on `origin/feat/phase-d4a-ticket-checkout` (`e5fb3cc7`), which carries D-4a **and** D-4b. D-4c depends on D-4b (a refunded order stops being admittable through code D-4b wrote), and D-4b is not yet on `main`.

## Global Constraints

- **No migration and no schema change.** `event_refund_reason` already carries `staff`; every column exists.
- **Refunds are whole-order only.** No partial refunds, and no refund of an order that is not `paid`.
- **`refund_reason` is always `staff`.** Never `cancelled`: D-4b's hand-off records that the webhook treats `cancelled` as its own to re-issue.
- **Provider first, then commit.** A provider failure writes nothing; the order stays `paid` and the action is retryable.
- **Refunds are staff-only**, and the actor boundary holds: a `"use server"` module exports only formData-shaped wrappers plus types, and the actor is resolved inside it (`tests/unit/server-action-actor-boundary.test.ts` discovers violations).
- **A refunded order's seats stop being admittable everywhere** — the door list, the pass page and the check-in already refuse anything not `paid`. Do not add a second rule.
- **Every user-visible string lives in `messages/en.json` and `messages/zh-HK.json`, in parity**; run `npm run audit:strings`.
- Mail is transactional through the email transport and `lib/email/catalog.ts`. A **missing template variable is swallowed by the error handler**, so the variable-completeness test is the only thing that can see it.
- Conventional commits. Run before hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `lib/tickets/refund-core.ts` | The refund service: read the order, refuse what cannot be refunded, call the provider, commit conditionally. One job: turn an order id into one of five outcomes. |
| `lib/tickets/refund-actions.ts` | The `"use server"` formData wrapper. Nothing else exported. |
| `components/admin/orders-table.tsx` | The Orders section: rows, statuses, and the two-step refund confirmation. |
| `app/[locale]/(public)/refund-policy/page.tsx` | The public policy page, mirroring `/privacy`. |
| `scripts/seed-d4c.ts` | Not needed — the walk reuses `db:seed:d4b`'s paid order. |
| Tests | `tests/unit/refund-core.test.ts`, `tests/unit/refund-actions.test.ts`, `tests/unit/event-orders-list.test.ts`, `tests/unit/refund-refund-commit.test.ts`, `tests/unit/orders-table.test.tsx`, `tests/unit/refund-policy-page.test.tsx`, `tests/unit/refund-policy-links.test.tsx`, `tests/e2e/phase-d4c-refunds.spec.ts` |

**Modify**

| File | Change |
|---|---|
| `lib/db/repos/event-orders.ts` | `orderById`, `listEventOrders`, `refundPaidOrder` (conditional + audit in one transaction), and the `EventOrderRow` type. |
| `lib/billing/stripe.ts` | `paymentIntentForSession(sessionId)` — a staff refund has no webhook payload carrying the intent, and `event_orders` stores only the session id. |
| `lib/admin/event-actions.ts` | Bind the refund action. |
| `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx` | Render the Orders section for a ticketed event. |
| `components/marketing/ticket-checkout-form.tsx` | The policy link beside the price/CTA. |
| `lib/billing/ticket-webhook-processor.ts` | Supply `{refundPolicyUrl}` to the receipt. |
| `messages/en.json`, `messages/zh-HK.json` | The `RefundPolicy` namespace, `Common.breadcrumbRefundPolicy`, the orders labels, the form's link label, and the receipt sentence. |
| `config/public-routes.ts`, `lib/seo/route-breadcrumbs.ts`, `lib/i18n/page-copy-scope.ts` | Register the route, its breadcrumb label, and the editable namespace. |

---

### Task 1: The order reads and the conditional refund commit

**Files:**
- Modify: `lib/db/repos/event-orders.ts`
- Test: `tests/unit/event-orders-list.test.ts`, `tests/unit/refund-refund-commit.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EventOrderRow`, and `orderById(orderId)`, `listEventOrders(eventId)`, `refundPaidOrder(orderId, {refundedAt, actorUserId, actorType, note})` on both `EventOrdersTransaction` and the repository.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/event-orders-list.test.ts` with a scripted `execute` (the same seam `tests/unit/event-attendees-ticket-rows.test.ts` uses — read that file first for the fake's shape), asserting:

- `listEventOrders` maps snake_case rows to `EventOrderRow` and folds the order through `orderFrom`, so `order.eventId` is defined;
- it returns each order's `seatCount` and `seatNames` from the joined aggregate;
- an order with no seats yields `seatCount: 0` and `seatNames: []` rather than throwing;
- the event id reaches the SQL (assert the generated SQL contains `event_id = $1` — the door-list review found a test that never checked its filter).

Create `tests/unit/refund-refund-commit.test.ts` asserting:

- `refundPaidOrder` returns `true` when the conditional update matched a row, and writes `event.order.refunded` with `{reason: "staff", note}` in the **same transaction**;
- it returns `false` and writes **no audit row** when the update matched nothing (an order that is not `paid`);
- the UPDATE's `WHERE` includes both the id and `status = 'paid'` (assert the generated SQL), because that conjunction is what makes a double refund impossible.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/event-orders-list.test.ts tests/unit/refund-refund-commit.test.ts`
Expected: FAIL — `listEventOrders is not a function`.

- [ ] **Step 3: Implement**

Add to `EventOrdersTransaction` in `lib/db/repos/event-orders.ts`:

```ts
  orderById: (orderId: string) => Promise<OrderRecord | null>;
  /** Every order of an event with its seats, newest paid first. */
  listEventOrders: (eventId: string) => Promise<readonly EventOrderRow[]>;
  /**
   * The refund commit: moves the row only while it is still `paid`, and writes
   * the audit row in the same transaction. `false` means someone else got there
   * first, which is a result rather than an error.
   */
  refundPaidOrder: (orderId: string, input: Readonly<{refundedAt: Date; actorUserId: string | null; actorType: string; note: string | null}>) => Promise<boolean>;
```

Add the exported row type beside `OrderRecord`:

```ts
export type EventOrderRow = Readonly<{
  order: OrderRecord;
  seatCount: number;
  seatNames: readonly string[];
}>;
```

Add the three implementations inside the default transaction, beside `markStatus`:

```ts
    orderById: async (orderId) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE id = ${orderId} LIMIT 1`))[0];
      return row ? orderFrom(row) : null;
    },
    listEventOrders: async (eventId) => rows<Record<string, unknown>>(await tx.execute(sql`
      SELECT o.*, COALESCE(seats.seat_names, ARRAY[]::text[]) AS seat_names, COALESCE(seats.seat_count, 0) AS seat_count
      FROM ${eventOrders} o
      LEFT JOIN (
        SELECT order_id, array_agg(attendee_name ORDER BY position ASC) AS seat_names, count(*)::int AS seat_count
        FROM ${eventOrderSeats} GROUP BY order_id
      ) seats ON seats.order_id = o.id
      WHERE event_id = ${eventId}
      ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC
    `)).map((row) => ({
      order: orderFrom(row),
      seatCount: Number(row.seat_count),
      seatNames: Array.isArray(row.seat_names) ? (row.seat_names as string[]) : [],
    })),
    refundPaidOrder: async (orderId, input) => {
      // `AND status = 'paid'` is the whole guard: two staff clicking at once
      // produce one transition because the second UPDATE matches no row.
      const updated = rows<{id: string}>(await tx.execute(sql`
        UPDATE ${eventOrders}
        SET status = 'refunded', refunded_at = ${input.refundedAt}, refund_reason = 'staff', updated_at = NOW()
        WHERE id = ${orderId} AND status = 'paid'
        RETURNING id
      `));
      if (updated.length === 0) return false;
      await tx.insertAudit({
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        action: "event.order.refunded",
        targetType: "event_order",
        targetId: orderId,
        metadata: {reason: "staff", note: input.note},
      });
      return true;
    },
```

Add the public methods on the repository, beside `seatsOfOrder`:

```ts
    /** One order, for the refund path. */
    async orderById(orderId: string): Promise<OrderRecord | null> {
      return runTransaction((tx) => tx.orderById(orderId));
    },

    /** Every order of an event, for the admin Orders section. */
    async listEventOrders(eventId: string): Promise<readonly EventOrderRow[]> {
      return runTransaction((tx) => tx.listEventOrders(eventId));
    },

    /**
     * The conditional refund commit. `false` means the order was not `paid` when
     * the statement ran, so the caller reports "already refunded" rather than
     * claiming a refund it did not make.
     */
    async refundPaidOrder(orderId: string, input: Readonly<{refundedAt: Date; actorUserId: string | null; actorType: string; note: string | null}>): Promise<boolean> {
      return runTransaction((tx) => tx.refundPaidOrder(orderId, input));
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/event-orders-list.test.ts tests/unit/refund-refund-commit.test.ts tests/unit/event-orders-repository.test.ts && npm run typecheck`
Expected: PASS, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/event-orders.ts tests/unit/event-orders-list.test.ts tests/unit/refund-refund-commit.test.ts
git commit -m "feat(db): read an event's orders, and commit a refund conditionally"
```

---

### Task 2: The refund service

**Files:**
- Modify: `lib/billing/stripe.ts` (the session read)
- Create: `lib/tickets/refund-core.ts`
- Test: `tests/unit/refund-core.test.ts` (create)

**Interfaces:**
- Consumes: `orderById`, `refundPaidOrder` (Task 1); `refundPaymentIntent(paymentIntentId, idempotencyKey)` (D-4a).
- Produces: `refundOrder(actor, {orderId, note}, dependencies?)`, `RefundResult`, `RefundDependencies`, and `paymentIntentForSession(sessionId)` on the Stripe adapter.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/refund-core.test.ts`, driving the real service with fakes:

```ts
import {describe, expect, it, vi} from "vitest";

import {refundOrder, type RefundDependencies} from "@/lib/tickets/refund-core";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};
const orderId = "b1a2c3d4-1111-4222-8333-944455566677";

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId, eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d", buyerProfileId: null,
    buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en" as const,
    amountHkdCents: 50_000, currency: "hkd", status: "paid" as const,
    stripeCheckoutSessionId: "cs_test_1", stripeCheckoutUrl: "https://checkout.stripe.test/1",
    idempotencyKey: "idem-1", expiresAt: new Date("2026-09-16T10:30:00Z"),
    paidAt: new Date("2026-09-16T10:00:00Z"), refundedAt: null, refundReason: null,
    ...overrides,
  };
}

function dependencies(overrides: Partial<RefundDependencies> = {}): RefundDependencies {
  return {
    orders: {
      orderById: vi.fn(async () => order()),
      refundPaidOrder: vi.fn(async () => true),
    },
    stripe: {
      paymentIntentForSession: vi.fn(async () => "pi_1"),
      refundPaymentIntent: vi.fn(async () => undefined),
    },
    now: () => new Date("2026-09-16T12:00:00Z"),
    ...overrides,
  };
}
```

Cover, one case each:
- a `paid` order whose provider accepts returns `refunded`, calls `refundPaymentIntent` with `("pi_1", "ticket-refund:" + orderId)`, and commits with `refundReason`-free input plus `note`;
- an order that is not `paid` returns `not_admissible` and **never calls the provider**;
- an order already `refunded` returns `already_refunded` and never calls the provider;
- an unknown order returns `not_found`;
- **a provider that throws returns `provider_failed` and `refundPaidOrder` was never called** — this is the ordering, asserted on behaviour;
- a conditional commit that returns `false` (someone else won) yields `already_refunded`;
- a session with no payment intent (`paymentIntentForSession` returns `null`) returns `provider_failed` without a refund attempt.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/refund-core.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/tickets/refund-core"`.

- [ ] **Step 3: Implement**

First extend the Stripe adapter in `lib/billing/stripe.ts`. A staff refund has no webhook payload, and the order stores only the checkout session id, so the intent is read back from the session:

```ts
  checkout: {sessions: {
    create(params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    retrieve(id: string): Promise<Pick<Stripe.Checkout.Session, "payment_intent">>;
  }};
```

Add to `StripeBillingAdapter`:

```ts
  /** The intent to refund for a settled session; `null` when the session has none. */
  paymentIntentForSession(sessionId: string): Promise<string | null>;
```

and implement it in `createStripeBillingAdapter`:

```ts
    async paymentIntentForSession(sessionId) {
      const session = await client.checkout.sessions.retrieve(sessionId);
      const intent = session.payment_intent;
      // Stripe returns either the id or the expanded object.
      return typeof intent === "string" ? intent : intent?.id ?? null;
    },
```

Then create `lib/tickets/refund-core.ts`:

```ts
import "server-only";

import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {eventOrdersRepository, type EventOrdersRepository} from "@/lib/db/repos/event-orders";
import type {AdminActor} from "@/lib/membership/lifecycle";

export type RefundResult =
  | Readonly<{status: "refunded"}>
  | Readonly<{status: "already_refunded"}>
  | Readonly<{status: "not_admissible"}>
  | Readonly<{status: "provider_failed"}>
  | Readonly<{status: "not_found"}>;

export type RefundDependencies = Readonly<{
  orders: Pick<EventOrdersRepository, "orderById" | "refundPaidOrder">;
  stripe: Pick<StripeBillingAdapter, "paymentIntentForSession" | "refundPaymentIntent">;
  now: () => Date;
}>;

function defaultDependencies(): RefundDependencies {
  return {orders: eventOrdersRepository, stripe: stripeBillingAdapter(), now: () => new Date()};
}

/**
 * Refund one whole order. The provider is called BEFORE anything is written, so
 * a refusal leaves the order `paid` and the action retryable; the deterministic
 * key makes that retry safe even if the provider succeeded and our commit did
 * not, because the provider returns the same refund rather than a second one.
 */
export async function refundOrder(
  actor: AdminActor,
  input: Readonly<{orderId: string; note?: string | null}>,
  dependencies: RefundDependencies = defaultDependencies(),
): Promise<RefundResult> {
  const order = await dependencies.orders.orderById(input.orderId);
  if (!order) return {status: "not_found"};
  if (order.status === "refunded") return {status: "already_refunded"};
  if (order.status !== "paid") return {status: "not_admissible"};
  if (!order.stripeCheckoutSessionId) return {status: "provider_failed"};

  let paymentIntentId: string | null;
  try {
    paymentIntentId = await dependencies.stripe.paymentIntentForSession(order.stripeCheckoutSessionId);
  } catch {
    // A read that failed is not a refund that failed, but the caller cannot tell
    // them apart, and claiming nothing happened is the honest answer either way.
    return {status: "provider_failed"};
  }
  if (!paymentIntentId) return {status: "provider_failed"};

  try {
    await dependencies.stripe.refundPaymentIntent(paymentIntentId, `ticket-refund:${order.id}`);
  } catch {
    return {status: "provider_failed"};
  }

  const committed = await dependencies.orders.refundPaidOrder(order.id, {
    refundedAt: dependencies.now(),
    actorUserId: actor.userId,
    actorType: actor.kind,
    note: input.note ?? null,
  });
  return committed ? {status: "refunded"} : {status: "already_refunded"};
}
```

`AdminActor` is the type `requireAdminActor()` returns; if the repo's exported name differs, use the type the sibling services use and report the adjustment.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/refund-core.test.ts tests/unit/stripe-ticket-adapter.test.ts && npm run typecheck`
Expected: PASS, typecheck silent. The existing adapter tests must still pass — the `StripeClient` type widened by one method, so any test double implementing it needs `paymentIntentForSession` added; report every file you touched for that.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/stripe.ts lib/tickets/refund-core.ts tests/unit/refund-core.test.ts tests/helpers tests/unit/stripe-ticket-adapter.test.ts
git commit -m "feat(tickets): refund a whole order, provider first"
```

---

### Task 3: The refund action and the Orders section

**Files:**
- Create: `lib/tickets/refund-actions.ts`, `components/admin/orders-table.tsx`
- Modify: `lib/admin/event-actions.ts`, `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`, both bundles
- Test: `tests/unit/refund-actions.test.ts`, `tests/unit/orders-table.test.tsx` (create)

**Interfaces:**
- Consumes: `refundOrder`, `RefundResult` (Task 2); `listEventOrders`, `EventOrderRow` (Task 1).
- Produces: `submitRefundOrderAction(eventPath, messages, previous, formData)` (bound by the page to its own path and locale, mirroring `createEventAction` and `submitSeatCheckInAction`); `RefundOutcomeMessages`; `OrdersTable({action, rows, labels})`; the `Admin.eventsMgmt.orders.*` labels, including `refundOutcomes`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/refund-actions.test.ts` asserts:
- the module exports only the formData wrapper plus its state type (compare `Object.keys` of the module namespace to the allowed set — the actor-boundary test's shape);
- without a staff session it refuses and never calls `refundOrder`;
- a `paid` order returns the success state and revalidates the event page;
- each of `already_refunded`, `not_admissible`, `provider_failed` and `not_found` maps to its **own** message **from the set the caller bound in**, with `provider_failed`'s text saying nothing was charged back — and a zh-HK set is reported in Chinese, so a regression to a hard-coded English literal fails;
- it parses the seat id as a uuid and rejects a malformed one without calling the service;
- an untouched note input (`""`) reaches the service as no note, not as an empty string.

`tests/unit/orders-table.test.tsx` asserts:
- an order row renders the buyer, the seat names, the amount and the status label;
- a `paid` row offers the refund control; a `refunded` row does not and shows the refunded date;
- the control is two-step: the confirmation names the buyer, the seat names and the amount, and only that step submits;
- every status the repository can emit has a label (assert the label map covers `pending`, `paid`, `expired`, `failed`, `refunded`) — a missing one renders a placeholder, which is the trap D-4b's review caught.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/refund-actions.test.ts tests/unit/orders-table.test.tsx`
Expected: FAIL — `Failed to resolve import`.

- [ ] **Step 3: Implement**

Create `lib/tickets/refund-actions.ts` with a single exported wrapper. The five outcome strings arrive as a bound argument, exactly as `submitSeatCheckInAction` receives its `SeatCheckInMessages`: a hard-coded English literal here would sit in a `.ts` module the visible-string audit never scans, so a zh-HK staff member would read English for every refund result.

```ts
"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireAdminActor} from "@/lib/auth/actor";
import {refundOrder, type RefundResult} from "@/lib/tickets/refund-core";

export type RefundOrderState = Readonly<{status: "idle"} | {status: "ok"; message: string} | {status: "error"; message: string}>;

export type RefundOutcomeMessages = Readonly<{
  refunded: string;
  alreadyRefunded: string;
  notAdmissible: string;
  providerFailed: string;
  notFound: string;
}>;

const refundInput = z.object({orderId: z.string().uuid(), note: z.string().trim().max(500).optional()}).strict();

const messageKey: Readonly<Record<RefundResult["status"], keyof RefundOutcomeMessages>> = {
  refunded: "refunded",
  already_refunded: "alreadyRefunded",
  not_admissible: "notAdmissible",
  provider_failed: "providerFailed",
  not_found: "notFound",
};

/** An untouched note input submits `""`, which means "no note" -- `null` in the audit row. */
function noteFrom(formData: FormData): string | undefined {
  const value = formData.get("note");
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function submitRefundOrderAction(eventPath: string, messages: RefundOutcomeMessages, _previous: RefundOrderState, formData: FormData): Promise<RefundOrderState> {
  const actor = await requireAdminActor();
  const parsed = refundInput.safeParse({orderId: formData.get("orderId"), note: noteFrom(formData)});
  if (!parsed.success) return {status: "error", message: messages.notFound};
  const result = await refundOrder(actor, parsed.data);
  // Revalidate only when something changed: a refusal leaves the page correct.
  if (result.status === "refunded" || result.status === "already_refunded") revalidatePath(eventPath);
  return result.status === "refunded"
    ? {status: "ok", message: messages.refunded}
    : {status: "error", message: messages[messageKey[result.status]]};
}
```

The page resolves the messages from `Admin.eventsMgmt.orders.refundOutcomes` and binds them: `const refundAction = submitRefundOrderAction.bind(null, eventPath, refundMessages);`, where `eventPath` is the internal path the page already computes for its other bound actions. `OrdersTable` receives `refundAction` as `action` and passes it to `useActionState`, which produces the `dispatch` the form action uses.

Create `components/admin/orders-table.tsx` as a client component with `useActionState`, rendering the rows and a two-step confirm:

```tsx
"use client";

import {useActionState, useState} from "react";

// Type-only: the action itself arrives as a prop, bound by the page.
import type {RefundOrderState} from "@/lib/tickets/refund-actions";
import type {EventOrderRow} from "@/lib/db/repos/event-orders";

export type OrdersLabels = Readonly<{
  caption: string; buyer: string; seats: string; amount: string; status: string; refundedOn: string;
  refund: string; confirm: string; cancel: string; note: string; statuses: Readonly<Record<string, string>>;
}>;

const initial: RefundOrderState = {status: "idle"};

function amountLabel(cents: number): string {
  return new Intl.NumberFormat("en-HK", {style: "currency", currency: "HKD"}).format(cents / 100);
}

/**
 * `action` is the page's bound server action, so the table never has to know the
 * revalidation path. It is already a Server Function reference, which is what a
 * client component may hold; a locally-defined closure would not be.
 */
export function OrdersTable({action, rows, labels}: Readonly<{action: (state: RefundOrderState, formData: FormData) => Promise<RefundOrderState>; rows: readonly EventOrderRow[]; labels: OrdersLabels}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.caption}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">{labels.caption}</caption>
        <thead><tr>
          <th scope="col">{labels.buyer}</th><th scope="col">{labels.seats}</th>
          <th scope="col">{labels.amount}</th><th scope="col">{labels.status}</th><th scope="col"/>
        </tr></thead>
        <tbody>
          {rows.map(({order, seatCount, seatNames}) => {
            // The row's seat cell and the confirmation must name the same seats, so
            // the summarising `+N` is part of the one string both render.
            const seatsText = seatNames.join(", ") + (seatCount > seatNames.length ? ` +${seatCount - seatNames.length}` : "");
            return (
            <tr key={order.id}>
              <td>{order.buyerName}</td>
              <td>{seatsText}</td>
              <td>{amountLabel(order.amountHkdCents)}</td>
              <td>{labels.statuses[order.status] ?? order.status}</td>
              <td>
                {order.status === "refunded" ? (
                  <span className="text-muted-foreground">{labels.refundedOn} {order.refundedAt?.toISOString().slice(0, 10)}</span>
                ) : order.status === "paid" ? (
                  confirming === order.id ? (
                    <form action={dispatch} className="space-y-2">
                      <input name="orderId" type="hidden" value={order.id}/>
                      {/* Function replacements: a name containing `$&` or `$'` is inserted literally. */}
                      <p role="status">{labels.confirm
                        .replace("{buyer}", () => order.buyerName)
                        .replace("{seats}", () => seatsText)
                        .replace("{amount}", () => amountLabel(order.amountHkdCents))}</p>
                      <label>{labels.note}<input className="ml-2 rounded-md border p-1" name="note" type="text"/></label>
                      <button className="min-h-11 rounded-md bg-destructive px-4 text-destructive-foreground" disabled={pending} type="submit">{labels.refund}</button>
                      <button className="ml-2 min-h-11 rounded-md border px-4" onClick={() => setConfirming(null)} type="button">{labels.cancel}</button>
                    </form>
                  ) : (
                    <button className="min-h-11 rounded-md border px-4" onClick={() => setConfirming(order.id)} type="button">{labels.refund}</button>
                  )
                ) : null}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {state.status !== "idle" ? <p className="mt-3 text-sm" role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </div>
  );
}
```

Add `Admin.eventsMgmt.orders` to both bundles in parity — `heading` and `unavailable` (used by the page), the table's own `caption`, `buyer`, `seats`, `amount`, `status`, `refundedOn`, `refund`, `confirm`, `cancel`, `note`, `statuses.{pending,paid,expired,failed,refunded}` (five statuses, because a missing one renders a placeholder), and `refundOutcomes.{refunded,alreadyRefunded,notAdmissible,providerFailed,notFound}` — the action's outcome copy, which the page resolves and binds in so no refund result is shown in the wrong language. The `providerFailed` copy must say nothing was charged back.

Render it in `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx` for a ticketed event, above the attendees section, with a read failure rendered as an error rather than an empty section:

```tsx
  // Only a ticketed event can have orders, so the read is skipped elsewhere. A
  // failed read is `null`, never `[]`: an unreachable table must not look like
  // an event nobody bought.
  const orders = event.registrationMode === "ticketed"
    ? await eventOrdersRepository.listEventOrders(event.id).catch(() => null)
    : [];
```

and render

```tsx
      {event.registrationMode === "ticketed" ? (
        <section className="glass-card p-6">
          <h2 className="font-serif text-2xl font-semibold">{tOrders("heading")}</h2>
          {orders === null ? <p role="alert">{tOrders("unavailable")}</p> : <OrdersTable action={refundAction} labels={ordersLabels} rows={orders}/>}
        </section>
      ) : null}
```

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run tests/unit/refund-actions.test.ts tests/unit/orders-table.test.tsx tests/unit/server-action-actor-boundary.test.ts && npm run audit:strings && npm run typecheck && npm run lint`
Expected: PASS, boundary green, audit clean, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/refund-actions.ts components/admin/orders-table.tsx lib/admin/event-actions.ts "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx" tests/unit/refund-actions.test.ts tests/unit/orders-table.test.tsx messages
git commit -m "feat(admin): refund a whole order from the event page"
```

---

### Task 4: The refund-policy page

**Files:**
- Create: `app/[locale]/(public)/refund-policy/page.tsx`
- Modify: `config/public-routes.ts`, `lib/seo/route-breadcrumbs.ts`, `lib/i18n/page-copy-scope.ts`, both bundles
- Test: `tests/unit/refund-policy-page.test.tsx` (create)

**Interfaces:**
- Consumes: `PageHero`, `PolicySections`/`parsePolicySections`, `buildPageMetadata`, `routeBreadcrumbItems`, `buildBreadcrumbData` — all already used by `/privacy`.
- Produces: the route `/[locale]/refund-policy`, the `RefundPolicy` namespace, and `Common.breadcrumbRefundPolicy`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/refund-policy-page.test.tsx` asserting:
- the `RefundPolicy` namespace exists in **both** bundles with the same key set (`metaTitle`, `metaDescription`, `eyebrow`, `title`, `description`, `breadcrumbCurrent`, `sections`);
- `sections` parses through `parsePolicySections` into at least four sections, each with a heading — and that the cancellation section's body mentions refunding a cancelled event in full (the promise §4.5 makes, asserted so it cannot be quietly dropped);
- `/refund-policy` is in `publicRoutes` and has an entry in `ROUTE_BREADCRUMB_LABEL_KEYS` pointing at a key that exists in both bundles;
- `RefundPolicy` is in `pageCopyNamespaces`.

`tests/unit/route-breadcrumbs.test.ts` already holds the map equal to `publicRoutes`; run it and let it fail first if the entry is missing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/refund-policy-page.test.tsx tests/unit/route-breadcrumbs.test.ts`
Expected: FAIL — the route and namespace do not exist.

- [ ] **Step 3: Implement**

Create `app/[locale]/(public)/refund-policy/page.tsx`, mirroring `app/[locale]/(public)/privacy/page.tsx` line for line with the namespace and pathname swapped:

```tsx
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {parsePolicySections, PolicySections} from "@/components/marketing/policy-sections";
import {StructuredData} from "@/components/seo/structured-data";
import {PageHero} from "@/components/wt/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "RefundPolicy"});
  return buildPageMetadata({locale: locale as AppLocale, pathname: "/refund-policy", title: t("metaTitle"), description: t("metaDescription")});
}

export default async function RefundPolicyPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common, tRoot] = await Promise.all([
    getTranslations({locale, namespace: "RefundPolicy"}),
    getTranslations({locale, namespace: "Common"}),
    getTranslations({locale}),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("description")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <PolicySections sections={parsePolicySections(t.raw("sections"))} />
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale as AppLocale, "/refund-policy", tRoot))} />
    </>
  );
}
```

Add `'/refund-policy'` to `publicRoutes` in `config/public-routes.ts`, beside `'/privacy'`.

Add to `ROUTE_BREADCRUMB_LABEL_KEYS` in `lib/seo/route-breadcrumbs.ts`:

```ts
  "/refund-policy": "Common.breadcrumbRefundPolicy",
```

Add `"RefundPolicy"` to `pageCopyNamespaces` in `lib/i18n/page-copy-scope.ts`, beside `"Privacy"` — the comment there already explains that policy pages are in scope while product UI is not.

Add the copy to both bundles. English:

```json
"RefundPolicy": {
  "metaTitle": "Refund policy",
  "metaDescription": "How and when WTIA refunds a paid ticket order, and what happens if we cancel an event.",
  "eyebrow": "Policy",
  "title": "Refund policy",
  "description": "How we handle refunds for paid event tickets.",
  "breadcrumbCurrent": "Refund policy",
  "sections": [
    {"heading": "When we refund", "body": ["We refund a whole order, not an individual seat. If a seat in your order cannot be used, the whole order is refunded.", "Refunds are at WTIA's discretion and considered on request. We look at the circumstances and at how close to the event you asked."], "items": []},
    {"heading": "If we cancel an event", "body": ["If WTIA cancels an event, every paid order is refunded in full."], "items": []},
    {"heading": "How and when", "body": ["Refunds go back to the payment method you used. Once we issue it, the time it takes to appear depends on your bank, and is usually a few business days."], "items": []},
    {"heading": "How to ask", "body": ["Contact us with your order reference, or reply to your confirmation email."], "items": []}
  ]
}
```

and `"breadcrumbRefundPolicy": "Refund policy"` inside the existing `Common` namespace. Add the zh-HK equivalents at the identical paths in parity, with the cancellation sentence stating the same promise (every paid order refunded in full when WTIA cancels).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/refund-policy-page.test.tsx tests/unit/route-breadcrumbs.test.ts tests/unit/page-copy-scope.test.ts && npm run audit:strings && npm run typecheck`
Expected: PASS, audit clean. If a page-copy test enumerates the namespaces, it needs the new entry — add it and report.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(public)/refund-policy" config/public-routes.ts lib/seo/route-breadcrumbs.ts lib/i18n/page-copy-scope.ts messages tests/unit/refund-policy-page.test.tsx
git commit -m "feat(public): a refund policy, editable by staff"
```

---

### Task 5: The two links

**Files:**
- Modify: `components/marketing/ticket-checkout-form.tsx`, `app/[locale]/(public)/events/[slug]/page.tsx`, `lib/billing/ticket-webhook-processor.ts`, both bundles, the email snapshot
- Test: `tests/unit/refund-policy-links.test.tsx` (create), `tests/unit/ticket-webhook.test.ts` (extend)

**Interfaces:**
- Consumes: `localizedPath`; the `Ticket` namespace (D-4a); `sendTicketEmail`'s `variables` (D-4b).
- Produces: `refundPolicyHref` on `TicketCheckoutForm`; `{refundPolicyUrl}` in the confirmation copy.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/refund-policy-links.test.tsx` asserting:
- `TicketCheckoutForm` renders an anchor whose `href` is the localized refund-policy path it was given, and that the label comes from the `Ticket` namespace (not a literal);
- `Ticket.refundPolicy` exists in both bundles.

Extend `tests/unit/ticket-webhook.test.ts`'s existing "every placeholder the receipt copy uses" case so its expected key set includes `refundPolicyUrl` — and so that dropping it fails. That assertion is the only guard for a placeholder whose absence the error handler swallows.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/refund-policy-links.test.tsx tests/unit/ticket-webhook.test.ts`
Expected: FAIL — the label key and the variable do not exist.

- [ ] **Step 3: Implement**

Add `refundPolicyHref: string` to `TicketCheckoutForm`'s props and `refundPolicy: string` to `TicketCheckoutLabels`, and render the link beside the price:

```tsx
      <p className="text-sm text-muted-foreground">{pricePerSeat}</p>
      <p className="text-sm"><Link className="underline" href={refundPolicyHref}>{labels.refundPolicy}</Link></p>
```

The event page passes it:

```tsx
                  refundPolicyHref={localizedPath(appLocale, "/refund-policy")}
```

Extend the receipt copy in both bundles — English:

```json
"body": "Thank you. We received HK${amount} for {seatCount} seat(s): {attendees}. The event is on {eventDate}. Each attendee will receive their own pass in a separate email. Refunds are covered by our refund policy: {refundPolicyUrl}"
```

and the zh-HK equivalent at the same path, in parity.

Supply it in `lib/billing/ticket-webhook-processor.ts` inside the `event_ticket_confirmation` arm of `sendTicketEmail`'s `variables`:

```ts
        refundPolicyUrl: `${dependencies.appUrl}${localizedPath(order.buyerLocale, "/refund-policy")}`,
```

- [ ] **Step 4: Update the snapshot and run the tests**

Run: `npx vitest run tests/unit/email-render-snapshots.test.tsx -u && npx vitest run tests/unit/email-render-snapshots.test.tsx tests/unit/ticket-webhook.test.ts tests/unit/refund-policy-links.test.tsx tests/unit/ticket-checkout-form.test.tsx && npm run audit:strings`
Expected: the snapshot gains exactly the changed receipt body in both locales — read the diff before committing — then PASS and audit clean.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/ticket-checkout-form.tsx "app/[locale]/(public)/events/[slug]/page.tsx" lib/billing/ticket-webhook-processor.ts messages tests
git commit -m "feat(tickets): link the refund policy from checkout and the receipt"
```

---

### Task 6: The acceptance walk and the full gate

**Files:**
- Create: `tests/e2e/phase-d4c-refunds.spec.ts`
- Test: itself

**Interfaces:**
- Consumes: everything above; D-4b's `db:seed:d4b` fixture (a paid order with two named seats).
- Produces: the slice's acceptance evidence.

- [ ] **Step 1: Write the walk**

Create `tests/e2e/phase-d4c-refunds.spec.ts`, gated exactly like `tests/e2e/phase-d4b-passes-and-check-in.spec.ts` (`missingM2LiveEnvironment()` **and** `D4B_ACCEPTANCE_SEED === "true"`, because it reuses that fixture), asserting the sentence end to end in both locales:

1. sign in as staff and open the seeded event's page;
2. the Orders section shows the seeded order as `paid`, naming both attendees and the amount;
3. refund it through the two-step confirmation;
4. the row becomes `refunded` with a date and no refund control;
5. the door list no longer carries those two seats — the consequence a refund is supposed to have;
6. the pass URL from D-4b now 404s, which is the other half of that consequence.

The refund **email** is not asserted here: the walk cannot read a mailbox, and the receipt/refund send is covered at unit level. Say so in the test's comment rather than leaving the gap implicit.

- [ ] **Step 2: Run the walk and confirm it skips**

Run: `npm run test:e2e -- tests/e2e/phase-d4c-refunds.spec.ts`
Expected: the cases SKIP, naming the missing environment facts. A skip must never be reported as a pass; if Playwright is unavailable, say so instead of claiming a result.

- [ ] **Step 3: Run the full gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase-d4c-refunds.spec.ts
git commit -m "test(e2e): refund an order end to end, and watch the seats go"
```

---

## Verification checklist

Against the spec's §10:

| # | Done when | Task |
|---|---|---|
| 1 | Staff can refund a whole order with one confirmation naming the buyer, the seats and the amount | 2, 3, 6 |
| 2 | A provider failure writes nothing and says so; a second refund reports already refunded without a second audit row | 1, 2, 3 |
| 3 | A refunded order's seats stop being admittable everywhere | 1, 2, 6 |
| 4 | The policy page is public, in the sitemap, staff-editable, and linked from the checkout and the receipt | 4, 5 |
| 5 | The five gate commands are green, with no migration | 6 |

Not in scope: partial refunds, buyer self-service refunds, refunding anything that is not a whole ticket order, multi-currency, reversing a refund, and the event-cancellation action with its automatic refunds (D-4d).

