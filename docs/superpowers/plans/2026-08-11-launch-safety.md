# Launch Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it safe to point `hkwtia.org` at this application — no fictional content publicly reachable, no routine command able to seed fixtures into a live database, and every legacy URL resolving.

**Architecture:** Three independent workstreams. (1) Capture the old site before it is switched off, because it is the only source for the redirect map and for sub-projects 2–4. (2) Consolidate the five hand-rolled seed guards into one module and put every fixture seed behind it, splitting the conflated `db:seed` command. (3) Inventory and remove synthetic rows from the live database with read-only tooling and a reversible first phase.

**Tech Stack:** TypeScript strict, Node 22 (`node --experimental-strip-types` / `tsx` for scripts), `pg` for script-side database access, Vitest, Next.js 16 `redirects()`.

---

## Context you need before starting

Read `docs/superpowers/specs/2026-08-11-launch-safety-design.md` first. Then know these facts about this repo:

- **Seeds are split between guarded and unguarded.** `assertM5SeedEnvironment` (`scripts/seed-m5.ts:81`) and `assertM6SeedEnvironment` (`scripts/seed-m6.ts:97`) each hand-roll an isolation guard. `scripts/seed-m1.ts`, `scripts/seed-m2.ts` and `scripts/seed-m3.ts` have none — M3 validates only `M3_SEED_NOW` and the presence of `DATABASE_URL`.
- **`npm run db:seed` is the unguarded one.** `scripts/db-seed.ts` calls `runM1Seed` then `runM2Seed`. M1 writes four real membership plan rows and is safe everywhere. M2 writes 30 `.example.test` profiles, 12 companies and four events.
- **Script tests mock the client.** See `tests/unit/m1-seed.test.ts` — they pass `{query: vi.fn()}` and assert on the recorded SQL. Follow that pattern; do not require a live database in unit tests.
- **`@/scripts/...` resolves in tests** via the `@` → repo-root alias in `vitest.config.ts`.
- **Public route allowlist lives in `config/public-routes.ts`** and is the single source of truth for what a redirect may target.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/acceptance-guard.ts` | **Create.** The one isolation guard. Flag check, production block, `DATABASE_URL`/`DATABASE_URL_TEST` match, optional host allowlist. |
| `scripts/seed-m5.ts` | **Modify.** Delegate `assertM5SeedEnvironment` to the shared guard; keep the exported name and error codes. |
| `scripts/seed-m6.ts` | **Modify.** Same, passing the host allowlist option. |
| `scripts/seed-m2.ts` | **Modify.** Add a guard call at the top of `runM2Seed`. |
| `scripts/seed-m3.ts` | **Modify.** Add a guard call before it opens a connection. |
| `scripts/db-seed.ts` | **Modify.** M1 only; stop swallowing the error. |
| `scripts/seed-demo.ts` | **Create.** The new guarded entry point for M2 fixtures. |
| `scripts/capture-legacy-site.ts` | **Create.** Fetch and persist `hkwtia.org` sitemaps and page bodies. |
| `scripts/audit-synthetic-content.ts` | **Create.** Read-only inventory; `--hide` and `--delete` phases behind explicit flags. |
| `content/legacy-urls.json` | **Create.** Committed classification of every legacy URL. |
| `next.config.ts` | **Modify.** Extend `redirects()` from the fixture. |

---

## Task 1: Capture hkwtia.org before it goes dark

This is first because the source is decaying — the site already returns intermittent Cloudflare 520s, and once the domain moves the mapping is unrecoverable. The output also feeds sub-projects 2–4.

**Files:**
- Create: `scripts/capture-legacy-site.ts`
- Create (output, git-ignored): `.legacy-capture/`
- Modify: `.gitignore`
- Test: `tests/unit/capture-legacy-site.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/capture-legacy-site.test.ts
import {describe, expect, it} from "vitest";

import {parseSitemapUrls, retryable} from "@/scripts/capture-legacy-site";

