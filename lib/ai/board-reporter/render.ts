import {z} from "zod";

import {
  boardFactPackSchema,
  boardNarrativeSchema,
  type BoardMetric,
  type BoardMetricId,
} from "@/lib/ai/board-reporter/contracts";

const appLinkSchema = z.object({
  label: z.string().min(1).max(200),
  href: z.string().regex(/^\/(?!\/)[A-Za-z0-9/_?=&.%#~-]*$/),
}).strict();

const renderInputSchema = z.object({
  factPack: boardFactPackSchema,
  narrative: boardNarrativeSchema,
  agentRunId: z.string().uuid(),
  links: z.array(appLinkSchema).max(20).optional(),
}).strict();

export type BoardReportLink = z.infer<typeof appLinkSchema>;

const METRIC_LABELS: Readonly<Record<BoardMetricId, string>> = Object.freeze({
  arr_hkd: "ARR",
  mrr_hkd: "MRR",
  renewal_rate: "Renewal rate",
  first_year_renewal_rate: "First-year renewal rate",
  funnel_started: "Funnel: started",
  funnel_profile_completed: "Funnel: profile completed",
  funnel_checkout_or_review: "Funnel: checkout or review",
  funnel_activated: "Funnel: activated",
  attendance_rate: "Attendance rate",
  at_risk_count: "At-risk members",
});

function escapeMarkdownText(value: string, allowEmphasis = true): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const htmlEscaped = normalized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const unsupported = allowEmphasis
    ? /([\\`[\]{}()#!|_~>])/g
    : /([\\`[\]{}()#!|_~>*])/g;
  return htmlEscaped.replace(unsupported, "\\$1");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-HK", {
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

function formatMetric(metric: BoardMetric): string {
  if (metric.unit === "HKD") {
    return `HKD ${formatNumber(metric.value)}`;
  }
  if (metric.unit === "count") {
    return formatNumber(metric.value);
  }
  const percentage = metric.value === null
    ? "N/A"
    : `${formatNumber(metric.value)}%`;
  return `${percentage} (${metric.numerator}/${metric.denominator})`;
}

function metricTable(metrics: readonly BoardMetric[]): string[] {
  return [
    "| KPI | Value |",
    "| --- | ---: |",
    ...metrics.map((metric) => (
      `| ${METRIC_LABELS[metric.id]} | ${formatMetric(metric)} |`
    )),
  ];
}

function bulletSection(title: string, values: readonly string[]): string[] {
  return [
    `## ${title}`,
    "",
    ...(values.length === 0
      ? ["None provided."]
      : values.map((value) => `- ${escapeMarkdownText(value)}`)),
  ];
}

export function renderBoardReportMdx(input: Readonly<{
  factPack: unknown;
  narrative: unknown;
  agentRunId: string;
  links?: readonly BoardReportLink[];
}>): string {
  const parsed = renderInputSchema.parse(input);
  const {factPack, narrative} = parsed;
  const sections = [
    `# Board report: ${factPack.reportMonth}`,
    "",
    `Reporting window: **${factPack.window.from} to ${factPack.window.to}** (${factPack.window.timezone})`,
    "",
    `Agent run: **${parsed.agentRunId}**`,
    "",
    "## Key performance indicators",
    "",
    ...metricTable(factPack.metrics),
    "",
    "## Executive summary",
    "",
    escapeMarkdownText(narrative.executiveSummary),
    "",
    ...bulletSection("Highlights", narrative.highlights),
    "",
    ...bulletSection("Risks", narrative.risks),
    "",
    ...bulletSection("Recommended actions", narrative.recommendedActions),
  ];

  if (parsed.links && parsed.links.length > 0) {
    sections.push(
      "",
      "## App links",
      "",
      ...parsed.links.map((link) => (
        `- [${escapeMarkdownText(link.label, false)}](${link.href})`
      )),
    );
  }

  return `${sections.join("\n").trim()}\n`;
}
