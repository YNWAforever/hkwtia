import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import postcss from "postcss";
import {describe, expect, it} from "vitest";

// Preview anonymous axe (2026-10-27, PR #212) flagged `.open-now-record > span` at 4.48:1:
// #8fc4e0 on the Open Now host `--wt-ink-soft` (#1a4f82), 11px bold text, needs 4.5:1. The
// record only renders when a published past item exists, so the empty local catalog never hit it.
const css = readFileSync(resolve(process.cwd(), "app/styles/wisetech-experience.css"), "utf8");

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("Open Now record label contrast on --wt-ink-soft", () => {
  it("uses a solid colour that clears 4.5:1 on #1a4f82", () => {
    let color: string | undefined;
    postcss.parse(css).walkRules(".open-now-record > span", (rule) => {
      rule.walkDecls("color", (decl) => {
        color = decl.value;
      });
    });
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ratio(color!, "#1a4f82")).toBeGreaterThanOrEqual(4.5);
  });
});
