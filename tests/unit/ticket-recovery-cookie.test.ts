import {describe, expect, it} from "vitest";
import {parseTicketRecoveryCookie, ticketRecoveryCookieOptions, ticketRecoveryCookieValue} from "@/lib/tickets/recovery-cookie";

const cookie = {eventId: "10000000-0000-4000-8000-000000000001", idempotencyKey: "20000000-0000-4000-8000-000000000002", token: "a".repeat(43)};
describe("ticket recovery cookie", () => {
  it("round-trips a valid opaque capability", () => expect(parseTicketRecoveryCookie(ticketRecoveryCookieValue(cookie))).toEqual(cookie));
  it("rejects altered delimiters and malformed token lengths", () => {
    expect(parseTicketRecoveryCookie(ticketRecoveryCookieValue(cookie).replace("v1.", "v1X"))).toBeNull();
    expect(parseTicketRecoveryCookie(ticketRecoveryCookieValue({...cookie, token: "a".repeat(42)}))).toBeNull();
  });
  it("sets the HttpOnly same-site capability for the provider return window", () => {
    expect(ticketRecoveryCookieOptions()).toEqual(expect.objectContaining({httpOnly: true, sameSite: "lax", path: "/", maxAge: 2700}));
  });
});
