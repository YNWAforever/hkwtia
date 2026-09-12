import {describe, expect, it} from "vitest";

import {
  CAMPAIGN_REPORT_REASONS,
  ELIGIBILITY_CATEGORIES,
  PLAN_ELIGIBLE_MEMBERSHIP_STATUSES,
  classifyRecipient,
  resolveRecipientVariables,
} from "@/lib/admin/campaign-eligibility";
import {createMessageEligibilityRepository, type RecipientFacts} from "@/lib/db/repos/message-eligibility";
import type {AdminActor} from "@/lib/membership/lifecycle";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const admin: AdminActor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};

function memberFacts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    kind: "member",
    id: "member-1",
    displayName: "Ada Lovelace",
    email: "ada@example.test",
    whatsappNumber: "+85291234567",
    locale: "en",
    membershipStatus: "active",
    planCode: "corporate",
    renewalAt: new Date("2026-08-20T00:00:00.000Z"),
    marketingConsent: true,
    whatsappOptIn: true,
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    whatsappSuppressed: false,
    ...overrides,
  };
}

function contactFacts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return memberFacts({
    kind: "contact",
    id: "33333333-3333-4333-8333-333333333333",
    // A prospect carries no marketing-consent column of its own, so the facts
    // loader reports `false` for every contact. That is why a contact can never
    // be an eligible EMAIL recipient today, and why the email arm of an
    // /admin/segments blast cannot leak onto the contact half of a "both"
    // segment even though the audience query now projects it.
    marketingConsent: false,
    membershipStatus: null,
    planCode: null,
    renewalAt: null,
    ...overrides,
  });
}

