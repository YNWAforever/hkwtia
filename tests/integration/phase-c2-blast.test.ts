import {readFileSync} from "node:fs";

import {describe, expect, it, vi} from "vitest";

import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import type {AppLocale} from "@/i18n/routing";
import {
  createWoztellWebhookProcessor,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {
  createCampaignEmailRenderer,
  runCampaignBatch,
  runWhatsAppCampaignBatch,
  type CampaignRunnerDependencies,
  type WhatsAppCampaignRunnerDependencies,
} from "@/lib/automation/campaign-runner";
import type {ChannelAdapter, TemplateMessageInput} from "@/lib/channels/types";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import type {
  CampaignPromotionResult,
  CampaignRecipientIdentity,
  CampaignSendChannel,
} from "@/lib/db/repos/campaign-recipient-delivery";
import type {
  DeliveryCompletion,
  DeliveryRecord,
  DeliveryReservation,
} from "@/lib/db/repos/deliveries";
import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";
import type {DeliveryStatusResult} from "@/lib/db/repos/woztell-inbound-events";
import {createTestTransport} from "@/lib/email/transport";
import {
  dispatchNotification,
  type NotificationDispatchDependencies,
} from "@/lib/notifications/dispatch";

/**
 * Phase C2 acceptance — the half of the C-5…C-8 gate no browser can stand in
 * for (plan Task 12 Step 1b,
 * docs/superpowers/plans/2026-09-10-phase-c2-campaigns-and-contacts.md).
 *
 * The blast is assembled from modules that meet nowhere else. The wizard writes
 * a `scheduled` campaign and a per-recipient variable snapshot (Tasks 8-9); the
 * ten-minute runner promotes, claims and dispatches it (Tasks 10-11); the
 * adapter turns the snapshot into Meta's BODY parameters; and the webhook —
 * built in Phase C1, for a lane that writes `messages` rows — settles a row in
 * `campaign_recipients` instead. `tests/e2e/` drives the browser but can see
 * none of that, and every unit test on either side stops at its own boundary.
 * The three seams below are the ones that were silently broken before this
 * phase and would be silently broken again:
 *
 *  1. **`scheduled` is not drainable.** The claim's `due` CTE only reaches
 *     `('queued', 'processing')` and S-6 forbids widening it, so without the
 *     promotion step a reviewed campaign sits in `scheduled` for ever and the
 *     cron returns a summary indistinguishable from an empty queue.
 *  2. **An empty BODY parameter is a permanent failure per recipient.**
 *     `lib/channels/woztell.ts` builds the body as
 *     `template.variables.map((key) => input.variables[key] ?? "")`, Meta rejects
 *     an empty parameter with a 4xx, and S-15 makes that terminal. Asserting the
 *     variables the runner passed is not enough — the assertion has to reach the
 *     payload the provider would actually receive.
 *  3. **A campaign send writes no `messages` row at all**, so C1's delivery-tick
 *     UPDATE misses for every blast tick and the report's Delivered and Read
 *     counters are permanent zeroes staff read as "nothing arrived".
 *
 * There is no local database (CLAUDE.md), so the ledger below stands in for the
 * statements this walk touches — `promoteScheduledCampaigns`' two UPDATEs,
 * `claimRecipients`' `due`/`claimed` CTEs, the recipient transitions,
 * `completeCampaignIfIdle` and `recordDeliveryStatus`' two-statement
 * fall-through — and mirrors each one's GUARD rather than its SQL. Everything
 * above them is the real thing: the real runners, the real
 * `dispatchNotification` with its four reservation dispositions, the real
 * eligibility classifier, the real email renderer and the real WOZTELL adapter
 * in its credential-free mock mode. That last part is D-4 and is why the
 * provider ids ticked off here are `mock:` ones: every flow in this phase must
 * be exercisable without a live token, and C-9 is a flag flip rather than a
 * rewrite.
 */

const NOW = new Date("2026-09-10T04:20:00.000Z");
/** Before `NOW`, so the promotion's `scheduled_at <= now` arm is genuinely due. */
const SCHEDULED_AT = new Date(NOW.getTime() - 60_000);
const TICK_AT = new Date(NOW.getTime() + 45_000);
const READ_AT = new Date(NOW.getTime() + 90_000);

const WHATSAPP_CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL_CAMPAIGN_ID = "99999999-9999-4999-8999-999999999999";
const MEMBER_RECIPIENT_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_RECIPIENT_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL_RECIPIENT_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";

/** Three BODY parameters, `marketing` — the blast §8.3 exists to send. */
const BLAST_TEMPLATE: WhatsAppTemplateKey = "wtia_announcement_en";
/** One of the three email source templates `campaignTemplateMap` interprets. */
const EMAIL_SOURCE_TEMPLATE = "member-update";

type CampaignStatus =
  | "draft" | "review" | "scheduled" | "queued" | "processing" | "completed" | "failed" | "cancelled";
type RecipientStatus = "queued" | "processing" | "sent" | "failed" | "suppressed";

type CampaignRow = {
  id: string;
  channel: CampaignSendChannel;
  status: CampaignStatus;
  scheduledAt: Date | null;
  /** The email source template; NULL on a WhatsApp campaign (S-5). */
  template: string | null;
  /** The `whatsapp_templates` key; NULL on an email campaign (S-5). */
  templateKey: string | null;
  completedAt: Date | null;
};

type RecipientRow = {
  id: string;
  campaignId: string;
  identity: CampaignRecipientIdentity;
  profileId: string | null;
  email: string | null;
  locale: AppLocale;
  variables: Record<string, string>;
  status: RecipientStatus;
  attemptCount: number;
  claimedAt: Date | null;
  claimExpiresAt: Date | null;
  errorCode: string | null;
  blockedReason: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
};

function memberFacts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
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

function contactFacts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    ...memberFacts(),
    kind: "contact",
    id: CONTACT_ID,
    displayName: "Brian Lau",
    email: "brian@example.test",
    whatsappNumber: "+85299998888",
    membershipStatus: null,
    planCode: null,
    // False by construction for every contact — their consent lane is
    // `contacts.whatsapp_opt_in`, which is why a prospect is never an eligible
    // EMAIL recipient and is a perfectly good WhatsApp one.
    marketingConsent: false,
    ...overrides,
  };
}

