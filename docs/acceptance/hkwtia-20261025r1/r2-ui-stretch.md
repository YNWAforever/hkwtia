# R2 UI and measurement preparation — 2026-10-26

Baseline: `3c66cb4ef1924801514af0942542ef07e07f3a7d`, branch `wtia/hkwtia-plan-r1-20261025`, PR #212 stacked on #211. This is offline evidence only; T22-02 remains BLOCKED.

| Slice | Code | Tests | Deployment | Runtime |
| --- | --- | --- | --- | --- |
| T22-04B | Injectable staff publication preview and member per-item text/HTTPS response form; bilingual labels, deadline, operation receipt; validation retains inputs; conflict/unknown freeze writes | jsdom driving existing service with fake transaction; EN/ZH publish/respond, required/overlong/invalid URL, non-applicant rejection, cancelled version, unknown receipt key, long copy/control bounds and focus | Not deployed | **BLOCKED**: no SQL persistence, authenticated runtime binding, real identities or browser replay |
| T22-08 | Prominent submitted shortcut to existing `?status=submitted` queue; existing all-progress link and work-queue case links retained; no new data source or product policy | EN/ZH rendered link destinations, dashboard ordering regression and existing navigation tests | Not deployed | **BLOCKED**: no five-person staff baseline/task study, keyboard/browser/back-navigation acceptance |
| T22-13 prep | LHCI config now requests three public runs; score/median gates retained | Exact HK UTC 15:59/16:00 month/year boundaries, existing EN/ZH date parts, score/config contracts; native control semantics and long-copy focus in supplement jsdom | Not deployed | **BLOCKED**: real Lighthouse, four-width layout/zoom/screen-reader checks, private data performance and RUM |

## Scope and recovery

The new forms are deliberately unmounted scaffolding: no production route/action/adapter or flag is enabled. Tests bind callbacks to `createSupplementService` using synthetic actors and a fake transaction. A future authenticated runtime wrapper must supply only the member projection and establish its own actor in each Server Action; passing raw staff data as client props would still serialize it even when a component does not render it. Component tests deliberately pass hostile extra fields and verify the rendered DOM excludes them; the existing service projection tests remain the actual read boundary evidence.

The form sends `requestId`, `expectedVersion`, one `operationRequestId` and, for a response, per-item answers only. It does not accept a client-supplied actor. Validation preserves text/URLs and permits correction with a new key. Saved outcomes show the operation receipt key. Unknown outcomes (including thrown transport errors) retain the key and inputs and disable further submission; conflict/forbidden also stop writes. Receipt lookup/reconciliation, latest-version reload, own-response history and staff close controls remain runtime integration work. No automatic retry, notification, approval, file upload or replacement of profile/company data is introduced.

The callback port is intended for a client composition or authenticated Server Action, never for sending an ordinary server closure across the Server Component boundary. Existing service types are imported with `import type`; the client does not import the server-only service at runtime.

The submitted shortcut uses the existing submitted predicate and localized routes. Existing case links still come from the single daily-work reader. Navigation research, collapsed advanced sections, bulk recovery and timing improvements are not claimed by this narrow shortcut change.

## Test-first evidence

- Empty form scaffolds produced five behavioral failures for missing preview/action/answer controls, then implementation passed. An earlier test-title typo failed collection and was corrected; that collection failure is not behavioral red evidence.
- The submitted shortcut tests failed in both locales because the link was absent, then passed after adding it.
- Three-run LHCI contract failed `expected 1 to be greater than or equal to 3`, then passed after changing the config. An initial wrong config extension was corrected before this behavioral red.
- HK boundary cases passed against existing behavior. Temporarily changing the shared formatter zone to UTC made both cases fail at the expected dates; restored Asia/Hong_Kong immediately and verified green. This was a test sensitivity probe, not a shipped date fix.
- The first full suite found the existing dashboard ordered-link expectation omitted the new leading shortcut. The expectation now includes it and the focused page suite passes. The initial broad run remains a failed run.

## Real measurement protocol — not executed

Required device widths: 375, 768, 1024 and 1440 CSS px, with zoom, long bilingual text, keyboard and screen reader checks. jsdom does not measure overflow, target geometry, layout or assistive-technology behavior.

Before lab execution record target URL/build SHA, browser/device, viewport, network, Hong Kong region, warm/cold condition and fixture size. Use three public runs per representative route; the config now requests three, without claiming any resulting score. Private list acceptance still needs 1k/10k isolated fixtures and at least 30 warm and 30 cold samples, p50/p95, rows, bytes and query plans. Suggested targets from the plan remain LCP ≤2.5s, CLS ≤0.1 and private 20-row page p95 ≤2s. Field INP ≤200ms requires actual RUM; field INP is **NOT_TESTED / BLOCKED for collection**, and lab TBT is not a substitute.

No browser/e2e files were added or run. No migration, seed, deployment, production write, live Stripe or messaging was performed. Local build success does not establish a deployed candidate or exact-head remote CI success. The existing stacked-base workflow-scope blocker remains.

## Final local verification

Tested product HEAD `e55143a2635e143829be99a9fe53b5f8929e0eaf`. Focused suite: **68 passed / 10 files**. Full rerun: **7,928 passed / 643 skipped**, **900 files passed / 113 skipped**, exit 0, no unhandled errors. Build (Next 16.4.3), typecheck after restoring generated next-env changes, lint (**0 errors / 77 warnings**), string audit (**359 TSX files**) and diff checks pass. Exact commands and the initial failed full run are recorded in `r2-ui-verification.json`. No runtime, deployment or browser result is inferred from these checks.
