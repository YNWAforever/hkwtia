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
        if (
          input
          && typeof input === "object"
          && Object.keys(input).every((key) =>
            ["recipient", "recipientConfirmed", "subject", "body"].includes(key)
          )
          && (
            (input as {recipientConfirmed?: unknown}).recipientConfirmed === false
            || (
              typeof (input as {recipient?: unknown}).recipient === "string"
              && context.confirmedContactEmail !== undefined
              && normalizeEmail((input as {recipient: string}).recipient)
                !== normalizeEmail(context.confirmedContactEmail)
            )
          )
        ) {
          await auditBestEffort(context, {
            tool: "draft_email",
            phase: "outcome",
            outcome: "denied",
          });
          return ok([{code: "draft_email_recipient_denied"}]);
        }
await auditBestEffort(context, {
          tool: "draft_email",
          phase: "outcome",
          outcome: "denied",
        });
        throw error;
      }
      const startedAt = Date.now();
      if (
        context.confirmedContactEmail === undefined
        || normalizeEmail(parsed.recipient)
          !== normalizeEmail(context.confirmedContactEmail)
      ) {
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
