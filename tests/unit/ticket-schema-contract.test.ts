import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {eventOrderSeats, eventOrders, eventOrderStatusEnum, eventRefundReasonEnum, events} from "@/lib/db/schema-core";

describe("phase D-4a ticket schema contract", () => {
  it("defines the order status and refund reason vocabularies", () => {
    expect(eventOrderStatusEnum.enumValues).toEqual(["pending", "paid", "expired", "failed", "refunded"]);
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
