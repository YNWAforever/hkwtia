import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createTicketEmailOutboxRepository} from "@/lib/db/repos/ticket-email-outbox";
import type {Database} from "@/lib/db/repos/common";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-ticket-capacity-" + process.pid;
const orderId = "11111111-1111-4111-8111-222222222222";
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function ready(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL did not become ready");
}

function store() {
  if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
  return createTicketEmailOutboxRepository(async () => drizzle(pool!) as unknown as Database);
}

describe.skipIf(!enabled)("ticket email 500-notice recovery on disposable PostgreSQL", () => {
  const now = new Date();
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test",
      "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await ready();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query("CREATE TABLE event_orders (id uuid PRIMARY KEY)");
    await pool.query("CREATE TABLE event_order_seats (id uuid PRIMARY KEY, order_id uuid NOT NULL)");
    await pool.query("CREATE TABLE staff_tasks (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, profile_id text, journey_state_id uuid, kind text NOT NULL, dedupe_key text NOT NULL UNIQUE, summary_code text NOT NULL, context jsonb DEFAULT '{}'::jsonb NOT NULL, status text DEFAULT 'open' NOT NULL, resolved_at timestamptz, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL)");
    const migration = readFileSync("drizzle/0042_ticket_email_outbox.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    await pool.query("INSERT INTO event_orders (id) VALUES ($1)", [orderId]);
    await pool.query(
      "INSERT INTO ticket_email_outbox (order_id, kind, event_key, created_at, next_attempt_at) SELECT $1, 'confirmation', 'capacity:' || n::text, $2::timestamptz - interval '10 minutes', $2::timestamptz - interval '1 minute' FROM generate_series(1, 500) AS n",
      [orderId, now],
    );
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("reports the pending backlog and oldest age without recipient data", async () => {
    expect(await store().queueHealth(automationCronActor(), now)).toEqual({
      backlog: 500, oldestPendingAgeSeconds: 600,
    });
  });

  it("recovers a provider outage without duplicate sends at the current batch limit", async () => {
    const repo = store();
    const first = await repo.claimDue(automationCronActor(), now, 3);
    expect(first).toHaveLength(3);
    for (const claim of first) {
      const payload = {to: "test@example.test", from: "tickets@example.test", subject: "Test",
        html: "<p>Test</p>", text: "Test", headers: {}, idempotencyKey: claim.eventKey};
      expect(await repo.freezePayload(claim.id, claim.attemptCount, payload, now)).toBe(true);
      expect(await repo.markRetryable(claim.id, claim.attemptCount, now, "retryable_network")).toBe(true);
    }

    const accepted = new Set<string>();
    let ticks = 0;
    for (; ticks < 167; ticks += 1) {
      const tick = new Date(now.getTime() + (ticks + 3) * 60_000);
      const claims = await repo.claimDue(automationCronActor(), tick, 3);
      expect(claims.length).toBeLessThanOrEqual(3);
      for (const claim of claims) {
        expect(accepted.has(claim.eventKey)).toBe(false);
        const payload = claim.payload ?? {to: "test@example.test", from: "tickets@example.test",
          subject: "Test", html: "<p>Test</p>", text: "Test", headers: {},
          idempotencyKey: claim.eventKey};
        if (!claim.payload) {
          expect(await repo.freezePayload(claim.id, claim.attemptCount, payload, tick)).toBe(true);
        }
        // The synthetic provider accepts each idempotency key exactly once.
        accepted.add(claim.eventKey);
        expect(await repo.markSent(claim.id, claim.attemptCount, "mock:" + claim.eventKey)).toBe(true);
      }
    }
    expect(accepted.size).toBe(500);
    expect(ticks).toBe(167);
    expect(await repo.queueHealth(automationCronActor(), new Date(now.getTime() + 170 * 60_000)))
      .toEqual({backlog: 0, oldestPendingAgeSeconds: null});
    const settled = await pool!.query("SELECT count(*)::int AS count FROM ticket_email_outbox WHERE status = 'sent'");
    expect(settled.rows[0]?.count).toBe(500);
  }, 180_000);
});
