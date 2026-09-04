import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import {listingInputSchema, toPublicListing, type PublicListing} from "@/lib/showcase/contracts";

const englishLabels = {
  premium: "Premium",
  goneGlobal: "Gone Global",
  memberSince: "WTIA member since",
  view: "View listing",
};

const chineseLabels = {
  premium: "精選",
  goneGlobal: "走向全球",
  memberSince: "WTIA 會員始於",
  view: "查看展示頁",
};

const detailLabels = {
  useCases: "Use cases",
  deployment: "Deployment",
  languages: "Languages",
  worksWith: "Works with",
  caseStudy: "Case study",
  video: "Product video",
  requestIntro: "Request an introduction",
};

function listing(goneGlobal: boolean): PublicListing {
  return {
    slug: "harbour-vision-ai",
    premium: true,
    goneGlobal,
    views: 42,
    memberSince: "2020-01-01",
    name: "Harbour Vision AI",
    tagline: "Trade intelligence",
    description: "Public description",
    category: "software",
    useCases: ["logistics"],
    deploymentOptions: ["cloud"],
    supportedLanguages: ["en", "zh-HK"],
    worksWith: ["ERP"],
    videoUrl: null,
    caseStudyUrl: null,
    caseStudySummary: "Case study",
    logoReference: null, logo: null,
  };
}

function publicSource(goneGlobal: boolean) {
  return {
    slug: "harbour-vision-ai",
    status: "published" as const,
    premium: true,
    goneGlobal,
    views: 42,
    memberSince: "2020-01-01",
    nameEn: "Harbour Vision AI",
    nameZhHk: "港灣視野 AI",
    taglineEn: "Trade intelligence",
    taglineZhHk: "貿易智能",
    descriptionEn: "Public description",
    descriptionZhHk: "公開介紹",
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
  };
}

describe("M6 Gone Global public Showcase projection", () => {
  it.each([
    ["en", englishLabels, "Gone Global"],
    ["zh-HK", chineseLabels, "走向全球"],
  ] as const)("renders the localized graduate badge in both public components for %s", (locale, labels, badge) => {
    const {unmount} = render(<ShowcaseCard listing={listing(true)} locale={locale} labels={labels}/>);
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.getByText(labels.premium)).toBeInTheDocument();
    // The restyled ShowcaseCard (WP-4 Group B) renders member-since as a donor `<dl><dt>/<dd>`
    // pair rather than one text node, so the label and date are now separate elements.
    expect(screen.getByText(labels.memberSince)).toBeInTheDocument();
    expect(screen.getByText("2020-01-01")).toBeInTheDocument();
    unmount();

    render(<ShowcaseDetail listing={listing(true)} locale={locale} labels={{...labels, ...detailLabels}}/>);
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.getByText(labels.premium)).toBeInTheDocument();
    expect(screen.getByText(`${labels.memberSince} 2020-01-01`)).toBeInTheDocument();
  });

  it.each([
    ["en", englishLabels, "Gone Global"],
    ["zh-HK", chineseLabels, "走向全球"],
  ] as const)("does not render the %s badge for a published listing without the graduation projection", (locale, labels, badge) => {
    const {unmount} = render(<ShowcaseCard listing={listing(false)} locale={locale} labels={labels}/>);
    expect(screen.queryByText(badge)).not.toBeInTheDocument();
    unmount();

    render(<ShowcaseDetail listing={listing(false)} locale={locale} labels={{...labels, ...detailLabels}}/>);
    expect(screen.queryByText(badge)).not.toBeInTheDocument();
  });

  it("projects the server-owned boolean to public listings and strips it from member input", () => {
    expect(toPublicListing(publicSource(true), "en").goneGlobal).toBe(true);

    const parsed = listingInputSchema.parse({
      slug: "harbour-vision-ai",
      nameEn: "Harbour Vision AI",
      nameZhHk: "港灣視野 AI",
      taglineEn: "Trade intelligence",
      taglineZhHk: "貿易智能",
      descriptionEn: "Public description",
      descriptionZhHk: "公開介紹",
      category: "software",
      useCases: ["logistics"],
      deploymentOptions: ["cloud"],
      supportedLanguages: ["en"],
      worksWith: ["ERP"],
      goneGlobal: true,
    });
    expect(parsed).not.toHaveProperty("goneGlobal");
  });
});
