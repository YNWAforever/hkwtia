import "server-only";

import {reconcileReportFacts, type RawReportFacts} from "@/lib/admin/report-formulas";
import type {ReportUtcWindow} from "@/lib/admin/reports";
import {boardFactPackSchema, type BoardFactPack, type BoardMetric} from "@/lib/ai/board-reporter/contracts";
import {previousHongKongMonthWindow} from "@/lib/ai/board-reporter/reporting-window";
import {requireScheduledAgent, type Actor} from "@/lib/auth/agent-actor";
import {reportsRepository} from "@/lib/db/repos/reports";

export type BoardFactsReader = Readonly<{
  readBoardFacts: (actor: Actor, window: ReportUtcWindow) => Promise<RawReportFacts>;
}>;

export async function buildBoardFactPack(
  actor: Actor,
  asOf: Date,
  reader: BoardFactsReader = reportsRepository,
): Promise<BoardFactPack> {
  const scheduledActor = requireScheduledAgent(actor, "board_reporter");
  const window = previousHongKongMonthWindow(asOf);
  const facts = await reader.readBoardFacts(scheduledActor, window.utc);
  const report = reconcileReportFacts(facts, window.display);
  const metrics: readonly BoardMetric[] = [
    {id: "arr_hkd", value: report.revenue.arrHkd, unit: "HKD"},
    {id: "mrr_hkd", value: report.revenue.mrrHkd, unit: "HKD"},
    {
      id: "renewal_rate",
      value: report.renewal.percentage,
      unit: "percent",
      numerator: report.renewal.numerator,
      denominator: report.renewal.denominator,
    },
    {
      id: "first_year_renewal_rate",
      value: report.firstYearRenewal.percentage,
      unit: "percent",
      numerator: report.firstYearRenewal.numerator,
      denominator: report.firstYearRenewal.denominator,
    },
    {id: "funnel_started", value: report.funnel.started, unit: "count"},
    {
      id: "funnel_profile_completed",
      value: report.funnel.profileCompleted,
      unit: "count",
    },
    {
      id: "funnel_checkout_or_review",
      value: report.funnel.checkoutOrReview,
      unit: "count",
    },
    {id: "funnel_activated", value: report.funnel.activated, unit: "count"},
    {
      id: "attendance_rate",
      value: report.attendance.percentage,
      unit: "percent",
      numerator: report.attendance.numerator,
      denominator: report.attendance.denominator,
    },
    {id: "at_risk_count", value: report.atRiskCount, unit: "count"},
  ];

  return boardFactPackSchema.parse({
    reportMonth: window.reportMonth,
    window: report.window,
    metrics,
  });
}
