import "server-only";
import {AgentModelConfigurationError} from "@/lib/ai/model";
import type {AgentProvider} from "@/lib/ai/provider";

/** Reserved endpoint from the implementation specification. No request is dispatched. */
export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
export const OPENCODE_GO_API_KEY_ENV = "OPENCODE_GO_API_KEY";
export const OPENCODE_ADMIN_ADOPTION = Object.freeze({
  approved: false as const,
  gate: "ADMIN_PURPOSE_AND_MODEL_DATA_POLICY_UNAPPROVED" as const,
});
/** Fail closed even when someone supplies a Go key or toggles an environment flag.
 * There is no approved admin model catalog; coding credentials are not admin approval.
 * Before implementing dispatch: review purpose/data/pricing/protocol, use real app UA,
 * and a non-personal opaque per-conversation session. Never borrow an OpenAI key.
 */
export function createOpenCodeAgentProvider(): AgentProvider {
  throw new AgentModelConfigurationError("AGENT_ROUTE_UNAPPROVED");
}
