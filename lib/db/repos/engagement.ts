import "server-only";

import {desc, eq, sql} from "drizzle-orm";
import {z} from "zod";

import {AT_RISK_RENEWAL_DAYS, AT_RISK_SCORE_MAX, type AtRiskCandidate} from "@/lib/admin/at-risk";
import {requireAdmin} from "@/lib/auth/actor";
import {auditEvents, companies, companyMembers, engagementEvents, engagementScores, memberships, profiles, type EngagementEvent} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import {requireSystem, type Actor, type AdminActor} from "@/lib/membership/lifecycle";

export const ENGAGEMENT_EVENT_TYPES = ["renewal_paid", "renewal_failed", "event_attended"] as const;

const engagementInputSchema = z.object({
  profileId: z.string().min(1),
  companyId: z.string().uuid().nullable().optional().default(null),
  type: z.enum(ENGAGEMENT_EVENT_TYPES),
  points: z.number().int().safe(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.coerce.date().optional(),
}).strict();
const profileIdSchema = z.string().min(1);
const atRiskRowSchema = z.object({
  profileId: z.string(), displayName: z.string(), companyName: z.string().nullable(), planCode: z.string(),
  status: z.enum(["active", "past_due"]), score: z.union([z.string(), z.number()]),
  trend: z.union([z.string(), z.number()]).nullable(), renewalAt: z.coerce.date(),
});

export type EngagementEventInput = z.input<typeof engagementInputSchema>;
type StoredEngagementInput = z.output<typeof engagementInputSchema>;
type EngagementActor = AdminActor | Extract<Actor, {kind: "system"}>;
type EngagementAuditInput = Readonly<{
  actorUserId: string | null; actorType: EngagementActor["kind"]; action: "engagement_event.appended";
  targetType: "profile"; targetId: string;
  metadata: Readonly<{engagementEventId: string; type: typeof ENGAGEMENT_EVENT_TYPES[number]; points: number}>;
}>;
export type EngagementEventTransaction = Readonly<{
  insertEvent: (input: StoredEngagementInput) => Promise<EngagementEvent>;
  insertAudit: (input: EngagementAuditInput) => Promise<void>;
}>;
export type EngagementEventExecutor = Readonly<{transaction: <T>(work: (transaction: EngagementEventTransaction) => Promise<T>) => Promise<T>}>;
export type EngagementTimelineReader = Readonly<{listForProfile: (profileId: string) => Promise<readonly EngagementEvent[]>}>;

function requireEngagementActor(actor: Actor): asserts actor is EngagementActor {
  if (actor.kind === "system") requireSystem(actor); else requireAdmin(actor);
}

async function defaultExecutor(): Promise<EngagementEventExecutor> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    insertEvent: async (input) => {
      const rows = await tx.insert(engagementEvents).values(input).returning();
      const row = rows[0];
      if (!row) throw new Error("ENGAGEMENT_EVENT_INSERT_FAILED");
      return row;
    },
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

const defaultReader: EngagementTimelineReader = {listForProfile: async (profileId) => {
  const db = await getDb();
  return db.select().from(engagementEvents).where(eq(engagementEvents.profileId, profileId))
    .orderBy(desc(engagementEvents.occurredAt), desc(engagementEvents.id));
}};

function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function listAtRiskCandidates(actor: Actor, asOf: Date): Promise<readonly AtRiskCandidate[]> {
  requireAdmin(actor);
  const renewalBefore = new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * 86_400_000);
  const db = await getDb();
  const rows = z.array(atRiskRowSchema).parse(resultRows(await db.execute(sql`
    WITH candidate_rows AS (
      SELECT ${profiles.id} AS "profileId", ${profiles.displayName} AS "displayName",
        ${companies.displayName} AS "companyName", ${memberships.planCode} AS "planCode",
        ${memberships.status} AS status, ${engagementScores.score} AS score,
        ${engagementScores.trend} AS trend, ${memberships.billingPeriodEnd} AS "renewalAt",
        ROW_NUMBER() OVER (PARTITION BY ${profiles.id} ORDER BY ${memberships.billingPeriodEnd}, ${memberships.id}, ${companies.id} NULLS LAST) AS row_rank
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      INNER JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      INNER JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
      WHERE ${memberships.status} IN ('active', 'past_due')
        AND ${engagementScores.score} < ${AT_RISK_SCORE_MAX}
        AND ${memberships.billingPeriodEnd} >= ${asOf}
        AND ${memberships.billingPeriodEnd} <= ${renewalBefore}
    )
    SELECT "profileId", "displayName", "companyName", "planCode", status, score, trend, "renewalAt"
    FROM candidate_rows WHERE row_rank = 1
    ORDER BY "renewalAt", "profileId"
  `)));
  return rows.map((row) => ({...row, score: Number(row.score), trend: row.trend === null ? null : Number(row.trend)}));
}

export async function appendEngagementEvent(actor: Actor, input: unknown, executor?: EngagementEventExecutor): Promise<EngagementEvent> {
  requireEngagementActor(actor);
  const parsed = engagementInputSchema.parse(input);
  return (executor ?? await defaultExecutor()).transaction(async (transaction) => {
    const event = await transaction.insertEvent(parsed);
    await transaction.insertAudit({
      actorUserId: actor.kind === "system" ? null : actor.profileId,
      actorType: actor.kind,
      action: "engagement_event.appended",
      targetType: "profile",
      targetId: parsed.profileId,
      metadata: {engagementEventId: event.id, type: parsed.type, points: parsed.points},
    });
    return event;
  });
}

export async function getEngagementTimeline(actor: Actor, profileId: unknown, reader: EngagementTimelineReader = defaultReader): Promise<readonly EngagementEvent[]> {
  requireAdmin(actor);
  const rows = await reader.listForProfile(profileIdSchema.parse(profileId));
  return [...rows].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime() || right.id.localeCompare(left.id));
}

export const engagementRepository = {listAtRiskCandidates};
