# Phase D-4a — Ticket checkout and orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff price a ticketed event, and let a member or guest buy named seats for it through Stripe Checkout, with the webhook settling the order and an oversold order refunded automatically.

**Architecture:** A new `event_orders` / `event_order_seats` pair beside the RSVP tables, with the ticket price on `events`. Seat holds are derived (a pending order's unexpired seats count), the capacity decision is taken under the same `SELECT … FOR UPDATE` the RSVP lane uses, and the webhook re-checks it at payment so a race is lost to a refund rather than to an oversell. The Stripe adapter gains a payment-mode session and a refund; the webhook gains one branch discriminated by `metadata.kind`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Drizzle/Postgres (Neon), Stripe (SDK), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-phase-d4a-ticket-checkout-design.md`

## Global Constraints

- **Staff-authorised only.** Only staff-created events may be `ticketed`, and only staff set the price; a member event form must not offer the mode and the repository must refuse a price on a non-ticketed event.
- **Money is integer HKD cents** (`amount_hkd_cents`; Stripe `unit_amount` is the same integer). No float is ever a price, and a client-supplied amount is never read.
- **Holds are derived, never counted.** `heldSeats` is a read over seat rows joined to orders that are `paid` or `pending`-and-unexpired; there is no counter column.
- **The webhook is the only writer that marks an order paid**, and it re-checks capacity under the event row lock, excluding the order's own seats.
- The ticket mail uses the email transport and `lib/email/catalog.ts` templates — **not** `lib/notifications/dispatch.ts`, whose gate is a marketing classifier.
- Append-only audit: every order status transition writes an `audit_events` row in the same transaction.
- The amount is HKD only. Member forms keep `rsvp`/`external`.
- Conventional commits. Run before hand-off: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`.

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `lib/db/repos/event-orders.ts` | Transaction-scoped order/seat repository: the lock, the derived hold count, the inserts, the transitions, the audit. |
| `lib/tickets/checkout-core.ts` | Validate the event and seats, compute the amount, create the order and the Stripe session. |
| `lib/tickets/checkout-actions.ts` | `"use server"` wrapper: rate limit, parse the form, resolve the actor, delegate. |
| `components/marketing/ticket-checkout-form.tsx` | The public buyer form: buyer, seat count, attendee rows. |
| `tests/unit/event-orders-repository.test.ts`, `tests/unit/ticket-checkout-core.test.ts`, `tests/unit/ticket-checkout-actions.test.ts`, `tests/unit/ticket-checkout-form.test.tsx`, `tests/unit/stripe-ticket-adapter.test.ts`, `tests/unit/ticket-webhook.test.ts`, `tests/unit/ticket-schema-contract.test.ts` | Task tests. |
| the generated `drizzle/00NN_phase_d4a_event_orders.sql` (+ meta) | Schema. |

**Modify**

| File | Change |
|---|---|
| `lib/db/schema-core.ts` | Ticket price on `events`; the two enums; the two tables; the checks. |
| `lib/email/catalog.ts`, `messages/en.json`, `messages/zh-HK.json`, `tests/unit/email-catalog.test.ts`, `tests/unit/email-render-snapshots.test.tsx` (+ its snapshot) | The two ticket templates. |
| `lib/billing/stripe.ts` | `createEventTicketSession`, `refundPaymentIntent`. |
| `lib/billing/webhook-service.ts`, `lib/api/stripe-webhook-route.ts` | The ticket branch and its processor. |
| `app/[locale]/(public)/events/[slug]/page.tsx` | Render the ticket form for a ticketed event. |
| `lib/admin/event-form-input.ts`, `lib/admin/event-action-core.ts`, `app/[locale]/(admin)/admin/events-mgmt` | The staff `ticketed` mode and price. |
| `config/tickets.ts` (create) | The seat cap and the hold window. |

---

### Task 1: The ticket schema

**Files:**
- Modify: `lib/db/schema-core.ts`
- Create: the generated `drizzle/00NN_phase_d4a_event_orders.sql` (+ meta)
- Test: `tests/unit/ticket-schema-contract.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `eventOrderStatusEnum`, `eventRefundReasonEnum`, `eventOrders`, `eventOrderSeats`; `events.ticketPriceHkdCents`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-schema-contract.test.ts`:

```ts
import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {eventOrderSeats, eventOrders, eventOrderStatusEnum, eventRefundReasonEnum, events} from "@/lib/db/schema-core";

describe("phase D-4a ticket schema contract", () => {
  it("defines the order status and refund reason vocabularies", () => {
    expect(eventOrderStatusEnum.enumValues).toEqual(["pending", "paid", "expired", "failed", "refunded"]);
    expect(eventRefundReasonEnum.enumValues).toEqual(["oversold", "staff", "cancelled"]);
  });

  it("carries the price on the event and the money in integer cents", () => {
    expect(events.ticketPriceHkdCents).toBeDefined();
    expect(eventOrders.amountHkdCents.getSQLType()).toBe("integer");
    expect(eventOrders.currency.default).toBe("hkd");
  });

  // A ticketed event with no price would sell a free seat through a paid lane; a
  // price on a non-ticketed event would be money nobody can pay.
  it("requires a positive price exactly when the event is ticketed", () => {
    const checks = getTableConfig(events).checks.map((check) => check.name);
    expect(checks).toContain("events_ticketed_price_check");
  });

  it("keeps one seat position per order and links seats to the order", () => {
    const indexes = getTableConfig(eventOrderSeats).indexes.map((index) => index.config.name);
    expect(indexes).toContain("event_order_seats_position_unique");
    expect(eventOrderSeats.orderId.notNull).toBe(true);
    expect(eventOrderSeats.position.notNull).toBe(true);
  });

  it("gives the order one session and one idempotency key", () => {
    const unique = getTableConfig(eventOrders).indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.name);
    expect(unique).toContain("event_orders_session_unique");
    expect(unique).toContain("event_orders_idempotency_unique");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/ticket-schema-contract.test.ts`
Expected: FAIL — `eventOrders` is undefined.

- [ ] **Step 3: Add the schema**

In `lib/db/schema-core.ts`, add beside the other enums (near line 135):

```ts
export const eventOrderStatusEnum = pgEnum("event_order_status", ["pending", "paid", "expired", "failed", "refunded"]);
export const eventRefundReasonEnum = pgEnum("event_refund_reason", ["oversold", "staff", "cancelled"]);
```

Add the price to `events` (inside the column object, after `externalRegistrationUrl`):

```ts
  // Programme D-4a: the ticket price in HKD cents, staff-set. Integer because a
  // price must never be a float, and Stripe's `unit_amount` is the same integer.
  ticketPriceHkdCents: integer("ticket_price_hkd_cents"),
```

Add the check to `events`'s table extras (beside `events_external_registration_check`):

```ts
  check("events_ticketed_price_check", sql`${table.registrationMode} <> 'ticketed' OR (${table.ticketPriceHkdCents} IS NOT NULL AND ${table.ticketPriceHkdCents} > 0)`),
```

Add the two tables after `eventRegistrations` (around line 891):

```ts
export const eventOrders = pgTable("event_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, {onDelete: "cascade"}),
  buyerProfileId: text("buyer_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  buyerName: text("buyer_name").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  amountHkdCents: integer("amount_hkd_cents").notNull(),
  currency: text("currency").default("hkd").notNull(),
  status: eventOrderStatusEnum("status").default("pending").notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  expiresAt: timestamp("expires_at", {withTimezone: true}).notNull(),
  paidAt: timestamp("paid_at", {withTimezone: true}),
  refundedAt: timestamp("refunded_at", {withTimezone: true}),
  refundReason: eventRefundReasonEnum("refund_reason"),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  uniqueIndex("event_orders_session_unique").on(table.stripeCheckoutSessionId).where(sql`${table.stripeCheckoutSessionId} IS NOT NULL`),
  uniqueIndex("event_orders_idempotency_unique").on(table.idempotencyKey),
  index("event_orders_event_status_idx").on(table.eventId, table.status),
  check("event_orders_amount_check", sql`${table.amountHkdCents} > 0`),
]);

export const eventOrderSeats = pgTable("event_order_seats", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => eventOrders.id, {onDelete: "cascade"}),
  position: integer("position").notNull(),
  attendeeName: text("attendee_name").notNull(),
  attendeeEmail: text("attendee_email").notNull(),
  // D-4b's check-in writes this; D-4a leaves it null.
  checkedInAt: timestamp("checked_in_at", {withTimezone: true}),
  createdAt: createdAt("created_at"),
}, (table) => [
  uniqueIndex("event_order_seats_position_unique").on(table.orderId, table.position),
]);
```

Then generate the migration:

```bash
npx drizzle-kit generate --config=drizzle.config.ts --name phase_d4a_event_orders
```

Confirm the SQL creates the two enums, the two tables, the column, the two unique indexes and the two checks, and that it does not *alter* an existing enum (creating a new type and defaulting to it in one migration is safe; `ALTER TYPE … ADD VALUE` is the trap).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/ticket-schema-contract.test.ts tests/unit/schema-contract.test.ts && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema-core.ts drizzle tests/unit/ticket-schema-contract.test.ts
git commit -m "feat(db): event orders and named seats, with a staff-set price"
```

---

### Task 2: The ticket emails

**Files:**
- Modify: `lib/email/catalog.ts`, `messages/en.json`, `messages/zh-HK.json`, `tests/unit/email-catalog.test.ts`, `tests/unit/email-render-snapshots.test.tsx` (+ its snapshot)
- Test: the two catalog tests above

**Interfaces:**
- Consumes: nothing.
- Produces: the template ids `event_ticket_confirmation` and `event_ticket_refunded`, renderable through `renderEmail({template, locale, recipientName, classification, variables})`.

- [ ] **Step 1: Update the catalog test first (RED)**

In `tests/unit/email-catalog.test.ts`, the `REQUIRED_TEMPLATE_IDS` list and the count assertion must include the two new ids: change `expect(new Set(EMAIL_TEMPLATE_IDS).size).toBe(25)` to `26` and add `"event_ticket_confirmation"`, `"event_ticket_refunded"` to the expected list the test compares `EMAIL_TEMPLATE_IDS` against.

In `tests/unit/email-render-snapshots.test.tsx`, add both ids to its `FIXTURE_VARIABLES` map with the variables their copy uses (see Step 3): `{eventTitle, eventDate, seatCount, amount, orderId, ctaUrl}` for the confirmation and `{eventTitle, amount, orderId, ctaUrl}` for the refund.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx`
Expected: FAIL — an unknown template id.

- [ ] **Step 3: Add the templates**

In `lib/email/catalog.ts`, extend `EMAIL_TEMPLATE_IDS`:

```ts
  "event_guest_confirmation",
  "event_reminder_24h",
  "event_ticket_confirmation",
  "event_ticket_refunded",
] as const;
```

and `DEFAULT_CLASSIFICATION`:

```ts
  // Ticket receipts (Phase D-4a): replies to the buyer's own purchase, so
  // transactional and never given a marketing footer.
  event_ticket_confirmation: "transactional",
  event_ticket_refunded: "transactional",
} as const satisfies Record<EmailTemplateId, MessageClassification>;
```

In `messages/en.json`, inside `Email.templates`:

```json
      "event_ticket_confirmation": {
        "subject": "Your tickets for {eventTitle}",
        "preview": "Order {orderId} confirmed, {seatCount} seat(s).",
        "heading": "You're going to {eventTitle}",
        "body": "Thank you. We received HK${amount} for {seatCount} seat(s). The event is on {eventDate}. Each attendee will receive their own pass in a separate email.",
        "cta": "View the event"
      },
      "event_ticket_refunded": {
        "subject": "Your refund for {eventTitle}",
        "preview": "Order {orderId} has been refunded.",
        "heading": "Your payment has been returned",
        "body": "We have refunded HK${amount} for order {orderId} ({eventTitle}). Depending on your bank, it can take a few days to appear.",
        "cta": "View the event"
      },