describe("legacy site capture", () => {
  it("extracts loc entries from a WordPress sitemap", () => {
    const xml = `<?xml version="1.0"?>
      <urlset><url><loc>https://hkwtia.org/about-us/</loc></url>
      <url><loc>https://hkwtia.org/2022/10/anniversary/</loc></url></urlset>`;

    expect(parseSitemapUrls(xml)).toEqual([
      "https://hkwtia.org/about-us/",
      "https://hkwtia.org/2022/10/anniversary/",
    ]);
  });

  it("ignores a sitemap index that lists no page urls", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });

  // The old site 520s intermittently, so a single failed fetch must not end the
  // capture — this is the whole reason the script exists rather than a curl loop.
  it("retries a failing fetch before giving up", async () => {
    let calls = 0;
    const result = await retryable(async () => {
      calls += 1;
      if (calls < 3) throw new Error("520");
      return "ok";
    }, {attempts: 3, delayMs: 0});

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("returns null rather than throwing when every attempt fails", async () => {
    const result = await retryable(async () => {
      throw new Error("520");
    }, {attempts: 2, delayMs: 0});

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/capture-legacy-site.test.ts`
Expected: FAIL — `Failed to resolve import "@/scripts/capture-legacy-site"`

- [ ] **Step 3: Write the implementation**

```ts
// scripts/capture-legacy-site.ts
import {mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";

const ORIGIN = "https://hkwtia.org";
const SITEMAPS = ["/post-sitemap.xml", "/page-sitemap.xml", "/sitemap_index.xml"];
const OUTPUT_DIR = ".legacy-capture";

export function parseSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(([, url]) => url);
}

/**
 * hkwtia.org returns intermittent Cloudflare 520s. A single failure must not
 * abandon the capture, and a permanent failure must not abort the whole run —
 * a partial inventory is still worth having, and the caller records the gap.
 */
export async function retryable<T>(
  operation: () => Promise<T>,
  {attempts, delayMs}: {attempts: number; delayMs: number},
): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch {
      if (attempt === attempts) return null;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

function slugify(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchText(url: string): Promise<string | null> {
  return retryable(async () => {
    const response = await fetch(url, {headers: {"user-agent": "wtia-migration-capture"}});
    if (!response.ok) throw new Error(`${response.status}`);
    return response.text();
  }, {attempts: 5, delayMs: 2_000});
}

async function main(): Promise<void> {
  await mkdir(join(OUTPUT_DIR, "pages"), {recursive: true});

  const urls = new Set<string>();
  for (const path of SITEMAPS) {
    const xml = await fetchText(`${ORIGIN}${path}`);
    if (!xml) {
      console.error(`MISSED sitemap ${path}`);
      continue;
    }
    await writeFile(join(OUTPUT_DIR, `${slugify(path)}.xml`), xml);
    for (const url of parseSitemapUrls(xml)) urls.add(url);
  }

  const missed: string[] = [];
  for (const url of urls) {
    if (url.endsWith(".xml")) continue;
    const body = await fetchText(url);
    if (!body) {
      missed.push(url);
      continue;
    }
    await writeFile(join(OUTPUT_DIR, "pages", `${slugify(url)}.html`), body);
  }

  await writeFile(
    join(OUTPUT_DIR, "inventory.json"),
    `${JSON.stringify({capturedUrls: [...urls].sort(), missed}, null, 2)}\n`,
  );
  console.log(`captured ${urls.size - missed.length}/${urls.size} urls; ${missed.length} missed`);
}

if (process.argv[1]?.endsWith("capture-legacy-site.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Legacy capture failed.");
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/capture-legacy-site.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Ignore the capture output**

Add to `.gitignore`:

```
.legacy-capture/
```

The raw HTML is bulk input, not source. The reviewed classification in Task 8 is what gets committed.

- [ ] **Step 6: Run the capture for real**

Run: `npx tsx scripts/capture-legacy-site.ts`
Expected: `captured N/N urls; 0 missed`. If any are missed, re-run — it is idempotent and only refetches everything. Do not proceed to Task 8 with a non-empty `missed` list.

- [ ] **Step 7: Commit**

```bash
git add scripts/capture-legacy-site.ts tests/unit/capture-legacy-site.test.ts .gitignore
git commit -m "feat: capture hkwtia.org before the domain moves"
```

---

## Task 2: Extract the shared acceptance guard

**Files:**
- Create: `scripts/lib/acceptance-guard.ts`
- Test: `tests/unit/acceptance-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/acceptance-guard.test.ts
import {describe, expect, it} from "vitest";

import {assertIsolatedSeedEnvironment} from "@/scripts/lib/acceptance-guard";

const prefix = "M5_ACCEPTANCE";
const valid = {
  M5_ACCEPTANCE_SEED: "true",
  DATABASE_URL: "postgres://db.test/wtia",
  DATABASE_URL_TEST: "postgres://db.test/wtia",
  NODE_ENV: "test",
} as const;

describe("isolated seed guard", () => {
  it("returns the database url when every condition holds", () => {
    expect(assertIsolatedSeedEnvironment(valid, {prefix, flag: "M5_ACCEPTANCE_SEED"}))
      .toBe("postgres://db.test/wtia");
  });

  it.each([
    ["SEED_NOT_AUTHORIZED", {...valid, M5_ACCEPTANCE_SEED: "false"}],
    ["PRODUCTION_FORBIDDEN", {...valid, NODE_ENV: "production"}],
    ["PRODUCTION_FORBIDDEN", {...valid, VERCEL_ENV: "production"}],
    ["DATABASE_URL_REQUIRED", {...valid, DATABASE_URL: ""}],
    ["DATABASE_URL_TEST_REQUIRED", {...valid, DATABASE_URL_TEST: ""}],
    ["DATABASE_URL_MISMATCH", {...valid, DATABASE_URL_TEST: "postgres://other.test/wtia"}],
  ])("throws %s", (code, environment) => {
    expect(() => assertIsolatedSeedEnvironment(environment, {prefix, flag: "M5_ACCEPTANCE_SEED"}))
      .toThrow(`${prefix}_${code}`);
  });

  it("enforces a host allowlist only when one is required", () => {
    const options = {
      prefix: "M6_ACCEPTANCE",
      flag: "M6_ACCEPTANCE_SEED",
      hostAllowlistVar: "M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
    };
    const base = {
      M6_ACCEPTANCE_SEED: "true",
      DATABASE_URL: "postgres://db.test/wtia",
      DATABASE_URL_TEST: "postgres://db.test/wtia",
      NODE_ENV: "test",
    };

    expect(() => assertIsolatedSeedEnvironment(base, options))
      .toThrow("M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST_REQUIRED");
    expect(() => assertIsolatedSeedEnvironment(
      {...base, M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: "elsewhere.test"}, options,
    )).toThrow("M6_ACCEPTANCE_DATABASE_HOST_NOT_ALLOWED");
    expect(assertIsolatedSeedEnvironment(
      {...base, M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST: "db.test"}, options,
    )).toBe("postgres://db.test/wtia");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/acceptance-guard.test.ts`
Expected: FAIL — cannot resolve `@/scripts/lib/acceptance-guard`

- [ ] **Step 3: Write the implementation**

```ts
// scripts/lib/acceptance-guard.ts

/**
 * The one isolation guard for fixture seeds.
 *
 * M5 and M6 each hand-rolled this, and M1, M2 and M3 never got one — which is
 * how `npm run db:seed`, the documented setup command, came to write 30
 * synthetic profiles into whatever `DATABASE_URL` pointed at. Copies are why
 * the gap existed, so new seeds call this rather than writing a sixth.
 *
 * Error codes stay prefixed per seed so existing runbooks and tests that match
 * on `M5_ACCEPTANCE_*` keep working after the refactor.
 */
export type IsolatedSeedOptions = Readonly<{
  prefix: string;
  flag: string;
  hostAllowlistVar?: string;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function assertIsolatedSeedEnvironment(
  environment: Environment,
  {prefix, flag, hostAllowlistVar}: IsolatedSeedOptions,
): string {
  const fail = (code: string): never => {
    throw new Error(`${prefix}_${code}`);
  };

  if (normalized(environment[flag]) !== "true") fail("SEED_NOT_AUTHORIZED");
  if (normalized(environment.VERCEL_ENV) === "production"
    || normalized(environment.NODE_ENV) === "production") {
    fail("PRODUCTION_FORBIDDEN");
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) fail("DATABASE_URL_REQUIRED");
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) fail("DATABASE_URL_TEST_REQUIRED");
  if (databaseUrl !== testDatabaseUrl) fail("DATABASE_URL_MISMATCH");

  if (hostAllowlistVar) {
    const allowlist = environment[hostAllowlistVar]
      ?.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean) ?? [];
    if (allowlist.length === 0) fail("DATABASE_HOST_ALLOWLIST_REQUIRED");
    // An allowlisted host is not proof of isolation — the operator still has to
    // confirm that. This only stops an unlisted host, which is the mistake a
    // tired person actually makes.
    const host = new URL(databaseUrl as string).hostname.toLowerCase();
    if (!allowlist.includes(host)) fail("DATABASE_HOST_NOT_ALLOWED");
  }

  return databaseUrl as string;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/acceptance-guard.test.ts`
Expected: PASS — 10 assertions across 4 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/acceptance-guard.ts tests/unit/acceptance-guard.test.ts
git commit -m "feat: extract the shared isolated-seed guard"
```

---

## Task 3: Move M5 and M6 onto the shared guard

Behaviour-preserving. The existing `tests/unit/m5-seed.test.ts` and `tests/unit/m6-seed.test.ts` are the regression check — they must pass unchanged.

**Files:**
- Modify: `scripts/seed-m5.ts` (the body of `assertM5SeedEnvironment`, line 81)
- Modify: `scripts/seed-m6.ts` (the body of `assertM6SeedEnvironment`, line 97)

- [ ] **Step 1: Record the current behaviour**

Run: `npx vitest run tests/unit/m5-seed.test.ts tests/unit/m6-seed.test.ts`
Expected: PASS. Note the counts — they must be identical after the refactor.

- [ ] **Step 2: Replace the M5 guard body**

In `scripts/seed-m5.ts`, keep the export and signature, replace the body:

```ts
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

export function assertM5SeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return assertIsolatedSeedEnvironment(environment, {
    prefix: "M5_ACCEPTANCE",
    flag: M5_ACCEPTANCE_SEED_ENV,
  });
}
```

- [ ] **Step 3: Replace the M6 guard body**

In `scripts/seed-m6.ts`, same shape plus the allowlist:

```ts
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

export function assertM6SeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return assertIsolatedSeedEnvironment(environment, {
    prefix: "M6_ACCEPTANCE",
    flag: M6_ACCEPTANCE_SEED_ENV,
    hostAllowlistVar: "M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST",
  });
}
```

- [ ] **Step 4: Verify no behaviour changed**

Run: `npx vitest run tests/unit/m5-seed.test.ts tests/unit/m6-seed.test.ts && npm run typecheck`
Expected: PASS with the same counts as Step 1.

If a test fails on an error-code string, the shared guard's code does not match the original — fix the guard, not the test. The original codes are the contract.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-m5.ts scripts/seed-m6.ts
git commit -m "refactor: route the M5 and M6 guards through the shared module"
```

---

## Task 4: Split `db:seed` and guard the M2 fixtures

**Files:**
- Modify: `scripts/db-seed.ts`
- Create: `scripts/seed-demo.ts`
- Modify: `scripts/seed-m2.ts` (`runM2Seed`, line 335)
- Modify: `package.json`
- Test: `tests/unit/db-seed-split.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/db-seed-split.test.ts
import {describe, expect, it, vi} from "vitest";

vi.mock("@/scripts/seed-m1", () => ({runM1Seed: vi.fn(async () => undefined)}));
vi.mock("@/scripts/seed-m2", () => ({runM2Seed: vi.fn(async () => undefined)}));

import {runM1Seed} from "@/scripts/seed-m1";
import {runM2Seed} from "@/scripts/seed-m2";
import {seedDatabase} from "@/scripts/db-seed";

describe("db:seed no longer carries fixtures", () => {
  // The whole defect: `npm run db:seed` is the documented setup command, and it
  // used to write 30 synthetic profiles into whatever DATABASE_URL pointed at.
  it("seeds the real plan rows and nothing else", async () => {
    await seedDatabase({DATABASE_URL: "postgres://db.test/wtia"} as NodeJS.ProcessEnv);

    expect(runM1Seed).toHaveBeenCalledOnce();
    expect(runM2Seed).not.toHaveBeenCalled();
  });

  it("reports why a seed failed instead of swallowing the cause", async () => {
    vi.mocked(runM1Seed).mockRejectedValueOnce(new Error("PLAN_UPSERT_CONFLICT"));

    await expect(seedDatabase({DATABASE_URL: "postgres://db.test/wtia"} as NodeJS.ProcessEnv))
      .rejects.toThrow("PLAN_UPSERT_CONFLICT");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/db-seed-split.test.ts`
Expected: FAIL — `expected "runM2Seed" to not be called`

- [ ] **Step 3: Rewrite `scripts/db-seed.ts`**

```ts
// scripts/db-seed.ts
import {runM1Seed} from "./seed-m1.ts";

/**
 * The M1 plan rows are real product configuration — every environment needs
 * them, including production. The M2 demo fixtures used to run here too, which
 * made the documented setup command a way to put 30 synthetic profiles into a
 * live database. They now live behind the guard in `scripts/seed-demo.ts`.
 */
export async function seedDatabase(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  await runM1Seed(environment);
}

if (process.argv[1]?.endsWith("db-seed.ts")) {
  seedDatabase().catch((error: unknown) => {
    // Previously this printed a fixed string and discarded the cause, which
    // turned a partial seed into a mystery.
    console.error(error instanceof Error ? error.message : "Database seed failed.");
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Create the guarded demo entry point**

```ts
// scripts/seed-demo.ts
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";
import {runM2Seed} from "./seed-m2.ts";

export const DEMO_SEED_ENV = "DEMO_ACCEPTANCE_SEED";

export async function seedDemoData(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  assertIsolatedSeedEnvironment(environment, {
    prefix: "DEMO_ACCEPTANCE",
    flag: DEMO_SEED_ENV,
  });
  await runM2Seed(environment);
}

if (process.argv[1]?.endsWith("seed-demo.ts")) {
  seedDemoData().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Guard `runM2Seed` itself**

Anyone can still run `npm run db:seed:m2` directly, so the guard belongs on the function too, not only the new wrapper. At the top of `runM2Seed` in `scripts/seed-m2.ts`:

```ts
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

export async function runM2Seed(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  assertIsolatedSeedEnvironment(environment, {
    prefix: "DEMO_ACCEPTANCE",
    flag: "DEMO_ACCEPTANCE_SEED",
  });
  // ...existing body unchanged
}
```

- [ ] **Step 6: Update `package.json` scripts**

Replace the `db:seed:m2` line and add the demo entry:

```json
"db:seed:demo": "node --experimental-strip-types scripts/seed-demo.ts",
"db:seed:m2": "node --experimental-strip-types scripts/seed-m2.ts",
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/unit/db-seed-split.test.ts tests/unit/m1-seed.test.ts tests/unit/m2-seed.test.ts`
Expected: PASS. If `m2-seed.test.ts` fails because it calls `runM2Seed` without the flag, add the four guard variables to that test's environment — the guard is the new contract.

- [ ] **Step 8: Commit**

```bash
git add scripts/db-seed.ts scripts/seed-demo.ts scripts/seed-m2.ts package.json tests/unit/db-seed-split.test.ts
git commit -m "fix: stop db:seed writing demo fixtures to a live database"
```

---

## Task 5: Guard the M3 seed

M3 validates `M3_SEED_NOW` and requires `DATABASE_URL`, but has no isolation guard — the same hole as M2.

**Files:**
- Modify: `scripts/seed-m3.ts` (the entry that throws `"DATABASE_URL is required to seed M3 fixtures."`, around line 1010)
- Test: `tests/unit/m3-seed.test.ts`

- [ ] **Step 1: Add the failing test to `tests/unit/m3-seed.test.ts`**

```ts
it("refuses to run without explicit isolation authorization", async () => {
  const {runM3Seed} = await import("@/scripts/seed-m3");

  await expect(runM3Seed({
    DATABASE_URL: "postgres://live.example/wtia",
    M3_SEED_NOW: "2026-07-21T00:00:00Z",
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv)).rejects.toThrow("M3_ACCEPTANCE_SEED_NOT_AUTHORIZED");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/m3-seed.test.ts`
Expected: FAIL — resolves or throws a different error.

- [ ] **Step 3: Add the guard**

In `scripts/seed-m3.ts`, before the `DATABASE_URL` check:

```ts
import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

// ...at the top of the exported run function:
assertIsolatedSeedEnvironment(environment, {
  prefix: "M3_ACCEPTANCE",
  flag: "M3_ACCEPTANCE_SEED",
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/m3-seed.test.ts`
Expected: PASS

- [ ] **Step 5: Document the new variable**

Add to `.env.example`, under the M3 block:

```
# M3 fixtures are isolated-only, like M5 and M6
M3_ACCEPTANCE_SEED=
DEMO_ACCEPTANCE_SEED=
```

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-m3.ts tests/unit/m3-seed.test.ts .env.example
git commit -m "fix: put the M3 fixture seed behind the isolation guard"
```

---

## Task 6: Pin the invariant so the next seed cannot repeat this

**Files:**
- Test: `tests/unit/seed-guard-boundary.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/unit/seed-guard-boundary.test.ts
import {readFileSync, readdirSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * A discovery test, in the style of the "use server" boundary test: it finds
 * the files itself, so a seed added later is covered without anyone
 * remembering to list it here.
 *
 * M1 is the sole exemption — its four membership plan rows are real product
 * configuration that production needs, and it writes no synthetic identity.
 */
const UNGUARDED_BY_DESIGN = new Set(["seed-m1.ts"]);

describe("every fixture seed is isolation-guarded", () => {
  const seeds = readdirSync(resolve("scripts"))
    .filter((name) => /^seed-m\d/.test(name) && name.endsWith(".ts"));

  it("finds the seed scripts", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(6);
  });

  it.each(seeds.filter((name) => !UNGUARDED_BY_DESIGN.has(name)))(
    "%s routes through the shared guard",
    (name) => {
      const source = readFileSync(resolve("scripts", name), "utf8");
      expect(source).toContain("assertIsolatedSeedEnvironment");
    },
  );

  it("db:seed pulls in no fixture seed", () => {
    const source = readFileSync(resolve("scripts/db-seed.ts"), "utf8");
    expect(source).toContain("seed-m1");
    expect(source).not.toMatch(/seed-m[2-9]/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/seed-guard-boundary.test.ts`
Expected: PASS. Any failure names a seed still missing the guard — add it, following Task 5.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/seed-guard-boundary.test.ts
git commit -m "test: pin that every fixture seed is isolation-guarded"
```

---

## Task 7: Inventory the synthetic rows already in the database

Read-only. Produces the artifact a human reviews before anything is removed.

**Files:**
- Create: `scripts/audit-synthetic-content.ts`
- Test: `tests/unit/audit-synthetic-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/audit-synthetic-content.test.ts
import {describe, expect, it, vi} from "vitest";

import {SYNTHETIC_MARKERS, collectInventory, hideStatements} from "@/scripts/audit-synthetic-content";

describe("synthetic content inventory", () => {
  it("declares every marker explicitly rather than guessing", () => {
    expect(SYNTHETIC_MARKERS.map(({id}) => id).sort()).toEqual([
      "example-test-email",
      "m5-showcase-scope",
      "m6-launch-pad-scope",
    ]);
  });

  it("runs one read-only query per marker and returns what matched", async () => {
    const query = vi.fn(async (text: string) => {
      if (text.includes("profiles")) return {rows: [{id: "p1", marker_value: "a@m2.example.test"}]};
      return {rows: []};
    });

    const inventory = await collectInventory({query});

    expect(query).toHaveBeenCalledTimes(SYNTHETIC_MARKERS.length);
    expect(query.mock.calls.every(([text]) => text.trim().startsWith("SELECT"))).toBe(true);
    expect(inventory).toEqual([
      {marker: "example-test-email", table: "profiles", id: "p1", value: "a@m2.example.test"},
    ]);
  });

  // Phase A must be reversible, so it changes visibility flags and never deletes.
  it("hides by flipping publication state, never by deleting", () => {
    const statements = hideStatements([
      {marker: "m5-showcase-scope", table: "showcase_listings", id: "s1", value: "m5-showcase-acceptance-v1"},
    ]);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toContain("UPDATE");
    expect(statements[0]?.text).not.toMatch(/DELETE|TRUNCATE|DROP/i);
    expect(statements[0]?.values).toEqual(["s1"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/audit-synthetic-content.test.ts`
Expected: FAIL — cannot resolve the module

- [ ] **Step 3: Write the implementation**

```ts
// scripts/audit-synthetic-content.ts

/**
 * Read-only by default. It cannot see the production database from CI, so this
 * is tooling an operator runs, and the inventory it prints is the artifact a
 * human reviews before Phase A or Phase B touches anything.
 *
 * Markers are enumerated, never inferred. A real member could in principle
 * carry one, which is why hiding comes first and is reversible.
 */
export type SyntheticMarker = Readonly<{
  id: string;
  table: string;
  select: string;
  hide: string;
  delete: string;
}>;

export type InventoryRow = Readonly<{
  marker: string; table: string; id: string; value: string;
}>;

type Queryable = {
  query: (text: string, values?: readonly unknown[]) => Promise<{rows?: readonly Record<string, unknown>[]}>;
};

export const SYNTHETIC_MARKERS: readonly SyntheticMarker[] = [
  {
    id: "example-test-email",
    table: "profiles",
    select: `SELECT id, email AS marker_value FROM profiles WHERE email LIKE '%.example.test' ORDER BY id`,
    hide: `UPDATE profiles SET marketing_consent = false WHERE id = $1`,
    delete: `DELETE FROM profiles WHERE id = $1`,
  },
  {
    id: "m5-showcase-scope",
    table: "showcase_listings",
    select: `SELECT id, acceptance_scope AS marker_value FROM showcase_listings WHERE acceptance_scope = 'm5-showcase-acceptance-v1' ORDER BY id`,
    hide: `UPDATE showcase_listings SET status = 'draft' WHERE id = $1`,
    delete: `DELETE FROM showcase_listings WHERE id = $1`,
  },
  {
    id: "m6-launch-pad-scope",
    table: "cohorts",
    select: `SELECT id, acceptance_scope AS marker_value FROM cohorts WHERE acceptance_scope = 'm6-launch-pad-acceptance-v1' ORDER BY id`,
    hide: `UPDATE cohorts SET status = 'draft' WHERE id = $1`,
    delete: `DELETE FROM cohorts WHERE id = $1`,
  },
];

export async function collectInventory(connection: Queryable): Promise<InventoryRow[]> {
  const inventory: InventoryRow[] = [];
  for (const marker of SYNTHETIC_MARKERS) {
    const result = await connection.query(marker.select);
    for (const row of result.rows ?? []) {
      inventory.push({
        marker: marker.id,
        table: marker.table,
        id: String(row.id),
        value: String(row.marker_value ?? ""),
      });
    }
  }
  return inventory;
}

function statementsFor(
  inventory: readonly InventoryRow[],
  pick: (marker: SyntheticMarker) => string,
): {text: string; values: unknown[]}[] {
  return inventory.flatMap((row) => {
    const marker = SYNTHETIC_MARKERS.find(({id}) => id === row.marker);
    return marker ? [{text: pick(marker), values: [row.id]}] : [];
  });
}

export function hideStatements(inventory: readonly InventoryRow[]) {
  return statementsFor(inventory, (marker) => marker.hide);
}

export function deleteStatements(inventory: readonly InventoryRow[]) {
  return statementsFor(inventory, (marker) => marker.delete);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/audit-synthetic-content.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Add the CLI the runbook calls**

Append to `scripts/audit-synthetic-content.ts`:

```ts
async function main(): Promise<void> {
  const {Pool} = await import("pg");
  const mode = process.argv.includes("--delete")
    ? "delete"
    : process.argv.includes("--hide") ? "hide" : "inventory";

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const pool = new Pool({connectionString});
  try {
    const inventory = await collectInventory(pool);
    for (const row of inventory) {
      console.log(`${row.marker}\t${row.table}\t${row.id}\t${row.value}`);
    }
    console.log(`\n${inventory.length} synthetic rows`);
    if (mode === "inventory") return;

    // Deleting is the only irreversible step here, so it asks for the count
    // back rather than trusting a flag alone.
    if (mode === "delete" && process.env.CONFIRM_DELETE_COUNT !== String(inventory.length)) {
      throw new Error(
        `Set CONFIRM_DELETE_COUNT=${inventory.length} to confirm deletion of exactly these rows.`,
      );
    }

    const statements = mode === "hide" ? hideStatements(inventory) : deleteStatements(inventory);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const {text, values} of statements) await client.query(text, values);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log(`${mode}: ${statements.length} rows`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("audit-synthetic-content.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Synthetic content audit failed.");
    process.exitCode = 1;
  });
}
```

Default is inventory-only: running it with no flag can never mutate. `--delete` additionally requires `CONFIRM_DELETE_COUNT` to equal the row count the inventory just reported, so a stale command cannot delete a set that has since changed.

- [ ] **Step 6: Reconcile the marker SQL against the real schema**

The column names above are asserted, not verified — `acceptance_scope` may not be what the M5/M6 seeds actually write. Check before running against anything real:

```bash
grep -n "acceptance" lib/db/schema-core.ts
grep -n "m5-showcase-acceptance-v1" scripts/seed-m5.ts
grep -n "m6-launch-pad-acceptance-v1" scripts/seed-m6.ts
```

Correct `SYNTHETIC_MARKERS` to match, and add a marker for the M2 companies and events if they carry no `.example.test` email. **Do not proceed until every marker maps to a real column.**

- [ ] **Step 7: Commit**

```bash
git add scripts/audit-synthetic-content.ts tests/unit/audit-synthetic-content.test.ts
git commit -m "feat: read-only inventory of synthetic rows"
```

---

## Task 8: Classify every legacy URL

**Files:**
- Create: `content/legacy-urls.json`
- Test: `tests/unit/legacy-urls.test.ts`

- [ ] **Step 1: Build the fixture from the capture**

Using `.legacy-capture/inventory.json` from Task 1, write `content/legacy-urls.json`. Every captured URL gets exactly one entry:

```json
{
  "entries": [
    {"from": "/about-us/", "to": "/about", "kind": "equivalent"},
    {"from": "/chairmans-message/", "to": "/about/chairman", "kind": "equivalent"},
    {"from": "/executive-committee/", "to": "/about/committees", "kind": "equivalent"},
    {"from": "/honorary-chairman/", "to": "/about/committees", "kind": "equivalent"},
    {"from": "/core-focus-groups/", "to": "/about/committees", "kind": "equivalent"},
    {"from": "/certified-courses/", "to": "/programs/cpai", "kind": "equivalent"},
    {"from": "/contact-us/", "to": "/contact", "kind": "equivalent"},
    {"from": "/become-a-member/", "to": "/membership", "kind": "equivalent"},
    {"from": "/news/", "to": "/news", "kind": "equivalent"},
    {"from": "/media-coverage-press-release/", "to": "/news", "kind": "equivalent"},
    {"from": "/photo-gallery/", "to": "/about", "kind": "section-fallback"},
    {"from": "/constitution/", "to": "/about", "kind": "gone"}
  ]
}
```

`kind` is `equivalent` (real counterpart), `section-fallback` (destination exists but is not the item itself), or `gone` (not migrating; still redirected so it does not 404).

- [ ] **Step 2: Write the test**

```ts
// tests/unit/legacy-urls.test.ts
import {describe, expect, it} from "vitest";

import legacyUrls from "@/content/legacy-urls.json";
import {publicRoutes} from "@/config/public-routes";

const allowed = new Set<string>(publicRoutes);

describe("legacy url map", () => {
  it("declares a destination for every entry", () => {
    for (const entry of legacyUrls.entries) {
      expect(entry.from, JSON.stringify(entry)).toMatch(/^\//);
      expect(entry.to, entry.from).toMatch(/^\//);
      expect(["equivalent", "section-fallback", "gone"]).toContain(entry.kind);
    }
  });

  // A redirect to a route that does not exist trades a 404 for a slower 404.
  it("never points at a route outside the public allowlist", () => {
    for (const entry of legacyUrls.entries) {
      expect(allowed.has(entry.to), `${entry.from} -> ${entry.to}`).toBe(true);
    }
  });

  it("has no duplicate sources", () => {
    const sources = legacyUrls.entries.map(({from}) => from);
    expect(new Set(sources).size).toBe(sources.length);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run tests/unit/legacy-urls.test.ts`
Expected: PASS. A failure on the allowlist test means the destination is not a real route — fix the fixture, not the test.

- [ ] **Step 4: Commit**

```bash
git add content/legacy-urls.json tests/unit/legacy-urls.test.ts
git commit -m "feat: classify legacy hkwtia.org urls"
```

---

## Task 9: Serve the redirects

**Files:**
- Modify: `next.config.ts` (the `redirects()` block, lines 66-74)
- Test: `tests/unit/redirects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/redirects.test.ts
import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import legacyUrls from "@/content/legacy-urls.json";

describe("legacy redirects", () => {
  it("serves every classified legacy url", async () => {
    const redirects = await nextConfig.redirects?.() ?? [];
    const sources = new Set(redirects.map(({source}) => source));

    for (const entry of legacyUrls.entries) {
      expect(sources.has(entry.from), entry.from).toBe(true);
    }
  });

  it("keeps the four pre-existing redirects", async () => {
    const redirects = await nextConfig.redirects?.() ?? [];
    const sources = redirects.map(({source}) => source);

    expect(sources).toEqual(expect.arrayContaining([
      "/projects", "/history", "/members", "/members/:id",
    ]));
  });

  it("makes legacy redirects permanent so link equity transfers", async () => {
    const redirects = await nextConfig.redirects?.() ?? [];
    const legacy = new Set(legacyUrls.entries.map(({from}) => from));

    for (const redirect of redirects.filter(({source}) => legacy.has(source))) {
      expect(redirect.permanent, redirect.source).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/redirects.test.ts`
Expected: FAIL — the legacy sources are absent

- [ ] **Step 3: Extend `redirects()` in `next.config.ts`**

```ts
import legacyUrls from "./content/legacy-urls.json";

// ...inside nextConfig:
  async redirects() {
    return [
      {source: "/projects", destination: "/programs/asa", permanent: true},
      {source: "/history", destination: "/about", permanent: true},
      {source: "/members", destination: "/showcase", permanent: false},
      {source: "/members/:id", destination: "/showcase", permanent: false},
      // hkwtia.org is being switched off and its domain points here. Twenty-five
      // years of citations — government, 明報, RTHK, search — resolve through
      // these. Permanent, so the link equity transfers rather than being spent
      // on a redirect chain. Sources are classified in content/legacy-urls.json
      // and pinned by tests/unit/legacy-urls.test.ts.
      ...legacyUrls.entries.map(({from, to}) => ({
        source: from,
        destination: to,
        permanent: true,
      })),
    ];
  },
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run tests/unit/redirects.test.ts tests/unit/legacy-urls.test.ts && npm run build`
Expected: PASS, and the build compiles. `resolveJsonModule` is already enabled in `tsconfig.json`, so the JSON import type-checks.

- [ ] **Step 5: Full gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/unit/redirects.test.ts
git commit -m "feat: redirect legacy hkwtia.org urls to their new homes"
```

---

## Operator runbook — run after the code lands

Not code. These are the live-database steps, in order, each gated on the previous.

- [ ] **1. Inventory.** With `DATABASE_URL` pointing at the live database:
  `npx tsx scripts/audit-synthetic-content.ts`
  Save the output alongside `docs/m6-acceptance.md` as the launch record.
- [ ] **2. Review it by hand.** Confirm every listed row is genuinely synthetic. Any row you cannot account for stops the process.
- [ ] **3. Phase A — hide.** Re-run with `--hide`. Then load `/showcase`, `/news`, `/events` and `/launchpad` in both locales and confirm nothing fictional appears.
- [ ] **4. Wait.** Leave Phase A in place long enough to notice a mistake — at least one working day.
- [ ] **5. Phase B — delete.** Re-run with `--delete`. Re-run the inventory afterwards; it must return nothing.
- [ ] **6. Only then, move DNS.** Both redirect passes must be deployed first — see the sequencing note below.

---

## Sequencing constraint

Milestone-post redirects have no destination until sub-project 2 builds `/about/history`. This plan ships the pages-and-programmes pass. The post URLs get a second pass once that route exists, and **both must be live before DNS moves.** Moving the domain with only the first pass deployed 404s roughly 45 historical URLs — the exact ones the press coverage cites.

---

## Self-review notes

- **Spec coverage.** §1 seed isolation → Tasks 2–6. §2 purge → Task 7 plus the runbook. §3 redirects → Tasks 1, 8, 9. The spec's "capture before it goes dark" is Task 1, ordered first as the spec requires.
- **Known gap, deliberately left to the implementer.** Task 7 Step 5 exists because the marker column names are inferred from the seed scope keys rather than read from `lib/db/schema-core.ts`. That step must be completed before the script touches real data.
- **Spec correction.** The spec says "M3, M5 and M6 each hand-roll their own guard." M3 in fact has no isolation guard — it validates only `M3_SEED_NOW` and the presence of `DATABASE_URL`. Task 5 closes that. Update the spec when this lands.
