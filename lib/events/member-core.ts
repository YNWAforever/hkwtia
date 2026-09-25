import "server-only";

import {eventsRepository} from "@/lib/db/repos/events";
import type {MembershipPlanCode, MembershipStatus} from "@/lib/membership/constants";
import {entitlementsFor, isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";
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
  events: Pick<typeof eventsRepository, "saveMemberDraft" | "submitMember" | "countCompanySubmissionsThisQuarter" | "listForCompany" | "getForMemberEdit">;
  dashboard: (actor: Actor) => Promise<Readonly<{
    companies: readonly Readonly<{id: string; canManage: boolean; displayName: string}>[];
    memberships: readonly Readonly<{planCode: string; status: MembershipStatus; companyId: string | null}>[];
  }>>;
}>;

const defaultDependencies: MemberEventsDependencies = {events: eventsRepository, dashboard: getDashboard};

export type MemberEventsContext = Readonly<{
  companyId: string; companyName: string; plan: MembershipPlanCode; usedThisQuarter: number; limit: number; canPublish: boolean;
}>;

export type MemberEventsContextOptions = Readonly<{
  /** An event being re-submitted already holds its quota slot, so it must not be counted against itself. */
  excludeEventId?: string;
  /** Select the event owner rather than the first company on an edit. */
  companyId?: string;
}>;

/** An eligible managed company, its plan, and the quota already used this quarter (S-4). */
export async function loadMemberEventsContext(actor: Actor, deps: MemberEventsDependencies = defaultDependencies, options: MemberEventsContextOptions = {}): Promise<MemberEventsContext> {
  requireMember(actor);
  const dashboard = await deps.dashboard(actor);
  const managed = dashboard.companies.filter((entry) => entry.canManage && (options.companyId === undefined || entry.id === options.companyId));
  if (managed.length === 0) throw new Error(options.companyId === undefined ? "NO_MANAGED_COMPANY" : "FORBIDDEN");
  // Prefer a company that can publish now. A pending, Community, or full
  // first company must not hide a later company with a free event slot.
  // On edits, companyId pins the search to the event's verified owner.
  let fallback: MemberEventsContext | null = null;
  for (const company of managed) {
    const membership = dashboard.memberships.find((entry) => entry.companyId === company.id && isBenefitEligibleMembershipStatus(entry.status));
    if (!membership) continue;
    // `entitlementsFor` rejects unknown plan codes; the cast cannot grant a
    // fabricated code the unlimited quota.
    const plan = membership.planCode as MembershipPlanCode;
    const limit = entitlementsFor(plan).publishEventsPerQuarter;
    const usedThisQuarter = await deps.events.countCompanySubmissionsThisQuarter(
      actor, company.id, options.excludeEventId === undefined ? undefined : {excludeEventId: options.excludeEventId},
    );
    const context = {companyId: company.id, companyName: company.displayName, plan, usedThisQuarter, limit, canPublish: limit > 0 && usedThisQuarter < limit};
    if (context.canPublish) return context;
    if (!fallback || (fallback.limit === 0 && context.limit > 0)) fallback = context;
  }
  if (fallback) return fallback;
  throw new Error("NO_MEMBERSHIP_FOR_COMPANY");
}

export type SaveMemberEventOptions = Readonly<{eventId?: string; companyId?: string}>;

/**
 * A draft never consumes quota; a submission is checked against the plan by
 * the repository (D-5). `options.eventId` turns the write into an id-keyed
 * update of a row the company already owns; without it a new row is inserted.
 */
export async function saveMemberEvent(actor: Actor, mode: "draft" | "submit", input: unknown, options: SaveMemberEventOptions = {}, deps: MemberEventsDependencies = defaultDependencies) {
  // Re-submitting a `pending_review` row must not count that row against its own
  // quota: a Startup with two pending events could otherwise never re-submit an edit.
  const ownedEvent = options.eventId === undefined ? null : await deps.events.getForMemberEdit(actor, options.eventId);
  if (options.eventId !== undefined && !ownedEvent?.organiser_company_id) throw new Error("FORBIDDEN");
  if (ownedEvent?.organiser_company_id && options.companyId && ownedEvent.organiser_company_id !== options.companyId) throw new Error("FORBIDDEN");
  const companyId = ownedEvent?.organiser_company_id ?? options.companyId;
  if (!companyId) throw new Error("FORBIDDEN");
  const context = await loadMemberEventsContext(actor, deps, {
    companyId,
    excludeEventId: mode === "submit" ? options.eventId : undefined,
  });
  if (mode === "draft") return deps.events.saveMemberDraft(actor, context.companyId, input, undefined, options.eventId);
  return deps.events.submitMember(actor, context.companyId, input, undefined, options.eventId);
}

export async function listMyCompanyEvents(actor: Actor, deps: MemberEventsDependencies = defaultDependencies) {
  const context = await loadMemberEventsContext(actor, deps);
  const dashboard = await deps.dashboard(actor);
  const companyIds = dashboard.companies
    .filter((company) => company.canManage && dashboard.memberships.some((membership) =>
      membership.companyId === company.id && isBenefitEligibleMembershipStatus(membership.status),
    ))
    .map((company) => company.id);
  const events = (await Promise.all(companyIds.map((companyId) => deps.events.listForCompany(actor, companyId)))).flat();
  return {context, events};
}
