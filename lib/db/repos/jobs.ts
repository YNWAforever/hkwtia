import "server-only";

import {and, eq, sql, type SQL} from "drizzle-orm";

import {scheduleWebhookLifecycleEnrollment} from "@/lib/automation/enrollment";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";

import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {auditEvents, billingAttempts, engagementEvents, jobs as jobsTable, journeyState, membershipApplications, memberships, type Job} from "@/lib/db/server-schema";
import {getDb, requireSystem} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

export type JobClaimResult = "claimed" | "duplicate";

export class WebhookCorrelationError extends Error {
  readonly code = "INVALID_WEBHOOK_EVENT";
  constructor() { super("INVALID_WEBHOOK_EVENT"); this.name = "WebhookCorrelationError"; }
}

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as {rows?: unknown}).rows;
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function resultRow(result: unknown): Record<string, unknown> | undefined {
  const row = resultRows(result)[0];
  return row && !Array.isArray(row) && typeof row === "object" ? row as Record<string, unknown> : undefined;
}

function requiredString(row: Record<string, unknown> | undefined, key: string): string {
  const value = row?.[key];
  if (typeof value !== "string" || value.length === 0) throw new Error("WEBHOOK_MUTATION_FAILED");
  return value;
}

function requiredOrdinal(row: Record<string, unknown> | undefined, key: string): number {
  const value = Number(row?.[key]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("WEBHOOK_MUTATION_FAILED");
  return value;
}

function isStale(command: WebhookLifecycleCommand, latest: Record<string, unknown> | undefined): boolean {
  if (!latest) return false;
  const latestCreated = Number(latest.stripe_created);
  const latestEventId = latest.event_id;
  if (!Number.isSafeInteger(latestCreated) || typeof latestEventId !== "string") throw new Error("WEBHOOK_AUDIT_INVALID");
  return command.eventCreated < latestCreated
    || (command.eventCreated === latestCreated && command.eventId <= latestEventId);
}

function lifecycleSources(command: WebhookLifecycleCommand): readonly string[] {
  switch (command.nextStatus) {
    case "active": return ["pending_payment", "pending_review", "active", "past_due", "cancel_at_period_end"];
    case "past_due": return ["active", "past_due", "cancel_at_period_end"];
    case "cancel_at_period_end": return ["active", "past_due", "cancel_at_period_end"];
    case "cancelled": return ["pending_review", "active", "past_due", "cancel_at_period_end", "cancelled"];
    default: return [];
  }
}

function redactedError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return `WEBHOOK_TRANSIENT:${error.code.slice(0, 32)}`;
  }
  return "WEBHOOK_TRANSIENT";
}

type LifecycleExecutor = Readonly<{execute: (query: SQL) => PromiseLike<unknown>}>;

async function insertWebhookLifecycleEnrollment(
  actor: Actor,
  executor: LifecycleExecutor,
  command: WebhookLifecycleCommand,
  membership: Record<string, unknown>,
): Promise<void> {
  requireSystem(actor);
  const profileId = requiredString(membership, "profile_id");
  const scheduled = scheduleWebhookLifecycleEnrollment({
    membershipId: command.membershipId,
    profileId,
    nextStatus: command.nextStatus,
    eventId: command.eventId,
    eventCreated: command.eventCreated,
  });
  if (scheduled.length === 0) return;
  const rows = scheduled.map((step) => ({
    profile_id: step.profileId,
    membership_id: step.membershipId,
    journey: step.journey,
    instance_key: step.instanceKey,
    step: step.step,
    scheduled_at: step.scheduledAt.toISOString(),
    delivery_key: step.deliveryKey,
  }));
  await executor.execute(sql`
    INSERT INTO ${journeyState}
      (profile_id, membership_id, journey, instance_key, step, scheduled_at, delivery_key)
    SELECT
      value.profile_id,
      value.membership_id::uuid,
      value.journey,
      value.instance_key,
      value.step,
      value.scheduled_at::timestamptz,
      value.delivery_key
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS value(
      profile_id text,
      membership_id text,
      journey text,
      instance_key text,
      step text,
      scheduled_at text,
      delivery_key text
    )
    ON CONFLICT DO NOTHING
  `);
}

