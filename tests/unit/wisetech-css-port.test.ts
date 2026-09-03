import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import postcss from "postcss";
import {describe, expect, it} from "vitest";

const port = readFileSync(resolve(process.cwd(), "app/styles/wisetech.css"), "utf8");
const rootLayout = readFileSync(resolve(process.cwd(), "app/[locale]/layout.tsx"), "utf8");
const publicLayout = readFileSync(resolve(process.cwd(), "app/[locale]/(public)/layout.tsx"), "utf8");
const shellOverrides = existsSync(resolve(process.cwd(), "app/styles/wisetech-shell.css"))
  ? readFileSync(resolve(process.cwd(), "app/styles/wisetech-shell.css"), "utf8")
  : null;

// Selector matching runs against the rules alone. The provenance header names several of the
// families this file drops, and matching prose would let a comment satisfy — or violate — a
// contract that is about CSS.
const rules = port.replace(/\/\*[\s\S]*?\*\//g, "");

// The plan's draft list also carried ".first-90". The donor never styles it: `git grep first-90
// f91ecc5` finds it only as a marker class on <section className="section shell first-90"> in
// app/WiseTechSite.tsx, and app/globals.css is the donor's only stylesheet at that commit. A
// mechanical port cannot produce a rule the donor does not have, so it is not part of this
// contract; the section takes its appearance from .section, .shell, .inner-section-heading,
// .intro-process and .directory-actions instead.
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
  ".partner-record-card", ".directory-prompts", ".directory-actions", ".solution-needs", ".event-quick-tabs",
  ".event-card-v2", ".site-footer", ".footer-top", ".footer-links", ".footer-bottom", ".concierge", ".concierge-panel",
];

// The whole join family is donor-only: the donor's six-step join form is not ported and the
// real /join flow is authoritative, so .join-options, .join-progress, .join-actions and
// .join-success go with the four scaffold classes the plan first enumerated.
const droppedSelectors = [
  ".portal-shell", ".portal-sub-hero", ".portal-module-grid", ".portal-preview-notice", ".join-page", ".join-card",
  ".join-roadmap", ".join-success-hero", ".join-options", ".join-progress", ".join-actions", ".join-success",
  ".onboarding-actions", ".review-list", ".site-search-form", ".search-feedback", ".sr-only",
];

// A kept selector has to head a top-level rule — a base rule, not merely a responsive override
// inside a media query. Anchoring on the line start would be close but wrong: the donor packs
// several top-level rules onto one physical line, which hides .principle-grid, .footer-top,
// .footer-links and .footer-bottom mid-line. Parsing answers the actual question.
const topLevelSelectors = postcss
  .parse(port)
  .nodes.flatMap((node) => (node.type === "rule" ? node.selector.split(",").map((part) => part.trim()) : []));

function headsTopLevelRule(selector: string) {
  const pattern = new RegExp(`^${selector.replace(/\./g, "\\.")}(?![\\w-])`);
  return topLevelSelectors.some((part) => pattern.test(part));
}

function anywherePattern(selector: string) {
  return new RegExp(`(^|[\\s,}])${selector.replace(/\./g, "\\.")}(?![\\w-])`, "m");
}

