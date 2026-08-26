import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const requiredCiCommands = ["npm ci", "npm run audit:strings", "npm test", "npm run lint", "npm run typecheck", "npm run build", "npm audit --omit=dev --audit-level=high"];

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
    .filter(([path]) => path === `node_modules/${packageName}` || path.endsWith(`/node_modules/${packageName}`))
    .map(([, packageInfo]) => packageInfo.version)
    .filter((version): version is string => Boolean(version));
}

function workflowRunSteps(workflow: string) {
  return [...workflow.matchAll(/^\s*- run: (.+)$/gm)].map(([, command]) => command);
}

describe("CI and production dependency security contract", () => {
  it("declares scoped patched production dependency constraints", () => {
    const packageJson = readJson("package.json");
    const overrides = packageJson.overrides as Record<string, string>;

    expect((packageJson.dependencies as Record<string, string>)["@neondatabase/auth"], "package.json must declare @neondatabase/auth as ^0.5.0-beta").toBe("^0.5.0-beta");
    expect(overrides["picomatch@2"], "package.json must scope the Picomatch override to vulnerable 2.x consumers").toBe("^2.3.2");
    expect(overrides.picomatch, "package.json must not force Picomatch 2.x onto 4.x consumers").toBeUndefined();
  });

  it("resolves patched production dependency versions without omitting root Picomatch", () => {
    const lockfile = readJson("package-lock.json");
    const betterAuthVersions = resolvedVersions(lockfile, "better-auth");
    const picomatchVersions = resolvedVersions(lockfile, "picomatch");
    const picomatch2Versions = picomatchVersions.filter((version) => version.startsWith("2."));

    expect(betterAuthVersions.length, "package-lock.json must resolve better-auth").toBeGreaterThan(0);
    expect(betterAuthVersions.every((version) => versionAtLeast(version, [1, 6, 22])), `package-lock.json contains unsafe better-auth versions: ${betterAuthVersions.join(", ")}`).toBe(true);
    expect(picomatchVersions.length, "package-lock.json must resolve Picomatch entries including node_modules/picomatch").toBeGreaterThan(0);
    expect(picomatch2Versions.length, "package-lock.json must retain and patch at least one Picomatch 2.x entry").toBeGreaterThan(0);
    expect(picomatch2Versions.every((version) => versionAtLeast(version, [2, 3, 2])), `package-lock.json contains unsafe Picomatch 2.x versions: ${picomatch2Versions.join(", ")}`).toBe(true);
  });

  it("keeps lockfile root metadata aligned with the five direct dependency declarations", () => {
    const packageJson = readJson("package.json");
    const lockfile = readJson("package-lock.json");
    const manifestDependencies = packageJson.dependencies as Record<string, string>;
    const lockfileDependencies = (lockfile.packages as Record<string, {dependencies?: Record<string, string>}>)[""].dependencies ?? {};

    for (const dependency of ["@radix-ui/react-radio-group", "@radix-ui/react-separator", "@radix-ui/react-switch", "@radix-ui/react-toast", "@radix-ui/react-toggle"]) {
      expect(lockfileDependencies[dependency], `package-lock.json root metadata must mirror package.json for ${dependency}`).toBe(manifestDependencies[dependency]);
    }
  });

  it("defines the required least-privilege quality workflow with exact ordered run steps", () => {
    const workflowPath = resolve(repositoryRoot, ".github/workflows/ci.yml");

    expect(existsSync(workflowPath), "missing required .github/workflows/ci.yml workflow").toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow, "CI must use read-only contents permissions").toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(workflow, "CI must trigger pull requests targeting main").toMatch(/pull_request:\s*\n\s*branches:\s*\[main\]/);
    expect(workflow, "CI must use Node 22 with npm caching").toMatch(/node-version:\s*22[\s\S]*cache:\s*npm/);
    expect(workflowRunSteps(workflow), "CI run steps must be exactly the required commands in order").toEqual(requiredCiCommands);
  });

  it("rejects reordered or extra CI run commands", () => {
    const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    const reordered = workflow.replace("- run: npm ci\n      - run: npm run audit:strings", "- run: npm run audit:strings\n      - run: npm ci");
    const withExtraCommand = `${workflow}\n      - run: npm run e2e\n`;

    expect(workflowRunSteps(reordered), "reordered workflow commands must fail the exact command contract").not.toEqual(requiredCiCommands);
    expect(workflowRunSteps(withExtraCommand), "extra workflow commands must fail the exact command contract").not.toEqual(requiredCiCommands);
  });
});
