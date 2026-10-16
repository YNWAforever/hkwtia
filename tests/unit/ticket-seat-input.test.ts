import {describe, expect, it} from "vitest";

import {parseTicketCheckoutForm} from "@/lib/tickets/checkout-input";

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const KEY = "20000000-0000-4000-8000-000000000002";
function form(quantity: string | null, seats: readonly {name: string; email: string}[] = []): FormData {
  const data = new FormData();
  data.set("eventId", EVENT_ID);
  data.set("idempotencyKey", KEY);
  data.set("buyerName", "Ada Lovelace");
  data.set("buyerEmail", "ADA@EXAMPLE.HK");
  data.set("locale", "en");
  if (quantity !== null) data.set("quantity", quantity);
  seats.forEach((seat, index) => {
    data.set(`seatName-${index}`, seat.name);
    data.set(`seatEmail-${index}`, seat.email);
  });
  return data;
}
const complete = Array.from({length: 10}, (_, index) => ({name: `Attendee ${index}`, email: `seat${index}@example.test`}));

describe("ticket checkout seat input", () => {
  it("rejects a three-seat order with only one attendee before checkout", () => {
    const parsed = parseTicketCheckoutForm(form("3", complete.slice(0, 1)));
    expect(parsed).toEqual(expect.objectContaining({ok: false, fieldErrors: expect.objectContaining({"seatName-1": "required", "seatEmail-1": "required", "seatName-2": "required", "seatEmail-2": "required"})}));
  });
  it.each([null, "0", "11", "1.5", "-1", "abc", ""])('rejects invalid quantity %s', (quantity) => {
    const parsed = parseTicketCheckoutForm(form(quantity, complete.slice(0, 1)));
    expect(parsed).toEqual(expect.objectContaining({ok: false, fieldErrors: expect.objectContaining({quantity: "invalid"})}));
  });
  it("rejects a nonempty attendee outside the selected count", () => {
    const parsed = parseTicketCheckoutForm(form("1", complete.slice(0, 2)));
    expect(parsed).toEqual(expect.objectContaining({ok: false, fieldErrors: expect.objectContaining({"seatName-1": "extra"})}));
  });
  it("rejects malformed attendee fields inside the selected count", () => {
    const parsed = parseTicketCheckoutForm(form("2", [{name: "Ada", email: "bad"}, {name: "", email: "seat@example.test"}]));
    expect(parsed).toEqual(expect.objectContaining({ok: false, fieldErrors: expect.objectContaining({"seatEmail-0": "invalid", "seatName-1": "required"})}));
  });
  it.each([1, 3, 10])("accepts exactly %i complete seats", (quantity) => {
    const parsed = parseTicketCheckoutForm(form(String(quantity), complete.slice(0, quantity)));
    expect(parsed).toEqual({ok: true, data: expect.objectContaining({quantity, seats: complete.slice(0, quantity), buyerEmail: "ada@example.hk"})});
  });
});
