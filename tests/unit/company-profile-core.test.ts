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
  it("saves and submits the explicit target even when both managed companies are returned in another order", async () => {
    const d = deps();
    d.dashboard.mockResolvedValue({companies: [{id: OTHER, canManage: true, displayName: "Other"}, {id: COMPANY, canManage: true, displayName: "Acme"}], memberships: []});
    await saveCompanyProfile(member, {companyId: COMPANY, profile: input}, d as never);
    await submitCompanyProfile(member, COMPANY, d as never);
    expect(d.profiles.updateProfile).toHaveBeenCalledWith(member, COMPANY, input);
    expect(d.profiles.submitForReview).toHaveBeenCalledWith(member, COMPANY);
  });

  it.each([undefined, "", OTHER, "unknown-company"])("never falls back from a missing or unauthorized target %s", async (companyId) => {
    const d = deps();
    await expect(saveCompanyProfile(member, {companyId, profile: input}, d as never)).rejects.toThrow();
    await expect(submitCompanyProfile(member, companyId as string, d as never)).rejects.toThrow();
    expect(d.profiles.updateProfile).not.toHaveBeenCalled();
    expect(d.profiles.submitForReview).not.toHaveBeenCalled();
  });

  it("does not retry a repository role-race refusal against another company", async () => {
    const d = deps();
    d.profiles.updateProfile.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(saveCompanyProfile(member, {companyId: COMPANY, profile: input}, d as never)).rejects.toThrow("FORBIDDEN");
    expect(d.profiles.updateProfile).toHaveBeenCalledTimes(1);
    expect(d.profiles.updateProfile).toHaveBeenCalledWith(member, COMPANY, input);
  });

  it("resolves the requested managed company", async () => {
    const d = deps();
    await expect(loadCompanyProfileContext(member, COMPANY, d as never)).resolves.toMatchObject({companyId: COMPANY, companyName: "Acme"});
  });

  it("saves through the managed company", async () => {
    const d = deps();
    await expect(saveCompanyProfile(member, {companyId: COMPANY, profile: input}, d as never)).resolves.toMatchObject({id: COMPANY});
    expect(d.profiles.updateProfile).toHaveBeenCalledWith(member, COMPANY, input);
    expect(d.profiles.submitForReview).not.toHaveBeenCalled();
  });

  it("submits the same company for review", async () => {
    const d = deps();
    await expect(submitCompanyProfile(member, COMPANY, d as never)).resolves.toMatchObject({public_profile_status: "pending_review"});
    expect(d.profiles.submitForReview).toHaveBeenCalledWith(member, COMPANY);
    expect(d.profiles.updateProfile).not.toHaveBeenCalled();
  });

  it("refuses when the member manages no company, before any write", async () => {
    const d = deps();
    d.dashboard.mockResolvedValue({companies: [{id: OTHER, canManage: false, displayName: "Someone else"}], memberships: []});
    await expect(saveCompanyProfile(member, {companyId: COMPANY, profile: input}, d as never)).rejects.toThrow("FORBIDDEN");
    await expect(submitCompanyProfile(member, COMPANY, d as never)).rejects.toThrow("FORBIDDEN");
    expect(d.profiles.updateProfile).not.toHaveBeenCalled();
    expect(d.profiles.submitForReview).not.toHaveBeenCalled();
  });

  it("refuses a non-member actor before touching the dashboard", async () => {
    const d = deps();
    await expect(saveCompanyProfile({kind: "staff", userId: "s", profileId: "p"}, {companyId: COMPANY, profile: input}, d as never)).rejects.toThrow();
    await expect(submitCompanyProfile({kind: "anonymous", userId: null}, COMPANY, d as never)).rejects.toThrow();
    expect(d.dashboard).not.toHaveBeenCalled();
  });

  it("passes the repository's own refusals through unchanged, so the form can name them", async () => {
    const d = deps();
    d.profiles.updateProfile.mockRejectedValueOnce(new Error("COMPANY_SLUG_TAKEN"));
    await expect(saveCompanyProfile(member, {companyId: COMPANY, profile: input}, d as never)).rejects.toThrow("COMPANY_SLUG_TAKEN");
    d.profiles.submitForReview.mockRejectedValueOnce(new Error("INVALID_PROFILE_TRANSITION"));
    await expect(submitCompanyProfile(member, COMPANY, d as never)).rejects.toThrow("INVALID_PROFILE_TRANSITION");
  });
});
