import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({status: "pending_payment"}));
const mocks = vi.hoisted(() => ({countRuns: vi.fn(async () => 0), generate: vi.fn(async () => ({descriptionEn: "generated"}))}));

vi.mock("@/lib/db/repos/memberships", () => ({
  membershipsRepository: {list: vi.fn(async () => [{planCode: "startup", status: state.status}])},
}));
vi.mock("@/lib/db/repos/agent-runs", () => ({agentRunsRepository: {countWriterRuns: mocks.countRuns}}));
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

  it("generates for an active paid plan", async () => {
    state.status = "active";
    mocks.countRuns.mockClear();
    mocks.generate.mockClear();
    await expect(runWriterAssist(member, {kind: "event", brief: "Draft an event"}))
      .resolves.toEqual({status: "ok", copy: {descriptionEn: "generated"}});
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
});
