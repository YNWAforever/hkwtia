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
  // The webhook has no request context to read a locale from, so the buyer's
  // chosen language is persisted at checkout and read back when the receipt is
  // sent. Without it every receipt would go out in whatever the webhook defaults to.
  buyerLocale: text("buyer_locale").notNull(),
  amountHkdCents: integer("amount_hkd_cents").notNull(),
  currency: text("currency").default("hkd").notNull(),
  status: eventOrderStatusEnum("status").default("pending").notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  // Stored, not derived: a repeated idempotency key must return the exact url
  // this order's session minted, and a session id alone cannot reconstruct it.
  stripeCheckoutUrl: text("stripe_checkout_url"),
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
  return {id: "order-1", eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", amountHkdCents: 25_000, currency: "hkd", status: "pending", stripeCheckoutSessionId: null, stripeCheckoutUrl: null, idempotencyKey: "idem-1", expiresAt: new Date(now.getTime() + 1_800_000), paidAt: null, refundedAt: null, refundReason: null, ...overrides};
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
  buyerLocale: "en" | "zh-HK";
  amountHkdCents: number; currency: string; status: OrderStatus; stripeCheckoutSessionId: string | null;
  stripeCheckoutUrl: string | null;
  idempotencyKey: string; expiresAt: Date; paidAt: Date | null; refundedAt: Date | null; refundReason: RefundReason | null;
}>;

export type LockedEvent = Readonly<{
  id: string; capacity: number | null; published: boolean; startsAt: Date; endsAt: Date | null;
  registrationMode: string; ticketPriceHkdCents: number | null;
}>;

export type SeatInput = Readonly<{name: string; email: string}>;

