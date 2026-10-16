import {describe, expect, it, vi} from "vitest";

import {AgentRuntimeError} from "@/lib/ai/runtime";

const state = vi.hoisted(() => ({status: "pending_payment"}));
const mocks = vi.hoisted(() => ({countRuns: vi.fn(async () => 0), generate: vi.fn(async () => ({descriptionEn: "generated"})), fail: vi.fn(async () => ({}))}));

vi.mock("@/lib/db/repos/memberships", () => ({
  membershipsRepository: {list: vi.fn(async () => [{planCode: "startup", status: state.status}])},
}));
vi.mock("@/lib/db/repos/agent-runs", () => ({agentRunsRepository: {countWriterRuns: mocks.countRuns, reserveWriterRun: vi.fn(async () => "reserved-run"), fail: mocks.fail}}));
vi.mock("@/lib/ai/writers/generate", () => ({generateWriterCopy: mocks.generate}));

import {runWriterAssist} from "@/lib/portal/writer-action-core";

const member = {kind: "member", userId: "u1", profileId: "profile-1"} as const;

describe("AI writer paid membership gate", () => {
  it.each(["pending_payment", "pending_review"])("does not generate for a %s plan", async (status) => {
    state.status = status;
    mocks.countRuns.mockClear();
    mocks.generate.mockClear();
    await expect(runWriterAssist(member, {kind: "event", brief: "Draft an event"}))
      .resolves.toEqual({status: "error", code: "NOT_ENTITLED"});
    expect(mocks.countRuns).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("settles the reserved row when writer setup fails before runtime startup", async () => {
    state.status = "active";
    mocks.fail.mockClear();
    mocks.generate.mockRejectedValueOnce(new Error("bad writer config"));
    await expect(runWriterAssist(member, {kind: "event", brief: "Draft an event"}))
      .resolves.toEqual({status: "error", code: "FAILED"});
    expect(mocks.fail).toHaveBeenCalledWith({
      kind: "agent", agent: "writer", runId: "reserved-run",
      conversationId: null, profileId: member.profileId, trigger: "portal",
    }, {completedAt: expect.any(Date), errorCode: "configuration_error"});
  });

  it("preserves a runtime failure code if the run still needs settlement", async () => {
    state.status = "active";
    mocks.fail.mockClear();
    mocks.generate.mockRejectedValueOnce(new AgentRuntimeError("rate_limited"));
    await expect(runWriterAssist(member, {kind: "event", brief: "Draft an event"}))
      .resolves.toEqual({status: "error", code: "FAILED"});
    expect(mocks.fail).toHaveBeenCalledWith(expect.any(Object), {
      completedAt: expect.any(Date), errorCode: "rate_limited",
    });
  });

  it("generates for an active paid plan", async () => {
    state.status = "active";
    mocks.countRuns.mockClear();
    mocks.generate.mockClear();
    await expect(runWriterAssist(member, {kind: "event", brief: "Draft an event"}))
      .resolves.toEqual({status: "ok", copy: {descriptionEn: "generated"}});
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
});
