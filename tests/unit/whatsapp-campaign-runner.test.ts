import {readFileSync} from "node:fs";

import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  runWhatsAppCampaignBatch,
  WHATSAPP_QUEUE_BATCH_LIMIT,
  type WhatsAppCampaignRunnerDependencies,
} from "@/lib/automation/campaign-runner";
import {createCampaignsRepository} from "@/lib/db/repos/campaigns";
import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";
import {
  dispatchNotification,
  type NotificationDispatchDependencies,
} from "@/lib/notifications/dispatch";

/**
 * Programme C-5 / D-10, Phase C2 Task 10.
 *
 * The runner is exercised through the REAL `dispatchNotification` over fake
 * repositories rather than through a stubbed dispatch, because the four
 * reservation dispositions are the point: a recipient lease expires precisely
 * when the previous attempt did NOT complete, which leaves the delivery row
 * `processing` and not `sent`. A `sent`-only guard therefore does not fire, the
 * recipient is re-claimed by the `claim_expires_at <= now` arm of the `due` CTE,
 * and the same marketing template goes out twice. Stubbing the dispatcher would
 * make every one of those assertions vacuous.
 */
const NOW = new Date("2026-09-10T04:20:00.000Z");
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const RECIPIENT_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";
const TEMPLATE_KEY = "wtia_announcement_en";
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;

function facts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    kind: "member",
    id: "member-1",
    displayName: "Ada Chan",
    email: "ada@example.test",
    whatsappNumber: "+85291234567",
    locale: "en",
    membershipStatus: "active",
    planCode: "community",
    renewalAt: null,
    marketingConsent: true,
    whatsappOptIn: true,
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    whatsappSuppressed: false,
    ...overrides,
  };
}

type Claim = {
  id: string;
  campaignId: string;
  recipient: {kind: "member"; profileId: string} | {kind: "contact"; contactId: string};
  profileId: string | null;
  locale: "en" | "zh-HK";
  variables: Record<string, string>;
  templateKey: string;
  status: "queued" | "processing" | "sent" | "failed" | "suppressed";
  attemptCount: number;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  errorCode: string | null;
  blockedReason: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
};

function recipient(overrides: Partial<Claim> = {}): Claim {
  return {
    id: RECIPIENT_ID,
    campaignId: CAMPAIGN_ID,
    recipient: {kind: "member", profileId: "member-1"},
    profileId: "member-1",
    locale: "en",
    variables: {memberName: "Ada Chan", headline: "Autumn briefing", detailUrl: "https://hkwtia.test/news"},
    templateKey: TEMPLATE_KEY,
    status: "queued",
    attemptCount: 0,
    claimedAt: null,
    claimExpiresAt: null,
    errorCode: null,
    blockedReason: null,
    providerMessageId: null,
    sentAt: null,
    ...overrides,
  };
}

type DeliveryRow = {
  id: string;
  status: "processing" | "sent" | "failed";
  providerId: string | null;
  errorCode: string | null;
  attemptCount: number;
};

type Campaign = {id: string; channel: "email" | "whatsapp"; status: string; scheduledAt: Date | null};

type HarnessOptions = Readonly<{
  recipients?: Claim[];
  campaigns?: Campaign[];
  facts?: RecipientFacts | null;
  deliveries?: Map<string, DeliveryRow>;
  sendTemplateMessage?: ReturnType<typeof vi.fn>;
  /** The `whatsapp_templates` rows in status `approved`, as the promotion reads them. */
  approvedTemplateKeys?: readonly string[];
}>;

