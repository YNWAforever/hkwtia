import {z} from "zod";

import {
  evaluateFundingEligibility,
  type FundingEligibilityInput,
} from "@/config/funding-schemes";
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

const money = z.number().finite().nonnegative().max(1_000_000_000_000);
export const fundingInputSchema = z.object({
  hongKongIncorporated: z.boolean(),
  hongKongBusinessRegistered: z.boolean(),
  operatesInHongKong: z.boolean(),
  nonSubvented: z.boolean(),
  expansionProjectInCoveredEconomy: z.boolean(),
  advancedTechnologyTraining: z.boolean(),
  traineeHongKongPermanentResident: z.boolean(),
  smartProductionLineInHongKong: z.boolean(),
  targetSector: z.enum([
    "life-health",
    "ai-data-science",
    "advanced-manufacturing-new-energy",
    "other",
  ]),
  enterpriseInvestmentHkd: money,
  totalProjectCostHkd: money,
  eligibleAppliedRdOrPartnershipExpenditureHkd: money,
}).strict();

export function createFundingTool(context: ConciergeToolContext): AgentTool {
  return createTool(
    "Screen strict eligibility facts against WTIA's immutable funding catalogue.",
    fundingInputSchema,
    async (input) => {
      const parsed = await parseToolInput(
        context, "get_funding_schemes", fundingInputSchema, input,
      ) as FundingEligibilityInput;
      const startedAt = Date.now();
      try {
        const rows = evaluateFundingEligibility(parsed, context.locale);
        const values: unknown[] = [];
        const citations: Array<{sourceId: string; title: string; url: string}> = [];
        for (const row of rows.slice(0, 5)) {
          const url = canonicalHttpsUrl(row.sourceUrl);
          if (!url) continue;
          const citation = {
            sourceId: sourceId("funding", row.id),
            title: row.name,
            url,
          };
          citations.push(citation);
          values.push(Object.freeze({
            code: "ok",
            id: row.id,
            name: row.name,
            summary: row.summary,
            potentiallyEligible: row.potentiallyEligible,
            sources: [url],
            asOf: row.asOf,
            disclaimer: row.disclaimer,
            citation,
          }));
        }
        await auditBestEffort(context, {
          tool: "get_funding_schemes",
          phase: "outcome",
          outcome: "success",
          durationMs: durationSince(startedAt),
          count: values.length,
        });
        return ok(values, citations);
      } catch {
        await auditBestEffort(context, {
          tool: "get_funding_schemes",
          phase: "outcome",
          outcome: "error",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "funding_match_failed"}]);
      }
    },
  );
}
