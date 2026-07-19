import {describe, expect, it} from "vitest";

import {campaignDraftHref} from "@/lib/admin/campaigns";

describe("campaign draft URLs", () => {
  it("preserves every repeated Task 5 filter while replacing only the campaign draft", () => {
    const href = campaignDraftHref("/en/admin/segments", {
      tier: ["corporate", "patron"],
      status: ["active", "past_due"],
      sector: "fintech",
      campaignDraft: "11111111-1111-4111-8111-111111111111",
    }, "22222222-2222-4222-8222-222222222222");

    expect(href).toBe("/en/admin/segments?tier=corporate&tier=patron&status=active&status=past_due&sector=fintech&campaignDraft=22222222-2222-4222-8222-222222222222");
    const query = new URL(href, "https://example.test").searchParams;
    expect(query.getAll("tier")).toEqual(["corporate", "patron"]);
    expect(query.getAll("status")).toEqual(["active", "past_due"]);
  });
});
