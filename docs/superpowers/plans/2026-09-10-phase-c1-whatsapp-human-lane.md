# Phase C1 — WhatsApp human lane (C-1, C-2, C-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a prospect messages the WTIA number, the concierge answers, and a staff member takes the thread over in `/admin/inbox` and replies inside the 24-hour customer-service window — with the reply persisted before it is sent, audited in the same transaction, idempotent under retry, refused when the recipient said STOP, and its delivery ticks arriving back over the webhook. Plus the Woztell history backfill that gives the inbox something to read on day one.

**Architecture:** `messages` and `conversations` stop being bot transcript artefacts and become operational records. Three additive columns groups (migration 0031, backfilled by 0032) give a conversation a channel, a handling state and an assignee, and give a message a direction, a delivery status, a sender, a template key and an idempotency key. The webhook normaliser grows from two variants to four, so delivery-status and outbound-echo events stop being answered `202 {"ignored"}` and start writing rows. Staff replies go through new actor-taking methods on `inboxRepository` — never through `conversationsRepository`, whose every write is gated by a `ConversationOwner` an admin would have to forge. The send is write-ahead: one `messages` row at `delivery_status='queued'` plus one `audit_events` row in the same transaction, then the adapter, then a settle. The chat-retention and conversation-expiry sweeps learn about `handling` so a staff↔member thread is not deleted out from under its own audit trail.

**Tech Stack:** Next.js 16 App Router (webpack) · React 19 · TypeScript strict · Drizzle ORM on Neon · next-intl v4 · Zod · Vitest · Playwright.

**Programme context:** spec §6 work packages C-1, C-2, C-3, plus the `conversations`/`messages` half of the §6 schema paragraph. The other half of Phase C — C-4 contacts pipeline, C-5 campaigns + send queue, C-6 segment v2, C-7 template registry, C-8 dispatcher, **C-9 go-live** — is the companion plan `2026-09-10-phase-c2-campaigns-and-contacts.md` and is **not** in scope here. Prior plans to read for house shape: `2026-09-08-phase-a-foundation-and-funnel.md`, `2026-09-09-phase-b2-member-directory.md`.

**What C1 owns that C2 consumes**, stated once so neither plan builds it twice:

| Artefact | Owner | C2's relationship |
|---|---|---|
| `drizzle/0031`, `drizzle/0032`; `conversations.channel/handling/contact_id/whatsapp_member_id/last_inbound_at`; `messages.direction/delivery_status/sent_by_profile_id/template_key/outbound_key/send_claim_expires_at`; `message_role` gaining `staff` | **C1 Task 1** | C2's 0033 chains on 0032 |
| `tests/unit/phase-c-schema-contract.test.ts` | **C1 Task 1** (create) | C2 Task 1 **appends** describe blocks |
| `lib/db/repos/message-eligibility.ts` — the module, the private facts query, the `RecipientFacts` type, `whatsAppEligibility(actor: Actor, …)` gated by `requireAdmin` | **C1 Task 5** (create) | C2 Task 3 **modifies** it, adding `factsFor(…)` gated by `requireDeliveryActor`. See S-9. |
| `contactsRepository.markWhatsAppOptedOut` audit row (`consent.whatsapp.revoked`) and the `upsertFromInterestForm` opt-out-revival guard | **C1 Task 5** | C2 Task 3 adds **only** the `consent.whatsapp.granted` leg on top |
| `lib/db/repos/woztell-inbound-events.ts::recordDeliveryStatus` | **C1 Task 3** | C2 Task 10 adds the `campaign_recipients` fall-through |
| the retention sweeps learning `handling` | **C1 Task 9** | C2 depends on it, touches neither sweep |
| `approvedTemplateKeys` — C1 ships the **read-only key reader** `lib/whatsapp/approved-templates.ts`; C2 Task 2 swaps its source for the registry | **C1 Task 8 / C2 Task 2** | see Task 8 Step 0 |
| **C-9 go-live** | **C2 Task 13** | C1 defers O-6 and O-5 to it by name |

**Working rules for every task** — identical to `2026-09-09-phase-b2-member-directory.md`: focused failing test first, run it, **read the failure** and confirm it names the behaviour you meant; `localizedPath` for every `<Link href>` (`revalidatePath` takes the internal path); no actor-taking export from a `"use server"` module; `requireAdminPageActor()` first in every admin page; both message bundles in the same commit; migrations generated with drizzle-kit, `--custom` only for backfills; `NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build` locally; one commit per task.

---

## Corrections to the spec

The spec text is eight weeks old and the tree has moved. Where the two disagree, **this plan is right and the spec is stale**; each correction below is load-bearing for a task.

| Spec §6 says | Reality on this branch | Instruction |
|---|---|---|
| "Schema (0029–0031)" | Phase B2 consumed 0028, 0029, 0030; `drizzle/meta/_journal.json` ends at idx 30 (`0030_phase_b_members_route`), snapshot id `9e39066a-db08-42f7-9531-76134f2dfe4b`. | Phase C1 is **0031** and **0032**, generated on top of 0030. C2 continues from 0033. |
| `messages` + `channel` | `messages.channel` already exists (`message_channel` enum, NOT NULL, added by 0010). | Add `conversations.channel` only. Reuse the existing `messageChannelEnum` for it; do not mint a second channel type. |
| "owner check widened to allow `contact_id`" | §2 **D-6** says the opposite: "The existing HMAC `anonymous_owner_hash` on `conversations` stays as the conversation owner key." Widening the CHECK forces a third `ConversationOwner` variant through six functions, and the backfill that would populate it is impossible — the HMAC is not invertible and the only cleartext key (`messages.metadata->>'normalizedSender'`) is deleted by the twelve-month retention sweep. | **D-6 wins.** `conversations_owner_check` is untouched and stays two-armed. `conversations.contact_id` is added as a nullable link, not an owner arm. `ConversationOwner` stays a two-variant union. See S-3. |
| C-1 "inbound message (exists)" | The inbound path is a transactional claim with `pg_advisory_xact_lock`, a 5-minute lease, a four-state machine in `messages.metadata` and a conversation-reuse rule that requires a prior `channel='whatsapp'` message. | Extend `claimInbound`; never rewrite it. Redelivery idempotency depends on every one of those parts. |
| C-1 "delivery status (`messages.delivery_status` by `provider_message_id`)" | **No outbound message anywhere carries a `provider_message_id`.** `lib/ai/agents/concierge.ts` appends the assistant row with none; the id the send API returns is written into the **inbound** row's `metadata.woztellSessionDelivery.providerId`. `UPDATE messages SET delivery_status=… WHERE provider_message_id=…` matches zero rows today. | Task 6 creates the outbound row that carries the id; Task 4's delivery-status branch is useless before it. Task 10 stamps the concierge's own reply so bot replies get ticks too. Order matters. |
| C-1 "resolve contact by Woztell member id then number" | `contacts.whatsapp_member_id` and its partial unique index exist, and `upsertFromWhatsApp` already accepts the field — but `lib/ai/woztell-production.ts:recordContact` never passes it, so the column is NULL on every row and there is nothing to resolve against. Worse, `upsertFromWhatsApp` conflicts on `ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL` only, while `contacts_whatsapp_member_unique` (`lib/db/schema-core.ts:1134`) is a **separate** partial unique index that is not the conflict target: an inbound whose member id already belongs to a different phone row raises 23505, which Task 4 Step 7 turns into a 500, so Woztell retries forever and that sender's messages never persist. | Task 2 extracts the member id in the normaliser; Task 3 threads it to `conversations.whatsapp_member_id`, which carries **no** unique index and is therefore always safe to write. Task 4 Step 6 writes `contacts.whatsapp_member_id` only through a **separate guarded UPDATE** that refuses when another row already holds the id, inside its own `try`/`catch` for the concurrent race. **Resolution stays number-first in C1**; member-id-first resolution and the correction/merge rule are C2 Task 5 (see O-3, which C2 now discharges rather than inherits). |
| C-2 "Inbox v1" reads as greenfield | `/admin/inbox` exists (route, nav entry in the `workspace` group, `lib/admin/inbox.ts`, `lib/db/repos/inbox.ts`, two components). It is read-only and says so in `Admin.inbox.description` in **both** bundles. | C-2 extends. Rewrite the two description strings in the same commit as the composer, or the page tells staff in two languages that they cannot do what they are looking at. **No new admin route** is added by C1, so `tests/unit/internal-navigation-config.test.ts`'s `toHaveLength(19)` and its ordered id arrays stay as they are. |
| C-2 "write-ahead `messages` row (`delivery_status='queued'`)" | A write-ahead outbound reservation already exists in `lib/db/repos/woztell-delivery-outbox.ts`, in `messages.metadata` JSONB, with its own six-state machine, pinned by four integration tests. | Two ledgers would be two answers. S-5 decides which owns which rows. |
| §8.2 `WOZTELL_OPEN_API_TOKEN` | Appears nowhere: not in `.env.example`, not in `lib/config/env.ts`. No GraphQL client and no second provider host exist (`WOZTELL_SEND_RESPONSES_URL` is a hard-coded const). | Task 11 adds all of it. Adding an **optional** field to `AiEnv` does not break `tests/unit/env-contract.test.ts`: its `toEqual` fixtures never set the variable and `parseAiEnvironment` spreads optionals conditionally. (An earlier survey claimed otherwise — it is wrong; verify by reading the conditional optional spread at **`lib/config/env.ts:165-176`**, `...(ai.WOZTELL_API_TOKEN === undefined ? {} : {…})` and its siblings. An earlier draft of this table cited 365-372, which is `parseAiEnv`/`aiEnv` and shows nothing of the sort.) |
| §8.3 "the four in `config/whatsapp-templates.ts`" | There are five: `renewal_14`, `dunning_3`, `concierge_follow_up_en`, `concierge_follow_up_zh_hk`, `event_reminder_24h`. | Cosmetic here, but the C2 plan's template registry must seed five. |
| §8.2 cites `lib/channels/woztell.ts:191-211` for the signature check | `validWebhookSignature` is at 197-217; the exported `verifyWebhook` wrapper at 277-279. The mechanism described is accurate. | Line numbers only. |
| CLAUDE.md "Known deadline" | Already discharged on this branch — `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` is gone and `tests/unit/unsubscribe-secret-rotation.test.ts` is now a permanent invariant. | Do not go looking for a `cronSecret` fallback to remove. |

---

## Scope decisions

**S-1 — Enums: the release is one transaction, so `ALTER TYPE … ADD VALUE` may add but never use.**
`npm run db:migrate` spawns `drizzle-kit migrate`, which delegates to `drizzle-orm`'s `PgDialect.migrate`. Read `node_modules/drizzle-orm/pg-core/dialect.cjs:62` — it is `await session.transaction(async (tx) => { for await (const migration of migrations) { … } })`: **every pending migration file runs inside one Postgres transaction**, and on a fresh database every file is pending at once. PostgreSQL permits `ADD VALUE` in a transaction block but forbids *using* the new value in it, unless the type itself was created in the same transaction.

Consequences, and they are absolute:
- `message_role` gains `'staff'` in 0031 and **no migration in this release may name that literal** — no DEFAULT, no CHECK, no backfill `UPDATE`. There are no existing staff rows, so nothing needs one. Runtime inserts happen in a later transaction and are fine. `drizzle/0008_m3_campaign_recipient_leases.sql` is the precedent: it added `'processing'` and used it nowhere.
- The three genuinely new types (`message_direction`, `message_delivery_status`, `conversation_handling`) are `CREATE TYPE` in the same transaction, so their values **may** be used immediately for column types, DEFAULTs and backfills.
- `conversations.channel` reuses the pre-existing `message_channel` type, which needs no `ADD VALUE` at all.

**S-2 — New columns get a `DEFAULT` and `NOT NULL` at ADD time; the backfill corrects the values.** This is the 0026/0027 pattern (`ALTER TABLE "events" ADD COLUMN "status" "event_status" DEFAULT 'draft' NOT NULL`, then 0027 `UPDATE`s), not the older 0012 add-nullable/SET-NOT-NULL dance. It keeps `lib/db/schema-core.ts` honest — the column is declared `.notNull()` from the first generate — and avoids a second generate.

**S-3 — `conversations.contact_id` is a link, not an owner arm.** D-6 pins the HMAC as the conversation owner key. `conversations_owner_check`, `ConversationOwner`, `ownerSchema`, `ownerValues`, `ownerPredicate`, `ownerSql`, `ownerFor` and `requireMatchingOwner` are all untouched by C1. `contact_id` is written by `claimInbound` when the inbound resolves to a contact, is read by the inbox for the "who is this" column and by C-4's deep link, and is nullable forever for member-owned and web conversations.

**S-4 — `messages.direction` defaults to `'inbound'`.** Either default is wrong half the time, so choose the inert one. An `'inbound'` row never enters the delivery ledger (its `delivery_status` stays NULL) and never triggers a send; an `'outbound'` default would put a forgotten writer's row into the send ledger. `conversations.last_inbound_at` is written explicitly by the webhook's inbound branch and is **never** derived from `direction`, so a mislabelled row cannot reopen the 24-hour window.

**S-5 — `messages.delivery_status` owns outbound rows; the jsonb outbox keeps the concierge reservation.** `lib/db/repos/woztell-delivery-outbox.ts` is a *reservation* keyed on the **inbound** row and pinned by four integration tests; it stays exactly as it is and continues to decide whether the concierge may send. `messages.delivery_status` is the state of an **outbound** row. They key on different rows and answer different questions, so they cannot disagree — but only if nothing writes both for one message. Task 10 makes the concierge's outbound row carry `delivery_status` and `provider_message_id` **as a stamp applied after the outbox has already decided**, never as a second decision. Unifying the two into one machine is C-8's job and is explicitly out of scope.

**S-6 — Staff replies never go through `conversationsRepository`.** Every write there is gated by `ownerPredicate(owner)` / `getOwnedFrom`, so an admin could only reach a member's conversation by constructing that member's `ConversationOwner` — the forgeable-principal shape boundary 10 and `tests/unit/server-action-actor-boundary.test.ts` exist to prevent. The reply lane is new actor-taking methods on `inboxRepository` that call `requireAdmin(actor)` and write `sent_by_profile_id = actor.profileId`.

**S-7 — One audit row per send, written in the same transaction as the write-ahead row.** `conversation.reply.queued` is the durable commitment to send; the outcome lives on the `messages` row itself (`delivery_status`, `error_code`, `provider_message_id`, `delivered_at`, `read_at`), joinable by the `messageId` in the audit metadata. Three rows per reply would be noise, and an audit row written *after* the adapter returns would be missing for exactly the sends that crashed.

**S-8 — Idempotency is a deterministic `outbound_key` *and* a short send lease. The key dedupes the row; the lease dedupes the send.**
The write-ahead row has no provider id yet, so `messages_provider_message_id_unique` cannot dedupe it. `lib/admin/inbox-action-core.ts` mints `outbound_key = "inbox:" + conversationId + ":" + sha256(kind|content|templateKey|sortedVariables).slice(0,32)`, and `messages_outbound_key_unique` (partial, `WHERE outbound_key IS NOT NULL`) makes a double-submit of the same draft **one row**.

One row is not one send. Two concurrent submits of the same draft — a double-click, or a Server Action the client retried — both reach `queueStaffMessage`; the loser gets `already_queued` and, in the naive design, calls the adapter anyway. One `messages` row, one `conversation.reply.queued` audit row, **two WhatsApp messages to the member**. The same hole reopens after any crash between the adapter returning and `settleStaffMessage` committing, because the row stays `queued` and `queued` is the re-send state.

So `messages` carries `send_claim_expires_at`, and `queueStaffMessage` **claims the send atomically**:
- the fresh `INSERT` sets `send_claim_expires_at = now() + INTERVAL '2 minutes'` → `disposition:"queued"`, this caller owns the send;
- on conflict, a guarded `UPDATE … SET delivery_status = 'queued', error_code = NULL, send_claim_expires_at = now() + INTERVAL '2 minutes' WHERE outbound_key = $k AND (delivery_status = 'queued' OR (delivery_status = 'failed' AND provider_message_id IS NULL)) AND (send_claim_expires_at IS NULL OR send_claim_expires_at <= now()) RETURNING id`. A row back → `disposition:"queued"`, this caller inherits an abandoned send or re-queues one the provider refused. Nothing back → `already_queued` (another submit holds a live claim) or `already_sent` (the row is settled: sent/delivered/read, or failed against a provider id the provider did issue). **The `failed` arm is load-bearing, not tidiness** — see Task 6 step 3: without it a refused reply is un-resendable and the retry is reported as `already_sent`;
- `already_queued` and `already_sent` both **short-circuit before the adapter**. `already_queued` surfaces as `SEND_IN_PROGRESS`, which is a distinct thing to tell staff from `sent`.

Two minutes is the lease because it comfortably exceeds the adapter's own request timeout and is short enough that a crashed send is retryable within one staff attention span. The lease is not an audit fact: `settleStaffMessage` clears it, and a `sent` row's stale claim is inert.

**S-9 — One module answers "may we send?", for two recipient kinds, through two gates, and C1 creates it.**
`message_suppressions.profile_id` is NOT NULL, so a contact can never be suppressed there; contact opt-out lives on `contacts.whatsapp_opt_in` / `whatsapp_opted_out_at`. A check that reads one of the two produces a blast that reaches someone who said STOP. `lib/db/repos/message-eligibility.ts` reads **both**.

**Ownership, decided here because both Phase C plans wanted to create this file.** C1 Task 5 creates it with:
- a **private** `loadRecipientFacts(database, recipient)` — the one query, the one join, the one set of `EXISTS` sub-selects;
- an exported `RecipientFacts` type (C2 Task 3 and Task 8 consume it, and must not re-declare it);
- `whatsAppEligibility(actor: Actor, input)` gated by `requireAdmin(actor)`.

C2 Task 3 then **modifies** the file — it does not create it — adding `factsFor(actor: NotificationActor | AutomationRepositoryActor, recipient)` gated by `requireDeliveryActor`, over the same private loader. Two methods, two gates, deliberately: an admin replying in the inbox is a **session** principal and `requireDeliveryActor` is a capability check over a `unique symbol` that a session actor can never satisfy; a runner or a dispatcher is a **capability** principal and has no `profileId` for `requireAdmin` to check. Neither gate can be widened to cover the other without becoming forgeable, so the module has two doors and a test asserting each refuses the other's actor **before `loadDatabase` is called** — the shape `tests/unit/automation-repository-authorization.test.ts` already pins.

Precedence (C1's, authoritative; C2 Task 8's `classifyRecipient` maps onto it, see that task):
1. an explicit withdrawal blocks **both** purposes;
2. a `classification='marketing'` suppression blocks `purpose:"marketing"` only;
3. **marketing opt-in gates `purpose:"marketing"` only.** A `service` reply is a direct answer to a message the recipient sent us minutes ago; the gate on it is the 24-hour customer-service window, not a marketing consent flag. This is not a nicety — `contacts.whatsapp_opt_in` is `.default(false).notNull()` (`lib/db/schema-core.ts:1123`) and `upsertFromWhatsApp` never sets it (its own comment at `lib/db/repos/contacts.ts:96` says so: "marketing opt-in stays false"), so **every prospect who messages the WTIA number is `whatsapp_opt_in = false` forever**. Gating a service reply on it makes the §6 gate's own scenario impossible and blocks the only population Phase C exists to serve.

**S-10 — Human-handled threads leave the retention sweeps.** `conversationsRepository.deleteExpired` deletes at `expires_at` with no handling filter, and `chatRetentionRepository` deletes every concierge message older than twelve months regardless of sender — so today a staff↔member thread with an audit trail is deleted whole, taking the delivery record and the only cleartext copy of an anonymous sender's number with it. Both gain `handling = 'bot'`. Separately, `claimInbound` starts extending `expires_at` on every inbound, because retention is "365 days after the last contact", not "after the first".

