import "server-only";
import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/repos/common";
import type { KbDatabaseLoader } from "@/lib/db/repos/kb-documents";
import { draftKinds } from "@/lib/ai/drafts/contracts";
type Executor = Readonly<{
  execute: (query: SQL) => Promise<unknown>;
}>;
const keySchema = z
  .object({
    kind: z.enum(draftKinds),
    caseId: z.string().min(1).max(255),
    factsHash: z.string().regex(/^[a-f0-9]{64}$/),
    agentVersion: z.string().min(1).max(120),
    idempotencyKey: z.string().min(1).max(255),
  })
  .strict();
const tokenSchema = z
  .object({ runId: z.string().uuid(), claimToken: z.string().uuid() })
  .strict();
const finishSchema = tokenSchema
  .extend({
    state: z.enum(["succeeded", "unknown", "failed_before_request"]),
    draftId: z.string().uuid().nullable(),
    providerRequestId: z.string().min(1).max(255).nullable(),
  })
  .strict();
export type DraftWorkClaim = Readonly<{
  runId: string;
  disposition: "claimed" | "busy" | "reuse" | "unknown";
  claimToken: string | null;
  draftId: string | null;
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
  throw Error("DRAFT_WORK_SQL_RESULT_INVALID");
}
/** A requesting crash is an unknown external effect, not permission for a replacement request. Only a claim with no started request can be reclaimed. */
export function createDraftWorkRepository(
  load: KbDatabaseLoader = async () => (await getDb()) as never,
  now: () => Date = () => new Date(),
  leaseSeconds = 60,
) {
  z.number().int().min(5).max(3600).parse(leaseSeconds);
  async function locked<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
    const db = await load();
    return db.transaction(async (tx) => {
      return work(tx);
    });
  }
  return {
    async claimDraftWork(input: unknown): Promise<DraftWorkClaim> {
      const key = keySchema.parse(input);
      return locked(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(key)},0))`,
        );
        const at = now();
        if (!Number.isFinite(at.getTime()))
          throw Error("DRAFT_WORK_CLOCK_INVALID");
        const found = rows(
          await tx.execute(
            sql`SELECT * FROM ai_draft_work WHERE kind=${key.kind} AND case_id=${key.caseId} AND facts_hash=${key.factsHash} AND agent_version=${key.agentVersion} AND idempotency_key=${key.idempotencyKey} FOR UPDATE`,
          ),
        );
        const previous = found[0];
        if (previous) {
          const runId = String(previous.run_id),
            state = String(previous.state);
          if (state === "succeeded")
            return {
              runId,
              disposition: "reuse",
              claimToken: null,
              draftId: String(previous.draft_id),
            };
          if (state === "unknown")
            return {
              runId,
              disposition: "unknown",
              claimToken: null,
              draftId: null,
            };
          if (state === "requesting") {
            if (
              new Date(String(previous.lease_until)).getTime() <= at.getTime()
            ) {
              await tx.execute(
                sql`UPDATE ai_draft_work SET state='unknown',updated_at=${at} WHERE run_id=${runId}`,
              );
              return {
                runId,
                disposition: "unknown",
                claimToken: null,
                draftId: null,
              };
            }
            return {
              runId,
              disposition: "busy",
              claimToken: null,
              draftId: null,
            };
          }
          if (
            state === "claimed" &&
            new Date(String(previous.lease_until)).getTime() > at.getTime()
          )
            return {
              runId,
              disposition: "busy",
              claimToken: null,
              draftId: null,
            };
          const token = randomUUID(),
            until = new Date(at.getTime() + leaseSeconds * 1000);
          await tx.execute(
            sql`UPDATE ai_draft_work SET state='claimed',claim_token=${token},lease_until=${until},request_started_at=NULL,provider_request_id=NULL,updated_at=${at} WHERE run_id=${runId} AND state IN ('claimed','failed_before_request')`,
          );
          return {
            runId,
            disposition: "claimed",
            claimToken: token,
            draftId: null,
          };
        }
        const runId = randomUUID(),
          token = randomUUID(),
          until = new Date(at.getTime() + leaseSeconds * 1000);
        await tx.execute(
          sql`INSERT INTO ai_draft_work(run_id,kind,case_id,facts_hash,agent_version,idempotency_key,state,claim_token,lease_until,created_at,updated_at) VALUES(${runId},${key.kind},${key.caseId},${key.factsHash},${key.agentVersion},${key.idempotencyKey},'claimed',${token},${until},${at},${at})`,
        );
        return {
          runId,
          disposition: "claimed",
          claimToken: token,
          draftId: null,
        };
      });
    },
    async markDraftRequestStarted(input: unknown): Promise<void> {
      const token = tokenSchema.parse(input);
      await locked(async (tx) => {
        const at = now();
        const changed = rows(
          await tx.execute(
            sql`UPDATE ai_draft_work SET state='requesting',request_started_at=${at},updated_at=${at} WHERE run_id=${token.runId} AND claim_token=${token.claimToken} AND state='claimed' AND request_started_at IS NULL AND lease_until>${at} RETURNING run_id`,
          ),
        );
        if (changed.length !== 1) throw Error("DRAFT_WORK_CLAIM_CONFLICT");
      });
    },
    async finishDraftWork(input: unknown): Promise<void> {
      const result = finishSchema.parse(input);
      if (
        result.state === "succeeded" &&
        (!result.draftId || !result.providerRequestId)
      )
        throw Error("DRAFT_WORK_RECEIPT_REQUIRED");
      if (result.state !== "succeeded" && result.draftId !== null)
        throw Error("DRAFT_WORK_RESULT_INVALID");
      if (
        result.state === "failed_before_request" &&
        result.providerRequestId !== null
      )
        throw Error("DRAFT_WORK_RESULT_INVALID");
      await locked(async (tx) => {
        const previous = rows(
          await tx.execute(
            sql`SELECT * FROM ai_draft_work WHERE run_id=${result.runId} AND claim_token=${result.claimToken} FOR UPDATE`,
          ),
        )[0];
        if (!previous) throw Error("DRAFT_WORK_CLAIM_CONFLICT");
        if (
          previous.provider_request_id !== null &&
          previous.provider_request_id !== result.providerRequestId
        )
          throw Error("DRAFT_WORK_RECEIPT_CONFLICT");
        if (
          previous.state === result.state &&
          previous.draft_id === result.draftId &&
          previous.provider_request_id === result.providerRequestId
        )
          return;
        if (
          result.state === "failed_before_request"
            ? previous.state !== "claimed" ||
              previous.request_started_at !== null
            : !["requesting", "unknown"].includes(String(previous.state))
        )
          throw Error("DRAFT_WORK_CLAIM_CONFLICT");
        if (result.state === "succeeded") {
          const draft = rows(
            await tx.execute(
              sql`SELECT id FROM ai_review_drafts WHERE id=${result.draftId} AND run_id=${result.runId} AND kind=${String(previous.kind)} AND case_id=${String(previous.case_id)} AND facts_hash=${String(previous.facts_hash)}`,
            ),
          );
          if (draft.length !== 1) throw Error("DRAFT_WORK_RESULT_INVALID");
        }
        await tx.execute(
          sql`UPDATE ai_draft_work SET state=${result.state},draft_id=${result.draftId},provider_request_id=${result.providerRequestId},updated_at=${now()} WHERE run_id=${result.runId} AND claim_token=${result.claimToken}`,
        );
      });
    },
  };
}
export const draftWorkRepository = createDraftWorkRepository();
