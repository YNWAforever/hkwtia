import "server-only";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor} from "@/lib/membership/lifecycle";
import {providerEffectIsUncertain} from "@/lib/automation/delivery-retry-authorization";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAutomationCron, type AutomationCronActor} from "@/lib/auth/automation-actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import type {TicketEmailPayload} from "@/lib/db/server-schema";

export type TicketEmailKind = "confirmation" | "pass" | "refund" | "refund_failed";
export type TicketEmailClaim = Readonly<{
  id: string; orderId: string; seatId: string | null; kind: TicketEmailKind;
  eventKey: string; attemptCount: number; payload: TicketEmailPayload | null;
}>;

const uuid = z.string().uuid();
const attempt = z.number().int().min(1);
const limitSchema = z.number().int().min(1).max(25);
const LEASE_MS = 10 * 60_000;
const SAFE_RETRY_MS = 23 * 60 * 60_000;


function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function claimFrom(row: Record<string, unknown>): TicketEmailClaim {
  if (row.kind !== "confirmation" && row.kind !== "pass"
    && row.kind !== "refund" && row.kind !== "refund_failed") throw new Error("INVALID_TICKET_EMAIL_KIND");
  return {
    id: String(row.id), orderId: String(row.order_id),
    seatId: row.seat_id == null ? null : String(row.seat_id), kind: row.kind,
    eventKey: String(row.event_key), attemptCount: Number(row.attempt_count),
    payload: row.payload as TicketEmailPayload | null,
  };
}

export type StaffPassNotice = Readonly<{
  orderId: string;
  status: "queued" | "sent" | "uncertain" | "pending" | "blocked";
}>;
function noticeStatus(row: Record<string, unknown>): StaffPassNotice {
  const status = row.status;
  return {orderId: String(row.order_id), status: status === "sent" ? "sent"
    : status === "uncertain" ? "uncertain" : status === "queued" ? "queued"
    : status === "sending" ? "pending" : "blocked"};
}
function staffPassKey(seatId: string, attemptId: string): string {
  return "ticket-pass-manual:" + uuid.parse(seatId) + ":" + uuid.parse(attemptId);
}

