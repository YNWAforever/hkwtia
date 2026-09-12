import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {
  inboxReplyErrorCode,
  sendInboxReply,
  type InboxReplyDependencies,
  type InboxReplyErrorCode,
} from "@/lib/admin/inbox-action-core";
import {WoztellDeliveryFailure} from "@/lib/channels/woztell";
import {createInboxRepository, providerRefusedSend, SEND_CLAIM_LEASE_MS} from "@/lib/db/repos/inbox";
import type {InboxTranscript, QueuedStaffMessage} from "@/lib/db/repos/inbox";
import type {AutomationDatabase, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import type {MessageDeliveryStatus} from "@/lib/db/server-schema";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * C-2. The `outbound_key` dedupe window, walked over more than one send.
 *
 * Every other test in this lane sends ONE distinct draft, so none of them could
 * see the defect this file exists for: `outboundKeyFor` hashed only the draft,
 * `messages_outbound_key_unique` is permanent, and after C1 exempted
 * human-handled threads from both retention sweeps (lib/db/repos/chat-retention.ts,
 * lib/db/repos/conversations.ts) nothing ever deletes the row either. So the
 * dedupe was unbounded in time: the second time staff sent an identical
 * sentence into one thread — days later, to a prospect who had written in
 * again — the INSERT conflicted, the claim UPDATE refused a settled `sent` row,
 * the fallback SELECT answered `already_sent`, and `sendInboxReply` returned
 * before the adapter. The member received nothing.
 *
 * The ledger below mirrors the GUARDS of `queueStaffMessage` and
 * `settleStaffMessage` rather than their SQL — there is no local database
 * (CLAUDE.md) — and everything above it is the real `sendInboxReply`.
 */

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";
const PHONE = "+85290000000";

/** The exact scenario from the C1 review: a canned line, twice, two days apart. */
const CANNED = "Thanks — someone will come back to you shortly.";

const MONDAY = new Date("2026-09-07T09:00:00.000Z");
const WEDNESDAY = new Date("2026-09-09T09:00:00.000Z");

const staff: Actor = {kind: "staff", userId: "staff-user", profileId: "staff-1"};

/**
 * The composer's per-attempt tokens. `MONDAY_ATTEMPT` is the value that would
 * have been in `sessionStorage` on Monday; `WEDNESDAY_ATTEMPT` is what the
 * composer minted after Monday's send settled. Two attempts, two tokens — which
 * is the whole difference between a double-click and a deliberate re-send.
 */
const MONDAY_ATTEMPT = "55555555-5555-4555-8555-555555555555";
const WEDNESDAY_ATTEMPT = "66666666-6666-4666-8666-666666666666";

type Row = {
  id: string;
  outboundKey: string;
  content: string;
  deliveryStatus: MessageDeliveryStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  sendClaimExpiresAt: Date | null;
};

type Clock = {now: Date};

type QueueInput = Readonly<{conversationId: string; content: string; outboundKey: string}>;
type SettleInput = Readonly<{
  outboundKey: string;
  outcome: Readonly<{status: "sent"; providerId: string} | {status: "failed"; errorCode: string}>;
}>;

function createLedger(clock: Clock) {
  const rows: Row[] = [];
  const conversation = {lastInboundAt: null as Date | null};

  return {
    rows,
    conversation,

    transcript(): InboxTranscript {
      return {
        conversation: {
          id: CONVERSATION_ID,
          channel: "whatsapp",
          locale: "en",
          status: "active",
          handling: "human",
          ownerLabel: null,
          profileId: null,
          contactId: CONTACT_ID,
          assignedToProfileId: "staff-1",
          assigneeLabel: "Staff One",
          lastMessage: rows.at(-1)?.content ?? null,
          lastMessageAt: conversation.lastInboundAt,
          lastInboundAt: conversation.lastInboundAt,
          lastStaffReadAt: null,
          unread: true,
          messageCount: rows.length,
          escalated: false,
        },
        messages: [],
      };
    },

    /** The prospect writes in, which is what opens the 24-hour window. */
    receiveInbound(at: Date): void {
      conversation.lastInboundAt = at;
    },

    /**
     * `queueStaffMessage`'s three arms: the write-ahead INSERT under
     * `ON CONFLICT (outbound_key) DO NOTHING`, the claim UPDATE that may inherit
     * an abandoned claim or re-queue a definitively refused row, and the
     * fallback SELECT that maps everything else to a short-circuit.
     */
    queueStaffMessage: async (_actor: Actor, input: unknown): Promise<QueuedStaffMessage> => {
      const request = input as QueueInput;
      const settled = {
        conversationId: CONVERSATION_ID,
        outboundKey: request.outboundKey,
        recipient: {phoneE164: PHONE, profileId: null, contactId: CONTACT_ID, whatsappOptIn: false},
        lastInboundAt: conversation.lastInboundAt,
      } as const;

      const existing = rows.find((row) => row.outboundKey === request.outboundKey);
      if (!existing) {
        const row: Row = {
          id: `message-${rows.length + 1}`,
          outboundKey: request.outboundKey,
          content: request.content,
          deliveryStatus: "queued",
          providerMessageId: null,
          errorCode: null,
          sendClaimExpiresAt: new Date(clock.now.getTime() + SEND_CLAIM_LEASE_MS),
        };
        rows.push(row);
        return {...settled, messageId: row.id, disposition: "queued"};
      }

      const claimLive = existing.sendClaimExpiresAt !== null
        && existing.sendClaimExpiresAt.getTime() > clock.now.getTime();
      const retakeable = existing.deliveryStatus === "queued"
        || (existing.deliveryStatus === "failed"
          && existing.providerMessageId === null
          && existing.errorCode !== null
          // The repository's own classifier, not a copy of its true half: a
          // sixth failure code landing on the wrong side here would let this
          // fixture keep passing while the real claim statement changed.
          && providerRefusedSend(existing.errorCode));
      if (retakeable && !claimLive) {
        existing.deliveryStatus = "queued";
        existing.errorCode = null;
        existing.sendClaimExpiresAt = new Date(clock.now.getTime() + SEND_CLAIM_LEASE_MS);
        return {...settled, messageId: existing.id, disposition: "queued"};
      }
      return {
        ...settled,
        messageId: existing.id,
        disposition: existing.deliveryStatus === "queued" ? "already_queued" : "already_sent",
      };
    },

    /** `settleStaffMessage`: guarded on `queued`, clears the claim either way. */
    settleStaffMessage: async (_actor: Actor, input: unknown): Promise<void> => {
      const request = input as SettleInput;
      const row = rows.find((candidate) => candidate.outboundKey === request.outboundKey);
      if (!row || row.deliveryStatus !== "queued") return;
      row.sendClaimExpiresAt = null;
      if (request.outcome.status === "failed") {
        row.deliveryStatus = "failed";
        row.errorCode = request.outcome.errorCode;
        return;
      }
      row.deliveryStatus = "sent";
      row.providerMessageId = request.outcome.providerId;
    },
  };
}

type Ledger = ReturnType<typeof createLedger>;

function dependencies(
  ledger: Ledger,
  clock: Clock,
  options: {
    hold?: Promise<void>;
    sendSession?: (text: string) => Promise<void>;
  } = {},
) {
  /** Every text actually handed to the provider — the assertion this file exists for. */
  const delivered: string[] = [];
  let providerSequence = 0;
  const deps: InboxReplyDependencies = {
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
        if (options.hold) await options.hold;
        if (options.sendSession) await options.sendSession(input.text);
        delivered.push(input.text);
        providerSequence += 1;
        return {status: "sent", providerId: `mock:${providerSequence}`};
      },
      sendTemplateMessage: async () => ({status: "sent", providerId: "mock:template"}),
    },
    approvedTemplateKeys: () => new Set<WhatsAppTemplateKey>(["concierge_follow_up_en"]),
    now: () => clock.now,
  };
  return {deps, delivered};
}

