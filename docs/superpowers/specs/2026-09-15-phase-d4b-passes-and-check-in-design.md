# Phase D-4b — Passes, per-attendee email, and check-in

**Date:** 2026-09-15
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-4)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-14-phase-d4a-ticket-checkout-design.md`
**Successor:** D-4c (staff refunds, automatic refunds on cancellation, the refund-policy page)

---

## 1. Why this slice

D-4a ends at a **paid order with named seats**. Nothing can be presented or admitted: the seat
rows carry a `checked_in_at` column that is written by nothing, and the receipt deliberately had its
"each attendee will receive their own pass" sentence removed because it was not yet true.

D-4b closes that gap and nothing else: a signed pass per seat, the pass email per attendee, and the
staff-only check-in surface — the three items D-4a's decomposition already named.

## 2. Scope

**In:**

- A per-seat signed capability token and the public pass page that renders the attendee's QR.
- The staff-only check-in view reached by scanning that QR, and the check-in and undo writes.
- The per-attendee pass email, and the receipt becoming a receipt (attendee list plus the pass
  sentence, now true).
- A **Resend pass** action on the door list, because a lost pass at the door is a real event.
- Ticket seats becoming a third arm of the existing door list, its CSV export and its check-in
  action.

**Out, deliberately:**

- Staff-initiated refunds, automatic refunds on event cancellation, and the refund-policy page —
  D-4c. D-4b only *reads* an order's status to refuse admission to a refunded seat.
- Any schema change. D-4b is migration-free.
- An in-browser camera scanner, offline check-in, seat transfers, and re-assignment of a seat to a
  different name.
- Per-seat expiry, rotation or a revocation list (see §4.1 for why the order's status is the
  revocation).
- Partial check-in of an order, and admitting an attendee whose order is not `paid`.

## 3. Verified facts this design rests on

| Fact | Where it was verified |
|---|---|
| `event_order_seats.checked_in_at` exists, nullable, and nothing writes it | `lib/db/schema-core.ts`; D-4a |
| The email transport sends only `to`, `from`, `subject`, `html`, `text`, `headers` — **no attachments or inline images** | `lib/email/transport.ts` (`EmailSendInput`) |
| The door list already carries a `kind` axis (`"member" \| "guest"`), a `status` and a `checkedInAt`, and is exported to CSV | `lib/db/repos/events.ts` (`EventAttendee`), `lib/admin/event-attendees.ts` |
| RSVP check-in requires a staff session, locks the row, and writes an audit row | `lib/db/repos/event-check-in.ts`, `lib/admin/events.ts` |
| No QR library is installed, and no QR or check-in code for tickets exists | `package.json`; tree search |
| Every public route lives under `app/[locale]/`, so the pass page must too | `app/` |
| `event_attended` engagement events are **written but read nowhere** | tree search for `event_attended` |
| The order stores the buyer's locale (`buyer_locale`), added by D-4a for exactly this purpose | `lib/db/schema-core.ts`; D-4a §4.1 |

## 4. Decisions

Each of these was chosen in brainstorming with its alternatives; the rejected ones are recorded so a
later reader does not re-litigate them.

### 4.1 The token, and what authorizes a check-in

**Decided:** a single dedicated secret `TICKET_PASS_TOKEN_SECRET` signs the tuple
`seatId | eventId | version` with HMAC-SHA256 into a base64url token, following the established
capability-token shape (the unsubscribe one-click token, the guest RSVP cancel token). It carries
**no expiry**. Validity is a fact the database already owns: the seat's order must be `paid` and its
event not cancelled.

**Rejected — an expiry.** A pass has to work at the door however long the event was booked out, and
an expiry that lapses mid-event is a failure mode with no upside; revocation is what we actually
want and the status already provides it.

**Rejected — a `seat_passes` table of opaque random tokens.** It buys per-pass rotation and an
explicit revocation list, at the cost of a table, a lookup and a second thing to keep in sync. The
only revocation the programme asks for follows from the order status, so this is flexibility nothing
consumes (YAGNI).

**Decided:** **the write requires a staff session.** The token preselects the seat; it does not
authorize admission. An attendee opening the check-in URL sees a staff sign-in prompt and nothing
else.

**Rejected — the token authorizes the write** (one tap after scanning, no login). Fastest at the
door, but anyone who receives or screenshots the pass link could check that seat in, and the
attendance record is exactly what staff rely on. **Rejected — flagging self-service vs staff
check-ins:** it adds a distinction with no consumer.

### 4.2 How the pass reaches the attendee

**Decided:** the email carries a link, and the pass itself is a public page. The email transport
cannot carry an inline image, and mail clients block remote images by default, so a page is the only
delivery mechanism that reliably renders a scannable code — and it is re-openable when the email is
lost.

**Rejected — a QR `<img>` pointing at our own PNG endpoint as well:** one more public surface to
secure for a tap that the pass page already saves.

**Rejected — a data-URI QR inside the email:** stripped by many clients, and there is then nothing to
re-open at the door.

### 4.3 How staff scan

**Decided:** the QR encodes the **staff check-in URL**; staff scan with the native camera app, which
opens the browser to a phone-friendly check-in page. The existing admin door list also gets a Check
in action for ticket seats, as the fallback when a pass cannot be produced (dead phone, lost email).

**Rejected — an in-browser camera scanner** (`getUserMedia` plus a QR decoder): a better in-app feel
for a client-side dependency, camera permissions and a mobile-only UI, when the native camera already
does the decoding for free.

**Rejected — deep link only, no door-list action:** no way to admit someone whose pass cannot be
produced.

### 4.4 Reversing a check-in

**Decided:** a staff-only **Undo** clears `checked_in_at` and writes its own audit row
(`event.seat.check_in_reversed`), so the trail shows both the mistake and the correction. The scan
page is one-way.

**Rejected — check-in is final:** a mis-scan at a busy door becomes permanent, and the only fix is a
database change the audit does not explain. **Rejected — a toggle from either surface:** every
toggle is a state flip with no reason recorded, and a double scan could silently un-admit someone.

### 4.5 Engagement events

**Decided:** check-in writes an **audit row only** — no `event_attended` engagement event.

Nothing reads `event_attended` today, and a seat is a name and an address rather than a member;
awarding points would invent member attribution that D-4a deliberately kept off the seat. This is a
recorded parity difference from the RSVP check-in path, not an oversight: when something reads
`event_attended`, the question of whether a ticket buyer earns points is a product decision with its
own answer.

## 5. Design

### 5.1 The pass capability and its routes

One token, two views:

| Route | Who | Behaviour |
|---|---|---|
| `/[locale]/pass/[token]` | anyone with the link | Read-only: attendee name, event, date, venue, and the QR. Never writes. |
| `/[locale]/admin/check-in/[token]` | a signed-in staff member | The only writer. Shows the same facts plus **Check in**, and **Undo** when already checked in. |

The locale comes from the order's stored `buyer_locale`, so a zh-HK buyer's link opens the Chinese
page and is consistent with their receipt.

Both views re-read the seat, its order and its event on every request — no caching, because the URL
is a capability. Both refuse with **404, not 403**, matching the CSV route's convention of never
confirming which ids exist.

The token is verified in constant time and carries a **version** field whose value is a single constant
in this slice's config, so the secret can be rotated by bumping that constant (invalidating old links
deliberately) rather than by silently reinterpreting every existing pass.

### 5.2 Data and the door list

**No new tables and no new columns.**

`EventAttendee.kind` gains a `"ticket"` arm carrying the seat's identity (`seatId`, `orderId`,
`position`), and `listEventAttendees` unions ticket seats for a ticketed event. This is why the door
list, its CSV export (`kind` is already its first column) and its check-in action cover tickets with
no new surface.

Two rules in that union:

1. A seat appears only while its order is `paid`.
2. A refunded order's seats drop out entirely — a refunded attendee is not on the door list.

Ticket rows are keyed by `seatId`, so check-in gets its **own bound action** rather than widening the
existing profile-keyed one. D-4a's fix waves showed that widening a signature which both sides of a
boundary substitute silently breaks every caller; a new action has no such seam.

### 5.3 The emails

| Email | Who | Content |
|---|---|---|
| `event_ticket_confirmation` (existing; becomes the receipt) | the buyer, once per order | Amount, order id, seat count, the attendees' names, and the sentence that each attendee receives their own pass — which D-4a removed precisely because it was not yet true. The attendee list is supplied as one **pre-joined string** (`{attendees}`), so the template engine needs no list support. |
| `event_ticket_pass` (new) | each attendee, once per seat | Their own name, the event, date, venue, and a CTA to `/[locale]/pass/[token]`. |

Both are sent from the webhook processor after settlement, best-effort behind the existing
`onEmailError` catch, so mail failure can never make Stripe redeliver an already-settled order.
Passes are sent only for a `paid` settlement; an oversold or late-paid order gets the refund email
instead.

**Idempotency, and the trap D-4a already hit once.** Keying a pass on `ticket-pass:<seatId>` alone is
stable across webhook redeliveries — which is wanted — but mail-provider idempotency keys live about
24 hours, so that key would silently suppress a *deliberate* resend after a redelivery window. The
key therefore carries the settlement instant: identical on a redelivery, different on a later,
intentional send. This is the lesson C-2's unbounded dedupe window taught, applied before it bites.

**Resend pass** is a small staff action on the door-list row (and only there) that sends with a fresh
attempt id, so it is never suppressed by the settlement-derived key.

### 5.4 The check-in write path

`lib/db/repos/ticket-check-in.ts`, mirroring `lib/db/repos/event-check-in.ts` with an injected
transaction:

- `checkInSeat(actor, {seatId})` — locks the seat row `FOR UPDATE`, confirms the order is `paid` and
  the event not cancelled, sets `checked_in_at`, and writes `event.seat.checked_in` (naming the
  event, order and position) **in the same transaction**. Returns `checked_in` or
  `already_checked_in`.
- `undoSeatCheckIn(actor, {seatId})` — locks, clears `checked_in_at`, writes
  `event.seat.check_in_reversed`. Returns `undone` or `not_checked_in`.

The row lock is what makes a double scan safe: two staff scanning the same pass simultaneously
produce one write and one `already_checked_in`, never two admissions.

The two Server Actions are formData-shaped wrappers in a `"use server"` module that exports nothing
else, so the actor-boundary discovery test keeps its teeth.

The staff view at `/[locale]/admin/check-in/[token]` requires a staff session and renders one of four
honest states: ready, already checked in (with the time and Undo), not payable or refunded, or an
invalid token. Because it exists only to be reached by scanning, it is deliberately **not** in
`config/internal-navigation.ts` and not in the admin nav; the admin-route discovery test gets an
explicit allowlist entry carrying that reason, rather than a silent exemption.

### 5.5 The QR

A server-rendered **SVG** from a new server-side QR dependency, inlined on the pass page. No image
endpoint, no client decoder, no image-processing dependency, and the capability never leaves our own
origin.

**Open at planning time:** the exact package. Candidates that generate SVG server-side with no native
build step (`qrcode`, `@nuintun/qrcode`) are equivalent for this use; the plan picks one and records
it. What matters for the design is the shape: server-side, SVG, no third-party origin.

## 6. Error and edge cases

| Case | Behaviour |
|---|---|
| Token tampered, wrong secret, or wrong version | 404 on both routes; nothing is read or written. |
| Order not `paid` (pending, expired, failed) | Pass page and check-in both 404. A pending order is not admission. |
| Order refunded (oversold, late payment, or a D-4c staff refund) | 404 on both; the seat is off the door list. |
| Event cancelled | 404 on both, regardless of order status. |
| Same pass scanned twice, or scanned by two staff at once | One write; the second reports already checked in. |
| Undo on a seat that is not checked in | `not_checked_in`; no audit row, no clear. |
| Resend requested twice | Two sends — a resend is intentional; the attempt id makes it explicit. |
| Attendee opens the check-in URL from the QR | Staff sign-in prompt; no seat data is disclosed before sign-in. |
| Pass email fails to send | Logged through `onEmailError`; the settlement stands and the door list can resend. |
| Seat email is the same as another seat's | Two passes, one per seat, which is the point of a per-seat pass. |
| `buyer_locale` is `zh-HK` | The pass link and receipt open the Chinese page. |

## 7. Security and privacy

- The token is a capability: it is never logged, never appears in an audit row, and is compared in
  constant time. Audit rows and logs name the **seat id**, never the token.
- The pass page is `noindex` and uncached, and shows only that seat's own facts — never the whole
  order, never other attendees' names or addresses, never the buyer's.
- The check-in write is staff-only and audited; the read page discloses nothing before a session.
- Refusals are 404 rather than 403 so neither route confirms which seats or events exist.
- The QR payload is the staff URL, so a public pass page does not publish a write path.
- A forwarded pass admits whoever presents it. This is inherent to a QR ticket; D-4b does not claim
  to defeat it, and the door list's undo is the operational remedy.

## 8. Testing

- **Token:** sign/verify round-trip, tampered payload, wrong secret, version mismatch, and a token
  for another event's seat.
- **Repository:** both dispositions for check-in and both for undo; the audit literals asserted by
  value (`event.seat.checked_in`, `event.seat.check_in_reversed`, `targetId` = seat id); the
  not-paid and cancelled-event refusals; concurrent double scan resolving to one write.
- **Door list:** ticket rows present for a paid order, absent for a pending or refunded one; the CSV
  gains the ticket rows with `kind` = `ticket`.
- **Pass page:** the full refusal matrix (invalid, not paid, refunded, cancelled) and the happy path,
  in both locales.
- **Emails:** the new template in both bundles in parity; snapshot regenerated and the diff read; the
  fixture variables complete; and **a test asserting every variable the pass copy uses is supplied**,
  because that failure is swallowed by the error catch and no other test can see it (the D-4a
  lesson).
- **Idempotency:** a redelivered settlement re-sends nothing, while a resend does send.
- **Boundary:** the `"use server"` discovery test covers the new action module.
- **Gated acceptance:** D-4b needs a **paid** order, which no walk can create without the Stripe
  dashboard, so it gets a separately guarded seed in the M6 mould (`db:seed:d4b`: requires
  `DATABASE_URL_TEST`, an allowlisted non-production host, and an explicit flag, and blocks
  production mode). The walk then runs the real sentence in both locales: open the pass link and
  assert the QR renders, open the staff check-in URL signed in and check in, assert the second scan
  reports already checked in, then undo and assert the seat is admissible again.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A forwarded pass admits the wrong person | Inherent to QR passes; staff see the attendee's name on the check-in card, and the door list's undo corrects a mis-scan. Recorded, not hidden. |
| Door connectivity is poor and check-in fails | The door list's manual Check in works over the same connection; offline check-in is explicitly out of scope and recorded as such. |
| The QR dependency is abandoned or has a supply-chain issue | Server-side only, one call site, no native build; swapping it is a one-file change. |
| Pass emails look like spam because the attendee did not buy | They are transactional, sent on the buyer's instruction, and go through the transactional transport, not the marketing dispatcher. |
| A resend storm hits the mail provider | Resend is staff-only and one row at a time; no bulk resend is offered. |
| The check-in page leaks seat data to a non-staff visitor | The page requires a session before rendering anything, and its data read happens after the session check. |

## 10. Definition of done

1. Staff admit a paid seat by scanning its pass, and the second scan reports already checked in.
2. Staff can undo a check-in, and the audit trail records both the check-in and the reversal.
3. Each attendee can open their own pass from their email and see a scannable QR, in their language.
4. A refunded or unpaid order's passes are refused by both views and absent from the door list.
5. `npm run audit:strings`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are
   green, with no migration in this slice.

## 11. Hand-off to D-4c

- D-4c's staff refund must not reuse `refundReason: "cancelled"`, which this lane's webhook treats as
  its own to re-issue (recorded in the D-4a plan).
- Once a refund clears `paid`, D-4b's door list and pass views already refuse that seat with no
  further change — the refund needs to update the order status and nothing else in this slice.
- Automatic refunds on event cancellation will produce exactly the cancelled-event refusal D-4b
  already implements for reads.
