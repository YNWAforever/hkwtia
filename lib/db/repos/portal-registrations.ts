import "server-only";
import {and, eq, inArray, sql} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/lib/db/repos/common";
import {eventOrders, eventRegistrations, events} from "@/lib/db/server-schema";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

export type RegistrationHistoryInput = Readonly<{cursor?: string | null; limit?: number}>;
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/).refine((s) => Number.isFinite(Date.parse(s)));
const cursorSchema = z.object({v: z.literal(1), startsAt: timestamp, source: z.enum(["rsvp", "ticket"]), id: z.string().uuid()}).strict();
const baseRow = z.object({id: z.string().uuid(), eventId: z.string().uuid(), titleEn: z.string(), titleZh: z.string().nullable(),
  startsAt: timestamp, eventStatus: z.string(), visibility: z.string()});
const rowSchema = z.discriminatedUnion("source", [
  baseRow.extend({source: z.literal("rsvp"), status: z.enum(["registered", "waitlist", "cancelled", "attended", "no_show"])}),
  baseRow.extend({source: z.literal("ticket"), status: z.enum(["pending", "paid", "expired", "failed", "refunded", "refund_failed", "refund_pending"])}),
]);
export type RegistrationHistoryRow = z.infer<typeof rowSchema>;
export type RegistrationHistoryPage = Readonly<{items: readonly RegistrationHistoryRow[]; nextCursor: string | null; cursorReset: boolean}>;

/** Historical minimal projection: RSVP profile or recorded buyer only, never attendee email. */
export async function listOwnRegistrationHistory(actor: Actor, input: RegistrationHistoryInput = {}): Promise<RegistrationHistoryPage> {
  requireMember(actor);
  const limit = Number.isFinite(input.limit) ? Math.min(50, Math.max(1, Math.trunc(input.limit!))) : 20;
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (input.cursor && input.cursor.length <= 512) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"))); } catch { /* Safe first page with visible reset notice. */ }
  }
  const after = cursor ? sql`WHERE (starts_at < ${cursor.startsAt}::timestamptz
    OR (starts_at = ${cursor.startsAt}::timestamptz AND (source COLLATE "C" > ${cursor.source}
      OR (source = ${cursor.source} AND id COLLATE "C" > ${cursor.id}))))` : sql``;
  const db = await getDb();
  const result = await db.execute(sql`WITH history AS (
    SELECT ${eventRegistrations.eventId}::text AS id, ${events.id} AS event_id, 'rsvp'::text AS source,
      ${eventRegistrations.status}::text AS status, ${events.titleEn} AS title_en, ${events.titleZh} AS title_zh,
      ${events.startsAt} AS starts_at, ${events.status}::text AS event_status, ${events.visibility}::text AS visibility
    FROM ${eventRegistrations} INNER JOIN ${events} ON ${events.id} = ${eventRegistrations.eventId}
    WHERE ${eventRegistrations.profileId} = ${actor.profileId}
    UNION ALL
    SELECT ${eventOrders.id}::text, ${events.id}, 'ticket'::text, ${eventOrders.status}::text,
      ${events.titleEn}, ${events.titleZh}, ${events.startsAt}, ${events.status}::text, ${events.visibility}::text
    FROM ${eventOrders} INNER JOIN ${events} ON ${events.id} = ${eventOrders.eventId}
    WHERE ${eventOrders.buyerProfileId} = ${actor.profileId}
  ) SELECT id, event_id AS "eventId", source, status, title_en AS "titleEn", title_zh AS "titleZh",
    to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startsAt",
    event_status AS "eventStatus", visibility
    FROM history ${after} ORDER BY starts_at DESC, source COLLATE "C" ASC, id COLLATE "C" ASC LIMIT ${limit + 1}`);
  const records: unknown = Array.isArray(result) ? result : result.rows;
  const rows = z.array(rowSchema).parse(records);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({v: 1, startsAt: last.startsAt, source: last.source, id: last.id})).toString("base64url") : null;
  return {items, nextCursor, cursorReset: Boolean(input.cursor && !cursor)};
}

/** Bound the IN list; callers read only events rendered on their current page. */
export async function readOwnRegistrationStatuses(actor: Actor, eventIds: readonly string[]) {
  requireMember(actor);
  const ids = z.array(z.string().uuid()).max(50).parse(eventIds);
  if (!ids.length) return [];
  const db = await getDb();
  return db.select({eventId: eventRegistrations.eventId, status: eventRegistrations.status}).from(eventRegistrations)
    .where(and(eq(eventRegistrations.profileId, actor.profileId), inArray(eventRegistrations.eventId, ids)));
}
