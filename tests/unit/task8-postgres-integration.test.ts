import {execFileSync, spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/pg-proxy";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {checkInAttendee} from "@/lib/admin/events";
import {registerForEvent} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-task8-${process.pid}`;
const eventId = "11111111-1111-4111-8111-111111111111";
const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};
const member = (profileId: string): Actor => ({kind: "member", userId: `auth-${profileId}`, profileId});

function docker(args: string[], input?: string): string {
  return execFileSync("docker", args, {encoding: "utf8", input, timeout: 20_000, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"]});
}
function psql(sql: string): string {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"], sql);
}
async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); return; } catch { await delay(100); }
  }
  throw new Error("isolated Postgres did not become ready");
}
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function bindParams(query: string, params: readonly unknown[]): string {
  let bound = query;
  for (let index = params.length - 1; index >= 0; index -= 1) bound = bound.replaceAll(`$${index + 1}`, sqlLiteral(params[index]));
  return bound;
}
function csvFields(line: string): string[] {
  const fields: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { fields.push(value); value = ""; } else value += char;
  }
  fields.push(value); return fields;
}
function parseCsv(output: string): Record<string, unknown>[] {
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = csvFields(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(csvFields(line).map((value, index) => [headers[index], value === "__NULL__" ? null : value === "t" ? true : value === "f" ? false : value])));
}
function oneShotRows(query: string, params: readonly unknown[]): Record<string, unknown>[] {
  return parseCsv(docker(["exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], bindParams(query, params)));
}
class PsqlSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private stdout = ""; private stderr = ""; private counter = 0;
  constructor() {
    this.child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], {stdio: ["pipe", "pipe", "pipe"]});
    this.child.stdout.setEncoding("utf8"); this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => { this.stdout += chunk; });
    this.child.stderr.on("data", (chunk: string) => { this.stderr += chunk; });
  }
  async query(query: string, params: readonly unknown[] = []): Promise<Record<string, unknown>[]> {
    const boundQuery = bindParams(query, params);
    const marker = `__TASK8_END_${++this.counter}__`;
    this.child.stdin.write(boundQuery + `;\n\\echo ${marker}\n`);
    const deadline = Date.now() + 15_000;
    while (!this.stdout.includes(marker)) {
      if (this.child.exitCode !== null) throw new Error(`psql session exited (${this.child.exitCode}): ${this.stderr}`);
      if (Date.now() > deadline) { this.child.kill(); throw new Error(`psql query timed out: ${this.stderr}`); }
      await delay(10);
    }
    const index = this.stdout.indexOf(marker); const output = this.stdout.slice(0, index).trim();
    this.stdout = this.stdout.slice(index + marker.length).replace(/^\r?\n/, "");
    return parseCsv(output);
  }
  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.stdin.end(); const deadline = Date.now() + 5_000;
    while (this.child.exitCode === null && Date.now() < deadline) await delay(10);
    if (this.child.exitCode === null) this.child.kill();
  }
}
function createRepositoryDatabase() {
  const oneShot = drizzle(async (query, params, method) => {
    const rows = oneShotRows(query, params);
    return {rows: method === "all" ? rows.map(Object.values) : rows};
  });
  return Object.assign(oneShot, {async transaction<T>(work: (tx: ReturnType<typeof drizzle>) => Promise<T>) {
    const session = new PsqlSession();
    const proxy = drizzle(async (query, params, method) => {
      const rows = await session.query(query, params);
      return {rows: method === "all" ? rows.map(Object.values) : rows};
    });
    await session.query("BEGIN");
    try { const result = await work(proxy); await session.query("COMMIT"); return result; }
    catch (error) { try { await session.query("ROLLBACK"); } catch { /* ON_ERROR_STOP may close the session. */ } throw error; }
    finally { await session.close(); }
  }});
}

describe.skipIf(!enabled)("Task 8 event concurrency on isolated Postgres 16", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
    await waitForPostgres();
    psql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE membership_status AS ENUM ('pending_review','pending_payment','active','past_due','cancel_at_period_end','cancelled','expired');
      CREATE TYPE registration_status AS ENUM ('registered','waitlist','cancelled','attended','no_show');
      CREATE TABLE profiles (id text PRIMARY KEY, display_name text NOT NULL, email text);
      CREATE TABLE companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE company_members (company_id uuid NOT NULL, user_id text NOT NULL, revoked_at timestamptz);
      CREATE TABLE memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id text, company_id uuid, status membership_status NOT NULL);
      CREATE TABLE events (id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, title_en text NOT NULL, title_zh text, description_en text NOT NULL, description_zh text, starts_at timestamptz NOT NULL, ends_at timestamptz, venue text, capacity integer, member_only boolean NOT NULL DEFAULT false, published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE event_registrations (event_id uuid NOT NULL, profile_id text NOT NULL, status registration_status NOT NULL DEFAULT 'registered', checked_in_at timestamptz, PRIMARY KEY(event_id, profile_id));
      CREATE TABLE engagement_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id text NOT NULL, company_id uuid, type text NOT NULL, points integer NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_type text NOT NULL, action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, request_id text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO profiles (id, display_name, email) VALUES ('staff-profile','Staff','staff@example.test'),('profile-a','A','a@example.test'),('profile-b','B','b@example.test');
      INSERT INTO memberships (owner_user_id, status) VALUES ('profile-a','active'),('profile-b','active');
      INSERT INTO events (id, slug, title_en, description_en, starts_at, capacity, published) VALUES ('${eventId}','last-seat','Last seat','Capacity race','2099-09-01T10:00:00Z',1,true);
    `);
    database.current = createRepositoryDatabase();
  }, 90_000);
  afterAll(() => { try { docker(["rm", "-f", container]); } catch { /* Container may already be gone. */ } });

  it("does not oversubscribe the last seat and creates one attendance fact/audit under double check-in", async () => {
    const registrations = await Promise.all([registerForEvent(member("profile-a"), {eventId}), registerForEvent(member("profile-b"), {eventId})]);
    expect(registrations.map(({disposition}) => disposition).sort()).toEqual(["registered", "waitlist"]);
    expect(psql("SELECT count(*) FILTER (WHERE status='registered') || '|' || count(*) FILTER (WHERE status='waitlist') FROM event_registrations;").trim()).toBe("1|1");
    const profileId = psql("SELECT profile_id FROM event_registrations WHERE status='registered';").trim();
    const checkIns = await Promise.all([checkInAttendee(staff, {eventId, profileId}), checkInAttendee(staff, {eventId, profileId})]);
    expect(checkIns.map(({disposition}) => disposition).sort()).toEqual(["already_checked_in", "checked_in"]);
    expect(psql(`SELECT (SELECT count(*) FROM engagement_events WHERE type='event_attended'), (SELECT count(*) FROM audit_events WHERE action='event.attendee.checked_in');`).trim()).toBe("1|1");
  }, 30_000);
});
