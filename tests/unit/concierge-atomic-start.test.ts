import {describe, expect, it, vi} from "vitest";

import {
  createConciergeService,
  type ConciergeServiceDependencies,
} from "@/lib/ai/agents/concierge";
import {AgentRuntimeError} from "@/lib/ai/runtime";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = {kind: "profile" as const, profileId: "profile-1"};

describe("Concierge atomic turn start", () => {
  it("does not leave a standalone user message when atomic run start fails", async () => {
    const atomicFailure = new Error("agent run insert failed");
    const appendMessage = vi.fn(async () => ({id: crypto.randomUUID()}));
    const startAgentTurn = vi.fn(async () => {
      throw atomicFailure;
    });
    const prepare = vi.fn(async () => ({
      runId: RUN_ID,
      fail: vi.fn(async () => new AgentRuntimeError("provider_error")),
    }));
    const stream = vi.fn();
    const dependencies = {
      agentsEnabled: true,
      model: "openai:gpt-4.1-mini",
      credentials: {openaiApiKey: "test"},
      appOrigin: "https://www.hkwtia.org",
      conversations: {
        create: vi.fn(async () => ({
          id: CONVERSATION_ID,
          locale: "en" as const,
        })),
        getOwned: vi.fn(async () => ({
          id: CONVERSATION_ID,
          locale: "en" as const,
        })),
        appendMessage,
        startAgentTurn,
        listMessages: vi.fn(async () => []),
      },
      agentTools: {
        createStaffTask: vi.fn(async () => ({
          id: "task-1",
          status: "open" as const,
        })),
      },
      getRuntime: vi.fn(() => ({prepare, stream})),
      getEmbedding: vi.fn(),
      createTools: vi.fn(() => ({})),
      audit: vi.fn(async () => undefined),
      createRunId: () => RUN_ID,
      now: () => new Date("2026-07-28T01:00:00.000Z"),
    } as unknown as ConciergeServiceDependencies;

    await expect(createConciergeService(dependencies).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "What is WTIA?",
      locale: "en",
      trigger: "web",
    })).rejects.toBe(atomicFailure);

    expect(startAgentTurn).toHaveBeenCalledOnce();
    expect(appendMessage).not.toHaveBeenCalled();
    expect(dependencies.getRuntime).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });
});
