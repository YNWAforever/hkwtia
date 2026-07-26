import "server-only";

import {desc, eq, sql} from "drizzle-orm";
import {z} from "zod";

import {type AtRiskCandidate} from "@/lib/admin/at-risk";
import {requireAdmin} from "@/lib/auth/actor";
import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {
  auditEvents,
  companies,
  companyMembers,
  engagementEvents,
  engagementScores,
  memberships,
  profiles,
  type EngagementEvent,
} from "@/lib/db/server-schema";
import type {EngagementPoint} from "@/lib/engagement/scoring";
import {requireSystem, type Actor, type AdminActor} from "@/lib/membership/lifecycle";

export const ENGAGEMENT_EVENT_TYPES = ["renewal_paid", "renewal_failed", "event_attended"] as const;

const RENEWAL_EVENT_TYPES = ["renewal_paid", "renewal_failed"] as const;
const RENEWAL_METADATA_KEYS = new Set(["membershipId", "periodStart", "periodEnd", "renewalOrdinal"]);
const MAX_METADATA_BYTES = 8_192;

function isBoundedJson(value: unknown, depth = 0, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= MAX_METADATA_BYTES;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth >= 6 || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => isBoundedJson(item, depth + 1, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) => key.length > 0 && key.length <= 100 && isBoundedJson(item, depth + 1, seen));
}

const generalMetadataSchema = z.record(z.string().min(1).max(100), z.unknown()).superRefine((metadata, context) => {
  if (Object.keys(metadata).some((key) => RENEWAL_METADATA_KEYS.has(key))) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "renewal metadata keys are reserved"});
  }
  if (!isBoundedJson(metadata)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "metadata must be bounded JSON"});
    return;
  }
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > MAX_METADATA_BYTES) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "metadata exceeds the size limit"});
  }
});

