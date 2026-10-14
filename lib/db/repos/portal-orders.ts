import "server-only";
import {and, eq} from "drizzle-orm";
import {z} from "zod";
import {getDb} from "@/lib/db/repos/common";
import {eventOrders, events} from "@/lib/db/server-schema";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

/** Historical access follows the recorded buyer, independently of current paid benefits. */
export async function readOwnEventOrder(actor: Actor, orderId: string) {
  requireMember(actor);
  if (!z.string().uuid().safeParse(orderId).success) return null;
  const db = await getDb();
  const rows = await db.select({
    id: eventOrders.id, buyerProfileId: eventOrders.buyerProfileId, eventId: eventOrders.eventId,
    titleEn: events.titleEn, titleZh: events.titleZh, startsAt: events.startsAt,
    status: eventOrders.status, amountHkdCents: eventOrders.amountHkdCents, currency: eventOrders.currency,
    paidAt: eventOrders.paidAt, refundedAt: eventOrders.refundedAt,
  }).from(eventOrders).innerJoin(events, eq(events.id, eventOrders.eventId))
    .where(and(eq(eventOrders.id, orderId), eq(eventOrders.buyerProfileId, actor.profileId))).limit(1);
  return rows[0] ?? null;
}
export type OwnEventOrder = NonNullable<Awaited<ReturnType<typeof readOwnEventOrder>>>;
