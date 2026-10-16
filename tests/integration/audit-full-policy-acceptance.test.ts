// @vitest-environment node
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertIsolatedSeedEnvironment, assertSeedSentinel } from "@/scripts/lib/acceptance-guard";
import { createMembershipPolicyAcceptancesRepository } from "@/lib/db/repos/membership-policy-acceptances";
import { resolveMembershipPolicy, type ApprovedMembershipPolicy } from "@/lib/membership/policy";
import type { Database } from "@/lib/db/repos/common";
const profile = randomUUID(), other = randomUUID(), app = randomUUID(), version = "synthetic-test-" + randomUUID();
let pool: Pool;
let current: ApprovedMembershipPolicy | null;
let repo: ReturnType<typeof createMembershipPolicyAcceptancesRepository>;
const actor = { kind: "member", profileId: profile, userId: "auth-test-" + profile } as const;
const synthetic = { version, effectiveAt: "2026-01-01T00:00:00Z", approvedAt: "2025-12-31T00:00:00Z", approvedBy: "Synthetic test owner; not WTIA approval", approvalReference: "test-only-" + version, localeContent: { en: "TEST ONLY. No association terms or rights are approved by this fixture.", "zh-HK": "只供測試。此測試資料並非協會已批准的條款或權益。" } };
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED !== "true")("actual isolated policy acceptance; synthetic policy only", () => {
    beforeAll(async () => {
        const url = assertIsolatedSeedEnvironment(process.env, { prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST" });
        if (new URL(url).hostname !== "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" || process.env.NEON_PROJECT_ID !== "solitary-wave-52860119")
            throw Error("UNCONFIRMED_ISOLATED_TARGET");
        pool = new Pool({ connectionString: url });
        await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS count FROM acceptance_sentinel")).rows[0].count));
        for (const id of [profile, other])
            await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic policy acceptance','member')", [id, "fr-policy-" + id + "@example.test"]);
        await pool.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'startup','pending_payment')", [app, profile]);
        current = resolveMembershipPolicy([synthetic], version, new Date("2026-10-01T00:00:00Z"));
        repo = createMembershipPolicyAcceptancesRepository(async () => drizzle(pool) as unknown as Database, () => current, () => true);
    });
    afterAll(async () => { if (pool) {
        await pool.query("DELETE FROM audit_events WHERE (target_type='membership_policy' AND target_id=ANY($1::text[])) OR (target_type='membership_application' AND target_id=$2)", [[version, version + "-v2"], app]);
        await pool.query("DELETE FROM membership_applications WHERE id=$1", [app]);
        await pool.query("DELETE FROM profiles WHERE id=ANY($1::text[])", [[profile, other]]);
        await pool.end();
    } });
    it("refuses forged ownership with zero policy receipts", async () => {
        await expect(repo.recordPolicyAcceptance({ ...actor, profileId: other }, { applicationId: app, policyVersion: version })).rejects.toThrow("FORBIDDEN");
        expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1", [app])).rows).toEqual([{ count: 0 }]);
    });
    it("serializes identical acknowledgements to one server-time receipt and one observed hash", async () => {
        const input = { applicationId: app, policyVersion: version };
        expect(await repo.hasCurrentAcceptance(actor, app)).toBe(false);
        await Promise.all([repo.recordPolicyAcceptance(actor, input), repo.recordPolicyAcceptance(actor, input)]);
        expect(await repo.hasCurrentAcceptance(actor, app)).toBe(true);
        const receipts = (await pool.query("SELECT actor_user_id,metadata,created_at FROM audit_events WHERE target_id=$1 AND action='membership.policy.accepted'", [app])).rows;
        expect(receipts).toHaveLength(1);
        expect(receipts[0].actor_user_id).toBe(profile);
        expect(receipts[0].metadata).toEqual({ policyVersion: version, contentHash: current!.contentHash });
        expect(receipts[0].created_at).toBeInstanceOf(Date);
    });
    it("a new current version requires explicit re-reading; stale posted version cannot acknowledge it", async () => {
        current = resolveMembershipPolicy([{ ...synthetic, version: version + "-v2" }], version + "-v2", new Date("2026-10-01T00:00:00Z"));
        expect(await repo.hasCurrentAcceptance(actor, app)).toBe(false);
        await expect(repo.recordPolicyAcceptance(actor, { applicationId: app, policyVersion: version })).rejects.toThrow("MEMBERSHIP_POLICY_VERSION_STALE");
        await repo.recordPolicyAcceptance(actor, { applicationId: app, policyVersion: version + "-v2" });
        expect(await repo.hasCurrentAcceptance(actor, app)).toBe(true);
    });
    it("does not reuse the same historic version for changed content", async () => {
        current = resolveMembershipPolicy([{ ...synthetic, localeContent: { ...synthetic.localeContent, en: "Changed TEST ONLY body" } }], version, new Date("2026-10-01T00:00:00Z"));
        await expect(repo.recordPolicyAcceptance(actor, { applicationId: app, policyVersion: version })).rejects.toThrow("MEMBERSHIP_POLICY_CONTENT_CONFLICT");
    });
    it("a missing approved version never records an acceptance", async () => { current = null; await expect(repo.recordPolicyAcceptance(actor, { applicationId: app, policyVersion: version })).rejects.toThrow("MEMBERSHIP_POLICY_UNAVAILABLE"); });
});
