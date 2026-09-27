import {describe, expect, it, vi} from "vitest";
import {grantMembership} from "@/lib/db/repos/membership-grants";

const input = {target: {kind: "profile", profileId: "p-1"}, planCode: "community", effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z", reason: "Approved community scholarship"};
const superadmin = {kind: "superadmin", userId: "root", profileId: "root"} as const;

describe("finite grant authorization", () => {
  it("is disabled by default before loading a database", async () => {
    const load = vi.fn();
    await expect(grantMembership(superadmin, input, {loadDatabase: load})).rejects.toThrow("MEMBERSHIP_GRANTS_DISABLED");
    expect(load).not.toHaveBeenCalled();
  });
  it("rejects staff and unapproved company policy before loading a database", async () => {
    const load = vi.fn();
    await expect(grantMembership({kind: "staff", userId: "s", profileId: "s"}, input, {enabled: true, loadDatabase: load})).rejects.toThrow("FORBIDDEN");
    await expect(grantMembership(superadmin, {...input, target: {kind: "company", companyId: "11111111-1111-4111-8111-111111111111"}}, {enabled: true, loadDatabase: load})).rejects.toThrow("GRANT_COMPANY_POLICY_UNAPPROVED");
    expect(load).not.toHaveBeenCalled();
  });
});
