import {execFileSync, spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-webhook-${process.pid}`;

function docker(args: string[], input?: string): string {
  return execFileSync("docker", args, {encoding: "utf8", input, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"]});
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
      SELECT pg_sleep(1.5);
      INSERT INTO audit_events (target_id, action, request_id, metadata)
      VALUES ('membership-1', 'stripe.webhook.processed', 'evt_z', '{"stripeCreated":100}');
      COMMIT;
    `;
    const winner = spawn("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    winner.stdin.end(winnerSql);

    await delay(250);
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
      ROLLBACK;
    `);
    const waitedMs = Date.now() - started;
    const winnerExit = await new Promise<number | null>((resolve, reject) => {
      winner.once("error", reject);
      winner.once("exit", resolve);
    });

    expect(winnerExit).toBe(0);
    expect(waitedMs).toBeGreaterThanOrEqual(900);
    expect(waiterOutput).toContain("100:evt_z");
  }, 20_000);
});
