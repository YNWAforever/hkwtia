# Task 7 bounded-read measurement

Run on 2026-09-28 (Asia/Hong_Kong) with `node scripts/benchmark-final-audit.mjs` and `node scripts/benchmark-final-audit.mjs --after-only`. Source is this feature worktree; the "before" statements reproduce the baseline list-for-count and unbounded directory shapes. The after-only rerun uses the final `UNION ALL` at-risk count. Raw timings and full `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` trees are in `performance-raw.json` and `performance-after-optimized.json`.

Environment: disposable Docker PostgreSQL 16-alpine on the same Windows host/loopback; 10,000 synthetic profiles, companies and memberships, 2,500 published companies, 200 rows in each auxiliary queue. No personal or production data. One Node process issued the queries sequentially. The first-run measurement is **not** a true cold-region measurement: shared database buffers may already be warm after fixture insertion. The warm percentiles come from 20 runs. These are database-query measurements, not full request, browser, LCP, INP or CLS measurements. The representative member-search statement is simpler than the production admin member CTE and was not changed, so its two timing series do not support an improvement claim.

| Read | Query count | Returned rows | First run | Warm p50 | Warm p95 |
|---|---:|---:|---:|---:|---:|
| Dashboard before, six list reads | 6 | 10,800 | 8,234 ms | 7,306 ms | 8,860 ms |
| Dashboard initial aggregates, inherited OR join | 6 | 6 | 4,840 ms | 6,128 ms | 7,664 ms |
| Dashboard final aggregates, split membership paths | 6 | 6 | 37 ms | 139 ms | 509 ms |
| Directory before, all published rows | 1 | 2,500 | 282 ms | 82 ms | 146 ms |
| Directory first bounded page, first run | 1 | 25 | 17 ms | 15 ms | 20 ms |
| Directory first bounded page, after-only rerun | 1 | 25 | 17 ms | 27 ms | 47 ms |
| Representative member search, unchanged, first run | 1 | 10 | 39 ms | 10 ms | 24 ms |
| Representative member search, unchanged, after-only rerun | 1 | 10 | 5 ms | 5 ms | 9 ms |

The first aggregate reduced response rows but left an expensive `OR` membership join. Its at-risk `EXPLAIN` was about 20.1 seconds (aggregate root, 10,334 shared buffer hits); the old list plan was about 21.1 seconds (sort root, 30,352 hits). The final split-path count was 42 ms in its `EXPLAIN` (aggregate root, 580 hits). This supports the query-shape change on this fixture; it does not establish a production latency percentage. The directory plan changed from a 2,500-row sort to a 25-row limit root; both still read the qualifying companies and lateral membership rows. At this 10k scale, PostgreSQL chose sequential scans for the final at-risk hash joins and companies scan. Existing company status/name and membership company indexes already exist; the plan did not justify a speculative new migration.

Correctness evidence: `tests/integration/admin-dashboard-counts.test.ts` passed 3/3 with the guarded isolated Neon acceptance branch, comparing all six new counts to their existing list readers at the same instant. `tests/integration/public-directory-pagination.test.ts` passed 2/2 on disposable PostgreSQL, including repeated names, hidden rows, filter scope and server limit bounds. `tests/integration/auth-last-login.test.ts` first failed against the unconditional write, then passed on disposable PostgreSQL after the 15-minute conditional update. Existing auth runtime/actor unit cases passed 21/21. The auth read deduplication uses React request-scoped `cache`; no shared process cache is introduced. A subsequent request still resolves the current database role.

Release limits: no production sample, cache telemetry or browser Core Web Vitals was obtained. The production schema inspected in Task 0 remains at ledger 0036, so this branch has not been deployed there. Re-measure on Preview with the exact web/DB/worker matrix before promotion.
