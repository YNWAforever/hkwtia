import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"}))}));
vi.mock("@/lib/portal/command-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/portal/command-core")>()),
  updateCompany: vi.fn(async () => null),
}));

import {companyDirectoryVisibility, updateCompany} from "@/lib/portal/command-core";
import {updateCompanyAction} from "@/lib/portal/commands";

function details(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({companyId: "c1", legalName: "Acme Ltd", displayName: "Acme", ...extra})) form.set(key, value);
  return form;
}

describe("companyDirectoryVisibility", () => {
  it("is undefined when the form does not carry the switch, so a save cannot overwrite it", () => {
    expect(companyDirectoryVisibility(details())).toBeUndefined();
  });

  it("reads the checkbox when the form carries the switch", () => {
    expect(companyDirectoryVisibility(details({directoryVisibleShown: "1", directoryVisible: "on"}))).toBe(true);
    expect(companyDirectoryVisibility(details({directoryVisibleShown: "1"}))).toBe(false);
  });
});

describe("updateCompanyAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves directoryVisible out of the update when the form has no switch", async () => {
    await updateCompanyAction(details());
    const input = vi.mocked(updateCompany).mock.calls[0]?.[1];
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty("directoryVisible");
  });

  it("sends the switch's value when the form has it", async () => {
    await updateCompanyAction(details({directoryVisibleShown: "1", directoryVisible: "on"}));
    expect(vi.mocked(updateCompany).mock.calls[0]?.[1]).toMatchObject({directoryVisible: true});
    await updateCompanyAction(details({directoryVisibleShown: "1"}));
    expect(vi.mocked(updateCompany).mock.calls[1]?.[1]).toMatchObject({directoryVisible: false});
  });
});