**S-11 — STOP is a bounded token list, never a substring.** `text.toUpperCase() === "STOP" || text === "取消"` misses everything a real person types; matching any message *containing* "stop" would opt out someone asking us to stop a subscription they still want. `lib/whatsapp/opt-out.ts` trims, strips trailing `. 。 ! ！` and matches the whole remaining string against a closed list.

**S-12 — C1 replies into existing threads only.** Staff opening a brand-new thread to a contact who has never written in is C-4/C-2 work: it needs `anonymousOwnerHash` from a Server Action, a template (the window is shut by definition), and a decision about contacts with no number. The §6 gate does not require it.

**S-13 — "notify the assignee" is a direct `staff_tasks` INSERT, not `agentToolsRepository.createStaffTask`.**
The obvious call is unbuildable four ways over, and every one of them fails at runtime rather than at compile time:
- `agentToolsRepository.createStaffTask` opens with `requireConciergeAgent(actor)` (`lib/db/repos/agent-tools.ts:350`). The human lane deliberately starts **no agent run**, so there is no `runId`, no `conversationId`-bearing agent actor, and nothing to construct one from.
- `staffTaskInputSchema` (`agent-tools.ts:134-159`) parses `kind` against a closed, `.strict()` `z.enum` of five `concierge_*` values. `inbox_human_reply_waiting` is a `ZodError`.
- it throws `INVALID_AGENT_STAFF_TASK_PROFILE` when `parsed.profileId !== actor.profileId` — an anonymous prospect has no profile and can never satisfy it.
- `dedupeKey` is **not an input**: the repository derives `agent-run:${actor.runId}:${kind}:${summaryCode}`.

Nor does the generic path work: `staffTasksRepository.createOnce` with an `AutomationRepositoryActor` throws `AUTOMATION_STAFF_TASK_PROFILE_REQUIRED` when `profileId` is null (`lib/db/repos/staff-tasks.ts`), which is exactly the prospect case.

The working precedent is the direct `INSERT INTO staff_tasks (profile_id, journey_state_id, kind, dedupe_key, summary_code) … ON CONFLICT DO NOTHING RETURNING id` used by `lib/db/repos/campaign-recipient-delivery.ts:255`, `lib/db/repos/journeys.ts:275` and `lib/db/repos/dunning-lapse.ts:65`. `staff_tasks.profile_id` is **nullable** (`schema-core.ts:597`), `kind` is free `text` (:599), `dedupe_key` is uniquely indexed (:618), and `components/admin/task-table.tsx:19` renders `task.kind` raw — so a new free-text kind needs no label map and no bundle string. That is the shape the human lane uses, from `lib/db/repos/woztell-inbound-events.ts`, with `dedupe_key = \`inbox-waiting:${conversationId}\`` so a burst of inbound messages is one task.

**Correction (review of Task 4): the INSERT alone does not let the next burst raise a new task, and this paragraph used to claim it did.** `staff_tasks_dedupe_key_unique` is a plain `UNIQUE(dedupe_key)` (`schema-core.ts:688`, `drizzle/0007_m3_automations.sql:46`), **not** partial on `status`; `staffTasksRepository.resolve` only sets `status = 'resolved'` (`staff-tasks.ts:311`) and nothing deletes `staff_tasks` rows. So once the assignee resolves the first task, the key is consumed for the life of the thread: every later inbound conflicts with the resolved row, returns no id, and `listOpen`/the inbox `tasks` CTE — both `WHERE status = 'open'` — show nothing. The lane goes silent exactly one resolve in. Any writer using this shape for a **recurring** condition must therefore retire the resolved row's key inside the same transaction first:

```sql
UPDATE staff_tasks SET dedupe_key = dedupe_key || ':closed:' || id::text, updated_at = now()
WHERE dedupe_key = $key AND status = 'resolved';
```

Retired rather than reopened: `/admin/tasks` orders by and prints `created_at`, so a re-raised task needs today's timestamp, and the resolved row must keep its `resolved_at` and `resolved_by_profile_id` — the only record that anyone handled it. The retired key keeps its prefix, so history stays greppable.

C2 Task 5 (`kind: "contact_merge_candidate"`) and C2 Task 10 Step 5 ("terminal with a staff task") inherit this decision and must use the same shape, **including the retire statement** wherever the condition can recur after a resolve.

**S-14 — the two new webhook-side repositories take capability actors, because the legacy exceptions are exceptions.**
`lib/db/repos/woztell.ts` and `lib/db/repos/woztell-delivery-outbox.ts` take no `Actor` and authorize nothing. They predate the §9 capability-actor rule and are the standing exceptions — the C2 plan's debt list says in as many words "do not cite them as precedent for a new writer", and an earlier draft of this plan did exactly that. Boundary 1 says repositories are the authorization gate; boundary 10 says public writers use dedicated capability actors. Nothing in the tree enforces this automatically (`tests/unit/repository-production-security.test.ts` is a hand-written list and `tests/unit/repository-boundary.test.ts` only checks import specifiers), so "a comment saying the route's HMAC is the gate" is a claim, not a mechanism — and Task 11 would have disproved it anyway by adding `importHistoricalInbound` to the same actorless store, reachable from `/api/admin/woztell/backfill`, which has **no HMAC in front of it**.

So each new module mints a `unique symbol` capability the way `contactWriterActor` does (`lib/db/repos/contacts.ts:17-30`), and asserts it as the first statement of every method:
- `woztellWebhookActor()` — `lib/db/repos/woztell-inbound-events.ts` (Task 3);
- `woztellDeliveryActor()` — `lib/db/repos/woztell-delivery-stamp.ts` (Task 10);
- `woztellBackfillActor()` — `importHistoricalInbound` (Task 11), a **different** capability from the webhook's, so the backfill's second entry point is safe by construction rather than by discipline.

Each new method gains a case in `tests/unit/repository-production-security.test.ts` asserting a member, an admin and an anonymous actor are refused **before** `loadDatabase` is called. The two legacy modules stay as they are; this plan does not retrofit them, and now has no reason to cite them.

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `lib/db/schema-core.ts` (M), `drizzle/0031_phase_c_conversation_operations.sql` (generated), `drizzle/0032_phase_c_message_direction_backfill.sql` (custom), `tests/fixtures/message-direction.ts` (C), `tests/fixtures/conversation-channel.ts` (C), `tests/unit/phase-c-schema-contract.test.ts` (C) | 1 | columns, enums, backfill + twins |
| `lib/whatsapp/opt-out.ts` (C), `lib/channels/types.ts` (M), `lib/channels/woztell.ts` (M, incl. **exporting `CUSTOMER_SERVICE_WINDOW_MS`**), `tests/fixtures/woztell.ts` (M) | 2 | normaliser v2, opt-out vocabulary, one window constant |
| `lib/db/repos/woztell.ts` (M), `lib/db/repos/woztell-inbound-events.ts` (C), `lib/db/repos/conversations.ts` (M, `appendMessageFrom` only), `tests/unit/message-direction-writers.test.ts` (C) | 3 | inbound claim v2, delivery-status and echo writers, `direction` on the pre-existing outbound writer |
| `lib/ai/woztell-webhook.ts` (M), `lib/ai/woztell-production.ts` (M), `lib/api/woztell-webhook-route.ts` (M) | 4 | processor branches, human-lane skip, retry-on-error |
| `lib/db/repos/contacts.ts` (M), `lib/db/repos/message-eligibility.ts` (C), `lib/db/repos/index.ts` (M) | 5 | contact consent audit, re-opt-in guard, eligibility |
| `lib/db/repos/inbox.ts` (M) | 6 | staff write methods, write-ahead + audit |
| `lib/admin/inbox.ts` (M), `lib/admin/inbox-action-core.ts` (C), `lib/admin/inbox-actions.ts` (C), `lib/ai/woztell-credentials.ts` (C), `lib/api/woztell-webhook-route.ts` (M), `tests/unit/admin-server-action-boundaries.test.ts` (M) | 7 | actor-resolving action layer, one credential construction site, adapter call |
| `lib/whatsapp/approved-templates.ts` (C), `lib/ai/woztell-production.ts` (M), `components/admin/inbox-thread.tsx` (M), `components/admin/inbox-composer.tsx` (C), `components/admin/inbox-list.tsx` (M), `app/[locale]/(admin)/admin/inbox/[id]/page.tsx` (M), `app/[locale]/(admin)/admin/inbox/page.tsx` (M), `messages/{en,zh-HK}.json` (M) | 8 | approved-key reader, thread UI, ticks, countdown, drafts, bundles |
| `lib/db/repos/conversations.ts` (M), `lib/db/repos/chat-retention.ts` (M) | 9 | retention exemptions |
| `lib/db/repos/woztell-delivery-stamp.ts` (C), `lib/ai/woztell-production.ts` (M), `lib/ai/woztell-delivery.ts` (M) | 10 | concierge replies get a provider id and a tick |
| `lib/config/env.ts` (M), `.env.example` (M), `lib/channels/woztell-open-api.ts` (C), `lib/api/woztell-backfill-route.ts` (C), `app/api/admin/woztell/backfill/route.ts` (C), `config/wisetech-protected-route-inventory.ts` (M), `tests/unit/next-route-exports.test.ts` (M), `tests/unit/wisetech-protected-route-ownership.test.ts` (M) | 11 | C-3 backfill |
| `tests/e2e/phase-c1-whatsapp-human-lane.spec.ts` (C) | 12 | acceptance |

---

### Task 1: Schema — conversation and message operational columns (§6 schema, 0031 + 0032)

**Files:** `lib/db/schema-core.ts` (enums :64-66, `conversations` :505-538, `messages` :540-565), `drizzle/0031_*`, `drizzle/0032_*` (custom), `tests/fixtures/message-direction.ts`, `tests/fixtures/conversation-channel.ts`, `tests/unit/phase-c-schema-contract.test.ts`.

- [ ] **Step 1: Failing test** — new `tests/unit/phase-c-schema-contract.test.ts`, in the shape of `tests/unit/schema-contract.test.ts`'s Phase B2 block (`getTableConfig` from `drizzle-orm/pg-core`):

```ts
import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {conversationHandlingEnum, conversations, messageDeliveryStatusEnum, messageDirectionEnum, messageRoleEnum, messages} from "@/lib/db/schema-core";
import {derivedConversationChannel} from "@/tests/fixtures/conversation-channel";
import {derivedMessageDirection} from "@/tests/fixtures/message-direction";

describe("phase C1 conversation operations contract", () => {
  it("gives a conversation a channel, a handling state and a staff assignment", () => {
    for (const column of ["channel", "handling", "contactId", "assignedToProfileId", "whatsappMemberId", "lastInboundAt", "lastStaffReadAt", "subject"] as const) {
      expect(conversations[column]).toBeDefined();
    }
    expect(conversationHandlingEnum.enumValues).toEqual(["bot", "human", "closed"]);
    expect(conversations.handling.notNull).toBe(true);
    expect(conversations.channel.notNull).toBe(true);
  });

  it("leaves the two-armed owner check alone (D-6: the HMAC stays the owner key)", () => {
    const names = getTableConfig(conversations).checks.map((check) => check.name);
    expect(names).toContain("conversations_owner_check");
    expect(names).not.toContain("conversations_contact_owner_check");
  });

  it("gives a message a direction, a delivery status and a staff sender", () => {
    for (const column of ["direction", "deliveryStatus", "sentByProfileId", "templateKey", "errorCode", "deliveredAt", "readAt", "outboundKey", "sendClaimExpiresAt"] as const) {
      expect(messages[column]).toBeDefined();
    }
    expect(messageDirectionEnum.enumValues).toEqual(["inbound", "outbound"]);
    expect(messageDeliveryStatusEnum.enumValues).toEqual(["queued", "sent", "delivered", "read", "failed"]);
    expect(messages.direction.notNull).toBe(true);
    expect(messages.deliveryStatus.notNull).toBe(false);
  });

  it("appends 'staff' to message_role without disturbing the existing values", () => {
    expect(messageRoleEnum.enumValues).toEqual(["user", "assistant", "tool", "staff"]);
  });

  it("indexes the write-ahead key partially, because a queued row has no provider id yet", () => {
    const names = getTableConfig(messages).indexes.map((index) => index.config.name);
    expect(names).toContain("messages_outbound_key_unique");
    expect(names).toContain("messages_provider_message_id_unique");
  });

  it("derives direction the way migration 0032 does", () => {
    expect(derivedMessageDirection({role: "user"})).toBe("inbound");
    for (const role of ["assistant", "tool"] as const) expect(derivedMessageDirection({role})).toBe("outbound");
  });

  it("calls a conversation WhatsApp when any of its messages is, not only the newest", () => {
    const t = (iso: string) => new Date(iso);
    expect(derivedConversationChannel([])).toBe("web");
    expect(derivedConversationChannel([{channel: "web", createdAt: t("2026-01-01T00:00:00Z")}])).toBe("web");
    // The row class this changes: a WhatsApp thread whose newest message is a
    // web reply. The old latest-message derivation in lib/db/repos/inbox.ts
    // called it "web", and the send path would then believe it may not use the
    // WhatsApp adapter for a thread that plainly is one.
    expect(derivedConversationChannel([
      {channel: "whatsapp", createdAt: t("2026-01-01T00:00:00Z")},
      {channel: "web", createdAt: t("2026-01-02T00:00:00Z")},
    ])).toBe("whatsapp");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/phase-c-schema-contract.test.ts --reporter=dot` → FAIL (modules and columns missing). Read the failure: it must name the missing export, not a path typo.

- [ ] **Step 3: Enums** — beside `messageRoleEnum` at `lib/db/schema-core.ts:65`:

```ts
// Programme C-2: 'staff' is appended at the END so drizzle-kit emits a plain
// `ALTER TYPE … ADD VALUE 'staff'` rather than 0008's `… BEFORE …` form.
// `npm run db:migrate` runs EVERY pending migration inside ONE transaction
// (drizzle-orm/pg-core/dialect.cjs:62), and PostgreSQL forbids using a value
// added by ALTER TYPE in the transaction that added it. So no migration in this
// release may name 'staff' — not in a DEFAULT, a CHECK or a backfill. Runtime
// inserts commit in a later transaction and are unaffected.
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "tool", "staff"]);
// These three are CREATE TYPE, not ADD VALUE, so 0031 may use them freely.
export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageDeliveryStatusEnum = pgEnum("message_delivery_status", ["queued", "sent", "delivered", "read", "failed"]);
export const conversationHandlingEnum = pgEnum("conversation_handling", ["bot", "human", "closed"]);
```

Types: `export type ConversationHandling = (typeof conversationHandlingEnum.enumValues)[number];` and `export type MessageDeliveryStatus = (typeof messageDeliveryStatusEnum.enumValues)[number];`.

- [ ] **Step 4: `conversations`** — append inside the column object (before `createdAt`):

```ts
  // Programme C-1/C-2. `channel` was derived from the newest message until now
  // (see lib/db/repos/inbox.ts) — a derivation that calls a WhatsApp thread
  // "web" the moment a web reply lands on it, and that the send path cannot
  // trust. `handling` is the interlock between the concierge and a person:
  // 'human' makes the webhook persist and notify without starting a bot turn.
  channel: messageChannelEnum("channel").default("web").notNull(),
  handling: conversationHandlingEnum("handling").default("bot").notNull(),
  // D-6 keeps anonymous_owner_hash as the OWNER key, so this is a link, not an
  // owner arm: conversations_owner_check stays two-armed and untouched.
  contactId: uuid("contact_id").references((): AnyPgColumn => contacts.id, {onDelete: "set null"}),
  assignedToProfileId: text("assigned_to_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  whatsappMemberId: text("whatsapp_member_id"),
  // The 24-hour customer-service window is measured from here. NOT from
  // last_message_at, which every outbound reply bumps and which would restart
  // the window on every bot answer.
  lastInboundAt: timestamp("last_inbound_at", {withTimezone: true}),
  lastStaffReadAt: timestamp("last_staff_read_at", {withTimezone: true}),
  // RESERVED. §6 lists it and no task in Phase C1 or C2 writes or reads it —
  // stated here rather than discovered as a puzzling always-NULL column. The
  // obvious future writer is a thread title on the composer; until one exists,
  // do not add a read that would render an empty string as a title.
  subject: text("subject"),
```

and to the third `pgTable` argument add `index("conversations_handling_assigned_idx").on(table.handling, table.assignedToProfileId)` and `index("conversations_contact_idx").on(table.contactId)`. `contacts` is declared at :1108, after `conversations`, so the reference is the typed lazy form (`AnyPgColumn` is already imported for `companies.logoMediaId`).

- [ ] **Step 5: `messages`** — append inside the column object (before `createdAt`):

```ts
  // Programme C-1. Default 'inbound' deliberately (plan S-4): an inbound row is
  // inert — it never carries a delivery_status and never triggers a send — so a
  // writer that forgets the field cannot push a row into the send ledger.
  // conversations.last_inbound_at is written explicitly by the webhook and is
  // never derived from this column, so a mislabelled row cannot reopen the
  // 24-hour window.
  direction: messageDirectionEnum("direction").default("inbound").notNull(),
  // NULL for every web row and every inbound row: "this message has no delivery
  // state", not "unknown". Only outbound WhatsApp rows carry one.
  deliveryStatus: messageDeliveryStatusEnum("delivery_status"),
  sentByProfileId: text("sent_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  templateKey: text("template_key"),
  errorCode: text("error_code"),
  deliveredAt: timestamp("delivered_at", {withTimezone: true}),
  readAt: timestamp("read_at", {withTimezone: true}),
  // Plan S-8. The write-ahead row has no provider id yet, so
  // messages_provider_message_id_unique cannot dedupe a retried staff send.
  // This key is deterministic in (conversation, kind, content, template) and is
  // what makes the send action idempotent.
  outboundKey: text("outbound_key"),
  // Plan S-8, second half. outbound_key dedupes the ROW; this dedupes the SEND.
  // Two concurrent submits of one draft both find (or create) the same row, and
  // without a lease the loser calls the adapter anyway: one messages row, one
  // audit row, two WhatsApp messages to the member. A caller may call the
  // adapter only if it holds a live claim. Cleared by settleStaffMessage; a
  // stale claim on a non-`queued` row is inert.
  sendClaimExpiresAt: timestamp("send_claim_expires_at", {withTimezone: true}),
```

and to the third argument add:

```ts
    uniqueIndex("messages_outbound_key_unique")
      .on(table.outboundKey)
      .where(sql`${table.outboundKey} IS NOT NULL`),
    index("messages_delivery_status_idx")
      .on(table.deliveryStatus)
      .where(sql`${table.deliveryStatus} IS NOT NULL`),
```

Do **not** make `provider_message_id` fully unique; the existing partial index is correct and every `ON CONFLICT` against it must keep repeating `WHERE provider_message_id IS NOT NULL` verbatim.

- [ ] **Step 6: Twins** — `tests/fixtures/message-direction.ts`:

```ts
import type {Message} from "@/lib/db/server-schema";

/** The TypeScript twin of `drizzle/0032_phase_c_message_direction_backfill.sql`,
 * the way tests/fixtures/event-row.ts mirrors 0027 (programme D-12). The
 * backfill runs once against a database no local gate has, so its derivation is
 * only ever asserted as behaviour through this mirror. `lib/db/repos/inbox.ts`
 * and `appendMessageFrom` must call this helper rather than re-deriving. */
export function derivedMessageDirection(row: Pick<Message, "role">): "inbound" | "outbound" {
  return row.role === "user" ? "inbound" : "outbound";
}
```

`tests/fixtures/conversation-channel.ts`:

```ts
export type ConversationChannelSeedMessage = Readonly<{channel: "web" | "whatsapp"; createdAt: Date}>;

/** Twin of 0032's conversations.channel backfill. Deliberately NOT the
 * latest-message rule lib/db/repos/inbox.ts used: a WhatsApp thread whose newest
 * message is a web reply is still a WhatsApp thread, and the send path has to
 * know whether it may reach for the WhatsApp adapter at all. Empty → 'web',
 * because a conversation with no messages has no WhatsApp evidence. */
export function derivedConversationChannel(messages: readonly ConversationChannelSeedMessage[]): "web" | "whatsapp" {
  return messages.some((message) => message.channel === "whatsapp") ? "whatsapp" : "web";
}
```

