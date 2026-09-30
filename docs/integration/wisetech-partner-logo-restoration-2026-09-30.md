# Partner logo restoration: 2026-09-30 evidence

## Scope and provenance

The live homepage and /partners pages did not display partner logos. A read-only
production Neon query returned 0 total partners and 0 published partners.
Historical donor commit f91ecc5fa29c2b9d416ed8315f23e9492baf993d contains
79 logo records: 58 supporting, 15 regional, and 6 media. The module is
app/partnerData.ts and the matching PNGs are under public/partners by category.
All 79 extracted files matched the SHA-256 inventory already in this repository
(missing=0, mismatched=0). A private local Chromium gallery decoded 79/79 images;
the first lazy-loading count was not used as final evidence.

The WTIA requester confirmed in this Codex task on 2026-09-30 HKT that all 79
organisations still have current relationships and that WTIA may display all
79 logos. This confirms relationship and logo-rights evidence for these exact
inventory items. No archive photograph, branding asset, Chinese organisation
name, relationship start date, or indefinite historical grant was confirmed.

## Source defect and code changes

The existing importer read partnerData.ts at the donor root, expected one
canonical array, and used a Windows absolute path directly as an ESM import.
The actual donor exports three named arrays from app/partnerData.ts. Its PNGs
also live in category subdirectories. Tests first failed on the named-array
shape, path traversal, category filename, and real module-loader path. The
loader and parser now accept the archived shape, preserve the older canonical
array shape, reject traversal paths, and store only the basename in media
metadata.

The npm importer command previously stopped at the server-only package guard
before any DB check. The server-only package selects its safe empty module
under the react-server condition, which the repository already uses for
another server CLI script. The npm command now sets that Node condition.
The importer also checks the audit actor's actual stored profile role,
validates R2 configuration before uploads, and exits nonzero if any record
fails. Imports still create unpublished/unconfirmed rows; the existing CMS
publication guards remain in force. No migration was added.

## Verification actually run

- Focused red/green tests: archived array parsing, traversal rejection,
  category filename metadata, real donor loader path, actor role mismatch,
  and frozen inventory status. Final focused run: 38/38 for parser, importer
  and inventory; actor guard: 12/12.
- Real donor loader, no DB or R2: node --conditions=react-server --import tsx
  .playwright/check-donor-loader.mts returned 79 rows (58/15/6).
- Actual npm entrypoint with deliberately empty donor and DB env:
  npm run content:import-wisetech-partners reached
  PARTNER_IMPORT_DONOR_DIR_REQUIRED with exit 1. Before the command fix it
  stopped at server-only. This is a guard check, not an import acceptance.
- npm test -- --maxWorkers=2: 715 test files passed, 65 skipped;
  6,096 tests passed, 168 skipped. The initial unbounded npm test attempt
  ended with Worker exited unexpectedly while lint/typecheck ran concurrently.
- npm run typecheck: pass.
- npm run lint: failed on 20 errors in ignored local .playwright helper scripts
  from earlier work, with 67 source/test warnings. npm run lint --
  --ignore-pattern '.playwright/**': pass, 0 errors and 67 warnings.
- npm run build: pass, Next.js 16.3.4 webpack build; 267 static pages generated.
- npm run audit:strings: pass, 297 TSX files scanned.
- git diff --check: pass.

The preceding full suite's 168 skips include database/provider integration checks.
The follow-up isolated SQL acceptance below used synthetic PNGs and a mock
storage port; no provider upload or live browser logo acceptance was claimed.
A private review gallery exists only in ignored local
files, not as a published preview.

## Environment and release matrix

| Stage | Status | Evidence or gate |
| --- | --- | --- |
| Code fixed | Verified locally | Focused tests, complete test suite, typecheck, build, string audit |
| Isolated SQL import | Verified with synthetic fixtures | 79 rows, sequential rerun, atomic rollback, stored-role refusal; R2 port mocked |
| Isolated R2 import | Pending | Actual isolated R2 credentials/bucket and upload/read acceptance |
| Production import | Pending | R2 configuration absent from linked Vercel Production env; no import attempted |
| CMS confirmation and publication | Pending | Per-record bilingual alt/name review and existing CMS publication actions |
| Browser acceptance | Pending | Needs published records and working media on /, /zh, /partners, /zh/partners |

Production Vercel environment variable names were read with vercel env ls
production; no R2_ACCOUNT_ID, R2_JURISDICTION, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, or R2_BUCKET entries appeared. Accessible local env
files likewise had no complete R2 configuration. No credential value was
printed or committed. Production Neon read-only role aggregation showed one
member and one superadmin profile; no personal record or ID was exported.

