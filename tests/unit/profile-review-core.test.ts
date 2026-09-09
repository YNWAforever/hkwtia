import {describe, expect, it, vi} from "vitest";

import {approveCompanyProfile, rejectCompanyProfile} from "@/lib/admin/profile-review-core";
import type {Actor} from "@/lib/membership/lifecycle";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const staff: Actor = {kind: "staff", userId: "s", profileId: "staff-1"};
const member: Actor = {kind: "member", userId: "u", profileId: "m"};

describe("company profile review core (programme B-7)", () => {
  it("requires an admin and a uuid, then delegates the decision", async () => {
    const review = vi.fn(async () => ({id: COMPANY, public_profile_status: "published" as const, slug: "acme"}));
    await expect(approveCompanyProfile(member, COMPANY, {review})).rejects.toThrow();
    await expect(approveCompanyProfile(staff, "nope", {review})).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
    await expect(approveCompanyProfile(staff, COMPANY, {review})).resolves.toMatchObject({public_profile_status: "published"});
    expect(review).toHaveBeenCalledWith(staff, COMPANY, {decision: "approve"});
    await rejectCompanyProfile(staff, COMPANY, " thin copy ", {review});
    expect(review).toHaveBeenLastCalledWith(staff, COMPANY, {decision: "reject", reason: "thin copy"});
  });

  it("refuses an empty or oversized rejection reason before delegating", async () => {
    const review = vi.fn(async () => ({id: COMPANY, public_profile_status: "rejected" as const, slug: "acme"}));
    await expect(rejectCompanyProfile(staff, COMPANY, "   ", {review})).rejects.toThrow();
    await expect(rejectCompanyProfile(staff, COMPANY, "x".repeat(1_001), {review})).rejects.toThrow();
    await expect(rejectCompanyProfile(member, COMPANY, "thin copy", {review})).rejects.toThrow();
    expect(review).not.toHaveBeenCalled();
  });
});
