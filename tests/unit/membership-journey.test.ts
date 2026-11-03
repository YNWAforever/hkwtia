import {describe, expect, it} from "vitest";

import {
  LEGACY_JOIN_REDIRECT,
  MEMBERSHIP_KIT_LINKS,
  OPS_MEMBERSHIP_TIERS,
  applicationOutcome,
  planCollectsCompany,
  publishedMembershipKitHref,
  renewalPathForStatus,
} from "@/config/membership-journey";
import {deriveOnboardingChecklist} from "@/lib/portal/onboarding-checklist";
import {directoryCardModel} from "@/lib/members/profile-hooks";

describe("membership onboarding journey", () => {
  it("offers Individual, Corporate, and Platinum at the ops prices", () => {
    expect(OPS_MEMBERSHIP_TIERS.map((tier) => [tier.code, tier.annualPriceHkd])).toEqual([
      ["individual", 500],
      ["corporate", 1800],
      ["platinum", 4800],
    ]);
  });

  it("keeps community on its own join link and redirects only startup and patron", () => {
    expect(LEGACY_JOIN_REDIRECT.community).toBeUndefined();
    expect(LEGACY_JOIN_REDIRECT.startup).toBe("individual");
    expect(LEGACY_JOIN_REDIRECT.patron).toBe("platinum");
  });

  it("sends the ops tiers to checkout and keeps only the legacy patron exception on review", () => {
    expect(applicationOutcome("individual")).toEqual({kind: "checkout", billingInterval: "annual", status: "pending_payment"});
    expect(applicationOutcome("corporate")).toEqual({kind: "checkout", billingInterval: "annual", status: "pending_payment"});
    expect(applicationOutcome("platinum")).toEqual({kind: "checkout", billingInterval: "annual", status: "pending_payment"});
    expect(applicationOutcome("community")).toEqual({kind: "free", billingInterval: "none", status: "active"});
    expect(applicationOutcome("patron")).toEqual({kind: "review", billingInterval: "none", status: "pending_review"});
  });

  it("collects a company for every plan except community", () => {
    expect(planCollectsCompany("community")).toBe(false);
    expect(planCollectsCompany("startup")).toBe(true);
    expect(planCollectsCompany("corporate")).toBe(true);
    expect(planCollectsCompany("patron")).toBe(true);
  });

  it("keeps kit links unset until real URLs exist", () => {
    expect(MEMBERSHIP_KIT_LINKS).toEqual({
      welcomeKit: null,
      associationKit: null,
      whatsappCommunity: null,
    });
    const checklist = deriveOnboardingChecklist({profileComplete: true, whatsappOptIn: false});
    expect(checklist.map((item) => item.id)).toEqual(["profile", "whatsapp", "firstEvent"]);
    expect(checklist.some((item) => item.href.includes("example.com"))).toBe(false);
    expect(checklist.find((item) => item.id === "profile")).toMatchObject({done: true, external: false});
    expect(checklist.find((item) => item.id === "whatsapp")).toMatchObject({done: false});
    expect(checklist.find((item) => item.id === "firstEvent")?.done).toBe(false);
  });

  it("detects placeholder kit hrefs and keeps a real https URL", () => {
    expect(publishedMembershipKitHref(null)).toBeNull();
    expect(publishedMembershipKitHref("")).toBeNull();
    expect(publishedMembershipKitHref("   ")).toBeNull();
    expect(publishedMembershipKitHref("https://example.com/wtia/welcome-kit")).toBeNull();
    expect(publishedMembershipKitHref("https://EXAMPLE.COM/wtia/association-kit")).toBeNull();
    expect(publishedMembershipKitHref("https://files.example.com/kit")).toBeNull();
    expect(publishedMembershipKitHref("http://drive.google.com/file/d/abc")).toBeNull();
    expect(publishedMembershipKitHref("not a url")).toBeNull();
    expect(publishedMembershipKitHref("https://drive.google.com/file/d/abc")).toBe("https://drive.google.com/file/d/abc");
    expect(publishedMembershipKitHref(" https://chat.whatsapp.com/invite ")).toBe("https://chat.whatsapp.com/invite");
  });

  it("omits placeholder kit rows and keeps a published https kit", () => {
    const hidden = deriveOnboardingChecklist({
      profileComplete: true,
      whatsappOptIn: false,
      kitLinks: {
        welcomeKit: "https://example.com/wtia/welcome-kit",
        associationKit: null,
        whatsappCommunity: "https://example.com/wtia/whatsapp",
      },
    });
    expect(hidden.map((item) => item.id)).toEqual(["profile", "whatsapp", "firstEvent"]);
    expect(hidden.some((item) => item.href.includes("example.com"))).toBe(false);

    const shown = deriveOnboardingChecklist({
      profileComplete: false,
      whatsappOptIn: true,
      planCode: "corporate",
      kitLinks: {
        welcomeKit: "https://drive.google.com/file/d/welcome",
        associationKit: "https://example.com/wtia/association-kit",
        whatsappCommunity: "https://chat.whatsapp.com/invite",
      },
    });
    expect(shown.map((item) => item.id)).toEqual(["profile", "welcomeKit", "whatsapp", "firstEvent", "registration"]);
    expect(shown.find((item) => item.id === "welcomeKit")).toMatchObject({
      done: false,
      href: "https://drive.google.com/file/d/welcome",
      external: true,
    });
    expect(shown.some((item) => item.id === "associationKit")).toBe(false);
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
