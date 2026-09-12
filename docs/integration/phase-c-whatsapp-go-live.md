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
| 0 | **Before deploying this branch, confirm the current Vercel value of `RUN_LIVE_WOZTELL` is `0`, blank or unset.** Row 7 is about the flip; this row is about the deploy that precedes it. Since C-9 `aiEnv()` parses the variable strictly, so anything else — `true`, `false`, `yes`, a stray space with content — is a **startup throw** on every page that calls `aiEnv()`, the moment this branch goes out and before anyone reaches row 7. Spec §8.4 prescribes `RUN_LIVE_WOZTELL=0` and the Phase A checklist records it unset, so this should be a no-op; it is a row because "should be" is not "was looked at". A blank value is safe by design (`.env.example` ships the key empty, and the parse maps empty and whitespace-only to unset). **This row is load-bearing, not a formality.** `lib/api/woztell-webhook-route.ts` calls `aiEnv()`, so a stale `true` makes the inbound webhook throw before it can answer — a `500`, which Woztell retries, which is the same permanent-retry shape AGENTS.md records for the hostile provider field, with every inbound message lost for as long as it lasts. Nothing else in the tree reads `serverEnv()` outside tests, so the blast radius is the **seven** modules that call `aiEnv()` — concierge route, feedback route, Woztell webhook, backfill route, jobs runners (three call sites), inbox reply core, and the notifications dispatcher (`createProductionNotificationDependencies`) — and no public page, because every one of those calls it per request or per dispatch rather than at module scope. The webhook is still the one that matters. | `vercel env ls` for the production and preview environments shows the key absent, empty, or exactly `0`/`1`. | pending |
| 1 | **Apply migrations `0031`+`0032` as one unit, then `0033`+`0034`.** C1's exit checklist explains why: 0031's conversation-reuse predicate is only as inclusive as the old one *because* 0032 backfills `channel`, so 0031 alone opens a second conversation per person on the first inbound after deploy — splitting exactly the threads the inbox exists to unify. There is no local database on this branch, so 0033 and 0034 have never been executed anywhere; they are pinned only by `tests/unit/phase-c-schema-contract.test.ts` and the seed's TypeScript twin. Run against an isolated Neon branch first. Recipe from Phase A: `neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479`, then `DATABASE_URL=… npm run db:migrate`. | `drizzle/meta/_journal.json` ends at **idx 34**; `SELECT count(*) FROM whatsapp_templates` is **9** and every `status` is `'pending'`; `SELECT count(*) FROM campaign_recipients WHERE profile_id IS NULL AND contact_id IS NULL` is **0**. | pending |
| 2 | **Approve templates at `/admin/templates`** (`/zh/admin/templates` in Traditional Chinese). Migration 0034 seeds all nine keys as `pending`, so after the migration the registry is non-empty and **nothing is approved** — every WhatsApp send is skipped rather than sent. This is deliberate (S-14: it is the first time an unapproved template cannot reach Meta) and it is **the single most likely way to make C-9 look broken.** Approve only the keys Meta has actually approved, with the exact BODY parameter count `config/whatsapp-templates.ts` declares for each. | With nothing approved the wizard's template dropdown is **empty** — `app/[locale]/(admin)/admin/campaigns/page.tsx` lists only `status === "approved"` rows, and a submitted key that is not approved is refused with `TEMPLATE_NOT_APPROVED` (`lib/admin/campaign-wizard.ts`). After approving, the same dropdown offers the key and a preview shows a non-zero **Will be sent** count. (`template_not_approved` per recipient, in `lib/notifications/dispatch.ts`, is the send-time backstop and is unreachable until row 7 — do not wait to see it.) | blocked |
| 3 | **Captured-payload replay green.** C1's O-1: the `MESSAGE_STATUS` and `OUTBOUND` discriminators in `normalizedInbound` are a best guess — no credentials, no captured payload, no provider documentation, and the only envelope this tree has ever seen is `{from, type:"TEXT", messageId, timestamp, data:{text}}`. Capture one real delivery-status payload and one real outbound echo and commit them to `tests/fixtures/captured/` (that directory's README says how). Until this has run against real files, "the ticks do not arrive" is a normaliser bug first and a provider problem second, and nothing in the tree says which: the webhook answers 202 for every outcome and logs nothing on purpose. C1's 202-body echo is what makes the classification readable in Woztell's own delivery log while you find out. | `npx vitest run tests/unit/woztell-normalizer-captured.test.ts` reports the per-file cases **running**, not the "none captured yet" skip. | pending |
| 4 | **`WOZTELL_OPEN_API_TOKEN` set in Vercel with the `api:admin` scope**, alongside `WOZTELL_CHANNEL_ID`, and the Open API host plus the `conversationHistory` selection set confirmed against Woztell's own documentation (C1 O-2 — both are unverified guesses today). When the first real response arrives, **check the timestamp field first**: the mapper accepts a string or a numeric epoch, and any other shape maps every entry to `null` and reports the whole backlog as `skipped`, which looks exactly like success. | One `/api/admin/woztell/backfill` page against production returns `imported > 0`. The route is cookie-authenticated and same-origin-gated, so a shell call needs `-H "Origin: $APP_URL"` beside the session cookie or it answers `403 BACKFILL_ORIGIN_DENIED`; it answers `503 BACKFILL_NOT_CONFIGURED` while either variable is blank. | blocked |
| 5 | **Confirm the webhook body cap with Woztell.** `MAX_WEBHOOK_BYTES` is 64 KiB (`lib/api/woztell-webhook-route.ts:16`) and is applied **before** signature verification, so a batched delivery-status payload larger than that is rejected `413` and looks exactly like a provider outage. Ask Woztell what their maximum status batch is; if it can exceed 64 KiB, raise the cap before the flip rather than after. | A written answer from Woztell recorded in this row, and the cap either confirmed sufficient or raised. | pending |
| 6 | **Retention answer recorded** — see "The retention question" below. | The WTIA answer written into that section, with a date and who gave it. | pending |
| 7 | **Then, and only then, `RUN_LIVE_WOZTELL=1`.** Since C-9 it is parsed as `"0" \| "1"` by `aiEnv()`, so a typo is a startup error rather than a silent downgrade into mock mode — which used to record every send as delivered while nothing left the building. Nothing else needs a new variable: `WOZTELL_APPROVED_TEMPLATE_KEYS` is the empty-registry fallback only, and is inert after step 1's seed. **The flip turns on FOUR outbound paths, not one:** the staff reply lane, the campaign queue, the **journey runner's WhatsApp leg** (`renewal_14`, `dunning_3`, `event_reminder_24h`, ten-minute cron) — easy to forget, because no row used to name it — and the **concierge bot's own replies and follow-up templates** (`lib/ai/woztell-production.ts`), which is a documentation gap rather than a risk: that lane is gated by `whatsAppEligibilityForWebhook` and resolves its own template variables. All four read both consent stores (see row 8) and all four resolve every declared BODY parameter before the adapter (see below). | The two signed-in walks below, **and** the journey leg of row 8. | blocked |
| 8 | **The STOP leg, from all three send paths.** Last, because it is the hardest to undo if it is wrong. | The walk below. | blocked |

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
- **The journey leg, which is the one nobody was watching.** After the member STOP above, the next
  ten-minute journey tick must send that member **no** WhatsApp — while their *email* leg still
  delivers, because a WhatsApp STOP is not an email unsubscribe. Verify on a member who has a
  `renewal_14` or `dunning_3` step due: `whatsapp_log` gains no row for them, `email_log` does.

  This is a row because the journey lane used to gate on `profiles.whatsapp_opt_in` alone, and that
  flag is only half the consent fact. A STOP from a handset **two profiles share** — a company
  number, which most of the M2 fixture's memberships have — resolves no profile
  (`lib/db/repos/woztell-profile-resolver.ts`: `matches.length !== 1`), so the webhook writes only
  `contacts.whatsapp_opted_out_at`: the flag stays true, no `message_suppressions` row is ever
  written, and every later tick kept sending. The C-9 review closed it —
  `lib/db/repos/job-runner-context.ts` now joins `contacts` and `lib/automation/journey-runner.ts`
  refuses on either fact, which is `decideWhatsApp`'s rule 1 for a member, the same precedence the
  blast and the inbox use.

  **Read the control before you read the result.** This verification is only meaningful because the
  journey lane now resolves its template parameters: until the C-9 review it handed the adapter a
  context bag with no `memberName` and no `amountDue`, so `wtia_renewal_d14` went out with parameter
  1 empty and `wtia_dunning_d3` with parameters 1 and 2 empty — which Meta rejects. Every member
  would have produced a failed `whatsapp_log` row and a staff task, STOP or no STOP, and this row's
  control ("a member who did NOT stop gets a row") could not have told the two apart. If you see a
  failed row for the control member, stop and treat it as a lane fault, not a consent result.

  **The residual, and it is worth knowing before you read a result:** all three paths find the
  contact row through `contacts.profile_id`. A STOP that resolved no profile AND whose contact row is
  linked to no profile is still invisible to every member-side check — the second person on a shared
  handset is exactly that case. Unifying the two stores is Phase D (recorded in the C2 plan's known
  debt). Until then, treat "a member complains they still get messages after STOP" as a **linking**
  question first: find the contact by phone at `/admin/contacts` and check whether it carries a
  profile id.

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
- **The flip has one parse, not two.** `lib/whatsapp/approved-templates.ts` decides "are we live?"
  for `/admin/templates` and the campaign wizard and deliberately cannot call `aiEnv()` — that would
  put `CONCIERGE_COOKIE_SECRET` on a page that sends nothing, the boundary-7 coupling that once took
  `/sitemap.xml` down. It read the raw variable with a looser rule until the C-9 review; it now
  shares `runLiveWoztellSchema` with `aiEnv()`, and a value neither can read counts as **live**, so
  the answer to an unreadable switch is "consult the registry" rather than "approve everything"
  (`tests/unit/approved-templates.test.ts`).
