# Phase C WhatsApp go-live — activation checklist

Programme: spec `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` §6, work
package **C-9**. Implementation plans: `docs/superpowers/plans/2026-09-10-phase-c1-whatsapp-human-lane.md`
(webhook v2, inbox, backfill) and `docs/superpowers/plans/2026-09-10-phase-c2-campaigns-and-contacts.md`
(contacts, segments, campaigns, template registry, send queue). This file is C2 Task 13 Step 6.

This is a **living document**, not prose: one row per precondition, in the order they must be done,
each naming the thing that proves it. The status column is the only field that changes; rows are
never deleted, so the file stays the record of what "we went live safely" meant.

Statuses: `blocked` (a precondition ahead of it is not done) · `pending` (ready to do, nobody has)
· `done` (the verification in the row's own Verify column was run and passed, with the evidence
recorded) · `declined` (a decision was taken not to do it, with the reason recorded).

**C-9 had no owner until C2 Task 13.** C1's programme paragraph called it "a companion plan"; C2's
scope sentence omitted it. Between them the `RUN_LIVE_WOZTELL=1` flip, its §8 activation
preconditions, the live-acceptance harness's two-key ceiling and the one monitoring signal §6 names
belonged to nobody, while both exit checklists read as complete. The code that makes the flip
*verifiable* has landed; the flip itself stays an owner action, deliberately.

## The order is load-bearing

| # | Precondition | Verify | Status |
|---|---|---|---|
| 1 | **Apply migrations `0031`+`0032` as one unit, then `0033`+`0034`.** C1's exit checklist explains why: 0031's conversation-reuse predicate is only as inclusive as the old one *because* 0032 backfills `channel`, so 0031 alone opens a second conversation per person on the first inbound after deploy — splitting exactly the threads the inbox exists to unify. There is no local database on this branch, so 0033 and 0034 have never been executed anywhere; they are pinned only by `tests/unit/phase-c-schema-contract.test.ts` and the seed's TypeScript twin. Run against an isolated Neon branch first. Recipe from Phase A: `neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479`, then `DATABASE_URL=… npm run db:migrate`. | `drizzle/meta/_journal.json` ends at **idx 34**; `SELECT count(*) FROM whatsapp_templates` is **9** and every `status` is `'pending'`; `SELECT count(*) FROM campaign_recipients WHERE profile_id IS NULL AND contact_id IS NULL` is **0**. | pending |
| 2 | **Approve templates at `/admin/templates`** (`/zh/admin/templates` in Traditional Chinese). Migration 0034 seeds all nine keys as `pending`, so after the migration the registry is non-empty and **nothing is approved** — every WhatsApp send is skipped rather than sent. This is deliberate (S-14: it is the first time an unapproved template cannot reach Meta) and it is **the single most likely way to make C-9 look broken.** Approve only the keys Meta has actually approved, with the exact BODY parameter count `config/whatsapp-templates.ts` declares for each. | A campaign preview for a template blast shows a non-zero **Will be sent** count instead of every recipient reading **Template not approved for sending**. | blocked |
| 3 | **Captured-payload replay green.** C1's O-1: the `MESSAGE_STATUS` and `OUTBOUND` discriminators in `normalizedInbound` are a best guess — no credentials, no captured payload, no provider documentation, and the only envelope this tree has ever seen is `{from, type:"TEXT", messageId, timestamp, data:{text}}`. Capture one real delivery-status payload and one real outbound echo and commit them to `tests/fixtures/captured/` (that directory's README says how). Until this has run against real files, "the ticks do not arrive" is a normaliser bug first and a provider problem second, and nothing in the tree says which: the webhook answers 202 for every outcome and logs nothing on purpose. C1's 202-body echo is what makes the classification readable in Woztell's own delivery log while you find out. | `npx vitest run tests/unit/woztell-normalizer-captured.test.ts` reports the per-file cases **running**, not the "none captured yet" skip. | pending |
| 4 | **`WOZTELL_OPEN_API_TOKEN` set in Vercel with the `api:admin` scope**, alongside `WOZTELL_CHANNEL_ID`, and the Open API host plus the `conversationHistory` selection set confirmed against Woztell's own documentation (C1 O-2 — both are unverified guesses today). When the first real response arrives, **check the timestamp field first**: the mapper accepts a string or a numeric epoch, and any other shape maps every entry to `null` and reports the whole backlog as `skipped`, which looks exactly like success. | One `/api/admin/woztell/backfill` page against production returns `imported > 0`. The route is cookie-authenticated and same-origin-gated, so a shell call needs `-H "Origin: $APP_URL"` beside the session cookie or it answers `403 BACKFILL_ORIGIN_DENIED`; it answers `503 BACKFILL_NOT_CONFIGURED` while either variable is blank. | blocked |
| 5 | **Confirm the webhook body cap with Woztell.** `MAX_WEBHOOK_BYTES` is 64 KiB (`lib/api/woztell-webhook-route.ts:16`) and is applied **before** signature verification, so a batched delivery-status payload larger than that is rejected `413` and looks exactly like a provider outage. Ask Woztell what their maximum status batch is; if it can exceed 64 KiB, raise the cap before the flip rather than after. | A written answer from Woztell recorded in this row, and the cap either confirmed sufficient or raised. | pending |
| 6 | **Retention answer recorded** — see "The retention question" below. | The WTIA answer written into that section, with a date and who gave it. | pending |
| 7 | **Then, and only then, `RUN_LIVE_WOZTELL=1`.** Since C-9 it is parsed as `"0" \| "1"` by `aiEnv()`, so a typo is a startup error rather than a silent downgrade into mock mode — which used to record every send as delivered while nothing left the building. Nothing else needs a new variable: `WOZTELL_APPROVED_TEMPLATE_KEYS` is the empty-registry fallback only, and is inert after step 1's seed. | The two signed-in walks below. | blocked |
| 8 | **The STOP leg, from both sides.** Last, because it is the hardest to undo if it is wrong. | The walk below. | blocked |

