import {isolatedAuditDatabase} from "../integration/audit-database-fixture";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {parseSegmentRouteQuery} from "@/lib/admin/segment-schema";
import {previewSegment} from "@/lib/admin/segments";
import {AT_RISK_RENEWAL_DAYS, listAtRiskMembers} from "@/lib/admin/at-risk";
import {systemActor} from "@/lib/auth/authorize";
import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {campaignsRepository} from "@/lib/db/repos/campaigns";
import {jobsRepository} from "@/lib/db/repos/jobs";
import type {AdminActor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
async function psql(query: string): Promise<string> {
  const result = await fixture.pool.query({text: query, rowMode: "array"});
  if (Array.isArray(result)) return "";
  return result.rows.map(row => row.map((value: unknown) => value === null ? "" : String(value)).join("|")).join("\n");
}
const asOf = new Date("2026-07-19T00:00:00.000Z");
const staff: AdminActor = {kind: "staff", userId: "auth-staff-1", profileId: "staff-1"};
const applicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const customerId = "cus_task7";
const subscriptionId = "sub_task7";

function renewalCommand(eventId: string, eventType: "invoice.paid" | "invoice.payment_failed", start: Date, created: number): WebhookLifecycleCommand {
  return {
    eventId,
    eventType,
    eventCreated: created,
    membershipId,
    applicationId,
    planCode: "startup",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: null,
    nextStatus: eventType === "invoice.paid" ? "active" : "past_due",
    billingPeriodStart: start,
    billingPeriodEnd: new Date(start.getTime() + 365 * 86_400_000),
    cancelAtPeriodEnd: false,
    isRenewal: true,
  };
}

describe.skipIf(!enabled)("Task 7 production repositories on isolated Postgres 16", () => {
  beforeAll(async () => {
    fixture = await isolatedAuditDatabase();
    await psql(`
      INSERT INTO profiles (id, auth_user_id, display_name, email, consent_marketing) VALUES
        ('risk-minus', 'auth-risk-minus', 'Risk Minus', 'minus@example.test', true),
        ('risk-zero-b', 'auth-risk-zero-b', 'Risk Zero B', 'zero-b@example.test', true),
        ('risk-zero-a', 'auth-risk-zero-a', 'Risk Zero A', 'zero-a@example.test', true),
        ('risk-sixty', 'auth-risk-sixty', 'Risk Sixty', 'sixty@example.test', true),
        ('risk-plus', 'auth-risk-plus', 'Risk Plus', 'plus@example.test', true),
        ('risk-score20', 'auth-risk-score20', 'Risk Score 20', 'score20@example.test', true),
        ('risk-score19', 'auth-risk-score19', 'Risk Score 19', 'score19@example.test', true),
        ('job-profile', 'auth-job-profile', 'Job Profile', 'job@example.test', true);
      INSERT INTO engagement_scores (profile_id, score, trend, computed_at)
        SELECT id, CASE WHEN id = 'risk-score20' THEN 20 ELSE 19 END, CASE WHEN id='risk-score19' THEN -1 ELSE 0 END, now()
        FROM profiles WHERE id LIKE 'risk-%';
      INSERT INTO profiles (id,auth_user_id,role,display_name) VALUES ('staff-1','auth-staff-1','staff','Synthetic Staff');
      INSERT INTO membership_applications (id, applicant_user_id, plan_code) VALUES
        ('11111111-1111-4111-8111-111111111111', 'risk-minus', 'corporate'),
        ('22222222-2222-4222-8222-222222222222', 'risk-zero-b', 'corporate'),
        ('33333333-3333-4333-8333-333333333333', 'risk-zero-a', 'corporate'),
        ('44444444-4444-4444-8444-444444444444', 'risk-sixty', 'corporate'),
        ('55555555-5555-4555-8555-555555555555', 'risk-plus', 'corporate'),
        ('66666666-6666-4666-8666-666666666666', 'risk-score20', 'corporate'),
        ('77777777-7777-4777-8777-777777777777', 'risk-score19', 'corporate'),
        ('${applicationId}', 'job-profile', 'startup');
      INSERT INTO memberships (id, application_id, owner_user_id, plan_code, status, stripe_customer_id, stripe_subscription_id, billing_period_end, seat_limit) VALUES
        ('11111111-aaaa-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'risk-minus', 'corporate', 'active', null, null, '${new Date(asOf.getTime() - 1).toISOString()}', 1),
        ('22222222-aaaa-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'risk-zero-b', 'corporate', 'past_due', null, null, '${asOf.toISOString()}', 1),
        ('33333333-aaaa-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'risk-zero-a', 'corporate', 'active', null, null, '${asOf.toISOString()}', 1),
        ('44444444-aaaa-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', 'risk-sixty', 'corporate', 'active', null, null, '${new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * 86_400_000).toISOString()}', 1),
        ('55555555-aaaa-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'risk-plus', 'corporate', 'active', null, null, '${new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * 86_400_000 + 1).toISOString()}', 1),
        ('66666666-aaaa-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', 'risk-score20', 'corporate', 'active', null, null, '${asOf.toISOString()}', 1),
        ('77777777-aaaa-4777-8777-777777777777', '77777777-7777-4777-8777-777777777777', 'risk-score19', 'corporate', 'active', null, null, '${new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * 86_400_000 + 1).toISOString()}', 1),
        ('${membershipId}', '${applicationId}', 'job-profile', 'startup', 'active', '${customerId}', '${subscriptionId}', '${new Date(asOf.getTime() + 365 * 86_400_000).toISOString()}', 1);
      UPDATE profiles SET last_login_at='${asOf.toISOString()}' WHERE id IN ('risk-score19','risk-score20');
    `);
  }, 90_000);

  afterAll(async () => {if (fixture) await fixture.close(); vi.useRealTimers();});

  beforeEach(() => {
    database.current = fixture.database;
    vi.useFakeTimers({toFake: ["Date"]});
    vi.setSystemTime(asOf);
  });

  it("preserves the existing OR risk rules at 19/20 and -1ms/0/120d/+1ms while a segment keeps its explicit 60-day scope", async () => {
    const atRisk = await listAtRiskMembers(staff, {asOf});
    expect(atRisk.map(({profileId}) => profileId)).toEqual(["risk-zero-a", "risk-zero-b", "risk-sixty", "risk-score19"]);

    const sixtyDays = await previewSegment(staff, {...parseSegmentRouteQuery({scoreMax: "19", renewalWithinDays: "60"}), limit: 50, cursor: null});
    expect(sixtyDays.items.map(({id}) => id)).toEqual(["risk-zero-a", "risk-zero-b"]);

    const query = parseSegmentRouteQuery({
      profileId: "risk-zero-b",
      status: "past_due",
      scoreMax: "19",
      renewalWithinDays: "60",
    });
    const preview = await previewSegment(staff, {...query, limit: 50, cursor: null});
    expect(preview.total).toBe(1);
    expect(preview.items.map(({id}) => id)).toEqual(["risk-zero-b"]);
    const audience = await campaignsRepository.audienceForSegment(staff, database.current, query.filter);
    expect(audience.map(({kind, id}) => `${kind}:${id}`)).toEqual(["member:risk-zero-b"]);
  }, 20_000);

  it("uses the production jobs transaction for concurrent replay and stateful renewal ordinals despite poisoned legacy JSON", async () => {
    vi.useRealTimers();
    await psql(`
      TRUNCATE jobs, audit_events, engagement_events;
      UPDATE memberships SET status = 'active' WHERE id = '${membershipId}';
      INSERT INTO engagement_events (profile_id, type, points, metadata, occurred_at)
      VALUES ('job-profile', 'renewal_failed', -10, '{"membershipId":"${membershipId}","periodStart":"legacy","periodEnd":"legacy","renewalOrdinal":"poison"}', now() - interval '1 year');
    `);

    const firstPeriod = new Date("2026-07-01T00:00:00.000Z");
    const replay = renewalCommand("evt_task7_failed", "invoice.payment_failed", firstPeriod, 100);
    const replayResults = await Promise.all([
      jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), replay),
      jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"), replay),
    ]);
    expect(replayResults.sort()).toEqual(["duplicate", "processed"]);

    await expect(jobsRepository.processWebhookLifecycle(
      systemActor("stripe-webhook"),
      renewalCommand("evt_task7_paid", "invoice.paid", firstPeriod, 101),
    )).resolves.toBe("processed");
    await expect(jobsRepository.processWebhookLifecycle(
      systemActor("stripe-webhook"),
      renewalCommand("evt_task7_next", "invoice.paid", new Date("2027-07-01T00:00:00.000Z"), 102),
    )).resolves.toBe("processed");

    const counts = (await psql(`
      SELECT
        (SELECT count(*) FROM jobs WHERE run_key = 'evt_task7_failed'),
        (SELECT count(*) FROM engagement_events WHERE metadata->>'membershipId' = '${membershipId}' AND metadata->>'periodStart' <> 'legacy'),
        (SELECT count(*) FROM audit_events WHERE target_id = '${membershipId}' AND action = 'stripe.webhook.processed');
    `)).trim();
    expect(counts).toBe("1|3|3");
    const facts = (await psql(`
      SELECT type || ':' || (metadata->>'renewalOrdinal')
      FROM engagement_events
      WHERE metadata->>'membershipId' = '${membershipId}' AND metadata->>'periodStart' <> 'legacy'
      ORDER BY occurred_at, type;
    `)).trim().split(/\r?\n/);
    expect(facts).toEqual(["renewal_failed:1", "renewal_paid:1", "renewal_paid:2"]);
  }, 30_000);
});
