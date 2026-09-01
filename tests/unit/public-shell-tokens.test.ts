import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const globals = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const tailwind = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf8");

describe("public shell semantic tokens", () => {
  it.each([
    "--shell-canvas", "--shell-raised", "--shell-warm", "--shell-ink",
    "--shell-muted", "--shell-navy", "--shell-blue", "--shell-accent",
    "--shell-border", "--shell-shadow-sm", "--shell-shadow-lg",
    "--shell-radius-sm", "--shell-radius-lg", "--shell-focus", "--shell-content",
  ])("defines %s without replacing the base tokens", (token) => {
    expect(globals).toContain(token);
  });

  it("registers Chinese-capable fallbacks and reduced-motion protection", () => {
    expect(globals).toContain('"PingFang TC"');
    expect(globals).toContain('"Noto Sans TC"');
    expect(globals).toContain('"Microsoft JhengHei"');
    expect(globals).toContain("prefers-reduced-motion: reduce");
  });

  it.each(["canvas", "raised", "warm", "ink", "navy", "blue"])(
    "exposes the shell %s colour through Tailwind",
    (name) => expect(tailwind).toContain(`${name}: "hsl(var(--shell-${name}))"`),
  );
});
