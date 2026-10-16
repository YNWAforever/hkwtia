import {randomUUID} from "node:crypto";
import {describe, expect, it} from "vitest";
import {buildOperationBaseline, compareObservedWork, type OperationObservation} from "@/lib/ai/operations-metrics";
const comparisonId = randomUUID();
const window = {comparisonId, from: "2026-09-01T00:00:00.000Z", toExclusive: "2026-09-15T00:00:00.000Z"};
function observation(caseId: string, humanMinutes: number, extra: Partial<OperationObservation> = {}): OperationObservation {
 const start = extra.cohort === "assisted" ? "2026-09-16T00:00:00.000Z" : "2026-09-02T00:00:00.000Z";
 return {observationId: randomUUID(), comparisonId, caseId, caseKind: "support", auditId: randomUUID(), runId: null,
 startedAt: start, endedAt: new Date(Date.parse(start) + humanMinutes * 60000).toISOString(),
 humanMinutes, reviewMinutes: 0, reworkMinutes: 0, waitMinutes: 0, decision: "manual", cohort: "baseline", reopened: false, ...extra};
}
describe("immutable manual comparison math", () => {
 it("weights the manual baseline by unique comparable cases and counts reopened work once", () => {
  const first = observation("manual-1", 10), second = observation("manual-2", 20);
  const reopen = observation("manual-1", 6, {reopened: true});
  const baseline = buildOperationBaseline(window, [first, first, second, reopen]);
  expect(baseline.means).toEqual([{caseKind: "support", sampleCount: 2, minutesPerCase: 18}]);
  const assisted = observation("assisted-1", 4, {cohort: "assisted"});
  const rework = observation("assisted-1", 20, {cohort: "assisted", reopened: true});
  expect(compareObservedWork([assisted, assisted, rework], [baseline])).toEqual({netMinutes: -6, baselineMinutes: 18, sampleCount: 1, missingBaselineCases: 0});
 });
 it("refuses short, incomplete, mismatched and AI-assisted manual baselines", () => {
  expect(() => buildOperationBaseline({...window, toExclusive: "2026-09-14T00:00:00.000Z"}, [observation("manual", 1)])).toThrow("OPERATION_BASELINE_INVALID");
  expect(() => buildOperationBaseline(window, [])).toThrow("OPERATION_BASELINE_INVALID");
  expect(() => buildOperationBaseline(window, [observation("manual", 1, {comparisonId: randomUUID()})])).toThrow("OPERATION_BASELINE_INVALID");
  expect(() => buildOperationBaseline(window, [observation("manual", 1, {decision: "adopted"})])).toThrow("OPERATION_BASELINE_INVALID");
  expect(() => buildOperationBaseline(window, [observation("manual", 1, {cohort: "assisted"})])).toThrow("OPERATION_BASELINE_INVALID");
 });
 it("does not turn a missing comparison kind or group into measured savings", () => {
  const baseline = buildOperationBaseline(window, [observation("manual", 10)]);
  expect(compareObservedWork([], [baseline])).toEqual({netMinutes: null, baselineMinutes: null, sampleCount: 0, missingBaselineCases: 0});
  expect(compareObservedWork([observation("assisted", 1, {cohort: "assisted", caseKind: "event"})], [baseline])).toEqual({netMinutes: null, baselineMinutes: null, sampleCount: 0, missingBaselineCases: 1});
  expect(compareObservedWork([observation("assisted", 1, {cohort: "assisted", comparisonId: randomUUID()})], [baseline])).toEqual({netMinutes: null, baselineMinutes: null, sampleCount: 0, missingBaselineCases: 1});
 });
 it("rejects duplicate frozen comparison IDs rather than choosing an arbitrary baseline", () => {
  const baseline = buildOperationBaseline(window, [observation("manual", 10)]);
  expect(() => compareObservedWork([observation("assisted", 1, {cohort: "assisted"})], [baseline, baseline])).toThrow("OPERATION_BASELINE_CONFLICT");
 });
});
