import {describe, expect, it} from "vitest";

import {runJourneyBatch, type JourneyRunnerDependencies} from "@/lib/automation/journey-runner";
import type {JourneyClaim} from "@/lib/db/repos/journeys";

const now = new Date("2027-01-15T10:00:00.000Z");
const due: JourneyClaim = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "member-concurrent",
  membershipId: "22222222-2222-4222-8222-222222222222",
  journey: "onboarding_90d",
  instanceKey: "activation:22222222-2222-4222-8222-222222222222",
  step: "welcome",
  scheduledAt: new Date(now.getTime() - 1_000),
  status: "processing",
  attemptCount: 1,
  claimedAt: now,
  claimExpiresAt: new Date(now.getTime() + 300_000),
  deliveryKey: "journey:member-concurrent:onboarding_90d:activation:22222222-2222-4222-8222-222222222222:welcome",
  errorCode: null,
  completedAt: null,
  createdAt: new Date(now.getTime() - 86_400_000),
  updatedAt: now,
  claimSource: "scheduled",
  emailErrorCode: null,
  whatsappErrorCode: null,
};

describe("journey runner delivery idempotency", () => {
  it("allows concurrent runner calls to claim once, reserve one log, and issue one provider request", async () => {
    let available = true;
    const emailLogs = new Map<string, {
      id: string;
      status: "processing" | "sent";
      idempotencyKey: string;
      providerId: string | null;
      attemptCount: number;
    }>();
    const providerRequests: string[] = [];
    const transitions: Array<{id: string; claimedAt: Date}> = [];
    const deps: JourneyRunnerDependencies = {
      journeys: {
        async claimDue() {
          if (!available) return [];
          available = false;
          return [due];
        },
        async markSent(_actor, id, claimedAt) {
          transitions.push({id, claimedAt});
          return due;
        },
        async markSkipped() {
          throw new Error("unexpected skip");
        },
        async reschedule() {
          throw new Error("unexpected retry");
        },
        async markFailed() {
          throw new Error("unexpected failure");
        },
      },
      deliveries: {
        async reserveEmail(_actor, input) {
          const existing = emailLogs.get(input.idempotencyKey);
          if (existing) return {record: existing, disposition: "existing" as const};
          const record = {
            id: "email-log-1",
            status: "processing" as const,
            idempotencyKey: input.idempotencyKey,
            providerId: null,
            attemptCount: 1,
          };
          emailLogs.set(input.idempotencyKey, record);
          return {record, disposition: "created" as const};
        },
        async retryEmailFailure() {
          throw new Error("unexpected email retry");
        },
        async completeEmail(_actor, id, completion) {
          const record = [...emailLogs.values()].find((candidate) => candidate.id === id)!;
          record.status = "sent";
          record.providerId = completion.providerId ?? null;
          return record;
        },
        async reserveWhatsapp() {
          throw new Error("unexpected WhatsApp reservation");
        },
        async retryWhatsappFailure() {
          throw new Error("unexpected WhatsApp retry");
        },
        async completeWhatsapp() {
          throw new Error("unexpected WhatsApp completion");
        },
      },
      staffTasks: {
        async createOnce() {
          throw new Error("unexpected staff task");
        },
      },
      memberships: {
        async lapseDunningEpisode() {
          throw new Error("unexpected lapse");
        },
      },
      async loadContext() {
        return {
          hasLoggedIn: false,
          profileCompleteness: 100,
          marketingConsent: false,
          emailSuppressed: true,
          whatsappOptIn: false,
          whatsappNumber: null,
          engagementScore: 50,
          email: "member-concurrent@example.test",
          recipientName: "Concurrent Fixture",
          locale: "en",
          variables: {ctaUrl: "https://example.test/member"},
          unsubscribeUrl: null,
          membershipStatus: "active",
        };
      },
      async renderEmail() {
        return {
          subject: "Welcome",
          html: "<p>Welcome</p>",
          text: "Welcome",
          headers: {},
        };
      },
      emailTransport: {
        async send(input) {
          providerRequests.push(input.idempotencyKey);
          return {status: "sent" as const, providerId: "resend-provider-1"};
        },
      },
      whatsappTransport: {
        async sendTemplateMessage() {
          throw new Error("unexpected WhatsApp send");
        },
      },
      emailFrom: "WTIA <members@example.test>",
    };

    await Promise.all([
      runJourneyBatch(deps, {now, limit: 10}),
      runJourneyBatch(deps, {now, limit: 10}),
    ]);

    expect(providerRequests.filter((key) => key === due.deliveryKey)).toHaveLength(1);
    expect(emailLogs.get(due.deliveryKey)).toMatchObject({
      status: "sent",
      idempotencyKey: due.deliveryKey,
    });
    expect(emailLogs).toHaveLength(1);
    expect(transitions).toEqual([{id: due.id, claimedAt: now}]);
  });
});