function harness(options: HarnessOptions = {}) {
  const rows = (options.recipients ?? [recipient()]).map((row) => ({...row}));
  const campaigns = options.campaigns ?? [
    {id: CAMPAIGN_ID, channel: "whatsapp" as const, status: "queued", scheduledAt: null},
  ];
  const deliveries = options.deliveries ?? new Map<string, DeliveryRow>();
  const tasks = new Map<string, {profileId: string | null; summaryCode: string}>();
  const approvedTemplates = new Set<string>(options.approvedTemplateKeys ?? [TEMPLATE_KEY]);

  const sendTemplateMessage = options.sendTemplateMessage
    ?? vi.fn(async () => ({status: "sent" as const, providerId: "wamid.sent.1"}));

  const dispatchDependencies = {
    eligibility: {
      factsFor: vi.fn(async () => (options.facts === undefined ? facts() : options.facts)),
    },
    deliveries: {
      async reserveWhatsapp(_actor: unknown, input: {idempotencyKey: string}) {
        const existing = deliveries.get(input.idempotencyKey);
        if (existing) return {record: existing, disposition: "existing" as const};
        const record: DeliveryRow = {
          id: `whatsapp-${deliveries.size + 1}`,
          status: "processing",
          providerId: null,
          errorCode: null,
          attemptCount: 1,
        };
        deliveries.set(input.idempotencyKey, record);
        return {record, disposition: "created" as const};
      },
      async completeWhatsapp(_actor: unknown, id: string, completion: {status: "sent" | "failed"; providerId?: string; errorCode?: string}) {
        const record = [...deliveries.values()].find((candidate) => candidate.id === id)!;
        record.status = completion.status;
        record.providerId = completion.providerId ?? null;
        record.errorCode = completion.status === "failed" ? completion.errorCode ?? null : null;
        return record;
      },
      async retryWhatsappFailure(_actor: unknown, id: string) {
        const record = [...deliveries.values()].find((candidate) => candidate.id === id)!;
        record.status = "processing";
        record.errorCode = null;
        record.attemptCount += 1;
        return {record, failureCode: "retryable_network" as const};
      },
      reserveEmail: vi.fn(),
      completeEmail: vi.fn(),
      retryEmailFailure: vi.fn(),
    },
    templates: {approved: vi.fn(async () => ({keys: approvedTemplates, empty: false}))},
    emailTransport: {send: vi.fn()},
    whatsappTransport: {sendTemplateMessage},
    renderEmail: vi.fn(),
    unsubscribeUrls: vi.fn(),
    emailFrom: "WTIA <members@example.test>",
  } as unknown as NotificationDispatchDependencies;

  function claimed(id: string, claimedAt: Date): Claim {
    const row = rows.find((candidate) => candidate.id === id)!;
    if (row.status !== "processing" || row.claimedAt?.getTime() !== claimedAt.getTime()) {
      throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
    }
    return row;
  }

  const promoteScheduledCampaigns = vi.fn(async (_actor: unknown, now: Date, channel: "email" | "whatsapp") => {
    const promoted: string[] = [];
    const blocked: string[] = [];
    for (const campaign of campaigns) {
      if (campaign.status !== "scheduled" || campaign.channel !== channel) continue;
      if (campaign.scheduledAt === null || campaign.scheduledAt.getTime() > now.getTime()) continue;
      if (channel === "whatsapp" && approvedTemplates.size === 0) {
        campaign.status = "failed";
        blocked.push(campaign.id);
        continue;
      }
      campaign.status = "queued";
      promoted.push(campaign.id);
    }
    return {promoted, blocked};
  });

  const claimRecipients = vi.fn(async (_actor: unknown, now: Date, limit: number, leaseMs: number, channel: "email" | "whatsapp") => {
    const drainable = new Set(
      campaigns
        .filter((campaign) => campaign.channel === channel && ["queued", "processing"].includes(campaign.status))
        .map((campaign) => campaign.id),
    );
    const due = rows
      .filter((row) => drainable.has(row.campaignId))
      .filter((row) => row.status === "queued"
        || (row.status === "processing" && row.claimExpiresAt !== null && row.claimExpiresAt.getTime() <= now.getTime()))
      .slice(0, limit);
    const sources = new Map(due.map((row) => [
      row.id,
      row.status === "queued" ? "queued" as const : row.errorCode ? "retry" as const : "stale" as const,
    ]));
    for (const row of due) {
      row.status = "processing";
      row.claimedAt = now;
      row.claimExpiresAt = new Date(now.getTime() + leaseMs);
      row.attemptCount += 1;
      row.errorCode = null;
    }
    return due.map((row) => ({...row, claimedAt: row.claimedAt as Date, claimSource: sources.get(row.id)!}));
  });

  const dependencies = {
    campaigns: {
      promoteScheduledCampaigns,
      claimRecipients,
      async markRecipientSent(_actor: unknown, id: string, claimedAt: Date, delivery: {providerMessageId: string; sentAt: Date}) {
        const row = claimed(id, claimedAt);
        row.status = "sent";
        row.claimExpiresAt = null;
        row.providerMessageId = delivery.providerMessageId;
        row.sentAt = delivery.sentAt;
        return row;
      },
      async markRecipientBlocked(_actor: unknown, id: string, claimedAt: Date, blockedReason: string) {
        const row = claimed(id, claimedAt);
        row.status = "suppressed";
        row.blockedReason = blockedReason;
        row.claimExpiresAt = null;
        return row;
      },
      async rescheduleRecipient(_actor: unknown, id: string, claimedAt: Date, retryAt: Date, errorCode: string) {
        const row = claimed(id, claimedAt);
        row.claimExpiresAt = retryAt;
        row.errorCode = errorCode;
        return row;
      },
      async markRecipientFailed(_actor: unknown, id: string, claimedAt: Date, errorCode: string, task: {profileId: string | null; dedupeKey: string; summaryCode: string}) {
        const row = claimed(id, claimedAt);
        row.status = "failed";
        row.errorCode = errorCode;
        row.claimExpiresAt = null;
        const disposition = tasks.has(task.dedupeKey) ? "existing" as const : "created" as const;
        if (disposition === "created") tasks.set(task.dedupeKey, task);
        return {record: row, taskDisposition: disposition};
      },
      async completeCampaignIfIdle(_actor: unknown, campaignId: string) {
        const pending = rows.some((row) => row.campaignId === campaignId && ["queued", "processing"].includes(row.status));
        if (!pending) {
          const campaign = campaigns.find((candidate) => candidate.id === campaignId);
          if (campaign) campaign.status = "completed";
        }
        return !pending;
      },
    },
    dispatch: (
      actor: Parameters<typeof dispatchNotification>[0],
      request: Parameters<typeof dispatchNotification>[1],
    ) => dispatchNotification(actor, request, dispatchDependencies),
  } as unknown as WhatsAppCampaignRunnerDependencies;

  return {
    dependencies,
    rows,
    campaigns,
    deliveries,
    tasks,
    sendTemplateMessage,
    promoteScheduledCampaigns,
    dispatchDependencies,
  };
}

