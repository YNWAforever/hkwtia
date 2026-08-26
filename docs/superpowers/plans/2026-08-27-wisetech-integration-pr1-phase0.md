# WiseTech Integration PR 1 / Phase 0 Implementation Plan

> **Execution:** Use `superpowers:subagent-driven-development`. Every behavior change follows RED-GREEN-REFACTOR and every task receives an independent spec-and-quality review before the next task starts.

**Goal:** Deliver the reviewable local portion of PR 1: a secure reproducible baseline, required CI, machine-readable parity evidence, known landmark/locale fixes, and branch/release evidence without including visual redesign.

**Base:** `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f` (`origin/main` when the isolated worktree was created)

**Branch:** `codex/wisetech-hkwtia-integration`

**Site reference:** version 13, source commit `d2d82c01099490a8c2768c942186735667bbc881`, archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`.

**External evidence status:** The authoritative Site v13 archive has not been transferred through a credential-safe workflow. The integration documents must distinguish verified repository evidence, verified plan/design-document evidence, and source-archive evidence that is still unavailable. They must not claim the Phase 0 parity exit gate is closed until the archive is supplied and reconciled. GitHub branch-protection APIs are also unavailable for this private repository on its current plan; repository code can add the required CI check, but enabling required checks on `main` remains an external administrator/tier gate.

## Global Constraints

These are binding for every task:

- One canonical codebase: `YNWAforever/hkwtia`.
- One canonical database: the existing Neon schema, extended only through additive migrations.
- One authentication system: Neon Auth.
- One payment implementation: existing Stripe services and webhook route.
- One AI runtime: the existing Concierge/agent runtime and approval model.
- No browser-side database or provider credentials.
- All database access remains under `lib/db/repos/`.
- Preserve the current own-origin image policy and CSP; never add wildcard image hosts merely to accommodate prototype assets.
- Server Components remain the default; client components are limited to interactive behaviour.
- Route structure and business rules remain code-owned. Staff-editable content is allowlisted and audited.
- Every visible string stays bilingual and message-bundle parity remains enforced.
- Route topology and redirects remain owned by the App Router and `next.config.ts`.
- Dynamic routes and `/unsubscribe` must be represented even when absent from `config/public-routes.ts`.
- Every mapped CTA must resolve to a real canonical route or to the existing Concierge action; no placeholder form action is permitted.
- Exactly one `<main>` landmark is allowed per public page, and the public layout owns it.
- No manually constructed `/zh-HK/...` URL and no locale-dropping link is permitted.
- No secrets, production mutation, live provider use, production seed, migration, preview deployment, or paid-plan change is authorized by this task.
- PR 1 must not include visual redesign.

## Task 1: Secure the dependency baseline and add CI

**Files:**

- Create: `tests/unit/ci-security-contract.test.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:** Produces the required `quality` pull-request check and a lockfile with no production high/critical audit finding. Preserves the existing Neon Auth imports from `@neondatabase/auth/next` and `@neondatabase/auth/next/server`.

### Step 1: Write the failing CI/security contract

Create a focused Vitest contract that reads repository files and proves all of the following:

