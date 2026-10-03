import {isolatedAuditDatabase} from "../integration/audit-database-fixture";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {getAdminReport} from "@/lib/admin/reports";
import type {AdminActor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
async function psql(query: string): Promise<string> {
  const result = await fixture.pool.query({text: query, rowMode: "array"});
  if (Array.isArray(result)) return "";
  return result.rows.map(row => row.map((value: unknown) => value === null ? "" : String(value)).join("|")).join("\n");
}
const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};

describe.skipIf(!enabled)("Task 10 reconciled reports on isolated Postgres 16", () => {
  beforeAll(async () => {
    fixture = await isolatedAuditDatabase();
    await psql(`
      INSERT INTO profiles (id,auth_user_id,display_name) SELECT id,'auth-'||id,id FROM unnest(ARRAY['member-one','member-two','member-three','member-four','risk-one','risk-boundary','risk-late','app-fixture-2','app-fixture-3','app-fixture-4','app-fixture-5','app-fixture-6']) AS id;
      -- Synthetic historical prices exercise aggregation; they do not set association policy.
      INSERT INTO membership_plans (code,annual_price_hkd,monthly_price_hkd,audience,billing_behavior,seat_allowance) VALUES ('community',1800,null,'individual','free',1),('startup',1200,120,'individual','stripe',1),('corporate',4800,null,'company','stripe',5) ON CONFLICT (code) DO UPDATE SET annual_price_hkd=EXCLUDED.annual_price_hkd,monthly_price_hkd=EXCLUDED.monthly_price_hkd;
      INSERT INTO membership_applications (id,current_step,status,created_at,applicant_user_id,plan_code) VALUES
        ('00000000-0000-4000-8000-000000000000','complete','completed','2026-06-30 15:59:59.999+00','member-one','community'),
        ('11111111-1111-4111-8111-111111111111','complete','completed','2026-06-30 16:00:00+00','member-four','community'),
        ('22222222-2222-4222-8222-222222222222','company','draft','2026-07-10 00:00:00+00','app-fixture-2','community'),
        ('33333333-3333-4333-8333-333333333333','review','pending_review','2026-07-20 00:00:00+00','app-fixture-3','community'),
        ('44444444-4444-4444-8444-444444444444','profile','draft','2026-07-31 15:59:59.999+00','app-fixture-4','community'),
        ('55555555-5555-4555-8555-555555555555','complete','completed','2026-07-31 16:00:00+00','app-fixture-5','community'),
        ('66666666-6666-4666-8666-666666666666','profile','abandoned','2026-07-15 00:00:00+00','app-fixture-6','community');
      INSERT INTO membership_applications (id,applicant_user_id,plan_code,created_at) VALUES ('77777777-7777-4777-8777-777777777777','member-two','startup','2026-06-01T00:00:00Z'),('88888888-8888-4888-8888-888888888888','member-three','corporate','2026-06-01T00:00:00Z');
      INSERT INTO memberships (id,application_id,owner_user_id,company_id,plan_code,status,billing_interval,billing_period_end,seat_limit) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-4000-8000-000000000000','member-one',null,'community','active','annual',null,1),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','77777777-7777-4777-8777-777777777777','member-two',null,'startup','active','monthly',null,1),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','88888888-8888-4888-8888-888888888888','member-three',null,'corporate','cancelled','annual',null,1),
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','11111111-1111-4111-8111-111111111111','member-four',null,'community','active','none',null,1),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',null,'risk-one',null,'community','active','none','2026-07-31 16:00:00+00',1),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',null,'risk-boundary',null,'community','active','none','2026-07-31 16:00:00+00',1),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',null,'risk-late',null,'community','past_due','none','2026-09-29 16:00:00.001+00',1);
      INSERT INTO engagement_scores (profile_id,score,trend,computed_at) VALUES ('risk-one',19,-1,now()),('risk-boundary',20,-1,now()),('risk-late',19,-1,now());
      INSERT INTO engagement_events (profile_id,type,points,metadata,occurred_at) VALUES
        ('member-one','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-06-30 15:59:59.999+00'),
        ('member-one','renewal_failed',-1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-06-30 16:00:00+00'),
        ('member-one','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-07-01 00:00:00+00'),
        ('member-one','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","renewalOrdinal":1}','2026-07-01 00:00:01+00'),
        ('member-two','renewal_failed',-1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","renewalOrdinal":1}','2026-07-10 00:00:00+00'),
        ('member-three','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","renewalOrdinal":2}','2026-07-20 00:00:00+00'),
        ('member-three','renewal_failed',-1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","renewalOrdinal":"poison"}','2026-07-20 00:00:01+00'),
        ('member-three','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3","renewalOrdinal":"1"}','2026-07-20 00:00:02+00'),
        ('member-four','renewal_paid',1,'{"membershipId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4","renewalOrdinal":1}','2026-07-31 16:00:00+00'),
        ('member-four','renewal_paid',1,'{"membershipId":"not-a-membership","renewalOrdinal":1}','2026-07-15 00:00:00+00');
      INSERT INTO events (id,ends_at,slug,title_en,description_en,starts_at,status,published) VALUES
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','2026-06-30 15:59:59.999+00','event-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','Synthetic report event','Synthetic report event','2026-06-30 15:59:59.999+00','published',true),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','2026-06-30 16:00:00+00','event-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','Synthetic report event','Synthetic report event','2026-06-30 16:00:00+00','published',true),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','2026-07-20 00:00:00+00','event-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','Synthetic report event','Synthetic report event','2026-07-20 00:00:00+00','published',true),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4','2026-07-31 16:00:00+00','event-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4','Synthetic report event','Synthetic report event','2026-07-31 16:00:00+00','published',true),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','2026-07-25 00:00:00+00','event-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','Synthetic report event','Synthetic report event','2026-07-25 00:00:00+00','published',true);
      INSERT INTO event_registrations (event_id,profile_id,status) VALUES
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-two','no_show'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-three','cancelled'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','member-four','registered'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3','member-two','waitlist'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4','member-one','attended'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','member-one','attended');
    `);
    database.current = fixture.database;
  }, 90_000);

  afterAll(async () => {if (fixture) await fixture.close(); vi.useRealTimers();});

  it("executes production JSONB aggregates with exact HK boundaries and hand-reconciled facts", async () => {
    const report = await getAdminReport(staff, {from: "2026-07-01", to: "2026-07-31"}, undefined, new Date("2026-07-21T00:00:00.000Z"));
    expect(report).toEqual({
      window: {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"},
      revenue: {arrHkd: 3240, mrrHkd: 270},
      renewal: {numerator: 2, denominator: 3, percentage: 66.7},
      firstYearRenewal: {numerator: 1, denominator: 2, percentage: 50},
      funnel: {started: 5, profileCompleted: 3, checkoutOrReview: 2, activated: 1},
      attendance: {numerator: 2, denominator: 5, percentage: 40},
      atRiskCount: 3,
    });
  }, 30_000);

  it("returns zero financial facts and N/A ratios for an empty real ledger", async () => {
    const empty = await isolatedAuditDatabase();
    const previous = database.current;
    database.current = empty.database;
    try {
      const report = await getAdminReport(staff, {from: "2026-07-01", to: "2026-07-31"}, undefined, new Date("2026-07-21T00:00:00.000Z"));
      expect(report.revenue).toEqual({arrHkd: 0, mrrHkd: 0});
      for (const metric of [report.renewal, report.firstYearRenewal, report.attendance]) {
        expect(metric).toEqual({numerator: 0, denominator: 0, percentage: null});
      }
      expect(report.funnel).toEqual({started: 0, profileCompleted: 0, checkoutOrReview: 0, activated: 0});
      expect(report.atRiskCount).toBe(0);
    } finally {
      database.current = previous;
      await empty.close();
    }
  }, 120_000);

});
