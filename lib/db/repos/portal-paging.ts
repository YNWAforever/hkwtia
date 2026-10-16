import "server-only";
import {createHash} from "node:crypto";
import {and, eq, inArray, notInArray, sql} from "drizzle-orm";
import {z} from "zod";
import {AUDIT_DEMO_EVENT_SLUGS} from "@/config/demo-events";
import {getDb} from "@/lib/db/repos/common";
import {memberBenefitScopeSql} from "@/lib/db/repos/member-benefit-sql";
import {companies, companyMembers, events, profiles} from "@/lib/db/server-schema";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

export type DirectoryQuery = string | Readonly<{search?: string; industry?: string; sizeBand?: string; limit?: number; excludeSelf?: boolean}>;
const directoryRow = z.object({userId: z.string(), displayName: z.string(), jobTitle: z.string().nullable(),
  companyId: z.string().nullable(), companyDisplayName: z.string().nullable(), industry: z.string().nullable(), sizeBand: z.string().nullable()});
export type DirectoryRecord = z.infer<typeof directoryRow>;
export type DirectoryPage = Readonly<{items: readonly DirectoryRecord[]; nextCursor: string | null; cursorReset?: boolean}>;
export type PageInput = Readonly<{cursor?: string | null; limit?: number}>;

export function portalPageLimit(limit?: number): number {
  return Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit!))) : 20;
}
export function normalizeDirectoryQuery(query?: DirectoryQuery | null) {
  const input = typeof query === "string" ? {search: query} : query;
  return {text: (input?.search ?? "").trim().slice(0, 120), industry: (input?.industry ?? "").trim().slice(0, 120),
    sizeBand: (input?.sizeBand ?? "").trim().slice(0, 120), limit: portalPageLimit(input?.limit), excludeSelf: input?.excludeSelf === true};
}
function scopeFor(profileId: string, filters: readonly string[]) {
  return createHash("sha256").update(JSON.stringify([profileId, ...filters])).digest("hex");
}
function encode(value: unknown) {return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");}
function decode<T>(value: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));} catch {return null;}
}
const directoryCursor = z.object({v: z.literal(2), scope: z.string(), name: z.string().max(500), userId: z.string().max(128), companyId: z.string().max(128)}).strict();

/** Current viewer entitlement and both consent stores are evaluated in the same SQL snapshot. */
export async function listDirectoryPage(actor: Actor, query?: DirectoryQuery | null, cursor?: string | null): Promise<DirectoryPage> {
  requireMember(actor);
  const filters = normalizeDirectoryQuery(query);
  const scope = scopeFor(actor.profileId, [filters.text, filters.industry, filters.sizeBand, ...(filters.excludeSelf ? ["exclude-self"] : [])]);
  const parsed = decode(cursor, directoryCursor);
  const after = parsed?.scope === scope ? parsed : null;
  const name = sql`lower(${profiles.displayName}) COLLATE "C"`;
  const userId = sql`${profiles.id}::text COLLATE "C"`;
  const companyId = sql`coalesce(${companyMembers.companyId}::text, '') COLLATE "C"`;
  const eligibleTarget = memberBenefitScopeSql(profiles.id);
  // position treats % and _ literally; lower() is applied by the same database on both operands.
  const contains = (field: ReturnType<typeof sql>, value: string) => sql`position(lower(${value}) in lower(coalesce(${field}, ''))) > 0`;
  const search = filters.text ? sql`(${sql.join([profiles.displayName, profiles.jobTitle, companies.displayName, companies.industry, companies.sizeBand]
    .map((field) => contains(sql`${field}`, filters.text)), sql` OR `)})` : sql`TRUE`;
  const db = await getDb();
  const result = await db.execute(sql`
    SELECT ${profiles.id} AS "userId", ${profiles.displayName} AS "displayName", ${profiles.jobTitle} AS "jobTitle",
      ${companyMembers.companyId} AS "companyId", ${companies.displayName} AS "companyDisplayName",
      ${companies.industry} AS industry, ${companies.sizeBand} AS "sizeBand", ${name} AS "sortName"
    FROM ${profiles}
    LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
    LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
    WHERE ${memberBenefitScopeSql(actor.profileId)} AND ${eligibleTarget}
      AND ${filters.excludeSelf ? sql`${profiles.id} <> ${actor.profileId}` : sql`TRUE`}
      AND ${profiles.directoryVisible} = TRUE
      AND (${companyMembers.id} IS NULL OR ${companies.directoryVisible} = TRUE)
      AND ${search}
      AND ${filters.industry ? contains(sql`${companies.industry}`, filters.industry) : sql`TRUE`}
      AND ${filters.sizeBand ? contains(sql`${companies.sizeBand}`, filters.sizeBand) : sql`TRUE`}
      AND ${after ? sql`(${name}, ${userId}, ${companyId}) > (${after.name} COLLATE "C", ${after.userId} COLLATE "C", ${after.companyId} COLLATE "C")` : sql`TRUE`}
    ORDER BY ${name}, ${userId}, ${companyId}
    LIMIT ${filters.limit + 1}
  `);
  const rows = z.array(directoryRow.extend({sortName: z.string()})).parse(result.rows);
  const items = rows.slice(0, filters.limit).map((row) => directoryRow.parse(row));
  const last = rows[filters.limit - 1];
  return {items, nextCursor: rows.length > filters.limit && last
    ? encode({v: 2, scope, name: last.sortName, userId: last.userId, companyId: last.companyId ?? ""}) : null,
    ...(cursor && !after ? {cursorReset: true} : {})};
}

