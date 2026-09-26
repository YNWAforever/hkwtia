import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";
import {alias} from "drizzle-orm/pg-core";

import type {Member360, MemberPurchaseItem} from "@/lib/admin/member-360";
import {membershipSummaryOrder, membershipSummaryOrderSql} from "@/lib/admin/membership-summary";

import {decodeAdminMemberCursor, encodeAdminMemberCursor, type AdminMemberListItem, type AdminMemberPage, type AdminMemberQuery} from "@/lib/admin/member-types";
import {requireAdmin} from "@/lib/auth/authorize";
import {companies, companyMembers, emailLog, engagementEvents, engagementScores, eventRegistrations, events, eventOrders, eventOrderSeats, journeyState, memberNotes, memberships, messageSuppressions, profiles, whatsappLog} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

const memberRowSchema = z.object({
  profileId: z.string(), membershipId: z.string().nullable().default(null), companyId: z.string().nullable().default(null), displayName: z.string(), email: z.string().nullable(), companyName: z.string().nullable(),
  planCode: z.string().nullable(), membershipStatus: z.string().nullable(), renewalAt: z.coerce.date().nullable(),
  score: z.union([z.string(), z.number()]).nullable(),
});

type MemberRow = z.infer<typeof memberRowSchema>;

const member360ProfileSchema = z.object({id: z.string(), displayName: z.string(), email: z.string().nullable(), phone: z.string().nullable(), role: z.string()});
const member360CompanySchema = z.object({id: z.string(), name: z.string(), role: z.string()});
const member360MembershipSchema = z.object({id: z.string(), companyId: z.string().nullable().default(null), planCode: z.string(), status: z.string(), renewalAt: z.coerce.date().nullable(), stripeCustomerId: z.string().nullable(), stripeSubscriptionId: z.string().nullable()});
const member360ScoreSchema = z.object({score: z.union([z.string(), z.number()]).nullable(), trend: z.union([z.string(), z.number()]).nullable()});
const member360EngagementEventSchema = z.object({id: z.string(), type: z.string(), points: z.number(), occurredAt: z.coerce.date()});
const member360EmailSchema = z.object({id: z.string(), template: z.string(), subject: z.string(), status: z.string(), createdAt: z.coerce.date()});
const member360RegistrationSchema = z.object({eventId: z.string(), title: z.string(), startsAt: z.coerce.date(), status: z.string(), checkedInAt: z.coerce.date().nullable()});
const member360PurchaseSchema = z.object({id: z.string(), eventId: z.string(), titleEn: z.string(), titleZh: z.string().nullable(), status: z.string(), amountHkdCents: z.number(), paidAt: z.coerce.date().nullable(), refundedAt: z.coerce.date().nullable(), refundReason: z.string().nullable(), createdAt: z.coerce.date()});
const member360SeatSchema = z.object({id: z.string(), orderId: z.string(), attendeeName: z.string(), checkedInAt: z.coerce.date().nullable()});
const member360NoteSchema = z.object({id: z.string(), authorProfileId: z.string(), authorName: z.string().nullable(), body: z.string(), replacesNoteId: z.string().nullable(), createdAt: z.coerce.date()});
const noteAuthors = alias(profiles, "note_authors");
const membershipCompanies = alias(companies, "membership_companies");
const member360JourneySchema = z.object({id: z.string(), journey: z.string(), step: z.string(), status: z.string(), scheduledAt: z.coerce.date(), attemptCount: z.coerce.number().int().nonnegative(), errorCode: z.string().nullable()});
const member360WhatsappSchema = z.object({id: z.string(), template: z.string(), status: z.string(), locale: z.string(), classification: z.string(), attemptCount: z.coerce.number().int().nonnegative(), errorCode: z.string().nullable(), createdAt: z.coerce.date()});
const member360SuppressionSchema = z.object({id: z.string(), channel: z.string(), classification: z.string(), reasonCode: z.string().nullable(), createdAt: z.coerce.date()});

export const MEMBER_360_AUTOMATION_HISTORY_LIMIT = 25;
export const MEMBER_360_TICKET_HISTORY_LIMIT = 25;

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

function toItem(row: MemberRow): AdminMemberListItem {
  const numericScore = row.score === null ? null : Number(row.score);
  return {profileId: row.profileId, membershipId: row.membershipId, companyId: row.companyId, displayName: row.displayName, email: row.email, companyName: row.companyName, planCode: row.planCode, membershipStatus: row.membershipStatus, renewalAt: row.renewalAt?.toISOString() ?? null, score: numericScore !== null && Number.isFinite(numericScore) ? numericScore : null};
}

