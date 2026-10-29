import {describe, expect, it} from "vitest";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import {membershipSelfServicePolicy} from "@/lib/membership/policy-self-service";
import {MEMBERSHIP_POLICIES} from "@/config/membership-policies";
import {localizedPath} from "@/lib/urls";

describe("versioned shipped self-service copy contract", () => {
  it("has explicit unknown refund/SLA and does not invent association approval", () => {
    expect(membershipSelfServicePolicy.version).toBe("self-service-links-v1");
    expect(membershipSelfServicePolicy.membershipRefund).toBe("unknown");
    expect(membershipSelfServicePolicy.reviewSla).toBe("unknown");
    expect(MEMBERSHIP_POLICIES).toEqual([]);
  });
  it.each(["en", "zh-HK"] as const)("binds the same self-service destinations and complete existing copy in %s", locale => {
    const copy = (locale === "en" ? en : zhHK).Membership;
    expect(Object.keys(copy.selfService).sort()).toEqual(["title", "copy", "billing", "support"].sort());
    expect(Object.keys(copy.selfService).sort()).toEqual(Object.keys(en.Membership.selfService).sort());
    for (const link of Object.values(membershipSelfServicePolicy.links)) {
      expect(copy.selfService[link.labelKey.split(".")[1] as keyof typeof copy.selfService]).toEqual(expect.any(String));
      expect(localizedPath(locale, link.href)).toBe(`${locale === "zh-HK" ? "/zh" : ""}${link.href}`);
    }
    expect(membershipSelfServicePolicy.links.billing.href).toBe("/portal/billing");
    expect(membershipSelfServicePolicy.links.support.href).toBe("/contact");
    expect(copy.selfService.copy).toContain(locale === "en" ? "Contact WTIA" : "聯絡 WTIA");
  });
  it("pins both languages' existing membership refund and review qualifications", () => {
    // The operational aim is public copy. reviewSla stays "unknown" above: it is not
    // an approved membership-policy term.
    expect(en.Membership.faq["5"].answer).toContain("5 working days");
    expect(zhHK.Membership.faq["5"].answer).toContain("5 個工作天");
    expect(en.Membership.faq["6"].answer).toContain("no membership refund entitlement");
    expect(zhHK.Membership.faq["6"].answer).toContain("本頁不承諾會籍退款權益");
  });
});
