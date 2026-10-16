import {describe, expect, it} from "vitest";

import {groupPublishedPartners, partnerCategoryOrder} from "@/lib/partners/public-groups";

const partner = (id: string, category: "supporting" | "regional" | "media" | "programme" | "sponsor") => ({
  id, name: `Partner ${id}`, category, websiteUrl: null, logoUrl: "/media/x.png", logoAlt: "x", displayOrder: 1, featured: false,
  relationshipStartsOn: null, relationshipEndsOn: null,
});

describe("groupPublishedPartners", () => {
  it("keeps the fixed category order and drops empty categories", () => {
    const groups = groupPublishedPartners([partner("1", "media"), partner("2", "supporting"), partner("3", "media")]);
    expect(partnerCategoryOrder).toEqual(["supporting", "regional", "media", "programme", "sponsor"]);
    expect(groups.map(({category, partners}) => [category, partners.length])).toEqual([["supporting", 1], ["media", 2]]);
  });

  it("returns no groups for no partners", () => {
    expect(groupPublishedPartners([])).toEqual([]);
  });
});
