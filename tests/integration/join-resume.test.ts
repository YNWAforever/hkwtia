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

import {applicationsRepository} from "@/lib/db/repos/applications";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-join-resume-${process.pid}`;
const actor = {kind: "member", userId: "join-test", profileId: "join-test"} as const;
const other = {kind: "member", userId: "other-test", profileId: "other-test"} as const;
const companyA = randomUUID();
const companyB = randomUUID();
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

function claim(planCode: "startup" | "corporate" = "startup", companyId: string | null = null, newApplication = false) {
  return applicationsRepository.resumeOrCreate(actor, {planCode, companyId, newApplication});
}

describe.skipIf(!enabled)("join resume scope on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    databaseState.current = drizzle(pool);
    await pool.query(`
      CREATE TABLE company_members (company_id uuid NOT NULL, user_id text NOT NULL, revoked_at timestamptz);
      CREATE TABLE membership_applications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_user_id text NOT NULL,
        plan_code text NOT NULL, company_id uuid, current_step text NOT NULL DEFAULT 'profile',
        status text NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query("INSERT INTO company_members (company_id, user_id) VALUES ($1, $3), ($2, $3)", [companyA, companyB, actor.profileId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* setup may have failed */ } }
  });

  it("serializes concurrent starts in the unassigned scope", async () => {
    const rows = await Promise.all(Array.from({length: 8}, () => claim()));
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    const count = await pool!.query("SELECT count(*)::int AS n FROM membership_applications WHERE applicant_user_id = $1 AND plan_code = 'startup' AND company_id IS NULL", [actor.profileId]);
    expect(count.rows[0].n).toBe(1);
  });

  it("separates plans and verified companies, and maps pending steps", async () => {
    const [startupA, startupB, corporateA] = await Promise.all([claim("startup", companyA), claim("startup", companyB), claim("corporate", companyA)]);
    expect(new Set([startupA.id, startupB.id, corporateA.id]).size).toBe(3);
    await pool!.query("UPDATE membership_applications SET status = 'pending_payment' WHERE id = $1", [startupA.id]);
    await pool!.query("UPDATE membership_applications SET status = 'pending_review' WHERE id = $1", [corporateA.id]);
    expect((await claim("startup", companyA)).status).toBe("pending_payment");
    expect((await claim("corporate", companyA)).status).toBe("pending_review");
    await expect(applicationsRepository.resumeOrCreate(other, {planCode: "startup", companyId: companyA, newApplication: false})).rejects.toThrow();
  });

  it("preserves a pending payment when explicitly starting another application", async () => {
    const prior = await claim("startup", companyA);
    const fresh = await claim("startup", companyA, true);
    expect(fresh.id).not.toBe(prior.id);
    const rows = await pool!.query("SELECT status FROM membership_applications WHERE id IN ($1, $2) ORDER BY id", [prior.id, fresh.id]);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.status)).toContain("pending_payment");
  });
});
