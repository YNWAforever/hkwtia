import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {AT_RISK_DAY_MS, AT_RISK_NO_LOGIN_DAYS, AT_RISK_RENEWAL_DAYS, AT_RISK_SCORE_MAX, AT_RISK_TREND_MAX} from "@/lib/admin/at-risk";
import type {RawReportFacts} from "@/lib/admin/report-formulas";
import type {ReportUtcWindow} from "@/lib/admin/reports";
import {requireScheduledAgent, type Actor as AgentActor} from "@/lib/auth/agent-actor";
import {requireAdmin} from "@/lib/auth/actor";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

const utcWindowSchema = z.object({from: z.date(), toExclusive: z.date(), asOf: z.date()}).strict().superRefine((window, context) => {
  if (!Number.isFinite(window.from.getTime()) || !Number.isFinite(window.toExclusive.getTime()) || !Number.isFinite(window.asOf.getTime()) || window.from >= window.toExclusive || window.asOf > window.toExclusive) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["toExclusive"], message: "invalid UTC report window"});
  }
});
const revenueMembershipSchema = z.object({
  status: z.string(),
  interval: z.enum(["annual", "monthly", "none"]),
  annualPriceHkd: z.coerce.number().nullable(),
  monthlyPriceHkd: z.coerce.number().nullable(),
  count: z.coerce.number().int().nonnegative(),
});
const aggregateRowSchema = z.object({
  revenueMemberships: z.array(revenueMembershipSchema),
  renewalPaid: z.coerce.number().int().nonnegative(),
  renewalDue: z.coerce.number().int().nonnegative(),
  firstYearPaid: z.coerce.number().int().nonnegative(),
  firstYearDue: z.coerce.number().int().nonnegative(),
  funnelStarted: z.coerce.number().int().nonnegative(),
  funnelProfileCompleted: z.coerce.number().int().nonnegative(),
  funnelCheckoutOrReview: z.coerce.number().int().nonnegative(),
  funnelActivated: z.coerce.number().int().nonnegative(),
  attendanceAttended: z.coerce.number().int().nonnegative(),
  attendanceEligible: z.coerce.number().int().nonnegative(),
  atRiskCount: z.coerce.number().int().nonnegative(),
}).superRefine((row, context) => {
  for (const [numerator, denominator, path] of [
    [row.renewalPaid, row.renewalDue, "renewalPaid"],
    [row.firstYearPaid, row.firstYearDue, "firstYearPaid"],
    [row.attendanceAttended, row.attendanceEligible, "attendanceAttended"],
  ] as const) if (numerator > denominator) context.addIssue({code: z.ZodIssueCode.custom, path: [path], message: "numerator exceeds denominator"});
});

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function loadFacts(input: ReportUtcWindow): Promise<RawReportFacts> {
  const window = utcWindowSchema.parse(input);
  const db = await getDb();
  const scoreMaximum = sql.raw(String(AT_RISK_SCORE_MAX));
  const renewalBefore = new Date(window.asOf.getTime() + AT_RISK_RENEWAL_DAYS * AT_RISK_DAY_MS);
  const noLoginBefore = new Date(window.asOf.getTime() - AT_RISK_NO_LOGIN_DAYS * AT_RISK_DAY_MS);
  const rows = resultRows(await db.execute(sql`
    WITH revenue_groups AS (
      SELECT m.status::text AS status, m.billing_interval::text AS interval,
        p.annual_price_hkd AS "annualPriceHkd", p.monthly_price_hkd AS "monthlyPriceHkd",
        COUNT(*)::integer AS count
      FROM memberships m
      INNER JOIN membership_plans p ON p.code = m.plan_code
      WHERE m.status = 'active' AND m.billing_interval IN ('annual', 'monthly')
      GROUP BY m.status, m.billing_interval, p.annual_price_hkd, p.monthly_price_hkd
    ), renewal_per_membership AS (
      SELECT m.id AS membership_id,
        BOOL_OR(ee.type = 'renewal_paid') AS paid,
        BOOL_OR(ee.type = 'renewal_paid' AND JSONB_TYPEOF(ee.metadata -> 'renewalOrdinal') = 'number' AND ee.metadata -> 'renewalOrdinal' = '1'::jsonb) AS first_year_paid,
        BOOL_OR(JSONB_TYPEOF(ee.metadata -> 'renewalOrdinal') = 'number' AND ee.metadata -> 'renewalOrdinal' = '1'::jsonb) AS first_year_due
      FROM engagement_events ee
      INNER JOIN memberships m ON m.id::text = ee.metadata ->> 'membershipId'
      WHERE ee.type IN ('renewal_paid', 'renewal_failed')
        AND ee.occurred_at >= ${window.from} AND ee.occurred_at < ${window.toExclusive}
      GROUP BY m.id
    ), application_funnel AS (
      SELECT COUNT(DISTINCT a.id)::integer AS started,
        COUNT(DISTINCT a.id) FILTER (WHERE a.current_step IN ('company', 'checkout', 'review', 'complete'))::integer AS profile_completed,
        COUNT(DISTINCT a.id) FILTER (WHERE a.current_step IN ('checkout', 'review', 'complete') OR a.status IN ('pending_payment', 'pending_review', 'completed'))::integer AS checkout_or_review,
        COUNT(DISTINCT a.id) FILTER (WHERE m.status = 'active')::integer AS activated
      FROM membership_applications a
      LEFT JOIN memberships m ON m.application_id = a.id
      WHERE a.created_at >= ${window.from} AND a.created_at < ${window.toExclusive}
    ), attendance_facts AS (
      SELECT COUNT(*) FILTER (WHERE r.status = 'attended')::integer AS attended,
        COUNT(*) FILTER (WHERE r.status <> 'cancelled')::integer AS eligible
      FROM events e
      INNER JOIN event_registrations r ON r.event_id = e.id
      WHERE e.ends_at IS NOT NULL AND e.ends_at >= ${window.from} AND e.ends_at < ${window.toExclusive} AND e.ends_at <= ${window.asOf}
    ), at_risk_profiles AS (
      SELECT DISTINCT p.id
      FROM profiles p
      LEFT JOIN company_members cm ON cm.user_id = p.id AND cm.revoked_at IS NULL
      INNER JOIN memberships m ON m.owner_user_id = p.id OR m.company_id = cm.company_id
      LEFT JOIN engagement_scores es ON es.profile_id = p.id
      WHERE m.status IN ('active', 'past_due') AND (
        (es.score < ${scoreMaximum} AND es.trend < ${AT_RISK_TREND_MAX})
        OR ((p.last_login_at IS NULL OR p.last_login_at <= ${noLoginBefore})
          AND m.billing_period_end >= ${window.asOf} AND m.billing_period_end <= ${renewalBefore})
      )
    )
    SELECT COALESCE((SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
        'status', status, 'interval', interval, 'annualPriceHkd', "annualPriceHkd",
        'monthlyPriceHkd', "monthlyPriceHkd", 'count', count
      ) ORDER BY interval, "annualPriceHkd", "monthlyPriceHkd") FROM revenue_groups), '[]'::jsonb) AS "revenueMemberships",
      COALESCE((SELECT COUNT(DISTINCT membership_id) FILTER (WHERE paid) FROM renewal_per_membership), 0)::integer AS "renewalPaid",
      COALESCE((SELECT COUNT(DISTINCT membership_id) FROM renewal_per_membership), 0)::integer AS "renewalDue",
      COALESCE((SELECT COUNT(DISTINCT membership_id) FILTER (WHERE first_year_paid) FROM renewal_per_membership), 0)::integer AS "firstYearPaid",
      COALESCE((SELECT COUNT(DISTINCT membership_id) FILTER (WHERE first_year_due) FROM renewal_per_membership), 0)::integer AS "firstYearDue",
      COALESCE((SELECT started FROM application_funnel), 0)::integer AS "funnelStarted",
      COALESCE((SELECT profile_completed FROM application_funnel), 0)::integer AS "funnelProfileCompleted",
      COALESCE((SELECT checkout_or_review FROM application_funnel), 0)::integer AS "funnelCheckoutOrReview",
      COALESCE((SELECT activated FROM application_funnel), 0)::integer AS "funnelActivated",
      COALESCE((SELECT attended FROM attendance_facts), 0)::integer AS "attendanceAttended",
      COALESCE((SELECT eligible FROM attendance_facts), 0)::integer AS "attendanceEligible",
      COALESCE((SELECT COUNT(DISTINCT id) FROM at_risk_profiles), 0)::integer AS "atRiskCount"
  `));
  const row = aggregateRowSchema.parse(rows[0]);
  return {
    revenueMemberships: row.revenueMemberships,
    renewal: {paid: row.renewalPaid, due: row.renewalDue, firstYearPaid: row.firstYearPaid, firstYearDue: row.firstYearDue},
    funnel: {started: row.funnelStarted, profileCompleted: row.funnelProfileCompleted, checkoutOrReview: row.funnelCheckoutOrReview, activated: row.funnelActivated},
    attendance: {attended: row.attendanceAttended, eligible: row.attendanceEligible},
    atRiskCount: row.atRiskCount,
  };
}

export type ReportsRepository = Readonly<{
  readFacts: (actor: Actor, window: ReportUtcWindow) => Promise<RawReportFacts>;
  readBoardFacts: (actor: AgentActor, window: ReportUtcWindow) => Promise<RawReportFacts>;
}>;

async function readFacts(actor: Actor, input: ReportUtcWindow): Promise<RawReportFacts> {
  requireAdmin(actor);
  return loadFacts(input);
}

async function readBoardFacts(
  actor: AgentActor,
  input: ReportUtcWindow,
): Promise<RawReportFacts> {
  requireScheduledAgent(actor, "board_reporter");
  return loadFacts(input);
}

export const reportsRepository: ReportsRepository = {readFacts, readBoardFacts};