/**
 * Projects one representative row per profile before outer pagination. Matching profiles are chosen
 * across every active company membership first; representatives prefer membership status (active,
 * past due, ending, pending, terminal), then membership ID and company ID for stable tie-breaking.
 */
function memberSearchStatement(query: AdminMemberQuery) {
  const cursor = decodeAdminMemberCursor(query.cursor);
  const pattern = `%${query.search}%`;
  const matches = query.search
    ? sql`${profiles.displayName} ILIKE ${pattern} OR ${profiles.email} ILIKE ${pattern} OR ${companies.displayName} ILIKE ${pattern}`
    : sql`TRUE`;
  const afterCursor = cursor
    ? sql`lower("displayName") > ${cursor.displayName} OR (lower("displayName") = ${cursor.displayName} AND "profileId" > ${cursor.profileId})`
    : sql`TRUE`;

  return sql`
    WITH matching_profiles AS (
      SELECT DISTINCT ${profiles.id} AS profile_id
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      WHERE ${matches}
    ), candidate_rows AS (
      SELECT ${profiles.id} AS profile_id, ${profiles.displayName} AS display_name, ${profiles.email} AS email,
        ${membershipCompanies.displayName} AS company_name, ${memberships.companyId} AS company_id, ${memberships.id} AS membership_id,
        ${memberships.planCode} AS plan_code, ${memberships.status} AS membership_status,
        ${memberships.billingPeriodEnd} AS renewal_at, ${engagementScores.score} AS score,
        ROW_NUMBER() OVER (PARTITION BY ${profiles.id} ORDER BY
          ${membershipSummaryOrderSql(sql`${memberships.status}`)},
          ${memberships.id} NULLS LAST, ${memberships.companyId} NULLS LAST
        ) AS row_rank
      FROM ${profiles}
      INNER JOIN matching_profiles ON matching_profiles.profile_id = ${profiles.id}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      LEFT JOIN ${membershipCompanies} ON ${membershipCompanies.id} = ${memberships.companyId}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
    ), projected_members AS (
      SELECT profile_id AS "profileId", membership_id AS "membershipId", company_id AS "companyId",
        display_name AS "displayName", email, company_name AS "companyName", plan_code AS "planCode",
        membership_status AS "membershipStatus", renewal_at AS "renewalAt", score
      FROM candidate_rows WHERE row_rank = 1
    )
    SELECT * FROM projected_members
    WHERE ${afterCursor}
    ORDER BY lower("displayName"), "profileId"
    LIMIT ${query.limit + 1}
  `;
}

/** Staff-only ticket purchases. Guest email similarity never supplies ownership. */
export async function readMemberPurchases(
  actor: Actor,
  profileId: string,
  database?: Awaited<ReturnType<typeof getDb>>,
): Promise<readonly MemberPurchaseItem[]> {
  requireAdmin(actor);
  const db = database ?? await getDb();
  // Only the persisted buyer profile joins an order to this member. An unknown guest order
    // must not be merged by a mutable or unverified buyer/attendee email.
  const orders = z.array(member360PurchaseSchema).parse(resultRows(await db.execute(sql`SELECT ${eventOrders.id} AS id, ${eventOrders.eventId} AS "eventId", ${events.titleEn} AS "titleEn", ${events.titleZh} AS "titleZh", ${eventOrders.status} AS status, ${eventOrders.amountHkdCents} AS "amountHkdCents", ${eventOrders.paidAt} AS "paidAt", ${eventOrders.refundedAt} AS "refundedAt", ${eventOrders.refundReason} AS "refundReason", ${eventOrders.createdAt} AS "createdAt" FROM ${eventOrders} INNER JOIN ${events} ON ${events.id} = ${eventOrders.eventId} WHERE ${eventOrders.buyerProfileId} = ${profileId} ORDER BY ${eventOrders.createdAt} DESC, ${eventOrders.id} DESC LIMIT ${MEMBER_360_TICKET_HISTORY_LIMIT}`)));
  const seats = orders.length ? z.array(member360SeatSchema).parse(resultRows(await db.execute(sql`SELECT ${eventOrderSeats.id} AS id, ${eventOrderSeats.orderId} AS "orderId", ${eventOrderSeats.attendeeName} AS "attendeeName", ${eventOrderSeats.checkedInAt} AS "checkedInAt" FROM ${eventOrderSeats} WHERE ${inArray(eventOrderSeats.orderId, orders.map((order) => order.id))} ORDER BY ${eventOrderSeats.orderId}, ${eventOrderSeats.position}`))) : [];
  const seatsByOrder = new Map<string, typeof seats>();
  for (const seat of seats) seatsByOrder.set(seat.orderId, [...(seatsByOrder.get(seat.orderId) ?? []), seat]);
  return orders.map((order) => ({...order, createdAt: order.createdAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null, refundedAt: order.refundedAt?.toISOString() ?? null, seats: (seatsByOrder.get(order.id) ?? []).map((seat) => ({id: seat.id, attendeeName: seat.attendeeName, checkedInAt: seat.checkedInAt?.toISOString() ?? null}))}));
}

