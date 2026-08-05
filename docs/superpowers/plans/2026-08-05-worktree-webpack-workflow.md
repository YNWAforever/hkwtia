# Worktree-safe Webpack workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository's normal Next.js build, development server, and managed Playwright server explicitly use Webpack so Windows worktree dependency junctions do not trigger Turbopack failures.

**Architecture:** Keep the application and deployment architecture unchanged. `package.json` owns the normal `dev` and `build` commands, while `playwright.config.ts` opts its local `webServer` command into the same bundler; external `PLAYWRIGHT_BASE_URL` runs remain untouched.

**Tech Stack:** Next.js 16.2.10, TypeScript, Vitest, Playwright, npm scripts, Windows PowerShell.

## Global Constraints

- Change only command wiring and contract tests.
- Use `next dev --webpack` for local development and `next build --webpack` for production builds.
- Keep `next start`, application behavior, route behavior, and all runtime data access unchanged.
- Do not change Vercel, Neon, Stripe, Preview, Production, or shared environment values.
- Do not add a `turbopack.root` workaround; keep the project root unchanged.
- Preserve existing unstaged SDD reports and snapshot artifacts.

---

### Task 1: Add the failing Webpack tooling contract

**Files:**
- Create: `tests/unit/worktree-webpack-contract.test.ts`
- Reference: `package.json`
- Reference: `playwright.config.ts`

**Interfaces:**
- Consumes: the parsed `package.json` scripts and the Playwright config source.
- Produces: a deterministic contract that fails while either command still relies on Next's Turbopack default.

- [ ] **Step 1: Write the failing test**

Create a test that asserts the exact command strings and managed server flag:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm.cmd test -- tests/unit/worktree-webpack-contract.test.ts
```

Expected result: FAIL because the current `dev` and `build` values are `next dev` and `next build`, and the Playwright command has no `--webpack` flag.

### Task 2: Wire the explicit Webpack commands

**Files:**
- Modify: `package.json:7-8`
- Modify: `playwright.config.ts:29`
- Modify: `tests/unit/repository-contract.test.ts:7-14`

**Interfaces:**
- Consumes: the failing contract from Task 1 and the existing repository script contract.
- Produces: `npm.cmd run dev`, `npm.cmd run build`, and the Playwright fallback server all explicitly selecting Webpack.

- [ ] **Step 1: Update the package scripts**

Change only these values in `package.json`:

```json
"dev": "next dev --webpack",
"build": "next build --webpack",
```

Leave `start`, `lint`, `typecheck`, `test`, and `test:e2e` unchanged.

- [ ] **Step 2: Update Playwright's managed server command**

Change the existing command in `playwright.config.ts` from:

```ts
command: `.\\node_modules\\.bin\\next.cmd dev --hostname localhost -p ${port}`,
```

to:

```ts
command: `.\\node_modules\\.bin\\next.cmd dev --webpack --hostname localhost -p ${port}`,
```

Do not alter the `PLAYWRIGHT_BASE_URL` branch, runtime environment builder, port, or reuse behavior.

- [ ] **Step 3: Update the existing repository contract**

In `tests/unit/repository-contract.test.ts`, change only the expected values:

```ts
dev: "next dev --webpack",
build: "next build --webpack",
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```powershell
npm.cmd test -- tests/unit/worktree-webpack-contract.test.ts tests/unit/repository-contract.test.ts tests/unit/m2-browser-acceptance-contract.test.ts
```

Expected result: all focused contract tests pass.

- [ ] **Step 5: Commit the implementation**

```powershell
git add package.json playwright.config.ts tests/unit/repository-contract.test.ts tests/unit/worktree-webpack-contract.test.ts
git commit -m "fix: use webpack for worktree-safe next commands"
```

### Task 3: Verify the default workflow

**Files:**
- No source changes expected.
- Inspect: `docs/superpowers/specs/2026-08-05-worktree-webpack-workflow-design.md`

**Interfaces:**
- Consumes: the explicit command wiring from Task 2.
- Produces: evidence that the default commands, full test suite, build, and M6 browser acceptance remain green.

- [ ] **Step 1: Run static checks**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run audit:strings
```

Expected result: each command exits 0.

- [ ] **Step 2: Run the full Vitest suite**

Run:

```powershell
npm.cmd test
```

Expected result: all non-environment-gated tests pass; only the existing explicitly credential/database-gated tests may skip.

- [ ] **Step 3: Run the default production build**

Run:

```powershell
npm.cmd run build
```

Expected result: Next.js completes compilation, TypeScript, page-data collection, static generation, and route output without the Turbopack junction panic.

- [ ] **Step 4: Run the M6 browser acceptance through the managed server**

Run:

```powershell
npm.cmd run e2e -- tests/e2e/m6-launch-pad.spec.ts --reporter=line
```

Expected result: five deterministic M6 tests pass and the credential-gated live Preview smoke is explicitly skipped when its three variables are absent.

- [ ] **Step 5: Review the final diff and status**

Run:

```powershell
git diff --check
git status --short
git log -2 --oneline
```

Expected result: no whitespace errors; only the known pre-existing unstaged SDD/snapshot artifacts remain outside the implementation commit; the latest commit is the Webpack workflow fix.
