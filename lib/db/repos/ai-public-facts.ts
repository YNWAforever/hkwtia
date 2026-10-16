import "server-only";
import { sql } from "drizzle-orm";
import {
  requireConciergeAgent,
  type ConciergeAgentActor,
} from "@/lib/auth/agent-actor";
import { knowledgeRefSchema } from "@/lib/ai/knowledge/contracts";
import type { AgentCitation } from "@/lib/ai/provider";
import {
  approvedFactPackSchema,
  type ApprovedFactPack,
} from "@/lib/ai/drafts/contracts";
import { approvedFactsHash } from "@/lib/ai/drafts/validation";
import { draftFactLabels } from "@/lib/ai/drafts/fact-labels";
import { publicFactValues } from "@/lib/ai/drafts/public-facts";
import type { KbDatabaseLoader } from "./kb-documents";
import { getDb } from "./common";
function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result;
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  )
    return result.rows as Record<string, unknown>[];
  throw Error("CONCIERGE_FACT_READ_INVALID");
}
/** Public scope only, including signed-in members. No profile facts are inferred from email or model citations. */
export function createPublicConciergeFactsReader(
  load: KbDatabaseLoader = async () => (await getDb()) as never,
) {
  return async (
    input: Readonly<{
      actor: ConciergeAgentActor;
      locale: "en" | "zh-HK";
      conversationId: string;
      citations: readonly AgentCitation[];
      asOf: Date;
    }>,
  ): Promise<ApprovedFactPack> => {
    const actor = requireConciergeAgent(input.actor);
    if (
      actor.conversationId !== input.conversationId ||
      !Number.isFinite(input.asOf.getTime()) ||
      input.citations.length > 8
    )
      throw Error("CONCIERGE_FACT_SCOPE_INVALID");
    const refs = [
      ...new Map(
        input.citations
          .filter((c) => c.knowledgeRef)
          .map((c) => {
            const ref = knowledgeRefSchema.parse(c.knowledgeRef);
            if (ref.audience !== "public" || ref.locale !== input.locale)
              throw Error("CONCIERGE_FACT_SCOPE_INVALID");
            return [JSON.stringify(ref), ref] as const;
          }),
      ).values(),
    ];
    const database = await load();
    return database.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('hkwtia-knowledge-governance-v1',0))`,
      );
      if (
        !rows(
          await tx.execute(
            sql`SELECT id FROM agent_runs WHERE id=${actor.runId} AND agent='concierge' AND conversation_id=${actor.conversationId} AND profile_id IS NOT DISTINCT FROM ${actor.profileId} AND status='running' FOR SHARE`,
          ),
        ).length
      )
        throw Error("CONCIERGE_FACT_ACTOR_INVALID");
      const values: ApprovedFactPack["values"] = {},
        sourceUrls: Record<string, string> = {};
      for (const ref of refs) {
        const sources = rows(
          await tx.execute(
            sql`SELECT structured_facts,url FROM kb_documents WHERE source_id=${ref.sourceId} AND version=${Number(ref.version)} AND locale=${ref.locale} AND audience='public' AND namespace='m4a-core-v1' AND content_hash=${ref.contentHash} AND approval_state='approved' AND index_state='ready' AND effective_from=${new Date(ref.effectiveFrom)} AND effective_to IS NOT DISTINCT FROM ${ref.effectiveTo ? new Date(ref.effectiveTo) : null} AND effective_from<=${input.asOf} AND (effective_to IS NULL OR effective_to>${input.asOf}) AND review_due>${input.asOf} ORDER BY chunk_start,id LIMIT 1 FOR SHARE`,
          ),
        );
        if (!sources.length) throw Error("CONCIERGE_FACT_SOURCE_CHANGED");
        const source = sources[0]!;
        if (
          !source.structured_facts ||
          typeof source.structured_facts !== "object" ||
          Array.isArray(source.structured_facts)
        )
          throw Error("CONCIERGE_FACT_FORMAT_INVALID");
        for (const [field, value] of Object.entries(
          publicFactValues(
            ref.sourceId,
            input.locale,
            source.structured_facts as Record<string, unknown>,
          ),
        )) {
          if (
            values[field] &&
            JSON.stringify(values[field]) !== JSON.stringify(value)
          )
            throw Error("CONCIERGE_FACT_SOURCE_CONFLICT");
          values[field] = value;
        }
        sourceUrls[ref.sourceId] = String(source.url);
      }
      const facts: ApprovedFactPack = {
        caseId: input.conversationId,
        locale: input.locale,
        versionHash: "0".repeat(64),
        asOf: input.asOf.toISOString(),
        values,
        sourceRefs: refs,
        recordSources: {},
        sourceUrls,
        comparisonAvailable: null,
        displayLabels: draftFactLabels(input.locale).displayLabels,
      };
      return approvedFactPackSchema.parse({
        ...facts,
        versionHash: approvedFactsHash(facts),
      });
    });
  };
}
export const publicConciergeFactsReader = createPublicConciergeFactsReader();
