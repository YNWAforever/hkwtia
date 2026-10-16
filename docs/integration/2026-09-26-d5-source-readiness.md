# D-5 source readiness — 2026-09-26

The source slice is ready for review. This is a dated, read-only preflight snapshot, not a domain cutover approval. The governing operator sequence is `2026-09-13-hkwtia-org-cutover-runbook.md`.

| Gate | Observation | State |
|---|---|---|
| Source baseline | `origin/main` was `98cc3722f1c90623b6743a85df7266368bc83516` | Recorded |
| Production alias source | Vercel deployment metadata for `hkwtia.vercel.app` reported READY deployment `dpl_AEUFvcpWtoCMFgEH28DhHanhRHHq`, source SHA `b6cbe97e6497925bb7014e092f281fc64d722f1e` | **No-go: older than `origin/main`** |
| Legacy drift | 10 WordPress sub-sitemaps, 577 live URLs, 576 captured, 0 uncovered literals | Pass |
| Legacy destinations | `verify-legacy-redirects.mjs --concurrency 4`: 576/576 reach 200 on the preview host | Pass |
| Current preview sitemap | 58 URLs and 174 alternates use `https://hkwtia.vercel.app` | Pass for pre-cutover state |
| Current preview root | HTTP 200, no Location header; hreflang names the preview host | Pass for pre-cutover state |
| Source gates | 5,549 unit/integration tests pass, 61 environment-gated tests skip; string audit, typecheck, lint (0 errors, 57 existing warnings), build pass | Pass |

Before the owner opens the domain window, deploy the intended merged `main` to Production, re-read the deployment's **Source → Commit** SHA, and require exact equality with `git rev-parse origin/main`. Then repeat all five checks in the governing runbook. DNS, Vercel Production environment changes, and Google Search Console remain owner-executed.
