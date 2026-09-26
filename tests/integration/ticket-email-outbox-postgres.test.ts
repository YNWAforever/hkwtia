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
const container = "hkwtia-ticket-email-outbox-" + process.pid;
const orderId = "11111111-1111-4111-8111-111111111111";
const seatId = "22222222-2222-4222-8222-222222222222";
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function ready(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL did not become ready");
}

function store() {
  if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
  return createTicketEmailOutboxRepository(async () => drizzle(pool!) as unknown as Database);
}

describe.skipIf(!enabled)("ticket email outbox on disposable PostgreSQL", () => {
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
    await pool.query("INSERT INTO event_order_seats (id, order_id) VALUES ($1, $2)", [seatId, orderId]);
    await pool.query("INSERT INTO ticket_email_outbox (order_id, seat_id, kind, event_key, next_attempt_at) VALUES ($1, NULL, 'confirmation', 'ticket-confirmation:one', now() - interval '1 minute'), ($1, $2, 'pass', 'ticket-pass:one', now() - interval '1 minute')", [orderId, seatId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("claims separate notices concurrently and fences a stale settlement", async () => {
    const repo = store();
    const now = new Date();
    const [left, right] = await Promise.all([
      repo.claimDue(automationCronActor(), now, 1),
      repo.claimDue(automationCronActor(), now, 1),
    ]);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0]?.id).not.toBe(right[0]?.id);
    expect(await repo.claimDue(automationCronActor(), now, 1)).toEqual([]);
    const receipt = [...left, ...right].find((claim) => claim.kind === "confirmation");
    if (!receipt) throw new Error("receipt claim missing");
    const payload = {to: "ada@example.test", from: "tickets@example.test",
      subject: "Receipt", html: "<p>Receipt</p>", text: "Receipt", headers: {},
      idempotencyKey: receipt.eventKey};
    expect(await repo.freezePayload(receipt.id, receipt.attemptCount, payload, now)).toBe(true);
    expect(await repo.markRetryable(receipt.id, receipt.attemptCount, now, "retryable_network")).toBe(true);
    const later = new Date(now.getTime() + 11 * 60_000);
    const retried = await repo.claimDue(automationCronActor(), later, 2);
    const retriedReceipt = retried.find((claim) => claim.id === receipt.id);
    expect(retriedReceipt).toMatchObject({id: receipt.id, payload, eventKey: receipt.eventKey});
    expect(await repo.markSent(receipt.id, receipt.attemptCount, "stale")).toBe(false);
    expect(await repo.markSent(receipt.id, retriedReceipt!.attemptCount, "provider-1")).toBe(true);
  });

  it("keeps a day-old unverified refund queued and opens one staff task", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    await pool.query("INSERT INTO ticket_email_outbox (order_id, kind, event_key, created_at, next_attempt_at) VALUES ($1, 'refund', 'ticket-refund:pending', now() - interval '25 hours', now() - interval '1 minute')", [orderId]);
    const repo = store();
    const claims = await repo.claimDue(automationCronActor(), new Date(), 3);
    expect(claims.some((claim) => claim.eventKey === "ticket-refund:pending")).toBe(true);
    const tasks = await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE summary_code = 'ticket_refund_provider_pending'");
    expect(tasks.rows[0]?.count).toBe(1);
    await repo.claimDue(automationCronActor(), new Date(), 3);
    const repeated = await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE summary_code = 'ticket_refund_provider_pending'");
    expect(repeated.rows[0]?.count).toBe(1);
    const pending = claims.find((claim) => claim.eventKey === "ticket-refund:pending");
    if (!pending) throw new Error("pending refund claim missing");
    const payload = {to: "ada@example.test", from: "tickets@example.test", subject: "Refund",
      html: "<p>Refund</p>", text: "Refund", headers: {}, idempotencyKey: pending.eventKey};
    expect(await repo.freezePayload(pending.id, pending.attemptCount, payload, new Date())).toBe(true);
    expect(await repo.markSent(pending.id, pending.attemptCount, "provider-refund")).toBe(true);
    const resolved = await pool.query("SELECT status FROM staff_tasks WHERE summary_code = 'ticket_refund_provider_pending'");
    expect(resolved.rows).toEqual([{status: "resolved"}]);
  });

  it("resolves a pending-provider task when a stale refund notice is suppressed", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    await pool.query("INSERT INTO ticket_email_outbox (order_id, kind, event_key, created_at, next_attempt_at) VALUES ($1, 'refund', 'ticket-refund:suppressed', now() - interval '25 hours', now() - interval '1 minute')", [orderId]);
    const repo = store();
    const claim = (await repo.claimDue(automationCronActor(), new Date(), 3)).find((row) => row.eventKey === "ticket-refund:suppressed");
    if (!claim) throw new Error("stale refund claim missing");
    expect(await repo.markSuppressed(claim.id, claim.attemptCount, new Date())).toBe(true);
    const task = await pool.query("SELECT status FROM staff_tasks WHERE dedupe_key = $1", ["ticket-email-provider-pending:" + claim.id]);
    expect(task.rows).toEqual([{status: "resolved"}]);
  });
  it("replaces a pending-provider task when a refund notice becomes blocked", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    await pool.query("INSERT INTO ticket_email_outbox (order_id, kind, event_key, created_at, next_attempt_at) VALUES ($1, 'refund', 'ticket-refund:blocked', now() - interval '25 hours', now() - interval '1 minute')", [orderId]);
    const repo = store();
    const claim = (await repo.claimDue(automationCronActor(), new Date(), 3)).find((row) => row.eventKey === "ticket-refund:blocked");
    if (!claim) throw new Error("blocked refund claim missing");
    expect(await repo.markBlocked(claim.id, claim.attemptCount, new Date(), "order_missing")).toBe(true);
    const tasks = await pool.query("SELECT summary_code, status FROM staff_tasks WHERE dedupe_key IN ($1, $2) ORDER BY summary_code", [
      "ticket-email-provider-pending:" + claim.id, "ticket-email:" + claim.id,
    ]);
    expect(tasks.rows).toEqual([
      {summary_code: "ticket_email_blocked", status: "open"},
      {summary_code: "ticket_refund_provider_pending", status: "resolved"},
    ]);
  });
  it("closes a pending-provider task when the safe provider retry window expires", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const inserted = await pool.query("INSERT INTO ticket_email_outbox (order_id, kind, event_key, first_attempt_at, created_at, next_attempt_at) VALUES ($1, 'refund', 'ticket-refund:expired', now() - interval '24 hours', now() - interval '26 hours', now() - interval '1 minute') RETURNING id", [orderId]);
    const id = String(inserted.rows[0]?.id);
    await pool.query("INSERT INTO staff_tasks (profile_id, journey_state_id, kind, dedupe_key, summary_code) VALUES (NULL, NULL, 'ticket_email', $1, 'ticket_refund_provider_pending')", ["ticket-email-provider-pending:" + id]);
    await store().claimDue(automationCronActor(), new Date(), 3);
    const outbox = await pool.query("SELECT status FROM ticket_email_outbox WHERE id = $1", [id]);
    expect(outbox.rows).toEqual([{status: "uncertain"}]);
    const tasks = await pool.query("SELECT summary_code, status FROM staff_tasks WHERE dedupe_key IN ($1, $2) ORDER BY summary_code", [
      "ticket-email-provider-pending:" + id, "ticket-email:" + id,
    ]);
    expect(tasks.rows).toEqual([
      {summary_code: "ticket_email_uncertain", status: "open"},
      {summary_code: "ticket_refund_provider_pending", status: "resolved"},
    ]);
  });
});
