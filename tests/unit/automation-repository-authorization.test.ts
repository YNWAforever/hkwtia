import {describe, expect, it, vi} from "vitest";

import {createDeliveriesRepository} from "@/lib/db/repos/deliveries";
import {
  createJourneysRepository,
  type AutomationDatabase,
  type AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {createSuppressionsRepository} from "@/lib/db/repos/suppressions";
import type {Actor} from "@/lib/membership/lifecycle";

const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
const admin = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;
const member = {kind: "member", userId: "auth-member", profileId: "member-1"} as const;
const anonymous = {kind: "anonymous", userId: null} as const;

const enrollment = {
  profileId: "member-1",
  membershipId: null,
  journey: "onboarding_90d",
  instanceKey: "activation:membership-1",
  step: "welcome",
  scheduledAt: new Date("2027-01-01T00:00:00.000Z"),
  deliveryKey: "journey:member-1:onboarding_90d:activation:membership-1:welcome",
} as const;

function database(rows: Record<string, unknown>[] = []): AutomationDatabase {
  const execute: AutomationSqlExecutor["execute"] = vi.fn(async () => ({rows}));
  const database: AutomationDatabase = {
    execute,
    transaction: async <T>(work: (transaction: AutomationSqlExecutor) => Promise<T>) => work(database),
  };
  return database;
}

describe("automation repository authorization", () => {
  it.each<Actor>([member, admin, anonymous])("rejects $kind journey mutations before opening the database", async (actor) => {
    const loadDatabase = vi.fn(async () => database());
    const repo = createJourneysRepository(loadDatabase);

    await expect(repo.enroll(actor, enrollment)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.claimDue(actor, enrollment.scheduledAt, 1, 300_000)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.markSent(actor, "journey-1", enrollment.scheduledAt, enrollment.scheduledAt)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.markSkipped(actor, "journey-1", enrollment.scheduledAt, "skip_condition", enrollment.scheduledAt)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.reschedule(actor, "journey-1", enrollment.scheduledAt, enrollment.scheduledAt, "retryable_network")).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.markFailed(actor, "journey-1", enrollment.scheduledAt, "attempts_exhausted", enrollment.scheduledAt)).rejects.toMatchObject({code: "FORBIDDEN"});

    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("permits system journey mutations and rejects system/admin/member misuse of failed retry", async () => {
    const db = database([{
      id: "journey-1", profile_id: "member-1", membership_id: null, journey: "onboarding_90d",
      instance_key: "activation:membership-1", step: "welcome", scheduled_at: enrollment.scheduledAt,
      status: "scheduled", attempt_count: 0, claimed_at: null, claim_expires_at: null,
      delivery_key: enrollment.deliveryKey, error_code: null, completed_at: null,
      created_at: enrollment.scheduledAt, updated_at: enrollment.scheduledAt,
    }]);
    const repo = createJourneysRepository(async () => db);

    await expect(repo.enroll(system, enrollment)).resolves.toBe("created");
    await expect(repo.retryFailed(system, "journey-1", enrollment.scheduledAt)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.retryFailed(member, "journey-1", enrollment.scheduledAt)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.retryFailed(anonymous, "journey-1", enrollment.scheduledAt)).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.retryFailed(admin, "journey-1", enrollment.scheduledAt)).resolves.toMatchObject({status: "scheduled"});
  });

  it("allows self/admin/system history reads and rejects anonymous or cross-member reads", async () => {
    const db = database();
    const repo = createJourneysRepository(async () => db);

    await expect(repo.listForProfile(member, "member-1")).resolves.toEqual([]);
    await expect(repo.listForProfile(admin, "member-1")).resolves.toEqual([]);
    await expect(repo.listForProfile(system, "member-1")).resolves.toEqual([]);
    await expect(repo.listForProfile(member, "member-2")).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repo.listForProfile(anonymous, "member-1")).rejects.toMatchObject({code: "FORBIDDEN"});
  });

  it("keeps delivery, suppression, and staff-task mutations system-only", async () => {
    const loadDatabase = vi.fn(async () => database([{
      id: "record-1", profile_id: "member-1", journey_state_id: "journey-1", template: "welcome",
      status: "processing", provider_id: null, idempotency_key: "delivery-1", locale: "en",
      classification: "transactional", attempt_count: 1, error_code: null, kind: "automation",
      dedupe_key: "task-1", summary_code: "automation", created_at: enrollment.scheduledAt,
    }]));
    const deliveries = createDeliveriesRepository(loadDatabase);
    const suppressions = createSuppressionsRepository(loadDatabase);
    const staffTasks = createStaffTasksRepository(loadDatabase);
    const email = {
      profileId: "member-1",
      journeyStateId: "journey-1",
      template: "welcome",
      subject: "welcome_subject",
      idempotencyKey: "delivery-1:email",
      locale: "en",
      classification: "transactional",
    } as const;
    const whatsapp = {
      profileId: "member-1",
      journeyStateId: "journey-1",
      template: "renewal_14",
      idempotencyKey: "delivery-1:whatsapp",
      locale: "zh-HK",
      classification: "transactional",
    } as const;
    const task = {
      profileId: "member-1",
      journeyStateId: "journey-1",
      kind: "permanent_delivery_failure",
      dedupeKey: "journey-1:permanent_delivery_failure",
      summaryCode: "attempts_exhausted",
    } as const;

    for (const actor of [member, admin, anonymous] satisfies Actor[]) {
      await expect(deliveries.reserveEmail(actor, email)).rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(deliveries.completeEmail(actor, "email-log-1", {status: "sent", providerId: "provider-1"}))
        .rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(deliveries.reserveWhatsapp(actor, whatsapp)).rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(deliveries.completeWhatsapp(actor, "whatsapp-log-1", {status: "failed", errorCode: "provider_client_error"}))
        .rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(suppressions.unsubscribeEmailMarketing(actor, "member-1", "member_unsubscribe"))
        .rejects.toMatchObject({code: "FORBIDDEN"});
      await expect(staffTasks.createOnce(actor, task)).rejects.toMatchObject({code: "FORBIDDEN"});
    }

    expect(loadDatabase).not.toHaveBeenCalled();
    await expect(deliveries.reserveEmail(system, email)).resolves.toMatchObject({disposition: "created"});
    await expect(deliveries.reserveWhatsapp(system, whatsapp)).resolves.toMatchObject({disposition: "created"});
    await expect(suppressions.unsubscribeEmailMarketing(system, "member-1", "member_unsubscribe")).resolves.toBe("created");
    await expect(staffTasks.createOnce(system, task)).resolves.toMatchObject({disposition: "created"});
  });
});
