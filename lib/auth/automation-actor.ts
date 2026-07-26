import "server-only";

import {forbidden, type Actor} from "@/lib/membership/lifecycle";

export type AutomationCronActor = Readonly<{
  kind: "system";
  userId: null;
  source: "automation-cron";
}>;

export type AutomationRepositoryActor = Actor | AutomationCronActor;

export function automationCronActor(): AutomationCronActor {
  return Object.freeze({
    kind: "system",
    userId: null,
    source: "automation-cron",
  });
}

export function requireAutomationSystem(
  actor: AutomationRepositoryActor,
): asserts actor is Extract<AutomationRepositoryActor, {kind: "system"}> {
  if (
    actor.kind !== "system"
    || (actor.source !== "stripe-webhook" && actor.source !== "automation-cron")
  ) {
    forbidden();
  }
}

export function requireAutomationCron(
  actor: AutomationRepositoryActor,
): asserts actor is AutomationCronActor {
  requireAutomationSystem(actor);
  if (actor.source !== "automation-cron") {
    forbidden();
  }
}
