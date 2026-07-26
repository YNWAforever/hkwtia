import "server-only";

import {sql} from "drizzle-orm";

import type {ScheduledJourneyStep} from "@/lib/automation/types";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {auditEvents, journeyState, memberships, staffTasks} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";

export type DunningLapseInput = Readonly<{
  membershipId: string;
  profileId: string;
  journeyStateId: string;
  instanceKey: string;
  executedAt: Date;
  winbackSteps: readonly ScheduledJourneyStep[];
}>;

export type DunningLapseDisposition = Readonly<{
  disposition: "lapsed" | "existing" | "resolved";
  createdTasks: number;
  createdSteps: number;
}>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function resolved(): DunningLapseDisposition {
  return {disposition: "resolved", createdTasks: 0, createdSteps: 0};
}

function serializedWinbackSteps(input: DunningLapseInput): string {
  return JSON.stringify(input.winbackSteps.map((step) => ({
    profileId: step.profileId,
    membershipId: step.membershipId,
    journey: step.journey,
    instanceKey: step.instanceKey,
    step: step.step,
    scheduledAt: step.scheduledAt.toISOString(),
    deliveryKey: step.deliveryKey,
  })));
}

async function createRepairableSideEffects(
  transaction: AutomationSqlExecutor,
  input: DunningLapseInput,
): Promise<Pick<DunningLapseDisposition, "createdTasks" | "createdSteps">> {
  const taskRows = rowsFrom(await transaction.execute(sql`
    INSERT INTO ${staffTasks}
      (profile_id, journey_state_id, kind, dedupe_key, summary_code, status)
    VALUES (
      ${input.profileId},
      ${input.journeyStateId},
      'dunning_lapse',
      ${`${input.instanceKey}:staff-task`},
      'membership_expired_after_dunning',
      'open'
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `));

  const stepRows = rowsFrom(await transaction.execute(sql`
    INSERT INTO ${journeyState}
      (profile_id, membership_id, journey, instance_key, step, scheduled_at, delivery_key)
    SELECT
      item.profile_id,
      item.membership_id::uuid,
      item.journey,
      item.instance_key,
      item.step,
      item.scheduled_at::timestamptz,
      item.delivery_key
    FROM jsonb_to_recordset(${serializedWinbackSteps(input)}::jsonb) AS item(
      profile_id text,
      membership_id text,
      journey text,
      instance_key text,
      step text,
      scheduled_at text,
      delivery_key text
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `));

  return {
    createdTasks: taskRows.length,
    createdSteps: stepRows.length,
  };
}

export function createDunningLapseRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async lapseDunningEpisode(
      actor: AutomationRepositoryActor,
      input: DunningLapseInput,
    ): Promise<DunningLapseDisposition> {
      requireAutomationSystem(actor);
      const database = await loadDatabase();
      const requestId = `dunning-lapse:${input.journeyStateId}`;

      return database.transaction(async (transaction) => {
        const membership = rowsFrom(await transaction.execute(sql`
          SELECT status
          FROM ${memberships}
          WHERE id = ${input.membershipId}
          FOR UPDATE
        `))[0];
        if (!membership) return resolved();

        const status = String(membership.status);
        let disposition: DunningLapseDisposition["disposition"];
        if (status === "past_due") {
          const updated = rowsFrom(await transaction.execute(sql`
            UPDATE ${memberships}
            SET status = 'expired', updated_at = ${input.executedAt}
            WHERE id = ${input.membershipId} AND status = 'past_due'
            RETURNING id
          `))[0];
          if (!updated) return resolved();

          await transaction.execute(sql`
            INSERT INTO ${auditEvents}
              (actor_user_id, actor_type, action, target_type, target_id, request_id, metadata)
            VALUES (
              NULL,
              'system',
              'membership.lapsed_by_dunning',
              'membership',
              ${input.membershipId},
              ${requestId},
              ${JSON.stringify({lapseIdentity: input.instanceKey})}::jsonb
            )
            RETURNING id
          `);
          disposition = "lapsed";
        } else if (status === "expired") {
          const matchingLapse = rowsFrom(await transaction.execute(sql`
            SELECT id
            FROM ${auditEvents}
            WHERE target_type = 'membership'
              AND target_id = ${input.membershipId}
              AND action = 'membership.lapsed_by_dunning'
              AND request_id = ${requestId}
            LIMIT 1
          `))[0];
          if (!matchingLapse) return resolved();
          disposition = "existing";
        } else {
          return resolved();
        }

        const created = await createRepairableSideEffects(transaction, input);
        return {disposition, ...created};
      });
    },
  };
}

export type DunningLapseRepository = ReturnType<typeof createDunningLapseRepository>;
export const dunningLapseRepository = createDunningLapseRepository();
