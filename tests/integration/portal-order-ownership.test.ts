import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const databaseState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => databaseState.current}));
import {readOwnEventOrder} from "@/lib/db/repos/portal-orders";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-order-owner-${process.pid}`;
const actor = {kind: "member", userId: "auth-account", profileId: "buyer-profile"} as const;
const eventId = randomUUID(), ownId = randomUUID(), otherId = randomUUID(), guestId = randomUUID();
let pool: Pool | undefined;
let started = false;
function docker(args: string[]) {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

describe.skipIf(!enabled)("own order history on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); ready = true; break; }
      catch { await delay(100); }
    }
    if (!ready) throw new Error("disposable PostgreSQL did not become ready");
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("invalid disposable PostgreSQL port");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    databaseState.current = drizzle(pool);
    // No memberships table: historical ownership must not depend on a current benefit.
    await pool.query(`CREATE TABLE events (id uuid PRIMARY KEY, title_en text NOT NULL, title_zh text, starts_at timestamptz NOT NULL);
      CREATE TABLE event_orders (id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text, status text NOT NULL,
        amount_hkd_cents integer NOT NULL, currency text NOT NULL, paid_at timestamptz, refunded_at timestamptz);`);
    await pool.query("INSERT INTO events VALUES ($1, 'Members event', '會員活動', '2099-01-01')", [eventId]);
    await pool.query(`INSERT INTO event_orders VALUES
      ($1, $4, $5, 'paid', 25000, 'hkd', now(), null),
      ($2, $4, 'someone-else', 'paid', 25000, 'hkd', now(), null),
      ($3, $4, null, 'paid', 25000, 'hkd', now(), null)`, [ownId, otherId, guestId, eventId, actor.profileId]);
  }, 60_000);
  afterAll(async () => {
    try { await pool?.end(); }
    finally { if (started) docker(["rm", "-f", container]); }
  });
  it("reads the recorded buyer profile independently of auth ID and current membership", async () => {
    expect(await readOwnEventOrder(actor, ownId)).toMatchObject({id: ownId, status: "paid", buyerProfileId: actor.profileId});
  });
  it("denies other buyers, unclaimed guest orders and malformed IDs", async () => {
    for (const id of [otherId, guestId, "not-a-uuid"]) expect(await readOwnEventOrder(actor, id)).toBeNull();
  });
  it("does not treat the auth subject as the recorded buyer", async () => {
    expect(await readOwnEventOrder({...actor, profileId: actor.userId}, ownId)).toBeNull();
  });
});
