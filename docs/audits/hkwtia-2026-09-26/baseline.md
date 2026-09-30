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

The original T00 environment statement is historical. Since then, Docker-owned disposable PostgreSQL fixtures have run migrations/seeds, capacity and transactional checks. At that checkpoint no configured shared DATABASE_URL_TEST or authenticated browser identity had been used; the later isolated Neon setup below supersedes this environment gate. No production migration has been used.

Current continuation adds migration 0050_event_attendee_exports after the 49-entry chain used by earlier capacity evidence. It widens the existing batch operation CHECK and adds a short-lived private artifact table. The background export reuses events.listAttendeePage, admin-batches, its authenticated worker route, and /api/admin/batches/[id]/export; no parallel export service was added.

## Approved continuation: public Preview access

The continuation began from 2b77fb871ff54006b0d51222caba730fd936b174 on the same isolated branch. PR #94 was already ready for review (no longer draft); the external automated review reported that it was skipped for unavailable service usage. That is not review approval.

Authorized Vercel protection access now permits read-only public checks on https://hkwtia-1iubzqpi0-ynwaforevers-projects.vercel.app. Only the deployment protection cookie is retained under ignored .playwright/. This public protection step supplied no member/staff session or database credential. The subsequent isolated Neon setup below supplies synthetic identities; the then-current payment preflight was unsatisfied; the test-mode continuation below supersedes that credential gate.

Rendering path mapping: handwritten app/styles/wisetech-shell.css owns the five-page opt-in; components/home/hero.tsx and the four existing public landing pages mark the starting hero. The generated wisetech.css port stays byte-pinned. tests/e2e/public-rendering.spec.ts checks native focus, fragments and print against an actual server.

## Isolated Neon and Auth continuation

Created branch codex-audit-20260927 (br-lingering-unit-azxl75s5) under the pre-existing hkwtia-m2-preview project solitary-wave-52860119. The production project fragrant-mountain-25240574 was not used. This new branch expires at 2026-10-04T12:00:00Z. Its cloned ledger contained six migrations and 30 synthetic M2 profiles. The actual repository migration runner applied the remaining chain through 0050; the M1 and guarded M2 seeds then succeeded. Five newly created synthetic Auth users map to the existing staff/member/company-admin/ExCo/superadmin fixtures. No verification email was sent.

Private connection strings, session cookies and generated passwords remain in ignored .playwright files. Local Next at localhost:3011 uses only this new branch. ADMIN_BATCH_ENABLED, MEMBER_IMPORT_ENABLED and MEMBERSHIP_GRANTS_ENABLED were enabled only there; no scheduled worker is connected. Existing batch worker repositories are driven by guarded fixture tools. The initial non-payment runs lacked STRIPE_TEST_SECRET_KEY; the subsequently supplied test key is privately configured and the real test flow below passed. The strict complete preflight still requires all 16 base inputs plus nine role/journey fixture inputs; independent non-payment browser suites require their 12 identity/database inputs. See evidence/isolated-neon-environment.json.

## Test payment and final application baseline

At 69eba85fe01a501a30560223e8f0ae8ff5a1fd40, CI and the median Linux Lighthouse gate pass. Vercel deployment dpl_Gqzg4LYYvYqEQNEAwsnKNJqosbfc is READY at https://hkwtia-pliwy2vk8-ynwaforevers-projects.vercel.app. Later verification-only commits are recorded in verification.md. No production alias was promoted.

A sixth synthetic Auth identity was added for payment acceptance. The user-supplied Stripe test key is stored only in ignored local test env files. Old Preview price IDs were absent from that test account; isolated products/prices use the unchanged seed amounts (startup HK$2,400/year; corporate HK$12,000/year, HKD, livemode=false). Stripe CLI forwarded genuine signed test events only to the local application. Membership 0e0fb976-6ef1-4efe-93cc-a7be55454d2a is now active after a real test payment. No live payment or real member message occurred.

For the strict M2 CRM suite, a separate empty hkwtia_m2_audit database was created on the same isolated branch, migrated through all 50 entries and seeded with exactly 30 M2 profiles. Five existing synthetic Auth IDs were mapped there. This preserves the first database's completed payment and grant evidence while providing the report's original fixture baseline. The operational queue tests explicitly rebase only known M2 fixture dates; historical July report checks restore the original dates.

## Final application candidate after provider acceptance

`1e4f6246ac42f3dd0249acad2be949aaf94a6aa6` includes two real-provider-discovered repairs: signed ticket paths now reach locale routing, and refund audit rows use the authenticated application profile ID required by the audit foreign key. The exact candidate Preview is https://hkwtia-p7vk6461f-ynwaforevers-projects.vercel.app (dpl_AvucgCHx4LsXy66QbaDJ6sua161f). Test/release-document commits after this SHA do not alter application behavior.

The isolated hkwtia_m2_audit database now contains the completed three-seat payment/refund evidence and earlier failed-attempt fixtures. The original membership fixture remains active in neondb. These consumed fixtures are retained; a new strict CRM seed or pending-payment fixture must use a fresh isolated baseline. All payment/refund objects have livemode=false. Ticket email uses only the test transport.

## Partner-logo release baseline — 2026-10-01 HKT

PR #105 merged as e7fa4add247489f525f015007460fb522fb1531b, identical tracked tree to verified 163a34bc. Canonical Production now resolves dpl_DLFixAkkcNmpMCUTu3BY98hTDstQ with existing Production configuration. Actual migration ledger remains 0051; no migration/seed occurred. Partner rows remain zero pending user selection of an existing privileged audit operator. [Release receipt](../../integration/partner-logo-production-release-2026-10-01.md). This dated follow-up does not change the original audit baseline or finding classifications.
