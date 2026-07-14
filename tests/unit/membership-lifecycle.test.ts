import {describe, expect, it} from "vitest";

import {canTransitionMembership} from "@/lib/membership/lifecycle";

describe("membership lifecycle", () => {
  it("allows paid membership to recover from past_due after invoice.paid", () => {
    expect(canTransitionMembership("past_due", "active")).toBe(true);
  });

  it("rejects a direct pending_payment to cancelled transition", () => {
    expect(canTransitionMembership("pending_payment", "cancelled")).toBe(false);
  });

  it("allows a pending review membership to become active after approval", () => {
    expect(canTransitionMembership("pending_review", "active")).toBe(true);
  });

  it("does not allow terminal memberships to be revived", () => {
    expect(canTransitionMembership("cancelled", "active")).toBe(false);
    expect(canTransitionMembership("expired", "active")).toBe(false);
  });
});
