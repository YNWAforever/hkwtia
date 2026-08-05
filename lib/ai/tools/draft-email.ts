import {z} from "zod";

import type {AgentTool} from "@/lib/ai/provider";
import {
  auditBeforeWrite,
  auditBestEffort,
  createTool,
  durationSince,
  ok,
  type ConciergeToolContext,
} from "@/lib/ai/tools/shared";

const htmlPattern = /<\s*\/?\s*[a-z][^>]*>/i;
export const draftEmailInputSchema = z.object({
  recipient: z.string().email().max(320),
  recipientConfirmed: z.literal(true),
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(10_000).refine(
    (value) => !htmlPattern.test(value),
    "HTML is not allowed",
  ),
}).strict();

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** True when the recipient is not the address confirmed for this conversation. */
function recipientMismatch(
  confirmedContactEmail: string | undefined,
  recipient: unknown,
): boolean {
  if (confirmedContactEmail === undefined) return true;
  return typeof recipient !== "string"
    || normalizeEmail(recipient) !== normalizeEmail(confirmedContactEmail);
}

export function createDraftEmailTool(
  context: ConciergeToolContext,
): AgentTool {
  return createTool(
    "Create a pending approval for a plain-text email draft; never send it.",
    draftEmailInputSchema,
    async (input) => {
      let parsed: z.infer<typeof draftEmailInputSchema>;
      try {
        parsed = draftEmailInputSchema.parse(input);
      } catch (error) {
        await auditBestEffort(context, {
          tool: "draft_email",
          phase: "outcome",
          outcome: "denied",
        });
        // A well-formed call aimed at the wrong recipient is a policy denial
        // the model can recover from; anything else is a malformed tool call.
        const values = input && typeof input === "object"
          ? input as Readonly<Record<string, unknown>>
          : null;
        const recipientRefused = values !== null
          && Object.keys(values).every((key) =>
            ["recipient", "recipientConfirmed", "subject", "body"].includes(key)
          )
          && (
            values.recipientConfirmed === false
            || (
              context.confirmedContactEmail !== undefined
              && typeof values.recipient === "string"
              && recipientMismatch(context.confirmedContactEmail, values.recipient)
            )
          );
        if (recipientRefused) return ok([{code: "draft_email_recipient_denied"}]);
        throw error;
      }
      const startedAt = Date.now();
      if (recipientMismatch(context.confirmedContactEmail, parsed.recipient)) {
        await auditBestEffort(context, {
          tool: "draft_email",
          phase: "outcome",
          outcome: "denied",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "draft_email_recipient_denied"}]);
      }
      if (!await auditBeforeWrite(context, "draft_email")) {
        return ok([{code: "audit_unavailable"}]);
      }
      try {
        const approval = await context.repositories.createDraftEmailApproval(
          context.actor,
          {
            to: normalizeEmail(parsed.recipient),
            subject: parsed.subject,
            text: parsed.body,
            locale: context.locale,
            conversationId: context.actor.conversationId,
            agentRunId: context.actor.runId,
          },
        );
        await auditBestEffort(context, {
          tool: "draft_email",
          phase: "outcome",
          outcome: "success",
          durationMs: durationSince(startedAt),
          count: 1,
        });
        return ok([{
          code: "ok",
          approvalId: approval.id,
          approvalType: "agent.draft_email",
          status: approval.status,
        }]);
      } catch {
        await auditBestEffort(context, {
          tool: "draft_email",
          phase: "outcome",
          outcome: "error",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "draft_email_failed"}]);
      }
    },
  );
}
