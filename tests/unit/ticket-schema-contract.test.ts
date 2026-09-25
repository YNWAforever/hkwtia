import {PgDialect, getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {eventOrderSeats, eventOrders, eventOrderStatusEnum, eventRefundReasonEnum, events} from "@/lib/db/schema-core";

const dialect = new PgDialect();
const checkBody = (table: Parameters<typeof getTableConfig>[0], name: string): string => {
  const check = getTableConfig(table).checks.find((entry) => entry.name === name);
  if (!check) throw new Error(`missing check ${name}`);
  return dialect.sqlToQuery(check.value).sql;
};

describe("phase D-4a ticket schema contract", () => {
  it("defines the order status and refund reason vocabularies", () => {
    expect(eventOrderStatusEnum.enumValues).toEqual(["pending", "paid", "expired", "failed", "refunded", "refund_failed"]);
    expect(eventRefundReasonEnum.enumValues).toEqual(["oversold", "staff", "cancelled"]);
  });

  it("carries the price on the event and the money in integer cents", () => {
    expect(events.ticketPriceHkdCents).toBeDefined();
    expect(eventOrders.amountHkdCents.getSQLType()).toBe("integer");
    expect(eventOrders.currency.default).toBe("hkd");
  });

  // A ticketed event with no price would sell a free seat through a paid lane; a
  // price on a non-ticketed event would be money nobody can pay.
  it("requires a positive price exactly when the event is ticketed", () => {
    const checks = getTableConfig(events).checks.map((check) => check.name);
    expect(checks).toContain("events_ticketed_price_check");
  });

  // The name pins that a check exists; only its body pins what it says. A
  // mistyped predicate under the right name would pass every other assertion
  // here and sell a free seat or a negative-priced order.
  it("renders the ticketed-price check as the mode predicate and a positivity test", () => {
    const body = checkBody(events, "events_ticketed_price_check");
    expect(body).toMatch(/<>\s*'ticketed'/);
    expect(body).toContain("IS NOT NULL");
    expect(body).toMatch(/>\s*0/);
  });

  it("requires a positive order amount", () => {
    const body = checkBody(eventOrders, "event_orders_amount_check");
    expect(body).toMatch(/amount_hkd_cents/);
    expect(body).toMatch(/>\s*0/);
  });

  it("keeps one seat position per order and links seats to the order", () => {
    const indexes = getTableConfig(eventOrderSeats).indexes.map((index) => index.config.name);
    expect(indexes).toContain("event_order_seats_position_unique");
    expect(eventOrderSeats.orderId.notNull).toBe(true);
    expect(eventOrderSeats.position.notNull).toBe(true);
  });

  it("gives the order one session and one idempotency key", () => {
    const unique = getTableConfig(eventOrders).indexes
      .filter((index) => index.config.unique)
      .map((index) => index.config.name);
    expect(unique).toContain("event_orders_session_unique");
    expect(unique).toContain("event_orders_idempotency_unique");
  });
});
