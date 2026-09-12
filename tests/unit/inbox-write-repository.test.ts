import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {AutomationDatabase, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {WOZTELL_REQUEST_TIMEOUT_MS} from "@/lib/channels/woztell";
import {createInboxRepository, SEND_CLAIM_LEASE_MS} from "@/lib/db/repos/inbox";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";
const OUTBOUND_KEY = `inbox:${CONVERSATION_ID}:${"a".repeat(32)}`;
const LAST_INBOUND_AT = new Date("2026-09-10T08:00:00.000Z");

const admin = {kind: "staff", userId: "staff-user", profileId: "staff-1"} as const;
const member = {kind: "member", userId: "member-user", profileId: "member-1"} as const;

const dialect = new PgDialect();

/** A statement's answer, or the error the driver raises instead of one. */
type Result = Record<string, unknown>[] | Error;

function fakeDatabase(results: Result[]) {
  const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const execute: AutomationSqlExecutor["execute"] = async (query) => {
    queries.push(dialect.sqlToQuery(query));
    const next = results.shift() ?? [];
    if (next instanceof Error) throw next;
    return {rows: next};
  };
  const database: AutomationDatabase = {execute, transaction: async (work) => work(database)};
  return {database, queries, loadDatabase: async () => database};
}

function repository(results: Result[]) {
  const fixture = fakeDatabase(results);
  return {...fixture, inbox: createInboxRepository(fixture.loadDatabase)};
}

function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    channel: "whatsapp",
    handling: "human",
    last_inbound_at: LAST_INBOUND_AT,
    profile_id: null,
    contact_id: CONTACT_ID,
    profile_whatsapp_number: null,
    profile_whatsapp_opt_in: false,
    contact_phone_e164: "+85290000000",
    contact_whatsapp_opt_in: false,
    ...overrides,
  };
}

function headerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    agent_kind: "concierge",
    locale: "en",
    status: "active",
    channel: "whatsapp",
    handling: "human",
    last_message_at: new Date("2026-09-10T09:00:00.000Z"),
    last_inbound_at: LAST_INBOUND_AT,
    last_staff_read_at: null,
    profile_id: null,
    contact_id: CONTACT_ID,
    assigned_to_profile_id: "staff-1",
    display_name: null,
    assignee_display_name: "Staff One",
    last_message: "Hello",
    message_count: 3,
    open_task_count: 1,
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: CONVERSATION_ID,
    kind: "session",
    content: "Thanks — someone will come back to you shortly.",
    templateKey: null,
    templateVariables: {},
    outboundKey: OUTBOUND_KEY,
    ...overrides,
  };
}

function duplicateProviderId(): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint \"messages_provider_message_id_unique\""), {code: "23505"});
}

