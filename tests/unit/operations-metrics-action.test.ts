import {beforeEach, describe, expect, it, vi} from "vitest";
const boundary = vi.hoisted(() => ({actor: vi.fn(), record: vi.fn(), freezeBaseline: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: boundary.actor}));
vi.mock("@/lib/db/repos/operations-metrics", () => ({operationsMetricsRepository: {record: boundary.record, freezeBaseline: boundary.freezeBaseline}}));
import {freezeOperationBaselineAction, recordOperationObservationAction} from "@/lib/admin/operations-metrics-actions";
const staff = {kind: "staff", userId: "synthetic", profileId: "synthetic"};
const input = {observationId: "11111111-1111-4111-8111-111111111111", caseId: "case-1", caseKind: "support",
 auditId: "22222222-2222-4222-8222-222222222222", runId: null, startedAt: "2026-10-03T00:00:00.000Z", endedAt: "2026-10-03T00:10:00.000Z",
 humanMinutes: 4, reviewMinutes: 2, reworkMinutes: 1, waitMinutes: 3, decision: "manual", reopened: false,
 cohort: "baseline", comparisonId: "33333333-3333-4333-8333-333333333333"};
describe("own-actor operation measurement action", () => {
 beforeEach(() => {vi.resetAllMocks(); boundary.actor.mockResolvedValue(staff); boundary.record.mockResolvedValue(undefined);});
 it("uses the server actor and returns only a safe saved status", async () => {
   expect(await recordOperationObservationAction(input)).toEqual({status: "saved"});
   expect(boundary.actor).toHaveBeenCalledOnce();expect(boundary.record).toHaveBeenCalledWith(staff,input);
 });
 it("rejects actor injection before persistence", async () => {
   expect(await recordOperationObservationAction({...input, actor: {kind: "superadmin"}})).toEqual({status: "invalid"});
   expect(boundary.record).not.toHaveBeenCalled();
 });
 it("does not serialize a session outage or repository failure", async () => {
   boundary.actor.mockRejectedValueOnce(new Error("PRIVATE_SESSION_CANARY"));
   expect(await recordOperationObservationAction(input)).toEqual({status: "unavailable"});
   expect(boundary.record).not.toHaveBeenCalled();
   boundary.record.mockRejectedValueOnce(new Error("PRIVATE_DB_CANARY"));
   expect(await recordOperationObservationAction(input)).toEqual({status: "unavailable"});
 });
});

it("freezes only a validated period with its own server actor, never client means", async () => {
 boundary.actor.mockResolvedValue(staff); boundary.freezeBaseline.mockResolvedValue(undefined);
 const period = {comparisonId: input.comparisonId, from: "2026-09-01T00:00:00.000Z", toExclusive: "2026-09-15T00:00:00.000Z"};
 expect(await freezeOperationBaselineAction(period)).toEqual({status: "saved"});
 expect(boundary.freezeBaseline).toHaveBeenCalledWith(staff, period);
 boundary.freezeBaseline.mockClear();
 expect(await freezeOperationBaselineAction({...period, means: [{minutesPerCase: 999}]})).toEqual({status: "invalid"});
 expect(boundary.freezeBaseline).not.toHaveBeenCalled();
 boundary.actor.mockRejectedValueOnce(new Error("FORBIDDEN"));
 expect(await freezeOperationBaselineAction(period)).toEqual({status: "forbidden"});
 expect(boundary.freezeBaseline).not.toHaveBeenCalled();
});
