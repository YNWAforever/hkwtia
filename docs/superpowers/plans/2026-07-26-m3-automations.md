# M3 Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete M3 lifecycle-automation milestone: deterministic onboarding, renewal, dunning and win-back journeys; bilingual Resend email; opt-in WOZTELL WhatsApp; queued campaigns; engagement scoring; approval expiry; staff visibility; authenticated job routes; and a Cloudflare Cron Worker.

**Architecture:** Neon remains the durable state machine and idempotency boundary. Typed journey definitions and pure scheduling/branching functions live in the Next.js application; repository functions enforce Actor authorization and transactional claims; delivery adapters isolate Resend and WOZTELL. A separate `/workers` package invokes POST-only job routes with bounded retry but never owns business state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Drizzle ORM, Neon Postgres, Vitest, React Email, Resend, WOZTELL adapter, Cloudflare Workers/Wrangler.

## Global Constraints

- M3 is limited to lifecycle automation, campaigns, scoring, approvals expiry, delivery adapters, staff automation views, and scheduler integration.
- Do not add AI agents, AI-Ops metrics, Showcase, Launch Pad, forum, groups, SMS, Cloudflare Queues, Cloudflare Workflows, or conversational WhatsApp routes.
- All journey business times are computed in `Asia/Hong_Kong`; Cloudflare cron expressions are UTC.
- Every database operation goes through `lib/db/repos` and receives an authorized `Actor`.
- Marketing email requires current `consent_marketing=true` and no active suppression; transactional email remains allowed.
- WhatsApp requires `whatsapp_opt_in=true` and a non-empty `whatsapp_number`.
- Delivery logs and operational logs contain no addresses, phone numbers, message bodies, tokens, or secrets.
- Database and provider idempotency both apply: unique delivery keys are permanent; Resend idempotency keys protect the provider crash window.
- The engagement formula is `min(100, sum(points * 0.97^weeks_ago))` over 180 days; trend is current score minus score as of 28 days earlier.
- M3 Preview uses real Cloudflare scheduling, test or WTIA-verified Resend sending, and mocked WOZTELL until WTIA WABA credentials and approved templates exist.
- Each task follows red-green-refactor, runs its focused tests, then commits independently.

---

## File structure

### Database and repositories

- `lib/db/schema-core.ts`: M3 enums, profile WhatsApp fields, journey state, delivery logs, suppressions, and staff tasks.
- `drizzle/0007_m3_automations.sql` plus `drizzle/meta/0007_snapshot.json` and journal update: generated migration.
- `lib/db/repos/journeys.ts`: enrollment, due claiming, state transitions, retry, and history reads.
- `lib/db/repos/deliveries.ts`: durable email and WhatsApp delivery records.
- `lib/db/repos/suppressions.ts`: marketing suppression and unsubscribe transaction.
- `lib/db/repos/staff-tasks.ts`: deduplicated operational tasks.
- `lib/db/repos/automation-admin.ts`: staff dashboard and Member 360 automation reads.
- `lib/db/repos/index.ts`: repository exports.

### Domain and delivery

- `config/journeys.ts`: typed journey and step catalogue.
- `config/whatsapp-templates.ts`: provider template names and variable order.
- `lib/automation/types.ts`: shared journey, step, context, and result types.
- `lib/automation/hong-kong-time.ts`: fixed HKT scheduling helpers.
- `lib/automation/schedule.ts`: journey row generation and lifecycle instance keys.
- `lib/automation/conditions.ts`: current-state branch and suppression decisions.
- `lib/automation/retry.ts`: retry classification and exponential backoff.
- `lib/automation/journey-runner.ts`: orchestration of claimed journey rows.
- `lib/automation/renewal-runner.ts`: reconciliation of renewal instances.
- `lib/automation/campaign-runner.ts`: frozen-recipient delivery.
- `lib/engagement/scoring.ts`: pure decayed score calculation.
- `lib/email/components/email-layout.tsx`: shared accessible email chrome.
- `lib/email/components/message-email.tsx`: catalogue-driven React Email body.
- `lib/email/catalog.ts`: required template IDs and bilingual message lookup.
- `lib/email/render.tsx`: HTML/text rendering.
- `lib/email/transport.ts`: transport contract, test transport, and Resend transport.
- `lib/email/unsubscribe-token.ts`: signed expiring token.
- `lib/channels/types.ts`: provider-neutral WhatsApp contract.
- `lib/channels/woztell.ts`: live/mock WOZTELL adapter and inbound normalization helpers.

### Jobs, routes, UI, Worker, and verification

- `lib/jobs/auth.ts`: constant-time bearer verification.
- `lib/jobs/handler.ts`: run-key claim/complete/fail wrapper.
- `lib/jobs/runners.ts`: job dependency wiring.
- `app/api/jobs/{journey-runner,renewal-runner,engagement-score,approvals-expirer,worker-alert}/route.ts`: POST-only handlers.
- `app/api/unsubscribe/route.ts`: one-click unsubscribe POST.
- `app/[locale]/(public)/unsubscribe/page.tsx`: signed-token confirmation page.
- `lib/admin/automations.ts`: admin service and audited retry.
- `lib/admin/automation-actions.ts`: server action.
- `components/admin/automation-dashboard.tsx`: job, queue, and failure view.
- `app/[locale]/(admin)/admin/automations/page.tsx`: staff route.
- `components/admin/admin-nav.tsx`: automation navigation.
- `lib/admin/member-360.ts`, `lib/db/repos/admin-members.ts`, `components/admin/member-360.tsx`: journey, WhatsApp, and suppression history.
- `messages/en.json`, `messages/zh-HK.json`: admin, unsubscribe, and all email content.
- `workers/package.json`, `workers/tsconfig.json`, `workers/wrangler.toml`, `workers/src/index.ts`, `workers/tests/worker.test.ts`: scheduler package.
- `scripts/seed-m3.ts`: deterministic M3 fixtures.
- `.env.example`, `package.json`, `package-lock.json`, `README.md`: dependencies, commands, and external readiness.

