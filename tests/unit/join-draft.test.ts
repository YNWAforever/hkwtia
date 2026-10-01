import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/membership/lifecycle";
const state = vi.hoisted(() => ({ app: { id: "10000000-0000-4000-8000-000000000001", applicantUserId: "profile-own", planCode: "corporate", companyId: "company-own" } as Record<string, unknown> | null, error: null as Error | null }));
const getApplication = vi.hoisted(() => vi.fn());
const getProfile = vi.hoisted(() => vi.fn());
const getCompany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/repos/applications", () => ({ applicationsRepository: { getById: getApplication } }));
vi.mock("@/lib/db/repos/profiles", () => ({ profilesRepository: { getById: getProfile } }));
vi.mock("@/lib/db/repos/companies", () => ({ companiesRepository: { getById: getCompany } }));
import { getJoinDraft } from "@/lib/membership/join-draft";
const actor = { kind: "member", userId: "auth-distinct", profileId: "profile-own", companyRoles: { "company-own": "owner" } } as const;
const id = "10000000-0000-4000-8000-000000000001";
describe("saved join draft ownership and failed-read distinction", () => {
    beforeEach(() => { vi.clearAllMocks(); state.app = { id, applicantUserId: "profile-own", planCode: "corporate", companyId: "company-own" }; state.error = null; getApplication.mockImplementation(async () => { if (state.error)
        throw state.error; return state.app; }); getProfile.mockResolvedValue({ id: "profile-own", displayName: "Synthetic saved applicant", whatsappOptIn: true }); getCompany.mockResolvedValue({ id: "company-own", legalName: "Synthetic saved company" }); });
    it("loads only the original applicant's stored data using profile identity", async () => { const result = await getJoinDraft(actor, "corporate", id); expect(result?.profile?.displayName).toBe("Synthetic saved applicant"); expect(result?.company?.legalName).toBe("Synthetic saved company"); expect(getProfile).toHaveBeenCalledWith(actor, "profile-own"); expect(result?.profile?.whatsappOptIn).toBe(true); });
    it("company owner access cannot resume another applicant's draft", async () => { state.app = { ...state.app, applicantUserId: "other-applicant" }; expect(await getJoinDraft(actor, "corporate", id)).toBeNull(); expect(getProfile).not.toHaveBeenCalled(); expect(getCompany).not.toHaveBeenCalled(); });
    it("does not accept another plan or malformed application", async () => { expect(await getJoinDraft(actor, "startup", id)).toBeNull(); getApplication.mockClear(); expect(await getJoinDraft(actor, "corporate", "not-an-id")).toBeNull(); expect(getApplication).not.toHaveBeenCalled(); });
    it("does not fabricate empty fields when the database failed", async () => { state.error = new Error("SYNTHETIC_DB_UNAVAILABLE"); await expect(getJoinDraft(actor, "corporate", id)).rejects.toThrow("SYNTHETIC_DB_UNAVAILABLE"); expect(getProfile).not.toHaveBeenCalled(); });
    it("an ownership denial safely refuses the draft", async () => { state.error = new AuthorizationError(); expect(await getJoinDraft(actor, "corporate", id)).toBeNull(); });
    it("an initial form may prefill only the member's existing profile", async () => { const result = await getJoinDraft(actor, "corporate", null); expect(result?.profile?.whatsappOptIn).toBe(true); expect(getApplication).not.toHaveBeenCalled(); expect(getCompany).not.toHaveBeenCalled(); });
    it("staff and anonymous actors cannot read a member join draft", async () => { await expect(getJoinDraft({ kind: "staff", userId: "staff-auth", profileId: "staff-profile" }, "corporate", id)).rejects.toThrow("FORBIDDEN"); await expect(getJoinDraft({ kind: "anonymous", userId: null }, "corporate", id)).rejects.toThrow("FORBIDDEN"); expect(getApplication).not.toHaveBeenCalled(); });
});
