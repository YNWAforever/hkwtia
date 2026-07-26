import "server-only";

import {sql, type SQL} from "drizzle-orm";

import type {ScheduledJourneyStep} from "@/lib/automation/types";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {auditEvents, journeyState, type JourneyState} from "@/lib/db/server-schema";
import {forbidden, getDb, requireSystem} from "@/lib/db/repos/common";
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
export type JourneyClaim = JourneyState & Readonly<{claimSource: JourneyClaimSource}>;

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
  return {...journeyFrom(row), claimSource};
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
            SELECT id, status AS prior_status FROM ${journeyState}
            WHERE (
              status = 'scheduled' AND scheduled_at <= ${now}
            ) OR (
              status = 'processing' AND claim_expires_at <= ${now}
            )
            ORDER BY scheduled_at, id
            FOR UPDATE SKIP LOCKED
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
          RETURNING target.*, due.prior_status
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

    async markFailed(actor: AutomationRepositoryActor, id: string, claimedAt: Date, errorCode: string, completedAt: Date): Promise<JourneyState> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      return transitionResult(await database.execute(sql`
        UPDATE ${journeyState}
        SET status = 'failed', error_code = ${errorCode}, completed_at = ${completedAt},
            claim_expires_at = NULL, updated_at = now()
        WHERE id = ${id} AND status = 'processing' AND claimed_at = ${claimedAt}
        RETURNING *
      `));
    },

    async retryFailed(actor: Actor, id: string, scheduledAt: Date): Promise<JourneyState> {
      requireAdminRetry(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const journey = transitionResult(await transaction.execute(sql`
          UPDATE ${journeyState}
          SET status = 'scheduled', scheduled_at = ${scheduledAt}, error_code = NULL,
              claimed_at = NULL, claim_expires_at = NULL, completed_at = NULL, updated_at = now()
          WHERE id = ${id} AND status = 'failed'
          RETURNING *
        `));
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            ${actor.profileId}, ${actor.kind}, 'journey.failed_retry_requested', 'journey_state', ${id},
            ${JSON.stringify({scheduledAt: scheduledAt.toISOString()})}::jsonb
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