---

### Task 1: Add the durable M3 schema

**Files:**
- Modify: `lib/db/schema-core.ts`
- Create: `drizzle/0007_m3_automations.sql`
- Create: `drizzle/meta/0007_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `tests/unit/m3-schema-contract.test.ts`
- Modify: `tests/integration/migration.test.ts`

**Interfaces:**
- Produces: `JourneyState`, `WhatsappLog`, `MessageSuppression`, `StaffTask` inferred types.
- Produces: uniqueness invariants for `(profile_id, journey, instance_key, step)`, `delivery_key`, both log idempotency keys, suppression identity, and staff-task dedupe.

- [ ] **Step 1: Write failing schema contract tests**

```ts
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const schema = readFileSync("lib/db/schema-core.ts", "utf8");

describe("M3 schema", () => {
  it("defines recurring journey identity and durable delivery keys", () => {
    expect(schema).toContain('pgEnum("journey_status"');
    expect(schema).toContain('"instance_key"');
    expect(schema).toContain("journey_state_profile_instance_step_unique");
    expect(schema).toContain("journey_state_delivery_key_unique");
  });

  it("stores WhatsApp consent, suppressions, delivery logs and staff tasks", () => {
    expect(schema).toContain('"whatsapp_opt_in"');
    expect(schema).toContain('"whatsapp_number"');
    expect(schema).toContain('pgTable("whatsapp_log"');
    expect(schema).toContain('pgTable("message_suppressions"');
    expect(schema).toContain('pgTable("staff_tasks"');
  });
});
```

- [ ] **Step 2: Run the test and confirm red**

Run: `npm.cmd test -- tests/unit/m3-schema-contract.test.ts`

Expected: FAIL because the M3 tables and fields do not exist.

- [ ] **Step 3: Add schema declarations**

Add these public shapes in `schema-core.ts`, using the existing timestamp helpers and foreign-key style:

```ts
export const journeyStatusEnum = pgEnum("journey_status", [
  "scheduled", "processing", "sent", "skipped", "failed",
]);
export const staffTaskStatusEnum = pgEnum("staff_task_status", ["open", "resolved"]);

// profiles additions
whatsappOptIn: boolean("whatsapp_opt_in").default(false).notNull(),
whatsappNumber: text("whatsapp_number"),

export const journeyState = pgTable("journey_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  membershipId: uuid("membership_id").references(() => memberships.id, {onDelete: "cascade"}),
  journey: text("journey").notNull(),
  instanceKey: text("instance_key").notNull(),
  step: text("step").notNull(),
  scheduledAt: timestamp("scheduled_at", {withTimezone: true}).notNull(),
  status: journeyStatusEnum("status").default("scheduled").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  claimedAt: timestamp("claimed_at", {withTimezone: true}),
  claimExpiresAt: timestamp("claim_expires_at", {withTimezone: true}),
  deliveryKey: text("delivery_key").notNull(),
  errorCode: text("error_code"),
  completedAt: timestamp("completed_at", {withTimezone: true}),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  unique("journey_state_profile_instance_step_unique").on(table.profileId, table.journey, table.instanceKey, table.step),
  unique("journey_state_delivery_key_unique").on(table.deliveryKey),
  index("journey_state_due_idx").on(table.status, table.scheduledAt),
  index("journey_state_profile_idx").on(table.profileId, table.createdAt),
]);
```

Extend `emailLog` with `journeyStateId`, `idempotencyKey`, `locale`, `classification`, `attemptCount`, and `errorCode`. Define `whatsappLog` with the equivalent fields, `messageSuppressions` keyed by profile/channel/classification, and `staffTasks` with `profileId`, `journeyStateId`, `kind`, `dedupeKey`, `summaryCode`, `status`, and resolution timestamps.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npx.cmd drizzle-kit generate --config=drizzle.config.ts --name=m3_automations`

Expected: `drizzle/0007_m3_automations.sql`, snapshot, and journal entry are created. Inspect that additive defaults precede `NOT NULL`, foreign keys match text profile IDs, and all declared unique constraints and indexes exist.

- [ ] **Step 5: Run schema and migration tests**

Run: `npm.cmd test -- tests/unit/m3-schema-contract.test.ts tests/integration/migration.test.ts`

Expected: PASS; the migration integration test may skip only when `DATABASE_URL_TEST` is absent.

- [ ] **Step 6: Commit**

```powershell
git add lib/db/schema-core.ts drizzle tests/unit/m3-schema-contract.test.ts tests/integration/migration.test.ts
git commit -m "feat: add M3 automation schema"
```

### Task 2: Define journey schedules, HKT rules, conditions, and retry policy

**Files:**
- Create: `config/journeys.ts`
- Create: `lib/automation/types.ts`
- Create: `lib/automation/hong-kong-time.ts`
- Create: `lib/automation/schedule.ts`
- Create: `lib/automation/conditions.ts`
- Create: `lib/automation/retry.ts`
- Create: `tests/unit/journey-scheduling.test.ts`
- Create: `tests/unit/journey-conditions.test.ts`
- Create: `tests/unit/automation-retry.test.ts`

**Interfaces:**
- Produces: `JourneyName`, `JourneyStep`, `JourneyContext`, `ScheduledJourneyStep`.
- Produces: `scheduleJourney(input): readonly ScheduledJourneyStep[]`.
- Produces: `evaluateStep(step, context): "send" | "skip_condition" | "skip_suppressed"`.
- Produces: `classifyDeliveryFailure(status, attempt): RetryDecision`.

- [ ] **Step 1: Write the failing scheduling table tests**

