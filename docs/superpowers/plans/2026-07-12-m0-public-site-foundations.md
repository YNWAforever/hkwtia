# M0 Public Site Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Vite/Lovable prototype with a production-ready, bilingual, server-rendered Next.js public site that passes every M0 acceptance check on the existing Vercel project.

**Architecture:** Migrate in place to a Next.js 16 App Router application. A locale-aware root layout under `app/[locale]` uses next-intl with unprefixed English and `/zh` for `zh-HK`; typed code-owned content feeds focused Server Components, while small interactive islands handle navigation and accordions. Metadata, JSON-LD, sitemap, robots, redirects, accessibility, and quality gates are built into the same app and verified before deployment.

**Tech Stack:** Next.js 16+, React, TypeScript strict, next-intl 4+, Tailwind CSS, shadcn/ui, Zod, Vitest, Testing Library, Playwright, axe-core, Lighthouse CI, Vercel.

## Global Constraints

- Execute only M0 in this plan; do not add Neon, Neon Auth, Stripe, Resend, R2, Cloudflare Worker, WOZTELL, or AI runtime code.
- Use the latest stable Next.js App Router and the Next.js 16 `proxy.ts` convention.
- Keep the existing Lovable copy, assets, Inter/Playfair typography, and light editorial design tokens unless the v1.1 build specification says otherwise.
- Locales are exactly `en` and `zh-HK`; public URLs are unprefixed for English and prefixed with `/zh` for Traditional Chinese.
- Every user-visible string is resolved through next-intl messages. Traditional Chinese machine drafts carry `_review: true` markers ignored by runtime translation-key checks.
- Use Server Components by default. Add `"use client"` only to components that require browser state or event handlers.
- TypeScript is strict; no `any` without a reason comment; all commits use conventional prefixes.
- Never write real secrets, database URLs, tokens, or personal data to the repository, test output, or logs.
- M0 is not done until tests, build, browser checks, Lighthouse thresholds, preview verification, production deployment, and the milestone report all pass.

---

## Planned File Structure

```text
app/
  [locale]/
    (public)/
      about/{page.tsx,chairman/page.tsx,committees/page.tsx}
      ai-ops/page.tsx
      ai-transparency/page.tsx
      contact/page.tsx
      events/{page.tsx,[slug]/page.tsx}
      launchpad/page.tsx
      membership/page.tsx
      news/{page.tsx,[slug]/page.tsx}
      privacy/page.tsx
      programs/{cpai,hkict,tct,asa}/page.tsx
      showcase/page.tsx
      layout.tsx
      page.tsx
    error.tsx
    layout.tsx
    not-found.tsx
  robots.ts
  sitemap.ts
components/
  layout/{locale-switcher,mobile-navigation,site-footer,site-header}.tsx
  marketing/{faq,feature-grid,page-hero,preview-state,program-grid,section,stats,tier-comparison}.tsx
  seo/structured-data.tsx
  ui/{accordion,button,card,sheet}.tsx
config/{navigation,public-routes,site}.ts
content/{events,news,programs,schemas}.ts
i18n/{navigation,request,routing}.ts
lib/{metadata,urls}.ts
messages/{en,zh-HK}.json
scripts/{audit-visible-strings,not-available}.mjs
tests/{e2e,unit}/
proxy.ts
next.config.ts
playwright.config.ts
lighthouserc.js
vitest.config.ts
```

Legacy Vite-only files are removed after their content and assets have been ported: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/pages/`, `vite.config.ts`, and `src/vite-env.d.ts`.

---

### Task 1: Convert the Repository Contract from Vite to Next.js

**Files:**
- Create: `tests/unit/repository-contract.test.ts`
- Create: `tests/setup.ts`
- Create: `scripts/not-available.mjs`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `eslint.config.js`
- Modify: `vitest.config.ts`
- Delete: `vite.config.ts`

**Interfaces:**
- Consumes: the current Vite package manifest and TypeScript configuration.
- Produces: scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `test:lighthouse`, `audit:strings`, `db:migrate`, and `db:seed`; a Next-compatible TypeScript/ESLint base used by every later task.

- [ ] **Step 1: Write the failing repository-contract test**

```ts
import {describe, expect, it} from 'vitest';
import manifest from '../../package.json';

