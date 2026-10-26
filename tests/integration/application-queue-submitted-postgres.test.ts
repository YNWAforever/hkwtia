// @vitest-environment node
import {createHash, randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Pool, neonConfig, type PoolClient} from '@neondatabase/serverless';
import {drizzle} from 'drizzle-orm/neon-serverless';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {localAcceptanceTarget} from '@/scripts/acceptance/local-config';
import {membershipApplicationStatusEnum} from '@/lib/db/server-schema';

const state = vi.hoisted(() => ({db: null as unknown}));
vi.mock('@/lib/db/repos/common', async original => ({
  ...await original<typeof import('@/lib/db/repos/common')>(), getDb: async () => state.db,
}));
import {adminMembersRepository} from '@/lib/db/repos/admin-members';
import {createAdminDashboardRepository} from '@/lib/db/repos/admin-dashboard';

const target = process.env.HKWTIA_DB_ACCEPTANCE === '1' ? localAcceptanceTarget() : null;
const marker = 'uc224243-' + randomUUID();
const profileId = marker + '-profile';
const idFor = (label: string) => {
  const hex = createHash('sha256').update(marker + ':' + label).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
// Three drafts deliberately equal the submitted count: count-only checks cannot detect a swapped set.
const statuses = [...membershipApplicationStatusEnum.enumValues, 'draft', 'draft', 'pending_review'] as const;
const ids = statuses.map((status, i) => idFor(`${status}-${i}`));
const expected = ids.filter((_, i) => ['pending_review', 'pending_payment'].includes(statuses[i])).sort();
// Pure authorization input only; this object is NOT an Auth session.
const staff = {kind: 'staff', userId: 'synthetic-unbound-staff', profileId} as const;
let pool: Pool;
let client: PoolClient;
let before: number | null;
let dashboardStatement: SQL | undefined;
let verifiedIds: string[] | undefined;
const dialect = new PgDialect();
const dashboard = createAdminDashboardRepository(async () => ({async execute(statement) {
  const query = dialect.sqlToQuery(statement);
  if (query.sql.includes('FROM "membership_applications"') && query.sql.includes(' in (')) dashboardStatement = statement;
  return (state.db as ReturnType<typeof drizzle>).execute(statement);
}}));

describe.skipIf(!target)('submitted queue same PostgreSQL ID set (synthetic actor; no Auth/browser)', {timeout:120000}, () => {
  beforeAll(async () => {
    neonConfig.webSocketConstructor = WebSocket;
    pool = new Pool({connectionString: target!.databaseUrl, connectionTimeoutMillis:15000});
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    state.db = drizzle(client);
    before = (await dashboard.counts(staff)).submittedApplications;
    expect(before).not.toBeNull();
    await client.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,consent_marketing,whatsapp_opt_in,directory_visible) VALUES($1,$2,$3,$4,'member','en',false,false,false)", [profileId,'synthetic-unbound:'+profileId,marker+'@acceptance.example.test',marker]);
    for (const [i,status] of statuses.entries()) {
      // Near misses have the same review step and timestamp as submitted rows.
      await client.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,status,current_step,updated_at) VALUES($1,$2,'community',$3,'review','2026-10-26T00:00:00.000123Z')", [ids[i],profileId,status]);
    }
  },120000);
  afterAll(async () => {
    if (client) {
      try {
        // Exact-ID deletes and readback, then rollback: no fixture commits or unrelated writes.
        await client.query('DELETE FROM membership_applications WHERE id=ANY($1::uuid[])', [ids]);
        await client.query('DELETE FROM profiles WHERE id=$1', [profileId]);
        expect((await client.query('SELECT id FROM membership_applications WHERE id=ANY($1::uuid[])', [ids])).rowCount).toBe(0);
        expect((await client.query('SELECT id FROM profiles WHERE id=$1', [profileId])).rowCount).toBe(0);
      } finally {await client.query('ROLLBACK'); client.release();}
      expect((await pool.query('SELECT id FROM membership_applications WHERE id=ANY($1::uuid[])', [ids])).rowCount).toBe(0);
      expect((await pool.query('SELECT id FROM profiles WHERE id=$1', [profileId])).rowCount).toBe(0);
    }
    if (pool) await pool.end();
    if (verifiedIds) writeFileSync('/tmp/uc22-42-43-run.json', JSON.stringify({
      marker, projectId:target!.identity.projectId, branchId:target!.identity.branchId,
      fixtures:ids.map((id,i) => ({id,status:statuses[i]})), profileId,
      expectedIds:expected, dashboardIds:verifiedIds, queueIds:verifiedIds,
      countDelta:expected.length, pagesPerDirection:3, cleanupReadbackAbsent:true,
    }, null, 2) + '\n');
  },120000);
  it('matches expected IDs, actual dashboard SQL IDs/count delta, and every queue page in both directions', async () => {
    expect(expected).toHaveLength(3);
    const after = (await dashboard.counts(staff)).submittedApplications;
    expect(after).not.toBeNull();
    expect(after! - before!).toBe(expected.length);
    expect(dashboardStatement).toBeDefined();
    const query = dialect.sqlToQuery(dashboardStatement!);
    // Diagnostic projection of the REAL dashboard statement: preserve its entire predicate.
    expect(query.sql.match(/SELECT count\(\*\) AS count/g)).toHaveLength(1);
    const projected = query.sql.replace('SELECT count(*) AS count', 'SELECT "membership_applications"."id"');
    const dashboardIds = (await client.query(projected + ` AND "membership_applications"."id" = ANY($${query.params.length+1}::uuid[])`, [...query.params,ids])).rows.map(row => row.id).sort();
    expect(dashboardIds).toEqual(expected);
    for (const sort of ['updated_desc','updated_asc'] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await adminMembersRepository.getApplicationQueuePage(staff, {status:'submitted',search:marker,limit:1,sort,cursor});
        expect(page.totalMatching).toBe(expected.length);
        seen.push(...page.items.map(row => row.applicationId));
        cursor = page.nextCursor;
        expect(++pages).toBeLessThanOrEqual(expected.length);
      } while (cursor);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(seen.length);
      expect([...seen].sort()).toEqual(expected);
      expect([...seen].sort()).toEqual(dashboardIds);
    }
    verifiedIds = dashboardIds;
  });
});