```ts
it.each([
  ["onboarding_90d", "welcome", 0],
  ["onboarding_90d", "day90_review", 90],
  ["renewal", "renewal_90", -90],
  ["dunning", "dunning_3", 3],
  ["winback", "winback_60", 60],
] as const)("%s/%s schedules at the exact HKT-relative day", (journey, step, days) => {
  const rows = scheduleJourney({
    journey, profileId: "profile-1", membershipId: "00000000-0000-0000-0000-000000000001",
    instanceKey: "period:2027-01-01", anchor: new Date("2027-01-01T00:00:00+08:00"),
  });
  expect(rows.find((row) => row.step === step)?.scheduledAt.toISOString())
    .toBe(new Date(Date.parse("2027-01-01T00:00:00+08:00") + days * 86_400_000).toISOString());
});
```

Add condition cases for Day 7 login/no-login, Day 14 profile completeness, current marketing consent, email suppression, WhatsApp opt-in/number, and D90 low score. Add retry cases: network/429/5xx failures reschedule after 5 and 25 minutes; 4xx fails permanently; attempt three is terminal.

- [ ] **Step 2: Run focused tests and confirm red**

Run: `npm.cmd test -- tests/unit/journey-scheduling.test.ts tests/unit/journey-conditions.test.ts tests/unit/automation-retry.test.ts`

Expected: FAIL because automation modules do not exist.

- [ ] **Step 3: Add exact shared types**

```ts
export type JourneyName = "onboarding_90d" | "renewal" | "dunning" | "winback";
export type MessageClassification = "transactional" | "marketing";
export type JourneyChannel = "email" | "whatsapp";
export type StepCondition = "always" | "no_login" | "has_login" | "profile_below_70" | "score_below_20";
export type JourneyStep = Readonly<{
  key: string;
  offsetDays: number;
  template: string;
  classification: MessageClassification;
  channels: readonly JourneyChannel[];
  condition: StepCondition;
}>;
```

- [ ] **Step 4: Add the complete typed catalogue**

`config/journeys.ts` must contain every approved step and exact template mapping. `welcome`, renewal, dunning, and access-recovery messages are transactional; event, content, committee, survey, win-back, and campaign messages are marketing. Renewal D-14 and dunning D3 include WhatsApp.

```ts
export const JOURNEYS = {
  onboarding_90d: [
    step("welcome", 0, "welcome", "transactional"),
    step("day1_video", 1, "day1_video", "marketing"),
    step("day7_nudge", 7, "day7_nudge", "transactional", ["email"], "no_login"),
    step("day7_mixer", 7, "day7_mixer", "marketing", ["email"], "has_login"),
    step("day14_profile", 14, "day14_profile", "transactional", ["email"], "profile_below_70"),
    step("day30_recap", 30, "day30_recap", "marketing"),
    step("day45_content", 45, "day45_content", "marketing"),
    step("day60_committee", 60, "day60_committee", "marketing"),
    step("day90_review", 90, "day90_review", "transactional"),
  ],
  renewal: [
    step("renewal_90", -90, "renewal_90", "transactional"),
    step("renewal_60", -60, "renewal_60", "transactional"),
    step("renewal_30", -30, "renewal_30", "transactional"),
    step("renewal_14", -14, "renewal_14", "transactional", ["email", "whatsapp"]),
  ],
  dunning: [
    step("dunning_0", 0, "dunning_0", "transactional"),
    step("dunning_3", 3, "dunning_3", "transactional", ["email", "whatsapp"]),
    step("dunning_7", 7, "dunning_7", "transactional"),
    step("lapsed", 14, "lapsed_survey", "transactional"),
  ],
  winback: [
    step("winback_7", 7, "lapsed_survey", "marketing"),
    step("winback_21", 21, "winback_21", "marketing"),
    step("winback_60", 60, "winback_60", "marketing"),
  ],
} as const satisfies Record<JourneyName, readonly JourneyStep[]>;
```

- [ ] **Step 5: Implement deterministic HKT scheduling, conditions, and retry**

Use the fact that Hong Kong is fixed UTC+08:00 with no daylight-saving transitions. Generate `deliveryKey` as `journey:${profileId}:${journey}:${instanceKey}:${step}`. Keep condition evaluation pure and return explicit skip codes.

- [ ] **Step 6: Run focused tests**

Run: `npm.cmd test -- tests/unit/journey-scheduling.test.ts tests/unit/journey-conditions.test.ts tests/unit/automation-retry.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add config/journeys.ts lib/automation tests/unit/journey-scheduling.test.ts tests/unit/journey-conditions.test.ts tests/unit/automation-retry.test.ts
git commit -m "feat: define deterministic M3 journeys"
```

### Task 3: Add authorized journey, delivery, suppression, and staff-task repositories

**Files:**
- Create: `lib/db/repos/journeys.ts`
- Create: `lib/db/repos/deliveries.ts`
- Create: `lib/db/repos/suppressions.ts`
- Create: `lib/db/repos/staff-tasks.ts`
- Modify: `lib/db/repos/index.ts`
- Create: `tests/unit/automation-repository-authorization.test.ts`
- Create: `tests/unit/journey-repository.test.ts`
- Create: `tests/integration/journey-claim-concurrency.test.ts`

**Interfaces:**
- Produces: `journeysRepository.enroll`, `claimDue`, `markSent`, `markSkipped`, `reschedule`, `markFailed`, `retryFailed`, `listForProfile`.
- Produces: `deliveriesRepository.reserveEmail`, `completeEmail`, `reserveWhatsapp`, `completeWhatsapp`.
- Produces: `suppressionsRepository.unsubscribeEmailMarketing`.
- Produces: `staffTasksRepository.createOnce`.

- [ ] **Step 1: Write failing authorization and transition tests**

```ts
it("rejects member mutation and permits system mutation", async () => {
  await expect(repo.enroll(memberActor, enrollment)).rejects.toMatchObject({code: "FORBIDDEN"});
  await expect(repo.enroll(systemActor, enrollment)).resolves.toBe("created");
});

it("claims one due row exactly once across concurrent transactions", async () => {
  const [left, right] = await Promise.all([
    repo.claimDue(systemActor, now, 1, 300_000),
    repo.claimDue(systemActor, now, 1, 300_000),
  ]);
  expect([...left, ...right]).toHaveLength(1);
});
```

