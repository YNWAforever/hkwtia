import {describe, expect, it} from "vitest";

import {rate, recurringRevenue} from "@/lib/admin/report-formulas";

describe("report formulas", () => {
  it("annualizes active annual and monthly memberships", () => {
    const result = recurringRevenue([
      {status: "active", interval: "annual", annualPriceHkd: 1800, monthlyPriceHkd: null},
      {status: "active", interval: "monthly", annualPriceHkd: 1200, monthlyPriceHkd: 120},
      {status: "cancelled", interval: "annual", annualPriceHkd: 4800, monthlyPriceHkd: null},
    ]);

    expect(result).toEqual({arrHkd: 3240, mrrHkd: 270});
  });

  it("rounds aggregate revenue to integer HKD", () => {
    expect(recurringRevenue([
      {status: "active", interval: "monthly", annualPriceHkd: null, monthlyPriceHkd: 100.49},
      {status: "active", interval: "annual", annualPriceHkd: 100.49, monthlyPriceHkd: null},
    ])).toEqual({arrHkd: 1306, mrrHkd: 109});
  });

  it("exposes renewal numerator and denominator", () => {
    expect(rate({numerator: 7, denominator: 8})).toEqual({numerator: 7, denominator: 8, percentage: 87.5});
  });

  it("returns null rather than fabricating a percentage for a zero denominator", () => {
    expect(rate({numerator: 0, denominator: 0})).toEqual({numerator: 0, denominator: 0, percentage: null});
  });

  it("rounds percentages to one decimal place", () => {
    expect(rate({numerator: 2, denominator: 3})).toEqual({numerator: 2, denominator: 3, percentage: 66.7});
  });
});
