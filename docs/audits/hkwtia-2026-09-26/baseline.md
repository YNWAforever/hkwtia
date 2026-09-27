# HKWTIA audit remediation baseline

- Audit SHA: `e309f9e82ee355de504c1372521f98a0ea04c2f3`.
- T00 checkout: `codex/audit-remediation-20260927` at the same SHA. `git ls-remote origin refs/heads/main` returned the same SHA on 2026-09-27 (Asia/Hong_Kong).
- The original local `main` is `6d3e0d725fae9daf93ba376aae6083730003c0bf`, 82 commits behind `origin/main`, and has unrelated untracked work. This task uses `C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation`; no original working-tree files were changed.
- Audit pack: six top-level SHA-256 values and 108 evidence ZIP entries verified. The ZIP is a historical selection at the same SHA, not a complete checkout. Its offline reproducer was run with Node 24.18.0 and in-memory dependencies; F03, F04, F08 reproduced, without a live DB or Stripe.
- Node 24.18.0, npm 11.16.0; `npm ci --no-audit --no-fund` installed the locked dependencies. `package.json` defines `test`, `test:e2e`, `audit:strings`, `lint`, `typecheck`, `build`; Vitest includes `tests/unit` and `tests/integration`, while Playwright uses `tests/e2e`.
- Migration journal ends at `0042_ticket_email_outbox`; the next additive migration must follow 0042. Worker configuration is `workers/wrangler.toml`, web CI is `.github/workflows/ci.yml`, and the browser runner is `playwright.config.ts`.
- `DATABASE_URL_TEST`, `DATABASE_URL`, and the four `STRIPE_TEST_*` variables were absent in the task shell. No migration, fixture, payment, or message was executed. A test database host has not been confirmed isolated. The local DB gate remains closed.
- The public live alias to deployment SHA mapping is unverified. Historical CSP and Vercel deployment IDs in the evidence ZIP do not establish the current deployed SHA.

## Current path map

| Plan interface | Current owner |
|---|---|
| Guest RSVP | `lib/events/guest-registration-action.ts`, `guest-registration-core.ts`, `components/marketing/guest-rsvp-form.tsx` |
| Ticket checkout and eligibility | `lib/tickets/checkout-actions.ts`, `checkout-core.ts`, `lib/db/repos/event-orders.ts`, `lib/membership/entitlements.ts` |
| Event CMS and cancellation | `components/admin/event-form.tsx`, `lib/admin/event-form-input.ts`, `event-action-core.ts`, `lib/db/repos/events.ts` |
| Join and membership billing | `lib/membership/join-service.ts`, `lib/db/repos/applications.ts`, `lib/billing/checkout-service.ts`, `app/[locale]/(join)/join/**` |
| Admin members and grants | `lib/db/repos/admin-members.ts`, `admin-membership.ts`, `components/admin/member-table.tsx`, `member-360.tsx`, `membership-comp-form.tsx` |
| Existing outbound and worker | `lib/billing/ticket-email-runner.ts`, `workers/src/index.ts`, `workers/wrangler.toml` |
| Existing segments/campaigns | `lib/admin/segments.ts`, `segment-actions.ts`, `lib/db/repos/campaigns.ts` |
| Public pages and navigation | `app/[locale]/(public)/**`, `components/home/**`, `config/internal-navigation.ts`, `components/internal-shell/navigation.tsx` |
| Plans catalog | `lib/membership/catalog.ts`, `lib/membership/public-catalog.ts` |
| Member login | `app/[locale]/member-login/page.tsx`, `actions.ts` |
| Public header | `components/layout/site-header.tsx`, `header-shell.tsx`, `config/navigation.ts` |
| Company identity / scope | `lib/db/repos/companies.ts`, `memberships.ts`, `applications.ts`, `lib/membership/onboarding.ts` |
| Generic jobs and durable delivery | `lib/jobs/runners.ts`, `lib/db/repos/job-runner-context.ts`, `lib/db/repos/campaigns.ts`, `lib/billing/ticket-email-runner.ts` |
| Config/auth | `lib/config/env.ts`, `lib/auth/actor.ts`, `lib/auth/authorize.ts` |

All listed audit source paths still exist at the identical Git SHA. No historical source was copied over the current tree. New interfaces in T01–T18 will be checked against these owners before editing callers.

## Continuation path map (current branch)

| Planned capability | Existing implementation reused / current addition |
|---|---|
| Bulk handler implementations | lib/db/repos/batch-handlers/*; original lib/admin/batches/handlers/* paths are thin exports |
| Public shared cache | lib/i18n/page-copy-cache.ts; lib/db/repos/public-posts.ts; components/layout/public-header.tsx |
| Import retention | lib/db/repos/member-import-retention.ts, lib/admin/imports/retention-config.ts, existing job/worker registry |
| Observability / alert rehearsal | lib/observability/audit-metrics.ts, audit-alerts.ts; scripts/audit-alert-check.ts |
| Whole-journey browser gate | Existing focused tests plus admin-batches.spec.ts/public-cache-isolation.spec.ts; .github/workflows/audit-acceptance.yml |

The original T00 environment statement is historical. Since then, Docker-owned disposable PostgreSQL fixtures have run migrations/seeds, capacity and transactional checks. No configured shared DATABASE_URL_TEST, authenticated Preview or production migration has been used.

Current continuation adds migration 0050_event_attendee_exports after the 49-entry chain used by earlier capacity evidence. It widens the existing batch operation CHECK and adds a short-lived private artifact table. The background export reuses events.listAttendeePage, admin-batches, its authenticated worker route, and /api/admin/batches/[id]/export; no parallel export service was added.
