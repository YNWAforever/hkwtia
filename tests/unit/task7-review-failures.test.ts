import {describe, expect, it, vi} from "vitest";

import {
  runCampaignBatch,
  type CampaignRecipientClaim,
  type CampaignRunnerDependencies,
} from "@/lib/automation/campaign-runner";
import {
  runJourneyBatch,
  type JourneyRunnerContext,
  type JourneyRunnerDependencies,
} from "@/lib/automation/journey-runner";
import {DeliveryFailure, type DeliveryFailureCode} from "@/lib/email/transport";
import type {StaffTaskInput} from "@/lib/db/repos/staff-tasks";
import type {JourneyState} from "@/lib/db/server-schema";

const now = new Date("2027-01-15T10:00:00.000Z");
const later = new Date(now.getTime() + 6 * 60_000);

type Mutable<T> = {-readonly [Key in keyof T]: T[Key]};
const membershipId = "22222222-2222-4222-8222-222222222222";
const campaignId = "11111111-1111-4111-8111-111111111111";

type JourneyClaim = JourneyState & Readonly<{claimSource: "scheduled" | "stale"}>;

function journeyClaim(
  overrides: Partial<JourneyClaim> = {},
): JourneyClaim {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    profileId: "review-member",
    membershipId,
    journey: "onboarding_90d",
    instanceKey: `activation:${membershipId}`,
    step: "welcome",
    scheduledAt: new Date(now.getTime() - 1_000),
    status: "processing",
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    deliveryKey: `journey:review-member:onboarding_90d:activation:${membershipId}:welcome`,
    errorCode: null,
    completedAt: null,
    createdAt: new Date(now.getTime() - 86_400_000),
    updatedAt: now,
    claimSource: "scheduled",
    ...overrides,
  };
}

function journeyContext(): JourneyRunnerContext {
  return {
    hasLoggedIn: false,
    profileCompleteness: 100,
    marketingConsent: true,
    emailSuppressed: false,
    whatsappOptIn: false,
    whatsappNumber: null,
    engagementScore: 50,
    email: "review-member@example.test",
    recipientName: "Review Member",
    locale: "en",
    variables: {ctaUrl: "https://example.test/member"},
    unsubscribeUrl: null,
    membershipStatus: "active",
  };
}

function failedJourneyHarness(
  claim: JourneyClaim,
  code: DeliveryFailureCode,
) {
  const events: string[] = [];
  const provider = vi.fn(async () => {
    events.push("provider");
    throw new DeliveryFailure(code);
  });
  const retryEmailFailure = vi.fn(async () => {
    events.push("delivery-reopen");
    return {
      id: "email-log-1",
      status: "processing" as const,
      idempotencyKey: claim.deliveryKey,
      providerId: null,
      errorCode: null,
      attemptCount: 2,
    };
  });
  const reschedule = vi.fn(async () => {
    events.push("reschedule");
    return claim;
  });
  const terminalTasks = new Set<string>();
  const markFailed = vi.fn(async (...args: unknown[]) => {
    const task = args[5] as StaffTaskInput;
    const taskDisposition = terminalTasks.has(task.dedupeKey)
      ? "existing" as const
      : "created" as const;
    if (taskDisposition === "created") terminalTasks.add(task.dedupeKey);
    events.push("mark-failed-with-task");
    return {
      record: claim,
      taskDisposition,
    };
  });
  const createOnce = vi.fn(async (_actor, input) => {
    events.push("task");
    return {
      record: {...input, id: "task-1", status: "open" as const},
      disposition: "created" as const,
    };
  });
  let claimed = false;
  const dependencies = {
    journeys: {
      claimDue: vi.fn(async () => claimed ? [] : (claimed = true, [claim])),
      markSent: vi.fn(async () => claim),
      markSkipped: vi.fn(async () => claim),
      reschedule,
      markFailed,
    },
    deliveries: {
      reserveEmail: vi.fn(async () => ({
        record: {
          id: "email-log-1",
          status: "failed" as const,
          idempotencyKey: claim.deliveryKey,
          providerId: null,
          errorCode: code,
          attemptCount: 1,
        },
        disposition: "existing" as const,
      })),
      retryEmailFailure,
      completeEmail: vi.fn(async () => ({
        id: "email-log-1",
        status: "failed" as const,
        idempotencyKey: claim.deliveryKey,
        providerId: null,
        errorCode: code,
        attemptCount: 1,
      })),
      reserveWhatsapp: vi.fn(async () => {
        throw new Error("unexpected WhatsApp reservation");
      }),
      retryWhatsappFailure: vi.fn(async () => {
        throw new Error("unexpected WhatsApp retry");
      }),
      completeWhatsapp: vi.fn(async () => {
        throw new Error("unexpected WhatsApp completion");
      }),
    },
    staffTasks: {createOnce},
    memberships: {
      lapseDunningEpisode: vi.fn(async () => ({
        disposition: "resolved" as const,
        createdTasks: 0,
        createdSteps: 0,
      })),
    },
    loadContext: vi.fn(async () => journeyContext()),
    renderEmail: vi.fn(async () => ({
      subject: "Welcome",
      html: "<p>Welcome</p>",
      text: "Welcome",
      headers: {},
    })),
    emailTransport: {send: provider},
    whatsappTransport: {
      sendTemplateMessage: vi.fn(async () => {
        throw new Error("unexpected WhatsApp send");
      }),
    },
    emailFrom: "WTIA <members@example.test>",
  } as unknown as JourneyRunnerDependencies;
  return {
    createOnce,
    dependencies,
    events,
    markFailed,
    provider,
    reschedule,
    retryEmailFailure,
  };
}

