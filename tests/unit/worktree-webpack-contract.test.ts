import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import manifest from "../../package.json";

const root = resolve(import.meta.dirname, "../..");

describe("worktree-safe Next tooling", () => {
  it("selects Webpack for normal development and production builds", () => {
    expect(manifest.scripts.dev).toBe("next dev --webpack");
    expect(manifest.scripts.build).toBe("next build --webpack");
  });

  it("selects Webpack for Playwright's managed dev server", () => {
    const config = readFileSync(resolve(root, "playwright.config.ts"), "utf8");
    expect(config).toContain("next.cmd dev --webpack");
  });
});
