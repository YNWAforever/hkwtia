import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import {toPublicListing, type PublicListing} from "@/lib/showcase/contracts";

const cardLabels = {
  premium: "Premium", goneGlobal: "Gone Global", memberSince: "Member since", view: "View listing",
} as const;
const detailLabels = {
  ...cardLabels,
  useCases: "Use cases", deployment: "Deployment", languages: "Languages",
  worksWith: "Works with", caseStudy: "Case study", video: "Video",
  requestIntro: "Request an introduction",
} as const;

const row = {
  slug: "harbour-vision-ai",
  status: "published" as const,
  premium: false,
  goneGlobal: false,
  views: 0,
  memberSince: "2020-01-01",
  nameEn: "Harbour Vision AI",
  nameZhHk: "港灣視野 AI",
  taglineEn: "Trade intelligence",
  taglineZhHk: "貿易智能",
  descriptionEn: "Description",
  descriptionZhHk: "描述",
  category: "software",
  useCases: ["logistics"],
  deploymentOptions: ["cloud"],
  supportedLanguages: ["en"],
  worksWith: ["ERP"],
  videoUrl: null,
  caseStudyUrl: null,
  caseStudySummaryEn: null,
  caseStudySummaryZhHk: null,
  logoReference: "https://cdn.example.com/member-hosted.svg",
  logoMediaUrl: "/images/showcase/harbour-vision-ai.png",
  logoMediaAltEn: "Harbour Vision AI logo",
  logoMediaAltZh: "港灣視野 AI 標誌",
};

describe("showcase logo resolution", () => {
  it("resolves the registry entry with locale-correct alt text", () => {
    expect(toPublicListing(row, "en").logo)
      .toEqual({url: "/images/showcase/harbour-vision-ai.png", alt: "Harbour Vision AI logo"});
    expect(toPublicListing(row, "zh-HK").logo)
      .toEqual({url: "/images/showcase/harbour-vision-ai.png", alt: "港灣視野 AI 標誌"});
  });

  it("resolves to null when no registry entry is attached", () => {
    expect(toPublicListing({...row, logoMediaUrl: null}, "en").logo).toBeNull();
    // A listing read without the registry join at all, as an older test double
    // or a non-joining query would produce.
    const withoutJoin = Object.fromEntries(
      Object.entries(row).filter(([key]) => !key.startsWith("logoMedia")),
    ) as typeof row;
    expect(toPublicListing(withoutJoin, "en").logo).toBeNull();
  });

  it("never derives the rendered logo from the member-supplied reference", () => {
    // logoReference is a remote https URL here and is still carried for the
    // JSON-LD sink, but it must never become the thing the browser loads.
    const listing = toPublicListing({...row, logoMediaUrl: null}, "en");

    expect(listing.logoReference).toBe("https://cdn.example.com/member-hosted.svg");
    expect(listing.logo).toBeNull();
  });
});

describe("showcase logo rendering", () => {
  const withLogo = toPublicListing(row, "en");
  const withoutLogo: PublicListing = {...withLogo, logo: null};

  it("renders an own-origin image on the card", () => {
    render(<ShowcaseCard listing={withLogo} locale="en" labels={cardLabels}/>);

    const image = screen.getByAltText("Harbour Vision AI logo");
    expect(image).toBeInTheDocument();
    expect(image.getAttribute("src")).toContain("harbour-vision-ai.png");
    expect(image.getAttribute("src")).not.toContain("cdn.example.com");
  });

  it("renders an own-origin image on the detail page", () => {
    render(<ShowcaseDetail listing={withLogo} locale="en" labels={detailLabels}/>);

    expect(screen.getByAltText("Harbour Vision AI logo")).toBeInTheDocument();
  });

  it.each([
    ["card", () => render(<ShowcaseCard listing={withoutLogo} locale="en" labels={cardLabels}/>)],
    ["detail", () => render(<ShowcaseDetail listing={withoutLogo} locale="en" labels={detailLabels}/>)],
  ])("renders no image at all on the %s when none is attached", (_case, mount) => {
    const {container} = mount();

    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
