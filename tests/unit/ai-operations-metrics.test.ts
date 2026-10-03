import {describe, expect, it} from "vitest";
import {calculateAdminImpact, summarizeOperationCases, operationObservationSchema, summarizeObservedWork} from "@/lib/ai/operations-metrics";
const measured = {baselineMinutes: 30, humanMinutes: 12, reviewMinutes: 3, reworkMinutes: 2, caseCount: 3, sampleCount: 2};
describe("verified administrative time savings", () => {
  it("subtracts mutually exclusive measured work from the weighted total baseline", () => {
    expect(calculateAdminImpact(measured)).toEqual({netMinutes: 13, caseCount: 3, sampleCount: 2});
  });
  it("retains a negative net result rather than clamping it", () => {
    expect(calculateAdminImpact({...measured, baselineMinutes: 10})).toMatchObject({netMinutes: -7});
  });
  it("has no measured savings without time samples", () => {
    expect(calculateAdminImpact({...measured, sampleCount: 0})).toMatchObject({netMinutes: null, sampleCount: 0});
  });
  it.each([
    {sampleCount: 4}, {caseCount: 1.5}, {humanMinutes: -1}, {baselineMinutes: Number.NaN},
    {reviewMinutes: Number.POSITIVE_INFINITY}, {sampleCount: -1},
  ])("rejects inconsistent or non-finite input %j", (invalid) => {
    expect(() => calculateAdminImpact({...measured, ...invalid})).toThrow("ADMIN_IMPACT_INVALID");
  });
  it("includes_handoffs_and_reopened_cases without counting a reopened case twice", () => {
    expect(summarizeOperationCases([
      {caseId: "bot-1", handling: "bot", reopened: false},
      {caseId: "human-1", handling: "handoff", reopened: false},
      {caseId: "human-1", handling: "handoff", reopened: true},
      {caseId: "manual-1", handling: "manual", reopened: false},
    ])).toEqual({caseCount: 3, reopenedCount: 1});
  });
});

const observation = {
  observationId: "11111111-1111-4111-8111-111111111111", caseId: "synthetic-case-1", caseKind: "support" as const,
  auditId: "22222222-2222-4222-8222-222222222222", runId: null,
  startedAt: "2026-10-03T00:00:00.000Z", endedAt: "2026-10-03T00:10:00.000Z",
  humanMinutes: 4, reviewMinutes: 2, reworkMinutes: 1, waitMinutes: 3,
  decision: "edited" as const, reopened: false, cohort: "assisted" as const,
  comparisonId: "33333333-3333-4333-8333-333333333333",
};
describe("minimal content-free work observations", () => {
  it("accepts a fully reconciled timing observation with an existing audit reference", () => {
    expect(operationObservationSchema.parse(observation)).toEqual(observation);
  });
  it.each([
    {body: "raw dialogue forbidden"}, {email: "synthetic@example.test"}, {role: "superadmin"},
    {humanMinutes: -1}, {humanMinutes: 9}, {endedAt: "2026-10-02T23:59:00.000Z"},
    {auditId: null, runId: null}, {caseId: "synthetic@example.test"},
  ])("rejects disallowed data or inconsistent timings %j", (invalid) => {
    expect(operationObservationSchema.safeParse({...observation, ...invalid}).success).toBe(false);
  });
  it("adds reopened work once, deduplicates receipts, and keeps waiting outside staff work", () => {
    const reopened = {...observation, observationId: "44444444-4444-4444-8444-444444444444", reopened: true,
      startedAt: "2026-10-03T00:20:00.000Z", endedAt: "2026-10-03T00:25:00.000Z",
      humanMinutes: 2, reviewMinutes: 1, reworkMinutes: 1, waitMinutes: 1};
    expect(summarizeObservedWork([observation, reopened, reopened])).toEqual({
      caseCount: 1, sampleCount: 1, humanMinutes: 6, reviewMinutes: 3, reworkMinutes: 2, waitMinutes: 4, reopenedCount: 1,
    });
  });
});
