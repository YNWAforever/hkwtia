import {z} from "zod";

export type AdminImpactInput = Readonly<{
  baselineMinutes: number; humanMinutes: number; reviewMinutes: number; reworkMinutes: number;
  caseCount: number; sampleCount: number;
}>;
export function calculateAdminImpact(input: AdminImpactInput): Readonly<{netMinutes: number | null; caseCount: number; sampleCount: number}> {
  const minutes = [input.baselineMinutes, input.humanMinutes, input.reviewMinutes, input.reworkMinutes];
  if (minutes.some(value => !Number.isFinite(value) || value < 0)
    || !Number.isSafeInteger(input.caseCount) || input.caseCount < 0
    || !Number.isSafeInteger(input.sampleCount) || input.sampleCount < 0 || input.sampleCount > input.caseCount) {
    throw new Error("ADMIN_IMPACT_INVALID");
  }
  const net = input.baselineMinutes - input.humanMinutes - input.reviewMinutes - input.reworkMinutes;
  if (!Number.isFinite(net)) throw new Error("ADMIN_IMPACT_INVALID");
  return Object.freeze({netMinutes: input.sampleCount === 0 ? null : net, caseCount: input.caseCount, sampleCount: input.sampleCount});
}
export type OperationCase = Readonly<{caseId: string; handling: "bot" | "handoff" | "manual"; reopened: boolean}>;
export function summarizeOperationCases(cases: readonly OperationCase[]) {
  const ids = new Set<string>(), reopened = new Set<string>();
  for (const item of cases) {
    ids.add(item.caseId);
    if (item.reopened) reopened.add(item.caseId);
  }
  return Object.freeze({caseCount: ids.size, reopenedCount: reopened.size});
}
const caseKindSchema = z.enum(["application", "support", "renewal", "board", "content", "membership", "event", "cms"]);
const minutes = z.number().finite().nonnegative().max(24 * 60);
export const operationObservationSchema = z.object({
  observationId: z.string().uuid(), caseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  caseKind: caseKindSchema,
  auditId: z.string().uuid().nullable(), runId: z.string().uuid().nullable(),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  humanMinutes: minutes, reviewMinutes: minutes, reworkMinutes: minutes, waitMinutes: minutes,
  decision: z.enum(["adopted", "edited", "rejected", "manual"]), reopened: z.boolean(),
  cohort: z.enum(["baseline", "assisted"]), comparisonId: z.string().uuid(),
}).strict().superRefine((value, context) => {
  const elapsed = (Date.parse(value.endedAt) - Date.parse(value.startedAt)) / 60_000;
  const recorded = value.humanMinutes + value.reviewMinutes + value.reworkMinutes + value.waitMinutes;
  if (!value.auditId && !value.runId) context.addIssue({code: "custom", path: ["auditId"], message: "an existing audit or run reference is required"});
  if (elapsed < 0 || elapsed > 24 * 60 || Math.abs(elapsed - recorded) > 0.01) {
    context.addIssue({code: "custom", path: ["endedAt"], message: "exclusive timing categories must reconcile to elapsed time"});
  }
});
export type OperationObservation = z.infer<typeof operationObservationSchema>;
export function summarizeObservedWork(observations: readonly OperationObservation[]) {
  const receipts = new Map<string, string>(), cases = new Set<string>(), reopened = new Set<string>();
  const totals = {humanMinutes: 0, reviewMinutes: 0, reworkMinutes: 0, waitMinutes: 0};
  for (const input of observations) {
    const item = operationObservationSchema.parse(input);
    const value = JSON.stringify(item), prior = receipts.get(item.observationId);
    if (prior !== undefined) {
      if (prior !== value) throw new Error("OPERATION_OBSERVATION_CONFLICT");
      continue;
    }
    receipts.set(item.observationId, value);
    const key = item.caseKind + ":" + item.caseId;
    cases.add(key);
    if (item.reopened) reopened.add(key);
    for (const phase of ["humanMinutes", "reviewMinutes", "reworkMinutes", "waitMinutes"] as const) totals[phase] += item[phase];
  }
  return Object.freeze({caseCount: cases.size, sampleCount: cases.size, ...totals, reopenedCount: reopened.size});
}

