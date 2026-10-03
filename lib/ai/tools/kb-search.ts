import {z} from "zod";
import {knowledgeRefSchema} from "@/lib/ai/knowledge/policy";

import type {AgentTool} from "@/lib/ai/provider";
import {
  auditBestEffort,
  canonicalHttpsUrl,
  createTool,
  durationSince,
  ok,
  parseToolInput,
  sourceId,
  type ConciergeToolContext,
} from "@/lib/ai/tools/shared";

export const kbSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  k: z.number().int().min(1).max(10),
}).strict();

export function createKbSearchTool(context: ConciergeToolContext): AgentTool {
  return createTool(
    "Search the approved WTIA knowledge base for the current locale.",
    kbSearchInputSchema,
    async (input) => {
      const parsed = await parseToolInput(
        context, "kb_search", kbSearchInputSchema, input,
      );
      const startedAt = Date.now();
      try {
        const queryEmbedding = await context.embedding.embed(parsed.query);
        const rows = await context.repositories.searchKnowledge(context.actor, {
          namespace: "m4a-core-v1",
          locale: context.locale,
          queryEmbedding,
          k: parsed.k,
        });
        const records: unknown[] = [];
        const citations: Array<{
          sourceId: string;
          title: string;
          url: string;
          retrievalScore: number;
        }> = [];
        for (const row of rows.slice(0, parsed.k)) {
          const url = canonicalHttpsUrl(row.url);
          const approved = knowledgeRefSchema.safeParse(row.ref);
          if (!url || !approved.success || approved.data.locale !== context.locale || approved.data.audience !== "public") continue;
          const confidence = Math.max(0, Math.min(1, row.score));
          const citation = {
            sourceId: sourceId("kb", [approved.data.sourceId, approved.data.version, approved.data.contentHash, context.locale].join(":")),
            title: row.title.slice(0, 200),
            url,
            retrievalScore: confidence,
          };
          citations.push(citation);
          records.push(Object.freeze({
            code: "ok",
            title: citation.title,
            excerpt: row.excerpt,
            retrievalScore: confidence,
            knowledgeRef: approved.data,
            offsetStart: row.offsetStart,
            offsetEnd: row.offsetEnd,
            citation,
          }));
        }
        await auditBestEffort(context, {
          tool: "kb_search",
          phase: "outcome",
          outcome: "success",
          durationMs: durationSince(startedAt),
          count: records.length,
        });
        return records.length ? ok(records, citations) : ok([{code: "knowledge_handoff_required"}]);
      } catch {
        await auditBestEffort(context, {
          tool: "kb_search",
          phase: "outcome",
          outcome: "error",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "kb_search_failed"}]);
      }
    },
  );
}
