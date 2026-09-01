import {describe, expect, it, vi} from "vitest";

import {listPublishedPartners, type PublicPartnerRow} from "@/lib/db/repos/partners";

const now = new Date("2026-08-29T12:00:00.000Z");

function row(websiteUrl: string): PublicPartnerRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    nameEn: "Approved partner",
    nameZhHk: "核准夥伴",
    category: "supporting",
    websiteUrl,
    logoMediaId: "22222222-2222-4222-8222-222222222222",
    displayOrder: 1,
    featured: false,
    relationshipStartsOn: null,
    relationshipEndsOn: null,
    relationshipConfirmedAt: now,
    logoRightsConfirmedAt: now,
    publishedAt: now,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    logoMediaUrl: "/api/media/33333333-3333-4333-8333-333333333333",
    logoMediaAltEn: "Approved logo",
    logoMediaAltZh: "核准標誌",
    logoMediaArchivedAt: null,
  };
}

describe("published partner website projection", () => {
  it.each(["http://partner.example.test/", "javascript:alert(1)", "//partner.example.test/", "ftp://partner.example.test/", "not a URL"])("removes unsafe injected website URL %j", async (websiteUrl) => {
    const [projected] = await listPublishedPartners("en", {asOf: now}, [row(websiteUrl)]);
    expect(projected?.websiteUrl).toBeNull();
  });

  it("applies the same HTTPS policy to database-reader projections", async () => {
    const list = vi.fn().mockResolvedValue([row("javascript:alert(1)")]);
    const [projected] = await listPublishedPartners("zh-HK", {asOf: now, limit: 12}, {list});

    expect(list).toHaveBeenCalledWith("2026-08-29", now, "zh-HK", 12);
    expect(projected).toMatchObject({name: "核准夥伴", websiteUrl: null});
  });

  it("keeps only canonical HTTPS URLs in the public DTO", async () => {
    const [projected] = await listPublishedPartners("en", {asOf: now}, [row("https://Example.COM/partner")]);
    expect(projected?.websiteUrl).toBe("https://example.com/partner");
  });
});
