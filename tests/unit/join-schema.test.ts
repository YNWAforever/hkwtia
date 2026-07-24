import {describe, expect, expectTypeOf, it} from "vitest";

import {
  completeApplicationSchema,
  joinInputSchema,
  type JoinInput,
} from "@/lib/membership/join-schema";
import {getPlan, PLAN_CODES} from "@/lib/membership/plans";

describe("membership join schemas", () => {
  it("exposes the four stable plan codes and metadata", () => {
    expect(PLAN_CODES).toEqual(["community", "startup", "corporate", "patron"]);
    expect(getPlan("community")).toMatchObject({code: "community", billingBehavior: "free"});
    expect(getPlan("startup")).toMatchObject({code: "startup", billingBehavior: "checkout"});
    expect(getPlan("corporate")).toMatchObject({code: "corporate", billingBehavior: "checkout"});
    expect(getPlan("patron")).toMatchObject({code: "patron", billingBehavior: "review"});
  });

  it("rejects an unknown plan code and accepts a nullable draft id", () => {
    expect(joinInputSchema.safeParse({plan: "unknown", applicationId: null}).success).toBe(false);
    expect(joinInputSchema.parse({plan: "community", applicationId: null})).toEqual({
      plan: "community",
      applicationId: null,
    });
    expectTypeOf<JoinInput["plan"]>().toEqualTypeOf<(typeof PLAN_CODES)[number]>();
  });

  it("requires a profile when completing an application", () => {
    expect(
      completeApplicationSchema.safeParse({plan: "patron", profile: {displayName: "Patron"}}).success,
    ).toBe(true);
    expect(completeApplicationSchema.safeParse({plan: "patron", company: null}).success).toBe(false);
  });
});
