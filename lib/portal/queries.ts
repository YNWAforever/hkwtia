import "server-only";

import {forbidden, requireMember, type Actor} from "@/lib/membership/lifecycle";
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {companiesRepository} from "@/lib/db/repos/companies";
import {type Company, type Membership, type Profile} from "@/lib/db/server-schema";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";

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
  // Programme B-7: the public member page's own copy, so `/portal/company` can
  // render the profile form's defaults from the dashboard it already loads
  // rather than making a second company read.
  | "slug"
  | "tags"
  | "taglineEn"
  | "taglineZhHk"
  | "descriptionZhHk"
  | "logoMediaId"
  | "publicProfileStatus"
  | "profileRejectionReason"
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
    | "whatsappNumber"
    | "whatsappOptIn"
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

type PortalProfile = Pick<Profile, "id" | "displayName" | "phone" | "jobTitle" | "locale" | "onboardingState" | "directoryVisible" | "whatsappNumber" | "whatsappOptIn">;
export type PortalMembershipRecord = Pick<Membership, "id" | "ownerUserId" | "companyId" | "planCode" | "status" | "seatLimit"> & Partial<Pick<Membership, "applicationId" | "cancelAtPeriodEnd" | "billingPeriodStart" | "billingPeriodEnd">>;
// Everything past the three required keys stays optional: the reader is a
// repository that returns whole rows, and the test fakes build the minimum.
type PortalCompanyRecord = Pick<Company, "id" | "legalName" | "displayName"> & Partial<Pick<Company, "website" | "industry" | "sizeBand" | "description" | "directoryVisible" | "slug" | "tags" | "taglineEn" | "taglineZhHk" | "descriptionZhHk" | "logoMediaId" | "publicProfileStatus" | "profileRejectionReason">>;
type ProfileReader = {getById: (actor: Actor, userId: string) => Promise<PortalProfile | null>};
type MembershipReader = {list: (actor: Actor) => Promise<PortalMembershipRecord[]>};
type CompanyReader = {getById: (actor: Actor, companyId: string) => Promise<PortalCompanyRecord | null>};

export type PortalQueryDependencies = Readonly<{
  profiles: ProfileReader;
  memberships: MembershipReader;
  companies: CompanyReader;
  getCompanyRole: (actor: Extract<Actor, {kind: "member"}>, companyId: string) => Promise<PortalCompanyRole | null>;
}>;

export const defaultPortalQueryDependencies: PortalQueryDependencies = {
  profiles: profilesRepository,
  memberships: membershipsRepository,
  companies: companiesRepository,
  getCompanyRole: portalContentRepository.getCompanyRole,
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

  const profile = await deps.profiles.getById(actor, actor.profileId);
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
      slug: company.slug ?? null,
      tags: company.tags ?? [],
      taglineEn: company.taglineEn ?? null,
      taglineZhHk: company.taglineZhHk ?? null,
      descriptionZhHk: company.descriptionZhHk ?? null,
      logoMediaId: company.logoMediaId ?? null,
      // A row that predates 0028 (or a fake that omits the column) is not
      // published; defaulting the other way would put unreviewed copy on /members.
      publicProfileStatus: company.publicProfileStatus ?? "hidden",
      profileRejectionReason: company.profileRejectionReason ?? null,
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
      whatsappNumber: profile.whatsappNumber,
      whatsappOptIn: profile.whatsappOptIn,
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

export {getDocuments, getMemberEvents, searchDirectory} from './content';
export type {DirectoryPage, DirectoryQuery, DirectoryRecord, DocumentItem, PortalContentDependencies} from './content';
