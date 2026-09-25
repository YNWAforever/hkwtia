import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {listEventsForReview, reviewEvent} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-event-review-" + process.pid;
const eventId = randomUUID();
const companyId = randomUUID();
const staff: Actor = {kind: "staff", userId: "staff", profileId: "staff"};
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

describe.skipIf(!enabled)("member event review on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query("CREATE TABLE companies (id uuid PRIMARY KEY, display_name text NOT NULL)");
    await pool.query(`CREATE TABLE events (
      id uuid PRIMARY KEY, slug text NOT NULL, title_en text NOT NULL, title_zh text,
      description_en text NOT NULL, description_zh text, starts_at timestamptz NOT NULL,
      ends_at timestamptz, venue text, capacity integer, member_only boolean NOT NULL DEFAULT false,
      published boolean NOT NULL DEFAULT false, hero_media_id uuid,
      organiser_company_id uuid, submitted_by_profile_id text, submitted_at timestamptz,
      status text NOT NULL, visibility text NOT NULL, format text NOT NULL, online_url text,
      registration_mode text NOT NULL, external_registration_url text, tags text[] NOT NULL DEFAULT '{}',
      published_at timestamptz, reviewed_at timestamptz, reviewed_by_profile_id text,
      rejection_reason text, updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE audit_events (
      actor_user_id text, actor_type text, action text, target_type text,
      target_id text, metadata jsonb
    )`);
    await pool.query("INSERT INTO companies (id, display_name) VALUES ($1, 'Acme')", [companyId]);
    await pool.query(`INSERT INTO events (id, slug, title_en, description_en, starts_at, organiser_company_id,
      submitted_by_profile_id, submitted_at, status, visibility, format, registration_mode)
      VALUES ($1, 'review-race', 'Review race', 'Original copy', '2030-03-01T02:00:00Z', $2,
      'member', now(), 'pending_review', 'public', 'in_person', 'rsvp')`, [eventId, companyId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it.each(["approve", "reject"] as const)("refuses stale %s after a member changes pending content", async (decision) => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE events SET status = 'pending_review', description_en = 'Original copy', published = false WHERE id = $1", [eventId]);
    const deps = {loadDatabase: async () => drizzle(pool!) as never};
    const queue = await listEventsForReview(staff, deps);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.description_en).toBe("Original copy");
    const reviewVersion = queue[0]?.review_version;
    expect(reviewVersion).toMatch(/^\d+$/);
    await pool.query("UPDATE events SET description_en = 'Unreviewed copy' WHERE id = $1", [eventId]);
    const input = decision === "approve"
      ? {decision, reviewVersion}
      : {decision, reason: "Needs changes", reviewVersion};
    await expect(reviewEvent(staff, eventId, input, deps)).rejects.toThrow("INVALID_EVENT_TRANSITION");
    const {rows} = await pool.query<{status: string; description_en: string}>(
      "SELECT status, description_en FROM events WHERE id = $1", [eventId],
    );
    expect(rows[0]).toMatchObject({status: "pending_review", description_en: "Unreviewed copy"});
    const audit = await pool.query("SELECT action FROM audit_events");
    expect(audit.rows).toHaveLength(0);
  });

  it("publishes the current snapshot with one audit row", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const deps = {loadDatabase: async () => drizzle(pool!) as never};
    const reviewVersion = (await listEventsForReview(staff, deps))[0]?.review_version;
    expect(reviewVersion).toMatch(/^\d+$/);
    await expect(reviewEvent(staff, eventId, {decision: "approve", reviewVersion}, deps))
      .resolves.toMatchObject({status: "published", description_en: "Unreviewed copy"});
    const audit = await pool.query<{action: string}>("SELECT action FROM audit_events");
    expect(audit.rows).toEqual([{action: "event.review.approved"}]);
  });});
