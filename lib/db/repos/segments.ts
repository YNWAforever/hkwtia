import "server-only";

import {and, eq, sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import type {SegmentMember, SegmentPreview} from "@/lib/admin/segments";
import {segmentFilterSchema, segmentIdSchema, type SegmentFilterSet, type SegmentPagination, type SegmentSaveInput} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/actor";
import {auditEvents, companies, companyMembers, engagementScores, memberships, profiles, savedSegments} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const segmentRowSchema = z.object({
  profileId: z.string(), displayName: z.string(), email: z.string().nullable(), companyName: z.string().nullable(),
  planCode: z.string().nullable(), membershipStatus: z.string().nullable(), renewalAt: z.coerce.date().nullable(), score: z.union([z.string(), z.number()]).nullable(),
});
const countRowSchema = z.object({total: z.coerce.number()});
const savedSegmentSchema = z.object({
  id: z.string().uuid(), ownerProfileId: z.string(), nameEn: z.string(), nameZh: z.string().nullable(), filterVersion: z.number().int(), filters: z.record(z.unknown()), createdAt: z.coerce.date(), updatedAt: z.coerce.date(),
});

type SegmentRow = z.infer<typeof segmentRowSchema>;
export type SavedSegmentRecord = Readonly<{id: string; ownerProfileId: string; nameEn: string; nameZh: string | null; filterVersion: number; filters: SegmentFilterSet; createdAt: string; updatedAt: string}>;

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMember(row: SegmentRow): SegmentMember {
  return {...row, renewalAt: row.renewalAt?.toISOString() ?? null, score: numberOrNull(row.score)};
}

function cursorClause(cursor: string | null): SQL {
  if (!cursor) return sql`TRUE`;
  const parsed = z.object({displayName: z.string(), profileId: z.string()}).strict().parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  return sql`lower("displayName") > ${parsed.displayName} OR (lower("displayName") = ${parsed.displayName} AND "profileId" > ${parsed.profileId})`;
}

function encodeCursor(member: SegmentMember): string {
  return Buffer.from(JSON.stringify({displayName: member.displayName.toLocaleLowerCase("en"), profileId: member.profileId}), "utf8").toString("base64url");
}

/** Builds the sole parameterized predicate set used by both preview and export. */
function segmentPredicates(filter: SegmentFilterSet): SQL {
  const terms: SQL[] = [];
  if (filter.tier.length) terms.push(sql`${memberships.planCode} IN (${sql.join(filter.tier.map((tier) => sql`${tier}`), sql`, `)})`);
  if (filter.status.length) terms.push(sql`${memberships.status} IN (${sql.join(filter.status.map((status) => sql`${status}`), sql`, `)})`);
  if (filter.scoreMin !== null) terms.push(sql`${engagementScores.score} >= ${filter.scoreMin}`);
  if (filter.scoreMax !== null) terms.push(sql`${engagementScores.score} <= ${filter.scoreMax}`);
  if (filter.renewalWithinDays !== null) {
    const now = new Date();
    const renewalCutoff = new Date(now.getTime() + filter.renewalWithinDays * 86_400_000);
    terms.push(sql`${memberships.billingPeriodEnd} >= ${now} AND ${memberships.billingPeriodEnd} <= ${renewalCutoff}`);
  }
  if (filter.sector) terms.push(sql`${companies.industry} ILIKE ${`%${filter.sector}%`}`);
  if (filter.lastLoginBeforeDays !== null) {
    const cutoff = new Date(Date.now() - filter.lastLoginBeforeDays * 86_400_000);
    terms.push(sql`${profiles.lastLoginAt} <= ${cutoff}`);
  }
  return terms.length ? and(...terms)! : sql`TRUE`;
}

function projectedMembers(filter: SegmentFilterSet): SQL {
  const predicates = segmentPredicates(filter);
  return sql`
    WITH candidate_rows AS (
      SELECT ${profiles.id} AS profile_id, ${profiles.displayName} AS display_name, ${profiles.email} AS email,
        ${companies.displayName} AS company_name, ${memberships.planCode} AS plan_code, ${memberships.status} AS membership_status,
        ${memberships.billingPeriodEnd} AS renewal_at, ${engagementScores.score} AS score,
        ROW_NUMBER() OVER (PARTITION BY ${profiles.id} ORDER BY ${memberships.billingPeriodEnd} ASC NULLS LAST, ${memberships.id} NULLS LAST, ${companies.id} NULLS LAST) AS row_rank
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      LEFT JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
      WHERE ${predicates}
    )
    SELECT profile_id AS "profileId", display_name AS "displayName", email, company_name AS "companyName", plan_code AS "planCode", membership_status AS "membershipStatus", renewal_at AS "renewalAt", score
    FROM candidate_rows WHERE row_rank = 1
  `;
}

function toSavedSegment(record: z.infer<typeof savedSegmentSchema>): SavedSegmentRecord {
  return {...record, filters: segmentFilterSchema.parse(record.filters), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString()};
}

export const segmentsRepository = {
  async preview(actor: AdminActor, filter: SegmentFilterSet, pagination: SegmentPagination): Promise<SegmentPreview> {
    requireAdmin(actor);
    const db = await getDb();
    const projected = projectedMembers(filter);
    const total = countRowSchema.parse(resultRows(await db.execute(sql`SELECT count(*) AS total FROM (${projected}) AS segment_members`))[0]).total;
    const rows = z.array(segmentRowSchema).parse(resultRows(await db.execute(sql`SELECT * FROM (${projected}) AS segment_members WHERE ${cursorClause(pagination.cursor)} ORDER BY lower("displayName"), "profileId" LIMIT ${pagination.limit + 1}`)));
    const hasNext = rows.length > pagination.limit;
    const items = rows.slice(0, pagination.limit).map(toMember);
    return {total, items, nextCursor: hasNext && items.length ? encodeCursor(items[items.length - 1]) : null};
  },

  async save(actor: AdminActor, input: SegmentSaveInput): Promise<SavedSegmentRecord> {
    requireAdmin(actor);
    const db = await getDb();
    return db.transaction(async (tx) => {
      const record = savedSegmentSchema.parse((await tx.insert(savedSegments).values({ownerProfileId: actor.profileId, nameEn: input.nameEn, nameZh: input.nameZh, filterVersion: 1, filters: input.filter}).returning())[0]);
      await tx.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind, action: "segment.saved", targetType: "saved_segment", targetId: record.id, metadata: {filterVersion: record.filterVersion}});
      return toSavedSegment(record);
    });
  },

  async list(actor: AdminActor): Promise<readonly SavedSegmentRecord[]> {
    requireAdmin(actor);
    const db = await getDb();
    const rows = await db.select().from(savedSegments).where(eq(savedSegments.ownerProfileId, actor.profileId)).orderBy(savedSegments.updatedAt);
    return rows.map((row) => toSavedSegment(savedSegmentSchema.parse(row)));
  },

  async get(actor: AdminActor, id: unknown): Promise<SavedSegmentRecord | null> {
    requireAdmin(actor);
    const db = await getDb();
    const parsedId = segmentIdSchema.parse(id);
    const row = (await db.select().from(savedSegments).where(and(eq(savedSegments.id, parsedId), eq(savedSegments.ownerProfileId, actor.profileId))).limit(1))[0];
    return row ? toSavedSegment(savedSegmentSchema.parse(row)) : null;
  },

  async auditExport(actor: Actor, id: unknown, filterVersion: number, rowCount: number): Promise<void> {
    requireAdmin(actor);
    const db = await getDb();
    await db.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind, action: "segment.exported", targetType: "saved_segment", targetId: segmentIdSchema.parse(id), metadata: {filterVersion, rowCount}});
  },
};
