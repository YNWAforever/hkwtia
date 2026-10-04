import "server-only";
import {createHash} from "node:crypto";
import {and, eq, inArray, sql} from "drizzle-orm";
import {z} from "zod";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, agentRuns} from "@/lib/db/server-schema";
import {buildOperationBaseline, compareObservedWork, operationBaselineSchema, operationBaselineWindowSchema, operationObservationSchema, summarizeObservedWork, type OperationObservation, type OperationBaselineWindow, type OperationBaseline} from "@/lib/ai/operations-metrics";
import type {Actor} from "@/lib/membership/lifecycle";
type Database = Pick<Awaited<ReturnType<typeof getDb>>, "select" | "insert" | "execute" | "transaction">;
const targets: Record<OperationObservation["caseKind"], readonly string[]> = {
  application: ["membership_application", "application"], support: ["conversation"],
  renewal: ["membership"], membership: ["membership", "profile"], event: ["event", "event_order", "event_registration"],
  board: ["board_draft", "post", "news_post"], content: ["post", "news_post", "event"],
  cms: ["page_copy", "page_copy_draft", "page", "post", "news_post", "media", "landing_partner"],
};
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
export function createOperationsMetricsRepository(loadDatabase: () => Promise<Database> = getDb) {
  return {
    async record(actor: Actor, input: OperationObservation, now = new Date()): Promise<void> {
      requireAdmin(actor);
      const observation = operationObservationSchema.parse(input);
      if (!Number.isFinite(now.getTime()) || Date.parse(observation.endedAt) > now.getTime()) throw Error("OPERATION_TIME_INVALID");
      const db = await loadDatabase();
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"admin-operation-actor:" + actor.profileId}, 0))`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"admin-operation-comparison:" + observation.comparisonId}, 0))`);
        // Existing target index + a transaction-scoped lock fence concurrent submissions without changing historic audit constraints.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"admin-operation:" + observation.observationId}, 0))`);
        const prior = (await tx.select({actor: auditEvents.actorUserId, metadata: auditEvents.metadata}).from(auditEvents)
          .where(and(eq(auditEvents.targetType, "admin_operation"), eq(auditEvents.targetId, observation.observationId))).limit(1))[0];
        if (prior) {
          if (prior.actor !== actor.profileId || JSON.stringify(prior.metadata) !== JSON.stringify({version: 1, observation})) {
            // JSONB key ordering is immaterial: compare validated contracts, not storage serialization.
            const stored = operationObservationSchema.safeParse(prior.metadata?.observation);
            if (prior.metadata?.version !== 1 || prior.actor !== actor.profileId || !stored.success || JSON.stringify(stored.data) !== JSON.stringify(observation)) throw Error("OPERATION_OBSERVATION_CONFLICT");
          }
          return;
        }
        if (observation.cohort === "baseline") {
          const frozen = (await tx.select({id: auditEvents.id}).from(auditEvents).where(and(
            eq(auditEvents.targetType, "admin_operation_baseline"), eq(auditEvents.targetId, observation.comparisonId))).limit(1))[0];
          if (frozen) throw Error("OPERATION_BASELINE_FROZEN");
        }
        if (observation.auditId) {
          const source = (await tx.select({targetType: auditEvents.targetType, targetId: auditEvents.targetId}).from(auditEvents)
            .where(eq(auditEvents.id, observation.auditId)).limit(1))[0];
          if (!source) throw Error("OPERATION_SOURCE_MISMATCH");
          if (source.targetType === "ai_review_draft" || source.targetType === "ai_draft_work") {
            // The business case comes from the stored work row, never supplied audit metadata or a client role.
            const cases = rows(await tx.execute(sql`
              SELECT kind, case_id AS "caseId" FROM ai_review_drafts WHERE id::text=${source.targetId} AND ${source.targetType}='ai_review_draft'
              UNION ALL
              SELECT kind, case_id AS "caseId" FROM ai_draft_work WHERE run_id::text=${source.targetId} AND ${source.targetType}='ai_draft_work'
            `));
            const resolved = z.object({kind: z.string(), caseId: z.string()}).optional().parse(cases[0]);
            if (!resolved || resolved.kind !== observation.caseKind || resolved.caseId !== observation.caseId) throw Error("OPERATION_SOURCE_MISMATCH");
          } else if (source.targetId !== observation.caseId || !targets[observation.caseKind].includes(source.targetType)) throw Error("OPERATION_SOURCE_MISMATCH");
        }
        if (observation.runId) {
          const source = (await tx.select({caseId: agentRuns.conversationId, profileId: agentRuns.profileId}).from(agentRuns)
            .where(eq(agentRuns.id, observation.runId)).limit(1))[0];
          if (!source || (source.caseId !== observation.caseId && source.profileId !== observation.caseId)) throw Error("OPERATION_SOURCE_MISMATCH");
        }
        const overlap = (await tx.select({id: auditEvents.id}).from(auditEvents).where(and(
          eq(auditEvents.targetType, "admin_operation"), eq(auditEvents.actorUserId, actor.profileId),
          sql`(${auditEvents.metadata}->'observation'->>'startedAt')::timestamptz < ${new Date(observation.endedAt)}`,
          sql`(${auditEvents.metadata}->'observation'->>'endedAt')::timestamptz > ${new Date(observation.startedAt)}`,
        )).limit(1))[0];
        if (overlap) throw Error("OPERATION_TIMING_OVERLAP");
        await tx.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind,
          action: "admin_operation_observed", targetType: "admin_operation", targetId: observation.observationId,
          requestId: observation.observationId, metadata: {version: 1, observation}, createdAt: now});
      });
    },
    async freezeBaseline(actor: Actor, input: OperationBaselineWindow, now = new Date()): Promise<OperationBaseline> {
      requireAdmin(actor);
      const parsed = operationBaselineWindowSchema.safeParse(input);
      if (!parsed.success || !Number.isFinite(now.getTime()) || Date.parse(parsed.data.toExclusive) > now.getTime()) throw Error("OPERATION_BASELINE_INVALID");
      const window = parsed.data, db = await loadDatabase();
      return db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"admin-operation-comparison:" + window.comparisonId}, 0))`);
        const prior = (await tx.select({metadata: auditEvents.metadata}).from(auditEvents).where(and(
          eq(auditEvents.targetType, "admin_operation_baseline"), eq(auditEvents.targetId, window.comparisonId))).limit(1))[0];
        if (prior) {
          const baseline = operationBaselineSchema.parse(prior.metadata?.baseline);
          if (baseline.from !== window.from || baseline.toExclusive !== window.toExclusive || baseline.comparisonId !== window.comparisonId) throw Error("OPERATION_BASELINE_CONFLICT");
          return baseline;
        }
        const records = await tx.select({metadata: auditEvents.metadata}).from(auditEvents).where(and(
          eq(auditEvents.targetType, "admin_operation"),
          sql`${auditEvents.metadata}->'observation'->>'comparisonId' = ${window.comparisonId}`,
          sql`${auditEvents.metadata}->'observation'->>'cohort' = 'baseline'`,
        )).orderBy(auditEvents.id).limit(5001);
        if (records.length > 5000) throw Error("OPERATION_BASELINE_INCOMPLETE");
        const observations = records.map(record => operationObservationSchema.parse(record.metadata?.observation));
        const baseline = buildOperationBaseline(window, observations);
        const canonical = [...observations].sort((a, b) => a.observationId.localeCompare(b.observationId));
        const receiptDigest = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
        await tx.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind,
          action: "admin_operation_baseline_frozen", targetType: "admin_operation_baseline", targetId: window.comparisonId,
          requestId: window.comparisonId, metadata: {version: 1, baseline, receiptCount: canonical.length, receiptDigest}, createdAt: now});
        return baseline;
      });
    },
    async read(actor: Actor, window: Readonly<{from: Date; toExclusive: Date}>) {
      requireAdmin(actor);
      if (!Number.isFinite(window.from.getTime()) || !Number.isFinite(window.toExclusive.getTime()) || window.from >= window.toExclusive) throw Error("OPERATION_WINDOW_INVALID");
      const db = await loadDatabase();
      const records = await db.select({metadata: auditEvents.metadata}).from(auditEvents)
        .where(and(eq(auditEvents.targetType, "admin_operation"), sql`(${auditEvents.metadata}->'observation'->>'endedAt')::timestamptz >= ${window.from}`, sql`(${auditEvents.metadata}->'observation'->>'endedAt')::timestamptz < ${window.toExclusive}`))
        .orderBy(auditEvents.createdAt, auditEvents.id).limit(5001);
      if (records.length > 5000) return {status: "incomplete" as const, caseCount: null, sampleCount: null, missingRate: null, netMinutes: null, comparisonSampleCount: null, comparisonMissingRate: null, baselinePeriods: []};
      const observations = records.map(record => operationObservationSchema.parse(record.metadata?.observation));
      const work = summarizeObservedWork(observations);
      const result = rows(await db.execute(sql`
        WITH audited_cases AS (
          SELECT CASE
            WHEN target_type IN ('membership_application','application') THEN 'application'
            WHEN target_type='conversation' THEN 'support'
            WHEN target_type='membership' AND action ~* '(renew|invoice)' THEN 'renewal'
            WHEN target_type IN ('membership','profile') THEN 'membership'
            WHEN target_type IN ('event','event_order','event_registration') THEN 'event'
            WHEN target_type='board_draft' THEN 'board'
            WHEN target_type IN ('post','news_post') THEN 'content'
            WHEN target_type IN ('page_copy','page_copy_draft','page','media','landing_partner') THEN 'cms'
          END AS case_kind, target_id
          FROM audit_events WHERE created_at >= ${window.from} AND created_at < ${window.toExclusive}
        ), case_population AS (
          SELECT 'support:' || id::text AS case_id FROM conversations
          WHERE (created_at >= ${window.from} AND created_at < ${window.toExclusive})
             OR (last_message_at >= ${window.from} AND last_message_at < ${window.toExclusive})
          UNION
          SELECT case_kind || ':' || target_id FROM audited_cases WHERE case_kind IS NOT NULL
          UNION
          SELECT kind || ':' || case_id FROM ai_draft_work
          WHERE (created_at >= ${window.from} AND created_at < ${window.toExclusive})
             OR (updated_at >= ${window.from} AND updated_at < ${window.toExclusive})
          UNION
          SELECT kind || ':' || case_id FROM ai_review_drafts
          WHERE (created_at >= ${window.from} AND created_at < ${window.toExclusive})
             OR (updated_at >= ${window.from} AND updated_at < ${window.toExclusive})
          UNION
          SELECT metadata->'observation'->>'caseKind' || ':' || (metadata->'observation'->>'caseId') AS case_id
          FROM audit_events WHERE target_type='admin_operation' AND (metadata->'observation'->>'endedAt')::timestamptz >= ${window.from} AND (metadata->'observation'->>'endedAt')::timestamptz < ${window.toExclusive}
        ) SELECT count(DISTINCT case_id)::integer AS count FROM case_population
      `));
      const caseCount = z.object({count: z.coerce.number().int().nonnegative()}).parse(result[0]).count;
      const comparisonIds = [...new Set(observations.filter(item => item.cohort === "assisted").map(item => item.comparisonId))];
      const snapshots = comparisonIds.length === 0 ? [] : await db.select({metadata: auditEvents.metadata}).from(auditEvents)
        .where(and(eq(auditEvents.targetType, "admin_operation_baseline"), inArray(auditEvents.targetId, comparisonIds))).limit(5001);
      if (snapshots.length > 5000) throw Error("OPERATION_BASELINE_INCOMPLETE");
      const baselines = snapshots.map(record => operationBaselineSchema.parse(record.metadata?.baseline));
      const comparison = compareObservedWork(observations, baselines);
      return {status: comparison.netMinutes === null ? "baseline_collecting" as const : "measured" as const, ...work, caseCount,
        missingRate: caseCount === 0 ? null : 1 - work.sampleCount / caseCount, netMinutes: comparison.netMinutes,
        comparisonSampleCount: comparison.sampleCount, comparisonMissingRate: caseCount === 0 ? null : 1 - comparison.sampleCount / caseCount,
        baselinePeriods: baselines.map(({comparisonId, from, toExclusive}) => ({comparisonId, from, toExclusive}))};
    },
  };
}
export const operationsMetricsRepository = createOperationsMetricsRepository();
