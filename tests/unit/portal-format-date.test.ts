import {describe, expect, it} from "vitest";

import {formatPortalAmount, formatPortalDate, portalDateParts} from "@/lib/portal/format-date";

// A fixed clock: the year on a date block depends on "now", and the wall clock moves.
const NOW = new Date("2026-10-08T04:00:00Z");

describe("portal date formatting", () => {
  it("formats a long date in Hong Kong time", () => {
    expect(formatPortalDate("en", "2026-11-12T02:00:00Z")).toBe("12 November 2026");
    expect(formatPortalDate("zh-HK", "2026-11-12T02:00:00Z")).toBe("2026年11月12日");
  });

  it("accepts a Date", () => {
    expect(formatPortalDate("en", new Date("2026-11-12T02:00:00Z"))).toBe("12 November 2026");
  });

  it("omits the year within the current Hong Kong year", () => {
    expect(portalDateParts("en", "2026-11-12T02:00:00Z", NOW)).toEqual({day: "12", month: "Nov", year: null});
  });

  it("rolls over to the next day, and so the next year, at UTC+8", () => {
    expect(portalDateParts("en", "2026-12-31T17:00:00Z", NOW)).toEqual({day: "1", month: "Jan", year: "2027"});
  });

  it("formats the zh-HK parts", () => {
    expect(portalDateParts("zh-HK", "2026-11-12T02:00:00Z", NOW)).toEqual({day: "12日", month: "11月", year: null});
    expect(portalDateParts("zh-HK", "2027-01-15T11:00:00Z", NOW)).toEqual({day: "15日", month: "1月", year: "2027年"});
  });
});

describe("portal amount formatting", () => {
  it("formats Stripe minor units with the currency's exponent", () => {
    expect(formatPortalAmount("en", 880000, "hkd")).toBe("HK$8,800.00");
    expect(formatPortalAmount("zh-HK", 880000, "hkd")).toBe("HK$8,800.00");
    expect(formatPortalAmount("en", 5000, "jpy")).toBe("JP¥5,000");
  });

  it("returns null for a currency Intl does not know", () => {
    expect(formatPortalAmount("en", 100, "not-a-currency")).toBeNull();
  });
});
