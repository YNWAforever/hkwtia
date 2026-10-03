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

import {eventGuestsRepository} from "@/lib/db/repos/event-guests";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-guest-checkin-${process.pid}`;
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const eventId = randomUUID();
const cancelledEventId = randomUUID();
const confirmedId = randomUUID();
const waitlistId = randomUUID();
const cancelledId = randomUUID();
const otherEventId = randomUUID();
const rollbackId = randomUUID();
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

function check(registrationId: string, event = eventId) {
  return eventGuestsRepository.checkInGuest(staff, {eventId: event, registrationId});
}

describe.skipIf(!enabled)("guest event check-in on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    databaseState.current = drizzle(pool);
    await pool.query(`
      CREATE TABLE events (id uuid PRIMARY KEY, status text NOT NULL);
      CREATE TABLE event_guest_registrations (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, status text NOT NULL,
        checked_in_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_events (
        actor_user_id text, actor_type text NOT NULL, action text NOT NULL,
        target_type text NOT NULL, target_id text NOT NULL, metadata jsonb NOT NULL
      );
    `);
    await pool.query("INSERT INTO events (id, status) VALUES ($1, 'published'), ($2, 'cancelled')", [eventId, cancelledEventId]);
    await pool.query("INSERT INTO event_guest_registrations (id, event_id, status) VALUES ($1, $6, 'registered'), ($2, $6, 'waitlist'), ($3, $6, 'cancelled'), ($4, $7, 'registered'), ($5, $6, 'registered')", [confirmedId, waitlistId, cancelledId, otherEventId, rollbackId, eventId, cancelledEventId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* setup may have failed */ } }
  });

  it("admits once, with one audit row, and rejects other statuses and targets", async () => {
    const [first, repeat] = await Promise.all([check(confirmedId), check(confirmedId)]);
    expect([first, repeat].sort()).toEqual(["already_checked_in", "checked_in"]);
    const state = await pool!.query("SELECT status, checked_in_at FROM event_guest_registrations WHERE id = $1", [confirmedId]);
    expect(state.rows[0].status).toBe("attended");
    expect(state.rows[0].checked_in_at).toBeInstanceOf(Date);
    const audits = await pool!.query("SELECT count(*)::int AS n FROM audit_events WHERE target_id = $1", [confirmedId]);
    expect(audits.rows[0].n).toBe(1);
    for (const id of [waitlistId, cancelledId, otherEventId]) await expect(check(id)).resolves.toBe("ineligible");
    await expect(check(otherEventId, cancelledEventId)).resolves.toBe("ineligible");
    await expect(eventGuestsRepository.checkInGuest({kind: "anonymous", userId: null}, {eventId, registrationId: confirmedId})).rejects.toThrow("FORBIDDEN");
  });

  it("rolls back attendance when its audit row is refused", async () => {
    await pool!.query("ALTER TABLE audit_events ADD CONSTRAINT reject_guest_audit CHECK (action <> 'event.guest.checked_in') NOT VALID");
    await expect(check(rollbackId)).rejects.toThrow();
    const state = await pool!.query("SELECT status, checked_in_at FROM event_guest_registrations WHERE id = $1", [rollbackId]);
    expect(state.rows[0]).toMatchObject({status: "registered", checked_in_at: null});
    await pool!.query("ALTER TABLE audit_events DROP CONSTRAINT reject_guest_audit");
  });
});
