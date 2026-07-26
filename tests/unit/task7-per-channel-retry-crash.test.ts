import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";
import {
  authorizedProviderFailureCode,
  providerFailureCode,
} from "@/lib/automation/delivery-retry-authorization";

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

const dialect = new PgDialect();
const now = new Date("2027-01-15T10:00:00.000Z");
const later = new Date("2027-01-15T10:30:00.000Z");
const journeyId = "22222222-2222-4222-8222-222222222222";
const deliveryKey =
  "journey:member-1:renewal:renewal-cycle-2:renewal_14";
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

const retryableNetworkAuthorization = "admin_retry_retryable_network";
const clientErrorAuthorization = "admin_retry_provider_client_error";
const authorizationCodes = [
  "admin_retry_retryable_network",
  "admin_retry_retryable_rate_limit",
  "admin_retry_retryable_server",
  "admin_retry_provider_client_error",
  "admin_retry_provider_unclassified_failure",
] as const;

type DeliveryState = {
  id: string;
  channel: "email" | "whatsapp";
  status: "processing" | "sent" | "failed";
  idempotencyKey: string;
  providerId: string | null;
  errorCode: string | null;
  attemptCount: number;
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: journeyId,
    profile_id: "member-1",
    membership_id: null,
    journey: "renewal",
    instance_key: "renewal-cycle-2",
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
    journey: "onboarding_90d",
    instanceKey: "activation:member-1",
    step: "welcome",
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
    emailErrorCode: null,
    whatsappErrorCode: null,
    ...overrides,
  } as unknown as JourneyClaim;
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
  errorCode: string | null,
  status: DeliveryState["status"] = "failed",
): DeliveryState {
  return {
    id: `${channel}-log-1`,
    channel,
    status,
    idempotencyKey: channel === "email"
      ? deliveryKey
      : `${deliveryKey}:whatsapp`,
    providerId: status === "sent" ? `${channel}-provider-prior` : null,
    errorCode,
    attemptCount: 1,
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

type HarnessOptions = Readonly<{
  contexts?: Array<JourneyRunnerContext | Error>;
  emailProvider?: "sent" | "retryable_network";
  whatsappProvider?: "sent" | "retryable_network";
  crashReschedules?: number;
}>;

function runnerHarness(
  inputClaims: JourneyClaim[],
  deliveries: Map<string, DeliveryState>,
  options: HarnessOptions = {},
) {
  const claimQueue = [...inputClaims];
  const contextQueue = options.contexts
    ? [...options.contexts]
    : [context()];
  let currentClaim = inputClaims[0]!;
  let remainingCrashReschedules = options.crashReschedules ?? 0;

  const claimDue = vi.fn(async () => {
    const next = claimQueue.shift();
    if (!next) return [];
    currentClaim = next;
    return [next];
  });
  const loadContext = vi.fn(async () => {
    const next = contextQueue.shift() ?? contextQueue.at(-1) ?? context();
    if (next instanceof Error) throw next;
    return next;
  });
  const emailProvider = vi.fn(async () => {
    if (options.emailProvider === "retryable_network") {
      throw Object.assign(new Error("email provider unavailable"), {
        code: "retryable_network",
      });
    }
    return {
      status: "sent" as const,
      providerId: "email-provider-retry",
    };
  });
  const whatsappProvider = vi.fn(async () => {
    if (options.whatsappProvider === "retryable_network") {
      throw Object.assign(new Error("whatsapp provider unavailable"), {
        code: "retryable_network",
      });
    }
    return {
      status: "sent" as const,
      providerId: "whatsapp-provider-retry",
    };
  });
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
    if (
      record.id !== id
      || record.status !== "failed"
      || record.errorCode !== expectedErrorCode
    ) {
      throw new Error("INVALID_DELIVERY_RETRY");
    }
    record.status = "processing";
    record.errorCode = null;
    record.attemptCount += 1;
    return {
      record: {...record},
      failureCode: authorizedProviderFailureCode(expectedErrorCode)
        ?? providerFailureCode(expectedErrorCode)!,
    };
  });
  const retryWhatsappFailure = vi.fn(async (
    _actor,
    id: string,
    expectedErrorCode: string,
  ) => {
    const record = deliveries.get(`${deliveryKey}:whatsapp`)!;
    if (
      record.id !== id
      || record.status !== "failed"
      || record.errorCode !== expectedErrorCode
    ) {
      throw new Error("INVALID_DELIVERY_RETRY");
    }
    record.status = "processing";
    record.errorCode = null;
    record.attemptCount += 1;
    return {
      record: {...record},
      failureCode: authorizedProviderFailureCode(expectedErrorCode)
        ?? providerFailureCode(expectedErrorCode)!,
    };
  });
  const completeEmail = vi.fn(async (_actor, id, completion) => {
    const record = deliveries.get(deliveryKey)!;
    if (record.id !== id) throw new Error("INVALID_DELIVERY_TRANSITION");
    record.status = completion.status;
    record.providerId = completion.providerId ?? null;
    record.errorCode = completion.status === "failed"
      ? completion.errorCode
      : null;
    return {...record};
  });
  const completeWhatsapp = vi.fn(async (_actor, id, completion) => {
    const record = deliveries.get(`${deliveryKey}:whatsapp`)!;
    if (record.id !== id) throw new Error("INVALID_DELIVERY_TRANSITION");
    record.status = completion.status;
    record.providerId = completion.providerId ?? null;
    record.errorCode = completion.status === "failed"
      ? completion.errorCode
      : null;
    return {...record};
  });
  const reschedule = vi.fn(async () => {
    if (remainingCrashReschedules > 0) {
      remainingCrashReschedules -= 1;
      throw new Error("PROCESS_CRASH_BEFORE_PARENT_SETTLE");
    }
    return currentClaim;
  });
  const markFailed = vi.fn(async () => ({
    record: currentClaim,
    taskDisposition: "created" as const,
  }));
  const markSent = vi.fn(async () => currentClaim);
  const markSkipped = vi.fn(async () => currentClaim);

  const dependencies = {
    journeys: {
      claimDue,
      markSent,
      markSkipped,
      reschedule,
      markFailed,
    },
    deliveries: {
      reserveEmail,
      retryEmailFailure,
      completeEmail,
      reserveWhatsapp,
      retryWhatsappFailure,
      completeWhatsapp,
    },
    staffTasks: {
      createOnce: vi.fn(async (_actor, task) => ({
        record: {...task, id: "task-1", status: "open" as const},
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
    loadContext,
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
    claimDue,
    completeEmail,
    completeWhatsapp,
    dependencies,
    emailProvider,
    loadContext,
    markFailed,
    markSent,
    markSkipped,
    reserveEmail,
    reserveWhatsapp,
    reschedule,
    retryEmailFailure,
    retryWhatsappFailure,
    whatsappProvider,
  };
}

describe("Task 7 final review: durable per-channel retry authorization", () => {
  it("authorizes known failed channels in place and audits without a parent marker", async () => {
    const commands: ReturnType<typeof normalizedSql>[] = [];
    const execute: AutomationSqlExecutor["execute"] = async (query) => {
      const command = normalizedSql(query);
      commands.push(command);
      if (/UPDATE "journey_state"/i.test(command.sql)) {
        return {
          rows: [row({
            status: "scheduled",
            error_code: null,
            completed_at: null,
          })],
        };
      }
      if (/UPDATE "(email_log|whatsapp_log)"/i.test(command.sql)) {
        return {rows: []};
      }
      if (/INSERT INTO "audit_events"/i.test(command.sql)) return {rows: []};
      throw new Error(`UNEXPECTED_SQL:${command.sql}`);
    };
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work({execute}),
    };

    const result = await createJourneysRepository(async () => database)
      .retryFailed(admin, journeyId, now);

    expect(result).toMatchObject({status: "scheduled", errorCode: null});
    expect(commands).toHaveLength(4);
    expect(commands[0]?.params).not.toContain("admin_retry_authorized");
    for (const command of commands.slice(1, 3)) {
      expect(command.sql).toMatch(
        /UPDATE "(email_log|whatsapp_log)".*SET error_code = CASE.*status = 'failed'.*error_code IN/i,
      );
      expect(command.sql).not.toMatch(/status = 'processing'|attempt_count =/i);
      expect(command.params).toEqual(expect.arrayContaining([...authorizationCodes]));
    }
    expect(commands[3]?.sql).toMatch(
      /INSERT INTO "audit_events".*journey\.failed_retry_requested/i,
    );
  });

  it("claimDue exposes independent channel authorization state on ordinary claims", async () => {
    const commands: ReturnType<typeof normalizedSql>[] = [];
    const execute: AutomationSqlExecutor["execute"] = async (query) => {
      commands.push(normalizedSql(query));
      return {
        rows: [row({
          status: "processing",
          claimed_at: now,
          claim_expires_at: new Date(now.getTime() + 300_000),
          completed_at: null,
          prior_status: "scheduled",
          email_error_code: clientErrorAuthorization,
          whatsapp_error_code: retryableNetworkAuthorization,
        })],
      };
    };
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work({execute}),
    };

    const [claimed] = await createJourneysRepository(async () => database)
      .claimDue(cronActor, now, 1, 300_000);

    expect(claimed).toMatchObject({
      claimSource: "scheduled",
      emailErrorCode: clientErrorAuthorization,
      whatsappErrorCode: retryableNetworkAuthorization,
    });
    expect(commands[0]?.sql).toMatch(
      /LEFT JOIN "email_log".*LEFT JOIN "whatsapp_log".*email_error_code.*whatsapp_error_code/i,
    );
    expect(commands[0]?.sql).toMatch(
      /FOR UPDATE OF source SKIP LOCKED/i,
    );
  });

  it.each(["email", "whatsapp"] as const)(
    "consumes authorized %s once; provider failure plus pre-settle crash never sends again on stale reclaim",
    async (channel) => {
      const deliveries = new Map<string, DeliveryState>();
      if (channel === "email") {
        deliveries.set(
          deliveryKey,
          delivery("email", retryableNetworkAuthorization),
        );
      } else {
        deliveries.set(deliveryKey, delivery("email", null, "sent"));
        deliveries.set(
          `${deliveryKey}:whatsapp`,
          delivery("whatsapp", retryableNetworkAuthorization),
        );
      }
      const scheduled = claim({
        journey: channel === "email" ? "onboarding_90d" : "renewal",
        instanceKey: channel === "email"
          ? "activation:member-1"
          : "renewal-cycle-2",
        step: channel === "email" ? "welcome" : "renewal_14",
        claimSource: "scheduled",
        attemptCount: 2,
        emailErrorCode: channel === "email"
          ? retryableNetworkAuthorization
          : null,
        whatsappErrorCode: channel === "whatsapp"
          ? retryableNetworkAuthorization
          : null,
      } as unknown as Partial<JourneyClaim>);
      const stale = claim({
        ...scheduled,
        claimedAt: later,
        claimExpiresAt: new Date(later.getTime() + 300_000),
        claimSource: "stale",
        attemptCount: 3,
      });
      const test = runnerHarness(
        [scheduled, stale],
        deliveries,
        {
          contexts: [context(), context()],
          emailProvider: channel === "email"
            ? "retryable_network"
            : "sent",
          whatsappProvider: channel === "whatsapp"
            ? "retryable_network"
            : "sent",
          crashReschedules: 1,
        },
      );

      await expect(runJourneyBatch(
        test.dependencies,
        {now, limit: 1},
      )).rejects.toThrow("PROCESS_CRASH_BEFORE_PARENT_SETTLE");

      const provider = channel === "email"
        ? test.emailProvider
        : test.whatsappProvider;
      const retry = channel === "email"
        ? test.retryEmailFailure
        : test.retryWhatsappFailure;
      const key = channel === "email"
        ? deliveryKey
        : `${deliveryKey}:whatsapp`;
      expect(provider).toHaveBeenCalledTimes(1);
      expect(retry).toHaveBeenCalledTimes(1);
      expect(deliveries.get(key)).toMatchObject({
        status: "failed",
        attemptCount: 2,
        errorCode: "retryable_network",
      });

      const replay = await runJourneyBatch(
        test.dependencies,
        {now: later, limit: 1},
      );

      expect(replay).toMatchObject({claimed: 1, sent: 0, failed: 1});
      expect(provider).toHaveBeenCalledTimes(1);
      expect(retry).toHaveBeenCalledTimes(1);
      expect(test.markFailed).toHaveBeenCalledWith(
        expect.anything(),
        journeyId,
        later,
        "attempts_exhausted",
        later,
        expect.anything(),
      );
    },
  );

  it("keeps unused authorization through a pre-channel transient and consumes it on the next claim", async () => {
    const deliveries = new Map([
      [
        deliveryKey,
        delivery("email", clientErrorAuthorization),
      ],
    ]);
    const first = claim({
      claimSource: "scheduled",
      emailErrorCode: clientErrorAuthorization,
    } as unknown as Partial<JourneyClaim>);
    const second = claim({
      claimSource: "scheduled",
      attemptCount: 3,
      claimedAt: later,
      emailErrorCode: clientErrorAuthorization,
    } as unknown as Partial<JourneyClaim>);
    const test = runnerHarness(
      [first, second],
      deliveries,
      {
        contexts: [
          new Error("CONTEXT_TEMPORARILY_UNAVAILABLE"),
          context(),
        ],
      },
    );

    const transient = await runJourneyBatch(
      test.dependencies,
      {now, limit: 1},
    );
    expect(transient).toMatchObject({retried: 1, sent: 0});
    expect(test.emailProvider).not.toHaveBeenCalled();
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "failed",
      errorCode: clientErrorAuthorization,
      attemptCount: 1,
    });

    const delivered = await runJourneyBatch(
      test.dependencies,
      {now: later, limit: 1},
    );
    expect(delivered).toMatchObject({sent: 1, failed: 0});
    expect(test.retryEmailFailure).toHaveBeenCalledTimes(1);
    expect(test.retryEmailFailure).toHaveBeenCalledWith(
      expect.anything(),
      "email-log-1",
      clientErrorAuthorization,
    );
    expect(test.emailProvider).toHaveBeenCalledTimes(1);
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "sent",
      attemptCount: 2,
    });
  });

  it("consumes D14 email and WhatsApp authorizations independently", async () => {
    const deliveries = new Map([
      [
        deliveryKey,
        delivery("email", clientErrorAuthorization),
      ],
      [
        `${deliveryKey}:whatsapp`,
        delivery("whatsapp", retryableNetworkAuthorization),
      ],
    ]);
    const test = runnerHarness(
      [claim({
        journey: "renewal",
        instanceKey: "renewal-cycle-2",
        step: "renewal_14",
        emailErrorCode: clientErrorAuthorization,
        whatsappErrorCode: retryableNetworkAuthorization,
      } as unknown as Partial<JourneyClaim>)],
      deliveries,
    );

    const summary = await runJourneyBatch(
      test.dependencies,
      {now, limit: 1},
    );

    expect(summary).toMatchObject({sent: 1, failed: 0});
    expect(test.retryEmailFailure).toHaveBeenCalledWith(
      expect.anything(),
      "email-log-1",
      clientErrorAuthorization,
    );
    expect(test.retryWhatsappFailure).toHaveBeenCalledWith(
      expect.anything(),
      "whatsapp-log-1",
      retryableNetworkAuthorization,
    );
    expect(test.emailProvider).toHaveBeenCalledTimes(1);
    expect(test.whatsappProvider).toHaveBeenCalledTimes(1);
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "sent",
      attemptCount: 2,
    });
    expect(deliveries.get(`${deliveryKey}:whatsapp`)).toMatchObject({
      status: "sent",
      attemptCount: 2,
    });
  });

  it.each([
    {
      label: "suppressed marketing email",
      claim: claim({
        step: "day1_video",
        emailErrorCode: clientErrorAuthorization,
      } as unknown as Partial<JourneyClaim>),
      context: context({emailSuppressed: true}),
      channel: "email" as const,
    },
    {
      label: "removed transactional email",
      claim: claim({
        emailErrorCode: clientErrorAuthorization,
      } as unknown as Partial<JourneyClaim>),
      context: context({email: null}),
      channel: "email" as const,
    },
    {
      label: "opted-out renewal WhatsApp",
      claim: claim({
        journey: "renewal",
        instanceKey: "renewal-cycle-2",
        step: "renewal_14",
        whatsappErrorCode: clientErrorAuthorization,
      } as unknown as Partial<JourneyClaim>),
      context: context({whatsappOptIn: false, whatsappNumber: null}),
      channel: "whatsapp" as const,
    },
  ])("leaves authorized $label failed and unconsumed", async (testCase) => {
    const key = testCase.channel === "email"
      ? deliveryKey
      : `${deliveryKey}:whatsapp`;
    const deliveries = new Map<string, DeliveryState>([
      [key, delivery(testCase.channel, clientErrorAuthorization)],
    ]);
    if (testCase.channel === "whatsapp") {
      deliveries.set(deliveryKey, delivery("email", null, "sent"));
    }
    const test = runnerHarness(
      [testCase.claim],
      deliveries,
      {contexts: [testCase.context]},
    );

    await runJourneyBatch(test.dependencies, {now, limit: 1});

    const retry = testCase.channel === "email"
      ? test.retryEmailFailure
      : test.retryWhatsappFailure;
    const provider = testCase.channel === "email"
      ? test.emailProvider
      : test.whatsappProvider;
    expect(retry).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(deliveries.get(key)).toMatchObject({
      status: "failed",
      errorCode: clientErrorAuthorization,
      attemptCount: 1,
    });
  });

  it("preserves ordinary stale permanent failure replay", async () => {
    const deliveries = new Map([
      [
        deliveryKey,
        delivery("email", "provider_client_error"),
      ],
    ]);
    const test = runnerHarness(
      [claim({
        claimSource: "stale",
        attemptCount: 2,
        emailErrorCode: "provider_client_error",
      } as unknown as Partial<JourneyClaim>)],
      deliveries,
    );

    const summary = await runJourneyBatch(
      test.dependencies,
      {now, limit: 1},
    );

    expect(summary).toMatchObject({failed: 1, sent: 0});
    expect(test.retryEmailFailure).not.toHaveBeenCalled();
    expect(test.emailProvider).not.toHaveBeenCalled();
    expect(deliveries.get(deliveryKey)).toMatchObject({
      status: "failed",
      errorCode: "provider_client_error",
      attemptCount: 1,
    });
  });
});
