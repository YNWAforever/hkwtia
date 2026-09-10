import {describe, expect, it, vi} from "vitest";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {sendInboxReply, type InboxReplyDependencies} from "@/lib/admin/inbox-action-core";
import {
  createWoztellWebhookProcessor,
  type WoztellDeliveryStatusEvent,
  type WoztellInboundClaim,
  type WoztellInboundClaimInput,
  type WoztellWebhookProcessorDependencies,
} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {derivedMessageDirection} from "@/lib/db/message-direction";
import type {InboxTranscript, QueuedStaffMessage} from "@/lib/db/repos/inbox";
import type {MessageDeliveryStatus} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Phase C1 acceptance — the half of the §6 gate no browser can stand in for
 * (plan Task 12, docs/superpowers/plans/2026-09-10-phase-c1-whatsapp-human-lane.md).
 *
 * The two halves of C-1 are built in different modules and meet nowhere else:
 * the webhook processor (Tasks 2-4) persists what arrives, and the staff reply
 * lane (Tasks 6-7) writes the row that leaves. `tests/e2e/` drives the browser
 * but cannot see a `messages` row, and every unit test on either side stops at
 * its own boundary — so nothing until now followed one reply from the inbound
 * that opened its window through `queued → sent → delivered`.
 *
 * There is no local database (CLAUDE.md), so the ledger below stands in for the
 * four statements this walk touches — `claimInbound`'s insert,
 * `queueStaffMessage`'s write-ahead INSERT, `settleStaffMessage`'s guarded
 * UPDATE and `recordDeliveryStatus`'s forward-only UPDATE — and mirrors each
 * one's GUARD rather than its SQL. Everything above them is the real thing: the
 * real normaliser, the real processor branches, the real `sendInboxReply`
 * ordering, and the real WOZTELL adapter in its credential-free mock mode. That
 * last part is D-4 and is why the provider id ticked off here is a `mock:` one:
 * every flow in this phase must be exercisable without a live token, and C-9 is
 * a flag flip rather than a rewrite.
 */

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";
const PHONE = "+85290000000";
const INBOUND_PROVIDER_ID = "wamid.phase-c1.inbound.1";

const NOW = new Date("2026-09-10T12:00:00.000Z");
/** One hour in, so the 24-hour customer-service window is genuinely open. */
const RECEIVED_AT = new Date(NOW.getTime() - 60 * 60 * 1_000);
const TICK_AT = new Date(NOW.getTime() + 30 * 1_000);

const staff: Actor = {kind: "staff", userId: "staff-user", profileId: "staff-1"};

/** The lease `queueStaffMessage` takes (S-8). Two minutes, from the fixture clock. */
const SEND_CLAIM_MS = 2 * 60 * 1_000;

/**
 * `ARRAY['queued','sent','delivered','read','failed']`, verbatim from
 * `lib/db/repos/woztell-inbound-events.ts::deliveryOrder`. A tick may only ever
 * move a row forward along it.
 */
const DELIVERY_ORDER = ["queued", "sent", "delivered", "read", "failed"] as const;

type LedgerRow = {
  id: string;
  role: "user" | "assistant" | "tool" | "staff";
  direction: "inbound" | "outbound";
  content: string;
  deliveryStatus: MessageDeliveryStatus | null;
  providerMessageId: string | null;
  outboundKey: string | null;
  errorCode: string | null;
  deliveredAt: Date | null;
  sendClaimExpiresAt: Date | null;
};

type StaffQueueInput = Readonly<{
  conversationId: string;
  kind: "session" | "template";
  content: string;
  templateKey: string | null;
  outboundKey: string;
}>;

type StaffSettleInput = Readonly<{
  outboundKey: string;
  outcome:
    | Readonly<{status: "sent"; providerId: string}>
    | Readonly<{status: "failed"; errorCode: string}>;
}>;

