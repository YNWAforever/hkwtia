import {createHmac} from "node:crypto";

import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {createWoztellWebhookProcessor} from "@/lib/ai/woztell-webhook";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {createWoztellWebhookPostHandler} from "@/lib/api/woztell-webhook-route";
import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {createPostgresWoztellStore} from "@/lib/db/repos/woztell";
import {
  createWoztellInboundEventsRepository,
  woztellWebhookActor,
} from "@/lib/db/repos/woztell-inbound-events";

/**
 * C-1 review finding: a hostile provider field must not become a retry loop.
 *
 * The webhook route turns any throw into a 500 (`lib/api/woztell-webhook-route.ts`)
 * and Woztell retries a 500. The normaliser already fails closed — its own
 * comment says "nothing here may throw" — but four zod LENGTH BOUNDS sat behind
 * it, on fields whose values come straight from the provider:
 *
 *   - `whatsappMemberId`, max 200 (`lib/db/repos/contacts.ts`)
 *   - `providerMessageId`, max 300 (`lib/db/repos/woztell-inbound-events.ts`,
 *     in both the delivery-status and the outbound-echo schema)
 *   - `errorCode`, max 200 (same file)
 *   - the echo's `text`, max 20 000 (same file)
 *
 * A `ZodError` from any of them escapes `process()`, becomes a 500, and puts
 * that sender into a permanent retry loop: the message never persists, never
 * reaches staff, and the route burns an invocation on every redelivery.
 *
 * These walks are the REAL route handler over the REAL normaliser, the REAL
 * processor branches and the REAL repositories, because a faked
 * `recordDeliveryStatus` would never run the zod parse that is the defect. There
 * is no local database (CLAUDE.md), so the driver below records the SQL and the
 * bound parameters each statement would send and answers with the rows the walk
 * needs — which is as close to "the database state" as this tree gets, and is
 * the same fixture shape `tests/unit/woztell-inbound-events.test.ts` uses.
 *
 * **202 is the assertion that matters everywhere below.** A 500 is the only
 * answer that invites Woztell to send the same payload again.
 */

const SECRET = "credential-free-fixture-secret";
const NOW = new Date("2026-09-11T12:00:00.000Z");
const RECEIVED_AT = new Date("2026-09-11T11:00:00.000Z");
const SENDER = "85290000000";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Retyped rather than imported, deliberately. These four numbers ARE the zod
 * bounds in the two repositories; a change that moves one of them without moving
 * the clamp in the normaliser reopens the retry loop, and a test that imported
 * the same constant as the code would move with it and notice nothing.
 */
const MAX_MEMBER_ID_CHARS = 200;
const MAX_PROVIDER_MESSAGE_ID_CHARS = 300;
const MAX_ERROR_CODE_CHARS = 200;
const MAX_ECHO_TEXT_CHARS = 20_000;

const dialect = new PgDialect();

type Recorded = Readonly<{sql: string; params: readonly unknown[]}>;
/** Ordered; the first pattern whose regex matches the statement answers it. */
type Responder = readonly (readonly [RegExp, Record<string, unknown>[]])[];

