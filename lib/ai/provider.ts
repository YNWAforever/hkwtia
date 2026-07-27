import type {ZodTypeAny} from "zod";

export const MAX_AGENT_STEPS = 8;
export const MAX_AGENT_CITATIONS = 8;

export type AgentMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export type AgentUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
}>;

export type AgentCitationInput = Readonly<{
  sourceId: string;
  title: string;
  url?: string;
}>;

export type AgentCitation = Readonly<{
  sourceId: string;
  title: string;
  url?: string;
}>;

export type AgentToolResult = Readonly<{
  value: unknown;
  citations?: readonly AgentCitationInput[];
}>;

export type AgentToolExecutionOptions = Readonly<{
  abortSignal?: AbortSignal;
}>;

export type AgentTool = Readonly<{
  description: string;
  inputSchema: ZodTypeAny;
  strict: boolean;
  execute: (
    input: unknown,
    options: AgentToolExecutionOptions,
  ) => Promise<AgentToolResult> | AgentToolResult;
}>;

export type AgentToolSet = Readonly<Record<string, AgentTool>>;

export type AgentStreamRequest = Readonly<{
  model: string;
  system: string;
  messages: AgentMessage[];
  tools: AgentToolSet;
  abortSignal?: AbortSignal;
}>;

export type AgentStreamFinish = Readonly<{
  usage: AgentUsage;
  finishReason: string;
  steps: number;
  toolExecutions: number;
  citations: readonly AgentCitationInput[];
}>;

export type AgentStreamResult = Readonly<{
  textStream: AsyncIterable<string>;
  finish: Promise<AgentStreamFinish>;
}>;

export type AgentProvider = Readonly<{
  stream: (
    request: AgentStreamRequest,
  ) => AgentStreamResult | Promise<AgentStreamResult>;
}>;

export type AgentProviderFactory = (
  options: Readonly<{apiKey: string}>,
) => AgentProvider;

export class AgentInvalidProviderResponseError extends Error {
  constructor() {
    super("AGENT_INVALID_PROVIDER_RESPONSE");
    this.name = "AgentInvalidProviderResponseError";
  }
}

export class AgentToolExecutionError extends Error {
  constructor(options?: ErrorOptions) {
    super("AGENT_TOOL_EXECUTION_FAILED", options);
    this.name = "AgentToolExecutionError";
  }
}

function safeHttpUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeAgentCitations(inputs: unknown): AgentCitation[] {
  let inputCount: number;
  try {
    if (!Array.isArray(inputs)) return [];
    inputCount = Math.min(inputs.length, MAX_AGENT_CITATIONS);
  } catch {
    return [];
  }

  const citations: AgentCitation[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < inputCount; index += 1) {
    let input: unknown;
    try {
      input = inputs[index];
    } catch {
      continue;
    }
    if (!input || typeof input !== "object") continue;

    let sourceIdValue: unknown;
    let titleValue: unknown;
    let urlValue: unknown;
    try {
      const record = input as Record<string, unknown>;
      sourceIdValue = record.sourceId;
      titleValue = record.title;
      urlValue = record.url;
    } catch {
      continue;
    }
    if (
      typeof sourceIdValue !== "string"
      || typeof titleValue !== "string"
    ) {
      continue;
    }

    const sourceId = sourceIdValue.trim().slice(0, 128);
    const title = titleValue.trim().slice(0, 200);
    if (!sourceId || !title || seen.has(sourceId)) continue;

    const url = safeHttpUrl(urlValue);
    if (urlValue !== undefined && url === undefined) continue;

    seen.add(sourceId);
    citations.push({
      sourceId,
      title,
      ...(url === undefined ? {} : {url}),
    });
  }

  return citations;
}