Test every allowed transition, stale lease recovery, unique enrollment, unique delivery reservation, idempotent unsubscribe, and staff-task dedupe.

- [ ] **Step 2: Run focused tests and confirm red**

Run: `npm.cmd test -- tests/unit/automation-repository-authorization.test.ts tests/unit/journey-repository.test.ts tests/integration/journey-claim-concurrency.test.ts`

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement repository contracts**

Use `FOR UPDATE SKIP LOCKED` in one transaction for due claims:

```sql
WITH due AS (
  SELECT id FROM journey_state
  WHERE (
    status = 'scheduled' AND scheduled_at <= $now
  ) OR (
    status = 'processing' AND claim_expires_at <= $now
  )
  ORDER BY scheduled_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT $limit
)
UPDATE journey_state AS target
SET status='processing',
    claimed_at=$now,
    claim_expires_at=$lease_end,
    attempt_count=target.attempt_count + 1,
    updated_at=now()
FROM due
WHERE target.id=due.id
RETURNING target.*;
```

Use `ON CONFLICT DO NOTHING` for enrollment, delivery reservation, and task dedupe. `retryFailed` must require an `AdminActor`, append an audit event, clear the error code, and reject sent/skipped rows.

- [ ] **Step 4: Run focused and Postgres concurrency tests**

Run: `npm.cmd test -- tests/unit/automation-repository-authorization.test.ts tests/unit/journey-repository.test.ts tests/integration/journey-claim-concurrency.test.ts`

Expected: unit tests PASS; Postgres test PASS with isolated DB or skip only when the isolated DB variable is absent.

- [ ] **Step 5: Commit**

```powershell
git add lib/db/repos tests/unit/automation-repository-authorization.test.ts tests/unit/journey-repository.test.ts tests/integration/journey-claim-concurrency.test.ts
git commit -m "feat: add automation repositories"
```

### Task 4: Enroll lifecycle journeys from current membership state

**Files:**
- Modify: `lib/db/repos/jobs.ts`
- Modify: `lib/membership/onboarding.ts`
- Create: `lib/automation/enrollment.ts`
- Create: `lib/automation/renewal-runner.ts`
- Create: `tests/unit/journey-enrollment.test.ts`
- Modify: `tests/unit/webhook-service.test.ts`
- Modify: `tests/unit/join-service.test.ts`
- Modify: `tests/unit/webhook-postgres-concurrency.test.ts`

**Interfaces:**
- Consumes: `scheduleJourney`, `journeysRepository.enroll`.
- Produces: `reconcileLifecycleEnrollments(actor, now)`.
- Produces: `runRenewalReconciliation(actor, now): Promise<JobSummary>`.

- [ ] **Step 1: Write failing lifecycle tests**

Cover active membership → one onboarding instance, `past_due` → one dunning instance, `canceled` or `lapsed` → one win-back instance, period end → one renewal instance, duplicate webhook/reconciliation → no duplicate rows, and free Community membership → onboarding.

```ts
expect(enrollments).toContainEqual(expect.objectContaining({
  journey: "onboarding_90d",
  instanceKey: `activation:${membership.id}`,
  step: "welcome",
}));
```

- [ ] **Step 2: Run tests and confirm red**

Run: `npm.cmd test -- tests/unit/journey-enrollment.test.ts tests/unit/webhook-service.test.ts tests/unit/join-service.test.ts`

Expected: lifecycle enrollment assertions FAIL.

- [ ] **Step 3: Add idempotent reconciliation**

`reconcileLifecycleEnrollments` queries active, past-due, canceled, and lapsed memberships through a system-only repository read and inserts missing step rows. This reconciliation closes the crash window for both Stripe and free membership activation.

`processWebhookLifecycle` keeps its membership mutation, jobs claim, engagement event, and audit transaction intact; after a successful non-stale status transition, insert the matching journey rows inside that transaction. The reconciliation remains a repair path.

- [ ] **Step 4: Add renewal reconciliation**

For each membership with a non-null `billing_period_end`, use `instanceKey = "period:" + billingPeriodEnd.toISOString()` and anchor renewal steps to that timestamp. Do not duplicate an instance when the runner repeats.

- [ ] **Step 5: Run lifecycle and webhook tests**

Run: `npm.cmd test -- tests/unit/journey-enrollment.test.ts tests/unit/webhook-service.test.ts tests/unit/join-service.test.ts tests/unit/webhook-postgres-concurrency.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/db/repos/jobs.ts lib/membership/onboarding.ts lib/automation tests/unit/journey-enrollment.test.ts tests/unit/webhook-service.test.ts tests/unit/join-service.test.ts tests/unit/webhook-postgres-concurrency.test.ts
git commit -m "feat: enroll membership lifecycle journeys"
```

### Task 5: Build bilingual React Email, Resend transport, and unsubscribe

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/config/env.ts`
- Modify: `.env.example`
- Create: `lib/email/components/email-layout.tsx`
- Create: `lib/email/components/message-email.tsx`
- Create: `lib/email/catalog.ts`
- Create: `lib/email/render.tsx`
- Create: `lib/email/transport.ts`
- Create: `lib/email/unsubscribe-token.ts`
- Create: `app/api/unsubscribe/route.ts`
- Create: `app/[locale]/(public)/unsubscribe/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/email-catalog.test.ts`
- Create: `tests/unit/email-render-snapshots.test.tsx`
- Create: `tests/unit/resend-transport.test.ts`
- Create: `tests/unit/unsubscribe.test.ts`

**Interfaces:**
- Produces: `EmailTemplateId` union with all 23 required IDs.
- Produces: `renderEmail(input): Promise<{subject; html; text; headers}>`.
- Produces: `EmailTransport.send(input): Promise<DeliveryResult>`.
- Produces: `signUnsubscribeToken`, `verifyUnsubscribeToken`.

- [ ] **Step 1: Install provider and rendering libraries**

Run: `npm.cmd install resend @react-email/components @react-email/render`

Expected: package manifest and lockfile include all three production dependencies.

- [ ] **Step 2: Write failing catalogue and snapshot tests**

```ts
const required = [
  "welcome", "day1_video", "day7_nudge", "day7_mixer", "day14_profile",
  "day30_recap", "day45_content", "day60_committee", "day90_review",
  "renewal_90", "renewal_60", "renewal_30", "renewal_14",
  "dunning_0", "dunning_3", "dunning_7", "lapsed_survey",
  "winback_21", "winback_60", "lead_ack", "lead_staff_notify",
  "approval_request", "campaign_generic",
] as const;

