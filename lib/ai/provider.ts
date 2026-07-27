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

function safeHttpUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeAgentCitations(
  inputs: readonly AgentCitationInput[],
): AgentCitation[] {
  const citations: AgentCitation[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    if (citations.length >= MAX_AGENT_CITATIONS) break;
    if (
      !input
      || typeof input.sourceId !== "string"
      || typeof input.title !== "string"
    ) {
      continue;
    }

    const sourceId = input.sourceId.trim().slice(0, 128);
    const title = input.title.trim().slice(0, 200);
    if (!sourceId || !title || seen.has(sourceId)) continue;

    const url = safeHttpUrl(input.url);
    if (input.url !== undefined && url === undefined) continue;

    seen.add(sourceId);
    citations.push({
      sourceId,
      title,
      ...(url === undefined ? {} : {url}),
    });
  }

  return citations;
}