## The two signed-in walks (step 7)

No unit test can stand in for these; every flow in the tree is exercised through the mock adapter,
which is the point and also the limit.

- **The human lane.** A prospect messages the WTIA number. Staff take the thread over in
  `/admin/inbox`, reply inside the 24-hour customer-service window, and the reply lands with a
  **non-`mock:`** provider id and ticks arriving. A `mock:` id here means step 7 did not take effect;
  ticks that never arrive mean step 3 was skipped.
- **The blast.** Admin A builds a WhatsApp campaign at `/admin/campaigns` against a segment of
  opted-in members and creates the draft; the eligibility table shows real counts per category.
  Admin A submits for review. Admin B — a different admin, enforced by `reviewableCampaign` — approves
  and schedules. Within ten minutes the queue drains (`*/10 * * * *` → `whatsapp-send-queue`),
  `whatsapp_log` carries one row per recipient with a non-`mock:` provider id,
  `campaign_recipients.sent_at` is populated, and `delivered_at` ticks through the webhook's
  campaign fall-through.

## The STOP leg (step 8)

- One **member** replies STOP → `message_suppressions` gains a `whatsapp`/`marketing` row and
  `audit_events` a `consent.whatsapp.revoked`.
- One **prospect** replies STOP → `contacts.whatsapp_opted_out_at` is set **with** a
  `consent.whatsapp.revoked` row against `target_type: 'contact'`. That audit row does not exist
  anywhere in the tree before this phase.
- The next blast to the same segment reports **both** as **Opted out** in its preview and sends to
  neither. Two tables, one repository: `message_suppressions.profile_id` is `NOT NULL`, so a prospect
  can never be suppressed there, and a check that read only one store would send to half the people
  who said STOP.

## The retention question (step 6, C1 O-5)

**This is a WTIA decision, not an engineering one, and it must be answered before the flip — asking
afterwards means asking about data already collected.**

C1's S-10 takes `handling <> 'bot'` threads out of both retention sweeps: the twelve-month
`chat-retention` sweep and the 365-day conversation expiry used to delete an operational thread out
from under its own audit trail. That is right for a record an audit row points at. But "forever" is
not a retention policy and the PDPO expects one.

