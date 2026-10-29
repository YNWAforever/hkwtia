import {describe, expect, it} from "vitest";

import {
  MEMBERSHIP_KIT_LINKS,
  MEMBERSHIP_TRACKS,
  applicationOutcome,
  membershipTrack,
  planCollectsCompany,
  renewalPathForStatus,
} from "@/config/membership-journey";
import {deriveOnboardingChecklist} from "@/lib/portal/onboarding-checklist";
import {directoryCardModel} from "@/lib/members/profile-hooks";

describe("membership onboarding journey", () => {
  it("keeps the four tier names and maps them onto two tracks", () => {
    expect(MEMBERSHIP_TRACKS.individual).toEqual(["community", "startup"]);
    expect(MEMBERSHIP_TRACKS.organisation).toEqual(["corporate", "patron"]);
    expect(membershipTrack("startup")).toBe("individual");
    expect(membershipTrack("patron")).toBe("organisation");
  });

  it("sends individual paid plans to the existing checkout and organisation plans to review", () => {
    expect(applicationOutcome("community")).toEqual({kind: "free", billingInterval: "none", status: "active"});
    expect(applicationOutcome("startup")).toEqual({kind: "checkout", billingInterval: "annual", status: "pending_payment"});
    expect(applicationOutcome("corporate")).toEqual({kind: "review", billingInterval: "none", status: "pending_review"});
    expect(applicationOutcome("patron")).toEqual({kind: "review", billingInterval: "none", status: "pending_review"});
  });

  it("collects a company for every plan except community", () => {
    expect(planCollectsCompany("community")).toBe(false);
    expect(planCollectsCompany("startup")).toBe(true);
    expect(planCollectsCompany("corporate")).toBe(true);
    expect(planCollectsCompany("patron")).toBe(true);
  });

  it("keeps kit and WhatsApp placeholders in one object", () => {
    expect(Object.values(MEMBERSHIP_KIT_LINKS).every((href) => href.startsWith("https://example.com/wtia/"))).toBe(true);
    const checklist = deriveOnboardingChecklist({profileComplete: true, whatsappOptIn: false});
    expect(checklist.find((item) => item.id === "welcomeKit")?.href).toBe(MEMBERSHIP_KIT_LINKS.welcomeKit);
    expect(checklist.find((item) => item.id === "profile")).toMatchObject({done: true, external: false});
    expect(checklist.find((item) => item.id === "whatsapp")).toMatchObject({done: false});
    expect(checklist.find((item) => item.id === "firstEvent")?.done).toBe(false);
  });

  it("routes lapsed and past-due members through the billing page", () => {
    expect(renewalPathForStatus("expired")).toBe("/portal/billing");
    expect(renewalPathForStatus("cancelled")).toBe("/portal/billing");
    expect(renewalPathForStatus("past_due")).toBe("/portal/billing");
    expect(renewalPathForStatus("active")).toBeNull();
  });

  it("keeps the public directory card on the company shape with an empty person list", () => {
    const model = directoryCardModel({
      id: "company-1",
      slug: "acme",
      name: "Acme",
      tagline: {en: "Harbour", zhHk: null},
      tags: ["ai"],
      plan: "corporate",
      website: null,
      logoUrl: null,
    });
    expect(model.people).toEqual([]);
    expect(model).toMatchObject({slug: "acme", name: "Acme", plan: "corporate"});
  });
});
