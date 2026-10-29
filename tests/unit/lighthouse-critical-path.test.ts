import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

// Weekly Lighthouse run 40850403806 failed / at 0.85 (TBT 510ms) and /events at
// 0.88 (first paint held until shared client JS yielded). These imports are the
// Radix menus that were on that critical path even when the mobile audit never
// opened them. A static import here puts them back in the first-load graph.
const header = readFileSync(resolve(process.cwd(), "components/layout/site-header.tsx"), "utf8");
const mobile = readFileSync(resolve(process.cwd(), "components/layout/mobile-navigation.tsx"), "utf8");
const gate = readFileSync(resolve(process.cwd(), "components/layout/desktop-nav-gate.tsx"), "utf8");
const css = readFileSync(resolve(process.cwd(), "app/styles/wisetech.css"), "utf8");

describe("Lighthouse critical path", () => {
  it("does not statically import the desktop or mobile menu implementations", () => {
    expect(header).not.toContain("desktop-mega-navigation");
    expect(header).toContain("desktop-nav-gate");
    expect(mobile).not.toContain("@/components/ui/sheet");
    expect(mobile).not.toContain("@/components/ui/accordion");
    expect(mobile).toContain('import("./mobile-nav-panel")');
    expect(gate).not.toContain("@/components/ui/navigation-menu");
    expect(gate).toContain('import("./desktop-mega-navigation")');
  });

  it("keeps the full-size GBA photograph off the stylesheet", () => {
    expect(css).not.toContain("/archive/asia-smart-shanghai.webp");
    expect(css).toContain("/archive/asia-smart-shanghai-640.webp");
    expect(css).toContain("/archive/asia-smart-shanghai-960.webp");
  });
});
