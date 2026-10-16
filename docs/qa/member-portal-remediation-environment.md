# Member Portal remediation environment — T-MP00

Baseline: `e8254bab79cff5945da4abe995a7c075d0ce3d57` from `YNWAforever/hkwtia`.
Branch: `fix/member-portal-remediation-20261015`.

This workspace was materialized through the connected GitHub API because direct Git authentication is unavailable. Every fetched file is checked against its Git blob SHA; the exact upstream commit and tree objects were reconstructed and verified. Omitted files remain in the Git index with skip-worktree flags; they are not deletions. All application source and all unit/integration test source have been materialized. Additional document/image fixtures are materialized when required by the existing tests. This is a sparse checkout, not evidence of a complete source/archive download.

The input continuation ZIP and plan remain traceable to SHA-256 `3f1061e5afe2f99ad3b41acfac1fe82b72e828ac6959f4fa7010ec73caaecfcf`. No production deployment was modified or revalidated as part of environment preparation.

## Available local checks

`npm ci --ignore-scripts --no-audit --no-fund` installed 1,426 packages from the unchanged lockfile. Runtime: Node 24.19.0 / npm 11.9.0; repository CI specifies Node 22. The installed Next.js version is 16.3.8. No dependency upgrade was made. Installation scripts were initially disabled; later build/test results determine whether any package needs its documented setup.

Initial dashboard baseline: 4 test files / 38 tests passed. T-MP01 regression tests subsequently reproduced the audited defects before implementation. Final verification results belong in the execution record; this document does not promote focused tests into full-system acceptance.

## Unavailable acceptance prerequisites

The following names were checked for presence only and are absent: `DATABASE_URL_TEST`, `AUDIT_ISOLATED_ACCEPTANCE`, `M2_TEST_NEON_PROJECT_ID`, `M2_TEST_NEON_HOST`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `M2_MEMBER_EMAIL`, `M2_MEMBER_PASSWORD`.

No fixture run ID exists yet. No real member, company owner/admin/member, expired member or independent staff test session has been verified. No isolated database migration/seed, Stripe operation or notification was executed. Do not classify a credential-gated skipped suite as a pass.

Before stateful acceptance, an environment owner must confirm the database is isolated; existing `audit-isolated-db` / M2 guards must pass without modification. Run migrations before the guarded seed, use test-mode Stripe and test notification destinations, record fixture ownership and cleanup, and verify the application and test session use that same environment. M6 seeding is not required by this remediation plan.

T-MP00 and T-MP13 remain blocked on those real environment/identity/provider prerequisites. Local behavior, rendering, static checks and build can proceed independently.
