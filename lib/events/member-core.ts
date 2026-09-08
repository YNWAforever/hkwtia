import "server-only";

import {eventsRepository} from "@/lib/db/repos/events";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {entitlementsFor} from "@/lib/membership/entitlements";
import type {Actor} from "@/lib/membership/lifecycle";
import {requireMember} from "@/lib/membership/lifecycle";
import {getDashboard} from "@/lib/portal/queries";

/**
 * Actor-taking cores, deliberately outside any `"use server"` module. That
 * directive publishes every export as an HTTP endpoint, and an endpoint whose
 * caller supplies the actor performs no authorization at all (see
 * `tests/unit/server-action-actor-boundary.test.ts`). The repository re-checks
 * the company role on every call; this layer only resolves which company.
 */
export type MemberEventsDependencies = Readonly<{
  events: Pick<typeof eventsRepository, "saveMemberDraft" | "submitMember" | "countCompanySubmissionsThisQuarter" | "listForCompany">;
  dashboard: (actor: Actor) => Promise<Readonly<{
    companies: readonly Readonly<{id: string; canManage: boolean; displayName: string}>[];
    memberships: readonly Readonly<{planCode: string; status: string; companyId: string | null}>[];
  }>>;
}>;

const defaultDependencies: MemberEventsDependencies = {events: eventsRepository, dashboard: getDashboard};

export type MemberEventsContext = Readonly<{
  companyId: string; companyName: string; plan: MembershipPlanCode; usedThisQuarter: number; limit: number; canPublish: boolean;
}>;

/** The first company the member manages, its plan, and the quota already used this quarter (S-4). */
export async function loadMemberEventsContext(actor: Actor, deps: MemberEventsDependencies = defaultDependencies): Promise<MemberEventsContext> {
  requireMember(actor);
  const dashboard = await deps.dashboard(actor);
  const company = dashboard.companies.find((entry) => entry.canManage);
  if (!company) throw new Error("NO_MANAGED_COMPANY");
  // The plan must be the managed company's own: falling back to another
  // company's membership (or to "community") would size the quota from the
  // wrong contract, so a company without a membership is refused outright.
  const membership = dashboard.memberships.find((entry) => entry.companyId === company.id);
  if (!membership) throw new Error("NO_MEMBERSHIP_FOR_COMPANY");
  // `entitlementsFor` throws INVALID_PLAN_CODE for anything outside the plan
  // enum, so the cast never lets an unknown code through as "unlimited".
  const plan = membership.planCode as MembershipPlanCode;
  const limit = entitlementsFor(plan).publishEventsPerQuarter;
  const usedThisQuarter = await deps.events.countCompanySubmissionsThisQuarter(actor, company.id);
  return {companyId: company.id, companyName: company.displayName, plan, usedThisQuarter, limit, canPublish: limit > 0 && usedThisQuarter < limit};
}

export type SaveMemberEventOptions = Readonly<{eventId?: string}>;

/**
 * A draft never consumes quota; a submission is checked against the plan by
 * the repository (D-5). `options.eventId` turns the write into an id-keyed
 * update of a row the company already owns; without it a new row is inserted.
 */
export async function saveMemberEvent(actor: Actor, mode: "draft" | "submit", input: unknown, options: SaveMemberEventOptions = {}, deps: MemberEventsDependencies = defaultDependencies) {
  const context = await loadMemberEventsContext(actor, deps);
  if (mode === "draft") return deps.events.saveMemberDraft(actor, context.companyId, input, undefined, options.eventId);
  return deps.events.submitMember(actor, context.companyId, input, {plan: context.plan, usedThisQuarter: context.usedThisQuarter}, options.eventId);
}

export async function listMyCompanyEvents(actor: Actor, deps: MemberEventsDependencies = defaultDependencies) {
  const context = await loadMemberEventsContext(actor, deps);
  return {context, events: await deps.events.listForCompany(actor, context.companyId)};
}
