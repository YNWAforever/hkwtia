import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireAutomationCron,
  type AutomationCronActor,
} from "@/lib/auth/automation-actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {
  requireContactWriterSource,
  type ContactWriterActor,
} from "@/lib/db/repos/contacts";
import type {ShowcaseLeadEmailPayload} from "@/lib/db/server-schema";

export type LeadEmailClaim = Readonly<{
  id: string;
  leadId: string;
  kind: "ack" | "staff";
  idempotencyKey: string;
  attemptCount: number;
  payload: ShowcaseLeadEmailPayload | null;
}>;

export type LeadEmailContext = Readonly<{
  contactName: string;
  email: string;
  locale: "en" | "zh-HK";
  listingSlug: string;
  listingNameEn: string;
}>;
type DeliveryActor = AutomationCronActor | ContactWriterActor;
const uuidSchema = z.string().uuid();
const attemptSchema = z.number().int().min(1);
const limitSchema = z.number().int().min(1).max(50);
const LEASE_MS = 10 * 60_000;
const SAFE_RETRY_MS = 23 * 60 * 60_000;
const MAX_ATTEMPTS = 8;

function requireDeliveryActor(actor: DeliveryActor): void {
  if (actor.kind === "contact-writer") {
    requireContactWriterSource(actor, "showcase_intro");
  } else {
    requireAutomationCron(actor);
  }
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function claimFrom(row: Record<string, unknown>): LeadEmailClaim {
  if (row.kind !== "ack" && row.kind !== "staff") {
    throw new Error("INVALID_LEAD_EMAIL_KIND");
  }
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    kind: row.kind,
    idempotencyKey: String(row.idempotency_key),
    attemptCount: Number(row.attempt_count),
    payload: row.payload as ShowcaseLeadEmailPayload | null,
  };
}

