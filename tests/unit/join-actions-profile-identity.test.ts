import {beforeEach, describe, expect, it, vi} from "vitest";

const redirectState = vi.hoisted(() => ({url: null as string | null}));
const repoState = vi.hoisted(() => ({
  profileIds: [] as string[],
  application: {id: "application-1", applicantUserId: "member-1", companyId: null, planCode: "startup", currentStep: "company", status: "draft"},
}));

vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => `localized:${key}`}));
vi.mock("next/navigation", () => ({redirect: (url: string) => { redirectState.url = url; throw new Error("NEXT_REDIRECT"); }}));
vi.mock("@/lib/auth/server", () => ({auth: {signIn: {magicLink: vi.fn()}}}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: async () => ({kind: "member", userId: "auth-1", profileId: "member-1"}),
  getActor: vi.fn(),
}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {
  getById: async (_actor: unknown, id: string) => { repoState.profileIds.push(id); return {id: "member-1", displayName: "Member", phone: null, jobTitle: null, locale: "en"}; },
  update: async (_actor: unknown, id: string) => { repoState.profileIds.push(id); return {}; },
  ensure: async (_actor: unknown, input: {id: string}) => { repoState.profileIds.push(input.id); return {}; },
}}));
vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {
  getById: async () => repoState.application,
  update: async () => repoState.application,
}}));
vi.mock("@/lib/db/repos/companies", () => ({companiesRepository: {
  createForApplication: async () => ({id: "company-1", legalName: "Company", displayName: "Company"}),
  update: vi.fn(),
}}));
vi.mock("@/lib/membership/join-service", () => ({
  startJoin: async () => ({applicationId: "application-1", next: "profile"}),
  completeApplication: async () => ({applicationId: "application-1", next: "complete"}),
}));

import {saveCompany, saveProfile} from "@/app/[locale]/(join)/join/actions";

describe("join actions use profile identity", () => {
  beforeEach(() => {
    redirectState.url = null;
    repoState.profileIds = [];
  });

  it("saves a member profile by profileId and never auth userId", async () => {
    const form = new FormData();
    form.set("displayName", "Member");

    await expect(saveProfile("en", "community", null, {}, form)).rejects.toThrow("NEXT_REDIRECT");

    expect(repoState.profileIds).toEqual(["member-1", "member-1"]);
    expect(repoState.profileIds).not.toContain("auth-1");
  });

  it("saves an applicant company and reads its profile by profileId", async () => {
    const form = new FormData();
    form.set("legalName", "Company Limited");
    form.set("companyDisplayName", "Company");

    await expect(saveCompany("en", "startup", "application-1", {}, form)).rejects.toThrow("NEXT_REDIRECT");

    expect(repoState.profileIds).toEqual(["member-1"]);
    expect(repoState.profileIds).not.toContain("auth-1");
  });
});
