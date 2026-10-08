import {describe, expect, it} from "vitest";

import {billingPeriodLine} from "@/lib/portal/billing-period";

describe("billingPeriodLine", () => {
  it("is null without a period end or a record", () => {
    expect(billingPeriodLine({billingPeriodEnd: null, cancelAtPeriodEnd: false})).toBeNull();
    expect(billingPeriodLine(undefined)).toBeNull();
  });
  it("renews unless the membership cancels at period end", () => {
    const end = new Date("2026-11-12T00:00:00.000Z");
    expect(billingPeriodLine({billingPeriodEnd: end, cancelAtPeriodEnd: false})).toEqual({kind: "renews", date: end});
    expect(billingPeriodLine({billingPeriodEnd: "2026-11-12T00:00:00.000Z", cancelAtPeriodEnd: true})).toEqual({kind: "ends", date: end});
  });
});
