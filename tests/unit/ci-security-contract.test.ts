import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {isDeepStrictEqual} from "node:util";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const authTreePackages = ["@neondatabase/auth", "@neondatabase/auth-ui", "better-auth", "better-call"];
const authTreeCommand = `npm ls --package-lock-only ${authTreePackages.join(" ")}`;
const authTreeProcessTimeoutMs = 18_000;
const authTreeContractTimeoutMs = 50_000;
const neonAuthLockRoots = ["node_modules/@neondatabase/auth", "node_modules/@neondatabase/auth-ui"];
const requiredCiCommands = ["npm ci", authTreeCommand, "npm run audit:strings", "npm test", "npm run lint", "npm run typecheck", "npm run build", "npm audit --omit=dev --audit-level=high"];
const requiredNpm10OptionalPeerClosure: Record<string, Record<string, unknown>> = {
  "node_modules/@neondatabase/auth-ui/node_modules/ajv": {
    version: "8.20.0",
    resolved: "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz",
    integrity: "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==",
    license: "MIT",
    optional: true,
    peer: true,
    dependencies: {
      "fast-deep-equal": "^3.1.3",
      "fast-uri": "^3.0.1",
      "json-schema-traverse": "^1.0.0",
      "require-from-string": "^2.0.2",
    },
    funding: {
      type: "github",
      url: "https://github.com/sponsors/epoberezkin",
    },
  },
  "node_modules/@neondatabase/auth-ui/node_modules/json-schema-traverse": {
    version: "1.0.0",
    resolved: "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz",
    integrity: "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==",
    license: "MIT",
    optional: true,
    peer: true,
  },
  "node_modules/fast-uri": {
    version: "3.1.6",
    resolved: "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.6.tgz",
    integrity: "sha512-7Ical1vFEMr0onbVzEDIreM22I4khW+fzyQPwvAFWBp1iwdshSZRsL4jjRvPG9JP1uiqMHRto+YU6R2/CzDz5Q==",
    funding: [
      {type: "github", url: "https://github.com/sponsors/fastify"},
      {type: "opencollective", url: "https://opencollective.com/fastify"},
    ],
    license: "BSD-3-Clause",
    optional: true,
    peer: true,
  },
  "node_modules/require-from-string": {
    version: "2.0.2",
    resolved: "https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz",
    integrity: "sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==",
    license: "MIT",
    optional: true,
    peer: true,
    engines: {node: ">=0.10.0"},
  },
};

type AuthTreeProcessOptions = {
  executable?: string;
  args?: string[];
  timeoutMs?: number;
};

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

function resolvedVersionsUnder(lockfile: Record<string, unknown>, packageName: string, roots: string[]) {
  const packages = lockfile.packages as Record<string, {version?: string}>;
  return Object.entries(packages)
    .filter(([path]) => roots.some((root) => path.startsWith(`${root}/node_modules/`)))
    .filter(([path]) => path.endsWith(`/node_modules/${packageName}`))
    .map(([, packageInfo]) => packageInfo.version)
    .filter((version): version is string => Boolean(version));
}

function npm10OptionalPeerClosureMismatches(lockfile: Record<string, unknown>) {
  const packages = lockfile.packages as Record<string, Record<string, unknown>> | undefined;

  return Object.entries(requiredNpm10OptionalPeerClosure)
    .filter(([path, expectedRecord]) => !isDeepStrictEqual(packages?.[path], expectedRecord))
    .map(([path]) => path);
}

function workflowRunSteps(workflow: string) {
  return [...workflow.matchAll(/^\s*- run: (.+)$/gm)].map(([, command]) => command);
}

