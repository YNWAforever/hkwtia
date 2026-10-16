import "server-only";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {
  approvedFactsHash,
  claimsForGroundedTemplate,
  validateGroundedContent,
  renderGroundedBody,
} from "@/lib/ai/drafts/validation";
import type { ApprovedFactPack } from "@/lib/ai/drafts/contracts";
import type { RetentionCandidate } from "./candidates";
import { draftFactLabels } from "@/lib/ai/drafts/fact-labels";
import type { RetentionDraft } from "./contracts";
export const RETENTION_GROUNDED_PROMPT_VERSION = "retention-grounded-v2";
export function retentionApprovedFacts(
  candidate: RetentionCandidate,
  asOf: Date,
): ApprovedFactPack {
  const sourceId = "db:renewal:" + candidate.membershipId;
  const labels = (candidate.locale === "en" ? en : zh).Admin.approvals;
  const values: ApprovedFactPack["values"] = {
    planCode: {
      value: candidate.planCode,
      sourceId,
      label: labels.plan,
      format: "text",
    },
  };
  if (candidate.renewalDate)
    values.renewalDate = {
      value: candidate.renewalDate,
      sourceId,
      label: labels.periodEnd,
      format: "date",
    };
  const pack: ApprovedFactPack = {
    caseId: candidate.profileId,
    locale: candidate.locale,
    asOf: asOf.toISOString(),
    versionHash: "0".repeat(64),
    values,
    recordSources: {
      [sourceId]:
        "factsHash" in candidate ? String(candidate.factsHash) : "0".repeat(64),
    },
    sourceRefs: [],
    sourceUrls: {},
    displayLabels: draftFactLabels(candidate.locale).displayLabels,
    comparisonAvailable: null,
  };
  return { ...pack, versionHash: approvedFactsHash(pack) };
}
export function buildGroundedRetentionPrompt(
  candidate: RetentionCandidate,
): string {
  return [
    "Create a human-reviewed membership outreach draft in " +
      candidate.locale +
      ". Return strict JSON with subject,body,reasonCodes.",
    "Draft only. Do not approve, activate, promise refunds, discounts, fees, eligibility or sending. Do not infer amounts or personal details.",
    "All factual fields must appear as standalone whole blocks {{facts.planCode}} and, only when available, {{facts.renewalDate}}. Never insert raw numeric facts, relabel a block, or invent links. Use ordinary general prose elsewhere.",
    JSON.stringify({
      locale: candidate.locale,
      reasonCodes: candidate.riskCodes,
      availableFields: [
        "planCode",
        ...(candidate.renewalDate ? ["renewalDate"] : []),
      ],
    }),
  ].join("\n");
}
export function validateRetentionDraft(
  draft: RetentionDraft,
  candidate: RetentionCandidate,
  asOf: Date,
): RetentionDraft {
  const facts = retentionApprovedFacts(candidate, asOf),
    body = draft.subject + "\n" + draft.body;
  const validation = validateGroundedContent(
    { body, claims: claimsForGroundedTemplate(body, facts), sourceRefs: [] },
    facts,
  );
  if (!validation.valid) throw Error("RETENTION_DRAFT_UNGROUNDED");
  if (draft.reasonCodes.some((code) => !candidate.riskCodes.includes(code)))
    throw Error("RETENTION_RISK_NOT_APPROVED");
  return {
    ...draft,
    subject: renderGroundedBody(draft.subject, facts),
    body: renderGroundedBody(draft.body, facts),
    reasonCodes: [...candidate.riskCodes],
  };
}
