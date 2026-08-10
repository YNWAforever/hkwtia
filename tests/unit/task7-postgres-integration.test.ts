import {execFileSync, spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/pg-proxy";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {parseSegmentRouteQuery} from "@/lib/admin/segment-schema";
import {previewSegment} from "@/lib/admin/segments";
import {listAtRiskMembers} from "@/lib/admin/at-risk";
import {systemActor} from "@/lib/auth/authorize";
import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import {jobsRepository} from "@/lib/db/repos/jobs";
import type {AdminActor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-task7-${process.pid}`;
const asOf = new Date("2026-07-19T00:00:00.000Z");
const staff: AdminActor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};
const applicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const customerId = "cus_task7";
const subscriptionId = "sub_task7";

function docker(args: string[], input?: string): string {
  return execFileSync("docker", args, {encoding: "utf8", input, timeout: 20_000, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"]});
}

function psql(sql: string): string {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"], sql);
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      await delay(100);
    }
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
  for (let index = params.length - 1; index >= 0; index -= 1) {
    bound = bound.replaceAll(`$${index + 1}`, sqlLiteral(params[index]));
  }
  return bound;
}

function csvFields(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

function parseCsv(output: string): Record<string, unknown>[] {
  const lines = output.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];
  const headers = csvFields(lines[0]!);
  return lines.slice(1).map((line) => Object.fromEntries(csvFields(line).map((value, index) => [headers[index], value === "__NULL__" ? null : value === "t" ? true : value === "f" ? false : value])));
}

function oneShotRows(query: string, params: readonly unknown[]): Record<string, unknown>[] {
  const output = docker([
    "exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres",
  ], bindParams(query, params));
  return parseCsv(output);
}

class PsqlSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private stdout = "";
  private stderr = "";
  private counter = 0;

  constructor() {
    this.child = spawn("docker", [
      "exec", "-i", container, "psql", "-X", "-q", "--csv", "-P", "footer=off", "-P", "null=__NULL__",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres",
    ], {stdio: ["pipe", "pipe", "pipe"]});
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => { this.stdout += chunk; });
    this.child.stderr.on("data", (chunk: string) => { this.stderr += chunk; });
  }

  async query(query: string, params: readonly unknown[] = []): Promise<Record<string, unknown>[]> {
    const marker = `__TASK7_END_${++this.counter}__`;
    this.child.stdin.write(bindParams(query, params) + ";\n\\echo " + marker + "\n");
    const deadline = Date.now() + 15_000;
    while (!this.stdout.includes(marker)) {
      if (this.child.exitCode !== null) throw new Error(`psql session exited (${this.child.exitCode}): ${this.stderr}`);
      if (Date.now() > deadline) {
        this.child.kill();
        throw new Error(`psql query timed out: ${this.stderr}`);
      }
      await delay(10);
    }
    const markerIndex = this.stdout.indexOf(marker);
    const output = this.stdout.slice(0, markerIndex).trim();
    this.stdout = this.stdout.slice(markerIndex + marker.length).replace(/^\r?\n/, "");
    return parseCsv(output);
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.stdin.end();
    const deadline = Date.now() + 5_000;
    while (this.child.exitCode === null && Date.now() < deadline) await delay(10);
    if (this.child.exitCode === null) this.child.kill();
  }
}

function createRepositoryDatabase() {
  const oneShot = drizzle(async (query, params) => ({rows: oneShotRows(query, params)}));
  return {
    execute: (query: unknown) => oneShot.execute(query as never),
    async transaction<T>(work: (tx: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>, config?: {isolationLevel?: string}) {
      const session = new PsqlSession();
      const proxy = drizzle(async (query, params) => ({rows: await session.query(query, params)}));
      const isolation = config?.isolationLevel?.toUpperCase() ?? "READ COMMITTED";
      await session.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      try {
        const result = await work({execute: (query) => proxy.execute(query as never)});
        await session.query("COMMIT");
        return result;
      } catch (error) {
        if (session) {
          try { await session.query("ROLLBACK"); } catch { /* The server exits the session on ON_ERROR_STOP query failures. */ }
        }
        throw error;
      } finally {
        await session.close();
      }
    },
  };
}

function renewalCommand(eventId: string, eventType: "invoice.paid" | "invoice.payment_failed", start: Date, created: number): WebhookLifecycleCommand {
  return {
    eventId,
    eventType,
    eventCreated: created,
    membershipId,
    applicationId,
    planCode: "startup",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: null,
    nextStatus: eventType === "invoice.paid" ? "active" : "past_due",
    billingPeriodStart: start,
    billingPeriodEnd: new Date(start.getTime() + 365 * 86_400_000),
    cancelAtPeriodEnd: false,
    isRenewal: true,
  };
}

describe.skipIf(!enabled)("Task 7 production repositories on isolated Postgres 16", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
    await waitForPostgres();
    psql(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TYPE membership_status AS ENUM ('pending_review', 'pending_payment', 'active', 'past_due', 'cancel_at_period_end', 'cancelled', 'expired');
      CREATE TABLE profiles (
        id text PRIMARY KEY, display_name text NOT NULL, email text, locale text NOT NULL DEFAULT 'en',
        consent_marketing boolean NOT NULL DEFAULT true, last_login_at timestamptz
      );
      CREATE TABLE companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, industry text);
      CREATE TABLE company_members (user_id text NOT NULL, company_id uuid NOT NULL, revoked_at timestamptz);
      CREATE TABLE membership_applications (id uuid PRIMARY KEY, applicant_user_id text NOT NULL);
      CREATE TABLE memberships (
        id uuid PRIMARY KEY, application_id uuid NOT NULL, owner_user_id text, company_id uuid,
        plan_code text NOT NULL, status membership_status NOT NULL, stripe_customer_id text, stripe_subscription_id text,
        billing_period_start timestamptz, billing_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE engagement_scores (profile_id text PRIMARY KEY, score numeric NOT NULL, trend numeric);
      CREATE TABLE engagement_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id text NOT NULL, company_id uuid, type text NOT NULL,
        points integer NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE email_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id text NOT NULL, status text NOT NULL);
      CREATE TABLE jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_key text NOT NULL UNIQUE, kind text NOT NULL, state text NOT NULL,
        attempt_count integer NOT NULL DEFAULT 0, last_error text, completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE billing_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), membership_id uuid NOT NULL, state text NOT NULL,
        stripe_checkout_session_id text, ended_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_type text NOT NULL, action text NOT NULL,
        target_type text NOT NULL, target_id text NOT NULL, request_id text, metadata jsonb NOT NULL DEFAULT '{}',
        occurred_at timestamptz NOT NULL DEFAULT now()
      );

      INSERT INTO profiles (id, display_name, email) VALUES
        ('risk-minus', 'Risk Minus', 'minus@example.test'),
        ('risk-zero-b', 'Risk Zero B', 'zero-b@example.test'),
        ('risk-zero-a', 'Risk Zero A', 'zero-a@example.test'),
        ('risk-sixty', 'Risk Sixty', 'sixty@example.test'),
        ('risk-plus', 'Risk Plus', 'plus@example.test'),
        ('risk-score20', 'Risk Score 20', 'score20@example.test'),
        ('job-profile', 'Job Profile', 'job@example.test');
      INSERT INTO engagement_scores (profile_id, score, trend)
        SELECT id, CASE WHEN id = 'risk-score20' THEN 20 ELSE 19 END, -1
        FROM profiles WHERE id LIKE 'risk-%';
      INSERT INTO membership_applications (id, applicant_user_id) VALUES
        ('11111111-1111-4111-8111-111111111111', 'risk-minus'),
        ('22222222-2222-4222-8222-222222222222', 'risk-zero-b'),
        ('33333333-3333-4333-8333-333333333333', 'risk-zero-a'),
        ('44444444-4444-4444-8444-444444444444', 'risk-sixty'),
        ('55555555-5555-4555-8555-555555555555', 'risk-plus'),
        ('66666666-6666-4666-8666-666666666666', 'risk-score20'),
        ('${applicationId}', 'job-profile');
      INSERT INTO memberships (id, application_id, owner_user_id, plan_code, status, stripe_customer_id, stripe_subscription_id, billing_period_end) VALUES
        ('11111111-aaaa-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'risk-minus', 'corporate', 'active', null, null, '${new Date(asOf.getTime() - 1).toISOString()}'),
        ('22222222-aaaa-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'risk-zero-b', 'corporate', 'past_due', null, null, '${asOf.toISOString()}'),
        ('33333333-aaaa-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'risk-zero-a', 'corporate', 'active', null, null, '${asOf.toISOString()}'),
        ('44444444-aaaa-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'risk-sixty', 'corporate', 'active', null, null, '${new Date(asOf.getTime() + 60 * 86_400_000).toISOString()}'),
        ('55555555-aaaa-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'risk-plus', 'corporate', 'active', null, null, '${new Date(asOf.getTime() + 60 * 86_400_000 + 1).toISOString()}'),
        ('66666666-aaaa-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', 'risk-score20', 'corporate', 'active', null, null, '${asOf.toISOString()}'),
        ('${membershipId}', '${applicationId}', 'job-profile', 'startup', 'active', '${customerId}', '${subscriptionId}', '${new Date(asOf.getTime() + 365 * 86_400_000).toISOString()}');
    `);
  }, 90_000);

  afterAll(() => {
    try { docker(["rm", "-f", container]); } catch { /* Container may already be gone after a test failure. */ }
  });

  beforeEach(() => {
    database.current = createRepositoryDatabase();
    vi.useFakeTimers();
    vi.setSystemTime(asOf);
  });

  it("keeps default at-risk SQL equivalent at 19/20 and -1ms/0/60d/+1ms with deterministic ordering and exact profile audience", async () => {
    const atRisk = await listAtRiskMembers(staff, {asOf});
    expect(atRisk.map(({profileId}) => profileId)).toEqual(["risk-zero-a", "risk-zero-b", "risk-sixty"]);

    const query = parseSegmentRouteQuery({
      profileId: "risk-zero-b",
      status: "past_due",
      scoreMax: "19",
      renewalWithinDays: "60",
    });
    const preview = await previewSegment(staff, {...query, limit: 50, cursor: null});
    expect(preview.total).toBe(1);
    expect(preview.items.map(({profileId}) => profileId)).toEqual(["risk-zero-b"]);
    const audience = await campaignsRepository.membersForSegment(staff, database.current, query.filter);
    expect(audience.map(({profileId}) => profileId)).toEqual(["risk-zero-b"]);
  }, 20_000);

  it("uses the production jobs transaction for concurrent replay and stateful renewal ordinals despite poisoned legacy JSON", async () => {
    vi.useRealTimers();
    psql(`
      TRUNCATE jobs, audit_events, engagement_events;
      UPDATE memberships SET status = 'active' WHERE id = '${membershipId}';
      INSERT INTO engagement_events (profile_id, type, points, metadata, occurred_at)
      VALUES ('job-profile', 'renewal_failed', -10, '{"membershipId":"${membershipId}","periodStart":"legacy","periodEnd":"legacy","renewalOrdinal":"poison"}', now() - interval '1 year');
    `);

    const firstPeriod = new Date("2026-07-01T00:00:00.000Z");
    const replay = renewalCommand("evt_task7_failed", "invoice.payment_failed", firstPeriod, 100);
    const replayResults = await Promise.all([
      jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), replay),
      jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), replay),
    ]);
    expect(replayResults.sort()).toEqual(["duplicate", "processed"]);

    await expect(jobsRepository.processWebhookLifecycle(
      systemActor("stripe-webhook"),
      renewalCommand("evt_task7_paid", "invoice.paid", firstPeriod, 101),
    )).resolves.toBe("processed");
    await expect(jobsRepository.processWebhookLifecycle(
      systemActor("stripe-webhook"),
      renewalCommand("evt_task7_next", "invoice.paid", new Date("2027-07-01T00:00:00.000Z"), 102),
    )).resolves.toBe("processed");

    const counts = psql(`
      SELECT
        (SELECT count(*) FROM jobs WHERE run_key = 'evt_task7_failed'),
        (SELECT count(*) FROM engagement_events WHERE metadata->>'membershipId' = '${membershipId}' AND metadata->>'periodStart' <> 'legacy'),
        (SELECT count(*) FROM audit_events WHERE target_id = '${membershipId}' AND action = 'stripe.webhook.processed');
    `).trim();
    expect(counts).toBe("1|3|3");
    const facts = psql(`
      SELECT type || ':' || (metadata->>'renewalOrdinal')
      FROM engagement_events
      WHERE metadata->>'membershipId' = '${membershipId}' AND metadata->>'periodStart' <> 'legacy'
      ORDER BY occurred_at, type;
    `).trim().split(/\r?\n/);
    expect(facts).toEqual(["renewal_failed:1", "renewal_paid:1", "renewal_paid:2"]);
  }, 30_000);
});
