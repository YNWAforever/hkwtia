import {readSupportDraftSource} from "@/lib/ai/drafts/support-facts";
import "server-only";
import {createHash} from "node:crypto";
import {encodeScopedCursor,decodeScopedCursor} from "@/lib/admin/pagination";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import { markDraftRequestStartedInTransaction } from "@/lib/db/repos/ai-draft-work";
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorize";
import {
  forbidden,
  type Actor,
  type AdminActor,
} from "@/lib/membership/lifecycle";
import { canReadKnowledge } from "@/lib/ai/knowledge/policy";
import { getDb } from "@/lib/db/repos/common";
import type { KbDatabaseLoader } from "@/lib/db/repos/kb-documents";
import {
  supportAnalysisSchema,
  type SupportAnalysis,
  adminAiDraftSchema,
  approvedFactPackSchema,
  groundedContentSchema,
  draftKinds,
  type ApprovedFactPack,
  type AdminAiDraft,
  type DraftViolation,
} from "@/lib/ai/drafts/contracts";
import {
  validateGroundedContent,
  claimsForGroundedTemplate,
  approvedFactsHash,
  validateDraft,
  renderGroundedBody,
} from "@/lib/ai/drafts/validation";
export type AiDraftExecutor = Readonly<{
  execute: (query: SQL) => Promise<unknown>;
}>;
/** Each case reader must acquire the existing case row lock through this transaction and return only authorized, minimized authoritative facts. */
export type ApprovedDraftFactReader = (
  actor: AdminActor,
  input: Readonly<{
    kind: AdminAiDraft["kind"];
    caseId: string;
    asOf: Date;
  }>,
  tx: AiDraftExecutor,
) => Promise<ApprovedFactPack>;
export const draftReviewSchema = z
  .object({
    draftId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export const draftEditSchema = z
  .object({
    draftId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    body: z.string().min(1).max(20000),
  })
  .strict();
export const draftAdoptSchema = z
  .object({
    draftId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
const proposedSchema = groundedContentSchema
  .extend({
    kind: z.enum(draftKinds),
    caseId: z.string().min(1).max(255),
    ownerId: z.string().min(1).max(255).nullable(),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    modelRoute: z.string().min(1).max(120),
    promptVersion: z.string().min(1).max(80),
    runId: z.string().uuid(),
    analysis: supportAnalysisSchema.optional(),
    expectedFactsHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type AiDraftDetails = Readonly<{
  draft: AdminAiDraft;
  analysis?: SupportAnalysis;
  renderedBody: string;
  violations: readonly DraftViolation[];
  previousBody: string | null;
  facts: ApprovedFactPack | null;
  factsAvailable: boolean;
  costMicrousd: number | null;
  usageState: string;
  createdAt: string;
  updatedAt: string;
}>;
function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result;
  if (
    result !== null &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  )
    return result.rows;
  throw Error("AI_DRAFT_SQL_RESULT_INVALID");
}
function iso(value: unknown): string {
  return (
    value instanceof Date ? value : new Date(String(value))
  ).toISOString();
}
function draftFrom(row: Record<string, unknown>): AdminAiDraft {
  return adminAiDraftSchema.parse({
    id: row.id,
    version: Number(row.version),
    kind: row.kind,
    caseId: row.case_id,
    factsHash: row.facts_hash,
    ownerId: row.owner_profile_id,
    dueAt: row.due_at === null ? null : iso(row.due_at),
    sourceRefs: row.source_refs,
    claims: row.claims,
    body: row.body,
    state: row.state,
    modelRoute: row.model_route,
    promptVersion: row.prompt_version,
    runId: row.run_id,
  });
}
export function createAiDraftsRepository(
  load: KbDatabaseLoader = async () => (await getDb()) as never,
  readFacts: ApprovedDraftFactReader = async (actor, input, tx) =>
    (await import("@/lib/ai/drafts/case-facts")).readApprovedDraftFacts(
      actor,
      input,
      tx,
    ),
  now: () => Date = () => new Date(),
) {
  async function locked<T>(
    actor: Actor,
    work: (tx: AiDraftExecutor, admin: AdminActor) => Promise<T>,
  ): Promise<T> {
    requireAdmin(actor);
    const db = await load();
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('hkwtia-knowledge-governance-v1',0))`,
      );
      const profile = rows(
        await tx.execute(
          sql`SELECT id,auth_user_id,role FROM profiles WHERE id=${actor.profileId} FOR SHARE`,
        ),
      )[0];
      if (
        !profile ||
        profile.auth_user_id !== actor.userId ||
        profile.role !== actor.kind
      )
        forbidden();
      return work(tx, actor);
    });
  }
  async function audit(
    tx: AiDraftExecutor,
    actor: AdminActor,
    action: string,
    draft: AdminAiDraft,
    metadata: Readonly<Record<string, unknown>> = {},
  ) {
    await tx.execute(
      sql`INSERT INTO audit_events(actor_user_id,actor_type,action,target_type,target_id,request_id,metadata) VALUES(${actor.profileId},${actor.kind},${action},'ai_review_draft',${draft.id},${randomUUID()},${JSON.stringify({ kind: draft.kind, version: draft.version, factsHash: draft.factsHash, ...metadata })}::jsonb)`,
    );
  }
  async function selected(
    tx: AiDraftExecutor,
    id: string,
  ): Promise<AdminAiDraft> {
    const row = rows(
      await tx.execute(
        sql`SELECT * FROM ai_review_drafts WHERE id=${id} FOR UPDATE`,
      ),
    )[0];
    if (!row) throw Error("AI_DRAFT_MISSING");
    return draftFrom(row);
  }
  async function factsFor(
    tx: AiDraftExecutor,
    actor: AdminActor,
    draft: Pick<AdminAiDraft, "kind" | "caseId">,
  ): Promise<ApprovedFactPack> {
    const facts = approvedFactPackSchema.parse(
      await readFacts(
        actor,
        { kind: draft.kind, caseId: draft.caseId, asOf: now() },
        tx,
      ),
    );
    if (
      facts.caseId !== draft.caseId ||
      approvedFactsHash(facts) !== facts.versionHash
    )
      throw Error("AI_DRAFT_FACTS_INVALID");
    return facts;
  }
  async function sourcesCurrent(
    tx: AiDraftExecutor,
    actor: AdminActor,
    facts: ApprovedFactPack,
  ): Promise<boolean> {
    for (const ref of facts.sourceRefs) {
      if (!canReadKnowledge(actor, ref.audience)) return false;
      const found = rows(
        await tx.execute(
          sql`SELECT id FROM kb_documents WHERE source_id=${ref.sourceId} AND version=${Number(ref.version)} AND locale=${ref.locale} AND audience=${ref.audience} AND content_hash=${ref.contentHash} AND approval_state='approved' AND index_state='ready' AND effective_from=${new Date(ref.effectiveFrom)} AND effective_to IS NOT DISTINCT FROM ${ref.effectiveTo ? new Date(ref.effectiveTo) : null}::timestamptz AND effective_from<=${new Date(facts.asOf)} AND (effective_to IS NULL OR effective_to>${new Date(facts.asOf)}) AND review_due>${new Date(facts.asOf)} LIMIT 1`,
        ),
      );
      if (!found.length) return false;
    }
    return true;
  }
  async function snapshot(
    tx: AiDraftExecutor,
    actor: AdminActor,
    draft: AdminAiDraft,
    analysis?: SupportAnalysis,
  ) {
    await tx.execute(
      sql`INSERT INTO ai_draft_revisions(draft_id,version,snapshot,actor_profile_id) VALUES(${draft.id},${draft.version},${JSON.stringify({ ...draft, ...(analysis ? {analysis}:{}), ...rows(await tx.execute(sql`SELECT rendered_body AS "renderedBody",violations FROM ai_review_drafts WHERE id=${draft.id}`))[0] })}::jsonb,${actor.profileId})`,
    );
  }
  async function update(
    tx: AiDraftExecutor,
    draft: AdminAiDraft,
    rendered: string,
    violations: readonly DraftViolation[],
    approvedBy: string | null = null,
  ) {
    const at = now();
    await tx.execute(
      sql`UPDATE ai_review_drafts SET version=${draft.version},facts_hash=${draft.factsHash},source_refs=${JSON.stringify(draft.sourceRefs)}::jsonb,claims=${JSON.stringify(draft.claims)}::jsonb,body=${draft.body},rendered_body=${rendered},violations=${JSON.stringify(violations)}::jsonb,state=${draft.state},approved_by=${approvedBy},approved_at=${approvedBy ? at : null},approved_version=${approvedBy ? draft.version : null},updated_at=${at} WHERE id=${draft.id}`,
    );
  }
  async function stale(
    tx: AiDraftExecutor,
    actor: AdminActor,
    draft: AdminAiDraft,
  ): Promise<AdminAiDraft> {
    if (draft.state === "stale") return draft;
    const changed = {
      ...draft,
      version: draft.version + 1,
      state: "stale" as const,
    };
    await update(tx, changed, "", [
      { field: "factsHash", code: "FACTS_CHANGED" },
    ]);
    await snapshot(tx, actor, changed);
    await audit(tx, actor, "ai_draft_stale", changed);
    return changed;
  }
  function render(body: string, facts: ApprovedFactPack): string {
    try {
      return renderGroundedBody(body, facts);
    } catch {
      return "";
    }
  }
  return {
    async fenceGeneration(actor: Actor, input: unknown): Promise<void> {
      const value = z
        .object({
          kind: z.enum(draftKinds),
          caseId: z.string().min(1).max(255),
          factsHash: z.string().regex(/^[a-f0-9]{64}$/),
          runId: z.string().uuid(),
          claimToken: z.string().uuid(),
          modelRoute: z.string().min(1).max(120),
          promptVersion: z.string().min(1).max(80),
        })
        .strict()
        .parse(input);
      await locked(actor, async (tx, admin) => {
        const facts = await factsFor(tx, admin, value);
        if (
          facts.versionHash !== value.factsHash ||
          !(await sourcesCurrent(tx, admin, facts))
        )
          throw Error("DRAFT_GENERATION_STALE");
        const bound = rows(
          await tx.execute(
            sql`SELECT run_id FROM ai_draft_work WHERE run_id=${value.runId} AND claim_token=${value.claimToken} AND kind=${value.kind} AND case_id=${value.caseId} AND facts_hash=${value.factsHash}`,
          ),
        );
        if (bound.length !== 1) throw Error("DRAFT_WORK_CLAIM_CONFLICT");
        await markDraftRequestStartedInTransaction(
          tx,
          { runId: value.runId, claimToken: value.claimToken },
          now(),
        );
        await tx.execute(
          sql`INSERT INTO audit_events(actor_type,actor_user_id,action,target_type,target_id,metadata) VALUES(${admin.kind},${admin.profileId},'ai_draft_generation_requested','ai_draft_work',${value.runId},${JSON.stringify({ kind: value.kind, caseId: value.caseId, factsHash: value.factsHash, modelRoute: value.modelRoute, promptVersion: value.promptVersion })}::jsonb)`,
        );
      });
    },
    async getSupportContext(actor:Actor,conversationId:string,expectedFactsHash:string){
      return locked(actor,async(tx,admin)=>{
        const source=await readSupportDraftSource(admin,conversationId,tx,now());
        if(source.facts.versionHash!==expectedFactsHash)throw Error('DRAFT_GENERATION_STALE');
        return source.context;
      });
    },
    async getFacts(actor: Actor, input: unknown): Promise<ApprovedFactPack> {
      const value = z
        .object({
          kind: z.enum(draftKinds),
          caseId: z.string().min(1).max(255),
        })
        .strict()
        .parse(input);
      return locked(actor, async (tx, admin) => {
        const facts = await factsFor(tx, admin, value);
        if (!(await sourcesCurrent(tx, admin, facts)))
          throw Error("AI_DRAFT_SOURCE_NOT_CURRENT");
        return facts;
      });
    },
    async saveProposedDraft(
      actor: Actor,
      input: unknown,
    ): Promise<AdminAiDraft> {
      const value = proposedSchema.parse(input);
      return locked(actor, async (tx, admin) => {
        if (
          value.ownerId &&
          !rows(
            await tx.execute(
              sql`SELECT id FROM profiles WHERE id=${value.ownerId} AND role IN ('staff','exco','superadmin') FOR SHARE`,
            ),
          ).length
        )
          throw Error("AI_DRAFT_OWNER_INVALID");
        const facts = await factsFor(tx, admin, value);
        const { expectedFactsHash, analysis, ...content } = value;
        if(analysis){
          if(value.kind!=="support")throw Error("AI_DRAFT_ANALYSIS_KIND_INVALID");
          for(const body of [analysis.summary,...analysis.tasks]){
            if(!validateGroundedContent({body,claims:claimsForGroundedTemplate(body,facts),sourceRefs:facts.sourceRefs},facts).valid)throw Error("AI_DRAFT_ANALYSIS_INVALID");
          }
        }
        const draft: AdminAiDraft = {
          ...content,
          id: randomUUID(),
          version: 1,
          factsHash: expectedFactsHash ?? facts.versionHash,
          state: "proposed",
        };
        let result = validateDraft(draft, facts);
        if (!(await sourcesCurrent(tx, admin, facts)))
          result = {
            valid: false,
            violations: [
              ...result.violations,
              { field: "sourceRefs", code: "SOURCE_NOT_CURRENT" },
            ],
          };
        const saved = {
          ...draft,
          state:
            expectedFactsHash && expectedFactsHash !== facts.versionHash
              ? ("stale" as const)
              : result.valid
                ? ("needs_review" as const)
                : ("proposed" as const),
        };
        const at = now();
        await tx.execute(
          sql`INSERT INTO ai_review_drafts(id,version,kind,case_id,locale,facts_hash,owner_profile_id,due_at,source_refs,claims,body,rendered_body,state,violations,model_route,prompt_version,run_id,created_at,updated_at) VALUES(${saved.id},1,${saved.kind},${saved.caseId},${facts.locale},${saved.factsHash},${saved.ownerId},${saved.dueAt ? new Date(saved.dueAt) : null},${JSON.stringify(saved.sourceRefs)}::jsonb,${JSON.stringify(saved.claims)}::jsonb,${saved.body},${result.valid ? render(saved.body, facts) : ""},${saved.state},${JSON.stringify(result.violations)}::jsonb,${saved.modelRoute},${saved.promptVersion},${saved.runId},${at},${at})`,
        );
        await snapshot(tx, admin, saved, analysis);
        await audit(tx, admin, "ai_draft_created", saved, {
          valid: result.valid,
          violationCodes: result.violations.map((v) => v.code),
        });
        return saved;
      });
    },
    async reviewDraft(
      actor: Actor,
      input: unknown,
    ): Promise<{
      draft: AdminAiDraft;
      reviewId: string | null;
      status: "reviewed" | "stale" | "invalid";
    }> {
      const value = draftReviewSchema.parse(input);
      return locked(actor, async (tx, admin) => {
        const draft = await selected(tx, value.draftId);
        if (draft.version !== value.expectedVersion)
          throw Error("AI_DRAFT_VERSION_CONFLICT");
        if (!["proposed", "needs_review"].includes(draft.state))
          throw Error("AI_DRAFT_STATE_CONFLICT");
        const facts = await factsFor(tx, admin, draft);
        if (
          draft.factsHash !== facts.versionHash ||
          !(await sourcesCurrent(tx, admin, facts))
        )
          return {
            draft: await stale(tx, admin, draft),
            reviewId: null,
            status: "stale",
          };
        const validation = validateDraft(draft, facts);
        if (value.decision === "approve" && !validation.valid)
          return { draft, reviewId: null, status: "invalid" };
        const next = {
          ...draft,
          version: draft.version + 1,
          state:
            value.decision === "approve"
              ? ("approved" as const)
              : ("rejected" as const),
        };
        const reviewId = randomUUID();
        await update(
          tx,
          next,
          validation.valid ? render(next.body, facts) : "",
          validation.violations,
          value.decision === "approve" ? admin.profileId : null,
        );
        await tx.execute(
          sql`INSERT INTO ai_draft_reviews(id,draft_id,expected_version,resulting_version,decision,reviewer_profile_id,reason,facts_hash) VALUES(${reviewId},${draft.id},${draft.version},${next.version},${value.decision},${admin.profileId},${value.reason ?? null},${facts.versionHash})`,
        );
        await snapshot(tx, admin, next);
        await audit(tx, admin, "ai_draft_reviewed", next, {
          reviewId,
          decision: value.decision,
        });
        return { draft: next, reviewId, status: "reviewed" };
      });
    },
    async editDraft(actor: Actor, input: unknown): Promise<AdminAiDraft> {
      const value = draftEditSchema.parse(input);
      return locked(actor, async (tx, admin) => {
        const old = await selected(tx, value.draftId);
        if (old.version !== value.expectedVersion)
          throw Error("AI_DRAFT_VERSION_CONFLICT");
        const facts = await factsFor(tx, admin, old);
        const fields = [
          ...new Set(
            [
              ...value.body.matchAll(
                /\{\{facts\.([a-z][a-zA-Z0-9_.-]{0,63})\}\}/gu,
              ),
            ].map((match) => match[1]!),
          ),
        ];
        const claims = fields
          .filter((field) => facts.values[field])
          .map((field) => ({
            field,
            value: facts.values[field]!.value,
            sourceId: facts.values[field]!.sourceId,
          }));
        const next: AdminAiDraft = {
          ...old,
          version: old.version + 1,
          body: value.body,
          claims,
          sourceRefs: facts.sourceRefs,
          factsHash: facts.versionHash,
          state: "proposed",
        };
        let validation = validateDraft(next, facts);
        if (!(await sourcesCurrent(tx, admin, facts)))
          validation = {
            valid: false,
            violations: [
              ...validation.violations,
              { field: "sourceRefs", code: "SOURCE_NOT_CURRENT" },
            ],
          };
        const saved = {
          ...next,
          state: validation.valid
            ? ("needs_review" as const)
            : ("proposed" as const),
        };
        await update(
          tx,
          saved,
          validation.valid ? render(saved.body, facts) : "",
          validation.violations,
        );
        await snapshot(tx, admin, saved);
        await audit(tx, admin, "ai_draft_edited", saved, {
          previousVersion: old.version,
          valid: validation.valid,
        });
        return saved;
      });
    },
    /** Revalidate inside the same transaction as the adopter's existing outbox/write operation. The callback never sends to a provider. */
    async withApprovedDraft<T>(
      actor: Actor,
      input: unknown,
      adopt: (
        tx: AiDraftExecutor,
        draft: AdminAiDraft,
        renderedBody: string,
      ) => Promise<T>,
    ): Promise<
      | {
          status: "adopted";
          value: T;
        }
      | {
          status: "stale";
          draft: AdminAiDraft;
        }
    > {
      const value = draftAdoptSchema.parse(input);
      return locked(actor, async (tx, admin) => {
        const draft = await selected(tx, value.draftId);
        if (draft.version !== value.expectedVersion)
          throw Error("AI_DRAFT_VERSION_CONFLICT");
        if (draft.state !== "approved") throw Error("AI_DRAFT_NOT_APPROVED");
        const facts = await factsFor(tx, admin, draft);
        if (
          draft.factsHash !== facts.versionHash ||
          !(await sourcesCurrent(tx, admin, facts)) ||
          !validateDraft(draft, facts).valid
        )
          return { status: "stale", draft: await stale(tx, admin, draft) };
        const result = await adopt(tx, draft, render(draft.body, facts));
        await audit(tx, admin, "ai_draft_adopted", draft);
        return { status: "adopted", value: result };
      });
    },
    async listReviewQueue(actor:Actor,input:Readonly<{after?:string;limit?:number;kind?:AdminAiDraft["kind"];state?:AdminAiDraft["state"];ownerId?:string;dueBefore?:string}>={}){
      requireAdmin(actor);
      const value=z.object({after:z.string().max(1000).optional(),limit:z.number().int().min(1).max(100).default(20),kind:z.enum(draftKinds).optional(),state:adminAiDraftSchema.shape.state.optional(),ownerId:z.string().min(1).max(255).optional(),dueBefore:z.string().datetime({offset:true}).optional()}).strict().parse(input);
      const scope=createHash('sha256').update(JSON.stringify(['draft-queue-v1',actor.profileId,actor.userId,actor.kind,value.kind??null,value.state??null,value.ownerId??null,value.dueBefore??null])).digest('hex');
      // Preserve old UUID cursors only for the historic unfiltered task-list interface.
      const legacy=value.after&&z.string().uuid().safeParse(value.after).success&&!value.kind&&!value.state&&!value.ownerId&&!value.dueBefore;
      const after=value.after?z.string().uuid().parse(legacy?value.after:decodeScopedCursor(scope,value.after)[0]):null;
      return locked(actor,async tx=>{
        const items=rows(await tx.execute(sql`SELECT d.id,d.kind,d.state,d.version,d.owner_profile_id,d.due_at FROM ai_review_drafts d
          WHERE (${after}::uuid IS NULL OR d.id>${after}::uuid)
          AND (${value.kind??null}::text IS NULL OR d.kind=${value.kind??null})
          AND (${value.state??null}::text IS NULL OR d.state=${value.state??null})
          AND (${value.ownerId??null}::text IS NULL OR d.owner_profile_id=${value.ownerId??null})
          AND (${value.dueBefore?new Date(value.dueBefore):null}::timestamptz IS NULL OR d.due_at<=${value.dueBefore?new Date(value.dueBefore):null})
          AND (d.kind<>'support' OR d.case_id NOT LIKE 'inbox:%' OR EXISTS(SELECT 1 FROM conversations c WHERE c.id::text=substring(d.case_id FROM 7) AND c.agent_kind='concierge' AND c.status<>'deleted'))
          ORDER BY d.id LIMIT ${value.limit+1}`));
        const page=items.slice(0,value.limit);
        return {items:page.map(row=>({id:String(row.id),kind:z.enum(draftKinds).parse(row.kind),state:adminAiDraftSchema.shape.state.parse(row.state),version:Number(row.version),ownerId:row.owner_profile_id===null?null:String(row.owner_profile_id),dueAt:row.due_at===null?null:iso(row.due_at)})),nextCursor:items.length>value.limit?encodeScopedCursor(scope,[String(page.at(-1)!.id),'','']):null};
      });
    },
    async getDraft(actor: Actor, id: string): Promise<AiDraftDetails> {
      z.string().uuid().parse(id);
      return locked(actor, async (tx, admin) => {
        let draft = await selected(tx, id);
        let facts: ApprovedFactPack | null = null;
        try {
          facts = await factsFor(tx, admin, draft);
        } catch(error) {
          if(isAuthorizationDenial(error))throw error;
          /* A failed read is unavailable, not evidence that the stored fact changed. */
        }
        if (
          facts &&
          (draft.factsHash !== facts.versionHash ||
            !(await sourcesCurrent(tx, admin, facts)))
        )
          draft = await stale(tx, admin, draft);
        const row = rows(
          await tx.execute(
            sql`SELECT d.*,(SELECT snapshot->'analysis' FROM ai_draft_revisions a WHERE a.draft_id=d.id AND a.snapshot->>'factsHash'=d.facts_hash AND a.snapshot ? 'analysis' ORDER BY a.version DESC LIMIT 1) AS support_analysis,previous.snapshot->>'renderedBody' AS previous_body,r.cost_microusd,r.usage_state FROM ai_review_drafts d LEFT JOIN agent_runs r ON r.id=d.run_id LEFT JOIN ai_draft_revisions previous ON previous.draft_id=d.id AND previous.version=d.version-1 WHERE d.id=${id}`,
          ),
        )[0]!;
        return {
          draft,
          ...(row.support_analysis&&facts&&draft.state!=="stale"?{analysis:{...supportAnalysisSchema.parse(row.support_analysis),summary:render(supportAnalysisSchema.parse(row.support_analysis).summary,facts),tasks:supportAnalysisSchema.parse(row.support_analysis).tasks.map(body=>render(body,facts))}}:{}),
          renderedBody: String(row.rendered_body),
          violations: z
            .array(z.object({ field: z.string(), code: z.string() }).strict())
            .parse(row.violations),
          previousBody:
            row.previous_body === null ? null : String(row.previous_body),
          facts,
          factsAvailable: facts !== null,
          costMicrousd:
            row.cost_microusd === null
              ? null
              : z.coerce
                  .number()
                  .int()
                  .nonnegative()
                  .max(Number.MAX_SAFE_INTEGER)
                  .parse(row.cost_microusd),
          usageState: String(row.usage_state),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        };
      });
    },
  };
}
export const aiDraftsRepository = createAiDraftsRepository();