export const adminMembersRepository = {
  async get360(actor: Extract<Actor, {kind: "staff" | "exco" | "superadmin"}>, profileId: string): Promise<Member360 | null> {
    requireAdmin(actor);
    const db = await getDb();
    const profile = z.array(member360ProfileSchema).parse(resultRows(await db.execute(sql`SELECT ${profiles.id} AS id, ${profiles.displayName} AS "displayName", ${profiles.email} AS email, ${profiles.phone} AS phone, ${profiles.role} AS role FROM ${profiles} WHERE ${profiles.id} = ${profileId} LIMIT 1`)))[0];
    if (!profile) return null;
    const companiesForProfile = z.array(member360CompanySchema).parse(resultRows(await db.execute(sql`SELECT ${companies.id} AS id, ${companies.displayName} AS name, ${companyMembers.role} AS role FROM ${companyMembers} INNER JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId} WHERE ${companyMembers.userId} = ${profileId} AND ${companyMembers.revokedAt} IS NULL ORDER BY ${companies.displayName}`)));
    const allMemberships = z.array(member360MembershipSchema).parse(resultRows(await db.execute(sql`SELECT ${memberships.id} AS id, ${memberships.companyId} AS "companyId", ${memberships.planCode} AS "planCode", ${memberships.status} AS status, ${memberships.billingPeriodEnd} AS "renewalAt", ${memberships.stripeCustomerId} AS "stripeCustomerId", ${memberships.stripeSubscriptionId} AS "stripeSubscriptionId" FROM ${memberships} WHERE ${memberships.ownerUserId} = ${profileId} OR ${memberships.companyId} IN (SELECT ${companyMembers.companyId} FROM ${companyMembers} WHERE ${companyMembers.userId} = ${profileId} AND ${companyMembers.revokedAt} IS NULL) ORDER BY ${membershipSummaryOrderSql(sql`${memberships.status}`)}, ${memberships.id}, ${memberships.companyId} NULLS LAST`))).sort(membershipSummaryOrder);
    const membership = allMemberships[0] ?? null;
    const score = z.array(member360ScoreSchema).parse(resultRows(await db.execute(sql`SELECT ${engagementScores.score} AS score, ${engagementScores.trend} AS trend FROM ${engagementScores} WHERE ${engagementScores.profileId} = ${profileId} LIMIT 1`)))[0] ?? {score: null, trend: null};
    const engagement = z.array(member360EngagementEventSchema).parse(resultRows(await db.execute(sql`SELECT ${engagementEvents.id} AS id, ${engagementEvents.type} AS type, ${engagementEvents.points} AS points, ${engagementEvents.occurredAt} AS "occurredAt" FROM ${engagementEvents} WHERE ${engagementEvents.profileId} = ${profileId} ORDER BY ${engagementEvents.occurredAt} DESC, ${engagementEvents.id} DESC`)));
    const emails = z.array(member360EmailSchema).parse(resultRows(await db.execute(sql`SELECT ${emailLog.id} AS id, ${emailLog.template} AS template, ${emailLog.subject} AS subject, ${emailLog.status} AS status, ${emailLog.createdAt} AS "createdAt" FROM ${emailLog} WHERE ${emailLog.profileId} = ${profileId} ORDER BY ${emailLog.createdAt} DESC, ${emailLog.id} DESC`)));
    const registrations = z.array(member360RegistrationSchema).parse(resultRows(await db.execute(sql`SELECT ${eventRegistrations.eventId} AS "eventId", ${events.titleEn} AS title, ${events.startsAt} AS "startsAt", ${eventRegistrations.status} AS status, ${eventRegistrations.checkedInAt} AS "checkedInAt" FROM ${eventRegistrations} INNER JOIN ${events} ON ${events.id} = ${eventRegistrations.eventId} WHERE ${eventRegistrations.profileId} = ${profileId} ORDER BY ${events.startsAt} DESC, ${eventRegistrations.eventId} DESC`)));
    const purchases = await readMemberPurchases(actor, profileId, db);
    const notes = z.array(member360NoteSchema).parse(resultRows(await db.execute(sql`SELECT ${memberNotes.id} AS id, ${memberNotes.authorProfileId} AS "authorProfileId", ${noteAuthors.displayName} AS "authorName", ${memberNotes.body} AS body, ${memberNotes.replacesNoteId} AS "replacesNoteId", ${memberNotes.createdAt} AS "createdAt" FROM ${memberNotes} LEFT JOIN ${noteAuthors} ON ${noteAuthors.id} = ${memberNotes.authorProfileId} WHERE ${memberNotes.profileId} = ${profileId} ORDER BY ${memberNotes.createdAt} DESC, ${memberNotes.id} DESC`)));
    const journeys = z.array(member360JourneySchema).parse(resultRows(await db.execute(sql`SELECT ${journeyState.id} AS id, ${journeyState.journey} AS journey, ${journeyState.step} AS step, ${journeyState.status} AS status, ${journeyState.scheduledAt} AS "scheduledAt", ${journeyState.attemptCount} AS "attemptCount", ${journeyState.errorCode} AS "errorCode" FROM ${journeyState} WHERE ${journeyState.profileId} = ${profileId} ORDER BY ${journeyState.scheduledAt} DESC, ${journeyState.id} DESC LIMIT ${MEMBER_360_AUTOMATION_HISTORY_LIMIT}`)));
    const whatsapp = z.array(member360WhatsappSchema).parse(resultRows(await db.execute(sql`SELECT ${whatsappLog.id} AS id, ${whatsappLog.template} AS template, ${whatsappLog.status} AS status, ${whatsappLog.locale} AS locale, ${whatsappLog.classification} AS classification, ${whatsappLog.attemptCount} AS "attemptCount", ${whatsappLog.errorCode} AS "errorCode", ${whatsappLog.createdAt} AS "createdAt" FROM ${whatsappLog} WHERE ${whatsappLog.profileId} = ${profileId} ORDER BY ${whatsappLog.createdAt} DESC, ${whatsappLog.id} DESC LIMIT ${MEMBER_360_AUTOMATION_HISTORY_LIMIT}`)));
    const suppressions = z.array(member360SuppressionSchema).parse(resultRows(await db.execute(sql`SELECT ${messageSuppressions.id} AS id, ${messageSuppressions.channel} AS channel, ${messageSuppressions.classification} AS classification, ${messageSuppressions.reasonCode} AS "reasonCode", ${messageSuppressions.createdAt} AS "createdAt" FROM ${messageSuppressions} WHERE ${messageSuppressions.profileId} = ${profileId} ORDER BY ${messageSuppressions.createdAt} DESC, ${messageSuppressions.id} DESC LIMIT ${MEMBER_360_AUTOMATION_HISTORY_LIMIT}`)));
    return {
      profile,
      companies: companiesForProfile,
      membership: membership ? {...membership, renewalAt: membership.renewalAt?.toISOString() ?? null} : null,
      memberships: allMemberships.map((item) => ({...item, renewalAt: item.renewalAt?.toISOString() ?? null})),
      engagement: {score: numberOrNull(score.score), trend: numberOrNull(score.trend), events: engagement.map((event) => ({...event, occurredAt: event.occurredAt.toISOString()}))},
      emails: emails.map((email) => ({...email, createdAt: email.createdAt.toISOString()})),
      events: registrations.map((registration) => ({...registration, startsAt: registration.startsAt.toISOString(), checkedInAt: registration.checkedInAt?.toISOString() ?? null})),
      purchases,
      notes: notes.map((note) => ({...note, createdAt: note.createdAt.toISOString()})),
      journeys: journeys.map((journey) => ({...journey, scheduledAt: journey.scheduledAt.toISOString()})),
      whatsapp: whatsapp.map((delivery) => ({...delivery, createdAt: delivery.createdAt.toISOString()})),
      suppressions: suppressions.map((suppression) => ({...suppression, createdAt: suppression.createdAt.toISOString()})),
    };
  },

  async search(actor: Actor, query: AdminMemberQuery): Promise<AdminMemberPage> {
    requireAdmin(actor);
    const db = await getDb();
    const result = await db.execute(memberSearchStatement(query));
    const rows = z.array(memberRowSchema).parse(Array.isArray(result) ? result : result.rows);
    const hasNextPage = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(toItem);
    return {items, nextCursor: hasNextPage && items.length > 0 ? encodeAdminMemberCursor(items[items.length - 1]) : null};
  },
};
