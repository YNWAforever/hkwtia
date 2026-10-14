import {describe, expect, it} from "vitest";
import {ticketReturnPaths} from "@/lib/tickets/return-paths";

describe("checkout destinations come from event audience and the created order", () => {
  for (const [locale, prefix] of [["en", ""], ["zh-HK", "/zh"]] as const) {
    it(`returns private checkout to the buyer's order in ${locale}`, () => {
      expect(ticketReturnPaths({visibility: "members_only", memberOnly: true, slug: "private"}, "order-1", locale)).toEqual({successPath: `${prefix}/portal/orders/order-1?ticket=received`, cancelPath: `${prefix}/portal/orders/order-1?ticket=cancelled`});
    });
    it(`preserves public event return paths in ${locale}`, () => {
      expect(ticketReturnPaths({visibility: "public", memberOnly: false, slug: "public"}, "order-1", locale)).toEqual({successPath: `${prefix}/events/public?ticket=received`, cancelPath: `${prefix}/events/public?ticket=cancelled`});
    });
  }
  it("uses the stricter legacy audience and never accepts an external destination", () => {
    const paths = ticketReturnPaths({visibility: "public", memberOnly: true, slug: "https://evil.test"}, "//evil.test", "en");
    expect(paths.successPath).toBe("/portal/orders/%2F%2Fevil.test?ticket=received");
    expect(() => ticketReturnPaths({visibility: "invite_only", memberOnly: false, slug: "private"}, "order-1", "en")).toThrow("NOT_ELIGIBLE");
  });
});
