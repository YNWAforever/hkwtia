import {z} from "zod";

import type {RetentionCandidate} from "@/lib/ai/retention-analyst/candidates";

const riskCodeSchema = z.enum([
  "low_score_declining",
  "inactive_before_renewal",
]);

export const retentionDraftSchema = z.object({
  subject: z.string().min(1).max(160),
  body: z.string().min(1).max(4000),
  reasonCodes: z.array(riskCodeSchema).min(1),
}).strict();

export type RetentionDraft = z.infer<typeof retentionDraftSchema>;

export const retentionFactPackSchema = z.object({
  locale: z.enum(["en", "zh-HK"]),
  planCode: z.string().min(1),
  renewalDate: z.string().nullable(),
  score: z.number().finite(),
  trend: z.enum(["up", "flat", "down"]),
  riskCodes: z.array(riskCodeSchema).min(1),
}).strict();

export type RetentionFactPack = z.infer<typeof retentionFactPackSchema>;

function factPackFrom(candidate: RetentionCandidate): RetentionFactPack {
  return retentionFactPackSchema.parse({
    locale: candidate.locale,
    planCode: candidate.planCode,
    renewalDate: candidate.renewalDate,
    score: candidate.score,
    trend: candidate.trend,
    riskCodes: candidate.riskCodes,
  });
}

export function serializeRetentionFactPack(candidate: RetentionCandidate): string {
  return JSON.stringify(factPackFrom(candidate));
}

export function buildRetentionDraftPrompt(candidate: RetentionCandidate): string {
  return [
    `Candidate locale: ${candidate.locale}.`,
    "Produce one JSON object only. Do not include Markdown or commentary.",
    "Use only the approved facts and reason codes in this fact pack:",
    serializeRetentionFactPack(candidate),
  ].join("\n");
}