- [ ] **Step 7: Generate 0031** — `npx drizzle-kit generate --config=drizzle.config.ts --name phase_c_conversation_operations`. Read the emitted SQL before committing it and confirm all four:
  1. `ALTER TYPE "public"."message_role" ADD VALUE 'staff';` is present and `'staff'` appears **nowhere else** in the file.
  2. Three `CREATE TYPE` statements for `message_direction`, `message_delivery_status`, `conversation_handling`.
  3. `ALTER TABLE "conversations" ADD COLUMN "channel" "message_channel" DEFAULT 'web' NOT NULL;` — i.e. it reuses the existing type and emits **no** second channel enum.
  4. No `ALTER TABLE "conversations" DROP CONSTRAINT "conversations_owner_check"`. If one appears you edited the check; revert it (S-3).
  Confirm `drizzle/meta/0031_snapshot.json`'s `prevId` equals `9e39066a-db08-42f7-9531-76134f2dfe4b`. Commit `drizzle/meta/*` untouched.

- [ ] **Step 8: Generate 0032** — `npx drizzle-kit generate --config=drizzle.config.ts --custom --name phase_c_message_direction_backfill`, filled with:

```sql
-- Programme C-1 / D-12. Two derivations, both mirrored in TypeScript under
-- tests/fixtures/ and asserted by tests/unit/phase-c-schema-contract.test.ts,
-- because this runs once against a database no local gate has.
--
-- Note what is NOT here: nothing names 'staff'. `npm run db:migrate` runs every
-- pending file in ONE transaction, and PostgreSQL refuses to use an enum value
-- added by ALTER TYPE in the transaction that added it. 0031 adds it; the
-- application writes it later, in its own transaction.

-- direction: the role a message was written in decides which way it went.
UPDATE "messages"
SET "direction" = CASE WHEN "role" = 'user' THEN 'inbound'::"message_direction" ELSE 'outbound'::"message_direction" END;
--> statement-breakpoint

-- channel: a conversation is WhatsApp if ANY of its messages is, not merely if
-- its newest one is. The old latest-message derivation in lib/db/repos/inbox.ts
-- called a WhatsApp thread "web" as soon as a web reply landed on it.
UPDATE "conversations" c
SET "channel" = 'whatsapp'::"message_channel"
WHERE EXISTS (SELECT 1 FROM "messages" m WHERE m."conversation_id" = c."id" AND m."channel" = 'whatsapp');
--> statement-breakpoint

-- last_inbound_at: seed the window clock from the newest inbound WhatsApp
-- message so a thread already open when this deploys does not read as "never
-- messaged" and lock staff out of a window that is genuinely still open.
UPDATE "conversations" c
SET "last_inbound_at" = sub.newest
FROM (
  SELECT m."conversation_id" AS id, max(m."created_at") AS newest
  FROM "messages" m
  WHERE m."channel" = 'whatsapp' AND m."role" = 'user'
  GROUP BY m."conversation_id"
) sub
WHERE c."id" = sub.id;
```

- [ ] **Step 9: Verify** `npx vitest run tests/unit/phase-c-schema-contract.test.ts tests/unit/schema-contract.test.ts tests/unit/m4c-schema-contract.test.ts tests/unit/campaign-recipient-lease-schema.test.ts tests/unit/m3-schema-contract.test.ts --reporter=dot && npm run typecheck`. The last three are the source-text-slice assertions: `campaign-recipient-lease-schema` slices `schema-core.ts` from `pgTable("campaign_recipients"` to `export const events`, and `m3-schema-contract` does the same between `export const companies` and `export const companyMembers`. C1 declares no new table, so both slices are unchanged — but if a later task is tempted to add one, declare it **after** `export const events`.

- [ ] **Step 10: Commit** — `git add lib/db/schema-core.ts drizzle tests/fixtures/message-direction.ts tests/fixtures/conversation-channel.ts tests/unit/phase-c-schema-contract.test.ts && git commit -m "feat(db): conversation handling and message delivery columns for the WhatsApp human lane (C-1, C-2)"`.

---

### Task 2: Normaliser v2 and the opt-out vocabulary (C-1)

**Files:** `lib/whatsapp/opt-out.ts` (C), `lib/channels/types.ts` (M, `NormalizedInbound`), `lib/channels/woztell.ts` (M, `normalizedInbound`), `tests/fixtures/woztell.ts` (M). Tests: `tests/unit/whatsapp-opt-out.test.ts` (C), `tests/unit/woztell-normalizer-v2.test.ts` (C).

- [ ] **Step 1: Failing tests.** `tests/unit/whatsapp-opt-out.test.ts` carries hostile and safe samples, per the AGENTS.md boundary-test shape:

```ts
import {describe, expect, it} from "vitest";
import {isOptOutText, OPT_OUT_TOKENS} from "@/lib/whatsapp/opt-out";

describe("WhatsApp opt-out vocabulary (D-7, plan S-11)", () => {
  it("accepts the closed token list after trimming and stripping end punctuation", () => {
    for (const token of ["STOP", "stop", " Stop. ", "取消", "取消。", "退訂", "停止", "UNSUBSCRIBE", "opt out", "OPTOUT", "取消訂閱"]) {
      expect(isOptOutText(token), token).toBe(true);
    }
  });
  it("never matches a substring, because 'stop sending me the newsletter' is not consent withdrawal for everything", () => {
    for (const text of ["stop sending me the newsletter", "please stop the renewal emails", "Can you stop by tomorrow?", "取消我的活動報名", "no"]) {
      expect(isOptOutText(text), text).toBe(false);
    }
  });
  it("keeps the vocabulary closed so widening it is a reviewed change", () => {
    expect(OPT_OUT_TOKENS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(OPT_OUT_TOKENS).size).toBe(OPT_OUT_TOKENS.length);
  });
});
```

`tests/unit/woztell-normalizer-v2.test.ts` drives `createWoztellAdapter(woztellEnv).normalizeInbound` over the four kinds, and asserts the two existing `unsupported` literals still come back byte-identical for `{type: "IMAGE"}` and `null` (`tests/unit/woztell-review-gaps.test.ts` pins those; do not disturb them).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `lib/whatsapp/opt-out.ts`**

```ts
/**
 * D-7 / plan S-11. Exact whole-string tokens, never a substring: matching any
 * message containing "stop" would opt a member out of everything because they
 * asked us to stop one thing. The old rule — `text.toUpperCase() === "STOP" ||
 * text === "取消"` in lib/channels/woztell.ts — went the other way and missed
 * "Stop.", "unsubscribe" and 退訂, which is most of what a real person types.
 * Widening this list is a reviewed change with a test, not a regex tweak.
 */
export const OPT_OUT_TOKENS = Object.freeze([
  "STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "取消", "退訂", "停止", "取消訂閱",
] as const);

const TRAILING_PUNCTUATION = /[.。!！?？\s]+$/u;
const tokens = new Set<string>(OPT_OUT_TOKENS);

export function isOptOutText(text: string): boolean {
  return tokens.has(text.trim().replace(TRAILING_PUNCTUATION, "").toUpperCase());
}
```

(`toUpperCase()` is a no-op for the CJK tokens and correct for the latin ones; `OPT OUT` keeps its single interior space.)

- [ ] **Step 4: `NormalizedInbound`** — in `lib/channels/types.ts`, widen the union with **new variants, never new fields on `message`**, and add the member id to `message`:

```ts
export type NormalizedInbound =
  | Readonly<{
    kind: "message";
    sender: string;
    text: string;
    intent: "opt_out" | null;
    providerMessageId: string;
    receivedAt: Date;
    /** C-1: the Woztell member id, resolved before the phone number. Null when
     * the payload does not carry one — every payload shape before Phase C. */
    whatsappMemberId: string | null;
  }>
  | Readonly<{
    kind: "delivery_status";
    /** The id of the OUTBOUND message this status is about. */
    providerMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    errorCode: string | null;
    occurredAt: Date;
  }>
  | Readonly<{
    kind: "outbound_echo";
    recipient: string;
    text: string;
    providerMessageId: string;
    origin: "BOT" | "MANUAL" | "RELAY";
    sentAt: Date;
  }>
  | Readonly<{kind: "unsupported"; sender: string | null; text: null; intent: null}>;
```

- [ ] **Step 5: `normalizedInbound`** — in `lib/channels/woztell.ts`, keep the existing `TEXT` branch first and unchanged apart from `whatsappMemberId` and the opt-out call, then add two branches before the `unsupported` fallback. Discriminate exactly as the existing code does: one `payload.type` string test, every required field checked, and an `unsupported` return for anything short.

```ts
const DELIVERY_STATUSES = new Set(["sent", "delivered", "read", "failed"]);
const ECHO_ORIGINS = new Set(["BOT", "MANUAL", "RELAY"]);

function memberIdFrom(payload: Record<string, unknown>): string | null {
  const value = payload.memberId ?? (isRecord(payload.member) ? payload.member.id : undefined);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
```

`delivery_status` branch: `payload.type === "MESSAGE_STATUS"`, `payload.messageId` a non-blank string, `String(payload.data?.status).toLowerCase()` in `DELIVERY_STATUSES`, `receivedAtFrom(payload.timestamp)` non-null; `errorCode` is `payload.data?.errorCode` as a trimmed string or null.
`outbound_echo` branch: `payload.type === "OUTBOUND"`, `payload.to` a non-blank string, `payload.data?.text` a non-blank trimmed string, `payload.messageId` non-blank, `String(payload.origin)` in `ECHO_ORIGINS`, `receivedAtFrom(payload.timestamp)` non-null.

Replace the inline STOP test with `isOptOutText(text) ? "opt_out" : null`.

**Also in this task, one line that Task 7 and Task 8 both depend on:** `lib/channels/woztell.ts:22` declares `const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;` **module-private**, and `sendSessionMessage` enforces the window against it. Add `export` to that declaration and nothing else. Task 7's action core and Task 8's `replyWindow` helper then **import** it rather than retyping `24 * 60 * 60 * 1_000`, which is what makes Task 8 Step 1's "uses the *same* constant the adapter enforces against" a testable claim instead of a hopeful comment. Two readers, one constant, no drift when Meta changes the window.

> ⚠️ **O-1 (open question).** These two discriminators are **provisional**: no live Woztell credentials, no captured payload and no provider documentation are available in this environment, and `tests/fixtures/woztell.ts` only ever carried `{from, type:"TEXT", messageId, timestamp, data:{text}}`. Keep both branches inside `normalizedInbound` and nowhere else, so correcting them against a real payload is a one-function change. C-9's checklist **must** include replaying one captured delivery-status and one captured echo payload through `normalizeInbound` before `RUN_LIVE_WOZTELL=1` is flipped. Until that happens, treat "the ticks do not arrive" as a normaliser problem first.

- [ ] **Step 6: Fixtures** — add `woztellDeliveryStatusPayload`, `woztellOutboundEchoPayload` and `woztellInboundWithMemberIdPayload` to `tests/fixtures/woztell.ts`. Do not change the existing `{type:"TEXT"}` fixture; every current test builds on it.

- [ ] **Step 7: Run** `npx vitest run tests/unit/whatsapp-opt-out.test.ts tests/unit/woztell-normalizer-v2.test.ts tests/unit/woztell-adapter.test.ts tests/unit/woztell-review-gaps.test.ts tests/unit/woztell-numeric-timestamp.test.ts tests/unit/woztell-contact-capture.test.ts --reporter=dot && npm run typecheck` → PASS.

- [ ] **Step 8: Commit** — `git commit -m "feat(channels): normalise delivery-status and outbound-echo events and widen the opt-out vocabulary (C-1, D-7)"`.

---

### Task 3: Inbound claim v2 and the two new event writers (C-1)

**Files:** `lib/db/repos/woztell.ts` (M), `lib/db/repos/woztell-inbound-events.ts` (C), `lib/db/repos/conversations.ts` (M — `appendMessageFrom` only). Test: `tests/unit/woztell-inbound-events.test.ts` (C), `tests/unit/woztell-claim-v2.test.ts` (C), `tests/unit/message-direction-writers.test.ts` (C).

`WoztellInboundClaimInput` gains `whatsappMemberId: string | null` and `contactId: string | null`; `WoztellInboundClaim`'s accepted arm gains `handling: ConversationHandling` and `lastInboundAt: Date | null`.

- [ ] **Step 1: Failing tests** in the shape of `tests/unit/woztell-recovery-repository.test.ts` (a fake `{execute, transaction}` whose `execute` shifts a queued row list). Assert:
  - `claimInbound` inserts the inbound message with `direction = 'inbound'` and sets `conversations.channel='whatsapp'`, `last_inbound_at`, `whatsapp_member_id`, `contact_id` and an extended `expires_at`;
  - the reuse query no longer requires a prior `channel='whatsapp'` **message** — it matches on `conversations.channel = 'whatsapp'` instead (see Step 3);
  - `claimInbound` returns `handling` from the conversation row;
  - `recordDeliveryStatus` returns `{matched: false}` when no outbound row carries that provider id, and never throws;
  - `recordOutboundEcho` **adopts** a still-queued outbound row with the same content **in the same conversation** — and, given two queued rows with byte-identical content in *different* conversations, adopts the one belonging to `$recipient` and leaves the other alone (Step 4);
  - an echo whose `origin` is `MANUAL` or `RELAY` lands as `role='staff'` with a null sender **and** an `audit_events` row; a `BOT` echo lands as `role='assistant'` with none (Step 4);
  - both new writers are no-ops on a second call with the same provider id;
  - every method refuses a member, an admin and an anonymous actor before `loadDatabase` is called (S-14).

  And in `tests/unit/message-direction-writers.test.ts`, the guard that makes Step 6 permanent:

```ts
import {readdirSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

// S-4 defaults messages.direction to 'inbound' precisely so a forgetful writer
// cannot push a row into the SEND ledger. The cost of that choice is that a
// forgetful writer silently mislabels every OUTBOUND row instead — which is
// four simultaneous silent failures (see Task 3 Step 6). This is the only thing
// that would catch the fifth writer somebody adds in Phase D.
describe("every messages writer names direction", () => {
  it("finds no INSERT INTO messages that omits the column", () => {
    const files = readdirSync("lib/db/repos").filter((name) => name.endsWith(".ts"));
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(`lib/db/repos/${file}`, "utf8");
      for (const statement of source.split(/INSERT\s+INTO\s+\$\{messages\}/i).slice(1)) {
        const columnList = statement.slice(0, statement.indexOf(")"));
        if (!/\bdirection\b/.test(columnList)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `claimInbound` changes** (`lib/db/repos/woztell.ts`), all additive:
  - the inbound `INSERT INTO messages` column list gains `direction` with the literal `'inbound'`. Keep `ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING` **verbatim** — the predicate must repeat the partial index's, and a mismatch raises only against Postgres, which no unit test in this repo reaches.
  - the new-conversation `INSERT INTO conversations` gains `channel` (`'whatsapp'`), `handling` (`'bot'`), `contact_id`, `whatsapp_member_id` and `last_inbound_at` (`input.receivedAt`).
  - the reuse `SELECT` keeps `ownerSql(input)` and `status='active'` but replaces the `EXISTS (… prior_message.channel = 'whatsapp')` sub-query with `AND ${conversations.channel} = 'whatsapp'`, and selects `handling`, `last_inbound_at`. **Why:** the EXISTS made a conversation invisible until it already contained an inbound WhatsApp message, so a thread whose only WhatsApp rows are outbound would be missed and a *second* conversation opened for the same person — splitting the thread the inbox exists to unify. 0032 backfills `channel` for every existing row, so the new predicate is at least as inclusive.
  - the reuse `UPDATE conversations` gains:
    ```sql
    last_inbound_at = GREATEST(COALESCE(last_inbound_at, ${input.receivedAt}), ${input.receivedAt}),
    whatsapp_member_id = COALESCE(whatsapp_member_id, ${input.whatsappMemberId}),
    contact_id = COALESCE(contact_id, ${input.contactId}),
    -- Retention is 365 days after the last contact, not after the first. Before
    -- this, expires_at was written once at creation and never moved, so a thread
    -- running for 366 days was eligible for deletion however active it was.
    expires_at = GREATEST(expires_at, ${new Date(current.getTime() + CONVERSATION_RETENTION_MS)})
    ```
  - `acceptedClaim` gains `handling` and `lastInboundAt`.

- [ ] **Step 4: `lib/db/repos/woztell-inbound-events.ts`** — a new module beside `woztell.ts`, taking a **capability actor** (S-14). It does *not* copy `createPostgresWoztellStore`'s actorless shape: that module and `woztell-delivery-outbox.ts` are the two standing pre-§9 exceptions, and the companion C2 plan says in as many words not to cite them as precedent for a new writer.

```ts
// S-14 / boundary 10. The route's HMAC is a gate on the ROUTE; this is the gate
// on the REPOSITORY, and they are not the same claim. `unique symbol` means no
// session actor, no admin actor and no plain object can be coerced into one, so
// a second entry point cannot reach these writers by accident — the way
// Task 11's backfill route, which has no HMAC in front of it, otherwise could.
const woztellWebhookCapability: unique symbol = Symbol("woztell-webhook-capability");
export type WoztellWebhookActor = Readonly<{kind: "woztell-webhook"; userId: null; [woztellWebhookCapability]: true}>;
export function woztellWebhookActor(): WoztellWebhookActor;
function requireWoztellWebhook(actor: unknown): asserts actor is WoztellWebhookActor;

export type DeliveryStatusEvent = Readonly<{
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  errorCode: string | null;
  occurredAt: Date;
}>;

export type OutboundEchoEvent = Readonly<{
  recipient: string;              // normalised E.164
  text: string;
  providerMessageId: string;
  origin: "BOT" | "MANUAL" | "RELAY";
  sentAt: Date;
}>;

export function createWoztellInboundEventsRepository(now?: () => Date): {
  // `target` exists so C2 Task 10 can extend the miss case to campaign_recipients
  // without changing this signature again. C1 only ever returns "message" | null.
  recordDeliveryStatus(actor: WoztellWebhookActor, event: DeliveryStatusEvent): Promise<Readonly<{matched: boolean; target: "message" | null}>>;
  recordOutboundEcho(actor: WoztellWebhookActor, event: OutboundEchoEvent): Promise<Readonly<{disposition: "adopted" | "inserted" | "duplicate"}>>;
};
```

`requireWoztellWebhook(actor)` is the first statement of both methods, before any parse and before `loadDatabase`.

`recordDeliveryStatus` — one statement, no transaction, no throw on a miss:

```sql
UPDATE messages
SET delivery_status = $status::message_delivery_status,
    error_code = CASE WHEN $status = 'failed' THEN $errorCode ELSE error_code END,
    delivered_at = CASE WHEN $status IN ('delivered','read') THEN COALESCE(delivered_at, $occurredAt) ELSE delivered_at END,
    read_at = CASE WHEN $status = 'read' THEN COALESCE(read_at, $occurredAt) ELSE read_at END
WHERE provider_message_id = $providerMessageId
  AND direction = 'outbound'
  -- Never walk a tick backwards: a late 'sent' must not undo a 'read'.
  AND array_position(ARRAY['queued','sent','delivered','read','failed'], delivery_status::text)
      < array_position(ARRAY['queued','sent','delivered','read','failed'], $status)
