import "server-only";

import {and, eq, isNull} from "drizzle-orm";

import type {Actor} from "@/lib/membership/lifecycle";
import {forbidden, getDb, requireMember} from "@/lib/db/repos/common";
import {companiesRepository} from "@/lib/db/repos/companies";
import {companyMembers, type Company, type Membership, type Profile} from "@/lib/db/server-schema";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export const portalMembershipStatuses = [
  "pending_payment",
  "pending_review",
  "active",
  "past_due",
  "cancel_at_period_end",
] as const;

export type PortalMembershipStatus = (typeof portalMembershipStatuses)[number];
export type PortalCompanyRole = "owner" | "admin" | "member";

export type DashboardMembership = Omit<Pick<Membership, "id" | "ownerUserId" | "companyId" | "applicationId" | "planCode" | "status" | "seatLimit" | "cancelAtPeriodEnd" | "billingPeriodStart" | "billingPeriodEnd">, "status"> & {status: PortalMembershipStatus};

export type DashboardCompany = Pick<
  Company,
  | "id"
  | "legalName"
  | "displayName"
  | "website"
  | "industry"
  | "sizeBand"
  | "description"
  | "directoryVisible"
> & {role: PortalCompanyRole | null; canManage: boolean};

export type DashboardViewModel = Readonly<{
  profile: Pick<
    Profile,
    | "id"
    | "displayName"
    | "phone"
    | "jobTitle"
    | "locale"
    | "onboardingState"
    | "directoryVisible"
  >;
  memberships: readonly DashboardMembership[];
  companies: readonly DashboardCompany[];
  primaryStatus: PortalMembershipStatus;
  onboarding: Readonly<{
    completedSteps: number;
    totalSteps: number;
    nextAction: "complete-profile" | "complete-company" | "none";
    profileComplete: boolean;
    companyComplete: boolean;
  }>;
  privateDataAvailable: true;
}>;

type PortalProfile = Pick<Profile, "id" | "displayName" | "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible">;
export type PortalMembershipRecord = Pick<Membership, "id" | "ownerUserId" | "companyId" | "planCode" | "status" | "seatLimit"> & Partial<Pick<Membership, "applicationId" | "cancelAtPeriodEnd" | "billingPeriodStart" | "billingPeriodEnd">>;
type PortalCompanyRecord = Pick<Company, "id" | "legalName" | "displayName"> & Partial<Pick<Company, "website" | "industry" | "sizeBand" | "description" | "directoryVisible">>;
type ProfileReader = {getById: (actor: Actor, userId: string) => Promise<PortalProfile | null>};
type MembershipReader = {list: (actor: Actor) => Promise<PortalMembershipRecord[]>};
type CompanyReader = {getById: (actor: Actor, companyId: string) => Promise<PortalCompanyRecord | null>};

export type PortalQueryDependencies = Readonly<{
  profiles: ProfileReader;
  memberships: MembershipReader;
  companies: CompanyReader;
  getCompanyRole: (actor: Extract<Actor, {kind: "member"}>, companyId: string) => Promise<PortalCompanyRole | null>;
}>;

async function defaultCompanyRole(
  actor: Extract<Actor, {kind: "member"}>,
  companyId: string,
): Promise<PortalCompanyRole | null> {
  if (actor.companyRoles?.[companyId]) return actor.companyRoles[companyId];
  const db = await getDb();
  const rows = await db
    .select({role: companyMembers.role})
    .from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, companyId),
      eq(companyMembers.userId, actor.userId),
      isNull(companyMembers.revokedAt),
    ))
    .limit(1);
  return rows[0]?.role ?? null;
}

export const defaultPortalQueryDependencies: PortalQueryDependencies = {
  profiles: profilesRepository,
  memberships: membershipsRepository,
  companies: companiesRepository,
  getCompanyRole: defaultCompanyRole,
};

function dependencies(input?: Partial<PortalQueryDependencies>): PortalQueryDependencies {
  return {...defaultPortalQueryDependencies, ...input};
}

export function isPortalMembershipStatus(status: Membership["status"]): status is PortalMembershipStatus {
  return (portalMembershipStatuses as readonly string[]).includes(status);
}

