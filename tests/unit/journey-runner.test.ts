import {describe, expect, it, vi} from "vitest";

import {runJourneyBatch, type JourneyRunnerContext, type JourneyRunnerDependencies} from "@/lib/automation/journey-runner";
import {DeliveryFailure} from "@/lib/email/transport";
import type {JourneyState} from "@/lib/db/server-schema";

const now = new Date("2027-01-15T10:00:00.000Z");
const membershipId = "22222222-2222-4222-8222-222222222222";

function due(
  step: string,
  overrides: Partial<JourneyState> = {},
): JourneyState {
  return {
    id: crypto.randomUUID(),
    profileId: `member-${step}`,
    membershipId,
    journey: "onboarding_90d",
    instanceKey: `activation:${membershipId}`,
    step,
    scheduledAt: new Date(now.getTime() - 1_000),
    status: "processing",
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    deliveryKey: `journey:member-${step}:onboarding_90d:activation:${membershipId}:${step}`,
    errorCode: null,
    completedAt: null,
    createdAt: new Date(now.getTime() - 86_400_000),
    updatedAt: now,
    ...overrides,
  };
}

function context(overrides: Partial<JourneyRunnerContext> = {}): JourneyRunnerContext {
  return {
    hasLoggedIn: false,
    profileCompleteness: 50,
    marketingConsent: true,
    emailSuppressed: false,
    whatsappOptIn: false,
    whatsappNumber: null,
    engagementScore: 50,
    email: "member@example.test",
    recipientName: "Fixture Member",
    locale: "en",
    variables: {
      ctaUrl: "https://example.test/member",
      memberName: "Fixture Member",
      renewalDate: "2027-02-01",
      renewalUrl: "https://example.test/renew",
      amountDue: "HKD 100",
      paymentUrl: "https://example.test/pay",
    },
    unsubscribeUrl: "https://example.test/unsubscribe?token=fixture",
    membershipStatus: "active",
    ...overrides,
  };
}

type DeliveryRecord = {
  id: string;
  channel: "email" | "whatsapp";
  status: "processing" | "sent" | "failed";
  idempotencyKey: string;
  providerId: string | null;
  errorCode: string | null;
};

