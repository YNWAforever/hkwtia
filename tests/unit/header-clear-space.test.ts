import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

const chrome = readFileSync("app/styles/wisetech-chrome.css", "utf8");
const experience = readFileSync("app/styles/wisetech-experience.css", "utf8");

// A9 / V21. The donor header inset is calc(100% - 48px). At a 135px lockup the
// clear space is 44px, including the left edge from 1200px up. The 821–1199px
// band was not measured and is not given a new rule here.
describe("header clear space", () => {

  it("uses a 44px logo-to-name gap and the same inset from 1200px", () => {
    expect(chrome).toContain("--brand-copy-gap: 44px");
    expect(chrome).toContain("gap: var(--brand-copy-gap)");
    expect(chrome).toMatch(/@media \(min-width: 1200px\) \{[^}]*calc\(100% - \(var\(--brand-copy-gap\) \* 2\)\)/);
    expect(chrome).not.toMatch(/@media \(min-width: 821px\)/);
  });
});

describe("English desktop nav", () => {
  it("hides the legal name below 1440 and keeps a 16px item gap", () => {
    expect(chrome).toContain('html[lang="en"] .site-header .brand-copy small { display: none; }');
    expect(chrome).toContain('html[lang="en"] .desktop-nav');
    expect(chrome).toContain("gap: 16px;");
    expect(chrome).toContain("min-width: max-content;");
    expect(chrome).toContain('html[lang="en"] .site-header .brand-copy { flex-shrink: 0; }');
    expect(chrome).not.toMatch(/html\[lang="zh-HK"\] \.site-header \.brand-copy small \{ display: none/);
  });
});

describe("Ask WTIA clearance", () => {
  it("pads main, not the shell, so the footer is not followed by a blank band", () => {
    expect(chrome).toContain(".site-root main { padding-bottom: calc(54px + 22px + 24px); }");
    expect(chrome).not.toMatch(/^\.site-root \{ padding-bottom:/m);
  });

  it("keeps plan-grid benefits out of the launcher's horizontal footprint while scrolling", () => {
    // Bottom padding only clears the end of main. The live overlap is a benefit
    // line passing through the fixed control, so the grid itself stops short of it.
    expect(chrome).toContain("--ask-wtia-inline-clearance: 64px");
    expect(chrome).toContain("--ask-wtia-inline-clearance: 112px");
    expect(chrome).toContain(".plan-grid { margin-inline-end: var(--ask-wtia-inline-clearance); }");
  });

  it("shrinks the launcher and clears the safe area only up to 430px", () => {
    expect(chrome).toContain("@media (max-width: 430px)");
    expect(chrome).toContain("bottom: calc(10px + env(safe-area-inset-bottom, 0px));");
    expect(chrome).toContain("width: 44px;");
    expect(chrome).toContain("padding-bottom: calc(44px + 10px + env(safe-area-inset-bottom, 0px) + 28px);");
    expect(chrome).toContain(".site-root main { padding-bottom: calc(54px + 22px + 24px); }");
  });
});

describe("zh-HK footer email", () => {
  it("keeps the address on one full-width line at the phone footer", () => {
    expect(experience).toContain(".footer-links > div:last-child { grid-column: 1 / -1; }");
    expect(experience).toContain(".footer-links a.footer-email { white-space: nowrap; }");
    const phone = experience.slice(experience.indexOf("@media (max-width: 520px)"));
    expect(phone.indexOf(".footer-links > div:last-child")).toBeGreaterThan(-1);
    expect(phone.indexOf(".footer-links > div:last-child")).toBeLessThan(phone.indexOf("@media (min-width: 821px)"));
  });
});

describe("membership plan grid", () => {

  it("drops the 480px card floor and draws a divider above each CTA", () => {
    expect(chrome).toMatch(/\.plan-grid article \{ min-height: 0; \}/);
    expect(chrome).toContain("border-top: 1px solid #e5e9f0");
    expect(chrome).not.toMatch(/\.plan-grid\s*\{[^}]*align-items:\s*start/);
  });

  it("marks Individual benefits with a 6px navy dot", () => {
    expect(chrome).toMatch(/\.plan-grid li::before \{[^}]*width: 6px;[^}]*height: 6px;[^}]*background: #0f4c81;/s);
  });
});
