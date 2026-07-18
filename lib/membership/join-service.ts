import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {getPlan} from "@/lib/membership/plans";
import {joinInputSchema, type JoinInput} from "@/lib/membership/join-schema";
import {
  completeApplication,
  type JoinApplication,
  type JoinDependencies,
  type JoinStep,
} from "@/lib/membership/onboarding";

export type StartJoinResult = Readonly<{
  applicationId: string;
  next: JoinStep;
}>;

const defaultApplications = applicationsRepository as unknown as {
  getById: (actor: Actor, applicationId: string) => Promise<JoinApplication | null>;
  create: (actor: Actor, input: Record<string, unknown>) => Promise<JoinApplication>;
};
const defaultProfiles = profilesRepository as unknown as {
  ensure: (actor: Actor, input: {id: string; displayName: string; onboardingState?: string}) => Promise<unknown>;
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

/** Begin or resume an actor-scoped membership application. */
export async function startJoin(
  actor: Actor,
  rawInput: JoinInput | Record<string, unknown>,
  dependencies?: JoinDependencies,
): Promise<StartJoinResult> {
  const input = joinInputSchema.parse(rawInput);
  const plan = getPlan(input.plan);
  const applications = dependencies?.applications ?? dependencies?.repositories?.applications ?? defaultApplications;
  const profiles = dependencies ? dependencies.profiles ?? dependencies.repositories?.profiles : defaultProfiles;

  if (input.applicationId) {
    if (actor.kind === "anonymous") throw new Error("UNAUTHORIZED");
    const existing = await applications.getById(actor, input.applicationId);
    if (!existing) throw new Error("APPLICATION_NOT_FOUND");
    if (existing.planCode !== plan.code) throw new Error("APPLICATION_PLAN_MISMATCH");
    return {applicationId: existing.id, next: stepForApplication(existing)};
  }

  if (actor.kind === "anonymous") {
    return {applicationId: dependencies?.idFactory?.() ?? idFactory(), next: "profile"};
  }

  if (actor.kind !== "member") throw new Error("UNAUTHORIZED");
  if (profiles) await profiles.ensure(actor, {id: actor.profileId, displayName: actor.profileId, onboardingState: "profile"});
  const application = await applications.create(actor, {
    planCode: plan.code,
    currentStep: "profile",
    status: "draft",
  });
  return {applicationId: application.id, next: "profile"};
}

export {completeApplication, getPlan};
export type {JoinInput};
