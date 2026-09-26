import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createShowcaseLeadEmailOutboxRepository} from "@/lib/db/repos/showcase-lead-email-outbox";
import {deliverLeadEmailForLead} from "@/lib/showcase/lead-email-runner";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-lead-email-outbox-${process.pid}`;
const leadId = "11111111-1111-4111-8111-111111111111";
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function ready(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL did not become ready");
}

function store() {
  if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
  return createShowcaseLeadEmailOutboxRepository(async () => drizzle(pool!) as unknown as import("@/lib/db/repos/common").Database);
}

describe.skipIf(!enabled)("showcase lead email outbox on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test",
      "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await ready();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    await pool.query(`CREATE TABLE leads (
      id uuid PRIMARY KEY, listing_id uuid, contact_name text NOT NULL, email text NOT NULL,
      locale varchar(10) NOT NULL, idempotency_key text NOT NULL UNIQUE
    )`);
    await pool.query(`CREATE TABLE showcase_listings (
      id uuid PRIMARY KEY, slug text NOT NULL, name_en text NOT NULL
    )`);
    await pool.query(`CREATE TABLE staff_tasks (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY, profile_id text, journey_state_id uuid,
      kind text NOT NULL, dedupe_key text NOT NULL UNIQUE, summary_code text NOT NULL,
      context jsonb DEFAULT '{}'::jsonb NOT NULL, status text DEFAULT 'open' NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
    )`);
    const migration = readFileSync("drizzle/0041_showcase-lead-email-outbox.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    await pool.query(`INSERT INTO leads (id, contact_name, email, locale, idempotency_key)
      VALUES ($1, 'Ada Lovelace', 'ada@example.com', 'en', 'outbox-test')`, [leadId]);
    await pool.query(`INSERT INTO showcase_lead_email_outbox
      (lead_id, kind, idempotency_key, next_attempt_at)
      VALUES ($1, 'ack', 'showcase-lead:outbox-test:ack', now() - interval '1 minute'),
             ($1, 'staff', 'showcase-lead:outbox-test:staff', now() - interval '1 minute')`, [leadId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("claims each due notice once and fences a stale settlement after retry", async () => {
    const repository = store();
    const actor = automationCronActor();
    const now = new Date();
    const [first, second] = await Promise.all([
      repository.claimDue(actor, now, 1),
      repository.claimDue(actor, now, 1),
    ]);
    expect(first).toHaveLength(1);
    expect(first[0]?.kind).toBe("ack");
    expect(second).toHaveLength(1);
    expect(first[0]?.id).not.toBe(second[0]?.id);
    expect(await repository.claimDue(actor, now, 1)).toEqual([]);

    const ack = first[0]?.kind === "ack" ? first[0] : second[0];
    const staff = first[0]?.kind === "staff" ? first[0] : second[0];
    if (!ack || !staff) throw new Error("two outbox claims expected");
    const payload = {
      to: "ada@example.com", from: "WTIA <notifications@example.com>",
      subject: "Introduction received", html: "<p>Thanks</p>", text: "Thanks",
      headers: {}, idempotencyKey: ack.idempotencyKey,
    };
    expect(await repository.freezePayload(actor, ack.id, ack.attemptCount, payload, now)).toBe(true);
    expect(await repository.freezePayload(actor, staff.id, staff.attemptCount, {...payload, to: "staff@example.com", idempotencyKey: staff.idempotencyKey}, now)).toBe(true);
    expect(await repository.markSent(actor, staff.id, staff.attemptCount, "provider-staff")).toBe(true);
    expect(await repository.markRetryable(actor, ack.id, ack.attemptCount, now, "retryable_network")).toBe(true);

    const later = new Date(now.getTime() + 11 * 60_000);
    const retried = await repository.claimDue(actor, later, 1);
    expect(retried).toHaveLength(1);
    expect(retried[0]).toMatchObject({id: ack.id, payload, idempotencyKey: ack.idempotencyKey});
    expect(retried[0]?.attemptCount).toBe(ack.attemptCount + 1);
    expect(await repository.markSent(actor, ack.id, ack.attemptCount, "stale")).toBe(false);
    expect(await repository.markSent(actor, ack.id, retried[0]!.attemptCount, "provider-ack")).toBe(true);
    expect(await repository.claimDue(actor, later, 1)).toEqual([]);
  });

  it("delivers both notices through the real repository and settles them once", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const listedLead = "44444444-4444-4444-8444-444444444444";
    const listingId = "55555555-5555-4555-8555-555555555555";
    await pool.query("INSERT INTO showcase_listings VALUES ($1, 'harbour-vision-ai', 'Harbour Vision AI')", [listingId]);
    await pool.query(`INSERT INTO leads (id, listing_id, contact_name, email, locale, idempotency_key)
      VALUES ($1, $2, 'Ada', 'ada@example.com', 'en', 'delivery-test')`, [listedLead, listingId]);
    await pool.query(`INSERT INTO showcase_lead_email_outbox (lead_id, kind, idempotency_key)
      VALUES ($1, 'ack', 'showcase-lead:delivery-test:ack'),
             ($1, 'staff', 'showcase-lead:delivery-test:staff')`, [listedLead]);
    const sent: {to: string; idempotencyKey: string}[] = [];
    await deliverLeadEmailForLead(listedLead, {
      outbox: store(),
      renderEmail: async ({template}) => ({
        subject: template, html: "<p>Notice</p>", text: "Notice", headers: {},
      }),
      transport: {send: async (input) => {
        sent.push({to: input.to, idempotencyKey: input.idempotencyKey});
        return {status: "sent", providerId: input.idempotencyKey};
      }},
      resolveStaffRecipient: async () => "staff@example.com",
      emailFrom: "WTIA <notice@example.com>",
      appUrl: "https://hkwtia.example",
    });
    expect(sent).toEqual([
      {to: "ada@example.com", idempotencyKey: "showcase-lead:delivery-test:ack"},
      {to: "staff@example.com", idempotencyKey: "showcase-lead:delivery-test:staff"},
    ]);
    const settled = await pool.query(
      "SELECT status, payload FROM showcase_lead_email_outbox WHERE lead_id = $1 ORDER BY kind",
      [listedLead],
    );
    expect(settled.rows).toEqual([
      {status: "sent", payload: null},
      {status: "sent", payload: null},
    ]);
  });
  it("blocks an exhausted send and opens one staff task in the same transaction", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const exhaustedLead = "66666666-6666-4666-8666-666666666666";
    const now = new Date();
    await pool.query(`INSERT INTO leads (id, contact_name, email, locale, idempotency_key)
      VALUES ($1, 'Exhausted Sender', 'exhausted@example.com', 'en', 'outbox-exhausted')`, [exhaustedLead]);
    const inserted = await pool.query(`INSERT INTO showcase_lead_email_outbox
      (lead_id, kind, status, idempotency_key, attempt_count, next_attempt_at,
       claim_expires_at, first_attempt_at, payload)
      VALUES ($1, 'ack', 'sending', 'showcase-lead:outbox-exhausted:ack', 8, $2, $3, $2, '{}'::jsonb)
      RETURNING id`, [exhaustedLead, now, new Date(now.getTime() + 60_000)]);
    const id = String(inserted.rows[0]?.id);
    const repository = store();
    const actor = automationCronActor();
    expect(await repository.markRetryable(actor, id, 8, now, "retryable_network")).toBe(true);
    expect(await repository.markRetryable(actor, id, 8, now, "retryable_network")).toBe(false);
    const outbox = await pool.query(
      "SELECT status, error_code FROM showcase_lead_email_outbox WHERE id = $1", [id],
    );
    expect(outbox.rows[0]).toEqual({status: "blocked", error_code: "attempts_exhausted"});
    const task = await pool.query(
      "SELECT summary_code, context FROM staff_tasks WHERE dedupe_key = $1",
      [`showcase-lead-email:${id}`],
    );
    expect(task.rows).toEqual([{
      summary_code: "showcase_lead_email_blocked",
      context: {
        contactEmail: "exhausted@example.com",
        locale: "en",
        noticeKind: "ack",
        reasonCode: "attempts_exhausted",
      },
    }]);
  });
  it("stops an expired uncertain send after the provider dedupe window and opens one staff task", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const secondLead = "22222222-2222-4222-8222-222222222222";
    const now = new Date();
    await pool.query(`INSERT INTO leads (id, contact_name, email, locale, idempotency_key)
      VALUES ($1, 'Grace Hopper', 'grace@example.com', 'zh-HK', 'outbox-old')`, [secondLead]);
    await pool.query(`INSERT INTO showcase_lead_email_outbox
      (lead_id, kind, status, idempotency_key, attempt_count, next_attempt_at,
       claim_expires_at, first_attempt_at, payload)
      VALUES ($1, 'ack', 'sending', 'showcase-lead:outbox-old:ack', 1, $2,
              $2, $3, '{}'::jsonb)`,
    [secondLead, new Date(now.getTime() - 60_000), new Date(now.getTime() - 24 * 60 * 60_000)]);

    const repository = store();
    expect(await repository.claimDue(automationCronActor(), now, 5)).toEqual([]);
    const outcome = await pool.query(`SELECT status FROM showcase_lead_email_outbox
      WHERE lead_id = $1`, [secondLead]);
    expect(outcome.rows[0]?.status).toBe("uncertain");
    const tasks = await pool.query(
      `SELECT kind, context FROM staff_tasks
       WHERE dedupe_key = (SELECT 'showcase-lead-email:' || id::text
         FROM showcase_lead_email_outbox WHERE lead_id = $1)`,
      [secondLead],
    );
    expect(tasks.rows).toHaveLength(1);
    expect(tasks.rows[0]).toMatchObject({
      kind: "showcase_lead_email",
      context: {contactEmail: "grace@example.com", locale: "zh-HK", noticeKind: "ack"},
    });
    await repository.claimDue(automationCronActor(), now, 5);
    const repeated = await pool.query(
      `SELECT count(*)::int AS count FROM staff_tasks
       WHERE dedupe_key = (SELECT 'showcase-lead-email:' || id::text
         FROM showcase_lead_email_outbox WHERE lead_id = $1)`,
      [secondLead],
    );
    expect(repeated.rows[0]?.count).toBe(1);
  });
});
