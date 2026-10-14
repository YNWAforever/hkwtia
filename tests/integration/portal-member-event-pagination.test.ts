import {randomUUID} from "node:crypto";
import {PgDialect} from "drizzle-orm/pg-core";
import type {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {portalHistoryPostgres} from "./portal-history-postgres";
const state = vi.hoisted(() => ({db: null as unknown}));
vi.mock("@/lib/db/repos/common", () => ({getDb: async () => state.db}));
import {listMemberEventPage} from "@/lib/db/repos/portal-paging";
const actor = {kind: "member", userId: "auth", profileId: "profile"} as const;
const fixture = portalHistoryPostgres();
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("real PostgreSQL member event pagination", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await fixture.start();
    await pool.query(`CREATE TABLE memberships (id uuid PRIMARY KEY, owner_user_id text, company_id uuid, status text, grant_effective_at timestamptz, grant_expires_at timestamptz);
      CREATE TABLE company_members (id uuid PRIMARY KEY, company_id uuid, user_id text, revoked_at timestamptz);
      ALTER TABLE events ADD COLUMN slug text, ADD COLUMN description_en text NOT NULL DEFAULT '', ADD COLUMN description_zh text,
        ADD COLUMN ends_at timestamptz, ADD COLUMN venue text, ADD COLUMN capacity integer, ADD COLUMN member_only boolean NOT NULL DEFAULT TRUE,
        ADD COLUMN published boolean NOT NULL DEFAULT TRUE, ADD COLUMN registration_mode text NOT NULL DEFAULT 'rsvp', ADD COLUMN external_registration_url text;`);
    await pool.query("INSERT INTO memberships(id,owner_user_id,status) VALUES ($1,'profile','active')", [randomUUID()]);
    state.db = {execute: async (raw: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const query = new PgDialect().sqlToQuery(raw); return pool.query(query.sql, query.params);
    }};
  }, 60_000);
  afterAll(async () => fixture.stop());
  it("keeps microsecond order, bounds rows and excludes drafts, private invitations and past events", async () => {
    await pool.query("INSERT INTO events(id,slug,title_en,starts_at) SELECT md5(n::text)::uuid,'event-'||n,'Event', '2099-01-01T00:00:00Z'::timestamptz + (n % 3) * interval '1 microsecond' FROM generate_series(1,100) n");
    await pool.query("UPDATE events SET status='draft' WHERE slug='event-1'");
    await pool.query("UPDATE events SET visibility='invite_only' WHERE slug='event-2'");
    await pool.query("UPDATE events SET starts_at='2000-01-01' WHERE slug='event-3'");
    let cursor: string | null = null;
    const ids: string[] = [];
    do {const page = await listMemberEventPage(actor, {limit: 20, cursor}); expect(page.items.length).toBeLessThanOrEqual(20);
      ids.push(...page.items.map((r) => r.id)); cursor = page.nextCursor;} while (cursor);
    expect(ids).toHaveLength(97); expect(new Set(ids).size).toBe(97);
    const expected = await pool.query("SELECT id FROM events WHERE status='published' AND visibility<>'invite_only' AND starts_at>=now() ORDER BY starts_at,id");
    expect(ids).toEqual(expected.rows.map((r) => r.id));
    await pool.query("UPDATE memberships SET status='cancelled'");
    expect((await listMemberEventPage(actor)).items).toEqual([]);
  });
});