function identityKey(identity: CampaignRecipientIdentity): string {
  return identity.kind === "member" ? `member:${identity.profileId}` : `contact:${identity.contactId}`;
}

/**
 * The ledger. Every method mirrors the GUARD of the statement it stands for;
 * where the guard is the whole point (the `due` CTE's status list, the
 * transition's `claimed_at` equality, the tick's COALESCE) the comment says so.
 */
function createLedger(campaigns: CampaignRow[], recipients: RecipientRow[]) {
  /** Every campaign status write, in order — promote → activate → complete. */
  const campaignTransitions: (readonly [string, CampaignStatus])[] = [];
  const deliveries = new Map<string, DeliveryRecord & {status: "processing" | "sent" | "failed"}>();
  const staffTasks = new Map<string, string>();

  function setCampaignStatus(campaign: CampaignRow, status: CampaignStatus): void {
    campaign.status = status;
    campaignTransitions.push([campaign.id, status]);
  }

  /**
   * `transitionRecipient`: the UPDATE is guarded on `status = 'processing' AND
   * claimed_at = $claimedAt`, and a miss throws rather than silently updating
   * nothing — that is how a runner learns it lost the claim to another tick.
   */
  function claimed(id: string, claimedAt: Date): RecipientRow {
    const row = recipients.find((candidate) => candidate.id === id);
    if (!row || row.status !== "processing" || row.claimedAt?.getTime() !== claimedAt.getTime()) {
      throw new Error("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
    }
    return row;
  }

  const campaignMutations = {
    async promoteScheduledCampaigns(
      _actor: unknown,
      now: Date,
      channel: CampaignSendChannel,
    ): Promise<CampaignPromotionResult> {
      const due = campaigns.filter((campaign) =>
        campaign.status === "scheduled"
        && campaign.channel === channel
        && campaign.scheduledAt !== null
        && campaign.scheduledAt.getTime() <= now.getTime());
      const promoted: string[] = [];
      const blocked: string[] = [];
      // The refusal runs FIRST, exactly as the repository orders its two
      // statements: a promotion that ran first would queue a campaign whose
      // template Meta may reject, and S-15 makes each rejection permanent.
      for (const campaign of due) {
        if (channel === "whatsapp" && !approvedRegistryKeys.has(campaign.templateKey ?? "")) {
          setCampaignStatus(campaign, "failed");
          blocked.push(campaign.id);
          continue;
        }
        setCampaignStatus(campaign, "queued");
        promoted.push(campaign.id);
      }
      return {promoted, blocked};
    },

    async claimRecipients(
      _actor: unknown,
      now: Date,
      limit: number,
      leaseMs: number,
      channel: CampaignSendChannel,
    ) {
      // The `due` CTE: the campaign's status list stays ('queued','processing')
      // and its send time must have passed. Both are what make a `scheduled`
      // campaign invisible without the promotion above.
      const drainable = new Map(campaigns
        .filter((campaign) => campaign.channel === channel
          && (campaign.status === "queued" || campaign.status === "processing")
          && (campaign.scheduledAt === null || campaign.scheduledAt.getTime() <= now.getTime()))
        .map((campaign) => [campaign.id, campaign] as const));
      const due = recipients
        .filter((row) => drainable.has(row.campaignId))
        .filter((row) => row.status === "queued"
          || (row.status === "processing"
            && row.claimExpiresAt !== null
            && row.claimExpiresAt.getTime() <= now.getTime()))
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
      // The `activated` CTE: a claimed campaign leaves 'queued' for
      // 'processing', which is the in-flight state (S-6 — `sending` is never
      // written).
      for (const row of due) {
        const campaign = drainable.get(row.campaignId);
        if (campaign && campaign.status === "queued") setCampaignStatus(campaign, "processing");
      }
      return due.map((row) => ({
        id: row.id,
        campaignId: row.campaignId,
        recipient: row.identity,
        profileId: row.profileId,
        email: row.email ?? "",
        locale: row.locale,
        variables: row.variables,
        template: drainable.get(row.campaignId)?.template ?? "",
        templateKey: drainable.get(row.campaignId)?.templateKey ?? "",
        status: "processing" as const,
        attemptCount: row.attemptCount,
        claimedAt: row.claimedAt as Date,
        claimExpiresAt: row.claimExpiresAt as Date,
        errorCode: row.errorCode,
        claimSource: sources.get(row.id) ?? "queued" as const,
      }));
    },

    async markRecipientSent(
      _actor: unknown,
      id: string,
      claimedAt: Date,
      delivery?: Readonly<{providerMessageId: string; sentAt: Date}>,
    ) {
      const row = claimed(id, claimedAt);
      row.status = "sent";
      row.claimExpiresAt = null;
      row.errorCode = null;
      if (delivery) {
        row.providerMessageId = delivery.providerMessageId;
        row.sentAt = delivery.sentAt;
      }
      return row;
    },

    async markRecipientBlocked(_actor: unknown, id: string, claimedAt: Date, blockedReason: string) {
      const row = claimed(id, claimedAt);
      row.status = "suppressed";
      row.blockedReason = blockedReason;
      row.claimExpiresAt = null;
      return row;
    },

    async markRecipientSuppressed(_actor: unknown, id: string, claimedAt: Date, errorCode: string) {
      const row = claimed(id, claimedAt);
      row.status = "suppressed";
      row.errorCode = errorCode;
      row.claimExpiresAt = null;
      return row;
    },

    async rescheduleRecipient(
      _actor: unknown,
      id: string,
      claimedAt: Date,
      retryAt: Date,
      errorCode: string,
    ) {
      const row = claimed(id, claimedAt);
      row.claimExpiresAt = retryAt;
      row.errorCode = errorCode;
      return row;
    },

    async markRecipientFailed(
      _actor: unknown,
      id: string,
      claimedAt: Date,
      errorCode: string,
      task: Readonly<{dedupeKey: string; summaryCode: string}>,
    ) {
      const row = claimed(id, claimedAt);
      row.status = "failed";
      row.errorCode = errorCode;
      row.claimExpiresAt = null;
      const disposition = staffTasks.has(task.dedupeKey) ? "existing" as const : "created" as const;
      if (disposition === "created") staffTasks.set(task.dedupeKey, task.summaryCode);
      return {record: row, taskDisposition: disposition};
    },

    async completeCampaignIfIdle(_actor: unknown, campaignId: string, now: Date) {
      const campaign = campaigns.find((candidate) => candidate.id === campaignId);
      if (!campaign || (campaign.status !== "queued" && campaign.status !== "processing")) return false;
      const pending = recipients.some((row) => row.campaignId === campaignId
        && (row.status === "queued" || row.status === "processing"));
      if (pending) return false;
      setCampaignStatus(campaign, "completed");
      // The timestamp comes from the runner's batch clock, not a database
      // clock, so both completion writers agree and a test can pin it.
      campaign.completedAt = now;
      return true;
    },
  };

  /** `whatsapp_templates` rows in status `approved`, as the promotion reads them. */
  const approvedRegistryKeys = new Set<string>([BLAST_TEMPLATE]);

  function reserve(
    channel: "email" | "whatsapp",
    input: Readonly<{
      profileId: string | null;
      contactId?: string | null;
      template: string;
      idempotencyKey: string;
      locale: string;
      classification: "marketing" | "transactional";
    }>,
  ): DeliveryReservation {
    const existing = deliveries.get(input.idempotencyKey);
    // `ON CONFLICT DO NOTHING` → `reserveExisting`, which hands the row back in
    // WHATEVER STATE IT IS IN. The dispatcher's four dispositions are built on
    // exactly that, so the fake must not tidy it into "created or sent".
    if (existing) return {record: existing, disposition: "existing"};
    const record: DeliveryRecord & {status: "processing"} = {
      id: `${channel}-${deliveries.size + 1}`,
      channel,
      profileId: input.profileId,
      contactId: input.contactId ?? null,
      journeyStateId: null,
      template: input.template,
      status: "processing",
      providerId: null,
      idempotencyKey: input.idempotencyKey,
      locale: input.locale,
      classification: input.classification,
      attemptCount: 1,
      errorCode: null,
      createdAt: NOW,
    };
    deliveries.set(input.idempotencyKey, record);
    return {record, disposition: "created"};
  }

  function complete(id: string, completion: DeliveryCompletion): DeliveryRecord {
    const record = [...deliveries.values()].find((candidate) => candidate.id === id);
    if (!record) throw new Error("UNKNOWN_DELIVERY");
    const settled = {
      ...record,
      status: completion.status,
      providerId: completion.status === "sent" ? completion.providerId : null,
      errorCode: completion.status === "failed" ? completion.errorCode : null,
    };
    deliveries.set(record.idempotencyKey, settled);
    return settled;
  }

  function retry(id: string): Readonly<{record: DeliveryRecord; failureCode: "retryable_network"}> {
    const record = [...deliveries.values()].find((candidate) => candidate.id === id);
    if (!record) throw new Error("UNKNOWN_DELIVERY");
    const replayed = {...record, status: "processing" as const, errorCode: null, attemptCount: record.attemptCount + 1};
    deliveries.set(record.idempotencyKey, replayed);
    return {record: replayed, failureCode: "retryable_network"};
  }

  /**
   * `recordDeliveryStatus`, both statements. The first — the `messages` UPDATE —
   * is modelled as an explicitly empty table rather than skipped: a campaign
   * send writes no `messages` row at all, and that miss is the whole reason the
   * second statement exists. The second may only ever move the row forward, and
   * does it by COALESCE rather than assignment, so a late tick cannot clear a
   * timestamp it has already set.
   *
   * The SQL itself — that the fall-through is a second UPDATE against
   * `campaign_recipients`, keyed on `provider_message_id`, answering
   * `target: "campaign_recipient"` — is pinned in
   * `tests/unit/woztell-inbound-events.test.ts`. What only this file can show is
   * that the id the tick arrives with is the id the blast actually wrote.
   */
  async function recordDeliveryStatus(event: Readonly<{
    providerMessageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    errorCode: string | null;
    occurredAt: Date;
  }>): Promise<DeliveryStatusResult> {
    const messageRows: {providerMessageId: string}[] = [];
    if (messageRows.some((row) => row.providerMessageId === event.providerMessageId)) {
      return {matched: true, target: "message"};
    }
    const row = recipients.find((candidate) => candidate.providerMessageId === event.providerMessageId);
    if (!row) return {matched: false, target: null};
    if (event.status === "delivered" || event.status === "read") {
      row.deliveredAt = row.deliveredAt ?? event.occurredAt;
    }
    if (event.status === "read") row.readAt = row.readAt ?? event.occurredAt;
    if (event.status === "failed") {
      row.status = "failed";
      row.errorCode = event.errorCode;
    }
    return {matched: true, target: "campaign_recipient"};
  }

  return {
    campaigns,
    recipients,
    deliveries,
    staffTasks,
    campaignTransitions,
    approvedRegistryKeys,
    campaignMutations,
    reserve,
    complete,
    retry,
    recordDeliveryStatus,
  };
}

type Ledger = ReturnType<typeof createLedger>;

/**
 * The dispatcher's dependency bag over the ledger, the REAL eligibility
 * classifier and the REAL adapter. Cast once, at the boundary, because the bag
 * names six repository methods whose full signatures the ledger deliberately
 * does not implement — the same shape `tests/unit/whatsapp-campaign-runner.test.ts`
 * uses.
 */
function dispatchDependencies(
  ledger: Ledger,
  facts: ReadonlyMap<string, RecipientFacts>,
  whatsappTransport: Pick<ChannelAdapter, "sendTemplateMessage">,
  emailTransport: ReturnType<typeof createTestTransport>,
): NotificationDispatchDependencies {
  return {
    eligibility: {
      factsFor: vi.fn(async (_actor: unknown, recipient: CampaignRecipientIdentity) =>
        facts.get(identityKey(recipient)) ?? null),
    },
    deliveries: {
      reserveWhatsapp: async (_actor: unknown, input: never) => ledger.reserve("whatsapp", input),
      reserveEmail: async (_actor: unknown, input: never) => ledger.reserve("email", input),
      completeWhatsapp: async (_actor: unknown, id: string, completion: DeliveryCompletion) =>
        ledger.complete(id, completion),
      completeEmail: async (_actor: unknown, id: string, completion: DeliveryCompletion) =>
        ledger.complete(id, completion),
      retryWhatsappFailure: async (_actor: unknown, id: string) => ledger.retry(id),
      retryEmailFailure: async (_actor: unknown, id: string) => ledger.retry(id),
    },
    templates: {approved: vi.fn(async () => ({keys: ledger.approvedRegistryKeys, empty: false}))},
    emailTransport,
    whatsappTransport,
    renderEmail: vi.fn(),
    unsubscribeUrls: vi.fn(),
    emailFrom: "WTIA <members@example.test>",
  } as unknown as NotificationDispatchDependencies;
}

/**
 * The provider payload the adapter would actually POST, for one send it has
 * already made in mock mode.
 *
 * The walk itself runs on the credential-free adapter (D-4), which returns a
 * `mock:` provider id and never reaches `fetch` — so the BODY parameters it
 * built are discarded, and asserting the runner's `variables` alone would leave
 * the last link of the chain untested. This replays the SAME input through the
 * same `sendTemplateMessage`, this time with fixture credentials and a
 * recording `fetch`, which is the only way to read the array Meta would receive.
 * No real credential and no network: the token below is a literal, exactly as
 * `tests/integration/woztell-server-uncertain.test.ts` does it.
 */
async function providerBodyParameters(
  input: TemplateMessageInput,
): Promise<readonly Readonly<{type: string; text: string}>[]> {
  let captured = "";
  const recordingFetch = async (_url: string, init: RequestInit) => {
    captured = String(init.body ?? "");
    return new Response(
      JSON.stringify({ok: 1, sendResult: {ok: 1, result: [{messageEvent: {messageId: "wamid.recorded"}}]}}),
      {status: 200, headers: {"content-type": "application/json"}},
    );
  };
  const recording = createWoztellAdapter({
    RUN_LIVE_WOZTELL: "1",
    WOZTELL_API_TOKEN: "credential-free-fixture-token",
    WOZTELL_CHANNEL_ID: "fixture-channel",
  }, recordingFetch as unknown as typeof fetch, () => NOW);
  const result = await recording.sendTemplateMessage(input);
  expect(result.status).toBe("sent");
  const body = JSON.parse(captured) as Readonly<{
    response: readonly Readonly<{
      components: readonly Readonly<{parameters: readonly Readonly<{type: string; text: string}>[]}>[];
    }>[];
  }>;
  return body.response[0].components[0].parameters;
}

/** The delivery-tick envelope. UNVERIFIED (C1 O-1) — one shape, in one place. */
function statusPayload(messageId: string, status: string, at: Date) {
  return {type: "MESSAGE_STATUS", messageId, timestamp: at.toISOString(), data: {status}};
}

/**
 * The webhook processor, wired for the delivery-tick branch alone. Every
 * inbound dependency throws rather than stubbing quietly: this walk carries no
 * inbound message, and a tick that somehow took the conversation path would
 * otherwise pass as a tick that landed.
 */
function tickProcessor(ledger: Ledger, channel: ChannelAdapter) {
  const dependencies: WoztellWebhookProcessorDependencies = {
    channel,
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async () => {
      throw new Error("INBOUND_CLAIMED_ON_A_DELIVERY_TICK");
    }),
    recordDeliveryStatus: ledger.recordDeliveryStatus,
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {
      startTurn: vi.fn(async () => {
        throw new Error("CONCIERGE_STARTED_A_TURN_ON_A_DELIVERY_TICK");
      }),
    },
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: () => "a".repeat(64),
    approvedTemplateKeys: new Set<WhatsAppTemplateKey>([BLAST_TEMPLATE]),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
  };
  return createWoztellWebhookProcessor(dependencies);
}

