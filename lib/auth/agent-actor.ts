import "server-only";

import type {Actor as SessionActor} from "@/lib/membership/lifecycle";
import {forbidden} from "@/lib/membership/lifecycle";

export type ConciergeAgentActor = {
  kind: "agent";
  agent: "concierge";
  runId: string;
  conversationId: string;
  profileId: string | null;
  trigger: "web" | "whatsapp";
};

export type ScheduledAgentName = "retention_analyst" | "board_reporter";
export type ScheduledAgentActor = {
  kind: "agent";
  agent: ScheduledAgentName;
  runId: string;
  conversationId: null;
  profileId: null;
  trigger: "scheduled";
};

export type AgentRunActor = ConciergeAgentActor | ScheduledAgentActor;
export type Actor = SessionActor | AgentRunActor;

function hasRunId(actor: AgentRunActor): boolean {
  return typeof actor.runId === "string" && actor.runId.length > 0;
}

function isConciergeAgent(actor: Actor): actor is ConciergeAgentActor {
  return actor.kind === "agent"
    && actor.agent === "concierge"
    && hasRunId(actor)
    && typeof actor.conversationId === "string"
    && actor.conversationId.length > 0
    && (actor.profileId === null || typeof actor.profileId === "string")
    && (actor.trigger === "web" || actor.trigger === "whatsapp");
}

function isScheduledAgent(actor: Actor): actor is ScheduledAgentActor {
  return actor.kind === "agent"
    && (actor.agent === "retention_analyst" || actor.agent === "board_reporter")
    && hasRunId(actor)
    && actor.conversationId === null
    && actor.profileId === null
    && actor.trigger === "scheduled";
}

export function requireConciergeAgent(actor: Actor): ConciergeAgentActor {
  if (!isConciergeAgent(actor)) forbidden();
  return actor;
}

export function requireAgentRunActor(actor: Actor): AgentRunActor {
  if (isConciergeAgent(actor) || isScheduledAgent(actor)) return actor;
  return forbidden();
}

export function requireScheduledAgent(
  actor: Actor,
  expected: ScheduledAgentName,
): ScheduledAgentActor {
  if (!isScheduledAgent(actor) || actor.agent !== expected) forbidden();
  return actor;
}
