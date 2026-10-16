# Environment refresh — 2026-10-05

Only the known synthetic non-Production branch expiration changed. The four receipts retain actual UTC observation times. Before and after extension, the owned DB/Auth host, positive sentinel, 61 migrations, and reserved-domain profile/contact counts were checked in READ ONLY transactions. No schema, fixture, credential, compute or Production change.

The exact maintenance command is in `isolated-branch-extension.json`. Pre/post isolation: `node --env-file=.env.local .playwright/complete-20261005-isolation.mjs`, using fresh branch metadata. Access/Production diagnostics: `node .playwright/complete-20261005-{access,production-ledger}.mjs`. The reviewed source snapshots remain in the prior operational-readiness reproduction folder; these commands returning exit0 do not override the explicit BLOCKED/302 results.

Old receipts/archives and original 40UC payload remain immutable. This is environment lifecycle maintenance under the authorized isolated-development scope, not a provider acceptance or production release. Full fix remains false. The new expiry is October 6, 2026 20:00 Asia/Hong_Kong.

Official lifecycle mechanism: https://neon.com/blog/expire-neon-branches-automatically
