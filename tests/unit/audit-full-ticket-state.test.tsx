import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {
  OrdersTable,
  type OrdersLabels,
} from "@/components/admin/orders-table";
import type { OrderRecord } from "@/lib/db/repos/event-orders";
const order: OrderRecord = {
  id: "33333333-3333-4333-8333-333333333333",
  eventId: "event",
  buyerProfileId: null,
  buyerName: "Synthetic Buyer",
  buyerEmail: "buyer@example.test",
  buyerLocale: "en",
  amountHkdCents: 1000,
  currency: "hkd",
  status: "refund_pending",
  stripeCheckoutSessionId: null,
  stripeCheckoutUrl: null,
  idempotencyKey: "test",
  expiresAt: new Date(),
  paidAt: new Date(),
  refundedAt: null,
  refundReason: "oversold",
};
describe("truthful pending ticket refund UI", () => {
  it.each([
    ["en", en, "Order reference", "Refund awaiting provider confirmation"],
    ["zh-HK", zh, "訂單編號", "退款待供應商確認"],
  ] as const)(
    "%s distinguishes a refund intent from completed payment and gives the order reference",
    (locale, m, reference, pending) => {
      render(
        <OrdersTable
          action={vi.fn()}
          rows={[{ order, seatCount: 1, seatNames: ["Synthetic Seat"] }]}
          labels={m.Admin.eventsMgmt.orders as unknown as OrdersLabels}
          locale={locale}
        />,
      );
      expect(
        screen.getByRole("columnheader", { name: reference }),
      ).toBeInTheDocument();
      expect(screen.getByText(order.id)).toBeInTheDocument();
      expect(screen.getByText(pending)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: m.Admin.eventsMgmt.orders.refund,
        }),
      ).not.toBeInTheDocument();
    },
  );
});
