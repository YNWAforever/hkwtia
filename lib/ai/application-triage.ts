import "server-only";
import {
  profileSchema,
  companySchema,
  type ProfileInput,
  type CompanyInput,
} from "@/lib/membership/join-schema";
import { getPlan } from "@/lib/membership/plans";
export type ApplicationTriageInput = Readonly<{
  planCode: string;
  status: string;
  profile: Partial<ProfileInput>;
  company: Partial<CompanyInput> | null;
  membership: Readonly<{
    status: string;
    stripeSubscriptionId: string | null;
  }> | null;
  payment: Readonly<{ state: string }> | null;
}>;
export type ApplicationTriage = Readonly<{
  missingFields: readonly ("displayName" | "companyName")[];
  validationIssues: readonly string[];
  nextActionCode:
    | "none"
    | "contact_applicant"
    | "await_documents"
    | "review_ready"
    | "await_payment"
    | "support_reconciliation";
  paymentDisposition:
    "none" | "processing_or_unconfirmed" | "reconciliation_required";
}>;
/** Uses the current onboarding schemas and plan target rules. It proposes follow-up only, without activating, charging or sending. */
export function deriveApplicationTriage(
  input: ApplicationTriageInput,
): ApplicationTriage {
  const plan = getPlan(input.planCode),
    missingFields: ("displayName" | "companyName")[] = [],
    validationIssues: string[] = [];
  const absent = (value: unknown) =>
    typeof value !== "string" || value.trim().length === 0;
  const profile = profileSchema.safeParse(input.profile);
  if (!profile.success)
    for (const issue of profile.error.issues) {
      const field = String(issue.path[0]);
      if (field === "displayName" && absent(input.profile.displayName))
        missingFields.push("displayName");
      else validationIssues.push("profile." + field);
    }
  const companyRequired =
    plan.audience === "startup" || plan.audience === "corporate";
  if (companyRequired) {
    if (!input.company) missingFields.push("companyName");
    else {
      const company = companySchema.safeParse(input.company);
      if (!company.success)
        for (const issue of company.error.issues) {
          const field = String(issue.path[0]);
          if (
            (field === "legalName" || field === "displayName") &&
            absent(input.company[field])
          )
            missingFields.push("companyName");
          else validationIssues.push("company." + field);
        }
    }
  } else if (input.company) validationIssues.push("company.target");
  const requiredMissing = [...new Set(missingFields)],
    invalid = [...new Set(validationIssues)];
  let nextActionCode: ApplicationTriage["nextActionCode"] = "none",
    paymentDisposition: ApplicationTriage["paymentDisposition"] = "none";
  if (input.status !== "abandoned" && input.membership?.status !== "active") {
    if (
      input.membership?.status === "pending_payment" ||
      input.status === "pending_payment"
    ) {
      const reconcile =
        Boolean(input.membership?.stripeSubscriptionId) ||
        input.payment?.state === "completed";
      nextActionCode = reconcile ? "support_reconciliation" : "await_payment";
      paymentDisposition = reconcile
        ? "reconciliation_required"
        : "processing_or_unconfirmed";
    } else if (requiredMissing.length || invalid.length)
      nextActionCode = "await_documents";
    else if (
      input.membership?.status === "pending_review" ||
      input.status === "pending_review"
    )
      nextActionCode = "review_ready";
    else if (input.status === "draft") nextActionCode = "contact_applicant";
    else if (input.status === "completed" && !input.membership)
      nextActionCode = "support_reconciliation";
  }
  return {
    missingFields: requiredMissing,
    validationIssues: invalid,
    nextActionCode,
    paymentDisposition,
  };
}

/** Administrative drafting is a separate gated operation. Rules and manual follow-up do not depend on it. */
export async function prepareApplicationDraft(
  actor: import("@/lib/membership/lifecycle").AdminActor,
  applicationId: string,
): Promise<import("./drafts/contracts").AdminAiDraft> {
  const service = await import("./application-draft-service");
  return service.prepareApplicationDraft(actor, applicationId);
}
