import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {auditEvents, eventOrderSeats, eventOrders, events, ticketEmailOutbox} from "@/lib/db/server-schema";

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
const seatRow = z.object({seatId: z.string().uuid(), orderId: z.string().uuid(), orderStatus: z.string(), eventStatus: z.string(), registrationMode: z.string(), startsAt: z.coerce.date(), checkedInAt: z.coerce.date().nullable(), deliveryPending: z.boolean()});
type SeatRow = z.infer<typeof seatRow>;
function eligible(row: SeatRow | undefined, now: Date): string | null {
  if (!row) return "SEAT_NOT_FOUND";
  if (row.orderStatus !== "paid") return "ORDER_NOT_PAID";
  if (row.eventStatus !== "published" || row.registrationMode !== "ticketed") return "EVENT_UNAVAILABLE";
  if (row.checkedInAt) return "SEAT_CHECKED_IN";
  if (row.startsAt.getTime() <= now.getTime()) return "EVENT_STARTED";
  if (row.deliveryPending) return "DELIVERY_RECONCILIATION_REQUIRED";
  return null;
}
async function selectSeat(tx: Parameters<BatchOperationHandler["prepare"]>[2], ids: readonly string[], ownKey: string | null = null): Promise<SeatRow[]> {
  if (!ids.length) return [];
  return z.array(seatRow).parse(rows(await tx.execute(sql`
    SELECT ${eventOrderSeats.id} AS "seatId", ${eventOrders.id} AS "orderId",
      ${eventOrders.status} AS "orderStatus", ${events.status} AS "eventStatus",
      ${events.registrationMode} AS "registrationMode", ${events.startsAt} AS "startsAt",
      ${eventOrderSeats.checkedInAt} AS "checkedInAt",
      EXISTS (SELECT 1 FROM ${ticketEmailOutbox} AS notice
        WHERE notice.seat_id = ${eventOrderSeats.id} AND notice.kind = 'pass'
          AND notice.status IN ('queued', 'sending', 'uncertain')
          AND (${ownKey}::text IS NULL OR notice.event_key <> ${ownKey}::text)) AS "deliveryPending"
    FROM ${eventOrderSeats}
    JOIN ${eventOrders} ON ${eventOrders.id} = ${eventOrderSeats.orderId}
    JOIN ${events} ON ${events.id} = ${eventOrders.eventId}
    WHERE ${inArray(eventOrderSeats.id, [...ids])}
  `)));
}

export const ticketResendBatchHandler: BatchOperationHandler = {
  async prepare(_actor, request, tx) {
    if (request.operation !== "ticket_resend") throw new Error("BATCH_OPERATION_MISMATCH");
    const found = new Map((await selectSeat(tx, [...new Set(request.targetSeatIds)])).map((row) => [row.seatId, row]));
    const seen = new Set<string>();
    const now = new Date();
    return request.targetSeatIds.map((id) => {
      const row = found.get(id);
      const reasonCode = seen.has(id) ? "DUPLICATE_TARGET" : eligible(row, now);
      seen.add(id);
      return {target: {type: "ticket_seat" as const, id}, previewStatus: reasonCode ? "blocked" as const : "eligible" as const, eligible: !reasonCode, reasonCode, expectedVersion: row ? row.orderId : "missing", before: row ? {orderId: row.orderId, orderStatus: row.orderStatus, eventStatus: row.eventStatus, checkedIn: Boolean(row.checkedInAt)} : {}, after: row ? {noticeKind: "pass", orderId: row.orderId} : {}};
    });
  },
  async execute(actor, claim, tx) {
    if (claim.operation !== "ticket_resend" || claim.request.operation !== "ticket_resend" || claim.target.type !== "ticket_seat") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    if (process.env.TICKET_RESEND_BATCH_ENABLED !== "true") return {status: "skipped", reasonCode: "TICKET_RESEND_DISABLED"};
    const eventKey = "ticket-resend:" + claim.effectKey;
    // Serialize with manual resends and payment/refund settlement on the same order.
    await tx.execute(sql`SELECT orders.id FROM event_orders AS orders
      JOIN event_order_seats AS seat ON seat.order_id = orders.id
      WHERE seat.id = ${claim.target.id}::uuid FOR UPDATE OF orders`);
    const row = (await selectSeat(tx, [claim.target.id], eventKey))[0];
    const reasonCode = eligible(row, new Date());
    if (reasonCode) return {status: "skipped", reasonCode};
    if (row!.orderId !== claim.expectedVersion) return {status: "skipped", reasonCode: "SEAT_CHANGED"};
    const inserted = rows(await tx.execute(sql`INSERT INTO ${ticketEmailOutbox} (order_id, seat_id, kind, event_key) VALUES (${row!.orderId}, ${row!.seatId}, 'pass', ${eventKey}) ON CONFLICT (event_key) DO NOTHING RETURNING id`));
    if (!inserted.length) {
      const existing = rows(await tx.execute(sql`SELECT id FROM ${ticketEmailOutbox} WHERE event_key = ${eventKey} AND seat_id = ${claim.target.id} AND order_id = ${row!.orderId} AND kind = 'pass' LIMIT 1`))[0];
      if (!existing || typeof existing !== "object" || !("id" in existing)) return {status: "failed", errorCode: "NOTICE_KEY_CONFLICT"};
    }
    await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'ticket.pass.resend_queued', 'ticket_seat', ${row!.seatId}, jsonb_build_object('batchId', ${claim.batchId}::text, 'orderId', ${row!.orderId}::text))`);
    return {status: "succeeded", resultRef: eventKey};
  },
};
