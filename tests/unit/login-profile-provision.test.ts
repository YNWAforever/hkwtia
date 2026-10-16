import {describe, expect, it, vi} from "vitest";
import {provisionVerifiedMember} from "@/lib/auth/login-provision";

describe("provider-session member provisioning boundary", () => {
  it("refuses a subject with an unverified email and never writes", async () => {
    const write = vi.fn();
    await expect(provisionVerifiedMember({user: {id: "u", email: "u@example.test", emailVerified: false}}, write)).resolves.toEqual({kind: "unverified"});
    expect(write).not.toHaveBeenCalled();
  });
  it("derives identity from the verified session without accepting a client role", async () => {
    const write = vi.fn(async () => ({kind: "ready" as const, identity: {profileId: "u", role: "member" as const}}));
    await expect(provisionVerifiedMember({user: {id: "u", email: "U@Example.test", emailVerified: true, name: "A"}}, write)).resolves.toMatchObject({kind: "ready"});
    expect(write).toHaveBeenCalledWith({authUserId: "u", email: "U@Example.test", displayName: "A"});
  });
});