describe('repository contract', () => {
  it('uses Next.js and exposes every required command', () => {
    expect(manifest.scripts).toMatchObject({
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
      'test:e2e': 'playwright test'
    });
    expect(manifest.dependencies).toHaveProperty('next');
    expect(manifest.dependencies).toHaveProperty('next-intl');
    expect(manifest.dependencies).not.toHaveProperty('react-router-dom');
    expect(manifest.devDependencies).not.toHaveProperty('vite');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails against Vite**

Run: `npm.cmd test -- tests/unit/repository-contract.test.ts`

Expected: FAIL because `start`, `typecheck`, `test:e2e`, `next`, and `next-intl` are absent and Vite dependencies are present.

- [ ] **Step 3: Replace framework dependencies and add QA dependencies**

Run:

```powershell
npm.cmd install next@latest next-intl@latest schema-dts@latest
npm.cmd install --save-dev eslint-config-next@latest @playwright/test@latest @axe-core/playwright@latest @lhci/cli@latest
npm.cmd uninstall react-router-dom @vitejs/plugin-react-swc lovable-tagger vite
```

Expected: `package-lock.json` records exact resolved versions and `npm audit` completes.

- [ ] **Step 4: Set the complete script contract**

The `scripts` object must be exactly:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "test:lighthouse": "lhci autorun",
  "audit:strings": "node scripts/audit-visible-strings.mjs",
  "db:migrate": "node scripts/not-available.mjs db:migrate M1",
  "db:seed": "node scripts/not-available.mjs db:seed M1"
}
```

Create `scripts/not-available.mjs`:

```js
const [, , command, milestone] = process.argv;
console.error(`${command} becomes available in ${milestone}; M0 has no database.`);
process.exit(1);
```

- [ ] **Step 5: Replace TypeScript and ESLint configuration**

Create this `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {"@/*": ["./*"]}
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "src"]
}
```

Create this `eslint.config.js`:

```js
import {defineConfig, globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**'])
]);
```

Replace `vitest.config.ts` with `defineConfig({resolve: {alias: {'@': path.resolve(__dirname, '.')}}, test: {environment: 'jsdom', setupFiles: ['./tests/setup.ts']}})` from `vitest/config`, and create `tests/setup.ts` containing `import '@testing-library/jest-dom/vitest';`. Delete `vite.config.ts`; keep `src/` and `index.html` as excluded, read-only migration sources until Task 6.

- [ ] **Step 6: Re-run the focused test**

Run: `npm.cmd test -- tests/unit/repository-contract.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the framework contract**

```powershell
git add package.json package-lock.json tsconfig.json eslint.config.js vitest.config.ts vite.config.ts scripts/not-available.mjs tests/setup.ts tests/unit/repository-contract.test.ts
git commit -m "chore: establish Next.js repository contract"
```

---

### Task 2: Establish Static Bilingual Routing and the Root Layout

**Files:**
- Create: `tests/unit/i18n-routing.test.ts`
- Create: `i18n/routing.ts`
- Create: `i18n/navigation.ts`
- Create: `i18n/request.ts`
- Create: `proxy.ts`
- Create: `next.config.ts`
- Create: `app/[locale]/layout.tsx`
- Create: `app/[locale]/(public)/layout.tsx`
- Create: `app/[locale]/(public)/page.tsx`
- Create: `messages/en.json`
- Create: `messages/zh-HK.json`
- Create: `app/globals.css`

**Interfaces:**
- Produces: `routing`, `AppLocale`, locale-aware navigation wrappers, a static root layout, and the initial home route.
- Consumed by: every page, metadata helper, locale switcher, sitemap, and Playwright test.

- [ ] **Step 1: Write the failing routing test**

```ts
import {describe, expect, it} from 'vitest';
import {routing} from '@/i18n/routing';

describe('i18n routing', () => {
  it('keeps English unprefixed and maps Traditional Chinese to /zh', () => {
    expect(routing.locales).toEqual(['en', 'zh-HK']);
    expect(routing.defaultLocale).toBe('en');
    expect(routing.localePrefix).toEqual({
      mode: 'as-needed',
      prefixes: {'zh-HK': '/zh'}
    });
  });
});
```

- [ ] **Step 2: Run the test to verify the routing module is missing**

Run: `npm.cmd test -- tests/unit/i18n-routing.test.ts`

Expected: FAIL with a module-resolution error for `@/i18n/routing`.

- [ ] **Step 3: Implement current next-intl routing APIs**

Create `i18n/routing.ts`:

```ts
import {defineRouting} from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'zh-HK'],
  defaultLocale: 'en',
  localePrefix: {
    mode: 'as-needed',
    prefixes: {'zh-HK': '/zh'}
  },
  localeCookie: {maxAge: 60 * 60 * 24 * 365}
});

export type AppLocale = (typeof routing.locales)[number];
```

Create `i18n/navigation.ts`:

```ts
import {createNavigation} from 'next-intl/navigation';
import {routing} from './routing';

export const {Link, redirect, usePathname, useRouter, getPathname} =
  createNavigation(routing);
```

Create `i18n/request.ts`:

```ts
import {hasLocale} from 'next-intl';
import {getRequestConfig} from 'next-intl/server';
import {routing} from './routing';

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
```

Create `proxy.ts`:

```ts
import createMiddleware from 'next-intl/middleware';
import {routing} from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)'
};
```

- [ ] **Step 4: Configure the next-intl plugin and legacy redirects**

Create `next.config.ts`:

```ts
import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {source: '/projects', destination: '/programs/asa', permanent: true},
      {source: '/history', destination: '/about', permanent: true},
      {source: '/members', destination: '/showcase', permanent: false},
      {source: '/members/:id', destination: '/showcase', permanent: false}
    ];
  }
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 5: Create initial messages and the statically rendered root layout**

The initial message bundles contain the same key structure:

```json
{
  "Common": {"skipToContent": "Skip to content"},
  "Metadata": {
    "title": "WTIA | Innovate Hong Kong",
    "description": "Connecting Hong Kong and Greater Bay Area innovation to global markets."
  },
  "Home": {
    "eyebrow": "Innovate Hong Kong",
    "title": "Bridging GBA innovation to the global stage.",
    "summary": "The cross-border platform connecting Hong Kong, the Greater Bay Area, and Asia to global tech markets."
  }
}
```

```json
{
  "_review": true,
  "Common": {"skipToContent": "Ë∑≥Ëá≥‰∏ªË??ßÂÆπ"},
  "Metadata": {
    "title": "WTIAÔΩúÂâµÁßëÈ?Ê∏?,
    "description": "??π´È¶ôÊ∏Ø?äÂ§ß????µÊñ∞?õÈ?ÔºåËµ∞?ëÂÖ®?ÉÂ??¥„Ä?
  },
  "Home": {
    "eyebrow": "?µÁ?È¶ôÊ∏Ø",
    "title": "??π´Â§ßÁÅ£?Ä?µÊñ∞?õÈ?ÔºåËµ∞?ë‰??åË??∞„Ä?,
    "summary": "Ë∑®Â?Âπ≥Âè∞??π´È¶ôÊ∏Ø?ÅÂ§ß????Å‰?Ê¥≤Ë??®Á?ÁßëÊ?Â∏ÇÂ†¥??
  }
}
```

Create `app/[locale]/layout.tsx` with validated `params: Promise<{locale: string}>`, `generateStaticParams`, `setRequestLocale(locale)`, `getMessages()`, `Inter`, `Playfair_Display`, `<html lang={locale}>`, and `NextIntlClientProvider`. Create a minimal `(public)` layout with skip link and `<main id="main-content">`, and a home page whose translated heading is the sole `h1`.

- [ ] **Step 6: Run static checks and a production build**

Run:

```powershell
npm.cmd test -- tests/unit/i18n-routing.test.ts
npm.cmd run typecheck
npm.cmd run build
```

Expected: all commands PASS; build output includes `/` and `/zh` as static routes.

- [ ] **Step 7: Commit the bilingual routing foundation**

```powershell
git add app i18n messages proxy.ts next.config.ts tests/unit/i18n-routing.test.ts
git commit -m "feat: add static bilingual App Router foundation"
```

---

### Task 3: Add Typed Content, URL, and Metadata Contracts

**Files:**
- Create: `tests/unit/content-contract.test.ts`
- Create: `tests/unit/metadata.test.ts`
- Create: `config/public-routes.ts`
- Create: `config/site.ts`
- Create: `content/schemas.ts`
- Create: `content/events.ts`
- Create: `content/news.ts`
- Create: `content/programs.ts`
- Create: `lib/urls.ts`
- Create: `lib/metadata.ts`

**Interfaces:**
- Produces: `publicRoutes`, `events`, `newsPosts`, `programs`, `absoluteUrl`, `localizedPath`, and `buildPageMetadata`.
- Consumed by: all public routes, dynamic detail pages, sitemap, metadata tests, and JSON-LD helpers.

- [ ] **Step 1: Write failing schema and metadata tests**

```ts
import {describe, expect, it} from 'vitest';
import {eventSchema, newsPostSchema} from '@/content/schemas';
import {publicRoutes} from '@/config/public-routes';

describe('public content contract', () => {
  it('has unique static paths and valid dynamic records', () => {
    expect(new Set(publicRoutes).size).toBe(publicRoutes.length);
    expect(publicRoutes).toContain('/membership');
    expect(() => eventSchema.array().parse([])).not.toThrow();
    expect(() => newsPostSchema.array().parse([])).not.toThrow();
  });
});
```

```ts
import {describe, expect, it} from 'vitest';
import {localizedPath} from '@/lib/urls';

describe('localizedPath', () => {
  it('keeps English unprefixed and uses /zh for zh-HK', () => {
    expect(localizedPath('en', '/membership')).toBe('/membership');
    expect(localizedPath('zh-HK', '/membership')).toBe('/zh/membership');
  });
});
```

- [ ] **Step 2: Run tests and confirm missing modules**

Run: `npm.cmd test -- tests/unit/content-contract.test.ts tests/unit/metadata.test.ts`

Expected: FAIL with module-resolution errors.

- [ ] **Step 3: Implement content schemas and records**

`content/schemas.ts` defines Zod schemas with no optional identity fields:

```ts
import {z} from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const eventSchema = z.object({
  slug,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  venue: z.string().min(1),
  image: z.string().startsWith('/'),
  namespace: z.string().min(1)
});