```

In `messages/zh-HK.json`, at the identical path:

```json
      "event_ticket_confirmation": {
        "subject": "{eventTitle} 的門票",
        "preview": "訂單 {orderId} 已確認，共 {seatCount} 個座位。",
        "heading": "你將參加 {eventTitle}",
        "body": "多謝支持。我們已收到 HK${amount}，共 {seatCount} 個座位。活動日期為 {eventDate}。每位出席者將另函收到專屬門票。",
        "cta": "查看活動"
      },
      "event_ticket_refunded": {
        "subject": "{eventTitle} 的退款",
        "preview": "訂單 {orderId} 已退款。",
        "heading": "款項已退回",
        "body": "我們已就訂單 {orderId}（{eventTitle}）退回 HK${amount}。視乎銀行處理，款項可能需要數天才顯示。",
        "cta": "查看活動"
      },
```

- [ ] **Step 4: Update the snapshot and run the tests**

Run: `npx vitest run tests/unit/email-render-snapshots.test.tsx -u && npx vitest run tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx && npm run audit:strings`
Expected: the snapshot gains exactly the two new entries (read the diff before committing), then PASS, and the audit clean.

- [ ] **Step 5: Commit**

```bash
git add lib/email/catalog.ts messages/en.json messages/zh-HK.json tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/__snapshots__
git commit -m "feat(email): a ticket receipt and a refund notice"
```

---

### Task 3: The Stripe ticket session and refund

**Files:**
- Modify: `lib/billing/stripe.ts`
- Test: `tests/unit/stripe-ticket-adapter.test.ts` (create)

**Interfaces:**
- Consumes: the existing `StripeBillingAdapter`.
- Produces: `StripeBillingAdapter.createEventTicketSession(input): Promise<{id: string; url: string}>` and `refundPaymentIntent(paymentIntentId: string): Promise<void>`, where `input` is `{eventTitle, amountHkdCents, seats, orderId, successUrl, cancelUrl, idempotencyKey, expiresAt: Date}`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/stripe-ticket-adapter.test.ts`:

