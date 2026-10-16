import "server-only";
import {sql, type SQL} from "drizzle-orm";
import {
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {
  membershipApplications,
  memberships,
  journeyState,
} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import {
  MEMBERSHIP_STATUSES,
  type MembershipStatus,
} from "@/lib/membership/constants";
import {JOURNEYS} from "@/config/journeys";
import {RENEWAL_MAX_WINDOW_MS} from "@/lib/automation/renewal-window";

export type RenewalEnrollmentCandidate = Readonly<{
  membershipId: string;
  profileId: string | null;
  billingPeriodEnd: Date;
}>;
export type RenewalEnrollmentCursor = Readonly<{
  billingPeriodEnd: Date;
  membershipId: string;
}>;
export type RenewalEnrollmentWindow = Readonly<{
  from: Date;
  to: Date;
  statuses: readonly MembershipStatus[];
  after: RenewalEnrollmentCursor | null;
  limit: number;
}>;
export type RenewalEnrollmentPage = Readonly<{
  items: RenewalEnrollmentCandidate[];
  nextCursor: RenewalEnrollmentCursor | null;
}>;
export type RenewalEnrollmentExecutor = Readonly<{
  execute: (query: SQL) => PromiseLike<unknown>;
}>;
export type RenewalEnrollmentDatabaseLoader =
  () => Promise<RenewalEnrollmentExecutor>;
const validDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());
function validate(input: RenewalEnrollmentWindow): void {
  if (
    !input ||
    !validDate(input.from) ||
    !validDate(input.to) ||
    input.to <= input.from ||
    input.to.getTime() - input.from.getTime() > RENEWAL_MAX_WINDOW_MS ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 500 ||
    !Array.isArray(input.statuses) ||
    input.statuses.length === 0 ||
    new Set(input.statuses).size !== input.statuses.length ||
    input.statuses.some((value) => !MEMBERSHIP_STATUSES.includes(value)) ||
    (input.after !== null &&
      (!input.after ||
        !validDate(input.after.billingPeriodEnd) ||
        input.after.billingPeriodEnd < input.from ||
        input.after.billingPeriodEnd >= input.to ||
        !/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
          input.after.membershipId,
        )))
  )
    throw Error("INVALID_RENEWAL_WINDOW");
}
function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  )
    return result.rows;
  throw Error("INVALID_RENEWAL_RESULT");
}
function candidateFrom(
  row: Record<string, unknown>,
): RenewalEnrollmentCandidate {
  const end =
    row.billing_period_end instanceof Date
      ? row.billing_period_end
      : new Date(String(row.billing_period_end));
  if (typeof row.membership_id !== "string" || !validDate(end))
    throw Error("INVALID_RENEWAL_ENROLLMENT_ROW");
  return {
    membershipId: row.membership_id,
    profileId:
      row.profile_id === null || row.profile_id === undefined
        ? null
        : String(row.profile_id),
    billingPeriodEnd: end,
  };
}
export function createRenewalEnrollmentsRepository(
  loadDatabase: RenewalEnrollmentDatabaseLoader = async () => await getDb(),
) {
  return {
    async listDue(
      actor: AutomationRepositoryActor,
      input: RenewalEnrollmentWindow,
    ): Promise<RenewalEnrollmentPage> {
      requireAutomationCron(actor);
      validate(input);
      const database = await loadDatabase(),
        statusValues = sql.join(
          input.statuses.map((value) => sql`${value}`),
          sql`, `,
        );
      const after = input.after
        ? sql`AND (${memberships.billingPeriodEnd},${memberships.id})>(${input.after.billingPeriodEnd}::timestamptz,${input.after.membershipId}::uuid)`
        : sql``;
      const rows = rowsFrom(
        await database.execute(sql`
   SELECT ${memberships.id} AS membership_id,COALESCE(${memberships.ownerUserId},${membershipApplications.applicantUserId}) AS profile_id,${memberships.billingPeriodEnd} AS billing_period_end
   FROM ${memberships} LEFT JOIN ${membershipApplications} ON ${membershipApplications.id}=${memberships.applicationId}
   WHERE ${memberships.billingPeriodEnd}>=${input.from} AND ${memberships.billingPeriodEnd}<${input.to}
    AND ${memberships.status} IN (${statusValues}) AND ${memberships.status} IN ('active','past_due')
    AND ${memberships.cancelAtPeriodEnd}=false AND ${memberships.billingInterval}<>'none'
    AND ${memberships.grantEffectiveAt} IS NULL AND ${memberships.grantExpiresAt} IS NULL
    AND COALESCE(${memberships.ownerUserId},${membershipApplications.applicantUserId}) IS NOT NULL
    ${after}
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(JOURNEYS.renewal.map((step) => step.key))}::jsonb) expected(step)
     WHERE NOT EXISTS (SELECT 1 FROM ${journeyState} j WHERE j.membership_id=${memberships.id}
      AND j.profile_id=COALESCE(${memberships.ownerUserId},${membershipApplications.applicantUserId}) AND j.journey='renewal' AND j.step=expected.step
      AND j.instance_key IN ('period:'||${memberships.id}::text||':'||to_char(${memberships.billingPeriodEnd} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
       'period:'||to_char(${memberships.billingPeriodEnd} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))
   ORDER BY ${memberships.billingPeriodEnd},${memberships.id} LIMIT ${input.limit + 1}
  `),
      ).map(candidateFrom);
      const items = rows.slice(0, input.limit),
        last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > input.limit && last
            ? {
                billingPeriodEnd: last.billingPeriodEnd,
                membershipId: last.membershipId,
              }
            : null,
      };
    },
  };
}
export type RenewalEnrollmentsRepository = ReturnType<
  typeof createRenewalEnrollmentsRepository
>;
export const renewalEnrollmentsRepository =
  createRenewalEnrollmentsRepository();
