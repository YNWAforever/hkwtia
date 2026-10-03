import {render, screen} from "@testing-library/react";
import {expect, it} from "vitest";
import {MetricGrid} from "@/components/marketing/aiops/metric-grid";
import type {AiOpsDashboardLabels} from "@/components/marketing/aiops/dashboard";
import type {AiOpsMonthlyMetric} from "@/lib/aiops/contracts";
// Every exercised label has a stable synthetic value; this tests the cost card alone.
const labels = new Proxy(
  {notEnoughData: "Unknown usage"},
  {
    get: (target, key) =>
      key === "notEnoughData" ? target.notEnoughData : String(key),
  },
) as AiOpsDashboardLabels;
const metric: AiOpsMonthlyMetric = {
  monthStart: "2026-10-01",
  isPartialMonth: true,
  conversationCount: 1,
  terminalConversationCount: 1,
  resolvedConversationCount: 0,
  escalatedConversationCount: 0,
  failedConversationCount: 1,
  agentResolvedRate: 0,
  escalationRate: 0,
  failureRate: 1,
  medianFirstResponseMs: 1,
  firstResponseSampleCount: 1,
  csatAverage: 4,
  csatResponseCount: 1,
  staffHoursSaved: 0,
  llmCostUsd: null,
  renewalDueCount: 0,
  renewalPaidCount: 0,
  renewalRate: null,
  firstYearRenewalDueCount: 0,
  firstYearRenewalPaidCount: 0,
  firstYearRenewalRate: null,
  refreshedAt: new Date(),
};
it("renders the cost card as unknown rather than a zero-dollar bill", () => {
  render(<MetricGrid metric={metric} locale="en" labels={labels} />);
  expect(
    screen.getByText("llmCost").parentElement?.querySelector("strong"),
  ).toHaveTextContent("Unknown usage");
});