it.each(["en", "zh-HK"] as const)("renders every template in %s", async (locale) => {
  for (const template of required) {
    const rendered = await renderEmail({template, locale, recipientName: "Fixture Member", variables: fixtureVars});
    expect(rendered.subject).not.toMatch(/MISSING|undefined/);
    expect(rendered.html).toMatchSnapshot(`${locale}-${template}`);
  }
});
```

Test accessible language/title/preheader, dark-mode styles, marketing footer and unsubscribe headers, and absence of marketing footer for transactional email.

- [ ] **Step 3: Add bilingual catalogue content**

Add `Email` namespaces to both JSON bundles. Every template has `subject`, `preview`, `heading`, `body`, and `cta`. Preserve all supplied Cantonese copy exactly and validate both locales with the existing message tests.

- [ ] **Step 4: Build renderer and transports**

```ts
export interface EmailTransport {
  send(input: Readonly<{
    to: string; from: string; subject: string; html: string; text: string;
    headers: Readonly<Record<string, string>>; idempotencyKey: string;
  }>): Promise<{status: "sent"; providerId: string}>;
}
```

The test transport stores inputs in memory. The Resend transport calls `resend.emails.send(payload, {idempotencyKey})`, maps provider errors to sanitized `DeliveryFailure`, and never logs `to`, HTML, text, or credentials.

- [ ] **Step 5: Add signed unsubscribe flow**

Use `createHmac("sha256", CRON_SECRET)` over base64url JSON `{profileId, exp, locale}`. The route accepts POST only, verifies expiration and signature with `timingSafeEqual`, calls `unsubscribeEmailMarketing`, and returns an idempotent success response. The public page validates the token and renders confirm/success/invalid states.

- [ ] **Step 6: Run email and message tests**

Run: `npm.cmd test -- tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/resend-transport.test.ts tests/unit/unsubscribe.test.ts tests/unit/messages.test.ts`

Expected: PASS with snapshots committed.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json lib/config/env.ts .env.example lib/email app/api/unsubscribe app/[locale]/(public)/unsubscribe messages tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/resend-transport.test.ts tests/unit/unsubscribe.test.ts
git commit -m "feat: add bilingual lifecycle email delivery"
```

### Task 6: Add WOZTELL adapter and WhatsApp delivery

**Files:**
- Create: `config/whatsapp-templates.ts`
- Create: `lib/channels/types.ts`
- Create: `lib/channels/woztell.ts`
- Create: `tests/fixtures/woztell.ts`
- Create: `tests/unit/woztell-adapter.test.ts`
- Create: `tests/unit/whatsapp-delivery.test.ts`

**Interfaces:**
- Produces: `ChannelAdapter.sendSessionMessage`, `sendTemplateMessage`, `normalizeInbound`, `verifyWebhook`.
- Produces: `createWoztellAdapter(env, fetchImpl)` returning mock mode when token/channel are absent.

- [ ] **Step 1: Write failing adapter tests**

Test deterministic mock provider IDs, exact approved template name/variable mapping, live request headers/body, no call when opt-in or number is absent, sanitized failure mapping, STOP/`取消` normalization, and constant-time webhook secret rejection.

- [ ] **Step 2: Run and confirm red**

Run: `npm.cmd test -- tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts`

Expected: FAIL because channel modules do not exist.

- [ ] **Step 3: Add provider-neutral contract and template config**

```ts
export interface ChannelAdapter {
  sendSessionMessage(input: SessionMessageInput): Promise<ChannelResult>;
  sendTemplateMessage(input: TemplateMessageInput): Promise<ChannelResult>;
  normalizeInbound(payload: unknown): NormalizedInbound;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}
```

Map only renewal D-14 and dunning D3 to named approved-template configuration. Live mode is selected only when all WOZTELL credentials are present; otherwise mock mode returns `mock:${idempotencyKey}`.

- [ ] **Step 4: Run adapter tests**

Run: `npm.cmd test -- tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add config/whatsapp-templates.ts lib/channels tests/fixtures/woztell.ts tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts
git commit -m "feat: add WOZTELL channel adapter"
```

### Task 7: Execute journeys and queued campaigns idempotently

**Files:**
- Create: `lib/automation/journey-runner.ts`
- Create: `lib/automation/campaign-runner.ts`
- Modify: `lib/db/repos/campaigns.ts`
- Create: `tests/unit/journey-runner.test.ts`
- Create: `tests/unit/campaign-delivery.test.ts`
- Create: `tests/integration/journey-delivery-idempotency.test.ts`

**Interfaces:**
- Produces: `runJourneyBatch(deps, {now, limit}): Promise<RunnerSummary>`.
- Produces: `runCampaignBatch(deps, {now, limit}): Promise<RunnerSummary>`.
- Consumes: pure conditions, retry policy, renderers, transports, and repositories.

- [ ] **Step 1: Write failing runner tests**

Cover Day-7 branch selection, marketing suppression versus transactional delivery, one email log on duplicate runner calls, Resend crash-window idempotency, retry exhaustion, stale lease reclaim, D90 staff task, dunning D14 lapse/task, renewal D-14 WhatsApp opt-in, and campaign partial failure/resume.

```ts
await Promise.all([runJourneyBatch(deps, run), runJourneyBatch(deps, run)]);
expect(deps.emailTransport.sent.filter((item) => item.idempotencyKey === due.deliveryKey)).toHaveLength(1);
expect(await emailLogCount(due.deliveryKey)).toBe(1);
```