RETURNING id
```

A miss returns `{matched: false, target: null}` and the processor reports it — it is the expected result for any message sent before this release, and for every concierge reply until Task 10. **C2 Task 10 extends the miss case**: a campaign send writes its provider id to `campaign_recipients.provider_message_id` and creates no `messages` row at all, so without a second statement keyed on that column the per-campaign report's `delivered` and `read` counters are permanently zero. That statement is C2's to add, here, in this method — not a second delivery-status path.

`recordOutboundEcho` — a transaction under `pg_advisory_xact_lock(hashtextextended($providerMessageId, 0))`:

1. **Resolve the conversation first.** `SELECT id FROM conversations WHERE ownerSql(recipient) AND channel = 'whatsapp' AND status = 'active' ORDER BY last_message_at DESC LIMIT 1`. If there is none, return `{disposition: "duplicate"}` and write nothing — an echo is not a reason to open a thread. Steps 2 and 3 both need this id, so it is resolved once, at the top.

2. **Adopt**, bounded to *that* conversation:

```sql
UPDATE messages SET provider_message_id = $providerMessageId, delivery_status = 'sent'
WHERE id = (
  SELECT m.id FROM messages m
  WHERE m.conversation_id = $conversationId      -- ← the binding predicate
    AND m.direction = 'outbound'
    AND m.delivery_status = 'queued'
    AND m.provider_message_id IS NULL
    AND m.content = $text
  ORDER BY m.created_at DESC LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING id
```

  → `{disposition: "adopted"}`. **Why content equality:** the echo cannot carry our `outbound_key`, and without adoption a race in which Woztell's echo webhook beats our own send's HTTP response leaves two rows for one message.

  **Why `m.conversation_id = $conversationId` is load-bearing and not decoration.** An inbox runs on canned replies. Two staff replying "Thanks — someone will come back to you shortly." to two different prospects produce two queued rows with byte-identical `content`. A `JOIN conversations c ON … WHERE c.channel = 'whatsapp'` bounds the match to *a* conversation, not *the* conversation, so prospect A's echo adopts prospect B's row: B's row takes A's `provider_message_id` and flips to `sent` though B's send may not have happened; B's own `settleStaffMessage` then no-ops or hits 23505 and is swallowed as "sent"; and every later delivery/read tick for A's message lands on B's thread. That is delivery state leaking between two contacts, and a message marked delivered to someone who never received it.

3. Otherwise **insert** the echo as an outbound row on `$conversationId`, with `direction='outbound'`, `delivery_status='sent'`, `metadata` carrying `{echoOrigin: $origin}`, `ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING` → `{disposition: "inserted"}` or, if nothing came back, `{disposition: "duplicate"}`. **The role and the audit row depend on `origin`, which Task 2 Step 4 went to the trouble of normalising and which must not be discarded here:**

| `origin` | `role` | `sent_by_profile_id` | `audit_events` |
|---|---|---|---|
| `BOT` | `assistant` | `NULL` | none — the concierge's own send is accounted for by its `agent_run` |
| `MANUAL` | `staff` | `NULL` | `conversation.reply.external`, metadata `{origin, providerMessageId}` |
| `RELAY` | `staff` | `NULL` | `conversation.reply.external`, metadata `{origin, providerMessageId}` |

  `MANUAL` is a human staff member replying from the Woztell console or the WhatsApp Business app — the expected path during C-9 bring-up and any time the inbox is down. Storing all three as `role='assistant'` with no audit row would put that reply in the transcript under `Admin.inbox.roles.assistant` ("Concierge" / 「禮賓助理」), attributed to a bot that did not send it, with **no audit row anywhere** — falsifying S-7 and the §6 line "every send audited" for exactly the origin we normalised. It is also the same defect class Task 6 Step 1 calls "the assertion that earns its keep" (a staff reply rendering as `roles.user`), caught for one path and shipped for another. The audit row's `actor_type` is `'woztell-webhook'` and its `actor_user_id` is NULL: we know a person sent it, and we cannot know which one.

- [ ] **Step 5: The pre-existing outbound writer must name `direction` too.** `appendMessageFrom` (`lib/db/repos/conversations.ts:189-222`) inserts `(conversation_id, role, channel, content, provider_message_id, metadata, citations)` — **no `direction`** — and `startAgentTurn` routes through it. Add the column, deriving it from the role through the Task 1 twin rather than re-implementing the rule.

  One mechanical obstacle to clear first: the twin lives under `tests/fixtures/`, which production code may not import. So **move the derivation into `lib/db/message-direction.ts`** (three lines, pure, no `server-only`), have `tests/fixtures/message-direction.ts` re-export it unchanged so Task 1's contract test is untouched, and import it here and in `lib/db/repos/inbox.ts`. Task 1 Step 6's comment — "`lib/db/repos/inbox.ts` and `appendMessageFrom` must call this helper rather than re-deriving" — is what this step discharges; without the move that sentence is unimplementable.

  **Why this is not a tidy-up.** From the moment 0031 lands, `direction` defaults to `'inbound'` (S-4), so every concierge assistant reply and every web-widget assistant message is stored `direction='inbound'`. Four things then break at once, all silently, none of them a type error:
  - `recordDeliveryStatus` requires `direction = 'outbound'` and matches zero rows, so no bot reply ever gets a tick;
  - Task 10's `stampConciergeDelivery` selects `direction='outbound' AND delivery_status IS NULL` and returns `{stamped:false}` forever — the exact failure Task 10 exists to prevent;
  - `recordOutboundEcho` fails to adopt and **inserts** a second row for every bot reply that echoes back, doubling the transcript;
  - Task 8's thread UI aligns by `message.direction`, so the concierge renders on the prospect's side of the thread.

  All four present at C-9 as "the ticks do not arrive", which O-1 has already pre-diagnosed as a normaliser problem — sending the owner to the wrong file. `tests/unit/message-direction-writers.test.ts` (Step 1) is what stops the fifth writer repeating it.

- [ ] **Step 6: Run** `npx vitest run tests/unit/woztell-inbound-events.test.ts tests/unit/woztell-claim-v2.test.ts tests/unit/message-direction-writers.test.ts tests/unit/woztell-opted-out-profile.test.ts tests/unit/repository-production-security.test.ts tests/unit/repository-exists-scope-sql.test.ts tests/unit/repository-boundary.test.ts --reporter=dot && npm run typecheck`. **Do not** use Drizzle's `exists()` helper anywhere in this task: it is literally ``sql`exists ${subquery}` `` and only parenthesises a `Subquery` object, so a raw `sql` fragment renders `... and exists SELECT 1 FROM …` — a syntax error that every text-level assertion in this repo renders as happily as the working form, and that broke every member-scoped repository for months. Hand-write `EXISTS ( … )` with your own parentheses, the way `claimInbound` already does, and add the new predicates to `tests/unit/repository-exists-scope-sql.test.ts`'s proxy-driver list. (C2 Task 3 adds cases to that same file; whoever lands second **merges** rather than replaces.)

- [ ] **Step 7: Commit** — `git commit -m "feat(db): claim inbound WhatsApp with channel, handling and window state; record delivery statuses and outbound echoes (C-1)"`.

---

### Task 4: Webhook v2 — three event kinds and the human lane (C-1)

**Files:** `lib/ai/woztell-webhook.ts` (M), `lib/ai/woztell-production.ts` (M), `lib/api/woztell-webhook-route.ts` (M). Tests: `tests/unit/woztell-webhook-v2.test.ts` (C), plus updates to whichever existing woztell tests assert the exact `{status:"ignored"}` object.

- [ ] **Step 1: Failing test** — `tests/unit/woztell-webhook-v2.test.ts`, built on the existing processor-dependency fakes:
  - a delivery-status payload calls `recordDeliveryStatus` and never `claimInbound`, `resolveProfile` or `concierge.startTurn` — the assertion that matters, because a status event has no sender text and must not reach `normalizeWhatsAppNumber`;
  - an echo payload calls `recordOutboundEcho` and never the concierge;
  - an inbound payload on a conversation whose `handling === 'human'` persists the message, calls `notifyAssignee`, calls `markCompleted`, and returns `{status:"human_handled"}` **without** `recoverRun`, `markRunOwned` or `startTurn`;
  - an unrecognised payload returns `{status:"ignored", reason:"unsupported_event"}` and a sender that will not normalise returns `{status:"ignored", reason:"unnormalizable_sender"}`;
  - a STOP from a prospect with no profile still calls `recordOptOut`;
  - an inbound on a `handling === 'human'` thread from a member whose `whatsapp_opt_in` is **false** still calls `notifyAssignee` — the branch order in Step 5 is what makes this pass, and without it the inbox goes quiet for a reason nobody can see.
  - The **route** answers 202 for every one of these, so assert on the **processor result**, never on the HTTP status. That is the whole point: an event kind C-1 gets subtly wrong is indistinguishable from success at the provider today, and there is no counter, no log line and no dead-letter table anywhere in this subsystem.

  > **Observability, for free, and worth saying out loud.** `lib/api/woztell-webhook-route.ts:47` already returns `Response.json(result, {status: 202})` — the processor result **is** the response body. So the moment Step 3 widens the result union with `reason` and `matched` discriminators, every outcome becomes readable in Woztell's own webhook delivery log, with no PII (the discriminators carry no sender, no text, no provider body) and without adding a log line that `tests/unit/woztell-adapter.test.ts`'s "consoleError is never called" assertion would forbid. No test pins the 202 body today, so widening it breaks nothing. Say this in the commit body: it is the difference between C-9 reading a classification and C-9 guessing.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `WoztellProcessResult`** gains:

```ts
  | Readonly<{status: "ignored"; reason: "unsupported_event" | "unnormalizable_sender"}>
  | Readonly<{status: "delivery_recorded"; matched: boolean}>
  | Readonly<{status: "echo_recorded"; disposition: "adopted" | "inserted" | "duplicate"}>
  | Readonly<{status: "human_handled"}>
```

The bare `{status: "ignored"}` arm is replaced by the one carrying `reason`. Update any existing assertion that uses `toEqual({status:"ignored"})`; leave `toMatchObject` ones alone. Say why in the test: an unrecognised event is invisible today, and a classification is the only observability that can be added here — this layer deliberately logs nothing, because provider bodies carry credentials and PII and `tests/unit/woztell-adapter.test.ts` asserts `consoleError` is never called.

- [ ] **Step 4: Dependencies** — `WoztellWebhookProcessorDependencies` gains:

```ts
  recordDeliveryStatus?: (event: DeliveryStatusEvent) => Promise<Readonly<{matched: boolean}>>;
  recordOutboundEcho?: (event: OutboundEchoEvent) => Promise<Readonly<{disposition: "adopted" | "inserted" | "duplicate"}>>;
  notifyAssignee?: (input: Readonly<{conversationId: string; assignedToProfileId: string | null; locale: "en" | "zh-HK"}>) => Promise<void>;
  recordContact?: (input: Readonly<{phoneE164: string; locale: "en" | "zh-HK"; receivedAt: Date; whatsappMemberId: string | null}>) => Promise<{id: string}>;
```

These are optional to keep the existing fixtures green — which is exactly how `recordContact` was added, and exactly the trap: an optional dependency that production wiring forgets is a silent no-op that no test notices. Guard against it with a wiring test, `tests/unit/woztell-production-wiring.test.ts`, asserting that `createProductionWoztellProcessorDependencies` returns an object with each of these keys defined. That test is the only thing standing between a forgotten `...` spread and a dropped delivery tick.

`recordContact` now **returns the contact id**, which `claimInbound` needs for `contacts.contact_id`.

- [ ] **Step 5: `process()` branches** — immediately after `const normalized = dependencies.channel.normalizeInbound(payload);`, before `normalizeWhatsAppNumber(normalized.sender)`:

```ts
if (normalized.kind === "unsupported") return {status: "ignored", reason: "unsupported_event"};
if (normalized.kind === "delivery_status") {
  const result = await dependencies.recordDeliveryStatus?.(normalized) ?? {matched: false};
  return {status: "delivery_recorded", matched: result.matched};
}
if (normalized.kind === "outbound_echo") {
  const recipient = normalizeWhatsAppNumber(normalized.recipient);
  if (!recipient) return {status: "ignored", reason: "unnormalizable_sender"};
  const result = await dependencies.recordOutboundEcho?.({...normalized, recipient}) ?? {disposition: "duplicate" as const};
  return {status: "echo_recorded", disposition: result.disposition};
}
```

Then, after `claimInbound` returns `accepted`, **reorder the three post-claim branches**. Today the order is `!claim.whatsappOptIn` → `intent === "opt_out"` → bot (`lib/ai/woztell-webhook.ts:233-244`). The new order is:

```ts
// 1. STOP first, always, whatever the handling state and whatever the flag says.
if (normalized.intent === "opt_out") { …existing body… return {status: "opted_out"}; }

// 2. The human lane. BEFORE the opt-in gate, because persisting and notifying
//    is not sending. An opted-out member writing into a staff-owned thread has
//    their message stored by claimInbound either way; under the old order the
//    `!whatsappOptIn` return fired first and staff were simply never told the
//    member had replied — the one case where the inbox goes quiet for a reason
//    nobody can see from the inside. Nothing is sent here, so the flag has no
//    say; whether staff may *reply* is decided later, by messageEligibility.
if (claim.handling === "human") {
  // The message is already persisted by claimInbound. A person owns this
  // thread, so the concierge must not answer it — the interlock is read from
  // the row claimInbound locked, not checked separately in the action, or the
  // bot answers a message a person is already answering.
  await dependencies.notifyAssignee?.({conversationId: claim.conversationId, assignedToProfileId: claim.assignedToProfileId, locale: claim.locale});
  await dependencies.markCompleted?.(normalized.providerMessageId);
  return {status: "human_handled"};
}

// 3. The opt-in gate, unchanged, now guarding only the BOT lane it was written for.
if (!claim.whatsappOptIn) { await dependencies.markCompleted?.(…); return {status: "opted_out"}; }
```

(`claim` gains `assignedToProfileId` alongside `handling`.) Add a test for each of the three orderings; the STOP-from-an-already-opted-out-member case is the one the old order also got wrong.

- [ ] **Step 6: Production wiring** (`lib/ai/woztell-production.ts`) — spread `...createWoztellInboundEventsRepository(now)` into the dependency bag, thread `whatsappMemberId` through `recordContact` and return the contact id, and implement `notifyAssignee`.

  **`notifyAssignee` is a direct `staff_tasks` INSERT (S-13), not `agentToolsRepository.createStaffTask`.** That call is unbuildable four ways over — `requireConciergeAgent` with no agent run to build an actor from, a closed `z.enum` of five `concierge_*` kinds, `INVALID_AGENT_STAFF_TASK_PROFILE` for any prospect, and a `dedupeKey` the repository derives rather than accepts — and the generic `staffTasksRepository.createOnce` throws `AUTOMATION_STAFF_TASK_PROFILE_REQUIRED` for a null profile, which is the prospect case. Read S-13 before writing this. So `createWoztellInboundEventsRepository` gains a third method:

```ts
  notifyHumanLane(actor: WoztellWebhookActor, input: Readonly<{
    conversationId: string;
    assignedToProfileId: string | null;
    locale: "en" | "zh-HK";
  }>): Promise<Readonly<{disposition: "created" | "existing"}>>;
```

  implemented as the shape `lib/db/repos/campaign-recipient-delivery.ts:255` uses:

```sql
-- Both statements, one transaction. See the correction in S-13: without the
-- retire, the first resolve consumes the key for the life of the thread.
UPDATE staff_tasks SET dedupe_key = dedupe_key || ':closed:' || id::text, updated_at = now()
WHERE dedupe_key = ${`inbox-waiting:${conversationId}`} AND status = 'resolved';

INSERT INTO staff_tasks (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
VALUES ($assignedToProfileId, NULL, 'inbox_human_reply_waiting',
        ${`inbox-waiting:${conversationId}`}, 'human_requested',
        ${JSON.stringify({conversationId, locale})}::jsonb)
ON CONFLICT DO NOTHING
RETURNING id
```

  `profile_id` is nullable and `kind` is free `text`; `staff_tasks_dedupe_key_unique` makes a burst of inbound messages one OPEN task, and the retire statement is what lets the next burst raise a new one after the assignee has resolved the last — the unique index is not partial on `status`, so `ON CONFLICT DO NOTHING` on its own would go quiet for ever. `components/admin/task-table.tsx:19` renders `task.kind` raw, so no label map and no bundle string is needed — assert that in the test rather than leaving a reader to wonder.

  **The `whatsapp_member_id` write is guarded and isolated (see the corrections table).** `upsertFromWhatsApp` conflicts on `phone_e164` only, while `contacts_whatsapp_member_unique` is a separate partial unique index, so writing a member id that already belongs to another row raises 23505 → Step 7's 500 → Woztell retries that sender's message forever. Therefore:
  - `contactsRepository.upsertFromWhatsApp` **stops carrying `whatsapp_member_id` in its INSERT and ON CONFLICT clause** (delete the column from both; the field stays on the input schema);
  - a second, separately guarded statement writes it, inside the same repository method and after the upsert:
    ```sql
    UPDATE contacts SET whatsapp_member_id = ${memberId}, updated_at = now()
    WHERE id = ${id} AND whatsapp_member_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM contacts other WHERE other.whatsapp_member_id = ${memberId})
    ```
  - that statement is wrapped in its own `try`/`catch` that swallows 23505 (the concurrent race the `NOT EXISTS` cannot close) and files an `inbox_member_id_conflict` staff task through `notifyHumanLane`'s shape, so it is never silent;
  - `conversations.whatsapp_member_id` (Task 3) carries **no** unique index and is written unconditionally — that is the copy C-1's "resolve by member id" will actually read.

  **Do not reorder the existing spreads.** `...store` then `...profileResolver` is load-bearing: `store.resolveProfile` filters `WHERE profiles.whatsapp_opt_in = true` and `profileResolver.resolveProfile` does not, the later spread wins, and reversing them turns an opted-out member into a stranger for whom a contact row is created and the concierge answers. Add a comment saying so and put the new spread **last**.

- [ ] **Step 7: Route** (`lib/api/woztell-webhook-route.ts`) — wrap `await dependencies.process(payload)` in a `try`/`catch` that returns `Response.json({error: "PROCESSING_FAILED"}, {status: 500})`. Comment: the STOP path writes two legs in two repositories and both are idempotent by design (Task 5), so a 500 that makes Woztell retry is strictly better than a 202 that drops a consent withdrawal on the floor.

- [ ] **Step 8: Run** `npx vitest run tests/unit/woztell-webhook-v2.test.ts tests/unit/woztell-production-wiring.test.ts tests/unit/woztell-concierge.test.ts tests/unit/woztell-terminal-outcome.test.ts tests/unit/woztell-contact-capture.test.ts tests/unit/woztell-opted-out-profile.test.ts tests/integration/woztell-delivery-outbox.test.ts tests/integration/woztell-network-uncertain.test.ts tests/integration/woztell-server-uncertain.test.ts --reporter=dot && npm run typecheck && npx eslint lib/ai lib/api lib/channels` → PASS.

- [ ] **Step 9: Commit** — `git commit -m "feat(ai): webhook handles delivery statuses, outbound echoes and human-handled threads (C-1)"`.

---

### Task 5: Contact consent is audited, and one place answers "may we send?" (D-7, §9, C-2)

**Files:** `lib/db/repos/contacts.ts` (M), `lib/db/repos/message-eligibility.ts` (C), `lib/db/repos/index.ts` (M). Tests: `tests/unit/contacts-consent-audit.test.ts` (C), `tests/unit/message-eligibility.test.ts` (C), and `tests/unit/contacts-repository.test.ts` (M).

Two live consent defects are closed here, both in code C1 touches anyway.

> **Ownership, so this is not written twice.** C1 owns `markWhatsAppOptedOut`'s guard, its `"revoked" | "already_revoked"` return and its `consent.whatsapp.revoked` audit row, and owns the `upsertFromInterestForm` opt-out-revival guard — because C1 also changes the STOP webhook leg that calls them, and because Task 4 Step 7 makes the route 500 on a throw, which makes retries **routine**: an unguarded `UPDATE` would write one audit row per retry of the same withdrawal. C2 Task 3 keeps only the `consent.whatsapp.granted` leg, which C1 does not write. The C2 plan's Task 3 Step 1 and Step 2 are correspondingly relabelled.

**(a) `markWhatsAppOptedOut` writes no audit row.** A repo-wide grep for `consent.whatsapp.revoked` returns exactly one hit, in `suppressionsRepository.optOutWhatsApp` — the *profile* leg. A prospect with no profile, which is the majority case for the funnel Phase C exists to serve, gets `whatsapp_opt_in = false` and no audit trail at all. Boundary 11 and spec §9 both require the row in the same transaction, and Phase C is where a PDPO reviewer asks for the evidence.

**(b) `upsertFromInterestForm` silently revives an opt-out.** Its merge is `whatsapp_opt_in = EXCLUDED.whatsapp_opt_in OR contacts.whatsapp_opt_in` and it never consults `whatsapp_opted_out_at` — so a later interest-form or guest-RSVP submission re-opts-in someone who sent STOP.

- [ ] **Step 1: Failing tests.** For (a): the fake database records the statements, and the test asserts a single `transaction` containing an `UPDATE contacts` and an `INSERT INTO audit_events` naming `consent.whatsapp.revoked` / `'contact'`, that a **second** call writes no second audit row, and that a contact who was already opted out produces no audit row. For (b): a table-driven case asserting the generated SQL contains `whatsapp_opted_out_at IS NOT NULL` in the opt-in merge, plus a behavioural case through the proxy driver.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `markWhatsAppOptedOut`** becomes:

```ts
    /**
     * D-7 / boundary 11. The audit row and the flag commit together or neither
     * does — copying suppressionsRepository.optOutWhatsApp, which is the only
     * consent writer in the tree that did this before Phase C.
     *
     * The UPDATE is guarded on `whatsapp_opt_in = true` so a webhook retry (the
     * route now 500s on a throw, so retries are expected) is a no-op rather than
     * a second audit row for the same withdrawal.
     */
    async markWhatsAppOptedOut(actor: unknown, phoneE164: string): Promise<"revoked" | "already_revoked"> {
      requireContactWriter(actor);
      const phone = z.string().regex(/^\+\d{8,15}$/).parse(phoneE164);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const row = rowsFrom(await transaction.execute(sql`
          UPDATE ${contacts}
          SET whatsapp_opt_in = false, whatsapp_opted_out_at = COALESCE(whatsapp_opted_out_at, now()), updated_at = now()
          WHERE ${contacts.phoneE164} = ${phone} AND ${contacts.whatsappOptIn} = true
          RETURNING ${contacts.id} AS id
        `))[0];
        if (!row) return "already_revoked";
        await transaction.execute(sql`
          INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (NULL, ${actor.kind}, 'consent.whatsapp.revoked', 'contact', ${String(row.id)}, ${JSON.stringify({source: actor.source, reasonCode: "whatsapp_stop"})}::jsonb)
        `);
        return "revoked";
      });
    },
