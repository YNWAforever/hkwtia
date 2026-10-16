import {describe, expect, it} from "vitest";
import {grantInputSchema, isMembershipGrantEffectiveAt} from "@/lib/membership/grants";

const profileGrant = {target: {kind: "profile", profileId: "p-1"}, planCode: "community", effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z", reason: "Approved community scholarship"};

describe("finite membership grant contract", () => {
  it("requires a reason, one target and a strictly increasing window", () => {
    expect(grantInputSchema.parse(profileGrant).target).toEqual({kind: "profile", profileId: "p-1"});
    expect(grantInputSchema.safeParse({...profileGrant, reason: " "}).success).toBe(false);
    expect(grantInputSchema.safeParse({...profileGrant, expiresAt: profileGrant.effectiveAt}).success).toBe(false);
    expect(grantInputSchema.safeParse({...profileGrant, target: {...profileGrant.target, companyId: "c-1"}}).success).toBe(false);
    expect(grantInputSchema.safeParse({...profileGrant, stripeSubscriptionId: "sub_fake"}).success).toBe(false);
  });
  it("starts at the effective instant and denies at the expiry instant even if a worker is late", () => {
    const window = {effectiveAt: new Date(profileGrant.effectiveAt), expiresAt: new Date(profileGrant.expiresAt)};
    expect(isMembershipGrantEffectiveAt(window, new Date("2026-09-30T23:59:59.999Z"))).toBe(false);
    expect(isMembershipGrantEffectiveAt(window, new Date(profileGrant.effectiveAt))).toBe(true);
    expect(isMembershipGrantEffectiveAt(window, new Date(profileGrant.expiresAt))).toBe(false);
    expect(isMembershipGrantEffectiveAt({effectiveAt: null, expiresAt: null}, new Date(profileGrant.expiresAt))).toBe(true);
  });
});
