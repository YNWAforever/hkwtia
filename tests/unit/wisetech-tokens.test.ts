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
// --secondary and --shell-blue are darkened to 37% lightness for AA contrast (axe finding),
// not exact conversions; --wt-cyan is unaffected.
const retunedTriplets = {
  "--background": "0 0% 96%",
  "--foreground": "208 79% 28%",
  "--card": "0 0% 100%",
  "--popover": "0 0% 100%",
  "--primary": "209 67% 31%",
  "--secondary": "201 75% 37%",
  "--muted-foreground": "0 0% 39%",
  "--accent": "42 79% 75%",
  "--accent-foreground": "208 79% 28%",
  "--border": "0 3% 87%",
  "--input": "0 3% 87%",
  "--ring": "209 67% 31%",
  "--shell-canvas": "0 0% 96%",
  "--shell-raised": "0 0% 100%",
  "--shell-ink": "208 79% 28%",
  "--shell-muted": "0 0% 39%",
  "--shell-navy": "208 79% 28%",
  "--shell-blue": "201 75% 37%",
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
