import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  projectRetentionCandidates,
  type RetentionCandidate,
  type RetentionCandidateSource,
} from "@/lib/ai/retention-analyst/candidates";
import {
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {
  companyMembers,
  engagementScores,
  memberships,
  profiles,
} from "@/lib/db/server-schema";

const listInputSchema = z.object({
  asOf: z.date().refine((value) => Number.isFinite(value.getTime())),
}).strict();
const candidateRowSchema = z.object({
  profile_id: z.string().min(1),
  membership_id: z.string().min(1),
  locale: z.string().nullable(),
  plan_code: z.string().min(1),
  status: z.enum(["active", "past_due"]),
  renewal_at: z.coerce.date().nullable(),
  score: z.union([z.string(), z.number()]).nullable(),
  trend: z.union([z.string(), z.number()]).nullable(),
  last_login_at: z.coerce.date().nullable(),
}).strict();

export type RetentionAnalystRepository = Readonly<{
  listCandidates: (
    actor: AutomationRepositoryActor,
    input: Readonly<{asOf: Date}>,
  ) => Promise<readonly RetentionCandidate[]>;
}>;

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows;
  }
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createRetentionAnalystRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
): RetentionAnalystRepository {
  return {
    async listCandidates(actor, input) {
      requireAutomationCron(actor);
      const {asOf} = listInputSchema.parse(input);
      const database = await loadDatabase();
      const rows = z.array(candidateRowSchema).parse(resultRows(
        await database.execute(sql`
          SELECT
            ${profiles.id} AS profile_id,
            ${memberships.id} AS membership_id,
            ${profiles.locale} AS locale,
            ${memberships.planCode} AS plan_code,
            ${memberships.status} AS status,
            ${memberships.billingPeriodEnd} AS renewal_at,
            ${engagementScores.score} AS score,
            ${engagementScores.trend} AS trend,
            ${profiles.lastLoginAt} AS last_login_at
          FROM ${profiles}
          LEFT JOIN ${companyMembers}
            ON ${companyMembers.userId} = ${profiles.id}
            AND ${companyMembers.revokedAt} IS NULL
          INNER JOIN ${memberships}
            ON ${memberships.ownerUserId} = ${profiles.id}
            OR ${memberships.companyId} = ${companyMembers.companyId}
          LEFT JOIN ${engagementScores}
            ON ${engagementScores.profileId} = ${profiles.id}
          WHERE ${memberships.status} IN ('active', 'past_due')
          ORDER BY ${profiles.id}, ${memberships.id}
        `),
      ));
      const sources: RetentionCandidateSource[] = rows.map((row) => ({
        profileId: row.profile_id,
        membershipId: row.membership_id,
        locale: row.locale,
        planCode: row.plan_code,
        status: row.status,
        renewalAt: row.renewal_at,
        score: row.score === null ? null : Number(row.score),
        trend: row.trend === null ? null : Number(row.trend),
        lastLoginAt: row.last_login_at,
      }));
      return projectRetentionCandidates(sources, asOf);
    },
  };
}

export const retentionAnalystRepository = createRetentionAnalystRepository();
