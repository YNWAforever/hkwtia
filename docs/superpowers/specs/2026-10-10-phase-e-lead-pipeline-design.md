# Phase E — Lead pipeline: staff-led conversion of leads into paid members

**Date:** 2026-10-10
**Programme:** follows `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (Phases A–D delivered)
**Status:** draft for owner review · **Owner:** Willy (product)

---

## 1. Goal and understanding

**Outcome (owner, 2026-10-10):** grow paid membership by converting the leads WTIA already captures
into members. WTIA staff do the converting; the platform assists them and never markets to anyone on
its own.

**Scale (owner):** fewer than 50 open leads, 1–2 staff. One shared board, no assignment machinery.

**Success:** more contacts reach `member`, and staff can see which sources and which follow-ups
produce paying members (attributed, not inferred).

### What already exists (read from the code, not rebuilt)

- `contacts` (`lib/db/schema-core.ts:1686`): person-level record with `source`
  (`whatsapp`, `event_guest`, `showcase_intro`, `join_abandoned`, `interest_form`, `import`), `stage`
  (`new`, `contacted`, `qualified`, `applied`, `member`, `closed`), `ownerProfileId`, `tags`, consent fields.
- Staff change stage and owner inline from `/admin/contacts` (`updateContactPipelineAction` →
  `contactsRepository.updatePipeline`, with an `auditEvents` row).
- A contact flips to `member` automatically when its profile gains a membership
  (`lib/db/repos/contacts.ts:739`).
- `staff_tasks` carries `ownerProfileId`, `dueAt` and `nextActionCode` in `context`.
- Jobs run under `app/api/jobs/*`, triggered by the Cloudflare Worker crons in `workers/wrangler.toml`.
- The join wizard requires a signed-in actor; drafts belong to the profile
  (`lib/membership/join-draft.ts`, `resumeOrStartJoin` in `lib/membership/join-service.ts`).

### What is missing (this phase)

1. A per-lead next step, notes and activity history.
2. A personal join link that survives sign-up and attributes the application to the lead and the sender.
3. Reminders when a next step is overdue.
4. A conversion report by source and owner.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| E-1 | Build on `contacts`, not `leads` or an external CRM. | `contacts` is already the person-level record linked to membership; `leads` is one row per enquiry; a CRM moves lead data off-platform and loses exact attribution. |
| E-2 | Staff-led only. No automated outbound to leads. | Owner decision. Avoids direct-marketing consent questions: every message is a staff-initiated 1:1 follow-up. |
| E-3 | Stage changes via a menu on the card, not drag-and-drop. | Under 50 cards; keyboard-accessible; one code path with the list view. |
| E-4 | Invite tokens: 32 random bytes, only the SHA-256 digest stored, 14-day expiry, single-use at application submit, a new invite supersedes the previous one for the same contact. | Same pattern as guest RSVP cancel tokens. |
| E-5 | Automatic stage moves are forward-only (`applied` on invite-attributed submit, `member` as today). Staff may move any direction by hand. | An automation must never undo a staff decision. |
| E-6 | Attributed revenue is labelled an estimate (catalog price × first year), not reconciled with Stripe. | Reconciliation is out of scope; the label prevents it being read as booked revenue. |

## 3. Data model (one additive migration, `0063_lead_pipeline`)

**`contacts` — new columns**

- `next_step` text, nullable, ≤ 200 chars (Zod-enforced).
- `next_step_due_at` timestamptz, nullable.
- `last_touch_at` timestamptz, nullable — set on every note, send or stage change.

**`contact_activities` — new, append-only**

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `contact_id` | uuid → `contacts.id` on delete cascade | |
| `actor_profile_id` | text → `profiles.id` on delete set null | null for system events |
| `kind` | enum `contact_activity_kind` | `note`, `stage_change`, `owner_change`, `next_step`, `invite_sent`, `invite_opened`, `applied`, `became_member` |
| `body` | text, nullable | notes ≤ 2,000 chars |
| `meta` | jsonb default `{}` | e.g. `{from, to}`, `{inviteId, channel}` |
| `created_at` | timestamptz | index `(contact_id, created_at desc)` |

The existing `updatePipeline` writes `stage_change`/`owner_change` rows in the same transaction as its
update and its `auditEvents` row. Activities are never edited or deleted by the application.

**`join_invites` — new**

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `contact_id` | uuid → `contacts.id` on delete cascade | |
| `plan_code` | `membership_plan_code` → `membership_plans.code` | |
| `created_by_profile_id` | text → `profiles.id` on delete set null | |
| `token_digest` | text, unique | SHA-256 hex of the raw token |
| `expires_at` | timestamptz | created + 14 days |
| `opened_at` | timestamptz, nullable | first valid open |
| `consumed_at` | timestamptz, nullable | application submitted |
| `superseded_at` | timestamptz, nullable | a newer invite for the same contact |
| `application_id` | uuid → `membership_applications.id` on delete set null | |
| `created_at` | timestamptz | |

**`membership_applications` — new column** `invite_id` uuid, nullable → `join_invites.id` on delete set null.
It is written when the application is **submitted** (when the invite is consumed), not when the draft
is created: unsubmitted drafts carry no attribution value (plan ruling R-1).

All reads and writes live in `lib/db/repos/` (`contact-activities.ts`, `join-invites.ts`, extensions to
`contacts.ts`); every admin path calls `requireAdmin(actor)`. The only non-admin path is invite
open/consume, bound to the signed-in profile for consume.

## 4. Join invite flow

1. **Create (staff, lead page).** Pick a plan (Community, Startup or Corporate; patron stays
   contact-only). "Create join link" returns the absolute URL of `/join/invite/<token>` in the
   contact's locale (built with `localizedPath`, since it is a plain string, not a `Link` href), shown
   once with Copy. Send options:
   - **Email it** — a short message, staff-editable, defaulting to bilingual copy from the bundles,
     sent via Resend from WTIA with `reply-to` the staff member's email. Disabled when the contact has no email.
   - **WhatsApp** — opens click-to-chat (`wa.me`) with the prefilled text; staff send it themselves.
     Disabled when the contact has no phone.
   Each send writes an `invite_sent` activity (`meta.channel`: `copy` | `email` | `whatsapp`).
2. **Open (lead).** `/[locale]/(join)/join/invite/[token]` — `noindex`, rate-limited per IP. The digest is
   looked up in constant time; if unknown, expired, consumed or superseded → a neutral "this link is
   no longer valid" page with `/join` and `/contact` links and **no contact data**. If valid: stamp
   `opened_at` once (+ `invite_opened` activity), set an httpOnly, Secure, SameSite=Lax cookie
   `wtia_invite` holding the invite id (expires with the invite), and render a welcome: the lead's
   name, the inviting staff member's first name, the plan's benefits and price from the live public
   catalog, and Continue → `/join?plan=<code>` (signed in) or member-login with `next` back to it.
3. **Join.** With a valid invite cookie whose invite is unconsumed: prefill only **empty** draft fields
   (name, phone, organisation) from the contact; the email comes from the signed-in account. On
   submit: set `consumed_at` and `application_id`, store `invite_id` on the application, move the contact to `applied` if it is
   earlier in the pipeline, write an `applied` activity, link the contact to the profile via the
   existing `linkProfile`. Payment runs unchanged; the existing hook moves the contact to `member`,
   now also writing a `became_member` activity.
4. **Edges.** A different signed-in email than the contact's is allowed (attribution is by invite).
   A different plan chosen in the wizard is allowed and reported as invited vs joined. Clearing the
   cookie only loses prefill, never the application.

## 5. Staff surfaces

**Board** — `/admin/contacts?view=board` (the list stays the default and fallback).
Columns New · Contacted · Qualified · Applied · Member (joined in the last 30 days); Closed behind a
filter. A card shows name, organisation, source badge, owner initials, next step and due date (red when
overdue), and markers for "invite opened" and "applied". Stage changes through a menu on the card
(`updatePipeline`). Filters: owner (all / mine), source, overdue only.

**Lead page** — `/admin/contacts/[id]` (new). Header: details, consent state (WhatsApp opt-in, event
marketing consent), stage, owner, next step + due date (all editable). Timeline of
`contact_activities`, newest first, with "Add note". Join link panel: create / copy / send, current
invite state and expiry. Related: events attended as a guest, showcase intros, WhatsApp conversation
(link to the inbox), membership if any.

**Reminders** — job `lead-reminders` (`app/api/jobs/lead-reminders`), daily 08:00 Asia/Hong_Kong
(`0 0 * * *` UTC added to `workers/wrangler.toml` and the worker's job map).
- No `staff_tasks` rows (plan ruling R-2): `staff_tasks` is keyed to a member profile and writable
  only by the automation and agent actors, and most leads have no profile. The board's overdue filter
  and the digest carry the signal at this scale.
- One digest email per owner: overdue steps, steps due today, and invites opened more than 3 days ago
  with no application. Unowned leads appear in an "Unassigned" block in every staff digest. Nothing
  is sent when a digest is empty. Re-running the job on the same day sends nothing new.

**Report** — `/admin/reports/leads`, read-only, window 30 / 90 (default) / 180 days / all.
Funnel by source with stage counts and rates; per-owner leads, invites sent / opened, applications,
members; invite effectiveness (opened → applied → paid, median invite→payment time, invited vs joined
plan); attributed first-year fees labelled "estimate". A failed read shows "unavailable", never zeros.

All visible text in `messages/en.json` and `messages/zh-HK.json`. Hrefs follow CLAUDE.md rule 5 and
the round-28 rule: `@/i18n/navigation` links (and wrappers such as `ActionLink`) take unprefixed paths;
`localizedPath` only for `next/link`, plain `<a>`, `redirect` and absolute URLs. Admin patterns:
shadcn, `min-h-11` targets, Zod-validated server actions through `*-core.ts` (CLAUDE.md rule 3).

## 6. Error handling and security

- Invite tokens never logged or stored raw; digest compared in constant time.
- `/join/invite/[token]` rate-limited (existing `lib/auth/rate-limit.ts`); every invalid case renders
  the same neutral page.
- Prefill never overwrites a field the applicant has already filled.
- Every mutation (pipeline, note, next step, invite create/send/consume) writes an `auditEvents` row
  in the same transaction.
- An email send failure is shown to staff on the lead page and recorded on the `invite_sent`
  activity (`meta.status: failed`); it is not retried silently.

## 7. Testing

- **Repositories:** invite create / verify / consume / supersede; expired, reused, superseded and
  wrong-token cases; forward-only automatic stages; activity rows in the same transaction;
  `requireAdmin` on every admin path; the `"use server"` discovery test still passing.
- **Security:** digest-only storage; constant-time compare; rate limit; no PII on the invalid page;
  prefill non-overwrite.
- **Pages:** board, lead page, invite welcome, invalid page and report in en and zh; locale-href
  boundary; `audit:strings`.
- **Job:** idempotent over re-runs; empty digest skipped; tasks resolved on step change.
- **E2E (rendered fixtures, no production DB):** create invite → open → welcome → join wizard
  prefilled and attributed.

## 8. Rollout

Three stacked PRs, each independently mergeable and behind its own gates:

1. **E-a** — migration `0063_lead_pipeline`, `contact_activities`, next step fields, lead page with
   timeline and notes.
2. **E-b** — `join_invites` end to end (create / send / open / prefill / attribute / stage moves).
3. **E-c** — board view, `lead-reminders` job and digest, conversion report, plus migration
   `0064_lead_reminders_job`, which adds `lead-reminders` to the `job_health_registered_key` check
   constraint (plan ruling R-3), and a worker deploy for the new `0 0 * * *` cron.

Both migrations are additive (no backfill); rehearse each on a Neon branch before production, as with
0052–0062. **Owner gate:** create a real invite for a test contact, open it on a phone, sign up, and
see the attribution in the report.

## 9. Out of scope

Automated marketing sequences; drag-and-drop; round-robin assignment and SLAs; external CRM sync;
Stripe revenue reconciliation; a free-to-paid upgrade path for existing Community members (Phase
E.2 candidate).
