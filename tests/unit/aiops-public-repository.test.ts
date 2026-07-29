import {describe, expect, it, vi} from "vitest";

import {aiOpsMonthlyMetricSchema} from "@/lib/aiops/contracts";
import {createAiOpsPublicRepository} from "@/lib/db/repos/aiops-public";

const valid = {
  monthStart: "2026-07-01",
  isPartialMonth: true,
  conversationCount: 15,
  terminalConversationCount: 15,
  resolvedConversationCount: 12,
  escalatedConversationCount: 3,
  failedConversationCount: 0,
  agentResolvedRate: 0.8,
  escalationRate: 0.2,
  failureRate: 0,
  medianFirstResponseMs: 800,
  firstResponseSampleCount: 15,
  csatAverage: 4.5,
  csatResponseCount: 10,
  staffHoursSaved: 1.2,
  llmCostUsd: 0.068,
  renewalDueCount: 10,
  renewalPaidCount: 9,
  renewalRate: 0.9,
  firstYearRenewalDueCount: 5,
  firstYearRenewalPaidCount: 4,
  firstYearRenewalRate: 0.8,
  refreshedAt: new Date("2026-07-30T00:00:00.000Z"),
} as const;

function rawRow(monthStart: string) {
  return {
    month_start: monthStart,
    is_partial_month: monthStart === valid.monthStart,
    conversation_count: valid.conversationCount,
    terminal_conversation_count: valid.terminalConversationCount,
    resolved_conversation_count: valid.resolvedConversationCount,
    escalated_conversation_count: valid.escalatedConversationCount,
    failed_conversation_count: valid.failedConversationCount,
    agent_resolved_rate: String(valid.agentResolvedRate),
    escalation_rate: String(valid.escalationRate),
    failure_rate: String(valid.failureRate),
    median_first_response_ms: valid.medianFirstResponseMs,
    first_response_sample_count: valid.firstResponseSampleCount,
    csat_average: String(valid.csatAverage),
    csat_response_count: valid.csatResponseCount,
    staff_hours_saved: String(valid.staffHoursSaved),
    llm_cost_usd: String(valid.llmCostUsd),
    renewal_due_count: valid.renewalDueCount,
    renewal_paid_count: valid.renewalPaidCount,
    renewal_rate: String(valid.renewalRate),
    first_year_renewal_due_count: valid.firstYearRenewalDueCount,
    first_year_renewal_paid_count: valid.firstYearRenewalPaidCount,
    first_year_renewal_rate: String(valid.firstYearRenewalRate),
    refreshed_at: valid.refreshedAt,
  };
}

describe("AI-Ops public aggregate contract", () => {
  it("accepts the approved complete public metric", () => {
    expect(aiOpsMonthlyMetricSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ["private profile field", {profileId: "private-profile"}],
    ["out-of-range rate", {agentResolvedRate: 1.01}],
    ["negative count", {failedConversationCount: -1}],
    ["unreconciled terminal outcomes", {failedConversationCount: 1}],
    ["invalid month key", {monthStart: "2026-07-02"}],
    ["invalid CSAT", {csatAverage: 5.01}],
  ])("rejects %s", (_name, mutation) => {
    expect(() => aiOpsMonthlyMetricSchema.parse({...valid, ...mutation})).toThrow();
  });
});

describe("AI-Ops public aggregate reader", () => {
  it("explicitly maps decimal fields, validates rows, and returns twelve ascending months", async () => {
    const months = Array.from({length: 12}, (_, index) => {
      const date = new Date(Date.UTC(2025, 7 + index, 1));
      return date.toISOString().slice(0, 10);
    });
    const execute = vi.fn().mockResolvedValue({rows: [...months].reverse().map(rawRow)});
    const repository = createAiOpsPublicRepository(async () => ({execute}) as never);

    await expect(repository.readLatestTwelveMonths()).resolves.toEqual(
      months.map((monthStart) => ({
        ...valid,
        monthStart,
        isPartialMonth: monthStart === valid.monthStart,
      })),
    );
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects incomplete or duplicate reporting windows", async () => {
    const rows = Array.from({length: 12}, (_, index) => rawRow(`2025-${String(index + 1).padStart(2, "0")}-01`));
    const incomplete = createAiOpsPublicRepository(async () => ({
      execute: vi.fn().mockResolvedValue({rows: rows.slice(0, 11)}),
    }) as never);
    const duplicate = createAiOpsPublicRepository(async () => ({
      execute: vi.fn().mockResolvedValue({rows: [...rows.slice(0, 11), rows[0]]}),
    }) as never);

    await expect(incomplete.readLatestTwelveMonths()).rejects.toThrow("AI_OPS_METRIC_WINDOW_INVALID");
    await expect(duplicate.readLatestTwelveMonths()).rejects.toThrow("AI_OPS_METRIC_WINDOW_INVALID");
  });
});
