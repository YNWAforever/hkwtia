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
import {adminMembersRepository} from "@/lib/db/repos/admin-members";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-member-filter-${process.pid}`;
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const companyA = randomUUID();
const companyB = randomUUID();
const activeStartup = randomUUID();
const expiredCorporate = randomUUID();
const activeCorporate = randomUUID();
let pool: Pool | undefined;
function docker(args: string[]) {return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});}
async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {docker(["exec", container, "pg_isready", "-U", "postgres"]); return;} catch {await delay(100);}
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

describe.skipIf(!enabled)("member filters and matching selection on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await ready();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    databaseState.current = drizzle(pool);
    await pool.query(`
      CREATE TABLE profiles (id text PRIMARY KEY, display_name text NOT NULL, email text, phone text, job_title text, locale text NOT NULL);
      CREATE TABLE companies (id uuid PRIMARY KEY, display_name text NOT NULL);
      CREATE TABLE company_members (user_id text NOT NULL, company_id uuid NOT NULL, revoked_at timestamptz);
      CREATE TABLE memberships (id uuid PRIMARY KEY, owner_user_id text, company_id uuid, plan_code text NOT NULL, status text NOT NULL, billing_period_end timestamptz);
      CREATE TABLE engagement_scores (profile_id text PRIMARY KEY, score numeric NOT NULL);
    `);
    await pool.query("INSERT INTO profiles VALUES ('ada','Ada','ada@example.test','123','Founder','en'),('bea','Bea','bea@example.test','456','Director','zh-HK'),('cam','Cam','cam@example.test',NULL,NULL,'en')");
    await pool.query("INSERT INTO companies VALUES ($1,'Startup Co'),($2,'Corporate Co')", [companyA, companyB]);
    await pool.query("INSERT INTO company_members VALUES ('ada',$1,NULL),('ada',$2,NULL),('bea',$2,NULL)", [companyA, companyB]);
    await pool.query("INSERT INTO memberships VALUES ($1,NULL,$4,'startup','active','2026-09-30T15:59:59Z'),($2,NULL,$5,'corporate','expired','2026-10-01T16:00:00Z'),($3,'bea',NULL,'corporate','active','2026-09-30T16:00:00Z')", [activeStartup, expiredCorporate, activeCorporate, companyA, companyB]);
  }, 60_000);
  afterAll(async () => {try {if (pool) await pool.end();} finally {try {docker(["rm", "-f", container]);} catch { /* setup may have failed */ }}});

  it("requires status and plan to match the same membership row", async () => {
    const page = await adminMembersRepository.search(staff, {status: ["active"], planCode: ["corporate"]});
    expect(page.items.map((item) => item.profileId)).toEqual(["bea"]);
    expect(page.items[0]?.matchingMembershipIds).toEqual([activeCorporate]);
    expect(page.totalMatching).toBe(1);
  });

  it("returns every matching company membership ID instead of the representative row ID", async () => {
    const page = await adminMembersRepository.search(staff, {companyId: companyB});
    expect(page.items.find((item) => item.profileId === "ada")?.matchingMembershipIds).toEqual([expiredCorporate]);
    expect(page.items.find((item) => item.profileId === "bea")?.matchingMembershipIds).toEqual([expiredCorporate]);
  });

  it("interprets renewal days as Hong Kong half-open UTC windows", async () => {
    const page = await adminMembersRepository.search(staff, {renewalFrom: "2026-10-01", renewalTo: "2026-10-01"});
    expect(page.items.map((item) => item.profileId)).toEqual(["bea"]);
    expect(page.items[0]?.matchingMembershipIds).toEqual([activeCorporate]);
  });

  it("does not broaden an intersection into an OR or pass an invalid cursor to another filter", async () => {
    const page = await adminMembersRepository.search(staff, {status: ["active"], planCode: ["patron"]});
    expect(page.items).toEqual([]);
    const first = await adminMembersRepository.search(staff, {status: ["active"], limit: 1});
    expect(first.nextCursor).toBeTruthy();
    await expect(adminMembersRepository.search(staff, {status: ["expired"], limit: 1, cursor: first.nextCursor})).rejects.toThrow();
  });
});
