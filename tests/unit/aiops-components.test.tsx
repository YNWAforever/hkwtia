import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {AiOpsDashboard, type AiOpsDashboardLabels} from "@/components/marketing/aiops/dashboard";
import {AI_OPS_EXTERNAL_EVIDENCE} from "@/config/aiops-evidence";
import type {AiOpsMonthlyMetric} from "@/lib/aiops/contracts";
import type {AiOpsDashboardState} from "@/lib/aiops/dashboard";

const labels: AiOpsDashboardLabels = {
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
};

function monthStartAt(index: number) {
  return new Date(Date.UTC(2025, 7 + index, 1)).toISOString().slice(0, 10);
}

function metric(index: number): AiOpsMonthlyMetric {
  const monthStart = monthStartAt(index);
  return {
    monthStart,
    isPartialMonth: monthStart === "2026-07-01",
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
    refreshedAt: new Date("2026-07-30T10:00:00.000Z"),
  };
}

const months = Array.from({length: 12}, (_, index) => metric(index));
const freshState: AiOpsDashboardState = {
  status: "fresh",
  current: months[11],
  months,
  ageMs: 60 * 60 * 1000,
};
const buildLogs = [
  {
    slug: "m4-ai-ops-dashboard",
    titleEn: "How we built the AI-Ops dashboard",
    titleZh: "我們如何建立 AI 營運儀表板",
    publishedAt: new Date("2026-07-29T04:00:00.000Z"),
    author: "HKWTIA Engineering",
  },
  {
    slug: "m4-agent-safety",
    titleEn: "How we gated agent actions",
    titleZh: "我們如何限制代理操作",
    publishedAt: new Date("2026-07-28T04:00:00.000Z"),
    author: "HKWTIA Engineering",
  },
] as const;

function dashboard(state: AiOpsDashboardState = freshState) {
  return (
    <AiOpsDashboard
      locale="en"
      state={state}
      buildLogs={buildLogs}
      evidence={AI_OPS_EXTERNAL_EVIDENCE}
      labels={labels}
    />
  );
}

describe("public AI-Ops dashboard components", () => {
  it("renders the fresh KPI fixture with exact precision and denominator notes", () => {
    render(dashboard());

    expect(screen.getByRole("heading", {name: labels.title})).toBeInTheDocument();
    expect(screen.getByText(labels.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(labels.description)).toBeInTheDocument();
    expect(screen.getByText(labels.partialMonth)).toBeInTheDocument();
    expect(screen.getByText(labels.lastUpdated, {exact: false})).toBeInTheDocument();
    expect(screen.getByText(labels.resolutionTarget)).toBeInTheDocument();
    expect(screen.getByText(labels.csatTarget)).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", {name: "Agent resolved"}).parentElement!).getByText("80.0%")).toBeInTheDocument();
    expect(screen.getByText("12 / 15")).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    expect(screen.getByText("0.0%")).toBeInTheDocument();
    expect(screen.getByText("800 ms")).toBeInTheDocument();
    expect(screen.getByText("15 samples")).toBeInTheDocument();
    expect(screen.getByText("4.50 / 5")).toBeInTheDocument();
    expect(screen.getByText("10 responses")).toBeInTheDocument();
    expect(screen.getByText("1.20 hours")).toBeInTheDocument();
    expect(screen.getByText("US$0.068000")).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Escalation rate"})).toBeVisible();
    expect(screen.getByRole("heading", {name: "Failure rate"})).toBeVisible();
  });

  it("renders one accessible renewal SVG and the same twelve months in a semantic table", () => {
    render(dashboard());

    const chart = screen.getByRole("img", {name: labels.renewalChartTitle});
    expect(chart.querySelectorAll("title")).toHaveLength(1);
    expect(chart.querySelector("title")).toHaveTextContent(labels.renewalChartTitle);
    expect(chart.querySelector("desc")).toHaveTextContent(labels.renewalChartDescription);
    expect(screen.getByText(labels.overallRenewal)).toBeInTheDocument();
    expect(screen.getByText(labels.firstYearRenewal)).toBeInTheDocument();
    expect(screen.getByText(labels.overallTarget)).toBeInTheDocument();
    expect(screen.getByText(labels.firstYearTarget)).toBeInTheDocument();

    const table = screen.getByRole("table", {name: labels.renewalHeading});
    const scrollRegion = table.parentElement;
    expect(scrollRegion).toHaveAttribute("role", "region");
    expect(scrollRegion).toHaveAttribute("aria-label", labels.renewalHeading);
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(within(table).getAllByText("90.0%")).toHaveLength(12);
    expect(within(table).getAllByText("80.0%")).toHaveLength(12);
    expect(within(table).getByRole("columnheader", {name: "Overall renewal Paid"})).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", {name: "First-year renewal Due"})).toBeInTheDocument();
    expect(chart.querySelectorAll("circle")).toHaveLength(12);
    expect(chart.querySelectorAll("rect")).toHaveLength(12);
    expect(chart.querySelectorAll("line")).toHaveLength(2);
  });

  it("renders missing rates as localized unavailable values without fabricating zero", () => {
    const current = {
      ...months[11],
      agentResolvedRate: null,
      escalationRate: null,
      failureRate: null,
      medianFirstResponseMs: null,
      csatAverage: null,
    };
    render(dashboard({...freshState, current, months: [...months.slice(0, -1), current]}));

    expect(screen.getAllByText(labels.notEnoughData).length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("shows both architecture flows, explicit gates, and validated evidence links", () => {
    render(dashboard());

    expect(screen.getByText("Web / WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Concierge runtime")).toBeInTheDocument();
    expect(screen.getByText("guarded tools")).toBeInTheDocument();
    expect(screen.getAllByText("Neon Postgres")).toHaveLength(2);
    expect(screen.getByText("Cloudflare Worker")).toBeInTheDocument();
    expect(screen.getByText("authenticated job routes")).toBeInTheDocument();
    expect(screen.getByText("scheduled agents / AI-Ops refresh")).toBeInTheDocument();
    expect(screen.getByText(labels.approvalGate)).toBeInTheDocument();
    expect(screen.getByText(labels.publicationGate)).toBeInTheDocument();
    const flows = screen.getAllByRole("list").slice(0, 2).map((flow) => within(flow).getAllByRole("listitem").map((item) => item.textContent?.replace("→", "").trim()));
    expect(flows).toEqual([["Web / WhatsApp", "Concierge runtime", "guarded tools", "Neon Postgres"], ["Cloudflare Worker", "authenticated job routes", "scheduled agents / AI-Ops refresh", "Neon Postgres"]]);

    expect(screen.getByRole("link", {name: buildLogs[0].titleEn})).toHaveAttribute(
      "href",
      "/news/m4-ai-ops-dashboard",
    );
    expect(screen.getByRole("link", {name: buildLogs[1].titleEn})).toHaveAttribute(
      "href",
      "/news/m4-agent-safety",
    );
    const externalLinks = screen.getAllByRole("link").filter((link) =>
      link.getAttribute("href")?.startsWith("https://"));
    expect(externalLinks).toHaveLength(4);
    for (const link of externalLinks) {
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });
});
