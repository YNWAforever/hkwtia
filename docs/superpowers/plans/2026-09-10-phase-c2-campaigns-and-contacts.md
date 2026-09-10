# Phase C2 — Campaigns, Contacts and Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff a reviewed, auditable way to reach members *and* prospects on WhatsApp and email: a contacts pipeline at `/admin/contacts` that links a prospect to their member profile, a segment language that can address contacts and event states, a campaign wizard at `/admin/campaigns` whose eligibility preview is a durable snapshot rather than a guess, a template registry at `/admin/templates` that makes "approved" a fact in the database, and a ten-minute send queue that cannot double-send and cannot reach anyone who said STOP.

**Architecture:** Two migrations (**0033** additive DDL, **0034** a custom registry seed) on top of Phase C1's 0031-0032. `campaign_recipients` becomes identity-polymorphic (profile **or** contact) with two partial unique indexes and an exactly-one check; `campaigns` gains a channel, a template key, the reviewer triple and a schedule; `whatsapp_templates` is a new table whose `status` gates every WhatsApp send. Eligibility is computed by one pure classifier fed by one audience query, snapshotted onto `campaign_recipients` at draft time and rechecked at send time. The send queue is its own job kind on its own cron with its own ten-minute run key, and its claim is channel-scoped so the existing hourly email path can never touch a WhatsApp recipient.

**Tech Stack:** Next.js 16 App Router (webpack) · React 19 · TypeScript strict · Drizzle ORM on Neon · next-intl v4 · Zod · Vitest · Playwright · Cloudflare Worker (`workers/`, its own package).

**Programme context:** spec §6, work packages **C-4** (contacts pipeline), **C-5** (campaigns UI + send queue), **C-6** (segment v2), **C-7** (template registry), the part of **C-8** (notifications dispatcher) that Phase C1 does not take, and **C-9 (go-live), which this plan owns as Task 13**. Companion plan: **`2026-09-10-phase-c1-whatsapp-human-lane.md`** (webhook v2, inbox v1, backfill). **C1 lands first.**

C-9 is called out because an earlier draft of both plans disclaimed it — C1's context paragraph excluded it as "a companion plan", C2's scope sentence simply omitted it — leaving the `RUN_LIVE_WOZTELL=1` flip, its §8 activation preconditions and the live-acceptance harness owned by nobody while both exit checklists read as complete. It is Task 13 here.

**What C1 owns, exhaustively, so this plan builds none of it twice.** The list below is the whole boundary; an earlier draft of this paragraph omitted two rows and the result was one module created twice with incompatible contracts.