```ts
import {describe, expect, it, vi} from "vitest";

import {createStripeBillingAdapter} from "@/lib/billing/stripe";

function client() {
  const create = vi.fn(async (_params: unknown, _options?: unknown) => ({id: "cs_test_1", url: "https://checkout.stripe.test/1"}));
  const refund = vi.fn(async () => ({}));
  return {
    create, refund,
    value: {
      checkout: {sessions: {create}},
      billingPortal: {sessions: {create: vi.fn()}},
      invoices: {list: vi.fn()},
      refunds: {create: refund},
    } as never,
  };
}

describe("event ticket checkout session", () => {
  it("is a payment-mode session for the event's price, in HKD cents", async () => {
    const {create, value} = client();
    await createStripeBillingAdapter(value).createEventTicketSession({
      eventTitle: "Edge AI workshop", amountHkdCents: 25_000, seats: 2, orderId: "order-1",
      successUrl: "https://w.test/s", cancelUrl: "https://w.test/c", idempotencyKey: "idem-1",
      expiresAt: new Date("2026-09-14T10:00:00Z"),
    });

    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.mode).toBe("payment");
    expect(params.client_reference_id).toBe("order-1");
    expect(params.metadata).toEqual({kind: "event_ticket", orderId: "order-1"});
    expect(params.expires_at).toBe(Math.floor(Date.parse("2026-09-14T10:00:00Z") / 1000));
    expect(params.line_items).toEqual([{
      price_data: {currency: "hkd", unit_amount: 25_000, product_data: {name: "Edge AI workshop"}},
      quantity: 2,
    }]);
    expect((create.mock.calls[0]![1] as {idempotencyKey: string}).idempotencyKey).toBe("idem-1");
  });

  it("refunds the payment intent behind a session", async () => {
    const {refund, value} = client();
    await createStripeBillingAdapter(value).refundPaymentIntent("pi_1");
    expect(refund).toHaveBeenCalledWith({payment_intent: "pi_1"});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/stripe-ticket-adapter.test.ts`
Expected: FAIL — `createEventTicketSession is not a function`.

- [ ] **Step 3: Implement**

In `lib/billing/stripe.ts`, add the input type:

```ts
export type EventTicketSessionInput = Readonly<{
  eventTitle: string;
  amountHkdCents: number;
  seats: number;
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  expiresAt: Date;
}>;
```

Extend the interface:

```ts
export interface StripeBillingAdapter {
  createCheckoutSession(input: CheckoutSessionInput): Promise<{id: string; url: string}>;
  createEventTicketSession(input: EventTicketSessionInput): Promise<{id: string; url: string}>;
  refundPaymentIntent(paymentIntentId: string): Promise<void>;
  createBillingPortalSession(input: PortalSessionInput): Promise<{url: string}>;
  listInvoices(customerId: string): Promise<InvoiceRecord[]>;
}
```

Extend the `StripeClient` type with `refunds: {create(params: {payment_intent: string}): Promise<unknown>}`.

Implement both methods in `createStripeBillingAdapter`:

```ts
    async createEventTicketSession(input) {
      const session = await client.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "hkd",
            unit_amount: input.amountHkdCents,
            product_data: {name: input.eventTitle},
          },
          quantity: input.seats,
        }],
        client_reference_id: input.orderId,
        // The kind discriminator is how the webhook tells a ticket from a
        // membership; the order id is the only other thing it trusts.
        metadata: {kind: "event_ticket", orderId: input.orderId},
        // Stripe's clock and ours agree on the hold, so an abandoned checkout
        // releases its seats at the same instant `heldSeats` stops counting them.
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }, {idempotencyKey: input.idempotencyKey});
      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return {id: session.id, url: session.url};
    },

    async refundPaymentIntent(paymentIntentId) {
      await client.refunds.create({payment_intent: paymentIntentId});
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/stripe-ticket-adapter.test.ts && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/stripe.ts tests/unit/stripe-ticket-adapter.test.ts
git commit -m "feat(billing): a payment-mode session for event tickets, and a refund"
```

---

### Task 4: The order repository

**Files:**
- Create: `lib/db/repos/event-orders.ts`, `config/tickets.ts`
- Test: `tests/unit/event-orders-repository.test.ts` (create)

**Interfaces:**
- Consumes: `eventOrders`, `eventOrderSeats`, `events`, `auditEvents`.
- Produces:
  - `config/tickets.ts`: `MAX_TICKET_SEATS = 10`, `TICKET_HOLD_MS = 30 * 60_000`.
  - `createEventOrdersRepository(loadTransaction?): EventOrdersRepository` with `createOrder(input)`, `attachSession(orderId, sessionId)`, `settlePaid(sessionId, now)`, `expireBySession(sessionId)`, `heldSeats(eventId, now)`.
  - Types: `OrderRecord`, `SeatInput`, `CreateOrderResult`, `SettleResult`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/event-orders-repository.test.ts`, injecting a fake transaction:

```ts
import {describe, expect, it, vi} from "vitest";

import {createEventOrdersRepository, type EventOrdersTransaction, type LockedEvent, type OrderRecord} from "@/lib/db/repos/event-orders";

const now = new Date("2026-09-14T04:00:00Z");
const event: LockedEvent = {id: "ev-1", capacity: 2, published: true, startsAt: new Date("2026-10-01T10:00:00Z"), endsAt: null, registrationMode: "ticketed", ticketPriceHkdCents: 25_000};

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {id: "order-1", eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", amountHkdCents: 25_000, currency: "hkd", status: "pending", stripeCheckoutSessionId: null, idempotencyKey: "idem-1", expiresAt: new Date(now.getTime() + 1_800_000), paidAt: null, refundedAt: null, refundReason: null, ...overrides};
}

