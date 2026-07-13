# M0 Public Site Foundations Design

**Status:** Approved on 2026-07-12

**Source of truth:** `WTIA_Codex_Build_Spec_v1.1.md`, with the existing Lovable/Vite site used as the canonical visual, copy, and asset baseline where the build specification is silent.

## Purpose

M0 replaces the current client-rendered Vite prototype with the public foundation of the WTIA platform. The result is a single Next.js App Router application on the existing Vercel project, with server-rendered bilingual pages, complete search metadata, accessible navigation, and acceptance checks that can be repeated before M1 begins.

M0 does not introduce membership persistence, Neon Auth, Stripe, the member portal, the admin CRM, automation, AI agents, or live Showcase data. Those remain assigned to M1-M6. The supplied Neon credentials are not needed for M0 and must not be added to source files, examples, logs, or commits.

## Chosen Approach

The migration happens in place rather than in a parallel sub-application or a Vite/Next hybrid.

- The final repository has one framework, one dependency graph, one routing model, and one Vercel build surface.
- Existing assets, Tailwind tokens, typography, and suitable shadcn components are ported rather than redesigned.
- Large prototype pages are decomposed into focused server-rendered sections instead of being copied as single client components.
- Interactive elements are isolated as small Client Components; static page structure remains server-rendered.

A parallel application was rejected because it would duplicate assets and configuration and require a second cutover. A hybrid application was rejected because it would weaken the SSR, i18n, and SEO acceptance guarantees.

## Application Architecture

### Runtime and routing

- Next.js latest stable, App Router, React, strict TypeScript, Tailwind CSS, and shadcn/ui.
- Node.js 24.x, matching the existing Vercel project setting.
- Default locale `en` is unprefixed. Traditional Chinese uses `/zh` and maps internally to locale `zh-HK`.
- `next-intl` owns locale detection, request configuration, typed navigation helpers, and locale-preserving links.
- The route tree lives under `app/[locale]/(public)` so `/en` is hidden by the locale-prefix policy while `/zh` is visible.
- Public content is statically generated unless a page explicitly needs ISR. Events and news detail routes use `generateStaticParams` and return `notFound()` for unknown slugs.

### Required route surface

Both English and Traditional Chinese variants are generated for:

- `/`
- `/about`
- `/about/chairman`
- `/about/committees`
- `/membership`
- `/showcase`
- `/launchpad`
- `/ai-ops`
- `/events`
- `/events/[slug]`
- `/news`
- `/news/[slug]`
- `/programs/cpai`
- `/programs/hkict`
- `/programs/tct`
- `/programs/asa`
- `/contact`
- `/privacy`
- `/ai-transparency`

`/showcase` and `/ai-ops` are honest preview pages in M0. They describe the forthcoming modules and never display invented live metrics or listings.

### Legacy compatibility

No Tech Fix Pack redirect artifact exists in the current repository. M0 therefore establishes an explicit compatibility baseline in `next.config.ts`:

- `/projects` redirects permanently to `/programs/asa`.
- `/history` redirects permanently to `/about`.
- `/members` redirects temporarily to `/showcase` until the M1 member directory exists.
- `/members/:id` redirects temporarily to `/showcase` until authenticated member profiles exist.

Any later human-supplied redirect map can extend this list without changing the routing architecture.

## File and Component Boundaries

### Framework and locale shell

- `app/[locale]/layout.tsx`: locale-aware root document shell, locale validation, fonts, global metadata defaults, message loading, `NextIntlClientProvider`, and styles. It owns `<html lang>` so every locale remains statically renderable.
- `app/[locale]/(public)/layout.tsx`: public header, main landmark, and footer.
- `i18n/routing.ts`: locales, default locale, and prefix mapping.
- `i18n/request.ts`: request-scoped message loading.
- `i18n/navigation.ts`: locale-aware `Link`, redirect, pathname, and router wrappers.
- `proxy.ts`: locale negotiation and prefix handling using the Next.js 16 proxy convention.

### Content and page composition

- `messages/en.json` and `messages/zh-HK.json`: every user-visible string. Machine-drafted Traditional Chinese namespaces include a `_review: true` marker for the human review pass.
- `config/site.ts`: organization identity, canonical site URL access, social/contact links, and supported crawler policy.
- `config/navigation.ts`: navigation items expressed only as route identifiers and translation keys.
- `content/events.ts`, `content/news.ts`, and `content/programs.ts`: typed, locale-neutral records containing identifiers, dates, image references, and message keys.
- `components/marketing/`: focused server-rendered sections such as hero, statistics, program grid, call-to-action, tier comparison, FAQ, and preview state.
- `components/layout/`: site header, mobile navigation, locale switcher, and footer.
- `components/seo/structured-data.tsx`: safe JSON-LD serialization.

The current 335-line home page and 180-line membership page are split by responsibility. No new page component should combine unrelated content sections, state management, SEO, and submission logic.

### Interactive islands

Only components requiring browser state use `"use client"`:

- mobile navigation disclosure;
- locale switcher interaction;
- FAQ accordion;
- membership billing-period presentation toggle;
- optional reduced-motion-safe reveal effects.

The current Three.js globe is excluded from the initial server payload. If retained, it loads as a dynamically imported decorative enhancement on large screens, honors reduced-motion preferences, has a non-animated fallback, and cannot block the hero heading or calls to action.

## Content and Request Flow

