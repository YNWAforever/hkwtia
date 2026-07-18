import "server-only";

import {createHash, randomBytes} from "node:crypto";
import {and, eq, gt, inArray, isNull, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companies, companyMembers, memberships, profiles, seatInvitations, type CompanyMember, type SeatInvitation as DatabaseSeatInvitation} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type SeatRole = "owner" | "admin" | "member";

export type SeatInvitation = DatabaseSeatInvitation & {token: string};

export type SeatInvitationInput = Readonly<{email: string; role?: SeatRole; expiresAt?: Date}>;

export class SeatServiceError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SeatServiceError";
    this.code = code;
  }
}

type CompanyContext = Readonly<{id: string; seatLimit: number}>;
type SeatProfile = Readonly<{id: string; email?: string | null; displayName?: string | null}>;

export type SeatServiceDependencies = {
  getCompany(actor: Actor, companyId: string, transaction?: unknown): Promise<CompanyContext | null>;
  getCompanyById?(companyId: string, transaction?: unknown): Promise<CompanyContext | null>;
  listMembers(companyId: string, transaction?: unknown): Promise<CompanyMember[]>;
  listPendingInvitations(companyId: string, transaction?: unknown): Promise<DatabaseSeatInvitation[]>;
  getProfileByUserId(actor: Actor, userId: string): Promise<SeatProfile | null>;
  getUserEmail?(actor: Actor): Promise<string | null>;
  getInvitationByDigest(tokenDigest: string, transaction?: unknown): Promise<DatabaseSeatInvitation | null>;
  getInvitation?(invitationId: string, transaction?: unknown): Promise<DatabaseSeatInvitation | null>;
  insertInvitation(input: Omit<DatabaseSeatInvitation, "id" | "createdAt">, transaction?: unknown): Promise<DatabaseSeatInvitation>;
  markInvitationAccepted(id: string, userId: string, transaction?: unknown): Promise<DatabaseSeatInvitation | null>;
  insertMember(input: Pick<CompanyMember, "companyId" | "userId" | "role">, transaction?: unknown): Promise<CompanyMember>;
  getMember?(memberId: string, transaction?: unknown): Promise<CompanyMember | null>;
  updateMember(memberId: string, input: Partial<Pick<CompanyMember, "role" | "revokedAt">>, transaction?: unknown): Promise<CompanyMember | null>;
  updateInvitation?(invitationId: string, input: Partial<Pick<DatabaseSeatInvitation, "revokedAt">>, transaction?: unknown): Promise<DatabaseSeatInvitation | null>;
  withCompanyTransaction<T>(companyId: string, callback: (transaction: unknown) => Promise<T>): Promise<T>;
};

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new SeatServiceError("INVALID_EMAIL");
  return normalized;
}

function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenValue(): string {
  return randomBytes(32).toString("base64url");
}

function activeMembers(members: CompanyMember[]): CompanyMember[] {
  return members.filter((member) => member.revokedAt === null);
}

function managerFor(actor: Actor, members: CompanyMember[], companyId: string): CompanyMember {
  requireMember(actor);
  const current = members.find((member) => member.companyId === companyId && member.userId === actor.userId && member.revokedAt === null);
  if (!current || (current.role !== "owner" && current.role !== "admin")) forbidden();
  return current;
}

async function findMember(deps: SeatServiceDependencies, memberId: string, transaction?: unknown): Promise<CompanyMember | null> {
  if (deps.getMember) return deps.getMember(memberId, transaction);
  return null;
}