describe("inboxRepository staff write path (C-2 Task 6)", () => {
  /**
   * S-6. These methods live on `inboxRepository` and not on
   * `conversationsRepository` because every write there is gated by a
   * `ConversationOwner`: routing a staff reply through it would mean an admin
   * constructing a member's owner value, which is the forgeable-principal shape
   * `tests/unit/server-action-actor-boundary.test.ts` exists to prevent. The
   * gate here is `requireAdmin(actor)`, and it has to run before the database is
   * opened — a refusal that can be observed as a query is a refusal that already
   * touched the row it was refusing.
   */
  describe("authorization", () => {
    it("refuses a member actor on queueStaffMessage before opening the database", async () => {
      const loadDatabase = vi.fn();
      const inbox = createInboxRepository(loadDatabase);

      await expect(inbox.queueStaffMessage(member, draft())).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });

    it("refuses a member actor on settleStaffMessage before opening the database", async () => {
      const loadDatabase = vi.fn();
      const inbox = createInboxRepository(loadDatabase);

      await expect(inbox.settleStaffMessage(member, {
        outboundKey: OUTBOUND_KEY,
        outcome: {status: "sent", providerId: "wamid.1"},
      })).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });

    it("refuses a member actor on setHandling, assign, markRead and close before opening the database", async () => {
      const loadDatabase = vi.fn();
      const inbox = createInboxRepository(loadDatabase);

      await expect(inbox.setHandling(member, {conversationId: CONVERSATION_ID, handling: "human"})).rejects.toThrow("FORBIDDEN");
      await expect(inbox.assign(member, {conversationId: CONVERSATION_ID, assignedToProfileId: "staff-1"})).rejects.toThrow("FORBIDDEN");
      await expect(inbox.markRead(member, CONVERSATION_ID)).rejects.toThrow("FORBIDDEN");
      await expect(inbox.close(member, CONVERSATION_ID)).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });

    it("authorizes before parsing attacker-controlled input", async () => {
      const loadDatabase = vi.fn();
      const inbox = createInboxRepository(loadDatabase);

      // A ZodError here instead of FORBIDDEN would mean the parse ran first, and
      // a parse is a place to hide a crash that never reaches the gate.
      await expect(inbox.queueStaffMessage(member, {} as never)).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });
  });

  describe("queueStaffMessage", () => {
    it("writes the outbound row and its audit row in one transaction (S-7)", async () => {
      const fixture = repository([[conversationRow()], [{id: MESSAGE_ID}], []]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toEqual({
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        outboundKey: OUTBOUND_KEY,
        disposition: "queued",
        recipient: {phoneE164: "+85290000000", profileId: null, contactId: CONTACT_ID, whatsappOptIn: false},
        lastInboundAt: LAST_INBOUND_AT,
      });

      const insert = fixture.queries[1];
      const insertSql = normalized(insert?.sql);
      expect(insertSql).toMatch(/^insert into "messages"/);
      expect(insertSql).toContain(`'queued'`);
      expect(insertSql).toContain("on conflict (outbound_key) where outbound_key is not null do nothing");
      // `direction` is bound rather than inlined because it comes through the
      // shared twin `derivedMessageDirection`; `sent_by_profile_id` is the whole
      // point of the staff lane, since an outbound row with no sender is
      // indistinguishable from the concierge's own reply.
      expect(insert?.params).toEqual(expect.arrayContaining(["staff", "outbound", "staff-1", OUTBOUND_KEY]));

      const audit = fixture.queries[2];
      expect(normalized(audit?.sql)).toMatch(/^insert into "audit_events"/);
      expect(audit?.params).toEqual(expect.arrayContaining([
        "staff-1",
        "staff",
        "conversation.reply.queued",
        CONVERSATION_ID,
        expect.stringContaining(`"messageId":"${MESSAGE_ID}"`),
      ]));
      // The commitment to send and the record of it commit together or neither
      // does, so both statements ran inside the one transaction the method opened.
      expect(fixture.queries).toHaveLength(3);
    });

    it("leases the send so a double-click cannot call the adapter twice (S-8)", async () => {
      const fixture = repository([[conversationRow()], [{id: MESSAGE_ID}], []]);

      await fixture.inbox.queueStaffMessage(admin, draft());

      // The interval is built FROM the exported constant rather than spelled out
      // beside it, so the SQL and the number a test can reason about cannot
      // drift — the value below is derived here for the same reason.
      expect(normalized(fixture.queries[1]?.sql)).toContain("send_claim_expires_at");
      expect(normalized(fixture.queries[1]?.sql))
        .toContain(`now() + interval '${SEND_CLAIM_LEASE_MS / 1_000} seconds'`);
    });

    /**
     * C-2. The lease's whole justification is that it outlives one adapter
     * request: if a send can hang for longer, its claim expires underneath it,
     * the next submit inherits the claim and calls the adapter again, and the
     * member gets the reply twice from one `messages` row and one audit row.
     *
     * That justification was false. `sendLive` called `fetch` with no `signal`
     * and no timeout, so the real bound was undici's ~300s header timeout —
     * two and a half times this lease. The adapter now carries a real one, and
     * this is the assertion that keeps the two in the right order; a comment
     * asserting a bound nothing enforces is worse than no comment.
     */
    it("keeps the lease longer than the adapter's own request timeout", () => {
      expect(WOZTELL_REQUEST_TIMEOUT_MS).toBeLessThan(SEND_CLAIM_LEASE_MS);
    });

    /**
     * One row is not one send. Two concurrent submits of the same draft both
     * find the same row through `messages_outbound_key_unique`; without the
     * lease the loser calls the adapter anyway and the member gets the message
     * twice from one `messages` row and one audit row.
     */
    it("reports already_queued while another submit holds a live claim, and writes no second audit row", async () => {
      const fixture = repository([
        [conversationRow()],
        [],
        [],
        [{id: MESSAGE_ID, delivery_status: "queued"}],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        disposition: "already_queued",
        messageId: MESSAGE_ID,
      });

      const claim = fixture.queries[2];
      const claimSql = normalized(claim?.sql);
      expect(claimSql).toMatch(/^update "messages" set/);
      expect(claimSql).toContain(`"messages"."delivery_status" = 'queued'`);
      expect(claimSql).toContain("is null or");
      expect(claimSql).toContain("<= now()");
      expect(fixture.queries.some((query) => /insert into "audit_events"/i.test(query.sql))).toBe(false);
    });

    /**
     * The same hole reopens after any crash between the adapter returning and
     * the settle committing: the row stays `queued`, and `queued` is the
     * re-send state. Inheriting an expired claim is how that send is retried —
     * and the commitment was already recorded, so it must not be recorded twice.
     */
    it("inherits an abandoned send when the claim has expired, still without a second audit row", async () => {
      const fixture = repository([
        [conversationRow()],
        [],
        [{id: MESSAGE_ID, delivery_status: "queued"}],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        disposition: "queued",
        messageId: MESSAGE_ID,
      });
      expect(fixture.queries.some((query) => /insert into "audit_events"/i.test(query.sql))).toBe(false);
    });

    /**
     * S-8 promises a `failed` row is immediately re-sendable, and clearing the
     * lease in `settleStaffMessage` does not deliver that on its own: the claim
     * has to be able to re-take the row. Without this, the adapter throws, the
     * thread shows "Not delivered", staff press send again, the deterministic
     * key finds the settled row — and the caller is told `already_sent` while
     * the member never got the message.
     */
    it("re-queues a reply the adapter refused, because the provider never took that message", async () => {
      const fixture = repository([
        [conversationRow()],
        [],
        [{id: MESSAGE_ID}],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        disposition: "queued",
        messageId: MESSAGE_ID,
      });

      const claim = fixture.queries[2];
      const claimSql = normalized(claim?.sql);
      // Back to the re-send state, and without the stale error code the thread
      // would otherwise render beside "Sending".
      expect(claimSql).toContain("set delivery_status = 'queued', error_code = null");
      expect(claimSql).toContain(`"messages"."delivery_status" = 'failed'`);
      expect(claimSql).toContain(`"messages"."provider_message_id" is null`);
      // The re-take is decided by the code the row carries, not by the absence
      // of a provider id — the adapter throws before it can return one however
      // it failed, so the id says nothing about acceptance.
      expect(claimSql).toContain(`"messages"."error_code" in (`);
      expect(claim?.params).toEqual(expect.arrayContaining(["provider_client_error", "retryable_rate_limit"]));
      // The column is cleared, so the code has to survive somewhere: this branch
      // writes no audit row, and without the fold a re-take would erase the only
      // record that the provider was ever handed this message.
      expect(claimSql).toContain("'sendretakes'");
      expect(claimSql).toContain(`'previouserrorcode', "messages"."error_code"`);
      // The commitment was recorded when the row was inserted; a retry is not a
      // second commitment.
      expect(fixture.queries.some((query) => /insert into "audit_events"/i.test(query.sql))).toBe(false);
    });

    /**
     * Half of the narrowing. A row that reached `failed` through
     * `recordDeliveryStatus` was matched BY its provider id, so WhatsApp did
     * take it; re-queueing that one under the same key would be a silent second
     * send — and the delivery-status payload shape is still an unverified guess
     * (O-1), so a mis-mapped status must not be able to cause one.
     *
     * The fake answers by position rather than by evaluating SQL, so the
     * `already_sent` below only pins the fallback SELECT's mapping. The guard
     * itself is pinned by the claim statement's own text, asserted here for the
     * same reason it is asserted in the test above.
     */
    it("leaves a provider-reported delivery failure settled rather than re-sending it", async () => {
      const fixture = repository([
        [conversationRow()],
        [],
        [],
        [{id: MESSAGE_ID, delivery_status: "failed", provider_message_id: "wamid.1"}],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        disposition: "already_sent",
        messageId: MESSAGE_ID,
      });

      expect(normalized(fixture.queries[2]?.sql)).toContain(`"messages"."provider_message_id" is null`);
    });

    /**
     * The other half, and the one `provider_message_id IS NULL` cannot express.
     * Three of the adapter's five failure codes leave acceptance UNCERTAIN, and
     * the row looks identical to a definite refusal: the adapter threw, so it
     * returned no id either way.
     *
     * The trace that matters is O-1's most likely bring-up failure. `sendLive`
     * gets HTTP 200 and WhatsApp delivers the reply, but `providerId(body)` does
     * not recognise the response shape and the adapter throws
     * `provider_unclassified_failure` — past the `!httpResponse.ok` arm. Task 7
     * settles the row `failed` with that code. If the claim re-took it, the
     * thread would show "Not delivered", the draft would still be in the
     * composer, and every Send click would deliver the member another copy,
     * with no audit row on this branch to record that it happened.
     */
    it("refuses to re-take a failure whose code leaves provider acceptance uncertain", async () => {
      const fixture = repository([
        [conversationRow()],
        [],
        [],
        [{id: MESSAGE_ID, delivery_status: "failed", provider_message_id: null, error_code: "provider_unclassified_failure"}],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        disposition: "already_sent",
        messageId: MESSAGE_ID,
      });

      // The list is bound, not inlined, so the codes are parameters. Exactly the
      // two definite refusals may appear; a code that means "the provider may
      // already have it" appearing here is the double-send.
      const claimParams = fixture.queries[2]?.params ?? [];
      expect(claimParams).toContain("provider_client_error");
      expect(claimParams).toContain("retryable_rate_limit");
      expect(claimParams).not.toContain("retryable_network");
      expect(claimParams).not.toContain("provider_acceptance_uncertain");
      expect(claimParams).not.toContain("provider_unclassified_failure");
    });

    it("reports already_sent when the row has left the queued state", async () => {
      const fixture = repository([
        [conversationRow()],
        [],
        [],
        [{id: MESSAGE_ID, delivery_status: "sent"}],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        disposition: "already_sent",
        messageId: MESSAGE_ID,
      });
    });

    /**
     * The two conflict statements match on `outbound_key` alone, so a key minted
     * for another conversation would pair that conversation's `messageId` with
     * this one's recipient — a reply queued against one thread and sent to the
     * number behind another. The pair is refused at the boundary instead.
     */
    it("refuses an outbound key minted for a different conversation, before opening the database", async () => {
      const loadDatabase = vi.fn();
      const inbox = createInboxRepository(loadDatabase);
      const otherConversation = "22222222-2222-4222-8222-222222222222";

      await expect(inbox.queueStaffMessage(admin, draft({
        outboundKey: `inbox:${otherConversation}:${"b".repeat(32)}`,
      }))).rejects.toThrow("OUTBOUND_KEY_CONVERSATION_MISMATCH");
      expect(loadDatabase).not.toHaveBeenCalled();
    });

    it("refuses a thread the concierge still owns, because taking it over is a separate audited act", async () => {
      const fixture = repository([[conversationRow({handling: "bot"})]]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).rejects.toThrow("INVALID_INBOX_HANDLING");
      expect(fixture.queries).toHaveLength(1);
    });

    it("refuses a web thread, which has no number behind it and no window to reply inside", async () => {
      const fixture = repository([[conversationRow({channel: "web"})]]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).rejects.toThrow("INVALID_INBOX_CHANNEL");
      expect(fixture.queries).toHaveLength(1);
    });

    it("locks only the conversation, because Postgres refuses to lock the nullable side of an outer join", async () => {
      const fixture = repository([[conversationRow()], [{id: MESSAGE_ID}], []]);

      await fixture.inbox.queueStaffMessage(admin, draft());

      const select = normalized(fixture.queries[0]?.sql);
      expect(select).toContain("for update of c");
      expect(select).not.toMatch(/for update(?! of)/);
    });

    it("returns the member's own number and consent flag when no contact is linked", async () => {
      const fixture = repository([
        [conversationRow({
          contact_id: null,
          contact_phone_e164: null,
          contact_whatsapp_opt_in: null,
          profile_id: "member-9",
          profile_whatsapp_number: "+85291111111",
          profile_whatsapp_opt_in: true,
        })],
        [{id: MESSAGE_ID}],
        [],
      ]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft())).resolves.toMatchObject({
        recipient: {phoneE164: "+85291111111", profileId: "member-9", contactId: null, whatsappOptIn: true},
      });
    });

    it("refuses a template send with no template key before touching the database", async () => {
      const fixture = repository([]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft({kind: "template", templateKey: null})))
        .rejects.toThrow();
      expect(fixture.queries).toHaveLength(0);
    });

    it("refuses an outbound key that is not the deterministic inbox shape", async () => {
      const fixture = repository([]);

      await expect(fixture.inbox.queueStaffMessage(admin, draft({outboundKey: "inbox:whatever"})))
        .rejects.toThrow();
      expect(fixture.queries).toHaveLength(0);
    });
  });

  describe("settleStaffMessage", () => {
    it("flips queued to sent, stamps the provider id and clears the claim", async () => {
      const fixture = repository([[{id: MESSAGE_ID}]]);

      await fixture.inbox.settleStaffMessage(admin, {
        outboundKey: OUTBOUND_KEY,
        outcome: {status: "sent", providerId: "wamid.settle.1"},
      });

      const update = normalized(fixture.queries[0]?.sql);
      expect(update).toMatch(/^update "messages" set/);
      expect(update).toContain("provider_message_id =");
      expect(update).toContain("send_claim_expires_at = null");
      // The guard is what makes this a no-op once the row has moved on.
      expect(update).toContain(`"messages"."delivery_status" = 'queued'`);
      expect(fixture.queries[0]?.params).toEqual(expect.arrayContaining([OUTBOUND_KEY, "wamid.settle.1"]));
    });

    /**
     * The outbound echo can adopt the row before our own send's HTTP response
     * comes back, and then it already carries the provider id. That race is
     * bookkeeping, not delivery: the message went out either way, so this must
     * not throw and must not leave the row `queued` — `queued` is the re-send
     * state, and a throw here would make staff send it a second time.
     */
    it("survives the echo adopting the row first, leaving the provider id where the echo put it", async () => {
      const fixture = repository([duplicateProviderId(), [{id: MESSAGE_ID}]]);

      await expect(fixture.inbox.settleStaffMessage(admin, {
        outboundKey: OUTBOUND_KEY,
        outcome: {status: "sent", providerId: "wamid.settle.1"},
      })).resolves.toBeUndefined();

      const fallback = normalized(fixture.queries[1]?.sql);
      expect(fallback).toMatch(/^update "messages" set/);
      expect(fallback).toContain(`delivery_status = 'sent'`);
      expect(fallback).not.toContain("provider_message_id =");
      expect(fixture.queries[1]?.params).toEqual([OUTBOUND_KEY]);
    });

    it("rethrows anything that is not a unique violation, because a silent settle is a lost message", async () => {
      const fixture = repository([new Error("connection terminated")]);

      await expect(fixture.inbox.settleStaffMessage(admin, {
        outboundKey: OUTBOUND_KEY,
        outcome: {status: "sent", providerId: "wamid.settle.1"},
      })).rejects.toThrow("connection terminated");
    });

    it("records a failure with its error code and clears the claim so the row is re-sendable", async () => {
      const fixture = repository([[{id: MESSAGE_ID}]]);

      await fixture.inbox.settleStaffMessage(admin, {
        outboundKey: OUTBOUND_KEY,
        outcome: {status: "failed", errorCode: "131047"},
      });

      const update = normalized(fixture.queries[0]?.sql);
      expect(update).toContain(`delivery_status = 'failed'`);
      expect(update).toContain("error_code =");
      expect(update).toContain("send_claim_expires_at = null");
      // Leaving `provider_message_id` NULL is what lets the claim in
      // `queueStaffMessage` tell this failure — the provider never took the
      // message — from a delivery failure reported against a provider id it did
      // take. Stamping one here would make the row permanently un-resendable.
      expect(update).not.toContain("provider_message_id");
      expect(fixture.queries[0]?.params).toEqual(expect.arrayContaining(["131047"]));
    });

    it("refuses an outcome the send path never produces", async () => {
      const fixture = repository([]);

      await expect(fixture.inbox.settleStaffMessage(admin, {
        outboundKey: OUTBOUND_KEY,
        outcome: {status: "delivered", providerId: "wamid.1"},
      })).rejects.toThrow();
      expect(fixture.queries).toHaveLength(0);
    });
  });

  describe("setHandling, assign, markRead and close", () => {
    it("refuses to hand a web thread to a person, because the composer could not send into it", async () => {
      const fixture = repository([[{id: CONVERSATION_ID, channel: "web", handling: "bot"}]]);

      await expect(fixture.inbox.setHandling(admin, {conversationId: CONVERSATION_ID, handling: "human"}))
        .rejects.toThrow("INVALID_INBOX_CHANNEL");
      expect(fixture.queries.some((query) => /update "conversations"/i.test(query.sql))).toBe(false);
    });

    it("writes the handling change and its audit row in one transaction", async () => {
      const fixture = repository([
        [{id: CONVERSATION_ID, channel: "whatsapp", handling: "bot"}],
        [],
        [],
        [headerRow({handling: "human"})],
      ]);

      await expect(fixture.inbox.setHandling(admin, {conversationId: CONVERSATION_ID, handling: "human"}))
        .resolves.toMatchObject({id: CONVERSATION_ID, handling: "human"});

      expect(normalized(fixture.queries[1]?.sql)).toMatch(/^update "conversations" set/);
      const audit = fixture.queries[2];
      expect(normalized(audit?.sql)).toMatch(/^insert into "audit_events"/);
      expect(audit?.params).toEqual(expect.arrayContaining(["conversation.handling.changed", CONVERSATION_ID]));
    });

    it("audits an assignment", async () => {
      const fixture = repository([
        [{id: CONVERSATION_ID, channel: "whatsapp", handling: "human"}],
        [],
        [],
        [headerRow()],
      ]);

      await expect(fixture.inbox.assign(admin, {conversationId: CONVERSATION_ID, assignedToProfileId: "staff-1"}))
        .resolves.toMatchObject({assignedToProfileId: "staff-1", assigneeLabel: "Staff One"});

      expect(fixture.queries[2]?.params).toEqual(expect.arrayContaining(["conversation.assigned"]));
    });

    it("audits a close", async () => {
      const fixture = repository([
        [{id: CONVERSATION_ID, channel: "whatsapp", handling: "human"}],
        [],
        [],
        [headerRow({handling: "closed"})],
      ]);

      await expect(fixture.inbox.close(admin, CONVERSATION_ID)).resolves.toMatchObject({handling: "closed"});
      expect(fixture.queries[2]?.params).toEqual(expect.arrayContaining(["conversation.closed"]));
    });

    /**
     * Reading is not a mutation that matters, and auditing it would bury the
     * ones that do: a thread staff open six times a day would file six audit
     * rows for every reply it files one for.
     */
    it("stamps the read marker and writes no audit row", async () => {
      const fixture = repository([[]]);

      await fixture.inbox.markRead(admin, CONVERSATION_ID);

      expect(normalized(fixture.queries[0]?.sql)).toContain("last_staff_read_at = now()");
      expect(fixture.queries.some((query) => /insert into "audit_events"/i.test(query.sql))).toBe(false);
    });
  });

  describe("read model", () => {
    /**
     * The assertion that earns its keep. `getTranscript` used to end with
     * `row.role === "assistant" ? "assistant" : row.role === "tool" ? "tool" :
     * "user"`, so the moment 0031 added 'staff' to `message_role` every staff
     * reply would have rendered under `Admin.inbox.roles.user` — "Sender" in
     * English, 「發送者」 in Chinese, i.e. attributed to the prospect — with no
     * type error and no failing test.
     */
    it("maps a staff message to 'staff', never to 'user'", async () => {
      const fixture = repository([
        [headerRow()],
        [
          {id: "m1", role: "user", direction: "inbound", channel: "whatsapp", content: "Hi", delivery_status: null, template_key: null, error_code: null, created_at: new Date("2026-09-10T08:00:00.000Z")},
          {id: "m2", role: "staff", direction: "outbound", channel: "whatsapp", content: "Hello", delivery_status: "delivered", template_key: null, error_code: null, created_at: new Date("2026-09-10T09:00:00.000Z")},
        ],
      ]);

      const transcript = await fixture.inbox.getTranscript(admin, CONVERSATION_ID);

      expect(transcript?.messages.map((message) => message.role)).toEqual(["user", "staff"]);
      expect(transcript?.messages[1]).toMatchObject({direction: "outbound", deliveryStatus: "delivered"});
    });

    /**
     * 0031 gave `conversations` its own `channel`, and 0032 backfilled it as
     * "WhatsApp if ANY message is". The derivation this replaces read the
     * newest message, so a WhatsApp thread whose newest message was a web reply
     * read as "web" — and the send path would then believe it may not reach for
     * the WhatsApp adapter for a thread that plainly is one.
     */
    it("reads the conversation's own channel rather than the newest message's", async () => {
      const fixture = repository([
        [headerRow({channel: "whatsapp"})],
        [{id: "m1", role: "assistant", direction: "outbound", channel: "web", content: "Hello", delivery_status: null, template_key: null, error_code: null, created_at: new Date("2026-09-10T09:00:00.000Z")}],
      ]);

      const transcript = await fixture.inbox.getTranscript(admin, CONVERSATION_ID);

      expect(transcript?.conversation.channel).toBe("whatsapp");
      expect(normalized(fixture.queries[0]?.sql)).toContain("c.channel");
      expect(normalized(fixture.queries[0]?.sql)).not.toContain("order by m.created_at desc limit 1) as channel");
    });

    it("carries handling, assignment and the unread marker into the summary", async () => {
      const fixture = repository([[headerRow()]]);

      const rows = await fixture.inbox.listConversations(admin, {channel: "whatsapp", limit: 50});

      expect(rows[0]).toMatchObject({
        handling: "human",
        assignedToProfileId: "staff-1",
        assigneeLabel: "Staff One",
        contactId: CONTACT_ID,
        lastInboundAt: LAST_INBOUND_AT,
        lastStaffReadAt: null,
        unread: true,
      });
      // The channel filter now scopes the conversation, not the latest message.
      expect(normalized(fixture.queries[0]?.sql)).toContain("c.channel =");
    });

    it("calls a thread read once a person has looked at it more recently than its last message", async () => {
      const fixture = repository([[headerRow({
        last_message_at: new Date("2026-09-10T09:00:00.000Z"),
        last_staff_read_at: new Date("2026-09-10T09:30:00.000Z"),
      })]]);

      const rows = await fixture.inbox.listConversations(admin, {channel: "all", limit: 50});

      expect(rows[0]?.unread).toBe(false);
    });
  });
});