export const newsPostSchema = z.object({
  slug,
  publishedAt: z.string().datetime(),
  image: z.string().startsWith('/'),
  namespace: z.string().min(1)
});

export const programSchema = z.object({
  id: z.enum(['cpai', 'hkict', 'tct', 'asa']),
  namespace: z.string().min(1),
  image: z.string().startsWith('/')
});

export type EventRecord = z.infer<typeof eventSchema>;
export type NewsPostRecord = z.infer<typeof newsPostSchema>;
export type ProgramRecord = z.infer<typeof programSchema>;
```

M0 starts `events` and `newsPosts` as validated empty arrays rather than publishing invented dates or claims. `programs` contains all four specified IDs and references approved current assets. Tests use explicit fixtures to verify detail rendering and JSON-LD without publishing fake records.

- [ ] **Step 4: Implement route and URL helpers**

`config/public-routes.ts` exports this exact list:

```ts
export const publicRoutes = [
  '/', '/about', '/about/chairman', '/about/committees', '/membership',
  '/showcase', '/launchpad', '/ai-ops', '/events', '/news',
  '/programs/cpai', '/programs/hkict', '/programs/tct', '/programs/asa',
  '/contact', '/privacy', '/ai-transparency'
] as const;
```

`lib/urls.ts`:

```ts
import type {AppLocale} from '@/i18n/routing';

export function localizedPath(locale: AppLocale, path: string): string {
  if (locale === 'en') return path;
  return path === '/' ? '/zh' : `/zh${path}`;
}

export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return new URL(path, base).toString();
}
```

`lib/metadata.ts` exports `buildPageMetadata({locale, pathname, title, description, image})` returning a Next `Metadata` object with canonical, `en` and `zh-HK` alternates, Open Graph, and Twitter data.

- [ ] **Step 5: Re-run focused tests**

Run: `npm.cmd test -- tests/unit/content-contract.test.ts tests/unit/metadata.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit typed content and metadata contracts**

```powershell
git add config content lib tests/unit/content-contract.test.ts tests/unit/metadata.test.ts
git commit -m "feat: add typed public content and metadata contracts"
```

---

### Task 4: Port the Design System and Public Site Shell

**Files:**
- Create: `tests/unit/navigation.test.ts`
- Create: `components/layout/site-header.tsx`
- Create: `components/layout/mobile-navigation.tsx`
- Create: `components/layout/locale-switcher.tsx`
- Create: `components/layout/site-footer.tsx`
- Create: `config/navigation.ts`
- Create/port: `components/ui/button.tsx`, `components/ui/sheet.tsx`
- Modify: `app/globals.css`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/[locale]/(public)/layout.tsx`

**Interfaces:**
- Produces: a responsive, keyboard-operable public shell and locale-preserving navigation.
- Consumed by: every public page and accessibility test.

- [ ] **Step 1: Write the failing navigation contract test**

```ts
import {describe, expect, it} from 'vitest';
import {navigationItems} from '@/config/navigation';

