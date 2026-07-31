import "server-only";

export type WoztellAgentRunSnapshot = Readonly<{
  status: "running" | "disabled" | "completed" | "failed" | "escalated";
  provider: string | null;
  model: string | null;
}>;

export type WoztellRunRecovery =
  | Readonly<{status: "start_new"}>
  | Readonly<{status: "resume_pre_provider"}>
  | Readonly<{status: "reply_ready"; reply: string}>
  | Readonly<{status: "escalate_ambiguous"}>;

export function decideWoztellRunRecovery(input: Readonly<{
  run: WoztellAgentRunSnapshot | null;
  persistedAssistantReply: string | null;
}>): WoztellRunRecovery {
  if (input.run === null) return {status: "start_new"};
  const reply = input.persistedAssistantReply?.trim() ?? "";
  if (input.run.status === "completed" && reply) {
    return {status: "reply_ready", reply};
  }
  if (
    input.run.status === "running"
    && input.run.provider === null
    && input.run.model === null
  ) {
    return {status: "resume_pre_provider"};
  }
  return {status: "escalate_ambiguous"};
}
