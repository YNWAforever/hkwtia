# M2 Admin CRM acceptance evidence

This is the release-gate record for the bilingual, staff-only Admin CRM. It separates deterministic local and disposable-PostgreSQL evidence from authenticated Neon Auth evidence and preview-runtime evidence.

## End-to-end story

The authenticated browser suite signs in through `POST /api/auth/sign-in/email`, retains the returned session only in Playwright's browser context, and writes storage state only below ignored `test-results/m2-auth`. The request then reaches the force-dynamic admin layout, resolves the Neon Auth user to an application profile, enforces the staff role, executes actor-first repositories against the isolated database, and renders the server-produced CRM result. Anonymous and member actors receive a real 404 before any CRM query is exposed.

## Current source and environment

| Field | Evidence |
| --- | --- |
| Current reconciliation | v1.1 at-risk rule source verification; no new cloud deployment |
| Database acceptance type | Revised isolated disposable PostgreSQL 16 acceptance passed 9/9 tests |
| Authenticated Neon database | Not configured; `DATABASE_URL_TEST` is absent |
| Neon Auth test accounts | Not configured; all six auth/server and account credential names are absent locally |
| Preview environment | Only `NEXT_PUBLIC_SITE_URL` is configured for Preview; database and Neon Auth names are absent |
| Production data | Not read, copied, or mutated |

The authenticated suite requires all fourteen M2 preview environment names: `DATABASE_URL_TEST`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, `STRIPE_TEST_CORPORATE_PRICE_ID`, `APP_URL`, `M2_TEST_STAFF_EMAIL`, `M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`, `M2_TEST_MEMBER_PASSWORD`, `M2_TEST_COMPANY_ADMIN_EMAIL`, and `M2_TEST_COMPANY_ADMIN_PASSWORD`. A local Playwright server maps `DATABASE_URL_TEST` to `DATABASE_URL`, `STRIPE_TEST_SECRET_KEY` to `STRIPE_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` to `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID` to `STRIPE_STARTUP_PRICE_ID`, and `STRIPE_TEST_CORPORATE_PRICE_ID` to `STRIPE_CORPORATE_PRICE_ID`; it never falls back to production values. Missing names skip only the eight authenticated M2 tests with one precise reason.

## Deterministic database evidence

Historical pre-reconciliation disposable-PostgreSQL acceptance passed 6/6 tests. It proves historical idempotent fixture counts, Member 360 composition, report aggregates, and fixture-domain safety only; it does not prove the revised v1.1 at-risk rule.

### Revised v1.1 local deterministic proof

The local deterministic seed and focused source contracts prove that `m2-risk-01` is Branch A only, `m2-risk-02` is Branch B only, and `m2-risk-03` matches both branches. The canonical low-score segment remains exactly those three profiles. The queue service evaluates all eligible memberships, selects the earliest qualifying renewal per profile, and resolves equal renewal dates by persisted membership ID.

Revised v1.1 isolated PostgreSQL acceptance passed 9/9 tests after migrating and combined-seeding an isolated Docker PostgreSQL 16 container twice. The production at-risk repository returns exactly `m2-risk-01`, `m2-risk-02`, and `m2-risk-03` in deterministic order; the revised report at-risk count is 3. This current proof covers Branch A only, Branch B only, both branches, and exclusion of all other seeded eligible memberships.

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

The historical Preview-only deployment predates this reconciliation; it was not promoted and no production credential was copied into Preview.

| Field | Evidence |
| --- | --- |
| Deployment | `dpl_3C3K6Tf3keuUaoDWygUbnbWVQt9P` |
| URL | `https://hkwtia-mrjl6yjcr-ynwaforevers-projects.vercel.app` |
| Target and status | Preview; READY |
| Source commit | `efdf1cc` |
| Framework | Next.js 16.2.10 |
| Build | Vercel reported 42 seconds; 81 static-generation items completed |
| Preview variable names | `NEXT_PUBLIC_SITE_URL` only; values were not read |

Direct unauthenticated HTTP requests were redirected by Vercel Deployment Protection and therefore were not counted as application evidence. `vercel curl` supplied only the platform protection bypass and reached the application without a WTIA session:

- PASS: `/about`, `/membership`, `/zh/about`, and `/zh/membership` each returned HTTP 200 with zero application redirects.
- FAIL: anonymous `/admin` returned HTTP 500 instead of the required real 404.
- FAIL: `/portal` returned HTTP 500 instead of redirecting to `/join?next=%2Fportal`.

The bounded deployment-specific error scan found exactly the two requests above. Both errors named missing runtime variables and contained no values or user payloads: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTUP_PRICE_ID`, `STRIPE_CORPORATE_PRICE_ID`, and `APP_URL`. Verification stopped at this first broken database/auth boundary; database-backed event routes and the eight authenticated M2 flows were not exercised on Preview.

## Human-owned release gap

M2 is not closed. Create an isolated Neon branch, configure all fourteen acceptance names with test-only values, and create staff/member/company-admin Neon Auth test accounts mapped to the seeded profiles. The required names are `DATABASE_URL_TEST`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, `STRIPE_TEST_CORPORATE_PRICE_ID`, `APP_URL`, `M2_TEST_STAFF_EMAIL`, `M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`, `M2_TEST_MEMBER_PASSWORD`, `M2_TEST_COMPANY_ADMIN_EMAIL`, and `M2_TEST_COMPANY_ADMIN_PASSWORD`. For Preview runtime verification, map `DATABASE_URL_TEST` to `DATABASE_URL`, `STRIPE_TEST_SECRET_KEY` to `STRIPE_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` to `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID` to `STRIPE_STARTUP_PRICE_ID`, and `STRIPE_TEST_CORPORATE_PRICE_ID` to `STRIPE_CORPORATE_PRICE_ID`; never copy production credentials. Rerun migration and seed against `DATABASE_URL_TEST`, run the eight authenticated Playwright flows, deploy a fresh Preview, and repeat the anonymous admin 404 and portal redirect checks. Record only non-secret resource and deployment identifiers here.
