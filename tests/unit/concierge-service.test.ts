import {describe, expect, it, vi} from "vitest";

import type {AgentRuntimeFinish} from "@/lib/ai/runtime";
import {
  createConciergeService,
  type ConciergeServiceDependencies,
  type ConciergeSseEvent,
} from "@/lib/ai/agents/concierge";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = {kind: "profile" as const, profileId: "profile-1"};

function asyncText(...values: string[]): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) yield value;
    },
  };
}

async function eventsOf(
  turn: Awaited<ReturnType<ReturnType<typeof createConciergeService>["startTurn"]>>,
): Promise<ConciergeSseEvent[]> {
  const events: ConciergeSseEvent[] = [];
  for await (const event of turn.events) events.push(event);
  return events;
}

function finish(
  overrides: Partial<AgentRuntimeFinish> = {},
): AgentRuntimeFinish {
  return {
    status: "completed",
    runId: RUN_ID,
    usage: {inputTokens: 10, outputTokens: 5},
    costUsd: "0.000100",
    finishReason: "stop",
    steps: 1,
    citations: [],
    ...overrides,
  } as AgentRuntimeFinish;
}

function dependencies(
  overrides: Partial<ConciergeServiceDependencies> = {},
): ConciergeServiceDependencies {
  return {
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
      appendMessage: vi.fn(async () => ({id: crypto.randomUUID()})),
      listMessages: vi.fn(async () => [{
        role: "user" as const,
        content: "What is WTIA?",
      }]),
    },
    agentTools: {
      createStaffTask: vi.fn(async () => ({id: "task-1", status: "open" as const})),
    },
    getRuntime: vi.fn(() => ({
      stream: vi.fn(async () => ({
        runId: RUN_ID,
        textStream: asyncText("WTIA ", "answer"),
        finish: Promise.resolve(finish({
          citations: [{
            sourceId: "kb:source",
            title: "WTIA membership",
            url: "https://www.hkwtia.org/membership",
          }],
        })),
      })),
    })),
    getEmbedding: vi.fn(() => ({
      dimensions: 1536 as const,
      embed: vi.fn(async () => Array.from({length: 1536}, () => 0)),
    })),
    createTools: vi.fn(() => ({})),
    audit: vi.fn(async () => undefined),
    createRunId: () => RUN_ID,
    now: vi.fn(() => new Date("2026-07-27T10:00:00.000Z")),
    ...overrides,
  };
}

