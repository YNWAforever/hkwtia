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
| Production import | Pending | Latest names-only check has four R2 keys but no R2_BUCKET; production storage usability/configuration and import/publication authority remain gates |
| CMS confirmation and publication | Isolated verification passed | Real repository gates and synthetic staff browser unpublish/republish; production review/publication pending |
| Browser acceptance | Local and Vercel Preview verified | 8 remote locale/viewport cases, all 79 directory images decoded; real synthetic CMS protection/login/unpublish/republish passed |

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

## PR #105 dependency audit follow-up

PR #105 at 90191ac5 ran CI 36741789465. Both unit shards passed, as did
visible-string audit, lint, typecheck and build; the checks job failed only at
`npm audit --omit=dev --audit-level=high`, and quality correctly failed too.
The same command reproduced locally with exit 1. The existing lockfile contains
brace-expansion 1.1.18 and 2.1.4, affected by the published high-severity nested
brace recursion advisory [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7).
No homepage, importer or authorization regression was identified.

A focused `npm update brace-expansion --ignore-scripts --no-audit --no-fund`
updated only its existing major lines: 1.1.18 -> 1.1.21, 2.1.4 -> 2.1.7,
and 5.0.9 -> 5.0.12. Unrelated optional peer entries pruned by npm were restored
unchanged. package.json, direct dependencies, Auth and application sources are
unchanged. The final lockfile diff has only three version/resolved/integrity
triples. The exact audit gate now exits 0 with zero high/critical findings;
10 low/moderate findings remain recorded, not represented as zero vulnerabilities.

A one-off Node assertion probe checks normal en/zh and numeric brace expansion
and both published deeply nested payloads against all three patched copies.
The first probe incorrectly assumed v5's export was a function; it failed
TypeError after the v1/v2 cases passed. Reading v5's actual named expand export
and correcting the harness produced 3/3 successful cases without app changes.
Focused partner-import regression: 4 files / 43 tests passed. Filtered lint
passed with 0 errors / 67 warnings; typecheck passed; visible-string audit passed
for 297 TSX files. Full suite and candidate build are being rerun; their final
results will be recorded before handoff.

## Isolated cleanup rehearsal

`cleanup-check` uses a dedicated Postgres client for BEGIN/DELETE/ROLLBACK.
It validates the synthetic stored actor and ownership of all 79 partner/media
records against the local fixture state before deleting. The audit deletion
includes only the import actor or exact owned partner targets, covering the
real CMS staff unpublish/republish audit records without removing unrelated
M2 staff history.

Actual command:

```powershell
node --conditions=react-server --import tsx .playwright/run-partner-r2-isolated.mts cleanup-check 'C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env' 'C:\Users\laich\Documents\hkwtia\.playwright\r2-isolated.env'
```

Exit 0 at 2026-09-30T16:25:11.059Z (2026-10-01 00:25 HKT). Before counts:
100 profiles / 79 partners / 79 media / 359 audits. Inside the transaction:
99 / 0 / 0 / 120; all run-owned residue and the temporary sentinel were zero.
ROLLBACK restored the exact original counts. Objects deleted: 0.
The 79 fixtures remain available for Preview; full cleanup is not claimed.

## Subsequent Next.js audit advisory