export type CreateOrderInput = Readonly<{
  eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  buyerLocale: "en" | "zh-HK";
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
  attachSession: (orderId: string, sessionId: string, url: string) => Promise<void>;
  markStatus: (orderId: string, status: OrderStatus, patch: Readonly<{paidAt?: Date; refundedAt?: Date; refundReason?: RefundReason}>) => Promise<void>;
  insertAudit: (input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>) => Promise<void>;
  eventSummary: (eventId: string) => Promise<readonly Readonly<{titleEn: string; titleZh: string | null; startsAt: Date}>[]>;
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
      INSERT INTO ${eventOrders} (id, event_id, buyer_profile_id, buyer_name, buyer_email, buyer_locale, amount_hkd_cents, currency, status, idempotency_key, expires_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${input.eventId}, ${input.buyerProfileId}, ${input.buyerName}, ${input.buyerEmail}, ${input.buyerLocale}, ${input.amountHkdCents}, 'hkd', 'pending', ${input.idempotencyKey}, ${input.expiresAt}, NOW(), NOW())
      RETURNING *
    `))[0]!,
    insertSeats: async (orderId, seats) => { for (const [index, seat] of seats.entries()) await tx.execute(sql`INSERT INTO ${eventOrderSeats} (order_id, position, attendee_name, attendee_email, created_at) VALUES (${orderId}, ${index + 1}, ${seat.name}, ${seat.email}, NOW())`); },
    attachSession: async (orderId, sessionId, url) => { await tx.execute(sql`UPDATE ${eventOrders} SET stripe_checkout_session_id = ${sessionId}, stripe_checkout_url = ${url}, updated_at = NOW() WHERE id = ${orderId}`); },
    markStatus: async (orderId, status, patch) => { await tx.execute(sql`UPDATE ${eventOrders} SET status = ${status}, paid_at = ${patch.paidAt ?? null}, refunded_at = ${patch.refundedAt ?? null}, refund_reason = ${patch.refundReason ?? null}, updated_at = NOW() WHERE id = ${orderId}`); },
    insertAudit: async (input) => { await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${input.actorUserId}, ${input.actorType}, ${input.action}, ${input.targetType}, ${input.targetId}, ${JSON.stringify(input.metadata)}::jsonb)`); },
    eventSummary: async (eventId) => rows<{titleEn: string; titleZh: string | null; startsAt: Date}>(await tx.execute(sql`
      SELECT title_en AS "titleEn", title_zh AS "titleZh", starts_at AS "startsAt" FROM ${events} WHERE id = ${eventId} LIMIT 1
    `)),
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

    async attachSession(orderId: string, sessionId: string, url: string): Promise<void> {
      await runTransaction(async (tx) => { await tx.attachSession(orderId, sessionId, url); });
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

    /** The localized title the receipt names. Not transactional: a read of one row. */
    async eventSummary(eventId: string, locale: "en" | "zh-HK"): Promise<{title: string; startsAt: Date} | null> {
      return runTransaction(async (tx) => {
        const row = (await tx.eventSummary(eventId))[0];
        if (!row) return null;
        return {title: locale === "zh-HK" ? row.titleZh : row.titleEn, startsAt: row.startsAt};
      });
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

Create `lib/tickets/checkout-core.ts`:

```ts
import "server-only";

import {eq} from "drizzle-orm";

import {MAX_TICKET_SEATS} from "@/config/tickets";
import type {AppLocale} from "@/i18n/routing";
import {appEnv} from "@/lib/config/env";
import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";
import {getDb} from "@/lib/db/repos/common";
import {eventOrdersRepository, ticketSeatsSchema, type EventOrdersRepository, type SeatInput} from "@/lib/db/repos/event-orders";
import {events} from "@/lib/db/server-schema";
import {localizedPath} from "@/lib/urls";

export type TicketEvent = Readonly<{
  id: string; slug: string; titleEn: string; titleZh: string; startsAt: Date;
  published: boolean; registrationMode: string; ticketPriceHkdCents: number | null;
}>;

export type TicketCheckoutInput = Readonly<{
  eventId: string;
  buyer: Readonly<{profileId: string | null; name: string; email: string}>;
  seats: readonly SeatInput[];
  idempotencyKey: string;
  locale: AppLocale;
}>;

export type TicketCheckoutErrorCode =
  | "EVENT_NOT_FOUND" | "EVENT_NOT_TICKETED" | "EVENT_CLOSED" | "SOLD_OUT" | "INVALID_SEATS" | "UNAVAILABLE";

export type TicketCheckoutResult =
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "error"; code: TicketCheckoutErrorCode}>;

export type TicketCheckoutDependencies = Readonly<{
  orders: EventOrdersRepository;
  stripe: Pick<StripeBillingAdapter, "createEventTicketSession">;
  eventForTicket: (eventId: string) => Promise<TicketEvent | null>;
  appUrl: string;
  now: () => Date;
}>;

async function defaultEventForTicket(eventId: string): Promise<TicketEvent | null> {
  const db = await getDb();
  const row = (await db.select({
    id: events.id, slug: events.slug, titleEn: events.titleEn, titleZh: events.titleZh, startsAt: events.startsAt,
    published: events.published, registrationMode: events.registrationMode, ticketPriceHkdCents: events.ticketPriceHkdCents,
  }).from(events).where(eq(events.id, eventId)).limit(1))[0];
  return row ?? null;
}

function defaultDependencies(): TicketCheckoutDependencies {
  return {
    orders: eventOrdersRepository,
    stripe: stripeBillingAdapter(),
    eventForTicket: defaultEventForTicket,
    appUrl: appEnv().appUrl,
    now: () => new Date(),
  };
}

function appOrigin(appUrl: string): string {
  try {
    const parsed = new URL(appUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.origin;
  } catch {
    throw new Error("INVALID_APP_URL");
  }
}

/**
 * Buy seats for a ticketed event. The amount is computed here, from the event's
 * own price — a request never carries a number that becomes money.
 */
export async function createTicketCheckout(
  input: TicketCheckoutInput,
  dependencies: TicketCheckoutDependencies = defaultDependencies(),
): Promise<TicketCheckoutResult> {
  const parsedSeats = ticketSeatsSchema.safeParse(input.seats);
  if (!parsedSeats.success || parsedSeats.data.length > MAX_TICKET_SEATS) {
    return {status: "error", code: "INVALID_SEATS"};
  }

  const event = await dependencies.eventForTicket(input.eventId);
  if (!event) return {status: "error", code: "EVENT_NOT_FOUND"};
  if (event.registrationMode !== "ticketed" || event.ticketPriceHkdCents === null) {
    return {status: "error", code: "EVENT_NOT_TICKETED"};
  }
  const now = dependencies.now();
  if (!event.published || event.startsAt <= now) return {status: "error", code: "EVENT_CLOSED"};

  const amountHkdCents = event.ticketPriceHkdCents * parsedSeats.data.length;
  const created = await dependencies.orders.createOrder({
    eventId: event.id,
    buyerProfileId: input.buyer.profileId,
    buyerName: input.buyer.name,
    buyerEmail: input.buyer.email,
    buyerLocale: input.locale,
    idempotencyKey: input.idempotencyKey,
    seats: parsedSeats.data,
    amountHkdCents,
    now,
  });
  if (!created.ok) {
    return {status: "error", code: created.reason === "SOLD_OUT" ? "SOLD_OUT" : "EVENT_NOT_FOUND"};
  }
  // A reused key returns the session it already minted; minting a second one
  // would charge the buyer twice for one form.
  if (created.order.stripeCheckoutUrl) {
    return {status: "redirect", url: created.order.stripeCheckoutUrl};
  }

  const origin = appOrigin(dependencies.appUrl);
  const eventPath = localizedPath(input.locale, `/events/${event.slug}`);
  try {
    const session = await dependencies.stripe.createEventTicketSession({
      eventTitle: input.locale === "zh-HK" ? event.titleZh : event.titleEn,
      amountHkdCents,
      seats: parsedSeats.data.length,
      orderId: created.order.id,
      successUrl: `${origin}${eventPath}?ticket=received`,
      cancelUrl: `${origin}${eventPath}?ticket=cancelled`,
      idempotencyKey: created.order.idempotencyKey,
      expiresAt: created.order.expiresAt,
    });
    await dependencies.orders.attachSession(created.order.id, session.id, session.url);
    return {status: "redirect", url: session.url};
  } catch {
    // The order stays pending and expires; the buyer is never charged.
    return {status: "error", code: "UNAVAILABLE"};
  }
}
```

`TicketEvent` and `TicketCheckoutErrorCode` are exported for the action and tests.

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

Create `lib/tickets/checkout-actions.ts`:

```ts
"use server";

import {headers} from "next/headers";
import {z} from "zod";

import {MAX_TICKET_SEATS} from "@/config/tickets";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {createTicketCheckout} from "@/lib/tickets/checkout-core";

// Process-local, the guest RSVP's numbers: a bot cannot complete a payment, but
// it can create pending orders, and this bounds that.
const ticketRateLimiter = createInMemoryRateLimiter({limit: 5, windowMs: 15 * 60_000});

const seatSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(320)),
}).strict();

const ticketFormSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  buyerName: z.string().trim().min(1).max(200),
  buyerEmail: z.string().trim().toLowerCase().pipe(z.string().email().max(320)),
  locale: z.enum(["en", "zh-HK"]),
  seats: z.array(seatSchema).min(1).max(MAX_TICKET_SEATS),
}).strict();

export type TicketCheckoutState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "redirect"; url: string}>
  | Readonly<{status: "ignored"}>
  | Readonly<{status: "error"; code: string}>;

/** The attendee rows the form rendered, in order, skipping any it left blank. */
function seatsFromFormData(formData: FormData): readonly {name: string; email: string}[] {
  const seats: {name: string; email: string}[] = [];
  for (let index = 0; index < MAX_TICKET_SEATS; index += 1) {
    const name = String(formData.get(`seatName-${index}`) ?? "").trim();
    const email = String(formData.get(`seatEmail-${index}`) ?? "").trim();
    if (!name && !email) continue;
    seats.push({name, email});
  }
  return seats;
}

/**
 * The public buyer boundary. Only this wrapper is exported; it resolves its own
 * actor, so a signed-in member is linked to the order and an anonymous visitor
 * buys as a guest.
 *
 * `useActionState` passes the previous state first, so the signature is
 * `(previous, formData)` even though the previous value is unused.
 */
export async function submitTicketCheckoutAction(_previous: TicketCheckoutState, formData: FormData): Promise<TicketCheckoutState> {
  if (String(formData.get("website") ?? "").length > 0) return {status: "ignored"};
  if (!ticketRateLimiter.check(clientIpFromHeaders(await headers())).allowed) {
    return {status: "error", code: "RATE_LIMITED"};
  }

  const parsed = ticketFormSchema.safeParse({
    eventId: formData.get("eventId"),
    idempotencyKey: formData.get("idempotencyKey"),
    buyerName: formData.get("buyerName"),
    buyerEmail: formData.get("buyerEmail"),
    locale: formData.get("locale"),
    seats: seatsFromFormData(formData),
  });
  if (!parsed.success) return {status: "error", code: "INVALID"};

  const actor = await getActor();
  const result = await createTicketCheckout({
    eventId: parsed.data.eventId,
    buyer: {
      profileId: actor?.kind === "member" ? actor.profileId : null,
      name: parsed.data.buyerName,
      email: parsed.data.buyerEmail,
    },
    seats: parsed.data.seats,
    idempotencyKey: parsed.data.idempotencyKey,
    locale: parsed.data.locale as AppLocale,
  });
  return result.status === "redirect" ? {status: "redirect", url: result.url} : {status: "error", code: result.code};
}
```

- [ ] **Step 4: Implement the form**

Create `components/marketing/ticket-checkout-form.tsx`:

```tsx
"use client";

import {useActionState, useEffect, useState} from "react";

import {submitTicketCheckoutAction, type TicketCheckoutState} from "@/lib/tickets/checkout-actions";

export type TicketCheckoutLabels = Readonly<{
  heading: string; buyerName: string; buyerEmail: string; seatCount: string;
  attendeeName: string; attendeeEmail: string; pricePerSeat: string;
  submit: string; submitting: string;
  errors: Readonly<Record<string, string>>;
}>;

const MAX_SEATS = 10;
const initial: TicketCheckoutState = {status: "idle"};

export function TicketCheckoutForm({eventId, locale, pricePerSeat, labels}: Readonly<{
  eventId: string; locale: "en" | "zh-HK"; pricePerSeat: string; labels: TicketCheckoutLabels;
}>) {
  const [state, dispatch, pending] = useActionState(submitTicketCheckoutAction, initial);
  const [seatCount, setSeatCount] = useState(1);
  // Minted once per form instance, so a retry after a network error reuses the
  // same key and cannot charge twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (state.status === "redirect") window.location.assign(state.url);
  }, [state]);

  const inputClass = "min-h-11 w-full rounded-md border border-input bg-background px-3";
  return (
    <form action={dispatch} className="space-y-4" noValidate>
      <h3 className="font-serif text-xl font-semibold">{labels.heading}</h3>
      <input name="eventId" type="hidden" value={eventId}/>
      <input name="locale" type="hidden" value={locale}/>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey}/>
      {/* Honeypot: a bot fills it, a person never sees it. */}
      <label className="sr-only" htmlFor="ticket-website">Website</label>
      <input autoComplete="off" className="hidden" id="ticket-website" name="website" tabIndex={-1} type="text"/>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.buyerName}</span>
        <input className={inputClass} name="buyerName" required type="text"/>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.buyerEmail}</span>
        <input className={inputClass} name="buyerEmail" required type="email"/>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>{labels.seatCount}</span>
        <select className={inputClass} onChange={(event) => setSeatCount(Number(event.target.value))} value={seatCount}>
          {Array.from({length: MAX_SEATS}, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
        </select>
      </label>
      {Array.from({length: seatCount}, (_, index) => (
        <div className="grid gap-3 sm:grid-cols-2" key={index}>
          <label className="block space-y-2 text-sm font-medium">
            <span>{labels.attendeeName} {index + 1}</span>
            <input className={inputClass} name={`seatName-${index}`} required type="text"/>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>{labels.attendeeEmail} {index + 1}</span>
            <input className={inputClass} name={`seatEmail-${index}`} required type="email"/>
          </label>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">{pricePerSeat}</p>
      <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
        {pending ? labels.submitting : labels.submit}
      </button>
      {state.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.errors[state.code] ?? labels.errors.INVALID}</p> : null}
    </form>
  );
}
```

- [ ] **Step 5: Render it on the event page**

In `app/[locale]/(public)/events/[slug]/page.tsx`:

Add the import:

```tsx
import {TicketCheckoutForm} from "@/components/marketing/ticket-checkout-form";
```

Extend the registration union so a ticketed event is its own kind — it is bought by a member or a guest alike, so it cannot fall into the guest/member arms:

```tsx
  const registration = displayEvent.registrationMode === "ticketed"
    ? {kind: "ticket" as const}
    : displayEvent.registrationMode === "external" && displayEvent.externalRegistrationUrl
      ? {kind: "external" as const, url: displayEvent.externalRegistrationUrl}
      : actor === null && displayEvent.registrationMode === "rsvp"
        ? {kind: "guest" as const}
        : {kind: "member" as const};
```

Render it first in the action bar's branch:

```tsx
              {registration.kind === "ticket" ? (
                <TicketCheckoutForm
                  eventId={displayEvent.id}
                  locale={appLocale}
                  pricePerSeat={t("ticket.price", {price: formatTicketPrice(displayEvent.ticketPriceHkdCents, appLocale)})}
                  labels={{
                    heading: t("ticket.heading"), buyerName: t("ticket.buyerName"), buyerEmail: t("ticket.buyerEmail"),
                    seatCount: t("ticket.seatCount"), attendeeName: t("ticket.attendeeName"), attendeeEmail: t("ticket.attendeeEmail"),
                    pricePerSeat: t("ticket.pricePerSeat"), submit: t("ticket.submit"), submitting: t("ticket.submitting"),
                    errors: {INVALID: t("ticket.errors.INVALID"), SOLD_OUT: t("ticket.errors.SOLD_OUT"), EVENT_CLOSED: t("ticket.errors.EVENT_CLOSED"), UNAVAILABLE: t("ticket.errors.UNAVAILABLE"), RATE_LIMITED: t("ticket.errors.RATE_LIMITED")},
                  }}
                />
              ) : registration.kind === "external" ? (
                ...the existing arms, unchanged
```

`displayEvent.ticketPriceHkdCents` must be on the public projection (Task 8 adds it to `PublicEventProjection`). `formatTicketPrice(cents, locale)` is a tiny helper in `lib/tickets/format.ts` — `new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}).format(cents / 100)` — exported and unit-tested in Task 9's suite.

Add a `Ticket` namespace to both bundles with `heading`, `buyerName`, `buyerEmail`, `seatCount`, `attendeeName`, `attendeeEmail`, `price`, `pricePerSeat`, `submit`, `submitting`, and `errors.{INVALID,SOLD_OUT,EVENT_CLOSED,UNAVAILABLE,RATE_LIMITED}`, in parity.

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
- Modify: `lib/billing/webhook-service.ts`, `lib/api/stripe-webhook-route.ts`, `lib/db/repos/event-orders.ts`
- Create: `lib/billing/ticket-webhook-processor.ts`
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

Create `lib/billing/ticket-webhook-processor.ts`:

```ts
import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import type {EventOrdersRepository, OrderRecord} from "@/lib/db/repos/event-orders";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
import {emailEnv} from "@/lib/config/env";
import type {TicketProcessor, TicketWebhookCommand} from "@/lib/billing/webhook-service";

type TicketEmailDependencies = Readonly<{
  renderEmail: typeof renderEmail;
  transport: ReturnType<typeof createConfiguredEmailTransport>;
  emailFrom: string;
}>;

export type TicketProcessorDependencies = Readonly<{
  orders: Pick<EventOrdersRepository, "settlePaid" | "expireBySession" | "eventSummary">;
  refundPaymentIntent: (paymentIntentId: string) => Promise<void>;
  email: TicketEmailDependencies;
  now: () => Date;
  /** Best-effort: a mail failure must not fail the webhook, which Stripe retries. */
  onEmailError?: (error: unknown, context: Readonly<{orderId: string; template: string}>) => void;
}>;

async function sendTicketEmail(
  dependencies: TicketProcessorDependencies,
  template: "event_ticket_confirmation" | "event_ticket_refunded",
  order: OrderRecord,
  eventTitle: string,
): Promise<void> {
  try {
    const rendered = await dependencies.email.renderEmail({
      template,
      locale: order.buyerLocale,
      recipientName: order.buyerName,
      classification: "transactional",
      variables: {
        eventTitle,
        amount: (order.amountHkdCents / 100).toFixed(2),
        orderId: order.id,
      },
    });
    await dependencies.email.transport.send({
      to: order.buyerEmail,
      from: dependencies.email.emailFrom,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      // Keyed on the order and the outcome: a redelivered webhook re-renders the
      // same message and is a no-op at the transport, while a later refund of the
      // same order is a different key and still sends.
      idempotencyKey: `${template === "event_ticket_confirmation" ? "ticket-confirmation" : "ticket-refund"}:${order.id}`,
    });
  } catch (error) {
    dependencies.onEmailError?.(error, {orderId: order.id, template});
  }
}

export function createTicketProcessor(dependencies: TicketProcessorDependencies): TicketProcessor {
  return {
    async process(_actor: Actor, command: TicketWebhookCommand): Promise<"processed" | "duplicate"> {
      if (command.eventType === "checkout.session.expired") {
        await dependencies.orders.expireBySession(command.checkoutSessionId);
        return "processed";
      }

      const settlement = await dependencies.orders.settlePaid(command.checkoutSessionId, dependencies.now());
      const order = settlement.order;
      if (!order) return "duplicate";

      if (settlement.status === "oversold") {
        // The seats were sold between checkout and payment; refund the whole
        // charge rather than a partial credit, and tell the buyer why.
        if (command.paymentIntentId) await dependencies.refundPaymentIntent(command.paymentIntentId);
        const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
        await sendTicketEmail(dependencies, "event_ticket_refunded", order, event?.title ?? "");
        return "processed";
      }
      if (settlement.status === "paid") {
        const event = await dependencies.orders.eventSummary(order.eventId, order.buyerLocale);
        await sendTicketEmail(dependencies, "event_ticket_confirmation", order, event?.title ?? "");
      }
      return "processed";
    },
  };
}
```

In `lib/api/stripe-webhook-route.ts`, wire it into the production `POST` — the ticket processor is built once, lazily, beside the Stripe client:

```ts
import {stripeBillingAdapter} from "@/lib/billing/stripe";
import {createTicketProcessor} from "@/lib/billing/ticket-webhook-processor";
import type {TicketProcessor} from "@/lib/billing/webhook-service";
import {emailEnv} from "@/lib/config/env";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";

let ticketProcessor: TicketProcessor | undefined;

function productionTicketProcessor(): TicketProcessor {
  ticketProcessor ??= createTicketProcessor({
    orders: eventOrdersRepository,
    refundPaymentIntent: (paymentIntentId) => stripeBillingAdapter().refundPaymentIntent(paymentIntentId),
    email: {
      renderEmail,
      transport: createConfiguredEmailTransport(),
      emailFrom: emailEnv().emailFrom,
    },
    now: () => new Date(),
    onEmailError(error, context) {
      // Never rethrow: the settlement is committed, and a 500 would make Stripe
      // redeliver a webhook that is already fully applied.
      console.error("ticket email failed", context, error);
    },
  });
  return ticketProcessor;
}
```

and change the production wiring from

```ts
  processEvent(event) {
    return processStripeEvent(event, stripeWebhookActor);
  },
```

to

```ts
  processEvent(event) {
    return processStripeEvent(event, stripeWebhookActor, undefined, productionTicketProcessor());
  },
```

`undefined` keeps the membership processor's default; the route's `Dependencies.processEvent` type is unchanged, so the existing route tests still compile. `eventOrdersRepository` gains an `eventSummary(eventId, locale)` read (event id → localized title) in Task 4.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/ticket-webhook.test.ts tests/unit/webhook*.test.ts tests/integration/woztell-webhook.test.ts && npm run typecheck`
Expected: PASS — including the existing membership webhook tests, which must be untouched.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/webhook-service.ts lib/billing/ticket-webhook-processor.ts lib/api/stripe-webhook-route.ts lib/db/repos/event-orders.ts tests/unit/ticket-webhook.test.ts
git commit -m "feat(billing): settle ticket orders from the Stripe webhook"
```

---

### Task 8: The staff price and mode

**Files:**
- Modify: `lib/admin/event-form-input.ts`, `lib/admin/event-action-core.ts`, `components/admin/event-form.tsx`, `app/[locale]/(admin)/admin/events-mgmt` (the page's labels), `lib/db/repos/events.ts`, `lib/events/public.ts`, `messages/en.json`, `messages/zh-HK.json`
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

**A. `lib/admin/event-form-input.ts`** — add the exported parser and the two fields:

```ts
/**
 * HKD is a two-decimal currency but staff price in whole dollars, so the form
 * takes dollars and the boundary converts to cents. A price on a non-ticketed
 * event is discarded rather than carried: the repository refuses it too, but
 * nulling it here keeps the form and the database answering the same question.
 */
export function parseTicketPrice(input: Readonly<{mode: string; price: string}>): number | null {
  if (input.mode !== "ticketed") return null;
  const trimmed = input.price.trim();
  const dollars = Number(trimmed);
  if (!trimmed || !Number.isFinite(dollars) || dollars <= 0) {
    throw new z.ZodError([{code: z.ZodIssueCode.custom, path: ["ticketPriceHkdCents"], message: "a ticketed event needs a positive price"}]);
  }
  return Math.round(dollars * 100);
}
```

and in `eventFormInput`'s returned object:

```ts
    registrationMode: String(formData.get("registrationMode") ?? "rsvp"),
    ticketPriceHkdCents: parseTicketPrice({
      mode: String(formData.get("registrationMode") ?? "rsvp"),
      price: String(formData.get("ticketPriceHkdCents") ?? ""),
    }),
```

**B. `components/admin/event-form.tsx`** — the form gains the mode select and the price. Extend `Labels` with `registrationMode: string; registrationModes: Readonly<{rsvp: string; external: string; ticketed: string}>; ticketPriceHkdCents: string;` and `Values` with `registrationMode: string; ticketPriceHkdCents: number | null;`, then add after the capacity field:

```tsx
    <label>{labels.registrationMode}
      <select {...fieldProps("registrationMode")} className="mt-1 w-full rounded-md border p-2" defaultValue={value("registrationMode", values.registrationMode ?? "rsvp")} name="registrationMode">
        {(["rsvp", "external", "ticketed"] as const).map((key) => <option key={key} value={key}>{labels.registrationModes[key]}</option>)}
      </select>{error("registrationMode")}
    </label>
    <label>{labels.ticketPriceHkdCents}
      <input {...fieldProps("ticketPriceHkdCents")} className="mt-1 w-full rounded-md border p-2" defaultValue={values.ticketPriceHkdCents == null ? "" : String(values.ticketPriceHkdCents / 100)} min="1" name="ticketPriceHkdCents" step="1" type="number"/>{error("ticketPriceHkdCents")}
    </label>
```

Add both names to the action state's field list in `lib/admin/event-action-core.ts` and the `Admin.eventsMgmt.events.form` labels to both bundles (`registrationMode`, `registrationModes.{rsvp,external,ticketed}`, `ticketPriceHkdCents`, `ticketPriceHkdCents.dollars` if the label needs the unit).

**C. `lib/db/repos/events.ts`** — the second layer. Add the field to `eventInputObjectSchema` immediately after `externalRegistrationUrl`:

```ts
  ticketPriceHkdCents: z.number().int().positive().nullable().optional().default(null),
```

Extend `addEventShapeIssues`:

```ts
function addEventShapeIssues(
  input: Readonly<{startsAt?: Date; endsAt?: Date | null; format?: string; onlineUrl?: string | null; registrationMode?: string; externalRegistrationUrl?: string | null; ticketPriceHkdCents?: number | null}>,
  context: z.RefinementCtx,
): void {
  // ...the existing three rules unchanged...
  const ticketed = input.registrationMode === "ticketed";
  if (ticketed && !(typeof input.ticketPriceHkdCents === "number" && input.ticketPriceHkdCents > 0)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["ticketPriceHkdCents"], message: "ticketPriceHkdCents is required for ticketed events"});
  }
  // Guarded on the mode being *present*: a partial update that changes only the
  // price of an already-ticketed event sends no mode, and the row's own mode
  // governs there — the database check is the backstop for that path.
  if (input.registrationMode !== undefined && !ticketed && input.ticketPriceHkdCents != null) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["ticketPriceHkdCents"], message: "ticketPriceHkdCents is only valid for ticketed events"});
  }
}
```

Omit the field from the member schema — a member may not price anything, and `.strict()` would otherwise admit it:

```ts
const memberEventInputSchema = eventInputObjectSchema
  .omit({published: true, memberOnly: true, status: true, ticketPriceHkdCents: true})
  .extend({visibility: z.enum(["public", "members_only"]), heroMediaId: z.string().uuid().nullable()})
  .strict()
  .superRefine(addEventShapeIssues);
```

The admin create/update path spreads the parsed input into Drizzle, so `ticketPriceHkdCents` reaches the column once the schema carries it, and `memberCreateEvent`'s explicit column list never names `ticket_price_hkd_cents` — leave it that way.

**D. The public projection.** Add the price to `PublicEventProjection` in `lib/events/public.ts` (`ticketPriceHkdCents: number | null;`) and to `projectPublicEvent`:

```ts
    registrationMode: event.registrationMode,
    ticketPriceHkdCents: event.ticketPriceHkdCents,
    externalRegistrationUrl: event.externalRegistrationUrl,
```

The admin edit page's `values` come from the Drizzle `Event`, so `registrationMode`/`ticketPriceHkdCents` ride along with no further mapping.

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

Create `tests/e2e/phase-d4a-ticket-checkout.spec.ts`:

```ts
import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{eventsMgmt: Readonly<{
    slug: string; titleEn: string; descriptionEn: string; startsAt: string; capacity: string; published: string;
    registrationMode: string; registrationModes: Readonly<{ticketed: string}>;
    ticketPriceHkdCents: string; create: string;
  }>}>;
  Ticket: Readonly<{
    heading: string; buyerName: string; buyerEmail: string; seatCount: string;
    attendeeName: string; attendeeEmail: string; submit: string;
  }>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const missing = missingM2LiveEnvironment();
const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

/**
 * Phase D-4a gate (spec §9): staff mark an event ticketed and set its price,
 * then a buyer takes two named seats and reaches Stripe Checkout. The walk stops
 * at the redirect — completing the payment needs the Stripe test dashboard and
 * is the owner's step — so it proves the amount, the seat rows and the session
 * reached the provider, not that the money moved.
 *
 * It writes, so `missingM2LiveEnvironment()` gates it to the isolated M2 database
 * and a unique slug per run keeps a re-run from colliding with the prior row.
 */
for (const {locale, prefix} of locales) {
  test(`staff price a ticketed event and a buyer reaches Stripe Checkout (${locale})`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
    const copy = bundle(locale);
    const slug = `d4a-ticket-walk-${locale === "zh-HK" ? "zh" : "en"}-${Date.now().toString(36)}`;
    const title = `D4a walk ${slug}`;

    // Staff author the ticketed event, in their own context so the buyer stays anonymous.
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await signInForM2(staffPage, "staff");
    await staffPage.goto(`${prefix}/admin/events-mgmt`);
    const form = staffPage.locator("form").filter({hasText: copy.Admin.eventsMgmt.slug}).first();
    await form.locator('input[name="slug"]').fill(slug);
    await form.locator('input[name="titleEn"]').fill(title);
    await form.locator('input[name="descriptionEn"]').fill("Ticket checkout acceptance walk.");
    await form.locator('input[name="startsAt"]').fill("2026-12-01T19:00");
    await form.locator('input[name="capacity"]').fill("4");
    await form.locator('select[name="registrationMode"]').selectOption("ticketed");
    await form.locator('input[name="ticketPriceHkdCents"]').fill("250");
    await form.locator('input[name="published"]').check();
    await form.getByRole("button", {name: copy.Admin.eventsMgmt.create}).click();
    await expect(staffPage.getByRole("link", {name: title})).toBeVisible();

    // The buyer, signed out, buys two named seats. The public page rendering at
    // all is the assertion that staff authoring left the event published and public.
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`${prefix}/events/${slug}`);
    await expect(buyerPage.getByText(copy.Ticket.heading)).toBeVisible();
    await buyerPage.locator('input[name="buyerName"]').fill("Ada Lovelace");
    await buyerPage.locator('input[name="buyerEmail"]').fill("ada@example.test");
    await buyerPage.locator('select[name="seatCount"]').selectOption("2");
    await buyerPage.locator('input[name="seatName-0"]').fill("Ada Lovelace");
    await buyerPage.locator('input[name="seatEmail-0"]').fill("ada@example.test");
    await buyerPage.locator('input[name="seatName-1"]').fill("Grace Hopper");
    await buyerPage.locator('input[name="seatEmail-1"]').fill("grace@example.test");
    await Promise.all([
      buyerPage.waitForURL(/checkout\.stripe\.com/),
      buyerPage.getByRole("button", {name: copy.Ticket.submit}).click(),
    ]);
    expect(buyerPage.url()).toContain("checkout.stripe.com");

    await staffContext.close();
    await buyerContext.close();
  });
}
```

Field names (`slug`, `titleEn`, `descriptionEn`, `startsAt`, `capacity`, `published`, `registrationMode`, `ticketPriceHkdCents`) and the `Ticket` namespace keys are the contract Tasks 5–8 establish; if a selector drifts, fix the selector and record why, never the gate sentence.

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
