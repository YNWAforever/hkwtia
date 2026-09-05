import {describe, expect, it} from "vitest";

import {adminNavigationGroups, portalNavigationGroups} from "@/config/internal-navigation";

describe("internal navigation config", () => {
  it("defines exactly the Portal's 8 primary nav links, Dashboard first, no seats item", () => {
    const links = portalNavigationGroups.flatMap((group) => group.links);
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
    expect(adminNavigationGroups.map((group) => group.id)).toEqual(["workspace", "content", "operations"]);
    const allLinks = adminNavigationGroups.flatMap((group) => group.links);
    expect(allLinks).toHaveLength(16);
    const workspace = adminNavigationGroups.find((group) => group.id === "workspace")!;
    expect(workspace.links.map((link) => link.id)).toEqual(["dashboard", "members", "at-risk", "segments"]);
  });
});
