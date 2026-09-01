# PR6 Local Launcher and Approval-Bundle Candidate Design

## Status and boundary

This document defines a local, non-secret candidate bundle for PR6 Task 0. It is a review artifact and deterministic rehearsal boundary, not an approval issuer. It does not satisfy the separately supplied external launcher, credential broker, provider, or independent-approval gates required by the PR6 implementation plan.

The candidate is kept in the PR6 worktree under an ignored `.superpowers/pr6-launcher-candidate/` directory. Only this design and any explicitly approved test fixtures are eligible for repository tracking. Candidate output must never be committed, uploaded, or sent to a remote without a later explicit authorization.

## Goals

- Bind every candidate record to the approved PR6 implementation-plan identity: commit, blob, and raw SHA-256.
- Exercise the local launcher request, framed transport, synthetic broker response, result transcript, and approval-bundle assembly deterministically.
- Produce reviewable evidence for `initial-red-baseline.v1` and `initial-red-attestation.v1` without claiming that either record is an independent approval.
- Fail closed when a real issuer, credential broker, provider, remote, or production execution target is unavailable.
- Make the candidate transcript reproducible and independently hashable without secrets.

## Non-goals

- Implementing the production-grade Windows restricted-token launcher.
- Replacing the operator/CI-owned `hkwtia.pr6.powershell-launch.v1` boundary.
- Accessing credentials, provider APIs, GitHub, deployment systems, or production data.
- Issuing, signing, or self-approving a PR6 execution authorization.
- Running arbitrary commands by default.

## Alternatives considered

### A. Ignored worktree-local candidate (selected)

The candidate uses a small PowerShell/.NET implementation and a deterministic synthetic broker peer. Its input manifest, framed transcript, result records, and checksums remain local and ignored. This keeps the rehearsal close to the PR6 worktree while preserving the plan's external-boundary requirement.

### B. Tracked repository harness

A tracked fixture and mock command runner would provide convenient CI coverage, but it risks being mistaken for the authoritative launcher and would couple PR6 application code to an external operational boundary. It may be added later only for schema/fixture tests that do not launch processes or represent approval.

### C. User-profile production-like wrapper

A user-profile launcher could model Windows ACLs, restricted tokens, and named pipes more closely, but it would be harder to review, would require additional host permissions, and could be confused with a real operational gate. It remains a later separately approved implementation.

## Candidate data flow

```text
approved plan identity
        |
        v
candidate request -> length-prefixed local frame -> synthetic broker peer
        |                                             |
        +---------------- result/transcript <---------+
                              |
                              v
                 candidate approval-bundle manifest
```

The candidate may launch only its own synthetic peer and deterministic test command. A normal invocation creates records; it does not execute an application command. Any opt-in synthetic execution must be explicit, bounded to the worktree, and recorded as synthetic.

## Bundle layout

The ignored candidate directory contains:

- `manifest.json`: bundle version, candidate status, run ID, worktree/branch identity, exact plan commit/blob/raw SHA-256, and gate statuses.
- `records/launcher-candidate.v1.json`: candidate implementation metadata and capabilities.
- `records/execution-request.v1.json`: canonical request envelope and command identity.
- `records/execution-result.v1.json`: canonical result envelope, exit status, and synthetic/external execution classification.
- `records/initial-red-baseline.v1.json`: deterministic failing baseline evidence, when the repository test harness is unavailable or intentionally injected.
- `records/initial-red-attestation.v1.json`: evidence framing and provenance; issuer is `absent` for a candidate.
- `transcript/frames.bin` and `transcript/frames.jsonl`: framed transport bytes and a human-readable projection.
- `checksums.sha256`: SHA-256 for every bundle file, computed over exact bytes.
- `README.md`: operator-facing instructions and an explicit `NOT PASSED` gate summary.

The bundle uses UTF-8 JSON with stable property ordering, no BOM, and normalized line endings. Hashes are calculated after serialization; no display formatting may be hashed in place of the canonical bytes.

## Framed transport

Each local frame is a four-byte unsigned little-endian payload length followed by one canonical UTF-8 JSON payload. The payload includes `schema`, `runId`, `frameId`, `kind`, `createdAt`, and `body`. The receiver rejects oversized frames, duplicate frame IDs, unknown schema versions, mismatched run IDs, and truncated payloads. The transcript records both the exact bytes and the parsed projection.

The default candidate path is file-backed and deterministic. A named-pipe adapter may be exercised only by the synthetic peer and must use the same frame codec and validation rules. No network transport is permitted.

## Gate and status semantics

The manifest distinguishes candidate evidence from approval:

- `candidateStatus`: `CANDIDATE_ONLY`.
- `issuerStatus`: `NOT_AVAILABLE`.
- `credentialBrokerStatus`: `NOT_AVAILABLE` unless a synthetic peer is explicitly selected.
- `providerStatus`: `NOT_RUN`.
- `remoteMutationStatus`: `NOT_RUN`.
- `task0Gate`: `NOT_PASSED` until the separately supplied launcher, issuer, broker, and command matrix are independently verified.

The synthetic broker may return `SYNTHETIC_ACK` only. It may not emit `APPROVED`, `AUTHORIZED`, or an equivalent status. The candidate cannot turn its own attestation into an approval.

## Failure and safety rules

- Missing or mismatched plan identity terminates before any child process starts.
- Missing schema, malformed frame, checksum mismatch, or transcript correlation failure returns non-zero and writes a failure record without secrets.
- The launcher never enumerates or prints environment secrets and never reads credential files.
- Working directory and allowed executable paths are explicit; path traversal and arbitrary command strings are rejected.
- Network access, GitHub writes, deployment commands, migrations, seeding, and provider calls are out of scope and must be rejected.
- Candidate output is recoverable local evidence. It is not a release artifact and must be deleted or archived only with explicit operator direction.

## Verification plan

1. Validate each record against its versioned schema and required fields.
2. Recompute canonical hashes and compare them with `checksums.sha256`.
3. Replay the transcript through the frame decoder and verify run/frame correlation.
4. Run deterministic positive and negative cases: valid request, plan mismatch, malformed length, truncated frame, duplicate frame, checksum mismatch, and synthetic-broker refusal to approve.
5. Re-run with the same explicit run ID and inputs and confirm byte-identical canonical records, excluding timestamps that are deliberately declared non-deterministic.
6. Confirm the final README and manifest report every real external gate as `NOT_PASSED` or `NOT_AVAILABLE`.

## Promotion and handoff

After this design is independently reviewed, the implementation may be constructed locally. A later operator/CI-owned launcher and issuer must review the exact candidate hashes, establish the real credential-broker and provider gates, and issue a separate authoritative envelope. Candidate records must not be relabeled or rewritten to simulate that handoff.
