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
  it("defines exactly the Portal's 8 primary nav links, Dashboard first, no seats item", () => {
    const links = portalGroups.flatMap((group) => group.links);
    expect(links.map((link) => link.href)).toEqual([
      "/portal",
      "/portal/profile",
      "/portal/company",
      "/portal/company/listing",
      "/portal/directory",
      "/portal/events",
      "/portal/documents",
      "/portal/billing",
    ]);
    expect(links.some((link) => link.href.includes("seats"))).toBe(false);
  });

  it("groups the Admin's 16 nav links into exactly Workspace/Content/Operations", () => {
    expect(adminGroups.map((group) => group.id)).toEqual(["workspace", "content", "operations"]);
    const allLinks = adminGroups.flatMap((group) => group.links);
    // Phase A (audit F2) added the inbox and staff-task queue to the workspace group.
    expect(allLinks).toHaveLength(18);
    const workspace = adminGroups.find((group) => group.id === "workspace")!;
    expect(workspace.links.map((link) => link.id)).toEqual(["dashboard", "members", "at-risk", "inbox", "tasks", "segments"]);
  });
});
