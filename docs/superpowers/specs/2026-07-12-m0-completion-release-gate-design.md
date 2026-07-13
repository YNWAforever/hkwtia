# M0 Completion and Release Gate Design

**Date:** 2026-07-12  
**Status:** Approved in conversation; awaiting written-spec review  
**Source of truth:** `WTIA_Codex_Build_Spec_v1.1.md` and the approved M0 public-site design and implementation plan

## Purpose

Complete the M0 public-site milestone to production quality before beginning the M1 membership engine. M0 ends only when the dedicated bilingual route surface, SEO and accessibility contracts, local acceptance evidence, Vercel Preview verification, and production smoke checks all pass.

## Decisions

- Finish M0 before designing or implementing M1.
- Replace the temporary shared catch-all route with dedicated, route-specific pages.
- Deploy to Vercel Preview first, verify it, then promote the exact verified artifact to production.
- Keep Neon, authentication, Stripe, member accounts, and portal workflows outside the M0 runtime.
- Publish no invented events, news, member listings, operational metrics, dates, or programme claims.

## Delivery Approach

Use four ordered gates:

1. **Route completion:** finish all dedicated public pages, localized recovery states, and legacy Vite removal.
2. **Release contracts:** implement SEO, structured data, translation, accessibility, and repository audits.
3. **Preview verification:** deploy the committed branch and verify the full public experience on Vercel Preview.
4. **Production promotion:** promote the verified deployment, repeat critical smoke checks, record evidence, and stop at the M0 gate.

Each gate is committed separately and must pass its focused checks before the next gate starts. This keeps regressions attributable and preserves reviewable history.

## Route Architecture

Every M0 public route owns a dedicated App Router page module, route-specific metadata, and a translation namespace. Shared Server Components provide composition without hiding route ownership:

- `ProgramDetail` renders CPAI, HKICT, TCT, and ASA records selected from `content/programs.ts`.
- Event and news index/detail components consume `content/events.ts` and `content/news.ts`.
- `PreviewState` renders translated, milestone-labelled previews for Showcase and AI-Ops.
- Focused policy and contact compositions render Contact, Privacy, and AI Transparency.

The temporary `[...slug]` catch-all is removed after every dedicated page is covered by the route-matrix tests.

## Content and Data Flow

`content/programs.ts`, `content/events.ts`, and `content/news.ts` remain the validated, locale-neutral source of truth. Pages resolve visible copy through `next-intl` namespaces and generate URLs and metadata through the existing shared helpers.

Events and news remain validated empty arrays in M0. Their index pages display translated empty states. Their detail pages generate static parameters from real records, return `notFound()` for unknown slugs, and use fixtures only in unit tests.

Showcase names M5 as its live-data milestone. AI-Ops names M4 and displays no fabricated metrics. Launch Pad describes the planned cohort model without exposing live applications or funding matching.

Contact provides accessible email, telephone, and office actions only; it creates no POST endpoint. Privacy describes the static M0 site's actual data collection. AI Transparency distinguishes planned agents from live functionality and links to AI-Ops.

## Error and Recovery Behavior

- Unknown event/news slugs and unsupported public paths return a localized 404 with safe recovery links.
- Unexpected render failures show a localized retry action implemented as a minimal Client Component.
- Error pages never display thrown error text, secrets, personal data, or internal diagnostics.
- Missing translations, invalid content records, duplicate slugs, or invalid image paths fail automated checks rather than silently degrading.

## SEO and Discoverability

- Every indexable route has canonical metadata plus `en` and `zh-HK` alternates.
- `sitemap.xml` lists every public route in both locales.
- `robots.txt` permits normal indexing and the AI crawlers required by the build specification.
- The home page emits Organization JSON-LD.
- Membership emits FAQPage JSON-LD derived from the same translated FAQ content visible on the page.
- Structured data is serialized from typed objects and covered by shape tests.

## Translation and Accessibility Contracts

- English and Traditional Chinese message bundles must have matching key shapes.
- Public page modules may not contain unapproved hardcoded user-visible strings.
- Locale switching preserves the logical route.
- Every public page has one visible `h1`, correct landmarks, keyboard operation, visible focus, valid labels, and WCAG 2.1 AA contrast.
- Automated accessibility checks cover the home page, membership, navigation, mobile menu, and representative content/preview pages.

## Verification

Local acceptance requires all of the following:

- Unit, typecheck, lint, and production build pass.
- Core-page and complete bilingual route-matrix Playwright suites pass.
- Translation, hardcoded-string, content-schema, URL, metadata, sitemap, robots, and JSON-LD checks pass.
- Lighthouse CI reaches Performance >= 90, SEO >= 95, and Accessibility >= 95 on `/` and `/membership`.
- The production build route table contains every M0 route in both locales.
- No retained import resolves through the deleted Vite `src/` tree.

Evidence is recorded in `docs/milestones/M0-public-site-foundations.md` with commands, results, deployment identifiers, verified URLs, and any non-blocking warnings.

## Preview and Production Release

The committed branch is deployed to the existing Vercel project as a Preview deployment. Preview verification covers:

- English and `/zh` route availability and headings.
- Locale switching and persistence.
- Canonical, hreflang, sitemap, robots, and JSON-LD output.
- Keyboard navigation and automated accessibility.
- Lighthouse thresholds.
- Deployment-specific runtime and build logs.

Only the exact verified Preview artifact is promoted to production. Production smoke checks repeat critical routes, locale behavior, SEO assets, and deployment-log inspection. M0 is complete only after the evidence document records successful production checks.

## Out of Scope

M0 does not provision or use Neon tables, Neon Auth, Stripe products or webhooks, member accounts, billing, seat management, member portal routes, admin CRM, automations, or AI agents. Those begin with later milestone designs after the M0 gate is complete.

## Completion Boundary

The next phase after this design is an implementation plan for the remaining M0 gates. M1 planning must not begin until M0 is verified in production and the milestone evidence document is complete.
