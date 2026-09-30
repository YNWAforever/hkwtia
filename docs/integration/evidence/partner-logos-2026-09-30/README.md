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