- [ ] **Step 2: Run and confirm red**

Run: `npm.cmd test -- tests/unit/journey-runner.test.ts tests/unit/campaign-delivery.test.ts tests/integration/journey-delivery-idempotency.test.ts`

Expected: FAIL because runners do not exist.

- [ ] **Step 3: Implement the journey state machine**

For each claim: load current context, evaluate branch and suppression, reserve delivery log, render, send, complete log, then mark the journey row. On retryable failure call `reschedule`; on permanent/exhausted failure call `markFailed` and `createOnce`. D14 unresolved dunning transitions the membership to `lapsed` through the membership repository and creates a task.

- [ ] **Step 4: Implement frozen campaign delivery**

Extend the campaign repository with atomic recipient claims and terminal transitions. Recheck current consent and suppression before delivery, but keep locale/variables from the frozen M2 recipient row. Mark the campaign complete only when no queued/processing recipients remain.

- [ ] **Step 5: Run focused and concurrency tests**

Run: `npm.cmd test -- tests/unit/journey-runner.test.ts tests/unit/campaign-delivery.test.ts tests/integration/journey-delivery-idempotency.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/automation/journey-runner.ts lib/automation/campaign-runner.ts lib/db/repos/campaigns.ts tests/unit/journey-runner.test.ts tests/unit/campaign-delivery.test.ts tests/integration/journey-delivery-idempotency.test.ts
git commit -m "feat: run journeys and campaigns idempotently"
```

### Task 8: Add engagement scoring and approval expiration

**Files:**
- Create: `lib/engagement/scoring.ts`
- Modify: `lib/db/repos/engagement.ts`
- Modify: `lib/db/repos/approvals.ts`
- Create: `lib/automation/engagement-score-runner.ts`
- Create: `lib/automation/approvals-expirer.ts`
- Create: `tests/unit/engagement-scoring.test.ts`
- Create: `tests/unit/engagement-score-runner.test.ts`
- Create: `tests/unit/approvals-expirer.test.ts`

**Interfaces:**
- Produces: `scoreEngagement(events, asOf): {score; trend}`.
- Produces: `recomputeEngagementScores(actor, asOf)`.
- Produces: `expireStaleApprovals(actor, asOf)`.

- [ ] **Step 1: Write failing fixture-table tests**

```ts
it.each([
  {points: [], score: 0, trend: 0},
  {points: [{points: 50, weeksAgo: 0}], score: 50, trend: 50},
  {points: [{points: 1000, weeksAgo: 0}], score: 100, trend: 100},
  {points: [{points: 10, weeksAgo: 26}], score: 0, trend: 0},
])("calculates $score and $trend", ({points, score, trend}) => {
  expect(scoreFixture(points, asOf)).toEqual({score, trend});
});
```

Also test exact fractional weeks, events after `asOf` exclusion, 180-day cutoff, score-as-of-28-days trend, score upsert, approval `requestedAt <= asOf - 72h`, audit event, and staff task.

- [ ] **Step 2: Run and confirm red**

Run: `npm.cmd test -- tests/unit/engagement-scoring.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts`

Expected: FAIL because scoring and expiry services do not exist.

- [ ] **Step 3: Implement pure scoring**

```ts
export function decayedScore(events: readonly EngagementPoint[], asOf: Date): number {
  const start = asOf.getTime() - 180 * 86_400_000;
  const sum = events
    .filter((event) => event.occurredAt.getTime() >= start && event.occurredAt <= asOf)
    .reduce((total, event) => {
      const weeksAgo = (asOf.getTime() - event.occurredAt.getTime()) / (7 * 86_400_000);
      return total + event.points * 0.97 ** weeksAgo;
    }, 0);
  return Math.min(100, Math.max(0, sum));
}
```

`trend = decayedScore(events, asOf) - decayedScore(events, new Date(asOf - 28 days))`. Store fixed two-decimal values.

- [ ] **Step 4: Implement system-only score and expiry transactions**

Batch profiles without loading personal fields. Expiring an approval updates only pending rows, appends an audit event, and inserts a deduplicated staff task.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- tests/unit/engagement-scoring.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/engagement lib/automation/engagement-score-runner.ts lib/automation/approvals-expirer.ts lib/db/repos/engagement.ts lib/db/repos/approvals.ts tests/unit/engagement-scoring.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts
git commit -m "feat: score engagement and expire approvals"
```

### Task 9: Expose secure idempotent job routes

**Files:**
- Create: `lib/jobs/auth.ts`
- Create: `lib/jobs/handler.ts`
- Create: `lib/jobs/runners.ts`
- Create: `app/api/jobs/journey-runner/route.ts`
- Create: `app/api/jobs/renewal-runner/route.ts`
- Create: `app/api/jobs/engagement-score/route.ts`
- Create: `app/api/jobs/approvals-expirer/route.ts`
- Create: `app/api/jobs/worker-alert/route.ts`
- Create: `tests/unit/job-auth.test.ts`
- Create: `tests/unit/job-handler.test.ts`
- Create: `tests/unit/job-routes.test.ts`

**Interfaces:**
- Produces: `verifyCronBearer(request, secret): boolean`.
- Produces: `createJobPost({kind, bucket, run}): (request) => Promise<Response>`.
- Uses existing `jobsRepository.claim/complete/fail`.

- [ ] **Step 1: Write failing route-security tests**

Test GET → 405, missing/wrong bearer → 401, equal-length and different-length wrong secrets → 401 without throwing, duplicate run bucket → 200 `{duplicate:true}`, runner failure → sanitized 500 and failed job, and no secret or recipient data in captured logs.

- [ ] **Step 2: Run and confirm red**

Run: `npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts`

Expected: FAIL because job route helpers do not exist.

- [ ] **Step 3: Add constant-time bearer verification**

```ts
export function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
```

Require `Authorization: Bearer <CRON_SECRET>` and reject an empty configured secret.

- [ ] **Step 4: Add run-key wrapper and routes**

Hourly keys use `kind:${YYYY-MM-DDTHH}`; daily keys use `kind:${YYYY-MM-DD}` in UTC. Routes pass an explicit `now`, claim the job, run the system service, and complete or fail the job. `worker-alert` accepts only `{job, scheduledTime, attemptCount, errorCode}` and emails current staff addresses without logging them.

- [ ] **Step 5: Run route tests**

Run: `npm.cmd test -- tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/jobs app/api/jobs tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts
git commit -m "feat: add secured automation job routes"
```

### Task 10: Add automation admin visibility and Member 360 history

**Files:**
- Create: `lib/db/repos/automation-admin.ts`
- Create: `lib/admin/automations.ts`
- Create: `lib/admin/automation-actions.ts`
- Create: `components/admin/automation-dashboard.tsx`
- Create: `app/[locale]/(admin)/admin/automations/page.tsx`
- Modify: `components/admin/admin-nav.tsx`
- Modify: `lib/admin/member-360.ts`
- Modify: `lib/db/repos/admin-members.ts`
- Modify: `components/admin/member-360.tsx`
- Modify: `app/[locale]/(admin)/admin/layout.tsx`
- Modify: `app/[locale]/(admin)/admin/members/[id]/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Create: `tests/unit/automation-admin.test.ts`
- Create: `tests/unit/automation-dashboard.test.tsx`
- Modify: `tests/unit/member-360.test.ts`
- Modify: `tests/unit/admin-presentational.test.tsx`