export function createTicketEmailOutboxRepository(loadDatabase: () => Promise<Database> = getDb) {
  async function claim(now: Date, limit: number, orderId: string | null): Promise<TicketEmailClaim[]> {
    const db = await loadDatabase();
    const validatedOrderId = orderId === null ? null : uuid.parse(orderId);
    const cutoff = new Date(now.getTime() - SAFE_RETRY_MS);
    const claimUntil = new Date(now.getTime() + LEASE_MS);
    return db.transaction(async (tx) => {
      // Frozen expired claims and unknown provider effects require reconciliation.
      // A provider TTL is an additional guard, never evidence of a refused send.
      await tx.execute(sql`
        WITH expired AS (
          UPDATE ticket_email_outbox AS outbox
          SET status = 'uncertain', claim_expires_at = NULL,
              payload = NULL, error_code = CASE WHEN first_attempt_at <= ${cutoff} THEN 'dedupe_window_elapsed' ELSE 'provider_acceptance_uncertain' END, updated_at = ${now}
          WHERE outbox.id IN (
            SELECT id FROM ticket_email_outbox
            WHERE status IN ('queued', 'sending')
              AND (
                first_attempt_at IS NOT NULL AND first_attempt_at <= ${cutoff}
                  AND (status = 'queued' AND next_attempt_at <= ${now}
                    OR status = 'sending' AND claim_expires_at <= ${now})
                OR status = 'queued' AND next_attempt_at <= ${now}
                  AND error_code IN ('retryable_network','retryable_server','provider_unclassified_failure','provider_acceptance_uncertain','delivery_unknown')
                OR status = 'sending' AND claim_expires_at <= ${now}
                  AND first_attempt_at IS NOT NULL
              )
              AND (${validatedOrderId}::uuid IS NULL OR order_id = ${validatedOrderId}::uuid)
            ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 100
          )
          RETURNING outbox.id, outbox.order_id, outbox.kind, outbox.error_code
        ), resolved AS (
          UPDATE staff_tasks AS task
          SET status = 'resolved', resolved_at = ${now}, updated_at = ${now}
          FROM expired
          WHERE task.dedupe_key = 'ticket-email-provider-pending:' || expired.id::text
            AND task.status = 'open'
          RETURNING task.id
        )
        INSERT INTO staff_tasks (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
        SELECT NULL, NULL, 'ticket_email', 'ticket-email:' || expired.id::text,
          'ticket_email_uncertain',
          jsonb_build_object('orderId', expired.order_id::text, 'noticeKind', expired.kind,
            'reasonCode', expired.error_code)
        FROM expired ON CONFLICT (dedupe_key) DO NOTHING
      `);
      // The provider may remain pending for days. Keep checking, and surface
      // the delay to staff without consuming a finite send-attempt budget.
      await tx.execute(sql`
        INSERT INTO staff_tasks (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
        SELECT NULL, NULL, 'ticket_email',
          'ticket-email-provider-pending:' || outbox.id::text,
          'ticket_refund_provider_pending',
          jsonb_build_object('orderId', outbox.order_id::text, 'noticeKind', outbox.kind,
            'reasonCode', 'refund_pending')
        FROM ticket_email_outbox AS outbox
        WHERE outbox.kind = 'refund'
          AND outbox.status IN ('queued', 'sending')
          AND outbox.first_attempt_at IS NULL
          AND outbox.created_at <= ${new Date(now.getTime() - 24 * 60 * 60_000)}
          AND outbox.next_attempt_at <= ${now}
        ORDER BY outbox.created_at, outbox.id
        LIMIT 100
        ON CONFLICT (dedupe_key) DO NOTHING
      `);
      const claimed = await tx.execute(sql`
        WITH candidates AS (
          SELECT id FROM ticket_email_outbox
          WHERE (status = 'queued' AND next_attempt_at <= ${now}
            OR status = 'sending' AND claim_expires_at <= ${now})
            AND (first_attempt_at IS NULL OR first_attempt_at > ${cutoff})
            AND NOT (status = 'sending' AND first_attempt_at IS NOT NULL)
            AND (error_code IS NULL OR error_code NOT IN ('retryable_network','retryable_server','provider_unclassified_failure','provider_acceptance_uncertain','delivery_unknown'))
            AND (${validatedOrderId}::uuid IS NULL OR order_id = ${validatedOrderId}::uuid)
          ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT ${limitSchema.parse(limit)}
        )
        UPDATE ticket_email_outbox AS outbox
        SET status = 'sending', attempt_count = outbox.attempt_count + 1,
            claim_expires_at = ${claimUntil}, updated_at = ${now}
        FROM candidates WHERE outbox.id = candidates.id
        RETURNING outbox.id, outbox.order_id, outbox.seat_id, outbox.kind,
          outbox.event_key, outbox.attempt_count, outbox.payload
      `);
      return rowsFrom(claimed).map(claimFrom);
    });
  }

  async function terminal(
    id: string, count: number, now: Date, status: "blocked" | "uncertain", reasonCode: string,
  ): Promise<boolean> {
    const db = await loadDatabase();
    return db.transaction(async (tx) => {
      const changed = rowsFrom(await tx.execute(sql`
        UPDATE ticket_email_outbox
        SET status = ${status}, claim_expires_at = NULL, payload = NULL,
            error_code = ${reasonCode}, updated_at = ${now}
        WHERE id = ${uuid.parse(id)} AND status = 'sending'
          AND attempt_count = ${attempt.parse(count)}
        RETURNING id, order_id, kind
      `));
      if (changed.length === 0) return false;
      await tx.execute(sql`
        UPDATE staff_tasks
        SET status = 'resolved', resolved_at = ${now}, updated_at = ${now}
        WHERE dedupe_key = ${"ticket-email-provider-pending:" + id}
          AND status = 'open'
      `);
      await tx.execute(sql`
        INSERT INTO staff_tasks (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
        VALUES (NULL, NULL, 'ticket_email', ${"ticket-email:" + id}, ${"ticket_email_" + status},
          ${JSON.stringify({orderId: String(changed[0]?.order_id),
            noticeKind: String(changed[0]?.kind), reasonCode})}::jsonb)
        ON CONFLICT (dedupe_key) DO NOTHING
      `);
      return true;
    });
  }

  return {
    async queueStaffPass(actor: Actor, seatId: string, attemptId: string): Promise<StaffPassNotice | null> {
      requireAdmin(actor);
      const eventKey = staffPassKey(seatId, attemptId);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        // Share the paid-order lock with settlement/refund and batch resends.
        // A fresh browser key cannot race an unresolved effect into a second send.
        const order = rowsFrom(await tx.execute(sql`
          SELECT orders.id, orders.status FROM event_orders AS orders
          JOIN event_order_seats AS seat ON seat.order_id = orders.id
          WHERE seat.id = ${seatId}::uuid FOR UPDATE OF orders
        `))[0];
        if (!order || order.status !== "paid") return null;
        const existing = rowsFrom(await tx.execute(sql`
          SELECT order_id, status FROM ticket_email_outbox
          WHERE event_key = ${eventKey} AND seat_id = ${seatId}::uuid AND kind = 'pass'
        `))[0];
        if (existing) return noticeStatus(existing);
        const unresolved = rowsFrom(await tx.execute(sql`
          SELECT order_id, status FROM ticket_email_outbox
          WHERE seat_id = ${seatId}::uuid AND kind = 'pass'
            AND status IN ('queued', 'sending', 'uncertain')
          ORDER BY CASE WHEN status = 'uncertain' THEN 0 ELSE 1 END, id LIMIT 1
        `))[0];
        if (unresolved) return {orderId: String(order.id), status: unresolved.status === "uncertain" ? "uncertain" : "pending"};
        await tx.execute(sql`
          INSERT INTO ticket_email_outbox(order_id, seat_id, kind, event_key)
          VALUES (${String(order.id)}::uuid, ${seatId}::uuid, 'pass', ${eventKey})
        `);
        await tx.execute(sql`
          INSERT INTO audit_events(actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (${actor.profileId}, ${actor.kind}, 'ticket.pass.resend_queued', 'ticket_seat', ${seatId},
            ${JSON.stringify({source: "staff_manual", orderId: String(order.id), attemptId})}::jsonb)
        `);
        return {orderId: String(order.id), status: "queued"};
      });
    },
    async staffPassStatus(actor: Actor, seatId: string, attemptId: string): Promise<StaffPassNotice | null> {
      requireAdmin(actor);
      const db = await loadDatabase();
      const row = rowsFrom(await db.execute(sql`
        SELECT order_id, status FROM ticket_email_outbox
        WHERE event_key = ${staffPassKey(seatId, attemptId)} AND seat_id = ${seatId}::uuid AND kind = 'pass'
      `))[0];
      return row ? noticeStatus(row) : null;
    },
    async queueHealth(actor: AutomationCronActor, now: Date): Promise<Readonly<{
      backlog: number; oldestPendingAgeSeconds: number | null;
    }>> {
      requireAutomationCron(actor);
      const db = await loadDatabase();
      const row = rowsFrom(await db.execute(sql`
        SELECT count(*)::int AS backlog,
          CASE WHEN min(created_at) IS NULL THEN NULL
            ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - min(created_at)))))::int
          END
            AS oldest_pending_age_seconds
        FROM ticket_email_outbox
        WHERE status IN ('queued', 'sending')
      `))[0];
      if (!row) throw new Error("TICKET_EMAIL_QUEUE_HEALTH_UNAVAILABLE");
      const backlog = Number(row.backlog);
      const oldest = row.oldest_pending_age_seconds;
      if (!Number.isSafeInteger(backlog) || backlog < 0
        || (oldest !== null && (!Number.isSafeInteger(Number(oldest)) || Number(oldest) < 0))) {
        throw new Error("TICKET_EMAIL_QUEUE_HEALTH_INVALID");
      }
      return {backlog, oldestPendingAgeSeconds: oldest === null ? null : Number(oldest)};
    },
    async claimDue(actor: AutomationCronActor, now: Date, limit: number): Promise<TicketEmailClaim[]> {
      requireAutomationCron(actor);
      return claim(now, limit, null);
    },
    async claimForOrder(orderId: string, now: Date, limit = 3): Promise<TicketEmailClaim[]> {
      return claim(now, limit, orderId);
    },
    async freezePayload(id: string, count: number, payload: TicketEmailPayload, now: Date): Promise<boolean> {
      const db = await loadDatabase();
      const changed = rowsFrom(await db.execute(sql`
        UPDATE ticket_email_outbox SET payload = ${JSON.stringify(payload)}::jsonb,
          first_attempt_at = COALESCE(first_attempt_at, ${now}), updated_at = ${now}
        WHERE id = ${uuid.parse(id)} AND status = 'sending'
          AND attempt_count = ${attempt.parse(count)}
          AND event_key = ${payload.idempotencyKey} AND payload IS NULL RETURNING id
      `));
      return changed.length === 1;
    },
    async markSent(id: string, count: number, providerId: string): Promise<boolean> {
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const changed = rowsFrom(await tx.execute(sql`
          UPDATE ticket_email_outbox
          SET status = 'sent', payload = NULL, claim_expires_at = NULL,
            provider_id = ${providerId}, error_code = NULL, updated_at = now()
          WHERE id = ${uuid.parse(id)} AND status = 'sending'
            AND attempt_count = ${attempt.parse(count)}
            AND payload IS NOT NULL RETURNING id
        `));
        if (changed.length === 0) return false;
        await tx.execute(sql`
          UPDATE staff_tasks
          SET status = 'resolved', resolved_at = now(), updated_at = now()
          WHERE dedupe_key = ${"ticket-email-provider-pending:" + id}
            AND status = 'open'
        `);
        return true;
      });
    },
    async markRetryable(id: string, count: number, now: Date, errorCode: string): Promise<boolean> {
      const n = attempt.parse(count);
      if (providerEffectIsUncertain(errorCode)) return terminal(id, n, now, "uncertain", "provider_acceptance_uncertain");

      const delayMs = Math.min(60, 2 ** Math.min(n, 5)) * 60_000;
      const db = await loadDatabase();
      const changed = rowsFrom(await db.execute(sql`
        UPDATE ticket_email_outbox SET status = 'queued', claim_expires_at = NULL,
          next_attempt_at = ${new Date(now.getTime() + delayMs)},
          error_code = ${errorCode}, updated_at = ${now}
        WHERE id = ${uuid.parse(id)} AND status = 'sending'
          AND attempt_count = ${n} RETURNING id
      `));
      return changed.length === 1;
    },
    async markBlocked(id: string, count: number, now: Date, reasonCode: string): Promise<boolean> {
      return terminal(id, count, now, "blocked", reasonCode);
    },
    async markSuppressed(id: string, count: number, now: Date): Promise<boolean> {
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const changed = rowsFrom(await tx.execute(sql`
          UPDATE ticket_email_outbox
          SET status = 'suppressed', payload = NULL, claim_expires_at = NULL,
            error_code = 'order_state_changed', updated_at = ${now}
          WHERE id = ${uuid.parse(id)} AND status = 'sending'
            AND attempt_count = ${attempt.parse(count)} RETURNING id
        `));
        if (changed.length === 0) return false;
        await tx.execute(sql`
          UPDATE staff_tasks
          SET status = 'resolved', resolved_at = ${now}, updated_at = ${now}
          WHERE dedupe_key = ${"ticket-email-provider-pending:" + id}
            AND status = 'open'
        `);
        return true;
      });
    },
  };
}

export const ticketEmailOutboxRepository = createTicketEmailOutboxRepository();
