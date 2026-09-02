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
