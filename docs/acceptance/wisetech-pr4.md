# WiseTech PR4 acceptance record

**Overall status: PARTIAL** — deterministic source, test, build, and review gates pass. Database-backed browser routes and all authenticated, provider, Preview, accessibility, deployment, and production gates remain external and are not accepted as green evidence.

## Identity

| Field | Evidence |
| --- | --- |
| Acceptance date | `2026-08-29` (`Asia/Hong_Kong`) |
| Base | `codex/wisetech-pr3-institutional-pages` at `ddc4f18a4cace95cb46a21a6c49002627726783b` |
| Pre-acceptance implementation head | `258c9875a11b4705242c31db15aae4ce9cc9af88` |
| Acceptance commit | Pending. It will contain the final reviewed partner-confirmation provenance correction, the minimal route-parity documentation correction, their regression test, and this record. |

## Accepted source scope

| Surface | Boundary | Status |
| --- | --- | --- |
| Announcement CMS | Staff administration, validation, audit, publication lifecycle, and generated migration `0019` | PASS |
| General and Launch Pad partner CMS | Staff administration, privacy boundaries, confirmation/publication lifecycle, media locking, and generated migration `0020` | PASS |
| Secure media infrastructure | Private-R2 upload and revocation-aware own-origin delivery, with generated migration `0021` | PASS |
| Localized news CMS | English and Traditional Chinese staff authoring, with nullable legacy storage in generated migration `0022` | PASS |
| Public cutover | No public announcement, database-backed partner, or localized-news cutover is included in PR4 | NOT RUN |

## Deterministic verification

| Gate | Exact command | Result | Status |
| --- | --- | --- | --- |
| Focused PR4 surface | `$pr4Tests = @(rg --files tests/unit | Where-Object { $_ -match '(wisetech|announcement|partner|media|news|https-url|admin-page-auth-source)' }); $pr4Tests += 'tests/integration/migration.test.ts'; npm.cmd exec -- vitest run @pr4Tests` | 46 files and 410 tests passed. The database-gated migration file reported 2 skipped tests. | PASS |
| Database-backed migration cases | Same focused command | 1 file and 2 tests skipped because the database gate was not enabled. | SKIPPED |
| Complete Vitest suite | `npm.cmd test` | 360 files and 2,980 tests passed; 15 files and 40 tests skipped. One non-failing React test-mock warning reported `unoptimized={false}`. | PASS |
| Visible strings | `npm.cmd run audit:strings` | 163 TSX files scanned; exit 0. | PASS |
| Lint | `npm.cmd run lint` | Exit 0; 0 errors and 5 inherited test-only warnings in `dual-brand-lockup` and `public-shell`. | PASS |
| TypeScript | `npm.cmd run typecheck` | Exit 0. | PASS |
| Production build | `npm.cmd run build` | Next.js `16.3.0`; build passed with 122 static pages. A stale `caniuse-lite` warning remained. | PASS |
| Dependency audit | `npm.cmd audit --omit=dev --audit-level=high` | Exit 0; no high-severity finding. Four moderate dev-only Drizzle/esbuild transitives remain; no breaking force fix was applied. | PASS |
| Drizzle metadata | `npm.cmd exec drizzle-kit check` | Generated migration metadata is consistent. | PASS |

## Browser evidence

| Gate | Exact command | Result | Status |
| --- | --- | --- | --- |
| M2 credential-free boundary | `npm.cmd exec -- playwright test tests/e2e/m2-admin-crm.spec.ts --grep "M2 credential-free browser evidence" --project=chromium` | 2 of 2 tests passed. | PASS |
| M2 plus public-route matrix | `npm.cmd exec playwright test tests/e2e/public-route-matrix.spec.ts tests/e2e/m2-admin-crm.spec.ts --project=chromium` | npm emitted `Unknown cli config --project` and environment warnings because the separator was omitted. Playwright still used the repository's sole Chromium project and ran 49 tests: 36 passed, 9 authenticated cases skipped, and 4 failed strictly because `DATABASE_URL` was missing for `/launchpad`, `/zh/launchpad`, `/events`, and `/zh/events`. This is an external environment gate, not green browser evidence. | PARTIAL |
| Authenticated CMS, database, R2, Preview, and Lighthouse browser evidence | Not run | No claim is made for these environments or journeys. | NOT RUN |

## Independent review and corrections

| Review | Evidence | Status |
| --- | --- | --- |
| Whole-PR independent review after corrections | 0 Critical, 0 Important, and 0 Minor findings. | PASS |
| Partner confirmation provenance | Unrelated edits preserve exact confirmation timestamps; initial confirmation uses the injected clock; revocation clears the timestamp; audit fields include only real transitions. Existing media-lock ordering and lifecycle behavior remain covered. | PASS |
| Route-parity evidence | Table-alignment-only churn was removed while retaining the exact semantic admin and API route additions. | PASS |

## Migration and side-effect boundary

| Item | Evidence | Status |
| --- | --- | --- |
| Migrations `0019`, `0020`, `0021`, and `0022` | Generated and checked into the source set. | PASS |
| Migration execution | No migration was run. | NOT RUN |
| Seeds, imports, or database reads/writes | None performed for PR4 acceptance. | NOT RUN |
| Provider or object mutation | No R2/provider operation or object deletion was performed. | NOT RUN |
| Secret inspection | No credentials or secret values were inspected. | NOT RUN |

## Current public state

- Public announcements, database-backed partners, and localized news are not wired by PR4.
- Launch Pad continues to use `config/landing-partners.json` at runtime.
- Media exposure is limited to own-origin GET infrastructure; no real R2 upload/read is claimed.

## External acceptance gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| Isolated Neon and Preview | Provision an isolated target, verify identity, run migrations, and repeat the database/public matrix. | NOT RUN |
| R2 configuration and delivery | Supply authorized credentials and bucket; prove the bucket matches `R2_JURISDICTION` exactly; perform a real upload and read. | NOT RUN |
| Authenticated staff CMS/UAT | Exercise announcement, partner, media, and bilingual-news staff journeys against isolated migrated data. | NOT RUN |
| Bilingual content approval | Obtain content-owner approval for English and Traditional Chinese content. | NOT RUN |
| Partner evidence | Confirm current relationship dates, relationship authority, and logo rights before publication. | NOT RUN |
| Accessibility and Lighthouse | Run the approved bilingual accessibility and Lighthouse gates against the isolated Preview. | NOT RUN |
| GitHub and Vercel status | Verify remote checks and deployment state after publication of the branch. | NOT RUN |
| Production authorization | Obtain explicit approval before merge, deployment, migrations, imports, provider operations, or public cutover. | NOT RUN |

## Rollback

Deploy the PR3/base application commit while retaining the additive schema and any R2 objects. Do not perform a destructive schema downgrade or delete stored objects as part of this PR rollback.

## Deferred work

| Release | Deferred scope | Status |
| --- | --- | --- |
| PR5 | Public cutover, event hero media, and shared membership catalogue | NOT RUN |
| PR6 | Join and checkout consumption | NOT RUN |
| PR7 | Reviewed zero-row/import execution, content, rights, translations, and launch gates | NOT RUN |
