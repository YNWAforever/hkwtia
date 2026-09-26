# Showcase Lead Email Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** A saved showcase introduction always has durable acknowledgement and staff-notification work, and a failed or interrupted send is retried without silently losing the notice or duplicating a provider-accepted email.

**Architecture:** Insert two outbox rows in the same transaction as the lead and contact. An immediate processor preserves the current fast acknowledgement path; the existing ten-minute Worker cron drains pending rows after a failure or crash. Claim leases fence concurrent runners. The exact Resend request payload is stored before the first send and reused with one stable idempotency key. Automatic retries stop before Resend's documented 24-hour dedupe window expires; unresolved and terminal failures create one staff task.

**Tech Stack:** Next.js 16, Drizzle/PostgreSQL 16, Resend transport, Vitest, Cloudflare Worker schedule.

**Evidence:** lib/showcase/lead-actions.ts swallows render/transport errors and returns success, while a duplicate lead exits before sending. Resend's official idempotency docs say keys are retained for 24 hours and retries must use the same payload.

## Global constraints

- Test first. Run and read the intended failure before production code.
- Preserve the contact-writer capability boundary. Cron writes require an automation actor. No actor-taking export belongs in a use-server module.
- Enqueue acknowledgement and staff notification transactionally with the lead/contact. A replay creates nothing new.
- Freeze to/from/subject/html/text/headers and idempotency key before the first provider call. Reuse those exact values on every retry.
- Give each claim a 10-minute lease and attempt-count fencing. Resume an expired claim only inside a 23-hour safety window; then mark uncertain and open a staff task.
- Retry network, rate-limit, server, and unclassified failures with a bounded delay; block provider client errors and exhausted attempts with a staff task. Never log the email body or recipient.
- Use a generated additive Drizzle migration; do not hand-edit its SQL or metadata.
- Do not run production migrations, seeds, or live provider sends in this task.
- Keep bilingual admin wording in messages/en.json and messages/zh-HK.json if the task UI gains a new label.
- Run focused tests, disposable PostgreSQL acceptance, the full unit suite, string audit, lint, typecheck, and build before handoff.

---

### Task 1: Reproduce and pin the loss

**Files:** tests/unit/m5-leads.test.ts, tests/unit/showcase-lead-email-runner.test.ts.

**Interface:** A lead service calls deliverLeadEmails(leadId) after createLead. A separate runner can process the same persisted jobs after a failed immediate call, without a second form submission.

- [x] Add a failing behavior test showing a provider failure leaves retryable work and that the next runner invocation sends the failed notice without resending the settled notice. Confirm the test fails because no retry work is recorded, not because of an import typo.
- [x] Add a separate assertion that a duplicate idempotency key does not create or re-send settled work.

### Task 2: Transactional outbox and repository

**Files:** lib/db/schema-core.ts, generated drizzle/0041_*.sql and drizzle/meta/*, lib/db/repos/showcase.ts, lib/db/repos/showcase-lead-email-outbox.ts, tests/integration/showcase-lead-contact-postgres.test.ts, tests/integration/showcase-lead-email-outbox-postgres.test.ts.

**Schema:** showcase_lead_email_outbox: id, lead_id cascade FK, kind (ack/staff), status (queued/sending/sent/blocked/uncertain), payload jsonb nullable, idempotency_key unique, attempt_count, next_attempt_at, claim_expires_at, first_attempt_at, provider_id, error_code, created_at, updated_at. Unique (lead_id, kind); due index. Payload is the exact EmailSendInput and is cleared after a confirmed send.

**Repository interface:** claimForLead(contactWriterActor, leadId, now), claimDue(automationCronActor, now, limit), freezePayload(actor, id, attemptCount, payload), markSent/markRetryable/markBlocked(actor, id, attemptCount, ...). Stale attempt-count tokens never settle a newer claim. Terminal transitions insert one staff task in the same transaction.

- [x] Extend the disposable PostgreSQL test to require two queued rows on first insert, none on replay, and rollback of lead/contact when the outbox insert fails. Run it red before implementing.
- [x] Add schema and generate migration using npx drizzle-kit generate --config=drizzle.config.ts --name showcase-lead-email-outbox. Inspect the generated diff for only intended objects.
- [x] Implement insert and actor-scoped claim/settle methods. Test concurrent claims, stale fencing, expired-claim recovery, and the 23-hour uncertain transition on disposable PostgreSQL.
- [x] Keep the existing lead/contact transaction tests green.

### Task 3: Immediate and scheduled delivery

**Files:** lib/showcase/lead-actions.ts, lib/showcase/lead-request-action.ts, lib/showcase/lead-email-runner.ts, lib/jobs/runners.ts, app/api/jobs/showcase-lead-emails/route.ts, lib/jobs/kinds.ts, workers/src/index.ts, worker-alert vocabulary, relevant unit tests.

**Interface:** runLeadEmailForLead(leadId, dependencies) handles the immediate path; runLeadEmailBatch(now, dependencies) drains up to a fixed bound. Both use the same claim/freeze/send/settle primitive. Production dependencies resolve email configuration lazily so a missing provider does not prevent lead capture.

- [x] Test failed transport, scheduled retry with byte-identical payload/key, independent ack/staff progress, no resend after sent, stale claim refusal, and expired provider window escalation.
- [ ] Add direct regression tests for provider client error and exhausted attempt count terminal escalation.
- [x] Implement the runner. Catch delivery failures only after recording a retryable or terminal state. Keep the public action result free of provider detail.
- [x] Wire a ten-minute cron job through createJobPost and WORKER_JOBS/JOBS_BY_CRON, including worker timeout and alert vocabulary. Extend job route and worker schedule tests so a missing trigger fails.
- [x] Verify the existing successful intro path still dispatches both emails promptly.

### Task 4: Gates and local commit

- [x] Run focused unit tests and RUN_POSTGRES_INTEGRATION=1 disposable PostgreSQL tests. Confirm no live credentials are used.
- [x] Run npm.cmd run audit:strings, npm.cmd run lint, npm.cmd run typecheck, npm.cmd test, and npm.cmd run build. Restore build-generated next-env.d.ts.
- [ ] Review git diff --check and the generated migration. Stage explicit paths and commit on the isolated branch with a conventional message.
- [ ] Report the local commit, test counts, skipped environment gates, and the public-remote publication block separately.