CI 36744617229 at 473ccd77 passed npm ci, dependency tree validation, string
audit, lint, typecheck, build and both unit shards. Audit then failed on a
different, newly available critical advisory for Next.js 16.3.4:
[GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
The brace-expansion findings were gone. A fresh local lockfile audit reproduced
the Next.js failure with exit 1. The earlier passing audit above is retained as
a timestamped attempt, not as the final gate.

The maintainer's advisory identifies 16.3.6 as patched and limits affected
applications to Node ImageResponse with attacker-controlled SVG values. This
repository's current /api/og explicitly uses runtime=edge; no production
exploitation or Node-path exposure is claimed. The package still fails the
repository audit gate and has been upgraded to the official security patch.
Next.js, eslint-config-next, @next/env, the Next lint plugin and matching SWC
platform packages are now 16.3.6. Existing caret ranges and unrelated optional
Auth peers are preserved; app, Auth, importer, membership/payment and worker
sources remain unchanged.

Actual command:

```text
npm install next@16.3.6 eslint-config-next@16.3.6 --save-prefix='^' --ignore-scripts --no-audit --no-fund
npm audit --omit=dev --audit-level=high --package-lock-only
```

The package install selected exact ranges due to local npm settings; the
existing caret style was explicitly restored in package.json and the root
lockfile entries. Only the expected Next compiler/lint entries changed. The
lockfile audit now exits 0 with 10 low/moderate findings, zero high/critical.
Focused Next-patch rendering/auth regression: 10 files / 58 tests passed.
Matching Next lint passed with 0 errors / 67 warnings. New full CI, local build
and browser verification are in progress; no pending result is claimed as
successful.

The preceding brace-expansion-only candidate completed a fresh local full suite:
716 files passed / 65 skipped; 6,097 tests passed / 171 skipped; zero failures,
690 seconds, Node 24.18.0 on Windows. Its webpack build also exited 0. Those
results apply to Next.js 16.3.4 and do not substitute for verifying 16.3.6.
Generated next-env and snapshot line-ending changes were inspected and restored
without changes to their committed contents.

## Final local and CI verification for f46be17b

[CI 36746006758](https://github.com/YNWAforever/hkwtia/actions/runs/36746006758)
passed checks, both unit shards and quality on Ubuntu/Node 22 after npm ci.
The exact existing gates ran: npm ls, npm run audit:strings, npm run lint,
npm run typecheck, npm run build, npm audit --omit=dev --audit-level=high,
and vitest run --shard=1/2 + --shard=2/2. Unit results total 716 passed files,
65 skipped files, 6,097 passed tests and 171 skipped tests; zero failures.
The production audit gate reports 13 low/moderate findings, zero high/critical.
The npm-ci install report includes development dependencies and still reports
29 findings (3 low / 17 moderate / 9 high); it is not represented as zero or
as a clean full-dependency audit.

Fresh local Windows/Node 24.18.0 Next.js 16.3.6 webpack build exited 0 and
generated 267 pages. Fresh focused OG/partner/CMS/login regression passed
58/58; local filtered lint passed with 0 errors and 67 warnings. CI raw lint
passed in its clean checkout. Local raw lint retains its ignored-helper block.

Actual local browser command:

```text
node .playwright/run-partner-r2-browser.mjs .playwright/partner-r2-next-patch-browser
node .playwright/run-partner-r2-cms.mjs C:\Users\laich\Documents\hkwtia\.worktrees\audit-remediation\.playwright\audit-isolated.env
```

All 8 route/viewport cases passed on the patched server; every full directory
decoded 79 distinct R2 images. Real synthetic staff login returned 200; anonymous
CMS protection and unpublish/republish again produced public counts 78/79.
No Google/magic-link, Stripe payment or live member-message acceptance is claimed.
The normal desktop viewport screenshot was inspected. The earlier fixed-header
position in section/full-page screenshots is a capture artifact, not a redesign.

Read-only Vercel checks reconfirmed Production code ab568934 at deployment
dpl_3KL2kwtCM7m5uwvXpcCtvJuVLHLu. Git Preview f46be17b is READY at
dpl_wGruhexFpu6yu5SLYVqjrbBerLib /
https://hkwtia-pyt4g61op-ynwaforevers-projects.vercel.app. Its build status is
not real-logo Preview acceptance. The automatic approval review rejected the
manual Preview deployment because previous test-secret authorization covered
DB/Auth/rate-limit/Stripe, but not R2 secret transmission to Vercel. No R2
secret was transmitted. The explicit R2 Preview authorization question remains
pending; the current candidate additionally includes the verified security
patches above. No production configuration, import or release occurred.

Release gates: R2-to-Vercel Preview authorization, actual remote image/browser
acceptance, separately authorized production R2 configuration and guarded import,
CMS production review/publication, then live acceptance. No migration or worker
rollout is required. The 79 test fixtures remain retained; full cleanup is not
claimed. Neon branch expiry is 2026-10-04 20:00 HKT. Rollback remains scoped
unpublication before optional archive and web rollback; never remove unrelated
records, audits or storage objects.

## Authorized Vercel Preview acceptance: 2026-10-01 HKT

The requester explicitly authorized providing the R2 test credentials to Vercel.
This resolves the earlier automatic-approval rejection; the failed attempt and
its original pending status above are historical. Test DB/Auth/rate-limit/Stripe
and R2 values were supplied only to this one isolated Preview, through CLI
build/runtime overrides. They were neither committed nor printed. No Production
environment value, domain, database, Auth configuration or object was changed.

Deployment source was a clean tracked-only Git archive of exact
68faa7be95abfa09710e871e68a6db501585559c. No local env, storage state or private
helper was uploaded as source. Vercel completed the Next.js 16.3.6 build (267
pages) with exit 0 at 2026-09-30T17:29:08.480Z / 2026-10-01 01:29 HKT.
Deployment dpl_qpvHQDcsMY2MxR9B1wbrg4AD9Rfg is READY and resolves through
https://hkwtia-partner-logos-20260930.vercel.app. The temporary alias was absent
from all 12 pages of the team's alias inventory before assignment. No --prod,
production alias or promotion was used. Production was independently rechecked
as ab568934 / dpl_3KL2kwtCM7m5uwvXpcCtvJuVLHLu, READY.

The isolated Neon endpoint/Auth pair was checked against API-confirmed branch
br-lingering-unit-azxl75s5. The private test bucket remains
hkwtia-partner-acceptance-20260930. Email mode is test, Woztell live mode is 0,
and Google is disabled only in this test Preview. The paused-worker marker is
an operator attestation; no worker is connected, deployed or invoked here.

Actual commands from the implementation worktree:

```powershell
node .playwright/deploy-partner-r2-preview.mjs
node C:/Users/laich/AppData/Roaming/npm/node_modules/vercel/dist/index.js alias set hkwtia-2724d2qdq-ynwaforevers-projects.vercel.app hkwtia-partner-logos-20260930.vercel.app --scope ynwaforevers-projects --no-color
node .playwright/bootstrap-partner-r2-preview.mjs
node .playwright/run-partner-r2-preview-browser.mjs
node .playwright/run-partner-r2-preview-cms.mjs C:/Users/laich/Documents/hkwtia/.worktrees/audit-remediation/.playwright/audit-isolated.env
node .playwright/capture-partner-r2-preview.mjs
```

Bootstrap used a legitimate Vercel connector share link and retained only its
_vercel_jwt protection cookie in a separate ignored private state file. It did
not forge any application/member/admin session. Share tokens, application
cookies, test passwords and env values are excluded from the evidence package.

Remote browser results: all 8 cases passed (English/Chinese home and directory,
desktop 1440x1000 and mobile 390x844). Homepage totals were 58/15/6 and previews
12/12/6. All four directory cases decoded 79 distinct real images; localized
view-all links were actually clicked. Zero page/console/media errors and no
horizontal overflow. Sixteen captures plus two normal viewport captures were
produced; selected screenshots were inspected and are committed separately
from the old local captures.

The first remote CMS run reproduced HTTP 403 INVALID_ORIGIN before any CMS
mutation. Provider metadata and the ignored test env agreed on the isolated
Auth branch, whose trusted-domain list lacked this new alias. Exactly
https://hkwtia-partner-logos-20260930.vercel.app was added to only that isolated
branch using neon_add_auth_trusted_domain, auth_provider=better_auth. A readback
confirmed it. No wildcard, role bypass or production Auth change was used.
The unchanged assertions then passed at 2026-09-30T17:46:01.176Z / 01:46 HKT:
anonymous editor redirected to login, real synthetic .example.test staff
provider login returned 200, editor loaded both confirmations, unpublish reduced
public count to 78, republish restored 79. This is not Google, magic-link,
Stripe payment or real-member-message acceptance.

Preparation-only failures were also observed: the initial helper's final log
referenced undefined base after writing both runners; fixing that log field
made preparation exit 0. The tool orchestration lacked URL and btoa globals;
no secret was printed or file written by those failed orchestration steps. The
subsequent guarded Node persistence and bootstrap passed. No app code changed
for any of these harness/configuration issues.

Latest Production names-only env check at 2026-09-30T17:48:22.509Z / 01:48 HKT
supersedes the older all-keys-absent observation: R2_ACCOUNT_ID,
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_JURISDICTION are now listed;
R2_BUCKET is missing. Their values/usability were not read or verified. This
execution did not create or alter those Production settings. Production still
needs a suitable bucket/configuration, actual guarded import/CMS review and
explicit import/publication/release authority. Test credential authorization
does not approve Production use or import.

### Current release matrix and teardown

| Stage | Result |
| --- | --- |
| Code fixed | PR #104 merged; PR #105 contains dependency patches and evidence; no app/policy changes in this follow-up |
| Repository gates | Exact deployed runtime/dependencies passed CI 36747948546; 6097 unit tests passed, 171 skipped; build/lint/typecheck/strings/production-dependency audit passed |
| Staging verified | Real R2, isolated SQL, 8 remote browser cases and real synthetic staff CMS all passed on deployment dpl_qpvHQDcsMY2MxR9B1wbrg4AD9Rfg |
| Production released | No; production remains ab568934 |
| Production storage/configuration | Four names present, R2_BUCKET absent; actual storage capability not verified |
| Production import/publication | Not run; separately gated |
| Fixture cleanup | Full cleanup not run; exactly the existing 79 run-owned test records/objects retained for Preview review |

No migration, schema flag rollout or worker deployment is required. Keep this
test deployment separate from a later Production-configured build; never
promote the test-env Preview to Production. After actual release authority,
configure Production R2, validate exact environment/operator identity, execute
the SHA-verified import with publication unset, review bilingual names/alt and
confirmed rights/relationship in the existing CMS, then publish and verify live
counts and media. Existing membership/payment/consent policies remain unchanged.

Production rollback starts by unpublishing only the affected partner rows,
verifying public counts, then optionally archiving and rolling back the web
release while retaining audits/storage for reconciliation. The isolated DB
cleanup rollback rehearsal and single-object real DELETE probe are verified;
full 79-object cleanup and any Production rollback are not claimed as performed.

For test teardown after review: recheck the alias still points to this exact
Preview, remove only that alias/deployment, remove only the exact trusted origin
added above, then use the guarded run-owned fixture cleanup state for this test
host/bucket. Preserve unrelated fixture/auth data; do not delete the Neon branch
or bucket. If object cleanup fails after DB commit, retain the local key list
and reconcile only those owned keys before declaring cleanup complete. The
Neon branch expires 2026-10-04 20:00 HKT, so the Preview has that test-lifetime
limit. Tokens and test credentials remain in ignored files/deployment settings.

Detailed JSON, selected screenshots and exact no-secret harness archives are in
[the checksum-indexed package](evidence/partner-logos-2026-09-30/README.md).
This follow-up changes evidence only; its deployed code/dependencies exactly
match green f46be17b and 68faa7be. No skipped test is called provider acceptance.

## Superseding Production execution — 2026-10-01 HKT

The requester explicitly authorized merge, Production deployment and 79-logo import/publication with the same bucket/default jurisdiction. PR #105 merged as e7fa4add, Production R2 names were configured, a clean Production-only build passed and the canonical domain was promoted to dpl_DLFixAkkcNmpMCUTu3BY98hTDstQ. Stage/live pre-import browser checks each passed 12/12.

The 79-logo Production import/publication has not run: selection of an actual stored privileged audit operator remains pending. Production partners remain zero; deployed R2 image reads remain unverified. No role elevation, fixture seed, migration, payment/refund or member message occurred. [Exact receipt, evidence, remaining steps and rollback](partner-logo-production-release-2026-10-01.md) supersedes the earlier missing-bucket/unreleased statements above without closing broader provider/policy gates.
