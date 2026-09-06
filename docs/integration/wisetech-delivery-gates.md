# WiseTech delivery gates and PR handoff

## Recorded branch context

- Canonical repository: `YNWAforever/hkwtia`.
- Recorded clean `origin/main` base when this isolated worktree was created: `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`.
- Isolated worktree branch: `codex/wisetech-hkwtia-integration`.
- Site donor identity: ChatGPT Site `wisetech-hong-kong`, saved version 13, source SHA `d2d82c01099490a8c2768c942186735667bbc881`.
- Historical archive identity: SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`; its byte/history equivalence with the locally reconciled authorized Git donor remains unverified and non-blocking.

The source contains the `quality` CI job. That is source configuration, not proof that GitHub requires it on `main` or that a remote run has passed.

## Sequential PR scopes and hard boundaries

Work proceeds in this order. Each PR is independently reviewable and deployable; a later scope must not be pulled forward to make an earlier PR appear complete.

1. PR 1 — Scope: CI, branch safety, parity documents and known semantic/locale fixes. Must not include: Visual redesign.
2. PR 2 — Scope: Tokens, fonts, header, mega menu, footer, responsive shell. Must not include: Schema changes.
3. PR 3 — Scope: Homepage, About, History and programmes. Must not include: Demo content import.
4. PR 4 — Scope: Announcement, partners, media upload and localized news migrations/CMS. Must not include: Public cutover.
5. PR 5 — Scope: Events, News, Showcase, Launch Pad, Membership and contact journeys. Must not include: Auth/payment rewrites.
6. PR 6 — Scope: Join, portal and admin visual alignment plus end-to-end regression. Must not include: Production deployment.
7. PR 7 — Scope: Approved content migration, SEO/redirect validation and release evidence. Must not include: Unreviewed scope.

## Release and rollback model

Preview must be independent from production: it needs separate infrastructure, test identities, provider configuration, and a recorded owner before UAT. A Preview success is not production approval.

For every independently deployable PR, rollback by reverting its independently deployable PR/commit and documenting the route/content effect. If a later PR adds an additive migration, rollback the application behavior without schema downgrade; retain the additive schema until an authorized, separately planned data change.

As of 2026-09-02, this is no longer true: migrations 0019-0024 were applied directly to the
production Neon database, and this branch's commits (through the main-release cutover recorded in
docs/integration/main-release-cutover-evidence.md) were deployed to production via release. Both
actions were owner-directed bypasses of the gate sequence below, not evidence that gates 2-4 passed
-- see that evidence record for what was and was not verified.

## Local command and evidence checklist

Record the exact command, exit code, timestamp, and focused-test totals in the PR description or task report.

- [ ] Focused RED evidence — the contract failed for the expected missing or incorrect behavior.
- [ ] Focused GREEN evidence — the same contract passed after the minimal change.
- [ ] `npm.cmd run audit:strings`
- [ ] `npm.cmd test`
- [ ] `npm.cmd run lint`
- [ ] `npm.cmd run typecheck`
- [ ] `npm.cmd run build`
- [ ] `npm.cmd audit --omit=dev --audit-level=high`
- [ ] Route/content parity — manifest, provenance, and content/asset mapping are reconciled for the PR scope.
- [ ] Database/provider gates — no provider action is implied by local checks; record isolated evidence if applicable.
- [ ] Rollback notes — identify the revert commit/PR, owner, and any application-only migration rollback.

The browser commands are final release evidence gates, not local completion claims. Both remain `NOT PASSED` as gates: the table classifies the commands exactly as `tests/unit/wisetech-delivery-gates.test.ts` pins them, and each gate needs an isolated Preview *and* isolated Neon with test identities, which no run has yet had. WP-8's outcomes against the WP-7 Preview are recorded under the table as evidence toward these gates, not as the gates.

| Exact command | Current status | Browser | Credentials | Isolated infrastructure | Evidence required |
|---|---|---|---|---|---|
| `npm.cmd run test:e2e` | NOT PASSED | Required | Required for protected, authenticated, or provider-backed release scenarios: test-only identities and provider configuration. | Isolated Preview and isolated Neon; never Production. | Record the Preview URL, isolated resource identifiers, scenario totals, and sanitized failures or skips. |
| `npm.cmd run test:lighthouse` | NOT PASSED | Required | Not required by the command when its target is public. | An isolated Preview target is required for final release acceptance. | Record the audited Preview URL, Lighthouse scores, thresholds, and report location. |

WP-8 browser evidence, 2026-09-07 (HKT), recorded against the WP-7 Vercel Preview — deployment `dpl_6dsVDPHvx1pZsX7MimnyPdxE9o74`, origin `https://hkwtia-git-worktree-wt-wp7-routes-seo-ynwaforevers-projects.vercel.app`, built from `19dda79` (pull request #40). Access was obtained through a Vercel share link that `scripts/vercel-preview-session.mjs` turned into an ignored Playwright session; no token, cookie, share URL or report link is recorded. Full detail: `docs/integration/wisetech-design-fidelity-evidence.md` §3.