function reply(content: string, attemptId: string) {
  return {
    conversationId: CONVERSATION_ID,
    kind: "session" as const,
    content,
    templateKey: null,
    templateVariables: {},
    attemptId,
  };
}

/** The code a rejected send reports, or the error itself if it carried none. */
async function codeOf(promise: Promise<unknown>): Promise<InboxReplyErrorCode | Error> {
  try {
    await promise;
    throw new Error("EXPECTED_REJECTION");
  } catch (error) {
    return inboxReplyErrorCode(error) ?? (error as Error);
  }
}

/**
 * The one place these two modules actually meet.
 *
 * Every other test on either side of this boundary substitutes the other:
 * `sendInboxReply`'s tests use a fake `queueStaffMessage`, and the repository's
 * tests hand-write the object it is called with. So nothing checked that the
 * object the action layer BUILDS parses under the schema the repository
 * ENFORCES — and `queueStaffMessageSchema` is `.strict()`, so one extra field
 * on the reply input is a ZodError two layers down, reported to staff as
 * "Check the message and the template" for every reply in the product, and
 * invisible to every incremental test in this lane.
 */
describe("the object sendInboxReply hands the repository", () => {
  it("parses under the repository's own strict schema", async () => {
    const dialect = new PgDialect();
    const conversationRow = {
      id: CONVERSATION_ID,
      channel: "whatsapp",
      handling: "human",
      last_inbound_at: MONDAY,
      profile_id: null,
      contact_id: CONTACT_ID,
      profile_whatsapp_number: null,
      profile_whatsapp_opt_in: false,
      contact_phone_e164: PHONE,
      contact_whatsapp_opt_in: false,
    };
    const results: Record<string, unknown>[][] = [[conversationRow], [{id: "message-1"}], []];
    const execute: AutomationSqlExecutor["execute"] = async (query) => {
      dialect.sqlToQuery(query);
      return {rows: results.shift() ?? []};
    };
    const database: AutomationDatabase = {execute, transaction: async (work) => work(database)};
    // The REAL repository method, so the real `.strict()` parse runs.
    const repository = createInboxRepository(async () => database);

    const clock: Clock = {now: MONDAY};
    const ledger = createLedger(clock);
    ledger.receiveInbound(new Date(MONDAY.getTime() - 60 * 60 * 1_000));
    const {deps} = dependencies(ledger, clock);

    await expect(sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), {
      ...deps,
      inbox: {...deps.inbox, queueStaffMessage: repository.queueStaffMessage},
    })).resolves.toMatchObject({status: "sent", messageId: "message-1"});
  });
});

