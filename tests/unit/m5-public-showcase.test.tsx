import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseFilters} from "@/components/marketing/showcase-filters";
import {buildShowcaseQuery, softwareApplicationJsonLd} from "@/lib/showcase/public";
import type {PublicListing} from "@/lib/showcase/contracts";

const listing: PublicListing = {
  slug: "harbour-vision-ai", premium: true, views: 42, memberSince: "2020-01-01", name: "Harbour Vision AI", tagline: "Trade intelligence", description: "Public description", category: "software", useCases: ["logistics"], deploymentOptions: ["cloud"], supportedLanguages: ["en", "zh-HK"], worksWith: ["ERP"], videoUrl: null, caseStudyUrl: null, caseStudySummary: "Case study", logoReference: null,
};

describe("public Showcase", () => {
  it("builds stable shareable filter query parameters", () => {
    expect(buildShowcaseQuery({category: "software", useCase: "logistics", deployment: "cloud", language: "zh-HK", worksWith: "ERP", q: "trade"}).toString()).toBe("category=software&useCase=logistics&deployment=cloud&language=zh-HK&worksWith=ERP&q=trade");
  });

  it("emits a public SoftwareApplication JSON-LD projection", () => {
    expect(softwareApplicationJsonLd(listing, "en")).toMatchObject({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Harbour Vision AI",
      applicationCategory: "software",
      operatingSystem: "cloud",
    });
    expect(softwareApplicationJsonLd(listing, "en")).not.toHaveProperty("email");
    expect(softwareApplicationJsonLd(listing, "en")).not.toHaveProperty("id");
  });

  it("renders buyer-facing card and URL-driven filters", () => {
    render(<><ShowcaseFilters filters={{category: "software"}} labels={{search: "Search", category: "Category", useCase: "Use case", deployment: "Deployment", language: "Language", worksWith: "Works with", submit: "Filter", clear: "Clear"}}/><ShowcaseCard listing={listing} locale="en" labels={{premium: "Premium", memberSince: "WTIA member since", view: "View listing"}}/></>);
    expect(screen.getByRole("link", {name: /View listing/i})).toHaveAttribute("href", "/showcase/harbour-vision-ai");
    expect(screen.getByLabelText("Category")).toHaveValue("software");
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });
});
