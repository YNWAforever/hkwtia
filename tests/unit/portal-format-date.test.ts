import {describe, expect, it} from "vitest";

import {formatPortalDate, portalDateParts} from "@/lib/portal/format-date";

describe("portal date formatting", () => {
  it("formats a long date in Hong Kong time", () => {
    expect(formatPortalDate("en", "2026-11-12T02:00:00Z")).toBe("12 November 2026");
    expect(formatPortalDate("zh-HK", "2026-11-12T02:00:00Z")).toBe("2026年11月12日");
  });

  it("accepts a Date", () => {
    expect(formatPortalDate("en", new Date("2026-11-12T02:00:00Z"))).toBe("12 November 2026");
  });

  it("rolls over to the next day at UTC+8", () => {
    expect(portalDateParts("en", "2026-12-31T17:00:00Z")).toEqual({day: "1", month: "Jan"});
  });
});
