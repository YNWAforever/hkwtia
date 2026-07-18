# M1 acceptance evidence

This document is the release-gate record for the membership, billing, seats, and portal flow. It deliberately separates deterministic local evidence from the live preview evidence that requires isolated Neon and Stripe test-mode resources.

## Commands

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run audit:strings
npm run test:e2e -- tests/e2e/m1-acceptance.spec.ts
npm run test:e2e
npm run test:lighthouse
```

The acceptance spec covers the credential-free Startup join/Checkout/webhook state contract, Community and Patron branches, signed-fixture replay, seat limits, authorization boundaries, Billing Portal ownership, and English/Traditional Chinese route checks. Focused Vitest coverage exercises the real checkout, webhook normalizer, and Billing Portal service seams. The authenticated Neon/Stripe flow remains a separately gated run and is explicitly skipped here.

## Current evidence

- Vitest: 44 files passed, 2 skipped; 216 tests passed, 2 skipped.
- Focused M1 acceptance Playwright run: 6 passed, 1 skipped (credential-free adapter contract; live Neon/Stripe flow intentionally skipped).
- M1 service-seam Vitest run: 3 passed (real Checkout, webhook normalization/replay, and Billing Portal ownership).
- Full Playwright suite: 68 tests in 8 files; 67 passed, 1 skipped (live Neon/Stripe flow explicitly skipped).
- Typecheck, lint, visible-string audit, and production build passed.
- Lighthouse passed against `/membership` and `/zh/membership` (one run per URL; performance, accessibility, and SEO assertions passed).

## Evidence record

| Field | Current value |
| --- | --- |
| Live preview deployment ID | `dpl_EdXFpajxGTX8i3YbMnPQCiBeVWQv` READY; https://hkwtia-bpylh4bof-ynwaforevers-projects.vercel.app |
| Preview source commit | `ec890e2` (`test: add M1 acceptance evidence`) |
| Isolated Neon branch/database ID | Not configured; do not use production `DATABASE_URL` |
| Stripe test customer/subscription IDs | Not configured |
| Startup join duration | Deterministic contract asserts `< 5 minutes`; live timing not captured |
| Webhook replay evidence | Deterministic fixture asserts one processed event and one duplicate |
| Stripe test-clock evidence | Not run; requires isolated Stripe test-mode credentials |
| Rollback candidate | Previous release commit `b53b445` |

Do not fill the live identifiers with production values. The preview build is READY, but the authenticated live flow and Stripe test-clock checks were not run because isolated Neon and Stripe test credentials are absent. Before promotion, run the commands above against those isolated resources, then record only non-secret resource IDs and deployment metadata here.