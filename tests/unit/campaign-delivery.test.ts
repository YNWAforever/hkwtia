import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  runCampaignBatch,
  type CampaignRecipientContext,
  type CampaignRunnerDependencies,
} from "@/lib/automation/campaign-runner";
import {createCampaignsRepository} from "@/lib/db/repos/campaigns";
import {DeliveryFailure} from "@/lib/email/transport";

const now = new Date("2027-01-15T10:00:00.000Z");
const campaignId = "11111111-1111-4111-8111-111111111111";
const dialect = new PgDialect();
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;

type Recipient = {
  id: string;
  campaignId: string;
  profileId: string;
  email: string;
  locale: "en" | "zh-HK";
  variables: Readonly<Record<string, string>>;
  template: string;
  status: "queued" | "processing" | "sent" | "failed" | "suppressed";
  attemptCount: number;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  errorCode: string | null;
};

function recipient(
  profileId: string,
  overrides: Partial<Recipient> = {},
): Recipient {
  return {
    id: crypto.randomUUID(),
    campaignId,
    profileId,
    email: `${profileId}@frozen.example.test`,
    locale: "zh-HK",
    variables: {
      displayName: `Frozen ${profileId}`,
      renewalDate: "2027-02-01",
    },
    template: "renewal-reminder",
    status: "queued",
    attemptCount: 0,
    claimedAt: null,
    claimExpiresAt: null,
    errorCode: null,
    ...overrides,
  };
}

function currentContext(
  overrides: Partial<CampaignRecipientContext> = {},
): CampaignRecipientContext {
  return {
    marketingConsent: true,
    emailSuppressed: false,
    unsubscribeUrl: "https://example.test/unsubscribe?token=current",
    ...overrides,
  };
}

function memoryHarness(
  seed: Recipient[],
  contextFor: (profileId: string) => CampaignRecipientContext = () => currentContext(),
) {
  const recipients = seed.map((item) => ({...item}));
  const logs = new Map<string, {
    id: string;
    status: "processing" | "sent" | "failed";
    idempotencyKey: string;
    providerId: string | null;
    errorCode: string | null;
    attemptCount: number;
  }>();
  const providerCalls: Array<{to: string; idempotencyKey: string}> = [];
  const rendered: Array<{
    template: string;
    locale: string;
    variables: Readonly<Record<string, string>>;
    unsubscribeUrl: string;
  }> = [];
  let campaignStatus: "queued" | "processing" | "completed" = "queued";

  const deps: CampaignRunnerDependencies = {
    campaigns: {
      async claimRecipients(_actor, claimNow, limit, leaseMs) {
        const due = recipients
          .filter((item) =>
            item.status === "queued"
            || (item.status === "processing"
              && item.claimExpiresAt !== null
              && item.claimExpiresAt.getTime() <= claimNow.getTime()))
          .slice(0, limit);
        const claimSources = new Map(due.map((item) => [
          item.id,
          item.status === "queued"
            ? "queued" as const
            : item.errorCode ? "retry" as const : "stale" as const,
        ] as const));
        for (const item of due) {
          item.status = "processing";
          item.claimedAt = claimNow;
          item.claimExpiresAt = new Date(claimNow.getTime() + leaseMs);
          item.attemptCount += 1;
          item.errorCode = null;
        }
        if (due.length > 0) campaignStatus = "processing";
        return due.map((item) => ({
          ...item,
          claimedAt: item.claimedAt as Date,
          claimSource: claimSources.get(item.id)!,
        }));
      },
      async markRecipientSent(_actor, id, claimedAt) {
        const item = recipients.find((candidate) => candidate.id === id)!;
        if (item.status !== "processing" || item.claimedAt?.getTime() !== claimedAt.getTime()) {
          throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
        }
        item.status = "sent";
        item.claimExpiresAt = null;
        return {...item};
      },
      async markRecipientSuppressed(_actor, id, claimedAt, errorCode) {
        const item = recipients.find((candidate) => candidate.id === id)!;
        if (item.status !== "processing" || item.claimedAt?.getTime() !== claimedAt.getTime()) {
          throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
        }
        item.status = "suppressed";
        item.errorCode = errorCode;
        item.claimExpiresAt = null;
        return {...item};
      },
      async rescheduleRecipient(_actor, id, claimedAt, retryAt, errorCode) {
        const item = recipients.find((candidate) => candidate.id === id)!;
        if (item.status !== "processing" || item.claimedAt?.getTime() !== claimedAt.getTime()) {
          throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
        }
        item.claimExpiresAt = retryAt;
        item.errorCode = errorCode;
        return {...item};
      },
      async markRecipientFailed(_actor, id, claimedAt, errorCode) {
        const item = recipients.find((candidate) => candidate.id === id)!;
        if (item.status !== "processing" || item.claimedAt?.getTime() !== claimedAt.getTime()) {
          throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
        }
        item.status = "failed";
        item.errorCode = errorCode;
        item.claimExpiresAt = null;
        return {...item};
      },
      async completeCampaignIfIdle(_actor, id) {
        const hasWork = recipients.some((item) =>
          item.campaignId === id && (item.status === "queued" || item.status === "processing"));
        if (!hasWork) campaignStatus = "completed";
        return !hasWork;
      },
    },
    deliveries: {
      async reserveEmail(_actor, input) {
        const existing = logs.get(input.idempotencyKey);
        if (existing) return {record: existing, disposition: "existing" as const};
        const record = {
          id: `email-${logs.size + 1}`,
          status: "processing" as const,
          idempotencyKey: input.idempotencyKey,
          providerId: null,
          errorCode: null,
          attemptCount: 1,
        };
        logs.set(input.idempotencyKey, record);
        return {record, disposition: "created" as const};
      },
      async retryEmailFailure(_actor, id, expectedErrorCode) {
        const record = [...logs.values()].find((candidate) => candidate.id === id)!;
        if (record.status !== "failed" || record.errorCode !== expectedErrorCode) {
          throw new Error("INVALID_DELIVERY_RETRY");
        }
        record.status = "processing";
        record.errorCode = null;
        record.attemptCount += 1;
        return record;
      },
      async completeEmail(_actor, id, completion) {
        const record = [...logs.values()].find((candidate) => candidate.id === id)!;
        record.status = completion.status;
        record.providerId = completion.providerId ?? null;
        record.errorCode = completion.status === "failed" ? completion.errorCode : null;
        return record;
      },
    },
    staffTasks: {
      async createOnce(_actor, input) {
        return {
          record: {...input, id: `task-${input.dedupeKey}`, status: "open" as const},
          disposition: "created" as const,
        };
      },
    },
    loadContext: async (_actor, profileId) => contextFor(profileId),
    renderCampaign: async (input) => {
      rendered.push(input);
      return {
        subject: "Frozen campaign",
        html: "<p>Frozen campaign</p>",
        text: "Frozen campaign",
        headers: {"List-Unsubscribe": `<${input.unsubscribeUrl}>`},
      };
    },
    emailTransport: {
      async send(input) {
        providerCalls.push({to: input.to, idempotencyKey: input.idempotencyKey});
        return {status: "sent" as const, providerId: `provider-${input.idempotencyKey}`};
      },
    },
    emailFrom: "WTIA <members@example.test>",
  };

  return {
    deps,
    logs,
    providerCalls,
    recipients,
    rendered,
    status: () => campaignStatus,
  };
}

