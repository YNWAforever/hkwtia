import {beforeEach, describe, expect, it, vi} from "vitest";

const authState = vi.hoisted(() => ({input: null as null | {email: string; callbackURL?: string}}));
const redirectState = vi.hoisted(() => ({url: null as string | null}));
const repoState = vi.hoisted(() => ({
  application: {id: "application-a", applicantUserId: "user-a", companyId: null as string | null, planCode: "startup", currentStep: "company", status: "draft"},
  company: {id: "company-a", legalName: "Acme Limited", displayName: "Acme"},
  profile: {id: "user-a", displayName: "Member A", phone: null, jobTitle: null, locale: "en"},
  createdCompanyInput: null as null | Record<string, unknown>,
  updatedCompanyInput: null as null | Record<string, unknown>,
  completedInput: null as null | Record<string, unknown>,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `localized:${key}`,
}));
import {resetAuthRateLimits} from "@/lib/auth/rate-limit";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({"x-vercel-forwarded-for": "203.0.113.9"}),
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
vi.mock("@/lib/auth/actor", () => ({requireActor: async () => ({kind: "member", userId: "user-a", profileId: "user-a"}), getActor: vi.fn()}));
vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {getById: async () => repoState.application, update: async () => repoState.application}}));
vi.mock("@/lib/db/repos/companies", () => ({companiesRepository: {
  createForApplication: async (_actor: unknown, _applicationId: string, input: Record<string, unknown>) => {repoState.createdCompanyInput = input; return repoState.company;},
  getById: async () => repoState.company,
  update: async (_actor: unknown, _companyId: string, input: Record<string, unknown>) => {repoState.updatedCompanyInput = input; return repoState.company;},
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
    resetAuthRateLimits();
    authState.input = null;
    redirectState.url = null;
    repoState.createdCompanyInput = null;
    repoState.updatedCompanyInput = null;
    repoState.completedInput = null;
    repoState.application = {id: "application-a", applicantUserId: "user-a", companyId: null, planCode: "startup", currentStep: "company", status: "draft"};
    process.env.APP_URL = "https://m1-preview.example.test";
    process.env.NEXT_PUBLIC_SITE_URL = "https://canonical-marketing.example.test";
  });

  it("returns a localized field error without calling auth for an invalid email", async () => {
    const form = new FormData();
    form.set("email", "not-an-email");

    await expect(requestMagicLink("zh-HK", "startup", null, {}, form)).resolves.toEqual({
      fieldErrors: {email: "localized:errors.email"},
    });
    expect(authState.input).toBeNull();
  });

  it("uses preview-correct APP_URL for a server-constructed continuation", async () => {
    const form = new FormData();
    form.set("email", "member@example.test");

    await expect(requestMagicLink("zh-HK", "startup", "/portal", {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(authState.input).toEqual({
      email: "member@example.test",
      callbackURL: "https://m1-preview.example.test/zh/join?plan=startup&next=%2Fportal",
    });
    expect(redirectState.url).toBe("/zh/join?plan=startup&sent=1&next=%2Fportal");
  });

  it("carries a portal continuation through the auth request and sent state", async () => {
    const form = new FormData();
    form.set("email", "member@example.test");

    await expect(requestMagicLink("en", "community", "/portal/company", {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(authState.input?.callbackURL).toBe("https://m1-preview.example.test/join?plan=community&next=%2Fportal%2Fcompany");
    expect(redirectState.url).toBe("/join?plan=community&sent=1&next=%2Fportal%2Fcompany");
  });

  it("sends auth-only magic links for a portal continuation without creating a plan", async () => {
    const form = new FormData();
    form.set("email", "member@example.test");

    await expect(requestMagicLink("en", null, "/portal", {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(authState.input).toEqual({
      email: "member@example.test",
      callbackURL: "https://m1-preview.example.test/join?next=%2Fportal",
    });
    expect(redirectState.url).toBe("/join?sent=1&next=%2Fportal");
  });

  it("rejects an unscoped auth-only magic-link request", async () => {
    const form = new FormData();
    form.set("email", "member@example.test");

    await expect(requestMagicLink("en", null, null, {}, form)).resolves.toEqual({message: "localized:errors.auth"});
    expect(authState.input).toBeNull();
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
  it("denies a non-applicant company member before mutating an existing company", async () => {
    repoState.application = {
      ...repoState.application,
      applicantUserId: "user-b",
      companyId: "company-a",
    };
    const form = new FormData();
    form.set("legalName", "Attacker Rename Limited");
    form.set("companyDisplayName", "Attacker Rename");

    await expect(saveCompany("en", "startup", "application-a", {}, form)).resolves.toEqual({
      message: "localized:errors.save",
    });
    expect(repoState.updatedCompanyInput).toBeNull();
    expect(repoState.completedInput).toBeNull();
  });

  it("allows the applicant owner to resume and update an existing application company", async () => {
    repoState.application = {
      ...repoState.application,
      applicantUserId: "user-a",
      companyId: "company-a",
    };
    const form = new FormData();
    form.set("legalName", "Acme Updated Limited");
    form.set("companyDisplayName", "Acme Updated");

    await expect(saveCompany("en", "startup", "application-a", {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(repoState.updatedCompanyInput).toMatchObject({
      legalName: "Acme Updated Limited",
      displayName: "Acme Updated",
    });
    expect(repoState.completedInput).toMatchObject({
      applicationId: "application-a",
      company: {id: "company-a", legalName: "Acme Updated Limited", displayName: "Acme Updated"},
    });
  });

  it("refuses to keep mailing one address once the ceiling is reached", async () => {
    const form = new FormData();
    form.set("email", "flood@example.test");

    // The default per-address ceiling is 3 per 15 minutes.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      authState.input = null;
      await expect(requestMagicLink("en", "startup", null, {}, form)).rejects.toThrow("NEXT_REDIRECT");
      expect(authState.input).not.toBeNull();
    }

    authState.input = null;
    const state = await requestMagicLink("en", "startup", null, {}, form);

    expect(state).toEqual({message: "localized:errors.rateLimited"});
    // The decisive assertion: the provider was never asked to send.
    expect(authState.input).toBeNull();
  });
});