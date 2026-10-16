import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});
import {readMemberPurchases} from "@/lib/db/repos/admin-members";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-member-purchases-${process.pid}`;
const eventId = randomUUID();
const ownerOrderId = randomUUID();
const otherOrderId = randomUUID();
const guestOrderId = randomUUID();
let pool: Pool | undefined;
function docker(args: string[]) {return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});}
async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); return;} catch {await delay(100);}
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}
const staff = {kind: "staff", userId: "staff-test", profileId: "staff-test"} as const;

describe.skipIf(!enabled)("Member 360 ticket purchases on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    database.current = drizzle(pool);
    await pool.query(`CREATE TABLE events (id uuid PRIMARY KEY, title_en text NOT NULL, title_zh text);
      CREATE TABLE event_orders (id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text, buyer_email text,
        status text NOT NULL, amount_hkd_cents integer NOT NULL, paid_at timestamptz, refunded_at timestamptz,
        refund_reason text, created_at timestamptz NOT NULL);
      CREATE TABLE event_order_seats (id uuid PRIMARY KEY, order_id uuid NOT NULL, attendee_name text NOT NULL,
        checked_in_at timestamptz, position integer NOT NULL);`);
    await pool.query("INSERT INTO events (id,title_en,title_zh) VALUES ($1,'AI Forum',NULL)", [eventId]);
    await pool.query("INSERT INTO event_orders (id,event_id,buyer_profile_id,buyer_email,status,amount_hkd_cents,created_at) VALUES ($1,$4,'owner-a','shared@example.test','paid',25000,now()), ($2,$4,'owner-b','other@example.test','refunded',25000,now()), ($3,$4,NULL,'shared@example.test','paid',25000,now())", [ownerOrderId, otherOrderId, guestOrderId, eventId]);
    await pool.query("INSERT INTO event_order_seats (id,order_id,attendee_name,position) VALUES ($1,$2,'Guest One',0)", [randomUUID(), ownerOrderId]);
  }, 60_000);
  afterAll(async () => {try {if (pool) await pool.end();} finally {try {docker(["rm", "-f", container]);} catch {/* setup may have failed */}}});

  it("returns only trusted buyer-profile orders, including seat and refund state", async () => {
    const owner = await readMemberPurchases(staff, "owner-a");
    const other = await readMemberPurchases(staff, "owner-b");
    expect(owner.map((order) => order.id)).toEqual([ownerOrderId]);
    expect(owner[0]?.seats).toMatchObject([{attendeeName: "Guest One"}]);
    expect(other.map((order) => order.id)).toEqual([otherOrderId]);
    expect(other[0]?.status).toBe("refunded");
    expect(owner.map((order) => order.id)).not.toContain(guestOrderId);
  });
  it("denies a member actor before querying staff purchase history", async () => {
    await expect(readMemberPurchases({kind: "member", userId: "owner-a", profileId: "owner-a"}, "owner-b")).rejects.toThrow("FORBIDDEN");
  });
});