function primaryMembership(memberships: readonly DashboardMembership[]): DashboardMembership {
  const rank: Record<DashboardMembership["status"], number> = {
    active: 5,
    past_due: 4,
    cancel_at_period_end: 3,
    pending_review: 2,
    pending_payment: 1,
  };
  return [...memberships].sort((a, b) => rank[b.status] - rank[a.status])[0];
}

/** Build the only safe continuation accepted by the member sign-in flow. */
export function buildPortalSignInPath(locale: AppLocale, continuation = "/portal"): string {
  if (!continuation.startsWith("/") || continuation.startsWith("//") || continuation.includes("\\") || continuation.includes("\r") || continuation.includes("\n")) {
    throw new Error("INVALID_CONTINUATION");
  }
  const parsed = new URL(continuation, "http://portal.local");
  if (parsed.origin !== "http://portal.local" || parsed.pathname !== continuation || parsed.search || parsed.hash) {
    throw new Error("INVALID_CONTINUATION");
  }
  const query = new URLSearchParams({next: continuation});
  return `${localizedPath(locale, "/join")}?${query.toString()}`;
}

/** Read the member dashboard only after an actor and a recoverable membership are verified. */
export async function getDashboard(
  actor: Actor,
  inputDependencies?: Partial<PortalQueryDependencies>,
): Promise<DashboardViewModel> {
  requireMember(actor);
  const deps = dependencies(inputDependencies);

  // Load and filter entitlement first. Cancelled/expired users must not cause
  // profile or company-private queries to run.
  const memberships = (await deps.memberships.list(actor))
    .filter((membership): membership is PortalMembershipRecord & {status: PortalMembershipStatus} => isPortalMembershipStatus(membership.status))
    .map((membership) => ({...membership, applicationId: membership.applicationId ?? null, cancelAtPeriodEnd: membership.cancelAtPeriodEnd ?? false, billingPeriodStart: membership.billingPeriodStart ?? null, billingPeriodEnd: membership.billingPeriodEnd ?? null} satisfies DashboardMembership));
  if (memberships.length === 0) throw new Error("MEMBERSHIP_INACTIVE");

  const profile = await deps.profiles.getById(actor, actor.userId);
  if (!profile) throw new Error("PROFILE_NOT_FOUND");

  const companyIds = [...new Set(memberships.flatMap((membership) => membership.companyId ? [membership.companyId] : []))];
  const companies = (await Promise.all(companyIds.map(async (companyId) => {
    const company = await deps.companies.getById(actor, companyId);
    if (!company) return null;
    const role = await deps.getCompanyRole(actor, companyId);
    return {
      id: company.id,
      legalName: company.legalName,
      displayName: company.displayName,
      website: company.website ?? null,
      industry: company.industry ?? null,
      sizeBand: company.sizeBand ?? null,
      description: company.description ?? null,
      directoryVisible: company.directoryVisible ?? false,
      role,
      canManage: role === "owner" || role === "admin",
    } satisfies DashboardCompany;
  }))).filter((company): company is DashboardCompany => Boolean(company));

  const companyComplete = memberships.filter((membership) => membership.companyId !== null).every((membership) => companies.some((company) => company.id === membership.companyId));
  const profileComplete = profile.onboardingState !== "profile";
  const nextAction = !profileComplete ? "complete-profile" : !companyComplete ? "complete-company" : "none";

  return {
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      phone: profile.phone,
      jobTitle: profile.jobTitle,
      locale: profile.locale,
      onboardingState: profile.onboardingState,
      directoryVisible: profile.directoryVisible,
    },
    memberships,
    companies,
    primaryStatus: primaryMembership(memberships).status,
    onboarding: {
      completedSteps: Number(profileComplete) + Number(companyComplete),
      totalSteps: 2,
      nextAction,
      profileComplete,
      companyComplete,
    },
    privateDataAvailable: true,
  };
}

export function requirePortalMember(actor: Actor): asserts actor is Extract<Actor, {kind: "member"}> {
  if (actor.kind !== "member") forbidden();
}
