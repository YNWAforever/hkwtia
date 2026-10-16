import "server-only";
import { createHash } from "node:crypto";
import {
  boardFactPackSchema,
  bilingualBoardNarrativeSchema,
  type BoardFactPack,
  type BoardNarrative,
} from "./contracts";
import { boardReportLabels } from "./render";
import {
  approvedFactsHash,
  claimsForGroundedTemplate,
  validateGroundedContent,
  renderGroundedBody,
} from "@/lib/ai/drafts/validation";
import type { ApprovedFactPack } from "@/lib/ai/drafts/contracts";
export function boardApprovedFacts(
  input: BoardFactPack,
  locale: "en" | "zh-HK",
  asOf: Date,
): ApprovedFactPack {
  const pack = boardFactPackSchema.parse(input),
    labels = boardReportLabels(locale),
    sourceId = `db:board:${pack.reportMonth}`;
  const recordHash = createHash("sha256")
    .update(JSON.stringify(pack))
    .digest("hex");
  const values: ApprovedFactPack["values"] = {};
  for (const metric of pack.metrics) {
    const field = metric.id.replace(/_([a-z])/g, (_part, letter: string) =>
      letter.toUpperCase(),
    );
    values[field] = {
      sourceId,
      label: labels.metrics[metric.id],
      value:
        metric.unit === "percent" && metric.value !== null
          ? metric.value / 100
          : metric.value,
      format:
        metric.value === null
          ? "text"
          : metric.unit === "HKD"
            ? "money"
            : metric.unit === "percent"
              ? "percent"
              : "count",
      ...(metric.unit === "HKD" ? { currency: "HKD" as const } : {}),
    };
  }
  const facts: ApprovedFactPack = {
    caseId: `board:${pack.reportMonth}`,
    locale,
    versionHash: "0".repeat(64),
    asOf: asOf.toISOString(),
    values,
    sourceRefs: [],
    recordSources: { [sourceId]: recordHash },
    sourceUrls: {},
    comparisonAvailable: false,
    displayLabels: {
      yes: labels.yes,
      no: labels.no,
      notAvailable: labels.unavailable,
    },
  };
  return { ...facts, versionHash: approvedFactsHash(facts) };
}
/** The model cannot override the metric table or hide unsupported claims in narrative fields. */
export function validateBoardNarratives(
  input: unknown,
  pack: BoardFactPack,
  asOf: Date,
) {
  const output = bilingualBoardNarrativeSchema.parse(input);
  const validate = (narrative: BoardNarrative, locale: "en" | "zh-HK") => {
    const facts = boardApprovedFacts(pack, locale, asOf);
    const body = [
      narrative.executiveSummary,
      ...narrative.highlights,
      ...narrative.risks,
      ...narrative.recommendedActions,
    ].join("\n");
    const raw = body.replace(/\{\{facts\.[a-z][a-zA-Z0-9_.-]*\}\}/g, "");
    const result = validateGroundedContent(
      {
        body,
        claims: claimsForGroundedTemplate(body, facts),
        sourceRefs: facts.sourceRefs,
      },
      facts,
    );
    if (
      !result.valid ||
      /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million)\b|\b(?:stable|steady|higher|lower|previous|prior|improved|worse)\b|同比|環比|較上|保持穩定|有所改善|獲獎|獲得獎|award|entitlement|benefit|權益/iu.test(
        raw,
      )
    )
      throw Error("BOARD_NARRATIVE_FACTS_INVALID");
    const render = (text: string) => renderGroundedBody(text, facts);
    return {
      ...narrative,
      executiveSummary: render(narrative.executiveSummary),
      highlights: narrative.highlights.map(render),
      risks: narrative.risks.map(render),
      recommendedActions: narrative.recommendedActions.map(render),
    };
  };
  return {
    en: validate(output.en, "en"),
    zhHK: validate(output.zhHK, "zh-HK"),
  };
}
export function groundedBoardPrompt(pack: BoardFactPack, asOf: Date) {
  const en = boardApprovedFacts(pack, "en", asOf),
    zh = boardApprovedFacts(pack, "zh-HK", asOf);
  return JSON.stringify({
    reportMonth: pack.reportMonth,
    instructions:
      "Return en and zhHK with executiveSummary, highlights, risks and recommendedActions each. Chinese summary must be Chinese. Use only whole {{facts.FIELD}} blocks on their own lines for facts. No raw numbers, comparisons, eligibility, awards or promises. Describe manual review actions only. No HTML, MDX or links.",
    locales: {
      en: Object.fromEntries(
        Object.entries(en.values).map(([field, v]) => [
          field,
          { label: v.label, token: `{{facts.${field}}}` },
        ]),
      ),
      "zh-HK": Object.fromEntries(
        Object.entries(zh.values).map(([field, v]) => [
          field,
          { label: v.label, token: `{{facts.${field}}}` },
        ]),
      ),
    },
  });
}
