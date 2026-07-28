import {describe, expect, it, vi} from "vitest";

import {createConciergeService} from "@/lib/ai/agents/concierge";
import {createAgentRuntime} from "@/lib/ai/runtime";
import type {AgentStreamFinish} from "@/lib/ai/provider";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = {kind: "profile" as const, profileId: "profile-1"};
const NOW = new Date("2026-07-28T01:00:00.000Z");

function successfulFinish(): AgentStreamFinish {
  return {
    usage: {inputTokens: 10, outputTokens: 5},
    finishReason: "stop",
    steps: 1,
    toolExecutions: 0,
    citations: [],
  };
}

function lifecycleHarness() {
  const agentRuns = {
    start: vi.fn(async () => ({id: RUN_ID})),
    configureModel: vi.fn(async () => ({id: RUN_ID})),
    finish: vi.fn(async () => ({id: RUN_ID})),
    fail: vi.fn(async () => ({id: RUN_ID})),
    escalate: vi.fn(async () => ({id: RUN_ID})),
    disable: vi.fn(async () => ({id: RUN_ID})),
  };
  const runtime = createAgentRuntime({
    agentRuns,
    providerFactories: {
      openai: () => ({
        stream: () => ({
          textStream: {
            async *[Symbol.asyncIterator]() {
              yield "first";
            },
          },
          // Resolve independently of cancellation to exercise the case where
          // the provider has already finished before the consumer disconnects.
          finish: Promise.resolve(successfulFinish()),
        }),
      }),
      anthropic: vi.fn(),
    },
    createRunId: () => RUN_ID,
    now: () => NOW,
  });
  const conversations = {
    create: vi.fn(async () => ({
      id: CONVERSATION_ID,
      locale: "en" as const,
    })),
    getOwned: vi.fn(async () => ({
      id: CONVERSATION_ID,
      locale: "en" as const,
    })),
    appendMessage: vi.fn(async () => ({id: crypto.randomUUID()})),
    startAgentTurn: vi.fn(async () => ({id: RUN_ID})),
    listMessages: vi.fn(async () => [{
      role: "user" as const,
      content: "Hello",
    }]),
  };
  const service = createConciergeService({
    agentsEnabled: true,
    model: "openai:gpt-4.1-mini",
    credentials: {openaiApiKey: "test"},
    appOrigin: "https://www.hkwtia.org",
    conversations,
    agentTools: {
      createStaffTask: vi.fn(async () => ({
        id: "task-1",
        status: "open" as const,
      })),
    },
    getRuntime: () => runtime,
    getEmbedding: () => ({
      dimensions: 1536,
      embed: vi.fn(async () => Array.from({length: 1536}, () => 0)),
    }),
    createTools: () => ({}),
    audit: vi.fn(async () => undefined),
    createRunId: () => RUN_ID,
    now: () => NOW,
  });
  return {agentRuns, conversations, service};
}

async function consume(events: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of events) {
    void _event;
    // Drain the service stream.
  }
}

function expectNoNonFailureTerminal(
  agentRuns: ReturnType<typeof lifecycleHarness>["agentRuns"],
): void {
  expect(agentRuns.finish).not.toHaveBeenCalled();
  expect(agentRuns.escalate).not.toHaveBeenCalled();
  expect(agentRuns.disable).not.toHaveBeenCalled();
}

describe("Concierge cancellation lifecycle", () => {
  it("terminally fails an explicit cancel exactly once after provider finish", async () => {
    const {agentRuns, service} = lifecycleHarness();
    const turn = await service.startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "Hello",
      locale: "en",
      trigger: "web",
    });

    await turn.cancel();
    await turn.cancel();

    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({errorCode: "timeout"}),
    );
    expectNoNonFailureTerminal(agentRuns);
  });

  it("terminally fails an early iterator return exactly once", async () => {
    const {agentRuns, service} = lifecycleHarness();
    const turn = await service.startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "Hello",
      locale: "en",
      trigger: "web",
    });
    const iterator = turn.events[Symbol.asyncIterator]();

    await iterator.next();
    await iterator.next();
    await iterator.return?.();

    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({errorCode: "timeout"}),
    );
    expectNoNonFailureTerminal(agentRuns);
  });

  it("cannot append or emit done when consumption continues after cancel", async () => {
    const {agentRuns, conversations, service} = lifecycleHarness();
    const turn = await service.startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "Hello",
      locale: "en",
      trigger: "web",
    });

    await turn.cancel();
    const events: Array<{event: string}> = [];
    for await (const event of turn.events) events.push(event);

    expect(events).toContainEqual(expect.objectContaining({event: "error"}));
    expect(events).not.toContainEqual(expect.objectContaining({event: "done"}));
    expect(conversations.appendMessage).not.toHaveBeenCalled();
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.fail).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({errorCode: "timeout"}),
    );
    expectNoNonFailureTerminal(agentRuns);
  });

  it("preserves a successful terminal result when cancelled after completion", async () => {
    const {agentRuns, service} = lifecycleHarness();
    const turn = await service.startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "Hello",
      locale: "en",
      trigger: "web",
    });

    await consume(turn.events);
    await turn.cancel();
    await turn.cancel();

    expect(agentRuns.finish).toHaveBeenCalledOnce();
    expect(agentRuns.fail).not.toHaveBeenCalled();
    expect(agentRuns.escalate).not.toHaveBeenCalled();
    expect(agentRuns.disable).not.toHaveBeenCalled();
  });
});
