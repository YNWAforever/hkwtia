# M0 Completion and Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete, verify, preview-deploy, and production-promote the bilingual WTIA M0 public site before any M1 work begins.

**Architecture:** Replace the temporary catch-all route with dedicated App Router pages that share focused server-rendered compositions and validated locale-neutral records. Add typed SEO, translation, accessibility, and repository contracts, then pass four ordered gates: route completion, release contracts, Vercel Preview verification, and production promotion.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5 strict mode, next-intl 4, Zod 3, Vitest 3, Playwright 1.61, axe-core, Lighthouse CI, Vercel CLI.

## Global Constraints

- Work only in `codex/m0-public-site-foundations` at `C:\Users\laich\Documents\hkwtia\.worktrees\m0-public-site-foundations`.
- Preserve English at unprefixed URLs and Traditional Chinese under `/zh`.
- Public pages default to Server Components; only interactive recovery/navigation controls use `'use client'`.
- No invented events, news, member listings, dates, metrics, funding matches, applications, or programme claims.
- Events and news remain validated empty arrays in M0; fixtures exist only in tests.
- M0 must not connect to Neon, Neon Auth, Stripe, Resend, AI providers, or WOZTELL.
- Never print, commit, or copy secret values. Environment documentation contains names with empty values only.
- Preview verification precedes production; production promotes the exact verified artifact.
- Required Lighthouse floors: Performance 0.90, Accessibility 0.95, SEO 0.95.
- Stop after the production M0 evidence report. Do not start M1.

---

### Task 1: Replace the Temporary Catch-All with Dedicated Programme and Preview Routes

**Files:**
- Create: `tests/unit/route-ownership.test.ts`
- Create: `components/marketing/program-detail.tsx`
- Create: `app/[locale]/(public)/programs/cpai/page.tsx`
- Create: `app/[locale]/(public)/programs/hkict/page.tsx`
- Create: `app/[locale]/(public)/programs/tct/page.tsx`
- Create: `app/[locale]/(public)/programs/asa/page.tsx`
- Create: `app/[locale]/(public)/launchpad/page.tsx`
- Create: `app/[locale]/(public)/showcase/page.tsx`
- Create: `app/[locale]/(public)/ai-ops/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Delete: `app/[locale]/(public)/[...slug]/page.tsx`

**Interfaces:**
- Consumes: `programs: ProgramRecord[]`, `PageHero`, `PreviewState`, `buildPageMetadata()`.
- Produces: `ProgramDetail({program, title, description, status})` and seven dedicated static routes.

- [ ] **Step 1: Write a failing route-ownership test**

```ts
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const root = process.cwd();
const dedicated = [
  'programs/cpai', 'programs/hkict', 'programs/tct', 'programs/asa',
  'launchpad', 'showcase', 'ai-ops'
];