describe("Concierge service", () => {
  it("selects a fixed bilingual system prompt", () => {
    const service = createConciergeService(dependencies());

    expect(service.systemPrompt("en")).toContain("Respond in English");
    expect(service.systemPrompt("zh-HK")).toContain("繁體中文");
    expect(service.systemPrompt("en")).toContain("untrusted");
  });

  it("preserves member continuity and emits meta, deltas, citations, then done", async () => {
    const deps = dependencies();
    const service = createConciergeService(deps);

    const turn = await service.startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      conversationId: CONVERSATION_ID,
      message: "What is WTIA?",
      locale: "en",
      trigger: "web",
    });

    expect(deps.conversations.getOwned).toHaveBeenCalledWith(
      OWNER,
      CONVERSATION_ID,
    );
    expect(deps.conversations.create).not.toHaveBeenCalled();
    expect(await eventsOf(turn)).toEqual([
      {event: "meta", data: {conversationId: CONVERSATION_ID, runId: RUN_ID}},
      {event: "delta", data: {text: "WTIA "}},
      {event: "delta", data: {text: "answer"}},
      {
        event: "done",
        data: {
          citations: [{
            sourceId: "kb:source",
            title: "WTIA membership",
            url: "https://www.hkwtia.org/membership",
          }],
          escalationId: null,
        },
      },
    ]);
    expect(deps.conversations.appendMessage).toHaveBeenNthCalledWith(
      1,
      OWNER,
      CONVERSATION_ID,
      expect.objectContaining({role: "user", content: "What is WTIA?"}),
    );
    expect(deps.conversations.appendMessage).toHaveBeenNthCalledWith(
      2,
      OWNER,
      CONVERSATION_ID,
      expect.objectContaining({
        role: "assistant",
        content: "WTIA answer",
        citations: [expect.objectContaining({sourceId: "kb:source"})],
      }),
    );
  });

  it("creates an anonymous conversation with the supplied one-way owner hash", async () => {
    const anonymousOwner = {
      kind: "anonymous" as const,
      anonymousOwnerHash: "a".repeat(64),
    };
    const deps = dependencies();

    await createConciergeService(deps).startTurn({
      owner: anonymousOwner,
      profileId: null,
      message: "你好",
      locale: "zh-HK",
      trigger: "web",
    });

    expect(deps.conversations.create).toHaveBeenCalledWith(
      anonymousOwner,
      expect.objectContaining({locale: "zh-HK"}),
    );
  });

  it("persists a zero-cost disabled run and one deduplicated leave-message task without constructing AI clients", async () => {
    const disabledFinish = finish({
      status: "disabled",
      code: "agent_disabled",
      usage: {inputTokens: 0, outputTokens: 0},
      costUsd: "0.000000",
      finishReason: "disabled",
      steps: 0,
      citations: [],
    });
    const runtimeStream = vi.fn(async () => ({
      runId: RUN_ID,
      textStream: asyncText(),
      finish: Promise.resolve(disabledFinish),
    }));
    const deps = dependencies({
      agentsEnabled: false,
      getRuntime: vi.fn(() => ({stream: runtimeStream})),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Help",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(runtimeStream).toHaveBeenCalledWith(expect.objectContaining({
      enabled: false,
      tools: {},
    }));
    expect(deps.getEmbedding).not.toHaveBeenCalled();
    expect(deps.createTools).not.toHaveBeenCalled();
    expect(deps.agentTools.createStaffTask).toHaveBeenCalledOnce();
    expect(deps.agentTools.createStaffTask).toHaveBeenCalledWith(
      expect.objectContaining({runId: RUN_ID}),
      expect.objectContaining({
        kind: "concierge_general_follow_up",
        summaryCode: "human_requested",
      }),
    );
    expect(events).toEqual([
      {event: "meta", data: {conversationId: CONVERSATION_ID, runId: RUN_ID}},
      {event: "disabled", data: {taskId: "task-1"}},
    ]);
  });

  it("returns an escalation reference for an escalated runtime", async () => {
    const deps = dependencies({
      getRuntime: vi.fn(() => ({
        stream: vi.fn(async () => ({
          runId: RUN_ID,
          textStream: asyncText("I will ask staff."),
          finish: Promise.resolve(finish({
            status: "escalated",
            code: "low_confidence",
          })),
        })),
      })),
    });

    const turn = await createConciergeService(deps).startTurn({
      owner: OWNER,
      profileId: OWNER.profileId,
      message: "Unclear fact",
      locale: "en",
      trigger: "web",
    });
    const events = await eventsOf(turn);

    expect(deps.agentTools.createStaffTask).toHaveBeenCalledOnce();
    expect(events.at(-1)).toEqual({
      event: "done",
      data: {citations: [], escalationId: "WTIA-task-1"},
    });
  });

  it("aborts provider work when the downstream stream disconnects", async () => {
    let seenSignal: AbortSignal | undefined;
    const providerCancelled = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
      const deps = dependencies({
        getRuntime: vi.fn(() => ({
          stream: vi.fn(async (request) => {
            seenSignal = request.abortSignal;
            return {
              runId: RUN_ID,
              textStream: {
                async *[Symbol.asyncIterator]() {
                  yield "first";
                  if (request.abortSignal?.aborted) {
                    resolve();
                  } else {
                    await new Promise<void>((done) => {
                      request.abortSignal?.addEventListener("abort", () => {
                        resolve();
                        done();
                      }, {once: true});
                    });
                  }
                },
              },
              finish: Promise.resolve(finish()),
            };
          }),
        })),
      });
      void createConciergeService(deps).startTurn({
        owner: OWNER,
        profileId: OWNER.profileId,
        message: "Cancel",
        locale: "en",
        trigger: "web",
      }).then(async (turn) => {
        const iterator = turn.events[Symbol.asyncIterator]();
        await iterator.next();
        await iterator.next();
        await turn.cancel();
      });
    });

    await providerCancelled;
    expect(seenSignal?.aborted).toBe(true);
  });
});
