import {createHash} from "node:crypto";

import {z, type ZodTypeAny} from "zod";

import type {ConciergeAgentActor} from "@/lib/auth/agent-actor";
import type {EmbeddingAdapter} from "@/lib/ai/embeddings";
import type {AgentTool, AgentToolResult} from "@/lib/ai/provider";
import type {
  ConciergeLocale,
  ConciergeToolRepositories,
} from "@/lib/db/repos/agent-tools";

export type ConciergeToolName =
  | "kb_search"
  | "get_member_context"
  | "list_events"
  | "get_funding_schemes"
  | "draft_email"
  | "create_task"
  | "escalate";

export type ConciergeToolAuditEvent = Readonly<{
  tool: ConciergeToolName;
  runId: string;
  conversationId: string;
  phase: "pre" | "outcome";
  outcome:
    | "authorized"
    | "success"
    | "denied"
    | "error"
    | "not_found";
  durationMs?: number;
  count?: number;
}>;

export type ConciergeToolContext = Readonly<{
  actor: ConciergeAgentActor;
  locale: ConciergeLocale;
  repositories: ConciergeToolRepositories;
  embedding: EmbeddingAdapter;
  confirmedContactEmail?: string;
  appOrigin: string;
  audit: (event: ConciergeToolAuditEvent) => Promise<void>;
}>;

export const localeSchema = z.enum(["en", "zh-HK"]);

export function createTool(
  description: string,
  inputSchema: ZodTypeAny,
  execute: AgentTool["execute"],
): AgentTool {
  return Object.freeze({
    description,
    inputSchema,
    strict: true,
    execute,
  });
}

export function ok(value: readonly unknown[], citations?: readonly {
  sourceId: string;
  title: string;
  url?: string;
}[]): AgentToolResult {
  return {
    value,
    ...(citations === undefined ? {} : {citations}),
  };
}

export async function parseToolInput<TSchema extends ZodTypeAny>(
  context: ConciergeToolContext,
  tool: ConciergeToolName,
  schema: TSchema,
  input: unknown,
): Promise<z.infer<TSchema>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  await auditBestEffort(context, {
    tool,
    phase: "outcome",
    outcome: "denied",
  });
  throw parsed.error;
}
export async function auditBestEffort(
  context: ConciergeToolContext,
  event: Omit<ConciergeToolAuditEvent, "runId" | "conversationId">,
): Promise<void> {
  try {
    await context.audit({
      ...event,
      runId: context.actor.runId,
      conversationId: context.actor.conversationId,
    });
  } catch {
    // Outcome audit must not cause a completed write to be retried.
  }
}

export async function auditBeforeWrite(
  context: ConciergeToolContext,
  tool: ConciergeToolName,
): Promise<boolean> {
  try {
    await context.audit({
      tool,
      runId: context.actor.runId,
      conversationId: context.actor.conversationId,
      phase: "pre",
      outcome: "authorized",
    });
    return true;
  } catch {
    return false;
  }
}

export function durationSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

export function sourceId(prefix: "kb" | "funding", value: string): string {
  return `${prefix}:${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function canonicalHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.hash
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function canonicalAppOrigin(value: string): string {
  const url = canonicalHttpsUrl(value);
  if (!url) throw new Error("CONCIERGE_APP_ORIGIN_INVALID");
  const parsed = new URL(url);
  if (parsed.pathname !== "/" || parsed.search) {
    throw new Error("CONCIERGE_APP_ORIGIN_INVALID");
  }
  return parsed.origin;
}
