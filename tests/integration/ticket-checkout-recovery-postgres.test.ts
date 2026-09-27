import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});
import {eventCheckoutRecoveriesRepository} from "@/lib/db/repos/event-checkout-recoveries";
import {newRecoveryToken, recoveryDigest} from "@/lib/tickets/checkout-recovery";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-ticket-recovery-${process.pid}`;
const eventId = randomUUID();
const orderId = randomUUID();
const key = randomUUID();
const profileId = "recovery-test-member";
const now = new Date("2026-09-27T00:00:00Z");
let pool: Pool | undefined;
function docker(args: string[]): string {return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});}
async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {docker(["exec", container, "pg_isready", "-U", "postgres"]); return;} catch {await delay(100);}
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

describe.skipIf(!enabled)("ticket checkout recovery migration on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    database.current = drizzle(pool);
    await pool.query(`CREATE TABLE event_orders (
      id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text, status text NOT NULL,
      idempotency_key text NOT NULL UNIQUE, amount_hkd_cents integer NOT NULL, expires_at timestamptz NOT NULL,
      stripe_checkout_session_id text, stripe_checkout_url text
    );
    CREATE TABLE event_order_seats (id uuid PRIMARY KEY, order_id uuid NOT NULL);`);
    await pool.query(readFileSync("drizzle/0043_event_checkout_recoveries.sql", "utf8"));
    await pool.query("INSERT INTO event_orders (id,event_id,buyer_profile_id,status,idempotency_key,amount_hkd_cents,expires_at,stripe_checkout_session_id,stripe_checkout_url) VALUES ($1,$2,$3,'pending',$4,75000,$5,'cs_test_recovery','https://checkout.stripe.com/c/pay/test')", [orderId,eventId,profileId,key,new Date(now.getTime()+30*60_000)]);
    for (let index=0;index<3;index+=1) await pool.query("INSERT INTO event_order_seats (id,order_id) VALUES ($1,$2)",[randomUUID(),orderId]);
  }, 60_000);
  afterAll(async () => {try {if (pool) await pool.end();} finally {try {docker(["rm","-f",container]);} catch {/* setup may have failed */}}});

  it("issues one digest-bound record and returns a summary without storing the token", async () => {
    const token = newRecoveryToken();
    const digest = recoveryDigest(token);
    expect(await eventCheckoutRecoveriesRepository.issueForAttempt({digest,eventId,idempotencyKey:key,buyerProfileId:profileId,now})).toBe(true);
    const row = await eventCheckoutRecoveriesRepository.read(digest, now);
    expect(row).toMatchObject({orderId,eventId,buyerProfileId:profileId,seatCount:3,amountHkdCents:75000,status:"pending"});
    if (!pool) throw new Error("pool missing");
    const stored = await pool.query("SELECT recovery_digest FROM event_checkout_recoveries WHERE order_id=$1",[orderId]);
    expect(stored.rows[0].recovery_digest).toBe(digest);
    expect(stored.rows[0].recovery_digest).not.toBe(token);
    await eventCheckoutRecoveriesRepository.invalidate(digest);
    expect(await eventCheckoutRecoveriesRepository.read(digest, now)).toBeNull();
  });
  it("refuses issuing a capability for a mismatched owner or attempt", async () => {
    const digest = recoveryDigest(newRecoveryToken());
    expect(await eventCheckoutRecoveriesRepository.issueForAttempt({digest,eventId,idempotencyKey:key,buyerProfileId:"other",now})).toBe(false);
    expect(await eventCheckoutRecoveriesRepository.issueForAttempt({digest,eventId,idempotencyKey:randomUUID(),buyerProfileId:profileId,now})).toBe(false);
  });
});
