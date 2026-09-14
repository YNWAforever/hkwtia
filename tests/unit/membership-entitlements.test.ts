import {describe, expect, it} from "vitest";

import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";
import {aiWriterRunsPerMonth, canPublishEvents, entitlementsFor, ENTITLEMENTS} from "@/lib/membership/entitlements";

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

  it("caps AI writer runs per month by tier", () => {
    // The window is the calendar month; the caps are the numbers a member is
    // told ("20 a month"), so they live here rather than in a page.
    expect(aiWriterRunsPerMonth("community")).toBe(0);
    expect(aiWriterRunsPerMonth("startup")).toBe(20);
    expect(aiWriterRunsPerMonth("corporate")).toBe(100);
    expect(aiWriterRunsPerMonth("patron")).toBe(Number.POSITIVE_INFINITY);
  });
});