- `package.json` declares `@neondatabase/auth` as `^0.5.0-beta`.
- `package.json` forces Picomatch to a patched `2.3.2`-compatible release through an npm override.
- `package-lock.json` resolves every `better-auth` node above `1.6.21` and every Picomatch 2.x node at or above `2.3.2`.
- `.github/workflows/ci.yml` exists, uses read-only contents permissions, triggers on pull requests targeting `main`, uses Node 22 with npm caching, and runs these exact commands: `npm ci`, `npm run audit:strings`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm audit --omit=dev --audit-level=high`.
- The contract emits an actionable failure naming the missing or unsafe requirement.

Run:

```powershell
npm.cmd test -- tests/unit/ci-security-contract.test.ts
```

Expected RED: the dependency-version assertions fail and the workflow is missing.

### Step 2: Upgrade only the vulnerable production paths

- Change `@neondatabase/auth` from `^0.4.2-beta` to `^0.5.0-beta`.
- Add an npm override for `picomatch` compatible with `^2.3.2`.
- Regenerate `package-lock.json` with npm; do not hand-edit lockfile integrity fields.
- Do not use `npm audit fix --force` and do not downgrade `drizzle-kit`. The remaining old-esbuild finding is moderate and comes from development migration tooling; this task's required audit threshold is high.
- Inspect the resulting tree with `npm.cmd ls @neondatabase/auth @neondatabase/auth-ui better-auth picomatch`.

### Step 3: Add the least-privilege quality workflow

Create `.github/workflows/ci.yml` with:

- name `CI`;
- pull-request trigger restricted to `main`, plus pushes to `main`;
- `permissions: contents: read`;
- concurrency keyed by workflow and ref, with stale runs cancelled;
- one Ubuntu `quality` job using `actions/checkout`, `actions/setup-node` with Node 22 and npm cache;
- the exact command sequence asserted by the contract;
- no secrets, deployment, database, browser/provider, or mutation step.

Pin maintained official actions to current major tags already supported by GitHub Actions. Do not introduce third-party actions.

### Step 4: Verify RED becomes GREEN and auth behavior is preserved

Run:

```powershell
npm.cmd test -- tests/unit/ci-security-contract.test.ts tests/unit/auth-server-runtime.test.ts tests/unit/auth-env.test.ts tests/unit/join-auth-client-contract.test.ts
npm.cmd audit --omit=dev --audit-level=high
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected GREEN: focused tests pass, production audit exits 0 with zero high and zero critical findings, and all repository quality commands pass. If the exact auth test filenames differ, use graph discovery to identify the current runtime/client contract tests and record the substituted files in the report.

### Step 5: Commit

Stage only the four task paths and commit:

```text
chore: secure baseline and add CI
```

The report must include the RED output, GREEN output, dependency tree, audit summary, full-suite counts, and commit SHA.

## Task 2: Add the parity manifest and evidence documents

**Files:**

- Create: `config/wisetech-integration-manifest.ts`
- Create: `lib/integration/route-parity.ts`
- Create: `tests/unit/wisetech-route-parity.test.ts`
- Create: `docs/integration/wisetech-route-parity.md`
- Create: `docs/integration/wisetech-component-inventory.md`
- Create: `docs/integration/wisetech-content-mapping.md`
- Create: `docs/integration/wisetech-asset-register.md`
- Create: `docs/integration/wisetech-source-provenance.md`

**Interfaces:** Produces typed route/CTA inventory data and a pure validator consumed by tests. The documents are human-readable views of the same evidence and must state which claims await the Site source archive.

### Step 1: Write the failing parity contract

Create a test that first expects the missing manifest/validator, then validates the completed public contract:

