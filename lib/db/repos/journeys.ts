import "server-only";

import {sql, type SQL} from "drizzle-orm";

import {
  ADMIN_RETRY_AUTHORIZATION_BY_FAILURE,
} from "@/lib/automation/delivery-retry-authorization";
import type {ScheduledJourneyStep} from "@/lib/automation/types";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {
  auditEvents,
  emailLog,
  journeyState,
  staffTasks,
  whatsappLog,
  type JourneyState,
} from "@/lib/db/server-schema";
import {forbidden, getDb, requireSystem} from "@/lib/db/repos/common";
import type {StaffTaskInput} from "@/lib/db/repos/staff-tasks";
import type {Actor} from "@/lib/membership/lifecycle";

export type AutomationSqlExecutor = Readonly<{
  execute: (query: SQL) => PromiseLike<unknown>;
}>;

export type AutomationDatabase = AutomationSqlExecutor & Readonly<{
  transaction: <T>(work: (transaction: AutomationSqlExecutor) => Promise<T>) => Promise<T>;
}>;

export type AutomationDatabaseLoader = () => Promise<AutomationDatabase>;

export type JourneyEnrollment = Pick<
  ScheduledJourneyStep,
  "profileId" | "journey" | "instanceKey" | "step" | "scheduledAt" | "deliveryKey"
> & Readonly<{membershipId: string | null}>;

export type JourneyEnrollmentDisposition = "created" | "existing";
export type JourneyTransitionErrorCode = "INVALID_TRANSITION";

export type JourneyClaimSource = "scheduled" | "stale";
export type JourneyClaim = JourneyState & Readonly<{
  claimSource: JourneyClaimSource;
  emailErrorCode: string | null;
  whatsappErrorCode: string | null;
}>;

export class JourneyTransitionError extends Error {
  constructor(readonly code: JourneyTransitionErrorCode = "INVALID_TRANSITION") {
    super(code);
    this.name = "JourneyTransitionError";
  }
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function requiredDate(value: unknown): Date {
  const date = optionalDate(value);
  if (!date || Number.isNaN(date.getTime())) throw new Error("INVALID_JOURNEY_ROW");
  return date;
}

function journeyFrom(row: Record<string, unknown>): JourneyState {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    membershipId: row.membership_id === null || row.membership_id === undefined ? null : String(row.membership_id),
    journey: String(row.journey),
    instanceKey: String(row.instance_key),
    step: String(row.step),
    scheduledAt: requiredDate(row.scheduled_at),
    status: String(row.status) as JourneyState["status"],
    attemptCount: Number(row.attempt_count),
    claimedAt: optionalDate(row.claimed_at),
    claimExpiresAt: optionalDate(row.claim_expires_at),
    deliveryKey: String(row.delivery_key),
    errorCode: row.error_code === null || row.error_code === undefined ? null : String(row.error_code),
    completedAt: optionalDate(row.completed_at),
    createdAt: requiredDate(row.created_at),
    updatedAt: requiredDate(row.updated_at),
  };
}

function journeyClaimFrom(row: Record<string, unknown>): JourneyClaim {
  const priorStatus = String(row.prior_status ?? "");
  const claimSource = priorStatus === "scheduled"
    ? "scheduled"
    : priorStatus === "processing" ? "stale" : null;
  if (!claimSource) throw new Error("INVALID_JOURNEY_CLAIM_SOURCE");
  return {
    ...journeyFrom(row),
    claimSource,
    emailErrorCode: optionalString(row.email_error_code),
    whatsappErrorCode: optionalString(row.whatsapp_error_code),
  };
}

function firstJourney(result: unknown): JourneyState | null {
  const row = rowsFrom(result)[0];
  return row ? journeyFrom(row) : null;
}

function authorizeHistoryRead(actor: Actor, profileId: string): void {
  if (actor.kind === "system") {
    requireSystem(actor);
    return;
  }
  if (actor.kind === "member") {
    if (actor.profileId !== profileId) forbidden();
    return;
  }
  if (actor.kind === "staff" || actor.kind === "exco" || actor.kind === "superadmin") return;
  forbidden();
}

