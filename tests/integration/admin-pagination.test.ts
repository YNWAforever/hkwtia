import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const databaseState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => databaseState.current};
});
import {listEventAttendeePage} from "@/lib/db/repos/events";
import {listEventOrderPage} from "@/lib/db/repos/event-orders";
import {adminMembersRepository} from "@/lib/db/repos/admin-members";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-admin-pagination-${process.pid}`;
const eventId = randomUUID();
const orderIdA = "11111111-1111-4111-8111-111111111111";
const orderIdB = "22222222-2222-4222-8222-222222222222";
const sharedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
let pool: Pool | undefined;
function docker(args: string[]) {return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});}
async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); return;} catch {await delay(100);}
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

describe.skipIf(!enabled)("admin cursor pages on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await ready();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    databaseState.current = drizzle(pool);
    await pool.query(`
      CREATE TABLE events (id uuid PRIMARY KEY, title_en text NOT NULL, title_zh text, starts_at timestamptz NOT NULL);
      CREATE TABLE profiles (id text PRIMARY KEY, display_name text NOT NULL, email text, phone text, role text NOT NULL);
      CREATE TABLE event_registrations (event_id uuid NOT NULL, profile_id text NOT NULL, status text NOT NULL, checked_in_at timestamptz);
      CREATE TABLE event_guest_registrations (id uuid PRIMARY KEY, event_id uuid NOT NULL, name text NOT NULL, email text, organisation text, status text NOT NULL, checked_in_at timestamptz);
      CREATE TABLE event_orders (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, buyer_profile_id text, buyer_name text NOT NULL, buyer_email text NOT NULL,
        buyer_locale text NOT NULL, amount_hkd_cents integer NOT NULL, currency text NOT NULL, status text NOT NULL,
        stripe_checkout_session_id text, stripe_checkout_url text, idempotency_key text NOT NULL,
        expires_at timestamptz NOT NULL, paid_at timestamptz, refunded_at timestamptz, refund_reason text,
        created_at timestamptz NOT NULL
      );
      CREATE TABLE event_order_seats (id uuid PRIMARY KEY, order_id uuid NOT NULL, attendee_name text NOT NULL, attendee_email text NOT NULL, checked_in_at timestamptz, position integer NOT NULL);
      CREATE TABLE member_notes (id uuid PRIMARY KEY, profile_id text NOT NULL, author_profile_id text NOT NULL, body text NOT NULL, replaces_note_id uuid, created_at timestamptz NOT NULL);
    `);
    await pool.query("INSERT INTO events (id,title_en,starts_at) VALUES ($1,'Event','2030-01-01')", [eventId]);
    await pool.query("INSERT INTO profiles (id,display_name,email,phone,role) VALUES ($1,'Ada','ada@example.test',NULL,'member'),('staff','Staff',NULL,NULL,'staff')", [sharedId]);
    await pool.query("INSERT INTO event_registrations VALUES ($1,$2,'registered',NULL)", [eventId, sharedId]);
    await pool.query("INSERT INTO event_guest_registrations VALUES ($1,$2,'Ada','ada@example.test',NULL,'registered',NULL)", [sharedId, eventId]);
    await pool.query("INSERT INTO event_orders (id,event_id,buyer_profile_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,currency,status,idempotency_key,expires_at,paid_at,created_at) VALUES ($1,$3,$4,'Ada','ada@example.test','en',2500,'hkd','paid','key-a','2030-02-01','2030-01-01','2030-01-01'),($2,$3,$4,'Ada','ada@example.test','en',2500,'hkd','paid','key-b','2030-02-01','2030-01-01','2030-01-01')", [orderIdA, orderIdB, eventId, sharedId]);
    await pool.query("INSERT INTO event_order_seats VALUES ($1,$2,'Ada','ada@example.test',NULL,1)", [sharedId, orderIdA]);
    await pool.query("INSERT INTO member_notes VALUES ($1,$3,'staff','First',NULL,'2030-01-01'),($2,$3,'staff','Second',NULL,'2030-01-01')", [orderIdA, orderIdB, sharedId]);
  }, 60_000);
  afterAll(async () => {try {if (pool) await pool.end();} finally {try {docker(["rm", "-f", container]);} catch { /* setup may have failed */ }}});

  it("visits member, guest and paid-seat rows with identical name and ID exactly once", async () => {
    const kinds: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const result = await listEventAttendeePage(staff, eventId, {search: "", limit: 1, cursor}, {loadDatabase: async () => databaseState.current as never});
      if (!result) throw new Error("EVENT_NOT_FOUND");
      kinds.push(...result.items.map((item) => item.kind));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    expect(kinds).toEqual(["guest", "member", "ticket"]);
  });

  it("paginates same-time orders and notes without missing or repeating rows", async () => {
    const firstOrder = await listEventOrderPage(staff, eventId, {search: "", limit: 1, cursor: null});
    const secondOrder = await listEventOrderPage(staff, eventId, {search: "", limit: 1, cursor: firstOrder?.nextCursor});
    expect(new Set([firstOrder?.items[0].order.id, secondOrder?.items[0].order.id])).toEqual(new Set([orderIdA, orderIdB]));
    const firstNote = await adminMembersRepository.getMemberTimelinePage(staff, sharedId, "notes", {search: "", limit: 1, cursor: null});
    const secondNote = await adminMembersRepository.getMemberTimelinePage(staff, sharedId, "notes", {search: "", limit: 1, cursor: firstNote?.page.nextCursor});
    expect(new Set([firstNote?.page.items[0].id, secondNote?.page.items[0].id])).toEqual(new Set([orderIdA, orderIdB]));
  });

  it("rejects unbounded pages and member access before any timeline data", async () => {
    await expect(listEventAttendeePage(staff, eventId, {search: "", limit: Infinity, cursor: null}, {loadDatabase: async () => databaseState.current as never})).rejects.toThrow();
    await expect(listEventOrderPage(staff, eventId, {search: "", limit: Infinity, cursor: null})).rejects.toThrow();
    await expect(adminMembersRepository.getMemberTimelinePage({kind: "member", userId: sharedId, profileId: sharedId} as never, sharedId, "notes", {})).rejects.toThrow("FORBIDDEN");
  });
});
