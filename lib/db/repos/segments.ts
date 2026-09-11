import "server-only";

import {and, eq, sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import type {SegmentAudienceRow, SegmentPreview} from "@/lib/admin/segments";
import {SEGMENT_FILTER_VERSION, parseSegmentFilter, segmentIdSchema, type SegmentFilterSet, type SegmentPagination, type SegmentSaveInput} from "@/lib/admin/segment-schema";
import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, companies, companyMembers, contacts, engagementScores, eventGuestRegistrations, eventRegistrations, memberships, profiles, savedSegments} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const audienceKindSchema = z.enum(["member", "contact"]);
const segmentRowSchema = z.object({
  kind: audienceKindSchema, id: z.string(), displayName: z.string(), email: z.string().nullable(), companyName: z.string().nullable(),
  planCode: z.string().nullable(), membershipStatus: z.string().nullable(), renewalAt: z.coerce.date().nullable(), score: z.union([z.string(), z.number()]).nullable(),
  whatsappNumber: z.string().nullable(), whatsappOptIn: z.boolean(), contactStage: z.string().nullable(), contactSource: z.string().nullable(),
});
const countRowSchema = z.object({total: z.coerce.number()});
const savedSegmentSchema = z.object({
  id: z.string().uuid(), ownerProfileId: z.string(), nameEn: z.string(), nameZh: z.string().nullable(), filterVersion: z.number().int(), filters: z.record(z.unknown()), createdAt: z.coerce.date(), updatedAt: z.coerce.date(),
});

/**
 * S-10. The keyset cursor is `{sortKey, kind, id}`, not `{displayName, profileId}`:
 * the projection is a UNION ALL of two arms whose ids come from different tables,
 * so a member and a contact can collide on any single column. A legacy two-part
 * cursor fails this strict parse rather than paging through the wrong arm.
 */
const cursorPayloadSchema = z.object({sortKey: z.string(), kind: audienceKindSchema, id: z.string()}).strict();

type SegmentRow = z.infer<typeof segmentRowSchema>;
export type SavedSegmentRecord = Readonly<{id: string; ownerProfileId: string; nameEn: string; nameZh: string | null; filterVersion: number; filters: SegmentFilterSet; createdAt: string; updatedAt: string}>;

/**
 * The states that mean "this person is on the list for that event". `cancelled`
 * is deliberately excluded, so someone who registered and then cancelled is
 * `not_registered` again and can be invited back. `no_show` never appears in a
 * filter (S-10) but is an attendance fact, not a registration one, so it is not
 * in this list either: a no-show did register.
 */
const ATTENDING_EVENT_STATES = ["registered", "waitlist", "attended"] as const;

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

function toAudienceRow(row: SegmentRow): SegmentAudienceRow {
  return {...row, renewalAt: row.renewalAt?.toISOString() ?? null, score: numberOrNull(row.score)};
}

function textList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

/**
 * S-10. The outer parentheses are load-bearing. Until this task the cursor was
 * the sole `WHERE` term, so a bare `a > $1 OR (a = $1 AND b > $2)` was safe;
 * the audience query now composes it with nothing else, but the moment anyone
 * adds a second term an unparenthesised `OR` would make the whole filter
 * disjunctive and page the wrong people back into a campaign snapshot.
 */
export function segmentCursorClause(cursor: string | null): SQL {
  if (!cursor) return sql`TRUE`;
  const parsed = cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  return sql`(lower("displayName") > ${parsed.sortKey} OR (lower("displayName") = ${parsed.sortKey} AND ("kind", "id") > (${parsed.kind}, ${parsed.id})))`;
}

function encodeCursor(row: SegmentAudienceRow): string {
  return Buffer.from(JSON.stringify({sortKey: row.displayName.toLocaleLowerCase("en"), kind: row.kind, id: row.id}), "utf8").toString("base64url");
}

/**
 * C-6. Drizzle's `exists()` helper only parenthesises a `Subquery` object and
 * pastes a raw fragment in bare, and `EXISTS select_with_parens` is the whole
 * grammar Postgres accepts — so these two builders spell the keyword and its
 * parentheses themselves, and `tests/unit/repository-exists-scope-sql.test.ts`
 * renders both through the proxy driver to prove they balance.
 */