function harness(
  claims: JourneyState[],
  contextFor: (claim: JourneyState) => JourneyRunnerContext = () => context(),
  claimBatches: readonly (readonly JourneyState[])[] = [claims],
) {
  const logs = new Map<string, DeliveryRecord>();
  const tasks = new Map<string, {
    profileId: string;
    journeyStateId: string | null;
    kind: string;
    dedupeKey: string;
    summaryCode: string;
  }>();
  const sentEmails: Array<{idempotencyKey: string; to: string}> = [];
  const sentWhatsapp: Array<{idempotencyKey: string; template: string}> = [];
  const rendered: Array<{template: string; locale: string; variables: Readonly<Record<string, string | number>>}> = [];
  const skipped: Array<{id: string; claimedAt: Date; code: string}> = [];
  const sent: Array<{id: string; claimedAt: Date}> = [];
  const rescheduled: Array<{id: string; claimedAt: Date; scheduledAt: Date; code: string}> = [];
  const failed: Array<{id: string; claimedAt: Date; code: string}> = [];
  const lapseCalls: Array<Parameters<JourneyRunnerDependencies["memberships"]["lapseDunningEpisode"]>[1]> = [];
  let claimBatch = 0;

  const deps: JourneyRunnerDependencies = {
    journeys: {
      async claimDue(_actor, _claimNow, limit) {
        return (claimBatches[claimBatch++] ?? []).slice(0, limit);
      },
      async markSent(_actor, id, claimedAt) {
        sent.push({id, claimedAt});
        return claims.find((claim) => claim.id === id)!;
      },
      async markSkipped(_actor, id, claimedAt, code) {
        skipped.push({id, claimedAt, code});
        return claims.find((claim) => claim.id === id)!;
      },
      async reschedule(_actor, id, claimedAt, scheduledAt, code) {
        rescheduled.push({id, claimedAt, scheduledAt, code});
        return claims.find((claim) => claim.id === id)!;
      },
      async markFailed(_actor, id, claimedAt, code) {
        failed.push({id, claimedAt, code});
        return claims.find((claim) => claim.id === id)!;
      },
    },
    deliveries: {
      async reserveEmail(_actor, input) {
        const existing = logs.get(input.idempotencyKey);
        if (existing) {
          if (existing.status === "failed") {
            existing.status = "processing";
            existing.errorCode = null;
          }
          return {record: existing, disposition: "existing" as const};
        }
        const record: DeliveryRecord = {
          id: `email-${logs.size + 1}`,
          channel: "email",
          status: "processing",
          idempotencyKey: input.idempotencyKey,
          providerId: null,
          errorCode: null,
        };
        logs.set(input.idempotencyKey, record);
        return {record, disposition: "created" as const};
      },
      async completeEmail(_actor, id, completion) {
        const record = [...logs.values()].find((candidate) => candidate.id === id)!;
        record.status = completion.status;
        record.providerId = completion.providerId ?? null;
        record.errorCode = completion.status === "failed" ? completion.errorCode : null;
        return record;
      },
      async reserveWhatsapp(_actor, input) {
        const existing = logs.get(input.idempotencyKey);
        if (existing) return {record: existing, disposition: "existing" as const};
        const record: DeliveryRecord = {
          id: `whatsapp-${logs.size + 1}`,
          channel: "whatsapp",
          status: "processing",
          idempotencyKey: input.idempotencyKey,
          providerId: null,
          errorCode: null,
        };
        logs.set(input.idempotencyKey, record);
        return {record, disposition: "created" as const};
      },
      async completeWhatsapp(_actor, id, completion) {
        const record = [...logs.values()].find((candidate) => candidate.id === id)!;
        record.status = completion.status;
        record.providerId = completion.providerId ?? null;
        record.errorCode = completion.status === "failed" ? completion.errorCode : null;
        return record;
      },
    },
    staffTasks: {
      async createOnce(_actor, input) {
        const existing = tasks.get(input.dedupeKey);
        if (existing) {
          return {
            record: {...existing, id: `task-${input.dedupeKey}`, status: "open" as const},
            disposition: "existing" as const,
          };
        }
        tasks.set(input.dedupeKey, input);
        return {
          record: {...input, id: `task-${input.dedupeKey}`, status: "open" as const},
          disposition: "created" as const,
        };
      },
    },
    memberships: {
      async lapseDunningEpisode(_actor, input) {
        lapseCalls.push(input);
        return {disposition: "lapsed" as const, createdTasks: 1, createdSteps: input.winbackSteps.length};
      },
    },
    loadContext: async (_actor, claim) => contextFor(claim),
    renderEmail: async (input) => {
      rendered.push({template: input.template, locale: input.locale, variables: input.variables});
      return {
        subject: `${input.template}-subject`,
        html: `<p>${input.template}</p>`,
        text: input.template,
        headers: {},
      };
    },
    emailTransport: {
      async send(input) {
        sentEmails.push({idempotencyKey: input.idempotencyKey, to: input.to});
        return {status: "sent" as const, providerId: `provider-${input.idempotencyKey}`};
      },
    },
    whatsappTransport: {
      async sendTemplateMessage(input) {
        sentWhatsapp.push({idempotencyKey: input.idempotencyKey, template: input.template});
        return {status: "sent" as const, providerId: `wa-${input.idempotencyKey}`};
      },
    },
    emailFrom: "WTIA <members@example.test>",
  };

  return {
    deps,
    failed,
    lapseCalls,
    logs,
    rendered,
    rescheduled,
    sent,
    sentEmails,
    sentWhatsapp,
    skipped,
    tasks,
  };
}

