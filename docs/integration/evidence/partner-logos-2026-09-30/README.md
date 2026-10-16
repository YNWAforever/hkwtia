# Partner logos: real-provider evidence package

This is isolated acceptance evidence, not a production release claim.

- Runtime source: merged PR #104, `d9b75111d28a4c33ecb1a97d0b48da5bd6f6a495`.
- Donor source: `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, exactly 79 approved logos.
- Database: API-confirmed non-default Neon branch `br-lingering-unit-azxl75s5`.
- Storage: private `hkwtia-partner-acceptance-20260930` bucket, default jurisdiction.
- Images show isolated records at localhost, not the live production site.

## Results

`r2-provider.json`: real synthetic PUT/GET/checksum/dimension/delete success.
`isolated-import.json`: 79 real uploads/reads, rerun idempotency, unpublished
defaults and existing repository confirmation/publication gates.
`local-browser.json`: 8 locale/viewport cases passed; all directory logos decoded.
`local-cms.json`: real test-provider staff login, anonymous protection, CMS
unpublish -> public 78, republish -> public 79. No Google/magic-link claim.

Selected images: English desktop home; Chinese mobile viewport; English desktop
full directory; Chinese mobile full directory. Sixteen section/full-page
captures were produced locally; this package selects four. Some full-page
captures contain the fixed site header at its capture scroll position.

The `.txt` runner archives contain the exact ignored local harnesses, never
env values. Copy them to their `.playwright/run-...` filenames named in the
restoration report to reproduce. The web runner uses the existing test auth and
Stripe settings and sets email/test sending modes. Its paused-worker marker is an
operator attestation, not a worker-control switch; no worker is connected to this
isolated acceptance branch. The archived runner now uses the required true marker.
Never replace the embedded test database/bucket guards with production values.

The 79 fixtures are retained for Preview acceptance; full cleanup has not run.
`cleanup-check.json` records a real isolated SQL deletion rehearsal followed by
ROLLBACK: 79 partner/media rows and all 239 target/import audits were absent
inside the transaction, then original table counts were restored. No object was
deleted. The runner uses one dedicated transaction client and validates the
exact stored actor, 79 partner IDs and 79 storage keys before deletion. CMS
audits are scoped to these exact partner targets; other staff history remains.
The fixture state containing run-owned IDs/keys remains ignored locally.
No production import, migration, worker rollout or publication was performed.

`manifest.json` records SHA-256 and byte lengths for the captured files.
Release order and rollback are in the parent import runbook/restoration report.

## Security-patched candidate verification

Candidate f46be17b patches brace-expansion and Next.js to 16.3.6; application,
Auth, import, membership/payment and worker sources remain those of d9b75111.
The preceding brace-only Windows full run is in brace-patch-local-unit.json.
New candidate evidence is separate from the earlier captures:

- next-patch-ci.json: GitHub Actions run 36746006758; checks, both full unit
  shards and quality all passed. 6,097 tests passed / 171 skipped; 267-page
  build. Production dependency audit has 13 low/moderate findings and no
  high/critical. Install-time all-dependency audit includes development packages
  and reports 29 findings, including 9 high; this is recorded separately.
- next-patch-browser.json: 8 actual local route/viewport cases passed on
  Next.js 16.3.6; every directory decoded all 79 distinct real R2 images.
- next-patch-cms.json: real synthetic staff provider login and anonymous
  protection passed; unpublish -> public 78, republish -> public 79.
- next-patch-home-en-desktop.png: actual 1440x1000 viewport showing the normal
  fixed-header position; inspected after capture. This is localhost, not Vercel.
- next-patch-browser.mjs.txt: the exact new browser harness; second argument
  .playwright/partner-r2-next-patch-browser keeps previous evidence intact.

The standard Git Preview is READY, not R2 acceptance. R2 credentials have not
been transmitted to Vercel; that operation was rejected by automatic approval
review and explicit authorization remains pending. Production is still ab568934.
The isolated fixtures remain published only in the test database/private bucket.

## Authorized remote Preview acceptance: 2026-10-01 HKT

The earlier pending-authorization paragraph above records the prior attempt.
The requester subsequently explicitly authorized R2 test credentials to Vercel.
Deployment dpl_qpvHQDcsMY2MxR9B1wbrg4AD9Rfg built exact 68faa7be on Next.js
16.3.6 and is READY at https://hkwtia-partner-logos-20260930.vercel.app.
Credentials were supplied only as this Preview's build/runtime overrides, never
committed. The source upload was a clean Git archive without local env/state.

- preview-deployment.json: exact source/environment names, alias, test flags,
  DB branch/private bucket, unchanged Production baseline and retained fixtures.
- preview-browser.json: 8 real remote locale/viewport cases, four directories
  each decode 79 unique images, homepage totals 58/15/6; zero errors/overflow.
- preview-cms-invalid-origin.json: first real provider attempt failed 403.
- preview-auth-origin.json: actual diagnosis, exact isolated trusted-domain
  addition/readback; no wildcard or Production change.
- preview-cms.json: subsequent real .example.test staff login 200, anonymous
  protection, unpublish -> public 78, republish -> public 79, all passed.
- preview-viewport-captures.json and preview-*.png: actual remote screenshots,
  selected desktop/mobile home, full directory and synthetic staff editor.
- preview-*.mjs.txt: exact no-secret deployment/bootstrap/browser/CMS/capture
  runners. Restore each to its corresponding .playwright filename to reproduce.
  Protection share/state and fixture-state files stay private/ignored.
- production-r2-names.json: fresh read-only names check; four names present but
  R2_BUCKET absent. Values and actual Production storage usability unverified.

Full test fixture cleanup has not run; 79 records/objects are retained for this
Preview review. Branch expiry is 2026-10-04 20:00 HKT. Teardown removes only this
owned alias/deployment/trusted origin and run-owned test rows/objects; no branch
or bucket deletion. See the parent report for exact commands and failure history.
Production release/import/publication is still gated and was not performed.
