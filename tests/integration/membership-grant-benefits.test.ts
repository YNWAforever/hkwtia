import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {isolatedBatchDatabase} from "./admin-batch-fixture";

const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...await original<typeof import("@/lib/db/repos/common")>(), getDb: async () => state.database,
}));
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";
import {inviteSeat} from "@/lib/db/repos/seats";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const actor = {kind: "member", userId: "grant-c", profileId: "grant-c"} as const;
const companyId = randomUUID();
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("finite grant benefits with the expiry job paused", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase();
    state.database = fixture.database;
    await fixture.pool.query(`
      ALTER TABLE profiles ADD COLUMN directory_visible boolean NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN directory_visible boolean NOT NULL DEFAULT true,
        ADD COLUMN industry text, ADD COLUMN size_band text, ADD COLUMN slug text,
        ADD COLUMN tagline_en text, ADD COLUMN tagline_zh_hk text, ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
        ADD COLUMN website text, ADD COLUMN logo_media_id uuid, ADD COLUMN public_profile_status text;
      ALTER TABLE company_members ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
        ADD COLUMN role text NOT NULL DEFAULT 'owner', ADD COLUMN joined_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE memberships ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
      CREATE TABLE media (id uuid PRIMARY KEY, url text, archived_at timestamptz);
      CREATE TABLE seat_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid,
        inviter_user_id text, invited_email text, role text, token_digest text, expires_at timestamptz,
        accepted_at timestamptz, accepted_by_user_id text, revoked_at timestamptz, created_at timestamptz DEFAULT now());
    `);
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("excludes future and expired personal grants from directory candidates while retaining historic memberships", async () => {
    await fixture.pool.query(`INSERT INTO memberships (owner_user_id,plan_code,status,grant_effective_at,grant_expires_at,grant_reason,grant_actor_profile_id)
      VALUES ('grant-c','corporate','active',now()+interval '1 day',now()+interval '2 days','Synthetic grant only','root'),
             ('grant-d','corporate','active',now()-interval '2 days',now()-interval '1 day','Synthetic grant only','root')`);
    const candidates = await portalContentRepository.listDirectory(actor);
    expect(candidates.map((row) => row.userId).sort()).toEqual(["a", "b"]);
    // The status worker has deliberately not changed either grant.
    expect((await fixture.pool.query("SELECT status FROM memberships WHERE owner_user_id IN ('grant-c','grant-d')")).rows).toEqual([{status: "active"}, {status: "active"}]);
  });

  it.each(["future", "expired", "current"] as const)("gates company seats, invitations and the public plan badge for a %s grant", async (window) => {
    await fixture.pool.query("INSERT INTO companies (id,display_name,slug,public_profile_status) VALUES ($1,'Synthetic Company','synthetic-company','published') ON CONFLICT DO NOTHING", [companyId]);
    await fixture.pool.query("DELETE FROM company_members WHERE company_id=$1", [companyId]);
    await fixture.pool.query("INSERT INTO company_members (company_id,user_id) VALUES ($1,'grant-c')", [companyId]);
    await fixture.pool.query("DELETE FROM memberships WHERE company_id=$1", [companyId]);
    const offsets = window === "future" ? [1, 2] : window === "expired" ? [-2, -1] : [-1, 1];
    await fixture.pool.query(`INSERT INTO memberships (company_id,plan_code,status,seat_limit,grant_effective_at,grant_expires_at,grant_reason,grant_actor_profile_id)
      VALUES ($1,'corporate','active',12,now()+$2*interval '1 day',now()+$3*interval '1 day','Synthetic company grant','root')`, [companyId, ...offsets]);
    const repository = createCompanyProfilesRepository();
    const summaries = await repository.listPublished({q: null, tag: null, plan: null});
    expect(summaries).toHaveLength(1); // Publication is independent of membership; only the badge changes.
    expect.soft(summaries[0]?.plan).toBe(window === "current" ? "corporate" : null);
    if (window === "current") {
      await expect(portalContentRepository.getSeatOverview(actor, companyId)).resolves.toMatchObject({seatLimit: 12});
      await expect(inviteSeat(actor, companyId, {email: "invite@example.test"})).resolves.toMatchObject({companyId});
    } else {
      await expect(portalContentRepository.getSeatOverview(actor, companyId)).rejects.toThrow("FORBIDDEN");
      await expect(inviteSeat(actor, companyId, {email: "invite@example.test"})).rejects.toThrow("FORBIDDEN");
      expect((await fixture.pool.query("SELECT count(*)::int AS n FROM seat_invitations")).rows[0]?.n).toBe(0);
    }
  });
});
