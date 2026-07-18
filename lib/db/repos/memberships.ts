import "server-only";

import {and, eq, exists, isNull, or, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companyMembers, membershipApplications, memberships as membershipsTable, type Membership} from "@/lib/db/server-schema";
import {forbidden, getDb} from "@/lib/db/repos/common";

export type MembershipInput = Pick<Membership, "planCode" | "seatLimit"> & Partial<Pick<Membership, "ownerUserId" | "companyId" | "applicationId" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "billingPeriodStart" | "billingPeriodEnd" | "cancelAtPeriodEnd">>;
export type MembershipUpdate = Partial<Pick<Membership, "planCode" | "status" | "seatLimit" | "stripeCustomerId" | "stripeSubscriptionId" | "billingPeriodStart" | "billingPeriodEnd" | "cancelAtPeriodEnd">>;

function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipsTable.companyId} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function companyBillingManagerScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipsTable.companyId} AND ${companyMembers.userId} = ${actor.userId} AND (${companyMembers.role} = ${"owner"} OR ${companyMembers.role} = ${"admin"}) AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function applicationAccessScope(actor: Extract<Actor, {kind: "member"}>, applicationId: string) {
  return and(
    eq(membershipApplications.id, applicationId),
    or(
      eq(membershipApplications.applicantUserId, actor.userId),
      exists(
        sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipApplications.companyId} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
      ),
    ),
  );
}

async function authorizeMemberCreate(
  db: Awaited<ReturnType<typeof getDb>>,
  actor: Extract<Actor, {kind: "member"}>,
  input: MembershipInput,
) {
  const hasOwner = input.ownerUserId !== null && input.ownerUserId !== undefined;
  const hasCompany = input.companyId !== null && input.companyId !== undefined;
  if (hasOwner === hasCompany) forbidden();
  if (hasOwner && input.ownerUserId !== actor.userId) forbidden();

  if (!input.applicationId) forbidden();
  if (hasCompany) {
    const companyAccess = await db
      .select({companyId: companyMembers.companyId})
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, input.companyId!),
        eq(companyMembers.userId, actor.userId),
        isNull(companyMembers.revokedAt),
      ))
      .limit(1);
    if (!companyAccess[0]) forbidden();
  }

  if (input.applicationId) {
    const applications = await db
      .select({
        applicantUserId: membershipApplications.applicantUserId,
        companyId: membershipApplications.companyId,
        planCode: membershipApplications.planCode,
      })
      .from(membershipApplications)
      .where(applicationAccessScope(actor, input.applicationId))
      .limit(1);
    const application = applications[0];
    if (!application || application.planCode !== input.planCode) forbidden();
    if (hasCompany && application.companyId !== input.companyId) forbidden();
    if (hasOwner && (application.companyId !== null || application.applicantUserId !== input.ownerUserId)) forbidden();
  }
}
function membershipScope(actor: Actor, membershipId: string) {
  if (actor.kind === "system") return and(eq(membershipsTable.id, membershipId), sql`true`);
  if (actor.kind !== "member") return sql`false`;
  return and(
    eq(membershipsTable.id, membershipId),
    or(eq(membershipsTable.ownerUserId, actor.userId), and(sql`${membershipsTable.companyId} IS NOT NULL`, companyMembershipScope(actor))),
  );
}

export const membershipsRepository = {
  async getByApplicationId(actor: Actor, applicationId: string): Promise<Membership | null> {
    if (actor.kind !== "member" && actor.kind !== "system") forbidden();
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
    if (actor.kind !== "member" && actor.kind !== "system") forbidden();
    const db = await getDb();
    const rows = await db.select().from(membershipsTable).where(membershipScope(actor, membershipId)).limit(1);
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async getBillingAccess(actor: Actor, membershipId: string): Promise<Membership> {
    if (actor.kind !== "member") forbidden();
    const db = await getDb();
    const rows = await db
      .select()
      .from(membershipsTable)
      .where(and(
        eq(membershipsTable.id, membershipId),
        or(
          eq(membershipsTable.ownerUserId, actor.userId),
          and(sql`${membershipsTable.companyId} IS NOT NULL`, companyBillingManagerScope(actor)),
        ),
      ))
      .limit(1);
    if (!rows[0]) forbidden();
    return rows[0];
  },

  async list(actor: Actor): Promise<Membership[]> {
    if (actor.kind === "anonymous") return [];
    const db = await getDb();
    if (actor.kind === "system") return db.select().from(membershipsTable);
    if (actor.kind !== "member") return [];
    return db
      .select()
      .from(membershipsTable)
      .where(or(eq(membershipsTable.ownerUserId, actor.userId), companyMembershipScope(actor)));
  },

  async create(actor: Actor, input: MembershipInput): Promise<Membership> {
    if (actor.kind !== "member" && actor.kind !== "system") forbidden();
    const db = await getDb();
    if (actor.kind === "member") await authorizeMemberCreate(db, actor, input);
    const rows = await db.insert(membershipsTable).values(input).returning();
    return rows[0];
  },

  async update(actor: Actor, membershipId: string, input: MembershipUpdate): Promise<Membership | null> {
    if (actor.kind !== "member" && actor.kind !== "system") forbidden();
    if (Object.prototype.hasOwnProperty.call(input, "ownerUserId") || Object.prototype.hasOwnProperty.call(input, "companyId")) forbidden();
    const db = await getDb();
    const rows = await db.update(membershipsTable).set({...input, updatedAt: new Date()}).where(membershipScope(actor, membershipId)).returning();
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, membershipId: string): Promise<void> {
    if (actor.kind !== "member" && actor.kind !== "system") forbidden();
    const db = await getDb();
    await db.delete(membershipsTable).where(membershipScope(actor, membershipId));
  },
};

export const membershipsRepo = membershipsRepository;

export const memberships = membershipsRepository;
