// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAgentRuntime } from "@/lib/ai/runtime";
import { createAdminModelRegistry } from "@/lib/ai/providers/registry";
import type { AgentProviderFactory } from "@/lib/ai/provider";
function setup(approved = false) {
  const runs = {
    start: vi.fn(async () => ({})),
    configureModel: vi.fn(async () => ({})),
    finish: vi.fn(async () => ({})),
    fail: vi.fn(async () => ({})),
    escalate: vi.fn(async () => ({})),
    disable: vi.fn(async () => ({})),
  };
  const id = randomUUID(),
    budget = {
      reserveAiBudget: vi.fn(async () => ({
        ok: true as const,
        reservationId: id,
      })),
      markDispatched: vi.fn(async () => {}),
      releaseUndispatched: vi.fn(async () => {}),
      settleAiBudget: vi.fn(async () => {}),
      recordProviderReceipt: vi.fn(async () => {}),
    };
  const provider = vi.fn<AgentProviderFactory>(() => ({
    stream: async (input) => {
      await input.onProviderReceipt?.("synthetic-receipt");
      return {
        textStream: {
          async *[Symbol.asyncIterator]() {
            yield "{{facts.applicationState}}";
          },
        },
        finish: Promise.resolve({
          usage: { inputTokens: 10, outputTokens: 10 },
          steps: 1,
          toolExecutions: 0,
          finishReason: "stop",
          citations: [],
        }),
      };
    },
  }));
  const registry = createAdminModelRegistry(),
    runtime = createAgentRuntime({
      agentRuns: runs,
      budget,
      providerFactories: { openai: provider, anthropic: provider },
      administrativeTask: "application",
      modelRegistry: {
        ...registry,
        application: { ...registry.application, approvedForAdmin: approved },
      },
    });
  return { runtime, runs, budget, provider };
}
const request = {
  enabled: true,
  model: "openai:gpt-4.1-mini",
  credentials: { openaiApiKey: "synthetic-key" },
  actor: {
    agent: "board_reporter" as const,
    conversationId: null,
    profileId: null,
    trigger: "scheduled" as const,
  },
  system: "Synthetic approved facts",
  messages: [{ role: "user" as const, content: "Synthetic" }],
  tools: {},
};
describe("administrative application purpose in existing runtime", () => {
  it("cannot borrow the approved board route for an unapproved application purpose", async () => {
    const { runtime, provider } = setup();
    await expect(runtime.stream(request)).rejects.toMatchObject({
      code: "configuration_error",
    });
    expect(provider).not.toHaveBeenCalled();
  });
  it("admits application budget and persists caller receipt before delivering content", async () => {
    const { runtime, budget } = setup(true),
      receipt = vi.fn(async () => {}),
      beforeDispatch = vi.fn(async () => {});
    const stream = await runtime.stream({
      ...request,
      onProviderReceipt: receipt,
      beforeDispatch,
    });
    let body = "";
    for await (const delta of stream.textStream) body += delta;
    await stream.finish;
    expect(body).toBe("{{facts.applicationState}}");
    expect(budget.reserveAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "application" }),
    );
    expect(receipt).toHaveBeenCalledWith("synthetic-receipt");
    expect(beforeDispatch).toHaveBeenCalledOnce();
  });
  it("administrative purpose cannot bypass member Writer reservation or concierge ownership", async () => {
    const { runtime, runs } = setup(true);
    await expect(
      runtime.prepare({
        agent: "writer",
        conversationId: null,
        profileId: "synthetic-member",
        trigger: "portal",
      }),
    ).rejects.toMatchObject({ code: "configuration_error" });
    expect(runs.start).not.toHaveBeenCalled();
  });
});
