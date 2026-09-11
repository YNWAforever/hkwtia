import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";

/**
 * Programme C-5. One pure fold from the facts to the word a human reads in the
 * campaign preview. It is dependency-free on purpose — no database, no
 * `server-only` — so the wizard, the repository snapshot and the send queue can
 * all reach the same verdict without any of them owning a second definition of
 * "may we send to this person".
 *
 * A campaign is always a marketing send, so there is no `purpose` parameter and
 * no `opted_out` category. `lib/db/repos/message-eligibility.ts` keeps the two
 * apart because it answers for BOTH purposes: `opted_out` blocks a service
 * reply and a marketing suppression does not. Here they fold into one
 * `suppressed`, and the two spellings describe the same population:
 *
 * | `RecipientFacts`                     | `whatsAppEligibility(purpose:"service")` | `whatsAppEligibility(purpose:"marketing")` | `classifyRecipient(…, "whatsapp")` |
 * |--------------------------------------|------------------------------------------|--------------------------------------------|------------------------------------|
 * | contact `whatsappOptedOutAt` set     | `blocked/opted_out`                      | `blocked/opted_out`                        | `suppressed`                       |
 * | `whatsappSuppressed`                 | *eligible*                               | `blocked/suppressed`                       | `suppressed`                       |
 * | member `whatsappOptIn === false`     | `blocked/opted_out`                      | `blocked/opted_out`                        | `not_opted_in`                     |
 * | contact `whatsappOptIn === false`    | *eligible*                               | `blocked/not_opted_in`                     | `not_opted_in`                     |
 *
 * Read the marketing column and this one together: the same PARTITION under
 * different names. `tests/unit/campaign-eligibility.test.ts` asserts that
 * equality over the consent facts, because the failure it prevents is subtle
 * and infuriating — the same person reading OPTED_OUT in the inbox and
 * `suppressed` in the campaign preview, with staff unable to tell whether those
 * are one problem or two.
 *
 * Partition, not vocabulary: row 3 is the one place the two words genuinely
 * disagree. `decideWhatsApp`'s rule 1 answers a member with `whatsappOptIn ===
 * false` as `opted_out` — conservatively, because `profiles.whatsapp_opt_in`
 * defaults to false and it cannot tell "never opted in" from "withdrew"; that
 * module's own precedence table names the cost and points at
 * `whatsappOptedOutAt` as the evidence a future split would use. The preview
 * has no `opted_out` category at all and says `not_opted_in`. Both are blocked,
 * which is the property the test pins; do not "fix" one side into the other
 * without reading rule 1, and do not read this table as saying the words match.
 */
export type CampaignChannel = "email" | "whatsapp";

export type EligibilityCategory =
  | "eligible"
  | "no_email"
  | "no_number"
  | "not_opted_in"
  | "suppressed"
  | "plan_ineligible";

export const ELIGIBILITY_CATEGORIES: readonly EligibilityCategory[] = [
  "eligible",
  "no_email",
  "no_number",
  "not_opted_in",
  "suppressed",
  "plan_ineligible",
];

/**
 * Every code `campaigns.ts`'s `reportReasonFor` can key the delivery report's
 * `byReason` on — snapshot-time AND send-time — in one list, because the
 * report's label map is built from it and `campaign-report.tsx` falls back to
 * rendering an unlabelled key verbatim.
 *
 * It exists because that map was hand-listed from `ELIGIBILITY_CATEGORIES` and
 * drifted twice. `marketing_suppressed` was the first gap; Task 10 opened two
 * more the same day it landed, `template_not_approved` and `unknown_recipient`,
 * and the second gap is the worse one: a template revoked in
 * `whatsapp_templates` after approval — or a registry read that throws, which
 * `approvedTemplateKeys` answers fail-closed with an empty set — blocks EVERY
 * recipient of the tick, so a zh-HK admin read `template_not_approved  20` in
 * English on the one row that explains why the blast did not go out.
 *
 * `eligible` is not here: `reportReasonFor` returns it for nobody, because a
 * recipient who was eligible is counted as sent, queued or failed instead.
 */
export type CampaignReportReason =
  | Exclude<EligibilityCategory, "eligible">
  | "missing_variable"
  | "marketing_suppressed"
  | "template_not_approved"
  | "unknown_recipient";

export const CAMPAIGN_REPORT_REASONS: readonly CampaignReportReason[] = [
  "no_email",
  "no_number",
  "not_opted_in",
  "suppressed",
  "plan_ineligible",
  "missing_variable",
  "marketing_suppressed",
  "template_not_approved",
  "unknown_recipient",
];

/**
 * `plan_ineligible` is narrower than the spec's label suggests, and the
 * narrowness is deliberate: it means a MEMBER whose membership is not currently
 * in force. There is no plan-TIER gate anywhere in this classifier — a campaign
 * addresses tiers by choosing a segment, not by being filtered afterwards — so
 * do not go looking for one.
 *
 * `past_due` is in the eligible set because a member in dunning is exactly who
 * a dunning campaign is for; excluding them would make the one campaign that
 * has to reach them unable to.
 */