describe('M0 route ownership', () => {
  it('uses dedicated pages and removes the temporary catch-all', () => {
    for (const route of dedicated) {
      expect(existsSync(join(root, 'app/[locale]/(public)', route, 'page.tsx'))).toBe(true);
    }
    expect(existsSync(join(root, 'app/[locale]/(public)/[...slug]/page.tsx'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm the catch-all failure**

Run: `npm.cmd test -- tests/unit/route-ownership.test.ts`
Expected: FAIL because dedicated pages are missing and `[...slug]/page.tsx` exists.

- [ ] **Step 3: Implement the shared programme composition**

```tsx
import Image from 'next/image';
import type {ProgramRecord} from '@/content/schemas';
import {PageHero} from '@/components/marketing/page-hero';

export function ProgramDetail({program, title, description, status}: {
  program: ProgramRecord;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <>
      <PageHero eyebrow={program.id.toUpperCase()} title={title} description={description}
        image={program.image} imageAlt="" />
      <section className="container mx-auto px-6 py-16">
        <div className="glass-card p-6">
          <Image src={program.image} alt="" width={800} height={450}
            className="sr-only" />
          <p className="text-muted-foreground">{status}</p>
        </div>
      </section>
    </>
  );
}
```

Each programme page selects its fixed record with
`programs.find((program) => program.id === '<id>')!`, calls
`setRequestLocale(locale)`, resolves its dedicated namespace, exports
`generateMetadata` using `/programs/<id>`, and renders `ProgramDetail`.

- [ ] **Step 4: Implement Launch Pad, Showcase, and AI-Ops**

Launch Pad renders translated cohort-model copy and a translated later-milestone notice with no form. Showcase renders `PreviewState` labelled M5. AI-Ops renders `PreviewState` labelled M4 and contains no numeric operational metrics. Each page exports route-specific metadata and exactly one `h1`.

- [ ] **Step 5: Remove the catch-all and verify dedicated ownership**

Delete `app/[locale]/(public)/[...slug]/page.tsx`.

Run:
```powershell
npm.cmd test -- tests/unit/route-ownership.test.ts
npm.cmd run test:e2e -- tests/e2e/public-route-matrix.spec.ts --grep "programs|launchpad|showcase|ai-ops"
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the dedicated programme and preview routes**

```powershell
git add -A app components/marketing messages tests/unit/route-ownership.test.ts
git commit -m "feat: add dedicated M0 programme and preview routes"
```

---

### Task 2: Add Events, News, Policy Routes, and Safe Recovery

**Files:**
- Create: `tests/unit/detail-pages.test.ts`
- Create: `components/marketing/event-detail.tsx`
- Create: `components/marketing/news-detail.tsx`
- Create: `components/marketing/empty-state.tsx`
- Create: `app/[locale]/(public)/events/page.tsx`
- Create: `app/[locale]/(public)/events/[slug]/page.tsx`
- Create: `app/[locale]/(public)/news/page.tsx`
- Create: `app/[locale]/(public)/news/[slug]/page.tsx`
- Create: `app/[locale]/(public)/contact/page.tsx`
- Create: `app/[locale]/(public)/privacy/page.tsx`
- Create: `app/[locale]/(public)/ai-transparency/page.tsx`
- Create: `app/[locale]/not-found.tsx`
- Create: `app/[locale]/error.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-HK.json`
- Delete after verification: `index.html`
- Delete after verification: `src/`

**Interfaces:**
- Produces: `EventDetail({record, title})`, `NewsDetail({record, title})`,
  `EmptyState({title, description})`, localized recovery, and the complete route matrix.

- [ ] **Step 1: Write failing detail-component tests**

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {EventDetail} from '@/components/marketing/event-detail';
import {NewsDetail} from '@/components/marketing/news-detail';

describe('detail views', () => {
  it('renders a validated event fixture with one heading and date', () => {
    render(<EventDetail title="Demo Day" record={{
      slug: 'demo-day', startsAt: '2026-08-01T02:00:00.000Z', endsAt: null,
      venue: 'WTIA', image: '/images/projects-hero.jpg', namespace: 'events.demo'
    }} />);
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('renders a validated news fixture with one heading and date', () => {
    render(<NewsDetail title="Verified update" record={{
      slug: 'verified-update', publishedAt: '2026-08-01T02:00:00.000Z',
      image: '/images/projects-hero.jpg', namespace: 'news.verified'
    }} />);
    expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests and confirm missing-component errors**

Run: `npm.cmd test -- tests/unit/detail-pages.test.ts`
Expected: FAIL because both detail components are missing.

- [ ] **Step 3: Implement pure detail components and route behavior**

Both components render `PageHero`, format their ISO date with
`Intl.DateTimeFormat('en-HK', {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'})`,
and render the validated image. Index pages map real records or render
`EmptyState`. Dynamic pages export `generateStaticParams`, find by slug, and
call `notFound()` when no record exists.

- [ ] **Step 4: Implement Contact, Privacy, and AI Transparency**

Contact renders only `mailto:contact@hkwtia.org`, `tel:+85229899164`, and the
office address. Privacy states that M0 has no accounts, forms, or payments. AI
Transparency states that agents are planned, not live, and links to `/ai-ops`.
All visible copy comes from dedicated namespaces.

- [ ] **Step 5: Implement localized recovery**

`not-found.tsx` renders one translated heading and links to home and contact.
`error.tsx` is a Client Component accepting
`{error: Error & {digest?: string}; reset: () => void}`; it ignores `error`,
renders no diagnostic text, and invokes `reset` from a translated button.

- [ ] **Step 6: Verify the new route surface before legacy removal**

Run:
```powershell
npm.cmd test -- tests/unit/detail-pages.test.ts
npm.cmd run test:e2e -- tests/e2e/public-route-matrix.spec.ts
npm.cmd run build
```

Expected: PASS; all 24 matrix cases return below 400 with one visible `h1`.

- [ ] **Step 7: Remove Vite and prove no retained import depends on it**

Delete `index.html` and `src/`. Remove `src/**` from Tailwind content,
Vitest include patterns, ESLint ignores, and TypeScript excludes. Run:

```powershell
rg -n "from ['\"]@?/src|src/" app components config content i18n lib tests *.ts *.js
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected: `rg` returns no retained source import; all four commands PASS.

- [ ] **Step 8: Commit the complete route surface**

```powershell
git add -A
git commit -m "feat: complete bilingual M0 public route surface"
```

---

### Task 3: Add Structured Data, Sitemap, Robots, and Metadata Coverage

**Files:**
- Create: `tests/unit/seo-routes.test.ts`
- Create: `components/seo/structured-data.tsx`
- Create: `lib/structured-data.ts`
- Create: `app/sitemap.ts`
- Create: `app/robots.ts`
- Modify: `app/[locale]/(public)/page.tsx`
- Modify: `app/[locale]/(public)/membership/page.tsx`
- Modify: `app/[locale]/(public)/events/[slug]/page.tsx`

**Interfaces:**
- Produces: `StructuredData`, `buildOrganizationData`,
  `buildFaqData`, `buildEventData`, localized sitemap entries, crawler rules.

- [ ] **Step 1: Write failing SEO route tests**

```ts
import {describe, expect, it} from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import {publicRoutes} from '@/config/public-routes';

describe('M0 indexability', () => {
  it('lists both locales for every public route', () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of publicRoutes) {
      expect(urls).toContain(new URL(path, process.env.NEXT_PUBLIC_SITE_URL).toString());
      expect(urls).toContain(new URL(path === '/' ? '/zh' : `/zh${path}`,
        process.env.NEXT_PUBLIC_SITE_URL).toString());
    }
  });

  it('allows required AI crawlers', () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list.flatMap((rule) => rule.userAgent ?? [])).toEqual(
      expect.arrayContaining(['GPTBot', 'ClaudeBot', 'PerplexityBot'])
    );
  });
});
```

- [ ] **Step 2: Run and confirm missing metadata modules**

Run:
```powershell
$env:NEXT_PUBLIC_SITE_URL='https://hkwtia.vercel.app'
npm.cmd test -- tests/unit/seo-routes.test.ts
```

Expected: FAIL because `app/sitemap.ts` and `app/robots.ts` are missing.

- [ ] **Step 3: Implement safe structured data**

`StructuredData` accepts `WithContext<Organization | FAQPage | Event>` and
serializes with `JSON.stringify(data).replace(/</g, '\\u003c')`.
`buildOrganizationData()` uses `siteConfig`; `buildFaqData()` receives the
same translated FAQ array rendered by Membership; `buildEventData()` receives
an `EventRecord` and translated title. Pages render one JSON-LD script each.

- [ ] **Step 4: Implement localized sitemap and crawler rules**

`sitemap()` returns English and Chinese entries for every `publicRoutes`
value plus validated event/news slugs. Each entry includes both language
alternates. `robots()` allows `*`, GPTBot, ClaudeBot, and PerplexityBot and
points to `absoluteUrl('/sitemap.xml')`.

- [ ] **Step 5: Verify and commit SEO contracts**

Run:
```powershell
$env:NEXT_PUBLIC_SITE_URL='https://hkwtia.vercel.app'
npm.cmd test -- tests/unit/metadata.test.ts tests/unit/seo-routes.test.ts
npm.cmd run build
```

Expected: PASS; build emits `/sitemap.xml` and `/robots.txt`.

```powershell
git add app components/seo lib/structured-data.ts tests/unit/seo-routes.test.ts
git commit -m "feat: add M0 structured data and crawler routes"
```

---

### Task 4: Enforce Translation, Accessibility, and Repository Contracts

**Files:**
- Create: `tests/unit/messages.test.ts`
- Create: `scripts/audit-visible-strings.mjs`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `lighthouserc.js`
- Create: `.env.example`
- Create or replace: `AGENTS.md`
- Replace: `README.md`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: translation parity, visible-string audit, axe coverage, Lighthouse
  thresholds, secret-free environment inventory, contributor instructions.

- [ ] **Step 1: Write and run the failing message-parity test**

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
  it('keeps locale keys in parity and marks Chinese for review', () => {
    expect(keys(zh).sort()).toEqual(keys(en).sort());
    expect(zh._review).toBe(true);
  });
});
```

Run: `npm.cmd test -- tests/unit/messages.test.ts`
Expected before repair: FAIL with exact missing or extra message keys.

- [ ] **Step 2: Repair message parity and add the visible-string audit**

Make both bundles structurally identical except `zh-HK._review`.
`audit-visible-strings.mjs` scans `app/**/*.tsx` and `components/**/*.tsx`,
reports file and line for direct JSX text, and permits only email addresses,
telephone numbers, programme IDs, punctuation, and `aria-hidden` decoration.

Run: `npm.cmd run audit:strings`
Expected: PASS with zero unapproved visible literals.

- [ ] **Step 3: Add axe and keyboard browser coverage**

`accessibility.spec.ts` runs `AxeBuilder({page}).analyze()` on `/`,
`/membership`, `/zh`, `/zh/membership`, `/showcase`, and `/events`.
Assert no serious/critical violations, the skip link reaches `#main-content`,
and keyboard focus reaches navigation, locale switcher, and mobile-menu trigger.

- [ ] **Step 4: Add Lighthouse and repository documentation**

`lighthouserc.js` collects `/` and `/membership` from the production server
and asserts `categories:performance >= 0.90`,
`categories:accessibility >= 0.95`, and `categories:seo >= 0.95`.

`.env.example` contains the exact empty names from the build specification:
`NEXT_PUBLIC_SITE_URL`, database/auth, Stripe, email, AI, cron, R2, WOZTELL,
Turnstile, Sentry, and Plausible variables—never values. `README.md` documents
setup, scripts, testing, build, and Vercel deployment. `AGENTS.md` documents
Server Component default, i18n, strict TypeScript, test commands, commits, and
secret handling while retaining the codebase-memory instructions.

- [ ] **Step 5: Run and commit repository gates**

Run:
```powershell
npm.cmd run audit:strings
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:e2e -- tests/e2e/accessibility.spec.ts
npm.cmd audit --omit=dev --audit-level=high
```

Expected: all commands PASS; zero high/critical production vulnerabilities.

```powershell
git add .env.example AGENTS.md README.md lighthouserc.js playwright.config.ts scripts tests messages
git commit -m "test: enforce M0 accessibility i18n and repository gates"
```

---

### Task 5: Record Complete Local M0 Acceptance

**Files:**
- Create: `docs/milestones/M0-public-site-foundations.md`
- Modify only if a check exposes a defect: the smallest directly responsible source or test.

- [ ] **Step 1: Run non-browser verification**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run audit:strings
$env:NEXT_PUBLIC_SITE_URL='http://localhost:3000'
npm.cmd run build
```

Expected: every command PASS with no unexplained warning.

- [ ] **Step 2: Run all browser and Lighthouse checks**

```powershell
npm.cmd run test:e2e
npm.cmd run test:lighthouse
```

Expected: all Playwright suites PASS; both Lighthouse URLs meet all floors.

- [ ] **Step 3: Verify server-rendered headings**

Start `npm.cmd run start -- --hostname localhost` in a hidden process. Fetch
`/`, `/membership`, `/launchpad`, and `/about`; assert HTTP 200 and
exactly one `<h1` match per response. Stop the exact recorded process ID in
`finally`.

- [ ] **Step 4: Write and commit local evidence**

Record commit SHA, date/time in Asia/Hong_Kong, exact commands/results, unit and
Playwright totals, full route count, Lighthouse scores, locale demo steps,
warnings, and the statement `M1 has not started`.

```powershell
git add docs/milestones/M0-public-site-foundations.md
git commit -m "docs: record local M0 acceptance evidence"
```

---

### Task 6: Deploy and Verify Vercel Preview

**Files:**
- Modify: `docs/milestones/M0-public-site-foundations.md`

- [ ] **Step 1: Confirm clean Git and existing project linkage**

```powershell
git status --short --branch
vercel.cmd project inspect hkwtia
```

Expected: clean branch; existing `hkwtia` project under
`ynwaforevers-projects`. Record project/deployment identifiers, never env values.

- [ ] **Step 2: Deploy Preview and wait for READY**

Run: `vercel.cmd deploy --yes`
Expected: one Preview URL and deployment ID reach READY.

- [ ] **Step 3: Verify the remote preview**

Against the Preview URL, verify HTTP 200 for `/`, `/zh`, `/membership`,
`/zh/membership`, `/sitemap.xml`, and `/robots.txt`; exactly one `h1`
on page routes; `lang="zh-HK"` on Chinese routes; canonical/hreflang and
JSON-LD; no browser console errors; and deployment-specific logs contain no
runtime errors.

- [ ] **Step 4: Record preview evidence**

Append preview deployment ID, URL, timestamp, route results, metadata results,
browser result, Lighthouse scores, and the explicit promotion decision.
Commit:

```powershell
git add docs/milestones/M0-public-site-foundations.md
git commit -m "docs: record M0 preview verification"
```

---

### Task 7: Promote the Verified Artifact and Stop at M0

**Files:**
- Modify: `docs/milestones/M0-public-site-foundations.md`

- [ ] **Step 1: Promote only the verified Preview artifact**

Use the Vercel promotion command/API for the recorded Preview deployment. Do not
create a new source build. Record the previous production deployment as rollback.

- [ ] **Step 2: Repeat critical production checks**

Verify the same six URLs, both `lang` values, four required heading routes,
canonical/hreflang, sitemap, robots, Organization JSON-LD, FAQPage JSON-LD,
browser console, Lighthouse, and deployment-specific logs.

- [ ] **Step 3: Complete and commit the final report**

Append production deployment ID, verified domains, Asia/Hong_Kong timestamp,
test totals, final Lighthouse scores, rollback deployment, demo steps, warnings,
and human-owned translation/content review items.

```powershell
git add docs/milestones/M0-public-site-foundations.md
git commit -m "docs: complete M0 deployment report"
```

- [ ] **Step 4: Stop before M1**

Report what shipped, how to demo it, local/preview/production evidence, rollback
reference, and human-owned follow-ups. Do not add database, authentication,
billing, portal, CRM, automation, or AI-agent code.

---

## Plan Self-Review

- Route completion: Tasks 1-2 replace the temporary catch-all, cover every
  `publicRoutes` value, add detail behavior, recovery, and remove Vite.
- SEO: Task 3 covers canonical metadata consumers, bilingual sitemap, robots,
  Organization/FAQPage/Event JSON-LD, and safe serialization.
- Quality: Task 4 covers message parity, hardcoded strings, axe, keyboard
  behavior, Lighthouse configuration, environment names, and contributor docs.
- Acceptance and release: Tasks 5-7 record local, Preview, and production
  evidence and preserve a rollback reference.
- Type consistency: `ProgramDetail`, `EventDetail`, `NewsDetail`,
  `EmptyState`, and structured-data builders are introduced before use.
- Scope: Neon, auth, Stripe, portal, CRM, automations, and AI agents remain
  explicitly excluded.
- Placeholder scan found no unresolved marker or undefined interface.

## Primary References

- Approved design: `docs/superpowers/specs/2026-07-12-m0-completion-release-gate-design.md`
- Original M0 plan: `docs/superpowers/plans/2026-07-12-m0-public-site-foundations.md`
- Next.js metadata: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js sitemap: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js robots: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- next-intl routing: https://next-intl.dev/docs/routing/setup