**Interfaces:**
- Produces: `AutomationDashboard` summary and paged rows.
- Produces: `retryAutomationAction(previousState, formData)`.
- Extends: `Member360` with `journeys`, `whatsapp`, and `suppressions`.

- [ ] **Step 1: Write failing service, authorization, and component tests**

Test admin-only access, due/upcoming/failed/job counts, no PII in dashboard rows, failed-only retry, audit append, navigation label, bilingual headings, Member 360 delivery/suppression sections, and non-staff 404 behavior.

- [ ] **Step 2: Run and confirm red**

Run: `npm.cmd test -- tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/member-360.test.ts tests/unit/admin-presentational.test.tsx`

Expected: FAIL because the automation admin surface does not exist.

- [ ] **Step 3: Implement repository and service**

Return stable DTOs:

```ts
export type AutomationDashboard = Readonly<{
  counts: {due: number; upcoming: number; failed: number; processing: number};
  jobs: readonly {kind: string; state: string; updatedAt: string; errorCode: string | null}[];
  rows: readonly {id: string; journey: string; step: string; status: string; scheduledAt: string; attemptCount: number; errorCode: string | null; retryable: boolean}[];
}>;
```

No profile email, phone, delivery body, provider ID, or token appears in this DTO.

- [ ] **Step 4: Build page, retry action, navigation, and Member 360 extensions**

Use existing `requireAdminPageActor`, server-action state patterns, glass-card styling, semantic tables, and localized paths. Retry invokes the repository transition and audit only; it never sends synchronously.

- [ ] **Step 5: Run admin and Member 360 tests**

Run: `npm.cmd test -- tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/member-360.test.ts tests/unit/admin-presentational.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/db/repos/automation-admin.ts lib/admin/automations.ts lib/admin/automation-actions.ts components/admin app/[locale]/(admin)/admin messages tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/member-360.test.ts tests/unit/admin-presentational.test.tsx
git commit -m "feat: add automation operations console"
```

### Task 11: Add the isolated Cloudflare Cron Worker

**Files:**
- Create: `workers/package.json`
- Create: `workers/package-lock.json`
- Create: `workers/tsconfig.json`
- Create: `workers/wrangler.toml`
- Create: `workers/src/index.ts`
- Create: `workers/tests/worker.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: Worker `scheduled(controller, env, ctx)` handler.
- Calls: `/api/jobs/journey-runner`, `/approvals-expirer`, `/renewal-runner`, and `/engagement-score`.

- [ ] **Step 1: Write failing Worker tests**

Test UTC cron mapping, bearer header, POST method, three total attempts with exponential delays, no retry after 2xx, alert endpoint after final non-2xx, and structured error log when both job and alert endpoints are unavailable.

- [ ] **Step 2: Run and confirm red**

Run: `npm.cmd install --prefix workers`

Run: `npm.cmd test --prefix workers`

Expected: FAIL because the Worker source does not exist.

- [ ] **Step 3: Add Worker package and schedules**

`workers/wrangler.toml` declares:

```toml
name = "hkwtia-m3-preview"
main = "src/index.ts"
compatibility_date = "2026-07-26"

[triggers]
crons = ["0 * * * *", "0 2 * * *", "0 18 * * *"]

[env.preview]
name = "hkwtia-m3-preview"
```

Hourly invokes journey and approval expiry; 02:00 UTC invokes renewal reconciliation; 18:00 UTC invokes engagement scoring. Environment-specific Preview triggers remain isolated from production.

- [ ] **Step 4: Implement bounded retry**

```ts
const delays = [250, 1_000] as const;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const response = await fetch(`${env.APP_URL}/api/jobs/${job}`, {
    method: "POST",
    headers: {authorization: `Bearer ${env.CRON_SECRET}`},
  });
  if (response.ok) return;
  if (attempt < 3) await sleep(delays[attempt - 1]);
}
await notifyFinalFailure(job, env);
```

Do not put secrets or response bodies in logs.

- [ ] **Step 5: Run Worker tests and typecheck**

Run: `npm.cmd test --prefix workers`

Run: `npm.cmd run typecheck --prefix workers`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add workers README.md
git commit -m "feat: add Cloudflare automation scheduler"
```

### Task 12: Seed, accept, harden, and verify M3 end to end

