# T22-07 offline use-case inventory — 2026-10-26

Scope: UC22-01–60, the existing membership/staff features for R2 (plan Task 15). R3/R4 capabilities (T22-09/10/11/12) are **not** claimed here. This is an **offline inventory**, not the T22-07 acceptance run: no real Auth session, authenticated HTTP/browser, Stripe test, notification sink, AI provider or deployment was used. Machine-readable copy: [t22-07-inventory.json](t22-07-inventory.json).

Inventory base HEAD `6681eb970968d0a70f385e2771628bbfc2f1f86f` (docs-only after tested code HEAD `a5891fcc`, whose full suite passed 7,976 / 657 skipped per `r2-resources-binding-verification.json`).

| Status | Count | Meaning |
| --- | ---: | --- |
| PASS | 0 | Fresh actual/result/evidence for the whole UC, incl. real identity/Stripe/DB where required |
| PARTIAL | 46 | Current-tree offline unit/jsdom and/or isolated-Neon evidence; acceptance-critical runtime layer still open |
| BLOCKED | 14 | Core dependency unavailable (Auth sessions, Stripe test, sink, T-MP10 approval, T-MP08 materials, T-MP12 contract, remote CI) |
| NOT RUN | 0 | No external blocker for an anonymous/local run, but not executed yet |

**No UC is PASS.** Every UC22-01–60 acceptance requires real Auth/HTTP/browser, Stripe or owner/legal input for at least one layer; offline evidence never substitutes (plan Task 15 exact completion condition).

## Caveat — case definitions

The original `Test_Cases.csv` / `Fixture_Runbook` from the audit ZIP are not in this repo or on the box. Per-UC themes are inferred from the plan §7 group definitions; rows marked ¹ are explicitly referenced by a plan task (Tasks 2–14). Re-map each row against the original CSV before the acceptance run; do not treat these themes as the canonical case wording.

## Focused offline run (this inventory)

`npx -p node@22 node node_modules/vitest/vitest.mjs run <every file cited below>` with `DATABASE_URL` unset: **exit 0, 106 files, 1,235 passed / 0 failed / 3 skipped**. `tests/integration/join-resume.test.ts` is gated and was skipped; it is not counted as evidence. Isolated-DB evidence is cited from the existing superseding records ([t22-02](t22-02.md), [t22-04a](t22-04a.md), [t22-06](t22-06.md), [resources/binding](r2-resources-binding.md)) and was not rerun here.

## Cases

