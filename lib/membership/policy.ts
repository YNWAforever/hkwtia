import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { MEMBERSHIP_POLICIES } from "@/config/membership-policies";
export const membershipPolicySchema = z.object({
    version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),
    effectiveAt: z.string().datetime({ offset: true }), approvedAt: z.string().datetime({ offset: true }),
    approvedBy: z.string().trim().min(1).max(200), approvalReference: z.string().trim().min(1).max(2048),
    localeContent: z.object({ en: z.string().trim().min(1).max(100000), "zh-HK": z.string().trim().min(1).max(100000) }).strict(),
}).strict();
export type MembershipPolicy = z.infer<typeof membershipPolicySchema>;
export type ApprovedMembershipPolicy = Readonly<MembershipPolicy & {
    contentHash: string;
}>;
export function policyAcceptanceEnabled(): boolean { return process.env.MEMBERSHIP_POLICY_ACCEPTANCE_ENABLED === "true"; }
export function membershipPolicyHash(policy: MembershipPolicy): string {
    return createHash("sha256").update(JSON.stringify({ version: policy.version, effectiveAt: policy.effectiveAt, approvedAt: policy.approvedAt, approvedBy: policy.approvedBy, approvalReference: policy.approvalReference, localeContent: { en: policy.localeContent.en, "zh-HK": policy.localeContent["zh-HK"] } })).digest("hex");
}
/** An explicit approved/effective version is required; no fallback to draft terms. */
export function resolveMembershipPolicy(registry: readonly unknown[], version: string | undefined, now: Date = new Date()): ApprovedMembershipPolicy | null {
    if (!Number.isFinite(now.getTime()))
        throw Error("MEMBERSHIP_POLICY_CLOCK_INVALID");
    const policies = registry.map(value => membershipPolicySchema.parse(value));
    if (new Set(policies.map(policy => policy.version)).size !== policies.length)
        throw Error("MEMBERSHIP_POLICY_VERSION_DUPLICATED");
    const policy = policies.find(item => item.version === version);
    if (!policy || Date.parse(policy.effectiveAt) > now.getTime() || Date.parse(policy.approvedAt) > now.getTime())
        return null;
    return { ...policy, contentHash: membershipPolicyHash(policy) };
}
export function currentMembershipPolicy(): ApprovedMembershipPolicy | null {
    return resolveMembershipPolicy(MEMBERSHIP_POLICIES, process.env.MEMBERSHIP_POLICY_ACTIVE_VERSION);
}
export function requireCurrentMembershipPolicy(): ApprovedMembershipPolicy {
    const policy = currentMembershipPolicy();
    if (!policy)
        throw Error("MEMBERSHIP_POLICY_UNAVAILABLE");
    return policy;
}
