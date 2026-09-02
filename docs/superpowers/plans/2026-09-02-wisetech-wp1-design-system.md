# WiseTech WP-1 Design-System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the WiseTech donor's tokens, type stacks, spacing, ported stylesheet and layout primitives into hkwtia so that later work packages can build pages from them, while nothing on screen changes except colours and fonts drifting toward the design.

**Architecture:** Tokens live in `app/globals.css` as `--wt-*` variables next to the retuned shadcn and `--shell-*` triplets, so Tailwind utilities, shadcn components, portal and admin inherit the palette without a rewrite. The donor's `app/globals.css` (commit `f91ecc5`) is ported mechanically into `app/styles/wisetech.css` with its selectors verbatim and its variable references renamed to the `--wt-*` names; it is imported from the root layout after `globals.css`, which places it after the Tailwind layers. Fifteen Server-Component primitives in `components/wt/` render the donor's markup grammar over those classes, with every label arriving as a prop.

**Tech Stack:** Next.js 16 App Router (Webpack), React 19, Tailwind v3 with `tailwind.config.ts`, class-variance-authority, next-intl `Link`, vitest + Testing Library, Playwright 1.61.

**Programme context:** `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §4.1 (token mapping), §4.2 (layout primitives), §4.3 (motion), §5 WP-1, and Appendix D errata. Living status: `docs/integration/wisetech-design-fidelity-checklist.md` rows 1.1 to 1.9. Read `CLAUDE.md` and `AGENTS.md` first.

**Donor evidence, read-only:** commit `f91ecc5` is in this repository's object store. Read donor files with `git show f91ecc5:app/globals.css`, `git show f91ecc5:app/WiseTechSite.tsx`, `git show f91ecc5:app/ExpansionPages.tsx`, `git show f91ecc5:app/FullInnerPages.tsx`. Never import, copy as runtime code, or merge that tree.

**Environment rules:** work only in the worktree `.worktrees/wt-wp1-tokens` on branch `feat/wt-wp1-tokens`; `node_modules` there is a junction. Stage explicit paths only; never stage `AGENTS.md`, `next-env.d.ts` or `tests/unit/__snapshots__/email-render-snapshots.test.tsx.snap` (Next's dev server and line endings rewrite them). Use `npm run …` and `npx …` on Windows. `PLAYWRIGHT_BASE_URL` stays unset so Playwright manages the dev server.

---

## File structure

| Path | Responsibility |
|---|---|
| `app/globals.css` (modify) | Design tokens: `--wt-*` donor values, retuned shadcn and shell triplets, type stacks, donor heading rules |
| `app/styles/wisetech.css` (create) | Mechanical port of the donor stylesheet: selectors verbatim, `var(--wt-*)` references, keyframes behind reduced motion, provenance header |
| `app/[locale]/layout.tsx` (modify) | Drop `next/font`; import the port after `globals.css` |
| `app/[locale]/(public)/layout.tsx` (modify) | `div.site-root` wrapper carrying `zh-Hant-HK` for the Chinese locale |
| `tailwind.config.ts` (modify) | `colors.wt.*`, donor max-width `screens`, type families |
| `components/wt/*.tsx` (create, 15 files) | Presentation primitives over the ported classes; Server Components; `Readonly` props; no strings inside |
| `components/ui/button.tsx` (modify) | `wt`, `wtDark`, `wtLight`, `wtText` variants and a `wt` size |
| `tests/unit/wisetech-tokens.test.ts` (create) | Pins every token value, the type stacks, the Tailwind exposure, the layout changes |
| `tests/unit/wisetech-css-port.test.ts` (create) | Pins the port's import order, prefixed variables, kept and dropped selectors, guarded keyframes |
| `tests/unit/wt-primitives.test.tsx` (create) | Renders every primitive and checks landmarks, aria and class grammar |
| `tests/e2e/__screenshots__/wisetech-visual-baseline/*.png` (regenerate) | The post-WP-1 "before" for WP-2 |
| `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md`, `docs/integration/wisetech-design-fidelity-checklist.md` (modify) | Errata E-9 to E-11; rows 1.1 to 1.9 |

---

### Task 1: Tokens, type stacks and the font change

**Files:**
- Modify: `app/globals.css:5-51`
- Modify: `tailwind.config.ts:16-81`
- Modify: `app/[locale]/layout.tsx:2-16,50`
- Modify: `app/[locale]/(public)/layout.tsx:33-51`
- Test: `tests/unit/wisetech-tokens.test.ts`

- [ ] **Step 1: Write the failing token test**

```ts
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const tailwind = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf8");
const rootLayout = readFileSync(resolve(process.cwd(), "app/[locale]/layout.tsx"), "utf8");
const publicLayout = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/layout.tsx"), "utf8");

// Donor app/globals.css :root blocks at f91ecc5, values verbatim (spec §4.1 plus the
// readability and revision passes that later rules depend on; errata E-10).
const donorTokens = {
  "--wt-ink": "#0f4c81",
  "--wt-ink-soft": "#1a4f82",
  "--wt-paper": "#f6f6f6",
  "--wt-paper-bright": "#ffffff",
  "--wt-stone": "#e0dede",
  "--wt-steel": "#646464",
  "--wt-cyan": "#1a80b6",
  "--wt-jade": "#5188bf",
  "--wt-amber": "#f2d58f",
  "--wt-blue": "#729bb5",
  "--wt-violet": "#457495",
  "--wt-line": "rgba(51, 51, 51, 0.16)",
  "--wt-line-light": "rgba(255, 255, 255, 0.2)",
  "--wt-shadow": "0 32px 90px rgba(15, 76, 129, 0.14)",
  "--wt-focus": "#ff5c4d",
  "--wt-accent-text": "#315f82",
  "--wt-reading-width": "68ch",
  "--wt-heading-display": "clamp(54px, 6.5vw, 104px)",
  "--wt-heading-section": "clamp(44px, 5.2vw, 78px)",
  "--wt-heading-card": "clamp(29px, 3vw, 44px)",
};

// Exact HSL conversions of the donor hex values (spec §4.1).
const retunedTriplets = {
  "--background": "0 0% 96%",
  "--foreground": "208 79% 28%",
  "--card": "0 0% 100%",
  "--popover": "0 0% 100%",
  "--primary": "209 67% 31%",
  "--secondary": "201 75% 41%",
  "--muted-foreground": "0 0% 39%",
  "--accent": "42 79% 75%",
  "--border": "0 3% 87%",
  "--input": "0 3% 87%",
  "--ring": "209 67% 31%",
  "--shell-canvas": "0 0% 96%",
  "--shell-raised": "0 0% 100%",
  "--shell-ink": "208 79% 28%",
  "--shell-muted": "0 0% 39%",
  "--shell-navy": "208 79% 28%",
  "--shell-blue": "201 75% 41%",
  "--shell-accent": "42 79% 75%",
  "--shell-border": "0 3% 87%",
  "--shell-shadow-lg": "0 32px 90px rgba(15, 76, 129, 0.14)",
  "--shell-focus": "209 67% 31%",
  "--shell-content": "1440px",
};

function declaration(name: string) {
  const match = globals.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m"));
  return match?.[1].trim();
}

describe("WiseTech design tokens", () => {
  it.each(Object.entries(donorTokens))("defines %s with the donor value", (name, value) => {
    expect(declaration(name)).toBe(value);
  });

  it.each(Object.entries(retunedTriplets))("retunes %s to the donor palette", (name, value) => {
    expect(declaration(name)).toBe(value);
  });

  it("adopts the donor type stacks with the Chinese fallbacks appended", () => {
    expect(declaration("--font-serif")).toBe('"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif');
    expect(declaration("--font-sans")).toBe(
      '"Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif',
    );
    expect(globals).toContain("h1, h2 { font-family: var(--font-serif); font-weight: 500; letter-spacing: -0.045em; }");
    expect(globals).toContain("h3 { letter-spacing: -0.025em; }");
    expect(globals).not.toContain("h1, h2, h3 { font-family");
  });

  it("no longer loads Google fonts through next/font", () => {
    expect(rootLayout).not.toContain("next/font");
    expect(rootLayout).not.toContain("Playfair");
    expect(rootLayout).toContain("<html lang={locale}>");
  });

  it("exposes the tokens, breakpoints and families through Tailwind", () => {
    expect(tailwind).toContain('ink: "var(--wt-ink)"');
    expect(tailwind).toContain('inkSoft: "var(--wt-ink-soft)"');
    expect(tailwind).toContain('violet: "var(--wt-violet)"');
    expect(tailwind).toContain('"wt-xl": {max: "1320px"}');
    expect(tailwind).toContain('"wt-md": {max: "820px"}');
    expect(tailwind).toContain('serif: ["var(--font-serif)"]');
    expect(tailwind).toContain('sans: ["var(--font-sans)"]');
  });

  it("marks the public wrapper with the design's Traditional Chinese language tag", () => {
    expect(publicLayout).toContain('className="site-root"');
    expect(publicLayout).toContain('"zh-Hant-HK"');
  });
});
```

- [ ] **Step 2: Run it and read the failure**

Run: `npx vitest run tests/unit/wisetech-tokens.test.ts`
Expected: FAIL. Every `--wt-*` case reports `undefined`, the retune cases show the old triplets (for example `--shell-navy` is `218 48% 18%`), the Tailwind and layout cases fail on missing strings.

- [ ] **Step 3: Rewrite the `:root` block and base rules in `app/globals.css`**

Replace lines 5 to 51 (the `:root` block through the `h1, h2, h3` rule) with:

```css
:root {
  --background: 0 0% 96%;
  --foreground: 208 79% 28%;
  --card: 0 0% 100%;
  --card-foreground: 215 25% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 215 25% 15%;
  --primary: 209 67% 31%;
  --primary-foreground: 0 0% 100%;
  --secondary: 201 75% 41%;
  --secondary-foreground: 0 0% 100%;
  --muted: 210 20% 96%;
  --muted-foreground: 0 0% 39%;
  --accent: 42 79% 75%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 72% 55%;
  --destructive-foreground: 0 0% 100%;
  --border: 0 3% 87%;
  --input: 0 3% 87%;
  --ring: 209 67% 31%;
  --radius: 0.5rem;
  --glass: 210 20% 97%;
  --glass-border: 210 15% 88%;
  --glow-primary: 210 100% 38%;
  --glow-accent: 25 95% 55%;
  --coral: 350 80% 55%;
  --shell-canvas: 0 0% 96%;
  --shell-raised: 0 0% 100%;
  --shell-warm: 38 43% 95%;
  --shell-ink: 208 79% 28%;
  --shell-muted: 0 0% 39%;
  --shell-navy: 208 79% 28%;
  --shell-blue: 201 75% 41%;
  --shell-accent: 42 79% 75%;
  --shell-border: 0 3% 87%;
  --shell-shadow-sm: 0 8px 24px hsl(218 48% 18% / 0.08);
  --shell-shadow-lg: 0 32px 90px rgba(15, 76, 129, 0.14);
  --shell-radius-sm: 0.5rem;
  --shell-radius-lg: 1.25rem;
  --shell-focus: 209 67% 31%;
  --shell-content: 1440px;

  /* WiseTech design tokens: the donor's :root values verbatim (design-fidelity spec §4.1
     and errata E-10). The shadcn and --shell-* triplets above are exact HSL conversions of
     the same hexes so Tailwind utilities, portal and admin inherit the palette. */
  --wt-ink: #0f4c81;
  --wt-ink-soft: #1a4f82;
  --wt-paper: #f6f6f6;
  --wt-paper-bright: #ffffff;
  --wt-stone: #e0dede;
  --wt-steel: #646464;
  --wt-cyan: #1a80b6;
  --wt-jade: #5188bf;
  --wt-amber: #f2d58f;
  --wt-blue: #729bb5;
  --wt-violet: #457495;
  --wt-line: rgba(51, 51, 51, 0.16);
  --wt-line-light: rgba(255, 255, 255, 0.2);
  --wt-shadow: 0 32px 90px rgba(15, 76, 129, 0.14);
  --wt-focus: #ff5c4d;
  --wt-accent-text: #315f82;
  --wt-reading-width: 68ch;
  --wt-heading-display: clamp(54px, 6.5vw, 104px);
  --wt-heading-section: clamp(44px, 5.2vw, 78px);
  --wt-heading-card: clamp(29px, 3vw, 44px);

  /* D-2: the donor's stacks verbatim; Chinese fallbacks appended to the sans stack so
     zh-HK keeps PingFang / Noto / JhengHei. next/font no longer sets these. */
  --font-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-sans: "Avenir Next", Avenir, "Helvetica Neue", Helvetica, Arial, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif;
}

