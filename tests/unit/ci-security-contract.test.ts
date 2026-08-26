import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8")) as Record<string, unknown>;
}

function versionAtLeast(actual: string, expected: [number, number, number]) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(actual);
  if (!match) return false;

  const parsed = match.slice(1).map(Number) as [number, number, number];
  return parsed[0] > expected[0]
    || (parsed[0] === expected[0] && parsed[1] > expected[1])
    || (parsed[0] === expected[0] && parsed[1] === expected[1] && parsed[2] >= expected[2]);
}

function resolvedVersions(lockfile: Record<string, unknown>, packageName: string) {
  const packages = lockfile.packages as Record<string, {version?: string}>;
  return Object.entries(packages)
    .filter(([path]) => path.endsWith(`/node_modules/${packageName}`))
    .map(([, packageInfo]) => packageInfo.version)
    .filter((version): version is string => Boolean(version));
}

describe("CI and production dependency security contract", () => {
  it("declares patched production dependency constraints", () => {
    const packageJson = readJson("package.json");

    expect((packageJson.dependencies as Record<string, string>)["@neondatabase/auth"], "package.json must declare @neondatabase/auth as ^0.5.0-beta").toBe("^0.5.0-beta");
    expect((packageJson.overrides as Record<string, string>).picomatch, "package.json must override picomatch to a patched ^2.3.2-compatible release").toMatch(/^\^?2\.3\.2$/);
  });

  it("resolves patched production dependency versions", () => {
    const lockfile = readJson("package-lock.json");
    const betterAuthVersions = resolvedVersions(lockfile, "better-auth");
    const picomatchVersions = resolvedVersions(lockfile, "picomatch");

    expect(betterAuthVersions.length, "package-lock.json must resolve better-auth").toBeGreaterThan(0);
    expect(betterAuthVersions.every((version) => versionAtLeast(version, [1, 6, 22])), `package-lock.json contains unsafe better-auth versions: ${betterAuthVersions.join(", ")}`).toBe(true);
    expect(picomatchVersions.length, "package-lock.json must resolve picomatch").toBeGreaterThan(0);
    expect(picomatchVersions.filter((version) => version.startsWith("2.")).every((version) => versionAtLeast(version, [2, 3, 2])), `package-lock.json contains unsafe Picomatch 2.x versions: ${picomatchVersions.join(", ")}`).toBe(true);
  });

  it("defines the required least-privilege quality workflow", () => {
    const workflowPath = resolve(repositoryRoot, ".github/workflows/ci.yml");

    expect(existsSync(workflowPath), "missing required .github/workflows/ci.yml workflow").toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow, "CI must use read-only contents permissions").toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(workflow, "CI must trigger pull requests targeting main").toMatch(/pull_request:\s*\n\s*branches:\s*\[main\]/);
    expect(workflow, "CI must use Node 22 with npm caching").toMatch(/node-version:\s*22[\s\S]*cache:\s*npm/);

    for (const command of ["npm ci", "npm run audit:strings", "npm test", "npm run lint", "npm run typecheck", "npm run build", "npm audit --omit=dev --audit-level=high"]) {
      expect(workflow, `CI must run ${command}`).toContain(command);
    }
  });
});
