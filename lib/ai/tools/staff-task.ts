import {z} from "zod";

import type {AgentTool} from "@/lib/ai/provider";
import {
  auditBeforeWrite,
  auditBestEffort,
  createTool,
  durationSince,
  ok,
  parseToolInput,
  type ConciergeToolContext,
} from "@/lib/ai/tools/shared";

const reasonSchema = z.enum([
  "human_requested",
  "policy_boundary",
  "low_confidence",
  "tool_unavailable",
  "provider_handoff",
]);
const escalationReasonSchema = z.enum([
  "human_requested",
  "policy_boundary",
  "low_confidence",
  "tool_unavailable",
]);
export const createTaskInputSchema = z.object({
  kind: z.enum([
    "member_follow_up",
    "event_follow_up",
    "funding_follow_up",
    "general_follow_up",
  ]),
  reason: reasonSchema,
}).strict();
export const escalateInputSchema = z.object({
  reason: escalationReasonSchema,
}).strict();

async function writeTask(
  context: ConciergeToolContext,
  tool: "create_task" | "escalate",
  input: Readonly<{kind: string; reason: z.infer<typeof reasonSchema>}>,
) {
  const startedAt = Date.now();
  if (!await auditBeforeWrite(context, tool)) {
    return ok([{code: "audit_unavailable"}]);
  }
  try {
    const task = await context.repositories.createStaffTask(context.actor, {
      profileId: context.actor.profileId,
      kind: `concierge_${input.kind}`,
      summaryCode: input.reason,
      reasonCode: input.reason,
      locale: context.locale,
      ...(context.confirmedContactEmail === undefined
        ? {}
        : {contactEmail: context.confirmedContactEmail.trim().toLowerCase()}),
    });
    await auditBestEffort(context, {
      tool,
      phase: "outcome",
      outcome: "success",
      durationMs: durationSince(startedAt),
      count: 1,
    });
    return ok([{
      code: "ok",
      taskId: task.id,
      status: task.status,
      ...(tool === "escalate" ? {reference: `WTIA-${task.id}`} : {}),
    }]);
  } catch {
    await auditBestEffort(context, {
      tool,
      phase: "outcome",
      outcome: "error",
      durationMs: durationSince(startedAt),
    });
    return ok([{code: `${tool}_failed`}]);
  }
}

export function createStaffTaskTool(
  context: ConciergeToolContext,
): AgentTool {
  return createTool(
    "Create a bounded safe-code follow-up task for WTIA staff.",
    createTaskInputSchema,
    async (input) => {
      const parsed = await parseToolInput(
        context, "create_task", createTaskInputSchema, input,
      );
      return writeTask(context, "create_task", parsed);
    },
  );
}

export function createEscalationTool(
  context: ConciergeToolContext,
): AgentTool {
  return createTool(
    "Escalate the current Concierge conversation to WTIA staff.",
    escalateInputSchema,
    async (input) => {
      const parsed = await parseToolInput(
        context, "escalate", escalateInputSchema, input,
      );
      return writeTask(context, "escalate", {
        kind: "escalation",
        reason: parsed.reason,
      });
    },
  );
}
