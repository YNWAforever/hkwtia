# WiseTech delivery gates and PR handoff

## Recorded branch context

- Canonical repository: `YNWAforever/hkwtia`.
- Recorded clean `origin/main` base when this isolated worktree was created: `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`.
- Isolated worktree branch: `codex/wisetech-hkwtia-integration`.
- Site donor identity: ChatGPT Site `wisetech-hong-kong`, saved version 13, source SHA `d2d82c01099490a8c2768c942186735667bbc881`.
- Site archive identity: SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`; archive contents remain unavailable.

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

No production database, provider, deploy, migration, or seed action was performed.

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

The browser commands are final release evidence gates, not local completion claims. Both remain `NOT PASSED` on this branch because no isolated browser, Preview, Neon, test-identity, or provider acceptance was run.

| Exact command | Current status | Browser | Credentials | Isolated infrastructure | Evidence required |
|---|---|---|---|---|---|
| `npm.cmd run test:e2e` | NOT PASSED | Required | Required for protected, authenticated, or provider-backed release scenarios: test-only identities and provider configuration. | Isolated Preview and isolated Neon; never Production. | Record the Preview URL, isolated resource identifiers, scenario totals, and sanitized failures or skips. |
| `npm.cmd run test:lighthouse` | NOT PASSED | Required | Not required by the command when its target is public. | An isolated Preview target is required for final release acceptance. | Record the audited Preview URL, Lighthouse scores, thresholds, and report location. |

## External delivery gates

Fail closed: every status below is `NOT PASSED` until the listed evidence is recorded by the responsible external system or authorized reviewer. Local source checks do not upgrade these statuses.

| Gate | Status | Required evidence before it may be marked passed |
|---|---|---|
| Site source archive transfer | Site source archive transfer: NOT PASSED | Transfer through an approved credential-safe channel; recompute and match the recorded archive SHA-256; reconcile every source route, CTA, form, locale, component, content item, and asset. |
| GitHub branch protection | GitHub branch protection: NOT PASSED | An administrator enables `quality` as a required `main` check. The private repository's current GitHub plan/API cannot enable the required rules from this task. |
| Isolated test infrastructure | isolated Neon/test identities/providers: NOT PASSED | Credential-safe confirmation of isolated Neon, test identities, and provider configuration; do not use production identities or provider accounts. |
| Preview and UAT | Preview/UAT: NOT PASSED | An independent Preview, assigned UAT owner, recorded results, and a tested rollback path. |
| Production release | production approval: NOT PASSED | Explicit approval from the authorized production approver after all prior gates are passed. |
| Unsubscribe fallback | 6 September 2026 unsubscribe fallback deadline: NOT PASSED | An authorized owner records the completed fallback decision and evidence no later than 6 September 2026. |

The first two rows are Phase 0's unresolved external completion gates: archive reconciliation and required GitHub branch protection. The remaining rows are future release gates and must also remain fail-closed.

## Safe handoff sequence

1. Preserve this branch as the PR 1 local evidence handoff; do not start visual redesign here.
2. Obtain the authoritative Site v13 archive without exposing credentials, validate its hash, and complete source-item reconciliation.
3. Have repository administration configure `quality` as required on `main`; this cannot be represented as a source-only change.
4. Create each subsequent PR from its approved predecessor and retain a discrete revert point.
5. Before a release candidate, use browser access and credential-safe, isolated infrastructure for Preview/UAT; record outcomes without copying credentials into the repository.
6. Only an authorized approver can authorize production action after every applicable gate is passed. No production operation is authorized by this document.
