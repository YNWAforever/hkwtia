import "server-only";

import {sql} from "drizzle-orm";

import {
  aiOpsMonthlyMetricSchema,
  type AiOpsMonthlyMetric,
} from "@/lib/aiops/contracts";
import {getDb, type Database} from "@/lib/db/repos/common";

export type AiOpsPublicRepository = Readonly<{
  readLatestTwelveMonths: () => Promise<readonly AiOpsMonthlyMetric[]>;
}>;

type DatabaseLoader = () => Promise<Database>;

function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function date(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new Error("AI_OPS_METRIC_DATE_INVALID");
  return parsed;
}

function monthStart(value: unknown): string {
  if (typeof value === "string") return value;
  return date(value).toISOString().slice(0, 10);
}

function metricFrom(row: Record<string, unknown>): AiOpsMonthlyMetric {
  return aiOpsMonthlyMetricSchema.parse({
    monthStart: monthStart(row.month_start),
    isPartialMonth: row.is_partial_month,
    conversationCount: Number(row.conversation_count),
    terminalConversationCount: Number(row.terminal_conversation_count),
    resolvedConversationCount: Number(row.resolved_conversation_count),
    escalatedConversationCount: Number(row.escalated_conversation_count),
    failedConversationCount: Number(row.failed_conversation_count),
    agentResolvedRate: numberOrNull(row.agent_resolved_rate),
    escalationRate: numberOrNull(row.escalation_rate),
    failureRate: numberOrNull(row.failure_rate),
    medianFirstResponseMs: numberOrNull(row.median_first_response_ms),
    firstResponseSampleCount: Number(row.first_response_sample_count),
    csatAverage: numberOrNull(row.csat_average),
    csatResponseCount: Number(row.csat_response_count),
    staffHoursSaved: Number(row.staff_hours_saved),
    llmCostUsd: Number(row.llm_cost_usd),
    renewalDueCount: Number(row.renewal_due_count),
    renewalPaidCount: Number(row.renewal_paid_count),
    renewalRate: numberOrNull(row.renewal_rate),
    firstYearRenewalDueCount: Number(row.first_year_renewal_due_count),
    firstYearRenewalPaidCount: Number(row.first_year_renewal_paid_count),
    firstYearRenewalRate: numberOrNull(row.first_year_renewal_rate),
    refreshedAt: date(row.refreshed_at),
  });
}

export function createAiOpsPublicRepository(
  loadDatabase: DatabaseLoader = getDb,
): AiOpsPublicRepository {
  return {
    async readLatestTwelveMonths(): Promise<readonly AiOpsMonthlyMetric[]> {
      const database = await loadDatabase();
      const rows = resultRows(await database.execute(sql`
        SELECT
          month_start,
          is_partial_month,
          conversation_count,
          terminal_conversation_count,
          resolved_conversation_count,
          escalated_conversation_count,
          failed_conversation_count,
          agent_resolved_rate,
          escalation_rate,
          failure_rate,
          median_first_response_ms,
          first_response_sample_count,
          csat_average,
          csat_response_count,
          staff_hours_saved,
          llm_cost_usd,
          renewal_due_count,
          renewal_paid_count,
          renewal_rate,
          first_year_renewal_due_count,
          first_year_renewal_paid_count,
          first_year_renewal_rate,
          refreshed_at
        FROM aiops_monthly_metrics
        ORDER BY month_start ASC
      `));
      const metrics = rows.map(metricFrom).sort((left, right) =>
        left.monthStart.localeCompare(right.monthStart));
      const monthKeys = new Set(metrics.map(({monthStart: key}) => key));
      if (metrics.length !== 12 || monthKeys.size !== 12) {
        throw new Error("AI_OPS_METRIC_WINDOW_INVALID");
      }
      return metrics;
    },
  };
}

export const aiOpsPublicRepository = createAiOpsPublicRepository();
