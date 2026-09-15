# Phase D-4a — Ticket checkout and orders

**Date:** 2026-09-14
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-4)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-14-phase-d3-ai-writers-design.md`

---

## 1. Why this slice

Programme D-3 shipped the public surface. D-4 is the last one: **paid ticketing**. Phase B
deliberately shipped only RSVP, a waitlist, guest RSVP and `external` registration links, so
that Stripe one-time payment, orders and refunds waited until member event publishing was
proven. It is proven, and `registration_mode` has carried a `ticketed` value, unused, since
Phase B1.

D-4 is larger than one reviewable slice, so it splits three ways, in the order a ticket travels:

| Slice | What it adds |
|---|---|
| **D-4a** (this) | A price on a staff-created event, a multi-seat order bought through Stripe Checkout in payment mode, seat holds, the webhook that settles an order, and the buyer's confirmation. |
| D-4b | A signed QR pass per attendee, the per-attendee email, and the staff-only check-in URL and view. |
| D-4c | Whole-order refunds by staff, automatic refunds when a paid event is cancelled, and the refund-policy page. |

D-4a ends at a **paid order with named seats**; nothing can yet be presented or admitted.

## 2. Scope

**In:**

1. A staff-set ticket price on a staff-created event (`events.ticket_price_hkd_cents`).
2. `event_orders` and `event_order_seats`: one order, many named seats.
3. A Stripe Checkout session in **payment mode** for a member or guest buyer.
4. Seat **holds** with an expiry, capacity taken under the event row lock, and a re-check at
   payment with an automatic refund of an oversold order.
5. The `checkout.session.completed` / `checkout.session.expired` webhook branches discriminated
   by `metadata.kind = 'event_ticket'`.
6. The buyer's confirmation email, listing the order and its seats.

**Out, with reasons:**

| Item | Why not |
|---|---|
| Member organisers pricing their own events | **Recorded decision.** WTIA's Stripe account both collects and refunds; a member-set price on it needs a payout and refund-liability process that does not exist. Only staff-created events can be ticketed, and only staff set the price. Member events keep `rsvp`/`external`. |
| QR passes, the per-attendee email, check-in | D-4b. A pass needs a paid seat to point at. |
| Refunds and the refund-policy page | D-4c. D-4a refunds only what it must: an oversold order. |
| Partial (per-seat) refunds | **Recorded decision.** One payment, one refund; the policy page will say so. |
| Multi-currency | WTIA prices in HKD. `currency` is stored so the column is honest, always `hkd`. |
| Discount codes, taxes, invoicing | Not asked for; each is its own slice. |

## 3. Verified facts

| Fact | How it was checked |
|---|---|
| `registration_mode` already carries `ticketed`, unimplemented | `lib/db/schema-core.ts:135`; the member form coerces anything but `external` to `rsvp` (`lib/events/member-contract.ts:41`) |
| A guest is already refused a ticketed RSVP | `lib/events/guest-registration-core.ts:113` maps `EVENT_REGISTRATION_TICKETED` to `external` |
| Capacity is enforced under an event row lock for RSVP, with a waitlist | `lib/db/repos/events.ts:428` (`for("update")`), `:451` |
| The Stripe adapter creates **subscription** sessions only | `lib/billing/stripe.ts:60` (`mode: "subscription"`) |
| The membership webhook requires `membershipId`, `applicationId`, `planCode` | `lib/billing/webhook-service.ts:13` (`metadataSchema.strict()`), `:44` |
| Check-in timestamps live on the RSVP tables | `event_registrations.checked_in_at` (`:887`), `event_guest_registrations.checked_in_at` (`:1339`) |

## 3.1 The programme spec's `event_orders` shape, superseded by two decisions

The programme spec describes `event_orders (event, registration, amount_hkd, currency,
stripe_checkout_session_id, status)` — one registration per order, with a decimal amount. The
owner chose **multi-seat orders with named attendees**, and money is stored as integers:

- `registration` gives way to an `event_order_seats` child table, because one order names many
  attendees and only one of them, if any, has an account.
- `amount_hkd` becomes `amount_hkd_cents`, because a price must never be a float and Stripe's
  `unit_amount` is already integer cents. `currency` is kept.
- a `stripe_checkout_url` column is added, because a repeated idempotency key must return the
  exact session URL it already minted rather than mint a second one or guess it from the id.

## 4. Design

### 4.1 Schema

One generated migration (Drizzle):

- `events.ticket_price_hkd_cents` — nullable integer, HKD **cents**.
  Check: `registration_mode <> 'ticketed' OR (ticket_price_hkd_cents IS NOT NULL AND ticket_price_hkd_cents > 0)`.
- `event_order_status` — a **new** enum: `pending | paid | expired | failed | refunded`.
  Creating an enum and defaulting a column to one of its values in the same migration is safe;
  the Phase C transaction trap applies to `ALTER TYPE … ADD VALUE`, not to a new type.
- `refund_reason` — a nullable enum: `oversold | staff | cancelled`. A refund says *why* without
  multiplying statuses; D-4a only ever writes `oversold`.
- `event_orders` — `id`, `event_id` (FK, cascade), `buyer_profile_id` (FK profiles, set null),
  `buyer_name`, `buyer_email`, `amount_hkd_cents`, `currency` (default `hkd`),
  `status` (default `pending`), `stripe_checkout_session_id` (unique), `stripe_checkout_url`,
  `idempotency_key` (unique), `expires_at`, `paid_at`, `refunded_at`, `refund_reason`, timestamps.
- `event_order_seats` — `id`, `order_id` (FK, cascade), `position`, `attendee_name`,
  `attendee_email`, `checked_in_at`, `created_at`; unique `(order_id, position)`.

Money is integer cents everywhere: no float is ever a price, and Stripe's `unit_amount` is the
same integer.

### 4.2 Buying a ticket

`components/marketing/ticket-checkout-form.tsx` replaces the RSVP form on a ticketed event's
public page. It collects the buyer (name and email; prefilled and linked to the profile for a
signed-in member), a seat count (1–10), and one attendee name and email per seat. It posts to
`lib/tickets/checkout-actions.ts` (a `"use server"` module that resolves its own actor and
exports no actor-taking helper), which delegates to `lib/tickets/checkout-core.ts`:

1. Validate the event: published, `registration_mode = 'ticketed'`, `starts_at` in the future.
2. Validate the seats and **compute the amount server-side** — `ticket_price_hkd_cents × seats`.
   A client-supplied amount is never read.
3. Take the event row lock (`SELECT … FOR UPDATE`, the shape `events.ts:428` uses) and read
   `heldSeats(eventId, now)`.
4. If `capacity !== null && heldSeats + seats > capacity` → refuse with `SOLD_OUT`.
5. Otherwise write the pending order (`expires_at = now + 30 minutes`) and its seats, then create
   the Stripe session:

```
mode: "payment"
line_items: [{price_data: {currency: "hkd", unit_amount: <price>}, quantity: <seats>}]
client_reference_id: <orderId>
metadata: {kind: "event_ticket", orderId}
expires_at: <now + 30 minutes>      # Stripe's clock and ours agree on the hold
success_url / cancel_url: the event page
idempotencyKey: <order.idempotency_key>
```

The form mints one hidden `idempotencyKey` when it first renders (client state, so a retry after
a network error reuses the same key rather than minting another); a second submit with that key
conflicts on the unique index and returns the existing session URL rather than charging twice.

### 4.3 Holds and capacity

`heldSeats(eventId, now)` is a derived read, never a counter: the count of
`event_order_seats` whose order is `paid`, **or** `pending` with `expires_at > now`. Expiry is
lazy — an expired pending order simply stops counting, and `checkout.session.expired` moves its
status. There is no job in the critical path, so an abandoned checkout cannot block a seat
forever and a missed sweep cannot oversell an event; and because the count is derived, a refund
or a status change cannot leave it drifting.

### 4.4 The webhook

`lib/billing/webhook-service.ts` gains a **ticket branch** ahead of the membership normaliser:
when `object.metadata.kind === "event_ticket"`, the event is normalised into a
`TicketWebhookCommand` (`orderId`, `checkoutSessionId`, outcome) and dispatched to a ticket
processor. Everything else — signature verification, `WebhookInputError`, the route — is shared.

| Stripe event | Effect |
|---|---|
| `checkout.session.completed` | An already-`paid` order is a no-op. Otherwise take the event row lock, re-check capacity **excluding this order's own seats**, then either mark `paid` or refund in full and mark `refunded`/`oversold` with a staff notification. Then send the buyer's confirmation. |
| `checkout.session.expired` | A `pending` order becomes `expired`. |

Every status transition writes an `audit_events` row in the same transaction (`order.paid`,
`order.refunded` carrying the reason), so money movement is legible after the fact. An oversell
refunds in full, writes that audit row, and emails the buyer that they were refunded; staff see
the refunded order in the admin list. A separate staff alert email is out of D-4a's scope and is
recorded rather than implied.

The re-check exists because two buyers can each pass the creation check against the same last
seat; the lock makes the payment-time decision final, and the refund is the honest way to lose a
race rather than to oversell.

### 4.5 Admin

The admin event form (staff) offers `registration_mode = ticketed` and, when chosen, a price in
HKD; the price is required for that mode and refused otherwise. The admin event page shows the
paid and held seat counts beside capacity, so staff can see a filling event. Member event forms
do not offer `ticketed` and cannot set a price.

### 4.6 The confirmation

On payment the buyer receives one email listing the order (event, seats, amount, order id), and
on a refund one email saying the payment was returned. D-4b adds the per-attendee pass email.
Delivery uses two new templates in `lib/email/catalog.ts` (`event_ticket_confirmation`,
`event_ticket_refunded`) and the configured email transport — the same path the guest RSVP
confirmation uses. `lib/notifications/dispatch.ts` is deliberately **not** used: its own
documentation records that its gate is a marketing classifier, so a transactional send through
it would be refused for a buyer who never gave marketing consent, which is every guest. Both
sends happen after the order has settled and are best-effort: a mail failure is logged and never
turns the webhook into a 500 that Stripe would retry forever.

## 5. Error and edge cases

| Case | Behaviour |
|---|---|
| Sold out | Refused at creation; the webhook re-check covers the race |
| Not published, not ticketed, or already started | Refused |
| 0, negative, or more than 10 seats; a seat missing a name or email | Validation error |
| Stripe session creation fails | The order stays `pending` and expires; a clear error, no charge |
| Duplicate submit | One order, one charge; the existing URL is returned |
| Webhook redelivery | An already-paid order is a no-op |
| `completed` after the hold expired, seats still free | Honoured and marked paid |
| Oversell at payment | Full refund, `refunded`/`oversold`, staff notified |
| `capacity` null | Unlimited; no hold check |
| Client-supplied amount | Ignored |

## 6. Security and privacy

- The amount and seat count are server-derived; the request carries only attendee details.
- The webhook reads only ids from `metadata`; signature verification and the route are unchanged,
  and a membership event still normalises exactly as before.
- Attendee name and email are PII on `event_order_seats`; **no retention sweep covers orders
  today.** This is recorded as an owner/PDPO question to answer before go-live, the same shape as
  the Phase C retention question.
- The anonymous buyer path keeps the honeypot and rate limiter the guest RSVP uses; Turnstile is
  not required, because a bot cannot complete a payment, but the limiter bounds pending-order spam.
- Live keys reuse `billingEnv`; test-mode acceptance uses the documented `STRIPE_TEST_*` values.

## 7. Testing

| Piece | Approach |
|---|---|
| Schema | Enum, columns and the `ticketed ⇒ price` check. |
| Repository | `heldSeats` counts paid and unexpired pending seats, ignores expired; the transitions; the unique constraints. |
| Core | Sold-out and unlimited capacity, server-side amount, seat validation, idempotency, event-state guards, member versus guest buyer. |
| Webhook | Ticket detection; duplicate; oversell refund; expiry; **membership events unaffected**. |
| Component | Seat rows, member prefill, validation messages. |
| Admin form | `ticketed` requires a price. |
| Acceptance | A real Stripe test-mode purchase is an **owner acceptance step** (gated), not a CI test. |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Two buyers take the last seat | Both checks are under the event row lock, and the loser is refunded automatically |
| A double submit charges twice | A unique `idempotency_key` on the order and a Stripe idempotency key |
| A hold blocks a seat after abandonment | The hold expires in 30 minutes, written into the Stripe session; expiry is lazy, so no sweep is load-bearing |
| A refund leaves the seat count wrong | The count is derived from seat rows and order status, never a counter |
| A member event is priced by a member | Staff-only by construction: the member form cannot select `ticketed`, and the repository refuses a price on a non-ticketed event |
| Test keys against production | Test-mode acceptance uses `STRIPE_TEST_*` against the isolated database, as the M1/M2 docs already require |

## 9. Definition of done

1. Staff can mark an event ticketed and set its HKD price; a member event cannot.
2. A member or guest buys 1–10 named seats through Stripe Checkout in payment mode, and a paid
   order exists with one seat row per attendee.
3. Capacity holds at checkout and is re-checked at payment; an oversold order is refunded
   automatically and never admitted.
4. An expired or failed checkout leaves no charge and releases its seats.
5. `npm run audit:strings`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`
   are green.

Not in scope and not claimed: the QR pass and per-attendee email, the check-in flow, refunds by
staff, the refund-policy page, partial refunds, and multi-currency.