export function createSeatService(deps: SeatServiceDependencies) {
  return {
    async inviteSeat(actor: Actor, companyId: string, input: SeatInvitationInput): Promise<SeatInvitation> {
      requireMember(actor);
      const email = normalizeEmail(input.email);
      const role = input.role ?? "member";
      if (!(["owner", "admin", "member"] as string[]).includes(role)) throw new SeatServiceError("INVALID_ROLE");
      const token = tokenValue();
      const tokenDigest = digestToken(token);
      return deps.withCompanyTransaction(companyId, async (transaction) => {
        const company = await deps.getCompany(actor, companyId, transaction);
        if (!company) forbidden();
        const members = await deps.listMembers(companyId, transaction);
        const manager = managerFor(actor, members, companyId);
        if (role === "owner" && manager.role !== "owner") throw new SeatServiceError("ROLE_POLICY");
        const pending = await deps.listPendingInvitations(companyId, transaction);
        const existing = pending.find((invitation) => invitation.invitedEmail === email && invitation.role === role);
        if (existing) return {...existing, token: ""};
        if (activeMembers(members).length + pending.length >= company.seatLimit) throw new SeatServiceError("SEAT_LIMIT_REACHED");
        const row = await deps.insertInvitation({
          companyId,
          inviterUserId: actor.userId,
          invitedEmail: email,
          role,
          tokenDigest,
          expiresAt: input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          acceptedAt: null,
          acceptedByUserId: null,
          revokedAt: null,
        }, transaction);
        void manager;
        return {...row, token};
      });
    },

    async acceptSeatInvitation(actor: Actor, token: string): Promise<CompanyMember> {
      requireMember(actor);
      const digest = digestToken(token.trim());
      const initial = await deps.getInvitationByDigest(digest);
      if (!initial) throw new SeatServiceError("INVITATION_NOT_FOUND");
      return deps.withCompanyTransaction(initial.companyId, async (transaction) => {
        const invitation = await deps.getInvitationByDigest(digest, transaction);
        if (!invitation) throw new SeatServiceError("INVITATION_NOT_FOUND");
        if (invitation.revokedAt !== null) throw new SeatServiceError("INVITATION_REVOKED");
        if (invitation.acceptedAt !== null) throw new SeatServiceError("INVITATION_ALREADY_ACCEPTED");
        if (invitation.expiresAt.getTime() <= Date.now()) throw new SeatServiceError("INVITATION_EXPIRED");
        const profile = await deps.getProfileByUserId(actor, actor.userId);
        const actorEmail = normalizeEmail(profile?.email ?? (await deps.getUserEmail?.(actor) ?? ""));
        if (actorEmail !== invitation.invitedEmail) throw new SeatServiceError("INVITATION_EMAIL_MISMATCH");
        const company = deps.getCompanyById
          ? await deps.getCompanyById(invitation.companyId, transaction)
          : await deps.getCompany(actor, invitation.companyId, transaction);
        if (!company) forbidden();
        const members = await deps.listMembers(invitation.companyId, transaction);
        if (activeMembers(members).some((member) => member.userId === actor.userId)) throw new SeatServiceError("MEMBERSHIP_EXISTS");
        if (activeMembers(members).length >= company.seatLimit) throw new SeatServiceError("SEAT_LIMIT_REACHED");
        try {
          const member = await deps.insertMember({companyId: invitation.companyId, userId: actor.userId, role: invitation.role}, transaction);
          await deps.markInvitationAccepted(invitation.id, actor.userId, transaction);
          return member;
        } catch (error) {
          if (error instanceof Error && /unique|duplicate|company.?user/i.test(error.message)) throw new SeatServiceError("MEMBERSHIP_EXISTS");
          throw error;
        }
      });
    },

    async revokeSeat(actor: Actor, memberId: string): Promise<void> {
      requireMember(actor);
      const member = await findMember(deps, memberId);
      if (!member) throw new SeatServiceError("MEMBER_NOT_FOUND");
      return deps.withCompanyTransaction(member.companyId, async (transaction) => {
        const members = await deps.listMembers(member.companyId, transaction);
        const currentMember = (await findMember(deps, memberId, transaction)) ?? member;
        if (currentMember.revokedAt !== null) throw new SeatServiceError("MEMBER_NOT_FOUND");
        const manager = managerFor(actor, members, member.companyId);
        if (currentMember.role === "owner" && manager.role !== "owner") throw new SeatServiceError("ROLE_POLICY");
        if (currentMember.role === "owner" && activeMembers(members).filter((candidate) => candidate.role === "owner").length <= 1) throw new SeatServiceError("LAST_OWNER_PROTECTION");
        await deps.updateMember(memberId, {revokedAt: new Date()}, transaction);
      });
    },

    async changeSeatRole(actor: Actor, memberId: string, role: SeatRole): Promise<void> {
      requireMember(actor);
      if (!(["owner", "admin", "member"] as string[]).includes(role)) throw new SeatServiceError("INVALID_ROLE");
      const member = await findMember(deps, memberId);
      if (!member) throw new SeatServiceError("MEMBER_NOT_FOUND");
      return deps.withCompanyTransaction(member.companyId, async (transaction) => {
        const members = await deps.listMembers(member.companyId, transaction);
        const currentMember = (await findMember(deps, memberId, transaction)) ?? member;
        if (currentMember.revokedAt !== null) throw new SeatServiceError("MEMBER_NOT_FOUND");
        const manager = managerFor(actor, members, member.companyId);
        if (manager.role === "admin" && (currentMember.role === "owner" || role === "owner")) throw new SeatServiceError("ROLE_POLICY");
        if (currentMember.role === "owner" && role !== "owner" && activeMembers(members).filter((candidate) => candidate.role === "owner").length <= 1) throw new SeatServiceError("LAST_OWNER_PROTECTION");
        await deps.updateMember(memberId, {role}, transaction);
      });
    },

    async revokeInvitation(actor: Actor, invitationId: string): Promise<void> {
      requireMember(actor);
      if (!deps.getInvitation || !deps.updateInvitation) throw new SeatServiceError("UNSUPPORTED");
      const invitation = await deps.getInvitation(invitationId);
      if (!invitation || invitation.revokedAt !== null || invitation.acceptedAt !== null) throw new SeatServiceError("INVITATION_NOT_FOUND");
      return deps.withCompanyTransaction(invitation.companyId, async (transaction) => {
        const current = await deps.getInvitation?.(invitationId, transaction);
        if (!current || current.revokedAt !== null || current.acceptedAt !== null) throw new SeatServiceError("INVITATION_NOT_FOUND");
        const members = await deps.listMembers(invitation.companyId, transaction);
        managerFor(actor, members, invitation.companyId);
        await deps.updateInvitation?.(invitationId, {revokedAt: new Date()}, transaction);
      });
    },
  };
}

