// @vitest-environment node
import {afterEach, describe, expect, it, vi} from "vitest";
import {z} from "zod";
import {createAgentRuntime} from "@/lib/ai/runtime";
import {createOpenAIAgentProvider} from "@/lib/ai/providers/openai";
import {createAnthropicAgentProvider} from "@/lib/ai/providers/anthropic";
import {createAdminModelRegistry, type ModelRoute} from "@/lib/ai/providers/registry";
import type {AgentProvider, AgentStreamResult} from "@/lib/ai/provider";

const protocols = ["responses", "chat-completions", "messages"] as const;
const item = {type: "function_call", id: "fc_test", call_id: "call_test", name: "lookup", arguments: '{"query":"synthetic"}', status: "completed"};
function sse(protocol: ModelRoute["protocol"], text: string, tool = false): Response {
  let events: unknown[];
  if (protocol === "responses") {
    events = [{type: "response.created", response: {id: "resp_test", created_at: 1, model: "gpt-4.1-mini"}},
      {type: "response.output_item.added", output_index: 0, item: tool ? {...item, arguments: "", status: "in_progress"} : {type: "message", id: "msg_test"}},
      ...(tool ? [] : [{type: "response.output_text.delta", item_id: "msg_test", delta: text}]),
      {type: "response.output_item.done", output_index: 0, item: tool ? item : {type: "message", id: "msg_test"}},
      {type: "response.completed", response: {usage: {input_tokens: 2, output_tokens: 1}}}];
  } else if (protocol === "chat-completions") {
    events = [{id: "chat_test", created: 1, model: "gpt-4.1-mini", choices: [{index: 0, delta: tool
      ? {role: "assistant", tool_calls: [{index: 0, id: "call_test", type: "function", function: {name: "lookup", arguments: item.arguments}}]}
      : {role: "assistant", content: text}, finish_reason: null}]},
      {choices: [{index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop"}], usage: {prompt_tokens: 2, completion_tokens: 1}}];
  } else {
    events = [{type: "message_start", message: {id: "msg_test", model: "claude-sonnet-4-6", role: "assistant", usage: {input_tokens: 2}}},
      {type: "content_block_start", index: 0, content_block: tool ? {type: "tool_use", id: "call_test", name: "lookup", input: {}} : {type: "text", text: ""}},
      {type: "content_block_delta", index: 0, delta: tool ? {type: "input_json_delta", partial_json: item.arguments} : {type: "text_delta", text}},
      {type: "content_block_stop", index: 0},
      {type: "message_delta", delta: {stop_reason: tool ? "tool_use" : "end_turn"}, usage: {output_tokens: 1}},
      {type: "message_stop"}];
  }
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + (protocol === "chat-completions" ? "data: [DONE]\n\n" : ""), {headers: {"content-type": "text/event-stream"}});
}
function routeFor(protocol: ModelRoute["protocol"]): ModelRoute {
  return {...createAdminModelRegistry(protocol === "messages" ? "anthropic:claude-sonnet-4-6" : "openai:gpt-4.1-mini").concierge, protocol};
}
function providerFor(route: ModelRoute): AgentProvider {
  return route.provider === "anthropic"
    ? createAnthropicAgentProvider("synthetic-key", {}, route)
    : createOpenAIAgentProvider("synthetic-key", {}, route);
}
async function read(result: AgentStreamResult) {
  const text = (async () => {let output = ""; for await (const delta of result.textStream) output += delta; return output;})();
  const [output, finish] = await Promise.all([text, result.finish]);
  return {output, finish};
}
const request = {system: "Synthetic contract only.", messages: [{role: "user" as const, content: "Answer using synthetic facts."}], tools: {}};
afterEach(() => vi.unstubAllGlobals());

describe("locked SDK adapters against mock HTTP endpoint responses (not live receipts)", () => {
  it.each(protocols)("%s parses streams and JSON using its actual endpoint", async protocol => {
    const route = routeFor(protocol);
    const fetchMock = vi.fn(async () => sse(protocol, '{"summary":"synthetic"}'));
    vi.stubGlobal("fetch", fetchMock);
    const result = await read(await providerFor(route).stream({...request, model: route.modelId}));
    expect(JSON.parse(result.output)).toEqual({summary: "synthetic"});
    expect(result.finish).toMatchObject({usage: {inputTokens: 2, outputTokens: 1}, steps: 1, toolExecutions: 0});
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(protocol === "messages" ? "https://api.anthropic.com/v1/messages"
      : protocol === "responses" ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(route.modelId);
    expect(body.stream).toBe(true);
    expect(body.max_output_tokens ?? body.max_completion_tokens ?? body.max_tokens).toBe(route.maxOutputTokens);
  });
  it.each(protocols)("%s executes one guarded tool then retains aggregate multi-step usage", async protocol => {
    const route = routeFor(protocol);let count = 0;
    const fetchMock = vi.fn(async () => sse(protocol, "grounded synthetic answer", ++count === 1));
    vi.stubGlobal("fetch", fetchMock);
    const execute = vi.fn(async () => ({value: {answer: "synthetic"}, citations: [{sourceId: "owned-fact", title: "Synthetic fact"}]}));
    const result = await read(await providerFor(route).stream({...request, model: route.modelId, tools: {lookup: {
      description: "Only synthetic facts", inputSchema: z.object({query: z.string()}), strict: true, execute,
    }}}));
    expect(result.output).toBe("grounded synthetic answer");
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({query: "synthetic"}, expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.finish).toMatchObject({usage: {inputTokens: 4, outputTokens: 2}, steps: 2, toolExecutions: 1, citations: [{sourceId: "owned-fact", title: "Synthetic fact"}]});
  });
  it.each(["rate_limited", "timeout"] as const)("real SDK %s is classified without fallback or retry", async expectedCode => {
    const route = {...routeFor("responses"), timeoutMs: 35};
    const fetchMock = expectedCode === "rate_limited"
      ? vi.fn(async () => new Response(JSON.stringify({error: {message: "Synthetic rate limit", type: "rate_limit_error", code: "rate_limit_exceeded"}}), {status: 429, headers: {"content-type": "application/json"}}))
      : vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Synthetic timeout", "AbortError")), {once: true});
      }));
    vi.stubGlobal("fetch", fetchMock);
    const agentRuns = {start: vi.fn(async () => ({})), configureModel: vi.fn(async () => ({})), finish: vi.fn(async () => ({})), fail: vi.fn(async () => ({})), escalate: vi.fn(async () => ({})), disable: vi.fn(async () => ({}))};
    const fallback = vi.fn();
    const registry = createAdminModelRegistry();
    const runtime = createAgentRuntime({agentRuns, modelRegistry: {...registry, concierge: route}, providerFactories: {openai: () => providerFor(route), anthropic: fallback}});
    const stream = await runtime.stream({...request, enabled: true, model: route.key, credentials: {openaiApiKey: "synthetic-key"}, actor: {conversationId: "owned-conversation", profileId: null, trigger: "web"}});
    await expect(stream.finish).rejects.toMatchObject({code: expectedCode});
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(agentRuns.fail).toHaveBeenCalledOnce();
    expect(agentRuns.finish).not.toHaveBeenCalled();
  });
});
