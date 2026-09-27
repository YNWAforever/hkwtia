import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";

const databaseState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => databaseState.current};
});

import {createEventOrdersRepository} from "@/lib/db/repos/event-orders";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-ticket-eligibility-${process.pid}`;
const now = new Date("2026-09-27T00:00:00Z");
const eventId = randomUUID();
const privateEventId = randomUUID();
const companyId = randomUUID();
const member = {kind: "member", userId: "auth-ticket-test", profileId: "profile-ticket-test"} as const;
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

function purchase(event: string, actor = ANONYMOUS_ACTOR as typeof ANONYMOUS_ACTOR | typeof member, buyerProfileId: string | null = null) {
  return {
    actor, eventId: event, buyerProfileId, buyerName: "Ticket Test", buyerEmail: "ticket@example.test",
    buyerLocale: "en" as const, idempotencyKey: randomUUID(),
    seats: [{name: "Ticket Test", email: "ticket@example.test"}], amountHkdCents: 25_000, now,
  };
}

describe.skipIf(!enabled)("ticket purchase eligibility and last seat on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    databaseState.current = drizzle(pool);
    await pool.query(`
      CREATE TABLE events (
        id uuid PRIMARY KEY, slug text NOT NULL DEFAULT 'synthetic-event', capacity integer, published boolean NOT NULL, starts_at timestamptz NOT NULL,
        ends_at timestamptz, registration_mode text NOT NULL, ticket_price_hkd_cents integer,
        visibility text NOT NULL, member_only boolean NOT NULL
      );
      CREATE TABLE memberships (id uuid PRIMARY KEY, owner_user_id text, company_id uuid, status text NOT NULL, grant_effective_at timestamptz, grant_expires_at timestamptz);
      CREATE TABLE company_members (company_id uuid NOT NULL, user_id text NOT NULL, revoked_at timestamptz);
      CREATE TABLE event_orders (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text, buyer_name text NOT NULL,
        buyer_email text NOT NULL, buyer_locale text NOT NULL, amount_hkd_cents integer NOT NULL,
        currency text NOT NULL, status text NOT NULL, stripe_checkout_session_id text,
        stripe_checkout_url text, idempotency_key text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
        paid_at timestamptz, refunded_at timestamptz, refund_reason text,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE event_order_seats (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL,
        position integer NOT NULL, attendee_name text NOT NULL, attendee_email text NOT NULL,
        created_at timestamptz NOT NULL
      );
      CREATE TABLE audit_events (
        actor_user_id text, actor_type text NOT NULL, action text NOT NULL,
        target_type text NOT NULL, target_id uuid NOT NULL, metadata jsonb NOT NULL
      );
    `);
    await pool.query("INSERT INTO events (id, capacity, published, starts_at, registration_mode, ticket_price_hkd_cents, visibility, member_only) VALUES ($1, 1, true, '2030-01-01', 'ticketed', 25000, 'public', false), ($2, 10, true, '2030-01-01', 'ticketed', 25000, 'members_only', true)", [eventId, privateEventId]);
    await pool.query("INSERT INTO memberships (id, owner_user_id, company_id, status) VALUES ($1, $2, NULL, 'expired'), ($3, NULL, $4, 'active')", [randomUUID(), member.profileId, randomUUID(), companyId]);
    await pool.query("INSERT INTO company_members (company_id, user_id, revoked_at) VALUES ($1, $2, now())", [companyId, member.profileId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("allows one public guest order and refuses the last-seat competitor", async () => {
    const repository = createEventOrdersRepository();
    const [first, second] = await Promise.all([
      repository.createOrder(purchase(eventId)), repository.createOrder(purchase(eventId)),
    ]);
    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok)).toEqual([{ok: false, reason: "SOLD_OUT"}]);
  });

  it("refuses an anonymous, expired, or revoked-seat buyer on a private event", async () => {
    const repository = createEventOrdersRepository();
    await expect(repository.createOrder(purchase(privateEventId))).resolves.toEqual({ok: false, reason: "NOT_ELIGIBLE"});
    await expect(repository.createOrder(purchase(privateEventId, member, member.profileId))).resolves.toEqual({ok: false, reason: "NOT_ELIGIBLE"});
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE company_members SET revoked_at = NULL WHERE company_id = $1 AND user_id = $2", [companyId, member.profileId]);
    await expect(repository.createOrder(purchase(privateEventId, member, member.profileId))).resolves.toMatchObject({ok: true});
    await pool.query("UPDATE company_members SET revoked_at = now() WHERE company_id = $1 AND user_id = $2", [companyId, member.profileId]);
    await expect(repository.createOrder(purchase(privateEventId, member, member.profileId))).resolves.toEqual({ok: false, reason: "NOT_ELIGIBLE"});
  });

  it("refuses future and expired company grants without relying on the expiry job", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const repository = createEventOrdersRepository();
    await pool.query("UPDATE company_members SET revoked_at=NULL WHERE company_id=$1", [companyId]);
    for (const [start, end] of [[1, 2], [-2, -1]]) {
      await pool.query("UPDATE memberships SET grant_effective_at=now()+$2*interval '1 day',grant_expires_at=now()+$3*interval '1 day' WHERE company_id=$1", [companyId, start, end]);
      await expect(repository.createOrder(purchase(privateEventId, member, member.profileId))).resolves.toEqual({ok: false, reason: "NOT_ELIGIBLE"});
    }
    await pool.query("UPDATE memberships SET grant_effective_at=now()-interval '1 day',grant_expires_at=now()+interval '1 day' WHERE company_id=$1", [companyId]);
    await expect(repository.createOrder(purchase(privateEventId, member, member.profileId))).resolves.toMatchObject({ok: true});
  });
  it("rejects buyer profile forgery in the repository write service", async () => {
    const repository = createEventOrdersRepository();
    await expect(repository.createOrder(purchase(privateEventId, ANONYMOUS_ACTOR, member.profileId))).resolves.toEqual({ok: false, reason: "NOT_ELIGIBLE"});
  });
});