export const jobsRepository = {
  async getByRunKey(actor: Actor, runKey: string): Promise<Job | null> {
    requireSystem(actor);
    const db = await getDb();
    const rows = await db.select().from(jobsTable).where(and(eq(jobsTable.runKey, runKey), sql`true`)).limit(1);
    return rows[0] ?? null;
  },

  async claim(actor: AutomationRepositoryActor, runKey: string, kind: string): Promise<JobClaimResult> {
    requireAutomationSystem(actor);
    const db = await getDb();
    const claim = resultRow(await db.execute(sql`
      INSERT INTO ${jobsTable} ("run_key", "kind", "state", "attempt_count")
      VALUES (${runKey}, ${kind}, 'processing', 1)
      ON CONFLICT ("run_key") DO UPDATE
      SET "kind" = EXCLUDED."kind", "state" = 'processing',
          "attempt_count" = ${jobsTable.attemptCount} + 1,
          "last_error" = NULL, "completed_at" = NULL, "updated_at" = now()
      WHERE ${jobsTable.state} = 'failed'
      RETURNING ${jobsTable.id} AS job_id
    `));
    return claim ? "claimed" : "duplicate";
  },

  async complete(actor: AutomationRepositoryActor, runKey: string): Promise<Job | null> {
    requireAutomationSystem(actor);
    const db = await getDb();
    const rows = await db.update(jobsTable)
      .set({state: "completed", completedAt: new Date(), updatedAt: new Date()})
      .where(and(eq(jobsTable.runKey, runKey), sql`true`)).returning();
    return rows[0] ?? null;
  },

  async fail(actor: AutomationRepositoryActor, runKey: string, errorMessage: string): Promise<Job | null> {
    requireAutomationSystem(actor);
    const db = await getDb();
    const rows = await db.update(jobsTable)
      .set({state: "failed", lastError: errorMessage, updatedAt: new Date()})
      .where(and(eq(jobsTable.runKey, runKey), sql`true`)).returning();
    return rows[0] ?? null;
  },

  async processWebhookLifecycle(actor: Actor, command: WebhookLifecycleCommand): Promise<"processed" | "duplicate"> {
    requireSystem(actor);
    const db = await getDb();
    try {
      return await db.transaction(async (tx) => {
        const allowedSources = lifecycleSources(command);
        const claim = resultRow(await tx.execute(sql`INSERT INTO ${jobsTable}
          ("run_key", "kind", "state", "attempt_count")
          VALUES (${command.eventId}, ${command.eventType}, 'processing', 1)
          ON CONFLICT ("run_key") DO UPDATE
          SET "state" = 'processing', "attempt_count" = ${jobsTable.attemptCount} + 1,
              "last_error" = NULL, "completed_at" = NULL, "updated_at" = now()
          WHERE ${jobsTable.state} = 'failed'
          RETURNING ${jobsTable.id} AS job_id`));
        if (!claim) return "duplicate";
        const jobId = requiredString(claim, "job_id");

        const membership = resultRow(await tx.execute(sql`SELECT ${memberships.id} AS membership_id, ${memberships.status} AS status,
            COALESCE(${memberships.ownerUserId}, ${membershipApplications.applicantUserId}) AS profile_id,
            ${memberships.companyId} AS company_id
          FROM ${memberships}
          LEFT JOIN ${membershipApplications} ON ${membershipApplications.id} = ${memberships.applicationId}
          WHERE ${memberships.id} = ${command.membershipId}
            AND ${memberships.applicationId} = ${command.applicationId}
            AND ${memberships.planCode} = ${command.planCode}
            AND ((${command.eventType} = 'checkout.session.completed'
              AND (${memberships.stripeCustomerId} IS NULL OR ${memberships.stripeCustomerId} = ${command.stripeCustomerId})
              AND (${memberships.stripeSubscriptionId} IS NULL OR ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId}))
            OR (${command.eventType} <> 'checkout.session.completed'
              AND ${memberships.stripeCustomerId} = ${command.stripeCustomerId}
              AND ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId}))
          FOR UPDATE OF ${memberships}`));
        if (!membership) throw new WebhookCorrelationError();

        const latest = resultRow(await tx.execute(sql`SELECT (${auditEvents.metadata}->>'stripeCreated')::bigint AS stripe_created,
            ${auditEvents.requestId} AS event_id
          FROM ${auditEvents}
          WHERE ${auditEvents.targetType} = 'membership' AND ${auditEvents.targetId} = ${command.membershipId}
            AND ${auditEvents.action} IN ('stripe.webhook.processed', 'stripe.webhook.ignored_stale')
          ORDER BY stripe_created DESC, event_id DESC LIMIT 1`));
        const stale = isStale(command, latest);

        let attemptId: string | null = null;
        if (command.eventType === 'checkout.session.completed') {
          const attempt = resultRow(await tx.execute(sql`SELECT ${billingAttempts.id} AS attempt_id
            FROM ${billingAttempts}
            WHERE ${billingAttempts.membershipId} = ${command.membershipId}
              AND ${billingAttempts.state} = 'active'
              AND ${billingAttempts.stripeCheckoutSessionId} = ${command.stripeCheckoutSessionId}
            FOR UPDATE`));
          if (!attempt) throw new WebhookCorrelationError();
          attemptId = requiredString(attempt, "attempt_id");
        }

        const currentStatus = requiredString(membership, "status");
        if (!stale && !allowedSources.includes(currentStatus)) throw new WebhookCorrelationError();
        if (!stale) {
          const updated = resultRow(await tx.execute(sql`UPDATE ${memberships}
            SET "status" = ${command.nextStatus}::membership_status,
                "stripe_customer_id" = ${command.stripeCustomerId},
                "stripe_subscription_id" = ${command.stripeSubscriptionId},
                "billing_period_start" = COALESCE(${command.billingPeriodStart}, ${memberships.billingPeriodStart}),
                "billing_period_end" = COALESCE(${command.billingPeriodEnd}, ${memberships.billingPeriodEnd}),
                "cancel_at_period_end" = ${command.cancelAtPeriodEnd}, "updated_at" = now()
            WHERE ${memberships.id} = ${command.membershipId}
            RETURNING ${memberships.id} AS membership_id`));
          if (!updated) throw new Error("WEBHOOK_MUTATION_FAILED");
          if (attemptId) {
            const completedAttempt = resultRow(await tx.execute(sql`UPDATE ${billingAttempts}
              SET "state" = 'completed', "ended_at" = now(), "updated_at" = now()
              WHERE ${billingAttempts.id} = ${attemptId} AND ${billingAttempts.state} = 'active'
              RETURNING ${billingAttempts.id} AS attempt_id`));
            if (!completedAttempt) throw new Error("WEBHOOK_MUTATION_FAILED");
          }
          await insertWebhookLifecycleEnrollment(actor, tx, command, membership);
        }

        if (command.isRenewal && (command.eventType === 'invoice.paid' || command.eventType === 'invoice.payment_failed')) {
          const profileId = requiredString(membership, "profile_id");
          const periodStart = command.billingPeriodStart?.toISOString();
          const periodEnd = command.billingPeriodEnd?.toISOString();
          if (!periodStart || !periodEnd) throw new WebhookCorrelationError();
          const ordinal = resultRow(await tx.execute(sql`WITH valid_renewals AS (
              SELECT ${engagementEvents.metadata}->>'periodStart' AS period_start,
                CASE WHEN jsonb_typeof(${engagementEvents.metadata}->'renewalOrdinal') = 'number'
                    AND ${engagementEvents.metadata}->>'renewalOrdinal' ~ '^[1-9][0-9]{0,9}$'
                    AND length(${engagementEvents.metadata}->>'renewalOrdinal') <= 10
                    AND (length(${engagementEvents.metadata}->>'renewalOrdinal') < 10
                      OR ${engagementEvents.metadata}->>'renewalOrdinal' <= '2147483647')
                  THEN (${engagementEvents.metadata}->>'renewalOrdinal')::int
                  ELSE NULL
                END AS renewal_ordinal
              FROM ${engagementEvents}
              WHERE ${engagementEvents.metadata}->>'membershipId' = ${command.membershipId}
                AND ${engagementEvents.type} IN ('renewal_paid', 'renewal_failed')
            )
            SELECT COALESCE(
              MAX(renewal_ordinal) FILTER (WHERE period_start = ${periodStart}),
              COALESCE(MAX(renewal_ordinal), 0) + 1
            ) AS renewal_ordinal
            FROM valid_renewals`));
          const renewalOrdinal = requiredOrdinal(ordinal, "renewal_ordinal");          const engagementType = command.eventType === 'invoice.paid' ? 'renewal_paid' : 'renewal_failed';
          const engagementPoints = command.eventType === 'invoice.paid' ? 10 : -10;
          const engagement = resultRow(await tx.execute(sql`INSERT INTO ${engagementEvents}
            ("profile_id", "company_id", "type", "points", "metadata", "occurred_at")
            VALUES (${profileId}, ${membership.company_id ?? null}, ${engagementType}, ${engagementPoints},
              jsonb_build_object('membershipId', ${command.membershipId}, 'periodStart', ${periodStart},
                'periodEnd', ${periodEnd}, 'renewalOrdinal', ${renewalOrdinal}),
              to_timestamp(${command.eventCreated}))
            RETURNING ${engagementEvents.id} AS engagement_id`));
          if (!engagement) throw new Error("WEBHOOK_MUTATION_FAILED");
        }
        const action = stale ? 'stripe.webhook.ignored_stale' : 'stripe.webhook.processed';
        const audit = resultRow(await tx.execute(sql`INSERT INTO ${auditEvents}
          ("actor_type", "action", "target_type", "target_id", "request_id", "metadata")
          VALUES ('system', ${action}, 'membership', ${command.membershipId}, ${command.eventId},
            jsonb_build_object('eventType', ${command.eventType}, 'stripeCreated', ${command.eventCreated}, 'eventId', ${command.eventId}, 'status', ${command.nextStatus}))
          RETURNING ${auditEvents.id} AS audit_id`));
        if (!audit) throw new Error("WEBHOOK_MUTATION_FAILED");
        const completed = resultRow(await tx.execute(sql`UPDATE ${jobsTable}
          SET "state" = 'completed', "completed_at" = now(), "updated_at" = now()
          WHERE ${jobsTable.id} = ${jobId} AND ${jobsTable.state} = 'processing'
          RETURNING ${jobsTable.id} AS job_id`));
        if (!completed) throw new Error("WEBHOOK_MUTATION_FAILED");
        return "processed";
      }, {isolationLevel: "read committed"});
    } catch (error) {
      if (error instanceof WebhookCorrelationError) throw error;
      try {
        const summary = redactedError(error);
        await db.execute(sql`INSERT INTO ${jobsTable}
          ("run_key", "kind", "state", "attempt_count", "last_error")
          VALUES (${command.eventId}, ${command.eventType}, 'failed', 1, ${summary})
          ON CONFLICT ("run_key") DO UPDATE
          SET "attempt_count" = ${jobsTable.attemptCount} + 1,
              "last_error" = ${summary}, "updated_at" = now()
          WHERE ${jobsTable.state} = 'failed'
          RETURNING ${jobsTable.id}`);
      } catch { /* Preserve the original transient error when failure recording is unavailable. */ }
      throw error;
    }
  },
};

export const jobsRepo = jobsRepository;
export const jobs = jobsRepository;
