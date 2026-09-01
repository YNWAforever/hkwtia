# PR6 Local Launcher and Approval-Bundle Candidate Implementation Plan

> **For agentic workers:** execute this plan only after the written plan is explicitly approved. Keep the candidate source and generated bundle local under the ignored candidate root; do not turn it into the authoritative PR6 launcher.

## Goal

Construct a deterministic, non-secret local candidate for the PR6 Task 0 launcher/approval-bundle boundary. The candidate must generate reviewable records and a framed synthetic-broker transcript while remaining visibly `CANDIDATE_ONLY`; it must never issue approval, access credentials, call a provider, mutate a remote, or execute an application command.

## Baseline and identity

- Worktree: `C:\Users\laich\Documents\hkwtia\.worktrees\wisetech-pr6-join-portal-admin`.
- Branch: `codex/wisetech-pr6-join-portal-admin`.
- Approved PR6 plan identity to bind into every candidate record:
  - commit `6b79a844256adaac62c9582830f49bc712facb69`;
  - parent `745ff6aee647094724385ef12bd77cb8716db744`;
  - literal path `docs/superpowers/plans/2026-08-29-wisetech-pr6-join-portal-admin.md`;
  - Git blob OID `69e4561d2d9b38ccd036905dd8c8793edb6200c0`;
  - raw blob SHA-256 `74ca310753679c16805d1162c6db83440bf5de89077701b2bb63279eca228427`.
- Written design identity: commit `64697080d8366a3333cf2240cb207b45ef43e4c1`, path `docs/superpowers/specs/2026-08-30-wisetech-pr6-local-launcher-approval-bundle.md`.
- The candidate may verify the current plan bytes and Git blob OID locally, but it must label commit/ancestry as supplied external identity rather than claiming an independent approval.

## Scope and tracked surface

Tracked changes are limited to:

- Modify `.gitignore` with the exact rule `.superpowers/pr6-launcher-candidate/` so candidate source, fixtures, transcripts, and outputs cannot appear as accidental repository changes.
- This implementation plan and its eventual task commits.

The following files are local-only under the ignored root and must not be staged:

```text
.superpowers/pr6-launcher-candidate/
  Invoke-Pr6Candidate.ps1
  lib/Pr6Candidate.Canonical.psm1
  lib/Pr6Candidate.Protocol.psm1
  lib/Pr6Candidate.Bundle.psm1
  lib/Pr6Candidate.Validation.psm1
  peer/Invoke-Pr6SyntheticBroker.ps1
  tests/Invoke-Pr6Candidate.Tests.ps1
  fixtures/plan-identity.json
  fixtures/test-cases.json
  runs/<runId>/...
```

The local implementation uses only built-in PowerShell/.NET APIs. It must not install packages or rely on `node_modules`, Pester, Node, npm, GitHub CLI, database drivers, browser tooling, or provider SDKs.

## Shared invariants

All tasks preserve these invariants:

