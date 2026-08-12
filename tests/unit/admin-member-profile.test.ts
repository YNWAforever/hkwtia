import {describe, expect, it, vi} from "vitest";

import {
  getEditableMemberProfile,
  updateMemberProfile,
  type MemberProfileMutationDependencies,
} from "@/lib/db/repos/admin-member-profile";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};
const profileId = "profile-target";

const stored = {
  id: profileId,
  authUserId: "auth-target",
  email: "member@example.test",
  role: "member",
  displayName: "Existing Name",
  phone: null,
  jobTitle: null,
  locale: "en",
  consentMarketing: false,
  whatsappOptIn: false,
  directoryVisible: false,
  onboardingState: "profile",
} as never;

function harness(current: unknown = stored) {
  const audits: {action: string; metadata: Record<string, unknown>}[] = [];
  const transaction = {
    lockProfile: vi.fn(async () => current as never),
    updateProfile: vi.fn(async (_id: string, input: object) =>
      ({...(current as object), ...input}) as never),
    insertAudit: vi.fn(async (input: {action: string; metadata: Record<string, unknown>}) => {
      audits.push({action: input.action, metadata: input.metadata});
    }),
  };
  const dependencies = {
    transaction: (work: never) => (work as never as (t: unknown) => unknown)(transaction),
  } as unknown as MemberProfileMutationDependencies;
  return {dependencies, transaction, audits};
}

const valid = {displayName: "Corrected Name", phone: "+852 1234 5678", jobTitle: "CTO", locale: "zh-HK"};

describe("member profile editing", () => {
  it("corrects contact details and records which fields changed", async () => {
    const {dependencies, transaction, audits} = harness();

    await updateMemberProfile(staff, profileId, valid, dependencies);

    expect(transaction.updateProfile).toHaveBeenCalledWith(profileId, {
      displayName: "Corrected Name", phone: "+852 1234 5678", jobTitle: "CTO", locale: "zh-HK",
    });
    expect(audits).toEqual([{
      action: "profile.updated",
      metadata: {fields: ["displayName", "jobTitle", "locale", "phone"]},
    }]);
  });

  // The audit log is read far more widely than the profile itself, and these
  // are personal details.
  it("records which fields changed but never their values", async () => {
    const {dependencies, audits} = harness();

    await updateMemberProfile(staff, profileId, valid, dependencies);

    expect(JSON.stringify(audits)).not.toContain("+852 1234 5678");
    expect(JSON.stringify(audits)).not.toContain("Corrected Name");
  });

  it("refuses a non-admin before reading the row", async () => {
    const {dependencies, transaction} = harness();

    await expect(updateMemberProfile(member, profileId, valid, dependencies)).rejects.toThrow("FORBIDDEN");
    expect(transaction.lockProfile).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing changed", async () => {
    const {dependencies, transaction, audits} = harness();

    await updateMemberProfile(staff, profileId, {
      displayName: "Existing Name", phone: "", jobTitle: "", locale: "en",
    }, dependencies);

    expect(transaction.updateProfile).not.toHaveBeenCalled();
    expect(audits).toEqual([]);
  });

  // A cleared optional field must be storable as absent, not as "".
  it("stores a cleared optional field as null", async () => {
    const {dependencies, transaction} = harness({...(stored as object), phone: "+852 0000 0000"} as never);

    await updateMemberProfile(staff, profileId, {...valid, phone: "", jobTitle: ""}, dependencies);

    expect(transaction.updateProfile).toHaveBeenCalledWith(profileId, expect.objectContaining({
      phone: null, jobTitle: null,
    }));
  });

  // `.strict()` is what keeps the excluded columns unreachable: a tampered form
  // post carrying one of them fails the whole save rather than being ignored.
  it.each([
    ["role", "superadmin"],
    ["email", "attacker@example.test"],
    ["consentMarketing", "true"],
    ["whatsappOptIn", "true"],
    ["directoryVisible", "true"],
    ["authUserId", "auth-other"],
    ["onboardingState", "complete"],
  ])("rejects a save that tries to set %s", async (field, value) => {
    const {dependencies, transaction} = harness();

    await expect(updateMemberProfile(staff, profileId, {...valid, [field]: value}, dependencies))
      .rejects.toThrow();
    expect(transaction.updateProfile).not.toHaveBeenCalled();
  });

  it("rejects an unsupported locale", async () => {
    const {dependencies} = harness();

    await expect(updateMemberProfile(staff, profileId, {...valid, locale: "fr"}, dependencies))
      .rejects.toThrow();
  });

  it("returns null for an unknown profile", async () => {
    const {dependencies} = harness(null);

    await expect(updateMemberProfile(staff, profileId, valid, dependencies)).resolves.toBeNull();
  });
});

describe("editable member profile read", () => {
  it("requires an admin", async () => {
    await expect(getEditableMemberProfile(member, profileId, async () => null))
      .rejects.toThrow("FORBIDDEN");
  });

  it("returns null for a malformed id without querying", async () => {
    const load = vi.fn();

    await expect(getEditableMemberProfile(staff, "", load)).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
