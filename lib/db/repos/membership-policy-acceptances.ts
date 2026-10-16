import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireMember, forbidden, type Actor } from "@/lib/membership/lifecycle";
import { getDb, type Database } from "@/lib/db/repos/common";
import { currentMembershipPolicy, policyAcceptanceEnabled, type ApprovedMembershipPolicy } from "@/lib/membership/policy";
const inputSchema = z.object({ applicationId: z.string().uuid(), policyVersion: z.string().min(1).max(80) }).strict();
export type PolicyAcceptanceInput = z.infer<typeof inputSchema>;
export function createMembershipPolicyAcceptancesRepository(load: () => Promise<Database>, current: () => ApprovedMembershipPolicy | null, enabled: () => boolean = policyAcceptanceEnabled) {
    function policy() { if (!enabled())
        throw Error("MEMBERSHIP_POLICY_ACCEPTANCE_DISABLED"); const value = current(); if (!value)
        throw Error("MEMBERSHIP_POLICY_UNAVAILABLE"); return value; }
    return {
        async recordPolicyAcceptance(actor: Actor, input: PolicyAcceptanceInput): Promise<void> {
            requireMember(actor);
            const parsed = inputSchema.parse(input), approved = policy();
            if (parsed.policyVersion !== approved.version)
                throw Error("MEMBERSHIP_POLICY_VERSION_STALE");
            const db = await load();
            await db.transaction(async (tx) => {
                // Lock version before application in every acceptance writer. An immutable
                // observation prevents changed content from reusing a historic version.
                await tx.execute(sql `SELECT pg_advisory_xact_lock(hashtext(${"membership-policy:" + approved.version}))`);
                const version = await tx.execute(sql `SELECT metadata FROM audit_events WHERE action='membership.policy.version.observed' AND target_type='membership_policy' AND target_id=${approved.version} LIMIT 1`);
                const observed = version.rows[0]?.metadata as {
                    contentHash?: unknown;
                } | undefined;
                if (observed && observed.contentHash !== approved.contentHash)
                    throw Error("MEMBERSHIP_POLICY_CONTENT_CONFLICT");
                const application = await tx.execute(sql `SELECT applicant_user_id FROM membership_applications WHERE id=${parsed.applicationId} AND applicant_user_id=${actor.profileId} AND status IN ('draft','pending_payment','pending_review') FOR UPDATE`);
                if (!application.rows[0])
                    forbidden();
                if (!observed)
                    await tx.execute(sql `INSERT INTO audit_events(actor_type,actor_user_id,action,target_type,target_id,metadata) VALUES('member',${actor.profileId},'membership.policy.version.observed','membership_policy',${approved.version},jsonb_build_object('contentHash',${approved.contentHash}::text,'approvalReference',${approved.approvalReference}::text))`);
                const existing = await tx.execute(sql `SELECT id FROM audit_events WHERE action='membership.policy.accepted' AND target_type='membership_application' AND target_id=${parsed.applicationId} AND actor_user_id=${actor.profileId} AND metadata->>'policyVersion'=${approved.version} AND metadata->>'contentHash'=${approved.contentHash} LIMIT 1`);
                if (existing.rows[0])
                    return;
                await tx.execute(sql `INSERT INTO audit_events(actor_type,actor_user_id,action,target_type,target_id,metadata) VALUES('member',${actor.profileId},'membership.policy.accepted','membership_application',${parsed.applicationId},jsonb_build_object('policyVersion',${approved.version}::text,'contentHash',${approved.contentHash}::text))`);
            });
        },
        async hasCurrentAcceptance(actor: Actor, applicationId: string): Promise<boolean> {
            requireMember(actor);
            const approved = policy();
            z.string().uuid().parse(applicationId);
            const db = await load();
            const rows = await db.execute(sql `SELECT EXISTS(SELECT 1 FROM audit_events a WHERE a.action='membership.policy.accepted' AND a.target_type='membership_application' AND a.target_id=app.id::text AND a.actor_user_id=app.applicant_user_id AND a.metadata->>'policyVersion'=${approved.version} AND a.metadata->>'contentHash'=${approved.contentHash}) AS accepted
     FROM membership_applications app WHERE app.id=${applicationId} AND (app.applicant_user_id=${actor.profileId} OR EXISTS(SELECT 1 FROM company_members cm WHERE cm.company_id=app.company_id AND cm.user_id=${actor.profileId} AND cm.revoked_at IS NULL AND cm.role IN ('owner','admin'))) LIMIT 1`);
            if (!rows.rows[0])
                forbidden();
            return rows.rows[0].accepted === true;
        },
    };
}
export const membershipPolicyAcceptancesRepository = createMembershipPolicyAcceptancesRepository(getDb, currentMembershipPolicy);
export const recordPolicyAcceptance = membershipPolicyAcceptancesRepository.recordPolicyAcceptance;
