import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {OrdersTable} from "@/components/admin/orders-table";
import {eventOrderStatusEnum} from "@/lib/db/schema-core";
import type {EventOrderRow} from "@/lib/db/repos/event-orders";
import type {RefundOrderState} from "@/lib/tickets/refund-actions";
import en from "@/messages/en.json";
import zhHk from "@/messages/zh-HK.json";

const ORDER_ID = "b1a2c3d4-1111-4222-8333-944455566677";

const labels = {
  caption: "Orders",
  buyer: "Buyer",
  seats: "Seats",
  amount: "Amount",
  status: "Status",
  refundedOn: "Refunded on",
  refund: "Refund",
  cancel: "Cancel",
  note: "Note",
  confirm: "Refund {buyer}'s seats ({seats}) for {amount}?",
  statuses: {pending: "Pending", paid: "Paid", expired: "Expired", failed: "Failed", refunded: "Refunded"},
} as const;

function amountLabel(cents: number): string {
  return new Intl.NumberFormat("en-HK", {style: "currency", currency: "HKD"}).format(cents / 100);
}

function orderRow(overrides: Partial<EventOrderRow["order"]> = {}, seatNames: readonly string[] = ["Ada Lovelace", "Alan Turing"], seatCount = 2): EventOrderRow {
  return {
    order: {
      id: ORDER_ID,
      eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d",
      buyerProfileId: null,
      buyerName: "Katherine Johnson",
      buyerEmail: "katherine@example.test",
      buyerLocale: "en",
      amountHkdCents: 50_000,
      currency: "hkd",
      status: "paid",
      stripeCheckoutSessionId: "cs_test_1",
      stripeCheckoutUrl: null,
      idempotencyKey: "idem-1",
      expiresAt: new Date("2026-09-14T04:30:00.000Z"),
      paidAt: new Date("2026-09-14T04:05:00.000Z"),
      refundedAt: null,
      refundReason: null,
      ...overrides,
    },
    seatCount,
    seatNames,
  };
}

function noopAction(overrides: Partial<RefundOrderState> = {}): (state: RefundOrderState, formData: FormData) => Promise<RefundOrderState> {
  return async () => ({status: "idle", ...overrides}) as RefundOrderState;
}

describe("OrdersTable", () => {
  it("renders the buyer, the seat names, the amount and the status label", () => {
    render(<OrdersTable action={noopAction()} labels={labels} rows={[orderRow()]} />);

    expect(screen.getByText("Katherine Johnson")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace, Alan Turing")).toBeInTheDocument();
    expect(screen.getByText(amountLabel(50_000))).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("renders an empty list rather than an empty table", () => {
    render(<OrdersTable action={noopAction()} labels={labels} rows={[]} />);

    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers the refund control on a paid row and submits it in one deliberate step", async () => {
    const action = vi.fn(noopAction());
    render(<OrdersTable action={action} labels={labels} rows={[orderRow()]} />);

    // Nothing is posted until staff press Refund: the confirmation is the step
    // that turns a control into a form, so a stray click cannot refund.
    expect(action).not.toHaveBeenCalled();
    const start = screen.getByRole("button", {name: "Refund"});

    fireEvent.click(start);

    expect(action).not.toHaveBeenCalled();
    const confirm = screen.getByRole("alert");
    expect(confirm).toHaveTextContent("Katherine Johnson");
    expect(confirm).toHaveTextContent("Ada Lovelace, Alan Turing");
    expect(confirm).toHaveTextContent(amountLabel(50_000));

    fireEvent.submit(confirm.closest("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0]![1];
    expect(formData.get("orderId")).toBe(ORDER_ID);
  });

  it("renders a refunded row with its date and no refund control", () => {
    render(<OrdersTable action={noopAction()} labels={labels} rows={[orderRow({status: "refunded", refundedAt: new Date("2026-09-14T05:00:00.000Z")})]} />);

    expect(screen.queryByRole("button", {name: "Refund"})).toBeNull();
    expect(screen.getByText(/2026-09-14/)).toBeInTheDocument();
  });

  it("renders no refund control on a row that is not paid", () => {
    render(<OrdersTable action={noopAction()} labels={labels} rows={[orderRow({status: "pending"})]} />);

    expect(screen.queryByRole("button", {name: "Refund"})).toBeNull();
  });
});

describe("the orders status labels", () => {
  // Derived from the enum the repository writes, so a new status cannot be added
  // without a label: a missing one renders the raw status, which is the trap the
  // adjacent attendee-status map was caught by.
  it("covers every status the repository can emit, in both bundles", () => {
    const statuses = [...eventOrderStatusEnum.enumValues].sort();

    expect(Object.keys(en.Admin.eventsMgmt.orders.statuses).sort()).toEqual(statuses);
    expect(Object.keys(zhHk.Admin.eventsMgmt.orders.statuses).sort()).toEqual(statuses);
  });
});