function transaction(overrides: Partial<EventOrdersTransaction> = {}): EventOrdersTransaction {
  return {
    lockEvent: vi.fn(async () => event),
    orderByIdempotencyKey: vi.fn(async () => null),
    orderBySessionId: vi.fn(async () => null),
    seatCount: vi.fn(async () => 0),
    seatsOfOrder: vi.fn(async () => 1),
    heldSeats: vi.fn(async () => 0),
    insertOrder: vi.fn(async () => order()),
    insertSeats: vi.fn(async () => undefined),
    attachSession: vi.fn(async () => undefined),
    markStatus: vi.fn(async () => undefined),
    insertAudit: vi.fn(async () => undefined),
    ...overrides,
  };
}

const seats = [{name: "Ada", email: "ada@example.test"}];

describe("eventOrdersRepository.createOrder", () => {
  it("writes a pending order and its seats when capacity allows", async () => {
    const tx = transaction();
    const result = await createEventOrdersRepository(async () => tx).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now});

    expect(result).toMatchObject({ok: true, reused: false});
    expect(tx.insertOrder).toHaveBeenCalledOnce();
    expect(tx.insertSeats).toHaveBeenCalledWith("order-1", seats);
  });

  it("refuses when the held seats plus this order exceed capacity", async () => {
    const tx = transaction({heldSeats: vi.fn(async () => 2)});
    await expect(createEventOrdersRepository(async () => tx).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toEqual({ok: false, reason: "SOLD_OUT"});
    expect(tx.insertOrder).not.toHaveBeenCalled();
  });

  it("treats an unlimited event as never sold out", async () => {
    const tx = transaction({lockEvent: vi.fn(async () => ({...event, capacity: null})), heldSeats: vi.fn(async () => 999)});
    await expect(createEventOrdersRepository(async () => tx).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toMatchObject({ok: true});
  });

  it("reuses the order a repeated idempotency key names", async () => {
    const tx = transaction({orderByIdempotencyKey: vi.fn(async () => order())});
    await expect(createEventOrdersRepository(async () => tx).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toMatchObject({ok: true, reused: true});
    expect(tx.insertOrder).not.toHaveBeenCalled();
  });
});

describe("eventOrdersRepository.settlePaid", () => {
  it("marks a pending order paid", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order())});
    await expect(createEventOrdersRepository(async () => tx).settlePaid("cs_1", now))
      .resolves.toMatchObject({status: "paid"});
    expect(tx.markStatus).toHaveBeenCalledWith("order-1", "paid", expect.objectContaining({paidAt: now}));
  });

  it("is a no-op for an order already paid", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order({status: "paid"}))});
    await expect(createEventOrdersRepository(async () => tx).settlePaid("cs_1", now)).resolves.toMatchObject({status: "duplicate"});
    expect(tx.markStatus).not.toHaveBeenCalled();
  });

  it("refunds an order that lost the race for the last seat", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order()), heldSeats: vi.fn(async () => 2)});
    await expect(createEventOrdersRepository(async () => tx).settlePaid("cs_1", now)).resolves.toMatchObject({status: "oversold"});
    expect(tx.markStatus).toHaveBeenCalledWith("order-1", "refunded", expect.objectContaining({refundReason: "oversold"}));
  });

  it("does not count the order's own seats against it", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order()), heldSeats: vi.fn(async () => 0)});
    await createEventOrdersRepository(async () => tx).settlePaid("cs_1", now);
    expect(tx.heldSeats).toHaveBeenCalledWith("ev-1", now, "order-1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/event-orders-repository.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/db/repos/event-orders"`.

- [ ] **Step 3: Implement**

Create `config/tickets.ts`:

```ts
/** The most seats one order may buy; a policy cap, not a technical limit. */
export const MAX_TICKET_SEATS = 10;
/** How long a pending order holds its seats — the Stripe session's own expiry. */
export const TICKET_HOLD_MS = 30 * 60_000;
```

Create `lib/db/repos/event-orders.ts`. It owns its transaction and takes a loader so tests inject a fake:

```ts
import "server-only";

import {and, count, eq, gt, isNotNull, isNull, or, sql} from "drizzle-orm";
import {z} from "zod";

import {auditEvents, eventOrderSeats, eventOrders, events} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "refunded";
export type RefundReason = "oversold" | "staff" | "cancelled";

export type OrderRecord = Readonly<{
  id: string; eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  amountHkdCents: number; currency: string; status: OrderStatus; stripeCheckoutSessionId: string | null;
  idempotencyKey: string; expiresAt: Date; paidAt: Date | null; refundedAt: Date | null; refundReason: RefundReason | null;
}>;

export type LockedEvent = Readonly<{
  id: string; capacity: number | null; published: boolean; startsAt: Date; endsAt: Date | null;
  registrationMode: string; ticketPriceHkdCents: number | null;
}>;

export type SeatInput = Readonly<{name: string; email: string}>;

export type CreateOrderInput = Readonly<{
  eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  idempotencyKey: string; seats: readonly SeatInput[]; amountHkdCents: number; now: Date;
}>;

export type CreateOrderResult =
  | Readonly<{ok: true; order: OrderRecord; reused: boolean}>
  | Readonly<{ok: false; reason: "EVENT_NOT_FOUND" | "SOLD_OUT"}>;

export type SettleResult =
  | Readonly<{status: "paid" | "duplicate" | "ignored" | "oversold" | "unknown"; order: OrderRecord | null}>;

export type EventOrdersTransaction = Readonly<{
  lockEvent: (eventId: string) => Promise<LockedEvent | null>;
  orderByIdempotencyKey: (key: string) => Promise<OrderRecord | null>;
  orderBySessionId: (sessionId: string) => Promise<OrderRecord | null>;
  seatsOfOrder: (orderId: string) => Promise<number>;
  /** Seats of paid orders, or of pending ones whose hold has not lapsed. */
  heldSeats: (eventId: string, now: Date, excludingOrderId?: string) => Promise<number>;
  insertOrder: (input: CreateOrderInput & {expiresAt: Date; status: "pending"}) => Promise<OrderRecord>;
  insertSeats: (orderId: string, seats: readonly SeatInput[]) => Promise<void>;
  attachSession: (orderId: string, sessionId: string) => Promise<void>;
  markStatus: (orderId: string, status: OrderStatus, patch: Readonly<{paidAt?: Date; refundedAt?: Date; refundReason?: RefundReason}>) => Promise<void>;
  insertAudit: (input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>) => Promise<void>;
}>;

const seatSchema = z.object({name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().pipe(z.string().email().max(320))}).strict();
export const ticketSeatsSchema = z.array(seatSchema).min(1);
```

Then the repository:

```ts
function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as {rows: T[]}).rows;
  return [];
}