1. The Next.js proxy resolves the incoming path to `en` or `zh-HK` and applies the as-needed prefix rule.
2. The locale layout rejects unsupported locale values, loads the matching message bundle, and provides it to server and client components.
3. A page loads typed records from `content/`, resolves message keys on the server, and renders semantic HTML.
4. Page-specific `generateMetadata` produces canonical URLs, locale alternates, title, description, and Open Graph/Twitter data.
5. The page emits only the JSON-LD type required by the route: `Organization` on the root, `FAQPage` on membership, and `Event` on event detail pages.
6. `sitemap.ts` enumerates every static route, event slug, and news slug in both locales. `robots.ts` allows normal indexing and explicitly allows GPTBot, ClaudeBot, and PerplexityBot.

M0 content is code-owned and build-time validated. It does not read from Neon. Event and news records are structured so M2 or a later content repository can replace their implementation without changing page contracts.

## Visual System

The current Lovable design remains the baseline:

- Inter for interface/body text and Playfair Display for editorial headings, loaded through `next/font` rather than runtime Google CSS imports.
- Light background, dark blue-gray text, blue primary, green secondary, orange accent, coral support color, and the existing gradient treatment.
- Existing image assets are moved into stable public paths and rendered with `next/image` where applicable.
- Decorative animation never hides initial content, respects `prefers-reduced-motion`, and is removed when it harms LCP or accessibility.
- Focus states, contrast, landmarks, heading order, skip navigation, alt text, and keyboard operation meet WCAG 2.1 AA.

## SEO and Metadata

- Each page exports `generateMetadata`; metadata text comes from locale messages.
- Canonical URLs use `NEXT_PUBLIC_SITE_URL` and fall back only during local development.
- `alternates.languages` contains `en` and `zh-HK` counterparts for every indexable page.
- Open Graph images use existing approved assets; missing page-specific art falls back to the WTIA organization image.
- Sitemap entries contain canonical URLs only and include all M0 routes and detail slugs.
- Structured data is serialized without raw string concatenation and is covered by schema-shape tests.

## Failure and Edge Handling

- Unsupported locales and unknown event/news slugs render the localized 404 page with no indexable partial content.
- `app/[locale]/error.tsx` supplies a localized recovery path for unexpected render errors and reports no personal data.
- Content modules are validated at build time; duplicate slugs, missing translation keys, invalid dates, or missing required images fail the build.
- Locale navigation preserves the current logical route and falls back to the locale home only when no translated route exists.
- Optional animation or Three.js failures degrade to static content.
- The Contact page uses accessible email, telephone, and office-location actions in M0. It exposes no public POST endpoint, avoiding a non-functional form before the secured contact workflow is implemented.

## Security and Privacy Boundaries

- No secrets or connection strings are referenced by client modules.
- `.env.example` lists every environment name required by build specification section 6.4, with empty values and explanatory comments only.
- `NEXT_PUBLIC_SITE_URL` is the only required M0 environment value.
- Privacy and AI Transparency pages explain collection and AI use without claiming capabilities that are not yet live.
- External links use safe rel attributes when opening a new context.
- Dependencies are audited at milestone completion; unresolved high or critical production vulnerabilities fail acceptance.

## Testing Strategy

### Unit and static checks

- Vitest validates locale routing, navigation configuration, content schemas, unique slugs, translation-key parity, sitemap coverage, robots policies, and JSON-LD shapes.
- ESLint and TypeScript run with strict settings.
- A repository check fails when public page modules contain unapproved hardcoded user-visible strings.
- Image references and alt-message keys are validated.

### Browser and acceptance checks

- Playwright loads every required English and Traditional Chinese route and asserts one visible `h1`, correct locale, no console errors, and working locale switching.
- Detail-route tests cover valid and invalid event/news slugs.
- Accessibility smoke tests cover keyboard navigation, focus visibility, landmarks, and automated axe checks.
- Lighthouse CI runs against `/` and `/membership` with minimum scores: Performance 90, SEO 95, Accessibility 95.
- Metadata tests confirm canonical URLs, hreflang pairs, Organization/FAQPage/Event JSON-LD, sitemap entries, and crawler rules.
- Production-style build and start are tested before deployment.

The exact milestone acceptance evidence includes:

- `curl` checks showing exactly one `<h1` for `/`, `/membership`, `/launchpad`, and `/about`;
- both locale variants for every public route in `sitemap.xml`;
- a hardcoded-string audit with zero unexplained findings;
- Lighthouse reports meeting all three thresholds;
- schema-shape tests passing for Organization and FAQPage data.

## Deployment and Rollback

- The existing Vercel project `hkwtia` remains the deployment target.
- The framework changes from Vite to Next.js through repository detection; no second Vercel project is created.
- Preview deployment is verified first, followed by production promotion only after the M0 acceptance checklist passes.
- The previous READY deployment remains the rollback candidate until the Next.js production deployment is verified.
- M0 stops after deployment verification and produces the required milestone report before M1 begins.

## Repository Contract

M0 creates or updates root `AGENTS.md` with:

- stack summary;
- `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, and `db:seed` commands;
- TypeScript, i18n, server-component, formatting, testing, and commit conventions;
- an M0 changelog entry.

Database commands remain documented as unavailable until M1 supplies Drizzle and Neon integration; they must fail with a clear message rather than silently succeeding.

## M0 Completion Boundary

M0 is complete only when all routes, locales, metadata, accessibility requirements, tests, Lighthouse thresholds, preview verification, production deployment, and milestone reporting pass. Passing compilation alone is insufficient. M1 begins only after the M0 report is delivered and the user explicitly continues to the next milestone.