function createLedger() {
  const rows: LedgerRow[] = [];
  /** Every delivery-state write, in order — the assertion this file exists for. */
  const transitions: MessageDeliveryStatus[] = [];
  const conversation = {
    handling: "human" as "bot" | "human" | "closed",
    lastInboundAt: null as Date | null,
    assignedToProfileId: "staff-1" as string | null,
  };

  const append = (row: Omit<LedgerRow, "id">): LedgerRow => {
    const stored: LedgerRow = {id: `message-${rows.length + 1}`, ...row};
    rows.push(stored);
    return stored;
  };

  const byOutboundKey = (outboundKey: string) =>
    rows.find((row) => row.outboundKey === outboundKey);

  return {
    rows,
    transitions,
    conversation,

    /**
     * `claimInbound`, reduced to the two facts this walk needs: redelivery of a
     * provider id we already hold is a duplicate, and an accepted inbound opens
     * the window by writing `conversations.last_inbound_at` (never
     * `last_message_at`, which an outbound reply bumps).
     */
    claimInbound: async (input: WoztellInboundClaimInput): Promise<WoztellInboundClaim> => {
      if (rows.some((row) => row.providerMessageId === input.providerMessageId)) {
        return {status: "duplicate"};
      }
      append({
        role: "user",
        // Through the shared twin, never a literal: `messages.direction`
        // defaults to 'inbound' (S-4) and a hand-written value that drifted
        // would be invisible to the type checker.
        direction: derivedMessageDirection({role: "user"}),
        content: input.content,
        deliveryStatus: null,
        providerMessageId: input.providerMessageId,
        outboundKey: null,
        errorCode: null,
        deliveredAt: null,
        sendClaimExpiresAt: null,
      });
      conversation.lastInboundAt = input.receivedAt;
      return {
        status: "accepted",
        conversationId: CONVERSATION_ID,
        owner: input.owner,
        profileId: input.profileId,
        locale: input.locale,
        memberName: input.memberName,
        whatsappOptIn: input.whatsappOptIn,
        handling: conversation.handling,
        assignedToProfileId: conversation.assignedToProfileId,
        lastInboundAt: conversation.lastInboundAt,
      };
    },

    /**
     * `queueStaffMessage`, reduced to its dispositions (S-8). The insert is the
     * write-ahead row; the conflict arm re-claims only an ABANDONED claim, so a
     * live one answers `already_queued` and the caller never reaches the
     * adapter. That short-circuit is the difference between one WhatsApp
     * message and two.
     */
    queueStaffMessage: async (_actor: Actor, input: unknown): Promise<QueuedStaffMessage> => {
      const request = input as StaffQueueInput;
      const recipient = {
        phoneE164: PHONE,
        profileId: null,
        contactId: CONTACT_ID,
        // False, and deliberately not tidied: `upsertFromWhatsApp` never sets
        // the marketing flag, so every prospect who writes in is `false`
        // forever. The reply still goes out, because `adapterRecipient` derives
        // the adapter's consent from the eligibility answer instead (S-9).
        whatsappOptIn: false,
      } as const;
      const settled = {
        conversationId: CONVERSATION_ID,
        outboundKey: request.outboundKey,
        recipient,
        lastInboundAt: conversation.lastInboundAt,
      };

      const existing = byOutboundKey(request.outboundKey);
      if (!existing) {
        const row = append({
          role: "staff",
          direction: derivedMessageDirection({role: "staff"}),
          content: request.content,
          deliveryStatus: "queued",
          providerMessageId: null,
          outboundKey: request.outboundKey,
          errorCode: null,
          deliveredAt: null,
          sendClaimExpiresAt: new Date(NOW.getTime() + SEND_CLAIM_MS),
        });
        transitions.push("queued");
        return {...settled, messageId: row.id, disposition: "queued"};
      }

      const claimLive = existing.sendClaimExpiresAt !== null
        && existing.sendClaimExpiresAt.getTime() > NOW.getTime();
      if (existing.deliveryStatus === "queued" && !claimLive) {
        existing.sendClaimExpiresAt = new Date(NOW.getTime() + SEND_CLAIM_MS);
        transitions.push("queued");
        return {...settled, messageId: existing.id, disposition: "queued"};
      }
      return {
        ...settled,
        messageId: existing.id,
        disposition: existing.deliveryStatus === "queued" ? "already_queued" : "already_sent",
      };
    },

    /** `settleStaffMessage`: guarded on `delivery_status = 'queued'`, clears the claim either way. */
    settleStaffMessage: async (_actor: Actor, input: unknown): Promise<void> => {
      const request = input as StaffSettleInput;
      const row = byOutboundKey(request.outboundKey);
      if (!row || row.deliveryStatus !== "queued") return;
      row.sendClaimExpiresAt = null;
      if (request.outcome.status === "failed") {
        row.deliveryStatus = "failed";
        row.errorCode = request.outcome.errorCode;
        transitions.push("failed");
        return;
      }
      row.deliveryStatus = "sent";
      row.providerMessageId = request.outcome.providerId;
      transitions.push("sent");
    },

    /**
     * `recordDeliveryStatus`: reaches an OUTBOUND row by its provider id and may
     * only move it forward. A NULL `delivery_status` never matches — in
     * Postgres because `array_position(…, NULL)` is NULL, here explicitly — so
     * an inbound row and a web reply are both untouched by a tick.
     */
    recordDeliveryStatus: async (
      event: WoztellDeliveryStatusEvent,
    ): Promise<Readonly<{matched: boolean}>> => {
      const row = rows.find((candidate) =>
        candidate.providerMessageId === event.providerMessageId
        && candidate.direction === "outbound");
      if (!row || row.deliveryStatus === null) return {matched: false};
      const current = DELIVERY_ORDER.indexOf(row.deliveryStatus);
      const next = DELIVERY_ORDER.indexOf(event.status);
      if (current >= next) return {matched: false};
      row.deliveryStatus = event.status;
      if (event.status === "delivered" || event.status === "read") {
        row.deliveredAt = row.deliveredAt ?? event.occurredAt;
      }
      if (event.status === "failed") row.errorCode = event.errorCode;
      transitions.push(event.status);
      return {matched: true};
    },

    transcript: (): InboxTranscript => ({
      conversation: {
        id: CONVERSATION_ID,
        channel: "whatsapp",
        locale: "en",
        status: "active",
        handling: conversation.handling,
        ownerLabel: null,
        profileId: null,
        contactId: CONTACT_ID,
        assignedToProfileId: conversation.assignedToProfileId,
        assigneeLabel: "Staff One",
        lastMessage: rows.at(-1)?.content ?? null,
        lastMessageAt: conversation.lastInboundAt,
        lastInboundAt: conversation.lastInboundAt,
        lastStaffReadAt: null,
        unread: true,
        messageCount: rows.length,
        escalated: false,
      },
      messages: rows.map((row) => ({
        id: row.id,
        role: row.role,
        direction: row.direction,
        channel: "whatsapp" as const,
        content: row.content,
        deliveryStatus: row.deliveryStatus,
        templateKey: null,
        errorCode: row.errorCode,
        createdAt: NOW,
      })),
    }),
  };
}

