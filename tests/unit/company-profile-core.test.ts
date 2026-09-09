import {describe, expect, it, vi} from "vitest";

import {loadCompanyProfileContext, saveCompanyProfile, submitCompanyProfile} from "@/lib/portal/company-profile-core";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const member = {kind: "member" as const, userId: "u", profileId: "member-1"};

const input = {
  slug: "acme", taglineEn: "Ships things", taglineZhHk: null, descriptionZhHk: null,
  tags: ["ai", "logistics"], logoMediaId: null, website: "https://acme.example",
};

function deps() {
  return {
    profiles: {
      updateProfile: vi.fn(async () => ({id: COMPANY, public_profile_status: "hidden"})),
      submitForReview: vi.fn(async () => ({id: COMPANY, public_profile_status: "pending_review"})),
    },
    // A member can sit in several companies; only the ones they manage may be edited.
    dashboard: vi.fn(async () => ({
      companies: [
        {id: OTHER, canManage: false, displayName: "Someone else"},
        {id: COMPANY, canManage: true, displayName: "Acme"},
      ],
      memberships: [],
    })),
  };
}

describe("company profile core (programme B-7)", () => {
  it("resolves the first company the member manages, never one they only belong to", async () => {
    const d = deps();
    await expect(loadCompanyProfileContext(member, d as never)).resolves.toMatchObject({companyId: COMPANY, companyName: "Acme"});
  });

  it("saves through the managed company", async () => {
    const d = deps();
    await expect(saveCompanyProfile(member, input, d as never)).resolves.toMatchObject({id: COMPANY});
    expect(d.profiles.updateProfile).toHaveBeenCalledWith(member, COMPANY, input);
    expect(d.profiles.submitForReview).not.toHaveBeenCalled();
  });

  it("submits the same company for review", async () => {
    const d = deps();
    await expect(submitCompanyProfile(member, d as never)).resolves.toMatchObject({public_profile_status: "pending_review"});
    expect(d.profiles.submitForReview).toHaveBeenCalledWith(member, COMPANY);
    expect(d.profiles.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses when the member manages no company, before any write", async () => {
    const d = deps();
    d.dashboard.mockResolvedValue({companies: [{id: OTHER, canManage: false, displayName: "Someone else"}], memberships: []});
    await expect(saveCompanyProfile(member, input, d as never)).rejects.toThrow("NO_MANAGED_COMPANY");
    await expect(submitCompanyProfile(member, d as never)).rejects.toThrow("NO_MANAGED_COMPANY");
    expect(d.profiles.updateProfile).not.toHaveBeenCalled();
    expect(d.profiles.submitForReview).not.toHaveBeenCalled();
  });

  it("refuses a non-member actor before touching the dashboard", async () => {
    const d = deps();
    await expect(saveCompanyProfile({kind: "staff", userId: "s", profileId: "p"}, input, d as never)).rejects.toThrow();
    await expect(submitCompanyProfile({kind: "anonymous", userId: null}, d as never)).rejects.toThrow();
    expect(d.dashboard).not.toHaveBeenCalled();
  });

  it("passes the repository's own refusals through unchanged, so the form can name them", async () => {
    const d = deps();
    d.profiles.updateProfile.mockRejectedValueOnce(new Error("COMPANY_SLUG_TAKEN"));
    await expect(saveCompanyProfile(member, input, d as never)).rejects.toThrow("COMPANY_SLUG_TAKEN");
    d.profiles.submitForReview.mockRejectedValueOnce(new Error("INVALID_PROFILE_TRANSITION"));
    await expect(submitCompanyProfile(member, d as never)).rejects.toThrow("INVALID_PROFILE_TRANSITION");
  });
});
