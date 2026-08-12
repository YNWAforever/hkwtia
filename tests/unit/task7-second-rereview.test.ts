import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  runCampaignBatch,
  type CampaignRunnerDependencies,
} from "@/lib/automation/campaign-runner";
import {
  runJourneyBatch,
  type JourneyRunnerDependencies,
} from "@/lib/automation/journey-runner";
import {createCampaignRecipientDeliveryRepository} from "@/lib/db/repos/campaign-recipient-delivery";
import {
  createJourneysRepository,
  type AutomationDatabase,
  type AutomationSqlExecutor,
  type JourneyClaim,
} from "@/lib/db/repos/journeys";
import type {StaffTaskInput} from "@/lib/db/repos/staff-tasks";
import {DeliveryFailure} from "@/lib/email/transport";

const dialect = new PgDialect();
const now = new Date("2027-01-15T10:00:00.000Z");
const later = new Date(now.getTime() + 10 * 60_000);
const journeyId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const recipientId = "33333333-3333-4333-8333-333333333333";
const admin = {
  kind: "staff",
  userId: "auth-staff",
  profileId: "staff-1",
} as const;
const cronActor = {
  kind: "system",
  userId: null,
  source: "automation-cron",
} as const;
const deliveryKey =
  "journey:member-1:onboarding_90d:activation:member-1:welcome";

function journeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: journeyId,
    profile_id: "member-1",
    membership_id: null,
    journey: "onboarding_90d",
    instance_key: "activation:member-1",
    step: "welcome",
    scheduled_at: now,
    status: "processing",
    attempt_count: 1,
    claimed_at: now,
    claim_expires_at: new Date(now.getTime() + 300_000),
    delivery_key: deliveryKey,
    error_code: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    prior_status: "scheduled",
    ...overrides,
  };
}

function journeyClaim(
  overrides: Partial<JourneyClaim> = {},
): JourneyClaim {
  return {
    id: journeyId,
    profileId: "member-1",
    membershipId: null,
    journey: "onboarding_90d",
    instanceKey: "activation:member-1",
    step: "welcome",
    scheduledAt: now,
    status: "processing",
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    deliveryKey,
    errorCode: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    claimSource: "scheduled",
    emailErrorCode: null,
    whatsappErrorCode: null,
    ...overrides,
  };
}

function campaignClaim(template = "renewal-reminder") {
  return {
    id: recipientId,
    campaignId,
    profileId: "member-1",
    email: "member-1@fixture.example.test",
    locale: "en" as const,
    variables: {displayName: "Fixture Member"},
    template,
    status: "processing" as const,
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    errorCode: null,
    claimSource: "queued" as const,
  };
}

function sequenceDatabase(responses: unknown[][]) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  let transactions = 0;
  const execute = async (
    query: Parameters<AutomationSqlExecutor["execute"]>[0],
  ) => {
    commands.push(dialect.sqlToQuery(query));
    return {rows: responses.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => {
      transactions += 1;
      return work({execute});
    },
  };
  return {commands, database, transactions: () => transactions};
}

function normalizedSql(
  command: ReturnType<PgDialect["sqlToQuery"]>,
): string {
  return command.sql.replace(/\s+/g, " ").trim();
}

function permanentJourneyDependencies(
  claim: JourneyClaim,
  tasks: StaffTaskInput[],
): JourneyRunnerDependencies {
  return {
    journeys: {
      claimDue: vi.fn(async () => [claim]),
      markSent: vi.fn(),
      markSkipped: vi.fn(),
      reschedule: vi.fn(),
      markFailed: vi.fn(async () => {
        throw new Error("INVALID_TRANSITION");
      }),
    },
    deliveries: {
      reserveEmail: vi.fn(),
      retryEmailFailure: vi.fn(),
      completeEmail: vi.fn(),
      reserveWhatsapp: vi.fn(),
      retryWhatsappFailure: vi.fn(),
      completeWhatsapp: vi.fn(),
    },
    staffTasks: {
      createOnce: vi.fn(async (_actor, task) => {
        tasks.push(task);
        return {
          record: {...task, id: "task-1", status: "open" as const},
          disposition: "created" as const,
        };
      }),
    },
    memberships: {lapseDunningEpisode: vi.fn()},
    loadContext: vi.fn(async () => ({
      hasLoggedIn: false,
      profileCompleteness: 100,
      marketingConsent: true,
      emailSuppressed: false,
      whatsappOptIn: false,
      whatsappNumber: null,
      engagementScore: 50,
      email: "member-1@fixture.example.test",
      recipientName: "Fixture Member",
      locale: "en" as const,
      variables: {
        ctaUrl: "https://example.test/member",
        memberName: "Fixture Member",
        renewalDate: "2027-02-01",
        renewalUrl: "https://example.test/renew",
        amountDue: "HKD 100",
        paymentUrl: "https://example.test/pay",
      },
      unsubscribeUrl: "https://example.test/unsubscribe",
      unsubscribeOneClickUrl: "https://example.test/api/unsubscribe",
      membershipStatus: null,
    })),
    renderEmail: vi.fn(async () => {
      throw new DeliveryFailure("provider_client_error");
    }),
    emailTransport: {send: vi.fn()},
    whatsappTransport: {sendTemplateMessage: vi.fn()},
    emailFrom: "WTIA <members@example.test>",
  } as unknown as JourneyRunnerDependencies;
}

