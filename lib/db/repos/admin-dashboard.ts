import "server-only";
import {sql, type SQL} from "drizzle-orm";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {approvals, companies, companyMembers, engagementScores, memberships, posts, profiles, showcaseListings, staffTasks} from "@/lib/db/server-schema";
import {AT_RISK_NO_LOGIN_DAYS, AT_RISK_RENEWAL_DAYS, AT_RISK_SCORE_MAX, AT_RISK_TREND_MAX, AT_RISK_DAY_MS} from "@/lib/admin/at-risk";
import type {Actor} from "@/lib/membership/lifecycle";

type CountDatabase = Readonly<{execute: (statement: SQL) => Promise<unknown>}>;
export type AdminDashboardCounts = Readonly<{
  approvals: number | null; atRisk: number | null; listings: number | null;
  profiles: number | null; openTasks: number | null; draftNews: number | null;
}>;

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

export function createAdminDashboardRepository(loadDatabase: () => Promise<CountDatabase> = async () => await getDb()) {
  async function count(statement: SQL): Promise<number | null> {
    try {
      const value = rows(await (await loadDatabase()).execute(statement))[0]?.count;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }
  return {
    async counts(actor: Actor, asOf: Date = new Date()): Promise<AdminDashboardCounts> {
      requireAdmin(actor);
      const noLoginCutoff = new Date(asOf.getTime() - AT_RISK_NO_LOGIN_DAYS * AT_RISK_DAY_MS);
      const renewalBefore = new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * AT_RISK_DAY_MS);
      const [pendingApprovals, atRisk, listings, pendingProfiles, openTasks, draftNews] = await Promise.all([
        count(sql`SELECT count(*) AS count FROM ${approvals} WHERE ${approvals.status} = 'pending'`),
        count(sql`
          WITH candidate_memberships AS (
            SELECT ${memberships.ownerUserId} AS profile_id, ${memberships.billingPeriodEnd} AS renewal_at
            FROM ${memberships}
            WHERE ${memberships.ownerUserId} IS NOT NULL AND ${memberships.status} IN ('active', 'past_due')
            UNION ALL
            SELECT ${companyMembers.userId} AS profile_id, ${memberships.billingPeriodEnd} AS renewal_at
            FROM ${memberships}
            JOIN ${companyMembers} ON ${companyMembers.companyId} = ${memberships.companyId}
              AND ${companyMembers.revokedAt} IS NULL
            WHERE ${memberships.companyId} IS NOT NULL AND ${memberships.status} IN ('active', 'past_due')
          )
          SELECT count(DISTINCT ${profiles.id}) AS count
          FROM candidate_memberships candidates
          JOIN ${profiles} ON ${profiles.id} = candidates.profile_id
          LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
          WHERE ((${engagementScores.score} < ${AT_RISK_SCORE_MAX} AND ${engagementScores.trend} < ${AT_RISK_TREND_MAX})
            OR ((${profiles.lastLoginAt} IS NULL OR ${profiles.lastLoginAt} <= ${noLoginCutoff})
              AND candidates.renewal_at >= ${asOf} AND candidates.renewal_at <= ${renewalBefore}))
        `),
        count(sql`SELECT count(*) AS count FROM ${showcaseListings}`),
        count(sql`SELECT count(*) AS count FROM ${companies} WHERE ${companies.publicProfileStatus} = 'pending_review'`),
        count(sql`SELECT count(*) AS count FROM ${staffTasks} WHERE ${staffTasks.status} = 'open'`),
        count(sql`SELECT count(*) AS count FROM ${posts} WHERE ${posts.kind} = 'news' AND ${posts.publishedAt} IS NULL`),
      ]);
      return {approvals: pendingApprovals, atRisk, listings, profiles: pendingProfiles, openTasks, draftNews};
    },
  };
}

export const adminDashboardRepository = createAdminDashboardRepository();
