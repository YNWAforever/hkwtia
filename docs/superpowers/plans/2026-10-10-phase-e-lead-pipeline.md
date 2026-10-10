# Phase E Lead Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give WTIA staff a lead pipeline on `contacts` — next steps, an activity timeline, attributed single-use join invites, a board, a daily digest and a conversion report — so captured leads become paid members.

**Architecture:** Additive schema on `contacts` (three columns, `contact_activities`, `join_invites`, `membership_applications.invite_id`). All data access in `lib/db/repos/` with `requireAdmin`; admin mutations through `*-core.ts` + `"use server"` wrappers; the only public surface is `/join/invite/[token]`, which sets an httpOnly cookie the two existing join submit actions read to prefill and attribute. Ships as three stacked PRs (Part E-a, E-b, E-c).

**Tech Stack:** Next.js 16 App Router (webpack), React 19, TypeScript strict, Drizzle on Neon Postgres, next-intl (en, zh-HK at `/zh`), Zod, Resend, Vitest, Playwright, Cloudflare Worker crons.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-e-lead-pipeline-design.md`

## Global Constraints

- CLAUDE.md hard boundaries 1–8 apply to every task; in particular all DB access in `lib/db/repos/`, `requireAdmin(actor)` inside every admin repository method, no actor-taking export in a `"use server"` module (`tests/unit/server-action-actor-boundary.test.ts`).
- Every user-visible string in `messages/en.json` and `messages/zh-HK.json` in parity; splice lines, never `JSON.stringify` a bundle; `npm run audit:strings` green.
- Links: `@/i18n/navigation` `Link` and its wrappers (`ActionLink`, `InnerCardGrid`, `HonestEmpty` actions) take **unprefixed** paths; `localizedPath` only for `next/link`, `<a>`, `redirect` and absolute URLs.
- Every mutation writes an `auditEvents` row in the same transaction (pattern: `contactsRepository.updatePipeline`).
- Invite token: 32 random bytes, base64url; store only the SHA-256 hex digest; expiry 14 days; single-use at application submit; a new invite supersedes the contact's live one.
- Automatic stage moves are forward-only in the order `new < contacted < qualified < applied < member`; `closed` is never set or left automatically.
- Hong Kong time (`Asia/Hong_Kong`) for "due today" and "overdue".
- New admin pages registered in `config/wisetech-protected-route-inventory.ts`; admin targets `min-h-11`.
- Schema changes: edit `lib/db/schema-core.ts`, then `npx drizzle-kit generate --name <tag>` (no DB needed); commit the SQL, snapshot and journal together.
- Gates before each PR: focused tests, `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run audit:strings`, `npm run build`. Regenerate any lockfile with `npx npm@10` only.

## Plan rulings against the spec (recorded; spec updated to match)

- **R-1** `membership_applications.invite_id` is written when the application is **submitted** (inside `consume`), not when the draft is created. Unsubmitted drafts carry no attribution value, and both submit points already exist (`saveProfile`, `saveCompany`).
- **R-2** Reminders do **not** create `staff_tasks` rows. `staff_tasks` is keyed to a member profile (`StaffTaskInput.profileId: string`) and writable only by the automation/agent actors; most leads have no profile. At < 50 leads the board's overdue filter plus the per-owner digest carry the same signal.
- **R-3** Registering the `lead-reminders` job needs migration `0064` to extend the `job_health_registered_key` check constraint (drizzle/0052). E-c therefore ships its own small migration.

## Review Focus

1. Two staff create an invite for the same contact at once → exactly one live invite remains (supersede under `FOR UPDATE`). Test in Task 4.
2. A lead opens a link, then staff create a newer invite before the lead submits → the old cookie neither prefills nor attributes; join still completes. Test in Task 7.
3. One invite, two applications by the same person (e.g. Community then Startup) → the invite is consumed by the first submit only; the second submit is untouched. Test in Task 7.
4. The auto-`member` flip runs more than once for the same contact → exactly one `became_member` activity. Test in Task 7.
5. A due date of "today" in Hong Kong evaluated at 07:59 HKT (23:59 UTC the day before) → due today, not overdue. Test in Task 9.

---

# Part E-a — data, activity timeline, lead page (PR 1)

### Task 1: Schema and migration 0063

**Files:**
- Modify: `lib/db/schema-core.ts` (`contacts` :1686; `membershipApplications` :287; new enum beside `contactStageEnum` :129)
- Create (generated): `drizzle/0063_lead_pipeline.sql`, `drizzle/meta/0063_snapshot.json`; modify `drizzle/meta/_journal.json`
- Test: `tests/unit/phase-e-schema-contract.test.ts`

**Interfaces:**
- Produces: `contactActivityKindEnum` (`note`, `stage_change`, `owner_change`, `next_step`, `invite_sent`, `invite_opened`, `applied`, `became_member`); tables `contactActivities`, `joinInvites`; columns `contacts.nextStep`, `contacts.nextStepDueAt`, `contacts.lastTouchAt`, `membershipApplications.inviteId` — exactly as spec §3.

- [ ] **Step 1: Write the failing test** reading `drizzle/0063_lead_pipeline.sql` and asserting it contains: `CREATE TYPE "public"."contact_activity_kind"` with the eight values in the order above; `CREATE TABLE "contact_activities"` with an `ON DELETE cascade` FK to `contacts`; `CREATE TABLE "join_invites"` with `"token_digest" text NOT NULL` and a unique constraint on it; `ADD COLUMN "next_step" text`, `"next_step_due_at" timestamp with time zone`, `"last_touch_at" timestamp with time zone` on `contacts`; `ADD COLUMN "invite_id" uuid` on `membership_applications` with `ON DELETE set null`; index `contact_activities_contact_created_idx`; and **no** `DROP` and **no** `UPDATE` (additive, no backfill).
- [ ] **Step 2:** `npx vitest run tests/unit/phase-e-schema-contract.test.ts` → FAIL (file missing).
- [ ] **Step 3:** Add the enum, tables, columns and index to `schema-core.ts` in `contacts`' style; run `npx drizzle-kit generate --name lead_pipeline`; read the SQL — only additions.
- [ ] **Step 4:** Test passes; `npx vitest run tests/unit/db-script-contract.test.ts tests/unit/m6-schema-contract.test.ts` still pass.
- [ ] **Step 5: Commit** `feat(db): Phase E lead pipeline schema (migration 0063)`.

### Task 2: Activity timeline and next step in the repositories

**Files:**
- Create: `lib/db/repos/contact-activities.ts`
- Modify: `lib/db/repos/contacts.ts` (`updatePipeline` :936; `ContactRow` :202; projection)
- Test: `tests/unit/contact-activities-repository.test.ts`; extend `tests/unit/contacts-repository.test.ts`

**Interfaces:**
- Produces:
  - `type ContactActivityKind`; `type ContactActivity = Readonly<{id: string; contactId: string; actorProfileId: string | null; actorName: string | null; kind: ContactActivityKind; body: string | null; meta: Record<string, unknown>; createdAt: Date}>`.
  - `contactActivitiesRepository.list(actor: Actor, contactId: unknown): Promise<readonly ContactActivity[]>` — newest first; `requireAdmin`.
  - `contactActivitiesRepository.addNote(actor: Actor, contactId: unknown, body: unknown): Promise<ContactActivity>` — body trimmed, 1–2,000 chars; sets `contacts.last_touch_at = now()`; audit `contact.note_added`.
  - `insertContactActivity(transaction, {contactId, actorProfileId, kind, body?, meta?}): Promise<void>` — exported SQL helper for use inside other repositories' transactions.
  - `contactsRepository.updateNextStep(actor: Actor, contactId: unknown, input: unknown): Promise<ContactRow>` — input `{nextStep: string | null` (trimmed, ≤ 200, `""` → null)`, dueAt: string | null` (`YYYY-MM-DD`, stored as 18:00 Asia/Hong_Kong that day)`}`; on a real change only: `next_step` activity + audit `contact.next_step_updated`; sets `last_touch_at`.
  - `ContactRow` gains `nextStep: string | null; nextStepDueAt: Date | null; lastTouchAt: Date | null; organisation: string | null` — organisation = newest non-empty of `event_guest_registrations.organisation` / `leads.organization` linked to the contact.

- [ ] **Step 1: Write failing tests** (fake-database style of `contacts-repository.test.ts`):
  - `list` and `addNote` refuse a member and an anonymous actor.
  - `addNote` rejects `""` and a 2,001-char body; a valid note runs, inside one `transaction`, the activity insert, the `last_touch_at` update and the `contact.note_added` audit insert.
  - `updatePipeline` writes a `stage_change` activity with `meta {from: "new", to: "contacted"}` when the stage changes and **no** activity when nothing changed; same for `owner_change`.
  - `updateNextStep` stores `dueAt "2026-10-20"` as `2026-10-20T10:00:00.000Z` and writes one `next_step` activity per real change.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; call `insertContactActivity` in `updatePipeline`'s existing transaction directly after its `auditEvents` insert.
- [ ] **Step 4:** Tests pass, plus `npx vitest run tests/unit/contacts-repository.test.ts tests/unit/repository-boundary.test.ts`.
- [ ] **Step 5: Commit** `feat(contacts): activity timeline, notes and next step`.

### Task 3: Lead page `/admin/contacts/[id]`

**Files:**
- Create: `app/[locale]/(admin)/admin/contacts/[id]/page.tsx`, `components/admin/lead-timeline.tsx`, `components/admin/lead-next-step-form.tsx`, `components/admin/lead-note-form.tsx`
- Modify: `lib/admin/contact-action-core.ts`, `lib/admin/contact-actions.ts`, `lib/admin/contacts.ts` (`getContact`), `components/admin/contact-pipeline-table.tsx` (name links to the lead page), `config/wisetech-protected-route-inventory.ts`, `messages/en.json`, `messages/zh-HK.json` (`AdminContacts.lead.*`)
- Test: `tests/unit/admin-lead-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 methods.
- Produces: cores `addContactNote(actor, contactId, body)` and `updateContactNextStep(actor, contactId, input)` in `contact-action-core.ts`; wrappers `addContactNoteAction(path: string, formData: FormData)` and `updateContactNextStepAction(path: string, formData: FormData)` in `contact-actions.ts`; `contactReturnPath` additionally allows `/admin/contacts/<uuid>` (with optional `en/`|`zh/` prefix).