describe("WiseTech CSS port", () => {
  it("is imported by the public route group, after the Tailwind layers", () => {
    expect(rootLayout).toContain('import "../globals.css";');
    expect(rootLayout).not.toContain("styles/wisetech.css");
    expect(publicLayout).toContain('import "../../styles/wisetech.css";');

    // The hand-written companion must load after the generated port so its equal-specificity
    // rules win, and it must not pull anything in of its own (errata E-24).
    expect(shellOverrides).not.toBeNull();
    expect(publicLayout.indexOf('import "../../styles/wisetech-shell.css";'))
      .toBeGreaterThan(publicLayout.indexOf('import "../../styles/wisetech.css";'));
    expect(shellOverrides).not.toContain("@import");

    // Pins the two selectors the dismissal island (components/layout/announcement-dismiss.tsx)
    // depends on, so a rename on either side is caught here instead of silently breaking the
    // bar's hiding or the header's dismissed-state offset.
    expect(shellOverrides).toContain('[data-announcement-dismissed="true"] .site-header');
    expect(shellOverrides).toContain('[data-dismissed="true"]');

    // The declaration that actually keeps a long unbroken token inside the bar. jsdom applies
    // no stylesheet, so tests/unit/announcement.test.tsx structurally cannot observe it and
    // pins only the class hook; the wrapping behaviour is a CSS contract and belongs here.
    // `overflow-wrap: anywhere` rather than `break-word` because only `anywhere` also shrinks
    // the flex item's min-content width, which is what stops the bar from overflowing.
    expect(shellOverrides).toContain(".announcement-text { min-width: 0; overflow-wrap: anywhere; }");

    // Above 820px the bar truncates to one line instead of wrapping, because the port's
    // `.site-header { top: 42px }` assumes a one-line bar. Pinning the pair together keeps the
    // two halves of that decision from drifting apart.
    expect(shellOverrides).toMatch(
      /@media \(min-width: 821px\) \{\s*\.announcement-text \{[^}]*white-space: nowrap;[^}]*\}/,
    );
  });

  /**
   * The three accessibility corrections the whole-branch review left. Each is a CSS contract —
   * a stacking order, a scope, a colour — with no runtime this suite can observe, so they are
   * pinned as source. Where a number matters, it is read out of the port rather than retyped,
   * so a regenerated port that renumbered it fails here instead of quietly re-breaking the fix.
   */
  it("carries the companion sheet's three WP-2 accessibility corrections", () => {
    // Comments name several of these selectors in prose; the contracts are about CSS.
    const shellRules = (shellOverrides ?? "").replace(/\/\*[\s\S]*?\*\//g, "");

    // 2a. The skip link is the first control a keyboard reader reaches on every public page,
    // and the announcement bar is its later sibling in the same stacking context, so a tie
    // buried it. The rule has to clear the bar and the header, both read from the port.
    const barZ = Number(port.match(/\.announcement \{[^}]*z-index: (\d+)/)![1]);
    const headerZ = Number(port.match(/\.site-header \{[^}]*z-index: (\d+)/)![1]);
    expect([barZ, headerZ]).toEqual([100, 90]);
    const skipLink = shellRules.match(/\.site-root > \.skip-link \{ z-index: (\d+); \}/);
    expect(skipLink, "no .site-root > .skip-link stacking rule").not.toBeNull();
    expect(Number(skipLink![1])).toBeGreaterThan(Math.max(barZ, headerZ));
    // The child combinator is the point, not decoration: it lifts the rule to (0,2,0) over
    // app/globals.css's (0,1,0), so the override does not depend on the order two different
    // layouts' stylesheets happen to be emitted in.
    expect(shellRules).not.toMatch(/^\.skip-link \{/m);

    // 2b. The shared LocaleSwitcher carries light-theme utilities; the overlay header on `/` is
    // the third dark host, after .footer-bottom and .mobile-utilities.
    const overlayScope = '.site-header[data-variant="overlay"]:not(.scrolled) .language-link';
    expect(shellRules).toContain(`${overlayScope}:hover`);
    expect(shellRules).toContain(`${overlayScope}:focus-visible`);
    // Desktop only. The port hides `.header-actions .language-link` below 821px, so a rule
    // outside that band would style a control that is not on screen.
    // The donor packs that whole band onto one physical line, so the line is the block.
    const mobileBand = port.match(/^@media\(max-width:820px\)\{.*$/m)![0];
    expect(mobileBand).toContain(".header-actions .language-link{display:none}");
    const desktopBands = [...shellRules.matchAll(/@media \(min-width: 821px\) \{([\s\S]*?)\n\}/g)]
      .map((match) => match[1]!);
    expect(desktopBands.some((band) => band.includes(overlayScope))).toBe(true);
    // Every rule that reaches this control has to stay scoped to the overlay header at rest:
    // once it scrolls it takes white chrome, where the light-theme utilities are correct again.
    for (const line of shellRules.match(/^.*\.language-link:(hover|focus-visible).*$/gm) ?? []) {
      expect(line).toContain(overlayScope);
    }
    // Tailwind draws its focus ring as a box-shadow, so restoring the outline is not enough.
    const overlayFocus = shellRules.match(
      /\.site-header\[data-variant="overlay"\]:not\(\.scrolled\) \.language-link:focus-visible \{([^}]*)\}/,
    );
    expect(overlayFocus, "no overlay focus-visible rule").not.toBeNull();
    expect(overlayFocus![1]).toContain("outline: 3px solid var(--wt-focus)");
    expect(overlayFocus![1]).toContain("box-shadow: none");

    // 2c. The current-section underline is the header's only "you are here" cue. The port's
    // pale #8fc4e0 measures 1.885:1 on the solid header's white; --wt-ink is 8.86:1.
    expect(port).toContain(".nav-button.current { box-shadow: inset 0 -2px 0 #8fc4e0; }");
    expect(shellRules).toContain(".nav-button.current { box-shadow: inset 0 -2px 0 var(--wt-ink); }");
    // The overlay header at rest is left on the donor treatment, where the pale blue belongs;
    // every override here names either the solid variant or .scrolled, never overlay.
    const underlineSelectors = shellRules.match(/^.*\.nav-button\.current.*$/gm) ?? [];
    expect(underlineSelectors).toHaveLength(2);
    for (const selector of underlineSelectors) {
      expect(selector).toMatch(/\.site-header\[data-variant="solid"\] |\.site-header\.scrolled /);
      expect(selector).not.toContain("overlay");
    }
  });

  it("carries no donor build directive, remote asset or donor route", () => {
    expect(port).not.toContain('@import "tailwindcss"');
    expect(port).not.toMatch(/url\(\s*["']?https?:/);
    for (const route of ["/activities", "/members", "/solutions"]) expect(port).not.toContain(route);
  });

  // Two donor photographs have no counterpart under public/. Their rights are unreviewed and the
  // asset inventory's disposition for them is "retire", so they enter, if at all, through WP-5.
  // Pinning the exact pair keeps the debt explicit and fails any newly dangling own-origin URL.
  it("pins the port's unresolved own-origin assets as known debt", () => {
    const referenced = [...rules.matchAll(/url\(\s*["']?(\/[^"')]+)/g)].map((match) => match[1]);
    expect(referenced.length).toBeGreaterThan(0);
    const unresolved = [...new Set(referenced)]
      .filter((path) => !existsSync(resolve(process.cwd(), "public", path.slice(1))))
      .sort();
    expect(unresolved).toEqual(["/archive/asia-smart-shanghai.webp", "/editorial/events-community.webp"]);
  });

  it("declares no tokens of its own and references only prefixed ones", () => {
    expect(rules).not.toMatch(/^:root/m);
    const references = [...port.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(100);
    for (const name of new Set(references)) expect(name).toMatch(/^--(wt-|font-)/);
  });

  // The donor scopes smaller heading tokens inside @media(max-width:520px). Those blocks are
  // overrides of the base clamps, not a token layer globals.css could own, so the port keeps
  // them — indented, which is why the /^:root/m check above still means "no top-level tokens".
  it("keeps the donor mobile heading overrides under the prefixed names", () => {
    expect(port).toContain("--wt-heading-display: 50px");
    expect(port).toContain("--wt-heading-section: 42px");
    expect(port).toContain("--wt-heading-card: 31px");
    expect(port).toContain("--wt-heading-section: 38px");
    expect(port).not.toMatch(/--heading-(display|section|card):/);
  });

  it.each(keptSelectors)("keeps the donor selector %s", (selector) => {
    expect(headsTopLevelRule(selector), `no top-level rule heads with ${selector}`).toBe(true);
  });

  it.each(droppedSelectors)("drops the donor-only selector %s", (selector) => {
    expect(rules).not.toMatch(anywherePattern(selector));
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
