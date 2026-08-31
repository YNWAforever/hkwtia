import {beforeEach, describe, expect, it, vi} from "vitest";
import {z} from "zod";

const auth = vi.hoisted(() => ({failure: "", notFound: 0}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => { auth.notFound += 1; throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => { if (auth.failure) throw new Error(auth.failure); return {kind: "staff", userId: "staff", profileId: "staff"}; }}));

import {createPartnerAction, setPartnerArchivedAction, setPartnerPublishedAction} from "@/lib/admin/partner-actions";
import {runPartnerFormAction} from "@/lib/admin/partner-action-core";
import {partnerFormInput} from "@/lib/admin/partner-form-input";
import {createLandingPartnerAction, setLandingPartnerArchivedAction, setLandingPartnerPublishedAction} from "@/lib/admin/landing-partner-actions";

const messages = {successMessage: "Saved", validationMessage: "Check fields", errorMessage: "Try again"};
function partnerForm() { const data = new FormData(); for (const [key, value] of Object.entries({nameEn: "Partner", nameZhHk: "夥伴", category: "regional", websiteUrl: "https://example.com/", logoMediaId: "22222222-2222-4222-8222-222222222222", displayOrder: "5", relationshipStartsOn: "2026-08-29", relationshipEndsOn: "2026-08-29"})) data.set(key, value); data.set("featured", "on"); data.set("relationshipConfirmed", "on"); data.set("logoRightsConfirmed", "on"); return data; }
function landingForm() { const data = new FormData(); for (const [key, value] of Object.entries({organizationEn: "Bridge", organizationZhHk: "橋樑", market: "Singapore", region: "Asia", mouStatus: "signed", contactJson: "{}", notes: "Private"})) data.set(key, value); return data; }

describe("partner action boundaries", () => {
  beforeEach(() => { auth.failure = ""; auth.notFound = 0; });
  it("parses exact partner fields and confirmations", () => { expect(partnerFormInput(partnerForm())).toMatchObject({displayOrder: 5, featured: true, relationshipConfirmed: true, logoRightsConfirmed: true, websiteUrl: "https://example.com/"}); });
  it("maps validation without echoing unlisted fields", async () => { const data = partnerForm(); data.set("secret", "never"); const state = await runPartnerFormAction({}, data, {...messages, mutate: async () => { throw new z.ZodError([{code: z.ZodIssueCode.custom, path: ["nameEn"], message: "bad"}]); }}); expect(state.fieldErrors).toEqual({nameEn: "Check fields"}); expect(JSON.stringify(state)).not.toContain("never"); });
  it.each([["general", createPartnerAction, partnerForm], ["landing", createLandingPartnerAction, landingForm]] as const)("authorizes before parsing the %s form", async (_name, action, makeForm) => { auth.failure = "FORBIDDEN"; const data = makeForm(); const get = vi.spyOn(data, "get"); await expect(action("/en/admin/partners", messages, {}, data)).rejects.toThrow("NEXT_NOT_FOUND"); expect(get).not.toHaveBeenCalled(); });
  it.each([
    ["general publish", setPartnerPublishedAction], ["general archive", setPartnerArchivedAction],
    ["landing publish", setLandingPartnerPublishedAction], ["landing archive", setLandingPartnerArchivedAction],
  ] as const)("lets lifecycle authorization denial escape for %s", async (_name, action) => {
    auth.failure = "FORBIDDEN";
    await expect(action("11111111-1111-4111-8111-111111111111", "/en/admin/partners", true, {status: "idle"}, new FormData())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(auth.notFound).toBe(1);
  });
  it("keeps the raw website URL and maps policy failures to that field", async () => {
    const data = partnerForm();
    data.set("websiteUrl", " https://localhost./private ");
    const state = await runPartnerFormAction({}, data, {...messages, mutate: async (input) => { const {createPartner} = await import("@/lib/db/repos/partners"); await createPartner({kind: "staff", userId: "staff", profileId: "staff"}, input, {transaction: async () => { throw new Error("transaction must not start"); }}); }});
    expect(state).toMatchObject({status: "error", fieldErrors: {websiteUrl: "Check fields"}, values: {websiteUrl: " https://localhost./private "}});
  });
});
