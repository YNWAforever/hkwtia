import {describe, expect, it, vi} from "vitest";

const listPublished = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repos/partners", () => ({partnersRepository: {listPublished}}));

describe("loadLegacyNetworkGroups", () => {
  it("groups published partners into supporting/regional/media, dropping other categories", async () => {
    listPublished.mockResolvedValueOnce([
      {id: "1", name: "A", category: "supporting", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
      {id: "2", name: "B", category: "regional", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
      {id: "3", name: "C", category: "media", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
      {id: "4", name: "D", category: "sponsor", websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false},
    ]);
    const {loadLegacyNetworkGroups} = await import("@/lib/home/legacy-network-groups");

    const groups = await loadLegacyNetworkGroups("en");

    expect(groups.map((group) => group.category)).toEqual(["supporting", "regional", "media"]);
    expect(groups[0]!.partners.map((partner) => partner.id)).toEqual(["1"]);
    expect(groups.flatMap((group) => group.partners.map((partner) => partner.id))).not.toContain("4");
    expect(listPublished).toHaveBeenCalledWith("en", {limit: 100});
  });

  it("returns 3 empty groups when the read rejects", async () => {
    listPublished.mockRejectedValueOnce(new Error("db down"));
    const {loadLegacyNetworkGroups} = await import("@/lib/home/legacy-network-groups");

    const groups = await loadLegacyNetworkGroups("en");

    expect(groups.every((group) => group.partners.length === 0)).toBe(true);
  });
});
