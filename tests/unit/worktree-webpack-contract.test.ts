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
    expect(config).toContain("next dev --webpack");
  });

  it("keeps that managed server runnable off Windows", () => {
    const config = readFileSync(resolve(root, "playwright.config.ts"), "utf8");
    const command = config.match(/command: `([^`]+)`/)?.[1];

    expect(command).toBeDefined();
    // The Webpack flag exists for Windows worktree junctions, but spelling the
    // binary `.\node_modules\.bin\next.cmd` made `npm run test:e2e` unable to
    // start its own server anywhere else, which is every CI runner and macOS.
    expect(command).not.toContain(".cmd");
    expect(command).not.toContain("\\");
  });
});