- `runId` is an explicit, non-secret value matching `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. No run ID is inferred from the environment or current time.
- `clockMode` is explicit. Deterministic tests use a supplied fixed RFC3339 timestamp; a wall-clock run is marked `NON_REPLAYABLE` and is never compared as byte-identical.
- JSON is UTF-8 without BOM, normalized to LF, compact, and built from recursively ordered properties. Canonical bytes are hashed after serialization.
- `checksums.sha256` covers every other bundle file and intentionally excludes itself from its own hash set.
- No record contains a credential, token, cookie, provider response, command-line secret, environment dump, or path outside the candidate/worktree allowlist.
- `candidateStatus` is `CANDIDATE_ONLY`; `issuerStatus` is `NOT_AVAILABLE`; `providerStatus` and `remoteMutationStatus` are `NOT_RUN`; `task0Gate` is `NOT_PASSED`.
- The synthetic peer may emit only `SYNTHETIC_ACK`, never `APPROVED`, `AUTHORIZED`, or an equivalent status.
- A malformed input or integrity mismatch exits non-zero before any child process starts. The only permitted child is the candidate's own synthetic broker, launched with `-NoLogo -NoProfile -NonInteractive` and a script path under the candidate root.

## Task 1: Establish the ignored local boundary and red harness

**Files**

- Modify: `.gitignore`.
- Create locally: `.superpowers/pr6-launcher-candidate/tests/Invoke-Pr6Candidate.Tests.ps1`, `fixtures/plan-identity.json`, `fixtures/test-cases.json`.

**RED**

Write assertions that the candidate root is ignored, the approved plan fixture has all five identity fields, generated output is not a Git change, and a missing candidate entrypoint fails with a clear non-zero result. Run the test harness with a direct no-profile PowerShell invocation and capture the failing assertions.

**GREEN**

Add the exact ignore rule and minimal fixture loader/assertion helpers. Resolve the candidate root from the worktree, reject roots outside it, and keep fixture values non-secret. Do not create bundle output yet.

**Refactor and evidence**

Keep the harness dependency-free and deterministic. Verify `git check-ignore -v .superpowers/pr6-launcher-candidate/runs/probe/manifest.json`, `git diff --check`, and a clean explicit-path status. Commit only `.gitignore` and the local test/fixture files if the implementation policy permits local-only evidence to be retained; otherwise retain the harness under the ignored root and commit only `.gitignore`.

## Task 2: Implement canonical JSON and plan-identity binding

**Files**

- Create locally: `lib/Pr6Candidate.Canonical.psm1`.
- Modify locally: `tests/Invoke-Pr6Candidate.Tests.ps1`, `fixtures/plan-identity.json`.

**RED**

Add tests for stable recursive property ordering, UTF-8-without-BOM bytes, LF normalization, fixed-clock timestamps, `runId` validation, and the exact raw SHA-256/Git blob OID of the approved plan. Include failures for a changed byte, wrong path, wrong blob length, and missing identity field.

**GREEN**

Implement these pure functions:

- `ConvertTo-Pr6CanonicalObject` recursively orders dictionaries and preserves arrays/scalars without silently coercing values.
- `ConvertTo-Pr6CanonicalJson` returns compact canonical JSON.
- `Get-Pr6Utf8Bytes` returns UTF-8 bytes without BOM and with LF-only text.
- `Get-Pr6Sha256Hex` hashes exact bytes.
- `Get-Pr6GitBlobOid` hashes `blob <byteLength>\0<rawBytes>` with SHA-1.
- `Assert-Pr6PlanIdentity` validates the literal plan path under the worktree, raw SHA-256, blob OID, byte length, and supplied commit/parent fields; it reports ancestry as `EXTERNAL_NOT_CHECKED`.

The functions must never enumerate ambient files or environment variables. Add fixtures for one fixed timestamp and one non-replayable wall-clock marker without including a live clock in deterministic expected bytes.

**Verification**

Run the focused PowerShell tests twice with the same fixed timestamp and run ID; compare canonical bytes and hashes. Confirm the wrong-plan and wrong-blob cases fail before child creation.

## Task 3: Implement framed file transport and the synthetic broker

**Files**

- Create locally: `lib/Pr6Candidate.Protocol.psm1`, `peer/Invoke-Pr6SyntheticBroker.ps1`.
- Modify locally: `tests/Invoke-Pr6Candidate.Tests.ps1`, `fixtures/test-cases.json`.

**RED**

Add protocol tests for a valid request/ack pair and for oversized payload, truncated length, duplicate frame ID, out-of-order sequence, wrong run ID, unknown schema, wrong nonce, and bytes after terminal. Assert every invalid case returns non-zero and no `APPROVED`-like status.

**GREEN**

Implement:

- `Write-Pr6Frame` and `Read-Pr6Frame` using `u32 little-endian payloadLength | canonical UTF-8 JSON payload`, with a 1 MiB maximum.
- Envelope fields `schema`, `runId`, `frameId`, `kind`, `createdAt`, and `body`.
- Transcript writing to exact `frames.bin` bytes plus a LF-delimited `frames.jsonl` projection.
- Correlation checks for run ID, frame uniqueness, sequence order, schema version, and terminal closure.
- A synthetic broker script that accepts only the candidate request schema, returns `SYNTHETIC_ACK`, and writes no credentials or external data. It may read/write only explicit request, response, and transcript paths under the run root.

The broker must be started only with its own script path and fixed arguments. It must reject arbitrary command fields and must never access network, Git, provider, database, or profile state.

**Verification**

Replay valid transcript bytes through the decoder and compare the parsed projection. Mutate one byte in each negative fixture and confirm the decoder refuses it before result acceptance.

## Task 4: Assemble candidate records and bundle checksums

**Files**

- Create locally: `lib/Pr6Candidate.Bundle.psm1`, `lib/Pr6Candidate.Validation.psm1`, `Invoke-Pr6Candidate.ps1`.
- Modify locally: the focused test harness and fixtures.

**RED**

Add end-to-end assertions for a fixed run that expects:

- `manifest.json` with the exact plan identity and candidate-only gate statuses;
- `records/launcher-candidate.v1.json`;
- `records/execution-request.v1.json`;
- `records/execution-result.v1.json`;
- `records/initial-red-baseline.v1.json`;
- `records/initial-red-attestation.v1.json` with issuer `absent`;
- `transcript/frames.bin` and `transcript/frames.jsonl`;
- `checksums.sha256` excluding itself; and
- `README.md` with the `NOT_PASSED` summary.

Expect a refusal before child creation for plan mismatch, path traversal, missing schema, unknown command, and absent fixed clock.

**GREEN**

Implement `Invoke-Pr6Candidate.ps1` with explicit modes:

- `Build`: validate inputs, create a run root, write canonical request and candidate records, and produce the bundle without launching a child.
- `SelfTest`: perform `Build`, launch only `Invoke-Pr6SyntheticBroker.ps1`, validate the framed ack, and write the result/transcript records.
- `Verify`: read a named run, validate schemas/statuses, replay frames, recompute all hashes, and return non-zero on any mismatch.

The runner must require `-PlanPath`, `-RunId`, and `-FixedTimestamp` for replayable modes. It must accept only an explicit candidate root under the worktree and a fixed allowlisted synthetic peer. It must not accept a free-form command, executable path, provider flag, credential path, or remote target.

Use ordered records and the canonical module for every JSON write. Write files atomically within the run root, then write `checksums.sha256` last. The checksum file lists relative paths in stable lexical order and excludes itself. `README.md` must state that candidate output is local evidence and cannot be used as an approval.

**Verification**

Run `Build`, `SelfTest`, and `Verify` for a fixed run ID/timestamp. Confirm the manifest has no approval-like status, all external gates are `NOT_PASSED`/`NOT_AVAILABLE`, and no file contains a secret-shaped field. Repeat in a second empty run root with the same inputs and compare every canonical record, transcript byte, and checksum.

## Task 5: Complete negative-path and safety verification

**Files**

- Modify locally: `tests/Invoke-Pr6Candidate.Tests.ps1`, `fixtures/test-cases.json`.
- Create locally: `.superpowers/pr6-launcher-candidate/README.md` if not created by Task 4.

Add explicit cases for:

1. approved-plan byte mutation;
2. plan path outside the worktree;
3. mismatched commit/blob/raw hash;
4. duplicate or out-of-order frame;
5. oversized/truncated frame;
6. checksum mutation and missing bundle member;
7. synthetic broker returning an approval-like token;
8. unknown/free-form command field;
9. output root reparse/path traversal;
10. wall-clock replay attempted as deterministic; and
11. any extra file or frame after terminal.

Each case must show the refusal code/message, non-zero exit, no provider/remote activity, and no child process except where the synthetic broker is the intended peer. The tests must not print environment contents. Add a compact summary that distinguishes `PASS` for candidate invariants from `NOT_PASSED` for real PR6 gates.

## Task 6: Final local verification and handoff evidence

Run, in a fresh no-profile PowerShell process:

```powershell
& pwsh.exe -NoLogo -NoProfile -NonInteractive -File .superpowers\pr6-launcher-candidate\Invoke-Pr6Candidate.ps1 -Mode SelfTest -PlanPath docs\superpowers\plans\2026-08-29-wisetech-pr6-join-portal-admin.md -RunId pr6-candidate-fixed-001 -FixedTimestamp 2026-08-30T00:00:00.000Z
& pwsh.exe -NoLogo -NoProfile -NonInteractive -File .superpowers\pr6-launcher-candidate\Invoke-Pr6Candidate.ps1 -Mode Verify -RunPath .superpowers\pr6-launcher-candidate\runs\pr6-candidate-fixed-001
& pwsh.exe -NoLogo -NoProfile -NonInteractive -File .superpowers\pr6-launcher-candidate\tests\Invoke-Pr6Candidate.Tests.ps1
```

Then run:

- `git diff --check`;
- `git status --short --branch`;
- `git check-ignore -v .superpowers/pr6-launcher-candidate/runs/pr6-candidate-fixed-001/manifest.json`;
- an explicit tracked-path diff showing only the approved plan/ignore changes;
- a content scan over the candidate run for forbidden approval-like statuses, credentials, provider calls, remote URLs, and command-line secrets.

Record candidate evidence separately from real gates. The final local handoff must state:

- candidate self-tests and hash/replay checks passed or failed;
- the exact candidate run ID and plan identity;
- `CANDIDATE_ONLY`, `NOT_AVAILABLE`, `NOT_RUN`, and `NOT_PASSED` statuses;
- that the external `hkwtia.pr6.powershell-launch.v1`, issuer, credential broker, provider, and publication gates remain unverified; and
- that no PR, deployment, migration, seed, provider call, or production action occurred.

## Commit and review sequence

After each task, stage explicit paths only and create a focused commit. Never use `git add -A`. Keep ignored candidate outputs out of commits. Before the final handoff, perform an immutable base/head review of the tracked changes and confirm that the local candidate cannot be mistaken for the authoritative PR6 launcher.

## Handoff constraints

Approval of this plan authorizes local candidate construction only. It does not authorize the real launcher, credential broker, provider calls, database mutations, GitHub writes, deployment, merge, or production action. Any later promotion must be a separate operator/CI decision bound to the exact candidate hashes.
