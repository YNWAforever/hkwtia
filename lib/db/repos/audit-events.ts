import "server-only";

import {and, eq, sql} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {auditEvents as auditEventsTable, type AuditEvent} from "@/lib/db/server-schema";
import {forbidden, getDb} from "@/lib/db/repos/common";

export type AuditEventInput = Pick<AuditEvent, "action" | "targetType" | "targetId"> & Partial<Pick<AuditEvent, "requestId" | "metadata">>;

function auditScope(actor: Actor, targetType: string, targetId: string) {
  if (actor.kind === "system") return and(eq(auditEventsTable.targetType, targetType), eq(auditEventsTable.targetId, targetId), sql`true`);
  if (actor.kind === "member") return and(eq(auditEventsTable.actorUserId, actor.userId), eq(auditEventsTable.targetType, targetType), eq(auditEventsTable.targetId, targetId));
  return sql`false`;
}

export const auditEventsRepository = {
  async append(actor: Actor, input: AuditEventInput): Promise<AuditEvent> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    const rows = await db
      .insert(auditEventsTable)
      .values({
        ...input,
        actorUserId: actor.userId,
        actorType: actor.kind,
      })
      .returning();
    return rows[0];
  },

  async listForTarget(actor: Actor, targetType: string, targetId: string): Promise<AuditEvent[]> {
    if (actor.kind === "anonymous") forbidden();
    const db = await getDb();
    return db.select().from(auditEventsTable).where(auditScope(actor, targetType, targetId));
  },
};

export const auditEventsRepo = auditEventsRepository;

export const auditEvents = auditEventsRepository;
