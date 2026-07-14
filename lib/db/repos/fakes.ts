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
type FakeMembership = {
  id: string;
  ownerUserId: string | null;
  companyId: string | null;
  planCode: "community" | "startup" | "corporate" | "patron";
  status: "pending_payment" | "pending_review" | "active" | "past_due" | "cancel_at_period_end" | "cancelled" | "expired";
  seatLimit: number;
};
type FakeCompanyMember = {id: string; companyId: string; userId: string; role: "owner" | "admin" | "member"; revokedAt: string | null};
type FakeJob = {id: string; runKey: string; kind: string; state: "processing" | "completed" | "failed"; attemptCount: number; lastError: string | null};

export type FakeRepositorySeed = {
  profiles?: Partial<FakeProfile>[];
  memberships?: Partial<FakeMembership>[];
  companyMembers?: FakeCompanyMember[];
};

function deny(): never {
  throw new AuthorizationError();
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
  const memberships: FakeMembership[] = (seed.memberships ?? []).map((membership, index) => ({
    id: membership.id ?? `membership-${index + 1}`,
    ownerUserId: membership.ownerUserId ?? null,
    companyId: membership.companyId ?? null,
    planCode: membership.planCode ?? "corporate",
    status: membership.status ?? "pending_payment",
    seatLimit: membership.seatLimit ?? 0,
  }));
  const companyMembers = [...(seed.companyMembers ?? [])];
  const jobs: FakeJob[] = [];

  const canReadMembership = (actor: Actor, membership: FakeMembership) =>
    actor.kind === "system" ||
    (actor.kind === "member" &&
      (membership.ownerUserId === actor.userId ||
        (membership.companyId !== null && companyMembers.some((member) => member.companyId === membership.companyId && member.userId === actor.userId && member.revokedAt === null))));

  return {
    profiles: {
      async getById(actor: Actor, userId: string) {
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
    memberships: {
      async getById(actor: Actor, membershipId: string) {
        const membership = memberships.find((candidate) => candidate.id === membershipId);
        if (!membership || !canReadMembership(actor, membership)) deny();
        return membership;
      },
      async list(actor: Actor) {
        return memberships.filter((membership) => canReadMembership(actor, membership));
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
