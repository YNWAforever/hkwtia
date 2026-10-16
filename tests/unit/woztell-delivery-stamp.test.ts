import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  deliverWoztellReply,
  type WoztellDeliveryDependencies,
  type WoztellDeliveryInput,
} from "@/lib/ai/woztell-delivery";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import {
  createWoztellDeliveryStampRepository,
  woztellDeliveryActor,
} from "@/lib/db/repos/woztell-delivery-stamp";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "33333333-3333-4333-8333-333333333333";
const INBOUND_PROVIDER_MESSAGE_ID = "wamid.inbound.1";
const PROVIDER_ID = "wamid.outbound.1";

const dialect = new PgDialect();

type Answer = Record<string, unknown>[] | Error;

function uniqueViolation(): Error {
  return Object.assign(
    new Error("duplicate key value violates unique constraint"),
    {code: "23505", constraint: "messages_provider_message_id_unique"},
  );
}

function fakeDatabase(answers: Answer[]) {
  const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const execute: AutomationSqlExecutor["execute"] = async (query) => {
    queries.push(dialect.sqlToQuery(query));
    const answer = answers.shift() ?? [];
    if (answer instanceof Error) throw answer;
    return {rows: answer};
  };
  const database: AutomationDatabase = {
    execute,
    transaction: async (work) => work(database),
  };
  return {database, queries, loadDatabase: async () => database};
}

function repository(answers: Answer[]) {
  const fixture = fakeDatabase(answers);
  return {
    ...fixture,
    stamp: createWoztellDeliveryStampRepository(fixture.loadDatabase),
  };
}

function normalized(statement: string | undefined): string {
  return (statement ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    inboundProviderMessageId: INBOUND_PROVIDER_MESSAGE_ID,
    providerId: PROVIDER_ID,
    ...overrides,
  };
}

/**
 * The three principals §9 says must never reach a capability writer, plus the
 * shape a forgery would take if `kind` alone were the check. A session actor
 * cannot carry the `unique symbol`, so each of these is a plain object as far as
 * the module is concerned — which is the point.
 */
