# M2 Admin CRM acceptance evidence

This is the release-gate record for the bilingual, staff-only Admin CRM. It separates deterministic local and disposable-PostgreSQL evidence from authenticated Neon Auth evidence and preview-runtime evidence.

## End-to-end story

The authenticated browser suite signs in through `POST /api/auth/sign-in/email`, retains the returned session only in Playwright's browser context, and writes storage state only below ignored `test-results/m2-auth`. The request then reaches the force-dynamic admin layout, resolves the Neon Auth user to an application profile, enforces the staff role, executes actor-first repositories against the isolated database, and renders the server-produced CRM result. Anonymous and member actors receive a real 404 before any CRM query is exposed.

## Current source and environment

| Field | Evidence |
| --- | --- |
| Implementation commit | Pending the scoped Task 12 commit; replaced in the post-deploy evidence update |
| Database acceptance type | Disposable local PostgreSQL 16, migrated twice and combined-seeded twice |
| Authenticated Neon database | Not configured; `DATABASE_URL_TEST` is absent |
| Neon Auth test accounts | Not configured; all six auth/server and account credential names are absent locally |
| Preview environment | Only `NEXT_PUBLIC_SITE_URL` is configured for Preview; database and Neon Auth names are absent |
| Production data | Not read, copied, or mutated |

The authenticated suite requires all of `DATABASE_URL_TEST`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `M2_TEST_STAFF_EMAIL`, `M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`, and `M2_TEST_MEMBER_PASSWORD`. A local Playwright server maps `DATABASE_URL_TEST` to its runtime `DATABASE_URL`; it never falls back to a production URL. Missing names skip only the eight authenticated M2 tests with one precise reason.

## Deterministic database evidence

The gated disposable-PostgreSQL acceptance passed 6/6 tests. It proves:

- Exact idempotent counts after two seeds: 4 plans, 30 profiles, 12 companies, 18 company members, 18 applications, 18 memberships, 30 engagement scores, 8 engagement events, 4 member notes, 6 email rows, 2 saved segments, 4 events, 9 event registrations, 1 queued campaign, 3 frozen recipients, and 2 pending approvals.
- One pending approval has the supported, privacy-safe campaign payload required by the real decision UI.
- The production segment compiler and production at-risk repository return exactly `m2-risk-01`, `m2-risk-02`, and `m2-risk-03` in renewal order.
- Production Member 360 composition returns membership, engagement, email, event, and note history.
- July 2026 report reconciliation is exactly ARR HKD 87,600; MRR HKD 7,300; renewal 2/4 (50%); first-year renewal 1/2 (50%); funnel 5/4/4/1; attendance 3/6 (50%); at-risk 3.
- Profile and campaign-recipient addresses use only the non-personal `.example.test` fixture domain.

## Browser evidence

The M2 file collects 10 tests. In the current credential-free run, 2 passed and 8 skipped:

- PASS: anonymous `/admin` returns HTTP 404 and the localized not-found UI.
- PASS: public `/about` and `/membership` remain presentational, while `/portal` remains protected.
- SKIP: real staff Member 360 search and append-only note.
- SKIP: exact three-row segment, exact CSV header, and repeat-safe campaign queue.
- SKIP: exact ordered at-risk queue.
- SKIP: reconciled report UI.
- SKIP: event check-in and exactly one `event_attended` engagement.
- SKIP: supported one-time approval decision.
- SKIP: Traditional Chinese admin headings.
- SKIP: member actor receives HTTP 404 for admin reports.

The full Playwright regression ran 78 tests with 69 passed and 9 skipped. The ninth skip is the pre-existing M1 live Neon/Stripe test. No authenticated M2 test passed through an adapter or in-memory substitute.

## Local release gates

Run in this order from the project root:

```powershell
npx.cmd vitest run tests/unit/m2-schema-contract.test.ts tests/unit/actor-authorization.test.ts tests/unit/admin-member-list.test.ts tests/unit/member-360.test.ts tests/unit/member-notes.test.ts tests/unit/segment-schema.test.ts tests/unit/segment-query.test.ts tests/unit/csv-export.test.ts tests/unit/campaign-queue.test.ts tests/unit/at-risk.test.ts tests/unit/event-check-in.test.ts tests/unit/approval-service.test.ts tests/unit/report-formulas.test.ts tests/unit/m2-seed.test.ts tests/unit/m2-browser-acceptance-contract.test.ts --reporter=dot
npm.cmd test -- --reporter=dot
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run audit:strings
npm.cmd audit --audit-level=high
npm.cmd run build
npm.cmd run test:e2e -- --reporter=dot
npm.cmd run test:lighthouse
```

Current results: focused Vitest 15 files and 89 tests passed; full Vitest exited 0; typecheck, lint, the 90-file visible-string audit, high-severity npm audit, and production build exited 0. Both Lighthouse membership URLs completed with their configured performance, accessibility, and SEO thresholds. The machine-readable full-Vitest reporters created no usable aggregate artifact in this Windows runner, so this document deliberately does not claim an exact full-suite count.

## Preview evidence

Preview deployment ID, URL, source commit, framework, build duration, log scan, and live HTTP checks are pending the post-commit preview deployment. Because Preview currently lacks database and Neon Auth variables, this gate is expected to prove the M0 presentational routes and anonymous admin 404 while recording database-backed event/portal limitations; it must not be promoted or supplied production credentials.

## Human-owned release gap

M2 is not closed. Create an isolated Neon branch, configure the seven required names with test-only values, create staff/member Neon Auth test accounts mapped to the seeded `m2-staff-01` and a seeded member profile, rerun the isolated migration and seed, then run the eight authenticated Playwright flows. Record only non-secret resource and deployment identifiers here.