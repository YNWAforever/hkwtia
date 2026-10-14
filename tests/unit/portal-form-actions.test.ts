import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({updateProfile: vi.fn(), updateCompany: vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => ({kind: "member", userId: "auth", profileId: "own-profile"})}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {update: state.updateProfile}}));
vi.mock("@/lib/db/repos/contacts", () => ({contactWriterActor: () => ({}), contactsRepository: {linkProfile: async () => null}}));
vi.mock("@/lib/db/repos/memberships", () => ({membershipsRepository: {list: async () => [{id: "m", status: "active", companyId: "company-a"}]}}));
vi.mock("@/lib/db/repos/companies", () => ({companiesRepository: {getById: async () => ({id: "company-a"}), update: state.updateCompany}}));

import {revalidatePath} from "next/cache";
import {updateProfileAction, updateCompanyAction} from "@/lib/portal/commands";

const initial = {status: "idle"} as const;
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("portal form actions use the real validation schema and safe outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.updateProfile.mockResolvedValue({id: "own-profile", email: "synthetic@example.test", whatsappNumber: "+85291234567"});
    state.updateCompany.mockResolvedValue({id: "company-a"});
  });
  it.each([
    ["", "required"], ["not-a-number", "invalid_number"],
  ])("explains WhatsApp opt-in with invalid number %s without writing", async (number, code) => {
    await expect(updateProfileAction(initial, form({displayName: "Ada", whatsappOptIn: "on", whatsappNumber: number}))).resolves.toMatchObject({status: "validation_error", fieldErrors: {whatsappNumber: code}});
    expect(state.updateProfile).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("reports success after saving only the actor's profile and revalidates both language paths", async () => {
    await expect(updateProfileAction(initial, form({displayName: "Ada", locale: "zh-HK", whatsappOptIn: "on", whatsappNumber: "+852 9123 4567"}))).resolves.toEqual({status: "success"});
    expect(state.updateProfile).toHaveBeenCalledWith(expect.objectContaining({profileId: "own-profile"}), "own-profile", expect.objectContaining({whatsappNumber: "+85291234567", whatsappOptIn: true}));
    expect(revalidatePath).toHaveBeenCalledWith("/zh-HK/portal/profile");
    expect(revalidatePath).toHaveBeenCalledWith("/en/portal");
  });
  it("keeps forbidden company writes distinct from infrastructure failure", async () => {
    const data = form({companyId: "company-a", legalName: "Alpha Ltd", displayName: "Alpha"});
    state.updateCompany.mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(updateCompanyAction(initial, data)).resolves.toEqual({status: "forbidden"});
    state.updateCompany.mockRejectedValueOnce(new Error("driver connection secret"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(updateCompanyAction(initial, data)).resolves.toEqual({status: "unavailable"});
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining("secret"));
    } finally { log.mockRestore(); }
  });
  it("does not swallow framework redirects", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {digest: "NEXT_REDIRECT;replace;/member-login;307;"});
    state.updateProfile.mockRejectedValueOnce(redirect);
    await expect(updateProfileAction(initial, form({displayName: "Ada"}))).rejects.toBe(redirect);
  });
});
