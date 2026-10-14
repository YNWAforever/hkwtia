import {sql} from "drizzle-orm";
import {alias} from "drizzle-orm/pg-core";
import {companyMembers, memberships} from "@/lib/db/server-schema";
import {membershipGrantValiditySql} from "@/lib/db/repos/membership-grant-sql";

/** Matches the portal's primary-membership rank for the three benefit statuses. */
export function benefitMembershipOrderSql() {
  return [sql`CASE ${memberships.status} WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 ELSE 2 END`, sql`${memberships.id} ASC`];
}

/** Apply current entitlement, grant validity and seat revocation in the same read snapshot. */
export function memberBenefitScopeSql(profileId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${memberships} AS portal_viewer_membership
    WHERE portal_viewer_membership.status IN ('active', 'past_due', 'cancel_at_period_end')
      AND ${membershipGrantValiditySql(undefined, alias(memberships, "portal_viewer_membership"))}
      AND (portal_viewer_membership.owner_user_id = ${profileId} OR EXISTS (
        SELECT 1 FROM ${companyMembers} AS portal_viewer_seat
        WHERE portal_viewer_seat.company_id = portal_viewer_membership.company_id
          AND portal_viewer_seat.user_id = ${profileId} AND portal_viewer_seat.revoked_at IS NULL
      ))
  )`;
}
