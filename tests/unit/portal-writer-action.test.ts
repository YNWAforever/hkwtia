import {describe, expect, it, vi} from "vitest";

import {AgentRuntimeError} from "@/lib/ai/runtime";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {runWriterAssist, startOfHongKongMonth, type WriterActionDependencies} from "@/lib/portal/writer-action-core";

const member = {kind: "member", userId: "u1", profileId: "profile-1"} as const;
const now = new Date("2026-09-14T04:00:00Z");

function deps(overrides: Partial<WriterActionDependencies> = {}): WriterActionDependencies {
  return {
    plansFor: vi.fn(async () => ["startup"] as const),
    countRuns: vi.fn(async () => 0),
    reserveRun: vi.fn(async () => "reserved-run"),
    settleFailedRun: vi.fn(async () => {}),
    generate: vi.fn(async () => ({descriptionEn: "a", descriptionZh: "b"})),
    now: () => now,
    ...overrides,
  };
}

describe("runWriterAssist", () => {
  it("returns the copy when a plan allows it and the quota has room", async () => {
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps()))
      .resolves.toEqual({status: "ok", copy: {descriptionEn: "a", descriptionZh: "b"}});
  });

  it("refuses a plan with no writer allowance", async () => {
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({plansFor: async () => ["community"]})))
      .resolves.toEqual({status: "error", code: "NOT_ENTITLED"});
  });

  it("refuses at the cap, counting only since the Hong Kong month began", async () => {
    const countRuns = vi.fn(async () => 20);
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({countRuns})))
      .resolves.toEqual({status: "error", code: "QUOTA_EXCEEDED"});
    expect(countRuns).toHaveBeenCalledWith(member, startOfHongKongMonth(now));
  });

  it("takes the best plan when a member holds several", async () => {
    // startup (20) is listed first and is the smaller cap, so a first-match or
    // minimum implementation would resolve 20 and refuse a count of 50; only the
    // maximum (corporate 100) leaves room. A 5 would pass under all three.
    const countRuns = vi.fn(async () => 50);
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({plansFor: async () => ["startup", "corporate"], countRuns})))
      .resolves.toEqual({status: "ok", copy: {descriptionEn: "a", descriptionZh: "b"}});
  });

  it("uses the best plan's cap, not the sum of the plans' caps", async () => {
    // startup (20) + corporate (100): a count of 110 is over the max cap (100)
    // though under the sum (120), so only a max would refuse it; a sum
    // implementation would allow it.
    const countRuns = vi.fn(async () => 110);
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({plansFor: async () => ["startup", "corporate"], countRuns})))
      .resolves.toEqual({status: "error", code: "QUOTA_EXCEEDED"});
  });

  it("refuses a non-member actor and a malformed brief", async () => {
    await expect(runWriterAssist({kind: "anonymous", userId: null}, {kind: "event", brief: "hi"}, deps()))
      .resolves.toEqual({status: "error", code: "FORBIDDEN"});
    await expect(runWriterAssist(member, {kind: "event", brief: ""}, deps()))
      .resolves.toEqual({status: "error", code: "INVALID"});
  });

  it("maps a throwing plan read to FAILED instead of escaping the action", async () => {
    const plansFor = vi.fn(async () => { throw new Error("db down"); });
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({plansFor})))
      .resolves.toEqual({status: "error", code: "FAILED"});
  });

  it("maps a throwing quota read to FAILED instead of escaping the action", async () => {
    const countRuns = vi.fn(async () => { throw new Error("db down"); });
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({countRuns})))
      .resolves.toEqual({status: "error", code: "FAILED"});
  });

  it("maps an unreadable plan allowance to FAILED instead of escaping the action", async () => {
    // entitlementsFor throws on an unknown plan code; the plan column is an enum
    // today, but nothing may throw out of the action.
    const plansFor = vi.fn(async () => ["startup", "not-a-plan"] as unknown as readonly MembershipPlanCode[]);
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({plansFor})))
      .resolves.toEqual({status: "error", code: "FAILED"});
  });

  it("never generates on a refusing path", async () => {
    const generate = vi.fn(async () => ({descriptionEn: "a", descriptionZh: "b"}));
    await runWriterAssist({kind: "anonymous", userId: null}, {kind: "event", brief: "hello"}, deps({generate}));
    await runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate, plansFor: async () => ["community"]}));
    await runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate, countRuns: async () => 20}));
    await runWriterAssist(member, {kind: "event", brief: ""}, deps({generate}));
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps a generation failure to FAILED", async () => {
    const generate = vi.fn(async () => { throw new Error("provider down"); });
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate})))
      .resolves.toEqual({status: "error", code: "FAILED"});
  });

  it("settles a reserved run when writer setup throws before the runtime starts", async () => {
    const generate = vi.fn(async () => { throw new AgentRuntimeError("configuration_error"); });
    const settleFailedRun = vi.fn(async () => {});
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate, settleFailedRun})))
      .resolves.toEqual({status: "error", code: "UNAVAILABLE"});
    expect(settleFailedRun).toHaveBeenCalledWith(member, "reserved-run", expect.any(AgentRuntimeError));
  });

  it("reports an unconfigured agent as UNAVAILABLE", async () => {
    const generate = vi.fn(async () => { throw new AgentRuntimeError("configuration_error"); });
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate})))
      .resolves.toEqual({status: "error", code: "UNAVAILABLE"});
  });
  it("admits only one of two requests for the final monthly quota slot", async () => {
    let reservations = 0;
    const reserveRun = vi.fn(async () => (++reservations === 1 ? "run-1" : null));
    const generate = vi.fn(async () => ({descriptionEn: "a", descriptionZh: "b"}));
    const dependencies = {...deps({countRuns: async () => 19, generate}), reserveRun};
    const requests = await Promise.all([
      runWriterAssist(member, {kind: "event", brief: "first"}, dependencies),
      runWriterAssist(member, {kind: "event", brief: "second"}, dependencies),
    ]);
    expect(requests.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(requests.filter((result) => result.status === "error" && result.code === "QUOTA_EXCEEDED")).toHaveLength(1);
    expect(reserveRun).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledOnce();
  });
});

describe("startOfHongKongMonth", () => {
  it("is the first instant of the month in Hong Kong time", () => {
    expect(startOfHongKongMonth(new Date("2026-09-14T04:00:00Z")).toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("starts September for an instant that is already September in Hong Kong", () => {
    expect(startOfHongKongMonth(new Date("2026-08-31T17:00:00Z")).toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });

  it("stays in August for an instant that is still August in Hong Kong", () => {
    expect(startOfHongKongMonth(new Date("2026-08-31T15:00:00Z")).toISOString()).toBe("2026-07-31T16:00:00.000Z");
  });
});