function permanentCampaignDependencies(
  tasks: StaffTaskInput[],
): CampaignRunnerDependencies {
  const claim = campaignClaim("unknown-source");
  return {
    campaigns: {
      claimRecipients: vi.fn(async () => [claim]),
      markRecipientSent: vi.fn(),
      markRecipientSuppressed: vi.fn(),
      rescheduleRecipient: vi.fn(),
      markRecipientFailed: vi.fn(async () => {
        throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
      }),
      completeCampaignIfIdle: vi.fn(async () => false),
    },
    deliveries: {
      reserveEmail: vi.fn(),
      retryEmailFailure: vi.fn(),
      completeEmail: vi.fn(),
    },
    staffTasks: {
      createOnce: vi.fn(async (_actor, task) => {
        tasks.push(task);
        return {
          record: {...task, id: "task-1", status: "open" as const},
          disposition: "created" as const,
        };
      }),
    },
    loadContext: vi.fn(async () => ({
      marketingConsent: true,
      emailSuppressed: false,
      unsubscribeUrl: "https://example.test/unsubscribe",
      unsubscribeOneClickUrl: "https://example.test/api/unsubscribe",
    })),
    renderCampaign: vi.fn(),
    emailTransport: {send: vi.fn()},
    emailFrom: "WTIA <members@example.test>",
  } as unknown as CampaignRunnerDependencies;
}