describe("runWhatsAppCampaignBatch", () => {
  it("sends the approved snapshot and records the provider id on the recipient row", async () => {
    const test = harness();

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    expect(summary).toMatchObject({claimed: 1, sent: 1, skipped: 0, failed: 0, retried: 0});
    expect(test.sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(test.sendTemplateMessage.mock.calls[0][0]).toMatchObject({
      template: TEMPLATE_KEY,
      // The SNAPSHOT a second admin approved, not the template's own defaults.
      variables: {memberName: "Ada Chan", headline: "Autumn briefing", detailUrl: "https://hkwtia.test/news"},
      idempotencyKey: `notify:campaign:${CAMPAIGN_ID}:${RECIPIENT_ID}`,
    });
    // Without this the campaign report's Delivered and Read are permanently
    // zero: a blast writes no `messages` row for the webhook to settle.
    expect(test.rows[0]).toMatchObject({status: "sent", providerMessageId: "wamid.sent.1", sentAt: NOW});
    expect(test.campaigns[0].status).toBe("completed");
  });

  it("blocks a recipient who has opted out since the preview, without calling the provider", async () => {
    const test = harness({facts: facts({whatsappOptedOutAt: new Date("2026-09-09T00:00:00.000Z")})});

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    expect(summary).toMatchObject({claimed: 1, sent: 0, skipped: 1, failed: 0});
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
    // No delivery row either: every gate before the reservation must be able to
    // refuse without leaving a trace of an attempt that never happened.
    expect(test.deliveries.size).toBe(0);
    expect(test.rows[0]).toMatchObject({status: "suppressed", blockedReason: "suppressed"});
  });

  it("records a skipped provider result as blocked, never as a delivery failure", async () => {
    const test = harness({
      sendTemplateMessage: vi.fn(async () => ({status: "skipped" as const, reason: "recipient_ineligible"})),
    });

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    // The journey runner's habit of recording an ineligible recipient as a
    // failure is the thing not to copy: a failure spends an attempt and raises a
    // staff task for somebody nobody could have reached.
    expect(summary).toMatchObject({sent: 0, skipped: 1, failed: 0, retried: 0});
    expect(test.rows[0].status).toBe("suppressed");
    expect(test.tasks.size).toBe(0);
  });

  it("treats an uncertain acceptance as terminal, with a staff task and no reschedule (S-15)", async () => {
    const test = harness({
      sendTemplateMessage: vi.fn(async () => {
        throw Object.assign(new Error("provider"), {code: "provider_acceptance_uncertain"});
      }),
    });

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    // WOZTELL may already have delivered it. A retry is a second billable
    // marketing message to somebody who has already read the first.
    expect(summary).toMatchObject({failed: 1, retried: 0, tasksCreated: 1});
    expect(test.rows[0]).toMatchObject({status: "failed", errorCode: "provider_acceptance_uncertain", claimExpiresAt: null});
    expect([...test.tasks.keys()]).toEqual([
      `notify:campaign:${CAMPAIGN_ID}:${RECIPIENT_ID}:permanent_delivery_failure`,
    ]);
  });

  it("retries a transient provider failure instead of burning the recipient", async () => {
    const test = harness({
      sendTemplateMessage: vi.fn(async () => {
        throw Object.assign(new Error("provider"), {code: "retryable_rate_limit"});
      }),
    });

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    expect(summary).toMatchObject({retried: 1, failed: 0, sent: 0});
    expect(test.rows[0]).toMatchObject({status: "processing", errorCode: "retryable_rate_limit"});
  });

  describe("reservation dispositions", () => {
    it("created: sends once", async () => {
      const test = harness();
      await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});
      expect(test.sendTemplateMessage).toHaveBeenCalledTimes(1);
    });

    it("existing + sent: returns the first send without a second one", async () => {
      const deliveries = new Map<string, DeliveryRow>([[
        `notify:campaign:${CAMPAIGN_ID}:${RECIPIENT_ID}`,
        {id: "whatsapp-1", status: "sent", providerId: "wamid.first", errorCode: null, attemptCount: 1},
      ]]);
      const test = harness({deliveries});

      const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

      expect(summary).toMatchObject({sent: 1});
      expect(test.sendTemplateMessage).not.toHaveBeenCalled();
      expect(test.rows[0].providerMessageId).toBe("wamid.first");
    });

    it("existing + processing: terminal and uncertain, NOT a second send", async () => {
      // This is the case a lease exists for. The previous attempt crashed after
      // reaching the provider, so the ledger row is `processing` — and the
      // tempting `if (status === "sent") return;` guard does not fire.
      const deliveries = new Map<string, DeliveryRow>([[
        `notify:campaign:${CAMPAIGN_ID}:${RECIPIENT_ID}`,
        {id: "whatsapp-1", status: "processing", providerId: null, errorCode: null, attemptCount: 1},
      ]]);
      const test = harness({
        deliveries,
        recipients: [recipient({
          status: "processing",
          attemptCount: 1,
          claimedAt: new Date(NOW.getTime() - 600_000),
          claimExpiresAt: new Date(NOW.getTime() - 300_000),
        })],
      });

      const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

      expect(test.sendTemplateMessage).not.toHaveBeenCalled();
      expect(summary).toMatchObject({failed: 1, retried: 0, sent: 0});
      expect(test.rows[0]).toMatchObject({status: "failed", errorCode: "provider_acceptance_uncertain"});
    });

    it("existing + failed: retries the persisted transient failure", async () => {
      const deliveries = new Map<string, DeliveryRow>([[
        `notify:campaign:${CAMPAIGN_ID}:${RECIPIENT_ID}`,
        {id: "whatsapp-1", status: "failed", providerId: null, errorCode: "retryable_network", attemptCount: 1},
      ]]);
      const test = harness({deliveries});

      const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

      expect(test.sendTemplateMessage).toHaveBeenCalledTimes(1);
      expect(summary).toMatchObject({sent: 1});
    });
  });

  describe("promotion (Step 4c)", () => {
    it("promotes a due WhatsApp campaign before claiming, so a scheduled blast is not invisible", async () => {
      const test = harness({
        campaigns: [{
          id: CAMPAIGN_ID,
          channel: "whatsapp",
          status: "scheduled",
          scheduledAt: new Date(NOW.getTime() - 60_000),
        }],
      });

      const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

      expect(test.promoteScheduledCampaigns).toHaveBeenCalledWith(expect.anything(), NOW, "whatsapp");
      expect(summary).toMatchObject({promoted: 1, claimed: 1, sent: 1});
    });

    it("fails a scheduled campaign whose template is no longer approved instead of sending it", async () => {
      const test = harness({
        approvedTemplateKeys: [],
        campaigns: [{
          id: CAMPAIGN_ID,
          channel: "whatsapp",
          status: "scheduled",
          scheduledAt: new Date(NOW.getTime() - 60_000),
        }],
      });

      const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

      // S-14 is fail-closed at the send gate; this is the same refusal one step
      // earlier, so twenty recipients are not claimed and then each blocked.
      expect(summary).toMatchObject({promoted: 0, refused: 1, claimed: 0});
      expect(test.campaigns[0].status).toBe("failed");
      expect(test.sendTemplateMessage).not.toHaveBeenCalled();
    });

    it("leaves a scheduled campaign on the other channel alone", async () => {
      const test = harness({
        campaigns: [{
          id: CAMPAIGN_ID,
          channel: "email",
          status: "scheduled",
          scheduledAt: new Date(NOW.getTime() - 60_000),
        }],
      });

      const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

      expect(summary).toMatchObject({promoted: 0, claimed: 0});
      expect(test.campaigns[0].status).toBe("scheduled");
    });
  });

  it("addresses a prospect by their contact id", async () => {
    const test = harness({
      facts: facts({kind: "contact", id: CONTACT_ID, marketingConsent: false}),
      recipients: [recipient({recipient: {kind: "contact", contactId: CONTACT_ID}, profileId: null})],
    });

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    // A contact's `marketingConsent` is false by construction and must not block
    // a WhatsApp send: their consent lane is `contacts.whatsapp_opt_in`.
    expect(summary).toMatchObject({sent: 1});
    expect(test.dispatchDependencies.eligibility.factsFor)
      .toHaveBeenCalledWith(expect.anything(), {kind: "contact", contactId: CONTACT_ID});
  });

  it("blocks a template the code can no longer send rather than throwing the batch away", async () => {
    const test = harness({recipients: [recipient({templateKey: "wtia_retired_template"})]});

    const summary = await runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 10});

    expect(summary).toMatchObject({skipped: 1, failed: 0});
    expect(test.rows[0]).toMatchObject({status: "suppressed", blockedReason: "template_not_approved"});
  });

  it("refuses an invalid batch input", async () => {
    const test = harness();
    await expect(runWhatsAppCampaignBatch(test.dependencies, {now: new Date("nope"), limit: 10}))
      .rejects.toThrow("INVALID_RUNNER_INPUT");
    await expect(runWhatsAppCampaignBatch(test.dependencies, {now: NOW, limit: 0}))
      .rejects.toThrow("INVALID_RUNNER_INPUT");
  });

  it("paces through the cron rather than through a sleep (D-10)", () => {
    expect(WHATSAPP_QUEUE_BATCH_LIMIT).toBe(20);
  });
});

