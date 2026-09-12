import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {createWoztellWebhookProcessor} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {createSuppressionsRepository, unsubscribeActor} from "@/lib/db/repos/suppressions";
import {woztellInboundTextPayload} from "@/tests/fixtures/woztell";

const dialect = new PgDialect();
const NOW = new Date("2026-09-11T02:00:00.000Z");
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "member-1";
const SENDER = "+85290000000";

function stopPayload(messageId: string) {
  return {...woztellInboundTextPayload, messageId, data: {text: "STOP"}};
}

/**
 * The consent state of ONE member, behind the real
 * `suppressionsRepository.optOutWhatsApp`, so this file tests what the webhook
 * and the repository do TOGETHER. That pairing is the subject: each half is
 * individually correct and the composition was not, so a fake `recordOptOut`
 * (which is what every other webhook fixture uses) cannot see the defect at all.
 *
 * The two responses that carry the whole story:
 *   - the guarded `UPDATE profiles … WHERE whatsapp_opt_in = true` matches only
 *     while the grant is still standing, exactly as Postgres would;
 *   - the suppression INSERT conflicts on
 *     `message_suppressions_profile_channel_classification_unique` once a row
 *     exists, and nothing in the tree ever deletes one.
 */
function consentStore(initial: Readonly<{optIn: boolean; suppressed: boolean}>) {
  const state = {...initial};
  const audits: {sql: string; params: readonly unknown[]}[] = [];
  const execute = vi.fn(async (query: never) => {
    const compiled = dialect.sqlToQuery(query);
    // `--` comments run to the end of a line; strip them before collapsing, the
    // way `tests/unit/suppressions-whatsapp.test.ts` does.
    const text = compiled.sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (text.startsWith(`update "profiles"`)) {
      if (!state.optIn) return [];
      state.optIn = false;
      return [{id: PROFILE_ID}];
    }
    if (text.startsWith("select")) return [{id: PROFILE_ID}];
    if (text.startsWith(`insert into "message_suppressions"`)) {
      if (state.suppressed) return [];
      state.suppressed = true;
      return [{id: "suppression-1"}];
    }
    if (text.startsWith(`insert into "audit_events"`)) {
      audits.push({sql: compiled.sql, params: compiled.params});
      return [];
    }
    return [];
  });
  const database = {
    execute,
    async transaction<T>(work: (transaction: {execute: typeof execute}) => Promise<T>): Promise<T> {
      return await work({execute});
    },
  };
  return {state, audits, database: database as never};
}

function auditMetadata(entry: {params: readonly unknown[]} | undefined): unknown {
  const raw = (entry?.params ?? []).find((value) => typeof value === "string" && value.includes("reasonCode"));
  return JSON.parse(String(raw));
}