- `npm.cmd run test:e2e` — WP-8 outcome PASSED (Preview, read-only scope; 2026-09-07). Seven read-only specs, 140 passed and 4 failed of 144: public-shell 21/21, route-matrix 42/42, redirects 7/7, pr3 30/30, zh-walk 21/21, accessibility 16/19, pr5 journeys 3/4. The two classified causes: (1) one real defect — axe `color-contrast` (serious) on the SME plan card of `/membership` and `/zh/membership`, three cases, fixed on the WP-8 branch in `27065f2` and not yet re-verified on a Preview; (2) one environment difference — the pr5 "Membership is currently unavailable" case assumes the managed server's empty catalogue, while the Preview has real plans; the spec was left unchanged. Write-path scenarios (`tests/e2e/concierge.spec.ts`, every `m*` spec) and the visual baseline ran locally only, because Preview database isolation is unverified. The gate row above stays `NOT PASSED`: isolated Neon and test identities are still missing.
- `npm.cmd run test:lighthouse` — WP-8 outcome NOT PASSED (Preview unreachable for Lighthouse — SSO cookie header rejected; owner bypass needed). Vercel Authentication does not accept the session cookie as an `extraHeaders` `Cookie` header (confirmed with `curl`: every Preview URL answers 302 to the SSO endpoint with the header alone), so only `/zh` was measured: performance 0.93, accessibility 1.00, LCP 2491 ms, CLS 0.000, SEO 0.54 — the SEO miss is solely `is-crawlable` / `robots-txt` / `canonical` under the Preview's `X-Robots-Tag: noindex` and SSO-gated `/robots.txt`. `/` and `/membership` were redirected to the SSO login; the other seven targets were not reached. Thresholds: performance 0.90, accessibility 0.95, SEO 0.95, LCP 2.5 s, CLS 0.05. Owner action 6 below.

## External delivery gates

Fail closed: every status below is `NOT PASSED` until the listed evidence is recorded by the responsible external system or authorized reviewer. Local source checks do not upgrade these statuses.

| Gate | Status | Required evidence before it may be marked passed |
|---|---|---|
| GitHub branch protection | GitHub branch protection: NOT PASSED | An administrator enables `quality` as a required `main` check. The private repository's current GitHub plan/API cannot enable the required rules from this task. |
| Isolated test infrastructure | isolated Neon/test identities/providers: NOT PASSED | Credential-safe confirmation of isolated Neon, test identities, and provider configuration; do not use production identities or provider accounts. Bypassed 2026-09-02 for a direct production deployment -- see docs/integration/main-release-cutover-evidence.md. This status remains accurate: no isolated Neon, test identity, or provider configuration was ever created. |
| Preview and UAT | Preview/UAT: NOT PASSED | An independent Preview, assigned UAT owner, recorded results, and a tested rollback path. WP-8 (2026-09-07) recorded a read-only browser run on the WP-7 Vercel Preview (see the WP-8 browser evidence above); that is evidence, not this gate — no UAT owner, no isolated database and no rollback rehearsal were recorded. |
| Production release | production approval: NOT PASSED | Explicit approval from the authorized production approver after all prior gates are passed. |
| Unsubscribe fallback | 6 September 2026 unsubscribe fallback deadline: NOT PASSED | An authorized owner records the completed fallback decision and evidence on or after 2026-09-10, never before. Corrected by WP-8: Phase A of `docs/superpowers/plans/2026-09-01-unsubscribe-secret-sunset.md` moved `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` in `lib/email/unsubscribe-token.ts` from 2026-09-06 to 2026-09-10; the status label keeps its original wording only because `tests/unit/wisetech-delivery-gates.test.ts` pins it, and 2026-09-10 is the governing date. Phase B is owner action 5 below. |