type Ledger = ReturnType<typeof createLedger>;

const CONCIERGE_TEMPLATES: ReadonlySet<WhatsAppTemplateKey> = new Set<WhatsAppTemplateKey>([
  "concierge_follow_up_en",
  "concierge_follow_up_zh_hk",
]);

function processorDependencies(ledger: Ledger, channel: ReturnType<typeof createWoztellAdapter>) {
  const notified: string[] = [];
  const startTurn = vi.fn(async () => {
    // Not a stub returning an empty turn: the human lane must return BEFORE the
    // concierge is reached, and a silent no-op would let that regress unseen.
    throw new Error("CONCIERGE_STARTED_A_TURN_ON_A_HUMAN_HANDLED_THREAD");
  });
  const dependencies: WoztellWebhookProcessorDependencies = {
    channel,
    resolveProfile: vi.fn(async () => null),
    claimInbound: ledger.claimInbound,
    recordContact: vi.fn(async () => ({id: CONTACT_ID})),
    recordDeliveryStatus: ledger.recordDeliveryStatus,
    notifyAssignee: vi.fn(async (input) => {
      notified.push(input.conversationId);
    }),
    markCompleted: vi.fn(async () => undefined),
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {startTurn},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: () => "a".repeat(64),
    approvedTemplateKeys: CONCIERGE_TEMPLATES,
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
  };
  return {dependencies, notified, startTurn};
}

