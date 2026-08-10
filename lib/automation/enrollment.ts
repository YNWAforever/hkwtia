import "server-only";

import {systemActor} from "@/lib/auth/authorize";
import {scheduleJourney} from "@/lib/automation/schedule";
import type {JourneyName, ScheduledJourneyStep} from "@/lib/automation/types";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {auditEventsRepository} from "@/lib/db/repos/audit-events";
import {
  journeysRepository,
  type JourneyEnrollment,
  type JourneyEnrollmentDisposition,
} from "@/lib/db/repos/journeys";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {
  renewalEnrollmentsRepository,
  type RenewalEnrollmentCandidate,
} from "@/lib/db/repos/renewal-enrollments";
import type {AutomationRepositoryActor} from "@/lib/auth/automation-actor";
import type {Actor, MembershipStatus} from "@/lib/membership/lifecycle";

export type LifecycleMembership = Readonly<{
  id: string;
  ownerUserId: string | null;
  companyId: string | null;
  applicationId: string | null;
  planCode: string;
  status: MembershipStatus;
  billingPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type LifecycleApplication = Readonly<{
  id: string;
  applicantUserId: string;
}>;

type LifecycleAudit = Readonly<{
  action: string;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}>;

type MembershipsReader = Readonly<{
  list: (actor: Actor) => Promise<readonly LifecycleMembership[]>;
}>;

type ApplicationsReader = Readonly<{
  list: (actor: Actor) => Promise<readonly LifecycleApplication[]>;
}>;

type AuditEventsReader = Readonly<{
  listForTarget: (actor: Actor, targetType: string, targetId: string) => Promise<readonly LifecycleAudit[]>;
}>;

type JourneyEnroller = Readonly<{
  enroll: (actor: AutomationRepositoryActor, enrollment: JourneyEnrollment) => Promise<JourneyEnrollmentDisposition>;
}>;

export type LifecycleEnrollmentDependencies = Readonly<{
  memberships: MembershipsReader;
  applications: ApplicationsReader;
  auditEvents: AuditEventsReader;
  journeys: JourneyEnroller;
}>;

type RenewalEnrollmentsReader = Readonly<{
  listDue: (actor: AutomationRepositoryActor) => Promise<readonly RenewalEnrollmentCandidate[]>;
}>;

export type RenewalEnrollmentDependencies = Readonly<{
  renewals: RenewalEnrollmentsReader;
  journeys: JourneyEnroller;
}>;

export type LifecycleEnrollmentErrorCode =
  | "MISSING_LIFECYCLE_AUDIT"
  | "MISSING_BILLING_PERIOD_END"
  | "MISSING_PROFILE";

export type JobSummary = Readonly<{
  scanned: number;
  createdSteps: number;
  existingSteps: number;
  skipped: number;
  errors: Readonly<Partial<Record<LifecycleEnrollmentErrorCode, number>>>;
}>;

export type WebhookLifecycleEnrollmentInput = Readonly<{
  membershipId: string;
  profileId: string;
  nextStatus: MembershipStatus;
  eventId: string;
  eventCreated: number;
}>;

const defaultLifecycleDependencies: LifecycleEnrollmentDependencies = {
  memberships: membershipsRepository,
  applications: applicationsRepository,
  auditEvents: auditEventsRepository,
  journeys: journeysRepository,
};

const defaultRenewalDependencies: RenewalEnrollmentDependencies = {
  renewals: renewalEnrollmentsRepository,
  journeys: journeysRepository,
};

type MutableSummary = {
  scanned: number;
  createdSteps: number;
  existingSteps: number;
  skipped: number;
  errors: Partial<Record<LifecycleEnrollmentErrorCode, number>>;
};

function validDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function recordError(summary: MutableSummary, code: LifecycleEnrollmentErrorCode): void {
  summary.skipped += 1;
  summary.errors[code] = (summary.errors[code] ?? 0) + 1;
}

function profileMap(applications: readonly LifecycleApplication[]): ReadonlyMap<string, string> {
  return new Map(applications.map((application) => [application.id, application.applicantUserId]));
}

function profileFor(
  membership: LifecycleMembership,
  applicants: ReadonlyMap<string, string>,
): string | null {
  if (membership.ownerUserId) return membership.ownerUserId;
  return membership.applicationId ? applicants.get(membership.applicationId) ?? null : null;
}

async function enrollSteps(
  actor: AutomationRepositoryActor,
  scheduled: readonly ScheduledJourneyStep[],
  journeys: JourneyEnroller,
  summary: MutableSummary,
): Promise<void> {
  for (const step of scheduled) {
    const disposition = await journeys.enroll(actor, step);
    if (disposition === "created") summary.createdSteps += 1;
    else summary.existingSteps += 1;
  }
}

function eventAnchor(eventCreated: number): Date | null {
  if (!Number.isSafeInteger(eventCreated) || eventCreated < 0) return null;
  const anchor = new Date(eventCreated * 1000);
  return validDate(anchor) ? anchor : null;
}

export function scheduleWebhookLifecycleEnrollment(
  input: WebhookLifecycleEnrollmentInput,
): readonly ScheduledJourneyStep[] {
  const anchor = eventAnchor(input.eventCreated);
  if (!anchor) return [];
  let journey: JourneyName;
  let instanceKey: string;
  switch (input.nextStatus) {
    case "active":
      journey = "onboarding_90d";
      instanceKey = `activation:${input.membershipId}`;
      break;
    case "past_due":
      journey = "dunning";
      instanceKey = `payment:${input.eventId}`;
      break;
    case "cancelled":
    case "expired":
      journey = "winback";
      instanceKey = `termination:${input.eventId}`;
      break;
    default:
      return [];
  }
  return scheduleJourney({
    journey,
    profileId: input.profileId,
    membershipId: input.membershipId,
    instanceKey,
    anchor,
  });
}

const terminalAuditStatuses = new Set(["cancelled", "canceled", "expired", "lapsed"]);

function auditMatchesStatus(status: MembershipStatus, auditStatus: unknown): boolean {
  if (typeof auditStatus !== "string") return false;
  if (status === "cancelled" || status === "expired") {
    return terminalAuditStatuses.has(auditStatus);
  }
  return auditStatus === status;
}

function auditCreated(audit: LifecycleAudit): number | null {
  const stripeCreated = audit.metadata?.stripeCreated;
  if (
    typeof stripeCreated !== "number"
    || !Number.isSafeInteger(stripeCreated)
    || stripeCreated <= 0
  ) {
    return null;
  }
  return validDate(new Date(stripeCreated * 1000)) ? stripeCreated : null;
}

function latestLifecycleAudit(
  audits: readonly LifecycleAudit[],
  status: MembershipStatus,
): {eventId: string; eventCreated: number} | null {
  return audits
    .flatMap((audit) => {
      const eventCreated = auditCreated(audit);
      if (
        audit.action !== "stripe.webhook.processed"
        || !auditMatchesStatus(status, audit.metadata?.status)
        || typeof audit.requestId !== "string"
        || audit.requestId.length === 0
        || eventCreated === null
      ) {
        return [];
      }
      return [{eventId: audit.requestId, eventCreated}];
    })
    .sort((left, right) =>
      right.eventCreated - left.eventCreated || right.eventId.localeCompare(left.eventId),
    )[0] ?? null;
}

export async function enrollActivatedMembership(
  profileId: string,
  membershipId: string,
  anchor: Date,
  journeys: JourneyEnroller = journeysRepository,
): Promise<JobSummary> {
  const summary: MutableSummary = {scanned: 1, createdSteps: 0, existingSteps: 0, skipped: 0, errors: {}};
  const actor = systemActor("stripe-webhook");
  const scheduled = scheduleJourney({
    journey: "onboarding_90d",
    profileId,
    membershipId,
    instanceKey: `activation:${membershipId}`,
    anchor,
  });
  await enrollSteps(actor, scheduled, journeys, summary);
  return summary;
}

export async function reconcileLifecycleEnrollments(
  actor: Actor,
  now: Date,
  dependencies: LifecycleEnrollmentDependencies = defaultLifecycleDependencies,
): Promise<JobSummary> {
  if (actor.kind !== "system") throw new Error("FORBIDDEN");
  if (!validDate(now)) throw new Error("INVALID_RECONCILIATION_TIME");
  const allMemberships = await dependencies.memberships.list(actor);
  const memberships = allMemberships.filter((membership) =>
    membership.status === "active"
    || membership.status === "past_due"
    || membership.status === "cancelled"
    || membership.status === "expired",
  );
  const applications = await dependencies.applications.list(actor);
  const applicants = profileMap(applications);
  const summary: MutableSummary = {
    scanned: memberships.length,
    createdSteps: 0,
    existingSteps: 0,
    skipped: 0,
    errors: {},
  };

  for (const membership of memberships) {
    const profileId = profileFor(membership, applicants);
    if (!profileId) {
      recordError(summary, "MISSING_PROFILE");
      continue;
    }
    if (membership.status === "active") {
      const anchor = validDate(membership.updatedAt)
        ? membership.updatedAt
        : validDate(membership.createdAt) ? membership.createdAt : now;
      await enrollSteps(actor, scheduleJourney({
        journey: "onboarding_90d",
        profileId,
        membershipId: membership.id,
        instanceKey: `activation:${membership.id}`,
        anchor,
      }), dependencies.journeys, summary);
      continue;
    }
    if (membership.status !== "past_due" && membership.status !== "cancelled" && membership.status !== "expired") {
      continue;
    }
    const audits = await dependencies.auditEvents.listForTarget(actor, "membership", membership.id);
    const audit = latestLifecycleAudit(audits, membership.status);
    if (!audit) {
      recordError(summary, "MISSING_LIFECYCLE_AUDIT");
      continue;
    }
    await enrollSteps(actor, scheduleWebhookLifecycleEnrollment({
      membershipId: membership.id,
      profileId,
      nextStatus: membership.status,
      eventId: audit.eventId,
      eventCreated: audit.eventCreated,
    }), dependencies.journeys, summary);
  }
  return summary;
}

export async function reconcileRenewalEnrollments(
  actor: AutomationRepositoryActor,
  now: Date,
  dependencies: RenewalEnrollmentDependencies = defaultRenewalDependencies,
): Promise<JobSummary> {
  if (actor.kind !== "system") throw new Error("FORBIDDEN");
  if (!validDate(now)) throw new Error("INVALID_RECONCILIATION_TIME");
  const memberships = await dependencies.renewals.listDue(actor);
  const summary: MutableSummary = {
    scanned: memberships.length,
    createdSteps: 0,
    existingSteps: 0,
    skipped: 0,
    errors: {},
  };
  for (const membership of memberships) {
    if (!validDate(membership.billingPeriodEnd)) {
      recordError(summary, "MISSING_BILLING_PERIOD_END");
      continue;
    }
    if (!membership.profileId) {
      recordError(summary, "MISSING_PROFILE");
      continue;
    }
    await enrollSteps(actor, scheduleJourney({
      journey: "renewal",
      profileId: membership.profileId,
      membershipId: membership.membershipId,
      instanceKey: `period:${membership.billingPeriodEnd.toISOString()}`,
      anchor: membership.billingPeriodEnd,
    }), dependencies.journeys, summary);
  }
  return summary;
}
