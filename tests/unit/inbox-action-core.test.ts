import {describe, expect, it, vi} from "vitest";

import {
  INBOX_REPLY_ERROR_CODES,
  adapterRecipient,
  inboxReplyErrorCode,
  outboundKeyFor,
  replyWindow,
  sendInboxReply,
  type InboxReplyDependencies,
  type InboxReplyErrorCode,
} from "@/lib/admin/inbox-action-core";
import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import type {SessionMessageInput, TemplateMessageInput} from "@/lib/channels/types";
import {CUSTOMER_SERVICE_WINDOW_MS, createWoztellAdapter, WoztellDeliveryFailure} from "@/lib/channels/woztell";
import type {InboxConversationSummary, QueuedStaffMessage} from "@/lib/db/repos/inbox";
import type {WhatsAppEligibility} from "@/lib/db/repos/message-eligibility";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";
const PHONE = "+85290000000";
/** The composer's per-attempt token (C-2). One send attempt, one value. */
const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ATTEMPT_ID = "66666666-6666-4666-8666-666666666666";

const NOW = new Date("2026-09-10T12:00:00.000Z");
/** Two hours inside the window, so the countdown is genuinely open. */
const RECENT_INBOUND = new Date(NOW.getTime() - 2 * 60 * 60 * 1_000);
/** The value the REPOSITORY reports, deliberately different from the summary's
 * so a test can tell which one reached the adapter. */
const PERSISTED_INBOUND = new Date(NOW.getTime() - 90 * 60 * 1_000);

const admin = {kind: "staff", userId: "staff-user", profileId: "staff-1"} as const;
const member = {kind: "member", userId: "member-user", profileId: "member-1"} as const;

function summary(overrides: Partial<InboxConversationSummary> = {}): InboxConversationSummary {
  return {
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
    lastMessage: "Hello",
    lastMessageAt: RECENT_INBOUND,
    lastInboundAt: RECENT_INBOUND,
    lastStaffReadAt: null,
    unread: true,
    messageCount: 2,
    escalated: false,
    ...overrides,
  };
}

function queued(overrides: Partial<QueuedStaffMessage> = {}): QueuedStaffMessage {
  return {
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    outboundKey: `inbox:${CONVERSATION_ID}:${"a".repeat(32)}`,
    disposition: "queued",
    // The prospect case, and the reason this fixture is not tidied to `true`:
    // `contacts.whatsapp_opt_in` is false for every prospect who ever messages
    // the WTIA number, which is the whole population Phase C exists to serve.
    recipient: {phoneE164: PHONE, profileId: null, contactId: CONTACT_ID, whatsappOptIn: false},
    lastInboundAt: PERSISTED_INBOUND,
    ...overrides,
  };
}

const eligible: WhatsAppEligibility = {status: "eligible", phoneE164: PHONE};

type Calls = {
  order: string[];
  session: SessionMessageInput[];
  template: TemplateMessageInput[];
  settled: unknown[];
};

function dependencies(overrides: {
  transcript?: InboxConversationSummary | null;
  eligibility?: WhatsAppEligibility;
  queued?: QueuedStaffMessage;
  queueError?: Error;
  sendSession?: InboxReplyDependencies["channel"]["sendSessionMessage"];
  sendTemplate?: InboxReplyDependencies["channel"]["sendTemplateMessage"];
  approved?: readonly WhatsAppTemplateKey[];
  channel?: InboxReplyDependencies["channel"];
} = {}) {
  const calls: Calls = {order: [], session: [], template: [], settled: []};
  const conversation = overrides.transcript === undefined ? summary() : overrides.transcript;
  const deps: InboxReplyDependencies = {
    inbox: {
      async getTranscript() {
        calls.order.push("getTranscript");
        return conversation === null ? null : {conversation, messages: []};
      },
      async queueStaffMessage() {
        calls.order.push("queueStaffMessage");
        if (overrides.queueError) throw overrides.queueError;
        return overrides.queued ?? queued();
      },
      async settleStaffMessage(_caller, input) {
        calls.order.push("settleStaffMessage");
        calls.settled.push(input);
      },
    },
    eligibility: {
      async whatsAppEligibility() {
        calls.order.push("whatsAppEligibility");
        return overrides.eligibility ?? eligible;
      },
    },
    channel: overrides.channel ?? {
      async sendSessionMessage(input) {
        calls.order.push("sendSessionMessage");
        calls.session.push(input);
        return overrides.sendSession
          ? await overrides.sendSession(input)
          : {status: "sent", providerId: "wamid.fake"};
      },
      async sendTemplateMessage(input) {
        calls.order.push("sendTemplateMessage");
        calls.template.push(input);
        return overrides.sendTemplate
          ? await overrides.sendTemplate(input)
          : {status: "sent", providerId: "wamid.fake"};
      },
    },
    approvedTemplateKeys: () => new Set<WhatsAppTemplateKey>(
      overrides.approved ?? ["concierge_follow_up_en"],
    ),
    now: () => NOW,
  };
  return {calls, deps};
}