describe("runJourneyBatch", () => {
  it("selects the current Day-7 branch at execution time", async () => {
    const nudge = due("day7_nudge");
    const mixer = due("day7_mixer", {
      id: crypto.randomUUID(),
      profileId: nudge.profileId,
      deliveryKey: `${nudge.deliveryKey}:mixer`,
    });
    const test = harness([nudge, mixer], () => context({hasLoggedIn: false}));

    const summary = await runJourneyBatch(test.deps, {now, limit: 10});

    expect(summary).toMatchObject({claimed: 2, sent: 1, skipped: 1});
    expect(test.rendered.map((item) => item.template)).toEqual(["day7_nudge"]);
    expect(test.skipped).toEqual([{id: mixer.id, claimedAt: now, code: "skip_condition"}]);
  });

  it("suppresses marketing but still delivers transactional email", async () => {
    const marketing = due("day1_video");
    const transactional = due("welcome", {
      id: crypto.randomUUID(),
      profileId: marketing.profileId,
      deliveryKey: `${marketing.deliveryKey}:welcome`,
    });
    const test = harness(
      [marketing, transactional],
      () => context({marketingConsent: false, emailSuppressed: true}),
    );

    await runJourneyBatch(test.deps, {now, limit: 10});

    expect(test.skipped).toContainEqual({
      id: marketing.id,
      claimedAt: now,
      code: "skip_suppressed",
    });
    expect(test.sentEmails.map((item) => item.idempotencyKey)).toEqual([transactional.deliveryKey]);
  });

  it("always sends D90 and creates one stable low-engagement staff task", async () => {
    const review = due("day90_review");
    const test = harness([review], () => context({engagementScore: 10}));

    await runJourneyBatch(test.deps, {now, limit: 1});

    expect(test.sentEmails).toHaveLength(1);
    expect([...test.tasks.values()]).toEqual([expect.objectContaining({
      profileId: review.profileId,
      journeyStateId: review.id,
      kind: "d90_low_engagement",
      summaryCode: "score_below_20",
    })]);
  });

  it("atomically lapses unresolved D14 dunning and enrolls one stable win-back instance", async () => {
    const lapsed = due("lapsed", {
      journey: "dunning",
      instanceKey: "payment:evt_fixture",
      scheduledAt: new Date("2027-01-15T02:00:00.000Z"),
    });
    const test = harness([lapsed], () => context({membershipStatus: "past_due"}));

    await runJourneyBatch(test.deps, {now, limit: 1});

    expect(test.lapseCalls).toHaveLength(1);
    expect(test.lapseCalls[0]).toMatchObject({
      membershipId,
      profileId: lapsed.profileId,
      journeyStateId: lapsed.id,
      instanceKey: `termination:lapse:${lapsed.id}`,
    });
    expect(test.lapseCalls[0]?.winbackSteps.map((step) => ({
      step: step.step,
      instanceKey: step.instanceKey,
      scheduledAt: step.scheduledAt,
    }))).toEqual([
      {
        step: "winback_7",
        instanceKey: `termination:lapse:${lapsed.id}`,
        scheduledAt: new Date("2027-01-22T02:00:00.000Z"),
      },
      {
        step: "winback_21",
        instanceKey: `termination:lapse:${lapsed.id}`,
        scheduledAt: new Date("2027-02-05T02:00:00.000Z"),
      },
      {
        step: "winback_60",
        instanceKey: `termination:lapse:${lapsed.id}`,
        scheduledAt: new Date("2027-03-16T02:00:00.000Z"),
      },
    ]);
    expect(test.sentEmails).toHaveLength(1);
  });

  it("uses current WhatsApp opt-in and creates no WhatsApp log when opted out", async () => {
    const renewal = due("renewal_14", {
      journey: "renewal",
      instanceKey: "period:2027-02-01T00:00:00.000Z",
    });
    const optedOut = harness([renewal], () => context({
      whatsappOptIn: false,
      whatsappNumber: "+85255550000",
    }));

    await runJourneyBatch(optedOut.deps, {now, limit: 1});

    expect(optedOut.sentEmails).toHaveLength(1);
    expect(optedOut.sentWhatsapp).toHaveLength(0);
    expect([...optedOut.logs.values()].filter((record) => record.channel === "whatsapp")).toHaveLength(0);

    const optedIn = harness([renewal], () => context({
      whatsappOptIn: true,
      whatsappNumber: "+85255550000",
    }));
    await runJourneyBatch(optedIn.deps, {now, limit: 1});

    expect(optedIn.sentWhatsapp).toEqual([{
      idempotencyKey: `${renewal.deliveryKey}:whatsapp`,
      template: "renewal_14",
    }]);
  });

  it("reschedules a retryable first failure with the claim fencing token", async () => {
    const welcome = due("welcome");
    const test = harness([welcome]);
    test.deps.emailTransport.send = vi.fn(async () => {
      throw new DeliveryFailure("retryable_network");
    });

    const summary = await runJourneyBatch(test.deps, {now, limit: 1});

    expect(summary).toMatchObject({retried: 1, failed: 0});
    expect(test.rescheduled).toEqual([{
      id: welcome.id,
      claimedAt: now,
      scheduledAt: new Date(now.getTime() + 5 * 60_000),
      code: "retryable_network",
    }]);
  });

  it("reuses the delivery key after a provider-success completion crash", async () => {
    const welcome = due("welcome");
    const retryNow = new Date(now.getTime() + 5 * 60_000);
    const retryClaim = due("welcome", {
      id: welcome.id,
      profileId: welcome.profileId,
      instanceKey: welcome.instanceKey,
      deliveryKey: welcome.deliveryKey,
      attemptCount: 2,
      claimedAt: retryNow,
      claimExpiresAt: new Date(retryNow.getTime() + 5 * 60_000),
      scheduledAt: retryNow,
    });
    const test = harness(
      [welcome],
      () => context(),
      [[welcome], [retryClaim]],
    );
    const originalComplete = test.deps.deliveries.completeEmail;
    let crashCompletion = true;
    (test.deps.deliveries as {
      completeEmail: typeof originalComplete;
    }).completeEmail = vi.fn(async (actor, id, completion) => {
      if (crashCompletion) {
        crashCompletion = false;
        throw new Error("simulated completion crash");
      }
      return originalComplete(actor, id, completion);
    });

    const first = await runJourneyBatch(test.deps, {now, limit: 1});
    const second = await runJourneyBatch(test.deps, {now: retryNow, limit: 1});

    expect(first).toMatchObject({retried: 1, sent: 0});
    expect(second).toMatchObject({retried: 0, sent: 1});
    expect(test.sentEmails.map((item) => item.idempotencyKey)).toEqual([
      welcome.deliveryKey,
      welcome.deliveryKey,
    ]);
    expect(test.logs).toHaveLength(1);
    expect(test.logs.get(welcome.deliveryKey)).toMatchObject({status: "sent"});
    expect(test.sent).toEqual([{id: welcome.id, claimedAt: retryNow}]);
  });

  it("fails attempt three permanently and creates one deduplicated task", async () => {
    const welcome = due("welcome", {attemptCount: 3});
    const test = harness([welcome]);
    test.deps.emailTransport.send = vi.fn(async () => {
      throw new DeliveryFailure("retryable_network");
    });

    const summary = await runJourneyBatch(test.deps, {now, limit: 1});

    expect(summary).toMatchObject({retried: 0, failed: 1});
    expect(test.failed).toEqual([{id: welcome.id, claimedAt: now, code: "attempts_exhausted"}]);
    expect([...test.tasks.values()]).toContainEqual(expect.objectContaining({
      journeyStateId: welcome.id,
      kind: "permanent_delivery_failure",
      summaryCode: "attempts_exhausted",
    }));
  });
});