| UC | Theme | Status | Offline / DB evidence | Blockers | Next without Auth |
| --- | --- | --- | --- | --- | --- |
| UC22-01 | Public entry pages render (anonymous) | **PARTIAL** | `membership-public-catalog.test.ts`, `navigation.test.ts`; [64 local settled render/axe combinations](anon-browser-local.md#settled-cta-contrast-replay--2026-10-26) | Preview behind Vercel SSO (no bypass) | Obtain Preview/SSO evidence; local render and settled contrast complete |
| UC22-02 | Current concierge chat UI (not R3 actions) | **PARTIAL** | `concierge-widget.test.tsx`, `concierge-shell.test.tsx`, `concierge-unavailable-ui.test.tsx` | Real AI provider evaluation; Browser | Local Playwright disabled-provider path (manual fallback) without Auth |
| UC22-03 | Four-tier membership comparison ¹ | **PARTIAL** | `membership-page-catalog.test.tsx`, `membership-catalog.test.ts`, `membership-tier-content.test.ts` | Browser visual matrix on populated catalog | Local Playwright visual at 375/768/1024/1440 |
| UC22-04 | Comparison seats/help/anchor ¹ | **PARTIAL** | `membership-page-catalog.test.tsx`, `membership-links.test.tsx` | Browser visual matrix | Same local Playwright run |
| UC22-05 | Locale EN/ZH switching and hrefs | **PARTIAL** | `locale-switcher.test.tsx`, `locale-href-boundary.test.ts`, `membership-links-locale.test.tsx` | Browser | Local Playwright anonymous locale round-trip |
| UC22-06 | next= destination preserved through login | **PARTIAL** | `login-destination.test.ts`, `login-outcome-redirect.test.tsx`, `login-entry-routing.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-07 | Anonymous admin boundary | **PARTIAL** | `admin-page-auth.test.ts`, `admin-page-auth-source.test.ts`, `admin-login-guard.test.ts` | Authenticated browser/HTTP | Anonymous HTTP probe of /admin/* on local server (no Auth needed for the negative control) |
| UC22-08 | Anonymous portal boundary / admin redirect | **PARTIAL** | `portal-admin-redirect.test.tsx`, `portal-navigation-access.test.ts` | Authenticated browser/HTTP | Anonymous HTTP probe of /portal/* on local server |
| UC22-09 | Membership page help / CTA ¹ | **PARTIAL** | `membership-page-catalog.test.tsx`, `join-plan-chooser.test.ts` | Browser visual | Local Playwright |
| UC22-10 | Policy / self-service copy consistency ¹ | **PARTIAL** | `membership-self-service-policy.test.ts`, `refund-policy-links.test.tsx`, `policy-pages.test.ts` | T-MP10 policy/legal approval | — |
| UC22-11 | Real login member A (positive control) ¹ | **BLOCKED** | `login-resolution.test.ts`, `member-login-actions.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) | Real A/B/staff Auth sessions | — |
| UC22-12 | Real login member B (negative control vs A) ¹ | **BLOCKED** | `login-resolution-server.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) | Real A/B/staff Auth sessions | — |
| UC22-13 | Real login staff D / NONSTAFF refusal ¹ | **BLOCKED** | `admin-login-actions.test.ts`, `admin-login-guard.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) | Real A/B/staff Auth sessions | — |
| UC22-14 | Free (community) join | **PARTIAL** | `hosted-free-onboarding.test.ts`, `join-service.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (FREE fixture) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-15 | Paid join checkout | **BLOCKED** | `checkout-service.test.ts`, `membership-checkout-status-route.test.ts`, `join-billing-pages.test.tsx` | Real A/B/staff Auth sessions; Stripe test mode; Notification sink | — |
| UC22-16 | Owner checks on join/application | **PARTIAL** | `join-application-security.test.ts`, `join-actions-profile-identity.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (A read OK, B read of A = null) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-17 | Retained input / resume | **PARTIAL** | `join-form-recovery.test.tsx`, `join-draft.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-18 | Identity/target gate and existing security fixes ¹ | **PARTIAL** | `hkwtia-acceptance-target.test.ts`, `acceptance-guard.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) | Real A/B/staff Auth sessions; Exact-head remote CI (stacked base; workflow scope) | — |
| UC22-19 | Dependency/security release gate ¹ | **PARTIAL** | `ci-security-contract.test.ts` | Exact-head remote CI (stacked base; workflow scope); Full-tree audit exit 1 under accepted dev-only LHCI exception (dependency-disposition.md) | — |
| UC22-20 | No second subscription | **BLOCKED** | `billing-checkout-locking.test.ts`, `membership-uniqueness-schema.test.ts` | Real A/B/staff Auth sessions; Stripe test mode | — |
| UC22-21 | Multiple memberships view/selection | **PARTIAL** | `portal-membership-selection.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (8 memberships) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-22 | Seven membership statuses | **PARTIAL** | `membership-lifecycle.test.ts`, `membership-entitlements.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (all 7 statuses seeded) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-23 | Own applications list (SQL paging) ¹ | **PARTIAL** | `owned-applications-sql.test.ts`, `owned-application-reader.test.ts`, `portal-sql-paging.test.ts`; DB: T22-06 0067 10k paging/EXPLAIN (t22-06.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-24 | Own application detail + supplement history ¹ | **PARTIAL** | `owned-application-reader.test.ts`, `supplement-service.test.ts`; DB: T22-06 0067 10k paging/EXPLAIN (t22-06.md); T22-04A 0066 gated SQL cases (t22-04a.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-25 | Member supplement response ¹ | **PARTIAL** | `supplement-service.test.ts`, `supplement-ui.test.tsx`, `supplement-actions.test.ts`, `supplement-binding.test.ts`; DB: T22-04A 0066 gated SQL cases (t22-04a.md); Gated SQL binding cases (r2-resources-binding.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP; Bound forms unmounted; write flag disabled | — |
| UC22-26 | Application form submit | **PARTIAL** | `join-schema.test.ts`, `join-actions.test.ts`, `join-page.test.tsx` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-27 | Form validation and correction | **PARTIAL** | `join-schema.test.ts`, `join-form-recovery.test.tsx` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-28 | Consent capture/withdrawal | **PARTIAL** | `profile-consent-audit.test.ts`, `whatsapp-consent.test.ts`, `contacts-consent-audit.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (opt-ins false) | Real A/B/staff Auth sessions; Authenticated browser/HTTP; Notification sink | — |
| UC22-29 | Company profile edit | **PARTIAL** | `company-profile-core.test.ts`, `update-company-action.test.ts`, `portal-company-forms.test.tsx`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (A owns company) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-30 | Seat assignment | **PARTIAL** | `portal-seat-mutations.test.ts`, `portal-seat-bulk.test.ts`, `seat-capacity.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (SEAT fixture) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-31 | Seat/role revocation | **PARTIAL** | `company-portal-role-race.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (REVOKED fixture) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-32 | Existing external tool identity exchange contract ¹ | **BLOCKED** | — | T-MP12A sandbox contract / T-MP12B | — |
| UC22-33 | Public company profile review (staff) | **PARTIAL** | `company-profiles-repository.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-34 | Public directory isolation (opt-in only) | **PARTIAL** | `public-directory-availability.test.tsx`, `directory-paging.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (directory visibility false) | Authenticated browser/HTTP | Anonymous local check that seeded company is absent from public directory on isolated Neon |
| UC22-35 | Portal directory isolation | **PARTIAL** | `portal-directory.test.tsx` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-36 | Event registration | **PARTIAL** | `event-registration-form.test.tsx`, `event-registration-public-action.test.ts`, `guest-rsvp-recovery.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP; Notification sink | — |
| UC22-37 | Ticket purchase | **BLOCKED** | `ticket-checkout-action-recovery.test.ts` | Real A/B/staff Auth sessions; Stripe test mode; Notification sink | — |
| UC22-38 | Stripe webhook processing | **BLOCKED** | `webhook-service.test.ts`, `webhook-route.test.ts` | Stripe test mode | — |
| UC22-39 | Approved member resources ¹ | **BLOCKED** | `member-resource-access.test.ts` | T-MP08 owner materials + private delivery; Real A/B/staff Auth sessions | — |
| UC22-40 | Receipts ¹ | **BLOCKED** | `portal-billing-page.test.tsx` | Stripe test mode; T-MP08 owner materials + private delivery; Real A/B/staff Auth sessions | — |
| UC22-41 | Cancellation/refund policy effect ¹ | **BLOCKED** | `membership-self-service-policy.test.ts`, `refund-policy-links.test.tsx` | T-MP10 policy/legal approval; Stripe test mode | — |
| UC22-42 | Dashboard submitted count = queue ID set ¹ | **PARTIAL** | `application-queue-submitted.test.ts`, `application-queue-submitted-sql.test.ts`, `admin-dashboard-queue-counts.test.ts`; DB: [gated PostgreSQL exact ID sets/count/paging](uc22-42-43.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — (DB evidence completed; Auth/browser remains blocked) |
| UC22-43 | Submitted queue filter/list ¹ | **PARTIAL** | `admin-application-queue-query.test.ts`, `application-queue-table.test.tsx`, `r2-daily-nav.test.tsx`; DB: [gated PostgreSQL exact ID sets/count/paging](uc22-42-43.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — (DB evidence completed; Auth/browser remains blocked) |
| UC22-44 | Unknown save → receipt reconciliation ¹ | **PARTIAL** | `supplement-service.test.ts`, `supplement-ui.test.tsx`; DB: T22-04A 0066 gated SQL cases (t22-04a.md) (lost-response reconciliation) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-45 | Version conflict / concurrency ¹ | **PARTIAL** | `supplement-service.test.ts`, `supplement-repository.test.ts`; DB: T22-04A 0066 gated SQL cases (t22-04a.md) (distinct-staff concurrency, unique index) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-46 | Bulk actions | **PARTIAL** | `admin-batch-service.test.ts`, `admin-batch-runner.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP; Notification sink | — |
| UC22-47 | Import | **PARTIAL** | `member-import-service.test.ts`, `member-import-validation.test.ts`, `member-import-upload-route.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-48 | Staff case handling (current, non-R3) | **PARTIAL** | `application-case-actions.test.ts`, `application-case-form.test.tsx`, `application-case-facts.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-49 | Staff draft review/adopt (current) | **PARTIAL** | `application-draft-actions.test.ts`, `application-draft-adopt.test.tsx`, `ai-draft-validation.test.ts` | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-50 | Staff guard (NONSTAFF refused, zero writes) ¹ | **PARTIAL** | `admin-server-action-boundaries.test.ts`, `supplement-actions.test.ts`; DB: T22-02 isolated Neon fixtures/scoped reads (t22-02.md) (NONSTAFF zero row change); T22-04A 0066 gated SQL cases (t22-04a.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP | — |
| UC22-51 | Concierge cites sources (current) | **PARTIAL** | `ai-concierge-grounding.test.ts`, `concierge-service.test.ts` | Real AI provider evaluation; Authenticated browser/HTTP | — |
| UC22-52 | Concierge provider failure path | **PARTIAL** | `concierge-unavailable-ui.test.tsx`, `concierge-readiness.test.ts` | Real AI provider evaluation; Authenticated browser/HTTP | Local Playwright with provider disabled |
| UC22-53 | Concierge data isolation | **PARTIAL** | `concierge-security.test.ts`, `concierge-route.test.ts` | Real A/B/staff Auth sessions; Real AI provider evaluation | — |
| UC22-54 | External tool authorization contract ¹ | **BLOCKED** | — | T-MP12A sandbox contract / T-MP12B | — |
| UC22-55 | Mobile widths / zoom / keyboard / screen reader ¹ | **PARTIAL** | `mobile-navigation.test.tsx`, `supplement-ui.test.tsx`; [eight CTA ratios 8.452:1, 64 settled + two reduced-motion axe scans clear](anon-browser-local.md#settled-cta-contrast-replay--2026-10-26) | Real-device matrix; Screen reader | Screen reader and real-device checks remain open |
| UC22-56 | Private list performance (20-row p95 ≤2s) ¹ | **PARTIAL** | `portal-sql-paging.test.ts`; DB: [1k/10k production reader timing, 30 warm/30 fresh connections, plans/rows/bytes + cleanup; retry hardening: 2 full DB replays, 0 handshake failures/exhausted, cleanup verified](uc22-56.md#retry-hardening) | Real A/B/staff Auth sessions; authenticated HTTP/browser p95 unmeasured | DB timing completed; optional isolated replay. Full target requires Auth + HTTP/browser measurement |
| UC22-57 | Public performance LCP/CLS (INP field) ¹ | **PARTIAL** | `production-lhci-target.test.ts`; [repeated three-run medians for ten URLs](anon-browser-local.md#repeated-uc22-57-lab-medians) | RUM for field INP; Preview behind SSO | Controlled lab and field/Preview evidence remain open |
| UC22-58 | Hong Kong date boundaries (UTC 15:59/16:00) ¹ | **PARTIAL** | `hong-kong-time.test.ts`, `event-hong-kong-datetime.test.ts` | Rendered browser check | — |
| UC22-59 | Exact-head CI gate ¹ | **BLOCKED** | `ci-security-contract.test.ts` | Exact-head remote CI (stacked base; workflow scope); stacked-ci-trigger.patch unapplied | — |
| UC22-60 | Member→staff→member same application, persisted readback ¹ | **BLOCKED** | `supplement-binding.test.ts`, `supplement-ui.test.tsx`; DB: T22-04A 0066 gated SQL cases (t22-04a.md); Gated SQL binding cases (r2-resources-binding.md) | Real A/B/staff Auth sessions; Authenticated browser/HTTP; Bound forms unmounted; write flag disabled | — |

¹ Theme anchored to an explicit plan task reference; others inferred from the §7 group.

## Additional regressions (§7, appended — do not alter the 72 originals)

| ID | Status | Evidence / blocker |
| --- | --- | --- |
| REG-submitted-id-set | PARTIAL | `application-queue-submitted-sql.test.ts`; [PostgreSQL exact UUID sets, equal-count mutation red/restored green](uc22-42-43.md); real staff Auth/browser remains blocked |
| REG-listOwned-untruncated | PARTIAL | `owned-application-reader.test.ts`; join-resume keeps full history; runtime caller check needs Auth |
| REG-late-stream-company-switch | NOT RUN | R3 (T22-09) scope |
| REG-personal-outcomes | NOT RUN | R3 (T22-12A) scope |
| REG-provider-unknown-outcome | NOT RUN | R4 (T22-11) scope |

## Blocker index

| Blocker | UCs (status BLOCKED or remaining layer) |
| --- | --- |
| Real A/B/staff Auth sessions | 39: 06, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 35, 36, 37, 39, 40, 42, 43, 44, 45, 46, 47, 48, 49, 50, 53, 56, 60 |
| Authenticated browser/HTTP | 33: 06, 07, 08, 14, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 60 |
| Stripe test mode | 6: 15, 20, 37, 38, 40, 41 |
| Notification sink | 5: 15, 28, 36, 37, 46 |
| Real AI provider evaluation | 4: 02, 51, 52, 53 |
| Exact-head remote CI (stacked base; workflow scope) | 3: 18, 19, 59 |
| Browser | 2: 02, 05 |
| T-MP10 policy/legal approval | 2: 10, 41 |
| Bound forms unmounted; write flag disabled | 2: 25, 60 |
| T-MP12A sandbox contract / T-MP12B | 2: 32, 54 |
| T-MP08 owner materials + private delivery | 2: 39, 40 |
| Preview behind Vercel SSO (no bypass) | 1: 01 |
| Browser visual matrix on populated catalog | 1: 03 |
| Browser visual matrix | 1: 04 |
| Browser visual | 1: 09 |
| Full-tree audit exit 1 under accepted dev-only LHCI exception (dependency-disposition.md) | 1: 19 |
| Browser/device matrix | 1: 55 |
| Screen reader | 1: 55 |
| Authenticated HTTP/browser 20-row list p95 remains unmeasured | 1: 56 |
| RUM for field INP | 1: 57 |
| Preview behind SSO | 1: 57 |
| Rendered browser check | 1: 58 |
| stacked-ci-trigger.patch unapplied | 1: 59 |

## Next steps that do not need Auth

1. **UC22-42/43 isolated PG completed:** [evidence](uc22-42-43.md) proves exact fixture ID sets through production readers, count delta and bidirectional paging. Staff Auth/browser acceptance remains BLOCKED; rows remain PARTIAL.
2. **UC22-56 DB timing completed:** [evidence](uc22-56.md) records 1k/10k fixtures, 30 warm / 30 fresh-connection samples per production first/deep/detail reader, p50/p95/max, plans, rows, bytes and cleanup. Optional isolated replay needs no Auth; full private-list HTTP/browser p95 remains BLOCKED on real Auth.
3. **UC22-01/03/04/05/07/08/09/34/52/55 local anonymous browser:** `next build && next start` against the isolated catalog, Playwright anonymous smoke + four widths + keyboard, anonymous `/admin` and `/portal` negative probes, seeded company absent from public directory, provider-disabled concierge fallback. Preview remains SSO-protected; this would be local-runtime evidence only.
4. **UC22-57:** local three-run LHCI on `next start` (lab LCP/CLS only; field INP stays NOT_TESTED).
5. **Acceptance harness skeleton:** `tests/e2e/hkwtia-membership-admin-acceptance.spec.ts` that loads this JSON, emits per-UC `case-results.json/csv` with role/fixture/SHA/actual/result/evidence/cleanup, and maps Playwright `skip` to BLOCKED/NOT RUN (never PASS). Auth cases stay skipped until sessions exist.
6. **Obtain original Test_Cases.csv** and reconcile themes.

No write flag was enabled, no production Neon was touched and nothing was deployed.

## Local anonymous production-start attempt — 2026-10-26

[Browser evidence](anon-browser-local.md) / [manifest](anon-browser-local-manifest.json): build/start passed, but both anonymous browser runs encountered locale redirect loops before public render. Four initial-hop HTTP boundary checks passed on retry; login destinations still loop. UC22-01 moves NOT RUN → BLOCKED; other statuses remain unchanged. Current counts: **0 PASS, 44 PARTIAL, 15 BLOCKED, 1 NOT RUN**. Per-row `localBrowserEvidence` in JSON distinguishes these results from prior offline evidence. Historical browser next steps in the table now depend on resolving the local redirect loop. No screenshots, axe, keyboard, screen reader, Lighthouse, field INP, Preview or deployment PASS.


## Localhost follow-up reconciliation — 2026-10-26

[Updated evidence](anon-browser-local.md#localhost-follow-up--2026-10-26) / [manifest](anon-browser-local-manifest.json) supersedes the local launcher blocker above. UC22-01 BLOCKED → PARTIAL; UC22-57 NOT RUN → PARTIAL; remaining targeted cases stay PARTIAL. All 64 public render combinations completed. Final anonymous Chromium run: 15 passed / 5 failed (three serious home CTA contrast cases and two deliberately unconfigured four-tier catalog cases). Login redirects, locale/query/hash, manual help, disabled concierge 503/fallback and hidden-company exclusion verified locally. Three Lighthouse runs per ten public URLs record median LCP/CLS/TBT; field INP and screen reader NOT_TESTED. No Preview/SSO PASS. Current counts: **0 PASS, 46 PARTIAL, 14 BLOCKED, 0 NOT RUN**. Historical next-step rows above are superseded by per-UC JSON evidence and the findings in the updated document.


## Settled contrast reconciliation — 2026-10-26

[New replay evidence](anon-browser-local.md#settled-cta-contrast-replay--2026-10-26) / manifest `settledContrastRun` supersedes the home contrast blocker: exact 3.81 axe finding reproduced at ancestor opacity 0.552; settled white on #1a4f82 is 8.452:1. No CSS change. All 64 settled public axe scans and two reduced-motion home scans clear; eight width/locale CTA assertions pass. Anonymous suite **20 passed / 2 failed**; remaining failures are deliberately unconfigured paid tiers, still PARTIAL. UC22-01/55/57 remain **PARTIAL**, with updated per-row JSON evidence; Preview/SSO/deployment, screen reader and field INP remain open. Repeated LHCI medians for three runs per same ten URLs are linked above. Totals unchanged: **0 PASS, 46 PARTIAL, 14 BLOCKED, 0 NOT RUN**.


## Movement-only home CTA entrance — 2026-10-26

Approved CSS fix `cafee809`: hero-actions retains movement/timing and full opacity (WCAG 1.4.3). [Evidence](anon-browser-local.md#movement-only-cta-entrance--2026-10-26) / manifest `movementOnlyEntranceRun`: old CSS failed new assertion with opacity 0; focused replay 8/8 green; full anonymous suite **28 passed / 2 failed** (unchanged paid-tier configuration failures). All 32 paused samples across four widths × EN/ZH at 0/450/600/800ms: every CTA ancestor opacity 1, white/#1a4f82 **8.451873:1**; eight paused hero axe scans clear. Existing 64 settled public scans and reduced-motion checks remain clear. Same-config three-run LHCI per ten URLs repeated; medians in linked evidence. Node 22 units **7,986 passed / 659 skipped**, typecheck/lint/build green (77 existing lint warnings); next-env.d.ts restored, server stopped, no listener on 3212.

UC22-01/55/57 and paid-tier finding remain **PARTIAL**. Inventory **0 PASS / 46 PARTIAL / 14 BLOCKED / 0 NOT RUN**. Preview/SSO, screen reader, real devices, controlled performance/field INP, Auth, Stripe/provider acceptance and exact-head remote CI remain open. Same branch/PR, no deployment, Auth, write flags, fixture changes or CI patch application.