function whatsappCampaign(overrides: Partial<CampaignRow> = {}): CampaignRow {
  return {
    id: WHATSAPP_CAMPAIGN_ID,
    channel: "whatsapp",
    status: "scheduled",
    scheduledAt: SCHEDULED_AT,
    template: null,
    templateKey: BLAST_TEMPLATE,
    completedAt: null,
    ...overrides,
  };
}

function whatsappRecipients(): RecipientRow[] {
  // The snapshot a second admin approved (S-7), already resolved per recipient
  // at draft time by `resolveRecipientVariables` — never the template's
  // defaults and never the campaign row's unresolved tokens.
  const shared = {
    campaignId: WHATSAPP_CAMPAIGN_ID,
    locale: "en" as const,
    status: "queued" as const,
    attemptCount: 0,
    claimedAt: null,
    claimExpiresAt: null,
    errorCode: null,
    blockedReason: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
  };
  return [
    {
      ...shared,
      id: MEMBER_RECIPIENT_ID,
      identity: {kind: "member", profileId: "member-1"},
      profileId: "member-1",
      email: "ada@example.test",
      variables: {memberName: "Ada Chan", headline: "Autumn briefing", detailUrl: "https://hkwtia.test/news"},
    },
    {
      ...shared,
      id: CONTACT_RECIPIENT_ID,
      identity: {kind: "contact", contactId: CONTACT_ID},
      profileId: null,
      email: "brian@example.test",
      variables: {memberName: "Brian Lau", headline: "Autumn briefing", detailUrl: "https://hkwtia.test/news"},
    },
  ];
}

