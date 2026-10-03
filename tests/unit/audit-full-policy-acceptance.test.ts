import { afterEach, describe, expect, it, vi } from "vitest";
import { membershipPolicySchema, membershipPolicyHash, resolveMembershipPolicy, currentMembershipPolicy, type MembershipPolicy } from "@/lib/membership/policy";
const synthetic: MembershipPolicy = { version: "synthetic-test-v1", effectiveAt: "2026-01-01T00:00:00Z", approvedAt: "2025-12-31T00:00:00Z", approvedBy: "Synthetic test owner; not WTIA approval", approvalReference: "test-fixture-only", localeContent: { en: "TEST ONLY. No association terms or rights are approved by this fixture.", "zh-HK": "只供測試。此測試資料並非協會已批准的條款或權益。" } };
const now = new Date("2026-10-01T00:00:00Z");
afterEach(() => vi.unstubAllEnvs());
describe("approved version selection and content binding", () => {
    it("requires an explicit current approved/effective version", () => {
        expect(resolveMembershipPolicy([synthetic], synthetic.version, now)).toMatchObject({ version: synthetic.version, contentHash: membershipPolicyHash(synthetic) });
        expect(resolveMembershipPolicy([synthetic], undefined, now)).toBeNull();
        expect(resolveMembershipPolicy([synthetic], "old-v0", now)).toBeNull();
    });
    it.each(["approvedAt", "approvedBy", "approvalReference"] as const)("rejects an unapproved document missing %s", key => {
        const data = { ...synthetic, [key]: "" };
        expect(membershipPolicySchema.safeParse(data).success).toBe(false);
        expect(() => resolveMembershipPolicy([data], synthetic.version, now)).toThrow();
    });
    it.each(["approvedAt", "effectiveAt"] as const)("never activates a future %s", key => { expect(resolveMembershipPolicy([{ ...synthetic, [key]: "2027-01-01T00:00:00Z" }], synthetic.version, now)).toBeNull(); });
    it("rejects duplicate versions instead of selecting an arbitrary body", () => { expect(() => resolveMembershipPolicy([synthetic, { ...synthetic, localeContent: { ...synthetic.localeContent, en: "changed" } }], synthetic.version, now)).toThrow("MEMBERSHIP_POLICY_VERSION_DUPLICATED"); });
    it("binds both locales and approval provenance, regardless of object property insertion order", () => {
        expect(membershipPolicyHash({ ...synthetic, localeContent: { "zh-HK": synthetic.localeContent["zh-HK"], en: synthetic.localeContent.en } })).toBe(membershipPolicyHash(synthetic));
        expect(membershipPolicyHash({ ...synthetic, localeContent: { ...synthetic.localeContent, "zh-HK": "另一段測試內容" } })).not.toBe(membershipPolicyHash(synthetic));
        expect(membershipPolicyHash({ ...synthetic, approvalReference: "changed-reference" })).not.toBe(membershipPolicyHash(synthetic));
    });
    it("does not invent a default Production policy", () => { vi.stubEnv("MEMBERSHIP_POLICY_ACTIVE_VERSION", "synthetic-test-v1"); expect(currentMembershipPolicy()).toBeNull(); });
    it("fails closed on an invalid clock", () => { expect(() => resolveMembershipPolicy([synthetic], synthetic.version, new Date("bad"))).toThrow("MEMBERSHIP_POLICY_CLOCK_INVALID"); });
});
