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
| Isolated R2 import | Verified with real provider | 79 uploads and checksum/dimension-verified reads; rerun 0 created / 79 skipped / 0 errors |
| Production import | Pending | R2 configuration absent from linked Vercel Production env; no import attempted |
| CMS confirmation and publication | Isolated verification passed | Real repository gates and synthetic staff browser unpublish/republish; production review/publication pending |
| Browser acceptance | Local isolated verification passed | 8 locale/viewport route checks; Vercel Preview acceptance pending |

Production Vercel environment variable names were read with vercel env ls
production; no R2_ACCOUNT_ID, R2_JURISDICTION, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, or R2_BUCKET entries appeared. Accessible local env
files likewise had no complete R2 configuration at that initial check. The
later saved local test configuration is recorded below; it was not sent to
Vercel. No credential value was
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

## Saved R2 test configuration and provider attempt

After the requester saved the ignored local test env file on 2026-09-30,
all five required R2 settings were present. Account-ID format, the exact
`hkwtia-partner-acceptance-20260930` bucket name, and `default` jurisdiction
passed validation. No credential value was printed, committed, or sent to Vercel.

Actual command from the feature worktree:

```powershell
node --conditions=react-server --import tsx .playwright/run-r2-provider-acceptance.mts 'C:\Users\laich\Documents\hkwtia\.playwright\r2-isolated.env'
```

This ignored local runner generates and normalizes an 8x8 synthetic PNG, uses
the existing `createR2Storage` adapter to PUT/GET it, checks its bytes and SHA-256
metadata, and deletes only its own randomly named acceptance key. The first
attempt at 2026-09-30 14:44:37 UTC returned the adapter's closed
`R2_STORAGE_FAILED` error, exit 1. A diagnostic rerun at 14:46:40 UTC used
an injected real S3 client; it logged only the operation, error name/code,
HTTP status and attempt count. PUT and cleanup DELETE each returned
`404 NoSuchBucket`, exit 1. PUT/read/checksum/dimensions/cleanup success flags
were all false. These attempts do not constitute provider acceptance.

The requester then confirmed that the bucket had not been created. A guarded
creation attempt for only that exact private test bucket used:

```powershell
node --conditions=react-server --import tsx .playwright/run-r2-create-bucket.mts 'C:\Users\laich\Documents\hkwtia\.playwright\r2-isolated.env'
```

The S3 `CreateBucket` request returned `403 AccessDenied`, exit 1; no bucket
was created. The precise external dependency is to create the named private
bucket in the matching Cloudflare account with default jurisdiction, then
confirm the existing object-read/write credentials can access it. No
administrative credential is required to be pasted into the task. Cloudflare's
[creation guide](https://developers.cloudflare.com/r2/buckets/create-buckets/)
and [R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/)
describe the dashboard setup and permission distinction.

Successful object uploads: 0. Database mutations in this provider attempt: 0.
No production import or release occurred. The remaining sequence is actual
synthetic provider PUT/GET/checksum/delete acceptance, isolated 79-logo import
and idempotent rerun, existing CMS confirmation/publication, and bilingual
home/partners browser acceptance. Production configuration, import and release
remain separately gated. No successful or skipped provider test is claimed.

## Real R2 and local browser acceptance completed

After the requester created the private test bucket, the same synthetic provider
command exited 0 at `2026-09-30T14:58:54.314Z` (22:58:54 HKT). PUT, GET,
SHA-256 metadata/bytes, PNG dimensions and run-owned DELETE all succeeded.
This supersedes the earlier provisioning block; those failures are retained
above as actual attempt history.

Neon API checks reconfirmed the non-default, unprotected branch
`br-lingering-unit-azxl75s5` in `solitary-wave-52860119` and the exact pooled
`ep-plain-mouse-azm8pl2j` endpoint. Branch expiry remains 2026-10-04 20:00 HKT.
The real-provider fixture used a newly created synthetic staff profile, with
its role independently read from the database. All 79 donor bytes matched the
checked-in approved inventory and passed the existing image normalizer.

Actual sequential commands (ignored local runners; archived copies in the
[evidence package](evidence/partner-logos-2026-09-30/README.md)):

```powershell
node --conditions=react-server --import tsx .playwright/run-partner-r2-isolated.mts prepare 'C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env' 'C:\Users\laich\Documents\hkwtia\.playwright\r2-isolated.env'
node --conditions=react-server --import tsx .playwright/run-partner-r2-isolated.mts publish 'C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env' 'C:\Users\laich\Documents\hkwtia\.playwright\r2-isolated.env'
node .playwright/run-partner-r2-web.mjs 'C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env' 'C:\Users\laich\Documents\hkwtia\.playwright\r2-isolated.env'
node .playwright/run-partner-r2-browser.mjs
node .playwright/run-partner-r2-cms.mjs 'C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env'
```

Results actually observed:

- Import: created=79, skippedExisting=0, skippedError=0; 79 real R2 uploads,
  79 byte/metadata checksums and dimension-verified reads, 79 creation audits.
- Rerun: created=0, skippedExisting=79, skippedError=0; no additional upload.
- Defaults: all 79 initially unpublished and both confirmation timestamps NULL.
- Existing repository refused publication with `PARTNER_PUBLICATION_NOT_READY`
  before confirmation. Both public projections were empty at that point.
- Existing update/publication methods then produced 79 records in each locale,
  58/15/6 categories, and 79 update + 79 publication audits. No relationship
  start/end dates were invented or changed.
- Local Chromium acceptance: 8 route/viewport cases passed, covering `/`, `/zh`,
  `/partners`, `/zh/partners` at 1440x1000 and 390x844. Homepage tabs showed
  58/15/6 totals and 12/12/6 real decoded images. Each full directory decoded
  79 distinct images. Localized view-all links were actually clicked. No page
  errors, console errors, failed media requests or horizontal overflow occurred.
- CMS browser acceptance: anonymous editor access redirected to login; the
  existing Neon Auth email/password API accepted an isolated `.example.test`
  staff identity with HTTP 200. The real staff editor unpublish action reduced
  the public count to 78, and republish restored 79. This verifies that CMS
  journey; it is not a Google or magic-link provider acceptance claim.

The initial agent-browser navigation timed out during the 31-second cold Next
compilation; the warm retry worked. An initial shell-quoted eval failed and
was replaced by stdin evaluation. The first bulk browser harness read an
offscreen count before scrolling; its assertion failed (expected 58, received
0). Scrolling to the real buttons before asserting their rendered text fixed
that harness ordering. The 8-case rerun passed. No app code was changed to make
these checks pass.

Fresh typecheck and lint with `.playwright/**` excluded passed; lint has 0 errors
and 67 existing warnings. The full unit suite and webpack build recorded above
were run on identical app/library/script/test sources; `git diff origin/main --
app components lib scripts tests messages package.json package-lock.json` was
empty. This follow-up changes evidence only. Raw lint retains its recorded
ignored-helper failure; it is not represented as passed.

The 79 fixture records/objects and temporary synthetic actor are deliberately
retained only in the isolated branch/private test bucket for Vercel Preview
acceptance. No full fixture cleanup is claimed yet. The runner's cleanup mode
is restricted to the confirmed test host, bucket and run-owned fixture state;
run it after remote acceptance and record the actual result. The single-image
provider probe was already cleaned successfully.

Code is fixed and local isolated verification is complete. Vercel Preview
verification and production restoration are still pending. No R2 credential
has been sent to Vercel in this acceptance run so far; no production DB,
production storage or domain was changed. No migration or worker deployment
is required for this restoration.
