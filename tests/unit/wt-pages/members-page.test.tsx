import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const bundles = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")),
  "zh-HK": JSON.parse(readFileSync(resolve(process.cwd(), "messages/zh-HK.json"), "utf8")),
} as const;

function messageAt(locale: "en" | "zh-HK", namespace: string, key: string): unknown {
  const root = namespace.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], bundles[locale]);
  return key.split(".").reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], root);
}

const profiles = vi.hoisted(() => ({getPublishedBySlug: vi.fn(), listPublished: vi.fn()}));

vi.mock("@/lib/db/repos/company-profiles", () => ({companyProfilesRepository: profiles}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string, values?: Record<string, unknown>) => String(messageAt(locale, namespace, key))
      .replace(/\{(\w+)\}/g, (match, name: string) => String(values?.[name] ?? match))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("next/image", () => ({
  default: ({unoptimized, ...props}: {unoptimized?: boolean; [key: string]: unknown}) => <img {...props} data-unoptimized={String(unoptimized)}/>,
}));

import MemberDetailPage from "@/app/[locale]/(public)/members/[slug]/page";
import MembersPage from "@/app/[locale]/(public)/members/page";

const summary = {
  id: "3f1f0a1e-0000-4000-8000-000000000001",
  slug: "harbour-vision-ai",
  name: "Harbour Vision AI",
  tagline: {en: "Trade intelligence", zhHk: "貿易智能"},
  tags: ["ai", "logistics"],
  plan: "patron" as const,
  website: "https://harbourvision.example/",
  logoUrl: null,
};

const detail = {
  ...summary,
  description: {en: "Public description", zhHk: "公開描述"},
  industry: "software",
  sizeBand: "11-50",
  showcase: {slug: "harbour-vision", name: "Harbour Vision"},
  events: [{slug: "smart-port-2030", titleEn: "Smart port 2030", titleZh: "智慧港口 2030", startsAt: new Date("2030-03-01T02:00:00.000Z")}],
};

async function renderDirectory(searchParams: Record<string, string> = {}, locale: "en" | "zh-HK" = "en") {
  return renderToStaticMarkup(await MembersPage({
    params: Promise.resolve({locale}),
    searchParams: Promise.resolve(searchParams),
  }));
}

describe("/members directory (D-11)", () => {
  beforeEach(() => {
    profiles.listPublished.mockReset();
    profiles.getPublishedBySlug.mockReset();
  });

  it("renders a published profile per card inside the donor record grid", async () => {
    profiles.listPublished.mockResolvedValue([summary, {...summary, slug: "kowloon-cloud", name: "Kowloon Cloud", plan: "startup"}]);

    const html = await renderDirectory();

    expect(html).toContain('class="partner-record-grid"');
    expect((html.match(/class="partner-record-card"/g) ?? []).length).toBe(2);
    expect(html).toContain("Harbour Vision AI");
    expect(html).toContain('href="/members/harbour-vision-ai"');
    expect(html).toContain(bundles.en.Members.plans.patron);
    // The card labels its tags from the controlled vocabulary, never the raw slug.
    expect(html).toContain("Artificial intelligence");
  });

  it("passes the parsed filters to the repository and keeps them in the form", async () => {
    profiles.listPublished.mockResolvedValue([]);

    const html = await renderDirectory({q: "harbour", tag: "ai", plan: "nonsense"});

    expect(profiles.listPublished).toHaveBeenCalledWith({q: "harbour", tag: "ai", plan: null});
    expect(html).toContain('value="harbour"');
    expect(html).toContain('<option value="ai" selected="">');
  });

  it("shows the honest empty state, not a fabricated grid, at zero results", async () => {
    profiles.listPublished.mockResolvedValue([]);

    const html = await renderDirectory();

    expect(html).toContain(bundles.en.Members.emptyTitle);
    expect(html).not.toContain('class="partner-record-grid"');
  });

  it("degrades to the empty state when the database is unreachable", async () => {
    profiles.listPublished.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));

    await expect(renderDirectory()).resolves.toContain(bundles.en.Members.emptyTitle);
  });

  it("links the clear action and the cards through localizedPath in zh-HK", async () => {
    profiles.listPublished.mockResolvedValue([summary]);

    const html = await renderDirectory({}, "zh-HK");

    expect(html).toContain('href="/zh/members/harbour-vision-ai"');
    expect(html).toContain('href="/zh/members"');
    expect(html).not.toContain("/zh-HK/");
  });
});

describe("/members/[slug] (D-11)", () => {
  beforeEach(() => {
    profiles.listPublished.mockReset();
    profiles.getPublishedBySlug.mockReset();
  });

  it("renders both JSON-LD types over the reviewed profile", async () => {
    profiles.getPublishedBySlug.mockResolvedValue(detail);

    const html = renderToStaticMarkup(await MemberDetailPage({
      params: Promise.resolve({locale: "en", slug: "harbour-vision-ai"}),
    }));

    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"sameAs":["https://harbourvision.example/"]');
    expect(html).toContain("Public description");
    expect(html).toContain('href="/showcase/harbour-vision"');
    expect(html).toContain('href="/events/smart-port-2030"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("says so honestly when the member has no upcoming events", async () => {
    profiles.getPublishedBySlug.mockResolvedValue({...detail, events: []});

    const html = renderToStaticMarkup(await MemberDetailPage({
      params: Promise.resolve({locale: "en", slug: "harbour-vision-ai"}),
    }));

    expect(html).toContain(bundles.en.Members.detail.noEvents);
  });

  it("404s on an unknown, unpublished or malformed slug", async () => {
    profiles.getPublishedBySlug.mockResolvedValue(null);

    await expect(MemberDetailPage({params: Promise.resolve({locale: "en", slug: "nope"})}))
      .rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps the Members namespace in bilingual parity", () => {
    for (const key of [
      "metaTitle", "metaDescription", "eyebrow", "title", "description", "breadcrumbCurrent",
      "filters.search", "filters.tag", "filters.anyTag", "filters.plan", "filters.anyPlan",
      "filters.submit", "filters.clear", "plans.community", "plans.startup", "plans.corporate",
      "plans.patron", "resultsTitle", "emptyTitle", "emptyDescription", "view",
      "detail.website", "detail.showcase", "detail.events", "detail.noEvents", "detail.joinCta", "detail.join",
    ]) {
      expect(messageAt("en", "Members", key), key).toBeTruthy();
      expect(messageAt("zh-HK", "Members", key), key).toBeTruthy();
    }
  });
});
