import {and, eq, exists, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companies as companiesTable, companyMembers, type Company} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type CompanyInput = Pick<Company, "legalName" | "displayName"> & Partial<Pick<Company, "website" | "industry" | "sizeBand" | "description" | "logoReference" | "directoryVisible">>;
export type CompanyUpdate = Partial<CompanyInput>;

function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companiesTable.id} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function companyScope(actor: Actor, companyId: string) {
  if (actor.kind === "system") return sql`true`;
  if (actor.kind === "anonymous") return and(eq(companiesTable.id, companyId), eq(companiesTable.directoryVisible, true));
  return and(eq(companiesTable.id, companyId), companyMembershipScope(actor));
}

export const companiesRepository = {
  async getById(actor: Actor, companyId: string): Promise<Company | null> {
    const db = await getDb();
    const rows = await db.select().from(companiesTable).where(companyScope(actor, companyId)).limit(1);
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async list(actor: Actor): Promise<Company[]> {
    const db = await getDb();
    if (actor.kind === "system") return db.select().from(companiesTable);
    if (actor.kind === "anonymous") return db.select().from(companiesTable).where(eq(companiesTable.directoryVisible, true));
    return db.select().from(companiesTable).where(companyMembershipScope(actor));
  },

  async create(actor: Actor, input: CompanyInput): Promise<Company> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db.insert(companiesTable).values(input).returning();
    return rows[0];
  },

  async update(actor: Actor, companyId: string, input: CompanyUpdate): Promise<Company | null> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db.update(companiesTable).set({...input, updatedAt: new Date()}).where(companyScope(actor, companyId)).returning();
    if (!rows[0]) forbidden();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, companyId: string): Promise<void> {
    if (actor.kind !== "system" && actor.kind !== "member") forbidden();
    const db = await getDb();
    await db.delete(companiesTable).where(companyScope(actor, companyId));
  },
};

export const companiesRepo = companiesRepository;

export const companies = companiesRepository;