**Files:**
- Create: `scripts/seed-m3.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/unit/m3-seed.test.ts`
- Create: `tests/integration/m3-acceptance.test.ts`
- Create: `tests/e2e/m3-automations.spec.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: deterministic no-login/logged-in Day-7 members, marketing-unsubscribed member, opted-in and opted-out renewal members, due/failed journeys, and frozen campaign recipients.
- Proves: all five build-spec M3 acceptance checks plus Worker/admin/provider-boundary checks.

- [ ] **Step 1: Write failing seed and acceptance tests**

Acceptance assertions:

```ts
it("sends exactly once when the same hourly runner executes twice", async () => {
  await invokeJourneyRunner(hour);
  await invokeJourneyRunner(hour);
  expect(await emailLogsForDueStep()).toHaveLength(1);
});

it("takes both Day-7 branches from current login state", async () => {
  expect(await sentTemplate(noLoginProfile)).toBe("day7_nudge");
  expect(await sentTemplate(loggedInProfile)).toBe("day7_mixer");
});

it("allows transactional and blocks marketing after unsubscribe", async () => {
  expect(await sentTemplates(unsubscribedProfile)).toContain("renewal_14");
  expect(await sentTemplates(unsubscribedProfile)).not.toContain("campaign_generic");
});
```

Add full template locale snapshots, opted-in versus opted-out WhatsApp log assertions, campaign suppression/idempotency, Worker retry/alert, admin page, Member 360, and concurrent Postgres claim assertions.

- [ ] **Step 2: Run acceptance tests and confirm red**

Run: `npm.cmd test -- tests/unit/m3-seed.test.ts tests/integration/m3-acceptance.test.ts`

Expected: FAIL until the seed script and final wiring exist.

- [ ] **Step 3: Add deterministic seed and scripts**

Add `db:seed:m3` to root scripts. Seed idempotently with fixed IDs and HKT-relative timestamps so the acceptance suite controls `now` and never depends on wall-clock timing.

- [ ] **Step 4: Run the complete focused M3 suite**

Run: `npm.cmd test -- tests/unit/m3-schema-contract.test.ts tests/unit/journey-scheduling.test.ts tests/unit/journey-conditions.test.ts tests/unit/automation-retry.test.ts tests/unit/automation-repository-authorization.test.ts tests/unit/journey-repository.test.ts tests/unit/journey-enrollment.test.ts tests/unit/email-catalog.test.ts tests/unit/email-render-snapshots.test.tsx tests/unit/resend-transport.test.ts tests/unit/unsubscribe.test.ts tests/unit/woztell-adapter.test.ts tests/unit/whatsapp-delivery.test.ts tests/unit/journey-runner.test.ts tests/unit/campaign-delivery.test.ts tests/unit/engagement-scoring.test.ts tests/unit/engagement-score-runner.test.ts tests/unit/approvals-expirer.test.ts tests/unit/job-auth.test.ts tests/unit/job-handler.test.ts tests/unit/job-routes.test.ts tests/unit/automation-admin.test.ts tests/unit/automation-dashboard.test.tsx tests/unit/m3-seed.test.ts tests/integration/journey-claim-concurrency.test.ts tests/integration/journey-delivery-idempotency.test.ts tests/integration/m3-acceptance.test.ts`

Expected: PASS; DB-backed tests skip only when their isolated test environment is absent.

- [ ] **Step 5: Run full regression and static verification**

Run:

```powershell
npm.cmd test -- --reporter=dot
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd audit --audit-level=high
npm.cmd test --prefix workers
npm.cmd run typecheck --prefix workers
```

Expected: tests, typecheck, lint, build, and Worker checks PASS. Audit findings must be classified as pre-existing or introduced; M3 may not add a new high/critical vulnerability.

- [ ] **Step 6: Verify isolated Preview**

1. Create or reuse a Preview-only Neon branch/database, migrate, and run `db:seed:m3`.
2. Set Preview `CRON_SECRET`, WTIA-specific Resend variables when available, and WOZTELL variables absent for mock mode.
3. Deploy the Next.js Preview and Cloudflare `preview` Worker.
4. Invoke each job twice and verify job rows, email logs, WhatsApp mock logs, admin automation view, and Member 360.
5. If a WTIA-verified sender is ready, perform one live Resend smoke send and record its provider ID without exposing the recipient. Otherwise record the live-provider check as an external launch dependency.
6. Verify final Worker deployment status and latest Vercel deployment logs.

- [ ] **Step 7: Run browser acceptance**

Run: `npm.cmd run test:e2e -- tests/e2e/m3-automations.spec.ts`

Expected: staff can view `/en/admin/automations` and `/zh-HK/admin/automations`; member access returns 404; unsubscribe confirmation works in both locales.

- [ ] **Step 8: Commit final acceptance artifacts**

```powershell
git add scripts/seed-m3.ts package.json package-lock.json tests README.md .env.example
git commit -m "test: verify M3 automation milestone"
```

### Task 13: Final review and publish

**Files:**
- Review: all branch changes against `docs/superpowers/specs/2026-07-26-m3-automations-design.md`
- Review: all M3 requirements in `WTIA_Codex_Build_Spec_v1.1.md`

- [ ] **Step 1: Run requirement-by-requirement completion audit**

For every M3 design and build-spec item, record the proving file, focused test, database assertion, or deployed runtime check. Treat missing or indirect evidence as incomplete and fix it before proceeding.

- [ ] **Step 2: Run final diff and secret review**

Run:

```powershell
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Search the branch for live database URLs, API keys, bearer tokens, email addresses used as credentials, and unrelated sender domains. Expected: no secret or unrelated domain is committed and the worktree is clean.

- [ ] **Step 3: Use required verification and review skills**

Invoke `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Address every confirmed issue with focused regression tests and rerun the full verification matrix.

- [ ] **Step 4: Publish**

Push `codex/m3-automations`, create a ready pull request summarizing schema, journeys, providers, jobs, admin UX, tests, Preview evidence, and remaining external launch dependencies. Do not merge without the user's explicit merge instruction.
