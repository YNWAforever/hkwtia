import {randomUUID} from "node:crypto";
import {PgDialect} from "drizzle-orm/pg-core";
import type {Pool} from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {portalHistoryPostgres} from "./portal-history-postgres";
const state = vi.hoisted(() => ({db: null as unknown}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => state.db}));
import {listDirectoryPage} from "@/lib/db/repos/portal-paging";
const actor = {kind: "member", userId: "viewer-auth", profileId: "viewer"} as const;
const fixture = portalHistoryPostgres();
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("real PostgreSQL directory pagination", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await fixture.start();
    await pool.query(`CREATE TABLE profiles (id text PRIMARY KEY, display_name text NOT NULL, job_title text, directory_visible boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE companies (id uuid PRIMARY KEY, display_name text, industry text, size_band text, directory_visible boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE company_members (id uuid PRIMARY KEY, company_id uuid, user_id text, revoked_at timestamptz);
      CREATE UNIQUE INDEX active_seat ON company_members(company_id, user_id) WHERE revoked_at IS NULL;
      CREATE TABLE memberships (id uuid PRIMARY KEY, owner_user_id text, company_id uuid, status text, grant_effective_at timestamptz, grant_expires_at timestamptz);`);
    state.db = {execute: async (raw: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const query = new PgDialect().sqlToQuery(raw); return pool.query(query.sql, query.params);
    }};
  }, 60_000);
  afterAll(async () => fixture.stop());
  beforeEach(async () => {
    await pool.query("TRUNCATE profiles, companies, company_members, memberships");
    await pool.query("INSERT INTO profiles VALUES ('viewer', 'Viewer', NULL, FALSE)");
    await pool.query("INSERT INTO memberships (id,owner_user_id,status) VALUES ($1, 'viewer', 'active')", [randomUUID()]);
  });
  it.each([100, 1000, 10000])("pages %i eligible records without duplicates or omissions", async (size) => {
    await pool.query("INSERT INTO profiles SELECT 'member-'||n, CASE WHEN n%3=0 THEN '同名' WHEN n%3=1 THEN 'Élodie' ELSE 'Zed' END, NULL, TRUE FROM generate_series(1,$1::int) n", [size]);
    await pool.query("INSERT INTO memberships (id,owner_user_id,status) SELECT md5(id)::uuid,id,'active' FROM profiles WHERE id<>'viewer'");
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await listDirectoryPage(actor, {limit: 20}, cursor);
      expect(page.items.length).toBeLessThanOrEqual(20);
      for (const item of page.items) {expect(seen.has(item.userId)).toBe(false); seen.add(item.userId);}
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.size).toBe(size);
  }, 120_000);
  it("keeps multiple company projections, removes withdrawn consent and revoked/grant-expired targets on the next read", async () => {
    const a = randomUUID(), b = randomUUID();
    await pool.query("INSERT INTO profiles VALUES ('person','Same',NULL,TRUE), ('seat-only','Seat',NULL,TRUE), ('expired-grant','Expired',NULL,TRUE)");
    await pool.query("INSERT INTO companies(id,display_name) VALUES ($1,'A'),($2,'B')", [a,b]);
    await pool.query("INSERT INTO memberships(id,owner_user_id,company_id,status) VALUES ($1,'person',$2,'past_due'),($3,'owner',$4,'cancel_at_period_end')", [randomUUID(),a,randomUUID(),b]);
    await pool.query("INSERT INTO memberships VALUES ($1,'expired-grant',NULL,'active',now()-interval '2 days',now()-interval '1 day')", [randomUUID()]);
    await pool.query("INSERT INTO company_members VALUES ($1,$2,'person',NULL),($3,$4,'person',NULL),($5,$4,'seat-only',NULL)", [randomUUID(),a,randomUUID(),b,randomUUID()]);
    const first = await listDirectoryPage(actor);
    expect(first.items.filter((r) => r.userId === 'person')).toHaveLength(2);
    expect(first.items.some((r) => r.userId === 'expired-grant')).toBe(false);
    await pool.query("UPDATE companies SET directory_visible=FALSE WHERE id=$1", [a]);
    await pool.query("UPDATE company_members SET revoked_at=now() WHERE user_id='seat-only'");
    const after = await listDirectoryPage(actor);
    expect(after.items.map((r) => [r.userId,r.companyId])).toEqual([['person',b]]);
    await pool.query("UPDATE profiles SET directory_visible=FALSE WHERE id='person'");
    expect((await listDirectoryPage(actor)).items).toEqual([]);
    await pool.query("UPDATE memberships SET status='cancelled' WHERE owner_user_id='viewer'");
    expect((await listDirectoryPage(actor)).items).toEqual([]);
  });
});