describe("runCampaignBatch", () => {
  it("uses frozen locale, variables, and address while rechecking current eligibility", async () => {
    const frozen = recipient("member-1");
    const test = memoryHarness([frozen]);

    const summary = await runCampaignBatch(test.deps, {now, limit: 10});

    expect(summary).toMatchObject({claimed: 1, sent: 1, skipped: 0});
    expect(test.rendered).toEqual([{
      sourceTemplate: frozen.template,
      template: "campaign_generic",
      locale: frozen.locale,
      variables: frozen.variables,
      unsubscribeUrl: "https://example.test/unsubscribe?token=current",
    }]);
    expect(test.providerCalls).toEqual([{
      to: frozen.email,
      idempotencyKey: `campaign:${campaignId}:${frozen.id}:email`,
    }]);
    expect(test.status()).toBe("completed");
  });

  it("suppresses a currently opted-out recipient before reservation or provider call", async () => {
    const suppressed = recipient("member-suppressed");
    const test = memoryHarness(
      [suppressed],
      () => currentContext({marketingConsent: false, emailSuppressed: true}),
    );

    const summary = await runCampaignBatch(test.deps, {now, limit: 10});

    expect(summary).toMatchObject({claimed: 1, sent: 0, skipped: 1});
    expect(test.providerCalls).toHaveLength(0);
    expect(test.logs).toHaveLength(0);
    expect(test.recipients[0]).toMatchObject({
      status: "suppressed",
      errorCode: "marketing_suppressed",
    });
    expect(test.status()).toBe("completed");
  });

  it("keeps successful recipients terminal and resumes a retryable partial failure", async () => {
    const first = recipient("member-first", {locale: "en"});
    const second = recipient("member-second");
    const test = memoryHarness([first, second]);
    let secondAttempts = 0;
    test.deps.emailTransport.send = vi.fn(async (input) => {
      test.providerCalls.push({to: input.to, idempotencyKey: input.idempotencyKey});
      if (input.to === second.email && secondAttempts++ === 0) {
        throw new DeliveryFailure("retryable_network");
      }
      return {status: "sent" as const, providerId: `provider-${input.idempotencyKey}`};
    });

    const firstRun = await runCampaignBatch(test.deps, {now, limit: 10});

    expect(firstRun).toMatchObject({claimed: 2, sent: 1, retried: 1});
    expect(test.recipients).toEqual([
      expect.objectContaining({id: first.id, status: "sent"}),
      expect.objectContaining({
        id: second.id,
        status: "processing",
        claimExpiresAt: new Date(now.getTime() + 5 * 60_000),
      }),
    ]);
    expect(test.status()).toBe("processing");

    const retryNow = new Date(now.getTime() + 5 * 60_000);
    const secondRun = await runCampaignBatch(test.deps, {now: retryNow, limit: 10});

    expect(secondRun).toMatchObject({claimed: 1, sent: 1, retried: 0});
    expect(test.providerCalls.filter((call) => call.to === first.email)).toHaveLength(1);
    expect(test.providerCalls.filter((call) => call.to === second.email).map((call) => call.idempotencyKey))
      .toEqual([
        `campaign:${campaignId}:${second.id}:email`,
        `campaign:${campaignId}:${second.id}:email`,
      ]);
    expect(test.status()).toBe("completed");
  });
});

