# HKWTIA 2026-09-29 remediation baseline

This directory records implementation evidence for the supplied 2026-09-29 audit. The supplied report/backlog are specifications and historical evidence, not proof that this branch or Production is fixed.

Path mapping: the backlog names `docs/audits/hkwtia-final-2026-09-27/{acceptance,release-matrix}.md`; those historical files now link to this audit cycle [verification.md](verification.md) and [release-matrix.md](release-matrix.md). Existing receipts remain intact.

- Repository: YNWAforever/hkwtia. Remote `main` and audit source baseline: `5decb234a458ef1943819739a74bc4205e1bb299`, reconfirmed with `git ls-remote --heads origin main` on 2026-09-29.
- PR #94: MERGED, merge commit `fe22b49ed9828dd0cfad536273df5960ed90ca66`; confirmed with `gh pr view 94 --repo YNWAforever/hkwtia --json number,state,mergedAt,mergeCommit,url`.
- Production alias: `https://hkwtia.vercel.app` resolves to READY Vercel deployment `dpl_8cr2En9xQhrs5nDpxny9GY3L4stx` (`hkwtia-biaddkyex-ynwaforevers-projects.vercel.app`), created 2026-09-29 00:13 HKT. The audit identified its app source as `0076981b203632da15ae8f881d3cb55287ccaa79`; this latest `vercel.cmd inspect` checked deployment identity and status, not its source SHA.
- The audit report's baseline-vs-Production app-code diff was documentation only. The feature branch is `codex/audit-20260929-login-flow` in isolated worktree `.worktrees/final-login-admin`; no source was copied from the historical evidence archive.
- The root checkout's unrelated changes remain untouched. No Production database write, migration, live send/payment, publication or feature-flag change was made by this branch.
- The supplied 2026-09-29 package's 67 checksum entries were verified with zero missing/mismatched files before implementation. `AGENTS.md` was read. Its linked `docs/agent-history.md#public-and-admin` does not exist in this checkout; current interfaces and tests were used instead.
- The existing sidebar, shared rate limiter, member-directory pagination, Member360, batch history, transaction guards, consent and payment policies were retained.

See [finding-status.md](finding-status.md), [verification.md](verification.md), [decisions.md](decisions.md) and [release-matrix.md](release-matrix.md).
## Released baseline — 2026-09-30 HKT

PR #101 merged as `290d50c6`, and the reviewed dashboard head `86c37d7e` merged through PR #102 as `ab568934471cde8aea18f493a5422653c5d719e0`. Reviewed and merged source trees are identical. After explicit user approval, the Production alias now resolves to `dpl_5Xgjk74ximch2aUBugzHgWRfCgon` at that SHA; the previous compatible rollback is `dpl_8cr2En9xQhrs5nDpxny9GY3L4stx` / `0076981b`. Vercel's configured production branch is `release`, so main-branch merges alone do not promote the alias. [Release evidence](release-20260930.md) records the isolated Preview acceptance, Production smoke, configuration boundaries and remaining gates. No migration, seed or worker change was part of this release.