- every entry has a stable `id`, `kind`, `source`, `canonicalPath`, `disposition`, `dataOwner`, `rationale`, and `evidence`;
- `kind` is one of `route`, `cta`, `form`, `locale`, or `asset`;
- `disposition` is one of `retain`, `merge`, `redirect`, or `retire`;
- evidence is one of `site-v13-source`, `site-v13-design-doc`, `master-plan`, or `hkwtia-repository`;
- route patterns are unique and support dynamic `[slug]` segments;
- the canonical inventory includes `/unsubscribe`, `/events/[slug]`, `/news/[slug]`, `/showcase/[slug]`, and `/about/history/[slug]` in addition to static routes;
- each non-retired internal destination is backed by an App Router page, an explicit `next.config.ts` redirect, or the existing Concierge action;
- the five master-plan CTA outcomes map exactly: events to `/events`; join to `/membership` then `/join?plan=<canonical-plan>`; member discovery to `/showcase`; Ask WiseTech to the existing Concierge action; register-interest only to a published event/cohort/inquiry durable owner;
- locale switching maps to the existing next-intl mechanism and does not construct `/zh-HK` paths;
- the pure validator rejects a hostile sample containing an unmapped route and another containing a nonexistent CTA destination, proving the boundary test can fail.

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-route-parity.test.ts
```

Expected RED: the manifest/validator modules do not exist.

### Step 2: Implement a typed, honest inventory

Implement one immutable manifest that can represent routes, CTAs, forms, locales, and assets. It must cover:

- every canonical route in the master plan's route-and-journey integration matrix;
- dynamic route patterns and `/unsubscribe`;
- the five CTA outcomes in the Site CTA contract;
- the known design-document routes already inventoried in the attached inner-page design references;
- current legacy redirects in `next.config.ts` that intersect Site destinations;
- forms/actions only when a durable existing target is known;
- asset categories known from the design documents and repository, without inventing filenames absent from the source archive.

Use `canonicalPath: null` only for a genuinely retired entry. A `merge` or `redirect` entry must name its real destination. `dataOwner` must identify the code/repository/CMS authority, not a generic team label.

Do not label an entry `site-v13-source` until the actual archive supports it. Until then, use `site-v13-design-doc` or `master-plan` and preserve the source-transfer gate in provenance metadata.

### Step 3: Implement the pure validator

The validator must:

- accept injected inventory and destination sets so hostile samples require no filesystem mutation;
- return structured errors with entry IDs and reasons;
- reject duplicate IDs/sources, missing required fields, invalid disposition/destination combinations, and unresolved internal destinations;
- understand static and `[slug]` App Router patterns;
- avoid importing server-only/database/provider modules.

The test may discover actual route page files with `fast-glob` only if that package is already present transitively and deliberately declared for test use; otherwise use Node filesystem traversal without adding a dependency. Keep filesystem discovery in test/support code, not the production manifest.

### Step 4: Write the five required evidence documents

The documents must include:

- exact repository base SHA and Site v13 metadata/hash;
- a legend separating repository-verified, design-document-verified, master-plan, and unavailable source-archive evidence;
- route parity rows derived from or checked against the manifest;
- component port/reuse/reject decisions;
- data/CMS ownership and migration implications;
- asset category, current repository asset evidence, own-origin/CSP rule, disposition, rights/alt-text status, and the archive reconciliation gate;
- no claim that every Site source route/file/asset is classified until the archive is attached and reconciled.

The asset register must never imply that a prototype logo is a member/partner or that an unverified image is cleared for production.

### Step 5: Verify and commit

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-route-parity.test.ts tests/unit/content-contract.test.ts tests/unit/redirects.test.ts
npm.cmd run lint
npm.cmd run typecheck
```

If an exact existing test filename differs, discover its current equivalent and record the substitution. Stage only task paths and commit:

```text
docs: add WiseTech parity evidence
```

The report must include RED/GREEN evidence, inventory counts by kind/disposition/evidence, unresolved source-archive gate, and commit SHA.

## Task 3: Fix nested public landmarks and the locale-dropping clear link

**Files:**

- Create: `tests/unit/public-landmark-contract.test.ts`
- Modify: `tests/unit/m5-public-showcase.test.tsx`
- Modify: `app/[locale]/(public)/showcase/page.tsx`
- Modify: `app/[locale]/(public)/showcase/[slug]/page.tsx`
- Modify: `components/marketing/showcase-filters.tsx`
- Modify: `components/marketing/aiops/dashboard.tsx`

**Interfaces:** The public layout remains the sole owner of `<main id="main-content">`. `ShowcaseFilters` gains the current `AppLocale` as an explicit input and its clear link uses the existing `localizedPath` helper.

### Step 1: Reproduce both defects with focused failing tests

Add a self-discovering public-landmark contract that scans public page sources and marketing components reachable by public pages for literal `<main` elements, excluding the owning public layout. It must report every offending file and include a hostile in-memory sample proving the detector fails when nested main markup is introduced.

Extend the existing Showcase presentational test to render filters in `zh-HK` and assert the clear link is `/zh/showcase`; retain an English assertion for `/showcase`.

Run:

```powershell
npm.cmd test -- tests/unit/public-landmark-contract.test.ts tests/unit/m5-public-showcase.test.tsx
```

Expected RED: the landmark test reports the Showcase list, Showcase detail, and AI-Ops dashboard `<main>` elements; the Chinese clear-link assertion receives `/showcase`.

### Step 2: Make the minimum fixes

