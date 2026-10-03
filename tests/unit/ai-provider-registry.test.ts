import {createAdminModelRegistry, resolveAdminModel, validateModelRoute, type AdminModelRegistry, type ModelRoute} from "@/lib/ai/providers/registry";
import {createOpenCodeAgentProvider, OPENCODE_ADMIN_ADOPTION, OPENCODE_GO_BASE_URL} from "@/lib/ai/providers/opencode";
import {conciergeRequestSchema} from "@/lib/api/concierge-route";
import {z} from "zod";
import {describe, expect, it, vi} from "vitest";
import {createAgentRuntime} from "@/lib/ai/runtime";

const route = {
  key: "openai:gpt-4.1-mini", provider: "openai" as const,
  protocol: "responses" as const, modelId: "gpt-4.1-mini",
  approvedForAdmin: true, supportsTools: true, supportsJson: true,
  pricingVersion: "legacy-2026-10-03", maxInputTokens: 16_000,
  maxOutputTokens: 4_000, timeoutMs: 30_000,
};
const tasks = ["concierge", "writer", "application", "support", "renewal", "board", "content"] as const;
function harness(overrides: Record<string, unknown> = {}) {
  const agentRuns = {
    start: vi.fn(async () => ({})), configureModel: vi.fn(async () => ({})),
    finish: vi.fn(async () => ({})), fail: vi.fn(async () => ({})),
    escalate: vi.fn(async () => ({})), disable: vi.fn(async () => ({})),
  };

  const stream = vi.fn(() => ({
    textStream: {async *[Symbol.asyncIterator]() { yield "{}"; }},
    finish: Promise.resolve({usage: {inputTokens: 2, outputTokens: 1}, finishReason: "stop", steps: 1, toolExecutions: 0, citations: []}),
  }));
  const openai = vi.fn(() => ({stream}));
  // This injected server registry exercises the same admission used in production.
  const dependencies = {agentRuns, providerFactories: {openai, anthropic: vi.fn()}, modelRegistry: Object.fromEntries(tasks.map(task => [task, {...route, ...overrides}])) as AdminModelRegistry};
  const runtime = createAgentRuntime(dependencies);
  return {runtime, stream, openai, agentRuns};
}
function request(agent: "concierge" | "writer" | "retention_analyst" | "board_reporter" = "concierge") {
  const actor = agent === "concierge"
    ? {agent, conversationId: "synthetic-conversation", profileId: null, trigger: "web" as const}
    : agent === "writer"
      ? {agent, conversationId: null, profileId: "synthetic-profile", trigger: "portal" as const}
      : {agent, conversationId: null, profileId: null, trigger: "scheduled" as const};
  return {enabled: true, model: route.key, credentials: {openaiApiKey: "synthetic-not-a-provider-key"}, actor, system: "Synthetic facts only.", messages: [{role: "user" as const, content: "Return JSON."}], tools: {}};
}
describe("server-approved AI routes", () => {
  it.each(["concierge", "writer", "retention_analyst", "board_reporter"] as const)("unapproved_route_rejected_before_network: %s", async agent => {
    const h = harness({approvedForAdmin: false});
    await expect(h.runtime.stream(request(agent))).rejects.toMatchObject({code: "configuration_error"});
    expect(h.openai).not.toHaveBeenCalled();
  });
  it("protocol_matches_model_route", async () => {
    const h = harness({protocol: "messages"});
    await expect(h.runtime.stream(request())).rejects.toMatchObject({code: "configuration_error"});
    expect(h.stream).not.toHaveBeenCalled();
  });
  it("client_base_url_and_model_are_rejected", async () => {
    const h = harness({baseURL: "https://unapproved.example.test/v1", model: "unapproved"});
    await expect(h.runtime.stream(request())).rejects.toMatchObject({code: "configuration_error"});
    expect(h.stream).not.toHaveBeenCalled();
  });
  it("input ceiling is enforced before provider construction", async () => {
    const h = harness({maxInputTokens: 8});
    await expect(h.runtime.stream(request())).rejects.toMatchObject({code: "configuration_error"});
    expect(h.openai).not.toHaveBeenCalled();
  });
  it("tool definitions count toward the input ceiling", async () => {
    const h = harness({maxInputTokens: 2_000});
    const input = {...request(), tools: {lookup: {
      description: "Synthetic description ".repeat(150),
      inputSchema: z.object({query: z.string()}), strict: true,
      execute: vi.fn(async () => ({value: {}})),
    }}};
    await expect(h.runtime.stream(input)).rejects.toMatchObject({code: "configuration_error"});
    expect(h.openai).not.toHaveBeenCalled();
    expect(input.tools.lookup.execute).not.toHaveBeenCalled();
  });
  it("scheduled JSON cannot silently downgrade to plain text", async () => {
    const h = harness({supportsJson: false});
    await expect(h.runtime.stream(request("board_reporter"))).rejects.toMatchObject({code: "configuration_error"});
    expect(h.openai).not.toHaveBeenCalled();
  });
});

