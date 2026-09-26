import {execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {databaseStore} from "@/lib/db/repos/showcase";
import type {Database} from "@/lib/db/repos/common";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-showcase-lead-${process.pid}`;
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

const baseLead = {
  listingId: "11111111-1111-4111-8111-111111111111",
  contactName: "Ada Lovelace", email: "ada@example.com",
  organization: "Analytical Engines", message: "Please introduce us.",
  locale: "en", idempotencyKey: "showcase-contact-1",
} as const;

describe.skipIf(!enabled)("showcase lead contact capture on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await ready();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    await pool.query(`CREATE TABLE contacts (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      profile_id text, company_id uuid, display_name text, email text,
      phone_e164 text, whatsapp_member_id text,
      source text NOT NULL, stage text DEFAULT 'new' NOT NULL,
      owner_profile_id text, tags text[] DEFAULT '{}'::text[] NOT NULL,
      locale varchar(10) DEFAULT 'en' NOT NULL,
      whatsapp_opt_in boolean DEFAULT false NOT NULL,
      whatsapp_consent_at timestamptz, whatsapp_consent_source text,
      whatsapp_consent_text_version text, whatsapp_opted_out_at timestamptz,
      last_inbound_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
      CONSTRAINT refuse_test_contact CHECK (email <> 'boom@example.com')
    )`);
    await pool.query(`CREATE TABLE leads (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY, listing_id uuid, contact_id uuid,
      contact_name text NOT NULL, email text NOT NULL, organization text, message text,
      locale varchar(10) DEFAULT 'en' NOT NULL, status text DEFAULT 'new' NOT NULL,
      idempotency_key text NOT NULL UNIQUE,
      created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL
    )`);
    await pool.query(`CREATE TABLE showcase_lead_email_outbox (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      kind text NOT NULL, status text DEFAULT 'queued' NOT NULL,
      payload jsonb, idempotency_key text NOT NULL UNIQUE,
      attempt_count integer DEFAULT 0 NOT NULL,
      next_attempt_at timestamptz DEFAULT now() NOT NULL,
      claim_expires_at timestamptz, first_attempt_at timestamptz,
      provider_id text, error_code text,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      UNIQUE (lead_id, kind),
      CONSTRAINT refuse_outbox_test
        CHECK (idempotency_key NOT LIKE 'showcase-lead:showcase-contact-outbox-boom:%')
    )`);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("links one prospect contact to one lead and creates no orphan on replay", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const store = databaseStore(async () => drizzle(pool!) as unknown as Database);
    const first = await store.insertLead(baseLead);
    expect(first?.contactId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
    await expect(store.insertLead(baseLead)).resolves.toBeNull();
    const rows = await pool.query(`SELECT l.id, l.contact_id, c.source, c.email, c.whatsapp_opt_in
      FROM leads l JOIN contacts c ON c.id = l.contact_id`);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({source: "showcase_intro", email: "ada@example.com", whatsapp_opt_in: false});
    const contacts = await pool.query("SELECT count(*)::int AS count FROM contacts");
    expect(contacts.rows[0]?.count).toBe(1);
    const notifications = await pool.query(
      "SELECT kind, status, idempotency_key FROM showcase_lead_email_outbox ORDER BY kind",
    );
    expect(notifications.rows).toEqual([
      {kind: "ack", status: "queued", idempotency_key: "showcase-lead:showcase-contact-1:ack"},
      {kind: "staff", status: "queued", idempotency_key: "showcase-lead:showcase-contact-1:staff"},
    ]);
  });

  it("rolls back the lead and contact when notification enqueue fails", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const store = databaseStore(async () => drizzle(pool!) as unknown as Database);
    await expect(store.insertLead({...baseLead, idempotencyKey: "showcase-contact-outbox-boom"}))
      .rejects.toThrow();
    const leads = await pool.query(
      "SELECT count(*)::int AS count FROM leads WHERE idempotency_key = $1",
      ["showcase-contact-outbox-boom"],
    );
    expect(leads.rows[0]?.count).toBe(0);
    const contacts = await pool.query("SELECT count(*)::int AS count FROM contacts");
    expect(contacts.rows[0]?.count).toBe(1);
  });

  it("rolls back the lead when contact capture fails", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool unavailable");
    const store = databaseStore(async () => drizzle(pool!) as unknown as Database);
    await expect(store.insertLead({...baseLead, idempotencyKey: "showcase-contact-boom", email: "boom@example.com"}))
      .rejects.toThrow();
    const rows = await pool.query("SELECT count(*)::int AS count FROM leads WHERE idempotency_key = $1", ["showcase-contact-boom"]);
    expect(rows.rows[0]?.count).toBe(0);
  });
});
