import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const showcase = vi.hoisted(() => ({listPublished: vi.fn(), getPublishedBySlug: vi.fn()}));

vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
// The detail page imports its "use server" lead action, which pulls the email transport and
// rate limiter in; none of that is under test here.
vi.mock("@/lib/showcase/lead-request-action", () => ({requestIntroAction: vi.fn()}));
// next-intl's server helpers refuse to run outside a request scope, so the
// page cannot be rendered at all without these. `getTranslations` echoes the
// key, which also keeps the assertions about the empty-state *branch* rather
// than about the English copy.
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key === "emptyTitle" ? "No showcase listings" : key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import ShowcasePage from "@/app/[locale]/(public)/showcase/page";
import {generateMetadata as detailMetadata} from "@/app/[locale]/(public)/showcase/[slug]/page";

/**
 * `/news` wraps its reads in `.catch(() => [])` so an unreachable database
 * degrades to the empty state rather than a 500. `/showcase` awaits
 * `listPublished` bare, so the same outage takes the page down — and it is a
 * redirect destination for eight migrated member stories, so a visitor
 * following a link from a 2017 interview would get an error page.
 */
async function render(): Promise<string> {
  return renderToStaticMarkup(await ShowcasePage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve({}),
  }));
}

describe("public Showcase degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state when the listing read fails", async () => {
    showcase.listPublished.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));

    const html = await render();

    expect(html).toContain("No showcase listings");
  });

  it("still renders listings when the read succeeds", async () => {
    showcase.listPublished.mockResolvedValue([]);

    await expect(render()).resolves.toContain("No showcase listings");
    expect(showcase.listPublished).toHaveBeenCalledOnce();
  });
});

describe("public Showcase detail metadata", () => {
  const row = {
    id: "private-id", slug: "harbour-vision-ai", status: "published", premium: true, goneGlobal: false, views: 7,
    memberSince: "2020-01-01", nameEn: "Harbour Vision AI", nameZhHk: "港灣視野 AI",
    taglineEn: "Trade intelligence", taglineZhHk: "貿易智能", descriptionEn: "Public description", descriptionZhHk: "公開描述",
    category: "software", useCases: ["logistics"], deploymentOptions: ["cloud"], supportedLanguages: ["en", "zh-HK"],
    worksWith: ["ERP"], videoUrl: null, caseStudyUrl: null, caseStudySummaryEn: null, caseStudySummaryZhHk: null,
    logoReference: null, logoMediaUrl: null, logoMediaAltEn: null, logoMediaAltZh: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // D-1: a listing's name is a record title, so the page brands it at runtime with the locale's
  // separator -- never the retired "<name> | WTIA Showcase" shape, and never a bare name.
  it.each([
    ["en", "Harbour Vision AI | WiseTech Hong Kong", "Public description"],
    ["zh-HK", "港灣視野 AI｜WiseTech Hong Kong", "公開描述"],
  ] as const)("brands the %s listing title and keeps the listing's own description", async (locale, title, description) => {
    showcase.getPublishedBySlug.mockResolvedValue(row);

    const metadata = await detailMetadata({params: Promise.resolve({locale, slug: row.slug})});

    expect(metadata.title).toBe(title);
    expect(metadata.description).toBe(description);
    expect(metadata.openGraph).toMatchObject({title, siteName: "WTIA"});
    expect(metadata.twitter).toMatchObject({title});
    expect(String(metadata.title)).not.toContain("WTIA Showcase");
  });

  // An unknown or unpublished slug 404s, but generateMetadata still runs: it reads the Showcase
  // bundle (already branded there) instead of the old hard-coded English pair for both locales.
  it("reads the fallback title and description from the Showcase bundle when the slug is unknown", async () => {
    showcase.getPublishedBySlug.mockRejectedValue(new Error("TRANSIENT_DATABASE_READ"));

    const metadata = await detailMetadata({params: Promise.resolve({locale: "zh-HK", slug: "missing"})});

    expect(metadata.title).toBe("metaTitle");
    expect(metadata.description).toBe("detailFallbackDescription");
    expect(metadata.alternates?.canonical).toContain("/zh/showcase/missing");
  });
});