async function productionDependencies(): Promise<SeatServiceDependencies> {
  const db = await getDb();
  const getCompany = async (actor: Actor, companyId: string, transaction?: unknown): Promise<CompanyContext | null> => {
    if (actor.kind !== "member") return null;
    const queryDb = (transaction ?? db) as typeof db;
    const rows = await queryDb
      .select({id: companies.id, seatLimit: memberships.seatLimit})
      .from(companies)
      .innerJoin(memberships, eq(memberships.companyId, companies.id))
      .innerJoin(companyMembers, eq(companyMembers.companyId, companies.id))
      .where(and(eq(companies.id, companyId), eq(companyMembers.userId, actor.userId), isNull(companyMembers.revokedAt), inArray(memberships.status, ["active", "past_due", "cancel_at_period_end"])))
      .limit(1);
    return rows[0] ?? null;
  };
  const getCompanyById = async (companyId: string, transaction?: unknown): Promise<CompanyContext | null> => {
    const queryDb = (transaction ?? db) as typeof db;
    const rows = await queryDb
      .select({id: companies.id, seatLimit: memberships.seatLimit})
      .from(companies)
      .innerJoin(memberships, eq(memberships.companyId, companies.id))
      .where(and(eq(companies.id, companyId), inArray(memberships.status, ["active", "past_due", "cancel_at_period_end"])))
      .limit(1);
    return rows[0] ?? null;
  };
  return {
    getCompany,
    getCompanyById,
    listMembers: async (companyId, transaction) => ((transaction ?? db) as typeof db).select().from(companyMembers).where(and(eq(companyMembers.companyId, companyId), isNull(companyMembers.revokedAt))),
    listPendingInvitations: async (companyId, transaction) => ((transaction ?? db) as typeof db).select().from(seatInvitations).where(and(eq(seatInvitations.companyId, companyId), isNull(seatInvitations.acceptedAt), isNull(seatInvitations.revokedAt), gt(seatInvitations.expiresAt, new Date()))),
    getProfileByUserId: async (actor, userId) => {
      if (actor.kind !== "member" || actor.userId !== userId) forbidden();
      const rows = await db.select({id: profiles.id, displayName: profiles.displayName}).from(profiles).where(eq(profiles.id, userId)).limit(1);
      return rows[0] ?? null;
    },
    getUserEmail: async () => {
      try {
        const {getSession} = await import("@/lib/auth/server");
        const session = await getSession();
        return typeof session?.user?.email === "string" ? session.user.email : null;
      } catch {
        return null;
      }
    },
    getInvitation: async (invitationId, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).select().from(seatInvitations).where(eq(seatInvitations.id, invitationId)).limit(1);
      return rows[0] ?? null;
    },
    getInvitationByDigest: async (tokenDigest, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).select().from(seatInvitations).where(eq(seatInvitations.tokenDigest, tokenDigest)).limit(1);
      return rows[0] ?? null;
    },
    insertInvitation: async (input, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).insert(seatInvitations).values(input).returning();
      return rows[0];
    },
    markInvitationAccepted: async (id, userId, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).update(seatInvitations).set({acceptedAt: new Date(), acceptedByUserId: userId}).where(and(eq(seatInvitations.id, id), isNull(seatInvitations.acceptedAt), isNull(seatInvitations.revokedAt))).returning();
      return rows[0] ?? null;
    },
    updateInvitation: async (invitationId, input, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).update(seatInvitations).set(input).where(eq(seatInvitations.id, invitationId)).returning();
      return rows[0] ?? null;
    },
    insertMember: async (input, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).insert(companyMembers).values(input).returning();
      return rows[0];
    },
    getMember: async (memberId, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).select().from(companyMembers).where(eq(companyMembers.id, memberId)).limit(1);
      return rows[0] ?? null;
    },
    updateMember: async (memberId, input, transaction) => {
      const rows = await ((transaction ?? db) as typeof db).update(companyMembers).set(input).where(eq(companyMembers.id, memberId)).returning();
      return rows[0] ?? null;
    },
    withCompanyTransaction: async (companyId, callback) => db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT id FROM ${memberships} WHERE ${memberships.companyId} = ${companyId} FOR UPDATE`);
      return callback(transaction);
    }),
  };
}

export async function inviteSeat(actor: Actor, companyId: string, input: SeatInvitationInput): Promise<SeatInvitation> {
  return (await createSeatService(await productionDependencies()).inviteSeat(actor, companyId, input));
}

export async function acceptSeatInvitation(actor: Actor, token: string): Promise<CompanyMember> {
  return (await createSeatService(await productionDependencies()).acceptSeatInvitation(actor, token));
}

export async function revokeSeat(actor: Actor, memberId: string): Promise<void> {
  return createSeatService(await productionDependencies()).revokeSeat(actor, memberId);
}

export async function changeSeatRole(actor: Actor, memberId: string, role: SeatRole): Promise<void> {
  return createSeatService(await productionDependencies()).changeSeatRole(actor, memberId, role);
}

export async function revokeInvitation(actor: Actor, invitationId: string): Promise<void> {
  return createSeatService(await productionDependencies()).revokeInvitation(actor, invitationId);
}

export {normalizeEmail};
