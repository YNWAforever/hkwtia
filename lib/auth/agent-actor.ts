import "server-only";

import {forbidden} from "@/lib/membership/lifecycle";

export type ConciergeAgentActor = {
  kind: "agent";
  agent: "concierge";
  runId: string;
  conversationId: string;
  profileId: string | null;
  trigger: "web" | "whatsapp";
};

export function requireConciergeAgent(
  actor: ConciergeAgentActor,
): asserts actor is ConciergeAgentActor {
  if (
    actor?.kind !== "agent"
    || actor.agent !== "concierge"
    || typeof actor.runId !== "string"
    || actor.runId.length === 0
    || typeof actor.conversationId !== "string"
    || actor.conversationId.length === 0
    || (actor.profileId !== null && typeof actor.profileId !== "string")
    || (actor.trigger !== "web" && actor.trigger !== "whatsapp")
  ) {
    forbidden();
  }
}
