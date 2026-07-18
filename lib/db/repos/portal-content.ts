import "server-only";

import {and, eq, gt, inArray, isNull, or, sql} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import {companies, companyMembers, memberships, profiles, seatInvitations, type CompanyMember, type SeatInvitation} from "@/lib/db/server-schema";
import {forbidden, requireMember, type Actor, type CompanyRole} from "@/lib/membership/lifecycle";

export type DirectoryCandidate = Readonly<{
  userId: string;
  displayName: string;
  jobTitle: string | null;
  companyId: string | null;
  companyDisplayName: string | null;
  industry: string | null;
  sizeBand: string | null;
  active: boolean;
  profileDirectoryVisible: boolean;
  companyDirectoryVisible: boolean;
}>;
export type SeatOverview = Readonly<{companyId: string; seatLimit: number; members: CompanyMember[]; invitations: SeatInvitation[]; canManage: boolean; canGrantOwner: boolean}>;

export const portalContentRepository = {
  async getCompanyRole(actor: Actor, companyId: string): Promise<CompanyRole | null> {
    requireMember(actor);
    if (actor.companyRoles?.[companyId]) return actor.companyRoles[companyId];
    const db = await getDb();
    const rows = await db.select({role: companyMembers.role}).from(companyMembers).where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, actor.profileId), isNull(companyMembers.revokedAt))).limit(1);
    return rows[0]?.role ?? null;
  },
  async listDirectory(actor: Actor): Promise<DirectoryCandidate[]> {
    requireMember(actor);
    const db = await getDb();
    const activeMembership = sql`EXISTS (
      SELECT 1 FROM ${memberships} AS directory_membership
      WHERE directory_membership.status IN ('active', 'past_due', 'cancel_at_period_end')
        AND (directory_membership.owner_user_id = ${profiles.id} OR EXISTS (
          SELECT 1 FROM ${companyMembers} AS directory_membership_member
          WHERE directory_membership_member.company_id = directory_membership.company_id
            AND directory_membership_member.user_id = ${profiles.id}
            AND directory_membership_member.revoked_at IS NULL
        ))
    )`;
    const rows = await db.select({userId: profiles.id, displayName: profiles.displayName, jobTitle: profiles.jobTitle, companyId: companyMembers.companyId, companyDisplayName: companies.displayName, industry: companies.industry, sizeBand: companies.sizeBand, profileDirectoryVisible: profiles.directoryVisible, companyDirectoryVisible: companies.directoryVisible}).from(profiles).leftJoin(companyMembers, and(eq(companyMembers.userId, profiles.id), isNull(companyMembers.revokedAt))).leftJoin(companies, eq(companies.id, companyMembers.companyId)).where(and(activeMembership, eq(profiles.directoryVisible, true), or(isNull(companyMembers.id), eq(companies.directoryVisible, true))));
    return rows.map((row) => ({...row, companyId: row.companyId ?? null, companyDisplayName: row.companyDisplayName ?? null, industry: row.industry ?? null, sizeBand: row.sizeBand ?? null, companyDirectoryVisible: row.companyId === null || row.companyDirectoryVisible === true, active: true}));
  },
  async getSeatOverview(actor: Actor, companyId: string): Promise<SeatOverview | null> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    const access = await db.select({companyId: companies.id, seatLimit: memberships.seatLimit, role: companyMembers.role}).from(companies).innerJoin(memberships, eq(memberships.companyId, companies.id)).innerJoin(companyMembers, eq(companyMembers.companyId, companies.id)).where(and(eq(companies.id, companyId), eq(companyMembers.userId, actor.profileId), isNull(companyMembers.revokedAt), inArray(memberships.status, ["active", "past_due", "cancel_at_period_end"]))).limit(1);
    const current = access[0];
    if (!current) forbidden();
    const [members, invitations] = await Promise.all([
      db.select().from(companyMembers).where(and(eq(companyMembers.companyId, companyId), isNull(companyMembers.revokedAt))),
      db.select().from(seatInvitations).where(and(eq(seatInvitations.companyId, companyId), isNull(seatInvitations.acceptedAt), isNull(seatInvitations.revokedAt), gt(seatInvitations.expiresAt, new Date()))),
    ]);
    return {companyId, seatLimit: current.seatLimit, members, invitations, canManage: current.role === "owner" || current.role === "admin", canGrantOwner: current.role === "owner"};
  },
};
