import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  runJourneyBatch,
  type JourneyRunnerContext,
  type JourneyRunnerDependencies,
} from "@/lib/automation/journey-runner";
import {
  createJourneysRepository,
  type AutomationDatabase,
  type AutomationSqlExecutor,
  type JourneyClaim,
} from "@/lib/db/repos/journeys";
import {authorizedProviderFailureCode} from "@/lib/automation/delivery-retry-authorization";

const dialect = new PgDialect();
const now = new Date("2027-01-15T10:00:00.000Z");
const journeyId = "11111111-1111-4111-8111-111111111111";
const deliveryKey =
  "journey:member-1:renewal:renewal-cycle-1:renewal_14";
const auditedRetryMarker = "admin_retry_provider_client_error";
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

type DeliveryState = {
  id: string;
  channel: "email" | "whatsapp";
  status: "processing" | "sent" | "failed";
  idempotencyKey: string;
  providerId: string | null;
  errorCode: string | null;
  attemptCount: number;
};

function journeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: journeyId,
    profile_id: "member-1",
    membership_id: null,
    journey: "renewal",
    instance_key: "renewal-cycle-1",
    step: "renewal_14",
    scheduled_at: now,
    status: "failed",
    attempt_count: 1,
    claimed_at: null,
    claim_expires_at: null,
    delivery_key: deliveryKey,
    error_code: "provider_client_error",
    completed_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function claim(overrides: Partial<JourneyClaim> = {}): JourneyClaim {
  return {
    id: journeyId,
    profileId: "member-1",
    membershipId: null,
    journey: "renewal",
    instanceKey: "renewal-cycle-1",
    step: "renewal_14",
    scheduledAt: now,
    status: "processing",
    attemptCount: 2,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    deliveryKey,
    errorCode: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    claimSource: "scheduled",
    emailErrorCode: auditedRetryMarker,
    whatsappErrorCode: auditedRetryMarker,
    ...overrides,
  };
}

function context(
  overrides: Partial<JourneyRunnerContext> = {},
): JourneyRunnerContext {
  return {
    hasLoggedIn: true,
    profileCompleteness: 100,
    marketingConsent: true,
    emailSuppressed: false,
    whatsappOptIn: true,
    whatsappNumber: "+85260000000",
    engagementScore: 50,
    email: "member-1@example.test",
    recipientName: "Member One",
    locale: "en",
    variables: {
      ctaUrl: "https://example.test/member",
      memberName: "Member One",
      renewalDate: "2027-02-01",
      renewalUrl: "https://example.test/renew",
      amountDue: "HKD 100",
      paymentUrl: "https://example.test/pay",
    },
    unsubscribeUrl: "https://example.test/unsubscribe",
    membershipStatus: "active",
    ...overrides,
  };
}

function delivery(
  channel: "email" | "whatsapp",
  status: DeliveryState["status"],
  overrides: Partial<DeliveryState> = {},
): DeliveryState {
  return {
    id: `${channel}-log-1`,
    channel,
    status,
    idempotencyKey: channel === "email"
      ? deliveryKey
      : `${deliveryKey}:whatsapp`,
    providerId: status === "sent" ? `${channel}-provider-prior` : null,
    errorCode: status === "failed" ? "provider_client_error" : null,
    attemptCount: 1,
    ...overrides,
  };
}

function normalizedSql(
  query: Parameters<AutomationSqlExecutor["execute"]>[0],
) {
  const compiled = dialect.sqlToQuery(query);
  return {
    ...compiled,
    sql: compiled.sql.replace(/\s+/g, " ").trim(),
  };
}

function retryDatabase(deliveries: Map<string, DeliveryState>) {
  const commands: ReturnType<typeof normalizedSql>[] = [];
  let auditWrites = 0;
  const execute: AutomationSqlExecutor["execute"] = async (query) => {
    const command = normalizedSql(query);
    commands.push(command);
    if (/UPDATE "journey_state".*status = 'scheduled'/i.test(command.sql)) {
      return {
        rows: [journeyRow({
          status: "scheduled",
          scheduled_at: now,
          claimed_at: null,
          claim_expires_at: null,
          error_code: null,
          completed_at: null,
        })],
      };
    }
    if (/UPDATE "email_log"/i.test(command.sql)) {
      const record = deliveries.get(deliveryKey);
      if (record?.status === "failed" && record.errorCode === "provider_client_error") {
        record.errorCode = auditedRetryMarker;
      }
      return {rows: []};
    }
    if (/UPDATE "whatsapp_log"/i.test(command.sql)) {
      const record = deliveries.get(`${deliveryKey}:whatsapp`);
      if (record?.status === "failed" && record.errorCode === "provider_client_error") {
        record.errorCode = auditedRetryMarker;
      }
      return {rows: []};
    }
    if (/INSERT INTO "audit_events"/i.test(command.sql)) {
      auditWrites += 1;
      return {rows: []};
    }
    throw new Error(`UNEXPECTED_SQL:${command.sql}`);
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work({execute}),
  };
  return {
    auditWrites: () => auditWrites,
    commands,
    database,
  };
}