- [ ] **Step 1: Write failing tests**: renders header (name, organisation, source, stage, owner, consent state), timeline newest first, note form, next-step form, and the Related block (events attended as a guest, showcase intros, a link to the WhatsApp conversation via `conversationId`, membership if any — each section omitted when empty), in en and zh-HK; missing contact → `notFound()`; non-admin → `notFound()`; `contactReturnPath('/zh/admin/contacts/<uuid>')` allowed and `'/admin/contacts/../x'` refused; the list's name cell links to `/admin/contacts/<id>` (unprefixed, through `Link`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement on `/admin/contacts/page.tsx`'s patterns; due date `<input type="date">`; an overdue due date uses the existing destructive token plus visible text.
- [ ] **Step 4:** Tests pass; `npm run audit:strings`; `npx vitest run tests/unit/locale-href-boundary.test.ts tests/unit/server-action-actor-boundary.test.ts`.
- [ ] **Step 5: Commit** `feat(admin): lead page with timeline, notes and next step`. **PR E-a** after full gates.

---

# Part E-b — attributed join invites (PR 2, stacked on E-a)

### Task 4: Invite tokens and `joinInvitesRepository`

**Files:**
- Create: `lib/membership/join-invite-token.ts`, `lib/db/repos/join-invites.ts`
- Test: `tests/unit/join-invite-token.test.ts`, `tests/unit/join-invites-repository.test.ts`

