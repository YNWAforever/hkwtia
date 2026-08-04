import {describe, expect, it} from "vitest";

import {
  listingInputSchema,
  parseShowcaseFilters,
  toPublicListing,
  transitionListingStatus,
} from "@/lib/showcase/contracts";

describe("M5 Showcase contracts", () => {
  it("normalizes shareable filters and drops empty values", () => {
    expect(parseShowcaseFilters({
      category: "  logistics ",
      useCase: "",
      deployment: "cloud",
      language: " zh-HK ",
      worksWith: "  ",
      q: "  cross border  ",
    })).toEqual({
      category: "logistics",
      deployment: "cloud",
      language: "zh-HK",
      q: "cross border",
    });
  });

  it("rejects overlong listing content and non-HTTPS media", () => {
    expect(() => listingInputSchema.parse({
      slug: "valid-slug",
      nameEn: "Valid",
      nameZhHk: "有效",
      taglineEn: "tagline",
      taglineZhHk: "標語",
      descriptionEn: "description",
      descriptionZhHk: "描述",
      category: "software",
      useCases: ["logistics"],
      deploymentOptions: ["cloud"],
      supportedLanguages: ["en"],
      worksWith: ["ERP"],
      videoUrl: "http://unsafe.example/video",
      caseStudyUrl: null,
      caseStudySummaryEn: "",
      caseStudySummaryZhHk: "",
      logoReference: null,
    })).toThrow();
  });

  it("allows only the approved lifecycle transitions", () => {
    expect(transitionListingStatus("draft", "pending_review")).toBe(true);
    expect(transitionListingStatus("pending_review", "published")).toBe(true);
    expect(transitionListingStatus("pending_review", "rejected")).toBe(true);
    expect(transitionListingStatus("rejected", "pending_review")).toBe(true);
    expect(transitionListingStatus("published", "draft")).toBe(false);
  });

  it("builds a locale-specific public projection without private fields", () => {
    const publicListing = toPublicListing({
      id: "private-id",
      slug: "harbour-vision-ai",
      status: "published",
      premium: true,
      goneGlobal: false,
      views: 7,
      memberSince: "2020-01-01",
      nameEn: "Harbour Vision AI",
      nameZhHk: "港灣視野 AI",
      taglineEn: "Trade intelligence",
      taglineZhHk: "貿易智能",
      descriptionEn: "Public description",
      descriptionZhHk: "公開描述",
      category: "software",
      useCases: ["logistics"],
      deploymentOptions: ["cloud"],
      supportedLanguages: ["en", "zh-HK"],
      worksWith: ["ERP"],
      videoUrl: null,
      caseStudyUrl: null,
      caseStudySummaryEn: null,
      caseStudySummaryZhHk: null,
      logoReference: null,
      email: "private@example.test",
      reviewedByProfileId: "reviewer",
      rejectionReason: null,
    }, "en");

    expect(publicListing).toMatchObject({
      slug: "harbour-vision-ai",
      name: "Harbour Vision AI",
      premium: true,
      views: 7,
    });
    expect(publicListing).not.toHaveProperty("id");
    expect(publicListing).not.toHaveProperty("email");
    expect(publicListing).not.toHaveProperty("reviewedByProfileId");
    expect(publicListing).not.toHaveProperty("rejectionReason");
  });
});
