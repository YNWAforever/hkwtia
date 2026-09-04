import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen} from "@testing-library/react";
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

const showcase = vi.hoisted(() => ({listPublished: vi.fn()}));

vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: showcase}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: vi.fn(async ({locale, namespace}: {locale: "en" | "zh-HK"; namespace: string}) =>
    (key: string) => String(messageAt(locale, namespace, key))),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import ShowcasePage from "@/app/[locale]/(public)/showcase/page";

async function renderShowcase(searchParams: Record<string, string> = {}) {
  const html = renderToStaticMarkup(await ShowcasePage({
    params: Promise.resolve({locale: "en"}),
    searchParams: Promise.resolve(searchParams),
  }));
  return html;
}

describe("/showcase rewrite", () => {
  beforeEachReset();
  function beforeEachReset() {
    beforeEach(() => { showcase.listPublished.mockReset(); });
  }

  it("renders the six directory-prompt search shortcuts, each its own GET form to /showcase with only q set", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="directory-prompts"');
    for (const query of ["AI concierge", "Cybersecurity", "Cross-border trade", "Cloud migration", "Generative AI", "Fintech"]) {
      expect(html).toContain(`<input type="hidden" name="q" value="${query}"/>`);
    }
    expect(html.match(/action="\/showcase"/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("gives the search input a real id so #q deep-links resolve (E-29)", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toMatch(/<label[^>]*for="q"[^>]*>/);
    expect(html).toContain('id="q"');
    expect(html).toContain('name="q"');
  });

  it("renders the twelve solution-needs chips, additive alongside the current q", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase({q: "trade"});

    expect(html).toContain('class="solution-needs"');
    expect(html).toContain('<input type="hidden" name="q" value="trade"/>');
    expect(html).toContain('name="useCase" value="cybersecurity"');
    // Scoped to the .solution-needs block: ShowcaseFilters' own (pre-existing, unrelated) useCase
    // facet field also matches `name="useCase"` and sits earlier in the page, so counting the
    // whole page would double-count it against the twelve solution-needs chips this test names.
    const solutionNeedsHtml = html.slice(html.indexOf('class="solution-needs"'));
    expect((solutionNeedsHtml.match(/name="useCase"/g) ?? []).length).toBe(12);
  });

  it("shows HonestEmpty, not a fabricated grid, at zero results", async () => {
    showcase.listPublished.mockResolvedValue([]);
    render(await ShowcasePage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));

    expect(await screen.findByRole("status")).toHaveTextContent(bundles.en.Showcase.emptyTitle);
    expect(screen.queryByText("partner-record-grid")).not.toBeInTheDocument();
  });

  it("renders published listings inside .partner-record-grid using the restyled ShowcaseCard", async () => {
    showcase.listPublished.mockResolvedValue([{
      slug: "harbour-vision-ai", premium: true, goneGlobal: false, views: 1, memberSince: "2020-01-01",
      nameEn: "Harbour Vision AI", nameZhHk: "港灣視野 AI", taglineEn: "Trade intelligence", taglineZhHk: "貿易智能",
      descriptionEn: "Public description", descriptionZhHk: "公開描述", category: "software", useCases: ["logistics"],
      deploymentOptions: ["cloud"], supportedLanguages: ["en"], worksWith: ["ERP"], videoUrl: null, caseStudyUrl: null,
      caseStudySummaryEn: null, caseStudySummaryZhHk: null, logoReference: null,
    }]);
    const html = await renderShowcase();

    expect(html).toContain('class="partner-record-grid"');
    expect(html).toContain('class="partner-record-card"');
    expect(html).toContain("Harbour Vision AI");
    expect(html).toContain(bundles.en.Showcase.premium);
  });

  it("renders the solution-verification badge-definitions block with the honest label", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="solution-verification"');
    expect(html).toContain(bundles.en.Showcase.verification.label);
    expect(html).toContain('class="badge-grid"');
    expect((html.match(/<article>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("renders the buyer/provider solution-pathways with the correct destinations", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="solution-pathways"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/portal/company/listing"');
    expect(html).toContain(bundles.en.Showcase.ownerCta);
  });

  it("renders the interest band pointing at /events", async () => {
    showcase.listPublished.mockResolvedValue([]);
    const html = await renderShowcase();

    expect(html).toContain('class="event-interest"');
    expect(html).toContain(`href="/events"`);
    expect(html).toContain(bundles.en.Showcase.interest.action);
  });

  it("keeps bilingual parity for every new Showcase key", () => {
    for (const key of [
      "prompts.aiConcierge", "prompts.cybersecurity", "prompts.crossBorderTrade", "prompts.cloudMigration",
      "prompts.generativeAi", "prompts.fintech", "needs.customerService", "needs.cybersecurity", "needs.tradeCompliance",
      "needs.supplyChain", "needs.fintechPayments", "needs.dataAnalytics", "needs.hrTalent", "needs.marketingAutomation",
      "needs.legalCompliance", "needs.smartManufacturing", "needs.sustainabilityEsg", "needs.crossBorderTrade",
      "verification.label", "verification.title", "verification.copy",
      "verification.badges.verifiedDeployment.title", "verification.badges.verifiedDeployment.copy",
      "verification.badges.reviewedEvidence.title", "verification.badges.reviewedEvidence.copy",
      "verification.badges.dataHandling.title", "verification.badges.dataHandling.copy",
      "pathways.heading", "pathways.buyer.label", "pathways.buyer.title", "pathways.buyer.copy", "pathways.buyer.action",
      "pathways.provider.label", "pathways.provider.title", "pathways.provider.copy",
      "interest.eyebrow", "interest.title", "interest.copy", "interest.action",
    ]) {
      expect(messageAt("en", "Showcase", key), key).toBeTruthy();
      expect(messageAt("zh-HK", "Showcase", key), key).toBeTruthy();
    }
    expect(bundles.en.Common.breadcrumbHome).toBe("Home");
    expect(bundles["zh-HK"].Common.breadcrumbHome).toBe("主頁");
  });
});
