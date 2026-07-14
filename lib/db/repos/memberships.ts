import "server-only";

import {and, eq, exists, or, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companyMembers, memberships as membershipsTable, type Membership} from "@/lib/db/server-schema";
import {forbidden, getDb} from "@/lib/db/repos/common";

export type MembershipInput = Pick<Membership, "planCode" | "seatLimit"> & Partial<Pick<Membership, "ownerUserId" | "companyId" | "applicationId" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "billingPeriodStart" | "billingPeriodEnd" | "cancelAtPeriodEnd">>;
export type MembershipUpdate = Partial<Pick<Membership, "planCode" | "status" | "seatLimit" | "stripeCustomerId" | "stripeSubscriptionId" | "billingPeriodStart" | "billingPeriodEnd" | "cancelAtPeriodEnd">>;

function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipsTable.companyId} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function companyAccessScope(actor: Extract<Actor, {kind: "member"}>, companyId: string) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companyId} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}
function membershipScope(actor: Actor, membershipId: string) {
  if (actor.kind === "system") return and(eq(membershipsTable.id, membershipId), sql`true`);
  if (actor.kind === "anonymous") return sql`false`;
  return and(
    eq(membershipsTable.id, membershipId),
    or(eq(membershipsTable.ownerUserId, actor.userId), and(sql`${membershipsTable.companyId} IS NOT NULL`, companyMembershipScope(actor))),
  );
}

export const membershipsRepository = {
  async getByApplicationId(actor: Actor, applicationId: string): Promise<Membership | null> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const where = actor.kind === "system"
      ? and(eq(membershipsTable.applicationId, applicationId), sql`true`)
      : and(
          eq(membershipsTable.applicationId, applicationId),
          or(eq(membershipsTable.ownerUserId, actor.userId), and(sql`${membershipsTable.companyId} IS NOT NULL`, companyMembershipScope(actor))),
        );
    const rows = await db.select().from(membershipsTable).where(where).limit(1);
    return rows[0] ?? null;
  },
  async getById(actor: Actor, membershipId: string): Promise<Membership | null> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db.select().from(membershipsTable).where(membershipScope(actor, membershipId)).limit(1);
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async list(actor: Actor): Promise<Membership[]> {
    if (actor.kind === "anonymous") return [];
    const db = await getDb();
    if (actor.kind === "system") return db.select().from(membershipsTable);
    return db
      .select()
      .from(membershipsTable)
      .where(or(eq(membershipsTable.ownerUserId, actor.userId), companyMembershipScope(actor)));
  },

  async create(actor: Actor, input: MembershipInput): Promise<Membership> {
    if (actor.kind === "anonymous") forbidden();
    if (actor.kind === "member") {
      if (input.ownerUserId !== null && input.ownerUserId !== undefined && input.ownerUserId !== actor.userId) forbidden();
      if (input.companyId && !companyAccessScope(actor, input.companyId)) forbidden();
      if (!input.ownerUserId && !input.companyId) forbidden();
    }
    const db = await getDb();
    const rows = await db.insert(membershipsTable).values(input).returning();
    return rows[0];
  },

  async update(actor: Actor, membershipId: string, input: MembershipUpdate): Promise<Membership | null> {
    if (actor.kind === "anonymous") forbidden();
    if (Object.prototype.hasOwnProperty.call(input, "ownerUserId") || Object.prototype.hasOwnProperty.call(input, "companyId")) forbidden();
    const db = await getDb();
    const rows = await db.update(membershipsTable).set({...input, updatedAt: new Date()}).where(membershipScope(actor, membershipId)).returning();
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, membershipId: string): Promise<void> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    await db.delete(membershipsTable).where(membershipScope(actor, membershipId));
  },
};

export const membershipsRepo = membershipsRepository;

export const memberships = membershipsRepository;
