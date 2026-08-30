# WiseTech PR6 Join, Portal and Admin Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Join, the member Portal, and staff Admin with the WiseTech internal application-shell system while preserving every existing hkwtia authority and closing the member-login, sign-out, billing-interval, onboarding-handoff, completion-state, and locale-return gaps.

**Architecture:** One server-only membership catalog reconciles persisted plan rows, canonical plan metadata, billing interval, and configured Stripe Price IDs. Join returns a discriminated, actor-scoped outcome; member authentication uses one typed Portal-continuation authority; checkout and completion derive state from the durable membership. Shared internal-shell primitives provide responsive navigation and presentation only, while existing Server Components, Server Actions, repositories, authorization, audit, lifecycle, seat, CMS, CRM, automation, and Concierge owners remain in place.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.8, React 19, next-intl 4, Neon Auth, Stripe, Drizzle ORM/Postgres, Zod, Radix Sheet/Dialog, Tailwind CSS, Vitest, Testing Library, Playwright, Axe, Lighthouse CI.

## Global Constraints

- Work from PR6 branch `codex/wisetech-pr6-join-portal-admin` at approved-spec commit `8c83969e9f2244dadf8f9c9e3bc4d4431320c94a`, stacked on PR5 head `3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`.
- Because this document cannot self-reference its own commit, the external written-plan approval must issue exact closed `hkwtia.pr6.approved-plan.v1` binding repository/branch, approval reference, commit/parent OIDs, literal path `docs/superpowers/plans/2026-08-29-wisetech-pr6-join-portal-admin.md`, its Git blob OID/raw blob-byte SHA-256, approved-checkout raw SHA-256/effective-attribute fingerprint, and proof that the commit's sole changed path is that plan. Task 0 begins only from that approved-plan commit; every implementation, final-review, and publication head must descend from it.
- Treat `https://github.com/YNWAforever/wisetech` at commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, as presentation evidence only. Import no donor runtime, router, data, content, asset, authentication, or provider configuration.
- Add no schema, migration, production seed/import, provider configuration, production session, deployment, merge, or production action. Code for disposable test-fixture reset/insert and test-provider verification may be added only behind the exact isolated-acceptance guards in Tasks 4, 9, 10, 11, and 12; running any such mutation or provider call requires a separate recorded approval and is not authorized by approval of this plan.
- Preserve the existing Next.js App Router, next-intl locale mapping (`en` and `zh-HK` at `/zh`), Neon Auth adapter, Stripe signed/idempotent webhook authority, Server Actions, repository authorization, same-transaction audits, lifecycle rules, seat rules, CMS/CRM owners, automation controls, and Concierge runtime.
- Only Server Components, Server Actions, and `server-only` services may read repositories or provider configuration. Client Components receive localized labels, safe hrefs, presentation state, and sanitized action results.
- Billing interval is part of plan identity. Community and Patron use `none`. Startup and Corporate expose only `annual` in PR6. Reject `monthly` until a distinct approved Stripe mapping exists.
- Persist `billingInterval` explicitly on membership creation. Once a membership exists, its stored `planCode` and `billingInterval` override missing or conflicting query input.
- Keep `/portal/company/listing` canonical and reject `/portal/showcase`. Keep invitation acceptance at `/portal/company/seats/accept?token=opaque-token` and never copy the token into generic member-login continuation.
- Join, Portal, and Admin never import the public `SiteHeader`, announcement bar, mega menu, or public footer. The Portal continues to mount exactly one Concierge widget.
- Every behavior task in Tasks 1-11 starts with a focused failing test, records the exact RED cause, makes the smallest production change, records GREEN, refactors, and commits only its explicit paths. Task 12 adds verification harnesses and aggregate evidence only: it must not manufacture a RED result; any newly exposed behavior failure returns to its owning task for a reviewed fix.
- Every new English label/state has a Traditional Chinese peer. New controls are keyboard reachable, visibly focused, at least 44 px, reduced-motion safe, and do not rely on color alone.
- Each numbered task is implemented by one fresh implementer, receives an immutable base/head review package, and reaches zero Critical, Important, and Minor findings before the next task starts.
- Preserve unrelated work. Stage explicit paths only; never use `git add -A`. Every PowerShell staging command uses single-quoted `:(literal)` Git pathspecs so `[locale]` and route-group parentheses are never interpreted by PowerShell or Git glob matching.
- Task 0 establishes the only supported execution entry points. Every later Node and Git command uses the shell-native, hash-attested `$verifiedNode` or `$verifiedGit` closed script-block invoker; neither value is an executable path. Raw `npm`, `npm.cmd`, `npx`, PATH-resolved `node`/`git`/`rg`, direct Playwright/Vitest/LHCI, and unguarded package scripts are unsupported evidence. Any separate-authority database/provider/Preview run occurs in a dedicated process-scoped shell that is closed after cleanup; staging, commit, and review resume only in a fresh capability-free shell.
- Every creation, modification, or deletion of an executable, source, config, test, fixture, declaration, or package file immediately invalidates every runtime Node source manifest. Before the next RED/GREEN/static/build/browser Node launch, the implementer must perform Task 0's literal `Refresh-Pr6ExecutionRecord` barrier: close the editing shell; use the independently captured dependency-free generator to emit a candidate; obtain an external operator/CI approval that hash-binds the complete candidate; close that shell; start a new capability-free shell; resolve the new record; and recreate every closed invoker. A stale `$verifiedNode` must fail before child creation. Credential-free refresh grants no database, Auth, browser, provider, Preview, or publication authority. Tool-only `$verifiedGit` operations do not execute repository source, so a source edit invalidates the Node/source closure but not an otherwise unchanged Git distribution closure; every staged execution path still receives the exact attribute checks below.

## File Structure

- Create `lib/membership/catalog.ts`: the only server-side reconciliation of persisted plans, canonical metadata, billing interval, and configured Stripe Price IDs.
- Modify `lib/membership/constants.ts` and `lib/membership/lifecycle.ts`: canonical billing-interval type and durable membership projection.
- Modify `lib/membership/public-catalog.ts`, the Membership page, and `TierComparison`: display-safe catalog formatting with exact plan/interval actions and no price-reference serialization.
- Modify Join schemas, navigation, services, actions, and five Join pages: validated draft context, durable terminal outcomes, direct checkout/review/complete routing, and no dead status card.
- Create `/[locale]/member-login` and `PortalSignOutButton`; modify Portal auth routing and public member-entry configuration: one rate-limited Neon magic-link path and one operable client sign-out.
- Modify checkout, billing-attempt locking, Join state reading, completion, and Portal billing: exact durable plan/interval price selection, webhook-authoritative display, and locale-correct Billing Portal return.
- Add route-level seat invitation tests around the existing page actions and seat repository service; do not create another invitation service or auth callback.
- Create `config/internal-navigation.ts` and focused components under `components/internal-shell`: presentation-only shell, grouped responsive navigation, page header, section, status, table, empty, and action-feedback primitives.
- Modify the Join and Portal layouts/pages, then the Admin layout/pages in CRM, CMS, and Operations slices. Pages keep their current readers, actions, authorization, audit, and lifecycle owners.
- Create the fail-closed verified-runtime, credential-free build/test, immutable Next production-server, and managed Playwright foundations before product work; every later task consumes those entry points.
- Create credential-free and authenticated PR6 browser matrices plus `docs/integration/wisetech-pr6-verification.md`; replace M1's unconditional live skip, harden M2 mutation authority, make M3/M4B/M5 use the guarded managed runtime with complete restoration, add an isolated M7 CMS journey, and replace Lighthouse's local/public-upload fallback with an exact authorized-Preview public-route gate.

---

### Task 0: Install the pre-entry fail-closed execution and publication boundary used by every later task

**Files:**

- Create: `scripts/generate-pr6-execution-candidate.ps1`, `scripts/resolve-verified-runtime.ps1`, `scripts/invoke-verified-tool.ps1`, `scripts/pr6-native-process-boundary.ps1`, `scripts/managed-process-guardian.ps1`, `scripts/managed-runtime-environment.mjs`, `scripts/managed-runtime-environment.d.mts`, `scripts/run-credential-free-verification.mjs`, `scripts/run-managed-playwright.mjs`, `scripts/run-managed-next.mjs`, `tests/contracts/pr6-unsafe-bootstrap.red.ps1`, `tests/fixtures/powershell-profile-probe.ps1`, `tests/fixtures/credential-free-process-env-probe.mjs`, `tests/fixtures/managed-next-env-probe.mjs`, `tests/fixtures/managed-process-creation-window-probe.mjs`, `tests/fixtures/materialization-late-file-probe.mjs`, `tests/unit/verified-runtime-bootstrap.test.ts`, `tests/unit/credential-free-verification-boundary.test.ts`, `tests/unit/credential-free-build-boundary.test.ts`, `tests/unit/managed-next-production-boundary.test.ts`.
- Modify executable guidance: `package.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.github/pull_request_template.md`, `docs/integration/wisetech-delivery-gates.md`, `tests/unit/wisetech-delivery-gates.test.ts`.
- Consume without executing application code: the locked `package-lock.json`; operator-approved non-secret PowerShell-launch, approved-plan, execution-attestation, preamble/channel, and operation records; the trusted external native credential broker; immutable complete PowerShell/Node/npm/Git/GitHub CLI execution distributions; and the exact environment-name sources enumerated below.

**Interfaces:**

- Every “shell” in this plan means a process created by an operator/CI-owned launcher outside the repository under separately approved `hkwtia.pr6.powershell-launch.v1`. That closed schema binds the canonical PowerShell root/executable path/version/SHA-256, complete ordered distribution-manifest path/hash/member aggregate, fixed arguments `-NoLogo -NoProfile -NonInteractive -Command -`, replacement-environment allowlist, launcher approval reference, and an exact per-launch bootstrap preamble `{byteLength, sha256, childControlHandleOrFd, parentEndpointIdentity, pipeAclOrPeerCredential, nonce}`. The trusted launcher resolves every distribution member without link/reparse ambiguity, applies the restricted-token/read-only-root policy below so no DLL/module/profile can appear, holds the complete distribution immutable, and starts that executable with no profile or repository file argument.
- Standard input carries exactly the hash-bound dependency-free preamble bytes and then EOF; it never carries a field, secret, or second script. The per-launch preamble embeds only the recorded control-handle/fd identity and nonce, so its exact bytes are known and approved before process creation. All later traffic uses the distinct full-duplex OS pipe/socket `hkwtia.pr6.launch-channel.v1`: each bounded frame is `u32be payloadLength | u8 kind | u64be sequence | 32-byte nonce | payload | sha256(header+payload)`, maximum 1 MiB, with one closed allowed-kind/sequence table for process handshake, non-secret resolver fields, operation fields, child-launch requests, capability acknowledgement, and terminal result. The endpoint is inherited only by the PowerShell process, is not named in its environment or arguments, cannot be reopened by path, and is never inherited by grandchildren. Partial, duplicate, out-of-order, oversized, wrong-nonce/hash, extra-after-terminal, peer-identity, or handle drift closes both endpoints and kills the contained tree before repository bytes.
- Database, Auth, Stripe, Neon, Vercel, GitHub, share-token, and other provider values remain in the trusted launcher's memory escrow; they never exist in the PowerShell process environment, command line, profile, stdin, output, or operation record. Before receiving even non-secret execution-record fields, the preamble returns an OS-verified handshake containing the live process image, complete distribution hash, startup vector, replacement-environment fingerprint, preamble byte length/hash, control endpoint/peer identity, nonce, parent identity, and proof profiles were disabled. Only after exact equality does the launcher send framed non-secret resolver fields. A managed Node child later receives its exact subset through its own post-import non-inheritable capability endpoint. A native Git/GitHub-CLI request instead goes to the launcher-owned native credential broker defined below; PowerShell never receives that capability. If the launcher, framing, broker, or capability endpoint is unavailable, every local/provider/publication gate is `NOT PASSED` before repository code.
- Task 0 Step 1 is the sole pre-execution-record exception. It uses closed `hkwtia.pr6.initial-red-attestation.v1` issued only after the new contract and one closed immutable outside-worktree `hkwtia.pr6.initial-red-baseline.v1` exists and before any other Task 0 source is created. The attestation binds repository root; approved-plan path/hash and full identity; exact PowerShell launch/preamble/channel identity; immutable complete PowerShell distribution; exact contract path/allowed-root/hash; baseline-record path/hash; the outside-worktree baseline's ordered member manifest/aggregate; the exact dependency-free `New-Pr6ApprovedScriptBlock` helper bytes/hash already embedded in the approved preamble; fixed argument `-ExpectedState UnsafeBaseline`; and one-use approval/expiry. Each baseline member is closed `{literalPath, allowedRoot, byteLength, sha256}`. The required current members are exactly `package.json`, `package-lock.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.github/pull_request_template.md`, and `docs/integration/wisetech-delivery-gates.md`; the record also carries fixed metadata-only absence tombstones for every Task 0 Step 2 Create path from the Files list and for forbidden worktree output/shim roots. These bytes/tombstones cover every raw npm/npx/PATH, preload, Playwright, Next, bootstrap, output, and containment assertion; missing, extra, reordered, or wrong-presence entries fail. The record forbids the resolver, generator, invoker, native adapter, guardian, Node/npm/Git/GitHub CLI/browser/provider/database/Preview/publication fields and every repository path except the contract, baseline record, and exact manifest members. After handshake the launcher may frame only contract path/root/hash plus baseline-record path/hash. The embedded helper and contract capture each approved byte array once, validate the aggregate before evaluation, return one structured result derived from those bytes, and terminate the shell. Any ambient repository enumeration, unmanifested read, hard-coded assertion result, extra frame/invocation, or record reuse fails.
- After that one initial-RED shell, every shell uses an external execution record populated by the operator/CI approval system before launch and never inferred from PATH, a shim, the repository, or ambient configuration. Its exact JSON schema is discriminated `hkwtia.pr6.execution-attestation.v1` with required `recordKind: "install-only" | "runtime"`; unknown, missing, duplicate, case-colliding, or kind-incompatible fields fail. Both kinds require canonical `repositoryRoot`; exact approved PowerShell-launch-record path/hash; byte-equal preamble length/hash and `hkwtia.pr6.launch-channel.v1` endpoint/protocol identity; exact `hkwtia.pr6.approved-plan.v1` path/hash plus duplicated repository/branch/commit/parent/literal-plan-path/blob-OID/raw-blob-SHA-256/approved-checkout-SHA-256/effective-attribute/docs-only-change fields; path/allowed-root/SHA-256 entries for generator, resolver, invoker, native adapter, guardian, and bootstrap contract; complete PowerShell/Node/npm distributions; an ordered mode-specific source manifest; and the canonical-record SHA-256. Before any source execution, the launcher independently validates the approved-plan record, literal current plan bytes, and sole-path commit proof; a runtime shell additionally uses verified Git to require its `HEAD` and branch ref descend the approved-plan commit. `install-only` permits only `install` and forbids `gitDir`, Git/GitHub CLI, installed CLIs, browser/provider/database/Preview/publication fields. `runtime` forbids `install` and requires canonical `gitDir`, complete Git distribution, the entire worktree-local `node_modules` manifest bound to `package-lock.json`, all runtime sources, and every installed CLI. Browser modes require a separately approved complete browser/FFmpeg distribution; non-browser modes forbid it. Publication adds GitHub CLI only through its separate descriptor. Every manifest covers all loadable executables, libraries, scripts, locales, resources, PAK/snapshot, packages, and configs. No record contains a credential.
- After the live launch handshake, every `install-only`, `runtime`, or operation shell receives five framed non-secret core fields—execution-record path/hash and resolver path/allowed-root/hash. An operation shell may additionally receive exactly `operationInputRecordPath` and lowercase `operationInputRecordSha256` only when the launch record names one operation schema, its schema-owned referenced-record/script schemas, and immutable allowed roots. The one-use initial-RED flow above has no execution record or resolver and may receive exactly five ordered fields—contract path, contract allowed root, contract SHA-256, baseline-record path, baseline-record SHA-256—and no sixth frame. No shell reads console, command-line, ambient environment, clipboard, profiles, or repository state to discover bootstrap, continuation, approval, gate-status, or reviewed-head fields. A missing/unmanifested file, profile or preamble drift, alternate host/endpoint, mutable path, extra frame/field, or schema/version mismatch fails.
- Before invoking `resolve-verified-runtime.ps1`, the captured preamble rechecks its own byte identity, live no-profile process handshake, channel transcript prefix, approved-plan identity, and independently approved resolver bytes. The resolver hashes and duplicate-key-validates the execution record, enforces kind fields, rechecks process/launch/preamble/channel equality, canonicalizes roots, and verifies every distribution/source manifest. It reads invoker, native adapter, guardian, and bootstrap contract once, strict-decodes/hash-checks those arrays, and returns immutable `InvokerScriptBlock`, `NativeProcessBoundaryScriptBlock`, `GuardianScriptBlock`, `BootstrapContractScriptBlock`, `InputRecordResolverScriptBlock`, and `ApprovedScriptResolverScriptBlock` plus descriptor path/hash/kind, canonical `RepositoryRoot`, and `ApprovedPlanCommit`. Both resolvers accept only launch-record-owned schemas and canonical read-only roots, read once, reject links/reparse points and duplicate/case-colliding/unknown/missing/noncanonical values, and return one deep-immutable object or script block while the launcher holds every referenced file through exit. They never invoke a mutable path or enumerate the environment.
- Exact non-secret operation/evidence records are closed schemas. `hkwtia.pr6.m4c-readonly-input.v1` binds the Task 12 target/helper/exact status-entry identities, M4C approval descriptor, request manifest, repository/branch/PR5/spec/approved-plan/`preTask12Head`, and read-only provider operation. `hkwtia.pr6.lighthouse-collect-input.v1` binds the Task 12 target/helper, exact expected status entries/hash, repository/branch/PR5/spec/approved-plan/`preTask12Head`, Preview approval, and six checkpoint/entrypoint/config identities. `hkwtia.pr6.verification-authoring-input.v1` binds those target/helper/head/checkpoint fields; explicit `preAuthoringExpectedStatusEntries`/hash and `postAuthoringExpectedStatusEntries`/hash, where every ordered entry fixes literal path plus index/worktree status and the post set equals the pre set plus exactly index-clean/worktree-`?` `docs/integration/wisetech-pr6-verification.md` and `docs/integration/wisetech-pr6-pr-body.md` entries; exact `lighthouseAttemptStatus: "UNAUTHORIZED" | "AUTHORIZED_FAILED" | "PASSED"`, `providerProofCompleted`, `runCreated`, `retainedManifestCompleted`, `fieldInpStatus: "UNAUTHORIZED" | "NOT_PASSED" | "PASSED"`, and derived overall `gateStatus`, where the overall gate is `PASSED` only when the Lighthouse attempt and field INP status are both `PASSED`; the literal verification-document path and permission to return only its post-commit `HEAD:path` OID proposal; one `hkwtia.pr6.suite-evidence-manifest.v1` path/hash plus its exact ordered `expectedSuiteEvidenceEntries`/aggregate; one `hkwtia.pr6.lighthouse-checkpoint-evidence.v1` path/hash; an exact `hkwtia.pr6.lighthouse-attempt-receipt.v1` path/hash iff authorized; provider-sanitized evidence iff `providerProofCompleted`; run root iff `runCreated`; `hkwtia.pr6.lighthouse-retained-artifact-manifest.v1` iff `retainedManifestCompleted`; and `hkwtia.pr6.field-inp-evidence.v1` iff field INP is not `UNAUTHORIZED`. `UNAUTHORIZED` requires all three completion booleans false, field INP `UNAUTHORIZED`, and forbids every attempt/provider/run/retained/field field; `AUTHORIZED_FAILED` requires the attempt receipt and retains every phase that completed; `PASSED` requires the receipt, all three completion booleans true, provider evidence, run root, and retained manifest, but does not by itself pass the overall gate when field INP is absent or noncompliant. `retainedManifestCompleted` implies `runCreated`, `runCreated` implies `providerProofCompleted`, and any non-`UNAUTHORIZED` field status implies provider proof. The authoring input's ordered expected suite inventory is launcher-derived from every immutable verified-command receipt completed before the Step 7 authoring record is issued and fixes each entry identity, task, suite, run ID, phase, command-vector hash, execution-source-manifest hash, and cleanup-receipt hash; its count/aggregate must exactly equal the resolver-recomputed suite manifest and no receipt may be omitted, duplicated, reordered, or invented. The ordered suite manifest binds repository, `authoringHead`, approved-plan commit, exact attempt status/all completion booleans/field INP/derived `gateStatus`, and entries containing a unique lowercase `entryIdentitySha256`, exact `task: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12"`, suite/run ID, `phase: "RED" | "GREEN" | "AGGREGATE"`, task base/reviewed head, execution head, immutable `hkwtia.pr6.execution-source-manifest.v1` path/hash, sanitized command/mode/ordered argument vector plus its hash, start/end timestamps, exit code, totals/warnings/skips, `outcome: "EXPECTED_RED" | "PASSED" | "NOT_PASSED"`, exact nonempty RED cause iff phase is RED, approval reference, `reviewState: "ZERO_FINDING" | "PENDING_FINAL_REVIEW"`, conditionally present `hkwtia.pr6.task-review-package.v1` path/hash, and `hkwtia.pr6.cleanup-receipt.v1` path/hash. Tasks 1-11 entries require `ZERO_FINDING`, task reviewed head, and the package; each task must have at least one unique `RED` and one unique `GREEN` entry and may have no `AGGREGATE` entry. One or more Task 12 `AGGREGATE` entries require `PENDING_FINAL_REVIEW`, task base/execution head equal `authoringHead`, and forbid task reviewed head/package; Task 12 may have no `RED` or `GREEN` entry. The resolver computes the ordered pending Task 12 entry count, entry-identity aggregate, source-manifest aggregate, and cleanup-receipt aggregate; Step 9's final review package closes the full pending set after commit. The source manifest binds repository, execution head, exact pre-execution source bytes/aggregate, execution-attestation hash, and command-vector hash. Each task-review package binds task, base/reviewed heads, spec/approved-plan ancestry, the reviewed source/evidence aggregate, the exact ordered execution-source-manifest hashes it reviewed, and exact zero Critical/Important/Minor totals. Each cleanup receipt binds its entry/run/execution head/outcome and closed sanitized session/data/provider/artifact cleanup projections. The Lighthouse attempt receipt binds repository, immutable `evidenceHead`, approval, attempt status, last completed phase, all three completion booleans, sanitized failure/result, and the conditional provider hash, run root, and retained-artifact hash. A failed retention-manifest phase is representable as `AUTHORIZED_FAILED` with `runCreated: true`, `retainedManifestCompleted: false`, the canonical run root in the receipt, and no fabricated manifest. Checkpoint evidence binds the six prepare-index identities and execution aggregates; retained-artifact evidence binds repository, `evidenceHead`, the authorized run root, and every retained file hash; provider-sanitized evidence binds repository, `evidenceHead`, and only token-free deployment/head/Chrome projections. Field-INP evidence binds repository, `evidenceHead`, exact deployment, authorization/sample window, sample sufficiency, p75 milliseconds, threshold 200, and status; p75 is finite/non-negative when samples are sufficient and canonical null otherwise; `PASSED` requires sufficient samples and p75 at most 200, while `NOT_PASSED` requires that conjunction to be false. Every resolver recomputes canonical command-vector, source, expected-inventory, manifest, review, cleanup, checkpoint, retained, provider, and field-evidence aggregates. All cross-record repository/task/head/run/suite/status/hash duplicates must be byte-equal. Every Tasks 1-11 entry execution head/source manifest belongs to its zero-finding task-review lineage; the complete ordered pending Task 12 set is instead bound by exact count plus entry/source/cleanup aggregates into the final zero-finding review package. `hkwtia.pr6.verification-document-hash-input.v1` binds repository/branch/PR5/spec/approved-plan/final head, literal final verification-document path, and the exact Git blob OID resolved after the final commit; it authorizes only local branch/head/ancestry/status/OID revalidation plus binary-safe hashing of that attested OID. `hkwtia.pr6.lighthouse-commit-verification.v1` binds the same repository/branch/PR5/spec/approved-plan/final-head/literal-path/blob-OID identity plus that document's raw blob-byte SHA-256/length, the exact pre-Task-12 `evidenceHead`, the six checkpoint identities, attempt status/receipt, all completion booleans, field-INP status/evidence, derived overall gate status, and every conditionally completed provider/run/retained artifact identity under the same invariants; it forbids a run root only when `runCreated` is false and forbids the retained manifest only when `retainedManifestCompleted` is false, never merely because the overall gate is `NOT_PASSED`. `hkwtia.pr6.zero-finding-review-package.v1` binds repository/branch, reviewed head, PR5/spec OIDs, approved-plan record/commit/literal path/blob OID/raw blob-byte SHA-256/approved-checkout identity/docs-only origin, reviewer evidence hash, the exact suite-manifest and expected-inventory hashes, the pending Task 12 entry count and ordered entry/source-manifest/cleanup-receipt aggregates, plus final verification-document blob identity, and exact totals `{critical: 0, important: 0, minor: 0}`. `hkwtia.pr6.publication-input.v1` binds that review package, exact approved-plan record, publication descriptor, repository/head/base branches, base/spec/approved-plan/reviewed-head OIDs, literal plan/blob identity, the exact suite-manifest/expected-inventory hashes, pending Task 12 entry count, ordered entry/source/cleanup aggregates, and the final verification-document path/blob OID/raw SHA-256/byte length copied from the review package. Unknown fields, missing referenced schemas, unresolved paths, or duplicate mismatch fail. No record contains a token, credential, raw provider response, or raw review prose. Trusted launcher/CI issues each only after its prerequisite exists; no record is reused for another schema, head, or shell.
- `invoke-verified-tool.ps1` is the only top-level process-launch boundary. Every non-install Node mode reads each approved source and the entire approved `node_modules` tree once, hashes the captured bytes, and materializes the original relative layout into one unique absent OS-temp root. Files are created with create-new semantics, re-hashed after open, and source/module paths are separated from all writable outputs. ESM, CJS, Next, Vitest, Playwright, TypeScript, declarations, dynamic imports, and package resolution run only from that byte-equal tree; the checkout/original `node_modules` are never reopened by a non-install child.
- File handles alone are insufficient. On Windows the parent creates a restricted child token without `WRITE_DAC`/`WRITE_OWNER`/delete privileges and applies exact DACLs that deny the child file/directory creation, rename, link, write, delete, and alternate-stream rights on every executable/source/module/distribution resolution root while allowing read/execute/traverse. On POSIX the native adapter uses a private mount namespace with read-only bind mounts for those exact roots and no writable overlay there. The parent precreates separately mounted/DACL-scoped writable output/cache slots listed below; no executable/module resolution path may descend into them after sealing. After applying policy, enumerate/re-hash every directory entry and prove a barrier-controlled child cannot add `late.mjs`, a package, DLL, PAK, locale, link, or directory beside a held file. The parent retains ownership/restore metadata, but the restricted child cannot relax policy. Missing ACL/mount support is `NOT PASSED` before process creation.
- `install-only` is the sole explicit checkout-write exception and never uses the non-install “checkout never reopened” claim. Its captured launcher/npm distribution executes from immutable materialization, but npm's fixed working target is the canonical worktree. The trusted parent holds exact `package.json`/`package-lock.json` bytes immutable and gives the restricted child write/create/delete rights only to an absent or prevalidated worktree-local `node_modules` root; every other worktree path is read-only. POSIX uses a read-only worktree bind plus one writable `node_modules` bind. Run exact `ci --ignore-scripts --no-bin-links --audit=false --fund=false`, so `node_modules/.bin` and POSIX bin symlinks never exist; required CLIs resolve from hash-bound package `bin` targets as regular files and never from shims. On exit revoke the write mount/ACL before scanning the resulting exact worktree tree. Any other changed path, link/junction/reparse point, lifecycle/browser download, late write, or target mismatch fails and the tree is not attestable.
- Node starts with a cleared environment under the restricted token/namespace. Control/capability pipes are non-inheritable except the explicitly duplicated endpoint; descendants receive explicit maps/handles. After pre-capability imports from sealed roots, the child returns descriptor/source/materialization/policy hashes, the exact operation-input-record hash when present, mode, entrypoint, `process.execPath`, immutable root, and parent nonce. Only then may the trusted launcher send the retained subset directly to that child; after acknowledgement it zeroes its buffer and closes its endpoint. A missing/late handshake kills the non-breakaway tree. Attested packages may create necessary descendants only inside the same Job/process group and under the same restricted token/mount namespace. Unexpected images, inherited capabilities, writable resolution roots, or outside processes fail. Ambient loaders, `NODE_PATH`, `GIT_*`/`GH_*`, helpers/hooks/proxies/shims are absent.
- The only outside-repository Node entrypoint form is Task 12's fixed `checkpointed-staged-node`. The invoker validates the checkpoint path/hash and materialized entrypoint/config path/hash shape under its immutable root and uses the same materialization/handshake boundary; arbitrary absolute scripts/configs remain forbidden.
- `Refresh-Pr6ExecutionRecord` is a mandatory protocol, not an in-process shortcut. Close the editing shell. The trusted launcher creates a fresh verified no-profile PowerShell process with no capability map; there, independently capture `generate-pr6-execution-candidate.ps1`. The generator may read source and emit only a non-secret candidate outside the worktree and cannot launch Node/Git/provider/database code. External approval binds a new kind-appropriate record. Close it; the trusted launcher creates another fresh no-profile capability-free shell, reruns bootstrap, and recreates invokers. The resolver rejects a manifest predating any file-byte change. Refresh is required before the first Node command after every edit phase and before affected executable staging. Git-only calls retain their separately verified closure but cannot make stale Node source current.
- At the start of every runtime shell, create closed script-block invokers named `$verifiedNode`, `$verifiedGit`, and `$verifiedGh` from the returned immutable invoker/native-adapter/guardian blocks and descriptor. An operation shell must rebuild only the needed invoker with the exact `-OperationInputRecordPath`/`-OperationInputRecordSha256` pair; the invoker re-resolves that record, requires its hash in the child handshake, and rejects an operation or capability not named by its schema. Existing `& $verifiedNode ...` and `& $verifiedGit ...` examples therefore enter the captured invoker block; they are not executable paths. Node calls use exact mode/source/materialization manifests and the post-handshake capability pipe. Local Git calls receive an empty replacement environment, canonical `--git-dir`/`--work-tree`, disabled includes/hooks/fsmonitor/askpass/signing/arbitrary helpers/optional locks/external diff/textconv/proxies/URL rewrites/network, and only the attested author plus inert core settings. Before literal `add` it rejects effective executable filters, `ident`, or working-tree encoding. Raw Git, raw `gh`, raw `rg`, PATH resolution, alternate helpers/hooks/config, unmanifested files, or local network attempts fail before execution.
- Local Git text mode captures only strict bounded UTF-8 output. Its separate `GitBlobSha256` capture mode accepts exactly `cat-file blob <attested-40-hex-oid>`, streams native stdout bytes directly into a parent-owned incremental SHA-256/byte counter without PowerShell text conversion or filesystem output, and returns one closed `{schema: "hkwtia.pr6.git-blob-sha256.v1", oid, byteLength, sha256}` object. Tests use LF/CRLF/NUL/non-UTF-8 blobs to prove byte accuracy and forbid that mode for any other arguments. An operation-bound `$verifiedGitBlobSha256` closure is mandatory wherever this plan compares a raw Git-blob SHA-256.
- Remote mutation additionally requires exact non-secret `hkwtia.pr6.publication-approval.v1` bound to `github.com`, repository, head/base/ref/OIDs, PR5/spec/approved-plan record and literal plan/blob raw-hash identity, reviewed SHA, complete immutable Git/HTTPS/shell/credential-helper/GitHub-CLI closures, canonical GitHub config directory, fixed argument allowlists/deadlines, and approval reference. It contains no credential. A distinct `hkwtia.pr6.publication-reconciliation.v1` is required after an uncertain mutation; it binds one operation receipt path/hash and permits only the exact read-only `ls-remote`, `gh pr list`, and `gh pr view` arguments needed for that receipt. It forbids push/create/close and cannot be substituted for the publication descriptor.
- PowerShell never starts a credentialed Git/`gh` process itself. For every descriptor-authorized remote read or mutation, the operation-bound invoker sends one framed non-secret launch request and argument hash to the external launcher's native credential broker. After descriptor/receipt/allowlist equality, the broker creates the exact attested Git/HTTPS/helper or GitHub-CLI tree under the same restricted token, non-breakaway Job/process group, deadlines, and read-only executable/config roots. It builds a child-tree-only replacement environment: canonical OS runtime keys, read-only empty `GH_CONFIG_DIR`, and exact `GH_TOKEN` bytes copied from escrow only for the contained Git/`gh`/`gh auth git-credential` tree. Credential bytes may traverse exactly one non-inheritable broker-contained private helper-to-parent-Git stdout pipe, consumed directly by that contained Git process; the broker never captures, logs, returns, or mirrors that pipe. Outside that private pipe, the token is absent from PowerShell/Node and sibling environments, command lines, stdin, broker-exposed or caller-captured stdout/stderr, config, receipts, and disk; no credential-store/login command is allowed. On final descendant exit or cancellation, the broker closes the private pipe and all handles, destroys the environment block, zeroes every parent token buffer, and records only token-name absence plus synthetic-value hashes in tests. Source/subprocess tests use a fake broker token to prove exact helper/direct-`gh` success, private helper-to-Git pipe consumption, shell/Node/caller-output absence, read-only config, output redaction, no sibling inheritance, full-tree cleanup, and failure before network when pipe/broker/acknowledgement/zeroing drifts.
- Before every remote-mutating `push`, `pr create`, or `pr close` child is created, the invoker atomically writes one immutable, non-secret `hkwtia.pr6.publication-operation.v1` STARTED receipt outside the worktree. It records a UUID operation ID, operation kind, repository, exact base/head/ref and reviewed SHA, captured PR number when already known, start timestamp, publication-descriptor hash, and hash of the fixed argument vector. A clean zero exit creates a separate immutable SUCCEEDED completion receipt bound to the STARTED hash; for `pr create`, SUCCEEDED additionally requires exactly one canonical stdout URL/number and records that number, otherwise the result is OUTCOME_UNCERTAIN. Receipts are never rewritten or appended. Timeout, cancellation, broken pipe, lost transport, killed helper/descendant, or any exit whose remote effect cannot be proven creates a separate immutable `OUTCOME_UNCERTAIN` receipt, closes the complete process tree/handles, revokes the publication invokers, prints only receipt path/hash, and throws before caller code can run another command.
- Uncertainty always ends the publication happy path. A fresh shell may resolve only the separately approved reconciliation descriptor. For push: remote head absent means “not landed,” exact reviewed SHA means “landed,” and any other/multiple result means manual inspection. For create: the exact owner/head open-PR count 0 means “not created,” 1 requires exact `pr view` and is reported as discovered, and greater than 1/ambiguous means manual inspection. For close: exact captured PR state CLOSED or OPEN is reported. Every reconciliation result stops `NOT PASSED`; no automatic retry, continued publication, duplicate creation, automatic close, or mutation is allowed in that run.
- `managed-runtime-environment.mjs` initially owns the pure credential-free environment builders and exact classified-capability inventory; Task 4 extends the same module with suite manifests. `run-credential-free-verification.mjs` is executable-only and accepts exactly `install`, `audit`, `audit-strings`, `lint`, `typecheck`, `build`, `unit`, or `e2e` plus each mode's fixed literal arguments. `audit-strings` accepts only no argument for the complete manifest or one exact source-tested manifest key: `membership-client-secrets`, `membership-create-intervals`, or `internal-shell-public-imports`; it performs the fixed repository-file/regex scan in-process and cannot accept an arbitrary path or pattern. The launcher rejects case-colliding keys, `PLAYWRIGHT_BASE_URL`, every recognized database/provider/Auth/password/token/sentinel/proxy/telemetry destination in the original parent, every repository `.npmrc`, and every root dotenv candidate `.env`, `.env.local`, `.env.test`, `.env.test.local`, `.env.development`, `.env.development.local`, `.env.production`, and `.env.production.local` before any third-party or application import.
- Every child map starts empty. Install-only uses the restricted exact-target boundary above, empty run-owned npm configs, public registry only, exact lock host `registry.npmjs.org`, and `ci --ignore-scripts --no-bin-links --audit=false --fund=false`. Before/after npm, validate the canonical worktree and sole writable `node_modules` identity. After write authority is revoked, the dependency-free generator inventories the entire local tree, proves `node_modules/.bin` absent, rejects every symlink/junction/reparse point, and verifies each required CLI's package-lock/package-json `bin` target is an exact regular file. Close install shell; external approval must bind a fresh runtime record before other modes. Reinstall invalidates it. Audit is runtime-only `audit --omit=dev --audit-level=high`.
- Every `unit`, managed-Vitest, credential-free `e2e`, and managed-Playwright launch precreates one run-owned writable output root outside every source/module/executable resolution root. Guarded `vitest.config.ts` accepts only the descriptor/run-ID-bound internal cache path, sets Vite `cacheDir` to `<runOutput>/vitest-cache`, keeps coverage/update-snapshot/file reporters disabled, and has no raw/default fallback; source-pin locked Vitest 3.2.7/Vite behavior and prove no `node_modules/.vite/vitest` or other source/module write. Guarded `playwright.config.ts` sets exact `<runOutput>/playwright-output` as `outputDir`, line reporter only, `preserveOutput: "never"`, and trace/screenshot/video off where required; `.last-run.json` may exist only there. Output roots are precreated under DACL/mount write scope, excluded from `NODE_PATH`, imports, config discovery, and traced dependency closure, enumerated after exit, and removed by the guardian. Any root-level `test-results`, source/module cache, snapshot update, HTML/blob report, attachment, unexpected output, or cleanup residue fails. Boundary tests run the real locked runners and inject success/failure/cancellation to prove exact routing and cleanup.
- The `build` and `e2e` modes reserve one loopback port/origin and create a run ID. Before locking the materialized project, the parent creates and seals exact generated `tsconfig.pr6.<uuid>.json` beside the captured root config; it extends only that config and routes `tsBuildInfoFile` under `.next/pr6-<uuid>/cache/`. Guarded `next.config.ts` accepts only byte-bound `PR6_NEXT_DIST_DIR=.next/pr6-<uuid>` and the exact generated tsconfig path when descriptor/mode/run ID agree, setting `distDir` and `typescript.tsconfigPath`; it rejects raw/default/absolute/traversal/symlink/request/dotenv/CLI selection. Standalone typecheck likewise passes an exact run-owned `--tsBuildInfoFile` and permits no root `*.tsbuildinfo`. Build receives only owned origin/internal markers; start receives the identical run ID/distDir.
- The capability-free build has exactly three writable classes, all precreated before restricted launch: the `PR6_NEXT_DIST_DIR` subtree, the one existing root `next-env.d.ts` file, and run-owned non-executable temp/cache paths. Source/module directories otherwise deny entry creation. Source-pin locked Next 16.3.0 `writeAppTypeDeclarations`: record approved input `next-env.d.ts`, allow only in-place truncate/write (no delete/rename) during build, then require exact generated bytes for the current distDir and seal it before any capability. Reject/route the current incremental TypeScript build-info write to the dist subtree through the generated tsconfig. After build and before Auth/DB/provider data, enumerate the entire materialization and require every changed/new entry to be exactly `next-env.d.ts`, the generated tsconfig, or the dist/temp allowlist; hash every generated Next file and every `.nft.json` traced dependency. Traced dependencies must stay under sealed source/module roots. Seal output and `next-env.d.ts` read-only, re-enumerate, then run origin/canary checks. Start reopens only sealed captured output. Probes attempt late source/package/DLL/resource creation, `next-env.d.ts` replacement, root `tsconfig.tsbuildinfo`, generated-chunk swaps, and external `pg`/`sharp`/AWS swaps; all fail or are caught before capability.
- Build/start never use `next dev`. They receive `__NEXT_PROCESSED_ENV=true` only after inner and outer dotenv-absence fingerprints agree. `pr6-native-process-boundary.ps1` supplies the creation-time containment primitive; `managed-process-guardian.ps1` owns cleanup and the run lease. On Windows, process creation is permitted only through `CreateProcessW` with an initialized `PROC_THREAD_ATTRIBUTE_JOB_LIST` that atomically places the suspended first thread in a non-breakaway `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` Job. If that primitive is unavailable or membership cannot be proved, fail before `CreateProcessW`; the former suspended-create-then-`AssignProcessToJobObject` fallback and `ProcessStartInfo` are forbidden. On POSIX, the native adapter opens the attested closure, records the parent PID, forks into a new session/process group, installs `PR_SET_PDEATHSIG` before `fexecve`, immediately rechecks that the parent PID is unchanged/alive, and exits before application code if not; unsupported kernels are `NOT PASSED` before process creation. Normal exit, child failure, signal, forced termination, parent death during creation, and lease expiry kill the complete Next/Playwright/browser tree, close held handles, wait for the port to close, and remove only the exact run-owned materialization/build. Barrier tests prove no immediate grandchild, instruction, port, lease, or artifact escapes.
- The credential-free `e2e` path owns that fresh loopback server, uses an unguessable internal runner attestation instead of `PLAYWRIGHT_BASE_URL`, and invokes the exact local Playwright CLI plus only the separately approved complete browser/FFmpeg distribution. `playwright.config.ts` has no ambient/default fallthrough: credential-free mode requires that attestation, sets `forbidOnly: true`, one worker, no reuse, the exact owned base URL and run-owned output directory, and a separately scrubbed browser `launchOptions.env`. Ambient browser caches, channels, executable discovery, downloads, and `PLAYWRIGHT_BROWSERS_PATH` are forbidden. The parent holds the complete browser executable/library/resource/locale/PAK/snapshot/FFmpeg closure immutable through every browser descendant's exit. A raw config/direct CLI launch or any unmanifested browser resource fails. Task 4 adds guarded mutation suites and M4C's separately approved read-only Preview mode without weakening this branch.
- A graph/source build contract inventories every App Router module that imports repository/provider configuration. Credential-free build may proceed only when credential-requiring work is explicitly request-time dynamic or has an existing no-credential build fallback; the current Membership page's `dynamic = "force-dynamic"` and public layout's caught optional announcement read are recorded baselines, not permission to broaden fallback behavior. A newly prerendered credential consumer fails source review and must be fixed in its owning task; credentials are never added to make build pass.
- The production-boundary test pins Next 16.3.0's loader and dev-watcher sources, proves the plan never selects `next dev`, runs the real build/start path against an isolated miniature Next fixture and the repository artifact, creates every production dotenv candidate after readiness, and proves repeated requests see the original environment. External-process tests declare their own budgets rather than inheriting Vitest's default: 180 seconds for a real build, 30 seconds readiness, 20 seconds requests, 10 seconds graceful shutdown, 5 seconds forced shutdown, and 300 seconds aggregate including orchestration and cleanup; Playwright subprocess probes use 120 seconds with 180 seconds aggregate. Hooks and cleanup have separate named budgets. Unit tests inject readiness, child, cleanup, creation-window, and outer-process timeouts and require bounded aggregate failure plus cleanup.

- The captured bootstrap contract launches no native process and has exact result schema `hkwtia.pr6.bootstrap-contract-result.v1`: one object `{schema, observedState: "UNSAFE_BASELINE" | "SAFE", assertions: readonly string[], evidenceSha256}`. `-ExpectedState UnsafeBaseline` returns `UNSAFE_BASELINE` with the exact nonempty ordered unsafe assertion names; `-ExpectedState Safe` returns `SAFE` with an empty assertion array. An internal read/parse/hash error is terminating and returns no object. Callers validate object count, exact schema/state/list/hash and never inspect `$LASTEXITCODE` or `$?` after a pure PowerShell block.

- [ ] **Step 1: Record an executable dependency-free RED without launching Node, a browser, or provider**

    Add `tests/contracts/pr6-unsafe-bootstrap.red.ps1`. Using PowerShell/.NET file reads only, it must fail on the current raw npm/npx/PATH routes, ambient Node preloads, ambient Git/GitHub configuration, missing record-kind discrimination, missing exact preamble/framed-control/approved-plan records, complete PowerShell/Node/npm/Git/GitHub-helper/browser/source closures and Node/native post-handshake capability handoff, mutable bootstrap/launcher/config execution, stale source records, dependency lifecycle execution, unowned Vitest/Playwright outputs, unsafe `node_modules`/Next-output containment, ambient browser discovery, `PLAYWRIGHT_BASE_URL`, `reuseExistingServer: !CI`, missing `forbidOnly`, inherited browser environment, development Next server, non-atomic Job assignment, late dependency bootstrap, and absent creation-window/parent-death cleanup. After this contract alone is added, operator/CI hashes every inspected current source into immutable outside-worktree `hkwtia.pr6.initial-red-baseline.v1` and issues the one-use initial attestation. Its approved preamble contains the hash-bound dependency-free capture helper; after handshake the launcher frames only `unsafeContractPath`/root/hash and `unsafeBaselineRecordPath`/hash. The contract resolves only that record's exact members, captures each once, verifies byte lengths/hashes/aggregate, and computes its assertion set from those bytes; it cannot enumerate or read another repository path. Run:

    $approvedUnsafeContract = New-Pr6ApprovedScriptBlock -Path $unsafeContractPath -AllowedRoot $unsafeContractRoot -Sha256 $unsafeContractSha256
    $unsafeResults = @(& $approvedUnsafeContract -ExpectedState UnsafeBaseline -BaselineRecordPath $unsafeBaselineRecordPath -BaselineRecordSha256 $unsafeBaselineRecordSha256)
    if ($unsafeResults.Count -ne 1) { throw "PR6_UNSAFE_CONTRACT_RESULT_COUNT_INVALID" }
    $unsafeResult = $unsafeResults[0]
    if ($unsafeResult.schema -cne "hkwtia.pr6.bootstrap-contract-result.v1" -or $unsafeResult.observedState -cne "UNSAFE_BASELINE" -or @($unsafeResult.assertions).Count -eq 0 -or [string]$unsafeResult.evidenceSha256 -cnotmatch "^[0-9a-f]{64}$") {
      throw "PR6_UNSAFE_CONTRACT_RESULT_INVALID"
    }
    Expected: the immutable contract returns exactly one validated `UNSAFE_BASELINE` result containing every named unsafe assertion. This is the recorded RED evidence; no native exit state is consulted, and no repository JavaScript, dependency, browser, Git network, provider, or database code executes.

- [ ] **Step 2: Implement the attested pre-entry invoker, exact child launchers, and immutable server**

    Implement the repository-owned interfaces above and protocol tests only. The operator/CI-owned launcher, approved-plan issuer, framing endpoint, and native credential broker remain separately supplied external prerequisites; do not create or modify them from this repository. Use an injectable synthetic launcher/broker peer for deterministic RED/GREEN tests, and record every real execution gate `NOT PASSED` if the separately approved external implementation is unavailable. Remove the raw `e2e`, `test:e2e`, and `test:lighthouse` package-script entry points and do not add a lifecycle-capable `rebuild` route. Update every active command owner—`README.md`, `AGENTS.md`, `CLAUDE.md`, the PR template, delivery-gate document, and its unit contract—to show the execution-record bootstrap plus verified launchers and to label old milestone/spec/acceptance command transcripts as historical evidence, not executable PR6 guidance. Do not rewrite historical evidence documents or the approved spec.

- [ ] **Step 3: Bind the shell and bootstrap worktree-local dependencies before any third-party test**

    After Step 2's edits, perform the full source refresh. The external approval for this shell must be `recordKind: "install-only"` and must contain no Git, installed-CLI, browser, provider, database, Preview, or publication field. At the start of this shell, read the five non-secret resolver-bootstrap fields and run exactly. This dependency-free PowerShell/.NET routine requires one exact-case, non-reparse path at every component beneath the approved root, reads the resolver once, hashes those captured bytes, decodes strict UTF-8, and executes the resulting verified script block—not the mutable path—so replacement after the read cannot change the code that runs:

    function New-Pr6ApprovedScriptBlock {
      param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $AllowedRoot,
        [Parameter(Mandatory = $true)][string] $Sha256
      )
      if ($Sha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_RESOLVER_HASH_INVALID" }
      $rootInfo = [System.IO.DirectoryInfo]::new([System.IO.Path]::GetFullPath($AllowedRoot))
      $rootInfo.Refresh()
      if (-not $rootInfo.Exists -or ($rootInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "PR6_RESOLVER_ROOT_INVALID"
      }
      $candidate = [System.IO.Path]::GetFullPath($Path)
      $relative = [System.IO.Path]::GetRelativePath($rootInfo.FullName, $candidate)
      if ([System.IO.Path]::IsPathRooted($relative) -or $relative -eq "." -or $relative.StartsWith(".." + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::Ordinal)) {
        throw "PR6_RESOLVER_OUTSIDE_ROOT"
      }
      $segments = $relative.Split(
        [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar),
        [System.StringSplitOptions]::RemoveEmptyEntries
      )
      $cursor = $rootInfo
      $entry = $null
      for ($segmentIndex = 0; $segmentIndex -lt $segments.Count; $segmentIndex += 1) {
        $segment = $segments[$segmentIndex]
        $matches = @()
        foreach ($child in $cursor.EnumerateFileSystemInfos()) {
          if ($child.Name -ceq $segment) { $matches += $child }
        }
        if ($matches.Count -ne 1) { throw "PR6_RESOLVER_CASE_OR_PATH_AMBIGUOUS" }
        $entry = $matches[0]
        $entry.Refresh()
        if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw "PR6_RESOLVER_REPARSE_POINT" }
        if ($segmentIndex -lt $segments.Count - 1) {
          if (-not ($entry.Attributes -band [System.IO.FileAttributes]::Directory)) { throw "PR6_RESOLVER_COMPONENT_NOT_DIRECTORY" }
          $cursor = [System.IO.DirectoryInfo]$entry
        }
      }
      if ($null -eq $entry -or ($entry.Attributes -band [System.IO.FileAttributes]::Directory)) { throw "PR6_RESOLVER_NOT_REGULAR_FILE" }
      $resolverBytes = [System.IO.File]::ReadAllBytes($entry.FullName)
      $actualSha256 = [System.Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($resolverBytes)).ToLowerInvariant()
      if ($actualSha256 -cne $Sha256) { throw "PR6_RESOLVER_HASH_MISMATCH" }
      $strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
      return [scriptblock]::Create($strictUtf8.GetString($resolverBytes))
    }

    $verifiedResolver = New-Pr6ApprovedScriptBlock -Path $executionResolverPath -AllowedRoot $executionResolverRoot -Sha256 $executionResolverSha256
    $verifiedRuntime = & $verifiedResolver -ExecutionRecordPath $executionRecordPath -ExecutionRecordSha256 $executionRecordSha256
    if ($verifiedRuntime.RecordKind -cne "install-only") { throw "PR6_INSTALL_RECORD_KIND_REQUIRED" }
    $installInvoker = $verifiedRuntime.InvokerScriptBlock
    $installNativeProcessBoundary = $verifiedRuntime.NativeProcessBoundaryScriptBlock
    $installGuardian = $verifiedRuntime.GuardianScriptBlock
    $installBootstrapContract = $verifiedRuntime.BootstrapContractScriptBlock
    $installDescriptorPath = $verifiedRuntime.DescriptorPath
    $installDescriptorSha256 = $verifiedRuntime.DescriptorSha256
    $verifiedNode = { & $installInvoker -NativeProcessBoundaryScriptBlock $installNativeProcessBoundary -GuardianScriptBlock $installGuardian -AttestationPath $installDescriptorPath -AttestationSha256 $installDescriptorSha256 -Tool Node -Arguments @($args) }.GetNewClosure()

    $safeResults = @(& $installBootstrapContract -ExpectedState Safe)
    if ($safeResults.Count -ne 1) { throw "PR6_BOOTSTRAP_CONTRACT_RESULT_COUNT_INVALID" }
    $safeResult = $safeResults[0]
    if ($safeResult.schema -cne "hkwtia.pr6.bootstrap-contract-result.v1" -or $safeResult.observedState -cne "SAFE" -or @($safeResult.assertions).Count -ne 0 -or [string]$safeResult.evidenceSha256 -cnotmatch "^[0-9a-f]{64}$") {
      throw "PR6_BOOTSTRAP_CONTRACT_NOT_GREEN"
    }

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs install

    Close the install-only shell. Use the dependency-free generator output to obtain a separately approved/hash-bound `recordKind: "runtime"` record containing the entire installed `node_modules` tree and exact source closure. Start a fresh capability-free shell, rerun the resolver bootstrap, require `RecordKind -ceq "runtime"`, and recreate `$runtimeInvoker`, `$runtimeNativeProcessBoundary`, `$runtimeGuardian`, `$runtimeBootstrapContract`, `$runtimeInputRecordResolver`, `$runtimeApprovedScriptResolver`, `$verifiedNode`, `$verifiedGit`, `$verifiedGitBlobSha256`, and `$verifiedGh`. Every closed invoker must pass `-NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary` and `-GuardianScriptBlock $runtimeGuardian`; publication paths remain null. Do not continue to Step 4 in the install shell.

    Expected: the immutable dependency-free PowerShell contract exits zero with every named unsafe assertion cleared. Only then does the install-only Node/npm closure install this worktree-local lockfile without a lifecycle/browser-download script. The fresh runtime record binds the complete PowerShell/Node/Git distributions, entire `node_modules` tree, browser distribution where applicable, and current repository source closure before Vitest. A missing dependency, ancestor fallback, reparse/junction, source/distribution drift, lifecycle attempt, wrong record kind, stale descriptor, or non-atomic creation containment is `NOT PASSED` before Vitest.

- [ ] **Step 4: Run the boundary probes under the verified pre-entry launcher**

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/verified-runtime-bootstrap.test.ts tests/unit/credential-free-verification-boundary.test.ts tests/unit/credential-free-build-boundary.test.ts tests/unit/managed-next-production-boundary.test.ts tests/unit/wisetech-delivery-gates.test.ts

    Expected: PASS. Reproduce the trusted no-profile/noninteractive PowerShell launch, exact preamble bytes, separate framed control endpoint/peer/sequence, replacement environment, pre-field handshake, fake-profile/console/clipboard denial, approved-plan binding, and schema-owned immutable operation-input/script records; exact initial-RED baseline-source closure and structured RED/GREEN contract results without native exit state; install/runtime schemas; captured bootstrap/native blocks; complete PowerShell/Node/npm/Git/GitHub-CLI/helper/whole-`node_modules`/browser closures; binary-safe Git-blob hashing plus the post-commit attested-OID hash handoff; synthetic child-only native Git/`gh` credential delivery and zeroing; `--no-bin-links` with direct regular CLI targets; restricted-token/read-only-mount directory immutability; source/materialization/output graphs; run-owned Vitest cache and Playwright `.last-run.json`; non-inheritable Node capability delivery/zeroing; guarded distDir/generated tsconfig; controlled `next-env.d.ts` and redirected build-info writes; generated/traced closure; full browser isolation; atomic containment; and cleanup. Wrong kind/stale record, ambient profile/secret, preamble/channel/approved-plan drift, fake host/PATH, `.bin` link, source/module Vitest cache, worktree Playwright output, credential/config leakage, late file/directory/DLL/PAK/locale/package creation, DACL/mount relaxation, unexpected source write, root build-info, next-env replacement, loader/config/child drift, or capability/process escape fails before acceptance.

- [ ] **Step 5: Commit the execution prerequisite**

    & $verifiedGit add -- ':(literal)package.json' ':(literal)next.config.ts' ':(literal)vitest.config.ts' ':(literal)playwright.config.ts' ':(literal)README.md' ':(literal)AGENTS.md' ':(literal)CLAUDE.md' ':(literal).github/pull_request_template.md' ':(literal)docs/integration/wisetech-delivery-gates.md' ':(literal)tests/unit/wisetech-delivery-gates.test.ts' ':(literal)scripts/generate-pr6-execution-candidate.ps1' ':(literal)scripts/resolve-verified-runtime.ps1' ':(literal)scripts/invoke-verified-tool.ps1' ':(literal)scripts/pr6-native-process-boundary.ps1' ':(literal)scripts/managed-process-guardian.ps1' ':(literal)scripts/managed-runtime-environment.mjs' ':(literal)scripts/managed-runtime-environment.d.mts' ':(literal)scripts/run-credential-free-verification.mjs' ':(literal)scripts/run-managed-playwright.mjs' ':(literal)scripts/run-managed-next.mjs' ':(literal)tests/contracts/pr6-unsafe-bootstrap.red.ps1' ':(literal)tests/fixtures/powershell-profile-probe.ps1' ':(literal)tests/fixtures/credential-free-process-env-probe.mjs' ':(literal)tests/fixtures/managed-next-env-probe.mjs' ':(literal)tests/fixtures/managed-process-creation-window-probe.mjs' ':(literal)tests/fixtures/materialization-late-file-probe.mjs' ':(literal)tests/unit/verified-runtime-bootstrap.test.ts' ':(literal)tests/unit/credential-free-verification-boundary.test.ts' ':(literal)tests/unit/credential-free-build-boundary.test.ts' ':(literal)tests/unit/managed-next-production-boundary.test.ts'
    & $verifiedGit diff --cached --check
    & $verifiedGit commit -m "test: establish PR6 execution boundary"

### Task 1: Establish the authoritative billing-interval catalog and exact public actions

**Files:**

- Create: `lib/membership/catalog.ts`, `tests/unit/membership-catalog.test.ts`.
- Modify: `lib/membership/constants.ts`, `lib/membership/public-catalog.ts`, `app/[locale]/(public)/membership/page.tsx`, `components/marketing/tier-comparison.tsx`, `config/navigation.ts`.
- Modify tests: `tests/unit/membership-public-catalog.test.ts`, `tests/unit/membership-page-catalog.test.tsx`, `tests/unit/membership-links.test.tsx`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`, `tests/e2e/public-shell.spec.ts`.

**Interfaces:**

- Consumes: `membershipPlansRepository.list()`, `PLAN_CATALOG`, `STRIPE_STARTUP_PRICE_ID`, and `STRIPE_CORPORATE_PRICE_ID`.
- Produces:

    export const BILLING_INTERVALS = ["annual", "monthly", "none"] as const;
    export type BillingInterval = (typeof BILLING_INTERVALS)[number];
    export type MembershipSelection = Readonly<{
      plan: PlanCode;
      billingInterval: BillingInterval;
    }>;
    export type ResolvedMembershipOption = Readonly<{
      planCode: PlanCode;
      billingInterval: BillingInterval;
      billingBehavior: "free" | "checkout" | "review";
      seatAllowance: number;
      amountHkd: number | null;
      stripePriceReference: string | null;
    }>;
    export type MembershipPriceIds = Readonly<{
      startup: string;
      corporate: string;
    }>;
    export type MembershipCatalogDependencies = Readonly<{
      plans: Readonly<{
        list(): Promise<readonly PersistedMembershipPlan[]>;
      }>;
      loadPriceIds(): MembershipPriceIds;
    }>;
    export function configuredMembershipPriceIds(
      environment?: NodeJS.ProcessEnv,
    ): MembershipPriceIds;
    export function reconcileMembershipOptions(input: Readonly<{
      rows: readonly PersistedMembershipPlan[];
      priceIds: MembershipPriceIds;
    }>): readonly ResolvedMembershipOption[];
    export async function resolveMembershipOption(
      selection: MembershipSelection,
      dependencies?: MembershipCatalogDependencies,
    ): Promise<ResolvedMembershipOption | null>;

- Invariant: `ResolvedMembershipOption` remains server-only. Public catalog DTOs never contain `stripePriceReference` or environment values.

- [ ] **Step 1: Write the failing domain, formatter, and public-action tests**

    In `tests/unit/membership-catalog.test.ts`, create exact fixtures for the four canonical rows and assert:

    import {describe, expect, it} from "vitest";
    import {
      reconcileMembershipOptions,
      resolveMembershipOption,
    } from "@/lib/membership/catalog";

    it("resolves only none, annual, annual, none in canonical order", () => {
      const options = reconcileMembershipOptions({rows: canonicalRows, priceIds});
      expect(options.map(({planCode, billingInterval}) => [planCode, billingInterval])).toEqual([
        ["community", "none"],
        ["startup", "annual"],
        ["corporate", "annual"],
        ["patron", "none"],
      ]);
      expect(options.some(({billingInterval}) => billingInterval === "monthly")).toBe(false);
    });

    it("rejects monthly even when a monthly amount exists without a distinct mapping", async () => {
      await expect(resolveMembershipOption(
        {plan: "startup", billingInterval: "monthly"},
        catalogDependencies(canonicalRows, priceIds),
      )).resolves.toBeNull();
    });

    it("fails closed for duplicate, inactive, malformed, or mismatched rows", () => {
      expect(reconcileMembershipOptions({
        rows: [canonicalRows[0], canonicalRows[1], canonicalRows[1]],
        priceIds,
      }).map(({planCode}) => planCode)).toEqual(["community"]);
    });

    Update the public-catalog tests to require:

    expect(catalog(canonicalRows)).toMatchObject([
      {code: "community", cta: {href: "/join?plan=community&interval=none"}},
      {code: "startup", price: {kind: "paid", options: [{cadence: "annual"}]},
        cta: {href: "/join?plan=startup&interval=annual"}},
      {code: "corporate", cta: {href: "/join?plan=corporate&interval=annual"}},
      {code: "patron", cta: {href: "/contact", kind: "contact"}},
    ]);
    expect(JSON.stringify(catalog(canonicalRows))).not.toContain("price_startup");
    expect(JSON.stringify(catalog(canonicalRows))).not.toContain("stripePriceReference");

    Inject `{plans, loadPriceIds}` into `resolveMembershipOption` tests. Require `plans.list()` and `loadPriceIds()` exactly once, prove the supplied IDs—not ambient `process.env`—drive reconciliation, and prove a rejected repository promise propagates rather than becoming `null`. Add direct `configuredMembershipPriceIds(environment)` cases for trimming only `STRIPE_STARTUP_PRICE_ID` and `STRIPE_CORPORATE_PRICE_ID`.

    Update navigation expectations so `publicShellActions.join.href` is `/membership` while `memberPortalAction` remains `/portal` until Task 3.

    Update `membership-links.test.tsx` at the same RED boundary: its `MembershipTier[]` fixtures expose Community `none`, Startup/Corporate `annual`, no paid monthly option, and exact `/join?plan=community&interval=none`, `/join?plan=startup&interval=annual`, and `/join?plan=corporate&interval=annual` hrefs. Update `public-shell.spec.ts` so the Chinese generic Join action renders `/zh/membership`, clicking it finishes on `/zh/membership`, and the plan-specific membership cards still own the interval-bearing `/zh/join?...` entry points.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx

    Expected: FAIL because the billing-interval domain and shared resolver do not exist, paid monthly is still advertised in both catalog and direct TierComparison fixtures, catalog hrefs omit `interval`, and the generic Join shell/browser action still targets bare `/join`.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/public-shell.spec.ts

    Expected: FAIL because the newly written Chinese browser contract expects the generic action at `/zh/membership`, while the current shell still renders/navigates to `/zh/join`. Record that exact assertion as browser RED before changing navigation.

- [ ] **Step 3: Implement the server-only resolver and display-safe formatter**

    Add the billing interval constants to `lib/membership/constants.ts` and implement `lib/membership/catalog.ts` with `import "server-only"`. The reconciliation order is `PLAN_CODES`. Each plan must have exactly one persisted row whose audience, billing behavior, seat allowance, active flag, and integer price fields match the canonical contract.

    Apply these exact option rules:

    - Community: `billingInterval: "none"`, `amountHkd: 0`, `stripePriceReference: null`, and both persisted price fields null or zero.
    - Patron: `billingInterval: "none"`, `amountHkd: null`, `stripePriceReference: null`, and no Join CTA from the public card.
    - Startup/Corporate: `billingInterval: "annual"` only; annual amount is a positive Postgres integer; configured ID is non-empty after trimming; a persisted reference is either null or exactly the configured ID; optional monthly amount is structurally valid but is not emitted.
    - Any unknown, duplicate, inactive, malformed, or mismatched row is unavailable. Never infer a monthly mapping from the annual ID.

    Define the default `MembershipCatalogDependencies` exactly as `{plans: membershipPlansRepository, loadPriceIds: () => configuredMembershipPriceIds(process.env)}`. The async resolver calls `plans.list()` and `loadPriceIds()` once each, passes both results to `reconcileMembershipOptions`, and reads no other environment field. Return `null` on an unavailable selection; do not catch repository or price-loader errors into a valid option.

    Make `buildPublicMembershipCatalog` accept reconciled options rather than independently reconciling rows. Format amounts by locale and omit `stripePriceReference`. Set exact CTAs:

    const joinHref = {
      community: "/join?plan=community&interval=none",
      startup: "/join?plan=startup&interval=annual",
      corporate: "/join?plan=corporate&interval=annual",
    } as const;

    Keep Patron at `/contact`. Render only the emitted annual paid option in `TierComparison`. Change `publicShellActions.join.href` to `/membership`.

- [ ] **Step 4: Run GREEN, perform the secret-serialization check, and refactor**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-page-catalog.test.tsx tests/unit/membership-links.test.tsx tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx

    Expected: PASS. Public markup and the direct TierComparison contract contain exact plan/interval hrefs, no monthly label for paid tiers, and no configured Stripe identifier.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/public-shell.spec.ts

    Expected: PASS with the generic Chinese Join action rendering and navigating to `/zh/membership`; plan-specific cards remain the only interval-bearing Join entry points.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs audit-strings -- membership-client-secrets

    Expected: no new client or rendered-page secret/reference access. Server page imports only the server-only catalog loader/formatter.

- [ ] **Step 5: Commit the catalog slice**

    & $verifiedGit add -- ':(literal)lib/membership/constants.ts' ':(literal)lib/membership/catalog.ts' ':(literal)lib/membership/public-catalog.ts' ':(literal)app/[locale]/(public)/membership/page.tsx' ':(literal)components/marketing/tier-comparison.tsx' ':(literal)config/navigation.ts' ':(literal)tests/unit/membership-catalog.test.ts' ':(literal)tests/unit/membership-public-catalog.test.ts' ':(literal)tests/unit/membership-page-catalog.test.tsx' ':(literal)tests/unit/membership-links.test.tsx' ':(literal)tests/unit/navigation.test.ts' ':(literal)tests/unit/mobile-navigation.test.tsx' ':(literal)tests/e2e/public-shell.spec.ts'
    & $verifiedGit commit -m "feat: reconcile membership billing options"

### Task 2: Carry typed Join context into one atomic durable terminal outcome

**Files:**

- Modify: `lib/membership/join-schema.ts`, `lib/membership/join-navigation.ts`, `lib/membership/onboarding.ts`, `lib/membership/join-service.ts`, `lib/membership/lifecycle.ts`, `lib/automation/enrollment.ts`, `lib/db/repos/applications.ts`, `lib/db/repos/memberships.ts`.
- Create: `lib/membership/join-terminal-state.ts`, `lib/db/repos/join-terminal.ts`.
- Modify: `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`.
- Create tests: `tests/unit/join-terminal-state.test.ts`, `tests/unit/join-terminal-transaction.test.ts`.
- Modify tests: `tests/unit/join-schema.test.ts`, `tests/unit/join-navigation.test.ts`, `tests/unit/join-service.test.ts`, `tests/unit/join-service-review.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/join-actions-profile-identity.test.ts`, `tests/unit/join-page.test.tsx`, `tests/unit/profile-identity-billing.test.ts`, `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/portal-content-scope.test.ts`, `tests/unit/repository-production-security.test.ts`, `tests/e2e/join-auth.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: `resolveMembershipOption(selection)` from Task 1 and existing actor-scoped applications, profiles, companies, memberships, company-member authorization, and journey enrollment.
- Produces:

    export type JoinEntry = "join" | "member-login";
    export type JoinDraftContext = Readonly<{
      plan: PlanCode;
      billingInterval: BillingInterval;
      applicationId: string;
    }>;
    export type JoinOutcome =
      | (JoinDraftContext & {next: "profile" | "company"})
      | Readonly<{
          next: "checkout" | "review" | "complete";
          applicationId: string;
          membershipId: string;
        }>;
    export type JoinSubmissionReadDependencies = Readonly<{
      applications: Readonly<{
        getById(actor: Actor, applicationId: string): Promise<JoinApplication | null>;
      }>;
      memberships: Readonly<{
        getByApplicationId(
          actor: Actor,
          applicationId: string,
        ): Promise<JoinMembership | null>;
      }>;
      resolveOption(
        selection: MembershipSelection,
      ): Promise<ResolvedMembershipOption | null>;
    }>;
    export type PreparedJoinSubmission =
      | Readonly<{
          kind: "terminal";
          applicationId: string;
          membershipId: string;
        }>
      | Readonly<{
          kind: "draft";
          applicationId: string | null;
          option: ResolvedMembershipOption;
        }>;
    export type JoinTerminalDescriptor = Readonly<{
      applicationId: string;
      membershipId: string;
    }>;
    export type JoinTerminalProjection = Readonly<{
      outcome: Extract<JoinOutcome, {next: "checkout" | "review" | "complete"}>;
      application: Readonly<{
        currentStep: "checkout" | "review" | "complete";
        status: "pending_payment" | "pending_review" | "completed";
      }>;
      requiresActivationJourney: boolean;
    }>;
    export type JoinTerminalRepository = Readonly<{
      complete(
        actor: Extract<Actor, {kind: "member"}>,
        descriptor: JoinTerminalDescriptor,
      ): Promise<JoinTerminalProjection["outcome"]>;
    }>;
    export type JoinTerminalDependencies = Readonly<{
      terminal: JoinTerminalRepository;
    }>;
    export function projectJoinTerminalState(
      membershipStatus: MembershipStatus,
      ids: JoinTerminalDescriptor,
    ): JoinTerminalProjection;
    export async function prepareJoinSubmission(
      actor: Extract<Actor, {kind: "member"}>,
      rawInput: unknown,
      dependencies?: JoinSubmissionReadDependencies,
    ): Promise<PreparedJoinSubmission>;
    export async function completePreparedTerminal(
      actor: Extract<Actor, {kind: "member"}>,
      descriptor: JoinTerminalDescriptor,
      dependencies?: JoinTerminalDependencies,
    ): Promise<Extract<JoinOutcome, {next: "checkout" | "review" | "complete"}>>;

    export const PORTAL_CONTINUATIONS = [
      "/portal",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/company/seats",
      "/portal/directory",
      "/portal/events",
      "/portal/documents",
      "/portal/billing",
    ] as const;
    export type PortalContinuation = (typeof PORTAL_CONTINUATIONS)[number];
    export function parsePortalContinuation(
      value: unknown,
      locale?: AppLocale,
    ): PortalContinuation | null;
    export function destinationForJoin(locale: AppLocale, outcome: JoinOutcome): string;

- `MembershipRecord` and `JoinMembership` gain required `billingInterval: BillingInterval`.
- `PreparedJoinSubmission.kind === "terminal"` deliberately carries only immutable row identities. It never carries a previously read membership status, outcome, application projection, timestamp, version, or journey decision. `completePreparedTerminal` must obtain all of those from rows locked inside its transaction.

- [ ] **Step 1: Write failing schema, state-machine, transaction, service, action, and route-handoff tests**

    Add these focused schema and outcome cases:

    expect(joinInputSchema.parse({
      plan: "startup",
      billingInterval: "annual",
      applicationId: null,
    })).toEqual({
      plan: "startup",
      billingInterval: "annual",
      applicationId: null,
    });
    expect(joinInputSchema.safeParse({
      plan: "startup",
      billingInterval: ["annual", "monthly"],
    }).success).toBe(false);

    const first = await completeApplication(member, {
      plan: "startup",
      billingInterval: "annual",
      profile,
      company,
    }, dependencies);
    expect(first).toMatchObject({
      next: "checkout",
      applicationId: expect.any(String),
      membershipId: expect.any(String),
    });
    expect(dependencies.inspect().memberships.values().next().value)
      .toMatchObject({planCode: "startup", billingInterval: "annual"});

    expect(destinationForJoin("zh-HK", {
      next: "company",
      plan: "startup",
      billingInterval: "annual",
      applicationId: "application-a",
    })).toBe("/zh/join/company?plan=startup&interval=annual&application=application-a");
    expect(destinationForJoin("en", {
      next: "checkout",
      applicationId: "application-a",
      membershipId: "membership-a",
    })).toBe("/join/checkout?membership_id=membership-a");

    In `join-terminal-state.test.ts`, drive the real membership-status union through an exhaustive table. Require exactly:

    - `pending_payment` maps to outcome `checkout` plus application `{currentStep: "checkout", status: "pending_payment"}` and no activation journey;
    - `pending_review` maps to outcome `review` plus application `{currentStep: "review", status: "pending_review"}` and no activation journey;
    - `active` maps to outcome `complete` plus application `{currentStep: "complete", status: "completed"}` and requires the exact `onboarding_90d` activation journey;
    - `past_due`, `cancel_at_period_end`, `cancelled`, and `expired` each throw `MEMBERSHIP_NOT_JOIN_RESUMABLE` before application, journey, catalog, or provider work.

    Require a `never` exhaustiveness assertion in the switch so a future status cannot silently fall into checkout. Test every allowed and rejected application predecessor pair against an explicit matrix: target `pending_payment/checkout` accepts only that exact pair or `draft` at `profile`, `company`, or `checkout`; target `pending_review/review` accepts only that exact pair or `draft` at `profile`, `company`, or `review`; target `completed/complete` accepts only that exact pair, `draft` at `profile`, `company`, or `complete`, `pending_payment/checkout`, or `pending_review/review`. `abandoned` and every other step/status combination are rejected with `JOIN_APPLICATION_STATE_CONFLICT`.

    In `join-terminal-transaction.test.ts`, exercise the real transaction executor and SQL ordering. It must:

    - lock the exact application and membership together with `FOR UPDATE OF membership_applications, memberships` before deriving status or writing;
    - require `membership.applicationId === application.id` and exact plan equality;
    - for a personal target, require `application.applicantUserId === actor.profileId`, null application/company membership targets, and `membership.ownerUserId === actor.profileId`;
    - for a company target, preserve the intersection of the existing application and membership repository authorities: require `membership.ownerUserId === null` and `membership.companyId === application.companyId`, then select and row-lock the current actor's exact active company-member row for that company before writes; do not additionally require `application.applicantUserId === actor.profileId`, and use the locked applicant—not a possibly different acting profile—as the activation-journey profile;
    - prove an active non-applicant company member may resume, while an applicant whose company membership is absent/revoked, an inactive/foreign non-applicant company member, and a non-applicant personal actor all fail before writes;
    - reject missing, foreign, mismatched, abandoned, or incompatible rows before writes;
    - derive the projection from the locked membership status, update only the exact application projection, and for `active` insert every exact `onboarding_90d` step with `instanceKey = "activation:" + membershipId` using `ON CONFLICT DO NOTHING`;
    - verify the complete expected activation-step key set before commit, then return the freshly derived outcome only after commit;
    - make an exact already-projected application plus complete activation-step set idempotent.

    Add scripted races where the status changes after preparation: `pending_payment -> active` must return the fresh complete outcome and atomically complete the application/journey, while `active -> past_due` must fail without mutation. Add application target, plan, abandoned-status, step/status, membership-link, owner, company, and company-member authorization drift cases. Inject application-update, journey-insert, and journey-verification failures and prove the whole terminal transaction rolls back. Prove PostgreSQL microsecond `updated_at` values are irrelevant: no JavaScript `Date` compare-and-swap or stale preflight field participates in correctness.

    Add resume/service tests proving:

    - a membership-bearing application prepares only `{kind: "terminal", applicationId, membershipId}`, and a terminal application with no actor-scoped membership throws `MEMBERSHIP_NOT_FOUND`;
    - a stored annual membership remains annual when query plan/interval is missing or conflicts with the durable row;
    - failures after membership creation or inside terminal completion leave one durable, recoverable membership; retry re-locks fresh rows, performs the atomic application/journey transaction, and returns the durable destination without catalog, profile, company, or provider work;
    - missing, monthly, unknown, multi-valued, or unavailable plan/interval on a new or nonterminal draft performs no profile, company, application, membership, journey, limiter, or provider mutation;
    - Community persists `none` and routes to complete; Patron persists `none` and routes to review.

    In `join-actions.test.ts` and `join-actions-profile-identity.test.ts`, invoke the real bound `saveProfile` and `saveCompany` actions. For each action, require terminal preparation to call `completePreparedTerminal` and receive its committed result before redirect, with zero profile/company/application-creation/membership-creation/catalog/limiter/provider writes outside that transaction. Exercise `checkout`, `review`, `complete`, and all four unsupported membership statuses. A terminal application without its actor-scoped membership fails before mutation. For draft paths, inject `resolveOption` returning `null` and rejecting, and assert zero calls after the resolver to profile upsert, company upsert, application create/update, membership create/update, journey enrollment, limiter, or provider seams.

    At the same action boundary, call `requestMagicLink` with syntactically valid `{plan: "startup", billingInterval: "annual"}` while an injected `resolveMembershipOption` fake returns `null` and while it rejects. Both cases return the same localized unavailable response and call neither `checkAuthSend`, `auth.signIn.magicLink`, nor any non-catalog repository/provider seam after the fake. A separate real-resolver action test permits exactly one read-only `plans.list()` catalog call, then requires zero limiter, auth-provider, profile/company/application/membership/journey mutation, or other repository calls on `null` or rejection. A valid resolved option calls the resolver once and builds the callback from `option.planCode`/`option.billingInterval`, not the raw selection. The `entry: "member-login"` plus null-selection branch never calls the catalog and continues to use only the validated Portal continuation. Assert no `ResolvedMembershipOption` or `stripePriceReference` is serialized into form state, bound arguments, markup, or callback URLs.

    Move `join-auth.spec.ts` into this task's ownership. Change valid Startup URLs at its current entry/resume/sign-in cases to `/join?plan=startup&interval=annual`; use `interval=none` for Community; add missing, `monthly`, unknown, and multi-valued interval cases that show localized fail-closed recovery and emit no observable application mutation request. Browser interception is client-traffic evidence only; the direct Server Action fakes above are the authority for zero Neon/provider/repository/database calls.

    Change the Server Action expectation after `saveCompany` from the dead status-card `/join` loop to:

    expect(redirectState.url)
      .toBe("/join/checkout?membership_id=membership-a");

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-terminal-state.test.ts tests/unit/join-terminal-transaction.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: FAIL because Join input has no interval, membership creation relies on the database default, terminal resume has no membership ID, no shared exhaustive terminal state mapper or cross-row transaction exists, actions do not call committed terminal completion, and actions can write profile/company or send/count a magic link before discovering an unavailable option.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/join-auth.spec.ts

    Expected: FAIL because the newly written valid journeys require explicit `annual`/`none` context and the new missing, monthly, unknown, and multi-valued interval cases expect fail-closed recovery, while the current browser flow still accepts plan-only/invalid interval input. Record the exact URL/assertion failures as browser RED.

- [ ] **Step 3: Implement fresh locked-state completion and final Join ordering**

    Add `billingIntervalSchema = z.enum(BILLING_INTERVALS)`. Validate scalar query values without making plan/interval authoritative over a durable row: parse the optional scalar application ID independently, and defer plan/interval validation until the flow is known to have no membership. Implement `prepareJoinSubmission` with exact defaults `{applications: applicationsRepository, memberships: membershipsRepository, resolveOption: resolveMembershipOption}`. When an application ID is present, require a member and load the actor-scoped application plus membership first. Any actor-scoped membership, including one paired with a still-draft application after a prior partial failure, must match `application.planCode` and determines plan, interval, ID, and the fact that completion is required even when query plan/interval is absent, invalid, multi-valued, or conflicting. Preparation returns only the two row IDs for this terminal path; it does not derive or cache the status/outcome/projection. A terminal application without that membership throws `MEMBERSHIP_NOT_FOUND`. Only a new/nonterminal draft with no membership parses scalar plan/interval and calls `resolveOption` exactly once. The prepared option and terminal descriptor are server-only and are never accepted from form data or a Client Component.

    Split the mutation phase into internal `continuePreparedJoin(actor, preparedDraft, dependencies)`, `completePreparedApplication(actor, preparedDraft, input, dependencies)`, and `completePreparedTerminal(actor, descriptor, dependencies)` seams. `startJoin` keeps its anonymous no-write draft-ID result. For a member, it calls `prepareJoinSubmission` and then must await `completePreparedTerminal` whenever preparation is terminal; only a draft may call `continuePreparedJoin`. None of the prepared seams re-reads environment or re-resolves the option. This makes the exact order:

    1. Parse only the optional scalar application ID; reject a multi-valued/invalid application ID independently of plan/interval.
    2. If resuming, require a member and load the actor-scoped application plus `memberships.getByApplicationId(actor, application.id)` before interpreting query plan/interval.
    3. If a membership exists, validate only its immutable relation and plan at preflight, return `{kind: "terminal", applicationId, membershipId}`, and defer status, destination, application compatibility, authorization revalidation, and journey decisions to the transaction.
    4. If the application claims a terminal status but its actor-scoped membership is absent, throw `MEMBERSHIP_NOT_FOUND`.
    5. Only for a new/nonterminal draft with no membership, parse scalar plan/interval, verify any application plan against that selection, and call `resolveOption` exactly once to produce `PreparedJoinSubmission.kind === "draft"`; no mutation has occurred.
    6. Only that server-produced prepared draft may reach ordinary profile, company, application, or membership writes.

    Implement `projectJoinTerminalState` as the single exhaustive policy above. There is no default success branch. Every unsupported status throws `MEMBERSHIP_NOT_JOIN_RESUMABLE`, and a compile-time `never` assertion makes the status table total.

    Implement `completePreparedTerminal` with exact default `{terminal: joinTerminalRepository}` and make it return only `await dependencies.terminal.complete(actor, descriptor)`. Implement `joinTerminalRepository.complete(actor, descriptor)` as one database transaction. Its first statement locks the exact joined application and membership rows together. Under those locks it revalidates actor, relation, plan, and personal/company target. Personal completion requires the locked applicant/owner to equal the actor. Company completion preserves the stricter membership-mutation authority while avoiding an applicant-only narrowing: every actor must obtain a blocking row lock on that actor's exact active company-member authorization before any write, but the actor need not equal the application applicant. It retains the locked application applicant as the journey profile even when that applicant differs from the actor. It then re-reads the membership status; calls `projectJoinTerminalState`; and validates the exact predecessor matrix before any write. It then updates the application to the mapper's exact step/status. For `active`, reuse a new exported pure `buildActivationJourneyEnrollment({profileId, membershipId, anchor})` from `lib/automation/enrollment.ts`; the existing `enrollActivatedMembership` delegates to that builder, while the transaction inserts the resulting rows on its own executor with `ON CONFLICT DO NOTHING` and verifies every expected journey/instance/step/delivery key before commit. Use the locked membership's database timestamp only as a stable scheduling anchor, never as a concurrency token. Return the mapper's freshly derived outcome after the transaction commits.

    Do not add a schema column or migration and do not use `updatedAt`/JavaScript `Date` compare-and-swap. The locked application/membership rows, plus the required company-member lock for every company target, are the freshness authority. Exact already-projected state and exact already-enrolled activation keys are idempotent; an incomplete activation set is repaired inside the same transaction. Any invalid row or failed update/insert/verification rolls back every application/journey write. A membership created by an earlier committed repository call may remain after a terminal transaction failure; the identity-only descriptor makes the next request safely recover it.

    `completePreparedApplication` checks again for an existing actor-scoped membership before creating one. A membership found in this second check calls the same `completePreparedTerminal` transaction. Otherwise the seam consumes the already prepared option rather than accepting query interval as authority. For a new membership, create with:

    {
      applicationId: application.id,
      ownerUserId: companyId ? null : actor.profileId,
      companyId,
      planCode: option.planCode,
      billingInterval: option.billingInterval,
      status: option.billingBehavior === "free"
        ? "active"
        : option.billingBehavior === "review"
          ? "pending_review"
          : "pending_payment",
      seatLimit: option.seatAllowance,
    }

    After membership creation, call `completePreparedTerminal(actor, {applicationId: application.id, membershipId: membership.id})` unconditionally; do not directly update the application or call `enrollActivatedMembership` outside the transaction. Add `billingInterval` to `MembershipInput` and the lifecycle projection. Do not modify `lib/db/schema-core.ts` or add a migration; the column and enums already exist.

    Replace status-only `destinationForJoin` results with one href for every outcome. Profile/company hrefs carry plan, interval, and application. Checkout/review/complete hrefs carry only the opaque membership ID.

    Change `requestMagicLink` to its final bound signature:

    export async function requestMagicLink(
      locale: AppLocale,
      entry: JoinEntry,
      selection: MembershipSelection | null,
      continuation: PortalContinuation | null,
      state: JoinFormState,
      formData: FormData,
    ): Promise<JoinFormState>

    For `entry: "join"`, keep `MembershipSelection` as the client-safe bound input but call server-only `resolveMembershipOption(selection)` inside the action after syntactic/email validation and before `checkAuthSend` or `auth.signIn.magicLink`. The real resolver may make exactly its documented read-only `plans.list()` catalog call. On `null` or rejection, return the same localized unavailable response with zero limiter, auth-provider, Join mutation, or any other repository/provider call after that catalog read. Direct-action tests with an injected resolver assert no additional seam at all after the injected `null`/rejection. On success, build the callback only from the returned `option.planCode` and `option.billingInterval`; never bind or serialize `ResolvedMembershipOption`. Task 3 consumes the `entry: "member-login"` branch with a required null selection; that branch validates only `PortalContinuation` and does not touch the catalog.

    Make `saveProfile` and `saveCompany` bind the interval, validate form shape, require the member actor, and call `prepareJoinSubmission` before their existing profile/company write. A terminal preparation must await `completePreparedTerminal` and redirect from its committed fresh result; it may not redirect directly from preparation. Only a draft preparation may write the profile/company and then call the matching prepared mutation seam; both seams consume that exact server-resolved option. Redirect directly through `destinationForJoin(locale, result)`. Update profile/company anonymous recovery URLs to preserve plan and interval. Remove the terminal status-card branch from `JoinPage`; authenticated terminal outcomes complete transactionally before checkout/review/complete redirect.

- [ ] **Step 4: Run GREEN and verify no default-interval or split-state dependence remains**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-service-review.test.ts tests/unit/join-terminal-state.test.ts tests/unit/join-terminal-transaction.test.ts tests/unit/join-actions.test.ts tests/unit/join-actions-profile-identity.test.ts tests/unit/join-page.test.tsx tests/unit/profile-identity-billing.test.ts

    Expected: PASS with exact profile/company/checkout/review/complete destinations, explicit membership intervals, durable membership precedence over missing/conflicting query plan and interval, exhaustive status handling, fresh row-locked completion, atomic application/journey recovery, and every real terminal caller awaiting the transaction before redirect or profile/company mutation. Unavailable/rejected real catalog resolution performs exactly its one allowed `plans.list()` read and then zero profile/company/application/membership/journey/limiter/provider or other repository calls; injected-resolver tests permit no additional seam after the fake. Add `billingInterval: "annual"` or `"none"` to every typed `MembershipRecord` and `MembershipInput` fixture touched by the required property; do not weaken the property to optional.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/join-auth.spec.ts

    Expected: browser behavior PASS with annual/none on every valid Join journey, explicit missing/invalid/multi-valued interval recovery, and no observable application mutation request. The Step 1 direct-action fakes—not Playwright interception—prove zero server-side magic-link/provider/database mutation.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/portal-content-scope.test.ts tests/unit/repository-production-security.test.ts

    Expected: PASS with every required membership fixture explicit and repository authorization unchanged.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs typecheck
    Expected: PASS with the required durable interval and the exhaustive seven-status mapper across Join, repository-security, checkout, recovery, and Portal-content fixtures.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs audit-strings -- membership-create-intervals

    Expected: every production membership-creation path in scope either supplies `billingInterval` explicitly or is an existing seed/system path with an explicit value. No Join path relies on `default("annual")`.

- [ ] **Step 5: Commit the typed atomic Join slice**

    & $verifiedGit add -- ':(literal)lib/membership/join-schema.ts' ':(literal)lib/membership/join-navigation.ts' ':(literal)lib/membership/onboarding.ts' ':(literal)lib/membership/join-service.ts' ':(literal)lib/membership/join-terminal-state.ts' ':(literal)lib/membership/lifecycle.ts' ':(literal)lib/automation/enrollment.ts' ':(literal)lib/db/repos/applications.ts' ':(literal)lib/db/repos/memberships.ts' ':(literal)lib/db/repos/join-terminal.ts' ':(literal)app/[locale]/(join)/join/actions.ts' ':(literal)app/[locale]/(join)/join/page.tsx' ':(literal)app/[locale]/(join)/join/profile/page.tsx' ':(literal)app/[locale]/(join)/join/company/page.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/join-schema.test.ts' ':(literal)tests/unit/join-navigation.test.ts' ':(literal)tests/unit/join-service.test.ts' ':(literal)tests/unit/join-service-review.test.ts' ':(literal)tests/unit/join-terminal-state.test.ts' ':(literal)tests/unit/join-terminal-transaction.test.ts' ':(literal)tests/unit/join-actions.test.ts' ':(literal)tests/unit/join-actions-profile-identity.test.ts' ':(literal)tests/unit/join-page.test.tsx' ':(literal)tests/unit/profile-identity-billing.test.ts' ':(literal)tests/unit/checkout-service.test.ts' ':(literal)tests/unit/checkout-recovery-service.test.ts' ':(literal)tests/unit/portal-content-scope.test.ts' ':(literal)tests/unit/repository-production-security.test.ts' ':(literal)tests/e2e/join-auth.spec.ts'
    & $verifiedGit commit -m "feat: route atomic durable join outcomes"

### Task 3: Add explicit member login, one safe continuation authority, and Portal sign-out

**Files:**

- Create: `app/[locale]/(join)/member-login/page.tsx`, `components/portal/portal-sign-out-button.tsx`.
- Create tests: `tests/unit/member-login-page.test.tsx`, `tests/unit/portal-sign-out-button.test.tsx`, `tests/unit/portal-layout-auth.test.tsx`, `tests/unit/credential-free-auth-null-session.test.ts`.
- Modify: `lib/membership/join-navigation.ts`, `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(member)/portal/layout.tsx`, `components/portal/portal-nav.tsx`, `lib/portal/queries.ts`, `lib/auth/server.ts`, `lib/config/env.ts`, `config/navigation.ts`, `config/wisetech-integration-manifest.ts`, `messages/en.json`, `messages/zh-HK.json`.
- Modify tests: `tests/unit/join-navigation.test.ts`, `tests/unit/join-actions.test.ts`, `tests/unit/portal-authorization.test.ts`, `tests/unit/navigation.test.ts`, `tests/unit/mobile-navigation.test.tsx`, `tests/unit/page-indexability.test.ts`, `tests/unit/wisetech-route-parity.test.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`.

**Interfaces:**

- Consumes: Task 2 `PortalContinuation`, `parsePortalContinuation`, final `requestMagicLink`, `getActor()`, `requirePortalMember()`, and existing `authClient.signOut()`.
- Produces:

    export function buildPortalSignInPath(
      locale: AppLocale,
      continuation?: PortalContinuation,
    ): string;
    export type PortalSignOutButtonProps = Readonly<{
      destination: string;
      label: string;
      pendingLabel: string;
      errorLabel: string;
    }>;

- [ ] **Step 1: Write failing continuation, login-page, actor-boundary, and sign-out tests**

    Expand the continuation matrix to accept exactly the nine stable locale-neutral paths. For every rejected case below, call `parsePortalContinuation(value, locale)` with the shown locale and assert `null`:

    const rejected = [
      {locale: "en", value: "/portal/showcase"},
      {locale: "en", value: "/portal/company/seats/accept"},
      {locale: "en", value: "/portal/company/seats/accept?token=secret"},
      {locale: "en", value: "/portal/unknown"},
      {locale: "en", value: "/portal?query=1"},
      {locale: "en", value: "/portal#fragment"},
      {locale: "en", value: "/zh/portal"},
      {locale: "zh-HK", value: "/en/portal"},
      {locale: "zh-HK", value: "/fr/portal"},
      {locale: "en", value: "//evil.example/portal"},
      {locale: "en", value: "https://evil.example/portal"},
      {locale: "en", value: "https://user:pass@evil.example/portal"},
      {locale: "en", value: "/portal\\company"},
      {locale: "en", value: "/portal\n"},
      {locale: "en", value: "/portal/documents\t"},
      {locale: "en", value: ["/portal", "/admin"]},
    ] as const;

    Reject C0 controls, credentials, protocol-relative/absolute URLs, query/hash state, cross-locale prefixes, unknown locale prefixes, arrays, and the token-bearing acceptance route before any authentication or provider call. Add positive EN and zh-HK cases for all nine allowlisted destinations.

    Assert:

    expect(buildPortalSignInPath("en", "/portal/documents"))
      .toBe("/member-login?next=%2Fportal%2Fdocuments");
    expect(buildPortalSignInPath("zh-HK", "/portal/billing"))
      .toBe("/zh/member-login?next=%2Fportal%2Fbilling");

    In `member-login-page.test.tsx` cover:

    - no `next` defaults to `/portal`;
    - a safe explicit continuation creates `requestMagicLink.bind(null, "en", "member-login", null, continuation)`;
    - invalid or multi-valued `next` renders localized recovery and does not bind/call auth;
    - an authenticated member redirects to the validated continuation;
    - an authenticated staff actor renders member-access denied and no Portal data;
    - metadata is `{index: false, follow: false}` in both locales.

    In `join-actions.test.ts`, execute the final `entry: "member-login"` action branch directly. For Chinese Billing continuation, assert the only provider call has callback URL `https://members.example.test/zh/member-login?next=%2Fportal%2Fbilling`, the successful redirect is `/zh/member-login?sent=1&next=%2Fportal%2Fbilling`, and neither contains `/join`. Add an EN default-`/portal` case, rate-limited case, returned-provider-error case, thrown-provider-error case, and invalid-continuation case. The last four expose only localized safe state, do not redirect, and invalid continuation calls neither `checkAuthSend` nor `auth.signIn.magicLink`.

    In the sign-out test:

    authClient.signOut.mockResolvedValue({data: {}, error: null});
    await user.click(screen.getByRole("button", {name: "Sign out"}));
    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(routerReplace).toHaveBeenCalledWith("/member-login");
    expect(routerRefresh).toHaveBeenCalledOnce();

    Add pending double-click and rejected/error-result cases. Failure must keep router calls at zero and show one localized `role="alert"`.

    In `credential-free-auth-null-session.test.ts`, exercise the real protected Portal layout/server session reader under Task 0's managed production-server boundary. The null-session seam may return `null` before `authEnv()` only when the process-local runner attestation is unguessable and byte-bound to the exact runtime descriptor/source-manifest hash/mode/run ID, the owned origin is loopback, the server is the run-owned production child, every database and Neon Auth variable is absent, and no managed mutation sentinel is present. Assert a protected EN/zh-HK request then redirects/404s as designed without opening Auth or DB. Missing/wrong/replayed attestation, non-loopback origin, source-record drift, any Auth/DB value, raw module import, or production/default execution must take the ordinary strict path; configuration/session errors propagate and are never converted to anonymous. Source tests prove that headers, cookies, query strings, route parameters, public client code, deploy config, and ambient dotenv cannot activate the seam.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/join-navigation.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/portal-layout-auth.test.tsx tests/unit/credential-free-auth-null-session.test.ts tests/unit/portal-authorization.test.ts tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/page-indexability.test.ts tests/unit/wisetech-route-parity.test.ts

    Expected: FAIL because Portal redirects still use `/join` and a prefix-based continuation, `/member-login` is absent, staff can pass the layout-level authentication check, and Portal has no sign-out control.

- [ ] **Step 3: Implement the explicit login and client-only sign-out**

    Keep `PORTAL_CONTINUATIONS` in `join-navigation.ts` as the single continuation data authority. Move `buildPortalSignInPath` there and delete the duplicate builder from `lib/portal/queries.ts`. It always returns localized `/member-login?next=%2Fportal` or the equivalently encoded allowlisted path after parsing the canonical value.

    In Portal layout:

    const actor = await getActor();
    if (!actor) {
      const requestHeaders = await headers();
      const continuation = parsePortalContinuation(
        requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"),
        locale,
      ) ?? "/portal";
      redirect(buildPortalSignInPath(locale, continuation));
    }
    requirePortalMember(actor);

    Add a layout test where `getActor` rejects with `NEON_SESSION_UNAVAILABLE`; `PortalLayout` must reject with the same error, `redirect` must remain uncalled, and `requirePortalMember` must remain uncalled. Only an actual `null` actor is anonymous; never convert configuration, session-reader, or profile-repository failures into login redirects.

    Do not accept arbitrary `startsWith("/portal")` paths. A staff/exco/superadmin actor must not acquire member access.

    Add one server-only credential-free null-session seam to `lib/auth/server.ts`/`lib/config/env.ts` for Task 0's exact managed E2E process only. It checks the internal runner attestation and all invariants above before the first `authEnv()` call and returns `null` only for that capability-free loopback run. The attestation is created after the immutable source handshake, projected only into the run-owned Next process, never sent to the browser, and destroyed with the process; it is not accepted from a request. Ordinary production, authenticated managed modes, and any operational error continue through the existing strict Neon Auth path unchanged.

    Build `MemberLoginPage` in the transactional layout. It validates one scalar continuation before invoking authentication, is noindex, redirects an existing member, renders a localized denied state for a non-member actor, and binds the same Task 2 Server Action with `entry: "member-login"`, null selection, and the parsed continuation. The callback and sent-state route remain `/member-login`. Keep the existing email validation, per-IP/per-address limiter, `APP_URL` origin validation, provider adapter, rate-limited result, and generic sanitized provider error. Never fall back to `/join`.

    Change `memberPortalAction.href` to `/member-login`. Add `route-member-login` to the integration manifest as an hkwtia-owned retained route. Keep `/member-login` out of `publicRoutes` so sitemap generation does not index it.

    Implement `PortalSignOutButton` as the only new auth Client Component. Disable while pending. Treat thrown errors and a returned `error` as failure. On success call `router.replace(destination)` then `router.refresh()`. Render it in both desktop and mobile Portal navigation through one component instance per responsive surface.

- [ ] **Step 4: Run GREEN and the credential-free redirect checks**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/join-navigation.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/portal-layout-auth.test.tsx tests/unit/credential-free-auth-null-session.test.ts tests/unit/portal-authorization.test.ts tests/unit/navigation.test.ts tests/unit/mobile-navigation.test.tsx tests/unit/page-indexability.test.ts tests/unit/wisetech-route-parity.test.ts

    Expected: PASS. Both navigation renderers target `/member-login`; generic Join targets `/membership`; cross-locale/control/credential continuation rejection occurs before auth; the member-login action has exact callback/sent/rate-limit/provider-error behavior with no `/join` fallback; operational `getActor` rejection propagates; the exact credential-free production-server attestation returns only a null session before strict env parsing while every other path preserves strict Auth errors; and sign-out has success, pending, and fail-stay behavior.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts

    Expected: PASS without credentials. The exact byte-bound loopback null-session seam makes every stable Portal route reach the localized `/member-login` route with its canonical allowlisted `next`; seat acceptance is not a generic continuation. No DB/Auth parser/provider is opened, and no request-controlled value can activate the seam. Do not edit, launch, or stage `m2-admin-crm.spec.ts` in this task: until Task 9 installs the Task 4 managed sentinel/session boundary, even an apparently credential-free M2 command could enter its current credential-triggered reset and disk-auth path.

- [ ] **Step 5: Commit the member-access slice**

    & $verifiedGit add -- ':(literal)app/[locale]/(join)/member-login/page.tsx' ':(literal)components/portal/portal-sign-out-button.tsx' ':(literal)lib/membership/join-navigation.ts' ':(literal)app/[locale]/(join)/join/actions.ts' ':(literal)app/[locale]/(member)/portal/layout.tsx' ':(literal)components/portal/portal-nav.tsx' ':(literal)lib/portal/queries.ts' ':(literal)lib/auth/server.ts' ':(literal)lib/config/env.ts' ':(literal)config/navigation.ts' ':(literal)config/wisetech-integration-manifest.ts' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/member-login-page.test.tsx' ':(literal)tests/unit/portal-sign-out-button.test.tsx' ':(literal)tests/unit/portal-layout-auth.test.tsx' ':(literal)tests/unit/credential-free-auth-null-session.test.ts' ':(literal)tests/unit/join-navigation.test.ts' ':(literal)tests/unit/join-actions.test.ts' ':(literal)tests/unit/portal-authorization.test.ts' ':(literal)tests/unit/navigation.test.ts' ':(literal)tests/unit/mobile-navigation.test.tsx' ':(literal)tests/unit/page-indexability.test.ts' ':(literal)tests/unit/wisetech-route-parity.test.ts' ':(literal)tests/e2e/portal-dashboard.spec.ts' ':(literal)tests/e2e/portal-secondary-pages.spec.ts' ':(literal)tests/e2e/seat-management.spec.ts'
    & $verifiedGit commit -m "feat: add explicit member access controls"

### Task 4: Resolve checkout by durable option and project authoritative completion state

**Files:**

- Modify: `lib/billing/checkout-service.ts`, `lib/db/repos/billing-attempts.ts`, `lib/db/repos/jobs.ts`, `lib/membership/join-billing-state.ts`.
- Modify Task 0's shared runtime: `next.config.ts`, `playwright.config.ts`, `scripts/managed-runtime-environment.mjs`, `scripts/managed-runtime-environment.d.mts`, `scripts/run-managed-playwright.mjs`, `scripts/run-managed-next.mjs`, `tests/fixtures/managed-next-env-probe.mjs`, `tests/unit/credential-free-verification-boundary.test.ts`, `tests/unit/managed-next-production-boundary.test.ts`, `tests/fixtures/m2-runtime-env.ts`.
- Modify: `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`, `components/billing/checkout-status.tsx`.
- Create managed-suite launch extensions: `scripts/run-managed-vitest.mjs`, `tests/fixtures/managed-process-env-probe.mjs`, `tests/fixtures/managed-webserver-probe.mjs`, `tests/fixtures/managed-webserver-boundary.spec.ts`, `tests/fixtures/managed-webserver-probe.playwright.config.ts`, `tests/unit/managed-vitest-process-boundary.test.ts`, `tests/unit/managed-runtime-process-boundary.test.ts`, `tests/unit/managed-webserver-boundary.test.ts`, `tests/unit/managed-next-environment-boundary.test.ts`, `tests/unit/managed-browser-process-boundary.test.ts`.
- Create: `tests/fixtures/isolated-runtime-env.ts`, `tests/unit/isolated-runtime-environment.test.ts`, `tests/fixtures/managed-auth-session.ts`, `tests/unit/managed-auth-session.test.ts`, `tests/fixtures/m4c-readonly-preview-safety.ts`, `tests/fixtures/m4c-readonly-request-manifest.ts`, `tests/unit/m4c-readonly-preview-safety.test.ts`, `tests/fixtures/m1-live-acceptance.ts`, `tests/unit/m1-live-acceptance-safety.test.ts`, `tests/fixtures/webhook-postgres-safety.ts`, `tests/fixtures/webhook-postgres-test-db.ts`, `tests/unit/webhook-postgres-safety.test.ts`, `tests/integration/webhook-join-projection-postgres.test.ts`.
- Modify tests: `tests/unit/checkout-service.test.ts`, `tests/unit/checkout-recovery-service.test.ts`, `tests/unit/billing-checkout-locking.test.ts`, `tests/unit/billing-recovery-cas.test.ts`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/portal-billing-actions.test.tsx`, `tests/unit/webhook-service.test.ts`, `tests/unit/webhook-repository-sequential.test.ts`, `tests/unit/m1-acceptance-services.test.ts`, `tests/e2e/m1-acceptance.spec.ts`, `tests/e2e/m4c-aiops.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: durable `MembershipRecord.planCode` and `MembershipRecord.billingInterval`, Task 1 `resolveMembershipOption`, Task 2's exhaustive `projectJoinTerminalState` and pure activation-journey builder, actor-scoped applications, existing billing-attempt/job repositories, Stripe adapter, and webhook-owned membership status.
- Produces:

    export type JoinMembershipState = Readonly<{
      actor: Extract<Actor, {kind: "member"}>;
      membership: MembershipRecord & {
        applicationId: string;
        status: "pending_payment" | "pending_review" | "active";
      };
      application: JoinStateApplication;
    }>;
    export type JoinStateApplication = Readonly<{
      id: string;
      planCode: string;
      currentStep: "checkout" | "review" | "complete";
      status: "pending_payment" | "pending_review" | "completed";
    }>;
    export type JoinStateDependencies = Readonly<{
      memberships: Readonly<{
        getById(
          actor: Actor,
          membershipId: string,
        ): Promise<MembershipRecord | null>;
      }>;
      applications: Readonly<{
        getById(
          actor: Actor,
          applicationId: string,
        ): Promise<JoinStateApplication | null>;
      }>;
    }>;
    export async function loadJoinMembershipState(
      actor: Actor | null,
      membershipId: string | undefined,
      dependencies?: JoinStateDependencies,
    ): Promise<JoinMembershipState | null>;

- `CheckoutDependencies` replaces `priceForPlan(planCode)` with:

    priceForOption(selection: MembershipSelection): Promise<string> | string;

- Billing-attempt locking consumes the full expected option:

    export type BillingAttemptSelection = Readonly<{
      planCode: MembershipPlanCode;
      billingInterval: BillingInterval;
    }>;

- `claimActive(actor, membershipId, priceReference, selection)` and `startNewAttempt(actor, membershipId, priceReference, selection, reason, request)` receive `BillingAttemptSelection` in that exact position; a lock-time mismatch throws `BILLING_OPTION_CHANGED` before an attempt or Stripe call.
- `createBillingPortalSession` final signature is `(actor, membershipId, locale, dependencies?)`.
- Task 4 extends Task 0's shared test-only runtime for mutating M1, M2, M3, M4B, M5, M6, M7, final authenticated-Axe, guarded PostgreSQL, and read-only M4C suites. `scripts/managed-runtime-environment.d.mts` remains the one exact sibling declaration for the `.mjs` implementation and owns every exported constant, type, and function below; TypeScript consumers import that single runtime module with no duplicate TS implementation.

    export const MUTATING_MANAGED_SUITE_SENTINELS = [
      "M1_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M2_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M3_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M4B_IDENTITY_RESTORE_ALLOW_DESTRUCTIVE",
      "M5_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M6_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "M7_ACCEPTANCE_ALLOW_DESTRUCTIVE",
      "PR6_AUTHENTICATED_AXE_ALLOW_DESTRUCTIVE",
    ] as const;
    export function managedPlaywrightOrigin(
      environment: Readonly<Record<string, string | undefined>>,
    ): string;
    export function buildManagedPlaywrightRunnerEnvironment(
      originalEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function buildManagedNextServerEnvironment(
      sanitizedRunnerEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function buildManagedBrowserEnvironment(
      sanitizedRunnerEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function buildCredentialFreeVerificationEnvironment(
      originalEnvironment: Readonly<Record<string, string | undefined>>,
    ): Record<string, string>;
    export function assertManagedNextDotenvBoundary(
      repositoryRoot: string,
    ): string;
    export type ManagedRunnerTarget = Readonly<{
      suite: "M1" | "M2" | "M3" | "M4B" | "M5" | "M6" | "M7" | "AXE";
      origin: string;
      databaseUrlTest: string;
      databaseHost: string;
      neonProjectId: string | null;
      targetFingerprint: string;
    }>;
    export function requireManagedPlaywrightRunnerTarget(
      sanitizedEnvironment: Readonly<Record<string, string | undefined>>,
      expectedSuite: ManagedRunnerTarget["suite"],
    ): ManagedRunnerTarget;
    export const MANAGED_SUITE_TEST_PATHS = {
      m1: "tests/e2e/m1-acceptance.spec.ts",
      m2: "tests/e2e/m2-admin-crm.spec.ts",
      m3: "tests/e2e/m3-automations.spec.ts",
      m4b: "tests/e2e/m4b-agents.spec.ts",
      "m4c-readonly-preview": "tests/e2e/m4c-aiops.spec.ts",
      m5: "tests/e2e/m5-showcase.spec.ts",
      m6: "tests/e2e/m6-launch-pad.spec.ts",
      m7: "tests/e2e/m7-cms.spec.ts",
      axe: "tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts",
      "webhook-postgres": "tests/integration/webhook-join-projection-postgres.test.ts",
    } as const;
    export const M4C_READONLY_PREVIEW_SENTINEL =
      "M4C_APPROVED_READONLY_PREVIEW_ONLY" as const;
    export type M4CAssetManifestEntry = Readonly<{
      pathAndQuery: string;
      status: 200;
      mediaType: string;
      byteLength: number;
      sha256: string;
      initiator: "document" | "stylesheet" | "font" | "image" | "static";
    }>;
    export type M4CSanitizedResponseHeaders = Readonly<{
      "content-type": string;
      "content-length": `${number}`;
      "content-language"?: "en" | "zh-HK";
    }>;
    export type M4CReadonlyResponseBundle = readonly Readonly<{
      descriptor: M4CAssetManifestEntry;
      body: Uint8Array;
      responseHeaders: M4CSanitizedResponseHeaders;
    }>[];
    export function sanitizeM4CResponseHeaders(
      descriptor: M4CAssetManifestEntry,
      rawHeaders: readonly Readonly<{name: string; value: string}>[],
      body: Uint8Array,
    ): M4CSanitizedResponseHeaders;
    export type M4CReadonlyPreviewTarget = Readonly<{
      suite: "M4C";
      origin: string;
      approvalReference: string;
      approvalDescriptorSha256: string;
      deploymentId: string;
      projectId: string;
      reviewedHead: string;
      localHeadRecordSha256: string;
      reviewedBranch: "codex/wisetech-pr6-join-portal-admin";
      providerResponseSha256: string;
      safeRequestManifestSha256: string;
      assetManifestSha256: string;
      assetManifestEntries: readonly M4CAssetManifestEntry[];
      responseBundleSha256: string;
      testPath: typeof MANAGED_SUITE_TEST_PATHS["m4c-readonly-preview"];
    }>;
    export function requireM4CReadonlyPreviewTarget(
      environment: Readonly<Record<string, string | undefined>>,
      projection: unknown,
    ): M4CReadonlyPreviewTarget;
    export function requireM4CReadonlyResponseBundle(
      target: M4CReadonlyPreviewTarget,
      capability: unknown,
    ): M4CReadonlyResponseBundle;

  Any nonempty value for any managed sentinel activates the managed safety posture even when its value is wrong. `MANAGED_SUITE_ENVIRONMENT_MANIFESTS` classifies every suite name as original-parent-required, runner-retained, Next-runtime-only, browser-forbidden, one exact canonical test path, and one Task 0 byte-bound source-closure manifest; no suite-level skip/guard may rediscover this ad hoc. There is no ambient no-sentinel fallback: Task 0's `credential-free` mode, the exact mutating modes `m1`, `m2`, `m3`, `m4b`, `m5`, `m6`, `m7`, `axe`, and the separate `m4c-readonly-preview` mode are the only accepted launch classes. Managed Playwright modes accept exactly one mode and no caller-supplied path or option; managed Vitest accepts only `webhook-postgres`. Each resolves the one manifest path, requires a regular non-reparse file at that exact case-sensitive repository-relative path, and rejects extra arguments, traversal, symlinks, case aliases, alternate configs, untracked substitutions, path/mode mismatch, or source-closure drift before the post-handshake capability pipe can open. A direct Playwright/Vitest/config invocation fails before importing application/provider/database code.

  Against the original parent, reject more than one active mutating suite, any present `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_BROWSERS_PATH` in every Playwright mode including M4C, duplicate ASCII-case identities, a non-attested Node/browser runtime, or an occupied requested port for local suites. Validate one canonical decimal loopback port and derive exactly `http://127.0.0.1:<port>`; validate original `APP_URL` and the suite allowlist against that origin, standard `NEON_PROJECT_ID` against the suite's independently named test project where required, and every other suite-specific input before sanitizing. The exact root candidates `.env`, `.env.local`, `.env.test`, `.env.test.local`, `.env.development`, `.env.development.local`, `.env.production`, and `.env.production.local` are absent by lstat/reparse-safe checks before the capability-free build and again inside `run-managed-next.mjs` before build/start. Carry the ordered absence fingerprint in the launch attestation.

  `run-managed-playwright.mjs` never delegates to npm, a PATH executable, an ambient config branch, or a pre-existing server. For every local mode it reserves the port/origin and one run ID first, then asks Task 0's builder to materialize the approved source plus complete `node_modules` tree into a unique immutable root. It passes exact `PR6_NEXT_DIST_DIR=.next/pr6-<runId>` to the guarded `next.config.ts` for both build/start; raw/default/traversing values fail. The capability-free build emits there. Before capabilities exist, the parent captures every generated file and every output-file-tracing `.nft.json` dependency, rejects any dependency outside the immutable source/`node_modules` roots, holds the complete generated/traced closure immutable, and scans real absolute URLs/canaries. Only then does it construct the suite runtime map and start the same captured output as `next start --hostname 127.0.0.1 --port <ownedPort>`. The exact attested Playwright CLI and separately approved complete browser/FFmpeg distribution run with no shell, ambient cache/channel discovery, or browser download. Task 0's guardian owns every non-breakaway descendant, port, held file, lease, materialization, and build through all exits. `playwright.config.ts` receives base URL only through the internal attestation, sets `forbidOnly: true`, one worker, and a scrubbed browser environment; it owns no `webServer` or reuse path. Stale listeners, run ID/distDir drift, output-tracing escape, replaced generated/external modules, missing browser resources, raw `PLAYWRIGHT_BASE_URL`, path drift, or cleanup residue fail.

  Build and start use the locked Next 16.3.0 non-development loader with `__NEXT_PROCESSED_ENV=true` and `NEXT_TELEMETRY_DISABLED=1` after the two absence checks; no plan path launches `next dev`. The guarded config requires the same internal run attestation and `PR6_NEXT_DIST_DIR` for both phases and has no request-, dotenv-, or CLI-selected fallback. Before build, only `NEXT_PUBLIC_SITE_URL = target.origin` enters the capability-free map, and built metadata/robots/sitemap/structured data/browser URLs must use it. Only after the complete generated/output-traced closure and canary/origin checks pass may `requireManagedPlaywrightRunnerTarget` add the exact suite capabilities to the start map. M1, M2, M6, M7, and authenticated Axe map `NEON_PROJECT_ID` only from their independently validated test-project source; other suites omit it. M1/M2 map exact Stripe test sources; M2 maps test cron/unsubscribe; M3 maps test unsubscribe; authenticated suites map only validated test Neon Auth values. Source names and `PR6_MANAGED_*` projections remain runner-only. Missing/drifted values fail before Pool, browser, Auth, provider, or mutation construction.

  This production build/start split is the dotenv race boundary. `managed-next-production-boundary.test.ts` and `managed-next-environment-boundary.test.ts` source-pin both the Next production loader and the development `forceReload` watcher, prove the launcher has no dev route, and use a real isolated miniature Next application. They add each production/development/test dotenv candidate after server readiness with canaries for every classified capability and an otherwise arbitrary key, trigger repeated requests and filesystem time, and require the running `next start` process to retain its exact original key/value fingerprint. They also inject a candidate between outer and inner checks and between inner check and loader; the former fails the fingerprint and the latter is ignored by the non-forced processed loader. A source/version drift, any dev watcher, or any observed reload fails. Thus the plan does not rely on `__NEXT_PROCESSED_ENV` against Next dev's `forceReload: true` path.

  Build the managed Playwright-runner map from an empty object and an explicit case-folded operational allowlist. On Windows, require canonical equal `SystemRoot`/`WINDIR`, exact regular `%SystemRoot%\System32\cmd.exe` `ComSpec`, fixed `PATHEXT=.COM;.EXE;.BAT;.CMD`, and a rebuilt PATH containing only the attested Node directory and `System32`; retain canonical run-owned temp/cache plus required user runtime directories. On POSIX, require canonical `/bin/sh`, rebuild PATH from the attested Node directory plus fixed `/usr/bin` and `/bin`, and retain only validated runtime directories/locale keys. Reject writable fake routing entries, `NODE_OPTIONS`, dynamic-loader/proxy overrides, and every ambient external capability. Retain `DATABASE_URL_TEST` plus only the active suite's enumerated test sources, and add exact non-secret `PR6_MANAGED_*` suite/origin/database/project/build/run/fingerprint projections. Standard/live variables are absent. The config and every runner-side fixture call `requireManagedPlaywrightRunnerTarget(actualProcessEnv, expectedSuite)` before constructing anything.

  The external-capability classification is Windows-case-safe on every platform. It includes every name matched by `/(?:^|_)(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY_ID)(?:_|$)/i`, every suite source prefix, and the exact names declared by `.env.example`, `lib/config/env.ts`, `lib/media/r2-storage.ts`, `lib/channels/woztell.ts`, `lib/ai/woztell-production.ts`, and `lib/jobs/runners.ts`. It covers all database/Neon, Stripe, Resend, AI, R2, WOZTELL, Turnstile, observability, cron/unsubscribe, Auth, Vercel/share-token, browser routing, and acceptance variables. A source contract fails when a discovered environment access is neither matched nor explicitly classified.

  `buildManagedBrowserEnvironment` starts empty and retains only browser-required canonical OS/runtime keys, rebuilt minimal PATH, and fixed `NODE_ENV=test`. It excludes `DATABASE_URL_TEST`, every suite source, credential, `PR6_MANAGED_*` projection, proxy, loader override, and arbitrary ambient key. Pin and source-test Playwright 1.61.1's launcher behavior: `BrowserType` uses explicit `launchOptions.env` instead of `process.env` and Chromium leaves that map unchanged.

  `managed-webserver-boundary.test.ts` remains a focused upstream-regression probe, not the main application server. In both RED and GREEN it first invokes the real locked Playwright CLI directly from Task 0's already credential-free Vitest child, against a synthetic non-secret canary and `managed-webserver-probe.playwright.config.ts`, and positively records the upstream pass-through merge as a diagnostic. The same test then invokes the managed probe mode and requires that canary absent. Before implementation, the diagnostic proves the actual boundary and the managed assertion fails because the safe mode is absent; after implementation, the diagnostic still proves what upstream would inherit while the managed path passes. The fixture config pins `testDir` and exact `testMatch` to only `managed-webserver-boundary.spec.ts`; the minimal spec performs one loopback request and uses no browser/page/context fixture. The probe server reports only sorted key names and hashes of synthetic values. Prove the real Playwright `shell: true` merge admits exactly its three pinned defaults atop the sanitized attested map, uses the canonical shell, reaches the inner probe, and exits zero; no-tests, `--pass-with-no-tests`, fake shell, unexpected default, or missing readiness is failure.

  `managed-runtime-process-boundary.test.ts` exercises the pre-entry invoker, byte-bound outer runner, capability-free build, production Next start, Playwright child, browser child, creation-time guardian, and cleanup as actual subprocesses under explicit test/hook/readiness/shutdown budgets. Assert every complete case-folded map, every exact mode/source-closure manifest, original-parent versus runner versus Next ownership, post-handshake source delivery, fresh-port behavior, direct-bypass/path-substitution denial, complete executable/hash/path checks, exit propagation, and absent artifact/auth output. Barrier-controlled probes replace each launcher/config/support path after capture, kill the parent while the child is still suspended and attempting an immediate grandchild, and prove no unverified byte, instruction, escaped process, port, lease, or artifact survives; a later live-server kill separately proves normal tree cleanup without touching a sibling. `run-managed-vitest.mjs webhook-postgres` accepts no forwarded path, resolves only `tests/integration/webhook-join-projection-postgres.test.ts`, uses the same attested Node, source-closure, handshake, and replacement runner rules, retains only the webhook sentinel/isolated database sources, and invokes the exact local Vitest CLI with no shell; raw Vitest/npm, an alternate file/config/option, and ambient standard `DATABASE_URL` fail before the guard import.

  `m4c-readonly-preview` is a distinct sanitized branch. The trusted launcher escrow requires exact M4C approval sentinel/descriptor, Task 12 local-head record, parent-only Vercel read token, optional share token, and absent ambient browser routing. None enters PowerShell. The descriptor binds deployment/project/team, generated origin, branch/repository/reviewed head, denylist, and safe-request-manifest hash. Before any M4C capability is released, run fresh verified-Git branch/ref/HEAD plus PR5/spec ancestry checks and require the live head equal the local-head record; close Git handles. Then perform the bounded no-redirect Vercel metadata GET and require READY Preview metadata plus provider Git SHA equal descriptor and live local head. Reject origin/alias/metadata ambiguity. Only token-stripped provider hash, local-head-record hash, and non-secret projections enter `M4CReadonlyPreviewTarget`.

  `M4C_SAFE_REQUEST_MANIFEST` permits documents only at canonical `localePrefix: "as-needed"` paths: `/ai-ops`, `/zh/ai-ops`, `/sitemap.xml`, `/news/m4-runtime-and-concierge`, `/zh/news/m4-runtime-and-concierge`, `/news/m4-public-ai-ops`, and `/zh/news/m4-public-ai-ops`. Tests set English prefix to `""`, reject `/en/...` redirects, and retain `/zh`. If a share token exists, the trusted parent—not Playwright—performs exactly one `/?_vercel_share=<opaque>` protection bootstrap with manual redirect handling: allow only the source-tested same-origin status/location/cookie shape, at most one query-free redirect to `/`, and one host-only secure protection cookie in a parent-owned memory jar. Reject cross-origin/domain/path broadening, extra cookies, token reflection, replay, or unexpected response. The raw token never leaves escrow.
  Using only that parent jar, perform bounded same-origin GETs for the exact documents, parse exact static/stylesheet/font/image URLs, and recursively fetch CSS dependencies under fixed depth/file/byte budgets. Reject RSC/client-navigation/API paths, unknown origins, and unallowlisted queries. For every successful response retain an immutable in-memory body, exact closed `M4CSanitizedResponseHeaders`, exact `M4CAssetManifestEntry`, and SHA-256. The sanitizer consumes a duplicate-preserving raw header list, lowercases names, rejects case-colliding duplicates for retained fields, and emits only required `content-type`, recomputed canonical decimal `content-length` from the decoded body bytes, and optional route-matched `content-language: en | zh-HK`. It drops every unknown header and always strips `set-cookie`, `set-cookie2`, `content-encoding`, `connection`, `keep-alive`, `proxy-authenticate`, `proxy-authorization`, `te`, `trailer`, `transfer-encoding`, `upgrade`, `location`, and `refresh`; raw provider headers are zeroed after canonicalization. Media type must equal the descriptor's source-tested allowlist and language is forbidden for non-document assets. The ordered entries and their aggregate hash populate `assetManifestEntries`/`assetManifestSha256`; the ordered body/header bundle has a separate `responseBundleSha256`. Before child handshake, destroy the raw share token and parent cookie jar. After handshake, send exactly one `M4CReadonlyResponseBundle` capability over the non-inheritable pipe; no token/cookie/raw provider metadata follows. The target and bundle must agree entry-for-entry and hash-for-hash.
  `m4c-readonly-preview-safety.ts` creates one `javaScriptEnabled: false` context with service workers/artifacts/downloads disabled and installs a route before navigation. Every allowed browser request must match one target entry; the handler re-hashes/length-checks the corresponding bundle body, re-runs the closed header validator, and calls `route.fulfill` with only the three-key typed header object. Browser network is denied entirely, so Chromium needs no share token/cookie and response identity—not just URL metadata—is enforced. Direct canonical document navigations render those captured provider bytes; RSC/client navigation, APIs, Showcase, Portal/Admin/Join, unknown requests, and mutation methods abort and record denial. After the case, clear context cookies, zero every body buffer, close the context, and require no denial/residual bundle. Source/graph tests catch state-changing Showcase GET. Unit/subprocess tests cover local-head drift, descriptor/entry/bundle mismatch, CSS budgets, wrong media/length/hash/body, mixed-case duplicate headers, cookie/content-encoding/hop-by-hop stripping, recomputed length, route-locale language, locked Playwright 1.61.1 fulfillment/header forwarding, protection redirect/cookie exfiltration/replay, token retention, network fallback, service worker, alternate spec/context, and cleanup.

  Import the real application environment parsers against captured production-server maps with optional Concierge, Turnstile, Resend, R2, and WOZTELL names absent, and prove M2's invalid-signature WOZTELL request still reaches the existing 401 contract. Type-import every public API from `managed-runtime-environment.mjs`, assert its sibling declaration matches the runtime export set, and treat `run-managed-playwright.mjs`, `run-managed-next.mjs`, and `run-managed-vitest.mjs` as subprocess-only executables with no import seam.

  Task 4 also owns `managed-auth-session.ts`. Every real Neon Auth sign-in in M1, M2, M3, M4B, M5, M6, M7, and authenticated Axe must return a registry-owned context; suites may not call `context.close()` directly. In aggregate cleanup, and before any profile restoration, the registry independently attempts real same-origin `POST /api/auth/sign-out` from each still-open authenticated context, requires a successful response, then requires `GET /api/auth/get-session` to resolve anonymous/null and one protected route to exhibit the expected anonymous redirect/404. It still closes every context if another revocation fails, aggregates all failures, and makes incomplete revocation `NOT PASSED`. A success-path sign-out is verified again rather than trusted. The helper never creates, deletes, or resets an auth user.

  When any mutating sentinel is active, `playwright.config.ts` forces `trace: "off"`, `screenshot: "off"`, and `video: "off"`. Managed auth state is in memory only: no `storageState({path})`, cookie JSON, trace ZIP, screenshot, or video may be written. Unit/source tests inject early page/test failures, a closed page with an open context, sign-out failure, anonymous-verification failure, and multiple sessions; they prove revocation-before-close ordering, independent cleanup aggregation, and no credential-bearing artifact API/path. Credential-free runs retain existing behavior. Only M4C and the public Lighthouse gate remain separately guarded read-only Preview flows.
- The isolated provider harness exports `M1_ACCEPTANCE_DESTRUCTIVE_SENTINEL = "M1_ISOLATED_FIXTURES_ONLY"`, `M1_ACCEPTANCE_PROVIDER_SENTINEL = "M1_TEST_PROVIDERS_ONLY"`, `missingM1ParentEnvironment(originalEnvironment)`, `missingM1LiveRunnerEnvironment(sanitizedEnvironment)`, `requireM1LiveRunnerEnvironment(sanitizedEnvironment)`, `snapshotM1Identities(guarded)`, `prepareM1Fixture(runId, identities, guarded)`, `checkpointM1IdentityMutations(runId, identities, guarded)`, `collectM1StripeRunLedger(runId, guarded, identifiers)`, `collectM1DatabaseRunLedger(runId, guarded, identifiers)`, `disposeM1StripeRun(ledger, guarded)`, `restoreM1IdentitiesAfterQuiescence(runId, identities, guarded)`, and `cleanupM1Fixture(runId, guarded)`. It remains test-only and cannot be imported by `app`, `components`, or `lib` production modules.
- The exact pre-existing identity snapshot is:

    export type M1ProfileSnapshot = Readonly<{
      id: string;
      authUserId: string;
      email: string | null;
      role: "member" | "staff" | "exco" | "superadmin";
      lastLoginAt: string | null;
      consentMarketing: boolean;
      interests: readonly string[];
      displayName: string;
      phone: string | null;
      jobTitle: string | null;
      locale: string;
      onboardingState: string;
      directoryVisible: boolean;
      createdAt: string;
      updatedAt: string;
      whatsappOptIn: boolean;
      whatsappNumber: string | null;
    }>;
    export type M1IdentitySnapshot = Readonly<{
      runStartedAt: string;
      owner: M1ProfileSnapshot;
      invitee: M1ProfileSnapshot;
    }>;

  `requireM1LiveRunnerEnvironment(process.env)` must first return the attested `ManagedRunnerTarget` plus validated retained M1 test sources; standard `APP_URL`, `DATABASE_URL`, and `NEON_PROJECT_ID` are forbidden in that runner input. Construct the only guarded read-only Pool from `target.databaseUrlTest`, and use `target.origin`/`target.neonProjectId` for every runner-side target comparison before browser, inbox, Neon Auth, or Stripe construction. Only after those pass may that Pool load the full owner/invitee snapshots; both profiles must exist with `role === "member"`, each configured email must equal its normalized profile email, and normalized emails, auth-user IDs, and profile IDs must be pairwise distinct. `M1_TEST_OVERFLOW_EMAIL` is a third distinct controlled-inbox test address. The owner must have no pre-existing Join application, membership, or company context that the journey would overwrite; fail after the guarded DB preflight but before browser/inbox/Auth/Stripe construction or mutation. The run target company does not yet exist at preflight: after owner onboarding creates it and before invitation, require the invitee has no active membership in that exact new company and require the exact active company-member count to be one.
- `M1StripeRunLedger` records the run ID; exact run-owned application, membership, billing-attempt, Checkout Session, Customer, Subscription, Invoice, PaymentIntent, and Charge IDs; request window and expected price/idempotency context; and every cleanup disposition. Provider Session/Subscription metadata ownership is exactly `{membershipId, applicationId, planCode}`—never an attempt ID. Billing-attempt ownership is proven by the guarded attempt row whose attached Session ID, membership ID, exact price, and idempotency key match the run. `M1DatabaseRunLedger` records the exact signed Stripe event ID, job ID, webhook audit ID, webhook-created journey IDs, and post-webhook application projection. A successful job must have `runKey === eventId`, `kind === "checkout.session.completed"`, `state === "completed"`, its expected attempt/time window, membership `active`, application `completed/complete`, and the complete exact activation-journey key set; its audit must have null actor user, actor type `system`, action `stripe.webhook.processed`, target type `membership`, target ID equal to the run membership, request ID equal to the event ID, and exact metadata `{eventType, stripeCreated, eventId, status: "active"}`. A transient partial webhook failure may leave the exact redacted failed job and no audit, but the locked membership/application/attempt/journey/audit/job-completion transaction must have rolled back; a correlation rejection leaves neither a job nor an audit. Because the production Billing Portal boundary exposes only its redirect URL, record sanitized redirect/locale-return evidence as `retained_immutable_unaddressable_test_record` without inventing a provider ID.
- The controlled inbox adapter has this exact test-only contract:

    export type M1MagicLinkInboxResponse = Readonly<{
      messages: readonly Readonly<{
        id: string;
        recipient: string;
        receivedAt: string;
        href: string;
      }>[];
    }>;

  The adapter exposes two bounded retrieval-only operations over `GET {M1_TEST_MAGIC_LINK_INBOX_URL}?recipient={encodedEmail}&after={encodedIsoTimestamp}` with `Authorization: Bearer {M1_TEST_MAGIC_LINK_INBOX_TOKEN}`. `pollExactlyOne` retries for at most 60 seconds and succeeds only with exactly one post-request message for the exact recipient; `receivedAt` must parse after the request timestamp, and `href` must be HTTPS, contain no URL credentials, and have the exact canonical `M1_TEST_MAGIC_LINK_ALLOWED_ORIGIN`. The adapter must never issue GET, HEAD, redirect resolution, prefetch, or any other request to `href`. The fresh Playwright context navigates to that exact href once, validates every redirect origin against the auth-link/application allowlist, and validates the final exact `target.origin` and expected path. `assertNoMessage` only queries the inbox API for the same exact recipient through the full 60-second window and fails on any post-request message. Reject extra matches, stale messages, malformed JSON, or timeouts. Unit tests use a fake clock and scripted inbox responses and prove the link URL is never dereferenced outside the browser.
- The stateful live M1 case defines `M1_LIVE_TEST_TIMEOUT_MS = 900_000` and its aggregate `afterAll` defines `M1_CLEANUP_TIMEOUT_MS = 600_000`. Apply the test timeout before any inbox poll and set the hook timeout at hook entry. The live journey has three independent bounded `pollExactlyOne` windows plus one full negative `assertNoMessage` window (at least 240 seconds before browser, provider, and assertion overhead), so it must never inherit Playwright's current 180-second global timeout. Unit/source tests require those exact overrides, prove each exceeds its named worst-case budget, and prove cleanup still runs when the live body reaches its deadline.

- [ ] **Step 1: Write failing durable-price, locked-row, completion, and locale tests**

    Add checkout assertions:

    expect(setup.dependencies.priceForOption)
      .toHaveBeenCalledWith({plan: "startup", billingInterval: "annual"});
    expect(setup.attempts.claimActive).toHaveBeenCalledWith(
      actor,
      membershipId,
      "price_startup_annual",
      {planCode: "startup", billingInterval: "annual"},
    );

    Add a monthly durable membership case and expect `STRIPE_PRICE_NOT_CONFIGURED` before `claimActive` or Stripe. Add a lock-race case where preflight reads annual but the locked row is monthly; expect `BILLING_OPTION_CHANGED` and no attempt/Stripe mutation. Add a conflicting query object to the page test and prove it is ignored.

    In `billing-recovery-cas.test.ts`, add `billing_interval: "annual"` to every locked Startup row. Change all direct calls at the existing recovery/replay/authorization cases to `startNewAttempt(actor, membershipId, "price_startup_v1", {planCode: "startup", billingInterval: "annual"}, reason, request)` and `claimActive(system, membershipId, "price_1", {planCode: "startup", billingInterval: "annual"})`. Preserve the current system-actor denial, compare-and-swap, replay, and stale-request assertions.

    Extend the raw locked-membership test so SQL selects `billing_interval` and `claimActive` returns:

    expect(result.membership).toMatchObject({
      planCode: "startup",
      billingInterval: "annual",
    });

    Completion cases:

    it.each([
      ["pending_payment", "processing"],
      ["pending_review", "review"],
      ["active", "active"],
    ] as const)("renders durable %s as %s", async (status, expected) => {
      state.membership = {...state.membership, status};
      state.application = {
        ...state.application,
        currentStep: status === "active"
          ? "complete"
          : status === "pending_review"
            ? "review"
            : "checkout",
        status: status === "active" ? "completed" : status,
      };
      const html = renderToStaticMarkup(await CompletePage(props({
        membership_id: "membership-a",
        session_id: "forged-success",
      })));
      expect(html).toContain('data-join-status="' + expected + '"');
    });

    Add `past_due`, `cancel_at_period_end`, `cancelled`, `expired`, plan-mismatch, missing application, foreign actor, and multi-valued membership ID cases; each must call no Stripe adapter and return not-found/recovery. This separate loader/read-model boundary therefore exercises all seven membership statuses independently of Task 2's mapper tests.

    In `webhook-repository-sequential.test.ts`, extend the scripted `checkout.session.completed` contract without pretending it executes PostgreSQL. The checkout-only locked read must use an `INNER JOIN membership_applications` and `FOR UPDATE OF memberships, membership_applications`; non-checkout lifecycle commands retain the existing nullable-application `LEFT JOIN` and membership-only lock. Require exact event membership/application/plan/target and Stripe Session/Customer/Subscription/attempt correlation. Determine stale ordering before lifecycle/application predecessor validation. Preserve and test four distinct outcomes:

    1. An already claimed/completed identical event returns `duplicate` after the claim and writes nothing.
    2. A valid stale checkout—including the existing later-cancelled case—locks/verifies its correlated attempt, performs no membership/application/attempt/journey mutation, inserts exactly one `stripe.webhook.ignored_stale` audit, marks the job completed, and commits.
    3. A non-stale correlated checkout accepts the existing membership lifecycle sources only with a coherent application pair: `pending_payment/checkout` for pending payment, `pending_review/review` for pending review, and `completed/complete` for active, past-due, or cancel-at-period-end membership. It maps next status `active`, updates membership plus application, completes the attempt, inserts and verifies activation steps anchored to the validated Stripe `eventCreated` timestamp, inserts `stripe.webhook.processed`, marks the job completed, and commits all of them together.
    4. A correlation error rolls back the claim and creates neither failed job nor audit. A transient update/projection/journey/audit/job-completion failure rolls back membership/application/attempt/journey/audit/job, then records only the existing redacted failed-job fallback outside the rolled-back transaction.

    Inject failure independently at membership update, application update, attempt update, journey insert, journey verification, processed-audit insert, and job-completion update. Prove every transactional row rolls back and only transient failures take the failed-job path. Assert exact `scheduled_at` values from `new Date(command.eventCreated * 1000)`, not only journey keys. Preserve the same-second event-ID tiebreaker and stale audit semantics. Update exact scripted statement counts/order; do not weaken the SQL-string harness.

    Add `webhook-postgres-safety.test.ts`, test-only `webhook-postgres-test-db.ts`, and guarded `webhook-join-projection-postgres.test.ts`. The integration module may statically import only the pure safety helper and Vitest APIs. Before constructing a Pool or dynamically importing `lib/db/repos/jobs.ts`, require exact `PR6_WEBHOOK_POSTGRES_ALLOW_DESTRUCTIVE=PR6_ISOLATED_WEBHOOK_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, absent standard `DATABASE_URL`, independently matched non-production Neon/TLS host/project identity, `DATABASE_URL_TEST`, and a fixed advisory-lock ID. Construct one `pg.Pool` and Drizzle handle solely from the guarded URL, install a `vi.doMock` for the exact resolved `lib/db/client.ts` module that returns only that handle, and only then dynamically import the production repository. A default `getDb`/client load, unmocked import, second URL, raw unverified executor, or fixture/repository connection-identity mismatch throws before a statement; source/unit tests prove the production client module body never evaluates. Under the fixed advisory lock, a read-only preflight requires exactly one existing `startup` membership-plan row matching Task 1's canonical persisted fields; snapshot its complete row and never insert, update, or delete it. Derive a unique run-owned profile ID, auth-user ID, `.invalid` email, application ID, membership ID, and attempt ID; require every exact run predicate absent, then insert the complete member profile before its application/membership/attempt dependants. No Neon Auth user or provider call is created. `webhook-postgres-test-db.ts` wraps the same guarded Drizzle handle with named test-only observation/failpoint seams: after the real checkout `INNER JOIN ... FOR UPDATE OF` returns, a barrier signals the test and holds the production transaction; two independent dedicated contender clients start only after the named after-both-locks barrier: one updates exactly the run-owned `memberships` row and the other updates exactly the run-owned `membership_applications` row under bounded `lock_timeout`. The RED test tracks both promises/connections, requires both to remain pending for the complete observation window, releases the production barrier once, observes both resume, and explicitly rolls both transactions back before cleanup. Separate named failpoints throw at processed-audit insert and job-completion update. Apply bounded statement, idle-transaction, barrier, cancellation, and whole-test deadlines; every connection is tracked and aggregate cleanup attempts rollback/cancel/release before `pool.end()` even after timeout. Prove success commits membership/application/attempt/journey/audit/job atomically and each injected failure rolls all transactional rows back. In `finally`, independently drain/cancel all tracked operations, delete exact run-owned audit/job/journey/attempt/membership/application/profile rows in FK-safe order through the same guarded handle, prove every predicate absent, prove the canonical plan row remains byte-identical, restore Vitest mocks, and close every client/Pool. Missing approval/resources, a present ambient `DATABASE_URL`, missing/mismatched plan, collision, barrier/timeout ambiguity, default-client load, connection leak, or incomplete cleanup is `NOT PASSED`; it is never a credential-free PASS.

    In `webhook-service.test.ts`, preserve signed-event and job idempotency and the service's existing delegation-only ownership. Assert the repository cannot return `processed` until membership, application, attempt, journeys, processed/ignored audit, and job completion have committed. Distinguish correlation rejection with no failed job/audit from transient repository failure with the existing redacted failed-job record and no processed audit.

    Assert Chinese Billing Portal return:

    await createBillingPortalSession(actor, membershipId, "zh-HK", dependencies);
    expect(stripe.portalRequests[0]).toEqual({
      customerId: "cus_owned",
      returnUrl: "https://members.example.test/zh/portal/billing",
    });

    In `isolated-runtime-environment.test.ts`, prove external `PLAYWRIGHT_BASE_URL` rejection, canonical managed origin/port equality, multiple-suite rejection, original-parent `APP_URL`/`NEON_PROJECT_ID` equality, exact runner projection/fingerprint creation, exact Next database/APP mappings, standard Stripe/cron/unsubscribe/Auth scrubbing, suite-only retention/remapping, missing suite-required values at their declared parent/runner boundary, non-test Stripe/Auth inputs, and a fresh outer-owned production server and occupied-port rejection for every M1/M2/M3/M4B/M5/M6/M7/Axe sentinel including malformed values. In `m1-live-acceptance-safety.test.ts`, separately prove the original-parent guard rejects missing/wrong destructive or provider sentinels, absent `DATABASE_URL_TEST`, non-Neon/TLS-invalid/production-labelled/mismatched database hosts/projects, managed origin/original `APP_URL`/`M1_E2E_ALLOWED_ORIGIN` mismatch, any present `PLAYWRIGHT_BASE_URL`, original `NEON_PROJECT_ID` mismatch, non-test Stripe credentials, invalid or mismatched `NEON_AUTH_TEST_BASE_URL`/`NEON_AUTH_TEST_ALLOWED_ORIGIN`, weak `NEON_AUTH_TEST_COOKIE_SECRET`, unallowlisted inbox/auth-link origins, missing owner/invitee/overflow emails, and normalized email collisions before launch. Prove the runner guard accepts the sanitized map, returns the exact target, and rejects leaked/missing standard names, source/projection drift, suite mismatch, or invalid attestation before Pool/browser/inbox/Auth/Stripe. Then prove the guarded read-only DB preflight rejects absent or non-member owner/invitee profile mappings, configured/profile email or auth/profile-ID collisions, and pre-existing owner Join/company context after only the guarded Pool exists but before any other client or mutation. Finally prove the post-company/pre-invitation checkpoint rejects an existing invitee membership or active count other than one for the exact run-owned company.

    In the same file, unit-test provider/database ledgers and dispositions with fake clients. Reject Session/client-reference/`{membershipId, applicationId, planCode}` metadata, Customer, Subscription, attempt-row, price/quantity, and URL lineage mismatches before cleanup. Cover create-success plus `attachSession`/fallback-read failure: before any DB deletion, perform a read-only bounded Checkout Session search over the exact run request window and complete pagination, then match `livemode === false`, run membership `client_reference_id`, exact three-field metadata, exact Customer, one line item with exact Price/quantity, and exact managed success/cancel URLs. Adopt exactly one candidate; zero is `no_session_created` only after a complete successful search, while multiple candidates, pagination overflow/`has_more`, or provider failure fails and mutates none. Never use idempotent replay during cleanup because it could create a Session. Expire only an owned open Session and accept an already-expired Session; cancel owned Subscriptions in `active`, `trialing`, `past_due`, `unpaid`, `paused`, or `incomplete` before Customer deletion while treating `canceled` and `incomplete_expired` as terminal. Verify Customer deletion; never delete completed Sessions, Portal Sessions, Invoices, PaymentIntents, Charges, configured Prices, or webhook configuration. Cover the exact completed/failed webhook job, processed audit, duplicate replay, webhook-created journey rows, and transient-failed-job/no-audit and correlation-no-job/no-audit cleanup predicates.

    Unit-test managed session revocation/no-artifact behavior, identity restoration, explicit live/hook timeout budgets, and failure aggregation: serialize every profile column exactly; accept only baseline or an owner/invitee state whose allowed run-ID fields and `lastLoginAt`/`updatedAt` timestamps fall inside recorded checkpoints. After all sessions are revoked/proved anonymous and contexts close, poll both full rows until each is stable for a bounded quiet window. Restore with compare-and-swap against the full last-observed row; if a late allowed run touch lands, repeat within a fixed deadline. Preserve and fail on external drift. Success requires each restored row to remain byte-identical to baseline for a second full quiet window. Test a delayed `touchLastLogin` after context close and after the first restore, idempotent already-restored rows, independent restoration of both identities, aggregate provider/browser/database/identity/cleanup failures, a live-body timeout, and an independently budgeted cleanup hook that still executes. Add a live-fixture contract requiring a distinct invitee, fresh browser context/session transitions, exactly-once magic-link navigation, accepted invitation/member IDs, exact capacity fill, and zero overflow inbox message/invitation row.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-vitest-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/m4c-readonly-preview-safety.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/webhook-postgres-safety.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/m1-acceptance-services.test.ts tests/unit/m1-live-acceptance-safety.test.ts

    Expected: FAIL because checkout resolves by plan only, locked membership rows/direct recovery omit interval/full selection, the paid webhook locks/projects only the membership/application-incoherently, completion accepts pending payment only, Billing Portal returns to English, and the actual replacement-environment Playwright/Next process boundary plus isolated M1 environment, deterministic session revocation/no auth artifacts, explicit 900-second live/600-second cleanup budgets, distinct-invitee journey, retrieval-only magic-link contract, profile quiescence/CAS restoration, recoverable provider lineage, signed local webhook, database residue ledger, and aggregate cleanup dispositions do not exist. The newly written fixture config/spec first runs the real locked Playwright CLI directly from Task 0's credential-free Vitest child and records the synthetic canary admitted by Playwright's actual `{BROWSER: "none", FORCE_COLOR: "1", DEBUG_COLORS: "1", ...process.env, ...webServer.env}` merge. It then fails the not-yet-implemented managed assertion. The RED package must contain both facts, so it is not merely a missing file/spec/no-tests result; GREEN reruns the identical diagnostic plus the sanitized managed path without provider/database access.

    Do not invoke managed Vitest in this step: the managed runner does not exist yet, so a module-not-found result would not be the required PostgreSQL RED.

- [ ] **Step 3: Implement and verify the managed launch boundary before any capability-bearing RED**

    Implement only the Task 4 changes to `managed-runtime-environment.mjs`/`.d.mts`, `run-managed-playwright.mjs`, `run-managed-next.mjs`, `run-managed-vitest.mjs`, `playwright.config.ts`, process probes, exact mode-to-file manifests, guardian integration, and M4C read-only safety helper/spec. Do not modify billing/job repository production behavior yet. Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-vitest-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/m4c-readonly-preview-safety.test.ts

    Expected: PASS for immutable pre-entry source closure and post-handshake sanitization, exact mode-to-file denial, build-time origin binding, real child maps, explicit budgets, creation-window and abrupt-parent process-tree/artifact cleanup, provider-bound M4C deployment proof, and exact safe-request-manifest enforcement. No application/provider/database mutation occurs.

    Only under the separate named database-mutation approval and complete isolated Neon guard, run the now-existing exact managed mode:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-vitest.mjs webhook-postgres

    Expected without the complete gate: the outer launcher refuses before Vitest/import and records `NOT PASSED`; it does not skip inside a test. With approval, expected RED is the current PostgreSQL contract gap—not missing runner/config/file—because checkout still uses a nullable `LEFT JOIN`, does not atomically project the application, and does not hold both required row locks. Never supply or infer credentials merely to obtain RED.

- [ ] **Step 4: Implement durable billing and status projection**

    Include `billingInterval` in `rawMembership` and the `FOR UPDATE` selection in `billing-attempts.ts`. Change `claimActive` and `startNewAttempt` to accept the full expected `{planCode, billingInterval}` option in the exact signatures above and compare both fields after the lock; add `BILLING_OPTION_CHANGED` to the typed error codes. Update every direct caller, including all five `billing-recovery-cas.test.ts` calls, without moving selection into `RecoveryRequest`. Preserve the existing actor-first billing-manager scope, row lock, active-attempt reuse, exact attempt price, and idempotency key.

    In both `createCheckoutSession` and `startNewCheckoutAttempt`:

    const selection = {
      plan: membership.planCode,
      billingInterval: membership.billingInterval,
    };
    const priceReference = await dependencies.priceForOption(selection);

    Pass the same `{planCode: membership.planCode, billingInterval: membership.billingInterval}` expectation into `claimActive` and `startNewAttempt`. Extend `RecoveryRequest` with no caller-controlled option fields; the service supplies the expected durable option separately so a request cannot select price or interval.

    The default `priceForOption` resolves Task 1's catalog option and returns a price only for `billingBehavior: "checkout"` with a non-null server reference. It throws `STRIPE_PRICE_NOT_CONFIGURED` otherwise. Never read plan or interval from URL input.

    Replace the pending-only Join loader with `loadJoinMembershipState`. It returns only a member-owned membership linked to an actor-scoped application with equal plan and one compatible pair:

    - `pending_payment` membership with `pending_payment/checkout` application;
    - `pending_review` membership with `pending_review/review` application;
    - `active` membership with `completed/complete` application.

    Keep `CheckoutPage` restricted to `pending_payment` after loading. Make `CompletePage` render processing, review, or active from the durable projection. Ignore `session_id`, `status`, `success`, plan, and interval query keys when choosing state. Keep webhook processing as the only Stripe activation authority.

    Harden the existing `checkout.session.completed` repository transaction in `lib/db/repos/jobs.ts`; do not add a later best-effort application repair and do not move ownership into the delegation-only webhook service. Split the locked lookup by event kind: checkout uses an `INNER JOIN` to its required linked application and `FOR UPDATE OF memberships, membership_applications`, while non-checkout lifecycle events preserve the current `LEFT JOIN`/nullable application path and membership-only lock. For checkout, validate exact event/application/membership IDs, equal plan and target lineage, plus existing Stripe Session/Customer/Subscription/active-attempt correlation under lock. Read the latest lifecycle audit and compute the existing `(stripeCreated,eventId)` stale ordering before enforcing non-stale lifecycle/application predecessor compatibility. A stale event performs no membership/application/attempt/journey projection; inside the same transaction it inserts only `stripe.webhook.ignored_stale`, marks the job completed, and returns `processed`. A non-stale event preserves `lifecycleSources(command)` and requires the coherent current application pair named in Step 1. Call Task 2's mapper for next status `active`; update membership activation fields and application `completed/complete`, complete the attempt, insert the pure builder's activation rows with `anchor = new Date(command.eventCreated * 1000)` and `ON CONFLICT DO NOTHING`, verify every exact key and scheduled timestamp, insert `stripe.webhook.processed`, and mark the claimed job completed—all before the one transaction commits. Same-event claim duplication remains the idempotent replay. Correlation errors roll the claim back and deliberately bypass failed-job recording; transient statement failures roll the transaction back and retain the existing redacted failed-job fallback. Thus no successful non-stale checkout can expose an active membership with a stale application, and the frozen duplicate/stale/audit/job semantics remain unchanged.

    Implement `webhook-postgres-safety.ts` as a test-only pure guard with no production/provider import. Require exact sentinel `PR6_WEBHOOK_POSTGRES_ALLOW_DESTRUCTIVE=PR6_ISOLATED_WEBHOOK_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL` and standard `DATABASE_URL`, `DATABASE_URL_TEST`, canonical TLS, exact `PR6_WEBHOOK_TEST_DB_HOST`, independently exact `NEON_PROJECT_ID === PR6_WEBHOOK_TEST_NEON_PROJECT_ID`, and a non-production host/project label before constructing a Pool. The integration file performs that guard before a dynamic repository import; `webhook-postgres-test-db.ts` creates the sole Pool/Drizzle handle, installs the exact client-module mock, records that the default loader never evaluates, and exposes only the named lock barrier/failpoints. Read-only validate/fingerprint the canonical Startup plan; prove all run-key predicates absent; insert one complete run-owned member profile followed by its application, membership, and active attempt; execute the real mocked-to-guarded repository SQL; and use two independent tracked contender connections: one updates only the run-owned `memberships` row and one updates only the run-owned `membership_applications` row. After the production transaction reaches a named after-both-locks barrier, require both contenders to remain blocked for the full bounded observation window; release the production barrier deterministically, observe both contenders resume, and explicitly roll back both before cleanup. Its aggregate `finally` cancels/rolls back/releases all tracked connections, removes exact run-owned audit/job/journey/attempt/membership/application/profile rows in FK-safe order, verifies zero residue, rechecks the untouched plan fingerprint, restores mocks, and closes the Pool under independent deadlines. Unit tests cover ambient-standard rejection, mock-before-import ordering, default-loader invocation, cross-database handle mismatch, profile/auth/email/run-key collisions, missing or altered plan, barrier never reached, premature second update, lock/statement timeout, each named failpoint, every partial insert/transaction failure, independent cleanup continuation, connection leakage, and plan-drift preservation. It never creates an Auth user, mutates a plan, migrates, seeds shared data, contacts Stripe/Vercel/Neon APIs, selects an arbitrary existing profile, or runs without separate database-mutation approval.

    Pass locale from Portal billing to `createBillingPortalSession` and build the return URL with `localizedPath(locale, "/portal/billing")`.

    Use the already-passing shared managed runtime from Step 3 and make `tests/fixtures/m2-runtime-env.ts` delegate/re-export its neutral parent/runner/Next helpers without weakening existing M2 names. Implement `m1-live-acceptance.ts` as a test-only fail-closed harness. `missingM1ParentEnvironment(originalEnvironment)` covers every Task 12 M1 operator input; the outer launcher applies it plus managed-loopback, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M1_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID`/test-project, independently allowlisted non-production Neon/TLS identity, allowlisted HTTPS inbox/auth-link origins, three distinct test emails, and `sk_test_` checks before sanitizing. `missingM1LiveRunnerEnvironment(process.env)` requires only the active sentinel, retained test sources, `DATABASE_URL_TEST`, and exact M1 `PR6_MANAGED_*` target/attestation; it rejects standard `APP_URL`, `DATABASE_URL`, and `NEON_PROJECT_ID`, then `requireM1LiveRunnerEnvironment` returns the typed target used for Pool/origin/project comparisons. Pure runner checks precede Pool; one guarded read-only DB preflight then proves the two exact member profile mappings and clean owner boundary before any other client or mutation. The durable Startup option must have `seatLimit >= 2`. Replace the unconditional always-skip case with one isolated serial describe whose skip condition is exactly `missingM1LiveRunnerEnvironment(process.env).length > 0`, apply `M1_LIVE_TEST_TIMEOUT_MS` before the live body, and set `M1_CLEANUP_TIMEOUT_MS` at aggregate-hook entry; a parent failure prevents runner launch, while a runner skip or timeout remains `NOT PASSED`.

    After guarded DB preflight and before browser authentication, snapshot every owner/invitee profile column and record `runStartedAt`. Retrieve both configured Stripe test Prices and require active annual recurring HKD values. Tag every disposable DB row with one `runId`. Maintain both ledgers. Start Session ownership from the attempt-attached Session when present; otherwise, whenever the provider boundary may have been crossed, run the bounded read-only recovery search above before DB deletion. Require Session/Subscription metadata exactly `{membershipId, applicationId, planCode}` and prove attempt ID only through the guarded billing-attempt row. Record exact reachable provider lineage and named immutable residuals; do not add test-only production metadata or widen the strict webhook schema.

    Request the owner's real test-mode Neon magic link, retrieve it without dereferencing, navigate exactly once in a fresh browser context, validate its redirect chain/final managed origin, complete run-ID-marked profile/company onboarding, prove durable annual option and exact Startup Price, and complete Stripe test checkout. Register every authenticated context with the shared managed-session owner; a success-path sign-out calls its idempotent revoke/verify/close operation, while aggregate cleanup owns any unfinished context. Retrieve the exact owned Session and Subscription from the test API, build one supported `checkout.session.completed` event with a unique run-owned event ID and the retrieved test objects, serialize one exact raw body, generate its valid Stripe signature with `STRIPE_TEST_WEBHOOK_SECRET`, and POST it to the real managed-origin `/api/stripe/webhook` route. Require `processed` behavior, durable membership activation, exact `completed/complete` application projection, exact completed job/audit/journey ledger rows, then replay the identical signed body and require idempotent duplicate behavior with no second audit or mutation. Do not wait for external Stripe delivery and do not create a tunnel or mutate webhook endpoint/provider configuration. Render active completion, open locale-correct Billing Portal, and verify receipts/secondary pages. Before invitation, require the invitee is not already in the exact run-owned company and its exact active member count is one; then invite `M1_TEST_INVITEE_EMAIL`, capture the exact invitation/request time, finish the owner session through the shared revoke/anonymous-verify/close registry.

    Open a fresh isolated browser context, retrieve the new invitee message without dereferencing, navigate to its exact HTTPS auth link once, validate the allowed redirect chain and final managed `/portal/company/seats/accept?token=...` path, and verify exactly one company-member row for the snapshotted invitee plus exact accepted invitation and active count two. Replay the already-consumed application callback state through the browser and require localized safe error/no second membership; never prefetch the one-time auth link. Finish that invitee session through the same registry. Reopen a fresh owner context through a newly retrieved owner link navigated once, insert exactly `seatLimit - 2` run-owned synthetic members, require active count equals `seatLimit`, then prove the distinct overflow invitation fails with no row and no inbox message through the bounded window. Record identity checkpoints after every authenticated/profile mutation and finish the last owner session through the same registry.

    `afterAll` runs after success or failure with independent nested `try/finally` phases and one aggregate error. First finish every registered session by attempting real sign-out, proving anonymous state, and closing its context; aggregate failures and stop all new authenticated requests before profile restoration. Poll the full owner/invitee rows to the required pre-restore quiet window so fire-and-forget `touchLastLogin` writes drain or the cleanup fails boundedly. The Stripe phase collects attached or safely recovered lineage, expires/terminal-verifies the owned Checkout Session, cancels/terminal-verifies the owned Subscription, and deletes the disposable Customer only after subscription disposition; incomplete or ambiguous recovery is reported and never blocks later phases. Immutable completed Sessions, Invoices, PaymentIntents, Charges, sanitized Portal evidence, and mailbox IDs remain named retained evidence. Never mutate configured Prices, webhook endpoint/configuration, pre-existing auth users, or immutable provider records.

    In an independent database `finally`, capture and validate the exact signed-event job, processed audit, and webhook-created journey rows before deleting anything. Delete the exact owned webhook audit first, then exact job, then the run-owned Join/company/membership/invitation/seat/synthetic-profile graph; verify zero ledger rows and residue, including accepted invitee company membership, while never deleting the invitee profile or unrelated memberships. A failed webhook may have only the exact failed job and no audit; preserve unexpected candidates. In the final identity `finally`, perform compare-and-swap restoration with bounded retries, external-drift preservation, and the post-restore quiet window described above for both identities independently. Any provider, DB, or one-identity failure must not prevent another safe phase. Fail for incomplete required Session/Subscription/Customer/job/audit/journey/database/identity cleanup, recovery ambiguity, drift, or seat/invitation residue; retained immutable evidence is expected.

- [ ] **Step 5: Run GREEN and prove the M1 harness can reach an authorized isolated result**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-vitest-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/m4c-readonly-preview-safety.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-checkout-locking.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/portal-billing-actions.test.tsx tests/unit/webhook-postgres-safety.test.ts tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/m1-acceptance-services.test.ts tests/unit/m1-live-acceptance-safety.test.ts

    Expected: PASS. Price selection uses the durable pair; paid membership/application/attempt/journey/audit/job completion is one locked transaction with exact duplicate, stale, correlation, and transient-failure behavior; all seven completion states are actor-scoped; and forged success never activates/selects state. The real Playwright-CLI probe proves canonical shell routing and exact default-key handling; the runner has no ambient/live capability; the locked Next loader proves exact post-dotenv guarded mappings with telemetry disabled; and the browser gets its own capability-free launch environment. Every authenticated context is revoked/verified before close without disk state or traces; M1 live/cleanup budgets exceed every bounded inbox/provider/cleanup window; every unsafe M1 identity/environment fails at its correct pure or guarded-DB phase; and provider/database/profile cleanup remains independent under injected failures including orphan Session recovery, transient webhook residue, correlation rejection, delayed login touches, and a timed-out live body.

    Run the separately gated real-PostgreSQL contract:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-vitest.mjs webhook-postgres

    Expected without the exact gate: the launcher refuses before Vitest and records `NOT PASSED`. With separate database-mutation approval and the complete isolated target: PASS only when the pure guard runs before dynamic repository import, the default database client never evaluates, fixtures and production SQL share the one mocked guarded Drizzle handle, the canonical Startup-plan fingerprint is unchanged, the complete synthetic profile graph is owned, a deterministic after-both-locks barrier proves two independent contenders—membership-only and application-only—both block until release and are explicitly rolled back, named audit/job failpoints fully roll back, every connection closes, and zero run-owned residue remains.

    First run only the deterministic/anonymous M1 cases through the capability-free route:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/m1-acceptance.spec.ts

    Expected: deterministic fixture cases PASS; the isolated live describe skips and is explicitly `NOT PASSED` as managed acceptance. This command contains no M1 provider/database/Auth capability.

    Only with separate provider/database mutation approval and every M1 input, run the exact manifest-owned mode:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m1

    Expected without the complete gate: the launcher refuses before build/Playwright and records `NOT PASSED`; no deterministic fallback runs under a partial managed environment. With the complete gate, the command must execute against the managed server, navigate each retrieved magic link exactly once, inject/replay the valid locally signed webhook through the real route, prove distinct-invitee acceptance/capacity denial, recover any attach-failure Session safely, clean exact webhook job/audit/journey residue, restore both profile snapshots through quiet-window CAS, record named immutable provider/mailbox evidence, and PASS. A skip, timeout, ambiguity, unclassified residual, or incomplete cleanup never becomes passing evidence; the explicitly named immutable completed-Session/Invoice/PaymentIntent/Charge/Portal/mailbox evidence is retained.

- [ ] **Step 6: Commit the durable billing slice**

    & $verifiedGit add -- ':(literal)playwright.config.ts' ':(literal)next.config.ts' ':(literal)scripts/managed-runtime-environment.mjs' ':(literal)scripts/managed-runtime-environment.d.mts' ':(literal)scripts/run-managed-playwright.mjs' ':(literal)scripts/run-managed-next.mjs' ':(literal)scripts/run-managed-vitest.mjs' ':(literal)tests/fixtures/managed-process-env-probe.mjs' ':(literal)tests/unit/managed-vitest-process-boundary.test.ts' ':(literal)tests/fixtures/managed-webserver-probe.mjs' ':(literal)tests/fixtures/managed-webserver-boundary.spec.ts' ':(literal)tests/fixtures/managed-webserver-probe.playwright.config.ts' ':(literal)tests/fixtures/managed-next-env-probe.mjs' ':(literal)tests/unit/managed-runtime-process-boundary.test.ts' ':(literal)tests/unit/managed-webserver-boundary.test.ts' ':(literal)tests/unit/managed-next-environment-boundary.test.ts' ':(literal)tests/unit/credential-free-verification-boundary.test.ts' ':(literal)tests/unit/managed-next-production-boundary.test.ts' ':(literal)tests/unit/managed-browser-process-boundary.test.ts' ':(literal)tests/fixtures/isolated-runtime-env.ts' ':(literal)tests/unit/isolated-runtime-environment.test.ts' ':(literal)tests/fixtures/managed-auth-session.ts' ':(literal)tests/unit/managed-auth-session.test.ts' ':(literal)tests/fixtures/m4c-readonly-preview-safety.ts' ':(literal)tests/fixtures/m4c-readonly-request-manifest.ts' ':(literal)tests/unit/m4c-readonly-preview-safety.test.ts' ':(literal)tests/fixtures/m2-runtime-env.ts' ':(literal)lib/billing/checkout-service.ts' ':(literal)lib/db/repos/billing-attempts.ts' ':(literal)lib/db/repos/jobs.ts' ':(literal)lib/membership/join-billing-state.ts' ':(literal)app/[locale]/(join)/join/checkout/page.tsx' ':(literal)app/[locale]/(join)/join/complete/page.tsx' ':(literal)app/[locale]/(member)/portal/billing/page.tsx' ':(literal)components/billing/checkout-status.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/fixtures/m1-live-acceptance.ts' ':(literal)tests/unit/m1-live-acceptance-safety.test.ts' ':(literal)tests/fixtures/webhook-postgres-safety.ts' ':(literal)tests/fixtures/webhook-postgres-test-db.ts' ':(literal)tests/unit/webhook-postgres-safety.test.ts' ':(literal)tests/integration/webhook-join-projection-postgres.test.ts' ':(literal)tests/unit/checkout-service.test.ts' ':(literal)tests/unit/checkout-recovery-service.test.ts' ':(literal)tests/unit/billing-checkout-locking.test.ts' ':(literal)tests/unit/billing-recovery-cas.test.ts' ':(literal)tests/unit/join-billing-pages.test.tsx' ':(literal)tests/unit/portal-billing-actions.test.tsx' ':(literal)tests/unit/webhook-service.test.ts' ':(literal)tests/unit/webhook-repository-sequential.test.ts' ':(literal)tests/unit/m1-acceptance-services.test.ts' ':(literal)tests/e2e/m1-acceptance.spec.ts' ':(literal)tests/e2e/m4c-aiops.spec.ts'
    & $verifiedGit commit -m "feat: project durable billing state"

### Task 5: Lock the one-time seat invitation callback at route level

**Files:**

- Create: `app/[locale]/(member)/portal/company/seats/actions.ts`, `lib/portal/seat-invitation-callback.ts`.
- Modify: `app/[locale]/(member)/portal/company/seats/page.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`.
- Create test: `tests/unit/seat-invitation-routes.test.tsx`.
- Modify tests: `tests/unit/seat-service.test.ts`, `tests/e2e/seat-management.spec.ts`.

**Interfaces:**

- Consumes: existing `inviteSeat`, `revokeInvitation`, `acceptSeatInvitation`, `auth.signIn.magicLink`, `requireActor`, `appEnv().appUrl`, and `SeatServiceError`.
- Produces no new endpoint, identity store, or callback handler. `app/[locale]/(member)/portal/company/seats/actions.ts` begins with `"use server"` and exports the existing `inviteSeatAction(formData: FormData)`; `lib/portal/seat-invitation-callback.ts` begins with `import "server-only"` and exports `invitationCallbackUrl(appUrl: string, locale: AppLocale, token: string): string`. The page imports those seams and exports only Next-supported page-module fields.

- [ ] **Step 1: Write failing invitation delivery, identity, replay, expiry, and revocation tests**

    In `seat-invitation-routes.test.tsx`, import `inviteSeatAction` from the adjacent `actions.ts`, import `invitationCallbackUrl` from its server-only module, import only the acceptance page's default component from `page.tsx`, mock the current repository/auth boundaries, and assert:

    await expect(inviteSeatAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(auth.signIn.magicLink).toHaveBeenCalledWith({
      email: "invitee@example.test",
      callbackURL:
        "https://preview.example.test/zh/portal/company/seats/accept?token=opaque-token",
    });
    expect(auth.signIn.magicLink.mock.calls[0][0].callbackURL)
      .not.toContain("/member-login");

    Render `SeatInvitationAcceptancePage` with one scalar token and assert it calls:

    expect(acceptSeatInvitation).toHaveBeenCalledWith(
      {kind: "member", userId: "auth-user", profileId: "invitee-profile"},
      "opaque-token",
    );

    Add multi-valued/missing token tests that do not call the repository. Map `INVITATION_ALREADY_ACCEPTED`, `INVITATION_EXPIRED`, `INVITATION_REVOKED`, and `INVITATION_EMAIL_MISMATCH` to the same localized safe error without exposing the code.

    In `seat-service.test.ts`, add actual disposable-service cases by mutating the in-memory invitation:

    - with `vi.useFakeTimers()` and `vi.setSystemTime(now)`, `expiresAt` equal to or earlier than `now` rejects `INVITATION_EXPIRED`;
    - non-null `revokedAt` rejects `INVITATION_REVOKED`;
    - second acceptance rejects `INVITATION_ALREADY_ACCEPTED`;
    - a profile/session email different from `invitedEmail` rejects `INVITATION_EMAIL_MISMATCH` before membership insert.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts

    Expected: FAIL because the valid adjacent Server Action and callback-builder modules do not exist and the route-level delegation/token invariants are not covered. Do not make a Next page module export arbitrary helpers to satisfy RED.

- [ ] **Step 3: Make the existing route seams testable without creating a second flow**

    Move the existing invite Server Action, without widening behavior, to the adjacent `"use server"` `actions.ts`. Move URL construction to the server-only callback module and pass `appEnv().appUrl` from the action. Import the action into the seats page; do not export either helper from `page.tsx`. Keep the production call sequence unchanged:

    1. require the current actor;
    2. create or reuse the actor-authorized invitation;
    3. for a newly returned token, send one Neon magic link to the dedicated acceptance callback;
    4. revoke that exact invitation if delivery fails;
    5. redirect to the localized seats page or its sanitized error state.

    Keep the acceptance page's one scalar token parser and direct `acceptSeatInvitation(actor, token)` call. Do not route through member-login, store the plaintext token, add another callback, or call a live provider in tests.

- [ ] **Step 4: Run GREEN and the credential-free protected-route check**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts

    Expected: PASS with disposable in-memory state and mocked Neon delivery.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/seat-management.spec.ts

    Expected: anonymous seat management reaches `/member-login` with `next=/portal/company/seats`; the acceptance-token route is not placed in generic continuation.

- [ ] **Step 5: Commit the invitation regression slice**

    & $verifiedGit add -- ':(literal)app/[locale]/(member)/portal/company/seats/actions.ts' ':(literal)lib/portal/seat-invitation-callback.ts' ':(literal)app/[locale]/(member)/portal/company/seats/page.tsx' ':(literal)app/[locale]/(member)/portal/company/seats/accept/page.tsx' ':(literal)tests/unit/seat-invitation-routes.test.tsx' ':(literal)tests/unit/seat-service.test.ts' ':(literal)tests/e2e/seat-management.spec.ts'
    & $verifiedGit commit -m "test: lock seat invitation callback"

### Task 6: Build shared internal-shell primitives and grouped navigation

**Files:**

- Create: `config/internal-navigation.ts`.
- Create: `components/internal-shell/internal-app-shell.tsx`, `components/internal-shell/internal-navigation.tsx`, `components/internal-shell/internal-page-header.tsx`, `components/internal-shell/internal-section.tsx`, `components/internal-shell/internal-status-badge.tsx`, `components/internal-shell/internal-table-frame.tsx`, `components/internal-shell/internal-empty-state.tsx`, `components/internal-shell/internal-action-feedback.tsx`, `components/internal-shell/index.ts`.
- Create tests: `tests/unit/internal-navigation.test.tsx`, `tests/unit/internal-shell.test.tsx`, `tests/unit/wisetech-pr6-route-inventory.test.ts`.
- Modify: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Produces:

    export type InternalNavigationItem = Readonly<{
      id: string;
      href: string;
      label: string;
      match: "exact" | "prefix";
    }>;
    export type InternalNavigationGroup = Readonly<{
      id: string;
      label: string;
      items: readonly InternalNavigationItem[];
    }>;
    export function activeInternalNavigationItem(
      pathname: string,
      groups: readonly InternalNavigationGroup[],
    ): string | null;
    export function InternalNavigation(props: Readonly<{
      variant: "compact" | "application";
      groups: readonly InternalNavigationGroup[];
      labels: Readonly<{navigation: string; open: string; close: string}>;
      footer?: ReactNode;
    }>): ReactNode;
    export function InternalAppShell(props: Readonly<{
      variant: "join" | "portal" | "admin";
      skipLabel: string;
      brand: Readonly<{href: string; label: string}>;
      navigation?: ReactNode;
      utility?: ReactNode;
      afterMain?: ReactNode;
      children: ReactNode;
    }>): ReactNode;

- `InternalNavigation` accepts grouped localized data, mobile open/close labels, and optional footer content. `InternalAppShell` owns the sole `main#main-content` and skip target.

- [ ] **Step 1: Write failing route-inventory, active-route, drawer, landmark, and primitive tests**

    In the inventory test, derive App Router paths from tracked page files and require the exact final sets:

    const joinRoutes = [
      "/join", "/join/profile", "/join/company", "/join/checkout",
      "/join/complete", "/member-login",
    ];
    const portalRoutes = [
      "/portal", "/portal/profile", "/portal/company",
      "/portal/company/listing", "/portal/company/seats",
      "/portal/company/seats/accept", "/portal/directory", "/portal/events",
      "/portal/documents", "/portal/billing",
    ];
    const adminRoutes = [
      "/admin", "/admin/members", "/admin/members/[id]", "/admin/at-risk",
      "/admin/segments", "/admin/announcements", "/admin/announcements/[id]",
      "/admin/news", "/admin/news/[id]", "/admin/page-copy",
      "/admin/page-copy/[namespace]", "/admin/media", "/admin/media/[id]",
      "/admin/partners", "/admin/partners/[id]", "/admin/landing-partners",
      "/admin/landing-partners/[id]", "/admin/events-mgmt",
      "/admin/events-mgmt/[id]", "/admin/listings-review", "/admin/cohorts",
      "/admin/cohorts/[id]", "/admin/approvals", "/admin/reports",
      "/admin/reports/board-drafts/[id]", "/admin/automations",
    ];

    Assert the Portal navigation has eight primary items, Admin has sixteen entries grouped 4/6/6, seats are not primary, and `/portal/showcase` is absent.

    Active-state tests:

    expect(activeInternalNavigationItem("/portal", portalGroups)).toBe("dashboard");
    expect(activeInternalNavigationItem("/portal/company/listing", portalGroups))
      .toBe("showcase-listing");
    expect(activeInternalNavigationItem("/portal/company/seats", portalGroups))
      .toBe("company");
    expect(activeInternalNavigationItem("/admin/reports/board-drafts/a", adminGroups))
      .toBe("reports");
    expect(activeInternalNavigationItem("/portal/companyish", portalGroups))
      .toBeNull();
    expect(activeInternalNavigationItem("/admin/reports-old", adminGroups))
      .toBeNull();

    Render tests require one skip link, one `main#main-content`, named grouped navigation, `aria-current="page"` only on the most-specific item, 44 px target classes, table-local horizontal scrolling, and `role="alert"` only for error feedback.

    In JSDOM, open the mobile Sheet, press Escape, await close, and assert focus returns to the trigger.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts

    Expected: FAIL because no internal-shell family or grouped navigation configuration exists.

- [ ] **Step 3: Implement presentation-only primitives**

    Put stable href/id/match data in `config/internal-navigation.ts` and localize labels in layouts. Dashboard uses `match: "exact"`. A prefix item matches only when `pathname === href || pathname.startsWith(href + "/")`; then `activeInternalNavigationItem` chooses the matching item with the longest href, so listing wins over company and reports own Board drafts without near-prefix false positives.

    `InternalNavigation` is a Client Component using the existing `Sheet`, `SheetTrigger`, `SheetContent`, `SheetClose`, and localized `usePathname`. Render the same groups in a desktop sidebar and mobile Sheet. Wrap each mobile link in `SheetClose asChild`. Let Radix handle Escape and focus restoration; do not add document-level key listeners.

    `InternalAppShell` renders:

    <div data-internal-shell={variant} className="min-h-screen bg-shell-canvas text-shell-ink">
      <a className="skip-link" href="#main-content">{skipLabel}</a>
      <header>{brand link, mobile navigation trigger, utility}</header>
      <div className={variant === "join" ? "mx-auto max-w-3xl" : "lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]"}>
        {navigation}
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
      {afterMain}
    </div>

    Use existing `--shell-*` Tailwind tokens and `Button`/`Sheet`; add no new CSS token or dependency.

    Implement the remaining primitives as semantic wrappers:

    - `InternalPageHeader`: one supplied H1, optional eyebrow/description/actions.
    - `InternalSection`: labelled `section` with optional H2 and description.
    - `InternalStatusBadge`: text plus tone, never color alone.
    - `InternalTableFrame`: labelled wrapper with `overflow-x-auto`; it never rewrites table semantics.
    - `InternalEmptyState`: H2 or H3 chosen explicitly by prop, description, optional action.
    - `InternalActionFeedback`: `role="alert"` for error and `role="status"` for success/pending.

- [ ] **Step 4: Run GREEN and the import-boundary test**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts tests/unit/public-shell-tokens.test.ts

    Expected: PASS in both message catalogs with exact inventories, active states, landmarks, drawer behavior, and existing token coverage.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs audit-strings -- internal-shell-public-imports

    Expected: zero hits.

- [ ] **Step 5: Commit the primitive slice**

    & $verifiedGit add -- ':(literal)config/internal-navigation.ts' ':(literal)components/internal-shell/internal-app-shell.tsx' ':(literal)components/internal-shell/internal-navigation.tsx' ':(literal)components/internal-shell/internal-page-header.tsx' ':(literal)components/internal-shell/internal-section.tsx' ':(literal)components/internal-shell/internal-status-badge.tsx' ':(literal)components/internal-shell/internal-table-frame.tsx' ':(literal)components/internal-shell/internal-empty-state.tsx' ':(literal)components/internal-shell/internal-action-feedback.tsx' ':(literal)components/internal-shell/index.ts' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/internal-navigation.test.tsx' ':(literal)tests/unit/internal-shell.test.tsx' ':(literal)tests/unit/wisetech-pr6-route-inventory.test.ts'
    & $verifiedGit commit -m "feat: add internal application shell"

### Task 7: Apply the compact transactional shell to Join and member login

**Files:**

- Modify: `app/[locale]/(join)/layout.tsx`.
- Modify: `app/[locale]/(join)/join/page.tsx`, `app/[locale]/(join)/join/profile/page.tsx`, `app/[locale]/(join)/join/company/page.tsx`, `app/[locale]/(join)/join/checkout/page.tsx`, `app/[locale]/(join)/join/complete/page.tsx`, `app/[locale]/(join)/member-login/page.tsx`.
- Modify: `components/join/join-form.tsx`, `components/join/progress.tsx`, `components/billing/checkout-status.tsx`.
- Create test: `tests/unit/wisetech-pr6-join-shell.test.tsx`.
- Modify tests: `tests/unit/join-page.test.tsx`, `tests/unit/join-billing-pages.test.tsx`, `tests/unit/member-login-page.test.tsx`, `tests/unit/page-indexability.test.ts`, `tests/unit/locale-switcher.test.tsx`, `tests/e2e/join-auth.spec.ts`. Task 2 owns its interval-valid/invalid journey semantics; Task 7 adds only shell, locale, viewport, overflow, and forged-presentation assertions to the already-GREEN suite.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: Task 6 `InternalAppShell`, `InternalNavigation`, `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, the existing `LocaleSwitcher` and `Navigation` locale-label authority, Task 2 Join outcomes, and Task 3 member login.
- Produces no new Join reader, action, repository, auth, or billing owner.

- [ ] **Step 1: Write the failing Join shell/rendering contract**

    The test reads all six transactional page sources and renders representative entry, profile, company, processing, review, active, invalid-plan, invalid-continuation, and sent states. Require:

    - the layout imports `@/components/internal-shell` and no public shell/navigation component;
    - exactly one `main#main-content` comes from the layout;
    - one visible H1 per rendered page state;
    - the skip link targets `#main-content`;
    - WTIA home and Membership links are locale-correct;
    - the existing `LocaleSwitcher` is mounted through `InternalAppShell.utility`;
    - switching EN to zh-HK and zh-HK to EN on `/join?plan=startup&interval=annual#join-form` retains the exact pathname, serialized query, and hash passed to the locale-aware router;
    - form field names, labels, hidden/bound context, action functions, and `JoinProgress` step order remain unchanged;
    - input/button targets retain `min-h-11`;
    - invalid plan/interval/continuation states have localized recovery and make no repository/provider call.

    Add the exact browser URLs:

    /join?plan=startup&interval=annual
    /zh/join?plan=startup&interval=annual
    /member-login
    /zh/member-login

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts tests/unit/locale-switcher.test.tsx

    Expected: FAIL because the transactional layout still owns bespoke markup and Join states do not use internal presentation primitives.

- [ ] **Step 3: Adopt the compact shell without changing behavior owners**

    Replace the layout frame with `InternalAppShell variant="join"`. Load the existing `Navigation` locale labels, mount one existing `LocaleSwitcher` through `InternalAppShell.utility`, and pass localized skip, brand, home, and Membership labels. Use the compact navigation variant for the two locale-correct links; do not mount the public header, public footer, or mega menu.

    Replace each page's repeated card header/state markup with the exact semantic primitive:

    | Route | Primitive use |
    | --- | --- |
    | `/join` | `InternalPageHeader` plus `InternalActionFeedback` for invalid/sent/provider state |
    | `/join/profile` | `InternalPageHeader` and `InternalSection` around the existing form |
    | `/join/company` | `InternalPageHeader` and `InternalSection` around the existing form |
    | `/join/checkout` | layout only; it remains a server redirect after actor/state validation |
    | `/join/complete` | `InternalPageHeader` plus durable `InternalStatusBadge`/`CheckoutStatus` |
    | `/member-login` | `InternalPageHeader`, `InternalSection`, and `InternalActionFeedback` |

    Preserve every field name, autocomplete value, action binding, query contract, metadata `index: false` setting, and server redirect from Tasks 2-4. Presentation components receive localized strings only.

- [ ] **Step 4: Run GREEN and credential-free bilingual Join checks**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/join-page.test.tsx tests/unit/join-billing-pages.test.tsx tests/unit/member-login-page.test.tsx tests/unit/page-indexability.test.ts tests/unit/locale-switcher.test.tsx

    Expected: PASS with one H1/main, exact form/action contracts, no public-shell import, one utility locale switcher, and exact EN/zh-HK path/query/hash retention.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/join-auth.spec.ts

    Expected: PASS at widths below 400 px in English and Chinese; no provider call occurs during render/validation, no horizontal document overflow appears, and forged status input does not create a terminal state.

- [ ] **Step 5: Commit the Join presentation slice**

    & $verifiedGit add -- ':(literal)app/[locale]/(join)/layout.tsx' ':(literal)app/[locale]/(join)/join/page.tsx' ':(literal)app/[locale]/(join)/join/profile/page.tsx' ':(literal)app/[locale]/(join)/join/company/page.tsx' ':(literal)app/[locale]/(join)/join/checkout/page.tsx' ':(literal)app/[locale]/(join)/join/complete/page.tsx' ':(literal)app/[locale]/(join)/member-login/page.tsx' ':(literal)components/join/join-form.tsx' ':(literal)components/join/progress.tsx' ':(literal)components/billing/checkout-status.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-join-shell.test.tsx' ':(literal)tests/unit/join-page.test.tsx' ':(literal)tests/unit/join-billing-pages.test.tsx' ':(literal)tests/unit/member-login-page.test.tsx' ':(literal)tests/unit/page-indexability.test.ts' ':(literal)tests/unit/locale-switcher.test.tsx' ':(literal)tests/e2e/join-auth.spec.ts'
    & $verifiedGit commit -m "feat: align transactional join shell"

### Task 8: Apply the application shell to all Portal pages and fail closed on ambiguous company context

**Files:**

- Create: `lib/portal/company-context.ts`, `tests/unit/portal-company-context.test.ts`, `tests/unit/wisetech-pr6-portal-shell.test.tsx`.
- Modify: `app/[locale]/(member)/portal/layout.tsx`, `components/portal/portal-nav.tsx`.
- Modify all ten Portal pages: `app/[locale]/(member)/portal/page.tsx`, `app/[locale]/(member)/portal/profile/page.tsx`, `app/[locale]/(member)/portal/company/page.tsx`, `app/[locale]/(member)/portal/company/listing/page.tsx`, `app/[locale]/(member)/portal/company/seats/page.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`, `app/[locale]/(member)/portal/directory/page.tsx`, `app/[locale]/(member)/portal/events/page.tsx`, `app/[locale]/(member)/portal/documents/page.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`.
- Modify presentation components: `components/portal/status-card.tsx`, `components/portal/directory-results.tsx`, `components/portal/document-list.tsx`, `components/portal/event-registration-form.tsx`, `components/portal/seat-invite-form.tsx`, `components/portal/seat-table.tsx`, `components/portal/showcase-listing-form.tsx`, `components/billing/billing-actions.tsx`.
- Modify tests: `tests/unit/portal-presentational.test.tsx`, `tests/unit/portal-content-scope.test.ts`, `tests/unit/portal-content-runtime-authorization.test.ts`, `tests/unit/portal-billing-actions.test.tsx`, `tests/unit/m5-member-listing.test.tsx`, `tests/unit/concierge-layouts.test.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Produces:

    export type PortalCompanyContext =
      | Readonly<{kind: "ready"; company: DashboardCompany}>
      | Readonly<{kind: "empty"}>
      | Readonly<{kind: "multiple"}>;
    export function selectPortalCompanyContext(
      companies: readonly DashboardCompany[],
    ): PortalCompanyContext;

- [ ] **Step 1: Write failing Portal shell, navigation, company-context, and owner-preservation tests**

    Assert exact eight-item navigation order, grouped semantics, Dashboard exact active state, Listing most-specific active state, seats owned by Company, mobile Sheet focus return, sign-out in both responsive surfaces, and one existing `LocaleSwitcher` mounted through the shell utility. Exercise EN to zh-HK and zh-HK to EN on `/portal/company/listing?status=draft#listing` and retain the exact pathname, serialized query, and hash.

    Assert every Portal page source:

    - remains under the authorized Portal layout;
    - imports no public shell;
    - keeps its current reader/action owner names;
    - uses at least one appropriate internal primitive;
    - contains no Drizzle/server-schema import in a Client Component;
    - does not introduce `/portal/showcase`.

    Company-context tests:

    expect(selectPortalCompanyContext([])).toEqual({kind: "empty"});
    expect(selectPortalCompanyContext([companyA]))
      .toEqual({kind: "ready", company: companyA});
    expect(selectPortalCompanyContext([companyA, companyB]))
      .toEqual({kind: "multiple"});

    Render Dashboard, Company, Listing, Seats, and Billing with the same multi-company projection and assert neither company's legal name, company/member status, plan, private listing data, seat email, billing amount/status/reference, receipt, nor company-scoped action form appears. Prove Dashboard never chooses `memberships[0]`. Render one localized selection-required state instead; do not add a selector. Apply the same assertion to every other Portal page found by the source inventory to project company-scoped membership, billing, or private company data before rendering; actor-scoped Profile, Directory, Events, and Documents retain their existing owners unless their current projection crosses that boundary.

    Keep one-company positive tests for Dashboard/Profile/Company/Listing/Seats/Billing, actor-scoped directory cursor, event eligibility, document empty state, billing-manager filtering, receipt safety, and Concierge count exactly one.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/portal-presentational.test.tsx tests/unit/portal-content-scope.test.ts tests/unit/portal-content-runtime-authorization.test.ts tests/unit/portal-billing-actions.test.tsx tests/unit/m5-member-listing.test.tsx tests/unit/concierge-layouts.test.ts

    Expected: FAIL because Portal uses the flat header nav, pages use repeated cards/headers, and Dashboard plus company-scoped Company/Listing/Seats/Billing projections select the first membership/company when more than one authorized company exists.

- [ ] **Step 3: Adopt the Portal shell while keeping every data/action owner**

    Build localized Portal groups from `config/internal-navigation.ts` and render them through `InternalNavigation`. Load existing `Navigation` locale labels and pass one existing `LocaleSwitcher` through `InternalAppShell.utility`; pass `PortalSignOutButton` as navigation footer content. Replace the layout's separate `main` with `InternalAppShell variant="portal"` and pass the existing single Concierge widget as `afterMain`.

    Implement `selectPortalCompanyContext` as a pure length check and call it before any company-scoped data projection. Dashboard, Company, Listing, Seats, Billing, and every source-inventoried Portal page that exposes company-scoped membership/billing/private company data must:

    - render current empty state for zero;
    - use the sole authorized company for one;
    - render localized selection-required state and no private record/action for more than one.

    Apply primitives by owner:

    - dashboard/profile/company: `InternalPageHeader`, `InternalSection`, `InternalStatusBadge`; Dashboard's company-dependent cards consume only the `ready` context and never `memberships[0]`;
    - listing/seats: `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, and `InternalTableFrame` where a table already exists;
    - seat acceptance: `InternalPageHeader` plus `InternalActionFeedback`;
    - directory/events/documents/billing: `InternalPageHeader` plus `InternalTableFrame` or `InternalEmptyState` matching the current result; Billing's plan/status/receipts/actions consume only the `ready` company context.

    Do not change `getDashboard`, profile/company actions, Showcase listing permissions, seat repository rules, directory pagination, event registration action, approved-resource reader, billing ownership, receipt projection, or Concierge runtime.

- [ ] **Step 4: Run GREEN and existing Portal browser gates**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/portal-presentational.test.tsx tests/unit/portal-content-scope.test.ts tests/unit/portal-content-runtime-authorization.test.ts tests/unit/portal-billing-actions.test.tsx tests/unit/m5-member-listing.test.tsx tests/unit/concierge-layouts.test.ts

    Expected: PASS with one main/H1, exact active nav, locale-switch path/query/hash retention, one-company behavior retained, and every Dashboard/company-scoped Portal projection—including Billing—withstanding legal name, membership status, plan, private listing/seat/billing/receipt data, and actions when context is multiple. Actor-scoped pages retain their existing authorization.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts

    Expected: only the credential-free anonymous protection cases PASS. Authenticated presentation cases do not execute in this command and remain `NOT PASSED` until Task 9's separately approved exact `m2` managed mode.

- [ ] **Step 5: Commit the Portal presentation slice**

    & $verifiedGit add -- ':(literal)lib/portal/company-context.ts' ':(literal)app/[locale]/(member)/portal/layout.tsx' ':(literal)components/portal/portal-nav.tsx' ':(literal)app/[locale]/(member)/portal/page.tsx' ':(literal)app/[locale]/(member)/portal/profile/page.tsx' ':(literal)app/[locale]/(member)/portal/company/page.tsx' ':(literal)app/[locale]/(member)/portal/company/listing/page.tsx' ':(literal)app/[locale]/(member)/portal/company/seats/page.tsx' ':(literal)app/[locale]/(member)/portal/company/seats/accept/page.tsx' ':(literal)app/[locale]/(member)/portal/directory/page.tsx' ':(literal)app/[locale]/(member)/portal/events/page.tsx' ':(literal)app/[locale]/(member)/portal/documents/page.tsx' ':(literal)app/[locale]/(member)/portal/billing/page.tsx' ':(literal)components/portal/status-card.tsx' ':(literal)components/portal/directory-results.tsx' ':(literal)components/portal/document-list.tsx' ':(literal)components/portal/event-registration-form.tsx' ':(literal)components/portal/seat-invite-form.tsx' ':(literal)components/portal/seat-table.tsx' ':(literal)components/portal/showcase-listing-form.tsx' ':(literal)components/billing/billing-actions.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/portal-company-context.test.ts' ':(literal)tests/unit/wisetech-pr6-portal-shell.test.tsx' ':(literal)tests/unit/portal-presentational.test.tsx' ':(literal)tests/unit/portal-content-scope.test.ts' ':(literal)tests/unit/portal-content-runtime-authorization.test.ts' ':(literal)tests/unit/portal-billing-actions.test.tsx' ':(literal)tests/unit/m5-member-listing.test.tsx' ':(literal)tests/unit/concierge-layouts.test.ts' ':(literal)tests/e2e/portal-dashboard.spec.ts' ':(literal)tests/e2e/portal-secondary-pages.spec.ts'
    & $verifiedGit commit -m "feat: align member portal shell"

### Task 9: Apply grouped Admin shell to Dashboard and CRM pages

**Files:**

- Modify: `app/[locale]/(admin)/admin/layout.tsx`, `components/admin/admin-nav.tsx`.
- Modify CRM pages: `app/[locale]/(admin)/admin/page.tsx`, `app/[locale]/(admin)/admin/members/page.tsx`, `app/[locale]/(admin)/admin/members/[id]/page.tsx`, `app/[locale]/(admin)/admin/segments/page.tsx`, `app/[locale]/(admin)/admin/at-risk/page.tsx`.
- Modify presentation components: `components/admin/dashboard-tiles.tsx`, `components/admin/member-table.tsx`, `components/admin/member-360.tsx`, `components/admin/member-note-form.tsx`, `components/admin/member-profile-form.tsx`, `components/admin/segment-builder.tsx`, `components/admin/segment-results.tsx`, `components/admin/segment-save-form.tsx`, `components/admin/at-risk-table.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-crm-shell.test.tsx`.
- Modify tests: `tests/unit/admin-presentational.test.tsx`, `tests/unit/admin-dashboard-tiles.test.tsx`, `tests/unit/admin-member-list.test.ts`, `tests/unit/admin-member-page-boundary.test.ts`, `tests/unit/admin-member-profile.test.ts`, `tests/unit/member-note-server-action-boundary.test.ts`, `tests/unit/segment-query.test.ts`, `tests/unit/segment-save-action.test.ts`, `tests/unit/campaign-server-action-auth.test.ts`, `tests/unit/at-risk-repository-boundary.test.ts`, `tests/unit/admin-page-auth.test.ts`, `tests/unit/m2-auth-reset.test.ts`, `tests/unit/m2-runtime-environment.test.ts`, `tests/unit/m2-browser-acceptance-contract.test.ts`.
- Modify isolated fixtures: `tests/fixtures/m2-runtime-env.ts`, `tests/fixtures/m2-auth.ts`, `tests/fixtures/m2-reset.ts`, `tests/e2e/m2-admin-crm.spec.ts`.
- Consume without restaging unless changed here: Task 4 `playwright.config.ts`, `tests/fixtures/isolated-runtime-env.ts`, and `tests/unit/isolated-runtime-environment.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes: Task 6 Admin groups and shell primitives, the existing `LocaleSwitcher` and `Navigation` label authority, every existing Admin CRM reader/action, and the current M2 isolated reset/runtime boundary.
- Produces presentation only. `requireAdminPageActor()` remains at layout/page boundaries; independent Server Actions still call `requireAdminActor()` before parsing or repository access.

- [ ] **Step 1: Write failing grouped-navigation, source-owner, and CRM rendering tests**

    Require Admin groups and order:

    - Workspace: Dashboard, Members, At-risk, Segments.
    - Content: Announcements, News, Page Copy, Media, Partners, Landing Partners.
    - Operations: Events, Listings, Cohorts, Approvals, Reports, Automations.

    Assert Dashboard is a visible link and exact-active only at `/admin`. Assert Member detail inherits Members and no unlisted Admin href appears.

    For the five CRM pages, assert one H1/main, grouped navigation label parity in English/Chinese, one existing `LocaleSwitcher` in `InternalAppShell.utility`, EN to zh-HK and zh-HK to EN retention on `/admin/reports?from=2026-01-01&to=2026-12-31#revenue`, honest independent dashboard degradation, Member 360/note actions, exact segment query/export/campaign contracts, at-risk evidence, and existing auth-before-parse source ordering.

    Task 9 is the first task allowed to edit or launch `m2-admin-crm.spec.ts`. First change its credential-free Portal redirect assertion from `/join?next=/portal` to `/member-login?next=%2Fportal`, then install the complete Task 4 managed sentinel/session boundary before any authenticated reset, login, or storage-state operation can execute. Expand `m2-admin-crm.spec.ts` from its ten-entry sample to the complete inventory. Import `protectedRouteOwnershipInventory`, require exactly 26 `admin` and 19 `api` owners, and materialize every dynamic token through an explicit exhaustive ID-keyed map. `M2_ADMIN_DENIAL_PATHS` contains exactly these concrete pages (the malformed members query remains a separate edge case):

    ```text
    /admin
    /admin/members
    /admin/members/m2-risk-01
    /admin/at-risk
    /admin/segments
    /admin/announcements
    /admin/announcements/00000000-0000-4000-8000-000000000001
    /admin/news
    /admin/news/00000000-0000-4000-8000-000000000001
    /admin/page-copy
    /admin/page-copy/Privacy
    /admin/media
    /admin/media/00000000-0000-4000-8000-000000000001
    /admin/partners
    /admin/partners/00000000-0000-4000-8000-000000000001
    /admin/landing-partners
    /admin/landing-partners/00000000-0000-4000-8000-000000000001
    /admin/events-mgmt
    /admin/events-mgmt/2a000000-0000-4000-8000-000000000001
    /admin/listings-review
    /admin/cohorts
    /admin/cohorts/00000000-0000-4000-8000-000000000001
    /admin/approvals
    /admin/reports
    /admin/reports/board-drafts/00000000-0000-4000-8000-000000000001
    /admin/automations
    ```

    For locale prefixes `""` and `"/zh"`, anonymous, member, and company-admin contexts must receive 404 plus the locale-correct `NotFound` H1 for all 26 pages. Keep anonymous cases in the credential-free describe; member/company-admin cases remain behind the authenticated M2 gate. Run `/admin/members?limit=not-a-number` and its `/zh` peer separately for all three identities so malformed input never weakens auth-first denial.

    Define an exhaustive `M2_PROTECTED_API_DENIAL_CASES` keyed by all 19 API inventory IDs and run it under anonymous, member, and company-admin cookies only inside the separately authorized, fully guarded isolated M2 describe so its before/after database fingerprint is available. Preserve each handler's real authority instead of pretending every API is Admin-only:

    - `GET /api/admin/segments/{seededSegmentId}/export` and same-origin empty `POST /api/admin/media/upload` return 404 for all three non-staff identities before export parsing, form parsing, storage, or audit writes.
    - Cross-origin JSON `POST /api/ai/concierge` and `POST /api/ai/conversations/00000000-0000-4000-8000-000000000001/feedback` return 403 before rate-limit/provider/repository work. `GET /api/auth/m2-denial-unknown` returns the provider gateway's 404 without sending mail. Cookies do not confer any of those capabilities.
    - `GET /api/showcase/m2_invalid/view` is the documented 204 no-op before `recordView`; `GET /api/media/00000000-0000-4000-8000-000000000001` returns 404 before storage; and `POST /api/unsubscribe?token=invalid` returns 400 before suppression. These public/capability routes are tested for safe rejection/no-op, not relabelled as staff routes.
    - Invalid-signature `POST /api/stripe/webhook` returns 400 and invalid `x-woztell-signature` `POST /api/webhooks/woztell` returns 401 before event processing.
    - Missing-Authorization `POST` requests to all nine exact jobs—`aiops-metrics`, `approvals-expirer`, `board-reporter`, `chat-retention`, `engagement-score`, `journey-runner`, `renewal-runner`, `retention-analyst`, and `worker-alert`—return 401 before job-row/audit creation or a runner call.

    Add `readM2ProtectedApiDenialFingerprint` to the guarded fixture and require exact equality before/after the 19-case matrix for the seeded segment export audit, Media registry, chosen Concierge conversation/feedback IDs, invalid Showcase slug/view count, target profile suppression state, invalid webhook event/message IDs, all nine job-run keys, and related audit rows. Any response/status mismatch, inventory omission, side-effect drift, provider/storage call, or fingerprint-read failure fails the suite. Extend `m2-browser-acceptance-contract.test.ts` to source-assert the exact 26/19 counts, two locale prefixes, three identity contexts, method/status table, auth-first grouping, exhaustive inventory-key equality, and before/after fingerprint.

    Extend the M2 safety/runtime tests across both declared boundaries. The outer-parent manifest requires `M2_ACCEPTANCE_ALLOW_DESTRUCTIVE=M2_ISOLATED_FIXTURES_ONLY`, original `M2_E2E_ALLOWED_ORIGIN`/`APP_URL`, original `NEON_PROJECT_ID`, `M2_TEST_NEON_PROJECT_ID`, `M2_TEST_NEON_HOST`, `DATABASE_URL_TEST`, `M2_TEST_CRON_SECRET`, and `M2_TEST_UNSUBSCRIBE_TOKEN_SECRET`; it proves original origin/project equality and non-production Neon/TLS identity before sanitizing. The sanitized M2 runner retains the sentinel, `DATABASE_URL_TEST`, M2/Stripe/Auth test sources, and exact `PR6_MANAGED_*` projections, but must omit standard `APP_URL`, `DATABASE_URL`, `NEON_PROJECT_ID`, Stripe, cron, unsubscribe, and Auth names. `requireManagedPlaywrightRunnerTarget(process.env, "M2")` returns the only target accepted by `m2-reset.ts`; its Pool uses `target.databaseUrlTest`, and its comparisons use `target.origin`, `target.databaseHost`, and `target.neonProjectId`. Next alone receives `DATABASE_URL`, `APP_URL`, `NEON_PROJECT_ID`, `CRON_SECRET`, and `UNSUBSCRIBE_TOKEN_SECRET` mapped from that target/test sources. Require both test secrets nonempty and distinct, with the unsubscribe secret at least 32 bytes. Assert any present `PLAYWRIGHT_BASE_URL`, missing/wrong sentinel, original parent mismatch, source/projection/attestation mismatch, standard-name leakage into the runner, missing project/test/secret variable, equal or undersized test secrets, production/non-Neon/mismatched/TLS-invalid DB, multiple mutating sentinels, or reusable/occupied server fails at its declared boundary before `connect` or `seedM2`.
    Change `m2-reset.ts` and `resetM2AuthenticatedFixtures` to accept the typed M2 `ManagedRunnerTarget` (or a Pool already constructed solely from `target.databaseUrlTest`) rather than call the legacy environment-derived database URL helper or require runner-side `DATABASE_URL === DATABASE_URL_TEST`/`NEON_PROJECT_ID === M2_TEST_NEON_PROJECT_ID`. Unit/source tests make those standard names absent, prove the old path fails RED, prove only the attested target can construct the Pool, and reject a raw URL or unverified environment. After that pure runner check, acquire the M2 advisory lock, resolve and validate the exact configured staff/member/company-admin profile/auth identities, and snapshot every profile column before calling `resetM2AuthenticatedFixtures` or `seedM2`. Only then run the named `beforeAll` reset/seed and require the seeded identities still have the same profile/auth IDs and expected fixture roles. A reset/seed failure retains the pre-reset snapshots for aggregate cleanup.

    Refactor `m2-auth.ts` to use Task 4's managed-session registry and in-memory authentication only. Remove `storageState({path})` and the `test-results/m2-auth` writer entirely. Every authenticated M2 context uses trace/screenshot/video off through the active managed sentinel and is revoked, proved anonymous, and closed by the registry before data/profile restoration. At implementation time, remove the exact legacy `test-results/m2-auth` directory only after resolving it under this worktree's `test-results` root; fail on any path mismatch and verify absence. Unit/source tests require no cookie/storage-state path, no trace-capable override, and cleanup execution on early test failure.

    In `afterAll`, first aggregate session revocation/anonymous verification/context closure. Then run the named mutation reset under the same lock, poll all three profiles through a bounded quiet window, and compare-and-swap restore the pre-reset snapshots against the exact post-reset rows. Retry only an allowed in-window `lastLoginAt`/`updatedAt` touch, require a second byte-identical quiet window, preserve external drift, aggregate session/reset/identity failures independently, and fail on any incomplete restoration. Inject seed-overwrites-baseline, reset failure, delayed `touchLastLogin` after reset and after first CAS, session-revocation failure, and partial multi-identity cleanup in unit tests. The E2E source contract requires snapshot-before-reset in `beforeAll` and revoke/close-before-reset-before-quiescent-restore in `afterAll`.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-vitest-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/admin-presentational.test.tsx tests/unit/admin-dashboard-tiles.test.tsx tests/unit/admin-member-list.test.ts tests/unit/admin-member-page-boundary.test.ts tests/unit/admin-member-profile.test.ts tests/unit/member-note-server-action-boundary.test.ts tests/unit/segment-query.test.ts tests/unit/segment-save-action.test.ts tests/unit/campaign-server-action-auth.test.ts tests/unit/at-risk-repository-boundary.test.ts tests/unit/admin-page-auth.test.ts tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts

    Expected: FAIL because Admin navigation is flat, Dashboard is brand-only, CRM pages lack shared primitives, the M2 reset/browser path is not yet bound to the shared deny-by-default managed runtime, pre-reset three-profile snapshots, deterministic session revocation/no-artifact behavior, test-only cron/unsubscribe mappings, and quiescent restoration are absent, and the browser suite lacks the complete 26-page and 19-API authority matrices.

- [ ] **Step 3: Adopt Admin shell and CRM primitives without moving authority**

    Build the three localized groups and render `InternalNavigation` from `AdminNav`. Load existing `Navigation` locale labels, mount one existing `LocaleSwitcher` through `InternalAppShell.utility`, and replace the layout frame and separate main with `InternalAppShell variant="admin"`. Keep `await requireAdminPageActor()` before any private child render.

    Add `M2_ACCEPTANCE_DESTRUCTIVE_SENTINEL = "M2_ISOLATED_FIXTURES_ONLY"` and the complete parent/runner/Next M2 manifest. Keep `tests/fixtures/m2-runtime-env.ts` as an M2-specific wrapper that delegates/re-exports Task 4's neutral helpers: parent missing/semantic checks validate original standard names; runner missing/semantic checks consume only retained sources plus `requireManagedPlaywrightRunnerTarget(..., "M2")`; and Next mapping alone creates standard application names after the full scrub. `m2-admin-crm.spec.ts` computes skip state from the runner helper only, passes the typed target into `m2-reset.ts`, and never expects stripped `APP_URL`, `DATABASE_URL`, or `NEON_PROJECT_ID`. Require `PLAYWRIGHT_BASE_URL` absent, `target.origin === M2_E2E_ALLOWED_ORIGIN`, `target.databaseUrlTest === DATABASE_URL_TEST`, `target.databaseHost === M2_TEST_NEON_HOST`, `target.neonProjectId === M2_TEST_NEON_PROJECT_ID`, standard Stripe names mapped only from `STRIPE_TEST_*`, and standard cron/unsubscribe names mapped only into Next from the distinct valid M2 test secrets; forbid `hkwtia.vercel.app`. Any nonempty destructive sentinel forces no server reuse. A missing or invalid complete parent gate makes the outer launcher refuse before build/Playwright; once a managed child launches, any runner skip is unexpected and remains `NOT PASSED` before mutation. A separately approved valid run snapshots all three identities under lock before reset/seed, performs the reset, and only then starts managed registered sessions. Cleanup revokes/verifies/closes all sessions, runs the named reset, and restores the original pre-reset profiles through bounded quiet-window CAS.

    Implement the complete page/API matrices and guarded fingerprint exactly as Step 1. Inventory equality is bidirectional: an unmaterialized inventory ID or an extra test case fails before the browser loop. Construct deliberately invalid/capability-free requests only, so the matrix cannot send mail, invoke AI/Stripe/WOZTELL/storage, suppress a real profile, record a view, or run a job. Keep route-specific authority and response semantics unchanged.

    Apply:

    - Dashboard: `InternalPageHeader` and independently guarded `InternalSection` tiles.
    - Members: `InternalPageHeader` and `InternalTableFrame` around the existing table.
    - Member 360: `InternalPageHeader`, `InternalSection`, `InternalStatusBadge`, and existing forms/actions.
    - Segments: `InternalPageHeader`, `InternalSection`, `InternalActionFeedback`, and `InternalTableFrame`.
    - At-risk: `InternalPageHeader` and `InternalTableFrame`.

    Keep same-transaction audits, sanitized notes, consent/suppression filtering, frozen campaign recipients, URL-bound idempotency, fixed CSV headers/formula neutralization, and all actor-first repository scopes unchanged.

- [ ] **Step 4: Run GREEN and M2 CRM regressions**

    Run the Step 2 command again.

    Expected: PASS with grouped active navigation, locale retention, unchanged CRM/security assertions, complete provider-capability scrubbing plus exact M2-only mappings, every unsafe M2 reset/target case blocked before connection or seed, pre-reset identity snapshots preserved across seed overwrite, no disk auth state/traces, all sessions revoked before close, and delayed login touches unable to survive quiescent three-profile cleanup.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/m2-admin-crm.spec.ts

    Expected: the credential-free anonymous 26-page/two-locale Admin 404 matrix PASS; every authenticated/reset branch skips and is `NOT PASSED` as managed acceptance.

    Only after separate mutation approval and the complete M2 parent gate, run the exact manifest-owned mode:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m2

    Expected without the complete gate: the launcher refuses before build/Playwright and never calls `seedM2`; partial managed inputs do not run anonymous fallback cases. With the complete gate, the isolated anonymous/member/company-admin 19-API matrix, authenticated member/company-admin page matrix, and CRM cases run; all 26 pages deny both authenticated roles, every API preserves its route-specific denial/no-op status, the fingerprint is unchanged, all registered sessions are revoked/proved anonymous and contexts close, and `afterAll` completes deterministic data reset plus quiet-window/CAS restoration of staff/member/company-admin profiles. Missing cleanup remains `NOT PASSED`.

- [ ] **Step 5: Commit the Admin CRM slice**

    & $verifiedGit add -- ':(literal)app/[locale]/(admin)/admin/layout.tsx' ':(literal)components/admin/admin-nav.tsx' ':(literal)app/[locale]/(admin)/admin/page.tsx' ':(literal)app/[locale]/(admin)/admin/members/page.tsx' ':(literal)app/[locale]/(admin)/admin/members/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/segments/page.tsx' ':(literal)app/[locale]/(admin)/admin/at-risk/page.tsx' ':(literal)components/admin/dashboard-tiles.tsx' ':(literal)components/admin/member-table.tsx' ':(literal)components/admin/member-360.tsx' ':(literal)components/admin/member-note-form.tsx' ':(literal)components/admin/member-profile-form.tsx' ':(literal)components/admin/segment-builder.tsx' ':(literal)components/admin/segment-results.tsx' ':(literal)components/admin/segment-save-form.tsx' ':(literal)components/admin/at-risk-table.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-crm-shell.test.tsx' ':(literal)tests/unit/admin-presentational.test.tsx' ':(literal)tests/unit/admin-dashboard-tiles.test.tsx' ':(literal)tests/unit/admin-member-list.test.ts' ':(literal)tests/unit/admin-member-page-boundary.test.ts' ':(literal)tests/unit/admin-member-profile.test.ts' ':(literal)tests/unit/member-note-server-action-boundary.test.ts' ':(literal)tests/unit/segment-query.test.ts' ':(literal)tests/unit/segment-save-action.test.ts' ':(literal)tests/unit/campaign-server-action-auth.test.ts' ':(literal)tests/unit/at-risk-repository-boundary.test.ts' ':(literal)tests/unit/admin-page-auth.test.ts' ':(literal)tests/unit/m2-auth-reset.test.ts' ':(literal)tests/unit/m2-runtime-environment.test.ts' ':(literal)tests/unit/m2-browser-acceptance-contract.test.ts' ':(literal)tests/fixtures/m2-runtime-env.ts' ':(literal)tests/fixtures/m2-auth.ts' ':(literal)tests/fixtures/m2-reset.ts' ':(literal)tests/e2e/m2-admin-crm.spec.ts'
    & $verifiedGit commit -m "feat: align admin crm shell"

### Task 10: Align all Admin CMS pages while preserving publication and media locks

**Files:**

- Modify CMS pages: `app/[locale]/(admin)/admin/announcements/page.tsx`, `app/[locale]/(admin)/admin/announcements/[id]/page.tsx`, `app/[locale]/(admin)/admin/news/page.tsx`, `app/[locale]/(admin)/admin/news/[id]/page.tsx`, `app/[locale]/(admin)/admin/page-copy/page.tsx`, `app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx`, `app/[locale]/(admin)/admin/media/page.tsx`, `app/[locale]/(admin)/admin/media/[id]/page.tsx`, `app/[locale]/(admin)/admin/partners/page.tsx`, `app/[locale]/(admin)/admin/partners/[id]/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/page.tsx`, `app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx`.
- Modify presentation components: `components/admin/announcement-form.tsx`, `components/admin/news-form.tsx`, `components/admin/page-copy-form.tsx`, `components/admin/media-form.tsx`, `components/admin/media-upload-form.tsx`, `components/admin/partner-form.tsx`, `components/admin/landing-partner-form.tsx`, `components/admin/archive-toggle.tsx`.
- Create tests/fixtures: `tests/unit/wisetech-pr6-admin-cms-shell.test.tsx`, `tests/fixtures/authenticated-identity-safety.ts`, `tests/unit/authenticated-identity-safety.test.ts`, `tests/fixtures/m7-acceptance-safety.ts`, `tests/unit/m7-acceptance-safety.test.ts`, `tests/unit/m7-browser-acceptance-contract.test.ts`, `tests/e2e/m7-cms.spec.ts`.
- Consume unchanged: Task 4 managed `playwright.config.ts`/isolated-runtime helper and its no-reuse test contract.
- Modify tests: `tests/unit/admin-announcement-pages-rendered.test.tsx`, `tests/unit/announcement-form-rendered.test.tsx`, `tests/unit/admin-news.test.ts`, `tests/unit/news-actions-auth-order.test.ts`, `tests/unit/page-copy-action-state.test.ts`, `tests/unit/page-copy-scope.test.ts`, `tests/unit/admin-media.test.ts`, `tests/unit/media-upload-form-rendered.test.tsx`, `tests/unit/admin-partner-pages-rendered.test.tsx`, `tests/unit/admin-partners.test.ts`, `tests/unit/partner-media-locking.test.ts`, `tests/unit/admin-server-action-boundaries.test.ts`, `tests/unit/admin-revalidate-path.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes existing announcement, News, Page Copy, Media, Partner, and Landing Partner repositories/actions.
- Produces no new CMS model, publication state, storage adapter, media URL, partner claim, or page-copy scope.
- The test-only fixture produces:

    export type M7PageCopyRowSnapshot = Readonly<{
      id: string;
      locale: "en" | "zh-HK";
      namespace: "Privacy";
      keyPath: string;
      value: string;
      updatedByProfileId: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    export type M7PageCopyTupleSnapshot = Readonly<{
      identity: `${"en" | "zh-HK"}:${string}`;
      locale: "en" | "zh-HK";
      namespace: "Privacy";
      keyPath: string;
      row: M7PageCopyRowSnapshot | null;
      baselineResolvedValue: string;
    }>;
    export type M7PageCopySnapshot = Readonly<{
      catalogKeyPaths: readonly string[];
      tuples: readonly M7PageCopyTupleSnapshot[];
      preexistingPageCopyAuditIds: readonly string[];
      baselineRenderedValues: Readonly<
        Record<"en" | "zh-HK", Readonly<Record<string, string>>>
      >;
    }>;

- The fixture also snapshots pre-run audit ID sets for Page Copy, the exact run-owned News ID, and the exact run-owned Media ID, then records bounded start/end timestamps around each real UI mutation. News/Media audit rows do not cascade when their target rows are deleted, so their exact IDs are first-class cleanup ledger entries rather than “other disposable rows.”
- `authenticated-identity-safety.ts` is a test-only full-profile snapshot/quiescence/CAS helper for M3-M7 and final authenticated verification. After pure target/DB guards and before login, it snapshots every column for the exact configured profile. After the shared registry revokes/proves anonymous/closes all browser contexts, it drains fire-and-forget `touchLastLogin` writes over a bounded quiet window, compare-and-swap restores the full baseline, retries only an allowed in-window late login touch, preserves external drift, and requires a second byte-identical quiet window. It aggregates identities independently and never imports into production.
- [ ] **Step 1: Write failing CMS family source and rendering contracts**

    For all twelve pages, require their correct Content navigation owner, one H1/main, internal page/section/table/empty/feedback primitives, localized empty/error states, and preserved action imports.

    Retain focused assertions for:

    - bilingual Announcement and News fields;
    - auth before input parsing;
    - approved Page Copy namespace/leaves only;
    - active-media validation and archive reference lock;
    - provider-neutral Media upload action state;
    - Partner relationship, rights evidence, and active-media locks;
    - Landing Partner publication/archive behavior;
    - exact localized revalidation paths after mutation.

    Add M7 safety RED cases at both managed boundaries. The outer parent requires `M7_ACCEPTANCE_ALLOW_DESTRUCTIVE=M7_ISOLATED_FIXTURES_ONLY`, original `APP_URL`/`M7_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID === M7_TEST_NEON_PROJECT_ID`, `DATABASE_URL_TEST`, canonical TLS/exact non-production `M7_TEST_NEON_HOST`, absent `PLAYWRIGHT_BASE_URL`, valid test-only Neon Auth inputs, one active sentinel, and exact Admin credentials before sanitizing. The runner requires `requireManagedPlaywrightRunnerTarget(..., "M7")`, constructs its Pool from `target.databaseUrlTest`, and compares `target.origin`/host/project to retained M7 sources while standard `APP_URL`, `DATABASE_URL`, `NEON_PROJECT_ID`, and Auth names remain absent. Next alone receives their guarded mappings. Pure parent/runtime or runner-target failures occur before Pool/auth/browser; guarded DB identity checks occur after only that Pool exists and before auth/browser or mutation.
    Snapshot the configured M7 Admin profile through the generic helper after guarded DB identity validation and before authentication. Register the real Admin context with Task 4's session owner; unit/source RED requires revoke/anonymous-verify before context closure, no disk auth artifacts, pre-restore drain, full-row CAS, post-restore quiet verification, delayed-touch coverage, external-drift preservation, and cleanup aggregation independent of Page Copy/News/Media phases.

    Define `m7-cms.spec.ts` as the isolated bilingual acceptance journey on Task 4's managed server. A guarded fixture inserts only run-ID-owned disposable News, Media registry, and reference rows and snapshots pre-run audit IDs for their exact target IDs. Page Copy has fixed `(locale, namespace, key_path)` identity and no run-ID column. Derive the authoritative ordered key set from `pageCopyCatalog("Privacy")`; require no duplicate key path, then snapshot every catalog tuple across both locales as a complete row or explicit absence, plus all preexisting Page Copy audit IDs and every resolved public baseline value. Fail before writes on any unreadable/missing catalog coverage. Re-read and byte-compare the full tuple set immediately before submit. Through the real UI, staff edits/publishes bilingual News, submits exact run Page Copy values while supplying every other catalog field from the guarded snapshot/bundle baseline, and exercises Media visibility/reference-lock/archive. Around every action, query guarded `SELECT clock_timestamp()` immediately before dispatch and immediately after the response, then reconstruct audit IDs by set difference; those database-derived inclusive bounds, never runner `Date.now()`, own audit time. Do not claim the DB-only Media URL resolves and do not call storage/provider APIs.

    Track Page Copy mutation/audit state separately. Re-read and drift-check the entire catalog-derived two-locale tuple set immediately before both mutation and restoration; any non-owned change in any target or non-target Privacy leaf stops the write, is preserved, and fails. Compute the complete actual before/after diff across all tuples, not an intended one-key set. In the independent cleanup phase, recompute audit-ID differences even when flags/captured IDs are missing and classify every tuple as exact baseline, exact owned run value/absence, or external drift. A Page Copy audit is owned only when its ID is new, `createdAt` lies inside the database `clock_timestamp()` bounds for the exact mutation/restoration UI request, actor user/type equal the configured Admin profile, action is `page_copy.updated`, target type is `page_copy`, target ID is `Privacy`, and metadata is exactly `{namespace: "Privacy", updated: [...actual changed-present tuple identities in `routing.locales` then `pageCopyCatalog` order], cleared: [...actual changed-absent tuple identities in that same production order]}` for that request. There is no tuple target or run-ID metadata. Skip baseline; restore only the complete exact owned diff; preserve/report drift. A fresh authenticated full-namespace UI submit supplies the exact baseline value for every prior-present tuple and the approved blank representation for every prior-absent tuple, including all unchanged leaves/locales. Only successful real-action restoration followed by both public locales rendering every catalog leaf's exact resolved baseline can pass; then CAS-restore original row metadata/timestamps for every restored prior-present tuple. If UI restoration or public verification fails while any tuple still equals its owned run value/absence, guarded direct DB restore may contain persistent data leakage for only the full exact owned diff, but it does not invalidate cache or satisfy public-baseline acceptance: report failure, terminate the isolated managed target, and make no restoration claim. Delete only mutation/restoration audit IDs satisfying the full predicate; preserve/report unexpected or extra candidates.

    In another unconditional independent `finally`, reconstruct and validate News/Media audit ownership before deleting target rows. Owned News audits are new IDs inside their exact database-clock request bounds with configured actor, target type `post`, target ID equal to the exact run News ID, action `post.updated` with metadata exactly `{fields: [...Object.keys(parsedSubmittedNewsUpdate).sort()]}`, or action `post.published` with metadata exactly `{slug: runSlug}`. The owned Media audit is a new ID inside its database-clock archive bounds with configured actor, action `media.archived`, target type `media`, target ID equal to the exact run Media ID, and metadata exactly `{url: runUrl}`. Unexpected, extra, out-of-window, or mismatched audit rows are preserved and fail cleanup. Independently delete exact owned audit IDs, reference, News, and Media rows and verify zero; no phase suppresses another. Unit/source contracts cover partial UI mutation/audit capture, non-cascading audit residue, idempotent reruns, drift preservation, runner/DB clock skew, and aggregate errors.

    In `m7-browser-acceptance-contract.test.ts`, require the shared managed guard before Pool/auth, bilingual route markers, run-ID ownership only where fields support it, both lifecycle hooks, nested aggregate cleanup, complete catalog-derived two-locale present/absent Page Copy snapshots, full-set baseline/run/drift classification including non-target-leaf drift, pre-write/pre-restore full-set rejection, complete-actual-diff audit ownership, real-UI restoration, every-leaf public baseline verification, database-derived request windows and audit-ID set differences, the real Page Copy `Privacy` target/`{namespace, updated, cleared}` metadata, full metadata restoration, and independently unconditional News/Media audit plus row cleanup. Require direct DB containment to fail acceptance and terminate the isolated target rather than claim revalidation. Require active Media visibility, reference-lock, archive visibility/removal, and no storage imports. In `m7-acceptance-safety.test.ts`, unit-test prior-row/prior-absence including an unchanged absent locale's blank representation, one-locale mutation, success before flag/capture, unexpected/extra/out-of-window audit rejection, exact News `post.updated` metadata object `{fields: [...]` plus `post.published` and Media `media.archived` predicates, non-cascading audit deletion, idempotency, early/UI restoration/public-verification failure, containment-without-success, external drift, independent phases, aggregate errors, fail-before-mutation drift, and runner clock skew proving only guarded DB `clock_timestamp()` bounds own audits. Keep `media-upload-delivery-routes.test.ts` unchanged as provider-double delivery evidence.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/authenticated-identity-safety.test.ts tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/admin-announcement-pages-rendered.test.tsx tests/unit/announcement-form-rendered.test.tsx tests/unit/admin-news.test.ts tests/unit/news-actions-auth-order.test.ts tests/unit/page-copy-action-state.test.ts tests/unit/page-copy-scope.test.ts tests/unit/admin-media.test.ts tests/unit/media-upload-form-rendered.test.tsx tests/unit/media-upload-delivery-routes.test.ts tests/unit/admin-partner-pages-rendered.test.tsx tests/unit/admin-partners.test.ts tests/unit/partner-media-locking.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/admin-revalidate-path.test.ts tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts

    Expected: FAIL on the new presentation/source contract and absent M7 guard/journey; existing publication, authorization, and reference-lock tests remain diagnostic controls.

- [ ] **Step 3: Apply CMS presentation primitives**

    Use `InternalPageHeader` on every list/detail page, `InternalSection` around existing forms/previews, `InternalTableFrame` around existing semantic tables, `InternalEmptyState` for empty repository results, and `InternalActionFeedback` for existing sanitized action state.

    Preserve all form names, hidden IDs, field-level errors, action bindings, repository calls, publication/archive locks, active-media transaction checks, partner provenance, bilingual News requirements, Page Copy allowlist, storage delivery paths, and localized revalidation. Do not add hard-coded production content or synthetic production rows.

    Implement the generic authenticated-identity helper and then the M7 test-only safety module, run-ID fixture, catalog-derived full-namespace/two-locale Page Copy snapshot/classifier, complete actual-diff ownership, request-window audit ledgers, guarded full-set re-reads, full-namespace UI restore, exact metadata/timestamp containment, and independent audit/row cleanup described in Step 1. The M7 fixture connects only after shared/pure checks, snapshots the configured Admin before login, exposes `prepareM7Fixture`, `snapshotM7PageCopy`, `assertM7PageCopyUnchanged`, `restoreM7PageCopyMetadata`, and `cleanupM7Fixture`, and is forbidden from production imports. After the shared registry revokes/proves anonymous/closes its session, identity restore is an independent aggregate phase. Never infer ownership from a fixed tuple alone, never expect run-ID Page Copy metadata, remove no non-owned record, preserve all unexpected audit candidates, and make cleanup idempotent. Direct DB containment after real-action failure always fails and disposes the managed target.

- [ ] **Step 4: Run GREEN and the complete CMS invariant subset**

    Run the Step 2 command again.

    Expected: PASS with all twelve pages aligned, CMS invariants unchanged, every unsafe M7 runtime rejected at the correct phase, configured Admin profile restored after quiet-window/CAS verification, complete catalog/two-locale present/absent Page Copy real-action restore and every-leaf public revalidation plus exact production audit ownership proven, non-cascading News/Media audit residue independently cleaned, source contract verifying the guarded E2E journey, and provider-double Media delivery only. A direct DB containment fallback can protect data but cannot pass. The mutating browser suite still requires separate isolated-mutation approval; absent approval is `NOT PASSED`.

- [ ] **Step 5: Commit the Admin CMS slice**

    & $verifiedGit add -- ':(literal)app/[locale]/(admin)/admin/announcements/page.tsx' ':(literal)app/[locale]/(admin)/admin/announcements/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/news/page.tsx' ':(literal)app/[locale]/(admin)/admin/news/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/page-copy/page.tsx' ':(literal)app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx' ':(literal)app/[locale]/(admin)/admin/media/page.tsx' ':(literal)app/[locale]/(admin)/admin/media/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/partners/page.tsx' ':(literal)app/[locale]/(admin)/admin/partners/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/landing-partners/page.tsx' ':(literal)app/[locale]/(admin)/admin/landing-partners/[id]/page.tsx' ':(literal)components/admin/announcement-form.tsx' ':(literal)components/admin/news-form.tsx' ':(literal)components/admin/page-copy-form.tsx' ':(literal)components/admin/media-form.tsx' ':(literal)components/admin/media-upload-form.tsx' ':(literal)components/admin/partner-form.tsx' ':(literal)components/admin/landing-partner-form.tsx' ':(literal)components/admin/archive-toggle.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/fixtures/authenticated-identity-safety.ts' ':(literal)tests/unit/authenticated-identity-safety.test.ts' ':(literal)tests/unit/wisetech-pr6-admin-cms-shell.test.tsx' ':(literal)tests/unit/admin-announcement-pages-rendered.test.tsx' ':(literal)tests/unit/announcement-form-rendered.test.tsx' ':(literal)tests/unit/admin-news.test.ts' ':(literal)tests/unit/news-actions-auth-order.test.ts' ':(literal)tests/unit/page-copy-action-state.test.ts' ':(literal)tests/unit/page-copy-scope.test.ts' ':(literal)tests/unit/admin-media.test.ts' ':(literal)tests/unit/media-upload-form-rendered.test.tsx' ':(literal)tests/unit/admin-partner-pages-rendered.test.tsx' ':(literal)tests/unit/admin-partners.test.ts' ':(literal)tests/unit/partner-media-locking.test.ts' ':(literal)tests/unit/admin-server-action-boundaries.test.ts' ':(literal)tests/unit/admin-revalidate-path.test.ts' ':(literal)tests/fixtures/m7-acceptance-safety.ts' ':(literal)tests/unit/m7-acceptance-safety.test.ts' ':(literal)tests/unit/m7-browser-acceptance-contract.test.ts' ':(literal)tests/e2e/m7-cms.spec.ts'
    & $verifiedGit commit -m "feat: align admin cms shell"

### Task 11: Align Admin Operations pages and freeze lifecycle/audit controls

**Files:**

- Modify Operations pages: `app/[locale]/(admin)/admin/events-mgmt/page.tsx`, `app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx`, `app/[locale]/(admin)/admin/listings-review/page.tsx`, `app/[locale]/(admin)/admin/cohorts/page.tsx`, `app/[locale]/(admin)/admin/cohorts/[id]/page.tsx`, `app/[locale]/(admin)/admin/approvals/page.tsx`, `app/[locale]/(admin)/admin/reports/page.tsx`, `app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx`, `app/[locale]/(admin)/admin/automations/page.tsx`.
- Modify presentation components: `components/admin/event-form.tsx`, `components/admin/attendee-table.tsx`, `components/admin/showcase-review-table.tsx`, `components/admin/cohort-form.tsx`, `components/admin/cohort-kanban.tsx`, `components/admin/approval-list.tsx`, `components/admin/report-cards.tsx`, `components/admin/board-draft-list.tsx`, `components/admin/safe-generated-content.tsx`, `components/admin/automation-dashboard.tsx`, `components/admin/automation-retry-form.tsx`.
- Create test: `tests/unit/wisetech-pr6-admin-operations-shell.test.tsx`.
- Modify tests: `tests/unit/admin-events.test.ts`, `tests/unit/event-check-in.test.ts`, `tests/unit/m5-admin-review.test.tsx`, `tests/unit/admin-cohort-management.test.ts`, `tests/unit/m6-admin-cohorts.test.tsx`, `tests/unit/approval-authorization.test.ts`, `tests/unit/approval-server-action-auth.test.ts`, `tests/unit/approval-list.test.tsx`, `tests/unit/report-reconciliation.test.ts`, `tests/unit/board-reporter-render.test.ts`, `tests/unit/automation-dashboard-review.test.tsx`, `tests/unit/automation-retry.test.ts`, `tests/unit/admin-server-action-boundaries.test.ts`.
- Create M3 browser lifecycle: `tests/fixtures/m3-browser-lifecycle.ts`, `tests/unit/m3-browser-lifecycle.test.ts`.
- Modify M3 guard/safety/browser files: `tests/fixtures/m3-acceptance-safety.ts`, `tests/unit/m3-acceptance-isolation.test.ts`, `tests/unit/m3-acceptance-safety.test.ts`, `tests/unit/m3-e2e-safety.test.ts`, `tests/e2e/m3-automations.spec.ts`.
- Consume unchanged retry invariant: `tests/unit/automation-admin.test.ts`.
- Create M6 target/browser lifecycle: `tests/fixtures/m6-neon-target.ts`, `tests/unit/m6-neon-target.test.ts`, `tests/fixtures/m6-browser-lifecycle.ts`.
- Modify M6 seed/safety/browser files: `scripts/seed-m6.ts`, `tests/unit/m6-seed.test.ts`, `tests/unit/m6-e2e-safety-contract.test.ts`, `tests/e2e/m6-launch-pad.spec.ts`.
- Consume unchanged: Task 10 `tests/fixtures/authenticated-identity-safety.ts` and `tests/unit/authenticated-identity-safety.test.ts`.
- Modify localization: `messages/en.json`, `messages/zh-HK.json`.

**Interfaces:**

- Consumes existing Event, Showcase, Cohort, Approval, Report, Board draft, and Automation owners.
- Produces no new transition, approval kind, publish/send control, retry eligibility, or audit path.
- Produces test-only M3/M6 reset, residue, audit, and identity evidence only; production retry eligibility, unsubscribe semantics, cohort transitions, Showcase projection, provider boundaries, and audit transaction order remain unchanged.

- [ ] **Step 1: Write failing Operations family source and rendering contracts**

    For all nine pages, require correct Operations navigation ownership, one H1/main, internal primitives, localized empty/error states, and preserved current reader/action symbols.

    Assert the regression freeze:

    - Event publication/media locks and check-in audit remain;
    - Showcase approval/rejection reason and member/staff permissions remain;
    - Cohort stage transitions remain legal and audited;
    - approval previews stay sanitized and decided/expired handling remains;
    - reports retain reconciled formulas and explicit unavailable values;
    - Board drafts render escaped inert content with no send/publish control;
    - automation rows display safe codes only; retry appears only for eligible failures and writes its audit.
    Add M3 source/unit RED for a complete managed-loopback browser lifecycle, not only page reads. The original-parent manifest requires `M3_ACCEPTANCE_ALLOW_DESTRUCTIVE=M3_ISOLATED_FIXTURES_ONLY`, exact `M3_ACCEPTANCE_SEED=true` and canonical `M3_SEED_NOW`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M3_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, independently allowlisted non-production DB identity, valid test-only Neon Auth inputs, and `M3_TEST_UNSUBSCRIBE_TOKEN_SECRET` of at least 32 bytes. The runner requires the exact M3 `ManagedRunnerTarget`, builds its Pool from `target.databaseUrlTest`, uses `target.origin`, and rejects standard `APP_URL`/`DATABASE_URL`/Auth/unsubscribe names; Next alone receives `DATABASE_URL`, `APP_URL`, Auth, and `UNSUBSCRIBE_TOKEN_SECRET` mapped after the neutral scrub. No reuse is allowed. Under the M3 seed advisory lock and before any write, resolve the exact configured staff/member emails to one `staff` and one `member` profile, require their normalized emails/auth IDs/profile IDs pairwise distinct and disjoint from every fixture profile identity, and snapshot both complete login-profile rows. In the same locked preflight, capture a complete serializable ledger for every predicate `clearFixture` can delete or `writeFixture` can overwrite: referenced membership-plan codes; all fixture profile rows; every membership and cascade child owned by fixture profile IDs; staff tasks, email/WhatsApp logs, journey states, suppressions, engagement events/scores for those profiles; the fixed saved segment, campaign and campaign recipients; fixed approvals; audit rows whose target is a fixture journey/approval or whose request ID matches `m3-seed:%`; and jobs at fixture IDs or `run_key LIKE 'm3-seed:%'`. Record full rows plus prior absence in FK-safe groups; any unreadable set, identity overlap, duplicate natural key, or predicate expansion after the lock fails before `seedM3`. Locally verify `M3_TEST_UNSUBSCRIBE_TOKEN_EN` and `M3_TEST_UNSUBSCRIBE_TOKEN_ZH_HK` with the retained test secret, exact fixture profile/locale payloads, and an expiry covering the run before browser/auth. Only then call `seedM3` and require exact seeded markers in the managed UI before creating the run-owned eligible retry/ineligible controls.

    Add M6 source/unit RED for one deterministic managed-loopback lifecycle. The original-parent manifest requires `M6_ACCEPTANCE_ALLOW_DESTRUCTIVE=M6_ISOLATED_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, exact `M6_ACCEPTANCE_SEED=true`, fixed canonical `M6_ACCEPTANCE_AS_OF`, original `APP_URL`/`M6_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID === M6_TEST_NEON_PROJECT_ID`, `DATABASE_URL_TEST`, no reuse, exact syntax for `M6_TEST_NEON_PROJECT_ID`, branch/endpoint/host IDs, a nonempty project-scoped `M6_TEST_NEON_API_KEY`, and valid test-only Neon Auth inputs before sanitizing. The runner requires the exact M6 `ManagedRunnerTarget`, uses `target.origin` and retained project/branch/endpoint/host/API-key sources, and rejects standard `APP_URL`, `DATABASE_URL`, `NEON_PROJECT_ID`, and Auth names; Next alone receives guarded DB/APP/project/Auth mappings. The API key is consumed only by the runner-side test fixture and is always absent from Next.

    After pure checks and before constructing a Pool/browser/Auth client or running a seed, `m6-neon-target.ts` performs only bounded authenticated `GET` requests to `https://console.neon.tech/api/v2/projects/{projectId}`, `/projects/{projectId}/branches/{branchId}`, and `/projects/{projectId}/branches/{branchId}/endpoints`. Require the provider responses to identify the exact configured project, branch, and one primary read-write endpoint; require endpoint project/branch/ID/host exact equality with the canonical TLS `DATABASE_URL_TEST`; require the branch to be a non-default child (`parent_id` nonnull and ID unequal to project `default_branch_id`), unprotected, and both project/branch names to reject case-insensitive `prod`, `production`, `main`, and `live` labels. Require `target.neonProjectId === M6_TEST_NEON_PROJECT_ID`, `target.databaseHost` plus the parsed `target.databaseUrlTest` to equal the direct non-pooled endpoint host, `sslmode=require` or stricter, and the reviewed operator approval record to name the same project/branch/endpoint IDs. An HTTP redirect, non-GET attempt, unexpected API host/path, missing/extra read-write endpoint, provider timeout/error, identity/name/protection/default/host/TLS mismatch, or inability to prove the metadata is `NOT PASSED` before Pool construction. Unit tests use a strict fake that rejects all mutation methods and prove an operator host allowlist or two equal database URLs alone can never authorize M6.

    Only after that independent provider proof may the lifecycle construct its guarded Pool. Under the seed advisory lock, snapshot every full row at all fixed cohort/partner/company/application IDs, the exact member-company application boundary, pre-run audit IDs, and full configured member/staff profiles. For each of the five fixed cohort/company pairs, query the unique key as well as the fixed ID and fail before seed if a pair resolves to an alternate ID or either identity is ambiguous. Query every Showcase row for the graduation company and require exactly one expected target ID before mutation; snapshot its full row, including `goneGlobal`/`updatedAt`. Run `seedM6(pool, {asOf})` only after those checks and require the managed UI to render exact seeded identities before mutation. Audit request ownership uses guarded database `clock_timestamp()` bounds, with unit coverage for runner/DB clock skew.

- [ ] **Step 2: Run the focused tests and record the RED reason**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/authenticated-identity-safety.test.ts tests/unit/wisetech-pr6-admin-operations-shell.test.tsx tests/unit/admin-events.test.ts tests/unit/event-check-in.test.ts tests/unit/m5-admin-review.test.tsx tests/unit/admin-cohort-management.test.ts tests/unit/m6-admin-cohorts.test.tsx tests/unit/approval-authorization.test.ts tests/unit/approval-server-action-auth.test.ts tests/unit/approval-list.test.tsx tests/unit/report-reconciliation.test.ts tests/unit/board-reporter-render.test.ts tests/unit/automation-dashboard-review.test.tsx tests/unit/automation-retry.test.ts tests/unit/automation-admin.test.ts tests/unit/admin-server-action-boundaries.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/m6-seed.test.ts tests/unit/m6-neon-target.test.ts tests/unit/m6-e2e-safety-contract.test.ts

    Expected: FAIL on new shell/presentation assertions and absent managed M3/M6 browser lifecycle contracts, complete M3 pre-seed ledger/restoration, M6 provider-verified non-default/unprotected test project/branch/endpoint identity before Pool plus unique-pair/Showcase cardinality guards, and database-clock audit ownership. Existing authorization, retry/audit transaction, seed, cohort-transition, and Showcase controls remain diagnostic baselines.

- [ ] **Step 3: Apply Operations presentation primitives**

    Use `InternalPageHeader`, `InternalSection`, `InternalTableFrame`, `InternalEmptyState`, `InternalStatusBadge`, and `InternalActionFeedback` according to current page content. Keep all repository reads and Server Actions in their current files.

    Do not change Event fields, Showcase review state, Cohort transition matrix, approval decision rules, report formulas, Board draft sanitization, automation retry eligibility, or audit transaction order. Do not add send/publish controls to Board drafts.
    Implement `m3-browser-lifecycle.ts` without production imports. Refactor the M3 safety helpers from external Preview/different-runner-DB assumptions to Task 4 managed origin, exact child DB mapping, no-reuse sentinel, shared test-only Auth mapping, and `UNSUBSCRIBE_TOKEN_SECRET <- M3_TEST_UNSUBSCRIBE_TOKEN_SECRET` after the neutral scrub while preserving non-production host/TLS checks. Under the seed lock, resolve and snapshot the disjoint configured login profiles plus the complete Step 1 ledger before any seed write; verify both supplied unsubscribe tokens locally against the mapped secret; run `seedM3`; and prove the exact managed target shows the seeded markers before the real Server Action. Staff clicks retry once; use guarded `clock_timestamp()` immediately before/after the request and require journey `scheduled`/null error, matching email exact Admin-authorized code, and exactly one new audit inside those DB bounds with configured actor, action `journey.failed_retry_requested`, target `journey_state`/run ID, and exact `{scheduledAt, deliveryKey}`. Reload/replay and the sent/ineligible control must deny another transition/audit; `automation-admin.test.ts` directly submits non-failed IDs and proves no write. Existing English/Chinese console, Member 360, denial, and unsubscribe cases stay. In aggregate `afterAll`, revoke/verify/close every registered session; delete exact run retry audit/email/journey controls; then compare-and-swap restore every ledger group in FK-safe order, deleting rows absent before and restoring full rows present before. Preserve/fail on any unexpected drift or new predicate match, verify every pre-run row set byte-identically including prior absence, and only then quiet-window/CAS restore the pre-seed login-profile snapshots. Never use `seedM3` as restoration, and forbid provider, job-runner, delivery retry, or mail send.

    Implement `m6-neon-target.ts` and `m6-browser-lifecycle.ts`, and make `m6-launch-pad.spec.ts` call the lifecycle in `beforeAll`/`afterAll`. Provider-verify the exact non-default, unprotected, non-production-labelled project/branch/read-write endpoint through the bounded GET-only Neon adapter before Pool construction; never pass its API key to the child. Before seed, enforce the fixed-ID/unique-pair equality for all five cohort applications and exact one-row/expected-ID Showcase cardinality for the graduation company. The member application is owned only by exact cohort, controlled member company, DB-clock request bounds, and pre-run absence/baseline. Each stage audit is owned only by new ID, configured staff actor/type, action `cohort_application.stage_changed`, target type/id, database-clock request bounds, and exact `{fromStage, toStage}` chain. Snapshot and compare-and-swap restore every pair-owned application, all seed-upserted fixed rows, and the complete graduation-company Showcase set including `goneGlobal`/`updatedAt`; delete only a truly absent-before member application and its exact residue. Revoke/verify/close registered sessions, drain/restore both profiles with the shared helper, then verify byte-identical pre-run database and identity baselines. Partial provider proof, seed, application, transition, audit, Showcase, session, or one-identity failure cannot suppress another cleanup phase. Unexpected alternate IDs, cardinality change, clock-skew candidate, or drift is preserved and fails.

- [ ] **Step 4: Run GREEN and M3-M7 focused regression suites**

    Run the Step 2 command again.

    Expected: PASS with all nine Operations pages aligned and all invariant controls unchanged.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/authenticated-identity-safety.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/automation-admin.test.ts tests/unit/m4b-runtime-guard.test.ts tests/unit/m5-contracts.test.ts tests/unit/m5-repository.test.ts tests/unit/m6-contracts.test.ts tests/unit/m6-repository.test.ts tests/unit/m6-seed.test.ts tests/unit/m6-neon-target.test.ts tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m7-schema-contract.test.ts tests/unit/m7-media-schema-contract.test.ts

    Expected: PASS, including exact M3 full-footprint pre-seed ledger and prior-present/prior-absent restoration, unsubscribe/retry/audit residue, M6 provider-verified test project/branch/endpoint plus fixed-pair collision/cardinality guards and seed/application/stage-audit/all-Showcase restoration, database-clock ownership under runner skew, and delayed-login identity cleanup contracts. Environment/provider-dependent acceptance remains separately gated.

    With separate named approvals and complete managed variables, run the manifest-owned `& $verifiedNode scripts/run-managed-playwright.mjs m3` and `& $verifiedNode scripts/run-managed-playwright.mjs m6` modes separately. Each must use the guarded managed server mapped to `DATABASE_URL_TEST`, exercise its real UI outcomes, restore complete database and identity baselines in `afterAll`, and prove zero unexpected residue. Missing authority/guard, an M3 predicate-ledger mismatch, an M6 alternate pair ID/Showcase cardinality mismatch, or any cleanup uncertainty is `NOT PASSED`.

- [ ] **Step 5: Commit the Admin Operations slice**

    & $verifiedGit add -- ':(literal)app/[locale]/(admin)/admin/events-mgmt/page.tsx' ':(literal)app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/listings-review/page.tsx' ':(literal)app/[locale]/(admin)/admin/cohorts/page.tsx' ':(literal)app/[locale]/(admin)/admin/cohorts/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/approvals/page.tsx' ':(literal)app/[locale]/(admin)/admin/reports/page.tsx' ':(literal)app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx' ':(literal)app/[locale]/(admin)/admin/automations/page.tsx' ':(literal)components/admin/event-form.tsx' ':(literal)components/admin/attendee-table.tsx' ':(literal)components/admin/showcase-review-table.tsx' ':(literal)components/admin/cohort-form.tsx' ':(literal)components/admin/cohort-kanban.tsx' ':(literal)components/admin/approval-list.tsx' ':(literal)components/admin/report-cards.tsx' ':(literal)components/admin/board-draft-list.tsx' ':(literal)components/admin/safe-generated-content.tsx' ':(literal)components/admin/automation-dashboard.tsx' ':(literal)components/admin/automation-retry-form.tsx' ':(literal)messages/en.json' ':(literal)messages/zh-HK.json' ':(literal)tests/unit/wisetech-pr6-admin-operations-shell.test.tsx' ':(literal)tests/unit/admin-events.test.ts' ':(literal)tests/unit/event-check-in.test.ts' ':(literal)tests/unit/m5-admin-review.test.tsx' ':(literal)tests/unit/admin-cohort-management.test.ts' ':(literal)tests/unit/m6-admin-cohorts.test.tsx' ':(literal)tests/unit/approval-authorization.test.ts' ':(literal)tests/unit/approval-server-action-auth.test.ts' ':(literal)tests/unit/approval-list.test.tsx' ':(literal)tests/unit/report-reconciliation.test.ts' ':(literal)tests/unit/board-reporter-render.test.ts' ':(literal)tests/unit/automation-dashboard-review.test.tsx' ':(literal)tests/unit/automation-retry.test.ts' ':(literal)tests/unit/admin-server-action-boundaries.test.ts' ':(literal)tests/fixtures/m3-acceptance-safety.ts' ':(literal)tests/unit/m3-acceptance-isolation.test.ts' ':(literal)tests/unit/m3-acceptance-safety.test.ts' ':(literal)tests/fixtures/m3-browser-lifecycle.ts' ':(literal)tests/unit/m3-e2e-safety.test.ts' ':(literal)tests/unit/m3-browser-lifecycle.test.ts' ':(literal)tests/e2e/m3-automations.spec.ts' ':(literal)scripts/seed-m6.ts' ':(literal)tests/fixtures/m6-neon-target.ts' ':(literal)tests/unit/m6-neon-target.test.ts' ':(literal)tests/fixtures/m6-browser-lifecycle.ts' ':(literal)tests/unit/m6-seed.test.ts' ':(literal)tests/unit/m6-e2e-safety-contract.test.ts' ':(literal)tests/e2e/m6-launch-pad.spec.ts'
    & $verifiedGit commit -m "feat: align admin operations shell"

### Task 12: Prove bilingual, accessibility, M1-M7, and delivery gates without widening authority

**Files:**

- Create: `scripts/assert-pr6-live-task12-target.ps1`, `tests/unit/pr6-task12-target-boundary.test.ts`, `tests/e2e/wisetech-pr6-internal-journeys.spec.ts`, `tests/fixtures/m5-browser-lifecycle.ts`, `tests/unit/m5-browser-lifecycle.test.ts`, `tests/fixtures/pr6-authenticated-accessibility-lifecycle.ts`, `tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts`, `tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts`, `scripts/run-lighthouse-preview.mjs`, `scripts/lighthouse-preview-core.mjs`, `scripts/lighthouse-preview-core.d.mts`, `tests/fixtures/lighthouse-process-env-probe.mjs`, `tests/fixtures/lighthouse-config-loader-probe.cjs`, `tests/unit/lighthouse-process-boundary.test.ts`, `tests/unit/lighthouse-runner.test.ts`, `tests/unit/lighthouse-config.test.ts`, `tests/unit/lighthouse-config-loader.test.ts`, `lighthouserc.d.cts`, `docs/integration/wisetech-pr6-verification.md`, `docs/integration/wisetech-pr6-pr-body.md`.
- Consume unchanged in final regression commands: `tests/e2e/accessibility.spec.ts`, `tests/e2e/core-pages.spec.ts`, `tests/e2e/portal-dashboard.spec.ts`, `tests/e2e/portal-secondary-pages.spec.ts`, `tests/e2e/seat-management.spec.ts`. Their behavior changes, if any, belong to Tasks 5, 7, or 8 and must be staged there; Task 12 adds no assertion or edit to these files.
- Modify managed M4B/M5 browser gates: `tests/fixtures/m4b-e2e-safety.ts`, `tests/unit/m4b-e2e-safety.test.ts`, `tests/e2e/m4b-agents.spec.ts`, `tests/e2e/m5-showcase.spec.ts`. Both consume Task 10's generic authenticated-identity helper.
- Modify the public performance gate by renaming the existing ESM-incompatible `lighthouserc.js` to CommonJS `lighthouserc.cjs` and adding sibling `lighthouserc.d.cts`. Consume Task 0's `package.json`, where the ambient npm Lighthouse entry point is already absent. Preparation runs through the closed `$verifiedNode` invoker with the wrapper's complete byte-bound source closure; collection and commit verification run only from the checkpoint's materialized staged entrypoint/config identities. The config uses only the authorized Preview route allowlist below, a run-owned OS-temp working/output directory, no local-server fields, and no noindex/authenticated URL.
- Consume without weakening: Task 1 `tests/e2e/public-shell.spec.ts`; Task 2 `tests/e2e/join-auth.spec.ts`; Task 4 shared managed runtime plus M1; Task 9 M2 reset/browser; Task 10 authenticated-identity helper plus M7; Task 11 complete managed M3/M6 browser lifecycles; and existing M4C read-only guard/browser suite.

**Interfaces:**

- Consumes all Tasks 1-11 and their exact credential-free, deterministic, and isolated acceptance harnesses.
- Produces command-by-command evidence only. It performs no schema migration, production seed/import, provider configuration, merge, deployment, or production mutation. It runs an isolated database/test-provider mutation only after a separate approval is recorded and every suite-specific guard below passes.

- [ ] **Step 1: Define final credential-free and authenticated browser verification matrices**

    Before creating or editing any Task 12 file, bind the clean local implementation target through the already verified Git closure:

    $task12Branch = ((@(& $verifiedGit branch --show-current)) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $task12Branch -cne "codex/wisetech-pr6-join-portal-admin") { throw "PR6_TASK12_BRANCH_INVALID" }
    $task12Status = @(& $verifiedGit status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $task12Status.Count -ne 0) { throw "PR6_TASK12_BASE_NOT_CLEAN" }
    $preTask12Head = ((@(& $verifiedGit rev-parse HEAD)) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $preTask12Head -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_TASK12_HEAD_INVALID" }
    $task12BranchHead = ((@(& $verifiedGit rev-parse "refs/heads/$task12Branch")) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $task12BranchHead -cne $preTask12Head) { throw "PR6_TASK12_BRANCH_HEAD_MISMATCH" }
    & $verifiedGit merge-base --is-ancestor 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae $preTask12Head
    if ($LASTEXITCODE -ne 0) { throw "PR6_TASK12_PR5_ANCESTRY_INVALID" }
    & $verifiedGit merge-base --is-ancestor 8c83969e9f2244dadf8f9c9e3bc4d4431320c94a $preTask12Head
    if ($LASTEXITCODE -ne 0) { throw "PR6_TASK12_SPEC_ANCESTRY_INVALID" }
    $approvedPlanCommit = [string]$verifiedRuntime.ApprovedPlanCommit
    if ($approvedPlanCommit -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_TASK12_APPROVED_PLAN_INVALID" }
    & $verifiedGit merge-base --is-ancestor $approvedPlanCommit $preTask12Head
    if ($LASTEXITCODE -ne 0) { throw "PR6_TASK12_APPROVED_PLAN_ANCESTRY_INVALID" }

    Persist those non-secret projections outside the worktree in externally approved immutable closed `hkwtia.pr6.task12-target.v1` with record path/hash, repository, branch/ref/head, PR5/spec/approved-plan OIDs, successful ancestry-result hashes, capture timestamp, and verified Git descriptor hash. Then create dependency-free `assert-pr6-live-task12-target.ps1` plus its subprocess unit contract. When captured by Task 0's `$runtimeApprovedScriptResolver`, the script accepts the input-record resolver, operation-bound verified-Git invoker, target-record path/hash, exact ordered expected-status-entry array/hash, and `-RequireClean`. Each status entry is closed `{path, index: "clean" | "A" | "M" | "D", worktree: "clean" | "M" | "D" | "?"}`; the helper uses one NUL-delimited porcelain-v2 capture and compares the full canonical set, so absent, extra, reordered, renamed, staged/unstaged, or untracked drift fails. It reads no ambient variable and returns exactly one `hkwtia.pr6.task12-live-assertion-result.v1` object binding target-record hash, branch/ref/HEAD, PR5/spec/approved-plan ancestry-result hashes, expected-status-entry hash, and canonical status aggregate. It re-resolves the target, runs every Git check, and `-RequireClean` additionally requires an empty expected array and empty live status. Unit tests prove missing prior-shell variables cannot influence it, operation-free Git is rejected, and record/helper/path/index/worktree/status/ancestry drift fails. Every later M4C/Lighthouse operation record binds the target/helper and its phase-specific expected-status entries/hash. A fresh shell must resolve both, assign `preTask12Head` only from the target object, rebuild Git with the operation record, invoke the captured helper, and validate its one structured result before any provider capability. Close Git handles after success; only then may the launcher release a read token. Final commit/publication use their separately bound live checks.

    This is final verification, not a manufactured RED step. Every behavior assertion should already be GREEN after Tasks 1-11. If a new assertion fails, record it, return the change to its owning task, obtain an immutable review for that fix, and rerun this step.

    In `wisetech-pr6-internal-journeys.spec.ts`, cover both locales at widths 320, 375, 768, 1024, and 1280. At each width, assert:

    - `/join?plan=startup&interval=annual`, `/zh/join?plan=startup&interval=annual`, `/member-login`, and `/zh/member-login` are under 400, have one H1 and one `main#main-content`, have no document overflow, and expose one 44 px locale control;
    - invalid Join plan/interval, invalid or multi-valued continuation, and forged completion fail closed without provider or database mutation;
    - each stable Portal destination redirects anonymous users to localized member login with its exact canonical `next`; `/portal/showcase` and the token acceptance route are not generic continuations;
    - anonymous Admin remains a real localized 404;
    - the skip link, visible focus, mobile drawer Escape/focus return, one main/H1, 44 px controls, and table-local overflow contracts hold wherever their surface is reachable;
    - switching locale on representative Join URLs retains exact pathname, serialized query, and hash;
    - browser request interception fails the test if a credential-free case itself issues a request to a mutating application endpoint or unexpected external origin. It does not claim visibility into server-to-server Neon, Stripe, repository, or database calls; focused action/service fakes and guarded before/after fingerprints are the authority for those no-call contracts. Do not synthesize authenticated HTML.

    In `wisetech-pr6-authenticated-accessibility.spec.ts`, use the real guarded identities and run this exact EN/zh-HK route matrix at all five widths:
    This suite has its own managed lifecycle. The original parent requires `PR6_AUTHENTICATED_AXE_ALLOW_DESTRUCTIVE=PR6_ISOLATED_IDENTITIES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`PR6_AXE_E2E_ALLOWED_ORIGIN`, original `NEON_PROJECT_ID === PR6_AXE_TEST_NEON_PROJECT_ID`, `DATABASE_URL_TEST`, exact non-production `PR6_AXE_TEST_DB_HOST`, valid test-only Neon Auth inputs, and exactly four pairwise-distinct route-matrix identities: M2 member/staff, M3 staff, and M7 Admin. The runner requires `requireManagedPlaywrightRunnerTarget(..., "AXE")`, builds its Pool from `target.databaseUrlTest`, compares the target projections to the retained Axe sources, and rejects standard DB/APP/project/Auth names; Next alone receives guarded mappings. After the guarded Pool exists, snapshot every distinct full profile before login. Each real sign-in must return the exact expected profile/auth identity, register its context with the shared session owner, and advance that same guarded DB profile's `lastLoginAt` inside database `clock_timestamp()` request bounds, observationally binding target and database before continuing. Revoke every session through real sign-out, prove anonymous state, close every context, and quiet-window/CAS restore all identities in an aggregate `afterAll`; a parent launch failure, runner skip, binding failure, drift, or incomplete restoration is `NOT PASSED`.

    | Surface | English | Traditional Chinese | Guarded identity/fixture |
    | --- | --- | --- | --- |
    | Join | `/join?plan=startup&interval=annual#join-form` | `/zh/join?plan=startup&interval=annual#join-form` | credential-free |
    | Portal | `/portal` | `/zh/portal` | M2 member |
    | CRM | `/admin/members` | `/zh/admin/members` | M2 staff |
    | CMS | `/admin/news` | `/zh/admin/news` | M7 staff |
    | Reports | `/admin/reports` | `/zh/admin/reports` | M2 staff |
    | Automations | `/admin/automations` | `/zh/admin/automations` | M3 staff |

    For all 60 route/width cases, require zero serious/critical Axe violations, one H1/main, no document overflow, visible keyboard focus, and no console/page error. For Portal/Admin, small widths require mobile Escape/focus return and large widths require desktop sidebar. Join retains compact navigation. Locale switches preserve exact query/hash. The suite never fakes auth, and it cannot pass unless every distinct configured identity is target-to-DB bound, every browser context is closed, and all full-profile snapshots remain byte-identical through the post-restore quiet window.

    Refactor `m4b-e2e-safety.ts` and `m4b-agents.spec.ts` onto Task 4 managed runtime. The original parent requires `M4B_IDENTITY_RESTORE_ALLOW_DESTRUCTIVE=M4B_TEST_IDENTITIES_ONLY`, canonical `M4B_ACCEPTANCE_AS_OF`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M4B_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M4B_TEST_DB_HOST`, valid test-only Neon Auth inputs, and exact distinct staff/member credentials. The runner requires the exact M4B `ManagedRunnerTarget`, constructs its Pool from `target.databaseUrlTest`, uses `target.origin`, and rejects standard DB/APP/Auth names; Next alone receives guarded mappings. A guarded read-only preflight derives the exact fixture window/source keys from `M4B_ACCEPTANCE_AS_OF` and requires exactly the three expected pending retention approvals plus one exact inert Board-report post and no ambiguous duplicate before login; it never calls `seedM4B`, an agent, a job route, or a provider. Snapshot both full profiles through Task 10 generic helper. Load both message catalogs and iterate locale prefixes `""` and `"/zh"`: staff must see the three retention approvals, reports, and inert Board preview in both locales; member must receive each locale's real 404 on approvals/reports. Revoke/anonymous-verify/close every registered session and independently quiet-window/CAS restore both profiles; a parent failure, runner skip, missing/stale fixture evidence, one missing locale, late touch, or restoration failure is `NOT PASSED`.

    Implement `m5-browser-lifecycle.ts` as a managed, advisory-locked, test-only lifecycle. The original parent requires `M5_ACCEPTANCE_ALLOW_DESTRUCTIVE=M5_ISOLATED_FIXTURES_ONLY`, absent `PLAYWRIGHT_BASE_URL`, original `APP_URL`/`M5_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M5_TEST_DB_HOST`, valid test-only Neon Auth inputs, exact distinct manager/member/staff credentials, `M5_TEST_COMPANY_ID`, and `M5_TEST_LISTING_ID`. The runner requires the exact M5 `ManagedRunnerTarget`, constructs its Pool from `target.databaseUrlTest`, uses `target.origin`, and rejects standard DB/APP/Auth names; Next alone receives guarded mappings. Guarded DB preflight requires manager/member application profiles with role `member` and staff with role `staff`; normalized email/auth/profile IDs are pairwise distinct; manager has exactly one active company context at the target with company role `owner` or `admin`; ordinary member has exactly one at the same company with role `member`; and the listing ID is absent or belongs only to that company with no natural-key collision. Snapshot all three full profiles and the complete listing row or prior absence, then compare-and-swap initialize one exact draft run value. Through separate fresh contexts, manager saves a real draft and submits review, ordinary member sees the same listing read-only with no save/submit controls, and staff rejects the exact pending row with one nonempty run reason; verify every durable transition against the guarded DB. After all registered sessions are revoked, proved anonymous, and closed, CAS restore/delete the listing to its exact baseline, terminate the managed target so no stale cache is claimed, and quiet-window/CAS restore all three profiles independently. Unit/source tests cover parent/runner boundary confusion, pure guard-before-Pool/browser/auth, origin mismatch, role/company ambiguity, alternate listing ownership, prior-present/prior-absent rows, every partial transition, late login touches, external drift, and aggregate cleanup.

    Before Step 2, rerun Task 0's verified-runtime, credential-free process, immutable source-closure, creation-time containment, and immutable Next production-server contracts. The already committed launcher accepts only its fixed install/audit/static/unit/e2e modes, rejects every `tests/integration` path in credential-free mode, executes no dependency lifecycle script, and never launches a development server for Steps 2-4 and the nonmutating part of Step 5. Existing real-PostgreSQL integrations remain inventoried separate external gates; PR6's webhook contract runs only through Task 4's exact guarded Vitest mode. Do not modify this shared boundary in Task 12; a discovered defect returns to Task 0 or Task 4 for its own reviewed fix.

    Also create executable-only `scripts/run-lighthouse-preview.mjs`; import-safe `scripts/lighthouse-preview-core.mjs` with exact sibling `scripts/lighthouse-preview-core.d.mts`; both Lighthouse probes; all four unit contracts; and `lighthouserc.d.cts`. Rename `lighthouserc.js` to `lighthouserc.cjs`; Task 0 has already removed the npm execution script. The wrapper has only a guarded main entry and is tested solely as a subprocess; all injected fetch/filesystem/hash/spawn/UUID and execution-manifest APIs live in the pure core and are tested by import. The runtime/declaration export sets must match. The loader test spawns the real locked `@lhci/utils` 0.15.1 CommonJS loader through `lighthouse-config-loader-probe.cjs` under synthetic verified inputs and proves it loads only the `.cjs` file with the exact guarded shape; `ERR_REQUIRE_ESM`, alternate discovery, package/version drift, or direct wrapper import fails before authorized collection.

- [ ] **Step 2: Run the focused PR6 cross-surface aggregate**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/membership-catalog.test.ts tests/unit/membership-public-catalog.test.ts tests/unit/membership-links.test.tsx tests/unit/join-schema.test.ts tests/unit/join-navigation.test.ts tests/unit/join-service.test.ts tests/unit/join-terminal-state.test.ts tests/unit/join-terminal-transaction.test.ts tests/unit/join-actions.test.ts tests/unit/member-login-page.test.tsx tests/unit/portal-sign-out-button.test.tsx tests/unit/credential-free-auth-null-session.test.ts tests/unit/credential-free-verification-boundary.test.ts tests/unit/credential-free-build-boundary.test.ts tests/unit/verified-runtime-bootstrap.test.ts tests/unit/pr6-task12-target-boundary.test.ts tests/unit/managed-next-production-boundary.test.ts tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-vitest-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/m4c-readonly-preview-safety.test.ts tests/unit/checkout-service.test.ts tests/unit/checkout-recovery-service.test.ts tests/unit/billing-recovery-cas.test.ts tests/unit/join-billing-pages.test.tsx tests/unit/webhook-service.test.ts tests/unit/webhook-repository-sequential.test.ts tests/unit/webhook-postgres-safety.test.ts tests/unit/m1-live-acceptance-safety.test.ts tests/unit/seat-invitation-routes.test.tsx tests/unit/seat-service.test.ts tests/unit/internal-navigation.test.tsx tests/unit/internal-shell.test.tsx tests/unit/wisetech-pr6-route-inventory.test.ts tests/unit/wisetech-pr6-join-shell.test.tsx tests/unit/locale-switcher.test.tsx tests/unit/wisetech-pr6-portal-shell.test.tsx tests/unit/portal-company-context.test.ts tests/unit/wisetech-pr6-admin-crm-shell.test.tsx tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/authenticated-identity-safety.test.ts tests/unit/wisetech-pr6-admin-cms-shell.test.tsx tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts tests/unit/wisetech-pr6-admin-operations-shell.test.tsx tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m5-browser-lifecycle.test.ts tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts tests/unit/lighthouse-process-boundary.test.ts tests/unit/lighthouse-runner.test.ts tests/unit/lighthouse-config.test.ts tests/unit/lighthouse-config-loader.test.ts

    Expected: PASS. Record timestamp, exit code, files, test total, warnings, and skips.

- [ ] **Step 3: Run dependency, static, unit, lint, type, build, security, and diff gates**

    Run each separately and record its exact result:

    Close the current runtime shell. With source bytes unchanged, use the independently captured generator and external approval to obtain a fresh `recordKind: "install-only"` record that permits only `install` and forbids Git, installed CLIs, browser, database/provider/Preview, and publication fields. Open a new capability-free install shell, resolve that record, recreate only the native-adapter/guardian-bound `$verifiedNode`, and run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs install

    Close the install-only shell, approve/hash a fresh `recordKind: "runtime"` candidate containing the entire installed `node_modules` tree and current source manifests, start a fresh capability-free shell, rerun Task 0's resolver bootstrap, require the runtime kind, and recreate all native-adapter/guardian-bound invokers before continuing:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs audit-strings
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit
    & $verifiedGit ls-files -- ':(glob)tests/integration/**'
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs lint
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs typecheck
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs build
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs audit
    & $verifiedGit diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...HEAD

    Expected: credential-free static and complete `tests/unit` gates PASS; audit reports zero high vulnerabilities. The command must not discover `tests/integration`, and the verification record inventories every excluded real-PostgreSQL file as a separately authorized external gate. Existing migration/seed/truncation integrations are never invoked from an ambient `DATABASE_URL_TEST`; absent separate hardening/approval they remain `NOT PASSED`. If a command is blocked by the existing worktree junction, missing credential, or external environment, record the exact command/error and classify it as a baseline/environment gate, not a passing result and not a PR6 regression without reproduction against the base.

- [ ] **Step 4: Run credential-free and complete repository browser gates**

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e -- tests/e2e/wisetech-pr6-internal-journeys.spec.ts tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/core-pages.spec.ts tests/e2e/join-auth.spec.ts tests/e2e/portal-dashboard.spec.ts tests/e2e/portal-secondary-pages.spec.ts tests/e2e/seat-management.spec.ts

    Expected: credential-free PR6 cases PASS at the exact locale/width matrix without provider or mutation traffic.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs e2e

    Expected: every credential-free repository browser case PASS under the replacement environment. Isolated M1, M2, M3, M4B, M4C, M5, M6, M7, and authenticated-Axe cases must skip because the wrapper removes their credentials/sentinels; each remains `NOT PASSED`, is run only in Step 5 under separate authority, and is never counted as credential-free acceptance.

- [ ] **Step 5: Prove safety contracts, then run isolated M1-M7 only with separate authority**

    First run the non-mutating safety-contract command:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/credential-free-verification-boundary.test.ts tests/unit/credential-free-build-boundary.test.ts tests/unit/verified-runtime-bootstrap.test.ts tests/unit/pr6-task12-target-boundary.test.ts tests/unit/managed-next-production-boundary.test.ts tests/unit/isolated-runtime-environment.test.ts tests/unit/managed-runtime-process-boundary.test.ts tests/unit/managed-vitest-process-boundary.test.ts tests/unit/managed-webserver-boundary.test.ts tests/unit/managed-next-environment-boundary.test.ts tests/unit/managed-browser-process-boundary.test.ts tests/unit/managed-auth-session.test.ts tests/unit/m4c-readonly-preview-safety.test.ts tests/unit/authenticated-identity-safety.test.ts tests/unit/m1-live-acceptance-safety.test.ts tests/unit/webhook-postgres-safety.test.ts tests/unit/m2-auth-reset.test.ts tests/unit/m2-runtime-environment.test.ts tests/unit/m2-browser-acceptance-contract.test.ts tests/unit/m3-acceptance-isolation.test.ts tests/unit/m3-acceptance-safety.test.ts tests/unit/m3-e2e-safety.test.ts tests/unit/m3-browser-lifecycle.test.ts tests/unit/m4b-runtime-guard.test.ts tests/unit/m4b-e2e-safety.test.ts tests/unit/m5-browser-lifecycle.test.ts tests/unit/m6-neon-target.test.ts tests/unit/m6-e2e-safety-contract.test.ts tests/unit/m7-acceptance-safety.test.ts tests/unit/m7-browser-acceptance-contract.test.ts tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts

    Expected: PASS. The actual Playwright-CLI web-server probe proves canonical shell/runtime routing and the exact three-key upstream merge; the application runner separately owns a fresh capability-free build and immutable production server; each child gets a replacement environment; the real locked production loader/post-readiness probe proves no dotenv reload and only guarded runtime mappings, fixed telemetry/processed-loader markers, and its operational allowlist; and the pinned browser launcher receives a separate capability-free environment. The PostgreSQL guard proves mock-before-import single-handle binding, default-client non-evaluation, deterministic lock/failpoint behavior, managed identity target-to-DB binding, no-reuse behavior, and every destructive/provider/database/target/identity guard fails closed at its specified pure or guarded-DB phase before unauthorized mutation.

    Record a separate operator approval reference in the verification document before setting any destructive/provider sentinel. Never print values. The variables listed below are exact original-parent operator inputs. The outer launcher validates them before sanitization; the Playwright runner receives only the retained test-source names and attested `PR6_MANAGED_*` projections declared by the suite manifest, while standard application names exist only in the replacement Next environment:

    Every managed authenticated suite additionally requires exact `NEON_AUTH_TEST_BASE_URL`, `NEON_AUTH_TEST_ALLOWED_ORIGIN`, and `NEON_AUTH_TEST_COOKIE_SECRET`. The pure shared guard requires canonical non-production HTTPS, exact base-origin/allowlist equality, and a cookie secret of at least 32 bytes before mapping child `NEON_AUTH_BASE_URL`/`NEON_AUTH_COOKIE_SECRET`; ambient standard/test Auth values are scrubbed first. Every created session is registry-owned, revoked through the real sign-out endpoint, proved anonymous, and closed before profile/data restoration; disk storage state and managed-suite trace/screenshot/video output are forbidden.

    - M1: `M1_ACCEPTANCE_ALLOW_DESTRUCTIVE=M1_ISOLATED_FIXTURES_ONLY`, `M1_ACCEPTANCE_ALLOW_PROVIDER_CALLS=M1_TEST_PROVIDERS_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M1_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `M1_TEST_NEON_PROJECT_ID`/`M1_TEST_NEON_HOST`, the shared test-only Neon Auth trio, all four `STRIPE_TEST_SECRET_KEY`/`STRIPE_TEST_WEBHOOK_SECRET`/`STRIPE_TEST_STARTUP_PRICE_ID`/`STRIPE_TEST_CORPORATE_PRICE_ID`, exact `M1_TEST_OWNER_EMAIL`/`M1_TEST_INVITEE_EMAIL`/`M1_TEST_OVERFLOW_EMAIL`, `M1_TEST_MAGIC_LINK_INBOX_URL`, `M1_TEST_MAGIC_LINK_INBOX_TOKEN`, and `M1_TEST_MAGIC_LINK_ALLOWED_ORIGIN`. Standard child DB/Stripe/Auth/APP names come only from guarded mappings.
    - M2: `M2_ACCEPTANCE_ALLOW_DESTRUCTIVE=M2_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M2_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `M2_TEST_NEON_PROJECT_ID`/`M2_TEST_NEON_HOST`, the shared test-only Neon Auth trio, all four exact `STRIPE_TEST_*` names listed for M1, distinct valid `M2_TEST_CRON_SECRET`/`M2_TEST_UNSUBSCRIBE_TOKEN_SECRET`, and exact `M2_TEST_STAFF_EMAIL`/`M2_TEST_STAFF_PASSWORD`, `M2_TEST_MEMBER_EMAIL`/`M2_TEST_MEMBER_PASSWORD`, and `M2_TEST_COMPANY_ADMIN_EMAIL`/`M2_TEST_COMPANY_ADMIN_PASSWORD`. Snapshot all three profiles under lock before the first reset/seed; never write cookie storage state.
    - M3: `M3_ACCEPTANCE_ALLOW_DESTRUCTIVE=M3_ISOLATED_FIXTURES_ONLY`, `M3_ACCEPTANCE_SEED=true`, fixed canonical `M3_SEED_NOW`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M3_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` mapped to child `DATABASE_URL`, exact non-production `M3_ACCEPTANCE_EXPECTED_DB_HOST`, the shared test-only Neon Auth trio, exact `M3_TEST_STAFF_EMAIL`/`M3_TEST_STAFF_PASSWORD` and `M3_TEST_MEMBER_EMAIL`/`M3_TEST_MEMBER_PASSWORD`, `M3_TEST_UNSUBSCRIBE_TOKEN_SECRET`, and locally verified `M3_TEST_UNSUBSCRIBE_TOKEN_EN`/`M3_TEST_UNSUBSCRIBE_TOKEN_ZH_HK`. The lifecycle snapshots login profiles before seed, restores the complete seed footprint and identities, and has no Preview/share-token fallback.
    - M4B: `M4B_IDENTITY_RESTORE_ALLOW_DESTRUCTIVE=M4B_TEST_IDENTITIES_ONLY`, canonical `M4B_ACCEPTANCE_AS_OF`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M4B_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M4B_TEST_DB_HOST` mapped to the child, the shared test-only Neon Auth trio, and exact `M4B_TEST_STAFF_EMAIL`/`M4B_TEST_STAFF_PASSWORD` plus `M4B_TEST_MEMBER_EMAIL`/`M4B_TEST_MEMBER_PASSWORD`. The bilingual suite read-only-preflights exact existing M4B outputs and restores both full profiles; it never seeds or runs agents.
    - M4C: exact sentinel, `hkwtia.pr6.m4c-readonly-input.v1`, M4C descriptor path/hash, Task 12 local-head-record/helper path/root/hash plus exact expected-status entries/hash, launcher-escrowed Vercel read token/optional share token, and absent ambient browser routing. In the fresh operation shell, resolve the target/helper, assign `preTask12Head` only from the target record, rebuild `$verifiedGit` with the operation-input path/hash, and validate the captured helper's structured live branch/ref/HEAD, exact index/worktree status set, and PR5/spec/approved-plan ancestry result before token release. Provider Git SHA must equal that same live head. The parent then performs optional protection bootstrap and exact canonical-document/CSS/static capture, constructs typed ordered manifest entries plus the hash-bound in-memory response bundle, destroys token/cookie state, and sends only the bundle after handshake. The browser renders fulfilled captured bytes with network/JS/service workers disabled and asserts the private canary absent.
    - M5: `M5_ACCEPTANCE_ALLOW_DESTRUCTIVE=M5_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M5_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST` with exact `M5_TEST_DB_HOST` mapped to the child, the shared test-only Neon Auth trio, exact `M5_TEST_MANAGER_EMAIL`/`M5_TEST_MANAGER_PASSWORD`, `M5_TEST_MEMBER_EMAIL`/`M5_TEST_MEMBER_PASSWORD`, `M5_TEST_STAFF_EMAIL`/`M5_TEST_STAFF_PASSWORD`, `M5_TEST_COMPANY_ID`, and `M5_TEST_LISTING_ID`. It restores three full profiles and the prior-present/prior-absent listing row.
    - M6: `M6_ACCEPTANCE_ALLOW_DESTRUCTIVE=M6_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M6_E2E_ALLOWED_ORIGIN`, `M6_ACCEPTANCE_SEED=true`, fixed canonical `M6_ACCEPTANCE_AS_OF`, `DATABASE_URL_TEST` mapped to child `DATABASE_URL`, `NEON_PROJECT_ID`, exact `M6_TEST_NEON_PROJECT_ID`, `M6_TEST_NEON_BRANCH_ID`, `M6_TEST_NEON_ENDPOINT_ID`, `M6_TEST_NEON_HOST`, project-scoped `M6_TEST_NEON_API_KEY`, the shared test-only Neon Auth trio, exact `M6_TEST_MEMBER_EMAIL`/`M6_TEST_MEMBER_PASSWORD`, `M6_TEST_STAFF_EMAIL`/`M6_TEST_STAFF_PASSWORD`, `M6_TEST_MEMBER_COMPANY_DISPLAY_NAME`, and `M6_TEST_GRADUATE_COMPANY_DISPLAY_NAME`. The parent performs bounded GET-only Neon project/branch/endpoint verification before Pool; the API key and all test-source names are scrubbed from the child. The launcher always owns a fresh production server; lifecycle restores seed rows, member application, audits, Showcase state, sessions, and identities.
    - M7: `M7_ACCEPTANCE_ALLOW_DESTRUCTIVE=M7_ISOLATED_FIXTURES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`M7_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `M7_TEST_NEON_PROJECT_ID`/`M7_TEST_NEON_HOST`, the shared test-only Neon Auth trio, and exact `M7_TEST_ADMIN_EMAIL`/`M7_TEST_ADMIN_PASSWORD`. It restores the Admin profile as well as CMS data/audits.
    - Authenticated Axe: `PR6_AUTHENTICATED_AXE_ALLOW_DESTRUCTIVE=PR6_ISOLATED_IDENTITIES_ONLY`, `PLAYWRIGHT_BASE_URL` absent, optional `PLAYWRIGHT_PORT`, exact managed `APP_URL`/`PR6_AXE_E2E_ALLOWED_ORIGIN`, `DATABASE_URL_TEST`, `NEON_PROJECT_ID`, exact `PR6_AXE_TEST_NEON_PROJECT_ID`/`PR6_AXE_TEST_DB_HOST`, the shared test-only Neon Auth trio, and exactly `M2_TEST_MEMBER_EMAIL`/`M2_TEST_MEMBER_PASSWORD`, `M2_TEST_STAFF_EMAIL`/`M2_TEST_STAFF_PASSWORD`, `M3_TEST_STAFF_EMAIL`/`M3_TEST_STAFF_PASSWORD`, and `M7_TEST_ADMIN_EMAIL`/`M7_TEST_ADMIN_PASSWORD`. Those four normalized email/auth/profile identities must be pairwise distinct; the suite mutates only login timestamps and restores every full profile.

    Each managed guard requires canonical origins, distinct replacement maps for the capability-free build, managed production server, Playwright runner, and browser verified by actual child probes, independent non-production resource identity, exact test-only runtime mappings, a fixed validated operational allowlist, and registered session revocation/no disk auth artifacts. M1 handles recoverable provider/webhook/database/profile cleanup; M2 pre-reset baseline plus deterministic reset and quiescent three-profile restoration; M3 pre-seed login snapshots, complete seed-footprint restoration, test-only unsubscribe verification, and identity restoration; M4B exact read-only fixture preflight plus bilingual two-profile restoration; M5 manager/member/staff listing plus identity restoration; M6 provider-verified non-default/unprotected Neon project/branch/endpoint plus fixed-pair/all-Showcase/audit/identity reset; M7 full-Privacy-namespace Page Copy/News/Media/audit/Admin-profile restoration; and authenticated Axe four-identity restoration. Any ambiguity, cleanup, snapshot, drift, audit ownership, identity quiet-window, seat residue, or public-baseline failure fails. M1/M2/M3/M4B/M5/M6/M7/Axe are managed loopback only; M4C is separately guarded read-only Preview. No external/provider/database mutation occurs without separate named approval.

    Before M4B or M5, their managed source/unit lifecycle contracts must pass; those E2E files call their lifecycle themselves, so each separate command restores all profiles and M5 data before exit. The final authenticated Axe suite owns its own managed sentinel and restore lifecycle. Do not run a bare authenticated command outside these wrappers.

    Under the separate Task 4 database-mutation approval and exact `PR6_WEBHOOK_POSTGRES_ALLOW_DESTRUCTIVE=PR6_ISOLATED_WEBHOOK_FIXTURES_ONLY` guard, first run the real PostgreSQL projection contract separately:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-vitest.mjs webhook-postgres

    Expected without its exact isolated Neon/TLS host/project variables and approval: the launcher refuses before Vitest and records `NOT PASSED`. With the complete guard: PASS with an unchanged canonical Startup-plan fingerprint, an exact run-owned profile/application/membership/attempt fixture graph, executable checkout `INNER JOIN`/two-row locking, observed concurrent blocking, event-time activation schedules, atomic membership/application/attempt/journey/audit/job commit, injected rollback, and zero run-owned residue. This result is recorded independently from M1 browser acceptance.

    With each suite's separate approval and complete variables, run each browser suite separately for attributable evidence:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m1
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m2
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m3
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m4b
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m4c-readonly-preview
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m5
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m6
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs m7
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-managed-playwright.mjs axe

    Required outcomes:

    - M1 proves annual durable pricing, retrieval-only/exactly-once magic links, managed checkout, locally signed real-route webhook plus idempotent replay, activation/Billing Portal, distinct invitee capacity denial, registered-session revocation/anonymous verification, recoverable Session lineage, exact job/audit/journey cleanup, independent DB/provider cleanup, and quiet-window/CAS profile restoration.
    - M2 proves all 26 Admin pages across two locales and anonymous/member/company-admin identities, the exact route-specific negative authority/no-op contract for all 19 protected API handlers with an unchanged side-effect fingerprint, plus Member 360, notes, segments/CSV/campaign, at-risk, check-in, approvals, reports, audits, pre-reset three-profile baseline preservation, deterministic session revocation/no disk auth state, and deterministic reset/restore.
    - M3 proves managed-target seeded automation data, locally verified test-secret unsubscribe tokens, exactly one audited real-UI retry and sent/ineligible denial, isolated unsubscribe changes, complete pre-seed footprint restoration including prior absence, and full pre-seed staff/member identity restoration.
    - M4B proves the exact read-only M4B fixture and retention approvals plus inert Board draft preview in both English and Traditional Chinese, then restores both profiles; M4C proves bilingual privacy-safe AI-Ops at canonical as-needed locale paths with exact local/deployment-head equality and a preflighted immutable asset allowlist, without app-login identity mutation.
    - M5 proves one exact manager can save/submit, an ordinary member is read-only, and staff can reject the same pending listing with a required reason; it then restores the prior-present/prior-absent listing and all three profiles.
    - M6 proves provider-verified non-default/unprotected/non-production-labelled Neon project/branch/read-write endpoint identity before Pool, legal cohort transitions/stage audits and Showcase projection under deterministic managed reset, then restores exact seed rows, all fixed cohort/company pair identities, member application, database-clock-owned audit set, every graduation-company Showcase row, sessions, and both identities.
    - M7 proves bilingual News, approved Page Copy, and Media lifecycle/reference locks; Page Copy snapshots and drift-checks every catalog-derived Privacy tuple across both locales, owns the complete actual `{namespace, updated, cleared}` diff, and verifies every public baseline leaf after real-action restoration; News uses exact `{fields: [...]}` update-audit metadata, News/Media audits are independently deleted, the session is revoked, and the Admin identity is restored. Direct DB containment alone cannot pass.
    - Authenticated accessibility proves the exact 60-case matrix on its own managed target, revokes/proves anonymous/closes every registered session, and restores every distinct target-bound M2/M3/M7 profile.

    Missing separate authority, database, identities, test providers, allowlist, or cleanup capability means `NOT PASSED`. Do not seed, send, accept, mutate, or clean a live/Preview target without that separate approval.

- [ ] **Step 6: Run the exact authorized-Preview Lighthouse and field-performance gates**

    Use the fail-closed wrapper/config contracts implemented before Step 2. `prepare-index` runs capability-free from the byte-bound source and creates the staged checkpoint below; every Lighthouse/Vercel approval value is absent. Collection requires exact approved `hkwtia.pr6.lighthouse-preview-approval.v1` path/hash. Its closed schema binds approval reference; Task 12 target-record and assertion-helper path/root/hashes; repository/branch/PR5/spec/approved-plan/`preTask12Head`; deployment/project/optional-team/generated URL; production-origin denylist; and `chrome: {allowedRoot, executablePath, version, distributionManifestPath, distributionManifestSha256, memberAggregateSha256}`. All path/hash fields are canonical/lowercase and every Chrome member entry is covered by the aggregate. Unknown/ambient `LHCI_*` Chrome/head/deployment fields are rejected; the trusted launcher derives the exact non-secret projections from this descriptor and keeps the Vercel read token in escrow.
    Immediately before any Vercel request, while no read token has been released, use the already resolved `hkwtia.pr6.lighthouse-collect-input.v1`: re-resolve its Task 12 target/helper, assign the head only from that target, rebuild Git with the operation-record path/hash, and require the captured helper's one structured branch/ref/HEAD plus exact expected index/worktree status and PR5/spec/approved-plan ancestry result to equal the descriptor. Require its status aggregate equal the record's expected-status-entry hash, revoke the Git closure, and only then let the launcher deliver the read-token capability to the already handshaken parent. A record/helper/descriptor/local/live mismatch fails before provider access or Chrome.
    Perform one bounded no-redirect authenticated GET to the exact Vercel deployment endpoint and require HTTP 200, deployment/project/team, `READY`, standard Preview `target === null`, Git org/repo/ref, and provider SHA equal the descriptor and freshly verified local head. Require generated URL equality; reject production/loopback, denylist, malformed aliases, redirects, ambiguity, or non-GET. Zero the read token immediately after response capture; raw response/token never enter LHCI/Chrome. This proof never mutates a deployment.

    Only after provider/local-head proof, validate the complete Task 0-attested `@lhci/cli` closure and require every live Chrome root/path/version/manifest/member aggregate to equal the approved descriptor before launch. The ordered Chrome manifest covers executable, DLL/shared libraries, helpers, ICU/snapshots, PAK/locales/resources, SwiftShader, sandbox, and every other loadable code/data member; no unmanifested member is allowed. Apply Task 0's restricted-token plus directory-creation-denial policy to the complete read-only distribution and hold it through version/LHCI/browser exit. Re-enumerate/hash immediately before version, before spawn, and after exit. Ambient PATH/registry/channel/cache discovery, partial hashing, resource fallback, replacement, extra member, or descriptor drift is `NOT PASSED`.

    The wrapper generates one canonical lowercase UUID run ID and atomically creates absent `<os.tmpdir>/wisetech-pr6-lhci-<runId>` plus `tmp` before launch; links/reparse points or identity mismatch fail. Build version/LHCI child environments from empty objects. Include exact provider-verified base/deployment/Git projections, run/output roots, canonical `CHROME_PATH`, exact `LHCI_VERIFIED_CHROME_PATH`, `LHCI_VERIFIED_CHROME_VERSION`, and `LHCI_VERIFIED_CHROME_DISTRIBUTION_MANIFEST_SHA256`. Add only independently validated platform runtime keys and rebuilt PATH; omit every approval/token/raw response, DB/provider/Auth credential, proxy, loader override, ambient temp/PATH, and self-asserted Preview flag. Revalidate/hold the entire Chrome closure for no-shell version and Node/LHCI launch; execute only checkpoint materialized config bytes with `cwd=runRoot`. All Chrome profile/temp and LHCI `.lighthouseci`/`upload` outputs stay beneath that root, which is retained on success/failure and never staged. The wrapper propagates native exit and prints only sanitized deployment/head/run-root/browser-version/manifest-hash evidence.

    `lighthouserc.cjs` requires exact-equal canonical HTTPS base/allowed/provider deployment URLs; nonempty deployment ID/Git SHA; exact branch; canonical `CHROME_PATH === LHCI_VERIFIED_CHROME_PATH`; approved Chrome version; lowercase complete-distribution manifest hash; and the provider-validated production-origin denylist. It rejects localhost/production/origin drift and ignores self-asserted Preview variables. It requires canonical run/output roots with filesystem upload only and no local-server/static-dist fields. Collect exactly `/membership`, `/zh/membership`, `/join?plan=startup&interval=annual`, and `/zh/join?plan=startup&interval=annual` for three runs. Never include noindex/authenticated routes. Assert performance at least 0.90, accessibility/SEO at least 0.95, LCP at most 2,500 ms, and CLS at most 0.1. Never use temporary public storage.

    `lighthouse-runner.test.ts` uses injected fetch/filesystem/hash/spawn/UUID seams to prove byte-bound guard-before-network, GET-only Vercel proof, exact local-record/descriptor/provider head equality, deployment/project/team/READY/Preview/generated-origin binding, strict alias/denylist behavior, parent-only capability handling, unique OS-temp ownership, complete LHCI closure, and staged materialized invocation. It covers the entire Chrome distribution manifest/root, executable/version, full-closure hold/revalidation before each launch and after exit, replacement of DLL/PAK/locale/snapshot/helper files, operational allowlists, rebuilt PATH, temp/profile confinement, exit propagation, three-state attempt receipts, all three completion booleans, conditional provider/run/retained evidence, retention-manifest failure, independent field-INP status/evidence, the two-input overall-gate truth table, and success/failure retention. `lighthouse-process-boundary.test.ts` verifies the complete replacement child map includes only approved non-secret markers plus the Chrome distribution-manifest hash. Config/declaration/real-loader tests prove exact routes, thresholds, filesystem output, full-browser identity, no local/public upload, and runtime/declaration parity. None copies implementation logic or touches real provider/filesystem/Chrome.

    In the mandatory credential-free `prepare-index` phase, the already byte-bound Task 0 entrypoint stages only this exact execution set: `package.json`, `package-lock.json`, `scripts/assert-pr6-live-task12-target.ps1`, `tests/unit/pr6-task12-target-boundary.test.ts`, `scripts/run-lighthouse-preview.mjs`, `scripts/lighthouse-preview-core.mjs`, `scripts/lighthouse-preview-core.d.mts`, `lighthouserc.js` as a deletion, `lighthouserc.cjs`, `lighthouserc.d.cts`, both Lighthouse probe files, and all four Lighthouse unit-test files. Use the Task 0 verified Git adapter and replacement child environment. Scope attribute/config rejection to those exact paths: consume NUL-delimited `git check-attr filter ident working-tree-encoding text eol`, reject any effective `filter`, `ident`, or `working-tree-encoding` transform, and record the allowed built-in text/eol result. Unrelated global LFS/filter definitions that are not effective for an execution path do not fail this gate. Stage the fixed literal list and verify cached name/status/whitespace; all other Task 12 files remain unstaged. Materialize every executable/config/test source for Lighthouse from `git cat-file blob <stagedOid>` into a unique non-reparse OS-temp execution root, make that root immutable under Task 0's handle-/mount policy, and execute only its captured entrypoint/config bytes. The raw checkout is never an execution source after `prepare-index`; its hashes remain diagnostics only.

    The pure core then builds a canonical execution manifest through the Task 0 verified Git adapter before any Vercel token is read. For every non-deleted ordered path record (a) raw working-tree byte length and SHA-256 before/after as non-authoritative diagnostics; (b) exact staged blob OID from `:<path>`; (c) staged blob byte length/SHA-256 computed from `git cat-file blob <oid>`; (d) the materialized execution-root length/SHA-256, which must equal the staged blob; and (e) a hash of the exact-path NUL-delimited attributes plus effective `core.autocrlf`, `core.eol`, and `core.safecrlf` with origins. Record the old `HEAD:lighthouserc.js` OID and index-deletion tombstone. Bind the complete Node and local `@lhci/cli` execution manifests. `prepare-index` writes one immutable non-secret checkpoint outside the worktree and prints one JSON object containing only `checkpointPath`, lowercase `checkpointSha256`, `materializedEntrypointPath`, lowercase `materializedEntrypointSha256`, `materializedConfigPath`, and lowercase `materializedConfigSha256`; all six fields go into the verification record and the paths must be exact regular files under the recorded materialized root. `collect` revalidates the checkpoint, staged index, and materialized staged-byte execution root before reading the Vercel token and again after LHCI. Any staged OID/blob, materialized byte, effective attribute/config, cached name/status, executable, or deletion drift fails; raw checkout drift also fails collection conservatively but is never confused with the executed blob. Unit tests cover CRLF checkout versus LF blob, effective versus unrelated global filters, `ident`/encoding rejection, staged-byte execution, config/attribute changes, index/raw replacement, deleted-file resurrection, and CLI seam drift. Write only the sanitized manifest/aggregate under `<runRoot>` and copy them into the verification record.

    Run:

    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode scripts/run-credential-free-verification.mjs unit -- tests/unit/pr6-task12-target-boundary.test.ts tests/unit/lighthouse-process-boundary.test.ts tests/unit/lighthouse-runner.test.ts tests/unit/lighthouse-config.test.ts tests/unit/lighthouse-config-loader.test.ts
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    $lighthouseCheckpointJson = (& $verifiedNode scripts/run-lighthouse-preview.mjs prepare-index) | ConvertFrom-Json
    $lighthouseCheckpoint = [string]$lighthouseCheckpointJson.checkpointPath
    $lighthouseCheckpointSha256 = [string]$lighthouseCheckpointJson.checkpointSha256
    $lighthouseEntrypoint = [string]$lighthouseCheckpointJson.materializedEntrypointPath
    $lighthouseEntrypointSha256 = [string]$lighthouseCheckpointJson.materializedEntrypointSha256
    $lighthouseConfig = [string]$lighthouseCheckpointJson.materializedConfigPath
    $lighthouseConfigSha256 = [string]$lighthouseCheckpointJson.materializedConfigSha256
    foreach ($hash in @($lighthouseCheckpointSha256, $lighthouseEntrypointSha256, $lighthouseConfigSha256)) {
      if ($hash -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_LIGHTHOUSE_CHECKPOINT_HASH_INVALID" }
    }

    Expected: unit contracts PASS and the byte-bound `prepare-index` stages exactly the fixed Lighthouse execution set, materializes only staged-blob bytes, prints the six-field non-secret checkpoint/entrypoint/config identity object, and performs no network/Chrome/provider action. Preserve every field in the verification record even when no Preview collection is authorized so final commit binding is unconditional.

    Close the preparation shell. Only with the separate approved Preview/Lighthouse record, have the trusted launcher/CI issue exact `hkwtia.pr6.lighthouse-collect-input.v1` from the retained six-field preparation result and Task 12 target. Start a fresh dedicated approval-bearing shell, rerun the runtime bootstrap, and resolve the launcher-delivered operation input without console or environment input:

    $lighthouseCollectInputs = @(& $runtimeInputRecordResolver -Path $operationInputRecordPath -Sha256 $operationInputRecordSha256 -ExpectedSchema "hkwtia.pr6.lighthouse-collect-input.v1")
    if ($lighthouseCollectInputs.Count -ne 1) { throw "PR6_LIGHTHOUSE_COLLECT_INPUT_COUNT_INVALID" }
    $lighthouseCollectInput = $lighthouseCollectInputs[0]
    $task12Targets = @(& $runtimeInputRecordResolver -Path ([string]$lighthouseCollectInput.task12TargetRecordPath) -Sha256 ([string]$lighthouseCollectInput.task12TargetRecordSha256) -ExpectedSchema "hkwtia.pr6.task12-target.v1")
    if ($task12Targets.Count -ne 1) { throw "PR6_TASK12_TARGET_INPUT_COUNT_INVALID" }
    $task12Target = $task12Targets[0]
    $preTask12Head = [string]$task12Target.head
    if ($preTask12Head -cnotmatch "^[0-9a-f]{40}$" -or [string]$lighthouseCollectInput.preTask12Head -cne $preTask12Head) { throw "PR6_LIGHTHOUSE_COLLECT_HEAD_MISMATCH" }

    $task12AssertionBlocks = @(& $runtimeApprovedScriptResolver -Path ([string]$lighthouseCollectInput.task12AssertionPath) -AllowedRoot ([string]$lighthouseCollectInput.task12AssertionAllowedRoot) -Sha256 ([string]$lighthouseCollectInput.task12AssertionSha256))
    if ($task12AssertionBlocks.Count -ne 1) { throw "PR6_TASK12_ASSERTION_BLOCK_COUNT_INVALID" }
    $assertPr6LiveTask12Target = $task12AssertionBlocks[0]
    $verifiedGit = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Git -Arguments @($args) }.GetNewClosure()
    $task12LiveResults = @(& $assertPr6LiveTask12Target -InputRecordResolverScriptBlock $runtimeInputRecordResolver -VerifiedGitInvoker $verifiedGit -TargetRecordPath ([string]$lighthouseCollectInput.task12TargetRecordPath) -TargetRecordSha256 ([string]$lighthouseCollectInput.task12TargetRecordSha256) -ExpectedStatusEntries @($lighthouseCollectInput.expectedStatusEntries) -ExpectedStatusEntriesSha256 ([string]$lighthouseCollectInput.expectedStatusEntriesSha256))
    if ($task12LiveResults.Count -ne 1) { throw "PR6_TASK12_LIVE_RESULT_COUNT_INVALID" }
    $task12LiveResult = $task12LiveResults[0]
    if ($task12LiveResult.schema -cne "hkwtia.pr6.task12-live-assertion-result.v1" -or $task12LiveResult.head -cne $preTask12Head -or $task12LiveResult.gitTreeClosed -ne $true -or [string]$task12LiveResult.expectedStatusEntriesSha256 -cne [string]$lighthouseCollectInput.expectedStatusEntriesSha256 -or [string]$task12LiveResult.evidenceSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_TASK12_LIVE_RESULT_INVALID" }
    $verifiedGit = $null

    $lighthouseCheckpoint = [string]$lighthouseCollectInput.checkpointPath
    $lighthouseCheckpointSha256 = [string]$lighthouseCollectInput.checkpointSha256
    $lighthouseEntrypoint = [string]$lighthouseCollectInput.materializedEntrypointPath
    $lighthouseEntrypointSha256 = [string]$lighthouseCollectInput.materializedEntrypointSha256
    $lighthouseConfig = [string]$lighthouseCollectInput.materializedConfigPath
    $lighthouseConfigSha256 = [string]$lighthouseCollectInput.materializedConfigSha256
    $verifiedNode = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Node -Arguments @($args) }.GetNewClosure()
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode $lighthouseEntrypoint collect --entrypoint-sha256 "$lighthouseEntrypointSha256" --config "$lighthouseConfig" --config-sha256 "$lighthouseConfigSha256" --checkpoint "$lighthouseCheckpoint" --checkpoint-sha256 "$lighthouseCheckpointSha256"

    Record Lighthouse lab collection and field INP separately. A separately authorized successful collection sets `lighthouseAttemptStatus: "PASSED"`, `providerProofCompleted: true`, `runCreated: true`, and `retainedManifestCompleted: true`; it proves the runner/config contracts, revalidated sanitized Git/index checkpoint, exact local-head/descriptor/provider-SHA equality, read-only Vercel deployment, and the exact four public URLs. It does not by itself pass the overall performance gate. Separately authorized current-deployment field evidence sets `fieldInpStatus: "PASSED"` only with sufficient samples and INP p75 at most 200 ms; authorized missing/insufficient/noncompliant evidence is `NOT_PASSED`, and absent field authority is `UNAUTHORIZED`. The overall `gateStatus` is `PASSED` only when both the Lighthouse attempt and field INP status are `PASSED`; every other combination is `NOT_PASSED` while retaining completed evidence.

    Without Preview/Lighthouse approval, do not run `collect`; retain the checkpoint, set the attempt and field statuses to `UNAUTHORIZED`, all three completion booleans false, and forbid attempt/provider/run/retained/field evidence. For every separately authorized attempt, the trusted launcher issues an immutable sanitized attempt receipt naming the last completed phase and result/failure. A failure at preflight, provider proof, Chrome, collection, assertion, or retention is `AUTHORIZED_FAILED`. Preserve provider evidence iff provider proof completed; bind/report the canonical external run root iff it was created; and require a retained-artifact manifest only iff manifest finalization completed. Thus a retention-manifest failure is truthfully recorded with `runCreated: true`, `retainedManifestCompleted: false`, the run root in the attempt receipt, and no fabricated manifest. Never discard failure evidence merely because the overall gate did not pass.

    The verification record binds deployment/generated URL/project/reviewed local head/branch/READY/Preview, token-stripped provider hash, aliases/production denylist, canonical Chrome root/executable/version, complete distribution manifest path/hash and every completed preflight/pre-spawn/post-exit member aggregate, operational environment fingerprint, conditional run-owned temp/profile root, conditional retained manifest, and conditional pre/post Lighthouse execution-manifest aggregate. When a retained manifest exists, require only `<runRoot>/.lighthouseci` and `<runRoot>/upload/manifest.json`, exact URL/run allowlist, retained artifact hashes, and unchanged worktree status. Field evidence records its authorization/sample window, sufficiency, p75, threshold, and result independently. Never stage, overwrite, reuse, or claim cleanup of a run root.

- [ ] **Step 7: Write the verification record and prove the committed range**

    End every suite/provider shell. The trusted launcher/CI first freezes the complete ordered verified-command ledger through Step 6 and every pre-authoring Task 12 check, then canonicalizes every immutable per-command source/cleanup receipt into the non-secret suite-evidence manifest. It issues exact `hkwtia.pr6.verification-authoring-input.v1` with a duplicate ordered expected-entry inventory/count/aggregate; the resolver requires exact identity with the manifest so a command cannot be omitted, duplicated, reordered, or invented. The manifest must also prove at least one unique RED and GREEN entry for each Task 1-11 and the complete nonempty pending Task 12 AGGREGATE set. Lighthouse attempt, completion, field-INP, and overall-gate state remain separate: an authorized failure retains every phase that actually completed without changing the overall gate from `NOT_PASSED`. Start Step 7 in a fresh capability-free shell, rerun Task 0's core bootstrap, and resolve every value from that operation record:

    $verificationAuthoringInputs = @(& $runtimeInputRecordResolver -Path $operationInputRecordPath -Sha256 $operationInputRecordSha256 -ExpectedSchema "hkwtia.pr6.verification-authoring-input.v1")
    if ($verificationAuthoringInputs.Count -ne 1) { throw "PR6_VERIFICATION_AUTHORING_INPUT_COUNT_INVALID" }
    $verificationAuthoringInput = $verificationAuthoringInputs[0]
    $task12Targets = @(& $runtimeInputRecordResolver -Path ([string]$verificationAuthoringInput.task12TargetRecordPath) -Sha256 ([string]$verificationAuthoringInput.task12TargetRecordSha256) -ExpectedSchema "hkwtia.pr6.task12-target.v1")
    if ($task12Targets.Count -ne 1) { throw "PR6_VERIFICATION_TASK12_TARGET_COUNT_INVALID" }
    $task12Target = $task12Targets[0]
    $preTask12Head = [string]$task12Target.head
    if ($preTask12Head -cnotmatch "^[0-9a-f]{40}$" -or [string]$verificationAuthoringInput.preTask12Head -cne $preTask12Head) { throw "PR6_VERIFICATION_TASK12_HEAD_MISMATCH" }

    $task12AssertionBlocks = @(& $runtimeApprovedScriptResolver -Path ([string]$verificationAuthoringInput.task12AssertionPath) -AllowedRoot ([string]$verificationAuthoringInput.task12AssertionAllowedRoot) -Sha256 ([string]$verificationAuthoringInput.task12AssertionSha256))
    if ($task12AssertionBlocks.Count -ne 1) { throw "PR6_VERIFICATION_ASSERTION_BLOCK_COUNT_INVALID" }
    $assertPr6LiveTask12Target = $task12AssertionBlocks[0]
    $verifiedGit = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Git -Arguments @($args) }.GetNewClosure()
    $task12LiveResults = @(& $assertPr6LiveTask12Target -InputRecordResolverScriptBlock $runtimeInputRecordResolver -VerifiedGitInvoker $verifiedGit -TargetRecordPath ([string]$verificationAuthoringInput.task12TargetRecordPath) -TargetRecordSha256 ([string]$verificationAuthoringInput.task12TargetRecordSha256) -ExpectedStatusEntries @($verificationAuthoringInput.preAuthoringExpectedStatusEntries) -ExpectedStatusEntriesSha256 ([string]$verificationAuthoringInput.preAuthoringExpectedStatusEntriesSha256))
    if ($task12LiveResults.Count -ne 1) { throw "PR6_VERIFICATION_TASK12_LIVE_COUNT_INVALID" }
    $task12LiveResult = $task12LiveResults[0]
    if ($task12LiveResult.schema -cne "hkwtia.pr6.task12-live-assertion-result.v1" -or $task12LiveResult.head -cne $preTask12Head -or $task12LiveResult.gitTreeClosed -ne $true -or [string]$task12LiveResult.expectedStatusEntriesSha256 -cne [string]$verificationAuthoringInput.preAuthoringExpectedStatusEntriesSha256 -or [string]$task12LiveResult.evidenceSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_VERIFICATION_TASK12_LIVE_INVALID" }

    $lighthouseCheckpoint = [string]$verificationAuthoringInput.checkpointPath
    $lighthouseCheckpointSha256 = [string]$verificationAuthoringInput.checkpointSha256
    $lighthouseAttemptStatus = [string]$verificationAuthoringInput.lighthouseAttemptStatus
    $providerProofCompleted = [bool]$verificationAuthoringInput.providerProofCompleted
    $runCreated = [bool]$verificationAuthoringInput.runCreated
    $retainedManifestCompleted = [bool]$verificationAuthoringInput.retainedManifestCompleted
    $fieldInpStatus = [string]$verificationAuthoringInput.fieldInpStatus
    $lighthouseGateStatus = [string]$verificationAuthoringInput.gateStatus
    if ($lighthouseAttemptStatus -cnotin @("UNAUTHORIZED", "AUTHORIZED_FAILED", "PASSED") -or $fieldInpStatus -cnotin @("UNAUTHORIZED", "NOT_PASSED", "PASSED")) { throw "PR6_LIGHTHOUSE_AUTHORING_STATUS_INVALID" }
    $expectedLighthouseGateStatus = if ($lighthouseAttemptStatus -ceq "PASSED" -and $fieldInpStatus -ceq "PASSED") { "PASSED" } else { "NOT_PASSED" }
    if ($lighthouseGateStatus -cne $expectedLighthouseGateStatus -or ($retainedManifestCompleted -and -not $runCreated) -or ($runCreated -and -not $providerProofCompleted) -or ($fieldInpStatus -cne "UNAUTHORIZED" -and -not $providerProofCompleted)) { throw "PR6_LIGHTHOUSE_AUTHORING_ATTEMPT_GATE_INVALID" }
    if ($lighthouseAttemptStatus -ceq "UNAUTHORIZED" -and ($providerProofCompleted -or $runCreated -or $retainedManifestCompleted -or $fieldInpStatus -cne "UNAUTHORIZED")) { throw "PR6_LIGHTHOUSE_UNAUTHORIZED_STATE_INVALID" }
    if ($lighthouseAttemptStatus -ceq "PASSED" -and (-not $providerProofCompleted -or -not $runCreated -or -not $retainedManifestCompleted)) { throw "PR6_LIGHTHOUSE_PASSED_STATE_INVALID" }

    $expectedSuiteEvidenceEntries = @($verificationAuthoringInput.expectedSuiteEvidenceEntries)
    $expectedSuiteEvidenceEntriesSha256 = [string]$verificationAuthoringInput.expectedSuiteEvidenceEntriesSha256
    if ($expectedSuiteEvidenceEntries.Count -lt 23 -or $expectedSuiteEvidenceEntriesSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_EXPECTED_SUITE_EVIDENCE_INVENTORY_INVALID" }
    $suiteEvidenceManifestPath = [string]$verificationAuthoringInput.suiteEvidenceManifestPath
    $suiteEvidenceManifestSha256 = [string]$verificationAuthoringInput.suiteEvidenceManifestSha256

    $suiteEvidenceManifests = @(& $runtimeInputRecordResolver -Path $suiteEvidenceManifestPath -Sha256 $suiteEvidenceManifestSha256 -ExpectedSchema "hkwtia.pr6.suite-evidence-manifest.v1")
    if ($suiteEvidenceManifests.Count -ne 1) { throw "PR6_SUITE_EVIDENCE_MANIFEST_COUNT_INVALID" }
    $suiteEvidenceManifest = $suiteEvidenceManifests[0]
    $suiteEntries = @($suiteEvidenceManifest.entries)
    if ([string]$suiteEvidenceManifest.repository -cne [string]$task12Target.repository -or [string]$suiteEvidenceManifest.authoringHead -cne $preTask12Head -or [string]$suiteEvidenceManifest.approvedPlanCommit -cne [string]$verificationAuthoringInput.approvedPlanCommit -or [string]$suiteEvidenceManifest.lighthouseAttemptStatus -cne $lighthouseAttemptStatus -or [bool]$suiteEvidenceManifest.providerProofCompleted -ne $providerProofCompleted -or [bool]$suiteEvidenceManifest.runCreated -ne $runCreated -or [bool]$suiteEvidenceManifest.retainedManifestCompleted -ne $retainedManifestCompleted -or [string]$suiteEvidenceManifest.fieldInpStatus -cne $fieldInpStatus -or [string]$suiteEvidenceManifest.gateStatus -cne $lighthouseGateStatus -or $suiteEntries.Count -ne $expectedSuiteEvidenceEntries.Count -or [string]$suiteEvidenceManifest.expectedSuiteEvidenceEntriesSha256 -cne $expectedSuiteEvidenceEntriesSha256) { throw "PR6_SUITE_EVIDENCE_MANIFEST_BINDING_INVALID" }

    $cleanupReceipts = @()
    $executionSourceManifests = @()
    $taskReviewPackages = @()
    $pendingTask12EntryCount = 0
    $pendingTask12SourceManifestHashes = @()
    $pendingTask12CleanupReceiptHashes = @()
    $seenSuiteEntryIdentities = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $taskPhaseCoverage = @{}
    foreach ($taskNumber in 1..11) {
      $taskPhaseCoverage[[string]$taskNumber] = @{ RED = 0; GREEN = 0 }
    }

    $suiteEntryCount = $suiteEntries.Count
    for ($entryIndex = 0; $entryIndex -lt $suiteEntryCount; $entryIndex += 1) {
      $suiteEntry = $suiteEntries[$entryIndex]
      $expectedSuiteEntry = $expectedSuiteEvidenceEntries[$entryIndex]
      if ([string]$suiteEntry.entryIdentitySha256 -cnotmatch "^[0-9a-f]{64}$" -or -not $seenSuiteEntryIdentities.Add([string]$suiteEntry.entryIdentitySha256)) { throw "PR6_SUITE_EVIDENCE_IDENTITY_DUPLICATE_OR_INVALID" }
      foreach ($identityField in @("entryIdentitySha256", "task", "suite", "runId", "phase", "sanitizedCommandSha256", "executionSourceManifestSha256", "cleanupReceiptSha256")) {
        if ([string]$suiteEntry.$identityField -cne [string]$expectedSuiteEntry.$identityField) { throw "PR6_SUITE_EVIDENCE_EXPECTED_INVENTORY_MISMATCH" }
      }
      foreach ($oid in @([string]$suiteEntry.taskBaseHead, [string]$suiteEntry.executionHead)) {
        if ($oid -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_SUITE_EVIDENCE_HEAD_INVALID" }
      }
      if (@($suiteEntry.sanitizedCommand).Count -eq 0 -or [string]$suiteEntry.sanitizedCommandSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_SUITE_EVIDENCE_COMMAND_INVALID" }
      if ([string]$suiteEntry.phase -ceq "RED") {
        if ([string]$suiteEntry.outcome -cne "EXPECTED_RED" -or [int]$suiteEntry.exitCode -eq 0 -or [string]::IsNullOrWhiteSpace([string]$suiteEntry.redCause)) { throw "PR6_SUITE_RED_EVIDENCE_INVALID" }
      } elseif ([string]$suiteEntry.phase -ceq "GREEN" -or [string]$suiteEntry.phase -ceq "AGGREGATE") {
        if ([string]$suiteEntry.outcome -ceq "EXPECTED_RED" -or $null -ne $suiteEntry.redCause) { throw "PR6_SUITE_NON_RED_EVIDENCE_INVALID" }
      } else {
        throw "PR6_SUITE_EVIDENCE_PHASE_INVALID"
      }
      & $verifiedGit merge-base --is-ancestor ([string]$suiteEntry.taskBaseHead) ([string]$suiteEntry.executionHead)
      if ($LASTEXITCODE -ne 0) { throw "PR6_SUITE_EXECUTION_BASE_ANCESTRY_INVALID" }
      & $verifiedGit merge-base --is-ancestor ([string]$suiteEntry.executionHead) $preTask12Head
      if ($LASTEXITCODE -ne 0) { throw "PR6_SUITE_EXECUTION_TASK12_ANCESTRY_INVALID" }

      $sourceResults = @(& $runtimeInputRecordResolver -Path ([string]$suiteEntry.executionSourceManifestPath) -Sha256 ([string]$suiteEntry.executionSourceManifestSha256) -ExpectedSchema "hkwtia.pr6.execution-source-manifest.v1")
      $receiptResults = @(& $runtimeInputRecordResolver -Path ([string]$suiteEntry.cleanupReceiptPath) -Sha256 ([string]$suiteEntry.cleanupReceiptSha256) -ExpectedSchema "hkwtia.pr6.cleanup-receipt.v1")
      if ($sourceResults.Count -ne 1 -or $receiptResults.Count -ne 1) { throw "PR6_SUITE_REFERENCED_EVIDENCE_COUNT_INVALID" }
      $sourceManifest = $sourceResults[0]
      $receipt = $receiptResults[0]
      if ([string]$sourceManifest.repository -cne [string]$task12Target.repository -or [string]$sourceManifest.executionHead -cne [string]$suiteEntry.executionHead -or [string]$sourceManifest.commandVectorSha256 -cne [string]$suiteEntry.sanitizedCommandSha256) { throw "PR6_EXECUTION_SOURCE_MANIFEST_BINDING_INVALID" }
      if ([string]$receipt.repository -cne [string]$task12Target.repository -or [string]$receipt.task -cne [string]$suiteEntry.task -or [string]$receipt.suite -cne [string]$suiteEntry.suite -or [string]$receipt.runId -cne [string]$suiteEntry.runId -or [string]$receipt.executionHead -cne [string]$suiteEntry.executionHead -or [string]$receipt.outcome -cne [string]$suiteEntry.outcome -or [string]$receipt.evidenceSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_CLEANUP_RECEIPT_BINDING_INVALID" }

      if ([string]$suiteEntry.reviewState -ceq "ZERO_FINDING") {
        $taskKey = [string]$suiteEntry.task
        if (-not $taskPhaseCoverage.ContainsKey($taskKey) -or [string]$suiteEntry.phase -cnotin @("RED", "GREEN") -or [string]$suiteEntry.taskReviewedHead -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_SUITE_ZERO_FINDING_REVIEW_STATE_INVALID" }
        $taskPhaseCoverage[$taskKey][[string]$suiteEntry.phase] += 1
        & $verifiedGit merge-base --is-ancestor ([string]$suiteEntry.executionHead) ([string]$suiteEntry.taskReviewedHead)
        if ($LASTEXITCODE -ne 0) { throw "PR6_SUITE_EXECUTION_REVIEW_ANCESTRY_INVALID" }
        & $verifiedGit merge-base --is-ancestor ([string]$suiteEntry.taskReviewedHead) $preTask12Head
        if ($LASTEXITCODE -ne 0) { throw "PR6_SUITE_REVIEW_TASK12_ANCESTRY_INVALID" }
        $reviewResults = @(& $runtimeInputRecordResolver -Path ([string]$suiteEntry.taskReviewPackagePath) -Sha256 ([string]$suiteEntry.taskReviewPackageSha256) -ExpectedSchema "hkwtia.pr6.task-review-package.v1")
        if ($reviewResults.Count -ne 1) { throw "PR6_TASK_REVIEW_PACKAGE_COUNT_INVALID" }
        $taskReviewPackage = $reviewResults[0]
        if ([string]$taskReviewPackage.repository -cne [string]$task12Target.repository -or [string]$taskReviewPackage.task -cne [string]$suiteEntry.task -or [string]$taskReviewPackage.taskBaseHead -cne [string]$suiteEntry.taskBaseHead -or [string]$taskReviewPackage.reviewedHead -cne [string]$suiteEntry.taskReviewedHead -or [string]$taskReviewPackage.specOid -cne "8c83969e9f2244dadf8f9c9e3bc4d4431320c94a" -or [string]$taskReviewPackage.approvedPlanCommit -cne [string]$verificationAuthoringInput.approvedPlanCommit -or [int]$taskReviewPackage.findings.critical -ne 0 -or [int]$taskReviewPackage.findings.important -ne 0 -or [int]$taskReviewPackage.findings.minor -ne 0 -or -not (@($taskReviewPackage.executionSourceManifestSha256s) -ccontains [string]$suiteEntry.executionSourceManifestSha256)) { throw "PR6_TASK_REVIEW_PACKAGE_BINDING_INVALID" }
        $taskReviewPackages += $taskReviewPackage
      } elseif ([string]$suiteEntry.reviewState -ceq "PENDING_FINAL_REVIEW") {
        if ([string]$suiteEntry.task -cne "12" -or [string]$suiteEntry.phase -cne "AGGREGATE" -or [string]$suiteEntry.taskBaseHead -cne $preTask12Head -or [string]$suiteEntry.executionHead -cne $preTask12Head -or $null -ne $suiteEntry.taskReviewedHead -or $null -ne $suiteEntry.taskReviewPackagePath -or $null -ne $suiteEntry.taskReviewPackageSha256) { throw "PR6_SUITE_PENDING_TASK12_REVIEW_STATE_INVALID" }
        $pendingTask12EntryCount += 1
        $pendingTask12SourceManifestHashes += [string]$suiteEntry.executionSourceManifestSha256
        $pendingTask12CleanupReceiptHashes += [string]$suiteEntry.cleanupReceiptSha256
      } else {
        throw "PR6_SUITE_REVIEW_STATE_INVALID"
      }

      $executionSourceManifests += $sourceManifest
      $cleanupReceipts += $receipt
    }

    foreach ($taskKey in @($taskPhaseCoverage.Keys)) {
      if ([int]$taskPhaseCoverage[$taskKey].RED -lt 1 -or [int]$taskPhaseCoverage[$taskKey].GREEN -lt 1) { throw "PR6_SUITE_TASK_RED_GREEN_COVERAGE_INCOMPLETE" }
    }
    $pendingTask12EntryIdentityAggregateSha256 = [string]$suiteEvidenceManifest.pendingTask12EntryIdentityAggregateSha256
    $pendingTask12SourceManifestAggregateSha256 = [string]$suiteEvidenceManifest.pendingTask12SourceManifestAggregateSha256
    $pendingTask12CleanupReceiptAggregateSha256 = [string]$suiteEvidenceManifest.pendingTask12CleanupReceiptAggregateSha256
    if ($pendingTask12EntryCount -lt 1 -or [int]$suiteEvidenceManifest.pendingTask12EntryCount -ne $pendingTask12EntryCount -or $pendingTask12SourceManifestHashes.Count -ne $pendingTask12EntryCount -or $pendingTask12CleanupReceiptHashes.Count -ne $pendingTask12EntryCount -or $cleanupReceipts.Count -ne $suiteEntryCount -or $executionSourceManifests.Count -ne $suiteEntryCount -or $taskReviewPackages.Count -ne ($suiteEntryCount - $pendingTask12EntryCount) -or $pendingTask12EntryIdentityAggregateSha256 -cnotmatch "^[0-9a-f]{64}$" -or $pendingTask12SourceManifestAggregateSha256 -cnotmatch "^[0-9a-f]{64}$" -or $pendingTask12CleanupReceiptAggregateSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_SUITE_REFERENCED_EVIDENCE_SET_INVALID" }

    $checkpointEvidenceResults = @(& $runtimeInputRecordResolver -Path ([string]$verificationAuthoringInput.checkpointEvidencePath) -Sha256 ([string]$verificationAuthoringInput.checkpointEvidenceSha256) -ExpectedSchema "hkwtia.pr6.lighthouse-checkpoint-evidence.v1")
    if ($checkpointEvidenceResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_CHECKPOINT_EVIDENCE_COUNT_INVALID" }
    $checkpointEvidence = $checkpointEvidenceResults[0]
    if ([string]$checkpointEvidence.head -cne $preTask12Head -or [string]$checkpointEvidence.checkpointPath -cne $lighthouseCheckpoint -or [string]$checkpointEvidence.checkpointSha256 -cne $lighthouseCheckpointSha256 -or [string]$checkpointEvidence.materializedEntrypointPath -cne [string]$verificationAuthoringInput.materializedEntrypointPath -or [string]$checkpointEvidence.materializedEntrypointSha256 -cne [string]$verificationAuthoringInput.materializedEntrypointSha256 -or [string]$checkpointEvidence.materializedConfigPath -cne [string]$verificationAuthoringInput.materializedConfigPath -or [string]$checkpointEvidence.materializedConfigSha256 -cne [string]$verificationAuthoringInput.materializedConfigSha256) { throw "PR6_LIGHTHOUSE_CHECKPOINT_EVIDENCE_BINDING_INVALID" }

    $lighthouseAttemptReceipt = $null
    $retainedArtifactManifest = $null
    $providerSanitizedEvidence = $null
    $fieldInpEvidence = $null
    if ($lighthouseAttemptStatus -ceq "UNAUTHORIZED") {
      if ($providerProofCompleted -or $runCreated -or $retainedManifestCompleted -or $fieldInpStatus -cne "UNAUTHORIZED" -or $null -ne $verificationAuthoringInput.lighthouseAttemptReceiptPath -or $null -ne $verificationAuthoringInput.lighthouseAttemptReceiptSha256 -or $null -ne $verificationAuthoringInput.providerSanitizedEvidencePath -or $null -ne $verificationAuthoringInput.providerSanitizedEvidenceSha256 -or $null -ne $verificationAuthoringInput.runRoot -or $null -ne $verificationAuthoringInput.retainedArtifactManifestPath -or $null -ne $verificationAuthoringInput.retainedArtifactManifestSha256 -or $null -ne $verificationAuthoringInput.fieldInpEvidencePath -or $null -ne $verificationAuthoringInput.fieldInpEvidenceSha256) { throw "PR6_LIGHTHOUSE_UNAUTHORIZED_AUTHORING_EVIDENCE_PRESENT" }
    } elseif ($lighthouseAttemptStatus -ceq "AUTHORIZED_FAILED" -or $lighthouseAttemptStatus -ceq "PASSED") {
      $attemptResults = @(& $runtimeInputRecordResolver -Path ([string]$verificationAuthoringInput.lighthouseAttemptReceiptPath) -Sha256 ([string]$verificationAuthoringInput.lighthouseAttemptReceiptSha256) -ExpectedSchema "hkwtia.pr6.lighthouse-attempt-receipt.v1")
      if ($attemptResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_ATTEMPT_RECEIPT_COUNT_INVALID" }
      $lighthouseAttemptReceipt = $attemptResults[0]
      if ([string]$lighthouseAttemptReceipt.repository -cne [string]$task12Target.repository -or [string]$lighthouseAttemptReceipt.evidenceHead -cne $preTask12Head -or [string]$lighthouseAttemptReceipt.lighthouseAttemptStatus -cne $lighthouseAttemptStatus -or [bool]$lighthouseAttemptReceipt.providerProofCompleted -ne $providerProofCompleted -or [bool]$lighthouseAttemptReceipt.runCreated -ne $runCreated -or [bool]$lighthouseAttemptReceipt.retainedManifestCompleted -ne $retainedManifestCompleted -or [string]::IsNullOrWhiteSpace([string]$lighthouseAttemptReceipt.lastCompletedPhase)) { throw "PR6_LIGHTHOUSE_ATTEMPT_RECEIPT_BINDING_INVALID" }
      if ($lighthouseAttemptStatus -ceq "PASSED") {
        if (-not $providerProofCompleted -or -not $runCreated -or -not $retainedManifestCompleted -or $null -ne $lighthouseAttemptReceipt.sanitizedFailure) { throw "PR6_LIGHTHOUSE_PASSED_ATTEMPT_INVALID" }
      } elseif ([string]::IsNullOrWhiteSpace([string]$lighthouseAttemptReceipt.sanitizedFailure)) {
        throw "PR6_LIGHTHOUSE_FAILED_ATTEMPT_MISSING_FAILURE"
      }

      if ($providerProofCompleted) {
        $providerResults = @(& $runtimeInputRecordResolver -Path ([string]$verificationAuthoringInput.providerSanitizedEvidencePath) -Sha256 ([string]$verificationAuthoringInput.providerSanitizedEvidenceSha256) -ExpectedSchema "hkwtia.pr6.provider-sanitized-evidence.v1")
        if ($providerResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_PROVIDER_EVIDENCE_COUNT_INVALID" }
        $providerSanitizedEvidence = $providerResults[0]
        if ([string]$providerSanitizedEvidence.repository -cne [string]$task12Target.repository -or [string]$providerSanitizedEvidence.evidenceHead -cne $preTask12Head -or [string]$lighthouseAttemptReceipt.providerSanitizedEvidenceSha256 -cne [string]$verificationAuthoringInput.providerSanitizedEvidenceSha256) { throw "PR6_LIGHTHOUSE_PROVIDER_EVIDENCE_BINDING_INVALID" }
      } elseif ($null -ne $verificationAuthoringInput.providerSanitizedEvidencePath -or $null -ne $verificationAuthoringInput.providerSanitizedEvidenceSha256 -or $null -ne $lighthouseAttemptReceipt.providerSanitizedEvidenceSha256) {
        throw "PR6_LIGHTHOUSE_UNCOMPLETED_PROVIDER_EVIDENCE_PRESENT"
      }

      if ($runCreated) {
        if ([string]::IsNullOrWhiteSpace([string]$verificationAuthoringInput.runRoot) -or [string]$lighthouseAttemptReceipt.runRoot -cne [string]$verificationAuthoringInput.runRoot) { throw "PR6_LIGHTHOUSE_RUN_ROOT_BINDING_INVALID" }
      } elseif ($null -ne $verificationAuthoringInput.runRoot -or $null -ne $lighthouseAttemptReceipt.runRoot) {
        throw "PR6_LIGHTHOUSE_UNCREATED_RUN_ROOT_PRESENT"
      }

      if ($retainedManifestCompleted) {
        $retainedResults = @(& $runtimeInputRecordResolver -Path ([string]$verificationAuthoringInput.retainedArtifactManifestPath) -Sha256 ([string]$verificationAuthoringInput.retainedArtifactManifestSha256) -ExpectedSchema "hkwtia.pr6.lighthouse-retained-artifact-manifest.v1")
        if ($retainedResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_RETAINED_EVIDENCE_COUNT_INVALID" }
        $retainedArtifactManifest = $retainedResults[0]
        if (-not $runCreated -or [string]$retainedArtifactManifest.repository -cne [string]$task12Target.repository -or [string]$retainedArtifactManifest.evidenceHead -cne $preTask12Head -or [string]$retainedArtifactManifest.runRoot -cne [string]$verificationAuthoringInput.runRoot -or [string]$lighthouseAttemptReceipt.retainedArtifactManifestSha256 -cne [string]$verificationAuthoringInput.retainedArtifactManifestSha256) { throw "PR6_LIGHTHOUSE_RETAINED_EVIDENCE_BINDING_INVALID" }
      } elseif ($null -ne $verificationAuthoringInput.retainedArtifactManifestPath -or $null -ne $verificationAuthoringInput.retainedArtifactManifestSha256 -or $null -ne $lighthouseAttemptReceipt.retainedArtifactManifestSha256) {
        throw "PR6_LIGHTHOUSE_UNCOMPLETED_RETAINED_MANIFEST_PRESENT"
      }
    } else {
      throw "PR6_LIGHTHOUSE_AUTHORING_ATTEMPT_STATUS_INVALID"
    }

    if ($fieldInpStatus -ceq "UNAUTHORIZED") {
      if ($null -ne $verificationAuthoringInput.fieldInpEvidencePath -or $null -ne $verificationAuthoringInput.fieldInpEvidenceSha256) { throw "PR6_FIELD_INP_UNAUTHORIZED_EVIDENCE_PRESENT" }
    } else {
      $fieldInpResults = @(& $runtimeInputRecordResolver -Path ([string]$verificationAuthoringInput.fieldInpEvidencePath) -Sha256 ([string]$verificationAuthoringInput.fieldInpEvidenceSha256) -ExpectedSchema "hkwtia.pr6.field-inp-evidence.v1")
      if ($fieldInpResults.Count -ne 1) { throw "PR6_FIELD_INP_EVIDENCE_COUNT_INVALID" }
      $fieldInpEvidence = $fieldInpResults[0]
      $fieldInpPassCondition = ([bool]$fieldInpEvidence.sampleSufficient -and [double]$fieldInpEvidence.p75Milliseconds -le 200)
      if (-not $providerProofCompleted -or [string]$fieldInpEvidence.repository -cne [string]$task12Target.repository -or [string]$fieldInpEvidence.evidenceHead -cne $preTask12Head -or [string]$fieldInpEvidence.status -cne $fieldInpStatus -or [int]$fieldInpEvidence.thresholdMilliseconds -ne 200 -or ($fieldInpStatus -ceq "PASSED" -and -not $fieldInpPassCondition) -or ($fieldInpStatus -ceq "NOT_PASSED" -and $fieldInpPassCondition)) { throw "PR6_FIELD_INP_EVIDENCE_BINDING_INVALID" }
    }

    The launch transcript proves the shell's replacement environment contains no `LHCI_*`, `VERCEL_SHARE_TOKEN`, provider credential, or approval value, and every resolved schema rejects such fields; do not enumerate or print an ambient environment. The authoring input, exact ordered expected-command inventory, suite manifest, every execution-source manifest and completed task-review package, every cleanup receipt, checkpoint evidence, conditional Lighthouse attempt receipt, and conditionally completed provider/run/retained/field records are held immutable through the edit and exact Git checks. Author the document solely from those validated objects—never by reopening an untyped receipt/artifact path. Missing, duplicated, reordered, or drifted target/helper/checkpoint/inventory/suite/source/review/cleanup/attempt/retained/provider/field evidence; incomplete Tasks 1-11 RED/GREEN coverage; a cross-record repository/head/run/status/hash mismatch; an unauthorized evidence branch; discarded authorized-failure evidence; an invalid two-input overall gate; or any extra/missing status entry is `NOT PASSED`.

    - immutable PR5 base, the exact `hkwtia.pr6.verification-authoring-input.v1` and suite-evidence-manifest path/hashes plus every resolved execution-source/task-review/cleanup record identity, the exact `hkwtia.pr6.task12-target.v1` record/helper path/hashes and clean local `preTask12Head` captured before Task 12 editing, and the reviewed implementation head that existed before evidence authoring; the final PR6 commit SHA is intentionally captured after commit in the external immutable review package, not self-referenced inside this commit;
    - every pre-authoring command, timestamp, exit code, totals, warnings, skips, exact blocker, and separate operator-approval reference when an isolated suite ran; later Step 7/8 hash/commit/verification commands are necessarily post-document and bind into the final immutable reviewer-evidence hash instead of being backfilled into this committed document;
    - complete unique RED and GREEN coverage for every Task 1-11 reconstructed from the exact ordered expected-command inventory and each resolved sanitized command vector/hash, execution head and source manifest, exact RED cause, task base/reviewed head, zero-finding task-review package, exit/totals, and cleanup receipt, plus the complete nonempty ordered Task 12 AGGREGATE set and its entry/source/cleanup aggregates marked `PENDING_FINAL_REVIEW` without a fabricated RED or impossible pre-commit review;
    - independent per-task review result;
    - credential-free versus isolated-authenticated evidence, plus an inventory of every excluded legacy real-PostgreSQL integration gate and its separate-approval status;
    - the Lighthouse checkpoint, materialized entrypoint, and materialized config path/hash fields plus pre/post execution-manifest aggregate hash; diagnostic raw checkout and staged/materialized blob identities; explicit `UNAUTHORIZED`, `AUTHORIZED_FAILED`, or `PASSED` attempt state, all three completion booleans, independent field-INP state/evidence, and the derived overall gate; the immutable attempt receipt for every authorized attempt; conditional exact local-head/descriptor/provider-SHA evidence iff provider proof completed; the canonical run root iff created; the complete Chrome distribution manifest path/hash/version/root/member aggregate, completed preflight/pre-spawn/post-exit fingerprints, and retained-artifact manifest iff manifest finalization completed; effective exact-path attribute/config fingerprints and deletion tombstone. Mark final-commit binding pending because this document cannot self-reference its own commit, then record Step 8's unconditional `HEAD:path`/`git cat-file` result only in the external immutable review package;
    - external gates as `PASSED` or `NOT PASSED` with exact Lighthouse-attempt and field-INP states and no implied acceptance;
    - confirmation of no schema migration, production seed/import, provider configuration, or production action;
    - exact disposable cleanup evidence for every authorized suite: M1 provider/webhook/session/profile ledgers and named immutable evidence; M2 pre-reset identity baseline, session revocation, data reset, and three-profile quiescence; M3 complete seed-predicate ledger plus session/identity restoration; M4B bilingual/session/two-profile restoration; M5 listing/session/three-profile restoration; M6 GET-only provider metadata proof plus pair/application/audit/all-Showcase/session/identity reset; M7 full-namespace Page Copy/News/Media/audit/session/Admin-profile restoration; authenticated-Axe all-session/all-profile restoration; the separately gated real-PostgreSQL webhook plan fingerprint, run-owned profile graph, projection/rollback, and zero-residue result; and the exact managed runner/Next/browser environment fingerprints plus its canonical outside-worktree run root iff created and its manifest hashes, Chrome path/hash/version, and child-environment allowlist fingerprint iff retention-manifest finalization completed;
    - source-only rollback: revert PR6 commits to PR5 head.
    Before staging, resolve no new input. Run `& $verifiedGit diff --check` for unstaged Task 12 edits; prove the exact managed suites expose no disk auth-state/trace path, the legacy `test-results/m2-auth` path is absent, any conditionally created Lighthouse run root is canonical and outside the worktree, and no generated result, credential, environment, or Lighthouse file is selected. Do not claim a clean worktree or final head yet; both become meaningful only after the Task 12 commit.

    Create `docs/integration/wisetech-pr6-pr-body.md` with this exact reviewable body:

    ## Summary

    - Align Join, Portal, and Admin with shared internal application-shell primitives.
    - Add explicit member login and Portal sign-out while preserving Neon Auth ownership.
    - Carry durable billing interval through Join, checkout, completion, and localized Billing Portal return.
    - Preserve existing M1-M7 authorization, audit, lifecycle, seat, CMS, CRM, automation, and Concierge authorities.

    ## Verification

    See `docs/integration/wisetech-pr6-verification.md` for exact commands, totals, skips, blockers, and external gates.

    ## Safety

    No schema migration, production seed/import, provider configuration, production mutation, merge, or deployment is included. Isolated fixture/provider evidence ran only where the linked verification record names separate authority and deterministic cleanup.

    Before that run, require the closed authoring schema invariant that the post-authoring set equals the pre-authoring set plus exactly `docs/integration/wisetech-pr6-verification.md` and `docs/integration/wisetech-pr6-pr-body.md` as index-clean/worktree-`?` entries. Reinvoke the same captured helper against the post set:

    $postAuthoringLiveResults = @(& $assertPr6LiveTask12Target -InputRecordResolverScriptBlock $runtimeInputRecordResolver -VerifiedGitInvoker $verifiedGit -TargetRecordPath ([string]$verificationAuthoringInput.task12TargetRecordPath) -TargetRecordSha256 ([string]$verificationAuthoringInput.task12TargetRecordSha256) -ExpectedStatusEntries @($verificationAuthoringInput.postAuthoringExpectedStatusEntries) -ExpectedStatusEntriesSha256 ([string]$verificationAuthoringInput.postAuthoringExpectedStatusEntriesSha256))
    if ($postAuthoringLiveResults.Count -ne 1) { throw "PR6_POST_AUTHORING_TASK12_LIVE_COUNT_INVALID" }
    $postAuthoringLiveResult = $postAuthoringLiveResults[0]
    if ($postAuthoringLiveResult.schema -cne "hkwtia.pr6.task12-live-assertion-result.v1" -or $postAuthoringLiveResult.head -cne $preTask12Head -or $postAuthoringLiveResult.gitTreeClosed -ne $true -or [string]$postAuthoringLiveResult.expectedStatusEntriesSha256 -cne [string]$verificationAuthoringInput.postAuthoringExpectedStatusEntriesSha256 -or [string]$postAuthoringLiveResult.evidenceSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_POST_AUTHORING_TASK12_LIVE_INVALID" }

    Run:

    & $verifiedGit diff --check

    Expected: no whitespace errors in the uncommitted Task 12 slice. Final range/name/status checks occur only after the commit below.

- [ ] **Step 8: Stage the remaining Task 12 paths, commit the complete index, then prove the immutable final range**

    & $verifiedGit add -- ':(literal)tests/e2e/wisetech-pr6-internal-journeys.spec.ts' ':(literal)tests/fixtures/m5-browser-lifecycle.ts' ':(literal)tests/unit/m5-browser-lifecycle.test.ts' ':(literal)tests/fixtures/pr6-authenticated-accessibility-lifecycle.ts' ':(literal)tests/unit/pr6-authenticated-accessibility-lifecycle.test.ts' ':(literal)tests/e2e/wisetech-pr6-authenticated-accessibility.spec.ts' ':(literal)tests/fixtures/m4b-e2e-safety.ts' ':(literal)tests/unit/m4b-e2e-safety.test.ts' ':(literal)tests/e2e/m4b-agents.spec.ts' ':(literal)tests/e2e/m5-showcase.spec.ts' ':(literal)docs/integration/wisetech-pr6-verification.md' ':(literal)docs/integration/wisetech-pr6-pr-body.md'
    & $verifiedGit diff --cached --name-status
    & $verifiedGit diff --cached --check

    Expected: the cached union is exactly the Lighthouse execution checkpoint from Step 6 plus the remaining literal Task 12 paths above, including the `lighthouserc.js` deletion and new `.cjs`/`.d.cts`, with no extra path and no whitespace error. Recompute every Step 6 raw/index/blob/attribute fingerprint before commit and fail on drift.
    & $verifiedGit commit -m "test: verify PR6 internal journeys"
    $finalHead = ((@(& $verifiedGit rev-parse HEAD)) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $finalHead -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_FINAL_HEAD_INVALID" }
    & $verifiedGit merge-base --is-ancestor 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_FINAL_PR5_ANCESTRY_INVALID" }
    & $verifiedGit merge-base --is-ancestor 8c83969e9f2244dadf8f9c9e3bc4d4431320c94a $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_FINAL_SPEC_ANCESTRY_INVALID" }
    $approvedPlanCommit = [string]$verifiedRuntime.ApprovedPlanCommit
    if ($approvedPlanCommit -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_FINAL_APPROVED_PLAN_INVALID" }
    & $verifiedGit merge-base --is-ancestor $approvedPlanCommit $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_FINAL_APPROVED_PLAN_ANCESTRY_INVALID" }
    $verificationDocumentPath = "docs/integration/wisetech-pr6-verification.md"
    $verificationDocumentSpec = $finalHead + ":" + $verificationDocumentPath
    $verificationDocumentBlobOid = ((@(& $verifiedGit rev-parse $verificationDocumentSpec)) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $verificationDocumentBlobOid -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_FINAL_VERIFICATION_DOCUMENT_BLOB_OID_INVALID" }

    & $verifiedGit diff --name-status 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...$finalHead
    & $verifiedGit log --oneline 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae..$finalHead
    & $verifiedGit diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...$finalHead
    $finalStatus = @(& $verifiedGit status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $finalStatus.Count -ne 0) { throw "PR6_FINAL_WORKTREE_NOT_CLEAN" }
    Send only the exact sanitized `{finalHead, verificationDocumentPath, verificationDocumentBlobOid}` over the launcher-owned control channel, then close the commit shell. The trusted launcher/CI requires the literal path and issues one exact `hkwtia.pr6.verification-document-hash-input.v1` binding that proposed identity plus repository/branch/base/spec/approved-plan. Start a fresh capability-free hash shell, rerun Task 0's runtime bootstrap, and resolve that operation record:

    $documentHashInputs = @(& $runtimeInputRecordResolver -Path $operationInputRecordPath -Sha256 $operationInputRecordSha256 -ExpectedSchema "hkwtia.pr6.verification-document-hash-input.v1")
    if ($documentHashInputs.Count -ne 1) { throw "PR6_VERIFICATION_DOCUMENT_HASH_INPUT_COUNT_INVALID" }
    $documentHashInput = $documentHashInputs[0]
    $finalHead = [string]$documentHashInput.finalHead
    $approvedPlanCommit = [string]$documentHashInput.approvedPlanCommit
    $verificationDocumentPath = [string]$documentHashInput.verificationDocumentPath
    $verificationDocumentBlobOid = [string]$documentHashInput.verificationDocumentBlobOid
    if ($finalHead -cnotmatch "^[0-9a-f]{40}$" -or $approvedPlanCommit -cnotmatch "^[0-9a-f]{40}$" -or $approvedPlanCommit -cne ([string]$verifiedRuntime.ApprovedPlanCommit) -or $verificationDocumentPath -cne "docs/integration/wisetech-pr6-verification.md" -or $verificationDocumentBlobOid -cnotmatch "^[0-9a-f]{40}$") { throw "PR6_VERIFICATION_DOCUMENT_HASH_INPUT_INVALID" }
    $verifiedGit = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Git -Arguments @($args) }.GetNewClosure()
    $verifiedGitBlobSha256 = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool GitBlobSha256 -Arguments @($args) }.GetNewClosure()
    $hashBranch = ((@(& $verifiedGit branch --show-current)) -join "`n").Trim()
    $hashHead = ((@(& $verifiedGit rev-parse HEAD)) -join "`n").Trim()
    $hashBranchHead = ((@(& $verifiedGit rev-parse "refs/heads/$hashBranch")) -join "`n").Trim()
    if ($hashBranch -cne "codex/wisetech-pr6-join-portal-admin" -or $hashHead -cne $finalHead -or $hashBranchHead -cne $finalHead) { throw "PR6_VERIFICATION_DOCUMENT_HASH_LIVE_HEAD_INVALID" }
    & $verifiedGit merge-base --is-ancestor 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_VERIFICATION_DOCUMENT_HASH_PR5_ANCESTRY_INVALID" }
    & $verifiedGit merge-base --is-ancestor 8c83969e9f2244dadf8f9c9e3bc4d4431320c94a $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_VERIFICATION_DOCUMENT_HASH_SPEC_ANCESTRY_INVALID" }
    & $verifiedGit merge-base --is-ancestor $approvedPlanCommit $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_VERIFICATION_DOCUMENT_HASH_APPROVED_PLAN_ANCESTRY_INVALID" }
    $hashStatus = @(& $verifiedGit status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $hashStatus.Count -ne 0) { throw "PR6_VERIFICATION_DOCUMENT_HASH_WORKTREE_NOT_CLEAN" }
    $liveVerificationDocumentBlobOid = ((@(& $verifiedGit rev-parse ($finalHead + ":" + $verificationDocumentPath))) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $liveVerificationDocumentBlobOid -cne $verificationDocumentBlobOid) { throw "PR6_VERIFICATION_DOCUMENT_HASH_BLOB_OID_MISMATCH" }
    $verificationDocumentBlobHashResults = @(& $verifiedGitBlobSha256 cat-file blob $verificationDocumentBlobOid)
    if ($verificationDocumentBlobHashResults.Count -ne 1) { throw "PR6_VERIFICATION_DOCUMENT_BLOB_HASH_COUNT_INVALID" }
    $verificationDocumentBlobHashResult = $verificationDocumentBlobHashResults[0]
    if ($verificationDocumentBlobHashResult.schema -cne "hkwtia.pr6.git-blob-sha256.v1" -or $verificationDocumentBlobHashResult.oid -cne $verificationDocumentBlobOid -or [string]$verificationDocumentBlobHashResult.sha256 -cnotmatch "^[0-9a-f]{64}$" -or [long]$verificationDocumentBlobHashResult.byteLength -le 0) { throw "PR6_VERIFICATION_DOCUMENT_BLOB_HASH_INVALID" }
    $verificationDocumentBlobSha256 = [string]$verificationDocumentBlobHashResult.sha256
    $verificationDocumentBlobByteLength = [long]$verificationDocumentBlobHashResult.byteLength

    Send only `{finalHead, verificationDocumentPath, verificationDocumentBlobOid, verificationDocumentBlobSha256, verificationDocumentBlobByteLength}` over the launcher-owned control channel and close the hash shell. The trusted launcher/CI requires exact equality to the hash-input record, combines those values with the retained checkpoint plus the exact conditionally present attempt, provider, run-root, retained-manifest, and field-INP evidence under their recorded statuses/booleans, issues `hkwtia.pr6.lighthouse-commit-verification.v1`, and starts a new capability-free verification shell. Rerun Task 0's runtime bootstrap, then resolve the launcher-delivered input:

    $lighthouseVerificationInputs = @(& $runtimeInputRecordResolver -Path $operationInputRecordPath -Sha256 $operationInputRecordSha256 -ExpectedSchema "hkwtia.pr6.lighthouse-commit-verification.v1")
    if ($lighthouseVerificationInputs.Count -ne 1) { throw "PR6_LIGHTHOUSE_VERIFICATION_INPUT_COUNT_INVALID" }
    $lighthouseVerificationInput = $lighthouseVerificationInputs[0]
    $finalHead = [string]$lighthouseVerificationInput.finalHead
    $approvedPlanCommit = [string]$lighthouseVerificationInput.approvedPlanCommit
    $verificationDocumentPath = [string]$lighthouseVerificationInput.verificationDocumentPath
    $expectedVerificationDocumentBlobOid = [string]$lighthouseVerificationInput.verificationDocumentBlobOid
    $expectedVerificationDocumentBlobSha256 = [string]$lighthouseVerificationInput.verificationDocumentBlobSha256
    $expectedVerificationDocumentBlobByteLength = [long]$lighthouseVerificationInput.verificationDocumentBlobByteLength
    if ($finalHead -cnotmatch "^[0-9a-f]{40}$" -or $approvedPlanCommit -cnotmatch "^[0-9a-f]{40}$" -or $approvedPlanCommit -cne ([string]$verifiedRuntime.ApprovedPlanCommit) -or $verificationDocumentPath -cne "docs/integration/wisetech-pr6-verification.md" -or $expectedVerificationDocumentBlobOid -cnotmatch "^[0-9a-f]{40}$" -or $expectedVerificationDocumentBlobSha256 -cnotmatch "^[0-9a-f]{64}$" -or $expectedVerificationDocumentBlobByteLength -le 0) { throw "PR6_LIGHTHOUSE_VERIFICATION_HEAD_OR_DOCUMENT_INPUT_INVALID" }
    $verifiedGit = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Git -Arguments @($args) }.GetNewClosure()
    $verifiedGitBlobSha256 = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool GitBlobSha256 -Arguments @($args) }.GetNewClosure()
    $finalBranch = ((@(& $verifiedGit branch --show-current)) -join "`n").Trim()
    $liveFinalHead = ((@(& $verifiedGit rev-parse HEAD)) -join "`n").Trim()
    $liveFinalBranchHead = ((@(& $verifiedGit rev-parse "refs/heads/$finalBranch")) -join "`n").Trim()
    if ($finalBranch -cne "codex/wisetech-pr6-join-portal-admin" -or $liveFinalHead -cne $finalHead -or $liveFinalBranchHead -cne $finalHead) { throw "PR6_LIGHTHOUSE_VERIFICATION_LIVE_HEAD_MISMATCH" }
    & $verifiedGit merge-base --is-ancestor 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_VERIFICATION_PR5_ANCESTRY_INVALID" }
    & $verifiedGit merge-base --is-ancestor 8c83969e9f2244dadf8f9c9e3bc4d4431320c94a $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_VERIFICATION_SPEC_ANCESTRY_INVALID" }
    & $verifiedGit merge-base --is-ancestor $approvedPlanCommit $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_VERIFICATION_APPROVED_PLAN_ANCESTRY_INVALID" }
    $finalStatus = @(& $verifiedGit status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $finalStatus.Count -ne 0) { throw "PR6_LIGHTHOUSE_VERIFICATION_WORKTREE_NOT_CLEAN" }

    $liveVerificationDocumentBlobOid = ((@(& $verifiedGit rev-parse ($finalHead + ":" + $verificationDocumentPath))) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $liveVerificationDocumentBlobOid -cne $expectedVerificationDocumentBlobOid) { throw "PR6_LIGHTHOUSE_VERIFICATION_DOCUMENT_BLOB_OID_MISMATCH" }
    $liveVerificationDocumentBlobHashResults = @(& $verifiedGitBlobSha256 cat-file blob $liveVerificationDocumentBlobOid)
    if ($liveVerificationDocumentBlobHashResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_VERIFICATION_DOCUMENT_BLOB_HASH_COUNT_INVALID" }
    $liveVerificationDocumentBlobHashResult = $liveVerificationDocumentBlobHashResults[0]
    if ($liveVerificationDocumentBlobHashResult.schema -cne "hkwtia.pr6.git-blob-sha256.v1" -or $liveVerificationDocumentBlobHashResult.oid -cne $expectedVerificationDocumentBlobOid -or [string]$liveVerificationDocumentBlobHashResult.sha256 -cne $expectedVerificationDocumentBlobSha256 -or [long]$liveVerificationDocumentBlobHashResult.byteLength -ne $expectedVerificationDocumentBlobByteLength) { throw "PR6_LIGHTHOUSE_VERIFICATION_DOCUMENT_RAW_BLOB_MISMATCH" }

    $lighthouseCheckpoint = [string]$lighthouseVerificationInput.checkpointPath
    $lighthouseCheckpointSha256 = [string]$lighthouseVerificationInput.checkpointSha256
    $lighthouseEntrypoint = [string]$lighthouseVerificationInput.materializedEntrypointPath
    $lighthouseEntrypointSha256 = [string]$lighthouseVerificationInput.materializedEntrypointSha256
    $lighthouseConfig = [string]$lighthouseVerificationInput.materializedConfigPath
    $lighthouseConfigSha256 = [string]$lighthouseVerificationInput.materializedConfigSha256
    $lighthouseEvidenceHead = [string]$lighthouseVerificationInput.evidenceHead
    $lighthouseAttemptStatus = [string]$lighthouseVerificationInput.lighthouseAttemptStatus
    $providerProofCompleted = [bool]$lighthouseVerificationInput.providerProofCompleted
    $runCreated = [bool]$lighthouseVerificationInput.runCreated
    $retainedManifestCompleted = [bool]$lighthouseVerificationInput.retainedManifestCompleted
    $fieldInpStatus = [string]$lighthouseVerificationInput.fieldInpStatus
    $lighthouseGateStatus = [string]$lighthouseVerificationInput.gateStatus
    if ($lighthouseEvidenceHead -cnotmatch "^[0-9a-f]{40}$" -or $lighthouseAttemptStatus -cnotin @("UNAUTHORIZED", "AUTHORIZED_FAILED", "PASSED") -or $fieldInpStatus -cnotin @("UNAUTHORIZED", "NOT_PASSED", "PASSED")) { throw "PR6_LIGHTHOUSE_VERIFICATION_ATTEMPT_INPUT_INVALID" }
    $expectedLighthouseGateStatus = if ($lighthouseAttemptStatus -ceq "PASSED" -and $fieldInpStatus -ceq "PASSED") { "PASSED" } else { "NOT_PASSED" }
    if ($lighthouseGateStatus -cne $expectedLighthouseGateStatus -or ($retainedManifestCompleted -and -not $runCreated) -or ($runCreated -and -not $providerProofCompleted) -or ($fieldInpStatus -cne "UNAUTHORIZED" -and -not $providerProofCompleted)) { throw "PR6_LIGHTHOUSE_VERIFICATION_ATTEMPT_GATE_INVALID" }
    if ($lighthouseAttemptStatus -ceq "UNAUTHORIZED" -and ($providerProofCompleted -or $runCreated -or $retainedManifestCompleted -or $fieldInpStatus -cne "UNAUTHORIZED")) { throw "PR6_LIGHTHOUSE_VERIFICATION_UNAUTHORIZED_STATE_INVALID" }
    if ($lighthouseAttemptStatus -ceq "PASSED" -and (-not $providerProofCompleted -or -not $runCreated -or -not $retainedManifestCompleted)) { throw "PR6_LIGHTHOUSE_VERIFICATION_PASSED_STATE_INVALID" }
    & $verifiedGit merge-base --is-ancestor $lighthouseEvidenceHead $finalHead
    if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_EVIDENCE_HEAD_ANCESTRY_INVALID" }

    $verifiedNode = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Node -Arguments @($args) }.GetNewClosure()
    # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
    & $verifiedNode $lighthouseEntrypoint verify-commit --entrypoint-sha256 "$lighthouseEntrypointSha256" --config "$lighthouseConfig" --config-sha256 "$lighthouseConfigSha256" --checkpoint "$lighthouseCheckpoint" --checkpoint-sha256 "$lighthouseCheckpointSha256" --evidence-head "$lighthouseEvidenceHead" --head "$finalHead"
    if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_COMMIT_BINDING_FAILED" }

    if ($lighthouseAttemptStatus -ceq "UNAUTHORIZED") {
      if ($providerProofCompleted -or $runCreated -or $retainedManifestCompleted -or $fieldInpStatus -cne "UNAUTHORIZED" -or $null -ne $lighthouseVerificationInput.lighthouseAttemptReceiptPath -or $null -ne $lighthouseVerificationInput.lighthouseAttemptReceiptSha256 -or $null -ne $lighthouseVerificationInput.providerSanitizedEvidencePath -or $null -ne $lighthouseVerificationInput.providerSanitizedEvidenceSha256 -or $null -ne $lighthouseVerificationInput.runRoot -or $null -ne $lighthouseVerificationInput.retainedArtifactManifestPath -or $null -ne $lighthouseVerificationInput.retainedArtifactManifestSha256 -or $null -ne $lighthouseVerificationInput.fieldInpEvidencePath -or $null -ne $lighthouseVerificationInput.fieldInpEvidenceSha256) { throw "PR6_LIGHTHOUSE_UNAUTHORIZED_COMMIT_EVIDENCE_PRESENT" }
    } else {
      $attemptResults = @(& $runtimeInputRecordResolver -Path ([string]$lighthouseVerificationInput.lighthouseAttemptReceiptPath) -Sha256 ([string]$lighthouseVerificationInput.lighthouseAttemptReceiptSha256) -ExpectedSchema "hkwtia.pr6.lighthouse-attempt-receipt.v1")
      if ($attemptResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_COMMIT_ATTEMPT_RECEIPT_COUNT_INVALID" }
      $lighthouseAttemptReceipt = $attemptResults[0]
      if ([string]$lighthouseAttemptReceipt.repository -cne [string]$lighthouseVerificationInput.repository -or [string]$lighthouseAttemptReceipt.evidenceHead -cne $lighthouseEvidenceHead -or [string]$lighthouseAttemptReceipt.lighthouseAttemptStatus -cne $lighthouseAttemptStatus -or [bool]$lighthouseAttemptReceipt.providerProofCompleted -ne $providerProofCompleted -or [bool]$lighthouseAttemptReceipt.runCreated -ne $runCreated -or [bool]$lighthouseAttemptReceipt.retainedManifestCompleted -ne $retainedManifestCompleted -or [string]::IsNullOrWhiteSpace([string]$lighthouseAttemptReceipt.lastCompletedPhase)) { throw "PR6_LIGHTHOUSE_COMMIT_ATTEMPT_RECEIPT_INVALID" }
      if ($lighthouseAttemptStatus -ceq "PASSED") {
        if (-not $providerProofCompleted -or -not $runCreated -or -not $retainedManifestCompleted -or $null -ne $lighthouseAttemptReceipt.sanitizedFailure) { throw "PR6_LIGHTHOUSE_COMMIT_PASSED_ATTEMPT_INVALID" }
      } elseif ([string]::IsNullOrWhiteSpace([string]$lighthouseAttemptReceipt.sanitizedFailure)) {
        throw "PR6_LIGHTHOUSE_COMMIT_FAILED_ATTEMPT_MISSING_FAILURE"
      }

      if ($providerProofCompleted) {
        $providerResults = @(& $runtimeInputRecordResolver -Path ([string]$lighthouseVerificationInput.providerSanitizedEvidencePath) -Sha256 ([string]$lighthouseVerificationInput.providerSanitizedEvidenceSha256) -ExpectedSchema "hkwtia.pr6.provider-sanitized-evidence.v1")
        if ($providerResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_COMMIT_PROVIDER_EVIDENCE_COUNT_INVALID" }
        $providerSanitizedEvidence = $providerResults[0]
        if ([string]$providerSanitizedEvidence.repository -cne [string]$lighthouseVerificationInput.repository -or [string]$providerSanitizedEvidence.evidenceHead -cne $lighthouseEvidenceHead -or [string]$lighthouseAttemptReceipt.providerSanitizedEvidenceSha256 -cne [string]$lighthouseVerificationInput.providerSanitizedEvidenceSha256) { throw "PR6_LIGHTHOUSE_COMMIT_PROVIDER_EVIDENCE_INVALID" }
      } elseif ($null -ne $lighthouseVerificationInput.providerSanitizedEvidencePath -or $null -ne $lighthouseVerificationInput.providerSanitizedEvidenceSha256 -or $null -ne $lighthouseAttemptReceipt.providerSanitizedEvidenceSha256) {
        throw "PR6_LIGHTHOUSE_COMMIT_UNCOMPLETED_PROVIDER_EVIDENCE_PRESENT"
      }

      if ($runCreated) {
        $lighthouseRunRoot = [string]$lighthouseVerificationInput.runRoot
        if ([string]::IsNullOrWhiteSpace($lighthouseRunRoot) -or [string]$lighthouseAttemptReceipt.runRoot -cne $lighthouseRunRoot) { throw "PR6_LIGHTHOUSE_COMMIT_RUN_ROOT_INVALID" }
      } elseif ($null -ne $lighthouseVerificationInput.runRoot -or $null -ne $lighthouseAttemptReceipt.runRoot) {
        throw "PR6_LIGHTHOUSE_COMMIT_UNCREATED_RUN_ROOT_PRESENT"
      }

      if ($retainedManifestCompleted) {
        $retainedResults = @(& $runtimeInputRecordResolver -Path ([string]$lighthouseVerificationInput.retainedArtifactManifestPath) -Sha256 ([string]$lighthouseVerificationInput.retainedArtifactManifestSha256) -ExpectedSchema "hkwtia.pr6.lighthouse-retained-artifact-manifest.v1")
        if ($retainedResults.Count -ne 1) { throw "PR6_LIGHTHOUSE_COMMIT_RETAINED_EVIDENCE_COUNT_INVALID" }
        $retainedArtifactManifest = $retainedResults[0]
        if (-not $runCreated -or [string]$retainedArtifactManifest.repository -cne [string]$lighthouseVerificationInput.repository -or [string]$retainedArtifactManifest.evidenceHead -cne $lighthouseEvidenceHead -or [string]$retainedArtifactManifest.runRoot -cne $lighthouseRunRoot -or [string]$lighthouseAttemptReceipt.retainedArtifactManifestSha256 -cne [string]$lighthouseVerificationInput.retainedArtifactManifestSha256) { throw "PR6_LIGHTHOUSE_COMMIT_RETAINED_EVIDENCE_INVALID" }
        # RECORD-BARRIER: use the current externally approved kind/mode/source record; after any edit, complete Task 0's Refresh-Pr6ExecutionRecord protocol first.
        & $verifiedNode $lighthouseEntrypoint verify-commit --entrypoint-sha256 "$lighthouseEntrypointSha256" --config "$lighthouseConfig" --config-sha256 "$lighthouseConfigSha256" --checkpoint "$lighthouseCheckpoint" --checkpoint-sha256 "$lighthouseCheckpointSha256" --run-root "$lighthouseRunRoot" --expected-attempt-status "$lighthouseAttemptStatus" --evidence-head "$lighthouseEvidenceHead" --head "$finalHead"
        if ($LASTEXITCODE -ne 0) { throw "PR6_LIGHTHOUSE_COLLECTION_BINDING_FAILED" }
      } elseif ($null -ne $lighthouseVerificationInput.retainedArtifactManifestPath -or $null -ne $lighthouseVerificationInput.retainedArtifactManifestSha256 -or $null -ne $lighthouseAttemptReceipt.retainedArtifactManifestSha256) {
        throw "PR6_LIGHTHOUSE_COMMIT_UNCOMPLETED_RETAINED_MANIFEST_PRESENT"
      }
    }

    if ($fieldInpStatus -ceq "UNAUTHORIZED") {
      if ($null -ne $lighthouseVerificationInput.fieldInpEvidencePath -or $null -ne $lighthouseVerificationInput.fieldInpEvidenceSha256) { throw "PR6_FIELD_INP_COMMIT_UNAUTHORIZED_EVIDENCE_PRESENT" }
    } else {
      $fieldInpResults = @(& $runtimeInputRecordResolver -Path ([string]$lighthouseVerificationInput.fieldInpEvidencePath) -Sha256 ([string]$lighthouseVerificationInput.fieldInpEvidenceSha256) -ExpectedSchema "hkwtia.pr6.field-inp-evidence.v1")
      if ($fieldInpResults.Count -ne 1) { throw "PR6_FIELD_INP_COMMIT_EVIDENCE_COUNT_INVALID" }
      $fieldInpEvidence = $fieldInpResults[0]
      $fieldInpPassCondition = ([bool]$fieldInpEvidence.sampleSufficient -and [double]$fieldInpEvidence.p75Milliseconds -le 200)
      if (-not $providerProofCompleted -or [string]$fieldInpEvidence.repository -cne [string]$lighthouseVerificationInput.repository -or [string]$fieldInpEvidence.evidenceHead -cne $lighthouseEvidenceHead -or [string]$fieldInpEvidence.status -cne $fieldInpStatus -or [int]$fieldInpEvidence.thresholdMilliseconds -ne 200 -or ($fieldInpStatus -ceq "PASSED" -and -not $fieldInpPassCondition) -or ($fieldInpStatus -ceq "NOT_PASSED" -and $fieldInpPassCondition)) { throw "PR6_FIELD_INP_COMMIT_EVIDENCE_INVALID" }
    }

    & $verifiedGit diff --name-status 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...$finalHead
    & $verifiedGit diff --check 3856dd71842f9a2e1d9c4b7a46521416a5bd83ae...$finalHead
    & $verifiedGit status --short

    Expected: approved PR6 files only, cohesive commits, no range whitespace errors, and a clean worktree after all applicable executable verification paths. The first `verify-commit` always revalidates the attested Node/Git/LHCI identities, checkpoint hash, effective exact-path attributes/config, deletion tombstone, exact evidence-head ancestry, and every final `HEAD:<path>` OID/blob byte hash against the credential-free checkpoint—even when collection was unauthorized or an authorized attempt failed before creating a run. Every authorized attempt additionally resolves and binds its immutable attempt receipt; provider evidence is required exactly when provider proof completed; the canonical run root is required exactly when created. The second call runs only when retention-manifest finalization completed and binds that manifest/root, attempt status, and available pre/post raw diagnostics/materialized staged bytes without turning a failure into a pass. A run-root creation followed by retention-manifest failure remains representable and reported through the receipt without opening an untyped root. Field-INP evidence is independently required and threshold-checked whenever its status is not `UNAUTHORIZED`. Any checkpoint, staged blob, final blob, attribute/config, executable, tombstone, conditional-evidence, field threshold, or collected-run mismatch fails. An unauthorized attempt invents no evidence; an authorized failure retains what completed; a successful Lighthouse attempt with missing/noncompliant field INP still leaves the overall gate `NOT_PASSED`; only both statuses `PASSED` map it to `PASSED`. Preserve `$finalHead` in the immutable review package and publication checks; do not amend the committed verification document merely to self-record its own SHA.

- [ ] **Step 9: Complete independent review and publish the stacked draft PR**

    Generate the final immutable review package from PR5 head to the committed PR6 head. A fresh reviewer must inspect the approved spec, this plan, the complete diff, focused RED/GREEN evidence, full verification record, authorization/import boundaries, and rollback statement. This is the only review that can close the suite manifest's complete nonempty `PENDING_FINAL_REVIEW` set: resolve the immutable suite manifest and expected-command inventory, require their hashes and per-task RED/GREEN matrix, then resolve every ordered pre-authoring Task 12 AGGREGATE execution-source manifest and cleanup receipt, recompute the pending count plus entry/source/cleanup aggregates, inspect the full set against the committed Task 12 diff and final verification-document blob, and bind all closure fields plus the immutable Step 7/8 post-authoring command/exit/commit-verification evidence aggregate into `reviewerEvidenceSha256` in the verdict. Resolve findings and repeat review until the result is zero Critical, zero Important, and zero Minor.

    The zero-finding verdict must print the exact 40-character reviewed commit SHA and be serialized into immutable `hkwtia.pr6.zero-finding-review-package.v1`; its exact suite-manifest/expected-inventory hashes, pending Task 12 count and ordered entry/source/cleanup aggregates, and final verification-document path/blob OID/raw SHA-256/byte length prove that the complete pre-commit command set is now reviewed at the final committed head. After the separate publication approval, the trusted launcher/CI issues one `hkwtia.pr6.publication-input.v1` that duplicates those closure fields and binds that review package and the publication descriptor. Open one fresh publication PowerShell session, rerun Task 0's core bootstrap, and resolve both launcher-delivered non-secret records without console or environment input:

    $publicationInputs = @(& $runtimeInputRecordResolver -Path $operationInputRecordPath -Sha256 $operationInputRecordSha256 -ExpectedSchema "hkwtia.pr6.publication-input.v1")
    if ($publicationInputs.Count -ne 1) { throw "PR6_PUBLICATION_INPUT_COUNT_INVALID" }
    $publicationInput = $publicationInputs[0]
    $reviewPackages = @(& $runtimeInputRecordResolver -Path ([string]$publicationInput.reviewPackagePath) -Sha256 ([string]$publicationInput.reviewPackageSha256) -ExpectedSchema "hkwtia.pr6.zero-finding-review-package.v1")
    if ($reviewPackages.Count -ne 1) { throw "PR6_REVIEW_PACKAGE_COUNT_INVALID" }
    $reviewPackage = $reviewPackages[0]
    $approvedPlanRecords = @(& $runtimeInputRecordResolver -Path ([string]$publicationInput.approvedPlanRecordPath) -Sha256 ([string]$publicationInput.approvedPlanRecordSha256) -ExpectedSchema "hkwtia.pr6.approved-plan.v1")
    if ($approvedPlanRecords.Count -ne 1) { throw "PR6_APPROVED_PLAN_RECORD_COUNT_INVALID" }
    $approvedPlanRecord = $approvedPlanRecords[0]

    $expectedOwner = "YNWAforever"
    $expectedBranch = "codex/wisetech-pr6-join-portal-admin"
    $expectedBaseBranch = "codex/wisetech-pr5-public-journeys"
    $expectedBase = "3856dd71842f9a2e1d9c4b7a46521416a5bd83ae"
    $expectedSpec = "8c83969e9f2244dadf8f9c9e3bc4d4431320c94a"
    $expectedRepo = "YNWAforever/wisetech"
    $expectedRepoUrl = "https://github.com/YNWAforever/wisetech"
    $expectedGitRemote = "https://github.com/YNWAforever/wisetech.git"
    $expectedPlanPath = "docs/superpowers/plans/2026-08-29-wisetech-pr6-join-portal-admin.md"
    $expectedPlan = [string]$approvedPlanRecord.approvedPlanCommit
    $expectedPlanParent = [string]$approvedPlanRecord.approvedPlanParent
    $expectedPlanBlobOid = [string]$approvedPlanRecord.approvedPlanBlobOid
    $expectedPlanSha256 = [string]$approvedPlanRecord.approvedPlanBlobSha256
    $expectedPlanCheckoutSha256 = [string]$approvedPlanRecord.approvedCheckoutSha256
    $expectedPlanAttributesSha256 = [string]$approvedPlanRecord.effectiveAttributesSha256
    $reviewedHead = [string]$reviewPackage.reviewedHead
    $reviewerEvidenceSha256 = [string]$reviewPackage.reviewerEvidenceSha256
    $suiteEvidenceManifestSha256 = [string]$reviewPackage.suiteEvidenceManifestSha256
    $expectedSuiteEvidenceEntriesSha256 = [string]$reviewPackage.expectedSuiteEvidenceEntriesSha256
    $pendingTask12EntryCount = [int]$reviewPackage.pendingTask12EntryCount
    $pendingTask12EntryIdentityAggregateSha256 = [string]$reviewPackage.pendingTask12EntryIdentityAggregateSha256
    $pendingTask12SourceManifestAggregateSha256 = [string]$reviewPackage.pendingTask12SourceManifestAggregateSha256
    $pendingTask12CleanupReceiptAggregateSha256 = [string]$reviewPackage.pendingTask12CleanupReceiptAggregateSha256
    $finalVerificationDocumentPath = [string]$reviewPackage.verificationDocumentPath
    $finalVerificationDocumentBlobOid = [string]$reviewPackage.verificationDocumentBlobOid
    $finalVerificationDocumentBlobSha256 = [string]$reviewPackage.verificationDocumentBlobSha256
    $finalVerificationDocumentBlobByteLength = [long]$reviewPackage.verificationDocumentBlobByteLength
    if ($reviewedHead -cnotmatch "^[0-9a-f]{40}$" -or $expectedPlan -cnotmatch "^[0-9a-f]{40}$" -or $expectedPlanParent -cnotmatch "^[0-9a-f]{40}$" -or $expectedPlanBlobOid -cnotmatch "^[0-9a-f]{40}$" -or $expectedPlanSha256 -cnotmatch "^[0-9a-f]{64}$" -or $expectedPlanCheckoutSha256 -cnotmatch "^[0-9a-f]{64}$" -or $expectedPlanAttributesSha256 -cnotmatch "^[0-9a-f]{64}$") { throw "PR6_APPROVED_PLAN_IDENTITY_INVALID" }
    if ($reviewerEvidenceSha256 -cnotmatch "^[0-9a-f]{64}$" -or $suiteEvidenceManifestSha256 -cnotmatch "^[0-9a-f]{64}$" -or $expectedSuiteEvidenceEntriesSha256 -cnotmatch "^[0-9a-f]{64}$" -or $pendingTask12EntryCount -lt 1 -or $pendingTask12EntryIdentityAggregateSha256 -cnotmatch "^[0-9a-f]{64}$" -or $pendingTask12SourceManifestAggregateSha256 -cnotmatch "^[0-9a-f]{64}$" -or $pendingTask12CleanupReceiptAggregateSha256 -cnotmatch "^[0-9a-f]{64}$" -or $finalVerificationDocumentPath -cne "docs/integration/wisetech-pr6-verification.md" -or $finalVerificationDocumentBlobOid -cnotmatch "^[0-9a-f]{40}$" -or $finalVerificationDocumentBlobSha256 -cnotmatch "^[0-9a-f]{64}$" -or $finalVerificationDocumentBlobByteLength -le 0) { throw "PR6_FINAL_REVIEW_TASK12_CLOSURE_INVALID" }
    if ([string]$approvedPlanRecord.repository -cne $expectedRepo -or [string]$approvedPlanRecord.branch -cne $expectedBranch -or [string]$approvedPlanRecord.approvedPlanPath -cne $expectedPlanPath -or [string]$approvedPlanRecord.soleChangedPath -cne $expectedPlanPath) { throw "PR6_APPROVED_PLAN_SCOPE_INVALID" }
    if ([string]$reviewPackage.repository -cne $expectedRepo -or [string]$reviewPackage.branch -cne $expectedBranch -or [string]$reviewPackage.baseOid -cne $expectedBase -or [string]$reviewPackage.specOid -cne $expectedSpec -or [int]$reviewPackage.findings.critical -ne 0 -or [int]$reviewPackage.findings.important -ne 0 -or [int]$reviewPackage.findings.minor -ne 0) { throw "PR6_REVIEW_PACKAGE_NOT_ZERO_FINDING" }
    if ([string]$reviewPackage.approvedPlanRecordPath -cne ([string]$publicationInput.approvedPlanRecordPath) -or [string]$reviewPackage.approvedPlanRecordSha256 -cne ([string]$publicationInput.approvedPlanRecordSha256) -or [string]$reviewPackage.approvedPlanCommit -cne $expectedPlan -or [string]$reviewPackage.approvedPlanPath -cne $expectedPlanPath -or [string]$reviewPackage.approvedPlanBlobOid -cne $expectedPlanBlobOid -or [string]$reviewPackage.approvedPlanBlobSha256 -cne $expectedPlanSha256 -or [string]$reviewPackage.approvedCheckoutSha256 -cne $expectedPlanCheckoutSha256 -or [string]$reviewPackage.effectiveAttributesSha256 -cne $expectedPlanAttributesSha256 -or [string]$publicationInput.suiteEvidenceManifestSha256 -cne $suiteEvidenceManifestSha256 -or [string]$publicationInput.expectedSuiteEvidenceEntriesSha256 -cne $expectedSuiteEvidenceEntriesSha256 -or [int]$publicationInput.pendingTask12EntryCount -ne $pendingTask12EntryCount -or [string]$publicationInput.pendingTask12EntryIdentityAggregateSha256 -cne $pendingTask12EntryIdentityAggregateSha256 -or [string]$publicationInput.pendingTask12SourceManifestAggregateSha256 -cne $pendingTask12SourceManifestAggregateSha256 -or [string]$publicationInput.pendingTask12CleanupReceiptAggregateSha256 -cne $pendingTask12CleanupReceiptAggregateSha256 -or [string]$publicationInput.verificationDocumentPath -cne $finalVerificationDocumentPath -or [string]$publicationInput.verificationDocumentBlobOid -cne $finalVerificationDocumentBlobOid -or [string]$publicationInput.verificationDocumentBlobSha256 -cne $finalVerificationDocumentBlobSha256 -or [long]$publicationInput.verificationDocumentBlobByteLength -ne $finalVerificationDocumentBlobByteLength) { throw "PR6_REVIEW_PACKAGE_BINDING_MISMATCH" }
    if ([string]$publicationInput.repository -cne $expectedRepo -or [string]$publicationInput.headBranch -cne $expectedBranch -or [string]$publicationInput.baseBranch -cne $expectedBaseBranch -or [string]$publicationInput.baseOid -cne $expectedBase -or [string]$publicationInput.specOid -cne $expectedSpec -or [string]$publicationInput.approvedPlanCommit -cne $expectedPlan -or [string]$publicationInput.reviewedHead -cne $reviewedHead -or [string]$publicationInput.planPath -cne $expectedPlanPath -or [string]$publicationInput.planBlobOid -cne $expectedPlanBlobOid -or [string]$publicationInput.planBlobSha256 -cne $expectedPlanSha256 -or [string]$publicationInput.planCheckoutSha256 -cne $expectedPlanCheckoutSha256 -or [string]$publicationInput.planAttributesSha256 -cne $expectedPlanAttributesSha256 -or [string]$publicationInput.suiteEvidenceManifestSha256 -cne $suiteEvidenceManifestSha256 -or [string]$publicationInput.expectedSuiteEvidenceEntriesSha256 -cne $expectedSuiteEvidenceEntriesSha256 -or [int]$publicationInput.pendingTask12EntryCount -ne $pendingTask12EntryCount -or [string]$publicationInput.pendingTask12EntryIdentityAggregateSha256 -cne $pendingTask12EntryIdentityAggregateSha256 -or [string]$publicationInput.pendingTask12SourceManifestAggregateSha256 -cne $pendingTask12SourceManifestAggregateSha256 -or [string]$publicationInput.pendingTask12CleanupReceiptAggregateSha256 -cne $pendingTask12CleanupReceiptAggregateSha256 -or [string]$publicationInput.verificationDocumentPath -cne $finalVerificationDocumentPath -or [string]$publicationInput.verificationDocumentBlobOid -cne $finalVerificationDocumentBlobOid -or [string]$publicationInput.verificationDocumentBlobSha256 -cne $finalVerificationDocumentBlobSha256 -or [long]$publicationInput.verificationDocumentBlobByteLength -ne $finalVerificationDocumentBlobByteLength) { throw "PR6_PUBLICATION_INPUT_BINDING_MISMATCH" }

    $publicationApprovalPath = [string]$publicationInput.publicationApprovalPath
    $publicationApprovalSha256 = [string]$publicationInput.publicationApprovalSha256
    $verifiedGit = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool Git -PublicationApprovalPath $publicationApprovalPath -PublicationApprovalSha256 $publicationApprovalSha256 -Arguments @($args) }.GetNewClosure()
    $verifiedGitBlobSha256 = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool GitBlobSha256 -PublicationApprovalPath $publicationApprovalPath -PublicationApprovalSha256 $publicationApprovalSha256 -Arguments @($args) }.GetNewClosure()
    $verifiedGh = { & $runtimeInvoker -NativeProcessBoundaryScriptBlock $runtimeNativeProcessBoundary -GuardianScriptBlock $runtimeGuardian -AttestationPath $runtimeDescriptorPath -AttestationSha256 $runtimeDescriptorSha256 -OperationInputRecordPath $operationInputRecordPath -OperationInputRecordSha256 $operationInputRecordSha256 -Tool GitHubCli -PublicationApprovalPath $publicationApprovalPath -PublicationApprovalSha256 $publicationApprovalSha256 -Arguments @($args) }.GetNewClosure()

    The publication descriptor is exact `hkwtia.pr6.publication-approval.v1` and must bind `github.com`, `YNWAforever/wisetech`, expected head/base branches/base/spec/approved-plan OIDs, exact approved-plan record/literal path/blob OID/raw blob SHA-256/docs-only origin, and reviewed head, complete immutable Git executable/HTTPS transport/shell/helper and GitHub CLI distributions, approved canonical config directory, fixed operation allowlists/deadlines, and approval reference. It contains no credential. The invoker clears ambient Git/GH/proxy/config/helper/hook state, holds the complete closure through exit, and permits only the launcher-brokered child-tree `GH_TOKEN` plus verified `gh auth git-credential` helper for exact GitHub HTTPS operations. Credential bytes may traverse only Task 0's non-inheritable contained helper-to-Git pipe; that pipe is never captured or exposed to this PowerShell session/caller, and no credential reaches logs, receipts, or disk. The separate reconciliation descriptor and immutable receipt pair have the exact Task 0 schemas and cannot mutate.

    Publication budgets are enforced inside the argument allowlist: 30 seconds local Git, 60 seconds each read, 120 seconds each mutation, then at most 10 seconds for complete tree termination/handle close. Every mutation must create STARTED before process creation and SUCCEEDED only on clean zero exit. On timeout/cancellation/broken pipe/transport loss or uncertain exit, the invoker creates OUTCOME_UNCERTAIN, revokes both publication invokers, throws, and terminates this block before any same-shell discovery. Do not catch that exception here. Only a fresh reconciliation-only shell may perform the exact receipt-bound reads and must stop after reporting the push/create/close outcome categories defined in Task 0; no retry or continuation is authorized. Subprocess tests hang Git/gh/helper/transport at each boundary and prove receipts, full-tree cancellation, no fall-through, no retry, and the read-only reconciliation allowlist.

    Define the remaining immutable names from those validated records, never from current `HEAD`:

    $remoteHeadRef = "refs/heads/$expectedBranch"
    $bodyPath = "docs/integration/wisetech-pr6-pr-body.md"
    & $verifiedGit cat-file -e "$reviewedHead^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "PR6_REVIEWED_HEAD_MISSING" }
    & $verifiedGit cat-file -e "$expectedPlan^{commit}"
    if ($LASTEXITCODE -ne 0) { throw "PR6_APPROVED_PLAN_COMMIT_MISSING" }
    $livePlanParent = ((@(& $verifiedGit rev-parse "$expectedPlan^")) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $livePlanParent -cne $expectedPlanParent) { throw "PR6_APPROVED_PLAN_PARENT_MISMATCH" }
    $planOrigin = @(& $verifiedGit diff-tree --no-commit-id --name-status -r $expectedPlan)
    if ($LASTEXITCODE -ne 0 -or $planOrigin.Count -ne 1 -or [string]$planOrigin[0] -cne ("M" + [char]9 + $expectedPlanPath)) { throw "PR6_APPROVED_PLAN_NOT_DOCS_ONLY" }
    $planSpec = $expectedPlan + ":" + $expectedPlanPath
    $livePlanBlobOid = ((@(& $verifiedGit rev-parse $planSpec)) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $livePlanBlobOid -cne $expectedPlanBlobOid) { throw "PR6_APPROVED_PLAN_BLOB_MISMATCH" }
    $planBlobHashResults = @(& $verifiedGitBlobSha256 cat-file blob $expectedPlanBlobOid)
    if ($planBlobHashResults.Count -ne 1) { throw "PR6_APPROVED_PLAN_BLOB_HASH_RESULT_COUNT_INVALID" }
    $planBlobHashResult = $planBlobHashResults[0]
    if ($planBlobHashResult.schema -cne "hkwtia.pr6.git-blob-sha256.v1" -or $planBlobHashResult.oid -cne $expectedPlanBlobOid -or $planBlobHashResult.sha256 -cne $expectedPlanSha256 -or [long]$planBlobHashResult.byteLength -le 0) { throw "PR6_APPROVED_PLAN_RAW_BLOB_HASH_MISMATCH" }
    $liveFinalVerificationDocumentBlobOid = ((@(& $verifiedGit rev-parse ($reviewedHead + ":" + $finalVerificationDocumentPath))) -join "`n").Trim()
    if ($LASTEXITCODE -ne 0 -or $liveFinalVerificationDocumentBlobOid -cne $finalVerificationDocumentBlobOid) { throw "PR6_FINAL_REVIEW_DOCUMENT_BLOB_OID_MISMATCH" }
    $liveFinalVerificationDocumentHashResults = @(& $verifiedGitBlobSha256 cat-file blob $liveFinalVerificationDocumentBlobOid)
    if ($liveFinalVerificationDocumentHashResults.Count -ne 1) { throw "PR6_FINAL_REVIEW_DOCUMENT_BLOB_HASH_COUNT_INVALID" }
    $liveFinalVerificationDocumentHashResult = $liveFinalVerificationDocumentHashResults[0]
    if ($liveFinalVerificationDocumentHashResult.schema -cne "hkwtia.pr6.git-blob-sha256.v1" -or [string]$liveFinalVerificationDocumentHashResult.sha256 -cne $finalVerificationDocumentBlobSha256 -or [long]$liveFinalVerificationDocumentHashResult.byteLength -ne $finalVerificationDocumentBlobByteLength) { throw "PR6_FINAL_REVIEW_DOCUMENT_RAW_BLOB_MISMATCH" }
    $planIndexLines = @(& $verifiedGit ls-files --stage -- $expectedPlanPath)
    $expectedPlanIndexLine = "100644 $expectedPlanBlobOid 0" + [char]9 + $expectedPlanPath
    if ($LASTEXITCODE -ne 0 -or $planIndexLines.Count -ne 1 -or [string]$planIndexLines[0] -cne $expectedPlanIndexLine) { throw "PR6_APPROVED_PLAN_INDEX_IDENTITY_MISMATCH" }
    $planCheckoutPath = [IO.Path]::GetFullPath((Join-Path ([string]$verifiedRuntime.RepositoryRoot) $expectedPlanPath))
    $planCheckoutBytes = [IO.File]::ReadAllBytes($planCheckoutPath)
    $planCheckoutSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($planCheckoutBytes)).ToLowerInvariant()
    [Array]::Clear($planCheckoutBytes, 0, $planCheckoutBytes.Length)
    if ($planCheckoutSha256 -cne $expectedPlanCheckoutSha256) { throw "PR6_APPROVED_PLAN_CHECKOUT_HASH_MISMATCH" }

    The verified Git adapter already disables system/global/repository execution controls, hooks, fsmonitor, askpass, arbitrary helpers, proxies, and URL rewrites. First assert its effective isolated config exposes no `url.*` section. Then define and run the complete local-state assertion before the first credentialed GitHub or remote-Git request. Only after that may the independently bound GitHub CLI read repository identity; the local `origin` is intentionally never read or used because this checkout may belong to another repository:

    $urlRewriteLines = @(& $verifiedGit config --show-origin --get-regexp "^url\.")
    $urlRewriteExit = $LASTEXITCODE
    if ($urlRewriteExit -ne 0 -and $urlRewriteExit -ne 1) { throw "PR6_GIT_URL_REWRITE_CHECK_FAILED" }
    if ($urlRewriteLines.Count -ne 0) { throw "PR6_GIT_URL_REWRITE_PRESENT" }


    Define fail-closed helpers. They validate native-command exit codes, exact branch, every tracked/untracked status entry, detached-HEAD/ref drift, unambiguous remote refs, and exact repository-owner/head PR identity:

    function Assert-Pr6LocalState([string] $phase) {
      $branchLines = @(& $verifiedGit branch --show-current)
      if ($LASTEXITCODE -ne 0) { throw "PR6_BRANCH_LOOKUP_FAILED:$phase" }
      $branch = ($branchLines -join "`n").Trim()
      if ($branch -cne $expectedBranch) { throw "PR6_BRANCH_MISMATCH:$phase" }

      $statusLines = @(& $verifiedGit status --porcelain=v1 --untracked-files=all)
      if ($LASTEXITCODE -ne 0) { throw "PR6_STATUS_LOOKUP_FAILED:$phase" }
      if ($statusLines.Count -ne 0) { throw "PR6_WORKTREE_NOT_CLEAN:$phase" }

      $headLines = @(& $verifiedGit rev-parse HEAD)
      if ($LASTEXITCODE -ne 0) { throw "PR6_HEAD_LOOKUP_FAILED:$phase" }
      $head = ($headLines -join "`n").Trim()
      $branchHeadLines = @(& $verifiedGit rev-parse "refs/heads/$expectedBranch")
      if ($LASTEXITCODE -ne 0) { throw "PR6_BRANCH_REF_LOOKUP_FAILED:$phase" }
      $branchHead = ($branchHeadLines -join "`n").Trim()
      if ($head -cne $reviewedHead -or $branchHead -cne $reviewedHead) {
        throw "PR6_LOCAL_REVIEW_BINDING_FAILED:$phase"
      }
      & $verifiedGit merge-base --is-ancestor $expectedBase $head
      if ($LASTEXITCODE -ne 0) { throw "PR6_LOCAL_PR5_ANCESTRY_INVALID:$phase" }
      & $verifiedGit merge-base --is-ancestor $expectedSpec $head
      if ($LASTEXITCODE -ne 0) { throw "PR6_LOCAL_SPEC_ANCESTRY_INVALID:$phase" }
      & $verifiedGit merge-base --is-ancestor $expectedPlan $head
      if ($LASTEXITCODE -ne 0) { throw "PR6_LOCAL_APPROVED_PLAN_ANCESTRY_INVALID:$phase" }
      $phasePlanOid = ((@(& $verifiedGit rev-parse $planSpec)) -join "`n").Trim()
      if ($LASTEXITCODE -ne 0 -or $phasePlanOid -cne $expectedPlanBlobOid) { throw "PR6_LOCAL_APPROVED_PLAN_BLOB_INVALID:$phase" }
      $phasePlanHashes = @(& $verifiedGitBlobSha256 cat-file blob $expectedPlanBlobOid)
      if ($phasePlanHashes.Count -ne 1 -or $phasePlanHashes[0].schema -cne "hkwtia.pr6.git-blob-sha256.v1" -or $phasePlanHashes[0].sha256 -cne $expectedPlanSha256) { throw "PR6_LOCAL_APPROVED_PLAN_HASH_INVALID:$phase" }
    }

    Assert-Pr6LocalState "pre-provider-identity"
    $repoJsonLines = @(& $verifiedGh repo view $expectedRepo --json nameWithOwner,url)
    if ($LASTEXITCODE -ne 0) { throw "PR6_GITHUB_REPOSITORY_LOOKUP_FAILED" }
    try {
      $repository = (($repoJsonLines -join "`n") | ConvertFrom-Json)
    } catch {
      throw "PR6_GITHUB_REPOSITORY_JSON_INVALID"
    }
    if ($repository.nameWithOwner -cne $expectedRepo -or $repository.url -cne $expectedRepoUrl) {
      throw "PR6_GITHUB_REPOSITORY_IDENTITY_MISMATCH"
    }

    function Get-Pr6OptionalRemoteOid([string] $ref, [string] $errorCode) {
      $remoteLines = @(& $verifiedGit ls-remote $expectedGitRemote $ref)
      if ($LASTEXITCODE -ne 0) { throw $errorCode }
      if ($remoteLines.Count -eq 0) { return $null }
      if ($remoteLines.Count -ne 1) { throw $errorCode }
      $fields = @($remoteLines[0] -split "\s+")
      if ($fields.Count -lt 2 -or $fields[0] -cnotmatch "^[0-9a-f]{40}$" -or $fields[1] -cne $ref) {
        throw $errorCode
      }
      return $fields[0]
    }

    function Get-Pr6RemoteOid([string] $ref, [string] $errorCode) {
      $oid = Get-Pr6OptionalRemoteOid $ref $errorCode
      if ($null -eq $oid) { throw $errorCode }
      return $oid
    }

    function Assert-Pr6RemoteBase([string] $phase) {
      $remoteBase = Get-Pr6RemoteOid "refs/heads/$expectedBaseBranch" "PR6_REMOTE_BASE_LOOKUP_FAILED:$phase"
      if ($remoteBase -cne $expectedBase) { throw "PR6_REMOTE_BASE_DRIFT:$phase" }
    }

    function Get-Pr6OpenHeadPrs([string] $phase) {
      $listLines = @(& $verifiedGh pr list --repo $expectedRepo --state open --head $expectedBranch --limit 1000 --json number,url,headRefName,headRepositoryOwner)
      if ($LASTEXITCODE -ne 0) { throw "PR6_PR_DISCOVERY_FAILED:$phase" }
      try {
        $parsed = (($listLines -join "`n") | ConvertFrom-Json)
      } catch {
        throw "PR6_PR_DISCOVERY_JSON_INVALID:$phase"
      }
      $exact = @(@($parsed) | Where-Object {
        $_.headRefName -ceq $expectedBranch -and
        $_.headRepositoryOwner.login -ceq $expectedOwner
      })
      return @($exact)
    }

    Assert-Pr6LocalState "pre-body"
    Assert-Pr6RemoteBase "pre-body"
    $openHeadPrs = @(Get-Pr6OpenHeadPrs "pre-body")
    if ($openHeadPrs.Count -ne 0) { throw "PR6_PREEXISTING_OPEN_HEAD_PR:pre-body" }

    Source the PR body only from the reviewed commit blob. Never read the mutable working-tree file for publication or verification:

    $bodySpec = "${reviewedHead}:$bodyPath"
    $bodyLines = @(& $verifiedGit show --no-ext-diff --no-textconv $bodySpec)
    if ($LASTEXITCODE -ne 0) { throw "PR6_REVIEWED_BODY_READ_FAILED" }
    $expectedBody = (($bodyLines -join "`n") -replace "`r`n", "`n").TrimEnd("`r", "`n")
    if ([string]::IsNullOrWhiteSpace($expectedBody)) { throw "PR6_REVIEWED_BODY_EMPTY" }

    Immediately before any push, repeat local/base/open-PR checks and inspect the exact remote head. A different SHA fails without mutation. If absent, use the empty-expectation lease solely as atomic create-if-absent. The verified invoker writes the STARTED receipt before child creation and returns only after the matching SUCCEEDED receipt; OUTCOME_UNCERTAIN throws and ends this block, so the post-push lookup below is unreachable in that case:

    Assert-Pr6LocalState "pre-push"
    Assert-Pr6RemoteBase "pre-push"
    $openHeadPrs = @(Get-Pr6OpenHeadPrs "pre-push")
    if ($openHeadPrs.Count -ne 0) { throw "PR6_PREEXISTING_OPEN_HEAD_PR:pre-push" }
    $remoteHeadBefore = Get-Pr6OptionalRemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:pre-push"
    if ($null -ne $remoteHeadBefore -and $remoteHeadBefore -cne $reviewedHead) {
      throw "PR6_REMOTE_HEAD_DRIFT:pre-push"
    }
    if ($null -eq $remoteHeadBefore) {
      $createOnlyLease = "--force-with-lease=${remoteHeadRef}:"
      $pushRefspec = "${reviewedHead}:$remoteHeadRef"
      & $verifiedGit push $createOnlyLease $expectedGitRemote $pushRefspec
      if ($LASTEXITCODE -ne 0) { throw "PR6_CREATE_ONLY_PUSH_FAILED" }
    }

    $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:post-push"
    if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:post-push" }

    Immediately before PR creation, reassert the exact local branch/clean/ref state, immutable remote base, pushed remote head, and absence of an existing exact-owner/head open PR. No command that can create a commit, update a branch, or edit a file may intervene:

    Assert-Pr6LocalState "pre-create"
    Assert-Pr6RemoteBase "pre-create"
    $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:pre-create"
    if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:pre-create" }
    $preExistingPrs = @(Get-Pr6OpenHeadPrs "pre-create")
    if ($preExistingPrs.Count -ne 0) { throw "PR6_PREEXISTING_OPEN_HEAD_PR:pre-create" }

    Create the stacked draft with the reviewed-blob body. The invoker writes STARTED before child creation and returns only with a SUCCEEDED receipt; uncertainty throws and terminates the block before discovery. A clean returned command must have zero native exit and exactly one exact repository URL/number on stdout. Only then may independent exact owner/head discovery validate it. An absent/ambiguous stdout identity fails for manual inspection without discovering or closing a candidate.

    $createOutput = @(& $verifiedGh pr create --repo $expectedRepo --draft --base $expectedBaseBranch --head $expectedBranch --title "feat: align WiseTech Join Portal and Admin" --body $expectedBody)
    $createExit = $LASTEXITCODE
    if ($createExit -ne 0) { throw "PR6_PR_CREATE_DID_NOT_RETURN_CLEAN_SUCCESS" }

    $stdoutIdentities = @()
    foreach ($line in $createOutput) {
      $stdoutMatch = [regex]::Match(([string]$line).Trim(), "^https://github\.com/YNWAforever/wisetech/pull/([1-9][0-9]*)$")
      if ($stdoutMatch.Success) {
        $stdoutIdentities += [pscustomobject]@{
          number = $stdoutMatch.Groups[1].Value
          url = $stdoutMatch.Value
        }
      }
    }

    if ($stdoutIdentities.Count -ne 1) {
      throw "PR6_CREATED_PR_STDOUT_IDENTITY_INVALID:COUNT_$($stdoutIdentities.Count)"
    }
    $createdPrNumber = [string]$stdoutIdentities[0].number
    $prUrl = [string]$stdoutIdentities[0].url

    Validate the exact stdout-captured draft. Every read must return cleanly under its fixed deadline before the next read; a timeout, cancellation, broken pipe, transport error, malformed response, or semantic mismatch stops publication immediately. The plan performs no automatic close or other cleanup mutation after creation; the exact captured draft remains visible for manual inspection and a later close, if explicitly authorized, must use its own publication receipt and uncertainty/reconciliation gate:

    $postCreateCandidates = @(Get-Pr6OpenHeadPrs "post-create-discovery")
    if ($postCreateCandidates.Count -ne 1 -or [string]($postCreateCandidates[0].number) -cne $createdPrNumber) {
      throw "PR6_CREATED_PR_DISCOVERY_MISMATCH"
    }
    Assert-Pr6LocalState "post-create"
    Assert-Pr6RemoteBase "post-create"
    $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:post-create"
    if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:post-create" }

    $viewJsonLines = @(& $verifiedGh pr view $createdPrNumber --repo $expectedRepo --json url,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,headRepositoryOwner,body,mergeStateStatus,statusCheckRollup)
    if ($LASTEXITCODE -ne 0) { throw "PR6_PR_VIEW_FAILED" }
    try {
      $published = (($viewJsonLines -join "`n") | ConvertFrom-Json)
    } catch {
      throw "PR6_PR_VIEW_JSON_INVALID"
    }
    $publishedBody = (($published.body -replace "`r`n", "`n")).TrimEnd("`r", "`n")
    if ($published.url -cne $prUrl) { throw "PR6_PR_URL_MISMATCH" }
    if ($published.state -cne "OPEN") { throw "PR6_PR_NOT_OPEN" }
    if ($published.isDraft -ne $true) { throw "PR6_PR_NOT_DRAFT" }
    if ($publishedBody -cne $expectedBody) { throw "PR6_PR_BODY_MISMATCH" }
    if ($published.baseRefName -cne $expectedBaseBranch -or $published.baseRefOid -cne $expectedBase) {
      throw "PR6_PR_BASE_MISMATCH"
    }
    if ($published.headRefName -cne $expectedBranch -or $published.headRepositoryOwner.login -cne $expectedOwner -or $published.headRefOid -cne $reviewedHead) {
      throw "PR6_PR_HEAD_MISMATCH"
    }
    Assert-Pr6LocalState "post-validate"
    Assert-Pr6RemoteBase "post-validate"
    $remoteHead = Get-Pr6RemoteOid $remoteHeadRef "PR6_REMOTE_HEAD_LOOKUP_FAILED:post-validate"
    if ($remoteHead -cne $reviewedHead) { throw "PR6_REMOTE_HEAD_MISMATCH:post-validate" }
    $finalCandidates = @(Get-Pr6OpenHeadPrs "post-validate")
    if ($finalCandidates.Count -ne 1 -or [string]($finalCandidates[0].number) -cne $createdPrNumber) {
      throw "PR6_OPEN_HEAD_PR_SET_CHANGED"
    }

    Expected on the uninterrupted happy path: one OPEN draft PR at the captured URL with exact reviewed-commit body, base name/OID `codex/wisetech-pr5-public-journeys`/`3856dd71842f9a2e1d9c4b7a46521416a5bd83ae`, and local branch/head plus remote/published head all equal to the zero-finding `$reviewedHead`. Each mutation has immutable STARTED/SUCCEEDED receipts. Any uncertainty ends publication and is reported from a fresh read-only reconciliation shell as `NOT PASSED`; it never retries or continues. Report pending/failing checks separately. Do not merge, deploy, mutate providers, or convert an external gate into PASS.

## Self-Review

- Spec coverage: Tasks 1-2 cover the one catalog authority, interval identity, typed Join context/outcomes, direct terminal navigation, durable membership precedence, explicit persistence, exhaustive handling of all seven membership statuses, and fresh row-locked application/journey completion when membership creation committed first, with personal applicant/owner equality and the existing active-company-member authorization intersection preserved. Task 3 covers the complete continuation allowlist, explicit noindex member login, one Neon magic-link path, member-only Portal entry, public navigation destinations, and sign-out behavior. Task 4 covers durable checkout pricing, atomic membership/application/attempt/journey webhook projection, webhook-authoritative completion, and localized Billing Portal return. Task 5 covers invitation callback/token identity, replay, expiry, revocation, and provider-free route tests.
- Presentation coverage: Task 6 creates the shared shell family, grouped eight-item Portal and 4/6/6 Admin navigation, active specificity, skip/main/mobile/focus/table/feedback behavior, and exact 6/10/26 route inventories. Tasks 7-8 align every Join/member-login and Portal route while preserving current owners and failing closed on ambiguous company context. Tasks 9-11 align every Admin CRM, CMS, and Operations page while retaining authorization, audits, publication/media locks, approvals, reports, automations, Showcase, and cohort transitions.
- Verification coverage: Task 0 requires an externally trusted, hash-bound, no-profile/noninteractive PowerShell launcher before repository bytes; binds the exact preamble, distinct framed control endpoint, approved-plan record, and live handshake; uses structured pure-PowerShell results and closed non-secret operation/script records instead of prompts; and captures generator/resolver/contract/invoker/native-adapter/guardian plus complete PowerShell/Node/npm/Git/GitHub-CLI/helper/whole-`node_modules`/browser closures. Install is the sole worktree-write exception, uses `--no-bin-links`, and resolves direct regular CLI targets. Later execution uses restricted-token/DACL or read-only-mount materialization with denied late entries; Vitest cache and Playwright output are routed to precreated non-resolution run roots; and a launcher broker gives credentials only to the exact contained Git/`gh` child tree, then zeroes them. The guarded Next phase routes `distDir` and build info into run-owned output, narrowly validates the source-pinned `next-env.d.ts` rewrite, and seals the generated/output-traced closure before capability. Task 3 adds the loopback-only credential-free null-session seam. Task 8 withholds every company-scoped projection under ambiguity. Task 12 uses a captured dependency-free target assertion plus explicit M4C, Lighthouse-collect, verification-authoring, commit-verification, review, and publication records, so no fresh shell relies on prior variables. M4C serves an exact typed body bundle with a closed three-header contract after parent-only token/cookie destruction; Lighthouse binds the complete Chrome distribution. Managed M1-M7/M4B/M5/Axe and PostgreSQL remain separate guarded gates with restoration. Final verification/publication rehydrate final-head/review/approved-plan identities, recompute the raw Git-blob SHA-256 through binary capture, revalidate PR5/spec/plan ancestry before provider or remote mutation, and retain STARTED/SUCCEEDED/OUTCOME_UNCERTAIN plus read-only reconciliation semantics.
- Type consistency: `BillingInterval`, `MembershipSelection`, `MembershipPriceIds`, and the exact `{plans.list, loadPriceIds}` `MembershipCatalogDependencies` boundary originate in Task 1 and all later catalog/Join/checkout signatures consume those names. `PreparedJoinSubmission` carries only terminal row identities or one server-resolved draft; `JoinTerminalDescriptor`, the exhaustive terminal mapper, and the row-locked transaction originate in Task 2 and are reused by Task 4's paid-webhook projection. No JavaScript timestamp is a concurrency token. `PortalContinuation` is defined once in Task 2 and consumed by Task 3. `JoinStateDependencies` is fully defined in Task 4. `InternalNavigationGroup` and shell primitive names originate in Task 6 and are used unchanged in Tasks 7-11. Every TypeScript import of a Task 4/12 `.mjs` or `.cjs` module resolves through its owned `.d.mts`/`.d.cts` declaration, while executable wrappers are subprocess-only.
- Placeholder scan: every task names exact files, interfaces, RED/GREEN or final commands, expected evidence, constraints, and staging. M1 names provider/Auth-session/webhook/profile ledgers; M2 exact 26/19 matrices plus pre-reset profile/no-artifact cleanup; M3 complete seed/unsubscribe/retry/audit/session/identity reset; M6 provider metadata plus full seed/application/audit/Showcase/session/identity restore; M7 full-namespace Page Copy and exact News/Media audit predicates plus real-action public restore and failing containment; Task 12 names external artifacts, managed identities/sessions, and executable commit/review/publication order. No implementation step delegates an unspecified safety or ownership decision.

## Execution Handoff

Execution mode is already approved: Subagent-Driven. After explicit approval of this implementation plan, dispatch one fresh implementer per numbered task. Require its focused RED/GREEN/refactor evidence and exact commit, generate an immutable base/head review package, obtain a fresh independent review with zero Critical, Important, and Minor findings, and only then advance to the next task.

Approval of this plan does not authorize provider calls, database migration/seed/import, Preview mutation, merge, deployment, or production action. Those remain separate gates.
