import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("M6 browser acceptance environment boundary", () => {
  it("keeps mutating routes and direct database assertions on the managed server", () => {
    const source = readFileSync(resolve(root, "tests/e2e/m6-launch-pad.spec.ts"), "utf8");
    expect(source).toContain("const managedM6Target = configuredTarget.length === 0;");
    expect(source).toContain("test.skip(!managedM6Target || missingEnvironment.length > 0, skipReason);");
    expect(source).toContain("if (!managedM6Target) return;");
    expect(source).toContain("M6 mutating real-route acceptance is restricted to Playwright's managed loopback server");
  });
});
