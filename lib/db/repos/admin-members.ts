import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {decodeAdminMemberCursor, encodeAdminMemberCursor, type AdminMemberListItem, type AdminMemberPage, type AdminMemberQuery} from "@/lib/admin/member-types";
import {requireAdmin} from "@/lib/auth/actor";
import {companies, companyMembers, engagementScores, memberships, profiles} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

const memberRowSchema = z.object({
  profileId: z.string(), displayName: z.string(), email: z.string().nullable(), companyName: z.string().nullable(),
  planCode: z.string().nullable(), membershipStatus: z.string().nullable(), renewalAt: z.coerce.date().nullable(),
  score: z.union([z.string(), z.number()]).nullable(),
});

type MemberRow = z.infer<typeof memberRowSchema>;

function toItem(row: MemberRow): AdminMemberListItem {
  const numericScore = row.score === null ? null : Number(row.score);
  return {profileId: row.profileId, displayName: row.displayName, email: row.email, companyName: row.companyName, planCode: row.planCode, membershipStatus: row.membershipStatus, renewalAt: row.renewalAt?.toISOString() ?? null, score: numericScore !== null && Number.isFinite(numericScore) ? numericScore : null};
}

/**
 * Projects one representative row per profile before outer pagination. Matching profiles are chosen
 * across every active company membership first; representatives prefer membership status (active,
 * past due, ending, pending, terminal), then membership ID and company ID for stable tie-breaking.
 */
function memberSearchStatement(query: AdminMemberQuery) {
  const cursor = decodeAdminMemberCursor(query.cursor);
  const pattern = `%${query.search}%`;
  const matches = query.search
    ? sql`${profiles.displayName} ILIKE ${pattern} OR ${profiles.email} ILIKE ${pattern} OR ${companies.displayName} ILIKE ${pattern}`
    : sql`TRUE`;
  const afterCursor = cursor
    ? sql`lower("displayName") > ${cursor.displayName} OR (lower("displayName") = ${cursor.displayName} AND "profileId" > ${cursor.profileId})`
    : sql`TRUE`;

  return sql`
    WITH matching_profiles AS (
      SELECT DISTINCT ${profiles.id} AS profile_id
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      WHERE ${matches}
    ), candidate_rows AS (
      SELECT ${profiles.id} AS profile_id, ${profiles.displayName} AS display_name, ${profiles.email} AS email,
        ${companies.displayName} AS company_name, ${memberships.planCode} AS plan_code, ${memberships.status} AS membership_status,
        ${memberships.billingPeriodEnd} AS renewal_at, ${engagementScores.score} AS score,
        ROW_NUMBER() OVER (PARTITION BY ${profiles.id} ORDER BY
          CASE ${memberships.status}
            WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'cancel_at_period_end' THEN 2
            WHEN 'pending_review' THEN 3 WHEN 'pending_payment' THEN 4 WHEN 'cancelled' THEN 5 WHEN 'expired' THEN 6 ELSE 7 END,
          ${memberships.id} NULLS LAST, ${companies.id} NULLS LAST
        ) AS row_rank
      FROM ${profiles}
      INNER JOIN matching_profiles ON matching_profiles.profile_id = ${profiles.id}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      LEFT JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
    ), projected_members AS (
      SELECT profile_id AS "profileId", display_name AS "displayName", email, company_name AS "companyName", plan_code AS "planCode",
        membership_status AS "membershipStatus", renewal_at AS "renewalAt", score
      FROM candidate_rows WHERE row_rank = 1
    )
    SELECT * FROM projected_members
    WHERE ${afterCursor}
    ORDER BY lower("displayName"), "profileId"
    LIMIT ${query.limit + 1}
  `;
}

export const adminMembersRepository = {
  async search(actor: Actor, query: AdminMemberQuery): Promise<AdminMemberPage> {
    requireAdmin(actor);
    const db = await getDb();
    const result = await db.execute(memberSearchStatement(query));
    const rows = z.array(memberRowSchema).parse(Array.isArray(result) ? result : result.rows);
    const hasNextPage = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(toItem);
    return {items, nextCursor: hasNextPage && items.length > 0 ? encodeAdminMemberCursor(items[items.length - 1]) : null};
  },
};