function whatsappFacts(): ReadonlyMap<string, RecipientFacts> {
  return new Map<string, RecipientFacts>([
    ["member:member-1", memberFacts()],
    [`contact:${CONTACT_ID}`, contactFacts()],
  ]);
}

type WhatsAppWalk = Readonly<{
  ledger: Ledger;
  sends: TemplateMessageInput[];
  summary: Awaited<ReturnType<typeof runWhatsAppCampaignBatch>>;
}>;

async function runWhatsAppWalk(
  recipients: RecipientRow[] = whatsappRecipients(),
  facts: ReadonlyMap<string, RecipientFacts> = whatsappFacts(),
): Promise<WhatsAppWalk> {
  const ledger = createLedger([whatsappCampaign()], recipients);
  // Credential-free, so nothing leaves the building and every provider id is a
  // `mock:` one. The fixture clock is passed for the same reason C1's walk
  // passes it: an adapter left on the wall clock is a different adapter.
  const adapter = createWoztellAdapter({}, vi.fn(), () => NOW);
  const sends: TemplateMessageInput[] = [];
  const whatsappTransport = {
    sendTemplateMessage: async (input: TemplateMessageInput) => {
      sends.push(input);
      return await adapter.sendTemplateMessage(input);
    },
  };
  const dependencies = {
    campaigns: ledger.campaignMutations,
    dispatch: (
      actor: Parameters<typeof dispatchNotification>[0],
      request: Parameters<typeof dispatchNotification>[1],
    ) => dispatchNotification(
      actor,
      request,
      dispatchDependencies(ledger, facts, whatsappTransport, createTestTransport()),
    ),
  } as unknown as WhatsAppCampaignRunnerDependencies;

  const summary = await runWhatsAppCampaignBatch(dependencies, {now: NOW, limit: 20});
  return {ledger, sends, summary};
}

