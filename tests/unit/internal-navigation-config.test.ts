import {describe, expect, it} from "vitest";

import {
  adminNavigationGroups,
  portalNavigationGroups,
  type InternalNavGroupConfig,
} from "@/config/internal-navigation";

// The configs are declared `as const satisfies readonly InternalNavGroupConfig[]` so nav components
// can derive a literal union of link ids (see PortalNavLinkId/AdminNavLinkId). That makes each config
// a tuple of distinctly-shaped group literals; widen back to InternalNavGroupConfig[] here so generic
// array methods like .flatMap/.find aren't asked to unify those heterogeneous literal shapes.
const portalGroups: readonly InternalNavGroupConfig[] = portalNavigationGroups;
const adminGroups: readonly InternalNavGroupConfig[] = adminNavigationGroups;

describe("internal navigation config", () => {
  it("defines exactly the Portal's 9 primary nav links, Dashboard first, no seats item", () => {
    const links = portalGroups.flatMap((group) => group.links);
    expect(links.map((link) => link.href)).toEqual([
      "/portal",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/directory",
      "/portal/events",
      "/portal/documents",
      "/portal/tools",
      "/portal/billing",
    ]);
    expect(links.some((link) => link.href.includes("seats"))).toBe(false);
  });

  it("keeps all 23 Admin routes in five operational groups", () => {
    expect(adminGroups.map((group) => group.id)).toEqual(["workspace", "members-organizations", "events", "communications-follow-up", "content-settings"]);
    const allLinks = adminGroups.flatMap((group) => group.links);
    expect(allLinks).toHaveLength(23);
    expect(new Set(allLinks.map((link) => link.href)).size).toBe(23);
    expect(adminGroups.find((group) => group.id === "members-organizations")?.links.map((link) => link.id)).toEqual(["members", "batches", "contacts", "segments", "listings", "profiles-review", "cohorts"]);
    expect(adminGroups.find((group) => group.id === "communications-follow-up")?.links.map((link) => link.id)).toEqual(["inbox", "campaigns", "templates", "automations"]);
  });

});
