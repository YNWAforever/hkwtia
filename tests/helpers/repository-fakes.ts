import type {Actor} from "@/lib/membership/lifecycle";
import {AuthorizationError} from "@/lib/db/repos/common";

type FakeProfile = {
  id: string;
  displayName: string;
  phone: string | null;
  jobTitle: string | null;
  locale: string;
  onboardingState: string;
  directoryVisible: boolean;
};
type FakeCompany = {id: string; legalName: string; displayName: string; directoryVisible: boolean};
type FakeMembership = {
  id: string;
  ownerUserId: string | null;
  companyId: string | null;
  applicationId: string | null;
  planCode: "community" | "startup" | "corporate" | "patron";
  status: "pending_payment" | "pending_review" | "active" | "past_due" | "cancel_at_period_end" | "cancelled" | "expired";
  seatLimit: number;
};
type FakeApplication = {id: string; applicantUserId: string; companyId: string | null; currentStep: "profile" | "company" | "checkout" | "complete" | "review"; planCode: FakeMembership["planCode"]; status: "draft" | "pending_payment" | "pending_review" | "completed" | "abandoned"};
type FakeCompanyMember = {id: string; companyId: string; userId: string; role: "owner" | "admin" | "member"; revokedAt: string | null};
type FakeJob = {id: string; runKey: string; kind: string; state: "processing" | "completed" | "failed"; attemptCount: number; lastError: string | null};

export type FakeRepositorySeed = {
  profiles?: Partial<FakeProfile>[];
  companies?: Partial<FakeCompany>[];
  memberships?: Partial<FakeMembership>[];
  applications?: Partial<FakeApplication>[];
  companyMembers?: FakeCompanyMember[];
};

function deny(): never {
  throw new AuthorizationError();
}

function hasTenantTarget(input: object): boolean {
  return Object.prototype.hasOwnProperty.call(input, "ownerUserId") || Object.prototype.hasOwnProperty.call(input, "companyId") || Object.prototype.hasOwnProperty.call(input, "applicationId");
}