```

Note the `COALESCE(whatsapp_opted_out_at, now())`: an inbound STOP from a contact whose flag is already false but whose timestamp is null still needs the timestamp — handle that with a second, unguarded `UPDATE … WHERE whatsapp_opted_out_at IS NULL` inside the same transaction, before the guarded one, and do not audit it.

- [ ] **Step 4: `upsertFromInterestForm` merge** — replace the opt-in line with:

```sql
          whatsapp_opt_in = CASE
            WHEN contacts.whatsapp_opted_out_at IS NOT NULL THEN false
            ELSE EXCLUDED.whatsapp_opt_in OR contacts.whatsapp_opt_in
          END,
```

with a comment recording that a prior withdrawal is only cleared by an explicit re-consent flow, which does not exist yet (**O-4**).

- [ ] **Step 5: `lib/db/repos/message-eligibility.ts`** (S-9). **C1 creates this file. C2 Task 3 modifies it** — read S-9's ownership paragraph before writing a line, because an earlier draft of the companion plan also said "create", and executing both literally overwrites this module and silently removes the consent gate from `sendInboxReply`.

Structure it so C2's addition is an append, not a rewrite: the query is private and shared, the public surface is one method per principal kind.

```ts
import "server-only";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth/authorize";
import {contacts, messageSuppressions, profiles} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

export type WhatsAppSendPurpose = "service" | "marketing";

export type EligibilityRecipient =
  | Readonly<{kind: "member"; profileId: string}>
  | Readonly<{kind: "contact"; contactId: string}>;

/**
 * The facts, from BOTH sides, in one shape. C2 Task 3 exports `factsFor` over
 * the same private loader and C2 Task 8's `classifyRecipient` consumes this
 * type — neither may re-declare it. Note that `whatsappOptedOutAt` and
 * `whatsappSuppressed` are kept SEPARATE: an explicit STOP and a marketing
 * suppression are different facts with different consequences for a `service`
 * send, and folding them here is what would make the inbox and the campaign
 * preview disagree about the same person.
 */
export type RecipientFacts = Readonly<{
  kind: "member" | "contact";
  id: string;
  displayName: string;
  email: string | null;
  whatsappNumber: string | null;
  locale: "en" | "zh-HK";
  membershipStatus: string | null;
  planCode: string | null;
  marketingConsent: boolean;
  whatsappOptIn: boolean;
  whatsappOptedOutAt: Date | null;
  emailSuppressed: boolean;
  whatsappSuppressed: boolean;      // a message_suppressions row, channel 'whatsapp'
}>;

export type WhatsAppEligibility =
  | Readonly<{status: "eligible"; phoneE164: string}>
  | Readonly<{status: "blocked"; reason: "no_number" | "not_opted_in" | "opted_out" | "suppressed"}>;

const eligibilityInputSchema = z.object({
  profileId: z.string().min(1).max(255).nullable(),
  contactId: z.string().uuid().nullable(),
  phoneE164: z.string().regex(/^\+\d{8,15}$/).nullable(),
  purpose: z.enum(["service", "marketing"]),
}).strict();

/** PRIVATE. The one query. C2 Task 3's `factsFor` calls this, not a second one. */
async function loadRecipientFacts(database: AutomationDatabase, recipient: EligibilityRecipient): Promise<RecipientFacts | null>;

export function createMessageEligibilityRepository(loadDatabase?: AutomationDatabaseLoader): {
  whatsAppEligibility(actor: Actor, input: unknown): Promise<WhatsAppEligibility>;
  // C2 Task 3 appends: factsFor(actor: NotificationActor | AutomationRepositoryActor, recipient)
};
```

`requireAdmin(actor)` first, then `eligibilityInputSchema.parse(input)`, and only then the database — `tests/unit/automation-repository-authorization.test.ts` is the shape: the suite asserts `loadDatabase` was never called for a refused actor, so authorize and parse before loading.

Precedence, and it is not negotiable. **Note rule 3 in particular: it is purpose-scoped, and the version without a purpose branch cannot pass the §6 gate.**

| # | Condition | `service` | `marketing` |
|---|---|---|---|
| 1 | explicit withdrawal: `profiles.whatsapp_opt_in = false` **or** `contacts.whatsapp_opted_out_at IS NOT NULL` | `blocked/opted_out` | `blocked/opted_out` |
| 2 | a `message_suppressions` row, `channel='whatsapp'` | *not blocked* | `blocked/suppressed` |
| 3 | no marketing opt-in on either side | *not blocked* | `blocked/not_opted_in` |
| 4 | no number on either side | `blocked/no_number` | `blocked/no_number` |
| 5 | otherwise | `eligible` | `eligible` |

Rule 2's asymmetry is the familiar one: a `service` reply inside the window is a direct answer to a message the recipient just sent, and a *marketing* suppression does not gag us from answering it.

**Rule 3 has the same asymmetry and for a stronger reason, so write the comment.** `contacts.whatsapp_opt_in` is `boolean(...).default(false).notNull()` (`lib/db/schema-core.ts:1123`) and `upsertFromWhatsApp` never sets it — its own comment at `lib/db/repos/contacts.ts:96` reads "Unknown WhatsApp sender: stored to reply (D-6); marketing opt-in stays false". So **every prospect who messages the WTIA number is `whatsapp_opt_in = false` forever**, and `profiles.whatsapp_opt_in` is also `.default(false)`. A rule 3 with no purpose branch therefore returns `NOT_OPTED_IN` for `sendInboxReply(kind:"session")` to any prospect, the thread renders "This person has not opted in to WhatsApp.", and the §6 gate — "a prospect messages the WTIA number, the concierge answers, staff take over in the inbox and reply inside the window" — **cannot pass for any prospect, ever**. Marketing opt-in is not the gate on a customer-service-window reply; the window is, and the window is enforced twice (Task 7's `replyWindow`, and the adapter's own `CUSTOMER_SERVICE_WINDOW_MS`).

Test rule 3 both ways explicitly: a `whatsapp_opt_in = false` prospect with an open window is `eligible` for `service` and `blocked/not_opted_in` for `marketing`.

Rule 5 returns the number with `contacts.phone_e164` preferred over `profiles.whatsapp_number` when both exist — the contact number is the one the message actually arrived from.

**Reading only one of the two tables is the single worst failure mode available here** — `message_suppressions.profile_id` is NOT NULL so a contact can never be suppressed there, and `campaignAudience`'s existing `suppressed` flag reads `email_log.status='suppressed'`, a value no code in this repo ever writes. Do not reuse either.

Export `messageEligibilityRepository` and add it to **both** hand-written lists in `lib/db/repos/index.ts` — the re-export block at the top (lines 3-21) and the `repositories` object (lines 40-57). No test forces the two to agree, which is exactly why the plan names both.

- [ ] **Step 6: Run** `npx vitest run tests/unit/contacts-consent-audit.test.ts tests/unit/message-eligibility.test.ts tests/unit/contacts-repository.test.ts tests/unit/repository-production-security.test.ts tests/unit/repository-boundary.test.ts --reporter=dot && npm run typecheck && npx eslint lib/db/repos` → PASS.

- [ ] **Step 7: Commit** — `git commit -m "fix(contacts): audit contact consent withdrawal and stop an interest form reviving it; add the two-sided WhatsApp eligibility read (D-7, C-2)"`.

---

### Task 6: The staff write path on `inboxRepository` (C-2)

**Files:** `lib/db/repos/inbox.ts` (M). Test: `tests/unit/inbox-write-repository.test.ts` (C), `tests/unit/inbox-repository.test.ts` (M).

S-6: these methods live here, not on `conversationsRepository`. Every existing method there is gated by a `ConversationOwner`, so routing a staff reply through it would mean an admin constructing a member's owner value — the forgeable-principal shape the boundary tests exist to prevent.

- [ ] **Step 1: Failing test** — same harness as `tests/unit/inbox-repository.test.ts` (a `{execute, transaction}` fake, a `staff` actor and a `member` actor). Assert:
  - every new method rejects the member actor **before** `execute` is called;
  - `queueStaffMessage` runs one `transaction` containing an `INSERT INTO messages` with `direction='outbound'`, `role='staff'`, `delivery_status='queued'`, `sent_by_profile_id = actor.profileId`, and an `INSERT INTO audit_events` naming `conversation.reply.queued` — the two in the same transaction;
  - calling it twice with the same `outboundKey` **while the first claim is live** returns `disposition:"already_queued"` the second time and inserts one audit row, not two;
  - calling it again after the claim has **expired** returns `disposition:"queued"` and still inserts no second audit row — the send is retryable, the commitment was already recorded (S-8);
  - when the existing row is already `sent`, it returns `disposition:"already_sent"`;
  - a settled `failed` row with **no** `provider_message_id` is re-taken — `disposition:"queued"`, still no second audit row — while a `failed` row carrying one stays `already_sent` (step 3's correction);
  - `settleStaffMessage({outcome:{status:"sent", providerId}})` flips `queued → sent` and stamps `provider_message_id`, and is a no-op when the row is no longer `queued`;
  - `setHandling` refuses a transition to `'human'` on a conversation whose `channel` is `'web'`;
  - `getTranscript` maps `role:'staff'` to `'staff'` — **not** to `'user'`.

That last one is the assertion that earns its keep. `getTranscript` currently ends with `row.role === "assistant" ? "assistant" : row.role === "tool" ? "tool" : "user"`, so the moment 0031 lands, every staff reply renders under `Admin.inbox.roles.user` — "Sender" in English, 「發送者」 in Chinese, i.e. attributed to the prospect — with no type error and no test failure.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Read-model widening** — `InboxConversationSummary` gains `handling: "bot" | "human" | "closed"`, `assignedToProfileId: string | null`, `assigneeLabel: string | null`, `contactId: string | null`, `lastInboundAt: Date | null`, `lastStaffReadAt: Date | null`, `unread: boolean` (`lastMessageAt > lastStaffReadAt`, or `lastStaffReadAt IS NULL`). `InboxMessage`'s `role` union gains `"staff"` and the record gains `direction: "inbound" | "outbound"`, `deliveryStatus: MessageDeliveryStatus | null`, `templateKey: string | null`, `errorCode: string | null`.

`listConversations` and `getTranscript` both stop deriving the channel from the newest message and read `c.channel` directly; the `latest` CTE loses its reason to exist and its `channel` projection goes with it. **Do both queries** — `getTranscript` does not share `listConversations`' CTE, and it derives the channel through its own correlated sub-query. Replace both role coercions with an exhaustive map over the four enum values, so a fifth value is a type error rather than a silent "user".

- [ ] **Step 4: New methods** — all take `Actor`, call `requireAdmin(actor)` first, parse with a `.strict()` schema second, and load the database third.

```ts
export type StaffOutboundKind = "session" | "template";

export type QueuedStaffMessage = Readonly<{
  messageId: string;
  conversationId: string;
  outboundKey: string;
  disposition: "queued" | "already_queued" | "already_sent";
  recipient: Readonly<{phoneE164: string | null; profileId: string | null; contactId: string | null; whatsappOptIn: boolean}>;
  lastInboundAt: Date | null;
}>;

const outboundKeySchema = z.string().regex(/^inbox:[0-9a-f-]{36}:[0-9a-f]{32}$/);

const queueStaffMessageSchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["session", "template"]),
  content: z.string().trim().min(1).max(4_096),
  templateKey: z.string().trim().min(1).max(120).nullable().default(null),
  templateVariables: z.record(z.string().max(1_000)).default({}),
  outboundKey: outboundKeySchema,
}).strict().refine((value) => value.kind === "session" || value.templateKey !== null, {message: "TEMPLATE_KEY_REQUIRED"});

const settleStaffMessageSchema = z.object({
  outboundKey: outboundKeySchema,
  outcome: z.discriminatedUnion("status", [
    z.object({status: z.literal("sent"), providerId: z.string().trim().min(1).max(255)}).strict(),
    z.object({status: z.literal("failed"), errorCode: z.string().trim().min(1).max(120)}).strict(),
  ]),
}).strict();

const setHandlingSchema = z.object({conversationId: z.string().uuid(), handling: z.enum(["bot", "human", "closed"])}).strict();
const assignSchema = z.object({conversationId: z.string().uuid(), assignedToProfileId: z.string().min(1).max(255).nullable()}).strict();

queueStaffMessage(actor: Actor, input: unknown): Promise<QueuedStaffMessage>
settleStaffMessage(actor: Actor, input: unknown): Promise<void>
setHandling(actor: Actor, input: unknown): Promise<InboxConversationSummary>
assign(actor: Actor, input: unknown): Promise<InboxConversationSummary>
markRead(actor: Actor, conversationId: string): Promise<void>
close(actor: Actor, conversationId: string): Promise<InboxConversationSummary>
```

`queueStaffMessage`, in one transaction. **`disposition` says whether this caller may call the adapter, and that is a lease, not a row count (S-8).**

1. `SELECT c.id, c.channel, c.handling, c.last_inbound_at, c.profile_id, c.contact_id, p.whatsapp_number, p.whatsapp_opt_in, ct.phone_e164, ct.whatsapp_opt_in … FOR UPDATE` — refuse `INVALID_INBOX_CHANNEL` unless `channel = 'whatsapp'`, and `INVALID_INBOX_HANDLING` unless `handling = 'human'`. Taking the thread over is a separate, audited act; you may not reply into a thread the concierge still owns.
2. `INSERT INTO messages (conversation_id, role, channel, direction, content, delivery_status, sent_by_profile_id, template_key, outbound_key, send_claim_expires_at, metadata, citations) VALUES (…, 'staff', 'whatsapp', 'outbound', …, 'queued', …, now() + INTERVAL '2 minutes', …) ON CONFLICT (outbound_key) WHERE outbound_key IS NOT NULL DO NOTHING RETURNING id`. The predicate repeats the partial index's, verbatim. A row back → `disposition:"queued"`; go to step 4.
3. Nothing came back, so another submit owns the row. In a **separate statement** — a conflicting `INSERT` can wait for another transaction, but every CTE in that statement still shares the original snapshot, and `appendMessageFrom` carries the same comment and the same two-statement shape — **try to take the send claim**:

```sql
UPDATE messages
SET delivery_status = 'queued', error_code = NULL, send_claim_expires_at = now() + INTERVAL '2 minutes'
WHERE outbound_key = $key
  AND (delivery_status = 'queued' OR (delivery_status = 'failed' AND provider_message_id IS NULL))
  AND (send_claim_expires_at IS NULL OR send_claim_expires_at <= now())
RETURNING id
```

   **Correction, from the Task 6 review:** this guard read `delivery_status = 'queued'` alone, which made the `settleStaffMessage` sentence below ("clearing the claim is what makes a `failed` row immediately re-sendable") false. Nothing moved a row back to `queued`, so a staff retry of a reply the adapter had refused — same deterministic key, so the `INSERT` does nothing — matched nothing here, fell through to the `SELECT` and came back `already_sent`, which the action layer short-circuits before the adapter: the member never got the reply and the inbox called it sent. The `failed` arm delivers the promise; `provider_message_id IS NULL` keeps it narrow, because `settleStaffMessage({status:"failed"})` never stamps an id while `recordDeliveryStatus` only ever matches a row *by* one. So a send the provider never accepted is re-taken, and a provider-reported delivery failure stays settled — re-sending that one is an edit away, and a mis-mapped `failed` (O-1: the payload shape is still a guess) cannot become a silent second send.

   - a row back → `disposition:"queued"`: this caller inherits an abandoned send (the previous attempt crashed between the adapter and the settle) or re-queues a refused one. It may call the adapter.
   - nothing back → re-`SELECT` the row. `delivery_status <> 'queued'` → `already_sent`. Otherwise → `already_queued`: another submit holds a **live** claim.
   - **Write no audit row in this step, on any branch.** The commitment was recorded when the row was inserted.

   Without this, `already_queued` is a row-level fact with no send-level meaning, and the naive action calls the adapter anyway: one `messages` row, one `conversation.reply.queued` audit row, **two WhatsApp messages to the member** on any double-click. S-8 is titled "idempotency" and would otherwise deliver row-idempotency while naming send-idempotency.
4. On a genuine insert, `INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'conversation.reply.queued', 'conversation', ${conversationId}, …)` with metadata `{messageId, outboundKey, kind, templateKey}` — S-7: the commitment to send and its audit row commit together or neither does.

`settleStaffMessage`: one guarded `UPDATE … SET delivery_status = 'sent', provider_message_id = $providerId, send_claim_expires_at = NULL` / `= 'failed', error_code = $errorCode, send_claim_expires_at = NULL` `WHERE outbound_key = $key AND delivery_status = 'queued'`. Clearing the claim is half of what makes a `failed` row immediately re-sendable; the step-3 `UPDATE` above is the other half, and neither works alone. It must **not** stamp a `provider_message_id` on the failed arm — that column is what tells a send the provider never took from a delivery the provider reported. Catch a Postgres `23505` on `messages_provider_message_id_unique` — the echo adopted the row first — and fall back to `UPDATE … SET delivery_status = 'sent', send_claim_expires_at = NULL WHERE outbound_key = $key AND delivery_status = 'queued'`, leaving the provider id where the echo put it. No throw either way: the message went out; only the bookkeeping raced.

`setHandling`, `assign` and `close` each write their audit row (`conversation.handling.changed`, `conversation.assigned`, `conversation.closed`) inside the same transaction as the `UPDATE`. `markRead` writes `last_staff_read_at = now()` and **no** audit row — reading is not a mutation that matters, and auditing it would bury the ones that do.

- [ ] **Step 5: Run** `npx vitest run tests/unit/inbox-write-repository.test.ts tests/unit/inbox-repository.test.ts tests/unit/repository-boundary.test.ts tests/unit/repository-production-security.test.ts --reporter=dot && npm run typecheck && npx eslint lib/db/repos/inbox.ts` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(db): audited write-ahead staff replies, handling and assignment on the inbox repository (C-2)"`.