function fakeDatabase(responder: Responder) {
  const queries: Recorded[] = [];
  const execute: AutomationSqlExecutor["execute"] = async (query) => {
    const compiled = dialect.sqlToQuery(query);
    // Normalised the way tests/unit/woztell-inbound-events.test.ts normalises:
    // drizzle keeps the template literal's own indentation, so an un-normalised
    // `startsWith("insert into")` never matches anything.
    const statement = compiled.sql.replace(/\s+/g, " ").trim().toLowerCase();
    queries.push({sql: statement, params: compiled.params});
    const matched = responder.find(([pattern]) => pattern.test(statement));
    return {rows: matched ? matched[1] : []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work(database),
  };
  return {queries, loadDatabase: async () => database};
}

/**
 * The production wiring's own composition (`lib/ai/woztell-production.ts`),
 * minus the concierge and the OpenAI adapter: the store spread, then the three
 * capability-actor writers minted at this one site because their `unique symbol`
 * signatures do not match the processor's `(event) => …` dependencies.
 */
function webhook(responder: Responder) {
  const {queries, loadDatabase} = fakeDatabase(responder);
  const store = createPostgresWoztellStore(() => NOW, loadDatabase);
  const contacts = createContactsRepository(loadDatabase);
  const events = createWoztellInboundEventsRepository(() => NOW, loadDatabase);
  const notified: string[] = [];
  const startTurn = vi.fn(async () => {
    // Not a stub returning an empty turn: every walk here ends before the bot
    // lane, and a silent no-op would let that regress unseen.
    throw new Error("CONCIERGE_STARTED_A_TURN_ON_A_HUMAN_HANDLED_THREAD");
  });
  const processor = createWoztellWebhookProcessor({
    channel: createWoztellAdapter({}, vi.fn(), () => NOW),
    ...store,
    async recordContact(input) {
      const contact = await contacts.upsertFromWhatsApp(
        contactWriterActor("whatsapp"),
        input,
      );
      return {id: contact.id};
    },
    async recordDeliveryStatus(event) {
      const {matched} = await events.recordDeliveryStatus(
        woztellWebhookActor(),
        event,
      );
      return {matched};
    },
    async recordOutboundEcho(event) {
      const {disposition} = await events.recordOutboundEcho(
        woztellWebhookActor(),
        event,
      );
      return {disposition};
    },
    async notifyAssignee(input) {
      notified.push(input.conversationId);
    },
    concierge: {startTurn},
    escalate: vi.fn(async () => undefined),
    anonymousOwnerHash: () => "a".repeat(64),
    approvedTemplateKeys: new Set<WhatsAppTemplateKey>(),
    supportUrl: "https://www.hkwtia.org/en/contact",
    now: () => NOW,
  });
  const post = createWoztellWebhookPostHandler({
    channel: createWoztellAdapter({WOZTELL_WEBHOOK_SECRET: SECRET}, vi.fn()),
    process: processor.process,
  });
  return {
    queries,
    notified,
    startTurn,
    async deliver(payload: unknown): Promise<Response> {
      const rawBody = JSON.stringify(payload);
      const headers = new Headers({
        "content-type": "application/json",
        "x-woztell-signature": createHmac("sha256", SECRET)
          .update(rawBody)
          .digest("base64"),
      });
      return await post(new Request(
        "https://www.hkwtia.org/api/webhooks/woztell",
        {method: "POST", headers, body: rawBody},
      ));
    },
  };
}

/** The stranger walk: no profile, a contact row, then a human-handled thread. */
const HUMAN_LANE: Responder = [
  [/^insert into "contacts"/, [{id: CONTACT_ID}]],
  [/^update "contacts"/, [{id: CONTACT_ID}]],
  [/^insert into "conversations"/, [{id: CONVERSATION_ID}]],
  [/^insert into "messages"/, [{id: MESSAGE_ID}]],
  [/^update "conversations"/, [{
    handling: "human",
    assigned_to_profile_id: null,
    last_inbound_at: RECEIVED_AT,
  }]],
];

/** A delivery tick that finds the outbound row it is about. */
const TICK_LANDS: Responder = [[/^update "messages"/, [{id: MESSAGE_ID}]]];

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    from: SENDER,
    type: "TEXT",
    messageId: "wamid.inbound.1",
    timestamp: RECEIVED_AT.toISOString(),
    data: {text: "Can a person help me with membership?"},
    ...overrides,
  };
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    type: "MESSAGE_STATUS",
    messageId: "wamid.outbound.1",
    timestamp: NOW.toISOString(),
    data: {status: "delivered"},
    ...overrides,
  };
}