describe('navigation', () => {
  it('uses route identifiers and translation keys without visible labels', () => {
    expect(navigationItems).toEqual([
      {href: '/about', labelKey: 'about'},
      {href: '/membership', labelKey: 'membership'},
      {href: '/showcase', labelKey: 'showcase'},
      {href: '/launchpad', labelKey: 'launchpad'},
      {href: '/events', labelKey: 'events'},
      {href: '/news', labelKey: 'news'}
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm the configuration is missing**

Run: `npm.cmd test -- tests/unit/navigation.test.ts`

Expected: FAIL with a module-resolution error.

- [ ] **Step 3: Port tokens and fonts without runtime font CSS**

Move the HSL tokens and utilities from `src/index.css` to `app/globals.css`. Replace the Google `@import` with `Inter` and `Playfair_Display` from `next/font/google` in the locale root layout. Preserve `.gradient-text`, `.glass-card`, and focus styles; gate all movement under `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 4: Implement the responsive site shell**

`SiteHeader` and `SiteFooter` are Server Components. `MobileNavigation` and `LocaleSwitcher` are the only Client Components. The locale switcher uses `usePathname()` and `useRouter().replace(pathname, {locale})`; the mobile menu uses a labelled shadcn Sheet, closes after navigation, and restores focus to its trigger.

Add exact `Navigation` and `Footer` message namespaces in both locale files. No component contains literal user-visible labels.

- [ ] **Step 5: Run unit, type, and lint checks**

Run:

```powershell
npm.cmd test -- tests/unit/navigation.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the shell and design system**

```powershell
git add app components config/navigation.ts messages tests/unit/navigation.test.ts
git commit -m "feat: port WTIA design system and public shell"
```

---

### Task 5: Build the Home, About, and Membership Experiences

**Files:**
- Create: `tests/e2e/core-pages.spec.ts`
- Create: `playwright.config.ts`
- Create: `components/marketing/page-hero.tsx`
- Create: `components/marketing/section.tsx`
- Create: `components/marketing/feature-grid.tsx`
- Create: `components/marketing/stats.tsx`
- Create: `components/marketing/program-grid.tsx`
- Create: `components/marketing/tier-comparison.tsx`
- Create: `components/marketing/faq.tsx`
- Create: `app/[locale]/(public)/about/page.tsx`
- Create: `app/[locale]/(public)/about/chairman/page.tsx`
- Create: `app/[locale]/(public)/about/committees/page.tsx`
- Create: `app/[locale]/(public)/membership/page.tsx`
- Modify: `app/[locale]/(public)/page.tsx`
- Modify: `messages/en.json`, `messages/zh-HK.json`

**Interfaces:**
- Consumes: site shell, typed programs, metadata helper, locale params, and current prototype copy/assets.
- Produces: the primary marketing and membership routes and reusable marketing sections.

- [ ] **Step 1: Write failing browser expectations**

```ts
import {expect, test} from '@playwright/test';

for (const path of ['/', '/about', '/about/chairman', '/about/committees', '/membership']) {
  test(`${path} renders one English heading`, async ({page}) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
  });

  test(`/zh${path === '/' ? '' : path} renders one Chinese heading`, async ({page}) => {
    await page.goto(`/zh${path === '/' ? '' : path}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-HK');
    await expect(page.locator('h1')).toHaveCount(1);
  });
}
```

Create `playwright.config.ts` with `defineConfig({testDir: './tests/e2e', use: {baseURL: 'http://127.0.0.1:3000', trace: 'on-first-retry'}, projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}], webServer: {command: 'npm.cmd run dev -- --hostname 127.0.0.1', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI}})`.

- [ ] **Step 2: Run the focused browser test and confirm missing routes**

Run: `npx.cmd playwright install chromium`, then `npm.cmd run test:e2e -- tests/e2e/core-pages.spec.ts`.

Expected: FAIL on the not-yet-created About and Membership routes.

- [ ] **Step 3: Port the home page into focused Server Components**

Map existing `src/pages/Index.tsx` sections to `PageHero`, `FeatureGrid`, `Stats`, and `ProgramGrid`. Replace React Router links with the locale-aware `Link`, load images through `next/image`, keep one `h1`, and move every visible string into the `Home` message namespace.

- [ ] **Step 4: Implement About routes with explicit content boundaries**

`/about` owns organization overview and history; `/about/chairman` owns the chairman message; `/about/committees` owns committee structure. Each route calls `setRequestLocale(locale)`, exports route-specific `generateMetadata`, has one `h1`, and resolves all copy from its own message namespace.

- [ ] **Step 5: Implement the membership comparison and FAQ**

Port current benefits and tier presentation into six v1 tiers: community, individual, startup, corporate, platinum, and patron. M0 buttons explain the upcoming self-service flow without starting checkout. Annual pricing is primary; monthly presentation appears only for individual and startup. The FAQ uses an accessible accordion and the page emits FAQPage JSON-LD in Task 7.

- [ ] **Step 6: Re-run browser, unit, type, and lint checks**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/core-pages.spec.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all commands PASS.

- [ ] **Step 7: Commit primary public experiences**

```powershell
git add app components/marketing messages tests/e2e/core-pages.spec.ts
git commit -m "feat: build M0 home about and membership routes"
```

---

### Task 6: Build Programs, Preview Modules, Events, News, and Policy Routes

**Files:**
- Create: `tests/e2e/public-route-matrix.spec.ts`
- Create: `tests/unit/detail-pages.test.ts`
- Create: `components/marketing/preview-state.tsx`
- Create all remaining page files listed under Planned File Structure.
- Create: `app/[locale]/not-found.tsx`
- Create: `app/[locale]/error.tsx`
- Delete after the port is verified: `index.html`, `src/`
- Modify: `messages/en.json`, `messages/zh-HK.json`

**Interfaces:**
- Consumes: `publicRoutes`, typed program/event/news records, metadata helper, and site shell.
- Produces: the complete M0 route matrix, honest empty states, localized 404 handling, and safe render recovery.

- [ ] **Step 1: Write the failing complete route-matrix test**

```ts
import {expect, test} from '@playwright/test';

const paths = [
  '/showcase', '/launchpad', '/ai-ops', '/events', '/news',
  '/programs/cpai', '/programs/hkict', '/programs/tct', '/programs/asa',
  '/contact', '/privacy', '/ai-transparency'
];

for (const path of paths) {
  for (const prefix of ['', '/zh']) {
    test(`${prefix}${path} renders one h1`, async ({page}) => {
      await page.goto(`${prefix}${path}`);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toBeVisible();
    });
  }
}
```

- [ ] **Step 2: Run the matrix and confirm missing routes**

Run: `npm.cmd run test:e2e -- tests/e2e/public-route-matrix.spec.ts`

Expected: FAIL for every not-yet-created route.

- [ ] **Step 3: Implement the four program and Launch Pad routes**

Each program route reads its record from `content/programs.ts`, uses its dedicated message namespace, and renders a shared program-detail composition. `/launchpad` explains the go-global cohort model and marks applications and funding matching as later-milestone capabilities without presenting live forms.

- [ ] **Step 4: Implement honest Showcase and AI-Ops preview states**

`PreviewState` accepts only translated eyebrow, title, description, milestone label, and related links. `/showcase` identifies M5 as its live-data milestone; `/ai-ops` identifies M4 and shows no fabricated metrics.

- [ ] **Step 5: Implement Events and News index/detail behavior**

Index pages render translated empty states when their validated arrays are empty. Detail pages use `generateStaticParams`, find records by slug, call `notFound()` when absent, and use fixtures only inside tests. Add unit tests that inject valid event/news fixtures into the pure detail-view components and assert one heading plus the expected date/title.

- [ ] **Step 6: Implement Contact, Privacy, and AI Transparency**

Contact exposes accessible email, telephone, and office actions only; it creates no POST endpoint. Privacy describes current M0 collection accurately. AI Transparency distinguishes planned agents from live functionality and links to `/ai-ops`.

- [ ] **Step 7: Implement localized 404 and error recovery**

`not-found.tsx` provides translated recovery links. `error.tsx` is a minimal Client Component with a translated message and `reset()` button, and never renders the thrown error text.

- [ ] **Step 8: Remove the fully ported Vite application**

After the new route matrix passes, delete `index.html` and `src/`. Confirm every retained asset has a stable path under `public/` and no import resolves through the legacy tree.

- [ ] **Step 9: Run the full route matrix and static checks**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/public-route-matrix.spec.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: all commands PASS; the build route table contains every M0 static page in both locales.

- [ ] **Step 10: Commit the complete route surface**

```powershell
git add -A
git commit -m "feat: complete bilingual M0 public route surface"
```

---

### Task 7: Add Structured Data, Sitemap, Robots, and Metadata Coverage

**Files:**
- Create: `tests/unit/seo-routes.test.ts`
- Create: `components/seo/structured-data.tsx`
- Create: `app/sitemap.ts`
- Create: `app/robots.ts`
- Modify: `app/[locale]/(public)/page.tsx`
- Modify: `app/[locale]/(public)/membership/page.tsx`
- Modify: `app/[locale]/(public)/events/[slug]/page.tsx`

**Interfaces:**
- Produces: `StructuredData`, Organization/FAQPage/Event builders, localized sitemap records, and crawler rules.
- Consumed by: root, membership, event detail, and SEO acceptance tests.

- [ ] **Step 1: Write failing SEO tests**

```ts
import {describe, expect, it} from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import {publicRoutes} from '@/config/public-routes';

describe('M0 indexability', () => {
  it('lists both locales for every static route', () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of publicRoutes) {
      expect(urls).toContain(new URL(path, process.env.NEXT_PUBLIC_SITE_URL).toString());
      const zhPath = path === '/' ? '/zh' : `/zh${path}`;
      expect(urls).toContain(new URL(zhPath, process.env.NEXT_PUBLIC_SITE_URL).toString());
    }
  });

  it('allows the three specified AI crawlers', () => {
    const userAgents = robots().rules instanceof Array
      ? robots().rules.flatMap((rule) => rule.userAgent ?? [])
      : [];
    expect(userAgents).toEqual(expect.arrayContaining(['GPTBot', 'ClaudeBot', 'PerplexityBot']));
  });
});
```

- [ ] **Step 2: Run the SEO test and confirm missing modules**

Run: `$env:NEXT_PUBLIC_SITE_URL='https://hkwtia.vercel.app'; npm.cmd test -- tests/unit/seo-routes.test.ts`

Expected: FAIL because sitemap and robots modules do not exist.

- [ ] **Step 3: Implement safe JSON-LD**

`StructuredData` accepts `WithContext<Organization | FAQPage | Event>` and serializes with `JSON.stringify(data).replace(/</g, '\\u003c')`. The root uses Organization, membership uses FAQPage derived from translated FAQ entries, and event detail uses Event derived from its validated record. No page concatenates JSON strings.

- [ ] **Step 4: Implement localized sitemap and crawler rules**

`app/sitemap.ts` returns one entry per static route and locale plus any validated event/news records. Each entry includes `alternates.languages` with `en` and `zh-HK`. `app/robots.ts` allows `*`, GPTBot, ClaudeBot, and PerplexityBot and points at the canonical sitemap.

- [ ] **Step 5: Verify metadata and SEO tests**

Run:

```powershell
$env:NEXT_PUBLIC_SITE_URL='https://hkwtia.vercel.app'
npm.cmd test -- tests/unit/metadata.test.ts tests/unit/seo-routes.test.ts
npm.cmd run build
```

Expected: PASS; build emits `/sitemap.xml` and `/robots.txt`.

- [ ] **Step 6: Commit indexability features**

```powershell
git add app components/seo tests/unit/seo-routes.test.ts
git commit -m "feat: add M0 metadata structured data and crawler routes"
```

---

### Task 8: Enforce Translation, Accessibility, and Repository Contracts

**Files:**
- Create: `tests/unit/messages.test.ts`
- Create: `scripts/audit-visible-strings.mjs`
- Create: `tests/e2e/accessibility.spec.ts`
- Modify: `playwright.config.ts`
- Create: `lighthouserc.js`
- Create: `.env.example`
- Create: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Produces: reproducible QA commands, exact environment inventory, translation parity checks, and contributor instructions.
- Consumed by: CI and final M0 acceptance verification.

- [ ] **Step 1: Write failing translation parity tests**

```ts
import {describe, expect, it} from 'vitest';
import en from '@/messages/en.json';
import zh from '@/messages/zh-HK.json';