---

### Task 7: Inbox action core and `"use server"` wrappers (C-2)

**Files:** `lib/admin/inbox.ts` (M), `lib/admin/inbox-action-core.ts` (C), `lib/admin/inbox-actions.ts` (C, `"use server"`), `lib/ai/woztell-credentials.ts` (C), `lib/api/woztell-webhook-route.ts` (M), `tests/unit/admin-server-action-boundaries.test.ts` (M). Test: `tests/unit/inbox-action-core.test.ts` (C).

> **Two boundary-test mechanics that will bite you if nobody says them.** `tests/unit/server-action-actor-boundary.test.ts:19` flags a parameter by **name** as well as by type — `actorParameterNames = new Set(["actor", "_actor", "adminActor", "sessionActor"])` — so no wrapper in `inbox-actions.ts` may name any parameter `actor`, whatever its type. And its `nonAsyncFunctionExports` check (line 473) rejects every non-async runtime export, so `InboxReplyState`'s error-code list, `CUSTOMER_SERVICE_WINDOW_MS` and any other constant must stay `type`-only in that module or live in the sibling `*-core.ts`.

Copy `lib/admin/profile-review-core.ts` + `lib/admin/profile-review-actions.ts`, **not** `lib/admin/task-actions.ts`: the latter hand-writes four literal `revalidatePath` calls, resolves its actor through a dynamic `await import`, and is absent from `tests/unit/admin-server-action-boundaries.test.ts` — it does not map an authorization denial to `notFound()`, so it leaks the existence of the admin surface through an error where every other admin mutation 404s. That test's list is **hand-maintained**, so omitting the new module will not fail CI; add `["inbox", "lib/admin/inbox-actions.ts"]` to it in this task or the guard silently does not cover the one action module that sends messages to members.

- [ ] **Step 1: Failing test** — `tests/unit/inbox-action-core.test.ts` over `sendInboxReply(actor, input, deps)` with fake `inbox`, `eligibility` and `channel` dependencies:
  - the eligibility read runs **before** `queueStaffMessage`, and a `blocked` result throws the reason code with no row written;
  - a session reply outside the window (`lastInboundAt` older than 24 h) is refused as `WINDOW_CLOSED` before the adapter is called, and the adapter's own `{status:"blocked", reason:"outside_customer_service_window"}` is mapped to the same code — both, because the countdown in the UI and the enforcement in the adapter must agree and neither may be the only check;
  - `disposition:"already_sent"` short-circuits: the adapter is **not** called;
  - `sendSessionMessage` is called with `lastCustomerMessageAt` taken from the **persisted** `conversations.last_inbound_at` the repository returned, not from a value the caller supplied;
  - `whatsappOptIn` is the real recipient flag, never a hard-coded `true`;
  - a thrown `WoztellDeliveryFailure` settles the row `failed` with `error.code` and rethrows;
  - the mock adapter path (`RUN_LIVE_WOZTELL` unset) settles `sent` with a `mock:` provider id — the whole flow is exercisable with no credentials (D-4).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `lib/admin/inbox-action-core.ts`** (plain `server-only`, actor-taking, never `"use server"`):

```ts
// IMPORTED, not retyped. Task 2 adds `export` to lib/channels/woztell.ts:22,
// which is the constant sendSessionMessage actually enforces against; retyping
// the literal here would make Task 8's "uses the same constant" test unwritable
// and would let the countdown and the adapter drift apart.
import {CUSTOMER_SERVICE_WINDOW_MS} from "@/lib/channels/woztell";
export {CUSTOMER_SERVICE_WINDOW_MS};

export type InboxReplyInput = Readonly<{
  conversationId: string;
  kind: StaffOutboundKind;
  content: string;
  templateKey: string | null;
  templateVariables: Readonly<Record<string, string>>;
}>;

export type InboxReplyResult = Readonly<{status: "sent" | "already_sent"; messageId: string}>;

export function outboundKeyFor(input: InboxReplyInput): string; // "inbox:<conversationId>:<sha256(kind|content|templateKey|sortedVariables).slice(0,32)>"

export async function sendInboxReply(actor: Actor, input: unknown, deps?: InboxReplyDependencies): Promise<InboxReplyResult>;
export async function setInboxHandling(actor: Actor, conversationId: unknown, handling: unknown): Promise<InboxConversationSummary>;
export async function assignInboxConversation(actor: Actor, conversationId: unknown, assignee: unknown): Promise<InboxConversationSummary>;
export async function markInboxRead(actor: Actor, conversationId: unknown): Promise<void>;
export async function closeInboxConversation(actor: Actor, conversationId: unknown): Promise<InboxConversationSummary>;
```

`sendInboxReply` order, and it is the order: `requireAdmin(actor)` → parse → `messageEligibilityRepository.whatsAppEligibility(actor, {…, purpose: input.kind === "session" ? "service" : "marketing"})` → window check for `session` → **template-approval check for `template`** → `inboxRepository.queueStaffMessage` → **short-circuit on `already_sent` *and* on `already_queued`** → adapter → `inboxRepository.settleStaffMessage`.

Both short-circuits matter and they mean different things (S-8): `already_sent` returns `{status:"already_sent", messageId}`; `already_queued` means another submit holds a live send claim and returns the `SEND_IN_PROGRESS` code. Neither calls the adapter. Assert both in Step 1.

The adapter is constructed by the default `InboxReplyDependencies` factory and **must** pass `RUN_LIVE_WOZTELL: process.env.RUN_LIVE_WOZTELL` explicitly:

```ts
// Every construction site must pass this. lib/jobs/runners.ts:421-427 records
// the incident: an outbound path omitted it, so journey and dunning WhatsApp
// messages were recorded as delivered while nothing left the building, and a
// member in dunning never got the reminder the log says they did. Omitting it
// here fails as a clean success with a `mock:` provider id in the messages row,
// so nothing alerts.
createWoztellAdapter({...woztellCredentialsFrom(aiEnv()), RUN_LIVE_WOZTELL: process.env.RUN_LIVE_WOZTELL});
```

**`woztellCredentialsFrom` does not exist yet — this step creates it.** `lib/api/woztell-webhook-route.ts:69-80` hand-builds the three conditional spreads inline (`...(ai.woztellApiToken === undefined ? {} : {WOZTELL_API_TOKEN: ai.woztellApiToken})` and its two siblings), and `lib/jobs/runners.ts:411-427` does it a second time. Extract them into `lib/ai/woztell-credentials.ts` as `woztellCredentialsFrom(ai: AiEnv): Partial<WoztellEnvironment>` — **credentials only, never `RUN_LIVE_WOZTELL`**, which stays an explicit argument at every call site so it cannot be forgotten inside a helper — and switch the webhook route to it in this task, so there is exactly one construction site to audit before C-9. Do not switch `lib/jobs/runners.ts`: it carries the incident comment that must stay attached to that call, and C2 Task 10 adds a discovery test over every `createWoztellAdapter(` call site.

**Template validation, two checks, both server-side, both before the adapter.**
1. `Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, templateKey)` → else `INVALID`. `sendTemplateMessage` does a bare property lookup (`WHATSAPP_TEMPLATES[input.template].name`, `lib/channels/woztell.ts:261`) and an unknown key is a `TypeError` mid-send, not a typed delivery failure.
2. **`approvedTemplateKeys().has(templateKey)` → else `TEMPLATE_NOT_APPROVED`.** This is the producer of that error code, and without it the code ships into both bundles with no code path that raises it — a translated string that reads as handled in review and is not. Spec C-2's "template picker limited to `status='approved'`" would otherwise be enforced in a `<select>` only: a hand-posted `formData` with any config key reaches `sendTemplateMessage`, which is the unapproved-elementName → provider 4xx → permanent failure + staff task path O-7 warns about. Read the set through `lib/whatsapp/approved-templates.ts` (Task 8 Step 0), the same module the picker reads, so the control and the gate can never disagree.

- [ ] **Step 4: `lib/admin/inbox-actions.ts`** (`"use server"`) — exports only `(path, formData) => Promise<…>`, each resolving `requireAdminActor()` itself, each wrapped in `try { … } catch (error) { if (isAuthorizationDenial(error)) notFound(); throw error; }`, each calling `revalidateAdminPath(path)`:

```ts
export async function sendInboxReplyAction(path: string, state: InboxReplyState, formData: FormData): Promise<InboxReplyState>;
export async function setInboxHandlingAction(path: string, formData: FormData): Promise<void>;
export async function assignInboxConversationAction(path: string, formData: FormData): Promise<void>;
export async function markInboxReadAction(path: string, formData: FormData): Promise<void>;
export async function closeInboxConversationAction(path: string, formData: FormData): Promise<void>;
```

Every runtime export must be a provably-async function taking no `Actor`: `tests/unit/server-action-actor-boundary.test.ts` builds a `ts.Program` from `tsconfig.json`, resolves the `Actor` types and flags an actor-typed first parameter — through aliases, re-exports and default exports. `InboxReplyState` is `{status: "idle" | "sent" | "error"; code?: string; messageId?: string}`; error codes surfaced to the UI: `INVALID`, `FORBIDDEN`, `WINDOW_CLOSED`, `NOT_OPTED_IN`, `OPTED_OUT`, `SUPPRESSED`, `NO_NUMBER`, `INVALID_INBOX_CHANNEL`, `INVALID_INBOX_HANDLING`, `TEMPLATE_NOT_APPROVED`, `SEND_IN_PROGRESS`, `DELIVERY_FAILED`. **Every one of these must have a producer in `inbox-action-core.ts`** — write the list out in the test as `expect(new Set(producedCodes)).toEqual(new Set(INBOX_REPLY_ERROR_CODES))` over a `type`-only union, so a translated string with no code path that raises it fails the suite rather than passing review.

- [ ] **Step 5: `lib/admin/inbox.ts`** — re-export the read helpers unchanged and add nothing actor-taking that a `"use server"` module could re-export.

- [ ] **Step 6: Run** `npx vitest run tests/unit/inbox-action-core.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/locale-href-boundary.test.ts --reporter=dot && npm run typecheck && npx eslint lib/admin` → PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(admin): inbox reply, handling, assignment and close actions behind actor-resolving wrappers (C-2)"`.

---

### Task 8: The thread UI — direction, ticks, countdown, template picker, drafts (C-2)

**Files:** `lib/whatsapp/approved-templates.ts` (C), `lib/ai/woztell-production.ts` (M), `components/admin/inbox-thread.tsx` (M), `components/admin/inbox-composer.tsx` (C, `"use client"`), `components/admin/inbox-list.tsx` (M), `app/[locale]/(admin)/admin/inbox/[id]/page.tsx` (M), `app/[locale]/(admin)/admin/inbox/page.tsx` (M), `messages/en.json` + `messages/zh-HK.json` (M). Tests: `tests/unit/inbox-thread.test.tsx` (C), `tests/unit/inbox-window.test.ts` (C), `tests/unit/approved-templates.test.ts` (C).

Only the composer is `'use client'` — the repo has exactly 40 such files and treats the count as a budget. `InboxThread` stays a Server Component.

- [ ] **Step 0: The approved-key reader, because `approvedTemplateKeys()` as it stands cannot be imported and, if it could, would offer two useless templates.**

  In the tree, `lib/ai/woztell-production.ts:103` is `function approvedTemplateKeys(): ReadonlySet<"concierge_follow_up_en" | "concierge_follow_up_zh_hk">` — **no `export`**, a hard-coded two-element `allowed` array (:106-109), and exactly one caller (:141). So "the five keys from `config/whatsapp-templates.ts` filtered by `approvedTemplateKeys()`" is unbuildable as written, and the obvious repair — adding `export` — silently makes the picker offer at most the two concierge follow-ups. Never `renewal_14`, `dunning_3` or `event_reminder_24h`. The picker exists precisely for "the window has closed, send an approved template instead"; two follow-up nudges is not an answer to that. It is also in a server-only module that imports the concierge service, the OpenAI embedding adapter and the agent runtime (`woztell-production.ts:5-9`), so an admin page importing it drags the whole webhook wiring in.

  So create `lib/whatsapp/approved-templates.ts` — small, dependency-light, importable by a page:

```ts
import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";

/**
 * C1: the source of truth is the environment allowlist intersected with the
 * config's own key set. C-7 (C2 Task 2) swaps the SOURCE for the
 * whatsapp_templates registry and makes this async; it does not change the
 * CONTRACT, which is why the picker and the send gate both read it here.
 * `WoztellDeliveryDependencies.approvedTemplateKeys` is already declared
 * `ReadonlySet<WhatsAppTemplateKey>` (lib/ai/woztell-delivery.ts:29), so the
 * widened return type needs no change there.
 */
export function approvedTemplateKeys(environment: NodeJS.ProcessEnv = process.env): ReadonlySet<WhatsAppTemplateKey>;

/** The two concierge follow-ups, and ONLY those, for the fallback path in
 * lib/ai/woztell-delivery.ts:162. Keeping this separate is what lets the picker
 * widen to five without widening what the concierge may send unattended. */
export const CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS: ReadonlySet<WhatsAppTemplateKey>;
```

  `approvedTemplateKeys` behaviour, preserved exactly from today so every non-live test stays green: `environment.RUN_LIVE_WOZTELL !== "1"` → the **full config key set**; otherwise `WOZTELL_APPROVED_TEMPLATE_KEYS` split on `,`, trimmed, intersected with the config keys.

  In `lib/ai/woztell-production.ts`: delete the private function, import both from the new module, and pass `approvedTemplateKeys: intersect(approvedTemplateKeys(), CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS)` into the delivery dependency bag — so `lib/ai/woztell-delivery.ts:162`'s behaviour is **byte-for-byte unchanged** and `tests/unit/woztell-concierge.test.ts` needs no edit. The picker and Task 7's `TEMPLATE_NOT_APPROVED` gate read `approvedTemplateKeys()` unintersected.

  `tests/unit/approved-templates.test.ts` asserts: mock mode returns all five keys; live mode intersects; the concierge set is exactly the two follow-ups and is a subset of the config keys. **Also assert the call-site count** — `grep`-style over `lib/` and `app/` for `approvedTemplateKeys(` — so C2 Task 2, which makes this function `async`, cannot miss one. C2's file list for that step names `lib/ai/woztell-production.ts` and `lib/automation/journey-runner.ts`; this task adds two more (the thread page and `inbox-action-core.ts`), and a count assertion is what tells the C2 implementer that.

- [ ] **Step 1: Failing tests** — `tests/unit/inbox-window.test.ts` over a pure `replyWindow(lastInboundAt, now)` helper exported from `lib/admin/inbox-action-core.ts` returning `{state: "open" | "closed" | "never"; remainingMs: number}`, asserting it uses the **same** `CUSTOMER_SERVICE_WINDOW_MS` the adapter enforces against (import it, do not retype 24 hours) and that a `null` `lastInboundAt` is `never`, not `open`. `tests/unit/inbox-thread.test.tsx` renders a transcript with one inbound, one assistant and one staff message and asserts the staff row carries the `Admin.inbox.roles.staff` label — **not** `roles.user`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `InboxThread`** — `labels.roles` gains `staff`; each `<li>` gains a delivery indicator rendered only when `message.deliveryStatus !== null`, using `labels.delivery[status]` as text (a tick glyph alone is not accessible); a failed row shows `labels.delivery.failed` plus `message.errorCode` in a `<span className="text-destructive">`. Alignment by `message.direction`, not by role.

- [ ] **Step 4: `InboxComposer`** (`'use client'`) — `useActionState(sendInboxReplyAction.bind(null, path), {status: "idle"})`; a `<textarea>` whose value is mirrored into `sessionStorage` under `wtia:inbox-draft:<conversationId>` on change and restored on mount, cleared on `status === "sent"`; every read and write wrapped in `try`/`catch` (a private window or blocked site data throws on access, and the composer must still render); a `<select name="templateKey">` populated from a `templates` prop; a radio pair for `kind`; a countdown line driven by the `replyWindow` result passed from the server (`Admin.inbox.window.*`), with the send button disabled when `state === "closed"` and `kind === "session"`; the error code mapped through `Admin.inbox.errors.*`.

- [ ] **Step 5: Pages** — the thread page passes `transcript`, the `replyWindow` result, the template list (from `lib/whatsapp/approved-templates.ts`, Step 0 — **not** from `lib/ai/woztell-production.ts`, which would drag the concierge service and the agent runtime into an admin page; C-7 swaps the source for the registry and makes the call `await`, so leave the prop shape `{key, label}[]` and keep the call in one place per page), and forms for take-over / release / assign-to-me / close. The list page adds `handling`, `assignee` and `unread` columns and a `handling` filter alongside the existing channel filter. Both keep `requireAdminPageActor()` as the first statement and neither may contain the literal `requireAdminActor()` — `tests/unit/admin-page-auth-source.test.ts` discovers these files automatically and asserts the exact import line, the call, and the absence of the other.

- [ ] **Step 6: Bundles.** Rewrite `Admin.inbox.description` in **both** files — it currently promises staff, in two languages, that replying "arrives with the WhatsApp operations phase". Update the header comment in `lib/db/repos/inbox.ts` too ("Read-only in Phase A … the human reply lane is Phase C"); CLAUDE.md asks for that comment density to be maintained, so change the reason, do not delete it.

`messages/en.json` → `Admin.inbox`:

```json
"description": "Every concierge conversation on the web widget and WhatsApp. Take a thread over to reply yourself, and hand it back when you are done.",
"roles": {"user": "Sender", "assistant": "Concierge", "tool": "Tool", "staff": "WTIA staff"},
"columns": {"owner": "Who", "channel": "Channel", "last": "Last message", "when": "Updated", "messages": "Messages", "status": "Status", "handling": "Handled by", "assignee": "Assigned to", "unread": "Unread"},
"handling": {"bot": "Concierge", "human": "A person", "closed": "Closed", "filterAll": "All threads", "filterHuman": "Handled by a person", "filterBot": "Handled by the concierge"},
"actions": {"take": "Take this over", "release": "Hand back to the concierge", "close": "Close this thread", "assignToMe": "Assign to me", "unassign": "Unassign", "markRead": "Mark as read"},
"window": {"open": "{hours}h {minutes}m left to reply freely", "closed": "The 24-hour reply window has closed. Send an approved template instead.", "never": "This person has not messaged in yet, so there is no open window."},
"compose": {"legend": "Reply", "kindSession": "Free-text reply", "kindTemplate": "Approved template", "message": "Your reply", "placeholder": "Write your reply…", "template": "Template", "templateNone": "Choose a template", "send": "Send", "sending": "Sending…", "sent": "Sent.", "draftRestored": "Draft restored."},
"delivery": {"queued": "Sending", "sent": "Sent", "delivered": "Delivered", "read": "Read", "failed": "Not delivered"},
"errors": {"INVALID": "Check the message and the template.", "FORBIDDEN": "You do not have access to this thread.", "WINDOW_CLOSED": "The 24-hour window has closed. Send an approved template instead.", "NOT_OPTED_IN": "This person has not opted in to WhatsApp.", "OPTED_OUT": "This person asked us to stop messaging them.", "SUPPRESSED": "This person is suppressed for marketing on WhatsApp.", "NO_NUMBER": "We have no WhatsApp number for this person.", "INVALID_INBOX_CHANNEL": "This thread is not a WhatsApp thread.", "INVALID_INBOX_HANDLING": "Take the thread over before replying.", "TEMPLATE_NOT_APPROVED": "That template is not approved for sending.", "SEND_IN_PROGRESS": "This reply is already being sent. Give it a moment before trying again.", "DELIVERY_FAILED": "WhatsApp did not accept the message. Try again shortly."}
```