export const PLAN_ELIGIBLE_MEMBERSHIP_STATUSES: readonly string[] = [
  "active",
  "past_due",
  "cancel_at_period_end",
];

/** The pattern `contacts.phone_e164` is written through and the adapter expects. */
const E164 = /^\+\d{8,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The closed token set the wizard offers beside each template variable field. */
export const VARIABLE_TOKENS = ["displayName", "firstName", "renewalDate", "planCode", "email"] as const;
export type VariableToken = (typeof VARIABLE_TOKENS)[number];

export function campaignEmailFor(facts: RecipientFacts): string | null {
  const normalized = facts.email?.trim() ?? "";
  return EMAIL.test(normalized) ? normalized : null;
}

export function campaignNumberFor(facts: RecipientFacts): string | null {
  const normalized = facts.whatsappNumber?.trim() ?? "";
  return E164.test(normalized) ? normalized : null;
}

function planIneligible(facts: RecipientFacts): boolean {
  // A contact never reaches this branch, even one linked to a lapsed member: a
  // prospect has no membership to be ineligible under, and blocking them on the
  // linked profile's status would silently remove the whole prospect audience
  // from a campaign that never asked about membership.
  if (facts.kind !== "member") return false;
  return facts.membershipStatus === null
    || !PLAN_ELIGIBLE_MEMBERSHIP_STATUSES.includes(facts.membershipStatus);
}

export function classifyRecipient(facts: RecipientFacts, channel: CampaignChannel): EligibilityCategory {
  if (channel === "whatsapp") {
    // An explicit STOP and a marketing suppression both land here. Reading only
    // `whatsappOptIn` is the resurrection bug: `optOutWhatsApp` clears the flag
    // and writes the suppression, and any later re-consent turns the flag back
    // on while the suppression stands.
    if (facts.whatsappOptedOutAt !== null || facts.whatsappSuppressed) return "suppressed";
    if (!facts.whatsappOptIn) return "not_opted_in";
    if (campaignNumberFor(facts) === null) return "no_number";
    return planIneligible(facts) ? "plan_ineligible" : "eligible";
  }
  if (facts.emailSuppressed) return "suppressed";
  // `marketingConsent` is `false` for every contact by construction (the facts
  // loader says so), so no prospect is ever an eligible email recipient today.
  // That is what keeps the /admin/segments email shortcut from mailing the
  // contact half of an `audience: "both"` segment now that the audience query
  // projects it.
  if (!facts.marketingConsent) return "not_opted_in";
  if (campaignEmailFor(facts) === null) return "no_email";
  return planIneligible(facts) ? "plan_ineligible" : "eligible";
}

export type ResolvedVariables =
  | Readonly<{ok: true; variables: Record<string, string>}>
  | Readonly<{ok: false; missing: readonly string[]}>;

function tokenValue(token: string, facts: RecipientFacts): string | null {
  switch (token) {
    case "displayName": return facts.displayName;
    case "firstName": return facts.displayName.trim().split(/\s+/)[0] ?? "";
    case "renewalDate": return facts.renewalAt?.toISOString().slice(0, 10) ?? "";
    case "planCode": return facts.planCode ?? "";
    case "email": return facts.email ?? "";
    default: return null;
  }
}

/**
 * Resolve one recipient's template body, once, at snapshot time.
 *
 * Why this is a gate and not a formatting helper: `lib/channels/woztell.ts`
 * builds the body as `template.variables.map((key) => input.variables[key] ?? "")`,
 * and Meta rejects a template whose BODY parameter is empty. The adapter maps
 * that 4xx to `provider_client_error`, and S-15 makes it terminal — so a
 * campaign whose preview said `eligible` would produce one permanent failure
 * and one staff task per recipient. A variable that will not resolve therefore
 * blocks the recipient BEFORE the blast, as `missing_variable`.
 *
 * Every value is either a literal or exactly one token. A literal that merely
 * CONTAINS `{{…}}` is refused rather than sent verbatim: the alternative is a
 * member receiving "Dear {{displayName}}," from a staff typo, which no test
 * after the send can undo.
 */
export function resolveRecipientVariables(
  template: Readonly<{variables: readonly string[]}>,
  variablesTemplate: Readonly<Record<string, string>>,
  facts: RecipientFacts,
): ResolvedVariables {
  const variables: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of template.variables) {
    const raw = variablesTemplate[key];
    const resolved = raw === undefined ? "" : resolveOne(raw, facts);
    if (resolved === null || resolved.trim() === "") {
      missing.push(key);
      continue;
    }
    variables[key] = resolved;
  }
  return missing.length ? {ok: false, missing} : {ok: true, variables};
}

function resolveOne(raw: string, facts: RecipientFacts): string | null {
  const token = /^\{\{(\w+)\}\}$/.exec(raw.trim());
  if (token) return tokenValue(token[1], facts);
  return raw.includes("{{") || raw.includes("}}") ? null : raw;
}