describe("campaign eligibility classifier", () => {
  it("applies suppressed > not_opted_in > no_number > plan_ineligible > eligible on WhatsApp", () => {
    const blocked = memberFacts({
      whatsappSuppressed: true,
      whatsappOptIn: false,
      whatsappNumber: null,
      membershipStatus: "expired",
    });
    expect(classifyRecipient(blocked, "whatsapp")).toBe("suppressed");
    expect(classifyRecipient({...blocked, whatsappSuppressed: false}, "whatsapp")).toBe("not_opted_in");
    expect(classifyRecipient({...blocked, whatsappSuppressed: false, whatsappOptIn: true}, "whatsapp")).toBe("no_number");
    expect(classifyRecipient({...blocked, whatsappSuppressed: false, whatsappOptIn: true, whatsappNumber: "+85291234567"}, "whatsapp")).toBe("plan_ineligible");
    expect(classifyRecipient(memberFacts(), "whatsapp")).toBe("eligible");
  });

  it("applies suppressed > not_opted_in > no_email > plan_ineligible > eligible on email", () => {
    const blocked = memberFacts({
      emailSuppressed: true,
      marketingConsent: false,
      email: "not-an-email",
      membershipStatus: "expired",
    });
    expect(classifyRecipient(blocked, "email")).toBe("suppressed");
    expect(classifyRecipient({...blocked, emailSuppressed: false}, "email")).toBe("not_opted_in");
    expect(classifyRecipient({...blocked, emailSuppressed: false, marketingConsent: true}, "email")).toBe("no_email");
    expect(classifyRecipient({...blocked, emailSuppressed: false, marketingConsent: true, email: "ada@example.test"}, "email")).toBe("plan_ineligible");
    expect(classifyRecipient(memberFacts(), "email")).toBe("eligible");
  });

  // The resurrection case. `optOutWhatsApp` clears `profiles.whatsapp_opt_in`
  // AND writes the suppression; any later re-consent from the portal turns the
  // flag back on and leaves the suppression standing. Reading only the flag is
  // how a blast reaches somebody who said STOP.
  it("blocks a WhatsApp-suppressed member whose opt-in flag was turned back on", () => {
    expect(classifyRecipient(memberFacts({whatsappSuppressed: true, whatsappOptIn: true}), "whatsapp")).toBe("suppressed");
  });

  it("blocks a prospect who said STOP even with the opt-in flag set", () => {
    const stopped = contactFacts({whatsappOptIn: true, whatsappOptedOutAt: new Date("2026-09-01T00:00:00.000Z")});
    expect(classifyRecipient(stopped, "whatsapp")).toBe("suppressed");
  });

  it("never calls a contact plan-ineligible, even one linked to an expired member", () => {
    const linked = contactFacts({membershipStatus: "expired", planCode: "corporate"});
    expect(classifyRecipient(linked, "whatsapp")).toBe("eligible");
    // …while the same status on a member is exactly what `plan_ineligible` names.
    expect(classifyRecipient(memberFacts({membershipStatus: "expired"}), "whatsapp")).toBe("plan_ineligible");
  });

  it.each([
    ["active", "eligible"],
    ["past_due", "eligible"],
    ["cancel_at_period_end", "eligible"],
    ["expired", "plan_ineligible"],
    ["cancelled", "plan_ineligible"],
    ["pending_review", "plan_ineligible"],
    [null, "plan_ineligible"],
  ] as const)("treats membership status %s as %s", (membershipStatus, expected) => {
    expect(classifyRecipient(memberFacts({membershipStatus}), "whatsapp")).toBe(expected);
  });

  it("keeps a member in dunning inside the audience a dunning campaign is for", () => {
    expect(PLAN_ELIGIBLE_MEMBERSHIP_STATUSES).toContain("past_due");
    expect(ELIGIBILITY_CATEGORIES).toEqual(["eligible", "no_email", "no_number", "not_opted_in", "suppressed", "plan_ineligible"]);
  });

  /**
   * S-9/Task 8. `whatsAppEligibility(purpose:"marketing")` and
   * `classifyRecipient(…, "whatsapp")` must describe the SAME population under
   * different names — `opted_out` and `suppressed` there, one `suppressed` here
   * — or one person reads OPTED_OUT in the inbox and `suppressed` in the
   * campaign preview and staff cannot tell whether that is one problem or two.
   *
   * The plan gate and the number are held constant on purpose: a blast also
   * refuses an expired membership, which a service reply has no opinion about,
   * so the partition is equal only over the three CONSENT facts the table in
   * the plan lists. The samples are also restricted to states the facts loader
   * can actually produce — a member's `whatsappOptedOutAt` is derived from a
   * suppression row that only exists alongside `whatsapp_opt_in = false`.
   */
  it("partitions the same people as the marketing door, under different names", async () => {
    const samples: readonly RecipientFacts[] = [
      memberFacts(),
      memberFacts({whatsappOptIn: false}),
      memberFacts({whatsappSuppressed: true}),
      memberFacts({whatsappOptIn: false, whatsappOptedOutAt: new Date("2026-09-01T00:00:00.000Z"), whatsappSuppressed: true}),
      contactFacts(),
      contactFacts({whatsappOptIn: false}),
      contactFacts({whatsappSuppressed: true}),
      contactFacts({whatsappOptedOutAt: new Date("2026-09-01T00:00:00.000Z")}),
    ];

    for (const facts of samples) {
      const repository = createMessageEligibilityRepository(async () => ({
        execute: async () => ({rows: [facts]}),
      }) as never);
      const verdict = await repository.whatsAppEligibility(admin, {
        profileId: facts.kind === "member" ? facts.id : null,
        contactId: facts.kind === "contact" ? facts.id : null,
        phoneE164: null,
        purpose: "marketing",
      });
      expect(verdict.status === "blocked", `${facts.kind}/${facts.id}`)
        .toBe(classifyRecipient(facts, "whatsapp") !== "eligible");
    }
  });
});

