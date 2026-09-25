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

import {companiesRepository} from "@/lib/db/repos/companies";
import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-profile-role-" + process.pid;
const companyId = randomUUID();
const profileId = "profile-role-" + process.pid;
const actor = {kind: "member", userId: profileId, profileId} as const;
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

async function waitForMembershipLock(database: Pool, revokerPid: number): Promise<void> {
  const blockedQuery = [
    "SELECT EXISTS (",
    "  SELECT 1 FROM pg_stat_activity",
    "  WHERE datname = current_database()",
    "    AND wait_event_type = 'Lock'",
    "    AND $1::integer = ANY(pg_blocking_pids(pid))",
    "    AND query ILIKE '%memberships%'",
    "    AND query ILIKE '%FOR UPDATE%'",
    ") AS blocked",
  ].join("\n");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const {rows} = await database.query<{blocked: boolean}>(blockedQuery, [revokerPid]);
    if (rows[0]?.blocked) return;
    await delay(50);
  }
  throw new Error("profile submission never waited on the revoker's membership lock");
}

describe.skipIf(!enabled)("company profile role revocation on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    databaseState.current = drizzle(pool);
    await pool.query([
      "CREATE TYPE public_profile_status AS ENUM ('hidden', 'pending_review', 'published', 'rejected');",
      "CREATE TABLE companies (id uuid PRIMARY KEY, legal_name text NOT NULL DEFAULT 'Acme Limited', display_name text NOT NULL DEFAULT 'Acme', website text, industry text, size_band text, description text, logo_reference text, directory_visible boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), slug text, logo_media_id uuid, tags text[] NOT NULL DEFAULT '{}', tagline_en text, tagline_zh_hk text, description_zh_hk text, public_profile_status public_profile_status NOT NULL, public_profile_published_at timestamptz, profile_reviewed_at timestamptz, profile_reviewed_by_profile_id text, profile_rejection_reason text);",
      "CREATE TABLE memberships (company_id uuid PRIMARY KEY);",
      "CREATE TABLE company_members (company_id uuid NOT NULL, user_id text NOT NULL, role text NOT NULL, revoked_at timestamptz, PRIMARY KEY (company_id, user_id));",
    ].join("\n"));
    await pool.query("INSERT INTO companies (id, slug, public_profile_status) VALUES ($1, 'acme', 'hidden')", [companyId]);
    await pool.query("INSERT INTO memberships (company_id) VALUES ($1)", [companyId]);
    await pool.query("INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'admin')", [companyId, profileId]);
  }, 60_000);

  afterAll(async () => {
    try {
      if (pool) await pool.end();
    } finally {
      try { docker(["rm", "-f", container]); } catch { /* Setup may have failed before container creation. */ }
    }
  });

  it("keeps the profile hidden after seat revocation wins the membership lock", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const revoker = await pool.connect();
    let result: Promise<string> | undefined;
    let committed = false;
    try {
      await revoker.query("BEGIN");
      await revoker.query("SELECT company_id FROM memberships WHERE company_id = $1 FOR UPDATE", [companyId]);
      await revoker.query("UPDATE company_members SET revoked_at = now() WHERE company_id = $1 AND user_id = $2", [companyId, profileId]);
      const revokerPid = (await revoker.query<{pid: number}>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      if (!revokerPid) throw new Error("revoker PostgreSQL PID was unavailable");

      const repository = createCompanyProfilesRepository({
        getCompanyRole: async () => "admin", // The preflight read preceded the revocation.
        loadDatabase: async () => drizzle(pool!) as never,
      });
      let settled = false;
      result = repository.submitForReview(actor, companyId)
        .then(() => "wrote", (error: unknown) => error instanceof Error ? error.message : String(error))
        .finally(() => {settled = true;});
      await waitForMembershipLock(pool, revokerPid);
      expect(settled).toBe(false);
      await revoker.query("COMMIT");
      committed = true;
      expect(await result).toBe("FORBIDDEN");
      const {rows} = await pool.query<{public_profile_status: string}>("SELECT public_profile_status FROM companies WHERE id = $1", [companyId]);
      expect(rows[0]?.public_profile_status).toBe("hidden");
    } finally {
      try {
        if (!committed) await revoker.query("ROLLBACK");
      } finally {
        revoker.release();
        if (result) await result;
      }
    }
  }, 20_000);

  it("blocks a portal company rewrite behind revocation and keeps its public copy unchanged", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE company_members SET revoked_at = NULL WHERE company_id = $1 AND user_id = $2", [companyId, profileId]);
    const revoker = await pool.connect();
    let result: Promise<string> | undefined;
    let committed = false;
    try {
      await revoker.query("BEGIN");
      await revoker.query("SELECT company_id FROM memberships WHERE company_id = $1 FOR UPDATE", [companyId]);
      await revoker.query("UPDATE company_members SET revoked_at = now() WHERE company_id = $1 AND user_id = $2", [companyId, profileId]);
      const revokerPid = (await revoker.query<{pid: number}>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      if (!revokerPid) throw new Error("revoker PostgreSQL PID was unavailable");

      let settled = false;
      result = companiesRepository.update(actor, companyId, {displayName: "Unreviewed copy"})
        .then(() => "wrote", (error: unknown) => error instanceof Error ? error.message : String(error))
        .finally(() => {settled = true;});
      await waitForMembershipLock(pool, revokerPid);
      expect(settled).toBe(false);
      await revoker.query("COMMIT");
      committed = true;
      expect(await result).toBe("FORBIDDEN");
      const {rows} = await pool.query<{display_name: string}>("SELECT display_name FROM companies WHERE id = $1", [companyId]);
      expect(rows[0]?.display_name).toBe("Acme");
    } finally {
      try {
        if (!committed) await revoker.query("ROLLBACK");
      } finally {
        revoker.release();
        if (result) await result;
      }
    }
  }, 20_000);

  it("allows a manager to edit a join-stage company without a membership row", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE company_members SET revoked_at = NULL WHERE company_id = $1 AND user_id = $2", [companyId, profileId]);
    await pool.query("DELETE FROM memberships WHERE company_id = $1", [companyId]);
    await expect(companiesRepository.update(actor, companyId, {displayName: "Join-stage edit"}))
      .resolves.toMatchObject({displayName: "Join-stage edit"});
  }, 20_000);
});