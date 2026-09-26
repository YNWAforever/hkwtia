import "server-only";

import {and, desc, eq, inArray, isNull, or, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companyMembers, membershipApplications as membershipApplicationsTable, type MembershipApplication} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type ApplicationInput = Pick<MembershipApplication, "planCode"> & Partial<Pick<MembershipApplication, "companyId" | "currentStep" | "status">>;
export type ApplicationUpdate = Partial<Pick<MembershipApplication, "planCode" | "currentStep" | "status">>;

// `EXISTS (…)` written out rather than built with Drizzle's `exists()`, which
// pastes a raw `sql` fragment in without parentheses and so emits the syntax
// error `EXISTS SELECT …`. See the note in `lib/db/repos/companies.ts`.
function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return sql`EXISTS (SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${membershipApplicationsTable.companyId} AND ${companyMembers.userId} = ${actor.profileId} AND ${companyMembers.revokedAt} IS NULL)`;
}

function companyAccessScope(actor: Extract<Actor, {kind: "member"}>, companyId: string) {
  return sql`EXISTS (SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companyId} AND ${companyMembers.userId} = ${actor.profileId} AND ${companyMembers.revokedAt} IS NULL)`;
}
function applicationScope(actor: Actor, applicationId: string) {
  if (actor.kind === "system") return and(eq(membershipApplicationsTable.id, applicationId), sql`true`);
  if (actor.kind !== "member") return sql`false`;
  return and(eq(membershipApplicationsTable.id, applicationId), or(eq(membershipApplicationsTable.applicantUserId, actor.profileId), companyMembershipScope(actor)));
}

export const applicationsRepository = {
  /** Applicant-owned applications only; company access never grants join-resume authority. */
  async listOwned(actor: Actor, planCode?: MembershipApplication["planCode"]): Promise<MembershipApplication[]> {
    requireMember(actor);
    const db = await getDb();
    return db.select().from(membershipApplicationsTable)
      .where(and(eq(membershipApplicationsTable.applicantUserId, actor.profileId), planCode ? eq(membershipApplicationsTable.planCode, planCode) : sql`true`))
      .orderBy(desc(membershipApplicationsTable.updatedAt), desc(membershipApplicationsTable.id));
  },
  /** The advisory lock serializes find/create for an applicant, plan and ownership target. */
  async resumeOrCreate(actor: Actor, input: {planCode: MembershipApplication["planCode"]; companyId: string | null; newApplication: boolean}): Promise<MembershipApplication> {
    requireMember(actor);
    const db = await getDb();
    return db.transaction(async (tx) => {
      const scope = `${actor.profileId}:${input.planCode}:${input.companyId ?? "unassigned"}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`);
      if (input.companyId) {
        const member = await tx.select({userId: companyMembers.userId}).from(companyMembers)
          .where(and(eq(companyMembers.companyId, input.companyId), eq(companyMembers.userId, actor.profileId), isNull(companyMembers.revokedAt))).limit(1);
        if (!member[0]) forbidden();
      }
      if (!input.newApplication) {
        const existing = await tx.select().from(membershipApplicationsTable)
          .where(and(
            eq(membershipApplicationsTable.applicantUserId, actor.profileId),
            eq(membershipApplicationsTable.planCode, input.planCode),
            input.companyId ? eq(membershipApplicationsTable.companyId, input.companyId) : isNull(membershipApplicationsTable.companyId),
            inArray(membershipApplicationsTable.status, ["draft", "pending_payment", "pending_review"]),
          ))
          .orderBy(desc(membershipApplicationsTable.updatedAt), desc(membershipApplicationsTable.id)).limit(1);
        if (existing[0]) return existing[0];
      }
      const created = await tx.insert(membershipApplicationsTable).values({
        applicantUserId: actor.profileId,
        planCode: input.planCode,
        companyId: input.companyId,
        currentStep: "profile",
        status: "draft",
      }).returning();
      return created[0];
    });
  },
  async setCompany(actor: Actor, applicationId: string, companyId: string): Promise<MembershipApplication | null> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db
      .update(membershipApplicationsTable)
      .set({companyId, updatedAt: new Date()})
      .where(and(eq(membershipApplicationsTable.id, applicationId), eq(membershipApplicationsTable.applicantUserId, actor.profileId), companyAccessScope(actor, companyId)))
      .returning();
    if (!rows[0]) forbidden();
    return rows[0] ?? null;
  },
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
    if (actor.kind !== "member") return [];
    return db.select().from(membershipApplicationsTable).where(or(eq(membershipApplicationsTable.applicantUserId, actor.profileId), companyMembershipScope(actor)));
  },

  async create(actor: Actor, input: ApplicationInput): Promise<MembershipApplication> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db.insert(membershipApplicationsTable).values({...input, applicantUserId: actor.profileId}).returning();
    return rows[0];
  },

  async update(actor: Actor, applicationId: string, input: ApplicationUpdate): Promise<MembershipApplication | null> {
    requireMember(actor);
    if (Object.prototype.hasOwnProperty.call(input, "companyId")) forbidden();
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
