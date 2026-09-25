import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createShowcaseRepository, databaseStore} from "@/lib/db/repos/showcase";
import type {Actor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-showcase-manager-" + process.pid;
const companyId = randomUUID();
const profileId = "showcase-manager-" + process.pid;
const actor: Actor = {kind: "member", userId: profileId, profileId};
let pool: Pool | undefined;

const listing = {
  slug: "manager-race", nameEn: "Manager Race", nameZhHk: "經理競爭",
  taglineEn: "A valid listing", taglineZhHk: "有效項目",
  descriptionEn: "Original description", descriptionZhHk: "原本描述",
  category: "software", useCases: ["logistics"], deploymentOptions: ["cloud"],
  supportedLanguages: ["en"], worksWith: ["ERP"], videoUrl: null,
  caseStudyUrl: null, caseStudySummaryEn: null, caseStudySummaryZhHk: null,
  logoReference: null,
};

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

async function waitForMembershipLock(database: Pool, revokerPid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const {rows} = await database.query<{blocked: boolean}>(`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND $1::integer = ANY(pg_blocking_pids(pid))
          AND query ILIKE '%memberships%' AND query ILIKE '%FOR UPDATE%') AS blocked
    `, [revokerPid]);
    if (rows[0]?.blocked) return;
    await delay(50);
  }
  throw new Error("showcase write never waited on the revoker's membership lock");
}
describe.skipIf(!enabled)("showcase manager revocation on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query("CREATE TABLE memberships (company_id uuid PRIMARY KEY)");
    await pool.query("CREATE TABLE company_members (company_id uuid, user_id text, role text, revoked_at timestamptz, PRIMARY KEY (company_id, user_id))");
    await pool.query(`CREATE TABLE showcase_listings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL UNIQUE,
      slug text NOT NULL, status text NOT NULL, premium boolean NOT NULL DEFAULT false,
      gone_global boolean NOT NULL DEFAULT false, views integer NOT NULL DEFAULT 0,
      member_since date NOT NULL, name_en text NOT NULL, name_zh_hk text NOT NULL,
      tagline_en text NOT NULL, tagline_zh_hk text NOT NULL,
      description_en text NOT NULL, description_zh_hk text NOT NULL,
      category text NOT NULL, use_cases text[] NOT NULL DEFAULT '{}',
      deployment_options text[] NOT NULL DEFAULT '{}', supported_languages text[] NOT NULL DEFAULT '{}',
      works_with text[] NOT NULL DEFAULT '{}', video_url text, case_study_url text,
      case_study_summary_en text, case_study_summary_zh_hk text, logo_reference text,
      logo_media_id uuid, reviewed_at timestamptz, reviewed_by_profile_id text,
      rejection_reason text, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query("INSERT INTO memberships (company_id) VALUES ($1)", [companyId]);
    await pool.query("INSERT INTO company_members (company_id, user_id, role, revoked_at) VALUES ($1, $2, 'admin', now())", [companyId, profileId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("does not write after manager access was revoked following preflight", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    // The preflight completed earlier and still reports its old answer.
    const repo = createShowcaseRepository({
      store: databaseStore(async () => drizzle(pool!) as never),
      getCompanyRole: async () => "admin",
    });
    await expect(repo.upsertDraft(actor, companyId, listing)).rejects.toThrow("FORBIDDEN");
    const {rows} = await pool.query<{count: string}>("SELECT count(*)::text AS count FROM showcase_listings");
    expect(rows[0]?.count).toBe("0");
  });
  it("waits for a concurrent seat revocation and refuses the write", async () => {
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
      const repo = createShowcaseRepository({
        store: databaseStore(async () => drizzle(pool!) as never),
        getCompanyRole: async () => "admin",
      });
      let settled = false;
      result = repo.upsertDraft(actor, companyId, listing)
        .then(() => "wrote", (error: unknown) => error instanceof Error ? error.message : String(error))
        .finally(() => { settled = true; });
      await waitForMembershipLock(pool, revokerPid);
      expect(settled).toBe(false);
      await revoker.query("COMMIT");
      committed = true;
      expect(await result).toBe("FORBIDDEN");
      const {rows} = await pool.query<{count: string}>("SELECT count(*)::text AS count FROM showcase_listings");
      expect(rows[0]?.count).toBe("0");
    } finally {
      try { if (!committed) await revoker.query("ROLLBACK"); }
      finally { revoker.release(); if (result) await result; }
    }
  }, 20_000);

  it("lets a current manager save a draft", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE company_members SET revoked_at = NULL WHERE company_id = $1 AND user_id = $2", [companyId, profileId]);
    const repo = createShowcaseRepository({
      store: databaseStore(async () => drizzle(pool!) as never),
      getCompanyRole: async () => "admin",
    });
    await expect(repo.upsertDraft(actor, companyId, listing)).resolves.toMatchObject({
      companyId, status: "draft", slug: "manager-race",
    });
  });});
