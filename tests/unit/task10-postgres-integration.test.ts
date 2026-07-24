import {execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/pg-proxy";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {getAdminReport} from "@/lib/admin/reports";
import type {AdminActor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-task10-${process.pid}`;
const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};

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
function parseValue(value: string): unknown {
  if (value === "__NULL__") return null;
  if (value === "t") return true;
  if (value === "f") return false;
  if (value.startsWith("[") || value.startsWith("{")) return JSON.parse(value) as unknown;
  return value;
}
function parseCsv(output: string): Record<string, unknown>[] {
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = csvFields(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(csvFields(line).map((value, index) => [headers[index], parseValue(value)])));
}
function oneShotRows(query: string, params: readonly unknown[]): Record<string, unknown>[] {
  return parseCsv(docker(["exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], bindParams(query, params)));
}

describe.skipIf(!enabled)("Task 10 reconciled reports on isolated Postgres 16", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
    await waitForPostgres();
    psql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE membership_status AS ENUM ('pending_review','pending_payment','active','past_due','cancel_at_period_end','cancelled','expired');
      CREATE TYPE billing_interval AS ENUM ('annual','monthly','none');
      CREATE TYPE membership_application_status AS ENUM ('draft','pending_payment','pending_review','completed','abandoned');
      CREATE TYPE membership_application_step AS ENUM ('profile','company','checkout','complete','review');
      CREATE TYPE registration_status AS ENUM ('registered','waitlist','cancelled','attended','no_show');
      CREATE TABLE profiles (id text PRIMARY KEY);
      CREATE TABLE membership_plans (code text PRIMARY KEY, annual_price_hkd integer, monthly_price_hkd integer);
      CREATE TABLE membership_applications (id uuid PRIMARY KEY, current_step membership_application_step NOT NULL, status membership_application_status NOT NULL, created_at timestamptz NOT NULL);
      CREATE TABLE companies (id uuid PRIMARY KEY);
      CREATE TABLE company_members (user_id text NOT NULL, company_id uuid NOT NULL, revoked_at timestamptz);
      CREATE TABLE memberships (id uuid PRIMARY KEY, application_id uuid, owner_user_id text, company_id uuid, plan_code text NOT NULL, status membership_status NOT NULL, billing_interval billing_interval NOT NULL, billing_period_end timestamptz);
      CREATE TABLE engagement_scores (profile_id text PRIMARY KEY, score numeric NOT NULL);
      CREATE TABLE engagement_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id text NOT NULL, type text NOT NULL, points integer NOT NULL, metadata jsonb NOT NULL, occurred_at timestamptz NOT NULL);
      CREATE TABLE events (id uuid PRIMARY KEY, ends_at timestamptz);
      CREATE TABLE event_registrations (event_id uuid NOT NULL, profile_id text NOT NULL, status registration_status NOT NULL);

      INSERT INTO profiles (id) VALUES ('member-one'),('member-two'),('member-three'),('member-four'),('risk-one'),('risk-boundary'),('risk-late');
      INSERT INTO membership_plans VALUES ('community',1800,null),('startup',1200,120),('corporate',4800,null);
      INSERT INTO membership_applications VALUES
        ('00000000-0000-4000-8000-000000000000','complete','completed','2026-06-30 15:59:59.999+00'),
        ('11111111-1111-4111-8111-111111111111','complete','completed','2026-06-30 16:00:00+00'),
        ('22222222-2222-4222-8222-222222222222','company','draft','2026-07-10 00:00:00+00'),
        ('33333333-3333-4333-8333-333333333333','review','pending_review','2026-07-20 00:00:00+00'),
        ('44444444-4444-4444-8444-444444444444','profile','draft','2026-07-31 15:59:59.999+00'),
        ('55555555-5555-4555-8555-555555555555','complete','completed','2026-07-31 16:00:00+00'),
        ('66666666-6666-4666-8666-666666666666','profile','abandoned','2026-07-15 00:00:00+00');
      INSERT INTO memberships VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000000','member-one',null,'community','active','annual',null),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','00000000-0000-4000-8000-000000000000','member-two',null,'startup','active','monthly',null),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','00000000-0000-4000-8000-000000000000','member-three',null,'corporate','cancelled','annual',null),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','11111111-1111-4111-8111-111111111111','member-four',null,'community','active','none',null),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',null,'risk-one',null,'community','active','none','2026-07-31 16:00:00+00'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',null,'risk-boundary',null,'community','active','none','2026-07-31 16:00:00+00'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',null,'risk-late',null,'community','past_due','none','2026-09-29 16:00:00.001+00');
      INSERT INTO engagement_scores VALUES ('risk-one',19),('risk-boundary',20),('risk-late',19);
      INSERT INTO engagement_events (profile_id,type,points,metadata,occurred_at) VALUES
        ('member-one','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-06-30 15:59:59.999+00'),
        ('member-one','renewal_failed',-1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-06-30 16:00:00+00'),
        ('member-one','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-07-01 00:00:00+00'),
        ('member-one','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-07-01 00:00:01+00'),
        ('member-two','renewal_failed',-1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","renewalOrdinal":1}','2026-07-10 00:00:00+00'),
        ('member-three','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","renewalOrdinal":2}','2026-07-20 00:00:00+00'),
        ('member-three','renewal_failed',-1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","renewalOrdinal":"poison"}','2026-07-20 00:00:01+00'),
        ('member-three','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","renewalOrdinal":"1"}','2026-07-20 00:00:02+00'),
        ('member-four','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4","renewalOrdinal":1}','2026-07-31 16:00:00+00'),
        ('member-four','renewal_paid',1,'{"membershipId":"not-a-membership","renewalOrdinal":1}','2026-07-15 00:00:00+00');
      INSERT INTO events VALUES
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','2026-06-30 15:59:59.999+00'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','2026-06-30 16:00:00+00'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','2026-07-20 00:00:00+00'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4','2026-07-31 16:00:00+00'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','2026-07-25 00:00:00+00');
      INSERT INTO event_registrations VALUES
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-two','no_show'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-three','cancelled'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-four','registered'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','member-two','waitlist'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','member-one','attended');
    `);
    database.current = drizzle(async (query, params) => ({rows: oneShotRows(query, params)}));
  }, 90_000);

  afterAll(() => { try { docker(["rm", "-f", container]); } catch { /* Container may already be gone. */ } });

  it("executes production JSONB aggregates with exact HK boundaries and hand-reconciled facts", async () => {
    const report = await getAdminReport(staff, {from: "2026-07-01", to: "2026-07-31"}, undefined, new Date("2026-07-21T00:00:00.000Z"));
    expect(report).toEqual({
      window: {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"},
      revenue: {arrHkd: 3240, mrrHkd: 270},
      renewal: {numerator: 2, denominator: 3, percentage: 66.7},
      firstYearRenewal: {numerator: 1, denominator: 2, percentage: 50},
      funnel: {started: 5, profileCompleted: 3, checkoutOrReview: 2, activated: 1},
      attendance: {numerator: 2, denominator: 5, percentage: 40},
      atRiskCount: 1,
    });
  }, 30_000);
});