const sessionReply = {
  conversationId: CONVERSATION_ID,
  kind: "session",
  content: "Thanks for writing in — the next intake opens in October.",
  templateKey: null,
  templateVariables: {},
  attemptId: ATTEMPT_ID,
} as const;

const templateReply = {
  conversationId: CONVERSATION_ID,
  kind: "template",
  content: "Follow-up",
  templateKey: "concierge_follow_up_en",
  templateVariables: {memberName: "Ada", supportUrl: "https://www.hkwtia.org/en/contact"},
  attemptId: ATTEMPT_ID,
} as const;

/** The code a rejected send reports, or the error itself if it carried none. */
async function codeOf(promise: Promise<unknown>): Promise<InboxReplyErrorCode | Error> {
  try {
    await promise;
    throw new Error("EXPECTED_REJECTION");
  } catch (error) {
    return inboxReplyErrorCode(error) ?? (error as Error);
  }
}

describe("outboundKeyFor", () => {
  it("mints the deterministic key shape lib/db/repos/inbox.ts parses", () => {
    const key = outboundKeyFor(sessionReply);
    // The repository's own regex, repeated verbatim: a key it refuses is a draft
    // that can never be sent, and the two are only kept in step by this pin.
    expect(key).toMatch(/^inbox:[0-9a-f-]{36}:[0-9a-f]{32}$/);
    expect(key.startsWith(`inbox:${CONVERSATION_ID}:`)).toBe(true);
    expect(outboundKeyFor(sessionReply)).toBe(key);
  });

  it("is deterministic in the draft, so a double-submit is one row and an edit is a new one", () => {
    expect(outboundKeyFor({...templateReply, templateVariables: {supportUrl: "https://www.hkwtia.org/en/contact", memberName: "Ada"}}))
      .toBe(outboundKeyFor(templateReply));
    expect(outboundKeyFor({...sessionReply, content: `${sessionReply.content}!`}))
      .not.toBe(outboundKeyFor(sessionReply));
    expect(outboundKeyFor({...templateReply, templateKey: "concierge_follow_up_zh_hk"}))
      .not.toBe(outboundKeyFor(templateReply));
  });

  /**
   * C-2(a). Deterministic in the draft ALONE made the dedupe window unbounded
   * in time: `messages_outbound_key_unique` is permanent and no retention sweep
   * touches a human-handled thread, so the second time staff sent an identical
   * canned line into one thread — days later — the key collided and the reply
   * was dropped. The attempt token is what bounds the window to one send.
   */
  it("is scoped to the send attempt, so the same sentence twice is two keys", () => {
    expect(outboundKeyFor({...sessionReply, attemptId: OTHER_ATTEMPT_ID}))
      .not.toBe(outboundKeyFor(sessionReply));
    // ...and unchanged within one attempt, which is the double-submit guard.
    expect(outboundKeyFor({...sessionReply})).toBe(outboundKeyFor(sessionReply));
  });
});

describe("replyWindow", () => {
  it("measures against the constant the adapter enforces, not a retyped 24 hours", () => {
    const opened = new Date(NOW.getTime() - CUSTOMER_SERVICE_WINDOW_MS + 60_000);
    expect(replyWindow(opened, NOW)).toEqual({state: "open", remainingMs: 60_000});
    expect(replyWindow(new Date(NOW.getTime() - CUSTOMER_SERVICE_WINDOW_MS - 1), NOW))
      .toEqual({state: "closed", remainingMs: 0});
  });

  it("calls a thread nobody has written into 'never', not 'open'", () => {
    // A zero `lastInboundAt` read as "the window opened at the epoch" would be
    // one thing; read as `open` it would offer staff a free-text reply into a
    // thread WhatsApp will refuse.
    expect(replyWindow(null, NOW)).toEqual({state: "never", remainingMs: 0});
    expect(replyWindow(new Date(Number.NaN), NOW)).toEqual({state: "never", remainingMs: 0});
  });
});