function runnerHarness(
  currentClaim: JourneyClaim,
  currentContext: JourneyRunnerContext,
  deliveries: Map<string, DeliveryState>,
) {
  const outcomes: string[] = [];
  const emailProvider = vi.fn(async () => ({
    status: "sent" as const,
    providerId: "email-provider-retry",
  }));
  const whatsappProvider = vi.fn(async () => ({
    status: "sent" as const,
    providerId: "whatsapp-provider-retry",
  }));
  const reserveEmail = vi.fn(async () => ({
    record: {...deliveries.get(deliveryKey)!},
    disposition: "existing" as const,
  }));
  const reserveWhatsapp = vi.fn(async () => ({
    record: {...deliveries.get(`${deliveryKey}:whatsapp`)!},
    disposition: "existing" as const,
  }));
  const retryEmailFailure = vi.fn(async (
    _actor,
    id: string,
    expectedErrorCode: string,
  ) => {
    const record = deliveries.get(deliveryKey)!;
    const failureCode = authorizedProviderFailureCode(expectedErrorCode);
    if (
      record.id !== id
      || record.status !== "failed"
      || record.errorCode !== expectedErrorCode
      || !failureCode
    ) {
      throw new Error("INVALID_DELIVERY_RETRY");
    }
    record.status = "processing";
    record.errorCode = null;
    record.providerId = null;
    record.attemptCount += 1;
    return {record: {...record}, failureCode};
  });
  const retryWhatsappFailure = vi.fn(async (
    _actor,
    id: string,
    expectedErrorCode: string,
  ) => {
    const record = deliveries.get(`${deliveryKey}:whatsapp`)!;
    const failureCode = authorizedProviderFailureCode(expectedErrorCode);
    if (
      record.id !== id
      || record.status !== "failed"
      || record.errorCode !== expectedErrorCode
      || !failureCode
    ) {
      throw new Error("INVALID_DELIVERY_RETRY");
    }
    record.status = "processing";
    record.errorCode = null;
    record.providerId = null;
    record.attemptCount += 1;
    return {record: {...record}, failureCode};
  });
  const dependencies = {
    journeys: {
      claimDue: vi.fn(async () => [currentClaim]),
      markSent: vi.fn(async () => {
        outcomes.push("sent");
        return currentClaim;
      }),
      markSkipped: vi.fn(async (_actor, _id, _claimedAt, reasonCode) => {
        outcomes.push(reasonCode);
        return currentClaim;
      }),
      reschedule: vi.fn(async () => currentClaim),
      markFailed: vi.fn(async () => ({
        record: currentClaim,
        taskDisposition: "created" as const,
      })),
    },
    deliveries: {
      reserveEmail,
      retryEmailFailure,
      completeEmail: vi.fn(async (_actor, id, completion) => {
        const record = deliveries.get(deliveryKey)!;
        if (record.id !== id) throw new Error("INVALID_DELIVERY_TRANSITION");
        record.status = completion.status;
        record.providerId = completion.providerId ?? null;
        record.errorCode = completion.status === "failed"
          ? completion.errorCode
          : null;
        return {...record};
      }),
      reserveWhatsapp,
      retryWhatsappFailure,
      completeWhatsapp: vi.fn(async (_actor, id, completion) => {
        const record = deliveries.get(`${deliveryKey}:whatsapp`)!;
        if (record.id !== id) throw new Error("INVALID_DELIVERY_TRANSITION");
        record.status = completion.status;
        record.providerId = completion.providerId ?? null;
        record.errorCode = completion.status === "failed"
          ? completion.errorCode
          : null;
        return {...record};
      }),
    },
    staffTasks: {
      createOnce: vi.fn(async (_actor, input) => ({
        record: {...input, id: "task-1", status: "open" as const},
        disposition: "created" as const,
      })),
    },
    memberships: {
      lapseDunningEpisode: vi.fn(async () => ({
        disposition: "resolved" as const,
        createdTasks: 0,
        createdSteps: 0,
      })),
    },
    loadContext: vi.fn(async () => currentContext),
    renderEmail: vi.fn(async (input) => ({
      subject: `${input.template}-subject`,
      html: `<p>${input.template}</p>`,
      text: input.template,
      headers: {},
    })),
    emailTransport: {send: emailProvider},
    whatsappTransport: {sendTemplateMessage: whatsappProvider},
    emailFrom: "WTIA <members@example.test>",
  } as unknown as JourneyRunnerDependencies;
  return {
    dependencies,
    emailProvider,
    outcomes,
    reserveEmail,
    reserveWhatsapp,
    retryEmailFailure,
    retryWhatsappFailure,
    whatsappProvider,
  };
}

