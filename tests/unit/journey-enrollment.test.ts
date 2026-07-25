import {describe, expect, it} from "vitest";

import {systemActor} from "@/lib/auth/actor";
import {
  reconcileLifecycleEnrollments,
  scheduleWebhookLifecycleEnrollment,
  type LifecycleEnrollmentDependencies,
  type LifecycleMembership,
} from "@/lib/automation/enrollment";
import {runRenewalReconciliation} from "@/lib/automation/renewal-runner";
import type {JourneyEnrollment} from "@/lib/db/repos/journeys";
import type {Actor, MembershipStatus} from "@/lib/membership/lifecycle";

const now = new Date("2026-07-26T04:00:00.000Z");
const periodEnd = new Date("2027-07-26T04:00:00.000Z");
const paymentFailedAt = 1_774_502_400;
const cancellationAt = 1_777_094_400;

function membership(
  id: string,
  status: MembershipStatus,
  overrides: Partial<LifecycleMembership> = {},
): LifecycleMembership {
  return {
    id,
    ownerUserId: `profile-${id}`,
    companyId: null,
    applicationId: `application-${id}`,
    planCode: "startup",
    status,
    billingPeriodEnd: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function harness(seed: readonly LifecycleMembership[]) {
  const rows = new Map<string, JourneyEnrollment>();
  const actors: Actor[] = [];
  const dependencies: LifecycleEnrollmentDependencies = {
    memberships: {
      async list() {
        return [...seed];
      },
    },
    applications: {
      async list() {
        return seed
          .filter((value) => value.applicationId)
          .map((value) => ({
            id: value.applicationId!,
            applicantUserId: value.ownerUserId ?? `applicant-${value.id}`,
          }));
      },
    },
    auditEvents: {
      async listForTarget(_actor, _targetType, targetId) {
        if (targetId === "past-due") return [{
          action: "stripe.webhook.processed",
          requestId: "evt_payment_failed",
          metadata: {status: "past_due", stripeCreated: paymentFailedAt},
          createdAt: new Date(paymentFailedAt * 1000),
        }];
        if (targetId === "cancelled") return [{
          action: "stripe.webhook.processed",
          requestId: "evt_cancelled",
          metadata: {status: "cancelled", stripeCreated: cancellationAt},
          createdAt: new Date(cancellationAt * 1000),
        }];
        return [];
      },
    },
    journeys: {
      async enroll(actor, enrollment) {
        actors.push(actor);
        const key = [enrollment.profileId, enrollment.journey, enrollment.instanceKey, enrollment.step].join("|");
        if (rows.has(key)) return "existing";
        rows.set(key, enrollment);
        return "created";
      },
    },
  };
  return {dependencies, enrollments: () => [...rows.values()], actors};
}

describe("membership lifecycle journey enrollment", () => {
  it("reconciles current lifecycle state once with stable business instance keys", async () => {
    const active = membership("active", "active");
    const pastDue = membership("past-due", "past_due");
    const cancelled = membership("cancelled", "cancelled");
    const lapsed = membership("lapsed", "expired");
    const pending = membership("pending", "pending_payment", {ownerUserId: null, applicationId: null});
    const test = harness([active, pastDue, cancelled, lapsed, pending]);
    const actor = systemActor("stripe-webhook");

    const first = await reconcileLifecycleEnrollments(actor, now, test.dependencies);
    const second = await reconcileLifecycleEnrollments(actor, now, test.dependencies);

    expect(test.enrollments()).toContainEqual(expect.objectContaining({
      journey: "onboarding_90d",
      instanceKey: `activation:${active.id}`,
      step: "welcome",
    }));
    expect(test.enrollments()).toContainEqual(expect.objectContaining({
      journey: "dunning",
      instanceKey: "payment:evt_payment_failed",
      step: "dunning_0",
    }));
    expect(test.enrollments()).toContainEqual(expect.objectContaining({
      journey: "winback",
      instanceKey: "termination:evt_cancelled",
      step: "winback_7",
    }));
    expect(first).toMatchObject({
      scanned: 4,
      createdSteps: 16,
      existingSteps: 0,
      skipped: 1,
      errors: {MISSING_LIFECYCLE_AUDIT: 1},
    });
    expect(second).toMatchObject({
      scanned: 4,
      createdSteps: 0,
      existingSteps: 16,
      skipped: 1,
      errors: {MISSING_LIFECYCLE_AUDIT: 1},
    });
    expect(test.actors).not.toHaveLength(0);
    expect(test.actors.every((value) => value.kind === "system")).toBe(true);
  });

  it("uses the application applicant for a company membership profile", async () => {
    const company = membership("company", "active", {ownerUserId: null, companyId: "company-1"});
    const test = harness([company]);

    await reconcileLifecycleEnrollments(systemActor("stripe-webhook"), now, test.dependencies);

    expect(test.enrollments()).toContainEqual(expect.objectContaining({
      profileId: "applicant-company",
      membershipId: company.id,
      journey: "onboarding_90d",
    }));
  });

  it("skips lifecycle rows without an authoritative processed audit using a sanitized code", async () => {
    const malformed = membership("malformed", "past_due");
    const test = harness([malformed]);

    const summary = await reconcileLifecycleEnrollments(systemActor("stripe-webhook"), now, test.dependencies);

    expect(test.enrollments()).toEqual([]);
    expect(summary).toMatchObject({
      scanned: 1,
      createdSteps: 0,
      existingSteps: 0,
      skipped: 1,
      errors: {MISSING_LIFECYCLE_AUDIT: 1},
    });
    expect(JSON.stringify(summary)).not.toContain(malformed.id);
  });

  it("uses webhook event identity and event time even when period dates are null", () => {
    const dunning = scheduleWebhookLifecycleEnrollment({
      membershipId: "membership-dunning",
      profileId: "profile-dunning",
      nextStatus: "past_due",
      eventId: "evt_dunning",
      eventCreated: paymentFailedAt,
    });
    const winback = scheduleWebhookLifecycleEnrollment({
      membershipId: "membership-cancelled",
      profileId: "profile-cancelled",
      nextStatus: "cancelled",
      eventId: "evt_cancelled",
      eventCreated: cancellationAt,
    });

    expect(dunning).toContainEqual(expect.objectContaining({
      journey: "dunning",
      instanceKey: "payment:evt_dunning",
      step: "dunning_0",
      scheduledAt: new Date(paymentFailedAt * 1000),
    }));
    expect(winback).toContainEqual(expect.objectContaining({
      journey: "winback",
      instanceKey: "termination:evt_cancelled",
      step: "winback_7",
      scheduledAt: new Date(cancellationAt * 1000 + 7 * 86_400_000),
    }));
  });

  it("creates one renewal instance per billing period and anchors all steps to the period end", async () => {
    const active = membership("renewal", "active", {billingPeriodEnd: periodEnd});
    const free = membership("free", "active", {planCode: "community", billingPeriodEnd: null});
    const test = harness([active, free]);
    const actor = systemActor("stripe-webhook");

    const first = await runRenewalReconciliation(actor, now, test.dependencies);
    const second = await runRenewalReconciliation(actor, now, test.dependencies);

    const renewal = test.enrollments().filter((value) => value.journey === "renewal");
    expect(renewal).toHaveLength(4);
    expect(renewal.every((value) => value.instanceKey === `period:${periodEnd.toISOString()}`)).toBe(true);
    expect(renewal.find((value) => value.step === "renewal_90")?.scheduledAt)
      .toEqual(new Date(periodEnd.getTime() - 90 * 86_400_000));
    expect(first).toMatchObject({scanned: 1, createdSteps: 4, existingSteps: 0, skipped: 0, errors: {}});
    expect(second).toMatchObject({scanned: 1, createdSteps: 0, existingSteps: 4, skipped: 0, errors: {}});
  });

  it("rejects non-system reconciliation before repository reads", async () => {
    const test = harness([membership("active", "active")]);
    const member: Actor = {kind: "member", userId: "member-1", profileId: "member-1"};

    await expect(reconcileLifecycleEnrollments(member, now, test.dependencies)).rejects.toThrow("FORBIDDEN");
    expect(test.enrollments()).toEqual([]);
  });
});
