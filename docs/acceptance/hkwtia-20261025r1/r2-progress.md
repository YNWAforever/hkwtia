# R2 offline continuation — 2026-10-26

Started on `wtia/hkwtia-plan-r1-20261025` at `fcc1a278d5f1f2fb869b5c804328e9189ccb8456`, using the authoritative product-development plan v2. This record supplements, rather than replaces, the historical R1 evidence. No historical test result is counted as current evidence.

| Task | Code | Tests | Deployment | Runtime |
| --- | --- | --- | --- | --- |
| T22-04A | Seven server-only service operations, transaction port, input/URL bounds, applicant/staff boundaries, request/response history, idempotency, audit and receipt writes in one transaction callback | Unit fake repository: concurrent publication, responded-open exclusion, stale/cancelled retries, ownership, hidden unpublished cancellation, rollback, lost response and receipt recovery; final counts below | Not deployed | **BLOCKED**: no verified T22-02 identity/isolated target; no SQL adapter, schema, migration, constraint or persistence acceptance |
| T22-06 | Separate owner-scoped `listOwnedPage` and `getOwnedById`, SQL adapter, paged portal list and direct detail read; unbounded `listOwned` retained for join and legacy consumers | Fake-port keyset tests, real Drizzle SQL rendering, EN/ZH page and hostile-reader projection tests; final counts below | Not deployed | **BLOCKED**: SQL has not executed against PostgreSQL; real applicant sessions and browser persistence not verified |
| T-MP10 | Versioned existing self-service link/copy contract consumed by membership page; membership refund entitlement and review SLA explicitly `unknown` | Real EN/ZH message keys, links, existing qualifications, empty association-policy registry and prior policy selection tests | Not deployed | **BLOCKED**: no new policy approval or live self-service acceptance claimed |
| T22-02 | No target created or selected | No identity/PostgreSQL acceptance performed | Not deployed | **BLOCKED** until the verified non-production target and real identities exist |
| T22-08 / T22-13 stretch | Deferred to preserve the three priority slices and verification | Not tested | Not deployed | Not tested |

## Implementation boundaries

`lib/membership/supplement-service.ts` exposes a repository-injected service factory with the seven plan-named operations. It is **not** a Server Action, a default database repository, or a runtime-enabled feature. Future HTTP/Server Action entrypoints must establish their own actor and preserve an explicit feature gate. No flag was enabled or environment configuration changed. No migration draft was added or applied.

The offline port exposes a transaction snapshot for fake-repository verification. It is not a scalable SQL adapter: the production implementation must use scoped reads/writes, atomic audit/receipt storage, serialization and a database partial uniqueness constraint over published/responded requests. The fake repository demonstrates the service contract under that serialization assumption; it cannot establish PostgreSQL durability, locking or rollback behavior.

Only exact `staff` actors mutate requests; only the application applicant (`member.profileId`) responds/lists, independent of company ownership. Mutation results distinguish saved/conflict/unknown/validation/forbidden. Unknown results retain retry answers and operationRequestId; receipt lookup never invents a successful commit. Retry the same key/payload after lookup; do not treat unknown as permission to start another operation. Business request IDs and operationRequestIds remain distinct.

Drafts cancelled before publication remain invisible. Published responded/closed/cancelled requests retain member-readable history and answers. Internal context and cancellation reasons are not projected. Historical reads are independent of application actionability and future write enablement. No replacement of company/profile data, automatic membership approval, file upload, email or WhatsApp send was introduced.

Paging defaults to 20, caps at 50 and fetches limit+1. The cursor binds version, owned-query scope, applicant, exact UTC PostgreSQL microsecond timestamp and UUID; SQL enforces applicant ownership separately. It is a live keyset, not snapshot isolation: updated rows may reorder after refresh. Detail failures remain errors, distinct from a missing/foreign record. The portal now pages; join-resume retains its complete owned history.

The self-service contract versions shipped link/copy facts only. It does not populate `MEMBERSHIP_POLICIES`, approve legal terms, promise refunds or review deadlines, or alter Stripe state machines. EN/ZH paging strings were added together; existing membership policy copy was reused unchanged.

## Test-first and review evidence

- Supplement placeholders returned unknown: 15 behavioral failures (saved/validation/authorization expectations); implementation then passed. The initial missing-operation smoke was not used as sufficient behavioral evidence.
- Paging placeholder: five intended behavior failures (limit+1, scoped cursor, detail read and authorization). SQL-adapter stub: two failures because no query executed; portal regression failed because detail still listed all history. Implemented and reran green.
- Policy contract placeholder failed its missing version assertion before adding the version/unknown fields. Existing bilingual facts were verified against shipped bundles.
- Portal paging: three new failures for ignored cursor/missing navigation and repeated-cursor recovery before wiring the page.
- Independent read-only review found unpublished draft cancellation exposure. Added regression, observed the cancelled draft in the member result, required publication evidence and reran green. Cross-operation idempotency coverage uses a valid transition payload and rejects key reuse.
- First broad suite: 896 files passed, one failed, 113 skipped; 7,898 passed, eight failed, 643 skipped. All eight failures came from the application-security UI repository mock missing the new detail method. Updated it to the new read contracts while retaining hostile foreign rows and assertions; focused security tests pass. This first run is **FAIL**, not acceptance PASS.

## Final checks

Tested product HEAD: `61b74c6c61647f13e7a5d27f05a9062a45b337e4`. Final focused suite: **91 passed / 9 files**. Full suite: **7,910 passed / 643 skipped**, 897 files passed / 113 skipped, exit 0, no unhandled errors. Build (Next 16.4.3), typecheck, lint (0 errors / 77 warnings), visible strings (357 TSX files) and diff checks all exit 0. Build-generated `next-env.d.ts` path changes were restored. Exact commands and commit references are recorded in `r2-verification.json`. Worker/dependency audits were not rerun: those source areas were unchanged and their historical evidence remains separate. No browser matrix, real identity, integration, deployment or provider PASS is implied by jsdom, SQL rendering or fake transaction tests.

## Remaining gates and recommended next slice

Verify T22-02 first: source-verified isolated Neon/Auth target, approved real test identities and appropriate test-mode provider configuration. Then implement the supplement SQL adapter/schema and transaction/unique-open-request/receipt constraints, run migration and concurrency/rollback acceptance only there, and build feature-gated staff/member UI. Preserve historical readability while writes are disabled. Execute the owned paging SQL against the existing explicitly gated disposable PostgreSQL harness before claiming database acceptance. No composite applicant/updatedAt/id index migration was added: review that migration and EXPLAIN/rows/bytes/p95 using the 10k fixture on the verified target. Cross-channel FAQ/checkout/billing/notification legal policyVersion/effectiveAt unification and Stripe test entitlement acceptance remain pending actual business approval; the shipped-link contract is only the offline subset.

PR #212 remains stacked on #211. Its base is excluded by the existing CI trigger; the earlier workflow-scope rejection and unapplied `stacked-ci-trigger.patch` remain unresolved. Local checks do not establish exact-head remote CI acceptance. No merge, manual deployment, promotion, production writes, Neon fixture seed, live Stripe or messaging was performed.
