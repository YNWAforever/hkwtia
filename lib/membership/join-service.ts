import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {getPlan} from "@/lib/membership/plans";
import {joinInputSchema, type JoinInput} from "@/lib/membership/join-schema";
import {
  completeApplication,
  type JoinApplication,
  type JoinDependencies,
  type JoinStep,
} from "@/lib/membership/onboarding";
import {applicationsRepository} from "@/lib/db/repos/applications";

export type StartJoinResult = Readonly<{
  applicationId: string;
  next: JoinStep;
}>;

const defaultApplications = applicationsRepository as unknown as {
  getById: (actor: Actor, applicationId: string) => Promise<JoinApplication | null>;
  create: (actor: Actor, input: Record<string, unknown>) => Promise<JoinApplication>;
};

function idFactory(): string {
  return globalThis.crypto?.randomUUID?.() ?? `application-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stepForApplication(application: JoinApplication): JoinStep {
  if (application.status === "completed") return "complete";
  if (application.status === "pending_payment") return "checkout";
  if (application.status === "pending_review") return "review";
  if (application.currentStep) return application.currentStep;
  return "profile";
}

/**
 * Begin or resume a membership application. A supplied application id is
 * always read through the actor-scoped repository, making refreshes idempotent
 * without exposing another member's draft.
 */
export async function startJoin(
  actor: Actor,
  rawInput: JoinInput | Record<string, unknown>,
  dependencies?: JoinDependencies,
): Promise<StartJoinResult> {
  const input = joinInputSchema.parse(rawInput);
  const plan = getPlan(input.plan);
  const applications = dependencies?.applications ?? dependencies?.repositories?.applications ?? defaultApplications;

  if (input.applicationId) {
    if (actor.kind === "anonymous") throw new Error("UNAUTHORIZED");
    const existing = await applications.getById(actor, input.applicationId);
    if (!existing) throw new Error("APPLICATION_NOT_FOUND");
    if (existing.planCode !== plan.code) throw new Error("APPLICATION_PLAN_MISMATCH");
    return {applicationId: existing.id, next: stepForApplication(existing)};
  }

  if (actor.kind === "anonymous") {
    // An anonymous visitor can select a plan before authenticating. The id is
    // only a continuation token; no application or PII is persisted yet.
    return {applicationId: dependencies?.idFactory?.() ?? idFactory(), next: "profile"};
  }

  const application = await applications.create(actor, {
    planCode: plan.code,
    currentStep: "profile",
    status: "draft",
  });
  return {applicationId: application.id, next: "profile"};
}

export {completeApplication, getPlan};
export type {JoinInput};
