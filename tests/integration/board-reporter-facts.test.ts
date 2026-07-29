import {drizzle} from "drizzle-orm/pg-proxy";
import {beforeEach, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));

vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {buildBoardFactPack, type BoardFactsReader} from "@/lib/ai/board-reporter/facts";
import type {ScheduledAgentActor} from "@/lib/auth/agent-actor";
import {reportsRepository} from "@/lib/db/repos/reports";

const boardReporter: ScheduledAgentActor = {
  kind: "agent",
  agent: "board_reporter",
  runId: "11111111-1111-4111-8111-111111111111",
  conversationId: null,
  profileId: null,
  trigger: "scheduled",
};

const retentionAnalyst: ScheduledAgentActor = {
  ...boardReporter,
  agent: "retention_analyst",
};

describe("Board Reporter facts", () => {
  beforeEach(() => {
    database.current = null;
  });

  it("reuses reconciled report formulas and emits the fixed ordered KPI pack", async () => {
    let seenActor: unknown;
    let seenWindow: unknown;
    const reader: BoardFactsReader = {
      readBoardFacts: async (actor, window) => {
        seenActor = actor;
        seenWindow = window;
        return {
          revenueMemberships: [
            {status: "active", interval: "annual", annualPriceHkd: 1800, monthlyPriceHkd: null},
            {status: "active", interval: "monthly", annualPriceHkd: null, monthlyPriceHkd: 120},
          ],
          renewal: {paid: 2, due: 3, firstYearPaid: 1, firstYearDue: 2},
          funnel: {started: 6, profileCompleted: 5, checkoutOrReview: 4, activated: 3},
          attendance: {attended: 3, eligible: 4},
          atRiskCount: 2,
        };
      },
    };

    const pack = await buildBoardFactPack(
      boardReporter,
      new Date("2026-07-29T02:00:00.000Z"),
      reader,
    );

    expect(seenActor).toBe(boardReporter);
    expect(seenWindow).toEqual({
      from: new Date("2026-05-31T16:00:00.000Z"),
      toExclusive: new Date("2026-06-30T16:00:00.000Z"),
      asOf: new Date("2026-06-30T16:00:00.000Z"),
    });
    expect(pack).toEqual({
      reportMonth: "2026-06",
      window: {
        from: "2026-06-01",
        to: "2026-06-30",
        timezone: "Asia/Hong_Kong",
      },
      metrics: [
        {id: "arr_hkd", value: 3240, unit: "HKD"},
        {id: "mrr_hkd", value: 270, unit: "HKD"},
        {id: "renewal_rate", value: 66.7, unit: "percent", numerator: 2, denominator: 3},
        {id: "first_year_renewal_rate", value: 50, unit: "percent", numerator: 1, denominator: 2},
        {id: "funnel_started", value: 6, unit: "count"},
        {id: "funnel_profile_completed", value: 5, unit: "count"},
        {id: "funnel_checkout_or_review", value: 4, unit: "count"},
        {id: "funnel_activated", value: 3, unit: "count"},
        {id: "attendance_rate", value: 75, unit: "percent", numerator: 3, denominator: 4},
        {id: "at_risk_count", value: 2, unit: "count"},
      ],
    });
  });

  it("authorizes the exact board_reporter identity before using a fact reader", async () => {
    let calls = 0;
    const reader: BoardFactsReader = {
      readBoardFacts: async () => {
        calls += 1;
        throw new Error("must not read");
      },
    };

    await expect(buildBoardFactPack(
      retentionAnalyst,
      new Date("2026-07-29T02:00:00.000Z"),
      reader,
    )).rejects.toThrow("FORBIDDEN");
    expect(calls).toBe(0);
  });

  it("exposes the existing aggregate query through a board_reporter-only repository method", async () => {
    let queries = 0;
    database.current = drizzle(async () => {
      queries += 1;
      return {rows: [{
        revenueMemberships: [],
        renewalPaid: 0,
        renewalDue: 0,
        firstYearPaid: 0,
        firstYearDue: 0,
        funnelStarted: 0,
        funnelProfileCompleted: 0,
        funnelCheckoutOrReview: 0,
        funnelActivated: 0,
        attendanceAttended: 0,
        attendanceEligible: 0,
        atRiskCount: 4,
      }]};
    });
    const window = {
      from: new Date("2026-05-31T16:00:00.000Z"),
      toExclusive: new Date("2026-06-30T16:00:00.000Z"),
      asOf: new Date("2026-06-30T16:00:00.000Z"),
    };

    await expect(reportsRepository.readBoardFacts(retentionAnalyst, window)).rejects.toThrow("FORBIDDEN");
    expect(queries).toBe(0);

    const facts = await reportsRepository.readBoardFacts(boardReporter, window);
    expect(facts.atRiskCount).toBe(4);
    expect(queries).toBe(1);
  });
});
