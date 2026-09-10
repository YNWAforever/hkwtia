import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {
  createWoztellInboundEventsRepository,
  woztellWebhookActor,
} from "@/lib/db/repos/woztell-inbound-events";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const OCCURRED_AT = new Date("2026-09-10T08:59:00.000Z");
const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CONVERSATION_ID = "99999999-9999-4999-8999-999999999999";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const RECIPIENT = "+85290000000";

const dialect = new PgDialect();

function fakeDatabase(results: Record<string, unknown>[][]) {
  const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const execute: AutomationSqlExecutor["execute"] = async (query) => {
    queries.push(dialect.sqlToQuery(query));
    return {rows: results.shift() ?? []};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work(database),
  };
  return {database, queries, loadDatabase: async () => database};
}

function repository(results: Record<string, unknown>[][]) {
  const fixture = fakeDatabase(results);
  return {
    ...fixture,
    events: createWoztellInboundEventsRepository(() => NOW, fixture.loadDatabase),
  };
}

function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function echo(overrides: Record<string, unknown> = {}) {
  return {
    recipient: RECIPIENT,
    text: "Thanks — someone will come back to you shortly.",
    providerMessageId: "wamid.echo.1",
    origin: "MANUAL" as const,
    sentAt: OCCURRED_AT,
    ...overrides,
  };
}

/**
 * The three principals §9 says must never reach a capability writer. A session
 * actor cannot carry the `unique symbol`, so each of these is a plain object as
 * far as the module is concerned — which is the point.
 */
