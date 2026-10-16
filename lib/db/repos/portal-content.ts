import "server-only";
import {benefitMembershipOrderSql} from "@/lib/db/repos/member-benefit-sql";
import {membershipGrantValiditySql} from "@/lib/db/repos/membership-grant-sql";

import {listDirectoryPage} from "@/lib/db/repos/portal-paging";
import {and, eq, getTableColumns, gt, inArray, isNull, sql} from "drizzle-orm";

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
export type SeatMember = CompanyMember & Readonly<{displayName?: string | null; email?: string | null}>;
export type SeatOverview = Readonly<{companyId: string; seatLimit: number; members: SeatMember[]; invitations: SeatInvitation[]; canManage: boolean; canGrantOwner: boolean}>;

export const portalContentRepository = {
  async getCompanyRole(actor: Actor, companyId: string): Promise<CompanyRole | null> {
    requireMember(actor);
    if (actor.companyRoles?.[companyId]) return actor.companyRoles[companyId];
    const db = await getDb();
    const rows = await db.select({role: companyMembers.role}).from(companyMembers).where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, actor.profileId), isNull(companyMembers.revokedAt))).limit(1);
    return rows[0]?.role ?? null;
  },
  listDirectoryPage,
  /** Compatibility for bounded first-page consumers; portal searches use listDirectoryPage. */
  async listDirectory(actor: Actor): Promise<DirectoryCandidate[]> {
    const page = await listDirectoryPage(actor);
    return page.items.map((row) => ({...row, active: true, profileDirectoryVisible: true, companyDirectoryVisible: true}));
  },
  async getSeatOverview(actor: Actor, companyId: string): Promise<SeatOverview | null> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    const access = await db.select({companyId: companies.id, seatLimit: memberships.seatLimit, role: companyMembers.role}).from(companies).innerJoin(memberships, eq(memberships.companyId, companies.id)).innerJoin(companyMembers, eq(companyMembers.companyId, companies.id)).where(and(eq(companies.id, companyId), eq(companyMembers.userId, actor.profileId), isNull(companyMembers.revokedAt), inArray(memberships.status, ["active", "past_due", "cancel_at_period_end"]), membershipGrantValiditySql())).orderBy(...benefitMembershipOrderSql()).limit(1);
    const current = access[0];
    if (!current) forbidden();
    const canManage = current.role === "owner" || current.role === "admin";
    const [members, invitations] = await Promise.all([
      db.select({...getTableColumns(companyMembers), displayName: profiles.displayName, email: canManage ? profiles.email : sql<null>`NULL`})
        .from(companyMembers).leftJoin(profiles, eq(profiles.id, companyMembers.userId))
        .where(and(eq(companyMembers.companyId, companyId), isNull(companyMembers.revokedAt))),
      db.select().from(seatInvitations).where(and(eq(seatInvitations.companyId, companyId), isNull(seatInvitations.acceptedAt), isNull(seatInvitations.revokedAt), gt(seatInvitations.expiresAt, new Date()))),
    ]);
    return {companyId, seatLimit: current.seatLimit, members, invitations, canManage, canGrantOwner: current.role === "owner"};
  },
};