const renewalMetadataSchema = z.object({
  membershipId: z.string().uuid(),
  periodStart: z.string().datetime({offset: true}),
  periodEnd: z.string().datetime({offset: true}),
  renewalOrdinal: z.number().int().positive().max(2_147_483_647),
}).strict();
const engagementBaseSchema = z.object({
  profileId: z.string().min(1),
  companyId: z.string().uuid().nullable().optional().default(null),
  points: z.number().int().safe(),
  occurredAt: z.coerce.date().optional(),
}).strict();
const engagementInputSchema = z.discriminatedUnion("type", [
  engagementBaseSchema.extend({type: z.literal(RENEWAL_EVENT_TYPES[0]), metadata: renewalMetadataSchema}),
  engagementBaseSchema.extend({type: z.literal(RENEWAL_EVENT_TYPES[1]), metadata: renewalMetadataSchema}),
  engagementBaseSchema.extend({type: z.literal("event_attended"), metadata: generalMetadataSchema.default({})}),
]).superRefine((input, context) => {
  if (input.type !== "event_attended" && Date.parse(input.metadata.periodStart) >= Date.parse(input.metadata.periodEnd)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["metadata", "periodEnd"], message: "periodEnd must be after periodStart"});
  }
});
const profileIdSchema = z.string().min(1);
const scoreBatchInputSchema = z.object({
  afterProfileId: z.string().min(1).nullable(),
  asOf: z.date().refine((value) => Number.isFinite(value.getTime())),
  limit: z.number().int().positive().max(1_000),
  windowStart: z.date().refine((value) => Number.isFinite(value.getTime())),
}).strict().refine(
  (input) => input.windowStart.getTime() <= input.asOf.getTime(),
  {message: "INVALID_ENGAGEMENT_SCORE_BATCH"},
);
const scoreUpsertInputSchema = z.object({
  profileId: z.string().min(1),
  score: z.number().finite().min(0).max(100),
  trend: z.number().finite().min(-100).max(100),
  computedAt: z.date().refine((value) => Number.isFinite(value.getTime())),
}).strict();
const scoreProfileRowSchema = z.object({profile_id: z.string().min(1)});
const scoreEventRowSchema = z.object({
  profile_id: z.string().min(1),
  points: z.number().int().safe(),
  occurred_at: z.coerce.date().refine((value) => Number.isFinite(value.getTime())),
});
const atRiskRowSchema = z.object({
  profileId: z.string(), membershipId: z.string(), displayName: z.string(), companyName: z.string().nullable(), planCode: z.string(),
  status: z.enum(["active", "past_due"]), score: z.union([z.string(), z.number()]).nullable(),
  trend: z.union([z.string(), z.number()]).nullable(), lastLoginAt: z.coerce.date().nullable(), renewalAt: z.coerce.date().nullable(),
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
export type EngagementScoreEvent = EngagementPoint & Readonly<{profileId: string}>;
export type EngagementScoreBatchInput = z.infer<typeof scoreBatchInputSchema>;
export type EngagementScoreBatch = Readonly<{
  profileIds: readonly string[];
  events: readonly EngagementScoreEvent[];
}>;
export type EngagementScoreUpsertInput = z.infer<typeof scoreUpsertInputSchema>;
export type EngagementScoreRepository = Readonly<{
  listScoreBatch: (
    actor: AutomationRepositoryActor,
    input: EngagementScoreBatchInput,
  ) => Promise<EngagementScoreBatch>;
  upsertScore: (
    actor: AutomationRepositoryActor,
    input: EngagementScoreUpsertInput,
  ) => Promise<void>;
}>;

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

async function defaultAutomationDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createEngagementScoreRepository(
  loadDatabase: AutomationDatabaseLoader = defaultAutomationDatabaseLoader,
): EngagementScoreRepository {
  return {
    async listScoreBatch(actor, input) {
      requireAutomationSystem(actor);
      const parsed = scoreBatchInputSchema.parse(input);
      const database = await loadDatabase();
      const cursor = parsed.afterProfileId === null
        ? sql`true`
        : sql`${profiles.id} > ${parsed.afterProfileId}`;
      const profileRows = z.array(scoreProfileRowSchema).parse(resultRows(
        await database.execute(sql`
          SELECT ${profiles.id} AS profile_id
          FROM ${profiles}
          WHERE ${cursor}
          ORDER BY ${profiles.id}
          LIMIT ${parsed.limit}
        `),
      ));
      const profileIds = profileRows.map((row) => row.profile_id);
      if (profileIds.length === 0) return {profileIds, events: []};

      const profileList = sql.join(
        profileIds.map((profileId) => sql`${profileId}`),
        sql`, `,
      );
      const eventRows = z.array(scoreEventRowSchema).parse(resultRows(
        await database.execute(sql`
          SELECT
            ${engagementEvents.profileId} AS profile_id,
            ${engagementEvents.points} AS points,
            ${engagementEvents.occurredAt} AS occurred_at
          FROM ${engagementEvents}
          WHERE ${engagementEvents.profileId} IN (${profileList})
            AND ${engagementEvents.occurredAt} >= ${parsed.windowStart}
            AND ${engagementEvents.occurredAt} <= ${parsed.asOf}
          ORDER BY
            ${engagementEvents.profileId},
            ${engagementEvents.occurredAt},
            ${engagementEvents.id}
        `),
      ));
      return {
        profileIds,
        events: eventRows.map((row) => ({
          profileId: row.profile_id,
          points: row.points,
          occurredAt: row.occurred_at,
        })),
      };
    },

    async upsertScore(actor, input) {
      requireAutomationSystem(actor);
      const parsed = scoreUpsertInputSchema.parse(input);
      const database = await loadDatabase();
      await database.execute(sql`
        INSERT INTO ${engagementScores}
          (profile_id, score, trend, computed_at)
        VALUES (
          ${parsed.profileId},
          ${parsed.score.toFixed(2)},
          ${parsed.trend.toFixed(2)},
          ${parsed.computedAt}
        )
        ON CONFLICT (profile_id) DO UPDATE SET
          score = EXCLUDED.score,
          trend = EXCLUDED.trend,
          computed_at = EXCLUDED.computed_at
      `);
    },
  };
}

async function listAtRiskCandidates(actor: Actor, asOf: Date): Promise<readonly AtRiskCandidate[]> {
  requireAdmin(actor);
  void asOf;
  const db = await getDb();
  const rows = z.array(atRiskRowSchema).parse(resultRows(await db.execute(sql`

      SELECT ${profiles.id} AS "profileId", ${memberships.id} AS "membershipId", ${profiles.displayName} AS "displayName",
        ${companies.displayName} AS "companyName", ${memberships.planCode} AS "planCode",
        ${memberships.status} AS status, ${engagementScores.score} AS score,
        ${engagementScores.trend} AS trend, ${profiles.lastLoginAt} AS "lastLoginAt",
        ${memberships.billingPeriodEnd} AS "renewalAt"
      FROM ${profiles}
      LEFT JOIN ${companyMembers} ON ${companyMembers.userId} = ${profiles.id} AND ${companyMembers.revokedAt} IS NULL
      LEFT JOIN ${companies} ON ${companies.id} = ${companyMembers.companyId}
      INNER JOIN ${memberships} ON ${memberships.ownerUserId} = ${profiles.id} OR ${memberships.companyId} = ${companyMembers.companyId}
      LEFT JOIN ${engagementScores} ON ${engagementScores.profileId} = ${profiles.id}
      WHERE ${memberships.status} IN ('active', 'past_due')
    ORDER BY "renewalAt" NULLS LAST, "profileId", "membershipId"
  `)));
  return rows.map((row) => ({...row, score: row.score === null ? null : Number(row.score), trend: row.trend === null ? null : Number(row.trend)}));
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
export const engagementScoreRepository = createEngagementScoreRepository();
