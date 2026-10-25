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

T22-03: observed red `expected false to be true` on submitted parser acceptance before implementation. Focused queue/dashboard/query suite now passes (4 files, 10 tests). Shared predicate and explicit dashboard link rebuilt; exact fixture IDs and real EN/ZH namespace covered. These are unit tests, not PostgreSQL or staff session evidence. Read installed Next `use-server` guide; authenticated action boundaries retained.

T22-05: observed red 5 vs 4 plan articles before moving assistant out. Comparison uses four-column responsive grid, independent unnumbered help, catalog seats and a hero comparison anchor. Existing unavailable/partial catalog behavior remains. Structural comparison labels excluded from CMS; existing editable count retained. Focused membership tests rerun. Browser visual matrix remains BLOCKED pending usable browser and a source-verified preview with populated catalog; jsdom is not visual evidence.

T22-01 initial audits: omit-dev 4 high/0 critical; full 20 high/1 critical (JSON captured separately). Join ownership/profile/recovery: 3 files/23 tests PASS. Next remains 16.4.3. No prior audit result reused.

R2 T22-04A offline start: member projection boundary implemented test-first. Observed four intended failures (staff sentinel exposure, draft visibility, other-applicant authorization, explicit projection). Seven unit cases then pass. No service writes/schema/migration wired: verified target is still absent. Transaction/receipt/concurrency/real identity acceptance remain BLOCKED. This is partial implementation, not completed supplements.

Fixture cleanup search: `rg -n r20261025a --glob '!package-lock.json' .` returned no matches before this note. No matching fixtures/manifests deleted.