function campaignClaim(
  overrides: Partial<CampaignRecipientClaim> = {},
): CampaignRecipientClaim {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    campaignId,
    profileId: "campaign-review-member",
    email: "frozen@example.test",
    locale: "zh-HK",
    variables: {displayName: "Frozen Member", ctaUrl: "https://example.test/frozen"},
    template: "renewal-reminder",
    status: "processing",
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    errorCode: null,
    claimSource: "queued",
    ...overrides,
  } as CampaignRecipientClaim;
}

function campaignBaseDependencies(
  claims: readonly CampaignRecipientClaim[],
) {
  let claimIndex = 0;
  const tasks = new Map<string, unknown>();
  const markRecipientFailed = vi.fn(async (...args: unknown[]) => {
    const input = args[4] as StaffTaskInput;
    const taskDisposition = tasks.has(input.dedupeKey)
      ? "existing" as const
      : "created" as const;
    if (taskDisposition === "created") tasks.set(input.dedupeKey, input);
    return {
      record: {},
      taskDisposition,
    };
  });
  const rescheduleRecipient = vi.fn(async () => ({}));
  const provider = vi.fn(async (input) => ({
    status: "sent" as const,
    providerId: `provider-${input.idempotencyKey}`,
  }));
  const reserveEmail = vi.fn(async (_actor, input) => ({
    record: {
      id: "campaign-email-log-1",
      status: "processing" as const,
      idempotencyKey: input.idempotencyKey,
      providerId: null,
      errorCode: null,
      attemptCount: 1,
    },
    disposition: "created" as const,
  }));
  const createOnce = vi.fn(async (_actor, input) => {
    const disposition = tasks.has(input.dedupeKey) ? "existing" as const : "created" as const;
    tasks.set(input.dedupeKey, input);
    return {
      record: {...input, id: "campaign-task-1", status: "open" as const},
      disposition,
    };
  });
  const dependencies = {
    campaigns: {
      claimRecipients: vi.fn(async () => claims[claimIndex] ? [claims[claimIndex++]!] : []),
      markRecipientSent: vi.fn(async () => ({})),
      markRecipientSuppressed: vi.fn(async () => ({})),
      rescheduleRecipient,
      markRecipientFailed,
      completeCampaignIfIdle: vi.fn(async () => true),
    },
    deliveries: {
      reserveEmail,
      retryEmailFailure: vi.fn(async () => ({
        id: "campaign-email-log-1",
        status: "processing" as const,
        idempotencyKey: `campaign:${campaignId}:recipient:email`,
        providerId: null,
        errorCode: null,
        attemptCount: 2,
      })),
      completeEmail: vi.fn(async (_actor, _id, completion) => ({
        id: "campaign-email-log-1",
        status: completion.status,
        idempotencyKey: `campaign:${campaignId}:recipient:email`,
        providerId: completion.providerId ?? null,
        errorCode: completion.status === "failed" ? completion.errorCode : null,
        attemptCount: 1,
      })),
    },
    staffTasks: {createOnce},
    loadContext: vi.fn(async () => ({
      marketingConsent: true,
      emailSuppressed: false,
      unsubscribeUrl: "https://example.test/unsubscribe?token=current",
    })),
    renderCampaign: vi.fn(async () => ({
      subject: "Campaign",
      html: "<p>Campaign</p>",
      text: "Campaign",
      headers: {},
    })),
    emailTransport: {send: provider},
    emailFrom: "WTIA <members@example.test>",
  } as unknown as CampaignRunnerDependencies;
  return {
    createOnce,
    dependencies,
    markRecipientFailed,
    provider,
    reserveEmail,
    rescheduleRecipient,
    tasks,
  };
}

