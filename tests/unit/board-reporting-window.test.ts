import {describe, expect, it} from "vitest";

import {previousHongKongMonthWindow} from "@/lib/ai/board-reporter/reporting-window";

describe("previousHongKongMonthWindow", () => {
  it("returns the previous complete Hong Kong calendar month as half-open UTC bounds", () => {
    expect(previousHongKongMonthWindow(new Date("2026-07-29T02:00:00.000Z"))).toEqual({
      reportMonth: "2026-06",
      display: {
        from: "2026-06-01",
        to: "2026-06-30",
        timezone: "Asia/Hong_Kong",
      },
      utc: {
        from: new Date("2026-05-31T16:00:00.000Z"),
        toExclusive: new Date("2026-06-30T16:00:00.000Z"),
        asOf: new Date("2026-06-30T16:00:00.000Z"),
      },
    });
  });

  it("handles year rollover using Hong Kong local time without host-timezone or DST drift", () => {
    expect(previousHongKongMonthWindow(new Date("2026-01-01T00:30:00.000Z"))).toEqual({
      reportMonth: "2025-12",
      display: {
        from: "2025-12-01",
        to: "2025-12-31",
        timezone: "Asia/Hong_Kong",
      },
      utc: {
        from: new Date("2025-11-30T16:00:00.000Z"),
        toExclusive: new Date("2025-12-31T16:00:00.000Z"),
        asOf: new Date("2025-12-31T16:00:00.000Z"),
      },
    });
  });
});
