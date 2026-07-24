import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {companiesRepository} from "@/lib/db/repos/companies";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";
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
  applicationId?: string | null;
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
  setCompany?: (actor: Actor, applicationId: string, companyId: string) => Promise<JoinApplication | null>;
};

type ProfileRepository = {
  ensure: (actor: Actor, input: {id: string; displayName: string; locale?: string; onboardingState?: string}) => Promise<unknown>;
};

type CompanyRepository = {
  getById: (actor: Actor, companyId: string) => Promise<unknown | null>;
};

type MembershipRepository = {
  getByApplicationId?: (actor: Actor, applicationId: string) => Promise<JoinMembership | null>;
  create: (actor: Actor, input: Record<string, unknown>) => Promise<JoinMembership>;
};

export type JoinDependencies = {
  applications?: ApplicationRepository;
  profiles?: ProfileRepository;
  companies?: CompanyRepository;
  memberships?: MembershipRepository;
  repositories?: {
    applications?: ApplicationRepository;
    profiles?: ProfileRepository;
    companies?: CompanyRepository;
    memberships?: MembershipRepository;
  };
  idFactory?: () => string;
  readonly [key: string]: unknown;
};

const defaultDependencies: Required<Pick<JoinDependencies, "applications" | "profiles" | "companies" | "memberships">> = {
  applications: applicationsRepository as unknown as ApplicationRepository,
  profiles: profilesRepository as unknown as ProfileRepository,
  companies: companiesRepository as unknown as CompanyRepository,
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

function requireMember(actor: Actor): asserts actor is Extract<Actor, {kind: "member"}> {
  if (actor.kind !== "member") throw new Error("UNAUTHORIZED");
}

function dependencies(input?: JoinDependencies) {
  const custom = Boolean(input);
  return {
    applications: input?.applications ?? input?.repositories?.applications ?? defaultDependencies.applications,
    profiles: custom ? input?.profiles ?? input?.repositories?.profiles : defaultDependencies.profiles,
    companies: custom ? input?.companies ?? input?.repositories?.companies : defaultDependencies.companies,
    memberships: input?.memberships ?? input?.repositories?.memberships ?? defaultDependencies.memberships,
  };
}

async function ensureProfile(
  actor: Extract<Actor, {kind: "member"}>,
  profile: ProfileInput,
  deps: ReturnType<typeof dependencies>,
) {
  if (!deps.profiles) return;
  await deps.profiles.ensure(actor, {
    id: actor.profileId,
    displayName: profile.displayName,
    ...(profile.locale ? {locale: profile.locale} : {}),
    onboardingState: "profile",
  });
}

async function validateCompanyTarget(
  actor: Extract<Actor, {kind: "member"}>,
  planCode: PlanCode,
  company: CompanyInput | null,
  deps: ReturnType<typeof dependencies>,
): Promise<string | null> {
  const plan = getPlan(planCode);
  const companyPlan = plan.audience === "startup" || plan.audience === "corporate";
  if (companyPlan && !company?.id) throw new Error("COMPANY_REQUIRED");
  if (!companyPlan && company) throw new Error("COMPANY_NOT_ALLOWED");
  if (!company?.id) return null;

  if (!deps.companies) return company.id;
  const target = await deps.companies.getById(actor, company.id);
  if (!target) throw new Error("COMPANY_NOT_FOUND");
  return company.id;
}

async function loadOrCreateApplication(
  actor: Extract<Actor, {kind: "member"}>,
  input: CompleteApplicationInput,
  companyId: string | null,
  deps: ReturnType<typeof dependencies>,
): Promise<JoinApplication> {
  if (input.applicationId) {
    const existing = await deps.applications.getById(actor, input.applicationId);
    if (!existing) throw new Error("APPLICATION_NOT_FOUND");
    if (existing.planCode !== input.plan) throw new Error("APPLICATION_PLAN_MISMATCH");
    if (companyId && existing.companyId && existing.companyId !== companyId) throw new Error("APPLICATION_COMPANY_MISMATCH");
    if (companyId && !existing.companyId) {
      if (!deps.applications.setCompany) throw new Error("APPLICATION_COMPANY_PERSISTENCE_UNAVAILABLE");
      return (await deps.applications.setCompany(actor, existing.id, companyId)) ?? {...existing, companyId};
    }
    return existing;
  }

  return deps.applications.create(actor, {
    planCode: input.plan,
    ...(companyId ? {companyId} : {}),
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

function resultForMembership(application: JoinApplication, membership: JoinMembership): CompleteApplicationResult {
  if (membership.status === "active") {
    return {applicationId: application.id, next: "complete", membershipId: membership.id};
  }
  if (membership.status === "pending_review") {
    return {applicationId: application.id, next: "review", membershipId: membership.id};
  }
  return {
    applicationId: application.id,
    next: "checkout",
    membershipId: membership.id,
    checkout: {
      kind: "membership_checkout",
      applicationId: application.id,
      membershipId: membership.id,
      planCode: membership.planCode as Exclude<PlanCode, "community" | "patron">,
    },
  };
}

async function findMembership(
  actor: Extract<Actor, {kind: "member"}>,
  applicationId: string,
  deps: ReturnType<typeof dependencies>,
) {
  return deps.memberships.getByApplicationId?.(actor, applicationId) ?? null;
}

async function createMembershipOnce(
  actor: Extract<Actor, {kind: "member"}>,
  applicationId: string,
  input: Record<string, unknown>,
  deps: ReturnType<typeof dependencies>,
): Promise<JoinMembership> {
  try {
    return await deps.memberships.create(actor, {...input, applicationId});
  } catch (error) {
    const existing = await findMembership(actor, applicationId, deps);
    if (existing) return existing;
    throw error;
  }
}

/** Complete join steps without importing or calling Stripe. */
export async function completeApplication(
  actor: Actor,
  rawInput: CompleteApplicationInput | Record<string, unknown>,
  inputDependencies?: JoinDependencies,
): Promise<CompleteApplicationResult> {
  requireMember(actor);
  const input = completeApplicationSchema.parse(rawInput);
  const deps = dependencies(inputDependencies);
  const plan = getPlan(input.plan);
  await ensureProfile(actor, input.profile, deps);
  const companyId = await validateCompanyTarget(actor, plan.code, input.company, deps);
  const application = await loadOrCreateApplication(actor, input, companyId, deps);
  const existingMembership = await findMembership(actor, application.id, deps);
  if (existingMembership) {
    const result = resultForMembership(application, existingMembership);
    const status = existingMembership.status === "active" ? "completed" : existingMembership.status;
    const currentStep = result.next;
    await updateApplication(actor, application, {currentStep, status}, deps);
    return result;
  }

  if (application.status === "completed") return {applicationId: application.id, next: "complete"};
  if (application.status === "pending_review") return {applicationId: application.id, next: "review"};
  if (application.status === "pending_payment") return {applicationId: application.id, next: "checkout"};

  const target = companyId ? {ownerUserId: null, companyId} : {ownerUserId: actor.profileId, companyId: null};
  const membershipStatus = plan.billingBehavior === "free" ? "active" : plan.billingBehavior === "review" ? "pending_review" : "pending_payment";
  const membership = await createMembershipOnce(actor, application.id, {
    ...target,
    planCode: plan.code,
    status: membershipStatus,
    seatLimit: plan.seatAllowance,
  }, deps);
  const result = resultForMembership(application, membership);
  await updateApplication(actor, application, {
    currentStep: result.next,
    status: membership.status === "active" ? "completed" : membership.status,
  }, deps);
  return result;
}

export type {CompanyInput, CompleteApplicationInput, JoinInput, ProfileInput};