describe("campaign promotion repository (Step 4c)", () => {
  const dialect = new PgDialect();

  function database(responses: unknown[][]) {
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const execute = async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      commands.push(dialect.sqlToQuery(query));
      return {rows: responses.shift() ?? []};
    };
    const db = {
      execute,
      transaction: async <T>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute}),
    };
    return {commands, db};
  }

  it("refuses an unapproved WhatsApp template before it promotes anything else", async () => {
    const fake = database([[{id: "blocked-1"}], [{id: "promoted-1"}]]);
    const repo = createCampaignsRepository(async () => fake.db as never);

    await expect(repo.promoteScheduledCampaigns(system, NOW, "whatsapp"))
      .resolves.toEqual({promoted: ["promoted-1"], blocked: ["blocked-1"]});

    // The ORDER is the invariant: the refusal moves unapproved campaigns out of
    // `scheduled` so the promotion that follows can be a plain "everything still
    // due". Reversed, an unapproved template reaches Meta and S-15 makes every
    // rejection permanent.
    const refusal = fake.commands[0]?.sql.replace(/\s+/g, " ");
    expect(refusal).toMatch(/SET status = 'failed'/i);
    expect(refusal).toMatch(/NOT EXISTS.*"whatsapp_templates".*status = 'approved'/i);
    expect(refusal).toMatch(/target\.channel = 'whatsapp'/i);

    const promotion = fake.commands[1]?.sql.replace(/\s+/g, " ");
    expect(promotion).toMatch(/SET status = 'queued'/i);
    expect(promotion).toMatch(/target\.status = 'scheduled'/i);
    expect(promotion).toMatch(/target\.scheduled_at <= \$\d+/i);
    expect(promotion).not.toMatch(/whatsapp_templates/i);
    expect(fake.commands[1]?.params).toContain("whatsapp");
  });

  it("scopes the promotion to one channel", async () => {
    const fake = database([[], []]);
    const repo = createCampaignsRepository(async () => fake.db as never);

    await repo.promoteScheduledCampaigns(system, NOW, "email");

    for (const command of fake.commands) {
      expect(command.sql.replace(/\s+/g, " ")).toMatch(/target\.channel = \$\d+/i);
      expect(command.params).toContain("email");
    }
  });

  it("refuses a forged actor before opening the database", async () => {
    const loadDatabase = vi.fn();
    const repo = createCampaignsRepository(loadDatabase as never);

    await expect(repo.promoteScheduledCampaigns({kind: "staff", userId: "u", profileId: "p"} as never, NOW, "whatsapp"))
      .rejects.toThrow();
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});

describe("send queue wiring", () => {
  const runners = readFileSync("lib/jobs/runners.ts", "utf8");

  it("promotes due email campaigns on the hourly runner too", () => {
    // Step 4c's second leg. It has no seam a unit test can reach —
    // `runProductionCampaigns` builds the production repository bag — and a
    // promotion nothing calls leaves a scheduled campaign silent for ever, so
    // the call is pinned where it lives.
    expect(runners).toMatch(
      /promoteScheduledCampaigns\(automationCronActor\(\), now, "email"\)/,
    );
  });

  it("builds the dispatcher's dependencies once per batch, not once per recipient", () => {
    // `dispatchNotification`'s default argument calls
    // `createProductionNotificationDependencies()`, which reads `emailEnv()` and
    // constructs both transports. Left to the default it would run twenty times
    // a tick.
    expect(runners).toMatch(/const notifications = createProductionNotificationDependencies\(\);/);
    expect(runners).toMatch(/dispatchNotification\(actor, request, notifications\)/);
  });
});