describe("Phase C2 — a scheduled WhatsApp blast, end to end", () => {
  it("promotes, claims, sends, and fills every BODY parameter for every recipient", async () => {
    const walk = await runWhatsAppWalk();

    // Step 4c. The promotion runs BEFORE the claim, so a campaign the wizard
    // wrote as `scheduled` is drainable on the same tick. Without it this
    // summary would read `{promoted: 0, claimed: 0}` — an empty queue, and a
    // blast that never goes out with nothing anywhere saying why.
    expect(walk.summary).toMatchObject({promoted: 1, refused: 0, claimed: 2, sent: 2, skipped: 0, failed: 0});
    expect(walk.ledger.campaignTransitions).toEqual([
      [WHATSAPP_CAMPAIGN_ID, "queued"],
      [WHATSAPP_CAMPAIGN_ID, "processing"],
      [WHATSAPP_CAMPAIGN_ID, "completed"],
    ]);
    expect(walk.ledger.campaigns[0].completedAt).toEqual(NOW);

    // One send per person, keyed in the `notify:` namespace — NOT `journey:`,
    // which `lib/db/repos/journeys.ts` joins on and which would silently
    // disable admin retry for these rows.
    expect(walk.sends.map((send) => send.idempotencyKey)).toEqual([
      `notify:campaign:${WHATSAPP_CAMPAIGN_ID}:${MEMBER_RECIPIENT_ID}`,
      `notify:campaign:${WHATSAPP_CAMPAIGN_ID}:${CONTACT_RECIPIENT_ID}`,
    ]);
    for (const row of walk.ledger.recipients) {
      expect(row).toMatchObject({status: "sent", sentAt: NOW});
      // D-4: mock mode, so nothing was sent and no credential was needed. The
      // id is still the handle every later tick arrives against — and without
      // it the report's Delivered and Read are permanent zeroes.
      expect(row.providerMessageId).toMatch(/^mock:notify:campaign:/);
    }

    // The last link. Meta rejects a template whose BODY parameter is empty, the
    // adapter maps that 4xx to `provider_client_error`, and S-15 makes it
    // permanent — one failure and one staff task per recipient, for a campaign
    // whose preview said `eligible`.
    const declared = WHATSAPP_TEMPLATES[BLAST_TEMPLATE].variables;
    for (const send of walk.sends) {
      const parameters = await providerBodyParameters(send);
      expect(parameters).toHaveLength(declared.length);
      for (const parameter of parameters) expect(parameter.text.trim()).not.toBe("");
    }
  });

  it("blocks a recipient whose snapshot lost a variable instead of sending an empty parameter", async () => {
    const recipients = whatsappRecipients();
    // A `variables_template` value that resolved to nothing for this person —
    // the state Task 8 records as `missing_variable` in the preview. If it
    // reaches the adapter it becomes an empty BODY parameter.
    recipients[1].variables = {memberName: "Brian Lau", headline: "Autumn briefing"};

    const walk = await runWhatsAppWalk(recipients);

    expect(walk.summary).toMatchObject({claimed: 2, sent: 1, skipped: 1, failed: 0});
    expect(walk.sends).toHaveLength(1);
    // No delivery row for the blocked recipient either: every gate before the
    // reservation must refuse without leaving a trace of an attempt that never
    // happened.
    expect(walk.ledger.deliveries.size).toBe(1);
    expect(walk.ledger.recipients[1]).toMatchObject({
      status: "suppressed",
      blockedReason: "missing_variable",
      providerMessageId: null,
    });
  });

  it("never claims a WhatsApp campaign the registry has un-approved, and never sends it", async () => {
    const ledger = createLedger([whatsappCampaign()], whatsappRecipients());
    ledger.approvedRegistryKeys.clear();
    const adapter = createWoztellAdapter({}, vi.fn(), () => NOW);
    const sends: TemplateMessageInput[] = [];
    const dependencies = {
      campaigns: ledger.campaignMutations,
      dispatch: (
        actor: Parameters<typeof dispatchNotification>[0],
        request: Parameters<typeof dispatchNotification>[1],
      ) => dispatchNotification(actor, request, dispatchDependencies(ledger, whatsappFacts(), {
        sendTemplateMessage: async (input: TemplateMessageInput) => {
          sends.push(input);
          return await adapter.sendTemplateMessage(input);
        },
      }, createTestTransport())),
    } as unknown as WhatsAppCampaignRunnerDependencies;

    const summary = await runWhatsAppCampaignBatch(dependencies, {now: NOW, limit: 20});

    // S-14 fail-closed, one step earlier than the send gate: twenty recipients
    // are not claimed and then each blocked.
    expect(summary).toMatchObject({promoted: 0, refused: 1, claimed: 0, sent: 0});
    expect(ledger.campaigns[0].status).toBe("failed");
    expect(sends).toEqual([]);
  });
});

