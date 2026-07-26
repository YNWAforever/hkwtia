import {execFileSync, spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-webhook-${process.pid}`;

function docker(args: string[], input?: string): string {
  return execFileSync("docker", args, {encoding: "utf8", input, timeout: 20_000, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"]});
}

function psql(sql: string): string {
  return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"], sql);
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch { await delay(100); }
  }
  throw new Error("isolated Postgres did not become ready");
}

describe.skipIf(!enabled)("webhook ordering on isolated Postgres", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
    await waitForPostgres();
    psql(`
      CREATE TABLE memberships (id text PRIMARY KEY, status text NOT NULL);
      CREATE TABLE audit_events (
        id bigserial PRIMARY KEY,
        target_id text NOT NULL,
        action text NOT NULL,
        request_id text NOT NULL,
        metadata jsonb NOT NULL
      );
      CREATE TABLE journey_state (
        profile_id text NOT NULL,
        journey text NOT NULL,
        instance_key text NOT NULL,
        step text NOT NULL,
        UNIQUE (profile_id, journey, instance_key, step)
      );
      INSERT INTO memberships VALUES ('membership-1', 'active');
    `);
  }, 30_000);

  afterAll(() => {
    try { docker(["rm", "-f", container]); } catch { /* Container may already be gone after a test failure. */ }
  });

  it("waits on the membership lock, then sees the winner audit in a fresh READ COMMITTED statement", async () => {
    const winnerSql = `
      BEGIN ISOLATION LEVEL READ COMMITTED;
      SELECT id FROM memberships WHERE id = 'membership-1' FOR UPDATE;
      \\echo LOCK_ACQUIRED
      SELECT pg_sleep(1.5);
      INSERT INTO audit_events (target_id, action, request_id, metadata)
      VALUES ('membership-1', 'stripe.webhook.processed', 'evt_z', '{"stripeCreated":100}');
      INSERT INTO journey_state (profile_id, journey, instance_key, step)
      VALUES ('profile-1', 'dunning', 'payment:evt_z', 'dunning_0')
      ON CONFLICT DO NOTHING;
      COMMIT;
    `;
    const winner = spawn("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    winner.stdout.setEncoding("utf8");
    winner.stderr.setEncoding("utf8");
    let winnerStdout = "";
    let winnerStderr = "";
    winner.stderr.on("data", (chunk: string) => { winnerStderr += chunk; });

    const winnerExitPromise = new Promise<{code: number | null; error?: Error}>((resolve) => {
      const timeout = setTimeout(() => {
        winner.kill();
        resolve({code: null, error: new Error("winner process timed out")});
      }, 10_000);
      winner.once("error", (error) => { clearTimeout(timeout); resolve({code: null, error}); });
      winner.once("exit", (code) => { clearTimeout(timeout); resolve({code}); });
    });
    const lockReadyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        winner.kill();
        reject(new Error(`winner lock marker timed out: ${winnerStderr}`));
      }, 5_000);
      const onData = (chunk: string) => {
        winnerStdout += chunk;
        if (winnerStdout.split(/\r?\n/).includes("LOCK_ACQUIRED")) {
          cleanup();
          resolve();
        }
      };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`winner exited before lock marker (${code}): ${winnerStderr}`));
      };
      function cleanup() {
        clearTimeout(timeout);
        winner.stdout.off("data", onData);
        winner.off("error", onError);
        winner.off("exit", onExit);
      }
      winner.stdout.on("data", onData);
      winner.once("error", onError);
      winner.once("exit", onExit);
    });

    winner.stdin.end(winnerSql);
    await lockReadyPromise;
    const started = Date.now();
    const waiterOutput = psql(`
      BEGIN ISOLATION LEVEL READ COMMITTED;
      SELECT id FROM memberships WHERE id = 'membership-1' FOR UPDATE;
      SELECT (metadata->>'stripeCreated') || ':' || request_id
      FROM audit_events
      WHERE target_id = 'membership-1'
        AND action IN ('stripe.webhook.processed', 'stripe.webhook.ignored_stale')
      ORDER BY (metadata->>'stripeCreated')::bigint DESC, request_id DESC
      LIMIT 1;
      SELECT journey || ':' || instance_key || ':' || step
      FROM journey_state
      WHERE profile_id = 'profile-1';
      ROLLBACK;
    `);
    const waitedMs = Date.now() - started;
    const winnerExit = await winnerExitPromise;

    expect(winnerExit.error).toBeUndefined();
    expect(winnerExit.code, winnerStderr).toBe(0);
    expect(winnerStdout).toContain("LOCK_ACQUIRED");
    expect(waitedMs).toBeGreaterThanOrEqual(900);
    expect(waiterOutput).toContain("100:evt_z");
    expect(waiterOutput).toContain("dunning:payment:evt_z:dunning_0");
  }, 20_000);
});