describe("Task 7 review: provider-failure crash recovery", () => {
  it("replays a permanent journey failure without another provider call and settles task plus terminal state atomically", async () => {
    const claim = journeyClaim({
      attemptCount: 2,
      claimedAt: later,
      claimSource: "stale",
    });
    const test = failedJourneyHarness(claim, "provider_client_error");

    const summary = await runJourneyBatch(test.dependencies, {now: later, limit: 1});

    expect(summary).toMatchObject({failed: 1, retried: 0, tasksCreated: 1});
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.retryEmailFailure).not.toHaveBeenCalled();
    expect(test.events).toEqual(["mark-failed-with-task"]);
    expect(test.createOnce).not.toHaveBeenCalled();
  });

  it("replays a retryable journey failure at second-attempt 25 minute backoff without provider I/O", async () => {
    const claim = journeyClaim({
      attemptCount: 2,
      claimedAt: later,
      claimSource: "stale",
    });
    const test = failedJourneyHarness(claim, "retryable_server");

    const summary = await runJourneyBatch(test.dependencies, {now: later, limit: 1});

    expect(summary).toMatchObject({failed: 0, retried: 1});
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.retryEmailFailure).not.toHaveBeenCalled();
    expect(test.reschedule).toHaveBeenCalledWith(
      expect.anything(),
      claim.id,
      later,
      new Date(later.getTime() + 25 * 60_000),
      "retryable_server",
    );
  });

  it("keeps a journey recoverable when atomic task creation fails, then retries without duplication", async () => {
    const first = journeyClaim({attemptCount: 3});
    const second = journeyClaim({
      attemptCount: 3,
      claimedAt: later,
      claimSource: "stale",
    });
    let batch = 0;
    const taskInputs: StaffTaskInput[] = [];
    const terminalTasks = new Set<string>();
    const markFailed = vi.fn(async (...args: unknown[]) => {
      const input = args[5] as StaffTaskInput;
      taskInputs.push(input);
      if (taskInputs.length === 1) throw new Error("task store unavailable");
      const taskDisposition = terminalTasks.has(input.dedupeKey)
        ? "existing" as const
        : "created" as const;
      if (taskDisposition === "created") terminalTasks.add(input.dedupeKey);
      return {
        record: second,
        taskDisposition,
      };
    });
    const createOnce = vi.fn(async () => {
      throw new Error("unexpected standalone permanent task write");
    });
    const dependencies = {
      journeys: {
        claimDue: vi.fn(async () => batch++ === 0 ? [first] : [second]),
        markSent: vi.fn(),
        markSkipped: vi.fn(),
        reschedule: vi.fn(),
        markFailed,
      },
      deliveries: {
        reserveEmail: vi.fn(),
        retryEmailFailure: vi.fn(),
        completeEmail: vi.fn(),
        reserveWhatsapp: vi.fn(),
        retryWhatsappFailure: vi.fn(),
        completeWhatsapp: vi.fn(),
      },
      staffTasks: {createOnce},
      memberships: {lapseDunningEpisode: vi.fn()},
      loadContext: vi.fn(async () => journeyContext()),
      renderEmail: vi.fn(async () => {
        throw new DeliveryFailure("provider_client_error");
      }),
      emailTransport: {send: vi.fn()},
      whatsappTransport: {sendTemplateMessage: vi.fn()},
      emailFrom: "WTIA <members@example.test>",
    } as unknown as JourneyRunnerDependencies;

    await expect(runJourneyBatch(dependencies, {now, limit: 1}))
      .rejects.toThrow("task store unavailable");
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(terminalTasks.size).toBe(0);

    await expect(runJourneyBatch(dependencies, {now: later, limit: 1}))
      .resolves.toMatchObject({failed: 1, tasksCreated: 1});
    expect(markFailed).toHaveBeenCalledTimes(2);
    expect(createOnce).not.toHaveBeenCalled();
    expect(taskInputs.map((input) => input.dedupeKey)).toEqual([
      `${first.deliveryKey}:permanent_delivery_failure`,
      `${first.deliveryKey}:permanent_delivery_failure`,
    ]);
    expect(terminalTasks.size).toBe(1);
  });

  it("replays retryable campaign failure with 25 minute backoff and no second provider call", async () => {
    const claim = campaignClaim({
      attemptCount: 2,
      claimedAt: later,
      claimSource: "stale",
    });
    const test = campaignBaseDependencies([claim]);
    (test.dependencies.deliveries as Mutable<CampaignRunnerDependencies["deliveries"]>).reserveEmail = vi.fn(async () => ({
      record: {
        id: "campaign-email-log-1",
        status: "failed" as const,
        idempotencyKey: `campaign:${claim.campaignId}:${claim.id}:email`,
        providerId: null,
        errorCode: "retryable_server" as const,
        attemptCount: 1,
      },
      disposition: "existing" as const,
    }));

    const summary = await runCampaignBatch(test.dependencies, {now: later, limit: 1});

    expect(summary).toMatchObject({failed: 0, retried: 1});
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.rescheduleRecipient).toHaveBeenCalledWith(
      expect.anything(),
      claim.id,
      later,
      new Date(later.getTime() + 25 * 60_000),
      "retryable_server",
    );
  });
});

