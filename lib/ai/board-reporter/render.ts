import {z} from "zod";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
export function boardReportLabels(locale: "en" | "zh-HK") {return (locale === "zh-HK" ? zh : en).Admin.reports.generatedReport;}

import {
  boardFactPackSchema,
  boardNarrativeSchema,
  type BoardMetric,
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
  locale: z.enum(["en", "zh-HK"]).default("en"),
}).strict();

export type BoardReportLink = z.infer<typeof appLinkSchema>;

const MARKDOWN_CONTROL_CHARACTERS = "\\`*_[]{}()#!|~>+-=.";
const BALANCED_EMPHASIS = /(?<!\*)\*\*([^*]+)\*\*(?!\*)/g;

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLiteral(value: string): string {
  let escaped = "";
  for (const character of value) {
    if (character === "&") {
      escaped += "&amp;";
    } else if (character === "<") {
      escaped += "&lt;";
    } else if (character === ">") {
      escaped += "&gt;";
    } else if (MARKDOWN_CONTROL_CHARACTERS.includes(character)) {
      escaped += `\\${character}`;
    } else {
      escaped += character;
    }
  }
  return escaped;
}

function serializeNarrativeInline(value: string): string {
  const normalized = normalizedText(value);
  let serialized = "";
  let cursor = 0;

  for (const match of normalized.matchAll(BALANCED_EMPHASIS)) {
    const index = match.index;
    serialized += escapeMarkdownLiteral(normalized.slice(cursor, index));
    serialized += `**${escapeMarkdownLiteral(match[1])}**`;
    cursor = index + match[0].length;
  }

  return serialized + escapeMarkdownLiteral(normalized.slice(cursor));
}

function serializeLiteralInline(value: string): string {
  return escapeMarkdownLiteral(normalizedText(value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-HK", {
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

function formatMetric(metric: BoardMetric, unavailable: string): string {
  if (metric.unit === "HKD") {
    return `HKD ${formatNumber(metric.value)}`;
  }
  if (metric.unit === "count") {
    return formatNumber(metric.value);
  }
  const percentage = metric.value === null
    ? unavailable
    : `${formatNumber(metric.value)}%`;
  return `${percentage} (${metric.numerator}/${metric.denominator})`;
}

function metricTable(metrics: readonly BoardMetric[], labels: ReturnType<typeof boardReportLabels>): string[] {
  return [
    `| ${labels.kpi} | ${labels.value} |`,
    "| --- | ---: |",
    ...metrics.map((metric) => (
      `| ${labels.metrics[metric.id]} | ${formatMetric(metric, labels.unavailable)} |`
    )),
  ];
}

function bulletSection(title: string, values: readonly string[], empty: string): string[] {
  return [
    `## ${title}`,
    "",
    ...(values.length === 0
      ? [empty]
      : values.map((value) => `- ${serializeNarrativeInline(value)}`)),
  ];
}

export function renderBoardReportMdx(input: Readonly<{
  factPack: unknown;
  narrative: unknown;
  agentRunId: string;
  links?: readonly BoardReportLink[];
  locale?: "en" | "zh-HK";
}>): string {
  const parsed = renderInputSchema.parse(input);
  const {factPack, narrative} = parsed;
  const labels = boardReportLabels(parsed.locale);
  const sections = [
    `# ${labels.title}: ${factPack.reportMonth}`,
    "",
    `${labels.window}: **${factPack.window.from} ${labels.to} ${factPack.window.to}** (${factPack.window.timezone})`,
    "",
    `${labels.run}: **${parsed.agentRunId}**`,
    "",
    `## ${labels.kpis}`,
    "",
    ...metricTable(factPack.metrics, labels),
    "",
    `## ${labels.summary}`,
    "",
    `${labels.narrative}: ${serializeNarrativeInline(narrative.executiveSummary)}`,
    "",
    ...bulletSection(labels.highlights, narrative.highlights, labels.empty),
    "",
    ...bulletSection(labels.risks, narrative.risks, labels.empty),
    "",
    ...bulletSection(labels.actions, narrative.recommendedActions, labels.empty),
  ];

  if (parsed.links && parsed.links.length > 0) {
    sections.push(
      "",
      `## ${labels.links}`,
      "",
      ...parsed.links.map((link) => (
        `- [${serializeLiteralInline(link.label)}](${link.href})`
      )),
    );
  }

  return `${sections.join("\n").trim()}\n`;
}