describe("Phase C2 — a delivery tick reaches a campaign recipient", () => {
  it("moves campaign_recipients.delivered_at for a provider id no messages row holds", async () => {
    const walk = await runWhatsAppWalk();
    const providerId = walk.ledger.recipients[0].providerMessageId ?? "";
    const processor = tickProcessor(walk.ledger, createWoztellAdapter({}, vi.fn(), () => NOW));

    const tick = await processor.process(statusPayload(providerId, "DELIVERED", TICK_AT));

    // The webhook and the blast meet here and nowhere else. Before Task 10 Step
    // 4b this answered `matched: false` for every blast tick — the `messages`
    // UPDATE misses, because a campaign send writes no `messages` row at all —
    // and the report's Delivered and Read columns were permanent zeroes staff
    // would read as "nothing arrived".
    expect(tick).toEqual({status: "delivery_recorded", matched: true});
    expect(walk.ledger.recipients[0].deliveredAt).toEqual(TICK_AT);

    const read = await processor.process(statusPayload(providerId, "READ", READ_AT));

    expect(read).toEqual({status: "delivery_recorded", matched: true});
    expect(walk.ledger.recipients[0]).toMatchObject({deliveredAt: TICK_AT, readAt: READ_AT});
    // The other recipient's row is untouched: a tick settles the row its own
    // provider id names, and `campaign_recipients_provider_message_idx` is
    // deliberately not unique, so nothing structural enforces that for us.
    expect(walk.ledger.recipients[1]).toMatchObject({deliveredAt: null, readAt: null});
  });

  it("answers rather than throws for a provider id nothing holds", async () => {
    const walk = await runWhatsAppWalk();
    const processor = tickProcessor(walk.ledger, createWoztellAdapter({}, vi.fn(), () => NOW));

    // Every message sent before this release. `matched: false` is the expected
    // answer, not a failure: the route turns a throw into a 500, and a 500 is a
    // Woztell retry loop for a tick.
    const stranger = await processor.process(statusPayload("wamid.not-ours.1", "DELIVERED", TICK_AT));

    expect(stranger).toEqual({status: "delivery_recorded", matched: false});
  });
});

