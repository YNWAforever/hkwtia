import {describe, expect, it} from "vitest";

import {
  BOARD_REPORTER_AGENT_CONFIG,
  BOARD_REPORTER_SYSTEM_PROMPT,
} from "@/config/agents/board-reporter";
import {
  boardFactPackSchema,
  boardNarrativeSchema,
  buildBoardNarrativePrompt,
  type BoardFactPack,
} from "@/lib/ai/board-reporter/contracts";

const facts: BoardFactPack = {
  reportMonth: "2026-06",
  window: {
    from: "2026-06-01",
    to: "2026-06-30",
    timezone: "Asia/Hong_Kong",
  },
  metrics: [
    {id: "arr_hkd", value: 3240, unit: "HKD"},
    {id: "mrr_hkd", value: 270, unit: "HKD"},
    {
      id: "renewal_rate",
      value: 66.7,
      unit: "percent",
      numerator: 2,
      denominator: 3,
    },
    {
      id: "first_year_renewal_rate",
      value: 50,
      unit: "percent",
      numerator: 1,
      denominator: 2,
    },
    {id: "funnel_started", value: 6, unit: "count"},
    {id: "funnel_profile_completed", value: 5, unit: "count"},
    {id: "funnel_checkout_or_review", value: 4, unit: "count"},
    {id: "funnel_activated", value: 3, unit: "count"},
    {
      id: "attendance_rate",
      value: 75,
      unit: "percent",
      numerator: 3,
      denominator: 4,
    },
    {id: "at_risk_count", value: 2, unit: "count"},
  ],
};

describe("Board Reporter contracts", () => {
  it("uses the fixed board-reporter-v1 model configuration without tools", () => {
    expect(BOARD_REPORTER_AGENT_CONFIG).toMatchObject({
      name: "board_reporter",
      version: "board-reporter-v1",
      model: "openai:gpt-4.1-mini",
      tools: [],
    });
    expect(BOARD_REPORTER_SYSTEM_PROMPT).toContain("immutable");
    expect(BOARD_REPORTER_SYSTEM_PROMPT).toContain("must not invent comparisons");
  });

  it("accepts only bounded narrative fields and rejects model-supplied KPI data", () => {
    const narrative = {
      executiveSummary: "Membership performance remained stable.",
      highlights: ["Activation completed for three applications."],
      risks: ["Two members remain at risk."],
      recommendedActions: ["Review the at-risk member queue."],
    };

    expect(boardNarrativeSchema.parse(narrative)).toEqual(narrative);
    expect(() => boardNarrativeSchema.parse({...narrative, metrics: facts.metrics})).toThrow();
    expect(() => boardNarrativeSchema.parse({...narrative, reportMonth: "2027-01"})).toThrow();
  });

  it("enforces the authoritative metric IDs, order, units, and reconciled values", () => {
    expect(boardFactPackSchema.parse(facts)).toEqual(facts);
    expect(() => boardFactPackSchema.parse({...facts, metrics: [...facts.metrics].reverse()})).toThrow();
    expect(() => boardFactPackSchema.parse({...facts, metrics: facts.metrics.map((metric) => ({...metric, unit: "tokens"}))})).toThrow();
  });

  it("serializes the immutable app-owned fact pack separately from requested prose", () => {
    const prompt = buildBoardNarrativePrompt(facts);
    expect(prompt).toContain(JSON.stringify(facts));
    expect(prompt).toContain("Do not return KPI values");
    expect(prompt).toContain("Do not invent comparisons");
  });
});
