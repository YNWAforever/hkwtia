# Native reproduction harness snapshots

These files are documentation snapshots, not a second application/test system. Restore each `snapshot` to its exact `restoreTo` path in `restore-map.json`; TypeScript snapshots end in `.ts.txt` so evidence does not enter repository compilation. Use the current repository fixtures/tests and installed dependencies. No credentials or storage state are included.

## Confirm the target before executing

The receipts used the explicitly isolated G0 Neon branch, ledger56, equal DATABASE_URL/DATABASE_URL_TEST, test-mode Stripe, email sink and a paused worker. The guarded runner refuses any other hostname. The branch has a recorded expiry; confirm its current existence/isolation and approved synthetic scope before rerunning. Do not repoint the guard at Production or use real member fixtures. `.env.local` remains ignored and must be supplied by its operator without printing values.

## Commands actually used

- Build: `node .playwright/t22-run-isolated.mjs .playwright/t22-build.mjs` (build runner remains an ignored operator harness).
- Full unit: `node .playwright/t22-full-final.mjs` (d87 local6345/329; exact latest source is also covered by both native CI shards; not relabelled).
- Current sequential gates: `node .playwright/t22-release-paced-sequence.mjs`.
- Browser-only full collection: `T22_AUTH_PROVIDER_MIN_INTERVAL_MS=2000`, `T22_REPORT_PATH=.playwright/t22-browser-release-paced.json`, then `node .playwright/t22-run-isolated.mjs .playwright/t22-e2e.mjs --workers=1`.
- Exact legacy Oct1 suites set `T22_LEGACY_BROWSER_FLAG=1`; other guarded suites require the existing `true` spelling. Both remain under the same G0 target guard.
- Concierge uses `T22_BROWSER_PROFILE=local-deterministic`; unavailable-state/locale tests use `credential-free`, which blanks DB/Auth/Stripe/M2 values and disables effects.
- Private-prefetch/header/catalog cases use native Playwright and the existing committed suites; no forced click, synthetic login result or provider response replacement.

## Pacing versus authorization

Pacing is an explicit test-environment response to actual isolated Auth429 receipts. The optional observer delays outbound requests only to the exact G0 Auth host, then forwards original fetch arguments and returns the original provider response. No session cache, session/role/limiter override, mutation retry or fake provider response is installed. `2000ms` is a harness setting, not production latency evidence. Preserve the unpaced failed receipt and genuine guarded skips alongside the paced run.

Raw provider responses, cookies, Playwright storage state, logs and HTML stay ignored; safe receipts contain statuses, timings, test locations and masked references only. Preview17 is independent native runtime acceptance, not Google/magic-link delivery or cloud-worker proof.

## Latest exact-source single full run

99d5 source: set `T22_SOURCE_SHA=99d5b11974644c06318da4f91d20bf39a8615b9a`, `T22_AUTH_PROVIDER_MIN_INTERVAL_MS=5000`, `T22_REPORT_PATH=.playwright/t22-browser-final-single.json`, then the same guarded native browser-only command above. Wrapper stamps AUDIT_SOURCE_SHA from this source after local env loading. This exact-source original full collection completed332 pass/4 fail-or-timeout/162 genuine skip (collectionErrors0), actual Auth597×200/3×429. It is separate from earlier3bc2000ms331/5/162 and six targeted passes; no single complete green run has been proved.

- Exact read-only migration preflight: `node .playwright/t22-run-isolated.mjs .playwright/t23-preflight-readonly.mjs`. Actual99 G0 transactionReadOnly=true, duplicate normalized renewal groups0, pending refunds0, financialWrites0/providerCalls0; Production not tested. No upstream credential values are included.

- Targeted original four failed cases: set `T22_SOURCE_SHA=99d5b11974644c06318da4f91d20bf39a8615b9a`, `T22_AUTH_PROVIDER_MIN_INTERVAL_MS=2000`, `T22_REPORT_PATH=.playwright/t22-browser-99-targeted.json`; `node .playwright/t22-run-isolated.mjs .playwright/t22-e2e.mjs tests/e2e/cms-publish.spec.ts tests/e2e/m2-admin-crm.spec.ts tests/e2e/phase-c2-campaigns-and-contacts.spec.ts tests/e2e/phase-d4a-ticket-checkout.spec.ts --grep 'private bilingual|anonymous, member|the wizard refuses|Stripe Checkout \(en\)$' --workers=1`. Same original180-second timeout and full role matrix; no parameterization or assertion change. A passing focused run does not relabel the failed original full run.
- CMS reconciliation: `node .playwright/t22-run-isolated.mjs .playwright/t23-cms-readonly.mjs`, reserved synthetic editors only, SQL READ ONLY, no history/draft delete.

Actual targeted result:4pass/0fail/0skip,90 real get-session200/0×429; original full gate remains false. Owned generated CMS output captured separately and original historical file restored.