`messages/zh-HK.json` → `Admin.inbox`:

```json
"description": "網站聊天視窗及 WhatsApp 上的所有禮賓對話。接手對話即可親自回覆，完成後可交回禮賓助理。",
"roles": {"user": "發送者", "assistant": "禮賓助理", "tool": "工具", "staff": "WTIA 職員"},
"columns": {"owner": "對象", "channel": "渠道", "last": "最後訊息", "when": "更新時間", "messages": "訊息數", "status": "狀態", "handling": "處理方", "assignee": "負責人", "unread": "未讀"},
"handling": {"bot": "禮賓助理", "human": "由職員處理", "closed": "已結束", "filterAll": "所有對話", "filterHuman": "由職員處理", "filterBot": "由禮賓助理處理"},
"actions": {"take": "接手此對話", "release": "交回禮賓助理", "close": "結束此對話", "assignToMe": "指派給我", "unassign": "取消指派", "markRead": "標記為已讀"},
"window": {"open": "尚餘 {hours} 小時 {minutes} 分鐘可自由回覆", "closed": "24 小時回覆時限已過，請改用已批核範本。", "never": "對方尚未主動傳送訊息，因此沒有開啟中的回覆時限。"},
"compose": {"legend": "回覆", "kindSession": "自由文字回覆", "kindTemplate": "已批核範本", "message": "你的回覆", "placeholder": "輸入回覆內容…", "template": "範本", "templateNone": "選擇範本", "send": "發送", "sending": "發送中…", "sent": "已發送。", "draftRestored": "已回復草稿。"},
"delivery": {"queued": "發送中", "sent": "已發送", "delivered": "已送達", "read": "已讀", "failed": "未能送達"},
"errors": {"INVALID": "請檢查訊息內容及範本。", "FORBIDDEN": "你無權存取此對話。", "WINDOW_CLOSED": "24 小時時限已過，請改用已批核範本。", "NOT_OPTED_IN": "對方未同意接收 WhatsApp 訊息。", "OPTED_OUT": "對方已要求停止接收訊息。", "SUPPRESSED": "對方已停止接收 WhatsApp 推廣訊息。", "NO_NUMBER": "我們沒有對方的 WhatsApp 號碼。", "INVALID_INBOX_CHANNEL": "此對話並非 WhatsApp 對話。", "INVALID_INBOX_HANDLING": "請先接手此對話才可回覆。", "TEMPLATE_NOT_APPROVED": "該範本未獲批核發送。", "SEND_IN_PROGRESS": "此回覆正在發送中，請稍候再試。", "DELIVERY_FAILED": "WhatsApp 未接受此訊息，請稍後再試。"}
```

- [ ] **Step 7: Run** `npx vitest run tests/unit/inbox-thread.test.tsx tests/unit/inbox-window.test.ts tests/unit/admin-page-auth-source.test.ts tests/unit/admin-nav.test.tsx tests/unit/internal-navigation-config.test.ts tests/unit/locale-href-boundary.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint components/admin "app/[locale]/(admin)/admin/inbox"` → PASS. `internal-navigation-config` should be **untouched**: C1 adds no admin route, so its `toHaveLength(19)` and ordered id arrays still hold. If it goes red, you added a route this plan did not ask for.

- [ ] **Step 8: Commit** — `git commit -m "feat(admin): reply from the inbox with delivery ticks, a window countdown and per-thread drafts (C-2)"`.

---

### Task 9: Retention stops deleting human-handled threads (S-10)

**Files:** `lib/db/repos/conversations.ts` (M, `deleteExpired`), `lib/db/repos/chat-retention.ts` (M, `conciergeConversationPredicate`). Tests: `tests/unit/chat-retention-handling.test.ts` (C), plus the existing `chat-retention` and conversation-retention suites.

- [ ] **Step 1: Failing test** — drive both repositories through the pg-proxy driver used by `tests/unit/repository-exists-scope-sql.test.ts` and assert the generated SQL for all four statements (`deleteExpired`, `deleteMessagesBatch`, `clearRunSummariesBatch`, `removeEmptyConversationsBatch`) contains `handling` and `'bot'`. Add a behavioural case: a `handling='human'` conversation past `expires_at` is not among the deleted ids.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Edits.** In `deleteExpired`'s `candidates` CTE add `AND ${conversations.handling} = 'bot'`. In `chat-retention.ts` change the one helper:

```ts
function conciergeConversationPredicate(): SQL {
  // Phase C-2 narrowed this to bot-handled threads. A `messages` row used to be
  // a bot transcript artefact; once staff reply from /admin/inbox it is an
  // operational record with an audit_events row pointing at it, and this sweep
  // would delete a live staff↔member thread from the front on a rolling twelve
  // months — taking the delivery record, and the metadata.normalizedSender that
  // is the only cleartext copy of an anonymous sender's number, with it. The
  // retention rule for human-handled threads is a separate decision (O-5), not
  // an inheritance.
  return sql.raw('"conversation"."agent_kind" = \'concierge\' AND "conversation"."handling" = \'bot\'');
}
```

One helper, three call sites, one edit.

- [ ] **Step 4: Run** `npx vitest run tests/unit/chat-retention-handling.test.ts tests/unit/repository-exists-scope-sql.test.ts --reporter=dot && npx vitest run tests/unit --reporter=dot -t retention && npm run typecheck` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(retention): stop the twelve-month sweep and the expiry sweep deleting human-handled WhatsApp threads (C-2)"`.

---

### Task 10: The concierge's own reply carries a provider id (C-1)

**Files:** `lib/db/repos/woztell-delivery-stamp.ts` (C), `lib/ai/woztell-delivery.ts` (M, dependency type only), `lib/ai/woztell-production.ts` (M). Test: `tests/unit/woztell-delivery-stamp.test.ts` (C).

Without this, `recordDeliveryStatus` matches zero rows for every bot reply, the inbox shows no tick for the concierge, and C-9 reads "the ticks do not arrive" as a provider problem. S-5 keeps the jsonb outbox as the *reservation* — this is a **stamp applied after** the outbox has already decided, never a second decision.

- [ ] **Step 1: Failing test** — `stampConciergeDelivery` updates the newest `direction='outbound'` row in the conversation whose `delivery_status IS NULL`, setting `delivery_status='sent'` and `provider_message_id`; returns `{stamped: false}` and throws nothing when there is no such row (the concierge appends its assistant row on a different code path and may not have committed yet); is a no-op on a second call for the same provider id.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `lib/db/repos/woztell-delivery-stamp.ts`**

```ts
// S-14: a capability actor, like woztell-inbound-events.ts. Not the actorless
// shape of woztell.ts / woztell-delivery-outbox.ts, which are the two standing
// pre-§9 exceptions the companion plan says not to cite as precedent.
const woztellDeliveryCapability: unique symbol = Symbol("woztell-delivery-capability");
export type WoztellDeliveryActor = Readonly<{kind: "woztell-delivery"; userId: null; [woztellDeliveryCapability]: true}>;
export function woztellDeliveryActor(): WoztellDeliveryActor;

export function createWoztellDeliveryStampRepository(loadDatabase?: WoztellDeliveryDatabaseLoader): {
  stampConciergeDelivery(actor: WoztellDeliveryActor, input: Readonly<{
    inboundProviderMessageId: string;   // the row the outbox reserved against
    providerId: string;                 // the id the send API returned
  }>): Promise<Readonly<{stamped: boolean}>>;
};
```

Add its refusal case to `tests/unit/repository-production-security.test.ts` (a member, an admin and an anonymous actor, each refused before `loadDatabase`).

Resolve the conversation from the inbound row, then one guarded `UPDATE … WHERE id = (SELECT id FROM messages WHERE conversation_id = $c AND direction = 'outbound' AND delivery_status IS NULL AND provider_message_id IS NULL ORDER BY created_at DESC LIMIT 1)`. Swallow a `23505` on `messages_provider_message_id_unique` (the echo got there first) and return `{stamped: false}`.

- [ ] **Step 4: Wire it** — `WoztellDeliveryDependencies` gains an optional `stampOutbound?: (input) => Promise<{stamped: boolean}>`, called from `deliverWoztellReply` immediately after each `markDeliverySent?.(…)`, inside a `.catch(() => undefined)`. **The catch is deliberate and must carry its reason:** `markDeliverySent` is the ledger the four pinned integration tests exercise, and a stamp failure must never turn a delivered message into an escalation. Wire the repository into `lib/ai/woztell-production.ts` and add it to `tests/unit/woztell-production-wiring.test.ts`'s key list.

- [ ] **Step 5: Run** `npx vitest run tests/unit/woztell-delivery-stamp.test.ts tests/unit/woztell-production-wiring.test.ts tests/unit/woztell-delivery-outbox-state.test.ts tests/integration/woztell-delivery-outbox.test.ts tests/integration/woztell-network-uncertain.test.ts tests/integration/woztell-server-uncertain.test.ts --reporter=dot && npm run typecheck` → PASS. All four integration tests must still pass **unchanged**; if one needs editing you changed the outbox rather than stamping beside it.

- [ ] **Step 6: Commit** — `git commit -m "feat(ai): stamp the concierge's outbound row with its provider id so delivery statuses match (C-1)"`.

---

### Task 11: Woztell history backfill (C-3)

**Files:** `lib/config/env.ts` (M), `.env.example` (M), `lib/channels/woztell-open-api.ts` (C), `lib/api/woztell-backfill-route.ts` (C), `app/api/admin/woztell/backfill/route.ts` (C), `lib/db/repos/woztell.ts` (M, one new method), `config/wisetech-protected-route-inventory.ts` (M), `tests/unit/next-route-exports.test.ts` (M), `tests/unit/wisetech-protected-route-ownership.test.ts` (M). Test: `tests/unit/woztell-backfill.test.ts` (C).

Three things do not exist: the token, a GraphQL client, and a second provider host (`WOZTELL_SEND_RESPONSES_URL` is a hard-coded const). C-3 is more greenfield than its one-line description implies.

- [ ] **Step 1: Failing test** — `tests/unit/woztell-backfill.test.ts` with a fake `fetch` and a fake importer:
  - the route refuses without an admin actor and refuses with `503 BACKFILL_NOT_CONFIGURED` when `WOZTELL_OPEN_API_TOKEN` is blank;
  - the cursor loop stops at `hasNextPage: false`, stops at the page cap, and passes each page's `endCursor` to the next request;
  - each history entry is mapped into the **webhook envelope shape** and run through `channel.normalizeInbound`, so there is exactly one normaliser;
  - an entry that normalises to `unsupported` is counted and skipped, never thrown on;
  - **no send and no bot turn is ever started** — assert the concierge dependency is never called and the adapter's two send methods are never called. This is the assertion that matters: `claimInbound` is what starts a turn, and reaching it from a second boundary with no HMAC in front of it is how a backfill becomes a mass re-reply.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Env** — `AiEnv` gains `woztellOpenApiToken?: string`; `aiEnvironmentSchema` gains `WOZTELL_OPEN_API_TOKEN: z.string().optional()`; `parseAiEnvironment` returns it through the same conditional spread as its three siblings. `.env.example` gains `WOZTELL_OPEN_API_TOKEN=` under the WOZTELL block with a comment naming C-3. Do **not** add it to `serverKeys` — that would make it a hard production boot requirement, and boundary 7 exists because a transitive env pull once broke `/sitemap.xml`. `tests/unit/env-contract.test.ts` stays green: its `toEqual` fixtures never set the variable and the spread omits it.

- [ ] **Step 4: `lib/channels/woztell-open-api.ts`** — a small typed client, no library:

```ts
const WOZTELL_OPEN_API_URL = "https://open.api.woztell.com/v1/graphql"; // provisional — see O-2

export type ConversationHistoryPage = Readonly<{
  entries: readonly unknown[];        // raw provider entries; mapping is the caller's job
  endCursor: string | null;
  hasNextPage: boolean;
}>;

export function createWoztellOpenApiClient(options: Readonly<{token: string; channelId: string; fetchImpl?: typeof fetch}>): {
  conversationHistory(input: Readonly<{after: string | null; first: number}>): Promise<ConversationHistoryPage>;
};
```

Log nothing. `tests/unit/woztell-adapter.test.ts` asserts `consoleError` is never called against a body containing a recipient number and a bearer token, and the same rule applies here: classify, never echo the payload.

> ⚠️ **O-2 (open question).** The host, the GraphQL document and the entry shape are **unverified** — no credentials, no docs in the tree, and `WOZTELL_SEND_RESPONSES_URL` is the only provider host that exists. Keep every provider-shaped assumption inside this one file and the mapper beside it. The owner must confirm the endpoint and the `conversationHistory` selection set against Woztell's Open API documentation before this route is called against production.

- [ ] **Step 5: Importer** — add `importHistoricalInbound(actor: WoztellBackfillActor, input: WoztellInboundClaimInput): Promise<"imported" | "duplicate">` to `createPostgresWoztellStore`. It is `claimInbound` **minus the lease and the bot state**: same advisory lock, same conversation reuse, same `ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING`, but the inserted `metadata` is `{locale, normalizedSender, woztellState: "completed"}` so `decideWoztellClaimState` will report `duplicate` for it forever and **no bot turn can ever start from an imported row**. Comment says exactly that.

  **This method takes a capability actor even though its host module does not (S-14).** `createPostgresWoztellStore`'s other methods are the standing pre-§9 exception; adding a *new* writer to an actorless module, reachable from `/api/admin/woztell/backfill` — a second entry point with **no HMAC in front of it** — is exactly the scenario Task 3's actorless design would have created and S-14 exists to refuse. Mint `woztellBackfillActor()` as a **distinct** capability from `woztellWebhookActor()`, so the backfill cannot reach the webhook's writers and vice versa, and add its refusal case to `tests/unit/repository-production-security.test.ts`.

  **Resolve the contact before importing, or the backfill surfaces nothing.** Steps 4-6 as first drafted mapped provider entries → `normalizeInbound` → importer with no `recordContact` between, and `importHistoricalInbound` takes a `contactId` it would always receive as `null`. Every imported conversation would land with `contact_id = NULL`, so C2 Task 4's `/admin/contacts` pipeline and its thread deep link (`SELECT id FROM conversations WHERE contact_id = contacts.id`) would miss **exactly the backlog the backfill exists to surface**. So the loop is: normalise → `normalizeWhatsAppNumber` (skip and count the entry if it does not normalise) → `contactsRepository.upsertFromWhatsApp(contactWriterActor("import"), …)` → `importHistoricalInbound(woztellBackfillActor(), {…, contactId})`. Assert the contact write in Step 1's test, and add `contacts` to the response counters.

- [ ] **Step 6: Route** — `lib/api/woztell-backfill-route.ts` exporting `POST`; `app/api/admin/woztell/backfill/route.ts` is a one-line re-export (`tests/unit/next-route-exports.test.ts` allows only handler names and route segment config, and its file list gains this path). Authorization: `requireAdminActor()` from `@/lib/auth/actor`, exactly as `app/api/admin/media/upload/route.ts` does. **Spec deviation, deliberate:** §6 says "admin bearer"; a second shared bearer would be a new production secret with no rotation story and no owner, while the session-actor route is the pattern every other admin API route in this repo already uses. The Open API token remains required as *configuration*, not as the caller's credential. Body: `z.object({after: z.string().max(4096).nullable().default(null), pages: z.number().int().min(1).max(20).default(5)}).strict()`. Response: `{imported, duplicates, skipped, contacts, memberIdConflicts, endCursor, hasNextPage}`.

  **Correction, from the Task 11 review — the session-actor deviation carries a duty the first draft of this step omitted.** Choosing a cookie over a bearer makes this route CSRF-reachable: `proxy.ts`'s matcher is `/((?!api|trpc|_next|_vercel|.*\..*).*)` so `/api` never reaches it, `next.config.ts` sets response headers only, and a cross-origin form post with `enctype="text/plain"` needs no preflight and never reads the response — `{"after":"=","pages":20}` is one valid form field and valid JSON at the same time. So the route must gate on `isSameOrigin(request, appEnv().appUrl)` and answer 403 **after** the actor gate and **before** the token read, exactly as `lib/admin/media-upload-route.ts` does. Two more things the same review corrected: the channel id is folded into the token's blank check (an empty `ID!` answers an empty page, which staff read as an empty backlog), and one `audit_events` row per run — `woztell.history_imported`, carrying the actor, the cursor window and the counters — is written before the outcome is classified, so a 200 means the run is on the record. `segmentsRepository.auditExport` audits a mere CSV read; this writes `contacts`, `messages` and `conversations.last_inbound_at`.

- [ ] **Step 7: Inventory** — `config/wisetech-protected-route-inventory.ts` gains `owner({id: "api-admin-woztell-backfill", family: "api", classification: "api-handler", routePath: "/api/admin/woztell/backfill", filePath: "app/api/admin/woztell/backfill/route.ts", dataOwner: "Admin-actor WOZTELL conversation history import (Phase C, C-3)."})`. Re-pin `tests/unit/wisetech-protected-route-ownership.test.ts`: run it once, read the new counts from the failure, pin those. **Note:** neither the ESLint database-boundary rule (`files: ["lib/**"]`) nor `tests/unit/repository-boundary.test.ts` (`resolve(process.cwd(), "lib")`) covers `app/**`, so boundary 1 is honoured here by keeping the route file a re-export — by discipline, not by a gate.

- [ ] **Step 8: Run** `npx vitest run tests/unit/woztell-backfill.test.ts tests/unit/next-route-exports.test.ts tests/unit/wisetech-protected-route-ownership.test.ts tests/unit/env-contract.test.ts tests/unit/public-environment-isolation.test.ts --reporter=dot && npm run typecheck && npx eslint lib/api lib/channels "app/api/admin/woztell"` → PASS.

- [ ] **Step 9: Commit** — `git commit -m "feat(api): admin-actor WOZTELL conversation history backfill through the shared normaliser (C-3)"`.

---

### Task 12: Acceptance spec and gate

**File:** `tests/e2e/phase-c1-whatsapp-human-lane.spec.ts` (C), shaped like `tests/e2e/phase-b2-member-directory.spec.ts` (bundle reader, `[{locale:"en", prefix:""}, {locale:"zh-HK", prefix:"/zh"}]`, `missingM2LiveEnvironment()` gate).

- [ ] Both locales, ungated: `/admin/inbox` renders the `Admin.inbox.title` h1, the channel filter **and** the new handling filter; the description no longer contains the Phase A read-only sentence (assert against the *bundle value*, so it cannot pass vacuously).
- [ ] Gated on `M2_TEST_*`: staff open a WhatsApp thread → "Take this over" → the composer appears with a countdown → send a free-text reply → the thread shows it under `Admin.inbox.roles.staff` with `Admin.inbox.delivery.sent` (a `mock:` provider id, since `RUN_LIVE_WOZTELL` is unset — D-4: every flow is exercisable through the mock adapter and C-9 stays a flag flip) → "Hand back to the concierge" restores `handling: bot`.
- [ ] A **unit-level** end-to-end that no browser can stand in for, in `tests/integration/phase-c1-human-lane.test.ts`: drive `createWoztellWebhookProcessor` with an inbound payload, then a delivery-status payload for the id the mock adapter returned, and assert the `messages` row moves `queued → sent → delivered`. This is the only place the two halves of C-1 meet.

Full gate, run bare and judged by exit code: `npm run audit:strings && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build`.

**Commit** `test(e2e): Phase C1 WhatsApp human-lane acceptance spec (C-1, C-2, C-3)`.

