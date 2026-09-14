import {describe, expect, it, vi} from "vitest";

import {AgentRuntimeError} from "@/lib/ai/runtime";
import {runWriterAssist, startOfHongKongMonth, type WriterActionDependencies} from "@/lib/portal/writer-action-core";

const member = {kind: "member", userId: "u1", profileId: "profile-1"} as const;
const now = new Date("2026-09-14T04:00:00Z");

function deps(overrides: Partial<WriterActionDependencies> = {}): WriterActionDependencies {
  return {
    plansFor: vi.fn(async () => ["startup"] as const),
    countRuns: vi.fn(async () => 0),
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
    const countRuns = vi.fn(async () => 5);
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({plansFor: async () => ["community", "corporate"], countRuns})))
      .resolves.toEqual({status: "ok", copy: {descriptionEn: "a", descriptionZh: "b"}});
  });

  it("refuses a non-member actor and a malformed brief", async () => {
    await expect(runWriterAssist({kind: "anonymous", userId: null}, {kind: "event", brief: "hi"}, deps()))
      .resolves.toEqual({status: "error", code: "FORBIDDEN"});
    await expect(runWriterAssist(member, {kind: "event", brief: ""}, deps()))
      .resolves.toEqual({status: "error", code: "INVALID"});
  });

  it("maps a generation failure to FAILED", async () => {
    const generate = vi.fn(async () => { throw new Error("provider down"); });
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate})))
      .resolves.toEqual({status: "error", code: "FAILED"});
  });

  it("reports an unconfigured agent as UNAVAILABLE", async () => {
    const generate = vi.fn(async () => { throw new AgentRuntimeError("configuration_error"); });
    await expect(runWriterAssist(member, {kind: "event", brief: "hello"}, deps({generate})))
      .resolves.toEqual({status: "error", code: "UNAVAILABLE"});
  });
});

describe("startOfHongKongMonth", () => {
  it("is the first instant of the month in Hong Kong time", () => {
    expect(startOfHongKongMonth(new Date("2026-09-14T04:00:00Z")).toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });
});