The five rows are external completion gates only: GitHub branch protection, isolated infrastructure, Preview/UAT, production approval, and unsubscribe fallback. Historical archive equivalence is optional future provenance evidence, not an external prerequisite.

## Owner actions recorded by WP-8 (not performed)

WP-8 (`worktree-wt-wp8-verification`, 2026-09-07) records these actions for the repository owner. None was performed by the programme, none is a source change, and recording them moves no status above.

1. **GitHub branch protection (gate 1).** Enable `quality` as a required status check on `main` and on `release`.
2. **Isolated test infrastructure (gate 2).** Create the isolated Neon branch, test-only identities and provider configuration for Preview acceptance; record their identifiers credential-free. Until then only read-only specs run against a Preview.
3. **Preview and UAT (gate 3).** Assign a UAT owner, record the results and rehearse the rollback path on an independent Preview.
4. **Production release (gate 4).** Explicit approval from the authorized production approver after gates 1 to 3 are passed.
5. **Unsubscribe Phase B — on or after 2026-09-10, never before.** Remove the `cronSecret` fallback from `lib/api/unsubscribe-route.ts` and `app/[locale]/(public)/unsubscribe/page.tsx`, then delete `LEGACY_UNSUBSCRIBE_SECRET_SUNSET` in `lib/email/unsubscribe-token.ts` and `tests/unit/unsubscribe-secret-rotation.test.ts` (which starts failing by design on that date). Phase A (`docs/superpowers/plans/2026-09-01-unsubscribe-secret-sunset.md`) moved the sunset from 2026-09-06 to 2026-09-10.
6. **Vercel "Protection Bypass for Automation"** for this project (or exempt Preview deployments from Vercel Authentication), so that `npm.cmd run test:lighthouse` can reach a Preview through `LHCI_BASE_URL`; then rerun Lighthouse on the ten `lighthouserc.js` targets and measure the SEO category on a target that is not served `noindex` (production, or a bypass-exempt Preview).
7. **Donor README note.** Paste the Markdown in `docs/integration/wisetech-donor-readme-note.md` into the README of `YNWAforever/wisetech`.
8. **Archive the donor repository** on GitHub (read-only) once the note is in place.

## Safe handoff sequence

1. Preserve this branch as the PR 1 local evidence handoff; do not start visual redesign here.
2. Have repository administration configure `quality` as required on `main`; this cannot be represented as a source-only change.
3. Preserve historical archive bytes only if later supplied for optional byte/history-equivalence evidence; do not treat them as a release prerequisite.
4. Create each subsequent PR from its approved predecessor and retain a discrete revert point.
5. Before a release candidate, use browser access and credential-safe, isolated infrastructure for Preview/UAT; record outcomes without copying credentials into the repository.
6. Only an authorized approver can authorize production action after every applicable gate is passed. No production operation is authorized by this document.

## Authoritative source status

The user-authorized Git donor `https://github.com/YNWAforever/wisetech` is PASSED LOCALLY: commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, 138 tracked files, and tree-list SHA-256 `79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c`. It is evidence only, not a byte or history continuity claim.

Historical master-plan commit `d2d82c01099490a8c2768c942186735667bbc881` and archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54` remain unverified provenance. This is non-blocking for the donor integration, and it does not change the external fail-closed states above.

The fixture/validator procedure is documented in [authoritative source reconciliation](wisetech-authoritative-source-reconciliation.md).