function workflowTriggerBranches(workflow: string, event: "pull_request" | "push") {
  // Normalised like its sibling tests rather than leaning on the regex
  // backtracking over a stray carriage return. This file has already carried one
  // CRLF bug; relying on a subtlety to survive the next one is how that happened.
  const match = new RegExp(`${event}:\\s*\\n\\s*branches:\\s*\\[([^\\]]*)\\]`).exec(normalizeNewlines(workflow));
  return match ? match[1].split(",").map((branch) => branch.trim()).filter(Boolean) : [];
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function mutateFixture(label: string, fixture: string, needle: string, replacement: string) {
  const normalizedFixture = normalizeNewlines(fixture);
  const normalizedNeedle = normalizeNewlines(needle);
  expect(normalizedFixture.includes(normalizedNeedle), label + " mutation needle was not found").toBe(true);
  const mutatedFixture = normalizedFixture.replace(normalizedNeedle, normalizeNewlines(replacement));
  expect(mutatedFixture, label + " fixture mutation unexpectedly no-op").not.toBe(normalizedFixture);
  return mutatedFixture;
}

function workflowRunStepTimeoutMinutes(workflow: string, command: string) {
  const lines = workflow.split(/\r?\n/);
  const runLine = `      - run: ${command}`;
  const stepStart = lines.indexOf(runLine);
  if (stepStart === -1) return undefined;

  const stepLines = [lines[stepStart]];
  for (let index = stepStart + 1; index < lines.length && !/^ {6}- /.test(lines[index]); index += 1) {
    stepLines.push(lines[index]);
  }

  const timeout = stepLines.join("\n").match(/^ {8}timeout-minutes: ([1-9]\d*)$/m);
  return timeout ? Number(timeout[1]) : undefined;
}

function runAuthTreeCheck(cwd: string, options: AuthTreeProcessOptions = {}) {
  const executable = options.executable ?? (process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm");
  const args = options.args ?? (process.platform === "win32"
    ? ["/d", "/s", "/c", authTreeCommand]
    : ["ls", "--package-lock-only", ...authTreePackages]);
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: options.timeoutMs ?? authTreeProcessTimeoutMs,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  const errorCode = (result.error as NodeJS.ErrnoException | undefined)?.code ?? "none";
  const status = result.status === null ? "null" : String(result.status);
  const signal = result.signal ?? "none";

  if (result.error || result.status === null || result.signal) {
    throw new Error(`Auth tree process failed: code=${errorCode} status=${status} signal=${signal}; ${result.error?.message ?? "child terminated without an exit status"}`);
  }

  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
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
    const betterAuthVersions = resolvedVersionsUnder(lockfile, "better-auth", neonAuthLockRoots);
    const betterAuthCoreVersions = resolvedVersionsUnder(lockfile, "@better-auth/core", neonAuthLockRoots);
    const betterAuthApiKeyVersions = resolvedVersionsUnder(lockfile, "@better-auth/api-key", neonAuthLockRoots);
    const betterCallVersions = resolvedVersionsUnder(lockfile, "better-call", neonAuthLockRoots);
    const betterAuthUiVersions = resolvedVersionsUnder(lockfile, "@daveyplate/better-auth-ui", neonAuthLockRoots);
    const picomatchVersions = resolvedVersions(lockfile, "picomatch");
    const picomatch2Versions = picomatchVersions.filter((version) => version.startsWith("2."));

    expect(betterAuthVersions.length, "Neon Auth lock subtrees must resolve Better Auth").toBeGreaterThan(0);
    expect(betterAuthVersions.every((version) => version === "1.6.23"), `Neon Auth lock subtrees contain non-Neon Better Auth versions: ${betterAuthVersions.join(", ")}`).toBe(true);
    expect(betterAuthCoreVersions.length, "Neon Auth lock subtrees must resolve Better Auth core").toBeGreaterThan(0);
    expect(betterAuthCoreVersions.every((version) => version === "1.6.23"), `Neon Auth lock subtrees contain non-Neon Better Auth core versions: ${betterAuthCoreVersions.join(", ")}`).toBe(true);
    expect(betterAuthApiKeyVersions, "the peer-invalid Better Auth API key plugin must not remain in the Neon Auth lock subtrees").toEqual([]);
    expect(betterCallVersions.length, "Neon Auth lock subtrees must resolve Better Call").toBeGreaterThan(0);
    expect(betterCallVersions.every((version) => version === "1.3.7"), `Neon Auth lock subtrees contain non-Neon Better Call versions: ${betterCallVersions.join(", ")}`).toBe(true);
    expect(betterAuthUiVersions.length, "Neon Auth UI lock subtree must resolve Better Auth UI").toBeGreaterThan(0);
    expect(betterAuthUiVersions.every((version) => version === "3.3.15"), `Neon Auth UI lock subtree contains incompatible Better Auth UI versions: ${betterAuthUiVersions.join(", ")}`).toBe(true);
    expect(betterAuthVersions.every((version) => versionAtLeast(version, [1, 6, 22])), `Neon Auth lock subtrees contain unsafe better-auth versions: ${betterAuthVersions.join(", ")}`).toBe(true);
    expect(picomatchVersions.length, "package-lock.json must resolve Picomatch entries including node_modules/picomatch").toBeGreaterThan(0);
    expect(picomatch2Versions.length, "package-lock.json must retain and patch at least one Picomatch 2.x entry").toBeGreaterThan(0);
    expect(picomatch2Versions.every((version) => versionAtLeast(version, [2, 3, 2])), `package-lock.json contains unsafe Picomatch 2.x versions: ${picomatch2Versions.join(", ")}`).toBe(true);
  });

  it("retains the exact npm 10 optional-peer closure required by npm ci", () => {
    const lockfile = readJson("package-lock.json");

    expect(
      npm10OptionalPeerClosureMismatches(lockfile),
      "package-lock.json must retain npm 10's canonical Ajv optional-peer closure",
    ).toEqual([]);
  });

  it("rejects every missing or metadata-drifted npm 10 optional-peer closure record", () => {
    const validFixture: Record<string, unknown> = {
      packages: structuredClone(requiredNpm10OptionalPeerClosure),
    };

    for (const path of Object.keys(requiredNpm10OptionalPeerClosure)) {
      const missingRecord = structuredClone(validFixture);
      delete (missingRecord.packages as Record<string, unknown>)[path];
      expect(npm10OptionalPeerClosureMismatches(missingRecord), `deleting ${path} must fail`).toEqual([path]);

      const driftedRecord = structuredClone(validFixture);
      const driftedPackages = driftedRecord.packages as Record<string, Record<string, unknown>>;
      driftedPackages[path] = {...driftedPackages[path], integrity: "sha512-hostile-drift"};
      expect(npm10OptionalPeerClosureMismatches(driftedRecord), `drifting ${path} must fail`).toEqual([path]);
    }
  });

  it("scopes Better Auth lock assertions to Neon Auth ancestry", () => {
    const lockfile = readJson("package-lock.json");
    const packages = lockfile.packages as Record<string, {version?: string}>;
    const withUnrelatedBetterAuth = {
      ...lockfile,
      packages: {
        ...packages,
        "node_modules/unrelated-auth-client/node_modules/better-auth": {version: "9.9.9"},
      },
    };

    expect(resolvedVersions(withUnrelatedBetterAuth, "better-auth")).toContain("9.9.9");
    expect(resolvedVersionsUnder(withUnrelatedBetterAuth, "better-auth", neonAuthLockRoots)).not.toContain("9.9.9");
  });

  it("fails hard when a hostile dependency-tree child exceeds a short deadline", () => {
    expect(() => runAuthTreeCheck(repositoryRoot, {
      executable: process.execPath,
      args: ["-e", "setTimeout(() => process.exit(0), 250)"],
      timeoutMs: 25,
    })).toThrow(/code=ETIMEDOUT[\s\S]*status=null[\s\S]*signal=/);
  });

  it("requires a valid full lockfile-only Auth tree and detects a hostile peer-invalid fixture", () => {
    expect(authTreeProcessTimeoutMs * 2, "two dependency-tree subprocess deadlines must leave realistic headroom inside the Vitest timeout").toBeLessThan(authTreeContractTimeoutMs);

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
  }, authTreeContractTimeoutMs);

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
    // Anchored on which branches are actually covered rather than one spelling of
    // the list. `release` is the production branch and the repository default, so a
    // trigger list that quietly stopped covering it would deploy production
    // unchecked -- which is exactly the state this repository was in until CI was
    // extended. Both events are pinned because only `push` guards the cutover
    // itself; a pull_request-only trigger leaves the deploying push unverified.
    expect(workflowTriggerBranches(workflow, "pull_request"), "CI must trigger pull requests targeting main and release").toEqual(expect.arrayContaining(["main", "release"]));
    expect(workflowTriggerBranches(workflow, "push"), "CI must run on pushes to main and release, so production is never deployed unchecked").toEqual(expect.arrayContaining(["main", "release"]));
    expect(workflow, "CI must use Node 22 with npm caching").toMatch(/node-version:\s*22[\s\S]*cache:\s*npm/);
    expect(workflowRunSteps(workflow), "CI run steps must be exactly the required commands in order").toEqual(requiredCiCommands);
  });

  it("bounds the exact Auth dependency-tree CI step to one minute", () => {
    const workflow = normalizeNewlines(readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8"));

    expect(
      workflowRunStepTimeoutMinutes(workflow, authTreeCommand),
      "the exact lockfile-only Auth dependency-tree step must declare numeric timeout-minutes: 1",
    ).toBe(1);
  });

  it("rejects reordered, missing, or extra CI run commands", () => {
    const workflow = normalizeNewlines(readFileSync(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8"));
    const authTreeStep = `      - run: ${authTreeCommand}\n        timeout-minutes: 1`;
    const auditStep = "      - run: npm run audit:strings";
    const reordered = mutateFixture("reordered workflow commands", workflow, `${authTreeStep}\n${auditStep}`, `${auditStep}\n${authTreeStep}`);
    const missingAuthTree = mutateFixture("missing Auth-tree validation", workflow, `${authTreeStep}\n`, "");
    const withExtraCommand = `${workflow}\n      - run: npm run e2e\n`;
    expect(withExtraCommand, "extra workflow command fixture mutation unexpectedly no-op").not.toBe(workflow);

    expect(workflowRunSteps(reordered), "reordered workflow commands must fail the exact command contract").not.toEqual(requiredCiCommands);
    expect(workflowRunSteps(missingAuthTree), "missing Auth-tree validation must fail the exact command contract").not.toEqual(requiredCiCommands);
    expect(workflowRunSteps(withExtraCommand), "extra workflow commands must fail the exact command contract").not.toEqual(requiredCiCommands);
  });
});
