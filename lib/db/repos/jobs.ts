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

function resultRow(result: unknown): Record<string, unknown> | undefined {
  const row = resultRows(result)[0];
  return row && !Array.isArray(row) && typeof row === "object" ? row as Record<string, unknown> : undefined;
}

function requiredString(row: Record<string, unknown> | undefined, key: string): string {
  const value = row?.[key];
  if (typeof value !== "string" || value.length === 0) throw new Error("WEBHOOK_MUTATION_FAILED");
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
        const claim = resultRow(await tx.execute(sql`INSERT INTO ${jobsTable}
          (${jobsTable.runKey}, ${jobsTable.kind}, ${jobsTable.state}, ${jobsTable.attemptCount})
          VALUES (${command.eventId}, ${command.eventType}, 'processing', 1)
          ON CONFLICT (${jobsTable.runKey}) DO UPDATE
          SET ${jobsTable.state} = 'processing', ${jobsTable.attemptCount} = ${jobsTable.attemptCount} + 1,
              ${jobsTable.lastError} = NULL, ${jobsTable.completedAt} = NULL, ${jobsTable.updatedAt} = now()
          WHERE ${jobsTable.state} = 'failed'
          RETURNING ${jobsTable.id} AS job_id`));
        if (!claim) return "duplicate";
        const jobId = requiredString(claim, "job_id");

        const membership = resultRow(await tx.execute(sql`SELECT ${memberships.id} AS membership_id, ${memberships.status} AS status
          FROM ${memberships}
          WHERE ${memberships.id} = ${command.membershipId}
            AND ${memberships.applicationId} = ${command.applicationId}
            AND ${memberships.planCode} = ${command.planCode}
            AND ((${command.eventType} = 'checkout.session.completed'
              AND (${memberships.stripeCustomerId} IS NULL OR ${memberships.stripeCustomerId} = ${command.stripeCustomerId})
              AND (${memberships.stripeSubscriptionId} IS NULL OR ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId}))
            OR (${command.eventType} <> 'checkout.session.completed'
              AND ${memberships.stripeCustomerId} = ${command.stripeCustomerId}
              AND ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId}))
          FOR UPDATE`));
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
            SET ${memberships.status} = ${command.nextStatus}::membership_status,
                ${memberships.stripeCustomerId} = ${command.stripeCustomerId},
                ${memberships.stripeSubscriptionId} = ${command.stripeSubscriptionId},
                ${memberships.billingPeriodStart} = COALESCE(${command.billingPeriodStart}, ${memberships.billingPeriodStart}),
                ${memberships.billingPeriodEnd} = COALESCE(${command.billingPeriodEnd}, ${memberships.billingPeriodEnd}),
                ${memberships.cancelAtPeriodEnd} = ${command.cancelAtPeriodEnd}, ${memberships.updatedAt} = now()
            WHERE ${memberships.id} = ${command.membershipId}
            RETURNING ${memberships.id} AS membership_id`));
          if (!updated) throw new Error("WEBHOOK_MUTATION_FAILED");
          if (attemptId) {
            const completedAttempt = resultRow(await tx.execute(sql`UPDATE ${billingAttempts}
              SET ${billingAttempts.state} = 'completed', ${billingAttempts.endedAt} = now(), ${billingAttempts.updatedAt} = now()
              WHERE ${billingAttempts.id} = ${attemptId} AND ${billingAttempts.state} = 'active'
              RETURNING ${billingAttempts.id} AS attempt_id`));
            if (!completedAttempt) throw new Error("WEBHOOK_MUTATION_FAILED");
          }
        }

        const action = stale ? 'stripe.webhook.ignored_stale' : 'stripe.webhook.processed';
        const audit = resultRow(await tx.execute(sql`INSERT INTO ${auditEvents}
          (${auditEvents.actorType}, ${auditEvents.action}, ${auditEvents.targetType}, ${auditEvents.targetId}, ${auditEvents.requestId}, ${auditEvents.metadata})
          VALUES ('system', ${action}, 'membership', ${command.membershipId}, ${command.eventId},
            jsonb_build_object('eventType', ${command.eventType}, 'stripeCreated', ${command.eventCreated}, 'eventId', ${command.eventId}, 'status', ${command.nextStatus}))
          RETURNING ${auditEvents.id} AS audit_id`));
        if (!audit) throw new Error("WEBHOOK_MUTATION_FAILED");
        const completed = resultRow(await tx.execute(sql`UPDATE ${jobsTable}
          SET ${jobsTable.state} = 'completed', ${jobsTable.completedAt} = now(), ${jobsTable.updatedAt} = now()
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
          (${jobsTable.runKey}, ${jobsTable.kind}, ${jobsTable.state}, ${jobsTable.attemptCount}, ${jobsTable.lastError})
          VALUES (${command.eventId}, ${command.eventType}, 'failed', 1, ${summary})
          ON CONFLICT (${jobsTable.runKey}) DO UPDATE
          SET ${jobsTable.attemptCount} = ${jobsTable.attemptCount} + 1,
              ${jobsTable.lastError} = ${summary}, ${jobsTable.updatedAt} = now()
          WHERE ${jobsTable.state} = 'failed'
          RETURNING ${jobsTable.id}`);
      } catch { /* Preserve the original transient error when failure recording is unavailable. */ }
      throw error;
    }
  },
};

export const jobsRepo = jobsRepository;
export const jobs = jobsRepository;
