import {z} from "zod";

export const aiOpsMonthlyMetricSchema = z.object({
  monthStart: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  isPartialMonth: z.boolean(),
  conversationCount: z.number().int().nonnegative(),
  terminalConversationCount: z.number().int().nonnegative(),
  resolvedConversationCount: z.number().int().nonnegative(),
  escalatedConversationCount: z.number().int().nonnegative(),
  failedConversationCount: z.number().int().nonnegative(),
  agentResolvedRate: z.number().finite().min(0).max(1).nullable(),
  escalationRate: z.number().finite().min(0).max(1).nullable(),
  failureRate: z.number().finite().min(0).max(1).nullable(),
  medianFirstResponseMs: z.number().int().nonnegative().nullable(),
  firstResponseSampleCount: z.number().int().nonnegative(),
  csatAverage: z.number().finite().min(1).max(5).nullable(),
  csatResponseCount: z.number().int().nonnegative(),
  staffHoursSaved: z.number().finite().nonnegative(),
  llmCostUsd: z.number().finite().nonnegative(),
  renewalDueCount: z.number().int().nonnegative(),
  renewalPaidCount: z.number().int().nonnegative(),
  renewalRate: z.number().finite().min(0).max(1).nullable(),
  firstYearRenewalDueCount: z.number().int().nonnegative(),
  firstYearRenewalPaidCount: z.number().int().nonnegative(),
  firstYearRenewalRate: z.number().finite().min(0).max(1).nullable(),
  refreshedAt: z.date(),
}).strict().superRefine((value, context) => {
  if (
    value.resolvedConversationCount
      + value.escalatedConversationCount
      + value.failedConversationCount
    !== value.terminalConversationCount
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "terminal outcome counts must reconcile",
    });
  }
});

export type AiOpsMonthlyMetric = z.infer<typeof aiOpsMonthlyMetricSchema>;
