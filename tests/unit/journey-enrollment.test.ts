import {describe, expect, it} from "vitest";

import {systemActor} from "@/lib/auth/actor";
import type {AutomationRepositoryActor} from "@/lib/auth/automation-actor";
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

type AuditFixture = Readonly<{
  action: string;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}>;

function processedAudit(
  eventId: string,
  status: string,
  stripeCreated: unknown,
): AuditFixture {
  return {
    action: "stripe.webhook.processed",
    requestId: eventId,
    metadata: {status, stripeCreated},
    createdAt: new Date("2026-07-26T04:00:00.000Z"),
  };
}

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

function harness(
  seed: readonly LifecycleMembership[],
  auditsByTarget: Readonly<Record<string, readonly AuditFixture[]>> = {},
) {
  const rows = new Map<string, JourneyEnrollment>();
  const actors: AutomationRepositoryActor[] = [];
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
        if (Object.prototype.hasOwnProperty.call(auditsByTarget, targetId)) {
          return auditsByTarget[targetId] ?? [];
        }
        if (targetId === "past-due") {
          return [processedAudit("evt_payment_failed", "past_due", paymentFailedAt)];
        }
        if (targetId === "cancelled") {
          return [processedAudit("evt_cancelled", "cancelled", cancellationAt)];
        }
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
    const test = harness([active, pastDue, cancelled, lapsed, pending], {
      lapsed: [
        processedAudit("evt_lapsed_cancelled_old", "cancelled", cancellationAt - 60),
        processedAudit("evt_lapsed_cancelled_latest", "canceled", cancellationAt + 60),
      ],
    });
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
    expect(test.enrollments()).toContainEqual(expect.objectContaining({
      journey: "winback",
      instanceKey: "termination:evt_lapsed_cancelled_latest",
      step: "winback_7",
      scheduledAt: new Date((cancellationAt + 60) * 1000 + 7 * 86_400_000),
    }));
    expect(first).toMatchObject({
      scanned: 4,
      createdSteps: 19,
      existingSteps: 0,
      skipped: 0,
      errors: {},
    });
    expect(second).toMatchObject({
      scanned: 4,
      createdSteps: 0,
      existingSteps: 19,
      skipped: 0,
      errors: {},
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
    const missing = membership("missing", "past_due");
    const test = harness([missing]);

    const summary = await reconcileLifecycleEnrollments(systemActor("stripe-webhook"), now, test.dependencies);

    expect(test.enrollments()).toEqual([]);
    expect(summary).toMatchObject({
      scanned: 1,
      createdSteps: 0,
      existingSteps: 0,
      skipped: 1,
      errors: {MISSING_LIFECYCLE_AUDIT: 1},
    });
    expect(JSON.stringify(summary)).not.toContain(missing.id);
  });

  it.each([
    null,
    "",
    "   ",
    false,
    true,
    [],
    {},
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects malformed raw stripeCreated metadata without producing a 1970 enrollment: %j", async (stripeCreated) => {
    const malformed = membership("malformed", "past_due");
    const test = harness([malformed], {
      malformed: [processedAudit("evt_malformed", "past_due", stripeCreated)],
    });

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
    expect(JSON.stringify(test.enrollments())).not.toContain("1970-01-01");
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
