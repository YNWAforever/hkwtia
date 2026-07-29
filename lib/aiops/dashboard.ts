import {aiOpsMonthlyMetricSchema, type AiOpsMonthlyMetric} from "@/lib/aiops/contracts";

const FRESHNESS_MS = 120 * 60 * 1000;

export const AI_OPS_DASHBOARD_INVALID = "AI_OPS_DASHBOARD_INVALID";

export type AiOpsDashboardState =
  | Readonly<{
      status: "fresh" | "stale";
      current: AiOpsMonthlyMetric;
      months: readonly AiOpsMonthlyMetric[];
      ageMs: number;
    }>
  | Readonly<{
      status: "empty";
      current: null;
      months: readonly AiOpsMonthlyMetric[];
    }>
  | Readonly<{
      status: "unavailable";
      current: null;
      months: readonly [];
    }>;

function invalidDashboardState(): never {
  throw new Error(AI_OPS_DASHBOARD_INVALID);
}

function currentHongKongMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) invalidDashboardState();
  return `${year}-${month}-01`;
}

export function buildAiOpsDashboardState(
  rows: readonly AiOpsMonthlyMetric[],
  now: Date,
): AiOpsDashboardState {
  if (!Array.isArray(rows) || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    invalidDashboardState();
  }
  if (rows.length !== 12) invalidDashboardState();

  let previousMonthStart = "";
  let newestRefreshedAt = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const parsed = aiOpsMonthlyMetricSchema.safeParse(row);
    if (!parsed.success || row.monthStart <= previousMonthStart) invalidDashboardState();
    previousMonthStart = row.monthStart;
    newestRefreshedAt = Math.max(newestRefreshedAt, row.refreshedAt.getTime());
  }

  const ageMs = now.getTime() - newestRefreshedAt;
  if (!Number.isFinite(newestRefreshedAt) || ageMs < 0) invalidDashboardState();

  const current = rows.find((row) => row.monthStart === currentHongKongMonth(now));
  if (!current) return {status: "empty", current: null, months: rows};

  return {
    status: ageMs <= FRESHNESS_MS ? "fresh" : "stale",
    current,
    months: rows,
    ageMs,
  };
}

export function unavailableAiOpsDashboardState(): AiOpsDashboardState {
  return {status: "unavailable", current: null, months: []};
}
