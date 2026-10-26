# R2 resources and supplement binding — 2026-10-26

Continued from `7c7ddf7ff1a956bbb5e7bb44b110aab8cc4fe868` on `wtia/hkwtia-plan-r1-20261025`, PR #212 stacked on #211. CLI only; no browser use or Playwright run. This slice does not claim completion of Task 11 or authenticated T22-04B acceptance.

| Layer | T-MP08 | T22-04B |
| --- | --- | --- |
| Code | Partial: version/publication/plan reader contract reused through portal `listApproved`; empty owner source | Actor-resolving actions → gated server-only binding → SQL service/repository; bound server form wrappers intentionally unmounted |
| Tests | Unit published/draft/withdrawn, v1/v2, owner/seat/outsider and revoked grants; existing receipt/repository and document grouping controls rerun | EN/ZH jsdom through binding + real service/fake transaction; gate/session/action units; six gated SQL cases including binding |
| Deployment | Not deployed | Not deployed; write flag not enabled |
| Runtime | Owner content, CMS/private source and protected byte download BLOCKED; no resource DB acceptance | Synthetic isolated DB PASS; real Auth/HTTP/browser BLOCKED |

## Resource discovery and scope

Codebase graph MCP tools were not available in the active tool inventory, so discovery used `rg` and source reads. Read Task 11 in the v2 product plan, the linked public/admin and test/secret histories, and installed Next 16.4.3 Server Function documentation before implementation.

Located `lib/portal/content.ts`, the documents page and `DocumentList`, `lib/db/repos/admin-posts.ts` / `public-posts.ts`, media delivery and `lib/db/repos/kb-documents.ts`. The portal's resource adapter was empty. Staff CMS authoring is scoped to news; public posts and anonymously cached media do not provide private document publication. Knowledge chunks have public/staff audiences and governance, not a member-file delivery contract. None is an equivalent private member-resource adapter. No CMS rows were repurposed or synthetic resources published.

`lib/portal/member-resources.ts` defines a server-only source contract. It resolves the latest non-draft version before audience filtering: draft v2 preserves published v1; published v2 invalidates v1 authorization; withdrawn v2 never revives v1; narrowing v2 plans cannot expose an older broad version. Member ownership and active company seats share the applicable plan resource entitlement; billing access remains separately scoped by the existing trusted billing repository. Each authorization reloads current memberships and source state. This is an authorization contract, **not a download endpoint**. Lists expose no permanent byte URL.

The default `listApproved` composes this reader with `requestMemberships` and an empty version source. No owner materials were supplied. There is no new resource schema, SQL persistence, editor, private object store, streaming route or real download acceptance. Those Task 11 items remain blocked/pending, not passed or formally rescoped to receipts-only. Receipt links/grouping and the independent billing route remain intact; expired/cancelled owners retain that existing billing path independently of benefit resources. No new user-visible strings were introduced.

## Supplement composition and SQL acceptance

`app/actions/supplements.ts` exports two actions. Each checks `HKWTIA_SUPPLEMENT_WRITES_ENABLED === "true"`, resolves its own request actor through `getActor`, and passes untrusted payloads through strict service validation. No actor argument is accepted. Default/missing flag returns forbidden before session/SQL work. The flag name is in `.env.example` only; no runtime environment setting was changed.

`createSupplementBinding` takes a server-controlled write gate and actor resolver; its default repository is the SQL adapter. Tests inject synthetic actors and the explicitly verified isolated SQL repository. Actor resolution occurs on every operation, and receipt reads remain available in the internal binding when writes are disabled. Bound form wrappers supply the concrete actions to the existing injectable forms. They remain unmounted: page read authorization/projection, actual sessions and browser round trips are still required before enabling/mounting. No draft creation/editor or automatic application approval was added.

The gated PostgreSQL suite uses only `.env.acceptance.local` through the existing verifier for Neon `dark-cake-07139424` / `br-restless-pond-a11dpkvd`. Six cases passed, including disabled gate, SQL publish, outsider response refusal, applicant response persistence, and receipt read after write disablement. The original migration/ownership/idempotency/concurrency/unique-index/rollback cases remain green. Synthetic profiles are unbound to Auth. Existing exact-ID cleanup removes this suite's fixture data and audit rows. No migration or seed was run against any other target; this slice needed no new migration.

## Test-first and failed attempts

- Resource placeholder: four intended failures (published owner/seat access, outsider denial, version authorization), one passing negative-only case; then implementation passed. Added a current-grant revocation/anonymous regression.
- Binding placeholder: two intended failures for disabled-gate and actor authorization behavior; then implementation passed.
- Action placeholders: five intended failures for disabled/missing-session refusal and correct operation delegation; then implementation passed.
- Initial typecheck caught a TSX generic syntax error in the updated test helper; corrected `<T>` to `<T,>` and reran successfully.
- First expanded gated DB run: five passed / one failed because the new binding case added historical rows before the original empty-history test. Moved it after the existing visibility/idempotency cases; rerun six passed. This first run is FAIL, not acceptance evidence.

## Redacted commands and verification

No connection strings or credentials appear in commands or this record. Acceptance configuration was never sourced into the broad suite.

```sh
npx vitest run tests/unit/member-resource-access.test.ts tests/unit/supplement-binding.test.ts tests/unit/supplement-actions.test.ts tests/unit/supplement-ui.test.tsx tests/unit/portal-content-scope.test.ts tests/unit/portal-documents.test.tsx tests/unit/billing-repository-security.test.ts tests/unit/checkout-service.test.ts tests/unit/server-action-actor-boundary.test.ts
HKWTIA_DB_ACCEPTANCE=1 npx -y -p node@22 node node_modules/vitest/vitest.mjs run tests/integration/application-supplements.test.ts
npm test
npm run lint
npm run typecheck
npm run build
npm run audit:strings
git diff --check
```

Tested code commit: `a5891fccfd3761186e69c25b411b0b16b001eeac`. Final aggregate results are recorded in `r2-resources-binding-verification.json`. Focused suite: 173 tests / nine files PASS. Gated SQL suite: six tests / one file PASS. Final full suite: **7,976 passed / 657 skipped**, 906 files passed / 116 skipped, exit 0. Build, post-build typecheck, lint (0 errors / 77 warnings), strings (360 TSX files) and diff checks PASS. Earlier broad results are historical; this final broad run includes the added action modules. Build-generated `next-env.d.ts` changes are restored before commit.

## Remaining gates and next slice

Obtain real isolated A/B/staff sessions and verify the actual HTTP action positive/negative controls, then mount the authorized form reads and complete staff → applicant → staff UAT. Do not enable the write flag merely because synthetic DB acceptance passes. For resources, obtain approved owner materials and document type/size/retention decisions; implement a private source/publication workflow and protected no-store download route with current-version/grant rechecks, then run direct-download and withdrawal acceptance. No missing materials are filled with fake content.

Auth sessions, Stripe test credentials, notification sink, real browser/device/lab/RUM and exact-head remote CI remain blocked or unverified. The stacked-base CI trigger limitation remains separate. No merge, manual deployment, production seed, live Stripe or messaging occurred.
