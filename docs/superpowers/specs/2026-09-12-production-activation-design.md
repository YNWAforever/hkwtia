# Production activation — proving the two-sided platform actually works

**Date:** 2026-09-12
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md`
**Status:** design, approved 2026-09-12

## 1. Why this phase exists

Phases A, B and C are merged. None of what sits behind authentication has ever been
exercised by a real person in production, because **sign-in itself did not work until
today** (PRs #55/#56/#57: Neon redirects a verified magic link back with a one-time
verifier that nothing in the app exchanged for a session, so `/member-login` re-rendered
its own form forever). The first successful sign-in, minutes after #57 was promoted,
immediately hit a `FORBIDDEN` crash on `/portal` that had been sitting there unreachable
the entire time.

That is the shape of the problem this phase addresses: **merged is not working.** The gap
has three parts.

| Gap | Evidence |
|---|---|
| Bugs reachable only once signed in | A staff sign-in lands on `/portal` and throws `FORBIDDEN` |
| Schema behind the code | Phase B2's `0028`–`0030` and Phase C's `0031`–`0034` are believed unapplied to production |
| Nothing verified end to end | No member, staff or public surface has been walked on a migrated production database |

Phase D (growth: SEO/GEO, member tools, AI writers, ticketing, domain cutover) stays
untouched. Phase C **activation** — the `RUN_LIVE_WOZTELL` flip and its Meta/Woztell
dependencies — is a separate track and explicitly out of scope here.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| P-1 | Scope is "make what is built actually work", not Phase D | Nothing behind auth has ever run in production; building more on an unverified base compounds the risk |
| P-2 | Production migrations are rehearsed on a Neon branch first, then applied to production, with verification output captured at both ends | Production state has already drifted from `main` once this session; a branch cut from production has the real data shape |
| P-3 | The done gate is four end-to-end walks: staff→admin, member→portal, public surfaces, join funnel | Owner's answer |
| P-4 | The paid leg of the join funnel is deferred — verified up to Checkout session creation, no live charge | Owner's answer. The charge and the webhook activation leg get their own verification later |
| P-5 | The test member is created through a new **admin capability**, not a hand-written SQL insert | Surgery proves a path staff cannot reproduce, and the gap bites again the first time WTIA comps a membership or repairs a failed checkout |

## 3. Two corrections this design carries

Both were found by checking rather than assuming, and both would have produced wrong work.

**`membershipsRepository.create` does not accept an admin actor.** The pitch for P-5
claimed the capability already existed and merely lacked a UI. It does not:

```ts
async create(actor: Actor, input: MembershipInput) {
  if (actor.kind !== "member" && actor.kind !== "system") forbidden();
```

`update` and `remove` refuse admins the same way. Memberships are deliberately not
staff-writable today — only a member acting on themselves, or `system` (the Stripe
webhook). So this phase adds an authorization surface rather than exposing one.

**`docs/integration/phase-c-whatsapp-go-live.md` row 1 is stale.** It verifies
`SELECT count(*) FROM whatsapp_templates` is **9**. PR #54's reconciliation added
`event_reminder_24h_zh_hk`, so the correct expectation is **10**. The same row's claim
that `0033`/`0034` "have never been executed anywhere" stops being true in this phase.

## 4. Fixes

### 4.1 A staff actor must never land on `/portal`

`PortalLayout` admits any authenticated actor (`requireActor()`), so a staff actor clears
the layout and then throws inside `getDashboard()`, whose first statement is
`requireMember(actor)`. The result is the error boundary, not a redirect.

The guard goes in **both** the layout and the page. Not belt-and-braces — the page already
carries the reason, recorded when the same thing happened for anonymous visitors:

> The layout redirects unauthenticated visitors, but Next renders layout and page in
> parallel, so `requireActor()` here threw UNAUTHORIZED into the runtime error log on
> every anonymous hit (Vercel, 2026-09; audit F21).

An admin-kind actor (`staff` / `exco` / `superadmin`) is redirected to `/admin`. This
mirrors the existing UNAUTHORIZED handling exactly, and covers every `/portal/*` route
rather than the dashboard alone.

**Known limitation, named rather than fixed:** `Actor` carries one `kind`, so a staff
member who also holds a membership can never view their own member portal. Pre-existing;
out of scope.

### 4.2 Retire the temporary diagnostics

PR #56's presence-dump did its job — it produced the single line that identified the
root cause (`hasChallengeCookie:false` → the exchange precondition was never met) — and
its commit message promised removal once the cause was confirmed. It is confirmed.

One narrow signal replaces it: a warning on exactly one condition — a verifier was
present, no session cookie was held, the exchange ran, and Neon returned no `Set-Cookie`.
That is the silent-refusal case. An exchange that falls through without a word is
precisely what cost a full debugging session; one line would have answered it
immediately. Every other branch (no verifier, already signed in, misconfigured
environment) stays silent, and the cookie presence dump goes.

## 5. Migrations

**Ground truth first.** Read `drizzle.__drizzle_migrations` on production directly. Do not
infer it from the UI: `/members` returns 200 with an empty state whether the schema is
correct or the query is failing, because this codebase's public pages degrade with
`.catch(() => [])` by design. The convention that keeps public pages up also makes a
missing migration invisible from outside. Memory is not authority either — it has already
been wrong once today.

**Order is load-bearing.** Per the Phase C checklist, `0031`+`0032` apply **as one unit**:
0031's conversation-reuse predicate is only as inclusive as the old one *because* 0032
backfills `channel`, so 0031 alone opens a second conversation per person on the first
inbound after deploy — splitting exactly the threads the inbox exists to unify. Then
`0033`+`0034`. Phase B2's `0028`–`0030` precede all of it if genuinely pending.

**Sequence:** branch cut from production → apply pending set in order → verify → apply to
production → verify again. Both sets of verification output are pasted into the checklist
in §7, so the record shows what the branch proved and what production answered, not just
that someone ran it.

**Checks:** `_journal.json` ends at idx 34; `whatsapp_templates` count is **10** and every
`status` is `pending`; `campaign_recipients` with both `profile_id` and `contact_id` null
is 0; companies default to `hidden`; slugs backfilled by 0029.

**What this does not do.** Applying `0031`–`0034` does not turn WhatsApp on — templates
seed `pending`, so every send is skipped, and `RUN_LIVE_WOZTELL` stays unset. `0028`
defaults every company to `hidden`, so nothing becomes public on migration; the directory
stays empty until an owner submits and staff approve.

## 6. Admin membership capability

Follows the precedent set when staff needed write access to member profiles: a separate,
narrow, admin-only module (`lib/db/repos/admin-member-profile.ts`) rather than widening
the member-facing gate.

**`lib/db/repos/admin-membership.ts`** — `createComped(actor, input)`:

- `requireAdmin(actor)` before any database access.
- `.strict()` Zod input: profile, plan code, optional company. **Status is not an input** —
  a comp is written `active`, because every other value in `portalMembershipStatuses`
  (`pending_payment`, `pending_review`, `past_due`, `cancel_at_period_end`) is a billing
  state the Stripe webhook owns, and letting staff type one by hand is how a membership
  ends up in a state no payment event will ever move it out of. Stripe references,
  billing periods and owner reassignment stay unreachable for the same reason, each
  exclusion carrying its reason in the source.
- The membership insert **and** an `auditEvents` row in one transaction. `create` writes
  no audit row today, which is defensible for the webhook path and not for a staff action.

**Surface:** an action on the existing `/admin/members/[id]` detail page — where staff
already are — not a new top-level page.

**Boundaries:** logic in a `*-core.ts`, with only the actor-resolving wrapper exported
from the `"use server"` module (hard boundary 3). Strings in both message bundles in
parity (hard boundary 6).

**Tests:** member / anonymous / system actors refused before any database access; the
audit row written inside the same transaction as the insert; `.strict()` rejecting an
unexpected field.

## 7. The walk, and what counts as proof

"The page renders" proves nothing here — see §5. Each walk creates real data.

| # | Walk | Proof |
|---|---|---|
| 1 | Staff signs in, lands on `/admin` | Four dashboard queues render real counts **and** no new runtime error group appears |
| 2 | Staff comps a membership to a **second profile** — a different email from the staff account, since one actor carries one `kind` (§4.1) — and that account signs in | `/portal` renders status and onboarding **and** the comp wrote its audit row |
| 3 | A company profile is submitted and approved at `/admin/profiles-review` | The row appears on `/members` and its `/members/[slug]` page renders with JSON-LD |
| 4 | `/join` renders four plans; plan selection creates a Checkout session | Session visible in Stripe. **Stops there** — no charge (P-4) |

Walk 3 is deliberately not "`/members` loads". A row appearing is the only thing that
separates a working query from a silently swallowed one.

**Automation boundary.** The walk is credential-gated and cannot run in CI. This repo
already handles that honestly for Preview-only checks — by recording evidence rather than
pretending CI covers it. Evidence lives in
`docs/integration/2026-09-12-production-activation-checklist.md`, one row per item, status
the only column that changes, rows never deleted.

## 8. Done

- Four walks green, evidence recorded in the checklist.
- Diagnostics retired, failure-only signal in place.
- Both stale claims in §3 corrected.

## 9. Deferred

| Item | Why |
|---|---|
| The paid join leg: live charge + webhook activation | P-4 |
| Phase C activation (`RUN_LIVE_WOZTELL`, Meta/Woztell approval, PDPO retention answer) | Separate track with external dependencies |
| Staff-who-are-also-members seeing `/portal` | Pre-existing single-`kind` actor model (§4.1) |
| Phase D growth work | Out of scope by P-1 |