export function createFakeRepositories(seed: FakeRepositorySeed = {}) {
  const profiles: FakeProfile[] = (seed.profiles ?? [
    {id: "user-a", displayName: "User A", phone: null, jobTitle: null, locale: "en", onboardingState: "profile", directoryVisible: false},
    {id: "user-b", displayName: "User B", phone: null, jobTitle: null, locale: "en", onboardingState: "profile", directoryVisible: false},
  ]).map((profile) => ({
    id: profile.id ?? "user-a",
    displayName: profile.displayName ?? "User",
    phone: profile.phone ?? null,
    jobTitle: profile.jobTitle ?? null,
    locale: profile.locale ?? "en",
    onboardingState: profile.onboardingState ?? "profile",
    directoryVisible: profile.directoryVisible ?? false,
  }));
  const companies: FakeCompany[] = (seed.companies ?? [
    {id: "company-a", legalName: "Company A", displayName: "Company A", directoryVisible: false},
    {id: "company-b", legalName: "Company B", displayName: "Company B", directoryVisible: false},
  ]).map((company, index) => ({
    id: company.id ?? `company-${index + 1}`,
    legalName: company.legalName ?? "Company",
    displayName: company.displayName ?? "Company",
    directoryVisible: company.directoryVisible ?? false,
  }));
  const memberships: FakeMembership[] = (seed.memberships ?? []).map((membership, index) => ({
    id: membership.id ?? `membership-${index + 1}`,
    ownerUserId: membership.ownerUserId ?? null,
    companyId: membership.companyId ?? null,
    applicationId: membership.applicationId ?? null,
    planCode: membership.planCode ?? "corporate",
    status: membership.status ?? "pending_payment",
    seatLimit: membership.seatLimit ?? 0,
  }));
  const applications: FakeApplication[] = (seed.applications ?? [
    {id: "application-a", applicantUserId: "user-a", companyId: "company-a", planCode: "corporate", currentStep: "profile", status: "draft"},
  ]).map((application, index) => ({
    id: application.id ?? `application-${index + 1}`,
    applicantUserId: application.applicantUserId ?? "user-a",
    companyId: application.companyId ?? null,
    currentStep: application.currentStep ?? "profile",
    planCode: application.planCode ?? "corporate",
    status: application.status ?? "draft",
  }));
  const companyMembers = [...(seed.companyMembers ?? [])];
  const jobs: FakeJob[] = [];

  const isCompanyMember = (actor: Actor, companyId: string | null) =>
    actor.kind === "system" ||
    (actor.kind === "member" && companyId !== null && companyMembers.some((member) => member.companyId === companyId && member.userId === actor.userId && member.revokedAt === null));
  const canReadMembership = (actor: Actor, membership: FakeMembership) =>
    actor.kind === "system" ||
    (actor.kind === "member" && (membership.ownerUserId === actor.userId || isCompanyMember(actor, membership.companyId)));
  const canReadApplication = (actor: Actor, application: FakeApplication) =>
    actor.kind === "system" || (actor.kind === "member" && (application.applicantUserId === actor.userId || isCompanyMember(actor, application.companyId)));

  return {
    profiles: {
      async ensure(actor: Actor, input: Pick<FakeProfile, "id" | "displayName"> & Partial<Pick<FakeProfile, "locale" | "onboardingState">>) {
        if (actor.kind !== "member" || actor.userId !== input.id) deny();
        const current = profiles.find((profile) => profile.id === input.id);
        if (current) {
          Object.assign(current, input);
          return current;
        }
        const created: FakeProfile = {id: input.id, displayName: input.displayName, phone: null, jobTitle: null, locale: input.locale ?? "en", onboardingState: input.onboardingState ?? "profile", directoryVisible: false};
        profiles.push(created);
        return created;
      },      async getById(actor: Actor, userId: string) {
        if (actor.kind === "member" && actor.userId !== userId) deny();
        if (actor.kind === "anonymous") return profiles.find((profile) => profile.id === userId && profile.directoryVisible) ?? null;
        return profiles.find((profile) => profile.id === userId) ?? null;
      },
      async update(actor: Actor, userId: string, input: Partial<FakeProfile>) {
        if (actor.kind !== "member" || actor.userId !== userId) deny();
        const profile = profiles.find((candidate) => candidate.id === userId);
        if (!profile) return null;
        Object.assign(profile, input);
        return profile;
      },
    },
    companies: {
      async getById(actor: Actor, companyId: string) {
        const company = companies.find((candidate) => candidate.id === companyId);
        if (!company) return null;
        if (actor.kind === "anonymous" && !company.directoryVisible) deny();
        if (actor.kind === "member" && !isCompanyMember(actor, companyId)) deny();
        return company;
      },
      async remove(actor: Actor, companyId: string) {
        if (actor.kind !== "system" && (actor.kind !== "member" || !isCompanyMember(actor, companyId))) deny();
        const index = companies.findIndex((company) => company.id === companyId);
        if (index >= 0) companies.splice(index, 1);
      },
    },
    memberships: {
      async create(actor: Actor, input: Partial<FakeMembership> & Pick<FakeMembership, "planCode" | "seatLimit">) {
        if (actor.kind !== "member") deny();
        if (input.ownerUserId !== actor.userId && input.companyId !== null && !isCompanyMember(actor, input.companyId ?? null)) deny();
        const membership: FakeMembership = {id: `membership-${memberships.length + 1}`, ownerUserId: input.ownerUserId ?? null, companyId: input.companyId ?? null, applicationId: input.applicationId ?? null, planCode: input.planCode, status: input.status ?? "pending_payment", seatLimit: input.seatLimit};
        if (membership.applicationId && memberships.some((candidate) => candidate.applicationId === membership.applicationId)) throw new Error("UNIQUE_APPLICATION_MEMBERSHIP");
        memberships.push(membership);
        return membership;
      },      async getByApplicationId(actor: Actor, applicationId: string) {
        const membership = memberships.find((candidate) => candidate.applicationId === applicationId);
        if (!membership) return null;
        if (!canReadMembership(actor, membership)) deny();
        return membership;
      },      async getById(actor: Actor, membershipId: string) {
        const membership = memberships.find((candidate) => candidate.id === membershipId);
        if (!membership || !canReadMembership(actor, membership)) deny();
        return membership;
      },
      async list(actor: Actor) {
        return memberships.filter((membership) => canReadMembership(actor, membership));
      },
      async update(actor: Actor, membershipId: string, input: Partial<FakeMembership>) {
        if (hasTenantTarget(input)) deny();
        const membership = memberships.find((candidate) => candidate.id === membershipId);
        if (!membership || !canReadMembership(actor, membership)) deny();
        Object.assign(membership, input);
        return membership;
      },
    },
    applications: {
      async create(actor: Actor, input: Partial<FakeApplication> & Pick<FakeApplication, "planCode">) {
        if (actor.kind !== "member") deny();
        const application: FakeApplication = {id: `application-${applications.length + 1}`, applicantUserId: actor.userId, companyId: input.companyId ?? null, currentStep: input.currentStep ?? "profile", planCode: input.planCode, status: input.status ?? "draft"};
        applications.push(application);
        return application;
      },
      async setCompany(actor: Actor, applicationId: string, companyId: string) {
        if (actor.kind !== "member" || !isCompanyMember(actor, companyId)) deny();
        const application = applications.find((candidate) => candidate.id === applicationId);
        if (!application || application.applicantUserId !== actor.userId) deny();
        application.companyId = companyId;
        return application;
      },      async getById(actor: Actor, applicationId: string) {
        const application = applications.find((candidate) => candidate.id === applicationId);
        if (!application || !canReadApplication(actor, application)) deny();
        return application;
      },
      async update(actor: Actor, applicationId: string, input: Partial<FakeApplication>) {
        if (Object.prototype.hasOwnProperty.call(input, "companyId")) deny();
        const application = applications.find((candidate) => candidate.id === applicationId);
        if (!application || !canReadApplication(actor, application)) deny();
        Object.assign(application, input);
        return application;
      },
    },
    jobs: {
      async claim(actor: Actor, runKey: string, kind: string) {
        if (actor.kind !== "system" || actor.source !== "stripe-webhook") deny();
        if (jobs.some((job) => job.runKey === runKey)) return "duplicate" as const;
        jobs.push({id: `job-${jobs.length + 1}`, runKey, kind, state: "processing", attemptCount: 0, lastError: null});
        return "claimed" as const;
      },
      async getByRunKey(actor: Actor, runKey: string) {
        if (actor.kind !== "system" || actor.source !== "stripe-webhook") deny();
        return jobs.find((job) => job.runKey === runKey) ?? null;
      },
    },
  };
}