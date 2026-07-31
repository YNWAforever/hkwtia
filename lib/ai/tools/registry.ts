import {requireConciergeAgent} from "@/lib/auth/agent-actor";
import type {AgentToolSet} from "@/lib/ai/provider";
import {createDraftEmailTool} from "@/lib/ai/tools/draft-email";
import {createEventsTool} from "@/lib/ai/tools/events";
import {createFundingTool} from "@/lib/ai/tools/funding";
import {createKbSearchTool} from "@/lib/ai/tools/kb-search";
import {createMemberContextTool} from "@/lib/ai/tools/member-context";
import {
  canonicalAppOrigin,
  type ConciergeToolAuditEvent,
  type ConciergeToolContext,
} from "@/lib/ai/tools/shared";
import {
  createEscalationTool,
  createStaffTaskTool,
} from "@/lib/ai/tools/staff-task";
import type {ConciergeToolRepositories} from "@/lib/db/repos/agent-tools";

export type {
  ConciergeToolAuditEvent,
  ConciergeToolContext,
  ConciergeToolRepositories,
};

export const APPROVED_CONCIERGE_TOOL_NAMES = Object.freeze([
  "kb_search",
  "get_member_context",
  "list_events",
  "get_funding_schemes",
  "draft_email",
  "create_task",
  "escalate",
] as const);

export function createConciergeTools(
  input: ConciergeToolContext,
): AgentToolSet {
  requireConciergeAgent(input.actor);
  if (input.locale !== "en" && input.locale !== "zh-HK") {
    throw new Error("CONCIERGE_LOCALE_INVALID");
  }
  if (typeof input.audit !== "function") {
    throw new Error("CONCIERGE_AUDIT_REQUIRED");
  }
  const context: ConciergeToolContext = Object.freeze({
    ...input,
    appOrigin: canonicalAppOrigin(input.appOrigin),
  });
  return Object.freeze({
    kb_search: createKbSearchTool(context),
    get_member_context: createMemberContextTool(context),
    list_events: createEventsTool(context),
    get_funding_schemes: createFundingTool(context),
    draft_email: createDraftEmailTool(context),
    create_task: createStaffTaskTool(context),
    escalate: createEscalationTool(context),
  });
}