> **Question for WTIA.** How long is a staff↔member (or staff↔prospect) WhatsApp thread kept after
> its last message — and does the answer differ for a thread that produced a membership application
> or a payment? The message bodies are personal data; the audit trail that references them is not.

| Field | Value |
|---|---|
| Asked on | _pending_ |
| Asked of | _pending_ |
| Answer | _pending_ |
| Answered on | _pending_ |

Implementing whatever comes back is Phase D. Recording it here is what makes it askable.

## Recorded decisions

### `aiops_monthly_metrics` — **declined** (C2 Task 13 Step 4, C1 O-6)

§6 names this materialized view as the go-live monitoring signal, and it will read a successful human
takeover as an AI problem: `month_conversations` counts every `agent_kind='concierge'` conversation
whatever its `handling`, a thread a person takes over produces no terminal `agent_run` — so a thread
that was escalated and then handled well stays in `escalation_rate` and never reaches
`agent_resolved_rate`'s numerator — and `first_response` keys off `role='assistant'`, so a
`role='staff'` reply is excluded from the median sample entirely.

The fix is one line in the view body (`AND conversations.handling = 'bot'`). **It was attempted as
migration 0035 and declined**, per the plan's own instruction not to force it:

- `npx drizzle-kit generate` does regenerate the body cleanly — the emitted file carried the new
  predicate and the 23 public columns were unchanged.
- But it emits `DROP MATERIALIZED VIEW` + `CREATE MATERIALIZED VIEW` and **does not recreate
  `aiops_monthly_metrics_month_start_unique`**. Dropping a materialized view drops its indexes, that
  index is raw SQL in `drizzle/0013_m4c_aiops_metrics.sql` and is not declared in
  `lib/db/schema-core.ts`, so drizzle-kit cannot know about it — and
  `aiOpsMetricsRepository.refresh` calls `.concurrently()`, which Postgres refuses without a unique
  index. The migration would therefore have left the hourly AI-Ops refresh failing permanently while
  the dashboard quietly served stale numbers: a monitoring fix that breaks monitoring.
- The only repair is hand-editing generated SQL, which is what the plan calls forcing it.

**Consequence, and what was done instead:** the view stays as it is, and the dashboard now says so.
`AiOps.methodologyDescription` in both bundles carries the caveat — resolution, escalation, failure
and first-response figures describe threads the concierge kept, and a staff reply is not counted as a
first response. Read `agent_resolved_rate` that way after go-live. Fixing the view properly means
declaring the unique index in the Drizzle schema first, so a regenerated view brings it back; that is
**Phase D**.

## What the code already proves (no database, no Woztell credentials)

- Every flow is exercised through the mock adapter. `RUN_LIVE_WOZTELL` stays unset in CI and locally;
  C-9 remains a flag flip (D-4).
- `tests/unit/woztell-adapter-live-flag.test.ts` discovers every `createWoztellAdapter(` call and
  proves each credential-carrying one passes `RUN_LIVE_WOZTELL` (S-13) — the incident where an
  outbound path omitted it and recorded journey and dunning messages as delivered while nothing was
  sent.
- `tests/unit/message-eligibility.test.ts` proves a WhatsApp-suppressed member and a stopped contact
  are both refused, from two different tables, through one repository.
- `tests/unit/phase-c-schema-contract.test.ts` proves no Phase C migration uses a newly added
  `campaign_status` value — the one failure that would appear only on a production deploy, because on
  a fresh database every migration is pending inside one transaction.
- `tests/unit/worker-cron-contract.test.ts` proves `workers/wrangler.toml`'s cron set equals
  `JOBS_BY_CRON`'s key set, so the ten-minute trigger cannot fire nothing.
- `tests/unit/woztell-live-acceptance-guard.test.ts` proves the separately authorized live acceptance
  harness refuses without its own flag, its own credentials, a sandbox target and at least one
  approved template — and that it can now name a **marketing** template, which is what makes the
  blast half of the §6 gate reachable at all.
