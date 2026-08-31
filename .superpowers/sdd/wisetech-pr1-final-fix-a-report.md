# Wisetech PR1 Final Fix A report

## Scope and starting state

- Base/head before changes: `d806566188cae6b71cb833d82b782c3570873e02`.
- Starting tracked state: clean (`git status --short --branch` showed no tracked or untracked paths).
- Scope: restore one coherent Neon Auth dependency tree and make CI enforce the full lockfile-only tree. No provider, deployment, database, or push action was performed.

## Exact RED

Before any package metadata change:

```powershell
npm.cmd ls --package-lock-only @neondatabase/auth @neondatabase/auth-ui better-auth better-call
```

Result: exit `1`, `npm error code ELSPROBLEMS`.

The failing tree combined Neon-pinned `better-auth@1.6.23`, `@better-auth/passkey@1.6.23`, and `better-call@1.3.7` with:

- `@better-auth/core@1.7.1`, whose peer requires `better-call@1.4.0`;
- `@better-auth/api-key@1.7.1`, whose peers require `better-auth@^1.7.1` and `better-call@1.4.0`; and
- `@daveyplate/better-auth-ui@3.4.0`, which installed exact `better-call@2.0.2` and the broad `@better-auth/api-key@^1.5.6` range.

After adding the regression contract but before changing dependency metadata, the focused test also exited `1`: four contract tests failed for the missing scoped overrides, the `@better-auth/core@1.7.1` lock entry, the repository `ELSPROBLEMS`, and the missing CI Auth-tree command. This was the accepted test-first RED.

## Authoritative package rationale

Registry metadata was queried with `npm.cmd view` rather than guessing versions:

- `@neondatabase/auth@0.5.0-beta` pins `better-auth@1.6.23` and `@neondatabase/auth-ui@0.3.0-beta`.
- `@neondatabase/auth-ui@0.3.0-beta` pins `@better-auth/passkey@1.6.23`, `better-auth@1.6.23`, `better-call@1.3.7`, and `@daveyplate/better-auth-ui@3.4.0`.
- `@better-auth/passkey@1.6.23`, `@better-auth/core@1.6.23`, and `@better-auth/api-key@1.6.23` all declare peers for the `better-auth@1.6.23` / `better-call@1.3.7` family.
- `@daveyplate/better-auth-ui@3.3.15` peers with `better-auth@^1.4.6` and does not depend on either `@better-auth/api-key` or `better-call`; release `3.4.0` newly introduced those incompatible dependencies.

An isolated temporary manifest/lock experiment proved the smallest coherent set before repository metadata was edited. A nested override scoped only to `@neondatabase/auth-ui@0.3.0-beta` pins:

- `@better-auth/core` to `1.6.23`; and
- `@daveyplate/better-auth-ui` to `3.3.15`.

The isolated exact Auth-tree command exited `0`. No global Better Auth override, `--force`, or `--legacy-peer-deps` was used. The existing scoped `picomatch@2` override was preserved unchanged.

## Changes

- `package.json`: added the two-key override nested under `@neondatabase/auth-ui@0.3.0-beta`.
- `package-lock.json`: regenerated from that manifest; removed the peer-invalid API-key/Better Call 2.x subtree and resolved the Neon subtree to Better Auth/Core `1.6.23`, Better Call `1.3.7`, and Better Auth UI `3.3.15`.
- `.github/workflows/ci.yml`: added the exact full lockfile-only Auth-tree command immediately after `npm ci`.
- `tests/unit/ci-security-contract.test.ts`: requires the scoped override and coherent lock versions, invokes the real repository command, creates a hostile peer-invalid temporary lock whose command must fail with `ELSPROBLEMS`, and checks that CI cannot omit or reorder the command. The real child-process test has a 30-second timeout because the first full-suite run showed it could take about 10 seconds under parallel load despite passing in isolation.

## GREEN and final sequential verification

The accepted focused GREEN was:

```text
npm.cmd test -- tests/unit/ci-security-contract.test.ts
exit 0; 1 file passed; 6 tests passed
```

The required sequence was restarted after correcting the full-suite-only test timeout. Final results:

| Command | Result |
| --- | --- |
| `npm.cmd ci` | exit `0`; 1,305 packages installed from lock |
| `npm.cmd ls --package-lock-only @neondatabase/auth @neondatabase/auth-ui better-auth better-call` | exit `0`; coherent `1.6.23` / `1.3.7` tree |
| `npm.cmd test -- tests/unit/ci-security-contract.test.ts` | exit `0`; 6/6 passed |
| `npm.cmd run audit:strings` | exit `0`; 143 TSX files scanned |
| `npm.cmd test` | exit `0`; 312 files passed, 15 skipped; 2,478 tests passed, 40 skipped |
| `npm.cmd run lint` | exit `0` |
| `npm.cmd run typecheck` | exit `0` |
| `npm.cmd run build` | exit `0`; compiled and generated 116/116 static pages |
| `npm.cmd audit --omit=dev --audit-level=high` | exit `0`; 0 high, 0 critical; 4 moderate reported |

Additional installed-tree proof:

```text
npm.cmd ls @neondatabase/auth @neondatabase/auth-ui better-auth better-call
exit 0; coherent installed tree matching the lockfile-only tree
```

Pre-commit `git diff --check` exited `0`. The required committed-range `git diff --check d806566..HEAD` is run after the scoped commit and reported in the handoff.

## Auth re-review follow-up

Starting commit: `92179b5a3b9f7a7bd576ad827e7f919883a29358`.

The re-review found that the enclosing Vitest timeout did not constrain a synchronous `spawnSync` child, and that lock-version checks searched every Better Auth package path instead of only Neon Auth ancestry.

### Follow-up RED

The short-deadline regression was added before subprocess timeout handling:

```text
npm.cmd test -- tests/unit/ci-security-contract.test.ts
exit 1; 1 failed, 6 passed
hostile 25ms-deadline child ran for 328ms and returned normally
failure: expected the function to throw
```

An ancestry fixture was then added. It injects unrelated `better-auth@9.9.9` outside the two Neon lock roots. The second RED exited `1` with 2 failed and 6 passed: the unrelated version leaked into the global result and the short-deadline child still did not throw.

### Follow-up fix

- Every dependency-tree `spawnSync` now has an 18-second subprocess timeout, `SIGKILL`, and hidden Windows child window.
- `result.error`, a null status, or a terminating signal throws immediately with explicit `code`, `status`, and `signal`; `ETIMEDOUT` can no longer become an ordinary status assertion.
- The two real npm invocations have a combined maximum subprocess duration of 36 seconds inside a 50-second Vitest timeout, leaving 14 seconds of enclosing headroom. The final full-suite run measured the contract at 12.6 seconds.
- Better Auth/Core/API-key/Better Call/UI lock assertions now include only paths beneath `node_modules/@neondatabase/auth` and `node_modules/@neondatabase/auth-ui`. The Picomatch checks remain repository-wide and unchanged.
- The exact real npm command, hostile `ELSPROBLEMS` fixture, scoped overrides, and exact CI command contract remain intact.

### Follow-up GREEN and verification

Focused GREEN:

```text
npm.cmd test -- tests/unit/ci-security-contract.test.ts
exit 0; 8/8 passed; duration 4.47s
```

Sequential verification:

| Command | Result |
| --- | --- |
| `npm.cmd ls --package-lock-only @neondatabase/auth @neondatabase/auth-ui better-auth better-call` | exit `0`; coherent lock tree |
| `npm.cmd ls @neondatabase/auth @neondatabase/auth-ui better-auth better-call` | exit `0`; coherent installed tree |
| `npm.cmd ci` | exit `0`; 1,305 packages installed from lock |
| `npm.cmd run audit:strings` | exit `0`; 143 TSX files scanned |
| `npm.cmd test` | exit `0`; 312 files passed, 15 skipped; 2,480 tests passed, 40 skipped |
| `npm.cmd run lint` | exit `0` |
| `npm.cmd run typecheck` | exit `0` |
| `npm.cmd run build` | exit `0`; compiled and generated 116/116 static pages |
| `npm.cmd audit --omit=dev --audit-level=high` | exit `0`; 0 high, 0 critical; 4 moderate reported |

The final committed-range whitespace check is recorded in the handoff after the follow-up commit.