function memberEventPredicate(event: Readonly<{eventId: string; state: string}>): SQL {
  if (event.state === "not_registered") {
    return sql`NOT EXISTS (SELECT 1 FROM ${eventRegistrations} WHERE ${eventRegistrations.eventId} = ${event.eventId}::uuid AND ${eventRegistrations.profileId} = ${profiles.id} AND ${eventRegistrations.status} IN (${textList(ATTENDING_EVENT_STATES)}))`;
  }
  return sql`EXISTS (SELECT 1 FROM ${eventRegistrations} WHERE ${eventRegistrations.eventId} = ${event.eventId}::uuid AND ${eventRegistrations.profileId} = ${profiles.id} AND ${eventRegistrations.status} = ${event.state})`;
}

function contactEventPredicate(event: Readonly<{eventId: string; state: string}>): SQL {
  if (event.state === "not_registered") {
    return sql`NOT EXISTS (SELECT 1 FROM ${eventGuestRegistrations} WHERE ${eventGuestRegistrations.eventId} = ${event.eventId}::uuid AND ${eventGuestRegistrations.contactId} = ${contacts.id} AND ${eventGuestRegistrations.status} IN (${textList(ATTENDING_EVENT_STATES)}))`;
  }
  return sql`EXISTS (SELECT 1 FROM ${eventGuestRegistrations} WHERE ${eventGuestRegistrations.eventId} = ${event.eventId}::uuid AND ${eventGuestRegistrations.contactId} = ${contacts.id} AND ${eventGuestRegistrations.status} = ${event.state})`;
}

/**
 * The member arm of the audience. `now` is the caller's one snapshot of the
 * clock: `renewalWithinDays` and `lastLoginBeforeDays` used to call `new Date()`
 * here, and `preview` builds the projection once but executes it twice, so the
 * count and the page were computed against two different windows and a paged
 * CSV export drifted as the window slid.
 */
export function memberPredicates(filter: SegmentFilterSet, now: Date): SQL {
  const terms: SQL[] = [];
  if (filter.profileIds.length) terms.push(sql`${profiles.id} IN (${textList(filter.profileIds)})`);
  if (filter.tier.length) terms.push(sql`${memberships.planCode} IN (${textList(filter.tier)})`);
  if (filter.status.length) terms.push(sql`${memberships.status} IN (${textList(filter.status)})`);
  if (filter.scoreMin !== null) terms.push(sql`${engagementScores.score} >= ${filter.scoreMin}`);
  if (filter.scoreMax !== null) terms.push(sql`${engagementScores.score} <= ${filter.scoreMax}`);
  if (filter.renewalWithinDays !== null) {
    const renewalCutoff = new Date(now.getTime() + filter.renewalWithinDays * 86_400_000);
    terms.push(sql`${memberships.billingPeriodEnd} >= ${now} AND ${memberships.billingPeriodEnd} <= ${renewalCutoff}`);
  }
  if (filter.sector) terms.push(sql`${companies.industry} ILIKE ${`%${filter.sector}%`}`);
  if (filter.lastLoginBeforeDays !== null) {
    terms.push(sql`${profiles.lastLoginAt} <= ${new Date(now.getTime() - filter.lastLoginBeforeDays * 86_400_000)}`);
  }
  if (filter.whatsappOptIn !== null) terms.push(sql`${profiles.whatsappOptIn} = ${filter.whatsappOptIn}`);
  // `industryTags` and `sector` are two different columns with two different
  // semantics and are labelled distinctly in the bundles for that reason:
  // `sector` is a substring match on free-text `companies.industry`, this is
  // exact containment over the closed 24-slug vocabulary in
  // config/industry-tags.ts. `@>` means "carries all of these", so selecting
  // two tags narrows the audience rather than widening it.
  if (filter.industryTags.length) terms.push(sql`${companies.tags} @> ARRAY[${textList(filter.industryTags)}]::text[]`);
  // What makes `companyPlan` different from `tier`: the membership has to be
  // held by a company, not by the person. Without the second arm this filter
  // would be an alias for `tier` and the control would be a lie.
  if (filter.companyPlan.length) terms.push(sql`${memberships.planCode} IN (${textList(filter.companyPlan)}) AND ${memberships.companyId} IS NOT NULL`);
  if (filter.event) terms.push(memberEventPredicate(filter.event));
  return terms.length ? and(...terms)! : sql`TRUE`;
}

