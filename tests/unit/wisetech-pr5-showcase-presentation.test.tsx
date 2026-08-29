import {readFileSync} from "node:fs";

import {render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import ShowcasePage from "@/app/[locale]/(public)/showcase/page";
import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import type {PublicListing} from "@/lib/showcase/contracts";

const showcase = vi.hoisted(() => ({listPublished: vi.fn()}));

vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));

const listing: PublicListing = {
  slug: "harbour-vision-ai",
  premium: true,
  goneGlobal: false,
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
  caseStudySummary: null,
  logoReference: null,
  logo: null,
};

const detailLabels = {
  premium: "Premium",
  goneGlobal: "Gone Global",
  memberSince: "WTIA member since",
  overview: "Solution overview",
  capabilities: "Capabilities",
  useCases: "Use cases",
  deployment: "Deployment",
  languages: "Languages",
  worksWith: "Works with",
  caseStudy: "Case study",
  video: "Product video",
  requestIntro: "Request an introduction",
} as const;

async function renderIndex(locale: "en" | "zh-HK"): Promise<string> {
  return renderToStaticMarkup(await ShowcasePage({
    params: Promise.resolve({locale}),
    searchParams: Promise.resolve({}),
  }));
}

describe("WiseTech PR5 Showcase presentation", () => {
  beforeEach(() => {
    showcase.listPublished.mockReset();
    showcase.listPublished.mockResolvedValue([]);
  });

  it("adds localized explanatory copy in both supported locales", () => {
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")).Showcase;
    const zh = JSON.parse(readFileSync("messages/zh-HK.json", "utf8")).Showcase;

    expect(en).toMatchObject({
      introTitle: "Technology solutions for practical business needs",
      introDescription: "Compare published WTIA member solutions by use case, deployment, language, and integration fit.",
      ownerCta: "Manage your showcase listing",
      resultsTitle: "Explore member solutions",
      resultsDescription: "Use the filters to narrow the directory to solutions that fit your needs.",
      details: {overview: "Solution overview", capabilities: "Capabilities"},
    });
    expect(zh).toMatchObject({
      introTitle: "面向實際業務需要的科技方案",
      introDescription: "按使用場景、部署方式、語言及整合需要，比較已發布的 WTIA 會員方案。",
      ownerCta: "管理你的展示頁",
      resultsTitle: "探索會員方案",
      resultsDescription: "使用篩選條件，找出切合你需要的方案。",
      details: {overview: "方案概覽", capabilities: "方案能力"},
    });
  });

  it("links the authorized owner directly to the existing localized portal listing", async () => {
    const en = await renderIndex("en");
    const zh = await renderIndex("zh-HK");

    expect(en).toContain('href="/portal/company/listing"');
    expect(zh).toContain('href="/zh/portal/company/listing"');
    expect(en).not.toContain('href="/portal/showcase"');
    expect(zh).not.toContain('href="/zh/portal/showcase"');
  });

  it("uses localized explanatory headings on the existing public detail projection", () => {
    render(<ShowcaseDetail listing={listing} locale="en" labels={detailLabels}/>);

    expect(screen.getByRole("heading", {name: detailLabels.overview})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: detailLabels.capabilities})).toBeInTheDocument();
    expect(screen.getByText(listing.description)).toBeInTheDocument();
  });

  it("keeps public projection, beacon, structured data, and existing intro owner", () => {
    const source = readFileSync("app/[locale]/(public)/showcase/[slug]/page.tsx", "utf8");

    expect(source).toContain("showcaseRepository.getPublishedBySlug");
    expect(source).toContain("toPublicListing");
    expect(source).toContain("ShowcaseViewBeacon");
    expect(source).toContain("softwareApplicationJsonLd");
    expect(source).toContain("requestIntroAction");
    expect(source).toContain("<StructuredData");
    expect(source).not.toContain("prisma");
  });
});