describe("Task 7 second re-review: atomic terminal task transitions", () => {
  it("does not leave a journey task when a newer worker owns the terminal transition", async () => {
    const tasks: StaffTaskInput[] = [];
    const dependencies = permanentJourneyDependencies(
      journeyClaim({attemptCount: 3}),
      tasks,
    );

    const summary = await runJourneyBatch(dependencies, {now, limit: 1});

    expect(summary).toMatchObject({stale: 1, tasksCreated: 0});
    expect(tasks).toEqual([]);
  });

  it("does not leave a campaign task when a newer worker owns the terminal transition", async () => {
    const tasks: StaffTaskInput[] = [];
    const dependencies = permanentCampaignDependencies(tasks);

    const summary = await runCampaignBatch(dependencies, {now, limit: 1});

    expect(summary).toMatchObject({stale: 1, tasksCreated: 0});
    expect(tasks).toEqual([]);
  });

  it("transitions a journey and creates its deduplicated task in one transaction", async () => {
    const task: StaffTaskInput = {
      profileId: "member-1",
      journeyStateId: journeyId,
      kind: "permanent_delivery_failure",
      dedupeKey: `${deliveryKey}:permanent_delivery_failure`,
      summaryCode: "attempts_exhausted",
    };
    const fake = sequenceDatabase([
      [journeyRow({status: "failed", error_code: "attempts_exhausted"})],
      [{id: "task-1"}],
    ]);
    const repository = createJourneysRepository(async () => fake.database);
    const markFailed = repository.markFailed as unknown as (
      actor: typeof cronActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
      completedAt: Date,
      task: StaffTaskInput,
    ) => Promise<unknown>;

    const result = await markFailed(
      cronActor,
      journeyId,
      now,
      "attempts_exhausted",
      now,
      task,
    );

    expect(fake.transactions()).toBe(1);
    expect(fake.commands.map(normalizedSql)).toEqual([
      expect.stringMatching(
        /UPDATE "journey_state".*status = 'failed'.*status = 'processing'.*claimed_at =/i,
      ),
      expect.stringMatching(
        /INSERT INTO "staff_tasks".*ON CONFLICT DO NOTHING.*RETURNING/i,
      ),
    ]);
    expect(result).toMatchObject({
      record: {id: journeyId, status: "failed"},
      taskDisposition: "created",
    });
  });

  it("stops before inserting a journey task when the claim token is stale", async () => {
    const fake = sequenceDatabase([[]]);
    const repository = createJourneysRepository(async () => fake.database);
    const markFailed = repository.markFailed as unknown as (
      actor: typeof cronActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
      completedAt: Date,
      task: StaffTaskInput,
    ) => Promise<unknown>;

    await expect(markFailed(
      cronActor,
      journeyId,
      now,
      "attempts_exhausted",
      now,
      {
        profileId: "member-1",
        journeyStateId: journeyId,
        kind: "permanent_delivery_failure",
        dedupeKey: `${deliveryKey}:permanent_delivery_failure`,
        summaryCode: "attempts_exhausted",
      },
    )).rejects.toMatchObject({code: "INVALID_TRANSITION"});
    expect(fake.transactions()).toBe(1);
    expect(fake.commands).toHaveLength(1);
    expect(normalizedSql(fake.commands[0]!)).not.toMatch(
      /INSERT INTO "staff_tasks"/i,
    );
  });

  it("transitions a campaign recipient and creates its task in one transaction", async () => {
    const fake = sequenceDatabase([
      [{
        id: recipientId,
        campaign_id: campaignId,
        profile_id: "member-1",
        status: "failed",
        template: "renewal-reminder",
      }],
      [{id: "task-1"}],
    ]);
    const repository = createCampaignRecipientDeliveryRepository(
      async () => fake.database,
    );
    const markFailed = repository.markRecipientFailed as unknown as (
      actor: typeof cronActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
      task: StaffTaskInput,
    ) => Promise<unknown>;

    const result = await markFailed(
      cronActor,
      recipientId,
      now,
      "provider_client_error",
      {
        profileId: "member-1",
        journeyStateId: null,
        kind: "permanent_campaign_delivery_failure",
        dedupeKey:
          `campaign:${campaignId}:${recipientId}:email:permanent_delivery_failure`,
        summaryCode: "provider_client_error",
      },
    );

    expect(fake.transactions()).toBe(1);
    expect(fake.commands.map(normalizedSql)).toEqual([
      expect.stringMatching(
        /UPDATE "campaign_recipients".*status = 'failed'.*status = 'processing'.*claimed_at =/i,
      ),
      expect.stringMatching(
        /INSERT INTO "staff_tasks".*ON CONFLICT DO NOTHING.*RETURNING/i,
      ),
    ]);
    expect(result).toMatchObject({
      taskDisposition: "created",
    });
  });

  it("stops before inserting a campaign task when the claim token is stale", async () => {
    const fake = sequenceDatabase([[]]);
    const repository = createCampaignRecipientDeliveryRepository(
      async () => fake.database,
    );
    const markFailed = repository.markRecipientFailed as unknown as (
      actor: typeof cronActor,
      id: string,
      claimedAt: Date,
      errorCode: string,
      task: StaffTaskInput,
    ) => Promise<unknown>;

    await expect(markFailed(
      cronActor,
      recipientId,
      now,
      "provider_client_error",
      {
        profileId: "member-1",
        journeyStateId: null,
        kind: "permanent_campaign_delivery_failure",
        dedupeKey:
          `campaign:${campaignId}:${recipientId}:email:permanent_delivery_failure`,
        summaryCode: "provider_client_error",
      },
    )).rejects.toThrow("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
    expect(fake.transactions()).toBe(1);
    expect(fake.commands).toHaveLength(1);
    expect(normalizedSql(fake.commands[0]!)).not.toMatch(
      /INSERT INTO "staff_tasks"/i,
    );
  });
});

describe("Task 7 second re-review: audited delivery retry authorization", () => {
  it("keeps permanent stale replay blocked, then audited admin retry authorizes exactly one provider call", async () => {
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    let auditWrites = 0;
    const delivery = {
      id: "email-log-1",
      status: "failed" as "processing" | "sent" | "failed",
      idempotencyKey: deliveryKey,
      providerId: null as string | null,
      errorCode: "provider_client_error" as string | null,
      attemptCount: 1,
    };
    const execute = async (
      query: Parameters<AutomationSqlExecutor["execute"]>[0],
    ) => {
      const command = dialect.sqlToQuery(query);
      const text = normalizedSql(command);
      commands.push(command);
      if (/UPDATE "journey_state".*status = 'scheduled'/i.test(text)) {
        return {
          rows: [journeyRow({
            status: "scheduled",
            claimed_at: null,
            claim_expires_at: null,
            error_code: null,
            completed_at: null,
          })],
        };
      }
      if (/UPDATE "email_log"/i.test(text)) {
        if (
          delivery.status === "failed"
          && delivery.errorCode === "provider_client_error"
        ) {
          delivery.errorCode = "admin_retry_provider_client_error";
        }
        return {rows: []};
      }
      if (/UPDATE "whatsapp_log"/i.test(text)) {
        return {rows: []};
      }
      if (/INSERT INTO "audit_events"/i.test(text)) {
        auditWrites += 1;
        return {rows: []};
      }
      throw new Error(`UNEXPECTED_SQL:${text}`);
    };
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work({execute}),
    };
    const repository = createJourneysRepository(async () => database);
    const provider = vi.fn(async () => ({
      status: "sent" as const,
      providerId: "provider-after-admin-retry",
    }));
    let currentClaim = journeyClaim({
      attemptCount: 2,
      claimedAt: later,
      claimSource: "stale",
    });
    const dependencies = {
      journeys: {
        claimDue: vi.fn(async () => [currentClaim]),
        markSent: vi.fn(async () => currentClaim),
        markSkipped: vi.fn(),
        reschedule: vi.fn(),
        markFailed: vi.fn(async () => ({
          record: currentClaim,
          taskDisposition: "existing" as const,
        })),
      },
      deliveries: {
        reserveEmail: vi.fn(async () => ({
          record: {...delivery},
          disposition: "existing" as const,
        })),
        retryEmailFailure: vi.fn(async (_actor, _id, errorCode) => {
          if (delivery.status !== "failed" || delivery.errorCode !== errorCode) {
            throw new Error("INVALID_DELIVERY_RETRY");
          }
          delivery.status = "processing";
          delivery.providerId = null;
          delivery.errorCode = null;
          delivery.attemptCount += 1;
          return {
            record: {...delivery},
            failureCode: "provider_client_error" as const,
          };
        }),
        completeEmail: vi.fn(async (_actor, _id, completion) => {
          delivery.status = completion.status;
          delivery.providerId = completion.providerId ?? null;
          delivery.errorCode =
            completion.status === "failed" ? completion.errorCode : null;
          return {...delivery};
        }),
        reserveWhatsapp: vi.fn(),
        retryWhatsappFailure: vi.fn(),
        completeWhatsapp: vi.fn(),
      },
      staffTasks: {
        createOnce: vi.fn(async (_actor, task) => ({
          record: {...task, id: "task-1", status: "open" as const},
          disposition: "existing" as const,
        })),
      },
      memberships: {lapseDunningEpisode: vi.fn()},
      loadContext: vi.fn(async () => ({
        hasLoggedIn: false,
        profileCompleteness: 100,
        marketingConsent: true,
        emailSuppressed: false,
        whatsappOptIn: false,
        whatsappNumber: null,
        engagementScore: 50,
        email: "member-1@fixture.example.test",
        recipientName: "Fixture Member",
        locale: "en" as const,
        variables: {
          ctaUrl: "https://example.test/member",
          memberName: "Fixture Member",
          renewalDate: "2027-02-01",
          renewalUrl: "https://example.test/renew",
          amountDue: "HKD 100",
          paymentUrl: "https://example.test/pay",
        },
        unsubscribeUrl: "https://example.test/unsubscribe",
        unsubscribeOneClickUrl: "https://example.test/api/unsubscribe",
        membershipStatus: null,
      })),
      renderEmail: vi.fn(async () => ({
        subject: "Welcome",
        html: "<p>Welcome</p>",
        text: "Welcome",
        headers: {},
      })),
      emailTransport: {send: provider},
      whatsappTransport: {sendTemplateMessage: vi.fn()},
      emailFrom: "WTIA <members@example.test>",
    } as unknown as JourneyRunnerDependencies;

    await runJourneyBatch(dependencies, {now: later, limit: 1});
    expect(provider).not.toHaveBeenCalled();

    await repository.retryFailed(admin, journeyId, later);
    expect(delivery).toMatchObject({
      status: "failed",
      attemptCount: 1,
      errorCode: "admin_retry_provider_client_error",
    });
    currentClaim = journeyClaim({
      attemptCount: 3,
      claimedAt: new Date(later.getTime() + 1_000),
      claimSource: "scheduled",
      emailErrorCode: "admin_retry_provider_client_error",
    });
    await runJourneyBatch(dependencies, {
      now: currentClaim.claimedAt!,
      limit: 1,
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(dependencies.deliveries.retryEmailFailure).toHaveBeenCalledTimes(1);
    expect(delivery).toMatchObject({
      status: "sent",
      attemptCount: 2,
      providerId: "provider-after-admin-retry",
    });
    expect(auditWrites).toBe(1);
    expect(commands).toHaveLength(4);
    expect(normalizedSql(commands[0]!)).toMatch(/UPDATE "journey_state".*status = 'scheduled'/i);
    expect(commands[0]!.params).not.toContain("admin_retry_authorized");
    expect(normalizedSql(commands[1]!)).toMatch(/UPDATE "email_log".*SET error_code = CASE/i);
    expect(commands[1]!.params).toContain("admin_retry_provider_client_error");
    expect(normalizedSql(commands[2]!)).toMatch(/UPDATE "whatsapp_log".*SET error_code = CASE/i);
    expect(normalizedSql(commands[3]!)).toMatch(
      /INSERT INTO "audit_events".*journey\.failed_retry_requested/i,
    );
  });
});

describe("Task 7 second re-review: seeded campaign source identity", () => {
  it("maps the actual M2 membership_renewal source to campaign_generic", async () => {
    const claim = campaignClaim("membership_renewal");
    const renderCampaign = vi.fn(async () => ({
      subject: "Renewal",
      html: "<p>Renewal</p>",
      text: "Renewal",
      headers: {},
    }));
    const provider = vi.fn(async () => ({
      status: "sent" as const,
      providerId: "provider-seeded-campaign",
    }));
    const dependencies = {
      campaigns: {
        claimRecipients: vi.fn(async () => [claim]),
        markRecipientSent: vi.fn(async () => ({})),
        markRecipientSuppressed: vi.fn(),
        rescheduleRecipient: vi.fn(),
        markRecipientFailed: vi.fn(async () => ({
          record: {},
          taskDisposition: "created" as const,
        })),
        completeCampaignIfIdle: vi.fn(async () => true),
      },
      deliveries: {
        reserveEmail: vi.fn(async (_actor, input) => ({
          record: {
            id: "campaign-email-1",
            status: "processing" as const,
            idempotencyKey: input.idempotencyKey,
            providerId: null,
            errorCode: null,
            attemptCount: 1,
          },
          disposition: "created" as const,
        })),
        retryEmailFailure: vi.fn(),
        completeEmail: vi.fn(async (_actor, _id, completion) => ({
          id: "campaign-email-1",
          status: completion.status,
          idempotencyKey: `campaign:${campaignId}:${recipientId}:email`,
          providerId: completion.providerId ?? null,
          errorCode:
            completion.status === "failed" ? completion.errorCode : null,
          attemptCount: 1,
        })),
      },
      staffTasks: {
        createOnce: vi.fn(async (_actor, task) => ({
          record: {...task, id: "task-1", status: "open" as const},
          disposition: "created" as const,
        })),
      },
      loadContext: vi.fn(async () => ({
        marketingConsent: true,
        emailSuppressed: false,
        unsubscribeUrl: "https://example.test/unsubscribe",
        unsubscribeOneClickUrl: "https://example.test/api/unsubscribe",
      })),
      renderCampaign,
      emailTransport: {send: provider},
      emailFrom: "WTIA <members@example.test>",
    } as unknown as CampaignRunnerDependencies;

    const summary = await runCampaignBatch(dependencies, {now, limit: 1});

    expect(summary).toMatchObject({sent: 1, failed: 0});
    expect(renderCampaign).toHaveBeenCalledWith(expect.objectContaining({
      sourceTemplate: "membership_renewal",
      template: "campaign_generic",
    }));
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
