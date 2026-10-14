import "server-only";
import {readOwnEventOrder} from "@/lib/db/repos/portal-orders";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

export async function getMyOrder(actor: Actor, orderId: string, read = readOwnEventOrder) {
  requireMember(actor);
  const order = await read(actor, orderId);
  if (!order || order.buyerProfileId !== actor.profileId) return null;
  return {id: order.id, eventId: order.eventId, titleEn: order.titleEn, titleZh: order.titleZh, startsAt: order.startsAt,
    status: order.status, amountHkdCents: order.amountHkdCents, currency: order.currency, paidAt: order.paidAt, refundedAt: order.refundedAt};
}
