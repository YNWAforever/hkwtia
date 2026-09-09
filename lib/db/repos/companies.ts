import "server-only";

import {randomUUID} from "node:crypto";
import {and, eq, exists, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {companies as companiesTable, companyMembers, membershipApplications, type Company} from "@/lib/db/server-schema";
import {forbidden, getDb, requireMember, requireSystem} from "@/lib/db/repos/common";

export type CompanyInput = Pick<Company, "legalName" | "displayName"> & Partial<Pick<Company, "website" | "industry" | "sizeBand" | "description" | "logoReference" | "directoryVisible">>;
export type CompanyUpdate = Partial<CompanyInput>;

/**
 * Programme B-7: the columns `/members` and `/members/[slug]` render — exactly
 * what `directoryColumns` and `detailColumns` in `lib/db/repos/company-profiles.ts`
 * project. `legalName`, `logoReference` and `directoryVisible` are absent
 * because the member directory never renders them (the last one gates the older
 * anonymous company reads in this file instead).
 */
const PUBLICLY_RENDERED_COLUMNS = ["displayName", "website", "industry", "sizeBand", "description"] as const;

/**
 * The moderation loop is only as strong as its weakest writer.
 * `companyProfilesRepository.updateProfile` sends a `published` profile back to
 * `pending_review` on every edit, but it is not the only writer of the copy that
 * page shows: `/portal/company` posts `updateCompanyAction` →
 * `lib/portal/command-core.ts`'s `updateCompany` → `update` below, whose
 * `companyUpdateSchema` takes display name, website, industry, size band and
 * description as free text. Without this, a company that passed review once
 * could rewrite its live description indefinitely: the status stays `published`,
 * so `listForReview` (which selects only `pending_review`) never shows staff
 * that anything changed.
 *
 * The rule is the column, not the caller — a write that touches public copy
 * re-enters review whoever makes it, so no future caller of this repository is
 * a second bypass. In practice only the join step and the portal reach here, both
 * as members; the Stripe webhook actor writes billing state, not copy. Reviewer
 * columns reset the same way `updateProfile` resets them, so a stale approval or
 * a stale rejection reason never describes copy nobody has read; a re-save of
 * identical text also re-enters review, which the SQL cannot tell apart from a
 * rewrite and which is the safe direction to be wrong in.
 */
function reviewResetFor(input: CompanyUpdate) {
  if (!PUBLICLY_RENDERED_COLUMNS.some((column) => input[column] !== undefined)) return {};
  return {
    publicProfileStatus: sql`CASE WHEN ${companiesTable.publicProfileStatus} = 'published'
      THEN 'pending_review'::public_profile_status ELSE ${companiesTable.publicProfileStatus} END`,
    profileReviewedAt: null,
    profileReviewedByProfileId: null,
    profileRejectionReason: null,
  };
}

function companyMembershipScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companiesTable.id} AND ${companyMembers.userId} = ${actor.profileId} AND ${companyMembers.revokedAt} IS NULL`,
  );
}

function companyManagementScope(actor: Extract<Actor, {kind: "member"}>) {
  return exists(
    sql`SELECT 1 FROM ${companyMembers} WHERE ${companyMembers.companyId} = ${companiesTable.id} AND ${companyMembers.userId} = ${actor.profileId} AND (${companyMembers.role} = ${"owner"} OR ${companyMembers.role} = ${"admin"}) AND ${companyMembers.revokedAt} IS NULL`,
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
          AND applicant_user_id = ${actor.profileId}
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
        SELECT ${memberId}, id, ${actor.profileId}, 'owner'
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
    if (actor.kind === "system") requireSystem(actor);
    const db = await getDb();
    const rows = await db.select().from(companiesTable).where(companyScope(actor, companyId)).limit(1);
    if (!rows[0] && actor.kind === "member") forbidden();
    return rows[0] ?? null;
  },

  async list(actor: Actor): Promise<Company[]> {
    if (actor.kind === "system") requireSystem(actor);
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
    if (actor.kind === "system") requireSystem(actor);
    const db = await getDb();
    const rows = await db.update(companiesTable)
      .set({...input, ...reviewResetFor(input), updatedAt: new Date()})
      .where(companyMutationScope(actor, companyId))
      .returning();
    if (!rows[0]) forbidden();
    return rows[0] ?? null;
  },

  async remove(actor: Actor, companyId: string): Promise<void> {
    if (actor.kind !== "system" && actor.kind !== "member") forbidden();
    if (actor.kind === "system") requireSystem(actor);
    const db = await getDb();
    await db.delete(companiesTable).where(companyScope(actor, companyId));
  },
};

export const companiesRepo = companiesRepository;

export const companies = companiesRepository;