## Rollout and rollback

1. Provision/configure the existing R2 integration and an isolated test bucket;
   keep its credentials out of Git. Validate the isolated DB and real operator
   profile, then run the exact 79-row import there.
2. Check created + skippedExisting = 79, skippedError = 0, all 79 media bytes
   load, and all rows remain unpublished until CMS review.
3. After release approval, run the guarded production importer against the
   SHA-verified donor checkout and actual operator profile. Review bilingual
   names and alt, confirm rights/relationship on each row, then publish.
4. Verify 79 public records, category counts 58/15/6, actual PNG responses,
   and desktop/mobile presentation in both locales. Record screenshots and
   release IDs.

Rollback starts by unpublishing affected rows, then archiving if appropriate;
retain audit history and storage objects pending reconciliation. Application
code rollback alone does not unpublish DB rows. No migration is involved.

## Follow-up isolated SQL acceptance

The CLI now shares its unchanged SELECT/INSERT/transaction wiring through
`createPartnerImportDatabase`. The integration test uses this same adapter,
real PNG normalization and real Postgres transactions. Its upload port is an
explicit mock; no object-storage request is made.

Neon API checks reconfirmed project `solitary-wave-52860119`, non-default branch
`br-lingering-unit-azxl75s5`, and its exact `ep-plain-mouse-azm8pl2j` endpoint.
The branch expires on 2026-10-04. The first guarded test failed because its
acceptance sentinel count was 0; no fixture was imported. The local runner then
inserted a temporary, run-owned designation only on that API-confirmed isolated
host and removed it in `finally`. It did not enable the production override.

Actual command from the feature worktree:

```powershell
node .playwright/run-partner-import-acceptance.mjs 'C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env'
```

The ignored local runner loads only DATABASE_URL_TEST, M2_TEST_NEON_HOST,
M2_TEST_NEON_PROJECT_ID and NEON_PROJECT_ID; sets DATABASE_URL equal to the
confirmed test URL, AUDIT_ISOLATED_ACCEPTANCE=1 and VERCEL_ENV=test; prepares the
temporary sentinel; runs the following repository test command; then removes
only its own sentinel. Neither connection string nor credential values are
included in these records.

```text
node node_modules/vitest/vitest.mjs run tests/integration/wisetech-partner-import-neon.test.ts tests/unit/wisetech-partner-import.test.ts tests/unit/wisetech-partner-import-guard.test.ts --maxWorkers=1
```

Final focused result: 27/27 passed, zero skipped. The real SQL assertions prove:

- 79 synthetic partners, 79 normalized media rows and 79 audit records;
  category counts 58 supporting, 15 regional, 6 media.
- All imported rows have publication and both confirmation timestamps NULL.
- Sequential rerun returns created=0, skippedExisting=79, skippedError=0,
  makes no new storage-port calls and writes no extra audits.
- An injected audit failure rolls back its already-inserted media and partner.
- A claimed superadmin role is refused for the stored synthetic staff profile.

The rollback assertion was tested against a deliberate local mutation replacing
ROLLBACK with COMMIT on the failure path. It failed with 80 media rows instead
of 79. The original rollback was restored and the same tests passed again.
Run-owned fixture cleanup ran in both cases. A separate read-only Neon query
then returned 0 synthetic profiles, partners, media, audit rows and temporary
sentinels. Existing fixture data was retained.

This verifies database behavior. Actual R2 upload/read, CMS review/publication,
79-logo browser acceptance and production restoration remain pending. Production
Vercel env names were rechecked and still contain none of the R2 configuration.

Follow-up full-suite command: `npm test -- --maxWorkers=2`, exit 0,
716 files passed / 65 skipped; 6,097 tests passed / 171 skipped, 748.91 seconds.
The three new environment-gated SQL cases skip in this no-DB full run and were
all actually run in the separate isolated command above. Typecheck passed.
Lint with the documented ignored-helper exclusion passed with 0 errors and
67 existing warnings. `git diff --check` passed.

Follow-up webpack build passed with 267 static pages; visible-string audit passed
for 297 TSX files. No migration, provider upload, production data import or
production release was performed during this follow-up.

Fresh raw `npm run lint` remained blocked: 20 errors in ignored local
.playwright helpers, plus the same 67 warnings. The filtered tracked-code
lint command passed; this raw gate is recorded as failed, not passed.
