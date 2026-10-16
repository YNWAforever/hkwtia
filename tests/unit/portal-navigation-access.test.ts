import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({status: "active", fail: false}));
vi.mock("@/lib/db/repos/memberships", () => ({membershipsRepository: {list: async () => {
  if (state.fail) throw new Error("DATABASE_UNAVAILABLE");
  return [{status: state.status, companyId: null}];
}}}));

describe("navigation status does not become a gate on self service", () => {
  it.each([
    ["active", "ready"], ["past_due", "ready"], ["cancel_at_period_end", "ready"],
    ["pending_payment", "needs_payment"], ["pending_review", "under_review"], ["expired", "inactive"], ["cancelled", "inactive"],
  ])("explains %s using the same benefit state as the destination", async (status, expected) => {
    state.status = status; state.fail = false;
    const {getPortalNavigationAccess} = await import("@/lib/portal/navigation-access");
    await expect(getPortalNavigationAccess({kind: "member", userId: "auth", profileId: "profile"})).resolves.toEqual({status: expected});
  });

  it("reports unavailable navigation metadata without denying own profile or claiming inactivity", async () => {
    state.fail = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const {getPortalNavigationAccess} = await import("@/lib/portal/navigation-access");
      await expect(getPortalNavigationAccess({kind: "member", userId: "auth", profileId: "profile"})).resolves.toEqual({status: "unavailable"});
      expect(log).toHaveBeenCalledWith("PORTAL_NAVIGATION_ACCESS_UNAVAILABLE");
    } finally { log.mockRestore(); state.fail = false; }
  });
});
