import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {requireAutomationCron, type AutomationCronActor} from "@/lib/auth/automation-actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {emailAddressBlocks, eventCancellationNotifications, eventGuestRegistrations, eventRegistrations, events, messageSuppressions, profiles} from "@/lib/db/server-schema";
import type {EmailSendInput} from "@/lib/email/transport";
import type {Actor} from "@/lib/membership/lifecycle";

export type CancellationNoticeClaim = Readonly<{
  id: string;
  eventId: string;
  registrationKind: "member" | "guest";
  registrationId: string;
  recipientName: string;
  recipientEmail: string;
  recipientLocale: "en" | "zh-HK";
  idempotencyKey: string;
  attemptCount: number;
  payload: EmailSendInput | null;
}>;
export type CancellationNoticeSummary = Readonly<{pending: number; queued: number; accepted: number; blocked: number; failed: number; uncertain: number}>;

const uuid = z.string().uuid();
const limitSchema = z.number().int().min(1).max(100);
const emailSchema = z.string().email().max(320);
const LEASE_MS = 10 * 60_000;
const SAFE_RETRY_MS = 23 * 60 * 60_000;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

function claimFrom(row: Record<string, unknown>): CancellationNoticeClaim {
  const locale = row.recipient_locale === "zh-HK" ? "zh-HK" : "en";
  return {
    id: uuid.parse(row.id), eventId: uuid.parse(row.event_id),
    registrationKind: row.registration_kind === "member" ? "member" : "guest", registrationId: String(row.registration_id),
    recipientName: String(row.recipient_name), recipientEmail: emailSchema.parse(row.recipient_email),
    recipientLocale: locale, idempotencyKey: String(row.idempotency_key),
    attemptCount: z.number().int().positive().parse(Number(row.attempt_count)),
    payload: row.payload as EmailSendInput | null,
  };
}

