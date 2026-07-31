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

function numeric(value: unknown, nullable: boolean): number | null {
  if (value === null && nullable) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("AI_OPS_METRIC_NUMERIC_INVALID");
}

function requiredNumber(value: unknown): number {
  return numeric(value, false) as number;
}

function nullableNumber(value: unknown): number | null {
  return numeric(value, true);
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
    conversationCount: requiredNumber(row.conversation_count),
    terminalConversationCount: requiredNumber(row.terminal_conversation_count),
    resolvedConversationCount: requiredNumber(row.resolved_conversation_count),
    escalatedConversationCount: requiredNumber(row.escalated_conversation_count),
    failedConversationCount: requiredNumber(row.failed_conversation_count),
    agentResolvedRate: nullableNumber(row.agent_resolved_rate),
    escalationRate: nullableNumber(row.escalation_rate),
    failureRate: nullableNumber(row.failure_rate),
    medianFirstResponseMs: nullableNumber(row.median_first_response_ms),
    firstResponseSampleCount: requiredNumber(row.first_response_sample_count),
    csatAverage: nullableNumber(row.csat_average),
    csatResponseCount: requiredNumber(row.csat_response_count),
    staffHoursSaved: requiredNumber(row.staff_hours_saved),
    llmCostUsd: requiredNumber(row.llm_cost_usd),
    renewalDueCount: requiredNumber(row.renewal_due_count),
    renewalPaidCount: requiredNumber(row.renewal_paid_count),
    renewalRate: nullableNumber(row.renewal_rate),
    firstYearRenewalDueCount: requiredNumber(row.first_year_renewal_due_count),
    firstYearRenewalPaidCount: requiredNumber(row.first_year_renewal_paid_count),
    firstYearRenewalRate: nullableNumber(row.first_year_renewal_rate),
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
