import "server-only";

import {and, eq, gt, inArray, isNull} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companies, companyMembers, memberships, seatInvitations, type CompanyMember, type SeatInvitation} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type SeatOverview = Readonly<{companyId: string; seatLimit: number; members: CompanyMember[]; invitations: SeatInvitation[]; canManage: boolean; canGrantOwner: boolean}>;

export async function getSeatOverview(actor: Actor, companyId: string): Promise<SeatOverview | null> {
  requireMember(actor);
  const db = await getDb();
  const access = await db.select({companyId: companies.id, seatLimit: memberships.seatLimit, role: companyMembers.role}).from(companies).innerJoin(memberships, eq(memberships.companyId, companies.id)).innerJoin(companyMembers, eq(companyMembers.companyId, companies.id)).where(and(eq(companies.id, companyId), eq(companyMembers.userId, actor.userId), isNull(companyMembers.revokedAt), inArray(memberships.status, ["active", "past_due", "cancel_at_period_end"]))).limit(1);
  const current = access[0];
  if (!current) forbidden();
  const [members, invitations] = await Promise.all([
    db.select().from(companyMembers).where(and(eq(companyMembers.companyId, companyId), isNull(companyMembers.revokedAt))),
    db.select().from(seatInvitations).where(and(eq(seatInvitations.companyId, companyId), isNull(seatInvitations.acceptedAt), isNull(seatInvitations.revokedAt), gt(seatInvitations.expiresAt, new Date()))),
  ]);
  return {companyId, seatLimit: current.seatLimit, members, invitations, canManage: current.role === "owner" || current.role === "admin", canGrantOwner: current.role === "owner"};
}
