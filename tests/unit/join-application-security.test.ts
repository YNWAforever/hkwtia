import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type {Actor} from "@/lib/membership/lifecycle";

const fixtures = vi.hoisted(() => ({
  a: "10000000-0000-4000-8000-000000000001",
  b: "10000000-0000-4000-8000-000000000002",
  missing: "10000000-0000-4000-8000-000000000003",
  actor: {kind: "member", userId: "auth-a", profileId: "member-a"} as Actor,
}));
const boundary = vi.hoisted(() => ({
  getApplication: vi.fn(),
  updateApplication: vi.fn(),
  createApplication: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  ensureProfile: vi.fn(),
  getCompany: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  linkContact: vi.fn(),
  complete: vi.fn(),
  attribute: vi.fn(),
  acceptPolicy: vi.fn(),
  redirect: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => `localized:${key}`}));
vi.mock("next/navigation", () => ({redirect: (url: string) => {
  boundary.redirect(url);
  throw new Error("NEXT_REDIRECT");
}}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: async () => {
    if (fixtures.actor.kind === "anonymous") throw new Error("UNAUTHORIZED");
    return fixtures.actor;
  },
}));
vi.mock("@/lib/auth/server", () => ({auth: {signIn: {magicLink: vi.fn()}}}));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...await original<typeof import("@/lib/db/repos/common")>(),
  getDb: boundary.getDb,
}));
vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {
  getById: boundary.getApplication, update: boundary.updateApplication,
  create: boundary.createApplication,
}}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {
  getById: boundary.getProfile, update: boundary.updateProfile, ensure: boundary.ensureProfile,
}}));
vi.mock("@/lib/db/repos/companies", () => ({companiesRepository: {
  getById: boundary.getCompany, createForApplication: boundary.createCompany, update: boundary.updateCompany,
}}));
vi.mock("@/lib/db/repos/contacts", () => ({
  contactWriterActor: () => ({kind: "contact-writer", userId: null, source: "import"}),
  contactsRepository: {linkProfile: boundary.linkContact},
}));
vi.mock("@/lib/db/repos/membership-policy-acceptances", () => ({recordPolicyAcceptance: boundary.acceptPolicy}));
vi.mock("@/lib/membership/join-invite-attribution", () => ({attributeJoinInvite: boundary.attribute}));
vi.mock("@/lib/membership/join-service", async (original) => ({
  ...await original<typeof import("@/lib/membership/join-service")>(),
  completeApplication: boundary.complete,
}));

import {resumeJoinAction, saveCompany, saveProfile} from "@/app/[locale]/(join)/join/actions";

function profileForm() {
  const form = new FormData();
  form.set("displayName", "Synthetic edited name");
  form.set("phone", "12345678");
  form.set("jobTitle", "Synthetic role");
  form.set("whatsappNumber", "+85291234567");
  form.set("userId", "member-b");
  form.set("profileId", "member-b");
  return form;
}

function expectNoWrites() {
  for (const write of [
    boundary.updateProfile, boundary.ensureProfile, boundary.linkContact,
    boundary.createApplication, boundary.updateApplication, boundary.createCompany,
    boundary.updateCompany, boundary.complete, boundary.attribute, boundary.acceptPolicy,
  ]) expect(write).not.toHaveBeenCalled();
}

