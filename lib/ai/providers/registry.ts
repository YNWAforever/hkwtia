import "server-only";
import {asSchema} from "ai";
import type {AgentToolSet} from "@/lib/ai/provider";
import {z} from "zod";
import {AI_MODEL_PRICING, AI_PRICING_VERSION, DEFAULT_AGENT_MODEL_KEY} from "@/config/ai-pricing";
import {AgentModelConfigurationError, parseAgentModel} from "@/lib/ai/model";

export type AdminAiTask = "concierge" | "writer" | "application" | "support" | "renewal" | "board" | "content";
export type ModelRoute = Readonly<{
  key: string;
  provider: "openai" | "anthropic" | "opencode";
  protocol: "responses" | "chat-completions" | "messages";
  modelId: string;
  approvedForAdmin: boolean;
  supportsTools: boolean;
  supportsJson: boolean;
  pricingVersion: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
}>;
export type AdminModelRegistry = Readonly<Record<AdminAiTask, ModelRoute>>;
const tasks: readonly AdminAiTask[] = ["concierge", "writer", "application", "support", "renewal", "board", "content"];
const routeSchema = z.object({
  key: z.string().min(1).max(128),
  provider: z.enum(["openai", "anthropic", "opencode"]),
  protocol: z.enum(["responses", "chat-completions", "messages"]),
  modelId: z.string().min(1).max(128), approvedForAdmin: z.boolean(),
  supportsTools: z.boolean(), supportsJson: z.boolean(),
  pricingVersion: z.literal(AI_PRICING_VERSION),
  maxInputTokens: z.number().int().positive().max(1_000_000),
  maxOutputTokens: z.number().int().positive().max(16_384),
  timeoutMs: z.number().int().positive().max(300_000),
}).strict();
function invalid(): never { throw new AgentModelConfigurationError("AGENT_ROUTE_INVALID"); }

/** Only the existing priced models are admitted. OpenCode has no approved admin route. */
export function validateModelRoute(route: ModelRoute): ModelRoute {
  const result = routeSchema.safeParse(route);
  if (!result.success) return invalid();
  const parsed = result.data;
  if (!parsed.approvedForAdmin || parsed.provider === "opencode") {
    throw new AgentModelConfigurationError("AGENT_ROUTE_UNAPPROVED");
  }
  if (!Object.hasOwn(AI_MODEL_PRICING, parsed.key)
    || parsed.key !== `${parsed.provider}:${parsed.modelId}`
    || (parsed.provider === "openai" && parsed.protocol === "messages")
    || (parsed.provider === "anthropic" && parsed.protocol !== "messages")) return invalid();
  return Object.freeze(parsed);
}
export function resolveAdminModel(task: AdminAiTask, registry: AdminModelRegistry): ModelRoute {
  if (!tasks.includes(task) || !Object.hasOwn(registry, task)) return invalid();
  const route = validateModelRoute(registry[task]);
  if ((task === "concierge" && !route.supportsTools)
    || (task !== "concierge" && !route.supportsJson)) {
    throw new AgentModelConfigurationError("AGENT_ROUTE_CAPABILITY_UNSUPPORTED");
  }
  return route;
}
/** Preserve existing server env choices; new purposes remain closed until their task gates. */
export function createAdminModelRegistry(model: string = DEFAULT_AGENT_MODEL_KEY): AdminModelRegistry {
  const parsed = parseAgentModel(model);
  const route: ModelRoute = {
    key: model, ...parsed, protocol: parsed.provider === "openai" ? "responses" : "messages",
    approvedForAdmin: true, supportsTools: true, supportsJson: true,
    pricingVersion: AI_PRICING_VERSION,
    // Configurable engineering ceilings, not membership, communication or association policy.
    maxInputTokens: 128_000, maxOutputTokens: 800, timeoutMs: 20_000,
  };
  return Object.freeze(Object.fromEntries(tasks.map(task => [task, Object.freeze({
    ...route, maxOutputTokens: ["writer", "application"].includes(task) ? 1_200 : ["board", "content"].includes(task) ? 1_600 : 800, approvedForAdmin: !["application", "support", "content"].includes(task),
  })])) as Record<AdminAiTask, ModelRoute>);
}
export const DEFAULT_ADMIN_MODEL_REGISTRY = createAdminModelRegistry();

export function taskForAgent(agent: "concierge" | "writer" | "retention_analyst" | "board_reporter"): AdminAiTask {
  switch (agent) {
    case "concierge": return "concierge";
    case "writer": return "writer";
    case "retention_analyst": return "renewal";
    case "board_reporter": return "board";
  }
}

/** Conservative byte admission includes schemas and applies again before each SDK step.
 * It is not a provider tokenizer or a cost estimate. T06 settles actual aggregate usage.
 */
export async function assertRouteInputWithinBounds(route: ModelRoute, input: Readonly<{
  system: string; messages: readonly unknown[]; tools: AgentToolSet;
}>): Promise<void> {
  try {
    const tools = await Promise.all(Object.entries(input.tools).map(async ([name, tool]) => ({
      name, description: tool.description, strict: tool.strict,
      parameters: await asSchema(tool.inputSchema).jsonSchema,
    })));
    const serialized = JSON.stringify({system: input.system, messages: input.messages, tools});
    const byteCeiling = Buffer.byteLength(serialized, "utf8") + 1_024;
    if (byteCeiling > route.maxInputTokens) return invalid();
  } catch {
    // Schema/value exceptions may contain input. Expose only the fixed admission code.
    return invalid();
  }
}