function keys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (key.startsWith('_')) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'string' ? [path] : keys(child, path);
  });
}

describe('messages', () => {
  it('keeps locale keys in parity and retains the Chinese review marker', () => {
    expect(keys(zh).sort()).toEqual(keys(en).sort());
    expect(zh._review).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and repair every missing translation key**

Run: `npm.cmd test -- tests/unit/messages.test.ts`

Expected before repair: FAIL with explicit missing or extra keys. Add exact translations until PASS.

- [ ] **Step 3: Add hardcoded-visible-string and accessibility checks**

`scripts/audit-visible-strings.mjs` scans public `.tsx` files, excludes tests, translation-key declarations, aria-hidden decorative text, and numeric-only content, and exits non-zero with file and line for unapproved JSX text. `tests/e2e/accessibility.spec.ts` runs axe on `/`, `/membership`, `/zh`, and `/zh/membership`, checks the skip link, tabs through header controls, and asserts no serious or critical violations.

- [ ] **Step 4: Add Playwright and Lighthouse configuration**

Playwright starts `npm.cmd run dev -- --hostname 127.0.0.1`, uses `http://127.0.0.1:3000`, Chromium, one retry in CI, screenshots on failure, and trace on first retry. Lighthouse CI starts the production server and asserts minimum scores of Performance 0.90, Accessibility 0.95, and SEO 0.95 for `/` and `/membership`.

- [ ] **Step 5: Create the complete secret-free environment template**

`.env.example` contains these names with empty values:

```dotenv
NEXT_PUBLIC_SITE_URL=
DATABASE_URL=
DATABASE_URL_UNPOOLED=
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AGENTS_ENABLED=
AGENT_MODEL_CONCIERGE=
AGENT_MODEL_ANALYST=
CRON_SECRET=
FOUNDING_DEADLINE=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
NEXT_PUBLIC_R2_PUBLIC_URL=
WOZTELL_API_TOKEN=
WOZTELL_CHANNEL_ID=
WOZTELL_WEBHOOK_SECRET=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
SENTRY_DSN=
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

- [ ] **Step 6: Create contributor and milestone documentation**

`AGENTS.md` states the stack, required scripts, Server Component default, i18n rule, strict TypeScript rule, test commands, conventional commits, secret handling, and an M0 changelog entry. `README.md` replaces the Lovable boilerplate with setup, environment, development, testing, build, and deployment instructions.

- [ ] **Step 7: Run all repository-level gates**

Run:

```powershell
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:e2e -- tests/e2e/accessibility.spec.ts
npm.cmd audit --omit=dev --audit-level=high
```

Expected: every command PASS and production audit reports zero high or critical vulnerabilities.

- [ ] **Step 8: Commit quality and repository contracts**

```powershell
git add .env.example AGENTS.md README.md lighthouserc.js playwright.config.ts scripts tests messages
git commit -m "test: enforce M0 accessibility i18n and repository gates"
```

---

### Task 9: Run the Full M0 Acceptance Checklist Locally

**Files:**
- Create: `docs/milestones/M0-public-site-foundations.md`
- Modify only if verification exposes a defect: the smallest directly responsible source or test file.

**Interfaces:**
- Consumes: the complete M0 application and QA commands.
- Produces: reproducible local acceptance evidence for deployment.

- [ ] **Step 1: Run the complete non-browser verification suite**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run audit:strings
$env:NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3000'
npm.cmd run build
```

Expected: all commands PASS with no unexplained warnings.

- [ ] **Step 2: Run all browser tests against the production build**

Run: `npm.cmd run test:e2e`

Expected: all route, locale, invalid-slug, navigation, console, and axe tests PASS.

- [ ] **Step 3: Verify the four required HTML headings**

```powershell
$server = Start-Process npm.cmd -ArgumentList 'run','start','--','--hostname','127.0.0.1' -WorkingDirectory $PWD -PassThru -WindowStyle Hidden
try {
  $paths = '/', '/membership', '/launchpad', '/about'
  foreach ($path in $paths) {
    $html = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3000$path").Content
    if (($html | Select-String -Pattern '<h1' -AllMatches).Matches.Count -ne 1) { throw "$path does not contain exactly one h1" }
  }
} finally {
  Stop-Process -Id $server.Id
}
```

Expected: command exits successfully for all four paths.

- [ ] **Step 4: Run Lighthouse CI**

Run: `npm.cmd run test:lighthouse`

Expected: `/` and `/membership` meet Performance 90, SEO 95, and Accessibility 95.

- [ ] **Step 5: Write the local acceptance section of the milestone report**

`docs/milestones/M0-public-site-foundations.md` records the commit SHA, exact command results, route matrix count, Lighthouse scores, how to demo locale switching, and any human-owned follow-ups. It states that M1 has not started.

- [ ] **Step 6: Commit local acceptance evidence**

```powershell
git add docs/milestones/M0-public-site-foundations.md
git commit -m "docs: record local M0 acceptance evidence"
```

---

### Task 10: Deploy, Verify Production, and Stop at the M0 Gate

**Files:**
- Modify: `docs/milestones/M0-public-site-foundations.md`

**Interfaces:**
- Consumes: a clean, fully verified M0 commit and the existing Vercel project `hkwtia`.
- Produces: a READY preview, verified production deployment, final acceptance report, and rollback reference.

- [ ] **Step 1: Confirm clean Git and Vercel linkage**

Run:

```powershell
git status --short --branch
vercel.cmd project inspect hkwtia
```

Expected: clean branch; project ID `prj_lT7YZDueA6kzhz2xrPPHFyNsDf8n` under team `ynwaforevers-projects`.

- [ ] **Step 2: Create and inspect a preview deployment**

Run: `vercel.cmd deploy --yes`

Expected: a deployment URL reaches READY. Record its deployment ID and URL without exposing environment values.

- [ ] **Step 3: Run production-shaped remote smoke checks**

Against the preview URL, verify `/`, `/zh`, `/membership`, `/zh/membership`, `/sitemap.xml`, and `/robots.txt`; assert HTTP 200, one `h1` on page routes, correct `lang`, canonical/hreflang metadata, and no browser console errors.

- [ ] **Step 4: Promote only after preview acceptance**

Run: `vercel.cmd deploy --prod --yes`

Expected: production reaches READY and the existing production domains point to the new deployment. Keep deployment `dpl_328UsZGhrEkGmiV8rCka8rGpnuJc` recorded as the pre-M0 rollback candidate until verification finishes.

- [ ] **Step 5: Repeat critical checks on production**

Verify all four required heading routes, both locale homes, metadata, sitemap, robots, JSON-LD, and Lighthouse URLs against `https://hkwtia.vercel.app`.

- [ ] **Step 6: Complete and commit the milestone report**

Append production deployment ID, verification timestamp in Asia/Hong_Kong, production URLs, final scores, rollback reference, demo steps, test totals, and open human review items to the report.

```powershell
git add docs/milestones/M0-public-site-foundations.md
git commit -m "docs: complete M0 deployment report"
```

- [ ] **Step 7: Stop before M1**

Output the M0 report summary: what shipped, how to demo it, complete test results, deployment evidence, and human-owned follow-ups. Do not add Neon, authentication, membership persistence, or billing code until the user explicitly continues to M1.

---

## Plan Self-Review Checklist

- Every M0 route in build specification section 5.1 is assigned to Task 5 or Task 6.
- Both locales, custom `/zh` prefix, static rendering, and locale switching are covered by Tasks 2, 5, 6, and 8.
- Per-route metadata, hreflang, sitemap, robots, Organization/FAQPage/Event JSON-LD are covered by Tasks 3 and 7.
- WCAG, hardcoded strings, strict typing, lint, dependency audit, E2E, and Lighthouse thresholds are covered by Tasks 8 and 9.
- Existing design tokens/assets and legacy redirects are covered by Tasks 2, 4, and 5.
- `.env.example`, `AGENTS.md`, commands, milestone changelog, deployment, rollback, and stop gate are covered by Tasks 8-10.
- M1-M6 implementation is explicitly excluded from this plan while their environment names remain documented as required.

## Primary Documentation References

- Next.js App Router: https://nextjs.org/docs/app
- Next.js `generateMetadata`: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js sitemap convention: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js robots convention: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- next-intl routing setup: https://next-intl.dev/docs/routing/setup
- next-intl routing configuration: https://next-intl.dev/docs/routing/configuration