describe("a staff reply that repeats an earlier sentence", () => {
  it("sends the same sentence into one thread on two different days", async () => {
    const clock: Clock = {now: MONDAY};
    const ledger = createLedger(clock);
    ledger.receiveInbound(new Date(MONDAY.getTime() - 60 * 60 * 1_000));
    const {deps, delivered} = dependencies(ledger, clock);

    const monday = await sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps);
    expect(monday.status).toBe("sent");

    // Two days later the prospect writes in again and staff answer with the
    // same canned line. An inbox runs on canned replies — the repository says
    // so itself (lib/db/repos/woztell-inbound-events.ts) — so this is the
    // ordinary case, not an edge one.
    clock.now = WEDNESDAY;
    ledger.receiveInbound(new Date(WEDNESDAY.getTime() - 60 * 60 * 1_000));
    const wednesday = await sendInboxReply(staff, reply(CANNED, WEDNESDAY_ATTEMPT), deps);

    expect(wednesday.status).toBe("sent");
    expect(wednesday.messageId).not.toBe(monday.messageId);
    // The member has to have received it twice. One entry here is a reply that
    // was reported to staff as sent and never left the building.
    expect(delivered).toEqual([CANNED, CANNED]);
    expect(ledger.rows).toHaveLength(2);
  });

  it("still refuses a second submit of the SAME attempt before the adapter", async () => {
    const clock: Clock = {now: MONDAY};
    const ledger = createLedger(clock);
    ledger.receiveInbound(new Date(MONDAY.getTime() - 60 * 60 * 1_000));
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const {deps, delivered} = dependencies(ledger, clock, {hold: held});

    // The double-click, and the Server Action a client retried: the first send
    // is inside the adapter, so its claim is live and unsettled.
    const first = sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps);
    await vi.waitFor(() => expect(ledger.rows).toHaveLength(1));
    expect(await codeOf(sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps))).toBe("SEND_IN_PROGRESS");
    release();
    await first;

    expect(delivered).toEqual([CANNED]);
    expect(ledger.rows).toHaveLength(1);
  });

  it("re-takes the same row when the provider definitively refused the send", async () => {
    const clock: Clock = {now: MONDAY};
    const ledger = createLedger(clock);
    ledger.receiveInbound(new Date(MONDAY.getTime() - 60 * 60 * 1_000));
    let refuse = true;
    const {deps, delivered} = dependencies(ledger, clock, {
      sendSession: async () => {
        if (!refuse) return;
        refuse = false;
        throw new WoztellDeliveryFailure("provider_client_error");
      },
    });

    expect(await codeOf(sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps))).toBe("DELIVERY_FAILED");
    // Staff press Send again on the same draft. A 4xx means nothing was queued
    // at WhatsApp, so this retry is a re-take of the one row, not a new one.
    const retried = await sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps);

    expect(retried.status).toBe("sent");
    expect(delivered).toEqual([CANNED]);
    expect(ledger.rows).toHaveLength(1);
  });

  it("tells staff an uncertain acceptance is uncertain rather than inviting a retry that does nothing", async () => {
    const clock: Clock = {now: MONDAY};
    const ledger = createLedger(clock);
    ledger.receiveInbound(new Date(MONDAY.getTime() - 60 * 60 * 1_000));
    const {deps, delivered} = dependencies(ledger, clock, {
      sendSession: async () => {
        // O-1's most likely bring-up failure: HTTP 200, WhatsApp delivers the
        // message, `providerId(body)` does not recognise the response shape.
        throw new WoztellDeliveryFailure("provider_unclassified_failure");
      },
    });

    // Not DELIVERY_FAILED. That string says "Try again shortly", and the claim
    // UPDATE will not re-take a row whose code leaves acceptance uncertain — so
    // the retry it invites answers `already_sent` while nothing is sent.
    expect(await codeOf(sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps))).toBe("DELIVERY_UNCERTAIN");
    expect(delivered).toEqual([]);

    // And the retry, if staff press Send anyway, must report itself honestly.
    const retried = await sendInboxReply(staff, reply(CANNED, MONDAY_ATTEMPT), deps);
    expect(retried.status).toBe("already_sent");
  });
});
