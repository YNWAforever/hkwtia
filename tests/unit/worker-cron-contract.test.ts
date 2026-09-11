import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

/**
 * Phase C2 Task 10 Step 7. The Cloudflare Worker's two tables must agree, and
 * nothing in CI checked that they did.
 *
 * `.github/workflows/ci.yml` shards `npx vitest run` at the repository root and
 * never invokes the `workers/` package's own vitest, so every worker change has
 * been ungated. Meanwhile a trigger present in `wrangler.toml` but absent from
 * `JOBS_BY_CRON` throws `INVALID_CRON` inside `dueJobs`, which
 * `createAutomationWorker` catches and turns into one sanitized log line: the
 * cron fires on schedule, logs, and invokes nothing. For the send queue that
 * reads as an empty queue for ever.
 *
 * Set EQUALITY, not containment, in both directions: a map entry with no
 * trigger is a job that never runs, and a trigger with no map entry is the
 * silent throw above.
 *
 * Both tables are read as TEXT rather than imported. `workers/` is excluded from
 * the root `tsconfig.json` and depends on `@cloudflare/workers-types`, so an
 * import here would be a typecheck failure in the root project rather than a
 * contract test.
 */
const WRANGLER_PATH = "workers/wrangler.toml";
const WORKER_SOURCE_PATH = "workers/src/index.ts";

function cronsFromWrangler(source: string): string[] {
  const declaration = /^\s*crons\s*=\s*\[(.*?)\]/ms.exec(source);
  if (!declaration) throw new Error("WRANGLER_CRONS_NOT_FOUND");
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function objectLiteral(source: string, name: string): string {
  const opening = source.indexOf(`const ${name} = {`);
  if (opening < 0) throw new Error(`WORKER_TABLE_NOT_FOUND:${name}`);
  const closing = source.indexOf("\n}", opening);
  if (closing < 0) throw new Error(`WORKER_TABLE_UNTERMINATED:${name}`);
  return source.slice(opening, closing);
}

function quotedKeys(literal: string): string[] {
  return [...literal.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]);
}

describe("automation worker cron contract", () => {
  const wrangler = readFileSync(WRANGLER_PATH, "utf8");
  const workerSource = readFileSync(WORKER_SOURCE_PATH, "utf8");

  it("dispatches exactly the triggers wrangler.toml declares", () => {
    const declared = cronsFromWrangler(wrangler);
    const dispatched = quotedKeys(objectLiteral(workerSource, "JOBS_BY_CRON"));

    expect(declared.length).toBeGreaterThan(0);
    expect([...declared].sort()).toEqual([...dispatched].sort());
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("schedules the ten-minute WhatsApp send queue (S-12)", () => {
    expect(cronsFromWrangler(wrangler)).toContain("*/10 * * * *");
    expect(objectLiteral(workerSource, "JOBS_BY_CRON")).toContain("whatsapp-send-queue");
  });

  it("gives every dispatched job a request timeout", () => {
    // `REQUEST_TIMEOUT_BY_JOB` is `as const satisfies Record<WorkerJob, number>`,
    // so a missing entry is already a compile error inside the worker package —
    // which root CI never compiles. This is the same fact, checked where CI
    // actually looks.
    const jobs = new Set(
      [...objectLiteral(workerSource, "JOBS_BY_CRON").matchAll(/"([a-z][a-z0-9-]*)"/g)]
        .map((match) => match[1])
        .filter((value) => !value.includes(" ")),
    );
    const timeouts = new Set(quotedKeys(objectLiteral(workerSource, "REQUEST_TIMEOUT_BY_JOB")));
    for (const job of jobs) expect(timeouts).toContain(job);
  });

  // A guard nobody has seen fail is a guard nobody trusts. This is the shape
  // tests/unit/server-action-actor-boundary.test.ts established.
  it("detects the shapes it is meant to catch", () => {
    const hostileWrangler = 'crons = ["0 * * * *", "*/5 * * * *"]';
    const hostileSource = [
      'const JOBS_BY_CRON = {',
      '  "0 * * * *": BASE_JOBS,',
      '} as const satisfies Readonly<Record<string, readonly WorkerJob[]>>;',
    ].join("\n");

    expect([...cronsFromWrangler(hostileWrangler)].sort())
      .not.toEqual([...quotedKeys(objectLiteral(hostileSource, "JOBS_BY_CRON"))].sort());
  });
});