describe("Phase C2 — a scheduled email campaign, end to end", () => {
  /**
   * The email leg is composed here rather than called, because
   * `runProductionCampaigns` is module-private and builds the production
   * repository bag from `emailEnv()`, `appEnv()` and the Neon client — there is
   * no local database on this branch. The composition below is that function's
   * two steps in its order, and the source assertion that follows is what stops
   * the two drifting: the promotion is the leg that silently never fired, so a
   * walk that proved it while production had dropped it would prove nothing.
   */
  function emailLedger() {
    return createLedger(
      [{
        id: EMAIL_CAMPAIGN_ID,
        channel: "email",
        status: "scheduled",
        scheduledAt: SCHEDULED_AT,
        template: EMAIL_SOURCE_TEMPLATE,
        templateKey: null,
        completedAt: null,
      }],
      [{
        id: EMAIL_RECIPIENT_ID,
        campaignId: EMAIL_CAMPAIGN_ID,
        identity: {kind: "member", profileId: "member-1"},
        profileId: "member-1",
        email: "ada@example.test",
        locale: "en",
        variables: {displayName: "Ada Chan"},
        status: "queued",
        attemptCount: 0,
        claimedAt: null,
        claimExpiresAt: null,
        errorCode: null,
        blockedReason: null,
        providerMessageId: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
      }],
    );
  }

  function emailDependencies(
    ledger: Ledger,
    emailTransport: ReturnType<typeof createTestTransport>,
  ): CampaignRunnerDependencies {
    return {
      campaigns: ledger.campaignMutations,
      deliveries: {
        reserveEmail: async (_actor: unknown, input: never) => ledger.reserve("email", input),
        completeEmail: async (_actor: unknown, id: string, completion: DeliveryCompletion) =>
          ledger.complete(id, completion),
        retryEmailFailure: async (_actor: unknown, id: string) => ledger.retry(id),
      },
      staffTasks: {createOnce: vi.fn()},
      loadContext: async () => ({
        marketingConsent: true,
        emailSuppressed: false,
        unsubscribeUrl: "https://hkwtia.test/en/unsubscribe/token",
        unsubscribeOneClickUrl: "https://hkwtia.test/api/unsubscribe/token",
      }),
      // The REAL renderer, so the marketing footer and the RFC 8058 header are
      // produced by the code that produces them in production: `renderEmail`
      // throws `MARKETING_UNSUBSCRIBE_URL_REQUIRED` without the pair above, and
      // inside a runner a throw is a permanent failure plus a staff task.
      renderCampaign: createCampaignEmailRenderer("https://hkwtia.test/"),
      emailTransport,
      emailFrom: "WTIA <members@example.test>",
    } as unknown as CampaignRunnerDependencies;
  }

  it("promotes a due email campaign before the claim, then sends it once", async () => {
    const ledger = emailLedger();
    const emailTransport = createTestTransport();
    const dependencies = emailDependencies(ledger, emailTransport);

    // `runProductionCampaigns`, in order.
    const promotion = await ledger.campaignMutations.promoteScheduledCampaigns(null, NOW, "email");
    const summary = await runCampaignBatch(dependencies, {now: NOW, limit: 100});

    expect(promotion).toEqual({promoted: [EMAIL_CAMPAIGN_ID], blocked: []});
    expect(summary).toMatchObject({claimed: 1, sent: 1, skipped: 0, failed: 0, retried: 0});
    expect(ledger.recipients[0].status).toBe("sent");
    expect(ledger.campaigns[0]).toMatchObject({status: "completed", completedAt: NOW});

    expect(emailTransport.sends).toHaveLength(1);
    const sent = emailTransport.sends[0];
    expect(sent.to).toBe("ada@example.test");
    expect(sent.subject.trim()).not.toBe("");
    expect(sent.html).toContain("Ada Chan");
    // A marketing blast may never ship without its unsubscribe pair.
    expect(sent.headers["List-Unsubscribe"]).toBe("<https://hkwtia.test/api/unsubscribe/token>");
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.idempotencyKey).toBe(`campaign:${EMAIL_CAMPAIGN_ID}:${EMAIL_RECIPIENT_ID}:email`);
  });

  it("leaves a scheduled email campaign undrainable if nothing promotes it", async () => {
    const ledger = emailLedger();
    const emailTransport = createTestTransport();

    const summary = await runCampaignBatch(emailDependencies(ledger, emailTransport), {now: NOW, limit: 100});

    // The failure the promotion exists to prevent, pinned as a fact rather than
    // left as a claim: the `due` CTE cannot see `scheduled`, so the batch is
    // indistinguishable from an empty queue and the campaign is silent for ever.
    expect(summary).toMatchObject({claimed: 0, sent: 0});
    expect(ledger.campaigns[0].status).toBe("scheduled");
    expect(emailTransport.sends).toEqual([]);
  });

  it("keeps the production hourly runner composing those two steps in that order", () => {
    const runners = readFileSync("lib/jobs/runners.ts", "utf8");
    const body = runners.slice(runners.indexOf("async function runProductionCampaigns"));
    const promotion = body.indexOf('promoteScheduledCampaigns(automationCronActor(), now, "email")');
    const batch = body.indexOf("return runCampaignBatch(");

    expect(promotion, "runProductionCampaigns must promote due email campaigns").toBeGreaterThan(-1);
    expect(batch, "runProductionCampaigns must run the email batch").toBeGreaterThan(-1);
    expect(promotion, "the promotion must run before the claim, or a scheduled campaign is invisible to it")
      .toBeLessThan(batch);
  });
});
