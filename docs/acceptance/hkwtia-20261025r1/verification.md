# 2026-10-25 R1 rebuild verification

P00 records the initial checkout in baseline.json. Historical local PASS is not current evidence. The supplied authoritative plan was initially untracked and is preserved in this delivery. Historical acceptance directory is unchanged.

| Task | Code at baseline | Tests this run | Deployment | Runtime |
| --- | --- | --- | --- | --- |
| T22-03 | Shared helper absent; tile targets draft default | Not tested | Not deployed | Staff/SQL blocked by unverified identity |
| T22-05 | Requires comparison with plan | Not tested | Not deployed | Visual not tested |
| T22-01 | Next 16.4.3 supersedes historical Next patch | Not tested | Not deployed | Identity blocked |
| T22-02 | No verified isolated target | Not tested | Not deployed | BLOCKED: no current Auth/Neon isolation metadata |
| T-MP12A | Requires source investigation | Not tested | Not deployed | BLOCKED: no sandbox contract |

CI requires Node 22, lock graph, strings, lint, typecheck, build, omit-dev audit, unit shards and worker checks. The workflow currently targets PR bases main/release/full-remediation; a stacked PR base is outside that trigger. Current deployment identity is UNKNOWN; no deployment is authorized. No database client, migration or seed has been invoked.
