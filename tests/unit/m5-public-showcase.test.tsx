import {readFileSync} from "node:fs";

import {render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseFilters} from "@/components/marketing/showcase-filters";
import {StructuredData} from "@/components/seo/structured-data";
import {buildShowcaseQuery, softwareApplicationJsonLd} from "@/lib/showcase/public";
import {listingInputSchema, type PublicListing} from "@/lib/showcase/contracts";

const listing: PublicListing = {
  slug: "harbour-vision-ai", premium: true, goneGlobal: false, views: 42, memberSince: "2020-01-01", name: "Harbour Vision AI", tagline: "Trade intelligence", description: "Public description", category: "software", useCases: ["logistics"], deploymentOptions: ["cloud"], supportedLanguages: ["en", "zh-HK"], worksWith: ["ERP"], videoUrl: null, caseStudyUrl: null, caseStudySummary: "Case study", logoReference: null, logo: null,
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

  it("escapes markup so a listing cannot break out of the JSON-LD script tag", () => {
    const hostile: PublicListing = {
      ...listing,
      description: '</script><img src=x onerror="alert(1)">',
    };

    const html = renderToStaticMarkup(
      <StructuredData data={softwareApplicationJsonLd(hostile, "en")}/>,
    );

    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("</script><img");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("renders the detail page JSON-LD through the escaping component", () => {
    const source = readFileSync("app/[locale]/(public)/showcase/[slug]/page.tsx", "utf8");

    expect(source).toContain("<StructuredData");
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("rejects logo references that resolve to a non-HTTPS scheme or another host", () => {
    const input = {
      slug: "harbour-vision-ai", nameEn: "Harbour Vision AI", nameZhHk: "港灣視野 AI",
      taglineEn: "Trade intelligence", taglineZhHk: "貿易智能",
      descriptionEn: "Description", descriptionZhHk: "描述",
      category: "software", useCases: ["logistics"], deploymentOptions: ["cloud"],
      supportedLanguages: ["en"], worksWith: ["ERP"],
    };

    expect(listingInputSchema.parse({...input, logoReference: "/images/showcase/logo.svg"}).logoReference)
      .toBe("/images/showcase/logo.svg");
    expect(listingInputSchema.parse({...input, logoReference: "https://cdn.example.com/logo.svg"}).logoReference)
      .toBe("https://cdn.example.com/logo.svg");
    expect(listingInputSchema.parse({...input, logoReference: null}).logoReference).toBeNull();

    for (const logoReference of [
      "javascript:alert(1)",
      "//evil.example.com/logo.svg",
      "http://cdn.example.com/logo.svg",
      "data:image/svg+xml;base64,AAAA",
      // A naive `/` prefix check reads each of these as site-relative, but the
      // WHATWG parser maps `\` to `/` and strips tab, LF and CR from anywhere
      // in the input, so `absoluteUrl` resolves all of them to a foreign host.
      // zod's `.trim()` does not help: the character is interior, not at an end.
      "/\\evil.example.com/logo.svg",
      `/${String.fromCharCode(9)}/evil.example.com/logo.svg`,
      `/${String.fromCharCode(10)}/evil.example.com/logo.svg`,
      `/${String.fromCharCode(13)}/evil.example.com/logo.svg`,
      // Reads as our own domain in an audit log, resolves somewhere else.
      "https://hkwtia.org@evil.example.com/logo.svg",
    ]) {
      expect(listingInputSchema.safeParse({...input, logoReference}).success, logoReference)
        .toBe(false);
    }
  });

  it("renders buyer-facing card and URL-driven filters", () => {
    render(<><ShowcaseFilters filters={{category: "software"}} labels={{search: "Search", category: "Category", useCase: "Use case", deployment: "Deployment", language: "Language", worksWith: "Works with", submit: "Filter", clear: "Clear"}}/><ShowcaseCard listing={listing} locale="en" labels={{premium: "Premium", goneGlobal: "Gone Global", memberSince: "WTIA member since", view: "View listing"}}/></>);
    expect(screen.getByRole("link", {name: /View listing/i})).toHaveAttribute("href", "/showcase/harbour-vision-ai");
    expect(screen.getByLabelText("Category")).toHaveValue("software");
    expect(screen.getByText("Premium")).toBeInTheDocument();
  });
});
