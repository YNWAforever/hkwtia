import {and, eq, exists, or, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companyMembers, membershipApplications as membershipApplicationsTable, type MembershipApplication} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type ApplicationInput = Pick<MembershipApplication, "planCode"> & Partial<Pick<MembershipApplication, "companyId" | "currentStep" | "status">>;
export type ApplicationUpdate = Partial<ApplicationInput>;

function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipApplicationsTable.companyId} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function applicationScope(actor: Actor, applicationId: string) {
  if (actor.kind === "system") return and(eq(membershipApplicationsTable.id, applicationId), sql`true`);
  if (actor.kind === "anonymous") return sql`false`;
  return and(eq(membershipApplicationsTable.id, applicationId), or(eq(membershipApplicationsTable.applicantUserId, actor.userId), companyMembershipScope(actor)));
}

export const applicationsRepository = {
  async getById(actor: Actor, applicationId: string): Promise<MembershipApplication | null> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db.select().from(membershipApplicationsTable).where(applicationScope(actor, applicationId)).limit(1);
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async list(actor: Actor): Promise<MembershipApplication[]> {
    if (actor.kind === "anonymous") return [];
    const db = await getDb();
    if (actor.kind === "system") return db.select().from(membershipApplicationsTable);
    return db.select().from(membershipApplicationsTable).where(or(eq(membershipApplicationsTable.applicantUserId, actor.userId), companyMembershipScope(actor)));
  },

  async create(actor: Actor, input: ApplicationInput): Promise<MembershipApplication> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db.insert(membershipApplicationsTable).values({...input, applicantUserId: actor.userId}).returning();
    return rows[0];
  },

  async update(actor: Actor, applicationId: string, input: ApplicationUpdate): Promise<MembershipApplication | null> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db.update(membershipApplicationsTable).set({...input, updatedAt: new Date()}).where(applicationScope(actor, applicationId)).returning();
    if (!rows[0]) forbidden();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, applicationId: string): Promise<void> {
    requireMember(actor);
    const db = await getDb();
    await db.delete(membershipApplicationsTable).where(applicationScope(actor, applicationId));
  },
};

export const applicationsRepo = applicationsRepository;

export const applications = applicationsRepository;