async function authorizeAndRun(
  currentClaim: JourneyClaim,
  currentContext: JourneyRunnerContext,
  deliveries: Map<string, DeliveryState>,
) {
  const retryDb = retryDatabase(deliveries);
  const repository = createJourneysRepository(async () => retryDb.database);
  await repository.retryFailed(admin, journeyId, now);
  const runner = runnerHarness(currentClaim, currentContext, deliveries);
  const summary = await runJourneyBatch(runner.dependencies, {now, limit: 1});
  return {retryDb, runner, summary};
}

describe("Task 7 final re-review: lazy audited channel retry", () => {
  it("schedules and audits the parent while authorizing failed channels without reopening them", async () => {
    const deliveries = new Map([
      [deliveryKey, delivery("email", "failed")],
      [`${deliveryKey}:whatsapp`, delivery("whatsapp", "failed")],
    ]);
    const fake = retryDatabase(deliveries);
    const repository = createJourneysRepository(async () => fake.database);

    const result = await repository.retryFailed(admin, journeyId, now);

    expect(result).toMatchObject({
      status: "scheduled",
      errorCode: null,
    });
    expect(fake.commands).toHaveLength(4);
    expect(fake.commands[0]?.sql).toMatch(
      /UPDATE "journey_state".*status = 'scheduled'.*error_code = NULL/i,
    );
    expect(fake.commands[0]?.params).not.toContain(auditedRetryMarker);
    expect(fake.commands[1]?.sql).toMatch(/UPDATE "email_log".*SET error_code = CASE/i);
    expect(fake.commands[2]?.sql).toMatch(/UPDATE "whatsapp_log".*SET error_code = CASE/i);
    expect(fake.commands[1]?.params).toContain(auditedRetryMarker);
    expect(fake.commands[2]?.params).toContain(auditedRetryMarker);
    expect(fake.commands[3]?.sql).toMatch(
      /INSERT INTO "audit_events".*journey\.failed_retry_requested/i,
    );
    expect(fake.auditWrites()).toBe(1);
    expect([...deliveries.values()]).toEqual([
      expect.objectContaining({channel: "email", status: "failed", errorCode: auditedRetryMarker, attemptCount: 1}),
      expect.objectContaining({channel: "whatsapp", status: "failed", errorCode: auditedRetryMarker, attemptCount: 1}),
    ]);
  });

  it.each([
    ["scheduled", "scheduled", "scheduled"],
    ["expired processing", "processing", "stale"],
  ] as const)(
    "exposes channel authorization with ordinary claim source on %s parent",
    async (_label, priorStatus, expectedSource) => {
      const commands: ReturnType<typeof normalizedSql>[] = [];
      const execute: AutomationSqlExecutor["execute"] = async (query) => {
        commands.push(normalizedSql(query));
        return {
          rows: [journeyRow({
            status: "processing",
            claimed_at: now,
            claim_expires_at: new Date(now.getTime() + 300_000),
            error_code: null,
            completed_at: null,
            prior_status: priorStatus,
            email_error_code: auditedRetryMarker,
            whatsapp_error_code: auditedRetryMarker,
          })],
        };
      };
      const database: AutomationDatabase = {
        execute,
        transaction: async (work) => work({execute}),
      };

      const [claimed] = await createJourneysRepository(async () => database)
        .claimDue(cronActor, now, 1, 300_000);

      expect(claimed?.claimSource).toBe(expectedSource);
      expect(claimed?.emailErrorCode).toBe(auditedRetryMarker);
      expect(claimed?.whatsappErrorCode).toBe(auditedRetryMarker);
      expect(commands[0]?.sql).toMatch(/LEFT JOIN "email_log".*LEFT JOIN "whatsapp_log"/i);
      expect(commands[0]?.sql).toMatch(/RETURNING target\.\*, due\.prior_status, due\.email_error_code, due\.whatsapp_error_code/i);
    },
  );

  it("keeps a permanently failed WhatsApp log terminal when renewal retry is now opted out", async () => {
    const deliveries = new Map([
      [deliveryKey, delivery("email", "sent")],
      [`${deliveryKey}:whatsapp`, delivery("whatsapp", "failed")],
    ]);

    const test = await authorizeAndRun(
      claim(),
      context({whatsappOptIn: false, whatsappNumber: null}),
      deliveries,
    );

    expect(test.summary).toMatchObject({sent: 1, skipped: 0, failed: 0});
    expect(test.runner.outcomes).toEqual(["sent"]);
    expect(deliveries.get(`${deliveryKey}:whatsapp`)).toMatchObject({
      status: "failed",
      attemptCount: 1,
      errorCode: auditedRetryMarker,
    });
    expect(test.runner.reserveWhatsapp).not.toHaveBeenCalled();
    expect(test.runner.retryWhatsappFailure).not.toHaveBeenCalled();
    expect(test.runner.whatsappProvider).not.toHaveBeenCalled();
    expect(test.retryDb.auditWrites()).toBe(1);
  });

  it("leaves a failed marketing email terminal when current suppression skips the retry", async () => {
    const deliveries = new Map([
      [deliveryKey, delivery("email", "failed")],
    ]);

    const test = await authorizeAndRun(
      claim({
        journey: "onboarding_90d",
        instanceKey: "activation:member-1",
        step: "day1_video",
      }),
      context({emailSuppressed: true}),
      deliveries,
    );

    expect(test.summary).toMatchObject({sent: 0, skipped: 1, failed: 0});
    expect(test.runner.outcomes).toEqual(["skip_suppressed"]);
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "failed",
      attemptCount: 1,
    });
    expect(test.runner.reserveEmail).not.toHaveBeenCalled();
    expect(test.runner.retryEmailFailure).not.toHaveBeenCalled();
    expect(test.runner.emailProvider).not.toHaveBeenCalled();
  });

  it("leaves a failed email terminal when the current profile no longer has an address", async () => {
    const deliveries = new Map([
      [deliveryKey, delivery("email", "failed")],
    ]);

    const test = await authorizeAndRun(
      claim({
        journey: "onboarding_90d",
        instanceKey: "activation:member-1",
        step: "welcome",
      }),
      context({email: null}),
      deliveries,
    );

    expect(test.summary).toMatchObject({sent: 0, skipped: 1, failed: 0});
    expect(test.runner.outcomes).toEqual(["recipient_ineligible"]);
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "failed",
      attemptCount: 1,
    });
    expect(test.runner.reserveEmail).not.toHaveBeenCalled();
    expect(test.runner.retryEmailFailure).not.toHaveBeenCalled();
    expect(test.runner.emailProvider).not.toHaveBeenCalled();
  });

  it("lazily reopens an eligible failed email once immediately before one provider call", async () => {
    const deliveries = new Map([
      [deliveryKey, delivery("email", "failed")],
    ]);

    const test = await authorizeAndRun(
      claim({
        journey: "onboarding_90d",
        instanceKey: "activation:member-1",
        step: "welcome",
      }),
      context(),
      deliveries,
    );

    expect(test.summary).toMatchObject({sent: 1, skipped: 0, failed: 0});
    expect(test.runner.retryEmailFailure).toHaveBeenCalledTimes(1);
    expect(test.runner.retryEmailFailure).toHaveBeenCalledWith(
      expect.anything(),
      "email-log-1",
      auditedRetryMarker,
    );
    expect(test.runner.emailProvider).toHaveBeenCalledTimes(1);
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "sent",
      attemptCount: 2,
      providerId: "email-provider-retry",
    });
    expect(test.retryDb.auditWrites()).toBe(1);
  });

  it("preserves ordinary stale permanent replay without reopening or provider I/O", async () => {
    const deliveries = new Map([
      [deliveryKey, delivery("email", "failed")],
    ]);
    const runner = runnerHarness(
      claim({
        journey: "onboarding_90d",
        instanceKey: "activation:member-1",
        step: "welcome",
        claimSource: "stale",
        errorCode: null,
        emailErrorCode: "provider_client_error",
      }),
      context(),
      deliveries,
    );

    const summary = await runJourneyBatch(runner.dependencies, {now, limit: 1});

    expect(summary).toMatchObject({failed: 1, sent: 0});
    expect(runner.retryEmailFailure).not.toHaveBeenCalled();
    expect(runner.emailProvider).not.toHaveBeenCalled();
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "failed",
      attemptCount: 1,
    });
  });
});
