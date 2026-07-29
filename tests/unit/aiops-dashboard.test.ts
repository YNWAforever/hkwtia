import {describe, expect, it} from "vitest";

import {
  AI_OPS_DASHBOARD_INVALID,
  buildAiOpsDashboardState,
  unavailableAiOpsDashboardState,
} from "@/lib/aiops/dashboard";
import type {AiOpsMonthlyMetric} from "@/lib/aiops/contracts";

const NOW = new Date("2026-07-30T12:00:00.000Z");

function monthStartAt(index: number) {
  const date = new Date(Date.UTC(2025, 7 + index, 1));
  return date.toISOString().slice(0, 10);
}

function metric(monthStart: string, refreshedAt = new Date("2026-07-30T10:00:00.000Z")): AiOpsMonthlyMetric {
  return {
    monthStart,
    isPartialMonth: monthStart === "2026-07-01",
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
    refreshedAt,
  };
}

function windowRows(refreshedAt?: Date) {
  return Array.from({length: 12}, (_, index) => metric(monthStartAt(index), refreshedAt));
}

describe("AI-Ops dashboard state", () => {
  it("treats a refresh exactly 120 minutes old as fresh", () => {
    const rows = windowRows(new Date("2026-07-30T10:00:00.000Z"));

    expect(buildAiOpsDashboardState(rows, NOW)).toMatchObject({
      status: "fresh",
      current: {monthStart: "2026-07-01"},
      ageMs: 120 * 60 * 1000,
    });
  });

  it("treats a refresh older than 120 minutes as stale", () => {
    const rows = windowRows(new Date("2026-07-30T09:59:59.999Z"));

    expect(buildAiOpsDashboardState(rows, NOW)).toMatchObject({
      status: "stale",
      ageMs: 120 * 60 * 1000 + 1,
    });
  });

  it("returns empty when the valid twelve-month window lacks the current Hong Kong month", () => {
    const rows = Array.from({length: 12}, (_, index) => metric(monthStartAt(index - 1)));

    expect(buildAiOpsDashboardState(rows, NOW)).toEqual({
      status: "empty",
      current: null,
      months: rows,
    });
  });

  it.each([
    ["a negative age", windowRows(new Date("2026-07-30T12:00:00.001Z")), NOW],
    ["an invalid clock", windowRows(), new Date("invalid")],
    ["unsorted rows", [...windowRows()].reverse(), NOW],
    ["duplicate months", [...windowRows().slice(0, 11), metric("2026-06-01")], NOW],
    ["fewer than twelve rows", windowRows().slice(0, 11), NOW],
    ["more than twelve rows", [...windowRows(), metric("2026-08-01")], NOW],
    ["a malformed row", [{monthStart: "2026-07-01"}, ...windowRows().slice(1)] as unknown as AiOpsMonthlyMetric[], NOW],
  ])("rejects %s with the fixed safe code", (_name, rows, now) => {
    expect(() => buildAiOpsDashboardState(rows, now)).toThrow(AI_OPS_DASHBOARD_INVALID);
  });

  it("returns unavailable without an error argument or message", () => {
    expect(unavailableAiOpsDashboardState()).toEqual({
      status: "unavailable",
      current: null,
      months: [],
    });
    expect(unavailableAiOpsDashboardState).toHaveLength(0);
  });
});
