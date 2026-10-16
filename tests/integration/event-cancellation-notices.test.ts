import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createEventNotificationsRepository} from "@/lib/db/repos/event-notifications";
import {cancelEvent} from "@/lib/db/repos/events";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-cancel-notices-${process.pid}`;
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const eventId = randomUUID();
const rollbackEventId = randomUUID();
const guestId = randomUUID();
const guestWaitlistId = randomUUID();
const guestCancelledId = randomUUID();
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}
async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}
function database() {
  return drizzle(pool!);
}
function notices() {
  return createEventNotificationsRepository(async () => database() as never);
}
function cancel(id = eventId) {
  return cancelEvent(staff, id, {loadDatabase: async () => database() as never});
}

describe.skipIf(!enabled)("event cancellation notices on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    await pool.query(`
      CREATE TABLE events (
        id uuid PRIMARY KEY, slug text NOT NULL, title_en text NOT NULL, title_zh text,
        description_en text NOT NULL, description_zh text, starts_at timestamptz NOT NULL,
        ends_at timestamptz, venue text, capacity integer, status text NOT NULL,
        visibility text NOT NULL, format text NOT NULL, online_url text,
        registration_mode text NOT NULL, external_registration_url text, tags text[] NOT NULL,
        hero_media_id uuid, organiser_company_id uuid, submitted_by_profile_id text,
        submitted_at timestamptz, published_at timestamptz, reviewed_at timestamptz,
        rejection_reason text, published boolean NOT NULL, member_only boolean NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE profiles (id text PRIMARY KEY, display_name text NOT NULL, email text, locale text NOT NULL);
      CREATE TABLE event_registrations (event_id uuid NOT NULL, profile_id text NOT NULL, status text NOT NULL);
      CREATE TABLE event_guest_registrations (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, name text NOT NULL,
        email text, locale text NOT NULL, status text NOT NULL
      );
      CREATE TABLE message_suppressions (profile_id text NOT NULL, channel text NOT NULL, classification text NOT NULL);
      CREATE TABLE audit_events (
        actor_user_id text, actor_type text NOT NULL, action text NOT NULL,
        target_type text NOT NULL, target_id text NOT NULL, metadata jsonb NOT NULL
      );
    `);
    const migration = readFileSync("drizzle/0044_event_cancellation_notifications.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    for (const [id, slug] of [[eventId, "cancel-test"], [rollbackEventId, "cancel-rollback"]] as const) {
      await pool.query(`INSERT INTO events (id,slug,title_en,title_zh,description_en,starts_at,status,visibility,format,registration_mode,tags,published,member_only)
        VALUES ($1,$2,'Event','活動','Description',now(),'published','public','in_person','rsvp',ARRAY[]::text[],true,false)`, [id, slug]);
    }
    await pool.query("INSERT INTO profiles (id,display_name,email,locale) VALUES ('member-1','Member One','one@example.test','en'),('member-2','Member Two','two@example.test','zh-HK'),('member-3','Member Three','three@example.test','en')");
    await pool.query("INSERT INTO event_registrations (event_id,profile_id,status) VALUES ($1,'member-1','registered'),($1,'member-2','waitlist'),($1,'member-3','cancelled')", [eventId]);
    await pool.query("INSERT INTO event_guest_registrations (id,event_id,name,email,locale,status) VALUES ($1,$4,'Guest One','guest@example.test','en','registered'),($2,$4,'Guest Waitlist','wait@example.test','zh-HK','waitlist'),($3,$4,'Guest Cancelled','gone@example.test','en','cancelled')", [guestId, guestWaitlistId, guestCancelledId, eventId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* setup may have failed */ } }
  });

  it("atomically snapshots member, guest and waitlist recipients once", async () => {
    expect((await notices().preview(staff, eventId)).candidates).toBe(4);
    const [first, repeated] = await Promise.all([cancel(), cancel()]);
    expect([first.status, repeated.status].sort()).toEqual(["already_cancelled", "cancelled"]);
    const rows = await pool!.query("SELECT registration_kind,registration_id,idempotency_key FROM event_cancellation_notifications WHERE event_id=$1 ORDER BY registration_kind,registration_id", [eventId]);
    expect(rows.rows).toHaveLength(4);
    expect(rows.rows.map((r) => r.registration_id)).not.toContain(guestCancelledId);
    expect(rows.rows.map((r) => r.registration_id)).not.toContain("member-3");
    expect(new Set(rows.rows.map((r) => r.idempotency_key)).size).toBe(4);
    expect((await pool!.query("SELECT count(*)::int AS n FROM event_cancellation_intents WHERE event_id=$1", [eventId])).rows[0].n).toBe(1);
  });

  it("rolls back event status, intent and notices when the cancellation audit fails", async () => {
    await pool!.query("ALTER TABLE audit_events ADD CONSTRAINT reject_cancel_audit CHECK (action <> 'event.cancelled') NOT VALID");
    await expect(cancel(rollbackEventId)).rejects.toThrow();
    expect((await pool!.query("SELECT status FROM events WHERE id=$1", [rollbackEventId])).rows[0].status).toBe("published");
    expect((await pool!.query("SELECT count(*)::int AS n FROM event_cancellation_intents WHERE event_id=$1", [rollbackEventId])).rows[0].n).toBe(0);
    await pool!.query("ALTER TABLE audit_events DROP CONSTRAINT reject_cancel_audit");
  });

  it("blocks a known hard bounce and divides simultaneous claims without overlap", async () => {
    await pool!.query("INSERT INTO email_address_blocks (email,reason_code) VALUES ('guest@example.test','hard_bounce')");
    await pool!.query("INSERT INTO message_suppressions (profile_id,channel,classification) VALUES ('member-2','email','transactional')");
    const now = new Date("2026-09-27T00:00:00Z");
    const repo = notices();
    expect(await repo.expandPending(automationCronActor(), now, 100)).toEqual({queued: 2, blocked: 2});
    const [left, right] = await Promise.all([repo.claimDue(automationCronActor(), now, 10), repo.claimDue(automationCronActor(), now, 10)]);
    expect(left.length + right.length).toBe(2);
    expect(new Set([...left, ...right].map((row) => row.id)).size).toBe(2);
    expect(await repo.summary(staff, eventId)).toMatchObject({blocked: 2, queued: 2});
  });
});