- Keep `<main id="main-content">` in `app/[locale]/(public)/layout.tsx` unchanged.
- Replace only the nested page/component `<main>` wrappers in the two Showcase pages and `AiOpsDashboard` with neutral structural containers that retain classes and layout.
- Add `locale: AppLocale` to `ShowcaseFilters` and derive the clear link with `localizedPath(locale, "/showcase")`.
- Pass the already parsed page locale to `ShowcaseFilters`.
- Do not alter visible copy, query submission behavior, repository calls, page structure beyond the wrapper element, or styling.

### Step 3: Verify and commit

Run:

```powershell
npm.cmd test -- tests/unit/public-landmark-contract.test.ts tests/unit/m5-public-showcase.test.tsx tests/integration/m4c-acceptance.test.ts
npm.cmd run audit:strings
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected GREEN: no nested public landmark offender, locale-aware clear links in both locales, and all focused/static/build checks pass. Stage only task paths and commit:

```text
fix: preserve public landmarks and locale links
```

The report must include exact RED offender output, RED clear-link mismatch, GREEN results, and commit SHA.

## Task 4: Record branch safety and PR delivery gates

**Files:**

- Create: `tests/unit/wisetech-delivery-gates.test.ts`
- Create: `.github/pull_request_template.md`
- Create: `docs/integration/wisetech-delivery-gates.md`
- Modify: `docs/integration/wisetech-source-provenance.md`

**Interfaces:** Produces the auditable PR 1 handoff and reusable seven-PR checklist without pretending that repository settings or external evidence are code-complete.

### Step 1: Write the failing delivery-evidence contract

Create a test that requires the delivery document and pull-request template to contain:

- base SHA `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f` and Site source SHA `d2d82c01099490a8c2768c942186735667bbc881`;
- the `quality` CI check name;
- the seven PR scopes and their explicit must-not-include boundaries;
- Preview independence/rollback expectations;
- checkboxes for focused RED/GREEN evidence, `audit:strings`, tests, lint, typecheck, build, production audit, route/content parity, database/provider gates, and rollback notes;
- explicit status for Site source transfer, GitHub branch protection, isolated Neon/test identities/providers, Preview/UAT, production approval, and the 6 September 2026 unsubscribe fallback deadline;
- wording that fails closed instead of implying any external gate passed.

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-delivery-gates.test.ts
```

Expected RED: the files do not exist.

### Step 2: Write the branch/release evidence

Document:

- clean origin/main base and isolated worktree/branch;
- CI configuration present in source, with branch protection still external because the private repository's current GitHub plan/API cannot enable required rules;
- Site v13 identity/hash known, archive contents unavailable, and the safe handoff needed;
- no production database/provider/deploy action performed;
- seven sequential PR scopes exactly as the master plan specifies;
- rollback by reverting each independently deployable PR/commit; additive migrations later require application rollback without schema downgrade;
- final release commands and which require browser/credentials/isolated infrastructure.

Update provenance only to cross-link this evidence; do not duplicate large tables.

### Step 3: Verify the complete PR 1 branch and commit

Run:

```powershell
npm.cmd test -- tests/unit/wisetech-delivery-gates.test.ts tests/unit/ci-security-contract.test.ts tests/unit/wisetech-route-parity.test.ts tests/unit/public-landmark-contract.test.ts tests/unit/m5-public-showcase.test.tsx
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
```

Stage only task paths and commit:

```text
docs: record WiseTech delivery gates
```

The report must list every command and result, call out the two unresolved external gates, and include the commit SHA.

## PR 1 Completion Boundary

After all four tasks pass independent review, perform a whole-branch review against the base SHA. PR 1 is locally implementation-complete only when that review is clean and all non-credential commands pass. Phase 0 itself remains open until:

1. the authoritative Site v13 archive is safely supplied and reconciled so no source route, CTA, form, locale, component, content item, or asset remains unclassified; and
2. repository administration enables the `quality` workflow as a required `main` check (or the repository plan changes to support equivalent rules).

Do not begin PR 2 visual work on the PR 1 branch. Create the next reviewable branch from the approved PR 1 head after its completion boundary is recorded.
