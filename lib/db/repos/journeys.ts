import "server-only";

import {sql, type SQL} from "drizzle-orm";

import {
  ADMIN_RETRY_AUTHORIZATION_BY_FAILURE,
} from "@/lib/automation/delivery-retry-authorization";
import type {ScheduledJourneyStep} from "@/lib/automation/types";
import {
  requireAutomationSystem,
  requireAutomationCron,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {
  auditEvents,
  emailLog,
  journeyState,
  memberships,
  membershipApplications,
  staffTasks,
  whatsappLog,
  type JourneyState,
} from "@/lib/db/server-schema";
import {JOURNEYS} from "@/config/journeys";
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
    /** One bounded SQL statement checks current billing scope and persists the page checkpoint. */
    async enrollRenewalPage(
      actor: AutomationRepositoryActor,
      enrollments: readonly JourneyEnrollment[],
    ): Promise<Readonly<{ created: number; existing: number; skipped: number }>> {
      requireAutomationCron(actor);
      const keys = new Set(JOURNEYS.renewal.map((step) => step.key as string));
      if (
        enrollments.length < 1 ||
        enrollments.length > 2000 ||
        enrollments.some(
          (row) =>
            row.journey !== "renewal" ||
            !row.membershipId ||
            !keys.has(row.step) ||
            !Number.isFinite(row.scheduledAt.getTime()),
        )
      )
        throw Error("INVALID_RENEWAL_CHECKPOINT");
      const source = enrollments.map((row) => ({
        profile_id: row.profileId,
        membership_id: row.membershipId,
        journey: row.journey,
        instance_key: row.instanceKey,
        step: row.step,
        scheduled_at: row.scheduledAt.toISOString(),
        delivery_key: row.deliveryKey,
      }));
      const db = await loadDatabase();
      const row = rowsFrom(
        await db.execute(sql`
         WITH source AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(source)}::jsonb) AS s(profile_id text,membership_id text,journey text,instance_key text,step text,scheduled_at timestamptz,delivery_key text)),
         correlated AS MATERIALIZED (SELECT s.*, 'period:'||to_char(m.billing_period_end AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS legacy_instance_key FROM source s
          JOIN ${memberships} m ON m.id=s.membership_id::uuid LEFT JOIN ${membershipApplications} a ON a.id=m.application_id
          WHERE COALESCE(m.owner_user_id,a.applicant_user_id)=s.profile_id AND m.status IN ('active','past_due') AND m.cancel_at_period_end=false AND m.billing_interval<>'none'
           AND m.grant_effective_at IS NULL AND m.grant_expires_at IS NULL
           AND s.instance_key='period:'||m.id::text||':'||to_char(m.billing_period_end AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FOR SHARE OF m),
         eligible AS (SELECT c.* FROM correlated c WHERE NOT EXISTS (SELECT 1 FROM ${journeyState} j WHERE j.membership_id=c.membership_id::uuid AND j.profile_id=c.profile_id AND j.journey='renewal' AND j.instance_key=c.legacy_instance_key AND j.step=c.step)),
         inserted AS (INSERT INTO ${journeyState}(profile_id,membership_id,journey,instance_key,step,scheduled_at,delivery_key)
          SELECT profile_id,membership_id::uuid,journey,instance_key,step,scheduled_at,delivery_key FROM eligible ON CONFLICT DO NOTHING RETURNING id)
         SELECT (SELECT count(*) FROM inserted)::int AS created,((SELECT count(*) FROM correlated)-(SELECT count(*) FROM inserted))::int AS existing,((SELECT count(*) FROM source)-(SELECT count(*) FROM correlated))::int AS skipped
        `),
      )[0];
      if (!row) throw Error("INVALID_RENEWAL_CHECKPOINT_RESULT");
      const result = {
        created: Number(row.created),
        existing: Number(row.existing),
        skipped: Number(row.skipped),
      };
      if (
        Object.values(result).some(
          (value) => !Number.isSafeInteger(value) || value < 0,
        ) ||
        result.created + result.existing + result.skipped !== enrollments.length
      )
        throw Error("INVALID_RENEWAL_CHECKPOINT_RESULT");
      return result;
    },

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
        const unknown = rowsFrom(await transaction.execute(sql`
          SELECT id, delivery_key FROM ${journeyState} WHERE id = ${id} AND status = 'failed' FOR UPDATE
        `));
        if (!unknown.length || typeof unknown[0].delivery_key !== "string") throw new JourneyTransitionError();
        const effectKey = unknown[0].delivery_key;
        const effects = rowsFrom(await transaction.execute(sql`
          SELECT 1 FROM (
            SELECT status, error_code FROM ${emailLog} WHERE journey_state_id = ${id} OR idempotency_key = ${effectKey}
            UNION ALL
            SELECT status, error_code FROM ${whatsappLog} WHERE journey_state_id = ${id} OR idempotency_key = ${effectKey + ":whatsapp"}
          ) AS delivery
          WHERE status = 'processing' OR (status = 'failed' AND error_code IN (
            'retryable_network','retryable_server','provider_unclassified_failure',
            'provider_acceptance_uncertain','admin_retry_retryable_network',
            'admin_retry_retryable_server','admin_retry_provider_unclassified_failure'
          )) LIMIT 1
        `));
        if (effects.length) throw new Error("DELIVERY_RECONCILIATION_REQUIRED");
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
