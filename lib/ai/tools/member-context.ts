import {z} from "zod";

import type {AgentTool} from "@/lib/ai/provider";
import {
  auditBestEffort,
  createTool,
  durationSince,
  ok,
  parseToolInput,
  type ConciergeToolContext,
} from "@/lib/ai/tools/shared";

export const memberContextInputSchema = z.object({}).strict();

export function createMemberContextTool(
  context: ConciergeToolContext,
): AgentTool {
  return createTool(
    "Get the authenticated member's minimal WTIA context.",
    memberContextInputSchema,
    async (input) => {
      await parseToolInput(
        context, "get_member_context", memberContextInputSchema, input,
      );
      const startedAt = Date.now();
      if (context.actor.profileId === null) {
        await auditBestEffort(context, {
          tool: "get_member_context",
          phase: "outcome",
          outcome: "denied",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "member_context_denied"}]);
      }
      try {
        const member = await context.repositories.getMemberContext(context.actor);
        if (!member) {
          await auditBestEffort(context, {
            tool: "get_member_context",
            phase: "outcome",
            outcome: "not_found",
            durationMs: durationSince(startedAt),
          });
          return ok([{code: "member_context_not_found"}]);
        }
        await auditBestEffort(context, {
          tool: "get_member_context",
          phase: "outcome",
          outcome: "success",
          durationMs: durationSince(startedAt),
          count: 1,
        });
        return ok([{
          code: "ok",
          displayName: member.displayName,
          preferredLocale: member.preferredLocale,
          companyDisplayName: member.companyDisplayName,
          membershipTier: member.membershipTier,
          membershipStatus: member.membershipStatus,
          renewalDate: member.renewalDate,
        }]);
      } catch {
        await auditBestEffort(context, {
          tool: "get_member_context",
          phase: "outcome",
          outcome: "error",
          durationMs: durationSince(startedAt),
        });
        return ok([{code: "member_context_failed"}]);
      }
    },
  );
}
