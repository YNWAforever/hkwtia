import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import AdminMediaPage from "@/app/[locale]/(admin)/admin/media/page";
import {ShowcaseReviewTable} from "@/components/admin/showcase-review-table";
import {MediaForm} from "@/components/admin/media-form";
import {HomeHighlightCard} from "@/components/marketing/home-highlight-card";
import {ShowcaseCard} from "@/components/marketing/showcase-card";
import {ShowcaseDetail} from "@/components/marketing/showcase-detail";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import type {PublicListing} from "@/lib/showcase/contracts";

const listForAdmin = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: vi.fn(async () => ({kind: "staff", userId: "staff", profileId: "staff"})),
}));
vi.mock("@/lib/db/repos/media", () => ({mediaRepository: {listForAdmin}}));
vi.mock("@/components/admin/media-upload-form", () => ({MediaUploadForm: () => <div data-testid="upload-media-form"/>}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

const secureUrl = "/api/media/22222222-2222-4222-8222-222222222222";
const staticUrl = "/images/showcase/static-logo.png";

function expectDirectSecureAndOptimizedStatic() {
  expect(screen.getByAltText("Secure logo")).toHaveAttribute("src", secureUrl);
  expect(screen.getByAltText("Static logo").getAttribute("src"))
    .toContain("/_next/image?url=%2Fimages%2Fshowcase%2Fstatic-logo.png");
}

function listing(url: string, name: string): PublicListing {
  return {
    slug: name.toLowerCase().replaceAll(" ", "-"), premium: false,
    goneGlobal: false, views: 0, memberSince: "2020-01-01", name, tagline: "Tagline",
    description: "Description", category: "software", useCases: ["logistics"],
    deploymentOptions: ["cloud"], supportedLanguages: ["en"], worksWith: ["ERP"],
    videoUrl: null, caseStudyUrl: null, caseStudySummary: null, logoReference: null,
    logo: {url, alt: `${name} logo`},
  };
}

const cardLabels = {
  premium: "Premium", goneGlobal: "Gone global", memberSince: "Member since", view: "View",
} as const;
const detailLabels = {
  ...cardLabels, useCases: "Use cases", deployment: "Deployment", languages: "Languages",
  worksWith: "Works with", caseStudy: "Case study", video: "Video", requestIntro: "Request intro",
} as const;

describe("revocation-aware secure media rendering", () => {
  it("recognizes only exact own-origin private media delivery URLs", () => {
    expect(isPrivateMediaDeliveryUrl(secureUrl)).toBe(true);
    for (const value of [
      "/api/media/not-a-uuid",
      "/api/media/22222222-2222-4222-8222-222222222222?version=1",
      "/api/mediax/22222222-2222-4222-8222-222222222222",
      "https://www.hkwtia.org/api/media/22222222-2222-4222-8222-222222222222",
      staticUrl,
    ]) expect(isPrivateMediaDeliveryUrl(value)).toBe(false);
  });

  it("bypasses the optimizer only for secure admin media-form previews", () => {
    const labels = {
      url: "URL", urlHelp: "Help", altEn: "English alt", altZh: "Chinese alt",
      altHelp: "Alt help", preview: "Preview", save: "Save", saving: "Saving",
    } as const;
    const action = async () => ({});
    render(<><MediaForm action={action} labels={labels} preview={{url: secureUrl, alt: "Secure logo"}}/>
      <MediaForm action={action} labels={labels} preview={{url: staticUrl, alt: "Static logo"}}/></>);
    expectDirectSecureAndOptimizedStatic();
  });

  it("bypasses the optimizer only for secure rows on the admin media page", async () => {
    listForAdmin.mockResolvedValueOnce([
      {id: "1", url: secureUrl, altEn: "Secure logo", altZh: "安全標誌", archivedAt: null},
      {id: "2", url: staticUrl, altEn: "Static logo", altZh: "靜態標誌", archivedAt: null},
    ]);
    render(await AdminMediaPage({params: Promise.resolve({locale: "en"})}));
    expectDirectSecureAndOptimizedStatic();
  });

  it("bypasses the optimizer only for secure rows in the admin showcase table", () => {
    const base = {
      id: "listing-1", companyId: "company", slug: "secure", status: "published" as const,
      premium: false, goneGlobal: false, views: 0, memberSince: "2020-01-01",
      nameEn: "Secure", nameZhHk: "安全", taglineEn: "Tagline", taglineZhHk: "標語",
      descriptionEn: "Description", descriptionZhHk: "描述", category: "software",
      useCases: [], deploymentOptions: [], supportedLanguages: [], worksWith: [], videoUrl: null,
      caseStudyUrl: null, caseStudySummaryEn: null, caseStudySummaryZhHk: null,
      logoReference: null, logoMediaId: "media", logoMediaAltZh: "標誌", reviewedAt: null,
      reviewedByProfileId: null, rejectionReason: null, createdAt: new Date(), updatedAt: new Date(),
    };
    render(<ShowcaseReviewTable
      labels={{caption: "Listings", company: "Company", slug: "Slug", logo: "Logo", logoNone: "None", saveLogo: "Save logo", status: "Status", premium: "Premium", publish: "Publish", reject: "Reject", rejectionReason: "Reason", savePremium: "Save premium"}}
      listings={[
        {...base, logoMediaUrl: secureUrl, logoMediaAltEn: "Secure logo"},
        {...base, id: "listing-2", slug: "static", logoMediaUrl: staticUrl, logoMediaAltEn: "Static logo"},
      ] as never}
      premiumAction={async () => undefined}
      publishAction={async () => undefined}
      rejectAction={async () => undefined}
    />);
    expectDirectSecureAndOptimizedStatic();
  });

  it("bypasses the optimizer only for secure showcase-card logos", () => {
    render(<><ShowcaseCard listing={listing(secureUrl, "Secure")} locale="en" labels={cardLabels}/>
      <ShowcaseCard listing={listing(staticUrl, "Static")} locale="en" labels={cardLabels}/></>);
    expectDirectSecureAndOptimizedStatic();
  });

  it("bypasses the optimizer only for secure showcase-detail logos", () => {
    render(<><ShowcaseDetail listing={listing(secureUrl, "Secure")} locale="en" labels={detailLabels}/>
      <ShowcaseDetail listing={listing(staticUrl, "Static")} locale="en" labels={detailLabels}/></>);
    expectDirectSecureAndOptimizedStatic();
  });

  it("bypasses the optimizer only for secure home-highlight logos", () => {
    const shared = {label: "Showcase", state: "available" as const, summary: "Summary", href: "/showcase", actionLabel: "View"};
    render(<><HomeHighlightCard {...shared} title="Secure" image={{src: secureUrl, alt: "Secure logo"}}/>
      <HomeHighlightCard {...shared} title="Static" image={{src: staticUrl, alt: "Static logo"}}/></>);
    expectDirectSecureAndOptimizedStatic();
  });
});
