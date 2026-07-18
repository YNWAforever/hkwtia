import "server-only";

import {randomUUID} from "node:crypto";
import {and, eq, exists, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companies as companiesTable, companyMembers, membershipApplications, type Company} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";

export type CompanyInput = Pick<Company, "legalName" | "displayName"> & Partial<Pick<Company, "website" | "industry" | "sizeBand" | "description" | "logoReference" | "directoryVisible">>;
export type CompanyUpdate = Partial<CompanyInput>;

function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companiesTable.id} AND ${companyMembers.userId} = ${actor.userId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function companyManagementScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companiesTable.id} AND ${companyMembers.userId} = ${actor.userId} AND (${companyMembers.role} = ${"owner"} OR ${companyMembers.role} = ${"admin"}) AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function companyScope(actor: Actor, companyId: string) {
  if (actor.kind === "system") return eq(companiesTable.id, companyId);
  if (actor.kind === "anonymous") return and(eq(companiesTable.id, companyId), eq(companiesTable.directoryVisible, true));
  if (actor.kind !== "member") return sql`false`;
  return and(eq(companiesTable.id, companyId), companyMembershipScope(actor));
}

function companyMutationScope(actor: Actor, companyId: string) {
  if (actor.kind === "system") return eq(companiesTable.id, companyId);
  if (actor.kind === "anonymous") return sql`false`;
  if (actor.kind !== "member") return sql`false`;
  return and(eq(companiesTable.id, companyId), companyManagementScope(actor));
}

export const companiesRepository = {
  async createForApplication(
    actor: Actor,
    applicationId: string,
    input: CompanyInput,
    ids: {companyId?: () => string; memberId?: () => string} = {},
  ): Promise<Company> {
    requireMember(actor);
    const db = await getDb();
    const companyId = ids.companyId?.() ?? randomUUID();
    const memberId = ids.memberId?.() ?? randomUUID();
    const result = await db.execute(sql`
      WITH claimed_application AS (
        UPDATE ${membershipApplications}
        SET company_id = ${companyId}, current_step = 'company', updated_at = NOW()
        WHERE id = ${applicationId}
          AND applicant_user_id = ${actor.userId}
          AND company_id IS NULL
        RETURNING id
      ), created_company AS (
        INSERT INTO ${companiesTable} (
          id, legal_name, display_name, website, industry, size_band, description, directory_visible
        )
        SELECT
          ${companyId}, ${input.legalName}, ${input.displayName}, ${input.website ?? null},
          ${input.industry ?? null}, ${input.sizeBand ?? null}, ${input.description ?? null},
          ${input.directoryVisible ?? false}
        FROM claimed_application
        RETURNING *
      ), created_owner AS (
        INSERT INTO ${companyMembers} (id, company_id, user_id, role)
        SELECT ${memberId}, id, ${actor.userId}, 'owner'
        FROM created_company
        RETURNING company_id
      )
      SELECT
        company.id,
        company.legal_name AS "legalName",
        company.display_name AS "displayName",
        company.website,
        company.industry,
        company.size_band AS "sizeBand",
        company.description,
        company.logo_reference AS "logoReference",
        company.directory_visible AS "directoryVisible",
        company.created_at AS "createdAt",
        company.updated_at AS "updatedAt"
      FROM created_company company
      INNER JOIN created_owner owner ON owner.company_id = company.id
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    if (!rows[0]) throw new Error("APPLICATION_COMPANY_CONFLICT");
    return rows[0] as Company;
  },

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
    if (actor.kind !== "member") return [];
    return db.select().from(companiesTable).where(companyMembershipScope(actor));
  },

  async create(actor: Actor, input: CompanyInput): Promise<Company> {
    requireMember(actor);
    const db = await getDb();
    const rows = await db.insert(companiesTable).values(input).returning();
    return rows[0];
  },

  async update(actor: Actor, companyId: string, input: CompanyUpdate): Promise<Company | null> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db.update(companiesTable).set({...input, updatedAt: new Date()}).where(companyMutationScope(actor, companyId)).returning();
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
