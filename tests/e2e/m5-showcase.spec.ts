import {expect, test} from "@playwright/test";

import {buildShowcaseQuery, softwareApplicationJsonLd} from "@/lib/showcase/public";
import type {PublicListing} from "@/lib/showcase/contracts";

const listing = {
  slug: "harbour-vision-ai",
  premium: true,
  goneGlobal: false,
  views: 0,
  memberSince: "2026-01-01",
  name: "Harbour Vision AI",
  tagline: "Trade intelligence for Hong Kong teams",
  description: "A practical showcase fixture.",
  category: "software",
  useCases: ["logistics"],
  deploymentOptions: ["cloud"],
  supportedLanguages: ["en", "zh-HK"],
  worksWith: ["ERP"],
  videoUrl: null,
  caseStudyUrl: null,
  caseStudySummary: null,
  logoReference: null,
} satisfies PublicListing;

test.describe("M5 showcase deterministic acceptance contract", () => {
  test("preserves every public filter in a stable shareable query", async () => {
    const query = buildShowcaseQuery({category: "software", useCase: "logistics", deployment: "cloud", language: "zh-HK", worksWith: "ERP", q: "trade"});
    expect(query.toString()).toBe("category=software&useCase=logistics&deployment=cloud&language=zh-HK&worksWith=ERP&q=trade");
  });

  test("projects only public SoftwareApplication JSON-LD fields", async () => {
    const jsonLd = softwareApplicationJsonLd(listing, "en");
    expect(jsonLd).toMatchObject({"@context": "https://schema.org", "@type": "SoftwareApplication", name: listing.name, description: listing.description, applicationCategory: "software", operatingSystem: "cloud"});
    expect(jsonLd).not.toHaveProperty("email");
    expect(jsonLd).not.toHaveProperty("id");
  });

  test("live Preview browser scenarios are explicitly gated", async ({page}) => {
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
    const credentials = process.env.M5_ACCEPTANCE_EMAIL && process.env.M5_ACCEPTANCE_PASSWORD;
    test.skip(!credentials || !baseUrl || /production|hkwtia\.vercel\.app/i.test(baseUrl), "Live M5 scenarios require explicit isolated Preview credentials and a non-Production PLAYWRIGHT_BASE_URL.");
    await page.goto("/showcase?category=software&useCase=logistics&deployment=cloud&language=zh-HK&worksWith=ERP&q=trade");
    await expect(page).toHaveURL(/category=software/);
    await expect(page.getByRole("heading", {level: 1})).toBeVisible();
  });
});