describe("Task 7 review: campaign task durability and template identity", () => {
  it("maps a frozen source selection to campaign_generic for render and delivery logging", async () => {
    const claim = campaignClaim({template: "renewal-reminder"});
    const test = campaignBaseDependencies([claim]);
    let claimActorSource: string | undefined;
    (test.dependencies.campaigns as Mutable<CampaignRunnerDependencies["campaigns"]>).claimRecipients = vi.fn(async (actor) => {
      claimActorSource = "source" in actor ? actor.source : undefined;
      return [claim];
    });

    await runCampaignBatch(test.dependencies, {now, limit: 1});

    expect(claimActorSource).toBe("automation-cron");
    expect(test.dependencies.renderCampaign).toHaveBeenCalledWith({
      sourceTemplate: "renewal-reminder",
      template: "campaign_generic",
      locale: claim.locale,
      variables: claim.variables,
      unsubscribeUrl: "https://example.test/unsubscribe?token=current",
    });
    expect(test.reserveEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({template: "campaign_generic"}),
    );
  });

  it("rejects an unknown frozen source before render, reservation, or provider I/O", async () => {
    const claim = campaignClaim({template: "unknown-source"});
    const test = campaignBaseDependencies([claim]);

    const summary = await runCampaignBatch(test.dependencies, {now, limit: 1});

    expect(summary).toMatchObject({failed: 1, sent: 0, tasksCreated: 1});
    expect(test.dependencies.renderCampaign).not.toHaveBeenCalled();
    expect(test.reserveEmail).not.toHaveBeenCalled();
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.markRecipientFailed).toHaveBeenCalledTimes(1);
  });

  it("keeps a campaign recipient recoverable when its permanent task write fails", async () => {
    const first = campaignClaim();
    const second = campaignClaim({
      attemptCount: 2,
      claimedAt: later,
      claimSource: "stale",
    });
    const test = campaignBaseDependencies([first, second]);
    const providerCalls: string[] = [];
    test.dependencies.emailTransport.send = vi.fn(async (input) => {
      providerCalls.push(input.idempotencyKey);
      throw new DeliveryFailure("provider_client_error");
    });
    let taskAttempts = 0;
    test.markRecipientFailed.mockImplementation(async (...args: unknown[]) => {
      const input = args[4] as StaffTaskInput;
      taskAttempts += 1;
      if (taskAttempts === 1) throw new Error("task store unavailable");
      const taskDisposition = test.tasks.has(input.dedupeKey)
        ? "existing" as const
        : "created" as const;
      if (taskDisposition === "created") test.tasks.set(input.dedupeKey, input);
      return {
        record: {},
        taskDisposition,
      };
    });
    let deliveryStatus: "processing" | "failed" = "processing";
    (test.dependencies.deliveries as Mutable<CampaignRunnerDependencies["deliveries"]>).reserveEmail = vi.fn(async (_actor, input) => ({
      record: {
        id: "campaign-email-log-1",
        status: deliveryStatus,
        idempotencyKey: input.idempotencyKey,
        providerId: null,
        errorCode: deliveryStatus === "failed" ? "provider_client_error" : null,
        attemptCount: 1,
      },
      disposition: deliveryStatus === "failed" ? "existing" as const : "created" as const,
    }));
    (test.dependencies.deliveries as Mutable<CampaignRunnerDependencies["deliveries"]>).completeEmail = vi.fn(async (_actor, _id, completion) => {
      deliveryStatus = completion.status;
      return {
        id: "campaign-email-log-1",
        status: deliveryStatus,
        idempotencyKey: `campaign:${campaignId}:${first.id}:email`,
        providerId: null,
        errorCode: completion.status === "failed" ? completion.errorCode : null,
        attemptCount: 1,
      };
    });

    await expect(runCampaignBatch(test.dependencies, {now, limit: 1}))
      .rejects.toThrow("task store unavailable");
    expect(test.markRecipientFailed).toHaveBeenCalledTimes(1);
    expect(test.tasks.size).toBe(0);

    await expect(runCampaignBatch(test.dependencies, {now: later, limit: 1}))
      .resolves.toMatchObject({failed: 1, tasksCreated: 1});
    expect(providerCalls).toEqual([
      `campaign:${campaignId}:${first.id}:email`,
    ]);
    expect(test.markRecipientFailed).toHaveBeenCalledTimes(2);
    expect(test.createOnce).not.toHaveBeenCalled();
    expect(test.tasks.size).toBe(1);
  });
});