export function createShowcaseLeadEmailOutboxRepository(
  loadDatabase: () => Promise<Database> = getDb,
) {
  async function claim(now: Date, limit: number, leadId: string | null): Promise<LeadEmailClaim[]> {
    const database = await loadDatabase();
    const validatedLimit = limitSchema.parse(limit);
    const cutoff = new Date(now.getTime() - SAFE_RETRY_MS);
    const claimUntil = new Date(now.getTime() + LEASE_MS);
    return database.transaction(async (transaction) => {
      // A provider-accepted send whose lease expired after the 24-hour
      // idempotency window cannot safely be issued again. Surface it to staff
      // in the same statement that makes the row terminal.
      await transaction.execute(sql`
        WITH expired AS (
          UPDATE showcase_lead_email_outbox AS outbox
          SET status = 'uncertain', claim_expires_at = NULL,
              error_code = 'dedupe_window_elapsed', updated_at = ${now}
          WHERE outbox.id IN (
            SELECT id FROM showcase_lead_email_outbox
            WHERE status IN ('queued', 'sending')
              AND first_attempt_at IS NOT NULL
              AND first_attempt_at <= ${cutoff}
              AND (status = 'queued' AND next_attempt_at <= ${now}
                OR status = 'sending' AND claim_expires_at <= ${now})
              AND (${leadId}::uuid IS NULL OR lead_id = ${leadId}::uuid)
            ORDER BY next_attempt_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 100
          )
          RETURNING outbox.id, outbox.lead_id, outbox.kind
        )
        INSERT INTO staff_tasks
          (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
        SELECT NULL, NULL, 'showcase_lead_email',
          'showcase-lead-email:' || expired.id::text,
          'showcase_lead_email_uncertain',
          jsonb_build_object(
            'contactEmail', leads.email,
            'locale', leads.locale,
            'noticeKind', expired.kind,
            'reasonCode', 'dedupe_window_elapsed'
          )
        FROM expired JOIN leads ON leads.id = expired.lead_id
        ON CONFLICT (dedupe_key) DO NOTHING
      `);
      const claimed = await transaction.execute(sql`
        WITH candidates AS (
          SELECT id FROM showcase_lead_email_outbox
          WHERE (status = 'queued' AND next_attempt_at <= ${now}
            OR status = 'sending' AND claim_expires_at <= ${now})
            AND (first_attempt_at IS NULL OR first_attempt_at > ${cutoff})
            AND (${leadId}::uuid IS NULL OR lead_id = ${leadId}::uuid)
          ORDER BY next_attempt_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${validatedLimit}
        )
        UPDATE showcase_lead_email_outbox AS outbox
        SET status = 'sending', attempt_count = outbox.attempt_count + 1,
            claim_expires_at = ${claimUntil}, updated_at = ${now}
        FROM candidates
        WHERE outbox.id = candidates.id
        RETURNING outbox.id, outbox.lead_id, outbox.kind,
          outbox.idempotency_key, outbox.attempt_count, outbox.payload
      `);
      return rowsFrom(claimed).map(claimFrom).sort((left, right) =>
        left.leadId.localeCompare(right.leadId)
        || (left.kind === "ack" ? 0 : 1) - (right.kind === "ack" ? 0 : 1));
    });
  }

  async function terminal(
    actor: DeliveryActor,
    id: string,
    attemptCount: number,
    now: Date,
    status: "blocked" | "uncertain",
    reasonCode: string,
  ): Promise<boolean> {
    requireDeliveryActor(actor);
    const database = await loadDatabase();
    return database.transaction(async (transaction) => {
      const changed = rowsFrom(await transaction.execute(sql`
        UPDATE showcase_lead_email_outbox
        SET status = ${status}, claim_expires_at = NULL,
            error_code = ${reasonCode}, updated_at = ${now}
        WHERE id = ${uuidSchema.parse(id)}
          AND status = 'sending'
          AND attempt_count = ${attemptSchema.parse(attemptCount)}
        RETURNING id, lead_id, kind
      `));
      if (changed.length === 0) return false;
      await transaction.execute(sql`
        INSERT INTO staff_tasks
          (profile_id, journey_state_id, kind, dedupe_key, summary_code, context)
        SELECT NULL, NULL, 'showcase_lead_email',
          'showcase-lead-email:' || ${id}::text,
          'showcase_lead_email_' || ${status},
          jsonb_build_object(
            'contactEmail', leads.email,
            'locale', leads.locale,
            'noticeKind', ${String(changed[0]?.kind)},
            'reasonCode', ${reasonCode}
          )
        FROM leads WHERE leads.id = ${String(changed[0]?.lead_id)}::uuid
        ON CONFLICT (dedupe_key) DO NOTHING
      `);
      return true;
    });
  }

  return {
    async loadContext(actor: DeliveryActor, leadId: string): Promise<LeadEmailContext> {
      requireDeliveryActor(actor);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT leads.contact_name, leads.email, leads.locale,
          showcase_listings.slug, showcase_listings.name_en
        FROM leads
        JOIN showcase_listings ON showcase_listings.id = leads.listing_id
        WHERE leads.id = ${uuidSchema.parse(leadId)}
        LIMIT 1
      `))[0];
      if (!row || (row.locale !== "en" && row.locale !== "zh-HK")) {
        throw new Error("SHOWCASE_LEAD_EMAIL_CONTEXT_MISSING");
      }
      return {
        contactName: String(row.contact_name),
        email: String(row.email),
        locale: row.locale,
        listingSlug: String(row.slug),
        listingNameEn: String(row.name_en),
      };
    },
    async claimDue(actor: AutomationCronActor, now: Date, limit: number): Promise<LeadEmailClaim[]> {
      requireAutomationCron(actor);
      return claim(now, limit, null);
    },
    async claimForLead(actor: ContactWriterActor, leadId: string, now: Date): Promise<LeadEmailClaim[]> {
      requireContactWriterSource(actor, "showcase_intro");
      return claim(now, 2, uuidSchema.parse(leadId));
    },
    async freezePayload(
      actor: DeliveryActor,
      id: string,
      attemptCount: number,
      payload: ShowcaseLeadEmailPayload,
      now: Date,
    ): Promise<boolean> {
      requireDeliveryActor(actor);
      const database = await loadDatabase();
      const frozen = rowsFrom(await database.execute(sql`
        UPDATE showcase_lead_email_outbox
        SET payload = ${JSON.stringify(payload)}::jsonb,
            first_attempt_at = COALESCE(first_attempt_at, ${now}),
            updated_at = ${now}
        WHERE id = ${uuidSchema.parse(id)}
          AND status = 'sending'
          AND attempt_count = ${attemptSchema.parse(attemptCount)}
          AND idempotency_key = ${payload.idempotencyKey}
          AND payload IS NULL
        RETURNING id
      `));
      return frozen.length === 1;
    },
    async markSent(actor: DeliveryActor, id: string, attemptCount: number, providerId: string): Promise<boolean> {
      requireDeliveryActor(actor);
      const database = await loadDatabase();
      const changed = rowsFrom(await database.execute(sql`
        UPDATE showcase_lead_email_outbox
        SET status = 'sent', payload = NULL, claim_expires_at = NULL,
            provider_id = ${providerId}, error_code = NULL, updated_at = now()
        WHERE id = ${uuidSchema.parse(id)}
          AND status = 'sending'
          AND attempt_count = ${attemptSchema.parse(attemptCount)}
          AND payload IS NOT NULL
        RETURNING id
      `));
      return changed.length === 1;
    },
    async markRetryable(
      actor: DeliveryActor,
      id: string,
      attemptCount: number,
      now: Date,
      errorCode: string,
    ): Promise<boolean> {
      requireDeliveryActor(actor);
      const validatedAttempt = attemptSchema.parse(attemptCount);
      if (validatedAttempt >= MAX_ATTEMPTS) {
        return terminal(actor, id, validatedAttempt, now, "blocked", "attempts_exhausted");
      }
      const delayMs = Math.min(60, 2 ** Math.min(validatedAttempt, 5)) * 60_000;
      const database = await loadDatabase();
      const changed = rowsFrom(await database.execute(sql`
        UPDATE showcase_lead_email_outbox
        SET status = 'queued', claim_expires_at = NULL,
            next_attempt_at = ${new Date(now.getTime() + delayMs)},
            error_code = ${errorCode}, updated_at = ${now}
        WHERE id = ${uuidSchema.parse(id)}
          AND status = 'sending'
          AND attempt_count = ${validatedAttempt}
        RETURNING id
      `));
      return changed.length === 1;
    },
    async markBlocked(
      actor: DeliveryActor,
      id: string,
      attemptCount: number,
      now: Date,
      reasonCode: string,
    ): Promise<boolean> {
      return terminal(actor, id, attemptCount, now, "blocked", reasonCode);
    },
  };
}

export const showcaseLeadEmailOutboxRepository = createShowcaseLeadEmailOutboxRepository();
