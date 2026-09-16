# Phase D-4c — Refunds by staff, and the refund policy

**Date:** 2026-09-16
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-4)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-15-phase-d4b-passes-and-check-in-design.md`
**Successor:** D-4d (the event-cancellation action and its automatic refunds)

---

## 1. Why this slice

D-4a shipped checkout and orders; D-4b made a paid seat admittable. Nothing yet gives money back
except the machine: the webhook refunds an **oversold** or **late-paid** order automatically, and no
staff member can refund anything. There is also no public refund policy, so a buyer has nothing to
read before paying.

D-4 recorded three items under "refunds": whole-order refunds by staff, automatic refunds when a paid
event is cancelled, and the refund-policy page. Design work established that the middle item is not a
refund problem — **it presupposes a cancellation capability that does not exist** (see §3), and it
needs a fan-out with a partial-failure story, which is a different kind of problem from a button. It is
therefore split out as **D-4d**, and this slice is the two items that share one primitive.

## 2. Scope

**In:**

- Staff-initiated **whole-order** refunds, from an Orders section on the admin event page, with a
  confirmation that names the buyer, the seats and the amount.
- The public **refund-policy page**, its two links (the ticket form and the receipt email), and its
  inclusion in the sitemap and the staff page-copy editor.

**Out, deliberately:**

- The **event-cancellation action and its automatic refunds** — D-4d. This slice gives staff the tool
  that lets them honour a cancellation by hand in the meantime.
- **Partial refunds** (D-4a's decision stands), **buyer self-service refunds**, and refunding anything
  that is not a whole ticket order (memberships are Stripe subscriptions with their own lifecycle).
- Multi-currency. The amount is HKD only.
- Reversing a refund, which would mean re-charging.
- Any schema change: `event_refund_reason` already carries `staff`, and every column this needs exists.

## 3. Verified facts this design rests on

| Fact | Where it was verified |
|---|---|
| `event_refund_reason` is `oversold \| staff \| cancelled`, and `staff` is written by nothing yet | `lib/db/schema-core.ts` |
| `refundPaymentIntent(paymentIntentId, idempotencyKey)` exists and passes the key to the provider | `lib/billing/stripe.ts` (added by D-4a's fix wave) |
| The webhook's re-issue arm returns `refund_due` only for `oversold` or `cancelled` — **never `staff`** | `lib/db/repos/event-orders.ts`; D-4b's hand-off |
| A refunded order already stops being admittable: the door list filters `status = 'paid'` and the pass page refuses anything else | D-4b (`lib/db/repos/events.ts`, `lib/db/repos/ticket-check-in.ts`) |
| **No staff refund path exists** | tree search: no `refundOrder`/staff refund caller |
| **No cancellation action exists**, and the only caller of `canTransitionEvent` is the member-submission review decision | `lib/events/status.ts`, `lib/db/repos/events.ts` |
| No refund-policy route or copy exists | `app/[locale]/(public)/`, `messages/*.json` |
| A staff-editable page-copy system exists, driven by an allowlist of namespaces over the bundles | `lib/i18n/page-copy-catalog.ts`, `lib/i18n/page-copy-scope.ts` |
| The public route surface is registered in one place and feeds the sitemap | `config/public-routes.ts` |
| D-4b's acceptance fixture already mints a **paid** order with two named seats | `scripts/seed-d4b.ts` |

### 3.1 A repository-state note, not a design decision

**D-4b is merged but not on `main`.** PR #69 targeted `feat/phase-d4a-ticket-checkout`, which had already
been merged to `main` as #68, so `main` is at D-4a and D-4b's content sits on
`origin/feat/phase-d4a-ticket-checkout` (`e5fb3cc7`). This branch is therefore based on that commit,
because D-4c depends on D-4b. Bringing D-4b to `main` is an open release step, not a code change.

## 4. Decisions

Each was chosen in brainstorming with its alternatives; the rejected ones are recorded so a later
reader does not re-litigate them.

### 4.1 What D-4c covers

**Decided:** refunds by staff and the policy page. The cancellation action and its automatic refunds
are **D-4d**.

**Rejected — building the cancellation fan-out here:** it needs a cancel action and UI, a fan-out over
every paid order, resumability when a provider call fails midway, and notifications. That is a bulk
operation with a partial-failure story, and bundling it would make this slice's refund primitive and
its policy page wait on it.

**Rejected — shipping the refund machinery with no trigger:** a job that refunds cancelled events
nobody can cancel is an unreachable feature.

### 4.2 Where staff refund from

**Decided:** an **Orders section on the admin event page** — one row per order, with the Refund action.

**Rejected — a Refund control on the per-seat door-list rows:** a refund is per *order* and the door
list is per *seat*, so a three-seat order would show three identical refund buttons and an admission
list would perform a money operation. Each surface keeps one job.

**Rejected — a dedicated `/admin/events-mgmt/[id]/orders` route:** cleaner separation and room for
history later, at the cost of a route, a nav/inventory entry and a page for what is currently one
action.

### 4.3 Where a staff refund writes versus calls the provider

**Decided: provider first, then commit.** Call `refundPaymentIntent` with the deterministic
`ticket-refund:<orderId>` key, and only mark the order `refunded` (with its audit row) once the provider
accepts. A provider failure writes nothing, leaves the order `paid`, and leaves the button retryable.
If the provider succeeds and *our* commit then fails, a retry within the provider's idempotency window
is safe because the provider recognises the same key and returns the same refund rather than issuing a
second. That window is bounded — Stripe retains keys for roughly 24 hours — so a retry after it would
issue a second refund against an order still shown `paid`. A thrown commit therefore returns its own
`commit_failed` outcome that tells staff to check the payment provider before retrying, rather than a
generic error that invites a blind second attempt.

**Rejected — commit first, as the webhook does:** the webhook is recoverable because `settlePaid`
returns `refund_due` for an oversold order, but D-4b's hand-off records that its re-issue arm
deliberately excludes `staff`. Committing first would therefore record a refund that never happened,
with the money still taken and nothing to correct it.

**Rejected — a `refund_pending` status plus a job:** the most robust and the most machinery, adding a
status, a job route and a reconciliation story for an interleaving a synchronous action can avoid
entirely.

### 4.4 Where the policy text lives

**Decided:** a new `RefundPolicy` namespace in both bundles, added to the page-copy allowlist. Staff can
revise the wording in the existing editor without a deploy, and the shipped copy stays the build-time
fallback — the fail-soft behaviour M7.2 established.

**Rejected — a typed config content module** (the programme-records precedent): strongest for wording
that must not drift, weakest for WTIA changing a sentence without a release. A policy is prose, not a
record of fact.

**Rejected — structure in code with only prose in the bundles:** two places to look for one page's text.

### 4.5 Whether the policy may promise cancellation refunds before D-4d

**Decided: yes, and the mechanism is stated honestly.** "If WTIA cancels an event, we refund every paid
order in full." D-4c makes that true by hand — staff now have the tool — and D-4d makes it automatic, so
the sentence never needs rewriting. The policy describes whole orders only and says a single seat cannot
be refunded on its own, which is what the code enforces.

**Rejected — promising automatic processing now:** between D-4c and D-4d that describes behaviour no
code performs, which is the shape of the receipt sentence D-4a had to remove.

**Rejected — omitting the clause until D-4d:** nothing untrue is published, but the policy must then be
revised, and a buyer asking about a cancellation finds no answer.

### 4.6 The two tests that make the ordering safe

**Decided:** the refund path is asserted on **behaviour**, not on configuration — a provider that throws
leaves the order `paid` and unmodified, and a conditional commit that matches zero rows yields
`already_refunded`. Both are the observable consequences of §4.3, so a reordering fails a test rather
than passing one.

## 5. Design

### 5.1 The refund path

`lib/tickets/refund-core.ts`, mirroring `checkout-core.ts`: injected `{orders, stripe, now}` with a
`defaultDependencies()` fallback, so the money path is unit-testable with fake adapters and no session.

`refundOrder(actor, {orderId})` returns a discriminated result rather than throwing, because every
refusal is a distinct thing staff must see:

| Result | When |
|---|---|
| `refunded` | the provider accepted and the order committed to `refunded` |
| `already_refunded` | the conditional update matched no row |
| `not_admissible` | the order is not `paid` (pending, expired, failed) |
| `provider_failed` | the provider refused or the network failed; **nothing was written** |
| `commit_failed` | the provider accepted, but our commit threw; the order is still `paid` and the money **may** have moved |
| `not_found` | no such order |

Order of operations: read the order → refuse unless `paid` → `refundPaymentIntent(paymentIntentId,
"ticket-refund:" + orderId)` → then commit.

The commit is conditional, with the audit row in the same transaction:

```sql
UPDATE event_orders SET status = 'refunded', refunded_at = ?, refund_reason = 'staff'
WHERE id = ? AND status = 'paid'
```

Zero rows affected means another request refunded it first: the result is `already_refunded`, so two
staff clicking at once produce one refund and one honest message, never two audit rows claiming a
refund.

`refund_reason` is always `staff`; the optional free-text note lives in the audit metadata
(`event.order.refunded`, `metadata: {reason: "staff", note}`), where it explains the decision without a
new column. Using `cancelled` is forbidden: the webhook treats that reason as its own to re-issue.

The seats release themselves. `status = 'refunded'` already removes them from D-4b's door list and makes
the pass page and check-in refuse, so a refund changes nothing else.

### 5.2 The Orders surface

A new staff read, `listEventOrders(actor, eventId)`, returns one row per order — id, buyer name, buyer
email, amount, currency, status, paid and refunded timestamps, and the seat count with the seats' names
— newest first. It follows the door list's conventions: `requireAdmin`, and **`null` rather than an
empty array when the event does not exist**, so the page can 404 instead of rendering a section that
looks empty.

The admin event page gains an **Orders** section, rendered only for a ticketed event, beside the
attendees table:

| Status | Rendered |
|---|---|
| `paid` | the refund action is offered |
| `refunded` | the refunded date; no action |
| `pending` / `expired` / `failed` | their own labels; no action (nothing to refund) |

**Refund is two steps.** The button reveals a panel naming the **buyer, the seat names and the exact
amount**, with an optional note, and only then submits. The seat names are the point: "refund Ada
Lovelace, Grace Hopper — HK$500.00?" distinguishes the right order, where the amount alone would not.

Every outcome is visible and distinct, because the six results mean six different things to a staff
member: `refunded` announces the row is refunded; `already_refunded` says so and revalidates;
`provider_failed` says **nothing was charged back** so staff know to retry; `commit_failed` says the
provider may have refunded while nothing was recorded, so staff must check the provider before
retrying; `not_admissible` and `not_found` have their own messages.

The action revalidates the event page, so the Orders row and the door list update together.

A committed refund also emails the buyer. `sendOrderRefundEmail` (in
`lib/billing/ticket-webhook-processor.ts`) is the same `event_ticket_refunded` send the webhook's
oversold lane makes, re-using the same `ticket-refund:<orderId>` transport key so a re-issue collapses
rather than mailing twice. It is best-effort and runs after the commit: a mail failure is logged and
never changes the outcome of a completed refund.

A failed orders read renders as an error, never as "no orders": an empty section and an unreachable
table must not look alike, which is the distinction this repo draws for its other admin queues.

### 5.3 The refund-policy page

A public route at `/[locale]/refund-policy`, locale-prefixed like every other public page, with a
`RefundPolicy` namespace in both bundles added to `lib/i18n/page-copy-scope.ts`. The page-copy catalog is
derived from the English bundle, so the editor's fields cannot drift from keys the page resolves.

The policy states, in order:

1. **When we refund** — whole orders, at WTIA's discretion, when a request is justified; a single seat
   cannot be refunded on its own.
2. **If we cancel an event** — every paid order is refunded in full (§4.5).
3. **How and when** — the original payment method, once the provider processes it; timing depends on the
   buyer's bank.
4. **How to ask** — the existing contact route.

The route is registered in `config/public-routes.ts` so it appears in the sitemap, and carries
`BreadcrumbList` JSON-LD like the other public pages.

### 5.4 The two links

- **The public ticket form** gains a one-line link beside the price/CTA, in both locales — where a buyer
  is about to pay.
- **The receipt email** (`event_ticket_confirmation`) gains the same link through a new
  `{refundPolicyUrl}` variable, built from the order's own locale. That changes the template snapshot and
  grows the variable-completeness test, which is the guard for a placeholder that is otherwise invisible
  because the renderer's error is swallowed.

It is deliberately **not** added to the pass email: the receipt is the money record and the pass is the
admission record, and that split is what D-4b settled.

## 6. Error and edge cases

| Case | Behaviour |
|---|---|
| Order not `paid` | `not_admissible`; the action explains there is nothing to refund. No provider call. |
| Order already refunded, including by the webhook's oversold path | `already_refunded`; the initial read refuses before any provider call, so nothing is sent. |
| Provider refuses or the network fails | `provider_failed`; **no write**; the order stays `paid` and the button stays. |
| Provider succeeds, our commit fails | `commit_failed`: the order stays `paid` and no email is sent. A retry within the provider's idempotency window re-issues under the same key and returns the existing refund rather than a second; after that window (roughly 24 hours for Stripe) it would issue a second refund, which is why the message tells staff to check the provider first. |
| Two staff refund the same order at once | Both reads see `paid` and both call the provider, but the shared key makes the second a no-op that returns the first refund; one commit succeeds and the other reports `already_refunded`. The duplicate call is wasted work, never a double refund. |
| The order's event was cancelled | A staff refund is still permitted; D-4d will automate the same outcome. |
| The orders read fails | The section renders an error, not an empty state. |
| A refund on an order with one seat | Same flow; the confirmation names that one attendee. |
| A policy namespace edited by staff | Text only; the structure and the cancellation sentence are fixed in code, and the shipped copy is the fallback. |

## 7. Security and privacy

- Refunds are staff-only, and the actor boundary is enforced the way every other admin action enforces
  it: the `"use server"` module exports only formData-shaped wrappers, and the actor is resolved inside.
- The refund reason and note are audit data, not buyer-facing copy; the buyer's email states the amount
  and the order, and never the internal reason.
- The Orders section names buyers and attendees to staff who already see the same people in the door
  list, so it discloses nothing new within the admin surface.
- The policy page is public and carries no order or buyer data.
- A staff refund cannot be issued for an order that was never paid, so the endpoint cannot be used to
  move money for an unpaid order.

## 8. Testing

- **`refund-core`:** all six outcomes; **a provider throw leaves the order `paid` and unmodified**
  (assert no update); a payment-intent read that *throws* also yields `provider_failed`; a commit that
  throws yields `commit_failed` while a commit matching zero rows yields `already_refunded`; the
  provider is called with the deterministic `ticket-refund:<orderId>` key; the audit literal and
  `{reason: "staff", note}`; a committed refund sends exactly one `event_ticket_refunded` with the
  order's locale and amount, and a mail failure does not change the outcome.
- **The repository:** the conditional update moves only a `paid` row; the audit row is written in the
  same transaction; the orders read returns `null` for a missing event and excludes nothing else.
- **The Orders section:** each status renders its label (a missing label would render a placeholder, the
  trap D-4b's review caught one map away); a refunded row offers no action; a read failure renders an
  error rather than an empty section; the confirmation names the buyer, the seats and the amount.
- **The action:** exports only the formData wrapper (the actor-boundary discovery test); refuses without
  a session; maps each outcome to its own message; revalidates the event page.
- **The policy page:** both locales render the namespace; the route is in the sitemap; the namespace is
  in the page-copy allowlist; the ticket form carries the link; the receipt supplies
  `{refundPolicyUrl}` and the variable-completeness assertion covers it.
- **The gated walk reuses D-4b's fixture** (`db:seed:d4b` already creates a paid order with two named
  seats): staff refund it through the confirmation, then assert the three observable consequences — the
  row shows refunded, the seats leave the door list, and the pass URL 404s. The refund email is not
  asserted here, because the walk cannot read a mailbox; its send is asserted at unit level, where the
  staff refund drives the real `sendOrderRefundEmail` through a fake transport
  (`tests/unit/refund-email.test.ts`). The walk needs a database, so it skips cleanly and names what is
  missing, exactly as D-4b's does.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Refunding the wrong order | The confirmation names the buyer and the seat names, not just the amount. |
| A provider outage mid-refund | Nothing is written, so no refund is recorded that did not happen; the retry is idempotent at the provider. |
| A double refund from two clicks | The conditional commit plus the shared provider key yield one refund and one `already_refunded`. |
| A staff member refunding without authority | Staff-only, audited, with the actor recorded on both the row's transition and the audit event. |
| The policy text promising something the code does not do | The editor writes text only; the structure and the cancellation sentence are code, and the clause is true by hand from this slice. |
| The receipt's new placeholder being invisible when missing | The variable-completeness test, extended with the new placeholder. |

## 10. Definition of done

1. Staff can refund a whole order from the event page, with one confirmation naming the buyer, the seats
   and the amount.
2. A provider failure writes nothing and says so; a second refund reports already refunded without a
   second audit row.
3. A refunded order's seats stop being admittable everywhere (door list, pass page, check-in).
4. The refund-policy page is public, in the sitemap, editable in the page-copy editor, and linked from
   both the ticket form and the receipt email.
5. `npm run audit:strings`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are green,
   with no migration in this slice.

## 11. Hand-off to D-4d

- D-4d owns the **event-cancellation action** and the **automatic fan-out** for a cancelled paid event;
  §4.1 records why it was split out rather than dropped.
- The fan-out is a **job**, not a request: a cancelled event may have many paid orders, and a partial
  failure must be resumable. Its per-order work is `refundOrder`, which this slice makes idempotent.
- The webhook's re-issue arm excludes `staff`, and §4.3 keeps it that way, so D-4d must not expect the
  webhook to re-issue a staff refund.
- The policy **already promises** the cancellation guarantee (§4.5), so D-4d is fulfilling a published
  commitment rather than inventing one; the clause does not need editing when it ships.