**Interfaces:**
- Produces:
  - `createInviteToken(): {token: string; digest: string}` (32 bytes from `crypto.randomBytes`, base64url → 43 chars; digest = SHA-256 hex, 64 chars); `digestInviteToken(token: string): string`; `isWellFormedInviteToken(value: unknown): value is string` (`/^[A-Za-z0-9_-]{43}$/`).
  - `type JoinInvite = Readonly<{id: string; contactId: string; planCode: PlanCode; createdByProfileId: string | null; expiresAt: Date; openedAt: Date | null; consumedAt: Date | null; supersededAt: Date | null; applicationId: string | null; createdAt: Date}>`; `type InviteState = "live" | "opened" | "consumed" | "expired" | "superseded"`.
  - `joinInvitesRepository.create(actor: Actor, input: {contactId: string; planCode: "community" | "startup" | "corporate"}): Promise<{invite: JoinInvite; token: string}>` — `requireAdmin`; one transaction: lock the contact row `FOR UPDATE`, set `superseded_at = now()` on its live invites, insert the new invite (`expires_at = now() + 14 days`), audit `join_invite.created`.
  - `joinInvitesRepository.latestForContact(actor: Actor, contactId: unknown): Promise<(JoinInvite & {state: InviteState}) | null>` — admin.
  - `joinInvitesRepository.open(token: unknown): Promise<OpenedInvite | null>` — public, no actor; null for malformed/unknown/expired/consumed/superseded; the first valid open stamps `opened_at` and inserts one `invite_opened` activity. `OpenedInvite = Readonly<{inviteId: string; planCode: PlanCode; contactDisplayName: string | null; inviterFirstName: string | null; locale: AppLocale; expiresAt: Date}>`.
  - `joinInvitesRepository.prefillFor(inviteId: unknown): Promise<{displayName: string | null; phone: string | null; organisation: string | null} | null>` — null unless the invite is unconsumed, unsuperseded and unexpired.
  - `joinInvitesRepository.consume(actor: Actor, input: {inviteId: string; applicationId: string}): Promise<"consumed" | "not_live">` — member actor owning the application; one transaction: conditional `UPDATE join_invites SET consumed_at = now(), application_id = $app WHERE id = $id AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at > now()`; only if a row updated: set `membership_applications.invite_id`, move the contact to `applied` when its stage is `new|contacted|qualified`, insert an `applied` activity, link the contact to the profile through the existing `linkProfile` logic, audit `join_invite.consumed`.

