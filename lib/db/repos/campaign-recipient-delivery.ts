import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {campaignRecipients, campaigns} from "@/lib/db/server-schema";
import type {
  AutomationDatabaseLoader,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import type {AppLocale} from "@/i18n/routing";

export type CampaignRecipientStatus =
  | "queued"
  | "processing"
  | "sent"
  | "failed"
  | "suppressed";

export type CampaignRecipientClaim = Readonly<{
  id: string;
  campaignId: string;
  profileId: string;
  email: string;
  locale: AppLocale;
  variables: Readonly<Record<string, string>>;
  template: string;
  status: "processing";
  attemptCount: number;
  claimedAt: Date;
  claimExpiresAt: Date;
  errorCode: string | null;
  claimSource: "queued" | "retry" | "stale";
}>;

const claimSchema = z.object({
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  profile_id: z.string().min(1),
  email: z.string().email(),
  locale: z.enum(["en", "zh-HK"]),
  variables: z.record(z.string()),
  template: z.string().min(1),
  status: z.literal("processing"),
  attempt_count: z.coerce.number().int().positive(),
  claimed_at: z.coerce.date(),
  claim_expires_at: z.coerce.date(),
  error_code: z.string().nullable(),
  prior_status: z.enum(["queued", "processing"]),
  prior_error_code: z.string().nullable(),
});

function rowsFrom(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows;
  }
  return [];
}

function claimFrom(row: unknown): CampaignRecipientClaim {
  const parsed = claimSchema.parse(row);
  return {
    id: parsed.id,
    campaignId: parsed.campaign_id,
    profileId: parsed.profile_id,
    email: parsed.email,
    locale: parsed.locale,
    variables: parsed.variables,
    template: parsed.template,
    status: parsed.status,
    attemptCount: parsed.attempt_count,
    claimedAt: parsed.claimed_at,
    claimExpiresAt: parsed.claim_expires_at,
    errorCode: parsed.error_code,
    claimSource: parsed.prior_status === "queued"
      ? "queued"
      : parsed.prior_error_code === null ? "stale" : "retry",
  };
}

function validClaimInput(now: Date, limit: number, leaseMs: number): void {
  if (
    Number.isNaN(now.getTime())
    || !Number.isInteger(limit)
    || limit <= 0
    || !Number.isInteger(leaseMs)
    || leaseMs <= 0
  ) {
    throw new Error("INVALID_CAMPAIGN_CLAIM_INPUT");
  }
}

async function transitionRecipient(
  database: AutomationSqlExecutor,
  id: string,
  claimedAt: Date,
  assignment: ReturnType<typeof sql>,
): Promise<unknown> {
  const result = await database.execute(sql`
    WITH updated AS (
      UPDATE ${campaignRecipients} AS target
      SET ${assignment}
      WHERE target.id = ${id}
        AND target.status = 'processing'
        AND target.claimed_at = ${claimedAt}
      RETURNING target.*
    )
    SELECT updated.*, campaign.template
    FROM updated
    INNER JOIN ${campaigns} AS campaign ON campaign.id = updated.campaign_id
  `);
  const row = rowsFrom(result)[0];
  if (!row) throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
  return row;
}

export function createCampaignRecipientDeliveryRepository(
  loadDatabase: AutomationDatabaseLoader,
) {
  return {
    async claimRecipients(
      actor: AutomationRepositoryActor,
      now: Date,
      limit: number,
      leaseMs: number,
    ): Promise<CampaignRecipientClaim[]> {
      requireAutomationSystem(actor);
      validClaimInput(now, limit, leaseMs);
      const database = await loadDatabase();
      const claimExpiresAt = new Date(now.getTime() + leaseMs);

      return database.transaction(async (transaction) => {
        const result = await transaction.execute(sql`
          WITH completed AS (
            UPDATE ${campaigns} AS idle
            SET status = 'completed'
            WHERE idle.status IN ('queued', 'processing')
              AND NOT EXISTS (
                SELECT 1
                FROM ${campaignRecipients} AS pending
                WHERE pending.campaign_id = idle.id
                  AND pending.status IN ('queued', 'processing')
              )
            RETURNING idle.id
          ),
          due AS (
            SELECT target.id, target.status AS prior_status, target.error_code AS prior_error_code
            FROM ${campaignRecipients} AS target
            INNER JOIN ${campaigns} AS campaign ON campaign.id = target.campaign_id
            WHERE campaign.status IN ('queued', 'processing')
              AND (
                target.status = 'queued'
                OR (
                  target.status = 'processing'
                  AND target.claim_expires_at <= ${now}
                )
              )
            ORDER BY campaign.created_at, target.id
            FOR UPDATE OF target SKIP LOCKED
            LIMIT ${limit}
          ),
          claimed AS (
            UPDATE ${campaignRecipients} AS target
            SET status = 'processing',
                claimed_at = ${now},
                claim_expires_at = ${claimExpiresAt},
                attempt_count = target.attempt_count + 1,
                error_code = NULL
            FROM due
            WHERE target.id = due.id
            RETURNING target.*, due.prior_status, due.prior_error_code
          ),
          activated AS (
            UPDATE ${campaigns} AS campaign
            SET status = 'processing'
            WHERE campaign.id IN (SELECT DISTINCT campaign_id FROM claimed)
              AND campaign.status = 'queued'
            RETURNING campaign.id
          )
          SELECT claimed.*, campaign.template
          FROM claimed
          INNER JOIN ${campaigns} AS campaign ON campaign.id = claimed.campaign_id
        `);
        return rowsFrom(result).map(claimFrom);
      });
    },

    async markRecipientSent(
      actor: AutomationRepositoryActor,
      id: string,
      claimedAt: Date,
    ): Promise<unknown> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionRecipient(database, id, claimedAt, sql`
        status = 'sent',
        claim_expires_at = NULL,
        error_code = NULL
      `);
    },

    async markRecipientSuppressed(
      actor: AutomationRepositoryActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
    ): Promise<unknown> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionRecipient(database, id, claimedAt, sql`
        status = 'suppressed',
        claim_expires_at = NULL,
        error_code = ${errorCode}
      `);
    },

    async rescheduleRecipient(
      actor: AutomationRepositoryActor,
      id: string,
      claimedAt: Date,
      retryAt: Date,
      errorCode: string,
    ): Promise<unknown> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionRecipient(database, id, claimedAt, sql`
        claim_expires_at = ${retryAt},
        error_code = ${errorCode}
      `);
    },

    async markRecipientFailed(
      actor: AutomationRepositoryActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
    ): Promise<unknown> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionRecipient(database, id, claimedAt, sql`
        status = 'failed',
        claim_expires_at = NULL,
        error_code = ${errorCode}
      `);
    },

    async completeCampaignIfIdle(
      actor: AutomationRepositoryActor,
      campaignId: string,
    ): Promise<boolean> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      const completed = rowsFrom(await database.execute(sql`
        UPDATE ${campaigns} AS campaign
        SET status = 'completed'
        WHERE campaign.id = ${campaignId}
          AND campaign.status IN ('queued', 'processing')
          AND NOT EXISTS (
            SELECT 1
            FROM ${campaignRecipients} AS recipient
            WHERE recipient.campaign_id = campaign.id
              AND recipient.status IN ('queued', 'processing')
          )
        RETURNING campaign.id
      `));
      return completed.length > 0;
    },
  };
}

export type CampaignRecipientDeliveryRepository = ReturnType<
  typeof createCampaignRecipientDeliveryRepository
>;
