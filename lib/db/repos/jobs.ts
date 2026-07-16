import "server-only";

import {and, eq, sql} from "drizzle-orm";

import type {WebhookLifecycleCommand} from "@/lib/billing/webhook-service";
import {auditEvents, billingAttempts, jobs as jobsTable, memberships, type Job} from "@/lib/db/server-schema";
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

function resultFlags(result: unknown): {claimed: boolean; matched: boolean} {
  const row = resultRows(result)[0];
  if (!row) return {claimed: false, matched: false};
  if (Array.isArray(row)) return {claimed: Boolean(row[0]), matched: Boolean(row[1])};
  const value = row as Record<string, unknown>;
  return {claimed: Boolean(value.claimed), matched: Boolean(value.matched)};
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

export const jobsRepository = {
  async getByRunKey(actor: Actor, runKey: string): Promise<Job | null> {
    requireSystem(actor);
    const db = await getDb();
    const rows = await db.select().from(jobsTable).where(and(eq(jobsTable.runKey, runKey), sql`true`)).limit(1);
    return rows[0] ?? null;
  },

  async claim(actor: Actor, runKey: string, kind: string): Promise<JobClaimResult> {
    requireSystem(actor);
    const db = await getDb();
    const existing = await db.select({id: jobsTable.id}).from(jobsTable).where(and(eq(jobsTable.runKey, runKey), sql`true`)).limit(1);
    if (existing.length > 0) return "duplicate";
    try {
      await db.insert(jobsTable).values({runKey, kind, state: "processing", attemptCount: 0}).returning({id: jobsTable.id});
      return "claimed";
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as {code?: string}).code === "23505") return "duplicate";
      throw error;
    }
  },

  async complete(actor: Actor, runKey: string): Promise<Job | null> {
    requireSystem(actor);
    const db = await getDb();
    const rows = await db.update(jobsTable)
      .set({state: "completed", completedAt: new Date(), updatedAt: new Date()})
      .where(and(eq(jobsTable.runKey, runKey), sql`true`)).returning();
    return rows[0] ?? null;
  },

  async fail(actor: Actor, runKey: string, errorMessage: string): Promise<Job | null> {
    requireSystem(actor);
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
        const result = await tx.execute(sql`
          WITH claimed AS (
            INSERT INTO ${jobsTable} (${jobsTable.runKey}, ${jobsTable.kind}, ${jobsTable.state}, ${jobsTable.attemptCount})
            VALUES (${command.eventId}, ${command.eventType}, 'processing', 1)
            ON CONFLICT (${jobsTable.runKey}) DO UPDATE
              SET ${jobsTable.state} = 'processing', ${jobsTable.attemptCount} = ${jobsTable.attemptCount} + 1,
                  ${jobsTable.lastError} = NULL, ${jobsTable.updatedAt} = now()
              WHERE ${jobsTable.state} = 'failed'
            RETURNING ${jobsTable.id}
          ),
          locked_membership AS (
            SELECT ${memberships.id}, ${memberships.status}
            FROM ${memberships} CROSS JOIN claimed
            WHERE ${memberships.id} = ${command.membershipId}
              AND ${memberships.applicationId} = ${command.applicationId}
              AND ${memberships.planCode} = ${command.planCode}
              AND ((
                ${command.eventType} = 'checkout.session.completed'
                AND (${memberships.stripeCustomerId} IS NULL OR ${memberships.stripeCustomerId} = ${command.stripeCustomerId})
                AND (${memberships.stripeSubscriptionId} IS NULL OR ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId})
              ) OR (
                ${command.eventType} <> 'checkout.session.completed'
                AND ${memberships.stripeCustomerId} = ${command.stripeCustomerId}
                AND ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId}
              ))
            FOR UPDATE OF ${memberships}
          ),
          latest_event AS (
            SELECT COALESCE(MAX((${auditEvents.metadata}->>'stripeCreated')::bigint), -1) AS stripe_created
            FROM locked_membership LEFT JOIN ${auditEvents}
              ON ${auditEvents.targetType} = 'membership' AND ${auditEvents.targetId} = locked_membership.id
              AND ${auditEvents.action} IN ('stripe.webhook.processed', 'stripe.webhook.ignored_stale')
          ),
          candidate AS (
            SELECT locked_membership.id, locked_membership.status, latest_event.stripe_created,
              (${command.eventCreated} < latest_event.stripe_created) AS stale
            FROM locked_membership CROSS JOIN latest_event
          ),
          locked_attempt AS (
            SELECT ${billingAttempts.id}
            FROM ${billingAttempts} CROSS JOIN candidate
            WHERE ${command.eventType} = 'checkout.session.completed'
              AND ${billingAttempts.membershipId} = candidate.id
              AND ${billingAttempts.state} = 'active'
              AND ${billingAttempts.stripeCheckoutSessionId} = ${command.stripeCheckoutSessionId}
            FOR UPDATE OF ${billingAttempts}
          ),
          matched AS (
            SELECT candidate.id, candidate.stale
            FROM candidate
            WHERE (candidate.stale OR candidate.status::text IN (${sql.join(allowedSources.map((status) => sql`${status}`), sql`, `)}))
              AND (${command.eventType} <> 'checkout.session.completed' OR EXISTS (SELECT 1 FROM locked_attempt))
          ),
          updated AS (
            UPDATE ${memberships}
            SET ${memberships.status} = ${command.nextStatus}::membership_status,
                ${memberships.stripeCustomerId} = ${command.stripeCustomerId},
                ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId},
                ${memberships.billingPeriodStart} = COALESCE(${command.billingPeriodStart}, ${memberships.billingPeriodStart}),
                ${memberships.billingPeriodEnd} = COALESCE(${command.billingPeriodEnd}, ${memberships.billingPeriodEnd}),
                ${memberships.cancelAtPeriodEnd} = ${command.cancelAtPeriodEnd},
                ${memberships.updatedAt} = now()
            FROM matched
            WHERE ${memberships.id} = matched.id AND NOT matched.stale
            RETURNING ${memberships.id}
          ),
          completed_attempt AS (
            UPDATE ${billingAttempts}
            SET ${billingAttempts.state} = 'completed', ${billingAttempts.endedAt} = now(), ${billingAttempts.updatedAt} = now()
            FROM updated, locked_attempt
            WHERE ${command.eventType} = 'checkout.session.completed'
              AND ${billingAttempts.id} = locked_attempt.id
              AND ${billingAttempts.membershipId} = updated.id
            RETURNING ${billingAttempts.id}
          ),
          outcome AS (
            SELECT matched.id, matched.stale FROM matched
          ),
          audited AS (
            INSERT INTO ${auditEvents} (${auditEvents.actorType}, ${auditEvents.action}, ${auditEvents.targetType}, ${auditEvents.targetId}, ${auditEvents.requestId}, ${auditEvents.metadata})
            SELECT 'system', CASE WHEN outcome.stale THEN 'stripe.webhook.ignored_stale' ELSE 'stripe.webhook.processed' END,
              'membership', outcome.id, ${command.eventId},
              jsonb_build_object('eventType', ${command.eventType}, 'stripeCreated', ${command.eventCreated}, 'status', ${command.nextStatus})
            FROM outcome RETURNING ${auditEvents.id}
          ),
          completed AS (
            UPDATE ${jobsTable}
            SET ${jobsTable.state} = 'completed', ${jobsTable.completedAt} = now(), ${jobsTable.updatedAt} = now()
            FROM claimed WHERE ${jobsTable.id} = claimed.id AND EXISTS (SELECT 1 FROM audited)
            RETURNING ${jobsTable.id}
          )
          SELECT EXISTS(SELECT 1 FROM claimed) AS claimed, EXISTS(SELECT 1 FROM outcome) AS matched
        `);
        const flags = resultFlags(result);
        if (!flags.claimed) return "duplicate";
        if (!flags.matched) throw new WebhookCorrelationError();
        return "processed";
      });
    } catch (error) {
      if (error instanceof WebhookCorrelationError) throw error;
      try {
        await db.insert(jobsTable).values({runKey: command.eventId, kind: command.eventType, state: "failed", attemptCount: 1, lastError: redactedError(error)})
          .onConflictDoUpdate({target: jobsTable.runKey, set: {state: "failed", lastError: redactedError(error), updatedAt: new Date()}});
      } catch { /* Preserve the original transient error when failure recording is unavailable. */ }
      throw error;
    }
  },
};

export const jobsRepo = jobsRepository;
export const jobs = jobsRepository;
