import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/repos/common")>(), getDb: async () => database.current,
}));
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {refundOrder} from "@/lib/tickets/refund-core";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-refund-actor-${process.pid}`;
const staff = {kind: "staff", userId: "neon-auth-id", profileId: "application-profile-id"} as const;
let pool: Pool | undefined;
function docker(args: string[]): string {return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});}

describe.skipIf(!enabled)("refund audit identity on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {docker(["exec", container, "pg_isready", "-U", "postgres"]); ready = true; break;} catch {await delay(100);}
    }
    if (!ready) throw new Error("disposable PostgreSQL unavailable");
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    database.current = drizzle(pool);
    await pool.query(`CREATE TYPE event_refund_reason AS ENUM ('oversold', 'staff', 'cancelled');
      CREATE TABLE profiles (id text PRIMARY KEY);
      CREATE TABLE event_orders (id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text,
        buyer_name text NOT NULL, buyer_email text NOT NULL, buyer_locale text NOT NULL, amount_hkd_cents integer NOT NULL,
        currency text NOT NULL, status text NOT NULL, stripe_checkout_session_id text, stripe_checkout_url text,
        idempotency_key text NOT NULL, expires_at timestamptz NOT NULL, paid_at timestamptz,
        refunded_at timestamptz, refund_reason event_refund_reason, updated_at timestamptz DEFAULT now());
      CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text REFERENCES profiles(id),
        actor_type text NOT NULL, action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, metadata jsonb NOT NULL);
      CREATE TABLE ticket_email_outbox (order_id uuid REFERENCES event_orders(id), seat_id uuid, kind text NOT NULL, event_key text UNIQUE NOT NULL);`);
    await pool.query("INSERT INTO profiles(id) VALUES ($1)", [staff.profileId]);
  }, 60_000);
  afterAll(async () => {try {await pool?.end();} finally {try {docker(["rm", "-f", container]);} catch { /* Setup may fail. */ }}});

  it.each(["paid", "refund_failed"])("commits %s using the application profile and retains exactly one audit/notice", async (status) => {
    if (!pool) throw new Error("pool missing");
    const orderId = randomUUID();
    await pool.query(`INSERT INTO event_orders(id,event_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,currency,status,stripe_checkout_session_id,idempotency_key,expires_at,paid_at)
      VALUES($1,$2,'Synthetic Buyer','buyer@example.test','en',7500,'hkd',$3,'cs_test_fixture',$4,now(),now())`, [orderId,randomUUID(),status,randomUUID()]);
    const refundPaymentIntent = vi.fn(async () => undefined);
    const sendRefundEmail = vi.fn(async () => undefined);
    const dependencies = {orders: eventOrdersRepository, stripe: {
      paymentIntentForSession: async () => "pi_test_fixture", refundPaymentIntent,
      fullyRefundedPaymentIntent: async () => status === "refund_failed",
    }, sendRefundEmail, now: () => new Date("2026-09-27T12:00:00Z")};
    await expect(refundOrder(staff, {orderId}, dependencies)).resolves.toEqual({status: "refunded"});
    await expect(refundOrder(staff, {orderId}, dependencies)).resolves.toEqual({status: "already_refunded"});
    expect(refundPaymentIntent).toHaveBeenCalledTimes(status === "paid" ? 1 : 0);
    expect(sendRefundEmail).toHaveBeenCalledTimes(1);
    const audit = await pool.query("SELECT actor_user_id,actor_type,action FROM audit_events WHERE target_id=$1", [orderId]);
    expect(audit.rows).toEqual([{actor_user_id: staff.profileId, actor_type: "staff", action: "event.order.refunded"}]);
    expect((await pool.query("SELECT kind FROM ticket_email_outbox WHERE order_id=$1", [orderId])).rows).toEqual([{kind: "refund"}]);
  });
});
