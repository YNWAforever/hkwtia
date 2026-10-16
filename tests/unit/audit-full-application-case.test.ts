import { describe, expect, it } from "vitest";
import { applicationCasePatchSchema } from "@/lib/admin/application-case-types";
describe("application follow-up patch boundary", () => {
    it("detects hostile lifecycle shapes and accepts operational shapes", () => {
        const safe = { expectedVersion: "0", missingFields: ["companyWebsite"], nextActionCode: "await_documents", note: "Synthetic follow-up" };
        expect(applicationCasePatchSchema.safeParse(safe).success).toBe(true);
        for (const field of [{ status: "active" }, { paymentStatus: "paid" }, { role: "superadmin" }, { applicantUserId: "other" }, { companyId: "other" }, { missingFields: ["email", "stripeSubscriptionId"] }, { missingFields: ["companyWebsite", "companyWebsite"] }, { nextActionCode: "activate" }])
            expect(applicationCasePatchSchema.safeParse({ ...safe, ...field }).success).toBe(false);
    });
    it("requires a real CAS version, bounded note and explicit datetime", () => { for (const invalid of [{ expectedVersion: "" }, { expectedVersion: "0", note: "" }, { expectedVersion: "0", note: "x".repeat(1001) }, { expectedVersion: "0", dueAt: "tomorrow" }])
        expect(applicationCasePatchSchema.safeParse(invalid).success).toBe(false); });
});
