import {describe, expect, it} from "vitest";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import {canPublishEvents, entitlementsFor, ENTITLEMENTS} from "@/lib/membership/entitlements";

describe("membership entitlements (programme D-5)", () => {
  it("defines an entry for every plan code", () => {
    for (const code of MEMBERSHIP_PLAN_CODES) expect(ENTITLEMENTS[code]).toBeDefined();
  });

  it("keeps community members off event publishing and gives corporate unlimited", () => {
    expect(entitlementsFor("community").publishEventsPerQuarter).toBe(0);
    expect(entitlementsFor("startup").publishEventsPerQuarter).toBe(2);
    expect(entitlementsFor("corporate").publishEventsPerQuarter).toBe(Number.POSITIVE_INFINITY);
    expect(canPublishEvents("community")).toBe(false);
    expect(canPublishEvents("startup")).toBe(true);
  });

  it("orders WhatsApp support by tier", () => {
    expect(entitlementsFor("community").whatsappSupport).toBe("none");
    expect(entitlementsFor("startup").whatsappSupport).toBe("standard");
    expect(entitlementsFor("corporate").whatsappSupport).toBe("priority");
    expect(entitlementsFor("patron").whatsappSupport).toBe("dedicated");
  });

  it("rejects an unknown plan code", () => {
    expect(() => entitlementsFor("gold" as never)).toThrow("INVALID_PLAN_CODE");
  });
});
