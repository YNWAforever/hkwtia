"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import type {Actor} from "@/lib/membership/lifecycle";
import {companiesRepository} from "@/lib/db/repos/companies";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {profilesRepository} from "@/lib/db/repos/profiles";
import {forbidden, requireMember} from "@/lib/db/repos/common";
import {isPortalMembershipStatus, type PortalQueryDependencies} from "@/lib/portal/queries";

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  locale: z.enum(["en", "zh-HK"]).optional(),
  directoryVisible: z.boolean().optional(),
});

const companyUpdateSchema = z.object({
  companyId: z.string().trim().min(1).max(100),
  legalName: z.string().trim().min(1).max(240).optional(),
  displayName: z.string().trim().min(1).max(240).optional(),
  website: z.string().trim().max(500).nullable().optional(),
  industry: z.string().trim().max(160).nullable().optional(),
  sizeBand: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  directoryVisible: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;
export type PortalActionState = Readonly<{ok: boolean; message?: string}>;

type ProfileWriter = Pick<typeof profilesRepository, "update">;
type CompanyWriter = Pick<typeof companiesRepository, "getById" | "update">;
type MembershipReader = Pick<typeof membershipsRepository, "list">;

export type PortalCommandDependencies = Readonly<{
  profiles: ProfileWriter;
  companies: CompanyWriter;
  memberships: MembershipReader;
}>;

const defaultDependencies: PortalCommandDependencies = {
  profiles: profilesRepository,
  companies: companiesRepository,
  memberships: membershipsRepository,
};

function dependencies(input?: Partial<PortalCommandDependencies>): PortalCommandDependencies {
  return {...defaultDependencies, ...input};
}

async function requireRecoverableMembership(
  actor: Extract<Actor, {kind: "member"}>,
  deps: PortalCommandDependencies,
  companyId?: string,
) {
  const memberships = (await deps.memberships.list(actor)).filter((membership) => isPortalMembershipStatus(membership.status));
  if (memberships.length === 0) throw new Error("MEMBERSHIP_INACTIVE");
  if (companyId && !memberships.some((membership) => membership.companyId === companyId)) forbidden();
}

/** Update the authenticated user's own profile; no target user ID is accepted. */
export async function updateProfile(
  actor: Actor,
  rawInput: ProfileUpdateInput,
  inputDependencies?: Partial<PortalCommandDependencies>,
) {
  requireMember(actor);
  const input = profileUpdateSchema.parse(rawInput);
  const deps = dependencies(inputDependencies);
  await requireRecoverableMembership(actor, deps);
  const result = await deps.profiles.update(actor, actor.userId, {
    ...input,
    // Profile completion is derived by the portal from this explicit state;
    // callers cannot set an arbitrary onboarding percentage.
    onboardingState: "complete",
  });
  if (!result) throw new Error("PROFILE_NOT_FOUND");
  return result;
}

/** Update company data; the repository performs the DB-backed owner/admin check. */
export async function updateCompany(
  actor: Actor,
  rawInput: CompanyUpdateInput,
  inputDependencies?: Partial<PortalCommandDependencies>,
) {
  requireMember(actor);
  const input = companyUpdateSchema.parse(rawInput);
  const deps = dependencies(inputDependencies);
  await requireRecoverableMembership(actor, deps, input.companyId);
  // Read through the actor-scoped repository before mutating so a revoked or
  // cross-company actor cannot turn an update into an existence oracle.
  const company = await deps.companies.getById(actor, input.companyId);
  if (!company) forbidden();
  const {companyId, ...changes} = input;
  return deps.companies.update(actor, companyId, changes);
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  await updateProfile(actor, {
    displayName: String(formData.get("displayName") ?? ""),
    phone: String(formData.get("phone") ?? "").trim() || null,
    jobTitle: String(formData.get("jobTitle") ?? "").trim() || null,
    locale: String(formData.get("locale") ?? "en") as "en" | "zh-HK",
    directoryVisible: formData.get("directoryVisible") === "on",
  });
  revalidatePath("/portal");

}

export async function updateCompanyAction(formData: FormData): Promise<void> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  await updateCompany(actor, {
    companyId: String(formData.get("companyId") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    website: String(formData.get("website") ?? "").trim() || null,
    industry: String(formData.get("industry") ?? "").trim() || null,
    sizeBand: String(formData.get("sizeBand") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    directoryVisible: formData.get("directoryVisible") === "on",
  });
  revalidatePath("/portal");
  revalidatePath("/portal/company");

}

void (null as unknown as PortalQueryDependencies);
