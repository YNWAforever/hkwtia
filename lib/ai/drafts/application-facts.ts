import "server-only";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import { draftFactLabels } from "./fact-labels";
import { approvedFactsHash } from "./validation";
import type { ApprovedFactPack } from "./contracts";
import type { ApplicationTriageSnapshot } from "@/lib/admin/application-triage-types";
/** Form decisions and lifecycle states are authoritative application facts; applicant content and contact information are never included. */
export function applicationDraftFacts(
  snapshot: ApplicationTriageSnapshot,
  asOf: Date,
): ApprovedFactPack {
  const bundle = snapshot.locale === "zh-HK" ? zh : en,
    t = bundle.ApplicationTriage,
    admin = bundle.Admin,
    labels = draftFactLabels(snapshot.locale),
    sourceId = "db:application:" + snapshot.applicationId;
  const state = (value: string | null) =>
    value && value in admin.members.statusCodes
      ? admin.members.statusCodes[
          value as keyof typeof admin.members.statusCodes
        ]
      : labels.displayLabels.notAvailable;
  const appState =
    snapshot.states.application === "draft"
      ? admin.applicationQueue.draft
      : snapshot.states.application === "completed"
        ? admin.applicationCase.applicationCompleted
        : snapshot.states.application === "abandoned"
          ? admin.applicationCase.applicationAbandoned
          : state(snapshot.states.application);
  const fact = (
    value: string | boolean,
    label: string,
    format: "text" | "boolean" = "text",
  ) => ({ value, label, format, sourceId });
  const pack: ApprovedFactPack = {
    caseId: snapshot.applicationId,
    locale: snapshot.locale,
    versionHash: "0".repeat(64),
    asOf: asOf.toISOString(),
    values: {
      applicationState: fact(appState, t.applicationLabel),
      membershipState: fact(
        state(snapshot.states.membership),
        t.membershipLabel,
      ),
      requiredFollowUp: fact(
        snapshot.triage.missingFields.length
          ? snapshot.triage.missingFields
              .map((field) => admin.applicationCase.missingFields[field])
              .join("、")
          : t.noneMissing,
        t.missingLabel,
      ),
      nextAction: fact(
        admin.applicationCase.nextActions[snapshot.triage.nextActionCode],
        t.nextLabel,
      ),
      paymentFollowUp: fact(
        snapshot.triage.paymentDisposition === "reconciliation_required"
          ? t.paymentReconcile
          : snapshot.triage.paymentDisposition === "processing_or_unconfirmed"
            ? t.paymentProcessing
            : t.paymentNone,
        t.paymentLabel,
      ),
      validationNeeded: fact(
        snapshot.triage.validationIssues.length > 0,
        t.validationLabel,
        "boolean",
      ),
    },
    sourceRefs: [],
    recordSources: { [sourceId]: snapshot.factsHash },
    sourceUrls: {},
    comparisonAvailable: null,
    displayLabels: labels.displayLabels,
  };
  return { ...pack, versionHash: approvedFactsHash(pack) };
}
