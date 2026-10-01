// @vitest-environment node
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIsolatedSeedEnvironment, assertSeedSentinel } from "@/scripts/lib/acceptance-guard";
import { createApplicationCasesRepository } from "@/lib/db/repos/applications";
import type { ApplicationCasePatch } from "@/lib/admin/application-case-types";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
import type { Database } from "@/lib/db/repos/common";
const profile = randomUUID(), app = randomUUID(), membership = randomUUID(), company = randomUUID();
let pool: Pool;
let repo: ReturnType<typeof createApplicationCasesRepository>;
const staff = { kind: "staff", profileId: "m2-staff-01", userId: "synthetic-staff" } as const;
const key = "membership-application:" + app;
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED !== "true")("actual isolated application cases preserve lifecycle authority", () => {
    beforeAll(async () => {
        const url = assertIsolatedSeedEnvironment(process.env, { prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST" });
        if (new URL(url).hostname !== "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" || process.env.NEON_PROJECT_ID !== "solitary-wave-52860119")
            throw Error("UNCONFIRMED_ISOLATED_TARGET");
        pool = new Pool({ connectionString: url });
        await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS count FROM acceptance_sentinel")).rows[0].count));
        await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic application case','member')", [profile, "fr-case-" + profile + "@example.test"]);
        await pool.query("INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic application case company','Synthetic application case company')", [company]);
        await pool.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,'owner')", [company, profile]);
        await pool.query("INSERT INTO membership_applications(id,applicant_user_id,company_id,plan_code,status) VALUES($1,$2,$3,'corporate','pending_payment')", [app, profile, company]);
        await pool.query("INSERT INTO memberships(id,company_id,application_id,plan_code,status,seat_limit) VALUES($1,$2,$3,'corporate','pending_payment',10)", [membership, company, app]);
        repo = createApplicationCasesRepository(async () => drizzle(pool) as unknown as Database);
    });
    beforeEach(async () => { await pool.query("DELETE FROM staff_tasks WHERE dedupe_key=$1", [key]); await pool.query("DELETE FROM audit_events WHERE target_type='membership_application' AND target_id=$1", [app]); });
    afterAll(async () => { if (pool) {
        await pool.query("DELETE FROM staff_tasks WHERE dedupe_key=$1", [key]);
        await pool.query("DELETE FROM audit_events WHERE target_type='membership_application' AND target_id=$1", [app]);
        await pool.query("DELETE FROM memberships WHERE id=$1", [membership]);
        await pool.query("DELETE FROM membership_applications WHERE id=$1", [app]);
        await pool.query("DELETE FROM company_members WHERE company_id=$1", [company]);
        await pool.query("DELETE FROM companies WHERE id=$1", [company]);
        await pool.query("DELETE FROM profiles WHERE id=$1", [profile]);
        await pool.end();
    } });
    it("reads a new case without creating a task or granting member access", async () => {
        const record = await repo.getApplicationCase(staff, app);
        expect(record?.version).toBe("0");
        expect(record?.membership?.status).toBe("pending_payment");
        expect(record?.payment).toBeNull();
        expect(record?.timeline).toHaveLength(0);
        await expect(repo.getApplicationCase({ kind: "member", userId: profile, profileId: profile }, app)).rejects.toThrow("FORBIDDEN");
        expect((await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE dedupe_key=$1", [key])).rows).toEqual([{ count: 0 }]);
    });
    it("assigns and follows up the same application while all financial/ownership facts remain unchanged", async () => {
        const saved = await repo.updateApplicationCase(staff, app, { expectedVersion: "0", ownerProfileId: "m2-exco-01", dueAt: "2026-10-02T06:30:00Z", missingFields: ["companyWebsite"], nextActionCode: "await_documents", note: "Synthetic document follow-up" });
        const record = await repo.getApplicationCase(staff, app);
        expect(record).toMatchObject({ version: saved.version, ownerProfileId: "m2-exco-01", missingFields: ["companyWebsite"], nextActionCode: "await_documents" });
        expect(record?.timeline).toHaveLength(1);
        expect(record?.timeline[0]).toMatchObject({ actorType: "staff", note: "Synthetic document follow-up" });
        expect((await pool.query("SELECT applicant_user_id,company_id,status FROM membership_applications WHERE id=$1", [app])).rows).toEqual([{ applicant_user_id: profile, company_id: company, status: "pending_payment" }]);
        expect((await pool.query("SELECT status FROM memberships WHERE id=$1", [membership])).rows).toEqual([{ status: "pending_payment" }]);
        expect((await pool.query("SELECT user_id,role FROM company_members WHERE company_id=$1", [company])).rows).toEqual([{ user_id: profile, role: "owner" }]);
    });
    it("serializes parallel first updates to one unique case and refuses stale overwrite", async () => {
        const results = await Promise.allSettled([repo.updateApplicationCase(staff, app, { expectedVersion: "0", nextActionCode: "await_documents", note: "Synthetic first" }), repo.updateApplicationCase(staff, app, { expectedVersion: "0", nextActionCode: "contact_applicant", note: "Synthetic concurrent" })]);
        expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find(item => item.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason.message).toBe("APPLICATION_CASE_VERSION_CONFLICT");
        expect((await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE dedupe_key=$1", [key])).rows).toEqual([{ count: 1 }]);
        expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='membership.application.case.updated'", [app])).rows).toEqual([{ count: 1 }]);
    });
    it("cannot close an application case through the generic task action without a CAS version", async () => {
        await repo.updateApplicationCase(staff, app, {expectedVersion:"0",note:"Synthetic case for weak-entry check"});
        const task=(await pool.query("SELECT id FROM staff_tasks WHERE dedupe_key=$1",[key])).rows[0];
        const tasks=createStaffTasksRepository(async()=>drizzle(pool) as unknown as AutomationDatabase);
        await expect(tasks.resolve(staff,task.id)).rejects.toThrow("APPLICATION_CASE_RESOLVE_REQUIRES_VERSION");
        expect((await pool.query("SELECT status FROM staff_tasks WHERE id=$1",[task.id])).rows).toEqual([{status:"open"}]);
    });
    it("completes and reopens follow-up only with a current version and an audit, without activating the application", async () => {
        const closed=await repo.updateApplicationCase(staff,app,{expectedVersion:"0",nextActionCode:"follow_up_complete",note:"Synthetic follow-up complete"});
        expect((await pool.query("SELECT status,resolved_by_profile_id FROM staff_tasks WHERE dedupe_key=$1",[key])).rows).toEqual([{status:"resolved",resolved_by_profile_id:staff.profileId}]);
        await repo.updateApplicationCase(staff,app,{expectedVersion:closed.version,nextActionCode:"await_documents",note:"Synthetic new follow-up"});
        expect((await pool.query("SELECT status,resolved_at,resolved_by_profile_id FROM staff_tasks WHERE dedupe_key=$1",[key])).rows).toEqual([{status:"open",resolved_at:null,resolved_by_profile_id:null}]);
        expect((await pool.query("SELECT status FROM membership_applications WHERE id=$1",[app])).rows).toEqual([{status:"pending_payment"}]);
        expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='membership.application.case.updated'",[app])).rows).toEqual([{count:2}]);
    });
    it("validates the assigned owner against the current administrator role in SQL", async () => { await expect(repo.updateApplicationCase(staff, app, { expectedVersion: "0", ownerProfileId: profile, note: "Synthetic invalid owner" })).rejects.toThrow("APPLICATION_CASE_OWNER_INVALID"); expect((await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE dedupe_key=$1", [key])).rows).toEqual([{ count: 0 }]); });
    it("strictly refuses lifecycle or arbitrary data fields; ordinary staff cannot set paid/active or move company", async () => {
        for (const field of [{ status: "active" }, { paid: true }, { applicantUserId: "m2-exco-01" }, { companyId: randomUUID() }, { missingFields: ["stripeCustomerId"] }])
            await expect(repo.updateApplicationCase(staff, app, { expectedVersion: "0", note: "Synthetic forged patch", ...field } as unknown as ApplicationCasePatch)).rejects.toThrow();
        expect((await pool.query("SELECT status FROM memberships WHERE id=$1", [membership])).rows).toEqual([{ status: "pending_payment" }]);
        expect((await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE dedupe_key=$1", [key])).rows).toEqual([{ count: 0 }]);
    });
    it("rolls back the operational mutation when the actual audit insert fails", async () => {
        const constraint = "fr_case_receipt_" + randomUUID().replaceAll("-", "");
        // Exact test-only constraint affects this new application's audit target only.
        await pool.query('ALTER TABLE audit_events ADD CONSTRAINT "' + constraint + '" CHECK (target_id <> \'' + app + '\') NOT VALID');
        try {
            await expect(repo.updateApplicationCase(staff, app, { expectedVersion: "0", nextActionCode: "await_documents", note: "Synthetic audit failure" })).rejects.toThrow();
            expect((await pool.query("SELECT count(*)::int AS count FROM staff_tasks WHERE dedupe_key=$1", [key])).rows).toEqual([{ count: 0 }]);
        }
        finally {
            await pool.query('ALTER TABLE audit_events DROP CONSTRAINT "' + constraint + '"');
        }
    });
});
