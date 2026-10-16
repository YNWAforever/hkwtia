import { describe, expect, it } from "vitest";
import {
  deriveApplicationTriage,
  type ApplicationTriageInput,
} from "@/lib/ai/application-triage";
const source = (
  patch: Partial<ApplicationTriageInput> = {},
): ApplicationTriageInput => ({
  planCode: "community",
  status: "draft",
  profile: { displayName: "Synthetic applicant", whatsappOptIn: false },
  company: null,
  membership: null,
  payment: null,
  ...patch,
});
describe("authoritative application triage", () => {
  it("finds missing required name without inventing optional phone or company fields", () => {
    expect(
      deriveApplicationTriage(
        source({ profile: { displayName: " ", whatsappOptIn: false } }),
      ),
    ).toMatchObject({
      missingFields: ["displayName"],
      nextActionCode: "await_documents",
    });
  });
  it("keeps filled required fields and absent optional fields out of missing documents", () => {
    expect(deriveApplicationTriage(source())).toMatchObject({
      missingFields: [],
      validationIssues: [],
      nextActionCode: "contact_applicant",
    });
  });
  it.each(["startup", "corporate"])(
    "requires the existing company contract for %s",
    (planCode) => {
      expect(deriveApplicationTriage(source({ planCode }))).toMatchObject({
        missingFields: ["companyName"],
        nextActionCode: "await_documents",
      });
      expect(
        deriveApplicationTriage(
          source({
            planCode,
            company: {
              legalName: "Synthetic Limited",
              displayName: "Synthetic",
            },
          }),
        ).missingFields,
      ).toEqual([]);
    },
  );
  it("does not label a present but invalid company name as absent", () => {
    const result = deriveApplicationTriage(
      source({
        planCode: "startup",
        company: { legalName: "X".repeat(201), displayName: "Synthetic" },
      }),
    );
    expect(result.missingFields).toEqual([]);
    expect(result.validationIssues).toContain("company.legalName");
  });
  it("distinguishes opt-in number validation from an optional phone requirement", () => {
    const result = deriveApplicationTriage(
      source({ profile: { displayName: "Synthetic", whatsappOptIn: true } }),
    );
    expect(result.missingFields).toEqual([]);
    expect(result.validationIssues).toContain("profile.whatsappNumber");
  });
  it("pending payment proposes waiting without making another payment or changing source", () => {
    const input = source({
        status: "pending_payment",
        membership: { status: "pending_payment", stripeSubscriptionId: null },
        payment: { state: "active" },
      }),
      before = structuredClone(input);
    expect(deriveApplicationTriage(input)).toMatchObject({
      nextActionCode: "await_payment",
      paymentDisposition: "processing_or_unconfirmed",
    });
    expect(input).toEqual(before);
  });
  it.each(["completed", "active"])(
    "a correlated subscription or completed attempt requires reconciliation (%s)",
    (state) => {
      expect(
        deriveApplicationTriage(
          source({
            status: "pending_payment",
            membership: {
              status: "pending_payment",
              stripeSubscriptionId: state === "active" ? "sub_synthetic" : null,
            },
            payment: { state },
          }),
        ),
      ).toMatchObject({
        nextActionCode: "support_reconciliation",
        paymentDisposition: "reconciliation_required",
      });
    },
  );
  it("pending review proposes existing review without activating membership", () => {
    const input = source({
        planCode: "patron",
        status: "pending_review",
        membership: { status: "pending_review", stripeSubscriptionId: null },
      }),
      before = structuredClone(input);
    expect(deriveApplicationTriage(input).nextActionCode).toBe("review_ready");
    expect(input).toEqual(before);
  });
  it("abandoned or active cases are not automatically chased", () => {
    expect(
      deriveApplicationTriage(source({ status: "abandoned" })).nextActionCode,
    ).toBe("none");
    expect(
      deriveApplicationTriage(
        source({
          status: "completed",
          membership: { status: "active", stripeSubscriptionId: null },
        }),
      ).nextActionCode,
    ).toBe("none");
  });
  it("does not borrow individual plan authority for a company target or unknown plan", () => {
    expect(
      deriveApplicationTriage(
        source({
          company: { legalName: "Synthetic", displayName: "Synthetic" },
        }),
      ).validationIssues,
    ).toContain("company.target");
    expect(() =>
      deriveApplicationTriage(source({ planCode: "unapproved_plan" })),
    ).toThrow("INVALID_PLAN_CODE");
  });
});
