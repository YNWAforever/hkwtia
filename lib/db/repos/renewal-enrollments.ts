import "server-only";

import {sql, type SQL} from "drizzle-orm";

import {
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {
  membershipApplications,
  memberships,
} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";

export type RenewalEnrollmentCandidate = Readonly<{
  membershipId: string;
  profileId: string | null;
  billingPeriodEnd: Date;
}>;

export type RenewalEnrollmentExecutor = Readonly<{
  execute: (query: SQL) => PromiseLike<unknown>;
}>;

export type RenewalEnrollmentDatabaseLoader =
  () => Promise<RenewalEnrollmentExecutor>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function candidateFrom(row: Record<string, unknown>): RenewalEnrollmentCandidate {
  if (typeof row.membership_id !== "string" || row.membership_id.length === 0) {
    throw new Error("INVALID_RENEWAL_ENROLLMENT_ROW");
  }
  const profileId = row.profile_id === null || row.profile_id === undefined
    ? null
    : String(row.profile_id);
  const billingPeriodEnd = row.billing_period_end instanceof Date
    ? row.billing_period_end
    : new Date(String(row.billing_period_end));
  return {
    membershipId: row.membership_id,
    profileId,
    billingPeriodEnd,
  };
}

async function defaultDatabaseLoader(): Promise<RenewalEnrollmentExecutor> {
  return await getDb() as unknown as RenewalEnrollmentExecutor;
}

export function createRenewalEnrollmentsRepository(
  loadDatabase: RenewalEnrollmentDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async listDue(
      actor: AutomationRepositoryActor,
    ): Promise<RenewalEnrollmentCandidate[]> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT
          ${memberships.id} AS membership_id,
          COALESCE(
            ${memberships.ownerUserId},
            ${membershipApplications.applicantUserId}
          ) AS profile_id,
          ${memberships.billingPeriodEnd} AS billing_period_end
        FROM ${memberships}
        LEFT JOIN ${membershipApplications}
          ON ${membershipApplications.id} = ${memberships.applicationId}
        WHERE ${memberships.billingPeriodEnd} IS NOT NULL
        ORDER BY ${memberships.id}
      `);
      return rowsFrom(result).map(candidateFrom);
    },
  };
}

export type RenewalEnrollmentsRepository =
  ReturnType<typeof createRenewalEnrollmentsRepository>;

export const renewalEnrollmentsRepository =
  createRenewalEnrollmentsRepository();