export function createEventNotificationsRepository(loadDatabase: () => Promise<Database> = getDb) {
  return {
    /** Pending snapshot rows are the checkpoint; a crash rolls the chunk back. */
    async expandPending(actor: AutomationCronActor, now: Date, limit = 100): Promise<Readonly<{queued: number; blocked: number}>> {
      requireAutomationCron(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const rows = rowsFrom(await tx.execute(sql`
          SELECT n.id, n.registration_kind, n.registration_id, n.recipient_email,
                 b.reason_code AS address_block,
                 EXISTS (SELECT 1 FROM ${messageSuppressions} s
                   WHERE n.registration_kind = 'member' AND s.profile_id = n.registration_id
                     AND s.channel = 'email' AND s.classification IN ('transactional', 'all')) AS service_suppressed
          FROM ${eventCancellationNotifications} n
          LEFT JOIN ${emailAddressBlocks} b ON b.email = lower(n.recipient_email) AND b.active = true
          WHERE n.status = 'pending'
          ORDER BY n.created_at, n.id FOR UPDATE OF n SKIP LOCKED LIMIT ${limitSchema.parse(limit)}
        `));
        let queued = 0;
        let blocked = 0;
        for (const row of rows) {
          const address = typeof row.recipient_email === "string" ? row.recipient_email.trim().toLowerCase() : "";
          const reason = !emailSchema.safeParse(address).success ? "invalid_address"
            : row.address_block ? String(row.address_block)
              : row.service_suppressed === true ? "service_suppressed" : null;
          await tx.execute(sql`
            UPDATE ${eventCancellationNotifications}
            SET recipient_email = ${address || null}, status = ${reason ? "blocked" : "queued"},
                error_code = ${reason}, next_attempt_at = ${now}, updated_at = ${now}
            WHERE id = ${uuid.parse(row.id)} AND status = 'pending'
          `);
          if (reason) blocked += 1; else queued += 1;
        }
        return {queued, blocked};
      });
    },

    async claimDue(actor: AutomationCronActor, now: Date, limit = 10): Promise<CancellationNoticeClaim[]> {
      requireAutomationCron(actor);
      const db = await loadDatabase();
      const cutoff = new Date(now.getTime() - SAFE_RETRY_MS);
      const claimUntil = new Date(now.getTime() + LEASE_MS);
      return db.transaction(async (tx) => {
        // Never automate another send after the provider's idempotency window.
        await tx.execute(sql`
          UPDATE ${eventCancellationNotifications} AS n
          SET status = 'uncertain', claim_expires_at = NULL, error_code = 'dedupe_window_elapsed', updated_at = ${now}
          WHERE n.id IN (
            SELECT id FROM ${eventCancellationNotifications}
            WHERE status IN ('queued', 'sending') AND first_attempt_at IS NOT NULL AND first_attempt_at <= ${cutoff}
              AND (status = 'queued' AND next_attempt_at <= ${now} OR status = 'sending' AND claim_expires_at <= ${now})
            ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 100
          )
        `);
        const rows = rowsFrom(await tx.execute(sql`
          WITH candidates AS (
            SELECT id FROM ${eventCancellationNotifications}
            WHERE (status = 'queued' AND next_attempt_at <= ${now}
              OR status = 'sending' AND claim_expires_at <= ${now})
              AND (first_attempt_at IS NULL OR first_attempt_at > ${cutoff})
            ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT ${limitSchema.parse(limit)}
          )
          UPDATE ${eventCancellationNotifications} AS n
          SET status = 'sending', attempt_count = n.attempt_count + 1,
              claim_expires_at = ${claimUntil}, updated_at = ${now}
          FROM candidates WHERE n.id = candidates.id
          RETURNING n.id, n.event_id, n.registration_kind, n.registration_id, n.recipient_name, n.recipient_email, n.recipient_locale,
                    n.idempotency_key, n.attempt_count, n.payload
        `));
        return rows.map(claimFrom);
      });
    },

    async knownBlock(actor: AutomationCronActor, claim: CancellationNoticeClaim): Promise<string | null> {
      requireAutomationCron(actor);
      const db = await loadDatabase();
      const rows = rowsFrom(await db.execute(sql`
        SELECT
          (SELECT reason_code FROM ${emailAddressBlocks} WHERE email = ${claim.recipientEmail.toLowerCase()} AND active = true LIMIT 1) AS address_block,
          EXISTS (SELECT 1 FROM ${messageSuppressions} WHERE ${messageSuppressions.profileId} = ${claim.registrationId}
            AND ${messageSuppressions.channel} = 'email' AND ${messageSuppressions.classification} IN ('transactional', 'all')) AS service_suppressed
      `));
      const row = rows[0];
      return row?.address_block ? String(row.address_block)
        : claim.registrationKind === "member" && row?.service_suppressed === true ? "service_suppressed" : null;
    },

    async eventSummary(actor: AutomationCronActor, eventId: string): Promise<Readonly<{titleEn: string; titleZh: string | null; slug: string}> | null> {
      requireAutomationCron(actor);
      const db = await loadDatabase();
      const rows = rowsFrom(await db.execute(sql`
        SELECT ${events.titleEn} AS title_en, ${events.titleZh} AS title_zh, ${events.slug} AS slug
        FROM ${events} WHERE ${events.id} = ${uuid.parse(eventId)} AND ${events.status} = 'cancelled' LIMIT 1
      `));
      const row = rows[0];
      return row ? {titleEn: String(row.title_en), titleZh: row.title_zh == null ? null : String(row.title_zh), slug: String(row.slug)} : null;
    },

    async freezePayload(actor: AutomationCronActor, claim: CancellationNoticeClaim, payload: EmailSendInput, now: Date): Promise<boolean> {
      requireAutomationCron(actor);
      if (payload.idempotencyKey !== claim.idempotencyKey) throw new Error("NOTICE_KEY_MISMATCH");
      const db = await loadDatabase();
      const rows = rowsFrom(await db.execute(sql`
        UPDATE ${eventCancellationNotifications}
        SET payload = ${JSON.stringify(payload)}::jsonb, first_attempt_at = COALESCE(first_attempt_at, ${now}), updated_at = ${now}
        WHERE id = ${uuid.parse(claim.id)} AND status = 'sending' AND attempt_count = ${claim.attemptCount}
          AND payload IS NULL RETURNING id
      `));
      return rows.length === 1;
    },

    async settle(actor: AutomationCronActor, claim: CancellationNoticeClaim, status: "accepted" | "queued" | "blocked" | "failed" | "uncertain", now: Date, result: string): Promise<boolean> {
      requireAutomationCron(actor);
      const db = await loadDatabase();
      const next = status === "queued" ? new Date(now.getTime() + Math.min(60, 2 ** Math.min(claim.attemptCount, 5)) * 60_000) : now;
      const rows = rowsFrom(await db.execute(sql`
        UPDATE ${eventCancellationNotifications}
        SET status = ${status}, claim_expires_at = NULL, next_attempt_at = ${next},
            provider_id = ${status === "accepted" ? result : null},
            error_code = ${status === "accepted" ? null : result},
            payload = ${status === "queued" || status === "uncertain" ? sql`payload` : sql`NULL`}, updated_at = ${now}
        WHERE id = ${uuid.parse(claim.id)} AND status = 'sending' AND attempt_count = ${claim.attemptCount}
        RETURNING id
      `));
      return rows.length === 1;
    },

    async preview(actor: Actor, eventId: string): Promise<Readonly<{candidates: number; knownBlocked: number}>> {
      requireAdmin(actor);
      const db = await loadDatabase();
      const rows = rowsFrom(await db.execute(sql`
        WITH candidates AS (
          SELECT p.email AS email, r.profile_id AS profile_id, 'member' AS kind
          FROM ${eventRegistrations} r JOIN ${profiles} p ON p.id = r.profile_id
          WHERE r.event_id = ${uuid.parse(eventId)} AND r.status IN ('registered', 'waitlist', 'attended')
          UNION ALL
          SELECT g.email, NULL::text, 'guest'
          FROM ${eventGuestRegistrations} g
          WHERE g.event_id = ${uuid.parse(eventId)} AND g.status IN ('registered', 'waitlist', 'attended')
        )
        SELECT count(*)::int AS candidates,
          count(*) FILTER (WHERE c.email IS NULL OR c.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
            OR EXISTS (SELECT 1 FROM ${emailAddressBlocks} b WHERE b.email = lower(c.email) AND b.active = true)
            OR (c.kind = 'member' AND EXISTS (SELECT 1 FROM ${messageSuppressions} s
              WHERE s.profile_id = c.profile_id AND s.channel = 'email' AND s.classification IN ('transactional', 'all'))))::int AS known_blocked
        FROM candidates c
      `));
      return {candidates: Number(rows[0]?.candidates ?? 0), knownBlocked: Number(rows[0]?.known_blocked ?? 0)};
    },

    async summary(actor: Actor, eventId: string): Promise<CancellationNoticeSummary> {
      requireAdmin(actor);
      const db = await loadDatabase();
      const rows = rowsFrom(await db.execute(sql`
        SELECT status, count(*)::int AS count FROM ${eventCancellationNotifications}
        WHERE event_id = ${uuid.parse(eventId)} GROUP BY status
      `));
      const result = {pending: 0, queued: 0, accepted: 0, blocked: 0, failed: 0, uncertain: 0};
      for (const row of rows) {
        const status = String(row.status);
        const key = status === "sending" ? "queued" : status;
        if (key in result) result[key as keyof typeof result] += Number(row.count);
      }
      return result;
    },
  };
}

export const eventNotificationsRepository = createEventNotificationsRepository();