function conciergeTurn(text = "Welcome") {
  return {
    conversationId: CONVERSATION_ID,
    runId: "33333333-3333-4333-8333-333333333333",
    events: {
      async *[Symbol.asyncIterator]() {
        yield {event: "delta", data: {text}} as const;
        yield {event: "done", data: {citations: [], escalationId: null}} as const;
      },
    },
    cancel: vi.fn(async () => undefined),
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const adapter = createWoztellAdapter({}, vi.fn(), () => NOW);
  return {
    channel: {
      ...adapter,
      sendSessionMessage: vi.fn(adapter.sendSessionMessage),
      sendTemplateMessage: vi.fn(adapter.sendTemplateMessage),
    },
    resolveProfile: vi.fn(async () => null),
    claimInbound: vi.fn(async (input: Record<string, unknown>) => ({
      status: "accepted" as const,
      conversationId: CONVERSATION_ID,
      owner: input.owner,
      profileId: input.profileId,
      locale: input.locale,
      memberName: input.memberName,
      whatsappOptIn: input.whatsappOptIn,
      handling: "bot" as const,
      assignedToProfileId: null,
      lastInboundAt: null,
    })),
    recordContact: vi.fn(async () => ({id: CONTACT_ID})),
    recoverRun: vi.fn(async () => ({status: "start_new" as const})),
    markRunOwned: vi.fn(async () => undefined),
    markReplyReady: vi.fn(async () => undefined),
    markCompleted: vi.fn(async () => undefined),
    setWhatsappOptIn: vi.fn(async () => undefined),
    concierge: {startTurn: vi.fn(async () => conciergeTurn())},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: vi.fn(() => "a".repeat(64)),
    approvedTemplateKeys: new Set<WhatsAppTemplateKey>([
      "concierge_follow_up_en",
      "concierge_follow_up_zh_hk",
    ]),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
    ...overrides,
  };
}

describe("WhatsApp STOP writes an audit row for every genuine withdrawal (boundary 11)", () => {
  /**
   * The regression this file exists for. C-1 made the profile flag TRANSITION
   * the second, independent evidence of a new withdrawal — and the webhook
   * cleared the flag itself, unaudited, before `recordOptOut` could see it, so
   * the evidence was always already spent by the time the repository looked.
   *
   * The sequence is the real one, not a contrived one: STOP, re-consent from
   * the portal (nothing in the tree deletes the suppression row), STOP again.
   * The second STOP is a member-initiated consent change with legal weight and
   * it left no trace anywhere.
   */
  it("audits a second withdrawal that follows a portal re-consent", async () => {
    const store = consentStore({optIn: true, suppressed: false});
    const suppressions = createSuppressionsRepository(async () => store.database);
    const setWhatsappOptIn = vi.fn(async (_profileId: string, optedIn: boolean) => {
      store.state.optIn = optedIn;
    });
    const deps = dependencies({
      resolveProfile: vi.fn(async () => ({
        id: PROFILE_ID,
        displayName: "Ada",
        locale: "en" as const,
        whatsappOptIn: store.state.optIn,
      })),
      setWhatsappOptIn,
      recordOptOut: vi.fn(async (input: Readonly<{profileId: string | null; phoneE164: string}>) => {
        if (input.profileId) {
          await suppressions.optOutWhatsApp(unsubscribeActor(), input.profileId, "whatsapp_stop");
        }
      }),
    });
    const processor = createWoztellWebhookProcessor(deps as never);

    await expect(processor.process(stopPayload("wamid.stop.1"))).resolves.toEqual({status: "opted_out"});
    expect(store.audits).toHaveLength(1);
    expect(store.state.optIn).toBe(false);

    // The member changes their mind in the portal. `lib/portal/command-core.ts`
    // sets the flag back; the suppression row from the first STOP stays.
    store.state.optIn = true;

    await expect(processor.process(stopPayload("wamid.stop.2"))).resolves.toEqual({status: "opted_out"});
    expect(store.audits).toHaveLength(2);
    // The flag transition is what recorded it: the suppression could not, because
    // the row from the first withdrawal is still there.
    expect(auditMetadata(store.audits[1])).toEqual({
      reasonCode: "whatsapp_stop",
      clearedOptIn: true,
      suppressionCreated: false,
    });
  });

  /**
   * The other half of the same contract, and the reason the fix is an ordering
   * change rather than an unconditional audit INSERT: a Woztell REDELIVERY of
   * the same STOP must stay silent. The route 500s on a throw, so redeliveries
   * are routine, and a second `consent.whatsapp.revoked` row for one withdrawal
   * is a fiction. Nothing about a redelivery is a new consent change — the flag
   * is already false and the suppression conflicts.
   */
  it("writes nothing more when Woztell redelivers the same STOP", async () => {
    const store = consentStore({optIn: true, suppressed: false});
    const suppressions = createSuppressionsRepository(async () => store.database);
    const deps = dependencies({
      resolveProfile: vi.fn(async () => ({
        id: PROFILE_ID,
        displayName: "Ada",
        locale: "en" as const,
        whatsappOptIn: store.state.optIn,
      })),
      setWhatsappOptIn: vi.fn(async (_profileId: string, optedIn: boolean) => {
        store.state.optIn = optedIn;
      }),
      recordOptOut: vi.fn(async (input: Readonly<{profileId: string | null; phoneE164: string}>) => {
        if (input.profileId) {
          await suppressions.optOutWhatsApp(unsubscribeActor(), input.profileId, "whatsapp_stop");
        }
      }),
    });
    const processor = createWoztellWebhookProcessor(deps as never);

    await processor.process(stopPayload("wamid.stop.retry"));
    expect(store.audits).toHaveLength(1);

    // Same message, delivered again after a failure further down the route.
    await processor.process(stopPayload("wamid.stop.retry"));
    expect(store.audits).toHaveLength(1);
  });
});

describe("the bot lane asks the same eligibility module the staff lane asks", () => {
  /**
   * `whatsappOptIn: profile?.whatsappOptIn ?? true` made every sender with no
   * profile opted in, and the bot lane read nothing else — so a PROSPECT whose
   * `contacts.whatsapp_opted_out_at` was stamped by their STOP got a concierge
   * reply the next time they wrote. The flag the gate read does not exist for a
   * prospect, and the column that records their withdrawal was never consulted.
   */
  it("does not answer a prospect whose withdrawal is recorded on the contact row", async () => {
    const checkSendEligibility = vi.fn(async () => ({status: "blocked" as const, reason: "opted_out" as const}));
    const deps = dependencies({checkSendEligibility});

    await expect(createWoztellWebhookProcessor(deps as never).process(woztellInboundTextPayload))
      .resolves.toEqual({status: "opted_out"});

    expect(checkSendEligibility).toHaveBeenCalledWith({
      profileId: null,
      contactId: CONTACT_ID,
      phoneE164: SENDER,
      purpose: "service",
    });
    expect(deps.concierge.startTurn).not.toHaveBeenCalled();
    expect(deps.channel.sendSessionMessage).not.toHaveBeenCalled();
  });

  /**
   * The control, so the assertion above cannot be satisfied by a gate that
   * simply stopped answering prospects: the §6 lane exists to serve exactly this
   * person, and `contacts.whatsapp_opt_in` is false for every one of them.
   */
  it("still answers a prospect who has not withdrawn", async () => {
    const deps = dependencies({
      checkSendEligibility: vi.fn(async () => ({status: "eligible" as const, phoneE164: SENDER})),
    });

    await createWoztellWebhookProcessor(deps as never).process(woztellInboundTextPayload);

    expect(deps.concierge.startTurn).toHaveBeenCalled();
  });

  /**
   * A reachability answer is not a consent answer. `messageEligibility` reads
   * the STORED number (`profiles.whatsapp_number` is free text, and a prospect
   * whose contact row is missing has no row at all), while this lane replies
   * into an open session on the number the message just arrived from. Blocking
   * on `no_number` would silence the concierge for every member whose stored
   * number carries a space, and `decideWhatsApp` tests the withdrawal first, so
   * a real STOP can never reach us wearing this reason.
   */
  it("answers anyway when the only objection is a missing stored number", async () => {
    const deps = dependencies({
      checkSendEligibility: vi.fn(async () => ({status: "blocked" as const, reason: "no_number" as const})),
    });

    await createWoztellWebhookProcessor(deps as never).process(woztellInboundTextPayload);

    expect(deps.concierge.startTurn).toHaveBeenCalled();
  });
});
