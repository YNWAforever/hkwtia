# M2 Admin CRM acceptance evidence

This is the release-gate record for the bilingual, staff-only Admin CRM. It separates deterministic local and disposable-PostgreSQL evidence from authenticated Neon Auth evidence and preview-runtime evidence.

## End-to-end story

The authenticated browser suite signs in through `POST /api/auth/sign-in/email`, retains the returned session only in Playwright's browser context, and writes storage state only below ignored `test-results/m2-auth`. The request then reaches the force-dynamic admin layout, resolves the Neon Auth user to an application profile, enforces the staff role, executes actor-first repositories against the isolated database, and renders the server-produced CRM result. Anonymous and member actors receive a real 404 before any CRM query is exposed.

## Current source and environment

| Field | Evidence |
| --- | --- |
| Current reconciliation | v1.1 at-risk rule plus final reset-safety and non-staff API-denial review fixes |
| Database acceptance type | Disposable PostgreSQL 16 acceptance plus isolated Preview Neon project `solitary-wave-52860119` |
| Authenticated Neon database | Preview-only resource `store_pd28Ky103cAM2OEd`; destructive reset requires independent project-ID and database-host allowlist matches |
| Neon Auth test accounts | Staff, member, and company-admin accounts are isolated, rotated, and mapped to deterministic M2 profiles |
| Preview environment | All sixteen test-only acceptance names and five runtime mappings are configured for Preview |
| Production data | Not read, copied, mutated, or used as a fallback |

The authenticated suite requires all sixteen M2 preview environment names: `DATABASE_URL_TEST`, `M2_TEST_NEON_PROJECT_ID`, `M2_TEST_NEON_HOST`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID`, `STRIPE_TEST_CORPORATE_PRICE_ID`, `APP_URL`, `M2_TEST_STAFF_EMAIL`, `M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`, `M2_TEST_MEMBER_PASSWORD`, `M2_TEST_COMPANY_ADMIN_EMAIL`, and `M2_TEST_COMPANY_ADMIN_PASSWORD`. A local Playwright server maps `DATABASE_URL_TEST` to `DATABASE_URL`, `STRIPE_TEST_SECRET_KEY` to `STRIPE_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` to `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID` to `STRIPE_STARTUP_PRICE_ID`, and `STRIPE_TEST_CORPORATE_PRICE_ID` to `STRIPE_CORPORATE_PRICE_ID`; it never falls back to production values. Before any destructive Neon reset, the provider-supplied `NEON_PROJECT_ID` must exactly match the independently configured `M2_TEST_NEON_PROJECT_ID` allowlist, and the actual `DATABASE_URL_TEST` hostname must exactly match `M2_TEST_NEON_HOST`. Missing names skip only the nine authenticated M2 tests with one precise reason.

## Deterministic database evidence

Historical pre-reconciliation disposable-PostgreSQL acceptance passed 6/6 tests. It proves historical idempotent fixture counts, Member 360 composition, report aggregates, and fixture-domain safety only; it does not prove the revised v1.1 at-risk rule.

### Revised v1.1 local deterministic proof

The local deterministic seed and focused source contracts prove that `m2-risk-01` is Branch A only, `m2-risk-02` is Branch B only, and `m2-risk-03` matches both branches. The canonical low-score segment remains exactly those three profiles. The queue service evaluates all eligible memberships, selects the earliest qualifying renewal per profile, and resolves equal renewal dates by persisted membership ID.

Revised v1.1 isolated PostgreSQL acceptance passed 9/9 tests after migrating and combined-seeding an isolated Docker PostgreSQL 16 container twice. The production at-risk repository returns exactly `m2-risk-01`, `m2-risk-02`, and `m2-risk-03` in deterministic order; the revised report at-risk count is 3. This current proof covers Branch A only, Branch B only, both branches, and exclusion of all other seeded eligible memberships.

## Browser evidence

The protected stable Preview run collected 11 tests and passed 11/11 in 3.4 minutes:

- PASS: anonymous `/admin` returns HTTP 404; `/about` and `/membership` return 200; `/portal` redirects to join.
- PASS: real staff sign-in, Member 360 search, append-only note, and persisted success state.
- PASS: exact three-row segment and CSV, with two consented recipients and idempotent queueing.
- PASS: exact ordered at-risk queue and reconciled July report values.
- PASS: event check-in and exactly one `event_attended` engagement.
- PASS: supported approval decision with one persisted audit fact.
- PASS: representative axe checks have no serious or critical violations.
- PASS: Traditional Chinese admin headings and validation recovery state.
- PASS: anonymous, member, and company-admin identities receive HTTP 404 for every admin page in the matrix.
- PASS: the same three non-staff contexts receive HTTP 404 from `/api/admin/segments/[id]/export`.

The run used the real protected Preview, Neon Auth, isolated Neon database, and rotated test accounts. No authenticated M2 test passed through an adapter or in-memory substitute.

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

Current results: focused review contracts passed 17/17; full Vitest passed 102 files and 477 tests with 7 files and 18 tests skipped; typecheck and lint exited 0; the production build compiled, completed TypeScript, and generated 81/81 static pages. The final protected Preview browser story passed 11/11.

## Preview evidence

The final deployment remains Preview-only and was not promoted. No production credential was copied into Preview.

| Field | Evidence |
| --- | --- |
| Deployment | `dpl_4emvZyyYLHYH2mgMYQbfegq5uHqH` |
| URL | `https://hkwtia-jkb4t4t9l-ynwaforevers-projects.vercel.app` |
| Stable Preview alias | `https://hkwtia-ynwaforever-ynwaforevers-projects.vercel.app` |
| Target and status | Preview; READY |
| Framework | Next.js 16.2.10 |
| Build | READY with 81 static-generation items |
| Preview resources | Neon `store_pd28Ky103cAM2OEd`; Stripe Sandbox `ir_XMDqDjmaeN02byYU` |
| Stripe webhook | `we_1TwZ0tBaMWdN3MZGZiOZShyf`; five required events at the stable Preview alias |
| Preview variables | All sixteen acceptance names, provider `NEON_PROJECT_ID`, and five runtime mappings present |

Vercel Deployment Protection stayed enabled. The browser suite used a temporary share URL restricted to an HTTPS `vercel.app` host, disabled traces while the token was active, and deleted generated storage states after verification. The final 11/11 run exercised the application behind protection, and the deployment-specific 5xx scan found no errors.

## Operational rebuild requirements

If Preview is rebuilt, configure all sixteen acceptance names with test-only values and map staff/member/company-admin Neon Auth accounts to the seeded profiles. Preserve the independent `M2_TEST_NEON_PROJECT_ID` and `M2_TEST_NEON_HOST` allowlists, the five test-to-runtime mappings, and Preview-only scope. Rerun migration and seed against `DATABASE_URL_TEST`, the 11-test browser story, the anonymous/member/company-admin page and export-API denial matrix, and the deployment-specific 5xx scan. Record only non-secret resource and deployment identifiers here.