describe("join application ownership at the server-action boundary (synthetic repositories)", () => {
  afterEach(() => {vi.unstubAllEnvs();});
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MEMBERSHIP_POLICY_ACCEPTANCE_ENABLED", "false");
    fixtures.actor = {kind: "member", userId: "auth-a", profileId: "member-a"};
    // Deliberately return B as well: repository company scope can legitimately
    // find another applicant, so the action must enforce applicant ownership.
    boundary.getApplication.mockImplementation(async (_actor: Actor, id: string) => {
      if (![fixtures.a, fixtures.b].includes(id)) return null;
      return {
        id, applicantUserId: id === fixtures.a ? "member-a" : "member-b",
        companyId: "company-shared", planCode: "startup", currentStep: "company", status: "draft",
      };
    });
    boundary.getProfile.mockResolvedValue({id: "member-a", email: "a@example.test", displayName: "Synthetic A"});
    boundary.updateProfile.mockResolvedValue({id: "member-a", email: "a@example.test"});
    boundary.linkContact.mockResolvedValue(null);
    boundary.getCompany.mockResolvedValue({id: "company-shared", legalName: "Synthetic company"});
    boundary.updateCompany.mockResolvedValue({id: "company-shared", legalName: "Synthetic edited company"});
    boundary.complete.mockResolvedValue({applicationId: fixtures.a, next: "review", membershipId: "synthetic-membership"});
    boundary.attribute.mockResolvedValue(undefined);
  });

  it.each(["en", "zh-HK"] as const)("rejects B, absent and malformed profile draft IDs identically before any write (%s)", async (locale) => {
    for (const id of [fixtures.b, fixtures.missing, "malformed-id"]) {
      const response = await saveProfile(locale, "startup", id, {}, profileForm());
      expect(response).toEqual({message: "localized:errors.save"});
      expect(JSON.stringify(response)).not.toMatch(/member-b|company-shared|APPLICATION_|auth-a/);
      expectNoWrites();
      expect(boundary.getProfile).not.toHaveBeenCalled();
    }
  });

  it("rejects a supplied draft with the wrong plan before profile/contact changes", async () => {
    expect(await saveProfile("en", "community", fixtures.a, {}, profileForm()))
      .toEqual({message: "localized:errors.save"});
    expectNoWrites();
  });

  it("allows A to save its own draft, using session profile identity instead of form IDs", async () => {
    await expect(saveProfile("en", "startup", fixtures.a, {}, profileForm()))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(boundary.updateProfile).toHaveBeenCalledExactlyOnceWith(
      fixtures.actor, "member-a", expect.objectContaining({displayName: "Synthetic edited name"}),
    );
    expect(boundary.linkContact).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), expect.objectContaining({profileId: "member-a", email: "a@example.test"}),
    );
    expect(boundary.updateApplication).toHaveBeenCalledExactlyOnceWith(fixtures.actor, fixtures.a, {currentStep: "company"});
    expect(boundary.createApplication).not.toHaveBeenCalled();
    expect(boundary.getApplication.mock.invocationCallOrder[0]).toBeLessThan(boundary.updateProfile.mock.invocationCallOrder[0]!);
  });

  it("keeps the first application flow working when there is no supplied draft", async () => {
    boundary.createApplication.mockResolvedValue({id: fixtures.a, currentStep: "profile", status: "draft"});
    await expect(saveProfile("en", "startup", null, {}, profileForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(boundary.updateProfile).toHaveBeenCalledTimes(1);
    expect(boundary.createApplication).toHaveBeenCalledExactlyOnceWith(fixtures.actor, {
      planCode: "startup", currentStep: "profile", status: "draft",
    });
  });

  it.each(["en", "zh-HK"] as const)("rejects B and absent company draft IDs without exposing or changing the shared company (%s)", async (locale) => {
    for (const id of [fixtures.b, fixtures.missing]) {
      const form = new FormData();
      form.set("legalName", "Synthetic edited company");
      expect(await saveCompany(locale, "startup", id, {}, form)).toEqual({message: "localized:errors.save"});
      expect(boundary.getCompany).not.toHaveBeenCalled();
      expectNoWrites();
    }
  });

  it("allows the applicant to update its own company draft", async () => {
    const form = new FormData();
    form.set("legalName", "Synthetic edited company");
    await expect(saveCompany("en", "startup", fixtures.a, {}, form)).rejects.toThrow("NEXT_REDIRECT");
    expect(boundary.updateCompany).toHaveBeenCalledExactlyOnceWith(
      fixtures.actor, "company-shared", expect.objectContaining({legalName: "Synthetic edited company"}),
    );
    expect(boundary.complete).toHaveBeenCalledOnce();
  });

  it("rejects foreign and absent resume IDs with the same safe contract and no writes", async () => {
    for (const id of [fixtures.b, fixtures.missing]) {
      const form = new FormData();
      form.set("locale", "en"); form.set("plan", "startup"); form.set("applicationId", id);
      await expect(resumeJoinAction(form)).rejects.toThrow("APPLICATION_NOT_FOUND");
      expectNoWrites();
    }
  });

  it("keeps the real repository FORBIDDEN miss contract for invisible and absent rows, without writes", async () => {
    const actual = await vi.importActual<typeof import("@/lib/db/repos/applications")>("@/lib/db/repos/applications");
    const limit = vi.fn().mockResolvedValue([]);
    boundary.getDb.mockResolvedValue({
      select: () => ({from: () => ({where: () => ({limit})})}),
    });
    boundary.getApplication.mockImplementation(actual.applicationsRepository.getById);
    for (const id of [fixtures.b, fixtures.missing]) {
      expect(await saveProfile("en", "startup", id, {}, profileForm())).toEqual({message: "localized:errors.save"});
      const company = new FormData(); company.set("legalName", "Synthetic company");
      expect(await saveCompany("en", "startup", id, {}, company)).toEqual({message: "localized:errors.save"});
      const resume = new FormData(); resume.set("plan", "startup"); resume.set("applicationId", id);
      await expect(resumeJoinAction(resume)).rejects.toThrow("FORBIDDEN");
      expectNoWrites();
      expect(boundary.getProfile).not.toHaveBeenCalled();
    }
    expect(limit).toHaveBeenCalledTimes(6);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("resumes the applicant's draft without creating or changing it", async () => {
    const form = new FormData();
    form.set("locale", "en"); form.set("plan", "startup"); form.set("applicationId", fixtures.a);
    await expect(resumeJoinAction(form)).rejects.toThrow("NEXT_REDIRECT");
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith(`/join/company?plan=startup&application=${fixtures.a}`);
    expectNoWrites();
  });

  it.each(["anonymous", "logged-out", "staff"] as const)("rejects %s profile, company and resume calls before repository access", async (identity) => {
    fixtures.actor = identity === "staff"
      ? {kind: "staff", userId: "auth-staff", profileId: "staff"}
      : {kind: "anonymous", userId: null};
    const response = await saveProfile("en", "startup", fixtures.a, {}, profileForm());
    expect(response).toEqual({message: identity === "staff" ? "localized:errors.auth" : "localized:errors.save"});
    const company = new FormData(); company.set("legalName", "Synthetic");
    expect(await saveCompany("en", "startup", fixtures.a, {}, company)).toEqual(response);
    const resume = new FormData(); resume.set("plan", "startup"); resume.set("applicationId", fixtures.a);
    await expect(resumeJoinAction(resume)).rejects.toThrow("UNAUTHORIZED");
    expect(boundary.getApplication).not.toHaveBeenCalled();
    expect(boundary.getProfile).not.toHaveBeenCalled();
    expectNoWrites();
  });
});
