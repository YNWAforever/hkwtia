import "server-only";

import {companyProfilesRepository, type CompanyProfileRow} from "@/lib/db/repos/company-profiles";
import type {Actor} from "@/lib/membership/lifecycle";
import {requireMember} from "@/lib/membership/lifecycle";
import {getDashboard} from "@/lib/portal/queries";

/**
 * Programme B-7: the actor-taking half of "edit and publish my member page",
 * deliberately outside `company-profile-actions.ts`. `"use server"` publishes
 * every export of its module as an HTTP endpoint, and an endpoint whose caller
 * supplies the actor performs no authorization at all — so the functions that
 * take one live here, in a plain `server-only` module
 * (`tests/unit/server-action-actor-boundary.test.ts` enforces the split).
 *
 * This layer only answers *which* company; `companyProfilesRepository` re-checks
 * the owner/admin role on every call it makes, because the repository is the
 * authorization gate (CLAUDE.md hard boundary 2). Shaped after
 * `lib/events/member-core.ts`, minus the plan and quota it has no use for: a
 * public page is not rationed by membership tier.
 */
export type MemberCompanyProfileDependencies = Readonly<{
  profiles: Pick<typeof companyProfilesRepository, "updateProfile" | "submitForReview">;
  dashboard: (actor: Actor) => Promise<Readonly<{
    companies: readonly Readonly<{id: string; canManage: boolean; displayName: string}>[];
  }>>;
}>;

const defaultDependencies: MemberCompanyProfileDependencies = {profiles: companyProfilesRepository, dashboard: getDashboard};

export type CompanyProfileContext = Readonly<{companyId: string; companyName: string}>;

/** The first company the member manages. Membership alone is not enough: only owners and admins edit the page. */
export async function loadCompanyProfileContext(
  actor: Actor,
  deps: MemberCompanyProfileDependencies = defaultDependencies,
): Promise<CompanyProfileContext> {
  requireMember(actor);
  const dashboard = await deps.dashboard(actor);
  const company = dashboard.companies.find((entry) => entry.canManage);
  if (!company) throw new Error("NO_MANAGED_COMPANY");
  return {companyId: company.id, companyName: company.displayName};
}

/** Owner/admin edit of the public page. Validation, the role re-check and the review demotion all happen in the repository. */
export async function saveCompanyProfile(
  actor: Actor,
  input: unknown,
  deps: MemberCompanyProfileDependencies = defaultDependencies,
): Promise<CompanyProfileRow> {
  const context = await loadCompanyProfileContext(actor, deps);
  return deps.profiles.updateProfile(actor, context.companyId, input);
}

/** "Publish my profile": `hidden`/`rejected` → `pending_review`. Staff decide whether it goes live (Task 4). */
export async function submitCompanyProfile(
  actor: Actor,
  deps: MemberCompanyProfileDependencies = defaultDependencies,
): Promise<CompanyProfileRow> {
  const context = await loadCompanyProfileContext(actor, deps);
  return deps.profiles.submitForReview(actor, context.companyId);
}
