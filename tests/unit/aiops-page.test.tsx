import {readFileSync} from "node:fs";
import {render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {AiOpsMonthlyMetric} from "@/lib/aiops/contracts";

const repositories = vi.hoisted(() => ({
  readLatestTwelveMonths: vi.fn(),
  listPublishedBuildLogs: vi.fn(),
}));

const translated = vi.hoisted(() => ({
  metaTitle: "AI-Ops in public | WTIA",
  metaDescription: "Live, privacy-safe metrics showing how WTIA's AI agents perform, escalate and cost.",
  eyebrow: "AI-Ops in public",
  title: "Operational AI, measured in public",
  description: "Hourly, privacy-safe evidence from WTIA's Concierge and scheduled agents.",
  currentMonth: "Current Hong Kong month",
  partialMonth: "Month to date",
  lastUpdated: "Last updated",
  fresh: "Metrics refreshed on schedule",
  stale: "Metrics may be delayed",
  empty: "No metrics are available for this month yet",
  unavailable: "Metrics are temporarily unavailable",
  notEnoughData: "Not enough data",
  conversations: "Conversations",
  resolved: "Agent resolved",
  firstResponse: "Median first response",
  csat: "CSAT",
  escalation: "Escalation rate",
  failure: "Failure rate",
  hoursSaved: "Estimated staff hours saved",
  llmCost: "Monthly LLM cost",
  responses: "responses",
  samples: "samples",
  hours: "hours",
  resolutionTarget: "Target: 70% or higher",
  csatTarget: "Target: 4.5 / 5 or higher",
  renewalHeading: "Twelve-month renewal trend",
  overallRenewal: "Overall renewal",
  firstYearRenewal: "First-year renewal",
  overallTarget: "Overall target: 88%",
  firstYearTarget: "First-year target: 82%",
  renewalChartTitle: "Monthly renewal rates",
  renewalChartDescription: "Overall and first-year renewal rates for the latest twelve Hong Kong months.",
  month: "Month",
  paid: "Paid",
  due: "Due",
  rate: "Rate",
  methodologyHeading: "How these metrics are calculated",
  methodologyDescription: "Aggregates refresh hourly. Estimated time saved equals agent-resolved conversations multiplied by six minutes. No member-level data is published.",
  architectureHeading: "How WTIA AI-Ops works",
  architectureDescription: "Web and WhatsApp requests pass through the Concierge runtime and guarded tools. Scheduled jobs use authenticated routes. Generated actions remain behind approval or publication gates.",
  approvalGate: "Human approval gate",
  publicationGate: "Publication gate",
  evidenceHeading: "Build evidence",
  buildLogs: "Published build logs",
  source: "Source repository",
  commits: "Commit and build history",
  deployment: "Live deployment",
  acceptance: "M4 acceptance evidence",
  noBuildLogs: "No published build logs are available.",
}));

vi.mock("@/lib/db/repos/aiops-public", () => ({
  aiOpsPublicRepository: {
    readLatestTwelveMonths: repositories.readLatestTwelveMonths,
  },
}));
vi.mock("@/lib/db/repos/public-posts", () => ({
  publicPostsRepository: {
    listPublishedBuildLogs: repositories.listPublishedBuildLogs,
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: keyof typeof translated) => translated[key]),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({}));
vi.mock("next/link", () => ({
  default: ({children, href, ...props}: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href} {...props}>{children}</a>,
}));

import AiOpsPage, {
  generateMetadata,
  revalidate,
} from "@/app/[locale]/(public)/ai-ops/page";

const CANARY = "M4C_PRIVATE_CANARY_private@example.test";

function monthStartAt(index: number) {
  return new Date(Date.UTC(2025, 7 + index, 1)).toISOString().slice(0, 10);
}

function rows(): AiOpsMonthlyMetric[] {
  return Array.from({length: 12}, (_, index) => ({
    monthStart: monthStartAt(index),
    isPartialMonth: index === 11,
    conversationCount: 15,
    terminalConversationCount: 15,
    resolvedConversationCount: 12,
    escalatedConversationCount: 3,
    failedConversationCount: 0,
    agentResolvedRate: 0.8,
    escalationRate: 0.2,
    failureRate: 0,
    medianFirstResponseMs: 800,
    firstResponseSampleCount: 15,
    csatAverage: 4.5,
    csatResponseCount: 10,
    staffHoursSaved: 1.2,
    llmCostUsd: 0.068,
    renewalDueCount: 10,
    renewalPaidCount: 9,
    renewalRate: 0.9,
    firstYearRenewalDueCount: 5,
    firstYearRenewalPaidCount: 4,
    firstYearRenewalRate: 0.8,
    refreshedAt: new Date(),
  }));
}

describe("AI-Ops public page boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.readLatestTwelveMonths.mockResolvedValue(rows());
    repositories.listPublishedBuildLogs.mockResolvedValue([]);
  });

  it("is a revalidated server route without client fetching or polling", () => {
    const source = readFileSync(
      "app/[locale]/(public)/ai-ops/page.tsx",
      "utf8",
    );

    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("'use client'");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/setInterval|interval|polling/i);
    expect(revalidate).toBe(300);
  });

  it("reads twelve rows and renders the complete server dashboard", async () => {
    render(await AiOpsPage({params: Promise.resolve({locale: "en"})}));

    expect(repositories.readLatestTwelveMonths).toHaveBeenCalledOnce();
    expect(repositories.listPublishedBuildLogs).toHaveBeenCalledOnce();
    expect(screen.getByRole("table", {name: translated.renewalHeading}))
      .toHaveTextContent("2025");
    expect(screen.getAllByRole("row")).toHaveLength(13);
  });

  it("parallelizes the independent repository reads", async () => {
    let releaseMetrics!: (value: AiOpsMonthlyMetric[]) => void;
    let releaseBuildLogs!: (value: []) => void;
    repositories.readLatestTwelveMonths.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseMetrics = resolve;
      }),
    );
    repositories.listPublishedBuildLogs.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseBuildLogs = resolve;
      }),
    );

    const page = AiOpsPage({params: Promise.resolve({locale: "en"})});
    await vi.waitFor(() => {
      expect(repositories.readLatestTwelveMonths).toHaveBeenCalledOnce();
      expect(repositories.listPublishedBuildLogs).toHaveBeenCalledOnce();
    });
    releaseMetrics(rows());
    releaseBuildLogs([]);
    await page;
  });

  it("renders a safe unavailable state when the aggregate reader throws", async () => {
    repositories.readLatestTwelveMonths.mockRejectedValueOnce(new Error(CANARY));

    const page = await AiOpsPage({params: Promise.resolve({locale: "en"})});
    const html = renderToStaticMarkup(page);

    expect(html).toContain(translated.unavailable);
    expect(html).not.toContain(CANARY);
    expect(JSON.stringify(page)).not.toContain(CANARY);
  });

  it("uses the exact new localized metadata and message bundles", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({locale: "en"}),
    });
    const english = JSON.parse(readFileSync("messages/en.json", "utf8")).AiOps;
    const chinese = JSON.parse(readFileSync("messages/zh-HK.json", "utf8")).AiOps;

    expect(metadata.title).toBe(translated.metaTitle);
    expect(metadata.description).toBe(translated.metaDescription);
    expect(english).toMatchObject({
      metaTitle: translated.metaTitle,
      metaDescription: translated.metaDescription,
      title: translated.title,
    });
    expect(chinese).toMatchObject({
      metaTitle: "公開 AI-Ops｜WTIA",
      title: "公開量度 AI 營運",
      unavailable: "指標暫時無法提供",
    });
  });

  it("does not serialize the privacy canary from public inputs", async () => {
    repositories.listPublishedBuildLogs.mockResolvedValueOnce([{
      slug: "m4c-private-canary-private-example-test",
      titleEn: CANARY,
      titleZh: CANARY,
      publishedAt: new Date(),
      author: CANARY,
    }]);

    const page = await AiOpsPage({params: Promise.resolve({locale: "en"})});
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain(CANARY);
    expect(JSON.stringify(page)).not.toContain(CANARY);
  });
});
