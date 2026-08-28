# WiseTech Site v13 Source Reconciliation Implementation Plan

> **Execution:** Use `superpowers:subagent-driven-development`. Run one implementer at a time. Every task follows RED-GREEN-REFACTOR and receives an independent spec/quality review before the next task starts.

**Goal:** Reconcile the user-authorized `YNWAforever/wisetech` donor into deterministic PR1 evidence without importing donor runtime/content or asserting false continuity with the historical archive identity.

**Branch:** `codex/wisetech-hkwtia-integration`

**Base supplement head:** `bf5dbd9b8d5fb6ff141b7caef7772a7f34454646`

**Donor pin:** commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, 138 tracked files, tree-listing SHA-256 `79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c`.

## Global constraints

- Preserve the reported archive commit and SHA-256 separately and mark equivalence unverified.
- The frozen fixture is source evidence only; do not import donor router, runtime, authentication, D1/Workers code, static business data, forms, or provider behavior.
- Do not classify donor partner/member/event/programme/metric/testimonial data as current hkwtia facts.
- No schema, migration, seed, provider, secret, Preview, production, design, auth, payment, or deployment action.
- CI must not clone the donor or call GitHub.
- Use exact paths and stage only task-owned files.

## Task 1: Add the frozen authoritative-source inventory and validator

**Files:**

- Create: `config/wisetech-authoritative-source-inventory.ts`
- Create: `lib/integration/authoritative-source-reconciliation.ts`
- Create: `tests/unit/wisetech-authoritative-source-reconciliation.test.ts`

### RED

Write focused tests requiring:

- exact repository/commit/tree/file-count/tree-listing identity and explicit discontinuity from the reported archive;
- two locales, 67 unique sitemap paths, complete dispatcher-only route classification, 35 navigation/CTA targets, six physical/nine logical form flows, the bounded component/content inventories, and 99 unique assets;
- one disposition per item and resolvable canonical destinations for every non-retired route/CTA;
- asset rows with source path, category, SHA-256, disposition, rights, relationship, English alt and Traditional-Chinese alt status;
- donor assets defaulting to not publishable, with all 79 historical partner logos rejected as current relationship evidence;
- hostile cases for a missing/duplicate classification, collapsed source identities, an unresolved target, and an unapproved logo marked publishable.

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-authoritative-source-reconciliation.test.ts
```

Expected RED: imports or required contracts are missing.

### GREEN

Build the immutable source-only fixture and pure validator. Generate file hashes from the pinned local donor during implementation, then check the resulting values into the fixture. Runtime tests must use only checked-in data.

Run the focused test until it passes, followed by lint and typecheck. Record counts, RED/GREEN output, and changed paths in `.superpowers/sdd/phase0-source-reconciliation-progress.md`. Do not commit before independent review.

## Task 2: Integrate donor evidence with the route-parity manifest

**Files:**

- Modify: `config/wisetech-integration-manifest.ts`
- Modify: `tests/unit/wisetech-route-parity.test.ts`

### RED

Extend the route-parity contract so it requires separate `reportedArchiveIdentity` and `authoritativeDonor` provenance, source-evidence-backed donor mappings, all 67 donor sitemap paths classified exactly once, the six previously missing explicit aliases, and continued next-intl routing without `/zh-HK` construction.

Keep the existing hostile destination, redirect, durable-owner, and frozen-array cases. Add hostile checks that source evidence cannot disappear or claim archive continuity.

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-authoritative-source-reconciliation.test.ts
```

Expected RED: current provenance still says the authoritative source is unavailable and the six paths lack explicit source mappings.

### GREEN

Update the manifest minimally. Preserve historical master-plan values, reference the frozen donor identity, add exactly the six missing source routes, and attach donor evidence without duplicating existing route-source identities. All current hkwtia data owners and route destinations remain authoritative.

Run focused tests, lint, and typecheck. Append evidence to the SDD ledger. Do not commit before independent review.

## Task 3: Reconcile the human-readable evidence and delivery gates

**Files:**

- Create: `docs/integration/wisetech-authoritative-source-reconciliation.md`
- Modify: `docs/integration/wisetech-source-provenance.md`
- Modify: `docs/integration/wisetech-route-parity.md`
- Modify: `docs/integration/wisetech-content-mapping.md`
- Modify: `docs/integration/wisetech-component-inventory.md`
- Modify: `docs/integration/wisetech-asset-register.md`
- Modify: `docs/integration/wisetech-delivery-gates.md`
- Modify: `tests/unit/wisetech-delivery-gates.test.ts`

### RED

Extend the delivery/source documentation contract to require the exact donor identity, deterministic inventory totals, explicit provenance discontinuity, the 79-logo non-publication rule, locally reconciled Git-source status, and separately unresolved historical archive equivalence and external gates.

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-delivery-gates.test.ts tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-authoritative-source-reconciliation.test.ts
```

Expected RED: the existing documents still describe the authoritative donor as unavailable.

### GREEN

Update all seven evidence documents consistently. Cross-link the checked-in fixture and validator. Do not mark branch protection, isolated infrastructure, browser acceptance, production approval, or the historical checksum as passed.

Run focused tests, string audit, lint, and typecheck. Append evidence to the ledger. Do not commit before independent review.

## Task 4: Whole-supplement review, verification, and publication

After all three task reviews report zero Critical/Important findings:

```powershell
npm.cmd test -- tests/unit/wisetech-authoritative-source-reconciliation.test.ts tests/unit/wisetech-route-parity.test.ts tests/unit/wisetech-delivery-gates.test.ts tests/unit/content-contract.test.ts tests/unit/redirects.test.ts
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
```

Perform an independent whole-diff review against `bf5dbd9b8d5fb6ff141b7caef7772a7f34454646`. Commit only the approved supplement with message:

```text
docs: reconcile authoritative WiseTech source
```

Push the existing PR1 branch and update PR #20 with exact local and external gate evidence. Then merge the updated PR1 branch forward into PR2 with a normal merge commit, rerun PR2 gates, independently review the merge result, push PR2, and update PR #21. Do not rebase or force-push either published branch.
