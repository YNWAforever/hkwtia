import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {
  completeApplicationSchema,
  type CompanyInput,
  type CompleteApplicationInput,
  type JoinInput,
  type ProfileInput,
} from "@/lib/membership/join-schema";

export type JoinStep = "profile" | "company" | "checkout" | "complete" | "review";

export type JoinApplication = {
  id: string;
  applicantUserId: string;
  companyId?: string | null;
  planCode: PlanCode;
  currentStep?: JoinStep;
  status?: "draft" | "pending_payment" | "pending_review" | "completed" | "abandoned";
};

export type JoinMembership = {
  id: string;
  planCode: PlanCode;
  status: "pending_payment" | "pending_review" | "active";
  ownerUserId: string | null;
  companyId: string | null;
  seatLimit: number;
};

type ApplicationRepository = {
  getById: (actor: Actor, applicationId: string) => Promise<JoinApplication | null>;
  create: (actor: Actor, input: Record<string, unknown>) => Promise<JoinApplication>;
  update: (actor: Actor, applicationId: string, input: Record<string, unknown>) => Promise<JoinApplication | null>;
};

type MembershipRepository = {
  create: (actor: Actor, input: Record<string, unknown>) => Promise<JoinMembership>;
};

export type JoinDependencies = {
  applications?: ApplicationRepository;
  memberships?: MembershipRepository;
  repositories?: {
    applications?: ApplicationRepository;
    memberships?: MembershipRepository;
  };
  idFactory?: () => string;
  readonly [key: string]: unknown;
};

const defaultDependencies: Required<Pick<JoinDependencies, "applications" | "memberships">> = {
  applications: applicationsRepository as unknown as ApplicationRepository,
  memberships: membershipsRepository as unknown as MembershipRepository,
};

export type CheckoutCommand = Readonly<{
  kind: "membership_checkout";
  applicationId: string;
  membershipId: string;
  planCode: Exclude<PlanCode, "community" | "patron">;
}>;

export type CompleteApplicationResult = Readonly<{
  applicationId: string;
  next: JoinStep;
  membershipId?: string;
  checkout?: CheckoutCommand;
}>;

function idFactory(): string {
  return globalThis.crypto?.randomUUID?.() ?? `application-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requireMember(actor: Actor): asserts actor is Extract<Actor, {kind: "member"}> {
  if (actor.kind !== "member") throw new Error("UNAUTHORIZED");
}

function dependencies(input?: JoinDependencies) {
  return {
    applications: input?.applications ?? input?.repositories?.applications ?? defaultDependencies.applications,
    memberships: input?.memberships ?? input?.repositories?.memberships ?? defaultDependencies.memberships,
    idFactory: input?.idFactory ?? idFactory,
  };
}

function targetFor(actor: Extract<Actor, {kind: "member"}>, company: CompanyInput | null) {
  const companyId = company?.id ?? null;
  return companyId
    ? {ownerUserId: null, companyId}
    : {ownerUserId: actor.userId, companyId: null};
}

async function loadOrCreateApplication(
  actor: Extract<Actor, {kind: "member"}>,
  input: CompleteApplicationInput,
  deps: ReturnType<typeof dependencies>,
): Promise<JoinApplication> {
  if (input.applicationId) {
    const existing = await deps.applications.getById(actor, input.applicationId);
    if (!existing) throw new Error("APPLICATION_NOT_FOUND");
    if (existing.planCode !== input.plan) throw new Error("APPLICATION_PLAN_MISMATCH");
    return existing;
  }

  return deps.applications.create(actor, {
    planCode: input.plan,
    currentStep: "profile",
    status: "draft",
  });
}

async function updateApplication(
  actor: Extract<Actor, {kind: "member"}>,
  application: JoinApplication,
  input: Record<string, unknown>,
  deps: ReturnType<typeof dependencies>,
): Promise<JoinApplication> {
  const updated = await deps.applications.update(actor, application.id, input);
  return updated ?? {...application, ...input};
}

/**
 * Complete the server-side join steps and choose a domain outcome. Stripe is
 * intentionally not imported or called here; paid plans return a command for
 * the billing task to execute later.
 */
export async function completeApplication(
  actor: Actor,
  rawInput: CompleteApplicationInput | Record<string, unknown>,
  inputDependencies?: JoinDependencies,
): Promise<CompleteApplicationResult> {
  requireMember(actor);
  const input = completeApplicationSchema.parse(rawInput);
  const deps = dependencies(inputDependencies);
  const application = await loadOrCreateApplication(actor, input, deps);

  if (application.status === "completed") {
    return {applicationId: application.id, next: "complete"};
  }
  if (application.status === "pending_review") {
    return {applicationId: application.id, next: "review"};
  }
  if (application.status === "pending_payment") {
    return {applicationId: application.id, next: "checkout"};
  }

  const plan = getPlan(input.plan);
  const target = targetFor(actor, input.company);

  if (plan.billingBehavior === "free") {
    const membership = await deps.memberships.create(actor, {
      ...target,
      planCode: plan.code,
      status: "active",
      seatLimit: plan.seatAllowance,
    });
    await updateApplication(actor, application, {currentStep: "complete", status: "completed"}, deps);
    return {applicationId: application.id, next: "complete", membershipId: membership.id};
  }

  if (plan.billingBehavior === "review") {
    const membership = await deps.memberships.create(actor, {
      ...target,
      planCode: plan.code,
      status: "pending_review",
      seatLimit: plan.seatAllowance,
    });
    await updateApplication(actor, application, {currentStep: "review", status: "pending_review"}, deps);
    return {applicationId: application.id, next: "review", membershipId: membership.id};
  }

  const membership = await deps.memberships.create(actor, {
    ...target,
    planCode: plan.code,
    status: "pending_payment",
    seatLimit: plan.seatAllowance,
  });
  await updateApplication(actor, application, {currentStep: "checkout", status: "pending_payment"}, deps);

  return {
    applicationId: application.id,
    next: "checkout",
    membershipId: membership.id,
    checkout: {
      kind: "membership_checkout",
      applicationId: application.id,
      membershipId: membership.id,
      planCode: plan.code as Exclude<PlanCode, "community" | "patron">,
    },
  };
}

// Keep the profile/company types discoverable from the onboarding boundary for
// typed Server Actions in the following task.
export type {CompanyInput, CompleteApplicationInput, JoinInput, ProfileInput};