- `tests/unit/woztell-adapter-live-flag.test.ts` discovers every `createWoztellAdapter(` call and
  proves each credential-carrying one passes `RUN_LIVE_WOZTELL` (S-13) — the incident where an
  outbound path omitted it and recorded journey and dunning messages as delivered while nothing was
  sent. It looks for the **key** `RUN_LIVE_WOZTELL:` in the **comment-stripped** argument, because
  the first version looked for the bare substring and this file's own Step 3 then put the variable's
  name into a comment inside `lib/jobs/runners.ts`'s argument — the prose alone satisfied the check,
  so for three commits the one call site where the incident actually happened had no guard at all
  and nothing went red. Two cases now pin that: a comment naming the flag is an offender, and
  stripping comments leaves code and string literals intact.
- `tests/unit/message-eligibility.test.ts` proves a WhatsApp-suppressed member and a stopped contact
  are both refused, from two different tables, through one repository.
- **Every declared BODY parameter is resolved before any of the four paths reaches the provider.**
  Meta rejects an empty BODY parameter, the adapter maps that 4xx to `provider_client_error` and
  S-15 makes it permanent, so a blank is never a degraded message — it is a failed step and a staff
  task per recipient. `lib/whatsapp/template-body.ts` is the single refusal all four paths read:
  `tests/unit/journey-whatsapp-template-variables.test.ts` drives the **real** production context
  bag (not a fixture) for every WhatsApp step in `config/journeys.ts` and asserts each template's
  parameters resolve; `tests/unit/journey-runner.test.ts` proves a blank makes the step deliver by
  email alone rather than fail; `tests/unit/inbox-action-core.test.ts` proves a hand-posted staff
  template reply with an absent or blank parameter is refused before the adapter, because the
  composer's `required` is a client-side attribute and nothing more.