---

## Phase C1 exit checklist

Two lists, and the line between them is the whole point of the section. The first
is what this branch **executed**, with the transcript to show for it. The second is
what nothing in this worktree can execute at all — there is no local database here
and no Woztell credential anywhere in the tree, so O-1, O-2 and O-9 are still open
by construction rather than by neglect. Anything moved from the second list to the
first without a real run is a lie the next reader will act on.

**Proved on this branch — the gate**

Run at the tip of `feat/phase-c-whatsapp-operations` with all twelve tasks in,
each command on its own line and judged by its exit code. None was piped into
`grep`/`head`/`tail`: a vitest run piped to `grep` exits 0 on a red suite, which
is how a red gate gets reported green.

| Command | Exit | Tail |
|---|---|---|
| `npm run audit:strings` | **0** | `Visible-string audit passed (247 TSX files scanned).` |
| `npm test` | **0** | `Test Files 515 passed, 16 skipped (531)` / `Tests 4425 passed, 43 skipped (4468)` |
| `npm run lint` | **0** | `31 problems (0 errors, 31 warnings)` — every warning pre-existing (`<img>` in test doubles, `_priority`/`row` unused args) |
| `npm run typecheck` | **0** | no output |
| `export NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app && npm run build` | **0** | `Compiled successfully in 22.3s`; `/api/admin/woztell/backfill` and `/api/webhooks/woztell` both present as dynamic handlers |

The gate was run three times over the branch tip. The middle run went **red** on
`tests/unit/homepage.test.tsx` and `tests/unit/wt-pages/launchpad-page.test.tsx`,
neither of which C1 touches, and the cause is worth recording because the reported
failure was two files from it: a whole-page render that takes ~1.1s alone crossed
the default 5000ms bound under an 11-worker jsdom run, and a timed-out test's
`render()` still resolves *after* Testing Library's `afterEach` cleanup — so it
mounts into the next test's DOM and *that* test fails on duplicated nodes (13
landmarks read as 26, one eyebrow as two). Since `0e5a725` a red shard fails the
quality gate, so the flake costs a whole CI run. `vitest.config.ts` now sets
`testTimeout: 20_000`, which hides no assertion: a genuinely hung test still
fails, later. Both files pass in 1.1s in isolation and the run above is the
post-fix one.

The 16 skipped files are the `DATABASE_URL_TEST`-gated PostgreSQL suites plus
`tests/integration/woztell-live.acceptance.test.ts`. They are skipped **here** for
exactly the reason the owner list exists, and their being skipped is not evidence
of anything. Playwright was **not** run: there is no live environment to run it
against, and `missingM2LiveEnvironment()` would gate the signed-in half regardless.

**Proved on this branch — the structural invariants**

- [x] `drizzle/meta/0031_snapshot.json`'s `prevId` is `9e39066a-db08-42f7-9531-76134f2dfe4b`, 0031's own id `bd5ecc5f-d613-494a-bd42-5046b6aca4cc` is 0032's `prevId`, and `_journal.json` ends at idx 32 (`0032_phase_c_message_direction_backfill`). `drizzle/meta/*` is committed exactly as generated.
- [x] No migration in this release **uses** the `'staff'` enum literal (S-1): `grep -n "'staff'" drizzle/0031_*.sql drizzle/0032_*.sql` returns the `ALTER TYPE "public"."message_role" ADD VALUE 'staff'` line and one comment in 0032 saying that nothing else names it. **Correction to the wording this item shipped with:** the unquoted `grep -n "staff"` it originally specified also matches `conversations.last_staff_read_at` and two prose lines, so it can never return a single line and reads as a failure to whoever runs it as written. The invariant is about the quoted literal appearing in a DEFAULT, CHECK or backfill — grep for `'staff'`, not `staff`.
- [x] `tests/unit/internal-navigation-config.test.ts`, `tests/unit/admin-nav.test.tsx`, `components/admin/admin-nav.tsx` and `config/internal-navigation.ts` carry no C1 diff (`git diff --name-only 246b22b..HEAD --` returns nothing for all four), so the `toHaveLength(19)` and its ordered id arrays stand untouched. C1 adds no admin page; `/api/admin/woztell/backfill` is a route handler and is registered in `config/wisetech-protected-route-inventory.ts` and `tests/unit/next-route-exports.test.ts` instead.
- [x] The jsonb delivery outbox is untouched (S-5): `lib/db/repos/woztell-delivery-outbox.ts` and both its test files carry no C1 diff, and their four tests pass inside the green run above. Two ledgers, still two questions, still no overlap.
- [x] The `Admin.inbox.description` read-only sentence is gone from **both** bundles — English no longer says "Read-only in this release", `zh-HK` no longer says 「此版本只可閱讀」 — and `npm run audit:strings` is green over the replacements.
- [x] `tests/unit/message-direction-writers.test.ts` scans `lib/db/repos/` and finds no `INSERT INTO ${messages}` that omits `direction`, so `appendMessageFrom` cannot silently label a bot reply `inbound` again.
- [x] `tests/unit/repository-production-security.test.ts` refuses a member, an admin and an anonymous actor **before `loadDatabase`** for every method on `woztell-inbound-events.ts`, `woztell-delivery-stamp.ts` and `importHistoricalInbound`, and for all six new `inboxRepository` staff writes (S-14, S-6). No repository this plan added is actorless, and the two legacy exceptions were not cited.
- [x] Every code in `INBOX_REPLY_ERROR_CODES` has a producer: `tests/unit/inbox-action-core.test.ts` asserts set equality between the twelve declared codes and the codes twelve driven calls actually raise — `TEMPLATE_NOT_APPROVED` included — with a vacuous-pass guard so a helper that stops detecting failures fails the test rather than passing it.
- [x] `lib/db/repos/message-eligibility.ts` exists with **one** private `loadRecipientFacts`, an exported `RecipientFacts`, and a `whatsAppEligibility` whose first statement is `requireAdmin(actor)`. The C2 plan's ownership table names it **(M, not C)**, so C2 appends `factsFor` rather than creating a second module.
- [x] Every flow is exercisable through the **mock** adapter (D-4): `tests/integration/phase-c1-human-lane.test.ts` drives `createWoztellWebhookProcessor` with an inbound payload and then a delivery-status payload carrying the id the mock adapter returned, and asserts one `messages` row moving `queued → sent → delivered`. No test added by this plan needs a credential, and none would only pass against real Woztell.

**What only an owner with production credentials or live Woztell can prove**

Nothing in this list has been executed anywhere. Each entry is a claim the branch
could not test — not a step someone forgot — and the first four are the ones where
a wrong guess is indistinguishable from a provider outage.

- [ ] **Owner action —** the acceptance spec `tests/e2e/phase-c1-whatsapp-human-lane.spec.ts` has **never been run**. Its ungated half (both locales render the inbox h1, the channel filter, the new handling filter, and a description that no longer contains the Phase A read-only sentence) needs only a built app; its `M2_TEST_*`-gated half — take over, compose, send, see `Admin.inbox.delivery.sent` against a `mock:` provider id, hand back — needs the credential pair. Until both halves run, the UI half of C-2 is reviewed, typechecked and unit-tested, but not walked.

- [ ] **Owner action —** migrations 0031 and 0032 applied to production before the deploy, **as one unit, in one `npm run db:migrate` invocation**. They are separate files but they are not separable: Task 3 replaces `claimInbound`'s reuse predicate (`EXISTS (… prior_message.channel = 'whatsapp')`) with `conversations.channel = 'whatsapp'`, and that new predicate is "at least as inclusive" *only because* 0032 backfills `channel`. Apply 0031 without 0032 and every existing WhatsApp conversation reads `channel='web'`, no thread is reused, and the webhook opens a **second conversation per person** on the first inbound after deploy — splitting exactly the threads the inbox exists to unify. There is no local database in this worktree, so neither file has ever been executed; they are pinned only by their TypeScript twins under `tests/fixtures/` and by the schema contract. Run both against an isolated Neon branch first, then: `neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479`, then `DATABASE_URL=… npm run db:migrate`. Confirm afterwards that `SELECT count(*) FROM messages WHERE direction IS NULL` is 0 and that `SELECT count(*) FROM conversations c WHERE c.channel = 'web' AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.channel = 'whatsapp')` is 0.

- [ ] **Owner action —** know that **every pre-deploy anonymous thread is a dead end until its next inbound message**, and tell staff so rather than letting them find it. 0032 backfills `conversations.channel`, `messages.direction` and `last_inbound_at`, but **nothing backfills `conversations.contact_id`** — and nothing can: the owner key is an HMAC, it is not invertible, and the only cleartext copy of the sender's number (`messages.metadata->>'normalizedSender'`) is deleted by the twelve-month retention sweep. So a thread whose window is genuinely still open renders "3h 20m left to reply freely" from the seeded `last_inbound_at`, while `queueStaffMessage`'s recipient `SELECT` finds `profile_id IS NULL AND contact_id IS NULL` and eligibility answers `no_number`. The next inbound message repopulates `contact_id` through the `COALESCE` in Task 3 Step 3 and the thread becomes replyable. This is a known, bounded, self-healing gap — but only if nobody spends a morning debugging it on day one.
- [ ] **Owner action —** `vercel promote`, then the signed-in walk no unit test can stand in for: a staff member opens a real WhatsApp thread in `/admin/inbox`, takes it over, replies inside the window, and the member receives it. Until `RUN_LIVE_WOZTELL=1` this walk ends at a `mock:` provider id — which is the point (D-4), and is why the walk must be repeated after C-9's flag flip.
- [ ] **Owner action —** replay one **captured real** delivery-status payload and one outbound-echo payload through `normalizeInbound` (O-1). Until this is done, "the ticks do not arrive" is a normaliser bug first and a provider problem second, and there is nothing in the tree that would tell you which: the route answers 202 for every outcome and this layer deliberately logs nothing.
- [ ] **Owner action —** confirm Woztell's Open API host and the `conversationHistory` selection set before calling `/api/admin/woztell/backfill` against production (O-2), and set **both** `WOZTELL_OPEN_API_TOKEN` (with `api:admin` scope) and `WOZTELL_CHANNEL_ID` in Vercel — the route answers `503 BACKFILL_NOT_CONFIGURED` unless both are present, because an empty channel id used to go out inside the query as an empty `ID!` and answer an empty page, which reads as "there is no backlog". **When the first real response arrives, check the timestamp field first:** the mapper accepts a string or a numeric epoch and the normaliser applies the range bounds, but any other shape maps every entry to `null` and reports the whole backlog as `skipped` — the one O-2 correction that looks exactly like success. The route is cookie-authenticated and same-origin-gated, so a shell call must carry `-H "Origin: $APP_URL"` alongside the session cookie or it answers `403 BACKFILL_ORIGIN_DENIED`.
- [ ] **Owner action —** choose the backfill's cursor window knowing two things the code cannot decide. **(a)** An imported entry is written `woztellState: "completed"`, so `claimInbound` answers `duplicate` for that `provider_message_id` for ever: if the window overlaps a message Woztell has not yet delivered to the webhook, that member gets no concierge reply. It errs toward not sending, and the message still lands in the inbox for staff — but the window is a decision, not a detail. **(b)** A historical `opt_out` is imported as an ordinary message and deliberately not acted on. Replaying an old STOP cannot damage anything (`markWhatsAppOptedOut` is monotonic), but importing a **recent** STOP the webhook never saw bumps `conversations.last_inbound_at` while the withdrawal exists in no table, so `messageEligibility` answers `eligible` for a service reply to somebody who asked us to stop. After a backfill, cross-check any thread whose newest imported message is a STOP before replying to it.
- [ ] **Owner action —** read the `woztell.history_imported` rows in `audit_events` after each backfill run: they carry the staff actor, the cursor window, the counters, and `memberIdConflicts`. A non-zero conflict count means the backlog contests a `whatsapp_member_id` that another contact already holds; the backfill cannot file the webhook's staff task for it (S-14 gives it a different capability on purpose), and deciding which contact keeps the id is C2 Task 5's merge work.
- [ ] **Owner action —** confirm the webhook body cap. `MAX_WEBHOOK_BYTES` is 64 KiB and is applied **before** signature verification; a batched delivery-status payload over that is rejected 413 and looks like a provider outage. Ask Woztell what their maximum status batch is.
- [ ] **Not in C1, and deliberately so:** C-4 contacts pipeline, C-5 campaigns and the `whatsapp-send-queue` job, C-6 segment v2, C-7 template registry, C-8 dispatcher, **C-9 go-live (C2 Task 13 — an earlier draft of both plans disclaimed it and left it unowned)**. The §6 Phase C gate's second half — "a reviewed template blast to a segment of 20 opted-in members sends … one STOP suppresses that member from the next blast" — is **not** met by this plan. C1 meets the first half and builds the eligibility read (S-9) the blast will need.

---

## Open questions

- **O-1 — the delivery-status and outbound-echo payload shapes are unverified.** No credentials, no captured payload, no provider documentation in the tree; the only fixture that has ever existed is `{from, type:"TEXT", messageId, timestamp, data:{text}}`. Task 2's two discriminators are a best guess, confined to one function. Nobody has decided who obtains a captured payload or when. Until they do, C-1 is written but not proven.
- **O-2 — Woztell's Open API host, GraphQL document and history entry shape are unverified,** for the same reason. `WOZTELL_SEND_RESPONSES_URL` is the only provider host that exists in the repo.
- **O-3 — member-id-first resolution is deferred to C2 Task 5, and C1 is now safe without it.** ~~Open~~ **Assigned.** The hazard was real: `upsertFromWhatsApp` merges `COALESCE(existing, EXCLUDED)` so the first id written wins forever, and an incoming member id already belonging to a *different* contact row violates `contacts_whatsapp_member_unique`, which is **not** the `ON CONFLICT` target — a 23505 that Task 4 Step 7 turns into a 500 and an infinite Woztell retry. Task 4 Step 6 now removes the column from the upsert entirely and writes it through a separately guarded `UPDATE … WHERE whatsapp_member_id IS NULL AND NOT EXISTS (…)` inside its own `try`/`catch`, so C1 can never raise on it. **Spec C-1's "resolve contact by Woztell member id then number" is therefore not implemented in C1** — resolution stays number-first, with the member id merely stored — and the C2 plan's Task 5 owns member-id-first resolution plus the correction/merge rule. That is a stated deviation, not an oversight; see the corrections table.
- **O-4 — a prospect who said STOP has no way to re-consent.** Task 5 stops the interest form silently reviving an opt-out, which is right, but leaves no path back. C-4 needs an explicit re-consent action with its own `consent.whatsapp.granted` audit row (an action string that appears nowhere in the tree today; C2 Task 3 adds the contact leg). **Related and deliberately not fixed here:** `woztellStore.setWhatsappOptIn` (`lib/db/repos/woztell.ts:333-340`) is a bare `UPDATE profiles` with no audit row. Its only caller today passes `false`, in the STOP branch, immediately after `recordOptOut` → `suppressionsRepository.optOutWhatsApp` has already written the `consent.whatsapp.revoked` row for that same profile — so the withdrawal *is* audited, once, by its sibling. There is **no caller that passes `true`**: the profile grant leg has no code path at all. When C-4's re-consent flow adds one, it must write `consent.whatsapp.granted` in the same transaction; adding an audit row to a method nothing grants through would be auditing an empty branch. **Correction, from the Task 5 review:** the *profile* grant leg is not empty — `lib/portal/command-core.ts:updateProfile` spreads `whatsappConsentFields({optIn: true, source: "portal"})` into `profilesRepository.update`, so a member can re-grant WhatsApp from the portal today, unaudited, and nothing deletes their `message_suppressions` row (the only `DELETE FROM message_suppressions` in the tree is `scripts/seed-m3.ts`). Two consequences C-4 owns: that member stays marketing-suppressed forever, and the suppression's `created_at` — which `messageEligibility.linkedMemberWithdrawalAt` derives a member's `whatsappOptedOutAt` from — is frozen at the FIRST withdrawal. C1 Task 5 assumed no such path existed and keyed `optOutWhatsApp`'s audit row on the suppression INSERT alone, which lost the audit row for the second, genuine withdrawal; the shipped version audits the flag transition OR the INSERT.
- **O-5 — how long is a human-handled thread kept?** S-10 takes them out of both retention sweeps, which is the safe move for an operational record with an audit trail pointing at it, but "forever" is not a retention policy and PDPO expects one. The decision needs WTIA, not engineering. **Owner: C2 Task 13 (C-9) carries it as a go-live checklist item**, so it is asked before the flag flip rather than after.
- **O-6 — `aiops_monthly_metrics` will read a successful human takeover as an AI failure.** Its `month_conversations` CTE counts every `agent_kind='concierge'` conversation, and a `handling='human'` thread produces no terminal `agent_run`, so it lands in the denominator of `agent_resolved_rate` and never in the numerator; `first_response` keys off `role='assistant'`, so a `role='staff'` reply is excluded from the median-first-response sample entirely. §6 C-9 names this view as the go-live monitoring signal. The fix — adding `AND conversations.handling = 'bot'` to the view body — requires dropping and recreating a materialized view whose exact 23 public columns are pinned by `tests/unit/m4c-schema-contract.test.ts` against `drizzle/meta/0013_snapshot.json`, and whether drizzle-kit will regenerate the body cleanly is untested. Recommendation: do it as the **first step of C2 Task 13** — which is where C-9 now lives, and which has an owner — not here, and until then read `agent_resolved_rate` as "of threads the bot kept", not "of all threads".
- **O-7 — the journey runner sends three templates with no approval gate, and the config comment claims otherwise.** ***Discharged across the boundary: C2 Task 2 Step 5 closes it*** by wiring the approved set through `JourneyRunnerDependencies`. That is the one open question handed to the companion plan that the companion plan actually catches. It remains listed here because it must be verified as closed before C-9, and because the false comment is worth correcting the moment anyone reads it. `config/whatsapp-templates.ts:31-32` asserts "the journey runner only sends WhatsApp when this key is in `WOZTELL_APPROVED_TEMPLATE_KEYS`". It does not: `lib/automation/journey-runner.ts:445` accepts any own-property key of `WHATSAPP_TEMPLATES`, and `approvedTemplateKeys` is consulted in exactly one place (`lib/ai/woztell-delivery.ts:162`) for the two concierge follow-ups only. The moment C-9 flips `RUN_LIVE_WOZTELL=1`, `renewal_14`, `dunning_3` and `event_reminder_24h` go live unapproved; an unapproved elementName returns a provider 4xx → `provider_client_error` → permanent failure + a staff task per member. C1 does not touch the journey runner and this is C-7's gate to close, but **it must be closed before C-9**, and the false comment should be corrected the moment anyone reads it.
- **O-8 — `RUN_LIVE_WOZTELL` and `WOZTELL_APPROVED_TEMPLATE_KEYS` are read from bare `process.env`,** outside the feature-scoped contracts of boundary 7 — the two variables that decide whether real messages leave the building are the two with no Zod parse and no owner, and a typo (`RUN_LIVE_WOZTELL=true`) fails silently into mock mode with a `mock:` provider id recorded as delivered. Task 11 adds `WOZTELL_OPEN_API_TOKEN` through `aiEnv()` rather than widening the hole, but the two existing reads are left alone: moving them is a behaviour change to the live-send switch, and doing it in the same release as the human lane would make a go-live regression indistinguishable from a C1 regression. It should be its own commit, before C-9; **C2 Task 13 carries it as a gated step** so it has an owner and a place in the sequence.

- **O-9 — nothing in either Phase C plan is a substitute for a captured payload.** O-1 and O-2 are the two places where correctness is currently a guess, and they are the two places where a wrong guess is indistinguishable from a provider outage. The 202-body echo (Task 4 Step 1) makes the guess *readable* in Woztell's own delivery log, which is the difference between a five-minute diagnosis and a day of it — but it does not make the guess right. C2 Task 13's first gated item is the replay.