const forgedActors = [
  ["member", {kind: "member", userId: "user-a", profileId: "user-a"}],
  ["admin", {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"}],
  ["anonymous", {kind: "anonymous", userId: null}],
  ["hand-rolled webhook shape", {kind: "woztell-webhook", userId: null}],
] as const;

describe("WOZTELL inbound event writers (C-1 Task 3)", () => {
  describe("authorization (S-14)", () => {
    it.each(forgedActors)("refuses a %s actor on recordDeliveryStatus before opening the database", async (_name, actor) => {
      const loadDatabase = vi.fn();
      const events = createWoztellInboundEventsRepository(() => NOW, loadDatabase);

      await expect(events.recordDeliveryStatus(actor as never, {
        providerMessageId: "wamid.status.1",
        status: "delivered",
        errorCode: null,
        occurredAt: OCCURRED_AT,
      })).rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });

    it.each(forgedActors)("refuses a %s actor on recordOutboundEcho before opening the database", async (_name, actor) => {
      const loadDatabase = vi.fn();
      const events = createWoztellInboundEventsRepository(() => NOW, loadDatabase);

      await expect(events.recordOutboundEcho(actor as never, echo()))
        .rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });

    it("authorizes before parsing attacker-controlled input", async () => {
      const loadDatabase = vi.fn();
      const events = createWoztellInboundEventsRepository(() => NOW, loadDatabase);

      // A ZodError here instead of FORBIDDEN would mean the parse ran first, and
      // a parse is a place to hide a crash that never reaches the gate.
      await expect(events.recordDeliveryStatus({kind: "member"} as never, {} as never))
        .rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });
  });

  describe("recordDeliveryStatus", () => {
    it("reports a miss instead of throwing, because every message sent before this release is one", async () => {
      const fixture = repository([[]]);

      await expect(fixture.events.recordDeliveryStatus(woztellWebhookActor(), {
        providerMessageId: "wamid.status.unknown",
        status: "delivered",
        errorCode: null,
        occurredAt: OCCURRED_AT,
      })).resolves.toEqual({matched: false, target: null});
    });

    it("never walks a tick backwards and only touches outbound rows", async () => {
      const fixture = repository([[{id: MESSAGE_ID}]]);

      await expect(fixture.events.recordDeliveryStatus(woztellWebhookActor(), {
        providerMessageId: "wamid.status.1",
        status: "read",
        errorCode: null,
        occurredAt: OCCURRED_AT,
      })).resolves.toEqual({matched: true, target: "message"});

      const sqlText = normalized(fixture.queries[0]?.sql);
      expect(sqlText).toMatch(/^update "messages"/);
      expect(sqlText).toContain(`"messages"."direction" = 'outbound'`);
      // A late 'sent' must not undo a 'read'.
      expect(sqlText).toContain("array_position(");
      expect(sqlText).toContain("<");
      expect(sqlText).toContain("read_at = case when");
      expect(sqlText).toContain("delivered_at = case when");
      expect(sqlText).toContain("error_code = case when");
      expect(fixture.queries).toHaveLength(1);
    });

    it("carries the error code only on a failure, so a later success cannot leave one behind", async () => {
      const fixture = repository([[{id: MESSAGE_ID}]]);

      await fixture.events.recordDeliveryStatus(woztellWebhookActor(), {
        providerMessageId: "wamid.status.1",
        status: "failed",
        errorCode: "131047",
        occurredAt: OCCURRED_AT,
      });

      expect(fixture.queries[0]?.params).toEqual(expect.arrayContaining(["131047", "failed"]));
    });

    it("refuses a status the provider never sends rather than writing an unknown value", async () => {
      const fixture = repository([[]]);

      await expect(fixture.events.recordDeliveryStatus(woztellWebhookActor(), {
        providerMessageId: "wamid.status.1",
        status: "pending" as never,
        errorCode: null,
        occurredAt: OCCURRED_AT,
      })).rejects.toThrow();
      expect(fixture.queries).toHaveLength(0);
    });
  });

  describe("recordOutboundEcho", () => {
    it("writes nothing when no WhatsApp thread belongs to the recipient — an echo is not a reason to open one", async () => {
      const fixture = repository([[], [], []]);

      await expect(fixture.events.recordOutboundEcho(woztellWebhookActor(), echo()))
        .resolves.toEqual({disposition: "duplicate"});

      expect(fixture.queries.some((query) => /insert into "messages"/i.test(query.sql))).toBe(false);
    });

    it("is a no-op on a second delivery of the same provider id", async () => {
      const fixture = repository([[], [{id: MESSAGE_ID}]]);

      await expect(fixture.events.recordOutboundEcho(woztellWebhookActor(), echo()))
        .resolves.toEqual({disposition: "duplicate"});

      expect(fixture.queries.some((query) => /insert into/i.test(query.sql))).toBe(false);
      expect(fixture.queries.some((query) => /update "messages"/i.test(query.sql))).toBe(false);
    });

    it("adopts a queued row bound to the resolved conversation, never to any WhatsApp conversation", async () => {
      const fixture = repository([
        [],
        [],
        [{id: CONVERSATION_ID}],
        [{id: MESSAGE_ID}],
        [],
      ]);

      await expect(fixture.events.recordOutboundEcho(woztellWebhookActor(), echo({origin: "RELAY"})))
        .resolves.toEqual({disposition: "adopted"});

      const adopt = fixture.queries.find((query) => /update "messages"/i.test(query.sql));
      expect(adopt).toBeDefined();
      const sqlText = normalized(adopt?.sql);
      // An inbox runs on canned replies: two staff answering "Thanks — someone
      // will come back to you shortly." to two prospects produce two queued rows
      // with byte-identical content. Without this predicate one prospect's echo
      // adopts the other's row, and every later tick lands on the wrong thread.
      expect(sqlText).toContain("conversation_id =");
      expect(adopt?.params).toEqual(expect.arrayContaining([CONVERSATION_ID]));
      expect(sqlText).toContain(`direction = 'outbound'`);
      expect(sqlText).toContain(`delivery_status = 'queued'`);
      expect(sqlText).toContain("provider_message_id is null");
      expect(sqlText).toContain("for update skip locked");
      // An adopted row is one WE queued, and Task 6 already wrote its
      // `conversation.reply.queued` audit row (S-7). A second row would be noise.
      expect(fixture.queries.some((query) => /insert into "audit_events"/i.test(query.sql))).toBe(false);
    });

    it("resolves the conversation from the recipient's own cleartext links, each EXISTS parenthesised", async () => {
      const fixture = repository([[], [], []]);

      await fixture.events.recordOutboundEcho(woztellWebhookActor(), echo());

      const resolve = fixture.queries.find((query) => /from "conversations"/i.test(query.sql));
      expect(resolve).toBeDefined();
      const sqlText = normalized(resolve?.sql);
      expect(sqlText).toContain(`"conversations"."channel" = 'whatsapp'`);
      for (const [, following] of sqlText.matchAll(/\bexists\b\s*(.)/g)) {
        expect(following).toBe("(");
      }
      expect((resolve?.sql ?? "").split("(").length).toBe((resolve?.sql ?? "").split(")").length);
    });

    it("stores a console or business-app reply as a staff message with an audit row", async () => {
      const fixture = repository([
        [],
        [],
        [{id: CONVERSATION_ID}],
        [],
        [{id: MESSAGE_ID}],
        [],
        [],
      ]);

      await expect(fixture.events.recordOutboundEcho(woztellWebhookActor(), echo({origin: "MANUAL"})))
        .resolves.toEqual({disposition: "inserted"});

      const insert = fixture.queries.find((query) => /insert into "messages"/i.test(query.sql));
      const sqlText = normalized(insert?.sql);
      expect(sqlText).toContain("direction");
      expect(sqlText).toContain(`'outbound'`);
      expect(sqlText).toContain(`'sent'`);
      expect(insert?.params).toEqual(expect.arrayContaining(["staff"]));

      // Storing this as role='assistant' would put a human's reply in the
      // transcript under "Concierge", attributed to a bot that did not send it,
      // with no audit row anywhere — falsifying "every send audited".
      const audit = fixture.queries.find((query) => /insert into "audit_events"/i.test(query.sql));
      expect(audit).toBeDefined();
      const auditSql = normalized(audit?.sql);
      // actor_user_id is NULL on purpose: we know a person sent this, and we
      // cannot know which one.
      expect(auditSql).toContain("'woztell-webhook'");
      expect(auditSql).toContain("'conversation.reply.external'");
      expect(auditSql).toContain("null,");
      expect(audit?.params).toEqual(expect.arrayContaining([
        expect.stringContaining(`"origin":"MANUAL"`),
      ]));
    });

    it("stores the concierge's own echo as an assistant message with no audit row, because its agent run already accounts for it", async () => {
      const fixture = repository([
        [],
        [],
        [{id: CONVERSATION_ID}],
        [],
        [{id: MESSAGE_ID}],
        [],
      ]);

      await expect(fixture.events.recordOutboundEcho(woztellWebhookActor(), echo({origin: "BOT"})))
        .resolves.toEqual({disposition: "inserted"});

      const insert = fixture.queries.find((query) => /insert into "messages"/i.test(query.sql));
      expect(insert?.params).toEqual(expect.arrayContaining(["assistant"]));
      expect(fixture.queries.some((query) => /insert into "audit_events"/i.test(query.sql))).toBe(false);
    });

    it("reports a duplicate when the insert loses the race on the provider id", async () => {
      const fixture = repository([
        [],
        [],
        [{id: OTHER_CONVERSATION_ID}],
        [],
        [],
      ]);

      await expect(fixture.events.recordOutboundEcho(woztellWebhookActor(), echo({origin: "BOT"})))
        .resolves.toEqual({disposition: "duplicate"});
    });

    it("refuses an origin the normaliser never produces", async () => {
      const fixture = repository([[]]);

      await expect(fixture.events.recordOutboundEcho(
        woztellWebhookActor(),
        echo({origin: "SYSTEM"}),
      )).rejects.toThrow();
      expect(fixture.queries).toHaveLength(0);
    });
  });
});
