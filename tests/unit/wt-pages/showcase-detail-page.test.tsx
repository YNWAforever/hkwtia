import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import {RequestIntroForm} from "@/components/marketing/request-intro-form";
import type {PublicListing} from "@/lib/showcase/contracts";

const listing: PublicListing = {
  slug: "harbour-vision-ai", premium: true, goneGlobal: true, views: 42, memberSince: "2020-01-01",
  name: "Harbour Vision AI", tagline: "Trade intelligence", description: "Public description", category: "software",
  useCases: ["logistics"], deploymentOptions: ["cloud"], supportedLanguages: ["en", "zh-HK"], worksWith: ["ERP"],
  videoUrl: null, caseStudyUrl: null, caseStudySummary: null, logoReference: null, logo: null,
};

const labels = {
  premium: "Premium", goneGlobal: "Gone Global", memberSince: "WTIA member since", overview: "Solution overview",
  capabilities: "Capabilities", useCases: "Use cases", deployment: "Deployment", languages: "Languages",
  worksWith: "Works with", caseStudy: "Case study", video: "Product video", requestIntro: "Request an introduction",
} as const;

describe("/showcase/[slug] restyle", () => {
  it("wraps the detail body in the donor's main/aside layout", () => {
    render(<ShowcaseDetail labels={labels} listing={listing} locale="en" />);

    expect(document.querySelector(".detail-page")).not.toBeNull();
    expect(document.querySelector(".detail-page .detail-main")).not.toBeNull();
    expect(document.querySelector(".detail-page .detail-aside")).not.toBeNull();
  });

  it("keeps the pinned headings, badge text and description intact", () => {
    render(<ShowcaseDetail labels={labels} listing={listing} locale="en" />);

    expect(screen.getByRole("heading", {name: labels.overview})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: labels.capabilities})).toBeInTheDocument();
    expect(screen.getByText(listing.description)).toBeInTheDocument();
    expect(screen.getAllByText("Premium").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".partner-status")).toHaveLength(2);
  });

  it("renders the four capability facts in the real .practical-grid", () => {
    render(<ShowcaseDetail labels={labels} listing={listing} locale="en" />);

    const grid = document.querySelector(".practical-grid");
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll("dt")).toHaveLength(4);
  });

  it("makes the member-since, description and case-study paragraphs real .detail-main direct children", () => {
    // app/styles/wisetech.css:278 defines `.detail-main>p:not(.lead){...}` -- a direct-child
    // combinator. If these paragraphs are nested inside <header>/<section> wrappers instead of
    // being real children of .detail-main, that donor rule silently never matches and they fall
    // back to unstyled browser defaults.
    const caseStudyListing: PublicListing = {
      ...listing,
      caseStudySummary: "How Harbour Vision AI cut clearance time in half",
      caseStudyUrl: "https://example.com/case-study",
    };
    render(<ShowcaseDetail labels={labels} listing={caseStudyListing} locale="en" />);

    const detailMain = document.querySelector(".detail-main");
    expect(detailMain).not.toBeNull();

    const directChildParagraphs = Array.from(detailMain?.children ?? []).filter((el) => el.tagName === "P");
    const directChildTexts = directChildParagraphs.map((el) => el.textContent);

    expect(directChildTexts).toContain(`${labels.memberSince} ${listing.memberSince}`);
    expect(directChildTexts).toContain(listing.description);
    expect(directChildTexts).toContain(caseStudyListing.caseStudySummary);
  });

  it("styles the request-intro form fields with the real donor form classes", () => {
    render(<RequestIntroForm action={async () => ({ok: true as const})} labels={{
      name: "Name", email: "Email", organization: "Organisation", message: "Message", website: "Website",
      submit: "Submit", submitting: "Sending", success: "Done", invalid: "Invalid", rateLimited: "Later",
    }} locale="en" slug="harbour-vision-ai" />);

    expect(document.querySelector(".partner-form")).not.toBeNull();
    expect(document.querySelector(".partner-form .form-grid")).not.toBeNull();
    expect(document.querySelector(".partner-form button[type=submit]")).toHaveClass("button");
  });
});