function replyDependencies(
  ledger: Ledger,
  channel: ReturnType<typeof createWoztellAdapter>,
  /** Held open by the double-submit test so a second caller arrives mid-send. */
  hold: Promise<void> = Promise.resolve(),
) {
  /** The row's state at the moment the adapter was called — S-7's write-ahead, observed. */
  const statusAtSend: (MessageDeliveryStatus | null)[] = [];
  const dependencies: InboxReplyDependencies = {
    inbox: {
      getTranscript: async () => ledger.transcript(),
      queueStaffMessage: ledger.queueStaffMessage,
      settleStaffMessage: ledger.settleStaffMessage,
    },
    eligibility: {
      whatsAppEligibility: async () => ({status: "eligible", phoneE164: PHONE}),
    },
    channel: {
      sendSessionMessage: async (input) => {
        statusAtSend.push(
          ledger.rows.find((row) => row.outboundKey === input.idempotencyKey)?.deliveryStatus ?? null,
        );
        await hold;
        return await channel.sendSessionMessage(input);
      },
      sendTemplateMessage: async (input) => await channel.sendTemplateMessage(input),
    },
    approvedTemplateKeys: () => CONCIERGE_TEMPLATES,
    now: () => NOW,
  };
  return {dependencies, statusAtSend};
}

/** The inbound envelope, in the only shape this repo has ever held (plan O-1). */
function inboundPayload() {
  return {
    from: PHONE,
    type: "TEXT",
    messageId: INBOUND_PROVIDER_ID,
    timestamp: RECEIVED_AT.toISOString(),
    data: {text: "Can a person help me with membership?"},
  };
}

/** The delivery-tick envelope. UNVERIFIED (O-1) — one shape, in one function. */
function statusPayload(messageId: string, status: string, at: Date = TICK_AT) {
  return {type: "MESSAGE_STATUS", messageId, timestamp: at.toISOString(), data: {status}};
}

function replyInput(content: string) {
  return {
    conversationId: CONVERSATION_ID,
    kind: "session" as const,
    content,
    templateKey: null,
    templateVariables: {},
  };
}