function echo(overrides: Record<string, unknown> = {}) {
  return {
    type: "OUTBOUND",
    to: SENDER,
    messageId: "wamid.echo.1",
    timestamp: NOW.toISOString(),
    origin: "MANUAL",
    data: {text: "Thanks for writing in."},
    ...overrides,
  };
}

describe("a hostile provider field fails closed instead of inviting a retry loop (C-1)", () => {
  describe("an over-long provider message id is REJECTED, never truncated", () => {
    /**
     * `provider_message_id` is a KEY, not a label:
     * `messages_provider_message_id_unique` indexes it, `claimInbound` dedupes a
     * redelivery on it, the echo probe recognises its own row by it, and
     * `recordDeliveryStatus` reaches the row it must settle by it. Truncating
     * would turn two distinct ids that share a prefix into one key — a tick for
     * A settling B's row, an echo for A adopting B's queued message, delivery
     * state leaking between two contacts. Refusing the event loses one absurd
     * payload; truncating mis-attributes it, permanently.
     */
    it.each([
      ["inbound text", () => inbound({messageId: "w".repeat(MAX_PROVIDER_MESSAGE_ID_CHARS + 1)})],
      ["delivery status", () => status({messageId: "w".repeat(MAX_PROVIDER_MESSAGE_ID_CHARS + 1)})],
      ["outbound echo", () => echo({messageId: "w".repeat(MAX_PROVIDER_MESSAGE_ID_CHARS + 1)})],
    ])("answers 202 and touches nothing for a %s", async (_name, payload) => {
      const route = webhook(HUMAN_LANE);

      const response = await route.deliver(payload());

      // 500 is the retry invitation. Anything else, and Woztell moves on.
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        status: "ignored",
        reason: "provider_message_id_too_long",
      });
      // Refused before the first statement: no half-written contact, no
      // conversation opened against an id we could never match again.
      expect(route.queries).toHaveLength(0);
    });

    it("still accepts an id of exactly the bound, so the clamp and the repository agree", async () => {
      // The drift guard. This id passes the normaliser AND the repository's own
      // `.max(300)`; if either moves without the other, one of these two cases
      // fails.
      const route = webhook(TICK_LANDS);

      const response = await route.deliver(
        status({messageId: "w".repeat(MAX_PROVIDER_MESSAGE_ID_CHARS)}),
      );

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        status: "delivery_recorded",
        matched: true,
      });
    });
  });

  describe("an over-long WhatsApp member id is DROPPED, and the message still lands", () => {
    /**
     * The member id is an optional adornment on an otherwise perfectly good
     * message, and C1 never reads it (resolution stays number-first, per O-3).
     * Refusing the whole inbound over it would lose a real prospect's message —
     * the exact harm this fix exists to stop. Truncating is worse than dropping:
     * `contacts_whatsapp_member_unique` is a partial unique index and
     * `linkWhatsAppMemberId` is first-identity-wins, so a truncated id that
     * collides with a real one links a contact to the wrong WhatsApp member,
     * permanently. Absent is the honest value; the normaliser already reports a
     * blank id that way.
     */
    it("persists the inbound, tells staff, and never sends the id to the database", async () => {
      const hostile = "m".repeat(MAX_MEMBER_ID_CHARS + 1);
      const route = webhook(HUMAN_LANE);

      const response = await route.deliver(inbound({memberId: hostile}));

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({status: "human_handled"});
      // The message reached the transcript and a person was told about it.
      expect(route.queries.some((query) => query.sql.startsWith('insert into "messages"'))).toBe(true);
      expect(route.notified).toEqual([CONVERSATION_ID]);
      // The link the id would have made is simply not attempted, and no
      // statement anywhere carries the value.
      expect(route.queries.some((query) => query.sql.startsWith('update "contacts"'))).toBe(false);
      expect(JSON.stringify(route.queries)).not.toContain(hostile);
    });

    it("still links an id of exactly the bound, so the clamp and the repository agree", async () => {
      const accepted = "m".repeat(MAX_MEMBER_ID_CHARS);
      const route = webhook(HUMAN_LANE);

      const response = await route.deliver(inbound({memberId: accepted}));

      expect(response.status).toBe(202);
      const link = route.queries.find((query) => query.sql.startsWith('update "contacts"'));
      expect(link?.params).toEqual(expect.arrayContaining([accepted]));
    });
  });

  describe("an over-long delivery error code is TRUNCATED, and the tick still lands", () => {
    /**
     * The opposite call from the id, for the opposite reason. `error_code` is
     * diagnostic prose in an unindexed `text` column that nothing joins or
     * matches on — `providerRefusedSend` compares against the ADAPTER's own
     * codes, on rows with no provider id, which a tick by definition has. So the
     * question is only "keep the tick or lose it", and losing it is the failure
     * the plan's O-1 already warns about: the outbound row stays `sent` for ever
     * and staff never learn the send failed. Worse, the error code rides on the
     * `failed` tick — a reject rule here would discard precisely the failures.
     */
    it("records the failure with a bounded prefix rather than throwing it away", async () => {
      const hostile = `131047-${"d".repeat(MAX_ERROR_CODE_CHARS)}`;
      const route = webhook(TICK_LANDS);

      const response = await route.deliver(
        status({data: {status: "failed", errorCode: hostile}}),
      );

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        status: "delivery_recorded",
        matched: true,
      });
      const update = route.queries.find((query) => query.sql.startsWith('update "messages"'));
      const written = update?.params.find(
        (param): param is string =>
          typeof param === "string" && param.startsWith("131047-"),
      );
      // Bounded, and still the informative prefix a person would read first.
      expect(written).toHaveLength(MAX_ERROR_CODE_CHARS);
      expect(hostile.startsWith(written ?? "")).toBe(true);
    });
  });

  describe("an over-long echo body is REJECTED, never truncated", () => {
    /**
     * WhatsApp's own text body limit is 4096 characters, so 20 000 is already
     * five times anything real and a body past it is not a message we sent.
     * Truncating would be actively harmful twice over: the adopt statement joins
     * on `candidate.content = <text>`, so a shortened body can never match the
     * queued row it belongs to and inserts a SECOND outbound row instead —
     * leaving the staff row `queued`, which is the re-send state — and a
     * shortened body in the transcript is a falsified record staff reply from.
     */
    it("answers 202 and touches nothing", async () => {
      const route = webhook(HUMAN_LANE);

      const response = await route.deliver(
        echo({data: {text: "z".repeat(MAX_ECHO_TEXT_CHARS + 1)}}),
      );

      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toEqual({
        status: "ignored",
        reason: "provider_text_too_long",
      });
      expect(route.queries).toHaveLength(0);
    });
  });

  describe("the ordinary payloads are unchanged", () => {
    it("keeps answering an inbound, a tick and an echo the way it did", async () => {
      const inboundRoute = webhook(HUMAN_LANE);
      expect(await (await inboundRoute.deliver(inbound())).json())
        .toEqual({status: "human_handled"});

      const tickRoute = webhook(TICK_LANDS);
      expect(await (await tickRoute.deliver(status())).json())
        .toEqual({status: "delivery_recorded", matched: true});

      // No WhatsApp thread belongs to the recipient, so the echo is a no-op —
      // an echo is not a reason to open a thread.
      const echoRoute = webhook([]);
      expect(await (await echoRoute.deliver(echo())).json())
        .toEqual({status: "echo_recorded", disposition: "duplicate"});

      // The unsupported literal stays the answer for a kind we do not handle,
      // so the new reasons narrow the diagnosis rather than replacing it.
      const otherRoute = webhook([]);
      expect(await (await otherRoute.deliver({from: SENDER, type: "IMAGE"})).json())
        .toEqual({status: "ignored", reason: "unsupported_event"});
    });
  });
});
