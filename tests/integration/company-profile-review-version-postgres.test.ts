import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";
import type {Actor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-company-review-" + process.pid;
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

describe.skipIf(!enabled)("company profile review on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query(`CREATE TABLE companies (
      id uuid PRIMARY KEY, display_name text NOT NULL, slug text,
      public_profile_status text NOT NULL, description text, website text,
      logo_media_id uuid, public_profile_published_at timestamptz,
      profile_reviewed_at timestamptz, profile_reviewed_by_profile_id text,
      profile_rejection_reason text, updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query("CREATE TABLE media (id uuid PRIMARY KEY, url text, archived_at timestamptz)");
    await pool.query(`CREATE TABLE audit_events (
      actor_user_id text, actor_type text, action text, target_type text,
      target_id uuid, metadata jsonb
    )`);
    await pool.query(`INSERT INTO companies (id, display_name, slug, public_profile_status, description)
      VALUES ($1, 'Acme', 'acme', 'pending_review', 'Original copy')`, [companyId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it.each(["approve", "reject"] as const)("refuses stale %s after pending content changes", async (decision) => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE companies SET public_profile_status = 'pending_review', description = 'Original copy' WHERE id = $1", [companyId]);
    const repo = createCompanyProfilesRepository({loadDatabase: async () => drizzle(pool!) as never});
    const queue = await repo.listForReview(staff);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.description).toBe("Original copy");
    const reviewVersion = queue[0]?.review_version;
    expect(reviewVersion).toMatch(/^\d+$/);
    await pool.query("UPDATE companies SET description = 'Unreviewed copy' WHERE id = $1", [companyId]);
    const input = decision === "approve"
      ? {decision, reviewVersion}
      : {decision, reason: "Needs work", reviewVersion};
    await expect(repo.review(staff, companyId, input)).rejects.toThrow("INVALID_PROFILE_TRANSITION");
    const {rows} = await pool.query<{public_profile_status: string; description: string}>(
      "SELECT public_profile_status, description FROM companies WHERE id = $1", [companyId],
    );
    expect(rows[0]).toMatchObject({public_profile_status: "pending_review", description: "Unreviewed copy"});
    const audit = await pool.query("SELECT action FROM audit_events");
    expect(audit.rows).toHaveLength(0);
  });

  it("publishes the current snapshot and records one audit row", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const repo = createCompanyProfilesRepository({loadDatabase: async () => drizzle(pool!) as never});
    const reviewVersion = (await repo.listForReview(staff))[0]?.review_version;
    expect(reviewVersion).toMatch(/^\d+$/);
    await expect(repo.review(staff, companyId, {decision: "approve", reviewVersion}))
      .resolves.toMatchObject({public_profile_status: "published", description: "Unreviewed copy"});
    const audit = await pool.query<{action: string}>("SELECT action FROM audit_events");
    expect(audit.rows).toEqual([{action: "company.profile.approved"}]);
  });});