async function defaultTransaction<T>(work: (tx: EventOrdersTransaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => work({
    lockEvent: async (eventId) => rows<LockedEvent>(await tx.execute(sql`
      SELECT id, capacity, published, starts_at AS "startsAt", ends_at AS "endsAt",
             registration_mode AS "registrationMode", ticket_price_hkd_cents AS "ticketPriceHkdCents"
      FROM ${events} WHERE id = ${eventId} FOR UPDATE
    `))[0] ?? null,
    orderByIdempotencyKey: async (key) => rows<OrderRecord>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE idempotency_key = ${key} LIMIT 1`))[0] ?? null,
    orderBySessionId: async (sessionId) => rows<OrderRecord>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE stripe_checkout_session_id = ${sessionId} LIMIT 1 FOR UPDATE`))[0] ?? null,
    seatsOfOrder: async (orderId) => Number(rows<{value: number}>(await tx.execute(sql`SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} WHERE order_id = ${orderId}`))[0]?.value ?? 0),
    heldSeats: async (eventId, now, excludingOrderId) => Number(rows<{value: number}>(await tx.execute(sql`
      SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} AS s
      JOIN ${eventOrders} AS o ON o.id = s.order_id
      WHERE o.event_id = ${eventId}
        AND (${excludingOrderId === undefined ? sql`TRUE` : sql`o.id <> ${excludingOrderId}`})
        AND (o.status = 'paid' OR (o.status = 'pending' AND o.expires_at > ${now}))
    `))[0]?.value ?? 0),
    insertOrder: async (input) => rows<OrderRecord>(await tx.execute(sql`
      INSERT INTO ${eventOrders} (id, event_id, buyer_profile_id, buyer_name, buyer_email, amount_hkd_cents, currency, status, idempotency_key, expires_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${input.eventId}, ${input.buyerProfileId}, ${input.buyerName}, ${input.buyerEmail}, ${input.amountHkdCents}, 'hkd', 'pending', ${input.idempotencyKey}, ${input.expiresAt}, NOW(), NOW())
      RETURNING *
    `))[0]!,
    insertSeats: async (orderId, seats) => { for (const [index, seat] of seats.entries()) await tx.execute(sql`INSERT INTO ${eventOrderSeats} (order_id, position, attendee_name, attendee_email, created_at) VALUES (${orderId}, ${index + 1}, ${seat.name}, ${seat.email}, NOW())`); },
    attachSession: async (orderId, sessionId) => { await tx.execute(sql`UPDATE ${eventOrders} SET stripe_checkout_session_id = ${sessionId}, updated_at = NOW() WHERE id = ${orderId}`); },
    markStatus: async (orderId, status, patch) => { await tx.execute(sql`UPDATE ${eventOrders} SET status = ${status}, paid_at = ${patch.paidAt ?? null}, refunded_at = ${patch.refundedAt ?? null}, refund_reason = ${patch.refundReason ?? null}, updated_at = NOW() WHERE id = ${orderId}`); },
    insertAudit: async (input) => { await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${input.actorUserId}, ${input.actorType}, ${input.action}, ${input.targetType}, ${input.targetId}, ${JSON.stringify(input.metadata)}::jsonb)`); },
  }));
}

export function createEventOrdersRepository(runTransaction: <T>(work: (tx: EventOrdersTransaction) => Promise<T>) => Promise<T> = defaultTransaction) {
  return {
    async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
      return runTransaction(async (tx) => {
        const event = await tx.lockEvent(input.eventId);
        if (!event) return {ok: false, reason: "EVENT_NOT_FOUND"};
        const existing = await tx.orderByIdempotencyKey(input.idempotencyKey);
        if (existing) return {ok: true, order: existing, reused: true};
        if (event.capacity !== null) {
          const held = await tx.heldSeats(input.eventId, input.now);
          if (held + input.seats.length > event.capacity) return {ok: false, reason: "SOLD_OUT"};
        }
        const expiresAt = new Date(input.now.getTime() + TICKET_HOLD_MS);
        const order = await tx.insertOrder({...input, expiresAt, status: "pending"});
        await tx.insertSeats(order.id, input.seats);
        await tx.insertAudit({actorUserId: input.buyerProfileId, actorType: input.buyerProfileId ? "member" : "guest", action: "event.order.created", targetType: "event_order", targetId: order.id, metadata: {eventId: input.eventId, seats: input.seats.length, amountHkdCents: input.amountHkdCents}});
        return {ok: true, order, reused: false};
      });
    },

    async attachSession(orderId: string, sessionId: string): Promise<void> {
      await runTransaction(async (tx) => { await tx.attachSession(orderId, sessionId); });
    },

    async settlePaid(sessionId: string, now: Date): Promise<SettleResult> {
      return runTransaction(async (tx) => {
        const order = await tx.orderBySessionId(sessionId);
        if (!order) return {status: "unknown", order: null};
        if (order.status === "paid") return {status: "duplicate", order};
        if (order.status !== "pending") return {status: "ignored", order};
        const event = await tx.lockEvent(order.eventId);
        if (event && event.capacity !== null) {
          const others = await tx.heldSeats(order.eventId, now, order.id);
          const seats = await tx.seatsOfOrder(order.id);
          if (others + seats > event.capacity) {
            await tx.markStatus(order.id, "refunded", {refundedAt: now, refundReason: "oversold"});
            await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.refunded", targetType: "event_order", targetId: order.id, metadata: {reason: "oversold"}});
            return {status: "oversold", order: {...order, status: "refunded", refundedAt: now, refundReason: "oversold"}};
          }
        }
        await tx.markStatus(order.id, "paid", {paidAt: now});
        await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.paid", targetType: "event_order", targetId: order.id, metadata: {}});
        return {status: "paid", order: {...order, status: "paid", paidAt: now}};
      });
    },

    async expireBySession(sessionId: string): Promise<void> {
      await runTransaction(async (tx) => {
        const order = await tx.orderBySessionId(sessionId);
        if (order?.status === "pending") {
          await tx.markStatus(order.id, "expired", {});
          await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.expired", targetType: "event_order", targetId: order.id, metadata: {}});
        }
      });
    },

    async heldSeats(eventId: string, now: Date): Promise<number> {
      return runTransaction((tx) => tx.heldSeats(eventId, now));
    },
  };
}

export const eventOrdersRepository = createEventOrdersRepository();
export type EventOrdersRepository = ReturnType<typeof createEventOrdersRepository>;
```

Import `TICKET_HOLD_MS` from `config/tickets`. If the raw-SQL return shape is not camelCase (Postgres returns snake_case for `SELECT *`), add an explicit column-folding `orderFrom(row)` helper, exactly as `agent-runs.ts`'s `runFrom` does — do not assume `SELECT *` returns camelCase.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/event-orders-repository.test.ts && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add config/tickets.ts lib/db/repos/event-orders.ts tests/unit/event-orders-repository.test.ts
git commit -m "feat(db): an order repository with a derived seat hold"
```

---

### Task 5: The checkout core

**Files:**
- Create: `lib/tickets/checkout-core.ts`
- Test: `tests/unit/ticket-checkout-core.test.ts` (create)

**Interfaces:**
- Consumes: `createEventOrdersRepository` (Task 4), `createEventTicketSession` (Task 3), `MAX_TICKET_SEATS`/`TICKET_HOLD_MS` (Task 4).
- Produces: `createTicketCheckout(input, dependencies?): Promise<TicketCheckoutResult>` where `input = {eventId, buyer: {profileId: string | null; name: string; email: string}, seats: SeatInput[], idempotencyKey: string, locale}`, and `TicketCheckoutResult = {status: "redirect"; url: string} | {status: "error"; code: "EVENT_NOT_FOUND"|"EVENT_NOT_TICKETED"|"EVENT_CLOSED"|"SOLD_OUT"|"INVALID_SEATS"|"UNAVAILABLE"}`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-checkout-core.test.ts`, injecting the repository and Stripe adapter:

```ts
import {describe, expect, it, vi} from "vitest";

import {createTicketCheckout, type TicketCheckoutDependencies} from "@/lib/tickets/checkout-core";

const now = new Date("2026-09-14T04:00:00Z");
const seats = [{name: "Ada", email: "ada@example.test"}];

function dependencies(overrides: Partial<TicketCheckoutDependencies> = {}): TicketCheckoutDependencies {
  return {
    now: () => now,
    appUrl: "https://w.test",
    orders: {
      createOrder: vi.fn(async () => ({ok: true, reused: false, order: {id: "order-1", eventId: "ev-1", amountHkdCents: 25_000, status: "pending", stripeCheckoutSessionId: null, buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", currency: "hkd", idempotencyKey: "idem-1", expiresAt: now, paidAt: null, refundedAt: null, refundReason: null}})),
      attachSession: vi.fn(async () => undefined),
    } as never,
    stripe: {createEventTicketSession: vi.fn(async () => ({id: "cs_1", url: "https://checkout.stripe.test/1"}))} as never,
    eventForTicket: vi.fn(async () => ({id: "ev-1", slug: "edge-ai", titleEn: "Edge AI", titleZh: "邊緣 AI", startsAt: new Date("2026-10-01T10:00:00Z"), published: true, registrationMode: "ticketed", ticketPriceHkdCents: 25_000})),
    ...overrides,
  };
}

describe("createTicketCheckout", () => {
  it("computes the amount from the event price and redirects to Stripe", async () => {
    const deps = dependencies();
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "redirect", url: "https://checkout.stripe.test/1"});
    expect((deps.orders.createOrder as unknown as {mock: {calls: unknown[][]}}).mock.calls[0]![0]).toMatchObject({amountHkdCents: 25_000});
    expect(deps.stripe.createEventTicketSession).toHaveBeenCalledWith(expect.objectContaining({amountHkdCents: 25_000, seats: 1, orderId: "order-1"}));
  });

  it.each([
    ["a non-ticketed event", {registrationMode: "rsvp"}, "EVENT_NOT_TICKETED"],
    ["an unpublished event", {published: false}, "EVENT_CLOSED"],
    ["a started event", {startsAt: new Date("2026-09-01T00:00:00Z")}, "EVENT_CLOSED"],
  ])("refuses %s", async (_case, overrides, code) => {
    const deps = dependencies({eventForTicket: vi.fn(async () => ({id: "ev-1", slug: "s", titleEn: "t", titleZh: "t", startsAt: new Date("2026-10-01T10:00:00Z"), published: true, registrationMode: "ticketed", ticketPriceHkdCents: 25_000, ...overrides}))});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "error", code});
  });

  it("maps a sold-out order to an error", async () => {
    const deps = dependencies({orders: {createOrder: vi.fn(async () => ({ok: false, reason: "SOLD_OUT"}))} as never});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "error", code: "SOLD_OUT"});
  });

  it("refuses more seats than the policy cap", async () => {
    const many = Array.from({length: 11}, (_, index) => ({name: `A${index}`, email: `a${index}@example.test`}));
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats: many, idempotencyKey: "idem-1", locale: "en"}, dependencies()))
      .resolves.toEqual({status: "error", code: "INVALID_SEATS"});
  });

  it("returns the existing session for a reused order", async () => {
    const deps = dependencies({orders: {createOrder: vi.fn(async () => ({ok: true, reused: true, order: {id: "order-1", eventId: "ev-1", amountHkdCents: 25_000, status: "pending", stripeCheckoutSessionId: "cs_existing", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", currency: "hkd", idempotencyKey: "idem-1", expiresAt: now, paidAt: null, refundedAt: null, refundReason: null}}))} as never});
    await expect(createTicketCheckout({eventId: "ev-1", buyer: {profileId: null, name: "Ada", email: "ada@example.test"}, seats, idempotencyKey: "idem-1", locale: "en"}, deps))
      .resolves.toEqual({status: "redirect", url: "https://checkout.stripe.test/existing"});
  });
});
```

For the last case, the returned session must be fetchable: the adapter fixture returns `{id: "cs_existing", url: "https://checkout.stripe.test/existing"}` when called again — make the fake return a stable url per session id, or assert the adapter was not called and the core's `sessionUrl(order.stripeCheckoutSessionId)` maps it. Choose the simpler contract: the adapter exposes `sessionUrl(sessionId)` only if needed — otherwise the core stores the URL. **Simplest honest design: store the checkout URL on the order** (`stripeCheckoutUrl` column) so a reused order returns the exact URL it already minted. Add that column in Task 1 and `attachSession(orderId, sessionId, url)`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/ticket-checkout-core.test.ts`
Expected: FAIL — `Failed to resolve import`.

- [ ] **Step 3: Implement**

Create `lib/tickets/checkout-core.ts` following the injected-dependencies pattern `lib/billing/checkout-service.ts` uses: validate the event (exists, `registrationMode === "ticketed"`, `published`, `startsAt > now`), validate the seats against `MAX_TICKET_SEATS` and `ticketSeatsSchema`, compute `amountHkdCents = event.ticketPriceHkdCents * seats.length` (refuse if the price is null with `EVENT_NOT_TICKETED`), call `orders.createOrder`, map `SOLD_OUT` and `EVENT_NOT_FOUND`, then — for a fresh order — `stripe.createEventTicketSession` with the event title in the buyer's locale, `success_url`/`cancel_url` on the event page, and `expiresAt = order.expiresAt`, and `orders.attachSession(order.id, session.id, session.url)`. A reused order returns its stored `stripeCheckoutUrl`. A Stripe failure returns `{status: "error", code: "UNAVAILABLE"}` and leaves the pending order to expire.

**Recorded deviation:** the spec's `event_orders` has no URL column. Add `stripe_checkout_url text` to `event_orders` in Task 1 and to the migration, so a reused idempotency key can return the exact session URL instead of guessing it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/ticket-checkout-core.test.ts tests/unit/event-orders-repository.test.ts && npm run typecheck`
Expected: PASS, and typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add lib/tickets/checkout-core.ts tests/unit/ticket-checkout-core.test.ts lib/db/schema-core.ts drizzle
git commit -m "feat(tickets): create a ticket order and its Stripe session"
```

---

### Task 6: The public form and its action

**Files:**
- Create: `lib/tickets/checkout-actions.ts`, `components/marketing/ticket-checkout-form.tsx`
- Modify: `app/[locale]/(public)/events/[slug]/page.tsx`
- Test: `tests/unit/ticket-checkout-actions.test.ts`, `tests/unit/ticket-checkout-form.test.tsx` (create both)

**Interfaces:**
- Consumes: `createTicketCheckout` (Task 5).
- Produces: `submitTicketCheckoutAction(formData): Promise<TicketCheckoutState>` and `TicketCheckoutForm`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/ticket-checkout-actions.test.ts` — a process-local limiter refuses the sixth call from one IP; a honeypot field filled returns `{status: "ignored"}`; a valid form calls the core with the buyer resolved from the actor. Model it on the existing guest-RSVP action tests (`tests/unit/guest-registration-service.test.ts`) for the limiter/honeypot shape.

`tests/unit/ticket-checkout-form.test.tsx` — the seat count drives N attendee rows; a signed-in member's name and email are prefilled; the submit button is disabled while pending.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/ticket-checkout-actions.test.ts tests/unit/ticket-checkout-form.test.tsx`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Implement the action**

Create `lib/tickets/checkout-actions.ts` as a `"use server"` module that exports only `submitTicketCheckoutAction`, resolves the actor itself (`getActor()`; a member becomes the buyer's `profileId`, an anonymous visitor is a guest), applies the honeypot and a process-local rate limiter (`createInMemoryRateLimiter({limit: 5, windowMs: 15 * 60_000})`, the guest RSVP's numbers), parses the form through a zod schema (`eventId` uuid, `idempotencyKey` uuid, buyer name/email, `seatCount` 1..`MAX_TICKET_SEATS`, and `seatName-<i>`/`seatEmail-<i>` for each), and delegates to `createTicketCheckout`. It returns a discriminated state whose `redirect` carries the Stripe URL for the client to follow.

- [ ] **Step 4: Implement the form**

Create `components/marketing/ticket-checkout-form.tsx` as a client component: buyer name and email (prefilled for a member), a seat count select, and one attendee name/email pair per seat. It mints `idempotencyKey` once with `useState(() => crypto.randomUUID())` so a retry reuses it, posts to `submitTicketCheckoutAction`, and redirects on the returned URL with `window.location.assign`. Every string comes from a `Ticket` bundle namespace.

- [ ] **Step 5: Render it on the event page**

In `app/[locale]/(public)/events/[slug]/page.tsx`, in the registration branch, render `<TicketCheckoutForm …/>` when `displayEvent.registrationMode === "ticketed"`, before the RSVP/guest branches; pass the event id, slug, title, price and remaining seats. Add the `Ticket` strings to both bundles.

- [ ] **Step 6: Run the tests and the gate**

Run: `npx vitest run tests/unit/ticket-checkout-actions.test.ts tests/unit/ticket-checkout-form.test.tsx && npm run audit:strings && npm run typecheck && npm run lint`
Expected: PASS, audit clean, typecheck silent, lint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add lib/tickets/checkout-actions.ts components/marketing/ticket-checkout-form.tsx "app/[locale]/(public)/events/[slug]/page.tsx" messages tests/unit/ticket-checkout-actions.test.ts tests/unit/ticket-checkout-form.test.tsx
git commit -m "feat(events): buy tickets from the event page"
```

---

### Task 7: The webhook branch and the ticket emails

**Files:**
- Modify: `lib/billing/webhook-service.ts`, `lib/api/stripe-webhook-route.ts`
- Test: `tests/unit/ticket-webhook.test.ts` (create)

**Interfaces:**
- Consumes: `eventOrdersRepository.settlePaid`/`expireBySession` (Task 4), `refundPaymentIntent` (Task 3), the two email templates (Task 2).
- Produces: `processStripeEvent(event, actor, processor?, ticketProcessor?)`, `TicketWebhookCommand`, `TicketProcessor`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ticket-webhook.test.ts` with fixtures for `checkout.session.completed` (metadata `{kind: "event_ticket", orderId}`) and `checkout.session.expired`, asserting:

- a completed ticket session dispatches to the ticket processor and **never** to the membership processor (whose normaliser would reject it);
- an expired ticket session calls `expireBySession`;
- an oversold settlement calls `refundPaymentIntent` with the session's payment intent and sends the refund email;
- a paid settlement sends the confirmation email;
- a membership event still reaches the membership processor unchanged;
- an unrecognised event type returns `"processed"` without either processor.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/ticket-webhook.test.ts`
Expected: FAIL — the ticket branch does not exist.

- [ ] **Step 3: Implement the branch**

In `lib/billing/webhook-service.ts`:

```ts
export type TicketWebhookCommand = Readonly<{
  eventId: string; eventType: "checkout.session.completed" | "checkout.session.expired";
  orderId: string; checkoutSessionId: string; paymentIntentId: string | null;
}>;
export interface TicketProcessor { process(actor: Actor, command: TicketWebhookCommand): Promise<"processed" | "duplicate">; }

function normalizeTicket(event: Stripe.Event): TicketWebhookCommand | null {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") return null;
  const object = objectValue(event.data?.object);
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || (metadata as Record<string, unknown>).kind !== "event_ticket") return null;
  const parsed = z.object({kind: z.literal("event_ticket"), orderId: z.string().uuid()}).strict().safeParse(metadata);
  if (!parsed.success) throw new WebhookInputError();
  const checkoutSessionId = stringId(object.id);
  if (object.client_reference_id !== parsed.data.orderId) throw new WebhookInputError();
  return {
    eventId: event.id, eventType: event.type,
    orderId: parsed.data.orderId, checkoutSessionId,
    paymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
  };
}
```

Change the entry point to check the ticket shape first:

```ts
export async function processStripeEvent(
  event: Stripe.Event,
  actor: Actor,
  processor: WebhookProcessor = productionProcessor,
  ticketProcessor: TicketProcessor | null = null,
): Promise<"processed" | "duplicate"> {
  requireSystem(actor);
  const ticket = normalizeTicket(event);
  if (ticket) {
    if (!ticketProcessor) return "processed";
    try { return await ticketProcessor.process(actor, ticket); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "INVALID_WEBHOOK_EVENT") throw new WebhookInputError(); throw error; }
  }
  const command = normalize(event);
  if (!command) return "processed";
  try { return await processor.process(actor, command); }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "INVALID_WEBHOOK_EVENT") throw new WebhookInputError(); throw error; }
}
```

In `lib/api/stripe-webhook-route.ts`, build the ticket processor: for `completed`, `settlePaid(sessionId, new Date())`; on `"paid"` send the confirmation (best-effort, logged on failure); on `"oversold"` call `refundPaymentIntent(paymentIntentId)` then send the refund email (also best-effort); for `expired`, `expireBySession(sessionId)`. Both mailers use `renderEmail` + `createConfiguredEmailTransport`, keyed idempotently on the order and outcome (`ticket-confirmation:<orderId>`, `ticket-refund:<orderId>`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/ticket-webhook.test.ts tests/unit/webhook*.test.ts tests/integration/woztell-webhook.test.ts && npm run typecheck`
Expected: PASS — including the existing membership webhook tests, which must be untouched.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/webhook-service.ts lib/api/stripe-webhook-route.ts tests/unit/ticket-webhook.test.ts
git commit -m "feat(billing): settle ticket orders from the Stripe webhook"
```

---

### Task 8: The staff price and mode

**Files:**
- Modify: `lib/admin/event-form-input.ts`, `lib/admin/event-action-core.ts`, `app/[locale]/(admin)/admin/events-mgmt` (the form and its page), `lib/db/repos/events.ts`
- Test: `tests/unit/admin-event-ticket-price.test.ts` (create)

**Interfaces:**
- Consumes: the schema (Task 1).
- Produces: the admin event form accepts `registrationMode` and `ticketPriceHkdCents`, and the repository refuses a price on a non-ticketed event and a ticketed event without one.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-event-ticket-price.test.ts`:

