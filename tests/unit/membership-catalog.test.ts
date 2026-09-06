import {describe, expect, it} from "vitest";

import {resolveMembershipOption} from "@/lib/membership/catalog";

const env = {stripeStartupPriceId: "price_startup_annual", stripeCorporatePriceId: "price_corporate_annual"};

describe("resolveMembershipOption", () => {
  it("resolves Community to billingInterval none, with no price reference", () => {
    const option = resolveMembershipOption("community", "none", env);
    expect(option).toEqual({planCode: "community", billingInterval: "none", priceReference: null, available: true});
  });

  it("resolves Startup annual to its configured Stripe price, without ever including it in a display-safe read", () => {
    const option = resolveMembershipOption("startup", "annual", env);
    expect(option.available).toBe(true);
    expect(option.priceReference).toBe("price_startup_annual");
  });

  it("fails closed for a monthly option because no distinct monthly Stripe mapping is configured", () => {
    const option = resolveMembershipOption("startup", "monthly", env);
    expect(option.available).toBe(false);
  });

  it("fails closed for Patron with a non-none interval (Patron is review-only)", () => {
    const option = resolveMembershipOption("patron", "annual", env);
    expect(option.available).toBe(false);
  });

  it("fails closed when a paid plan's price env var is missing", () => {
    const option = resolveMembershipOption("startup", "annual", {stripeStartupPriceId: "", stripeCorporatePriceId: "price_corporate_annual"});
    expect(option.available).toBe(false);
  });

  it("never serializes the price reference alongside a display-safe projection", () => {
    const option = resolveMembershipOption("startup", "annual", env);
    const displaySafe = {planCode: option.planCode, billingInterval: option.billingInterval, available: option.available};
    expect(displaySafe).not.toHaveProperty("priceReference");
  });
});
