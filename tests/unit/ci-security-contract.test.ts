import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const authTreePackages = ["@neondatabase/auth", "@neondatabase/auth-ui", "better-auth", "better-call"];
const authTreeCommand = `npm ls --package-lock-only ${authTreePackages.join(" ")}`;
const requiredCiCommands = ["npm ci", authTreeCommand, "npm run audit:strings", "npm test", "npm run lint", "npm run typecheck", "npm run build", "npm audit --omit=dev --audit-level=high"];

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

function runAuthTreeCheck(cwd: string) {
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", authTreeCommand]
    : ["ls", "--package-lock-only", ...authTreePackages];
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

describe("CI and production dependency security contract", () => {
  it("declares scoped patched production dependency constraints", () => {
    const packageJson = readJson("package.json");
    const overrides = packageJson.overrides as Record<string, string | Record<string, string>>;
    const neonAuthUiOverrides = overrides["@neondatabase/auth-ui@0.3.0-beta"] as Record<string, string>;

    expect((packageJson.dependencies as Record<string, string>)["@neondatabase/auth"], "package.json must declare @neondatabase/auth as ^0.5.0-beta").toBe("^0.5.0-beta");
    expect(neonAuthUiOverrides?.["@better-auth/core"], "Neon Auth UI must use the matching Better Auth core family").toBe("1.6.23");
    expect(neonAuthUiOverrides?.["@daveyplate/better-auth-ui"], "Neon Auth UI must avoid the peer-invalid 3.4.0 dependency graph").toBe("3.3.15");
    expect(overrides["@better-auth/core"], "package.json must not override Better Auth core globally").toBeUndefined();
    expect(overrides["@daveyplate/better-auth-ui"], "package.json must not override Better Auth UI globally").toBeUndefined();
    expect(overrides["picomatch@2"], "package.json must scope the Picomatch override to vulnerable 2.x consumers").toBe("^2.3.2");
    expect(overrides.picomatch, "package.json must not force Picomatch 2.x onto 4.x consumers").toBeUndefined();
  });

  it("resolves a coherent Neon Auth tree and patched Picomatch versions", () => {
    const lockfile = readJson("package-lock.json");
    const betterAuthVersions = resolvedVersions(lockfile, "better-auth");
    const betterAuthCoreVersions = resolvedVersions(lockfile, "@better-auth/core");
    const betterAuthApiKeyVersions = resolvedVersions(lockfile, "@better-auth/api-key");
    const betterCallVersions = resolvedVersions(lockfile, "better-call");
    const betterAuthUiVersions = resolvedVersions(lockfile, "@daveyplate/better-auth-ui");
    const picomatchVersions = resolvedVersions(lockfile, "picomatch");
    const picomatch2Versions = picomatchVersions.filter((version) => version.startsWith("2."));

    expect(betterAuthVersions.length, "package-lock.json must resolve Better Auth").toBeGreaterThan(0);
    expect(betterAuthVersions.every((version) => version === "1.6.23"), `package-lock.json contains non-Neon Better Auth versions: ${betterAuthVersions.join(", ")}`).toBe(true);
    expect(betterAuthCoreVersions.length, "package-lock.json must resolve Better Auth core").toBeGreaterThan(0);
    expect(betterAuthCoreVersions.every((version) => version === "1.6.23"), `package-lock.json contains non-Neon Better Auth core versions: ${betterAuthCoreVersions.join(", ")}`).toBe(true);
    expect(betterAuthApiKeyVersions, "the peer-invalid Better Auth API key plugin must not remain in the Neon Auth tree").toEqual([]);
    expect(betterCallVersions.length, "package-lock.json must resolve Better Call").toBeGreaterThan(0);
    expect(betterCallVersions.every((version) => version === "1.3.7"), `package-lock.json contains non-Neon Better Call versions: ${betterCallVersions.join(", ")}`).toBe(true);
    expect(betterAuthUiVersions.length, "package-lock.json must resolve Better Auth UI").toBeGreaterThan(0);
    expect(betterAuthUiVersions.every((version) => version === "3.3.15"), `package-lock.json contains incompatible Better Auth UI versions: ${betterAuthUiVersions.join(", ")}`).toBe(true);
    expect(betterAuthVersions.every((version) => versionAtLeast(version, [1, 6, 22])), `package-lock.json contains unsafe better-auth versions: ${betterAuthVersions.join(", ")}`).toBe(true);
    expect(picomatchVersions.length, "package-lock.json must resolve Picomatch entries including node_modules/picomatch").toBeGreaterThan(0);
    expect(picomatch2Versions.length, "package-lock.json must retain and patch at least one Picomatch 2.x entry").toBeGreaterThan(0);
    expect(picomatch2Versions.every((version) => versionAtLeast(version, [2, 3, 2])), `package-lock.json contains unsafe Picomatch 2.x versions: ${picomatch2Versions.join(", ")}`).toBe(true);
  });

  it("requires a valid full lockfile-only Auth tree and detects a hostile peer-invalid fixture", () => {
    const repositoryResult = runAuthTreeCheck(repositoryRoot);

    expect(repositoryResult.status, repositoryResult.output).toBe(0);

    const fixtureRoot = mkdtempSync(join(tmpdir(), "hkwtia-peer-invalid-"));
    const fixturePackageJson = {
      name: "peer-invalid-auth-tree",
      private: true,
      version: "0.0.0",
      dependencies: {"@neondatabase/auth": "0.5.0-beta"},
    };
    const fixtureLockfile = {
      name: "peer-invalid-auth-tree",
      version: "0.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "peer-invalid-auth-tree",
          version: "0.0.0",
          dependencies: {"@neondatabase/auth": "0.5.0-beta"},
        },
        "node_modules/@better-auth/api-key": {
          version: "1.7.1",
          peerDependencies: {"better-auth": "^1.7.1", "better-call": "1.4.0"},
        },
        "node_modules/@neondatabase/auth": {
          version: "0.5.0-beta",
          dependencies: {"@neondatabase/auth-ui": "0.3.0-beta", "better-auth": "1.6.23"},
        },
        "node_modules/@neondatabase/auth-ui": {
          version: "0.3.0-beta",
          dependencies: {"@better-auth/api-key": "1.7.1", "better-auth": "1.6.23", "better-call": "1.3.7"},
        },
        "node_modules/better-auth": {version: "1.6.23"},
        "node_modules/better-call": {version: "1.3.7"},
      },
    };

    try {
      writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify(fixturePackageJson));
      writeFileSync(join(fixtureRoot, "package-lock.json"), JSON.stringify(fixtureLockfile));
      const hostileResult = runAuthTreeCheck(fixtureRoot);

      expect(hostileResult.status, "the hostile peer-invalid fixture must fail the exact Auth-tree command").not.toBe(0);
      expect(hostileResult.output).toContain("ELSPROBLEMS");
    } finally {
      rmSync(fixtureRoot, {recursive: true, force: true});
    }
  }, 30_000);

  it("keeps lockfile root metadata aligned with the five direct dependency declarations", () => {
    const packageJson = readJson("package.json");
    const lockfile = readJson("package-lock.json");
    const manifestDependencies = packageJson.dependencies as Record<string, string>;
    const lockfileDependencies = (lockfile.packages as Record<string, {dependencies?: Record<string, string>}>)[''].dependencies ?? {};

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

  it("rejects reordered, missing, or extra CI run commands", () => {
    const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    const reordered = workflow.replace(`- run: ${authTreeCommand}\n      - run: npm run audit:strings`, `- run: npm run audit:strings\n      - run: ${authTreeCommand}`);
    const missingAuthTree = workflow.replace(`      - run: ${authTreeCommand}\n`, "");
    const withExtraCommand = `${workflow}\n      - run: npm run e2e\n`;

    expect(workflowRunSteps(reordered), "reordered workflow commands must fail the exact command contract").not.toEqual(requiredCiCommands);
    expect(workflowRunSteps(missingAuthTree), "missing Auth-tree validation must fail the exact command contract").not.toEqual(requiredCiCommands);
    expect(workflowRunSteps(withExtraCommand), "extra workflow commands must fail the exact command contract").not.toEqual(requiredCiCommands);
  });
});
