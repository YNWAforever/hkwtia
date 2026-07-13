# M0 Public Site Foundations — Local Acceptance Evidence

Acceptance run: 2026-07-13 19:40 (Asia/Hong_Kong)

Evidence target commit: `7da0588a2612fc8203cd44d859ef8bf396ae8b71` (`2026-07-13T19:03:58+08:00`).

## Scope and route totals

- `config/public-routes.ts` contains 17 unique public route identifiers.
- The bilingual surface is 34 locale paths (17 routes × `en` and `zh-HK`).
- The production build reported 38 generated static pages/routes, including the localized pages, recovery route, dynamic event/news route entries, `robots.txt`, and `sitemap.xml`.
- Event and news datasets are intentionally empty in M0, so no fabricated detail records are published.

## Verification results

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | PASS |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd test` | PASS — 9 files, 13 tests |
| `npm.cmd run audit:strings` | PASS — 42 TSX files scanned |
| `NEXT_PUBLIC_SITE_URL=http://localhost:3000 npm.cmd run build` | PASS — Next.js 16.2.10, 38/38 static pages |
| Required server-rendered heading fetch | PASS — 4/4 routes returned HTTP 200 and exactly one `<h1>` |

The heading fetch used a hidden production server on port 3105 (recorded PID 4856, stopped after the checks):

| Path | HTTP | `<h1>` count |
| --- | ---: | ---: |
| `/` | 200 | 1 |
| `/membership` | 200 | 1 |
| `/launchpad` | 200 | 1 |
| `/about` | 200 | 1 |

## Browser and Lighthouse evidence

The required `npm.cmd run test:e2e` wrapper did not return within the bounded window because of Windows Playwright/web-server process management. The trustworthy fallback ran the direct local Playwright binary against the same production build (`PLAYWRIGHT_BASE_URL=http://localhost:3105`): **43 tests passed** (9 accessibility, 10 core-page, 24 public-route-matrix checks).

`npm.cmd run test:lighthouse` was not executed because the repository configuration uploads reports to `temporary-public-storage`; exporting this local project was not authorized. A bounded local collection was attempted without the upload-enabled config, but no completed artifact was available. Lighthouse scores are therefore **not claimed** for this acceptance; the configured 0.90 performance / 0.95 accessibility / 0.95 SEO floors remain a deployment follow-up.

## Locale demo

1. Start the app with `npm.cmd run dev`.
2. Open `http://localhost:3000/en` and `http://localhost:3000/zh-HK` (the `/zh` alias is also supported).
3. Use the header locale switcher on a nested page such as `/en/membership` and confirm it preserves the route while changing the visible language.

## Warnings and caveats

- Next.js emitted the existing Browserslist warning that `caniuse-lite` data is 13 months old; no source or dependency change was made for M0.
- The npm Playwright wrapper’s web-server lifecycle is unreliable on this Windows host; direct production-server execution is the recorded browser evidence.
- Lighthouse has no score artifact for this local run because the configured upload target is external and was not used.

M1 has not started.