describe("route catalog, capabilities and disabled optional adoption", () => {
  it.each(["concierge", "writer", "retention_analyst", "board_reporter"] as const)("existing actor %s retains its configured approved model", async agent => {
    const h = harness();const result = await h.runtime.stream(request(agent));
    await expect(result.finish).resolves.toMatchObject({status: "completed"});
    expect(h.openai).toHaveBeenCalledWith({apiKey: "synthetic-not-a-provider-key", route: expect.objectContaining(route)});
  });
  it.each(["application", "support", "content"] as const)("new %s purpose starts closed", task => {
    expect(() => resolveAdminModel(task, createAdminModelRegistry())).toThrow("AGENT_ROUTE_UNAPPROVED");
  });
  it.each([
    {approvedForAdmin: false}, {supportsTools: false}, {baseURL: "https://other.example.test"},
    {provider: "anthropic"}, {modelId: "unapproved"}, {pricingVersion: "unknown"},
    {maxInputTokens: 0}, {maxInputTokens: Infinity}, {maxOutputTokens: -1},
    {maxOutputTokens: 1.5}, {timeoutMs: 0}, {timeoutMs: 300_001},
  ])("rejects unsupported or client-shaped configuration: %j", overrides => {
    const registry = {...createAdminModelRegistry(), concierge: {...route, ...overrides} as ModelRoute};
    expect(() => resolveAdminModel("concierge", registry)).toThrow();
  });
  it("cannot inherit a route from a prototype", () => {
    const inherited = Object.create({concierge: route}) as AdminModelRegistry;
    expect(() => resolveAdminModel("concierge", inherited)).toThrow("AGENT_ROUTE_INVALID");
  });
  it.each(["model", "provider", "baseURL", "registry"])("actual concierge payload rejects client %s before runtime", field => {
    expect(conciergeRequestSchema.safeParse({message: "synthetic", locale: "en", [field]: "unapproved"}).success).toBe(false);
  });
  it("OpenCode rejects forged approval and does not read a coding key or dispatch", () => {
    const fetchMock = vi.fn();vi.stubGlobal("fetch", fetchMock);
    try {
      expect(OPENCODE_ADMIN_ADOPTION.approved).toBe(false);
      expect(OPENCODE_GO_BASE_URL).toBe("https://opencode.ai/zen/go/v1");
      expect(() => validateModelRoute({...route, key: "opencode:synthetic", provider: "opencode", modelId: "synthetic"})).toThrow("AGENT_ROUTE_UNAPPROVED");
      expect(() => createOpenCodeAgentProvider()).toThrow("AGENT_ROUTE_UNAPPROVED");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {vi.unstubAllGlobals();}
  });
  it("returns a frozen copy instead of a mutable authority-bearing config", () => {
    const registry = {...createAdminModelRegistry(), concierge: {...route}};
    const resolved = resolveAdminModel("concierge", registry);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(resolved).not.toBe(registry.concierge);
    registry.concierge.maxOutputTokens = 10;
    expect(resolved.maxOutputTokens).toBe(route.maxOutputTokens);
  });
});