```ts
import {describe, expect, it} from "vitest";

import {parseTicketPrice} from "@/lib/admin/event-form-input";

describe("parseTicketPrice", () => {
  it("reads a whole-dollar HKD price as cents", () => {
    expect(parseTicketPrice({mode: "ticketed", price: "250"})).toBe(25_000);
  });

  it("refuses a ticketed event with no price or a zero price", () => {
    expect(() => parseTicketPrice({mode: "ticketed", price: ""})).toThrow();
    expect(() => parseTicketPrice({mode: "ticketed", price: "0"})).toThrow();
  });

  it("ignores a price on a non-ticketed event", () => {
    expect(parseTicketPrice({mode: "rsvp", price: "250"})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/admin-event-ticket-price.test.ts`
Expected: FAIL — `parseTicketPrice is not a function`.

- [ ] **Step 3: Implement**

In `lib/admin/event-form-input.ts`, add `registrationMode` (`rsvp` | `external` | `ticketed`, defaulting to `rsvp`) and `ticketPriceHkdCents`, read from the form as whole dollars and converted to cents by an exported `parseTicketPrice({mode, price})` that returns `null` for a non-ticketed event, throws for a ticketed event with a blank or non-positive price, and otherwise returns `Math.round(Number(price) * 100)`. Extend the admin event form's select with the third mode and a price input shown for it. Extend the repository's event input schema to carry both and refuse the same two conditions again as the second layer — the page is not the authority.

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run tests/unit/admin-event-ticket-price.test.ts && npm run audit:strings && npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/event-form-input.ts lib/admin/event-action-core.ts lib/db/repos/events.ts "app/[locale]/(admin)/admin/events-mgmt" tests/unit/admin-event-ticket-price.test.ts messages
git commit -m "feat(admin): price a ticketed event"
```

---

### Task 9: The acceptance walk and the full gate

**Files:**
- Create: `tests/e2e/phase-d4a-ticket-checkout.spec.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/phase-d4a-ticket-checkout.spec.ts`, gated the way the other acceptance specs are (`missingM2LiveEnvironment()` and a skip when Stripe test keys are absent). It signs in as the `company-admin` fixture role, walks the ticketed event page, fills two attendee seats, submits, and asserts the redirect reaches a Stripe Checkout URL — it does not complete a payment, which is the owner's step.

- [ ] **Step 2: Run the full gate**

Run: `npm run audit:strings && npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/phase-d4a-ticket-checkout.spec.ts
git commit -m "test(e2e): a member starts a ticket purchase"
```

---

## Verification checklist

Against the spec's §9:

| # | Done when | Task |
|---|---|---|
| 1 | Staff can mark an event ticketed and set its HKD price; a member event cannot | 8 |
| 2 | A member or guest buys 1–10 named seats through Stripe payment mode, and the paid order has one seat row each | 3, 4, 5, 6, 7 |
| 3 | Capacity holds at checkout, is re-checked at payment, and an oversold order is refunded and never admitted | 4, 7 |
| 4 | An expired or failed checkout leaves no charge and releases its seats | 3, 4, 7 |
| 5 | The five gate commands are green | 9 |

Not in scope: the QR pass and per-attendee email, the check-in flow, staff refunds, the refund-policy page, partial refunds, multi-currency, and a staff alert email for an oversell (recorded in the spec).