* { box-sizing: border-box; border-color: hsl(var(--border)); }
html { scroll-behavior: smooth; }
body { margin: 0; background: hsl(var(--background)); color: hsl(var(--foreground)); font-family: var(--font-sans); }
h1, h2 { font-family: var(--font-serif); font-weight: 500; letter-spacing: -0.045em; }
h3 { letter-spacing: -0.025em; }
```

Keep everything after the old line 51 (`a { transition … }`, `.skip-link`, `.glass-card`, the gradient and editorial helpers, both motion blocks) exactly as it is. `tests/unit/public-shell-tokens.test.ts` still finds every `--shell-*` name, the three Chinese font names (now inside `--font-sans`) and the reduced-motion block.

- [ ] **Step 4: Expose the tokens in `tailwind.config.ts`**

Inside `theme.extend`, add `screens` and `fontFamily` and extend `colors`:

```ts
    extend: {
      screens: {
        // Donor breakpoints are max-width (design-fidelity spec §4.2), so the utilities
        // read "at or below", matching the media queries in app/styles/wisetech.css.
        "wt-xl": {max: "1320px"},
        "wt-lg": {max: "1120px"},
        "wt-md": {max: "820px"},
        "wt-sm": {max: "520px"},
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
      },
      colors: {
        // …existing entries unchanged…
        wt: {
          ink: "var(--wt-ink)",
          inkSoft: "var(--wt-ink-soft)",
          paper: "var(--wt-paper)",
          paperBright: "var(--wt-paper-bright)",
          stone: "var(--wt-stone)",
          steel: "var(--wt-steel)",
          cyan: "var(--wt-cyan)",
          jade: "var(--wt-jade)",
          amber: "var(--wt-amber)",
          blue: "var(--wt-blue)",
          violet: "var(--wt-violet)",
        },
      },
```

Leave `maxWidth: {shell: "var(--shell-content)"}` as it is; the variable now resolves to 1440px.

- [ ] **Step 5: Remove `next/font` from `app/[locale]/layout.tsx`**

Delete line 2 (`import {Inter, Playfair_Display} from "next/font/google";`) and lines 12 to 16 (the `inter` and `playfair` constants). Change line 50 to:

```tsx
    <html lang={locale}>
```

- [ ] **Step 6: Wrap the public layout in `div.site-root`**

In `app/[locale]/(public)/layout.tsx`, replace the returned fragment with:

```tsx
  return (
    <div className="site-root" lang={appLocale === "zh-HK" ? "zh-Hant-HK" : "en"}>
      <a className="skip-link" href="#main-content">
        {t('skipToContent')}
      </a>
      <AnnouncementBar
        announcement={announcement}
        label={announcementMessages('label')}
        dismissLabel={announcementMessages('dismiss')}
      />
      <SiteHeader locale={appLocale} />
      <main id="main-content">{children}</main>
      <SiteFooter locale={appLocale} />
      <ConciergeWidget
        locale={appLocale}
        labels={conciergeLabels}
        {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
      />
    </div>
  );
```

`<html lang>` keeps the `hreflang`-correct `zh-HK`; the design's `zh-Hant-HK` lives on the wrapper so the ported `.site-root[lang^="zh"]` rules apply (spec WP-1, D-2).

- [ ] **Step 7: Run the token test and the neighbours**

Run: `npx vitest run tests/unit/wisetech-tokens.test.ts tests/unit/public-shell-tokens.test.ts tests/unit/public-layout-announcement.test.tsx tests/unit/public-shell.test.tsx tests/unit/announcement.test.tsx tests/unit/concierge-layouts.test.ts tests/unit/wisetech-shell-boundary.test.ts tests/unit/public-landmark-contract.test.ts`
Expected: all pass. If a public-layout test asserts on the fragment's direct children, update the assertion to look inside `.site-root` and say so in the commit body.

- [ ] **Step 8: Typecheck, lint, string audit**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint app tailwind.config.ts && npm run audit:strings`
Expected: exit 0 each.

- [ ] **Step 9: Commit**

```bash
git add app/globals.css tailwind.config.ts "app/[locale]/layout.tsx" "app/[locale]/(public)/layout.tsx" tests/unit/wisetech-tokens.test.ts
git commit -m "feat: adopt the WiseTech design tokens and type stacks (WP-1)" -m "<why: §4.1 mapping, D-2 fonts, wrapper lang; RED then GREEN totals>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Port the donor stylesheet

**Files:**
- Create: `app/styles/wisetech.css`
- Modify: `app/[locale]/layout.tsx:10` (add the import)
- Test: `tests/unit/wisetech-css-port.test.ts`

- [ ] **Step 1: Write the failing port test**

```ts
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const port = readFileSync(resolve(process.cwd(), "app/styles/wisetech.css"), "utf8");
const rootLayout = readFileSync(resolve(process.cwd(), "app/[locale]/layout.tsx"), "utf8");

const keptSelectors = [
  ".site-root", ".shell", ".section", ".eyebrow", ".status-label", ".button", ".button-dark", ".button-light",
  ".text-link", ".light-link", ".card-index", ".honest-empty", ".inner-honest", ".light-empty", ".pulse-ring",
  ".page-hero", ".inner-page-hero", ".page-hero-photo", ".page-hero-art", ".breadcrumb", ".inner-hero-actions",
  ".inner-closing", ".event-interest", ".intro-process", ".service-grid", ".principle-grid", ".badge-grid",
  ".page-updated", ".section-heading", ".split-heading", ".inner-section-heading", ".opportunity-section",
  ".inner-section-tint", ".announcement", ".site-header", ".header-inner", ".brand", ".desktop-nav", ".nav-button",
  ".mega-menu-v2", ".mega-menu-main", ".mega-menu-heading", ".mega-columns", ".mega-column-title", ".mega-feature-v2",
  ".mobile-menu", ".mobile-priority-actions", ".mobile-accordion", ".hero", ".network-field", ".legacy-network",
  ".archive-photo-grid", ".impact-metrics", ".gba-section", ".conversion-grid", ".plan-grid", ".membership-dimensions",
  ".first-90", ".partner-record-card", ".directory-prompts", ".solution-needs", ".event-quick-tabs", ".event-card-v2",
  ".site-footer", ".footer-top", ".footer-links", ".footer-bottom", ".concierge", ".concierge-panel",
];

const droppedSelectors = [
  ".portal-shell", ".portal-sub-hero", ".portal-module-grid", ".portal-preview-notice", ".join-page", ".join-card",
  ".join-roadmap", ".join-success-hero", ".onboarding-actions", ".review-list", ".site-search-form", ".search-feedback", ".sr-only",
];

function selectorPattern(selector: string) {
  return new RegExp(`(^|[\\s,}])${selector.replace(/\./g, "\\.")}(?![\\w-])`, "m");
}

describe("WiseTech CSS port", () => {
  it("is imported from the root layout after the Tailwind layers", () => {
    const globalsAt = rootLayout.indexOf('import "../globals.css";');
    const portAt = rootLayout.indexOf('import "../styles/wisetech.css";');
    expect(globalsAt).toBeGreaterThan(-1);
    expect(portAt).toBeGreaterThan(globalsAt);
  });

  it("carries no donor build directive, remote asset or donor route", () => {
    expect(port).not.toContain('@import "tailwindcss"');
    expect(port).not.toMatch(/url\(\s*["']?https?:/);
    for (const route of ["/activities", "/members", "/solutions"]) expect(port).not.toContain(route);
  });

  it("declares no tokens of its own and references only prefixed ones", () => {
    expect(port).not.toMatch(/^:root/m);
    const references = [...port.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(100);
    for (const name of new Set(references)) expect(name).toMatch(/^--(wt-|font-)/);
  });

  it.each(keptSelectors)("keeps the donor selector %s", (selector) => {
    expect(port).toMatch(selectorPattern(selector));
  });

  it.each(droppedSelectors)("drops the donor-only selector %s", (selector) => {
    expect(port).not.toMatch(selectorPattern(selector));
  });

  it("keeps every keyframe behind the reduced-motion preference", () => {
    const guardAt = port.indexOf("@media (prefers-reduced-motion: no-preference) {");
    expect(guardAt).toBeGreaterThan(-1);
    expect(port.indexOf("@keyframes")).toBeGreaterThan(guardAt);
    expect(port.match(/@keyframes/g)).toHaveLength(3);
    for (const name of ["hero-breathe", "node-pulse", "mega-menu-in"]) expect(port).toContain(`@keyframes ${name}`);
  });

  it("keeps the donor breakpoints and base rules", () => {
    for (const width of ["1320px", "1120px", "820px", "520px"]) expect(port).toContain(`@media(max-width:${width})`);
    expect(port).toContain("img { display: block; max-width: 100%; }");
    expect(port).toContain("button, input, select { font: inherit; }");
    expect(port).toContain(":focus-visible { outline: 3px solid var(--wt-focus); }");
    expect(port).not.toMatch(/^html \{ scroll-behavior/m);
    expect(port).not.toMatch(/^body \{ margin/m);
  });
});
```

- [ ] **Step 2: Run it and read the failure**

Run: `npx vitest run tests/unit/wisetech-css-port.test.ts`
Expected: FAIL at file load, `ENOENT … app/styles/wisetech.css`.

- [ ] **Step 3: Generate the port with the committed PostCSS script**

The transform lives at `scripts/port-wisetech-css.mjs` and runs as `npm run port:wisetech`: it is the recorded, reproducible source for `app/styles/wisetech.css`, reads the donor from `git show f91ecc5:app/globals.css` (or from `WISETECH_DONOR_DIR` for a checkout outside git), and writes CRLF, so re-running it leaves `git diff --exit-code app/styles/wisetech.css` clean.

The inline draft that used to sit here is gone because it had already diverged from the artifact in three ways: it dropped only four `.join-*` prefixes instead of the whole join-form family, removed every `:root` including the two media-scoped heading overrides that must survive, and renamed `var()` references without renaming the declaration names that feed them.

Run: `npm run port:wisetech`
Expected: prints a rule count and `keyframes: 3`. Then eyeball `app/styles/wisetech.css`: no `:root` remains, `grep -c "var(--wt-" app/styles/wisetech.css` is well over 100, and `grep -n "var(--" app/styles/wisetech.css | grep -v -E "var\(--(wt-|font-)"` prints nothing.

- [ ] **Step 4: Verify the drop and rename logic against the donor**

Run `grep -n -E "^(\.portal|\.join|\.sr-only|\.site-search|\.search-feedback|\.review-list|\.onboarding)" app/styles/wisetech.css` and expect no output. Run `grep -n "@keyframes" app/styles/wisetech.css` and expect three lines, all after the `prefers-reduced-motion: no-preference` line. Run `grep -c "^\." app/styles/wisetech.css` and compare with `git show f91ecc5:app/globals.css | grep -c "^\."`: the port has fewer top-level rules only by the dropped families (report both numbers).

- [ ] **Step 5: Import the port from the root layout**

In `app/[locale]/layout.tsx`, directly after `import "../globals.css";` add:

```tsx
// Ordered after globals.css so the donor rules land after the Tailwind layers. A CSS
// @import inside globals.css would not achieve that: css-loader emits imported files
// ahead of the importing file's own rules (design-fidelity errata E-9).
import "../styles/wisetech.css";
```

- [ ] **Step 6: Run the port test and the class-collision check**

Run: `npx vitest run tests/unit/wisetech-css-port.test.ts`
Expected: PASS.

Run the collision check (donor top-level class names against existing `className` attributes):

```bash
grep -oE "^\.[a-z][a-z0-9-]*" app/styles/wisetech.css | sort -u | sed 's/^\.//' > "$TEMP/wt-classes.txt"
grep -rhoE 'className=["'"'"'`][^"'"'"'`]*' app components | tr ' ' '\n' | sed -E 's/^className=["'"'"'`]//' | sort -u > "$TEMP/hk-classes.txt"
comm -12 "$TEMP/wt-classes.txt" "$TEMP/hk-classes.txt"
```

Expected: no output. If a name appears, report it as DONE_WITH_CONCERNS with the file that uses it; do not rename donor selectors.

- [ ] **Step 7: Build, lint, typecheck**

Run: `npm run build && npx eslint "app/[locale]/layout.tsx" && npx tsc --noEmit -p tsconfig.json`
Expected: build compiles (the port is plain CSS; watch for a PostCSS parse error and fix the script rather than the output), eslint and tsc exit 0.

- [ ] **Step 8: Commit**

```bash
git add app/styles/wisetech.css "app/[locale]/layout.tsx" tests/unit/wisetech-css-port.test.ts
git commit -m "feat: port the WiseTech donor stylesheet (WP-1)" -m "<why: §4.2 selective port, the transforms, the drop list, import placement and its reason; RED then GREEN totals; collision check result>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The `components/wt` primitives and button variants

**Files:**
- Create: `components/wt/arrow.tsx`, `components/wt/eyebrow.tsx`, `components/wt/status-label.tsx`, `components/wt/card-index.tsx`, `components/wt/shell.tsx`, `components/wt/section.tsx`, `components/wt/section-heading.tsx`, `components/wt/action-link.tsx`, `components/wt/honest-empty.tsx`, `components/wt/page-hero.tsx`, `components/wt/closing-band.tsx`, `components/wt/interest-band.tsx`, `components/wt/step-grid.tsx`, `components/wt/card-grid.tsx`, `components/wt/page-updated.tsx`
- Modify: `components/ui/button.tsx:11-23`
- Test: `tests/unit/wt-primitives.test.tsx`

All primitives are Server Components (no `'use client'`), take `Readonly<…>` props, contain no visible string literals (decorative glyphs sit inside `aria-hidden` elements, which `npm run audit:strings` allows), and use `Link` from `@/i18n/navigation` for every href. `action-link.tsx` is one file beyond the spec's list: it is the donor's `<a className="button …">label <Arrow /></a>` pattern shared by four primitives (errata E-11).

- [ ] **Step 1: Write the failing primitives test**

```tsx
import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {Button} from "@/components/ui/button";
import {ActionLink} from "@/components/wt/action-link";
import {Arrow} from "@/components/wt/arrow";
import {CardGrid} from "@/components/wt/card-grid";
import {CardIndex} from "@/components/wt/card-index";
import {ClosingBand} from "@/components/wt/closing-band";
import {Eyebrow} from "@/components/wt/eyebrow";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {InterestBand} from "@/components/wt/interest-band";
import {PageHero} from "@/components/wt/page-hero";
import {PageUpdated} from "@/components/wt/page-updated";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import {Shell} from "@/components/wt/shell";
import {StatusLabel} from "@/components/wt/status-label";
import {StepGrid} from "@/components/wt/step-grid";

vi.mock("next/image", () => ({
  default: ({fill: _fill, priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {fill?: boolean; priority?: boolean}) =>
    <img {...props} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />,
}));

describe("wt primitives", () => {
  it("Arrow is decorative", () => {
    const {container} = render(<Arrow />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).toBe("↗");
  });

  it("Eyebrow, StatusLabel and CardIndex carry the donor classes", () => {
    render(<><Eyebrow light>Open now</Eyebrow><StatusLabel as="p">Current availability</StatusLabel><CardIndex index={3} /></>);
    expect(screen.getByText("Open now")).toHaveClass("eyebrow", "light");
    expect(screen.getByText("Current availability").tagName).toBe("P");
    expect(screen.getByText("Current availability")).toHaveClass("status-label");
    expect(screen.getByText("03")).toHaveClass("card-index");
  });

  it("Shell and Section compose the donor layout classes and tones", () => {
    const {container} = render(
      <Section tone="ink" id="open-now" labelledBy="open-now-title" shellClassName="extra"><p>body</p></Section>,
    );
    const section = container.querySelector("section");
    expect(section).toHaveClass("section", "opportunity-section");
    expect(section).toHaveAttribute("id", "open-now");
    expect(section).toHaveAttribute("aria-labelledby", "open-now-title");
    expect(section?.firstElementChild).toHaveClass("shell", "extra");
    const bright = render(<Section tone="bright"><p>b</p></Section>);
    expect(bright.container.querySelector("section")).toHaveClass("section", "inner-section", "inner-section-tint");
    const shell = render(<Shell className="grid">x</Shell>);
    expect(shell.container.firstElementChild).toHaveClass("shell", "grid");
  });

  it("SectionHeading renders the stacked, split and inner grammars", () => {
    const stacked = render(<SectionHeading eyebrow="Demand" title="Connections" id="s1" />);
    expect(stacked.container.firstElementChild).toHaveClass("section-heading");
    expect(stacked.container.querySelector("h2#s1")).toHaveTextContent("Connections");
    const split = render(<SectionHeading layout="split" inverse eyebrow="Open now" title="What can you join?" lead="Only confirmed" />);
    const splitRoot = split.container.firstElementChild;
    expect(splitRoot).toHaveClass("section-heading", "split-heading", "inverse");
    expect(splitRoot?.firstElementChild?.tagName).toBe("DIV");
    expect(split.getByText("Open now")).toHaveClass("eyebrow", "light");
    expect(splitRoot?.lastElementChild).toHaveTextContent("Only confirmed");
    const inner = render(<SectionHeading layout="inner" eyebrow="Content hub" title="Knowledge" lead="Put to work" />);
    expect(inner.container.firstElementChild).toHaveClass("inner-section-heading");
    expect(inner.container.firstElementChild?.lastElementChild?.tagName).toBe("P");
  });

  it("ActionLink renders the donor link tones with a decorative arrow", () => {
    render(<><ActionLink href="/events">Find an event</ActionLink><ActionLink href="/membership" tone="text-link-light">Compare</ActionLink></>);
    expect(screen.getByRole("link", {name: "Find an event ↗"})).toHaveClass("button");
    expect(screen.getByRole("link", {name: "Compare ↗"})).toHaveClass("text-link", "light-link");
  });

  it("HonestEmpty is a polite status region with a decorative pulse ring and an action slot", () => {
    render(
      <HonestEmpty label="Current availability" title="No activities are currently open." copy="Only confirmed activities appear here." actions={<a href="/events">Updates</a>} />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("honest-empty");
    expect(status.querySelector(".pulse-ring")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Current availability")).toHaveClass("status-label");
    expect(screen.getByRole("heading", {level: 3})).toHaveTextContent("No activities are currently open.");
    expect(status.querySelector(".open-now-actions a")).toHaveAttribute("href", "/events");
  });

  it("HonestEmpty tones map to the donor classes", () => {
    const light = render(<HonestEmpty tone="light" label="l" title="t" copy="c" headingLevel={2} />);
    expect(light.container.firstElementChild).toHaveClass("honest-empty", "light-empty");
    expect(light.getByRole("heading", {level: 2})).toHaveTextContent("t");
    const inner = render(<HonestEmpty tone="inner" label="l" title="t" copy="c" />);
    expect(inner.container.firstElementChild).toHaveClass("inner-honest");
    expect(inner.container.firstElementChild).toHaveAttribute("role", "status");
  });

  it("PageHero renders the donor structure over an own-origin figure", () => {
    render(
      <PageHero
        variant="inner"
        eyebrow="Events"
        title="Find an activity"
        lead="Lead copy"
        artMark="W+"
        image={{src: "/images/projects-hero.jpg", alt: "Community", caption: "WTIA archive"}}
        actions={{primary: {href: "/events", label: "Find an event"}, secondary: {href: "/membership", label: "Compare"}}}
        breadcrumb={{homeHref: "/", homeLabel: "Home", current: "Events"}}
      />,
    );
    const section = document.querySelector("section");
    expect(section).toHaveClass("page-hero", "inner-page-hero");
    expect(screen.getByRole("heading", {level: 1})).toHaveTextContent("Find an activity");
    expect(screen.getByText("Events", {selector: "p"})).toHaveClass("eyebrow", "light");
    expect(screen.getByRole("img", {name: "Community"})).toHaveAttribute("src", "/images/projects-hero.jpg");
    expect(screen.getByText("WTIA archive").tagName).toBe("FIGCAPTION");
    expect(screen.getByRole("link", {name: "Find an event ↗"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("link", {name: "Compare ↗"})).toHaveClass("text-link", "light-link");
    expect(screen.getByRole("link", {name: "Home"})).toHaveAttribute("href", "/");
    expect(document.querySelector(".breadcrumb b")).toHaveTextContent("Events");
    expect(document.querySelector(".page-hero-art")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".page-hero-art span")).toHaveTextContent("W+");
  });

  it("PageHero omits the figure and art when not supplied and rejects images that are not own-origin", () => {
    const plain = render(<PageHero eyebrow="About" title="Who we are" lead="Lead" />);
    expect(plain.container.querySelector("figure")).toBeNull();
    expect(plain.container.querySelector(".page-hero-art")).toBeNull();
    expect(plain.container.querySelector("section")).not.toHaveClass("inner-page-hero");
    expect(() => render(<PageHero eyebrow="e" title="t" lead="l" image={{src: "https://example.com/hero.jpg", alt: ""}} />)).toThrow("OWN_ORIGIN_IMAGE_REQUIRED");
  });

  it("ClosingBand styles the first action as a light button and the rest as light text links", () => {
    render(<ClosingBand id="host" eyebrow="Take the next step" title="Host an activity" copy="Copy" actions={[{href: "/contact", label: "Talk to us"}, {href: "/events", label: "See events"}]} />);
    const section = document.querySelector("section#host");
    expect(section).toHaveClass("inner-closing");
    expect(section?.firstElementChild).toHaveClass("shell", "inner-closing-grid");
    expect(screen.getByRole("link", {name: "Talk to us ↗"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("link", {name: "See events ↗"})).toHaveClass("text-link", "light-link");
    expect(screen.getByText("Take the next step")).toHaveClass("eyebrow", "light");
  });

  it("InterestBand places the copy block and the action slot inside the grid shell", () => {
    render(<InterestBand id="interest" eyebrow="WiseTech Insights" title="Get updates" copy="Join the list" action={<a className="button button-light" href="mailto:contact@hkwtia.org">Join</a>} />);
    const section = document.querySelector("section#interest");
    expect(section).toHaveClass("event-interest");
    expect(section?.firstElementChild).toHaveClass("shell", "event-interest-grid");
    expect(screen.getByRole("heading", {level: 2})).toHaveTextContent("Get updates");
    expect(screen.getByRole("link", {name: "Join"})).toHaveAttribute("href", "mailto:contact@hkwtia.org");
  });

  it("StepGrid numbers the steps from 01", () => {
    render(<StepGrid steps={[{title: "Prepare", copy: "a"}, {title: "Send", copy: "b"}]} />);
    const grid = document.querySelector(".intro-process");
    expect(grid?.querySelectorAll("article")).toHaveLength(2);
    expect(grid?.querySelector("article span")).toHaveTextContent("01");
    expect(screen.getByRole("heading", {level: 3, name: "Send"})).toBeInTheDocument();
  });

  it("CardGrid renders linked items as service links and static items as articles", () => {
    render(<CardGrid variant="service" items={[{title: "Market entry", copy: "a", href: "/launchpad"}, {title: "Soft landing", copy: "b", marker: "★"}]} />);
    const grid = document.querySelector(".service-grid");
    expect(grid?.querySelector("a.service-link")).toHaveAttribute("href", "/launchpad");
    expect(grid?.querySelector("article span")).toHaveTextContent("★");
    const badge = render(<CardGrid variant="badge" items={[{title: "Verified", copy: "c"}]} />);
    expect(badge.container.querySelector(".badge-grid article span")).toHaveTextContent("01");
  });

  it("PageUpdated exposes a machine-readable time and an optional note", () => {
    render(<PageUpdated label="Page updated" dateTime="2026-09-02" formattedDate="2 September 2026" note="Reviewed by staff" />);
    const section = document.querySelector("section.page-updated");
    expect(section?.firstElementChild).toHaveClass("shell");
    expect(screen.getByText("Page updated").tagName).toBe("SPAN");
    expect(document.querySelector("time")).toHaveAttribute("dateTime", "2026-09-02");
    expect(document.querySelector("time")).toHaveTextContent("2 September 2026");
    expect(screen.getByText(/Reviewed by staff/)).toBeInTheDocument();
  });

  it("Button exposes the donor variants", () => {
    render(<><Button variant="wtDark" size="wt">Dark</Button><Button variant="wtText" size="wt">Text</Button><Button variant="wtLight" size="wt">Light</Button></>);
    expect(screen.getByRole("button", {name: "Dark"})).toHaveClass("button", "button-dark");
    expect(screen.getByRole("button", {name: "Light"})).toHaveClass("button", "button-light");
    expect(screen.getByRole("button", {name: "Text"})).toHaveClass("text-link");
    expect(screen.getByRole("button", {name: "Text"})).not.toHaveClass("h-10");
  });
});
```

- [ ] **Step 2: Run it and read the failure**

Run: `npx vitest run tests/unit/wt-primitives.test.tsx`
Expected: FAIL at import resolution: `Cannot find module '@/components/wt/action-link'` (or the first missing module).

- [ ] **Step 3: Create the primitives**

`components/wt/arrow.tsx`

```tsx
export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
```

`components/wt/eyebrow.tsx`

```tsx
import type {ReactNode} from 'react';

import {cn} from '@/lib/utils';

type EyebrowProps = Readonly<{children: ReactNode; light?: boolean; className?: string}>;

export function Eyebrow({children, light = false, className}: EyebrowProps) {
  return <p className={cn('eyebrow', light && 'light', className)}>{children}</p>;
}
```

`components/wt/status-label.tsx`

```tsx
import type {ReactNode} from 'react';

import {cn} from '@/lib/utils';

type StatusLabelProps = Readonly<{children: ReactNode; as?: 'span' | 'p'; className?: string}>;

export function StatusLabel({children, as: Tag = 'span', className}: StatusLabelProps) {
  return <Tag className={cn('status-label', className)}>{children}</Tag>;
}
```

`components/wt/card-index.tsx`

```tsx
import {cn} from '@/lib/utils';

type CardIndexProps = Readonly<{index: number; className?: string}>;

export function CardIndex({index, className}: CardIndexProps) {
  return <span className={cn('card-index', className)}>{String(index).padStart(2, '0')}</span>;
}
```

`components/wt/shell.tsx`

```tsx
import type {ReactNode} from 'react';

import {cn} from '@/lib/utils';

type ShellProps = Readonly<{children: ReactNode; className?: string}>;

export function Shell({children, className}: ShellProps) {
  return <div className={cn('shell', className)}>{children}</div>;
}
```

`components/wt/section.tsx`

```tsx
import type {ReactNode} from 'react';

import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

export type SectionTone = 'paper' | 'bright' | 'ink';

// Donor grammar: `.section` on paper, `.inner-section-tint` for the pale blue band,
// `.opportunity-section` for the ink band whose headings invert (design-fidelity spec §4.2).
const toneClasses: Record<SectionTone, string> = {
  paper: 'section',
  bright: 'section inner-section inner-section-tint',
  ink: 'section opportunity-section',
};

type SectionProps = Readonly<{
  children: ReactNode;
  tone?: SectionTone;
  id?: string;
  labelledBy?: string;
  className?: string;
  shellClassName?: string;
}>;

export function Section({children, tone = 'paper', id, labelledBy, className, shellClassName}: SectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(toneClasses[tone], className)}>
      <Shell className={shellClassName}>{children}</Shell>
    </section>
  );
}
```

`components/wt/section-heading.tsx`

```tsx
import {Eyebrow} from '@/components/wt/eyebrow';
import {cn} from '@/lib/utils';

type SectionHeadingProps = Readonly<{
  eyebrow: string;
  title: string;
  lead?: string;
  id?: string;
  layout?: 'stacked' | 'split' | 'inner';
  inverse?: boolean;
  className?: string;
}>;

export function SectionHeading({eyebrow, title, lead, id, layout = 'stacked', inverse = false, className}: SectionHeadingProps) {
  if (layout === 'inner') {
    return (
      <div className={cn('inner-section-heading', className)}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id}>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
    );
  }

  const heading = (
    <>
      <Eyebrow light={inverse}>{eyebrow}</Eyebrow>
      <h2 id={id}>{title}</h2>
    </>
  );

  if (layout === 'split') {
    return (
      <div className={cn('section-heading split-heading', inverse && 'inverse', className)}>
        <div>{heading}</div>
        {lead ? <p>{lead}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn('section-heading', inverse && 'inverse', className)}>
      {heading}
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}
```

`components/wt/action-link.tsx`

```tsx
import type {ReactNode} from 'react';

import {Arrow} from '@/components/wt/arrow';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type ActionLinkTone = 'button' | 'button-dark' | 'button-light' | 'text-link' | 'text-link-light';

const toneClasses: Record<ActionLinkTone, string> = {
  button: 'button',
  'button-dark': 'button button-dark',
  'button-light': 'button button-light',
  'text-link': 'text-link',
  'text-link-light': 'text-link light-link',
};

export type WtAction = Readonly<{href: string; label: string}>;

type ActionLinkProps = Readonly<{href: string; tone?: ActionLinkTone; className?: string; children: ReactNode}>;

export function ActionLink({href, tone = 'button', className, children}: ActionLinkProps) {
  return (
    <Link className={cn(toneClasses[tone], className)} href={href}>
      {children} <Arrow />
    </Link>
  );
}
```

`components/wt/honest-empty.tsx`

```tsx
import type {ReactNode} from 'react';

import {StatusLabel} from '@/components/wt/status-label';
import {cn} from '@/lib/utils';

export type HonestEmptyTone = 'ink' | 'light' | 'inner';

const toneClasses: Record<HonestEmptyTone, string> = {
  ink: 'honest-empty',
  light: 'honest-empty light-empty',
  inner: 'inner-honest',
};

type HonestEmptyProps = Readonly<{
  label: string;
  title: string;
  copy: string;
  tone?: HonestEmptyTone;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  id?: string;
  className?: string;
}>;

// Honest states are a feature (design-fidelity spec §0.3): the region announces itself
// politely and never fabricates records to look full.
export function HonestEmpty({label, title, copy, tone = 'ink', actions, headingLevel = 3, id, className}: HonestEmptyProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div id={id} className={cn(toneClasses[tone], className)} role="status" aria-live="polite">
      <span className="pulse-ring" aria-hidden="true" />
      <div>
        <StatusLabel as="p">{label}</StatusLabel>
        <Heading>{title}</Heading>
        <p>{copy}</p>
      </div>
      {actions ? <div className="open-now-actions">{actions}</div> : null}
    </div>
  );
}
```

`components/wt/page-hero.tsx`

```tsx
import Image from 'next/image';

import {assertOwnOriginEditorialImage} from '@/components/marketing/institutional-page-intro';
import {ActionLink, type WtAction} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

type PageHeroProps = Readonly<{
  eyebrow: string;
  title: string;
  lead: string;
  variant?: 'page' | 'inner';
  image?: Readonly<{src: string; alt: string; caption?: string}>;
  artMark?: string;
  actions?: Readonly<{primary: WtAction; secondary?: WtAction}>;
  breadcrumb?: Readonly<{homeHref: string; homeLabel: string; current: string}>;
  id?: string;
  className?: string;
}>;

export function PageHero({eyebrow, title, lead, variant = 'page', image, artMark, actions, breadcrumb, id, className}: PageHeroProps) {
  // CSP is img-src 'self': the figure is own-origin or the render fails, never a remote fetch.
  const imageSrc = image ? assertOwnOriginEditorialImage(image.src) : undefined;

  return (
    <section id={id} className={cn('page-hero', variant === 'inner' && 'inner-page-hero', className)}>
      {image && imageSrc ? (
        <figure className="page-hero-photo">
          <Image src={imageSrc} alt={image.alt} fill sizes="(max-width: 820px) 100vw, 58vw" priority />
          {image.caption ? <figcaption>{image.caption}</figcaption> : null}
        </figure>
      ) : null}
      {artMark ? (
        <div className="page-hero-art" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>{artMark}</span>
        </div>
      ) : null}
      <Shell>
        <Eyebrow light>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        <p>{lead}</p>
        {actions ? (
          <div className="inner-hero-actions">
            <ActionLink href={actions.primary.href} tone="button-light">{actions.primary.label}</ActionLink>
            {actions.secondary ? <ActionLink href={actions.secondary.href} tone="text-link-light">{actions.secondary.label}</ActionLink> : null}
          </div>
        ) : null}
        {breadcrumb ? (
          <div className="breadcrumb">
            <Link href={breadcrumb.homeHref}>{breadcrumb.homeLabel}</Link>
            <span aria-hidden="true">/</span>
            <b>{breadcrumb.current}</b>
          </div>
        ) : null}
      </Shell>
    </section>
  );
}
```

`components/wt/closing-band.tsx`

```tsx
import {ActionLink, type WtAction} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

type ClosingBandProps = Readonly<{eyebrow: string; title: string; copy: string; actions: readonly WtAction[]; id?: string; className?: string}>;

export function ClosingBand({eyebrow, title, copy, actions, id, className}: ClosingBandProps) {
  return (
    <section id={id} className={cn('inner-closing', className)}>
      <Shell className="inner-closing-grid">
        <div>
          <Eyebrow light>{eyebrow}</Eyebrow>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        <div className="inner-closing-actions">
          {actions.map((action, index) => (
            <ActionLink key={action.href} href={action.href} tone={index === 0 ? 'button-light' : 'text-link-light'}>
              {action.label}
            </ActionLink>
          ))}
        </div>
      </Shell>
    </section>
  );
}
```

`components/wt/interest-band.tsx`

```tsx
import type {ReactNode} from 'react';

import {Eyebrow} from '@/components/wt/eyebrow';
import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

type InterestBandProps = Readonly<{eyebrow: string; title: string; copy: string; action: ReactNode; id?: string; className?: string}>;

// D-6: the action slot takes a prepared mailto link or a Concierge launcher; nothing here persists.
export function InterestBand({eyebrow, title, copy, action, id, className}: InterestBandProps) {
  return (
    <section id={id} className={cn('event-interest', className)}>
      <Shell className="event-interest-grid">
        <div>
          <Eyebrow light>{eyebrow}</Eyebrow>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        {action}
      </Shell>
    </section>
  );
}
```

`components/wt/step-grid.tsx`

```tsx
import {cn} from '@/lib/utils';

type Step = Readonly<{title: string; copy: string}>;
type StepGridProps = Readonly<{steps: readonly Step[]; className?: string}>;

export function StepGrid({steps, className}: StepGridProps) {
  return (
    <div className={cn('intro-process', className)}>
      {steps.map((step, index) => (
        <article key={step.title}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <h3>{step.title}</h3>
          <p>{step.copy}</p>
        </article>
      ))}
    </div>
  );
}
```

`components/wt/card-grid.tsx`

```tsx
import {Link} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

export type CardGridVariant = 'service' | 'principle' | 'badge';
type Card = Readonly<{title: string; copy: string; href?: string; marker?: string}>;
type CardGridProps = Readonly<{variant: CardGridVariant; items: readonly Card[]; className?: string}>;

export function CardGrid({variant, items, className}: CardGridProps) {
  return (
    <div className={cn(`${variant}-grid`, className)}>
      {items.map((item, index) => {
        const body = (
          <>
            <span>{item.marker ?? String(index + 1).padStart(2, '0')}</span>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </>
        );
        return item.href ? (
          <Link key={item.title} className="service-link" href={item.href}>{body}</Link>
        ) : (
          <article key={item.title}>{body}</article>
        );
      })}
    </div>
  );
}
```

`components/wt/page-updated.tsx`

```tsx
import {Shell} from '@/components/wt/shell';
import {cn} from '@/lib/utils';

type PageUpdatedProps = Readonly<{label: string; dateTime: string; formattedDate: string; note?: string; className?: string}>;

// The date is a typed record or page-copy value chosen by the page, never Date.now()
// (design-fidelity spec §4.2), so a build is reproducible.
export function PageUpdated({label, dateTime, formattedDate, note, className}: PageUpdatedProps) {
  return (
    <section className={cn('page-updated', className)}>
      <Shell>
        <span>{label}</span>
        <p>
          <time dateTime={dateTime}>{formattedDate}</time>
          {note ? <> {note}</> : null}
        </p>
      </Shell>
    </section>
  );
}
```

- [ ] **Step 4: Add the button variants**

In `components/ui/button.tsx`, change the `variants` block to:

```ts
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
        // WiseTech grammar from app/styles/wisetech.css; pair with size="wt" so no
        // utility sizing competes with the donor rules.
        wt: 'button',
        wtDark: 'button button-dark',
        wtLight: 'button button-light',
        wtText: 'text-link'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        wt: ''
      }
    },
```

- [ ] **Step 5: Run the primitives test**

Run: `npx vitest run tests/unit/wt-primitives.test.tsx`
Expected: PASS, 14 tests.

- [ ] **Step 6: String audit, lint, typecheck**

Run: `npm run audit:strings && npx eslint components/wt components/ui/button.tsx && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0 each. The audit must not flag `↗`, `/` or the art mark: they sit inside `aria-hidden` elements.

- [ ] **Step 7: Commit**

```bash
git add components/wt components/ui/button.tsx tests/unit/wt-primitives.test.tsx
git commit -m "feat: add the WiseTech layout primitives and button variants (WP-1)" -m "<why: §4.2 primitives over the ported classes, no strings inside, action-link as the shared link pattern; RED then GREEN totals>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Regenerate the visual baselines and run the full gate

**Files:**
- Regenerate: `tests/e2e/__screenshots__/wisetech-visual-baseline/*.png`

- [ ] **Step 1: Confirm the drift is the expected kind**

Run: `npm run test:e2e -- tests/e2e/wisetech-visual-baseline.spec.ts`
Expected: FAIL on most or all of the 72 comparisons with pixel diffs (fonts and colours changed). Open two diff images under `test-results/` (one desktop, one mobile) and confirm the differences are typography and palette, not broken layout: no overlapping text, no missing sections, no horizontal scrollbar. If a layout is broken, stop and report BLOCKED with the diff image path.

- [ ] **Step 2: Capture the new baselines**

Run: `npx playwright test tests/e2e/wisetech-visual-baseline.spec.ts --update-snapshots`
Expected: 72 passed; 72 PNGs rewritten.

- [ ] **Step 3: Prove determinism**

Run: `npm run test:e2e -- tests/e2e/wisetech-visual-baseline.spec.ts`
Expected: 72 passed, no diffs, `git status --short tests/e2e/__screenshots__` shows only the 72 modified files.

- [ ] **Step 4: Run the accessibility, shell and route suites**

Run: `npm run test:e2e -- tests/e2e/public-shell.spec.ts tests/e2e/accessibility.spec.ts tests/e2e/public-route-matrix.spec.ts`
Expected: all pass. A colour-contrast finding from axe means a retuned pair failed; report it with the selector and both colours rather than changing a token.

- [ ] **Step 5: Full local gate**

Run, in order: `npm run audit:strings`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev --audit-level=high`
Expected: exit 0 each; record the vitest totals.

- [ ] **Step 6: Commit the baselines**

```bash
git add tests/e2e/__screenshots__
git commit -m "test: refresh the visual baselines after the WP-1 design-system foundation" -m "<capture and plain-run summary lines; what changed visually>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Errata, checklist and pull request

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` (Appendix D)
- Modify: `docs/integration/wisetech-design-fidelity-checklist.md` rows 1.1 to 1.9

- [ ] **Step 1: Append errata rows E-9 to E-11 to Appendix D**

```md
| E-9 | WP-1 | `@import "./styles/wisetech.css"` in `app/globals.css` after the Tailwind directives | css-loader emits an imported stylesheet ahead of the importing file's own rules, so that placement would put the donor rules before the Tailwind layers. The port is imported from `app/[locale]/layout.tsx` directly after `../globals.css`, which orders it after the layers. | Keep the import in the root layout; do not add an `@import` to `globals.css`. |
| E-10 | §4.1 | Token table ends at `--sans` | The donor's later `:root` passes add `--accent-text`, `--reading-width`, `--heading-display`, `--heading-section` and `--heading-card`, which later rules use. They are ported as `--wt-*` with the same values. Tailwind `screens` use `{max: …}` because the donor breakpoints are max-width. §4.3 names a `pulse-ring` keyframe; the donor has none (the ring is static); its keyframes are `hero-breathe`, `node-pulse` and `mega-menu-in`. | Use the `--wt-*` names; write `wt-md:` utilities as "at or below 820px". |
| E-11 | §4.2, WP-1 | Fourteen files under `components/wt/` | Fifteen: `action-link.tsx` renders the donor's `<a className="button …">label <Arrow /></a>` pattern shared by the hero, closing band, interest band and card grid. The `Button` variants `wt*` pair with `size="wt"`. Dropped from the port as donor-only: portal preview, join form, site search and `.sr-only` (Tailwind provides it). | Use `ActionLink` for donor-styled links; use `Button variant="wt…" size="wt"` only for real buttons. |
```

- [ ] **Step 2: Flip checklist rows 1.1 to 1.9**

Set each row's status to `ported` in the same commit as the code that earns it, then to `verified` with the PR link once the PR exists (the WP-0 pattern).

- [ ] **Step 3: Commit, push, open the PR**

```bash
git add docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md docs/integration/wisetech-design-fidelity-checklist.md
git commit -m "docs: record the WP-1 errata and checklist status" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin feat/wt-wp1-tokens
gh pr create --base main --title "WP-1: WiseTech design-system foundation" --body-file <pr-body>
```

The PR body follows `docs/integration/wisetech-delivery-gates.md`: every command with exit code and totals, the RED and GREEN lines per task, the review trail, and the decisions for the owner.