const forgedActors = [
  ["member", {kind: "member", userId: "user-a", profileId: "user-a"}],
  ["admin", {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"}],
  ["anonymous", {kind: "anonymous", userId: null}],
  ["hand-rolled delivery shape", {kind: "woztell-delivery", userId: null}],
  // The webhook's own capability is a DIFFERENT symbol (S-14): one capability
  // per entry point, so a writer reachable from one route cannot be driven from
  // another just because both are "the WOZTELL side".
  ["woztell webhook actor", {kind: "woztell-webhook", userId: null}],
] as const;

describe("WOZTELL concierge delivery stamp (C-1 Task 10)", () => {
  describe("authorization (S-14)", () => {
    it.each(forgedActors)(
      "refuses a %s actor before opening the database",
      async (_name, actor) => {
        const loadDatabase = vi.fn();
        const stamp = createWoztellDeliveryStampRepository(loadDatabase);

        await expect(stamp.stampConciergeDelivery(actor as never, input()))
          .rejects.toThrow("FORBIDDEN");
        expect(loadDatabase).not.toHaveBeenCalled();
      },
    );

    it("authorizes before parsing attacker-controlled input", async () => {
      const loadDatabase = vi.fn();
      const stamp = createWoztellDeliveryStampRepository(loadDatabase);

      // A ZodError here instead of FORBIDDEN would mean the parse ran first, and
      // a parse is a place to hide a crash that never reaches the gate.
      await expect(stamp.stampConciergeDelivery({kind: "member"} as never, {} as never))
        .rejects.toThrow("FORBIDDEN");
      expect(loadDatabase).not.toHaveBeenCalled();
    });
  });

  describe("stampConciergeDelivery", () => {
    it("gives the newest unstamped outbound row in the thread the id the send API returned", async () => {
      const fixture = repository([[{conversation_id: CONVERSATION_ID}], [{id: MESSAGE_ID}]]);

      await expect(fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input()))
        .resolves.toEqual({stamped: true});

      const resolve = normalized(fixture.queries[0]?.sql);
      expect(resolve).toMatch(/^select /);
      expect(resolve).toContain(`"messages"."direction" = 'inbound'`);
      expect(fixture.queries[0]?.params).toEqual(
        expect.arrayContaining([INBOUND_PROVIDER_MESSAGE_ID]),
      );

      const update = normalized(fixture.queries[1]?.sql);
      expect(update).toMatch(/^update "messages"/);
      expect(update).toContain("delivery_status = 'sent'");
      expect(update).toContain("provider_message_id =");
      expect(fixture.queries[1]?.params).toEqual(
        expect.arrayContaining([CONVERSATION_ID, PROVIDER_ID]),
      );
      // Two statements, no transaction: this is a stamp applied AFTER the jsonb
      // outbox has already decided (S-5), never a second decision.
      expect(fixture.queries).toHaveLength(2);
    });

    it("never reaches for a queued staff reply, a web-widget row or a thread that is not this one", async () => {
      const fixture = repository([[{conversation_id: CONVERSATION_ID}], [{id: MESSAGE_ID}]]);

      await fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input());

      const update = normalized(fixture.queries[1]?.sql);
      expect(update).toContain("conversation_id =");
      // A staff reply is 'queued' from the moment it is written (S-8), and an
      // echo-inserted row is already 'sent'; NULL means "no delivery state yet",
      // which is exactly the concierge's own row.
      expect(update).toContain("delivery_status is null");
      expect(update).toContain("provider_message_id is null");
      expect(update).toContain(`direction = 'outbound'`);
      // A mixed thread carries web-widget replies too, and they are outbound
      // with no delivery state. Stamping one with a WhatsApp provider id would
      // point every later tick at a message WhatsApp never carried.
      expect(update).toContain(`channel = 'whatsapp'`);
      expect(update).toContain("order by candidate.created_at desc");
    });

    it("does nothing and runs no UPDATE when the inbound row is unknown", async () => {
      const fixture = repository([[]]);

      await expect(fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input()))
        .resolves.toEqual({stamped: false});

      expect(fixture.queries).toHaveLength(1);
      expect(fixture.queries.some((query) => /update /i.test(query.sql))).toBe(false);
    });

    it("reports a miss instead of throwing when the concierge's own row is not committed yet", async () => {
      // The assistant row is appended on a different code path
      // (`conversationsWithoutInboundAppend` in lib/ai/woztell-production.ts), so
      // a miss is an ordinary outcome. Throwing would turn a delivered message
      // into an escalation.
      const fixture = repository([[{conversation_id: CONVERSATION_ID}], []]);

      await expect(fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input()))
        .resolves.toEqual({stamped: false});
    });

    it("carries the guard that makes a redelivered stamp a no-op rather than a second row's id", async () => {
      const fixture = repository([[{conversation_id: CONVERSATION_ID}], [{id: MESSAGE_ID}]]);

      await fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input());

      const update = normalized(fixture.queries[1]?.sql);
      // Without this, a second call for the same provider id skips the row it
      // already stamped — it now has one — and stamps the NEXT unstamped bot
      // reply in the thread instead, so every later tick lands on a message that
      // was never sent with that id.
      expect(update).toContain("not exists");
      expect(update).toMatch(/not exists \(\s*select 1 from "messages"/);
      expect(
        (fixture.queries[1]?.params ?? []).filter((value) => value === PROVIDER_ID),
      ).toHaveLength(2);
    });

    it("swallows the unique violation the outbound echo wins, because the message did go out", async () => {
      const fixture = repository([[{conversation_id: CONVERSATION_ID}], uniqueViolation()]);

      await expect(fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input()))
        .resolves.toEqual({stamped: false});
    });

    it("still throws anything that is not a duplicate id, so a broken statement is not silence", async () => {
      const fixture = repository([
        [{conversation_id: CONVERSATION_ID}],
        Object.assign(new Error("column does not exist"), {code: "42703"}),
      ]);

      await expect(fixture.stamp.stampConciergeDelivery(woztellDeliveryActor(), input()))
        .rejects.toThrow("column does not exist");
    });

    it("refuses input the provider could never have produced rather than writing it", async () => {
      const fixture = repository([[{conversation_id: CONVERSATION_ID}], [{id: MESSAGE_ID}]]);

      await expect(fixture.stamp.stampConciergeDelivery(
        woztellDeliveryActor(),
        input({providerId: ""}),
      )).rejects.toThrow();
      expect(fixture.queries).toHaveLength(0);
    });
  });

  /**
   * The other half of Task 10: the stamp is worth nothing if the send path does
   * not reach it, and it must never be able to break a send that succeeded.
   */
  describe("the send path (S-5: after the outbox has decided, never instead of it)", () => {
    const order: string[] = [];

    function deliveryInput(
      overrides: Partial<WoztellDeliveryInput> = {},
    ): WoztellDeliveryInput {
      return {
        providerMessageId: INBOUND_PROVIDER_MESSAGE_ID,
        sender: "+85290000000",
        receivedAt: new Date("2026-09-10T08:59:00.000Z"),
        text: "The concierge's answer.",
        locale: "en",
        memberName: "Member",
        whatsappOptIn: true,
        complete: vi.fn(async () => {
          order.push("complete");
        }),
        escalate: vi.fn(async () => {
          order.push("escalate");
        }),
        ...overrides,
      };
    }

    function dependencies(
      overrides: Partial<WoztellDeliveryDependencies> = {},
    ): WoztellDeliveryDependencies {
      return {
        channel: {
          sendSessionMessage: vi.fn(async () => {
            order.push("sendSessionMessage");
            return {status: "sent" as const, providerId: PROVIDER_ID};
          }),
          sendTemplateMessage: vi.fn(async () => {
            order.push("sendTemplateMessage");
            return {status: "sent" as const, providerId: "wamid.template.1"};
          }),
          normalizeInbound: vi.fn(),
          verifyWebhook: vi.fn(() => true),
        } as unknown as WoztellDeliveryDependencies["channel"],
        reserveDelivery: vi.fn(async () => ({
          status: "send" as const,
          deliveryId: "delivery-1",
        })),
        markDeliverySent: vi.fn(async () => {
          order.push("markDeliverySent");
        }),
        markDeliveryBlocked: vi.fn(async () => undefined),
        approvedTemplateKeys: new Set(["concierge_follow_up_en"] as const),
        supportUrl: "https://hkwtia.example/en/contact",
        ...overrides,
      };
    }

    it("stamps the session reply after the outbox ledger, with the id the adapter returned", async () => {
      order.length = 0;
      const stampOutbound = vi.fn(async () => {
        order.push("stampOutbound");
        return {stamped: true};
      });

      await expect(deliverWoztellReply(deliveryInput(), dependencies({stampOutbound})))
        .resolves.toEqual({status: "accepted"});

      expect(stampOutbound).toHaveBeenCalledWith({
        inboundProviderMessageId: INBOUND_PROVIDER_MESSAGE_ID,
        providerId: PROVIDER_ID,
      });
      // The outbox is the decision and the stamp is bookkeeping on its result,
      // so the order is not cosmetic: stamping first would be a second answer to
      // "did this send happen?".
      expect(order).toEqual([
        "sendSessionMessage",
        "markDeliverySent",
        "stampOutbound",
        "complete",
      ]);
    });

    it("stamps the template fallback with the template's own provider id", async () => {
      order.length = 0;
      const stampOutbound = vi.fn(async () => ({stamped: true}));
      const channel = {
        sendSessionMessage: vi.fn(async () => ({
          status: "blocked" as const,
          reason: "outside_customer_service_window" as const,
        })),
        sendTemplateMessage: vi.fn(async () => ({
          status: "sent" as const,
          providerId: "wamid.template.1",
        })),
        normalizeInbound: vi.fn(),
        verifyWebhook: vi.fn(() => true),
      } as unknown as WoztellDeliveryDependencies["channel"];

      await expect(deliverWoztellReply(
        deliveryInput(),
        dependencies({channel, stampOutbound}),
      )).resolves.toEqual({status: "accepted"});

      expect(stampOutbound).toHaveBeenCalledTimes(1);
      expect(stampOutbound).toHaveBeenCalledWith({
        inboundProviderMessageId: INBOUND_PROVIDER_MESSAGE_ID,
        providerId: "wamid.template.1",
      });
    });

    it("loses the tick rather than the message when the stamp fails", async () => {
      order.length = 0;
      // Bookkeeping must not turn a message the member has already received into
      // `channel_delivery_uncertain` and a staff escalation — nor leave the
      // outbox saying "accepted" while the caller believes the send failed.
      const stampOutbound = vi.fn(async () => {
        throw new Error("STAMP_FAILED");
      });
      const input = deliveryInput();

      await expect(deliverWoztellReply(input, dependencies({stampOutbound})))
        .resolves.toEqual({status: "accepted"});

      expect(input.escalate).not.toHaveBeenCalled();
      expect(input.complete).toHaveBeenCalledOnce();
    });

    it("still delivers when nothing wires a stamp at all", async () => {
      order.length = 0;
      const input = deliveryInput();

      await expect(deliverWoztellReply(input, dependencies()))
        .resolves.toEqual({status: "accepted"});
      expect(input.complete).toHaveBeenCalledOnce();
    });
  });
});
