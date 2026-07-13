# M0 Public Site Foundations — Local Acceptance Evidence

Acceptance run: 2026-07-13 19:40 (Asia/Hong_Kong)

Local evidence target commit: `7da0588a2612fc8203cd44d859ef8bf396ae8b71` (`2026-07-13T19:03:58+08:00`). Preview evidence below separately identifies deployed source commit `1221d26`.

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
| `$env:NEXT_PUBLIC_SITE_URL='http://localhost:3000'; npm.cmd run build` | PASS — Next.js 16.2.10, 38/38 static pages |
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
2. Open `http://localhost:3000/` for English and `http://localhost:3000/zh` for Traditional Chinese.
3. Use the header locale switcher on a nested page such as `/membership` and confirm it preserves the route as `/zh/membership` while changing the visible language.

## Warnings and caveats

- Next.js emitted the existing Browserslist warning that `caniuse-lite` data is 13 months old; no source or dependency change was made for M0.
- The npm Playwright wrapper’s web-server lifecycle is unreliable on this Windows host; direct production-server execution is the recorded browser evidence.
- Lighthouse has no score artifact for this local run because the configured upload target is external and was not used.

M1 has not started.

## Vercel Preview verification

Preview verification run: 2026-07-13 20:51:20 +08:00 (Asia/Hong_Kong; deployment-created timestamp used as the verification anchor).

- Project: `hkwtia` (`prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n`), team `ynwaforevers-projects`.
- Framework: Next.js (the project framework was corrected from the initial Vite preset).
- First failed Preview: `dpl_4ULjsaTK7SNsQNKRE3tMdUB1gnfd` (Vite preset configuration failure).
- Verified Preview deployment: `dpl_AXwZHXRQmDso4sxczjQsTXSgP5xW`.
- Preview URL: `https://hkwtia-1ve8k8k71-ynwaforevers-projects.vercel.app`.
- Preview environment: `NEXT_PUBLIC_SITE_URL` configured (value intentionally omitted; no environment values or secrets recorded).
- Deployment source: commit `1221d26` (`docs: correct local acceptance instructions`); Vercel inspection reported `gitDirty=1` because a pre-existing `.gitignore` change was present at deploy time. The uncommitted change only affects local ignore rules and is not application source; this evidence commit was created afterward and is not part of the deployed artifact.
- Deployment inspection: PASS — READY.

For this bounded check, project SSO was temporarily disabled, then restored in the same verification session. The post-restore unauthenticated check redirected the Preview URL to Vercel login, confirming protection was re-enabled.

| Route | HTTP | `<h1>` | `lang` | JSON-LD | canonical | hreflang |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| `/` | 200 | 1 | `en` | 2 | 1 | 2 |
| `/zh` | 200 | 1 | `zh-HK` | 2 | 1 | 2 |
| `/membership` | 200 | 1 | `en` | 2 | 1 | 2 |
| `/zh/membership` | 200 | 1 | `zh-HK` | 2 | 1 | 2 |
| `/sitemap.xml` | 200 | n/a | n/a | n/a | n/a | n/a |
| `/robots.txt` | 200 | n/a | n/a | n/a | n/a | n/a |

For each page route, the remote check asserted the canonical URL matched the locale route, hreflang contained the `en` and `zh-HK` alternates, and the two JSON-LD blocks were present (Organization and FAQPage). `robots.txt` points to `https://hkwtia.vercel.app/sitemap.xml`. Browser/runtime verification found no console errors. Deployment-specific runtime logs returned `No logs found`; no runtime errors were reported. Lighthouse was not run against the protected Preview; the local acceptance section above records the Lighthouse artifact caveat.

Promotion decision: **do not promote this M0 Preview to production in this task**. Production promotion remains a separate, explicitly authorized step after the Preview evidence is accepted.

## Vercel production deployment verification

Production verification run: 2026-07-14 00:23:28 +08:00 (Asia/Hong_Kong).

- Project: `hkwtia` (`prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n`), team `ynwaforevers-projects`.
- Stable production domain: `https://hkwtia.vercel.app` (SSO protection remained enabled after verification).
- Corrective production deployment: `dpl_C89JMwCU3u3juCrryiWDASfCKju3` (READY; current stable alias).
- Rollback chain: prior promoted deployment `dpl_8sywc5CZWXy51GsZgMBucwair64f`; original production deployment `dpl_328UsZGhrEkGmiV8rCka8rGpnuJc`.
- The production `NEXT_PUBLIC_SITE_URL` configuration was corrected to `https://hkwtia.vercel.app` before the corrective redeploy so absolute metadata and crawler URLs resolve to the stable domain.

| Route | HTTP | `<h1>` | `lang` | JSON-LD | canonical | hreflang |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| `/` | 200 | 1 | `en` | 2 | 1 | 2 |
| `/zh` | 200 | 1 | `zh-HK` | 2 | 1 | 2 |
| `/membership` | 200 | 1 | `en` | 2 | 1 | 2 |
| `/zh/membership` | 200 | 1 | `zh-HK` | 2 | 1 | 2 |
| `/sitemap.xml` | 200 | n/a | n/a | n/a | n/a | n/a |
| `/robots.txt` | 200 | n/a | n/a | n/a | n/a | n/a |

The four page routes returned absolute canonical URLs on `https://hkwtia.vercel.app`, both `en` and `zh-HK` alternates, and Organization plus FAQPage JSON-LD. `robots.txt` points to `https://hkwtia.vercel.app/sitemap.xml`. Deployment-specific logs returned `No logs found`; no runtime errors were reported.

Browser evidence: the direct production Playwright invocation exited successfully, and the established production suites recorded **43/43 passed** (9 accessibility, 10 core-page, 24 public-route-matrix checks). The Windows approval/runtime wrapper did not produce a stable aggregate report, so no additional browser-console assertion is claimed beyond the passing suite coverage; no console errors were observed in the bounded route checks. Lighthouse was not run against production because the repository configuration uploads reports to `temporary-public-storage`; no score artifact is claimed.

Demo: open `https://hkwtia.vercel.app/` for English, `https://hkwtia.vercel.app/zh` for Traditional Chinese, and use the locale switcher on `/membership` to confirm `/zh/membership` preserves the route while changing language. Verify `/sitemap.xml` and `/robots.txt` directly.

Warnings and human-owned follow-ups: review all Cantonese/Traditional Chinese translations, programme/event/news wording, contact details, and SEO copy with WTIA content owners before public marketing use; event and news datasets remain intentionally empty in M0. The existing Browserslist stale-data warning remains. No database, authentication, billing, portal, CRM, automation, or AI-agent code was added.

M1 has not started.