/**
 * The contact arm. A prospect has no membership, no engagement score and no
 * login, so a filter that asks for one of those cannot be satisfied by any
 * contact. Ignoring those terms here — the tempting reading of "audience:
 * both" — would return EVERY prospect for a segment that asked for corporate
 * members whose renewal is inside 30 days, and Task 8 would snapshot them onto
 * `campaign_recipients`. Matching nothing is the only honest answer.
 */
export function contactPredicates(filter: SegmentFilterSet): SQL {
  const membershipShaped = filter.tier.length > 0
    || filter.status.length > 0
    || filter.scoreMin !== null
    || filter.scoreMax !== null
    || filter.renewalWithinDays !== null
    || filter.lastLoginBeforeDays !== null
    || filter.companyPlan.length > 0;
  if (membershipShaped) return sql`FALSE`;

  const terms: SQL[] = [];
  // `profileIds` names members, and a contact answers to it only through the
  // link C-4 writes, so the exact-identity filter stays exact on both arms.
  if (filter.profileIds.length) terms.push(sql`${contacts.profileId} IN (${textList(filter.profileIds)})`);
  // Company attributes travel through the contact's own company link, so a
  // sector or tag filter narrows prospects the same way it narrows members
  // rather than being silently dropped.
  if (filter.sector) terms.push(sql`${companies.industry} ILIKE ${`%${filter.sector}%`}`);
  if (filter.industryTags.length) terms.push(sql`${companies.tags} @> ARRAY[${textList(filter.industryTags)}]::text[]`);
  if (filter.contactStage.length) terms.push(sql`${contacts.stage} IN (${textList(filter.contactStage)})`);
  if (filter.contactSource.length) terms.push(sql`${contacts.source} IN (${textList(filter.contactSource)})`);
  if (filter.whatsappOptIn !== null) terms.push(sql`${contacts.whatsappOptIn} = ${filter.whatsappOptIn}`);
  if (filter.event) terms.push(contactEventPredicate(filter.event));
  return terms.length ? and(...terms)! : sql`TRUE`;
}

function memberArm(filter: SegmentFilterSet, now: Date): SQL {
  return sql`
    SELECT 'member'::text AS "kind", candidate.profile_id AS "id", candidate.display_name AS "displayName", candidate.email AS "email",
      candidate.company_name AS "companyName", candidate.plan_code AS "planCode", candidate.membership_status AS "membershipStatus",
      candidate.renewal_at AS "renewalAt", candidate.score AS "score", candidate.whatsapp_number AS "whatsappNumber",
      candidate.whatsapp_opt_in AS "whatsappOptIn", NULL::text AS "contactStage", NULL::text AS "contactSource"
    FROM (
      SELECT ${profiles.id} AS profile_id, ${profiles.displayName} AS display_name, ${profiles.email} AS email,
        ${companies.displayName} AS company_name, ${memberships.planCode}::text AS plan_code, ${memberships.status}::text AS membership_status,
        ${memberships.billingPeriodEnd} AS renewal_at, ${engagementScores.score} AS score,
        ${profiles.whatsappNumber} AS whatsapp_number, ${profiles.whatsappOptIn} AS whatsapp_opt_in,
        ROW_NUMBER() OVER (PARTITION BY ${profiles.id} ORDER BY ${memberships.billingPeriodEnd} ASC NULLS LAST, ${memberships.id} NULLS LAST, ${companies.id} NULLS LAST) AS row_rank
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      LEFT JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
      WHERE ${memberPredicates(filter, now)}
    ) AS candidate
    WHERE candidate.row_rank = 1
  `;
}