- **Where the dunning figure comes from.** `wtia_dunning_d3`'s `amountDue` parameter is the
  membership plan's price for that membership's own billing interval, formatted as HKD currency —
  the same number `lib/admin/report-formulas.ts` treats as what a membership is worth, because the
  tree records no other amount (there is no invoice table, and `billing_attempts.price_reference` is
  a Stripe price id). A plan with no price for its interval produces **no** WhatsApp: the send is
  refused and the dunning email still goes out. If a member disputes the figure, that is the
  provenance to check first.
- `tests/unit/journey-whatsapp-stop.test.ts` proves the journey lane's loader joins `contacts` and
  reports the recorded withdrawal beside a `whatsapp_opt_in` that is still true;
  `tests/unit/journey-runner.test.ts` proves the runner then sends no WhatsApp and still sends the
  email; `tests/unit/job-runner-context-event-reminder.test.ts` proves the wiring between them
  carries the fact rather than hard-coding `null`. Those three are the journey leg of row 8, minus
  the provider.
- `tests/unit/phase-c-schema-contract.test.ts` proves no Phase C migration uses a newly added
  `campaign_status` value — the one failure that would appear only on a production deploy, because on
  a fresh database every migration is pending inside one transaction.
- `tests/unit/worker-cron-contract.test.ts` proves `workers/wrangler.toml`'s cron set equals
  `JOBS_BY_CRON`'s key set, so the ten-minute trigger cannot fire nothing.
- `tests/unit/woztell-live-acceptance-guard.test.ts` proves the separately authorized live acceptance
  harness refuses without its own flag, its own credentials, a sandbox target and at least one
  approved template — and that it can now name a **marketing** template, which is what makes the
  blast half of the §6 gate reachable at all.
