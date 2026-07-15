import {beforeEach, describe, expect, it, vi} from "vitest";

const authState = vi.hoisted(() => ({input: null as null | {email: string; callbackURL?: string}}));
const redirectState = vi.hoisted(() => ({url: null as string | null}));
const repoState = vi.hoisted(() => ({
  application: {id: "application-a", applicantUserId: "user-a", companyId: null as string | null, planCode: "startup", currentStep: "company", status: "draft"},
  company: {id: "company-a", legalName: "Acme Limited", displayName: "Acme"},
  profile: {id: "user-a", displayName: "Member A", phone: null, jobTitle: null, locale: "en"},
  createdCompanyInput: null as null | Record<string, unknown>,
  completedInput: null as null | Record<string, unknown>,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `localized:${key}`,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { redirectState.url = url; throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("@/lib/auth/server", () => ({
  auth: {signIn: {magicLink: async (input: {email: string; callbackURL?: string}) => {
    authState.input = input;
    return {data: {status: true}, error: null};
  }}},
}));
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => ({kind: "member", userId: "user-a"}), getActor: vi.fn()}));
vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {getById: async () => repoState.application, update: async () => repoState.application}}));
vi.mock("@/lib/db/repos/companies", () => ({companiesRepository: {
  createForApplication: async (_actor: unknown, _applicationId: string, input: Record<string, unknown>) => {repoState.createdCompanyInput = input; return repoState.company;},
  getById: async () => repoState.company,
  update: async () => repoState.company,
}}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {getById: async () => repoState.profile, update: vi.fn(), ensure: vi.fn()}}));
vi.mock("@/lib/membership/join-service", () => ({
  startJoin: vi.fn(),
  completeApplication: async (_actor: unknown, input: Record<string, unknown>) => {
    repoState.completedInput = input;
    return {applicationId: "application-a", next: "checkout", membershipId: "membership-a"};
  },
}));

import {requestMagicLink, saveCompany} from "@/app/[locale]/(join)/join/actions";

describe("join Server Actions", () => {
  beforeEach(() => {
    authState.input = null;
    redirectState.url = null;
    repoState.createdCompanyInput = null;
    repoState.completedInput = null;
    process.env.APP_URL = "https://m1-preview.example.test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://canonical-marketing.example.test";
  });

  it("returns a localized field error without calling auth for an invalid email", async () => {
    const form = new FormData();
    form.set("email", "not-an-email");

    await expect(requestMagicLink("zh-HK", "startup", {}, form)).resolves.toEqual({
      fieldErrors: {email: "localized:errors.email"},
    });
    expect(authState.input).toBeNull();
  });

  it("uses preview-correct APP_URL for a server-constructed continuation", async () => {
    const form = new FormData();
    form.set("email", "member@example.test");

    await expect(requestMagicLink("zh-HK", "startup", {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(authState.input).toEqual({
      email: "member@example.test",
      callbackURL: "https://m1-preview.example.test/zh/join?plan=startup",
    });
    expect(redirectState.url).toBe("/zh/join?plan=startup&sent=1");
  });

  it("creates a new actor-owned company and completes the scoped application", async () => {
    const form = new FormData();
    form.set("legalName", "Acme Limited");
    form.set("companyDisplayName", "Acme");
    form.set("website", "https://acme.example.test");

    await expect(saveCompany("en", "startup", "application-a", {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(repoState.createdCompanyInput).toMatchObject({legalName: "Acme Limited", displayName: "Acme"});
    expect(repoState.completedInput).toMatchObject({
      plan: "startup",
      applicationId: "application-a",
      company: {id: "company-a", legalName: "Acme Limited", displayName: "Acme"},
    });
    expect(redirectState.url).toBe("/join?plan=startup&application=application-a");
  });
});