describe("adapterRecipient", () => {
  it("derives the adapter's consent gate from the eligibility answer, never from a literal", () => {
    // lib/channels/woztell.ts:72 refuses to send when `whatsappOptIn` is false.
    // The flag handed to it is the decision messageEligibility made for THIS
    // purpose, because `contacts.whatsapp_opt_in` is false for every prospect
    // forever (S-9 rule 3) and passing it would make a service reply to the
    // §6 gate's own scenario a silent `recipient_ineligible`.
    expect(adapterRecipient(eligible)).toEqual({whatsappNumber: PHONE, whatsappOptIn: true});
    expect(adapterRecipient({status: "blocked", reason: "opted_out"}))
      .toEqual({whatsappNumber: null, whatsappOptIn: false});
  });
});

describe("sendInboxReply", () => {
  it("refuses a non-admin actor before it reads anything", async () => {
    const {calls, deps} = dependencies();
    expect(await codeOf(sendInboxReply(member, sessionReply, deps))).toBe("FORBIDDEN");
    expect(calls.order).toEqual([]);
  });

  it("asks whether we may send before it writes the row, and writes nothing when the answer is no", async () => {
    const {calls, deps} = dependencies({eligibility: {status: "blocked", reason: "opted_out"}});
    expect(await codeOf(sendInboxReply(admin, sessionReply, deps))).toBe("OPTED_OUT");
    expect(calls.order).toContain("whatsAppEligibility");
    expect(calls.order).not.toContain("queueStaffMessage");
    expect(calls.order).not.toContain("sendSessionMessage");
  });

  it("refuses a free-text reply outside the window before the adapter, and before the row", async () => {
    const stale = new Date(NOW.getTime() - CUSTOMER_SERVICE_WINDOW_MS - 1_000);
    const {calls, deps} = dependencies({transcript: summary({lastInboundAt: stale})});
    expect(await codeOf(sendInboxReply(admin, sessionReply, deps))).toBe("WINDOW_CLOSED");
    // The audit row IS the commitment to send (S-7). Queueing a reply we then
    // refuse would file a commitment for a message that never left.
    expect(calls.order).not.toContain("queueStaffMessage");
    expect(calls.order).not.toContain("sendSessionMessage");
  });

  it("maps the adapter's own window refusal to the same code, so the countdown and the enforcement agree", async () => {
    const {calls, deps} = dependencies({
      sendSession: async () => ({status: "blocked", reason: "outside_customer_service_window"}),
    });
    expect(await codeOf(sendInboxReply(admin, sessionReply, deps))).toBe("WINDOW_CLOSED");
    expect(calls.settled).toEqual([{
      outboundKey: outboundKeyFor(sessionReply),
      outcome: {status: "failed", errorCode: "outside_customer_service_window"},
    }]);
  });

  it("takes lastCustomerMessageAt from the persisted row, not from the summary the page read", async () => {
    const {calls, deps} = dependencies();
    await sendInboxReply(admin, sessionReply, deps);
    expect(calls.session[0]?.lastCustomerMessageAt).toEqual(PERSISTED_INBOUND);
    expect(calls.session[0]?.lastCustomerMessageAt).not.toEqual(RECENT_INBOUND);
    expect(calls.session[0]?.idempotencyKey).toBe(outboundKeyFor(sessionReply));
  });

  it("sends to a prospect whose marketing flag is false, because a service reply is not marketing", async () => {
    const {calls, deps} = dependencies();
    await expect(sendInboxReply(admin, sessionReply, deps)).resolves.toEqual({status: "sent", messageId: MESSAGE_ID});
    expect(calls.session[0]?.whatsappOptIn).toBe(true);
    expect(calls.session[0]?.whatsappNumber).toBe(PHONE);
  });

  it("short-circuits before the adapter on both dispositions, and they mean different things", async () => {
    const sent = dependencies({queued: queued({disposition: "already_sent"})});
    await expect(sendInboxReply(admin, sessionReply, sent.deps))
      .resolves.toEqual({status: "already_sent", messageId: MESSAGE_ID});
    expect(sent.calls.order).not.toContain("sendSessionMessage");

    const inFlight = dependencies({queued: queued({disposition: "already_queued"})});
    expect(await codeOf(sendInboxReply(admin, sessionReply, inFlight.deps))).toBe("SEND_IN_PROGRESS");
    expect(inFlight.calls.order).not.toContain("sendSessionMessage");
  });

  /**
   * C-2. The code staff are shown is decided by whether the row this settles can
   * actually be re-taken, not by how the send failed — because the only thing
   * the message can honestly promise is what a second Send click will do.
   * `retryable_network`, `provider_acceptance_uncertain` and
   * `provider_unclassified_failure` are excluded from `PROVIDER_REFUSED_SEND`,
   * so the claim UPDATE will not re-take them and "Try again shortly" would
   * invite a click that answers `already_sent` while nothing is sent.
   */
  it("separates a definite provider refusal from an acceptance it cannot confirm", async () => {
    for (const [failure, code] of [
      ["provider_client_error", "DELIVERY_FAILED"],
      ["retryable_rate_limit", "DELIVERY_FAILED"],
      ["retryable_network", "DELIVERY_UNCERTAIN"],
      ["provider_acceptance_uncertain", "DELIVERY_UNCERTAIN"],
      ["provider_unclassified_failure", "DELIVERY_UNCERTAIN"],
    ] as const) {
      const {deps} = dependencies({
        sendSession: async () => {
          throw new WoztellDeliveryFailure(failure);
        },
      });
      expect(await codeOf(sendInboxReply(admin, sessionReply, deps)), failure).toBe(code);
    }
  });

  it("settles the row failed with the adapter's own code and rethrows", async () => {
    const {calls, deps} = dependencies({
      sendSession: async () => {
        throw new WoztellDeliveryFailure("provider_client_error");
      },
    });
    expect(await codeOf(sendInboxReply(admin, sessionReply, deps))).toBe("DELIVERY_FAILED");
    expect(calls.settled).toEqual([{
      outboundKey: outboundKeyFor(sessionReply),
      // Verbatim, not a summary: queueStaffMessage re-takes a refused row by
      // reading this code, so a substituted one makes the reply un-resendable.
      outcome: {status: "failed", errorCode: "provider_client_error"},
    }]);
  });

  it("refuses a template the picker would not offer, and an unknown key before sendTemplateMessage can throw on it", async () => {
    const unapproved = dependencies({approved: []});
    expect(await codeOf(sendInboxReply(admin, templateReply, unapproved.deps))).toBe("TEMPLATE_NOT_APPROVED");
    expect(unapproved.calls.order).not.toContain("sendTemplateMessage");

    // A bare property lookup on WHATSAPP_TEMPLATES is a TypeError mid-send.
    const unknown = dependencies();
    expect(await codeOf(sendInboxReply(admin, {...templateReply, templateKey: "not_a_template"}, unknown.deps)))
      .toBe("INVALID");
    expect(unknown.calls.order).not.toContain("sendTemplateMessage");
  });

  it("sends an approved template with the window shut, because that is what the picker is for", async () => {
    const {calls, deps} = dependencies({transcript: summary({lastInboundAt: null})});
    await expect(sendInboxReply(admin, templateReply, deps)).resolves.toEqual({status: "sent", messageId: MESSAGE_ID});
    expect(calls.template[0]?.template).toBe("concierge_follow_up_en");
    expect(calls.template[0]?.variables).toEqual(templateReply.templateVariables);
  });

  it("runs the whole flow through the mock adapter with no credentials at all (D-4)", async () => {
    // Not a fake: the real adapter, built the way the default dependencies build
    // it, with RUN_LIVE_WOZTELL unset. Nothing in this lane may need credentials
    // to be exercised, or C-9 stops being a flag flip.
    const live = process.env.RUN_LIVE_WOZTELL;
    delete process.env.RUN_LIVE_WOZTELL;
    try {
      // The adapter MUST read the same pinned clock the flow does. Left on its
      // wall-clock default it compares `NOW - 90min` (the fixed instant
      // `queued.lastInboundAt` carries) against today's date, so this test would
      // pass for 24 hours and then fail with WINDOW_CLOSED for a reason that has
      // nothing to do with the code — and the cheapest-looking repair would be to
      // weaken the one assertion that proves the D-4 no-credentials property.
      const {calls, deps} = dependencies({channel: createWoztellAdapter({}, undefined, () => NOW)});
      await expect(sendInboxReply(admin, sessionReply, deps)).resolves.toEqual({status: "sent", messageId: MESSAGE_ID});
      expect(calls.settled).toEqual([{
        outboundKey: outboundKeyFor(sessionReply),
        outcome: {status: "sent", providerId: `mock:${outboundKeyFor(sessionReply)}`},
      }]);
    } finally {
      if (live === undefined) delete process.env.RUN_LIVE_WOZTELL;
      else process.env.RUN_LIVE_WOZTELL = live;
    }
  });

  it("produces every code the composer can render, so no bundle string is unreachable", async () => {
    const produced = new Set<InboxReplyErrorCode>();
    const record = async (promise: Promise<unknown>) => {
      const outcome = await codeOf(promise);
      if (typeof outcome === "string") produced.add(outcome);
      else throw outcome;
    };

    await record(sendInboxReply(member, sessionReply, dependencies().deps));
    await record(sendInboxReply(admin, {...sessionReply, content: "   "}, dependencies().deps));
    await record(sendInboxReply(admin, sessionReply, dependencies({transcript: summary({lastInboundAt: null})}).deps));
    for (const [reason, code] of [
      ["not_opted_in", "NOT_OPTED_IN"],
      ["opted_out", "OPTED_OUT"],
      ["suppressed", "SUPPRESSED"],
      ["no_number", "NO_NUMBER"],
    ] as const) {
      // Each block reason keeps its own code: told the wrong one, staff chase
      // the wrong consent record.
      const promise = sendInboxReply(admin, sessionReply, dependencies({eligibility: {status: "blocked", reason}}).deps);
      const outcome = await codeOf(promise);
      expect(outcome, reason).toBe(code);
      produced.add(code);
    }
    await record(sendInboxReply(admin, sessionReply, dependencies({transcript: summary({channel: "web"})}).deps));
    await record(sendInboxReply(admin, sessionReply, dependencies({transcript: summary({handling: "bot"})}).deps));
    await record(sendInboxReply(admin, templateReply, dependencies({approved: []}).deps));
    await record(sendInboxReply(admin, sessionReply, dependencies({queued: queued({disposition: "already_queued"})}).deps));
    // The two halves of an adapter failure, and they are not interchangeable:
    // only a definite refusal leaves a row the claim UPDATE can re-take, so only
    // that one may be reported with a string that invites another Send click.
    await record(sendInboxReply(admin, sessionReply, dependencies({
      sendSession: async () => {
        throw new WoztellDeliveryFailure("provider_client_error");
      },
    }).deps));
    await record(sendInboxReply(admin, sessionReply, dependencies({
      sendSession: async () => {
        throw new WoztellDeliveryFailure("retryable_network");
      },
    }).deps));

    expect(produced).toEqual(new Set(INBOX_REPLY_ERROR_CODES));
  });

  it("lets the repository win the channel and handling race it holds the lock for", async () => {
    // The page-level checks above are a courtesy; the row-level ones are the
    // authority, because only queueStaffMessage holds FOR UPDATE.
    for (const message of ["INVALID_INBOX_CHANNEL", "INVALID_INBOX_HANDLING"] as const) {
      const {deps} = dependencies({queueError: new Error(message)});
      expect(await codeOf(sendInboxReply(admin, sessionReply, deps))).toBe(message);
    }
  });

  it("lets an authorization denial through untouched, so the wrapper can 404 it", async () => {
    const {deps} = dependencies({queueError: new Error("FORBIDDEN")});
    const outcome = await codeOf(sendInboxReply(admin, sessionReply, deps));
    expect(outcome).toBe("FORBIDDEN");
  });

  it("detects the shapes it is meant to catch", async () => {
    // Vacuous-pass guard: `codeOf` must not report a code for something that
    // resolved, and `inboxReplyErrorCode` must not classify a stray Error.
    const {deps} = dependencies();
    await expect(codeOf(sendInboxReply(admin, sessionReply, deps))).resolves.toBeInstanceOf(Error);
    expect(inboxReplyErrorCode(new Error("WINDOW_CLOSED"))).toBeNull();
    expect(INBOX_REPLY_ERROR_CODES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(INBOX_REPLY_ERROR_CODES).size).toBe(INBOX_REPLY_ERROR_CODES.length);
    expect(vi.isMockFunction(sendInboxReply)).toBe(false);
  });
});