function requireAdminRetry(actor: Actor): asserts actor is Extract<Actor, {kind: "staff" | "exco" | "superadmin"}> {
  if (actor.kind !== "staff" && actor.kind !== "exco" && actor.kind !== "superadmin") forbidden();
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function transitionResult(result: unknown): JourneyState {
  const journey = firstJourney(result);
  if (!journey) throw new JourneyTransitionError();
  return journey;
}

export function createJourneysRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async enroll(
      actor: AutomationRepositoryActor,
      enrollment: JourneyEnrollment,
    ): Promise<JourneyEnrollmentDisposition> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        INSERT INTO ${journeyState}
          (profile_id, membership_id, journey, instance_key, step, scheduled_at, delivery_key)
        VALUES (
          ${enrollment.profileId}, ${enrollment.membershipId}, ${enrollment.journey}, ${enrollment.instanceKey},
          ${enrollment.step}, ${enrollment.scheduledAt}, ${enrollment.deliveryKey}
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `);
      return rowsFrom(result).length > 0 ? "created" : "existing";
    },

    async claimDue(
      actor: AutomationRepositoryActor,
      now: Date,
      limit: number,
      leaseMs: number,
    ): Promise<JourneyClaim[]> {
      requireAutomationSystem(actor);
      if (!Number.isInteger(limit) || limit <= 0 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
        throw new Error("INVALID_CLAIM_ARGUMENT");
      }
      const leaseEnd = new Date(now.getTime() + leaseMs);
      if (Number.isNaN(now.getTime()) || Number.isNaN(leaseEnd.getTime())) throw new Error("INVALID_CLAIM_ARGUMENT");
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const result = await transaction.execute(sql`
          WITH due AS (
            SELECT source.id, source.status AS prior_status,
                   email_delivery.error_code AS email_error_code,
                   whatsapp_delivery.error_code AS whatsapp_error_code
            FROM ${journeyState} AS source
            LEFT JOIN ${emailLog} AS email_delivery
              ON email_delivery.journey_state_id = source.id
             AND email_delivery.idempotency_key = source.delivery_key
            LEFT JOIN ${whatsappLog} AS whatsapp_delivery
              ON whatsapp_delivery.journey_state_id = source.id
             AND whatsapp_delivery.idempotency_key = source.delivery_key || ':whatsapp'
            WHERE (
              source.status = 'scheduled' AND source.scheduled_at <= ${now}
            ) OR (
              source.status = 'processing' AND source.claim_expires_at <= ${now}
            )
            ORDER BY source.scheduled_at, source.id
            FOR UPDATE OF source SKIP LOCKED
            LIMIT ${limit}
          )
          UPDATE ${journeyState} AS target
          SET status = 'processing',
              claimed_at = ${now},
              claim_expires_at = ${leaseEnd},
              attempt_count = target.attempt_count + 1,
              updated_at = now()
          FROM due
          WHERE target.id = due.id
          RETURNING target.*, due.prior_status,
                    due.email_error_code, due.whatsapp_error_code
        `);
        return rowsFrom(result).map(journeyClaimFrom);
      });
    },

    async markSent(actor: AutomationRepositoryActor, id: string, claimedAt: Date, completedAt: Date): Promise<JourneyState> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionResult(await database.execute(sql`
        UPDATE ${journeyState}
        SET status = 'sent', completed_at = ${completedAt}, claim_expires_at = NULL,
            error_code = NULL, updated_at = now()
        WHERE id = ${id} AND status = 'processing' AND claimed_at = ${claimedAt}
        RETURNING *
      `));
    },

    async markSkipped(actor: AutomationRepositoryActor, id: string, claimedAt: Date, reasonCode: string, completedAt: Date): Promise<JourneyState> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionResult(await database.execute(sql`
        UPDATE ${journeyState}
        SET status = 'skipped', error_code = ${reasonCode}, completed_at = ${completedAt},
            claim_expires_at = NULL, updated_at = now()
        WHERE id = ${id} AND status = 'processing' AND claimed_at = ${claimedAt}
        RETURNING *
      `));
    },

    async reschedule(actor: AutomationRepositoryActor, id: string, claimedAt: Date, scheduledAt: Date, errorCode: string): Promise<JourneyState> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionResult(await database.execute(sql`
        UPDATE ${journeyState}
        SET status = 'scheduled', scheduled_at = ${scheduledAt}, error_code = ${errorCode},
            claimed_at = NULL, claim_expires_at = NULL, completed_at = NULL, updated_at = now()
        WHERE id = ${id} AND status = 'processing' AND claimed_at = ${claimedAt}
        RETURNING *
      `));
    },

    async markFailed(
      actor: AutomationRepositoryActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
      completedAt: Date,
      task: StaffTaskInput,
    ): Promise<Readonly<{
      record: JourneyState;
      taskDisposition: "created" | "existing";
    }>> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const record = transitionResult(await transaction.execute(sql`
          UPDATE ${journeyState}
          SET status = 'failed', error_code = ${errorCode}, completed_at = ${completedAt},
              claim_expires_at = NULL, updated_at = now()
          WHERE id = ${id} AND status = 'processing' AND claimed_at = ${claimedAt}
          RETURNING *
        `));
        const taskResult = await transaction.execute(sql`
          INSERT INTO ${staffTasks}
            (profile_id, journey_state_id, kind, dedupe_key, summary_code)
          VALUES (
            ${task.profileId}, ${task.journeyStateId}, ${task.kind},
            ${task.dedupeKey}, ${task.summaryCode}
          )
          ON CONFLICT DO NOTHING
          RETURNING id
        `);
        return {
          record,
          taskDisposition: rowsFrom(taskResult).length > 0
            ? "created" as const
            : "existing" as const,
        };
      });
    },

    async retryFailed(actor: Actor, id: string, scheduledAt: Date): Promise<JourneyState> {
      requireAdminRetry(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const journey = transitionResult(await transaction.execute(sql`
          UPDATE ${journeyState}
          SET status = 'scheduled', scheduled_at = ${scheduledAt},
              error_code = NULL,
              claimed_at = NULL, claim_expires_at = NULL, completed_at = NULL, updated_at = now()
          WHERE id = ${id} AND status = 'failed'
          RETURNING *
        `));
        await transaction.execute(sql`
          UPDATE ${emailLog}
          SET error_code = CASE error_code
            WHEN 'retryable_network' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.retryable_network}
            WHEN 'retryable_rate_limit' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.retryable_rate_limit}
            WHEN 'retryable_server' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.retryable_server}
            WHEN 'provider_client_error' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.provider_client_error}
            WHEN 'provider_unclassified_failure' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.provider_unclassified_failure}
            ELSE error_code
          END
          WHERE journey_state_id = ${id}
            AND idempotency_key = ${journey.deliveryKey}
            AND status = 'failed'
            AND error_code IN (
              'retryable_network',
              'retryable_rate_limit',
              'retryable_server',
              'provider_client_error',
              'provider_unclassified_failure'
            )
        `);
        await transaction.execute(sql`
          UPDATE ${whatsappLog}
          SET error_code = CASE error_code
            WHEN 'retryable_network' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.retryable_network}
            WHEN 'retryable_rate_limit' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.retryable_rate_limit}
            WHEN 'retryable_server' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.retryable_server}
            WHEN 'provider_client_error' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.provider_client_error}
            WHEN 'provider_unclassified_failure' THEN ${ADMIN_RETRY_AUTHORIZATION_BY_FAILURE.provider_unclassified_failure}
            ELSE error_code
          END
          WHERE journey_state_id = ${id}
            AND idempotency_key = ${`${journey.deliveryKey}:whatsapp`}
            AND status = 'failed'
            AND error_code IN (
              'retryable_network',
              'retryable_rate_limit',
              'retryable_server',
              'provider_client_error',
              'provider_unclassified_failure'
            )
        `);
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            ${actor.profileId}, ${actor.kind}, 'journey.failed_retry_requested', 'journey_state', ${id},
            ${JSON.stringify({
              scheduledAt: scheduledAt.toISOString(),
              deliveryKey: journey.deliveryKey,
            })}::jsonb
          )
        `);
        return journey;
      });
    },

    async listForProfile(actor: Actor, profileId: string): Promise<JourneyState[]> {
      authorizeHistoryRead(actor, profileId);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT * FROM ${journeyState}
        WHERE profile_id = ${profileId}
        ORDER BY scheduled_at DESC, id DESC
      `);
      return rowsFrom(result).map(journeyFrom);
    },
  };
}

export type JourneysRepository = ReturnType<typeof createJourneysRepository>;
export const journeysRepository = createJourneysRepository();
export const journeysRepo = journeysRepository;
export const journeys = journeysRepository;