- [ ] **Step 1: Write failing tests**: token length 43 and digest length 64; `digestInviteToken(token) === digest`; `create`'s recorded SQL parameters contain the digest and never the raw token; `open("not-a-token")` issues **no** query; `open` returns null for expired, consumed and superseded fixtures, and stamps `opened_at` plus one activity only when `opened_at` was null; `create` runs `FOR UPDATE` then the supersede update then the insert in one transaction (Review Focus 1); `consume` returns `"not_live"` when the conditional update matches no row and then issues no further write; `consume` leaves a `member` or `closed` contact's stage unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; the lookup is digest equality on the unique index in Postgres — the raw token is never compared in JavaScript and never logged.
- [ ] **Step 4:** Tests pass with `tests/unit/repository-boundary.test.ts`.
- [ ] **Step 5: Commit** `feat(membership): single-use attributed join invites`.

### Task 5: Create and send from the lead page

**Files:**
- Create: `components/admin/lead-join-link-panel.tsx` (client, for Copy), `lib/admin/lead-invite-core.ts`
- Modify: `lib/admin/contact-actions.ts`, `lib/email/catalog.ts` (`lead_join_invite`), `lib/email/transport.ts` (optional `replyTo?: string` on `EmailSendInput`, passed to Resend's `replyTo`), `messages/*.json` (`Email.templates.lead_join_invite`, `AdminContacts.lead.invite.*`), `app/[locale]/(admin)/admin/contacts/[id]/page.tsx`
- Test: `tests/unit/lead-invite-core.test.ts`; extend the existing transport test; refresh `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap`

**Interfaces:**
- Consumes: Task 4 `create`, `latestForContact`.
- Produces:
  - `contactActivitiesRepository.recordInviteSent(actor: Actor, input: {contactId: string; inviteId: string; channel: "copy" | "email" | "whatsapp"; status: "sent" | "failed"}): Promise<void>` (also sets `last_touch_at`; audit `join_invite.sent`).
  - Core `createLeadInvite(actor, contactId, planCode): Promise<{url: string; inviteId: string}>` — `url = absoluteUrl(localizedPath(contactLocale, "/join/invite/" + token))`.
  - Core `sendLeadInviteEmail(actor, {contactId, inviteId, inviteUrl, message}): Promise<"sent" | "failed">` — template `lead_join_invite` in the contact's locale; `replyTo` = the acting staff profile's email; idempotency key `lead-invite:<inviteId>`.
  - `whatsappInviteHref(phoneE164: string, text: string): string` → `https://wa.me/<digits>?text=<encodeURIComponent(text)>`.
  - Wrappers `createLeadInviteAction`, `sendLeadInviteEmailAction`, `recordLeadInviteSharedAction` (channel `copy` | `whatsapp`).

- [ ] **Step 1: Write failing tests**: `createLeadInvite` returns `https://<site>/zh/join/invite/<token>` for a zh-HK contact and `https://<site>/join/invite/<token>` for en; `patron` refused; the email uses the contact's locale copy and sets `replyTo`; a transport `DeliveryFailure` returns `"failed"` and records `invite_sent` with `meta.status "failed"`; the panel disables Email without an email and WhatsApp without a phone (render test); `whatsappInviteHref("+85291234567", "Hi & welcome") === "https://wa.me/85291234567?text=Hi%20%26%20welcome"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; the URL is returned once in the action state and shown in the panel — not stored, not logged.
- [ ] **Step 4:** Tests pass; `npx vitest run tests/unit/email-render-snapshots.test.tsx -u` and confirm the snapshot diff is only the new template.
- [ ] **Step 5: Commit** `feat(admin): create and send personal join links`.

### Task 6: Public `/join/invite/[token]`

**Files:**
- Create: `app/[locale]/(join)/join/invite/[token]/page.tsx`, `app/[locale]/(join)/join/invite/[token]/continue/route.ts`, `lib/membership/join-invite-cookie.ts`
- Modify: the route inventory the route-parity suite reads (`config/wisetech-protected-route-inventory.ts` or its public counterpart), `messages/*.json` (`Join.invite.*`)
- Test: `tests/unit/join-invite-page.test.tsx`, `tests/unit/join-invite-cookie.test.ts`

**Interfaces:**
- Consumes: Task 4 `open`; `buildPublicMembershipCatalog` for the plan's benefits and price.
- Produces: cookie name `wtia_invite`; `readInviteCookie(): Promise<string | null>` (server-only; a UUID or null); `inviteCookieOptions(expiresAt: Date)` → `{httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt}`. The `continue` route handler (pages cannot set cookies) re-opens the invite, sets the cookie and 303-redirects to `localizedPath(locale, "/join?plan=<code>")` when signed in, else to member-login with `next` set to that path.

- [ ] **Step 1: Write failing tests**: a valid token renders the lead's name, the inviter's first name, the plan's name and price from the catalog, a Continue link to `/join/invite/<token>/continue`, and `robots: {index: false}`; unknown, expired, consumed and superseded each render the **same** neutral page with no contact name and no plan; a malformed token never calls `open`; the continue route sets `wtia_invite` with the options above and redirects 303; the 21st request in a minute from one `x-forwarded-for` gets the neutral page (`createInMemoryRateLimiter({limit: 20, windowMs: 60_000})` from `lib/security/rate-limit`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement in the join route group's layout.
- [ ] **Step 4:** Tests pass; `npx vitest run tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-redirects.test.ts tests/unit/locale-href-boundary.test.ts`.
- [ ] **Step 5: Commit** `feat(join): personal invite welcome page`.

### Task 7: Prefill and attribution; `became_member` activity

**Files:**
- Create: `lib/membership/join-invite-attribution.ts`
- Modify: `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx` (field defaults), `app/[locale]/(join)/join/actions.ts` (`saveProfile` :194 and `saveCompany` :236 — after `completeApplication` returns, before `redirectToOutcome`), `lib/db/repos/contacts.ts` (the auto-`member` flip at :739 inserts `became_member` only on an actual stage change)
- Test: `tests/unit/join-invite-attribution.test.ts`; extend `tests/unit/contacts-repository.test.ts`

**Interfaces:**
- Consumes: Task 4 `prefillFor`, `consume`; Task 6 `readInviteCookie`.
- Produces: `attributeJoinInvite(actor: Actor, applicationId: string): Promise<void>` — no cookie → returns without a repository call; calls `consume`; on either result clears the cookie; **never throws** (catches, logs `join_invite.attribution_failed` with the application id only). `inviteDefaults(): Promise<{displayName?: string; whatsappNumber?: string; legalName?: string; companyDisplayName?: string}>` — only keys that have values; pages use `draft.x ?? defaults.x ?? ""` so a draft value always wins.

- [ ] **Step 1: Write failing tests**: the profile page prefers the draft's `displayName` over the invite's; with an empty draft it shows the invite's name and phone; the company page fills `legalName` and `companyDisplayName` from `organisation`; `attributeJoinInvite` without a cookie makes no repository call; with a superseded invite (`consume` → `"not_live"`) the application is untouched and the cookie cleared (Review Focus 2); a second submit carrying the same cookie after consumption is a no-op (Review Focus 3); a repository error is swallowed and the log line contains neither the token nor an email; the auto-`member` flip run twice yields one `became_member` activity (Review Focus 4).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; call `attributeJoinInvite(actor, result.applicationId)` in both actions.
- [ ] **Step 4:** Tests pass, plus `npx vitest run tests/unit/join-billing-pages.test.tsx tests/unit/membership-public-catalog.test.ts`.
- [ ] **Step 5: E2E** `tests/e2e/join-invite.spec.ts` on rendered fixtures (pattern: `tests/unit/portal-render-fixtures.test.tsx` → `tests/e2e/portal-experience.spec.ts`): the welcome page at 390 and 1440 in en and zh has no horizontal scroll and a Continue control ≥ 44px tall; the invalid page shows no contact data. Run `PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/join-invite.spec.ts --project=chromium`.
- [ ] **Step 6: Commit** `feat(join): prefill and attribute invited applications`. **PR E-b** after full gates.

---

# Part E-c — board, digest, report (PR 3, stacked on E-b)

### Task 8: Board view

**Files:**
- Create: `components/admin/lead-board.tsx`
- Modify: `app/[locale]/(admin)/admin/contacts/page.tsx` (`view=board`), `lib/db/repos/contacts.ts` (`listBoard`), `messages/*.json` (`AdminContacts.board.*`)
- Test: `tests/unit/admin-lead-board.test.tsx`; extend `tests/unit/contacts-repository.test.ts`

**Interfaces:**
- Produces: `contactsRepository.listBoard(actor: Actor, filters: {ownerProfileId?: string | null; source?: ContactSource; overdueOnly?: boolean; includeClosed?: boolean}): Promise<Record<ContactStage, readonly BoardCard[]>>`, `BoardCard = Pick<ContactRow, "id" | "displayName" | "organisation" | "source" | "ownerName" | "nextStep" | "nextStepDueAt"> & {inviteOpened: boolean; applied: boolean}`; `member` holds contacts whose `stage_change` to `member` or `became_member` activity is within 30 days; `closed` only with `includeClosed`.

- [ ] **Step 1: Write failing tests**: columns New, Contacted, Qualified, Applied, Member in that order; Closed only with the filter; an overdue card carries the bundle's overdue label (not colour alone); each stage option is a `<form>` posting to `updateContactPipelineAction` with `returnTo` `/admin/contacts?view=board…`; "mine" passes the acting admin's profile id; zh-HK render.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as a server component; no drag-and-drop.
- [ ] **Step 4:** Tests pass; `npm run audit:strings`.
- [ ] **Step 5: Commit** `feat(admin): lead pipeline board`.

### Task 9: `lead-reminders` job and per-owner digest

**Files:**
- Create: `app/api/jobs/lead-reminders/route.ts`, `lib/automation/lead-reminders.ts`, `drizzle/0064_lead_reminders_job.sql` (`npx drizzle-kit generate --custom --name lead_reminders_job`; drop and re-add `job_health_registered_key` with every existing key plus `'lead-reminders'`)
- Modify: `lib/jobs/kinds.ts` (`LEAD_JOB_KIND = {REMINDERS: "lead-reminders"}`), `lib/jobs/runners.ts`, `lib/jobs/health-registry.ts` (`"lead-reminders": {crons: ["0 0 * * *"], graceMs: 3_600_000}`), `workers/src/index.ts` (job list, `JOBS_BY_CRON["0 0 * * *"]`, timeout `REQUEST_TIMEOUT_MS`), `workers/wrangler.toml` (add `"0 0 * * *"`), `lib/email/catalog.ts` (`lead_digest`), `messages/*.json`, `tests/unit/job-routes.test.ts`
- Test: `tests/unit/lead-reminders.test.ts`; extend `tests/unit/phase-e-schema-contract.test.ts` (0064 keeps every key listed in 0052 and adds `'lead-reminders'`)

**Interfaces:**
- Produces: `runLeadReminders(now: Date, deps?): Promise<{digestsSent: number; skipped: number}>` — per staff owner: overdue steps (due date before today, HKT), steps due today (HKT), invites opened more than 3 days ago with no application; unowned leads in an "Unassigned" block of every staff digest; template `lead_digest`; idempotency key `lead-digest:<ownerProfileId>:<YYYY-MM-DD HKT>`; empty digests not sent.

- [ ] **Step 1: Write failing tests**: a step due `2026-10-20` evaluated at `2026-10-19T23:59:00Z` (07:59 HKT on the 20th) is due today, not overdue (Review Focus 5), and at `2026-10-20T16:00:00Z` (00:00 HKT on the 21st) is overdue; an owner with nothing due gets no send; a second run on the same HKT date uses the same idempotency key; unowned leads appear in every digest; the worker's "every job is scheduled" test passes with the new cron; `job-routes.test.ts` lists the route.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement on the `ticket-emails` registration path; recipients from an existing staff-profile query (no new auth code).
- [ ] **Step 4:** Tests pass; `cd workers && npx vitest run`; snapshot refreshed for `lead_digest` only.
- [ ] **Step 5: Commit** `feat(automation): daily lead reminders digest`.

### Task 10: Conversion report `/admin/reports/leads`

**Files:**
- Create: `app/[locale]/(admin)/admin/reports/leads/page.tsx`, `lib/db/repos/lead-report.ts`, `components/admin/lead-report.tsx`
- Modify: `app/[locale]/(admin)/admin/reports/page.tsx` (link), `config/wisetech-protected-route-inventory.ts`, `messages/*.json` (`AdminReports.leads.*`)
- Test: `tests/unit/lead-report-repository.test.ts`, `tests/unit/admin-lead-report.test.tsx`

**Interfaces:**
- Produces: `leadReportRepository.summary(actor: Actor, window: "30" | "90" | "180" | "all"): Promise<LeadReport>`; `LeadReport = Readonly<{bySource: Record<ContactSource, Record<ContactStage, number>>; byOwner: readonly {ownerProfileId: string | null; ownerName: string | null; leads: number; invitesSent: number; invitesOpened: number; applications: number; members: number}[]; invites: {sent: number; opened: number; applied: number; paid: number; medianInviteToPaidHours: number | null; invitedVsJoined: readonly {invited: PlanCode; joined: PlanCode; count: number}[]}; estimatedFirstYearHkd: number}>`; `requireAdmin`; the page maps an unknown `?window=` to `"90"`.

- [ ] **Step 1: Write failing tests**: unknown window → `"90"`; non-admin refused; the estimate sums the public catalog's annual price per joined plan and the page shows the bundle's "estimate" label beside it; a repository failure renders the "unavailable" state, not zeros; en and zh-HK render; window links are unprefixed `Link` hrefs.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with SQL aggregates over `contacts`, `contact_activities`, `join_invites`, `membership_applications`, `memberships`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5: Commit** `feat(admin): lead conversion report`. **PR E-c** after full gates.

---

## Release (each step on the owner's instruction)

- Migrations 0063 (with E-a) and 0064 (with E-c): confirm each pending journal `when` exceeds production's `max(created_at)`, rehearse on a Neon branch, then apply (recipe in memory `hkwtia-member-portal-programme`).
- E-c needs a worker deploy (`wrangler deploy`) for the new cron — owner-run.
- Owner gate (spec §8): real invite → phone → sign-up → attribution visible in the report.
