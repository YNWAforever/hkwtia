# T-MP11 — member portal performance evidence

Status: original regression verified; final browser measurement and root-cause remediation remain outstanding. The 0.90 performance, 0.95 accessibility and 0.95 SEO gates and workflow pass/fail logic are unchanged.

## Original production evidence

[GitHub run 38230512485](https://github.com/YNWAforever/hkwtia/actions/runs/38230512485), job `114748541216`, head `e8254bab79cff5945da4abe995a7c075d0ce3d57`: failed the performance gate. Downloaded artifact `11738656043`, `production-lighthouse`, SHA-256 `75578c2cb63c9c4a30d2b61646fc7b99171f0fd4bb736bc12f1330fce92f7826` was verified against its GitHub digest. Report fetch times: 2026-10-12 09:33–09:35 UTC. Public host: `https://hkwtia.vercel.app`; resource deployment marker: `dpl_CZQMJB8LRDBpYdgGX1zWwsdZfhpo`.

Lighthouse 12.6.1, mobile emulation, 150 ms RTT, 1,638.4 Kbps throughput setting, CPU slowdown 4×. Exactly one run per route. These are individual samples, not three-run medians or RUM p75. Cold/warm server/CDN state and production data volume were not recorded. English routes preceded Chinese to avoid the persisted locale cookie redirect. Accessibility and SEO were 1.00 on all ten routes; best-practices was 0.79, which is not one of this workflow's asserted categories.

| Route | Performance | LCP ms | TBT ms | CLS |
|---|---:|---:|---:|---:|
| / | 0.7 | 2679.8 | 844.5 | 0 |
| /events | 0.94 | 2915.3 | 107 | 0 |
| /membership | 0.99 | 2137.8 | 53 | 0 |
| /partners | 0.99 | 1690.2 | 120 | 0 |
| /programmes | 0.96 | 2474.7 | 94 | 0 |
| /zh | 0.98 | 2232.9 | 75.5 | 0 |
| /zh/events | 0.94 | 2881.4 | 115 | 0 |
| /zh/membership | 0.98 | 2261.7 | 93 | 0 |
| /zh/partners | 0.99 | 1543.5 | 94 | 0 |
| /zh/programmes | 0.97 | 2300.2 | 92 | 0 |

`assertion-results.json` contains one failed assertion: `/`, performance 0.70 < 0.90. The root page's Speed Index was 6,665.2 ms. Long tasks include a 517 ms document task, 349 ms and 197 ms tasks in chunk `3794-de0a7b0284f8b2f1.js`, and a 222 ms unattributed task. These identify main-thread blocking as an investigation target; they do not identify the source component or justify removing animations. The artifact contains LHR JSON/HTML, assertions and links, **no trace or CPU profile**; diagnostic workflow steps were skipped. The committed JSON summary preserves all raw category/metric values and the first five long tasks per route. No production measurement was rerun in this work.

## Local changes with bounded evidence

- Directory and upcoming events now put current authorization, visibility, filters, tuple order and `LIMIT limit+1` in SQL (default 20, maximum 50). Generated SQL tests prove the returned-row bound is present. They do not prove the number of rows PostgreSQL scans or its latency.
- Directory version 2 cursors retain database lowercase/C-collation tuples and are scoped to actor and filters; malformed, legacy and cross-search tokens reset visibly. Event cursors preserve all six timestamp fractional digits.
- Request rendering reuses memberships and dashboard context via React request cache. No process-global member cache or mutation authorization cache was added. The repeated event quota read now uses the context already returned by the company list.
- Portal client catalog projection is only `Error`; other portal components receive localized labels from server components. Compact UTF-8 source catalog measurement: EN 205,988 → 118 bytes, zh-HK 195,076 → 113 bytes. This measures that catalog projection alone, not total HTML/Flight/JS payload or user-perceived speed.

## Required measurement before release

1. Use the final reviewed commit in an isolated complete checkout. Local Node here is 24.19; workflow Node is 22. Use the same Node/browser version and hardware for baseline/final comparisons. This reconstructed checkout omits unchanged image/font assets, so a public browser run here would not represent the deployed site.
2. Use existing workflow `local_lab=true` for ten routes × three runs with filesystem report retention. Do not change the 0.90 gate or substitute the diagnostic CPU profile timings for normal acceptance. Capture each score, LCP/TBT/CLS/Speed Index, median, exact commit, URL, browser/device/network, cold/warm conditions and data counts. No median is available in this report.
3. If the homepage regresses reproducibly, capture profile/trace, map the expensive chunk/function to the same build's source, change one measured cause, then repeat the same conditions. The current single sample cannot distinguish initialization, cache or runner variance.
4. Create signed-in dashboard/directory/events/billing baselines in the isolated environment. Use representative 100/1,000/10,000-row data; preserve SQL `EXPLAIN (ANALYZE, BUFFERS)`, returned rows, query count, payload bytes and raw timings. The two new disposable-PostgreSQL suites are prepared but skipped here. Choose indexes from the actual plans, not from the presence of LIMIT.
5. Repeat keyboard and 360/390/1440 px browser checks in both languages; do not remove required access checks or user features to improve a score.

Blocking prerequisites: local Chromium is not installed, the full asset checkout is absent, and an isolated signed-in/provider/database acceptance environment has not been supplied. No browser performance result or improvement percentage is claimed. T-MP11 stays investigation/acceptance outstanding.