describe("campaign recipient repository fencing", () => {
  function commandFor(query: Parameters<PgDialect["sqlToQuery"]>[0]) {
    return dialect.sqlToQuery(query);
  }

  function database(responses: unknown[][]) {
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const execute = async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      commands.push(commandFor(query));
      return {rows: responses.shift() ?? []};
    };
    const db = {
      execute,
      transaction: async <T>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute}),
    };
    return {commands, db};
  }

  it("claims queued or expired-processing recipients atomically with an incremented attempt", async () => {
    const row = recipient("member-claim", {
      status: "processing",
      attemptCount: 2,
      claimedAt: now,
      claimExpiresAt: new Date(now.getTime() + 300_000),
    });
    const fake = database([[
      {
        id: row.id,
        campaign_id: row.campaignId,
        profile_id: row.profileId,
        email: row.email,
        locale: row.locale,
        variables: row.variables,
        template: row.template,
        status: row.status,
        attempt_count: row.attemptCount,
        claimed_at: row.claimedAt,
        claim_expires_at: row.claimExpiresAt,
        error_code: null,
        prior_status: "processing",
        prior_error_code: null,
      },
    ]]);
    const repo = createCampaignsRepository(async () => fake.db as never);

    await expect(repo.claimRecipients(system, now, 5, 300_000))
      .resolves.toMatchObject([{id: row.id, attemptCount: 2, claimedAt: now}]);

    const sql = fake.commands[0]?.sql.replace(/\s+/g, " ");
    expect(sql).toMatch(/status = 'queued'.*status = 'processing'.*claim_expires_at <=/i);
    expect(sql).toMatch(/FOR UPDATE.*SKIP LOCKED/i);
    expect(sql).toMatch(/attempt_count = target\.attempt_count \+ 1/i);
  });

  it("completes campaigns with no queued or processing recipients during the claim sweep", async () => {
    const fake = database([[]]);
    const repo = createCampaignsRepository(async () => fake.db as never);

    await expect(repo.claimRecipients(system, now, 5, 300_000)).resolves.toEqual([]);

    const sql = fake.commands[0]?.sql.replace(/\s+/g, " ");
    expect(sql).toMatch(
      /UPDATE "campaigns".*SET status = 'completed'.*NOT EXISTS.*status IN \('queued', 'processing'\)/i,
    );
  });

  it("fences every recipient transition by the claim timestamp", async () => {
    const row = recipient("member-transition", {
      status: "sent",
      attemptCount: 1,
      claimedAt: now,
    });
    const fake = database([[
      {
        id: row.id,
        campaign_id: row.campaignId,
        profile_id: row.profileId,
        email: row.email,
        locale: row.locale,
        variables: row.variables,
        template: row.template,
        status: row.status,
        attempt_count: row.attemptCount,
        claimed_at: row.claimedAt,
        claim_expires_at: null,
        error_code: null,
      },
    ]]);
    const repo = createCampaignsRepository(async () => fake.db as never);

    await repo.markRecipientSent(system, row.id, now);

    expect(fake.commands[0]?.sql.replace(/\s+/g, " "))
      .toMatch(/WHERE .*id = .*status = 'processing'.*claimed_at =/i);
    expect(fake.commands[0]?.params).toContain(now);
  });
});