describe("Phase C1 — the WhatsApp human lane, end to end", () => {
  it("carries a staff reply from the inbound that opened the window through queued → sent → delivered", async () => {
    const ledger = createLedger();
    // The fixture clock is passed to the adapter as well as to the two cores:
    // `sendSessionMessage` runs its own window check against `now()`, so an
    // adapter left on the wall clock would refuse this reply the day this file
    // is more than 24 hours older than `RECEIVED_AT`.
    const channel = createWoztellAdapter({}, vi.fn(), () => NOW);
    const {dependencies: processorDeps, notified, startTurn} = processorDependencies(ledger, channel);
    const processor = createWoztellWebhookProcessor(processorDeps);

    const inbound = await processor.process(inboundPayload());

    // The human lane: persisted, staff told, and no bot turn — the interlock is
    // read from the row `claimInbound` locked, not re-checked afterwards.
    expect(inbound).toEqual({status: "human_handled"});
    expect(notified).toEqual([CONVERSATION_ID]);
    expect(startTurn).not.toHaveBeenCalled();
    expect(ledger.conversation.lastInboundAt).toEqual(RECEIVED_AT);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({direction: "inbound", deliveryStatus: null});

    const {dependencies: replyDeps, statusAtSend} = replyDependencies(ledger, channel);
    const sent = await sendInboxReply(staff, replyInput("Yes — happy to help."), replyDeps);

    expect(sent.status).toBe("sent");
    // The row was already in the delivery ledger when the adapter was called.
    // Reverse that order and a send that crashes mid-flight leaves no row, no
    // audit row and no evidence the member was ever messaged (S-7).
    expect(statusAtSend).toEqual(["queued"]);
    const outbound = ledger.rows.find((row) => row.id === sent.messageId);
    expect(outbound).toMatchObject({role: "staff", direction: "outbound", deliveryStatus: "sent"});
    // D-4: mock mode, so nothing left the building and no credential was needed.
    // The id is still the handle every later tick arrives against.
    const providerId = outbound?.providerMessageId ?? "";
    expect(providerId).toMatch(/^mock:inbox:/);

    const tick = await processor.process(statusPayload(providerId, "delivered"));

    expect(tick).toEqual({status: "delivery_recorded", matched: true});
    expect(ledger.transitions).toEqual(["queued", "sent", "delivered"]);
    expect(ledger.rows.find((row) => row.id === sent.messageId)).toMatchObject({
      deliveryStatus: "delivered",
      deliveredAt: TICK_AT,
    });
  });

  it("never walks a tick backwards, and answers rather than throws for an id it does not hold", async () => {
    const ledger = createLedger();
    const channel = createWoztellAdapter({}, vi.fn(), () => NOW);
    const {dependencies: processorDeps} = processorDependencies(ledger, channel);
    const processor = createWoztellWebhookProcessor(processorDeps);
    await processor.process(inboundPayload());
    const {dependencies: replyDeps} = replyDependencies(ledger, channel);
    const sent = await sendInboxReply(staff, replyInput("On it."), replyDeps);
    const providerId = ledger.rows.find((row) => row.id === sent.messageId)?.providerMessageId ?? "";
    await processor.process(statusPayload(providerId, "read"));

    // Provider retries and reorders. A late 'sent' after a 'read' must not undo
    // it, and the answer is a classification rather than an error: the route
    // turns a throw into a 500, and a 500 is a Woztell retry loop for a tick.
    const late = await processor.process(statusPayload(providerId, "sent"));
    expect(late).toEqual({status: "delivery_recorded", matched: false});

    // Every message sent before this release, and the inbound row itself, are
    // ids we hold no outbound row for. `matched: false` is the expected answer,
    // not a failure.
    const stranger = await processor.process(statusPayload("wamid.not-ours.1", "delivered"));
    expect(stranger).toEqual({status: "delivery_recorded", matched: false});
    const inboundTick = await processor.process(statusPayload(INBOUND_PROVIDER_ID, "delivered"));
    expect(inboundTick).toEqual({status: "delivery_recorded", matched: false});

    expect(ledger.transitions).toEqual(["queued", "sent", "read"]);
  });

  it("refuses a second submit of the same draft before the adapter, so one row is one message", async () => {
    const ledger = createLedger();
    const channel = createWoztellAdapter({}, vi.fn(), () => NOW);
    const {dependencies: processorDeps} = processorDependencies(ledger, channel);
    await createWoztellWebhookProcessor(processorDeps).process(inboundPayload());
    // The first send is held inside the adapter, which is the only window in
    // which the claim is live and unsettled — the state a double-click, or a
    // Server Action the client retried, actually arrives in.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const {dependencies: replyDeps, statusAtSend} = replyDependencies(ledger, channel, held);

    // Two submits of one draft mint the same deterministic `outbound_key`, so
    // the second finds that live claim. It must short-circuit BEFORE the
    // adapter: one `messages` row sent twice is two WhatsApp messages to the
    // member, and one audit row that says otherwise (S-8).
    const first = sendInboxReply(staff, replyInput("Twice-clicked."), replyDeps);
    await vi.waitFor(() => expect(statusAtSend).toHaveLength(1));
    await expect(sendInboxReply(staff, replyInput("Twice-clicked."), replyDeps))
      .rejects.toThrow("SEND_IN_PROGRESS");
    release();
    const settled = await first;

    expect(statusAtSend).toEqual(["queued"]);
    expect(ledger.rows.filter((row) => row.role === "staff")).toHaveLength(1);
    expect(ledger.transitions).toEqual(["queued", "sent"]);
    expect(ledger.rows.find((row) => row.id === settled.messageId)?.deliveryStatus).toBe("sent");
  });
});