const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/).refine((s) => Number.isFinite(Date.parse(s)));
const eventCursor = z.object({v: z.literal(1), scope: z.string(), startsAt: timestamp, id: z.string().uuid()}).strict();
const eventRow = z.object({id: z.string().uuid(), slug: z.string(), titleEn: z.string(), titleZh: z.string().nullable(),
  descriptionEn: z.string(), descriptionZh: z.string().nullable(), startsAt: timestamp, endsAt: timestamp.nullable(),
  venue: z.string().nullable(), capacity: z.number().nullable(), memberOnly: z.boolean(), published: z.boolean(),
  registrationMode: z.enum(["rsvp", "external", "ticketed"]), visibility: z.enum(["public", "members_only"]), externalRegistrationUrl: z.string().nullable()});
export type MemberEventRow = z.infer<typeof eventRow>;
export type MemberEventPage = Readonly<{items: readonly MemberEventRow[]; nextCursor: string | null; cursorReset?: boolean}>;

export function memberUpcomingPredicate(profileId: string) {
  return and(eq(events.status, "published"), eq(events.published, true), inArray(events.visibility, ["public", "members_only"]),
    notInArray(events.slug, [...AUDIT_DEMO_EVENT_SLUGS]), sql`${events.startsAt} >= now()`, memberBenefitScopeSql(profileId));
}

export async function listMemberEventPage(actor: Actor, input: PageInput = {}): Promise<MemberEventPage> {
  requireMember(actor);
  const limit = portalPageLimit(input.limit);
  const scope = scopeFor(actor.profileId, ["upcoming"]);
  const parsed = decode(input.cursor, eventCursor);
  const after = parsed?.scope === scope ? parsed : null;
  const db = await getDb();
  const result = await db.execute(sql`
    SELECT ${events.id} AS id, ${events.slug} AS slug, ${events.titleEn} AS "titleEn", ${events.titleZh} AS "titleZh",
      ${events.descriptionEn} AS "descriptionEn", ${events.descriptionZh} AS "descriptionZh",
      to_char(${events.startsAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startsAt",
      to_char(${events.endsAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "endsAt",
      ${events.venue} AS venue, ${events.capacity} AS capacity, ${events.memberOnly} AS "memberOnly", ${events.published} AS published,
      ${events.registrationMode} AS "registrationMode", ${events.visibility} AS visibility, ${events.externalRegistrationUrl} AS "externalRegistrationUrl"
    FROM ${events}
    WHERE ${memberUpcomingPredicate(actor.profileId)}
      AND ${after ? sql`(${events.startsAt}, ${events.id}) > (${after.startsAt}::timestamptz, ${after.id}::uuid)` : sql`TRUE`}
    ORDER BY ${events.startsAt}, ${events.id}
    LIMIT ${limit + 1}
  `);
  const rows = z.array(eventRow).parse(result.rows);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {items, nextCursor: rows.length > limit && last ? encode({v: 1, scope, startsAt: last.startsAt, id: last.id}) : null,
    ...(input.cursor && !after ? {cursorReset: true} : {})};
}