const baselineWindowObject = z.object({
  comparisonId: z.string().uuid(), from: z.string().datetime(), toExclusive: z.string().datetime(),
}).strict();
const isTwoWeeks = (value: {from: string; toExclusive: string}) => Date.parse(value.toExclusive) - Date.parse(value.from) >= 14 * 24 * 60 * 60_000;
export const operationBaselineWindowSchema = baselineWindowObject.refine(isTwoWeeks, {message: "a completed two-week manual period is required"});
export type OperationBaselineWindow = z.infer<typeof operationBaselineWindowSchema>;
export const operationBaselineSchema = baselineWindowObject.extend({
  version: z.literal(1), means: z.array(z.object({
    caseKind: caseKindSchema,
    sampleCount: z.number().int().positive(), minutesPerCase: z.number().finite().nonnegative(),
  }).strict()).min(1).max(8),
}).refine(isTwoWeeks).refine(value => new Set(value.means.map(item => item.caseKind)).size === value.means.length, {message: "one mean per kind"});
export type OperationBaseline = z.infer<typeof operationBaselineSchema>;
export function buildOperationBaseline(input: OperationBaselineWindow, observations: readonly OperationObservation[]): OperationBaseline {
  const parsed = operationBaselineWindowSchema.safeParse(input);
  if (!parsed.success || observations.length === 0) throw Error("OPERATION_BASELINE_INVALID");
  const {from, toExclusive, comparisonId} = parsed.data;
  const byKind = new Map<OperationObservation["caseKind"], OperationObservation[]>();
  for (const raw of observations) {
    const result = operationObservationSchema.safeParse(raw);
    if (!result.success) throw Error("OPERATION_BASELINE_INVALID");
    const item = result.data;
    if (item.comparisonId !== comparisonId || item.cohort !== "baseline" || item.decision !== "manual"
      || Date.parse(item.startedAt) < Date.parse(from) || Date.parse(item.endedAt) >= Date.parse(toExclusive)) throw Error("OPERATION_BASELINE_INVALID");
    const list = byKind.get(item.caseKind) ?? [];
    list.push(item);byKind.set(item.caseKind, list);
  }
  const means = [...byKind.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([caseKind, items]) => {
    const work = summarizeObservedWork(items);
    return {caseKind, sampleCount: work.sampleCount, minutesPerCase: (work.humanMinutes + work.reviewMinutes + work.reworkMinutes) / work.sampleCount};
  });
  return operationBaselineSchema.parse({...parsed.data, version: 1, means});
}
export function compareObservedWork(observations: readonly OperationObservation[], baselines: readonly OperationBaseline[]) {
  const groups = new Map<string, OperationBaseline>();
  for (const raw of baselines) {
    const baseline = operationBaselineSchema.parse(raw);
    if (groups.has(baseline.comparisonId)) throw Error("OPERATION_BASELINE_CONFLICT");
    groups.set(baseline.comparisonId, baseline);
  }
  const assisted = observations.map(item => operationObservationSchema.parse(item)).filter(item => item.cohort === "assisted");
  // Canonical receipt validation catches conflicting duplicates before any weighted result is emitted.
  summarizeObservedWork(assisted);
  const cases = new Map<string, number | null>();
  for (const item of assisted) {
    const key = item.caseKind + ":" + item.caseId;
    const group = groups.get(item.comparisonId), mean = group?.means.find(value => value.caseKind === item.caseKind);
    const minutes = mean && Date.parse(item.startedAt) >= Date.parse(group!.toExclusive) ? mean.minutesPerCase : null;
    if (cases.has(key) && cases.get(key) !== minutes) throw Error("OPERATION_BASELINE_CONFLICT");
    cases.set(key, minutes);
  }
  const matched = assisted.filter(item => cases.get(item.caseKind + ":" + item.caseId) !== null);
  const work = summarizeObservedWork(matched);
  const missingBaselineCases = [...cases.values()].filter(value => value === null).length;
  const baselineMinutes = [...cases.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const impact = calculateAdminImpact({...work, baselineMinutes});
  return {netMinutes: missingBaselineCases > 0 ? null : impact.netMinutes,
    baselineMinutes: cases.size === 0 || missingBaselineCases > 0 ? null : baselineMinutes,
    sampleCount: work.sampleCount, missingBaselineCases};
}