function contactArm(filter: SegmentFilterSet): SQL {
  // Every member-only column is cast explicitly: a UNION ALL resolves its
  // column types from the first arm, and an untyped NULL beside an enum or a
  // numeric is a planner error rather than a null.
  return sql`
    SELECT 'contact'::text AS "kind", ${contacts.id}::text AS "id",
      COALESCE(${contacts.displayName}, ${contacts.email}, ${contacts.phoneE164}, ${contacts.whatsappMemberId}, '') AS "displayName",
      ${contacts.email} AS "email", ${companies.displayName} AS "companyName",
      NULL::text AS "planCode", NULL::text AS "membershipStatus", NULL::timestamptz AS "renewalAt", NULL::numeric AS "score",
      ${contacts.phoneE164} AS "whatsappNumber", ${contacts.whatsappOptIn} AS "whatsappOptIn",
      ${contacts.stage}::text AS "contactStage", ${contacts.source}::text AS "contactSource"
    FROM ${contacts}
    LEFT JOIN ${companies} ON ${companies.id} = ${contacts.companyId}
    WHERE ${contactPredicates(filter)}
  `;
}

/**
 * S-10. One arm per audience, unioned rather than joined: a member row and a
 * contact row share no key, and `filter.audience` decides which arms exist at
 * all — asking for contacts must not leave a member arm in the statement whose
 * predicates happened to collapse to TRUE.
 */
export function projectedAudience(filter: SegmentFilterSet, now: Date): SQL {
  const arms: SQL[] = [];
  if (filter.audience !== "contacts") arms.push(memberArm(filter, now));
  if (filter.audience !== "members") arms.push(contactArm(filter));
  return sql.join(arms, sql` UNION ALL `);
}

// Every row of the /admin/segments list and every `get` lands here, so this one
// call is the dispatch point for the whole list page. It reads the row's own
// `filter_version` rather than assuming the current one (S-9).
function toSavedSegment(record: z.infer<typeof savedSegmentSchema>): SavedSegmentRecord {
  return {...record, filters: parseSegmentFilter(record.filterVersion, record.filters), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString()};
}

export const segmentsRepository = {
  /**
   * `now` defaults to this call's clock but the CSV export passes its own, so
   * every page of one export is computed against the same relative window.
   */
  async preview(actor: AdminActor, filter: SegmentFilterSet, pagination: SegmentPagination, now: Date = new Date()): Promise<SegmentPreview> {
    requireAdmin(actor);
    const db = await getDb();
    const projected = projectedAudience(filter, now);
    const total = countRowSchema.parse(resultRows(await db.execute(sql`SELECT count(*) AS total FROM (${projected}) AS segment_audience`))[0]).total;
    // The ORDER BY is the cursor predicate's other half; the two must name the
    // same three columns in the same order or paging skips rows.
    const rows = z.array(segmentRowSchema).parse(resultRows(await db.execute(sql`SELECT * FROM (${projected}) AS segment_audience WHERE ${segmentCursorClause(pagination.cursor)} ORDER BY lower("displayName"), "kind", "id" LIMIT ${pagination.limit + 1}`)));
    const hasNext = rows.length > pagination.limit;
    const items = rows.slice(0, pagination.limit).map(toAudienceRow);
    return {total, items, nextCursor: hasNext && items.length ? encodeCursor(items[items.length - 1]) : null};
  },

  async save(actor: AdminActor, input: SegmentSaveInput): Promise<SavedSegmentRecord> {
    requireAdmin(actor);
    const db = await getDb();
    return db.transaction(async (tx) => {
      // The hidden `filters` input the save form posts is whatever
      // `parseSegmentRouteQuery` produced, which carries the six v2 keys from the
      // moment the dispatcher lands. Writing `1` beside a v2 payload makes the row
      // unreadable the instant `toSavedSegment` runs its frozen, strict v1 parse —
      // so the version stamp follows the schema in the same commit (S-9).
      const record = savedSegmentSchema.parse((await tx.insert(savedSegments).values({ownerProfileId: actor.profileId, nameEn: input.nameEn, nameZh: input.nameZh, filterVersion: SEGMENT_FILTER_VERSION, filters: input.filter}).returning())[0]);
      await tx.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind, action: "segment.saved", targetType: "saved_segment", targetId: record.id, metadata: {filterVersion: record.filterVersion, audience: input.filter.audience}});
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
