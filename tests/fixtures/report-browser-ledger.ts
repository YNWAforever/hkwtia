import {Pool} from "pg";
import {assertIsolatedSeedEnvironment} from "@/scripts/lib/acceptance-guard";
import {M2_UUIDS} from "@/scripts/seed-m2";

type ReportFlow = {paid: number; due: number; firstPaid: number; firstDue: number; attended: number; eligible: number};

export async function readBrowserReportFlow(from: Date, to: Date, m2Only = false): Promise<ReportFlow> {
  const databaseUrl = assertIsolatedSeedEnvironment(process.env, {prefix: "REPORT_BROWSER", flag: "AUDIT_ISOLATED_ACCEPTANCE", hostAllowlistVar: "M2_TEST_NEON_HOST"});
  const pool = new Pool({connectionString: databaseUrl});
  try {
    const rows = await pool.query<{id: string; type: string; ordinal: unknown}>(`SELECT m.id, ee.type, ee.metadata->'renewalOrdinal' AS ordinal
      FROM engagement_events ee JOIN memberships m ON m.id::text=ee.metadata->>'membershipId'
      WHERE ee.type IN ('renewal_paid','renewal_failed') AND ee.occurred_at>=$1 AND ee.occurred_at<$2
        AND ($3::boolean=false OR m.id=ANY($4::uuid[]))`, [from, to, m2Only, M2_UUIDS.memberships]);
    const due = new Set<string>(), paid = new Set<string>(), firstDue = new Set<string>(), firstPaid = new Set<string>();
    for (const row of rows.rows) {
      due.add(row.id);
      if (row.type === "renewal_paid") paid.add(row.id);
      if (row.ordinal === 1) {firstDue.add(row.id); if (row.type === "renewal_paid") firstPaid.add(row.id);}
    }
    const attendance = await pool.query<{attended: number; eligible: number}>(`SELECT
      COUNT(*) FILTER (WHERE r.status='attended')::integer AS attended,
      COUNT(*) FILTER (WHERE r.status<>'cancelled')::integer AS eligible
      FROM events e JOIN event_registrations r ON r.event_id=e.id
      WHERE e.ends_at>=$1 AND e.ends_at<$2 AND e.ends_at<=$2
        AND ($3::boolean=false OR e.id=ANY($4::uuid[]))`, [from, to, m2Only, M2_UUIDS.events]);
    return {paid: paid.size, due: due.size, firstPaid: firstPaid.size, firstDue: firstDue.size, ...attendance.rows[0]!};
  } finally {await pool.end();}
}

/** Read independently from the ledger; other suites' synthetic stock remains intact. */
export async function readBrowserReportStock(asOf: Date): Promise<{arrHkd: number; mrrHkd: number; atRiskCount: number}> {
  const databaseUrl = assertIsolatedSeedEnvironment(process.env, {prefix: "REPORT_BROWSER", flag: "AUDIT_ISOLATED_ACCEPTANCE", hostAllowlistVar: "M2_TEST_NEON_HOST"});
  const pool = new Pool({connectionString: databaseUrl});
  try {
    const revenue = await pool.query<{annualized: string}>(`SELECT COALESCE(SUM(CASE m.billing_interval
      WHEN 'annual' THEN COALESCE(p.annual_price_hkd,0)
      WHEN 'monthly' THEN COALESCE(p.monthly_price_hkd,0)*12 ELSE 0 END),0)::text AS annualized
      FROM memberships m JOIN membership_plans p ON p.code=m.plan_code WHERE m.status='active'`);
    // These are the established 90/120-day OR policy, not proposed new defaults.
    const risk = await pool.query<{count: number}>(`SELECT COUNT(DISTINCT p.id)::integer AS count
      FROM profiles p LEFT JOIN company_members cm ON cm.user_id=p.id AND cm.revoked_at IS NULL
      JOIN memberships m ON m.owner_user_id=p.id OR m.company_id=cm.company_id
      LEFT JOIN engagement_scores es ON es.profile_id=p.id
      WHERE m.status IN ('active','past_due') AND ((es.score<20 AND es.trend<0)
        OR ((p.last_login_at IS NULL OR p.last_login_at<=$1::timestamptz-interval '90 days')
          AND m.billing_period_end BETWEEN $1::timestamptz AND $1::timestamptz+interval '120 days'))`, [asOf]);
    const annualized = Number(revenue.rows[0]?.annualized);
    if (!Number.isFinite(annualized) || !Number.isInteger(risk.rows[0]?.count)) throw new Error("REPORT_BROWSER_INVALID_LEDGER_AGGREGATE");
    return {arrHkd: Math.round(annualized), mrrHkd: Math.round(annualized / 12), atRiskCount: risk.rows[0]!.count};
  } finally {await pool.end();}
}
