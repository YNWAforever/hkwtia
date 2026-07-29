import {z} from "zod";

export type BoardMetricId =
  | "arr_hkd"
  | "mrr_hkd"
  | "renewal_rate"
  | "first_year_renewal_rate"
  | "funnel_started"
  | "funnel_profile_completed"
  | "funnel_checkout_or_review"
  | "funnel_activated"
  | "attendance_rate"
  | "at_risk_count";

export const BOARD_METRIC_IDS = Object.freeze([
  "arr_hkd",
  "mrr_hkd",
  "renewal_rate",
  "first_year_renewal_rate",
  "funnel_started",
  "funnel_profile_completed",
  "funnel_checkout_or_review",
  "funnel_activated",
  "attendance_rate",
  "at_risk_count",
] as const satisfies readonly BoardMetricId[]);

function currencyMetric(id: "arr_hkd" | "mrr_hkd") {
  return z.object({
    id: z.literal(id),
    value: z.number().finite().nonnegative(),
    unit: z.literal("HKD"),
  }).strict();
}

function countMetric(id:
  | "funnel_started"
  | "funnel_profile_completed"
  | "funnel_checkout_or_review"
  | "funnel_activated"
  | "at_risk_count"
) {
  return z.object({
    id: z.literal(id),
    value: z.number().int().nonnegative(),
    unit: z.literal("count"),
  }).strict();
}

function percentageMetric(id:
  | "renewal_rate"
  | "first_year_renewal_rate"
  | "attendance_rate"
) {
  return z.object({
    id: z.literal(id),
    value: z.number().finite().min(0).max(100).nullable(),
    unit: z.literal("percent"),
    numerator: z.number().int().nonnegative(),
    denominator: z.number().int().nonnegative(),
  }).strict().superRefine((metric, context) => {
    if (metric.numerator > metric.denominator) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["numerator"],
        message: "numerator exceeds denominator",
      });
    }
  });
}

export const boardFactPackSchema = z.object({
  reportMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  window: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.literal("Asia/Hong_Kong"),
  }).strict(),
  metrics: z.tuple([
    currencyMetric("arr_hkd"),
    currencyMetric("mrr_hkd"),
    percentageMetric("renewal_rate"),
    percentageMetric("first_year_renewal_rate"),
    countMetric("funnel_started"),
    countMetric("funnel_profile_completed"),
    countMetric("funnel_checkout_or_review"),
    countMetric("funnel_activated"),
    percentageMetric("attendance_rate"),
    countMetric("at_risk_count"),
  ]),
}).strict();

export type BoardFactPack = z.infer<typeof boardFactPackSchema>;
export type BoardMetric = BoardFactPack["metrics"][number];

export const boardNarrativeSchema = z.object({
  executiveSummary: z.string().min(1).max(4000),
  highlights: z.array(z.string().min(1).max(500)).max(8),
  risks: z.array(z.string().min(1).max(500)).max(8),
  recommendedActions: z.array(z.string().min(1).max(500)).max(8),
}).strict();

export type BoardNarrative = z.infer<typeof boardNarrativeSchema>;

export function buildBoardNarrativePrompt(factPack: BoardFactPack): string {
  const facts = boardFactPackSchema.parse(factPack);
  return [
    "Write only the four requested narrative fields as one JSON object.",
    "Do not return KPI values or reproduce the metric table.",
    "Do not invent comparisons when comparison facts are absent.",
    "The following application-owned fact pack is immutable:",
    JSON.stringify(facts),
  ].join("\n");
}