describe("campaign template variables", () => {
  const template = {variables: ["memberName", "renewalDate", "renewalUrl"] as const};

  it("resolves literals and the closed token set from the facts", () => {
    expect(resolveRecipientVariables(template, {
      memberName: "{{displayName}}",
      renewalDate: "{{renewalDate}}",
      renewalUrl: "https://hkwtia.vercel.app/portal",
    }, memberFacts())).toEqual({
      ok: true,
      variables: {memberName: "Ada Lovelace", renewalDate: "2026-08-20", renewalUrl: "https://hkwtia.vercel.app/portal"},
    });
  });

  it("resolves the first-name token from the display name", () => {
    expect(resolveRecipientVariables({variables: ["memberName"]}, {memberName: "{{firstName}}"}, memberFacts()))
      .toEqual({ok: true, variables: {memberName: "Ada"}});
  });

  /**
   * The blocking gap Task 8 exists to close: `lib/channels/woztell.ts` builds
   * the body as `variables[key] ?? ""`, and Meta rejects a template whose BODY
   * parameter is empty. An unresolved variable must block the recipient at
   * snapshot time, because S-15 makes the provider's 4xx terminal — twenty
   * permanent failures from a preview that said `eligible`.
   */
  it.each([
    ["a token with nothing behind it", {memberName: "{{renewalDate}}"}],
    ["a variable the wizard never filled in", {}],
    ["an empty literal", {memberName: "   "}],
    ["an unknown token", {memberName: "{{nickname}}"}],
    ["a literal carrying template syntax", {memberName: "Dear {{displayName}},"}],
  ])("refuses %s", (_label, variablesTemplate) => {
    expect(resolveRecipientVariables({variables: ["memberName"]}, variablesTemplate, memberFacts({renewalAt: null})))
      .toEqual({ok: false, missing: ["memberName"]});
  });

  it("is satisfied by a template with no variables at all", () => {
    expect(resolveRecipientVariables({variables: []}, {}, memberFacts())).toEqual({ok: true, variables: {}});
  });

  it("ignores an entry the template does not declare", () => {
    expect(resolveRecipientVariables({variables: ["memberName"]}, {memberName: "Hi", leftover: "{{email}}"}, memberFacts()))
      .toEqual({ok: true, variables: {memberName: "Hi"}});
  });
});

/**
 * The campaign detail page builds its label map from `CAMPAIGN_REPORT_REASONS`
 * and `campaign-report.tsx` falls back to rendering an unlabelled key verbatim,
 * so a code in that list with no bundle entry is an English snake_case token on
 * the "Not sent" row — in front of a zh-HK admin, on the row that explains why
 * a blast did not go out.
 *
 * Both halves are load-bearing. The list has to name every code a writer can
 * produce (it was hand-listed once and missed three), and every code it names
 * has to be in BOTH bundles. `template_not_approved` is the expensive one:
 * `approvedTemplateKeys` fails closed on a registry read that throws, so one
 * revoked or unreadable template blocks the whole tick and the entire panel
 * becomes that single row.
 */
describe("the campaign report's reason vocabulary", () => {
  it("labels every reason in both bundles", () => {
    for (const reason of CAMPAIGN_REPORT_REASONS) {
      expect(en.Admin.campaigns.eligibility, `en ${reason}`).toHaveProperty(reason);
      expect(zh.Admin.campaigns.eligibility, `zh-HK ${reason}`).toHaveProperty(reason);
    }
  });

  it("names every code a writer can produce", () => {
    // The snapshot-time half: `blocked_reason` is an eligibility category, minus
    // `eligible`, which `reportReasonFor` returns for nobody. Widened to
    // `string[]` so the loop can ask about `eligible` at all — the whole point
    // of the assertion is that one category is absent.
    const reasons: readonly string[] = CAMPAIGN_REPORT_REASONS;
    for (const category of ELIGIBILITY_CATEGORIES) {
      expect(reasons.includes(category), category).toBe(category !== "eligible");
    }
    // The send-time half, which is what drifted: `campaign-runner.ts` writes
    // `marketing_suppressed` as an `error_code` and `template_not_approved` as a
    // `blocked_reason`, and `dispatchNotification` answers `missing_variable`,
    // `template_not_approved` and `unknown_recipient` — every one of which the
    // runner passes straight through to `markRecipientBlocked`.
    expect(CAMPAIGN_REPORT_REASONS).toEqual(expect.arrayContaining([
      "missing_variable",
      "marketing_suppressed",
      "template_not_approved",
      "unknown_recipient",
    ]));
  });
});