| Artefact | Owner | This plan's relationship |
|---|---|---|
| migrations **0031** and **0032**; `conversations.channel/handling/contact_id/whatsapp_member_id/last_inbound_at/subject`; `messages.direction/delivery_status/sent_by_profile_id/template_key/outbound_key/send_claim_expires_at`; `message_role` gaining `staff` | C1 Task 1 | 0033 chains on 0032 (Task 1 Step 0 guards it) |
| `tests/unit/phase-c-schema-contract.test.ts` | C1 Task 1 (create) | Task 1 here **appends** describe blocks |
| **`lib/db/repos/message-eligibility.ts`** — the module, the private facts query, the `RecipientFacts` type, `whatsAppEligibility(actor: Actor, …)` gated by `requireAdmin` | **C1 Task 5 (create)** | **Task 3 here MODIFIES it (M, not C)** and adds `factsFor` beside it. See Task 3. |
| **`contactsRepository.markWhatsAppOptedOut`** — the `whatsapp_opt_in = true` guard, the `"revoked" \| "already_revoked"` return, the `consent.whatsapp.revoked` audit row — and the **`upsertFromInterestForm` opt-out-revival guard** | **C1 Task 5** | Task 3 here adds **only** the `consent.whatsapp.granted` leg on top |
| `lib/db/repos/woztell-inbound-events.ts::recordDeliveryStatus` | C1 Task 3 | Task 10 here adds the `campaign_recipients` fall-through **inside that method** |
| `lib/whatsapp/approved-templates.ts` — the importable key reader, and `CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS` | C1 Task 8 Step 0 | Task 2 here swaps its **source** for the registry and makes it `async` |
| `lib/channels/woztell.ts`'s `CUSTOMER_SERVICE_WINDOW_MS` becoming exported; `lib/ai/woztell-credentials.ts` | C1 Tasks 2 and 7 | read, not rewritten |
| the retention sweeps learning `handling`; `lib/db/message-direction.ts` | C1 Tasks 9 and 3 | depended on, untouched |
| capability actors for every new webhook-side repository (C1's S-14) | C1 | Task 5 and Task 10 here follow the same rule; nothing new is actorless |

C1 does **not** create `lib/notifications/dispatch.ts`, so Task 11 here does — and, unlike an earlier draft, Task 10 here is its first caller. C1 leaves the journey runner's missing template gate to C-7, so Task 2 here closes it. C1 defers `aiops_monthly_metrics` (its O-6), human-thread retention (O-5) and the `RUN_LIVE_WOZTELL` env-contract move (O-8) to C-9 by name; Task 13 picks all three up.

> **Execution order note.** The task numbers are cross-referenced throughout both documents and are **not** the execution order in one place: **Task 11 lands before Task 10**, because Task 10's per-recipient send goes through `dispatchNotification`. See Task 10's preamble.

**Working rules for every task** — identical to `2026-09-09-phase-b2-member-directory.md`: focused test first, run it, read the failure; `localizedPath` for every `<Link href>` (`revalidatePath` takes the internal path); no actor-taking export from a `"use server"` module; `requireAdminPageActor` imported by exactly that statement in every admin page; both message bundles in the same commit; migrations generated with drizzle-kit, `--custom` only for backfills and seeds; `NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build` before hand-off; one commit per task.

**Two `"use server"` boundary mechanics that catch people, worth stating once for all five new action modules** (`template-registry-actions.ts`, `contact-actions.ts`, `campaign-review-actions.ts`, and any wrapper you add): `tests/unit/server-action-actor-boundary.test.ts:19` flags a parameter by **name** as well as by type — `actorParameterNames = new Set(["actor", "_actor", "adminActor", "sessionActor"])` — so no wrapper may name a parameter `actor` whatever its type; and `nonAsyncFunctionExports` (line 473) rejects **every** non-async runtime export, so error-code lists, category arrays and any constant must be `type`-only in those modules or live in the sibling `*-core.ts`.

**New repositories take capability actors.** C1's S-14 settles this for the whole phase: `whatsappTemplatesRepository`'s `approved` gate (`templateRegistryActor`) and `deliveries`' `requireDeliveryActor` follow the `contactWriterActor` shape (`lib/db/repos/contacts.ts:17-30`), and each new method gains a case in `tests/unit/repository-production-security.test.ts` asserting a member, an admin and an anonymous actor are refused **before** `loadDatabase`. Nothing this plan adds is actorless.

---

## Corrections to the spec (§6 is stale in eight places)

| Spec text | Reality on this branch | Corrected instruction |
|---|---|---|
| "Schema (0029–0031)" | Phase B2 consumed 0028, 0029 and 0030; `drizzle/meta/_journal.json` ends at idx 30, snapshot id `9e39066a-db08-42f7-9531-76134f2dfe4b`. | Phase C is **0031–0034**, one file more than §6 budgeted. C1 owns 0031 (DDL) and 0032 (its direction/channel backfill); this plan owns **0033** and **0034**, generated after C1 has landed. |
| "`campaign_recipients` email nullable + `contact_id`" | `profile_id` is `NOT NULL` with an `ON DELETE RESTRICT` FK, and `UNIQUE (campaign_id, profile_id)` is the whole de-duplication story. | `profile_id` must also become nullable, which silently disables that UNIQUE for contact rows (Postgres treats NULLs as distinct). Two partial unique indexes plus an exactly-one-of CHECK are required and unstated. S-4. |
| "`campaigns` + … `template_key`" | `campaigns.template` already exists as `NOT NULL` free text, interpreted by `campaignTemplateMap` in the email runner. | Two template columns with two vocabularies. `template` becomes nullable and stays the email source template; `template_key` names a `whatsapp_templates` row. Two checks, one per channel. S-5. |
| "`campaign_status` gains draft/review/scheduled/sending/failed" | `npm run db:migrate` applies **every pending file inside one Postgres transaction** (`drizzle-orm/pg-core/dialect` wraps the loop), and `ALTER TYPE … ADD VALUE` forbids using the new value in that same transaction. On a fresh database every file is pending at once. | Add the values, and let **no DDL in 0031–0034 name them** — no DEFAULT, no CHECK, no backfill. Runtime writes are in a different transaction and are fine. S-2. |
| C-8 "→ `email_log`/`whatsapp_log`" | Neither table has a `contact_id`; both key only on `profile_id`. | A dispatch to a prospect logs an anonymous row today. 0033 adds `contact_id` to both. S-8. |
| C-5 "eligibility preview (eligible / no number / not opted-in / suppressed / plan-ineligible)" | `campaignAudience` derives `suppressed` from `email_log.status = 'suppressed'`, a value **no writer in the tree ever writes** (`DeliveryStatus` is `processing｜sent｜failed`). It projects no number, no opt-in and no plan. | All five categories are new. The live suppression facts are `message_suppressions` (profiles) and `contacts.whatsapp_opted_out_at` (prospects). Task 8. |
| C-5 "review by a second admin" | `ownedCampaign` scopes every campaign write to `created_by_profile_id = actor.profileId` and `tests/unit/campaign-repository-boundary.test.ts` pins that another admin is refused. `savedSegmentForActor` does the same for segments. | A reviewer accessor is a deliberate authorization change with its own test. The reviewer never reads `saved_segments`; the snapshot on `campaign_recipients` is what they review. S-7. |
| C-6 "`filter_version: 2`" | `saved_segments.filter_version` is written as a hard-coded `1` at `lib/db/repos/segments.ts:113` and **read by nothing**. `segmentFilterSchema` is `.strict()` and shared by four parse sites. | There is no dispatch to extend; C-6 invents it. The dispatch lands *before* the writer bumps the version, or the first v2 row 500s `/admin/segments`. S-9. |
| C-7 "`WOZTELL_APPROVED_TEMPLATE_KEYS` becomes a fallback read only when the table is empty" | `approvedTemplateKeys()` intersects the env var with a **hard-coded two-element array** of concierge keys and ignores the variable entirely when `RUN_LIVE_WOZTELL !== "1"` — i.e. in all of CI. It gates only the concierge follow-up fallback; the journey runner sends `renewal_14`, `dunning_3` and `event_reminder_24h` with **no allowlist check at all**, contradicting the comment at `config/whatsapp-templates.ts:31-32`. | Replace the whole function, not its env read, and wire the journey runner to it too. Mock-mode behaviour is preserved deliberately. S-14, Task 2. |

| C-5 "eligibility preview" and §6's blast gate, on template variables | `lib/channels/woztell.ts:261-271` builds the body as `template.variables.map((key) => ({… text: input.variables[key] ?? ""}))`, and every seeded template needs 2-4 parameters. `campaign_recipients.variables` is `jsonb NOT NULL` and is supplied **per recipient by the caller** today (`lib/admin/campaigns.ts:59`). §6 asks for `campaigns.variables_template`, which nothing wrote and nothing read. | The wizard gains a **variables step** (Task 9 Step 3), `createCampaign` stores the map, `insertRecipients` **resolves it per recipient** into `campaign_recipients.variables` (Task 8 Step 5), and Task 10 reads that snapshot. A variable that will not resolve blocks the recipient as `missing_variable` at snapshot time. Without this the §6 gate sends `wtia_renewal_d14` with three empty BODY parameters to twenty people, Meta rejects them, and S-15 makes all twenty permanent. |
| C-7 "the four templates" / §8.3's marketing templates | `config/whatsapp-templates.ts` has five, all `utility`. §8.3's `wtia_announcement_{en,zh_hk}` and `wtia_lead_followup_{en,zh_hk}` exist nowhere, so `whatsapp_templates_category_check`'s `'marketing'` arm has nothing to exercise and the announcement blast `/admin/campaigns` exists for **has no template to send**. | Task 1 Step 5 adds all four to the config and the 0034 seed: **nine rows, not five**. |
| C-9 go-live | Not in either plan's scope sentence as first drafted. | **Task 13 here.** See the programme-context paragraph. |

Two further corrections the plan inherits rather than fixes: `WOZTELL_OPEN_API_TOKEN` (spec §8.2, C-3's credential) exists nowhere in the tree — that is C1's problem, not C2's; and CLAUDE.md's "Known deadline" for `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` is already discharged on this branch (`lib/config/env.ts` records the removal), so there is no fallback left to remove on 2026-09-10.

---

## Scope decisions

- **S-1 Numbering and chaining.** Phase C2 is migrations **0033** and **0034**, generated with `npx drizzle-kit generate --config=drizzle.config.ts --name <tag>` (there is no `db:generate` script). Before generating, confirm `drizzle/meta/_journal.json` ends at **idx 32** (`0032_phase_c_message_direction_backfill`). If it ends at 30, C1 has not landed — stop and land C1: a snapshot generated on a stale base silently forks the chain, and this plan touches `campaigns`, `campaign_recipients` and both log tables, none of which C1 touches, so the fork would stay invisible until deploy. Generation needs no database; only `db:migrate` needs `DATABASE_URL`.
- **S-2 One migrate run is one transaction.** `campaign_status` gains its five values in 0033 and **nothing in 0031–0034 may use them**: no column DEFAULT, no CHECK naming one, no `UPDATE … SET status = 'draft'`. `campaigns.status` keeps `DEFAULT 'queued'`. `drizzle/0008_m3_campaign_recipient_leases.sql` is the precedent — it added `'processing'` and referenced it nowhere. Pinned by a source-text assertion in Task 1.
- **S-3 No new pg enums in C2.** `campaigns.channel`, `whatsapp_templates.status` and `whatsapp_templates.category` are `text` + CHECK, not `pgEnum`, so their values are usable in the migration that creates them and widening later needs no `ALTER TYPE`.
- **S-4 Recipient identity.** `campaign_recipients.profile_id` and `.email` become nullable; `contact_id uuid REFERENCES contacts(id) ON DELETE RESTRICT` is added; `UNIQUE (campaign_id, profile_id)` is dropped and replaced by `campaign_recipients_campaign_profile_unique` (partial, `WHERE profile_id IS NOT NULL`) and `campaign_recipients_campaign_contact_unique` (partial, `WHERE contact_id IS NOT NULL`); `campaign_recipients_identity_check` requires exactly one. `created_at`/`updated_at` are added in the same migration — the table has never carried a timestamp, so a stalled blast has nothing to order against. Existing rows take the migration instant; that is stated, not hidden.
- **S-5 Two template columns.** `campaigns.template` (email source template: `renewal-reminder｜member-update｜membership_renewal`) becomes nullable; `campaigns.template_key` is new, FK to `whatsapp_templates.key` `ON DELETE RESTRICT`. `campaigns_email_template_check` (`channel <> 'email' OR template IS NOT NULL`) and `campaigns_whatsapp_template_check` (`channel <> 'whatsapp' OR template_key IS NOT NULL`). Every existing row satisfies both, because `channel` defaults to `'email'` and `template` is currently NOT NULL.
- **S-6 Lifecycle, and what the claim loop must not learn.** The wizard writes `draft → review → scheduled`; a scheduled campaign is promoted to `queued` by `promoteScheduledCampaigns`, and only then is it drainable. The claim loop's `due` and `completed` CTEs keep their `('queued','processing')` lists — widening them would let the hourly sweep stamp a fresh draft `completed`. `processing` stays the in-flight campaign state; **`sending` is added for spec parity and deliberately never written**, because three SQL statements in `campaign-recipient-delivery.ts` and their regexes in `tests/unit/campaign-delivery.test.ts` already spell that state `processing`, and renaming it buys nothing. `failed` *is* written, by the promotion step, when a scheduled WhatsApp campaign's template is no longer approved. `cancelled` remains the dead value it was before this phase.
- **S-7 Two-person control without widening segment ownership.** `ownedCampaign` is untouched and still gates creator writes. A new `reviewableCampaign(actor, store, campaignId)` authorizes on `requireAdmin` **and** `created_by_profile_id <> actor.profileId`, so an admin cannot review their own campaign. The review screen reads the campaign row and the eligibility counts on `campaign_recipients` — never `saved_segments`. That is why the snapshot exists: it makes the reviewable object campaign-scoped, so segment ownership (which names member emails) stays owner-only.
- **S-8 Contacts are logged, not suppressed-by-row.** `email_log` and `whatsapp_log` gain `contact_id`. `message_suppressions` is **not** widened: `profile_id` stays NOT NULL, and the contact lane stays `contacts.whatsapp_opt_in` / `whatsapp_opted_out_at`, which `lib/db/repos/suppressions.ts:71-76` already documents as the split. One repository (`messageEligibilityRepository`) owns reading both sources so no caller has to know there are two. Unifying them is Phase D work, recorded here so it is a known debt rather than a surprise.
- **S-9 Segment v2 dispatch first, writer second.** `segmentFilterV1Schema` is today's `.strict()` object, frozen. `segmentFilterV2Schema` is v1's keys plus six, each with a default. `parseSegmentFilter(filterVersion, filters)` dispatches. Every read site moves to the dispatcher in Task 6; only Task 7 bumps `saveSegment` to write `filter_version: 2`. Reversed, the first v2 row throws in `toSavedSegment`, `savedSegmentForActor`, `membersForSegment` and the CSV route at once, taking `/admin/segments` down for every admin.
- **S-10 Audience rows are discriminated, not widened.** `SegmentAudienceRow` carries `kind: "member" | "contact"` and an `id`; the keyset cursor becomes `{sortKey, kind, id}` and its predicate is **parenthesised** (today's bare `OR` is safe only because it is the sole `WHERE` term). `no_show` is not offered as an event state: it exists on `registration_status` and not on `guest_registration_status`, and a state that means different things per audience is a filter that lies.
- **S-11 The send queue is its own job kind.** `PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE = "whatsapp-send-queue"` is a **new** constant group. It is *not* added to `M3_AUTOMATION_JOB_KINDS`: that constant is interpolated into the partial index `jobs_automation_recent_idx` and pinned by `tests/unit/job-kind-contract.test.ts`, so adding a member produces an unintended `DROP INDEX`/`CREATE INDEX` in the migration and two red tests for a reason unrelated to the feature.
- **S-12 A ten-minute cron needs a ten-minute run key.** `JobBucket` gains `"ten-minute"`; `runKeyFor` returns `${kind}:${now.toISOString().slice(0, 15)}0` (e.g. `whatsapp-send-queue:2026-09-10T04:20`), which satisfies `SAFE_RUN_KEY` because it has no `.`. With the `hourly` bucket, ticks 2–6 of every hour would claim the same `run_key`, `jobsRepository.claim` only reclaims rows in state `failed`, and the route would answer `200 {"duplicate":true}` — a queue that looks healthy and drains once an hour.
- **S-13 Every adapter construction passes `RUN_LIVE_WOZTELL`.** `lib/jobs/runners.ts:421-427` records the incident: an outbound path that omitted it recorded journey and dunning messages as delivered while nothing left the building. A discovery test requires the flag in every `createWoztellAdapter(` call.
- **S-14 Approval gates the send, and approval is fail-closed.** In live mode the approved set is `whatsapp_templates` rows with `status='approved'`, intersected with the keys `config/whatsapp-templates.ts` declares (the config's `as const` shape is what types every call site, so the registry can never approve a key the code cannot send). When the registry has zero rows, `WOZTELL_APPROVED_TEMPLATE_KEYS` is the fallback. When `RUN_LIVE_WOZTELL !== "1"` the full config key set is returned unconditionally, exactly as today — every non-live test in the suite depends on that. **Consequence for go-live:** 0034 seeds all **nine** keys as `pending` (Task 1 Step 5 adds §8.3's four marketing templates to the config's five), so the registry is never empty and nothing is approved until staff say so in `/admin/templates`. That is deliberate: it is the first time an unapproved template cannot reach Meta. It is also the single most likely way to make C-9 look broken, so it is the first line of the go-live checklist.
- **S-15 Uncertain acceptance is terminal, never retried.** `lib/channels/woztell.ts` maps a provider 5xx to `provider_acceptance_uncertain`, which is not a `DeliveryFailureCode`, so both runners currently fall through to `provider_unclassified_failure` → permanent. The tempting fix — mapping it to `retryable_server` — is worse: Woztell may already have delivered, and a retry re-sends a marketing template. The WhatsApp branch classifies it explicitly as terminal-for-this-attempt plus a staff task, and never reschedules.
- **S-16 Merge-on-login is merge-on-write.** `getActor()` fires `touchLastLogin` on **every authenticated request**, not at login, so hooking the merge there would put a two-table lookup on every page render. The merge runs instead wherever a profile's identity fields are written — the join profile step and the portal profile save — and manually from `/admin/contacts`. Precedence: phone first (`contacts_phone_unique` is a real unique index), email second (`contacts_email_idx` is deliberately *not* unique, and `lib/db/repos/contacts.ts:70-73` records why). When both match different rows the phone row takes `profile_id`; the email row is tagged `merge-candidate` and raises a `contact_merge_candidate` staff task. The link never throws into the sign-in or save path.
- **S-17 The `/admin/segments` queue button survives.** It keeps creating an email campaign directly in `queued`, as today, so nothing regresses; it now writes `channel='email'` explicitly and snapshots through the same classifier. `/admin/campaigns` is the reviewed path and the **only** path that can create a WhatsApp campaign — `campaigns_whatsapp_template_check` makes that structural. Retiring the shortcut is Phase D.

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `lib/db/schema-core.ts` (M), `drizzle/0033_phase_c_campaign_channels.sql` (generated), `drizzle/0034_phase_c_whatsapp_template_seed.sql` (custom), `tests/fixtures/whatsapp-template-seed.ts` (C), `tests/unit/phase-c-schema-contract.test.ts` (**M** — created by C1 Task 1) | 1 | schema, enum widening, registry seed + twin |
| `config/whatsapp-templates.ts` (M), `lib/db/repos/whatsapp-templates.ts` (C), `lib/admin/template-registry-core.ts` (C), `lib/admin/template-registry-actions.ts` (C), `components/admin/template-registry-table.tsx` (C), `app/[locale]/(admin)/admin/templates/page.tsx` (C), `lib/whatsapp/approved-templates.ts` (**M** — created by C1 Task 8 Step 0), `lib/ai/woztell-production.ts` (M), `lib/admin/inbox-action-core.ts` (M), `app/[locale]/(admin)/admin/inbox/[id]/page.tsx` (M), `lib/automation/journey-runner.ts` (M), `tests/unit/journey-runner.test.ts` + `tests/unit/task7-*.test.ts` (M, four files) + `tests/integration/{automation-runners-postgres,journey-delivery-idempotency,m3-acceptance}.test.ts` (M, three files) | 2 | template registry, allowlist replacement, and **every** fixture that constructs `JourneyRunnerDependencies` |
| `lib/db/repos/message-eligibility.ts` (**M** — created by C1 Task 5), `lib/db/repos/contacts.ts` (M), `lib/db/repos/deliveries.ts` (M) | 3 | `factsFor` beside `whatsAppEligibility`; the `consent.whatsapp.granted` leg |
| `lib/admin/contacts.ts` (C), `lib/admin/contact-action-core.ts` (C), `lib/admin/contact-actions.ts` (C), `components/admin/contact-pipeline-table.tsx` (C), `app/[locale]/(admin)/admin/contacts/page.tsx` (C) | 4 | `/admin/contacts` |
| `lib/db/repos/contacts.ts` (M), `lib/portal/command-core.ts` (M), `app/[locale]/(join)/join/actions.ts` (M) | 5 | merge-on-write |
| `lib/admin/segment-schema.ts` (M), `lib/db/repos/segments.ts` (M), `lib/db/repos/campaigns.ts` (M) | 6 | segment v2 schema + version dispatch |
| `lib/db/repos/segments.ts` (M), `lib/admin/segments.ts` (M), `lib/admin/csv.ts` (M), `components/admin/segment-builder.tsx` (M), `components/admin/segment-results.tsx` (M), `app/api/admin/segments/[id]/export/route.ts` (M) | 7 | contacts audience, event predicate, preset |
| `lib/admin/campaign-eligibility.ts` (C), `lib/db/repos/campaigns.ts` (M), `lib/admin/campaigns.ts` (M) | 8 | eligibility classifier, audience v2, campaign writes |
| `lib/admin/campaign-wizard.ts` (C), `lib/admin/campaign-review-core.ts` (C), `lib/admin/campaign-review-actions.ts` (C), `components/admin/campaign-wizard.tsx` (C), `components/admin/campaign-report.tsx` (C), `app/[locale]/(admin)/admin/campaigns/page.tsx` (C), `app/[locale]/(admin)/admin/campaigns/[id]/page.tsx` (C) | 9 | `/admin/campaigns` |
| `lib/jobs/kinds.ts` (M), `lib/jobs/handler.ts` (M), `lib/db/repos/campaign-recipient-delivery.ts` (M), `lib/db/repos/woztell-inbound-events.ts` (M — created by C1 Task 3), `lib/automation/campaign-runner.ts` (M), `lib/jobs/runners.ts` (M), `lib/api/jobs/whatsapp-send-queue-route.ts` (C), `app/api/jobs/whatsapp-send-queue/route.ts` (C), `tests/unit/next-route-exports.test.ts` (**M** — its `routeFiles` tuple is hand-maintained), `workers/wrangler.toml` (M), `workers/src/index.ts` (M), `workers/test/chat-retention.test.ts` (**M** — pins the exact `crons` string), `tests/unit/worker-cron-contract.test.ts` (C) | 10 | send queue end to end |
| `lib/notifications/dispatch.ts` (C) | 11 | C-8 dispatcher — **lands before Task 10, which is its first caller** |
| `tests/fixtures/woztell-live-acceptance.ts` (M), `lib/ai/woztell-production.ts` (M), `lib/config/env.ts` (M), `drizzle/0013_*` view (M, gated) | 13 | C-9 go-live readiness |
| `config/internal-navigation.ts` (M), `components/admin/admin-nav.tsx` (M), `config/wisetech-protected-route-inventory.ts` (M), `tests/unit/internal-navigation-config.test.ts` (M), `tests/unit/admin-server-action-boundaries.test.ts` (M) | 2, 4, 9 | nav + inventory + pins, per route, in the route's own task |
| `messages/en.json`, `messages/zh-HK.json` (M) | 2, 4, 7, 9 | `Admin.templates`, `Admin.contacts`, `Admin.segments` (v2 keys), `Admin.campaigns`, `Admin.navigation.*` |
| `tests/e2e/phase-c2-campaigns-and-contacts.spec.ts` (C) | 12 | acceptance |

---

### Task 1: Schema — campaigns, recipients, template registry, log contacts (0033, 0034)

**Files:** `lib/db/schema-core.ts`, `drizzle/0033_*`, `drizzle/0034_*`, `tests/fixtures/whatsapp-template-seed.ts`, `tests/unit/phase-c-schema-contract.test.ts`.

- [ ] **Step 0: Confirm the base.** `tail -20 drizzle/meta/_journal.json` must end at `"idx": 32`. If it ends at 30, C1 has not landed — stop.

- [ ] **Step 1: Failing test** — **append** these `describe` blocks to `tests/unit/phase-c-schema-contract.test.ts`, which Phase C1 Task 1 created (the per-milestone contract-file convention: `m3-`, `m4b-`, `m4c-`, `m5-`…, never an extension of the shared `schema-contract.test.ts`). Merge the imports; do not create a second file:

```ts
import {readFileSync} from "node:fs";
import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {campaignRecipients, campaignStatusEnum, campaigns, emailLog, whatsappLog, whatsappTemplates} from "@/lib/db/schema-core";
import {whatsappTemplateSeedRows} from "@/tests/fixtures/whatsapp-template-seed";

describe("phase C2 campaign schema contract", () => {
  it("adds the campaign channel, template key, reviewer triple and schedule", () => {
    for (const column of ["name", "channel", "templateKey", "variablesTemplate", "scheduledAt", "reviewedAt", "reviewedByProfileId", "rejectionReason", "completedAt", "updatedAt"] as const) {
      expect(campaigns[column]).toBeDefined();
    }
    expect(campaigns.template.notNull).toBe(false);
    const checks = getTableConfig(campaigns).checks.map((check) => check.name);
    expect(checks).toEqual(expect.arrayContaining(["campaigns_channel_check", "campaigns_email_template_check", "campaigns_whatsapp_template_check"]));
  });

  it("lets a recipient be a contact and keeps de-duplication per identity", () => {
    expect(campaignRecipients.profileId.notNull).toBe(false);
    expect(campaignRecipients.email.notNull).toBe(false);
    for (const column of ["contactId", "whatsappNumber", "providerMessageId", "sentAt", "deliveredAt", "readAt", "blockedReason", "createdAt", "updatedAt"] as const) {
      expect(campaignRecipients[column]).toBeDefined();
    }
    const config = getTableConfig(campaignRecipients);
    const indexes = config.indexes.map((index) => index.config.name);
    // NOTE the `_idx` suffixes: the new partial unique indexes deliberately do
    // NOT reuse the dropped constraint's name. See Step 4.
    expect(indexes).toEqual(expect.arrayContaining(["campaign_recipients_campaign_profile_idx", "campaign_recipients_campaign_contact_idx", "campaign_recipients_campaign_status_idx", "campaign_recipients_provider_message_idx"]));
    expect(config.uniqueConstraints.map((unique) => unique.name)).not.toContain("campaign_recipients_campaign_profile_unique");
    expect(config.checks.map((check) => check.name)).toContain("campaign_recipients_identity_check");
  });

  it("can log a delivery to a prospect on either channel", () => {
    expect(emailLog.contactId).toBeDefined();
    expect(whatsappLog.contactId).toBeDefined();
  });

  it("keeps every campaign_status value and appends the five Phase C states at the end", () => {
    expect(campaignStatusEnum.enumValues).toEqual([
      "queued", "processing", "completed", "cancelled",
      "draft", "review", "scheduled", "sending", "failed",
    ]);
  });

  // S-2. One `db:migrate` run is one Postgres transaction, and a value added by
  // ALTER TYPE cannot be USED in it. 0008 is the precedent that got this right
  // by accident; this assertion makes it deliberate. It is the only check in
  // either Phase C plan that catches a failure mode nobody can reproduce
  // locally: `unsafe use of new value … of enum type`, on a fresh database,
  // aborting the whole deploy.
  //
  // Both filters are load-bearing. `ALTER TYPE … ADD VALUE` is the statement we
  // are permitting. `CREATE TYPE … AS ENUM` must go too, because C1's 0031
  // declares message_delivery_status as ('queued','sent','delivered','read',
  // 'failed') — so 0031 legally contains the literal 'failed', belonging to a
  // type CREATEd in the same transaction, which Postgres allows precisely
  // because it was created there. A guard that goes red against correct SQL in
  // a file this plan did not write gets relaxed, and relaxing THIS guard is how
  // the deploy breaks.
  const stripPermittedEnumStatements = (sql: string) =>
    sql.split("\n")
      .filter((line) => !/ALTER TYPE .*ADD VALUE/i.test(line))
      .filter((line) => !/CREATE TYPE .* AS ENUM/i.test(line))
      .join("\n");

  it("never uses a newly added campaign_status value in Phase C DDL", () => {
    for (const file of ["drizzle/0031_phase_c_conversation_operations.sql", "drizzle/0032_phase_c_message_direction_backfill.sql", "drizzle/0033_phase_c_campaign_channels.sql", "drizzle/0034_phase_c_whatsapp_template_seed.sql"]) {
      const uses = stripPermittedEnumStatements(readFileSync(file, "utf8"));
      for (const value of ["draft", "review", "scheduled", "sending", "failed"]) {
        expect(uses, file).not.toContain(`'${value}'`);
      }
    }
  });

  // A guard nobody has seen fail is a guard nobody trusts. This is the shape
  // tests/unit/server-action-actor-boundary.test.ts established.
  it("detects the shapes it is meant to catch", () => {
    const hostile = [
      `ALTER TABLE "campaigns" ALTER COLUMN "status" SET DEFAULT 'draft';`,
      `UPDATE "campaigns" SET "status" = 'review' WHERE "reviewed_at" IS NOT NULL;`,
      `ALTER TABLE "campaigns" ADD CONSTRAINT "c" CHECK ("status" <> 'scheduled');`,
    ].join("\n");
    const uses = stripPermittedEnumStatements(hostile);
    for (const value of ["draft", "review", "scheduled"]) {
      expect(uses).toContain(`'${value}'`);
    }
    // …and that the two permitted forms really are stripped:
    expect(stripPermittedEnumStatements(
      `ALTER TYPE "public"."campaign_status" ADD VALUE 'draft';\n`
      + `CREATE TYPE "public"."message_delivery_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');`,
    ).trim()).toBe("");
  });

  it("registers the template registry and seeds it pending, from the config", () => {
    const config = getTableConfig(whatsappTemplates);
    expect(config.checks.map((check) => check.name)).toEqual(expect.arrayContaining(["whatsapp_templates_status_check", "whatsapp_templates_category_check", "whatsapp_templates_approved_at_check"]));
    const seed = readFileSync("drizzle/0034_phase_c_whatsapp_template_seed.sql", "utf8");
    expect(whatsappTemplateSeedRows()).toHaveLength(Object.keys(WHATSAPP_TEMPLATES).length);
    for (const row of whatsappTemplateSeedRows()) {
      expect(seed).toContain(`'${row.key}'`);
      expect(seed).toContain(`'${row.elementName}'`);
      expect(seed).toContain(row.variables.map((variable) => `'${variable}'`).join(","));
    }
    expect(seed).not.toContain("'approved'");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/phase-c-schema-contract.test.ts --reporter=dot` → FAIL (module `whatsappTemplates` does not exist). Read the failure; confirm it names the missing export, not a bad path.

- [ ] **Step 3: Schema.** In `lib/db/schema-core.ts`:

  - `campaignStatusEnum` becomes `pgEnum("campaign_status", ["queued", "processing", "completed", "cancelled", "draft", "review", "scheduled", "sending", "failed"])`. **Append at the end** so drizzle-kit emits plain `ALTER TYPE … ADD VALUE` rather than the `… BEFORE …` form.
  - `campaigns` gains, with a comment naming S-5 and S-6:
    ```ts
    name: text("name"),
    // Programme C-5. Text + CHECK rather than a pgEnum: a value added by
    // ALTER TYPE cannot be used in the transaction that adds it, and
    // `db:migrate` runs every pending file in one (S-2/S-3).
    channel: text("channel").default("email").notNull(),
    templateKey: text("template_key").references((): AnyPgColumn => whatsappTemplates.key, {onDelete: "restrict"}),
    variablesTemplate: jsonb("variables_template").$type<Record<string, string>>().default({}).notNull(),
    scheduledAt: timestamp("scheduled_at", {withTimezone: true}),
    reviewedAt: timestamp("reviewed_at", {withTimezone: true}),
    reviewedByProfileId: text("reviewed_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
    rejectionReason: text("rejection_reason"),
    completedAt: timestamp("completed_at", {withTimezone: true}),
    updatedAt: updatedAt("updated_at"),
    ```
    `template` drops `.notNull()`. Third `pgTable` argument:
    ```ts
    (table) => [
      check("campaigns_channel_check", sql`${table.channel} IN ('email', 'whatsapp')`),
      // The database enforces this and not only the repository, because a blast
      // with no template is the one mistake that reaches members (D-9: blasts
      // are template-only outside the 24-hour window).
      check("campaigns_whatsapp_template_check", sql`${table.channel} <> 'whatsapp' OR ${table.templateKey} IS NOT NULL`),
      check("campaigns_email_template_check", sql`${table.channel} <> 'email' OR ${table.template} IS NOT NULL`),
      index("campaigns_status_scheduled_idx").on(table.status, table.scheduledAt),
    ]
    ```
  - `campaignRecipients`: `profileId` and `email` drop `.notNull()`; add
    ```ts
    contactId: uuid("contact_id").references((): AnyPgColumn => contacts.id, {onDelete: "restrict"}),
    whatsappNumber: text("whatsapp_number"),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at", {withTimezone: true}),
    deliveredAt: timestamp("delivered_at", {withTimezone: true}),
    readAt: timestamp("read_at", {withTimezone: true}),
    blockedReason: text("blocked_reason"),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
    ```
    and replace the `unique(...)` with:
    ```ts
    // Deliberately NOT named "campaign_recipients_campaign_profile_unique".
    // Postgres backs a unique CONSTRAINT with an index carrying the
    // constraint's name, so reusing it would make the generated file's
    // DROP CONSTRAINT / CREATE UNIQUE INDEX ordering load-bearing — and if
    // drizzle-kit emitted them the wrong way round, the only repair would be
    // hand-editing the SQL, which desynchronises drizzle/meta/0033_snapshot.json
    // from what was actually applied. A new name makes the ordering irrelevant.
    uniqueIndex("campaign_recipients_campaign_profile_idx").on(table.campaignId, table.profileId).where(sql`${table.profileId} IS NOT NULL`),
    uniqueIndex("campaign_recipients_campaign_contact_idx").on(table.campaignId, table.contactId).where(sql`${table.contactId} IS NOT NULL`),
    index("campaign_recipients_campaign_status_idx").on(table.campaignId, table.status),
    // Task 10 Step 4b's delivery-status fall-through looks a recipient up by the
    // provider's id when the `messages` UPDATE matches nothing. Not unique: two
    // recipients in different campaigns could in principle carry one id, and a
    // unique index here would turn that into a webhook 500.
    index("campaign_recipients_provider_message_idx").on(table.providerMessageId),
    check("campaign_recipients_identity_check", sql`(${table.profileId} IS NOT NULL) <> (${table.contactId} IS NOT NULL)`),
    ```
    keeping `campaign_recipients_due_idx`. Do **not** name any column `message_body` or `provider_response`: `tests/unit/campaign-recipient-lease-schema.test.ts` asserts on a source-text slice from `pgTable("campaign_recipients"` to `export const events`.
  - `emailLog` and `whatsappLog` each gain `contactId: uuid("contact_id").references((): AnyPgColumn => contacts.id, {onDelete: "set null"})` plus `index("<table>_contact_created_idx").on(table.contactId, table.createdAt)`.
  - **New table `whatsappTemplates`, declared after `eventGuestRegistrations`** — never between `campaignRecipients` and `export const events`, which would silently widen the lease test's slice:
    ```ts
    /**
     * Programme C-7. "Approved" stops being an environment variable and becomes
     * a row a named admin approved on a date. `status` defaults to 'pending', so
     * an unseeded or half-migrated registry can send nothing (S-14).
     */
    export const whatsappTemplates = pgTable("whatsapp_templates", {
      key: text("key").primaryKey(),
      elementName: text("element_name").notNull(),
      languageCode: text("language_code").notNull(),
      category: text("category").default("utility").notNull(),
      variables: text("variables").array().default(sql`'{}'::text[]`).notNull(),
      previews: jsonb("previews").$type<Record<string, string>>().default({}).notNull(),
      status: text("status").default("pending").notNull(),
      approvedAt: timestamp("approved_at", {withTimezone: true}),
      reviewedByProfileId: text("reviewed_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
      rejectionReason: text("rejection_reason"),
      createdAt: createdAt("created_at"),
      updatedAt: updatedAt("updated_at"),
    }, (table) => [
      uniqueIndex("whatsapp_templates_element_language_unique").on(table.elementName, table.languageCode),
      check("whatsapp_templates_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'disabled')`),
      check("whatsapp_templates_category_check", sql`${table.category} IN ('marketing', 'utility', 'authentication')`),
      check("whatsapp_templates_approved_at_check", sql`${table.status} <> 'approved' OR ${table.approvedAt} IS NOT NULL`),
    ]);
    export type WhatsAppTemplateStatus = "pending" | "approved" | "rejected" | "disabled";
    export type WhatsAppTemplateCategory = "marketing" | "utility" | "authentication";
    ```

- [ ] **Step 4: Generate 0033** — `npx drizzle-kit generate --config=drizzle.config.ts --name phase_c_campaign_channels`. Read the emitted SQL and confirm: five `ALTER TYPE "campaign_status" ADD VALUE`; `CREATE TABLE "whatsapp_templates"` with three checks; ten `ALTER TABLE "campaigns" ADD COLUMN` plus `ALTER COLUMN "template" DROP NOT NULL` and three checks; the `campaign_recipients` column adds, two `DROP NOT NULL`, `DROP CONSTRAINT "campaign_recipients_campaign_profile_unique"` and the two `CREATE UNIQUE INDEX … _idx`, and the identity check; `contact_id` on both log tables. **Reject the file and re-derive if any statement outside the `ALTER TYPE … ADD VALUE` and `CREATE TYPE … AS ENUM` lines contains `'draft'`, `'review'`, `'scheduled'`, `'sending'` or `'failed'`** (S-2 — and note the second exemption, without which the Step 1 guard goes red against C1's own `message_delivery_status`, which legally contains `'failed'`). Commit `drizzle/meta/*` untouched.

  **Do not hand-edit the emitted SQL.** The new indexes carry `_idx` names rather than reusing the dropped constraint's name precisely so that the `DROP CONSTRAINT` / `CREATE UNIQUE INDEX` ordering cannot matter; if you find yourself wanting to reorder statements, rename the index instead and re-generate, so `drizzle/meta/0033_snapshot.json` still describes what was applied.

- [ ] **Step 4b: `campaigns.completed_at` gets its writer, here, in the same commit that adds the column.** The `completed` CTE in `lib/db/repos/campaign-recipient-delivery.ts:141-151` stamps `status = 'completed'` and nothing else. Add `, completed_at = ${now}` to that `SET` — it is not a change to the CTE's `('queued','processing')` status list, so S-6 is untouched — and assert it in `tests/unit/campaign-delivery.test.ts`. Without this, `completed_at` is a column §6 asked for that is set by nothing, the same class of defect as `variables_template` (which Task 9 now writes) and `conversations.subject` (which C1 explicitly marks reserved). A column with no writer is worse than a missing column: the schema looks complete.

- [ ] **Step 5: The config edit belongs to this task, not Task 2, and it adds four keys as well as `category`.**

  Task 1 and Task 2 were circular: Step 6's twin reads `template.category`, which Task 2 Step 3 adds — while Task 1's commit line already stages `config/whatsapp-templates.ts` and Task 2 claims to own the file. Resolve it here: **Task 1 owns the `config/whatsapp-templates.ts` data edit**; Task 2 owns only deleting the false comment on `event_reminder_24h` and replacing it with one that is true.

  Add `category` to all five existing entries (`"utility"` for every one of them) **and add spec §8.3's four marketing templates**, which an earlier draft deferred in a parenthesis with no owner:

```ts
  wtia_announcement_en:   {name: "wtia_announcement_en",   languageCode: "en_US", category: "marketing", variables: ["memberName", "headline", "detailUrl"]},
  wtia_announcement_zh_hk:{name: "wtia_announcement_zh_hk",languageCode: "zh_HK", category: "marketing", variables: ["memberName", "headline", "detailUrl"]},
  wtia_lead_followup_en:  {name: "wtia_lead_followup_en",  languageCode: "en_US", category: "marketing", variables: ["contactName", "topic", "replyUrl"]},
  wtia_lead_followup_zh_hk:{name:"wtia_lead_followup_zh_hk",languageCode:"zh_HK", category: "marketing", variables: ["contactName", "topic", "replyUrl"]},
```

  **Why this is not cosmetic.** All five seeded rows are `utility`, so `whatsapp_templates_category_check`'s `'marketing'` arm has nothing to exercise, Task 10's "classification is derived from the template's `category`" has no case where it derives `marketing`, and the announcement blast that `/admin/campaigns` exists to send **has no template to send**. §6's gate is "a reviewed template blast to a segment of 20 opted-in members"; a blast of a utility template is not that.

  Adding keys is safe by construction: `WHATSAPP_TEMPLATES` types every send call site through its `as const`, journey steps reference only the three journey keys, and `approvedTemplateKeys` in mock mode returns the whole set — which is what lets the wizard offer them in CI. `tests/fixtures/woztell-live-acceptance.ts`'s two-key ceiling is a separate matter and belongs to Task 13.

- [ ] **Step 6: Generate 0034** — `npx drizzle-kit generate --config=drizzle.config.ts --custom --name phase_c_whatsapp_template_seed`, then fill it (**nine rows**, one per config key; the twin asserts the count against `Object.keys(WHATSAPP_TEMPLATES).length`, so a mismatch is a red test, not a silent gap):

```sql
-- Programme C-7 (migration 0034). Reference data, not fixture data: the registry must exist in
-- production, and `WOZTELL_APPROVED_TEMPLATE_KEYS` is the fallback only while it
-- is empty. Every row lands `pending` (the column default) so that seeding the
-- registry can never approve a template nobody approved — an unapproved key is
-- skipped at send time, not sent (S-14). Mirrored by
-- tests/fixtures/whatsapp-template-seed.ts, the way 0029 is mirrored by
-- tests/fixtures/company-slug.ts.
INSERT INTO "whatsapp_templates" ("key", "element_name", "language_code", "category", "variables") VALUES
  ('renewal_14', 'wtia_renewal_d14', 'en_US', 'utility', ARRAY['memberName','renewalDate','renewalUrl']),
  ('dunning_3', 'wtia_dunning_d3', 'en_US', 'utility', ARRAY['memberName','amountDue','paymentUrl']),
  ('concierge_follow_up_en', 'wtia_concierge_follow_up_en', 'en_US', 'utility', ARRAY['memberName','supportUrl']),
  ('concierge_follow_up_zh_hk', 'wtia_concierge_follow_up_zh_hk', 'zh_HK', 'utility', ARRAY['memberName','supportUrl']),
  ('event_reminder_24h', 'wtia_event_reminder_24h', 'en_US', 'utility', ARRAY['memberName','eventTitle','startsAt','eventUrl']),
  -- §8.3's marketing templates. Without these the 'marketing' arm of
  -- whatsapp_templates_category_check is never exercised and the announcement
  -- blast /admin/campaigns exists for has no template to send.
  ('wtia_announcement_en', 'wtia_announcement_en', 'en_US', 'marketing', ARRAY['memberName','headline','detailUrl']),
  ('wtia_announcement_zh_hk', 'wtia_announcement_zh_hk', 'zh_HK', 'marketing', ARRAY['memberName','headline','detailUrl']),
  ('wtia_lead_followup_en', 'wtia_lead_followup_en', 'en_US', 'marketing', ARRAY['contactName','topic','replyUrl']),
  ('wtia_lead_followup_zh_hk', 'wtia_lead_followup_zh_hk', 'zh_HK', 'marketing', ARRAY['contactName','topic','replyUrl'])
ON CONFLICT ("key") DO NOTHING;
```

- [ ] **Step 7: TypeScript twin** — `tests/fixtures/whatsapp-template-seed.ts`:

```ts
import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";

/** One row as `drizzle/0034_phase_c_whatsapp_template_seed.sql` writes it. */
export type WhatsAppTemplateSeedRow = Readonly<{
  key: WhatsAppTemplateKey;
  elementName: string;
  languageCode: string;
  category: "marketing" | "utility" | "authentication";
  variables: readonly string[];
}>;

/**
 * The twin of 0034. The seed runs once, against a database no local gate has,
 * so its contents are only ever asserted as behaviour through this mirror —
 * the same reason tests/fixtures/company-slug.ts exists for 0029. Keep the two
 * in step row for row; a template whose `variables` order drifts from the
 * config sends the right words in the wrong slots and Meta accepts it.
 */
export function whatsappTemplateSeedRows(): readonly WhatsAppTemplateSeedRow[] {
  return (Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[]).map((key) => {
    const template = WHATSAPP_TEMPLATES[key];
    return {key, elementName: template.name, languageCode: template.languageCode, category: template.category, variables: template.variables};
  });
}
```
(`category` and the four marketing keys arrive on the config in **Step 5 of this task** — the circularity an earlier draft left between Task 1 and Task 2 is resolved there.)

- [ ] **Step 8: Verify** `npx vitest run tests/unit/phase-c-schema-contract.test.ts tests/unit/campaign-recipient-lease-schema.test.ts tests/unit/m3-schema-contract.test.ts tests/unit/schema-contract.test.ts tests/unit/campaign-delivery.test.ts --reporter=dot && npm run typecheck` → PASS. There is no local database: 0033/0034 are exercised only by these assertions and by the disposable-container run in the exit checklist.

- [ ] **Step 9: Commit** — `git add lib/db/schema-core.ts config/whatsapp-templates.ts lib/db/repos/campaign-recipient-delivery.ts drizzle tests && git commit -m "feat(db): campaign channels, contact recipients and the WhatsApp template registry (C-5, C-7)"`

---

### Task 2: Template registry, `/admin/templates`, and the allowlist that actually gates sends (C-7)

**Files:** `config/whatsapp-templates.ts`, `lib/db/repos/whatsapp-templates.ts`, `lib/admin/template-registry-core.ts`, `lib/admin/template-registry-actions.ts`, `components/admin/template-registry-table.tsx`, `app/[locale]/(admin)/admin/templates/page.tsx`, `lib/ai/woztell-production.ts`, `lib/automation/journey-runner.ts`, nav/inventory/bundles.

- [ ] **Step 1: Failing tests** — `tests/unit/whatsapp-template-registry.test.ts`:
  - `approvedTemplateKeys` returns **every** config key when `RUN_LIVE_WOZTELL` is unset, without touching the database (assert the loader was never called) — this is the branch all of CI depends on;
  - with `RUN_LIVE_WOZTELL="1"` and a registry of three rows, one `approved`, it returns exactly that one key;
  - with `RUN_LIVE_WOZTELL="1"` and an **empty** registry it falls back to `WOZTELL_APPROVED_TEMPLATE_KEYS ∩ config keys`;
  - a key present in the registry but absent from `WHATSAPP_TEMPLATES` is dropped (the config's `as const` is what types every send call site);
  - `setStatus` refuses a non-admin (`FORBIDDEN`) **before** the database loads, and writes the `audit_events` row inside the same transaction as the status change.

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Config comment only.** The data edit (`category` on every entry, plus §8.3's four marketing keys) is **Task 1 Step 5** — that resolves the circularity where Task 1's twin read a field Task 2 added while Task 1's commit staged the file. What remains here is one comment: **delete the false claim** at `config/whatsapp-templates.ts:31-32` that the journey runner "only sends WhatsApp when this key is in `WOZTELL_APPROVED_TEMPLATE_KEYS`". It does not — `lib/automation/journey-runner.ts:445` accepts any own-property key of `WHATSAPP_TEMPLATES` — and Step 5 is what finally makes a version of that sentence true. Replace it with a line saying the registry is the gate and naming this task.

- [ ] **Step 4: Repository** — `lib/db/repos/whatsapp-templates.ts`:

```ts
const templateRegistryCapability: unique symbol = Symbol("template-registry-capability");
export type TemplateRegistryActor = Readonly<{kind: "template-registry"; userId: null; [templateRegistryCapability]: true}>;
export function templateRegistryActor(): TemplateRegistryActor;

export type WhatsAppTemplateRecord = Readonly<{
  key: WhatsAppTemplateKey; elementName: string; languageCode: string;
  category: WhatsAppTemplateCategory; variables: readonly string[];
  previews: Readonly<Record<string, string>>; status: WhatsAppTemplateStatus;
  approvedAt: Date | null; reviewedByProfileId: string | null; rejectionReason: string | null;
}>;

export function createWhatsAppTemplatesRepository(loadDatabase?: AutomationDatabaseLoader): {
  list(actor: Actor): Promise<readonly WhatsAppTemplateRecord[]>;                       // requireAdmin
  setStatus(actor: Actor, key: unknown, status: unknown, reason: unknown): Promise<WhatsAppTemplateRecord>;  // requireAdmin
  updatePreviews(actor: Actor, key: unknown, previews: unknown): Promise<WhatsAppTemplateRecord>;            // requireAdmin
  approved(actor: TemplateRegistryActor | AutomationRepositoryActor): Promise<Readonly<{keys: ReadonlySet<WhatsAppTemplateKey>; empty: boolean}>>;
};
export const whatsappTemplatesRepository: WhatsAppTemplatesRepository;
```
  Schemas: `templateKeySchema = z.enum(Object.keys(WHATSAPP_TEMPLATES) as [WhatsAppTemplateKey, ...WhatsAppTemplateKey[]])`; `templateStatusSchema = z.enum(["pending", "approved", "rejected", "disabled"])`; `previewsSchema = z.record(z.enum(["en", "zh-HK"]), z.string().trim().max(2000)).strict()`; `rejectionReasonSchema = z.string().trim().min(1).max(1000).nullable()`. Every schema parses **before** `loadDatabase()`, the shape `tests/unit/automation-repository-authorization.test.ts` pins elsewhere.
  `setStatus` runs in `database.transaction`: `UPDATE whatsapp_templates SET status, approved_at = CASE WHEN status='approved' THEN now() ELSE NULL END, reviewed_by_profile_id, rejection_reason, updated_at = now() WHERE key = …` then a raw `INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata)` with action **`whatsapp_template.status_changed`**, `target_type: 'whatsapp_template'`, `target_id: key`, metadata `{status, reason}`. Copy `lib/db/repos/company-profiles.ts:review` verbatim for the shape: the decision and its audit row commit together or neither does.
  `updatePreviews` audits **`whatsapp_template.previews_updated`**.
  Export `whatsappTemplatesRepository` and add it to **both** hand-written lists in `lib/db/repos/index.ts` — the re-export block (lines 3-21) **and** the `repositories` object (lines 40-57). They are two independent lists with no test forcing them to agree, so "add it to the barrel" is not an instruction; naming both is. C1 Task 5 does the same for `messageEligibilityRepository`.

- [ ] **Step 5: Swap the allowlist's source.** The function no longer lives in `lib/ai/woztell-production.ts` — **C1 Task 8 Step 0 already moved it** to `lib/whatsapp/approved-templates.ts`, exported, widened to `ReadonlySet<WhatsAppTemplateKey>`, with the old hard-coded two-element array preserved separately as `CONCIERGE_FOLLOW_UP_TEMPLATE_KEYS` so `lib/ai/woztell-delivery.ts:162` keeps its behaviour. This step changes that module's **source**, not its home:

```ts
export async function approvedTemplateKeys(
  registry: Pick<WhatsAppTemplatesRepository, "approved"> = whatsappTemplatesRepository,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ReadonlySet<WhatsAppTemplateKey>> { … }
```
  Behaviour, in order: (1) `environment.RUN_LIVE_WOZTELL !== "1"` → the full config key set, unconditionally, with a comment saying every non-live test depends on this; (2) `const {keys, empty} = await registry.approved(templateRegistryActor())`; (3) `empty` → `WOZTELL_APPROVED_TEMPLATE_KEYS` split on `,`, trimmed, intersected with the config keys; (4) otherwise `keys`. A registry read that throws returns the **empty** set — fail-closed, because the alternative is sending an unapproved template.

  **It becomes `async`, and it has four call sites, not one.** C1 added two of them. Run `tests/unit/approved-templates.test.ts`'s call-site count assertion (C1 Task 8 Step 0) first and convert every site it names:
  1. `lib/ai/woztell-production.ts` — `createProductionWoztellProcessorDependencies` becomes `async`, and `WoztellDeliveryDependencies.approvedTemplateKeys` stays a resolved `ReadonlySet` built before the bag;
  2. `lib/admin/inbox-action-core.ts` — C1 Task 7's `TEMPLATE_NOT_APPROVED` gate; already inside an async function, so it is one `await`;
  3. `app/[locale]/(admin)/admin/inbox/[id]/page.tsx` — C1 Task 8's template picker. **This file is in this task's file list for exactly this reason:** an unawaited `Promise<ReadonlySet<…>>` used as a `Set` silently offers an empty picker, with no type error if it is spread into a prop typed `{key, label}[]` via `Array.from`;
  4. `lib/automation/journey-runner.ts` — below.

  Raise the count assertion to four in the same commit, so a fifth caller cannot be added without noticing.

  **`lib/automation/journey-runner.ts::whatsappTemplate(step)` gains the gate, and this breaks seven existing fixtures unless you plan for it.** `JourneyRunnerDependencies` (line 162) is a `Readonly<{…}>` with **no optional members**, so a new required sibling to `whatsappTransport` fails to typecheck in every file that constructs the bag. Those files are, exhaustively: `tests/unit/journey-runner.test.ts`, `tests/unit/task7-lazy-admin-retry.test.ts`, `tests/unit/task7-per-channel-retry-crash.test.ts`, `tests/unit/task7-review-failures.test.ts`, `tests/unit/task7-second-rereview.test.ts`, `tests/integration/automation-runners-postgres.test.ts`, `tests/integration/journey-delivery-idempotency.test.ts`, `tests/integration/m3-acceptance.test.ts`. Two ways through, and **pick the first**:

  - **Optional with a fail-open-to-email default** — `approvedTemplateKeys?: ReadonlySet<WhatsAppTemplateKey>`, absent meaning "today's behaviour, no gate". Every existing fixture compiles unchanged; only `lib/jobs/runners.ts` passes it. This is the honest shape anyway: the gate is a production concern, and a runner unit test that has to enumerate approved templates to exercise dunning is testing the wrong thing.
  - Required, and update all eight files in this commit. Only if the first is somehow rejected in review.

  `whatsappTemplate(step)` is a private pure function `(step: JourneyStep) => WhatsAppTemplateKey | null` called from `sendWhatsapp` (line 473); adding the gate changes its signature and its one caller. A step whose template is not approved returns `null`, which `sendWhatsapp` already treats as "no WhatsApp channel" and returns `false` for — so **the step delivers by email alone rather than failing**. Do **not** read `process.env` inside the runner.

  Add **one behavioural test** for that last sentence: a step whose template is not approved delivers by email and produces **no** `RunnerFailure` and **no** staff task. That is the regression S-14's fail-closed change makes possible — an unapproved template turning a working dunning email into a permanent delivery failure plus a staff task per member — and nothing else in the suite asserts it. Add the journey-runner suites to Step 8's gate, which an earlier draft omitted.

- [ ] **Step 6: Admin surface.** `lib/admin/template-registry-core.ts` exports actor-taking `approveTemplate(actor, key)`, `rejectTemplate(actor, key, reason)`, `disableTemplate(actor, key)`, `saveTemplatePreviews(actor, key, previews)`, each calling `requireAdmin` before the parse. `lib/admin/template-registry-actions.ts` is the `"use server"` module and exports **only** `(path, formData) => Promise<void>` wrappers that call `requireAdminActor()` themselves, catch `isAuthorizationDenial` → `notFound()`, and call `revalidateAdminPath(path)` — copy `lib/admin/profile-review-actions.ts`, not `task-actions.ts` (which does neither and is absent from the boundary list). Add `["whatsapp template", "lib/admin/template-registry-actions.ts"]` to the hand-maintained list in `tests/unit/admin-server-action-boundaries.test.ts`; that list is not self-discovering, so omitting it fails nothing and leaks the admin surface through an error.
  `app/[locale]/(admin)/admin/templates/page.tsx`: `import {requireAdminPageActor} from "@/lib/admin/page-auth";` on its own line, `requireAdminPageActor()` called, the string `requireAdminActor()` absent — `tests/unit/admin-page-auth-source.test.ts` discovers the file and asserts all three. Read with `.catch(() => null)` and render an explicit error, the way `/admin/profiles-review` distinguishes "nothing to review" from "we could not ask".

- [ ] **Step 7: Navigation, inventory, bundles.**
  - `config/internal-navigation.ts`: `{id: "templates", href: "/admin/templates"}` appended to the `operations` group.
  - `components/admin/admin-nav.tsx`: `templates: "navigation.templates"` in `linkLabelKeys` (a `satisfies Record<AdminNavLinkId, string>`, so a miss is a type error).
  - `config/wisetech-protected-route-inventory.ts`: `owner({id: "admin-templates", family: "admin", classification: "admin-page", routePath: "/admin/templates", filePath: "app/[locale]/(admin)/admin/templates/page.tsx", dataOwner: "WhatsApp template approval registry (Phase C2, C-7)."})`.
  - `tests/unit/internal-navigation-config.test.ts`: `toHaveLength(19)` → `20`, the `operations` `toEqual` array gains `"templates"` at the end, and the arithmetic comment gains a line (`Phase C2 Task 2 (C-7) added /admin/templates to operations: 19 + 1 = 20`). Update the count as the route lands, never by relaxing the assertion.
  - Strings — new `Admin.templates` namespace and `Admin.navigation.templates` in **both** bundles.
    en: `"templates": {"eyebrow": "WhatsApp delivery", "title": "WhatsApp templates", "description": "Only a template approved here can be sent. Approve a key once Meta has approved it in the WhatsApp Business account; anything else is skipped, not sent.", "columns": {"key": "Key", "elementName": "Template name", "language": "Language", "category": "Category", "variables": "Variables", "status": "Status", "approvedAt": "Approved"}, "status": {"pending": "Pending", "approved": "Approved", "rejected": "Rejected", "disabled": "Disabled"}, "category": {"marketing": "Marketing", "utility": "Utility", "authentication": "Authentication"}, "approve": "Approve", "reject": "Reject", "disable": "Disable", "rejectionReason": "Reason", "previewEn": "Preview (English)", "previewZhHk": "Preview (Traditional Chinese)", "savePreview": "Save previews", "empty": "The registry is empty. The approved-key environment variable is the fallback until a template is registered.", "error": "We could not load the template registry.", "goLive": "Nothing is sent on WhatsApp until at least one template is approved here."}`; `"navigation": {… "templates": "WhatsApp templates"}`.
    zh-HK: `"templates": {"eyebrow": "WhatsApp 發送", "title": "WhatsApp 範本", "description": "只有在此獲批准的範本才可發送。Meta 於 WhatsApp Business 帳戶批准後，方可在此批准該範本；其餘一律略過而非發送。", "columns": {"key": "識別碼", "elementName": "範本名稱", "language": "語言", "category": "類別", "variables": "變數", "status": "狀態", "approvedAt": "批准日期"}, "status": {"pending": "待批", "approved": "已批准", "rejected": "已拒絕", "disabled": "已停用"}, "category": {"marketing": "推廣", "utility": "通知", "authentication": "驗證"}, "approve": "批准", "reject": "拒絕", "disable": "停用", "rejectionReason": "原因", "previewEn": "預覽（英文）", "previewZhHk": "預覽（繁體中文）", "savePreview": "儲存預覽", "empty": "範本登記尚未有資料。在登記首個範本之前，以環境變數的已批准清單為準。", "error": "無法載入範本登記。", "goLive": "在此批准至少一個範本之前，WhatsApp 不會發出任何訊息。"}`; `"navigation": {… "templates": "WhatsApp 範本"}`.

- [ ] **Step 8: Gate** `npx vitest run tests/unit/whatsapp-template-registry.test.ts tests/unit/approved-templates.test.ts tests/unit/journey-runner.test.ts tests/unit/task7-lazy-admin-retry.test.ts tests/unit/task7-per-channel-retry-crash.test.ts tests/unit/task7-review-failures.test.ts tests/unit/task7-second-rereview.test.ts tests/unit/internal-navigation-config.test.ts tests/unit/admin-nav.test.tsx tests/unit/admin-page-auth-source.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/inbox-action-core.test.ts tests/unit/woztell-concierge.test.ts tests/unit/woztell-adapter.test.ts tests/unit/wisetech-protected-route-ownership.test.ts --reporter=dot && npx vitest run tests/integration/journey-delivery-idempotency.test.ts tests/integration/m3-acceptance.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`

- [ ] **Step 9: Commit** — `feat(admin): WhatsApp template registry at /admin/templates and a registry-backed approval gate (C-7)`

---

### Task 3: A second door on C1's eligibility module, and the consent-granted audit leg (C-8 part, boundary 11)

**Files:** `lib/db/repos/message-eligibility.ts` (**M — created by C1 Task 5**), `lib/db/repos/contacts.ts` (M), `lib/db/repos/deliveries.ts` (M).

> ### Read this before writing a line: **C1 created this module. This task modifies it.**
>
> An earlier draft of both plans marked `lib/db/repos/message-eligibility.ts` as **(C) create**, with incompatible exports and incompatible gates: C1's `whatsAppEligibility(actor: Actor, input)` behind `requireAdmin`, purpose-aware; this plan's `factsFor(actor, recipient)` behind `requireDeliveryActor`, purpose-free. C1 lands first. An implementer following the old text either **overwrote** C1's module — which silently removes the consent gate from `lib/admin/inbox-action-core.ts`, because `requireDeliveryActor` refuses an admin `Actor` — or bolted a second definition beside it and shipped two consent readers with different precedence for the same person.
>
> **The design, decided once (C1's S-9).** One private `loadRecipientFacts(database, recipient)`. Two public methods, two gates, deliberately:
>
> | Method | Actor | Gate | Caller |
> |---|---|---|---|
> | `whatsAppEligibility(actor: Actor, input)` | session `AdminActor` | `requireAdmin` | `lib/admin/inbox-action-core.ts` — an admin replying in the inbox |
> | `factsFor(actor: NotificationActor \| AutomationRepositoryActor, recipient)` | capability | `requireDeliveryActor` | the campaign runner, the dispatcher, the eligibility preview |
>
> Neither gate can be widened to cover the other without becoming forgeable: `requireDeliveryActor` is a capability check over a `unique symbol` (the shape `requireContactWriter` uses at `lib/db/repos/contacts.ts:25-30`), which no session actor can satisfy, and `requireAdmin` needs a `profileId` no capability actor has. **Add a test asserting each method refuses the other's actor before `loadDatabase` is called** — the shape `tests/unit/automation-repository-authorization.test.ts` already pins.
>
> `RecipientFacts` and `EligibilityRecipient` are **exported by C1**. Import them; do not re-declare them.
>
> Likewise `contactsRepository.markWhatsAppOptedOut` and the `upsertFromInterestForm` opt-out-revival guard are **C1 Task 5's**, and C1's versions are the ones to keep: C1's `UPDATE` is guarded on `whatsapp_opt_in = true` and returns `"revoked" | "already_revoked"`. That guard is not fussiness — C1 Task 4 Step 7 makes the webhook 500 on any throw, so **retries are routine**, and an unguarded `UPDATE` writes one `consent.whatsapp.revoked` row per retry of a single withdrawal. This task adds **only** the `consent.whatsapp.granted` leg, which C1 does not write.

Today "opted in" and "suppressed" have four incompatible definitions: `email_log.status='suppressed'` (dead — nothing writes it), `message_suppressions` channel `email` (live, read in two queries), `message_suppressions` channel `whatsapp` (**written by `optOutWhatsApp` and read by nothing**), and `contacts.whatsapp_opt_in`. A member is stopped on WhatsApp today only because `optOutWhatsApp` clears `profiles.whatsapp_opt_in` in the same transaction; re-opt-in from any path would resurrect them.

- [ ] **Step 1: Failing tests** — **append to** `tests/unit/message-eligibility.test.ts`, which C1 Task 5 created. Merge the imports; do not create a second file, and do not rewrite C1's `whatsAppEligibility` cases:
  - a member with a `message_suppressions` row on channel `whatsapp` has `whatsappSuppressed: true` even when `profiles.whatsapp_opt_in` is `true` (the resurrection case);
  - a contact with `whatsapp_opted_out_at` set comes back with `whatsappOptedOutAt` non-null **and** `whatsappSuppressed: false` — the two facts stay **separate** in `RecipientFacts`, and Task 8's classifier is what folds them for a marketing send. Folding them here is what would make the inbox call someone `OPTED_OUT` while the campaign preview calls them `suppressed`;
  - `factsFor` refuses a member, an admin and an anonymous actor before `loadDatabase` is called;
  - **`whatsAppEligibility` refuses a `notificationActor("campaign")`**, and `factsFor` refuses an admin `Actor` — the two-door assertion;
  - `upsertFromInterestForm` writes `consent.whatsapp.granted` when consent is **newly** granted, and writes nothing when the contact was already opted in.

- [ ] **Step 2: Run** → FAIL. **Read the failure carefully.** An earlier draft predicted "FAIL (four of the five are current behaviour)", which was true only if C1 Task 5 had never run. If instead the run is *green* for the consent cases, that is correct and expected: C1 closed them. Green there and red on `factsFor` is the shape you want. Red with "module not found" means C1 has not landed — stop, exactly as Task 1 Step 0 says.

- [ ] **Step 3: `lib/db/repos/message-eligibility.ts` — append `factsFor`.**

```ts
// C1 exports these. Import, do not re-declare.
import type {EligibilityRecipient, RecipientFacts} from "@/lib/db/repos/message-eligibility";

export function createMessageEligibilityRepository(loadDatabase?: AutomationDatabaseLoader): {
  whatsAppEligibility(actor: Actor, input: unknown): Promise<WhatsAppEligibility>;   // C1
  factsFor(actor: NotificationActor | AutomationRepositoryActor, recipient: EligibilityRecipient): Promise<RecipientFacts | null>;  // this task
};
```
  `factsFor` is `requireDeliveryActor(actor)` → parse → `loadRecipientFacts(database, recipient)` — **the same private loader `whatsAppEligibility` uses**. If C1's loader does not yet project a field this plan needs, widen the loader; do not add a second query.
  Member query: `profiles` LEFT JOIN the most recent `memberships`, with two `EXISTS (SELECT 1 FROM message_suppressions …)` sub-selects, one per channel, **written with explicit parentheses in a raw `sql` fragment**. Do not reach for Drizzle's `exists()` helper: it is literally ``sql`exists ${subquery}` `` and only parenthesises a `Subquery` object, so a raw fragment renders `… and exists SELECT 1 FROM …` — a syntax error that made every member-scoped repository call throw for months (AGENTS.md, Phase B2). Contact query: `contacts` with `marketingConsent: false`, `emailSuppressed: false`, `whatsappSuppressed: false` and `whatsappOptedOutAt` carried through as itself.
  Add the new predicates to `tests/unit/repository-exists-scope-sql.test.ts`. **C1 Task 3 and Task 5 have already added cases to that file — merge, do not replace.** (The two plans repeat this `exists()` warning almost verbatim; that is deliberate, because it is the one mistake whose text-level assertions all pass.)

- [ ] **Step 4: `notificationActor` and `requireDeliveryActor`** in `lib/db/repos/deliveries.ts`, mirroring `requireSuppressionActor` in `suppressions.ts`:

```ts
const notificationCapability: unique symbol = Symbol("notification-capability");
export type NotificationSource = "guest-rsvp" | "event-review" | "event-reminder" | "campaign" | "inbox" | "showcase-lead";
export type NotificationActor = Readonly<{kind: "notification"; userId: null; source: NotificationSource; [notificationCapability]: true}>;
export function notificationActor(source: NotificationSource): NotificationActor;
function requireDeliveryActor(actor: AutomationRepositoryActor | NotificationActor): void; // capability, else requireAutomationSystem
```
  All six delivery methods swap `requireAutomationSystem` for `requireDeliveryActor`. **Do not widen `requireAutomationSystem` itself**: `tests/unit/automation-repository-authorization.test.ts` asserts member/admin/anonymous get FORBIDDEN *and* that `loadDatabase` was never called, and those assertions stay true — none of those actors can mint the symbol. `reserveEmail`/`reserveWhatsapp` gain an optional `contactId: string | null` on their input, written to the new column.

- [ ] **Step 5: The `granted` leg only — the `revoked` leg is C1's.** In `lib/db/repos/contacts.ts`:
  - `markWhatsAppOptedOut`: **do not touch it.** C1 Task 5 Step 3 already made it transactional, guarded on `whatsapp_opt_in = true`, returning `"revoked" | "already_revoked"`, writing `consent.whatsapp.revoked` with `target_type: 'contact'`. Verify that shape is present; if it is not, C1 has not landed and Task 1 Step 0 should already have stopped you. An earlier draft of this step re-specified the method with different SQL and **no guard**, which would have written one audit row per webhook retry of the same STOP.
  - `upsertFromInterestForm`: C1 Task 5 Step 4 already changed the opt-in merge to `whatsapp_opt_in = CASE WHEN contacts.whatsapp_opted_out_at IS NOT NULL THEN false ELSE EXCLUDED.whatsapp_opt_in OR contacts.whatsapp_opt_in END`. Keep C1's form — it is equivalent to the `… AND contacts.whatsapp_opted_out_at IS NULL` an earlier draft here proposed, and re-expressing it for no reason produces a diff a reviewer has to think about. **What this task adds** is the other half: when the upsert results in consent **newly** granted (it was false or the row is new, and it is now true), insert `consent.whatsapp.granted`, `target_type: 'contact'`, in the same transaction — which means wrapping the upsert in one, since C1's version is a single statement. Return the prior `whatsapp_opt_in` from the `RETURNING` clause to decide "newly".
  - `consent.whatsapp.granted` exists nowhere in the tree today; a repo-wide grep returns zero hits. Say so in the commit body, and note that this closes half of C1's **O-4** — the prospect re-consent *flow* is still unbuilt, but a grant that does happen is now audited.

- [ ] **Step 6: Gate** `npx vitest run tests/unit/message-eligibility.test.ts tests/unit/contacts-repository.test.ts tests/unit/automation-repository-authorization.test.ts tests/unit/repository-exists-scope-sql.test.ts tests/unit/delivery-retry-idempotency.test.ts --reporter=dot && npm run typecheck && npm run lint`

- [ ] **Step 7: Commit** — `feat(consent): one suppression read across profiles and contacts, and audit every contact consent change (C-8, D-7)`

---

### Task 4: Contacts pipeline at `/admin/contacts` (C-4)

`contacts` is well-modelled and almost entirely unwritten: nothing sets `profile_id`, `company_id`, `stage` beyond its `new` default, `owner_profile_id` or `tags`, and the repository has three write methods and no read at all. This task adds the read surface and the stage/owner writes.

**Files:** `lib/db/repos/contacts.ts` (M), `lib/admin/contacts.ts` (C), `lib/admin/contact-action-core.ts` (C), `lib/admin/contact-actions.ts` (C), `components/admin/contact-pipeline-table.tsx` (C), `app/[locale]/(admin)/admin/contacts/page.tsx` (C), nav/inventory/bundles.

- [ ] **Step 1: Failing tests** — `tests/unit/contacts-admin-repository.test.ts`: `list` refuses a member actor before the database loads; a bad `stage` filter throws a `ZodError` before the database loads; the list groups duplicate rows sharing an email into one group with a `duplicateCount` (an interest-form contact with no phone has no conflict target on email **by design**, so duplicates are expected, not a bug); `updatePipeline` writes `contact.pipeline_updated` in the same transaction as the update.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Repository additions** (same file, `requireAdmin` gate — do **not** extend `requireContactWriter` to cover staff, and do not add a permissive branch: boundary 10):

```ts
export type ContactListFilters = Readonly<{
  stage: readonly ContactStage[]; source: readonly ContactSource[];
  ownerProfileId: string | null; q: string; optIn: boolean | null; limit: number; cursor: string | null;
}>;
export type ContactRow = Readonly<{
  id: string; displayName: string | null; email: string | null; phoneE164: string | null;
  stage: ContactStage; source: ContactSource; ownerProfileId: string | null; ownerName: string | null;
  profileId: string | null; companyId: string | null; tags: readonly string[];
  whatsappOptIn: boolean; whatsappOptedOutAt: Date | null; lastInboundAt: Date | null;
  conversationId: string | null; duplicateCount: number; createdAt: Date;
}>;
list(actor: Actor, filters: unknown): Promise<Readonly<{items: readonly ContactRow[]; nextCursor: string | null; total: number}>>;
get(actor: Actor, id: unknown): Promise<ContactRow | null>;
updatePipeline(actor: Actor, id: unknown, input: unknown): Promise<ContactRow>;   // {stage?, ownerProfileId?, tags?}
```
  `conversationId` comes from a correlated `SELECT id FROM conversations WHERE contact_id = contacts.id ORDER BY last_message_at DESC LIMIT 1` — `conversations.contact_id`, which C1's 0031 adds as a **nullable link, not an owner arm** (C1's S-3 keeps `conversations_owner_check` two-armed, because spec D-6 pins the HMAC as the owner key). Read that column; do not reach for the owner columns. `duplicateCount` is `count(*) OVER (PARTITION BY lower(email))` where email is non-null.
  `updatePipelineSchema = z.object({stage: z.enum(CONTACT_STAGES).optional(), ownerProfileId: z.string().min(1).max(200).nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(20).optional()}).strict()`. Audit action **`contact.pipeline_updated`**, `target_type: 'contact'`, metadata the changed fields only.

- [ ] **Step 4: Domain + actions.** `lib/admin/contacts.ts` is the thin domain layer (`listContacts(actor, input)`, `getContact(actor, id)`), shaped like `lib/admin/inbox.ts`. `lib/admin/contact-action-core.ts` holds the actor-taking `updateContactPipeline(actor, id, formData-derived input)`; `lib/admin/contact-actions.ts` is the `"use server"` module exporting only `updateContactPipelineAction(path, formData)` and `linkContactToProfileAction(path, formData)`, each resolving the actor itself, catching `isAuthorizationDenial` → `notFound()`, and calling `revalidateAdminPath(path)`. Add `["contact", "lib/admin/contact-actions.ts"]` to `tests/unit/admin-server-action-boundaries.test.ts`.

- [ ] **Step 5: Page.** `app/[locale]/(admin)/admin/contacts/page.tsx` — the literal `requireAdminPageActor` import, a `<form method="get">` filter bar (stage, source, owner, opt-in, `q`) with URL state, `.catch(() => null)` → explicit error state, and per row: the stage/owner form, a **deep link to the thread** (`localizedPath(locale, \`/admin/inbox/${row.conversationId}\`)` — never a hand-built `/${locale}/…`), and a **convert-to-member link** to `localizedPath(locale, "/join?plan=community")` carrying no personal data in the query string. A contact already linked to a profile shows a link to `/admin/members/[id]` instead.

- [ ] **Step 6: Navigation, inventory, bundles.** `{id: "contacts", href: "/admin/contacts"}` after `inbox` in the `workspace` group; `contacts: "navigation.contacts"` in `linkLabelKeys`; an `admin-contacts` inventory entry; `internal-navigation-config.test.ts` count `20 → 21` with the workspace `toEqual` array becoming `["dashboard", "members", "at-risk", "inbox", "contacts", "tasks", "segments"]` and a comment line for the arithmetic.
  Strings — `Admin.contacts` and `Admin.navigation.contacts` in both bundles.
  en: `"contacts": {"eyebrow": "Prospect pipeline", "title": "Contacts", "description": "Everyone WTIA may need to reach who is not, or not yet, a member — WhatsApp senders, interest-form submitters, event guests and abandoned joins.", "columns": {"name": "Name", "stage": "Stage", "source": "Source", "owner": "Owner", "lastInbound": "Last message in", "optIn": "WhatsApp", "actions": "Actions"}, "stage": {"new": "New", "contacted": "Contacted", "qualified": "Qualified", "applied": "Applied", "member": "Member", "closed": "Closed"}, "source": {"whatsapp": "WhatsApp", "event_guest": "Event guest", "showcase_intro": "Showcase intro", "join_abandoned": "Abandoned join", "interest_form": "Interest form", "import": "Import"}, "optIn": {"yes": "Opted in", "no": "Not opted in", "stopped": "Stopped"}, "filters": {"stage": "Stage", "source": "Source", "owner": "Owner", "search": "Search name, email or number", "anyStage": "All stages", "anySource": "All sources", "anyOwner": "Anyone", "submit": "Filter", "clear": "Clear"}, "unassigned": "Unassigned", "assign": "Assign", "save": "Save", "openThread": "Open thread", "noThread": "No thread yet", "convert": "Invite to join", "linkedMember": "Member record", "duplicates": "{count} rows share this email", "empty": "No contacts match these filters.", "error": "We could not load the contacts pipeline.", "saved": "Contact updated."}`.
  zh-HK: `"contacts": {"eyebrow": "潛在客戶流程", "title": "潛在客戶", "description": "所有尚未成為會員但需要聯絡的人：WhatsApp 來訊者、留下興趣表格者、活動賓客，以及中途離開的入會申請。", "columns": {"name": "姓名", "stage": "階段", "source": "來源", "owner": "負責人", "lastInbound": "最後來訊", "optIn": "WhatsApp", "actions": "操作"}, "stage": {"new": "新增", "contacted": "已聯絡", "qualified": "已評估", "applied": "已申請", "member": "已入會", "closed": "已結束"}, "source": {"whatsapp": "WhatsApp", "event_guest": "活動賓客", "showcase_intro": "方案展示查詢", "join_abandoned": "未完成入會", "interest_form": "興趣表格", "import": "匯入"}, "optIn": {"yes": "已同意接收", "no": "未同意接收", "stopped": "已停止接收"}, "filters": {"stage": "階段", "source": "來源", "owner": "負責人", "search": "搜尋姓名、電郵或號碼", "anyStage": "所有階段", "anySource": "所有來源", "anyOwner": "任何人", "submit": "篩選", "clear": "清除"}, "unassigned": "未指派", "assign": "指派", "save": "儲存", "openThread": "開啟對話", "noThread": "尚無對話", "convert": "邀請入會", "linkedMember": "會員記錄", "duplicates": "有 {count} 筆記錄使用此電郵", "empty": "沒有符合條件的潛在客戶。", "error": "無法載入潛在客戶流程。", "saved": "已更新潛在客戶。"}`.

- [ ] **Step 7: Gate** `npx vitest run tests/unit/contacts-admin-repository.test.ts tests/unit/internal-navigation-config.test.ts tests/unit/admin-page-auth-source.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/locale-href-boundary.test.ts tests/unit/wisetech-protected-route-ownership.test.ts --reporter=dot && npm run audit:strings && npm run typecheck`

- [ ] **Step 8: Commit** — `feat(admin): contacts pipeline at /admin/contacts with thread deep links (C-4)`

---

### Task 5: Merge a contact into a profile, on write (C-4)

**This task also discharges C1's O-3**, which an earlier draft left stranded: C1 records the `whatsapp_member_id` hazard as an open question and assigns the fix to C-4; C-4 is this plan, and its Task 5 matched phone then email and never mentioned the column. Spec C-1's "resolve contact by Woztell member id **then** number" was therefore implemented nowhere. It is implemented here, in Step 3's precedence and Step 3b's correction rule.

- [ ] **Step 1: Failing tests** — `tests/unit/contact-profile-merge.test.ts`:
  - a profile whose normalised WhatsApp number matches one contact links **that** row and writes `contact.linked`;
  - **a `whatsappMemberId` that matches one contact links that row in preference to a phone match on a different row**, and `matchedBy` is `"member_id"`;
  - when a phone row and a *different* email row both match, only the phone row takes `profile_id`, the email row gains the `merge-candidate` tag, and a `contact_merge_candidate` staff task is created once (deduped by `dedupeKey`);
  - a second call is a no-op and writes no second audit row (`contacts_profile_unique` is a partial unique index, so at most one contact per profile — the second claim must not raise 23505 into the caller);
  - `reconcileWhatsAppMemberId` moves a member id from a stale row to the row that now owns the number, writes `contact.member_id_reassigned`, and **never** raises 23505 into the caller (Step 3b);
  - the caller's promise resolves even when the merge throws.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Repository.** `contactsRepository.linkProfile(actor: ContactWriterActor, input: {profileId: string; email: string | null; phoneE164: string | null; whatsappMemberId?: string | null}): Promise<Readonly<{linked: string | null; matchedBy: "member_id" | "phone" | "email" | null; candidates: readonly string[]}>>`, in one transaction. **Precedence is member id → phone → email**, which is the order spec C-1 asks for and the order neither plan implemented until now:
  1. `SELECT id FROM contacts WHERE whatsapp_member_id = $memberId FOR UPDATE` — first, because it is the provider's own stable identity and survives a number change;
  2. else `SELECT id FROM contacts WHERE phone_e164 = $phone FOR UPDATE` (phone already normalised by `normalizeWhatsAppNumber`; a value that does not normalise is skipped, not guessed — `+90000000` and `+85290000000` are different identities and nothing in the tree validates a country code);
  3. else `SELECT id FROM contacts WHERE lower(email) = lower($email) AND profile_id IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE`;
  4. `UPDATE contacts SET profile_id = $profileId, stage = CASE WHEN stage IN ('new','contacted','qualified','applied') THEN 'member' ELSE stage END, updated_at = now() WHERE id = $id AND profile_id IS NULL RETURNING id`;
  5. every other row matching the same email or phone gets `tags = array_append(tags, 'merge-candidate')` when it is not already present, and its id is returned in `candidates`;
  6. one `audit_events` row, action **`contact.linked`**, `target_type: 'contact'`, metadata `{profileId, matchedBy, candidates: n}`.
  The caller files the staff task (`kind: "contact_merge_candidate"`, `dedupeKey: \`contact-merge:${profileId}\``) so the repository stays a single-table writer. **File it with a direct `INSERT INTO staff_tasks … ON CONFLICT DO NOTHING`, the shape `lib/db/repos/campaign-recipient-delivery.ts:255` uses** — not `agentToolsRepository.createStaffTask`, whose `kind` is a closed `z.enum` of five `concierge_*` values behind `requireConciergeAgent`, and not `staffTasksRepository.createOnce`, which throws `AUTOMATION_STAFF_TASK_PROFILE_REQUIRED` on a null profile. C1's **S-13** works this through; read it once and apply it in Task 10 Step 5 too.

- [ ] **Step 3b: `reconcileWhatsAppMemberId` — the correction rule C1 could not write.** C1 Task 4 Step 6 writes `contacts.whatsapp_member_id` only when the id is **free**, through a guarded `UPDATE … WHERE whatsapp_member_id IS NULL AND NOT EXISTS (…)` wrapped in a `try`/`catch` that swallows 23505 and files an `inbox_member_id_conflict` staff task. That is deliberately conservative: `upsertFromWhatsApp` conflicts on `phone_e164` only, while `contacts_whatsapp_member_unique` (`lib/db/schema-core.ts:1134`) is a **separate** partial unique index and not the conflict target, so an unguarded write raises 23505 → C1's 500 → an infinite Woztell retry for that sender. The consequence is that a member id which lands on the wrong row can never be corrected — C1's O-3.

  Add, in the same transaction discipline:

```ts
reconcileWhatsAppMemberId(actor: ContactWriterActor, input: Readonly<{
  whatsappMemberId: string;
  phoneE164: string;              // the number the id arrived with, normalised
}>): Promise<Readonly<{disposition: "unchanged" | "assigned" | "reassigned" | "conflict"}>>;
```

  1. `SELECT id, phone_e164 FROM contacts WHERE whatsapp_member_id = $memberId FOR UPDATE` — the current holder, if any;
  2. `SELECT id FROM contacts WHERE phone_e164 = $phone FOR UPDATE` — the row the number now belongs to;
  3. same row → `"unchanged"`; no holder → `UPDATE … SET whatsapp_member_id = $memberId` on the phone row → `"assigned"`;
  4. **different rows** → clear it from the holder and set it on the phone row, **both statements in one transaction so the partial unique index is never momentarily violated**, then one `audit_events` row `contact.member_id_reassigned` with `{from, to, whatsappMemberId}` → `"reassigned"`. The number is the stronger evidence: a member id follows a WhatsApp account, and the account that is messaging us now is the one we must be able to reply to;
  5. no phone row at all → `"conflict"`, write nothing, and let the caller file the staff task. Guessing here is how two people's threads merge.

  Called from `/admin/contacts` (Task 4's row actions) and, once this has landed, safe to call from the webhook path. **Do not** call it from C1's `recordContact` before this task lands: C1's guarded write is what keeps the 500 out of the webhook until the correction rule exists.

- [ ] **Step 4: Call sites.** In `lib/portal/command-core.ts::updateProfile`, after the profile write:
```ts
// Programme C-4. The spec says "merge on login"; `getActor()` calls
// touchLastLogin on *every* authenticated request, so a session hook would put
// a two-table lookup on every page render. The identity we match on only
// changes when it is written, so the merge runs here and in the join profile
// step instead (S-16). Fire-and-forget for the same reason the guest-RSVP
// contact write is: a failed merge must not undo a saved profile.
void dependencies.contacts.linkProfile(contactWriterActor("import"), {profileId: actor.profileId, email: result.email, phoneE164: normalizeWhatsAppNumber(result.whatsappNumber ?? "")}).catch(() => undefined);
```
  The same call goes in the join profile action after `profilesRepository.ensure`/`update`. Add `contacts` to `PortalCommandDependencies` with the default binding so tests can inject.

- [ ] **Step 5: Gate** `npx vitest run tests/unit/contact-profile-merge.test.ts tests/unit/portal-commands.test.ts tests/unit/join-actions.test.ts --reporter=dot && npm run typecheck`

- [ ] **Step 6: Commit** — `feat(contacts): link a contact to its member profile when the matching identity is written (C-4)`

---

### Task 6: Segment filter v2 — schema and version dispatch (C-6, part 1)

Nothing may write `filter_version: 2` until every reader dispatches. This task changes only readers.

**Files:** `lib/admin/segment-schema.ts`, `lib/db/repos/segments.ts`, `lib/db/repos/campaigns.ts`.

- [ ] **Step 1: Failing tests** — `tests/unit/segment-filter-version.test.ts`: a stored v1 object parses under `parseSegmentFilter(1, …)` and comes back with the six v2 keys at their defaults; a v2 object parses under `parseSegmentFilter(2, …)`; a v1 object carrying an unknown key still throws (`.strict()` is the point); `parseSegmentFilter(3, …)` throws `UNSUPPORTED_SEGMENT_FILTER_VERSION`; and the existing `tests/unit/segment-schema.test.ts` `toEqual` fixtures are updated to the v2 shape in the same commit rather than relaxed.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Schema.** In `lib/admin/segment-schema.ts`:

```ts
export const SEGMENT_FILTER_VERSION = 2;
export const segmentFilterV1Schema = /* today's object, unchanged, still .strict() */;
export const segmentFilterV2Schema = segmentFilterV1Schema.extend({
  industryTags: z.array(z.string().trim().min(1).max(40)).max(24).default([]).refine((tags) => tags.every(isIndustryTag), "UNKNOWN_INDUSTRY_TAG"),
  companyPlan: z.array(z.enum(MEMBERSHIP_PLAN_CODES)).max(4).default([]),
  event: z.object({
    eventId: z.string().uuid(),
    state: z.enum(["registered", "waitlist", "attended", "cancelled", "not_registered"]),
  }).strict().nullable().default(null),
  audience: z.enum(["members", "contacts", "both"]).default("members"),
  contactStage: z.array(z.enum(CONTACT_STAGES)).max(6).default([]),
  contactSource: z.array(z.enum(CONTACT_SOURCES)).max(6).default([]),
}).strict();
export type SegmentFilterSet = z.infer<typeof segmentFilterV2Schema>;
export function parseSegmentFilter(filterVersion: number, value: unknown): SegmentFilterSet;
```
  `segmentFilterSchema` keeps its name as an alias of the v2 schema so unrelated imports do not churn. `event.state` deliberately omits `no_show`: it exists on `registration_status` and not on `guest_registration_status`, and a state that means different things per audience is a filter that lies (S-10).
  `segmentRouteQuerySchema` — also `.strict()`, so an unknown URL key **throws on page render** rather than being ignored — gains `industryTag` (list), `companyPlan` (list), `eventId`, `eventState`, `audience`, `contactStage` (list), `contactSource` (list). The composite `event` key arrives as **two flat params**, because `queryListSchema` handles only strings and arrays of strings.

- [ ] **Step 4: Dispatch at every read site**, all four of them: `segments.ts::toSavedSegment` (every row of the `/admin/segments` list), `segments.ts::get`, `campaigns.ts::savedSegmentForActor`, `campaigns.ts::membersForSegment`. Each becomes `parseSegmentFilter(record.filterVersion, record.filters)`. `saveSegment` still writes `filterVersion: 1` **after this task** — Task 7 bumps it.

- [ ] **Step 5: Gate** `npx vitest run tests/unit/segment-filter-version.test.ts tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts tests/unit/campaign-repository-boundary.test.ts --reporter=dot && npm run typecheck`

- [ ] **Step 6: Commit** — `feat(segments): version-dispatch saved segment filters before any v2 row exists (C-6)`

---

### Task 7: Segment v2 — contacts audience, event state, industry tags, preset (C-6, part 2)

**Files:** `lib/db/repos/segments.ts`, `lib/admin/segments.ts`, `lib/admin/csv.ts`, `components/admin/segment-builder.tsx`, `components/admin/segment-results.tsx`, `app/api/admin/segments/[id]/export/route.ts`, bundles.

- [ ] **Step 1: Failing tests** — extend `tests/unit/segment-query.test.ts` (which compiles predicates through `new PgDialect().sqlToQuery`) plus a new case in `tests/unit/repository-exists-scope-sql.test.ts` driving the two new `EXISTS` predicates through the proxy driver and requiring balanced parentheses. Assert: `industryTags` compiles to `companies.tags @> ARRAY[…]` and **not** to the `companies.industry ILIKE` term that `sector` owns; `event.state = "not_registered"` compiles to a `NOT EXISTS ( SELECT 1 FROM "event_registrations" … )` with parentheses; `audience: "contacts"` produces a query whose only base table is `contacts`; the cursor predicate is wrapped in its own parentheses.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Predicates split.** `segmentPredicates(filter)` becomes `memberPredicates(filter)` (today's nine terms plus `industryTags`, `companyPlan`, `event`) and `contactPredicates(filter)` (`contactStage`, `contactSource`, `whatsappOptIn`, `event` against `event_guest_registrations`). New terms:
  - `industryTags`: `sql\`${companies.tags} @> ARRAY[${sql.join(...)}]::text[]\`` against the closed 24-slug vocabulary in `config/industry-tags.ts`. `sector` stays exactly as it is — a different column with different semantics; label them distinctly in the bundles so nobody edits one meaning the other.
  - `companyPlan`: `memberships.plan_code IN (…) AND memberships.company_id IS NOT NULL`, which is what makes it distinguishable from `tier`.
  - `event`: an explicitly parenthesised `EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = $id AND r.profile_id = profiles.id AND r.status = $state)`, and for `not_registered` a `NOT EXISTS (…) AND r.status IN ('registered','waitlist','attended')` form. Contacts side uses `event_guest_registrations g … g.contact_id = contacts.id`.
  - `renewalWithinDays` and `lastLoginBeforeDays` currently call `new Date()`/`Date.now()` **inside** the predicate builder, and `preview` builds the query once but executes it twice, so `total` and the page can disagree and CSV pages can drift as the window slides. Thread a single `now: Date` through `projectedAudience(filter, now)` and snapshot it once per request. State in the comment that a campaign's recipient count is only stable because it is snapshotted onto `campaign_recipients`.

- [ ] **Step 4: Audience projection.** `projectedAudience(filter, now)` returns a `UNION ALL` of the member arm (today's CTE, plus `'member' AS kind`, `profiles.id AS id`) and the contact arm, each arm included only when `filter.audience` says so. Row type:
```ts
export type SegmentAudienceRow = Readonly<{
  kind: "member" | "contact"; id: string; displayName: string; email: string | null;
  companyName: string | null; planCode: string | null; membershipStatus: string | null;
  renewalAt: string | null; score: number | null;
  whatsappNumber: string | null; whatsappOptIn: boolean; contactStage: string | null; contactSource: string | null;
}>;
```
  `SegmentMember` is retired in favour of this; `SegmentPreview.items` carries it. Cursor: `{sortKey, kind, id}`, predicate
```sql
(lower("sortKey") > $1 OR (lower("sortKey") = $1 AND ("kind", "id") > ($2, $3)))
```
  — the outer parentheses matter: today's bare `OR` is safe only because it is the sole `WHERE` term, and this task adds a second.

- [ ] **Step 5: CSV and UI.** `encodeMemberCsv` → `encodeAudienceCsv`, header `kind,id,displayName,email,companyName,planCode,membershipStatus,renewalAt,score,whatsappNumber,whatsappOptIn,contactStage,contactSource`, keeping `neutralizeFormula` and the BOM. Update its test's expected header. `components/admin/segment-builder.tsx` (a plain server-rendered `<form method="get">`, so no client boundary is added) gains the six controls; `segment-results.tsx` gains a `kind` column. The **one-click preset** is a `<Link>` built with `localizedPath(locale, "/admin/segments")` plus `?eventId=<uuid>&eventState=not_registered&audience=members`, rendered once per published upcoming event.

- [ ] **Step 6: Bump the writer** — `segments.ts::saveSegment` writes `filterVersion: SEGMENT_FILTER_VERSION`. Only now, and only because Task 6 landed.

- [ ] **Step 7: Strings.** `Admin.segments` gains, en: `"industryTags": "Industry tags", "anyTag": "All industries", "companyPlan": "Company plan", "event": "Event", "eventState": "Registration state", "eventStates": {"registered": "Registered", "waitlist": "Waitlisted", "attended": "Attended", "cancelled": "Cancelled", "not_registered": "Not registered"}, "audience": "Audience", "audiences": {"members": "Members", "contacts": "Contacts", "both": "Members and contacts"}, "contactStage": "Contact stage", "contactSource": "Contact source", "presetNotRegistered": "Members not yet registered for {event}", "kind": "Type", "kindMember": "Member", "kindContact": "Contact"`; zh-HK: `"industryTags": "行業標籤", "anyTag": "所有行業", "companyPlan": "公司會籍", "event": "活動", "eventState": "報名狀態", "eventStates": {"registered": "已報名", "waitlist": "候補", "attended": "已出席", "cancelled": "已取消", "not_registered": "未報名"}, "audience": "對象", "audiences": {"members": "會員", "contacts": "潛在客戶", "both": "會員及潛在客戶"}, "contactStage": "潛在客戶階段", "contactSource": "潛在客戶來源", "presetNotRegistered": "尚未報名「{event}」的會員", "kind": "類別", "kindMember": "會員", "kindContact": "潛在客戶"`.

- [ ] **Step 8: Gate** `npx vitest run tests/unit/segment-query.test.ts tests/unit/segment-schema.test.ts tests/unit/repository-exists-scope-sql.test.ts tests/unit/csv.test.ts tests/unit/segment-filter-version.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npm run lint`

- [ ] **Step 9: Commit** — `feat(segments): segment v2 with contacts, event state, industry tags and a not-registered preset (C-6)`

---

### Task 8: Eligibility classifier and campaign writes (C-5, part 1)

**Files:** `lib/admin/campaign-eligibility.ts` (C), `lib/db/repos/campaigns.ts` (M), `lib/admin/campaigns.ts` (M).

- [ ] **Step 1: Failing tests** — `tests/unit/campaign-eligibility.test.ts` (pure, no database): the precedence `suppressed > not_opted_in > no_number > plan_ineligible > eligible` for `whatsapp`, and `suppressed > not_opted_in > no_email > plan_ineligible > eligible` for `email`; a WhatsApp-suppressed member whose `whatsappOptIn` is still `true` is `suppressed`; a contact is never `plan_ineligible`; an `expired` membership is `plan_ineligible` while `past_due` is `eligible` (a member in dunning is exactly who a dunning campaign is for). Plus `tests/unit/campaign-review-boundary.test.ts`: `reviewableCampaign` refuses the **creator** and refuses a member actor, and `ownedCampaign`'s existing refusals are unchanged (`tests/unit/campaign-repository-boundary.test.ts` must stay green as written).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: The classifier** — `lib/admin/campaign-eligibility.ts`, pure and dependency-free:

```ts
import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";   // C1's type. Do not re-declare.

export type CampaignChannel = "email" | "whatsapp";
export type EligibilityCategory = "eligible" | "no_email" | "no_number" | "not_opted_in" | "suppressed" | "plan_ineligible";
export const ELIGIBILITY_CATEGORIES: readonly EligibilityCategory[];
export function classifyRecipient(facts: RecipientFacts, channel: CampaignChannel): EligibilityCategory;
```
  `plan_ineligible` is defined here, once, and the definition is narrower than the spec's label: a **member** whose `membershipStatus` is not one of `active｜past_due｜cancel_at_period_end`. A contact never reaches it. Say so in the comment so nobody looks for a plan-tier gate that does not exist.

  **`suppressed` here and `opted_out` in the inbox must describe the same population, and the comment must say why they are spelled differently.** A campaign is always a marketing send, so this classifier has no `purpose` parameter and no `opted_out` category; it folds `whatsappOptedOutAt !== null || whatsappSuppressed` into `suppressed`. C1's `whatsAppEligibility` keeps them apart because it *does* have a purpose: `opted_out` blocks a service reply and `suppressed` does not. Write the mapping out as a table in the comment and pin it with a test:

| `RecipientFacts` | `whatsAppEligibility(purpose:"service")` | `whatsAppEligibility(purpose:"marketing")` | `classifyRecipient(…, "whatsapp")` |
|---|---|---|---|
| `whatsappOptedOutAt` set | `blocked/opted_out` | `blocked/opted_out` | `suppressed` |
| `whatsappSuppressed` | *eligible* | `blocked/suppressed` | `suppressed` |
| `whatsappOptIn === false` | *eligible* | `blocked/not_opted_in` | `not_opted_in` |

  Read down the marketing column and the campaign column: **the same partition, different names**. That is the property to assert — `for (const facts of samples) expect(isBlocked(whatsAppEligibility(facts, "marketing"))).toBe(classifyRecipient(facts, "whatsapp") !== "eligible")` — because the failure it prevents is subtle and infuriating: the same person reading `OPTED_OUT` in the inbox and `suppressed` in the campaign preview, with staff unable to tell whether those are one problem or two.

- [ ] **Step 4: Audience v2.** `campaignAudience(store, filter, channel, now)` in `lib/db/repos/campaigns.ts` is rewritten to project the full `RecipientFacts` shape for both arms — replacing the `EXISTS(… email_log.status = 'suppressed')` predicate, which is dead code that has always returned `false` because `DeliveryStatus` is `processing｜sent｜failed` and no writer ever writes `'suppressed'` to that column. Real suppression comes from `message_suppressions` per channel and `contacts.whatsapp_opted_out_at`. `membersForSegment` → `audienceForSegment`.

- [ ] **Step 5: Campaign writes.**
  - `createCampaign` accepts `{name, channel, template, templateKey, variablesTemplate, segmentId, idempotencyKey, localeStrategy}` and writes `status: 'draft'` from the wizard (the `/admin/segments` shortcut keeps writing `queued` and `channel: 'email'`).
  - `insertRecipients` snapshots **every** audience row, not only the eligible ones: eligible rows land `status: 'queued'`; ineligible rows land `status: 'suppressed'` with `blocked_reason` set to the category. `campaignRecipientSchema` becomes a discriminated union — `{profileId, email, …}` or `{contactId, whatsappNumber, …}` — with `.strict()` on both arms, and a superRefine requiring exactly one identity so the Zod parse and `campaign_recipients_identity_check` agree.
  - **`insertRecipients` must say what it writes into `campaign_recipients.variables`, per arm, because that column is `jsonb NOT NULL` (`lib/db/schema-core.ts:651`) and Task 10 reads it to build the WhatsApp body.** Today the caller supplies it (`lib/admin/campaigns.ts:59`: `{displayName, ...(renewalAt ? {renewalDate} : {})}`). From now on the repository resolves it:

```ts
resolveRecipientVariables(
  template: {variables: readonly string[]},
  variablesTemplate: Readonly<Record<string, string>>,   // campaigns.variables_template, Task 9
  facts: RecipientFacts,
): Readonly<{ok: true; variables: Record<string, string>} | {ok: false; missing: readonly string[]}>;
```

    Each entry in `variablesTemplate` is either a literal or one of a **closed** token set — `{{displayName}}`, `{{firstName}}`, `{{renewalDate}}`, `{{planCode}}`, `{{email}}` — substituted from `facts`. A required template variable that resolves to an empty string makes the row `status:'suppressed'`, `blocked_reason:'missing_variable'`, **not** a send.
    - **email arm:** keeps today's shape (`displayName`, `renewalDate`) so the existing runner and `campaign_generic` are unaffected.
    - **whatsapp arm:** every key in the `whatsapp_templates` row's `variables` array, in that array's order.

    **Why this is a blocking gap and not polish.** `lib/channels/woztell.ts:261-271` builds the body as `template.variables.map((key) => ({type: "text", text: input.variables[key] ?? ""}))`, and every seeded template needs two to four parameters (`wtia_renewal_d14`: `memberName`, `renewalDate`, `renewalUrl`). With `variables_template` written by nothing and `campaign_recipients.variables` unspecified for the WhatsApp arm, the §6 gate — "a reviewed template blast to a segment of 20 opted-in members sends" — sends `wtia_renewal_d14` with **three empty BODY parameters to twenty people**. Meta rejects empty parameters, the adapter maps the 4xx to `provider_client_error`, and S-15 makes that terminal: twenty permanent failures and twenty staff tasks, from a campaign whose eligibility preview said `eligible`. The gap is invisible in review because both columns exist and the schema looks complete.
    `missing_variable` joins the report's blocked-reason labels in both bundles (Task 9). It is **not** an `EligibilityCategory` — `classifyRecipient` stays pure over `RecipientFacts` and knows nothing about templates.
  - **`insertRecipients` gains `ON CONFLICT DO NOTHING`.** It is a plain `db.insert(...).values(...)` today (`lib/db/repos/campaigns.ts:174-179`) while `createCampaign` directly above it *is* idempotent on `idempotencyKey` and returns `disposition:"existing"`. A re-entered wizard final step, or a retried snapshot, therefore raises 23505 against the new partial unique indexes and surfaces as a 500 on "Create draft". Use the **bare, targetless** `ON CONFLICT DO NOTHING`: it covers every constraint on the table, so it needs no conflict target and therefore no verbatim repetition of each partial index's `WHERE` predicate — the trap C1 documents for `provider_message_id`. Return `{inserted, skipped}` and have the wizard show the existing draft rather than a new one.
  - `appendAudit`'s metadata becomes `{eligible, blocked, byReason}` — `recipientCount` alone overstated the audience by exactly the number of rows the old dead `suppressed` flag failed to catch.
  - New: `reviewableCampaign(actor, store, campaignId)` — `requireAdmin`, then `WHERE campaigns.id = $id AND campaigns.created_by_profile_id <> $actor` — and `submitForReview`, `recordReview(decision)`, `schedule(scheduledAt)`, each writing `audit_events` in the same transaction with actions **`campaign.submitted_for_review`**, **`campaign.review.approved`** / **`campaign.review.rejected`**, **`campaign.scheduled`** (`target_type: 'campaign'`). `campaign.queued` and `campaign.drafted` complete the vocabulary.
  - `campaignReportFor(actor, store, campaignId)` — an admin read (not creator-scoped) grouping `campaign_recipients` by `status` and `blocked_reason`, served by the new `campaign_recipients_campaign_status_idx`.

- [ ] **Step 6: Gate** `npx vitest run tests/unit/campaign-eligibility.test.ts tests/unit/campaign-review-boundary.test.ts tests/unit/campaign-repository-boundary.test.ts tests/unit/campaign-no-delivery.test.ts --reporter=dot && npm run typecheck`
  `tests/unit/campaign-no-delivery.test.ts` forbids `fetch(` and a case-insensitive `/resend/i` anywhere in `lib/admin/campaigns.ts` and `lib/db/repos/campaigns.ts` — including in a comment. Keep every provider call in the runner and the dispatcher, and do not write the word "resend" in either file.

- [ ] **Step 7: Commit** — `feat(campaigns): eligibility classification, contact recipients and a two-person review accessor (C-5)`

---

### Task 9: `/admin/campaigns` — wizard, review, schedule, report (C-5, part 2)

**Files:** `lib/admin/campaign-wizard.ts`, `lib/admin/campaign-review-core.ts`, `lib/admin/campaign-review-actions.ts`, `components/admin/campaign-wizard.tsx`, `components/admin/campaign-report.tsx`, `app/[locale]/(admin)/admin/campaigns/page.tsx`, `app/[locale]/(admin)/admin/campaigns/[id]/page.tsx`, nav/inventory/bundles.

- [ ] **Step 1: Failing tests** — `tests/unit/campaign-wizard.test.ts` (the step schemas: a WhatsApp campaign with no `templateKey` is rejected before any write; a `scheduledAt` in the past is rejected; a template key not `approved` in the registry is rejected) and `tests/unit/wt-pages/campaigns-page.test.tsx` (mock the repository: the wizard renders the eligibility table; the detail page shows "you cannot review your own campaign" to the creator and the approve/reject controls to a different admin).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Wizard.** Server-rendered `<form method="get">` carrying step state in the URL, exactly as `/admin/segments` does — no new `'use client'` file (40 today, and the repo treats the count as a budget). Steps: **name → channel → template → variables → segment → eligibility preview → create draft**. The draft row is created only at the last step, so `campaigns.segment_id` stays `NOT NULL` and no nullable FK is introduced. The idempotency key is the existing `campaignDraft` UUID pattern (`resolveCampaignDraft`/`campaignDraftHref`), which already survives a double submit.
  Segment list comes from `segmentsRepository.list(actor)` — the creator's own segments; ownership is untouched, because the reviewer never reads them (S-7).

  **The `variables` step is new, and without it `campaigns.variables_template` is a column §6 asked for that nothing writes.** It renders one field per entry in the chosen `whatsapp_templates` row's `variables` array (for `email`, per the source template's known keys), each accepting a literal or one of the closed tokens `{{displayName}} {{firstName}} {{renewalDate}} {{planCode}} {{email}}`, with the token list shown beside the field. The field names are the template's own variable names, so the step is empty for a template with no variables and skips itself. `createCampaign` stores the map in `variables_template`; `insertRecipients` resolves it per recipient into `campaign_recipients.variables` (Task 8 Step 5); Task 10 reads **`campaign_recipients.variables`**, never the template. One resolution, at snapshot time, so a campaign sends what the preview promised even if a member's name changes mid-blast.
  The preview step shows, per category, the counts **including `missing_variable`** — a recipient whose template variable does not resolve is visible before the blast, not after twenty permanent failures.

- [ ] **Step 4: Detail page** `/admin/campaigns/[id]`: the campaign row, the eligibility counts by category from `campaignReportFor`, and the state controls — creator sees "Submit for review"; a **different** admin sees "Approve and schedule" (with a `datetime-local` input) and "Reject" with a reason. Once sending, the same page renders the report: sent / delivered / read / failed / blocked, and blocked broken down by `blocked_reason`.

  **`delivered` and `read` are real rows, not decoration — Task 10 Step 4b is what makes them tick.** A campaign send writes its provider id to `campaign_recipients.provider_message_id` and creates **no `messages` row at all**, while C1's `recordDeliveryStatus` is a single `UPDATE messages … WHERE provider_message_id = $id AND direction = 'outbound'`. So without the fall-through Task 10 adds, no delivery-status webhook can ever match a campaign recipient, and these two counters read permanently zero after a blast that in fact delivered — staff would reasonably conclude nothing arrived, and §6's "delivery ticks arrive" would be met for the human lane and silently unmet for the blast. If Task 10 Step 4b is ever cut, **cut these two rows and the two bundle strings with it and record why**; a zero that means "not implemented" is worse than an absent column.

  **Scheduling is offered for WhatsApp only, and the email arm says so.** See Task 10 Step 4c: promotion from `scheduled → queued` is wired for both channels there, but if for any reason the email promotion is not landed in the same commit, the approve step must **refuse a `scheduledAt` on `channel='email'`** and render `Admin.campaigns.scheduleUnavailable`, rather than accepting a schedule that never fires. An email campaign stuck in `scheduled` forever produces no error anywhere — the list simply shows "Scheduled" indefinitely — which is the worst available failure mode: silent, permanent, and indistinguishable from waiting.

- [ ] **Step 5: Actions.** `lib/admin/campaign-review-actions.ts` is `"use server"` and exports only `(path, formData)` wrappers; the actor-taking cores live in `campaign-review-core.ts`. Add `["campaign review", "lib/admin/campaign-review-actions.ts"]` to `tests/unit/admin-server-action-boundaries.test.ts`.

- [ ] **Step 6: Navigation, inventory, bundles.** `{id: "campaigns", href: "/admin/campaigns"}` after `segments` in `workspace`; `campaigns: "navigation.campaigns"`; inventory entries for `admin-campaigns` **and** `admin-campaign-detail`; `internal-navigation-config.test.ts` `21 → 22`, workspace array `["dashboard", "members", "at-risk", "inbox", "contacts", "tasks", "segments", "campaigns"]`, with the arithmetic comment. `tests/unit/admin-nav.test.tsx`'s "groups all 19 nav links" title is updated to 22 (it uses `arrayContaining` and will not itself fail, which is exactly why it needs the edit).
  Strings — new `Admin.campaigns` namespace in both bundles. The nine campaign keys currently sitting inside `Admin.segments` (`queue`, `template`, `templateRenewal`, `templateUpdate`, `queued`, `existing`, `recipients`, `newDraft`, `error`) **stay where they are**: `/admin/segments` still renders them (S-17), and moving them would break that page for no gain.
  en: `"campaigns": {"eyebrow": "Outbound", "title": "Campaigns", "description": "Name a campaign, choose a channel and template, pick a segment, check who it can actually reach, then have a second admin approve it.", "steps": {"name": "Name", "channel": "Channel", "template": "Template", "variables": "Message details", "segment": "Segment", "preview": "Who this reaches"}, "channel": {"email": "Email", "whatsapp": "WhatsApp"}, "fields": {"name": "Campaign name", "template": "Template", "segment": "Saved segment", "scheduledAt": "Send at"}, "variables": {"legend": "Fill in the template", "hint": "Type the words to send, or use a placeholder: {tokens}", "missing": "Every field must be filled in before this template can be sent."}, "scheduleUnavailable": "Email campaigns send on the next hourly run and cannot be scheduled for a later time.", "eligibility": {"eligible": "Will be sent", "no_email": "No email address", "no_number": "No WhatsApp number", "not_opted_in": "Not opted in", "suppressed": "Opted out", "plan_ineligible": "Membership not active", "missing_variable": "Message details missing"}, "status": {"draft": "Draft", "review": "In review", "scheduled": "Scheduled", "queued": "Queued", "processing": "Sending", "sending": "Sending", "completed": "Completed", "cancelled": "Cancelled", "failed": "Failed"}, "actions": {"createDraft": "Create draft", "submitForReview": "Submit for review", "approve": "Approve and schedule", "reject": "Reject", "next": "Next", "back": "Back"}, "ownDraft": "A campaign must be approved by a different administrator.", "rejectionReason": "Reason", "templateUnapproved": "This template is not approved yet. Approve it under WhatsApp templates first.", "report": {"title": "Delivery", "sent": "Sent", "delivered": "Delivered", "read": "Read", "failed": "Failed", "blocked": "Not sent", "total": "Recipients"}, "empty": "No campaigns yet.", "error": "We could not load campaigns."}`; and `"navigation": {… "campaigns": "Campaigns"}`.
  zh-HK: `"campaigns": {"eyebrow": "對外訊息", "title": "推廣活動", "description": "為活動命名、選擇渠道及範本、揀選分群，先確認實際可觸及的對象，再由另一位管理員批准。", "steps": {"name": "名稱", "channel": "渠道", "template": "範本", "variables": "訊息內容", "segment": "分群", "preview": "觸及對象"}, "channel": {"email": "電郵", "whatsapp": "WhatsApp"}, "fields": {"name": "活動名稱", "template": "範本", "segment": "已儲存分群", "scheduledAt": "發送時間"}, "variables": {"legend": "填寫範本內容", "hint": "直接輸入文字，或使用預設代碼：{tokens}", "missing": "所有欄位必須填妥，方可發送此範本。"}, "scheduleUnavailable": "電郵推廣活動會於下一個每小時排程發送，不可另行指定時間。", "eligibility": {"eligible": "將會發送", "no_email": "沒有電郵地址", "no_number": "沒有 WhatsApp 號碼", "not_opted_in": "未同意接收", "suppressed": "已停止接收", "plan_ineligible": "會籍並非生效中", "missing_variable": "訊息內容未填妥"}, "status": {"draft": "草稿", "review": "待批", "scheduled": "已排程", "queued": "已排隊", "processing": "發送中", "sending": "發送中", "completed": "已完成", "cancelled": "已取消", "failed": "失敗"}, "actions": {"createDraft": "建立草稿", "submitForReview": "提交審批", "approve": "批准並排程", "reject": "拒絕", "next": "下一步", "back": "上一步"}, "ownDraft": "推廣活動須由另一位管理員批准。", "rejectionReason": "原因", "templateUnapproved": "此範本尚未獲批准，請先於「WhatsApp 範本」批准。", "report": {"title": "發送情況", "sent": "已發送", "delivered": "已送達", "read": "已閱讀", "failed": "失敗", "blocked": "未發送", "total": "收件人"}, "empty": "尚未有推廣活動。", "error": "無法載入推廣活動。"}`; `"navigation": {… "campaigns": "推廣活動"}`.

- [ ] **Step 7: Gate** `npx vitest run tests/unit/campaign-wizard.test.ts tests/unit/wt-pages/campaigns-page.test.tsx tests/unit/internal-navigation-config.test.ts tests/unit/admin-nav.test.tsx tests/unit/admin-page-auth-source.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/wisetech-protected-route-ownership.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npm run lint`

- [ ] **Step 8: Commit** — `feat(admin): campaign wizard, second-admin review and per-campaign report at /admin/campaigns (C-5)`

---

### Task 10: The WhatsApp send queue, end to end (C-5, part 3; D-10)

> **Task 11 lands first.** This task's per-recipient send goes through `dispatchNotification`, which Task 11 creates. Building them in numeric order produces the exact hazard C1's S-5 spends a paragraph arguing against — two ledgers, two answers — and leaves `lib/notifications/dispatch.ts` shipping with **zero production callers** beside a second WhatsApp send path built in the same phase. A module that exists and nobody calls reads as done in every later review, so the duplication is never revisited. Spec C-8 says the dispatcher is "used by B-2, B-4, B-5 and **C-5**"; this is what makes C-5 a caller.

**Files:** `lib/jobs/kinds.ts`, `lib/jobs/handler.ts`, `lib/db/repos/campaign-recipient-delivery.ts`, `lib/db/repos/woztell-inbound-events.ts` (M — created by C1 Task 3), `lib/automation/campaign-runner.ts`, `lib/jobs/runners.ts`, `lib/api/jobs/whatsapp-send-queue-route.ts`, `app/api/jobs/whatsapp-send-queue/route.ts`, `tests/unit/next-route-exports.test.ts` (M), `workers/wrangler.toml`, `workers/src/index.ts`, `workers/test/chat-retention.test.ts` (M), `tests/unit/worker-cron-contract.test.ts` (C).

- [ ] **Step 1: Failing tests.**
  - `tests/unit/job-run-key.test.ts`: `runKeyFor("whatsapp-send-queue", "ten-minute", new Date("2026-09-10T04:23:45.000Z"))` is `"whatsapp-send-queue:2026-09-10T04:20"`, matches `SAFE_RUN_KEY`, and two instants inside the same ten minutes produce the same key while 04:29:59 and 04:30:00 do not.
  - `tests/unit/worker-cron-contract.test.ts` (**new, in the root suite** — `.github/workflows/ci.yml` shards `npx vitest run` at the repo root only and never invokes the `workers/` package's own vitest, so worker changes are ungated today): parse `workers/wrangler.toml`'s `crons` array and `workers/src/index.ts`'s `JOBS_BY_CRON` keys and assert the two sets are **equal**. A trigger present in the toml but absent from the map throws `INVALID_CRON`, which `createAutomationWorker` catches and turns into one sanitized log line — the queue would simply never run.
  - `tests/unit/worker-alert-contract.test.ts`: every member of `WorkerJob` is accepted by `workerAlertSchema`. This currently fails for `aiops-metrics` and `chat-retention` — a pre-existing bug where three failed runs produce a 400 `INVALID_WORKER_ALERT` and nobody is paged. Fix it in this commit.
  - `tests/unit/whatsapp-campaign-runner.test.ts`: a claim whose recipient has since been suppressed is marked `suppressed` with `blocked_reason` and **no** provider call; a `{status:"skipped"}` adapter result is `blocked`, not `failed`; `provider_acceptance_uncertain` is terminal with a staff task and **no** reschedule; a resumed lease over an already-`sent` reservation returns without a second send.
  - `tests/unit/woztell-adapter-live-flag.test.ts`: discover every `createWoztellAdapter(` call site under `lib/` and `app/`, assert a minimum count, and require `RUN_LIVE_WOZTELL` in the same call — with a `detects the shapes it is meant to catch` case carrying a hostile sample, the shape `server-action-actor-boundary.test.ts` established.

- [ ] **Step 2: Run each** → FAIL. Read them: `worker-alert-contract` should name `aiops-metrics`, not a missing import.

- [ ] **Step 3: Kinds and bucket.**
```ts
// lib/jobs/kinds.ts — a group of its own. NOT M3_AUTOMATION_JOB_KINDS: that
// constant is interpolated into jobs_automation_recent_idx's predicate, so
// adding a member emits an unintended DROP/CREATE INDEX and reddens
// tests/unit/job-kind-contract.test.ts for a reason unrelated to the feature.
export const PHASE_C_JOB_KIND = {WHATSAPP_SEND_QUEUE: "whatsapp-send-queue"} as const;
export const PHASE_C_JOB_KINDS = [PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE] as const;
export type PhaseCJobKind = typeof PHASE_C_JOB_KINDS[number];
```
  `lib/jobs/handler.ts`: `export type JobBucket = "hourly" | "daily" | "ten-minute";` and in `runKeyFor`, `bucket === "ten-minute" ? \`${instant.slice(0, 15)}0\` : …`.

- [ ] **Step 4: Channel-scoped claim and promotion.** In `lib/db/repos/campaign-recipient-delivery.ts`:
  - `claimRecipients(actor, now, limit, leaseMs, channel)` — the `due` CTE gains `AND campaign.channel = ${channel}` and `AND (campaign.scheduled_at IS NULL OR campaign.scheduled_at <= ${now})`; the `completed` CTE gains the same channel predicate. **Do not** add the new statuses to either list (S-6). Update the three regexes in `tests/unit/campaign-delivery.test.ts` to include the channel predicate and keep them proving what they proved.
  - `promoteScheduledCampaigns(actor, now, channel)` → `{promoted: string[], blocked: string[]}`: `scheduled` campaigns whose `scheduled_at <= now` become `queued`, except WhatsApp campaigns whose `template_key` has no `whatsapp_templates` row with `status='approved'`, which become `failed` and are returned in `blocked`.

- [ ] **Step 4b: The delivery-status fall-through, so the campaign report's `delivered` and `read` are not permanently zero.** In `lib/db/repos/woztell-inbound-events.ts::recordDeliveryStatus` (C1 Task 3), when the `messages` `UPDATE` returns no row, run a **second** statement:

```sql
UPDATE campaign_recipients
SET delivered_at = CASE WHEN $status IN ('delivered','read') THEN COALESCE(delivered_at, $occurredAt) ELSE delivered_at END,
    read_at      = CASE WHEN $status = 'read' THEN COALESCE(read_at, $occurredAt) ELSE read_at END,
    status       = CASE WHEN $status = 'failed' THEN 'failed'::recipient_status ELSE status END,
    error_code   = CASE WHEN $status = 'failed' THEN $errorCode ELSE error_code END,
    updated_at   = now()
WHERE provider_message_id = $providerMessageId
RETURNING id
```

  and return `{matched: true, target: "campaign_recipient"}` — the third arm C1 left room for in that method's return type. A campaign send writes its provider id to `campaign_recipients.provider_message_id` and creates **no `messages` row at all**, so without this the two counters Task 9 Step 4 renders are unwritable, `Admin.campaigns.report.delivered` and `.read` ship as permanent zeroes, and §6's "delivery ticks arrive" is met for the human lane and silently unmet for the blast. `campaign_recipients.provider_message_id` gets a plain index in 0033 for this lookup. One method, two targets, one webhook branch — **not** a second delivery-status path.

- [ ] **Step 4c: Wire promotion into both runners, in this task, or nothing is ever promoted.** `promoteScheduledCampaigns` is defined above and, as an earlier draft stood, **called by nothing**. The claim loop's `due` CTE is `WHERE campaign.status IN ('queued', 'processing')` (`lib/db/repos/campaign-recipient-delivery.ts:156`) and S-6 forbids widening it, so a campaign the wizard wrote as `draft → review → scheduled` sits in `scheduled` forever: the cron fires, claims nothing, and returns a clean summary indistinguishable from an empty queue.
  - `runProductionWhatsAppSendQueue(now)` (Step 6) calls `promoteScheduledCampaigns(automationCronActor(), now, "whatsapp")` **as its first act**, before `runWhatsAppCampaignBatch`.
  - `runProductionCampaigns(now)` (`lib/jobs/runners.ts:432`) calls `promoteScheduledCampaigns(automationCronActor(), now, "email")` before `runCampaignBatch`. `campaignsRepository` already composes `createCampaignRecipientDeliveryRepository` (`lib/db/repos/campaigns.ts:103`), so the method is reachable from the bag the hourly runner already holds — no new dependency.
  - Assert both: a `scheduled` campaign whose `scheduled_at <= now` is `queued` after one run of its channel's runner, and a `scheduled` campaign of the *other* channel is untouched by it.
  Without the email leg, Task 9's wizard — which offers `channel: email` and a `scheduledAt` on the approve step — creates campaigns that never send and never error. If the email leg is deliberately deferred, Task 9 Step 4 must refuse a schedule on the email channel instead; do one or the other, never neither.
  - `markRecipientBlocked(actor, id, claimedAt, blockedReason)` — `status='suppressed', blocked_reason=$reason, claim_expires_at=NULL, updated_at=now()`, fenced by `claimed_at` exactly like every other transition. `markRecipientSuppressed` is left untouched so the email path and its pinned test are unaffected.
  - `markRecipientSent` gains an optional fourth argument `{providerMessageId, sentAt}` writing `provider_message_id` and `sent_at`; the email path passes nothing.

- [ ] **Step 5: The runner branch — and it calls the dispatcher, it does not re-implement it.** `lib/automation/campaign-runner.ts` gains `runWhatsAppCampaignBatch(dependencies, input)` beside `runCampaignBatch`, sharing `settleFailure` and `classifyDeliveryFailure`. `runCampaignBatch` passes `"email"` to the claim. Per recipient:

  1. **`dispatchNotification(notificationActor("campaign"), {recipient, channel: "whatsapp", template: templateKey, variables: claim.variables, idempotencyKey: \`notify:campaign:${campaignId}:${recipientId}\`, locale})`** — one call. The dispatcher already performs, in this order and once: `factsFor` → `classifyRecipient` → the approved-template check → `reserveWhatsapp` → `sendTemplateMessage` → `completeWhatsapp`. An earlier draft inlined that exact sequence here **and** shipped Task 11 with no callers; the result would have been two WhatsApp send paths built in one phase, with the classification-from-template and idempotency-namespace rules Task 11 carefully specifies governing the path that never runs. `variables` comes from **`campaign_recipients.variables`** — the snapshot Task 8 Step 5 resolved — never from the template or the campaign row.
  2. Map the result onto the recipient row, and nothing else:
     - `{status:"sent", providerId}` → `markRecipientSent(..., {providerMessageId: providerId, sentAt: now})`;
     - `{status:"skipped", reason}` → `markRecipientBlocked(reason)` — **not** a delivery failure. The journey runner's habit of recording an ineligible recipient as a failure is the thing not to copy. `reason` is already an `EligibilityCategory` or `template_not_approved`, so it drops straight into `blocked_reason`;
     - `{status:"failed", errorCode}` → `markRecipientFailed`; and when `errorCode` is `provider_acceptance_uncertain`, **a staff task and no reschedule** (S-15), filed with the direct `INSERT INTO staff_tasks … ON CONFLICT DO NOTHING` shape (C1's S-13 — `agentToolsRepository.createStaffTask` is unreachable from here).

  The send-time recheck inside the dispatcher **is** the "one STOP suppresses that member from the next blast" guarantee: the queue-time snapshot narrows the audience, and `factsFor` at send time catches anyone who opted out in between.

  **The resumed-lease guard is `existing + processing`, not `sent`.** An earlier draft copied `if (delivery.status === "sent") return;` from `lib/automation/campaign-runner.ts:331` and claimed "that is what makes a resumed lease safe". It is not. A recipient lease expires **precisely because the previous attempt did not complete** — which means `whatsapp_log.status` is `'processing'`, not `'sent'`. `reserveWhatsapp` is `ON CONFLICT DO NOTHING` → `reserveExisting` (`lib/db/repos/deliveries.ts:211-217, 130-139`), which returns the row in whatever state it is in, so a `sent`-only guard does not fire, the recipient is re-claimed by the `target.status = 'processing' AND target.claim_expires_at <= now` arm of the `due` CTE, and **the member is sent the same marketing template twice**. With `WHATSAPP_QUEUE_BATCH_LIMIT = 20` and a 30-second `QUEUE_REQUEST_TIMEOUT_MS`, a batch cut off mid-flight leaves several recipients in exactly this state every time it happens. So the dispatcher's reservation handling is:
  - `disposition:"existing"` and `status:"sent"` → return `{status:"sent", …}` from the existing row. Safe: it completed.
  - **`disposition:"existing"` and `status:"processing"` → return `{status:"failed", errorCode:"provider_acceptance_uncertain"}` without calling the transport.** Terminal, staff task, no reschedule — the same rule S-15 applies to a provider 5xx, and for the same reason: Woztell may already have delivered it, and a retry is a second billable message. The `sent`-only guard is safe for a crash *before* the provider call and unsafe for a crash *after* it, which is the only case a lease exists for.
  - `disposition:"existing"` and `status:"failed"` → the existing retry path, unchanged.
  Assert all four dispositions in `tests/unit/whatsapp-campaign-runner.test.ts`.

  `WHATSAPP_QUEUE_BATCH_LIMIT = 20` (D-10). Pacing comes from the ten-minute cron (120/hour), not from a sleep inside the request.

- [ ] **Step 6: Route and runner wiring.** `lib/api/jobs/whatsapp-send-queue-route.ts` exports `createWhatsAppSendQueuePost(options)` returning `createJobPost({kind: PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE, bucket: "ten-minute", run: ({now}) => jobRunners.whatsappSendQueue(now)})`; `app/api/jobs/whatsapp-send-queue/route.ts` is the one-line re-export — and **add that path to `tests/unit/next-route-exports.test.ts`'s `routeFiles` tuple** (lines 6-21), which is hand-maintained and discovers nothing. An earlier draft only parenthesised the test's name and left the file unmarked in the map, so the route would have shipped uncovered by the export-shape guard: the same silent-omission failure mode both plans call out for `tests/unit/admin-server-action-boundaries.test.ts`. The route file must not import `@/lib/db/client` — the ESLint boundary rule is scoped to `lib/**` and does not cover `app/**`, so boundary 1 is discipline here. `lib/jobs/runners.ts` gains `runProductionWhatsAppSendQueue(now)` constructing the adapter with the three credentials **and** `RUN_LIVE_WOZTELL: process.env.RUN_LIVE_WOZTELL`, and `createJobRunners` gains `whatsappSendQueue(now)`.
  Add an inventory entry `job-whatsapp-send-queue`. Note in the commit body that `CRON_SECRET` is one shared bearer for every job route: a forced invocation can only drain what a reviewed campaign already committed to `campaign_recipients`, so it can never *originate* a blast.

- [ ] **Step 7: Worker.** `workers/wrangler.toml` crons gains `"*/10 * * * *"` — **and `workers/test/chat-retention.test.ts:78-83` asserts the exact string** `crons = ["0 * * * *", "0 2 * * *", "0 18 * * *", "0 3 * * *", "15 18 * * *", "30 0 1 * *"]`, which Step 8's `cd workers && npm test` runs. That file was missing from an earlier draft's file map, so the gate would have gone red on a test nobody had been told about. Two changes there: extend the expected string, and **replace the exact-string assertion with a delegation** — the new root-suite `tests/unit/worker-cron-contract.test.ts` proves set-equality between the toml and `JOBS_BY_CRON`, which is the stronger property; leave the worker suite asserting only that the file parses and that the array is non-empty, so the same fact is not pinned twice in two places that must be edited together.
  `workers/src/index.ts` gains `"whatsapp-send-queue"` to `WorkerJob`, `"*/10 * * * *": ["whatsapp-send-queue"]` to `JOBS_BY_CRON`, and `"whatsapp-send-queue": QUEUE_REQUEST_TIMEOUT_MS` (30_000, a new constant) to `REQUEST_TIMEOUT_BY_JOB`. All three tables are `as const satisfies`, so a miss in two of them is a compile error; the cron string is not, which is what the new contract test is for. `workerAlertSchema` and `WorkerAlertPayload` in `lib/jobs/runners.ts` gain `"whatsapp-send-queue"`, `"aiops-metrics"` and `"chat-retention"`.

- [ ] **Step 8: Gate** `npx vitest run tests/unit/job-run-key.test.ts tests/unit/worker-cron-contract.test.ts tests/unit/worker-alert-contract.test.ts tests/unit/whatsapp-campaign-runner.test.ts tests/unit/woztell-adapter-live-flag.test.ts tests/unit/campaign-delivery.test.ts tests/unit/job-kind-contract.test.ts tests/unit/automation-admin-indexes.test.ts tests/unit/next-route-exports.test.ts --reporter=dot && npm run typecheck && npm run lint`, then `cd workers && npm test` (its own vitest, which root CI never runs).

- [ ] **Step 9: Commit** — `feat(jobs): whatsapp-send-queue job kind, ten-minute run key and the campaign runner's WhatsApp branch (C-5, D-10)`

---

### Task 11: The notifications dispatcher (C-8 remainder)

> **Land this before Task 10.** Task 10's per-recipient send is `dispatchNotification`'s **first production caller**, which is what makes C-5 a caller of C-8 the way spec C-8 says ("used by B-2, B-4, B-5 and C-5"). An earlier draft ended this task with "Callers converted in this task: none" while Task 10, in the same plan, re-implemented this exact sequence inline — shipping a module nobody calls beside a second WhatsApp send path. A module that exists and nobody calls reads as done in every later review; the duplication would never have been revisited.

`lib/notifications/` does not exist. The two paths it unifies — `lib/db/repos/deliveries.ts` (reserve/complete/retry over both log tables) and `lib/ai/woztell-delivery.ts` (a six-state ledger in `messages.metadata`) — have different idempotency models. The Phase C1 plan does **not** create `dispatch.ts` — its inbox send goes straight through `inboxRepository` and the adapter — so this task creates it, and C1's send path is a candidate for conversion in Phase D, not here.

- [ ] **Step 1: Failing tests** — `tests/unit/notification-dispatch.test.ts`: a suppressed recipient is `{status: "skipped", reason: "suppressed"}` with **no** transport call and **no** log row; an unapproved WhatsApp template is `{status: "skipped", reason: "template_not_approved"}`; classification is derived from the template and a caller-supplied classification is refused (`getEmailTemplate` throws `EMAIL_CLASSIFICATION_OVERRIDE_FORBIDDEN` on any mismatch, and `tests/unit/email-catalog.test.ts` pins that); a second dispatch with the same `idempotencyKey` returns the first result without a second send; the dispatcher never imports `@/lib/db/client` (assert on the module's source).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: The module.** A plain `server-only` module — **not** `"use server"` — whose first argument is an actor:

```ts
export type NotificationRecipient =
  | Readonly<{kind: "member"; profileId: string}>
  | Readonly<{kind: "contact"; contactId: string}>;
export type NotificationRequest = Readonly<{
  recipient: NotificationRecipient;
  channel: "email" | "whatsapp";
  template: EmailTemplateId | WhatsAppTemplateKey;
  variables: Readonly<Record<string, string>>;
  idempotencyKey: string;
  locale?: AppLocale;
}>;
export type NotificationResult =
  | Readonly<{status: "sent"; providerId: string; deliveryId: string}>
  | Readonly<{status: "skipped"; reason: EligibilityCategory | "template_not_approved" | "unknown_recipient"}>
  | Readonly<{status: "failed"; errorCode: DeliveryFailureCode; deliveryId: string}>;
export type NotificationDispatchDependencies = Readonly<{
  eligibility: Pick<MessageEligibilityRepository, "factsFor">;
  deliveries: Pick<DeliveriesRepository, "reserveEmail" | "reserveWhatsapp" | "completeEmail" | "completeWhatsapp">;
  templates: Pick<WhatsAppTemplatesRepository, "approved">;
  emailTransport: EmailTransport;
  whatsappTransport: Pick<ChannelAdapter, "sendTemplateMessage">;
  renderEmail: typeof renderEmailFn;
  unsubscribeUrls: typeof unsubscribeUrlsFn;
  emailFrom: string;
}>;
export async function dispatchNotification(
  actor: NotificationActor | AutomationRepositoryActor,
  request: NotificationRequest,
  dependencies?: NotificationDispatchDependencies,
): Promise<NotificationResult>;
```
  It **orchestrates repositories and never calls `getDb`** (boundary 1, enforced by ESLint for `lib/**`). It takes its transports rather than constructing them, so tests keep using `createTestTransport()`; the production dependency factory constructs the Woztell adapter with `RUN_LIVE_WOZTELL: process.env.RUN_LIVE_WOZTELL` (S-13). It is not constructed at module scope: `createConfiguredEmailTransport` reads `emailEnv()`, which throws in production without `RESEND_API_KEY`/`EMAIL_FROM`, and a module-scope construction would make that a boot-time coupling for any page that imports it.
  Marketing email threads `unsubscribeUrls(profileId, locale, now)` through — `renderEmail` throws `MARKETING_UNSUBSCRIBE_URL_REQUIRED` without it, and inside a runner a throw is a permanent delivery failure plus a staff task per member.
  Idempotency-key namespace: `notify:<source>:<digest>`. Do **not** mint keys in the `journey:` namespace: `lib/db/repos/journeys.ts` joins on `email_delivery.idempotency_key = source.delivery_key` and `whatsapp_delivery.idempotency_key = source.delivery_key || ':whatsapp'` in `claimDue` **and** `retryFailed`, so a foreign key shape silently disables admin retry and stale-claim replay detection.
  **Reservation dispositions — specify all four here, because Task 10 relies on them and the naive version double-sends.** `reserveWhatsapp` is `ON CONFLICT DO NOTHING` → `reserveExisting` (`lib/db/repos/deliveries.ts:211-217, 130-139`), which hands back the existing row **in whatever state it is in**:
  - `created` → send;
  - `existing` + `sent` → return `{status:"sent", providerId: record.providerId, deliveryId: record.id}` without touching the transport;
  - **`existing` + `processing` → return `{status:"failed", errorCode:"provider_acceptance_uncertain", deliveryId: record.id}` without touching the transport.** A previous attempt reached (or may have reached) the provider and did not complete; re-sending is a second billable marketing message to the same person. This is S-15's rule applied to a resumed lease rather than a 5xx, and it is the case a `sent`-only guard silently gets wrong;
  - `existing` + `failed` → the existing retry path.
  Assert all four.

  **Callers.** `lib/automation/campaign-runner.ts::runWhatsAppCampaignBatch` (Task 10, C-5) is converted — it is the reason this module exists in Phase C rather than Phase D, and it must be **written against this module rather than beside it**. Deliberately **not** converted: `lib/events/guest-registration-core.ts` (B-4) and `lib/showcase/lead-actions.ts`, which swallow every failure with a stated reason, and routing them through a path that writes a database row changes their failure surface. B-2 and B-5 stay on their existing paths for the same reason. Record all four as Phase D follow-up, by name, so the next reader knows the list was considered rather than forgotten.

- [ ] **Step 4: Gate** `npx vitest run tests/unit/notification-dispatch.test.ts tests/unit/email-catalog.test.ts tests/unit/repository-boundary.test.ts --reporter=dot && npm run typecheck && npm run lint`

- [ ] **Step 5: Commit** — `feat(notifications): one dispatcher over consent, the delivery logs and both transports (C-8)`

---

### Task 12: Acceptance spec and phase gate (C-5 … C-8)

- [ ] **Step 1:** `tests/e2e/phase-c2-campaigns-and-contacts.spec.ts`, shaped like `tests/e2e/phase-b2-member-directory.spec.ts` (bundle reader, `[{locale: "en", prefix: ""}, {locale: "zh-HK", prefix: "/zh"}]`, `missingM2LiveEnvironment` gate). Both locales, gated on `M2_TEST_*`:
  - `/admin/templates` lists the **nine** seeded keys, all `pending`, and shows at least one row in each of the `utility` and `marketing` categories; approving one shows `Admin.templates.status.approved`;
  - `/admin/contacts` filters by stage and by source, and a contact with a thread exposes a link to `/admin/inbox/<id>`;
  - `/admin/segments` with `?audience=contacts&contactSource=whatsapp` renders contact rows carrying `Admin.segments.kindContact`;
  - the wizard creates a WhatsApp draft against a segment; the **variables step renders one field per template variable** and refuses to advance with one left blank; the eligibility table shows a non-zero `not_opted_in` or `suppressed` count (proving the preview is not the old always-`false` flag); the creator sees `Admin.campaigns.ownDraft` on the detail page;
  - the queue route answers `401` without the bearer and `{"duplicate":true}` on a second POST inside the same ten minutes.

- [ ] **Step 1b: Two unit-level end-to-ends no browser can stand in for**, in `tests/integration/phase-c2-blast.test.ts`. These are where the seams this plan repaired are actually proved:
  - **schedule → promote → claim → send.** Create a `scheduled` campaign with `scheduled_at` in the past, run the WhatsApp runner once, and assert the campaign is `queued`, its recipients are claimed, and the mock adapter received **non-empty** BODY parameters for every recipient — the `variables_template` → `campaign_recipients.variables` → `sendTemplateMessage` chain, end to end. Do the same for an **email** campaign through `runProductionCampaigns`, which is the leg that silently never fired.
  - **delivery ticks reach a campaign recipient.** Drive `recordDeliveryStatus` with the provider id the mock adapter returned for a campaign send and assert `campaign_recipients.delivered_at` moves. That is Task 10 Step 4b, and it is the only place the webhook and the blast meet.

- [ ] **Step 2: Full gate**, run bare and judged by exit code (never piped into `grep`, which masks the code):
```
npm run audit:strings && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build
```
plus `cd workers && npm test`. If `npm run lint` or `npm run typecheck` reports errors from paths under `.claude/worktrees/`, they are not yours: `eslint.config.js`'s `globalIgnores` lists `.worktrees/**` and not `.claude/worktrees/**`, and the same trap is recorded in the maintainer's notes.

- [ ] **Step 3: Commit** — `test(e2e): Phase C2 campaigns, contacts and templates acceptance spec`

---

### Task 13: C-9 go-live readiness — the flip, and everything it is gated on

C-9 had no owner. C1's programme paragraph called it "a companion plan"; this plan's scope sentence omitted it. Between them, the `RUN_LIVE_WOZTELL=1` flip, its §8 activation preconditions, the live-acceptance harness's two-key ceiling and the one monitoring signal §6 names were owned by nobody — while both exit checklists read as complete. This task is the fix. It ships **code changes that make the flip verifiable**; the flip itself stays an owner action, deliberately.

**Files:** `tests/fixtures/woztell-live-acceptance.ts` (M), `lib/config/env.ts` (M), `lib/ai/woztell-production.ts` (M), `docs/integration/` (C, the checklist), and — **gated, its own commit, optional** — the `aiops_monthly_metrics` view.

- [ ] **Step 1: The replay, before anything else (C1 O-1/O-9).** C1 Task 2's delivery-status and outbound-echo discriminators are a **best guess**: no live credentials, no captured payload, no provider documentation, and the only fixture that has ever existed is `{from, type:"TEXT", messageId, timestamp, data:{text}}`. Add `tests/unit/woztell-normalizer-captured.test.ts` that reads any file present under `tests/fixtures/captured/woztell-*.json` and asserts each normalises to a non-`unsupported` variant — **skipping cleanly when the directory is empty**, so it is green today and becomes a real gate the moment the owner drops a captured payload in. Then: **owner action — capture one real delivery-status payload and one real outbound echo, commit them there, and run this test.** Until it has run against real payloads, "the ticks do not arrive" is a normaliser bug first and a provider problem second, and nothing in the tree tells you which. C1's 202-body echo (its Task 4 Step 1) is what makes the classification readable in Woztell's own delivery log while you find out.

- [ ] **Step 2: Raise the acceptance harness's two-key ceiling.** `tests/fixtures/woztell-live-acceptance.ts:84-95` hard-codes the acceptance approved-key filter to `concierge_follow_up_en | concierge_follow_up_zh_hk` and throws `WOZTELL_ACCEPTANCE_TEMPLATE_APPROVAL_REQUIRED` without the first — so the existing harness **cannot exercise a template blast at all**, which is half of the §6 gate. Widen the filter to any `WhatsAppTemplateKey` (`(value): value is WhatsAppTemplateKey => value in WHATSAPP_TEMPLATES`), and replace the hard-coded requirement with "the set is non-empty". Keep every other guard exactly as it is — the runtime-credential-reuse refusal and the recipient-id shape check are what stop an acceptance run touching production traffic. Add a case asserting that a set naming only a marketing template is accepted, so the blast leg is reachable.

- [ ] **Step 3: `RUN_LIVE_WOZTELL` and `WOZTELL_APPROVED_TEMPLATE_KEYS` join a feature-scoped env contract (C1 O-8), in their own commit.** These two variables decide whether real messages leave the building and are the two read from bare `process.env`, outside boundary 7 — no Zod parse, no owner, and a typo (`RUN_LIVE_WOZTELL=true`) fails **silently into mock mode** with a `mock:` provider id recorded as delivered. Add them as optional `AiEnv` fields through the same conditional spread as their siblings (`lib/config/env.ts:165-176`), **not** to `serverKeys` — a hard boot requirement there is how a transitive env pull once broke `/sitemap.xml`. Parse `RUN_LIVE_WOZTELL` as `z.enum(["0", "1"]).optional()` so a typo is a **startup error rather than a silent downgrade**. Keep this a separate commit from everything else in this task: it is a behaviour change to the live-send switch, and landing it with the flip would make a go-live regression indistinguishable from a C-9 regression.

- [ ] **Step 4: `aiops_monthly_metrics` — gated, optional, and honestly labelled (C1 O-6).** §6 names this view as the go-live monitoring signal, and it will read a successful human takeover as an AI failure: its `month_conversations` CTE counts every `agent_kind='concierge'` conversation, a `handling='human'` thread produces no terminal `agent_run` so it lands in `agent_resolved_rate`'s denominator and never its numerator, and `first_response` keys off `role='assistant'` so a `role='staff'` reply is excluded from the median sample entirely. The fix is `AND conversations.handling = 'bot'` in the view body — but it requires dropping and recreating a materialized view whose exact 23 public columns are pinned by `tests/unit/m4c-schema-contract.test.ts` against `drizzle/meta/0013_snapshot.json`, and **whether drizzle-kit regenerates the body cleanly is untested**. So: attempt it as migration **0035**, in its own commit, with the schema contract test as the gate. **If it does not regenerate cleanly, stop and do not force it** — instead add the caveat to the dashboard copy in both bundles ("of threads the concierge kept") and record it as Phase D. A monitoring signal that is wrong-and-labelled beats a materialized view rebuilt by hand.

- [ ] **Step 5: Human-thread retention gets an answer (C1 O-5).** C1's S-10 takes `handling <> 'bot'` threads out of both retention sweeps, which is right for an operational record with an audit trail pointing at it — but "forever" is not a retention policy and PDPO expects one. This is a WTIA decision, not an engineering one. **Ask it here, in writing, before the flip**, and record the answer in the checklist; implementing whatever comes back is Phase D. Asking after go-live means asking about data you have already collected.

- [ ] **Step 6: The activation checklist, as an ordered sequence with a verification for each line.** Write `docs/integration/phase-c-whatsapp-go-live.md` — a living document like `docs/integration/wisetech-design-fidelity-checklist.md`, not prose. The order is load-bearing; each line names what proves it:

  1. migrations **0031+0032 as one unit**, then **0033+0034** — C1's exit checklist explains why 0031 without 0032 opens a second conversation per person. Verify: journal ends at idx 34; `SELECT count(*) FROM whatsapp_templates` is **9** and every `status` is `pending`.
  2. **Approve templates at `/admin/templates`** — 0034 seeds everything `pending`, so after the migration the registry is non-empty and *nothing* is approved, and every WhatsApp send is skipped rather than sent. Deliberate (S-14), and **the single most likely way to make C-9 look broken**. Verify: the campaign preview shows a non-zero `eligible` count for a template blast.
  3. **Captured-payload replay green** (Step 1). Verify: `tests/unit/woztell-normalizer-captured.test.ts` runs against real files rather than skipping.
  4. `WOZTELL_OPEN_API_TOKEN` set in Vercel with `api:admin` scope, and the Open API host and `conversationHistory` selection set confirmed against Woztell's documentation (C1 O-2). Verify: one `/api/admin/woztell/backfill` page against production returns `imported > 0`.
  5. **Confirm the webhook body cap with Woztell.** `MAX_WEBHOOK_BYTES` is 64 KiB and is applied **before** signature verification, so a batched delivery-status payload over that is rejected 413 and looks exactly like a provider outage. Ask what their maximum status batch is.
  6. **Retention answer recorded** (Step 5).
  7. **Then, and only then, `RUN_LIVE_WOZTELL=1`.** Verify with the two signed-in walks in the exit checklist below: the human lane (a real reply, a non-`mock:` provider id, ticks arriving) and the blast (twenty opted-in members, `whatsapp_log` one row each, `campaign_recipients.sent_at` populated, `delivered_at` ticking through Task 10 Step 4b).
  8. **The STOP leg, from both sides**, exactly as the exit checklist describes. This is the last gate because it is the one that is hardest to undo if it is wrong.

- [ ] **Step 7: Gate** `npx vitest run tests/unit/woztell-normalizer-captured.test.ts tests/unit/woztell-live-acceptance.test.ts tests/unit/env-contract.test.ts tests/unit/public-environment-isolation.test.ts tests/unit/m4c-schema-contract.test.ts --reporter=dot && npm run typecheck && npm run lint`

- [ ] **Step 8: Commits** — three, deliberately separate: `test(woztell): replay captured payloads and lift the acceptance harness's two-key ceiling (C-9)`; `refactor(config): parse RUN_LIVE_WOZTELL and the approved-key list through aiEnv (C-9)`; `docs(integration): Phase C WhatsApp go-live activation checklist (C-9)`. The `aiops_monthly_metrics` migration, if it lands at all, is a fourth.

---

## Phase C2 exit checklist

**What code can prove** (all of it runnable here, with no database and no Woztell credentials):

- [ ] Full local gate green: `audit:strings`, `npm test`, `lint`, `typecheck`, `build`, plus `workers`' own vitest.
- [ ] `tests/unit/phase-c-schema-contract.test.ts` passes, including the assertion that **no Phase C migration uses a newly added `campaign_status` value** (S-2). This is the one failure that would only appear on a production deploy, because on a fresh database every migration is pending inside one transaction. Its `detects the shapes it is meant to catch` case must be green too: an assertion nobody has watched fail is an assertion nobody should trust, and this one is only correct because it strips `CREATE TYPE … AS ENUM` as well as `ALTER TYPE … ADD VALUE` — C1's `message_delivery_status` legally contains the literal `'failed'`.
- [ ] `lib/db/repos/message-eligibility.ts` has **one** private facts query and **two** public methods with two gates, and a test proves each refuses the other's actor before `loadDatabase`. If the file was created rather than modified in Task 3, C1's `whatsAppEligibility` was overwritten and `lib/admin/inbox-action-core.ts` has silently lost its consent check.
- [ ] `promoteScheduledCampaigns` has **two** call sites — the ten-minute WhatsApp runner and the hourly email runner — and a test for each. A `scheduled` campaign that nothing promotes fails silently and permanently, and looks exactly like an empty queue.
- [ ] `dispatchNotification` has a production caller (`runWhatsAppCampaignBatch`). A dispatcher with zero callers beside a second send path is not a dispatcher.
- [ ] `recordDeliveryStatus` returns `target: "campaign_recipient"` for a campaign provider id, and `campaign_recipients.delivered_at` moves in a test. Otherwise the campaign report's `delivered` and `read` are permanent zeroes that staff will read as "nothing arrived".
- [ ] `campaigns.variables_template` has a writer (Task 9's variables step) and a reader (Task 8's resolver → `campaign_recipients.variables` → Task 10). `campaigns.completed_at` has a writer (Task 1 Step 4b). No column added by this phase is set by nothing — `conversations.subject` is the one exception and C1 marks it **reserved** in the schema comment.
- [ ] `tests/unit/next-route-exports.test.ts`'s `routeFiles` tuple contains `app/api/jobs/whatsapp-send-queue/route.ts`, and `workers/test/chat-retention.test.ts` no longer pins the `crons` string that `tests/unit/worker-cron-contract.test.ts` now proves.
- [ ] `tests/unit/worker-cron-contract.test.ts` proves `workers/wrangler.toml`'s cron set equals `JOBS_BY_CRON`'s key set. Nothing checked this before; a trigger with no map entry fires nothing and logs one line.
- [ ] `tests/unit/woztell-adapter-live-flag.test.ts` proves every adapter construction passes `RUN_LIVE_WOZTELL`. Without it a send returns `{status: "sent", providerId: "mock:…"}` and is recorded as delivered — the incident already in `lib/jobs/runners.ts:421-427`.
- [ ] Every flow is exercised through the mock adapter. `RUN_LIVE_WOZTELL` stays unset in CI and locally; C-9 remains a flag flip (D-4).
- [ ] `tests/unit/message-eligibility.test.ts` proves a WhatsApp-suppressed member and a stopped contact are both refused, from two different tables, through one repository.

**What only an owner with production credentials can do:**

> **The ordered version of everything below is Task 13 Step 6**, `docs/integration/phase-c-whatsapp-go-live.md`. These bullets are the substance; that document is the sequence, and the sequence is what an earlier draft of both plans left unowned.

- [ ] **Owner action — approve templates before flipping the flag.** 0034 seeds all **nine** keys as `pending`, so after the migration the registry is non-empty and *nothing* is approved. Until an admin approves the Meta-approved keys at `/admin/templates`, every WhatsApp send is skipped rather than sent. This is deliberate (S-14) and it is the single most likely way to make C-9 look broken.
- [ ] **Owner action — migrations 0031–0034 applied to production before the deploy**, in order, C1's 0031 and 0032 first. Recipe from Phase A: `neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479`, then `DATABASE_URL=… npm run db:migrate`. There is no local database on this branch, so 0033 and 0034 have never been executed — they are pinned only by the schema contract test and the seed's TypeScript twin. Run them against an isolated Neon branch first and confirm: journal ends at idx 34; `SELECT count(*) FROM whatsapp_templates` is **9** and every `status` is `pending`; `SELECT count(*) FROM campaign_recipients WHERE profile_id IS NULL AND contact_id IS NULL` is 0. **0031 and 0032 go in one `db:migrate` invocation** — C1's exit checklist explains why applying 0031 alone opens a second conversation per person on the first inbound after deploy.
- [ ] **Owner action — Vercel env.** No new variable is required by C2. `WOZTELL_APPROVED_TEMPLATE_KEYS` becomes the empty-registry fallback only; after the seed it is inert. (`WOZTELL_OPEN_API_TOKEN` belongs to C-3 and the Phase C1 plan.)
- [ ] **Owner action — the signed-in walk no unit test can stand in for.** Admin A builds a WhatsApp campaign against a segment of opted-in members and creates the draft; the eligibility table shows real counts per category. Admin A submits for review and sees `Admin.campaigns.ownDraft`. Admin B approves and schedules. Within ten minutes the queue drains, `whatsapp_log` carries one row per recipient with a **non-`mock:`** provider id, and `campaign_recipients.sent_at` is populated.
- [ ] **Owner action — the STOP leg.** One member replies STOP; `message_suppressions` gains a `whatsapp/marketing` row and `audit_events` a `consent.whatsapp.revoked`; one prospect replies STOP and `contacts.whatsapp_opted_out_at` is set **with** a `consent.whatsapp.revoked` row against `target_type: 'contact'` (that audit row does not exist anywhere in the tree before this phase). The next blast to the same segment reports both as `suppressed` in its preview and sends to neither.
- [ ] **Owner action — watch `aiops_monthly_metrics` with a caveat.** C-9 names it as the go-live signal, but every human-handled WhatsApp conversation counts in `conversation_count` and never produces a terminal `agent_run`, so `agent_resolved_rate` will fall for reasons that have nothing to do with the concierge. **Task 13 Step 4 attempts the view fix and is allowed to decline it**; if it declined, read the number as "of threads the concierge kept", which is what the dashboard copy will then say.

**Known debt this phase records rather than fixes:**

- `message_suppressions.profile_id` stays `NOT NULL`; a prospect's opt-out lives on `contacts` and is read through `messageEligibilityRepository` (S-8). Unifying them is Phase D.
- The twelve-month `chat-retention` sweep and the 365-day conversation expiry both used to delete an operational thread out from under its own audit trail. **Phase C1 fixes both** by teaching them `handling`; C2 depends on that and touches neither sweep. Confirm it landed before trusting a campaign report that joins back to a conversation.
- `jobs` has no retention path, and a ten-minute cron adds ~52,500 rows a year on a unique text index.
- The `/admin/segments` "Queue campaign" shortcut still sends marketing email with no review step (S-17).
- `lib/db/repos/woztell.ts` and `lib/db/repos/woztell-delivery-outbox.ts` take no `Actor` and authorize nothing. They predate the §9 capability-actor rule and are the standing exceptions; do not cite them as precedent for a new writer. **C1's S-14 now agrees**: every repository either plan adds — `woztell-inbound-events.ts`, `woztell-delivery-stamp.ts`, `importHistoricalInbound` — mints a `unique symbol` capability and asserts it before `loadDatabase`, with a case in `tests/unit/repository-production-security.test.ts`. An earlier draft of C1 cited these two modules as the shape to copy, which is exactly what this line warns against; that has been corrected rather than left as a contradiction between companion documents.
- `contacts.whatsapp_member_id` is written by C1 only when the id is **free**, and corrected by Task 5's `reconcileWhatsAppMemberId`. The webhook path deliberately does not call the reconciler (C1 Task 4 Step 6's guarded write plus its 23505 catch is what keeps a 500 out of an HMAC-verified route). Wiring the webhook to the reconciler once both have soaked is Phase D.
- Task 8's `resolveRecipientVariables` supports a closed five-token substitution set. Anything richer — conditionals, per-locale bodies, fallbacks — is Phase D. A template whose variables cannot be expressed in that set is a template the wizard should not offer, and `missing_variable` in the preview is how you find out before the blast rather than after.
- `campaigns.status` gains `sending` for spec parity and **nothing writes it** (S-6); `processing` remains the in-flight state because three statements and their regexes already spell it that way. Unlike the columns above this is a deliberate no-writer, recorded so a reader does not go looking for the transition.
