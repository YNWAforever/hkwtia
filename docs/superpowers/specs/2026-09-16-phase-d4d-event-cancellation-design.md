# Phase D-4d — Cancelling an event, and refunding its orders

**Date:** 2026-09-16
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-4)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-16-phase-d4c-refunds-and-policy-design.md`
**Successor:** D-5 (domain cutover)

---

## 1. Why this slice

D-4c shipped a refund policy that promises, in public: **"If WTIA cancels an event, every paid order is
refunded in full."** That sentence is currently kept by hand, and the product cannot keep it at all:
there is no way to cancel an event. The state machine permits `published → cancelled`, but the only
caller of `canTransitionEvent` is the member-submission review decision, and the admin event form
exposes a `published` checkbox rather than a `status`, so staff have no control that reaches it.

D-4c was designed with this split already recorded: refunds by staff and the policy page shipped first,
and the cancellation action with its automatic refunds waited until the refund primitive was proven.
It is proven — `refundOrder` is provider-first, idempotent at the provider and conditional at the
commit — so D-4d can build the fan-out on it without inventing new money mechanics.

## 2. Scope

**In:**

- A staff **Cancel event** action with a confirmation that states the cost before it is paid.
- A **sweep job** that refunds every `paid` order belonging to a cancelled event.
- A **cancelled state** on the public event page and the pass page, so a link someone already holds
  resolves and says what happened.
- A new **system actor source** so an automated refund is recorded as automated.

**Out, deliberately:**

- **Notifying RSVP registrants.** Refunds cover paid orders only, so cancelling a free event emails
  nobody; §6 records that gap and its remedy rather than implying coverage.
- Reminder journeys for a cancelled event.
- **Re-instating a cancelled event.** `cancelled` is terminal in the state machine and stays terminal.
- Partial refunds, which D-4a and D-4c both kept out.
- Cancelling from anywhere except the admin event page.
- **No schema change and no migration.** The sweep's work list is a query, not a table.

## 3. Verified facts this design rests on

| Fact | Where it was verified |
|---|---|
| **No cancellation exists**: the admin event form has no status control (it derives status from the `published` checkbox) | `components/admin/event-form.tsx` |
| `published → cancelled` is permitted; `cancelled` is terminal | `lib/events/status.ts` |
| **`canTransitionEvent("cancelled", "cancelled")` is `true`**, because the table maps `cancelled` to `["cancelled"]` — so the table alone cannot refuse a second cancellation | `lib/events/status.ts` |
| `derivedEventFlags` sets `published: false` for `cancelled`, and the public filter requires `status = published`, so a cancelled event's page **404s today** | `lib/events/status.ts`, `lib/db/repos/events.ts` |
| D-4b's pass lookup refuses a cancelled event by returning `null`, which makes the pass page 404 rather than explain | `lib/db/repos/ticket-check-in.ts` |
| `refundOrder` is provider-first with a deterministic key and a conditional commit, and returns `refunded`/`already_refunded`/`not_admissible`/`provider_failed`/`not_found`/`commit_failed` | `lib/tickets/refund-core.ts` |
| `refundOrder` currently takes an `AdminActor`, and records `actorUserId`/`actorKind` on the audit row | `lib/tickets/refund-core.ts` |
| `systemActor` is typed to a single source, `"stripe-webhook"` | `lib/auth/authorize.ts` |
| The job pattern is a route under `app/api/jobs/<name>/` plus a `runProduction…` runner, batched by `RUNNER_BATCH_LIMIT` | `app/api/jobs/`, `lib/jobs/runners.ts` |
| D-4c's Orders section already shows every order of an event with its status and refunded date, and is where staff watch the sweep work | `components/admin/orders-table.tsx` |
| The public detail read is filtered by `status = published`; the listing uses the same filter | `lib/db/repos/events.ts` |

## 4. Decisions

Each was chosen in brainstorming with its alternatives; the rejected ones are recorded so a later
reader does not re-litigate them.

### 4.1 How staff cancel

**Decided:** a **dedicated Cancel event control** on the admin event page, separate from the edit form,
behind a confirmation that names the cost — how many paid orders will be refunded, the total, how many
paid attendees that covers, and how many RSVP registrants will be left un-notified.

**Rejected — a status field in the existing edit form:** the most destructive and irreversible
transition the product has would sit behind the same generic Save button as correcting a venue typo,
and a money-moving fan-out would fire as a side effect of an ordinary save.

**Rejected — a dedicated `/cancel` page:** the clearest separation and room for a dry-run list, at the
cost of another admin route and its inventory entry for one action. The confirmation panel already
carries the list's useful content: the counts and the total.

### 4.2 How the automatic refunds execute

**Decided:** a **sweep job**. Cancelling marks the event cancelled and nothing else; each run queries
the orders that are `paid` and belong to a cancelled event, and refunds them.

**Rejected — synchronous inside the cancel request:** a large event blocks one HTTP request for
minutes, a provider failure aborts midway with no retry but a re-click, and the staff member gets no
progress signal either way.

**Rejected — a bounded inline batch then a job:** two code paths for one outcome and a partial state
to explain, for a latency win that does not matter on an admin action.

**Rejected — an explicit queue or a per-event job record:** a new table and a migration in a slice
whose refund primitive was designed to need neither, plus an enqueue that can be lost if the cancel
request dies between marking the event cancelled and writing the rows.

### 4.3 How the job finds its work

**Decided:** **the query is the work list.** Every run selects `paid` orders of `cancelled` events,
bounded by the existing batch limit.

**Why it is safe to retry:** the refund commit is conditional on `status = 'paid'`, so a re-run cannot
refund an order twice, and a provider failure or a `commit_failed` leaves the order `paid` for the next
run. A missed run catches up. There is no state to lose because there is no state.

**Rejected — tracking progress on the event row** (a `refunding` status or a counter): a second notion
of "this event is being refunded" that the sweep derives for free, and a value that can disagree with
the orders it summarises.

### 4.4 Who the job refunds as

**Decided:** a new **`systemActor("event-cancellation")`** source, with `refundOrder`'s parameter
widened to admit it. The audit row records `actorType: "system"` and no user id — the same shape the
webhook's automated refunds already use.

**Rejected — a dedicated `cancellationActor()` capability actor:** more explicit about the capability,
but a second vocabulary for the same idea (an automated, non-user money writer) beside the one the
webhook already established.

**Rejected — acting as the staff member who cancelled:** it records a human action nobody performed,
and would need the canceller's identity stored on the event to do it.

### 4.5 What a cancelled event's public page does

**Decided:** the page stays **reachable** and renders a cancelled state; the `/events` **listing keeps
excluding** cancelled events.

**Why reachable:** someone holding a paid ticket clicks the link in the receipt they kept. A 404 tells
them nothing, and is indistinguishable from a broken link.

**Why still unlisted:** a cancelled event is not an opportunity to attend, and a browsing visitor who
found it in a list would be misled. Reachable by the link you already have, invisible to the public.

**Rejected — leaving it a 404:** the simplest, and it keeps the marketing surface clean, but it fails
the one person who matters here.

**Rejected — a second visibility mode to keep it listed:** a cancelled event in the listing invites
someone to try to attend it.

### 4.6 What is not notified

**Decided:** ticket buyers are told (they already receive the refund email when the sweep refunds
them); **RSVP registrants are not emailed by this slice**. The cancellation confirmation names the paid
attendees a refund covers *and* the RSVP registrants it will not email, and says plainly that those
registrants are not notified; staff can export the door list to contact them.

**Recorded consequence:** cancelling a **free** event emails nobody at all, because there are no paid
orders to refund. The confirmation must therefore not read as "nobody is affected": on such an event the
paid figures are legitimately zero and the registrant count is the only figure that shows anyone cares,
so the preview counts the member and guest registrations — not the paid seats — and the copy states the
consequence. The cancelled page state and the door-list export are the remaining remedy until a
notification slice exists.

**Rejected — emailing every RSVP registrant now:** the most complete outcome, and it would close that
hole, but it needs a new template in both locales, guest-versus-member addressing, and its own
acceptance coverage on top of an already multi-part slice. Recorded as a gap rather than quietly
dropped.

## 5. Design

### 5.1 The cancel write and its action

A repository write that locks the event row `FOR UPDATE`, verifies the transition, and commits the
status, its derived flags and its audit row together:

- **Refuse when the status is already `cancelled`**, explicitly and not via the transition table,
  because the table maps `cancelled` to `["cancelled"]` and would otherwise permit a second
  cancellation. This is the trap §3 records.
- **Refuse a transition the table forbids** — a `draft` or `rejected` event cannot be cancelled,
  because `canTransitionEvent` says so.
- Write `status = "cancelled"` with `derivedEventFlags` (so `published` becomes false) and an
  `event.cancelled` audit row in the same transaction, naming the actor.

The **action** is a staff-only, formData-shaped wrapper bound to the event path, like its siblings, and
revalidates the page.

**The confirmation is costed.** A `cancellationPreview(eventId)` read returns the number of `paid`
orders, the total that will be refunded, the paid attendees those orders seat, and the RSVP
registrants (member and guest registrations that are not themselves cancelled) that cancellation will
not email. The control renders that panel before it submits, so staff see the price of an irreversible
act rather than a bare yes/no — and, on a free event, see the registrants the paid figures cannot show.
The refusal copy for a status the table forbids says the rule it is enforcing: only a published event
can be cancelled (`draft`, `pending_review` and `rejected` are all refused), so the message describes
the statuses it is actually reached for.

### 5.2 The sweep

A job route under `app/api/jobs/` behind the cron bearer, plus a `runProduction…` runner, following the
existing job pattern and batch limit.

**A job route is not live until the Worker schedules it.** `workers/src/index.ts` is the only
scheduler, so the route, the `runProduction…` runner, the job's member of the Worker's `WorkerJob`
union, its entry in the hourly cron group and its `REQUEST_TIMEOUT_BY_JOB` deadline are one unit. A
route nothing triggers is dead code and the sweep's headline promise is silently inert, however
complete its own tests look. `workers/tests/worker.test.ts` fails if a declared job is absent from the
schedule, or if the scheduled crons drift from `workers/wrangler.toml`'s `[triggers] crons`.

Each run:

1. selects `paid` orders whose event is `cancelled`, bounded by the batch limit;
2. for each, calls the refund primitive as `systemActor("event-cancellation")` with a note recording
   that the event was cancelled;
3. tallies the outcomes (`refunded`, `already_refunded`, `provider_failed`, `commit_failed`, …) into
   the runner's result, which the route reports.

**No new table, no migration, and no progress state on the event.** The orders' own `status` is the
progress, and D-4c's Orders section is where staff watch it.

### 5.3 The actor

`systemActor`'s source union gains `"event-cancellation"`, and `refundOrder`'s actor parameter widens
from `AdminActor` to admit a system actor. The widened type must **not** admit an anonymous actor: the
staff path stays admin-only, and the job's authority comes from being the job.

The audit row then reads `actorType: "system"` with `actorUserId: null`, so an automated refund is
visibly not a person — which is what an auditor needs, and what the webhook's own refunds already do.

### 5.4 The cancelled public state

The **detail read** admits `published` or `cancelled` and projects a `cancelled` flag; the **listing
read** keeps its `published` filter. The page then renders:

- a prominent cancelled notice, in both locales;
- the event's title, date and venue, so the person recognises what they are looking at;
- a link to the refund policy;
- **no registration, checkout or RSVP control** — absent rather than disabled, so nothing invites a
  payment for an event that will not happen;
- `noindex`, because a cancelled event in search results is worse than one that is not there;
- `Event` structured data carrying **`eventStatus: EventCancelled`**, the schema.org-correct way to
  publish a cancelled event, rather than dropping the markup and looking like a normal listing.

### 5.5 The pass page says what happened

`passForSeat` currently returns `null` for a cancelled event, which renders a 404. It returns a
**discriminated result** instead — `active`, `cancelled`, or `unavailable` for an unpaid, refunded or
invalid seat — so the page can render "this event was cancelled" in both locales, with the refund
policy linked, while `unavailable` still 404s.

The **check-in** page keeps refusing a cancelled event, which its existing admissibility rule already
does: nothing should be admitted to an event that is not happening.

## 6. Error and edge cases

| Case | Behaviour |
|---|---|
| Event already `cancelled` | The action refuses explicitly, naming that it is already cancelled; no second audit row. |
| Event is `draft`, `pending_review` or `rejected` | Refused by the transition table; the action reports that only a published event can be cancelled. |
| No paid orders (a free event) | Cancelling succeeds, refunds nothing, and **emails nobody** — the recorded gap. |
| A provider failure mid-sweep | That order stays `paid`; the next run retries it. The event is still cancelled. |
| Two sweep runs overlap | One refund per order: the commit is conditional on `status = 'paid'`. |
| A staff refund lands before the sweep reaches that order | The sweep sees `refunded` and returns `already_refunded`; no second refund. |
| The event is cancelled while a checkout is in flight | The payment settles, the order becomes `paid`, and the next sweep refunds it. The webhook's own capacity/refusal rules are unchanged. |
| A cancelled event still has seats on the door list | True **while the sweep is still running**: those orders are `paid` until each is refunded, so they appear in the door list and in the Orders section. Nobody can be admitted — the check-in refuses a cancelled event — and the rows leave the list as the sweep reaches them. The Orders section is therefore also the sweep's progress signal. |
| The event page is opened by a browsing visitor | Not listed, so it is only reached by a link someone holds. |
| The `cancelled` flag is read by an existing reader | Existing readers filter `status = published` and see no change; only the detail read and the page changed. |

## 7. Security and privacy

- Cancelling is **staff-only**, and the transition is irreversible in the UI: the confirmation is the
  last opportunity to stop.
- The **job's authority is its own**, not a borrowed user's, and the audit says so.
- The cancelled page discloses **nothing new**: the same title, date and venue the listing already
  published, and no order or buyer data.
- The pass page continues to show only that seat's own facts, and telling someone their event was
  cancelled reveals nothing they did not already hold a link to.
- The sweep writes no new kind of record: it produces the same refund commits and audit rows the staff
  path does, with a system actor.

## 8. Testing

- **The cancel write:** status and derived flags move together; the audit row is written in the same
  transaction; an already-cancelled event is refused **without** a second audit row (a test that fails
  if the explicit refusal is removed, since the transition table permits it); a `draft` event is
  refused by the table.
- **The preview:** the paid-order count, the refund total and the paid-attendee count match the orders
  and seats, and the RSVP registrant count matches the member and guest registrations that are not
  cancelled — including a **free event** whose paid figures are zero, where the registrant count is the
  only figure that shows anyone is affected. The number staff read before an irreversible act is real.
- **The sweep:** refunds only `paid` orders of `cancelled` events and leaves a live event's paid orders
  alone; a provider failure leaves that order `paid` rather than recording a refund; the batch is
  bounded; the audit names the system actor with no user id.
- **The widened actor type:** an anonymous actor still cannot refund.
- **The public surfaces:** the cancelled page renders the notice and **no** form, is `noindex`, and
  publishes `EventCancelled`; the listing excludes it; the pass page distinguishes `cancelled` from
  `unavailable` and still 404s the latter; both bundles in parity.
- **The gated walk** extends D-4b's fixture: cancel the seeded event from the admin page, assert the
  confirmation named the cost, then assert the public page shows cancelled with no registration
  control, the listing no longer carries it, and the pass page says cancelled rather than 404ing. It
  stops short of the refund landing for the same reason D-4c's walk does — the fixture has no settled
  Stripe charge — so the walk says so rather than implying otherwise.

## 9. Risks

| Risk | Mitigation |
|---|---|
| An irreversible action taken by mistake | The costed confirmation names the orders, the total, the paid attendees and the RSVP registrants left un-notified before it submits, and the status is terminal by design. |
| A half-finished sweep | Self-healing: the next run picks up whatever stayed `paid`, and the commit cannot refund twice. |
| A double refund | The conditional `WHERE id = ? AND status = 'paid'` commit, already reviewed in D-4c. |
| Someone admitted to a cancelled event | The check-in and pass rules already refuse a cancelled event's seats. |
| A cancelled event leaking into the listing or into search | The listing filter is unchanged and the page is `noindex`, both with tests. |
| A buyer seeing nothing when they follow their receipt | The page and the pass both render a cancelled state rather than a 404. |
| Staff expecting RSVPs to have been emailed | §4.6 records that they are not, the confirmation names the registrant count and says they will not be emailed, and the door list exports. |

## 10. Definition of done

1. Staff can cancel an event from the admin event page, having been shown how many orders and how much
   money the confirmation will refund, and how many RSVP registrants it will not notify.
2. The sweep refunds every `paid` order of a cancelled event, and a provider failure leaves that order
   to the next run rather than recording a refund that did not happen.
3. An automated refund is recorded as a system action, not as a person's.
4. A cancelled event's page and its pass page both resolve and say the event was cancelled, with no way
   to register or pay, and the event is absent from the listing and from search.
5. `npm run audit:strings`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are
   green, with no migration in this slice.

## 11. Hand-off

- **Recorded gap:** RSVP registrants are not notified, so cancelling a free event emails nobody. A
  notification slice should own that, with its own template and consent story.
- **D-5** (domain cutover) is the last item in Phase D and is independent of this slice's code.
- The sweep is the only automated refund issuer besides the webhook's oversold and late-payment arms;
  all three share the refund primitive and the deterministic per-order key, so they cannot
  double-refund each other.
